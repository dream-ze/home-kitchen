// 推荐和排序，对应 SPEC §5.8。
import type { Recipe } from '../db/types';

/** 一道菜用到几种临期食材 */
export function expiringUse(recipe: Recipe, expiringFoodIds: Set<string>): string[] {
  const ids = new Set<string>();
  for (const l of recipe.lines) if (l.foodId && expiringFoodIds.has(l.foodId)) ids.add(l.foodId);
  return [...ids];
}

export type PickSort = 'expiring' | 'recent' | 'quick' | 'all';

export function sortRecipes(recipes: Recipe[], sort: PickSort, expiringFoodIds: Set<string>): Recipe[] {
  const list = [...recipes];
  switch (sort) {
    case 'expiring':
      return list.sort(
        (a, b) =>
          expiringUse(b, expiringFoodIds).length - expiringUse(a, expiringFoodIds).length ||
          (a.lastCookedAt ?? 0) - (b.lastCookedAt ?? 0),
      );
    case 'recent':
      return list.filter((r) => r.lastCookedAt).sort((a, b) => (b.lastCookedAt ?? 0) - (a.lastCookedAt ?? 0));
    case 'quick':
      return list.filter((r) => (r.timeMin ?? 999) <= 15).sort((a, b) => a.title.localeCompare(b.title, 'zh'));
    default:
      return list.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  }
}
