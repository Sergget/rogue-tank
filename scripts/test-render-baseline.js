// test-render-baseline.js — R0 / I3（2026-10-27）渲染基线判定逻辑回归。
// 覆盖：① 网格完全一致 ② 容差内的小差异 ③ 超容差必须失败并给出原因
//   ④ 网格长度/单元格非法 ⑤ compareScene 的画布尺寸检查
//   ⑥ validateBaseline 对残缺基线的拒绝（防止把半截 JSON 当基线）
// 运行：node scripts/test-render-baseline.js
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;
const B = require('./lib/render-baseline.cjs');

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const N = B.GRID_W * B.GRID_H;
function grid(fill){
  const g = [];
  for (let i = 0; i < N; i++) g.push([fill, fill, fill]);
  return g;
}

// ① 完全一致
{
  const g = grid(120);
  const r = B.compareGrid(g, g.map(c => c.slice()));
  ok(r.ok && r.maxDelta === 0 && r.meanDelta === 0, `完全一致（max=${r.maxDelta}）`);
}

// ② 容差内：每通道 +2，max=2 ≤ 16、mean=2 ≤ 2
{
  const a = grid(120);
  const b = grid(122);
  const r = B.compareGrid(a, b);
  ok(r.ok, `容差内小差异通过（max=${r.maxDelta} mean=${r.meanDelta}）`);
}

// ③ 超容差：整体 +10 → mean 10 > 2
{
  const a = grid(120);
  const b = grid(130);
  const r = B.compareGrid(a, b);
  ok(!r.ok && /mean|max/.test(r.reason || ''), `整体偏移必须失败（${r.reason}）`);
}

// ③b 局部大偏移：单格 +200 → max 超限
{
  const a = grid(120);
  const b = grid(120);
  b[7] = [255, 255, 255];
  const r = B.compareGrid(a, b);
  ok(!r.ok && r.maxDelta >= 100 && r.worstIndex === 7,
     `局部结构变化必须失败（max=${r.maxDelta} at ${r.worstIndex}）`);
}

// ④ 长度 / 单元格非法
{
  ok(!B.compareGrid([], grid(1)).ok, '空网格判失败');
  ok(!B.compareGrid(grid(1).slice(1), grid(1)).ok, '长度不符判失败');
  const bad = grid(1); bad[3] = [1, 2];
  ok(!B.compareGrid(grid(1), bad).ok, '单元格缺通道判失败');
  ok(!B.compareGrid(null, grid(1)).ok, '缺失网格判失败');
}

// ⑤ compareScene：画布尺寸与网格分别检查
{
  const base = { size: [1280, 720], grid: grid(100), luma: [] };
  const same = { size: [1280, 720], grid: grid(100), luma: [] };
  ok(B.compareScene(base, same).ok, '同尺寸同画面通过');
  const resized = { size: [1920, 1080], grid: grid(100), luma: [] };
  const r = B.compareScene(base, resized);
  ok(!r.ok && r.failures.some(f => f.startsWith('canvas-size')), '画布尺寸变化判失败');
}

// ⑥ 基线形状校验
{
  const good = { version: 1, viewport: [1280, 720], scenes: { standard: { size: [1280, 720], grid: grid(10) } } };
  ok(B.validateBaseline(good).ok, '合法基线通过');
  ok(!B.validateBaseline(null).ok, 'null 判失败');
  ok(!B.validateBaseline({ version: 2, viewport: [1280, 720], scenes: {} }).ok, '版本不符判失败');
  ok(!B.validateBaseline({ version: 1, viewport: [1280], scenes: {} }).ok, 'viewport 非法判失败');
  ok(!B.validateBaseline({ version: 1, viewport: [1280, 720], scenes: {} }).ok, '空 scenes 判失败');
  ok(!B.validateBaseline({ version: 1, viewport: [1280, 720], scenes: { standard: { size: [1, 1], grid: [] } } }).ok,
     '残缺场景网格判失败');
}

process.exitCode = fails ? 1 : 0;
if(fails) console.error(`\n${fails} 项失败`);
else console.log('\n全部通过');
