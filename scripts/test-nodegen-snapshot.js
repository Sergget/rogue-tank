// test-nodegen-snapshot.js — generateNode 确定性快照回归 + 布局度量健全性（QA 合规）
// 运行：node scripts/test-nodegen-snapshot.js
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;   // 必须在 require tank_geometry/cover 之前（其顶层引用 RULES）
const U = require('../js/tank_utils.js');
const G = require('../js/tank_geometry.js');
Object.assign(global, U, G);   // 模拟浏览器全局环境（partCorners/polyCorners/createRNG/rotate 等）
global.TAU = U.TAU;
const coverMod = require('../js/tank_cover.js');
const nodegen = require('../js/tank_nodegen.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log('  ✓ ' + label);
  else { console.error('  ✗ ' + label); fails++; }
}

const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
const scales = [1, 3];
const templates = nodegen.getTemplates();
const templateIds = templates.map(t => t.id);
const KNOWN_TIERS = Object.keys(RULES_MOD.RULES.coverTiers);  // 权威 tier 白名单（含 full/half/bush/tree/river/road 等地形）

console.log('Templates: ' + templateIds.join(', '));
console.log('Seeds: ' + seeds.join(', ') + ' | Scales: ' + scales.join(', '));

let totalCases = 0;
let halfViolations = 0;
let emptyViolations = 0;
let detViolations = 0;

for (const tid of templateIds) {
  for (const scale of scales) {
    for (const seed of seeds) {
      totalCases++;
      const opts = { seed, templateId: tid, scale, centerX: 600, centerY: 350 };
      const a = nodegen.generateNode(0.5, opts);
      const b = nodegen.generateNode(0.5, opts);

      // 确定性：两次调用序列化完全一致
      const sa = JSON.stringify(a.covers.slice().sort((p, q) => (p.x - q.x) || (p.y - q.y)));
      const sb = JSON.stringify(b.covers.slice().sort((p, q) => (p.x - q.x) || (p.y - q.y)));
      if (sa !== sb) { detViolations++; console.error(`  FAIL det: tid=${tid} seed=${seed} scale=${scale}`); }

      // D5 回归：无 half tier
      if (a.covers.some(c => c.tier === 'half')) halfViolations++;

      // 非空 + 尺寸有效
      if (!(a.covers.length > 0)) emptyViolations++;
      if (!(a.w > 0 && a.h > 0)) { fails++; console.error(`  FAIL dims: tid=${tid} seed=${seed} scale=${scale} w=${a.w} h=${a.h}`); }

      // 覆盖 tier 合法性（full/half/bush/tree/soft/barricade 等已知枚举）
      const badTier = a.covers.find(c => !KNOWN_TIERS.includes(c.tier));
      if (badTier) { fails++; console.error(`  FAIL tier: ${badTier.tier}`); }

      // 布局度量健全性（nodeLayoutMetrics）：不抛错 + 字段数值合理
      try {
        const m = nodegen.nodeLayoutMetrics(a, { step: 40, margin: 40, losSamples: 60, hasLineOfSight: coverMod.hasLineOfSight });
        if (typeof m.coverCoverage !== 'number' || !(m.coverCoverage >= 0)) { fails++; console.error('  FAIL metric coverCoverage'); }
        if (typeof m.connectivityRatio !== 'number' || m.connectivityRatio < 0 || m.connectivityRatio > 1) { fails++; console.error('  FAIL metric connectivity'); }
        if (typeof m.minPassageWidth !== 'number' || m.minPassageWidth < 0) { fails++; console.error('  FAIL metric minPassage'); }
        if (typeof m.losSymmetry !== 'number') { fails++; console.error('  FAIL metric losSymmetry'); }
        // hasLineOfSight 抽样（视线对称/基本可用，barricade/full 等掩体参与）
        const p1 = { x: a.w * 0.1, y: a.h * 0.5 }, p2 = { x: a.w * 0.9, y: a.h * 0.5 };
        const l1 = coverMod.hasLineOfSight(p1.x, p1.y, p2.x, p2.y, a.covers);
        const l2 = coverMod.hasLineOfSight(p2.x, p2.y, p1.x, p1.y, a.covers);
        if (l1 !== l2) { fails++; console.error('  FAIL los symmetry'); }
      } catch (e) {
        fails++; console.error('  FAIL metrics threw: ' + e.message);
      }
    }
  }
}

ok(halfViolations === 0, `D5 回归：无 half tier（违例 ${halfViolations} 例）`);
ok(emptyViolations === 0, `每个节点 covers 非空（违例 ${emptyViolations} 例）`);
ok(detViolations === 0, `确定性：两次同参调用一致（违例 ${detViolations} 例）`);

console.log(`\n总用例数: ${totalCases}`);
console.log(`  half 违例: ${halfViolations}`);
console.log(`  空 covers 违例: ${emptyViolations}`);
console.log(`  确定性违例: ${detViolations}`);

if (fails > 0) { console.error(`\n✗ ${fails} 个断言失败`); process.exit(1); }
else { console.log('\n✓ 全部通过（确定性 + 无 half + 非空 + 度量健全性）'); process.exit(0); }
