// 到期日，对应 SPEC §5.6。
import type { Food, Location, PantryItem } from '../db/types';
import { addDays, diffDays } from './dates';

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'none';

export function daysLeft(expiresAt: string, today: string): number {
  return diffDays(today, expiresAt);
}

export function expiryStatus(item: Pick<PantryItem, 'expiresAt'>, today: string, warnDays: number): ExpiryStatus {
  if (!item.expiresAt) return 'none';
  const d = daysLeft(item.expiresAt, today);
  if (d < 0) return 'expired';
  if (d <= warnDays) return 'soon';
  return 'ok';
}

export function expiryLabel(days: number): string {
  if (days < 0) return `已过期 ${-days} 天`;
  if (days === 0) return '今天到期';
  if (days === 1) return '明天到期';
  if (days >= 45) return `还剩约 ${Math.round(days / 30)} 个月`;
  return `还剩 ${days} 天`;
}

/** 短标签，用于今天页的胶囊 */
export function expiryShort(days: number): string {
  if (days < 0) return '已过期';
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  return `${days} 天`;
}

/** 剩余天数 / 总保质天数，0..1 */
export function expiryProgress(item: Pick<PantryItem, 'expiresAt' | 'addedAt'>, today: string): number {
  if (!item.expiresAt) return 1;
  const total = diffDays(item.addedAt, item.expiresAt);
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, daysLeft(item.expiresAt, today) / total));
}

export function defaultExpiry(food: Pick<Food, 'shelfDays'>, location: Location, today: string): string | undefined {
  const days = food.shelfDays[location];
  return days == null ? undefined : addDays(today, days);
}

/** 解析 "+3d"、"+2w"、"+1m"、"3天"、"1周"、"2个月"、"5" */
export function parseShorthand(input: string, today: string): string | null {
  const s = input.trim().toLowerCase().replace(/^\+/, '');
  const m = s.match(/^(\d+)\s*(d|天|日|w|周|星期|m|个月|月)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2] ?? 'd';
  if (u === 'w' || u === '周' || u === '星期') return addDays(today, n * 7);
  if (u === 'm' || u === '个月' || u === '月') return addDays(today, n * 30);
  return addDays(today, n);
}
