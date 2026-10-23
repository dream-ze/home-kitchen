# 食谱 · AI 代理（Cloudflare Worker）

手机上的应用只和这里通信，模型的密钥只放在服务器上。接口说明见 [../SPEC.md](../SPEC.md) §6。

| 接口 | 用途 |
|---|---|
| `GET /api/health` | 测试连接，返回现在用的是哪家模型 |
| `POST /api/recognize-recipe` | 截图识别菜谱（1–4 张图） |
| `POST /api/parse-text` | 粘贴文字整理成菜谱 |
| `POST /api/recognize-groceries` | 拍照入库：小票、订单截图、实物照片 |
| `POST /api/estimate-nutrition` | 新食材估算营养和保质期 |

每个请求都要带 `X-App-Token` 请求头（访问口令）。模型的输出都先经过格式校验，不合格会自动重试一次。

## 本地运行（不需要任何账号）

```bash
npm install
cp .dev.vars.example .dev.vars   # 本地口令默认 dev-token
npm run dev                      # http://127.0.0.1:8787
npm test
```

`wrangler.toml` 里默认是 `AI_PROVIDER = "mock"`（模拟模型）。它不联网，会返回固定的示例结果，方便在没有密钥时把流程走通。手机端设置里填 `http://127.0.0.1:8787` 和 `dev-token` 就能连上。

## 部署

部署前要准备好两样：Cloudflare 账号（免费），以及一家 AI 服务商的 API Key。

1. **选模型**：改 `wrangler.toml` 里的 `[vars]`，三种写法如下。

   **Claude**：

   ```toml
   AI_PROVIDER = "anthropic"
   AI_MODEL = ""              # 留空默认 claude-opus-5-5
   ```

   **通义千问**（阿里云百炼，OpenAI 兼容模式）：

   ```toml
   AI_PROVIDER = "openai-compatible"
   AI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
   AI_MODEL = "qwen-vl-max"   # 需要支持看图的模型，以控制台里的名字为准
   ```

   **豆包**（火山方舟）：

   ```toml
   AI_PROVIDER = "openai-compatible"
   AI_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
   AI_MODEL = "填方舟控制台里视觉模型的名称或接入点 ID"
   ```

2. **登录 Cloudflare，设置两个密钥**：

   ```bash
   npx wrangler login
   npx wrangler secret put APP_TOKEN   # 自己编一串足够长的随机字符，手机上要填同一串
   npx wrangler secret put AI_KEY      # AI 服务商给的 API Key
   ```

3. **部署**：执行 `npm run deploy`，会得到一个 `https://shipu-ai.<你的子域名>.workers.dev` 地址。

4. **连上手机**：在手机应用的"设置 → AI 识别"里，填入上面的地址和 `APP_TOKEN`，点"测试连接"。

以后要换模型，只改 `wrangler.toml` 再执行 `npm run deploy`，手机这边不用动。

## 说明

- **Claude 的调用方式**：
  - 使用官方 SDK（`@anthropic-ai/sdk`）和结构化输出，格式由 API 直接保证。
  - 开启了服务端兜底（`fallbacks: "default"`）：模型拒绝处理时，会自动换一个模型重试。
  - 识别属于简单的提取任务，effort 设为 `low`，比较快也比较省。
- **大概的费用**：用 `claude-opus-5-5`（每百万 token 输入 4 美元、输出 20 美元）识别一张截图，大约是一两千个输入 token 加几百到一千多个输出 token，一次两三美分左右。这是估算，以账单为准。
- **国内模型**：OpenAI 兼容格式的结构化输出支持程度不一，所以把 JSON Schema 写进提示词，再用 JSON 模式、格式校验和重试来兜底。
- **防止被盗用**：
  - 没设置 `APP_TOKEN` 时，Worker 拒绝所有请求。
  - 建议同时在 AI 服务商后台设置每月消费上限。
