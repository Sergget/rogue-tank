// test-encounter.js — G1「完整 3~5 分钟遭遇」波次状态机回归（js/tank_encounter.js）
//
// 背景：tank_3d.html 原本是「6 个敌人开局一拥而上」的沙盒——没有波次、没有目标、没有胜负。
//   G1 用三波攻势 + 喘息窗口把它变成一段有头有尾的遭遇。本文件锁住纯逻辑层的九条契约：
//   ① telegraph→spawn→wave 推进；② 三波全清 victory；③ 玩家阵亡 defeat + 幂等；
//   ④ 同 seed 确定性；⑤ 全图 isBlocked 时仍产出合法点；⑥ breather 带 repairPct/reinforce；
//   ⑦ intel 间隔；⑧ 负向：victory 后不发 defeat / defeat 后不发 victory；
//   ⑨ 哨兵：RULES.encounter 被真实消费（改 breatherSeconds → 事件随之变化）。
//
// 分层纪律：本模块不碰 entities / covers / DOM，测试也**只传假 ctx**，不生成真坦克。
'use strict';

require('../js/tank_rules.js');
require('../js/tank_utils.js');
const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
global.TAU = U.TAU;

const ENC = require('../js/tank_encounter.js');
const { createEncounter, updateEncounter } = ENC;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function eq(a, b, label) { ok(a === b, `${label}（期望 ${b}，实到 ${a}）`); }
function near(a, b, tol, label) { ok(Math.abs(a - b) <= tol, `${label}（期望 ≈${b}±${tol}，实到 ${a}）`); }
function section(t) { console.log(`\n== ${t} ==`); }

const R = RULES_MOD.RULES;
const CFG = R.encounter;
const WORLD = { w: 1440, h: 864 };          // 3D 页 generateNode(0.45,{scale:1.8}) 的实测量级
const MARGIN = 40;                          // 模块内 SPAWN_EDGE_MARGIN，独立复算以防偷偷改值
const HOME = { x: 720, y: 432 };            // 战场中心（默认玩家位置）

function mkCtx(over) {
  return Object.assign({
    playerPos: { x: HOME.x, y: HOME.y },
    playerAlive: true,
    enemyAlive: 0,
    allyAlive: R.allyCommand.countByMode.standard,   // standard = 2 辆指挥友军
    world: { w: WORLD.w, h: WORLD.h },
    isBlocked: () => false,
  }, over || {});
}

const dist = (u, p) => Math.hypot(u.x - p.x, u.y - p.y);
const inBox = (u) => u.x >= MARGIN && u.x <= WORLD.w - MARGIN && u.y >= MARGIN && u.y <= WORLD.h - MARGIN;

// ---------------------------------------------------------------- 假页面驱动
// 模拟「页面接线」的最小行为：收到 spawn → 立刻把敌人数补上（等价 spawnTank 入 entities），
// killAfter 秒后一次性清完并把击杀累加到 enc.kills（这是页面的责任，不是模块的）。
// 返回 {enc, log, killed}；log 每项 = {t, event}。
function play(opts) {
  const o = opts || {};
  const enc = createEncounter({ seed: o.seed === undefined ? 7 : o.seed, rules: o.rules,
    mode: o.mode, lineXs: o.lineXs });
  const dt = o.dt || 0.5;
  const killAfter = o.killAfter === undefined ? 6 : o.killAfter;
  const maxFrames = o.maxFrames || 6000;
  const ctx = mkCtx(o.ctx0);
  const log = [];
  let sinceSpawn = -1;
  let pendingUnits = 0;
  for (let f = 0; f < maxFrames && !enc.outcome; f++) {
    if (o.beforeFrame) o.beforeFrame(enc, ctx, f);
    const events = updateEncounter(enc, dt, ctx);
    for (const e of events) {
      log.push({ t: enc.elapsed, event: e });
      if (e.type === 'spawn') {
        pendingUnits = e.units.length;
        ctx.enemyAlive = pendingUnits;      // 页面生成实体
        sinceSpawn = 0;
      }
    }
    if (sinceSpawn >= 0) {
      sinceSpawn += dt;
      if (sinceSpawn >= killAfter) {        // 页面视角：这一波被打光了
        ctx.enemyAlive = 0;
        enc.kills += pendingUnits;          // kills 由页面累加（contract 第 8 条）
        pendingUnits = 0;
        sinceSpawn = -1;
      }
    }
  }
  return { enc, log, ctx };
}

function typesOf(log) { return log.map(l => l.event.type); }
function findAll(log, type) { return log.filter(l => l.event.type === type).map(l => l.event); }
function lastEvent(log) { return log.length ? log[log.length - 1].event : null; }

/** 统计「同一波内」两两距离小于 sep 的点对数量（跨波复用同一坐标无妨，不计）。 */
function countIntraWaveDups(spawns, sep) {
  const thresh = sep === undefined ? 1e-6 : sep;
  let dup = 0;
  for (const s of spawns) {
    const us = s.units;
    for (let i = 0; i < us.length; i++) {
      for (let j = i + 1; j < us.length; j++) {
        if (Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y) < thresh) dup++;
      }
    }
  }
  return dup;
}

// ================================================================ ① 初始 telegraph → spawn → wave
section('① 阶段推进：telegraph → spawn → wave');
{
  const enc = createEncounter({ seed: 11 });
  eq(enc.phase, 'telegraph', '① 初始 phase 是 telegraph');
  eq(enc.timer, CFG.telegraphSeconds, '① 初始 timer = telegraphSeconds');
  eq(enc.waveIndex, 0, '① 初始 waveIndex = 0');
  eq(enc.waveCount, CFG.waves.length, '① waveCount = waves 长度');
  eq(enc.outcome, null, '① 初始 outcome 为 null');
  eq(enc.elapsed, 0, '① 初始 elapsed = 0');
  eq(enc.kills, 0, '① 初始 kills = 0');
  eq(enc.spawnedThisWave, 0, '① 初始 spawnedThisWave = 0');

  const ctx = mkCtx();
  const ev1 = updateEncounter(enc, 0.1, ctx);
  eq(ev1.length, 1, '① 首帧只产一条事件');
  eq(ev1[0].type, 'telegraph', '① 首帧补发 telegraph');
  eq(ev1[0].wave, 0, '① telegraph.wave = 0');
  eq(ev1[0].seconds, CFG.telegraphSeconds, '① telegraph.seconds 来自 RULES');
  ok(Array.isArray(ev1[0].bearings) && ev1[0].bearings.length === 1 && ev1[0].bearings[0] === CFG.waves[0].units[0].bearing,
    '① telegraph.bearings 是该波去重方位');
  near(enc.timer, CFG.telegraphSeconds - 0.1, 1e-9, '① telegraph 期间 timer 递减');
  eq(enc.phase, 'telegraph', '① 未到点不切换阶段');

  const ev2 = updateEncounter(enc, 2.0, ctx);
  eq(enc.phase, 'wave', '① timer 归零后进入 wave');
  const sp = ev2.find(e => e.type === 'spawn');
  ok(!!sp, '① 进入 wave 的同帧发 spawn');
  eq(ev2.length, 1, '① transition 帧只有 spawn 一条（不会同帧判清波）');
  eq(sp.wave, 0, '① spawn.wave = 0');
  eq(sp.units.length, CFG.waves[0].units.reduce((a, u) => a + u.count, 0), '① W1 单位数 = 配置求和');
  ok(sp.units.every(u => u.cls === 'medium'), '① W1 全是 medium');
  ok(sp.units.every(u => Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hullAngle)),
    '① 所有单位是有限数');
  ok(sp.units.every(u => u.x >= MARGIN && u.x <= WORLD.w - MARGIN && u.y >= MARGIN && u.y <= WORLD.h - MARGIN),
    '① 所有出生点在边界内（留 40px 边距）');
  eq(enc.spawnedThisWave, sp.units.length, '① spawnedThisWave = 本波生成数');
  eq(enc.timer, 0, '① wave 阶段 timer 从 0 起算（语义切换为已用秒）');

  // 页面接线契约：**收到 spawn 的同帧**必须把实体放进 entities（否则下一帧 enemyAlive 仍为 0 会被判清波）。
  // 这里用 enemyAlive>0 模拟「页面已如实生成」。
  const live = mkCtx({ enemyAlive: sp.units.length });
  updateEncounter(enc, 0.5, live);
  near(enc.timer, 0.5, 1e-9, '① wave 阶段 timer 累加已用秒');
  eq(enc.phase, 'wave', '① 敌人未清空前停留在 wave');
}

// ================================================================ ② 三波全清 → victory
section('② 三波全清 → victory');
const RUN_MAIN = play({ seed: 7, dt: 0.5, killAfter: 6 });
{
  const log = RUN_MAIN.log;
  const types = typesOf(log);
  eq(RUN_MAIN.enc.outcome, 'victory', '② outcome = victory');
  eq(RUN_MAIN.enc.phase, 'victory', '② phase = victory');
  const spawns = findAll(log, 'spawn');
  const clears = findAll(log, 'wave-clear');
  const breathers = findAll(log, 'breather');
  eq(spawns.length, 3, '② 恰好三次 spawn（每波一次）');
  eq(clears.length, 3, '② 恰好三次 wave-clear');
  eq(breathers.length, 2, '② 波间喘息 2 次（最后一波清完直接收官）');
  eq(types.filter(t => t === 'victory').length, 1, '② 恰好一条 victory');
  eq(types.filter(t => t === 'defeat').length, 0, '② 全程无 defeat');
  eq(lastEvent(log).type, 'victory', '② 最后一条事件是 victory');

  ok(clears.every((c, i) => c.wave === i), '② wave-clear.wave 依次为 0/1/2');
  ok(clears.every(c => typeof c.elapsed === 'number' && c.elapsed > 0), '② wave-clear 带 elapsed');
  ok(spawns.every((s, i) => s.units.length === CFG.waves[i].units.reduce((a, u) => a + u.count, 0)),
    '② 每波单位数与配置逐项一致（W1=3 / W2=4 / W3=5）');

  const vic = lastEvent(log);
  eq(vic.stats.wavesCleared, 3, '② victory.stats.wavesCleared = 3');
  ok(typeof vic.stats.seconds === 'number' && vic.stats.seconds > 0, '② victory.stats.seconds > 0');
  const expectedKills = CFG.waves.reduce((a, w) => a + w.units.reduce((b, u) => b + u.count, 0), 0);
  eq(vic.stats.kills, expectedKills, '② victory.stats.kills = 12（页面累加后模块如实反映）');
  console.log(`  · 参考：本次假页面用 killAfter=6s/波，全程 ${vic.stats.seconds.toFixed(1)}s（含 ${3 * CFG.telegraphSeconds + 2 * CFG.breatherSeconds}s 非战斗开销）`);
}

// ================================================================ ③ 任一阶段 playerAlive=false → defeat + 幂等
section('③ 玩家阵亡 → defeat，且终局后幂等');
{
  // (a) telegraph 阶段
  {
    const enc = createEncounter({ seed: 3 });
    const ctx = mkCtx();
    updateEncounter(enc, 0.1, ctx);                       // 吃掉 telegraph
    const ev = updateEncounter(enc, 0.1, Object.assign({}, ctx, { playerAlive: false }));
    eq(ev.length, 1, '③-a telegraph 阵亡只发一条事件');
    eq(ev[0].type, 'defeat', '③-a telegraph 阵亡发 defeat');
    eq(enc.outcome, 'defeat', '③-a outcome = defeat');
    eq(enc.phase, 'defeat', '③-a phase = defeat');
    ok(ev[0].stats && typeof ev[0].stats.seconds === 'number', '③-a defeat 带 stats.seconds');
  }
  // (b) wave 阶段
  {
    const enc = createEncounter({ seed: 3 });
    const ctx = mkCtx();
    updateEncounter(enc, 0.1, ctx);
    updateEncounter(enc, 2.0, ctx);                       // → wave
    updateEncounter(enc, 1.0, Object.assign({}, ctx, { enemyAlive: 3 }));
    const deadCtx = Object.assign({}, ctx, { enemyAlive: 3, playerAlive: false });
    const ev = updateEncounter(enc, 0.5, deadCtx);
    const evs = ev.filter(e => e.type === 'defeat');
    eq(evs.length, 1, '③-b wave 阶段阵亡发 defeat');
    eq(enc.phase, 'defeat', '③-b phase = defeat');
  }
  // (c) breather 阶段
  {
    const r = play({ seed: 5, dt: 0.5, killAfter: 6, maxFrames: 100000 });
    const log = r.log;
    const brIdx = log.findIndex(l => l.event.type === 'breather');
    ok(brIdx > 0, '③-c 跑到 breather 阶段');
    // 复刻到同一时刻，在 breather 里杀掉玩家
    const enc2 = createEncounter({ seed: 5 });
    const ctx2 = mkCtx();
    let sinceSpawn = -1, pending = 0, done = false;
    for (let f = 0; f < 100000 && !enc2.outcome; f++) {
      const events = updateEncounter(enc2, 0.5, ctx2);
      if (events.some(e => e.type === 'breather') && !done) {
        done = true;
        const ev = updateEncounter(enc2, 0.5, Object.assign({}, ctx2, { playerAlive: false }));
        eq(ev.filter(e => e.type === 'defeat').length, 1, '③-c breather 阶段阵亡发 defeat');
        eq(enc2.outcome, 'defeat', '③-c outcome = defeat');
        break;
      }
      for (const e of events) if (e.type === 'spawn') { pending = e.units.length; ctx2.enemyAlive = pending; sinceSpawn = 0; }
      if (sinceSpawn >= 0) { sinceSpawn += 0.5; if (sinceSpawn >= 6) { ctx2.enemyAlive = 0; pending = 0; sinceSpawn = -1; } }
    }
    ok(done, '③-c 确实进入了 breather');
  }
  // (d) 幂等
  {
    const enc = createEncounter({ seed: 9 });
    const ctx = mkCtx();
    updateEncounter(enc, 0.1, ctx);
    updateEncounter(enc, 0.1, Object.assign({}, ctx, { playerAlive: false }));
    const snapshot = enc.outcome;
    let extra = 0;
    for (let i = 0; i < 20; i++) extra += updateEncounter(enc, 1.0, mkCtx()).length;
    eq(extra, 0, '③-d defeat 后再更新 20 帧不发任何事件');
    eq(enc.outcome, snapshot, '③-d outcome 不被改写');
  }
}

// ================================================================ ④ 确定性
section('④ 同 seed 两次运行 → spawn 坐标完全一致');
{
  const a = play({ seed: 424242, dt: 0.5, killAfter: 6 });
  const b = play({ seed: 424242, dt: 0.5, killAfter: 6 });
  const sa = JSON.stringify(findAll(a.log, 'spawn').map(s => s.units));
  const sb = JSON.stringify(findAll(b.log, 'spawn').map(s => s.units));
  ok(sa === sb && sa.length > 0, '④ 同 seed 的 spawn 提案逐坐标一致');
  const c = play({ seed: 424243, dt: 0.5, killAfter: 6 });
  ok(JSON.stringify(findAll(c.log, 'spawn').map(s => s.units)) !== sa,
    '④ 不同 seed 产生不同坐标（不是常量硬编码）');
  // dt 不同但 ctx 序列等价时也应一致——坐标只由 rng 与几何决定，与步长无关
  const dT0 = play({ seed: 777, dt: 0.5, killAfter: 6 });
  const dT1 = play({ seed: 777, dt: 0.25, killAfter: 6 });
  ok(JSON.stringify(findAll(dT0.log, 'spawn').map(s => s.units)) === JSON.stringify(findAll(dT1.log, 'spawn').map(s => s.units)),
    '④ 同一行程序列下 dt 步长不影响 spawn 坐标');
}

// ================================================================ ⑤ isBlocked 恒 true
section('⑤ isBlocked 恒 true 时仍产出合法出生点');
{
  const enc = createEncounter({ seed: 21 });
  const ctx = mkCtx({ isBlocked: () => true });
  let spawnEv = null, threw = null;
  try {
    updateEncounter(enc, 0.1, ctx);
    const ev = updateEncounter(enc, 5.0, ctx);
    spawnEv = ev.find(e => e.type === 'spawn');
  } catch (err) { threw = err; }
  ok(!threw, '⑤ 全图阻挡时不抛异常');
  ok(!!spawnEv, '⑤ 仍然产出 spawn 提案');
  const units = spawnEv ? spawnEv.units : [];
  ok(units.length === 3, '⑤ 单位数不缩水（全部分配到 fallback 点）');
  ok(units.every(u => Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hullAngle)),
    '⑤ 坐标与朝向均为有限数');
  ok(units.every(u => u.x >= MARGIN && u.x <= WORLD.w - MARGIN && u.y >= MARGIN && u.y <= WORLD.h - MARGIN),
    '⑤ 坐标仍在边界内');
  ok(units.every(u => u.x !== HOME.x || u.y !== HOME.y), '⑤ 不会生成在玩家身上');
  // 整个遭遇也能跑完（三波都靠 fallback）：三波共 12 个单位全部有坐标，且兜底点不叠点
  const r = play({ seed: 21, dt: 0.5, killAfter: 6, ctx0: { isBlocked: () => true } });
  eq(r.enc.outcome, 'victory', '⑤ 全阻挡图仍能正常打完全程');
  const allUnits = [].concat(...findAll(r.log, 'spawn').map(s => s.units));
  eq(allUnits.length, 12, '⑤ 三波共 12 个单位全部有坐标');
  ok(allUnits.every(u => Number.isFinite(u.x) && Number.isFinite(u.y)), '⑤ 12 个单位坐标全部有限');
  const dupBlocked = countIntraWaveDups(findAll(r.log, 'spawn'));
  eq(dupBlocked, 0, '⑤ 全阻挡：同一波内兜底点不重合（同方位多单位各自横向铺开）');

  // 常规路径也不能叠点：bearing 指向短轴/角落时，多个候选会被边界钳制吸到同一个角点，
  // 若不隔开，页面 spawnTank 后会立刻被 resolveTankCollisions 硬推开（车从地里弹出来）。
  const dupFree = countIntraWaveDups(findAll(RUN_MAIN.log, 'spawn'), 70);
  eq(dupFree, 0, '⑤ 常规路径：同一波内出生点两两相距 ≥ 70px');
}

// ================================================================ ⑥ breather 带 repairPct / reinforce
section('⑥ breather 事件：repairPct 与 reinforce');
{
  const r0 = play({ seed: 31, dt: 0.5, killAfter: 6, ctx0: { allyAlive: 0 } });
  const br0 = findAll(r0.log, 'breather')[0];
  ok(!!br0, '⑥ 拿到 breather 事件');
  eq(br0.seconds, CFG.breatherSeconds, '⑥ breather.seconds = RULES.encounter.breatherSeconds');
  eq(br0.repairPct, CFG.breatherRepairPct, '⑥ breather.repairPct = RULES.encounter.breatherRepairPct');
  // 意图锁（不硬编码具体数值，改值时不必改测试）：喘息是切片唯一的血量来源，
  // 两次喘息合计必须回 ≥ 一半血池 —— 0.15 时代只有 30%，实测撑不到 W3（2026-10-28 上调到 0.30）。
  ok(CFG.breatherRepairPct * 2 >= 0.5,
    `⑥ 两次喘息合计回复 ${(CFG.breatherRepairPct * 2 * 100).toFixed(0)}% 血池 ≥ 50%`);
  ok(CFG.breatherRepairPct < 1, `⑥ 喘息不是满血复活（${CFG.breatherRepairPct} < 1）`);
  eq(br0.reinforce, CFG.reinforceMinAllies, '⑥ 友军 0 → reinforce = reinforceMinAllies（>0）');
  ok(br0.reinforce > 0, '⑥ 友军 0 时 reinforce > 0');

  const r2 = play({ seed: 31, dt: 0.5, killAfter: 6, ctx0: { allyAlive: R.allyCommand.countByMode.standard } });
  const br2 = findAll(r2.log, 'breather')[0];
  ok(!!br2, '⑥ 拿到满编友军的 breather 事件');
  eq(br2.reinforce, 0, '⑥ 友军满编 → reinforce = 0');

  const r1 = play({ seed: 31, dt: 0.5, killAfter: 6, ctx0: { allyAlive: 1 } });
  eq(findAll(r1.log, 'breather')[0].reinforce, 0, '⑥ 友军刚好到 reinforceMinAllies → 不补员');
  // breather 之后必须回到 telegraph 而不是直接 spawn
  const idxBr = r2.log.findIndex(l => l.event.type === 'breather');
  eq(r2.log[idxBr + 1].event.type, 'telegraph', '⑥ breather 结束先发 telegraph（不是裸 spawn）');
}

// ================================================================ ⑦ intel 间隔
section('⑦ intel 事件间隔');
{
  // (a) 整波单(dt=1) 推进 18s：恰好 3 次
  {
    const enc = createEncounter({ seed: 41 });
    const ctx = mkCtx();
    updateEncounter(enc, 0.1, ctx);                 // telegraph
    updateEncounter(enc, 2.0, ctx);                 // → wave
    ctx.enemyAlive = 3;
    let n = 0;
    for (let i = 0; i < 18; i++) n += updateEncounter(enc, 1.0, ctx).filter(e => e.type === 'intel').length;
    eq(n, Math.floor(18 / CFG.intelInterval), '⑦ dt=1.0 × 18s → 恰 3 条 intel（不多不少）');
  }
  // (b) dt=0.5 推进 12s：恰好 2 次
  {
    const enc = createEncounter({ seed: 41 });
    const ctx = mkCtx();
    updateEncounter(enc, 0.1, ctx);
    updateEncounter(enc, 2.0, ctx);
    ctx.enemyAlive = 3;
    let n = 0;
    for (let i = 0; i < 24; i++) n += updateEncounter(enc, 0.5, ctx).filter(e => e.type === 'intel').length;
    eq(n, 2, '⑦ dt=0.5 × 12s → 恰 2 条 intel');
  }
  // (c) 恰好一个间隔（6s）才发第一条，之前不发
  {
    const enc = createEncounter({ seed: 41 });
    const ctx = mkCtx();
    updateEncounter(enc, 0.1, ctx);
    updateEncounter(enc, 2.0, ctx);
    ctx.enemyAlive = 3;
    let n5 = 0, n6 = 0;
    for (let i = 0; i < 10; i++) n5 += updateEncounter(enc, 0.5, ctx).filter(e => e.type === 'intel').length;  // 5.0s
    for (let i = 0; i < 2; i++) n6 += updateEncounter(enc, 0.5, ctx).filter(e => e.type === 'intel').length;   // → 6.0s
    eq(n5, 0, '⑦ 5.0s（< 间隔）不发 intel');
    eq(n6, 1, '⑦ 到 6.0s 恰好发第一条 intel');
  }
  // (d) telegraph / breather 阶段不发 intel：逐帧记录**更新前的 phase** 再判定
  {
    const enc2 = createEncounter({ seed: 43 });
    const ctx2 = mkCtx();
    let sinceSpawn = -1, pending = 0, frames = 0, intelOutsideWave = 0, intelTotal = 0;
    while (!enc2.outcome && frames < 6000) {
      const phaseBefore = enc2.phase;
      for (const e of updateEncounter(enc2, 0.5, ctx2)) {
        if (e.type === 'intel') { intelTotal++; if (phaseBefore !== 'wave') intelOutsideWave++; }
        if (e.type === 'spawn') { pending = e.units.length; ctx2.enemyAlive = pending; sinceSpawn = 0; }
      }
      if (sinceSpawn >= 0) { sinceSpawn += 0.5; if (sinceSpawn >= 6) { ctx2.enemyAlive = 0; pending = 0; sinceSpawn = -1; } }
      frames++;
    }
    eq(intelOutsideWave, 0, '⑦ telegraph / breather 阶段不发 intel');
    ok(intelTotal > 0, '⑦ 全程确实发过 intel（断言本身有效）');
  }
}

// ================================================================ ⑧ 负向断言
section('⑧ 负向：victory 后不发 defeat，defeat 后不发 victory');
{
  const enc = createEncounter({ seed: 51 });
  const ctx = mkCtx();
  const events = [];
  events.push(...updateEncounter(enc, 0.1, ctx));
  updateEncounter(enc, 2.0, ctx);
  ctx.enemyAlive = 3;
  updateEncounter(enc, 0.5, ctx);
  // 强行在三波都还没清的情况下跑完：这里直接构造「胜利」——先清三波
  const r = play({ seed: 51, dt: 0.5, killAfter: 6 });
  eq(r.enc.outcome, 'victory', '⑧ 构造出 victory');
  const after = updateEncounter(r.enc, 1.0, Object.assign({}, mkCtx(), { playerAlive: false }));
  eq(after.length, 0, '⑧ victory 后用死亡 ctx 更新 → 空事件（不发 defeat）');
  eq(r.enc.outcome, 'victory', '⑧ victory 不被改写成 defeat');

  const enc2 = createEncounter({ seed: 52 });
  const ctx2 = mkCtx();
  updateEncounter(enc2, 0.1, ctx2);
  updateEncounter(enc2, 0.1, Object.assign({}, ctx2, { playerAlive: false }));
  eq(enc2.outcome, 'defeat', '⑧ 构造出 defeat');
  let got = [];
  for (let i = 0; i < 200; i++) got = got.concat(updateEncounter(enc2, 0.5, mkCtx({ enemyAlive: 0 })));
  eq(got.length, 0, '⑧ defeat 后 200 帧空事件（不发 victory / wave-clear / intel）');
  eq(enc2.outcome, 'defeat', '⑧ outcome 保持 defeat');
}

// ================================================================ ⑨ 哨兵：RULES.encounter 被真实消费
section('⑨ 哨兵：RULES.encounter 真被模块读取（非死配置）');
{
  const keyHit = ['enabled', 'telegraphSeconds', 'breatherSeconds', 'breatherRepairPct',
    'reinforceMinAllies', 'minSpawnDist', 'spawnTries', 'intelInterval', 'waves'];
  ok(keyHit.every(k => k in CFG), '⑨ RULES.encounter 契约九个键齐全');

  const originBreather = CFG.breatherSeconds;
  const originIntel = CFG.intelInterval;
  try {
    CFG.breatherSeconds = 3.5;
    CFG.intelInterval = 2;
    const r = play({ seed: 61, dt: 0.5, killAfter: 6 });
    const br = findAll(r.log, 'breather')[0];
    ok(!!br, '⑨ 改参后仍能跑到 breather');
    eq(br.seconds, 3.5, '⑨ breather.seconds 跟随 RULES.encounter.breatherSeconds 变化');
    eq(br.repairPct, CFG.breatherRepairPct, '⑨ repairPct 仍来自 RULES');
    // intel 间隔也应随之变化：原地复读 inc
    const enc2 = createEncounter({ seed: 61 });
    const ctx2 = mkCtx();
    updateEncounter(enc2, 0.1, ctx2);
    updateEncounter(enc2, 2.0, ctx2);
    ctx2.enemyAlive = 3;
    let n = 0;
    for (let i = 0; i < 12; i++) n += updateEncounter(enc2, 0.5, ctx2).filter(e => e.type === 'intel').length;
    eq(n, 3, '⑨ intel 间隔跟随 RULES.encounter.intelInterval（6s → 2s：12s 内 3 条）');
  } finally {
    CFG.breatherSeconds = originBreather;
    CFG.intelInterval = originIntel;
  }
  eq(CFG.breatherSeconds, originBreather, '⑨ 测试后 RULES 被还原');
  const rAfter = play({ seed: 61, dt: 0.5, killAfter: 6 });
  eq(findAll(rAfter.log, 'breather')[0].seconds, originBreather, '⑨ 还原后行为回到 12s');

  // 方位可行性回退消费 minSpawnDist：把最小出生距离抬到 900（正东只剩 680px ⇒ 必须回退）
  {
    const rHigh = play({ seed: 61, dt: 0.5, killAfter: 6, rules: { minSpawnDist: 900 } });
    const u0 = findAll(rHigh.log, 'spawn')[0].units;
    ok(u0.every(u => Math.abs(u.bearing) > 1e-9),
      '⑨ minSpawnDist=900 时正东( bearing 0，纵深 680 )被回退 → 实际 bearing 已偏转');
    ok(u0.every(u => dist(u, HOME) >= CFG.SPAWN_DIST_HARD_FLOOR),
      '⑨ 回退后仍守硬下限（不因采样失败而贴脸）');
  }

  // 波次表被真实消费：三波单位总数 = 配置求和，且每方位都落到某个出生点上
  const totalUnits = CFG.waves.reduce((a, w) => a + w.units.reduce((b, u) => b + u.count, 0), 0);
  const units = [].concat(...findAll(RUN_MAIN.log, 'spawn').map(s => s.units));
  eq(units.length, totalUnits, '⑨ waves 表被逐项消费（总单位数一致）');
  const bearingSet = CFG.waves.map(w => w.units.map(u => u.bearing).join(','));
  ok(bearingSet.length === 3, '⑨ 三波配置都被遍历到');
}

// ================================================================ ⑩ 契约形状（防改一个字就崩）
section('⑩ events / enc 字段形状');
{
  const r = play({ seed: 71, dt: 0.5, killAfter: 6 });
  const byType = {};
  for (const l of r.log) (byType[l.event.type] = byType[l.event.type] || []).push(l.event);
  ok(!!byType.telegraph && byType.telegraph[0].seconds !== undefined && Array.isArray(byType.telegraph[0].bearings),
    '⑩ telegraph 带 wave/seconds/bearings');
  const u = byType.spawn[0].units[0];
  ok('cls' in u && 'x' in u && 'y' in u && 'hullAngle' in u && 'bearing' in u,
    '⑩ spawn.units[i] 带 cls/x/y/hullAngle/bearing');
  ok('wave' in byType['wave-clear'][0] && 'elapsed' in byType['wave-clear'][0], '⑩ wave-clear 带 wave/elapsed');
  ok('seconds' in byType.breather[0] && 'repairPct' in byType.breather[0] && 'reinforce' in byType.breather[0],
    '⑩ breather 带 seconds/repairPct/reinforce');
  for (const kind of ['victory', 'defeat']) {
    const e = kind === 'victory' ? lastEvent(r.log) : null;
    if (!e) continue;
    ok('stats' in e && 'seconds' in e.stats && 'kills' in e.stats && 'wavesCleared' in e.stats,
      `⑩ ${kind}.stats 带 seconds/kills/wavesCleared`);
  }
  const fields = ['phase', 'waveIndex', 'waveCount', 'timer', 'elapsed', 'kills', 'spawnedThisWave', 'outcome'];
  ok(fields.every(f => f in r.enc), '⑩ enc 八个契约字段齐全：' + fields.join('/'));
  ok(['telegraph', 'wave', 'breather', 'victory', 'defeat'].includes(r.enc.phase), '⑩ 终态 phase 在阶段全集内');
}

// ================================================================ ⑪ 方位可行性回退 / HUD 不骗人 / spawn 校正
section('⑪ 方位可行性回退 + telegraph 不骗人 + spawn 前校正');
const FLOOR = CFG.SPAWN_DIST_HARD_FLOOR;
{
  eq(FLOOR, 380, '⑪ RULES.encounter.SPAWN_DIST_HARD_FLOOR 缺省 380');
  // (1) 玩家在战场正中：任何波的出生点都不得近于硬下限
  const r = play({ seed: 7, dt: 0.5, killAfter: 6 });
  const units = [].concat(...findAll(r.log, 'spawn').map(s => s.units));
  const ds = units.map(u => dist(u, HOME));
  const minD = Math.min(...ds);
  ok(minD >= FLOOR, `⑪ 玩家正中：12 个点的最小距离 ${minD.toFixed(0)}px ≥ ${FLOOR}`);
  eq(ds.filter(d => d < FLOOR).length, 0, '⑪ 玩家正中：无「贴脸」出生点（旧缺陷：正南 392px）');
  // 正南（预设 π/2）必须已被回退掉
  eq(units.filter(u => Math.abs(u.bearing - Math.PI / 2) < 1e-9).length, 0,
    '⑪ W2/W3 的正南 bearing(π/2) 已被可行性回退取代');
  const w2 = findAll(r.log, 'spawn')[1];
  const heavyS = w2.units.find(u => u.cls === 'heavy');
  ok(dist(heavyS, HOME) >= FLOOR, `⑪ W2 heavy 距玩家 ${dist(heavyS, HOME).toFixed(0)}px（旧值 392）`);

  // (2) telegraph.bearings 与同波 spawn.units[].bearing **集合一致**（防 HUD 骗人回归）
  const tgs = findAll(r.log, 'telegraph');
  const sps = findAll(r.log, 'spawn');
  eq(tgs.length, sps.length, '⑪ telegraph 与 spawn 一一对应');
  for (let i = 0; i < sps.length; i++) {
    const tb = [...new Set(tgs[i].bearings)].sort((a, b) => a - b);
    const sb = [...new Set(sps[i].units.map(u => u.bearing))].sort((a, b) => a - b);
    ok(JSON.stringify(tb) === JSON.stringify(sb),
      `⑪ 第 ${i + 1} 波 telegraph.bearings 与 spawn 实际方位一致（${sb.map(b => b.toFixed(2)).join('/')}）`);
  }

  // (3) 玩家朝提示方位冲过去（432 → 700）：spawn 点仍不得近于硬下限
  let moved = false;
  const MOVED = { x: 720, y: 700 };
  const r3 = play({
    seed: 7, dt: 0.5, killAfter: 6,
    beforeFrame: (enc, ctx) => {
      // 规划已完成（enc.pending 有值）后才移动玩家 —— 复现「预警期玩家前压」
      if (!moved && enc.pending && enc.pending.length) { moved = true; ctx.playerPos = { x: MOVED.x, y: MOVED.y }; }
    },
  });
  ok(moved, '⑪ 构造成功：预警期玩家从 (720,432) 前压到 (720,700)');
  const u3 = [].concat(...findAll(r3.log, 'spawn').map(s => s.units));
  const d3 = u3.map(u => dist(u, MOVED));
  ok(Math.min(...d3) >= FLOOR, `⑪ 前压后最小出生距离 ${Math.min(...d3).toFixed(0)}px ≥ ${FLOOR}`);
  ok(u3.every(inBox), '⑪ 校正后的点仍在边界内（留 40px 边距）');

  // (3b) 校正路径本身：把玩家直接放到某预规划点近处，该点必须被沿「点−玩家」方向外推
  const enc = createEncounter({ seed: 7 });
  const ctx = mkCtx();
  let planned = null;
  for (let f = 0; f < 40 && !planned; f++) {
    updateEncounter(enc, 0.5, ctx);
    if (enc.pending && enc.pending.length) {
      planned = enc.pending.map(u => ({ x: u.x, y: u.y }));
      ctx.playerPos = { x: planned[0].x - 200, y: planned[0].y };   // 冲到第一个点 200px 处
    }
  }
  let spawnEv = null;
  for (let f = 0; f < 40 && !spawnEv; f++) {
    const ev = updateEncounter(enc, 0.5, ctx);
    spawnEv = ev.find(e => e.type === 'spawn') || null;
  }
  const before = dist(planned[0], ctx.playerPos);
  const after = dist(spawnEv.units[0], ctx.playerPos);
  ok(before < FLOOR, `⑪-b 构造成功：外推前该点距玩家 ${before.toFixed(0)}px < ${FLOOR}`);
  ok(after > before + 1e-6, `⑪-b 该点被外推（${before.toFixed(0)} → ${after.toFixed(0)}px，单调变远）`);
  ok(inBox(spawnEv.units[0]), '⑪-b 外推后仍在 box 内');
  ok(spawnEv.units.every(u => Number.isFinite(u.x) && Number.isFinite(u.y)), '⑪-b 外推后坐标仍有限');
  // 朝向也刷新到**当前**玩家（预规划时朝的是旧位置）
  const want = Math.atan2(ctx.playerPos.y - spawnEv.units[0].y, ctx.playerPos.x - spawnEv.units[0].x);
  // 角度按环形比较（π 与 −π 是同一个朝向，直接比差值会误判）
  const angGap = Math.abs(Math.atan2(Math.sin(spawnEv.units[0].hullAngle - want), Math.cos(spawnEv.units[0].hullAngle - want)));
  near(angGap, 0, 1e-9, '⑪-b spawn 时 hullAngle 刷新为指向当前玩家');
}

// ================================================================ ⑫ 出场距离上限 + 两个演示参数键
section('⑫ maxSpawnDist（真消费）与演示参数 entryReactSeconds / playerHpScale（页面读）');
{
  const MAXD = CFG.maxSpawnDist;
  eq(MAXD, 900, '⑫ RULES.encounter.maxSpawnDist 缺省 900');
  const r = play({ seed: 7, dt: 0.5, killAfter: 6 });
  const units = [].concat(...findAll(r.log, 'spawn').map(s => s.units));
  const ds = units.map(u => dist(u, HOME));
  const lo = CFG.SPAWN_DIST_HARD_FLOOR;
  ok(Math.min(...ds) >= lo, `⑫ 出生距离下界：最小 ${Math.min(...ds).toFixed(0)}px ≥ ${lo}`);
  ok(Math.max(...ds) <= MAXD + 1, `⑫ 出生距离上界：最大 ${Math.max(...ds).toFixed(0)}px ≤ ${MAXD}+1`);
  eq(ds.filter(d => d > MAXD + 1).length, 0, '⑫ 不再出现 1229px 这类「出生就在视野尽头」的点');

  // 哨兵：maxSpawnDist 是**真消费**——临时改成 700，上界随之降到 ≤701（finally 还原）
  const originMax = CFG.maxSpawnDist;
  try {
    CFG.maxSpawnDist = 700;
    const r2 = play({ seed: 7, dt: 0.5, killAfter: 6 });
    const ds2 = [].concat(...findAll(r2.log, 'spawn').map(s => s.units)).map(u => dist(u, HOME));
    ok(Math.max(...ds2) <= 701, `⑫ maxSpawnDist=700 时上界随之降到 ${Math.max(...ds2).toFixed(0)}px`);
    ok(Math.min(...ds2) >= lo, '⑫ 收紧上界不影响硬下限（仍然 ≥380）');
    ok(JSON.stringify(ds2) !== JSON.stringify(ds), '⑫ 坐标确实随 maxSpawnDist 变化（不是常量）');
  } finally {
    CFG.maxSpawnDist = originMax;
  }
  eq(CFG.maxSpawnDist, MAXD, '⑫ 测试后 maxSpawnDist 被还原');
  const r3 = play({ seed: 7, dt: 0.5, killAfter: 6 });
  const ds3 = [].concat(...findAll(r3.log, 'spawn').map(s => s.units)).map(u => dist(u, HOME));
  ok(JSON.stringify(ds3) === JSON.stringify(ds), '⑫ 还原后出生点与初始一致（无残留污染）');

  // 以下三个键**模块不消费**，由页面读去写 aiReactT / 缩放 maxHp / 缩放 damage：
  // 只断言键存在 + 取值合法 + **意图锁**（锁关系不锁数值，改数值不必改测试）
  ok('entryReactSeconds' in CFG, '⑫ RULES.encounter.entryReactSeconds 存在（页面读它写 aiReactT）');
  eq(typeof CFG.entryReactSeconds, 'number', '⑫ entryReactSeconds 是数字');
  ok(Number.isFinite(CFG.entryReactSeconds) && CFG.entryReactSeconds > 0,
    `⑫ entryReactSeconds 有限且 >0（实到 ${CFG.entryReactSeconds}）`);
  eq(CFG.entryReactSeconds, 1.5, '⑫ entryReactSeconds = 1.5');

  ok('playerHpScale' in CFG, '⑫ RULES.encounter.playerHpScale 存在（页面读它缩放玩家 maxHp）');
  eq(typeof CFG.playerHpScale, 'number', '⑫ playerHpScale 是数字');
  ok(Number.isFinite(CFG.playerHpScale) && CFG.playerHpScale > 0,
    `⑫ playerHpScale 有限且 >0（实到 ${CFG.playerHpScale}）`);
  eq(CFG.playerHpScale, 4, '⑫ playerHpScale = 4（切片演示值，非正式平衡值）');

  // enemyDamageScale：同款哨兵（模块不消费，页面 spawn 时写 base.damage 后 refreshStats）
  ok('enemyDamageScale' in CFG, '⑫ RULES.encounter.enemyDamageScale 存在（页面读它缩放波次敌人 damage）');
  eq(typeof CFG.enemyDamageScale, 'number', '⑫ enemyDamageScale 是数字');
  ok(Number.isFinite(CFG.enemyDamageScale) && CFG.enemyDamageScale > 0,
    `⑫ enemyDamageScale 有限且 >0（实到 ${CFG.enemyDamageScale}）`);
  eq(CFG.enemyDamageScale, 0.3, '⑫ enemyDamageScale = 0.3');
  ok(CFG.enemyDamageScale <= 1, `⑫ enemyDamageScale ≤ 1（是减伤不是放大，实到 ${CFG.enemyDamageScale}）`);
  ok(CFG.playerHpScale >= 1, `⑫ playerHpScale ≥ 1（是放大不是缩水，实到 ${CFG.playerHpScale}）`);

  // 意图锁：静止站桩的存活预算 = 玩家血池 ÷ 静止承伤速率，必须 ≥ 8 秒
  //   （人类「看见来袭 → 判断 → 倒车/绕掩体」至少要 2~3 秒，8 秒是「留得出反应窗口」的下限）。
  // 两个实测常量（2026-10-28 浏览器实跑，3 辆敌人对静止不还击的玩家）：
  const MEASURED_STILL_DPS = 103;   // 未缩放时玩家承受的 hp/s（51.5 ÷ 0.5 反推，被血池 cap 修正后的准确值）
  const PLAYER_BASE_HP = 80;        // Leapard_1（tanks/Leapard_1.json）基准 maxHp
  const budget = (PLAYER_BASE_HP * CFG.playerHpScale) / (MEASURED_STILL_DPS * CFG.enemyDamageScale);
  ok(budget >= 8,
    `⑫ 静止存活预算 ${budget.toFixed(1)}s ≥ 8s（血池 ${PLAYER_BASE_HP * CFG.playerHpScale} ÷ 承伤 ${(MEASURED_STILL_DPS * CFG.enemyDamageScale).toFixed(1)} hp/s）`);
}

// ================================================================ ⑬ 出场距离硬顶（真实出生坐标，逐点断言）
section('⑬ maxSpawnDist 硬顶（真实出生坐标 360,432，逐点断言）');
{
  // 真实坐标：3D 切片玩家出生点从 0.12w 内移到 0.25w ⇒ (358,432)，这里取 (360,432)。
  const REAL_HOME = { x: 360, y: 432 };
  const MAXD = CFG.maxSpawnDist, FLOOR2 = CFG.SPAWN_DIST_HARD_FLOOR;

  /** 跑完整遭遇，返回三波全部单位（按波次顺序）。 */
  function unitsAt(ctxOver, seed) {
    const r = play({ seed: seed, dt: 0.5, killAfter: 6, ctx0: ctxOver });
    return findAll(r.log, 'spawn');
  }

  // (a) 采样路径：isBlocked 恒 false
  for (const seed of [7, 2026]) {
    const waves = unitsAt({ playerPos: { x: REAL_HOME.x, y: REAL_HOME.y }, isBlocked: () => false }, seed);
    waves.forEach((sp, wi) => {
      sp.units.forEach((u, ui) => {
        const d = dist(u, REAL_HOME);
        ok(d >= FLOOR2 && d <= MAXD + 1,
          `⑬ seed${seed} W${wi + 1}#${ui + 1} ${u.cls} (${Math.round(u.x)},${Math.round(u.y)}) d=${d.toFixed(0)} ∈ [${FLOOR2}, ${MAXD + 1}]`);
      });
    });
  }

  // (b) 兜底路径：isBlocked 恒 true —— 所有采样被拒后走「沿 bearing 退到最远合法点」，
  //     这条路径曾完全绕过 maxSpawnDist（实测玩家 (360,432) 时正东边界 1042px ⇒ 浏览器报 maxDist=1044）。
  const blockedWaves = unitsAt({ playerPos: { x: REAL_HOME.x, y: REAL_HOME.y }, isBlocked: () => true }, 7);
  blockedWaves.forEach((sp, wi) => {
    sp.units.forEach((u, ui) => {
      const d = dist(u, REAL_HOME);
      ok(d <= MAXD + 1,
        `⑬ 兜底 seed7 W${wi + 1}#${ui + 1} ${u.cls} (${Math.round(u.x)},${Math.round(u.y)}) d=${d.toFixed(0)} ≤ ${MAXD + 1}`);
    });
  });
}

section('#AB3 / #AB4 防御性契约（§4.157）');

// #AB4：intelInterval 是「防龟缩」的唯一驱动，≤0 必须视为非法值而不是静默关闭。
{
  const a = ENC.resolveEncounterConfig({ intelInterval: 0 });
  ok(a.intelInterval >= ENC.INTEL_MIN_SECONDS,
    `#AB4：intelInterval=0 被钳到 ${a.intelInterval}s（≥${ENC.INTEL_MIN_SECONDS}），不静默失效`);
  const b = ENC.resolveEncounterConfig({ intelInterval: -3 });
  ok(b.intelInterval >= ENC.INTEL_MIN_SECONDS, `#AB4：负值同样被钳（${b.intelInterval}s）`);

  // 哨兵：钳位之后 intel 事件必须**真的发得出来**（防「改了钳位但没人读」）
  const rulesI = Object.assign({}, CFG, { intelInterval: 0 });
  const encI = createEncounter({ seed: 5, rules: rulesI });
  const ctxI = mkCtx({ enemyAlive: 99 });      // 敌人一直活着 → 只看 intel，不进喘息
  let n = 0;
  for (let i = 0; i < 40; i++) {
    for (const e of updateEncounter(encI, 0.5, ctxI)) if (e.type === 'intel') n++;
  }
  ok(n >= 10, `#AB4 哨兵：intelInterval=0 仍发出 ${n} 条 intel（20 秒内）`);
}

// #AB3：某一波 `units: []` 时，模块必须自己把该波按「已清」推进并给出 wave-empty，
// 否则就是「无敌人、无计时、无提示」的软锁（玩家只能刷新页面）。
{
  const rulesEmpty = Object.assign({}, CFG, {
    waves: [
      { id: 'E1', label: '空波', units: [] },
      { id: 'E2', label: '正常', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
    ],
  });
  const p = play({ rules: rulesEmpty, seed: 9, killAfter: 1 });
  const empties = p.log.filter(x => x.event.type === 'wave-empty');
  const clears = p.log.filter(x => x.event.type === 'wave-clear');
  ok(empties.length === 1, `#AB3：空波产出 1 条 wave-empty（实到 ${empties.length}）`);
  ok(clears.length === 2, `#AB3：两波都判了清波（实到 ${clears.length}）`);
  ok(p.enc.outcome === 'victory', `#AB3：空波之后流程照常推进到 victory（实到 ${p.enc.outcome}）`);
}

// ================================================================ ⑭ 防线式波次（mode:'lines'，2026-10-30 用户裁定）
// 锁的语义：① 清波后进 lineHold 且**不倒计时**（玩家不推进就永远不发下一波）；
//   ② 玩家 x 越过「当前防线 x − lineAdvanceMargin」才 telegraph 下一波；
//   ③ 波次 i 绑定 lineXs[i]（升序，防线逐波推进）；
//   ④ lineXs 缺省时退化为「清波即发」不软锁；
//   ⑤ lines 模式 breather 事件 seconds=0（字段同构，页面按同分支回血/补员）；
//   ⑥ 最后一波清掉即 victory（与 timed 相同）；⑦ timed 模式（缺省）不受影响——切片回归锚。
section('⑭ 防线式波次：mode=lines 节拍（lineHold 等玩家推进）');
{
  // --- ⑭a lineHold 卡住：玩家不推进，清波后永远停在 lineHold ---
  {
    const p = play({ seed: 21, mode: 'lines', rules: Object.assign({}, CFG, {
      waves: [
        { id: 'L1', label: '一', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'L2', label: '二', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
      ],
    }), lineXs: [800, 1200], maxFrames: 200, ctx0: { playerPos: { x: 200, y: 432 } } });
    ok(p.enc.outcome === null, `⑭a 玩家未推进：遭遇未终局（outcome=${p.enc.outcome}）`);
    eq(p.enc.phase, 'lineHold', '⑭a 清波后停在 lineHold（非 timed 的 breather）');
    ok(findAll(p.log, 'telegraph').length === 1, `⑭a 只发了 W1 的 telegraph（实到 ${findAll(p.log, 'telegraph').length}）`);
    const br = findAll(p.log, 'breather');
    ok(br.length === 1 && br[0].seconds === 0, `⑭a lines 模式 breather.seconds=0（实到 ${br.length ? br[0].seconds : '无事件'}）`);
    ok(br.length === 1 && br[0].repairPct === CFG.breatherRepairPct && br[0].reinforce >= 0,
      '⑭a breather 事件字段同构（repairPct/reinforce 照发，页面同分支回血/补员）');
    ok(p.enc.timer === 0, '⑭a lineHold 不倒计时（timer=0，等玩家推进而非定时）');
  }
  // --- ⑭b 玩家推进过防线 1 → 发 W2 telegraph；停在防线 1 前不发 W3 ---
  //   三波编成：清掉 W2（非末波）后停在 lineHold，阈值 = lineXs[1]−margin = 1200−400 = 800，
  //   玩家 500 < 800 ⇒ 干等多久都不发 W3（末波不清就没有 victory，也不软锁）。
  {
    const enc = createEncounter({ seed: 22, mode: 'lines', rules: Object.assign({}, CFG, {
      waves: [
        { id: 'L1', label: '一', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'L2', label: '二', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'L3', label: '三', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
      ],
    }), lineXs: [800, 1200, 1500] });
    const ctx = mkCtx({ playerPos: { x: 500, y: 432 } });
    // 烧掉 telegraph，spawn W1
    updateEncounter(enc, 0.1, ctx);
    updateEncounter(enc, 2.0, ctx);
    ctx.enemyAlive = 1;
    // 清掉 W1（页面视角：killAfter 后清光）
    updateEncounter(enc, 5.0, ctx);
    ctx.enemyAlive = 0;
    const clearEv = updateEncounter(enc, 0.1, ctx);
    ok(clearEv.some(e => e.type === 'wave-clear'), '⑭b W1 wave-clear');
    eq(enc.phase, 'lineHold', '⑭b 清波后 lineHold');
    // margin=RULES lineAdvanceMargin=400 ⇒ 阈值 = 800−400=400，玩家 x=500 ≥ 400 ⇒ 应立即发 W2
    const evs = updateEncounter(enc, 0.1, ctx);
    const tg = evs.find(e => e.type === 'telegraph');
    ok(!!tg && tg.wave === 1, `⑭b 玩家越过防线 1（500 ≥ 800−400）同帧发 W2 telegraph`);
    eq(enc.phase, 'telegraph', '⑭b phase 切到 telegraph');
    // 未推进到防线 2（阈值 1200−400=800，玩家 500 < 800）：W2 清掉后卡在 lineHold
    updateEncounter(enc, 2.0, ctx);          // spawn W2
    ctx.enemyAlive = 1;
    updateEncounter(enc, 5.0, ctx);
    ctx.enemyAlive = 0;
    updateEncounter(enc, 0.1, ctx);          // wave-clear → lineHold
    eq(enc.phase, 'lineHold', '⑭b W2 清后停在 lineHold（未推进到防线 2）');
    for (let i = 0; i < 30; i++) updateEncounter(enc, 1.0, ctx);   // 干等 30s
    eq(enc.phase, 'lineHold', '⑭b 干等 30s 仍 lineHold（不推进不发波）');
    eq(enc.outcome, null, '⑭b 不软锁成终局，只等玩家');
  }
  // --- ⑭c 全防线清空 → victory；lineXs 缺省退化为「清波即发」 ---
  {
    const rules = Object.assign({}, CFG, {
      waves: [{ id: 'L1', label: '一', units: [{ cls: 'medium', bearing: 0, count: 1 }] }],
    });
    const p = play({ seed: 23, mode: 'lines', rules, lineXs: [900], killAfter: 1 });
    ok(p.enc.outcome === 'victory', `⑭c 单波 lines 清完即 victory（实到 ${p.enc.outcome}）`);
    // lineXs 缺省：两波不软锁、依次发
    const rules2 = Object.assign({}, CFG, {
      waves: [
        { id: 'L1', label: '一', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'L2', label: '二', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
      ],
    });
    const p2 = play({ seed: 24, mode: 'lines', rules: rules2, killAfter: 1 });
    ok(findAll(p2.log, 'telegraph').length === 2, `⑭c 无 lineXs 退化「清波即发」：两波都 telegraph（实到 ${findAll(p2.log, 'telegraph').length}）`);
    ok(p2.enc.outcome === 'victory', `⑭c 无 lineXs 也能打到 victory（实到 ${p2.enc.outcome}）`);
  }
  // --- ⑭d timed 模式（缺省）不受影响：清波后是定时 breather，phase 不是 lineHold ---
  {
    const rules = Object.assign({}, CFG, {
      waves: [
        { id: 'L1', label: '一', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'L2', label: '二', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
      ],
    });
    const p = play({ seed: 25, rules, killAfter: 1, ctx0: {}, maxFrames: 400 });
    const br = findAll(p.log, 'breather');
    ok(br.length >= 1 && br[0].seconds === CFG.breatherSeconds, `⑭d timed breather.seconds=${CFG.breatherSeconds}（实到 ${br.length ? br[0].seconds : '无'}）`);
    ok(p.enc.phase === 'breather' || p.enc.outcome === 'victory',
      `⑭d timed 模式清波进 breather 非 lineHold（phase=${p.enc.phase}）`);
    ok(p.enc.outcome === 'victory', `⑭d timed 模式照常打到 victory（实到 ${p.enc.outcome}）`);
  }
  // --- ⑭e 哨兵：RULES.encounter.lineAdvanceMargin 真被消费 ---
  {
    const rules = Object.assign({}, CFG, {
      lineAdvanceMargin: 0,
      waves: [
        { id: 'L1', label: '一', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'L2', label: '二', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
      ],
    });
    const enc = createEncounter({ seed: 26, mode: 'lines', rules, lineXs: [800, 1200] });
    const ctx = mkCtx({ playerPos: { x: 799, y: 432 } });    // margin=0 ⇒ 须 ≥800，799 差 1px 不过线
    updateEncounter(enc, 0.1, ctx); updateEncounter(enc, 2.0, ctx);
    ctx.enemyAlive = 1; updateEncounter(enc, 5.0, ctx); ctx.enemyAlive = 0;
    updateEncounter(enc, 0.1, ctx);          // wave-clear → lineHold
    const evs = updateEncounter(enc, 0.1, ctx);
    ok(!evs.some(e => e.type === 'telegraph'), '⑭e margin=0：玩家 799 < 防线 800 不发波');
    ctx.playerPos = { x: 800, y: 432 };
    const evs2 = updateEncounter(enc, 0.1, ctx);
    ok(evs2.some(e => e.type === 'telegraph'), '⑭e margin=0：玩家 800 ≥ 800 立即发波');
  }
  // --- ⑭f 负向：mode:'lines' 之外传 mode:'bogus' 落回 timed（未知值不猜测） ---
  {
    const enc = createEncounter({ seed: 27, mode: 'bogus' });
    eq(enc.mode, 'timed', '⑭f 未知 mode 落回 timed（白名单二值，不猜）');
  }
}

// ================================================================ ⑮ 波↔防线绑定同源（2026-10-30 P1-F）
// 锁的语义（为什么必须有这一段，见 encounterLineXFor 的 rationale 注释）：
//   ① encounterLineXFor 是「波 i 绑定哪道防线」的唯一数据源——waveIndex 超界钳到**末元素**
//      （不是取模折回），永不返回 undefined；负值/NaN/undefined 防御到第 0 波；lineXs 空 → null。
//   ② telegraph.lineX 与 spawn.lineX 都 === encounterLineXFor(enc, 该波 waveIndex) —— 同源证明。
//   ③ lines 模式 lineHold 的推进判据确实用同一个函数：构造 waveIndex 超界（波数 > 防线数）
//      的场景，其推进阈值与直接调用 encounterLineXFor 的返回值逐 px 一致，并与页面旧口径
//      `waveIdx % lineCount`（会把超界的波折回第一道防线）**显式分叉**。
//   ④ 负向：用内存态变异 enc.lineXs（改短 / 清空，**用完即恢复**）证明「lineXs 退化为空 ⇒
//      lineHold 退化为清波即发、不软锁」这条保护真在生效——保护被删时下面那组断言会当场变红。
//      本位移 CallSign 不改 RULES 全局（⑨/⑫/⑭e 那种 RULES 变异哨兵不适用于「运行时退化」语义）。
section('⑮ 波↔防线绑定同源：encounterLineXFor（2026-10-30 P1-F）');
{
  const LINE_X_FOR = ENC.encounterLineXFor;
  ok(typeof LINE_X_FOR === 'function', '⑮ encounterLineXFor 已导出（module.exports 纯增补，既有导出未删）');

  // --- ⑮a 越界钳位与入参防御 ---
  {
    const enc = createEncounter({ seed: 101, mode: 'lines', lineXs: [800, 1200, 1500] });
    eq(LINE_X_FOR(enc, 0), 800, '⑮a waveIndex 0 → lineXs[0]');
    eq(LINE_X_FOR(enc, 1), 1200, '⑮a waveIndex 1 → lineXs[1]');
    eq(LINE_X_FOR(enc, 2), 1500, '⑮a waveIndex 2 → lineXs[2]');
    eq(LINE_X_FOR(enc, 3), 1500, '⑮a waveIndex 3（超界 1 位）钳到末元素 1500');
    eq(LINE_X_FOR(enc, 99), 1500, '⑮a waveIndex 99（远超防线数）仍钳到末元素');
    let bad = 0;
    for (let i = 0; i < 40; i++) if (typeof LINE_X_FOR(enc, i) !== 'number') bad++;
    eq(bad, 0, '⑮a 波数远多于防线数：0~39 全部取到数字（无越界 / undefined）');
    eq(LINE_X_FOR(enc, -1), 800, '⑮a waveIndex −1 防御到第 0 波（不是 lineXs[-1]=undefined）');
    eq(LINE_X_FOR(enc, NaN), 800, '⑮a waveIndex NaN 防御到第 0 波');
    eq(LINE_X_FOR(enc, undefined), 800, '⑮a waveIndex undefined 防御到第 0 波');
    const emptied = createEncounter({ seed: 101, mode: 'lines', lineXs: [] });
    eq(LINE_X_FOR(emptied, 0), null, '⑮a lineXs 空数组 → null（退化路径的唯一信号）');
    const noLines = createEncounter({ seed: 101, mode: 'lines' });
    eq(LINE_X_FOR(noLines, 2), null, '⑮a 未传 lineXs → null');
  }

  // --- ⑮b telegraph / spawn 事件的 lineX 与该波 encounterLineXFor 同值（同源证明） ---
  {
    // 三波 vs 两道防线 ⇒ 第 3 波（index 2）必然超界，正好同时验证「钳末 ≠ 取模」
    const rules = Object.assign({}, CFG, {
      waves: [
        { id: 'X1', label: '一', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'X2', label: '二', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'X3', label: '三', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
      ],
    });
    const p = play({ seed: 102, mode: 'lines', rules, lineXs: [800, 1200], killAfter: 1,
      ctx0: { playerPos: { x: 2000, y: 432 } } });   // 玩家一路在最前 ⇒ 每波清完立即发下一波
    const tgs = findAll(p.log, 'telegraph');
    const sps = findAll(p.log, 'spawn');
    eq(tgs.length, 3, '⑮b 三波各一条 telegraph');
    eq(sps.length, 3, '⑮b 三波各一条 spawn');
    for (let i = 0; i < 3; i++) {
      const want = LINE_X_FOR(p.enc, i);
      eq(tgs[i].lineX, want, `⑮b telegraph[${i}].lineX === encounterLineXFor(enc, ${i})`);
      eq(sps[i].lineX, want, `⑮b spawn[${i}].lineX === encounterLineXFor(enc, ${i})`);
      eq(tgs[i].lineX, sps[i].lineX, `⑮b 第 ${i + 1} 波 telegraph 与 spawn 的 lineX 同值（同源）`);
    }
    // 超界波的取值：**钳末 1200**，不是页面旧口径 `waveIdx % lineCount`(2 % 2 = 0) ⇒ 800
    eq(tgs[2].lineX, 1200, '⑮b 第 3 波（index 2 超界）lineX = 1200（钳末）');
    ok(tgs[2].lineX !== 800, '⑮b 第 3 波 lineX ≠ 800（与旧 `waveIdx % lineCount` 口径显式分叉）');
    eq(p.enc.boundLineX, 1200, '⑮b 末波进 enterTelegraph 时写入 boundLineX=1200 且可读');
    const fresh = createEncounter({ seed: 103, mode: 'lines', lineXs: [800, 1200] });
    eq(fresh.boundLineX, null, '⑮b 创建时 boundLineX 初值 null（还没进任何一波）');
    updateEncounter(fresh, 0.1, mkCtx());
    eq(fresh.boundLineX, 800, '⑮b 首帧补发 telegraph 时按 waveIndex 0 写入 boundLineX');
  }

  // --- ⑮c lineHold 推进判据确实用同一个函数（构造 waveIndex 超界场景） ---
  {
    const rules4 = Object.assign({}, CFG, {
      waves: [
        { id: 'Y1', label: '一', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'Y2', label: '二', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'Y3', label: '三', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'Y4', label: '四', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
      ],
    });
    /** 清掉当前这一波并返回本帧事件：telegraph → spawn → 敌人存活 → 清空。 */
    const clearWaveOnce = (enc, ctx) => {
      updateEncounter(enc, 0.1, ctx);          // 补发 telegraph（或 lineHold → 下一波 telegraph）
      updateEncounter(enc, 2.0, ctx);          // telegraph 到点 → spawn
      ctx.enemyAlive = 1;
      updateEncounter(enc, 0.5, ctx);
      ctx.enemyAlive = 0;
      return updateEncounter(enc, 0.1, ctx);   // wave-clear → lineHold / victory
    };
    // 4 波 vs 2 道防线 ⇒ 清掉第 3 波（index 2）后进 lineHold，此时 waveIndex=2 **超界**
    const enc = createEncounter({ seed: 104, mode: 'lines', rules: rules4, lineXs: [800, 1200] });
    const ctx = mkCtx({ playerPos: { x: 2000, y: 432 } });   // 一路在最前：连清三波
    clearWaveOnce(enc, ctx);                     // W1
    clearWaveOnce(enc, ctx);                     // W2
    const evc = clearWaveOnce(enc, ctx);         // W3
    ok(evc.some(e => e.type === 'wave-clear'), '⑮c 第 3 波 wave-clear');
    eq(enc.waveIndex, 2, '⑮c 停在 waveIndex=2（超界：lineXs 只有 2 道防线）');
    eq(enc.phase, 'lineHold', '⑮c 第 3 波清完进 lineHold');
    const bound = LINE_X_FOR(enc, enc.waveIndex);
    eq(bound, 1200, '⑮c 超界 waveIndex 绑定防线 = 1200（钳末，非取模的 800）');
    const threshold = bound - enc.cfg.lineAdvanceMargin;
    eq(threshold, 800, '⑮c 该函数给出的阈值 = 1200 − 400 = 800');
    ctx.playerPos = { x: threshold - 200, y: 432 };          // 600 < 800
    ok(!updateEncounter(enc, 0.1, ctx).some(e => e.type === 'telegraph'),
      '⑮c 玩家 600 < 阈值 800 ⇒ 不发波（行为与 encounterLineXFor 返回值一致）');
    eq(enc.phase, 'lineHold', '⑮c 未过线仍停在 lineHold');
    ctx.playerPos = { x: threshold - 1, y: 432 };            // 799，差 1px
    ok(!updateEncounter(enc, 0.1, ctx).some(e => e.type === 'telegraph'),
      '⑮c 玩家 799（差 1px）⇒ 不发波（阈值精确到 px，不是「差不多就发」）');
    ctx.playerPos = { x: threshold, y: 432 };                // 800，恰好过线
    ok(updateEncounter(enc, 0.1, ctx).some(e => e.type === 'telegraph'),
      '⑮c 玩家 800 ≥ 800 ⇒ 同帧发第 4 波 telegraph（阈值与函数返回值逐 px 一致）');
    eq(enc.waveIndex, 3, '⑮c waveIndex 推进到 3');
    // 敏感性说明（写在注释里防误读）：若 lineHold 退回旧口径 `waveIdx % lineCount`，
    //   这里第 3 波会绑到 lineXs[0]=800 ⇒ 阈值 400，上面「玩家 600 不发波」立刻变红。
  }

  // --- ⑮d 负向：lineXs 内存态变异 ⇒ 证明「退化为空仍不软锁」的保护真在生效 ---
  {
    const rules3 = Object.assign({}, CFG, {
      waves: [
        { id: 'Z1', label: '一', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'Z2', label: '二', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
        { id: 'Z3', label: '三', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
      ],
    });
    const enc = createEncounter({ seed: 105, mode: 'lines', rules: rules3, lineXs: [800, 1200] });
    const savedRef = enc.lineXs;
    const ctx = mkCtx({ playerPos: { x: 2000, y: 432 } });
    const clearWaveOnce = (e, c) => {
      updateEncounter(e, 0.1, c); updateEncounter(e, 2.0, c);
      c.enemyAlive = 1; updateEncounter(e, 0.5, c); c.enemyAlive = 0;
      return updateEncounter(e, 0.1, c);
    };
    clearWaveOnce(enc, ctx);                    // W1 清 → lineHold（waveIndex=0）
    eq(enc.phase, 'lineHold', '⑮d 构造成功：W1 清完进 lineHold');
    eq(enc.waveIndex, 0, '⑮d 停在 waveIndex=0');

    // (1) 基线：防线数据完好 + 玩家没推进 ⇒ **不发波**（这才是「防线驱动」的本意）
    ctx.playerPos = { x: 100, y: 432 };
    ok(!updateEncounter(enc, 0.1, ctx).some(e => e.type === 'telegraph'),
      '⑮d 基线：玩家 100 远未过防线（阈值 400）⇒ 不发波');
    eq(enc.phase, 'lineHold', '⑮d 基线：停在 lineHold 等玩家推进');

    // (2) 改短：lineXs 缩到一道 ⇒ 绑定值仍是该道（说明判据**实时读数组**，不是创建时的快照）
    try {
      enc.lineXs = [1400];
      eq(LINE_X_FOR(enc, enc.waveIndex), 1400, '⑮d 变异成功：改短为 [1400] 后绑定值随之变化');
      ctx.playerPos = { x: 999, y: 432 };       // 阈值 = 1400−400 = 1000，差 1px
      ok(!updateEncounter(enc, 0.1, ctx).some(e => e.type === 'telegraph'),
        '⑮d 改短后：阈值随新数组重算为 1000，玩家 999 仍不发波');
      ctx.playerPos = { x: 1000, y: 432 };
      ok(updateEncounter(enc, 0.1, ctx).some(e => e.type === 'telegraph'),
        '⑮d 改短后：玩家 1000 ≥ 1000 ⇒ 发波（判据与新 lineXs 一致，非旧快照）');
    } finally {
      enc.lineXs = savedRef;
    }
    eq(enc.lineXs, savedRef, '⑮d 变异已恢复：enc.lineXs 还原为原数组引用');
    eq(enc.lineXs.join(','), '800,1200', '⑮d 变异已恢复：内容仍是 800,1200');

    // (3) 负向核心：清空 lineXs（页面没传锚点 / 锚点全失效的退化场景）
    //     ↔ 若 lineHold 的 `lineX === null ||` 保护被删，这里会**永远不发波 ⇒ 软锁**，
    //        下面这组断言当场变红。这是本节唯一真正锁死「不软锁」语义的地方。
    updateEncounter(enc, 2.0, ctx);             // W2 spawn
    ctx.enemyAlive = 1; updateEncounter(enc, 0.5, ctx); ctx.enemyAlive = 0;
    updateEncounter(enc, 0.1, ctx);             // W2 清 → lineHold（waveIndex=1）
    eq(enc.phase, 'lineHold', '⑮d 构造成功：W2 清完再次进 lineHold');
    ctx.playerPos = { x: 100, y: 432 };         // 玩家退到最后方，绝无可能「真的推进到了防线」
    ok(!updateEncounter(enc, 0.1, ctx).some(e => e.type === 'telegraph'),
      '⑮d 清空前对照：玩家 100 未过防线 2（阈值 800）⇒ 不发波（断言本身是敏感的）');
    try {
      enc.lineXs = [];
      eq(LINE_X_FOR(enc, enc.waveIndex), null, '⑮d 变异成功：清空后该函数返回 null');
      const ev = updateEncounter(enc, 0.1, ctx);
      const tg = ev.find(e => e.type === 'telegraph');
      ok(!!tg, '⑮d 负向：lineXs 退化为空 ⇒ lineHold 退化为「清波即发」立刻发 W3 telegraph（不软锁）');
      eq(enc.phase, 'telegraph', '⑮d 负向：确实离开了 lineHold（没有卡死）');
      eq(tg && tg.lineX, null, '⑮d 负向：退化态 telegraph.lineX = null（页面据此回退到 bearing 采样布点）');
      eq(tg && tg.wave, 2, '⑮d 负向：发出的是第 3 波（wave=2）而不是重发旧波');
    } finally {
      enc.lineXs = savedRef;
    }
    eq(enc.lineXs, savedRef, '⑮d 负向变异已恢复：enc.lineXs 还原为原数组引用');
    // 收尾：退化事件插曲之后，遭遇必须还能正常打到 victory（不软锁的最终形态）
    let guard = 0;
    while (!enc.outcome && guard < 4000) {
      for (const e of updateEncounter(enc, 0.5, ctx)) {
        if (e.type === 'spawn') { ctx.enemyAlive = e.units.length; }
      }
      if (ctx.enemyAlive > 0) { ctx.enemyAlive = 0; }
      guard++;
    }
    eq(enc.outcome, 'victory', `⑮d 退化插曲之后仍能打到 victory（不软锁，迭代 ${guard} 帧）`);
  }
}

// ============ ⑯ 标准模式钳制参数（D1a，2026-10-31 用户裁定「按 A：双钳制」）============
// 背景（ISSUES #AC4）：波数绑到防线数后，旧口径实测 diff=1 × 6 防线可达 60 辆/节点、
// 单波峰值 14 辆（旧铺敌上限 18 的 3.33×、「可逐一点名」红线 5 辆的 2.8×）。
// 本段锁住 RULES 侧新增的三道闸：单波总量（maxPerWave，语义定案）/ 节点总量（maxPerNode）/
// 同波同时存活（maxAlivePerWave，分批投送的基准）。页面侧消费逻辑另由浏览器链覆盖。
section('⑯ 标准模式钳制参数（D1a）');
{
  const sc = (RULES.encounter && RULES.encounter.standardScale) || {};
  const pi = (v) => Number.isFinite(v) && v > 0 && Math.floor(v) === v;

  // 不变式校验器：与页面/测试同口径的一组硬约束。抽成函数是为了能对它做**负向**构造——
  // 只断言「现行值是好的」是恒真保护，证明不了这套闸会在坏配置下变红。
  function validateScale(s0) {
    const bad = [];
    if (!pi(s0.maxPerWave)) bad.push('maxPerWave 非正整数');
    if (!pi(s0.maxPerNode)) bad.push('maxPerNode 非正整数');
    if (!pi(s0.maxAlivePerWave)) bad.push('maxAlivePerWave 非正整数');
    if (pi(s0.maxPerWave) && pi(s0.maxPerNode) && !(s0.maxPerWave < s0.maxPerNode)) {
      bad.push('单波封顶不严于节点封顶');
    }
    if (pi(s0.maxAlivePerWave) && pi(s0.maxPerWave) && !(s0.maxAlivePerWave <= s0.maxPerWave)) {
      bad.push('活体上限大于单波总量');
    }
    if (!(s0.maxPerNode >= 18 && s0.maxPerNode <= 24)) bad.push('节点钳制越出裁定区间 [18,24]');
    return bad;
  }

  ok(pi(sc.maxPerWave), `⑯a maxPerWave 是有限正整数（实到 ${sc.maxPerWave}）`);
  ok(pi(sc.maxPerNode), `⑯a maxPerNode 是有限正整数（实到 ${sc.maxPerNode}）`);
  ok(pi(sc.maxAlivePerWave), `⑯a maxAlivePerWave 是有限正整数（实到 ${sc.maxAlivePerWave}）`);
  ok(sc.maxPerWave < sc.maxPerNode, `⑯b 单波封顶严于节点封顶（${sc.maxPerWave} < ${sc.maxPerNode}）`);
  ok(sc.maxPerNode >= 18 && sc.maxPerNode <= 24, `⑯c 节点钳制落在裁定区间 [18,24]（实到 ${sc.maxPerNode}）`);
  ok(sc.maxAlivePerWave <= sc.maxPerWave, `⑯d 活体上限不大于单波总量（${sc.maxAlivePerWave} ≤ ${sc.maxPerWave}）`);
  ok(validateScale(sc).length === 0, `⑯e 现行参数通过不变式校验（实到 ${validateScale(sc).length} 项违规）`);

  // 负向 1：活体上限 > 单波总量 ⇒ 分批机制永不触发、钳制形同虚设 ⇒ 必须判非法
  const badAlive = Object.assign({}, sc, { maxAlivePerWave: sc.maxPerWave + 1 });
  ok(validateScale(badAlive).length > 0,
     `⑯e 负向：maxAlivePerWave > maxPerWave 被判非法（实到 ${validateScale(badAlive).length} 项违规 > 0）`);

  // 负向 2：单波 ≥ 节点 ⇒ 单波键无意义（节点闸必然先触发）⇒ 必须判非法
  const badWave = Object.assign({}, sc, { maxPerWave: sc.maxPerNode });
  ok(validateScale(badWave).length > 0,
     `⑯e 负向：maxPerWave ≥ maxPerNode 被判非法（实到 ${validateScale(badWave).length} 项违规 > 0）`);

  // 负向 3：节点钳制越界（例如被误改成 60，即本次要修的失控值）⇒ 必须判非法
  const badNode = Object.assign({}, sc, { maxPerNode: 60 });
  ok(validateScale(badNode).length > 0,
     `⑯e 负向：maxPerNode=60（#AC4 失控值）被判非法（实到 ${validateScale(badNode).length} 项违规 > 0）`);

  // 收尾：上面的负向构造一律用副本，不得污染 RULES 本体
  ok(RULES.encounter.standardScale.maxPerWave === sc.maxPerWave
     && RULES.encounter.standardScale.maxPerNode === sc.maxPerNode
     && RULES.encounter.standardScale.maxAlivePerWave === sc.maxAlivePerWave,
     '⑯f 负向构造未污染 RULES 本体（三键仍为原值）');
}

// ================= 2026-11-02 M3-E/F/G：节点任务类型的胜利条件（defend / capture / breakthrough） =================
// 类型只换胜利条件、不新开管线：仍走 telegraph→wave→breather/lineHold，终局载荷带类型字段。
{
  const W2 = { waves: [
    { id: 'T1', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
    { id: 'T2', units: [{ cls: 'medium', bearing: 0, count: 1 }] },
  ] };
  const runEnc = (enc, ctxFn, maxSec) => {
    const log = [];
    let t = 0;
    while (!enc.outcome && t < maxSec) {
      for (const e of updateEncounter(enc, 0.5, ctxFn(t))) log.push(e);
      t += 0.5;
    }
    return log;
  };

  section('M3-E 防御节点');
  {
    const enc = createEncounter({ seed: 31, rules: W2, kind: 'defend', mode: 'timed' });
    const log = runEnc(enc, () => mkCtx({ enemyAlive: 0, objectiveAlive: true }), 60);
    const v = log.find(e => e.type === 'victory');
    ok(enc.outcome === 'victory', 'M3-E：守点目标存活 + 波清 ⇒ victory');
    ok(v && v.objectiveFailed === false, 'M3-E：胜利载荷 objectiveFailed=false');
  }
  {
    const enc = createEncounter({ seed: 31, rules: W2, kind: 'defend', mode: 'timed' });
    const log = runEnc(enc, () => mkCtx({ enemyAlive: 0, objectiveAlive: false }), 60);
    const v = log.find(e => e.type === 'victory');
    ok(log.some(e => e.type === 'objective-lost'), 'M3-E：目标被毁 ⇒ 发 objective-lost');
    ok(enc.outcome === 'victory', 'M3-E 负向：目标被毁 ≠ gameover（仍以 victory 收场）');
    ok(v && v.objectiveFailed === true, 'M3-E：胜利载荷 objectiveFailed=true（存活 bonus 归零）');
  }

  section('M3-F 占领节点');
  {
    const enc = createEncounter({ seed: 32, rules: W2, kind: 'capture', captureTotal: 2, counterAttackAt: 0.5, mode: 'timed' });
    let done = 0;
    runEnc(enc, () => mkCtx({ enemyAlive: 0, captureDone: done }), 30);
    ok(enc.outcome === null, 'M3-F 负向：波清但未拔点 ⇒ 不判胜（不软判）');
    done = 1;
    const log2 = runEnc(enc, () => mkCtx({ enemyAlive: 0, captureDone: done }), 5);
    ok(log2.some(e => e.type === 'counterattack'), 'M3-F：读条过 50% ⇒ 发 counterattack');
    done = 2;
    const log3 = runEnc(enc, () => mkCtx({ enemyAlive: 0, captureDone: done }), 5);
    const v = log3.find(e => e.type === 'victory');
    ok(enc.outcome === 'victory', 'M3-F：拔满点 ⇒ victory');
    ok(v && v.captureDone === 2, 'M3-F：胜利载荷 captureDone=2');
  }

  section('M3-G 突破节点');
  {
    const enc = createEncounter({ seed: 33, rules: W2, kind: 'breakthrough', timeLimitSeconds: 10, mode: 'timed' });
    const log = runEnc(enc, () => mkCtx({ enemyAlive: 0, reachedExit: false }), 30);
    const s = log.find(e => e.type === 'settlement');
    ok(log.some(e => e.type === 'timeout'), 'M3-G：超时 ⇒ 发 timeout');
    ok(enc.outcome === 'settlement', 'M3-G：超时 ⇒ settlement（不是 defeat/gameover）');
    ok(s && s.reason === 'timeout', 'M3-G：结算载荷 reason=timeout');
  }
  {
    const enc = createEncounter({ seed: 34, rules: W2, kind: 'breakthrough', timeLimitSeconds: 60, mode: 'timed' });
    const log = runEnc(enc, () => mkCtx({ enemyAlive: 0, reachedExit: true }), 5);
    const v = log.find(e => e.type === 'victory');
    ok(enc.outcome === 'victory', 'M3-G：时限内抵达出口 ⇒ victory');
    ok(v && v.reason === 'exit', 'M3-G：胜利载荷 reason=exit');
  }
  {
    // 配置缺失（timeLimitSeconds=0）⇒ 回落「波清判胜」，绝不软锁
    const enc = createEncounter({ seed: 36, rules: W2, kind: 'breakthrough', timeLimitSeconds: 0, mode: 'timed' });
    runEnc(enc, () => mkCtx({ enemyAlive: 0, reachedExit: false }), 60);
    ok(enc.outcome === 'victory', 'M3-G 负向：时限=0 ⇒ 回落波清判胜，不软锁');
  }

  section('M3-E/F/G 零回归');
  {
    const enc = createEncounter({ seed: 35, rules: W2, mode: 'timed' });
    const log = runEnc(enc, () => mkCtx({ enemyAlive: 0 }), 60);
    const v = log.find(e => e.type === 'victory');
    ok(enc.outcome === 'victory' && v
       && v.objectiveFailed === undefined && v.captureDone === undefined && v.reason === undefined,
       'M3-E/F/G 零回归：exterminate 胜利载荷不带类型字段');
  }
}

console.log(`\n${fails === 0 ? '全部通过' : fails + ' 项失败'}：test-encounter.js`);
process.exitCode = fails === 0 ? 0 : 1;
