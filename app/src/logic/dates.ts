// 日期一律用本地时区的 YYYY-MM-DD 字符串存储和比较。

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function addDays(date: string, n: number): string {
  const d = parseISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** b 比 a 晚多少天（b - a） */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** 所在周的周一 */
export function weekStart(date: string): string {
  const day = parseISODate(date).getDay(); // 0 = 周日
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayLabel(date: string): string {
  return WEEKDAYS[parseISODate(date).getDay()];
}

export function monthDay(date: string): string {
  const d = parseISODate(date);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function dayNumber(date: string): number {
  return parseISODate(date).getDate();
}

export function fullDayLabel(date: string): string {
  return `${monthDay(date)} · 周${weekdayLabel(date)}`;
}

/** 按现在的时间猜餐次：10 点前早餐，10–15 点午餐，15–21 点晚餐，其余加餐（PRD P12） */
export function slotByTime(now: Date = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const h = now.getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}
