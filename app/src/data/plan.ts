// 菜单操作，对应 SPEC §5.2、§5.4。
import { db } from '../db/db';
import type { MealLog, MealPlanEntry, ShoppingItem, Slot } from '../db/types';
import { uid } from '../logic/id';
import { recipeNutrition } from '../logic/nutrition';
import { applyPlanChange } from '../logic/shopping';
import { deductionForRecipe } from '../logic/stock';
import { applyStockChanges, rollbackTxn } from './pantry';
import { foodMap, type Undo } from './shopping';

export async function addToPlan(date: string, slot: Slot, recipeIds: string[], servings?: number): Promise<Undo> {
  const existing = await db.plan.where('date').equals(date).filter((e) => e.slot === slot).count();
  const recipes = await db.recipes.bulkGet(recipeIds);
  const entries: MealPlanEntry[] = recipes.filter(Boolean).map((r, i) => ({
    id: uid('m_'), date, slot, recipeId: r!.id, servings: servings ?? r!.servings, order: existing + i, status: 'planned',
  }));
  await db.plan.bulkAdd(entries);
  return async () => {
    await db.plan.bulkDelete(entries.map((e) => e.id));
  };
}

/** 菜单变动后同步购物清单，返回改动前的条目用于撤销 */
async function syncShopping(entryId: string, factor: number): Promise<ShoppingItem[]> {
  const items = await db.shopping.toArray();
  const { update, remove } = applyPlanChange(items, entryId, factor);
  const touched = new Set([...update.map((i) => i.id), ...remove]);
  const before = items.filter((i) => touched.has(i.id));
  await db.shopping.bulkPut(update);
  await db.shopping.bulkDelete(remove);
  return before;
}

export async function removePlanEntry(id: string): Promise<Undo> {
  let entry: MealPlanEntry | undefined;
  let before: ShoppingItem[] = [];
  await db.transaction('rw', db.plan, db.shopping, async () => {
    entry = await db.plan.get(id);
    if (!entry) return;
    await db.plan.delete(id);
    before = await syncShopping(id, 0);
  });
  return async () => {
    await db.transaction('rw', db.plan, db.shopping, async () => {
      if (entry) await db.plan.put(entry);
      await db.shopping.bulkPut(before);
    });
  };
}

export async function setPlanServings(id: string, servings: number): Promise<void> {
  await db.transaction('rw', db.plan, db.shopping, async () => {
    const entry = await db.plan.get(id);
    if (!entry || entry.servings === servings) return;
    await syncShopping(id, servings / entry.servings);
    await db.plan.put({ ...entry, servings });
  });
}

/** "按计划吃了"：按菜单份数扣库存，记 1 份热量（SPEC §5.4 第 7 条） */
export async function markEaten(entryId: string): Promise<void> {
  const foods = await foodMap();
  await db.transaction('rw', [db.plan, db.recipes, db.pantry, db.pantryEvents, db.mealLogs], async () => {
    const entry = await db.plan.get(entryId);
    if (!entry || entry.status !== 'planned') return;
    const recipe = await db.recipes.get(entry.recipeId);
    if (!recipe) return;
    const changes = deductionForRecipe(recipe, entry.servings, foods, await db.pantry.toArray());
    const txnId = await applyStockChanges(changes, 'eaten');
    const n = recipeNutrition(recipe, foods).perServing;
    const log: MealLog = {
      id: uid('l_'), date: entry.date, slot: entry.slot, source: 'recipe', recipeId: recipe.id,
      planEntryId: entry.id, servingsEaten: 1,
      items: [{ name: recipe.title, kcalMin: n.kcal, kcalMax: n.kcal, protein: n.protein, fat: n.fat, carb: n.carb }],
      adjustments: [], kcal: n.kcal, estimated: false, createdAt: Date.now(),
    };
    await db.mealLogs.add(log);
    await db.plan.put({ ...entry, status: 'eaten', mealLogId: log.id, stockTxnId: txnId });
    await db.recipes.put({ ...recipe, cookedCount: recipe.cookedCount + 1, lastCookedAt: Date.now() });
  });
}

/** 改"我吃了几份"：只改热量记录，不动库存 */
export async function setEatenServings(entryId: string, servings: number): Promise<void> {
  const entry = await db.plan.get(entryId);
  if (!entry?.mealLogId) return;
  const log = await db.mealLogs.get(entry.mealLogId);
  if (!log) return;
  const k = servings / (log.servingsEaten || 1);
  const items = log.items.map((i) => ({
    ...i,
    kcalMin: i.kcalMin * k, kcalMax: i.kcalMax * k,
    protein: i.protein != null ? i.protein * k : undefined,
    fat: i.fat != null ? i.fat * k : undefined,
    carb: i.carb != null ? i.carb * k : undefined,
  }));
  await db.mealLogs.put({ ...log, servingsEaten: servings, items, kcal: log.kcal * k });
}

export async function undoEaten(entryId: string): Promise<void> {
  const entry = await db.plan.get(entryId);
  if (!entry || entry.status === 'planned') return;
  if (entry.stockTxnId) await rollbackTxn(entry.stockTxnId);
  await db.transaction('rw', db.plan, db.mealLogs, db.recipes, async () => {
    if (entry.mealLogId) await db.mealLogs.delete(entry.mealLogId);
    await db.plan.put({ ...entry, status: 'planned', mealLogId: undefined, stockTxnId: undefined });
    const recipe = await db.recipes.get(entry.recipeId);
    if (recipe) await db.recipes.put({ ...recipe, cookedCount: Math.max(0, recipe.cookedCount - 1) });
  });
}

/** 复制某些饮食记录到今天 */
export async function copyLogs(logIds: string[], toDate: string): Promise<Undo> {
  const logs = (await db.mealLogs.bulkGet(logIds)).filter(Boolean) as MealLog[];
  const copies = logs.map((l) => ({
    ...l, id: uid('l_'), date: toDate, source: 'copy' as const, planEntryId: undefined, createdAt: Date.now(),
  }));
  await db.mealLogs.bulkAdd(copies);
  return async () => {
    await db.mealLogs.bulkDelete(copies.map((c) => c.id));
  };
}
