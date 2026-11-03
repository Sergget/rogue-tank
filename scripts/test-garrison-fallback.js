'use strict';
// test-garrison-fallback.js — P2-G 守军语义兜底回归（js/tank_encounter.js 纯逻辑段）
//
// WHY（PLAN §2.8.3，2026-11-01 契约裁定 v2）：
//   守军语义 = 波次敌人出生**不预写** aiEngaged / lastKnownPlayerPos，靠「距离 ≤ aiTriggerDist
//   且 LoS」自然点亮。前置门探针 `tmp/measure-garrison-probe.cjs`（EXIT=0）已实测
//   玩家静止 60s ⇒ **0/3 激活**（camoMul=0.625 ⇒ 有效触发距离 556px）⇒ 软锁成立。
//   ⇒ 用户裁定采纳方案 1（前哨车恒接战）+ 2（超时兜底注入）+ 4（出口侧解耦），不动 3。
//   本文件锁的是 **方案 2（超时兜底）与方案 1（前哨车编成）的纯逻辑层**。
//
// 锁定四条（含三条负向，对应 DONE 要求「≥4 条含 ≥2 条负向」）：
//   N1 **负向**：`garrisonMode=false`（且兜底秒数 0）⇒ 守军判定恒不注入 —— 零回归总门
//   N2 **负向**：未到超时前，守军保持未激活（不提前点亮）
//   P1 **正向**：超时后注入方位（aiEngaged=true + lastKnownPlayerPos + alertLevel=3）
//   N3 **负向**：前锋恒接战 —— vanguard 角色不受守军语义影响；且**末波强制 0 前锋**；
//       且 `aheadOffsetPx` 负值被钳（绝不 -x 背后刷怪，§4.187 历史教训）
//
// 计时器**走注入时钟**：now 由调用方给，不读 Date.now / performance.now ⇒ 同 seed 可重放。

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
const ENC = require('../js/tank_encounter.js');

const R = RULES_MOD.RULES;
const CFG = R.encounter;

let fails = 0;
function ok(cond, label) {
  if (cond) { console.log('  ✓ ' + label); }
  else { console.log('  ✗ ' + label); fails++; }
}
function eq(a, b, label) { ok(a === b, `${label}（期望 ${b}，实到 ${a}）`); }
function section(t) { console.log('\n== ' + t + ' =='); }

/** 造一辆守军语义单位：不写 aiEngaged / lastKnownPlayerPos（与探针 mkGarrisonFoe 同口径）。 */
function mkFoe(id, x, y) {
  return { id: id, team: 'enemy', x: x, y: y, hp: 100, aiEngaged: false };
}

// ---------------------------------------------------------------- ⓿ 键契约（v2）
section('⓿ RULES.encounter 守军三键契约 v2（Lead 2026-11-01 裁定）');
eq(CFG.garrisonMode, false, '⓿ garrisonMode 默认 false（零回归总门）');
eq(CFG.garrisonFallbackSeconds, 0,
  '⓿ garrisonFallbackSeconds 默认 0（关闭态；20s 是标定目标值，待 measure-encounter 后置）');
ok(CFG.garrisonVanguard && typeof CFG.garrisonVanguard === 'object' && !Array.isArray(CFG.garrisonVanguard),
  '⓿ garrisonVanguard 是对象（非标量 —— 前出距离属数值口径，必须落 RULES）');
eq(CFG.garrisonVanguard.count, 2, '⓿ garrisonVanguard.count = 2 [PLACEHOLDER]');
eq(CFG.garrisonVanguard.aheadOffsetPx, 260, '⓿ garrisonVanguard.aheadOffsetPx = 260 [PLACEHOLDER]');
eq(CFG.garrisonVanguard.vanguard, undefined,
  '⓿ 负向：不存在 `vanguard` 顶层键（Lead 上一版契约已作废，防漂移回潮）');

// ---------------------------------------------------------------- ❶ 导出形态
section('❶ 纯逻辑导出形态（浏览器全局 / Node require 双通道）');
eq(typeof ENC.garrisonFallbackTrack, 'function', '❶ garrisonFallbackTrack 已导出');
eq(typeof ENC.garrisonFallbackDue, 'function', '❶ garrisonFallbackDue 已导出');
eq(typeof ENC.garrisonFallbackApply, 'function', '❶ garrisonFallbackApply 已导出');
eq(typeof ENC.garrisonAssignVanguards, 'function', '❶ garrisonAssignVanguards 已导出');

// ---------------------------------------------------------------- ❷ N1 负向：关闭态零差异
section('❷ N1 负向：兜底关闭（seconds=0）⇒ 恒不注入（零回归）');
{
  const book = new Map();
  const e = mkFoe('eN1', 1600, 400);
  ok(ENC.garrisonFallbackTrack(book, e, { now: 0 }), '❷ 登记成功（t=0ms）');
  // 即便过去 1 小时，关闭态也不注入
  ok(!ENC.garrisonFallbackDue(e, { now: 3600 * 1000, seconds: 0, book: book }),
    '❷ 负向：seconds=0 且已过 3600s ⇒ 仍不注入（默认关闭态，无 gameplay 差异）');
  ok(!ENC.garrisonFallbackDue(e, { now: 3600 * 1000, seconds: -5, book: book }),
    '❷ 负向：seconds 为负 ⇒ 不注入（非法值不猜）');
  ok(!ENC.garrisonFallbackDue(e, { now: 3600 * 1000, seconds: NaN, book: book }),
    '❷ 负向：seconds 为 NaN ⇒ 不注入');
  eq(e.aiEngaged, false, '❷ 负向：实体 aiEngaged 保持 false（未被写脏）');
  eq(e.lastKnownPlayerPos, undefined, '❷ 负向：实体未被预写 lastKnownPlayerPos');
}

// ---------------------------------------------------------------- ❸ N2 负向 + P1 正向：超时前后
section('❸ N2 负向 / P1 正向：超时前保持未激活，超时后注入玩家方位');
{
  const SEC = 20;
  const book = new Map();
  const e = mkFoe('eFB', 1600, 400);
  ENC.garrisonFallbackTrack(book, e, { now: 1000 });

  // --- N2：未到点不注入（取 19.999s，贴近边界但仍未到）
  ok(!ENC.garrisonFallbackDue(e, { now: 1000 + SEC * 1000 - 1, seconds: SEC, book: book }),
    `❸ 负向：入场后 ${SEC - 0.001}s（< ${SEC}s）⇒ 守军保持未激活`);
  eq(e.aiEngaged, false, '❸ 负向：超时前 aiEngaged 仍为 false');
  eq(e.lastKnownPlayerPos, undefined, '❸ 负向：超时前无 lastKnownPlayerPos');

  // --- P1：到点即注入（取恰好 SEC 秒，边界含等号）
  ok(ENC.garrisonFallbackDue(e, { now: 1000 + SEC * 1000, seconds: SEC, book: book }),
    `❸ 正向：恰好 ${SEC}s ⇒ 判定到期`);
  const wrote = ENC.garrisonFallbackApply(e, { now: 1000 + SEC * 1000, playerPos: { x: 700, y: 432 } });
  ok(wrote, '❸ 正向：garrisonFallbackApply 返回 true（确实写入）');
  eq(e.aiEngaged, true, '❸ 正向：注入后 aiEngaged = true');
  eq(e.alertLevel, 3, '❸ 正向：alertLevel = 3（对齐 alertEntity 语义）');
  ok(e.lastKnownPlayerPos && e.lastKnownPlayerPos.x === 700 && e.lastKnownPlayerPos.y === 432,
    '❸ 正向：lastKnownPlayerPos = 玩家真实方位');

  // --- P1 追加（Lead 2026-11-01 裁定 2）：`_threatDir` 必须补写
  //   它是 tank_ai.js:1081 的「炮塔优先指向」字段；缺失 ⇒ 炮塔要等 search 推进到记忆点
  //   才转，慢一拍 ⇒ 「被发现那一刻炮塔立刻转过来」的演出丢失。
  ok(Number.isFinite(e._threatDir), '❸ 正向：_threatDir 已补写且为有限数字（非 NaN）');
  // 类型必须是**弧度角**而非单位向量：tank_ai.js:1917 写 Math.atan2(...)，
  //   消费端 tank_ai.js:1083 直接拿它跟 turretAngle 做 angDiff。
  ok(typeof e._threatDir === 'number',
    '❸ 正向：_threatDir 是数字（弧度角），不是 {x,y} 单位向量（照抄代码而非措辞）');
  // 指向玩家：单位 (1600,400)，玩家 (700,432) ⇒ atan2(32, -900)
  const wantDir = Math.atan2(432 - 400, 700 - 1600);
  ok(Math.abs(e._threatDir - wantDir) < 1e-9,
    `❸ 正向：_threatDir 指向玩家（期望 ${wantDir.toFixed(6)}，实到 ${e._threatDir.toFixed(6)}）`);
  const memDir = Math.atan2(e.lastKnownPlayerPos.y - 400, e.lastKnownPlayerPos.x - 1600);
  ok(Math.abs(e._threatDir - memDir) < 1e-9,
    '❸ 正向：_threatDir 与 lastKnownPlayerPos 同向（语义一致，不会左右互搏）');
  ok(e._threatDir >= -Math.PI - 1e-9 && e._threatDir <= Math.PI + 1e-9,
    '❸ 正向：_threatDir 落在 [-π, π]（atan2 值域，可直接喂 angDiff）');
}

// ---------------------------------------------------------------- ❸b 断言自身有效性
section('❸b 断言自身有效性：未注入 ⇒ _threatDir 为 undefined（防空绿）');
{
  const book = new Map();
  const e = mkFoe('eNV', 1600, 400);
  ENC.garrisonFallbackTrack(book, e, { now: 0 });
  eq(e._threatDir, undefined, '❸b 未注入 ⇒ _threatDir 为 undefined（断言非空绿）');
  ok(!ENC.garrisonFallbackDue(e, { now: 19 * 1000, seconds: 20, book: book }),
    '❸b 构造成功：19s 时仍未到期');
}

// ---------------------------------------------------------------- ❸c 坐标缺失防御
section('❸c 防御：单位无坐标 ⇒ 仍注入但不写 NaN 的 _threatDir');
{
  const bare = { id: 'eBX', hp: 50, aiEngaged: false };      // 缺 x/y
  const wrote2 = ENC.garrisonFallbackApply(bare, { playerPos: { x: 10, y: 20 } });
  ok(wrote2, '❸c 无坐标也完成注入（aiEngaged / lastKnownPlayerPos 照写）');
  eq(bare.aiEngaged, true, '❸c aiEngaged = true');
  ok(bare.lastKnownPlayerPos && bare.lastKnownPlayerPos.x === 10, '❸c lastKnownPlayerPos 正确');
  eq(bare._threatDir, undefined,
    '❸c 负向：坐标缺失 ⇒ 不写 _threatDir（宁可不转炮塔，也不写 NaN 静默失效）');
}

// ---------------------------------------------------------------- ❹ N3 幂等 + 已点亮不注入
section('❹ N3 负向：注入幂等 / 已点亮单位不兜底（不擦除既有接战态）');
{
  const book = new Map();
  const e = mkFoe('eID', 1600, 400);
  ENC.garrisonFallbackTrack(book, e, { now: 0 });
  ENC.garrisonFallbackApply(e, { now: 20 * 1000, playerPos: { x: 100, y: 200 } });
  ok(!ENC.garrisonFallbackDue(e, { now: 60 * 1000, seconds: 20, book: book }),
    '❹ 负向：已注入过 ⇒ 不再重复注入（fired 幂等）');

  const live = mkFoe('eLV', 1500, 300);
  live.aiEngaged = true;                       // 已被自然点亮（距离+LoS 通道生效）
  live.lastKnownPlayerPos = { x: 650, y: 400 };
  ENC.garrisonFallbackTrack(book, live, { now: 0 });
  ok(!ENC.garrisonFallbackDue(live, { now: 60 * 1000, seconds: 20, book: book }),
    '❹ 负向：已 aiEngaged ⇒ 不兜底（不覆盖既有 lastKnownPlayerPos）');
  ok(live.lastKnownPlayerPos.x === 650 && live.lastKnownPlayerPos.y === 400,
    '❹ 负向：既有 lastKnownPlayerPos 未被兜底逻辑改写');

  const dead = mkFoe('eDD', 1500, 300);
  dead.hp = 0;
  ENC.garrisonFallbackTrack(book, dead, { now: 0 });
  ok(!ENC.garrisonFallbackDue(dead, { now: 60 * 1000, seconds: 20, book: book }),
    '❹ 负向：已阵亡单位 ⇒ 不注入');
}

// ---------------------------------------------------------------- ❺ 时钟纪律
section('❺ 时钟纪律：无注入时钟 / 未登记 ⇒ 拒绝判定（不用挂钟兜底）');
{
  const e = mkFoe('eCK', 1600, 400);
  ok(!ENC.garrisonFallbackDue(e, { seconds: 20, book: new Map() }),
    '❺ 负向：未登记 ⇒ 不注入（无出生时刻就不猜）');
  const book = new Map();
  ENC.garrisonFallbackTrack(book, e, { now: 0 });
  ok(!ENC.garrisonFallbackDue(e, { now: NaN, seconds: 20, book: book }),
    '❺ 负向：now 为 NaN ⇒ 不注入');
  ok(!ENC.garrisonFallbackTrack(book, e, { now: 5000 }),
    '❺ 负向：重复登记返回 false 且**不覆盖**出生时刻（幂等，不会无限推迟兜底）');
  eq(book.get(e.id).bornAtMs, 0, '❺ 幂等：bornAtMs 仍为首次登记的 0');
}

// ---------------------------------------------------------------- ❻ 前锋编成
section('❻ 前哨车（vanguard）编成：恒接战 + 前出只走 +x + 末波强制 0');
{
  const vg = { count: 2, aheadOffsetPx: 260 };
  const units = [
    { cls: 'medium', x: 800, y: 300, hullAngle: 0, bearing: 0 },
    { cls: 'medium', x: 820, y: 340, hullAngle: 0, bearing: 0 },
    { cls: 'heavy', x: 840, y: 380, hullAngle: 0, bearing: 0 },
  ];

  // --- 正向：前 2 辆 = vanguard，第 3 辆 = garrison
  const a = ENC.garrisonAssignVanguards(units, vg, { isLastWave: false });
  eq(a.length, 3, '❻ 单位数不变');
  eq(a[0].role, 'vanguard', '❻ 第 1 辆 = vanguard');
  eq(a[1].role, 'vanguard', '❻ 第 2 辆 = vanguard');
  eq(a[2].role, 'garrison', '❻ 第 3 辆 = garrison（守军语义）');
  eq(a[0].x, 1060, '❻ 前锋 1 前出 260px（+x）');
  eq(a[1].x, 1080, '❻ 前锋 2 前出 260px（+x）');
  eq(a[2].x, 840, '❻ 驻防单位 x 不动');

  // --- N3 负向：末波强制 0 前锋（裁定⑩：其后无防线可出前锋）
  const last = ENC.garrisonAssignVanguards(units, vg, { isLastWave: true });
  eq(last.filter((u) => u.role === 'vanguard').length, 0,
    '❻ 负向：末波 0 辆前锋（全守军化）');
  eq(last.filter((u) => u.role === 'garrison').length, 3,
    '❻ 负向：末波 3 辆全是 garrison');

  // --- N3 负向：aheadOffsetPx 负值 ⇒ 钳到 0，绝不往 -x 背后刷怪（§4.187）
  const back = ENC.garrisonAssignVanguards(units, { count: 2, aheadOffsetPx: -400 }, { isLastWave: false });
  eq(back[0].x, 800, '❻ 负向：aheadOffsetPx 为负 ⇒ 钳到 0（x 不前出也不后退）');
  eq(back[1].x, 820, '❻ 负向：第 2 辆同样不后退（绝不在玩家背后刷怪）');

  // --- 边界：前锋数 > 本波总数 ⇒ 取 min，不越界不补车
  const few = ENC.garrisonAssignVanguards([units[0]], vg, { isLastWave: false });
  eq(few.length, 1, '❻ 边界：只 1 辆时单位数不膨胀');
  eq(few[0].role, 'vanguard', '❻ 边界：唯一 1 辆仍为前锋（min(1,2)=1）');

  // --- 边界：前出后不出界（maxX = world.w − margin；margin 缺省 = SPAWN_EDGE_MARGIN=40）
  const EDGE = ENC.SPAWN_EDGE_MARGIN;
  const clamped = ENC.garrisonAssignVanguards(
    [{ cls: 'medium', x: 2200, y: 300, hullAngle: 0, bearing: 0 }],
    { count: 2, aheadOffsetPx: 260 },
    { isLastWave: false, world: { w: 2400, h: 1400 } }
  );
  eq(clamped[0].x, 2400 - EDGE, `❻ 边界：前出被钳到 world.w − ${EDGE}（不贴边生成）`);

  // 缺省 margin 时同样留 40px（不得因「忘了传」就把车顶到世界边缘）
  const noMargin = ENC.garrisonAssignVanguards(
    [{ cls: 'medium', x: 2200, y: 300, hullAngle: 0, bearing: 0 }],
    { count: 2, aheadOffsetPx: 260 },
    { isLastWave: false, world: { w: 2400, h: 1400 } }
  );
  eq(noMargin[0].x, 2400 - EDGE, '❻ 边界：未传 margin 时仍留 40px 边距（缺省安全）');

  // 不传 world ⇒ 不钳（保持纯计算语义，调用方自行保证在场内）
  const noWorld = ENC.garrisonAssignVanguards(
    [{ cls: 'medium', x: 800, y: 300, hullAngle: 0, bearing: 0 }],
    { count: 2, aheadOffsetPx: 260 },
    { isLastWave: false }
  );
  eq(noWorld[0].x, 1060, '❻ 边界：未传 world ⇒ 不钳（+260 原样）');

  // --- 纯函数：不改入参（保护页面侧 pending 数组不被就地污染）
  const snapshot = JSON.stringify(units);
  ENC.garrisonAssignVanguards(units, vg, { isLastWave: false });
  eq(JSON.stringify(units), snapshot, '❻ 纯函数：入参数组未被就地修改');
}

// ---------------------------------------------------------------- ❼ 确定性（注入时钟重放）
section('❼ 同 seed 确定性：注入时钟序列相同 ⇒ 判定序列逐项一致');
{
  const SEC = 20;
  function replay(seed) {
    const book = new Map();
    const foes = [mkFoe('a' + seed, 1600, 400), mkFoe('b' + seed, 1600, 700)];
    const log = [];
    for (const f of foes) ENC.garrisonFallbackTrack(book, f, { now: 0 });
    // ⚠ 帧→秒换算：60fps 下 20s = 1200 帧（不是 120 帧 —— 120 帧只有 2s，
    //   循环根本跑不到超时点，会让「各注入一次」空绿、让边界断言在空数组上假通过）。
    //   多跑 60 帧（到 21s）确保越过边界，而不是停在边界上赌浮点比较。
    for (let frame = 0; frame <= 1260; frame++) {
      const now = frame * (1000 / 60);                 // 注入时钟：与 seed 无关
      for (const f of foes) {
        if (ENC.garrisonFallbackDue(f, { now: now, seconds: SEC, book: book })) {
          ENC.garrisonFallbackApply(f, { now: now, playerPos: { x: 700, y: 432 } });
          log.push(`${f.id}@${now.toFixed(3)}ms`);
        }
      }
    }
    return log;
  }
  const l1 = replay(12345);
  const l2 = replay(12345);
  eq(JSON.stringify(l1), JSON.stringify(l2), '❼ 同 seed 两次重放判定序列逐项一致');
  ok(l1.length === 2, `❼ 两辆守军各注入一次（实到 ${l1.length} 条）`);
  // 到期时刻 ≈ 20000ms（第 1200 帧 = 20000ms，恰在边界上）
  ok(l1.every((s) => Math.abs(Number(s.split('@')[1].replace('ms', '')) - SEC * 1000) <= (1000 / 60) + 1e-6),
    '❼ 注入时刻落在 20s 边界的一帧内（计时器走注入时钟，非挂钟）');
}

// ---------------------------------------------------------------- ❽ 哨兵：无时钟不静默塞 0
section('❽ 哨兵：非法输入一律拒绝（不静默塞默认值制造假兜底）');
{
  eq(ENC.garrisonFallbackTrack(null, { id: 1 }, { now: 0 }), false, '❽ 负向：book 非法 ⇒ 不记账');
  eq(ENC.garrisonFallbackTrack(new Map(), null, { now: 0 }), false, '❽ 负向：实体为空 ⇒ 不记账');
  eq(ENC.garrisonFallbackTrack(new Map(), { id: 1 }, { now: NaN }), false,
    '❽ 负向：now 非法 ⇒ 不记账（宁可不兜底，也不把出生时刻写成 0 制造假到期）');
  eq(ENC.garrisonFallbackApply({ id: 1, hp: 10 }, { playerPos: null }), false,
    '❽ 负向：无玩家方位 ⇒ 不写入（不写 NaN 坐标）');
}

console.log(`\n${fails === 0 ? '全部通过' : fails + ' 项失败'}：test-garrison-fallback.js`);
process.exit(fails === 0 ? 0 : 1);
