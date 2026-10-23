// 界面文案格式化（PRD §3.7）。
import type { Food, ShoppingItem } from '../db/types';
import { formatAmount, toPurchase } from '../logic/units';

/** 购物清单右侧的"买 X" */
export function buyText(item: ShoppingItem, food?: Food): string {
  if (item.qty == null || item.qty <= 0) {
    if (food?.kind === 'staple') return '补货';
    return item.origin === 'plan' && food ? '适量' : '';
  }
  if (food) {
    const p = toPurchase(item.qty, food);
    if (p) return `买 ${p.qty} ${p.unit}`;
    return `买 ${formatAmount(item.qty, food.baseUnit)}`;
  }
  return `买 ${formatAmount(item.qty, item.unit ?? '')}`;
}

export function qtyText(qty: number | undefined, food?: Food): string {
  if (qty == null || !food) return '';
  return formatAmount(qty, food.baseUnit);
}

export function itemName(item: ShoppingItem, food?: Food): string {
  return food?.name ?? item.text ?? '未命名';
}
