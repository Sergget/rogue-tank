// audit-road-draw.js — 公路分支链路重建病态审计（ISSUES #P2 检测工具）
// 运行：node scripts/audit-road-draw.js
// 口径：复刻 tank_battle.html bakeNodeGroundLayer 的 ends() 与链重建（4015-4071），
// 统计 strip-branch / hs-secondary 中「单段链且链长 < OBB 长边一半」的病链
// （= 端点被挤在段中心，渲染为断续细条）。#P2(a) 修复后病链应为 0。
'use strict';
const path = require('path');
const P = path.resolve(__dirname, '..', 'js') + path.sep;
const RULES_MOD = require(P + 'tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require(P + 'tank_utils.js');
const G = require(P + 'tank_geometry.js');
Object.assign(global, U, G);
global.TAU = U.TAU;
require(P + 'tank_cover.js');
const NG = require(P + 'tank_nodegen.js');
const MAP = require(P + 'tank_map.js');
const VP = { vw: 1920, vh: 1080 };
const SEEDS = Number(process.env.ROAD_AUDIT_SEEDS) || 30;

// 复刻 tank_battle.html bakeNodeGroundLayer 的 ends() 与链重建（4015-4071）
function ends(c) {
  const ca = Math.cos(c.angle || 0), sa = Math.sin(c.angle || 0);
  const nominalSpan = Math.max(10, c.w - (c.h || 64) * 0.35);
  const hw = nominalSpan / 2;
  return [{ x: c.x - ca * hw, y: c.y - sa * hw }, { x: c.x + ca * hw, y: c.y + sa * hw }];
}
function rebuildPaths(roadCovs) {
  const groups = new Map();
  roadCovs.forEach((c, i) => {
    const g = c.groupId || ('__road_' + i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  });
  const paths = [];
  for (const segs of groups.values()) {
    const used = new Set();
    const matchTol = Math.max(35, (segs[0] ? segs[0].h : 64) * 0.6);
    for (const s0 of segs) {
      if (used.has(s0)) continue;
      used.add(s0);
      const [a0, b0] = ends(s0);
      const chain = [a0, b0];
      let extended = true;
      while (extended) {
        extended = false;
        const tail = chain[chain.length - 1], head = chain[0];
        let bestC = null, bestD = matchTol, attach = null;
        for (const s of segs) {
          if (used.has(s)) continue;
          const [a, b] = ends(s);
          const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
          if (d(tail, a) < bestD) { bestD = d(tail, a); bestC = s; attach = 'tail_b'; }
          if (d(tail, b) < bestD) { bestD = d(tail, b); bestC = s; attach = 'tail_a'; }
          if (d(head, b) < bestD) { bestD = d(head, b); bestC = s; attach = 'head_a'; }
          if (d(head, a) < bestD) { bestD = d(head, a); bestC = s; attach = 'head_b'; }
        }
        if (bestC) {
          used.add(bestC);
          const [a, b] = ends(bestC);
          if (attach === 'tail_b') chain.push(b);
          else if (attach === 'tail_a') chain.push(a);
          else if (attach === 'head_a') chain.unshift(a);
          else chain.unshift(b);
          extended = true;
        }
      }
      paths.push({ pts: chain, w: s0.h || 70, group: s0.groupId });
    }
  }
  return paths;
}

let branchSegs = 0, vertBranchSegs = 0, brokenPaths = 0, totalBranchPaths = 0;
const byGroup = {};
let bridges = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const s = NG.generateStrip(0.5, { seed, viewport: VP, scaleFor: MAP.nodeScaleFor });
  const roads = s.covers.filter(c => c.tier === 'road');
  const branchSegsArr = roads.filter(c => c.groupId === 'strip-branch' || c.groupId === 'hs-secondary' || c.groupId === 'bridge-approach');
  branchSegs += branchSegsArr.length;
  vertBranchSegs += branchSegsArr.filter(c => (c.h || 0) > (c.w || 1) * 1.5 && Math.abs(c.angle || 0) < 0.1).length;
  const paths = rebuildPaths(roads);
  // 病链判定：单段链的实际折线长 << 该段 OBB 长边（ends() 假定「长边沿 angle 方向」，
  // 竖向 strip-branch（angle=0 但 h>w）不满足 → 端点挤在中心）。
  const segByKey = new Map();
  for (const r of branchSegsArr) segByKey.set(r.x.toFixed(1) + ',' + r.y.toFixed(1), r);
  for (const p of paths) {
    if (p.group !== 'strip-branch' && p.group !== 'hs-secondary') continue;
    totalBranchPaths++;
    let len = 0;
    for (let i = 1; i < p.pts.length; i++) len += Math.hypot(p.pts[i].x - p.pts[i-1].x, p.pts[i].y - p.pts[i-1].y);
    let broken = false;
    if (p.pts.length === 2) {
      const mid = { x: (p.pts[0].x + p.pts[1].x) / 2, y: (p.pts[0].y + p.pts[1].y) / 2 };
      const r = segByKey.get(mid.x.toFixed(1) + ',' + mid.y.toFixed(1));
      const longAxis = r ? Math.max(r.w, r.h) : 0;
      broken = longAxis > 0 && len < longAxis * 0.5;
    }
    if (broken) brokenPaths++;
    byGroup[p.group] = byGroup[p.group] || { total: 0, broken: 0, wSum: 0, wN: 0 };
    byGroup[p.group].total++;
    if (broken) byGroup[p.group].broken++;
    byGroup[p.group].wSum += p.w; byGroup[p.group].wN++;
  }
  bridges += s.covers.filter(c => c.tier === 'bridge').length;
}
console.log(`${SEEDS} seed 统计：`);
console.log(' 分支/过渡段总数:', branchSegs, ' 其中竖向(angle=0 但 h>w×1.5):', vertBranchSegs);
console.log(' 分支病链(端点挤中心):', brokenPaths, '/', totalBranchPaths);
console.log(' 桥梁总数:', bridges, '（drawStyle=bridge-deck 桥面铺装+护栏+中线（#R1 后））');
for (const [g, v] of Object.entries(byGroup)) {
  console.log(`  ${g}: 路径 ${v.total} 条, 病链 ${v.broken} 条, 平均渲染宽 ${(v.wSum / v.wN).toFixed(0)}px`);
}
if (brokenPaths > 0) {
  console.error('✗ 分支链重建病态（ISSUES #P2(a) 未修复）');
  process.exit(1);
}
console.log('✓ 分支链重建正常');
