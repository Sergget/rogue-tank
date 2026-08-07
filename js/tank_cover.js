'use strict';

const COVER_TIERS = {
  half: { label:'半高掩体',           fill:'rgba(166,138,60,0.4)',  stroke:'#a68a3c', mode:'graduated' },
  full: { label:'全高掩体',           fill:'rgba(106,106,106,0.55)', stroke:'#6a6a6a', mode:'solid' }
};

const DEFENSE_BASE = {
  medium: { hull:0.8,  turret:0.15 },
  heavy:  { hull:0.6,  turret:0.10 }
};

const ATTACKER_AMPLITUDE_FACTOR = 0.5;

function distanceTier(dist){
  if(dist <= 15) return 1.0;
  if(dist <= 45) return 0.55;
  if(dist <= 90) return 0.22;
  return 0;
}

const covers = [
  { x:470, y:300, w:80, h:34, angle:0, tier:'half' },
  { x:660, y:300, w:70, h:34, angle:0, tier:'full' }
];

function getCoverUnderTank(tank) {
  const tankCorners = partCorners(tank.x, tank.y, tank.hullAngle, tank.hullLen/2, tank.hullWid/2);
  for (const cov of covers) {
    const covCorners = partCorners(cov.x, cov.y, cov.angle, cov.w/2, cov.h/2);
    if (obbOverlap(tankCorners, covCorners)) return cov;
  }
  return null;
}

function obbOverlap(cornersA, cornersB) {
  function getAxes(corners) {
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
  function project(corners, axis) {
    let min = Infinity, max = -Infinity;
    for (const c of corners) {
      const d = c.x * axis.x + c.y * axis.y;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return { min, max };
  }
  const axes = getAxes(cornersA).concat(getAxes(cornersB));
  for (const axis of axes) {
    const pA = project(cornersA, axis);
    const pB = project(cornersB, axis);
    if (pA.max < pB.min || pB.max < pA.min) return false;
  }
  return true;
}

function obbMTV(tankCorners, covCorners) {
  function getAxes(corners) {
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
  function project(corners, axis) {
    let min = Infinity, max = -Infinity;
    for (const c of corners) {
      const d = c.x * axis.x + c.y * axis.y;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return { min, max };
  }
  const axes = getAxes(tankCorners).concat(getAxes(covCorners));
  let minDepth = Infinity;
  let mtvAxis = null;
  for (const axis of axes) {
    const pA = project(tankCorners, axis);
    const pB = project(covCorners, axis);
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

function resolveFullCoverCollisions(tank) {
  const tankCorners = () => partCorners(tank.x, tank.y, tank.hullAngle, tank.hullLen/2, tank.hullWid/2);
  for (const cov of covers) {
    if (COVER_TIERS[cov.tier].mode !== 'solid') continue;
    const covCorners = partCorners(cov.x, cov.y, cov.angle, cov.w/2, cov.h/2);
    const mtv = obbMTV(tankCorners(), covCorners);
    if (mtv) {
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
    const corners = partCorners(cov.x,cov.y,cov.angle, cov.w/2, cov.h/2);
    let nearest = null;
    for(let i=0;i<4;i++){
      const a=corners[i], b=corners[(i+1)%4];
      const hit = segRayIntersect(ox,oy,ux,uy, a.x,a.y,b.x,b.y);
      if(hit && hit.t>0.5 && hit.t<dist && (!nearest || hit.t<nearest.t)) nearest = hit;
    }
    if(nearest){
      hits.push({ cover:cov, distA:nearest.t, distB:dist-nearest.t, point:{x:ox+ux*nearest.t,y:oy+uy*nearest.t} });
    }
  }
  hits.sort((a,b)=>a.distA-b.distA);
  return hits;
}

function getExposure(ox,oy,tx,ty, shooter, target, zMin, zMax) {
  const hits = findCoversOnPath(ox,oy,tx,ty);
  let effectiveCoverH = 0;

  for(const h of hits){
    const coverMaxH = HEIGHTS.cover[h.cover.tier] || 0;
    if (COVER_TIERS[h.cover.tier].mode === 'solid') return 0;
    const targetProximity = distanceTier(h.distB);
    // 距离分档只衰减"高出掩体顶部"的部分：整个高度都 ≤ 掩体高度的部位（中坦车体 1.4 ≤
    // 半高掩体 1.4）无论离开掩体多远都保持全遮蔽，不会被距离分档"揭盖"。只有高于掩体的
    // 部分（重坦车体 / 任何炮塔）才按距离分档衰减有效遮挡高度。
    const hEff = coverMaxH * (0.4 + 0.6 * targetProximity);
    effectiveCoverH = Math.max(effectiveCoverH, (zMax <= coverMaxH) ? coverMaxH : hEff);
  }

  const exposedHeight = Math.max(0, zMax - effectiveCoverH);
  if (exposedHeight < 0.001) return 0;
  
  const totalPartHeight = zMax - zMin;
  const partExposure = Math.max(0, zMax - Math.max(zMin, effectiveCoverH));
  
  return Math.min(1, partExposure / totalPartHeight);
}

function coverBlockInfo(ox,oy,tx,ty, shooter, target, part){
  const z = getPartZRange(target, part);
  const exposure = getExposure(ox,oy,tx,ty, shooter, target, z.zMin, z.zMax);
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
    DEFENSE_BASE,
    ATTACKER_AMPLITUDE_FACTOR,
    distanceTier,
    covers,
    getCoverUnderTank,
    obbOverlap,
    obbMTV,
    resolveFullCoverCollisions,
    findCoversOnPath,
    getExposure,
    coverBlockInfo,
    isBlockedBySolidCover
  };
}
