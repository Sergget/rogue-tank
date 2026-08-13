'use strict';

// 线段挂载模块（tank_designer「模块 Modules」编辑）：normalizeTankModules 由 tank_geometry.js
// 提供。浏览器端它是全局函数（geometry 先于 model 加载）；Node 测试端在下方 export 块内
// require tank_geometry.js 兜底赋值，保证 applyTankConfig 两侧行为一致。
let _normalizeTankModules = (typeof normalizeTankModules === 'function') ? normalizeTankModules : null;

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
    armor: (typeof structuredClone === 'function') ? structuredClone(base.armor) : JSON.parse(JSON.stringify(base.armor)),
    // 履带被击毁锁定时间（秒）；玩家侧可随升级缩短
    trackLock: base.trackLock !== undefined ? base.trackLock : RULES.modules.trackLockDefault,
    // 模块伤害倍率（玩家侧可随卡牌/技能升级增强；敌方固定倍率见 RULES.modules.ammo/crew.enemy）
    ammoMult: base.ammoMult !== undefined ? base.ammoMult : RULES.modules.ammo.player,
    crewMult: base.crewMult !== undefined ? base.crewMult : RULES.modules.crew.player,
    // 发动机起火 DOT：倍率/时长可随升级增强（默认 1）
    dotRatioMult: base.dotRatioMult !== undefined ? base.dotRatioMult : 1,
    dotDurationMult: base.dotDurationMult !== undefined ? base.dotDurationMult : 1,
    // 三扩系数（移动/转车体/转炮塔 三源散布统一倍率，默认 1）与缩圈速度（sigma 收缩速率，默认取 RULES.spread.shrinkRate）
    spreadMult: base.spreadMult !== undefined ? base.spreadMult : 1,
    aimSpeed: base.aimSpeed !== undefined ? base.aimSpeed : RULES.spread.shrinkRate
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
    immobT:0, fireDebuffT:0, dotT:0, dotDps:0, dotSeconds:0,
    fireT:0,                         // 起火燃烧视觉时间（秒）
    trackBroken:false,               // 履带被击断（视觉用）
    ammoBlew:false, _blowFx:false,   // 弹药架殉爆状态 + 视觉已生成标记
    debuffs:{},                      // 模块 debuff（8s 计时）：gunner/loader/driver/engine/commander/ammo
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
      trackLock: RULES.modules.trackLockDefault,
      ammoMult: RULES.modules.ammo.player,
      crewMult: RULES.modules.crew.player,
      dotRatioMult: 1,
      dotDurationMult: 1
    },
    modifiers: [],
    modules: null,                  // 线段挂载模块（设计器导出；null/无字段 = 旧数据，走 zones 退化）
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

const SPEED_KMH_FACTOR = RULES.speed.kmhFactor;      // (maxSpeed in px/s / 2) = km/h
const SPEED_PX_FACTOR  = RULES.speed.pxFactor;
// convert horsepower-per-tonne into game px/s^2 acceleration; these two set the accel feel.
// For responsive roguelike action, responsiveness is high (accel x180 scale, quick brake x3.5).
const ACCEL_POWER_TO_PX_SCALE = RULES.speed.accelPowerToPxScale;
const BRAKE_FACTOR = RULES.speed.brakeFactor;
function tankKmh(t){ return Math.round((t.stats?.maxSpeed ?? t.maxSpeed) * SPEED_KMH_FACTOR); }

const TEAM_COLORS = { player: '#5c8cff', ally: '#7ed957', enemy: '#ff8a8a' };
function teamColor(t){ return TEAM_COLORS[t.team] || TEAM_COLORS.enemy; }

function applyTankConfig(tank, spec){
  if (!spec) return;
  if (spec.hasTurret !== undefined) tank.hasTurret = spec.hasTurret; // legacy entries only
  if (spec.traverseLimit !== undefined) tank.traverseLimit = spec.traverseLimit * Math.PI / 180;
  const b = tank.base;
  
  // Table-driven field copies to reduce boilerplate
  const baseFields = [
    'maxSpeed', 'turnRate', 'turretTurnRate', 'enginePower', 'weight',
    'penetration', 'damage', 'reload', 'shellSpeed',
    'trackLock', 'ammoMult', 'crewMult', 'spreadMult', 'aimSpeed'
  ];
  for (const f of baseFields) {
    if (spec[f] !== undefined) b[f] = spec[f];
  }
  if (spec.hp !== undefined) b.maxHp = spec.hp;
  if (spec.maxHp !== undefined) b.maxHp = spec.maxHp;

  const instanceFields = ['heightClass', 'trackWidth', 'trackOffset'];
  for (const f of instanceFields) {
    if (spec[f] !== undefined) tank[f] = spec[f];
  }

  if (spec.anchors !== undefined) Object.assign(tank.anchors, spec.anchors);
  if (spec.barrel){
    // normalize: shared normalizeBarrel from tank_halfgeom.js (loaded on all pages)
    tank.barrel = normalizeBarrel(spec.barrel);
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

  // Turret geometry has TWO independent settings (issue #1):
  //   - `turret.axis`  {dx,dy} — the turret's OWN rotation point inside the turret's authored local
  //     frame. The hull-side `turret.pivot` then anchors that axis onto the hull. This decouples
  //     "炮塔自身的旋转中心" from "绕车体的旋转中心".
  //   - To keep every downstream consumer (raycast/draw/barrel/fx) working on the invariant
  //     "turret local origin (0,0) IS the rotation axis", the verts are normalized here: axis is
  //     translated to the origin. Hand-authored data whose (0,0) drifted to the tail no longer
  //     silently spins the turret around the tail (炮塔旋转轴漂移/落在炮塔尾部的根因)。
  if (spec.turret && spec.turret.verts && spec.turret.faces) {
    const axis = (spec.turret && spec.turret.axis) || null;
    const ax = (axis && axis.dx) || 0;
    const ay = (axis && axis.dy) || 0;
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const [vx, vy] of spec.turret.verts) {
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vy < minY) minY = vy;
      if (vy > maxY) maxY = vy;
    }
    tank.turretSpec = { verts: spec.turret.verts.map(([vx,vy])=>[vx - ax, vy - ay]), faces: spec.turret.faces };
    tank.turLen = Math.max(1, maxX - minX);
    tank.turWid = Math.max(1, maxY - minY);
    tank.turretAxis = { dx: ax, dy: ay };   // recorded for rollout/inspection; already applied above
  }
  if (spec.turret && spec.turret.pivot) {
    tank.turretPivotOffset = spec.turret.pivot;
  }
  if (spec.turret && spec.turret.armor) {
    if (!b.armor) b.armor = {};
    if (!b.armor.turret) b.armor.turret = {};
    Object.assign(b.armor.turret, spec.turret.armor);
  }

  // 线段挂载模块：仅当 spec.modules 存在才写（旧数据无字段 → 保持 makeTank 的 null，
  // moduleFromHit 走 zones 退化路径）
  if (spec.modules){
    tank.modules = (typeof _normalizeTankModules === 'function') ? _normalizeTankModules(spec.modules) : null;
  }

  refreshStats(tank);
  tank.hp = tank.stats.maxHp;
  tank.maxHp = tank.stats.maxHp;
  if (tank.spawn) tank.spawn.hp = tank.stats.maxHp;
}

// SPREAD 全部数值来自 RULES.spread（特性5：集中配置）；保留旧面相（含 worstCase() 方法）
const SPREAD = {
  base: 0.018, moveMax: 0.014, hullRotMax: 0.012, turretRotMax: 0.018, fireDebuff: 0.02, bloomRate: 2.0, shrinkRate: 0.15,
  worstCase(){ return this.base + this.moveMax + this.hullRotMax + this.turretRotMax + this.fireDebuff; }
};
if (typeof RULES !== 'undefined' && RULES.spread) {
  Object.assign(SPREAD, RULES.spread);
}

function motionSigma(t, dt, keys){
  if(dt<=0) return SPREAD.base;
  const hullRate  = Math.abs(norm(t.hullAngle - t.prevHullAngle + Math.PI) - Math.PI) / dt;
  const turRate   = Math.abs(norm(t.turretAngle - t.prevTurretAngle + Math.PI) - Math.PI) / dt;
  let speed = 0;
  if(t.id==='player' && keys){
    speed = (keys['w']||keys['s']) ? t.stats.maxSpeed : 0;
  }
  // 炮手受伤（gunner debuff）→ 移动扩圈加倍；三扩系数统一缩放三个运动散布源（stats.spreadMult）
  const mK = (t.stats && t.stats.spreadMult !== undefined) ? t.stats.spreadMult : 1;
  let sMove = SPREAD.moveMax    * Math.min(1, speed / t.stats.maxSpeed) * debuffSpread(t) * mK;
  const sHull = SPREAD.hullRotMax * Math.min(1, hullRate / t.stats.turnRate) * mK;
  const sTur  = SPREAD.turretRotMax * Math.min(1, turRate / t.stats.turretTurnRate) * mK;
  let base = SPREAD.base + (t.fireDebuffT>0 ? SPREAD.fireDebuff : 0);
  return base + sMove + sHull + sTur;
}

function updateSigma(t, dt, keys){
  const target = motionSigma(t, dt, keys);
  const debuffBase = SPREAD.base + (t.fireDebuffT>0 ? SPREAD.fireDebuff : 0);
  // 缩圈速度支持坦克级覆盖（stats.aimSpeed），默认走 RULES.spread.shrinkRate
  const shrinkK = (t.stats && t.stats.aimSpeed > 0) ? t.stats.aimSpeed : SPREAD.shrinkRate;
  if(target > t.sigma){
    t.sigma += Math.min(target - t.sigma, SPREAD.bloomRate * dt);
  } else {
    t.sigma -= Math.min(t.sigma - Math.max(target, debuffBase), shrinkK * dt);
    if(t.sigma < debuffBase) t.sigma = debuffBase;
  }
}

// ---------- 模块 debuff（特性3）：8s 瞬时状态 + 属性消费 ----------
// 命中弹药架/乘员/发动机后在本体上打 buff。debuffs[key] 存剩余秒数，>0 即生效。
// 数值全部来自 RULES.modules（倍率 / 时长 / 分区）。玩家侧倍率可经 stats 升级（ammoMult/crewMult）。
const DB = RULES.modules;

// 模块中文标签（HUD/debug 显示用，集中定义避免各处复制）
const MODULE_LABELS = { gunner:'炮手', loader:'装填手', driver:'驾驶员', engine:'发动机', commander:'车长', ammo:'弹药架' };
function moduleLabel(key){ return MODULE_LABELS[key] || key; }

function setDebuff(t, key, seconds){
  t.debuffs = t.debuffs || {};
  // 刷新时长、不叠加（决策：第二次命中刷新到 N 秒，不累加伤害加深）
  t.debuffs[key] = seconds || DB.debuffSeconds;
}
// 每帧对所有 debuff 统一倒扣，归零清除
function tickDebuffs(t, dt){
  if(!t.debuffs) return;
  let alive = null;
  for(const k in t.debuffs){
    t.debuffs[k] -= dt;
    if(t.debuffs[k] <= 0){ delete t.debuffs[k]; }
    else if(alive) alive = true;
  }
}
// 取"成员/模块伤害"的实际倍率：玩家侧默认 ammo×2 / crew×1.2（stats 可升级），敌方固定 ammo×2 / crew×1.2
function moduleMult(shooter, modKey){
  const isPlayer = shooter && shooter.team === 'player';
  if(modKey === 'ammo'){
    return isPlayer ? (shooter.stats ? (shooter.stats.ammoMult || DB.ammo.player) : DB.ammo.player) : DB.ammo.enemy;
  }
  return isPlayer ? (shooter.stats ? (shooter.stats.crewMult || DB.crew.player) : DB.crew.player) : DB.crew.enemy;
}
// debuffSpread：炮手受伤 → 扩圈 ×spreadHurt；车长 → 全体 ×commanderDebuff
function debuffSpread(t){
  const d = t.debuffs || {};
  let mul = 1;
  if(d.gunner > 0) mul *= DB.rates.spreadHurt;
  if(d.commander > 0) mul *= DB.rates.commanderDebuff;
  return mul;
}
// debuffReloadRate：装填手/弹药架受伤 → 装填速度 ×0.6；车长 ×0.85
function debuffReloadRate(t){
  const d = t.debuffs || {};
  let mul = 1;
  if(d.loader > 0 || d.ammo > 0) mul *= DB.rates.reloadHurt;
  if(d.commander > 0) mul *= DB.rates.commanderDebuff;
  return mul;
}
// debuffTurnRate：驾驶员受伤 → 转向速度 ×0.6；车长 ×0.85
function debuffTurnRate(t){
  const d = t.debuffs || {};
  let mul = 1;
  if(d.driver > 0) mul *= DB.rates.turnHurt;
  if(d.commander > 0) mul *= DB.rates.commanderDebuff;
  return mul;
}
// debuffSpeed：发动机受伤 → 最大速度 ×0.6；车长 ×0.85
function debuffSpeedRate(t){
  const d = t.debuffs || {};
  let mul = 1;
  if(d.engine > 0) mul *= DB.rates.speedHurt;
  if(d.commander > 0) mul *= DB.rates.commanderDebuff;
  return mul;
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  // Node 测试端兜底：浏览器端 normalizeTankModules 是 tank_geometry.js 的全局函数，
  // Node 端模块作用域看不到全局，从 require 的 geometry 拿同一实现（保持单一来源）。
  try {
    const _geom = require('./tank_geometry.js');
    if (!_normalizeTankModules && _geom && typeof _geom.normalizeTankModules === 'function'){
      _normalizeTankModules = _geom.normalizeTankModules;
    }
  } catch(e){ /* geometry 未加载时保持 null（浏览器端不会走到这里） */ }
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
    MODULE_LABELS,
    moduleLabel,
    applyTankConfig,
    SPREAD,
    motionSigma,
    updateSigma,
    setDebuff,
    tickDebuffs,
    moduleMult,
    debuffSpread,
    debuffReloadRate,
    debuffTurnRate,
    debuffSpeedRate
  };
}
