# Home Kitchen · 食谱

一个装在 iPhone 主屏幕上的厨房助手（PWA）：收藏菜谱、排一周菜单、自动生成购物清单、管冰箱里的东西，顺手记下大概吃了多少热量。

- 数据都存在手机本地（IndexedDB），断网也能用；
- 截图导入菜谱、拍小票 / 订单截图入库等识别功能，通过同一个网址下的服务端接口（Cloudflare Pages Functions）调用 AI（Claude 或通义、豆包等 OpenAI 兼容模型，可切换）。

## 目录

| 目录 / 文件 | 内容 |
|---|---|
| [app/](app/README.md) | 前端 PWA（Vite + React + TypeScript + Dexie），以及 AI 服务（`app/server`，Hono，作为 Pages Functions 部署） |
| [SPEC.md](SPEC.md) | 需求规格：功能、数据结构、核心逻辑、里程碑 |
| [PRD.md](PRD.md) | 设计 PRD：设计规范、每页说明、关键流程 |
| [design/](design/) | 设计稿（14 页） |
| [设计调研.md](设计调研.md) | 同类应用的设计调研 |

## 进度

- [x] 第一阶段：菜谱、一周菜单、购物清单、入库、冰箱、备份
- [x] 第二阶段：截图导入、粘贴文字导入、拍照入库、AI 估算新食材（已用模拟模型验证，真实模型待接入）
- [ ] 第三阶段：烹饪模式（已完成）、拍照记热量
- [ ] 第四阶段：完整营养数据、"帮我安排"、长按拖动

## 本地运行

```bash
cd app && npm install
npm run build && npm run dev:api   # AI 服务（默认模拟模型），http://127.0.0.1:8788
npm run dev                        # 另开一个终端：前端，http://localhost:5173（/api 会转给上面的服务）
```

部署方法见 [app/README.md](app/README.md)。线上地址：https://home-kitchen-6kj.pages.dev
