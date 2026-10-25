// 烹饪进度（PRD P08）。同一时间最多一条，存在本地数据库里，切出去、关掉应用都不会丢。
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { CookSession, MealLog, MealPlanEntry, Recipe, Slot } from '../db/types';
import { todayISO } from '../logic/dates';
import { uid } from '../logic/id';
import { recipeNutrition } from '../logic/nutrition';
import { planDeduction } from '../logic/stock';
import { applyStockChanges, rollbackTxn } from './pantry';
import { foodMap, type Undo } from './shopping';

/** 当前的烹饪进度；还在读取时是 null，没有进度时是 undefined */
export function useCookSession(): CookSession | undefined | null {
  return useLiveQuery(() => db.cookSessions.toCollection().first(), [], null as CookSession | undefined | null);
}

/** 开始做一道菜，会替换掉原来的进度。没指定菜单条目时，自动关联今天菜单里还没做的同一道菜 */
export async function startCook(recipeId: string, servings: number, planEntryId?: string): Promise<void> {
  await db.transaction('rw', db.cookSessions, db.plan, async () => {
    let entryId = planEntryId;
    if (!entryId) {
      const today = await db.plan.where('date').equals(todayISO()).toArray();
      entryId = today.find((e) => e.recipeId === recipeId && e.status === 'planned')?.id;
    }
    const now = Date.now();
    await db.cookSessions.clear();
    await db.cookSessions.add({
      id: uid('c_'), recipeId, planEntryId: entryId, servings, stepIndex: 0, checkedLines: [], timers: [],
      startedAt: now, updatedAt: now,
    });
  });
}

export async function updateCook(id: string, patch: Partial<Pick<CookSession, 'stepIndex' | 'checkedLines' | 'timers'>>): Promise<void> {
  await db.cookSessions.update(id, { ...patch, updatedAt: Date.now() });
}

/** 结束这次烹饪（不记录），返回撤销 */
export async function endCook(): Promise<Undo> {
  const sessions = await db.cookSessions.toArray();
  await db.cookSessions.clear();
  return async () => {
    await db.cookSessions.bulkPut(sessions);
  };
}

export interface FinishInput {
  session: CookSession;
  /** 每种食材要扣多少（基础单位），用户在预览里可以改 */
  amounts: Map<string, number>;
  servingsEaten: number;
  date: string;
  slot: Slot;
}

/** "做完了"：扣库存、记热量、做过次数 +1、菜单标为已做、结束进度。返回撤销（连进度一起恢复） */
export async function finishCook({ session, amounts, servingsEaten, date, slot }: FinishInput): Promise<Undo> {
  const foods = await foodMap();
  let txnId = '';
  let logId = '';
  let recipeBefore: Recipe | undefined;
  let entryBefore: MealPlanEntry | undefined;
  await db.transaction('rw', [db.plan, db.recipes, db.pantry, db.pantryEvents, db.mealLogs, db.cookSessions], async () => {
    const recipe = await db.recipes.get(session.recipeId);
    if (!recipe) throw new Error('这道菜谱已经被删除了');
    recipeBefore = recipe;
    const pantry = await db.pantry.toArray();
    const changes = [...amounts].flatMap(([foodId, amount]) =>
      amount > 0 ? planDeduction(pantry.filter((p) => p.foodId === foodId), amount) : [],
    );
    txnId = await applyStockChanges(changes, 'cook');

    const entry = session.planEntryId ? await db.plan.get(session.planEntryId) : undefined;
    // 菜单里这一条已经记过（比如先点了"按计划吃了"），就不再关联，单独记一条
    const linked = entry?.status === 'planned' ? entry : undefined;
    const n = recipeNutrition(recipe, foods).perServing;
    const k = servingsEaten;
    const log: MealLog = {
      id: uid('l_'), date: linked?.date ?? date, slot: linked?.slot ?? slot, source: 'recipe', recipeId: recipe.id,
      planEntryId: linked?.id, servingsEaten: k,
      items: [{ name: recipe.title, kcalMin: n.kcal * k, kcalMax: n.kcal * k, protein: n.protein * k, fat: n.fat * k, carb: n.carb * k }],
      adjustments: [], kcal: n.kcal * k, estimated: false, createdAt: Date.now(),
    };
    logId = log.id;
    await db.mealLogs.add(log);
    if (linked) {
      entryBefore = linked;
      await db.plan.put({ ...linked, status: 'cooked', mealLogId: log.id, stockTxnId: txnId });
    }
    await db.recipes.put({ ...recipe, cookedCount: recipe.cookedCount + 1, lastCookedAt: Date.now() });
    await db.cookSessions.clear();
  });
  return async () => {
    await rollbackTxn(txnId);
    await db.transaction('rw', db.plan, db.mealLogs, db.recipes, db.cookSessions, async () => {
      await db.mealLogs.delete(logId);
      if (entryBefore) await db.plan.put(entryBefore);
      const now = await db.recipes.get(session.recipeId);
      if (now && recipeBefore) {
        await db.recipes.put({ ...now, cookedCount: recipeBefore.cookedCount, lastCookedAt: recipeBefore.lastCookedAt });
      }
      await db.cookSessions.put(session);
    });
  };
}
