'use strict';

// tank_fx.js — combat visual effects (弹药架殉爆 / 履带断裂 / 起火 / 殉爆火球 / 粒子).
// Pure data + simulation: spawn functions only push into the shared FX arrays, and every draw
// function takes an explicit ctx (tank_paint.js convention) so nothing here touches the DOM.
// The prototype drives this module from its own update()/draw() loop.
//
//   updateFx(dt)               — advance all effect timers (call once per frame)
//   drawExplosions(ctx)        — 殉爆火球（扩张并淡出）
//   drawTurretFlights(ctx)     — 被掀飞的炮塔（飞头）：上升→抛物线坠地，持续自旋并冒烟
//   drawFxParticles(ctx)       — 火焰 / 浓烟 / 破片粒子

let explosions = [];     // 殉爆/爆破火球: {x,y,life,max,scale,style}
let turretFlights = [];  // 被掀飞的炮塔（飞头）: {x,y,ang,vx,vy,spin,age,max,snap}
let fxParticles = [];    // 火焰/浓烟/破片/火花粒子
let muzzleFlashes = [];  // 炮口闪光: {x,y,ang,life,max,big,muzzle}
let hitFx = [];          // 命中/擦弹特效: {x,y,ang,life,max,outcome,scale}
let shockwaves = [];     // 冲击波环: {x,y,r,maxR,life,max,color,width}
let scorchMarks = [];    // 地面灼痕/弹坑: {x,y,r,ang,life,max,opacity}
let tracers = [];        // 曳光拖尾短亮线段: {x1,y1,x2,y2,life,max,color}
// #U38（2026-10-18）电磁炮击发放电：炮身甩出的电离弧线。
//   与 muzzleFlashes 分开存放的理由：炮口焰是「亮度团」，放电弧是**沿炮管走向的折线**，
//   生命周期（0.22s）也比炮口焰（0.18s）长，混在一起会互相压暗。
//   { x, y, ang, len, scale, seed, life, max }
let railArcs = [];
const FX_MAX_PARTICLES = 1200;
const FX_MAX_RAIL_ARCS = 24;
const FX_MAX_SCORCH = 80;

// ---------- 绘制期确定性随机 ----------
// 约定（#FX2-2026-10-18）：**spawn 阶段**可以用 Math.random（每次爆炸本来就该不同），
// **draw 阶段**一律不许用——同一份 FX 状态在同一帧反复重绘必须字节一致（离线生图/回归
// 快照/暂停重绘都依赖它），否则效果会「闪烁抖动」，且 Node 生图不可复现。
// 这里提供一个纯函数哈希：同一 (输入, 时间量子) 恒得同一值。
function _fxHash(v){
  let n = Math.imul(Math.round(v * 1000) | 0, 0x9E3779B1);
  n = Math.imul(n ^ (n >>> 15), 0x85EBCA77);
  n = Math.imul(n ^ (n >>> 13), 0xC2B2AE3D);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
// 单调时钟（毫秒）。Node 垫片里 performance.now 返回固定值 → 生图完全静态可复现。
function _fxNow(){
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now() : 0;
}
// 火焰/火光贴图缓存：把径向渐变**烘焙成一张小图**，绘制期只做 drawImage。
// 旧实现给每个火焰粒子每帧新建一个 createRadialGradient（满载 1200 粒子时每帧上千次对象
// 分配 + 上千次渐变栅格化），是特效层最大的一处热点；按整数半径分桶后每个尺寸只烘焙一次。
const FX_GLOW_CACHE = new Map();
function _flameGlowSprite(radius){
  const r = Math.max(2, Math.round(radius));
  if (FX_GLOW_CACHE.has(r)) return FX_GLOW_CACHE.get(r);
  if (typeof document === 'undefined' || !document.createElement) { FX_GLOW_CACHE.set(r, null); return null; }
  const d = r * 2 + 2;
  const cv = document.createElement('canvas');
  cv.width = d; cv.height = d;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(r + 1, r + 1, 0, r + 1, r + 1, r);
  grad.addColorStop(0,   'rgba(255,215,90,0.85)');
  grad.addColorStop(0.5, 'rgba(255,130,35,0.50)');
  grad.addColorStop(1,   'rgba(180,70,20,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(r + 1, r + 1, r, 0, Math.PI * 2); g.fill();
  FX_GLOW_CACHE.set(r, cv);
  return cv;
}
function clearFxGlowCache(){ FX_GLOW_CACHE.clear(); }

// #FX3-2026-10-18：殉爆主火球同样走「烘焙一次 + blit」。
//   `drawExplosions` 每帧为每个爆炸新建径向渐变（与修掉火焰粒子的是同一个热点，只是量级小些）。
//   火球的多段色阶与 alpha 成**同一线性因子 (1-t)**，因此可以按满不透明度烘焙、再用
//   `globalAlpha = a` 贴回 —— 视觉等价（rgba(c, α·a) ≡ rgba(c, α) @ globalAlpha=a）。
//   半径按 2px 分桶，桶数受爆炸尺寸范围限制（十几档），分配次数从 O(爆炸数/帧) 降到 O(1)。
const FX_BOOM_CACHE = new Map();
function _explosionSprite(radius){
  const r = Math.max(4, Math.round(radius / 2) * 2);
  if (FX_BOOM_CACHE.has(r)) return FX_BOOM_CACHE.get(r);
  if (typeof document === 'undefined' || !document.createElement) { FX_BOOM_CACHE.set(r, null); return null; }
  const d = r * 2 + 2;
  const cv = document.createElement('canvas');
  cv.width = d; cv.height = d;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(r + 1, r + 1, 0, r + 1, r + 1, r);
  grad.addColorStop(0,    'rgba(255,240,190,0.95)');
  grad.addColorStop(0.22, 'rgba(255,196,90,0.80)');
  grad.addColorStop(0.5,  'rgba(232,118,40,0.52)');
  grad.addColorStop(0.78, 'rgba(160,60,22,0.22)');
  grad.addColorStop(1,    'rgba(90,35,15,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(r + 1, r + 1, r, 0, Math.PI * 2); g.fill();
  FX_BOOM_CACHE.set(r, cv);
  return cv;
}
function clearFxBoomCache(){ FX_BOOM_CACHE.clear(); }

// #FX3-2026-10-18：通用「径向渐变 sprite」缓存。
//   `drawExplosions` 里除主火球外还有 3 处径向渐变（外烟壳 / 地面受光晕 / 白热核），
//   全都是「同色阶 + 只随半径缩放」的东西 —— 按 (色阶名 + 半径档) 烘焙一次即可。
//   色阶一律按**满 alpha** 烘焙，绘制期用 globalAlpha 承载实际不透明度：
//   rgba(c, α) 配 globalAlpha=β 与 rgba(c, α·β) 在 source-over 下等价。
const FX_RADIAL_CACHE = new Map();
function _radialSprite(kind, radius){
  const r = Math.max(3, Math.round(radius / 2) * 2);
  const key = kind + ':' + r;
  if (FX_RADIAL_CACHE.has(key)) return FX_RADIAL_CACHE.get(key);
  if (typeof document === 'undefined' || !document.createElement) { FX_RADIAL_CACHE.set(key, null); return null; }
  const STOPS = {
    // 外烟壳：内浓外淡的深灰（要有暗部就必须 source-over，由调用方决定合成模式）
    smoke:  [[0, 'rgba(58,50,44,1)'], [0.45, 'rgba(52,45,40,0.75)'], [1, 'rgba(34,30,26,0)']],
    // 地面受光：暖橙色地面反照
    lit:    [[0, 'rgba(255,190,110,1)'], [1, 'rgba(255,150,60,0)']],
    // 白热核：中心过曝、边缘迅速转暖
    core:   [[0, 'rgba(255,255,246,1)'], [1, 'rgba(255,235,170,0.10)']],
    // #U39（2026-10-19）：冷白核心——电磁炮口径（不带琥珀色，纯白→冷白）
    coreW:  [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(238,246,255,0.85)'], [1, 'rgba(205,225,255,0.12)']],
    // 炮口外发光
    halo:   [[0, 'rgba(255,190,90,1)'], [1, 'rgba(255,190,90,0)']],
    haloR:  [[0, 'rgba(150,220,255,1)'], [1, 'rgba(150,220,255,0)']],
    // #U39（2026-10-19）：冷白晕——电磁炮的「白色弧光」口径（炮身充能核 / 白热弧晕）。
    //   与 haloR（青蓝）刻意区分：用户裁定弧光为**白**，青蓝只保留给旧的跳弹/护盾语义。
    haloW:  [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(226,238,255,0.85)'], [1, 'rgba(210,230,255,0)']]
  };
  const stops = STOPS[kind] || STOPS.halo;
  const d = r * 2 + 2;
  const cv = document.createElement('canvas');
  cv.width = d; cv.height = d;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(r + 1, r + 1, 0, r + 1, r + 1, r);
  for (const [pos, col] of stops) grad.addColorStop(pos, col);
  g.fillStyle = grad;
  g.beginPath(); g.arc(r + 1, r + 1, r, 0, Math.PI * 2); g.fill();
  FX_RADIAL_CACHE.set(key, cv);
  return cv;
}
function clearFxRadialCache(){ FX_RADIAL_CACHE.clear(); }

// #FX3-2026-10-18：炮口**火舌** sprite 缓存。
//   每个火舌原本要做 2 次 createLinearGradient（外焰 + 内焰），而一帧里可能有 10+ 个炮口、
//   每个炮口 3~6 个方向的火舌 —— 实测 10 个炮口类型一帧就分配 61 个渐变对象。
//   火舌几何完全由 (widthAng, lenFactor) 决定、颜色与不透明度恒定，只有**尺寸**随 r 变，
//   因此可以按 (宽度角 + 长度系数) 烘焙一张朝 +x 的单位火舌，绘制期 drawImage 缩放 + 旋转。
//   烘焙分辨率取 96px 长（实机火舌 12~70px，属于降采样，柔化后无差别）。
const FX_PLUME_CACHE = new Map();
const FX_PLUME_BAKE_LEN = 96;
function _plumeSprite(widthAng, lenFactor){
  // 量化：宽度角 0.05 rad 一档、长度系数 0.05 一档（视觉无差异，桶数有限）
  const wa = Math.round(widthAng / 0.05) * 0.05;
  const lf = Math.round(lenFactor / 0.05) * 0.05;
  const key = wa + ':' + lf;
  if (FX_PLUME_CACHE.has(key)) return FX_PLUME_CACHE.get(key);
  if (typeof document === 'undefined' || !document.createElement) { FX_PLUME_CACHE.set(key, null); return null; }
  // 单位几何：沿 +x 的扇形，半径 R = len*2.4、张角 ±wa（上下对称）。
  //   ⚠ 画布必须按**弧的实际垂直/水平伸展**（R·sin(wa) / R）来定尺寸，不能按 len 定：
  //   R 是 len 的 2.4 倍，按 len 定高会把外焰垂直方向裁掉一半（实测 wa=0.65 时缺口 58px，
  //   画出来像被水平切掉的梯形）。这里按 R 派生包围盒。
  const len = FX_PLUME_BAKE_LEN * Math.max(0.3, lf);
  const R = len * 2.4;
  const R2 = len * 1.5;
  const waR = Math.min(1.4, wa);                   // 弧度上限，与下方 arc 调用一致
  const pad = 2;
  // 外层扇形垂直伸展 = R·sin(waR)；水平伸展 = R（顶点在 x=0，弧最右点 x=R）
  const vReach = Math.max(R * Math.sin(waR), R2 * Math.sin(waR * 0.45)) + pad;
  const hReach = R + pad;
  const wpx = Math.ceil(hReach) + pad;
  const hpx = Math.ceil(vReach * 2) + pad;
  const cv = document.createElement('canvas');
  cv.width = wpx; cv.height = hpx;
  const g = cv.getContext('2d');
  const ox = pad, oy = hpx / 2;
  // 外层：宽、暗、长（湍流外焰）
  const outer = g.createLinearGradient(0, 0, R, 0);
  outer.addColorStop(0,    'rgba(255,170,60,0.55)');
  outer.addColorStop(0.35, 'rgba(255,140,40,0.40)');
  outer.addColorStop(1,    'rgba(190,70,20,0)');
  g.fillStyle = outer;
  g.beginPath(); g.moveTo(ox, oy); g.arc(ox, oy, R, -waR, waR); g.closePath(); g.fill();
  // 内层：窄、亮、短（白热芯）
  const inner = g.createLinearGradient(0, 0, R2, 0);
  inner.addColorStop(0,   'rgba(255,252,232,0.92)');
  inner.addColorStop(0.5, 'rgba(255,222,130,0.55)');
  inner.addColorStop(1,   'rgba(255,150,50,0)');
  g.fillStyle = inner;
  g.beginPath(); g.moveTo(ox, oy); g.arc(ox, oy, R2, -waR * 0.45, waR * 0.45); g.closePath(); g.fill();
  const spr = { canvas: cv, ox, oy, R, len };
  FX_PLUME_CACHE.set(key, spr);
  return spr;
}
function clearFxPlumeCache(){ FX_PLUME_CACHE.clear(); }
// 统一贴图：img 为 _radialSprite 返回值，半径 = half - 1（烘焙时圆心在 (r+1, r+1)）
function _blitRadial(ctx, img, x, y, radius, alpha, composite){
  if (!img) return false;
  ctx.save();
  if (composite) ctx.globalCompositeOperation = composite;
  ctx.globalAlpha = alpha;
  const half = radius + 1;
  ctx.drawImage(img, x - half, y - half);
  ctx.restore();
  return true;
}

// Particle Object Pool to eliminate GC and memory allocation overhead
const PARTICLE_POOL = [];
function getPooledParticle(kind, x, y, vx, vy, max, size, extra) {
  let p;
  if (PARTICLE_POOL.length > 0) {
    p = PARTICLE_POOL.pop();
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.age = 0;
    p.max = max;
    p.size = size;
    p.extra = extra || null;
  } else {
    p = { kind, x, y, vx, vy, age: 0, max, size, extra: extra || null };
  }
  return p;
}
function releaseParticle(p) {
  if (PARTICLE_POOL.length < 2000) {
    PARTICLE_POOL.push(p);
  }
}

function spawnFlame(x,y,spread,speedMul){
  if (fxParticles.length > FX_MAX_PARTICLES) return;
  const mul = speedMul || 1;
  const a = Math.random()*TAU, sp = (20 + Math.random()*(spread||80)) * mul;
  fxParticles.push(getPooledParticle('flame', x, y, Math.cos(a)*sp, Math.sin(a)*sp - 35*mul,
    0.35 + Math.random()*0.45, 5 + Math.random()*8));
}
function spawnSmoke(x,y,spread,speedMul){
  if (fxParticles.length > FX_MAX_PARTICLES) return;
  const mul = speedMul || 1;
  const a = Math.random()*TAU, sp = (8 + Math.random()*(spread||50)) * 0.45 * mul;
  fxParticles.push(getPooledParticle('smoke', x, y, Math.cos(a)*sp, Math.sin(a)*sp - 14*mul,
    0.8 + Math.random()*1.0, 6 + Math.random()*9));
}
function spawnDebris(x,y,spread,speedMul){
  if (fxParticles.length > FX_MAX_PARTICLES) return;
  const mul = speedMul || 1;
  const a = Math.random()*TAU, sp = (70 + Math.random()*(spread || 140)) * mul;
  fxParticles.push(getPooledParticle('debris', x, y, Math.cos(a)*sp, Math.sin(a)*sp - 50*mul,
    0.6 + Math.random()*0.5, 1.5 + Math.random()*2.5));
}
function spawnSpark(x, y, angle, speed, life, size, colType){
  if (fxParticles.length > FX_MAX_PARTICLES) return;
  fxParticles.push(getPooledParticle('spark', x, y,
    Math.cos(angle)*speed, Math.sin(angle)*speed,
    life, size || 1.4, colType || 'amber'));
}
function spawnShockwave(x, y, maxR, dur, color, width){
  shockwaves.push({ x, y, r: 2, maxR: maxR || 35, life: 0, max: dur || 0.35, color: color || 'rgba(255,210,120,0.8)', width: width || 2.5 });
}
function spawnScorchMark(x, y, r){
  if (scorchMarks.length >= FX_MAX_SCORCH) {
    scorchMarks.shift();
  }
  scorchMarks.push({
    x, y,
    r: r || (12 + Math.random()*8),
    ang: Math.random()*TAU,
    life: 0,
    max: 20 + Math.random()*10,
    opacity: 0.6 + Math.random()*0.25
  });
}

function burstExplosion(x,y,scale,flames,smokes,debris){
  const sc = scale || 1.6;
  explosions.push({ x, y, life:0, max:0.65, scale:sc });
  spawnShockwave(x, y, 40 * sc, 0.35, 'rgba(255,200,100,0.8)', 2.5 * sc);
  spawnScorchMark(x, y, 16 * sc);
  for(let i=0;i<(flames||0);i++) spawnFlame(x + (Math.random()*26-13)*sc*0.5, y + (Math.random()*26-13)*sc*0.5, 160*sc, 1.2);
  for(let i=0;i<(smokes||0);i++) spawnSmoke(x + (Math.random()*30-15)*sc*0.5, y + (Math.random()*30-15)*sc*0.5, 90*sc, 1.1);
  for(let i=0;i<(debris||0);i++) spawnDebris(x, y, 160*sc, 1.2);
}
// 起火坦克：从发动机舱位置持续发射剧烈翻滚火焰与滚滚浓烟
function emitTankFire(t){
  if(fxParticles.length > FX_MAX_PARTICLES) return;
  const L = t.hullLen/2, W = t.hullWid/2;
  const ex = engineLocalX(t);
  const pts = [ [ex, -W*0.3], [ex, W*0.3], [ex*0.7, -W*0.15], [ex*0.7, W*0.15], [ex*0.35, 0] ];
  for(const [lx,ly] of pts){
    if(Math.random() < 0.65){
      const r = rotate(lx + (Math.random()*6-3), ly + (Math.random()*6-3), t.hullAngle);
      spawnFlame(t.x+r.x, t.y+r.y, 45, 0.8);
      if(Math.random() < 0.6) spawnSmoke(t.x+r.x, t.y+r.y, 25, 0.9);
      if(Math.random() < 0.25) spawnSpark(t.x+r.x, t.y+r.y, -Math.PI/2 + (Math.random()-0.5)*1.2, 50 + Math.random()*80, 0.35, 1.1, 'amber');
    }
  }
}
// 弹药架殉爆：戏剧化多阶火球 + 双重冲击波 + 炮塔掀飞（飞头）+ 焦痕 + 飞溅灼热碎片
function spawnAmmoBlowFx(t){
  const bp = t.blowHitPoint || { x:t.x, y:t.y };
  burstExplosion(bp.x, bp.y, 2.0, 70, 45, 36);
  spawnShockwave(bp.x, bp.y, 95, 0.55, 'rgba(255,235,160,0.95)', 4.5);
  spawnShockwave(bp.x, bp.y, 60, 0.4, 'rgba(255,140,50,0.85)', 3.0);
  spawnScorchMark(bp.x, bp.y, 30);
  
  // 四散的炽热重破片
  for(let i=0; i<18; i++){
    const ang = Math.random()*TAU;
    const spd = 120 + Math.random()*200;
    spawnSpark(bp.x, bp.y, ang, spd, 0.4 + Math.random()*0.5, 1.8 + Math.random()*1.5, 'orange');
  }

  const p = turretPivot(t);
  const px = p.x;
  const py = p.y;
  const ang = superstructureAngle(t);
  const tPoly = turretPoly(t);
  turretFlights.push({
    snap: { verts:(t.turretSpec && t.turretSpec.verts) || (Array.isArray(tPoly) ? tPoly : tPoly.verts), color:t.color, len:t.turLen, wid:t.turWid },
    x:px, y:py, ang,
    // 还原原方向动画但缩短飞行距离（vx/vy 减半、spin 适中）
    vx: Math.cos(ang) * (25 + Math.random()*40) + (Math.random()-0.5)*35,
    vy: -260 - Math.random()*120,
    spin: (Math.random()-0.5)*9,
    age:0, max:2.2 + Math.random()*0.6,
    // 记录初始水平线，用于“落回同一水平线即消失”判断
    baseY: py
  });
}
// 履带断裂：破片 + 火花 + 冲击灰尘（小规模）
function spawnTrackBreakFx(t){
  const p = t.trackFxPoint || { x:t.x, y:t.y };
  burstExplosion(p.x, p.y, 0.8, 12, 8, 12);
  spawnImpactFx(p.x, p.y, t.hullAngle, 'block', 0.9);
}
// 炮口闪光：出膛时在炮口位置生成带张力的定向火舌 + 侧向排气火花 + 冲击气浪
function spawnMuzzleFlash(x, y, angle, scale, muzzleType){
  const sc = scale || 1;
  const type = muzzleType || 'none';
  // 磁轨炮：电磁发射，持续稍长；机炮：高射速，闪光更短促
  const lifeMax = type === 'railgun' ? 0.18 : type === 'autocannon' ? 0.08 : 0.12;
  muzzleFlashes.push({ x, y, ang: angle || 0, life: 0, max: lifeMax, big: sc, muzzle: type });
  const waveCol = type === 'railgun' ? 'rgba(120,220,255,0.7)' : 'rgba(255,220,130,0.7)';
  spawnShockwave(x, y, 28 * sc, 0.18, waveCol, 2);

  // 喷射排气火花粒子
  const sparkCol = type === 'railgun' ? 'cyan' : 'amber';
  const emitDirSparks = (dirAng, count, spdMin, spdMax, spread) => {
    for(let i = 0; i < count; i++){
      const a = dirAng + (Math.random() - 0.5) * spread;
      const sp = (spdMin + Math.random() * (spdMax - spdMin)) * sc;
      spawnSpark(x, y, a, sp, 0.12 + Math.random() * 0.18, 1.2 + Math.random() * 0.8, sparkCol);
    }
  };

  emitDirSparks(angle, 6, 120, 240, 0.4);
  if(type === 'railgun'){
    // 磁轨炮：沿炮管方向的电弧火花
    emitDirSparks(angle + Math.PI/2, 5, 100, 200, 0.5);
    emitDirSparks(angle - Math.PI/2, 5, 100, 200, 0.5);
  }
  if(type === 'single' || type === 'double' || type === 'heavy_square' || type === 'cylinder'){
    emitDirSparks(angle + Math.PI/2, 4, 90, 180, 0.35);
    emitDirSparks(angle - Math.PI/2, 4, 90, 180, 0.35);
  }
}
// 曳光拖尾：出膛后每帧在炮弹上一帧→当前位置生成一段极短寿命的亮线，替代旧烟雾尾迹
function spawnTracer(x1, y1, x2, y2, color){
  tracers.push({ x1: x1, y1: y1, x2: x2, y2: y2, life: 0, max: 0.12, color: color || '#ffd24a' });
}
// ---------- #U38（2026-10-18）电磁轨道炮放电 ----------
// 参数唯一口径 RULES.railgunFx（见 js/tank_rules.js）；无 RULES 环境（Node 单测）回退字面量。
function _railFxCfg(){
  const R = (typeof RULES !== 'undefined' && RULES && RULES.railgunFx) ? RULES.railgunFx : null;
  return R || { dischargeArcs: 9, dischargeLife: 0.22, dischargeLenMult: 1.5 };
}
// 击发瞬间沿炮身甩出的电离弧（spawn 期允许 Math.random：每次开火本就该不同）。
//   #U39（2026-10-19 用户裁定）：弧**只挂在炮身上**，不跟随炮弹；配色为**白**（弧芯纯白 +
//   冷白晕），不再用青蓝。弧沿炮管轴向分布（横向抖动限制在炮身宽度内），读作「炮身放电」。
//   x0,y0 : 炮管根部（gunRoot）；ang : 炮塔朝向；len : 炮管可视长度（px）
//   scale : 整体缩放（与炮口焰同口径，默认 1）
function spawnRailDischarge(x0, y0, ang, len, scale){
  const cfg = _railFxCfg();
  const n = Math.max(1, cfg.dischargeArcs | 0);
  const sc = scale || 1;
  const L = Math.max(8, (len || 40) * (cfg.dischargeLenMult || 1.5));
  const amp = (cfg.dischargeAmp || 2.2) * sc;
  const w = (cfg.dischargeWidth || 0.9) * sc;
  for(let i = 0; i < n; i++){
    if(railArcs.length >= FX_MAX_RAIL_ARCS) railArcs.shift();
    railArcs.push({
      x: x0, y: y0, ang: ang || 0,
      len: L * (0.45 + Math.random() * 0.85),
      amp: amp * (0.6 + Math.random() * 0.8),
      w: w * (0.7 + Math.random() * 0.6),
      // 起点沿炮管前后铺开的比例（0=炮尾，1=炮口方向）——让弧覆盖整根炮身而非全挤在根部
      startT: Math.random() * 0.55,
      seed: Math.random() * 97,
      life: 0, max: (cfg.dischargeLife || 0.22) * (0.7 + Math.random() * 0.6)
    });
  }
}
// 放电弧当前条数（#U38）。
// 为什么需要这个访问器：`updateFx` 用 `railArcs = railArcs.filter(...)` **重新赋值**数组，
//   module.exports 里导出的 `railArcs` 只是导出那一刻的引用——过滤一次之后就指向旧数组，
//   外部读到的条数永远是陈旧值（同 `tracers`/`shockwaves` 等既有数组的同一陷阱）。
//   测试与 HUD 想读「当前有几条」一律走这里。
function railArcCount(){ return railArcs.length; }

// 放电弧绘制。抖动由 (seed, 时间量子) 派生 → 同帧重绘逐字节一致（不碰 Math.random）。
//   #U39（2026-10-19）：弧为**白色**（纯白弧芯 + 冷白晕），且**只画在炮身上**——
//   起点按 startT 沿炮管轴向铺开，横向抖动被限制在炮身宽度内（不再当作向四周喷射的电光）。
function drawRailArcs(ctx){
  if(!railArcs.length) return;
  const cfg = _railFxCfg();
  const arcWhite = cfg.arcWhite || '#ffffff';
  const arcHalo = cfg.arcHalo || 'rgba(214,232,255,1)';
  const q = Math.floor(_fxNow() * 60) | 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for(const a of railArcs){
    const t = Math.min(1, a.life / a.max);
    const alpha = Math.max(0, 1 - t) * (1 - t * 0.25);
    if(alpha <= 0.004) continue;
    // 电弧在寿命内**沿炮身方向收束**（击发后能量离开炮身），起点仍锁在炮身上
    const grow = 0.55 + t * 0.75;
    const ca = Math.cos(a.ang), sa = Math.sin(a.ang);
    const sx = a.x + ca * (a.len * (a.startT || 0));
    const sy = a.y + sa * (a.len * (a.startT || 0));
    // 横向振幅压到炮身量级（amp/w 由 RULES.railgunFx 给出），保证「贴着炮身」而非飞散
    const pts = lightningPath(sx, sy, a.ang, a.len * grow * (1 - (a.startT || 0)), a.amp || 2.2, 6, a.seed + q * 0.013);
    // 外层冷白晕
    ctx.strokeStyle = arcHalo;
    ctx.globalAlpha = 0.34 * alpha;
    ctx.lineWidth = (a.w || 0.9) * 3.2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // 内层纯白弧芯
    ctx.strokeStyle = arcWhite;
    ctx.globalAlpha = 0.95 * alpha;
    ctx.lineWidth = Math.max(0.5, a.w || 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
// 命中/擦弹特效：冲击闪光 + 锥形喷射火花 + 冲击波环 + 飞溅烟尘。
// outcome: 'pen'|'he'|'block'|'bounce' + 2026-10-22 B5-2 新增的家族化三档：
//   'impact_ap' / 'impact_heat' / 'impact_he'（'impact_he' 是 'he' 的**别名**，零回归）。
//   接线口径（tank_battle.html / tank_fire.js 由调用方改）：命中结算时把 outcome 从 'pen'
//   改成按 `s.ammoKey` 的 family 选的 'impact_ap' / 'impact_heat' / 'impact_he'；
//   'bounce' / 'block' 两档**保持通用**，不按系列拆分（避免组合爆炸）。
function spawnImpactFx(x, y, angle, outcome, scale){
  let o = outcome || 'pen';
  // 家族别名：impact_he → he（保留现有 he 实现；老调用点（'he'）行为逐字不变）
  if(o === 'impact_he') o = 'he';
  const sc = scale || 1;
  hitFx.push({ x, y, ang: angle || 0, life: 0, max: o === 'bounce' ? 0.18 : 0.28, outcome: o, scale: sc });
  
  if (o === 'he') {
    // 高爆大范围爆轰：烈焰冲击波 + 环形烈焰破片 + 焦痕
    spawnShockwave(x, y, 55 * sc, 0.3, 'rgba(255,180,70,0.85)', 3.0 * sc);
    spawnScorchMark(x, y, 20 * sc);
    const sparks = 24;
    for(let i = 0; i < sparks; i++){
      const a = Math.random() * TAU;
      const spd = (160 + Math.random() * 240) * sc;
      spawnSpark(x, y, a, spd, 0.2 + Math.random() * 0.35, 1.4 + Math.random() * 1.4, 'orange');
    }
    for(let i = 0; i < 8; i++){
      spawnFlame(x + (Math.random()*12-6), y + (Math.random()*12-6), 90 * sc, 1.1);
      spawnSmoke(x + (Math.random()*16-8), y + (Math.random()*16-8), 60 * sc, 1.0);
    }
    for(let i = 0; i < 10; i++){
      spawnDebris(x, y, 120 * sc, 1.1);
    }
  } else if (o === 'impact_ap') {
    // 击穿（AP 家族）：窄锥火花束 + 金属碎屑 + 小冲击环，**无焦痕**（动能弹穿而不烧）
    spawnShockwave(x, y, 22 * sc, 0.18, 'rgba(207,233,255,0.85)', 1.8 * sc);
    // 12 束火花，集中在入射方向 ±0.35rad 的窄锥内，速度 260~420
    for(let i = 0; i < 12; i++){
      const a = (angle || 0) + (Math.random() - 0.5) * 0.70;
      const spd = (260 + Math.random() * 160) * sc;
      spawnSpark(x, y, a, spd, 0.16 + Math.random() * 0.22, 1.2 + Math.random() * 1.0, 'cyan');
    }
    // 3 片金属碎屑（沿入射方向前抛，不做全向飞散——动能弹的穿出物有方向性）
    for(let i = 0; i < 3; i++){
      const a = (angle || 0) + (Math.random() - 0.5) * 1.1;
      const spd = (120 + Math.random() * 140) * sc;
      if(fxParticles.length >= FX_MAX_PARTICLES) break;
      fxParticles.push(getPooledParticle('debris', x, y,
        Math.cos(a) * spd, Math.sin(a) * spd - 20 * sc,
        0.55 + Math.random() * 0.35, 1.4 + Math.random() * 1.6));
    }
  } else if (o === 'impact_heat') {
    // 击穿（HEAT 家族）：定向金属射流 + 高温熔滴 + 小爆点 + 小焦痕
    // ① 定向射流：1 条 60px 亮橙射线，沿入射方向（射流穿透后继续前冲）
    const ja = angle || 0;
    tracers.push({
      x1: x, y1: y,
      x2: x + Math.cos(ja) * 60 * sc, y2: y + Math.sin(ja) * 60 * sc,
      color: '#ffd23c', life: 0, max: 0.14
    });
    // ② 小爆点（半径 14）+ 焦痕 8px
    spawnShockwave(x, y, 14 * sc, 0.16, 'rgba(255,210,60,0.9)', 1.6 * sc);
    spawnScorchMark(x, y, 8 * sc);
    // ③ 8 粒高温熔滴（小圆、寿命 0.25s，沿入射方向窄锥喷出）
    for(let i = 0; i < 8; i++){
      const a = ja + (Math.random() - 0.5) * 0.9;
      const spd = (90 + Math.random() * 130) * sc;
      spawnSpark(x, y, a, spd, 0.25, 1.1 + Math.random() * 0.9, 'amber');
    }
    // ④ 少量白热烟（射流气化产物）
    for(let i = 0; i < 2; i++) spawnSmoke(x + (Math.random()*6-3), y + (Math.random()*6-3), 30 * sc, 0.8);
  } else if (o === 'pen') {
    // 击穿：高亮向后穿透破片火花 + 金属碎屑 + 橙红冲击环
    spawnShockwave(x, y, 32 * sc, 0.22, 'rgba(255,210,110,0.8)', 2.2 * sc);
    spawnScorchMark(x, y, 11 * sc);
    // 沿入射方向前突与两侧喷射的炽热破片
    for(let i = 0; i < 16; i++){
      const a = (angle || 0) + (Math.random() - 0.5) * 2.2;
      const spd = (180 + Math.random() * 220) * sc;
      spawnSpark(x, y, a, spd, 0.18 + Math.random() * 0.3, 1.3 + Math.random() * 1.2, 'amber');
    }
    // 少量反向回溅火花
    for(let i = 0; i < 5; i++){
      const a = (angle || 0) + Math.PI + (Math.random() - 0.5) * 1.4;
      spawnSpark(x, y, a, (100 + Math.random() * 120) * sc, 0.15 + Math.random() * 0.2, 1.1, 'amber');
    }
    for(let i = 0; i < 4; i++){
      spawnSmoke(x + (Math.random()*8-4), y + (Math.random()*8-4), 35 * sc, 0.9);
      spawnDebris(x, y, 90 * sc, 0.9);
    }
  } else if (o === 'bounce') {
    // 跳弹：锐利高亮电光蓝白火花喷溅 + 沿反弹方向的束状火针
    spawnShockwave(x, y, 22 * sc, 0.16, 'rgba(160,220,255,0.85)', 2.0 * sc);
    for(let i = 0; i < 14; i++){
      const a = (angle || 0) + (Math.random() - 0.5) * 1.1; // 集中在反射方向锥内
      const spd = (200 + Math.random() * 280) * sc;
      spawnSpark(x, y, a, spd, 0.15 + Math.random() * 0.25, 1.3 + Math.random() * 1.1, 'cyan');
    }
    for(let i = 0; i < 6; i++){
      const a = Math.random() * TAU;
      spawnSpark(x, y, a, (80 + Math.random() * 140) * sc, 0.12 + Math.random() * 0.18, 1.0, 'cyan');
    }
  } else {
    // 未击穿 (block)：钝感灰白/亮橙跳屑 + 黑色碎渣 + 灰烟
    spawnShockwave(x, y, 18 * sc, 0.15, 'rgba(230,210,170,0.6)', 1.8 * sc);
    spawnScorchMark(x, y, 8 * sc);
    for(let i = 0; i < 9; i++){
      const a = (angle || 0) + Math.PI + (Math.random() - 0.5) * 1.8; // 反弹向外
      const spd = (120 + Math.random() * 160) * sc;
      spawnSpark(x, y, a, spd, 0.12 + Math.random() * 0.22, 1.1 + Math.random() * 0.9, 'amber');
    }
    for(let i = 0; i < 3; i++){
      spawnSmoke(x + (Math.random()*6-3), y + (Math.random()*6-3), 20 * sc, 0.7);
      spawnDebris(x, y, 60 * sc, 0.7);
    }
  }
}

// advance all fantasy combat effect timers (call once per frame with the game dt)
function updateFx(dt){
  explosions.forEach(x=>x.life+=dt); explosions = explosions.filter(x=>x.life < x.max);
  turretFlights.forEach(f=>{
    f.age += dt; f.vy += 260*dt; f.x += f.vx*dt; f.y += f.vy*dt; f.ang += f.spin*dt;
    if(Math.random() < 0.35 && fxParticles.length < FX_MAX_PARTICLES) spawnSmoke(f.x, f.y, 8);
  });
  turretFlights = turretFlights.filter(f=>{
    // 当炮塔落回与被击毁坦克同一水平线（y >= baseY）即消失
    if(f.baseY !== undefined && f.y >= f.baseY) return false;
    return f.age < f.max;
  });
  
  const activeParticles = [];
  for (let i = 0; i < fxParticles.length; i++) {
    const p = fxParticles[i];
    p.age += dt;
    if (p.age < p.max) {
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      if(p.kind === 'spark'){ p.vx *= 0.96; p.vy = p.vy*0.96 + 50*dt; }
      else if(p.kind !== 'debris'){ p.vx *= 0.985; }
      else { p.vy += 220*dt; }
      activeParticles.push(p);
    } else {
      releaseParticle(p);
    }
  }
  fxParticles = activeParticles;
  
  muzzleFlashes.forEach(f=>f.life+=dt); muzzleFlashes = muzzleFlashes.filter(f=>f.life < f.max);
  hitFx.forEach(f=>f.life+=dt); hitFx = hitFx.filter(f=>f.life < f.max);
  shockwaves.forEach(s=>s.life+=dt); shockwaves = shockwaves.filter(s=>s.life < s.max);
  scorchMarks.forEach(s=>s.life+=dt); scorchMarks = scorchMarks.filter(s=>s.life < s.max);
  trackMarks.forEach(m=>m.life+=dt); trackMarks = trackMarks.filter(m=>m.life < m.max);   // #U41：履带痕迹寿命
  tracers.forEach(t=>t.life+=dt); tracers = tracers.filter(t=>t.life < t.max);
  // #U38：电磁炮击发放电弧
  railArcs.forEach(a=>a.life+=dt); railArcs = railArcs.filter(a=>a.life < a.max);
}

// 殉爆火球（扩张并淡出）
// #FX3-2026-10-18：单层径向渐变 → **三层火球**（外烟壳 / 主火球 / 白热核）+ 地面受光晕。
//   旧版整颗火球是同一套渐变色跑到底，看起来像「一颗橙色气球在放大」；
//   真实殉爆是：外层黑烟先膨胀 → 中层橙红火焰 → 内核白热，且地面被瞬间照亮一圈。
//   全部由 ex.life 派生（确定性），不引入随机数。
function drawExplosions(ctx){
  for(const ex of explosions){
    const t = Math.min(1, ex.life / ex.max);
    const r = 14 + t*46*ex.scale;
    const a = Math.max(0, 1-t);
    // ① 外烟壳：比火球更大、扩散更快，用 source-over 才有「暗部」
    //    #FX3：径向渐变 → 缓存 sprite（rgba(c,1) 烘焙 + globalAlpha 承载 (1-t) 因子）
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const smokeR = r * (1.15 + t * 0.55);
    if (!_blitRadial(ctx, _radialSprite('smoke', smokeR), ex.x, ex.y, smokeR, 0.42 * a, 'source-over')) {
      const smokeGrad = ctx.createRadialGradient(ex.x, ex.y, smokeR * 0.45, ex.x, ex.y, smokeR);
      smokeGrad.addColorStop(0, `rgba(58,50,44,${0.42*a})`);
      smokeGrad.addColorStop(1, 'rgba(34,30,26,0)');
      ctx.fillStyle = smokeGrad;
      ctx.beginPath(); ctx.arc(ex.x, ex.y, smokeR, 0, TAU); ctx.fill();
    }
    // ② 地面受光晕：火球照亮脚下地面（只在火球早期明显，后期随烟散掉）
    const litA = a * (1 - t * 0.75) * 0.22;
    if (litA > 0.004) {
      const litR = r * 1.75;
      if (!_blitRadial(ctx, _radialSprite('lit', litR), ex.x, ex.y, litR, litA, 'lighter')) {
        const litGrad = ctx.createRadialGradient(ex.x, ex.y, r * 0.6, ex.x, ex.y, litR);
        litGrad.addColorStop(0, `rgba(255,190,110,${litA})`);
        litGrad.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = litGrad;
        ctx.beginPath(); ctx.arc(ex.x, ex.y, litR, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    // ③ 主火球（加法混合）：改用预烘焙 sprite + globalAlpha（#FX3，见 _explosionSprite）
    //    等价性：rgba(c, α·a) 在 source-over/lighter 下与 rgba(c, α) 配 globalAlpha=a 相同
    //    （lighter 的贡献是 c·α·a，两种写法都得到 c·α·a）。唯一差异是合并后 alpha 的通式，
    //    对 lighter 而言两者都是 min(1, ...)，故视觉一致。
    const boom = _explosionSprite(r);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (boom) {
      ctx.globalAlpha = a;
      const half = boom.width / 2;
      ctx.drawImage(boom, ex.x - half, ex.y - half);
      ctx.globalAlpha = 1;
    } else {
      // 无 canvas 环境（Node 纯逻辑测试）回退到即时渐变，保证 draw 不抛错
      const grad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, r);
      grad.addColorStop(0,    `rgba(255,240,190,${0.95*a})`);
      grad.addColorStop(0.22, `rgba(255,196,90,${0.80*a})`);
      grad.addColorStop(0.5,  `rgba(232,118,40,${0.52*a})`);
      grad.addColorStop(0.78, `rgba(160,60,22,${0.22*a})`);
      grad.addColorStop(1,    'rgba(90,35,15,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(ex.x, ex.y, r, 0, TAU); ctx.fill();
    }
    // ④ 白热核：小、短命（只在 t<0.45 可见），让爆心「过曝」
    if (t < 0.45) {
      const coreA = (1 - t / 0.45) * a;
      const coreR = r * 0.34;
      if (!_blitRadial(ctx, _radialSprite('core', coreR), ex.x, ex.y, coreR, 0.95 * coreA, 'lighter')) {
        const coreGrad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, coreR);
        coreGrad.addColorStop(0, `rgba(255,255,246,${0.95*coreA})`);
        coreGrad.addColorStop(1, `rgba(255,235,170,${0.10*coreA})`);
        ctx.fillStyle = coreGrad;
        ctx.beginPath(); ctx.arc(ex.x, ex.y, coreR, 0, TAU); ctx.fill();
      }
    }
    // ⑤ 冲击边缘：不规则程度随 t 增大（用 hash 抖动，不破坏确定性）
    //    12 段多边形比正圆更像爆轰波前，也让「火球=圆」的塑料感消失。
    const rimA = 0.55 * a;
    if(rimA > 0.01){
      ctx.strokeStyle = `rgba(255,196,110,${rimA})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const segs = 12;
      for(let i = 0; i < segs; i++){
        const ang = (i / segs) * TAU;
        const wob = 1 + (_fxHash(ex.x * 0.13 + ex.y * 0.29 + i * 3.7) - 0.5) * 0.16 * (1 - t);
        const px = ex.x + Math.cos(ang) * r * 1.12 * wob;
        const py = ex.y + Math.sin(ang) * r * 1.12 * wob;
        if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
}
// 被掀飞的炮塔（飞头）：上升→抛物线坠地，持续自旋并冒烟
function drawTurretFlights(ctx){
  for(const f of turretFlights){
    const a = Math.max(0, 1 - f.age/f.max);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.ang);
    const verts = f.snap.verts;
    ctx.beginPath();
    for(let i=0;i<verts.length;i++){
      const [vx,vy] = verts[i]; i ? ctx.lineTo(vx,vy) : ctx.moveTo(vx,vy);
    }
    ctx.closePath();
    ctx.globalAlpha = a;
    ctx.fillStyle = paintShade(f.snap.color, -6);
    ctx.fill();
    ctx.strokeStyle = f.snap.color; ctx.lineWidth = 1.5; ctx.stroke();
    // 观察塔 + 短炮管残骸
    ctx.fillStyle = paintShade(f.snap.color, -30);
    ctx.beginPath(); ctx.arc(f.snap.len*0.06, f.snap.wid*0.36, Math.max(1.5, f.snap.wid*0.14), 0, TAU); ctx.fill();
    ctx.strokeStyle = f.snap.color; ctx.lineWidth = Math.max(2.5, f.snap.wid*0.2);
    ctx.beginPath(); ctx.moveTo(f.snap.len*0.35, 0); ctx.lineTo(f.snap.len*1.05, 0); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
// 炮口闪光：向开火方向拉长的锥形光 + 中央光斑 + 光环（叠加混合）。支持 8 种制退器渲染
function drawMuzzleFlashes(ctx){
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(const f of muzzleFlashes){
    const t = Math.min(1, f.life / f.max);
    const a = Math.max(0, 1 - t);
    const r = (5 + t * 20) * f.big;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.ang);

    // 辅助函数：绘制特定角度和大小的火舌
    // #FX3-2026-10-18：单层扇形 → **双层火舌**（外层宽而暗的橙色焰 + 内层窄而亮的白黄芯）。
    //   真实炮口焰是「外焰—内焰—焰芯」三层结构，单层渐变永远像一片扁平的橙色塑料。
    //   #FX3 二次改造：几何与色阶全部固定，只有尺寸随 r 变 → 按 (宽度角, 长度系数) 烘焙 sprite，
    //   绘制期只做 drawImage 缩放+旋转（一帧 61 次渐变分配 → 0 次）。
    const drawPlume = (angleOffset, lenFactor, widthAng) => {
      const spr = _plumeSprite(widthAng, lenFactor);
      if (!spr) return;
      ctx.save();
      ctx.rotate(angleOffset);
      // sprite 里的 R = bakeLen*max(0.3,lf)*2.4；目标 R = r*2.4*lenFactor
      const scale = (r * 2.4 * lenFactor) / spr.R;
      ctx.globalAlpha = a;
      ctx.drawImage(spr.canvas, -spr.ox * scale, -spr.oy * scale,
        spr.canvas.width * scale, spr.canvas.height * scale);
      ctx.restore();
    };

    const type = f.muzzle || 'none';

    // 炮口烟（#FX3-2026-10-18）：火舌与核心之前先垫一层**正在膨胀的烟球**——
    //   旧实现只有亮部（火舌+核心+冲击环），没有暗部，炮口像「贴了个亮斑」。
    //   真实开火的观感一半来自被火光照亮的烟：它给亮部提供对比、也把闪光「钉」在炮口。
    //   必须在火舌之前画（烟在火后面），否则会均匀地压暗火舌。
    //   颜色随弹药类型走（磁轨炮是电离白烟、常规是灰褐火药烟）；用 source-over，
    //   否则加法混合下「暗部」根本不存在。
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    if(type !== 'railgun'){
      const smokeT = Math.min(1, t * 1.6);           // 烟比火光散得慢
      const sr = r * (1.1 + smokeT * 1.5);
      ctx.fillStyle = `rgba(120,110,96,${0.30 * (1 - smokeT) * a + 0.06 * (1 - smokeT)})`;
      ctx.beginPath();
      ctx.ellipse(r * 0.35, 0, sr, sr * 0.72, 0, 0, TAU);
      ctx.fill();
    } else {
      // #U39：电磁炮的电离白烟（冷白，不再是青蓝）
      ctx.fillStyle = `rgba(232,240,250,${0.20 * (1 - Math.min(1, t * 1.4)) * a})`;
      ctx.beginPath();
      ctx.ellipse(r * 0.3, 0, r * (0.9 + t * 1.1), r * (0.6 + t * 0.7), 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    if (type === 'none') {
      // 2 侧 + 前：主向前锥火舌 + 两侧垂直排气火舌
      drawPlume(0, 1.1, 0.55);
      drawPlume(Math.PI/2, 0.45, 0.28);
      drawPlume(-Math.PI/2, 0.45, 0.28);
    } else if (type === 'single') {
      // 向前较大喷射 + 两侧90度排气火星
      drawPlume(0, 1.0, 0.45);
      drawPlume(Math.PI/2, 0.4, 0.25);
      drawPlume(-Math.PI/2, 0.4, 0.25);
    } else if (type === 'double') {
      // 中等向前 + 两侧强力90度双火舌
      drawPlume(0, 0.8, 0.35);
      drawPlume(Math.PI/2, 0.65, 0.25);
      drawPlume(-Math.PI/2, 0.65, 0.25);
    } else if (type === 'multi') {
      // 向前微弱 + 侧后方多级斜火舌
      drawPlume(0, 0.5, 0.25);
      drawPlume(Math.PI * 0.45, 0.5, 0.2);
      drawPlume(-Math.PI * 0.45, 0.5, 0.2);
      drawPlume(Math.PI * 0.55, 0.4, 0.15);
      drawPlume(-Math.PI * 0.55, 0.4, 0.15);
    } else if (type === 'slug') {
      // 扁、宽且短的向前火球，具有更强的核心发散
      drawPlume(0, 0.85, 1.0);
    } else if (type === 'pepperpot') {
      // 六向星状火针
      for (let i = 0; i < 6; i++) {
        const ang = -Math.PI * 0.5 + i * (Math.PI / 3);
        drawPlume(ang, 0.55, 0.12);
      }
    } else if (type === 'heavy_square') {
      // 向前及两侧宽幅方形火柱
      drawPlume(0, 1.25, 0.7);
      drawPlume(Math.PI/2, 0.8, 0.5);
      drawPlume(-Math.PI/2, 0.8, 0.5);
    } else if (type === 'cylinder') {
      // 弱向前 + 横向扇形排焰
      drawPlume(0, 0.4, 0.25);
      drawPlume(Math.PI/2, 0.75, 0.65);
      drawPlume(-Math.PI/2, 0.75, 0.65);
    } else if (type === 'railgun') {
      // 磁轨炮炮口：**白色**电磁能量长矛，无火药火舌。
      // #U39（2026-10-19 用户裁定）：炮口不再是「青蓝电光」——配色统一为**白**（弧光白），
      //   电弧的主体改挂在炮身上（见 spawnRailDischarge / drawRailArcs），炮口只留：
      //   ① 外扩散锥（宽、淡冷白）
      //   ② 针状白热长矛（窄、极亮）
      //   ③ 少量短分叉（炮口处的残余电弧，长度明显短于炮身弧，不喧宾夺主）
      const railGrad = ctx.createLinearGradient(0, 0, r * 3.6, 0);
      railGrad.addColorStop(0, `rgba(255,255,255,${0.85*a})`);
      railGrad.addColorStop(0.35, `rgba(222,236,255,${0.50*a})`);
      railGrad.addColorStop(1, 'rgba(190,215,255,0)');
      ctx.fillStyle = railGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 3.6, -0.16, 0.16);
      ctx.closePath();
      ctx.fill();
      // ② 针状白热长矛：宽度随寿命迅速收细（能量聚束），长度略过外层锥
      const needleLen = r * (3.2 + t * 1.6);
      const needleW = Math.max(0.5, r * 0.22 * (1 - t * 0.7));
      const needleGrad = ctx.createLinearGradient(0, 0, needleLen, 0);
      needleGrad.addColorStop(0, `rgba(255,255,255,${0.98*a})`);
      needleGrad.addColorStop(0.5, `rgba(240,248,255,${0.75*a})`);
      needleGrad.addColorStop(1, 'rgba(210,230,255,0)');
      ctx.fillStyle = needleGrad;
      ctx.beginPath();
      ctx.moveTo(0, -needleW);
      ctx.lineTo(needleLen, 0);
      ctx.lineTo(0, needleW);
      ctx.closePath();
      ctx.fill();
      // ③ 炮口残余电弧：短分叉（白色），抖动由 (时间量子, 分叉序号) 哈希派生，绘制期无随机。
      const arcQ = Math.floor(_fxNow() * 30) | 0;
      for(let k = 0; k < 3; k++){
        const aa = (_fxHash(arcQ + k * 7.31) - 0.5) * 0.8;
        const len = r * (0.7 + _fxHash(arcQ + k * 3.17 + 11) * 0.7);
        const pts = (typeof lightningPath === 'function')
          ? lightningPath(0, 0, aa, len, 3.5, 4, arcQ + k * 7.31)
          : [{ x: 0, y: 0 }, { x: Math.cos(aa) * len, y: Math.sin(aa) * len }];
        // 冷白晕 + 纯白芯
        ctx.strokeStyle = `rgba(222,236,255,${0.40*a})`;
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for(let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.92*a})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    } else if (type === 'autocannon') {
      // 机炮：小而短促的火舌，高射速感
      drawPlume(0, 0.55, 0.35);
      drawPlume(Math.PI/2, 0.25, 0.2);
      drawPlume(-Math.PI/2, 0.25, 0.2);
    }

    // 核心圆斑（#FX3：平涂圆 → 径向渐变「白热芯 + 琥珀边」，加一圈外发光）
    //   图形学上炮口核心的亮度不是均匀的：中心过曝成白、边缘迅速转橙、再外是火舌。
    //   #FX3：两处渐变也走缓存 sprite（core 满 alpha 烘焙 + globalAlpha=a）
    //   #U39（2026-10-19）：railgun 的核心/光晕/冲击环一律改用**白**（coreW / haloW / 白环），
    //     与前文「弧光白」口径一致；青蓝只在非电磁炮的旧语义里保留。
    const _isRailMuzzle = type === 'railgun';
    const coreR = type === 'slug' ? r * 0.75 : _isRailMuzzle ? r * 0.65 : r * 0.5;
    if (!_blitRadial(ctx, _radialSprite(_isRailMuzzle ? 'coreW' : 'core', coreR), 0, 0, coreR, a, 'lighter')) {
      const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
      if (_isRailMuzzle) {
        coreGrad.addColorStop(0,   `rgba(255,255,255,${a})`);
        coreGrad.addColorStop(0.45,`rgba(238,246,255,${0.85*a})`);
        coreGrad.addColorStop(1,   `rgba(205,225,255,${0.15*a})`);
      } else {
        coreGrad.addColorStop(0,   `rgba(255,255,250,${0.98*a})`);
        coreGrad.addColorStop(0.40,`rgba(255,238,170,${0.90*a})`);
        coreGrad.addColorStop(1,   `rgba(255,150,50,${0.10*a})`);
      }
      ctx.fillStyle = coreGrad;
      ctx.beginPath(); ctx.arc(0, 0, coreR, 0, TAU); ctx.fill();
    }
    // 外发光（薄薄一层，让核心与火舌衔接）
    if (!_blitRadial(ctx, _radialSprite(_isRailMuzzle ? 'haloW' : 'halo', coreR * 2.1), 0, 0, coreR * 2.1, 0.30 * a, 'lighter')) {
      const haloGrad = ctx.createRadialGradient(0, 0, coreR * 0.9, 0, 0, coreR * 2.1);
      haloGrad.addColorStop(0, _isRailMuzzle ? `rgba(226,238,255,${0.30*a})` : `rgba(255,190,90,${0.30*a})`);
      haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath(); ctx.arc(0, 0, coreR * 2.1, 0, TAU); ctx.fill();
    }

    // 冲击环
    const ringR = type === 'slug' ? r * 2.0 : _isRailMuzzle ? r * 2.2 : r * 1.5;
    const ringCol = _isRailMuzzle ? `rgba(232,242,255,${0.7*a})` : `rgba(255,200,110,${0.7*a})`;
    ctx.strokeStyle = ringCol; ctx.lineWidth = type === 'heavy_square' ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(0, 0, ringR, 0, TAU); ctx.stroke();

    ctx.restore();
  }
  ctx.restore();
}
// 曳光拖尾绘制（叠加混合亮线段）
function drawTracers(ctx){
  if(!tracers.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(const t of tracers){
    const a = Math.max(0, 1 - t.life/t.max);
    ctx.strokeStyle = t.color;
    ctx.globalAlpha = a;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  ctx.restore();
}
// 命中/擦弹：冲击闪光（按结果着色）+ 冲击环
function drawHitFx(ctx){
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(const f of hitFx){
    const t = Math.min(1, f.life / f.max);
    const a = Math.max(0, 1 - t);
    // 2026-10-22 B5-2：家族化 outcome 的闪光半径/配色（impact_he 已在 spawn 期别名为 he）
    const isAp = (f.outcome === 'impact_ap');
    const isHeat = (f.outcome === 'impact_heat');
    const r = 5 + t * 26 * (f.outcome === 'he' ? 1.5 : (isHeat ? 0.7 : 1)) * f.scale;
    const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    if(isAp){
      // AP：冷蓝白穿甲闪（与曳光/火花同色系）
      grad.addColorStop(0,   `rgba(235,248,255,${0.95*a})`);
      grad.addColorStop(0.45,`rgba(150,205,255,${0.50*a})`);
      grad.addColorStop(1,   'rgba(60,110,190,0)');
    } else if(isHeat){
      // HEAT：橙黄金属射流闪（亮芯偏白、外圈橙）
      grad.addColorStop(0,   `rgba(255,248,200,${0.95*a})`);
      grad.addColorStop(0.42,`rgba(255,190,60,${0.58*a})`);
      grad.addColorStop(1,   'rgba(200,90,20,0)');
    } else if(f.outcome === 'pen' || f.outcome === 'he'){
      grad.addColorStop(0,   `rgba(255,240,180,${0.95*a})`);
      grad.addColorStop(0.45,`rgba(255,150,50,${0.55*a})`);
      grad.addColorStop(1,   'rgba(180,70,20,0)');
    } else if(f.outcome === 'bounce'){
      grad.addColorStop(0,   `rgba(255,255,255,${0.9*a})`);
      grad.addColorStop(0.4, `rgba(180,200,255,${0.6*a})`);
      grad.addColorStop(1,   'rgba(90,140,220,0)');
    } else {
      grad.addColorStop(0,   `rgba(230,230,225,${0.8*a})`);
      grad.addColorStop(1,   'rgba(120,120,115,0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = isAp ? `rgba(190,225,255,${0.5*a})`
      : isHeat ? `rgba(255,215,90,${0.5*a})`
      : `rgba(255,200,110,${0.5*a})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(f.x, f.y, r * 1.15, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
// 火焰 / 浓烟 / 破片 / 火花粒子
function drawFxParticles(ctx){
  for(const p of fxParticles){
    const a = Math.max(0, 1 - p.age/p.max);
    if(p.kind === 'smoke'){
      ctx.fillStyle = `rgba(38,38,34,${0.45*a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size*(0.5+0.5*a), 0, TAU); ctx.fill();
    } else if(p.kind === 'debris'){
      ctx.fillStyle = `rgba(60,55,45,${a})`;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(const p of fxParticles){
    if(p.kind !== 'flame' && p.kind !== 'spark') continue;
    const a = Math.max(0, 1 - p.age/p.max);
    if(p.kind === 'flame'){
      // #FX2：改用按半径分桶预烘焙的辉光小图（每帧不再新建径向渐变）+ 缩放表达收缩
      const sp = _flameGlowSprite(p.size);
      if(sp) {
        const rad = p.size * (0.85 + 0.25 * a);
        ctx.globalAlpha = a;
        ctx.drawImage(sp, p.x - rad, p.y - rad, rad * 2, rad * 2);
        ctx.globalAlpha = 1;
      } else {
        // 无 document（纯 Node 无垫片）时退化为实色圆
        ctx.fillStyle = `rgba(255,170,60,${0.7*a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      }
    } else {
      // 火花：沿速度方向的小亮线。颜色抖动派生自 (粒子位置, 寿命)，绘制期不再取 Math.random
      const j = _fxHash(p.x * 0.37 + p.y * 0.11 + p.age * 13.7);
      ctx.strokeStyle = `rgba(255,${195 + Math.floor(j*45)},${105 + Math.floor(j*40)},${0.9*a})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx*0.03, p.y - p.vy*0.03); ctx.stroke();
    }
  }
  ctx.restore();
}

// 冲击波环绘制（#FX2：双环 + 内发光，能量感更强；全部用常量/确定性参数，无绘制期随机）
function drawShockwaves(ctx){
  if(!shockwaves.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(const sw of shockwaves){
    const t = Math.min(1, sw.life / sw.max);
    const r = sw.r + t * (sw.maxR - sw.r);
    const a = Math.max(0, 1 - t);
    ctx.strokeStyle = sw.color || `rgba(255,210,120,${0.8*a})`;
    // 主环：线宽随扩散收细（能量扩散时边界变锐）
    ctx.lineWidth = (sw.width || 2.5) * (1 - 0.5*t);
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, r, 0, TAU);
    ctx.stroke();
    // 拖尾内环：半径略小、透明度更低，形成「激波面厚度」
    if(t > 0.12){
      ctx.globalAlpha = 0.55 * a;
      ctx.lineWidth = (sw.width || 2.5) * 0.55;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, r * (1 - 0.06 - 0.10 * t), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// 地面弹坑与焦痕绘制（#FX2 重做：单色圆 → 三层弹坑）
//   layer1 外圈扬尘晕（宽、淡）
//   layer2 焦土主体（不规则边缘，用确定性哈希每 mark 固定形状，不随帧抖动）
//   layer3 弹坑核心（更深、更小）
function drawScorchMarks(ctx){
  if(!scorchMarks.length) return;
  ctx.save();
  for(const sm of scorchMarks){
    const lifeT = Math.min(1, sm.life / sm.max);
    // 前 8% 寿命快速显现，之后随寿命线性淡出到 0（旧实现一开始就是满透明度，命中瞬间「啪」地出现）
    const fadeIn = Math.min(1, lifeT * 12);
    const a = Math.max(0, 1 - lifeT) * (sm.opacity || 0.45) * fadeIn;
    if(a <= 0.002) continue;
    // 每个 mark 用位置派生的固定相位，保证同一弹坑每帧形状相同
    const seed = _fxHash(sm.x * 0.013 + sm.y * 0.007 + (sm.ang || 0));
    ctx.save();
    ctx.translate(sm.x, sm.y);
    // layer1：外圈扬尘晕
    ctx.fillStyle = `rgba(46,40,32,${a * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, sm.r * (1.35 + seed * 0.12), sm.r * (1.35 + seed * 0.12) * 0.88, sm.ang || 0, 0, TAU);
    ctx.fill();
    // layer2：不规则焦土主体（8 段折线近似，半径按哈希轻微起伏）
    ctx.fillStyle = `rgba(20,18,15,${a})`;
    ctx.beginPath();
    const seg = 10;
    for(let i = 0; i <= seg; i++){
      const ang = (i / seg) * TAU;
      const wob = 0.82 + _fxHash(seed * 91 + i * 5.7) * 0.30;
      const px = Math.cos(ang) * sm.r * wob, py = Math.sin(ang) * sm.r * wob * 0.92;
      if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    // layer3：弹坑核心
    ctx.fillStyle = `rgba(8,7,6,${a * 0.85})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, sm.r * 0.55, sm.r * 0.5, sm.ang || 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

if (typeof globalThis !== 'undefined') { globalThis.spawnMuzzleFlash = spawnMuzzleFlash; globalThis.spawnTracer = spawnTracer; globalThis.spawnRailDischarge = spawnRailDischarge; globalThis.drawRailArcs = drawRailArcs; }

// ===================== #U41（2026-10-19）：地面履带痕迹 =====================
// 坦克行驶时在地面盖左右两条履带印（深土色线段，随时间淡出）。数据纯逻辑、绘制纯 ctx；
// 发射钩子 emitTankTracks 由 js/tank_move.js driveTank 末尾经 globalThis 可选调用（Node 测试链
// 不加载页面 FX 时自动 no-op），盖章按「每侧履带累计位移 ≥ TRACK_MARK_STEP」节流，不逐帧堆积。
let trackMarks = [];            // {x1,y1,x2,y2,w,life,max}
let trackEmitState = new WeakMap();   // tank -> {lx,ly,rx,ry}（各侧上次盖章点；clear 时换新表）
const FX_MAX_TRACK_MARKS = 600; // 段数上限（超限丢最老）
const TRACK_MARK_STEP = 9;      // 盖章间距（px，≈履带节距观感）
// #W12（2026-10-19）：单帧位移超过该值即视为「非连续移动」（传送/复活/换位），
// 只重锚定、不补痕迹线段——否则会在死亡点与复活点之间连一条数十~数百 px 的长痕，
// 观感即用户报告的「履带后面有个小拖尾」。取值远大于正常单帧位移（最快车 ~375px/s × 16ms ≈ 6px）。
const TRACK_MARK_MAX_STEP = 48;
const TRACK_MARK_LIFE = 12;     // 存活秒数
function trackMarkCount(){ return trackMarks.length; }
function spawnTrackMarkSeg(x1, y1, x2, y2, w){
  if (trackMarks.length >= FX_MAX_TRACK_MARKS) trackMarks.shift();
  trackMarks.push({ x1, y1, x2, y2, w, life: 0, max: TRACK_MARK_LIFE });
}
// driveTank 每帧调用：按左右履带中心的位移增量盖章（转向时两侧位移不同，自然画出差速弧）
function emitTankTracks(t){
  if (!t || t.hp <= 0) return;
  const off = (t.hullWid || 32) / 2 + (t.trackOffset || 0) + (t.trackWidth || 8) / 2;
  const ca = Math.cos(t.hullAngle || 0), sa = Math.sin(t.hullAngle || 0);
  const x = t.x, y = t.y;
  // local (0, ±off) 旋转 hullAngle：wx = x - v*sin, wy = y + v*cos
  const lx = x + off * sa,  ly = y - off * ca;   // 左侧（local v = -off）
  const rx = x - off * sa,  ry = y + off * ca;   // 右侧（local v = +off）
  const st = trackEmitState.get(t);
  if (!st) { trackEmitState.set(t, { lx, ly, rx, ry }); return; }
  const dL = Math.hypot(lx - st.lx, ly - st.ly);
  const dR = Math.hypot(rx - st.rx, ry - st.ry);
  const tw = Math.max(4, (t.trackWidth || 8) * 0.9);
  // #W12（2026-10-19 用户反馈「履带后面似乎有个小拖尾」）：
  //   真因不是相位错位，而是**传送后跨距盖章**——本函数只按「位移 ≥ STEP」补线段，
  //   没有上限；而 trackEmitState 只在 clearTrackMarks() 换新，后者仅进节点/dev 时调用。
  //   复活（tank_revive 直接改 t.x/t.y）、resetEntity 传送、Boss 召唤定位都不重置它 ⇒
  //   下一帧会在「死亡点 → 复活点」之间连一条数十~数百 px 的长痕（观感＝履带拖尾）。
  //   修法：位移超过 TRACK_MARK_MAX_STEP（明显不是正常行驶）时只重同步、不盖章。
  const maxStep = (typeof TRACK_MARK_MAX_STEP === 'number') ? TRACK_MARK_MAX_STEP : 48;
  if (dL > maxStep || dR > maxStep) {
    // 非连续位移（传送/复活/换位）——丢弃这一段，重新锚定
    trackEmitState.set(t, { lx, ly, rx, ry });
    return;
  }
  if (dL >= TRACK_MARK_STEP) { spawnTrackMarkSeg(st.lx, st.ly, lx, ly, tw); trackEmitState.set(t, Object.assign(st, { lx, ly })); }
  if (dR >= TRACK_MARK_STEP) { spawnTrackMarkSeg(st.rx, st.ry, rx, ry, tw); trackEmitState.set(t, Object.assign(st, { rx, ry })); }
}
if (typeof globalThis !== 'undefined') { globalThis.emitTankTracks = emitTankTracks; }
function updateTrackMarks(dt){
  trackMarks.forEach(m => m.life += dt);
  trackMarks = trackMarks.filter(m => m.life < m.max);
}
// 地面贴花层（画在 drawScorchMarks 同层：地物/道路之后、坦克之前）
function drawTrackMarks(ctx){
  if (!trackMarks.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const m of trackMarks) {
    const lifeT = Math.min(1, m.life / m.max);
    const a = Math.max(0, (1 - lifeT)) * Math.min(1, lifeT * 12) * 0.20;   // 淡入 8% → 线性淡出
    if (a <= 0.004) continue;
    ctx.strokeStyle = 'rgba(30,26,20,' + a.toFixed(3) + ')';
    ctx.lineWidth = m.w;
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2);
    ctx.stroke();
  }
  ctx.restore();
}
function clearTrackMarks(){ trackMarks.length = 0; trackEmitState = new WeakMap(); }
if (typeof globalThis !== 'undefined') { globalThis.clearTrackMarks = clearTrackMarks; }

// #4（2026-10-15）：节点切换时清空 FX 数组，防止跨节点残留叠加
function clearFx(){
  explosions.length = 0;
  turretFlights.length = 0;
  fxParticles.length = 0;
  muzzleFlashes.length = 0;
  hitFx.length = 0;
  shockwaves.length = 0;
  scorchMarks.length = 0;
  tracers.length = 0;
  railArcs.length = 0;
  trackMarks.length = 0;    // #U41：履带痕迹不跨节点
}
if (typeof globalThis !== 'undefined') { globalThis.clearFx = clearFx; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clearFx,
    explosions,
    turretFlights,
    fxParticles,
    muzzleFlashes,
    hitFx,
    shockwaves,
    scorchMarks,
    tracers,
    railArcs,
    FX_MAX_PARTICLES,
    spawnFlame,
    spawnSmoke,
    spawnDebris,
    spawnShockwave,
    spawnScorchMark,
    burstExplosion,
    emitTankFire,
    spawnAmmoBlowFx,
    spawnTrackBreakFx,
    spawnMuzzleFlash,
    spawnTracer,
    spawnRailDischarge,
    railArcCount,
    spawnImpactFx,
    updateFx,
    drawExplosions,
    drawTurretFlights,
    drawFxParticles,
    drawMuzzleFlashes,
    drawTracers,
    drawRailArcs,
    drawHitFx,
    drawShockwaves,
    drawScorchMarks,
    emitTankTracks,
    updateTrackMarks,
    drawTrackMarks,
    clearTrackMarks,
    trackMarkCount,
    FX_MAX_TRACK_MARKS,
    // #FX3-2026-10-18：sprite 缓存清理钩子 + 内部 sprite 工厂（供 scripts/test-render.js
    //   做「烘焙 sprite 不被画布裁切」的像素断言；页面侧不调用）。
    clearFxGlowCache,
    clearFxBoomCache,
    clearFxRadialCache,
    clearFxPlumeCache,
    _flameGlowSprite,
    _explosionSprite,
    _radialSprite,
    _plumeSprite,
    _fxHash
  };
}