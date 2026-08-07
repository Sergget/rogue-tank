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
let fxParticles = [];    // 火焰/浓烟/破片粒子
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
    if(p.kind !== 'debris') p.vx *= 0.985;
    else p.vy += 220*dt;
  });
  fxParticles = fxParticles.filter(p=>p.age < p.max);
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
// 火焰 / 浓烟 / 破片粒子
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
    if(p.kind !== 'flame') continue;
    const a = Math.max(0, 1 - p.age/p.max);
    const grad = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,p.size);
    grad.addColorStop(0,   `rgba(255,215,90,${0.85*a})`);
    grad.addColorStop(0.5, `rgba(255,130,35,${0.5*a})`);
    grad.addColorStop(1,   'rgba(180,70,20,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,TAU); ctx.fill();
  }
  ctx.restore();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    explosions,
    turretFlights,
    fxParticles,
    FX_MAX_PARTICLES,
    spawnFlame,
    spawnSmoke,
    spawnDebris,
    burstExplosion,
    emitTankFire,
    spawnAmmoBlowFx,
    spawnTrackBreakFx,
    updateFx,
    drawExplosions,
    drawTurretFlights,
    drawFxParticles
  };
}