// 饮食记录：拍照记录的保存、修改、删除，离线时先存照片（PRD P12）。
import { db } from '../db/db';
import type { BlobRecord, MealLog, PhotoDraft, Slot } from '../db/types';
import { uid } from '../logic/id';
import { draftToLog } from '../logic/meal';
import { blobToBase64, compressImage, type PreparedImage } from './images';
import type { Undo } from './shopping';

let mealPhoto: PreparedImage | null = null;

/** 饭菜照片：长边 1280 就够看清，存在本机，修改记录时还能看到 */
export async function prepareMealPhoto(file: Blob): Promise<PreparedImage> {
  const blob = await compressImage(file, 1280, 0.8);
  const blobId = uid('b_');
  await db.blobs.add({ id: blobId, data: blob });
  return { blobId, base64: await blobToBase64(blob) };
}

/** 选好照片，交给拍照记录页。只放在内存里，页面刷新就没了 */
export function startMealPhoto(photo: PreparedImage): void {
  mealPhoto = photo;
}

export function takeMealPhoto(): PreparedImage | null {
  const p = mealPhoto;
  mealPhoto = null;
  return p;
}

export async function photoBase64(blobId: string): Promise<string | undefined> {
  const b = await db.blobs.get(blobId);
  return b ? blobToBase64(b.data) : undefined;
}

/** 离线：先记一条待估算的记录，联网后在今天页点它再估算 */
export async function savePendingPhoto(blobId: string, date: string, slot: Slot): Promise<Undo> {
  const log: MealLog = {
    id: uid('l_'), date, slot, source: 'photo', photoBlobId: blobId, items: [], adjustments: [], kcal: 0,
    estimated: true, pending: true, createdAt: Date.now(),
  };
  await db.mealLogs.add(log);
  return async () => {
    await db.mealLogs.delete(log.id);
    await db.blobs.delete(blobId);
  };
}

/** 保存拍照记录。id 已存在就是修改（包括待估算的记录） */
export async function saveMealLog(p: { id?: string; date: string; slot: Slot; draft: PhotoDraft; photoBlobId?: string }): Promise<{ undo: Undo; kcal: number }> {
  const computed = draftToLog(p.draft);
  const before = p.id ? await db.mealLogs.get(p.id) : undefined;
  const log: MealLog = {
    ...(before ?? { id: uid('l_'), source: 'photo', createdAt: Date.now() }),
    date: p.date, slot: p.slot, photoBlobId: p.photoBlobId ?? before?.photoBlobId,
    ...computed, estimated: true, pending: undefined, photoDraft: p.draft,
  } as MealLog;
  await db.mealLogs.put(log);
  return {
    kcal: log.kcal,
    undo: async () => {
      if (before) await db.mealLogs.put(before);
      else {
        await db.mealLogs.delete(log.id);
        if (log.photoBlobId) await db.blobs.delete(log.photoBlobId);
      }
    },
  };
}

/** 删除一条记录，连照片一起删；撤销时都放回去 */
export async function deleteMealLog(id: string): Promise<Undo> {
  const log = await db.mealLogs.get(id);
  if (!log) return async () => {};
  let blob: BlobRecord | undefined;
  await db.transaction('rw', db.mealLogs, db.blobs, async () => {
    if (log.photoBlobId) {
      blob = await db.blobs.get(log.photoBlobId);
      // 复制出来的记录和原记录共用一张照片，还有别的记录在用就不删
      const shared = await db.mealLogs.filter((l) => l.id !== id && l.photoBlobId === log.photoBlobId).count();
      if (shared) blob = undefined;
      else await db.blobs.delete(log.photoBlobId);
    }
    await db.mealLogs.delete(id);
  });
  return async () => {
    await db.transaction('rw', db.mealLogs, db.blobs, async () => {
      if (blob) await db.blobs.put(blob);
      await db.mealLogs.put(log);
    });
  };
}

/** 按菜谱记的：改吃了几份，热量和三大营养素按比例变 */
export async function setLogServings(id: string, servings: number): Promise<void> {
  const log = await db.mealLogs.get(id);
  if (!log) return;
  const k = servings / (log.servingsEaten || 1);
  const items = log.items.map((i) => ({
    ...i,
    kcalMin: i.kcalMin * k, kcalMax: i.kcalMax * k,
    protein: i.protein != null ? i.protein * k : undefined,
    fat: i.fat != null ? i.fat * k : undefined,
    carb: i.carb != null ? i.carb * k : undefined,
  }));
  await db.mealLogs.put({ ...log, servingsEaten: servings, items, kcal: log.kcal * k });
}
