// Extreme-but-valid cover-system edge cases NOT covered by scripts/test-covers.js (sections 12-30).
// Each scenario here was probed against the live module first; expected values are deterministic.
// Run: node scripts/test-extreme-cover.js
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
global.polyCorners = require('../js/tank_geometry.js').polyCorners; // coverCorners 依赖（复杂多边形）
const C = require('../js/tank_cover.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function findTier(tier) { return C.covers.find(x => x.tier === tier); }

// ================= EXTREME-BUT-VALID EDGE CASES (beyond test-covers.js) =================

// 31) getExposure: non-null `shooter` parameter is part of the public signature
//     (coverBlockInfo forwards it) but is intentionally inert — same result as null.
{
  const half = C.covers.find(c => c.tier === 'half' && !c.verts);
  const target = { heightClass: 'heavy' };
  const shooter = { x: half.x - 400, y: half.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10 };
  const eNull = C.getExposure(half.x - 400, half.y, half.x + 120, half.y, null, target, 0, 1.8);
  const eShooter = C.getExposure(half.x - 400, half.y, half.x + 120, half.y, shooter, target, 0, 1.8);
  ok(eShooter === eNull && eShooter === 0.25,
    `shooter parameter is inert in getExposure (null=${eNull} shooter=${eShooter})`);
}

// 32) getExposure with zero-length segment (ox==tx && oy==ty, at a cover center):
//     findCoversOnPath guards dist=1 + ux=uy=0 -> segRayIntersect denom=0 -> no hits -> exposure 1.0
{
  const half = C.covers.find(c => c.tier === 'half' && !c.verts);
  const e = C.getExposure(half.x, half.y, half.x, half.y, null, { heightClass: 'medium' }, 0, 1.4);
  ok(e === 1.0, `zero-length exposure path = 1.0 (no segment crosses cover, got ${e})`);
}

// 33) obbMTV deep penetration: 4x4 tank OBB centered inside a 5000x5000 cover.
//     Min-axis MTV must be finite, exact (2502 = cover half + tank half), and fully resolve the overlap.
{
  const huge = { x: 2000, y: 320, w: 5000, h: 5000, angle: 0 };
  const tk = U.partCorners(2000, 320, 0, 2, 2);                    // hullLen=4, hullWid=4 (valid, > 0)
  const hc = C.coverCorners(huge);
  const mtv = C.obbMTV(tk, hc);
  ok(mtv && Number.isFinite(mtv.depth) && mtv.depth === 2502,
    `deep penetration MTV has exact min-depth 2502 (got ${mtv && mtv.depth})`);
  const tk2 = U.partCorners(2000 + mtv.dx, 320 + mtv.dy, 0, 2, 2);
  const mtv2 = C.obbMTV(tk2, hc);
  ok(!mtv2 || mtv2.depth < 1e-6, `applying MTV fully resolves overlap (residual depth ${mtv2 && mtv2.depth})`);
}

// 34) resolveCoverCollisions with a tank far outside any cover: pure no-op
//     (no crash, position unchanged, all covers untouched).
{
  C.resetCovers();
  const far = { x: 99999, y: 99999, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'medium' };
  const fx0 = far.x, fy0 = far.y;
  C.resolveCoverCollisions(far);
  ok(far.x === fx0 && far.y === fy0, 'far-away tank is not pushed (no-op)');
  const tree = findTier('tree');
  ok(tree && tree.hp === 1 && tree.tier === 'tree', 'far-away tank leaves covers untouched');
}

// 35) findCoversOnPath / getExposure where the path endpoint is exactly on a cover edge or corner.
{
  C.resetCovers();
  const cov = { x: 3000, y: 3000, w: 60, h: 40, angle: 0, tier: 'full', hp: Infinity }; // edges x=2970/3030, y=2980/3020
  C.covers.push(cov);
  const target = { heightClass: 'medium' };

  // 35a) Path fully crosses the cover and ENDS exactly on the far edge (3030,3000):
  //      entry is strictly before the endpoint, distExit === dist exactly -> cover registered as traversed.
  const hitsA = C.findCoversOnPath(2500, 3000, 3030, 3000);
  ok(hitsA.length === 1 && Math.abs(hitsA[0].distA - 470) < 1e-9 && Math.abs(hitsA[0].distExit - 530) < 1e-9,
    `endpoint exactly on far edge still registers traversal (distA=${hitsA[0] && hitsA[0].distA}, distExit=${hitsA[0] && hitsA[0].distExit})`);
  const expShield = C.getExposure(2500, 3000, 3030, 3000, null, target, 0, 1.4, 530);
  ok(expShield === 0, `cutoff covers endpoint-on-edge traversal -> solid shields (got ${expShield})`);
  const expOpen = C.getExposure(2500, 3000, 3030, 3000, null, target, 0, 1.4, 500);
  ok(expOpen === 1.0, `cutoff before distExit excludes endpoint-on-edge cover (got ${expOpen})`);

  // 35b) Path touches the cover ONLY at the endpoint (graze, top edge y=2980): no entry before dist -> no hit.
  const hitsB = C.findCoversOnPath(2500, 2940, 3000, 2980);
  ok(hitsB.length === 0, `endpoint-only graze on edge -> no traversal hit (got ${hitsB.length})`);

  // 35c) Path endpoint exactly at a cover corner (2970,2980): same no-entry result.
  const hitsC = C.findCoversOnPath(2500, 3000, 2970, 2980);
  ok(hitsC.length === 0, `endpoint exactly on corner -> no traversal hit (got ${hitsC.length})`);

  C.covers.pop();
}

// 36) getCoverUnderTank with a huge tank (hullLen=1e6) spanning the whole map:
//     must return the first cover in registry order that it overlaps.
{
  C.resetCovers();
  const giant = { x: 99999, y: 99999, hullAngle: 0, hullLen: 1e6, hullWid: 1e6 };
  const under = C.getCoverUnderTank(giant);
  ok(under === C.covers[0] && under !== null,
    `huge tank covering whole map returns first overlapping cover (${under && under.tier})`);
}

// 37) splashCoversAt with radius=1e6: destroys every destructible static element exactly once
//     (tree->fallen, barricade->rubble, soft->hp 0) while full/half/bush (hp Infinity) survive.
{
  C.resetCovers();
  const destroyed = C.splashCoversAt(0, 0, 1e6);
  const soft = findTier('soft');
  ok(destroyed === 3, `huge-radius splash destroys exactly the 3 destructible covers (got ${destroyed})`);
  ok(findTier('fallen') !== undefined && findTier('rubble') !== undefined &&
     findTier('tree') === undefined && findTier('barricade') === undefined && soft && soft.hp === 0,
    'tree->fallen, barricade->rubble, soft->hp 0 (residue chain intact)');
  const full = findTier('full'), half = findTier('half'), bush = findTier('bush');
  ok(full.hp === Infinity && half.hp === Infinity && bush.hp === Infinity,
    'full/half/bush survive huge splash (hp Infinity)');
  C.resetCovers();
}

// 38) coverNormalAt at the exact center of a polygonal cover (hexagon + triangle):
//     closest-edge selection still returns a unit normal.
{
  const hex = C.covers.find(c => c.tier === 'half' && c.verts);
  const nHexC = C.coverNormalAt(hex, hex.x, hex.y);
  ok(nHexC && Math.abs(Math.hypot(nHexC.nx, nHexC.ny) - 1) < 1e-6,
    `coverNormalAt at hexagon center returns unit normal (${nHexC && Math.hypot(nHexC.nx, nHexC.ny).toFixed(3)})`);
  const tri = { x: 3100, y: 3100, w: 100, h: 100, angle: 0, tier: 'full', hp: Infinity,
                verts: [[-50, -50], [50, -50], [0, 50]] };
  C.covers.push(tri);
  const nTriC = C.coverNormalAt(tri, tri.x, tri.y);
  ok(nTriC && Math.abs(Math.hypot(nTriC.nx, nTriC.ny) - 1) < 1e-6,
    `coverNormalAt at triangle center returns unit normal (${nTriC && Math.hypot(nTriC.nx, nTriC.ny).toFixed(3)})`);
  C.covers.pop();
}

// 39) resetCovers after the covers array was manually extended:
//     snapshot-backed (spawn) static covers are restored exactly, while manually-pushed
//     covers (no spawn entry) persist untouched — the documented contract.
{
  C.resetCovers();
  const tree = findTier('tree');
  C.damageCover(tree, 1, 'shell');                       // deterministic: tree -> fallen (tank_cover.js toTier)
  const manual = { x: 8000, y: 8000, w: 40, h: 20, angle: 0, tier: 'barricade', hp: 1 };
  C.covers.push(manual);
  C.damageCover(manual, 1, 'shell');                     // -> rubble
  C.resetCovers();
  const treeAfter = findTier('tree');
  ok(treeAfter && treeAfter.tier === 'tree' && treeAfter.hp === 1,
    'resetCovers restores static covers to snapshot after manual extension');
  ok(manual.tier === 'rubble' && manual.hp === 1,
    'manually-pushed cover without spawn persists across resetCovers (not restored)');
  C.covers.pop();
  C.resetCovers();
}

console.log(fails ? `\n${fails} failure(s).` : '\nAll extreme cover-system checks passed.');
process.exitCode = fails ? 1 : 0;
