'use strict';

// test-squad.js — #N2 攻守分工协调器 + #N5 视口外威胁提示 单元测试。
// 覆盖：名额计算（难度/上限/少量敌人收敛）、候选评分排序、角色分配互斥与节流、
// 门控（hold 射界）、威胁提示筛选与排序、开关回退。

const U = require('../js/tank_utils.js');
global.angDiff = U.angDiff;
global.norm = U.norm;
global.TAU = U.TAU;
const RULES = require('../js/tank_rules.js').RULES;
global.RULES = RULES;                 // tank_ai_squad.js 经全局 RULES 读取配置
const S = require('../js/tank_ai_squad.js');

let fail = 0;
function ok(cond, label){
  if(cond) console.log('  ✓ ' + label);
  else { console.log('  ✗ ' + label); fail++; }
}

const player = { team: 'player', x: 1000, y: 500, hp: 100 };
function foe(id, x, y, hp, maxHp){
  return { id: id, team: 'enemy', x: x, y: y, hp: hp === undefined ? 100 : hp,
           maxHp: maxHp === undefined ? 100 : maxHp, turretAngle: 0, aiEngaged: true };
}

// ============================================================
console.log('--- #N2 名额计算 ---');
{
  const cfg = RULES.ai.squad;
  ok(cfg && cfg.enabled === true, 'RULES.ai.squad 已定义且默认启用');
  const s0 = S.pressSlotsFor(cfg, 0, 10);
  const s1 = S.pressSlotsFor(cfg, 1, 10);
  ok(s0 === cfg.pressSlotsBase, `难度 0 → 名额 = 基础 ${s0}`);
  ok(s1 >= s0, `难度升高名额不减（${s0} → ${s1}）`);
  ok(s1 <= cfg.pressSlotsMax, `名额不超硬上限 ${cfg.pressSlotsMax}（实测 ${s1}）`);
  ok(S.pressSlotsFor(cfg, 1, 1) === 1, '存活 1 辆 → 名额收敛为 1（不制造无意义 hold）');
  ok(S.pressSlotsFor(cfg, 1, 2) === 2, '存活数 ≤ 名额 → 全员 press');
}

// ============================================================
console.log('--- #N2 角色分配 ---');
{
  S.resetSquad();
  const cfg = RULES.ai.squad;
  const enemies = [foe('a', 900, 500), foe('b', 1200, 500), foe('c', 1000, 900), foe('d', 100, 100)];
  const stat = S.updateSquad({ enemies: enemies, player: player, hasLoS: () => true, dt: 0.016, diff: 0 });
  ok(stat.press === stat.pressSlots, `press 数 = 名额（${stat.press} / ${stat.pressSlots}）`);
  ok(stat.press + stat.flank + stat.hold === enemies.length, '三种角色覆盖全部存活敌人（互斥且不遗漏）');
  ok(enemies.every(e => e.aiRole === 'press' || e.aiRole === 'flank' || e.aiRole === 'hold'),
     '每辆敌人都被写入合法角色');

  // 最近的敌人应拿到 press 名额（评分以距离为主）
  const near = enemies.find(e => e.id === 'a');   // dist 100，最近
  ok(near.aiRole === 'press', `最近的敌人优先拿 press（id=a，role=${near.aiRole}）`);

  // 节流：间隔内重复调用不改变角色分配
  const before = enemies.map(e => e.id + ':' + e.aiRole).join(',');
  S.updateSquad({ enemies: enemies, player: player, hasLoS: () => true, dt: 0.016, diff: 0 });
  const after = enemies.map(e => e.id + ':' + e.aiRole).join(',');
  ok(before === after, 'reassignInterval 内角色稳定（不逐帧横跳）');

  // 存活数变化 → 重新分配（节点换血）
  const fewer = [foe('x', 950, 500)];
  S.updateSquad({ enemies: fewer, player: player, hasLoS: () => true, dt: 0.016, diff: 0 });
  ok(fewer[0].aiRole === 'press', '敌人集合换血后重新分配（单辆 → press）');
}

// ============================================================
console.log('--- #N2 开关回退 ---');
{
  const cfg = RULES.ai.squad;
  const realEnabled = cfg.enabled;
  cfg.enabled = false;
  const enemies = [foe('a', 900, 500), foe('b', 1200, 500), foe('c', 1000, 900)];
  const stat = S.updateSquad({ enemies: enemies, player: player, hasLoS: () => true, dt: 0.016, diff: 0 });
  ok(enemies.every(e => e.aiRole === 'press'), 'squad.enabled=false → 全员 press（回退旧行为）');
  ok(stat.hold === 0 && stat.flank === 0, '回退时无 hold/flank 角色');
  cfg.enabled = realEnabled;
}

// ============================================================
console.log('--- #N2 hold 射界门控 ---');
{
  const cfg = RULES.ai.squad;
  // 对准玩家（敌在左，玩家在右 → 期望朝向 0）
  const aimed = foe('h1', 400, 500); aimed.turretAngle = 0;
  const g1 = S.holdGate(aimed, 600, 0.12, player);
  ok(g1.fire === true, 'hold：距离内且对准 → 开火');
  const far = foe('h2', 0, 500); far.turretAngle = 0;
  const g2 = S.holdGate(far, cfg.holdFireMaxDist + 10, 0.12, player);
  ok(g2.fire === false, 'hold：超出 holdFireMaxDist → 纯待机不开火');
  const off = foe('h3', 400, 500); off.turretAngle = Math.PI / 2;   // 瞄准方向偏 90°
  const g3 = S.holdGate(off, 600, 0.12, player);
  ok(g3.fire === false, 'hold：未对准（偏差远超放宽容差）→ 不开火');
}

// ============================================================
console.log('--- #N5 视口外威胁提示 ---');
{
  const vb = { minX: 500, minY: 300, maxX: 1500, maxY: 700 };
  const inView = foe('v1', 1000, 500);          // 视口内
  const offNear = foe('v2', 1700, 500);         // 视口右外，dist 700
  const offFar = foe('v3', 2500, 500);          // 远，超出可开火距离
  const idle = foe('v4', 1700, 900); idle.aiEngaged = false;   // 未接战
  const list = S.threatIndicators(player, [inView, offNear, offFar, idle], vb, { maxCount: 6 });

  ok(list.length === 1, `仅提示「已接战 + 视口外 + 可开火距离」者（实测 ${list.length} 条）`);
  ok(list[0].e.id === 'v2', '提示对象为视口外的接战敌人（v2）');
  ok(Math.abs(list[0].angle - 0) < 1e-9, '方位角指向来敌方向（右侧 → 0）');

  // 排序：近者优先，且受 maxCount 限制（10 辆全部落在可开火距离内）
  const many = [];
  for(let i = 0; i < 10; i++) many.push(foe('m' + i, 1600 + i * 4, 500));   // dist 600~636 < 728
  const capped = S.threatIndicators(player, many, vb, { maxCount: 3 });
  ok(capped.length === 3, `maxCount 限制生效（实测 ${capped.length} 条）`);
  ok(capped.length >= 3 && capped[0].dist <= capped[1].dist && capped[1].dist <= capped[2].dist,
     '近者优先排序');

  // 无视口信息（vb 为 null）→ 不做视口剔除（只按接战 + 距离）
  const noVb = S.threatIndicators(player, [inView, offNear], null, {});
  ok(noVb.length === 2, '无视口信息时不剔除（调用方自行保证）');

  ok(S.threatIndicators(null, [offNear], vb, {}).length === 0, 'player 缺失 → 空结果（不抛错）');
  ok(S.threatIndicators(player, [], vb, {}).length === 0, '空敌人表 → 空结果');
}

console.log('');
if(fail){ console.log(`test-squad: ${fail} 项失败`); process.exit(1); }
console.log('test-squad: 完成所有检查，全部通过');
