// test-perf.js — R0（2026-10-27）性能采样纯逻辑回归。
// 覆盖：① summarizeMs 分位/边界 ② 环形缓冲容量与回绕 ③ reset
//   ④ 非法输入（NaN/负数/缺失）按 0 计，不污染统计
// 运行：node scripts/test-perf.js
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.RULES = R.RULES;
const P = require('../js/tank_perf.js');

let fails = 0;
function ok(cond, label){
  if(cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ① 空样本
{
  const s = P.summarizeMs(new Float64Array(0), 0);
  ok(s.count === 0 && s.p50 === 0 && s.max === 0 && s.mean === 0, '空样本全 0，不产生 NaN');
  const s2 = P.summarizeMs(null, 5);
  ok(s2.count === 0, 'values 缺失时按 0 样本处理');
}

// ② 已知分布：1..100 的 p50/p95/max/mean
{
  const arr = new Float64Array(100);
  for (let i = 0; i < 100; i++) arr[i] = i + 1;
  const s = P.summarizeMs(arr, 100);
  ok(s.p50 === 50, `p50=${s.p50}（期望 50）`);
  ok(s.p95 === 95, `p95=${s.p95}（期望 95）`);
  ok(s.max === 100 && s.mean === 50.5, `max=${s.max} mean=${s.mean}`);
}

// ③ 只统计前 count 个有效槽位
{
  const arr = new Float64Array([1, 2, 3, 999, 999]);
  const s = P.summarizeMs(arr, 3);
  ok(s.count === 3 && s.max === 3, '尾部未使用槽位不参与统计');
}

// ④ 非法值按 0：NaN / 负数 / undefined
{
  const arr = new Float64Array([2, NaN, -5, 4]);
  const s = P.summarizeMs(arr, 4);
  ok(s.count === 4 && s.max === 4 && s.mean === 1.5,
     `非法值归零（max=${s.max} mean=${s.mean}）`);
}

// ⑤ 环形缓冲：容量与回绕只保留最近 N 帧
{
  const ring = P.createPerfRing(4);
  for (let i = 0; i < 10; i++) ring.frame(i, i * 10);
  const s = ring.stats();
  ok(s.frames === 4, `frames=${s.frames}（期望 4）`);
  ok(s.update.max === 9 && s.update.p50 === 7, `回绕后保留最近 4 帧（update max=${s.update.max} p50=${s.update.p50}）`);
  ok(s.draw.max === 90, `draw 通道独立（max=${s.draw.max}）`);
}

// ⑥ reset 清空
{
  const ring = P.createPerfRing(8);
  ring.frame(5, 6);
  ring.reset();
  const s = ring.stats();
  ok(s.frames === 0 && s.update.count === 0, 'reset 后无样本');
}

// ⑦ 非法耗时不得进入统计
{
  const ring = P.createPerfRing(3);
  ring.frame(NaN, -1);
  ring.frame(2, 3);
  const s = ring.stats();
  ok(s.frames === 2 && s.update.max === 2 && s.draw.max === 3, 'NaN/负数耗时按 0 计');
}

// ⑧ 容量钳制：0 / 负数 / 缺失都至少 1
{
  ok(P.createPerfRing(0).capacity === 1, 'capacity=0 → 1');
  ok(P.createPerfRing(-9).capacity === 1, 'capacity=-9 → 1');
  ok(P.createPerfRing().capacity === 240, '缺省 capacity=240');
}

process.exitCode = fails ? 1 : 0;
if(fails) console.error(`\n${fails} 项失败`);
else console.log('\n全部通过');
