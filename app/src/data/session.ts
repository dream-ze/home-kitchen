// 识别会话：从"选图/粘贴"跳到核对页时，把图片和文字交给下一页。
// 只放在内存里；核对页刷新后会话就没了，页面会提示重新选。
import type { Settings } from '../db/types';
import { getSettings } from './settings';
import { prepareImages, type PreparedImage } from './images';

export interface ImportSession {
  images: PreparedImage[];
  text?: string;
}

export interface ScanSession {
  images: PreparedImage[];
  mode: 'list' | 'fridge';
}

let importSession: ImportSession | null = null;
let scanSession: ScanSession | null = null;

export const MAX_IMAGES = 4;

/** 开始之前先检查：有没有配置 AI、有没有联网。返回不能开始的原因 */
export function aiBlockerFor(s: Pick<Settings, 'appToken'>): string | null {
  if (!s.appToken) return '还没填 AI 服务的访问口令，先去设置里填好';
  if (!navigator.onLine) return '需要联网才能识别';
  return null;
}

export async function aiBlocker(): Promise<string | null> {
  return aiBlockerFor(await getSettings());
}

export async function startImageImport(files: Blob[]): Promise<void> {
  importSession = { images: await prepareImages(files.slice(0, MAX_IMAGES)) };
}

export function startTextImport(text: string): void {
  importSession = { images: [], text };
}

export function takeImportSession(): ImportSession | null {
  return importSession;
}

export async function startScan(files: Blob[], mode: 'list' | 'fridge'): Promise<void> {
  scanSession = { images: await prepareImages(files.slice(0, MAX_IMAGES)), mode };
}

export function takeScanSession(): ScanSession | null {
  return scanSession;
}

export function clearSessions(): void {
  importSession = null;
  scanSession = null;
}
