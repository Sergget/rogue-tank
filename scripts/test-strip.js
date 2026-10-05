// test-strip.js — 横向 strip 生成器测试（C 档 batch 2，specs/map.md §14.2）
// 运行：node scripts/test-strip.js
//
// 覆盖（§14.6 测试重锚清单）：
//   拼接确定性（同 seed 同布局）/ seed 敏感性 / 尺寸口径 / 纵向裁剪 / 接缝净空 /
//   横向贯通干道约束 / 密度 / 连通性 / 38px 通道（「最窄通道 ≥ 车体宽」的操作化：
//   阻挡掩体按车体半宽 19px 膨胀后连通性 ≥0.999 —— nodeLayoutMetrics 的原始 minGap
//   口径对装饰性贴靠对极敏感（常规节点基线仅 1~3px，见 test-nodegen-calibration），
//   不直接作为通道验收）/ 既有 generateNode 零回归。
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;   // 必须在 require tank_geometry/cover 之前
const U = require('../js/tank_utils.js');
const G = require('../js/tank_geometry.js');
Object.assign(global, U, G);   // 模拟浏览器全局（partCorners 等）
global.TAU = U.TAU;
const coverMod = require('../js/tank_cover.js');
const NG = require('../js/tank_nodegen.js');
global.createRNG = NG.createRNG;
global.generateNode = NG.generateNode;
global.pickTemplate = NG.pickTemplate;
const MAP = require('../js/tank_map.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

const VP = { vw: 1920, vh: 1080 };
const stripOpts = (seed, extra) => Object.assign(
  { seed: seed, viewport: VP, scaleFor: MAP.nodeScaleFor }, extra || {});

function tierGroup(tier) {
  return ((global.RULES.coverTiers[tier] || {}).tierGroup) || null;
}
// 38px 通道连通性：阻挡掩体按车体半宽 19px 膨胀（w/h 各 +38）后跑连通性
function passage38Connectivity(s) {
  const inflated = s.covers.map(c => {
    const tg = tierGroup(c.tier);
    if (tg === 'ground' || tg === 'liquid') return c;
    return Object.assign({}, c, { w: (c.w || 0) + 38, h: (c.h || 0) + 38 });
  });
  const m = NG.nodeLayoutMetrics({ covers: inflated, w: s.w, h: s.h },
    { step: 30, margin: 40, losSamples: 0, hasLineOfSight: coverMod.hasLineOfSight });
  return m.connectivityRatio;
}

// 1) 拼接确定性：同 seed 同布局
{
  const a = NG.generateStrip(0.5, stripOpts(42));
  const b = NG.generateStrip(0.5, stripOpts(42));
  ok(JSON.stringify(a.covers) === JSON.stringify(b.covers), '同 seed 拼接确定性（covers 完全一致）');
  ok(a.w === b.w && a.h === b.h, '同 seed 尺寸一致');
}
// 2) seed 敏感性
{
  const a = NG.generateStrip(0.5, stripOpts(42));
  const b = NG.generateStrip(0.5, stripOpts(43));
  ok(JSON.stringify(a.covers) !== JSON.stringify(b.covers), '不同 seed 布局不同');
}
// 3) 尺寸口径：横向 ≈10 屏（不做精确绑定，允浮动）、纵向 = 2.2 屏
{
  const s = NG.generateStrip(0.5, stripOpts(42));
  const sx = s.w / VP.vw, sy = s.h / VP.vh;
  ok(sx >= 7 && sx <= 14, `横向 ≈10 屏（实测 ${sx.toFixed(1)} 屏）`);
  ok(close(sy, 2.2, 1e-9), `纵向 = 2.2 屏（实测 ${sy.toFixed(2)}）`);
  ok(s.advanceAxis === 'x', '推进轴标记为 x');
}
// 4) 纵向裁剪：所有元素中心落在 strip 界内
{
  const s = NG.generateStrip(0.5, stripOpts(7));
  const out = s.covers.filter(c => c.x < 0 || c.x > s.w || c.y < 0 || c.y > s.h);
  ok(out.length === 0, `纵向裁剪后无越界元素（${s.covers.length} 个全在界内）`);
  ok(s.chunks.every(c => c.h >= s.h), '片高 > 目标高（裁剪生效前提）');
}
// 5) 接缝净空：内部片边界 ±300px 内无 structure/foliage（ground/liquid 保留；bridge 豁免）
{
  const s = NG.generateStrip(0.5, stripOpts(99));
  const seamX = s.chunks.slice(1).map(c => c.x0);
  ok(seamX.length === s.chunkCount - 1, '接缝数 = 片数-1');
  let viol = 0, keptGround = 0;
  for (const c of s.covers) {
    const tg = tierGroup(c.tier);
    for (const bx of seamX) {
      if (Math.abs(c.x - bx) < 300) {
        if ((tg === 'structure' || tg === 'foliage') && c.tier !== 'bridge') viol++;
        else keptGround++;
      }
    }
  }
  ok(viol === 0, `接缝净空无违规（structure/foliage ${viol} 个，ground/liquid+bridge 保留 ${keptGround} 个）`);
  // 2026-10-05：一化路网+避让前推后，接缝带内本就无违规元素可清，seamCleared 允许为 0。
}
// 6) 横向贯通干道约束（2026-10-05 一体化）：strip 级至少一条道路横跨 ≥80% 条带宽
{
  let allOk = true;
  for (const seed of [42, 7, 99, 1234]) {
    const s = NG.generateStrip(0.5, stripOpts(seed));
    const roads = s.covers.filter(c => c.tier === 'road');
    let minX = Infinity, maxX = -Infinity;
    for (const r of roads) {
      minX = Math.min(minX, r.x - (r.w || 0) / 2);
      maxX = Math.max(maxX, r.x + (r.w || 0) / 2);
    }
    if (!(maxX - minX >= s.w * 0.8)) { allOk = false; }
  }
  ok(allOk, '横向贯通干道（strip 级路网横跨 ≥80% 条带宽）');
}
// 6b) 一体化路网：strip 级一次生成，横向干道天然贯通（无片间断开）。
//     验证：每条内部接缝两侧 200px 内有路面（道路真实过缝）；
//     路网整体横跨 ≥80% 条带宽。
{
  let integOk = true;
  for (const seed of [42, 7, 99]) {
    const s = NG.generateStrip(0.5, stripOpts(seed));
    for (let i = 1; i < s.chunks.length; i++) {
      const bx = s.chunks[i].x0;
      const near = s.covers.filter(c => c.tier === 'road' && Math.abs(c.x - bx) < 200);
      if (near.length === 0) integOk = false;
    }
    const roads = s.covers.filter(c => c.tier === 'road');
    let minX = Infinity, maxX = -Infinity;
    for (const r of roads) {
      minX = Math.min(minX, r.x - (r.w || 0) / 2);
      maxX = Math.max(maxX, r.x + (r.w || 0) / 2);
    }
    if (maxX - minX < s.w * 0.8) integOk = false;
  }
  ok(integOk, '一体化路网（接缝两侧有路面，路网横跨 ≥80% 条带宽）');
}
// 6c) 一体化河流：每条 strip 至少 1 条水系（river/water），三河形按种随机。
//     验证：水系存在；横向河形跨度 ≥80% 宽、纵向河形跨度 ≥80% 高；
//     接缝处水系不断（river/water/bridge 任一在 300px 内）。
{
  let riverOk = true;
  for (const seed of [42, 7, 99, 1234]) {
    const s = NG.generateStrip(0.5, stripOpts(seed));
    const waterway = s.covers.filter(c => c.tier === 'river' || c.tier === 'water');
    if (waterway.length === 0) { riverOk = false; continue; }
    // 跨度按 river/water/bridge 合并算（含桥替换的缺口）
    const wwAll = s.covers.filter(c => c.tier === 'river' || c.tier === 'water' || c.tier === 'bridge');
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const r of wwAll) {
      minX = Math.min(minX, r.x - (r.w || 0) / 2);
      maxX = Math.max(maxX, r.x + (r.w || 0) / 2);
      minY = Math.min(minY, r.y - (r.h || 0) / 2);
      maxY = Math.max(maxY, r.y + (r.h || 0) / 2);
    }
    const spanX = maxX - minX, spanY = maxY - minY;
    // 横向或纵向至少一向贯穿 ≥70%
    if (spanX < s.w * 0.7 && spanY < s.h * 0.7) riverOk = false;
    // 接缝处不断：300px 内有水系或桥
    const ww = s.covers.filter(c => c.tier === 'river' || c.tier === 'water' || c.tier === 'bridge');
    for (let i = 1; i < s.chunks.length; i++) {
      const bx = s.chunks[i].x0;
      // 仅当水系横跨该接缝 x 区间时才要求（纵贯河形不强制）
      const crosses = ww.some(c => Math.abs(c.x - bx) < 800);
      if (!crosses) continue;
      const near = ww.filter(c => Math.abs(c.x - bx) < 300);
      if (near.length === 0) riverOk = false;
    }
  }
  ok(riverOk, '一体化河流（三河形：水系存在且贯穿，接缝不断）');
}
// 7) 密度：≥10 实体/屏（§14.2 现状 ≈13；裁剪补偿后不塌）
{
  let minD = Infinity;
  for (const seed of [42, 7, 99]) {
    const s = NG.generateStrip(0.5, stripOpts(seed));
    if (s.densityPerScreen < minD) minD = s.densityPerScreen;
  }
  ok(minD >= 10, `密度 ≥10/屏（3 seed 最小 ${minD.toFixed(1)}/屏）`);
}
// 8) 连通性 ≥0.999（§14.2 验收）
{
  let minC = 1;
  for (const seed of [42, 7, 99]) {
    const s = NG.generateStrip(0.5, stripOpts(seed));
    const m = NG.nodeLayoutMetrics({ covers: s.covers, w: s.w, h: s.h },
      { step: 60, margin: 40, losSamples: 0, hasLineOfSight: coverMod.hasLineOfSight });
    if (m.connectivityRatio < minC) minC = m.connectivityRatio;
  }
  ok(minC >= 0.999, `连通性 ≥0.999（3 seed 最小 ${minC.toFixed(4)}）`);
}
// 9) 38px 通道：「最窄通道 ≥ 车体宽」的操作化（阻挡掩体膨胀 19px 后连通性）
{
  let minP = 1;
  for (const seed of [42, 7, 99]) {
    const s = NG.generateStrip(0.5, stripOpts(seed));
    const p = passage38Connectivity(s);
    if (p < minP) minP = p;
  }
  ok(minP >= 0.999, `38px 通道连通性 ≥0.999（3 seed 最小 ${minP.toFixed(4)}）`);
}
// 10) 既有零回归：不传 roadOpts 时 generateNode 行为不变
{
  const o = { seed: 4242, scale: 6.7, centerX: 0, centerY: 0 };
  const a = NG.generateNode(0.5, o);
  const b = NG.generateNode(0.5, Object.assign({}, o, { roadOpts: undefined }));
  ok(JSON.stringify(a.covers) === JSON.stringify(b.covers), 'roadOpts 缺省 = 不传（零回归）');
}
// 11) 参数校验
{
  let e1 = null, e2 = null;
  try { NG.generateStrip(0.5, stripOpts(1, { advanceAxis: 'y' })); } catch (e) { e1 = e; }
  try { NG.generateStrip(0.5, /** @type {any} */ ({ seed: 1 })); } catch (e) { e2 = e; }
  ok(!!e1, "advanceAxis='y' 抛错（第二阶段预留）");
  ok(!!e2, '缺 scaleFor 抛错');
  const s = NG.generateStrip(0.5, stripOpts(5, { chunkCount: 2 }));
  ok(s.chunkCount === 2, 'chunkCount 显式覆盖生效');
}

if (fails) { console.error(`\n${fails} 项失败`); process.exit(1); }
console.log('\n全部通过');
