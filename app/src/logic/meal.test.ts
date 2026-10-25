import { describe, expect, it } from 'vitest';
import type { PhotoDraft } from '../db/types';
import { applyCorrection, diffMeal, draftToLog, fromAi, itemRange, mealKcal, mealRange, toPrevious } from './meal';

const AI = [
  { name: '宫保鸡丁', gramsMin: 180, gramsMax: 240, kcalMin: 400, kcalMax: 520, protein: 30, fat: 28, carb: 18 },
  { name: '米饭', gramsMin: 150, gramsMax: 200, kcalMin: 175, kcalMax: 230, protein: 4, fat: 0.5, carb: 45 },
  { name: '拍黄瓜', gramsMin: 100, gramsMax: 150, kcalMin: 75, kcalMax: 130, protein: 1, fat: 8, carb: 4 },
];

const draft = (p: Partial<PhotoDraft> = {}): PhotoDraft => ({ items: fromAi(AI), half: false, oilSpoons: 0, notes: [], ...p });

describe('拍照记录：热量区间', () => {
  it('每道菜相加', () => {
    expect(mealRange(draft())).toEqual({ min: 650, max: 880 });
    expect(mealKcal(draft())).toBe(765);
  });
  it('份量系数只改这一道', () => {
    const d = draft();
    d.items[1].portion = 2;
    expect(itemRange(d, d.items[1])).toEqual({ kcalMin: 350, kcalMax: 460, gramsMin: 300, gramsMax: 400 });
    expect(mealRange(d)).toEqual({ min: 825, max: 1110 });
  });
  it('只吃了一半：所有菜 × 0.5，每道菜取到 5 的倍数', () => {
    expect(mealRange(draft({ half: true }))).toEqual({ min: 330, max: 440 });
  });
  it('加油：每勺 +90，加在上下限上，在"只吃一半"之后', () => {
    expect(mealRange(draft({ oilSpoons: 2 }))).toEqual({ min: 830, max: 1060 });
    expect(mealRange(draft({ half: true, oilSpoons: 1 }))).toEqual({ min: 420, max: 530 });
  });
  it('补漏的条目也算进去', () => {
    const d = draft();
    d.items.push(...fromAi([{ name: '一碗汤', gramsMin: 200, gramsMax: 300, kcalMin: 50, kcalMax: 120 }], true));
    expect(mealRange(d)).toEqual({ min: 700, max: 1000 });
  });
});

describe('拍照记录：存成饮食记录', () => {
  it('条目按实际吃的量，油单独一条，热量取中点', () => {
    const d = draft({ half: true, oilSpoons: 1 });
    d.items.push(...fromAi([{ name: '一罐可乐', gramsMin: 330, gramsMax: 330, kcalMin: 135, kcalMax: 145 }], true));
    const log = draftToLog(d);
    expect(log.items.map((i) => i.name)).toEqual(['宫保鸡丁', '米饭', '拍黄瓜', '一罐可乐', '加的油 1 勺']);
    expect(log.items[0]).toMatchObject({ kcalMin: 200, kcalMax: 260, gramsMin: 90, gramsMax: 120, protein: 15, fat: 14 });
    expect(log.items[4]).toMatchObject({ kcalMin: 90, kcalMax: 90, fat: 10 });
    const r = mealRange(d);
    expect(log.kcal).toBe(Math.round((r.min + r.max) / 2));
    expect(log.adjustments.map((a) => a.type)).toEqual(['half', 'oil', 'missing']);
    // 记录里条目热量之和和区间一致
    expect(log.items.reduce((s, i) => s + i.kcalMin, 0)).toBe(r.min);
  });
});

describe('拍照记录：一句话纠正', () => {
  it('发出去的是每道菜 1 份的量', () => {
    const d = draft();
    d.items[0].portion = 2;
    expect(toPrevious(d).items[0].kcalMin).toBe(400);
  });
  it('算出每道菜差多少，按当前份量', () => {
    const d = draft();
    d.items[0].portion = 1.5;
    const after = [{ ...AI[0], kcalMin: 480, kcalMax: 600 }, AI[1], AI[2]];
    expect(diffMeal(d, after)).toEqual([{ name: '宫保鸡丁', delta: 120, kind: 'changed' }]);
     // 只吃了一半时，差值也减半，和总数的变化一致
    expect(diffMeal({ ...d, half: true }, after)).toEqual([{ name: '宫保鸡丁', delta: 60, kind: 'changed' }]);
  });
  it('新增和删掉的菜', () => {
    const after = [AI[0], AI[1], { name: '紫菜蛋花汤', gramsMin: 200, gramsMax: 300, kcalMin: 40, kcalMax: 80, protein: 4, fat: 2, carb: 3 }];
    const lines = diffMeal(draft(), after);
    // 拍黄瓜被换成了汤：名字对不上，按顺序配对，显示为改动
    expect(lines).toEqual([{ name: '紫菜蛋花汤', delta: -40, kind: 'changed' }]);
    expect(diffMeal(draft(), [AI[0], AI[1]])).toEqual([{ name: '拍黄瓜', delta: -105, kind: 'removed' }]);
    expect(diffMeal(draft(), [...AI, { ...AI[1], name: '馒头' }])).toEqual([{ name: '馒头', delta: 205, kind: 'added' }]);
  });
  it('确认后替换，保留份量和"补的"标记', () => {
    const d = draft();
    d.items[1].portion = 2;
    d.items.push(...fromAi([{ name: '一碗汤', gramsMin: 200, gramsMax: 300, kcalMin: 50, kcalMax: 120 }], true));
    const after = [...toPrevious(d).items];
    after[0] = { ...after[0], kcalMin: 480, kcalMax: 600 };
    const next = applyCorrection(d, after, ['油多']);
    expect(next.items.map((i) => [i.name, i.portion, !!i.extra])).toEqual([
      ['宫保鸡丁', 1, false], ['米饭', 2, false], ['拍黄瓜', 1, false], ['一碗汤', 1, true],
    ]);
    expect(next.items[1].key).toBe(d.items[1].key);
    expect(next.notes).toEqual(['油多']);
    expect(mealRange(next).min - mealRange(d).min).toBe(80);
  });
});
