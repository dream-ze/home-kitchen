// 单元测试用的食材和菜谱。
import type { Food, MealPlanEntry, PantryItem, Recipe } from '../db/types';

export function food(p: Partial<Food> & Pick<Food, 'id' | 'name'>): Food {
  return {
    aliases: [],
    pinyinInitials: [],
    section: '其他',
    sectionLearned: false,
    kind: 'tracked',
    baseUnit: 'g',
    gPerBase: 1,
    conversions: [],
    per100: null,
    nutritionSource: 'sample',
    shelfDays: { fridge: 7 },
    defaultLocation: 'fridge',
    ...p,
  };
}

export const egg = food({
  id: 'egg', name: '鸡蛋', baseUnit: '个', gPerBase: 50, section: '肉蛋豆制品',
  per100: { kcal: 143, protein: 12.6, fat: 9.5, carb: 0.7 },
  purchaseUnit: { unit: '盒', toBase: 10 },
});
export const tomato = food({
  id: 'tomato', name: '番茄', aliases: ['西红柿'], baseUnit: '个', gPerBase: 150, section: '蔬菜水果',
  per100: { kcal: 18, protein: 0.9, fat: 0.2, carb: 3.9 },
});
export const wing = food({
  id: 'wing', name: '鸡翅中', baseUnit: '个', gPerBase: 40, section: '肉蛋豆制品',
  per100: { kcal: 203, protein: 18, fat: 14, carb: 0 },
});
export const cola = food({
  id: 'cola', name: '可乐', baseUnit: 'ml', gPerBase: 1.04,
  conversions: [{ unit: '罐', toBase: 330 }],
  per100: { kcal: 42, protein: 0, fat: 0, carb: 10.6 },
});
export const soy = food({
  id: 'soy', name: '生抽', kind: 'staple', baseUnit: 'ml', gPerBase: 1.15, section: '调料',
  per100: { kcal: 63, protein: 5.6, fat: 0.1, carb: 10 },
});
export const scallion = food({ id: 'scallion', name: '葱', section: '蔬菜水果', conversions: [{ unit: '根', toBase: 15 }] });

export const foods = new Map([egg, tomato, wing, cola, soy, scallion].map((f) => [f.id, f]));

export function recipe(p: Partial<Recipe> & Pick<Recipe, 'id' | 'title'>): Recipe {
  return {
    servings: 2, lines: [], steps: [], tags: [], sourceBlobIds: [], cookedCount: 0,
    createdAt: 0, updatedAt: 0, ...p,
  };
}

export const tomatoEgg = recipe({
  id: 'r1', title: '番茄炒蛋', servings: 2,
  lines: [
    { foodId: 'tomato', qty: 2, unit: '个', originalText: '番茄 2个', noAmount: false, isHeader: false },
    { foodId: 'egg', qty: 3, unit: '个', originalText: '鸡蛋 3个', noAmount: false, isHeader: false },
    { foodId: 'scallion', originalText: '葱 适量', noAmount: true, isHeader: false },
    { foodId: 'soy', qty: 1, unit: '勺', originalText: '生抽 1勺', noAmount: false, isHeader: false },
  ],
});

export const colaWings = recipe({
  id: 'r2', title: '可乐鸡翅', servings: 2,
  lines: [
    { originalText: '主料', noAmount: false, isHeader: true },
    { foodId: 'wing', qty: 8, unit: '个', originalText: '鸡翅中 8个', noAmount: false, isHeader: false },
    { foodId: 'cola', qty: 1, unit: '罐', originalText: '可乐 1罐', noAmount: false, isHeader: false },
    { foodId: 'egg', qty: 1, unit: '个', originalText: '鸡蛋 1个', noAmount: false, isHeader: false },
  ],
});

export function entry(p: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id' | 'recipeId'>): MealPlanEntry {
  return { date: '2026-10-21', slot: 'dinner', servings: 2, order: 0, status: 'planned', ...p };
}

export function stock(p: Partial<PantryItem> & Pick<PantryItem, 'id' | 'foodId'>): PantryItem {
  return { location: 'fridge', addedAt: '2026-10-15', extendedTimes: 0, ...p };
}
