// test-ai.js — 敌人/友军 AI 决策测试（Node 端，Pure Logic）
// 运行：node scripts/test-ai.js
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require('../js/tank_utils.js');
global.angDiff = U.angDiff;
global.norm = U.norm;
global.TAU = U.TAU;
const { aiDecideEnemy, aiDecideAlly, aiDecide, aiUpdateStateTimer, alertEntity, propagateAlert, aiTierProfile } = require('../js/tank_ai.js');

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
ok(blocked.aiState === 'search' && d6.move === 1, '距离达标但无视线 → search 态推进');
const reloading = enemy(800, 500, Math.PI, 0, 1.0);
const d7 = aiDecideEnemy(reloading, { player, hasLoS: () => true });
ok(d7.fire === false, '装填中 → 不开火');

// 4b) 滞回防抖：进入阈值 700，脱离阈值 = 700 × 1.25 = 875。
//     进入后拉到 dist 800（>700 但 ≤875）→ 保持接战继续靠近；>875 → 才回落 patrol
const hystE = enemy(300, 500, Math.PI, Math.PI, 0);   // dist 700 → 进入接战
aiDecideEnemy(hystE, { player, hasLoS: () => true });
ok(hystE.aiEngaged === true, '进入阈值上 → 接战标记置位');
hystE.x = 200;                                        // dist 800，滞回带内
const dh1 = aiDecideEnemy(hystE, { player, hasLoS: () => true });
ok(hystE.aiEngaged === true && dh1.move === 1, '滞回带内不脱离（仍主动靠近）');
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
{
  const saveFD = RULES.ai.flankDist;
  const fl = enemy(420, 500, Math.PI, Math.PI, 0);   // dist 580 ∈ (engage 520, flankMinDist×1.5=600)
  const rDefault = aiDecideEnemy(fl, { player, hasLoS: () => true });
  ok(fl.aiState === 'flank' && rDefault.move === 1, 'flank 态触发（距离窗口内）');
  RULES.ai.flankDist = -saveFD;   // 取负 → 侧翼目标点翻到对侧 → 车体转向翻转（证明消费 cfg）
  const rFlip = aiDecideEnemy(fl, { player, hasLoS: () => true });
  ok(rFlip.turn === -rDefault.turn, `flankDist 读 cfg：取负后转向翻转（${rDefault.turn}→${rFlip.turn}）`);
  RULES.ai.flankDist = saveFD;
}

// F) aiTierProfile 档位表 + engageMul/aimTolMul 消费
{
  ok(aiTierProfile(2).stunResist === true && aiTierProfile(1).engageMul > 1, 'tierProfiles 档位定义可读');
  ok(Object.keys(aiTierProfile(99)).length === 0 && Object.keys(aiTierProfile(undefined)).length === 0,
    'tier 越界/缺省回退空 profile（tier 0 基础行为）');
  // engageMul：dist 580 —— tier0 接战距离 520（超距 → flank 靠近）；tier2 接战距离 520×1.2=624（已接战）
  const te0 = enemy(420, 500, Math.PI, 0, 0);
  aiDecideEnemy(te0, { player, hasLoS: () => true });
  ok(te0.aiState === 'flank' , 'tier0：580 > engage 520 → flank 机动');
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

if(fails === 0) console.log('test-ai: 完成所有检查，全部通过');
else console.error('test-ai: ' + fails + ' 项失败');
process.exit(fails === 0 ? 0 : 1);
