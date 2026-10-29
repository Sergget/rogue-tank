'use strict';

// test-ai-press.js — MS1 压迫探针的回归（§4.164 B0）
//
// 本批**不改任何行为**，所以这里一条断言都不许写「敌人已经压上来了」。
// 只锁四类恒真不变量：
//   ① 确定性   —— 同 seed 两次跑出的逐帧摘要完全一致（探针本身必须可信）；
//   ② 数值卫生 —— 全程无 NaN/Infinity 写进坐标或速度；
//   ③ 负向口径 —— **实体不是地形**：正前方只站一辆车时，行进判定必须为「未阻挡」
//                  （§4.160 拿 `spawnBlockedWhy` 当行进判定、把实体自身算成障碍，误判了一整轮）；
//   ④ 碰撞口径 —— 碰撞推出量只在真碰撞时出现：无掩体空场恒为 0，有穿透处必有推出量，
//                  且残留穿透明一次解算即可归零（不是真穿模）。
//
// 数据工具是 `scripts/measure-press.cjs`（同一份 simulate），本文件不复制场景代码——
// 两边各写一套必然漂移，那正是前三次「探针说 A、现场是 B」的来路。
//
// 运行：node scripts/test-ai-press.js

const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;        // tank_cover 顶层读 RULES.coverTiers，必须先于它 require
global.TAU = U.TAU;

const PRESS = require('./measure-press.cjs');
const CV = require('../js/tank_cover.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

const SCENE = PRESS.SCENE;
const EXPECT_FRAMES = Math.round(SCENE.seconds / SCENE.dt);

// ============================================================
section('① 确定性：同 seed 两次逐帧摘要必须完全一致');
const runA = PRESS.simulate({});
const runB = PRESS.simulate({});

ok(runA.digest === runB.digest,
  `同 seed 两次逐帧摘要一致（${runA.frames.length} 帧 × ${runA.summary.perFoe.length} 车，${runA.digest.length} 字符）`);
ok(runA.digest.split('\n').length === runA.frames.length && runA.frames.length === EXPECT_FRAMES,
  `摘要逐帧对齐：${runA.frames.length} 行 = ${EXPECT_FRAMES} 帧（${SCENE.seconds}s / dt=${SCENE.dt.toFixed(5)}）`);
ok(runA.summary.minDist === runB.summary.minDist
  && runA.summary.radialNetBest === runB.summary.radialNetBest
  && runA.summary.collideFrames === runB.summary.collideFrames,
  `汇总数字同样可复现（minDist=${runA.summary.minDist} / 净推进=${runA.summary.radialNetBest} / 碰撞帧=${runA.summary.collideFrames}）`);
ok(runA.summary.world.covers > 0,
  `默认场景确实带掩体（covers=${runA.summary.world.covers}，${runA.summary.world.w}×${runA.summary.world.h}）`);

// ============================================================
section('② 数值卫生：全程无 NaN / Infinity');
{
  let badRows = 0;
  for (const fr of runA.frames) {
    if (![fr.minDist, fr.playerSpeed, fr.t].every(Number.isFinite)) badRows++;
    for (const r of fr.rows) {
      if (![r.dist, r.radial, r.speed, r.push, r.pen, r.penSep].every(Number.isFinite)) badRows++;
    }
  }
  ok(badRows === 0, `逐帧扫描 ${runA.frames.length} 帧：坐标/速度/推出量无 NaN 或 Infinity（坏行 ${badRows}）`);
  ok(runA.summary.badCoordFrames === 0, `探针自记的脏帧计数为 0（${runA.summary.badCoordFrames}）`);
}

// ============================================================
section('③ 负向口径：实体在正前方不算障碍');
{
  // 空场（零掩体）：把一辆车摆到另一辆正前方 40px（< 车长 64px，实体确实挡在路上），
  // 行进判定必须仍是「未阻挡」——判定只认掩体几何。
  const empty = PRESS.simulate({ covers: false, seconds: 0.5 });
  ok(empty.summary.world.covers === 0, `空场对照：场上零掩体（covers=${empty.summary.world.covers}）`);
  ok(empty.frames.length > 0 && empty.foes.length >= 2, '空场对照：拿到可用的车体样本');

  const probeTank = empty.foes[0];
  const lone = empty.foes[1];
  const aheadX = probeTank.x + Math.cos(probeTank.hullAngle) * 40;
  const aheadY = probeTank.y + Math.sin(probeTank.hullAngle) * 40;
  lone.x = aheadX;
  lone.y = aheadY;
  lone.hullAngle = probeTank.hullAngle + Math.PI;
  const withEntity = PRESS.frontBlockTier(probeTank, 50);
  ok(withEntity === null,
    `负向：正前方只站一辆车（40px）⇒ 行进判定未阻挡（实到 ${withEntity === null ? 'null' : withEntity}）`);
  ok(PRESS.penetrationDepth(probeTank) === 0,
    '负向配套：空场里车体与任何阻挡掩体的穿透深度为 0');

  // 正向对照：同一函数、同一辆车，正前方换成一块**真掩体**必须判阻挡，
  // 否则上一条「恒为 null」是空转（这才是 §4.160 那类误判真正的防线）。
  CV.covers.length = 0;
  CV.invalidateCoverGrid();
  const cx = probeTank.x + Math.cos(probeTank.hullAngle) * 50;
  const cy = probeTank.y + Math.sin(probeTank.hullAngle) * 50;
  CV.covers.push({ x: cx, y: cy, w: 120, h: 120, angle: 0, tier: 'full', hp: Infinity });
  const withCover = PRESS.frontBlockTier(probeTank, 50);
  ok(withCover === 'full',
    `正向对照：正前方换成 full 掩体 ⇒ 判为阻挡（实到 ${withCover === null ? 'null' : withCover}）`);
  CV.covers.length = 0;
  CV.invalidateCoverGrid();
  CV.resetCovers();          // 把合成掩体从初始快照链上摘干净，避免污染后续用例
}

// ============================================================
section('④ 碰撞口径：推出量只在真碰撞时非零');
{
  ok(runA.summary.penWithoutPushFrames === 0,
    `有穿透处必有推出量（driveTank 结束时仍嵌在掩体里的帧 ${runA.summary.penWithoutPushFrames} 个）`);
  ok(runA.summary.unrecoverablePenFrames === 0,
    `残留穿透明一次掩体解算即可归零（解不掉的帧 ${runA.summary.unrecoverablePenFrames} 个 ⇒ 无真穿模）`);

  // 无掩体空场的对照：`_pushN` 必须恒为 0（推出量不是「每帧都有的常数」）
  const clean = PRESS.simulate({ covers: false, seconds: 2 });
  let pushed = 0;
  let moving = 0;
  for (const fr of clean.frames) {
    for (const r of fr.rows) {
      if (r.push > 0) pushed++;
      if (Math.abs(r.speed) > 10) moving++;
    }
  }
  ok(pushed === 0, `无掩体空场 2s：推出量恒为 0（${clean.frames.length} 帧 × ${clean.summary.perFoe.length} 车）`);
  // 空转护栏：空场里的车必须真的在跑，否则上一条「push 恒为 0」什么也没证明。
  ok(moving > 0, `空场对照非空转：确有 |v|>10px/s 的行驶帧（${moving} 车·帧）`);
}

// ============================================================
// ⑤ MS1 门 ①/② 硬断言（2026-10-29 B3）
// 背景：B0 时这两条只是「打印数字」，B2（绕障）+ B3（接战带下探）之后才够格当门。
// 单 seed 没有判别力（§2.9：seed 1 早就压到 228px，按单 seed 判会直接通过），所以跑 10 个。
// 代价：每个 seed 约 5.4s ⇒ 本节约 55s，是 npm test 里最慢的一项。改这里前先想清楚。
section('⑤ MS1 门 ①/②（2026-10-30 口径 v3）：40s 窗口、minDist ≤340、中位 ≤200、净推进 >0');
{
  // 口径沿革（三次迭代，全记录在此防止将来再绕圈）：
  //   · v1（§4.172）：20s 窗口 + minDist≤340 —— hull-down（§4.176）落地前成立。
  //   · v2（2026-10-30 P1 修复）：6 参透传让 hull-down 在探针生效 ⇒ 静止玩家被 bush
  //     遮挡视线，敌人在部分 seed（31337：玩家出生点被灌木环绕）20s 内压不到 340——
  //     那是 hull-down 的**正确游戏行为**（静默玩家不该被瞬间围殴），不是压迫回归。
  //     曾试过给探针玩家微速绕开（0.05/0.25），两次都更糟：0.05 穿越 camo idle 阈值
  //     产生 hull-down 帧级抖动；0.25 的移动探针把「净推进」语义打崩（玩家自己前进
  //     把带内敌人推离，net 全负但 minDist 95 达标）。
  //   · v3（本次）：**接受 hull-down 的后果，放宽时间窗**——真站桩玩家 + 40s 窗口。
  //     实测 seed 31337 在 40s 时压到 326（敌人搜索 30~40s 后找到路），其余 9 seed
  //     在 40s 内 49~218px。门 = minDist ≤340（10/10）+ 10 seed 中位 ≤200 + 净推进 >0
  //     （站桩下净推进=真实推进，语义成立）。
  //     「静默玩家更难被发现」是 hull-down 的游戏特性；实机玩家会开火/移动，
  //     比探针站桩更容易被压制——本门是**下限**测量。
  const SEEDS = [1, 7, 42, 99, 123, 777, 4242, 20261027, 31337, 65535];
  const GATE_DIST = 340;
  const GATE_MEDIAN = 200;
  const GATE_SECONDS = 40;
  const rows = [];
  for (const seed of SEEDS) {
    const s = PRESS.simulate({ nodeSeed: seed, seconds: GATE_SECONDS }).summary;
    rows.push({ seed, minDist: s.minDist, net: s.radialNetBest, detour: s.detourShare });
  }
  const worst = rows.reduce((a, b) => (b.minDist > a.minDist ? b : a));
  ok(worst.minDist <= GATE_DIST,
    `门 ①：10 个 seed 最坏 minDist = ${worst.minDist.toFixed(0)}px（seed ${worst.seed}，门限 ${GATE_DIST}，40s 窗口）`);
  const mids = rows.map(r => r.minDist).sort((a, b) => a - b);
  const median = (mids[4] + mids[5]) / 2;
  ok(median <= GATE_MEDIAN,
    `门 ①-b：10 seed 中位 minDist = ${median.toFixed(0)}px（门限 ${GATE_MEDIAN}）`);
  const noNet = rows.filter(r => !(r.net > 0));
  ok(noNet.length === 0,
    `门 ②：10 个 seed 净推进全部 > 0`
    + (noNet.length ? `（不达标：${noNet.map(r => `${r.seed}:${r.net.toFixed(0)}`).join(', ')}）` : ''));
  ok(rows.some(r => r.detour > 0), `绕障确实生效（最高 ${(Math.max(...rows.map(r => r.detour)) * 100).toFixed(0)}% 帧）`);
  console.log('  ' + rows.map(r => `${r.seed}:${r.minDist.toFixed(0)}`).join('  '));
}

// ============================================================
// ⑥ hull-down 探针口径（2026-10-30 P1 修复防回潮）
// 教训：`measure-press` 曾用 4 参 hasLoS 包装，AI 的 hull-down 第 6 参 `{ targetZ }` 被吞 ⇒
//   探针环境 hull-down 静默失效、与实机分叉（#Z2 同类）。现在锁死：本探针的 hasLoS
//   必须能把 opts 透传到 `hasLineOfSight` 的 targetZ 判定。
section('⑥ hull-down 探针口径：hasLoS 的 opts 必须透传到 targetZ');
{
  // 场景：敌我之间横一块灌木；玩家静止。若 opts 被吞，AI 按炮塔口径 2.3m 判 ⇒ 看得见 ⇒ 激活。
  CV.covers.length = 0;
  CV.invalidateCoverGrid && CV.invalidateCoverGrid();
  CV.covers.push({ x: 330, y: 0, w: 60, h: 200, angle: 0, tier: 'bush', hp: 10 });
  global.setSimNow(0);
  // 真实 aiDecideEnemy 走一遍（探针的 hasLoS 是 6 参透传版）；
  // hull-down 判据的 camouflageMotionOf/FiringMul/LOS_HULL_Z 在 tank_ai 内部走
  // require('./tank_cover.js') 缓存路径，与顶部 require 的 CV 同一实例 ⇒ 无需全局注入。
  const AI = require('../js/tank_ai.js');
  const player = { id: 'p', team: 'player', x: 660, y: 0, hp: 100, speed: 0, hullLen: 64, hullWid: 38 };
  const foe = { id: 'e1', team: 'enemy', x: 0, y: 0, hullAngle: 0, turretAngle: 0, reloadT: 0,
    hp: 100, traverseLimit: Math.PI, stats: { turretTurnRate: 2.2 }, aiTriggerDist: 700 };
  const hasLoS6 = (ox, oy, tx, ty, cl, opts) => CV.hasLineOfSight(ox, oy, tx, ty, cl ?? CV.covers, opts);
  const ctx = { player, hasLoS: hasLoS6, dt: SCENE.dt, covers: CV.covers, enemies: [player] };
  AI.aiDecideEnemy(foe, ctx);
  ok(foe.aiEngaged !== true,
    '探针 hasLoS 透传 opts：静止玩家被灌木挡（hull-down 生效，engaged=false）');
  // 正向对照：opts 被吞的 4 参调用 ⇒ 炮塔口径 ⇒ 看得见（证明上一条测的是第 6 参而非别的）
  const seenWithoutOpts = CV.hasLineOfSight(0, 0, 660, 0, CV.covers);
  ok(seenWithoutOpts === true,
    '正向对照：同一条射线不带 targetZ ⇒ 看得见（证明分化来自 opts 透传，非空转）');
  CV.covers.length = 0;
  CV.invalidateCoverGrid && CV.invalidateCoverGrid();
  CV.resetCovers();
}

// ============================================================
console.log(`\n=== test-ai-press: ${fails === 0 ? 'ALL PASS' : fails + ' FAILED'} ===`);
if (fails > 0) process.exitCode = 1;
