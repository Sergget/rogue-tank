// Dev sanity check for the map-element/cover mechanics (A1~A3). Node-side, no browser needed.
// Run: node scripts/test-covers.js
'use strict';

// ---- browser-global shims (module chain shares them via global in Node, as scripts do in browser)
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
global.norm = U.norm;
global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect;
global.partCorners = U.partCorners;
global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir;
global.RULES = require('../js/tank_rules.js').RULES;
global.HEIGHTS = require('../js/tank_geometry.js').HEIGHTS; // geometry 顶层 const，tank_cover 依赖
const C = require('../js/tank_cover.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function findTier(tier) { return C.covers.find(x => x.tier === tier); }

// 1) initial hp derived from tier
ok(findTier('tree').hp === 3, 'tree derives hp from tier (3)');
ok(findTier('barricade').hp === 1, 'barricade hp=1');
ok(findTier('full').hp === Infinity, 'full cover hp=Infinity');
ok(findTier('half').hp === Infinity, 'half cover hp=Infinity');

// 2) damage/destroy + felled-to-stump chain
const tree = findTier('tree');
C.damageCover(tree, 1, 'shell');
ok(tree.hp === 2 && tree.tier === 'tree', `tree hp 3->2 (got ${tree.hp})`);
C.damageCover(tree, 2, 'shell');
ok(tree.tier === 'stump' && tree.hp === 1, `tree felled -> stump hp=1 (got ${tree.tier}/${tree.hp})`);
C.damageCover(tree, 1, 'shell');
ok(tree.hp === 0, 'stump destroyed by crush hit');
C.resetCovers();

// 3) destroyed covers excluded from path queries
const barricade = findTier('barricade');
barricade.hp = 0;
let hits = C.findCoversOnPath(0, barricade.y, 2000, barricade.y);
ok(!hits.some(h => h.cover.hp === 0), 'destroyed elements excluded from findCoversOnPath');
barricade.hp = 1;

// 4) exposure: solid/single -> 0 ; bush/soft ignored
const full = findTier('full');
const bush = findTier('bush');
const halfT = { heightClass: 'heavy' };
// line straight through bush (y=0): exposure stays open
const expThroughBush = C.getExposure(bush.x - 400, bush.y, bush.x + 400, bush.y, null, halfT, 0, 2.8);
ok(expThroughBush > 0.5, `shell passes through bush (exposure=${expThroughBush.toFixed(2)})`);
// line straight into full solid
const expSolid = C.getExposure(full.x - 400, full.y, full.x + 400, full.y, null, halfT, 0, 2.8);
ok(expSolid === 0, 'solid cover fully occludes');
// barricade same as solid
const bar = findTier('barricade');
const exBar = C.getExposure(bar.x - 400, bar.y, bar.x + 400, bar.y, null, halfT, 0, 2.8);
ok(exBar === 0, 'barricade (single) fully occludes while alive');

// 5) tank crush destroys crumbled elements
const soft = findTier('soft');
const softHp = soft.hp;
C.resolveCoverCollisions({ x: soft.x + 30, y: soft.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10 });
ok(soft.hp === 0, `tank crush destroys soft fence (was ${softHp}, now ${soft.hp})`);
C.resetCovers();

// 6) solid non-crushable pushes tank out
const fullHpBefore = full.hp;
C.resolveCoverCollisions({ x: full.x, y: full.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10 });
ok(full.hp === fullHpBefore, `solid cover not destroyed by tank (hp=${full.hp})`);

// 7) coverNormalAt unit normal
const n = C.coverNormalAt(bar, bar.x + 1, bar.y);
ok(n && Math.abs(Math.hypot(n.nx, n.ny) - 1) < 1e-6, 'coverNormalAt returns unit normal');

// 8) HE splash damages destructibles in radius
const bar2 = findTier('barricade');
C.splashCoversAt(bar2.x, bar2.y, 30);
ok(bar2.tier === 'rubble' && bar2.hp === 1, `barricade splash-destroyed -> rubble residue (got ${bar2.tier}/${bar2.hp})`);
C.resetCovers();

// 9) resetCovers restores all
C.resetCovers();
ok(findTier('tree').hp === 3 && findTier('barricade').hp === 1 && findTier('barricade').tier === 'barricade',
  'resetCovers restores hp/tier for all elements');

console.log(fails ? `\n${fails} failure(s).` : '\nAll cover-system checks passed.');
process.exitCode = fails ? 1 : 0;