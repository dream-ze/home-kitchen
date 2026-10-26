import { describe, expect, it } from 'vitest';
import type { Food } from '../db/types';
import { seedFoods } from '../db/seedFoods';
import { mergeSeedFoods } from './seedMerge';
import { food } from './testFixtures';

const seed = seedFoods();

describe('内置食材库', () => {
  it('约 300 种，id 不重复', () => {
    expect(seed.length).toBeGreaterThanOrEqual(280);
    expect(new Set(seed.map((f) => f.id)).size).toBe(seed.length);
  });
  it('名称和别名不会撞到别的食材', () => {
    const owner = new Map<string, string>();
    for (const f of seed) {
      for (const n of [f.name, ...f.aliases]) {
        expect(owner.get(n) ?? f.id, `"${n}"同时属于 ${owner.get(n)} 和 ${f.id}`).toBe(f.id);
        owner.set(n, f.id);
      }
    }
  });
  it('几乎都有营养数据，并注明来源', () => {
    const withData = seed.filter((f) => f.per100);
    expect(withData.length / seed.length).toBeGreaterThan(0.95);
    for (const f of seed.filter((x) => x.nutritionSource === 'tw' || x.nutritionSource === 'usda')) {
      expect(f.nutritionRef).toMatch(/^(tw|usda):/);
      expect(f.per100!.kcal).toBeGreaterThanOrEqual(0);
    }
  });
  it('第一版的 51 种食材 id 都还在（老菜谱的用料不会断）', () => {
    const ids = new Set(seed.map((f) => f.id));
    const V1 = `tomato cucumber spinach greens scallion ginger garlic potato carrot onion wintermelon eggplant greenpepper broccoli cabbage
      lettuce beansprout mushroom apple banana lemon egg wing chickenbreast mince porkbelly ribs beef tofu tofuskin shrimp fish milk yogurt
      butter rice noodle flour oats oil salt sugar rocksugar soy darksoy wine vinegar staranise doubanjiang starch sichuanpepper oystersauce sesameoil cola`;
    for (const id of V1.split(/\s+/).filter(Boolean)) expect(ids.has('f_' + id), id).toBe(true);
  });
});

describe('老用户升级食材库', () => {
  const tomato = seed.find((f) => f.id === 'f_tomato')!;
  const oldTomato: Food = { ...tomato, aliases: ['西红柿'], per100: { kcal: 18, protein: 0.9, fat: 0.2, carb: 3.9 }, nutritionSource: 'sample', nutritionRef: undefined, section: '我的分区', sectionLearned: true };

  it('样本营养数据换成正式数据，自己改过的分区保留', () => {
    const out = mergeSeedFoods([oldTomato], seed);
    const t = out.find((f) => f.id === 'f_tomato')!;
    expect(t.nutritionSource).toBe('tw');
    expect(t.per100).toEqual(tomato.per100);
    expect(t.section).toBe('我的分区');
    expect(t.sectionLearned).toBe(true);
  });
  it('改过营养数据的食材不动', () => {
    const edited = { ...oldTomato, nutritionSource: 'manual' as const };
    expect(mergeSeedFoods([edited], seed).find((f) => f.id === 'f_tomato')).toBeUndefined();
  });
  it('新食材补进来，但和自己建的食材重名时跳过', () => {
    const mine = food({ id: 'my_brisket', name: '牛腩', nutritionSource: 'ai' });
    const out = mergeSeedFoods([oldTomato, mine], seed);
    expect(out.some((f) => f.id === 'f_spinach')).toBe(true);
    expect(out.some((f) => f.id === 'f_brisket')).toBe(false);
    expect(out.length).toBe(seed.length - 1);
  });
});
