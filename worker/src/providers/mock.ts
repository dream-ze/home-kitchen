// 模拟模型：不联网，返回固定的示例结果，用于本地联调和测试。
// 文字导入时做一点简单解析，让粘贴的内容能体现在结果里。
import type { GroceryResult, NutritionResult, RecipeResult } from '../schemas';
import { validate } from './json';
import type { Provider, Task } from './types';

const RECIPE: RecipeResult = {
  title: '可乐鸡翅',
  servings: 2,
  timeMin: 30,
  lines: [
    { name: '鸡翅中', qty: 8, unit: '个', note: null, originalText: '鸡翅中8个', noAmount: false, isHeader: false, confidence: 0.95 },
    { name: '可乐', qty: 330, unit: 'ml', note: null, originalText: '可乐一罐(330ml)', noAmount: false, isHeader: false, confidence: 0.92 },
    { name: '调料', qty: null, unit: null, note: null, originalText: '调料', noAmount: false, isHeader: true, confidence: 0.9 },
    { name: '生姜', qty: 3, unit: '片', note: null, originalText: '姜3片', noAmount: false, isHeader: false, confidence: 0.9 },
    { name: '生抽', qty: 2, unit: '勺', note: null, originalText: '生抽2勺', noAmount: false, isHeader: false, confidence: 0.93 },
    { name: '老抽', qty: 1, unit: '勺', note: null, originalText: '老抽1勺', noAmount: false, isHeader: false, confidence: 0.9 },
    { name: '冰糖', qty: 10, unit: 'g', note: null, originalText: '冰糖一小把', noAmount: false, isHeader: false, confidence: 0.45 },
    { name: '八角', qty: 2, unit: '个', note: null, originalText: '八角2个', noAmount: false, isHeader: false, confidence: 0.85 },
    { name: '葱', qty: null, unit: null, note: null, originalText: '葱花适量', noAmount: true, isHeader: false, confidence: 0.9 },
    { name: '记得关注我', qty: null, unit: null, note: null, originalText: '记得关注我哦～', noAmount: true, isHeader: false, confidence: 0.3 },
  ],
  steps: [
    { text: '鸡翅两面划刀，冷水下锅，加姜片焯水，捞出沥干。', timerSec: null },
    { text: '少油小火，把鸡翅煎到两面金黄。', timerSec: null },
    { text: '倒入可乐、生抽、老抽和冰糖，大火煮开转中小火 15 分钟。', timerSec: 900 },
    { text: '大火收汁，撒葱花出锅。', timerSec: null },
  ],
  warnings: ['示例结果：服务器现在用的是模拟模型，没有真正识别图片'],
};

const GROCERIES: GroceryResult = {
  sourceType: 'order',
  items: [
    { name: '番茄', rawName: '盒马 普罗旺斯西红柿 500g（约3个）', qty: 3, unit: '个', isFood: true, confidence: 0.9 },
    { name: '冬瓜', rawName: '冬瓜块 600g', qty: 600, unit: 'g', isFood: true, confidence: 0.92 },
    { name: '鸡蛋', rawName: '土鸡蛋 10枚装', qty: 10, unit: '个', isFood: true, confidence: 0.95 },
    { name: '葱', rawName: '小香葱 100g', qty: 1, unit: '把', isFood: true, confidence: 0.88 },
    { name: '酸奶', rawName: '原味酸奶 100g×4杯', qty: 4, unit: '杯', isFood: true, confidence: 0.9 },
    { name: '抽纸', rawName: '维达抽纸 3包装', qty: 1, unit: '提', isFood: false, confidence: 0.9 },
    { name: '青菜', rawName: '有机小青菜 2份', qty: 2, unit: '把', isFood: true, confidence: 0.5 },
  ],
  warnings: ['示例结果：服务器现在用的是模拟模型，没有真正识别图片'],
};

function nutrition(name: string): NutritionResult {
  return {
    per100: { kcal: 40, protein: 1.5, fat: 0.3, carb: 8 },
    baseUnit: 'g',
    gPerBase: 1,
    section: /菜|瓜|果|葱|姜|蒜|萝卜/.test(name) ? '蔬菜水果' : /肉|鸡|鸭|蛋|豆腐/.test(name) ? '肉蛋豆制品' : '其他',
    kind: 'tracked',
    defaultLocation: 'fridge',
    shelfDays: { fridge: 5, freezer: null, room: null },
    conversions: [],
    aliases: [],
  };
}

/** 文字导入：按行拆用料和步骤，够联调用即可 */
function recipeFromText(text: string): RecipeResult {
  const rows = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const title = (rows.shift() ?? '').replace(/^#+\s*/, '').slice(0, 30) || '未命名菜谱';
  const lines: RecipeResult['lines'] = [];
  const steps: RecipeResult['steps'] = [];
  for (const row of rows) {
    const m = row.match(/^([^\d\s，。,:：]{1,8})[\s:：]*(\d+(?:\.\d+)?)\s*([a-zA-Z一-龥]{0,2})$/);
    if (m) lines.push({ name: m[1], qty: Number(m[2]), unit: m[3] || null, note: null, originalText: row, noAmount: false, isHeader: false, confidence: 0.8 });
    else if (/适量|少许/.test(row) && row.length <= 10) lines.push({ name: row.replace(/适量|少许/g, '').trim(), qty: null, unit: null, note: null, originalText: row, noAmount: true, isHeader: false, confidence: 0.8 });
    else {
      const t = row.match(/(\d+)\s*分钟/);
      steps.push({ text: row, timerSec: t ? Number(t[1]) * 60 : null });
    }
  }
  return { title, servings: null, timeMin: null, lines, steps, warnings: ['示例结果：模拟模型只按行做了简单拆分'] };
}

export function mockProvider(): Provider {
  return {
    name: 'mock',
    model: 'mock',
    async generate<T>(task: Task<T>): Promise<T> {
      await new Promise((r) => setTimeout(r, 600)); // 模拟一点等待
      let out: unknown;
      if (task.kind === 'recipe') out = task.images.length ? RECIPE : recipeFromText(task.text.replace(/^请整理下面这段菜谱文字：\n\n/, ''));
      else if (task.kind === 'groceries') out = GROCERIES;
      else out = nutrition(task.text);
      return validate(task.schema, out);
    },
  };
}
