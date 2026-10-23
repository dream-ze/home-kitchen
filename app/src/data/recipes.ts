import { db } from '../db/db';
import type { Food, PantryItem, Recipe, RecipeLine } from '../db/types';
import { uid } from '../logic/id';
import { buildInitials } from '../logic/search';
import { toBase } from '../logic/units';
import { removePlanEntry } from './plan';
import { addOriginItem, type Undo } from './shopping';
import { ai } from './ai';
import { compressImage } from './images';

export async function saveRecipe(recipe: Recipe): Promise<void> {
  await db.recipes.put({ ...recipe, updatedAt: Date.now() });
}

export async function deleteRecipe(id: string): Promise<void> {
  const recipe = await db.recipes.get(id);
  if (!recipe) return;
  const entries = await db.plan.where('recipeId').equals(id).filter((e) => e.status === 'planned').toArray();
  for (const e of entries) await removePlanEntry(e.id);
  await db.recipes.delete(id);
  const blobIds = [recipe.coverBlobId, ...recipe.sourceBlobIds, ...recipe.steps.map((s) => s.imageBlobId)].filter(Boolean) as string[];
  await db.blobs.bulkDelete(blobIds);
}

export function newRecipe(): Recipe {
  const now = Date.now();
  return {
    id: uid('r_'), title: '', servings: 2, lines: [], steps: [], tags: [], sourceBlobIds: [],
    cookedCount: 0, createdAt: now, updatedAt: now,
  };
}

export async function createFood(p: Omit<Food, 'id' | 'pinyinInitials' | 'sectionLearned'>): Promise<Food> {
  const food: Food = { ...p, id: uid('f_'), pinyinInitials: buildInitials(p.name, p.aliases), sectionLearned: false };
  await db.foods.add(food);
  return food;
}

export type LineStock = 'have' | 'staple' | 'miss' | 'none';

/** 菜谱详情里每行用料的库存状态：冰箱有 / 常备 / 缺 */
export function lineStock(line: RecipeLine, k: number, food: Food | undefined, pantry: PantryItem[]): { state: LineStock; short?: number } {
  if (line.isHeader || !food) return { state: 'none' };
  const items = pantry.filter((p) => p.foodId === food.id);
  if (food.kind === 'staple') {
    const s = items.find((p) => p.stock);
    return { state: s?.stock === 'have' ? 'staple' : 'miss' };
  }
  const have = items.reduce((s, p) => s + (p.qty ?? 0), 0);
  if (line.noAmount || line.qty == null) return { state: have > 0 ? 'have' : 'miss' };
  const need = toBase(line.qty * k, line.unit, food);
  if (need == null) return { state: have > 0 ? 'have' : 'miss' };
  return have + 1e-9 >= need ? { state: 'have' } : { state: 'miss', short: need - have };
}

/** 把菜谱里缺的用料加进购物清单 */
export async function addMissingToShopping(recipe: Recipe, servings: number): Promise<{ count: number; undo: Undo }> {
  const foods = new Map((await db.foods.toArray()).map((f) => [f.id, f]));
  const pantry = await db.pantry.toArray();
  const k = recipe.servings > 0 ? servings / recipe.servings : 1;
  const added: string[] = [];
  const seen = new Set<string>();
  for (const line of recipe.lines) {
    const food = line.foodId ? foods.get(line.foodId) : undefined;
    if (!food || seen.has(food.id)) continue;
    const st = lineStock(line, k, food, pantry);
    if (st.state !== 'miss') continue;
    seen.add(food.id);
    const id = await addOriginItem(food.id, 'recipe', st.short, recipe.id);
    if (id) added.push(id);
  }
  return {
    count: added.length,
    undo: async () => {
      await db.shopping.bulkDelete(added);
    },
  };
}

/** 图片压缩到长边 1600、JPEG，存进 blobs 表 */
export async function saveImage(file: File | Blob): Promise<string> {
  const blob = await compressImage(file);
  const id = uid('b_');
  await db.blobs.add({ id, data: blob });
  return id;
}

/** 新建食材时让 AI 补资料；AI 不可用时按"其他、冷藏 5 天"建一个最简单的 */
export async function createFoodFromAi(name: string): Promise<Food> {
  try {
    const n = await ai.estimateNutrition(name);
    const shelfDays = Object.fromEntries(Object.entries(n.shelfDays).filter(([, v]) => v != null && v > 0)) as Food['shelfDays'];
    return await createFood({
      name, aliases: n.aliases.filter((a) => a && a !== name), section: n.section, kind: n.kind, baseUnit: n.baseUnit,
      gPerBase: n.baseUnit === 'g' ? 1 : Math.max(0.1, n.gPerBase), conversions: n.conversions.filter((c) => c.unit && c.toBase > 0),
      per100: n.per100, nutritionSource: 'ai', shelfDays: Object.keys(shelfDays).length ? shelfDays : { fridge: 5 },
      defaultLocation: n.defaultLocation,
    });
  } catch {
    return createFood({
      name, aliases: [], section: '其他', kind: 'tracked', baseUnit: 'g', gPerBase: 1, conversions: [],
      per100: null, nutritionSource: 'manual', shelfDays: { fridge: 5 }, defaultLocation: 'fridge',
    });
  }
}
