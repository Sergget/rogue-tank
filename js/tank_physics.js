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

// 弹种取用：shell.ammoKey（fireTank 挂载，见 tank_mvp.html/tank_bench.html）→ 回退 shell.ammo.key。
// 返回 null 时按无弹种（AP 语义）处理。
function shellAmmoKey(shell){
  return shell.ammoKey || (shell.ammo && shell.ammo.key) || null;
}

// HE 范围爆轰（P-16）：命中点对周围实体施加随距离衰减伤害。
// 公式：dmg × (1 − dist/splashRadius) × 0.5 —— 贴脸 50%，边缘衰减到 0。
// 友军/敌军一视同仁（不做阵营区分）；简化直伤——不触发模块效果/debuff；
// 无敌（invuln/invulnT）与已摧毁（hp≤0）目标免疫；主目标（exclude）由主命中结算，不重复扣血。
// entities 为全局注册表（js/tank_entity.js 唯一实例；Node 测试经 global.entities 注入）。
function applySplashAt(x, y, radius, dmg, exclude, shell){
  if(!(radius > 0)) return;
  if(typeof entities === 'undefined' || !entities) return;
  for(const e of entities){
    if(!e || e === exclude) continue;
    if(e.hp === undefined || e.hp <= 0) continue;
    if(e.invuln || e.invulnT > 0) continue;
    const dist = Math.hypot(e.x - x, e.y - y);
    if(dist > radius) continue;
    const d = Math.round(dmg * (1 - dist / radius) * 0.5);
    if(d <= 0) continue;
    e.hp = Math.max(0, e.hp - d);
  }
}

// 命中时刻结算：跳弹 → 反射继续飞；未击穿 → 炮弹销毁；击穿 → 立即施加伤害/模块效果。
// P-16 弹种分支：HEAT/HE（noBounce）确定性不跳弹；HE（splashRadius）命中即爆轰——
//   未击穿按等效厚度/装甲吸收给残余爆轰伤害，并对命中点周围实体施加范围衰减伤害。
function resolveHit(shell, target, hit, allowBounce){
  const head = `${hit.part==='turret'?superstructureLabel(target):'车体'} ${faceLabel(hit.faceKey)}`;
  const { theta, thickness, eff } = impactGeometry(shell, hit, target);
  const deg = (theta*180/Math.PI).toFixed(0);
  const hitPoint = { x:hit.x, y:hit.y };

  const ammoKey = shellAmmoKey(shell);
  const ammoCfg = (ammoKey && RULES.ammoTypes[ammoKey]) || shell.ammo || null;
  const noBounce = !!(ammoCfg && ammoCfg.noBounce);                  // HEAT/HE：确定性不跳弹
  const splashRadius = (ammoCfg && ammoCfg.splashRadius) || 0;       // HE：爆炸半径（px）

  if(allowBounce && theta > BOUNCE_ANGLE && !noBounce){
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
    // noBounce 弹种（heat/he）过陡角度不跳弹：跳过角度 BLOCK，直接按穿深判定
    // （HEAT 高穿深仍可击穿；HE 走未击穿爆轰分支）。
    if(!noBounce){
      return {
        outcome:'BLOCK', cls:'BLOCK',
        text:`未击穿 — ${head}，入射角 ${deg}° 过陡`,
        part:hit.part, faceKey:hit.faceKey, hitPoint
      };
    }
  }

  if(eff > shell.pen){
    if(splashRadius > 0){
      // HE 未击穿 → 残余爆轰伤害（P-16）：
      // 装甲吸收部分爆轰能量，残余仍以冲击波扣血。
      // 公式：dmg × max(0.25, 0.5 × pen/eff)
      //   - 擦边未击穿（eff 略 > pen）→ 接近 50% 伤害（爆炸大半能量灌入车体）；
      //   - 装甲越厚（eff/pen 越大）→ 吸收越多，残余越低，地板 25%。
      // 确定性公式（不做 0.85~1.15 随机）便于测试与平衡对照；不触发模块效果（未击穿）。
      const ratio = Math.max(0.25, 0.5 * shell.pen / eff);
      let dmg = 0;
      const invuln = !!(target.invuln) || (target.invulnT > 0);
      if(!invuln && target.hp > 0){
        dmg = Math.round(shell.dmg * ratio);
        target.hp = Math.max(0, target.hp - dmg);
      }
      applySplashAt(hit.x, hit.y, splashRadius, shell.dmg, target, shell);
      return {
        outcome:'BLOCK', cls:'BLOCK',
        text:`未击穿 — ${head} 等效厚度 ${eff.toFixed(0)} > 穿深 ${shell.pen.toFixed(0)}，装甲吸收爆轰残余扣血 ${dmg}`,
        part:hit.part, faceKey:hit.faceKey, hitPoint, dmg,
        splash: { x:hit.x, y:hit.y, radius: splashRadius }
      };
    }
    return {
      outcome:'BLOCK', cls:'BLOCK',
      text:`未击穿 — ${head} 等效厚度 ${eff.toFixed(0)} > 穿深 ${shell.pen.toFixed(0)}`,
      part:hit.part, faceKey:hit.faceKey, hitPoint
    };
  }

  // 击穿：命中即结算（模块伤害倍率 → 掉血 → 击杀/殉爆判定 → debuff）
  const modRes = applyModuleDamage(shell, target, hit);
  const res = Object.assign({ outcome:'PEN', part:hit.part, faceKey:hit.faceKey, hitPoint }, modRes);
  if(splashRadius > 0){
    // HE 击穿：弹体在命中处爆轰，范围溅射照常施加（主目标已由 applyModuleDamage 结算，排除在外）
    applySplashAt(hit.x, hit.y, splashRadius, shell.dmg, target, shell);
    res.splash = { x:hit.x, y:hit.y, radius: splashRadius };
  }
  return res;
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
  // dmg：实际扣血整数（飘字显示用；invuln/已摧毁目标为 0）
  return { cls, text: `击穿！命中 ${mod.label}，造成 ${dmg} 伤害 ${extra}`, dmg };
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  const U = require('./tank_utils.js');
  module.exports = {
    reflectDir: U.reflectDir,
    impactGeometry,
    resolveHit,
    applyModuleDamage,
    shellAmmoKey,
    applySplashAt
  };
}