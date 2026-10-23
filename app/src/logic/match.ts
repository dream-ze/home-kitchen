// 把 AI 识别结果对到本地食材库和购物清单上（SPEC §5.9、PRD P06 / P15）。纯函数，有单元测试。
import type { Food, RecipeLine, ShoppingItem } from '../db/types';
import { findFoodByName, scoreFood, searchFoods } from './search';
import { toBase } from './units';

/** 按名称找食材：精确 → 名称或别名被包含（"土鸡蛋"→鸡蛋）→ 模糊搜索 */
export function matchFoodName(foods: Food[], name: string): Food | undefined {
  const t = name.trim();
  if (!t) return undefined;
  const exact = findFoodByName(foods, t);
  if (exact) return exact;
  let best: { f: Food; len: number } | undefined;
  for (const f of foods) {
    for (const n of [f.name, ...f.aliases]) {
      if (n.length >= 2 && t.includes(n) && (!best || n.length > best.len)) best = { f, len: n.length };
    }
  }
  if (best) return best.f;
  const s = searchFoods(foods, t, 1)[0];
  return s && scoreFood(s, t) >= 60 ? s : undefined;
}

// ---------- 截图导入 ----------

export const LOW_CONFIDENCE = 0.6;

export interface ReviewLine {
  key: number;
  kind: 'line' | 'header' | 'ignored';
  name: string;
  foodId?: string;
  qty: string;
  unit: string;
  originalText: string;
  confidence: number;
  /** 没把握的行，用户点过"是用料"或改过内容后才算确认 */
  confirmed: boolean;
}

export interface AiRecipeLike {
  title: string;
  servings: number | null;
  timeMin: number | null;
  lines: { name: string; qty: number | null; unit: string | null; originalText: string; noAmount: boolean; isHeader: boolean; confidence: number }[];
  steps: { text: string; timerSec: number | null }[];
  warnings: string[];
}

let seq = 0;
export const nextKey = () => ++seq;

export function toReview(r: AiRecipeLike, foods: Food[]) {
  const lines: ReviewLine[] = r.lines.map((l) => {
    const food = l.isHeader ? undefined : matchFoodName(foods, l.name);
    return {
      key: nextKey(),
      kind: l.isHeader ? 'header' : 'line',
      name: food?.name ?? l.name,
      foodId: food?.id,
      qty: l.noAmount || l.qty == null ? '' : String(l.qty),
      unit: l.noAmount ? '' : l.unit ?? '',
      originalText: l.originalText || l.name,
      confidence: l.confidence,
      confirmed: l.isHeader || l.confidence >= LOW_CONFIDENCE,
    };
  });
  return {
    title: r.title,
    servings: r.servings && r.servings > 0 ? Math.round(r.servings) : 2,
    timeMin: r.timeMin && r.timeMin > 0 ? Math.round(r.timeMin) : undefined,
    lines,
    steps: r.steps.map((s) => s.text).filter(Boolean),
    warnings: r.warnings,
  };
}

export function reviewToLines(lines: ReviewLine[], foods: Map<string, Food>): RecipeLine[] {
  const out: RecipeLine[] = [];
  for (const l of lines) {
    if (l.kind === 'ignored') continue;
    if (l.kind === 'header') {
      if (l.name.trim()) out.push({ originalText: l.name.trim(), isHeader: true, noAmount: false });
      continue;
    }
    const name = l.foodId ? foods.get(l.foodId)?.name ?? l.name : l.name.trim();
    if (!name) continue;
    const q = parseFloat(l.qty);
    const noAmount = !(q > 0);
    out.push({
      foodId: l.foodId,
      qty: noAmount ? undefined : q,
      unit: noAmount ? undefined : l.unit.trim() || undefined,
      originalText: l.originalText || `${name} ${noAmount ? '适量' : q + l.unit}`,
      noAmount,
      isHeader: false,
      confidence: l.confidence,
    });
  }
  return out;
}

// ---------- 拍照入库 ----------

export interface ScanItemIn {
  name: string;
  rawName: string;
  qty: number | null;
  unit: string | null;
  isFood: boolean;
  confidence: number;
}

export interface ScanRow {
  key: number;
  name: string;
  rawName: string;
  qty: string;
  unit: string;
  isFood: boolean;
  confidence: number;
  foodId?: string;
  shoppingItemId?: string;
  group: 'list' | 'extra' | 'uncertain';
  include: boolean;
}

/** 识别出的东西对上食材库和购物清单；清单里没对上的列为"还没买到" */
export function matchScan(
  items: ScanItemIn[],
  foods: Food[],
  shopping: ShoppingItem[],
  mode: 'list' | 'fridge',
): { rows: ScanRow[]; missing: ShoppingItem[] } {
  const open = mode === 'list' ? shopping.filter((i) => !i.bought && i.state === 'need' && i.foodId) : [];
  const used = new Set<string>();
  const rows: ScanRow[] = items.map((it) => {
    const food = it.isFood ? matchFoodName(foods, it.name) : undefined;
    const listItem = food ? open.find((i) => i.foodId === food.id && !used.has(i.id)) : undefined;
    if (listItem) used.add(listItem.id);
    const uncertain = it.confidence < LOW_CONFIDENCE;
    return {
      key: nextKey(),
      name: food?.name ?? it.name,
      rawName: it.rawName,
      qty: it.qty == null ? '' : String(it.qty),
      unit: it.unit ?? '',
      isFood: it.isFood,
      confidence: it.confidence,
      foodId: food?.id,
      shoppingItemId: listItem?.id,
      group: uncertain ? 'uncertain' : listItem ? 'list' : 'extra',
      include: it.isFood,
    };
  });
  return { rows, missing: open.filter((i) => !used.has(i.id)) };
}

/** 识别出的数量换算成食材的基础单位；换算不了返回 null */
export function scanQtyBase(row: Pick<ScanRow, 'qty' | 'unit'>, food: Food): number | null {
  const q = parseFloat(row.qty);
  if (!(q > 0)) return null;
  return toBase(q, row.unit || undefined, food);
}
