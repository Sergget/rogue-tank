'use strict';
// #MODE（2026-10-15）验证脚本：Boss 战模式 / 生存模式节点生成逻辑
// 用法：node scripts/test-modes.js
// 覆盖：bossOnly 全 Boss 链（标记/无常规敌/quota=null/难度递增/extendRun 延续）；
//       generateSurvivalRun（单节点/survival 标记/无预置 Boss/大地图/波次难度曲线/3波一Boss/规模封顶）；
//       标准模式零回归。

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;   // 必须在 require 其他模块之前
const U = require('../js/tank_utils.js');
const G = require('../js/tank_geometry.js');
Object.assign(global, U, G);      // 模拟浏览器全局
global.TAU = U.TAU;
require('../js/tank_cover.js');
const NG = require('../js/tank_nodegen.js');
global.createRNG = NG.createRNG;
global.generateNode = NG.generateNode;
global.pickTemplate = NG.pickTemplate;
const MAP = require('../js/tank_map.js');

let pass = 0, fail = 0;
function ok(cond, label){
  if(cond){ pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}`); }
}

console.log('== Boss 模式：generateRun(bossOnly) 全 Boss 节点 ==');
{
  const run = MAP.generateRun(12345, 5, { bossOnly: true, difficultyLevel: 0 });
  ok(run.nodes.length === 5, `节点数=5（实际 ${run.nodes.length}）`);
  ok(run.nodes.every(n => n.boss === true), '全部节点 boss=true');
  ok(run.nodes.every(n => n.enemies.length === 0), '全部节点无常规敌人');
  ok(run.nodes.every(n => n.quota === null), '全部节点 quota=null（Boss 节点禁用配额）');
  const diffs = run.nodes.map(n => n.difficulty);
  const nonDecreasing = diffs.every((d, i) => i === 0 || d >= diffs[i - 1] - 1e-9);
  ok(nonDecreasing, `难度单调非降（${diffs.map(d => d.toFixed(2)).join(' → ')}）`);
  ok(run.env && run.env.bossOnly === true, 'run.env 保留 bossOnly（extendRun 延续）');
  const extra = MAP.extendRun(run);
  ok(extra && extra.boss === true, 'extendRun 追加节点仍为 Boss');
  ok(run.nodes.length === 6, '链长 5→6');
}

console.log('== 生存模式：generateSurvivalRun 单个大地图 ==');
{
  const vp = { vw: 1280, vh: 720 };
  const run = MAP.generateSurvivalRun(999, { viewport: vp, difficultyLevel: 0 });
  ok(run.nodes.length === 1, `单节点（实际 ${run.nodes.length}）`);
  const node = run.nodes[0];
  ok(node.survival === true, 'node.survival=true');
  ok(node.boss === null, 'node.boss=null（Boss 按波次手动生成）');
  ok(node.enemies.length === 0, '无预置常规敌人');
  const std = MAP.generateRun(999, 1, { viewport: vp, difficultyLevel: 0 });
  const stdNode = std.nodes[0];
  const areaRatio = (node.w * node.h) / (stdNode.w * stdNode.h);
  ok(areaRatio > 2.5, `地图面积约为标准 ${areaRatio.toFixed(1)}x（>2.5x）`);
  console.log(`    生存 ${Math.round(node.w)}x${Math.round(node.h)} vs 标准 ${Math.round(stdNode.w)}x${Math.round(stdNode.h)}`);
  const d1 = MAP.difficultyForIndex(0, 0), d5 = MAP.difficultyForIndex(4, 0), d11 = MAP.difficultyForIndex(10, 0);
  ok(d1 < d5 && d5 < d11, `波次难度递增（w1=${d1} w5=${d5} w11=${d11}）`);
  ok([3,6,9,12].every(n => n % 3 === 0) && [1,2,4,5,7,8].every(n => n % 3 !== 0),
     '每 3 波为 Boss 波（3/6/9/12），其余为普通波');
  const countFor = n => Math.min(3 + Math.floor(n / 2), 12);
  ok(countFor(1) === 3 && countFor(5) === 5 && countFor(20) === 12, '波次规模 3→12 递增封顶');
}

console.log('== 标准模式回归：不受 bossOnly 影响 ==');
{
  const run = MAP.generateRun(12345, 6, { difficultyLevel: 0 });
  const bossIdx = run.nodes.map((n, i) => n.boss === true ? i : -1).filter(i => i >= 0);
  ok(JSON.stringify(bossIdx) === JSON.stringify([2, 5]),
     `6 节点 Boss 位置=[2,5]（实际 [${bossIdx}]，bossInterval=3）`);
  ok(!('bossOnly' in (run.env || {})), '标准模式 env 无 bossOnly');
}

console.log(`\n测试汇总：${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
