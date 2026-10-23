// 第一阶段的样本食材（约 50 种）。营养数据是常见参考值（每 100 g），标为 sample；
// 第四阶段换成台湾食品营养成分资料库 + USDA 的正式数据。
import type { BaseUnit, Conversion, Food, Location } from './types';
import { buildInitials } from '../logic/search';

type Row = [
  id: string,
  name: string,
  aliases: string[],
  section: string,
  kind: 'staple' | 'tracked',
  baseUnit: BaseUnit,
  gPerBase: number,
  per100: [number, number, number, number] | null, // kcal, 蛋白质, 脂肪, 碳水
  shelf: Partial<Record<Location, number>>,
  defaultLocation: Location,
  conversions?: Conversion[],
  purchaseUnit?: Conversion,
];

const V = '蔬菜水果';
const M = '肉蛋豆制品';
const S = '水产';
const D = '乳制品';
const G = '主食干货';
const C = '调料';
const O = '其他';

const ROWS: Row[] = [
  ['tomato', '番茄', ['西红柿'], V, 'tracked', '个', 150, [18, 0.9, 0.2, 3.9], { fridge: 7, room: 5, freezer: 60 }, 'fridge'],
  ['cucumber', '黄瓜', [], V, 'tracked', '个', 200, [15, 0.7, 0.1, 3.6], { fridge: 7, room: 3 }, 'fridge', [{ unit: '根', toBase: 1 }]],
  ['spinach', '菠菜', [], V, 'tracked', 'g', 1, [23, 2.9, 0.4, 3.6], { fridge: 4 }, 'fridge', [{ unit: '把', toBase: 300 }]],
  ['greens', '青菜', ['小青菜', '上海青', '小白菜'], V, 'tracked', 'g', 1, [13, 1.5, 0.2, 2.2], { fridge: 4 }, 'fridge', [{ unit: '把', toBase: 300 }, { unit: '棵', toBase: 60 }]],
  ['scallion', '葱', ['小葱', '香葱', '葱花'], V, 'tracked', 'g', 1, [32, 1.8, 0.2, 7.3], { fridge: 7 }, 'fridge', [{ unit: '根', toBase: 15 }, { unit: '把', toBase: 100 }], { unit: '把', toBase: 100 }],
  ['ginger', '姜', ['生姜', '老姜', '姜片'], V, 'tracked', 'g', 1, [80, 1.8, 0.8, 18], { fridge: 21, room: 14 }, 'fridge', [{ unit: '片', toBase: 5 }, { unit: '块', toBase: 30 }]],
  ['garlic', '蒜', ['大蒜', '蒜瓣', '蒜末', '蒜蓉'], V, 'staple', 'g', 1, [149, 6.4, 0.5, 33], { room: 30 }, 'room', [{ unit: '瓣', toBase: 5 }, { unit: '头', toBase: 50 }]],
  ['potato', '土豆', ['马铃薯'], V, 'tracked', '个', 200, [77, 2, 0.1, 17], { room: 21, fridge: 21 }, 'room'],
  ['carrot', '胡萝卜', [], V, 'tracked', '个', 150, [41, 0.9, 0.2, 9.6], { fridge: 21 }, 'fridge', [{ unit: '根', toBase: 1 }]],
  ['onion', '洋葱', [], V, 'tracked', '个', 200, [40, 1.1, 0.1, 9.3], { room: 30, fridge: 30 }, 'room'],
  ['wintermelon', '冬瓜', [], V, 'tracked', 'g', 1, [13, 0.4, 0.2, 3], { fridge: 7, room: 7 }, 'fridge', [{ unit: '块', toBase: 500 }]],
  ['eggplant', '茄子', [], V, 'tracked', '个', 250, [25, 1, 0.2, 5.9], { fridge: 7 }, 'fridge', [{ unit: '根', toBase: 1 }]],
  ['greenpepper', '青椒', ['甜椒'], V, 'tracked', '个', 120, [20, 0.9, 0.2, 4.6], { fridge: 7 }, 'fridge'],
  ['broccoli', '西兰花', ['西蓝花'], V, 'tracked', '个', 300, [34, 2.8, 0.4, 6.6], { fridge: 5 }, 'fridge', [{ unit: '颗', toBase: 1 }]],
  ['cabbage', '白菜', ['大白菜'], V, 'tracked', 'g', 1, [13, 1.5, 0.2, 2.2], { fridge: 14, room: 7 }, 'fridge', [{ unit: '颗', toBase: 1500 }]],
  ['lettuce', '生菜', [], V, 'tracked', 'g', 1, [15, 1.4, 0.2, 2.9], { fridge: 5 }, 'fridge', [{ unit: '颗', toBase: 300 }]],
  ['beansprout', '豆芽', ['绿豆芽'], V, 'tracked', 'g', 1, [30, 3, 0.2, 5.9], { fridge: 3 }, 'fridge'],
  ['mushroom', '香菇', [], V, 'tracked', 'g', 1, [34, 2.2, 0.5, 6.8], { fridge: 7 }, 'fridge', [{ unit: '朵', toBase: 15 }]],
  ['apple', '苹果', [], V, 'tracked', '个', 200, [52, 0.3, 0.2, 14], { fridge: 30, room: 14 }, 'fridge'],
  ['banana', '香蕉', [], V, 'tracked', '个', 120, [89, 1.1, 0.3, 23], { room: 5 }, 'room', [{ unit: '根', toBase: 1 }]],
  ['lemon', '柠檬', [], V, 'tracked', '个', 100, [29, 1.1, 0.3, 9.3], { fridge: 21 }, 'fridge'],

  ['egg', '鸡蛋', ['土鸡蛋', '蛋'], M, 'tracked', '个', 50, [143, 12.6, 9.5, 0.7], { fridge: 30 }, 'fridge', [{ unit: '枚', toBase: 1 }], { unit: '盒', toBase: 10 }],
  ['wing', '鸡翅中', ['鸡翅', '鸡中翅'], M, 'tracked', '个', 40, [203, 18, 14, 0], { fridge: 2, freezer: 90 }, 'fridge', [{ unit: '只', toBase: 1 }]],
  ['chickenbreast', '鸡胸肉', ['鸡胸'], M, 'tracked', 'g', 1, [120, 22.5, 2.6, 0], { fridge: 2, freezer: 90 }, 'fridge', [{ unit: '块', toBase: 200 }]],
  ['mince', '猪肉末', ['肉末', '猪绞肉', '肉馅'], M, 'tracked', 'g', 1, [263, 17, 21, 0], { fridge: 2, freezer: 90 }, 'fridge'],
  ['porkbelly', '五花肉', [], M, 'tracked', 'g', 1, [518, 9.3, 53, 0], { fridge: 3, freezer: 90 }, 'fridge'],
  ['ribs', '排骨', ['猪排骨', '肋排'], M, 'tracked', 'g', 1, [277, 17, 23, 0], { fridge: 2, freezer: 90 }, 'fridge'],
  ['beef', '牛肉', ['牛腩'], M, 'tracked', 'g', 1, [187, 20, 12, 0], { fridge: 3, freezer: 90 }, 'fridge'],
  ['tofu', '嫩豆腐', ['豆腐', '内酯豆腐'], M, 'tracked', 'g', 1, [55, 5, 2.7, 2], { fridge: 3 }, 'fridge', [{ unit: '盒', toBase: 350 }, { unit: '块', toBase: 350 }], { unit: '盒', toBase: 350 }],
  ['tofuskin', '豆干', ['香干'], M, 'tracked', 'g', 1, [140, 16, 6, 5], { fridge: 7 }, 'fridge', [{ unit: '块', toBase: 50 }]],

  ['shrimp', '虾仁', [], S, 'tracked', 'g', 1, [99, 24, 0.3, 0.2], { freezer: 90, fridge: 1 }, 'freezer'],
  ['fish', '鲈鱼', ['鱼'], S, 'tracked', 'g', 1, [97, 18.6, 2, 0], { fridge: 2, freezer: 90 }, 'fridge', [{ unit: '条', toBase: 500 }]],

  ['milk', '牛奶', ['纯牛奶'], D, 'tracked', 'ml', 1.03, [61, 3.2, 3.3, 4.8], { fridge: 7 }, 'fridge', [{ unit: '盒', toBase: 250 }]],
  ['yogurt', '酸奶', [], D, 'tracked', '个', 100, [85, 3.2, 2.7, 12], { fridge: 14 }, 'fridge', [{ unit: '杯', toBase: 1 }, { unit: '盒', toBase: 1 }]],
  ['butter', '黄油', [], D, 'tracked', 'g', 1, [717, 0.9, 81, 0.1], { fridge: 60 }, 'fridge'],

  ['rice', '大米', ['米'], G, 'staple', 'g', 1, [346, 7.4, 0.8, 77.9], { room: 365 }, 'room'],
  ['noodle', '面条', ['挂面'], G, 'tracked', 'g', 1, [348, 10, 0.7, 75], { room: 180 }, 'room', [{ unit: '把', toBase: 100 }]],
  ['flour', '面粉', [], G, 'staple', 'g', 1, [364, 10, 1, 76], { room: 180 }, 'room'],
  ['oats', '燕麦', ['燕麦片'], G, 'staple', 'g', 1, [389, 16.9, 6.9, 66], { room: 180 }, 'room'],

  ['oil', '食用油', ['油', '植物油', '花生油'], C, 'staple', 'ml', 0.92, [884, 0, 100, 0], { room: 365 }, 'room'],
  ['salt', '盐', ['食盐'], C, 'staple', 'g', 1, [0, 0, 0, 0], { room: 3650 }, 'room'],
  ['sugar', '白糖', ['糖', '白砂糖'], C, 'staple', 'g', 1, [400, 0, 0, 100], { room: 730 }, 'room'],
  ['rocksugar', '冰糖', [], C, 'staple', 'g', 1, [397, 0, 0, 99], { room: 730 }, 'room'],
  ['soy', '生抽', ['酱油'], C, 'staple', 'ml', 1.15, [63, 5.6, 0.1, 10], { room: 365 }, 'room'],
  ['darksoy', '老抽', [], C, 'staple', 'ml', 1.2, [130, 8, 0, 25], { room: 365 }, 'room'],
  ['wine', '料酒', ['黄酒'], C, 'staple', 'ml', 1, [63, 0.2, 0, 2], { room: 365 }, 'room'],
  ['vinegar', '醋', ['香醋', '陈醋'], C, 'staple', 'ml', 1, [31, 2, 0.1, 5], { room: 730 }, 'room'],
  ['staranise', '八角', ['大料'], C, 'staple', 'g', 1, [337, 17.6, 16, 50], { room: 365 }, 'room', [{ unit: '个', toBase: 1 }]],
  ['doubanjiang', '豆瓣酱', ['郫县豆瓣'], C, 'staple', 'g', 1, [178, 9, 7, 18], { room: 365 }, 'room'],
  ['starch', '淀粉', ['玉米淀粉', '生粉'], C, 'staple', 'g', 1, [346, 0.2, 0.1, 85], { room: 365 }, 'room'],
  ['sichuanpepper', '花椒', ['花椒粉'], C, 'staple', 'g', 1, [316, 6.7, 8.9, 66.5], { room: 365 }, 'room'],
  ['oystersauce', '蚝油', [], C, 'staple', 'g', 1, [114, 1.4, 0.2, 11], { fridge: 180 }, 'fridge'],
  ['sesameoil', '香油', ['芝麻油'], C, 'staple', 'ml', 0.92, [898, 0, 99.7, 0.2], { room: 365 }, 'room'],

  ['cola', '可乐', [], O, 'tracked', 'ml', 1.04, [42, 0, 0, 10.6], { room: 180 }, 'room', [{ unit: '罐', toBase: 330 }, { unit: '瓶', toBase: 500 }]],
];

export function seedFoods(): Food[] {
  return ROWS.map(([id, name, aliases, section, kind, baseUnit, gPerBase, per100, shelf, defaultLocation, conversions, purchaseUnit]) => ({
    id: 'f_' + id,
    name,
    aliases,
    pinyinInitials: buildInitials(name, aliases),
    section,
    sectionLearned: false,
    kind,
    baseUnit,
    gPerBase,
    conversions: conversions ?? [],
    per100: per100 ? { kcal: per100[0], protein: per100[1], fat: per100[2], carb: per100[3] } : null,
    nutritionSource: 'sample',
    shelfDays: shelf,
    defaultLocation,
    purchaseUnit,
  }));
}
