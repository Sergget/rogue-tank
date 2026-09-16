'use strict';

// tank_weapons.js — 武器与槽位解耦模块（R-1 阶段）
// 提供主武器（Primary Weapon）与副武器/挂载（Secondary Weapon）的数据契约、
// 属性计算与向后兼容适配。

const WEAPON_DEFAULTS = {
  primary: {
    standard:    { reloadMult: 1.0, damageMult: 1.0, penMult: 1.0, shellSpeedMult: 1.0, burst: 1 },
    // 2026-09-15 W6 用户裁定：速射机炮重做——伤害=标准 1/5、穿深=标准 85%（弹种系数机制不变）；
    // 射击间隔=装填时间×0.25（不再 burst 连发，逐发短间隔持续射击）；
    // 热量机制：每发 +heatPerShot%、每秒冷却 coolPerSec%、≥heatMax 过热并锁定 overheatLock 秒；
    // 外观：炮管更细(barrelWidthMult)略短(barrelLenMult)，无护套/制退器/抽烟器（battledraw 消费），
    // 炮口特效与炮弹尺寸随 fxScale 缩小。
    autocannon:  { reloadMult: 0.25, damageMult: 0.2, penMult: 0.85, shellSpeedMult: 1.0,
                   heatPerShot: 10, coolPerSec: 15, heatMax: 100, overheatLock: 2.0,
                   barrelWidthMult: 0.6, barrelLenMult: 0.8, fxScale: 0.55 },
    double_barrel: { reloadMult: 1.0, damageMult: 1.0, penMult: 1.0, shellSpeedMult: 1.0, count: 2, switchSeconds: 0.5, barrelOffset: 0.9 },
    railgun:     { reloadMult: 2.2, damageMult: 1.5, penMult: 2.0, shellSpeedMult: 2.5, burst: 1 }
  },
  secondary: {
    none:        { reload: 0, damage: 0 },
    turret:      { reloadMult: 1.6, damageMult: 0.6, penMult: 0.75, spreadMult: 1.3, range: 400, turretTurnRate: 2.5 },
    mortar:      { range: 450, aoe: 90, reload: 8, damage: 60, isArc: true, accuracySpread: 0.05 },
    missile:     { guided: true, mode: 'lock', reload: 12, damage: 140, range: 600, lockArcDeg: 30, lockSeconds: 1.0 },
    missile_wire:{ guided: true, mode: 'wire', reload: 10, damage: 150, range: 700 },
    rocket:      { count: 4, reload: 10, damage: 35, range: 500, direct: true, aoe: 40 },
    mine_layer:  { duration: 30, reload: 15, damage: 100 }
  }
};

function getWeaponDefaults(category, type) {
  const cat = WEAPON_DEFAULTS[category];
  if (!cat) return {};
  return cat[type] || cat[Object.keys(cat)[0]] || {};
}

// 兼容旧坦克 JSON 转换为 weapons 结构
function normalizeTankWeapons(spec) {
  if (!spec) return { primary: { type: 'standard', stats: {} }, secondary: { type: 'none', stats: {} } };
  if (spec.weapons) {
    return {
      primary: {
        type: (spec.weapons.primary && spec.weapons.primary.type) || 'standard',
        stats: Object.assign({}, getWeaponDefaults('primary', (spec.weapons.primary && spec.weapons.primary.type) || 'standard'), spec.weapons.primary ? spec.weapons.primary.stats : {})
      },
      secondary: {
        type: (spec.weapons.secondary && spec.weapons.secondary.type) || 'none',
        stats: Object.assign({}, getWeaponDefaults('secondary', (spec.weapons.secondary && spec.weapons.secondary.type) || 'none'), spec.weapons.secondary ? spec.weapons.secondary.stats : {})
      }
    };
  }
  // Fallback for legacy specs
  return {
    primary: { type: 'standard', stats: getWeaponDefaults('primary', 'standard') },
    secondary: { type: 'none', stats: getWeaponDefaults('secondary', 'none') }
  };
}

// 阶段六 6.2：副炮塔（secondary turret）自主开火循环（机制验证，Boss 侧先行）。
// 行为：自动索敌最近敌人（复用 nearestEnemyTo），独立炮塔角 secondaryTurretAngle 向目标转向，
// 独立装填计时 secondaryReloadT，射速/穿深/伤害/散布全部读主炮对应值 × WEAPON_DEFAULTS 削弱系数。
// 与主炮解耦：不占用 shooter.reloadT / turretAngle / ammoKey；弹体直接入 shells 管线（复用
// stepShells/resolveHit 判定）。ctx 显式注入（shells/nearestEnemyTo/gunRoot/gunTip/gaussian/
// spawnMuzzleFlash/playSound/debuffReloadRate/computeAmmoConfig），浏览器缺省回退全局。
function updateSecondaryTurret(t, dt, ctx) {
  const c = ctx || {};
  const w = t && t.weapons && t.weapons.secondary;
  if (!w || w.type !== 'turret') return false;
  if (t.hp <= 0) return false;
  const shells = c.shells || (typeof globalThis !== 'undefined' && globalThis.shells);
  if (!shells) return false;
  const nearestEnemyTo = c.nearestEnemyTo || (typeof globalThis !== 'undefined' && globalThis.nearestEnemyTo) || (function(){ return null; });
  const debuffReload = c.debuffReloadRate || (typeof globalThis !== 'undefined' && globalThis.debuffReloadRate) || (function(){ return 1; });
  const gaussian = c.gaussian || (typeof globalThis !== 'undefined' && globalThis.gaussian) || (function(){ return 0; });
  const muzzle = c.spawnMuzzleFlash || (typeof globalThis !== 'undefined' && globalThis.spawnMuzzleFlash) || (function(){});
  const play = c.playSound || (typeof globalThis !== 'undefined' && globalThis.playSound) || (function(){});
  const computeAmmoConfig = c.computeAmmoConfig || (typeof globalThis !== 'undefined' && globalThis.computeAmmoConfig) || null;
  const R = c.RULES || c.rules || (typeof globalThis !== 'undefined' && globalThis.RULES) || {};
  const T = c.coverTiers || (typeof globalThis !== 'undefined' && globalThis.COVER_TIERS) || (R.coverTiers || {});
  const find = c.findCoversOnPath || (typeof globalThis !== 'undefined' && globalThis.findCoversOnPath) || null;
  const gunRoot = c.gunRoot || (typeof globalThis !== 'undefined' && globalThis.gunRoot) || null;
  const gunTip = c.gunTip || (typeof globalThis !== 'undefined' && globalThis.gunTip) || null;
  if (!nearestEnemyTo || !gunRoot || !gunTip || !find) return false;

  // 独立装填计时（秒级递减；与主炮 reloadT 互不干扰）
  if (!(t.secondaryReloadT > 0)) t.secondaryReloadT = 0;
  if (t.secondaryReloadT > 0) t.secondaryReloadT -= dt;
  if (t.secondaryReloadT > 0) return false;

  const target = nearestEnemyTo(t);
  if (!target || target.hp <= 0) return false;

  // 射程门控（turret 削弱系数表 range）
  const cfg = w.stats || {};
  const maxRange = (typeof cfg.range === 'number') ? cfg.range : 400;
  const d2 = (target.x - t.x) * (target.x - t.x) + (target.y - t.y) * (target.y - t.y);
  if (d2 > maxRange * maxRange) return false;

  // 炮塔向目标转向（独立副塔角；转速来自削弱系数 turretTurnRate）
  const desired = Math.atan2(target.y - t.y, target.x - t.x);
  if (typeof t.secondaryTurretAngle !== 'number') t.secondaryTurretAngle = t.turretAngle || 0;
  const turnRate = (typeof cfg.turretTurnRate === 'number') ? cfg.turretTurnRate : 2.5;
  let diff = desired - t.secondaryTurretAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const maxStep = turnRate * dt;
  t.secondaryTurretAngle = t.secondaryTurretAngle + Math.max(-maxStep, Math.min(maxStep, diff));

  // 炮管掩体贯穿判定（复用主炮同款：barrelCovers solid → 截停计装填）
  const rootP = gunRoot(t), tipP = gunTip(t);
  let solid = null;
  if (find && rootP && tipP) {
    const barrelCovers = find(rootP.x, rootP.y, tipP.x, tipP.y);
    if (barrelCovers && barrelCovers.length) {
      solid = barrelCovers.find(function(v){ const m = T[v.cover.tier] && T[v.cover.tier].mode; return m === 'solid' || m === 'single'; }) || null;
    }
  }
  if (solid) {
    t.secondaryReloadT = ((t.stats ? t.stats.reload : 1) * (cfg.reloadMult != null ? cfg.reloadMult : 1.6)) / debuffReload(t);
    return false;
  }

  // 开火：主炮数值 × 削弱系数（reload ×1.6 / dmg ×0.6 / pen ×0.75 / spread ×1.3）
  const reloadMult = (typeof cfg.reloadMult === 'number') ? cfg.reloadMult : 1.6;
  const dmgMult = (typeof cfg.damageMult === 'number') ? cfg.damageMult : 0.6;
  const penMult = (typeof cfg.penMult === 'number') ? cfg.penMult : 0.75;
  const spreadMult = (typeof cfg.spreadMult === 'number') ? cfg.spreadMult : 1.3;
  const baseStats = t.stats || { reload: 1, damage: 1, penetration: 1, shellSpeed: 1, spread: 1 };
  const ammo = computeAmmoConfig ? computeAmmoConfig(t, t.ammoKey) : (R.ammoTypes && (R.ammoTypes[t.ammoKey] || R.ammoTypes.ap)) || {};
  const ox = tipP.x, oy = tipP.y;
  const spreadAngle = t.secondaryTurretAngle + gaussian((baseStats.sigma || 0) * spreadMult);
  const dx = Math.cos(spreadAngle), dy = Math.sin(spreadAngle);
  muzzle(ox, oy, spreadAngle, 0.8, (t.barrel && t.barrel.muzzle) || 'none');
  play('fire');
  shells.push({
    x: ox, y: oy, fx: rootP.x, fy: rootP.y, dx: dx, dy: dy,
    speed: Math.max(200, (baseStats.shellSpeed || 1) * (ammo.speed || 1)),
    pen: (baseStats.penetration || 1) * (ammo.pen || 1) * penMult + (ammo.penAdd || 0),
    dmg: Math.max(0, (baseStats.damage || 1) * (ammo.dmg || 1) * dmgMult + (ammo.dmgAdd || 0)),
    ammo: ammo, ammoKey: t.ammoKey, shooter: t, hitPref: 'auto',
    canBounce: true, bounced: false, dist: 0, dead: false
  });
  t.secondaryReloadT = (baseStats.reload * reloadMult) / debuffReload(t);
  return true;
}

function updateSecondaryMount(t, dt, ctx) {
  const w = t && t.weapons && t.weapons.secondary;
  if (!w || !w.type || w.type === 'none' || w.type === 'turret') return false;
  if (t.hp <= 0) return false;
  // 2026-09-15 W2：锁定式反坦克导弹走锁定流程（±30° 扇形选目标 → 1s 锁定 → 自动发射）
  if (w.type === 'missile') return updateMissileLock(t, dt, ctx);
  if (!(t.secondaryReloadT > 0)) t.secondaryReloadT = 0;
  if (t.secondaryReloadT > 0) {
    t.secondaryReloadT -= dt;
    return false;
  }
  const nearestEnemyTo = (ctx && ctx.nearestEnemyTo) || (typeof globalThis !== 'undefined' && globalThis.nearestEnemyTo) || function(){ return null; };
  const target = nearestEnemyTo(t);
  if (!target || target.hp <= 0) return false;
  const cfg = Object.assign({}, getWeaponDefaults('secondary', w.type), w.stats || {});
  const maxRange = (typeof cfg.range === 'number') ? cfg.range : 500;
  const dist = Math.hypot(target.x - t.x, target.y - t.y);
  if (dist > maxRange) return false;
  return fireActiveSecondary(t, ctx, target);
}

// 2026-09-15 W2：锁定式反坦克导弹锁定机制（用户裁定）。
// 行为：装填就绪后，在炮管朝向（turretAngle）±lockArcDeg 扇形、射程内选择最近目标开始锁定；
// 锁定耗时 lockSeconds（期间目标死亡/出扇形/出射程则立即重新选择）；锁定完成自动发射制导弹
// （guided:true + mode:'lock'，stepShells 既有引导）。切回主武器（activeWeaponSlot!=='secondary'，
// 仅玩家有此概念）时由调用方停止驱动，锁定自然冻结，targetRef 清理由重新激活时进行。
// AI 实体无 activeWeaponSlot 概念——副武器始终视为激活。
function updateMissileLock(t, dt, ctx) {
  const c = ctx || {};
  const w = t && t.weapons && t.weapons.secondary;
  if (!w || w.type !== 'missile') return false;
  if (t.hp <= 0) return false;
  const cfg = Object.assign({}, getWeaponDefaults('secondary', 'missile'), w.stats || {});
  const maxRange = (typeof cfg.range === 'number') ? cfg.range : 600;
  const lockArcDeg = (typeof cfg.lockArcDeg === 'number') ? cfg.lockArcDeg : 30;
  const lockSeconds = (typeof cfg.lockSeconds === 'number') ? cfg.lockSeconds : 1.0;
  const lockArcCos = Math.cos(lockArcDeg * Math.PI / 180);

  // 装填计时（锁定只在就绪后进行；装填中锁定进度保持冻结）
  if (!(t.secondaryReloadT > 0)) t.secondaryReloadT = 0;
  if (t.secondaryReloadT > 0) {
    t.secondaryReloadT -= dt;
    return false;
  }

  const ents = c.entities || (typeof globalThis !== 'undefined' && globalThis.entities) || [];
  const isHostile = c.isHostile || (typeof globalThis !== 'undefined' && globalThis.isHostile) || function(){ return true; };

  // 扇形内最近目标（±lockArcDeg @ turretAngle，射程内，存活敌对）
  const aimA = t.turretAngle || 0;
  const ax = Math.cos(aimA), ay = Math.sin(aimA);
  let best = null, bestD2 = Infinity;
  for (const e of ents) {
    if (!e || e.hp <= 0 || e.isDrone) continue;
    if (!isHostile(t.team, e.team)) continue;
    const ex = e.x - t.x, ey = e.y - t.y;
    const d2 = ex * ex + ey * ey;
    if (d2 > maxRange * maxRange) continue;
    const d = Math.sqrt(d2) || 1;
    if ((ex * ax + ey * ay) / d < lockArcCos) continue;   // 出扇形
    if (d2 < bestD2) { bestD2 = d2; best = e; }
  }

  // 现有锁定失效（目标死亡/出扇形/出射程/被更近目标替代）→ 重新选择
  if (t._missileLock) {
    const L = t._missileLock;
    const dead = !L.target || L.target.hp <= 0;
    let outOfCone = false;
    if (!dead) {
      const ex = L.target.x - t.x, ey = L.target.y - t.y;
      const d = Math.hypot(ex, ey) || 1;
      if (d > maxRange || (ex * ax + ey * ay) / d < lockArcCos) outOfCone = true;
    }
    if (dead || outOfCone || (best && best !== L.target)) {
      t._missileLock = best ? { target: best, t: 0 } : null;
    }
  } else if (best) {
    t._missileLock = { target: best, t: 0 };
  }
  if (!t._missileLock) return false;

  // 锁定计时推进
  t._missileLock.t += dt;
  if (t._missileLock.t < lockSeconds) return false;

  // 锁定完成 → 自动发射制导弹
  const target = t._missileLock.target;
  const fired = fireActiveSecondary(t, ctx, target);
  t._missileLock = null;
  return !!fired;
}

function getEffectiveHeatAmmoKey(tank) {
  if (!tank) return 'he';
  const HEAT_HIERARCHY = ['heavy_tandem_heat', 'tandem_heat', 'heatfs', 'heat'];
  const loadout = (tank.ammoLoadout && Array.isArray(tank.ammoLoadout)) ? tank.ammoLoadout : [tank.ammoKey || 'he'];
  for (const k of HEAT_HIERARCHY) {
    if (loadout.includes(k)) return k;
  }
  if (tank.unlockedAmmo && Array.isArray(tank.unlockedAmmo)) {
    for (const k of HEAT_HIERARCHY) {
      if (tank.unlockedAmmo.includes(k)) return k;
    }
  }
  return 'he';
}

// #A21（2026-09-15）：手动主动击发副武器（左键/空格按激活槽位分发；右键击发已于 W2 移除）
function fireActiveSecondary(t, ctx, targetPos) {
  const c = ctx || {};
  const w = t && t.weapons && t.weapons.secondary;
  if (!w || !w.type || w.type === 'none') return false;
  if (t.hp <= 0) return false;
  if (t.secondaryReloadT > 0) return false;

  const cfg = Object.assign({}, getWeaponDefaults('secondary', w.type), w.stats || {});
  const shells = c.shells || (typeof globalThis !== 'undefined' && globalThis.shells);
  const nearestEnemyTo = c.nearestEnemyTo || (typeof globalThis !== 'undefined' && globalThis.nearestEnemyTo) || (function(){ return null; });
  const debuffReload = c.debuffReloadRate || (typeof globalThis !== 'undefined' && globalThis.debuffReloadRate) || (function(){ return 1; });
  const gaussian = c.gaussian || (typeof globalThis !== 'undefined' && globalThis.gaussian) || (function(){ return 0; });
  const muzzle = c.spawnMuzzleFlash || (typeof globalThis !== 'undefined' && globalThis.spawnMuzzleFlash) || (function(){});
  const play = c.playSound || (typeof globalThis !== 'undefined' && globalThis.playSound) || (function(){});
  const gunRoot = c.gunRoot || (typeof globalThis !== 'undefined' && globalThis.gunRoot) || (function(u){ return {x: u.x, y: u.y}; });
  const gunTip = c.gunTip || (typeof globalThis !== 'undefined' && globalThis.gunTip) || (function(u){ return {x: u.x + Math.cos(u.turretAngle||0)*30, y: u.y + Math.sin(u.turretAngle||0)*30}; });
  const computeAmmoConfig = c.computeAmmoConfig || (typeof globalThis !== 'undefined' && globalThis.computeAmmoConfig) || null;
  const R = c.RULES || c.rules || (typeof globalThis !== 'undefined' && globalThis.RULES) || {};

  const rootP = gunRoot(t), tipP = gunTip(t);
  const target = targetPos || nearestEnemyTo(t) || { x: t.x + Math.cos(t.turretAngle || 0) * 300, y: t.y + Math.sin(t.turretAngle || 0) * 300 };

  switch (w.type) {
    case 'mortar': {
      if (!shells) return false;
      const maxRange = (typeof cfg.range === 'number') ? cfg.range : 450;
      const tDist = Math.hypot(target.x - tipP.x, target.y - tipP.y);
      const useDist = Math.min(tDist, maxRange);
      const angle = Math.atan2(target.y - tipP.y, target.x - tipP.x);
      const accSpread = (typeof cfg.accuracySpread === 'number') ? cfg.accuracySpread : 0.05;
      const spreadAngle = angle + gaussian(accSpread);
      const dx = Math.cos(spreadAngle), dy = Math.sin(spreadAngle);
      const targetX = tipP.x + dx * useDist;
      const targetY = tipP.y + dy * useDist;
      muzzle(tipP.x, tipP.y, spreadAngle, 0.9, 'he');
      play('fire');
      const aoe = (typeof cfg.aoe === 'number') ? cfg.aoe : 90;
      // 迫击炮弹种固定为 HESH 计算机制（碎甲/内部爆轰/大溅射）
      const heshCfg = computeAmmoConfig ? computeAmmoConfig(t, 'hesh') : ((R.ammoTypes && R.ammoTypes.hesh) || { dmg: 1.5, pen: 0.7, nonPenRatio: 0.8 });
      const baseDmg = (typeof cfg.damage === 'number') ? cfg.damage : 60;
      const basePen = (typeof cfg.pen === 'number') ? cfg.pen : 60;
      const dmg = Math.round(baseDmg * (heshCfg.dmg || 1) + (heshCfg.dmgAdd || 0));
      const pen = Math.round(basePen * (heshCfg.pen || 1) + (heshCfg.penAdd || 0));
      const mortarAmmo = Object.assign({}, heshCfg, {
        color: '#ffb454',
        tail: 'rgba(255,180,84,0.7)',
        splashRadius: aoe,
        ignoreCover: true
      });
      shells.push({
        x: tipP.x, y: tipP.y, fx: tipP.x, fy: tipP.y, dx: dx, dy: dy,
        targetX: targetX, targetY: targetY, totalDist: useDist,
        speed: 350, pen: pen, dmg: dmg,
        isArc: true, ignoreCover: true, splashRadius: aoe,
        ammo: mortarAmmo,
        ammoKey: 'hesh', shooter: t, hitPref: 'auto',
        canBounce: false, bounced: false, dist: 0, dead: false
      });
      const reload = (typeof cfg.reload === 'number') ? cfg.reload : 8;
      t.secondaryReloadT = reload / debuffReload(t);
      return true;
    }
    case 'missile': {
      if (!shells) return false;
      // #A21：手动击发（targetPos 为鼠标世界点，纯点无 hp）→ 制导弹沿指向该点方向直飞
      // （guided:true 但 target=null，stepShells 无存活 target 时保持初始方向，即沿鼠标方向），
      // 不再回退 nearestEnemyTo 自动寻的；自动路径（updateSecondaryMount/updateMissileLock 传入
      // 存活实敌，hp>0）保持锁定追尾不变。
      const targetEnemy = (target && target.hp > 0) ? target : null;
      const angle = Math.atan2((targetEnemy ? targetEnemy.y : target.y) - tipP.y, (targetEnemy ? targetEnemy.x : target.x) - tipP.x);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      muzzle(tipP.x, tipP.y, angle, 0.7, 'none');
      play('fire');
      // 伤害机制跟随玩家 HEAT 弹种升级状态（未升级时按主武器 HE 弹，升级到 T-HEAT 等按对应机制）
      const heatKey = getEffectiveHeatAmmoKey(t);
      const heatAmmoCfg = computeAmmoConfig ? computeAmmoConfig(t, heatKey) : ((R.ammoTypes && R.ammoTypes[heatKey]) || (R.ammoTypes && R.ammoTypes.he) || { dmg: 1, pen: 1 });
      const baseDmg = (typeof cfg.damage === 'number') ? cfg.damage : 140;
      const basePen = (typeof cfg.pen === 'number') ? cfg.pen : 250;
      const dmg = Math.round(baseDmg * (heatAmmoCfg.dmg || 1) + (heatAmmoCfg.dmgAdd || 0));
      const pen = Math.round(basePen * (heatAmmoCfg.pen || 1) + (heatAmmoCfg.penAdd || 0));
      const spd = (typeof cfg.speed === 'number') ? cfg.speed : 320;
      const missileAmmo = Object.assign({}, heatAmmoCfg, {
        color: '#ff3311',
        tail: 'rgba(255,100,0,0.8)'
      });
      shells.push({
        x: tipP.x, y: tipP.y, fx: tipP.x, fy: tipP.y, dx: dx, dy: dy,
        speed: spd, pen: pen, dmg: dmg,
        guided: true, mode: 'lock', target: targetEnemy,
        ammo: missileAmmo,
        ammoKey: heatKey, shooter: t, hitPref: 'auto',
        canBounce: false, bounced: false, dist: 0, dead: false
      });
      const reload = (typeof cfg.reload === 'number') ? cfg.reload : 12;
      t.secondaryReloadT = reload / debuffReload(t);
      return true;
    }
    case 'missile_wire': {
      if (!shells) return false;
      t._secondaryTargetPos = target;
      const angle = Math.atan2(target.y - tipP.y, target.x - tipP.x);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      muzzle(tipP.x, tipP.y, angle, 0.7, 'none');
      play('fire');
      // 伤害机制跟随玩家 HEAT 弹种升级状态
      const heatKey = getEffectiveHeatAmmoKey(t);
      const heatAmmoCfg = computeAmmoConfig ? computeAmmoConfig(t, heatKey) : ((R.ammoTypes && R.ammoTypes[heatKey]) || (R.ammoTypes && R.ammoTypes.he) || { dmg: 1, pen: 1 });
      const baseDmg = (typeof cfg.damage === 'number') ? cfg.damage : 150;
      const basePen = (typeof cfg.pen === 'number') ? cfg.pen : 260;
      const dmg = Math.round(baseDmg * (heatAmmoCfg.dmg || 1) + (heatAmmoCfg.dmgAdd || 0));
      const pen = Math.round(basePen * (heatAmmoCfg.pen || 1) + (heatAmmoCfg.penAdd || 0));
      const spd = (typeof cfg.speed === 'number') ? cfg.speed : 340;
      const missileAmmo = Object.assign({}, heatAmmoCfg, {
        color: '#ff5522',
        tail: 'rgba(255,120,50,0.8)'
      });
      shells.push({
        x: tipP.x, y: tipP.y, fx: tipP.x, fy: tipP.y, dx: dx, dy: dy,
        speed: spd, pen: pen, dmg: dmg,
        guided: true, mode: 'wire',
        ammo: missileAmmo,
        ammoKey: heatKey, shooter: t, hitPref: 'auto',
        canBounce: false, bounced: false, dist: 0, dead: false
      });
      const reload = (typeof cfg.reload === 'number') ? cfg.reload : 10;
      t.secondaryReloadT = reload / debuffReload(t);
      return true;
    }
    case 'rocket': {
      if (!shells) return false;
      const baseAngle = Math.atan2(target.y - tipP.y, target.x - tipP.x);
      const count = (typeof cfg.count === 'number') ? cfg.count : 4;
      // 火箭弹伤害机制跟随玩家 HEAT 弹种升级状态
      const heatKey = getEffectiveHeatAmmoKey(t);
      const heatAmmoCfg = computeAmmoConfig ? computeAmmoConfig(t, heatKey) : ((R.ammoTypes && R.ammoTypes[heatKey]) || (R.ammoTypes && R.ammoTypes.he) || { dmg: 1, pen: 1 });
      const baseDmg = (typeof cfg.damage === 'number') ? cfg.damage : 35;
      const basePen = (typeof cfg.pen === 'number') ? cfg.pen : 90;
      const dmg = Math.round(baseDmg * (heatAmmoCfg.dmg || 1) + (heatAmmoCfg.dmgAdd || 0));
      const pen = Math.round(basePen * (heatAmmoCfg.pen || 1) + (heatAmmoCfg.penAdd || 0));
      const aoe = (typeof cfg.aoe === 'number') ? cfg.aoe : 40;
      const rocketSplash = (heatAmmoCfg.splashRadius > 0) ? heatAmmoCfg.splashRadius : aoe;
      const spd = (typeof cfg.speed === 'number') ? cfg.speed : 450;
      const rocketAmmo = Object.assign({}, heatAmmoCfg, {
        color: '#ffaa33',
        tail: 'rgba(255,160,50,0.7)',
        splashRadius: rocketSplash
      });
      for (let i = 0; i < count; i++) {
        const offset = (count <= 1) ? 0 : (i - (count - 1) / 2) * 0.08;
        const angle = baseAngle + offset + gaussian(0.02);
        const dx = Math.cos(angle), dy = Math.sin(angle);
        shells.push({
          x: tipP.x, y: tipP.y, fx: tipP.x, fy: tipP.y, dx: dx, dy: dy,
          speed: spd, pen: pen, dmg: dmg, direct: true,
          splashRadius: rocketSplash,
          ammo: rocketAmmo,
          ammoKey: heatKey, shooter: t, hitPref: 'auto',
          canBounce: false, bounced: false, dist: 0, dead: false
        });
      }
      muzzle(tipP.x, tipP.y, baseAngle, 1.0, 'he');
      play('fire');
      const reload = (typeof cfg.reload === 'number') ? cfg.reload : 10;
      t.secondaryReloadT = reload / debuffReload(t);
      return true;
    }
    case 'mine_layer': {
      let spawnMineFn = c.spawnMine;
      if (!spawnMineFn) {
        if (typeof spawnMine === 'function') spawnMineFn = spawnMine;
        else if (typeof require !== 'undefined') {
          try { spawnMineFn = require('./tank_deployables.js').spawnMine; } catch (e) {}
        }
      }
      if (!spawnMineFn) return false;
      const angle = (t.hullAngle || 0) + Math.PI;
      const mx = t.x + Math.cos(angle) * 45;
      const my = t.y + Math.sin(angle) * 45;
      const dmg = (typeof cfg.damage === 'number') ? cfg.damage : 100;
      const dur = (typeof cfg.duration === 'number') ? cfg.duration : 30;
      spawnMineFn({
        team: t.team,
        x: mx,
        y: my,
        damage: dmg,
        blastRadius: 70,
        triggerRadius: 30,
        duration: dur,
        registry: c.deployables || (typeof globalThis !== 'undefined' && globalThis.deployables) || null
      });
      play('ui');
      const reload = (typeof cfg.reload === 'number') ? cfg.reload : 15;
      t.secondaryReloadT = reload / debuffReload(t);
      return true;
    }
    case 'turret': {
      return updateSecondaryTurret(t, 0.016, ctx);
    }
  }
  return false;
}

// 统一副武器自主开火分发
function updateSecondaryWeapon(t, dt, ctx) {
  if (!t || !t.weapons || !t.weapons.secondary) return false;
  const w = t.weapons.secondary;
  if (!w || w.type === 'none') return false;
  if (w.type === 'turret') return updateSecondaryTurret(t, dt, ctx);
  return updateSecondaryMount(t, dt, ctx);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WEAPON_DEFAULTS,
    getWeaponDefaults,
    normalizeTankWeapons,
    updateSecondaryTurret,
    updateSecondaryMount,
    updateSecondaryWeapon,
    updateMissileLock,
    fireActiveSecondary
  };
}
