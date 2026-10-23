import { describe, expect, it } from 'vitest';
import type { Food, ShoppingItem } from '../db/types';
import { seedFoods } from '../db/seedFoods';
import { matchFoodName, matchScan, reviewToLines, scanQtyBase, toReview } from './match';

const foods = seedFoods();
const byName = (n: string) => foods.find((f) => f.name === n) as Food;

describe('按名称匹配食材', () => {
  it('精确、别名、包含', () => {
    expect(matchFoodName(foods, '番茄')?.name).toBe('番茄');
    expect(matchFoodName(foods, '西红柿')?.name).toBe('番茄');
    expect(matchFoodName(foods, '土鸡蛋')?.name).toBe('鸡蛋');
    expect(matchFoodName(foods, '有机小青菜')?.name).toBe('青菜');
    expect(matchFoodName(foods, '冬瓜块')?.name).toBe('冬瓜');
  });
  it('单字食材名不会被随便包含匹配', () => {
    // "洋葱"不能因为包含"葱"就配到葱
    expect(matchFoodName(foods, '洋葱')?.name).toBe('洋葱');
    expect(matchFoodName(foods, '紫甘蓝')).toBeUndefined();
  });
});

describe('截图导入：识别结果转成可编辑的行', () => {
  const result = {
    title: '可乐鸡翅', servings: 2, timeMin: 30, warnings: [],
    steps: [{ text: '焯水', timerSec: null }, { text: '', timerSec: null }],
    lines: [
      { name: '鸡翅中', qty: 8, unit: '个', originalText: '鸡翅中8个', noAmount: false, isHeader: false, confidence: 0.95 },
      { name: '调料', qty: null, unit: null, originalText: '调料', noAmount: false, isHeader: true, confidence: 0.9 },
      { name: '冰糖', qty: 10, unit: 'g', originalText: '冰糖一小把', noAmount: false, isHeader: false, confidence: 0.4 },
      { name: '葱', qty: null, unit: null, originalText: '葱花适量', noAmount: true, isHeader: false, confidence: 0.9 },
      { name: '蒜香叶', qty: 1, unit: '个', originalText: '蒜香叶1个', noAmount: false, isHeader: false, confidence: 0.9 },
    ],
  };
  const review = toReview(result, foods);
  it('匹配食材、标出没把握的行', () => {
    expect(review.lines.map((l) => [l.kind, l.foodId ? 'matched' : 'none', l.confirmed])).toEqual([
      ['line', 'matched', true],
      ['header', 'none', true],
      ['line', 'matched', false],
      ['line', 'matched', true],
      ['line', 'none', true],
    ]);
    expect(review.steps).toEqual(['焯水']);
  });
  it('转回菜谱用料：忽略的行不要，适量的没有数量', () => {
    const lines = review.lines.map((l, i) => (i === 2 ? { ...l, kind: 'ignored' as const } : l));
    const out = reviewToLines(lines, new Map(foods.map((f) => [f.id, f])));
    expect(out.map((l) => (l.isHeader ? `[${l.originalText}]` : l.originalText))).toEqual(['鸡翅中8个', '[调料]', '葱花适量', '蒜香叶1个']);
    expect(out[2]).toMatchObject({ noAmount: true, qty: undefined });
    expect(out[3].foodId).toBeUndefined();
  });
});

describe('拍照入库：对上购物清单', () => {
  const item = (id: string, food: string, p: Partial<ShoppingItem> = {}): ShoppingItem => ({
    id, foodId: byName(food).id, qty: 4, section: '', sources: [], state: 'need', bought: false, origin: 'plan', createdAt: 0, ...p,
  });
  const shopping = [item('s1', '番茄'), item('s2', '排骨', { qty: 500 }), item('s3', '鸡蛋', { bought: true }), item('s4', '可乐', { state: 'have' })];
  const scanned = [
    { name: '番茄', rawName: '西红柿 500g', qty: 3, unit: '个', isFood: true, confidence: 0.9 },
    { name: '鸡蛋', rawName: '土鸡蛋 10枚', qty: 10, unit: '个', isFood: true, confidence: 0.95 },
    { name: '抽纸', rawName: '抽纸', qty: 1, unit: '提', isFood: false, confidence: 0.9 },
    { name: '青菜', rawName: '有机小青菜 2份', qty: 2, unit: '把', isFood: true, confidence: 0.5 },
  ];
  it('分组：清单里的 / 清单外的 / 需要确认；没买到的单独列出', () => {
    const { rows, missing } = matchScan(scanned, foods, shopping, 'list');
    expect(rows.map((r) => [r.name, r.group, r.include, r.shoppingItemId ?? null])).toEqual([
      ['番茄', 'list', true, 's1'],
      ['鸡蛋', 'extra', true, null], // 清单里的鸡蛋已经买过了
      ['抽纸', 'extra', false, null], // 非食品默认不放进冰箱
      ['青菜', 'uncertain', true, null],
    ]);
    expect(missing.map((m) => m.id)).toEqual(['s2']); // "家里已有"的可乐不算没买到
  });
  it('从冰箱进来时不和清单比对', () => {
    const { rows, missing } = matchScan(scanned, foods, shopping, 'fridge');
    expect(rows[0].group).toBe('extra');
    expect(missing).toEqual([]);
  });
  it('数量换算成基础单位', () => {
    expect(scanQtyBase({ qty: '2', unit: '把' }, byName('青菜'))).toBe(600);
    expect(scanQtyBase({ qty: '1', unit: '盒' }, byName('嫩豆腐'))).toBe(350);
    expect(scanQtyBase({ qty: '', unit: '个' }, byName('番茄'))).toBeNull();
  });
});
