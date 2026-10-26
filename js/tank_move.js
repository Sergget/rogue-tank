'use strict';

// tank_move.js — 坦克运动统一实现（玩家/靶车/未来 AI 共用）。
// 页面只提供输入 { turn: -1|0|1, move: -1|0|1 }，其余（转向/加减速/掩体通行系数/
// 起火·驾乘 debuff 乘数/与掩体三态碰撞/履带相位推进）全部收口在这里。
// 依赖（按加载顺序）：tank_rules（RULES）、tank_utils（norm）、tank_entity（clamp）、
// tank_cover（getCoverUnderTank / resolveCoverCollisions）、tank_model（debuff*）。
// 纯逻辑，无 DOM/canvas，可 Node 测试。

// 起火时速度大幅下降（倍率来自 RULES.fire.speedMul）
function fireMul(t){ return (t.fireT>0 || t.dotT>0) ? RULES.fire.speedMul : 1; }

// 2026-10-23（本批）：战术闪跃（flash_dash）速度通道——**独立乘子**，与 fireMul 同级链尾。
//   由来：`RULES.abilities.flash_dash.speedMult`（缺省 2.5）只在 t.flashDashT>0 期间生效；
//   闪跃结束后进入 t.flashOverheatT 过热期，速度回落（缺省 ×0.7，见 RULES 同名配置的
//   overheat 语义）。两个计时器都在本函数内逐帧递减（单一消费点，避免多处写同一计时器）。
//   ⚠️ 不计入 speedModifier：公路判定会把 speedModifier 归 1（同 howitzerMul 的教训）。
function flashDashMul(t){
  const cfg = (typeof RULES !== 'undefined' && RULES.abilities && RULES.abilities.flash_dash) || {};
  if (t.flashDashT > 0) return (cfg.speedMult !== undefined ? cfg.speedMult : 2.5);
  if (t.flashOverheatT > 0) return (cfg.overheatSlowMul !== undefined ? cfg.overheatSlowMul : 0.7);
  return 1;
}

// 2026-10-23（本批）：撞击硬直（ramming stiff）——硬直期间油门/刹车被压制，但**不是**
//   履带打断（immobT 的语义是「完全冻结」）。撞击硬直只削位移能力，转向与炮塔仍可动，
//   以便玩家有反制余地（撞完能立刻转向脱离而不是原地挨打）。
function stiffMul(t){
  return (t.stiffTimer > 0) ? ((RULES.ramming && RULES.ramming.stiffSpeedMul !== undefined)
    ? RULES.ramming.stiffSpeedMul : 0.35) : 1;
}

function driveTank(t, dt, input){
  const turn = input.turn || 0, mv = input.move || 0;
  // 2026-10-23（本批）：撞击硬直 / 闪跃过热 / 闪跃本身三个计时器在此统一递减。
  //   放在 immobT 早退之前——硬直与闪跃不应因履带打断而「冻结计时」（否则打断结束时
  //   闪跃时长还没走完，玩家会看到技能凭空续命）。
  if(t.stiffTimer > 0) t.stiffTimer = Math.max(0, t.stiffTimer - dt);
  if(t.flashDashT > 0){
    t.flashDashT = Math.max(0, t.flashDashT - dt);
    if(t.flashDashT === 0){
      const cfg = (RULES.abilities && RULES.abilities.flash_dash) || {};
      t.flashOverheatT = cfg.overheatDuration !== undefined ? cfg.overheatDuration : 2.0;
    }
  } else if(t.flashOverheatT > 0){
    t.flashOverheatT = Math.max(0, t.flashOverheatT - dt);
  }
  // P-35：倒车转向倒置（拟真履带差速）——仅当调用方显式开启（玩家设置项）且 move<0 时翻转 turn；
  // 默认关闭 → 玩家旧手感与 AI 行为零影响。
  const effTurn = (input.invertTurnWhenReversing && mv < 0) ? -turn : turn;
  // #W17（2026-10-20 role-systems）：履带打断（immobT>0）期间**先做掩体推出再早退**。
  //   原实现直接 return，跳过链尾的 resolveCoverCollisions ⇒ 打断期间若与岩石/永久掩体
  //   （passability 0）重叠，MTV 推出不执行，坦克会一直嵌在实体内；恢复行驶的首帧才被弹出，
  //   表现为「刚修好履带就被瞬移弹开」。修法：位移/转向仍冻结（return 保留），但推出照跑。
  if(t.immobT > 0){
    t.immobT -= dt;
    if(t.immobT <= 0){
      t.immobT = 0;
      t.trackBroken = false;
    }
    resolveCoverCollisions(t);
    return;
  }
  // 掩体/元素通行系数（§2.7）：半高/栅栏等 move<1 减速通行，灌木全速；solid 元素由碰撞推出/压毁
  const cover = getCoverUnderTank(t);
  let speedModifier = 1.0;
  let turnModifier = 1.0;
  // #AA4（2026-10-24 用户裁定「泥潭、河流限速 + 影响刹车」）：制动附着系数——只削制动，不碰极速/加速。
  //   缺省 1.0（js/tank_rules.js normalizeCoverTiers 已补齐），仅 water/river/mud 声明 0.7。
  //   ⚠️ 不参与 terrainMul 插值：附着是地表的瞬时属性，进出泥潭的**那一帧**就该变（见下方 terrainMul 注释）。
  let brakeGrip = 1.0;
  // #W17（2026-10-20 role-systems）：`COVER_TIERS[cover.tier]` 原无判空 ⇒ 未注册 tier（生成器/
  //   编辑器写入的脏数据、或 tier 拼写漂移）会让 cvTier 为 undefined，下一行 `cvTier.move` 抛
  //   TypeError 中断整个 driveTank（逐帧抛错 ⇒ 坦克彻底停摆）。修法：`|| null` 守卫，
  //   未注册 tier 跳过减速分支（按「无通行惩罚」处理，交由 resolveCoverCollisions 决定）。
  const cvTier = cover ? (COVER_TIERS[cover.tier] || null) : null;
  if(cvTier){
    // 2026-10-10 #N1（用户反馈「坦克碰到岩石后无法移动」）：通行系数只对「可通行但减速」
    // 地形生效（水/河/泥 0.4 等）。passability===0 的硬阻断地形（岩石）一律交由
    // resolveCoverCollisions 的 MTV 推出，**不再把 move 打到 0**——否则与岩石接触时
    // accel/brake/turnRate 被同时清零：SAT 判「触=叠」，推出只到恰好贴合，
    // 于是每帧都判为压在岩上 → 速度与转向永久冻结（倒车/转向均无响应），坦克彻底卡死。
    const pass = cvTier.move !== undefined ? cvTier.move : 1.0;
    if(pass > 0){
      speedModifier = pass;
      turnModifier = pass;
    }
    brakeGrip = (typeof cvTier.brakeGrip === 'number') ? cvTier.brakeGrip : 1.0;
  }
  // #S4 + #S14（2026-10-14）：road 为纯地面标识，被 getCoverUnderTank 跳过，此处单独查询。
  // #W17（2026-10-20 role-systems）：原实现 `if(onRoad){ speedModifier = 1.0; }` 是**无条件
  //   归 1**，等于把所有地形减速通道在公路上静默清零——不止 river/mud，任何新的 pass<1 地形
  //   走在路上都失效。#S14 的本意只是「路面屏蔽其下层的水/泥减速」，故改为**只豁免 river/mud**：
  //   其余减速来源（若将来新增）在公路上仍然生效。
  //   ⚠️ 榴弹炮曲射限速（#W-I）不在本通道，它挂在链尾的独立乘子 howitzerMul 上，不受此处影响。
  const roadCover = getRoadUnderTank(t);
  const onRoad = !!roadCover;
  // 豁免集合 = 液态地形（water/river，tierGroup 'liquid'）+ 烂泥（mud）——即 #S14 所说的
  // 「路面盖住的水/泥减速」。water 与 river 同为 liquid 且同为 passability 0.4，一并豁免。
  const roadExempt = !!(cover && cvTier && (cvTier.tierGroup === 'liquid' || cover.tier === 'mud'));
  if(onRoad && roadExempt){
    speedModifier = 1.0;
    turnModifier = 1.0;
    brakeGrip = 1.0;   // #AA4：路面既豁免减速，也豁免附着损失——公路上的泥/水不影响刹车
  }
  const p0x = t.x, p0y = t.y, p0a = t.hullAngle;

  // #E3（2026-09-20）：公路加速——在 road 条带上行驶 +10km/h（RULES.nodeMap.road.speedBonusKmh），
  // 且最终「表速」不超过 RULES.parameterLimits.maxSpeed.max（150km/h）上限。
  // 平顺生效/失效：roadBonus 以 speedBonusLerp 指数阻尼趋近目标值（进出路面不突跳）。
  // （onRoad 已在上方经 getRoadUnderTank 求值，此处复用。）
  const roadCfg = (RULES.nodeMap && RULES.nodeMap.road) || {};
  const bonusKmh = roadCfg.speedBonusKmh !== undefined ? roadCfg.speedBonusKmh : 10;
  const kmhFactor = (RULES.speed && RULES.speed.kmhFactor) || 0.4;
  const bonusPx = bonusKmh / kmhFactor;                    // km/h → HUD 表速单位（px/s）
  const rbLerp = roadCfg.speedBonusLerp !== undefined ? roadCfg.speedBonusLerp : 6;
  const rbK = 1 - Math.exp(-rbLerp * dt);
  t.roadBonus = (t.roadBonus || 0) + ((onRoad ? bonusPx : 0) - (t.roadBonus || 0)) * rbK;
  const maxSpeedCap = (RULES.parameterLimits && RULES.parameterLimits.maxSpeed && RULES.parameterLimits.maxSpeed.max) || 375;
  const baseMax = t.stats.maxSpeed || 0;
  const boostedMax = Math.min(maxSpeedCap, baseMax + t.roadBonus);

  // 驾驶员受伤 → 转向速度降低（debuff）
  t.hullAngle += effTurn * t.stats.turnRate * dt * turnModifier * debuffTurnRate(t);
  // #AA4（2026-10-24 用户裁定「按建议」= 方案 D）：地形减速乘子做指数插值后再驱动加减速，
  //   否则踩进/驶出泥潭那一帧加速度阶跃（pTarget 与 pAccel 同时跳变），表现为「撞墙式顿挫」。
  //   · 只作用于**速度通道**（pAccel / pTarget）——转向 turnModifier 保持瞬时（上面那行不动）。
  //   · 首帧以当前 speedModifier 播种，等于不引入瞬态（旧行为不变）。
  //   · 与 :104-115 的 roadBonus 插值同一范式（指数阻尼 1-e^{-k·dt}）。
  const terrainLerp = (RULES.speed && typeof RULES.speed.terrainLerp === 'number') ? RULES.speed.terrainLerp : 10;
  const tK = 1 - Math.exp(-terrainLerp * dt);
  if(typeof t.terrainMul !== 'number' || !isFinite(t.terrainMul)) t.terrainMul = speedModifier;
  t.terrainMul += (speedModifier - t.terrainMul) * tK;
  // Mobility: accel 来自 enginePower ÷ weight（makeTank 算过一次 → t.stats.accel）；
  // 制动是独立通道（#AA4）：t.stats.brake 来自 RULES.speed.brakeBasePx，只受地形附着 brakeGrip 影响，
  // **不再乘 speedModifier**——旧实现 `brake × speedModifier` 让泥潭/河流的滑行距离放大到 2.5 倍。
  const pAccel = t.stats.accel * t.terrainMul;
  const pBrake = t.stats.brake * brakeGrip;
  // 发动机受伤 → 最大速度降低（debuff）
  // #W-I（2026-10-20 用户裁定）：榴弹炮曲射模式（**副武器**）下行进限速 = ×1/3。
  //   ⚠️ 独立乘子（fireMul 同级链尾），**不可并入 speedModifier**——:45-47 公路判定会把
  //   speedModifier 强制归 1，榴弹炮减速会被静默清零。
  //   判据惰性解析：浏览器用全局 isHowitzerMode，Node 测试用 require / 内联等价判断。
  let _ish = (typeof isHowitzerMode === 'function') ? isHowitzerMode : null;
  if (!_ish && typeof require !== 'undefined') {
    try { _ish = require('./tank_weapons.js').isHowitzerMode; } catch (e) { _ish = null; }
  }
  const _howOn = _ish ? _ish(t) : !!(t && t.weapons && t.weapons.secondary && t.weapons.secondary.type === 'howitzer');
  let _hsDef = (typeof WEAPON_DEFAULTS !== 'undefined') ? WEAPON_DEFAULTS : null;
  if (!_hsDef && typeof require !== 'undefined') {
    try { _hsDef = require('./tank_weapons.js').WEAPON_DEFAULTS; } catch (e) { _hsDef = null; }
  }
  const howitzerMul = _howOn
    ? (((_hsDef && _hsDef.primary && _hsDef.primary.howitzer && typeof _hsDef.primary.howitzer.moveSpeedRatio === 'number')
        ? _hsDef.primary.howitzer.moveSpeedRatio : (1/3)))
    : 1;
  const pTarget = mv * boostedMax * RULES.speed.pxFactor * t.terrainMul * howitzerMul * fireMul(t) * debuffSpeedRate(t) * RULES.speed.effMul * flashDashMul(t) * stiffMul(t);
  t.speed = t.speed || 0;
  if(mv === 0){
    // 松键滑行：制动通道 × 1.8（松键比「反向油门制动」更积极，保持旧手感；1.8 为就地常量，
    //   口径见 docs/specs/map/terrain.md §「制动与滑行」）
    const decel = pBrake * 1.8 * dt;
    if(t.speed > 0) t.speed = Math.max(0, t.speed - decel);
    else if(t.speed < 0) t.speed = Math.min(0, t.speed + decel);
  } else {
    t.speed += clamp(pTarget - t.speed, -pBrake*dt, pAccel*dt);
  }
  t.x += Math.cos(t.hullAngle)*t.speed*dt;
  t.y += Math.sin(t.hullAngle)*t.speed*dt;

  // 地图边界约束（问题7）：限制坦克在合法作战区域内，防穿出世界或小地图外
  const nodeW = (input && input.worldBounds && input.worldBounds.maxX) || (typeof globalThis !== 'undefined' && globalThis.currentNode && globalThis.currentNode.w);
  const nodeH = (input && input.worldBounds && input.worldBounds.maxY) || (typeof globalThis !== 'undefined' && globalThis.currentNode && globalThis.currentNode.h);
  if(input && input.worldBounds){
    const wb = input.worldBounds;
    const margin = Math.max(t.hullLen || 32, t.hullWid || 32) * 0.6;
    if(wb.minX !== undefined) t.x = Math.max(wb.minX + margin, Math.min(wb.maxX - margin, t.x));
    if(wb.minY !== undefined) t.y = Math.max(wb.minY + margin, Math.min(wb.maxY - margin, t.y));
  } else if(nodeW && nodeH){
    const margin = Math.max(t.hullLen || 32, t.hullWid || 32) * 0.6;
    t.x = Math.max(margin, Math.min(nodeW - margin, t.x));
    t.y = Math.max(margin, Math.min(nodeH - margin, t.y));
  }

  // 掩体/元素碰撞：solid 推出（不可压）、crushable 压毁、graduated/none 仅通行系数
  resolveCoverCollisions(t);
  // 履带相位：由真实位移（平移 + 车体转向角差）累积（ISSUES #14：传完整参数，勿用 Math.hypot 简写）
  advanceTracks(t, t.x-p0x, t.y-p0y, t.hullAngle-p0a);
  // #U41（2026-10-19）：地面履带痕迹——发射钩子经 globalThis 可选调用（页面加载 js/tank_fx.js
  // 后注册；Node 测试链/未加载 FX 的环境自动 no-op，不引入 tank_move → tank_fx 依赖）。
  if (typeof globalThis !== 'undefined' && typeof globalThis.emitTankTracks === 'function') {
    globalThis.emitTankTracks(t);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fireMul, driveTank, flashDashMul, stiffMul };
}