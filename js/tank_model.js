'use strict';

// ---------- three-layer attribute system (base / modifiers / stats) ----------
// Combat code reads ONLY tank.stats. `tank.base` holds the untuned values; `tank.modifiers`
// (buffs/debuffs from cards, shop, skills) layer on top. Modifiers apply adds first, then mults.
function computeStats(base, modifiers){
  const s = {
    penetration: base.penetration,
    damage: base.damage,
    reload: base.reload,
    shellSpeed: base.shellSpeed || 1200,
    maxSpeed: base.maxSpeed,
    turnRate: base.turnRate,
    turretTurnRate: base.turretTurnRate,
    maxHp: base.maxHp,
    weight: base.weight,
    enginePower: base.enginePower,
    armor: JSON.parse(JSON.stringify(base.armor)),
    // 弹药架：玩家/友方需在窗口内被 2 次命中才殉爆；窗口可随升级缩短（游戏内表述「弹药故障排障」）
    ammoFaultWindow: base.ammoFaultWindow !== undefined ? base.ammoFaultWindow : 5,
    // 履带被击毁锁定时间（秒）；玩家侧可随升级缩短
    trackLock: base.trackLock !== undefined ? base.trackLock : 8
  };
  // derived mobility: forward acceleration (px/s^2) from horsepower per tonne scaled to game units.
  // heavier tank (more weight) @ same hp accelutes slower; lower braking threshold = faster decel.
  s.accel = (base.enginePower / base.weight) * ACCEL_POWER_TO_PX_SCALE;
  s.brake = s.accel * BRAKE_FACTOR;
  // pass 1: adds, pass 2: mults (so mult scales the accumulated add result)
  for(const pass of ['add','mult']){
    for(const m of (modifiers||[])){
      if(m.mode !== pass) continue;
      if(m.stat.startsWith('armor')){
        applyArmorMod(s.armor, m);
      } else if(s[m.stat] !== undefined){
        s[m.stat] = pass==='add' ? s[m.stat]+m.value : s[m.stat]*m.value;
      }
    }
  }
  return s;
}

// armor modifiers use paths like "armor.hull.front", "armor.hull", "armor.turret.side"
function applyArmorMod(armor, m){
  const parts = m.stat.split('.');
  const group = armor[parts[1]];
  if(!group) return;
  if(parts[2]){
    if(group[parts[2]] !== undefined){
      group[parts[2]] = m.mode==='add' ? group[parts[2]]+m.value : group[parts[2]]*m.value;
    }
  } else {
    for(const k in group){
      group[k] = m.mode==='add' ? group[k]+m.value : group[k]*m.value;
    }
  }
}

function addModifier(tank, mod){
  tank.modifiers.push({
    stat: mod.stat, mode: mod.mode || 'add', value: mod.value,
    source: mod.source || 'generic',
    expiresAt: mod.expiresAt !== undefined ? mod.expiresAt : Infinity
  });
  refreshStats(tank);
  return tank.stats;
}

function addTimedModifier(tank, mod, durationMs){
  return addModifier(tank, Object.assign({}, mod, { expiresAt: Date.now()+durationMs }));
}

function removeModifierBySource(tank, source){
  tank.modifiers = tank.modifiers.filter(m => m.source !== source);
  refreshStats(tank);
  return tank.stats;
}

function refreshStats(tank){
  const now = Date.now();
  if(tank.modifiers.some(m => m.expiresAt !== Infinity && m.expiresAt <= now)){
    tank.modifiers = tank.modifiers.filter(m => m.expiresAt === Infinity || m.expiresAt > now);
  }
  tank.stats = computeStats(tank.base, tank.modifiers);
  return tank.stats;
}

function makeTank(opts){
  const tank = Object.assign({
    id:null, team:'enemy', // 'player' | 'ally' | 'enemy'
    x:0,y:0,hullAngle:0,turretAngle:0,
    hullLen:64, hullWid:38,
    turLen:34, turWid:36,
    speed:0,
    hasTurret:true,              // legacy field kept for backward compat; new specs omit it
    traverseLimit: Math.PI,      // 180° = full 360° rotation by default; < π → limited traverse
    reloadT:0,
    reloadT:0,
    immobT:0, fireDebuffT:0, dotT:0,
    ammoFaultT:0, ammoFaultHits:0,   // 弹药架故障窗口倒计时 / 窗口内命中次数
    fireT:0,                         // 起火燃烧视觉时间（秒）
    trackBroken:false,               // 履带被击断（视觉用）
    ammoBlew:false, _blowFx:false,   // 弹药架殉爆状态 + 视觉已生成标记
    heightClass:'medium',
    color:'#7ed957',
    trackPhase:0,
    attachments: [],
    anchors: {
      hull_top: { dx: 0, dy: 0 },
      hull_front: { dx: 32, dy: 0 },
      hull_rear: { dx: -32, dy: 0 },
      turret_top: { dx: 0, dy: 0 },
      gun_root: { dx: 17, dy: 0 }
    },
    base: {
      maxSpeed: 120, turnRate: 2.0, turretTurnRate: 2.2,
      penetration: 120, damage: 34, reload: 1.3, shellSpeed: 1200,
      maxHp: 100,
      weight: 300, enginePower: 900,
      armor: { hull:{front:110,side:38,rear:26}, turret:{front:140,side:50,rear:24} },
      ammoFaultWindow: 5,
      trackLock: 8
    },
    modifiers: [],
    sigma:0, prevHullAngle:0, prevTurretAngle:0
  }, opts);

  const base = tank.base = Object.assign({}, tank.base);
  const dflt = { maxSpeed:120, turnRate:2.0, turretTurnRate:2.2, penetration:120, damage:34, reload:1.3, shellSpeed:1200, maxHp:100, weight:300, enginePower:900 };
  for(const k in dflt) if(base[k] === undefined) base[k] = dflt[k];
  if(!base.armor) base.armor = { hull:{front:110,side:38,rear:26}, turret:{front:140,side:50,rear:24} };
  tank.modifiers = tank.modifiers || [];
  refreshStats(tank);
  tank.hp = tank.stats.maxHp;
  tank.maxHp = tank.stats.maxHp;
  tank.color = teamColor(tank);
  if (opts.traverseLimitInDeg !== undefined) {
    tank.traverseLimit = opts.traverseLimitInDeg * Math.PI / 180;
  }
  return tank;
}

const SPEED_KMH_FACTOR = 0.5; // (maxSpeed in px/s / 2) = km/h
const SPEED_PX_FACTOR  = 1.6;
// convert horsepower-per-tonne into game px/s^2 acceleration; these two set the accel feel.
// For responsive roguelike action, responsiveness is high (accel x180 scale, quick brake x3.5).
const ACCEL_POWER_TO_PX_SCALE = 180;
const BRAKE_FACTOR = 3.5;
function tankKmh(t){ return Math.round((t.stats?.maxSpeed ?? t.maxSpeed) * SPEED_KMH_FACTOR); }

const TEAM_COLORS = { player: '#5c8cff', ally: '#7ed957', enemy: '#ff8a8a' };
function teamColor(t){ return TEAM_COLORS[t.team] || TEAM_COLORS.enemy; }

function applyTankConfig(tank, spec){
  if (!spec) return;
  if (spec.hasTurret !== undefined) tank.hasTurret = spec.hasTurret; // legacy entries only
  if (spec.traverseLimit !== undefined) tank.traverseLimit = spec.traverseLimit * Math.PI / 180;
  const b = tank.base;
  if (spec.maxSpeed !== undefined) b.maxSpeed = spec.maxSpeed;
  if (spec.turnRate !== undefined) b.turnRate = spec.turnRate;
  if (spec.turretTurnRate !== undefined) b.turretTurnRate = spec.turretTurnRate;
  if (spec.enginePower !== undefined) b.enginePower = spec.enginePower;
  if (spec.weight !== undefined) b.weight = spec.weight;
  if (spec.hp !== undefined) b.maxHp = spec.hp;
  if (spec.maxHp !== undefined) b.maxHp = spec.maxHp;
  if (spec.penetration !== undefined) b.penetration = spec.penetration;
  if (spec.damage !== undefined) b.damage = spec.damage;
  if (spec.reload !== undefined) b.reload = spec.reload;
  if (spec.shellSpeed !== undefined) b.shellSpeed = spec.shellSpeed;
  if (spec.heightClass !== undefined) tank.heightClass = spec.heightClass;
  if (spec.trackWidth !== undefined) tank.trackWidth = spec.trackWidth;
  if (spec.trackOffset !== undefined) tank.trackOffset = spec.trackOffset;
  if (spec.ammoFaultWindow !== undefined) b.ammoFaultWindow = spec.ammoFaultWindow;
  if (spec.trackLock !== undefined) b.trackLock = spec.trackLock;
  if (spec.anchors !== undefined) Object.assign(tank.anchors, spec.anchors);
  if (spec.barrel){
    // normalize: new {evac:{style,pos}, jacket:{len,pos}} format, or legacy flat evacPos number
    let evac;
    if (spec.barrel.evac && spec.barrel.evac.style) evac = { style: spec.barrel.evac.style, pos: spec.barrel.evac.pos !== undefined ? spec.barrel.evac.pos : 30 };
    else if (spec.barrel.evacPos !== undefined) evac = { style: spec.barrel.evacPos > 0 ? 'ring' : 'none', pos: spec.barrel.evacPos };
    else evac = { style: 'none', pos: 30 };
    tank.barrel = {
      len: spec.barrel.len || 120,
      width: spec.barrel.width || 18,
      muzzle: spec.barrel.muzzle || 'none',
      evac,
      jacket: spec.barrel.jacket ? { len: spec.barrel.jacket.len || 0, pos: spec.barrel.jacket.pos !== undefined ? spec.barrel.jacket.pos : 45 } : { len: 0, pos: 45 }
    };
  }
  if (spec.armor !== undefined){
    tank.customArmor = spec.armor;
    if (!b.armor) b.armor = {};
    if (spec.armor.hull){ if(!b.armor.hull) b.armor.hull = {}; Object.assign(b.armor.hull, spec.armor.hull); }
    if (spec.armor.turret){ if(!b.armor.turret) b.armor.turret = {}; Object.assign(b.armor.turret, spec.armor.turret); }
  }

  if (spec.hull) {
    if (spec.hull.verts && spec.hull.faces) {
      let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
      for (const [vx, vy] of spec.hull.verts) {
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy;
        if (vy > maxY) maxY = vy;
      }
      const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
      tank.hullSpec = { verts: spec.hull.verts.map(([vx,vy])=>[vx-cx, vy-cy]), faces: spec.hull.faces };
      tank.hullLen = maxX - minX;
      tank.hullWid = maxY - minY;
    }
    if (spec.hull.armor) {
      if (!b.armor) b.armor = {};
      if (!b.armor.hull) b.armor.hull = {};
      Object.assign(b.armor.hull, spec.hull.armor);
    }
  }

  // Turret verts are authored in the turret's own local frame where origin (0,0) IS the turret's
  // rotation axis; `pivot` then places that axis on the hull. Keys are kept exactly as given —
  // re-centering to the bbox would silently move the axis away from `pivot` and spin the turret
  // around the wrong point (炮塔旋转中心漂移/落在炮塔尾部的根因)。
  if (spec.turret && spec.turret.verts && spec.turret.faces) {
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const [vx, vy] of spec.turret.verts) {
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vy < minY) minY = vy;
      if (vy > maxY) maxY = vy;
    }
    tank.turretSpec = { verts: spec.turret.verts.map(([vx,vy])=>[vx, vy]), faces: spec.turret.faces };
    tank.turLen = Math.max(1, maxX - minX);
    tank.turWid = Math.max(1, maxY - minY);
  }
  if (spec.turret && spec.turret.pivot) {
    tank.turretPivotOffset = spec.turret.pivot;
  }
  if (spec.turret && spec.turret.armor) {
    if (!b.armor) b.armor = {};
    if (!b.armor.turret) b.armor.turret = {};
    Object.assign(b.armor.turret, spec.turret.armor);
  }

  refreshStats(tank);
  tank.hp = tank.stats.maxHp;
  tank.maxHp = tank.stats.maxHp;
  if (tank.spawn) tank.spawn.hp = tank.stats.maxHp;
}

const SPREAD = {
  base: 0.018,
  fireDebuff: 0.020,
  moveMax: 0.014,
  hullRotMax: 0.012,
  turretRotMax: 0.018,
  bloomRate: 2.0,
  shrinkRate: 0.3,
  worstCase(){ return this.base + this.moveMax + this.hullRotMax + this.turretRotMax + this.fireDebuff; }
};

function motionSigma(t, dt, keys){
  if(dt<=0) return SPREAD.base;
  const hullRate  = Math.abs(norm(t.hullAngle - t.prevHullAngle + Math.PI) - Math.PI) / dt;
  const turRate   = Math.abs(norm(t.turretAngle - t.prevTurretAngle + Math.PI) - Math.PI) / dt;
  let speed = 0;
  if(t.id==='player' && keys){
    speed = (keys['w']||keys['s']) ? t.stats.maxSpeed : 0;
  }
  const sMove = SPREAD.moveMax    * Math.min(1, speed / t.stats.maxSpeed);
  const sHull = SPREAD.hullRotMax * Math.min(1, hullRate / t.stats.turnRate);
  const sTur  = SPREAD.turretRotMax * Math.min(1, turRate / t.stats.turretTurnRate);
  let base = SPREAD.base + (t.fireDebuffT>0 ? SPREAD.fireDebuff : 0);
  return base + sMove + sHull + sTur;
}

function updateSigma(t, dt, keys){
  const target = motionSigma(t, dt, keys);
  const debuffBase = SPREAD.base + (t.fireDebuffT>0 ? SPREAD.fireDebuff : 0);
  if(target > t.sigma){
    t.sigma += Math.min(target - t.sigma, SPREAD.bloomRate * dt);
  } else {
    t.sigma -= Math.min(t.sigma - Math.max(target, debuffBase), SPREAD.shrinkRate * dt);
    if(t.sigma < debuffBase) t.sigma = debuffBase;
  }
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeStats,
    applyArmorMod,
    addModifier,
    addTimedModifier,
    removeModifierBySource,
    refreshStats,
    makeTank,
    SPEED_KMH_FACTOR,
    SPEED_PX_FACTOR,
    tankKmh,
    TEAM_COLORS,
    teamColor,
    applyTankConfig,
    SPREAD,
    motionSigma,
    updateSigma
  };
}
