
(() => {
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
function resize(){ canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; }
window.addEventListener('resize', resize);
resize();

// ---------- utils ----------
const TAU = Math.PI*2;
function norm(a){ a = a % TAU; if(a<0) a+=TAU; return a; }
function angDiff(a,b){ let d = norm(a-b); if(d>Math.PI) d -= TAU; return d; }
function gaussian(sigma){
  let u=0,v=0;
  while(u===0) u=Math.random();
  while(v===0) v=Math.random();
  return sigma * Math.sqrt(-2*Math.log(u)) * Math.cos(TAU*v);
}
function rotate(dx,dy,theta){
  return { x: dx*Math.cos(theta) - dy*Math.sin(theta), y: dx*Math.sin(theta) + dy*Math.cos(theta) };
}
function segRayIntersect(ox,oy,dx,dy, ax,ay,bx,by){
  // ray: O + t*D, t in R (unrestricted here, caller clamps as needed) ; segment A->B, s in [0,1]
  const ex = bx-ax, ey = by-ay;
  const denom = dx*ey - dy*ex;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((ax-ox)*ey - (ay-oy)*ex) / denom;
  const s = ((ax-ox)*dy - (ay-oy)*dx) / denom;
  if (s >= 0 && s <= 1) return {t, s};
  return null;
}

// ---------- tank model ----------
function makeTank(opts){
  return Object.assign({
    id:null, team:'enemy', // 'player' | 'ally' | 'enemy' — drives targeting, HUD slot, and future AI
    x:0,y:0,hullAngle:0,turretAngle:0,
    hullLen:64, hullWid:38,
    turLen:34, turWid:32,
    speed:0, maxSpeed:120, turnRate:2.0, turretTurnRate:2.2,
    hp:100, maxHp:100,
    penetration:120,
    damage:34,
    reload:1.3, reloadT:0,
    immobT:0, fireDebuffT:0, dotT:0,
    heightClass:'medium', // 'heavy' (tall silhouette) | 'medium' (short silhouette, hides better)
    color:'#7ed957',
    // dynamic bloom/收缩 system (see SPREAD config): current sigma tracks motion, then shrinks back
    // to base when the tank slows/stops. Modeled on WoT's three-expansion (movement / hull-traverse /
    // turret-traverse) bloom. Only `player` actually drives this; here for uniformity.
    sigma:0, prevHullAngle:0, prevTurretAngle:0
  }, opts);
}

// ---------- dynamic spread (bloom / shrink) ----------
// Three motion sources inflate the dispersion sigma; once they stop, sigma decays back toward the
// static base. Numbers are deliberately tuned small (radians of aim angle) for a top-down 2D feel.
const SPREAD = {
  base: 0.018,                       // static (fully settled) sigma
  fireDebuff: 0.020,                 // extra sigma while gunner is down (crew hit)
  moveMax: 0.014,                    // sigma added at full forward speed
  hullRotMax: 0.012,                 // sigma added at full hull turn rate
  turretRotMax: 0.018,               // sigma added at full turret turn rate (most disruptive)
  bloomRate: 2.0,                    // how fast sigma grows toward the motion target (1/s)
  shrinkRate: 0.3,                   // how fast sigma shrinks back to base when settled (1/s)
  // worst-case (final) sigma = base + every source maxed + debuff — the dispersion cone you can
  // never be worse than. Used to draw the "final" reference cone alongside the live one.
  worstCase(){ return this.base + this.moveMax + this.hullRotMax + this.turretRotMax + this.fireDebuff; }
};
// current per-frame motion-driven sigma target for the player
function motionSigma(t, dt){
  if(dt<=0) return SPREAD.base;
  const hullRate  = Math.abs(norm(t.hullAngle - t.prevHullAngle + Math.PI) - Math.PI) / dt; // |Δangle|/s
  const turRate   = Math.abs(norm(t.turretAngle - t.prevTurretAngle + Math.PI) - Math.PI) / dt;
  // forward speed proxy: maxSpeed scaled by whether the player is driving (only player moves here)
  let speed = 0;
  if(t.id==='player'){
    speed = (keys['w']||keys['s']) ? t.maxSpeed : 0;
  }
  const sMove = SPREAD.moveMax    * Math.min(1, speed / t.maxSpeed);
  const sHull = SPREAD.hullRotMax * Math.min(1, hullRate / t.turnRate);
  const sTur  = SPREAD.turretRotMax * Math.min(1, turRate / t.turretTurnRate);
  let base = SPREAD.base + (t.fireDebuffT>0 ? SPREAD.fireDebuff : 0);
  return base + sMove + sHull + sTur;
}
// per-frame update of a tank's live sigma toward its motion target (bloom fast, shrink slow)
function updateSigma(t, dt){
  const target = motionSigma(t, dt);
  const debuffBase = SPREAD.base + (t.fireDebuffT>0 ? SPREAD.fireDebuff : 0);
  if(target > t.sigma){
    t.sigma += Math.min(target - t.sigma, SPREAD.bloomRate * dt);
  } else {
    t.sigma -= Math.min(t.sigma - Math.max(target, debuffBase), SPREAD.shrinkRate * dt);
    if(t.sigma < debuffBase) t.sigma = debuffBase;
  }
}

// ---------- pure 2D armor model (flat thickness per direction, no glacis/mesh) ----------
const ARMOR = {
  hull:   { front:70, side:38, rear:26 },
  turret: { front:95, side:50, rear:24 }
};
const BOUNCE_ANGLE = 78 * Math.PI/180;

function partCorners(cx,cy,angle,halfL,halfW){
  const local = [ [halfL,-halfW], [halfL,halfW], [-halfL,halfW], [-halfL,-halfW] ]; // FL,FR,RR,RL
  return local.map(([dx,dy])=>{
    const r = rotate(dx,dy,angle);
    return { x: cx+r.x, y: cy+r.y };
  });
}
function partEdges(corners, angle){
  const names = ['front','right','rear','left'];
  const localNormals = [ [1,0],[0,1],[-1,0],[0,-1] ];
  const edges = [];
  for(let i=0;i<4;i++){
    const a = corners[i], b = corners[(i+1)%4];
    const n = rotate(localNormals[i][0], localNormals[i][1], angle);
    edges.push({ name:names[i], a,b, nx:n.x, ny:n.y, faceKey: (names[i]==='left'||names[i]==='right') ? 'side' : names[i] });
  }
  return edges;
}
function raycastTank(ox,oy,dx,dy, tank){
  const turCx = tank.x + Math.cos(tank.hullAngle)*8;
  const turCy = tank.y + Math.sin(tank.hullAngle)*8;
  const parts = [
    { key:'turret', cx:turCx, cy:turCy, angle:tank.turretAngle, hl:tank.turLen/2, hw:tank.turWid/2 },
    { key:'hull',   cx:tank.x, cy:tank.y, angle:tank.hullAngle, hl:tank.hullLen/2, hw:tank.hullWid/2 }
  ];
  for(const p of parts){
    const corners = partCorners(p.cx,p.cy,p.angle,p.hl,p.hw);
    const edges = partEdges(corners, p.angle);
    let best = null;
    for(const e of edges){
      const hit = segRayIntersect(ox,oy,dx,dy, e.a.x,e.a.y, e.b.x,e.b.y);
      if(hit && hit.t>0.001 && (!best || hit.t < best.t)){
        best = { t:hit.t, s:hit.s, edge:e };
      }
    }
    if(best){
      const px = ox+dx*best.t, py = oy+dy*best.t;
      return { part:p.key, edgeName:best.edge.name, faceKey:best.edge.faceKey, nx:best.edge.nx, ny:best.edge.ny, s:best.s, x:px, y:py, t:best.t };
    }
  }
  return null;
}
function moduleFromHit(hit){
  if(hit.part==='turret'){
    if(hit.faceKey==='side'){
      if(hit.s>0.3 && hit.s<0.7) return {key:'crew', label:'乘员(炮手)'};
      return {key:'turretHull', label:'炮塔装甲'};
    }
    return {key:'turretHull', label:'炮塔装甲'};
  }
  if(hit.faceKey==='side'){
    if(hit.s<0.22 || hit.s>0.78) return {key:'track', label:'履带/负重轮'};
    if(hit.s<0.5) return {key:'ammo', label:'弹药架'};
    return {key:'engine', label:'油箱/发动机'};
  }
  return {key:'hullHull', label: hit.edgeName==='front' ? '车体正面装甲' : '车体后部装甲'};
}
function faceLabel(k){ return {front:'正面',side:'侧面',rear:'后部'}[k]||k; }

// turret pivot / gun root
function turretPivot(t){ return { x: t.x + Math.cos(t.hullAngle)*8, y: t.y + Math.sin(t.hullAngle)*8 }; }
function gunRoot(t){
  const p = turretPivot(t);
  return { x: p.x + Math.cos(t.turretAngle)*(t.turLen/2), y: p.y + Math.sin(t.turretAngle)*(t.turLen/2) };
}

// ---------- cover system ----------
// Height-class x cover-tier x hit-part -> block PROBABILITY. Deliberately a lookup table instead
// of precise 3D silhouette clipping: this is a 2D top-down game, so a rough statistical stand-in
// for "how much of the tank's real 3D profile pokes out above this cover" is both cheaper and,
// arguably, more honest than fake-precise geometry we can't actually back up in 2D.
//
// Distance-contested model: whichever side (shooter or target) sits closer to a given cover gets
// the advantage on THAT cover — closer = your own shots pass it more easily, farther = your shots
// eat more of the block chance. 'full' cover (a solid building) skips all of this and just blocks
// outright when the line of sight physically crosses it — there's no proximity nuance to a wall
// with no gaps. 'half' cover (a foxhole/sandbag cluster) is where the graduated model applies.
const COVER_TIERS = {
  half: { label:'半高掩体',           fill:'rgba(166,138,60,0.4)',  stroke:'#a68a3c', mode:'graduated' },
  full: { label:'全高掩体',           fill:'rgba(106,106,106,0.55)', stroke:'#6a6a6a', mode:'solid' }
};
// base block amplitude AT ZERO DISTANCE for 'graduated' cover — height class sets the ceiling,
// distance tiers below scale it down from there.
const DEFENSE_BASE = {
  medium: { hull:0.8,  turret:0.15 },
  heavy:  { hull:0.6,  turret:0.10 }
};
const ATTACKER_AMPLITUDE_FACTOR = 0.5; // being close to the same cover helps the shooter too, just less than it helps the defender
// discrete distance bands (edge-to-edge, px) -> fraction of the base amplitude retained
function distanceTier(dist){
  if(dist <= 15) return 1.0;
  if(dist <= 45) return 0.55;
  if(dist <= 90) return 0.22;
  return 0;
}

// static test cover objects, sitting directly on the default player↔dummy firing lane (y=340)
// so alignment is guaranteed by default — drive the dummy forward/back (arrow keys) to tuck behind one
const covers = [
  { x:470, y:340, w:80, h:34, angle:0, tier:'half' },
  { x:660, y:340, w:70, h:34, angle:0, tier:'full' }
];

// every cover whose footprint the shot's line crosses between shooter and target, with each
// side's edge-to-edge distance to that specific cover (entry point used as the reference point)
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
  hits.sort((a,b)=>a.distA-b.distA); // nearest-to-shooter first
  return hits;
}
// composes every crossed cover's contribution into one final block probability for this shot
function coverBlockInfo(ox,oy,tx,ty, shooter, target, part){
  const hits = findCoversOnPath(ox,oy,tx,ty);
  if(hits.length===0) return { prob:0, hits:[] };
  let survive = 1; // product of (1-p_i)
  for(const h of hits){
    const tier = COVER_TIERS[h.cover.tier];
    let p;
    if(tier.mode==='solid'){
      p = 1.0; // a real wall doesn't care who's closer
    } else {
      const Bt = distanceTier(h.distB) * DEFENSE_BASE[target.heightClass][part];
      const Ba = distanceTier(h.distA) * DEFENSE_BASE[shooter.heightClass][part] * ATTACKER_AMPLITUDE_FACTOR;
      p = Math.max(0, Math.min(1, Bt - Ba));
    }
    h.prob = p;
    survive *= (1-p);
  }
  return { prob: 1-survive, hits };
}
// Roll the ACTUAL shell's fate against cover along its (spread-affected) flight path. Unlike
// coverBlockInfo (which is for the no-spread prediction), this walks the covers the real shell ray
// crosses and decides a single blocking cover: full cover always blocks (it's a wall); half cover
// rolls its graduated probability. Returns the blocking cover (with its impact point) or null.
function coverRollOnShellRay(ox,oy,tx,ty, shooter, target, part){
  const hits = findCoversOnPath(ox,oy,tx,ty);
  for(const h of hits){ // already nearest-to-shooter first
    const tier = COVER_TIERS[h.cover.tier];
    let p;
    if(tier.mode==='solid'){
      p = 1.0; // a real wall blocks the shell deterministically — geometry, not luck
    } else {
      const Bt = distanceTier(h.distB) * DEFENSE_BASE[target.heightClass][part];
      const Ba = distanceTier(h.distA) * DEFENSE_BASE[shooter.heightClass][part] * ATTACKER_AMPLITUDE_FACTOR;
      p = Math.max(0, Math.min(1, Bt - Ba));
    }
    if(Math.random() < p){
      return { cover:h.cover, point:h.point, prob:p, tier:h.cover.tier };
    }
  }
  return null;
}
function resolveShot(ox,oy,dx,dy, shooter, target, coverBlock){
  // coverBlock (from coverRollOnShellRay) is decided on the spread ray BEFORE this call, so cover
  // wins outright regardless of whether the spread ray also grazed the target silhouette — a wall
  // the shell physically hits stops the shell. The armor roll below only runs if the shell got through.
  if(coverBlock){
    const label = COVER_TIERS[coverBlock.tier].label;
    return {
      outcome:'COVER', cls:'COVER',
      text:`被${label}挡住 — 炮弹被掩体截停（该掩体本次格挡概率 ${(coverBlock.prob*100).toFixed(0)}%）`,
      hitPoint: coverBlock.point
    };
  }

  const hit = raycastTank(ox,oy,dx,dy, target);
  if(!hit) return { outcome:'MISS', text:'脱靶 — 未命中目标轮廓' };

  const cosT = Math.abs(dx*hit.nx + dy*hit.ny);
  const theta = Math.acos(Math.min(1,Math.max(-1,cosT)));
  const thickness = ARMOR[hit.part][hit.faceKey];
  const mod = moduleFromHit(hit);

  let outcome, text, cls;
  if(theta > BOUNCE_ANGLE){
    outcome='BOUNCE'; cls='BOUNCE';
    text = `跳弹！${hit.part==='turret'?'炮塔':'车体'} ${faceLabel(hit.faceKey)} 入射角 ${(theta*180/Math.PI).toFixed(0)}° 超过跳弹角`;
  } else {
    const eff = thickness/Math.cos(theta);
    if(eff > shooter.penetration){
      outcome='BLOCK'; cls='BLOCK';
      text = `未击穿 — ${faceLabel(hit.faceKey)} 等效厚度 ${eff.toFixed(0)} > 穿深 ${shooter.penetration}`;
    } else {
      outcome='PEN'; cls='PEN';
      const invuln = (target.id==='dummy' && dummy.invuln);
      let dmg = shooter.damage * (0.85 + Math.random()*0.3);
      let extra = '';
      if(!invuln){
        if(mod.key==='ammo' && Math.random()<0.28){
          dmg = target.hp; extra = '（弹药架殉爆！）'; cls='CRIT';
        } else if(mod.key==='track'){
          target.immobT = 4; extra = '（履带被击断，锁定 4s）';
        } else if(mod.key==='engine'){
          target.dotT = 3; extra = '（油箱起火，持续损伤）';
        } else if(mod.key==='crew'){
          target.fireDebuffT = 5; extra = '（炮手阵亡，散布增大）';
        }
        target.hp = Math.max(0, target.hp - dmg);
      } else {
        extra = '（靶车无敌，不掉血）';
      }
      text = `击穿！命中 ${mod.label}，造成 ${dmg.toFixed(0)} 伤害 ${extra}`;
    }
  }
  return { outcome, text, cls, part:hit.part, faceKey:hit.faceKey, hitPoint:{x:hit.x,y:hit.y} };
}

// ---------- entity registry ----------
// Every tank (player, allies, enemies, and eventually escort drones) lives in one array.
// `player`/`dummy` below are just convenience references into it — nothing in the game loop
// should assume there are only ever these two; new code should go through `entities`.
const entities = [];
function spawnTank(opts){
  const t = makeTank(opts);
  t.spawn = { x:t.x, y:t.y, hullAngle:t.hullAngle, turretAngle:t.turretAngle, hp:t.hp }; // for resetEntity()
  entities.push(t);
  return t;
}
function resetEntity(t){
  Object.assign(t, t.spawn, { immobT:0, dotT:0, fireDebuffT:0, reloadT:0, _dead:false, reviveT:0 });
}
function isHostile(teamA, teamB){
  const enemySide = t => t==='enemy';
  return enemySide(teamA) !== enemySide(teamB); // enemy team vs. (player+ally) side
}
function livingEnemiesOf(team){ return entities.filter(e=>isHostile(e.team,team) && e.hp>0); }
function nearestEnemyTo(shooter){
  const candidates = livingEnemiesOf(shooter.team);
  let best=null, bestD=Infinity;
  for(const c of candidates){
    const d = Math.hypot(c.x-shooter.x, c.y-shooter.y);
    if(d<bestD){ bestD=d; best=c; }
  }
  return best;
}

const player = spawnTank({ id:'player', team:'player', x:260, y:340, hullAngle:0, turretAngle:0, color:'#7ed957', heightClass:'medium' });
player.sigma = SPREAD.base;
const dummy  = spawnTank({ id:'dummy',  team:'enemy',  x:760, y:340, hullAngle:Math.PI, turretAngle:Math.PI, color:'#ff8a5c', heightClass:'heavy' });
dummy.turretSwing = 0;
// test-rig-only toggles so the rig stays usable as a target after a kill (see HUD buttons)
dummy.invuln = false;       // when true: hp is locked, dummy never takes damage
dummy.autoRevive = true;    // when true: dummy respawns full 1.5s after being destroyed
dummy.reviveT = 0;          // countdown to auto-revive

const keys = {};
// NOTE: keys 1/2/0 used to force turret/hull target-lock; removed per design — this slot is
// reserved for a future ammo-type switch (AP/APCR/HE etc) instead of a part-lock command.
window.addEventListener('keydown', e=>{
  keys[e.key.toLowerCase()]=true;
  if(e.key===' ') e.preventDefault();
});
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });

let mouseWorld = {x:player.x+100,y:player.y};
canvas.addEventListener('mousemove', e=>{
  const r = canvas.getBoundingClientRect();
  mouseWorld.x = e.clientX - r.left;
  mouseWorld.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', e=>{ if(e.button===0) tryFire(); });

document.getElementById('resetBtn').addEventListener('click', ()=>{
  entities.forEach(resetEntity);
  dummy.turretSwing = 0;
  // sync HP input + toggle visuals with the reset state
  document.getElementById('dummyHpInput').value = dummy.maxHp;
  const ib = document.getElementById('invulnBtn'); ib.textContent = dummy.invuln ? '开启 INVULN' : '关闭 INVULN'; ib.classList.toggle('active', dummy.invuln);
  const ab = document.getElementById('autoReviveBtn'); ab.textContent = dummy.autoRevive ? '开启 AUTO-REVIVE' : '关闭 AUTO-REVIVE'; ab.classList.toggle('active', dummy.autoRevive);
  logClear();
});
document.getElementById('heightBtn').addEventListener('click', ()=>{
  dummy.heightClass = dummy.heightClass==='heavy' ? 'medium' : 'heavy';
  document.getElementById('eHeightClass').textContent = dummy.heightClass==='heavy' ? '重坦(高车体)' : '中坦(矮车体)';
});
document.getElementById('applyHpBtn').addEventListener('click', ()=>{
  const v = Math.max(1, Math.min(99999, parseInt(document.getElementById('dummyHpInput').value,10)||100));
  document.getElementById('dummyHpInput').value = v;
  dummy.maxHp = v;
  dummy.hp = v;
  dummy.spawn.hp = v;            // keep reset consistent with the chosen max
  dummy._dead = false;
  dummy.reviveT = 0;
  pushLog(`靶车满血值设为 ${v}`,'COVER');
});
document.getElementById('invulnBtn').addEventListener('click', (e)=>{
  dummy.invuln = !dummy.invuln;
  e.currentTarget.textContent = dummy.invuln ? '开启 INVULN' : '关闭 INVULN';
  e.currentTarget.classList.toggle('active', dummy.invuln);
  if(dummy.invuln){ dummy._dead=false; dummy.reviveT=0; if(dummy.hp<=0){ dummy.hp = dummy.maxHp; } }
  pushLog(`靶车无敌：${dummy.invuln?'开':'关'}`,'COVER');
});
document.getElementById('autoReviveBtn').addEventListener('click', (e)=>{
  dummy.autoRevive = !dummy.autoRevive;
  e.currentTarget.textContent = dummy.autoRevive ? '开启 AUTO-REVIVE' : '关闭 AUTO-REVIVE';
  e.currentTarget.classList.toggle('active', dummy.autoRevive);
  pushLog(`靶车自动复活：${dummy.autoRevive?'开':'关'}`,'COVER');
});
// initialize toggle button visuals to match defaults (autoRevive on)
(function(){
  const ib = document.getElementById('invulnBtn'); ib.textContent = dummy.invuln ? '开启 INVULN' : '关闭 INVULN'; ib.classList.toggle('active', dummy.invuln);
  const ab = document.getElementById('autoReviveBtn'); ab.textContent = dummy.autoRevive ? '开启 AUTO-REVIVE' : '关闭 AUTO-REVIVE'; ab.classList.toggle('active', dummy.autoRevive);
})();

// ---------- log ----------
const logEl = document.getElementById('log');
function logClear(){ logEl.innerHTML=''; }
function pushLog(text, cls){
  const d = document.createElement('div');
  d.className = cls||'';
  const time = new Date().toLocaleTimeString('en-GB',{hour12:false});
  d.textContent = `[${time}] ${text}`;
  logEl.prepend(d);
  while(logEl.children.length>60) logEl.removeChild(logEl.lastChild);
}

// ---------- firing ----------
let tracers = [];
let impacts = [];

function tryFire(){
  if(player.reloadT>0 || player.immobT>0) return;
  const target = nearestEnemyTo(player);
  if(!target) return;
  player.reloadT = player.reload;
  const gr = gunRoot(player);
  const ox = gr.x, oy = gr.y;

  // the shell flies along a spread-affected ray; the live bloom sigma decides how far it wobbles
  const sigma = player.sigma;
  const spreadAngle = player.turretAngle + gaussian(sigma);
  const dx = Math.cos(spreadAngle), dy = Math.sin(spreadAngle);

  // Where would THIS shell hit the target (if at all)? That ray endpoint anchors the cover search,
  // so cover is judged on the actual flight path — a shell that wobbles into a wall gets stopped.
  const shellHit = raycastTank(ox,oy,dx,dy, target);
  const tx = shellHit ? shellHit.x : ox + dx*1200;
  const ty = shellHit ? shellHit.y : oy + dy*1200;
  const part = shellHit ? shellHit.part : 'hull';
  const coverBlock = coverRollOnShellRay(ox,oy, tx,ty, player, target, part);

  const res = resolveShot(ox,oy,dx,dy, player, target, coverBlock);
  tracers.push({x1:ox,y1:oy, x2: res.hitPoint?res.hitPoint.x:ox+dx*1200, y2: res.hitPoint?res.hitPoint.y:oy+dy*1200, life:0.18});
  if(res.hitPoint){
    const color = res.outcome==='PEN' ? '#ff5c4d' : res.outcome==='BOUNCE' ? '#5cc8ff' : res.outcome==='COVER' ? '#ffb454' : '#7a8065';
    impacts.push({x:res.hitPoint.x, y:res.hitPoint.y, life:0.4, color});
  }
  pushLog(res.text, res.cls || (res.outcome==='MISS'?'BLOCK':''));
}

// ---------- live firing solution (no spread) ----------
function updateSolution(){
  const target = nearestEnemyTo(player);
  const gr = gunRoot(player);
  const ox = gr.x, oy = gr.y;
  const dx = Math.cos(player.turretAngle), dy = Math.sin(player.turretAngle);
  const hit = target ? raycastTank(ox,oy,dx,dy, target) : null;
  const elPart = document.getElementById('solPart');
  const elAngle = document.getElementById('solAngle');
  const elThick = document.getElementById('solThick');
  const elEff = document.getElementById('solEff');
  const elResult = document.getElementById('solResult');
  const elCover = document.getElementById('solCover');
  if(!hit){
    elPart.textContent='--'; elAngle.textContent='--'; elThick.textContent='--'; elEff.textContent='--';
    elResult.textContent='未瞄准目标'; elResult.className='v';
    elCover.textContent='--'; elCover.className='v';
    return;
  }
  const coverInfo = coverBlockInfo(ox,oy, hit.x,hit.y, player, target, hit.part);
  if(coverInfo.prob>0){
    const detail = coverInfo.hits.map(h=>`${COVER_TIERS[h.cover.tier].label}(己方${h.distA.toFixed(0)}px/靶${h.distB.toFixed(0)}px→${(h.prob*100).toFixed(0)}%)`).join(' × ');
    elCover.textContent = `${(coverInfo.prob*100).toFixed(0)}% — ${detail}`;
    elCover.className = 'v cover';
  } else {
    elCover.textContent = '无遮挡';
    elCover.className = 'v';
  }

  const cosT = Math.abs(dx*hit.nx + dy*hit.ny);
  const theta = Math.acos(Math.min(1,Math.max(-1,cosT)));
  const thickness = ARMOR[hit.part][hit.faceKey];
  const mod = moduleFromHit(hit);
  elPart.textContent = `${hit.part==='turret'?'炮塔':'车体'}·${faceLabel(hit.faceKey)}(${mod.label})`;
  elAngle.textContent = (theta*180/Math.PI).toFixed(1)+'°';
  elThick.textContent = thickness+' mm';
  if(theta>BOUNCE_ANGLE){
    elEff.textContent = '—';
    elResult.textContent = '必定跳弹'; elResult.className='v bounce';
  } else {
    const eff = thickness/Math.cos(theta);
    elEff.textContent = eff.toFixed(0)+' mm';
    if(eff > player.penetration){ elResult.textContent='无法击穿'; elResult.className='v bad'; }
    else { elResult.textContent='可以击穿'; elResult.className='v ok'; }
  }
}

// ---------- update ----------
let last = performance.now();
function update(dt){
  if(player.immobT>0) player.immobT -= dt; else {
    if(keys['a']) player.hullAngle -= player.turnRate*dt;
    if(keys['d']) player.hullAngle += player.turnRate*dt;
    let mv=0;
    if(keys['w']) mv=1; else if(keys['s']) mv=-1;
    player.x += Math.cos(player.hullAngle)*mv*player.maxSpeed*dt;
    player.y += Math.sin(player.hullAngle)*mv*player.maxSpeed*dt;
  }
  player.x = Math.max(40, Math.min(canvas.width-40, player.x));
  player.y = Math.max(40, Math.min(canvas.height-40, player.y));

  const desired = Math.atan2(mouseWorld.y-player.y, mouseWorld.x-player.x);
  const diff = angDiff(desired, player.turretAngle);
  const maxStep = player.turretTurnRate*dt;
  player.turretAngle = norm(player.turretAngle + Math.max(-maxStep, Math.min(maxStep, diff)));
  updateSigma(player, dt);              // bloom/shrink on move·hull-traverse·turret-traverse
  player.prevHullAngle = player.hullAngle;
  player.prevTurretAngle = player.turretAngle;

  if(player.reloadT>0) player.reloadT = Math.max(0, player.reloadT-dt);
  if(player.fireDebuffT>0) player.fireDebuffT -= dt;
  if(keys[' ']) tryFire();

  if(dummy.immobT>0) dummy.immobT -= dt; else {
    if(keys['arrowleft']) dummy.hullAngle -= 1.6*dt;
    if(keys['arrowright']) dummy.hullAngle += 1.6*dt;
    let mv=0;
    if(keys['arrowup']) mv=1; else if(keys['arrowdown']) mv=-1;
    dummy.x += Math.cos(dummy.hullAngle)*mv*90*dt;
    dummy.y += Math.sin(dummy.hullAngle)*mv*90*dt;
  }
  dummy.x = Math.max(40, Math.min(canvas.width-40, dummy.x));
  dummy.y = Math.max(40, Math.min(canvas.height-40, dummy.y));
  dummy.turretSwing += dt*0.6;
  dummy.turretAngle = dummy.hullAngle + Math.sin(dummy.turretSwing)*0.9;

  entities.forEach(e=>{
    // invulnerable test-rig targets (dummy) never lose hp — DoT, pens, ammo detonations all no-op
    const invuln = (e.id==='dummy' && dummy.invuln);
    if(e.dotT>0 && !invuln){ e.dotT -= dt; e.hp = Math.max(0, e.hp - 6*dt); }
    if(e.hp<=0 && !e._dead){ e._dead=true; pushLog(`${e.id==='player'?'玩家':e.id} 已摧毁 — 按 RESET 重来`,'CRIT'); }
    // auto-revive for the test-rig dummy so you can keep shooting after a kill
    if(e.id==='dummy' && e._dead && dummy.autoRevive){
      e.reviveT = (e.reviveT||0) + dt;
      if(e.reviveT >= 1.5){
        e.hp = e.maxHp; e._dead=false; e.reviveT=0;
        e.immobT=0; e.dotT=0; e.fireDebuffT=0;
        pushLog('靶车自动复活 — 满血','COVER');
      }
    }
  });

  tracers.forEach(t=>t.life-=dt); tracers = tracers.filter(t=>t.life>0);
  impacts.forEach(t=>t.life-=dt); impacts = impacts.filter(t=>t.life>0);

  updateSolution();
  updateHud();
}

function updateHud(){
  document.getElementById('pHpBar').style.width = (player.hp/player.maxHp*100)+'%';
  document.getElementById('pHpVal').textContent = player.hp.toFixed(0);
  document.getElementById('eHpBar').style.width = (dummy.hp/dummy.maxHp*100)+'%';
  document.getElementById('eHpVal').textContent = dummy.hp.toFixed(0);
  document.getElementById('eStatus').textContent =
    dummy.hp<=0 ? '已摧毁' : dummy.immobT>0 ? `履带损坏 (${dummy.immobT.toFixed(1)}s)` : dummy.dotT>0 ? '起火中' : '正常';
  const rf = document.getElementById('reloadFill');
  rf.style.width = (100 - (player.reloadT/player.reload*100)) + '%';
}

// ---------- draw ----------
function drawCover(cov){
  const tier = COVER_TIERS[cov.tier];
  const c = partCorners(cov.x,cov.y,cov.angle, cov.w/2, cov.h/2);
  ctx.beginPath();
  ctx.moveTo(c[0].x,c[0].y);
  for(let i=1;i<4;i++) ctx.lineTo(c[i].x,c[i].y);
  ctx.closePath();
  ctx.fillStyle = tier.fill; ctx.fill();
  ctx.strokeStyle = tier.stroke; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle = tier.stroke; ctx.font='10px "JetBrains Mono", monospace';
  ctx.fillText(tier.label, cov.x-24, cov.y-cov.h/2-6);
}
function drawTank(t){
  const turCx = t.x + Math.cos(t.hullAngle)*8;
  const turCy = t.y + Math.sin(t.hullAngle)*8;
  const hc = partCorners(t.x,t.y,t.hullAngle, t.hullLen/2, t.hullWid/2);
  ctx.beginPath();
  ctx.moveTo(hc[0].x,hc[0].y);
  for(let i=1;i<4;i++) ctx.lineTo(hc[i].x,hc[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = t.color; ctx.lineWidth=2; ctx.stroke();
  ctx.strokeStyle = t.color;
  ctx.beginPath(); ctx.moveTo(hc[0].x,hc[0].y); ctx.lineTo(hc[1].x,hc[1].y); ctx.lineWidth=4; ctx.stroke();

  const tc = partCorners(turCx,turCy,t.turretAngle, t.turLen/2, t.turWid/2);
  ctx.beginPath();
  ctx.moveTo(tc[0].x,tc[0].y);
  for(let i=1;i<4;i++) ctx.lineTo(tc[i].x,tc[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  ctx.strokeStyle = t.color; ctx.lineWidth=1.5; ctx.stroke();

  ctx.strokeStyle = t.color; ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(turCx,turCy);
  ctx.lineTo(turCx+Math.cos(t.turretAngle)*(t.turLen*0.9), turCy+Math.sin(t.turretAngle)*(t.turLen*0.9));
  ctx.stroke();

  // height-class tag
  ctx.fillStyle = t.color; ctx.font='10px "JetBrains Mono", monospace';
  ctx.fillText(t.heightClass==='heavy' ? '重坦' : '中坦', t.x-10, t.y+t.hullWid/2+16);
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth=1;
  for(let x=0;x<canvas.width;x+=40){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
  for(let y=0;y<canvas.height;y+=40){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }

  covers.forEach(drawCover);
  entities.forEach(drawTank);

  tracers.forEach(t=>{
    ctx.strokeStyle = `rgba(255,180,84,${Math.max(0,t.life/0.18)})`;
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(t.x1,t.y1); ctx.lineTo(t.x2,t.y2); ctx.stroke();
  });
  impacts.forEach(im=>{
    const r = (0.4-im.life)*40;
    ctx.strokeStyle = im.color; ctx.globalAlpha = Math.max(0,im.life/0.4);
    ctx.beginPath(); ctx.arc(im.x,im.y,r,0,TAU); ctx.stroke();
    ctx.globalAlpha=1;
  });

  // ---- aim line + dispersion cones ----
  const gr = gunRoot(player);
  const aimA = player.turretAngle;
  const aimFar = { x: gr.x + Math.cos(aimA)*1400, y: gr.y + Math.sin(aimA)*1400 };
  // The aim line is clipped at the first FULL cover it crosses — a solid wall blocks line of sight
  // whether or not a target is behind it, so the dashed aim ray shouldn't visually pass through it.
  const aimCovers = findCoversOnPath(gr.x,gr.y, aimFar.x,aimFar.y);
  const firstSolid = aimCovers.find(h => COVER_TIERS[h.cover.tier].mode==='solid');
  const aimEnd = firstSolid ? firstSolid.point : { x: gr.x+Math.cos(aimA)*900, y: gr.y+Math.sin(aimA)*900 };

  // aim line (center, no spread)
  ctx.strokeStyle='rgba(255,180,84,0.3)'; ctx.setLineDash([5,5]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(gr.x,gr.y); ctx.lineTo(aimEnd.x,aimEnd.y); ctx.stroke();

  // dispersion cones — two nested cones drawn as their left/right boundary rays:
  //   • live cone:   turretAngle ± current bloom sigma (grows when moving/traversing, shrinks when settled)
  //   • final cone:  turretAngle ± worst-case sigma (the dispersion you can never exceed)
  // Each cone is a pair of dashed rays, so "2 dashed lines" = 2 cones (live + final reference).
  function drawCone(sigma, color, dash){
    const L = 900;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(gr.x,gr.y);
    ctx.lineTo(gr.x+Math.cos(aimA-sigma)*L, gr.y+Math.sin(aimA-sigma)*L);
    ctx.moveTo(gr.x,gr.y);
    ctx.lineTo(gr.x+Math.cos(aimA+sigma)*L, gr.y+Math.sin(aimA+sigma)*L);
    ctx.stroke();
  }
  drawCone(SPREAD.worstCase(), 'rgba(255,180,84,0.18)', [3,7]);  // final (worst-case) cone — faint, long dash
  drawCone(player.sigma,          'rgba(255,180,84,0.5)',  [2,4]);  // live cone — brighter, short dash
  ctx.setLineDash([]);
}

function loop(now){
  const dt = Math.min(0.05, (now-last)/1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
