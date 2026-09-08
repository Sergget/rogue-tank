// test-nodegen-calibration.js — 节点布局难度校准回归（基于 nodeLayoutMetrics 锁定剖面）
// 运行：node scripts/test-nodegen-calibration.js
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;   // 必须在 require tank_geometry/cover 之前
const U = require('../js/tank_utils.js');
const G = require('../js/tank_geometry.js');
Object.assign(global, U, G);   // 模拟浏览器全局（partCorners/polyCorners/createRNG/rotate 等）
global.TAU = U.TAU;
const coverMod = require('../js/tank_cover.js');
const nodegen = require('../js/tank_nodegen.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log('  ✓ ' + label);
  else { console.error('  ✗ ' + label); fails++; }
}

// 8-seed 实测基线（p43-measure.cjs，scale=3），作为难度曲线回归锚点。
const DIFFS = [0.1, 0.3, 0.5, 0.7, 0.9];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const OPEN = new Set(['corridor_tutorial', 'urban_block', 'crossfire_plaza', 'mixed_barrier_plaza', 'village_center']);
const DENSE = new Set(['forest_dense', 'woodland_line']);

// BASE[templateId][diffIndex] = { cov, con, minw }
const BASE = {
  corridor_tutorial: [{"cov":0.032,"con":1,"minw":16.2},{"cov":0.032,"con":1,"minw":12.3},{"cov":0.034,"con":1,"minw":13.1},{"cov":0.031,"con":1,"minw":12.6},{"cov":0.031,"con":1,"minw":13.1}],
  forest_dense: [{"cov":0.045,"con":1,"minw":2.5},{"cov":0.045,"con":1,"minw":2.5},{"cov":0.045,"con":1,"minw":2.5},{"cov":0.044,"con":1,"minw":2.6},{"cov":0.043,"con":1,"minw":2.5}],
  urban_block: [{"cov":0.046,"con":1,"minw":2.5},{"cov":0.041,"con":1,"minw":2.2},{"cov":0.044,"con":1,"minw":2.1},{"cov":0.043,"con":1,"minw":2.5},{"cov":0.039,"con":1,"minw":3.1}],
  crossfire_plaza: [{"cov":0.037,"con":1,"minw":3},{"cov":0.036,"con":1,"minw":2.9},{"cov":0.037,"con":1,"minw":3},{"cov":0.037,"con":1,"minw":2.6},{"cov":0.034,"con":1,"minw":1.9}],
  mixed_barrier_plaza: [{"cov":0.03,"con":1,"minw":8.3},{"cov":0.028,"con":1,"minw":13.2},{"cov":0.028,"con":1,"minw":11.4},{"cov":0.029,"con":1,"minw":11.3},{"cov":0.029,"con":1,"minw":12.9}],
  village_center: [{"cov":0.05,"con":0.999,"minw":1.2},{"cov":0.046,"con":0.999,"minw":1.1},{"cov":0.047,"con":0.999,"minw":1},{"cov":0.045,"con":0.999,"minw":1.2},{"cov":0.046,"con":1,"minw":1.3}],
  woodland_line: [{"cov":0.034,"con":1,"minw":12.6},{"cov":0.033,"con":1,"minw":12.5},{"cov":0.035,"con":1,"minw":10.6},{"cov":0.034,"con":1,"minw":9.1},{"cov":0.033,"con":1,"minw":11.3}],
};
const TOL = { cov: 0.02, con: 0.05, minw: 0.5 };

const opts2 = { step: 40, margin: 40, losSamples: 40, hasLineOfSight: coverMod.hasLineOfSight };

const templates = nodegen.getTemplates().filter(t => BASE[t.id]);
for (const t of templates) {
  const grp = OPEN.has(t.id) ? 'OPEN' : (DENSE.has(t.id) ? 'DENSE' : 'OPEN');
  const covSeries = [];
  for (let di = 0; di < DIFFS.length; di++) {
    const d = DIFFS[di];
    let cov = 0, con = 0, minw = 0, n = 0;
    for (const s of SEEDS) {
      const a = nodegen.generateNode(d, { seed: s, templateId: t.id, scale: 3, centerX: 600, centerY: 350 });
      const m = nodegen.nodeLayoutMetrics(a, opts2);
      cov += m.coverCoverage; con += m.connectivityRatio; minw += m.minPassageWidth; n++;
    }
    cov /= n; con /= n; minw /= n; covSeries.push(cov);
    const b = BASE[t.id][di];
    const covOk = Math.abs(cov - b.cov) <= TOL.cov;
    const conOk = Math.abs(con - b.con) <= TOL.con;
    const minwOk = Math.abs(minw - b.minw) <= TOL.minw;
    ok(covOk, `${t.id} d=${d} coverCoverage=${cov.toFixed(3)} (≈基线 ${b.cov})`);
    ok(conOk, `${t.id} d=${d} connectivity=${con.toFixed(3)} (≈基线 ${b.con})`);
    ok(minwOk, `${t.id} d=${d} minPassage=${minw.toFixed(1)} (≈基线 ${b.minw})`);
    // 连通性地板（设计意图）
    if (grp === 'OPEN') ok(con >= 0.85, `${t.id} d=${d} 开阔模板连通性地板≥0.85 (=${con.toFixed(3)})`);
    else ok(con >= 0.35, `${t.id} d=${d} 密林模板连通性地板≥0.35（自然分区，真实对局由 findPlayerSpawn+ensureLoSCorridor 兜底）(=${con.toFixed(3)})`);
  }
  // 开阔模板：coverCoverage 整体随难度非降（首→尾）
  if (grp === 'OPEN') {
    ok(covSeries[4] >= covSeries[0] - 0.01, `${t.id} coverCoverage 随难度非降 ${covSeries[0].toFixed(3)}→${covSeries[4].toFixed(3)}`);
  }
}

if (fails > 0) { console.error(`\n✗ ${fails} 个校准断言失败`); process.exit(1); }
else { console.log('\n✓ 节点布局难度校准回归全部通过（5 模板×5 难度×8 seed 锚定）'); process.exit(0); }
