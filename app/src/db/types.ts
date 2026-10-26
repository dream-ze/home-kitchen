// 数据结构，对应 SPEC §4。

export type Location = 'fridge' | 'freezer' | 'room';
export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type BaseUnit = 'g' | 'ml' | '个';

export interface Nutrition {
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
}

export interface Conversion {
  unit: string;
  toBase: number;
}

export interface Food {
  id: string;
  name: string;
  aliases: string[];
  pinyinInitials: string[];
  section: string;
  sectionLearned: boolean;
  kind: 'staple' | 'tracked';
  baseUnit: BaseUnit;
  /** 1 个基础单位有多少克，用来算营养；g 为 1，ml 按密度，个 按单个重量 */
  gPerBase: number;
  conversions: Conversion[];
  per100: Nutrition | null;
  /** tw 台湾食品营养成分资料库；usda USDA FoodData Central；sample 第一版的样本参考值，升级时会被替换 */
  nutritionSource: 'tw' | 'usda' | 'ai' | 'manual' | 'sample';
  /** 内置食材的数据出处，如 'tw:E7400102' */
  nutritionRef?: string;
  shelfDays: Partial<Record<Location, number>>;
  defaultLocation: Location;
  purchaseUnit?: Conversion;
}

export interface RecipeLine {
  foodId?: string;
  qty?: number;
  unit?: string;
  note?: string;
  originalText: string;
  noAmount: boolean;
  isHeader: boolean;
  confidence?: number;
}

export interface RecipeStep {
  text: string;
  timerSec?: number;
  imageBlobId?: string;
}

export interface Recipe {
  id: string;
  title: string;
  servings: number;
  timeMin?: number;
  difficulty?: string;
  lines: RecipeLine[];
  steps: RecipeStep[];
  tags: string[];
  note?: string;
  source?: string;
  coverBlobId?: string;
  sourceBlobIds: string[];
  cookedCount: number;
  lastCookedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type PlanStatus = 'planned' | 'cooked' | 'eaten' | 'skipped';

export interface MealPlanEntry {
  id: string;
  date: string; // YYYY-MM-DD
  slot: Slot;
  recipeId: string;
  servings: number;
  order: number;
  status: PlanStatus;
  mealLogId?: string;
  stockTxnId?: string;
}

export interface CookSession {
  id: string;
  recipeId: string;
  planEntryId?: string;
  servings: number;
  stepIndex: number;
  checkedLines: number[];
  /** rang：到点后已经响过铃，重新打开应用不再响 */
  timers: { stepIndex: number; endsAt: number; pausedRemain?: number; rang?: boolean }[];
  startedAt: number;
  updatedAt: number;
}

export interface ShoppingSource {
  planEntryId?: string;
  recipeId?: string;
  qty: number; // 基础单位
}

export type ShoppingOrigin = 'plan' | 'manual' | 'staple' | 'tossed' | 'recipe' | 'scan';

export interface ShoppingItem {
  id: string;
  foodId?: string;
  text?: string;
  /** 要买的量（基础单位）；undefined 表示"适量"或不计量 */
  qty?: number;
  unit?: string;
  section: string;
  sources: ShoppingSource[];
  need?: number;
  have?: number;
  state: 'need' | 'have';
  bought: boolean;
  boughtAt?: number;
  origin: ShoppingOrigin;
  unconvertible?: boolean;
  createdAt: number;
}

export interface PantryItem {
  id: string;
  foodId: string;
  qty?: number; // 基础单位，仅计量食材
  stock?: 'have' | 'low'; // 仅常备品
  location: Location;
  expiresAt?: string; // YYYY-MM-DD
  addedAt: string; // YYYY-MM-DD
  extendedTimes: number;
}

export type PantryReason = 'cook' | 'eaten' | 'used' | 'tossed' | 'stockin' | 'manual' | 'extend';

export interface PantryEvent {
  id: string;
  txnId: string;
  foodId: string;
  delta: number;
  reason: PantryReason;
  source?: 'list' | 'scan' | 'manual';
  /** 改动前的完整记录；新建的条目为 null。撤销时用它还原 */
  before: PantryItem | null;
  /** 改动后的记录；删除时为 null */
  after: PantryItem | null;
  at: number;
}

export interface MealLogItem {
  name: string;
  grams?: number;
  gramsMin?: number;
  gramsMax?: number;
  kcalMin: number;
  kcalMax: number;
  protein?: number;
  fat?: number;
  carb?: number;
}

export interface MealLog {
  id: string;
  date: string;
  slot: Slot;
  source: 'recipe' | 'photo' | 'manual' | 'copy';
  recipeId?: string;
  planEntryId?: string;
  servingsEaten?: number;
  photoBlobId?: string;
  items: MealLogItem[];
  adjustments: { type: 'half' | 'oil' | 'missing' | 'correction'; kcal: number; note?: string }[];
  kcal: number;
  estimated: boolean;
  note?: string;
  /** 离线时先存下照片，联网后再估算 */
  pending?: boolean;
  /** 拍照记录的原始估算和调整，重新打开时用来还原 */
  photoDraft?: PhotoDraft;
  createdAt: number;
}

/** 拍照记录里的一道菜：区间是 1 份的量，portion 是份量系数 */
export interface PhotoDraftItem {
  key: string;
  name: string;
  gramsMin: number;
  gramsMax: number;
  kcalMin: number;
  kcalMax: number;
  protein?: number;
  fat?: number;
  carb?: number;
  portion: number;
  /** 用户在"漏了什么"里补的 */
  extra?: boolean;
}

export interface PhotoDraft {
  items: PhotoDraftItem[];
  half: boolean;
  oilSpoons: number;
  notes: string[];
}

export interface PurchaseStat {
  foodId: string;
  count: number;
  lastAt: number;
}

export interface BlobRecord {
  id: string;
  data: Blob;
}

export interface Settings {
  key: 'app';
  workerUrl: string;
  appToken: string;
  lastBackupAt?: number;
  backupRemindDays: number;
  backupIncludeImages: boolean;
  expiryWarnDays: number;
  sectionOrder: string[];
  showMacros: boolean;
  oilHint: boolean;
  onboardingDone: boolean;
  /** 内置食材库的版本，升级食材库时用（SEED_VERSION） */
  seedVersion?: number;
  /** 购物页"长按拖到别的分区"提示已经显示过几次 */
  sectionHintShown?: number;
}

export const SLOTS: { key: Slot; label: string }[] = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' },
];

export const LOCATIONS: { key: Location; label: string }[] = [
  { key: 'fridge', label: '冷藏' },
  { key: 'freezer', label: '冷冻' },
  { key: 'room', label: '常温' },
];

export const DEFAULT_SECTIONS = ['蔬菜水果', '肉蛋豆制品', '水产', '乳制品', '主食干货', '调料', '其他'];

export const DEFAULT_SETTINGS: Settings = {
  key: 'app',
  workerUrl: '',
  appToken: '',
  backupRemindDays: 7,
  backupIncludeImages: false,
  expiryWarnDays: 3,
  sectionOrder: DEFAULT_SECTIONS,
  showMacros: true,
  oilHint: true,
  onboardingDone: false,
};
