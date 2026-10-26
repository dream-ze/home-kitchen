import { describe, expect, it } from 'vitest';
import type { Recipe } from '../db/types';
import { arrangePlan, nextAlternative, uncoveredExpiring, type ArrangeInput } from './recommend';
import { entry, recipe } from './testFixtures';

const DAY = 86400000;
const NOW = new Date(2026, 9, 21, 12).getTime(); // 周三
const line = (foodId: string) => ({ foodId, qty: 100, unit: 'g', originalText: foodId, noAmount: false, isHeader: false });
const r = (id: string, foods: string[], p: Partial<Recipe> = {}) => recipe({ id, title: id, lines: foods.map(line), ...p });

const spinachEgg = r('spinachEgg', ['spinach', 'egg']);
const spinachSoup = r('spinachSoup', ['spinach']);
const milkPudding = r('milkPudding', ['milk', 'egg']);
const tofu = r('tofu', ['tofu']);

const base: ArrangeInput = {
  recipes: [spinachEgg, spinachSoup, milkPudding, tofu],
  weekPlan: [],
  expiring: [{ foodId: 'spinach', expiresAt: '2026-10-23' }, { foodId: 'milk', expiresAt: '2026-10-24' }],
  today: '2026-10-21',
  weekEnd: '2026-10-25',
  now: NOW,
};

describe('帮我安排', () => {
  it('临期食材优先，依次填进临期日之前空着的晚餐，每道菜只出现一次', () => {
    expect(arrangePlan(base)).toEqual([
      { date: '2026-10-21', recipeId: 'spinachEgg', uses: ['spinach'] },
      { date: '2026-10-22', recipeId: 'milkPudding', uses: ['milk'] },
    ]);
  });
  it('已经排了晚餐的日子跳过；菜单里已经用到的临期食材不再安排', () => {
    const weekPlan = [entry({ id: 'e1', date: '2026-10-21', recipeId: 'tofu' }), entry({ id: 'e2', date: '2026-10-22', slot: 'lunch', recipeId: 'milkPudding' })];
    expect(arrangePlan({ ...base, weekPlan })).toEqual([{ date: '2026-10-22', recipeId: 'spinachEgg', uses: ['spinach'] }]);
  });
  it('不选本周已经排过的菜', () => {
    const weekPlan = [entry({ id: 'e1', date: '2026-10-20', recipeId: 'spinachEgg', status: 'eaten' })];
    expect(arrangePlan({ ...base, weekPlan }).map((x) => x.recipeId)).toEqual(['spinachSoup', 'milkPudding']);
  });
  it('不选最近 7 天做过的菜', () => {
    const recipes = [{ ...spinachEgg, lastCookedAt: NOW - 3 * DAY }, spinachSoup, milkPudding, r('milkTea', ['milk'])];
    expect(arrangePlan({ ...base, recipes }).map((x) => x.recipeId)).toEqual(['spinachSoup', 'milkPudding']);
  });
  it('候选不够时放宽：最近做过的也可以，但本周排过的仍然不选', () => {
    const recipes = [{ ...spinachEgg, lastCookedAt: NOW - 3 * DAY }, { ...milkPudding, lastCookedAt: NOW - DAY }, r('milkTea', ['milk'])];
    const weekPlan = [entry({ id: 'e1', date: '2026-10-19', recipeId: 'milkTea', status: 'eaten' })];
    expect(arrangePlan({ ...base, recipes, weekPlan }).map((x) => x.recipeId)).toEqual(['spinachEgg', 'milkPudding']);
  });
  it('过了到期日的晚餐不会安排用这种食材的菜', () => {
    const weekPlan = ['2026-10-21', '2026-10-22', '2026-10-23'].map((date, i) => entry({ id: 'e' + i, date, recipeId: 'tofu', status: 'eaten' }));
    expect(arrangePlan({ ...base, weekPlan })).toEqual([{ date: '2026-10-24', recipeId: 'milkPudding', uses: ['milk'] }]);
  });
  it('没有能用掉临期食材的菜时什么都不排', () => {
    expect(arrangePlan({ ...base, recipes: [tofu] })).toEqual([]);
  });
  it('提醒条只列还没被菜单用到的临期食材', () => {
    const weekPlan = [entry({ id: 'e1', date: '2026-10-22', recipeId: 'spinachSoup' })];
    expect(uncoveredExpiring({ ...base, weekPlan }).map((x) => x.foodId)).toEqual(['milk']);
  });
  it('换一道：同一天换成另一道能用掉临期食材的菜，不和其他天重复', () => {
    const items = arrangePlan(base);
    expect(nextAlternative(base, items, 0, ['spinachEgg'])).toEqual({ date: '2026-10-21', recipeId: 'spinachSoup', uses: ['spinach'] });
    expect(nextAlternative(base, items, 0, ['spinachEgg', 'spinachSoup'])).toBeUndefined();
  });
});
