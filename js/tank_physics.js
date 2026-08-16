'use strict';

// 特性2/3：命中式弹道结算。
// 炮弹不再是"开火瞬间预结算"，而是真实飞行实体（tank_mvp.html 内逐帧做 swept-segment 检测），
// 到"命中时刻"才调用 resolveHit：入射角 / 等效厚度 / 跳弹 / 穿透 / 模块效果全部按命中瞬间的
// 目标姿态与位置判定。伤害与 debuff 在命中那一刻立即施加（不再有延迟 log 闭包）。
//
//   resolveHit(shell, target, hit, allowBounce) — 命中时刻结算，返回 {outcome,text,cls, ...}
//     outcome: 'BOUNCE'（调整 shell 方向与位置，继续飞行）| 'BLOCK' | 'PEN'
//   impactGeometry(shell, hit, target)          — 入射角/等效厚度（预测面板与命中结算共用）

// reflectDir is provided globally by tank_utils.js

function impactGeometry(shell, hit, target){
  const cosT = Math.abs(shell.dx*hit.nx + shell.dy*hit.ny);
  const theta = Math.acos(Math.min(1,Math.max(-1,cosT)));
  const armorTable = target.stats.armor || target.customArmor || ARMOR;
  const thickness = (armorTable[hit.part] && armorTable[hit.part][hit.faceKey] !== undefined)
    ? armorTable[hit.part][hit.faceKey]
    : ARMOR[hit.part][hit.faceKey];
  return { theta, thickness, eff: thickness/Math.cos(theta) };
}

// 命中时刻结算：跳弹 → 反射继续飞；未击穿 → 炮弹销毁；击穿 → 立即施加伤害/模块效果。
function resolveHit(shell, target, hit, allowBounce){
  const head = `${hit.part==='turret'?superstructureLabel(target):'车体'} ${faceLabel(hit.faceKey)}`;
  const { theta, thickness, eff } = impactGeometry(shell, hit, target);
  const deg = (theta*180/Math.PI).toFixed(0);
  const hitPoint = { x:hit.x, y:hit.y };

  if(allowBounce && theta > BOUNCE_ANGLE){
    const r = reflectDir(shell.dx, shell.dy, hit.nx, hit.ny);
    shell.x = hit.x; shell.y = hit.y;
    shell.dx = r.x; shell.dy = r.y;
    shell.bounced = true;
    shell.canBounce = false;      // 二次跳弹不允许（第一次后的任何命中按正常穿/不穿判定）
    return {
      outcome:'BOUNCE', cls:'BOUNCE',
      text:`跳弹！${head} 入射角 ${deg}° 超过跳弹角 — 炮弹沿反射方向飞离`,
      part:hit.part, faceKey:hit.faceKey,
      hitPoint, bouncePoint:hitPoint,
      bounceAngle: Math.atan2(r.y, r.x)
    };
  }

  if(theta > BOUNCE_ANGLE){
    return {
      outcome:'BLOCK', cls:'BLOCK',
      text:`未击穿 — ${head}，入射角 ${deg}° 过陡`,
      part:hit.part, faceKey:hit.faceKey, hitPoint
    };
  }

  if(eff > shell.pen){
    return {
      outcome:'BLOCK', cls:'BLOCK',
      text:`未击穿 — ${head} 等效厚度 ${eff.toFixed(0)} > 穿深 ${shell.pen.toFixed(0)}`,
      part:hit.part, faceKey:hit.faceKey, hitPoint
    };
  }

  // 击穿：命中即结算（模块伤害倍率 → 掉血 → 击杀/殉爆判定 → debuff）
  const modRes = applyModuleDamage(shell, target, hit);
  return Object.assign({ outcome:'PEN', part:hit.part, faceKey:hit.faceKey, hitPoint }, modRes);
}

// 模块倍率伤害 + 击杀判定 + 8s debuff 施加（特性3）
//   ammo    弹药架：×ammoMult；未杀 → 装填速度降低；杀 → 殉爆飞头
//   engine  发动机：×crewMult + 起火；未杀 → 最大速度降低
//   gunner  炮手：×crewMult；未杀 → 移动扩圈增大
//   loader  装填手：×crewMult；未杀 → 装填速度降低
//   driver  驾驶员：×crewMult；未杀 → 转向速度降低
//   commander 车长：×crewMult；未杀 → 全体成员效果 ×commanderDebuff
//   track   履带：正常伤害 + 锁定
function applyModuleDamage(shell, target, hit){
  const mod = moduleFromHit(target, hit);
  const DB = RULES.modules;
  const invuln = !!(target.invuln) || (target.invulnT > 0);
  let cls = 'PEN', extra = '';
  let dmg = 0;

  if(invuln){
    extra = '（靶车无敌，不掉血）';
  } else if(target.hp <= 0){
    extra = '（目标已摧毁）';
  } else {
    dmg = shell.dmg * (0.85 + Math.random()*0.3);
    if(mod.key === 'ammo'){
      dmg *= moduleMult(shell.shooter, 'ammo');
    } else if(mod.key === 'engine' || mod.key === 'gunner' || mod.key === 'loader' ||
              mod.key === 'driver' || mod.key === 'commander'){
      dmg *= moduleMult(shell.shooter, 'crew');
    }
    // 所有倍率乘完后再取整：日志/显示与实际扣血用同一整数 dmg，
    // 消除"显示 100、实际 99.5、残 0.5HP 不死"的浮点不一致
    dmg = Math.round(dmg);
    target.hp = Math.max(0, target.hp - dmg);
    const alive = target.hp > 0;

    switch(mod.key){
      case 'ammo':
        if(alive){
          setDebuff(target, 'ammo', DB.debuffSeconds);
          extra = `（弹药架受伤：装填速度降低 ${DB.debuffSeconds}s）`; cls='CRIT';
        } else {
          target.ammoBlew = true;
          target.fireT = RULES.fire.fireVisualSeconds;
          target.blowHitPoint = { x:hit.x, y:hit.y };
          extra = '（弹药架殉爆！炮塔被掀飞）'; cls='CRIT';
        }
        break;
      case 'track':
        target.trackBroken = true;
        target.trackFxPoint = { x:hit.x, y:hit.y };
        const lock = (target.stats && target.stats.trackLock !== undefined) ? target.stats.trackLock : DB.trackLockDefault;
        target.immobT = Math.max(target.immobT||0, lock);
        extra = `（履带被击断，锁定 ${lock.toFixed(0)}s）`;
        break;
      case 'engine':
        // 起火 DOT = 攻击方标准伤害 × dotRatio（升级可放大倍率），持续 dotSeconds（升级可延长）
        {
          const s = (shell.shooter && shell.shooter.stats) || {};
          const stdDmg = (s.damage !== undefined && s.damage > 0) ? s.damage : shell.dmg;
          const ratioMult = s.dotRatioMult !== undefined ? s.dotRatioMult : 1;
          const durMult = s.dotDurationMult !== undefined ? s.dotDurationMult : 1;
          target.dotDps = stdDmg * RULES.fire.dotRatio * ratioMult;
          target.dotSeconds = RULES.fire.dotSeconds * durMult;
          target.dotT = target.dotSeconds;
          target.fireT = RULES.fire.fireVisualSeconds;
          if(alive) setDebuff(target, 'engine', DB.debuffSeconds);
          extra = alive
            ? `（发动机起火：每秒 ${target.dotDps.toFixed(1)} 灼烧 ${target.dotSeconds.toFixed(1)}s，最大速度降低 ${DB.debuffSeconds}s）`
            : '（发动机被毁，车体起火）';
        }
        break;
      case 'gunner':
        if(alive){ setDebuff(target, 'gunner', DB.debuffSeconds); extra = `（炮手受伤：移动扩圈增大 ${DB.debuffSeconds}s）`; }
        else extra = '（炮手阵亡）';
        break;
      case 'loader':
        if(alive){ setDebuff(target, 'loader', DB.debuffSeconds); extra = `（装填手受伤：装填速度降低 ${DB.debuffSeconds}s）`; }
        else extra = '（装填手阵亡）';
        break;
      case 'driver':
        if(alive){ setDebuff(target, 'driver', DB.debuffSeconds); extra = `（驾驶员受伤：转向速度降低 ${DB.debuffSeconds}s）`; }
        else extra = '（驾驶员阵亡）';
        break;
      case 'commander':
        if(alive){ setDebuff(target, 'commander', DB.debuffSeconds); extra = `（车长受伤：全体成员性能-15% ${DB.debuffSeconds}s）`; }
        else extra = '（车长阵亡）';
        break;
    }
  }
  return { cls, text: `击穿！命中 ${mod.label}，造成 ${dmg} 伤害 ${extra}` };
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  const U = require('./tank_utils.js');
  module.exports = {
    reflectDir: U.reflectDir,
    impactGeometry,
    resolveHit,
    applyModuleDamage
  };
}