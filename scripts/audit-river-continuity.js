// audit-river-continuity.js — 河流连续性审计（ISSUES #P1 检测工具）
// 运行：node scripts/audit-river-continuity.js
// 口径：60 seed × generateStrip(0.5)；同 groupId 相邻保留河段中心距 >200px 且
// 连线中点不被任何同组河段/桥覆盖 = 空洞。#P1 修复后本脚本应输出 0 洞。
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
const SEEDS = Number(process.env.RIVER_AUDIT_SEEDS) || 60;

function ptIn(c, x, y) {
  const a = -(c.angle || 0), ca = Math.cos(a), sa = Math.sin(a);
  const dx = x - c.x, dy = y - c.y;
  return Math.abs(dx * ca - dy * sa) <= (c.w || 0) / 2 && Math.abs(dx * sa + dy * ca) <= (c.h || 0) / 2;
}

let holes = 0;
const seedsHit = new Set();
const report = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const s = NG.generateStrip(0.5, { seed, viewport: VP, scaleFor: MAP.nodeScaleFor });
  const rivers = s.covers.filter(c => c.tier === 'river');
  const bridges = s.covers.filter(c => c.tier === 'bridge');
  const groups = new Map();
  for (const r of rivers) {
    const g = r.groupId || '?';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  for (const [g, segs] of groups) {
    for (let i = 1; i < segs.length; i++) {
      const a = segs[i - 1], b = segs[i];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist <= 200) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const covered = segs.some(r => ptIn(r, mx, my)) || bridges.some(br => ptIn(br, mx, my));
      if (covered) continue;
      holes++;
      seedsHit.add(seed);
      if (report.length < 20) report.push(` seed=${seed} ${g}#${i} 断口 ${Math.round(dist)}px @(${Math.round(mx)},${Math.round(my)})`);
    }
  }
}
for (const line of report) console.log(line);
console.log(`\n${SEEDS} seed：受影响 ${seedsHit.size} 个（${Math.round(seedsHit.size / SEEDS * 100)}%），空洞 ${holes} 处`);
if (holes > 0) {
  console.error('✗ 河流不连续（ISSUES #P1 未修复）');
  process.exit(1);
}
console.log('✓ 河流全程连续');
