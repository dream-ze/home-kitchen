import { db } from '../db/db';
import { DEFAULT_SETTINGS, type Settings } from '../db/types';

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await db.settings.get('app')) ?? {}) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, key: 'app' });
}
