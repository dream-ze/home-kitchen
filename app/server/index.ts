// 食谱 · AI 服务（SPEC §3、§6）。作为 Cloudflare Pages 的服务端功能运行（入口 functions/api/[[path]].ts），
// 和网页同一个网址。手机只和这里通信，模型密钥只放在服务器上。
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import * as P from './prompts';
import { anthropicProvider } from './providers/anthropic';
import { mockProvider } from './providers/mock';
import { openaiCompatibleProvider } from './providers/openaiCompatible';
import { NotRecognizedError, UpstreamError, type Env, type Provider } from './providers/types';
import { GroceryResult, ImagesBody, NameBody, NutritionResult, RecipeResult, TextBody } from './schemas';

export function pickProvider(env: Env): Provider {
  switch (env.AI_PROVIDER) {
    case 'anthropic':
      return anthropicProvider(env);
    case 'openai-compatible':
      return openaiCompatibleProvider(env);
    case 'mock':
      return mockProvider();
    default:
      throw new UpstreamError(`AI_PROVIDER 只能是 anthropic、openai-compatible 或 mock，现在是“${env.AI_PROVIDER}”`, 500);
  }
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors({ origin: '*', allowHeaders: ['Content-Type', 'X-App-Token'], allowMethods: ['GET', 'POST', 'OPTIONS'], maxAge: 86400 }));

// 访问口令：没设置口令时拒绝所有请求，避免额度被别人用掉
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const token = c.env.APP_TOKEN;
  if (!token) return c.json({ error: 'server_misconfigured', message: '服务器上还没有设置 APP_TOKEN' }, 500);
  if (c.req.header('X-App-Token') !== token) return c.json({ error: 'unauthorized', message: '访问口令不对' }, 401);
  return next();
});

async function body<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    throw new BadRequest('请求内容不是 JSON');
  }
  const r = schema.safeParse(data);
  if (!r.success) throw new BadRequest('请求参数不对：' + r.error.issues[0]?.message);
  return r.data;
}

class BadRequest extends Error {}

app.get('/api/health', (c) => {
  const p = pickProvider(c.env);
  return c.json({ ok: true, provider: p.name, model: p.model });
});

app.post('/api/recognize-recipe', async (c) => {
  const { images } = await body(c, ImagesBody);
  const out = await pickProvider(c.env).generate({ kind: 'recipe', system: P.RECIPE_SYSTEM, text: P.RECIPE_IMAGE_TEXT, images, schema: RecipeResult });
  return c.json(out);
});

app.post('/api/parse-text', async (c) => {
  const { text } = await body(c, TextBody);
  const out = await pickProvider(c.env).generate({ kind: 'recipe', system: P.RECIPE_SYSTEM, text: P.RECIPE_TEXT_PREFIX + text, images: [], schema: RecipeResult });
  return c.json(out);
});

app.post('/api/recognize-groceries', async (c) => {
  const { images } = await body(c, ImagesBody);
  const out = await pickProvider(c.env).generate({ kind: 'groceries', system: P.GROCERY_SYSTEM, text: P.GROCERY_TEXT, images, schema: GroceryResult });
  return c.json(out);
});

app.post('/api/estimate-nutrition', async (c) => {
  const { name } = await body(c, NameBody);
  const out = await pickProvider(c.env).generate({ kind: 'nutrition', system: P.NUTRITION_SYSTEM, text: `食材：${name}`, images: [], schema: NutritionResult });
  return c.json(out);
});

app.notFound((c) => c.json({ error: 'not_found', message: '没有这个接口' }, 404));

app.onError((e, c) => {
  if (e instanceof BadRequest) return c.json({ error: 'bad_request', message: e.message }, 400);
  if (e instanceof NotRecognizedError) return c.json({ error: 'not_recognized', message: e.message }, 422);
  if (e instanceof UpstreamError) return c.json({ error: 'upstream', message: e.message }, e.status as 500);
  console.error(e);
  return c.json({ error: 'internal', message: '服务器出错了' }, 500);
});

export default app;
