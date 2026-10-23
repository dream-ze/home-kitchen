// 搜索：名称、别名、拼音首字母（xhs → 西红柿）。
import { pinyin } from 'pinyin-pro';
import type { Food } from '../db/types';

export function initialsOf(text: string): string {
  const parts = pinyin(text, { pattern: 'first', toneType: 'none', type: 'array' }) as string[];
  return parts.join('').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function buildInitials(name: string, aliases: string[] = []): string[] {
  return [...new Set([name, ...aliases].map(initialsOf).filter(Boolean))];
}

/** 文字匹配打分，0 表示不匹配 */
export function scoreText(q: string, names: string[], initials: string[]): number {
  const s = q.trim().toLowerCase();
  if (!s) return 1;
  let best = 0;
  names.forEach((n, i) => {
    const t = n.toLowerCase();
    const w = i === 0 ? 0 : 10; // 别名比正名略低
    if (t === s) best = Math.max(best, 100 - w);
    else if (t.startsWith(s)) best = Math.max(best, 80 - w);
    else if (t.includes(s)) best = Math.max(best, 60 - w);
  });
  if (/^[a-z]+$/.test(s)) {
    for (const ini of initials) {
      if (ini === s) best = Math.max(best, 50);
      else if (ini.startsWith(s)) best = Math.max(best, 40);
      else if (ini.includes(s)) best = Math.max(best, 20);
    }
  }
  return best;
}

export function scoreFood(food: Food, q: string): number {
  return scoreText(q, [food.name, ...food.aliases], food.pinyinInitials);
}

export function searchFoods(foods: Food[], q: string, limit = 8): Food[] {
  if (!q.trim()) return [];
  return foods
    .map((f) => ({ f, s: scoreFood(f, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.f.name.length - b.f.name.length)
    .slice(0, limit)
    .map((x) => x.f);
}

/** 按名称或别名精确找食材（导入、粘贴时用） */
export function findFoodByName(foods: Food[], name: string): Food | undefined {
  const t = name.trim();
  return foods.find((f) => f.name === t || f.aliases.includes(t));
}
