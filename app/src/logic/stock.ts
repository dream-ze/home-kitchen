// 扣库存，对应 SPEC §5.4。纯函数：只算出要改哪些记录，由数据层去写入。
import type { Food, PantryItem, Recipe } from '../db/types';
import { toBase } from './units';

export interface StockChange {
  foodId: string;
  delta: number;
  before: PantryItem | null;
  after: PantryItem | null;
}

function byExpiry(a: PantryItem, b: PantryItem): number {
  const ea = a.expiresAt ?? '9999-12-31';
  const eb = b.expiresAt ?? '9999-12-31';
  if (ea !== eb) return ea < eb ? -1 : 1;
  return a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0;
}

/** 从某种食材的库存里扣掉 amount（基础单位），先扣最早到期的；不够就扣到 0 为止 */
export function planDeduction(items: PantryItem[], amount: number): StockChange[] {
  const changes: StockChange[] = [];
  let left = amount;
  const sorted = items.filter((i) => i.qty != null && i.qty > 0).sort(byExpiry);
  for (const item of sorted) {
    if (left <= 1e-9) break;
    const have = item.qty as number;
    if (have <= left + 1e-9) {
      changes.push({ foodId: item.foodId, delta: -have, before: item, after: null });
      left -= have;
    } else {
      const after = { ...item, qty: have - left };
      changes.push({ foodId: item.foodId, delta: -left, before: item, after });
      left = 0;
    }
  }
  return changes;
}

/** 一道菜按 servings 份做，需要消耗的计量食材（基础单位）。常备品、"适量"、换算不了的都不扣 */
export function recipeConsumption(
  recipe: Pick<Recipe, 'lines' | 'servings'>,
  servings: number,
  foods: Map<string, Food>,
): Map<string, number> {
  const out = new Map<string, number>();
  const k = recipe.servings > 0 ? servings / recipe.servings : 1;
  for (const line of recipe.lines) {
    if (line.isHeader || line.noAmount || !line.foodId || line.qty == null) continue;
    const food = foods.get(line.foodId);
    if (!food || food.kind === 'staple') continue;
    const base = toBase(line.qty * k, line.unit, food);
    if (base == null) continue;
    out.set(food.id, (out.get(food.id) ?? 0) + base);
  }
  return out;
}

/** 做一道菜要改的库存记录 */
export function deductionForRecipe(
  recipe: Pick<Recipe, 'lines' | 'servings'>,
  servings: number,
  foods: Map<string, Food>,
  pantry: PantryItem[],
): StockChange[] {
  const changes: StockChange[] = [];
  for (const [foodId, amount] of recipeConsumption(recipe, servings, foods)) {
    changes.push(...planDeduction(pantry.filter((p) => p.foodId === foodId), amount));
  }
  return changes;
}
