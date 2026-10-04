// test-ai.js — 敌人/友军 AI 决策测试（Node 端，Pure Logic）
// 运行：node scripts/test-ai.js
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require('../js/tank_utils.js');
global.angDiff = U.angDiff;
global.norm = U.norm;
global.TAU = U.TAU;
const { aiDecideEnemy, aiDecideAlly, aiDecide, aiUpdateStateTimer, alertEntity, propagateAlert, aiTierProfile, aiClassForTank, _reactionSeconds, _propagateEngage, _maneuverRoll, _applyManeuver, _maneuverSetRng, _engageBand, _separationTurn, _flankStation, _flankRadius, _retreatReloadSpot } = require('../js/tank_ai.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

function enemy(x, y, hullAngle, turretAngle, reloadT) {
  return { team: 'enemy', x, y, hullAngle, turretAngle, reloadT: reloadT || 0, stats: { turretTurnRate: 2.2 }, hp: 100, traverseLimit: Math.PI };
}
const player = { team: 'player', x: 1000, y: 500, hp: 100 };

// 1) 触发距离外被动：距玩家 ~1118 > triggerDistBase(700) → patrol 不活动
const far = enemy(0, 0, 0, 0, 0);
const d1 = aiDecideEnemy(far, { player, hasLoS: () => true });
ok(d1.move === 0 && d1.turn === 0 && d1.fire === false, '触发距离外 → 被动（不活动）');

// 2) 触发距离内激活：dist 550 ≤ 700 且 > engageRange(520) → 主动靠近
//    （AI 触发重设计：判定 = 距离 + 可见性，不再看 ctx.view）
const edge2 = enemy(450, 500, Math.PI, Math.PI, 0);
const d2 = aiDecideEnemy(edge2, { player, hasLoS: () => true });
ok(d2.move === 1 || d2.turn !== 0, '触发距离内 → 主动（靠近或转向）');
ok(d2.turretDesired !== Math.PI || d2.fire === false, '有决策输出');

// 3) 触发距离内 + 接战距离内 → move=0、turretDesired 指向玩家；超出接战距离 → 靠近
const farInView = enemy(500, 500, Math.PI, Math.PI, 0);   // 距玩家 500 < engage 520
const d3 = aiDecideEnemy(farInView, { player, hasLoS: () => true });
ok(Math.abs(d3.turretDesired - 0) < 1e-9, 'turretDesired 指向玩家（atan2(0,500)=0）');
ok(d3.move === 0, '距离在接战范围内 → 不前进（500 < 520）');

const veryFar = enemy(420, 500, Math.PI, Math.PI, 0);   // 距玩家 580 > 520 但 ≤ 700
const d4 = aiDecideEnemy(veryFar, { player, hasLoS: () => true });
ok(d4.move === 1, '超过接战距离但仍在触发距离内 → 靠近');

// 4) 对准 + 视线 + 装填好 → fire；视线遮挡 → 不 fire 且走 search 推进
const ready = enemy(800, 500, Math.PI, 0, 0);   // turretAngle=0 对准玩家（右侧）
const d5 = aiDecideEnemy(ready, { player, hasLoS: () => true });
ok(d5.fire === true, '对准+视线+装填好 → 开火');
const blocked = enemy(800, 500, Math.PI, 0, 0);
const d6 = aiDecideEnemy(blocked, { player, hasLoS: () => false });
ok(d6.fire === false, '视线遮挡 → 不开火');
// #E8（2026-09-20）：无视线 + 无警觉记忆 → 不激活（保持 patrol）；不再「进入范围立即行动」。
ok(blocked.aiState === 'patrol' && blocked.aiEngaged !== true,
   '#E8: 全高掩体遮挡视线且无警觉记忆 → 不进入接战（保持 patrol）');
// #E8：被击中/友邻告警后（aiEngaged + lastKnownPlayerPos）即使无视线也进入 search 推进
const alerted = enemy(800, 500, Math.PI, 0, 0);
alertEntity(alerted, alerted.x + 400, alerted.y);
const d6b = aiDecideEnemy(alerted, { player, hasLoS: () => false });
ok(alerted.aiState === 'search' && d6b.move === 1, '警觉记忆 + 无视线 → search 态推进');
const reloading = enemy(800, 500, Math.PI, 0, 1.0);
const d7 = aiDecideEnemy(reloading, { player, hasLoS: () => true });
ok(d7.fire === false, '装填中 → 不开火');

// 4b) 滞回防抖：进入阈值 700，脱离阈值 = 700 × 1.25 = 875。
//     进入后拉到 dist 800（>700 但 ≤875）→ 保持接战；>875 → 才回落 patrol
// 注：#M 机动层启用后，接近途中的 move 可为 ±1 或 0（前进/后撤/短停均属合法机动），
//     故只断言「滞回带内不脱离接战」这一状态不变量，不对具体 move/aiState 取值写死。
const hystE = enemy(300, 500, Math.PI, Math.PI, 0);   // dist 700 → 进入接战
aiDecideEnemy(hystE, { player, hasLoS: () => true });
ok(hystE.aiEngaged === true, '进入阈值上 → 接战标记置位');
hystE.x = 200;                                        // dist 800，滞回带内
const dh1 = aiDecideEnemy(hystE, { player, hasLoS: () => true });
ok(hystE.aiEngaged === true && dh1.move >= -1 && dh1.move <= 1,
   `滞回带内不脱离接战（engaged=true，move=${dh1.move} ∈ [-1,1]）`);
hystE.x = -200;                                       // dist 1200 > 875 → 脱离
const dh2 = aiDecideEnemy(hystE, { player, hasLoS: () => true });
ok(hystE.aiEngaged === false && dh2.move === 0 && hystE.aiState === 'patrol', '超出滞回阈值 → 回落 patrol');

// 4c) 难度字段消费：实体 t.aiTriggerDist 覆盖 RULES 基准值（高难度远触发）
const df = enemy(-100, 500, Math.PI, Math.PI, 0);     // dist 1100 > 默认 700
const dd0 = aiDecideEnemy(df, { player, hasLoS: () => true });
ok(dd0.move === 0, '默认基准下 1100 距离 → 被动');
df.aiTriggerDist = 1200;
const dd1 = aiDecideEnemy(df, { player, hasLoS: () => true });
ok(dd1.move === 1 || dd1.turn !== 0, '实体 aiTriggerDist 被消费（远触发激活）');

// 5) 友军据点：消极防御（不移动），射程内敌人 → 开火；无敌人 → 静止
const ally = { team: 'ally', x: 500, y: 500, hullAngle: 0, turretAngle: 0, reloadT: 0, stats: { turretTurnRate: 2.2 }, hp: 100, traverseLimit: Math.PI };
const dAlly1 = aiDecideAlly(ally, { enemies: [], hasLoS: () => true });
ok(dAlly1.move === 0 && dAlly1.fire === false, '友军无敌人 → 静止');
const enemyNear = enemy(700, 500, Math.PI, Math.PI, 0);   // 距 ally 200 < 460，在 ally 右侧
const dAlly2 = aiDecideAlly(ally, { enemies: [enemyNear], hasLoS: () => true });
ok(Math.abs(dAlly2.turretDesired - 0) < 1e-9, '友军 turretDesired 指向最近敌人（右侧 → 0）');
// 友军 turretAngle=0 已对准 → fire
ok(dAlly2.fire === true, '友军射程内对准 → 开火');
ok(dAlly2.move === 0 && dAlly2.turn === 0, '友军消极防御（不移动）');

// 6) aiDecide 分发
ok(aiDecide(ally, { enemies: [], hasLoS: () => true }).fire === false, 'aiDecide 分发 ally');
ok(aiDecide(far, { player, hasLoS: () => true }).move === 0, 'aiDecide 分发 enemy');

// ===== 警觉系统（被击中/友邻告警 + stun 免疫窗） =====

console.log('--- 警觉系统 ---');

// A) alertEntity：未激活（触发距离外被动）的敌对 AI 被警觉后立即接战且不再 patrol 早退
{
  const t = enemy(0, 500, Math.PI, Math.PI, 0);          // 距玩家(1000,500) 1000 > 700 → 被动
  const dBefore = aiDecideEnemy(t, { player, hasLoS: () => false });
  ok(dBefore.move === 0 && dBefore.turn === 0 && dBefore.fire === false,
    '警觉前：触发距离外 → 全零输出（木桩）');
  ok(alertEntity(t, 900, 500) === true, 'alertEntity 对敌对实体生效（返回 true）');
  ok(t.aiEngaged === true && t.lastKnownPlayerPos && t.lastKnownPlayerPos.x === 900 && t.lastKnownPlayerPos.y === 500,
    '警觉后：aiEngaged 置位 + lastKnownPlayerPos 记录来弹方向');
  // 警觉后即使超出滞回带也保持接战；无视线 → search 朝记忆点推进
  const dAfter = aiDecideEnemy(t, { player, hasLoS: () => false });
  ok(dAfter.move === 1 && t.aiState === 'search', '警觉后不再早退 patrol → search 态推进');
  ok(Math.abs(dAfter.turretDesired - 0) < 1e-9,
    'search 朝记忆点 (900,500)（正右方，atan2(0,+)=0）推进');
  ok(dAfter.turn === 1 || dAfter.turn === -1 || dAfter.turn === 0, 'search 输出合法 turn');
}
// A2) alertEntity 非敌方目标 no-op
{
  const p = { team: 'player', x: 0, y: 0, hp: 100 };
  ok(alertEntity(p, 10, 10) === false, 'alertEntity 对玩家 no-op');
  const ally = { team: 'ally', x: 0, y: 0, hp: 100 };
  ok(alertEntity(ally, 10, 10) === false, 'alertEntity 对友军 no-op');
  const dead = enemy(0, 0, 0, 0, 0); dead.hp = 0;
  ok(alertEntity(dead, 10, 10) === false, 'alertEntity 对阵亡实体 no-op');
}

// B) alertEntity 清除进行中的 stunned（被击中立即惊醒）
{
  const t = enemy(800, 500, 0, 0, 0);
  aiDecideEnemy(t, { player, hasLoS: () => true });       // 激活
  t.aiState = 'stunned'; t.aiStateTimer = 3.0;
  alertEntity(t, 900, 500);
  ok(t.aiState !== 'stunned' && t.aiStateTimer === 0, 'stunned 进行中被击中 → 立即惊醒');
}

// C) propagateAlert：半径内外筛选正确
{
  const center = { x: 2000, y: 2000 };
  const inA = enemy(2300, 2000, 0, 0, 0);   // 距 300 < 600
  const inB = enemy(2000, 2500, 0, 0, 0);   // 距 500 < 600
  const outC = enemy(2700, 2000, 0, 0, 0);  // 距 700 > 600
  const deadD = enemy(2100, 2000, 0, 0, 0); deadD.hp = 0;  // 半径内但阵亡
  const playerE = { team: 'player', x: 2050, y: 2000, hp: 100 }; // 非敌对
  const n = propagateAlert([inA, inB, outC, deadD, playerE], center.x, center.y);
  ok(n === 2, `propagateAlert 只警觉半径内存活敌对 AI（实际 ${n}，期望 2）`);
  ok(inA.aiEngaged === true && inB.aiEngaged === true, '半径内敌对 AI 均置位 aiEngaged');
  ok(inA.lastKnownPlayerPos.x === 2000 && inA.lastKnownPlayerPos.y === 2000, 'lastKnown 记为告警来源点');
  ok(outC.aiEngaged === undefined || outC.aiEngaged === false, '半径外不被警觉');
  // 显式 radius 覆盖
  const farF = enemy(3200, 2000, 0, 0, 0);   // 距 1200
  ok(propagateAlert([farF], center.x, center.y, 1500) === 1, '显式 radius 参数生效');
  ok(propagateAlert([], center.x, center.y) === 0, '空列表返回 0');
}

// D) stun 免疫窗：自然苏醒后立即再压不生效，免疫窗过后恢复可 stun
{
  const cfg = RULES.ai;
  const t = enemy(800, 500, 0, 0, 0);
  aiDecideEnemy(t, { player, hasLoS: () => true });       // 激活（dist 300 < engage）
  t.trackBroken = true;                                    // debuffSeverity ≥ 阈值 → 必 stun
  aiDecideEnemy(t, { player, hasLoS: () => true });
  ok(t.aiState === 'stunned' && t.aiStateTimer > 0, '模块重伤 → 进入 stunned');
  // 免疫计时走 aiUpdateStateTimer：3s 后自然苏醒并授予免疫窗
  for(let i = 0; i < 310; i++) aiUpdateStateTimer(t, 0.01);   // 3.1s
  ok(t.aiState !== 'stunned', 'stunDuration 到点 → 自然苏醒');
  ok((t.stunImmuneT || 0) > 0, `苏醒后进入免疫窗（stunImmuneT=${t.stunImmuneT}）`);
  delete t.trackBroken;
  // 免疫窗内再次满足 stun 条件 → 不进入 stunned
  t.immobT = 5;                                            // debuffSeverity ≥ 阈值
  const r1 = aiDecideEnemy(Object.assign(t, {}), { player, hasLoS: () => true });
  ok(t.aiState !== 'stunned', '免疫窗内再压不生效（不被压入 stunned）');
  // 免疫窗耗尽后恢复可 stun
  for(let i = 0; i < 220; i++) aiUpdateStateTimer(t, 0.01);   // 再过 2.2s > stunImmunityAfter=2.0
  ok((t.stunImmuneT || 0) === 0, '免疫窗倒计时归零');
  aiDecideEnemy(t, { player, hasLoS: () => true });
  ok(t.aiState === 'stunned', '免疫窗过后恢复可 stun');
}

// ===== #76 B/C：AI 行为参数化 + tier 消费 + patrol 微摆动 + 重坦寻掩 =====

console.log('--- #76 B/C：参数化/tier/摆动/寻掩 ---');

// E) flankDist 读 cfg（RULES.ai 收口，原 tank_ai.js 硬编码 300）
// #N3（2026-10-01）：flank 改由「角色 + 侧翼站位」驱动（见下方 #N 段），旧分支降级为
//   回退路径（flankRewrite.enabled=false 时启用）。本段保留旧分支的回归覆盖。
{
  const saveFD = RULES.ai.flankDist;
  const saveRewrite = RULES.ai.flankRewrite.enabled;
  RULES.ai.flankRewrite.enabled = false;             // 切到旧分支（回退路径）
  const fl = enemy(420, 500, Math.PI, Math.PI, 0);   // dist 580 ∈ (engage 520, flankMinDist×1.5=600)
  const rDefault = aiDecideEnemy(fl, { player, hasLoS: () => true });
  ok(fl.aiState === 'flank' && rDefault.move === 1, 'flank 回退路径：距离窗口内触发旧 flank 态');
  RULES.ai.flankDist = -saveFD;   // 取负 → 侧翼目标点翻到对侧 → 车体转向翻转（证明消费 cfg）
  const rFlip = aiDecideEnemy(fl, { player, hasLoS: () => true });
  ok(rFlip.turn === -rDefault.turn, `flankDist 读 cfg：取负后转向翻转（${rDefault.turn}→${rFlip.turn}）`);
  RULES.ai.flankDist = saveFD;
  RULES.ai.flankRewrite.enabled = saveRewrite;
}

// F) aiTierProfile 档位表 + engageMul/aimTolMul 消费
{
  ok(aiTierProfile(2).stunResist === true && aiTierProfile(1).engageMul > 1, 'tierProfiles 档位定义可读');
  ok(Object.keys(aiTierProfile(99)).length === 0 && Object.keys(aiTierProfile(undefined)).length === 0,
    'tier 越界/缺省回退空 profile（tier 0 基础行为）');
  // engageMul：dist 580 —— tier0 带外沿 520×1.10=572 < 580 → 接近；tier2 带外沿 624×1.10=686 ≥ 580 → 带内驻停
  // （#N1 起判据由单点 engage 改为交战带上沿 band.max，见下方 #N 段）
  const te0 = enemy(420, 500, Math.PI, 0, 0);
  const rte0 = aiDecideEnemy(te0, { player, hasLoS: () => true });
  ok(rte0.move === 1 , `tier0：580 > 带上沿 572 → 接近（move=${rte0.move}）`);
  const te2 = enemy(420, 500, Math.PI, 0, 0);
  te2.aiTier = 2;
  const rte2 = aiDecideEnemy(te2, { player, hasLoS: () => true });
  ok(rte2.move === 0 && rte2.fire === true, 'tier2：engage=624 ≥ 580 → 原地开火（engageMul 消费）');
  // aimTolMul：aimErr 0.1 —— tier0 容差 0.12 可开火；tier2 容差 0.12×0.6=0.072 不开火
  const ta0 = enemy(800, 500, Math.PI, 0.1, 0);
  ok(aiDecideEnemy(ta0, { player, hasLoS: () => true }).fire === true, 'tier0：aimErr 0.1 < tol 0.12 → 开火');
  const ta2 = enemy(800, 500, Math.PI, 0.1, 0);
  ta2.aiTier = 2;
  ok(aiDecideEnemy(ta2, { player, hasLoS: () => true }).fire === false, 'tier2：aimTolMul 收紧 tol=0.072 → 不开火');
}

// F2) P-46 类别行为档案（aiClassForTank + classProfiles 消费）
{
  ok(aiClassForTank({ tankClass: 'light' }).flankBias > 1, 'class light：flankBias > 1（侧绕强化）');
  ok(aiClassForTank({ tankClass: 'heavy' }).moveLock === true, 'class heavy：moveLock 只进不退');
  ok(aiClassForTank({ tankClass: 'spg' }).keepRange === true, 'class spg：keepRange 保持距离');
  ok(aiClassForTank({ tankClass: 'spg' }).flankBias === 0, 'class spg：flankBias=0 绝不侧绕');
  ok(aiClassForTank({ heightClass: 'heavy' }).moveLock === true, '无 tankClass 时按 heightClass=heavy 回退重型');
  ok(aiClassForTank({}).engageMul === undefined || aiClassForTank({}).moveLock === false, '未知类别回退 medium 基线零修正');
}

// G) stunResist 生效（tier2：阈值 +0.2 且 daze 概率减半——用受控 Math.random 消除随机性）
{
  const realRandom = Math.random;
  Math.random = () => 0.99;   // 高于任何 daze 概率 → 只走确定性阈值分支
  const ts0 = enemy(800, 500, 0, 0, 0);
  aiDecideEnemy(ts0, { player, hasLoS: () => true });
  ts0.fireDebuffT = 1;        // severity 0.5 ≥ tier0 阈值 0.5 → 必 stun
  aiDecideEnemy(ts0, { player, hasLoS: () => true });
  ok(ts0.aiState === 'stunned', 'tier0：severity 0.5 ≥ 阈值 0.5 → stunned');
  const ts2 = enemy(800, 500, 0, 0, 0);
  ts2.aiTier = 2;
  aiDecideEnemy(ts2, { player, hasLoS: () => true });
  ts2.fireDebuffT = 1;        // severity 0.5 < tier2 阈值 0.7 且随机分支被压制 → 不 stun
  aiDecideEnemy(ts2, { player, hasLoS: () => true });
  ok(ts2.aiState !== 'stunned', 'tier2：stunResist 阈值上调至 0.7 → 抗晕不 stun');
  Math.random = realRandom;
}

// H) patrol 微摆动（#76 C5）：激活门控外早退不再全零；ctx.time 注入确定性验证
{
  const tw = enemy(0, 0, 0, 0, 0);   // dist ~1118 > 700 → patrol 早退
  const speed = RULES.ai.patrolWanderSpeed, sigma = RULES.ai.patrolWanderSigma;
  const ctxP = { player, hasLoS: () => true };
  const wPeak = aiDecideEnemy(tw, Object.assign({}, ctxP, { time: Math.PI / 2 / speed }));
  ok(tw.aiState === 'patrol' && Math.abs(wPeak.turn - sigma) < 1e-9 && wPeak.move === 0,
     `patrol 微摆动峰值 turn≈sigma=${sigma}（实际 ${wPeak.turn}）、move 保持 0`);
  const wZero = aiDecideEnemy(tw, Object.assign({}, ctxP, { time: 0 }));
  ok(wZero.turn === 0, '相位 0 处摆动为 0');
  const wValley = aiDecideEnemy(tw, Object.assign({}, ctxP, { time: (Math.PI * 1.5) / speed }));
  ok(Math.abs(wValley.turn + sigma) < 1e-9, '谷值 -sigma（正弦对称）');
  let bounded = true;
  for (let i = 0; i < 50; i++) {
    const r = aiDecideEnemy(tw, Object.assign({}, ctxP, { time: i * 0.37 }));
    if (Math.abs(r.turn) > sigma || r.move !== 0) { bounded = false; break; }
  }
  ok(bounded, '任意相位下幅度受限 |turn| ≤ sigma 且 move=0');
  // 本地相位回退路径（无 ctx.time）：首调 phase=0 → 0，随后推进非恒零
  const tl = enemy(0, 0, 0, 0, 0);
  ok(aiDecideEnemy(tl, ctxP).turn === 0, '本地相位首调为 0（sin(0)）');
  const t2v = aiDecideEnemy(tl, Object.assign({}, ctxP, { dt: 1 }));   // phase += speed×1 ≈ 1.5 rad
  ok(Math.abs(t2v.turn) > 0 && Math.abs(t2v.turn) <= sigma, '本地相位随 dt 推进产生非零受限摆动');
}

// I) 重坦受创寻掩（#76 C6）：触发条件 / 目标点方向 / 到位还击 / 无掩体回退
{
  const mkHeavy = () => ({
    team: 'enemy', x: 900, y: 500, hullAngle: Math.PI, turretAngle: 0, reloadT: 0,
    stats: { turretTurnRate: 2.2, armor: { hull: { front: 120 } } },
    hp: 40, maxHp: 100, traverseLimit: Math.PI   // hpRatio 0.4 < defensiveCoverThreshold 0.6
  });
  const covers = [
    { x: 700, y: 500, w: 80, h: 60, tier: 'full' },   // 最近合格掩体（距 200）；玩家在右 → 背弹面在左
    { x: 950, y: 700, w: 50, h: 50, tier: 'bush' }    // bush 非挡弹掩体，应被忽略
  ];
  const tc = mkHeavy();
  const rc = aiDecideEnemy(tc, { player, hasLoS: () => true, covers });
  ok(tc.aiState === 'coverSeek', '重甲 + 血量 < 阈值 → coverSeek 态');
  ok(rc.move === 1 && rc.turn === 0,
     '向背弹面目标点机动（目标 (630,500) 在正左方，车体已朝左 → 仅前进不转向）');
  ok(rc.turretDesired === 0 && rc.fire === true, '寻掩途中炮塔锁定玩家且条件满足即还击');
  // 到位判定：实体挪到目标点半径内 → 原地还击
  tc.x = 635;
  const rc2 = aiDecideEnemy(tc, { player, hasLoS: () => true, covers });
  ok(rc2.move === 0 && tc.aiState === 'coverSeek', '到位（≤coverArriveDist）→ 原地还击');
  // 非 heavyEnough（正面装甲 50 < 100 且无 aiTier）：血量再低也不寻掩
  const tl = mkHeavy();
  tl.stats.armor.hull.front = 50; delete tl.aiTier;
  aiDecideEnemy(tl, { player, hasLoS: () => true, covers });
  ok(tl.aiState !== 'coverSeek', '非重甲低档实体不触发寻掩');
  // 无合格掩体 → 维持原行为
  const tn = mkHeavy();
  aiDecideEnemy(tn, { player, hasLoS: () => true, covers: [] });
  ok(tn.aiState !== 'coverSeek', '半径内无 full/half 掩体 → 维持原行为');
  // 血量健康 → 不寻掩
  const th = mkHeavy(); th.hp = 100; th.maxHp = 100;
  aiDecideEnemy(th, { player, hasLoS: () => true, covers });
  ok(th.aiState !== 'coverSeek', 'hpRatio ≥ 阈值 → 不寻掩');
}

// ============================================================
// P-51：Boss 阶段声明式行为脚本（entity.stageAI）消费测试
// ============================================================

function boss(x, y, hullAngle, turretAngle, stageAI, reloadT) {
  return { team: 'enemy', isBoss: true, x, y, hullAngle, turretAngle,
           reloadT: reloadT || 0, stats: { turretTurnRate: 2.2 }, hp: 500, maxHp: 500,
           traverseLimit: Math.PI, stageAI };
}

// --- hold 模式：复用友军消极防御语义（原地、射程内还击、不追击） ---
{
  // 距玩家 300 ≤ allyEngageRange(460)，炮塔已对准（atan2(0,+300)=0）、装填好 → 原地开火
  const bh = boss(700, 500, 0, 0, { mode: 'hold', params: {} });
  const rHold = aiDecideEnemy(bh, { player, hasLoS: () => true });
  ok(rHold.move === 0 && rHold.turn === 0 && rHold.fire === true,
     'Boss hold：射程内对准 → 原地还击（不追击）');
  ok(rHold.turretDesired !== undefined && Math.abs(rHold.turretDesired - 0) < 1e-9,
     'Boss hold：炮塔锁定玩家');
  ok(bh.aiState === 'hold', "Boss hold：aiState 置 'hold'");
  // 射程外（距玩家 600 > 460）：不动不开火
  const bhFar = boss(400, 500, Math.PI, Math.PI, { mode: 'hold', params: {} });
  const rHoldFar = aiDecideEnemy(bhFar, { player, hasLoS: () => true });
  ok(rHoldFar.move === 0 && rHoldFar.turn === 0 && rHoldFar.fire === false,
     'Boss hold：目标超出射程 → 静止不开火');
}

// --- skirmish 模式：保持 keepDist，过近倒车 / 达标停火；炮塔照常瞄准开火 ---
{
  // 默认 keepDist=640：dist 500 < 640 → move=-1 倒车拉开；车体朝向玩家（desired=0）
  const skClose = boss(500, 500, 0, 0, { mode: 'skirmish' }, 0);
  const rSk1 = aiDecideEnemy(skClose, { player, hasLoS: () => true });
  ok(rSk1.move === -1, 'Boss skirmish：dist(500) < keepDist(640) → 倒车拉开');
  ok(Math.abs(rSk1.turretDesired) < 1e-9 && rSk1.fire === true,
     'Boss skirmish：倒车同时炮塔照常瞄准开火');
  // dist 800 ≥ 640 → 停下开火
  const skFar = boss(200, 500, 0, 0, { mode: 'skirmish' }, 0);
  const rSk2 = aiDecideEnemy(skFar, { player, hasLoS: () => true });
  ok(rSk2.move === 0 && rSk2.fire === true,
     'Boss skirmish：dist(800) ≥ keepDist → 停下开火');
  // params.keepDist 覆盖默认值：keepDist=300 时 dist 400 ≥ 300 → 不再倒车
  const skOverride = boss(600, 500, Math.PI, Math.PI,
                          { mode: 'skirmish', params: { keepDist: 300 } }, 0);
  const rSk3 = aiDecideEnemy(skOverride, { player, hasLoS: () => true });
  ok(rSk3.move === 0, 'Boss skirmish：params.keepDist 覆盖生效（dist 400 ≥ 300 → 停）');
  // 视线遮挡 → 不开火但仍倒车
  const skBlocked = boss(500, 500, Math.PI, Math.PI, { mode: 'skirmish' }, 0);
  const rSk4 = aiDecideEnemy(skBlocked, { player, hasLoS: () => false });
  ok(rSk4.move === -1 && rSk4.fire === false,
     'Boss skirmish：无视线 → 不开火但机动照旧');
}

// --- charge 模式：显式默认激进接敌（等价基线主动行为） ---
{
  // dist 580 ∈ (520 engage, 700 trigger] 且已接战路径 → 前进接敌（与基线 veryFar 用例一致）
  const chg = boss(420, 500, Math.PI, Math.PI, { mode: 'charge', params: { keepDist: 0 } }, 0);
  const rCh = aiDecideEnemy(chg, { player, hasLoS: () => true });
  ok(rCh.move === 1, 'Boss charge：超出 engage 但触发内 → 激进接敌前进');
  // 对准+视线+装填好 → 开火
  const chgReady = boss(800, 500, Math.PI, 0, { mode: 'charge', params: {} }, 0);
  const rCh2 = aiDecideEnemy(chgReady, { player, hasLoS: () => true });
  ok(rCh2.fire === true, 'Boss charge：条件满足 → 开火');
}

// --- 校验：stageAI=null 的 Boss 具备 Boss 专属始终追击特征（防风筝：move=1，区别于普通敌） ---
{
  function mkPair(stageAI) {
    const plain = { team: 'enemy', x: 800, y: 500, hullAngle: Math.PI, turretAngle: 0,
                    reloadT: 0, stats: { turretTurnRate: 2.2 }, hp: 100, traverseLimit: Math.PI };
    const asB = Object.assign({}, plain);
    if (stageAI !== null) asB.isBoss = true;
    else { asB.isBoss = true; asB.stageAI = null; }
    return [plain, asB];
  }
  // Boss(stageAI=null) 防风筝：始终 move=1 推进
  const [p1, b1] = mkPair(null);
  const o1 = aiDecideEnemy(p1, { player, hasLoS: () => true });
  const o2 = aiDecideEnemy(b1, { player, hasLoS: () => true });
  ok(o2.move === 1 && b1.aiEngaged === true,
     'Boss 特征：stageAI=null 的 Boss 始终 move=1 追击且 aiEngaged 置位（防风筝）');
  ok(o1.fire === true && o2.fire === true, '回归基线自检：对准+视线+装填好 → fire=true');
  // 视线遮挡 search 分支下 Boss 同样保持推进
  const [p3, b3] = mkPair(null);
  const o5 = aiDecideEnemy(p3, { player, hasLoS: () => false });
  const o6 = aiDecideEnemy(b3, { player, hasLoS: () => false });
  ok(o6.move === 1,
     'Boss 特征：视线遮挡下 Boss 同样保持 move=1 推进');
}

// ============================================================
// #88：装填间隙随机侧摆（基线 patrol 态；普通敌与 Boss 均适用）
// ============================================================
console.log('--- #88：装填间隙侧摆 ---');
{
  const realRandom = Math.random;
  Math.random = () => 0.99;   // 受控随机：压制 peek/repos/daze
  // #M：机动层走独立 RNG 注入通道（_maneuverSetRng），此处固定抽 slant（前进类）
  // ——使本段只验证「装填期偏置」，不被机动模式的随机性污染。
  _maneuverSetRng(() => 0.30);
  // 场景：dist 1100（>engage 520、<defensive 阈值、flank 窗口外），实体 aiTriggerDist=1200 保持接战；
  // 装填前段：reloadT=3.5 > stats.reload(4) × 0.3(1.2)
  const sw = enemy(-100, 500, Math.PI, Math.PI, 3.5);
  sw.stats.reload = 4;
  sw.aiTriggerDist = 1200;
  const rsw = aiDecideEnemy(sw, { player, hasLoS: () => true, dt: 0.016 });
  ok(sw.aiState === 'patrol', '侧摆场景落在基线 patrol 态');
  // #M：普通敌人的装填期机动改由机动层承担（旧 sideSwing 仅留 Boss 路径）——
  // 断言「抽到非 direct 的机动 + 前进类机动被压为蠕行」，语义等价于旧侧摆的躲避机动，但更丰富。
  const nonDirect = sw._mv && sw._mv.mode !== 'direct';
  ok(nonDirect,
     `装填前段抽到侧向机动（mode=${sw._mv && sw._mv.mode}，非 direct 直冲）`);
  // 前进类机动（direct/slant/curve/arc）压为蠕行；retreat 为后撤，方向相反但同样有效
  if(sw._mv && sw._mv.mode === 'retreat'){
    ok(rsw.move === -1, `装填前段抽到后撤机动（move=${rsw.move}，反向拉开）`);
  } else {
    ok(rsw.move > 0 && rsw.move < 1, `装填前段前进微降至蠕行（move=${rsw.move}）`);
  }
  ok(Math.abs(rsw.turretDesired) < 1e-9 && rsw.fire === false, '炮塔照常锁玩家；装填中不开火');
  // 装填完成恢复常规：reloadT=0 → 前进满速（无 creep 压低）
  sw.reloadT = 0;
  const rDone = aiDecideEnemy(sw, { player, hasLoS: () => true, dt: 0.016 });
  ok(rDone.move === 1, `reloadT 归零恢复常规（move=${rDone.move}，无蠕行压低）`);
  // 装填后段（reloadT ≤ 时长×30%）：无 creep 压低（与常规表同权重的方向机动即可）
  const late = enemy(-100, 500, Math.PI, Math.PI, 1.0);
  late.stats.reload = 4;
  late.aiTriggerDist = 1200;
  const rLate = aiDecideEnemy(late, { player, hasLoS: () => true, dt: 0.016 });
  ok(rLate.move === 0 || rLate.move === 1,
     `装填后段（≤30%）无蠕行压低（move=${rLate.move} ∈ {0,1}）`);
  // Boss 基线同样侧摆转向，但防风筝 move=1 优先级更高
  const bsw = boss(-100, 500, Math.PI, 0, null, 3.5);
  bsw.stats.reload = 4;
  bsw.aiTriggerDist = 1200;
  const rb = aiDecideEnemy(bsw, { player, hasLoS: () => true, dt: 0.016 });
  ok(rb.move === 1 && Number.isFinite(bsw._swingTarget),
     'Boss 基线：旧 sideSwing 照常掷出，防风筝保持 move=1 推进');
  Math.random = realRandom;
  _maneuverSetRng(null);   // 还原机动层 RNG 为惰性 Math.random
}

// ============================================================
// #M：接战机动随机化（2026-10-01）——直线/斜线/曲线/弧线/后撤 + 随机短停
// ============================================================
console.log('--- #M：接战机动随机化 ---');
{
  const mcfg = RULES.ai.maneuver;
  ok(mcfg.enabled === true, '机动系统默认启用（RULES.ai.maneuver.enabled）');
  const modes = new Set();

  // 权重抽样：大量抽样式应覆盖全部 5 种机动类型（确认配置表无死权重）
  let seq = 0;
  const cyc = () => { const v = (seq % 97) / 97; seq++; return v; };
  for(let i = 0; i < 400; i++) modes.add(_maneuverRoll(cyc, mcfg).mode);
  ok(modes.size === 5, `5 种机动类型均可达（实测 ${modes.size} 种：${[...modes].join('/')}）`);

  // 偏角有界：slant/arc/curve 的起始偏角落在配置区间内
  let angleOk = true;
  seq = 0;
  for(let i = 0; i < 300; i++){
    const mv = _maneuverRoll(cyc, mcfg);
    const a = Math.abs(mv.angle);
    if(mv.mode === 'slant' && !(a >= mcfg.slantAngleMin - 1e-9 && a <= mcfg.slantAngleMax + 1e-9)) angleOk = false;
    if(mv.mode === 'arc' && !(a >= mcfg.arcAngleMin - 1e-9 && a <= mcfg.arcAngleMax + 1e-9)) angleOk = false;
    if(mv.mode === 'curve' && !(a >= mcfg.curveAngleMin - 1e-9 && a <= mcfg.curveAngleMax + 1e-9)) angleOk = false;
  }
  ok(angleOk, '偏角均落在 slant/arc/curve 各自的配置区间内');

  // curve 的 sweep 与起始偏角反号 ⇒ 偏角必然穿过 0（S 形回正，不会单向甩开）
  seq = 0;
  let curveOk = true;
  for(let i = 0; i < 200; i++){
    const mv = _maneuverRoll(cyc, mcfg);
    if(mv.mode === 'curve' && mv.sweep !== 0 && Math.sign(mv.sweep) === Math.sign(mv.angle)) curveOk = false;
  }
  ok(curveOk, 'curve 偏角渐变与起始偏角反号（S 形接近）');

  // 禁用开关：enabled=false 时完全退回旧直冲语义（回退路径可用）
  const disabled = _applyManeuver(enemy(0, 0, 0, 0, 0), _maneuverRoll(cyc, mcfg), 1 / 60, 0,
                                  Object.assign({}, mcfg, { enabled: false }), 1, false);
  ok(disabled.move === 1 && disabled.aimTolMul === 1, 'maneuver.enabled=false → 回退基准 move、容差无放宽');

  // 短停：holdChance=1 时脚本结束后必进短停，且短停期间 move=0（原地驻停但可开火）
  seq = 0;
  const holdCfg = Object.assign({}, mcfg, { holdChance: 1, reRollDist: 0, holdMin: 0.5, holdMax: 0.5 });
  const holdT = enemy(0, 0, 0, 0, 0);
  holdT._mv = _maneuverRoll(cyc, holdCfg);
  const hOut = _applyManeuver(holdT, holdT._mv, 1 / 60, 0, holdCfg, 1, false);
  ok(hOut.move === 0 && holdT._mv.hold === true, '脚本结束按概率进入短停（短停期间 move=0）');

  // 短停结束：给放宽的开火窗口并重掷新脚本（开火节奏错开的关键）
  holdT._mv.holdT = 0.001;
  const afterHold = _applyManeuver(holdT, holdT._mv, 1 / 60, 0, holdCfg, 1, false);
  ok(afterHold.aimTolMul > 1 && holdT._mv.hold === false,
     `短停结束 → 开火容差放宽 ×${afterHold.aimTolMul.toFixed(2)} 且重掷新脚本`);

  // 装填前段：前进被压为微速蠕行（承接 #88 侧摆的 move 微降语义）
  const creepT = enemy(0, 0, 0, 0, 3.5);
  creepT.stats.reload = 4;
  const creepMv = _maneuverRoll(() => 0.0, mcfg, false);   // rng=0 → 落在权重首项（direct，前进）
  const cOut = _applyManeuver(creepT, creepMv, 1 / 60, 0, mcfg, 1, true);
  ok(cOut.move > 0 && cOut.move < 1,
     `装填前段前进压为微速蠕行（move=${cOut.move} ∈ (0,1)）`);

  // 装填期权重偏置：direct 被压低 ⇒ 直冲占比显著低于常规表
  let gapDirect = 0, normalDirect = 0;
  for(let i = 0; i < 600; i++){
    if(_maneuverRoll(Math.random, mcfg, true).mode === 'direct') gapDirect++;
    if(_maneuverRoll(Math.random, mcfg, false).mode === 'direct') normalDirect++;
  }
  ok(gapDirect / 600 < normalDirect / 600,
     `装填期直冲占比下降（${(gapDirect/600*100).toFixed(1)}% < 常规 ${(normalDirect/600*100).toFixed(1)}%）`);

  // 集成：接战中的普通敌人按机动脚本输出（前进/转向/短停混杂，而非恒定直冲）
  // 注：#N1 起带内（dist ≤ 带外沿）驻停，故取样距离取**带外**以确保处于接近机动。
  let sawTurn = false, sawMove0 = false, sawMoveFwd = false;
  for(let i = 0; i < 200; i++){
    const e = enemy(280 + i, 500, Math.PI, Math.PI, 0);   // dist 720~919，均 > 带外沿 572
    e.aiTriggerDist = 1400;                               // 抬高触发距离以保持接战
    const r = aiDecideEnemy(e, { player, hasLoS: () => true, dt: 0.016 });
    if(r.turn !== 0) sawTurn = true;
    if(r.move === 0) sawMove0 = true;
    if(r.move > 0) sawMoveFwd = true;
  }
  ok(sawTurn && sawMove0 && sawMoveFwd,
     '集成：接战敌人输出含转向/短停/前进三类（轨迹与节奏非恒定）');

  // 脱离接战后脚本被清空 → 下次接战重新抽取（不留陈旧偏角）
  // 场景需「先接战、再脱离」：只有已分配过脚本的实体才有 _mv 可清。
  // 注：#N1 起机动层只在「需要移动（baseMove≠0）且为 press 角色」时生效，
  //     故用**带外距离**（dist > 带外沿）确保处于接近状态。
  const forget = enemy(300, 500, Math.PI, Math.PI, 0);   // dist 700 > 带外沿 572 → 接近并接战
  aiDecideEnemy(forget, { player, hasLoS: () => true, dt: 0.016 });
  ok(!!forget._mv, '接战且处于接近状态 → 分配机动脚本');
  forget.x = 0;                                        // dist 1000 > exitD 875 → 脱离接战
  aiDecideEnemy(forget, { player, hasLoS: () => true, dt: 0.016 });
  ok(forget._mv === null, '脱离接战 → 清空机动脚本（下次接战重新抽取）');

  // Boss 不吃机动层（保持「始终推进」角色语义）
  const bsManeuver = boss(-100, 500, Math.PI, 0, null, 0);
  bsManeuver.aiTriggerDist = 1200;
  aiDecideEnemy(bsManeuver, { player, hasLoS: () => true, dt: 0.016 });
  ok(bsManeuver._mv === undefined || bsManeuver._mv === null, 'Boss 不启用机动层（始终推进语义保留）');
}

// ============================================================
// #N：交战距离带（#N1）/ flank 侧翼站位重写（#N3）/ 分离力（#N4）/ 装填脱离（#N6）
// ============================================================
console.log('--- #N：交战带 / flank 站位 / 分离力 / 装填脱离 ---');
{
  const ncfg = RULES.ai;
  // 固定机动层随机源为 direct（rng=0 → 权重首项）：本段验证的是**交战带/角色**语义，
  // 不应被 #M 机动的随机模式（如 retreat）污染（否则「带外 → 接近」会随机变成后撤）。
  _maneuverSetRng(() => 0);

  // --- #N1 交战距离带：按类别分档 ---
  const bands = {};
  for(const cls of ['light', 'medium', 'heavy', 'spg']){
    bands[cls] = _engageBand({ hullLen: 40 }, ncfg, 520, cls);
  }
  ok(bands.light.max > bands.medium.max, `轻坦带外沿更远（light ${bands.light.max.toFixed(0)} > medium ${bands.medium.max.toFixed(0)}）`);
  ok(bands.heavy.max < bands.medium.max, `重坦带外沿更近（heavy ${bands.heavy.max.toFixed(0)} < medium ${bands.medium.max.toFixed(0)}）`);
  ok(bands.spg.max > bands.medium.max, `SPG 带外沿最远（${bands.spg.max.toFixed(0)}）`);
  ok(Object.values(bands).every(b => b.min < b.max), '各档 min < max（无死区）');

  // 带内下界受「车体尺度」兜底（退让距离不得小于车长）
  const shortBand = _engageBand({ hullLen: 200 }, ncfg, 520, 'heavy');
  ok(shortBand.min >= 200 * 2.2 - 1e-9, `带内下界不小于车体尺度兜底（min=${shortBand.min.toFixed(0)}）`);

  // 开关回退：enabled=false → 旧单点语义（min=closeRange, max=engage）
  const savedBand = ncfg.engageBand.enabled;
  ncfg.engageBand.enabled = false;
  const fb = _engageBand({ hullLen: 40 }, ncfg, 520, 'medium');
  ok(fb.min === ncfg.closeRange && fb.max === 520, `engageBand.enabled=false → 回退单点语义（${fb.min}/${fb.max}）`);
  ncfg.engageBand.enabled = savedBand;

  // 集成：带内驻停、带外接近、贴脸脱离（以 medium 档验证）
  const medBand = _engageBand({ hullLen: 40 }, ncfg, 520, 'medium');
  const inBand = enemy(1000 - Math.round((medBand.min + medBand.max) / 2), 500, Math.PI, Math.PI, 0);
  inBand.aiTriggerDist = 1400;
  const rIn = aiDecideEnemy(inBand, { player, hasLoS: () => true, dt: 0.016 });
  ok(rIn.move === 0, `带内 → 原地驻停（dist=${(medBand.min+medBand.max)/2|0}，move=${rIn.move}）`);

  const outBand = enemy(1000 - Math.round(medBand.max) - 200, 500, Math.PI, Math.PI, 0);
  outBand.aiTriggerDist = 1400;
  const rOut = aiDecideEnemy(outBand, { player, hasLoS: () => true, dt: 0.016 });
  ok(rOut.move === 1, `带外 → 接近（move=${rOut.move}）`);

  const tooNear = enemy(1000 - Math.round(medBand.min) + 40, 500, Math.PI, Math.PI, 0);
  tooNear.aiTriggerDist = 1400;
  const rNear = aiDecideEnemy(tooNear, { player, hasLoS: () => true, dt: 0.016 });
  ok(rNear.move === -1 || rNear.move === 1, `贴脸（<带内沿）→ 脱离/退让（move=${rNear.move}）`);

  // heavy 绝不后撤（P-46 moveLock 角色特性保留）
  const heavyNear = enemy(1000 - Math.round(bands.heavy.min) + 30, 500, Math.PI, Math.PI, 0);
  heavyNear.tankClass = 'heavy';
  heavyNear.heightClass = 'heavy';
  heavyNear.aiTriggerDist = 1400;
  const rHeavy = aiDecideEnemy(heavyNear, { player, hasLoS: () => true, dt: 0.016 });
  ok(rHeavy.move !== -1, `重坦绝不后撤（move=${rHeavy.move}，moveLock 语义保留）`);

  // --- #N3 flank 侧翼站位 ---
  const flankR = _flankRadius(medBand, ncfg.flankRewrite);
  const station = _flankStation(player, Math.PI, flankR, 1, ncfg.flankRewrite, 'e1');   // 敌人位于玩家左侧
  const stationDist = Math.hypot(station.x - player.x, station.y - player.y);
  ok(Math.abs(stationDist - flankR) < 1,
     `站位点落在玩家周围指定半径上（实测 ${stationDist.toFixed(1)} = ${flankR.toFixed(1)}）`);
  ok(stationDist > medBand.max,
     `站位半径(${stationDist.toFixed(0)}) > 交战带外沿(${medBand.max.toFixed(0)}) ⇒ 绕行不进入带内侧`);
  // 站位点相对「玩家→敌人」连线形成侧向夹角（不是正对方向）
  const enemyBearing = Math.PI;                                    // 敌人位于玩家左侧（方位角 π）
  const stBearing = Math.atan2(station.y - player.y, station.x - player.x);
  let angSep = Math.abs(angDiff(stBearing, enemyBearing));
  ok(angSep >= ncfg.flankRewrite.sectorMin - 1e-6 && angSep <= ncfg.flankRewrite.sectorMax + 1e-6,
     `站位点位于扇区角内（实测 ${angSep.toFixed(2)} rad ∈ [${ncfg.flankRewrite.sectorMin}, ${ncfg.flankRewrite.sectorMax}]）`);
  // 同一实体稳定（不逐帧抖动）
  const station2 = _flankStation(player, Math.PI, flankR, 1, ncfg.flankRewrite, 'e1');
  ok(station.x === station2.x && station.y === station2.y, '同实体站位点稳定（不逐帧抖动）');
  // 左右两侧站位不同（避免全部挤同一侧）
  const stationL = _flankStation(player, Math.PI, flankR, -1, ncfg.flankRewrite, 'e1');
  ok(Math.abs(stationL.y - station.y) > 1, '左右侧站位分属不同方位（避免同侧拥挤）');

  // 集成：flank 角色朝站位点机动（而非直冲玩家）
  const flanker = enemy(400, 500, 0, Math.PI, 0);   // 位于玩家左侧，车体朝 +x（正对玩家）
  flanker.aiRole = 'flank';
  flanker.aiTriggerDist = 1400;
  const rFlank = aiDecideEnemy(flanker, { player, hasLoS: () => true, dt: 0.016 });
  ok(rFlank.move === 1 && rFlank.turn !== 0,
     `flank 角色朝侧翼站位机动（turn=${rFlank.turn}，非直冲）`);
  ok(Math.abs(rFlank.turretDesired) < 1e-9, 'flank 绕行中炮塔仍锁定玩家');

  // --- #N4 群体分离力 ---
  const solo = enemy(700, 500, Math.PI, Math.PI, 0);
  const sepSolo = _separationTurn(solo, { enemies: [solo], player: player }, 0);
  ok(sepSolo === 0, '无邻近同伴 → 无分离偏置');
  // 同伴挤在同一处 → 产生侧向偏置
  const crowded = enemy(700, 500, Math.PI, Math.PI, 0);
  const mate = enemy(720, 510, Math.PI, Math.PI, 0);
  const sepCrowd = _separationTurn(crowded, { enemies: [crowded, mate], player: player }, 0);
  ok(Math.abs(sepCrowd) === 1, `邻近拥挤 → 产生侧向分离偏置（${sepCrowd}）`);

  // --- #N6 装填脱离 ---
  const cover = { x: 700, y: 500, w: 80, h: 80, tier: 'full', hp: 100 };
  const seeker = { x: 400, y: 500, hullLen: 40, hullAngle: 0, turretAngle: 0, hp: 100, maxHp: 100 };
  const spot = _retreatReloadSpot(seeker, player, 600, { covers: [cover] }, ncfg);
  ok(!!spot, '装填期且距离合适 → 找到掩体背弹面');
  if(spot){
    // 背弹面应位于掩体「背离玩家」的一侧（玩家在右侧 ⇒ 目标点 x 小于掩体中心）
    ok(spot.x < cover.x, `背弹面位于背离玩家一侧（spot.x=${spot.x.toFixed(0)} < cover.x=${cover.x}）`);
  }
  ok(_retreatReloadSpot(seeker, player, 600, { covers: [] }, ncfg) === null, '无掩体 → 返回 null（静默落回原行为）');
  ok(_retreatReloadSpot(seeker, player, 100, { covers: [cover] }, ncfg) === null, '距离过近（来不及退）→ 返回 null');
  ok(_retreatReloadSpot(seeker, player, 2000, { covers: [cover] }, ncfg) === null, '距离过远（没必要退）→ 返回 null');

  // 回归锚点（#N 缺陷防复发）：flank 站位半径必须 ≥ 交战带外沿（radiusRatio ≥ 1）。
  // 沿革：初版 radiusRatio=0.95（以 engage 为基准）< 带外沿 ⇒ flank 绕行把敌人带进交战带
  //   内侧，与 press 名额交替时形成「棘轮内移」逐次逼近玩家（探针实测 700→395→273px）。
  ok(ncfg.flankRewrite.radiusRatio >= 1,
     `flank 站位半径比例(${ncfg.flankRewrite.radiusRatio}) ≥ 1（相对交战带外沿，不进入带内侧）`);
  // 各档次均满足「站位半径 > 带外沿」
  let allOutside = true;
  for(const cls of ['light', 'medium', 'heavy', 'spg']){
    const b = _engageBand({ hullLen: 40 }, ncfg, 520, cls);
    if(_flankRadius(b, ncfg.flankRewrite) <= b.max) allOutside = false;
  }
  ok(allOutside, '各类别（light/medium/heavy/spg）的 flank 站位半径均 > 自身交战带外沿');

  _maneuverSetRng(null);   // 还原机动层随机源
}

// ===== 2026-09-14：受击警觉（任意来源） + AI 避水绕行 =====

// D) Boss hold 受击破防：hold 阶段（原地防守）被任何伤害来源命中 → 立即解除 hold 转入常规接战
{
  const bh = boss(700, 500, 0, 0, { mode: 'hold', params: {} }, 0);
  ok(bh.stageAI && bh.stageAI.mode === 'hold', '前置：Boss 处于 hold 阶段');
  ok(alertEntity(bh, 800, 500) === true, 'alertEntity 对 Boss 生效（返回 true）');
  ok(bh.stageAI === null, 'Boss hold 受击 → stageAI 清空（解除 hold，2026-09-14 定案）');
  ok(bh.aiEngaged === true, 'Boss 受击后 aiEngaged 置位');
  const dAfter = aiDecideEnemy(bh, { player, hasLoS: () => false });
  ok(dAfter.move === 1 && bh.aiState === 'search', '破 hold 后 → search 态朝玩家推进');
}

// E) applyWaterAvoidance：水面在前方且一侧有干地 → 转向绕行；全湿 → 原地不动
{
  const W = require('../js/tank_ai.js');
  const base = { move: 1, turn: 0, turretDesired: 0, fire: false };
  // 全湿分支：水潭中央（400×400，探点 140px 全部落水）→ 停驶防自杀
  const water = { x: 0, y: 0, w: 400, h: 400, angle: 0, tier: 'water' };
  const t2 = { team: 'enemy', x: 0, y: 0, hullAngle: 0, hp: 100, stats: { turretTurnRate: 2.2 }, traverseLimit: Math.PI };
  const out2 = W.applyWaterAvoidance(t2, Object.assign({}, base), { covers: [water] });
  ok(out2.move === 0, '前向+双侧全湿（水潭中央）→ 原地不动（move=0）');
  // 干地分支：前路通畅 → 零干扰（turn=0, move 保持 1）
  const t3 = { team: 'enemy', x: -500, y: 0, hullAngle: 0, hp: 100, stats: { turretTurnRate: 2.2 }, traverseLimit: Math.PI };
  const out3 = W.applyWaterAvoidance(t3, Object.assign({}, base), { covers: [water] });
  ok(out3.turn === 0 && out3.move === 1, '前方干地 → 不干扰原决策（turn=0, move=1）');
  // 定向绕行：窄河（OBB 偏移使左探点入水、右探点干地）→ 固定右转
  const river = { x: 20, y: 0, w: 120, h: 400, angle: 0, tier: 'river' };
  const t4 = { team: 'enemy', x: 0, y: -260, hullAngle: Math.PI / 2, hp: 100, stats: { turretTurnRate: 2.2 }, traverseLimit: Math.PI };
  const out4 = W.applyWaterAvoidance(t4, Object.assign({}, base), { covers: [river] });
  ok(out4.turn === 1, '左侧湿/右侧干（河岸偏移）→ 固定向右绕行（turn=1）');
}

// ================= #E7/#E8（2026-09-20）反应延迟 + engage 状态传播 =================
{
  const cfg = aiTierProfile ? RULES.ai : RULES.ai;   // #E7：直接读机制唯一配置源
  // 反应延迟：距离越远/越接近触发边界越慢；档位 reactionMul 降低延迟
  // （B 档① 附带修正 2026-09-23：原为**单次采样**对比，而 _reactionSeconds 内含 ±25% 抖动
  //  且用 Math.random（不可注入）⇒ near/far 真值差仅 26%，单次采样约 1/4 概率误判——
  //  实测 npm test 连续 2/3 次停在本题。改为 25 次采样均值（标准误 ≈ 抖动/√25 ≈ 5% ≪ 真值差），
  //  断言语义不变，只消除采样噪声。）
  const avgOf = (fn, n) => { let acc = 0; for (let i = 0; i < n; i++) acc += fn(); return acc / n; };
  const sNear = avgOf(() => _reactionSeconds({}, cfg, {}, 100, 700), 25);
  const sFar = avgOf(() => _reactionSeconds({}, cfg, {}, 690, 700), 25);
  ok(sFar >= sNear, `#E7 反应延迟随距离增大（near=${sNear.toFixed(2)} ≤ far=${sFar.toFixed(2)}，25 次均值）`);
  const sElite = avgOf(() => _reactionSeconds({}, cfg, { reactionMul: 0.65 }, 350, 700), 25);
  const sBase = avgOf(() => _reactionSeconds({}, cfg, {}, 350, 700), 25);
  ok(sElite < sBase, `#E7 高 AI 档位反应更快（elite=${sElite.toFixed(2)} < base=${sBase.toFixed(2)}，25 次均值）`);
  ok(sBase >= 0.2, '#E7 反应延迟有下限（不小于 0.2s）');

  // 反应延迟只对「正式对局生成的敌军」生效（aiReactEnabled）
  const raw = enemy(800, 500, Math.PI, 0, 0);
  aiDecideEnemy(raw, { player, hasLoS: () => true });
  ok(!(raw.aiReactT > 0), '#E7 未打 aiReactEnabled 标的实体无反应延迟（bench/单测语义保留）');
  const spawned = enemy(800, 500, Math.PI, 0, 0);
  spawned.aiReactEnabled = true;
  const dReact = aiDecideEnemy(spawned, { player, hasLoS: () => true, dt: 0.05 });
  ok(spawned.aiReactT > 0 && dReact.fire === false && dReact.move === 0 && spawned.aiState === 'react',
     '#E7 生成期敌军首次接战进入 react 态（不移动、不开火，只转炮塔）');
  // 受击惊醒：剩余反应延迟 ×reactionAlertMul
  const before = spawned.aiReactT;
  alertEntity(spawned, player.x, player.y);
  ok(spawned.aiReactT < before, '#E7 受击惊醒缩短剩余反应延迟（不瞬发但更快）');
  // 延迟走完 → 恢复正常行动
  for (let i = 0; i < 40; i++) aiDecideEnemy(spawned, { player, hasLoS: () => true, dt: 0.1 });
  ok(!(spawned.aiReactT > 0), '#E7 反应延迟走完后清零');

  // engage 传播：首个接战者唤醒半径内友邻（含 1 跳级联）
  const src = enemy(800, 500, Math.PI, 0, 0);
  src.aiReactEnabled = true;
  const near1 = enemy(1000, 500, Math.PI, 0, 0);
  near1.aiReactEnabled = true;
  const near2 = enemy(1200, 500, Math.PI, 0, 0);
  const far1 = enemy(2400, 500, Math.PI, 0, 0);
  const list = [src, near1, near2, far1];
  const realRandom = Math.random;
  Math.random = () => 0;   // 传播概率判定恒通过（确定性）
  const n = _propagateEngage(src, { player, enemies: list }, cfg);
  Math.random = realRandom;
  ok(n >= 2 && near1.aiEngaged === true && near2.aiEngaged === true,
     `#E8 engage 传播：半径内友邻接战（传播 ${n} 个，含级联）`);
  ok(far1.aiEngaged !== true, '#E8 传播半径外的友军不被唤醒（不整图连锁）');

  // aiDecideEnemy 在首次接战时自动触发传播（ctx.enemies 注入）
  const s2 = enemy(800, 500, Math.PI, 0, 0);
  s2.aiReactEnabled = true;
  const buddy = enemy(900, 500, Math.PI, 0, 0);
  Math.random = () => 0;
  aiDecideEnemy(s2, { player, hasLoS: () => true, enemies: [s2, buddy], dt: 0.05 });
  Math.random = realRandom;
  ok(buddy.aiEngaged === true, '#E8 接战决策内联触发 engage 传播（无需外部调用）');
}

if(fails === 0) console.log('test-ai: 完成所有检查，全部通过');
else console.error('test-ai: ' + fails + ' 项失败');
process.exit(fails === 0 ? 0 : 1);
