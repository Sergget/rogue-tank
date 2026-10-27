// audit-growth-curve.js — 玩家 vs 敌人 成长曲线审计（2026-10-27）
// 运行：node scripts/audit-growth-curve.js [--nodes=13] [--shots=200] [--md=<path>]
//
// 为什么不用「属性对属性」对比（设计方法论的结论，见 DEVELOPMENT §4.144）：
//   ① 玩家成长不是一条曲线——局内商店价格指数增长（costGrowth 1.5~1.8）+ 收入有限
//      ⇒ 「某项升满」的曲线是虚构的，真实形态是**受资源约束的包络**；
//   ② 穿深 vs 装甲的差值不代表能/不能击穿（等效厚度 = armor/cosθ，还有跳弹角）；
//   ③ 属性曲线看不见「靠走位和技能」这一设计意图——那是战斗结局维度。
//   所以本脚本输出**战斗结局**：玩家 TTK 敌人 / 敌人 TTK 玩家 / 优势度。
//
// 方法：
//   1. 玩家侧 = 5 种真实可达的**商店购买轨迹**（每节点按实际收入消费，价格用 runShopPriceFor）；
//   2. 敌人侧 = enemyAnchorBase × enemyClassProfiles × entityMults × difficultyCapMuls（真实四层）；
//   3. 双向 TTK 走真实 resolveHit 蒙特卡洛（击穿率/跳弹/模块/未击穿残余全算），
//      不用纸面 pen-vs-armor 差值；
//   4. 主输出 = 优势度 = 敌人TTK玩家 / 玩家TTK敌人（>1 玩家占优）。
//      理想形态：随节点**缓慢下降但始终 >1**，末节点逼近 1（有压力但可控）。
//
// 口径边界（明确不做的）：
//   · 卡牌（196 张随机 + 选择）留第二期——用期望增益近似，不穷举；
//   · 局前永久升级默认 0 级（新玩家基准），可 --upgrades 传等级；
//   · 玩家驾驶水平不建模（用「正面对射」为基准场景，侧翼作为不利场景单列）。
//
// ⚠️ 模型局限（读结果前必看，否则会误判）：
//   1. **这是绝对下限玩家**：零卡牌 + 零技能（修理箱/医疗包/护盾/烟幕）+ 零永久升级 +
//      零走位。真实玩家优势度会显著高于本表。用它判断「会不会卡死」，不要用它判断「难度是否合适」。
//   2. **固定入射角无法体现机动流价值**：机动 build 的实际收益是「绕侧/拉开距离/躲掩体」，
//      本脚本把距离与角度都固定 ⇒ 机动 build 的读数被系统性低估（末节点 ~0.55）。
//      要评估机动流，需配合实机测试或把走位建模进场景。
//   3. **build 策略是「理想化的理性玩家」**：真实玩家会拿卡牌冲动消费、可能不买穿深。
//      greedy（每次买最便宜）用来代表「不规划的玩家」，其读数更有参考价值。
//   4. **"纯路线打不过"是可接受的**：纯火力/纯装甲/纯机动 末节点 0.55~0.79 意味着
//      「零补短的极端 build 会卡死」，这是取舍代价而非平衡缺陷——商店是自选项。
'use strict';

const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate; global.angDiff = U.angDiff;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir;
global.distToSegment = U.distToSegment; global.gaussian = U.gaussian;
global.RULES = R.RULES;

const G = require('../js/tank_geometry.js');
global.ARMOR = G.ARMOR; global.BOUNCE_ANGLE = G.BOUNCE_ANGLE; global.HEIGHTS = G.HEIGHTS;
global.hullPoly = G.hullPoly; global.turretPoly = G.turretPoly;
global.moduleFromHit = G.moduleFromHit; global.faceLabel = G.faceLabel;
global.superstructureLabel = G.superstructureLabel;
global.polyCorners = G.polyCorners; global.polyEdges = G.polyEdges;
global.gunRoot = G.gunRoot; global.gunTip = G.gunTip;

const M = require('../js/tank_model.js');
global.makeTank = M.makeTank; global.computeStats = M.computeStats;
global.moduleMult = M.moduleMult; global.setDebuff = M.setDebuff;
global.addModifier = M.addModifier; global.refreshStats = M.refreshStats;
global.applyEnemyAppearanceAndStats = M.applyEnemyAppearanceAndStats;
global.difficultyCapMuls = M.difficultyCapMuls;

const P = require('../js/tank_physics.js');
const MAP = require('../js/tank_map.js');
const ECON = require('../js/tank_economy.js');

// ---------------- 参数 ----------------
const argv = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const NODES = Number(argv.nodes) || 13;          // 0..12（diffSatIndex=12）
const SHOTS = Number(argv.shots) || 200;         // 每格蒙特卡洛样本
const ANGLE = argv.angle !== undefined ? Number(argv.angle) : 0;   // 入射角（0=正面对射）

// ---------------- 确定性随机 ----------------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- 命中率模型（与 test-ammo-balance.js 同源） ----------------
// σ 来自 stats.spreadMult（静止三扩），距离线性化，目标速度并入
const SPREAD_BASE = (R.RULES.spread && R.RULES.spread.base) || 0.018;
function hitProb(spreadMult, dist, tgtSpeed) {
  const sigma = SPREAD_BASE * (spreadMult || 1);
  const linear = sigma * dist;
  const move = (tgtSpeed || 0) * 0.05;
  const total = linear + move;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0.05, 19 / (total * 1.2)));
}

// ---------------- 玩家侧：商店购买轨迹 ----------------
// 每种 build = 一串购买优先级（id 顺序）。每节点按收入消费，买得起就买。
// 说明：商店局内可花余额 = 局内累计得分（1 分 = 1 点，双变量账本）；
//       scoreToPoints 的 ×0.1 只用于**终局**转永久点数，局内不适用。
//
// 2026-10-27 修订（§4.144 自审）：首版 `balanced` 遗漏 `fast_reload`，玩家装填从头到尾
//   恒定 1.30s，而敌人装填 1.55→1.16（比玩家快 12%）⇒ 审计系统性低估玩家 DPS。
//   快速装填是最便宜的 DPS 乘数（25 分起、−3%/级），真实玩家必买 —— 现所有 build 纳入。
const BUILDS = {
  // 纯火力：装填优先（DPS 乘数最大），再穿深/伤害
  firepower: ['fast_reload', 'penetration_up', 'damage_up', 'precision_gunnery'],
  // 防护为主，但保留一条最低限度穿深通道（纯防御会陷入「打不穿」死局，不代表真实玩家）
  armor:     ['hp_up', 'armor_kit', 'penetration_up', 'fast_reload'],
  // 机动流：引擎 → 最低限度穿深（缺穿深会在斜射时打不穿）→ 装填 → 生存
  mobility:  ['engine_overdrive', 'engine_power_up', 'penetration_up', 'fast_reload', 'hp_up'],
  // 均衡：装填/血量/穿深/装甲/伤害轮转
  balanced:  ['fast_reload', 'hp_up', 'penetration_up', 'armor_kit', 'damage_up'],
  // 贪心：每次买当前最便宜的（模拟"看到啥买啥"的新手）
  greedy:    null,
};

function runShopDefs() {
  return (ECON && ECON.RUN_SHOP_DEFS) || [];
}
function shopDefById(id) {
  return runShopDefs().find(d => d.id === id) || null;
}

// 玩家基准车（makeTank 缺省 = 中位中坦量级，与 enemyAnchorBase 同阶可比）
function makePlayer() {
  const t = global.makeTank({ id: 'player', team: 'player', x: 0, y: 0, hullAngle: 0, turretAngle: 0 });
  t.ammoKey = 'ap';     // 玩家默认弹种（商店/卡牌改造不在本期建模）
  return t;
}

// 收入：scoreNode 基础值（不给无伤/速通奖励，取保守值）
function nodeIncome(index) {
  return Math.round(100 * (1 + index * 0.2));
}

// 按 build 策略消费：返回本节点买到的 {id, lv} 列表 + 剩余余额
function spend(tank, buildId, balance, levels) {
  const bought = [];
  const order = BUILDS[buildId];
  let guard = 0;
  while (guard++ < 200) {
    let pick = null;
    if (order) {
      // 固定优先级：找第一个「买得起且没达限」的
      for (const id of order) {
        const def = shopDefById(id);
        if (!def) continue;
        const lv = levels[id] || 0;
        if (lv >= (def.maxLevel || 99)) continue;
        const price = ECON.runShopPriceFor(def, lv);
        if (price <= balance) { pick = { def, lv, price }; break; }
      }
    } else {
      // 贪心：所有买得起的里挑最便宜的
      let best = null;
      for (const def of runShopDefs()) {
        if (def.instant) continue;                      // 跳过一次性的（治疗/冷却）
        const lv = levels[def.id] || 0;
        if (lv >= (def.maxLevel || 99)) continue;
        const price = ECON.runShopPriceFor(def, lv);
        if (price <= balance && (!best || price < best.price)) best = { def, lv, price };
      }
      pick = best;
    }
    if (!pick) break;
    // 应用效果
    for (const ef of pick.def.effects || []) {
      global.addModifier(tank, { stat: ef.stat, mode: ef.mode, value: ef.value, source: 'runshop', scope: 'run' });
    }
    balance -= pick.price;
    levels[pick.def.id] = pick.lv + 1;
    bought.push({ id: pick.def.id, lv: pick.lv + 1 });
  }
  global.refreshStats(tank);
  return { bought, balance };
}

// ---------------- 敌人侧：真实四层叠加 ----------------
const battleDiffNorm = (diff) => Math.max(0, Math.min(1, (diff - 0.15) / (0.95 - 0.15)));

function buildEnemy(cls, diff, randFactor) {
  const mults = MAP.entityMultsForDifficulty(diff);
  const t = global.makeTank({ id: 'e', team: 'enemy', x: 0, y: 0, hullAngle: 0, turretAngle: 0 });
  global.applyEnemyAppearanceAndStats(t, { heightClass: cls, hull: null, turret: null }, null, mults);
  // difficultyCapMuls：与 battle applyDifficultyMults 同路径
  const caps = global.difficultyCapMuls(t, { diffNorm: battleDiffNorm(diff), randFactor: randFactor || 1.0 });
  const CAP_STAT = { penMul: 'penetration', dmgFloorMul: 'damage', dmgCapMul: 'damage', speedMul: 'maxSpeed' };
  for (const k in caps) {
    global.addModifier(t, { stat: CAP_STAT[k], mode: 'mult', value: caps[k], source: 'difficulty-cap', scope: 'run' });
  }
  global.refreshStats(t);
  t.hp = t.stats.maxHp; t.maxHp = t.stats.maxHp;
  // §4.143：敌军按等级套 AP 链弹种，且 ammoStatNeutral（不放大 pen/dmg）
  const enemyLevel = Math.max(1, Math.round(1 + diff * 12));
  M.applyEnemyAmmoByLevel(t, enemyLevel);
  t.enemyLevelUsed = enemyLevel;
  return t;
}

// ---------------- 单发期望伤害（真实 resolveHit 蒙特卡洛） ----------------
// 返回 { penRate, avgDmg } —— avgDmg 含未击穿残余（HE 家族）
function simulateShot(attacker, defender, angleDeg, shots, seed) {
  const rng = mulberry32(seed);
  const theta = angleDeg * Math.PI / 180;
  const dx = Math.cos(theta), dy = Math.sin(theta);
  const hit = { part: 'hull', faceKey: 'front', x: 32, y: 0, nx: 1, ny: 0, edgeName: 'front' };
  let penCount = 0, dmgSum = 0;
  const hpKeep = defender.stats.maxHp;
  for (let i = 0; i < shots; i++) {
    defender.hp = hpKeep;
    const sh = {
      x: 0, y: 0, dx, dy,
      pen: attacker.stats.penetration,
      dmg: attacker.stats.damage,
      shooter: attacker, ammoKey: attacker.ammoKey,
      canBounce: true, bounced: false
    };
    const res = P.resolveHit(sh, defender, hit, true);
    if (res.outcome === 'PEN') { penCount++; dmgSum += res.dmg; }
    else if (res.dmg > 0) dmgSum += res.dmg;
  }
  return { penRate: penCount / shots, avgDmg: dmgSum / shots };
}

// ---------------- TTK ----------------
// 攻击方 DPS = 命中率 × 单发期望伤害 / 装填
function dpsOf(attacker, defender, angleDeg, dist, shots, seed) {
  const p = hitProb(attacker.stats.spreadMult || 1, dist, defender.stats.maxSpeed * 0.5);
  const sim = simulateShot(attacker, defender, angleDeg, shots, seed);
  const reload = Math.max(0.2, attacker.stats.reload);
  return { dps: p * sim.avgDmg / reload, hitRate: p, penRate: sim.penRate, avgDmg: sim.avgDmg };
}

// 显示辅助：TTK 可能为 Infinity（打不穿 ⇒ DPS 0）
function fmtTtk(sec) {
  if (!isFinite(sec) || sec > 9999) return '∞';
  return sec.toFixed(1) + 's';
}
function fmtAdv(v) {
  if (!isFinite(v) || v > 9999) return '∞';
  return v.toFixed(2);
}

// ---------------- 主流程 ----------------
const DIST = 400;     // 基准交战距离（px）
const result = [];

for (let idx = 0; idx < NODES; idx++) {
  const diff = MAP.difficultyForIndex(idx, 0);
  const income = nodeIncome(idx);
  const isBoss = MAP.isBossNodeIndex(idx);

  for (const buildId of Object.keys(BUILDS)) {
    // 累积轨迹：从头跑到当前节点（余额跨节点累积，符合实际：没花完的分数留着）
    const tank = makePlayer();
    let balance = 0, levels = {};
    for (let i = 0; i <= idx; i++) {
      balance += nodeIncome(i);
      const r = spend(tank, buildId, balance, levels);
      balance = r.balance;
    }

    const enemy = buildEnemy('medium', diff, 1.0);

    // 双向 TTK（seed 按节点+build 固定，保证可重放）
    const seed = 1000 + idx * 97 + buildId.length * 13;
    const pAtk = dpsOf(tank, enemy, ANGLE, DIST, SHOTS, seed);
    const eAtk = dpsOf(enemy, tank, ANGLE, DIST, SHOTS, seed + 1);

    const playerTTK = enemy.stats.maxHp / Math.max(1e-6, pAtk.dps);   // 玩家打死敌人所需秒数
    const enemyTTK  = tank.stats.maxHp / Math.max(1e-6, eAtk.dps);    // 敌人打死玩家所需秒数
    const advantage = enemyTTK / Math.max(1e-6, playerTTK);           // >1 玩家占优

    result.push({
      idx, diff, boss: isBoss, build: buildId,
      pHp: tank.stats.maxHp, pPen: tank.stats.penetration, pDmg: tank.stats.damage,
      pReload: tank.stats.reload, pArmorF: tank.stats.armor.hull.front,
      eHp: enemy.stats.maxHp, ePen: enemy.stats.penetration, eDmg: enemy.stats.damage,
      eReload: enemy.stats.reload, eArmorF: enemy.stats.armor.hull.front, eLevel: enemy.enemyLevelUsed,
      pPenRate: pAtk.penRate, ePenRate: eAtk.penRate,
      pTTK: playerTTK, eTTK: enemyTTK, adv: advantage,
    });
  }
}

// ---------------- 输出 ----------------
const builds = Object.keys(BUILDS);
console.log(`\n=== 成长曲线审计（节点 0..${NODES - 1}，敌人 medium，距离 ${DIST}px，入射角 ${ANGLE}°）===`);
console.log('优势度 = 敌人TTK玩家 / 玩家TTK敌人（>1 玩家占优；理想：缓降且始终 >1）\n');

// 表 1：优势度
let header = '节点  diff   Boss |';
for (const b of builds) header += ` ${b.padStart(10)} |`;
console.log(header);
console.log('-'.repeat(header.length));
for (let idx = 0; idx < NODES; idx++) {
  const rows = result.filter(r => r.idx === idx);
  const d = rows[0].diff, boss = rows[0].boss ? '★' : ' ';
  let line = `${String(idx).padStart(3)}  ${String(d).padStart(5)}  ${boss}   |`;
  for (const b of builds) {
    const r = rows.find(x => x.build === b);
    const v = r.adv;
    const mark = !isFinite(v) ? ' ' : (v >= 1 ? ' ' : '!');
    line += ` ${(fmtAdv(v) + mark).padStart(10)} |`;
  }
  console.log(line);
}

// 表 2：选定 build 的属性快照（默认 balanced）
// 2026-10-27（typecheck 修复，非本批功能）：argv 解析器把裸 `--focus` 记为 `true`，
//   而 `builds.includes()` 要求 string —— 非字符串一律回落缺省，语义与旧行为一致。
const focus = (typeof argv.focus === 'string' && argv.focus) ? argv.focus : 'balanced';
if (builds.includes(focus)) {
  console.log(`\n=== 属性快照（build=${focus}，玩家 / 敌人）===`);
  const h2 = '节点 | 玩家HP 玩家穿深 玩家伤害 玩家装填 玩家装甲 | 敌人HP 敌人穿深 敌人伤害 敌人装填 敌人装甲 | 玩家击穿率 敌人击穿率 | 玩家TTK 敌人TTK';
  console.log(h2);
  console.log('-'.repeat(h2.length));
  for (let idx = 0; idx < NODES; idx++) {
    const r = result.find(x => x.idx === idx && x.build === focus);
    console.log(`${String(idx).padStart(3)}  | ${String(Math.round(r.pHp)).padStart(6)} ${String(Math.round(r.pPen)).padStart(8)} ${String(Math.round(r.pDmg)).padStart(8)} ${r.pReload.toFixed(2).padStart(8)} ${String(Math.round(r.pArmorF)).padStart(8)} | ${String(Math.round(r.eHp)).padStart(6)} ${String(Math.round(r.ePen)).padStart(8)} ${String(Math.round(r.eDmg)).padStart(8)} ${r.eReload.toFixed(2).padStart(8)} ${String(Math.round(r.eArmorF)).padStart(8)} | ${(r.pPenRate * 100).toFixed(0).padStart(9)}% ${(r.ePenRate * 100).toFixed(0).padStart(9)}% | ${fmtTtk(r.pTTK).padStart(7)} ${fmtTtk(r.eTTK).padStart(7)}`);
  }
}

// 表 3：跨 build 汇总（每个 build 的末节点优势度 + 最低点）
console.log('\n=== build 汇总 ===');
for (const b of builds) {
  const rows = result.filter(r => r.build === b);
  const min = rows.reduce((a, r) => r.adv < a.adv ? r : a, rows[0]);
  const last = rows[rows.length - 1];
  console.log(`  ${b.padEnd(10)} 末节点优势度 ${fmtAdv(last.adv)}  最低点 ${fmtAdv(min.adv)}（节点 ${min.idx}）`);
}

// 结论提示
console.log('\n=== 判读 ===');
const finiteAdv = result.filter(r => isFinite(r.adv));
const allMin = finiteAdv.reduce((a, r) => r.adv < a.adv ? r : a, finiteAdv[0]);
const allMax = finiteAdv.reduce((a, r) => r.adv > a.adv ? r : a, finiteAdv[0]);
console.log(`  最低优势度 ${fmtAdv(allMin.adv)}（节点 ${allMin.idx} / ${allMin.build}）`);
console.log(`  最高优势度 ${fmtAdv(allMax.adv)}（节点 ${allMax.idx} / ${allMax.build}）`);
if (allMin.adv < 1) console.log('  ⚠ 存在优势度 <1 的节点：玩家在该进度下打不过（难度失控区）');
else console.log('  ✓ 全程优势度 >1：玩家始终占优');
const lastAdvs = builds.map(b => result.filter(r => r.build === b).slice(-1)[0].adv).filter(isFinite);
const avgLast = lastAdvs.length ? lastAdvs.reduce((a, b) => a + b, 0) / lastAdvs.length : Infinity;
if (avgLast > 1.5) console.log(`  ⚠ 末节点平均优势度 ${fmtAdv(avgLast)} >1.5：后期偏简单`);
else console.log(`  末节点平均优势度 ${fmtAdv(avgLast)}`);

// 可选 Markdown 输出
if (argv.md && typeof argv.md === 'string') {
  const fs = require('fs');
  let md = `# 成长曲线审计（${new Date().toISOString().slice(0, 10)}）\n\n`;
  md += `节点 0..${NODES - 1} · 敌人 medium · 距离 ${DIST}px · 入射角 ${ANGLE}°\n\n`;
  md += `优势度 = 敌人TTK玩家 / 玩家TTK敌人（>1 玩家占优）\n\n| 节点 | diff | Boss | ` + builds.join(' | ') + ` |\n|---||---||---|` + builds.map(() => '---|').join('') + `\n`;
  for (let idx = 0; idx < NODES; idx++) {
    const rows = result.filter(r => r.idx === idx);
    md += `| ${idx} | ${rows[0].diff} | ${rows[0].boss ? '★' : ''} | ` + builds.map(b => {
      const r = rows.find(x => x.build === b);
      return r.adv.toFixed(2);
    }).join(' | ') + ` |\n`;
  }
  fs.writeFileSync(argv.md, md);
  console.log(`\nMarkdown 已写出：${argv.md}`);
}
