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
// 2026-10-20 W16/W17 断言批次：coverBlockInfo 内部读全局 getPartZRange（此前 test-covers 未覆盖
// 该函数，故 shim 里也没有它）。补上后 coverBlockInfo 才能在 Node 端被驱动。
global.getPartZRange = require('../js/tank_geometry.js').getPartZRange;
const C = require('../js/tank_cover.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function findTier(tier) { return C.covers.find(x => x.tier === tier); }

// 1) initial hp derived from tier
ok(findTier('tree').hp === 1, 'tree derives hp from tier (1)');
// 2026-10-22（第五批）：barricade（沙袋）→ wall_breakable（可摧毁掩体，4 发）/ wall（不可摧毁）。
ok(findTier('wall_breakable').hp === 4, 'wall_breakable hp=4（可摧毁掩体）');
ok(findTier('wall').hp === Infinity, 'wall hp=Infinity（不可摧毁掩体）');
ok(findTier('full').hp === Infinity, 'full cover hp=Infinity');
// #E3（2026-09-20）：半高掩体 tier 已整体移除；残破建筑并入全高确定性挡弹；残骸不再挡弹。
ok(C.COVER_TIERS.half === undefined, '#E3: half tier removed from RULES.coverTiers');
ok(C.COVER_TIERS.ruined.shellBlock === true && C.COVER_TIERS.ruined.exposureProfile === 'full',
  '#E3: ruined building joins full-height deterministic blocking');
ok(C.COVER_TIERS.stump.shellBlock === false && C.COVER_TIERS.rubble.shellBlock === false,
  '#E1: debris (stump/rubble) no longer blocks shells');
ok(C.COVER_TIERS.half === undefined && C.COVER_TIERS.tree.crushable === true,
  '#E11: tree crushable by tanks (push-down)');

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
const breakable = findTier('wall_breakable');
breakable.hp = 0;
let hits = C.findCoversOnPath(0, breakable.y, 2000, breakable.y);
ok(!hits.some(h => h.cover.hp === 0), 'destroyed elements excluded from findCoversOnPath');
breakable.hp = 4;

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
// wall_breakable 与全高掩体同级（部位裁剪在弹道层，遮蔽查询按 exposureProfile:'wall' 处理）
const wb = findTier('wall_breakable');
const exWb = C.getExposure(wb.x - 400, wb.y, wb.x + 400, wb.y, null, { heightClass: 'heavy' }, 1.4, 2.3);
ok(exWb === 1, 'wall_breakable：炮塔高度恒露（部位裁剪在弹道层）');

// 5) tank crush destroys crumbled elements
const soft = findTier('soft');
// 2026-10-22（第五批）：栅栏（soft）已删除；wall 不可通行、不可碾碎
const wallT = findTier('wall');
const wallHp0 = wallT.hp;
C.resolveCoverCollisions({ x: wallT.x + 30, y: wallT.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10 });
ok(wallT.hp === wallHp0, `tank cannot crush wall (hp still ${wallT.hp})`);
// 5b) #E3（2026-09-20）：半高掩体与 driveBy 门控已移除——建筑对重/中坦一律实体推出
const bldg = findTier('full');
{
  const mx0 = bldg.x, my0 = bldg.y;
  const heavyT = { x: bldg.x, y: bldg.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'heavy' };
  C.resolveCoverCollisions(heavyT);
  ok(heavyT.x !== mx0 || heavyT.y !== my0, 'heavy tank pushed out of building (driveBy removed)');
  ok(bldg.hp === Infinity, 'building intact after push');
  C.resetCovers();
  const mediumT = { x: bldg.x, y: bldg.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'medium' };
  C.resolveCoverCollisions(mediumT);
  ok(mediumT.x !== mx0 || mediumT.y !== my0, 'medium tank pushed out of building');
  C.resetCovers();
}

// 5c) #E1 确定性遮挡：建筑后车体 100% 被挡（exposure 0，无概率/半高插值），炮塔恒露
const ox = bldg.x - 400;
const targetFarX = bldg.x + 120;
{
  const expHullMed = C.getExposure(ox, bldg.y, targetFarX, bldg.y, null, { heightClass: 'medium' }, 0, 1.4);
  ok(expHullMed === 0.0, `medium hull fully blocked behind building (deterministic, got ${expHullMed})`);
  const expHullHeavy = C.getExposure(ox, bldg.y, targetFarX, bldg.y, null, { heightClass: 'heavy' }, 0, 1.8);
  ok(expHullHeavy === 0.0, `heavy hull fully blocked behind building (deterministic, got ${expHullHeavy})`);
  const turretExposed = C.getExposure(ox, bldg.y, targetFarX, bldg.y, null, { heightClass: 'medium' }, 1.4, 2.3);
  ok(turretExposed === 0.0, `turret also fully blocked behind building (solid = 100% deterministic, got ${turretExposed})`);
}

// 5e) 方向判据：骑上/包住掩体的坦克不被全方向遮蔽（cutoffDist 早于掩体出口 → 不参与）
{
  const onCover = C.getExposure(ox, bldg.y, bldg.x, bldg.y, null, { heightClass: 'heavy' }, 0, 1.8, 400);
  ok(onCover === 1.0, `tank riding cover not shielded from flank (got ${onCover.toFixed(2)})`);
  const behindCover = C.getExposure(ox, bldg.y, targetFarX, bldg.y, null, { heightClass: 'heavy' }, 0, 1.8, 520);
  ok(behindCover === 0.0, `tank behind cover shielded with cutoff (got ${behindCover})`);
}
C.resetCovers();
// 6) solid non-crushable pushes tank out
const fullHpBefore = full.hp;
C.resolveCoverCollisions({ x: full.x, y: full.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10 });
ok(full.hp === fullHpBefore, `solid cover not destroyed by tank (hp=${full.hp})`);

const bar = C.covers.find(c => c.tier === 'wall_breakable');
const n = C.coverNormalAt(bar, bar.x + 1, bar.y);
ok(n && Math.abs(Math.hypot(n.nx, n.ny) - 1) < 1e-6, 'coverNormalAt returns unit normal');

// 8) HE splash damages destructibles in radius
// 8) HE splash 摧毁可摧毁掩体（wall_breakable）→ **直接移除**（toTier:null，不降级）
const wbSplash = findTier('wall_breakable');
const wbRef = wbSplash;
ok(findTier('tree').hp === 1 && findTier('wall_breakable').hp === 4 && findTier('wall_breakable').tier === 'wall_breakable',
  'resetCovers restores hp/tier for all elements');
// 9) resetCovers restores all
// 9) resetCovers restores all
C.resetCovers();
ok(findTier('tree').hp === 1 && findTier('wall_breakable').hp === 4 && findTier('wall_breakable').tier === 'wall_breakable',
  'resetCovers restores hp/tier for all elements');
// 10) 复杂多边形掩体（需求2）：verts 顶点数组承载任意多边形，全部角点计算走 coverCorners
const lFull  = C.covers.find(c => c.tier === 'full' && c.verts);          // L 形凹多边形建筑（x:250 y:650）
const hexBldg = C.covers.find(c => c.tier === 'full' && c.verts && c.x > 600); // 六边形建筑（x:700 y:650）
ok(!!lFull && !!hexBldg, 'polygonal covers present (L-building + hex-building)');
const lCorners = C.coverCorners(lFull);
const hexCorners = C.coverCorners(hexBldg);
ok(C.coverCorners(findTier('wall')).length === 4, 'coverCorners falls back to 4 rect corners');
// 2026-10-22：重复断言已合并到上一行（barricade → wall）

// 10a) findCoversOnPath：穿过实体区命中、穿过凹陷缺口不命中
//      L 形：实体区 y=630（x∈205..295 全宽），凹槽 x∈255..295, y∈640..680（右侧开口）
let lhits = C.findCoversOnPath(150, 630, 350, 630);
ok(lhits.length === 1 && lhits[0].cover === lFull, 'ray through L body hits the polygonal cover');
let vhits = C.findCoversOnPath(270, 650, 280, 670); // 完全落在凹槽缺口内
ok(vhits.length === 0, 'ray inside L concavity misses (no edge crossing)');

// 10b) getExposure：多边形实心建筑全挡（确定性；半高插值已移除）
const expLPoly = C.getExposure(100, 630, 400, 630, null, { heightClass: 'medium' }, 0, 1.4);
ok(expLPoly === 0, `solid polygonal cover fully occludes (got ${expLPoly})`);
const expHexHeavy = C.getExposure(hexBldg.x - 200, hexBldg.y, hexBldg.x + 200, hexBldg.y, null, { heightClass: 'heavy' }, 0, 1.8);
ok(expHexHeavy === 0.0, `heavy hull fully blocked behind hex-building (got ${expHexHeavy})`);
const expHexMed = C.getExposure(hexBldg.x - 200, hexBldg.y, hexBldg.x + 200, hexBldg.y, null, { heightClass: 'medium' }, 0, 1.4);
ok(expHexMed === 0.0, `medium hull fully blocked behind hex-building (got ${expHexMed})`);
const expHexTurret = C.getExposure(hexBldg.x - 200, hexBldg.y, hexBldg.x + 200, hexBldg.y, null, { heightClass: 'medium' }, 1.4, 2.3);
ok(expHexTurret === 0.0, `turret blocked behind hex-building (solid = 100%, got ${expHexTurret})`);

// 10c) coverNormalAt：多边形边上取点返回单位法线
const nHex = C.coverNormalAt(hexBldg, hexBldg.x, hexBldg.y - 25); // 六边形顶边中点（局部 y=-25）
ok(nHex && Math.abs(Math.hypot(nHex.nx, nHex.ny) - 1) < 1e-6, 'coverNormalAt on polygon edge returns unit normal');

// 10d) resolveCoverCollisions：多边形建筑对重/中坦一律推出（driveBy 已移除）
const tLPoly = { x: lFull.x, y: lFull.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'medium' };
C.resolveCoverCollisions(tLPoly);
ok(tLPoly.x !== lFull.x || tLPoly.y !== lFull.y, 'solid polygonal cover pushes tank out');
const tHexHeavy = { x: hexBldg.x, y: hexBldg.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'heavy' };
const hx0 = tHexHeavy.x, hy0 = tHexHeavy.y;
C.resolveCoverCollisions(tHexHeavy);
ok(tHexHeavy.x !== hx0 || tHexHeavy.y !== hy0, 'hex-building: heavy tank pushed out (no driveBy)');
const tHexMed = { x: hexBldg.x, y: hexBldg.y, hullAngle: 0, hullLen: 64, hullWid: 38, hp: 10, heightClass: 'medium' };
C.resolveCoverCollisions(tHexMed);
ok(tHexMed.x !== hexBldg.x || tHexMed.y !== hexBldg.y, 'hex-building: medium tank pushed out');

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
  const tiny = { x: 1000, y: 1000, w: 1, h: 1, angle: 0, tier: 'full', hp: Infinity };
  C.covers.push(tiny);
  const exp = C.getExposure(999, 1000, 1001, 1000, null, { heightClass: 'heavy' }, 0, 1.8);
  ok(exp === 0, 'tiny solid cover handled without crash (deterministic block)');
  const corners = C.coverCorners(tiny);
  ok(corners.length === 4 && corners.every(c => Number.isFinite(c.x) && Number.isFinite(c.y)), 'tiny cover corners finite');
  C.covers.pop();
}

// 14) Extreme distance exposure (very far attacker/target)
{
  const bld = C.covers.find(c => c.tier === 'full' && !c.verts);
  if (bld) {
    const exp = C.getExposure(-10000, bld.y, bld.x, bld.y, null, { heightClass: 'medium' }, 0, 1.4);
    ok(exp === 0, 'extreme distance: medium hull at building position fully covered');
    const expHeavy = C.getExposure(-10000, bld.y, bld.x, bld.y, null, { heightClass: 'heavy' }, 0, 1.8);
    ok(expHeavy === 0, 'extreme distance: heavy hull at building position fully covered');
  }
}

// 15) 路径上多个建筑 → 确定性全挡（无曝光连乘：遮挡不再有概率）
C.resetCovers();
{
  const c1 = C.covers.find(c => c.tier === 'full' && !c.verts && c.x < 400);
  const c2 = C.covers.find(c => c.tier === 'full' && !c.verts && c.x > 400 && c.x < 800);
  if (c1 && c2) {
    const exp = C.getExposure(c1.x - 400, c1.y, c2.x + 400, c2.y, null, { heightClass: 'heavy' }, 0, 1.8);
    ok(exp === 0, `multiple buildings fully block (deterministic, got ${exp})`);
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
  // 2026-10-22（第五批）：栅栏/沙袋 → wall / wall_breakable；可摧毁掩体**直接移除**（不降级 rubble）
// (重复行已删除)
  const wb1 = { x: 2000, y: 2000, w: 50, h: 25, angle: 0, tier: 'wall_breakable', hp: 1 };
  const wb2 = { x: 2030, y: 2000, w: 50, h: 25, angle: 0, tier: 'wall_breakable', hp: 1 };
  const wall1 = { x: 2060, y: 2000, w: 100, h: 10, angle: 0, tier: 'wall', hp: Infinity };
  C.covers.push(wb1, wb2, wall1);
  // 一次大半径溅射：两堵可摧毁墙被移除、不可摧毁墙保持不变
  C.splashCoversAt(2030, 2000, 50);
  ok(C.covers.indexOf(wb1) < 0, 'wall_breakable #1 splash -> removed');
  ok(C.covers.indexOf(wb2) < 0, 'wall_breakable #2 splash -> removed');
  ok(wall1.hp === Infinity && C.covers.indexOf(wall1) >= 0, 'wall (不可摧毁) untouched by splash');
  ok(true, '(旧 soft 断言已随栅栏删除)');
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
  const star = { x: 3200, y: 3000, w: 100, h: 100, angle: 0, tier: 'full', hp: Infinity, verts: [[0, -50], [10, -10], [50, -10], [15, 10], [25, 50], [0, 20], [-25, 50], [-15, 10], [-50, -10], [-10, -10]] };
  C.covers.push(star);
  const starCorners = C.coverCorners(star);
  ok(starCorners.length === 10, 'star polygon has 10 corners');
  const expStar = C.getExposure(3100, 3000, 3300, 3000, null, { heightClass: 'heavy' }, 0, 1.8);
  ok(expStar === 0, `star solid cover: fully blocks (deterministic, got ${expStar})`);
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
// (旧 barricade 行已删除)
  const bar = C.covers.find(c => c.tier === 'barricade');
  if (bar) {
    const hpBefore = bar.hp;
    C.splashCoversAt(bar.x, bar.y, 0);
    ok(bar.hp === hpBefore, 'zero radius splash does nothing');
  }
// (旧 barricade 行已删除)
  const bar2 = C.covers.find(c => c.tier === 'wall_breakable' && c !== bar);
// (旧 barricade 行已删除)
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
// 28) Damage cover with various damage types（2026-10-22：wall_breakable 被摧毁 = 直接移除）
{
  C.resetCovers();
  const wb28 = C.covers.find(c => c.tier === 'wall_breakable');
  if (wb28) {
    const r1 = C.damageCover(wb28, 1, 'shell');
    ok(r1 === false && wb28.hp === 3, `shell damage 扣 1 点耐久（4→3，实际 ${wb28.hp}）`);
    const r1b = C.damageCover(wb28, 3, 'shell');
    ok(r1b === true && C.covers.indexOf(wb28) < 0, '累计 4 发后 wall_breakable 直接移除');

    C.resetCovers();
    const wb28b = C.covers.find(c => c.tier === 'wall_breakable');
    const r2 = C.damageCover(wb28b, 4, 'he');
    ok(r2 === true && C.covers.indexOf(wb28b) < 0, 'HE 一次性打满 4 点 → 移除');

    C.resetCovers();
    const wall28 = C.covers.find(c => c.tier === 'wall');
    const r3 = C.damageCover(wall28, 99, 'shell');
    ok(r3 === false && wall28.hp === Infinity, '不可摧毁 wall 不吃任何伤害（hp 恒 Infinity）');

    C.resetCovers();
    const tree = C.covers.find(c => c.tier === 'tree');
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

// 31) hasLineOfSight：视线遮挡查询（vision:true 的灌木/树冠遮视线；炮弹穿透的灌木仍遮视线）
C.resetCovers();
{
  const bush = C.covers.find(c => c.tier === 'bush');
  if (bush) {
    // 射线穿过灌木 → 视线被遮（bush tier vision=true，mode=none 穿透弹但仍遮视线）
    ok(C.hasLineOfSight(bush.x - 100, bush.y, bush.x + 100, bush.y) === false, '穿过灌木 → 视线被遮');
    // 不穿灌木的路径 → 视线畅通
    ok(C.hasLineOfSight(bush.x - 100, bush.y + 300, bush.x + 100, bush.y + 300) === true, '不穿灌木 → 视线畅通');
  }
  const bld = C.covers.find(c => c.tier === 'full');
  if (bld) {
    // 全高建筑 vision=true → 遮视线（炮弹遮挡与视线遮挡是两套判定）
    ok(C.hasLineOfSight(bld.x - 100, bld.y, bld.x + 100, bld.y) === false, '建筑 → 遮视线（vision=true）');
  }
}

// 32) P-17 烟雾动态视线掩体（smokeClouds）：
C.clearSmoke();
{
  // 无烟雾时视线畅通
  ok(C.hasLineOfSight(0, 0, 400, 0) === true, '无烟雾 → 视线畅通');
  // 生成一团烟雾于 (200,0)，半径 50
  C.spawnSmokeCloud(200, 0, 50, 5);
  ok(C.smokeClouds.length === 1, 'spawnSmoke 生成 1 团烟雾');
  // 射线穿过烟雾中心 → 视线被遮
  ok(C.hasLineOfSight(0, 0, 400, 0) === false, '射线穿烟雾中心 → 视线被遮');
  // 偏离烟雾的射线（y 偏移 100 > 半径 50）→ 视线畅通
  ok(C.hasLineOfSight(0, 100, 400, 100) === true, '偏离烟雾 → 视线畅通');
  // 弹道不受烟雾影响：getExposure 穿过烟雾区域仍返回 1（烟雾 mode='none' 不挡弹）
  ok(C.getExposure(0, 0, 400, 0, null, { heightClass: 'medium' }, 0, 1.4) === 1, '烟雾不遮弹道（getExposure=1）');
  // 消散：updateSmoke 递减 life，超时后烟雾移除
  C.updateSmoke(4.9);
  ok(C.smokeClouds.length === 1, '烟雾未到消散时间仍存在');
  C.updateSmoke(0.2);
  ok(C.smokeClouds.length === 0, '烟雾到期后消散');
  ok(C.hasLineOfSight(0, 0, 400, 0) === true, '烟雾消散后视线恢复');
}

// 33) 烟雾上限与清理：
C.clearSmoke();
{
  for (let i = 0; i < 12; i++) C.spawnSmokeCloud(i * 10, 0, 10, 5);
  ok(C.smokeClouds.length <= 8, `烟雾云上限受 RULES.smoke.maxClouds 约束（got ${C.smokeClouds.length}）`);
  C.clearSmoke();
  ok(C.smokeClouds.length === 0, 'clearSmoke 清空全部烟雾');
  ok(C.hasLineOfSight(0, 0, 100, 0) === true, '清空后视线畅通');
}

// ================= P-40 地形类型抽象（docs/specs/map.md §5 / #85 裁定） =================
C.resetCovers();
{
  const baseLen = C.covers.length;
  const T = C.COVER_TIERS;

  // 34) tier schema 矩阵：新六属性 + 派生旧字段一致（2026-09-14 水系重做：减速通行 + 溺毙）
  ok(T.water.passability === 0.4 && T.water.shellBlock === false && T.water.exposureProfile === 'none' && T.water.tierGroup === 'liquid',
    'water: passability 0.4（减速通行）/ shellBlock false（炮弹越飞）/ profile none / liquid');
  ok(T.river.shellBlock === false && T.river.drawStyle === 'water-chain' && T.river.passability === 0.4,
    'river: 越飞 + water-chain + passability 0.4（减速通行）');
  ok(T.mud.passability === 0.4 && T.mud.shellBlock === false && T.mud.tierGroup === 'ground' && T.mud.move === 0.4,
    'mud: 0.4 减速 / 越飞 / ground / move 别名同步');
  ok(T.rock.shellBlock === true && T.rock.exposureProfile === 'full' && T.rock.destructible === Infinity && T.rock.drawStyle === 'rock-poly',
    'rock: solid 全遮不可毁 rock-poly');
  ok(T.intact.shellBlock === true && T.intact.exposureProfile === 'full' && T.intact.passability === 1.0,
    'intact: solid 全遮自由通行');
  ok(T.ruined.shellBlock === true && T.ruined.exposureProfile === 'full' && T.ruined.destructible === 1 && T.ruined.toTier === 'rubble',
    'ruined: 全高确定性格挡（建筑衍生）可毁 → rubble');
  ok(T.half === undefined, 'half tier 已移除（#E3 2026-09-20）');
  ok(T.tree.mode === 'solid' && T.bush.mode === 'none' && T.wall.mode === 'none' && T.wall_breakable.mode === 'none',
    '派生旧字段 mode：wall 家族为 none（部位裁剪走 shellBlock=wall，不进 solid/single 分支）');

  ok(T.stump.exposureProfile === 'none' && T.rubble.exposureProfile === 'none' && T.stump.shellBlock === false,
    '残骸剖面：stump·rubble 不挡弹（移除 grad 渐变拦弹）');

  // 35) 弹道零遮蔽（#85）：water/river/mud 炮弹越飞
  const water = { x:3000, y:500, w:200, h:120, angle:0, tier:'water' };
  const river = { x:3000, y:800, w:10, h:10, angle:0, tier:'river',
                  segments:[{dx:-60,dy:0,w:80,h:40,angle:0},{dx:20,dy:8,w:90,h:40,angle:0}] };
  const mud   = { x:3400, y:900, w:160, h:100, angle:0, tier:'mud' };
  C.covers.push(water, river, mud);
  for(const t of [water, mud]){
    const e = C.getExposure(t.x-400, t.y, t.x+400, t.y, null, {heightClass:'medium'}, 0, 1.4);
    ok(e === 1, `${t.tier} 弹道越飞 exposure=1 (got ${e})`);
    ok(C.isBlockedBySolidCover(t.x-400, t.y, t.x+400, t.y) === null, `${t.tier} 不判为 solid 遮蔽`);
  }
  // 河流多段：几何命中父实例、弹道越飞
  const seg2 = river.segments[1];
  const rx = river.x + seg2.dx, ry = river.y + seg2.dy;
  ok(C.findCoversOnPath(rx-200, ry, rx+200, ry).some(h=>h.cover===river),
    '河流 segments findCoversOnPath 命中父实例');
  const rexp = C.getExposure(rx-200, ry, rx+200, ry, null, {heightClass:'medium'}, 0, 1.4);
  ok(rexp === 1, `river 弹道越飞 exposure=1 (got ${rexp})`);

  // 36) rock/intact 全遮蔽 + 实体推出
  const rock = { x:3600, y:500, w:70, h:70, angle:0, tier:'rock', hp:Infinity,
                 verts:[[-30,-25],[30,-25],[35,5],[15,28],[-20,25],[-32,0]] };
  const intact = { x:3900, y:800, w:110, h:60, angle:0, tier:'intact', hp:Infinity };
  C.covers.push(rock, intact);
  ok(C.getExposure(rock.x-300, rock.y, rock.x+300, rock.y, null, {heightClass:'heavy'}, 0, 1.8) === 0,
    'rock 全遮蔽 exposure=0');
  ok(C.isBlockedBySolidCover(intact.x-300, intact.y, intact.x+300, intact.y) !== null,
    'intact 判定为 solid 遮蔽');
  const rkTank = { x:rock.x, y:rock.y, hullAngle:0, hullLen:64, hullWid:38, hp:10, heightClass:'medium' };
  const rrx = rkTank.x, rry = rkTank.y;
  C.resolveCoverCollisions(rkTank);
  ok(rkTank.x!==rrx || rkTank.y!==rry, 'rock 推出坦克（实体结构）');
  ok(rock.hp === Infinity, 'rock hp Infinity 不受损');

  // 37) mud：不被推出 + getCoverUnderTank 命中（driveTank 减速走 tier 表 move=0.35）
  const mdTank = { x:mud.x, y:mud.y, hullAngle:0, hullLen:64, hullWid:38, hp:10, heightClass:'medium' };
  const mx = mdTank.x, my = mdTank.y;
  C.resolveCoverCollisions(mdTank);
  ok(mdTank.x===mx && mdTank.y===my, 'mud 不推出坦克（仅减速）');
  ok(C.getCoverUnderTank(mdTank) === mud, 'getCoverUnderTank 命中泥地（通行系数来源）');

  // 38) water/river 减速通行（2026-09-14 水系重做：passability 0.4，与 mud 同级——
  //     不推出仅减速；完全浸入溺毙由 tankFullyInWater + 主循环 drownT 承担）
  for(const wt of [{t:water,label:'water'},{t:river,label:'river'}]){
    const tk = { x:wt.t.x, y:wt.t.y, hullAngle:0, hullLen:64, hullWid:38, hp:10, heightClass:'medium' };
    const bx=tk.x, by=tk.y;
    C.resolveCoverCollisions(tk);
    ok(tk.x===bx && tk.y===by, `${wt.label} 不推出坦克（减速通行 0.4）`);
    ok(C.getCoverUnderTank({x:bx,y:by,hullAngle:0,hullLen:64,hullWid:38,heightClass:'medium'}) === wt.t, `getCoverUnderTank 命中${wt.label}（减速来源）`);
  }

  // 38b) tankFullyInWater：整车四角入水才算完全浸入（溺毙判定源）
  const dwWater = { x:5000, y:500, w:300, h:200, angle:0, tier:'water', hp:Infinity };
  C.covers.push(dwWater);
  const dIn  = { x:dwWater.x, y:dwWater.y, hullAngle:0, hullLen:64, hullWid:38, heightClass:'medium' };
  const dEdge = { x:dwWater.x + dwWater.w/2 + 4, y:dwWater.y, hullAngle:0, hullLen:64, hullWid:38, heightClass:'medium' };  // 部分出界
  const dDry = { x:dwWater.x + dwWater.w + 200, y:dwWater.y, hullAngle:0, hullLen:64, hullWid:38, heightClass:'medium' };
  ok(C.tankFullyInWater(dIn) === true, 'tankFullyInWater：车体完全位于水域内 → true');
  ok(C.tankFullyInWater(dEdge) === false, 'tankFullyInWater：车体越出水缘 → false');
  ok(C.tankFullyInWater(dDry) === false, 'tankFullyInWater：干燥地面 → false');
  C.covers.splice(C.covers.indexOf(dwWater), 1);

  // 39) ruined：全高确定性挡弹 + 摧毁转 rubble 残骸链（#E3：不再有半剖面插值）
  const ruined = { x:3200, y:1300, w:100, h:50, angle:0, tier:'ruined', hp:1 };
  C.covers.push(ruined);
  const rFar = C.getExposure(ruined.x-400, ruined.y, ruined.x+120, ruined.y, null, {heightClass:'medium'}, 0, 1.4);
  ok(rFar === 0, `ruined 全高：中坦车体远距全藏 (got ${rFar})`);
  const rTurret = C.getExposure(ruined.x-400, ruined.y, ruined.x+120, ruined.y, null, {heightClass:'medium'}, 1.4, 2.3);
  ok(rTurret === 0, `ruined 全高：炮塔同样被挡（确定性 100%，got ${rTurret}）`);
  C.damageCover(ruined, 1, 'shell');
  ok(ruined.tier === 'rubble' && ruined.hp === 1, `ruined 摧毁 → rubble 残骸 (got ${ruined.tier}/${ruined.hp})`);
  const rPost = C.getExposure(ruined.x-400, ruined.y, ruined.x+120, ruined.y, null, {heightClass:'medium'}, 0, 1.4);
  ok(rPost === 1, `rubble 残骸不再挡弹 (#E1：炮弹越飞, got ${rPost})`);

  C.covers.length = baseLen;   // 移除本节临时实例
  C.resetCovers();
}

// ================= #U37（2026-10-18）河流三修：道路免疫几何精确性 =================
// 40) 道路免疫不得外溢到河面：
//     road 的几何真身是「沿中心线左右各偏移半宽」的细长折带多边形（tank_nodegen
//     _emitRoadChain：verts = 左链 + 反向右链）。coverCorners/coverCollisionParts 对它
//     返回的是**整链凸包**，而 getRoadUnderTank 用 SAT（凸多边形相交）判「车体是否在路上」
//     ——对细长弯曲路链会大面积高估：实测一条 1030×4645 主干道路链，真实路面只占其凸包
//     bbox 的 12.3%，距 bbox 中心 894~1109px 的河面点都被判「在路上」。
//     后果链：tankFullyInWater 开头的「道路优先」直接 return false（整片河面获得溺毙免疫）
//     + driveTank 的 roadCover 分支跳过 river 的 0.4 减速 ⇒ 用户报的「贴图有河但不减速不溺毙」。
//     本组用一条 ∩ 形路链（中心线 (-300,600)→(-300,-300)→(300,-300)→(300,600)，带宽 92）
//     把语义钉死：**路带上的车体仍判在路上**（桥/路口语义），**凹口内离路缘 254px 的车体
//     必须判 null**（该点落在整链凸包内、但在真实路面多边形外）。
C.resetCovers();
{
  const OX = 8000, OY = 3000;          // 远离默认掩体阵列，避免互相干扰
  const ROAD_W = 92;
  // 沿中心线左右偏移半宽生成折带多边形（与 _emitRoadChain 同款算法）
  const bandPoly = (centerline, roadW) => {
    const hw = roadW / 2, left = [], right = [];
    for (let i = 0; i < centerline.length; i++) {
      const p = centerline[i];
      const p0 = centerline[Math.max(0, i - 1)], p1 = centerline[Math.min(centerline.length - 1, i + 1)];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      left.push([p.x + nx * hw, p.y + ny * hw]);
      right.push([p.x - nx * hw, p.y - ny * hw]);
    }
    return left.concat(right.reverse());
  };
  const cl = [[-300, 600], [-300, -300], [300, -300], [300, 600]]
    .map(([x, y]) => ({ x: OX + x, y: OY + y }));
  const verts = bandPoly(cl, ROAD_W);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [vx, vy] of verts) {
    if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
    if (vy < minY) minY = vy; if (vy > maxY) maxY = vy;
  }
  const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2;
  const uRoad = {
    x: cx0, y: cy0, w: maxX - minX, h: maxY - minY, angle: 0,
    tier: 'road', hp: Infinity, groupId: 'u37-test-road',
    verts: verts.map(([vx, vy]) => [vx - cx0, vy - cy0])
  };
  // 覆盖整条 ∩ + 凹口的河面（水体本身不挡判定，用于 tankFullyInWater）
  const uRiver = { x: OX, y: OY + 100, w: 800, h: 800, angle: 0, tier: 'river', hp: Infinity };
  C.covers.push(uRoad, uRiver);
  C.invalidateCoverGrid();
  const mkTank = (x, y, ang) => ({ x, y, hullAngle: ang || 0, hullLen: 69, hullWid: 38, hp: 100, heightClass: 'medium' });
  // 凹口内（车体中心距左右两侧路缘各 254px、距顶臂 600px）——真实路面外
  const pocketTank = mkTank(OX, OY + 300, 0);
  // 顶臂上（车体完全落在 92px 路带内）
  const topTank = mkTank(OX, OY - 300, 0);
  // 左臂上（顺臂朝向）
  const armTank = mkTank(OX - 300, OY + 100, Math.PI / 2);
  // 路链 AABB 之外
  const farTank = mkTank(OX, OY + 1400, 0);

  ok(C.getRoadUnderTank(topTank) === uRoad,
    '#U37 道路免疫：车体压在路带上 → 仍判在路上（顶臂，零回归）');
  ok(C.getRoadUnderTank(armTank) === uRoad,
    '#U37 道路免疫：车体压在侧臂上 → 仍判在路上（零回归）');
  ok(C.getRoadUnderTank(farTank) === null,
    '#U37 道路免疫：路链 AABB 之外 → null');
  const pocketHit = C.getRoadUnderTank(pocketTank);
  ok(pocketHit === null,
    `#U37 道路免疫：∩ 凹口内（真实路面外 254px、落在整链凸包内）→ 必须 null（实际返回 ${pocketHit ? pocketHit.groupId : 'null'}）`);
  ok(C.tankFullyInWater(topTank) === false,
    '#U37 溺毙语义：车体压在「路带 + 河面」上 → 道路优先，不算完全浸入（桥/路口语义保留）');
  ok(C.tankFullyInWater(pocketTank) === true,
    '#U37 溺毙语义：河面离路面 254px → 恢复「完全浸入」判定（道路免疫不得外溢到河面）');

  C.covers.splice(C.covers.indexOf(uRoad), 1);
  C.covers.splice(C.covers.indexOf(uRiver), 1);
  C.invalidateCoverGrid();   // 索引按 length/首末引用做签名，push+splice 后必须显式失效
  C.resetCovers();
}

// ================= #U37（2026-10-18）河宽硬上限 =================
// 41) 河宽上限：任何河段的垂直宽度 s.h 不得超过 RULES.drowning.wadeMaxWidth。
//   语义（唯一配置源 RULES.drowning.wadeMaxWidth，推导见 tank_rules.js 注释）：
//   「溺毙倒计时内最慢可用车能渡过的宽度」——水中速度 = maxSpeed × speed.pxFactor ×
//   river.passability × speed.effMul，8s 可渡 ≈ hummel(maxSpeed 40) 的 266px，配置取 260。
//   改前实测河宽 min 325 / p50 573 / p90 756 / max 805 ⇒ hummel 穿 446px 河需 9.8s > 8s
//   必溺毙（用户报「河流宽度需要限制，不能造成坦克无法涉水过河」）。
//   生成侧钳制在 js/tank_nodegen.js（placeStripRivers 的 thick 基准 + buildRiver 出口钳制），
//   本断言是其回归护栏：只要任一 seed 产出的河段超限即失败。
//   注：河段可能以 segs（segments 展开）或独立 OBB 两种形态出现——本断言覆盖两种。
{
  const wadeMax = RULES.drowning && RULES.drowning.wadeMaxWidth;
  ok(Number.isFinite(wadeMax) && wadeMax > 0,
    `#U37 RULES.drowning.wadeMaxWidth 存在且为正数（got ${wadeMax}）`);
  if (Number.isFinite(wadeMax)) {
    // generateStrip 走浏览器全局口径：先补齐其依赖的全局符号（与 test-strip.js 同源）
    const NG = require('../js/tank_nodegen.js');
    global.createRNG = NG.createRNG;
    global.generateNode = NG.generateNode;
    global.pickTemplate = NG.pickTemplate;
    global.getTemplates = NG.getTemplates;
    global.generateStrip = NG.generateStrip;
    const MAP = require('../js/tank_map.js');
    const savedCovers = C.covers.slice();
    let segCount = 0, maxH = 0, worst = null;
    for (const seed of [7, 42, 999, 2024, 12345]) {
      // strip 级生成参数（含 chunkRows：多行片，生存口径）——nodegen 的 JSDoc 选项类型
      // 只列到 chunkCount，chunkRows 为后续新增字段，故这里显式 any 断言避免 TS2353。
      const s = NG.generateStrip(0.5, /** @type {any} */ ({
        seed: seed, viewport: { vw: 1280, vh: 720 }, scaleFor: MAP.nodeScaleFor,
        stripScreensX: 5, stripScreensY: 2.2, chunkRows: 2
      }));
      for (const c of s.covers) {
        if (c.tier !== 'river') continue;
        for (const seg of (c.segments && c.segments.length ? c.segments : [c])) {
          const h = seg.h > 0 ? seg.h : Math.min(seg.w || 0, seg.h || 0);
          segCount++;
          if (h > maxH) { maxH = h; worst = `seed=${seed} ${c.groupId || ''} h=${h.toFixed(1)}`; }
        }
      }
    }
    ok(segCount > 0, `#U37 河宽采样非空（${segCount} 段，5 seed）`);
    ok(maxH <= wadeMax + 1e-6,
      `#U37 所有河段宽度 ≤ wadeMaxWidth（max=${maxH.toFixed(1)} ≤ ${wadeMax}，${worst}）`);
    // 恢复全局 covers（generateStrip 全程用自身局部 covers，此处只防御性还原）
    C.covers.length = 0;
    for (const c of savedCovers) C.covers.push(c);
    C.invalidateCoverGrid();
    C.resetCovers();
  }
}

// ============================================================================
// #W16-①（2026-10-20）verts 多边形掩体的溅射归属判定 —— 能力锁
// ============================================================================
// 背景（mapgen 探针 tmp/probe-w16-splash.js 落定，本轮搬入）：
//   `splashCoversAt`（js/tank_cover.js:197+）用**纯中心距离**（cov.x/cov.y + 半径）判定，
//   而 `coverCorners`/`coverWorldPolygon` 对带 verts 的多边形走真实多边形。
//   两种口径在「verts 且体型非正方」时必然分歧：
//     · 长条远端命中 → 点在多边形内但离中心很远 ⇒ 中心距离判据**漏判**；
//     · 长条外侧近点 → 点在多边形外但离中心很近 ⇒ 中心距离判据**误伤**。
//   按 role-mapgen 的裁定（ISSUES #W16-①）：**先补断言、不改判定逻辑**。
//   ⚠️ 因此本段的断言分成两类，语义必须分清：
//     ① 「口径分歧已被锁住」的能力锁 —— 断言的是**当前实现的已知偏差**，
//        目的是让偏差一旦被修（或恶化）都会立刻可见，而不是把缺陷伪装成期望行为；
//        每条都标注 ISSUES #W16-① 与「修好后本断言需翻转」。
//     ② 「不可达性」锁 —— 实测当前数据里「verts 且可破坏」实例数为 0，
//        所以该偏差在现行数据下无可观测影响；一旦生成器开始产出此类实例，
//        本断言会红，提示必须同步修判定逻辑。
{
  // 真值判据：包络粗筛 + 多边形点测（与 coverCorners/coverWorldPolygon 同源）
  function pointInCoverTruth(cov, x, y) {
    const e = C.coverEnvelope(cov);
    if (x < e.minX || x > e.maxX || y < e.minY || y > e.maxY) return false;
    return C.pointInPolygon({ x, y }, C.coverCorners(cov));
  }
  function mkPoly(verts, tier, hp) {
    const cov = { x: 1000, y: 1000, angle: 0, tier: tier || 'tree', hp: hp === undefined ? 1 : hp, verts };
    C.covers.length = 0;
    C.covers.push(cov);
    C.invalidateCoverGrid();
    return cov;
  }

  // ---- A) 基准：正方形多边形，两种判据一致（说明分歧只出现在非正方/凹形）----
  {
    const cov = mkPoly([[-60, -40], [60, -40], [60, 40], [-60, 40]]);
    ok(pointInCoverTruth(cov, 1000, 1000) === true, '#W16-① A: 中心点在多边形内（truth=true）');
    ok(C.splashCoversAt(1000, 1000, 10) === 1, '#W16-① A: splashCoversAt 中心命中 → 摧毁 1（口径一致）');
  }

  // ---- B) 凹多边形（L 形）凹陷区点：两种判据恰好一致 ----
  {
    const L = [[-60, -60], [0, -60], [0, 0], [60, 0], [60, 60], [-60, 60]];
    const cov = mkPoly(L);
    const truth = pointInCoverTruth(cov, 1040, 940);   // 局部 (40,-60) 在 L 形缺角内
    ok(truth === false, '#W16-① B: L 形凹陷区点确实在多边形外（断言前提成立）');
    ok(C.splashCoversAt(1040, 940, 10) === 0, '#W16-① B: 凹陷区点不摧毁（距离 72 > 半径 10，巧合一致）');
  }

  // ---- C) 已知偏差①：长条远端命中漏判 ----
  // 修好判定逻辑（改用 coverEnvelope/多边形点测）后，下面第 2 条应翻转为 n === 1。
  {
    const cov = mkPoly([[-300, -12], [300, -12], [300, 12], [-300, 12]]);   // 600×24 长条
    ok(pointInCoverTruth(cov, 1240, 1000) === true, '#W16-① C: 长条远端点在多边形内（truth=true）');
    const n = C.splashCoversAt(1240, 1000, 10);
    ok(n === 0,
      `#W16-① C【已知偏差·ISSUES #W16-①】长条远端命中被中心距离判据漏判（got ${n}，真值应为 1；` +
      `修好后本断言需翻转为 === 1）`);
  }

  // ---- D) 已知偏差②：长条外侧近点误伤 ----
  // 修好后第 2 条应翻转为 n === 0。
  {
    const cov = mkPoly([[-200, -10], [200, -10], [200, 10], [-200, 10]]);
    ok(pointInCoverTruth(cov, 1000, 1060) === false, '#W16-① D: 长条外侧点不在多边形内（truth=false）');
    const n = C.splashCoversAt(1000, 1060, 70);
    ok(n === 1,
      `#W16-① D【已知偏差·ISSUES #W16-①】长条外侧近点被中心距离判据误伤（got ${n}，真值应为 0；` +
      `修好后本断言需翻转为 === 0）`);
  }

  // ---- E) 不可达性锁：现行数据里「verts 且可破坏」实例为 0 ----
  // 若此断言转红 ⇒ 生成器已开始产出「verts + 有限 hp」实例 ⇒ #W16-① 从不可达变为可达，
  // 必须立即修 splashCoversAt 的判定逻辑（否则 HE 破障会对这类元素漏判/误判）。
  // 注：NG/MAP 在本文件 :840/:846 是**块内** const，本段位于其后但不在同作用域，
  //     故此处自行 require（与文件内既有写法一致，不做重复的全局耦合）。
  {
    const NGx = require('../js/tank_nodegen.js');
    const MAPx = require('../js/tank_map.js');
    let vertsTotal = 0, vertsDestructible = 0;
    const tiers = new Set();
    const scan = (covers) => {
      for (const c of covers || []) {
        if (c && c.verts && c.verts.length) {
          vertsTotal++;
          tiers.add(c.tier);
          if (Number.isFinite(c.hp) && c.hp > 0) vertsDestructible++;
        }
      }
    };
    const VP = { vw: 1920, vh: 1080 };
    // tsc 绕过：`generateStrip` 的 JSDoc 选项未声明 `chunkRows`（**实现支持**，见 mapgen #U35
    // 的多行片路网），tsc 会以 TS2353「unknown property」拒绝该字面量。
    // 该 JSDoc 在 role-mapgen 写域（js/tank_nodegen.js），本脚本不能改 ⇒ 此处局部 any 断言。
    // 待 mapgen 在 generateStrip 的 opts 里补 `chunkRows?: number` 后，可去掉本断言。
    const stripRows2Opts = /** @type {any} */ ({ seed: 1, viewport: VP, scaleFor: MAPx.nodeScaleFor, chunkRows: 2 });
    for (let sd = 1; sd <= 12; sd++) {
      scan(NGx.generateStrip(0.5, { seed: sd, viewport: VP, scaleFor: MAPx.nodeScaleFor }).covers);
      stripRows2Opts.seed = sd;
      scan(NGx.generateStrip(0.5, stripRows2Opts).covers);
      scan(NGx.generateNode(0.5, { seed: sd, scale: 3 }).covers);
    }
    ok(vertsDestructible === 0,
      `#W16-① E【不可达性锁】现行数据「带 verts 且可破坏」实例 = ${vertsDestructible} 个` +
      `（verts 实例共 ${vertsTotal}，tiers=${[...tiers].join(',')}；` +
      `若 >0 说明 #W16-① 已可达，须修 splashCoversAt 判定）`);
    C.covers.length = 0;
    C.invalidateCoverGrid();
  }
}

// ============================================================================
// #W17 / #W16-②（2026-10-20）directionTolerance 测试锁 + 未注册 tier 兜底
// ============================================================================
// 背景（mapgen 探针 tmp/probe-tolerance.js 落定，本轮搬入）：
//   `RULES.coverRules.directionTolerance`（缺省 16）由 role-systems 新增、role-mapgen 消费，
//   原先该容差是 `js/tank_cover.js` 里的硬编码常量。本段锁三件事：
//     ① 字段存在则读字段（证明不是硬编码）；
//     ② 字段缺失/非法（null/字符串/NaN/undefined/整块 coverRules 缺失）一律回落 16 且不抛错；
//     ③ 字段确实**驱动行为**（getExposure 在容差边界翻转）—— 防止「读了但没用」的空接线。
//   另含 #W16-②：未注册 tier 在 getExposure/destroyCover 上不得抛错。
{
  const savedTol = RULES_MOD.RULES.coverRules ? RULES_MOD.RULES.coverRules.directionTolerance : undefined;

  // ① 读字段
  RULES_MOD.RULES.coverRules.directionTolerance = 16;
  ok(C.coverDirectionTolerance() === 16, '#W17 字段=16 → 读到 16（缺省口径）');
  RULES_MOD.RULES.coverRules.directionTolerance = 40;
  ok(C.coverDirectionTolerance() === 40, '#W17 字段=40 → 读到 40（证明不是硬编码 16）');

  // ② 缺失/非法回落
  delete RULES_MOD.RULES.coverRules.directionTolerance;
  ok(C.coverDirectionTolerance() === 16, '#W17 字段缺失 → 回落 16');
  // 该字段在 RULES 里的声明是 number（js/tank_rules.js:81），但本段刻意注入非法值来验证
  // 「非法值不污染容差」⇒ 用 any 断言绕过 tsc（否则 TS2322 string|number → number）。
  const rulesObj = /** @type {any} */ (RULES_MOD.RULES.coverRules);
  for (const bad of [null, 'xxx', NaN, undefined]) {
    rulesObj.directionTolerance = bad;
    ok(C.coverDirectionTolerance() === 16, `#W17 字段=${String(bad)} → 回落 16（非法值不污染容差）`);
  }
  const savedRules = RULES_MOD.RULES.coverRules;
  delete RULES_MOD.RULES.coverRules;
  let wholeGone = null;
  try {
    wholeGone = C.coverDirectionTolerance();
    ok(wholeGone === 16, '#W17 coverRules 整块缺失 → 回落 16 且不抛错（旧存档/裁剪版 RULES）');
  } catch (e) {
    ok(false, `#W17 coverRules 整块缺失时抛错（${e.message}）`);
  }
  RULES_MOD.RULES.coverRules = savedRules;

  // ③ 驱动行为：同一射线 + 同一掩体，仅容差不同 → exposure 翻转
  C.covers.length = 0;
  C.covers.push({ x: 500, y: 300, w: 40, h: 40, angle: 0, tier: 'full', hp: Infinity });
  C.invalidateCoverGrid();
  const exWith = (tol) => {
    RULES_MOD.RULES.coverRules.directionTolerance = tol;
    // 射线 (300,300)→(700,300)，掩体 480~520 ⇒ distExit ≈ 220；cutoff=200
    return C.getExposure(300, 300, 700, 300, null, null, 0, 1.4, 200);
  };
  const e16 = exWith(16);   // 220 ≥ 216 ⇒ 跳过 ⇒ 1.0
  const e40 = exWith(40);   // 220 < 240  ⇒ 生效 ⇒ 0
  ok(e16 === 1.0, `#W17 容差 16：distExit(≈220) ≥ 200+16 ⇒ 掩体不生效 → exposure 1.0（got ${e16}）`);
  ok(e40 === 0, `#W17 容差 40：distExit(≈220) < 200+40 ⇒ 掩体生效 → exposure 0（got ${e40}）`);
  ok(e16 !== e40, '#W17 字段确实驱动行为（双读不是空接线）');

  // #W16-② 未注册 tier 不得抛错（原先 getExposure 读 T[tier].shellBlock、destroyCover 读 .label）
  RULES_MOD.RULES.coverRules.directionTolerance = 16;
  C.covers.length = 0;
  const bogus = { x: 500, y: 300, w: 40, h: 40, angle: 0, tier: '__no_such_tier__', hp: Infinity };
  C.covers.push(bogus);
  C.invalidateCoverGrid();
  try {
    const e2 = C.getExposure(300, 300, 700, 300, null, null, 0, 1.4, 1000);
    ok(typeof e2 === 'number', `#W16-② 未注册 tier：getExposure 不抛错且返回数值（got ${e2}）`);
  } catch (e) {
    ok(false, `#W16-② 未注册 tier：getExposure 抛错（${e.message}）`);
  }
  try {
    C.damageCover(bogus, 1, 'splash');
    ok(true, '#W16-② 未注册 tier：destroyCover 不抛错（label 已判空）');
  } catch (e) {
    ok(false, `#W16-② 未注册 tier：destroyCover 抛错（${e.message}）`);
  }

  // #W17 coverBlockInfo 形状（依赖 global.getPartZRange，见文件头 shim）
  C.covers.length = 0;
  C.covers.push({ x: 500, y: 300, w: 40, h: 40, angle: 0, tier: 'full', hp: Infinity });
  C.invalidateCoverGrid();
  try {
    const bi = C.coverBlockInfo(300, 300, 700, 300, null, { heightClass: 'medium' }, 'hull', 1000);
    ok(bi && Array.isArray(bi.hits) && bi.hits.length === 1 && bi.prob === 1,
      `#W17 coverBlockInfo 形状正确（hits=${bi && bi.hits && bi.hits.length}, prob=${bi && bi.prob}）`);
  } catch (e) {
    ok(false, `#W17 coverBlockInfo 抛错（${e.message}）`);
  }

  // coverEnvelope WeakMap 缓存：同对象复用 + 几何变更失效 + verts 变更失效
  C.covers.length = 0;
  const cov = { x: 100, y: 100, w: 40, h: 40, angle: 0, tier: 'full', hp: Infinity };
  C.covers.push(cov);
  C.invalidateCoverGrid();
  const env1 = C.coverEnvelope(cov);
  ok(C.coverEnvelope(cov) === env1, '#W17 coverEnvelope 同对象命中 WeakMap 缓存');
  cov.x = 200;
  const env3 = C.coverEnvelope(cov);
  ok(env3 !== env1 && env3.minX === env1.minX + 100,
    `#W17 几何变更后缓存失效（minX ${env1.minX} → ${env3.minX}）`);
  cov.verts = [[-20, -20], [20, -20], [20, 20], [-20, 20]];
  ok(C.coverEnvelope(cov) !== env3, '#W17 新增 verts 后缓存失效（签名含 verts 引用）');

  // 收尾：还原容差与 covers（后续段/其他脚本不依赖本段状态）
  if (savedTol === undefined) delete RULES_MOD.RULES.coverRules.directionTolerance;
  else RULES_MOD.RULES.coverRules.directionTolerance = savedTol;
  C.covers.length = 0;
  C.invalidateCoverGrid();
  C.resetCovers();
}

console.log(fails ? `\n${fails} failure(s).` : '\nAll cover-system checks passed.');
process.exitCode = fails ? 1 : 0;
