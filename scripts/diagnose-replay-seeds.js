// ============================================================================
// diagnose-replay-seeds.js — P-44 待办①：批量 seed 回放扫描器（诊断工具）
// 用既定回放基线（js/tank_sim.js runReplay）跑一批 seed，收集「失败案例候选」
// 供后续核实进 docs/ISSUES.md。本脚本是诊断工具，不挂入 npm test（避免 CI 变慢），
// 手动运行：node scripts/diagnose-replay-seeds.js [seedCount] [nodeCount] [maxNodeTime]
// 判定维度（仅统计/标记，不自动开 ISSUES——需人工按证据核实）：
//   - hardCrash：某 seed 抛异常 → 硬性失败，必须核实；
//   - timeoutHeavy：单 seed 内 timeout 节点数 >= 阈值（默认 ceil(nodeCount*0.4)）；
//   - zeroFire：单 seed 总开火数（玩家+敌人）< nodeCount，提示几乎无交战；
//   - earlyLoss：节点 index 0 即 loss 且玩家开火极少（<=1）。
// ============================================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');

const U = require('../js/tank_utils.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir;
global.distToSegment = U.distToSegment; global.gaussian = U.gaussian; global.angDiff = U.angDiff;
const R = require('../js/tank_rules.js');
global.RULES = R.RULES;
const NG = require('../js/tank_nodegen.js');
global.createRNG = NG.createRNG; global.generateNode = NG.generateNode; global.pickTemplate = NG.pickTemplate;
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

const SEED_COUNT = parseInt(process.argv[2], 10) || 40;
const NODE_COUNT = parseInt(process.argv[3], 10) || 5;
const MAX_NODE_TIME = parseInt(process.argv[4], 10) || 60;
const DT = 1 / 30;
const TIMEOUT_THRESHOLD = Math.ceil(NODE_COUNT * 0.4);

let hardCrash = 0, timeoutHeavy = 0, zeroFire = 0, earlyLoss = 0;
const crashes = [], timeoutSeeds = [], zeroFireSeeds = [], earlyLossSeeds = [];
const outcomeTally = { win: 0, loss: 0, timeout: 0 };
const t0 = Date.now();

for (let i = 0; i < SEED_COUNT; i++){
  const seed = i + 1;
  let res;
  try {
    res = SIM.runReplay({ seed, nodeCount: NODE_COUNT, dt: DT, maxNodeTime: MAX_NODE_TIME });
  } catch (e){
    hardCrash++;
    crashes.push(`seed=${seed}: ${e.message}`);
    continue;
  }
  for (const r of res.results){
    if (outcomeTally[r.outcome] !== undefined) outcomeTally[r.outcome]++;
  }
  const timeouts = res.results.filter(r => r.outcome === 'timeout').length;
  const totalShots = res.results.reduce((s, r) => s + r.playerShots + r.enemyShots, 0);
  const first = res.results[0];
  if (timeouts >= TIMEOUT_THRESHOLD){ timeoutHeavy++; timeoutSeeds.push(`seed=${seed}: ${timeouts}/${NODE_COUNT} timeout`); }
  if (totalShots < NODE_COUNT){ zeroFire++; zeroFireSeeds.push(`seed=${seed}: totalShots=${totalShots}`); }
  if (first && first.outcome === 'loss' && first.playerShots <= 1){ earlyLoss++; earlyLossSeeds.push(`seed=${seed}: node0 loss, playerShots=${first.playerShots}`); }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const totalNodes = SEED_COUNT * NODE_COUNT;
console.log(`\n=== diagnose-replay-seeds: ${SEED_COUNT} seeds x ${NODE_COUNT} nodes, maxNodeTime=${MAX_NODE_TIME}s, ${elapsed}s ===`);
console.log(`outcome 分布: win=${outcomeTally.win} loss=${outcomeTally.loss} timeout=${outcomeTally.timeout} (总节点 ${totalNodes})`);
console.log(`hardCrash=${hardCrash}  timeoutHeavy(${TIMEOUT_THRESHOLD}+)=${timeoutHeavy}  zeroFire=${zeroFire}  earlyLoss=${earlyLoss}`);
if (crashes.length) console.log('CRASH:\n  ' + crashes.join('\n  '));
if (timeoutSeeds.length) console.log('TIMEOUT-HEAVY:\n  ' + timeoutSeeds.join('\n  '));
if (zeroFireSeeds.length) console.log('ZERO-FIRE:\n  ' + zeroFireSeeds.join('\n  '));
if (earlyLossSeeds.length) console.log('EARLY-LOSS:\n  ' + earlyLossSeeds.join('\n  '));

// 诊断脚本退出码：仅 hardCrash 视为非零（其余为待核实候选，不阻断）
process.exit(hardCrash > 0 ? 1 : 0);
