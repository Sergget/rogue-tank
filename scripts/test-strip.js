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
global.getTemplates = NG.getTemplates;   // #T5：makeNode 的 Boss 长宽比修正需遍历模板集
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
// 38px 通道连通性：阻挡掩体按车体半宽 19px 膨胀（w/h 各 +38）后跑连通性。
// #T1（2026-10-16 修复）：原用 step=30 + 4 连通，在 99 号 seed 上稳定得到 0.9987 而失败——
//   经排查这是**采样网格伪影**而非真实可达性缺陷：膨胀后的窄通道恰为 1 格宽时，
//   4 连通网格会在对角转角处把通道切断（step=30 ⇒ 0.99866；step=20/15/10 ⇒ 0.99906+；
//   step=30 改 8 连通 ⇒ 0.99890）。真实地形连续，通道本身是通的。
//   改为 step=20：既避开粗网格切角，又保持与原口径同一量级（≈1.2 万格点，耗时可控）。
function passage38Connectivity(s) {
  const inflated = s.covers.map(c => {
    const tg = tierGroup(c.tier);
    if (tg === 'ground' || tg === 'liquid') return c;
    return Object.assign({}, c, { w: (c.w || 0) + 38, h: (c.h || 0) + 38 });
  });
  const m = NG.nodeLayoutMetrics({ covers: inflated, w: s.w, h: s.h },
    { step: 20, margin: 40, losSamples: 0, hasLineOfSight: coverMod.hasLineOfSight });
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
  // 2026-10-16：#1 道路改为连续多边形后，单 cover 可能横跨整条 strip，
  // 中心点判交失效。改判多边形 bbox 是否与接缝区相交。
  // #T6（2026-10-16 修复）：原实现只判「是否有顶点落在 ±200 窗口内」——长多边形跨缝
  // 但顶点恰好都在窗外时漏判；且 roadMinMaxX 曾按 c.x + v 之外的帧计算（与 #T3 同源）。
  // 现改为统一还原世界 bbox：verts 为局部坐标 → 加 c.x/c.y，再与窗口做区间相交判定。
  const roadWorldBBoxX = (c) => {
    if (c.verts && c.verts.length >= 3) {
      const a = c.angle || 0, ca = Math.cos(a), sa = Math.sin(a);
      let mn = Infinity, mx = -Infinity;
      for (const v of c.verts) {
        const wx = c.x + v[0] * ca - v[1] * sa;
        if (wx < mn) mn = wx; if (wx > mx) mx = wx;
      }
      return [mn, mx];
    }
    const hw = (c.w || 0) / 2;
    return [c.x - hw, c.x + hw];
  };
  const roadIntersectsX = (c, x0, x1) => {
    const [mn, mx] = roadWorldBBoxX(c);
    return mx >= x0 && mn <= x1;   // 区间相交（不要求顶点落窗）
  };
  const roadMinMaxX = roadWorldBBoxX;
  for (const seed of [42, 7, 99]) {
    const s = NG.generateStrip(0.5, stripOpts(seed));
    for (let i = 1; i < s.chunks.length; i++) {
      const bx = s.chunks[i].x0;
      const near = s.covers.filter(c => c.tier === 'road' && roadIntersectsX(c, bx - 200, bx + 200));
      if (near.length === 0) integOk = false;
    }
    const roads = s.covers.filter(c => c.tier === 'road');
    let minX = Infinity, maxX = -Infinity;
    for (const r of roads) {
      const [mn, mx] = roadMinMaxX(r);
      if (mn < minX) minX = mn; if (mx > maxX) maxX = mx;
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
    // 接缝处不断：仅对「横贯河形」强制（#U45 2026-10-19 修正判定盲区）。
    // 旧实现用「cover 中心距接缝 <800px」近似横跨判定——纵贯（V）河链恰好从接缝旁
    // 800px 内经过时被误判为「应跨接缝」→ 300px 窗内无水系误报（上行注释早已声明
    // 「纵贯河形不强制」，实现未兑现；#U45 路网 rng 重掷后 seed42 河形 H→V 首次踩中）。
    // 现按 groupId 聚类：链 x 跨度 > y 跨度 = 横贯链，且链 bbox 实际覆盖接缝 x 时
    // 才要求接缝 300px 内有水系；纵贯链跳过。strip 河流为整链一次生成，接缝结构上
    // 不可能断链；本检查只兜底横贯河的水平断口。
    const ww = s.covers.filter(c => c.tier === 'river' || c.tier === 'water' || c.tier === 'bridge');
    const chains = {};
    for (const c of ww) (chains[c.groupId || 'x'] ||= []).push(c);
    for (let i = 1; i < s.chunks.length; i++) {
      const bx = s.chunks[i].x0;
      for (const arr of Object.values(chains)) {
        const xs = arr.map(c => c.x), ys = arr.map(c => c.y);
        if (Math.max(...xs) - Math.min(...xs) <= Math.max(...ys) - Math.min(...ys)) continue; // 纵贯链不强制
        const mnX = Math.min(...arr.map(c => c.x - (c.w || 0) / 2));
        const mxX = Math.max(...arr.map(c => c.x + (c.w || 0) / 2));
        if (!(mxX >= bx && mnX <= bx)) continue;              // 该链不跨此接缝
        if (!arr.some(c => Math.abs(c.x - bx) < 300)) riverOk = false;
      }
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
// #U34（2026-10-18）：step 60→20——河宽沿程变化后，粗网格（60px）在窄通道内的 4 连通
//   切角会误报（seed99 实测 step60=0.9987 / step20=0.9999）。这是 #T1 已确立的同一类
//   采样网格伪影（真实地形连续，通道本身是通的），但 check 侧沿用了 step=60。
{
  let minC = 1;
  for (const seed of [42, 7, 99]) {
    const s = NG.generateStrip(0.5, stripOpts(seed));
    const m = NG.nodeLayoutMetrics({ covers: s.covers, w: s.w, h: s.h },
      { step: 20, margin: 40, losSamples: 0, hasLineOfSight: coverMod.hasLineOfSight });
    if (m.connectivityRatio < minC) minC = m.connectivityRatio;
  }
  ok(minC >= 0.999, `连通性 ≥0.999（3 seed 最小 ${minC.toFixed(4)}，step=20）`);
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
// 12) #U35（2026-10-18）chunkRows 零回归：chunkRows 缺省（1）= 显式传 1，逐字段一致
{
  const a = NG.generateStrip(0.5, stripOpts(42));
  const b = NG.generateStrip(0.5, stripOpts(42, { chunkRows: 1 }));
  ok(JSON.stringify(a.covers) === JSON.stringify(b.covers),
     'chunkRows 缺省 = 显式传 1（covers 逐字节一致，零回归）');
  ok(a.h === b.h && a.w === b.w && a.chunkCount === b.chunkCount,
     `chunkRows 缺省 = 1 时尺寸/片数一致（${Math.round(a.w)}×${Math.round(a.h)} / ${a.chunkCount} 片）`);
  ok(a.chunkRows === 1 && a.rowHeights.length === 1, 'chunkRows 元数据 = 1 行（缺省路径）');
  const cfgRows = (RULES_MOD.RULES.nodeMap.strip.chunkRows !== undefined)
    ? RULES_MOD.RULES.nodeMap.strip.chunkRows : 1;
  ok(cfgRows === 1, `RULES.nodeMap.strip.chunkRows 缺省 = 1（实测 ${cfgRows}）`);
}
// 13) #U35 多行片（chunkRows=2）：片数翻倍 / 片 y0 分两行 / 行间接缝净空生效
{
  const one = NG.generateStrip(0.5, stripOpts(42, { chunkRows: 1, chunkCount: 3 }));
  const two = NG.generateStrip(0.5, stripOpts(42, { chunkRows: 2, chunkCount: 3 }));
  ok(two.chunkCount === 6, `chunkRows=2 片数翻倍（${one.chunkCount} → ${two.chunkCount}）`);
  const rows0 = new Set(one.chunks.map(c => c.row));
  const rows2 = new Set(two.chunks.map(c => c.row));
  ok(rows0.size === 1 && rows2.size === 2, `片 row 元数据：1 行 → 2 行（${rows0.size}/${rows2.size}）`);
  const y0s = [...new Set(two.chunks.map(c => c.y0))].sort((a, b) => a - b);
  ok(y0s.length === 2 && y0s[0] === 0 && y0s[1] > 1000,
     `chunkRows=2 片 y0 分两行（${y0s.map(v => Math.round(v)).join(',')}）`);
  ok(two.chunks.every(c => c.col >= 0 && c.col < 3 && c.row >= 0 && c.row < 2), '片 col/row 元数据完备');
  // 纵向不再裁剪：世界高 = 行高之和，且 > 单行 2.2 屏
  const sumRow = two.rowHeights.reduce((a, b) => a + b, 0);
  ok(Math.abs(two.h - sumRow) < 1e-6, `strip 高 = 各行高之和（${Math.round(two.h)} = ${two.rowHeights.map(h => Math.round(h)).join('+')}）`);
  ok(two.h > one.h * 1.5, `chunkRows=2 世界高显著大于单行（${Math.round(one.h)} → ${Math.round(two.h)}）`);
  // 行间接缝：**跨行界**的 structure/foliage 必须为 0（用户 review 定稿口径）——
  // 只处理「AABB 真正跨过行边界」的元素（两行边缘物件对撞），完全落在某一行内部的元素不动。
  // 这样既有净空语义，又不会把行间劈出 600px（旧 ±300 整带删除）/220px（第二版 ±110 推出）空白带。
  const seamY = two.rowHeights.slice(0, -1).reduce((acc, h, i) => {
    acc.push(acc[i] + h); return acc;
  }, [0]).slice(1);
  let viol = 0;
  for (const c of two.covers) {
    const tg = tierGroup(c.tier);
    if (tg !== 'structure' && tg !== 'foliage') continue;
    if (c.tier === 'bridge') continue;
    // 世界 AABB 的 y 半幅（verts/OBB 通用，用旋转包络近似即可：只判跨不跨边界）
    const ca = c.angle || 0;
    const hw = (c.w || 0) / 2, hh = (c.h || 0) / 2;
    const extY = Math.abs(Math.sin(ca)) * hw + Math.abs(Math.cos(ca)) * hh;
    for (const by of seamY) if (c.y - extY < by && c.y + extY > by) { viol++; break; }
  }
  ok(viol === 0, `行间接缝净空生效（行边界 ${seamY.map(v => Math.round(v)).join(',')} 上跨界的 structure/foliage ${viol} 个）`);
  // 逐 400px 带检查：多行片每个带都要有非 road 元素（防止把行间劈成空白带）
  const band400 = [];
  const nB = Math.ceil(two.h / 400);
  for (let i = 0; i < nB; i++) {
    const lo = i * 400, hi = Math.min(two.h, lo + 400);
    band400.push(two.covers.filter(c => c.tier !== 'road' && c.y >= lo && c.y < hi).length);
  }
  ok(band400.every(n => n > 0), `chunkRows=2 无 400px 空白带（各带元素数 ${band400.join(' ')}）`);
  // 每行 y 带内都有横向路面（400px 采样）
  let rowRoadOk = true;
  for (let r = 0; r < two.rowHeights.length; r++) {
    const rowChunk = two.chunks.find(c => c.row === r);
    const yc = rowChunk.y0 + two.rowHeights[r] / 2;
    let covered = 0;
    for (let x = 200; x <= two.w - 200; x += 400) {
      if (two.covers.some(c => c.tier === 'road' &&
        Math.abs(c.y - yc) < (c.h || 0) / 2 + 40 &&
        Math.abs(c.x - x) < (c.w || 0) / 2)) covered++;
    }
    if (covered === 0) rowRoadOk = false;
  }
  ok(rowRoadOk, 'chunkRows=2：每行 y 带内都有横向路面（strip-row-trunk 补偿生效）');
  // 压路：多行片同样零压路
  const roadPolys = two.covers.filter(c => c.tier === 'road').map(c => {
    if (c.verts) {
      const a = c.angle || 0, ca = Math.cos(a), sa = Math.sin(a);
      return c.verts.map(v => ({ x: c.x + v[0] * ca - v[1] * sa, y: c.y + v[0] * sa + v[1] * ca }));
    }
    const hw = (c.w || 0) / 2, hh = (c.h || 0) / 2, a = c.angle || 0;
    const ca = Math.cos(a), sa = Math.sin(a);
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
      .map(([x, y]) => ({ x: c.x + x * ca - y * sa, y: c.y + x * sa + y * ca }));
  });
  const inPoly = (p, P) => {
    let ins = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if (((P[i].y > p.y) !== (P[j].y > p.y)) &&
          (p.x < (P[j].x - P[i].x) * (p.y - P[i].y) / (P[j].y - P[i].y) + P[i].x)) ins = !ins;
    }
    return ins;
  };
  const segX = (a1, a2, b1, b2) => {
    const d1 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x);
    const d2 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x);
    const d3 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
    const d4 = (b2.x - b1.x) * (a2.y - b1.y) - (b2.y - b1.y) * (a2.x - b1.x);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  };
  const inter = (A, B) => {
    for (const p of A) if (inPoly(p, B)) return true;
    for (const p of B) if (inPoly(p, A)) return true;
    for (let i = 0; i < A.length; i++) {
      const a1 = A[i], a2 = A[(i + 1) % A.length];
      for (let j = 0; j < B.length; j++) if (segX(a1, a2, B[j], B[(j + 1) % B.length])) return true;
    }
    return false;
  };
  let onRoad = 0;
  for (const c of two.covers) {
    if (c.tier === 'road') continue;
    const tg = tierGroup(c.tier);
    if (tg !== 'structure' && tg !== 'foliage') continue;
    const P = c.verts
      ? (() => { const a = c.angle || 0, ca = Math.cos(a), sa = Math.sin(a); return c.verts.map(v => ({ x: c.x + v[0] * ca - v[1] * sa, y: c.y + v[0] * sa + v[1] * ca })); })()
      : (() => { const hw = (c.w || 0) / 2, hh = (c.h || 0) / 2, a = c.angle || 0, ca = Math.cos(a), sa = Math.sin(a); return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: c.x + x * ca - y * sa, y: c.y + x * sa + y * ca })); })();
    for (const R of roadPolys) if (inter(P, R)) { onRoad++; break; }
  }
  ok(onRoad === 0, `chunkRows=2 无压路 structure/foliage（${onRoad} 个）`);
}

if (fails) { console.error(`\n${fails} 项失败`); process.exit(1); }
console.log('\n全部通过');
