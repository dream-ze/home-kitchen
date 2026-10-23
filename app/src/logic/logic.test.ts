import { describe, expect, it } from 'vitest';
import { addDays, diffDays, weekStart } from './dates';
import { daysLeft, expiryLabel, expiryProgress, expiryStatus, parseShorthand } from './expiry';
import { recipeNutrition, round5 } from './nutrition';
import { buildInitials, scoreFood, searchFoods } from './search';
import { applyPlanChange, buildPreview } from './shopping';
import { deductionForRecipe, planDeduction, recipeConsumption } from './stock';
import { detectTimerSec, parseIngredientBlock, parseIngredientLine, splitTimeSegments } from './text';
import { formatAmount, roundQty, toBase, toGrams, toPurchase } from './units';
import { cola, colaWings, egg, entry, food, foods, scallion, soy, stock, tomato, tomatoEgg, wing } from './testFixtures';
import type { ShoppingItem } from '../db/types';

describe('日期', () => {
  it('加减天数和跨月', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(diffDays('2026-10-20', '2026-11-02')).toBe(13);
  });
  it('周一是一周的开始', () => {
    expect(weekStart('2026-10-20')).toBe('2026-10-19'); // 周二
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // 周日
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
  });
});

describe('单位换算', () => {
  it('同单位直接返回', () => {
    expect(toBase(8, '个', wing)).toBe(8);
    expect(toBase(500, '克', food({ id: 'x', name: 'x' }))).toBe(500);
  });
  it('食材专属换算优先', () => {
    expect(toBase(1, '罐', cola)).toBe(330);
    expect(toBase(2, '根', scallion)).toBe(30);
  });
  it('通用换算：斤、两、勺、杯、L', () => {
    const g = food({ id: 'g', name: 'g' });
    expect(toBase(1, '斤', g)).toBe(500);
    expect(toBase(2, '两', g)).toBe(100);
    expect(toBase(2, '勺', soy)).toBe(30);
    expect(toBase(1, '杯', cola)).toBe(250);
    expect(toBase(1.5, 'L', cola)).toBe(1500);
  });
  it('克换算成"个"用单个重量', () => {
    expect(toBase(300, 'g', tomato)).toBe(2);
  });
  it('换算不了返回 null', () => {
    expect(toBase(1, '把', tomato)).toBeNull();
  });
  it('换算成克', () => {
    expect(toGrams(2, '个', egg)).toBe(100);
  });
  it('取整和显示', () => {
    expect(roundQty(1.3, '个')).toBe(1.5);
    expect(roundQty(0.1, '个')).toBe(0.5);
    expect(roundQty(12.4, 'g')).toBe(12);
    expect(formatAmount(1500, 'g')).toBe('1.5 kg');
    expect(formatAmount(330, 'ml')).toBe('330 ml');
    expect(formatAmount(1000, 'ml')).toBe('1 L');
    expect(formatAmount(2, '勺')).toBe('2 勺');
  });
  it('购买单位向上取整', () => {
    expect(toPurchase(7, egg)).toEqual({ qty: 1, unit: '盒' });
    expect(toPurchase(10, egg)).toEqual({ qty: 1, unit: '盒' });
    expect(toPurchase(11, egg)).toEqual({ qty: 2, unit: '盒' });
    expect(toPurchase(3, tomato)).toBeNull();
  });
});

describe('热量', () => {
  it('每份热量 = 用料克数 × 每百克 ÷ 份数', () => {
    // 番茄 2 个 = 300 g → 54 kcal；鸡蛋 3 个 = 150 g → 214.5；生抽 15 ml × 1.15 = 17.25 g → 10.9
    const n = recipeNutrition(tomatoEgg, foods);
    expect(n.perServing.kcal).toBe(Math.round((54 + 214.5 + 10.8675) / 2));
    expect(n.missing).toBe(false); // 葱是"适量"，不算缺
  });
  it('没有营养数据的用料标记为缺', () => {
    const r = { ...tomatoEgg, lines: [...tomatoEgg.lines, { foodId: 'scallion', qty: 2, unit: '根', originalText: '', noAmount: false, isHeader: false }] };
    expect(recipeNutrition(r, foods).missing).toBe(true);
  });
  it('取到 5 的倍数', () => {
    expect(round5(412)).toBe(410);
    expect(round5(413)).toBe(415);
  });
});

describe('到期日', () => {
  const today = '2026-10-20';
  it('剩余天数和状态', () => {
    expect(daysLeft('2026-10-21', today)).toBe(1);
    expect(expiryStatus({ expiresAt: '2026-10-19' }, today, 3)).toBe('expired');
    expect(expiryStatus({ expiresAt: '2026-10-23' }, today, 3)).toBe('soon');
    expect(expiryStatus({ expiresAt: '2026-10-24' }, today, 3)).toBe('ok');
    expect(expiryStatus({}, today, 3)).toBe('none');
  });
  it('文案', () => {
    expect(expiryLabel(-1)).toBe('已过期 1 天');
    expect(expiryLabel(0)).toBe('今天到期');
    expect(expiryLabel(1)).toBe('明天到期');
    expect(expiryLabel(12)).toBe('还剩 12 天');
    expect(expiryLabel(60)).toBe('还剩约 2 个月');
  });
  it('进度条', () => {
    expect(expiryProgress({ addedAt: '2026-10-15', expiresAt: '2026-10-25' }, today)).toBe(0.5);
    expect(expiryProgress({ addedAt: '2026-10-15', expiresAt: '2026-10-19' }, today)).toBe(0);
  });
  it('日期简写', () => {
    expect(parseShorthand('+3d', today)).toBe('2026-10-23');
    expect(parseShorthand('2w', today)).toBe('2026-11-03');
    expect(parseShorthand('+1m', today)).toBe('2026-11-19');
    expect(parseShorthand('5天', today)).toBe('2026-10-25');
    expect(parseShorthand('abc', today)).toBeNull();
  });
});

describe('扣库存', () => {
  it('先扣最早到期的，部分扣减保留余量', () => {
    const a = stock({ id: 'a', foodId: 'egg', qty: 4, expiresAt: '2026-10-25' });
    const b = stock({ id: 'b', foodId: 'egg', qty: 6, expiresAt: '2026-10-22' });
    const changes = planDeduction([a, b], 8);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ before: b, after: null, delta: -6 });
    expect(changes[1].after?.qty).toBe(2);
    expect(changes[1].delta).toBe(-2);
  });
  it('库存不够就扣到 0，不报错', () => {
    const a = stock({ id: 'a', foodId: 'egg', qty: 2 });
    const changes = planDeduction([a], 5);
    expect(changes).toEqual([{ foodId: 'egg', delta: -2, before: a, after: null }]);
  });
  it('按份数缩放，常备品和"适量"不扣', () => {
    const use = recipeConsumption(tomatoEgg, 4, foods);
    expect(use.get('tomato')).toBe(4);
    expect(use.get('egg')).toBe(6);
    expect(use.has('soy')).toBe(false);
    expect(use.has('scallion')).toBe(false);
  });
  it('一道菜的扣减', () => {
    const pantry = [stock({ id: 'w', foodId: 'wing', qty: 10 }), stock({ id: 'e', foodId: 'egg', qty: 4 })];
    const changes = deductionForRecipe(colaWings, 2, foods, pantry);
    expect(changes.find((c) => c.foodId === 'wing')?.after?.qty).toBe(2);
    expect(changes.find((c) => c.foodId === 'egg')?.after?.qty).toBe(3);
    expect(changes.find((c) => c.foodId === 'cola')).toBeUndefined(); // 没有库存
  });
});

describe('购物清单', () => {
  const order = ['蔬菜水果', '肉蛋豆制品', '调料', '其他'];
  const dishes = [
    { entry: entry({ id: 'e1', recipeId: 'r1' }), recipe: tomatoEgg },
    { entry: entry({ id: 'e2', recipeId: 'r2' }), recipe: colaWings },
  ];

  it('同种食材合并，扣掉库存', () => {
    const pantry = [stock({ id: 'p', foodId: 'egg', qty: 1 })];
    const preview = buildPreview(dishes, foods, pantry, order);
    const eggLine = preview.find((l) => l.foodId === 'egg')!;
    expect(eggLine.need).toBe(4); // 3 + 1
    expect(eggLine.have).toBe(1);
    expect(eggLine.buy).toBe(3);
    expect(eggLine.sources.map((s) => s.planEntryId)).toEqual(['e1', 'e2']);
  });
  it('家里够了就标为已有', () => {
    const preview = buildPreview(dishes, foods, [stock({ id: 'p', foodId: 'wing', qty: 20 })], order);
    expect(preview.find((l) => l.foodId === 'wing')?.state).toBe('have');
  });
  it('常备品：没有记录或快没了才买', () => {
    expect(buildPreview(dishes, foods, [], order).find((l) => l.foodId === 'soy')?.state).toBe('need');
    const have = [stock({ id: 's', foodId: 'soy', stock: 'have' })];
    expect(buildPreview(dishes, foods, have, order).find((l) => l.foodId === 'soy')?.state).toBe('have');
    const low = [stock({ id: 's', foodId: 'soy', stock: 'low' })];
    expect(buildPreview(dishes, foods, low, order).find((l) => l.foodId === 'soy')?.state).toBe('need');
  });
  it('只出现在"适量"里的食材：家里有就不买', () => {
    expect(buildPreview(dishes, foods, [], order).find((l) => l.foodId === 'scallion')?.state).toBe('need');
    const p = [stock({ id: 'x', foodId: 'scallion', qty: 100 })];
    expect(buildPreview(dishes, foods, p, order).find((l) => l.foodId === 'scallion')?.state).toBe('have');
  });
  it('按分区顺序排序', () => {
    const preview = buildPreview(dishes, foods, [], order);
    expect(preview[0].section).toBe('蔬菜水果');
    expect(preview[preview.length - 1].section).toBe('其他');
  });

  const item = (p: Partial<ShoppingItem>): ShoppingItem => ({
    id: 'i', foodId: 'egg', section: '肉蛋豆制品', sources: [], state: 'need', bought: false,
    origin: 'plan', createdAt: 0, ...p,
  });
  it('删掉一道菜，只扣掉它的那份', () => {
    const it1 = item({
      id: 'i1', qty: 3, need: 4, have: 1,
      sources: [{ planEntryId: 'e1', recipeId: 'r1', qty: 3 }, { planEntryId: 'e2', recipeId: 'r2', qty: 1 }],
    });
    const { update, remove } = applyPlanChange([it1], 'e2', 0);
    expect(remove).toEqual([]);
    expect(update[0].qty).toBe(2);
    expect(update[0].need).toBe(3);
  });
  it('扣到 0 就删除；已买的不动；手动添加的保留', () => {
    const a = item({ id: 'a', qty: 1, need: 1, have: 0, sources: [{ planEntryId: 'e1', qty: 1 }] });
    const b = item({ id: 'b', qty: 1, need: 1, have: 0, bought: true, sources: [{ planEntryId: 'e1', qty: 1 }] });
    const c = item({ id: 'c', origin: 'manual', qty: 2, sources: [{ planEntryId: 'e1', qty: 1 }] });
    const r = applyPlanChange([a, b, c], 'e1', 0);
    expect(r.remove).toEqual(['a']);
    expect(r.update.map((x) => x.id)).toEqual(['c']);
  });
  it('改份数按比例变化', () => {
    const a = item({ id: 'a', qty: 3, need: 3, have: 0, sources: [{ planEntryId: 'e1', qty: 3 }] });
    expect(applyPlanChange([a], 'e1', 2).update[0].qty).toBe(6);
  });
});

describe('搜索', () => {
  it('拼音首字母', () => {
    expect(buildInitials('番茄', ['西红柿'])).toEqual(['fq', 'xhs']);
    const t = { ...tomato, pinyinInitials: buildInitials('番茄', ['西红柿']) };
    expect(scoreFood(t, 'xhs')).toBeGreaterThan(0);
    expect(scoreFood(t, '西红')).toBeGreaterThan(0);
  });
  it('排序：正名精确匹配优先', () => {
    const list = [
      { ...egg, pinyinInitials: buildInitials('鸡蛋') },
      { ...wing, pinyinInitials: buildInitials('鸡翅中') },
    ];
    expect(searchFoods(list, '鸡')[0].name).toBe('鸡蛋');
    expect(searchFoods(list, 'jcz')[0].name).toBe('鸡翅中');
  });
});

describe('文本解析', () => {
  it('识别步骤里的时长', () => {
    expect(detectTimerSec('大火煮开转中小火 15 分钟')).toBe(900);
    expect(detectTimerSec('焖半小时')).toBe(1800);
    expect(detectTimerSec('炖1.5小时')).toBe(5400);
    expect(detectTimerSec('翻炒均匀')).toBeUndefined();
    expect(splitTimeSegments('煮 15 分钟后关火').map((s) => s.time)).toEqual([false, true, false]);
  });
  it('解析单行用料', () => {
    expect(parseIngredientLine('鸡翅中 8个')).toMatchObject({ name: '鸡翅中', qty: 8, unit: '个' });
    expect(parseIngredientLine('可乐330ml')).toMatchObject({ name: '可乐', qty: 330, unit: 'ml' });
    expect(parseIngredientLine('8个鸡翅中')).toMatchObject({ name: '鸡翅中', qty: 8, unit: '个' });
    expect(parseIngredientLine('生抽两勺')).toMatchObject({ name: '生抽', qty: 2, unit: '勺' });
    expect(parseIngredientLine('葱 适量')).toMatchObject({ name: '葱', noAmount: true });
    expect(parseIngredientLine('五花肉')).toMatchObject({ name: '五花肉', noAmount: true });
    expect(parseIngredientLine('1、排骨 500g')).toMatchObject({ name: '排骨', qty: 500, unit: 'g' });
    expect(parseIngredientLine('1.5kg 排骨')).toMatchObject({ name: '排骨', qty: 1.5, unit: 'kg' });
  });
  it('整段粘贴', () => {
    const r = parseIngredientBlock('鸡翅中 8个，可乐 330ml、生抽2勺\n葱 适量');
    expect(r.map((x) => x.name)).toEqual(['鸡翅中', '可乐', '生抽', '葱']);
  });
});
