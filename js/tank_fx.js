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

let explosions = [];     // 殉爆火球: {x,y,life,max,scale}
let turretFlights = [];  // 被掀飞的炮塔（飞头）: {x,y,ang,vx,vy,spin,age,max,snap}
let fxParticles = [];    // 火焰/浓烟/破片/火花粒子
let muzzleFlashes = [];  // 炮口闪光: {x,y,ang,life,max,big}
let hitFx = [];          // 命中/擦弹特效: {x,y,ang,life,max,outcome,scale}
const FX_MAX_PARTICLES = 600;

function spawnFlame(x,y,spread){
  const a = Math.random()*TAU, sp = 18 + Math.random()*spread;
  fxParticles.push({ kind:'flame', x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 46,
    age:0, max:0.35 + Math.random()*0.5, size:4.5 + Math.random()*7 });
}
function spawnSmoke(x,y,spread){
  const a = Math.random()*TAU, sp = (6 + Math.random()*spread)*0.45;
  fxParticles.push({ kind:'smoke', x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 12,
    age:0, max:0.7 + Math.random()*0.9, size:5 + Math.random()*7 });
}
function spawnDebris(x,y){
  const a = Math.random()*TAU, sp = 60 + Math.random()*120;
  fxParticles.push({ kind:'debris', x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 60,
    age:0, max:0.5 + Math.random()*0.4, size:1.2 + Math.random()*1.8 });
}
function burstExplosion(x,y,scale,flames,smokes,debris){
  explosions.push({ x, y, life:0, max:0.65, scale:scale||1.6 });
  for(let i=0;i<(flames||0);i++) spawnFlame(x + (Math.random()*26-13), y + (Math.random()*26-13), 140);
  for(let i=0;i<(smokes||0);i++) spawnSmoke(x + (Math.random()*30-15), y + (Math.random()*30-15), 70);
  for(let i=0;i<(debris||0);i++) spawnDebris(x, y);
}
// 起火坦克：从发动机舱位置（由炮塔旋转中心决定前后）持续发射火焰与浓烟
function emitTankFire(t){
  if(fxParticles.length > FX_MAX_PARTICLES) return;
  const L = t.hullLen/2, W = t.hullWid/2;
  const ex = engineLocalX(t);
  const pts = [ [ex, -W*0.3], [ex, W*0.3], [ex*0.7, -W*0.15], [ex*0.7, W*0.15], [ex*0.35, 0] ];
  for(const [lx,ly] of pts){
    if(Math.random() < 0.55){
      const r = rotate(lx + (Math.random()*6-3), ly + (Math.random()*6-3), t.hullAngle);
      spawnFlame(t.x+r.x, t.y+r.y, 30);
      if(Math.random() < 0.45) spawnSmoke(t.x+r.x, t.y+r.y, 14);
    }
  }
}
// 弹药架殉爆：火球 + 炮塔掀飞（飞头）+ 大量火焰浓烟破片
function spawnAmmoBlowFx(t){
  const bp = t.blowHitPoint || { x:t.x, y:t.y };
  burstExplosion(bp.x, bp.y, 2.2, 46, 26, 18);
  const p = turretPivot(t);
  const ang = superstructureAngle(t);
  turretFlights.push({
    snap: { verts:(t.turretSpec && t.turretSpec.verts) || turretPoly(t).verts, color:t.color, len:t.turLen, wid:t.turWid },
    x:p.x, y:p.y, ang,
    vx: Math.cos(ang) * (40 + Math.random()*60) + (Math.random()-0.5)*50,
    vy: -230 - Math.random()*110,
    spin: (Math.random()-0.5)*7,
    age:0, max:1.9 + Math.random()*0.5
  });
}
// 履带断裂：破片 + 火花（小规模）
function spawnTrackBreakFx(t){
  const p = t.trackFxPoint || { x:t.x, y:t.y };
  burstExplosion(p.x, p.y, 0.7, 8, 4, 6);
  spawnImpactFx(p.x, p.y, t.hullAngle, 'block', 0.7);
}
// 炮口闪光：出膛时在炮口位置生成窄扇形闪光，不随缩放变形
function spawnMuzzleFlash(x, y, angle, scale){
  muzzleFlashes.push({ x, y, ang: angle || 0, life: 0, max: 0.1, big: scale || 1 });
}
function spawnSpark(x, y, angle, speed, life, size){
  fxParticles.push({ kind:'spark', x, y,
    vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
    age:0, max: life, size: size || 1.2 });
}
// 命中/擦弹特效：冲击闪光 + 火花 + 烟尘。outcome: 'pen'|'he'|'block'|'bounce'
function spawnImpactFx(x, y, angle, outcome, scale){
  const o = outcome || 'pen';
  hitFx.push({ x, y, ang: angle || 0, life: 0, max: o === 'bounce' ? 0.16 : 0.24,
    outcome: o, scale: scale || 1 });
  const sparks = o === 'he' ? 14 : (o === 'pen' ? 9 : 5);
  const spd = o === 'he' ? 230 : 150;
  for(let i = 0; i < sparks; i++){
    const a = (angle || 0) + (Math.random() - 0.5) * 2.6;
    spawnSpark(x, y, a, spd * (0.35 + Math.random() * 0.85), 0.15 + Math.random() * 0.3,
      1.1 + Math.random() * 1.3);
  }
  if(o !== 'bounce'){
    // 命中烟尘（穿透/高爆更多）
    for(let i = 0; i < (o === 'he' ? 7 : 3); i++){
      const a = Math.random()*TAU, sp = 20 + Math.random()*60;
      fxParticles.push({ kind:'smoke', x: x + (Math.random()*8-4), y: y + (Math.random()*8-4),
        vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 10,
        age:0, max: 0.4 + Math.random()*0.5, size: 4 + Math.random()*5 });
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
  fxParticles.forEach(p=>{
    p.age += dt; p.x += p.vx*dt; p.y += p.vy*dt;
    if(p.kind === 'spark'){ p.vx *= 0.96; p.vy = p.vy*0.96 + 50*dt; }
    else if(p.kind !== 'debris'){ p.vx *= 0.985; }
    else { p.vy += 220*dt; }
  });
  fxParticles = fxParticles.filter(p=>p.age < p.max);
  muzzleFlashes.forEach(f=>f.life+=dt); muzzleFlashes = muzzleFlashes.filter(f=>f.life < f.max);
  hitFx.forEach(f=>f.life+=dt); hitFx = hitFx.filter(f=>f.life < f.max);
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
// 炮口闪光：向开火方向拉长的锥形光 + 中央光斑 + 光环（叠加混合）
function drawMuzzleFlashes(ctx){
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(const f of muzzleFlashes){
    const t = Math.min(1, f.life / f.max);
    const a = Math.max(0, 1 - t);
    const r = 5 + t * 20 * f.big;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.ang);
    const grad = ctx.createLinearGradient(0, 0, r * 2.4, 0);
    grad.addColorStop(0,   `rgba(255,248,210,${0.95*a})`);
    grad.addColorStop(0.4, `rgba(255,190,80,${0.55*a})`);
    grad.addColorStop(1,   'rgba(255,120,30,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 2.4, -0.55, 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,255,235,${0.9*a})`;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,200,110,${0.7*a})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, TAU); ctx.stroke();
    ctx.restore();
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    explosions,
    turretFlights,
    fxParticles,
    muzzleFlashes,
    hitFx,
    FX_MAX_PARTICLES,
    spawnFlame,
    spawnSmoke,
    spawnDebris,
    burstExplosion,
    emitTankFire,
    spawnAmmoBlowFx,
    spawnTrackBreakFx,
    spawnMuzzleFlash,
    spawnImpactFx,
    updateFx,
    drawExplosions,
    drawTurretFlights,
    drawFxParticles,
    drawMuzzleFlashes,
    drawHitFx
  };
}