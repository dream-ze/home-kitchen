// 烹饪模式，对应 PRD P08。纯函数：计时器、每一步用到哪些料。
import type { CookSession, Food, RecipeLine } from '../db/types';
import { roundQty } from './units';

export type CookTimer = CookSession['timers'][number];

/** 还剩几秒；暂停中的返回暂停时剩下的 */
export function remainSec(t: CookTimer, now: number): number {
  if (t.pausedRemain != null) return t.pausedRemain;
  return Math.max(0, Math.ceil((t.endsAt - now) / 1000));
}

export function isDone(t: CookTimer, now: number): boolean {
  return t.pausedRemain == null && t.endsAt <= now;
}

/** 每一步最多一个计时；重新开始会替换掉原来的 */
export function startTimer(timers: CookTimer[], stepIndex: number, sec: number, now: number): CookTimer[] {
  return [...timers.filter((t) => t.stepIndex !== stepIndex), { stepIndex, endsAt: now + sec * 1000 }];
}

export function pauseTimer(timers: CookTimer[], stepIndex: number, now: number): CookTimer[] {
  return timers.map((t) =>
    t.stepIndex === stepIndex && t.pausedRemain == null ? { ...t, pausedRemain: remainSec(t, now) } : t,
  );
}

export function resumeTimer(timers: CookTimer[], stepIndex: number, now: number): CookTimer[] {
  return timers.map((t) => {
    if (t.stepIndex !== stepIndex || t.pausedRemain == null) return t;
    return { stepIndex: t.stepIndex, endsAt: now + t.pausedRemain * 1000 };
  });
}

/** 加减时间；已经到点的加时间等于重新开始，并允许再响一次 */
export function adjustTimer(timers: CookTimer[], stepIndex: number, deltaSec: number, now: number): CookTimer[] {
  return timers.map((t) => {
    if (t.stepIndex !== stepIndex) return t;
    if (t.pausedRemain != null) return { ...t, pausedRemain: Math.max(0, t.pausedRemain + deltaSec) };
    const left = Math.max(0, remainSec(t, now) + deltaSec);
    return { stepIndex: t.stepIndex, endsAt: now + left * 1000, rang: left === 0 ? t.rang : undefined };
  });
}

export function removeTimer(timers: CookTimer[], stepIndex: number): CookTimer[] {
  return timers.filter((t) => t.stepIndex !== stepIndex);
}

/** 15:00、1:05:00 */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export function amountText(line: RecipeLine, k: number): string {
  if (line.noAmount || line.qty == null) return '适量';
  const unit = line.unit ?? '';
  return `${String(Math.round(roundQty(line.qty * k, unit) * 10) / 10)}${unit ? ' ' + unit : ''}`;
}

export function lineName(line: RecipeLine, food?: Food): string {
  return food?.name ?? (line.originalText.replace(/[\d.]+\s*\S*$/, '').trim() || line.originalText);
}

/** 步骤文字里提到了哪几行用料（返回行号）。长的名字先匹配，"洋葱"不会被算成"葱" */
export function stepLineIndexes(text: string, lines: RecipeLine[], foods: Map<string, Food>): number[] {
  const terms: { term: string; index: number }[] = [];
  lines.forEach((l, index) => {
    if (l.isHeader) return;
    const f = l.foodId ? foods.get(l.foodId) : undefined;
    const names = f ? [f.name, ...f.aliases] : [lineName(l)];
    for (const term of names) if (term) terms.push({ term, index });
  });
  terms.sort((a, b) => b.term.length - a.term.length);
  const hit = new Set<number>();
  let rest = text;
  for (const { term, index } of terms) {
    if (!rest.includes(term)) continue;
    hit.add(index);
    rest = rest.split(term).join('\u0000');
  }
  return [...hit].sort((a, b) => a - b);
}
