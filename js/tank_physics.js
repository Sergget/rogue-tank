'use strict';

// 特性2/3：命中式弹道结算。
// 炮弹不再是"开火瞬间预结算"，而是真实飞行实体（tank_mvp.html 内逐帧做 swept-segment 检测），
// 到"命中时刻"才调用 resolveHit：入射角 / 等效厚度 / 跳弹 / 穿透 / 模块效果全部按命中瞬间的
// 目标姿态与位置判定。伤害与 debuff 在命中那一刻立即施加（不再有延迟 log 闭包）。
//
//   resolveHit(shell, target, hit, allowBounce, opts) — 命中时刻结算，返回 {outcome,text,cls, ...}
//     outcome: 'BOUNCE'（调整 shell 方向与位置，继续飞行）| 'BLOCK' | 'PEN'
//     opts（可选，P-51 弱点命中增益）：{ penAdd, dmgMul, ignoreBounce }
//       penAdd        穿透判定前加到穿深上（含 HE 残余爆轰的能量比）；
//       ignoreBounce  跳过跳弹分支（大入射角也必定按命中处理）；
//       dmgMul        最终伤害乘算（击穿路径与 HE 残余爆轰都生效）。
//     不传 opts 时行为与旧签名逐字节一致。
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

// #A14b/#A15：收集坦克 cardEffects 中某 passive key 的全部数值（applyCardEffects 挂载，
// 与 drone/ability/ammo 的消费写法同源）。返回数值数组（无则空数组）；多来源如何聚合
// 由消费方按语义决定：overmatch 取最大阈值、spall_liner 取最小乘数。
function passiveValues(tank, key){
  const list = (tank && Array.isArray(tank.cardEffects)) ? tank.cardEffects : [];
  const out = [];
  for(let i=0;i<list.length;i++){
    const ef = list[i];
    if(ef && ef.type === 'passive' && ef.key === key
      && typeof ef.value === 'number' && Number.isFinite(ef.value)) out.push(ef.value);
  }
  return out;
}

// 统一伤害入口（Issue #6）：尊重 target.dmgTakenMul（玩家更肉时由 node-map 设为 0.85，
// 缺省 1），并统一做非负钳制。其他模块（tank_strike / mvp DOT 等）也应改走本入口，
// 便于集中应用受伤减伤，避免散落的直接 hp 减法绕开减伤逻辑。
//
// 受击即警觉（2026-09-14 用户定案）：敌对实体被任何伤害来源命中（直射/溅射/炮击轰炸/
// DOT/地雷/碾压/溺毙）后立即进入搜索玩家状态——本入口是所有伤害的必经收口，在此统一
// 触发 alertEntity（aiEngaged + lastKnownPlayerPos）+ propagateAlert 友邻告警。
// src 可选 {x,y} 来源坐标（弹源/爆点/施放者）；缺省回退玩家当前位置（搜索玩家语义）。
// Node 单测环境无 tank_ai.js 时静默跳过（typeof 守卫）。返回实际造成的伤害值。
function applyDamage(target, amount, src){
  if(!target) return 0;
  const mul = (target.dmgTakenMul != null) ? target.dmgTakenMul : 1;
  const dealt = Math.max(0, amount) * mul;
  target.hp = Math.max(0, target.hp - dealt);
  // 受击警觉钩子：仅敌对存活非无人机实体；玩家/友军被击中不触发（alertEntity 内部同样有守卫）
  if(target.team === 'enemy' && target.hp > 0 && !target.isDrone
     && typeof alertEntity === 'function'){
    let sx = (src && Number.isFinite(src.x)) ? src.x : null;
    let sy = (src && Number.isFinite(src.y)) ? src.y : null;
    // 来源未知 → 记玩家当前位置（搜索玩家语义）；经 globalThis 读取避免 tsc 未声明标识符
    const _gp = (typeof globalThis !== 'undefined') ? globalThis : null;
    const _pl = _gp ? _gp.player : null;
    if(sx === null && _pl && Number.isFinite(_pl.x)){
      sx = _pl.x; sy = _pl.y;
    }
    if(sx === null){ sx = target.x; sy = target.y; }   // 兜底：记自身位置
    alertEntity(target, sx, sy);
    if(typeof propagateAlert === 'function' && typeof entities !== 'undefined' && entities){
      propagateAlert(entities, sx, sy);
    }
  }
  return dealt;
}

// HE 范围爆轰（P-16）：命中点对周围实体施加随距离衰减伤害。
// 公式：dmg × (1 − dist/splashRadius) × 0.5 —— 贴脸 50%，边缘衰减到 0。
// 友军/敌军一视同仁（不做阵营区分）；简化直伤——不触发模块效果/debuff；
// 无敌（invuln/invulnT）与已摧毁（hp≤0）目标免疫；主目标（exclude）由主命中结算，不重复扣血。
// entities 为全局注册表（js/tank_entity.js 唯一实例；Node 测试经 global.entities 注入）。
// 元素被摧毁：一次性消耗（_gone 幂等标志；每帧多辆车压上同一元素只毁一次）。
// 返回记录了本次溅射命中实体及其「实际受到伤害（ hp 损失）」的数组——消费方可据此
// 在命中位置飘出伤害数值（取代静态字样如“空爆”/“爆炸”）。对未受伤害（d<=0）的实体
// 不记录。（2026-09-15 修订：近炸引信分支需要坦克实收伤害。）
function applySplashAt(x, y, radius, dmg, exclude, shell, entityList){
  if(!(radius > 0)) return [];
  const list = entityList || (typeof entities !== 'undefined' ? entities : null) || (typeof globalThis !== 'undefined' && globalThis.entities);
  if(!list || !Array.isArray(list)) return [];
  const applied = [];
  for(const e of list){
    if(!e || e === exclude) continue;
    if(e.hp === undefined || e.hp <= 0) continue;
    if(e.invuln || e.invulnT > 0) continue;
    const dist = Math.hypot(e.x - x, e.y - y);
    if(dist > radius) continue;
    const d = Math.round(dmg * (1 - dist / radius) * 0.5);
    if(d <= 0) continue;
    const hpBefore = e.hp;
    // 溅射来源坐标：有射手实体记射手位置（AI 朝射手搜索），否则记爆点
    const src = (shell && shell.shooter && Number.isFinite(shell.shooter.x))
      ? { x: shell.shooter.x, y: shell.shooter.y } : { x: x, y: y };
    applyDamage(e, d, src);
    const taken = hpBefore - e.hp;   // 坦克真实受到伤害（经 dmgTakenMul / 击杀上限截断）
    if(taken > 0) applied.push({ entity: e, dmg: Math.round(taken) });
  }
  return applied;
}

// per-ammo 强制跳弹角（弹种链定案 2026-09-13）：ammoCfg.bounceAngle（度）> 全局 BOUNCE_ANGLE。
// 返回 rad；无 per-ammo 值回退全局。noBounce 弹种完全不进入跳弹分支（调用方先判 noBounce）。
function ammoBounceAngle(ammoCfg){
  if(ammoCfg && typeof ammoCfg.bounceAngle === 'number'){
    return ammoCfg.bounceAngle * Math.PI / 180;
  }
  return BOUNCE_ANGLE;
}

// per-ammo 弹药架/成员模块倍率（弹种链定案 2026-09-13）：弹种覆盖 shooter.stats 基准。
// 表值 = 弹种权威倍率（RULES.ammoTypes）；未配置时回退 stats.ammoMult/crewMult（旧语义不变）。
function ammoModuleMults(ammoCfg, shooter){
  const s = (shooter && shooter.stats) || {};
  const ammoBase = (s.ammoMult !== undefined && s.ammoMult > 0) ? s.ammoMult : 1;
  const crewBase = (s.crewMult !== undefined && s.crewMult > 0) ? s.crewMult : 1;
  return {
    ammo: ammoCfg && typeof ammoCfg.ammoMult === 'number' ? ammoCfg.ammoMult : ammoBase,
    crew: ammoCfg && typeof ammoCfg.crewMult === 'number' ? ammoCfg.crewMult : crewBase
  };
}

// 未击穿残余伤害（弹种链定案 2026-09-13，用户公式）：
//   dmg × (1 − (eff − effPen)/eff) × nonPenRatio，即 dmg × (effPen/eff) × nonPenRatio
//   —— 穿深越接近等效厚度残余越高；完全无法穿透（effPen→0）残余→0。
//   下限 nonPenFloor（缺省 0.25，与旧 HE 公式地板一致）；带 splashRadius 弹种同时溅射。
function nonPenSplashDmg(shell, eff, effPen, ammoCfg, dmgMulV, spallMul){
  const ratio = (typeof ammoCfg.nonPenRatio === 'number') ? ammoCfg.nonPenRatio : 0;
  if(!(ratio > 0)) return 0;
  const floor = (typeof ammoCfg.nonPenFloor === 'number') ? ammoCfg.nonPenFloor : 0.25;
  const frac = Math.max(floor, Math.min(1, effPen / eff));   // effPen/eff ∈ [floor,1]
  return Math.round(shell.dmg * frac * ratio * dmgMulV * spallMul);
}

// 命中时刻结算：跳弹 → 反射继续飞；未击穿 → 炮弹销毁；击穿 → 立即施加伤害/模块效果。
// P-16 弹种分支：HEAT/HE（noBounce）确定性不跳弹；HE（splashRadius）命中即爆轰——
//   未击穿按等效厚度/装甲吸收给残余爆轰伤害，并对命中点周围实体施加范围衰减伤害。
function resolveHit(shell, target, hit, allowBounce, opts){
  const head = `${hit.part==='turret'?superstructureLabel(target):'车体'} ${faceLabel(hit.faceKey)}`;
  const { theta, thickness, eff } = impactGeometry(shell, hit, target);
  const deg = (theta*180/Math.PI).toFixed(0);
  const hitPoint = { x:hit.x, y:hit.y };

  const ammoKey = shellAmmoKey(shell);
  const ammoCfg = (ammoKey && RULES.ammoTypes[ammoKey]) || shell.ammo || null;
  const noBounce = !!(ammoCfg && ammoCfg.noBounce);                  // HEAT/HE：确定性不跳弹
  const bAngle = ammoBounceAngle(ammoCfg);                           // 弹种链：per-ammo 强制跳弹角
  const splashRadius = (ammoCfg && ammoCfg.splashRadius) || 0;       // HE：爆炸半径（px）
  const ignBounce = !!(opts && opts.ignoreBounce);                   // P-51 弱点：跳过跳弹分支
  const effPen = shell.pen + ((opts && opts.penAdd) || 0);           // P-51 弱点：穿深加成
  const dmgMulV = (opts && opts.dmgMul) || 1;                        // P-51 弱点：最终伤害乘算

  // #A14b 超口径碾压（passive overmatch）：AP/APCR 弹命中时，若目标该面等效厚度 ≤ 穿深 ×
  // 阈值系数（多来源取最大阈值），跳过跳弹判定与过陡 BLOCK 分支、强制走穿透路径结算
  // （口径碾压语义；后续 eff > effPen 的正常未击穿判定保持不变）。HEAT/HE 本就 noBounce。
  const omKey = shellAmmoKey(shell);
  const omVals = passiveValues(shell.shooter, 'overmatch');
  const omThreshold = omVals.length ? Math.max.apply(null, omVals) : null;
  const overmatched = !!(omThreshold !== null && omThreshold > 0
    && (omKey === 'ap' || omKey === 'apcr' || omKey === null)
    && eff <= effPen * omThreshold);

  // #A15 防崩落内衬（passive spall_liner）：整车受伤降低——多来源取最强一个（最小 value），
  // 不叠乘。叠加顺序：装甲/跳弹判定之后、最终 dmg 输出之前一次性乘算
  // （对击穿路径与 HE 残余爆轰都生效；applySplashAt 对其他实体的溅射伤害不经此路径）。
  const spallVals = passiveValues(target, 'spall_liner');
  const spallMul = spallVals.length ? Math.min.apply(null, spallVals) : 1;

  if(allowBounce && theta > bAngle && !noBounce && !ignBounce && !overmatched){
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

  if(theta > bAngle){
    // noBounce 弹种（heat/he）过陡角度不跳弹：跳过角度 BLOCK，直接按穿深判定
    // （HEAT 高穿深仍可击穿；HE 走未击穿爆轰分支）。#A14b：overmatch 碾压同样跳过本分支。
    if(!noBounce && !ignBounce && !overmatched){
      return {
        outcome:'BLOCK', cls:'BLOCK',
        text:`未击穿 — ${head}，入射角 ${deg}° 过陡`,
        part:hit.part, faceKey:hit.faceKey, hitPoint
      };
    }
  }

  if(eff > effPen){
    if(splashRadius > 0){
      // 未击穿 → 残余爆轰伤害（P-16 → 弹种链 2026-09-13 泛化）：
      // 装甲吸收部分爆轰能量，残余仍以冲击波扣血。用户公式（per-ammo nonPenRatio）：
      //   dmg × (1 − (eff − effPen)/eff) × nonPenRatio = dmg × (effPen/eff) × nonPenRatio
      //   - 擦边未击穿（eff 略 > pen）→ frac→1，残余接近 dmg×nonPenRatio；
      //   - 装甲越厚（eff/pen 越大）→ 吸收越多，残余越低；地板 nonPenFloor（缺省 0.25）。
      // 确定性公式（不做 0.85~1.15 随机）便于测试与平衡对照；不触发模块效果（未击穿）。
      let dmg = 0;
      const invuln = !!(target.invuln) || (target.invulnT > 0);
      if(!invuln && target.hp > 0){
        dmg = nonPenSplashDmg(shell, eff, effPen, ammoCfg, dmgMulV, spallMul);   // #A15：内衬整车减伤乘算
        applyDamage(target, dmg);
      }
      applySplashAt(hit.x, hit.y, splashRadius, shell.dmg, target, shell);
      return {
        outcome:'BLOCK', cls:'BLOCK',
        text:`未击穿 — ${head} 等效厚度 ${eff.toFixed(0)} > 穿深 ${effPen.toFixed(0)}，装甲吸收爆轰残余扣血 ${dmg}`,
        part:hit.part, faceKey:hit.faceKey, hitPoint, dmg,
        splash: { x:hit.x, y:hit.y, radius: splashRadius }
      };
    }
    return {
      outcome:'BLOCK', cls:'BLOCK',
      text:`未击穿 — ${head} 等效厚度 ${eff.toFixed(0)} > 穿深 ${effPen.toFixed(0)}`,
      part:hit.part, faceKey:hit.faceKey, hitPoint
    };
  }

  // 击穿：命中即结算（模块伤害倍率 → 掉血 → 击杀/殉爆判定 → debuff）
  // #A15：spallMul 并入 dmgMul 在 applyModuleDamage 内乘算——位于装甲/跳弹判定之后、
  // 随机抖动与取整之前，保证「显示伤害 = 实际扣血」的整数一致性不被破坏。
  const modRes = applyModuleDamage(shell, target, hit, { dmgMul: dmgMulV * spallMul });
  const res = Object.assign({ outcome:'PEN', part:hit.part, faceKey:hit.faceKey, hitPoint }, modRes);
  if(overmatched) res.overmatch = true;   // #A14b：口径碾压标记（测试/飘字可观测）
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
//   breech  炮闩（P-49）：×crewMult；未杀 → 短时完全无法开火（fireTank/tryFire 门控）
//   track   履带：正常伤害 + 锁定
//   null    P-49 zonesV2 概率余量：正常结算伤害、无成员/模块倍率加成、无 debuff
// opts（可选）：{ dmgMul } — 最终伤害乘算（P-51 弱点命中；#A15 起固定传入 dmgMul×spallMul，
// 含内衬整车减伤）；不传时 ×1（行为不变）。
function applyModuleDamage(shell, target, hit, opts){
  const ammoKey = shellAmmoKey(shell);
  const ammoCfg = (ammoKey && RULES.ammoTypes[ammoKey]) || shell.ammo || null;
  // 弹种链 2026-09-13：per-ammo 模块抽取数（1/2/3）——doubleModule（APFSDS 系）隐含 2 抽。
  const draws = (ammoCfg && typeof ammoCfg.moduleDraws === 'number' && ammoCfg.moduleDraws > 0)
    ? ammoCfg.moduleDraws
    : ((ammoCfg && ammoCfg.doubleModule) ? 2 : 1);

  const mods = [];
  for(let i = 0; i < draws; i++){
    mods.push(moduleFromHit(target, hit, shell ? shell.shooter : null));
  }

  // per-ammo 弹药架/成员模块倍率：弹种权威表值优先，无配置回退 shooter.stats（旧语义）。
  const modMults = ammoModuleMults(ammoCfg, shell ? shell.shooter : null);

  const getMultForKey = (k) => {
    if(k === 'ammo') return modMults.ammo;
    if(k === 'engine' || k === 'gunner' || k === 'loader' || k === 'driver' || k === 'commander' || k === 'breech') return modMults.crew;
    return 1.0;
  };

  const modKey1 = (mods[0] && mods[0].key) || null;
  const modKey2 = draws >= 2 ? ((mods[1] && mods[1].key) || null) : null;

  const mult1 = getMultForKey(modKey1);
  const mult2 = draws >= 2 ? getMultForKey(modKey2) : 1.0;

  const effectiveMult = Math.max(mult1, mult2);
  const modKey = modKey1 !== null ? modKey1 : modKey2;
  const mod = modKey === modKey2 ? mods[1] : mods[0];

  const DB = RULES.modules;
  const invuln = !!(target.invuln) || (target.invulnT > 0);
  let cls = 'PEN', extra = '';
  let dmg = 0;

  if(invuln){
    extra = '（靶车无敌，不掉血）';
  } else if(target.hp <= 0){
    extra = '（目标已摧毁）';
  } else {
    dmg = shell.dmg * ((opts && opts.dmgMul) || 1) * effectiveMult * (0.85 + Math.random()*0.3);
    dmg = Math.round(dmg);
    applyDamage(target, dmg);
    const alive = target.hp > 0;

    const applySingleModEffect = (mk) => {
      if(!mk || !alive) {
        if(mk === 'ammo' && !alive){
          target.ammoBlew = true;
          target.fireT = RULES.fire.fireVisualSeconds;
          target.blowHitPoint = { x:hit.x, y:hit.y };
          extra += '（弹药架殉爆）'; cls='CRIT';
        }
        return;
      }
      switch(mk){
        case 'ammo':
          setDebuff(target, 'ammo', DB.debuffSeconds);
          extra += `（弹药架受伤：装填速度降低 ${DB.debuffSeconds}s）`; cls='CRIT';
          break;
        case 'track':
          target.trackBroken = true;
          target.trackFxPoint = { x:hit.x, y:hit.y };
          const lock = (target.stats && target.stats.trackLock !== undefined) ? target.stats.trackLock : DB.trackLockDefault;
          target.immobT = Math.max(target.immobT||0, lock);
          extra += `（履带被击断，锁定 ${lock.toFixed(0)}s）`;
          break;
        case 'engine':
          {
            const s = (shell.shooter && shell.shooter.stats) || {};
            const stdDmg = (s.damage !== undefined && s.damage > 0) ? s.damage : shell.dmg;
            const ratioMult = s.dotRatioMult !== undefined ? s.dotRatioMult : 1;
            const durMult = s.dotDurationMult !== undefined ? s.dotDurationMult : 1;
            target.dotDps = stdDmg * RULES.fire.dotRatio * ratioMult;
            target.dotSeconds = RULES.fire.dotSeconds * durMult;
            target.dotT = target.dotSeconds;
            target.fireT = RULES.fire.fireVisualSeconds;
            setDebuff(target, 'engine', DB.debuffSeconds);
            extra += `（发动机起火）`;
          }
          break;
        case 'gunner':
          setDebuff(target, 'gunner', DB.debuffSeconds);
          extra += `（炮手受伤）`;
          break;
        case 'loader':
          setDebuff(target, 'loader', DB.debuffSeconds);
          extra += `（装填手受伤）`;
          break;
        case 'driver':
          setDebuff(target, 'driver', DB.debuffSeconds);
          extra += `（驾驶员受伤）`;
          break;
        case 'commander':
          setDebuff(target, 'commander', DB.debuffSeconds);
          extra += `（车长受伤）`;
          break;
        case 'breech':
          setDebuff(target, 'breech', DB.debuffSeconds);
          extra += `（炮闩受损）`;
          break;
      }
    };

    applySingleModEffect(modKey1);
    if(draws >= 2) applySingleModEffect(modKey2);
    // 弹种链：moduleDraws ≥ 3（he/blast_he）——第三抽取只施加效果（伤害已由 effectiveMult 覆盖）
    if(draws >= 3) applySingleModEffect((mods[2] && mods[2].key) || null);
  }

  const labelStr = mod ? mod.label : '';
  const isApfsds = draws >= 2;   // 弹种链：双抽取即双模块语义（APFSDS 系 + apds/aphe/tandem 系）
  return { cls,
    modKey,
    text: modKey
      ? `击穿！命中 ${labelStr}${isApfsds && modKey2 && modKey2 !== modKey1 ? ' 及 '+mods[1].label : ''}，造成 ${dmg} 伤害 ${extra}`
      : `击穿！造成 ${dmg} 伤害 ${extra}`,
    dmg };
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
    ammoBounceAngle,
    ammoModuleMults,
    nonPenSplashDmg,
    applySplashAt,
    applyDamage
  };
}

// 显式暴露为全局，便于 tsc 跨模块解析（tank_strike.js 路由经 GLOBAL applyDamage）。
// 浏览器端：两个文件均作为全局脚本加载，applyDamage 本就是全局函数；
// tsc 下：定义已挂到 globalThis（运行时全局），ambient 声明见 types/globals.d.ts。
if (typeof globalThis !== 'undefined') { globalThis.applyDamage = applyDamage; }