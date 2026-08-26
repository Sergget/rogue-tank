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
  corridor_tutorial:    [{cov:0.064,con:1.000,minw:22.9},{cov:0.075,con:1.000,minw:22.4},{cov:0.073,con:1.000,minw:20.5},{cov:0.067,con:1.000,minw:19.1},{cov:0.075,con:1.000,minw:19.1}],
  forest_dense:         [{cov:1.135,con:0.875,minw:3.2},{cov:1.143,con:0.875,minw:3.6},{cov:1.146,con:0.746,minw:2.7},{cov:1.169,con:0.375,minw:3.1},{cov:1.157,con:0.625,minw:3.1}],
  urban_block:          [{cov:0.121,con:0.992,minw:4.3},{cov:0.126,con:0.991,minw:3.5},{cov:0.132,con:0.986,minw:5.6},{cov:0.137,con:0.989,minw:5.7},{cov:0.143,con:0.990,minw:4.5}],
  crossfire_plaza:      [{cov:0.106,con:0.996,minw:3.1},{cov:0.114,con:0.997,minw:3.5},{cov:0.113,con:0.997,minw:4.7},{cov:0.120,con:0.996,minw:4.5},{cov:0.120,con:0.996,minw:4.5}],
  mixed_barrier_plaza:  [{cov:0.067,con:1.000,minw:13.6},{cov:0.074,con:1.000,minw:16.7},{cov:0.070,con:1.000,minw:19.6},{cov:0.087,con:1.000,minw:26.8},{cov:0.098,con:1.000,minw:26.7}],
  village_center:       [{cov:0.149,con:0.979,minw:1.0},{cov:0.150,con:0.979,minw:0.9},{cov:0.173,con:0.982,minw:0.9},{cov:0.177,con:0.966,minw:1.7},{cov:0.186,con:0.973,minw:1.8}],
  woodland_line:        [{cov:1.091,con:0.875,minw:18.8},{cov:1.127,con:0.625,minw:13.4},{cov:1.096,con:1.000,minw:14.1},{cov:1.115,con:0.625,minw:22.2},{cov:1.120,con:0.625,minw:20.1}],
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
