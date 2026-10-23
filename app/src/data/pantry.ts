// 库存操作。所有改动都记流水（PantryEvent），同一次操作共用一个 txnId，撤销时整体回滚。
import { db } from '../db/db';
import type { Location, PantryEvent, PantryItem, PantryReason } from '../db/types';
import { addDays, todayISO } from '../logic/dates';
import { defaultExpiry } from '../logic/expiry';
import type { StockChange } from '../logic/stock';
import { uid } from '../logic/id';

/** 写入一批库存改动，返回 txnId */
export async function applyStockChanges(
  changes: StockChange[],
  reason: PantryReason,
  source?: PantryEvent['source'],
): Promise<string> {
  const txnId = uid('t_');
  const at = Date.now();
  await db.transaction('rw', db.pantry, db.pantryEvents, async () => {
    for (const [i, c] of changes.entries()) {
      if (c.after) await db.pantry.put(c.after);
      else if (c.before) await db.pantry.delete(c.before.id);
      await db.pantryEvents.add({
        // id 带序号，回滚时按相反顺序还原
        id: `${txnId}_${String(i).padStart(4, '0')}`, txnId, foodId: c.foodId, delta: c.delta, reason, source,
        before: c.before, after: c.after, at,
      });
    }
  });
  return txnId;
}

/** 撤销一次操作的所有库存改动 */
export async function rollbackTxn(txnId: string): Promise<void> {
  await db.transaction('rw', db.pantry, db.pantryEvents, async () => {
    const events = await db.pantryEvents.where('txnId').equals(txnId).toArray();
    events.sort((a, b) => (a.id < b.id ? 1 : -1));
    for (const e of events) {
      if (e.before) await db.pantry.put(e.before);
      else if (e.after) await db.pantry.delete(e.after.id);
    }
    await db.pantryEvents.bulkDelete(events.map((e) => e.id));
  });
}

export async function addPantryItem(p: {
  foodId: string;
  qty?: number;
  location: Location;
  expiresAt?: string;
}): Promise<string> {
  const item: PantryItem = {
    id: uid('p_'), foodId: p.foodId, qty: p.qty, location: p.location, expiresAt: p.expiresAt,
    addedAt: todayISO(), extendedTimes: 0,
  };
  return applyStockChanges([{ foodId: p.foodId, delta: p.qty ?? 0, before: null, after: item }], 'stockin', 'manual');
}

export async function updatePantryItem(before: PantryItem, after: PantryItem): Promise<string> {
  return applyStockChanges([{ foodId: before.foodId, delta: (after.qty ?? 0) - (before.qty ?? 0), before, after }], 'manual', 'manual');
}

export async function removePantryItem(item: PantryItem, reason: 'used' | 'tossed' | 'manual'): Promise<string> {
  return applyStockChanges([{ foodId: item.foodId, delta: -(item.qty ?? 0), before: item, after: null }], reason);
}

export async function extendPantryItem(item: PantryItem, days: number): Promise<string> {
  const base = item.expiresAt && item.expiresAt > todayISO() ? item.expiresAt : todayISO();
  const after = { ...item, expiresAt: addDays(base, days), extendedTimes: item.extendedTimes + 1 };
  return applyStockChanges([{ foodId: item.foodId, delta: 0, before: item, after }], 'extend');
}

/** 常备品：有 / 快没了。没有记录时新建一条 */
export async function setStapleStock(foodId: string, stock: 'have' | 'low'): Promise<string> {
  const records = await db.pantry.where('foodId').equals(foodId).filter((p) => p.stock != null).toArray();
  const food = await db.foods.get(foodId);
  if (records.length) {
    const [keep, ...dupes] = records;
    // 顺便清掉重复的记录，每种常备品只留一条
    return applyStockChanges(
      [
        { foodId, delta: 0, before: keep, after: { ...keep, stock } },
        ...dupes.map((d) => ({ foodId, delta: 0, before: d, after: null })),
      ],
      'manual',
    );
  }
  const item: PantryItem = {
    id: uid('p_'), foodId, stock, location: food?.defaultLocation ?? 'room', addedAt: todayISO(), extendedTimes: 0,
  };
  return applyStockChanges([{ foodId, delta: 0, before: null, after: item }], 'manual');
}

export function expiryFor(food: { shelfDays: Partial<Record<Location, number>> }, location: Location): string | undefined {
  return defaultExpiry(food, location, todayISO());
}
