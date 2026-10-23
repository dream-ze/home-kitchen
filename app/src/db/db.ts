import Dexie, { type Table } from 'dexie';
import type {
  BlobRecord, CookSession, Food, MealLog, MealPlanEntry, PantryEvent, PantryItem,
  PurchaseStat, Recipe, Settings, ShoppingItem,
} from './types';

export class AppDB extends Dexie {
  foods!: Table<Food, string>;
  recipes!: Table<Recipe, string>;
  plan!: Table<MealPlanEntry, string>;
  cookSessions!: Table<CookSession, string>;
  shopping!: Table<ShoppingItem, string>;
  pantry!: Table<PantryItem, string>;
  pantryEvents!: Table<PantryEvent, string>;
  mealLogs!: Table<MealLog, string>;
  purchaseStats!: Table<PurchaseStat, string>;
  blobs!: Table<BlobRecord, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('shipu');
    this.version(1).stores({
      foods: 'id, name, kind, section',
      recipes: 'id, title, updatedAt',
      plan: 'id, date, recipeId, status',
      cookSessions: 'id',
      shopping: 'id, foodId, origin',
      pantry: 'id, foodId, location',
      pantryEvents: 'id, txnId, foodId, at',
      mealLogs: 'id, date, planEntryId',
      purchaseStats: 'foodId',
      blobs: 'id',
      settings: 'key',
    });
  }
}

export const db = new AppDB();

/** 备份和恢复时要处理的表 */
export const DATA_TABLES = [
  'foods', 'recipes', 'plan', 'cookSessions', 'shopping', 'pantry',
  'pantryEvents', 'mealLogs', 'purchaseStats', 'settings',
] as const;
