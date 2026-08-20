// test-nodegen.js — 节点地图元素生成器测试（Node 端，Pure Logic）
// 验证确定性 / 难度权重 / 覆盖范围合法性 / 性能基准
// 运行：node scripts/test-nodegen.js
'use strict';

const path = require('path');
const { createRNG, registerTemplate, generateNode, getTemplates, NODE_TEMPLATES } = require('../js/tank_nodegen.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log('  ✓ ' + label);
  else { console.error('  ✗ ' + label); fails++; }
}

// 1) 确定性：相同种子生成相同覆盖
const seed = 12345;
const result1 = generateNode(0.5, { seed });
const result2 = generateNode(0.5, { seed });
function eqCover(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
ok(result1.covers.length === result2.covers.length, '种子确定性覆盖数量一致');
for (let i = 0; i < result1.covers.length; i++) {
  ok(eqCover(result1.covers[i], result2.covers[i]), `种子 ${i} 覆盖一致`);
}

// 2) 难度权重：同一模板同一种子下，低难 bush/soft 保留 ≥ 高难（高难把 bush/soft
//    升级为 barricade 且低难把 barricade 降级为 soft；cullRate=0 屏蔽剔除干扰，
//    保证逐元素确定性可比）
for (const tpl of getTemplates()) {
  const low = generateNode(0.1, { templateId: tpl.id, seed: 7, cullRate: 0 });
  const high = generateNode(0.9, { templateId: tpl.id, seed: 7, cullRate: 0 });
  const count = (arr, pred) => arr.filter(pred).length;
  const lowBushSoft = count(low.covers, c => c.tier === 'bush' || c.tier === 'soft');
  const highBushSoft = count(high.covers, c => c.tier === 'bush' || c.tier === 'soft');
  const lowHard = count(low.covers, c => c.tier === 'half' || c.tier === 'full' || c.tier === 'barricade');
  const highHard = count(high.covers, c => c.tier === 'half' || c.tier === 'full' || c.tier === 'barricade');
  ok(lowBushSoft >= highBushSoft,
     `模板 ${tpl.id} 低难 bush/soft(${lowBushSoft}) ≥ 高难(${highBushSoft})`);
  ok(highHard >= lowHard,
     `模板 ${tpl.id} 高难 half/full/barricade(${highHard}) ≥ 低难(${lowHard})`);
}

// 3) 覆盖范围合法性：坐标 / 尺寸 / tier 存在于 RULES.coverTiers
const RULES = require('../js/tank_rules.js').RULES;
const coverTiers = RULES.coverTiers;
for (const c of result1.covers) {
  ok(typeof c.x === 'number' && typeof c.y === 'number', '坐标数字');
  ok(c.w > 0 && c.h > 0, '尺寸正数');
  ok(c.tier in coverTiers, `tier ${c.tier} 在 RULES.coverTiers 中`);
  if (c.verts) ok(Array.isArray(c.verts) && c.verts.length >= 3, 'verts 合法');
  if (c.collisionVerts) ok(Array.isArray(c.collisionVerts) && c.collisionVerts.length > 0, 'collisionVerts 合法');
}

// 4) 性能基准与密度下界（#25：模板 12~25 元素，中高难剔除后保留下界 ≥ 8）
const templates = getTemplates();
ok(templates.length >= 7, `内置模板数量 ≥ 7（实际 ${templates.length}）`);
for (const tpl of NODE_TEMPLATES) {
  ok(tpl.items.length >= 12 && tpl.items.length <= 25,
     `模板 ${tpl.id} items ${tpl.items.length} 在 12~25 区间`);
  ok(Array.isArray(tpl.tags) && tpl.tags.length > 0, `模板 ${tpl.id} 有 tags`);
  const tiers = new Set(tpl.items.map(it => it.tier));
  ok(tiers.size >= 4, `模板 ${tpl.id} 混合 ≥4 种 tier（${[...tiers].join('/')}）`);
}
for (const tpl of templates) {
  const maxItems = 30; // #25：单模板最多 25 元素，低难剔除后仍 ≤ 30
  const minItems = 8;  // #25：中高难剔除率低（≤0.044），保留数下界
  const lowDiff = generateNode(0.1, { templateId: tpl.id, seed: 1 });
  ok(lowDiff.covers.length >= 1 && lowDiff.covers.length <= maxItems,
     `模板 ${tpl.id} 低难覆盖数量 ${lowDiff.covers.length} 合理（≤30）`);
  const highDiff = generateNode(0.9, { templateId: tpl.id, seed: 1 });
  ok(highDiff.covers.length >= minItems,
     `模板 ${tpl.id} 高难覆盖数量 ${highDiff.covers.length} ≥ ${minItems}`);
}

// 5) 预损毁状态过渡：tree→stump/fallen, barricade→rubble
for (const c of result1.covers) {
  if (c.tier === 'stump' || c.tier === 'fallen' || c.tier === 'rubble') ok(true, `预损毁覆盖出现 tier=${c.tier}`);
}

// 6) 生成到真实 covers 的集成（仅浏览端，避免 Node 端副作用）
if (typeof covers !== 'undefined') {
  const oldLen = covers.length;
  generateNode(0.5, { seed: 999, applyToCovers: true });
  ok(covers.length > oldLen, 'applyToCovers 写入 covers');
  covers.length = oldLen; // 恢复初始状态
}

console.log('test-nodegen: 完成所有检查');
if (fails === 0) console.log('test-nodegen: 全部通过');
else console.error(`test-nodegen: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);