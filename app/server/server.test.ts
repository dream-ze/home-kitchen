import { describe, expect, it } from 'vitest';
import app, { pickProvider } from './index';
import { extractJson, validate, withRetry } from './providers/json';
import { NotRecognizedError } from './providers/types';
import { GroceryResult, NutritionResult, RecipeResult } from './schemas';

const env = { AI_PROVIDER: 'mock', AI_BASE_URL: '', AI_MODEL: '', APP_TOKEN: 'secret' };
const img = 'A'.repeat(200);

function call(path: string, body?: unknown, token = 'secret', e: Record<string, unknown> = env) {
  return app.request(
    path,
    body === undefined
      ? { headers: { 'X-App-Token': token } }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Token': token }, body: JSON.stringify(body) },
    e,
  );
}

describe('访问口令', () => {
  it('口令不对返回 401', async () => {
    const r = await call('/api/health', undefined, 'wrong');
    expect(r.status).toBe(401);
    expect(((await r.json()) as { message: string }).message).toBe('访问口令不对');
  });
  it('服务器没设口令时一律拒绝', async () => {
    const r = await call('/api/health', undefined, 'secret', { ...env, APP_TOKEN: '' });
    expect(r.status).toBe(500);
  });
  it('CORS 预检不需要口令', async () => {
    const r = await app.request('/api/health', { method: 'OPTIONS', headers: { Origin: 'https://x.pages.dev', 'Access-Control-Request-Method': 'POST' } }, env);
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('接口（模拟模型）', () => {
  it('健康检查', async () => {
    const r = await call('/api/health');
    expect(await r.json()).toEqual({ ok: true, provider: 'mock', model: 'mock' });
  });
  it('截图识别菜谱', async () => {
    const r = await call('/api/recognize-recipe', { images: [img] });
    expect(r.status).toBe(200);
    const data = RecipeResult.parse(await r.json());
    expect(data.title).toBe('可乐鸡翅');
    expect(data.lines.some((l) => l.confidence < 0.6)).toBe(true);
  });
  it('粘贴文字', async () => {
    const r = await call('/api/parse-text', { text: '番茄炒蛋\n番茄 2个\n鸡蛋 3个\n葱 适量\n热油炒蛋，焖 2 分钟' });
    const data = RecipeResult.parse(await r.json());
    expect(data.title).toBe('番茄炒蛋');
    expect(data.lines.map((l) => l.name)).toEqual(['番茄', '鸡蛋', '葱']);
    expect(data.steps[0].timerSec).toBe(120);
  });
  it('拍照入库', async () => {
    const data = GroceryResult.parse(await (await call('/api/recognize-groceries', { images: [img] })).json());
    expect(data.sourceType).toBe('order');
    expect(data.items.find((i) => i.name === '抽纸')?.isFood).toBe(false);
  });
  it('估算营养', async () => {
    const data = NutritionResult.parse(await (await call('/api/estimate-nutrition', { name: '芦笋' })).json());
    expect(data.per100.kcal).toBeGreaterThan(0);
  });
  it('参数不对返回 400', async () => {
    expect((await call('/api/recognize-recipe', { images: [] })).status).toBe(400);
    expect((await call('/api/recognize-recipe', { images: [img, img, img, img, img] })).status).toBe(400);
    expect((await call('/api/parse-text', { text: '   ' })).status).toBe(400);
  });
});

describe('模型配置', () => {
  it('不认识的 AI_PROVIDER 报清楚的错', () => {
    expect(() => pickProvider({ ...env, AI_PROVIDER: 'gpt' })).toThrow(/AI_PROVIDER/);
  });
  it('真实模型没设密钥时报错', () => {
    expect(() => pickProvider({ ...env, AI_PROVIDER: 'anthropic' })).toThrow(/AI_KEY/);
    expect(() => pickProvider({ ...env, AI_PROVIDER: 'openai-compatible', AI_KEY: 'k' })).toThrow(/AI_BASE_URL/);
  });
  it('Claude 默认用 claude-opus-5-5', () => {
    expect(pickProvider({ ...env, AI_PROVIDER: 'anthropic', AI_KEY: 'k' }).model).toBe('claude-opus-5-5');
  });
});

describe('Claude 适配层的请求格式（拦截网络，不真正调用）', () => {
  it('带上模型、兜底、结构化输出和图片', async () => {
    const realFetch = globalThis.fetch;
    let captured: { url: string; headers: Headers; body: Record<string, unknown> } | null = null;
    const recipe = { title: '测试', servings: null, timeMin: null, lines: [], steps: [], warnings: [] };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      captured = { url: req.url, headers: req.headers, body: JSON.parse(await req.text()) };
      return new Response(
        JSON.stringify({
          id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify(recipe) }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;
    try {
      const r = await call('/api/recognize-recipe', { images: [img] }, 'secret', { ...env, AI_PROVIDER: 'anthropic', AI_KEY: 'sk-test' });
      expect(r.status).toBe(200);
      expect(((await r.json()) as { title: string }).title).toBe('测试');
    } finally {
      globalThis.fetch = realFetch;
    }
    const c = captured!;
    expect(c.url).toContain('/v1/messages');
    // SDK 1.x 用 Authorization: Bearer 发送密钥；旧版用 x-api-key
    expect([c.headers.get('x-api-key'), c.headers.get('authorization')]).toContain(c.headers.get('x-api-key') ? 'sk-test' : 'Bearer sk-test');
    expect(c.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(c.body.model).toBe('claude-opus-5-5');
    expect(c.body.fallbacks).toBe('default');
    const oc = c.body.output_config as { effort: string; format: { type: string; schema: { properties: Record<string, unknown> } } };
    expect(oc.effort).toBe('low');
    expect(oc.format.type).toBe('json_schema');
    expect(Object.keys(oc.format.schema.properties)).toContain('lines');
    const content = (c.body.messages as { content: { type: string; source?: { media_type: string } }[] }[])[0].content;
    expect(content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg' } });
    expect(content[1].type).toBe('text');
  });
});

describe('解析模型输出', () => {
  it('兼容代码块和多余文字', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('好的，结果如下：{"a":2} 希望有帮助')).toEqual({ a: 2 });
    expect(() => extractJson('没有 JSON')).toThrow(NotRecognizedError);
  });
  it('格式不对时报“认不出来”', () => {
    expect(() => validate(RecipeResult, { title: 1 })).toThrow(NotRecognizedError);
  });
  it('格式不对重试一次，再失败才放弃', async () => {
    let n = 0;
    const ok = await withRetry(async () => {
      n++;
      if (n === 1) throw new NotRecognizedError('x');
      return 'ok';
    });
    expect([ok, n]).toEqual(['ok', 2]);
    let m = 0;
    await expect(withRetry(async () => { m++; throw new NotRecognizedError('y'); })).rejects.toThrow('y');
    expect(m).toBe(2);
  });
});
