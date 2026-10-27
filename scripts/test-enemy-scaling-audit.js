// test-enemy-scaling-audit.js — 敌军难度缩放三层审计（2026-10-26 §4.143 前置）
// 运行：node scripts/test-enemy-scaling-audit.js
//
// 背景：用户质疑「全属性乘数可能不能使用同一个参数」。敌军强度实际是四层叠加：
//   enemyAnchorBase × enemyClassProfiles × entityMults(diff) × difficultyCapMuls
// 其中 entityMults 是十键 [low, high] 线性插值表，全部共享同一条 diffNorm 轴。
// 本脚本回答三个问题：
//   ① 每个键**真的生效**吗（有没有死键 / 被 difficultyCapMuls 二次改写覆盖）？
//   ② 难度曲线实际形状是什么（哪些属性在涨、涨多少）？
//   ③ 换算成 TTK / DPS 后，难度感到底来自哪个维度？
'use strict';

const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const M = require('../js/tank_model.js');
global.makeTank = M.makeTank;
global.applyEnemyAppearanceAndStats = M.applyEnemyAppearanceAndStats;
global.difficultyCapMuls = M.difficultyCapMuls;
global.addModifier = M.addModifier;
global.refreshStats = M.refreshStats;

const MAP = require('../js/tank_map.js');
const entityMultsForDifficulty = MAP.entityMultsForDifficulty;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label}`); fails++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

// ---- 复刻 battle applyDifficultyMults 的完整链路 ----
// tank_battle.html:2689 —— entityMults 注入 + difficultyCapMuls 封顶
function buildEnemy(cls, mults, applyCap, diffNorm, randFactor) {
  const t = global.makeTank({ id: 'audit', team: 'enemy', x: 0, y: 0, hullAngle: 0, turretAngle: 0 });
  global.applyEnemyAppearanceAndStats(t, { heightClass: cls, hull: null, turret: null }, null, mults);
  if (applyCap) {
    const caps = global.difficultyCapMuls(t, { diffNorm: diffNorm, randFactor: randFactor });
    const CAP_STAT = { penMul: 'penetration', dmgFloorMul: 'damage', dmgCapMul: 'damage', speedMul: 'maxSpeed' };
    for (const key in caps) {
      global.addModifier(t, { stat: CAP_STAT[key], mode: 'mult', value: caps[key], source: 'difficulty-cap', scope: 'run' });
    }
    global.refreshStats(t);
  }
  return t;
}

const DIFF_MAX = RULES_MOD.RULES.difficulty.diffMax || 1.15;
// battle 的 diffNorm 口径：tank_battle.html:2713 (diff-0.15)/(0.95-0.15)
const battleDiffNorm = (diff) => Math.max(0, Math.min(1, (diff - 0.15) / (0.95 - 0.15)));

// ============================================================
section('① 单键生效性：只改一个键 ×2，终值是否变化');
{
  const base = entityMultsForDifficulty(0.15);   // 首节点实际难度
  const KEYS = ['maxHp', 'penetration', 'damage', 'armorAll', 'reload', 'spreadMult', 'aimSpeed', 'maxSpeed', 'turnRate', 'turretTurnRate'];

  console.log('  (diffNorm=0.5, randFactor=1.0, medium)');
  const results = {};
  for (const k of KEYS) {
    const probe = Object.assign({}, base, { [k]: (base[k] || 1) * 2 });
    const tA = buildEnemy('medium', base, true, 0.5, 1.0);
    const tB = buildEnemy('medium', probe, true, 0.5, 1.0);
    // 取该键直接对应的 stat 做对比（armorAll 看 hull.front）
    const statKey = k === 'armorAll' ? 'hullFront' : k;
    const valA = k === 'armorAll' ? tA.stats.armor.hull.front : tA.stats[k];
    const valB = k === 'armorAll' ? tB.stats.armor.hull.front : tB.stats[k];
    const changed = Math.abs(valB - valA) > 1e-6;
    results[k] = changed;
    console.log(`    ${k.padEnd(16)} ${String(valA).padStart(10)} → ${String(valB).padStart(10)}  ${changed ? '生效' : '★无效★'}`);
  }

  ok(results.maxHp === true, 'maxHp 生效');
  ok(results.armorAll === true, 'armorAll 生效');
  ok(results.reload === true, 'reload 生效');
  ok(results.spreadMult === true, 'spreadMult 生效');
  ok(results.aimSpeed === true, 'aimSpeed 生效');
  ok(results.turnRate === true, 'turnRate 生效');
  ok(results.turretTurnRate === true, 'turretTurnRate 生效');
  // 预期：penetration/damage 在 diffNorm=0.5 时可能生效（未触顶），maxSpeed 必然无效。
  // 这里不断言死，改为记录（下面第二层专门量化）。
  console.log(`    → 疑似无效键：${KEYS.filter(k => !results[k]).join(', ') || '（无）'}`);
}

// ============================================================
section('② maxSpeed 死键验证（speedVsBaseline 完全覆盖）');
{
  // entityMults.maxSpeed 拉满 ×2，终值应纹丝不动（speedVsBaseline 直算目标速度）
  const m0 = entityMultsForDifficulty(0.15);
  const mFast = Object.assign({}, m0, { maxSpeed: (m0.maxSpeed || 0.7) * 2 });
  const t0 = buildEnemy('medium', m0, true, 0.5, 1.0);
  const tFast = buildEnemy('medium', mFast, true, 0.5, 1.0);
  ok(Math.abs(t0.stats.maxSpeed - tFast.stats.maxSpeed) < 1e-6,
    `entityMults.maxSpeed 翻倍无效：${t0.stats.maxSpeed} vs ${tFast.stats.maxSpeed}（speedVsBaseline 直算覆盖）`);

  // 反证：randFactor 确实驱动速度（证明覆盖者生效）
  const tSlow = buildEnemy('medium', m0, true, 0.5, 0.85);
  const tQuick = buildEnemy('medium', m0, true, 0.5, 1.15);
  ok(tSlow.stats.maxSpeed < tQuick.stats.maxSpeed,
    `randFactor 驱动极速：${tSlow.stats.maxSpeed} < ${tQuick.stats.maxSpeed}（覆盖者 = speedVsBaseline）`);
}

// ============================================================
section('③ penetration/damage 名义值验证（difficultyCapMuls 二次改写）');
{
  // 满难度穿深：entityMults 推高 → difficultyCapMuls 压回 penCap
  const mHi = entityMultsForDifficulty(0.95);
  const anchorPen = RULES_MOD.RULES.enemyAnchorBase.penetration;
  const penCap = anchorPen * (RULES_MOD.RULES.difficulty.penCapVsBaseline !== undefined
    ? RULES_MOD.RULES.difficulty.penCapVsBaseline : 1.2);
  const nominal = anchorPen * mHi.penetration;   // entityMults 想给的值
  const tHi = buildEnemy('medium', mHi, true, battleDiffNorm(0.95), 1.0);
  console.log(`    entityMults 名义穿深 = ${nominal.toFixed(1)}，penCap 封顶 = ${penCap.toFixed(1)}，实际 = ${tHi.stats.penetration.toFixed(1)}`);
  ok(tHi.stats.penetration <= penCap + 1e-6,
    `满难度穿深被 penCap 压制（${tHi.stats.penetration.toFixed(1)} ≤ ${penCap.toFixed(1)}）`);

  // 低难度伤害：dmgFloor 抬升
  const mLo = entityMultsForDifficulty(0.15);
  const anchorDmg = RULES_MOD.RULES.enemyAnchorBase.damage;
  const dmgFloor = anchorDmg * (RULES_MOD.RULES.difficulty.dmgFloorVsBaseline !== undefined
    ? RULES_MOD.RULES.difficulty.dmgFloorVsBaseline : 0.4);
  const tLo = buildEnemy('medium', mLo, true, battleDiffNorm(0.15), 1.0);
  console.log(`    entityMults 名义伤害 = ${(anchorDmg * mLo.damage).toFixed(1)}，dmgFloor 地板 = ${dmgFloor.toFixed(1)}，实际 = ${tLo.stats.damage.toFixed(1)}`);
  ok(tLo.stats.damage >= dmgFloor - 1e-6,
    `低难度伤害被 dmgFloor 托底（${tLo.stats.damage.toFixed(1)} ≥ ${dmgFloor.toFixed(1)}）`);
}

// ============================================================
section('④ 难度曲线快照（普通 medium 敌人，randFactor=1.0）');
{
  const diffs = [0.15, 0.4, 0.7, 0.95];
  const rows = [];
  for (const d of diffs) {
    const m = entityMultsForDifficulty(d);
    const t = buildEnemy('medium', m, true, battleDiffNorm(d), 1.0);
    rows.push({
      diff: d, hp: t.stats.maxHp, pen: t.stats.penetration, dmg: t.stats.damage,
      armorF: t.stats.armor.hull.front, reload: t.stats.reload, speed: t.stats.maxSpeed,
      spread: t.stats.spreadMult, aim: t.stats.aimSpeed, turn: t.stats.turnRate
    });
  }
  console.log('    diff  |   HP  | 穿深 | 伤害 | 装甲F | 装填 | 极速 | 散布 | 缩圈 | 车转');
  for (const r of rows) {
    console.log(`    ${String(r.diff).padStart(4)}  | ${String(r.hp).padStart(5)} | ${String(r.pen).padStart(4)} | ${String(r.dmg).padStart(4)} | ${String(r.armorF).padStart(5)} | ${String(r.reload).padStart(4)} | ${String(r.speed).padStart(4)} | ${String(r.spread).padStart(4)} | ${String(r.aim).padStart(4)} | ${String(r.turn).padStart(4)}`);
  }
  const lo = rows[0], hi = rows[rows.length - 1];
  const ratio = (a, b) => (b / a).toFixed(2) + '×';
  console.log(`    低→高难度倍数：HP ${ratio(lo.hp, hi.hp)} · 穿深 ${ratio(lo.pen, hi.pen)} · 伤害 ${ratio(lo.dmg, hi.dmg)} · 装甲 ${ratio(lo.armorF, hi.armorF)} · 装填 ${ratio(lo.reload, hi.reload)} · 极速 ${ratio(lo.speed, hi.speed)}`);

  // 核心断言：HP 成长必须显著大于其它维度（否则难度曲线不是血量单极）
  const hpRatio = hi.hp / lo.hp;
  const penRatio = hi.pen / lo.pen;
  const spdRatio = hi.speed / lo.speed;
  ok(hpRatio > penRatio && hpRatio > spdRatio,
    `难度成长主维度 = 血量（HP ${hpRatio.toFixed(2)}× > 穿深 ${penRatio.toFixed(2)}× / 极速 ${spdRatio.toFixed(2)}×）`);
}

// ============================================================
section('⑤ Boss vs 普通敌人：同一张表两种语义');
{
  // Boss 走 applyPlayerCap=false ⇒ 十项全生效；普通敌人 maxSpeed 被覆盖
  const m = entityMultsForDifficulty(0.95);
  const boss = buildEnemy('medium', m, false, battleDiffNorm(0.95), 1.0);   // 跳过封顶
  const normal = buildEnemy('medium', m, true, battleDiffNorm(0.95), 1.0);  // 走封顶
  console.log(`    Boss(不封顶)   穿深 ${boss.stats.penetration.toFixed(1)} / 伤害 ${boss.stats.damage.toFixed(1)} / 极速 ${boss.stats.maxSpeed.toFixed(1)}`);
  console.log(`    普通(封顶)     穿深 ${normal.stats.penetration.toFixed(1)} / 伤害 ${normal.stats.damage.toFixed(1)} / 极速 ${normal.stats.maxSpeed.toFixed(1)}`);
  ok(boss.stats.penetration > normal.stats.penetration + 1e-6,
    'Boss 穿深高于普通敌人（封顶只作用于普通路径 ⇒ 同表不同语义）');
  ok(Math.abs(boss.stats.maxSpeed - normal.stats.maxSpeed) > 1e-6,
    'Boss 与普通敌人极速不同（Boss 不覆盖 ⇒ entityMults.maxSpeed 只对 Boss 生效）');
}

console.log('');
if (fails) { console.error(`test-enemy-scaling-audit: ${fails} 项失败`); process.exit(1); }
console.log('test-enemy-scaling-audit: 完成所有检查，全部通过');
