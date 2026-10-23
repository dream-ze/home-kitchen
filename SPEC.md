# 食谱 · 第一版需求规格

> **状态**：草稿 v2，待确认
> **日期**：2026-10-22（v1 写于 2026-10-20）
> **使用者**：只有我自己，用 iPhone
> **配套文档**：
> - 页面级的设计和交互细节见 [PRD.md](PRD.md)
> - 设计稿见 `design/` 文件夹和[画布](https://claude.ai/artifact/WiNEXviK4UuHT9X4t1HXrR)
> - 同类应用调研见 [设计调研.md](设计调研.md)
>
> 本文件负责"做什么、数据怎么存、逻辑怎么算、怎么算做完"；PRD 负责"每一页长什么样、怎么交互"。

## 1. 要做什么

一个装在 iPhone 主屏幕上的网页应用（PWA），完成下面这条日常流程：

```
导入菜谱（截图 / 粘贴文字 / 手动）→ 排进一周菜单 → 生成购物清单（自动扣掉家里已有的）
→ 超市勾选，或者回家拍一张小票、订单截图或买回来的菜 → 确认入库（自动填存放位置和到期日）
→ 做饭（烹饪模式）或直接点"按计划吃了" → 扣库存，记一条热量
→ 不是按菜谱做的饭，就拍照估算热量
→ 临期食材提醒你先吃掉，过期的处理掉
```

### 1.1 v2 相比 v1 新增的功能

这些功能来自设计稿和同类应用调研：

| 模块 | 新增功能 |
|---|---|
| 今天 | "按计划吃了"一键记录（默认 1 份，记完可以改份数，也可以撤销）；近 7 天热量柱状图；"正在做"计时条；临期食材直接去找菜谱 |
| 菜谱 | 菜谱详情页（份数缩放、用料库存状态、缺的一键加进清单）；手动编辑页（用料分组、拖动排序、整段粘贴、识别步骤里的时长）；卡片上显示用时；"冰箱现有能做"筛选 |
| 截图导入 | 每一行都能改成"用料 / 步骤 / 忽略" |
| 一周菜单 | 选菜面板（按餐次选、可搜索、按"用到临期食材 / 最近做过 / 快手"排序、可多选）；日期条显示当天热量；长按拖动到别的日子 |
| 烹饪模式 | 进度自动保存；切到别的页面时，顶部显示计时条 |
| 购物 | 快速添加（支持拼音首字母）；常买推荐；勾选后移到"已买"区并可撤销；数量写成"买 6 个 · 共需 10 · 冰箱有 4"；长按拖到其他分区，系统会记住 |
| 入库 | 入库确认面板：存放位置、到期日自动预填，切换位置后重新计算到期日；常备品只标记为"有" |
| **拍照入库** | 购物页和冰箱页都能拍照：小票、买菜应用的订单截图、买回来的实物都行。识别后自动和购物清单对上并勾选已买；清单外的东西由你决定要不要一起入库；最后进入入库确认 |
| 冰箱 | 过期食材可选"用掉了 / 扔掉了 / 再放 3 天"，选"扔掉了"后会问你要不要再买；用"还剩 N 天"加进度条表示保质期；常备品标"快没了"后自动加进购物清单 |
| 拍照记录 | 整餐"只吃了一半"；"+1 勺油"按钮；补录漏掉的东西；一句话纠正后先显示改动多少热量，确认后再保存 |
| 设置 | 备份和恢复、AI 连接、常备品、分区顺序、默认保质天数、临期提醒天数、热量相关开关 |
| 空状态 | 首次打开时的三步引导，加上"添加到主屏幕"提示 |

## 2. 不做什么（第一版）

- 登录、账号、多人共享、云端同步
- 推送通知：数据只在手机上，服务器不知道什么快过期。改为打开应用时在首页提示
- 粘贴链接导入、从其他应用"分享"进来：iPhone 上的网页应用不能出现在系统分享菜单里
- 扫条码；开封或冷冻后重算保质期
- 拍冰箱自动盘点：拍照只用来**新增**，不拿照片和现有库存对账，也不会自动删除东西
- 发现页、社区内容
- 每日热量目标、"超标"提示、给食物打分。热量只是"心里有数"，不评判
- 精确营养：只算热量、蛋白质、脂肪、碳水
- 语音控制、免触控翻页
- 逆向 Recipe Notes（不用 REA）

## 3. 架构

```
iPhone 主屏幕应用（PWA）
├─ Vite + React + TypeScript
├─ 存储：IndexedDB（用 Dexie）—— 所有数据和压缩后的图片都在本机
├─ 离线：vite-plugin-pwa / Workbox —— 应用外壳离线可开
├─ 拼音检索：pinyin-pro —— 支持拼音首字母搜索（xhs → 西红柿）
└─ 核心逻辑写成纯函数，用 Vitest 测试：
   单位换算、清单生成、库存扣减、热量计算、到期日计算

Cloudflare（免费额度）
├─ Pages：托管前端
└─ Pages 服务端功能 /api（Hono + zod）：AI 服务，和网页同一个网址（2026-10-23 从单独的 Worker 改为这种方式）
     ├─ 校验访问口令（X-App-Token）
     ├─ 模型适配层：openai-compatible（通义 / 豆包 / OpenAI 等）| anthropic
     │   通过环境变量 AI_PROVIDER / AI_BASE_URL / AI_MODEL / AI_KEY 切换
     └─ 用 zod 校验模型输出，失败重试 1 次，仍失败就返回错误
```

```
食谱/
├─ app/        前端 PWA
│  ├─ server/      AI 服务（Hono），functions/api/ 是 Pages 的入口
├─ data/       营养数据处理脚本 → foods.seed.json
├─ design/     设计稿（.dc.html）
├─ SPEC.md     本文件
└─ PRD.md      页面设计说明
```

### 3.1 iPhone 上的限制和对策

| 限制 | 对策 |
|---|---|
| 必须添加到主屏幕才能长期保存数据 | 首次在 Safari 打开时显示引导；启动时调用 `navigator.storage.persist()`；设置页显示当前状态 |
| 删掉主屏幕图标，数据也会一起删掉 | 导出 JSON 备份（通过系统分享面板存到"文件"或 iCloud 云盘）；超过 N 天（默认 7 天）没备份就提醒 |
| 不能出现在系统分享菜单里 | 导入入口：从相册选截图（可多选）、粘贴文字、手动输入 |
| 没有实时活动、灵动岛 | 计时只在应用里显示：烹饪模式里，以及其他页面顶部的"正在做"条；时间到了响铃并震动（`navigator.vibrate` 在 iOS 上可能无效，以铃声为主） |
| 屏幕常亮 | 用 Screen Wake Lock API；不可用时提示到系统设置里调长"自动锁定"。**需要在真机上验证** |
| 底部横条和刘海 | 底部标签栏适配 `env(safe-area-inset-bottom)` |
| 国内访问 Cloudflare 有时较慢 | 应用外壳离线缓存，只有 AI 调用需要联网 |

## 4. 数据结构（IndexedDB）

```ts
Food {                          // 标准食材
  id; name; aliases: string[]          // 西红柿 / 番茄
  pinyinInitials: string[]             // ['xhs','fq']，由名称和别名生成，用于快速搜索
  section: string                      // 购物分区
  sectionLearned: boolean              // true 表示用户手动改过分区，以后都按这个分区
  kind: 'staple' | 'tracked'           // 常备品只记"有 / 快没了"；计量食材记数量
  baseUnit: 'g' | 'ml' | '个'
  conversions: { unit: string; toBase: number }[]
  per100: { kcal; protein; fat; carb } | null
  nutritionSource: 'tw' | 'usda' | 'ai' | 'manual'
  shelfDays: { fridge?; freezer?; room? }
  defaultLocation: 'fridge' | 'freezer' | 'room'   // 入库时改过会被记住
  purchaseUnit?: { unit: string; toBase: number }  // 购买单位，比如 1 盒鸡蛋 = 10 个
}

RecipeLine {
  foodId?; qty?; unit?; note?
  originalText: string
  noAmount: boolean               // 适量 / 少许
  isHeader: boolean               // 分组标题（主料 / 调料）
  confidence?: number
}

Recipe {
  id; title; servings; timeMin?; difficulty?
  lines: RecipeLine[]
  steps: { text; timerSec?; imageBlobId? }[]  // timerSec 从步骤文字里自动识别，可修改
  tags: string[]; note?; source?: string
  coverBlobId?; sourceBlobIds: string[]
  cookedCount; lastCookedAt?
  createdAt; updatedAt
}

MealPlanEntry {
  id; date; slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  recipeId; servings; order: number
  status: 'planned' | 'cooked' | 'eaten' | 'skipped'
  // cooked = 走完烹饪模式；eaten = 点了"按计划吃了"；两者都会扣库存和记热量
  mealLogId?                      // 生成的饮食记录，撤销时一起删掉
  stockTxnId?                     // 本次库存扣减的流水号，撤销时用来回滚
}

CookSession {                     // 烹饪进度，最多同时一条
  id; recipeId; planEntryId?; servings
  stepIndex: number
  checkedLines: number[]          // 用料打勾状态
  timers: { stepIndex; endsAt: number; pausedRemain?: number }[]
  startedAt; updatedAt
}

ShoppingItem {
  id; foodId? | text?; qty?; unit?; section
  sources: { planEntryId; recipeId; qty }[]
  need?: number; have?: number    // 用来显示"共需 10 · 冰箱有 4"
  state: 'need' | 'have'          // have = 家里已有，不进清单主体，折叠显示
  bought: boolean; boughtAt?
  origin: 'plan' | 'manual' | 'staple' | 'tossed' | 'recipe'
  unconvertible?: boolean
}

PantryItem {
  id; foodId
  qty?; stock?: 'have' | 'low'
  location: 'fridge' | 'freezer' | 'room'
  expiresAt?; addedAt; extendedTimes: number
}

PantryEvent {                     // 库存流水，用于撤销和以后统计浪费
  id; txnId; foodId; delta; reason: 'cook' | 'eaten' | 'used' | 'tossed' | 'stockin' | 'manual'
  source?: 'list' | 'scan' | 'manual'   // 入库来源：购物清单 / 拍照识别 / 手动添加
  at
}

GroceryScan {                     // 一次拍照识别，确认入库后可以删除
  id; createdAt
  sourceType: 'receipt' | 'order' | 'photo'   // 小票 / 买菜应用订单截图 / 实物照片
  imageBlobIds: string[]                      // 默认入库后删除，不长期保存
  items: {
    name; qty?; unit?; confidence: number
    foodId?                       // 匹配到的标准食材
    shoppingItemId?               // 对上的购物清单条目
    include: boolean              // 要不要放进冰箱
  }[]
}

MealLog {
  id; date; slot
  source: 'recipe' | 'photo' | 'manual' | 'copy'
  recipeId?; planEntryId?; servingsEaten?; photoBlobId?
  items: { name; grams?; gramsMin?; gramsMax?; kcalMin; kcalMax; protein?; fat?; carb? }[]
  adjustments: { type: 'half' | 'oil' | 'missing' | 'correction'; kcal: number; note? }[]
  kcal: number                    // 显示用的数值：区间中点或计算值
  estimated: boolean; note?
}

PurchaseStat { foodId; count; lastAt }   // 用来给出"常买"推荐

Blob { id; data: Blob }

Settings {
  workerUrl; appToken
  lastBackupAt; backupRemindDays: number      // 默认 7
  backupIncludeImages: boolean                // 默认 false
  expiryWarnDays: number                      // 默认 3
  sectionOrder: string[]
  showMacros: boolean                         // 默认 true
  oilHint: boolean                            // 默认 true
  onboardingDone: boolean
}
```

### 4.1 单位换算

- **通用换算**：kg ↔ g；斤 = 500 g；两 = 50 g；L ↔ ml；勺/汤匙 = 15 ml；茶匙 = 5 ml；杯 = 250 ml。
- **按食材换算**：`Food.conversions`，比如 1 个鸡蛋 = 50 g。
- **ml → g**：默认按 1:1。
- **换算不了**：标为 `unconvertible`，不参与加减，界面提示人工确认。
- **显示时取整**：最多保留 1 位小数，去掉末尾的 .0。"个、片、瓣"这类计数单位，0.5 以上的小数按半个显示。

## 5. 核心逻辑

### 5.1 生成购物清单

1. 取所选日期范围（默认本周）内状态为 `planned` 的菜。
2. 每道菜的用料先按份数缩放，再换算成食材的基础单位。
3. 按食材合并，并记录每道菜各贡献多少（`sources`）。
4. 计量食材：`need − 库存量`。
   - 差值大于 0：生成 `state=need`，显示"买 X"。如果有购买单位，再向上取整，比如 7 个鸡蛋显示为"买 1 盒"。
   - 差值不大于 0：生成 `state=have`，折叠显示。
5. 常备品：库存是"快没了"或没有记录 → `need`；否则 → `have`。
6. "适量"的用料：只有对应常备品缺货时才进清单。
7. 生成前先弹出预览，"已有"的默认不勾选，用户确认后才写入。
8. **重复生成**：已有的 `origin=plan` 条目按 `sources` 重新计算，不会重复叠加。手动添加的条目和已买状态保持不变。

### 5.2 菜单变动和清单联动

- 从菜单里删掉一道菜：清单里只扣掉这道菜贡献的那份。某条扣到 0，且没有其他来源、不是手动添加的，就删除。
- 改了份数：对应的贡献量按新份数重新计算。

### 5.3 勾选已买和入库

- 勾选后 `bought=true`，条目移到"已买"区，弹出提示条，4 秒内可以撤销。
- 点"放进冰箱"打开入库确认，列出所有已买条目：
  - 计量食材：数量按实际购买量预填，存放位置用 `Food.defaultLocation`，到期日 = 今天 + `shelfDays[位置]`。切换位置时重新计算到期日。
  - 常备品：只把库存标为 `have`。
- 确认后：写入库存，记一条 `stockin` 流水，从清单里删掉这些条目，`PurchaseStat` 加 1。
- 入库时改了存放位置：更新 `Food.defaultLocation`，下次自动套用。

### 5.4 扣库存（"做完了"和"按计划吃了"共用）

1. 按菜单上的份数计算每样用料的消耗量（换算成基础单位）。
2. 同一种食材有多条库存时，**先扣到期日最早的**。
3. 扣到 0 的库存条目删掉；库存不够时扣到 0 为止，不报错。
4. 常备品和"适量"不扣。
5. 所有改动记在同一个 `txnId` 下，撤销时整体回滚。
6. "做完了"会先给出可编辑的扣减预览；"按计划吃了"直接扣，然后弹出提示条，可以撤销。
7. **"按计划吃了"记几份**：
   - 点了先记 1 份。结果条里有份数步进器（0.5 份一档，0.5–4 份），改动只影响这条热量记录。
   - 库存始终按菜单上的份数扣：一锅做出来的量不会因为你吃多吃少而改变。

### 5.5 热量

- **每份热量**：先把用料换算成克，再乘以 `per100 / 100`，求和后除以份数。没有营养数据或换算不了的用料不计入，并提示"部分食材未计入"。
- **按菜谱记录**：每份热量 × 吃了几份。默认 1 份，"做完了"时会问你吃了几份。
- **拍照记录**：
  - 每道菜 `kcalMin..kcalMax` × 份量系数（0.5 / 1 / 1.5 / 2）。
  - 整餐"只吃了一半"：所有菜再 × 0.5。
  - 加油：每勺 +90 kcal，加在总数的上下限上。
  - 显示时取到 5 的倍数。
  - `kcal` 存区间中点。
- **今天页**：当天所有记录的 `kcal` 求和，显示"约 X"。
- **近 7 天**：最近 7 天每天的合计。平均值只算有记录的日子。
- **周菜单日热量**：当天每道菜每份热量相加，即"每人约"多少。

### 5.6 到期日

- 状态：剩余天数 < 0 为已过期，显示红色；剩余天数 ≤ `expiryWarnDays`（默认 3）为临期，显示橙色；其余为正常，显示灰色。
- 进度条：剩余天数 / 总保质天数，按入库时的位置计算。
- 过期处理：
  - "用掉了"：删除库存，记 `used` 流水。
  - "扔掉了"：删除库存，记 `tossed` 流水，然后**先问一句**"要再买吗？"
    - 选"加进购物清单"：加入清单（`origin=tossed`）。
    - 选"不用了"：结束。
    - 不会自动加进清单；整个操作可以撤销。
  - "再放 3 天"：到期日加 3 天，`extendedTimes` 加 1。

### 5.7 常备品

- 点一下，在"有"和"快没了"之间切换。
- 标成"快没了"：加进购物清单（`origin=staple`），弹出提示条可撤销。
- 改回"有"：如果对应清单条目还没买，就删掉它。

### 5.8 推荐

- **"能用掉临期食材的菜"**：先算每道菜用到几种临期食材，再按这个数量从多到少排，数量相同时按最近没做过的排在前面，最多取 3 道。
- **选菜面板排序**：
  - 用到临期食材：同上，没用到的排在后面。
  - 最近做过：按 `lastCookedAt` 从近到远。
  - 快手：只列出 `timeMin ≤ 15` 的菜。
  - 全部：按名称排序。
- **"冰箱现有能做"**：所有计量用料的库存都够，或者缺的不超过 1 样。
- **"帮我安排"（避免重复）**：
  1. 候选菜谱排除两类：本周菜单里已经有的，以及最近 7 天做过的（`lastCookedAt`）。
  2. 候选不够时放宽：只排除本周已经排过的。
  3. 在剩下的候选里，按"用到临期食材"排序，依次填进临期日期之前还空着的晚餐。
  4. 同一次安排里，同一道菜只出现一次。
  5. 先给出预览，你确认后才写入。
- **常买**：按 `PurchaseStat.count` 取前 4 个，已经在清单里的不显示。

### 5.9 拍照入库

**入口**：购物清单页的"拍照入库"、冰箱页的"拍照添加"。一次最多选 4 张图。

1. **识别**：调用 `/api/recognize-groceries`。模型先判断图片类型，再列出商品。
   - 小票、订单截图：数量和重量通常比较准。
   - 实物照片：只数件数（几个、几把、几盒），没法称重的就只记件数。
2. **匹配食材**：
   - 商品名先去掉品牌和规格，比如"盒马 有机西红柿 500g"变成"西红柿"。
   - 再按名称、别名、拼音去匹配标准食材。
   - 都匹配不上时，用 `/api/estimate-nutrition` 新建一种食材（标为"估算"）。
3. **对清单**：
   - 匹配到的食材如果在购物清单里有未买的条目，就自动勾选为已买，并记下 `shoppingItemId`。
   - 清单里有、但照片里没识别到的，保持未买，在确认页列为"清单里还没买到"。
   - 照片里有、但清单里没有的，归为"清单外"，默认也放进冰箱（`include=true`），可以取消。
   - 非食品（纸巾、洗洁精等）默认不放进冰箱（`include=false`）。
4. **确认页（P15）**：逐项核对名称和数量；置信度低于 0.6 的标成橙色；然后点"下一步"。
5. **入库确认（P10）**：沿用 §5.3，存放位置、到期日自动预填；确认后写入库存，流水记 `source=scan`。
6. **照片处理**：识别用的图片默认在入库后删除，不占手机空间。

**限制**：
- 实物照片看不出保质期，到期日一律按食材的默认保质天数估算。
- 拍照只做新增，不会因为照片里没看到某样东西就把它从库存里删掉。

## 6. AI 接口（Pages 服务端功能 /api）

所有请求都要带 `X-App-Token`。图片在前端压缩到长边不超过 1600px 的 JPEG，再以 base64 发送。

```ts
POST /api/recognize-recipe   { images: string[] /* ≤4 */ }
POST /api/parse-text         { text: string }
→ { title; servings?; timeMin?;
    lines: { name; qty?; unit?; note?; originalText; noAmount; isHeader; confidence }[];
    steps: { text; timerSec? }[]; warnings: string[] }

POST /api/estimate-meal      { image: string; correction?: string; previous?: EstimateResult }
→ { items: { name; gramsMin; gramsMax; kcalMin; kcalMax; protein; fat; carb }[];
    totalKcalMin; totalKcalMax; notes: string[] }

POST /api/recognize-groceries { images: string[] /* ≤4 */ }
→ { sourceType: 'receipt' | 'order' | 'photo';
    items: { name; rawName; qty?; unit?; isFood: boolean; confidence }[];
    warnings: string[] }       // 比如"图片模糊""有 2 行看不清"

POST /api/estimate-nutrition { name: string }
→ { per100; baseUnit; gPerBase; conversions; section; shelfDays; defaultLocation; kind; aliases }

GET  /api/health
→ { ok: true; provider; model }
```

- **一句话纠正**：把 `correction` 和 `previous` 一起发给模型。返回后，前端算出每道菜前后差多少，先显示给用户，确认后再替换原结果。
- **超时**：手机端等 50 秒，服务端调模型等 45 秒；超时后显示"没认出来"，并给出"再试一次 / 手动输入"的入口。
- **模型调用**（第二阶段已实现）：
  - Claude：用官方 SDK，配合结构化输出和服务端兜底（`fallbacks: "default"`），effort 设为 `low`，默认模型 `claude-opus-5-5`；
  - OpenAI 兼容：把 JSON Schema 写进提示词，用 JSON 模式加 zod 校验；
  - 两者都在格式不对时重试一次；
  - 另有 `mock` 模拟模型，用于本地联调。部署方法见 `app/README.md`。

## 7. 营养种子数据

- **主数据源**：台湾食品营养成分资料库（政府资料开放授权 1.0，注明来源即可使用），约 300 种常用食材。繁体转简体，并加上大陆的叫法作别名。
- **补充数据源**：USDA FoodData Central（CC0）。
- **每种食材都要配齐**：分区、单位换算、默认保质天数、默认存放位置、购买单位、拼音首字母。这些用一次性脚本加 AI 辅助生成，人工抽查后输出 `data/foods.seed.json`。

## 8. 里程碑

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| M1 | 项目骨架、PWA、数据层、50 种样本食材；菜谱列表、详情、手动编辑；一周菜单和选菜面板；购物清单（含已买区、撤销、快速添加）；入库确认；冰箱（含过期处理、常备品）；设置（备份和恢复）；空状态 | 部署到 Pages，在 iPhone 上加到主屏幕后，能走完"手动录菜谱 → 排菜单 → 生成清单 → 勾选 → 入库 → 按计划吃了"整条流程 |
| M2 | AI 服务（Pages 服务端功能）；截图导入、文本导入（含逐行改类型）；新食材 AI 估营养；**拍照入库**（小票、订单截图、实物照片） | 3 张不同来源的菜谱截图都能导入成功；小票、订单截图、实物照片各 1 张都能识别并完成入库 |
| M3 | 烹饪模式（进度保存、计时条）；菜谱热量；"做完了"后记录热量；拍照估算（只吃一半、加油、补漏、一句话纠正）；今天页热量和近 7 天 | 一天的饮食都能记下来 |
| M4 | 完整营养种子数据（约 300 种）；临期推荐和"冰箱现有能做"；常买推荐；拖动换分区和换日期 | — |

## 9. 第一版整体验收标准

1. **离线**：开飞行模式也能打开应用，勾选购物清单、撤销都正常保存。
2. **导入**：3 张不同来源的截图（小红书、下厨房、手写菜谱的照片）都能导入。确认页修正后保存，每行用料都关联到某个食材，或标成"适量"，或被忽略。
3. **清单**：
   - 本周排 5 道菜后生成的清单：同种食材合并成一条，家里已有的折叠显示，按分区排序。
   - 删掉一道菜，清单里对应的量相应减少。
   - 勾选后能撤销。
4. **闭环**：
   - 入库时位置和到期日自动填好。
   - "按计划吃了"能扣库存、记热量，也能整体撤销。
   - 拍一张饭菜照片得到热量区间，"只吃了一半"和"+1 勺油"能正确改变总数。
5. **临期**：
   - 过期食材的三种处理都生效；选"扔掉了"后会先问要不要再买。
   - 常备品标"快没了"后进清单，并能撤销。
   - "帮我安排"不会推荐本周已排过、或最近 7 天做过的菜。
6. **拍照入库**：分别拍一张小票、一张买菜应用的订单截图、一张实物照片，都能做到以下几点：
   - 识别出商品；
   - 自动勾选清单里对应的条目；
   - 列出清单外的东西；
   - 完成入库，全程不需要手动输入数量。
7. **按计划吃了**：记完后把份数改成 1.5，热量跟着变，库存扣减量不变。
8. **备份**：导出、删掉应用、重新添加并导入后，数据完整恢复。

另外，单位换算、清单生成、库存扣减和回滚、热量计算、到期日计算的单元测试要全部通过。

## 10. 需要你自己完成的事

- 注册 Cloudflare 账号（免费）；部署时由你登录授权
- 选一家 AI 服务商并创建 API Key，在 Cloudflare Pages 项目里设置为 Secret
- 准备 3–5 张常用的菜谱截图，用来测试导入效果
- 准备 1 张超市小票、1 张买菜应用的订单截图、1 张买回来的菜摊在桌上的照片，用来测试拍照入库
