// 文本解析：步骤里的时长、整段粘贴的用料。
import { KNOWN_UNITS } from './units';

const CN_NUM: Record<string, number> = {
  半: 0.5, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/** 识别步骤文字里的第一个时长，返回秒数 */
export function detectTimerSec(text: string): number | undefined {
  if (/半小时/.test(text)) return 1800;
  const m = text.match(/(\d+(?:\.\d+)?)\s*(小时|分钟|分|秒)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (m[2] === '小时') return Math.round(n * 3600);
  if (m[2] === '秒') return Math.round(n);
  return Math.round(n * 60);
}

export function formatDuration(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600} 小时`;
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60} 分钟`;
  if (sec > 60) return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
  return `${sec} 秒`;
}

/** 把步骤文字切成普通文本和时长两类片段，用于高亮 */
export function splitTimeSegments(text: string): { text: string; time: boolean }[] {
  const out: { text: string; time: boolean }[] = [];
  const re = /(\d+(?:\.\d+)?\s*(?:小时|分钟|秒)|半小时)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), time: false });
    out.push({ text: m[0], time: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), time: false });
  return out;
}

const NO_AMOUNT = /^(适量|少许|若干|一点|少量|一些|酌量)$/;

export interface ParsedLine {
  name: string;
  qty?: number;
  unit?: string;
  noAmount: boolean;
  originalText: string;
}

const unitPattern = [...KNOWN_UNITS].sort((a, b) => b.length - a.length).map(escape).join('|');
function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toNumber(s: string): number | undefined {
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^\d+\/\d+$/.test(s)) {
    const [a, b] = s.split('/').map(Number);
    return b ? a / b : undefined;
  }
  if (s in CN_NUM) return CN_NUM[s];
  return undefined;
}

/** "鸡翅中 8个"、"8个鸡翅中"、"可乐330ml"、"葱 适量" */
export function parseIngredientLine(raw: string): ParsedLine | null {
  // 去掉列表序号（"1、" "2." "- "），但不能误伤 "1.5kg"
  const text = raw.replace(/^\s*(?:\d+[、)）]|\d+\.(?!\d)|[-•·*])\s*/, '').trim();
  if (!text) return null;
  const num = '(\\d+(?:\\.\\d+)?|\\d+/\\d+|[半一二两三四五六七八九十])';
  const units = `(${unitPattern})`;

  const tail = text.match(new RegExp(`^(.+?)\\s*(适量|少许|若干|一点|少量|一些|酌量)$`));
  if (tail) return { name: tail[1].trim(), noAmount: true, originalText: raw.trim() };

  const back = text.match(new RegExp(`^(.+?)[\\s:：]*${num}\\s*${units}?$`, 'i'));
  if (back) {
    const qty = toNumber(back[2]);
    if (qty != null) return { name: back[1].trim(), qty, unit: back[3], noAmount: false, originalText: raw.trim() };
  }
  const front = text.match(new RegExp(`^${num}\\s*${units}\\s*(.+)$`, 'i'));
  if (front) {
    const qty = toNumber(front[1]);
    if (qty != null) return { name: front[3].trim(), qty, unit: front[2], noAmount: false, originalText: raw.trim() };
  }
  if (NO_AMOUNT.test(text)) return null;
  return { name: text, noAmount: true, originalText: raw.trim() };
}

/** 整段粘贴：按换行、逗号、顿号拆开 */
export function parseIngredientBlock(block: string): ParsedLine[] {
  return block
    .split(/[\n,，、;；]+/)
    .map((s) => parseIngredientLine(s))
    .filter((x): x is ParsedLine => x != null);
}
