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
    speedModifier = cvTier.move !== undefined ? cvTier.move : 1.0;
    turnModifier = speedModifier;
  }
  const p0x = t.x, p0y = t.y, p0a = t.hullAngle;

  // 驾驶员受伤 → 转向速度降低（debuff）
  t.hullAngle += turn * t.stats.turnRate * dt * turnModifier * debuffTurnRate(t);
  // Mobility: accel / decel 来自 enginePower ÷ weight（makeTank 算过一次 → t.stats.accel/brake）
  const pAccel = t.stats.accel * speedModifier;
  const pBrake = t.stats.brake * speedModifier;
  // 发动机受伤 → 最大速度降低（debuff）
  const pTarget = mv * t.stats.maxSpeed * RULES.speed.pxFactor * speedModifier * fireMul(t) * debuffSpeedRate(t);
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
  // 掩体/元素碰撞：solid 推出（不可压）、crushable 压毁、graduated/none 仅通行系数
  resolveCoverCollisions(t);
  // 履带相位：由真实位移（平移 + 车体转向角差）累积（ISSUES #14：传完整参数，勿用 Math.hypot 简写）
  advanceTracks(t, t.x-p0x, t.y-p0y, t.hullAngle-p0a);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fireMul, driveTank };
}