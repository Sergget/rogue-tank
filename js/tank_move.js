'use strict';

// tank_move.js — 坦克运动统一实现（玩家/靶车/未来 AI 共用）。
// 页面只提供输入 { turn: -1|0|1, move: -1|0|1 }，其余（转向/加减速/掩体通行系数/
// 起火·驾乘 debuff 乘数/与掩体三态碰撞/履带相位推进）全部收口在这里。
// 依赖（按加载顺序）：tank_rules（RULES）、tank_utils（norm）、tank_entity（clamp）、
// tank_cover（getCoverUnderTank / resolveCoverCollisions）、tank_model（debuff*）。
// 纯逻辑，无 DOM/canvas，可 Node 测试。

// 起火时速度大幅下降（倍率来自 RULES.fire.speedMul）
function fireMul(t){ return (t.fireT>0 || t.dotT>0) ? RULES.fire.speedMul : 1; }

function driveTank(t, dt, input){
  const turn = input.turn || 0, mv = input.move || 0;
  // P-35：倒车转向倒置（拟真履带差速）——仅当调用方显式开启（玩家设置项）且 move<0 时翻转 turn；
  // 默认关闭 → 玩家旧手感与 AI 行为零影响。
  const effTurn = (input.invertTurnWhenReversing && mv < 0) ? -turn : turn;
  if(t.immobT > 0){
    t.immobT -= dt;
    if(t.immobT <= 0){
      t.immobT = 0;
      t.trackBroken = false;
    }
    return;
  }
  // 掩体/元素通行系数（§2.7）：半高/栅栏等 move<1 减速通行，灌木全速；solid 元素由碰撞推出/压毁
  const cover = getCoverUnderTank(t);
  let speedModifier = 1.0;
  let turnModifier = 1.0;
  if(cover){
    const cvTier = COVER_TIERS[cover.tier];
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
  }
  // #S4 + #S14（2026-10-14）：road 为纯地面标识，被 getCoverUnderTank 跳过，
  // 此处单独查询。道路存在时屏蔽下层 river/mud 的减速（#S14），并恢复 #E3 公路加速（#S4）。
  const roadCover = getRoadUnderTank(t);
  const onRoad = !!roadCover;
  if(onRoad){ speedModifier = 1.0; turnModifier = 1.0; }
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
  // Mobility: accel / decel 来自 enginePower ÷ weight（makeTank 算过一次 → t.stats.accel/brake）
  const pAccel = t.stats.accel * speedModifier;
  const pBrake = t.stats.brake * speedModifier;
  // 发动机受伤 → 最大速度降低（debuff）
  // #W-I（2026-10-19 用户裁定）：榴弹炮曲射模式下行进限速 = ×1/3。
  //   ⚠️ 独立乘子（fireMul 同级链尾），**不可并入 speedModifier**——:45-47 公路判定会把
  //   speedModifier 强制归 1，榴弹炮减速会被静默清零。
  const howitzerMul = (t._howitzerMode === true)
    ? ((typeof WEAPON_DEFAULTS !== 'undefined' && WEAPON_DEFAULTS.primary &&
        WEAPON_DEFAULTS.primary.howitzer && typeof WEAPON_DEFAULTS.primary.howitzer.moveSpeedRatio === 'number')
        ? WEAPON_DEFAULTS.primary.howitzer.moveSpeedRatio : (1/3))
    : 1;
  const pTarget = mv * boostedMax * RULES.speed.pxFactor * speedModifier * howitzerMul * fireMul(t) * debuffSpeedRate(t) * RULES.speed.effMul;
  t.speed = t.speed || 0;
  if(mv === 0){
    // 松键：快速停止/中性滑行减速
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
  module.exports = { fireMul, driveTank };
}