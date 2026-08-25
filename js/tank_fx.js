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
const FX_MAX_PARTICLES = 1200;
const FX_MAX_SCORCH = 80;

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
    vx: Math.cos(ang) * (50 + Math.random()*80) + (Math.random()-0.5)*70,
    vy: -280 - Math.random()*150,
    spin: (Math.random()-0.5)*9,
    age:0, max:2.2 + Math.random()*0.6
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
  muzzleFlashes.push({ x, y, ang: angle || 0, life: 0, max: 0.12, big: sc, muzzle: type });
  spawnShockwave(x, y, 28 * sc, 0.18, 'rgba(255,220,130,0.7)', 2);

  // 喷射排气火花粒子
  const emitDirSparks = (dirAng, count, spdMin, spdMax, spread) => {
    for(let i = 0; i < count; i++){
      const a = dirAng + (Math.random() - 0.5) * spread;
      const sp = (spdMin + Math.random() * (spdMax - spdMin)) * sc;
      spawnSpark(x, y, a, sp, 0.12 + Math.random() * 0.18, 1.2 + Math.random() * 0.8, 'amber');
    }
  };

  emitDirSparks(angle, 6, 120, 240, 0.4);
  if(type === 'single' || type === 'double' || type === 'heavy_square' || type === 'cylinder'){
    emitDirSparks(angle + Math.PI/2, 4, 90, 180, 0.35);
    emitDirSparks(angle - Math.PI/2, 4, 90, 180, 0.35);
  }
}
// 曳光拖尾：出膛后每帧在炮弹上一帧→当前位置生成一段极短寿命的亮线，替代旧烟雾尾迹
function spawnTracer(x1, y1, x2, y2, color){
  tracers.push({ x1: x1, y1: y1, x2: x2, y2: y2, life: 0, max: 0.12, color: color || '#ffd24a' });
}
// 命中/擦弹特效：冲击闪光 + 锥形喷射火花 + 冲击波环 + 飞溅烟尘。outcome: 'pen'|'he'|'block'|'bounce'
function spawnImpactFx(x, y, angle, outcome, scale){
  const o = outcome || 'pen';
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
  turretFlights = turretFlights.filter(f=>f.age < f.max);
  
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
  tracers.forEach(t=>t.life+=dt); tracers = tracers.filter(t=>t.life < t.max);
}

// 殉爆火球（扩张并淡出）
function drawExplosions(ctx){
  for(const ex of explosions){
    const t = Math.min(1, ex.life / ex.max);
    const r = 14 + t*46*ex.scale;
    const a = Math.max(0, 1-t);
    const grad = ctx.createRadialGradient(ex.x,ex.y,0, ex.x,ex.y,r);
    grad.addColorStop(0,   `rgba(255,225,140,${0.95*a})`);
    grad.addColorStop(0.35,`rgba(255,150,50,${0.7*a})`);
    grad.addColorStop(0.7, `rgba(200,80,25,${0.35*a})`);
    grad.addColorStop(1,   'rgba(90,35,15,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(ex.x,ex.y,r,0,TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,190,90,${0.6*a})`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(ex.x,ex.y,r*1.12,0,TAU); ctx.stroke();
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
    const drawPlume = (angleOffset, lenFactor, widthAng) => {
      ctx.save();
      ctx.rotate(angleOffset);
      const plumeGrad = ctx.createLinearGradient(0, 0, r * 2.4 * lenFactor, 0);
      plumeGrad.addColorStop(0, `rgba(255,248,210,${0.95*a})`);
      plumeGrad.addColorStop(0.4, `rgba(255,190,80,${0.55*a})`);
      plumeGrad.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = plumeGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 2.4 * lenFactor, -widthAng, widthAng);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const type = f.muzzle || 'none';
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
    }

    // 核心圆斑
    const coreR = type === 'slug' ? r * 0.75 : r * 0.5;
    ctx.fillStyle = `rgba(255,255,235,${0.9*a})`;
    ctx.beginPath(); ctx.arc(0, 0, coreR, 0, TAU); ctx.fill();

    // 冲击环
    const ringR = type === 'slug' ? r * 2.0 : r * 1.5;
    ctx.strokeStyle = `rgba(255,200,110,${0.7*a})`; ctx.lineWidth = type === 'heavy_square' ? 2.5 : 1.5;
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
    const r = 5 + t * 26 * (f.outcome === 'he' ? 1.5 : 1) * f.scale;
    const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    if(f.outcome === 'pen' || f.outcome === 'he'){
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
    ctx.strokeStyle = `rgba(255,200,110,${0.5*a})`; ctx.lineWidth = 1.5;
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
      const grad = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,p.size);
      grad.addColorStop(0,   `rgba(255,215,90,${0.85*a})`);
      grad.addColorStop(0.5, `rgba(255,130,35,${0.5*a})`);
      grad.addColorStop(1,   'rgba(180,70,20,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,TAU); ctx.fill();
    } else {
      // 火花：沿速度方向的小亮线
      ctx.strokeStyle = `rgba(255,${195 + Math.floor(Math.random()*45)},${105 + Math.floor(Math.random()*40)},${0.9*a})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx*0.03, p.y - p.vy*0.03); ctx.stroke();
    }
  }
  ctx.restore();
}

// 冲击波环绘制
function drawShockwaves(ctx){
  for(const sw of shockwaves){
    const t = Math.min(1, sw.life / sw.max);
    const r = sw.r + t * (sw.maxR - sw.r);
    const a = Math.max(0, 1 - t);
    ctx.save();
    ctx.strokeStyle = sw.color || `rgba(255,210,120,${0.8*a})`;
    ctx.lineWidth = (sw.width || 2.5) * (1 - 0.5*t);
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

// 地面弹坑与焦痕绘制
function drawScorchMarks(ctx){
  for(const sm of scorchMarks){
    const a = Math.max(0, 1 - sm.life / sm.max) * (sm.opacity || 0.45);
    ctx.save();
    ctx.fillStyle = `rgba(20, 18, 15, ${a})`;
    ctx.beginPath();
    ctx.arc(sm.x, sm.y, sm.r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

if (typeof globalThis !== 'undefined') { globalThis.spawnMuzzleFlash = spawnMuzzleFlash; globalThis.spawnTracer = spawnTracer; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    explosions,
    turretFlights,
    fxParticles,
    muzzleFlashes,
    hitFx,
    shockwaves,
    scorchMarks,
    tracers,
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
    spawnImpactFx,
    updateFx,
    drawExplosions,
    drawTurretFlights,
    drawFxParticles,
    drawMuzzleFlashes,
    drawTracers,
    drawHitFx,
    drawShockwaves,
    drawScorchMarks
  };
}