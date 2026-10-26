# 食谱 · 前端（PWA）

需求见 [../SPEC.md](../SPEC.md)，页面设计见 [../PRD.md](../PRD.md)。所有数据都存在本机的 IndexedDB 里；识别类功能通过同一个网址下的 `/api`（`server/` 目录，作为 Cloudflare Pages Functions 部署）调用 AI。

## 本地运行

```bash
npm install
npm run dev        # 只跑前端：http://localhost:5173
```

要连同 AI 服务一起跑（默认模拟模型，不需要任何密钥）：

```bash
cp .dev.vars.example .dev.vars   # 本地访问口令默认 dev-token
npm run build && npm run dev:api # 网页 + /api：http://127.0.0.1:8788
```

在应用的"设置 → AI 识别"里填口令 `dev-token`，服务地址留空，然后点"测试连接"。

## 测试和构建

```bash
npm test          # 单元测试：核心逻辑、识别结果匹配、AI 服务接口
npm run build     # 类型检查（前端 + 服务端）+ 生产构建，产物在 dist/
```

## 部署（Cloudflare Pages，已连接 GitHub）

推到 GitHub 的 `main` 分支后，Cloudflare 会自动构建、部署，线上地址是 https://home-kitchen-6kj.pages.dev 。

项目的构建设置：根目录 `app`、构建命令 `npm run build`、输出目录 `dist`、环境变量 `NODE_VERSION=22`。`functions/` 目录会被自动部署成 `/api` 接口。

## AI 服务

代码在 `server/`，入口是 `functions/api/[[path]].ts`，接口说明见 SPEC §6。每个请求都要带访问口令（`X-App-Token`），模型的输出先经过格式校验，不合格会重试一次。

**1. 设置密钥**：在 Cloudflare 后台打开 Pages 项目 `home-kitchen` → Settings → Variables and Secrets，添加两个类型为 **Secret** 的变量：
- `APP_TOKEN`：自己编一串足够长的随机字符，比如用 `openssl rand -hex 16` 生成。手机上要填同一串。
- `AI_KEY`：AI 服务商给的 API Key。用模拟模型时不需要。

改完后要重新部署一次才会生效：在 Deployments 里点最新那次的 Retry，或者推一次代码。

**2. 选模型**：改 `wrangler.toml` 里的 `[vars]`，推到 GitHub 后自动生效，手机端不用动。

| 模型 | 写法 |
|---|---|
| 模拟模型 | `AI_PROVIDER = "mock"` |
| **DeepSeek（当前）** | `AI_PROVIDER = "openai-compatible"`，`AI_BASE_URL = "https://api.deepseek.com"`，`AI_MODEL = "deepseek-flash"`（支持看图） |
| Claude | `AI_PROVIDER = "anthropic"`，`AI_MODEL` 留空（默认 `claude-opus-5-5`） |
| 通义千问（阿里云百炼） | `AI_PROVIDER = "openai-compatible"`，`AI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"`，`AI_MODEL = "qwen-vl-max"`（需要能看图的模型，以控制台里的名字为准） |
| 豆包（火山方舟） | `AI_PROVIDER = "openai-compatible"`，`AI_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"`，`AI_MODEL` 填控制台里视觉模型的名称或接入点 ID |

**说明**：
- **Claude**：用官方 SDK 和结构化输出，开启了服务端兜底（`fallbacks: "default"`，模型拒绝处理时自动换一个模型重试），effort 设为 `low`。按每百万 token 输入 4 美元、输出 20 美元算，识别一张截图大约两三美分（估算，以账单为准）。
- **OpenAI 兼容模型**：把 JSON Schema 写进提示词，再用 JSON 模式、格式校验和重试来兜底。
- **防止被别人用掉额度**：没设置 `APP_TOKEN` 时拒绝所有请求；同时建议在 AI 服务商后台设置每月消费上限。

## 在 iPhone 上使用

1. 用 Safari 打开 https://home-kitchen-6kj.pages.dev 。
2. 点底部"分享"，选"添加到主屏幕"。
3. 以后都从主屏幕图标打开。数据只存在这台手机上，记得在"设置"里定期导出备份（备份里不含访问口令）。

## 目录

```
server/      AI 服务（Hono）：接口、提示词、输出格式、各家模型的适配
functions/   Cloudflare Pages 的入口，把 /api/* 交给 server/
src/
├─ db/        数据结构、Dexie 数据库、约 50 种样本食材
├─ logic/     纯函数（有单元测试）：单位换算、清单生成、扣库存、热量、到期日、搜索、文本解析
├─ data/      会改数据库的操作：每个操作都能撤销；备份恢复；示例数据
├─ sheets/    底部弹层：选菜、生成清单预览、入库确认、选择或新建食材、编辑库存
├─ pages/     页面：今天、一周菜单、菜谱、详情、编辑、购物、冰箱、设置、首次打开
└─ ui/        组件、图标、提示条、格式化
```

## 进度

- **第一阶段（已完成）**：菜谱、菜单、购物清单、入库、冰箱、备份。
- **第二阶段（已完成）**：
  - 截图导入、粘贴文字导入、拍照入库（小票 / 订单截图 / 实物照片）、AI 估算新食材；
  - 需要在 Cloudflare 设置访问口令（见下方"AI 服务"），再在手机"设置 → AI 识别"里填同一个口令，点"测试连接"。
- **第三阶段（已完成）**：
  - 烹饪模式：进度和计时存在本地，切出去、关掉再打开都不丢；可以同时开几个计时；"做完了"先预览扣多少库存、问吃了几份；除烹饪页外，所有页面顶部都有"正在做"计时条。
    - 计时到点只在应用开着时响铃（iPhone 不允许网页在后台出声），切回来会显示"时间到"。手机开着静音时可能不响。
    - 屏幕常亮要 iOS 18.4 以上、从主屏幕打开才有效；不支持时会提示去设置里调长自动锁定。
  - 拍照记录：份量、只吃了一半、加油、补漏、一句话纠正、改菜名；照片压缩后保留，点今天页的记录可以修改或删除。没联网时先存照片，联网后点它估算。没认出来可以改用文字记录。
- **第四阶段（已完成）**：
  - **营养数据**：内置约 300 种常用食材，营养数据来自台湾食品营养成分资料库，少数用 USDA FoodData Central 补充；老版本打开后自动补上新食材，换掉第一版的样本值（自己改过的不动）。AI 新建的食材标为"估算"。
  - **帮我安排**：一周菜单页在有临期食材还没排进菜单时显示提醒条，按"临期食材优先、避免重复"排进空着的晚餐，先预览、可"换一道"，确认后才写入。
  - **长按拖动**：菜单里长按一道菜拖到别的日子或餐次；购物清单长按条目拖到别的分区，食材会记住新分区。

## 更新营养数据

食材清单在 `src/db/seedFoods.ts`，每行的 `ref` 是数据出处（`tw:整合编号` 或 `usda:fdcId`）。改了 `ref` 后重新生成 `src/db/nutrition.json`：

```bash
# 先下载台湾食品营养成分资料库：https://data.fda.gov.tw/data/opendata/export/20/json ，解压得到 20_5.json
node scripts/build-nutrition.mjs /path/to/20_5.json
```

加了新食材或改了营养数据后，把 `src/logic/seedMerge.ts` 里的 `SEED_VERSION` 加 1，已经在用的手机才会合并新数据。
