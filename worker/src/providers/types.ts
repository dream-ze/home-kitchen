import type { z } from 'zod';

export interface Env {
  AI_PROVIDER: string;
  AI_BASE_URL: string;
  AI_MODEL: string;
  AI_KEY?: string;
  APP_TOKEN?: string;
}

/** 一次识别任务：系统提示、用户文字、可选的图片（base64 JPEG），以及输出必须符合的格式 */
export interface Task<T> {
  kind: 'recipe' | 'groceries' | 'nutrition';
  system: string;
  text: string;
  images: string[];
  schema: z.ZodType<T>;
}

export interface Provider {
  name: string;
  model: string;
  generate<T>(task: Task<T>): Promise<T>;
}

/** 模型拒答、输出不合格式等"认不出来"的情况 */
export class NotRecognizedError extends Error {}
/** 上游服务出错（密钥不对、限流、网络等） */
export class UpstreamError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}
