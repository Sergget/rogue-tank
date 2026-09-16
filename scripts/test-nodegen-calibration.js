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
// #A11 重锚（2026-09-13，绝对出生起点口径）：路网密度收敛（分支 0.6→0.35、
// roadW 60~80、full 避让）+ village 沿路网选簇心 + pond 忽略 road 且 9x9+回退 +
// 植被不避路剔除 + 出生走廊保护（建筑/杂物/水潭避让左缘起点）+ nodeLayoutMetrics
// BFS 种子取最近自由网格后，7 模板×5 难度连通性全线 1.000（开阔≥0.85/密林≥0.35
// 地板显著富余）、coverCoverage 整体上移（道路计入覆盖剖面）。
// #A17 重锚（2026-09-14）：道路曲线化（Catmull-Rom 平滑 + 35% 分支）+ 跨相重叠消解
// （pruneOverlappingCovers：nudge 平移优先、无空位才移除）后——元素保留取代旧"移除"，
// 实际元素更多 → minPassageWidth 整体收窄（corridor 18→2.9 量级）；forest_dense
// 个别 seed 连通性 0.875（仍 ≥ 地板 0.35）。coverCoverage 剖面基本不变。
// #B7 重锚（2026-09-16，路网重做为「正交双干道」）：道路不再按模板建筑逐段跳段
// （被截断根因）、端点落节点边界（圆弧路头根因）、干道端点漂移 ±0.42→±0.13 且
// 控制点横向偏移 ±0.18→±0.04（浅角互穿＝"叠加"观感根因）、取消斜向支线。
// 影响：路网更完整且不再切割布局 → **全部模板连通性升到 1.000**（forest_dense 的
// 0.875 一并消除）；minPassageWidth 随道路不再被跳段打断而整体上移
// （corridor 2.9→4.8 量级、woodland 2.6→5.0 量级）；coverCoverage 基本不变（道路不计入）。
const BASE = {
  corridor_tutorial: [{"cov":0.051,"con":1,"minw":4.8},{"cov":0.051,"con":1,"minw":4.6},{"cov":0.053,"con":1,"minw":6.0},{"cov":0.049,"con":1,"minw":4.8},{"cov":0.049,"con":1,"minw":4.8}],
  forest_dense: [{"cov":0.060,"con":1,"minw":2.2},{"cov":0.061,"con":1,"minw":2.2},{"cov":0.059,"con":1,"minw":2.4},{"cov":0.058,"con":1,"minw":1.4},{"cov":0.057,"con":1,"minw":1.4}],
  urban_block: [{"cov":0.057,"con":1,"minw":2.4},{"cov":0.057,"con":1,"minw":2.2},{"cov":0.058,"con":1,"minw":1.2},{"cov":0.055,"con":1,"minw":1.9},{"cov":0.052,"con":1,"minw":1.5}],
  crossfire_plaza: [{"cov":0.049,"con":1,"minw":3.4},{"cov":0.048,"con":1,"minw":3.3},{"cov":0.047,"con":1,"minw":3.2},{"cov":0.048,"con":1,"minw":3.1},{"cov":0.045,"con":1,"minw":3.3}],
  mixed_barrier_plaza: [{"cov":0.044,"con":1,"minw":2.6},{"cov":0.042,"con":1,"minw":2.3},{"cov":0.041,"con":1,"minw":2.7},{"cov":0.040,"con":1,"minw":2.0},{"cov":0.040,"con":1,"minw":2.2}],
  village_center: [{"cov":0.069,"con":1,"minw":2.0},{"cov":0.068,"con":1,"minw":1.6},{"cov":0.065,"con":1,"minw":2.0},{"cov":0.064,"con":1,"minw":1.7},{"cov":0.064,"con":1,"minw":1.4}],
  woodland_line: [{"cov":0.043,"con":1,"minw":3.6},{"cov":0.042,"con":1,"minw":4.5},{"cov":0.044,"con":1,"minw":5.4},{"cov":0.043,"con":1,"minw":3.9},{"cov":0.043,"con":1,"minw":5.0}],
};
const TOL = { cov: 0.02, con: 0.05, minw: 0.5 };

const opts2 = { step: 40, margin: 40, losSamples: 40, hasLineOfSight: coverMod.hasLineOfSight };

// 校准度量坐标系说明（重要）：
//   generateNode(d, {centerX:600, centerY:350}) 输出 covers 以 (600,350) 为世界中心、
//   尺寸 w×h（节点坐标覆盖 [600-w/2, 600+w/2]×[350-h/2, 350+h/2]）。
//   玩家出生点 = 世界左缘 10% 与垂直中点 —— 绝对（生成）坐标：
//     spawn = (600 - w/2 + 0.10*w, 350) = (600 - 0.4*w, 350)
//   （nodeLayoutMetrics 默认 startPoint=(0.1w, h/2) 是 [0,w] 原点假设，与
//   centerX=600 的 covers 错位 —— 必须显式传入真实出生绝对坐标。）
function spawnPoint(raw) {
  return { x: 600 - raw.w * 0.4, y: 350 };
}

const templates = nodegen.getTemplates().filter(t => BASE[t.id]);
for (const t of templates) {
  const grp = OPEN.has(t.id) ? 'OPEN' : (DENSE.has(t.id) ? 'DENSE' : 'OPEN');
  const covSeries = [];
  for (let di = 0; di < DIFFS.length; di++) {
    const d = DIFFS[di];
    let cov = 0, con = 0, minw = 0, n = 0;
    for (const s of SEEDS) {
      const a = nodegen.generateNode(d, { seed: s, templateId: t.id, scale: 3, centerX: 600, centerY: 350 });
      const m = nodegen.nodeLayoutMetrics(a, Object.assign({ startPoint: spawnPoint(a) }, opts2));
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
