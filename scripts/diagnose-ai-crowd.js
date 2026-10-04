'use strict';

// diagnose-ai-crowd.js — #N 批次效果量化探针（诊断脚本，不在 npm test 链内）。
// 运行：node scripts/diagnose-ai-crowd.js
//
// 目的：把「敌人全部尝试贴近玩家 / 一拥而上」的主观反馈变成**可比较的数字**，
//   而不是仅凭单元断言宣称改善。对比"改前配置"与"改后配置"两组参数下，
//   同一初始态势在 30 秒内的敌军行为指标。
//
// 方法（决策层探针，不含碰撞/掩体——那属于物理层，会掩盖决策层差异）：
//   1. 造 6 辆敌军环形分布在玩家周围 700px（全部已接战）；
//   2. 每帧：updateSquad（分配角色）→ aiDecide（决策）→ 最小运动积分（按 turn/move 推位置）；
//   3. 累计指标（固定随机种子，可复现）。
//
// 指标：
//   pressAvg   — 平均「主动压上」角色数（改前无此概念，恒等于存活数）
//   closeAvg   — 平均「处于近身圈（≤ engageRange×0.9）」的敌人数 ⇒ **越低越好（不贴脸）**
//   nearDist   — 平均「最近敌人距离」 ⇒ 越大说明没被贴死
//   fanout     — 方位角圆形标准差（rad）：敌军在玩家四周的**方位集中度**。
//        ⇒ 改前全体压上、均匀包围（fanout 高）；改后只有少数车辆压上、其余驻守/绕行
//          （fanout 低）= **不再全方位同时压上**，玩家不必同时面对所有方向（好事）。

const U = require('../js/tank_utils.js');
global.angDiff = U.angDiff;
global.norm = U.norm;
global.TAU = U.TAU;
const RULES = require('../js/tank_rules.js').RULES;
global.RULES = RULES;
const AI = require('../js/tank_ai.js');
const SQ = require('../js/tank_ai_squad.js');

const PLAYER = { id: 'player', team: 'player', x: 2000, y: 1500, hp: 1000, maxHp: 1000 };

function makeFoe(i, ang, radius){
  return {
    id: 'e' + i,
    team: 'enemy',
    x: PLAYER.x + Math.cos(ang) * radius,
    y: PLAYER.y + Math.sin(ang) * radius,
    hullAngle: ang + Math.PI,          // 初始朝向玩家
    turretAngle: ang + Math.PI,
    speed: 0,
    hp: 100, maxHp: 100,
    reloadT: 0,
    hullLen: 44, hullWid: 30,
    stats: { maxSpeed: 60, turnRate: 1.6, reload: 3, turretTurnRate: 1.8 },
    traverseLimit: Math.PI,
    aiTriggerDist: 2000,               // 全部处于接战状态
    tankClass: 'medium',
    aiEngaged: true
  };
}

// 最小运动积分：只有 turn/move 两个自由度（与 driveTank 的输入契约一致），
// 不引入掩体/碰撞/加速度——本探针只关心决策层的收敛趋势。
function integrate(t, out, dt){
  if(out.turn) t.hullAngle += out.turn * t.stats.turnRate * dt;
  const mv = out.move || 0;
  if(mv !== 0){
    const spd = t.stats.maxSpeed * RULES.speed.pxFactor * RULES.speed.effMul * mv;
    t.x += Math.cos(t.hullAngle) * spd * dt;
    t.y += Math.sin(t.hullAngle) * spd * dt;
  }
  // 炮塔朝期望方向旋转
  if(Number.isFinite(out.turretDesired)){
    const d = angDiff(out.turretDesired, t.turretAngle);
    const maxStep = t.stats.turretTurnRate * dt;
    t.turretAngle = norm(t.turretAngle + Math.max(-maxStep, Math.min(maxStep, d)));
  }
}

// 圆形标准差：把方位角映射到单位圆求合成向量长度 R，fanout = sqrt(-2·ln(R))（rad）。
// 全部同向 → R≈1 → fanout≈0；均匀分布 → R≈0 → fanout 大。
function fanout(angles){
  if(angles.length < 2) return 0;
  let sx = 0, sy = 0;
  for(const a of angles){ sx += Math.cos(a); sy += Math.sin(a); }
  sx /= angles.length; sy /= angles.length;
  const R = Math.hypot(sx, sy);
  if(R >= 1) return 0;
  if(R <= 1e-6) return Math.PI;        // 完全均匀
  return Math.sqrt(-2 * Math.log(R));
}

function run(label, configOverride){
  const saved = {};
  for(const k of Object.keys(configOverride)){
    saved[k] = RULES.ai[k];
    RULES.ai[k] = configOverride[k];
  }
  SQ.resetSquad();
  // 固定随机源：可复现（否则两次运行结果不可比——实测改前近身圈 0.28/2.03 波动）
  const realRandom = Math.random;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  Math.random = rnd;
  AI._maneuverSetRng(rnd);

  const N = 6;
  const foes = [];
  // 起始半径 700px：位于交战带外沿（medium ≈572）之外但够近，使敌军能在时长内真正逼近，
  // 从而测出「贴脸/拥挤」差异（起始 900px 时 10 秒内根本到不了近身圈，指标恒为 0）。
  for(let i = 0; i < N; i++) foes.push(makeFoe(i, (i / N) * Math.PI * 2, 700));

  const dt = 1 / 60;
  const FRAMES = 1800;                 // 30 秒（足够从 700px 逼近到交战带）
  let pressSum = 0, closeSum = 0, nearSum = 0, fanSum = 0, samples = 0;
  const engage = RULES.ai.engageRange;

  for(let f = 0; f < FRAMES; f++){
    const alive = foes.filter(e => e.hp > 0);
    const ctx = {
      player: PLAYER,
      enemies: alive,
      hasLoS: () => true,
      covers: [],
      dt: dt,
      diff: 0
    };
    SQ.updateSquad(ctx);
    for(const e of alive){
      const out = AI.aiDecideEnemy(e, ctx);
      integrate(e, out, dt);
      // 轨迹追踪（CROWD_TRACE=1）：记录每辆车首次移动的帧号/角色/距离
      if(process.env.CROWD_TRACE && out.move && e._firstMove === undefined){
        e._firstMove = f;
        console.log(`      [trace] ${e.id} 首次移动 f=${f} role=${e.aiRole} move=${out.move} ` +
                    `dist=${Math.hypot(e.x - PLAYER.x, e.y - PLAYER.y).toFixed(0)} ` +
                    `flankTgt=${e._flankTarget ? 'y' : 'n'}`);
      }
    }
    // 采样（跳过前 1 秒的初始接近阶段）
    if(f > 60){
      samples++;
      pressSum += alive.filter(e => e.aiRole === 'press' || e.aiRole === undefined).length;
      closeSum += alive.filter(e => Math.hypot(e.x - PLAYER.x, e.y - PLAYER.y) <= engage * 0.9).length;
      let near = Infinity;
      const angles = [];
      for(const e of alive){
        const dx = e.x - PLAYER.x, dy = e.y - PLAYER.y;
        const d = Math.hypot(dx, dy);
        if(d < near) near = d;
        angles.push(Math.atan2(dy, dx));
      }
      nearSum += (near === Infinity ? 0 : near);
      fanSum += fanout(angles);
    }
  }

  for(const k of Object.keys(saved)) RULES.ai[k] = saved[k];
  Math.random = realRandom;
  AI._maneuverSetRng(null);

  // 明细：每辆敌人的最终距离/角色状态（定位「谁贴到了近身圈」）
  if(process.env.CROWD_DETAIL){
    console.log('    -- 末帧明细 --');
    for(const e of foes){
      const d = Math.hypot(e.x - PLAYER.x, e.y - PLAYER.y);
      console.log(`      ${e.id} role=${e.aiRole || '-'} dist=${d.toFixed(0)} mv=${e._mv ? e._mv.mode : '-'} state=${e.aiState}`);
    }
  }

  const res = {
    pressAvg: pressSum / samples,
    closeAvg: closeSum / samples,
    nearDist: nearSum / samples,
    fanout: fanSum / samples
  };
  console.log(`  ${label}`);
  console.log(`    press 角色数（平均） : ${res.pressAvg.toFixed(2)} / 6`);
  console.log(`    近身圈内敌人数（平均）: ${res.closeAvg.toFixed(2)}  ← 越低越好（不贴脸）`);
  console.log(`    最近敌人距离（平均）  : ${res.nearDist.toFixed(0)} px  ← 越大越好`);
  console.log(`    方位散布 fanout       : ${res.fanout.toFixed(2)} rad`);
  return res;
}

console.log('=== #N 敌军拥挤度对比探针（决策层，6 辆环形 700px 起始，30 秒）===');
console.log('说明：press=主动压上角色数；近身圈=距玩家 ≤ engageRange×0.9；');
console.log('      fanout=方位角圆形标准差（越大越均匀包围，越小越集中在少数方位）。');
console.log('');

// 改前配置：单点 engage + 无分工 + 旧 flank + 无机动层
const before = run('【改前】单点 engage / 无分工 / 无机动', {
  engageBand: { enabled: false },
  squad: { enabled: false },
  maneuver: { enabled: false },
  flankRewrite: { enabled: false }
});

console.log('');
// 改后配置（现行口径）
const after = run('【改后】交战带 / 攻守分工 / 侧翼站位 / 机动随机化', {});

console.log('');
console.log('=== 对比 ===');
const d = (a, b) => (b === 0 ? 'n/a' : ((a - b) / b * 100).toFixed(0) + '%');
console.log(`  近身圈内敌人数：${before.closeAvg.toFixed(2)} → ${after.closeAvg.toFixed(2)}  (${d(after.closeAvg, before.closeAvg)})`);
console.log(`  最近敌人距离　：${before.nearDist.toFixed(0)} → ${after.nearDist.toFixed(0)} px  (${d(after.nearDist, before.nearDist)})`);
console.log(`  压上名额　　　：${before.pressAvg.toFixed(2)} → ${after.pressAvg.toFixed(2)}  (${d(after.pressAvg, before.pressAvg)})`);
