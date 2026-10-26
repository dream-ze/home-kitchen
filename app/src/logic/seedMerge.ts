// 内置食材库升级：已经在用的手机上，补上新加的食材，换掉第一版的样本营养数据（SPEC §7）。
import type { Food } from '../db/types';

/** 内置食材库的版本：1 是第一版约 50 种样本食材，2 是约 300 种正式数据 */
export const SEED_VERSION = 2;

/**
 * 算出要写回数据库的食材：
 * - 同一个 id、营养数据还是样本值（没被改过）：换成新的营养数据、别名；分区、单位等其他设置保持不变；
 * - 你改过、AI 估算或自己建的食材：不动；
 * - 新食材：名称或别名和已有食材重名的跳过，免得出现两个"牛腩"。
 */
export function mergeSeedFoods(existing: Food[], seed: Food[]): Food[] {
  const byId = new Map(existing.map((f) => [f.id, f]));
  const out: Food[] = [];
  const kept: Food[] = [];
  for (const s of seed) {
    const cur = byId.get(s.id);
    if (!cur) continue;
    if (cur.nutritionSource === 'sample') {
      const next = { ...cur, aliases: s.aliases, pinyinInitials: s.pinyinInitials, per100: s.per100, nutritionSource: s.nutritionSource, nutritionRef: s.nutritionRef };
      out.push(next);
      kept.push(next);
    } else kept.push(cur);
  }
  // 重名检查只看正名：别名重叠（比如自己建的"牛腩"和内置牛肉的旧别名）不影响新增
  const seedIds = new Set(seed.map((s) => s.id));
  const taken = new Set([...kept, ...existing.filter((f) => !seedIds.has(f.id))].map((f) => f.name));
  for (const s of seed) {
    if (byId.has(s.id) || taken.has(s.name) || s.aliases.some((a) => taken.has(a))) continue;
    out.push(s);
    taken.add(s.name);
  }
  return out;
}
