'use strict';

// 掩体系数统一收口到 js/tank_rules.js（特性5）；此处仅做别名保持调用方兼容
const COVER_TIERS = RULES.coverTiers;
// distanceTier 已随 A1 双档模型移除（见 RULES.coverHugDist），不再有距离渐变
// 半高掩体的"能否开过去"由 RULES.coverTiers.half.driveBy（按 heightClass）门控

// 地图元素（掩体体系，见 DEVELOPMENT.md §2.7）：每个元素带运行时耐久 hp——
// hp<=0 即毁（被炮弹/碾压/HE 溅射摧毁），已毁元素从所有判定与绘制中排除。
// 树伐倒 → 树桩(stump)；沙袋击毁 → 碎石(rubble)，残骸仍提供半高概率遮挡。
const covers = [
  { x:470, y:300, w:80, h:34, angle:0, tier:'half' },
  { x:660, y:300, w:70, h:34, angle:0, tier:'full' },
  { x:560, y:150, w:24, h:18, angle:0, tier:'tree' },       // 树：挡路+步上可伐倒
  { x:760, y:470, w:56, h:34, angle:0, tier:'bush' },       // 灌木：靶车可开入隐藏
  { x:930, y:150, w:56, h:30, angle:0, tier:'bush' },       // 灌木（装饰）
  { x:330, y:510, w:170, h:10, angle:0, tier:'soft' },      // 栅栏：穿透即毁 / 压过即毁
  { x:450, y:180, w:64, h:28, angle:0, tier:'barricade' }   // 沙袋路障：挡 1 发
];

// 每块掩体/元素在启动时快照初始状态（耐久取 tier 默认值），resetCovers() 用于重置战场
function snapshotCovers(){
  covers.forEach(c=>{
    if(c.hp === undefined) c.hp = COVER_TIERS[c.tier].hp;
    c.spawn = { tier:c.tier, x:c.x, y:c.y, w:c.w, h:c.h, angle:c.angle, hp:c.hp };
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
// toTier 残骸（树→树桩、沙袋→碎石）原地降级为半高残骸并保留于 covers。
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
    cov.w = Math.max(24, cov.w*0.6);
    cov.h = Math.max(16, cov.h*0.6);
    cov.hp = COVER_TIERS[to].hp;
    cov._gone = false;          // 残骸重新"存活"（仍可再被毁/压毁）
  }
}

// 扣除耐久；归零即摧毁。不可破坏元素（hp=Infinity）不受伤害。
function damageCover(cov, amt, reason){
  if(!cov || cov.hp <= 0 || !Number.isFinite(cov.hp)) return false;
  cov.hp = Math.max(0, cov.hp - (amt||1));
  if(cov.hp <= 0){ destroyCover(cov, reason||'shell'); return true; }
  return false;
}

// 掩体表面法线：命中点最近一条边向外（方向无要求，反射公式对方向不敏感）
function coverNormalAt(cov, px, py){
  const c = partCorners(cov.x,cov.y,cov.angle, cov.w/2, cov.h/2);
  let best=null, bestD=Infinity;
  for(let i=0;i<4;i++){
    const a=c[i], b=c[(i+1)%4];
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
    const covCorners = partCorners(cov.x, cov.y, cov.angle, cov.w/2, cov.h/2);
    if (obbOverlap(tankCorners, covCorners)) return cov;
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

function obbMTV(tankCorners, covCorners) {
  const axes = getOBBAxes(tankCorners).concat(getOBBAxes(covCorners));
  let minDepth = Infinity;
  let mtvAxis = null;
  for (const axis of axes) {
    const pA = projectOBB(tankCorners, axis);
    const pB = projectOBB(covCorners, axis);
    if (pA.max < pB.min || pB.max < pA.min) return null;
    const overlap = Math.min(pA.max - pB.min, pB.max - pA.min);
    if (overlap < minDepth) {
      minDepth = overlap;
      mtvAxis = axis;
    }
  }
  if (!mtvAxis) return null;
  let tcx = 0, tcy = 0;
  for (const c of tankCorners) { tcx += c.x; tcy += c.y; }
  tcx /= tankCorners.length; tcy /= tankCorners.length;
  let ccx = 0, ccy = 0;
  for (const c of covCorners) { ccx += c.x; ccy += c.y; }
  ccx /= covCorners.length; ccy /= covCorners.length;
  const dot = (tcx - ccx) * mtvAxis.x + (tcy - ccy) * mtvAxis.y;
  if (dot < 0) { mtvAxis.x = -mtvAxis.x; mtvAxis.y = -mtvAxis.y; }
  return { dx: mtvAxis.x * minDepth, dy: mtvAxis.y * minDepth, depth: minDepth };
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
    const covCorners = partCorners(cov.x, cov.y, cov.angle, cov.w/2, cov.h/2);
    const mtv = obbMTV(tankCorners(), covCorners);
    if (!mtv) continue;
    if (tier.crushable) {
      destroyCover(cov, 'crush');
      continue;
    }
    const blocked = tier.mode === 'solid' || (tier.driveBy && tier.driveBy[tank.heightClass] === false);
    if (blocked) {
      tank.x += mtv.dx;
      tank.y += mtv.dy;
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
    const corners = partCorners(cov.x,cov.y,cov.angle, cov.w/2, cov.h/2);
    let entry = null, exit = null;
    for(let i=0;i<4;i++){
      const a=corners[i], b=corners[(i+1)%4];
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

// 简化版 3 条规则掩体遮挡模型：
//   1. 部位露出：炮塔（zMin > 1.2 或 part==='turret'）恒定 100% 露出。
//      半高掩体后，中坦车体 100% 阻挡（0% 露出），重坦车体露出 25%（75% 阻挡）。
//   2. 距离压制：沿弹道分析所有介于攻击方与被攻击方之间的半高掩体，取离【被攻击方】最近的一座掩体 C_near。
//      若 dist(攻击方, C_near) < dist(被攻击方, C_near)，说明攻击方离掩体更近/占据压制优势，被攻击方视为【无掩体】（exposure=1）。
//   3. 方向判据（cutoffDist）：掩体须在命中车体前被射线完整穿过（distExit < cutoffDist）。
function getExposure(ox,oy,tx,ty, shooter, target, zMin, zMax, cutoffDist) {
  const hits = findCoversOnPath(ox,oy,tx,ty);
  const validHits = [];

  for(const h of hits){
    const tier = COVER_TIERS[h.cover.tier];
    // 纯视线/可穿透元素不参与弹道遮挡（灌木 none / 栅栏 pass）
    if(tier.mode === 'none' || tier.mode === 'pass') continue;
    // 方向判据：掩体须在命中车体前被射线完整穿过（骑上/包住车体的掩体不生效）
    if(cutoffDist !== undefined && h.distExit >= cutoffDist) continue;
    if(tier.mode === 'solid' || tier.mode === 'single') return 0; // 全高/固态掩体确定性 100% 格挡
    validHits.push(h);
  }

  if(validHits.length === 0) return 1.0;

  // 按离【被攻击方】(distB) 的距离升序排序，找到离被攻击方最近的一座半高掩体 C_near
  validHits.sort((a,b) => a.distB - b.distB);
  const cNear = validHits[0];

  // 计算攻击方(ox,oy)与被攻击方(tx,ty)各自到 C_near (cov.x, cov.y) 中心/交点的真实距离
  const distAttackerToCover = cNear.distA;
  const distTargetToCover = cNear.distB;

  // 规则2: 距离压制——若攻击方离 C_near 的距离 < 被攻击方离 C_near 的距离，则视为无掩体
  if (distAttackerToCover < distTargetToCover) {
    return 1.0;
  }

  // 规则1: 结合目标车型（heightClass）与判定部位高度决定露出比例
  // 炮塔（zMin >= 1.2m）100% 露出
  if (zMin >= 1.2) {
    return 1.0;
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
    splashCoversAt,
    getCoverUnderTank,
    obbOverlap,
    obbMTV,
    resolveCoverCollisions,
    findCoversOnPath,
    getExposure,
    coverBlockInfo,
    isBlockedBySolidCover
  };
}
