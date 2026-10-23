// 备份与恢复（SPEC §3.1、PRD F7）。
import { db, DATA_TABLES } from '../db/db';
import { todayISO } from '../logic/dates';
import { updateSettings } from './settings';

interface BackupFile {
  app: 'shipu';
  schema: 1;
  exportedAt: number;
  tables: Record<string, unknown[]>;
  blobs?: { id: string; dataUrl: string }[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportBackup(includeImages: boolean): Promise<File> {
  const tables: Record<string, unknown[]> = {};
  for (const name of DATA_TABLES) tables[name] = await db.table(name).toArray();
  // 访问口令不进备份文件
  tables.settings = (tables.settings as Record<string, unknown>[]).map((s) => ({ ...s, appToken: '', workerUrl: '' }));
  const data: BackupFile = { app: 'shipu', schema: 1, exportedAt: Date.now(), tables };
  if (includeImages) {
    data.blobs = await Promise.all((await db.blobs.toArray()).map(async (b) => ({ id: b.id, dataUrl: await blobToDataUrl(b.data) })));
  }
  return new File([JSON.stringify(data)], `食谱备份-${todayISO()}.json`, { type: 'application/json' });
}

/** 通过系统分享面板存到"文件"或 iCloud；不支持时直接下载 */
export async function shareBackup(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      throw e;
    }
    await updateSettings({ lastBackupAt: Date.now() });
    return 'shared';
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  await updateSettings({ lastBackupAt: Date.now() });
  return 'downloaded';
}

export async function readBackup(file: File): Promise<BackupFile> {
  let data: BackupFile;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('这个文件不是有效的备份');
  }
  if (data?.app !== 'shipu' || !data.tables) throw new Error('这个文件不是食谱的备份');
  return data;
}

export function summarize(data: BackupFile) {
  const n = (k: string) => data.tables[k]?.length ?? 0;
  return {
    recipes: n('recipes'), pantry: n('pantry'), shopping: n('shopping'), plan: n('plan'),
    logs: n('mealLogs'), images: data.blobs?.length ?? 0, exportedAt: data.exportedAt,
  };
}

export async function restoreBackup(data: BackupFile): Promise<void> {
  const blobs = data.blobs
    ? await Promise.all(data.blobs.map(async (b) => ({ id: b.id, data: await (await fetch(b.dataUrl)).blob() })))
    : null;
  const tables = DATA_TABLES.map((t) => db.table(t));
  const current = await db.settings.get('app');
  await db.transaction('rw', [...tables, db.blobs], async () => {
    for (const name of DATA_TABLES) {
      await db.table(name).clear();
      await db.table(name).bulkPut(data.tables[name] ?? []);
    }
    // 备份里没有访问口令，恢复后沿用手机上现在的
    const restored = await db.settings.get('app');
    if (restored && current) await db.settings.put({ ...restored, appToken: current.appToken, workerUrl: current.workerUrl });
    // 备份里没带图片时，保留手机上已有的图片
    if (blobs) {
      await db.blobs.clear();
      await db.blobs.bulkPut(blobs);
    }
  });
}
