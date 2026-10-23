import type { z } from 'zod';
import { NotRecognizedError } from './types';

/** 从模型回复里取出 JSON：兼容 ```json 代码块和前后多余的文字 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        // 落到下面统一报错
      }
    }
    throw new NotRecognizedError('模型返回的不是有效的 JSON');
  }
}

export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new NotRecognizedError('模型返回的格式不对：' + r.error.issues.slice(0, 3).map((i) => i.path.join('.') + ' ' + i.message).join('；'));
  return r.data;
}

/** 输出不合格式时重试一次（SPEC §3） */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NotRecognizedError) return fn();
    throw e;
  }
}
