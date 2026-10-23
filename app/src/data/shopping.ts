// 购物清单操作，对应 SPEC §5.1–§5.3、§5.7。
import { db } from '../db/db';
import type { Food, Location, PantryItem, PurchaseStat, ShoppingItem } from '../db/types';
import { todayISO } from '../logic/dates';
import { uid } from '../logic/id';
import { buildPreview, type PlannedDish, type PreviewLine } from '../logic/shopping';
import type { StockChange } from '../logic/stock';
import { applyStockChanges, rollbackTxn, setStapleStock } from './pantry';
import { getSettings } from './settings';

export type Undo = () => Promise<void>;

export async function foodMap(): Promise<Map<string, Food>> {
  return new Map((await db.foods.toArray()).map((f) => [f.id, f]));
}

/** 生成清单前的预览 */
export async function previewForRange(start: string, end: string): Promise<PreviewLine[]> {
  const entries = (await db.plan.where('date').between(start, end, true, true).toArray()).filter(
    (e) => e.status === 'planned',
  );
  const recipes = new Map((await db.recipes.bulkGet([...new Set(entries.map((e) => e.recipeId))])).filter(Boolean).map((r) => [r!.id, r!]));
  const dishes: PlannedDish[] = entries.filter((e) => recipes.has(e.recipeId)).map((entry) => ({ entry, recipe: recipes.get(entry.recipeId)! }));
  const settings = await getSettings();
  return buildPreview(dishes, await foodMap(), await db.pantry.toArray(), settings.sectionOrder);
}

/**
 * 写入清单：替换掉之前从菜单生成、还没买的条目（SPEC §5.1 第 8 条），
 * 已买的量从新的需求里扣掉；没勾选的"已有"条目折叠保存。
 */
export async function applyPreview(lines: PreviewLine[], selected: Set<string>): Promise<number> {
  const foods = await foodMap();
  let added = 0;
  await db.transaction('rw', db.shopping, async () => {
    const all = await db.shopping.toArray();
    await db.shopping.bulkDelete(all.filter((i) => i.origin === 'plan' && !i.bought).map((i) => i.id));
    const bought = new Map<string, number>();
    for (const i of all) if (i.bought && i.foodId && i.qty != null) bought.set(i.foodId, (bought.get(i.foodId) ?? 0) + i.qty);
    const now = Date.now();
    for (const line of lines) {
      const food = foods.get(line.foodId);
      if (!food) continue;
      const base = {
        foodId: line.foodId, unit: food.baseUnit, section: food.section, sources: line.sources,
        need: line.need, have: line.have, bought: false, origin: 'plan' as const,
        unconvertible: line.unconvertible, createdAt: now,
      };
      // 已经因为别的原因在清单里（手动加的、常备品快没了等）：不重复加，只记上菜谱来源
      const other = all.find((i) => !i.bought && i.state === 'need' && i.origin !== 'plan' && i.foodId === line.foodId);
      if (other) {
        if (selected.has(line.foodId)) {
          const fresh = new Set(line.sources.map((s) => s.planEntryId));
          await db.shopping.put({ ...other, sources: [...other.sources.filter((s) => !s.planEntryId || !fresh.has(s.planEntryId)), ...line.sources] });
        }
        continue;
      }
      if (selected.has(line.foodId)) {
        let qty = line.state === 'need' ? line.buy : line.need;
        if (qty != null) {
          qty -= bought.get(line.foodId) ?? 0;
          if (qty <= 1e-9) continue;
        }
        await db.shopping.put({ ...base, id: uid('s_'), qty, state: 'need' });
        added++;
      } else if (line.state === 'have') {
        await db.shopping.put({ ...base, id: uid('s_'), qty: undefined, state: 'have' });
      }
    }
  });
  return added;
}

export async function toggleBought(id: string): Promise<Undo> {
  const item = await db.shopping.get(id);
  if (!item) return async () => {};
  await db.shopping.put({ ...item, bought: !item.bought, boughtAt: item.bought ? undefined : Date.now() });
  return async () => {
    await db.shopping.put(item);
  };
}

export async function removeShoppingItem(id: string): Promise<Undo> {
  const item = await db.shopping.get(id);
  if (!item) return async () => {};
  await db.shopping.delete(id);
  return async () => {
    await db.shopping.put(item);
  };
}

/** "家里已有"的条目改成仍然要买 */
export async function buyAnyway(id: string): Promise<void> {
  const item = await db.shopping.get(id);
  if (!item) return;
  await db.shopping.put({ ...item, state: 'need', qty: item.need });
}

/** 手动添加；同一种食材已经在待买里就不重复加，返回 null */
export async function addManualItem(p: { foodId?: string; text?: string; qty?: number }): Promise<Undo | null> {
  let section = '其他';
  let unit: string | undefined;
  if (p.foodId) {
    const exists = await db.shopping.where('foodId').equals(p.foodId).filter((i) => !i.bought && i.state === 'need').first();
    if (exists) return null;
    const food = await db.foods.get(p.foodId);
    section = food?.section ?? section;
    unit = food?.baseUnit;
    // 如果它之前被折叠在"家里已有"里，改为要买
    const have = await db.shopping.where('foodId').equals(p.foodId).filter((i) => !i.bought && i.state === 'have').first();
    if (have) {
      await db.shopping.put({ ...have, state: 'need', qty: p.qty ?? have.need, origin: 'manual' });
      return async () => {
        await db.shopping.put(have);
      };
    }
  }
  const item: ShoppingItem = {
    id: uid('s_'), foodId: p.foodId, text: p.foodId ? undefined : p.text?.trim(), qty: p.qty, unit, section,
    sources: [], state: 'need', bought: false, origin: 'manual', createdAt: Date.now(),
  };
  await db.shopping.add(item);
  return async () => {
    await db.shopping.delete(item.id);
  };
}

/** 加一条，来源可以是菜谱缺料、常备品、扔掉后再买 */
export async function addOriginItem(foodId: string, origin: ShoppingItem['origin'], qty?: number, recipeId?: string): Promise<string | null> {
  const exists = await db.shopping.where('foodId').equals(foodId).filter((i) => !i.bought && i.state === 'need').first();
  if (exists) return null;
  const food = await db.foods.get(foodId);
  const item: ShoppingItem = {
    id: uid('s_'), foodId, qty, unit: food?.baseUnit, section: food?.section ?? '其他',
    sources: recipeId ? [{ recipeId, qty: qty ?? 0 }] : [], state: 'need', bought: false, origin, createdAt: Date.now(),
  };
  await db.shopping.add(item);
  return item.id;
}

export interface StockInRow {
  item: ShoppingItem;
  qty?: number;
  location: Location;
  expiresAt?: string;
}

/**
 * 已买的东西放进冰箱。返回撤销函数。
 * listIds：哪些条目真实存在于购物清单里（入库后删除、撤销时还原）；
 * 拍照入库时清单外的东西是临时条目，不在其中。默认全部都是。
 */
export async function stockIn(rows: StockInRow[], opts: { source?: 'list' | 'scan'; listIds?: Set<string> } = {}): Promise<Undo> {
  const inList = (r: StockInRow) => !opts.listIds || opts.listIds.has(r.item.id);
  const foods = await foodMap();
  const prevFoods: Food[] = [];
  const prevStats = new Map<string, PurchaseStat | undefined>();
  let txnId = '';
  await db.transaction('rw', [db.shopping, db.pantry, db.pantryEvents, db.foods, db.purchaseStats], async () => {
    const changes: StockChange[] = [];
    const today = todayISO();
    for (const row of rows) {
      const food = row.item.foodId ? foods.get(row.item.foodId) : undefined;
      if (!food) continue;
      if (food.kind === 'staple') {
        const existing = await db.pantry.where('foodId').equals(food.id).filter((p) => p.stock != null).first();
        const after: PantryItem = existing
          ? { ...existing, stock: 'have' }
          : { id: uid('p_'), foodId: food.id, stock: 'have', location: food.defaultLocation, addedAt: today, extendedTimes: 0 };
        changes.push({ foodId: food.id, delta: 0, before: existing ?? null, after });
      } else {
        const after: PantryItem = {
          id: uid('p_'), foodId: food.id, qty: row.qty, location: row.location, expiresAt: row.expiresAt,
          addedAt: today, extendedTimes: 0,
        };
        changes.push({ foodId: food.id, delta: row.qty ?? 0, before: null, after });
        if (row.location !== food.defaultLocation) {
          prevFoods.push(food);
          await db.foods.put({ ...food, defaultLocation: row.location });
        }
      }
      const stat = await db.purchaseStats.get(food.id);
      prevStats.set(food.id, stat);
      await db.purchaseStats.put({ foodId: food.id, count: (stat?.count ?? 0) + 1, lastAt: Date.now() });
    }
    txnId = await applyStockChanges(changes, 'stockin', opts.source ?? 'list');
    await db.shopping.bulkDelete(rows.filter(inList).map((r) => r.item.id));
  });
  return async () => {
    await db.transaction('rw', [db.shopping, db.pantry, db.pantryEvents, db.foods, db.purchaseStats], async () => {
      await rollbackTxn(txnId);
      await db.shopping.bulkPut(rows.filter(inList).map((r) => r.item));
      await db.foods.bulkPut(prevFoods);
      for (const [foodId, stat] of prevStats) {
        if (stat) await db.purchaseStats.put(stat);
        else await db.purchaseStats.delete(foodId);
      }
    });
  };
}

/** 常备品切换"有 / 快没了"，并联动购物清单（SPEC §5.7） */
export async function toggleStaple(foodId: string, to: 'have' | 'low'): Promise<Undo> {
  let txnId = '';
  let addedId: string | null = null;
  let removed: ShoppingItem[] = [];
  await db.transaction('rw', [db.shopping, db.pantry, db.pantryEvents, db.foods], async () => {
    txnId = await setStapleStock(foodId, to);
    if (to === 'low') {
      addedId = await addOriginItem(foodId, 'staple');
    } else {
      removed = await db.shopping
        .where('foodId').equals(foodId)
        .filter((i) => !i.bought && i.origin === 'staple')
        .toArray();
      await db.shopping.bulkDelete(removed.map((i) => i.id));
    }
  });
  return async () => {
    await db.transaction('rw', [db.shopping, db.pantry, db.pantryEvents], async () => {
      await rollbackTxn(txnId);
      if (addedId) await db.shopping.delete(addedId);
      if (removed.length) await db.shopping.bulkPut(removed);
    });
  };
}
