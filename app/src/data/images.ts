// 图片在手机上先压缩（长边 ≤1600，JPEG），既省流量也省模型费用（SPEC §3.1）。
import { db } from '../db/db';
import { uid } from '../logic/id';

export async function compressImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片压缩失败'))), 'image/jpeg', quality),
  );
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export interface PreparedImage {
  blobId: string;
  base64: string;
}

/** 压缩、存进本机、并转成 base64 准备上传 */
export async function prepareImages(files: Blob[]): Promise<PreparedImage[]> {
  const out: PreparedImage[] = [];
  for (const f of files) {
    const blob = await compressImage(f);
    const blobId = uid('b_');
    await db.blobs.add({ id: blobId, data: blob });
    out.push({ blobId, base64: await blobToBase64(blob) });
  }
  return out;
}

export async function discardImages(ids: string[]): Promise<void> {
  await db.blobs.bulkDelete(ids);
}
