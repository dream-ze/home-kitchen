// OpenAI 兼容格式：DeepSeek、通义千问（DashScope 兼容模式）、豆包（火山方舟）、OpenAI 等。
// 这类接口的结构化输出支持程度不一，所以把 JSON Schema 写进提示词，再用 JSON 模式 + 校验 + 重试兜底。
import { z } from 'zod';
import { extractJson, validate, withRetry } from './json';
import { NotRecognizedError, UpstreamError, type Env, type Provider, type Task } from './types';

export function openaiCompatibleProvider(env: Env): Provider {
  if (!env.AI_KEY) throw new UpstreamError('服务器上还没有设置 AI_KEY', 500);
  if (!env.AI_BASE_URL || !env.AI_MODEL) throw new UpstreamError('openai-compatible 需要同时设置 AI_BASE_URL 和 AI_MODEL', 500);
  const url = env.AI_BASE_URL.replace(/\/+$/, '') + '/chat/completions';

  return {
    name: 'openai-compatible',
    model: env.AI_MODEL,
    generate<T>(task: Task<T>): Promise<T> {
      const schema = JSON.stringify(z.toJSONSchema(task.schema as z.ZodType));
      // DeepSeek 的 JSON 模式要求提示词里出现小写的 "json"；它偶尔返回空内容，由 withRetry 重试兜底
      const system = `${task.system}\n\n只输出一个 json 对象，不要输出任何其他文字。json 必须符合这个 JSON Schema：\n${schema}`;
      return withRetry(async () => {
        const content = [
          ...task.images.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } })),
          { type: 'text', text: task.text },
        ];
        let res: Response;
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_KEY}` },
            body: JSON.stringify({
              model: env.AI_MODEL,
              temperature: 0.1,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: task.images.length ? content : task.text },
              ],
            }),
            signal: AbortSignal.timeout(45_000),
          });
        } catch (e) {
          if ((e as Error).name === 'TimeoutError') throw new UpstreamError('模型响应超时', 504);
          throw new UpstreamError('连不上模型服务', 502);
        }
        if (res.status === 401 || res.status === 403) throw new UpstreamError('AI_KEY 不对', 502);
        if (res.status === 429) throw new UpstreamError('调用太频繁，稍后再试', 429);
        if (!res.ok) throw new UpstreamError(`模型服务出错（${res.status}）`, 502);
        const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
        const choice = data.choices?.[0];
        if (choice?.finish_reason === 'content_filter') throw new NotRecognizedError('模型拒绝处理这张图');
        const text = choice?.message?.content ?? '';
        if (!text.trim()) throw new NotRecognizedError('模型没有返回内容');
        return validate(task.schema, extractJson(text));
      });
    },
  };
}
