// audit-map-gen.js — 地图生成多缺陷静态扫描（ISSUES #P 批次扩展审计）
// 运行：node scripts/audit-map-gen.js          （可选 RIVER/ROAD 同参：MAP_AUDIT_SEEDS=10）
// 对每个 seed × generateRun 首 2 节点执行九类检查：
//   G1 道路断口（同组相邻段重建容差外 + 中点无路面/桥覆盖）
//   G2 桥无路 / 涉水路口（info）/ 路口无路
//   G3 孤儿 junction（附近无任何路面）
//   G4 结构/植被足迹压上真实路面多边形（verts 口径；2026-10-20 重写，旧矩形口径作废）
//   G5 出生点合法性（玩家/敌军 vs 阻挡掩体、间距、越界）
//   G6 敌→玩家 LoS 被挡（info，ensureLoSCorridor 契约）
//   G7 结构/植被越出节点边界 >30px
//   G8 结构间显著重叠（>40% 小者面积）
//   G9 连通性 ≥0.999（nodeLayoutMetrics，以 playerSpawn 为起点）
// 硬失败（exit 1）：G1 洞 / G2 桥无路 / G3 / G4结构 / G5 违规 / G7 / G8 / G9。
'use strict';
const path = require('path');
const P = path.resolve(__dirname, '..', 'js') + path.sep;
const RULES_MOD = require(P + 'tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require(P + 'tank_utils.js');
const G = require(P + 'tank_geometry.js');
Object.assign(global, U, G);
global.TAU = U.TAU;
const COV = require(P + 'tank_cover.js');
Object.assign(global, COV);
const NG = require(P + 'tank_nodegen.js');
Object.assign(global, NG);
const MAP = require(P + 'tank_map.js');
Object.assign(global, MAP);

const SEEDS = Number(process.env.MAP_AUDIT_SEEDS) || 8;
const NODES_PER_RUN = 2;
const ENV = { viewport: { vw: 1920, vh: 1080 }, difficultyLevel: 0 };

const fails = [];
const infos = [];
function fail(k, msg) { fails.push(`${k}: ${msg}`); }
function info(k, msg) { infos.push(`${k}: ${msg}`); }

function ptInRect(c, x, y, pad) {
  const a = -(c.angle || 0), ca = Math.cos(a), sa = Math.sin(a);
  const dx = x - c.x, dy = y - c.y;
  const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
  const p = pad || 0;
  return Math.abs(lx) <= (c.w || 0) / 2 + p && Math.abs(ly) <= (c.h || 0) / 2 + p;
}
const tierDef = t => (RULES.coverTiers || {})[t] || null;
const isBlocking = t => {
  const d = tierDef(t);
  if (!d) return false;
  return d.passability === 0 || d.shellBlock === true || d.shellBlock === 'single';
};
const isStruct = t => ['full', 'building', 'intact', 'rock', 'ruined'].includes(t);
const isFoliage = t => ['tree', 'bush', 'fallen'].includes(t);
const dirOf = c => {
  let a = c.angle || 0;
  if ((c.w || 0) < (c.h || 0)) a += Math.PI / 2;
  return ((a % Math.PI) + Math.PI) % Math.PI;
};
const acuteDeg = (a, b) => {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d) * 180 / Math.PI;
};

// ---- G4 几何工具（2026-10-20 重写）----------------------------------------
// 背景：2026-10-16 `cde3bc3` 起 strip 主干道是**整链连续多边形**（verts，可达 322 点，
// 宽约 120px 的蜿蜒带），但 cover 的 `w/h` 仍是它的 **AABB**（实测 17280×661，
// 面积比仅 0.156）。旧判据 `ptInRect(road, c.x, c.y, 8)` 用 w/h 矩形当路面 ⇒ 落在
// AABB 纵带里、实际离路面边缘几十到几百 px 的元素被判「压在道路中心线」（实测 669 项
// 硬失败全是假阳性）。现改为：把道路还原成**真实世界多边形**，再判「元素足迹是否压上路面」。
// 判定复用生成侧同一口径（`coverWorldPolygon` 的 verts 世界化 + 点测/边相交），
// 与 tank_nodegen.js `clearCoversOnRoads` 的「边相交 / 顶点互含」同意图，只是 audit 端
// 不引 nodegen 内部私有函数，独立实现以便口径可被本脚本单独复核。
const ROAD_PAD = 8;   // 与生成侧 _ROAD_CLEAR_MARGIN 同量级：容差 8px 的近贴不判硬失败

// 掩体世界多边形：verts/collisionVerts 优先（tank_cover.coverWorldPolygon 走同一套
// 旋转+平移约定），无 verts 回退矩形四角。
function coverPoly(cov) {
  if (cov.collisionVerts && cov.collisionVerts.length >= 3 &&
      !Array.isArray(cov.collisionVerts[0][0])) {
    return COV.polyCorners(cov.x, cov.y, cov.angle || 0, { verts: cov.collisionVerts });
  }
  if (cov.verts && cov.verts.length >= 3 && !Array.isArray(cov.verts[0][0])) {
    return COV.coverWorldPolygon(cov).poly;
  }
  return partCorners(cov.x, cov.y, cov.angle || 0, (cov.w || 0) / 2, (cov.h || 0) / 2);
}
function polyAABB(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
function aabbOverlap(a, b, pad) {
  const p = pad || 0;
  return a.maxX + p >= b.minX && a.minX - p <= b.maxX && a.maxY + p >= b.minY && a.minY - p <= b.maxY;
}
function pointInPoly(p, poly) { return COV.pointInPolygon(p, poly); }
function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
// 两多边形（可凹）是否相交：AABB 粗筛 → 中心/顶点互含 → 边相交。
function polysIntersect(a, b) {
  const ba = polyAABB(a), bb = polyAABB(b);
  if (!aabbOverlap(ba, bb, 0)) return false;
  let cx = 0, cy = 0;
  for (const p of a) { cx += p.x; cy += p.y; }
  if (pointInPoly({ x: cx / a.length, y: cy / a.length }, b)) return true;
  for (const p of a) if (pointInPoly(p, b)) return true;
  for (const p of b) if (pointInPoly(p, a)) return true;
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const s = b[j], t = b[(j + 1) % b.length];
      if (segCross(p.x, p.y, q.x, q.y, s.x, s.y, t.x, t.y)) return true;
    }
  }
  return false;
}
// 点距多边形边界的最小距离（容差用）
function distToPolyEdge(x, y, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const d = distToSegment(x, y, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
}
// G4 判定：元素足迹与路面真实多边形的关系。
//   返回 'inside'（中心或足迹相交路面）| 'near'（≥1 顶点在路面 8px 内，容差内不报）| null
function coverVsRoad(cov, roadPoly) {
  const poly = coverPoly(cov);
  if (polysIntersect(poly, roadPoly)) return 'inside';
  const rb = polyAABB(roadPoly), cb = polyAABB(poly);
  if (!aabbOverlap(cb, rb, ROAD_PAD)) return null;
  for (const p of poly) if (distToPolyEdge(p.x, p.y, roadPoly) <= ROAD_PAD) return 'near';
  if (distToPolyEdge(cov.x, cov.y, roadPoly) <= ROAD_PAD) return 'near';
  return null;
}


let stat = { roadHoles: 0, bridgeNoRoad: 0, fordCross: 0, orphanJunc: 0, dupJunc: 0,
  g4SelfTest: 0, roadPolyCount: 0, roadRectOnly: 0,
  structOnRoad: 0, foliOnRoad: 0, nearRoad: 0, spawnBad: 0, losBlocked: 0,
  outOfBounds: 0, structOverlap: 0, minConnect: 1 };

// ---- G4 判据自检（2026-10-20）---------------------------------------------
// 目的：G4 是「结构不该压路面」的硬检查，一旦判据退化成永远返回 false（例如 verts 解析
// 失败、cover 多边形与世界坐标不一致），硬失败数会漂亮地归零但检查彻底失效。故先用
// 一组可判定的合成几何证明判据**有真阳性能力**，再进入真实地图审计。
// 自检失败直接计硬失败（G0），不允许静默通过。只用合成几何，不依赖任何随机生成结果。
{
  const road = { tier: 'road', x: 1000, y: 500, w: 2000, h: 120, angle: 0, hp: 5 };
  const roadPoly = coverPoly(road);
  const onIt = { tier: 'full', x: 1000, y: 500, w: 80, h: 80, angle: 0 };
  const straddle = { tier: 'building', x: 1000, y: 566, w: 80, h: 80, angle: 0 };  // 中心在路外、足迹跨路缘
  const clear = { tier: 'tree', x: 1000, y: 900, w: 60, h: 60, angle: 0 };
  const selfTests = [
    ['矩形路 正压路面 → inside', coverVsRoad(onIt, roadPoly) === 'inside'],
    ['矩形路 跨路缘（中心在路外）→ inside', coverVsRoad(straddle, roadPoly) === 'inside'],
    ['矩形路 远离路面 → null', coverVsRoad(clear, roadPoly) === null]
  ];
  // verts 多边形口径必须同样命中（整链 strip 道路走的正是这条路径）
  const zig = { tier: 'road', x: 0, y: 0, angle: 0, hp: 5,
    verts: [[-500, -20], [500, -20], [500, 20], [-500, 20]] };
  const zigPoly = coverPoly(zig);
  selfTests.push(['verts 多边形 正压 → inside',
    coverVsRoad({ tier: 'rock', x: 0, y: 0, w: 60, h: 60, angle: 0 }, zigPoly) === 'inside']);
  selfTests.push(['verts 多边形 外侧 → null',
    coverVsRoad({ tier: 'rock', x: 0, y: 300, w: 60, h: 60, angle: 0 }, zigPoly) === null]);
  selfTests.push(['verts 多边形 旋转语义一致（angle 生效）',
    coverVsRoad({ tier: 'rock', x: 0, y: 0, w: 60, h: 60, angle: 0 },
      coverPoly({ tier: 'road', x: 0, y: 0, angle: Math.PI / 2, hp: 5,
        verts: [[-500, -20], [500, -20], [500, 20], [-500, 20]] })) === 'inside']);
  for (const [label, pass] of selfTests) {
    if (pass) stat.g4SelfTest++;
    else fail('G0', `G4 判据自检未通过：${label}`);
  }
}


for (let seed = 1; seed <= SEEDS; seed++) {
  const run = MAP.generateRun(seed, NODES_PER_RUN, ENV);
  for (const node of run.nodes) {
    const w = node.w, h = node.h;
    const covers = node.covers || [];
    const roads = covers.filter(c => c.tier === 'road' && c.hp !== 0);
    const bridges = covers.filter(c => c.tier === 'bridge');
    const rivers = covers.filter(c => c.tier === 'river' || c.tier === 'water');
    const tag = `seed=${seed} node=${node.index}`;

    // ---- G1 道路断口 ----
    {
      const groups = new Map();
      for (const r of roads) {
        const g = r.groupId || '?';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(r);
      }
      for (const [g, segs] of groups) {
        const matchTol = Math.max(35, (segs[0].h || 64) * 0.6);
        for (let i = 1; i < segs.length; i++) {
          const a = segs[i - 1], b = segs[i];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= matchTol) continue;          // 重建层能连上 → 无缝
          if (dist > 400) continue;                // 跨分支/跨链的组内相邻，非断口
          // 弦向与两段方向都近乎共线才判定为同一条路的断口（排除平行双道误报）
          const chord = ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI;
          if (acuteDeg(chord, dirOf(a)) > 35 || acuteDeg(chord, dirOf(b)) > 35) continue;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const covered = roads.some(r => ptInRect(r, mx, my)) ||
            bridges.some(br => ptInRect(br, mx, my));
          if (!covered) { stat.roadHoles++; fail('G1', `${tag} 道路断口 ${Math.round(dist)}px @(${Math.round(mx)},${Math.round(my)}) 组=${g}`); }
        }
      }
    }

    // ---- G2 桥无路 / 涉水路口（info） ----
    for (const br of bridges) {
      const road = roads.some(r =>
        Math.abs(r.x - br.x) < (r.w + br.w) / 2 && Math.abs(r.y - br.y) < (r.h + br.h) / 2 &&
        ptInRect(br, r.x, r.y, 20) || ptInRect(r, br.x, br.y, 20));
      if (!road) { stat.bridgeNoRoad++; fail('G2', `${tag} 桥下无路 @(${Math.round(br.x)},${Math.round(br.y)})`); }
    }
    for (const r of roads) {
      const s = r.angle || 0;
      const hit = rivers.some(rv => rv.segments
        ? rv.segments.some(sg => ptInRect(sg, r.x, r.y, 10))
        : ptInRect(rv, r.x, r.y, 10));
      if (!hit) continue;
      const nearBridge = bridges.some(br => Math.hypot(br.x - r.x, br.y - r.y) < 300);
      if (!nearBridge) { stat.fordCross++; }
    }

    // ---- G3 孤儿 junction / 重复 junction ----
    {
      const seen = new Set();
      for (const j of (node.roadJunctions || [])) {
        const key = Math.round(j.x / 10) + ':' + Math.round(j.y / 10);
        if (seen.has(key)) { stat.dupJunc++; continue; }
        seen.add(key);
        const near = roads.some(r => ptInRect(r, j.x, j.y, (j.r || 40) + 30));
        if (!near) { stat.orphanJunc++; fail('G3', `${tag} 孤儿路口(附近无路面) @(${Math.round(j.x)},${Math.round(j.y)})`); }
      }
      if (stat.dupJunc > 0 && seen.size === 0) { /* noop */ }
    }

    // ---- G4 结构/植被足迹压上真实路面多边形（2026-10-20 重写） ----
    // 旧口径 `ptInRect(road, c.x, c.y, 8)` 把道路的 **AABB 矩形**当路面，而 strip 主干道
    // 是 ~120px 宽的整链蜿蜒多边形（AABB 17280×661，多边形/bbox 面积比中位 0.317、
    // 主干道 0.156）⇒ 669 项全是「落在 AABB 纵带内但离真路面 20~400px」。现按真实多边形判定。
    {
      const roadPolys = [];
      for (const r of roads) {
        const poly = coverPoly(r);
        if (poly && poly.length >= 3) roadPolys.push({ road: r, poly: poly, bb: polyAABB(poly) });
      }
      stat.roadPolyCount += roadPolys.length;
      stat.roadRectOnly += (roads.length - roadPolys.length);
      for (const c of covers) {
        if (!isStruct(c.tier) && !isFoliage(c.tier)) continue;
        const cx0 = (c.w || 0) / 2 + ROAD_PAD, cy0 = (c.h || 0) / 2 + ROAD_PAD;
        let verdict = null;
        for (const rp of roadPolys) {
          // AABB 粗筛：元素 AABB（按半宽高 + 容差放宽）与路面多边形 AABB 不重叠 ⇒ 不可能压路
          if (c.x + cx0 < rp.bb.minX || c.x - cx0 > rp.bb.maxX ||
              c.y + cy0 < rp.bb.minY || c.y - cy0 > rp.bb.maxY) continue;
          const v = coverVsRoad(c, rp.poly);
          if (v === 'inside') { verdict = 'inside'; break; }
          if (v === 'near') verdict = verdict || 'near';
        }
        if (verdict === 'inside') {
          if (isStruct(c.tier)) { stat.structOnRoad++; fail('G4', `${tag} ${c.tier} 足迹压上路面 @(${Math.round(c.x)},${Math.round(c.y)})`); }
          else { stat.foliOnRoad++; info('G4', `${tag} ${c.tier} 足迹压上路面 @(${Math.round(c.x)},${Math.round(c.y)})`); }
        } else if (verdict === 'near') {
          stat.nearRoad++;   // 8px 容差内的近贴：既非硬失败也不是压路，单独计数备查
          info('G4', `${tag} ${c.tier} 贴路面边缘 ≤${ROAD_PAD}px @(${Math.round(c.x)},${Math.round(c.y)})`);
        }
      }
    }

    // ---- G5 出生点合法性 ----
    const ps = node.playerSpawn || { x: w * 0.1, y: h / 2 };
    for (const c of covers) {
      if (!isBlocking(c.tier)) continue;
      if (ptInRect(c, ps.x, ps.y, 60)) {
        const d = tierDef(c.tier);
        if (d && d.passability === 0) { stat.spawnBad++; fail('G5', `${tag} 玩家出生点被 ${c.tier} 挡住 @(${Math.round(ps.x)},${Math.round(ps.y)})`); }
        else { info('G5', `${tag} 玩家出生点贴 ${c.tier}（60px 内，减速/溺水风险）`); }
      }
    }
    const enemies = node.enemies || [];
    const minD = node.minPlayerDist || 250;
    for (const e of enemies) {
      if (e.x < 40 || e.x > w - 40 || e.y < 40 || e.y > h - 40) {
        stat.spawnBad++; fail('G5', `${tag} 敌军出生越界 (${e.x},${e.y})`);
      }
      if (Math.hypot(e.x - ps.x, e.y - ps.y) < minD * 0.95) {
        stat.spawnBad++; fail('G5', `${tag} 敌军距玩家 ${Math.round(Math.hypot(e.x - ps.x, e.y - ps.y))} < minPlayerDist ${minD}`);
      }
      for (const c of covers) {
        if (isBlocking(c.tier) && ptInRect(c, e.x, e.y, 55)) {
          stat.spawnBad++; fail('G5', `${tag} 敌军出生压 ${c.tier} @(${e.x},${e.y})`); break;
        }
      }
      for (const c of covers) {
        if ((c.tier === 'river' || c.tier === 'water') && ptInRect(c, e.x, e.y, 40)) {
          info('G5', `${tag} 敌军出生贴水 @(${e.x},${e.y})`); break;
        }
      }
    }
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const d = Math.hypot(enemies[i].x - enemies[j].x, enemies[i].y - enemies[j].y);
        if (d < 90) { stat.spawnBad++; fail('G5', `${tag} 敌军重叠 ${Math.round(d)}px (${i},${j})`); }
      }
    }

    // ---- G6 敌→玩家 LoS（info） ----
    if (typeof COV.hasLineOfSight === 'function') {
      let blocked = 0;
      for (const e of enemies) {
        if (!COV.hasLineOfSight(ps.x, ps.y, e.x, e.y, covers)) blocked++;
      }
      if (blocked) { stat.losBlocked += blocked; info('G6', `${tag} ${blocked}/${enemies.length} 敌人对玩家无直视线`); }
    }

    // ---- G7 越界 ----
    for (const c of covers) {
      if (!isStruct(c.tier) && !isFoliage(c.tier)) continue;
      const half = Math.max(c.w || 0, c.h || 0) / 2;
      if (c.x - half < -30 || c.x + half > w + 30 || c.y - half < -30 || c.y + half > h + 30) {
        stat.outOfBounds++; fail('G7', `${tag} ${c.tier} 越界 @(${Math.round(c.x)},${Math.round(c.y)}) half=${Math.round(half)}`);
      }
    }

    // ---- G8 结构显著重叠 ----
    const structs = covers.filter(c => isStruct(c.tier));
    for (let i = 0; i < structs.length; i++) {
      const a = structs[i];
      for (let j = i + 1; j < structs.length; j++) {
        const b = structs[j];
        if (Math.abs(a.x - b.x) > Math.max(a.w, b.w) || Math.abs(a.y - b.y) > Math.max(a.h, b.h)) continue;
        let inside = 0, total = 0;
        for (const [sx, sy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
          const px = a.x + sx * (a.w || 0) / 2, py = a.y + sy * (a.h || 0) / 2;
          total++;
          if (ptInRect(b, px, py, 0)) inside++;
        }
        const ratio = inside / total;
        if (ratio > 0.4) {
          stat.structOverlap++;
          fail('G8', `${tag} ${a.tier}×${b.tier} 重叠 ${(ratio * 100) | 0}% @(${Math.round(a.x)},${Math.round(a.y)})`);
        }
      }
    }

    // ---- G9 连通性 ----
    if (typeof NG.nodeLayoutMetrics === 'function') {
      const m = NG.nodeLayoutMetrics({ covers: covers, w: w, h: h, playerSpawn: ps },
        { step: 40, margin: 40, losSamples: 0, hasLineOfSight: COV.hasLineOfSight });
      if (m.connectivityRatio < stat.minConnect) stat.minConnect = m.connectivityRatio;
      if (m.connectivityRatio < 0.999) fail('G9', `${tag} 连通性 ${m.connectivityRatio.toFixed(4)} < 0.999`);
    }
  }
}

console.log(`\n== audit-map-gen ${SEEDS} seed × ${NODES_PER_RUN} 节点 ==`);
console.log(JSON.stringify(stat, null, 2));
for (const i of infos) console.log('  info | ' + i);
if (fails.length) {
  console.error(`\n✗ ${fails.length} 项硬失败（按类别）：`);
  const byK = new Map();
  for (const f of fails) {
    const k = f.split(':')[0];
    if (!byK.has(k)) byK.set(k, []);
    byK.get(k).push(f);
  }
  for (const [k, arr] of byK) {
    console.error(`  [${k}] ${arr.length} 项，样例：`);
    for (const s of arr.slice(0, 5)) console.error('    - ' + s);
    if (arr.length > 5) console.error(`    … 另有 ${arr.length - 5} 项`);
  }
  process.exit(1);
}
console.log('\n✓ 全部硬检查通过');
