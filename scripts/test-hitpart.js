// P-01 命中部位意图（鼠标径向）的 Node 测试：aimPartPreference 死区判定 + bestHitForPref 取舍。
// Run: node scripts/test-hitpart.js
'use strict';

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
global.norm = U.norm;
global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect;
global.partCorners = U.partCorners;
global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir;
global.distToSegment = U.distToSegment;
global.RULES = RULES_MOD.RULES;
const G = require('../js/tank_geometry.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const MARGIN = 12;
// 水平射线：(0,0) 沿 (1,0)；hull 命中 t=100、turret 命中 t=120
const HITS = [
  { part:'hull',   t:100, x:100, y:0 },
  { part:'turret', t:120, x:120, y:0 }
];

// ---- aimPartPreference：死区边界（> +12 → turret；< -12 → hull；含等号在内 → auto）
ok(G.aimPartPreference(0,0, 1,0, 150, 0, HITS, MARGIN) === 'turret', 'mouse far ahead -> turret');
ok(G.aimPartPreference(0,0, 1,0, 50,  0, HITS, MARGIN) === 'hull', 'mouse short of target -> hull');
ok(G.aimPartPreference(0,0, 1,0, 112, 0, HITS, MARGIN) === 'auto', 'boundary tNear+margin -> auto');
ok(G.aimPartPreference(0,0, 1,0, 88,  0, HITS, MARGIN) === 'auto', 'boundary tNear-margin -> auto');
ok(G.aimPartPreference(0,0, 1,0, 105, 0, HITS, MARGIN) === 'auto', 'inside dead band -> auto');
ok(G.aimPartPreference(0,0, 1,0, 0, 30, HITS, MARGIN) === 'hull', 'off-axis y adds nothing to mt (0 -> hull)');
ok(G.aimPartPreference(0,0, 1,0, 200, 30, HITS, MARGIN) === 'turret', 'off-axis far ahead -> turret');
ok(G.aimPartPreference(0,0, 1,0, 30, -20, HITS, MARGIN) === 'hull', 'off-axis near -> hull');
ok(G.aimPartPreference(0,0, 1,0, 105, 0, null, MARGIN) === 'auto', 'no hits -> auto');
ok(G.aimPartPreference(0,0, 1,0, 105, 0, [], MARGIN) === 'auto', 'empty hits -> auto');
ok(G.aimPartPreference(0,0, 1,0, 105, 0, [{ part:'hull', t:Infinity }], MARGIN) === 'auto', 'infinite t only -> auto');

// ---- bestHitForPref：'hull' 取车体、'turret'/'auto'/未知 取炮塔优先，minT/maxT 窗口与 bestTankHit 一致
ok(G.bestHitForPref(HITS, 0.001, Infinity, 'hull').part === 'hull', "pref hull -> hull hit");
ok(G.bestHitForPref(HITS, 0.001, Infinity, 'turret').part === 'turret', "pref turret -> turret hit");
ok(G.bestHitForPref(HITS, 0.001, Infinity, 'auto').part === 'turret', "pref auto keeps turret-first default");
ok(G.bestHitForPref(HITS, 0.001, Infinity, '???').part === 'turret', "unknown pref keeps default");
ok(G.bestHitForPref(HITS, 0.001, Infinity, 'auto').t === G.bestTankHit(HITS, 0.001, Infinity).t, "auto == bestTankHit parity");
ok(G.bestHitForPref(HITS, 0.001, Infinity, 'hull').t === 100, 'hull pref picks t=100');
ok(G.bestHitForPref(HITS, 101, 119, 'turret') === null, 'window excludes both -> null');
ok(G.bestHitForPref(HITS, 101, 125, 'hull').part === 'turret', 'turret-only in window: hull pref falls back');
ok(G.bestHitForPref(HITS, 50, 110, 'hull').t === 100, 'window keeps hull only -> falls back to hull');
ok(G.bestHitForPref([{part:'turret', t:80}], 0.001, Infinity, 'hull').part === 'turret', 'turret-only: hull pref falls back');
ok(G.bestHitForPref([{part:'hull', t:80}], 0.001, Infinity, 'turret').part === 'hull', 'hull-only: turret pref falls back');
ok(G.bestHitForPref(null, 0.001, Infinity, 'auto') === null, 'null hits -> null');
ok(G.bestHitForPref([], 0.001, Infinity, 'auto') === null, 'empty hits -> null');

console.log(fails === 0 ? '\nAll hitpart checks passed.' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);