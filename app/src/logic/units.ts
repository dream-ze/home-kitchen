// 单位换算，对应 SPEC §4.1。
import type { BaseUnit, Food } from '../db/types';

type Dim = 'g' | 'ml';

const GENERIC: Record<string, { dim: Dim; f: number }> = {
  g: { dim: 'g', f: 1 },
  克: { dim: 'g', f: 1 },
  kg: { dim: 'g', f: 1000 },
  千克: { dim: 'g', f: 1000 },
  公斤: { dim: 'g', f: 1000 },
  斤: { dim: 'g', f: 500 },
  两: { dim: 'g', f: 50 },
  ml: { dim: 'ml', f: 1 },
  毫升: { dim: 'ml', f: 1 },
  l: { dim: 'ml', f: 1000 },
  升: { dim: 'ml', f: 1000 },
  勺: { dim: 'ml', f: 15 },
  汤匙: { dim: 'ml', f: 15 },
  大勺: { dim: 'ml', f: 15 },
  茶匙: { dim: 'ml', f: 5 },
  小勺: { dim: 'ml', f: 5 },
  杯: { dim: 'ml', f: 250 },
};

/** 计数类单位，显示时按半个取整 */
export const COUNT_UNITS = new Set([
  '个', '片', '瓣', '根', '把', '盒', '包', '瓶', '桶', '袋', '颗', '只', '条', '块', '棵',
  '枚', '碗', '听', '罐', '提', '串', '头', '粒', '张', '份', '朵',
]);

export const KNOWN_UNITS = [...Object.keys(GENERIC), ...COUNT_UNITS];

export function normalizeUnit(u?: string): string {
  if (!u) return '';
  const t = u.trim();
  if (/^(g|G|克)$/.test(t)) return 'g';
  if (/^(ml|mL|ML|毫升)$/.test(t)) return 'ml';
  if (/^(L|l|升)$/.test(t)) return 'l';
  if (/^(KG|Kg|kg)$/.test(t)) return 'kg';
  return t;
}

type UnitFood = Pick<Food, 'baseUnit' | 'conversions' | 'gPerBase'>;

/** 换算成食材的基础单位；换算不了返回 null */
export function toBase(qty: number, unit: string | undefined, food: UnitFood): number | null {
  const u = normalizeUnit(unit) || food.baseUnit;
  if (u === food.baseUnit) return qty;
  const conv = food.conversions.find((c) => normalizeUnit(c.unit) === u);
  if (conv) return qty * conv.toBase;
  const gen = GENERIC[u];
  if (!gen) return null;
  const amount = qty * gen.f;
  if (gen.dim === food.baseUnit) return amount;
  // 克和毫升之间按密度 1:1 估算
  if (food.baseUnit === 'g' || food.baseUnit === 'ml') return amount;
  // 基础单位是"个"：用单个重量折算
  if (food.gPerBase > 0) return amount / food.gPerBase;
  return null;
}

/** 换算成克，用于营养计算 */
export function toGrams(qty: number, unit: string | undefined, food: UnitFood): number | null {
  const base = toBase(qty, unit, food);
  return base == null ? null : base * food.gPerBase;
}

function trimZeros(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function roundQty(n: number, unit: string): number {
  if (COUNT_UNITS.has(unit)) {
    const r = Math.round(n * 2) / 2;
    return n > 0 && r === 0 ? 0.5 : r;
  }
  if (n >= 10) return Math.round(n);
  return Math.round(n * 10) / 10;
}

/** "500 g"、"1.2 kg"、"2 勺"、"1.5 个" */
export function formatAmount(n: number, unit: string): string {
  const u = normalizeUnit(unit);
  if (u === 'g' && n >= 1000) return `${trimZeros(n / 1000)} kg`;
  if (u === 'ml' && n >= 1000) return `${trimZeros(n / 1000)} L`;
  return `${trimZeros(roundQty(n, u))} ${u}`;
}

export function formatBase(n: number, baseUnit: BaseUnit): string {
  return formatAmount(n, baseUnit);
}

/** 有购买单位时向上取整："7 个鸡蛋" → "1 盒" */
export function toPurchase(nBase: number, food: Pick<Food, 'purchaseUnit'>): { qty: number; unit: string } | null {
  if (!food.purchaseUnit || food.purchaseUnit.toBase <= 0) return null;
  return { qty: Math.ceil(nBase / food.purchaseUnit.toBase - 1e-9), unit: food.purchaseUnit.unit };
}
