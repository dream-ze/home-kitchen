// 拍照记录的热量计算，对应 SPEC §5.5。纯函数：份量、只吃一半、加油、补漏、一句话纠正。
import type { MealLog, MealLogItem, PhotoDraft, PhotoDraftItem } from '../db/types';
import { uid } from './id';
import { round5 } from './nutrition';

/** 1 勺油约 10 g，约 90 kcal */
export const OIL_KCAL = 90;
const OIL_FAT = 10;

export const PORTIONS = [
  { value: 0.5, label: '半份' },
  { value: 1, label: '1 份' },
  { value: 1.5, label: '1.5 份' },
  { value: 2, label: '2 份' },
];

/** 模型给出的一道菜（1 份的量） */
export interface MealItemIn {
  name: string;
  gramsMin: number;
  gramsMax: number;
  kcalMin: number;
  kcalMax: number;
  protein?: number;
  fat?: number;
  carb?: number;
}

export function fromAi(items: MealItemIn[], extra = false): PhotoDraftItem[] {
  return items.map((i) => ({ ...i, key: uid('d_'), portion: 1, extra: extra || undefined }));
}

/** 发给模型做一句话纠正的"上一次结果"：每道菜 1 份的量，份量系数留在手机上，纠正后继续生效 */
export function toPrevious(draft: PhotoDraft): { items: Required<MealItemIn>[]; notes: string[] } {
  return {
    items: draft.items.map((i) => ({
      name: i.name, gramsMin: i.gramsMin, gramsMax: i.gramsMax, kcalMin: i.kcalMin, kcalMax: i.kcalMax,
      protein: i.protein ?? 0, fat: i.fat ?? 0, carb: i.carb ?? 0,
    })),
    notes: draft.notes,
  };
}

const k = (draft: Pick<PhotoDraft, 'half'>, item: PhotoDraftItem) => item.portion * (draft.half ? 0.5 : 1);

/** 一道菜显示用的区间：热量取到 5 的倍数 */
export function itemRange(draft: Pick<PhotoDraft, 'half'>, item: PhotoDraftItem) {
  const f = k(draft, item);
  return {
    kcalMin: round5(item.kcalMin * f), kcalMax: round5(item.kcalMax * f),
    gramsMin: Math.round(item.gramsMin * f), gramsMax: Math.round(item.gramsMax * f),
  };
}

/** 整餐区间：每道菜的区间相加，再加上油 */
export function mealRange(draft: PhotoDraft): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const i of draft.items) {
    const r = itemRange(draft, i);
    min += r.kcalMin;
    max += r.kcalMax;
  }
  return { min: min + draft.oilSpoons * OIL_KCAL, max: max + draft.oilSpoons * OIL_KCAL };
}

/** 存进记录的热量：区间中点 */
export function mealKcal(draft: PhotoDraft): number {
  const r = mealRange(draft);
  return Math.round((r.min + r.max) / 2);
}

/** 存进饮食记录的条目：每道菜按实际吃的量；加的油单独一条，方便看出来 */
export function draftToLog(draft: PhotoDraft): Pick<MealLog, 'items' | 'adjustments' | 'kcal'> {
  const items: MealLogItem[] = draft.items.map((i) => {
    const f = k(draft, i);
    const r = itemRange(draft, i);
    return {
      name: i.name, gramsMin: r.gramsMin, gramsMax: r.gramsMax, kcalMin: r.kcalMin, kcalMax: r.kcalMax,
      protein: i.protein != null ? i.protein * f : undefined,
      fat: i.fat != null ? i.fat * f : undefined,
      carb: i.carb != null ? i.carb * f : undefined,
    };
  });
  if (draft.oilSpoons > 0) {
    const kcal = draft.oilSpoons * OIL_KCAL;
    items.push({ name: `加的油 ${draft.oilSpoons} 勺`, grams: draft.oilSpoons * 10, kcalMin: kcal, kcalMax: kcal, fat: draft.oilSpoons * OIL_FAT });
  }
  const adjustments: MealLog['adjustments'] = [];
  if (draft.half) {
    const full = mealRange({ ...draft, half: false, oilSpoons: 0 });
    adjustments.push({ type: 'half', kcal: -Math.round((full.min + full.max) / 4) });
  }
  if (draft.oilSpoons > 0) adjustments.push({ type: 'oil', kcal: draft.oilSpoons * OIL_KCAL, note: `${draft.oilSpoons} 勺` });
  for (const i of draft.items.filter((x) => x.extra)) {
    const r = itemRange(draft, i);
    adjustments.push({ type: 'missing', kcal: Math.round((r.kcalMin + r.kcalMax) / 2), note: i.name });
  }
  return { items, adjustments, kcal: mealKcal(draft) };
}

/** 把纠正后的结果和原来的对上：先按名字，剩下的按顺序 */
function pair(before: PhotoDraftItem[], after: MealItemIn[]): (PhotoDraftItem | undefined)[] {
  const used = new Set<string>();
  const out: (PhotoDraftItem | undefined)[] = after.map((a) => {
    const b = before.find((x) => x.name === a.name && !used.has(x.key));
    if (b) used.add(b.key);
    return b;
  });
  const rest = before.filter((b) => !used.has(b.key));
  return out.map((b) => {
    if (b) return b;
    const next = rest.shift();
    if (next) used.add(next.key);
    return next;
  });
}

export interface DiffLine {
  name: string;
  /** 热量变化（区间中点，按当前份量） */
  delta: number;
  kind: 'changed' | 'added' | 'removed';
}

const mid = (i: { kcalMin: number; kcalMax: number }) => (i.kcalMin + i.kcalMax) / 2;

/** 纠正前后每道菜差多少（按当前份量和"只吃了一半"算，和总数的变化对得上）。变化不到 5 kcal 的不显示 */
export function diffMeal(draft: PhotoDraft, after: MealItemIn[]): DiffLine[] {
  const pairs = pair(draft.items, after);
  const lines: DiffLine[] = [];
  after.forEach((a, n) => {
    const b = pairs[n];
    if (!b) lines.push({ name: a.name, delta: round5(mid(a) * (draft.half ? 0.5 : 1)), kind: 'added' });
    else {
      const delta = round5((mid(a) - mid(b)) * k(draft, b));
      if (Math.abs(delta) >= 5 || a.name !== b.name) lines.push({ name: a.name, delta, kind: 'changed' });
    }
  });
  const kept = new Set(pairs.filter(Boolean).map((b) => b!.key));
  for (const b of draft.items.filter((x) => !kept.has(x.key))) {
    lines.push({ name: b.name, delta: -round5(mid(b) * k(draft, b)), kind: 'removed' });
  }
  return lines;
}

/** 确认纠正：用新结果替换，对得上的菜保留份量和"补的"标记 */
export function applyCorrection(draft: PhotoDraft, after: MealItemIn[], notes: string[]): PhotoDraft {
  const pairs = pair(draft.items, after);
  return {
    ...draft,
    notes,
    items: after.map((a, n) => ({ ...a, key: pairs[n]?.key ?? uid('d_'), portion: pairs[n]?.portion ?? 1, extra: pairs[n]?.extra })),
  };
}

/** "漏了什么"的常用选项（1 份的大概值），点了直接加，不用联网 */
export const EXTRA_PRESETS: { key: string; label: string; options: MealItemIn[] }[] = [
  {
    key: 'sauce', label: '酱料',
    options: [
      { name: '一勺沙拉酱', gramsMin: 12, gramsMax: 15, kcalMin: 80, kcalMax: 110, fat: 10 },
      { name: '一勺辣椒油', gramsMin: 8, gramsMax: 12, kcalMin: 70, kcalMax: 100, fat: 10 },
      { name: '一勺芝麻酱', gramsMin: 10, gramsMax: 15, kcalMin: 60, kcalMax: 90, fat: 7, protein: 2 },
      { name: '一碟蘸料', gramsMin: 20, gramsMax: 40, kcalMin: 50, kcalMax: 150, fat: 8 },
    ],
  },
  {
    key: 'drink', label: '饮料',
    options: [
      { name: '一罐可乐', gramsMin: 330, gramsMax: 330, kcalMin: 135, kcalMax: 145, carb: 35 },
      { name: '一杯奶茶', gramsMin: 400, gramsMax: 500, kcalMin: 250, kcalMax: 450, fat: 12, carb: 50 },
      { name: '一杯果汁', gramsMin: 250, gramsMax: 300, kcalMin: 100, kcalMax: 150, carb: 30 },
      { name: '一瓶啤酒', gramsMin: 330, gramsMax: 500, kcalMin: 110, kcalMax: 200, carb: 12 },
      { name: '一杯牛奶', gramsMin: 250, gramsMax: 250, kcalMin: 140, kcalMax: 170, protein: 8, fat: 9, carb: 12 },
    ],
  },
  {
    key: 'soup', label: '汤',
    options: [
      { name: '一碗汤', gramsMin: 200, gramsMax: 300, kcalMin: 50, kcalMax: 120 },
      { name: '一碗紫菜蛋花汤', gramsMin: 200, gramsMax: 300, kcalMin: 40, kcalMax: 80, protein: 4 },
      { name: '一碗排骨汤', gramsMin: 250, gramsMax: 350, kcalMin: 150, kcalMax: 250, protein: 12, fat: 12 },
    ],
  },
  {
    key: 'other', label: '其他',
    options: [
      { name: '一碗米饭', gramsMin: 150, gramsMax: 200, kcalMin: 175, kcalMax: 230, protein: 4, carb: 45 },
      { name: '一个馒头', gramsMin: 90, gramsMax: 110, kcalMin: 200, kcalMax: 250, protein: 7, carb: 45 },
      { name: '一个鸡蛋', gramsMin: 50, gramsMax: 60, kcalMin: 70, kcalMax: 85, protein: 7, fat: 5 },
      { name: '一个苹果', gramsMin: 180, gramsMax: 250, kcalMin: 80, kcalMax: 120, carb: 25 },
    ],
  },
];
