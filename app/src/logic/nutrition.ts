// 热量计算，对应 SPEC §5.5。
import type { Food, Nutrition, Recipe } from '../db/types';
import { toGrams } from './units';

export const ZERO: Nutrition = { kcal: 0, protein: 0, fat: 0, carb: 0 };

export function addNutrition(a: Nutrition, b: Nutrition, k = 1): Nutrition {
  return {
    kcal: a.kcal + b.kcal * k,
    protein: a.protein + b.protein * k,
    fat: a.fat + b.fat * k,
    carb: a.carb + b.carb * k,
  };
}

export function roundNutrition(n: Nutrition): Nutrition {
  return {
    kcal: Math.round(n.kcal),
    protein: Math.round(n.protein),
    fat: Math.round(n.fat),
    carb: Math.round(n.carb),
  };
}

export interface RecipeNutrition {
  perServing: Nutrition;
  /** 有用料没法计入（没有营养数据或单位换算不了） */
  missing: boolean;
}

export function recipeNutrition(recipe: Pick<Recipe, 'lines' | 'servings'>, foods: Map<string, Food>): RecipeNutrition {
  let total = ZERO;
  let missing = false;
  for (const line of recipe.lines) {
    if (line.isHeader || line.noAmount) continue;
    if (!line.foodId || line.qty == null) {
      missing = true;
      continue;
    }
    const food = foods.get(line.foodId);
    if (!food) {
      missing = true;
      continue;
    }
    const grams = toGrams(line.qty, line.unit, food);
    if (grams == null || !food.per100) {
      missing = true;
      continue;
    }
    total = addNutrition(total, food.per100, grams / 100);
  }
  const servings = recipe.servings > 0 ? recipe.servings : 1;
  return {
    perServing: roundNutrition({
      kcal: total.kcal / servings,
      protein: total.protein / servings,
      fat: total.fat / servings,
      carb: total.carb / servings,
    }),
    missing,
  };
}

/** 取到 5 的倍数，用于拍照估算的区间 */
export function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

export function formatKcal(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
