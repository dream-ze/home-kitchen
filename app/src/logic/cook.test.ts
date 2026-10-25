import { describe, expect, it } from 'vitest';
import {
  adjustTimer, amountText, formatClock, isDone, pauseTimer, remainSec, removeTimer, resumeTimer, startTimer, stepLineIndexes,
} from './cook';
import { slotByTime } from './dates';
import { colaWings, food, foods } from './testFixtures';

const T0 = 1_000_000;

describe('烹饪计时', () => {
  it('按结束时间算剩余，关掉应用再打开也对', () => {
    const ts = startTimer([], 2, 900, T0);
    expect(remainSec(ts[0], T0)).toBe(900);
    expect(remainSec(ts[0], T0 + 60_500)).toBe(840);
    expect(isDone(ts[0], T0 + 899_000)).toBe(false);
    expect(isDone(ts[0], T0 + 900_000)).toBe(true);
    expect(remainSec(ts[0], T0 + 2_000_000)).toBe(0);
  });
  it('每一步只有一个计时，重新开始会替换', () => {
    let ts = startTimer([], 1, 60, T0);
    ts = startTimer(ts, 3, 120, T0);
    ts = startTimer(ts, 1, 300, T0);
    expect(ts).toHaveLength(2);
    expect(remainSec(ts.find((t) => t.stepIndex === 1)!, T0)).toBe(300);
    expect(removeTimer(ts, 1).map((t) => t.stepIndex)).toEqual([3]);
  });
  it('暂停后时间不走，继续后接着倒数', () => {
    let ts = startTimer([], 0, 600, T0);
    ts = pauseTimer(ts, 0, T0 + 100_000);
    expect(remainSec(ts[0], T0 + 500_000)).toBe(500);
    expect(isDone(ts[0], T0 + 9_000_000)).toBe(false);
    ts = resumeTimer(ts, 0, T0 + 500_000);
    expect(ts[0].pausedRemain).toBeUndefined();
    expect(remainSec(ts[0], T0 + 510_000)).toBe(490);
  });
  it('加减 1 分钟；减到 0 就算到点', () => {
    let ts = startTimer([], 0, 90, T0);
    ts = adjustTimer(ts, 0, 60, T0);
    expect(remainSec(ts[0], T0)).toBe(150);
    ts = adjustTimer(ts, 0, -60, T0);
    ts = adjustTimer(ts, 0, -60, T0);
    expect(remainSec(ts[0], T0)).toBe(30);
    ts = adjustTimer(ts, 0, -60, T0);
    expect(isDone(ts[0], T0)).toBe(true);
  });
  it('到点响过铃后再加时间，会重新响', () => {
    const rang = [{ stepIndex: 0, endsAt: T0 - 1000, rang: true }];
    const ts = adjustTimer(rang, 0, 60, T0);
    expect(ts[0].rang).toBeUndefined();
    expect(remainSec(ts[0], T0)).toBe(60);
  });
  it('暂停中也能加减', () => {
    const ts = adjustTimer(pauseTimer(startTimer([], 0, 300, T0), 0, T0), 0, -60, T0 + 999_000);
    expect(remainSec(ts[0], T0 + 999_000)).toBe(240);
  });
  it('时钟格式', () => {
    expect(formatClock(900)).toBe('15:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3900)).toBe('1:05:00');
    expect(formatClock(-3)).toBe('00:00');
  });
});

describe('每一步用到的料', () => {
  it('从步骤文字里找出用料，跳过分组标题', () => {
    expect(stepLineIndexes('鸡翅中两面划刀，焯水', colaWings.lines, foods)).toEqual([1]);
    expect(stepLineIndexes('倒入可乐，打一个鸡蛋', colaWings.lines, foods)).toEqual([2, 3]);
    expect(stepLineIndexes('大火收汁', colaWings.lines, foods)).toEqual([]);
  });
  it('别名也算；长名字优先，"洋葱"不会算成"葱"', () => {
    const onion = food({ id: 'onion', name: '洋葱' });
    const scallion = food({ id: 'scallion', name: '葱' });
    const tomato = food({ id: 'tomato', name: '番茄', aliases: ['西红柿'] });
    const m = new Map([onion, scallion, tomato].map((f) => [f.id, f]));
    const lines = [
      { foodId: 'onion', originalText: '洋葱', noAmount: true, isHeader: false },
      { foodId: 'scallion', originalText: '葱', noAmount: true, isHeader: false },
      { foodId: 'tomato', originalText: '番茄', noAmount: true, isHeader: false },
    ];
    expect(stepLineIndexes('洋葱切丝，西红柿切块', lines, m)).toEqual([0, 2]);
    expect(stepLineIndexes('洋葱炒软后撒葱花', lines, m)).toEqual([0, 1]);
  });
  it('没关联食材的行用原文名字匹配', () => {
    const lines = [{ originalText: '八角 2个', noAmount: false, isHeader: false, qty: 2, unit: '个' }];
    expect(stepLineIndexes('放入八角', lines, new Map())).toEqual([0]);
  });
  it('用量随份数缩放，适量不变', () => {
    expect(amountText(colaWings.lines[1], 1.5)).toBe('12 个');
    expect(amountText({ originalText: '葱 适量', noAmount: true, isHeader: false }, 2)).toBe('适量');
  });
});

describe('按时间选餐次', () => {
  it('10 / 15 / 21 点分界', () => {
    const at = (h: number) => slotByTime(new Date(2026, 9, 25, h, 30));
    expect([at(7), at(10), at(14), at(15), at(20), at(21), at(23)]).toEqual(['breakfast', 'lunch', 'lunch', 'dinner', 'dinner', 'snack', 'snack']);
  });
});
