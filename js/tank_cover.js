'use strict';

// 掩体系数统一收口到 js/tank_rules.js（特性5）；此处仅做别名保持调用方兼容
const COVER_TIERS = RULES.coverTiers;
// distanceTier 已随 A1 双档模型移除（见 RULES.coverHugDist），不再有距离渐变
// 半高掩体的"能否开过去"由 RULES.coverTiers.half.driveBy（按 heightClass）门控

// 地图元素（掩体体系，见 DEVELOPMENT.md §2.7）：每个元素带运行时耐久 hp——
// hp<=0 即毁（被炮弹/碾压/HE 溅射摧毁），已毁元素从所有判定与绘制中排除。
// 树伐倒 → 倒树(fallen，横躺树干+树冠，树冠=灌木遮挡效果)；沙袋击毁 → 碎石(rubble)。
// 掩体可承载任意复杂多边形：实例带 verts（局部坐标顶点数组）时，全部角点计算
// 走 coverCorners → polyCorners；否则回退矩形 partCorners（w/h 半宽半高）。
const covers = [
  { x:470, y:300, w:80, h:34, angle:0, tier:'half' },
  { x:660, y:300, w:70, h:34, angle:0, tier:'full' },
  { x:560, y:150, w:24, h:18, angle:0, tier:'tree' },       // 树：挡路+1 发伐倒→倒树
  { x:760, y:470, w:56, h:34, angle:0, tier:'bush' },       // 灌木：靶车可开入隐藏
  { x:930, y:150, w:56, h:30, angle:0, tier:'bush' },       // 灌木（装饰）
  { x:330, y:510, w:170, h:10, angle:0, tier:'soft' },      // 栅栏：穿透即毁 / 压过即毁
  { x:450, y:180, w:64, h:28, angle:0, tier:'barricade' },  // 沙袋路障：挡 1 发
  // 复杂多边形验证实例（需求2，为后续贴图做准备）：verts 为局部坐标顶点数组，
  // w/h 仅作包围盒参考；L 形凹多边形全高掩体 + 六边形半高掩体。
  { x:250, y:650, w:90, h:60, angle:0, tier:'full',
    verts: [[-45,-30],[45,-30],[45,-10],[5,-10],[5,30],[-45,30]],
    collisionVerts: [
      [[-45,-30],[5,-30],[5,30],[-45,30]],
      [[5,-30],[45,-30],[45,-10],[5,-10]]
    ] },
  { x:700, y:650, w:80, h:50, angle:0, tier:'half',
    verts: [[-40,0],[-20,-25],[20,-25],[40,0],[20,25],[-20,25]] }
];

// 每块掩体/元素在启动时快照初始状态（耐久取 tier 默认值），resetCovers() 用于重置战场
function snapshotCovers(){
  covers.forEach(c=>{
    if(c.hp === undefined) c.hp = COVER_TIERS[c.tier].hp;
    c.spawn = { tier:c.tier, x:c.x, y:c.y, w:c.w, h:c.h, angle:c.angle, hp:c.hp,
                ...(c.verts ? { verts: c.verts.slice() } : {}),
                ...(c.collisionVerts ? { collisionVerts: c.collisionVerts.map(v => v.map(pt => pt.slice())) } : {}) };
  });
}
function resetCovers(){
  covers.forEach(c=>{
    if(c.spawn) Object.assign(c, c.spawn);
    delete c._gone;
  });
}
snapshotCovers();

// 元素被摧毁：一次性消耗（_gone 幂等标志；每帧多辆车压上同一元素只毁一次）。
// toTier 残骸（树→倒树、沙袋→碎石）原地降级并保留于 covers；残骸尺寸默认通用
// 0.6/0.6 缩小，tier 配置了 residueW/residueH 时用其覆盖（如倒树横躺 2.4/0.5）。
// 多边形掩体（verts）被摧毁后残骸按矩形 w/h 表现，故清除 verts。
function destroyCover(cov, reason){
  if(cov._gone) return;
  cov._gone = true;
  cov.hp = 0;
  if(typeof burstExplosion === 'function'){
    burstExplosion(cov.x, cov.y, 0.9, 10, 5, 8);
  }
  if(typeof pushLog === 'function'){
    const why = reason==='shell' ? '炮弹击毁' : (reason==='splash' ? '爆炸波及' : '坦克碾碎');
    pushLog(`${COVER_TIERS[cov.tier].label}被${why}`, 'COVER');
  }
  const to = COVER_TIERS[cov.tier].toTier;
  if(to){
    cov.tier = to;
    cov.angle = 0;
    const rw = COVER_TIERS[to].residueW, rh = COVER_TIERS[to].residueH;
    if(rw !== undefined || rh !== undefined){
      cov.w = Math.max(8, cov.w * (rw !== undefined ? rw : 0.6));
      cov.h = Math.max(8, cov.h * (rh !== undefined ? rh : 0.6));
    } else {
      cov.w = Math.max(24, cov.w*0.6);
      cov.h = Math.max(16, cov.h*0.6);
    }
    cov.hp = COVER_TIERS[to].hp;
    cov._gone = false;          // 残骸重新"存活"（仍可再被毁/压毁）
    delete cov.verts;           // 残骸按矩形 w/h 表现，不再沿用多边形几何
    delete cov.collisionVerts;  // 同样清除多边形碰撞块
  }
}

// 扣除耐久；归零即摧毁。不可破坏元素（hp=Infinity）不受伤害。
function damageCover(cov, amt, reason){
  if(!cov || cov.hp <= 0 || !Number.isFinite(cov.hp)) return false;
  cov.hp = Math.max(0, cov.hp - (amt||1));
  if(cov.hp <= 0){ destroyCover(cov, reason||'shell'); return true; }
  return false;
}

// 掩体角点统一入口（需求2）：带 verts（局部坐标顶点数组，长度≥3）的复杂多边形
// 掩体走 polyCorners（tank_geometry.js 全局），否则回退矩形 partCorners（w/h 半宽半高）。
function coverCorners(cov){
  if(cov.verts && cov.verts.length >= 3){
    return polyCorners(cov.x, cov.y, cov.angle, { verts: cov.verts });
  }
  return partCorners(cov.x, cov.y, cov.angle, cov.w/2, cov.h/2);
}

// 支持多凸包碰撞（L型等凹多边形）：如果掩体有 collisionVerts，返回各子块角点数组组成的数组；否则返回含单一块 coverCorners(cov) 的数组。
function coverCollisionParts(cov) {
  if (cov.collisionVerts && cov.collisionVerts.length > 0) {
    return cov.collisionVerts.map(cv => polyCorners(cov.x, cov.y, cov.angle, { verts: cv }));
  }
  return [coverCorners(cov)];
}

// 掩体表面法线：命中点最近一条边向外（方向无要求，反射公式对方向不敏感）
function coverNormalAt(cov, px, py){
  const c = coverCorners(cov);
  let best=null, bestD=Infinity;
  for(let i=0;i<c.length;i++){
    const a=c[i], b=c[(i+1)%c.length];
    const ex=b.x-a.x, ey=b.y-a.y;
    const len=Math.hypot(ex,ey)||1;
    const ux=ex/len, uy=ey/len;
    const t=Math.max(0, Math.min(len, (px-a.x)*ux + (py-a.y)*uy));
    const hx=a.x+ux*t, hy=a.y+uy*t;
    const d=(px-hx)*(px-hx)+(py-hy)*(py-hy);
    if(d<bestD){ bestD=d; best={ nx:-uy, ny:ux }; }
  }
  return best;
}

// HE 破障（A3）：落点半径内所有可破坏元素吃 1 点溅射伤害
function splashCoversAt(x, y, radius){
  let destroyed = 0;
  for(const cov of covers){
    if(cov.hp <= 0 || !Number.isFinite(cov.hp)) continue;
    const d = Math.hypot(cov.x-x, cov.y-y);
    if(d <= radius && damageCover(cov, 1, 'splash')) destroyed++;
  }
  return destroyed;
}

function getCoverUnderTank(tank) {
  const tankCorners = partCorners(tank.x, tank.y, tank.hullAngle, tank.hullLen/2, tank.hullWid/2);
  for (const cov of covers) {
    if(cov.hp <= 0) continue;
    const parts = coverCollisionParts(cov);
    for (const part of parts) {
      if (obbOverlap(tankCorners, part)) {
        return cov;
      }
    }
  }
  return null;
}

// ---------- OBB / SAT collision helpers ----------
function getOBBAxes(corners) {
  const axes = [];
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    const ex = corners[j].x - corners[i].x;
    const ey = corners[j].y - corners[i].y;
    const len = Math.hypot(ex, ey) || 1;
    axes.push({ x: -ey / len, y: ex / len });
  }
  return axes;
}

function projectOBB(corners, axis) {
  let min = Infinity, max = -Infinity;
  for (const c of corners) {
    const d = c.x * axis.x + c.y * axis.y;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

function obbOverlap(cornersA, cornersB) {
  const axes = getOBBAxes(cornersA).concat(getOBBAxes(cornersB));
  for (const axis of axes) {
    const pA = projectOBB(cornersA, axis);
    const pB = projectOBB(cornersB, axis);
    if (pA.max < pB.min || pB.max < pA.min) return false;
  }
  return true;
}

// 全部候选 MTV（每个 OBB 轴一个），供对稳定性敏感的调用方（坦克⇄坦克）做轴选择。
// 每个条目：{ dx, dy, depth, ux, uy } —— 单位轴已定向为"把 cornersA 推离 cornersB"
// （dot(centerA - centerB, (ux,uy)) >= 0，与 obbMTV 约定一致）。
// 任一轴分离 → 返回 null（不碰撞）。
function obbMTVs(cornersA, cornersB) {
  const axes = getOBBAxes(cornersA).concat(getOBBAxes(cornersB));
  const out = [];
  for (const axis of axes) {
    const pA = projectOBB(cornersA, axis);
    const pB = projectOBB(cornersB, axis);
    if (pA.max < pB.min || pB.max < pA.min) return null;
    const overlap = Math.min(pA.max - pB.min, pB.max - pA.min);
    let ax = axis.x, ay = axis.y;
    let acx = 0, acy = 0;
    for (const c of cornersA) { acx += c.x; acy += c.y; }
    acx /= cornersA.length; acy /= cornersA.length;
    let bcx = 0, bcy = 0;
    for (const c of cornersB) { bcx += c.x; bcy += c.y; }
    bcx /= cornersB.length; bcy /= cornersB.length;
    if ((acx - bcx) * ax + (acy - bcy) * ay < 0) { ax = -ax; ay = -ay; }
    out.push({ dx: ax * overlap, dy: ay * overlap, depth: overlap, ux: ax, uy: ay });
  }
  return out;
}

function obbMTV(tankCorners, covCorners) {
  const candidates = obbMTVs(tankCorners, covCorners);
  if (!candidates) return null;
  let best = candidates[0];
  for (const c of candidates) if (c.depth < best.depth) best = c;
  return { dx: best.dx, dy: best.dy, depth: best.depth };
}

// 掩体/元素 ⇄ 坦克 碰撞：三态处理（见 2.7）——
//   crushable 元素（栅栏/沙袋/树桩/碎石）：直接压毁；
//   solid 不可压毁（全高建筑/树）：MTV 推出，物理隔离；
//   graduated（半高）/ none（灌木）：只让 update 里做通行系数，不推。
//   半高掩体另有 driveBy 门控（A1 设定）：重坦可开过去，中坦等同 solid 被推出。
function resolveCoverCollisions(tank) {
  const tankCorners = () => partCorners(tank.x, tank.y, tank.hullAngle, tank.hullLen/2, tank.hullWid/2);
  for (const cov of covers) {
    if (cov.hp <= 0) continue;
    const tier = COVER_TIERS[cov.tier];
    const parts = coverCollisionParts(cov);
    for (const part of parts) {
      const mtv = obbMTV(tankCorners(), part);
      if (!mtv) continue;
      if (tier.crushable) {
        destroyCover(cov, 'crush');
        break; // 已压毁则不再检测其他 collisionVerts
      }
      const blocked = tier.mode === 'solid' || (tier.driveBy && tier.driveBy[tank.heightClass] === false);
      if (blocked) {
        tank.x += mtv.dx;
        tank.y += mtv.dy;
      }
    }
  }
}

function findCoversOnPath(ox,oy,tx,ty){
  const dx=tx-ox, dy=ty-oy;
  const dist = Math.hypot(dx,dy) || 1;
  const ux=dx/dist, uy=dy/dist;
  const hits = [];
  for(const cov of covers){
    if(cov.hp <= 0) continue;   // 已摧毁元素不再参与判定/预测
    const corners = coverCorners(cov);
    let entry = null, exit = null;
    for(let i=0;i<corners.length;i++){
      const a=corners[i], b=corners[(i+1)%corners.length];
      const hit = segRayIntersect(ox,oy,ux,uy, a.x,a.y,b.x,b.y);
      if(hit && hit.t>0.5){
        // entry 只取命中点之前的穿越；exit 取整个矩形的出口（可越过命中点，
        // 供方向判据判定"掩体是否完整位于射手与目标之间"）
        if(hit.t < dist){
          if(!entry || hit.t<entry) entry = hit.t;
        }
        if(!exit || hit.t>exit) exit = hit.t;
      }
    }
    if(entry !== null){
      hits.push({ cover:cov, distA:entry, distB:dist-entry, distExit:exit || entry,
                  point:{x:ox+ux*entry,y:oy+uy*entry} });
    }
  }
  hits.sort((a,b)=>a.distA-b.distA);
  return hits;
}

// 掩体遮挡模型：垂直剖面 + 射线高度插值（C 实验，2026-08-14）：
//   1. 弹道路径是否穿掩体由实际射线与掩体 OBB 的交点决定（findCoversOnPath）——
//      射线绕过掩体（未相交）即无遮挡，直接命中；与"攻击方/被攻击方谁离掩体更近"无关。
//   2. 部位露出（垂直剖面）：炮塔（zMin >= 1.2）恒定 100% 露出；
//      半高掩体后，中坦车体 100% 阻挡（0% 露出），重坦车体露出 25%（75% 阻挡）。
//   3. C 实验——半高掩体越掩判定（受控距离因素）：本游戏弹道射线无下坠，其高度在
//      炮口高度（RULES.heights.muzzle，按射手 heightClass 取值）与目标部位中心高度
//      zMid 之间线性插值。攻击方贴近掩体时，射线在掩体入口处
//      （t = distA/(distA+distB)）仍高于掩体顶（RULES.heights.cover.half = 1.4）→
//      该掩体被越过（不参与遮挡，exposure 1.0）；拉开距离后射线降至掩体顶以下 →
//      恢复垂直剖面遮挡。仅正式 half 掩体参与插值；stump/rubble 等其他 graduated
//      残骸保持旧行为（永远留在候选列表）。RULES.heights.cover.half 缺失时不做插值
//      （保守回退旧行为）。炮塔恒露（zMin >= 1.2）与 16px 方向判据不受影响。
//   4. 方向判据（cutoffDist）：掩体须在命中车体前被射线完整穿过（distExit < cutoffDist）。
function getExposure(ox,oy,tx,ty, shooter, target, zMin, zMax, cutoffDist) {
  const hits = findCoversOnPath(ox,oy,tx,ty);
  const validHits = [];

  for(const h of hits){
    const tier = COVER_TIERS[h.cover.tier];
    // 纯视线/可穿透元素不参与弹道遮挡（灌木 none / 栅栏 pass）
    if(tier.mode === 'none' || tier.mode === 'pass') continue;
    // 方向判据：掩体须在命中车体前被射线完整穿过（骑上/包住车体的掩体不生效；
    // 贴掩体时 distExit 与 cutoffDist 极其接近，允许 16px 向后容差以确保贴掩体遮挡生效）
    const COVER_DIRECTION_TOLERANCE = 16;
    if(cutoffDist !== undefined && h.distExit >= cutoffDist + COVER_DIRECTION_TOLERANCE) continue;
    if(tier.mode === 'solid' || tier.mode === 'single') return 0; // 全高/固态掩体确定性 100% 格挡
    validHits.push(h);
  }

  if(validHits.length === 0) return 1.0;

  // 垂直剖面：结合目标车型（heightClass）与判定部位高度决定露出比例
  // 炮塔（zMin >= 1.2m）恒定 100% 露出
  if (zMin >= 1.2) {
    return 1.0;
  }

  // C 实验——半高掩体越掩过滤：仅正式 half 掩体参与射线高度插值；
  // 射线在掩体入口处高于掩体顶 → 越过（从候选移除）；stump/rubble 等其余
  // graduated 残骸走旧路径。RULES.heights.cover.half 缺失 → 跳过插值（保守）。
  const halfH = RULES.heights && RULES.heights.cover && RULES.heights.cover.half;
  if (halfH !== undefined) {
    const shooterH = (RULES.heights.muzzle && RULES.heights.muzzle[(shooter && shooter.heightClass) || 'medium']) || 1.8;
    const zMid = (zMin + zMax) / 2; // 目标部位中心高度
    const filtered = [];
    for (const h of validHits) {
      if (h.cover.tier === 'half') {
        const t = h.distA / (h.distA + h.distB);
        const rayH = shooterH + (zMid - shooterH) * t; // 射线在掩体入口处的高度
        if (rayH > halfH) continue; // 越过掩体 → 不参与遮挡
      }
      filtered.push(h);
    }
    if (filtered.length === 0) return 1.0;
    validHits.length = 0;
    validHits.push(...filtered);
  }

  // 车体露出比例
  const hClass = (target && target.heightClass) || 'medium';
  if (hClass === 'heavy') {
    return RULES.coverRules.heavyHullExposure; // 重坦车体漏出 25%
  }
  return RULES.coverRules.mediumHullExposure; // 中坦车体 0% 漏出（100% 阻挡）
}

function coverBlockInfo(ox,oy,tx,ty, shooter, target, part, cutoffDist){
  const z = getPartZRange(target, part);
  const exposure = getExposure(ox,oy,tx,ty, shooter, target, z.zMin, z.zMax, cutoffDist);
  return { prob: 1 - exposure, hits: findCoversOnPath(ox,oy,tx,ty) };
}

function isBlockedBySolidCover(ox,oy,tx,ty){
  const hits = findCoversOnPath(ox,oy,tx,ty);
  for(const h of hits){
    if(COVER_TIERS[h.cover.tier].mode === 'solid') return h;
  }
  return null;
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COVER_TIERS,
    covers,
    snapshotCovers,
    resetCovers,
    destroyCover,
    damageCover,
    coverNormalAt,
    coverCorners,
    splashCoversAt,
    getCoverUnderTank,
    obbOverlap,
    obbMTVs,
    obbMTV,
    resolveCoverCollisions,
    coverCollisionParts,
    findCoversOnPath,
    getExposure,
    coverBlockInfo,
    isBlockedBySolidCover
  };
}
