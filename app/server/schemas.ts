// 请求和模型输出的格式（SPEC §6）。模型输出一律先过这里的校验，再返回给手机。
// 结构化输出要求每个字段都出现，所以"可以没有"的字段用 nullable，而不是 optional。
import { z } from 'zod';

export const SECTIONS = ['蔬菜水果', '肉蛋豆制品', '水产', '乳制品', '主食干货', '调料', '其他'] as const;

export const RecipeResult = z.object({
  title: z.string(),
  servings: z.number().nullable(),
  timeMin: z.number().nullable(),
  lines: z.array(
    z.object({
      name: z.string(),
      qty: z.number().nullable(),
      unit: z.string().nullable(),
      note: z.string().nullable(),
      originalText: z.string(),
      noAmount: z.boolean(),
      isHeader: z.boolean(),
      confidence: z.number(),
    }),
  ),
  steps: z.array(z.object({ text: z.string(), timerSec: z.number().nullable() })),
  warnings: z.array(z.string()),
});
export type RecipeResult = z.infer<typeof RecipeResult>;

export const GroceryResult = z.object({
  sourceType: z.enum(['receipt', 'order', 'photo']),
  items: z.array(
    z.object({
      name: z.string(),
      rawName: z.string(),
      qty: z.number().nullable(),
      unit: z.string().nullable(),
      isFood: z.boolean(),
      confidence: z.number(),
    }),
  ),
  warnings: z.array(z.string()),
});
export type GroceryResult = z.infer<typeof GroceryResult>;

export const NutritionResult = z.object({
  per100: z.object({ kcal: z.number(), protein: z.number(), fat: z.number(), carb: z.number() }),
  baseUnit: z.enum(['g', 'ml', '个']),
  gPerBase: z.number(),
  section: z.enum(SECTIONS),
  kind: z.enum(['staple', 'tracked']),
  defaultLocation: z.enum(['fridge', 'freezer', 'room']),
  shelfDays: z.object({ fridge: z.number().nullable(), freezer: z.number().nullable(), room: z.number().nullable() }),
  conversions: z.array(z.object({ unit: z.string(), toBase: z.number() })),
  aliases: z.array(z.string()),
});
export type NutritionResult = z.infer<typeof NutritionResult>;

export const MealItem = z.object({
  name: z.string(),
  gramsMin: z.number(),
  gramsMax: z.number(),
  kcalMin: z.number(),
  kcalMax: z.number(),
  protein: z.number(),
  fat: z.number(),
  carb: z.number(),
});
export const MealResult = z.object({
  items: z.array(MealItem),
  notes: z.array(z.string()),
});
export type MealResult = z.infer<typeof MealResult>;

// ---- 请求 ----
const base64Image = z.string().min(100).max(4_000_000);
export const ImagesBody = z.object({ images: z.array(base64Image).min(1).max(4) });
export const TextBody = z.object({ text: z.string().trim().min(1).max(20_000) });
export const NameBody = z.object({ name: z.string().trim().min(1).max(50) });
/** 估算一餐：照片或文字至少有一个；一句话纠正时带上上一次的结果（文字记的那一餐没有照片） */
export const MealBody = z
  .object({
    image: base64Image.optional(),
    text: z.string().trim().min(1).max(500).optional(),
    correction: z.string().trim().min(1).max(500).optional(),
    previous: MealResult.optional(),
  })
  .refine((b) => b.image || b.text || b.previous, '要有照片或文字')
  .refine((b) => !b.correction || b.previous, '纠正时要带上上一次的结果');
