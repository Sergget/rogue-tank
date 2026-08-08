// Dev sanity check for the map-element/cover mechanics (A1~A3). Node-side, no browser needed.
// Run: node scripts/test-covers.js
'use strict';

// ---- browser-global shims (module chain shares them via global in Node, as scripts do in browser)
const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
global.TAU = U.TAU;
global.norm = U.norm;
global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect;
global.partCorners = U.partCorners;
global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir;
global.RULES = RULES_MOD.RULES;
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

// 5b) driveBy: 半高掩体重坦可越（不推不毁），中坦被推出
const half = findTier('half');
const halfCov = { x: half.x, y: half.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10 };
const heavyT = Object.assign({}, halfCov, { heightClass: 'heavy' });
const mx0 = half.x, my0 = half.y;
C.resolveCoverCollisions(heavyT);
ok(heavyT.x === mx0 && heavyT.y === my0 && half.hp === Infinity,
  `heavy tank drives over half cover (pos unchanged, cover intact)`);
C.resetCovers();
const mediumT = Object.assign({}, halfCov, { heightClass: 'medium' });
C.resolveCoverCollisions(mediumT);
ok(mediumT.x !== mx0 || mediumT.y !== my0, `medium tank pushed out of half cover (moved)`);
C.resetCovers();

// 5c) 简化版掩体模型：重坦/中坦车体在半高掩体后的露出与距离压制测试
const ox = half.x - 400;
const targetFarX = half.x + 120; // 掩体在 (half.x, half.y)，攻击方在 half.x-400，目标在 half.x+120：目标离掩体近
const heavyHullFar = C.getExposure(ox, half.y, targetFarX, half.y, null, { heightClass: 'heavy' }, 0, 1.8);
ok(heavyHullFar === 0.25, `heavy hull exposes 25% behind half cover (got ${heavyHullFar})`);

const medHullFar = C.getExposure(ox, half.y, targetFarX, half.y, null, { heightClass: 'medium' }, 0, 1.4);
ok(medHullFar === 0.0, `medium hull exposes 0% behind half cover (got ${medHullFar})`);

const turretExposed = C.getExposure(ox, half.y, targetFarX, half.y, null, { heightClass: 'medium' }, 1.4, 2.3);
ok(turretExposed === 1.0, `turret is 100% exposed behind half cover (got ${turretExposed})`);

// 5d) 距离压制：攻击方离半高掩体更近 (distA < distB) → 被攻击方视为无掩体 (exposure = 1.0)
const half1 = findTier('half');
const attackerNearX = half1.x - 200; // 攻击方 (half1.x - 200, half1.y + 100)
const targetAwayX = half1.x + 300;   // 目标 (half1.x + 300, half1.y + 100)
const suppressedExp = C.getExposure(attackerNearX, half1.y + 100, targetAwayX, half1.y + 100, null, { heightClass: 'medium' }, 0, 1.4);
ok(suppressedExp === 1.0, `attacker closer to cover suppresses target cover advantage (got ${suppressedExp})`);

// 5e) 方向判据：骑上/包住掩体的坦克不被全方向遮蔽（cutoffDist 早于掩体出口 → 不参与）
const onCover = C.getExposure(ox, half.y, half.x, half.y, null, { heightClass: 'heavy' }, 0, 1.8, 400);
ok(onCover === 1.0, `tank riding cover not shielded from flank (got ${onCover.toFixed(2)})`);
const behindCover = C.getExposure(ox, half.y, targetFarX, half.y, null, { heightClass: 'heavy' }, 0, 1.8, 520);
ok(behindCover === 0.25, `tank behind cover shielded with cutoff (got ${behindCover})`);
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