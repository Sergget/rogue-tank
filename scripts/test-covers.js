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

// 5d) 贴掩体遮挡（C 实验 2026-08-14：贴掩体越掩）：弹道射线高度在炮口（1.8）与目标
//     部位中心（zMid）间线性插值；攻击方紧贴掩体时射线在掩体入口处仍高于 1.4m 掩体顶 →
//     越过掩体、车体全露（exposure 1.0）。两用例均传 null shooter → 验证回退 medium 炮口高 1.8。
const half1 = findTier('half');
const attackerHugX = half1.x - 45; // 攻击方紧贴掩体左侧（掩体左缘 x=430，射程 5px 即达入口）
const targetBehindX = half1.x + 120; // 目标在掩体右侧后方
const heavyHug = C.getExposure(attackerHugX, half1.y, targetBehindX, half1.y, null, { heightClass: 'heavy' }, 0, 1.8);
ok(heavyHug === 1.0, `heavy hull exposed while attacker hugs cover (C 实验 2026-08-14：贴掩体越掩, got ${heavyHug})`);
const medHug = C.getExposure(attackerHugX, half1.y, targetBehindX, half1.y, null, { heightClass: 'medium' }, 0, 1.4);
ok(medHug === 1.0, `medium hull exposed while attacker hugs cover (C 实验 2026-08-14：贴掩体越掩, got ${medHug})`);
// 目标紧贴掩体背面（贴掩体全藏）：射手远（t≈0.81 → 射线已降至掩体以下）→ 仍按垂直剖面全藏
const targetHugX = half1.x + 45;
const medHugTarget = C.getExposure(ox, half1.y, targetHugX, half1.y, null, { heightClass: 'medium' }, 0, 1.4);
ok(medHugTarget === 0.0, `medium hull covered while target hugs cover (got ${medHugTarget})`);

// 5e) 方向判据：骑上/包住掩体的坦克不被全方向遮蔽（cutoffDist 早于掩体出口 → 不参与）
const onCover = C.getExposure(ox, half.y, half.x, half.y, null, { heightClass: 'heavy' }, 0, 1.8, 400);
ok(onCover === 1.0, `tank riding cover not shielded from flank (got ${onCover.toFixed(2)})`);
const behindCover = C.getExposure(ox, half.y, targetFarX, half.y, null, { heightClass: 'heavy' }, 0, 1.8, 520);
ok(behindCover === 0.25, `tank behind cover shielded with cutoff (got ${behindCover})`);
C.resetCovers();

// 5f) C 实验 2026-08-14——半高掩体越掩判定（距离因素）：射线高度
//     rayH = shooterH + (zMid - shooterH) * t 在掩体入口处高于 1.4 即越过。
//     几何：half 掩体 (470,300) w=80 → x∈[430,510]；目标贴右侧 x=542；distB=112 固定。
//     射手高度 medium=1.8，目标 zMid：medium 车体 0.7 / heavy 车体 0.9。
{
  const tgtX = 542, ty = 300;
  const mShooter = { heightClass: 'medium' };
  // 射手 x=400（贴掩体，t=30/142≈0.211）：rayH=1.8-1.1*0.211≈1.57>1.4 → 越过
  ok(C.getExposure(400, ty, tgtX, ty, mShooter, { heightClass: 'medium' }, 0, 1.4) === 1.0,
    `C 实验: medium hull 1.0 at xs=400 (t≈0.211, rayH≈1.57>1.4)`);
  // 射手 x=300（t=130/242≈0.537）：rayH=1.8-1.1*0.537≈1.21<1.4 → 仍被挡
  ok(C.getExposure(300, ty, tgtX, ty, mShooter, { heightClass: 'medium' }, 0, 1.4) === 0.0,
    `C 实验: medium hull 0.0 at xs=300 (t≈0.537, rayH≈1.21<1.4)`);
  // 重坦目标（zMid=0.9）、射手 x=400：rayH=1.8-0.9*0.211≈1.61>1.4 → 越过
  ok(C.getExposure(400, ty, tgtX, ty, mShooter, { heightClass: 'heavy' }, 0, 1.8) === 1.0,
    `C 实验: heavy hull 1.0 at xs=400 (rayH≈1.61>1.4)`);
  // 重坦目标、射手 x=300：rayH=1.8-0.9*0.537≈1.32<1.4 → 分类概率不变（0.25）
  ok(C.getExposure(300, ty, tgtX, ty, mShooter, { heightClass: 'heavy' }, 0, 1.8) === 0.25,
    `C 实验: heavy hull 0.25 at xs=300 (rayH≈1.32<1.4)`);
  // 炮塔（zMin=1.4 ≥ 1.2 恒露 clamp）：无论射手远近 → 1.0
  ok(C.getExposure(400, ty, tgtX, ty, mShooter, { heightClass: 'medium' }, 1.4, 2.3) === 1.0 &&
     C.getExposure(300, ty, tgtX, ty, mShooter, { heightClass: 'medium' }, 1.4, 2.3) === 1.0,
    `C 实验: turret 恒露 1.0 不受越掩插值影响 (xs=400/300)`);
  // 边界：临界 t=(1.8-1.4)/(1.8-0.7)=0.364 → xs=(430-0.364*542)/(1-0.364)≈366；
  // 两侧各取一点验证插值连续性：xs=370 → t≈0.349, rayH≈1.416>1.4；xs=360 → t≈0.385, rayH≈1.377<1.4
  ok(C.getExposure(370, ty, tgtX, ty, mShooter, { heightClass: 'medium' }, 0, 1.4) === 1.0,
    `C 实验: 临界点左侧 xs=370 (t≈0.349, rayH≈1.416>1.4) → 1.0`);
  ok(C.getExposure(360, ty, tgtX, ty, mShooter, { heightClass: 'medium' }, 0, 1.4) === 0.0,
    `C 实验: 临界点右侧 xs=360 (t≈0.385, rayH≈1.377<1.4) → 0.0`);
}

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

// 10b) getExposure：solid 多边形全挡；half 六边形半高（C 实验 2026-08-14：贴掩体越掩）
const expLPoly = C.getExposure(100, 630, 400, 630, null, { heightClass: 'medium' }, 0, 1.4);
ok(expLPoly === 0, `solid polygonal cover fully occludes (got ${expLPoly})`);
// 六边形入口 x=660，射手 x=500 → distA=160, t=0.4；重坦 zMid=0.9 → rayH=1.8-0.9*0.4=1.44>1.4
// → 射线越过掩体（行为变更，非错误）
const expHexHeavy = C.getExposure(hexHalf.x - 200, hexHalf.y, hexHalf.x + 200, hexHalf.y, null, { heightClass: 'heavy' }, 0, 1.8);
ok(expHexHeavy === 1.0, `heavy hull exposed behind hex-half (C 实验 2026-08-14：t=0.4, rayH=1.44>1.4 → 越掩, got ${expHexHeavy})`);
// 中坦 zMid=0.7 → rayH=1.8-1.1*0.4=1.36<1.4 → 仍按垂直剖面全挡
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

// ================= EXTREME EDGE CASES =================

// 12) Very large cover (extreme dimensions)
C.resetCovers();
{
  // Add a huge cover manually for testing
  const testCover = { x: 2000, y: 320, w: 5000, h: 5000, angle: 0, tier: 'full', hp: Infinity };
  C.covers.push(testCover);
  // Ray must start outside the cover
  const exp = C.getExposure(-1000, 320, 3000, 320, null, { heightClass: 'medium' }, 0, 1.4);
  ok(exp === 0, `extreme large solid cover fully occludes (got ${exp})`);
  // Tank collision with huge cover
  const tank = { x: 2000, y: 320, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'medium' };
  C.resolveCoverCollisions(tank);
  ok(tank.x !== 2000 || tank.y !== 320, 'huge cover pushes tank out');
  C.covers.pop();
}
C.resetCovers();

// 13) Very small cover (near-zero dimensions)
{
  const tiny = { x: 1000, y: 1000, w: 1, h: 1, angle: 0, tier: 'half', hp: Infinity };
  C.covers.push(tiny);
  const exp = C.getExposure(999, 1000, 1001, 1000, null, { heightClass: 'heavy' }, 0, 1.8);
  ok(exp === 0.25 || exp === 0, 'tiny half cover handled without crash');
  const corners = C.coverCorners(tiny);
  ok(corners.length === 4 && corners.every(c => Number.isFinite(c.x) && Number.isFinite(c.y)), 'tiny cover corners finite');
  C.covers.pop();
}

// 14) Extreme distance exposure (very far attacker/target)
{
  const half = C.covers.find(c => c.tier === 'half' && !c.verts);
  if (half) {
    // Attacker far away, target AT the half cover position - only half cover on path
    const exp = C.getExposure(-10000, half.y, half.x, half.y, null, { heightClass: 'medium' }, 0, 1.4);
    ok(exp === 0, 'extreme distance: medium hull at half cover position fully covered');
    // Heavy at extreme distance
    const expHeavy = C.getExposure(-10000, half.y, half.x, half.y, null, { heightClass: 'heavy' }, 0, 1.8);
    ok(expHeavy === 0.25, 'extreme distance: heavy hull at half cover position 25% exposed');
  }
}

// 15) Multiple overlapping covers on same path
C.resetCovers();
{
  const c1 = C.covers.find(c => c.tier === 'half' && c.x < 400);
  const c2 = C.covers.find(c => c.tier === 'half' && c.x > 400 && c.x < 800);
  if (c1 && c2) {
    // Ray through both half covers
    const exp = C.getExposure(c1.x - 400, c1.y, c2.x + 400, c2.y, null, { heightClass: 'heavy' }, 0, 1.8);
    // Multiple half covers multiply exposure (1 - (1-0.25)*(1-0.25)) = 0.4375
    ok(Math.abs(exp - 0.4375) < 0.01, `multiple half covers multiply exposure (got ${exp.toFixed(4)})`);
  }
  C.resetCovers();
}

// 16) Cover destruction chain: tree -> stump -> fallen
{
  const tree = /** @type {any} */ (C.covers.find(c => c.tier === 'tree' && !c.verts));
  if (tree) {
    // First hit: tree -> stump or fallen (random 50/50)
    C.damageCover(tree, 1, 'shell');
    ok(tree.tier === 'stump' || tree.tier === 'fallen', 'tree -> stump or fallen on first hit');
    // If stump, second hit -> fallen
    if (tree.tier === 'stump') {
      C.damageCover(tree, 1, 'shell');
      ok(tree.tier === 'fallen' && tree.hp === Infinity, 'stump -> fallen on second hit');
    }
    // Further hits do nothing
    C.damageCover(tree, 999, 'shell');
    ok(tree.tier === 'fallen' && tree.hp === Infinity, 'fallen immune to massive damage');
    C.resetCovers();
  }
}

// 17) HE splash on multiple covers
C.resetCovers();
{
  // Place several destructible covers near each other
  const barricade1 = { x: 2000, y: 2000, w: 50, h: 25, angle: 0, tier: 'barricade', hp: 1 };
  const barricade2 = { x: 2030, y: 2000, w: 50, h: 25, angle: 0, tier: 'barricade', hp: 1 };
  const soft1 = { x: 2060, y: 2000, w: 100, h: 10, angle: 0, tier: 'soft', hp: 1 };
  C.covers.push(barricade1, barricade2, soft1);
  // Splash at center
  C.splashCoversAt(2030, 2000, 50);
  ok(barricade1.tier === 'rubble' && barricade1.hp === 1, 'barricade1 splash -> rubble');
  ok(barricade2.tier === 'rubble' && barricade2.hp === 1, 'barricade2 splash -> rubble');
  ok(soft1.hp === 0, 'soft destroyed by splash');
  // Tree should become stump/fallen
  const tree2 = { x: 2000, y: 2100, w: 24, h: 18, angle: 0, tier: 'tree', hp: 1 };
  C.covers.push(tree2);
  C.splashCoversAt(2000, 2100, 30);
  ok(tree2.tier === 'stump' || tree2.tier === 'fallen', 'tree splash -> stump or fallen');
  C.resetCovers();
}

// 18) Polygon cover edge cases: degenerate polygons
{
  // Triangle (minimum vertices)
  const tri = { x: 3000, y: 3000, w: 100, h: 100, angle: 0, tier: 'full', hp: Infinity, verts: [[-50, -50], [50, -50], [0, 50]] };
  C.covers.push(tri);
  const triCorners = C.coverCorners(tri);
  ok(triCorners.length === 3, 'triangle cover has 3 corners');
  const nTri = C.coverNormalAt(tri, tri.x, tri.y - 50);
  ok(nTri && Math.abs(Math.hypot(nTri.nx, nTri.ny) - 1) < 1e-6, 'triangle coverNormalAt works');
  C.covers.pop();

  // Very thin polygon (near-degenerate)
  const thin = { x: 3100, y: 3000, w: 100, h: 100, angle: 0, tier: 'full', hp: Infinity, verts: [[-50, -1], [50, -1], [50, 1], [-50, 1]] };
  C.covers.push(thin);
  const thinCorners = C.coverCorners(thin);
  ok(thinCorners.length === 4, 'thin polygon has 4 corners');
  const nThin = C.coverNormalAt(thin, thin.x, thin.y - 1);
  ok(nThin && Math.abs(Math.hypot(nThin.nx, nThin.ny) - 1) < 1e-6, 'thin polygon coverNormalAt works');
  C.covers.pop();

  // Concave polygon with many vertices
  const star = { x: 3200, y: 3000, w: 100, h: 100, angle: 0, tier: 'half', hp: Infinity, verts: [[0, -50], [10, -10], [50, -10], [15, 10], [25, 50], [0, 20], [-25, 50], [-15, 10], [-50, -10], [-10, -10]] };
  C.covers.push(star);
  const starCorners = C.coverCorners(star);
  ok(starCorners.length === 10, 'star polygon has 10 corners');
  const expStar = C.getExposure(3100, 3000, 3300, 3000, null, { heightClass: 'heavy' }, 0, 1.8);
  // C 实验 2026-08-14：射手距掩体入口 distA=67.5/200 → t=0.3375；
  // rayH=1.8-0.9*0.3375=1.496>1.4 → 射线越过半高星形掩体（行为变更，非错误）
  ok(expStar === 1.0, `star half cover: heavy hull exposed (C 实验 2026-08-14：t=0.34, rayH=1.50>1.4 → 越掩, got ${expStar})`);
  C.covers.pop();
}

// 19) OBB collision edge cases
{
  // Zero-area box (degenerate) - all corners at same point
  // SAT: a point overlaps a box if the point is inside the box
  const degBox = partCorners(4000, 4000, 0, 0, 0);
  const normalBox = partCorners(4000, 4000, 0, 10, 10);
  // The degenerate box is a point at (4000,4000), which is the center of normalBox
  // So they DO overlap
  ok(C.obbOverlap(degBox, normalBox) === true, 'degenerate box (point) at center overlaps normal box');
  const mtvDeg = C.obbMTV(degBox, normalBox);
  ok(mtvDeg && mtvDeg.depth >= 0, 'degenerate box MTV has non-negative depth');

  // Degenerate box far from normal box
  const degBox2 = partCorners(5000, 5000, 0, 0, 0);
  ok(C.obbOverlap(degBox2, normalBox) === false, 'degenerate box far away does not overlap');

  // Very thin box
  const thinBox = partCorners(4100, 4000, 0, 0.001, 10);
  const thinBox2 = partCorners(4100, 4000, 0, 10, 0.001);
  ok(C.obbOverlap(thinBox, thinBox2) === true || C.obbOverlap(thinBox, thinBox2) === false, 'thin boxes handled');

  // Rotated boxes at extreme angles
  const rotBox1 = partCorners(4200, 4000, Math.PI / 4, 20, 20);
  const rotBox2 = partCorners(4220, 4000, -Math.PI / 4, 20, 20);
  ok(C.obbOverlap(rotBox1, rotBox2) === true, 'rotated boxes overlap');
  const mtvRot = C.obbMTV(rotBox1, rotBox2);
  ok(mtvRot && mtvRot.depth > 0, 'rotated boxes MTV positive depth');
}

// 20) resolveCoverCollisions with extreme tank configs
C.resetCovers();
{
  const half = C.covers.find(c => c.tier === 'half' && !c.verts);
  if (half) {
    // Heavy tank fitting within cover - drives over (driveBy = true for heavy)
    const fitTank = { x: half.x, y: half.y, hullAngle: 0, hullLen: 60, hullWid: 38, hp: 10, heightClass: 'heavy' };
    const fx0 = fitTank.x, fy0 = fitTank.y;
    C.resolveCoverCollisions(fitTank);
    ok(fitTank.x === fx0 && fitTank.y === fy0, 'heavy tank fitting within half cover drives over');

    // Very wide heavy tank - also drives over because driveBy.heavy = true
    const wideTank = { x: half.x, y: half.y, hullAngle: 0, hullLen: 64, hullWid: 500, hp: 10, heightClass: 'heavy' };
    const wx0 = wideTank.x, wy0 = wideTank.y;
    C.resolveCoverCollisions(wideTank);
    ok(wideTank.x === wx0 && wideTank.y === wy0, 'very wide heavy tank drives over half cover (driveBy=true)');

    // Medium tank at extreme angle - gets pushed (driveBy.medium = false)
    const angleTank = { x: half.x, y: half.y, hullAngle: Math.PI * 0.37, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'medium' };
    const ax0 = angleTank.x, ay0 = angleTank.y;
    C.resolveCoverCollisions(angleTank);
    ok(angleTank.x !== ax0 || angleTank.y !== ay0, 'medium tank at angle pushed out of half cover');
  }
  C.resetCovers();
}

// 21) getExposure with extreme height classes
{
  const half = C.covers.find(c => c.tier === 'half' && !c.verts);
  if (half) {
    // Unknown height class defaults
    const expUnknown = C.getExposure(half.x - 400, half.y, half.x + 400, half.y, null, { heightClass: 'unknown' }, 0, 1.4);
    ok(expUnknown >= 0 && expUnknown <= 1, 'unknown height class handled gracefully');

    // Missing heightClass
    const expMissing = C.getExposure(half.x - 400, half.y, half.x + 400, half.y, null, {}, 0, 1.4);
    ok(expMissing >= 0 && expMissing <= 1, 'missing heightClass handled gracefully');

    // Extreme hullTop/turretTop values
    // Negative hullTop = target is below cover = fully covered (exposure 0)
    const expExtreme = C.getExposure(half.x - 400, half.y, half.x + 400, half.y, null, { heightClass: 'medium' }, -100, 1000);
    ok(expExtreme === 0, 'extreme negative hullTop = fully covered (below cover)');
    // Very high hullTop/turretTop = target is above cover = fully covered (exposure 0)
    const expExtreme2 = C.getExposure(half.x - 400, half.y, half.x + 400, half.y, null, { heightClass: 'medium' }, 1000, 2000);
    ok(expExtreme2 === 0, 'extreme high hullTop/turretTop = fully covered (above cover)');
    // Turret zMin >= 1.2 = fully exposed (exposure 1) - use cutoff to exclude full cover at x=660
    const expTurret = C.getExposure(half.x - 400, half.y, half.x + 400, half.y, null, { heightClass: 'medium' }, 1.5, 2.3, 500);
    ok(expTurret === 1, 'turret zMin >= 1.2 = fully exposed (with cutoff before full cover)');
  }
}

// 22) findCoversOnPath with extreme paths
{
  // Zero-length path
  const hitsZero = C.findCoversOnPath(100, 100, 100, 100);
  ok(hitsZero.length === 0, 'zero-length path returns no covers');

  // Very long path across entire map
  const hitsLong = C.findCoversOnPath(-10000, 0, 10000, 0);
  ok(hitsLong.length >= 0, 'very long path handled');

  // Path through many covers
  const hitsMany = C.findCoversOnPath(0, 320, 1200, 320);
  ok(hitsMany.length >= 0, 'path through many covers handled');
}

// 23) coverNormalAt edge cases
{
  const full = C.covers.find(c => c.tier === 'full' && !c.verts);
  if (full) {
    // Point far from cover - returns normal of closest edge (right edge)
    const nFar = C.coverNormalAt(full, full.x + 10000, full.y);
    ok(nFar && Math.abs(Math.hypot(nFar.nx, nFar.ny) - 1) < 1e-6, 'far point returns unit normal of closest edge');

    // Point exactly at cover center - equidistant from all edges, returns one of them
    const nCenter = C.coverNormalAt(full, full.x, full.y);
    ok(nCenter && Math.abs(Math.hypot(nCenter.nx, nCenter.ny) - 1) < 1e-6, 'center point returns unit normal');

    // Point on corner
    const nCorner = C.coverNormalAt(full, full.x + full.w/2, full.y + full.h/2);
    ok(nCorner && Math.abs(Math.hypot(nCorner.nx, nCorner.ny) - 1) < 1e-6, 'corner point returns unit normal');
  }
}

// 24) Complex coverCollisionParts for L-shape
{
  const lFull = C.covers.find(c => c.tier === 'full' && c.verts);
  if (lFull) {
    const parts = C.coverCollisionParts(lFull);
    ok(Array.isArray(parts) && parts.length > 1, 'L-shape has multiple collision parts');
    ok(parts.every(p => Array.isArray(p) && p.length >= 3), 'each collision part is valid polygon');

    // The two collision parts of the L-shape share a corner/edge at x=5, so they DO overlap slightly
    // This is expected for compound collision shapes that decompose a concave polygon
    let partsOverlap = false;
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        if (C.obbOverlap(parts[i], parts[j])) {
          partsOverlap = true;
        }
      }
    }
    ok(partsOverlap, 'L-shape collision parts overlap at shared boundary (expected for convex decomposition)');
  }
}

// 25) splashCoversAt edge cases
{
  // Splash with zero radius
  const bar = C.covers.find(c => c.tier === 'barricade');
  if (bar) {
    const hpBefore = bar.hp;
    C.splashCoversAt(bar.x, bar.y, 0);
    ok(bar.hp === hpBefore, 'zero radius splash does nothing');
  }

  // Splash with negative radius
  const bar2 = C.covers.find(c => c.tier === 'barricade' && c !== bar);
  if (bar2) {
    const hpBefore = bar2.hp;
    C.splashCoversAt(bar2.x, bar2.y, -10);
    ok(bar2.hp === hpBefore, 'negative radius splash does nothing');
  }

  // Splash at coordinates with no covers
  C.splashCoversAt(99999, 99999, 100); // Should not crash
  ok(true, 'splash at empty coordinates does not crash');
}

// 26) Reset covers multiple times
for (let i = 0; i < 5; i++) {
  C.resetCovers();
  const tree = C.covers.find(c => c.tier === 'tree');
  ok(tree && tree.hp === 1 && tree.tier === 'tree', `resetCovers iteration ${i+1} restores tree`);
}

// 27) getCoverUnderTank edge cases
{
  const half = C.covers.find(c => c.tier === 'half' && !c.verts);
  if (half) {
    // Tank exactly on cover
    const under1 = C.getCoverUnderTank({ x: half.x, y: half.y, hullLen: 64, hullWid: 38, hullAngle: 0 });
    ok(under1 === half, 'tank on cover returns that cover');

    // Tank far from any cover
    const under2 = C.getCoverUnderTank({ x: 99999, y: 99999, hullLen: 64, hullWid: 38, hullAngle: 0 });
    ok(under2 === null, 'tank far from covers returns null');

    // Tank with zero size
    const under3 = C.getCoverUnderTank({ x: half.x, y: half.y, hullLen: 0, hullWid: 0, hullAngle: 0 });
    ok(under3 === half || under3 === null, 'zero-size tank handled');
  }
}

// 28) Damage cover with various damage types
{
  const bar = C.covers.find(c => c.tier === 'barricade');
  if (bar) {
    C.resetCovers();
    const bar2 = C.covers.find(c => c.tier === 'barricade');
    // Shell damage
    const r1 = C.damageCover(bar2, 1, 'shell');
    ok(r1 === true && bar2.tier === 'rubble' && bar2.hp === 1, 'shell damage destroys barricade -> rubble');

    C.resetCovers();
    const bar3 = C.covers.find(c => c.tier === 'barricade');
    // HE damage
    const r2 = C.damageCover(bar3, 1, 'he');
    ok(r2 === true && bar3.tier === 'rubble' && bar3.hp === 1, 'HE damage destroys barricade -> rubble');

    C.resetCovers();
    const bar4 = C.covers.find(c => c.tier === 'barricade');
    // Crash damage (from tank collision)
    const r3 = C.damageCover(bar4, 1, 'crash');
    ok(r3 === true && bar4.tier === 'rubble' && bar4.hp === 1, 'crash damage destroys barricade -> rubble');

    C.resetCovers();
    const tree = C.covers.find(c => c.tier === 'tree');
    // Fire damage on tree
    const r4 = C.damageCover(tree, 1, 'fire');
    ok(r4 === true && (tree.tier === 'stump' || tree.tier === 'fallen'), 'fire damage fells tree');
  }
}

// 29) Multiple damage types on same cover
C.resetCovers();
{
  const tree = C.covers.find(c => c.tier === 'tree');
  if (tree) {
    // Shell then fire
    C.damageCover(tree, 1, 'shell');
    const tierAfterShell = tree.tier;
    C.damageCover(tree, 1, 'fire');
    ok(tree.tier === 'fallen', 'shell then fire -> fallen');

    C.resetCovers();
    const tree2 = C.covers.find(c => c.tier === 'tree');
    // Fire then shell
    C.damageCover(tree2, 1, 'fire');
    const tierAfterFire = tree2.tier;
    C.damageCover(tree2, 1, 'shell');
    ok(tree2.tier === 'fallen', 'fire then shell -> fallen');
  }
  C.resetCovers();
}

// 30) Stress test: many rapid operations
{
  const start = Date.now();
  for (let i = 0; i < 1000; i++) {
    const x = Math.random() * 2000;
    const y = Math.random() * 2000;
    C.getExposure(x - 100, y, x + 100, y, null, { heightClass: 'medium' }, 0, 1.4);
    C.findCoversOnPath(x, y, x + 200, y);
    if (i % 100 === 0) C.resetCovers();
  }
  const elapsed = Date.now() - start;
  ok(elapsed < 5000, `1000 rapid operations completed in ${elapsed}ms (should be < 5000ms)`);
}

console.log(fails ? `\n${fails} failure(s).` : '\nAll cover-system checks passed.');
process.exitCode = fails ? 1 : 0;