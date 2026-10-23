// "加载示例数据"：几道菜谱、一些库存和本周菜单，方便第一次打开时看看效果。
import { db } from '../db/db';
import type { MealLog, MealPlanEntry, PantryItem, Recipe, RecipeLine, Slot } from '../db/types';
import { addDays, todayISO } from '../logic/dates';
import { uid } from '../logic/id';
import { detectTimerSec } from '../logic/text';
import { updateSettings } from './settings';

const H = (text: string): RecipeLine => ({ originalText: text, noAmount: false, isHeader: true });
const L = (id: string, name: string, qty?: number, unit?: string): RecipeLine =>
  qty == null
    ? { foodId: 'f_' + id, originalText: `${name} 适量`, noAmount: true, isHeader: false }
    : { foodId: 'f_' + id, qty, unit, originalText: `${name} ${qty}${unit ?? ''}`, noAmount: false, isHeader: false };

function recipe(
  key: string, title: string, servings: number, timeMin: number, tags: string[],
  lines: RecipeLine[], steps: string[], extra: Partial<Recipe> = {},
): Recipe {
  return {
    id: 'demo_' + key, title, servings, timeMin, difficulty: '简单', tags, lines,
    steps: steps.map((text) => ({ text, timerSec: detectTimerSec(text) })),
    sourceBlobIds: [], cookedCount: 0, createdAt: Date.now(), updatedAt: Date.now(), ...extra,
  };
}

const DAY = 86400000;

export async function loadDemoData(): Promise<void> {
  const T = todayISO();
  const now = Date.now();
  const recipes: Recipe[] = [
    recipe('colawings', '可乐鸡翅', 2, 30, ['下饭', '鸡肉'], [
      H('主料'), L('wing', '鸡翅中', 8, '个'), L('cola', '可乐', 330, 'ml'),
      H('调料'), L('ginger', '生姜', 3, '片'), L('soy', '生抽', 2, '勺'), L('darksoy', '老抽', 1, '勺'),
      L('wine', '料酒', 1, '勺'), L('rocksugar', '冰糖', 10, 'g'), L('staranise', '八角', 2, '个'), L('scallion', '葱'),
    ], [
      '鸡翅两面划刀，冷水下锅，加生姜焯水，捞出沥干。',
      '少油小火，把鸡翅中煎到两面金黄。',
      '倒入可乐、生抽、老抽和冰糖，大火煮开转中小火 15 分钟。',
      '大火收汁，撒葱出锅。',
    ], { note: '冰糖少放一点刚好，收汁别走开。', source: '小红书', cookedCount: 3, lastCookedAt: now - 8 * DAY }),
    recipe('tomatoegg', '番茄炒蛋', 2, 10, ['快手', '下饭'], [
      L('tomato', '番茄', 2, '个'), L('egg', '鸡蛋', 3, '个'), L('scallion', '葱'), L('salt', '盐'),
      L('sugar', '白糖', 1, '茶匙'), L('oil', '食用油', 2, '勺'),
    ], [
      '鸡蛋打散，加一点盐；番茄切块。',
      '热油炒鸡蛋，凝固后盛出。',
      '番茄下锅炒出汁，加白糖，倒回鸡蛋翻匀，撒葱出锅。',
    ], { cookedCount: 8, lastCookedAt: now - 4 * DAY }),
    recipe('spinach', '蒜蓉菠菜', 2, 10, ['快手', '素菜'], [
      L('spinach', '菠菜', 300, 'g'), L('garlic', '蒜', 4, '瓣'), L('oystersauce', '蚝油', 1, '勺'),
      L('salt', '盐'), L('oil', '食用油', 1, '勺'),
    ], ['菠菜焯水 30 秒，捞出挤干。', '热油爆香蒜末，下菠菜和蚝油翻炒均匀。']),
    recipe('ribsoup', '冬瓜排骨汤', 3, 60, ['汤'], [
      L('ribs', '排骨', 500, 'g'), L('wintermelon', '冬瓜', 500, 'g'), L('ginger', '生姜', 3, '片'),
      L('wine', '料酒', 1, '勺'), L('scallion', '葱'), L('salt', '盐'),
    ], ['排骨冷水下锅，加料酒焯水。', '排骨和姜片加水，小火炖 40 分钟。', '加冬瓜再炖 15 分钟，加盐，撒葱。'],
    { cookedCount: 1, lastCookedAt: now - 1 * DAY }),
    recipe('mapo', '麻婆豆腐', 2, 20, ['下饭', '川菜'], [
      L('tofu', '嫩豆腐', 1, '盒'), L('mince', '猪肉末', 100, 'g'), L('doubanjiang', '豆瓣酱', 1, '勺'),
      L('sichuanpepper', '花椒'), L('starch', '淀粉', 1, '勺'), L('scallion', '葱'), L('oil', '食用油', 2, '勺'),
    ], ['豆腐切块，盐水焯 1 分钟。', '炒香肉末和豆瓣酱，加水和豆腐煮 5 分钟。', '水淀粉勾芡，撒花椒粉和葱。'],
    { cookedCount: 1, lastCookedAt: now - 25 * DAY }),
    recipe('scallionnoodle', '葱油拌面', 1, 15, ['快手', '面']
    , [
      L('noodle', '面条', 100, 'g'), L('scallion', '葱', 50, 'g'), L('soy', '生抽', 2, '勺'),
      L('darksoy', '老抽', 1, '勺'), L('sugar', '白糖', 1, '茶匙'), L('oil', '食用油', 3, '勺'),
    ], ['小火慢熬葱油 8 分钟，葱段焦黄捞出。', '加生抽、老抽、白糖煮开成酱汁。', '面煮熟拌上葱油酱汁。'],
    { cookedCount: 2, lastCookedAt: now - 14 * DAY }),
    recipe('milkegg', '牛奶炖蛋', 1, 15, ['甜品'], [
      L('milk', '牛奶', 200, 'ml'), L('egg', '鸡蛋', 2, '个'), L('sugar', '白糖', 1, '勺'),
    ], ['牛奶加糖温热，和蛋液混合过筛。', '盖保鲜膜，水开后中小火蒸 12 分钟。']),
  ];

  const P = (food: string, qty: number | undefined, location: PantryItem['location'], expiresIn: number | undefined, addedAgo: number): PantryItem => ({
    id: uid('p_'), foodId: 'f_' + food, qty, location,
    expiresAt: expiresIn == null ? undefined : addDays(T, expiresIn), addedAt: addDays(T, -addedAgo), extendedTimes: 0,
  });
  const S = (food: string, stock: 'have' | 'low'): PantryItem => ({
    id: uid('p_'), foodId: 'f_' + food, stock, location: 'room', addedAt: addDays(T, -30), extendedTimes: 0,
  });
  const pantry: PantryItem[] = [
    P('yogurt', 2, 'fridge', -1, 14), P('wing', 8, 'fridge', 1, 1), P('spinach', 300, 'fridge', 2, 2),
    P('milk', 1000, 'fridge', 3, 4), P('egg', 4, 'fridge', 12, 18), P('shrimp', 250, 'freezer', 45, 45),
    P('potato', 3, 'room', 10, 11), P('ginger', 100, 'fridge', 15, 6), P('scallion', 50, 'fridge', 4, 3),
    S('soy', 'have'), S('darksoy', 'have'), S('oil', 'low'), S('salt', 'have'), S('wine', 'have'),
    S('rice', 'low'), S('garlic', 'have'), S('sugar', 'have'), S('rocksugar', 'have'),
  ];

  const E = (key: string, inDays: number, slot: Slot, servings: number): MealPlanEntry => ({
    id: uid('m_'), date: addDays(T, inDays), slot, recipeId: 'demo_' + key, servings, order: 0, status: 'planned',
  });
  const plan: MealPlanEntry[] = [
    E('colawings', 0, 'dinner', 2), E('mapo', 1, 'dinner', 2), E('scallionnoodle', 2, 'lunch', 1),
    E('tomatoegg', 3, 'dinner', 2), E('ribsoup', 5, 'lunch', 3),
  ];

  const log = (daysAgo: number, slot: Slot, name: string, kcal: number, p = 0, f = 0, c = 0): MealLog => ({
    id: uid('l_'), date: addDays(T, -daysAgo), slot, source: 'manual',
    items: [{ name, kcalMin: kcal, kcalMax: kcal, protein: p, fat: f, carb: c }],
    adjustments: [], kcal, estimated: false, note: '示例', createdAt: now,
  });
  const logs: MealLog[] = [
    log(0, 'breakfast', '燕麦牛奶', 320, 14, 9, 45),
    ...[1720, 1540, 1980, 2100, 1650, 1600].map((k, i) => log(6 - i, 'dinner', '当天合计（示例）', k)),
  ];

  await db.transaction('rw', [db.recipes, db.pantry, db.plan, db.mealLogs], async () => {
    await db.recipes.bulkPut(recipes);
    // 常备品每种只留一条：已经有记录的就不再加
    const existingStaples = new Set((await db.pantry.toArray()).filter((p) => p.stock).map((p) => p.foodId));
    await db.pantry.bulkAdd(pantry.filter((p) => !(p.stock && existingStaples.has(p.foodId))));
    await db.plan.bulkAdd(plan);
    await db.mealLogs.bulkAdd(logs);
  });
  await updateSettings({ onboardingDone: true });
}
