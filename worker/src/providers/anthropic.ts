// Claude（Anthropic 官方 SDK）。结构化输出约束格式，服务端兜底处理拒答。
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { validate, extractJson, withRetry } from './json';
import { NotRecognizedError, UpstreamError, type Env, type Provider, type Task } from './types';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

export function anthropicProvider(env: Env): Provider {
  if (!env.AI_KEY) throw new UpstreamError('服务器上还没有设置 AI_KEY', 500);
  const client = new Anthropic({ apiKey: env.AI_KEY, maxRetries: 1, timeout: 45_000 });
  const model = env.AI_MODEL || DEFAULT_CLAUDE_MODEL;

  return {
    name: 'anthropic',
    model,
    generate<T>(task: Task<T>): Promise<T> {
      return withRetry(async () => {
        const content: Anthropic.Beta.BetaContentBlockParam[] = [
          ...task.images.map((data) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
          })),
          { type: 'text' as const, text: task.text },
        ];
        let response: Anthropic.Beta.BetaMessage;
        try {
          response = await client.beta.messages.create({
            model,
            max_tokens: 16000,
            // 拒答时由服务端按类别自动换一个模型重试
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system: task.system,
            // 提取类任务：低 effort 就够，快也省钱
            output_config: { effort: 'low', format: zodOutputFormat(task.schema as never) },
            messages: [{ role: 'user', content }],
          });
        } catch (e) {
          if (e instanceof Anthropic.AuthenticationError) throw new UpstreamError('AI_KEY 不对', 502);
          if (e instanceof Anthropic.RateLimitError) throw new UpstreamError('调用太频繁，稍后再试', 429);
          if (e instanceof Anthropic.APIConnectionTimeoutError) throw new UpstreamError('模型响应超时', 504);
          if (e instanceof Anthropic.APIError) throw new UpstreamError(`模型服务出错（${e.status ?? '网络'}）`, 502);
          throw e;
        }
        if (response.stop_reason === 'refusal') throw new NotRecognizedError('模型拒绝处理这张图');
        if (response.stop_reason === 'max_tokens') throw new NotRecognizedError('内容太长，没整理完');
        const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        if (!text.trim()) throw new NotRecognizedError('模型没有返回内容');
        return validate(task.schema, extractJson(text));
      });
    },
  };
}
