'use strict';

// test-ai-detour.js — 绕障状态机回归（MS1 / B2，2026-10-29）
//
// 锁五类东西：
//   ① 侧别种子同源 —— `tank_ai._detourSideSeed` 与 `tank_move.tankSideSeed` 对同一批 id 逐位一致
//                     （内联副本是为 Node 单测兜底，漂移了侧别就会在两个环境里不一致）；
//   ② 关停即旧语义 —— `RULES.ai.detour.enabled=false` 时不产生任何 `_detour`；
//   ③ 负向口径     —— 探测说「不挡」时不触发（不许无条件绕行）；
//   ④ 承诺期       —— 触发后 `commitSeconds` 内不被清除、move 被接管为前进；
//   ⑤ 防打转       —— 绕满 `maxCommitSeconds` 仍不通 ⇒ 换一侧重试（`_detourBias` 翻转）。
//
// 运行：node scripts/test-ai-detour.js

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
global.angDiff = U.angDiff;
global.norm = U.norm;
global.TAU = U.TAU;
global.simNow = U.simNow;
global.setSimNow = U.setSimNow;
global.advanceSimNow = U.advanceSimNow;

const AI = require('../js/tank_ai.js');
const MOVE = require('../js/tank_move.js');
const RULES = RULES_MOD.RULES;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

// ---------- 夹具 ----------
const player = { team: 'player', x: 1000, y: 500, hp: 100 };

function enemy(x, y, hullAngle) {
  return {
    id: 'enemy_detour_1', team: 'enemy', x, y,
    hullAngle, hullLen: 64, hullWid: 38,
    turretAngle: hullAngle, reloadT: 0, hp: 100,
    stats: { turretTurnRate: 2.2, maxSpeed: 120 }, traverseLimit: Math.PI
  };
}

// 可控探测桩：blocked 由外部变量决定，其余字段给合法值
let probeBlocked = false;
let probeCalls = 0;
const probeStub = () => {
  probeCalls++;
  return { blocked: probeBlocked, tier: probeBlocked ? 'wall' : null, nx: -1, ny: 0, hitDist: 30 };
};

// 可控视线桩（2026-10-30 los 退出判据配套）：绕行中「重新看见目标 ⇒ 立即退出」，
//   ⑥ 段要测「绕满 6s 换侧」就必须让 los 保持 false（否则一进 detour 就被 los 退出抢先）。
let probeLos = true;

const DT = 1 / 60;
const baseCtx = () => ({
  player, entities: [], enemies: [player], covers: [],
  hasLoS: () => probeLos, probeMoveBlocked: probeStub, dt: DT
});

// 关掉机动层与分离力，让 out.move 完全由交战带决定（测试要的是确定性，不是调参）
const savedManeuver = RULES.ai.maneuver && RULES.ai.maneuver.enabled;
const savedSeparation = RULES.ai.separation && RULES.ai.separation.enabled;
function quiet(){ RULES.ai.maneuver.enabled = false; if (RULES.ai.separation) RULES.ai.separation.enabled = false; }
function restore(){ RULES.ai.maneuver.enabled = savedManeuver; if (RULES.ai.separation) RULES.ai.separation.enabled = savedSeparation; }

// ============================================================
section('① 侧别种子：tank_ai 的内联副本与 tank_move.tankSideSeed 逐位一致');

{
  const ids = ['enemy_w0_0', 'enemy_w0_1', 'enemy_w0_2', 'boss_fortress', 'a', '', 'x'.repeat(40), '敌人一号'];
  const mism = ids.filter(id => AI._detourSideSeed(id) !== MOVE.tankSideSeed(id));
  ok(mism.length === 0, `${ids.length} 个 id 两处实现结果一致` + (mism.length ? `（不一致：${mism.join(', ')}）` : ''));
  const nums = [0, 7, 42, -13, 12345];
  const numMism = nums.filter(n => AI._detourSideSeed(n) !== MOVE.tankSideSeed(n));
  ok(numMism.length === 0, `${nums.length} 个数值 id 两处实现结果一致`);
  ok(AI._detourSideSeed('enemy_w0_0') !== undefined && Number.isInteger(AI._detourSideSeed('enemy_w0_0')),
    '返回值是非负整数（可安全取 %2 定侧）');
}

// ============================================================
section('② 关停即旧语义：enabled=false 时不产生 _detour');

{
  quiet();
  const savedEnabled = RULES.ai.detour.enabled;
  RULES.ai.detour.enabled = false;
  probeBlocked = true;
  const t = enemy(400, 500, 0);          // 距玩家 600 > band.max(572) ⇒ baseMove=1
  const ctx = baseCtx();
  for (let i = 0; i < 30; i++) AI.aiDecideEnemy(t, ctx);
  ok(!t._detour, 'enabled=false：连续 30 帧探测全挡也不进绕障');
  ok(t.aiState !== 'detour', `enabled=false：aiState 从未变成 detour（实到 ${t.aiState}）`);
  RULES.ai.detour.enabled = savedEnabled;
  restore();
}

// ============================================================
section('③ 负向口径：探测说「不挡」时不触发');

{
  // 2026-10-30：goalLos=true（看得见）时**连探测都不调**（新守卫在探测之前）。
  //   「探测不挡不触发」的正向路径只能在失视场景下测（先激活再失视，同 ④）。
  quiet();
  probeBlocked = false;
  probeLos = false;
  const t = enemy(600, 500, 0);
  const ctx = baseCtx();
  probeLos = true;
  AI.aiDecideEnemy(t, ctx);            // 激活
  t.lastKnownPlayerPos = { x: player.x, y: player.y };
  probeLos = false;                    // 失视 ⇒ search 分支
  for (let i = 0; i < 30; i++) AI.aiDecideEnemy(t, ctx);
  ok(!t._detour, '失视 + 探测不挡：连续 30 帧不进绕障（不是无条件绕行）');
  ok(probeCalls > 0, `对照非空转：探测确实被调用（${probeCalls} 次）`);
  // 新守卫的反向对照：看得见时探测零调用（省掉热路径开销）
  probeLos = true;
  const before = probeCalls;
  for (let i = 0; i < 10; i++) AI.aiDecideEnemy(t, ctx);
  ok(probeCalls === before, '看得见目标 ⇒ 探测零调用（goalLos 守卫在探测之前）');
  restore();
}

// ============================================================
section('④ 触发与承诺期：挡就绕，且承诺期内不被清除');

{
  // 2026-10-30 语义更新：goalLos=true（看得见目标）⇒ **不触发绕行**（能看见就不需要绕，
  //   band.max 驻停射击即可）。绕行只对「看不见且前方堵」的 search/主路径失视场景生效，
  //   故本段先激活再切失视（与 ⑥ 同款顺序）。
  quiet();
  probeBlocked = true;
  probeLos = true;
  const t = enemy(600, 500, 0);
  const ctx = baseCtx();
  AI.aiDecideEnemy(t, ctx);            // 激活
  t.lastKnownPlayerPos = { x: player.x, y: player.y };
  probeLos = false;                    // 失视 ⇒ search 分支
  const first = AI.aiDecideEnemy(t, ctx);
  ok(!!t._detour, '探测命中 ⇒ 进入绕障状态');
  ok(t.aiState === 'detour', `aiState 标记为 detour（实到 ${t.aiState}）`);
  ok(first.move > 0, `绕障段保持前进（move=${first.move}）`);
  ok(t._detour.side === 1 || t._detour.side === -1, `侧别取自 ±1（实到 ${t._detour.side}）`);

  const commitFrames = Math.round(RULES.ai.detour.commitSeconds / DT);
  let clearedEarly = -1;
  for (let i = 1; i <= commitFrames - 1; i++) {
    AI.aiDecideEnemy(t, ctx);
    if (!t._detour) { clearedEarly = i; break; }
  }
  ok(clearedEarly === -1,
    `承诺期 ${RULES.ai.detour.commitSeconds}s（${commitFrames} 帧）内不被清除`
    + (clearedEarly >= 0 ? `（第 ${clearedEarly} 帧就清了）` : ''));

  // 承诺期到点仍被挡 ⇒ 续绕（不回到直冲）
  for (let i = 0; i < 10; i++) AI.aiDecideEnemy(t, ctx);
  ok(!!t._detour, '承诺期到点仍被挡 ⇒ 续绕（没有回到直冲）');
  restore();
}

// ============================================================
section('⑤ 驻停不接管：out.move<=0 时不触发绕障');

{
  quiet();
  probeBlocked = true;
  // B3 2026-10-29：medium band = [218, 338] ⇒ 带内距离用 300（500 已是带外）
  const t = enemy(700, 500, 0);          // 距玩家 300 ∈ [218, 338] ⇒ baseMove=0
  const ctx = baseCtx();
  const before = probeCalls;
  const out = AI.aiDecideEnemy(t, ctx);
  ok(out.move === 0, `带内驻停（move=${out.move}）`);
  ok(!t._detour, '驻停时不进入绕障（后撤/驻停必须保持确定性）');
  ok(probeCalls === before, '驻停帧不调用探测（省掉热路径开销）');
  restore();
}

// ============================================================
section('⑥ 防打转：绕满 maxCommitSeconds 仍不通 ⇒ 换一侧重试');

{
  quiet();
  probeBlocked = true;
  // 激活顺序：先 los=true 激活（los=false 且无记忆 ⇒ patrol 不激活），再切 false 走 search。
  probeLos = true;
  const t = enemy(600, 500, 0);   // dist 400（camo 有效触发 ~519 内）
  const ctx = baseCtx();
  AI.aiDecideEnemy(t, ctx);
  probeLos = false;   // 绕行中「重新看见 ⇒ 退出」判据会让本用例提前结束，必须保持失视
  AI.aiDecideEnemy(t, ctx);
  const firstSide = t._detour.side;
  const totalFrames = Math.ceil((RULES.ai.detour.maxCommitSeconds + 0.5) / DT);
  let flipped = false;
  for (let i = 0; i < totalFrames; i++) {
    AI.aiDecideEnemy(t, ctx);
    if (t._detour && t._detour.side === -firstSide) { flipped = true; break; }
    if (!t._detour && (t._detourBias || 1) === -1) { flipped = true; break; }
  }
  ok(flipped, `绕满 ${RULES.ai.detour.maxCommitSeconds}s 后侧别翻转（首次 side=${firstSide}）`);
  ok((t._detourBias || 1) === -1, `_detourBias 已翻到 -1（实到 ${t._detourBias}）`);
  probeLos = true;
  restore();
}

// ============================================================
section('⑥b los 恢复退出：绕行中重新看见目标 ⇒ 立即退出（2026-10-30 新增）');

{
  quiet();
  probeBlocked = true;
  probeLos = true;
  const t = enemy(600, 500, 0);
  const ctx = baseCtx();
  AI.aiDecideEnemy(t, ctx);      // 先激活
  // 模拟实机 intel：敌人见过玩家 ⇒ lastKnownPlayerPos 非空（否则 los=false 且无记忆
  // 会让敌人直接失去接战回 patrol，走不到 search 分支）
  t.lastKnownPlayerPos = { x: player.x, y: player.y };
  probeLos = false;              // 再失视 ⇒ 走 search 分支
  AI.aiDecideEnemy(t, ctx);
  ok(!!t._detour, '进入绕障');
  // 中途 los 恢复（敌人绕到了能看到目标的位置）
  probeLos = true;
  AI.aiDecideEnemy(t, ctx);
  ok(!t._detour, 'los 恢复 ⇒ 立即退出绕行（「绕过去」= 重新进入交战，不是为了通畅）');
  probeLos = true;
  restore();
}

// ============================================================
// 收尾：还原 RULES，避免污染同进程内的其它用例
restore();
probeBlocked = false;
console.log(`\n=== test-ai-detour: ${fails === 0 ? 'ALL PASS' : fails + ' FAILED'} ===`);
if (fails > 0) process.exitCode = 1;
