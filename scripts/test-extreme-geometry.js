// scripts/test-extreme-geometry.js — 极端几何测试
// 极端但合法的多边形/半形几何、极端尺寸射线与模块带测试（tank_halfgeom + tank_geometry）。
// 覆盖：微缩/巨型半形 buildFullVerts、极薄/极小/极限纵横比车体、halfFromFull 缩放往返、
// normalizeBarrel 极端炮管规格、100 顶点多边形、极端尺寸 raycastTank、模块带 len=1/lenMin 边界。
// 约定：本仓库多边形为「隐式闭合」——buildFullVerts 不重复首点，最后一条边是 (last→first)。
// Run: node scripts/test-extreme-geometry.js
'use strict';

const U = require('../js/tank_utils.js');
const H = require('../js/tank_halfgeom.js');
const RULES_MOD = require('../js/tank_rules.js');
global.norm = U.norm;
global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect;
global.partCorners = U.partCorners;
global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir;
global.distToSegment = U.distToSegment;
global.gaussian = U.gaussian;
global.angDiff = U.angDiff;
global.RULES = RULES_MOD.RULES;
const G = require('../js/tank_geometry.js');

let fails = 0, count = 0;
function ok(cond, label) {
  count++;
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ---- 通用辅助 ----
function allFinite(verts){ return verts.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])); }
function shoelace(verts){ let s = 0; for(let i=0;i<verts.length;i++){ const a=verts[i], b=verts[(i+1)%verts.length]; s += a[0]*b[1] - b[0]*a[1]; } return Math.abs(s)/2; }
// 全形中每个顶点都存在跨 x 轴的镜像对应顶点（对称性）
function symHolds(full){
  for(const v of full){
    let found = false;
    for(const w of full){ if(H.pointsEqual(w, H.mirrorPt(v))){ found = true; break; } }
    if(!found) return false;
  }
  return true;
}
// 唯一顶点计数
function uniqueCount(verts){
  const uniq = [];
  for(const v of verts){ if(!uniq.some(w => H.pointsEqual(w, v))) uniq.push(v); }
  return uniq.length;
}
function mockTank(over){
  return Object.assign({
    x:0, y:0, hullAngle:0, turretAngle:0,
    hullLen:64, hullWid:38, turLen:34, turWid:36,
    turretPivotOffset:{ dx:8, dy:0 }, turretAxis:{ dx:0, dy:0 },
    heightClass:'medium'
  }, over);
}

// ================= 1) buildFullVerts 极端半形 =================
{
  // 微缩但合法（非零宽度）的三角形半形：首点在中心线上
  const tinyHalf = [[0.001,0],[0.001,-0.001],[-0.001,-0.001]];
  const tf = H.buildFullVerts(tinyHalf);
  ok(tf.length === 5, '微型半形: 全形 5 个唯一顶点（3 半形顶点 + 镜像链去重 1 接缝）');
  ok(uniqueCount(tf) === 5, '微型半形: 5 个顶点两两互异');
  ok(allFinite(tf), '微型半形: 全部坐标有限');
  ok(Math.abs(tf[0][1]) < H.CENTER_EPS, '微型半形: 首点在中心线上（前端接缝端点）');
  ok(H.pointsEqual(tf[tf.length-1], H.mirrorPt(tf[1])), '微型半形: 隐式闭合——末点=次点镜像（镜像侧接缝闭合，末边 last→first 成环）');
  ok(symHolds(tf), '微型半形: 跨 x 轴左右对称（每顶点有镜像对应）');
  ok(shoelace(tf) > 0, '微型半形: 有向面积 > 0（非退化合法多边形）');
}
{
  // 巨型半形：坐标 ±1e6，首尾均在中心线上
  const hugeHalf = [[1e6,0],[5e5,-5e5],[-5e5,-5e5],[-1e6,0]];
  const hf = H.buildFullVerts(hugeHalf);
  ok(hf.length === 6, '巨型半形: 全形 6 个唯一顶点（4 半形 + 镜像链去重 2 接缝）');
  ok(uniqueCount(hf) === 6, '巨型半形: 6 个顶点两两互异');
  ok(allFinite(hf), '巨型半形: ±1e6 坐标全部有限');
  ok(hf.every(p => Math.abs(p[0]) <= 1e6 && Math.abs(p[1]) <= 5e5), '巨型半形: 坐标范围正确');
  ok(H.pointsEqual(hf[hf.length-1], H.mirrorPt(hf[1])), '巨型半形: 隐式闭合（末点=次点镜像）');
  ok(symHolds(hf), '巨型半形: 跨 x 轴左右对称');
  ok(shoelace(hf) > 0, '巨型半形: 有向面积 > 0（非退化）');
}

// ================= 2) 极薄但非零宽度车体 =================
{
  const poly = G.hullPoly({ hullLen:200, hullWid:0.5 });
  ok(poly.verts.length === 5, '极薄车体 (200×0.5): 5 个顶点');
  ok(uniqueCount(poly.verts) === 5, '极薄车体: 全部顶点互异');
  ok(poly.faces.join(',') === 'front,front,side,rear,side', '极薄车体: 面序 front,front,side,rear,side');
  const fc = { front:0, side:0, rear:0 };
  for(const f of poly.faces) fc[f]++;
  ok(fc.front === 2 && fc.side === 2 && fc.rear === 1, '极薄车体: 前/侧/后面计数 2/2/1');
  ok(allFinite(poly.verts), '极薄车体: 全部坐标有限');
  ok(shoelace(poly.verts) > 0, '极薄车体: 有向面积 > 0（宽度 0.5 非零 → 合法）');
}

// ================= 3) 极小车体/炮塔 =================
{
  const hp = G.hullPoly({ hullLen:2, hullWid:1 });
  ok(hp.verts.length === 5 && allFinite(hp.verts), '极小车体 (2×1): 5 顶点且无 NaN/Infinity');
  const xs = hp.verts.map(v=>v[0]), ys = hp.verts.map(v=>v[1]);
  ok(Math.max(...xs) - Math.min(...xs) > 0 && Math.max(...ys) - Math.min(...ys) > 0, '极小车体: 正向包围盒范围（非零宽/长）');
  ok(shoelace(hp.verts) > 0, '极小车体: 有向面积 > 0');
  const tp = G.turretPoly({ turLen:2, turWid:1 });
  ok(tp.verts.length === 6 && allFinite(tp.verts), '极小炮塔 (2×1): 6 顶点且无 NaN/Infinity');
  const txs = tp.verts.map(v=>v[0]), tys = tp.verts.map(v=>v[1]);
  ok(Math.max(...txs) - Math.min(...txs) > 0 && Math.max(...tys) - Math.min(...tys) > 0, '极小炮塔: 正向包围盒范围');
}

// ================= 4) 极限纵横比 (4000×4) =================
{
  const poly = G.hullPoly({ hullLen:4000, hullWid:4 });
  ok(poly.verts.length === 5 && allFinite(poly.verts), '极限纵横比 (4000×4): 5 顶点且全部有限');
  const corners = G.polyCorners(123.456, -78.9, 1.2345, poly);
  ok(corners.length === 5 && corners.every(c => Number.isFinite(c.x) && Number.isFinite(c.y)), 'polyCorners: 极端角度 + 大坐标下全部有限');
  const edges = G.polyEdges(corners, poly);
  ok(edges.length === 5 && edges.every(e => Number.isFinite(e.nx) && Number.isFinite(e.ny)), 'polyEdges: 法线全部有限');
  ok(edges.every(e => Math.abs(Math.hypot(e.nx, e.ny) - 1) < 1e-9), 'polyEdges: 法线已归一化 (|n|=1)');
  // partCorners 往返：世界角点绕中心反旋转回局部帧 == 原始局部角点
  const cx = 123.456, cy = -78.9, angle = 1.2345, halfL = 2000, halfW = 2;
  const pc = U.partCorners(cx, cy, angle, halfL, halfW);
  const local = [[halfL,-halfW],[halfL,halfW],[-halfL,halfW],[-halfL,-halfW]];
  let rt = pc.length === 4;
  for(let i=0;i<4 && rt;i++){
    const r = U.rotate(pc[i].x - cx, pc[i].y - cy, -angle);
    if(Math.abs(r.x - local[i][0]) > 1e-9 || Math.abs(r.y - local[i][1]) > 1e-9) rt = false;
  }
  ok(rt, 'partCorners: 往返一致（世界角点反旋转回局部帧精确还原）');
}

// ================= 5) halfFromFull 极端多边形往返 =================
{
  const dh = H.defaultHull();
  const fullFaces = H.buildFullFaces(dh.half, i => dh.halfFaces[i], 'front', 'rear');
  ok(fullFaces.length === 5 && fullFaces.join(',') === 'front,side,rear,side,front', '默认车体全形面数组 5 条');
  // ×1e6 缩放
  const bigHalf = dh.half.map(p => [p[0]*1e6, p[1]*1e6]);
  const bigFull = H.buildFullVerts(bigHalf);
  const bigDerived = H.halfFromFull(bigFull, fullFaces);
  const bigRebuild = H.buildFullVerts(bigDerived.half);
  ok(bigRebuild.length === bigFull.length, '×1e6 往返: 重建顶点数一致');
  ok(bigRebuild.every((p,i) => Math.abs(p[0]-bigFull[i][0]) < 1e-3 && Math.abs(p[1]-bigFull[i][1]) < 1e-3), '×1e6 往返: 重建坐标匹配（容差 1e-3）');
  // ×1e-3 缩放
  const smallHalf = dh.half.map(p => [p[0]*1e-3, p[1]*1e-3]);
  const smallFull = H.buildFullVerts(smallHalf);
  const smallDerived = H.halfFromFull(smallFull, fullFaces);
  const smallRebuild = H.buildFullVerts(smallDerived.half);
  ok(smallRebuild.length === smallFull.length, '×1e-3 往返: 重建顶点数一致');
  ok(smallRebuild.every((p,i) => Math.abs(p[0]-smallFull[i][0]) < 1e-9 && Math.abs(p[1]-smallFull[i][1]) < 1e-9), '×1e-3 往返: 重建坐标匹配（容差 1e-9）');
  // 近共线三点 (20,0)/(10,-1)/(0,-2) 落在同一直线上——halfFromFull 不应崩溃
  const ncHalf = [[20,0],[10,-1],[0,-2],[-10,-2]];
  const ncFull = H.buildFullVerts(ncHalf);
  const ncFaces = H.buildFullFaces(ncHalf, () => 'side', 'front', 'rear');
  const ncDerived = H.halfFromFull(ncFull, ncFaces);
  ok(ncDerived && ncDerived.half.length === 4, '近共线半形: halfFromFull 不崩溃且还原 4 个半形顶点');
  ok(ncDerived.halfFaces.length === 3, '近共线半形: 半形边面数 = 顶点数-1');
  const ncRebuild = H.buildFullVerts(ncDerived.half);
  ok(ncRebuild.length === ncFull.length, '近共线半形: 重建顶点数一致（不丢点）');
  ok(shoelace(ncRebuild) > 0, '近共线半形: 重建多边形仍有非零面积');
}

// ================= 6) normalizeBarrel 极端炮管规格 =================
{
  const d = H.normalizeBarrel(null);
  ok(d.len === 120 && d.width === 18 && d.muzzle === 'none', 'normalizeBarrel(null): 全默认 (len120/width18/muzzle none)');
  ok(d.evac.style === 'none' && d.evac.pos === 30, 'normalizeBarrel(null): evac 默认 {none,30}');
  ok(d.jacket.len === 0 && d.jacket.pos === 45 && d.mantlet.style === 'none' && d.mantlet.width === 40, 'normalizeBarrel(null): jacket/mantlet 默认');
  ok(H.normalizeBarrel(undefined).len === 120, 'normalizeBarrel(undefined): 同默认');
  ok(H.normalizeBarrel({}).len === 120 && H.normalizeBarrel({}).width === 18, 'normalizeBarrel({}): 缺字段取默认');
  const big = H.normalizeBarrel({ len: 1e6 });
  ok(big.len === 1e6 && Number.isFinite(big.len) && Number.isFinite(big.width), 'len=1e6: 透传且全部有限');
  // 源码不钳制 len：0.01 透传（无 lenMin 钳制逻辑，仅有 `b.len || 120` 兜底）
  ok(H.normalizeBarrel({ len: 0.01 }).len === 0.01, 'len=0.01: 源码无钳制，按原值透传');
  ok(H.normalizeBarrel({ len: -5 }).len === -5, 'len=-5: 负数透传（源码仅对假值兜底，负值不被处理）');
  ok(H.normalizeBarrel({ len: 0 }).len === 120, 'len=0: 假值 → 兜底默认 120');
  ok(H.normalizeBarrel({ len: 0, length: 0 }).len === 120, 'len=0+length=0: length 非有效字段被忽略，len 兜底 120');
  ok(H.normalizeBarrel({ len: 0, length: 0 }).evac.style === 'none' && H.normalizeBarrel({ len: 0, length: 0 }).evac.pos === 30, 'len=0+length=0: evac 走默认 {none,30}');
  ok(H.normalizeBarrel({ width: 0 }).width === 18, 'width=0: 假值 → 默认 18');
  const legacyPos = H.normalizeBarrel({ evacPos: 45 });
  ok(legacyPos.evac.style === 'ring' && legacyPos.evac.pos === 45, '旧格式 evacPos=45 → evac {ring,45}');
  const legacyZero = H.normalizeBarrel({ evacPos: 0 });
  ok(legacyZero.evac.style === 'none' && legacyZero.evac.pos === 0, '旧格式 evacPos=0 → evac {none,0}');
  const evac = H.normalizeBarrel({ evac: { style:'collar', pos:55 } });
  ok(evac.evac.style === 'collar' && evac.evac.pos === 55, '新格式 evac {collar,55} 原样保留');
}

// ================= 7) 100 顶点多边形 =================
{
  const half = [];
  for(let i=0;i<100;i++) half.push([ i/100*40, -Math.sin(i/100*Math.PI)*10 ]);
  const full = H.buildFullVerts(half);
  // 首点 [0,-0] 恰在中心线上 → 镜像链仅去重 1 个接缝 → 100+99=199
  ok(full.length === 199, '100 顶点半形: 全形 199 个唯一顶点（首点在中轴 → 去重 1 接缝）');
  ok(uniqueCount(full) === 199, '100 顶点半形: 顶点两两互异');
  ok(allFinite(full), '100 顶点半形: 全部坐标有限');
  let symOk = true;
  for(let k=0;k<99;k++){ if(!H.pointsEqual(H.mirrorPt(full[99-k]), full[100+k])) symOk = false; }
  ok(symOk, '100 顶点半形: 镜像链逐点对称 (full[100+k] = 镜像(full[99-k]))');
  ok(shoelace(full) > 0, '100 顶点半形: 有向面积 > 0（正弦轮廓非退化）');
}

// ================= 8) raycastTank 极端尺寸 =================
{
  // 微缩坦克 (2×1 / 2×1，炮塔轴心在原点)
  const tinyTank = mockTank({ hullLen:2, hullWid:1, turLen:2, turWid:1, turretPivotOffset:{ dx:0, dy:0 } });
  const tinyHits = G.raycastTank(-50, 0, 1, 0, tinyTank);
  ok(tinyHits && tinyHits.length === 2, '微缩坦克: 远距射线命中车体+炮塔两条');
  const tinyHull = tinyHits && tinyHits.find(h => h.part === 'hull');
  ok(tinyHull && Number.isFinite(tinyHull.t) && tinyHull.t > 0, '微缩坦克: 车体命中 t 有限且为正');
  ok(tinyHull && Math.abs(tinyHull.t - 49) < 1e-6, '微缩坦克: 车体后边 x=-1 → t=49');
  ok(tinyHits.every(h => Number.isFinite(h.t) && Number.isFinite(h.x) && Number.isFinite(h.y)), '微缩坦克: 全部命中点坐标有限');
  // 巨型坦克 (4000×4)
  const bigTank = mockTank({ hullLen:4000, hullWid:4, turretPivotOffset:{ dx:8, dy:0 } });
  const bigHits = G.raycastTank(-5000, 0, 1, 0, bigTank);
  const bigHull = bigHits && bigHits.find(h => h.part === 'hull');
  ok(bigHull && Number.isFinite(bigHull.t) && Math.abs(bigHull.t - 3000) < 1e-6, '巨型坦克: 车体后边 x=-2000 → t=3000（有限）');
  ok(bigHits && bigHits.length === 2 && bigHits.every(h => Number.isFinite(h.t)), '巨型坦克: 车体+炮塔两条命中全部有限');
  // 明显未命中的射线 → null
  ok(G.raycastTank(0, 500, 1, 0, bigTank) === null, '巨型坦克: y=500 侧向射线未命中 → null');
  ok(G.raycastTank(-50, 5, 1, 0, tinyTank) === null, '微缩坦克: y=5 侧向射线未命中 → null');
  // bestTankHit 在极端命中集上仍选炮塔优先
  ok(G.bestTankHit(bigHits, 0.001, Infinity).part === 'turret', '巨型坦克: bestTankHit 炮塔优先（turret@4991.85 < 窗口内 hull@3000）');
}

// ================= 9) pointInQuad / findModuleBands 极端 len =================
{
  const hugeV = G.hullPoly({ hullLen:4000, hullWid:4 }).verts;  // 前斜边 [2000,-2]→[2001,0] 中点 (2000.5,-1)
  // len=1 → 带覆盖整条边
  const bFull = G.findModuleBands(hugeV, { x:2000.5, y:-1, len:1 }, { dx:0, dy:0 }, 10);
  ok(bFull.length === 2, 'len=1 巨型边: 主带+镜像带 2 条');
  ok(G.pointInQuad(2000, -2, bFull[0]) && G.pointInQuad(2001, 0, bFull[0]) && G.pointInQuad(2000.5, -1, bFull[0]), 'len=1 巨型边: 带覆盖边两端与中点（整条边）');
  // len=lenMin(0.05) → 微小带居中
  const bTiny = G.findModuleBands(hugeV, { x:2000.5, y:-1, len:0.05 }, { dx:0, dy:0 }, 10);
  ok(bTiny.length === 2, 'len=0.05 巨型边: 主带+镜像带 2 条');
  ok(G.pointInQuad(2000.5, -1, bTiny[0]), 'len=0.05: 边中点命中（带居中）');
  ok(!G.pointInQuad(2000, -2, bTiny[0]), 'len=0.05: 边端点不在 5% 带内');
  // moduleBandForEdge 直调：巨型后边 len=1 → 四边形端点 == 边端点
  const mb = G.moduleBandForEdge(hugeV, 3, 400.2, 0, 1, 10, 0);  // 后边 [-2000,2]→[-2000,-2]
  ok(Math.abs(mb[0][0]+2000) < 1e-9 && Math.abs(mb[0][1]-2) < 1e-9 && Math.abs(mb[1][1]+2) < 1e-9, 'moduleBandForEdge len=1: 带端点贴合边端点');
  ok(G.pointInQuad(-2000, 0, mb), 'moduleBandForEdge: 后边中点在带内');
  // 无效模块 → 0 条带
  ok(G.findModuleBands(hugeV, null, { dx:0, dy:0 }, 10).length === 0, 'findModuleBands(null) → 0 条');
  ok(G.findModuleBands(hugeV, { x:999999, y:999999, len:0.5 }, { dx:0, dy:0 }, 10).length === 0, 'findModuleBands(找不到边) → 0 条');
  ok(G.findModuleBands(hugeV, { x:NaN, y:0, len:0.5 }, { dx:0, dy:0 }, 10).length === 0, 'findModuleBands(NaN 坐标) → 0 条');
  ok(G.findModuleBands(hugeV, { x:0, y:0, len:0 }, { dx:0, dy:0 }, 10).length === 0, 'findModuleBands(len=0) → 0 条');
  // pointInQuad 常规语义
  const q = [[1,1],[2,1],[2,2],[1,2]];
  ok(G.pointInQuad(1.5, 1.5, q), 'pointInQuad: 内部点命中');
  ok(G.pointInQuad(1, 1.5, q), 'pointInQuad: 边界点算命中');
  ok(!G.pointInQuad(0, 0, q), 'pointInQuad: 外部点不命中');
}

// ---- 规则常量（lenMin / bandDepth 供设计器/模块系统使用） ----
ok(RULES.modules.lenMin === 0.05, `RULES.modules.lenMin = 0.05（实际 ${RULES.modules.lenMin}）`);
ok(RULES.modules.bandDepth.hull === 10 && RULES.modules.bandDepth.turret === 8, 'RULES.modules.bandDepth = {hull:10, turret:8}');

// ---- #74 halfFromFull CCW 逆时针顶点正向化 ----
{
  const cwVerts = [[40, 0], [30, -20], [-30, -20], [-40, 0], [-30, 20], [30, 20]];
  const ccwVerts = cwVerts.slice().reverse();
  const resCW = H.halfFromFull(cwVerts, ['front', 'side', 'rear', 'rear', 'side', 'front']);
  const resCCW = H.halfFromFull(ccwVerts, ['front', 'side', 'rear', 'rear', 'side', 'front']);
  ok(resCW.half.length === 4, '#74: CW 多边形提取半形为 4 顶点（y<=0 包含两中线端点）');
  ok(resCCW.half.length === 4, '#74: CCW 多边形也正向化并正确提取 4 顶点');
  ok(Math.abs(resCW.half[0][0] - resCCW.half[0][0]) < 1e-4 && Math.abs(resCW.half[0][1] - resCCW.half[0][1]) < 1e-4,
    '#74: CCW 与 CW 提取首顶点对齐一致');
}

console.log(`\n${count} assertions, ${fails === 0 ? 'all passed' : fails + ' FAILED'}`);
console.log(fails === 0 ? 'All extreme-geometry checks passed.' : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);