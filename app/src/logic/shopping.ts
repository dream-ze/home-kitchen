// 购物清单生成和联动，对应 SPEC §5.1、§5.2。
import type { Food, MealPlanEntry, PantryItem, Recipe, ShoppingItem, ShoppingSource } from '../db/types';
import { toBase } from './units';

export interface PlannedDish {
  entry: MealPlanEntry;
  recipe: Recipe;
}

export interface PreviewLine {
  foodId: string;
  section: string;
  /** 需要的总量（基础单位）；undefined = 只有"适量"或是常备品 */
  need?: number;
  have: number;
  /** 要买的量；undefined = 不计量 */
  buy?: number;
  state: 'need' | 'have';
  sources: ShoppingSource[];
  unconvertible?: boolean;
}

interface Need {
  need?: number;
  sources: ShoppingSource[];
  unconvertible: boolean;
}

export function collectNeeds(dishes: PlannedDish[], foods: Map<string, Food>): Map<string, Need> {
  const needs = new Map<string, Need>();
  for (const { entry, recipe } of dishes) {
    const k = recipe.servings > 0 ? entry.servings / recipe.servings : 1;
    for (const line of recipe.lines) {
      if (line.isHeader || !line.foodId) continue;
      const food = foods.get(line.foodId);
      if (!food) continue;
      const n = needs.get(food.id) ?? { sources: [], unconvertible: false };
      let qty = 0;
      if (!line.noAmount && line.qty != null && food.kind !== 'staple') {
        const base = toBase(line.qty * k, line.unit, food);
        if (base == null) n.unconvertible = true;
        else {
          qty = base;
          n.need = (n.need ?? 0) + base;
        }
      }
      n.sources.push({ planEntryId: entry.id, recipeId: recipe.id, qty });
      needs.set(food.id, n);
    }
  }
  return needs;
}

export function pantryQty(pantry: PantryItem[], foodId: string): number {
  return pantry.filter((p) => p.foodId === foodId && p.qty != null).reduce((s, p) => s + (p.qty as number), 0);
}

export function buildPreview(
  dishes: PlannedDish[],
  foods: Map<string, Food>,
  pantry: PantryItem[],
  sectionOrder: string[],
): PreviewLine[] {
  const lines: PreviewLine[] = [];
  for (const [foodId, n] of collectNeeds(dishes, foods)) {
    const food = foods.get(foodId) as Food;
    const have = pantryQty(pantry, foodId);
    let state: 'need' | 'have';
    let buy: number | undefined;
    if (food.kind === 'staple') {
      const stock = pantry.find((p) => p.foodId === foodId && p.stock);
      state = !stock || stock.stock === 'low' ? 'need' : 'have';
    } else if (n.unconvertible && n.need == null) {
      state = 'need';
    } else if (n.need == null) {
      // 只出现在"适量"里的计量食材：家里有就算有
      state = have > 0 ? 'have' : 'need';
    } else {
      const diff = n.need - have;
      state = diff > 1e-9 ? 'need' : 'have';
      buy = state === 'need' ? diff : undefined;
    }
    lines.push({
      foodId,
      section: food.section,
      need: n.need,
      have,
      buy,
      state,
      sources: n.sources,
      unconvertible: n.unconvertible || undefined,
    });
  }
  const rank = (s: string) => {
    const i = sectionOrder.indexOf(s);
    return i < 0 ? sectionOrder.length : i;
  };
  return lines.sort(
    (a, b) =>
      rank(a.section) - rank(b.section) ||
      (foods.get(a.foodId)?.name ?? '').localeCompare(foods.get(b.foodId)?.name ?? '', 'zh'),
  );
}

/**
 * 菜单里某道菜被删除（factor = 0）或改了份数（factor = 新份数 / 旧份数）后，
 * 清单里对应的量相应变化。已买的条目不动。
 */
export function applyPlanChange(
  items: ShoppingItem[],
  planEntryId: string,
  factor: number,
): { update: ShoppingItem[]; remove: string[] } {
  const update: ShoppingItem[] = [];
  const remove: string[] = [];
  for (const item of items) {
    if (item.bought || !item.sources.some((s) => s.planEntryId === planEntryId)) continue;
    const sources =
      factor === 0
        ? item.sources.filter((s) => s.planEntryId !== planEntryId)
        : item.sources.map((s) => (s.planEntryId === planEntryId ? { ...s, qty: s.qty * factor } : s));
    if (item.origin !== 'plan') {
      update.push({ ...item, sources });
      continue;
    }
    if (sources.length === 0) {
      remove.push(item.id);
      continue;
    }
    if (item.qty == null || item.need == null) {
      update.push({ ...item, sources });
      continue;
    }
    const need = sources.reduce((s, x) => s + x.qty, 0);
    const buy = need - (item.have ?? 0);
    if (buy <= 1e-9) remove.push(item.id);
    else update.push({ ...item, sources, need, qty: buy });
  }
  return { update, remove };
}

/** 按菜谱视图：每道菜下列出它需要的食材 */
export function groupByRecipe(items: ShoppingItem[]): Map<string, ShoppingItem[]> {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const ids = [...new Set(item.sources.map((s) => s.recipeId).filter(Boolean) as string[])];
    if (ids.length === 0) ids.push('');
    for (const id of ids) {
      const list = groups.get(id) ?? [];
      list.push(item);
      groups.set(id, list);
    }
  }
  return groups;
}
