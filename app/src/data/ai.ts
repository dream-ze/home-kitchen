// 调用 AI 服务（默认就是本站的 /api，也可以在设置里填别的地址）。错误一律转成能直接给人看的中文（PRD §6）。
import { getSettings } from './settings';

export interface AiRecipe {
  title: string;
  servings: number | null;
  timeMin: number | null;
  lines: {
    name: string;
    qty: number | null;
    unit: string | null;
    note: string | null;
    originalText: string;
    noAmount: boolean;
    isHeader: boolean;
    confidence: number;
  }[];
  steps: { text: string; timerSec: number | null }[];
  warnings: string[];
}

export interface AiGroceryItem {
  name: string;
  rawName: string;
  qty: number | null;
  unit: string | null;
  isFood: boolean;
  confidence: number;
}

export interface AiGroceries {
  sourceType: 'receipt' | 'order' | 'photo';
  items: AiGroceryItem[];
  warnings: string[];
}

export interface AiNutrition {
  per100: { kcal: number; protein: number; fat: number; carb: number };
  baseUnit: 'g' | 'ml' | '个';
  gPerBase: number;
  section: string;
  kind: 'staple' | 'tracked';
  defaultLocation: 'fridge' | 'freezer' | 'room';
  shelfDays: { fridge: number | null; freezer: number | null; room: number | null };
  conversions: { unit: string; toBase: number }[];
  aliases: string[];
}

export interface AiMealItem {
  name: string;
  gramsMin: number;
  gramsMax: number;
  kcalMin: number;
  kcalMax: number;
  protein: number;
  fat: number;
  carb: number;
}

export interface AiMeal {
  items: AiMealItem[];
  notes: string[];
}

export interface MealRequest {
  image?: string;
  text?: string;
  correction?: string;
  previous?: AiMeal;
}

export type AiErrorCode = 'not_configured' | 'offline' | 'unauthorized' | 'not_recognized' | 'timeout' | 'server' | 'bad_request';

export class AiError extends Error {
  constructor(readonly code: AiErrorCode, message: string) {
    super(message);
  }
}

const TIMEOUT_MS = 50_000; // 比 Worker 的 45 秒长一点，超时时能拿到 Worker 给的具体原因

async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const s = await getSettings();
  if (!s.appToken) throw new AiError('not_configured', '还没填 AI 服务的访问口令，先去设置里填好');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiError('offline', '需要联网才能识别');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), TIMEOUT_MS);
  signal?.addEventListener('abort', () => ctrl.abort(signal.reason));
  let res: Response;
  try {
    res = await fetch(s.workerUrl.trim().replace(/\/+$/, '') + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': s.appToken },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    if ((ctrl.signal.reason as Error | undefined)?.name === 'TimeoutError') throw new AiError('timeout', '等太久了，没认出来，再试一次吧');
    throw new AiError('offline', '连不上 AI 服务，检查一下网络和服务地址');
  } finally {
    clearTimeout(timer);
  }
  let data: { message?: string } & Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // 非 JSON 响应，按状态码处理
  }
  if (res.ok) return data as T;
  const msg = typeof data.message === 'string' ? data.message : '';
  if (res.status === 401) throw new AiError('unauthorized', '访问口令不对，去设置里看看');
  if (res.status === 404) throw new AiError('server', '找不到 AI 服务，检查一下设置里的服务地址（留空就是用本站）');
  if (res.status === 422) throw new AiError('not_recognized', '没认出来' + (msg ? `：${msg}` : ''));
  if (res.status === 400) throw new AiError('bad_request', msg || '请求有问题');
  if (res.status === 504) throw new AiError('timeout', '等太久了，没认出来，再试一次吧');
  throw new AiError('server', msg || `AI 服务出错了（${res.status}）`);
}

export const ai = {
  health: () => call<{ ok: boolean; provider: string; model: string }>('/api/health'),
  recognizeRecipe: (images: string[], signal?: AbortSignal) => call<AiRecipe>('/api/recognize-recipe', { images }, signal),
  parseText: (text: string, signal?: AbortSignal) => call<AiRecipe>('/api/parse-text', { text }, signal),
  recognizeGroceries: (images: string[], signal?: AbortSignal) => call<AiGroceries>('/api/recognize-groceries', { images }, signal),
  estimateNutrition: (name: string) => call<AiNutrition>('/api/estimate-nutrition', { name }),
  estimateMeal: (req: MealRequest, signal?: AbortSignal) => call<AiMeal>('/api/estimate-meal', req, signal),
};

export function errorText(e: unknown): string {
  if (e instanceof AiError) return e.message;
  return '出了点问题：' + String((e as Error)?.message ?? e);
}
