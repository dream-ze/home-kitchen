// 生成 src/db/nutrition.json：src/db/seedFoods.ts 里每个 ref 对应的每 100 g 热量、蛋白质、脂肪、碳水（SPEC §7）。
//
//   node scripts/build-nutrition.mjs <台湾食品营养成分资料库 JSON>
//
// - tw:整合编号  台湾食品营养成分资料库（政府资料开放授权 1.0）。数据下载：
//                https://data.fda.gov.tw/data/opendata/export/20/json （zip 里的 20_5.json）
//                热量用"修正热量"，其余用"粗蛋白""粗脂肪""总碳水化合物"。
// - usda:fdcId   USDA FoodData Central（CC0），联网读取；可用环境变量 FDC_API_KEY，默认 DEMO_KEY。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const twPath = process.argv[2];
if (!twPath) {
  console.error('用法：node scripts/build-nutrition.mjs <台湾食品营养成分资料库 JSON>');
  process.exit(1);
}

const seed = readFileSync(join(root, 'src/db/seedFoods.ts'), 'utf8');
const refs = [...new Set([...seed.matchAll(/'((?:tw|usda):[A-Z0-9]+)'/g)].map((m) => m[1]))];

const round = (n) => Math.round((n ?? 0) * 10) / 10;
const out = {};

// 台湾资料库：每个分析项一行，按整合编号汇总
const ITEMS = { 修正熱量: 0, 粗蛋白: 1, 粗脂肪: 2, 總碳水化合物: 3 };
const tw = new Map();
for (const r of JSON.parse(readFileSync(twPath, 'utf8'))) {
  const i = ITEMS[r['分析項']];
  if (i === undefined) continue;
  const e = tw.get(r['整合編號']) ?? { name: r['樣品名稱'], v: [null, null, null, null] };
  const n = r['每100克含量'] == null ? null : Number(r['每100克含量']);
  e.v[i] = Number.isFinite(n) ? n : null;
  tw.set(r['整合編號'], e);
}
for (const ref of refs.filter((r) => r.startsWith('tw:'))) {
  const e = tw.get(ref.slice(3));
  if (!e || e.v[0] == null) throw new Error(`资料库里没有 ${ref} 的热量`);
  out[ref] = [...e.v.map(round), e.name];
}

// USDA：208 能量 kcal、203 蛋白质、204 脂肪、205 碳水
const usda = refs.filter((r) => r.startsWith('usda:'));
if (usda.length) {
  const key = process.env.FDC_API_KEY || 'DEMO_KEY';
  const ids = usda.map((r) => r.slice(5)).join(',');
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods?fdcIds=${ids}&format=abridged&nutrients=208,203,204,205&api_key=${key}`);
  if (!res.ok) throw new Error(`USDA 接口出错：${res.status}`);
  for (const f of await res.json()) {
    const v = (no) => f.foodNutrients.find((n) => n.number === no || n.nutrientNumber === no)?.amount;
    out['usda:' + f.fdcId] = [round(v('208')), round(v('203')), round(v('204')), round(v('205')), f.description];
  }
  for (const r of usda) if (!out[r]) throw new Error(`USDA 没有返回 ${r}`);
}

const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
writeFileSync(join(root, 'src/db/nutrition.json'), JSON.stringify(sorted, null, 0).replace(/\],"/g, '],\n"') + '\n');
console.log(`写入 ${Object.keys(sorted).length} 条（台湾 ${refs.length - usda.length}，USDA ${usda.length}）`);
