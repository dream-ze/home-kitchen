// 推荐和排序，对应 SPEC §5.8。
import type { MealPlanEntry, Recipe } from '../db/types';
import { addDays } from './dates';

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

// ---------- "帮我安排"（SPEC §5.8） ----------

const RECENT_MS = 7 * 86400000;

export interface ExpiringFood {
  foodId: string;
  /** 最早的到期日，晚餐排在这天之后就来不及了 */
  expiresAt: string;
}

export interface ArrangeInput {
  recipes: Recipe[];
  /** 本周菜单（周一到周日） */
  weekPlan: MealPlanEntry[];
  expiring: ExpiringFood[];
  today: string;
  weekEnd: string;
  /** 当前时间（毫秒），判断"最近 7 天做过" */
  now: number;
}

export interface ArrangeItem {
  date: string;
  recipeId: string;
  /** 这道菜能用掉的临期食材 */
  uses: string[];
}

/** 临期食材里，本周今天起还没被菜单用到的 */
export function uncoveredExpiring(input: Pick<ArrangeInput, 'recipes' | 'weekPlan' | 'expiring' | 'today'>): ExpiringFood[] {
  const byId = new Map(input.recipes.map((r) => [r.id, r]));
  const used = new Set<string>();
  for (const e of input.weekPlan) {
    if (e.date < input.today || e.status !== 'planned') continue;
    for (const l of byId.get(e.recipeId)?.lines ?? []) if (l.foodId) used.add(l.foodId);
  }
  return input.expiring.filter((x) => !used.has(x.foodId));
}

interface Candidate {
  recipe: Recipe;
  /** false 表示最近 7 天做过，只在候选不够时才用 */
  strict: boolean;
}

/** 某天晚餐的候选：用到当天还没过期、也还没被安排的临期食材，按用掉的种数、是否最近做过、多久没做排序 */
function rankFor(date: string, candidates: Candidate[], pending: ExpiringFood[]): { c: Candidate; uses: string[] }[] {
  const usable = new Set(pending.filter((x) => x.expiresAt >= date).map((x) => x.foodId));
  return candidates
    .map((c) => ({ c, uses: expiringUse(c.recipe, usable) }))
    .filter((x) => x.uses.length > 0)
    .sort(
      (a, b) =>
        b.uses.length - a.uses.length ||
        Number(b.c.strict) - Number(a.c.strict) ||
        (a.c.recipe.lastCookedAt ?? 0) - (b.c.recipe.lastCookedAt ?? 0),
    );
}

function candidatesOf(input: ArrangeInput, emptyDinners: number): Candidate[] {
  const planned = new Set(input.weekPlan.map((e) => e.recipeId));
  const notPlanned = input.recipes.filter((r) => !planned.has(r.id));
  const recent = (r: Recipe) => r.lastCookedAt != null && input.now - r.lastCookedAt < RECENT_MS;
  const pendingIds = new Set(uncoveredExpiring(input).map((x) => x.foodId));
  const strict = notPlanned.filter((r) => !recent(r));
  const useful = strict.filter((r) => expiringUse(r, pendingIds).length > 0);
  // 不选最近 7 天做过的；能用的菜不够填满空着的晚餐时，才放宽到只要求本周不重复
  if (useful.length >= emptyDinners) return strict.map((recipe) => ({ recipe, strict: true }));
  return notPlanned.map((recipe) => ({ recipe, strict: !recent(recipe) }));
}

/** 今天起、最晚的临期日之前（不超过本周日）还空着的晚餐 */
function emptyDinnerDates(input: ArrangeInput, pending: ExpiringFood[]): string[] {
  if (!pending.length) return [];
  const last = pending.reduce((m, x) => (x.expiresAt > m ? x.expiresAt : m), input.today);
  const end = last < input.weekEnd ? last : input.weekEnd;
  const taken = new Set(input.weekPlan.filter((e) => e.slot === 'dinner').map((e) => e.date));
  const out: string[] = [];
  for (let d = input.today; d <= end; d = addDays(d, 1)) if (!taken.has(d)) out.push(d);
  return out;
}

/** 生成安排预览：按日期依次给空着的晚餐挑一道最能用掉临期食材的菜，同一次安排里每道菜只出现一次 */
export function arrangePlan(input: ArrangeInput): ArrangeItem[] {
  let pending = uncoveredExpiring(input);
  const dates = emptyDinnerDates(input, pending);
  let candidates = candidatesOf(input, dates.length);
  const out: ArrangeItem[] = [];
  for (const date of dates) {
    if (!pending.length) break;
    const best = rankFor(date, candidates, pending)[0];
    if (!best) continue;
    out.push({ date, recipeId: best.c.recipe.id, uses: best.uses });
    candidates = candidates.filter((c) => c !== best.c);
    pending = pending.filter((x) => !best.uses.includes(x.foodId));
  }
  return out;
}

/** "换一道"：同一天的下一个候选（跳过预览里其他天已经选了的菜），没有别的了返回 undefined */
export function nextAlternative(input: ArrangeInput, items: ArrangeItem[], index: number, tried: string[]): ArrangeItem | undefined {
  const item = items[index];
  const others = new Set(items.filter((_, i) => i !== index).map((x) => x.recipeId));
  // 其他天已经能用掉的食材不算，这一天要顾及的是剩下的
  const coveredByOthers = new Set(items.filter((_, i) => i !== index).flatMap((x) => x.uses));
  const pending = uncoveredExpiring(input).filter((x) => !coveredByOthers.has(x.foodId));
  const candidates = candidatesOf(input, emptyDinnerDates(input, uncoveredExpiring(input)).length).filter((c) => !others.has(c.recipe.id) && !tried.includes(c.recipe.id));
  const best = rankFor(item.date, candidates, pending)[0];
  return best && { date: item.date, recipeId: best.c.recipe.id, uses: best.uses };
}
