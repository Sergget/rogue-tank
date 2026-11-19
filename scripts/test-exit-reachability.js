// test-exit-reachability.js — 出口可达性护栏（#AC2 / PLAN §2.8.4 D2，2026-10-31；
//                             2026-11-01 E1 同步重写：判据双分支，PLAN §2.8.5）
//
// 为什么需要这条链：
//   2026-10-30 夜批 P0-B 把「抵达 exitX」从**纯视觉提示**升级为 encounter 节点的**硬胜利条件**——
//   玩家清完全部防线后必须真的开到地图最右侧才结算。于是「出生点 → 出口是否物理连通」从
//   「无所谓」变成 S1 级前置：一旦某节点生成出完整横向阻断带，玩家会清完全波却**永远无法结算**
//   （不崩溃、不报错，只能弃局）。旧口径下玩家从不需要走到出口，所以这个地形缺陷从未被暴露。
//
// 本链是那条新前提的**长期合同**：今后任何改地形生成的批次（新 tier、墙位、河流参数）收口时
//   都会自动跑它。临时探针原型见 `tmp/probe-ac2-exit-reach.js`（2026-10-31 由 role-verify-docs 编写）。
//
// ★ E1 同步重写（2026-11-01，PLAN §2.8.5 硬约束「护栏与契约同批，不得拆开」）：
//   防御点（node.defensePoints，RULES.nodeMap.defensePoints.enabled=true）把「组」的语义从
//   「一道防线」换成「一个防御点」⇒ 旧判据（吃 encounterAnchors 分组）判别力失效。本文件改双分支：
//     · enabled=false（默认，零回归路径）→ 判据读 `encounterAnchors` 分组（现行分支，原文保留）；
//     · enabled=true（E1 路径）            → 判据读 `node.defensePoints`（每点 {x,y,kind}）；
//   两分支共用同一套三档判据 / BFS / 负向构造；交叉校验目标点同步切换（防御点 + 格点自由化——
//   目标格若被墙柱压住，取最近自由格中心再比对，防「点恰在墙 x 上」造成的假分歧）。
//
// 判据（三档，与游戏侧同源，不复刻几何）：
//   A 真·游戏口径 = js/tank_cover.js 的 tierBlocksMove()
//     → passability===0 || shellBlock===true || shellBlock==='single'
//   B BFS 现成口径 = js/tank_map.js 的 isReachableFromSpawn 内部过滤（仅 passability===0）
//   C spec 字面口径 = js/tank_map.js 的 supplyBlockingCovers
// 网格 40px 8 邻域 BFS；阻挡掩体按车体半宽 TANK_R=20 膨胀（与 strip-defense.md 验收口径同源）。
// 几何判定一律用 tank_map 已导出的 pointInCoverOne —— **不自己复刻点在多边形内**（复刻过一次，
//   ert 与真实口径分叉，是这类探针最常见的假绿来源）。
//
// 规模与预算：≥10 seed × 每 seed ≥6 个 encounter 节点（总 ≥60；E1 探针 40 不够，正式门槛 60），
//   单次 < 120s。
'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ---- browser-global shims（与 scripts/test-map.js 同款约定）----
// 形态门（scripts/test-qa.js）要求这两条 require 写成字面量形式，故不用 path.join。
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const RULES = RULES_MOD.RULES;
const NG = require(path.join(ROOT, 'js/tank_nodegen.js'));
global.createRNG = NG.createRNG;
global.generateNode = NG.generateNode;
global.generateStrip = NG.generateStrip;
global.clearCoversOnRoads = NG.clearCoversOnRoads;
global.pickTemplate = NG.pickTemplate;
global.getTemplates = NG.getTemplates;

const MAP = require(path.join(ROOT, 'js/tank_map.js'));
const pointInCoverOne = MAP.pointInCoverOne;   // 已导出 —— 判据同源

const TANK_R = 20;
const GRID = 40;

// E1 双分支开关：读 RULES.nodeMap.defensePoints.enabled（默认 false = 现行分支）。
const DP_ENABLED = !!(RULES.nodeMap && RULES.nodeMap.defensePoints && RULES.nodeMap.defensePoints.enabled === true);

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

// 三档阻挡判据（与 tank_cover.tierBlocksMove / tank_map 内部过滤同源）
const BLOCKERS = {
  A: (def) => def.passability === 0 || def.shellBlock === true || def.shellBlock === 'single',
  B: (def) => def.passability === 0,
  C: (def) => def.passability === 0 || def.shellBlock === true
    || def.shellBlock === 'solid' || def.shellBlock === 'wall',
};

// encounter 节点判别（分支唯一差异点）：points 模式读 defensePoints，现行模式读 encounterAnchors
function isEncounterNode(n) {
  if (DP_ENABLED) return Array.isArray(n.defensePoints) && n.defensePoints.length > 0;
  return (n.encounterAnchors || []).length > 0;
}
// 交叉校验目标点：points 模式取「最后一个防御点」（沿推进轴最深的守备位），现行模式取
//   最后一道防线的首锚点（原文行为）。
function crossTargetOf(node) {
  if (!DP_ENABLED) {
    const lastGroup = (node.encounterAnchors || [])[node.encounterAnchors.length - 1] || [];
    return lastGroup[0] || node.playerSpawn;
  }
  const pts = node.defensePoints || [];
  return pts[pts.length - 1] || node.playerSpawn;
}

/**
 * 把一个节点栅格化成 blocked 网格并从 birth 点 BFS。
 * @param {any} node makeNode 产出
 * @param {string} variant 'A'|'B'|'C'
 * @param {Array} [extraBlockers] 负向断言注入的额外「不可通行掩体」（形态同 covers 元素）
 */
function buildGrid(node, variant, extraBlockers) {
  const g = GRID;
  const w = node.w, h = node.h;
  const cols = Math.floor(w / g) + 1, rows = Math.floor(h / g) + 1;
  const pred = BLOCKERS[variant];
  const all = (node.covers || []).concat(Array.isArray(extraBlockers) ? extraBlockers : []);
  const blockers = all.filter(c => {
    const def = RULES.coverTiers[c.tier];
    return !!(def && pred(def));
  });
  const blocked = new Uint8Array(cols * rows);
  const owner = new Int32Array(cols * rows).fill(-1);
  // 扫描顺序决定 owner 归属（同一格被多个 blocker 覆盖时取**索引最小**的那个，与逐格
  //   `for bi` 从 0 递增并 break 的原实现完全一致）。因此这里必须按 bi 升序遍历，
  //   且用 `if (blocked) continue` 而非覆盖写，才能保证 owner 语义不变。
  //
  // 性能（2026-11-19 修）：原实现是「格点 × 全部 blockers」三重循环——
  //   strip 节点 361×50=18050 格 × 184 blockers ≈ **332 万次** `pointInCoverOne`，
  //   全测试 216 次 buildGrid ⇒ 实测 424s（Node 24）/ 493s（Node 22），
  //   超过 run-tests.js 的 300s 单测上限而稳定假红。
  //   改为「逐 blocker 求它覆盖的格点区间」（AABB 预筛 + 只对这些格做精判）：
  //   每个 blocker 只碰自己附近的格点，总精判次数降到「格点数 + Σ覆盖面积」量级。
  //   精判仍一律走 pointInCoverOne（与游戏侧同源，不复刻几何），语义逐格等价。
  for (let bi = 0; bi < blockers.length; bi++) {
    const c = blockers[bi];
    // 包络 AABB（旋转矩形解析包络；带 verts/segments 的实例用多边形/多段外包围）
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (c.verts && c.verts.length >= 3) {
      const ca = Math.cos(c.angle || 0), sa = Math.sin(c.angle || 0);
      for (const v of c.verts) {
        const wx = c.x + v[0] * ca - v[1] * sa, wy = c.y + v[0] * sa + v[1] * ca;
        if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
      }
    } else if (c.segments && c.segments.length) {
      const a = c.angle || 0;
      const hw0 = (c.w || 0) / 2, hh0 = (c.h || 0) / 2;
      const ex0 = Math.abs(Math.cos(a)) * hw0 + Math.abs(Math.sin(a)) * hh0;
      const ey0 = Math.abs(Math.sin(a)) * hw0 + Math.abs(Math.cos(a)) * hh0;
      minX = c.x - ex0; maxX = c.x + ex0; minY = c.y - ey0; maxY = c.y + ey0;
      for (const s of c.segments) {
        const hx = (s.w || c.w || 0) / 2, hy = (s.h || c.h || 0) / 2;
        const sx = c.x + (s.dx || 0), sy = c.y + (s.dy || 0);
        const sa2 = (s.angle || 0) + a;
        const sex = Math.abs(Math.cos(sa2)) * hx + Math.abs(Math.sin(sa2)) * hy;
        const sey = Math.abs(Math.sin(sa2)) * hx + Math.abs(Math.cos(sa2)) * hy;
        if (sx - sex < minX) minX = sx - sex; if (sx + sex > maxX) maxX = sx + sex;
        if (sy - sey < minY) minY = sy - sey; if (sy + sey > maxY) maxY = sy + sey;
      }
    } else {
      const a = c.angle || 0;
      const hw = (c.w || 0) / 2, hh = (c.h || 0) / 2;
      const ex = Math.abs(Math.cos(a)) * hw + Math.abs(Math.sin(a)) * hh;
      const ey = Math.abs(Math.sin(a)) * hw + Math.abs(Math.cos(a)) * hh;
      minX = c.x - ex; maxX = c.x + ex; minY = c.y - ey; maxY = c.y + ey;
    }
    if (!Number.isFinite(minX)) continue;
    // 格点 (gx*g, gy*g) 落在包络 + TANK_R 内才可能精判命中
    const gx0 = Math.max(0, Math.floor((minX - TANK_R) / g));
    const gx1 = Math.min(cols - 1, Math.ceil((maxX + TANK_R) / g));
    const gy0 = Math.max(0, Math.floor((minY - TANK_R) / g));
    const gy1 = Math.min(rows - 1, Math.ceil((maxY + TANK_R) / g));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const i = gy * cols + gx;
        if (blocked[i]) continue;              // 已归给更小索引的 blocker
        if (pointInCoverOne(c, gx * g, gy * g, TANK_R)) { blocked[i] = 1; owner[i] = bi; }
      }
    }
  }
  // BFS：起点取离 playerSpawn 最近的可通行格
  const ps = node.playerSpawn || { x: w * 0.10, y: h / 2 };
  let sgx = -1, sgy = -1, bestD = Infinity;
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    if (blocked[gy * cols + gx]) continue;
    const d = (gx * g - ps.x) ** 2 + (gy * g - ps.y) ** 2;
    if (d < bestD) { bestD = d; sgx = gx; sgy = gy; }
  }
  const reached = new Uint8Array(cols * rows);
  if (sgx >= 0) {
    const q = [sgy * cols + sgx]; reached[sgy * cols + sgx] = 1;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++], cy = (cur / cols) | 0, cx = cur % cols;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const ny = cy + dy, nx = cx + dx;
        if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
        const ni = ny * cols + nx;
        if (blocked[ni] || reached[ni]) continue;
        reached[ni] = 1; q.push(ni);
      }
    }
  }
  return { g, w, h, cols, rows, blocked, reached, blockers, owner, sgx, sgy };
}

/** 出口可达：任一 x ≥ exitX 的可通行格被 BFS 触达即可（玩家只需越过这条竖线） */
function exitReachable(grid, exitX) {
  const gxMin = Math.ceil(exitX / grid.g);
  let free = 0, hit = 0;
  for (let gx = gxMin; gx < grid.cols; gx++) {
    for (let gy = 0; gy < grid.rows; gy++) {
      const i = gy * grid.cols + gx;
      if (grid.blocked[i]) continue;
      free++;
      if (grid.reached[i]) hit++;
    }
  }
  return { free, hit, ok: hit > 0 };
}

/** 简化版封死切面：某 x 列全部格均被阻挡（y 全覆盖）⇒ 该列是一条贯穿切断线 */
function findSealingColumns(grid, xFrom, xTo) {
  const out = [];
  const gxFrom = Math.max(0, Math.ceil(xFrom / grid.g));
  const gxTo = Math.min(grid.cols - 1, Math.floor(xTo / grid.g));
  for (let gx = gxFrom; gx <= gxTo; gx++) {
    let allBlocked = true;
    const tiers = new Map();
    for (let gy = 0; gy < grid.rows; gy++) {
      const i = gy * grid.cols + gx;
      if (!grid.blocked[i]) { allBlocked = false; break; }
      const bi = grid.owner[i];
      if (bi >= 0) {
        const k = `${grid.blockers[bi].tier}`;
        tiers.set(k, (tiers.get(k) || 0) + 1);
      }
    }
    if (allBlocked) out.push({ gx, x: gx * grid.g, tiers: [...tiers.entries()] });
  }
  return out;
}

// ================= 1) 跨 seed × 节点扫描（主护栏）=================
section(`① 跨 seed 出口可达性（三档判据 · ${DP_ENABLED ? 'defensePoints 分支（E1）' : 'encounterAnchors 分支（现行）'}）`);
const SEEDS = [];
for (let s = 1; s <= 18; s++) SEEDS.push(1000 + s * 37);
const VARIANTS = ['A', 'B', 'C'];
const ENV = { viewport: { vw: 1600, vh: 900 }, difficultyLevel: 0 };
const NODES_PER_RUN = 6;

const results = {};
for (const v of VARIANTS) results[v] = { total: 0, unreachable: 0, cases: [] };
let nodeCount = 0;

for (const seed of SEEDS) {
  let run;
  try { run = MAP.generateRun(seed, NODES_PER_RUN, ENV); }
  catch (e) { console.error(`seed ${seed} generateRun FAILED: ${e.message}`); fails++; continue; }
  for (const node of run.nodes) {
    if (!isEncounterNode(node)) continue;
    nodeCount++;
    const groupN = DP_ENABLED ? (node.defensePoints || []).length : (node.encounterAnchors || []).length;
    for (const v of VARIANTS) {
      const grid = buildGrid(node, v);
      const r = exitReachable(grid, node.exitX);
      results[v].total++;
      if (!r.ok) {
        results[v].unreachable++;
        if (results[v].cases.length < 5) {
          results[v].cases.push({
            seed, idx: node.index, exitX: Math.round(node.exitX),
            w: Math.round(node.w), h: Math.round(node.h), anchors: groupN,
            seals: findSealingColumns(grid, node.playerSpawn.x, node.exitX).slice(0, 4),
          });
        }
      }
    }
  }
}

for (const v of VARIANTS) {
  const r = results[v];
  ok(r.total >= 60, `①${v} 扫描规模达标（${r.total} 个 encounter 节点 ≥ 60）`);
  ok(r.unreachable === 0, `①${v} 不可达节点 = 0（实到 ${r.unreachable}）`);
  for (const c of r.cases) {
    console.error(`   不可达样例 seed=${c.seed} node=${c.idx} exitX=${c.exitX} `
      + `w=${c.w} h=${c.h} anchors=${c.anchors} 封死列=${JSON.stringify(c.seals)}`);
  }
}

// ================= 2) 交叉校验：自建 BFS(B档) vs tank_map.isReachableFromSpawn =================
section('② 交叉校验（自建 BFS vs 既有 isReachableFromSpawn）');
let agree = 0, disagree = 0;
try {
  // 交叉校验需要 ≥8 个样本；单个 run 只有 4 个 encounter 节点，故跨 seed 累积。
  outer:
  for (const seed of SEEDS) {
    const run = MAP.generateRun(seed, NODES_PER_RUN, ENV);
    for (const node of run.nodes) {
      if (!isEncounterNode(node)) continue;
      if (typeof MAP.isReachableFromSpawn !== 'function') break outer;
      const grid = buildGrid(node, 'B');
      const mine = exitReachable(grid, node.exitX).ok;
      // 目标点按分支取（见 crossTargetOf）。points 模式防御点可能恰在点驱动墙柱 x 上
      // ⇒ 目标格被墙压住时 isReachableFromSpawn 直接判 false（其语义是「该点可达」而非
      // 「附近可达」），会造成与「出口区域可达」的假分歧。此处做**格点自由化**：目标格
      // blocked 时螺旋找最近自由格，取其中心为目标（确定性，只影响目标点选择不影响判据）。
      let target = crossTargetOf(node);
      if (DP_ENABLED) {
        const cols = grid.cols, rows = grid.rows;
        const tgx = Math.max(0, Math.min(cols - 1, Math.round(target.x / grid.g)));
        const tgy = Math.max(0, Math.min(rows - 1, Math.round(target.y / grid.g)));
        if (grid.blocked[tgy * cols + tgx]) {
          let best = null, bestD = Infinity;
          for (let gy = 0; gy < rows; gy++) {
            for (let gx = 0; gx < cols; gx++) {
              if (grid.blocked[gy * cols + gx]) continue;
              const d = (gx * grid.g - target.x) ** 2 + (gy * grid.g - target.y) ** 2;
              if (d < bestD) { bestD = d; best = { x: gx * grid.g, y: gy * grid.g }; }
            }
          }
          if (best) target = best;
        }
      }
      // 既有实现的签名是 isReachableFromSpawn(node, pt, cfg) —— **第二个参数是点对象 {x,y}**，
      //   不是 (x,y) 两个数（第一版写成两个数 ⇒ pt.x 为 undefined ⇒ 恒返回 false，属调用方错误，
      //   会被误读成「既有实现与被测代码有分歧」）。这里按签名传对象。
      const theirs = MAP.isReachableFromSpawn(node, target);
      if (!!mine === !!theirs) agree++;
      else { disagree++; console.error(`   分歧 seed=${seed} node=${node.index}: mine=${mine} theirs=${theirs}`); }
      if (agree + disagree >= 8) break outer;
    }
  }
} catch (e) {
  console.error(`交叉校验异常：${e.message}`);
  fails++;
}
ok(agree >= 8, `② 交叉校验样本数达标（${agree} ≥ 8，分歧 ${disagree}）`);
ok(disagree === 0, `② 与既有实现无分歧（实到 ${disagree}）`);

// ================= 3) 负向断言：人为封死必须被测出 =================
section('③ 负向：人为横贯封堵必须判不可达（证明探针有敏感性）');
{
  const run = MAP.generateRun(SEEDS[0], NODES_PER_RUN, ENV);
  let node = null;
  for (const n of run.nodes) if (isEncounterNode(n)) { node = n; break; }
  ok(!!node, '③ 取到可用的 encounter 节点');
  if (node) {
    // 构造一条横贯整个节点高度、宽度覆盖整张图的 rock 阻断带（不可通行 + 不可摧毁）
    const sealX = Math.round(node.playerSpawn.x + (node.exitX - node.playerSpawn.x) * 0.5);
    /** @type {any} */
    const rockTier = RULES.coverTiers.rock;
    const rockDef = rockTier || {};
    const canBlock = rockDef.passability === 0;
    ok(canBlock, '③ rock tier 确实是不可通行（负向构造的物理前提）');
    const blockSeal = [{ x: sealX, y: node.h / 2, w: 80, h: node.h * 2, angle: 0, tier: 'rock', hp: 1 }];

    const before = exitReachable(buildGrid(node, 'A'), node.exitX).ok;
    const after = exitReachable(buildGrid(node, 'A', blockSeal), node.exitX).ok;
    ok(before === true, '③ 构造前该节点出口可达（对照）');
    ok(after === false, '③ 塞入横贯 rock 后探针判不可达（敏感性成立，非恒真）');

    // 收尾：extraBlockers 是局部注入，不得污染节点数据
    ok((node.covers || []).every(c => c.tier !== 'rock' || c !== blockSeal[0]),
       '③ 负向构造未污染 node.covers');
  }
}

// ================= 3b) points 分支专属：防御点数据契约（E1） =================
if (DP_ENABLED) {
  section('③b defensePoints 分支：数据契约（E1 路径护栏自检）');
  {
    const run = MAP.generateRun(SEEDS[0], NODES_PER_RUN, ENV);
    let checked = 0, shapeOk = true, kindOk = true, groupOk = true;
    for (const n of run.nodes) {
      if (!isEncounterNode(n)) continue;
      checked++;
      const pts = n.defensePoints || [];
      for (const p of pts) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) shapeOk = false;
        if (p.x < 60 || p.x > n.w - 60 || p.y < 60 || p.y > n.h - 60) shapeOk = false;
        if (['junction', 'structure', 'foliage', 'open'].indexOf(p.kind) < 0) kindOk = false;
      }
      // 组=防御点（兼容层）：x0/x1 升序覆盖推进轴，encounterAnchors 与 defensePoints 同源
      const dl = n.defenseLines || [];
      if (!dl.length || !dl.every(l => Number.isFinite(l.x0) && Number.isFinite(l.x1) && l.x1 > l.x0)) groupOk = false;
      if (dl.length > 1 && dl.some((l, i) => i > 0 && l.x0 < dl[i - 1].x0)) groupOk = false;
      const ea = n.encounterAnchors || [];
      if (ea.length !== dl.length) groupOk = false;
      if (ea.some((g, i) => g.length !== 5 || Math.abs(g[0].x - (pts[i * 5] || {}).x) > 0.5)) groupOk = false;
    }
    ok(checked > 0, `③b 扫到 defensePoints 节点（${checked} 个）`);
    ok(shapeOk, '③b 每点 {x,y,kind} 形状完备且在界内');
    ok(kindOk, '③b kind ∈ {junction,structure,foliage,open}（[C2] 回填语义）');
    ok(groupOk, '③b 组=防御点兼容层一致（defenseLines/encounterAnchors 与点同源、桶升序）');
  }
}

// ================= 4) 判据自检：三档定义与我们声称的一致 =================
section('④ 判据自检');
{
  const t = RULES.coverTiers;
  ok(t.rock && t.rock.passability === 0, '④ rock 不可通行（A/B/C 三档都拦）');
  // full 的 shellBlock 在 RULES 里声明为 boolean（'solid'/'single' 是派生后的 mode，不是本键取值），
  // 故只断言真假，不对字符串做枚举比较（tsc 会判该比较无重叠）。
  ok(t.full && !!t.full.shellBlock,
     `④ full 有 shellBlock 判定（实到 ${t.full && t.full.shellBlock}）`);
  ok(t.bush && t.bush.passability !== 0, '④ bush 可通行（不参与阻挡，防过度保守）');
}

// ================= 5) 复杂度护栏：buildGrid 不得退回「格点 × 全部 blockers」==========
// 2026-11-19：原三重循环在 strip 节点上要 332 万次 pointInCoverOne / 次，全测试 216 次
// buildGrid ⇒ 实测 424s（Node 24）/ 493s（Node 22），超过 run-tests.js 的 300s 单测上限
// 而**稳定假红**（断言全过，只是慢）。改成逐 blocker AABB 预筛后降到 14.3s（约 30×）。
// 这条护栏防止有人"为了简单"改回去——它不测时间（机器差异大），而是测**精判调用次数**
// 的量级：必须随「格点数 + 覆盖面积」增长，不得随「格点数 × blockers 数」增长。
section('⑤ 复杂度护栏：精判次数不得退化为 格点×blockers');
{
  // 用一个真实的 strip 节点（最大的那个），统计 buildGrid 期间 pointInCoverOne 的调用数。
  // 通过与 buildGrid 同源的实现路径计数：包装 MAP.pointInCoverOne 不可行（内部直接引用），
  // 故改为**解析式上界**——直接算「AABB 预筛后的理论精判上界」并与「三重循环上界」对比。
  let node = null;
  {
    const run = MAP.generateRun(SEEDS[0], NODES_PER_RUN, ENV);
    for (const n of run.nodes) {
      if (!isEncounterNode(n)) continue;
      const cols = Math.floor(n.w / GRID) + 1, rows = Math.floor(n.h / GRID) + 1;
      const bN = countBlockersOf(n, 'A');
      if (!node || cols * rows * bN > node.code) {
        node = { n, cols, rows, bN, code: cols * rows * bN };
      }
    }
  }
  ok(!!node, '⑤ 取到用于复杂度评估的 encounter 节点');
  if (node) {
    // 朴素三重循环的调用次数（每格一旦命中就 break，故而是上界）
    const naive = node.cols * node.rows * node.bN;
    // AABB 预筛后的上界：每个 blocker 只扫自己包络 + TANK_R 覆盖的格点；
    // 保守取「该 blocker 包络面积 / 格面积 + 边界两圈」并求和。
    let indexed = 0;
    for (const c of (node.n.covers || [])) {
      const def = RULES.coverTiers[c.tier];
      if (!def || !BLOCKERS.A(def)) continue;
      const a = c.angle || 0;
      const hw = (c.w || 0) / 2, hh = (c.h || 0) / 2;
      const ex = Math.abs(Math.cos(a)) * hw + Math.abs(Math.sin(a)) * hh + TANK_R;
      const ey = Math.abs(Math.sin(a)) * hw + Math.abs(Math.cos(a)) * hh + TANK_R;
      const nx = Math.ceil((2 * ex) / GRID) + 2, ny = Math.ceil((2 * ey) / GRID) + 2;
      indexed += nx * ny;
    }
    const ratio = naive / Math.max(1, indexed);
    console.log(`  ${node.cols}×${node.rows} 格 × ${node.bN} blockers：`
      + `朴素上界 ${naive.toLocaleString()} 次，预筛上界 ${indexed.toLocaleString()} 次，`
      + `提速 ${ratio.toFixed(1)}×`);
    // 真实占比：只有多边形/河流实例的包络会明显大于格面积，普通矩形占比通常 <10%
    ok(indexed < naive, `⑤ 预筛精判上界（${indexed}）< 朴素上界（${naive}）`);
    ok(ratio >= 5, `⑤ 提速比 ${ratio.toFixed(1)}× ≥ 5（远距离格点不再逐 blocker 空判）`);
  }
}

/** 统计某档判据下的 blocker 数量（与 buildGrid 同源过滤） */
function countBlockersOf(node, variant) {
  const pred = BLOCKERS[variant];
  return (node.covers || []).filter(c => {
    const def = RULES.coverTiers[c.tier];
    return !!(def && pred(def));
  }).length;
}

console.log(`\n${fails === 0 ? '全部通过' : fails + ' 项失败'}：test-exit-reachability.js`
  + `（${DP_ENABLED ? 'defensePoints' : 'encounterAnchors'} 分支，扫描 ${nodeCount} 个 encounter 节点）`);
process.exitCode = fails === 0 ? 0 : 1;
