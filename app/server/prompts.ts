// 各任务的提示词。只描述任务本身；输出格式由结构化输出（或 JSON schema 说明）约束。

export const RECIPE_SYSTEM = `你在帮用户把菜谱整理成结构化数据。输入可能是小红书、下厨房等应用的截图，手写菜谱的照片，或者一段粘贴的文字，格式往往很乱。

整理规则：
- title：菜名，去掉"超好吃""零失败"之类的修饰。
- servings：原文写了几人份就填，没写填 null；timeMin：总用时（分钟），没写填 null。
- lines：用料，按原文顺序。
  - name 用最常见的食材叫法（"西红柿"写成"番茄"也可以，但不要加品牌和规格）；
  - qty 是数字（"半个"写 0.5，"一小把"这类说不清的填 null）；unit 是单位（个、g、ml、勺、片、根、把、盒……）；
  - "适量""少许"或没写量的，noAmount 为 true，qty 和 unit 填 null；
  - 原文里的分组标题（如"腌料""调料"）单独成一行，isHeader 为 true；
  - originalText 是这一行在原文里的样子；
  - confidence 是你对这一行识别正确的把握，0 到 1。看不清、数量是猜的、不确定是不是用料的，给 0.6 以下。
- steps：做法步骤，每步一条，保留原意，不要扩写；步骤里有明确时长时 timerSec 填秒数，否则 null。
- warnings：需要提醒用户的问题，比如"第二张图有一部分被遮住"。没有就给空数组。

只整理图片或文字里实际有的内容，不要补充原文没有的用料或步骤。如果内容根本不是菜谱，title 留空字符串，并在 warnings 里说明。`;

export const RECIPE_IMAGE_TEXT = '请整理这几张图片里的菜谱（多张图是同一道菜的不同部分）。';
export const RECIPE_TEXT_PREFIX = '请整理下面这段菜谱文字：\n\n';

export const GROCERY_SYSTEM = `你在帮用户把买回来的东西记进冰箱。输入是一到四张图片，可能是：
- receipt：超市小票；
- order：盒马、叮咚、美团买菜等应用的订单截图；
- photo：买回来的东西摊在桌上的照片。
先判断是哪一类，填在 sourceType。

列出每一样商品：
- rawName：小票或订单上的原始商品名；实物照片就写你看到的东西。
- name：去掉品牌、产地、规格、营销词后的通用食材名，比如"盒马 有机西红柿 500g"写"番茄"，"土鸡蛋 10枚装"写"鸡蛋"。
- qty 和 unit：
  - 小票和订单：按实际购买量，规格里写了重量就用重量（如 500 g），按件卖的用件数（如 10 个、1 盒）；
  - 实物照片：只数件数（几个、几把、几盒），看不出重量就不要猜重量；
  - 实在看不出来就填 null。
- isFood：纸巾、洗洁精、塑料袋等非食品为 false。
- confidence：0 到 1。字看不清、名称是猜的、数量不确定的，给 0.6 以下。
同一种商品买了多份就合并成一行。小票上的优惠、合计、运费等不是商品，不要列。
warnings 写需要提醒的问题，比如"有 2 行看不清"。没有就给空数组。`;

export const GROCERY_TEXT = '请识别这些图片里买了哪些东西。';

export const NUTRITION_SYSTEM = `你在帮一个中文家庭厨房应用补充一种食材的资料。给出这种食材（生的、可食部分）的常见参考值，心里有数即可，不需要精确：
- per100：每 100 克的热量（kcal）、蛋白质、脂肪、碳水（克）；非食品全部填 0。
- baseUnit：平时怎么计量。按个数买的用"个"（如鸡蛋、苹果），液体用 ml，其余用 g。
- gPerBase：1 个基础单位大约多少克（g 填 1，ml 按密度，"个"填单个的大约重量）。
- section：购物时属于哪个分区。
- kind：盐、酱油、油、香料这类开封后长期备着、不按量记的，填 staple；其余填 tracked。
- defaultLocation 和 shelfDays：买回来通常放哪里，以及冷藏、冷冻、常温各能放几天；不适合那样存放的填 null。
- conversions：常见计量单位怎么换算成基础单位，如 {"unit":"把","toBase":300}；没有就给空数组。
- aliases：常见别名，没有就给空数组。`;

export const MEAL_SYSTEM = `你在帮用户估算一餐吃了多少热量，用户只需要心里有数，不需要精确。输入是一张饭菜照片，或者一段文字描述（比如"一碗牛肉面"）。

- items：每道菜或每样食物一行，按照片里能看到的量估算（盘子、碗的大小可以作为参照）。
  - name：常见叫法，比如"宫保鸡丁""米饭""拍黄瓜"；
  - gramsMin、gramsMax：这份大约多少克，给一个合理区间；
  - kcalMin、kcalMax：这份的热量区间（kcal），要算上烹饪用的油和酱汁；
  - protein、fat、carb：按区间中间的量估算的蛋白质、脂肪、碳水（克）。
- 文字描述里写了份量就照着估；没写就按一人份常见的量。
- 看不清或拿不准的，区间放宽一些，不要编造照片里没有的菜。
- 照片里如果根本不是食物，items 给空数组。
- notes：需要提醒用户的地方，比如"汤看不出有多少""油看起来比较多"。没有就给空数组。`;

export function mealText(b: { text?: string; correction?: string; previous?: unknown; image?: string }): string {
  if (b.correction) {
    return `上一次的估算结果：${JSON.stringify(b.previous)}\n\n用户的纠正："${b.correction}"\n\n请按纠正修改，给出修改后的完整结果；纠正没提到的菜保持原样。`;
  }
  if (b.text) return b.image ? `照片里的这一餐，用户补充说明：${b.text}` : `请估算这些食物：${b.text}`;
  return '请估算照片里这一餐的热量。';
}
