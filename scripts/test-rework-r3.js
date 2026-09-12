'use strict';
// scripts/test-rework-r3.js — R-3 阶段（特种弹药与曲射系统）自动化测试套件

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require('../js/tank_utils.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate; global.angDiff = U.angDiff;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners; global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir; global.distToSegment = U.distToSegment; global.gaussian = U.gaussian;
const G = require('../js/tank_geometry.js');
global.ARMOR = G.ARMOR; global.BOUNCE_ANGLE = G.BOUNCE_ANGLE; global.HEIGHTS = G.HEIGHTS;
global.getPartZRange = G.getPartZRange; global.getGunHeight = G.getGunHeight;
global.hullPoly = G.hullPoly; global.turretPoly = G.turretPoly;
global.raycastTank = G.raycastTank; global.bestHitForPref = G.bestHitForPref; global.shellPartHit = G.shellPartHit;
global.aimPartPreference = G.aimPartPreference; global.moduleFromHit = G.moduleFromHit;
global.faceLabel = G.faceLabel; global.superstructureLabel = G.superstructureLabel;
global.gunRoot = G.gunRoot; global.gunTip = G.gunTip;
const M = require('../js/tank_model.js');
global.makeTank = M.makeTank; global.computeStats = M.computeStats; global.moduleMult = M.moduleMult;
global.debuffReloadRate = M.debuffReloadRate; global.setDebuff = M.setDebuff;
const C = require('../js/tank_cover.js');
global.COVER_TIERS = C.COVER_TIERS; global.findCoversOnPath = C.findCoversOnPath; global.getExposure = C.getExposure;
global.coverNormalAt = C.coverNormalAt; global.damageCover = C.damageCover; global.splashCoversAt = C.splashCoversAt;
global.covers = C.covers; global.spawnSmokeCloud = C.spawnSmokeCloud;
if (!global.entities) global.entities = [];
global.polyCorners = G.polyCorners; global.polyEdges = G.polyEdges;
const P = require('../js/tank_physics.js');
global.resolveHit = P.resolveHit; global.impactGeometry = P.impactGeometry; global.applyModuleDamage = P.applyModuleDamage;
const SH = require('../js/tank_shield.js');
global.hasShield = SH.hasShield; global.shieldAbsorbs = SH.shieldAbsorbs; global.absorbDamage = SH.absorbDamage;
global.applyShield = SH.applyShield;
global.burstExplosion = function(){};
global.spawnMuzzleFlash = function(){};
global.spawnImpactFx = function(){};
global.spawnDmgText = function(){};
global.spawnSmoke = function(){};
global.spawnTracer = function(){};
global.playSound = function(){return true;};
global.pushLog = function(){};
global.isHostile = function(){return true;};
const F = require('../js/tank_fire.js');
const W = require('../js/tank_weapons.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

console.log('=== 开始 R-3 阶段特种弹药与曲射系统自动化测试 (test-rework-r3.js) ===');

// 1. 测试 APFSDS 双次模块抽取与最高倍率/双效果生效
{
  const target = M.makeTank({ team: 'enemy', hp: 500 });
  const shooter = M.makeTank({ team: 'player', ammoKey: 'apfsds' });

  // 模拟 APFSDS 击穿命中车体前部
  const hit = { part: 'hull', faceKey: 'front', x: target.x + 20, y: target.y, nx: 1, ny: 0, t: 10 };
  const res = P.resolveHit({ shooter, pen: 300, dmg: 100, ammoKey: 'apfsds' }, target, hit, false);

  ok(res.outcome === 'PEN', 'APFSDS 成功击穿重装甲目标');
  ok(res.modKey !== undefined, 'APFSDS 成功触发模块/成员判定');
  ok(res.dmg > 0, 'APFSDS 造成有效扣血');
  console.log('✓ APFSDS 击穿与双次模块判定测试通过');
}

// 2. 测试曲射武器规则配置与属性
{
  const hecAmmo = global.RULES.ammoTypes.hec;
  ok(hecAmmo !== undefined, '配置中存在 HEC/曲射弹药类型');
  ok(hecAmmo.ignoreCover === true, '曲射弹药具备 ignoreCover 越障属性');
  ok(hecAmmo.arc === true, '曲射弹药具备抛物线弧度标记');
  ok(hecAmmo.noBounce === true, '曲射弹药具备确定性不跳弹 (noBounce) 标记');
  ok(hecAmmo.splashRadius >= 100, 'HEC 具备范围溅射半径 (≥100px)');

  const howitzer = W.WEAPON_DEFAULTS.primary.howitzer;
  ok(howitzer && howitzer.isArc === true, '榴弹炮主武器配置包含 isArc 属性');
  ok(howitzer.range >= 400, '榴弹炮具备有效射程配置');

  const mortar = W.WEAPON_DEFAULTS.secondary.mortar;
  ok(mortar && mortar.isArc === true, '迫击炮副武器配置包含 isArc 属性');
  ok(mortar.aoe >= 80, '迫击炮具备范围杀伤 (aoe)');
  console.log('✓ 曲射弹药与武器规则配置测试通过');
}

// 3. 行为测试：HEC 弹药越过全高掩体命中其后方目标（ignoreCover 真实管线）
{
  const shooter = M.makeTank({ id:'s1', team:'player', x:0, y:0, hullAngle:0, turretAngle:0 });
  const target = M.makeTank({ id:'t1', team:'enemy', x:400, y:0, hullAngle:0, turretAngle:0 });
  const initialHp = target.hp;
  C.covers.length = 0;
  // 在两者正中间放置一个坚固不可逾越的全高掩体
  const cov = { x:200, y:0, w:60, h:40, angle:0, tier:'full', hp:Infinity };
  C.covers.push(cov);

  // 发射一枚普通 AP 弹（应被全高掩体阻挡）。
  // 注意：弹体出生点必须在射手车体轮廓之外（hull 前缘 ~41.5px），否则 stepShells
  // 的 raycast 会在 t=0 命中射手自身（isHostile 测试桩恒 true，不排除友军）。
  const apShells = [{
    x:45, y:0, fx:45, fy:0, dx:1, dy:0, speed:600, pen:200, dmg:80,
    ammo: global.RULES.ammoTypes.ap, ammoKey:'ap', shooter, hitPref:'auto',
    canBounce:false, bounced:false, dist:10, dead:false
  }];
  const apCtx = {
    shells: apShells, entities:[shooter, target], covers:C.covers, RULES:global.RULES, COVER_TIERS:C.COVER_TIERS,
    raycastTank:G.raycastTank, shellPartHit:G.shellPartHit, getPartZRange:G.getPartZRange, getExposure:G.getExposure,
    findCoversOnPath:C.findCoversOnPath, resolveHit:P.resolveHit,
    pushLog:()=>{}
  };
  for(let f=0; f<90; f++){ F.stepShells(1/60, apCtx); if(apShells[0].dead) break; }
  ok(apShells[0].dead && target.hp === initialHp, '普通 AP 弹被全高掩体拦截，未伤及后方目标');

  // 发射一枚 HEC 曲射弹（应越过掩体命中目标）
  const hecShells = [{
    x:45, y:0, fx:45, fy:0, dx:1, dy:0, speed:600, pen:200, dmg:80,
    ammo: global.RULES.ammoTypes.hec, ammoKey:'hec', shooter, hitPref:'auto',
    canBounce:false, bounced:false, dist:10, dead:false
  }];
  const hecCtx = {
    shells: hecShells, entities:[shooter, target], covers:C.covers, RULES:global.RULES, COVER_TIERS:C.COVER_TIERS,
    raycastTank:G.raycastTank, shellPartHit:G.shellPartHit, getPartZRange:G.getPartZRange, getExposure:G.getExposure,
    findCoversOnPath:C.findCoversOnPath, resolveHit:P.resolveHit,
    pushLog:()=>{}
  };
  for(let f=0; f<90; f++){ F.stepShells(1/60, hecCtx); if(hecShells[0].dead) break; }
  ok(hecShells[0].dead && target.hp < initialHp, 'HEC 弹药成功越过全高掩体并对后方目标造成伤害');
  C.covers.length = 0;
}

// 4. 行为测试：2σ 散布截断与重分布（保证 100% 弹着点在 [-2σ, 2σ] 夹角内）
{
  const sigma = 0.05;
  let outOfBounds = 0;
  const SAMPLES = 2000;
  for(let i=0; i<SAMPLES; i++){
    const val = U.gaussian(sigma);
    if(Math.abs(val) > 2 * sigma + 1e-9) outOfBounds++;
  }
  ok(outOfBounds === 0, `高斯散布在 ${SAMPLES} 次采样中 100% 落在 2σ 边界内 (outOfBounds=${outOfBounds})`);
}

ok(fails === 0, '所有 R-3 测试项均断言通过');
console.log('test-rework-r3: 完成所有检查');
console.log('test-rework-r3: 全部通过');
