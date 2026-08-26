// ============================================================================
// P-44 回放冒烟基线：seed 固定的 headless 全链战斗回放（js/tank_sim.js）。
// 断言目标：
//   1. 完整节点链可 headless 打完，无异常；
//   2. 同 seed 两次回放结果完全一致（确定性 = 修补前的判据基线）；
//   3. 不同 seed 产生不同战局（随机流确实在起作用，非恒定路径）;
//   4. 结果字段满足基本不变量（时长上界 / HP 百分比域 / 战斗确有发生）。
// 运行：node scripts/test-replay.js
// ============================================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------- 全局装配（沿用既有测试约定：依赖模块先于消费者挂到 global） ----------
const U = require('../js/tank_utils.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir;
global.distToSegment = U.distToSegment; global.gaussian = U.gaussian; global.angDiff = U.angDiff;
const R = require('../js/tank_rules.js');
global.RULES = R.RULES;
const NG = require('../js/tank_nodegen.js');
global.createRNG = NG.createRNG;
global.generateNode = NG.generateNode;
global.pickTemplate = NG.pickTemplate;
const HG = require('../js/tank_halfgeom.js');
for (const k of Object.keys(HG)) global[k] = HG[k];
const G = require('../js/tank_geometry.js');
for (const k of Object.keys(G)) global[k] = G[k];
const MD = require('../js/tank_model.js');
for (const k of Object.keys(MD)) global[k] = MD[k];
const P = require('../js/tank_physics.js');
for (const k of Object.keys(P)) if (global[k] === undefined) global[k] = P[k];
const ENT = require('../js/tank_entity.js');
for (const k of Object.keys(ENT)) global[k] = ENT[k];
const MOVE = require('../js/tank_move.js');
for (const k of Object.keys(MOVE)) global[k] = MOVE[k];
const COV = require('../js/tank_cover.js');
for (const k of Object.keys(COV)) global[k] = COV[k];
const AI = require('../js/tank_ai.js');
for (const k of Object.keys(AI)) global[k] = AI[k];
const CARDS = require('../js/tank_cards.js');
if (CARDS.computeAmmoConfig) global.computeAmmoConfig = CARDS.computeAmmoConfig;
const MAP = require('../js/tank_map.js');
for (const k of Object.keys(MAP)) global[k] = MAP[k];
const FIRE = require('../js/tank_fire.js');
for (const k of Object.keys(FIRE)) global[k] = FIRE[k];

const SIM = require('../js/tank_sim.js');

let fails = 0;
function ok(cond, label){
  if (cond) console.log(`\u2713 ${label}`);
  else { console.error(`\u2717 ${label}`); fails++; }
}

const DT = 1 / 30;

// ---------- 1) 默认链可完整打完 ----------
let r1;
try {
  r1 = SIM.runReplay({ seed: 1, nodeCount: 5, dt: DT, maxNodeTime: 120 });
  ok(true, `seed=1 回放完成: ${r1.summary}`);
} catch (e){
  ok(false, `seed=1 回放抛异常: ${e.stack ? e.stack.split('\n')[0] : e}`);
  console.error(e.stack);
  process.exit(1);
}
ok(r1.nodeCount === 5, `节点数 = 5（got ${r1.nodeCount}）`);
ok(r1.results.every(x => ['win', 'loss', 'timeout'].includes(x.outcome)),
  `所有节点结局合法（${r1.results.map(x => x.outcome).join(',')}）`);
ok(r1.results.every(x => x.duration <= 120 + DT * 2), '所有节点时长不超过 maxNodeTime 上界');
ok(r1.results.every(x => x.playerHpPct >= 0 && x.playerHpPct <= 1), '玩家 HP 百分比处于 [0,1]');
const totalShots = r1.results.reduce((s, x) => s + x.playerShots + x.enemyShots, 0);
ok(totalShots > 0, `战斗确有发生（总开火 ${totalShots} 次）`);

// ---------- 2) 同 seed 确定性 ----------
const r1b = SIM.runReplay({ seed: 1, nodeCount: 5, dt: DT, maxNodeTime: 120 });
ok(r1b.hash === r1.hash, `同 seed 摘要一致（${r1.hash} === ${r1b.hash}）`);
ok(JSON.stringify(r1b.results) === JSON.stringify(r1.results), '同 seed 逐节点结果逐字段一致');

// ---------- 3) 不同 seed 分化 ----------
const hashes = new Set([r1.hash]);
let diverged = false;
const perSeed = [];
for (const s of [2, 3, 42]){
  const rs = SIM.runReplay({ seed: s, nodeCount: 5, dt: DT, maxNodeTime: 120 });
  hashes.add(rs.hash);
  perSeed.push(`seed=${s}: ${rs.summary} #${rs.hash}`);
}
diverged = hashes.size > 1;
ok(diverged, `不同 seed 产生不同战局（${hashes.size} 个独立摘要）`);
for (const line of perSeed) console.log(`  · ${line}`);

// ---------- 4) 单节点快速链（小世界冒烟，防长链掩盖问题） ----------
try {
  const rShort = SIM.runReplay({ seed: 9, nodeCount: 1, dt: DT, maxNodeTime: 60 });
  ok(rShort.nodeCount === 1 && ['win', 'loss', 'timeout'].includes(rShort.results[0].outcome),
    `单节点链正常（outcome=${rShort.results[0].outcome}, ${rShort.results[0].duration}s）`);
} catch (e){
  ok(false, `单节点链抛异常: ${e.message}`);
}

// ---------- 摘要输出 ----------
console.log('\nreplay-baseline: ' + (fails === 0
  ? `全部通过（baseline hash seed=1 → ${r1.hash}）`
  : `${fails} 项失败`));
process.exit(fails === 0 ? 0 : 1);
