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
global.polyCorners = require('../js/tank_geometry.js').polyCorners; // coverCorners 依赖（复杂多边形）
const C = require('../js/tank_cover.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function findTier(tier) { return C.covers.find(x => x.tier === tier); }

// 1) initial hp derived from tier
ok(findTier('tree').hp === 1, 'tree derives hp from tier (1)');
ok(findTier('barricade').hp === 1, 'barricade hp=1');
ok(findTier('full').hp === Infinity, 'full cover hp=Infinity');
ok(findTier('half').hp === Infinity, 'half cover hp=Infinity');

// 2) damage/destroy + felled-to-fallen chain (1 发伐倒 → 倒树)
const tree = findTier('tree');
C.damageCover(tree, 1, 'shell');
ok(tree.tier === 'fallen' && tree.hp === Infinity, `tree felled in 1 shot -> fallen residue (got ${tree.tier}/${tree.hp})`);
const FT = C.COVER_TIERS.fallen;
ok(FT.vision === true && FT.mode === 'none' && FT.crushable === false && FT.hp === Infinity,
  'fallen tier: vision occludes / shells pass (mode none) / not crushable / not re-destructible');
ok(tree.w === 24*2.4 && tree.h === Math.max(8, 18*0.5), `fallen residue uses residueW/residueH sizing (got ${tree.w}x${tree.h})`);
ok(!C.damageCover(tree, 1, 'shell') && tree.hp === Infinity && tree.tier === 'fallen',
  'fallen tree immune to further damage (hp=Infinity)');
// 弹穿透：穿过倒树不遮挡（树冠仅遮挡视线，mode none）
const expFallen = C.getExposure(tree.x - 200, tree.y, tree.x + 200, tree.y, null, { heightClass: 'medium' }, 0, 1.4);
ok(expFallen > 0.5, `shell passes through fallen tree (exposure=${expFallen.toFixed(2)})`);
// 坦克压过倒树：不推不毁（crushable false, mode none）
const fTank = { x: tree.x, y: tree.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'medium' };
const fTx = fTank.x, fTy = fTank.y;
C.resolveCoverCollisions(fTank);
ok(tree.tier === 'fallen' && tree.hp === Infinity && fTank.x === fTx && fTank.y === fTy,
  'tank drives over fallen tree (no push, no crush)');
C.resetCovers();
ok(findTier('tree').hp === 1 && findTier('tree').tier === 'tree', 'resetCovers restores tree (tier/hp)');
ok(findTier('fallen') === undefined, 'fallen is transient residue only (no static instance)');

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

// 5c) 纯垂直剖面掩体模型：重坦/中坦车体与炮塔在半高掩体后的露出比例
const ox = half.x - 400;
const targetFarX = half.x + 120; // 掩体在 (half.x, half.y)，攻击方在 half.x-400，目标在 half.x+120：目标离掩体近
const heavyHullFar = C.getExposure(ox, half.y, targetFarX, half.y, null, { heightClass: 'heavy' }, 0, 1.8);
ok(heavyHullFar === 0.25, `heavy hull exposes 25% behind half cover (got ${heavyHullFar})`);

const medHullFar = C.getExposure(ox, half.y, targetFarX, half.y, null, { heightClass: 'medium' }, 0, 1.4);
ok(medHullFar === 0.0, `medium hull exposes 0% behind half cover (got ${medHullFar})`);

const turretExposed = C.getExposure(ox, half.y, targetFarX, half.y, null, { heightClass: 'medium' }, 1.4, 2.3);
ok(turretExposed === 1.0, `turret is 100% exposed behind half cover (got ${turretExposed})`);

// 5d) 贴掩体遮挡（用户场景：弹道逐射线实时计算 → 只按垂直剖面判定，攻击方贴近与否无影响）：
//     攻击方紧贴掩体一侧，被攻击方在掩体另一侧 → 车体仍被完全遮挡（旧"距离压制"规则曾被判定为无掩体）
const half1 = findTier('half');
const attackerHugX = half1.x - 45; // 攻击方紧贴掩体左侧
const targetBehindX = half1.x + 120; // 目标在掩体右侧后方
const heavyHug = C.getExposure(attackerHugX, half1.y, targetBehindX, half1.y, null, { heightClass: 'heavy' }, 0, 1.8);
ok(heavyHug === 0.25, `heavy hull covered while attacker hugs cover (got ${heavyHug})`);
const medHug = C.getExposure(attackerHugX, half1.y, targetBehindX, half1.y, null, { heightClass: 'medium' }, 0, 1.4);
ok(medHug === 0.0, `medium hull covered while attacker hugs cover (got ${medHug})`);
// 目标紧贴掩体背面（贴掩体全藏）：同样按垂直剖面，不被误判为骑掩体
const targetHugX = half1.x + 45;
const medHugTarget = C.getExposure(ox, half1.y, targetHugX, half1.y, null, { heightClass: 'medium' }, 0, 1.4);
ok(medHugTarget === 0.0, `medium hull covered while target hugs cover (got ${medHugTarget})`);

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
ok(findTier('tree').hp === 1 && findTier('barricade').hp === 1 && findTier('barricade').tier === 'barricade',
  'resetCovers restores hp/tier for all elements');

// 10) 复杂多边形掩体（需求2）：verts 顶点数组承载任意多边形，全部角点计算走 coverCorners
const lFull  = C.covers.find(c => c.tier === 'full' && c.verts);   // L 形凹多边形全高（x:250 y:650）
const hexHalf = C.covers.find(c => c.tier === 'half' && c.verts);  // 六边形半高（x:700 y:650）
ok(!!lFull && !!hexHalf, 'polygonal covers present (L-full + hex-half)');
const lCorners = C.coverCorners(lFull);
const hexCorners = C.coverCorners(hexHalf);
ok(lCorners.length === 6 && hexCorners.length === 6, 'coverCorners returns N corners for polygonal covers');
ok(C.coverCorners(findTier('barricade')).length === 4, 'coverCorners falls back to 4 rect corners');

// 10a) findCoversOnPath：穿过实体区命中、穿过凹陷缺口不命中
//      L 形：实体区 y=630（x∈205..295 全宽），凹槽 x∈255..295, y∈640..680（右侧开口）
let lhits = C.findCoversOnPath(150, 630, 350, 630);
ok(lhits.length === 1 && lhits[0].cover === lFull, 'ray through L body hits the polygonal cover');
let vhits = C.findCoversOnPath(270, 650, 280, 670); // 完全落在凹槽缺口内
ok(vhits.length === 0, 'ray inside L concavity misses (no edge crossing)');

// 10b) getExposure：solid 多边形全挡；half 六边形半高行为不变
const expLPoly = C.getExposure(100, 630, 400, 630, null, { heightClass: 'medium' }, 0, 1.4);
ok(expLPoly === 0, `solid polygonal cover fully occludes (got ${expLPoly})`);
const expHexHeavy = C.getExposure(hexHalf.x - 200, hexHalf.y, hexHalf.x + 200, hexHalf.y, null, { heightClass: 'heavy' }, 0, 1.8);
ok(expHexHeavy === 0.25, `heavy hull exposes 25% behind hex-half (got ${expHexHeavy})`);
const expHexMed = C.getExposure(hexHalf.x - 200, hexHalf.y, hexHalf.x + 200, hexHalf.y, null, { heightClass: 'medium' }, 0, 1.4);
ok(expHexMed === 0.0, `medium hull exposes 0% behind hex-half (got ${expHexMed})`);
const expHexTurret = C.getExposure(hexHalf.x - 200, hexHalf.y, hexHalf.x + 200, hexHalf.y, null, { heightClass: 'medium' }, 1.4, 2.3);
ok(expHexTurret === 1.0, `turret 100% exposed behind hex-half (got ${expHexTurret})`);

// 10c) coverNormalAt：多边形边上取点返回单位法线
const nHex = C.coverNormalAt(hexHalf, hexHalf.x, hexHalf.y - 25); // 六边形顶边中点（局部 y=-25）
ok(nHex && Math.abs(Math.hypot(nHex.nx, nHex.ny) - 1) < 1e-6, 'coverNormalAt on polygon edge returns unit normal');

// 10d) resolveCoverCollisions：solid 多边形推出坦克；half 多边形 driveBy 行为不变
const tLPoly = { x: lFull.x, y: lFull.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'medium' };
C.resolveCoverCollisions(tLPoly);
ok(tLPoly.x !== lFull.x || tLPoly.y !== lFull.y, 'solid polygonal cover pushes tank out');
const tHexHeavy = { x: hexHalf.x, y: hexHalf.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'heavy' };
const hx0 = tHexHeavy.x, hy0 = tHexHeavy.y;
C.resolveCoverCollisions(tHexHeavy);
ok(tHexHeavy.x === hx0 && tHexHeavy.y === hy0, 'hex-half: heavy tank drives over (no push)');
const tHexMed = { x: hexHalf.x, y: hexHalf.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'medium' };
C.resolveCoverCollisions(tHexMed);
ok(tHexMed.x !== hexHalf.x || tHexMed.y !== hexHalf.y, 'hex-half: medium tank pushed out');

// 10e) obbOverlap / obbMTV：任意顶点数仍正确（SAT 对顶点数无假设）
ok(C.obbOverlap(lCorners, hexCorners) === false, 'separated 6-gons do not overlap');
const farBox = partCorners(100, 100, 0, 20, 20);
ok(C.obbOverlap(lCorners, farBox) === false, 'far-away box vs L no overlap');
const overBox = partCorners(lFull.x, lFull.y, 0, 20, 20); // 40x40 盒骑在 L 实体区上
ok(C.obbOverlap(lCorners, overBox) === true, 'box overlapping L solid region overlaps (SAT)');
const mtvPoly = C.obbMTV(overBox, lCorners);
ok(mtvPoly && mtvPoly.depth > 0, 'obbMTV resolves 6-gon collision with positive depth');

// 11) L-shaped cover compound convex collision test
const pocketX = 275, pocketY = 660;
const pocketBox = partCorners(pocketX, pocketY, 0, 5, 5);
// Verify that the pocket box overlaps the old full/convex hull coverCorners
ok(C.obbOverlap(pocketBox, lCorners) === true, 'pocket box overlaps full convex hull of L cover');
// Verify that the pocket box does not overlap any of the compound collision parts
const collisionParts = C.coverCollisionParts(lFull);
let overlapsAny = false;
for (const part of collisionParts) {
  if (C.obbOverlap(pocketBox, part)) {
    overlapsAny = true;
  }
}
ok(overlapsAny === false, 'pocket box does not overlap any of the compound collision parts of L cover');

// Verify tank is not blocked inside the pocket (at pocketX, pocketY)
const pocketTank = { x: pocketX, y: pocketY, hullAngle: 0, hullLen: 10, hullWid: 10, hp: 10, heightClass: 'medium' };
const px0 = pocketTank.x, py0 = pocketTank.y;
C.resolveCoverCollisions(pocketTank);
ok(pocketTank.x === px0 && pocketTank.y === py0, 'tank is not blocked/pushed inside L-shaped cover concave pocket');

console.log(fails ? `\n${fails} failure(s).` : '\nAll cover-system checks passed.');
process.exitCode = fails ? 1 : 0;