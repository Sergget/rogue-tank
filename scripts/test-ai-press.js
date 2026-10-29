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
console.log(`\n=== test-ai-press: ${fails === 0 ? 'ALL PASS' : fails + ' FAILED'} ===`);
if (fails > 0) process.exitCode = 1;
