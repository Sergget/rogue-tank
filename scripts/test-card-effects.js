// test-card-effects.js — 卡牌效果运行时验证（Node 端，Pure Logic，数据驱动逐卡）。
// 与 validate-content.js（schema 守门）/ audit-content.js（静态平衡审计）分工：
// 本套件对 cards/ 每张卡构造 fresh tank（applyTankConfig + computeStats），
// 走 applyCardEffects 全链路，验证：
//   - modifier 效果（101 个，79 张卡）：stats 增量与声明 add/mult 一致（含 armor 路径）、
//     修饰器注册（source=card:<id> / scope=run）正确；
//   - ammo/ability/passive/drone/economy 效果（43 个，36 张纯非 modifier 卡）：
//     applyCardEffects 不抛错、对 tank 无未声明副作用、正确入队 tank.cardEffects
//     （含 P-17 专项：artillery/overdrive/shield 三张主动卡 key 入队保真、drone 卡
//     kind 保真 scout/striker；运行时行为随 P-17 后续子目标接线后补行为测试，
//     见文件底部 TODO 清单）；
//   - maxStacks 堆叠：堆到上限不溢出、cardStackCount 计数正确。
// 运行：node scripts/test-card-effects.js（npm test 已纳入，validate-content.js 之后）
'use strict';

const fs = require('fs');
const path = require('path');

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const H = require('../js/tank_halfgeom.js');
global.normalizeBarrel = H.normalizeBarrel;   // applyTankConfig 浏览器全局惯例（Node 兜底）
const model = require('../js/tank_model.js');
global.addModifier = model.addModifier;       // tank_cards.applyCardEffects 引用全局（浏览器惯例）
const cardsMod = require('../js/tank_cards.js');

const ROOT = path.join(__dirname, '..');

let fails = 0;
let asserts = 0;
function ok(cond, label) {
  asserts++;
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// ---------- 数据装载（与 validate-content.js 同法） ----------

function loadJsonDir(dir) {
  const out = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const f of fs.readdirSync(full).filter(f => f.endsWith('.json')).sort()) {
    out.push(JSON.parse(fs.readFileSync(path.join(full, f), 'utf8')));
  }
  return out;
}

const CARDS = loadJsonDir('cards');

// 确定性测试坦克：tanks/ 排序第一条（期望值相对 base 快照计算，与具体坦克内容无关）；
// tanks/ 为空时退回内嵌最小配置。
function loadTankSpec() {
  const dir = path.join(ROOT, 'tanks');
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    if (files.length) return JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  }
  return { id: 'min_test_tank', hp: 100, penetration: 120, damage: 34, reload: 1.3,
           maxSpeed: 120, turnRate: 2, turretTurnRate: 2.2, weight: 300, enginePower: 900,
           armor: { hull: { front: 110, side: 38, rear: 26 }, turret: { front: 140, side: 50, rear: 24 } } };
}
const TANK_SPEC = loadTankSpec();

function freshTank() {
  const tank = model.makeTank({ team: 'player' });
  model.applyTankConfig(tank, TANK_SPEC);
  return tank;
}

// ---------- 期望值计算（镜像 computeStats 语义：先 add 后 mult；armor 路径按 applyArmorMod） ----------

function applyExpected(stats, effects) {
  const s = structuredClone(stats);
  for (const pass of ['add', 'mult']) {
    for (const ef of effects) {
      if (ef.mode !== pass) continue;
      if (ef.stat.startsWith('armor')) {
        const parts = ef.stat.split('.');
        const group = s.armor[parts[1]];
        if (!group) continue;
        if (parts[2]) {
          if (group[parts[2]] !== undefined) group[parts[2]] = pass === 'add' ? group[parts[2]] + ef.value : group[parts[2]] * ef.value;
        } else {
          for (const k in group) group[k] = pass === 'add' ? group[k] + ef.value : group[k] * ef.value;
        }
      } else if (s[ef.stat] !== undefined) {
        s[ef.stat] = pass === 'add' ? s[ef.stat] + ef.value : s[ef.stat] * ef.value;
      }
    }
  }
  return s;
}

// 深度比较 stats 两份（数字容差 1e-9），返回不一致键列表（空 = 一致）
// 递归处理 armor.hull.front 等任意嵌套路径（避免对象按引用比较的假偏差）
function diffVal(va, vb, key, bad) {
  if (typeof va === 'number') {
    if (typeof vb !== 'number' || Math.abs(va - vb) > 1e-9 * Math.max(1, Math.abs(va))) bad.push(key);
  } else if (va && typeof va === 'object') {
    if (!vb || typeof vb !== 'object') { bad.push(key); return; }
    for (const kk of Object.keys(va)) diffVal(va[kk], vb[kk], `${key}.${kk}`, bad);
  } else if (va !== vb) bad.push(key);
}

function statsDiff(a, b) {
  const bad = [];
  for (const k of Object.keys(a)) diffVal(a[k], b[k], k, bad);
  return bad;
}

// ---------- 框架级前置检查 ----------

console.log(`== test-card-effects: ${CARDS.length} 张卡 ==`);
console.log(`测试坦克: ${TANK_SPEC.id}（期望值相对 base 快照计算）`);
ok(CARDS.length >= 100, `cards/ 卡池 ≥100 张（当前 ${CARDS.length}）`);
ok(CARDS.every(c => Number.isInteger(c.maxStacks) && c.maxStacks >= 1), '全部卡声明 maxStacks 正整数');

const sample = freshTank();
const statKeys = Object.keys(model.computeStats(sample.base, []));
ok(cardsMod.MODIFIER_STATS.every(s => statKeys.includes(s)),
  `MODIFIER_STATS 全部 ${cardsMod.MODIFIER_STATS.length} 键在 computeStats 输出中可观测（逐卡数值可验证）`);

// ---------- 逐卡执行验证 ----------

let modifierCards = 0, structureOnlyCards = 0;
let modifierEffects = 0, nonModifierEffects = 0;
const dist = {};
for (const card of CARDS) {
  for (const ef of card.effects) {
    dist[ef.type] = (dist[ef.type] || 0) + 1;
    if (ef.type === 'modifier') modifierEffects++;
    else nonModifierEffects++;
  }
  const tag = card.id;
  const mods = card.effects.filter(e => e.type === 'modifier');
  const nonMods = card.effects.filter(e => e.type !== 'modifier');
  const maxStacks = card.maxStacks || 1;
  if (mods.length) modifierCards++;
  else structureOnlyCards++;

  const tank = freshTank();
  const preStats = structuredClone(tank.stats);
  const preModCount = tank.modifiers.length;

  // (a) 应用不抛错、返回全部效果
  let applied = null, applyErr = null;
  try { applied = cardsMod.applyCardEffects(tank, card); }
  catch (e) { applyErr = e; }
  ok(!applyErr && applied && applied.length === card.effects.length,
    `${tag}: applyCardEffects 不抛错并返回 ${card.effects.length} 个效果${applyErr ? ` — ${applyErr.message}` : ''}`);

  // (b) modifier 数值验证：stats 增量与声明 add/mult 一致（含 armor 路径）+ 修饰器注册
  if (mods.length) {
    const expected = applyExpected(structuredClone(preStats), mods);
    const bad = statsDiff(tank.stats, expected);
    const regs = tank.modifiers.slice(preModCount);
    const regOK = regs.length === mods.length &&
      regs.every((m, i) => m.stat === mods[i].stat && m.mode === mods[i].mode && m.value === mods[i].value &&
        m.source === 'card:' + card.id && m.scope === 'run');
    ok(bad.length === 0 && regOK,
      `${tag}: modifier 数值与声明一致（${mods.length} 个效果）${bad.length ? ` — stats 偏差: ${bad.join(', ')}` : ''}${regOK ? '' : ' — 修饰器注册不符'}`);
  }

  // (c) 非 modifier 效果：无未声明副作用 + 入队 cardEffects（结构合法性由 validate-content.js 守门）
  if (nonMods.length) {
    const pure = mods.length === 0;
    const statsOK = pure ? statsDiff(tank.stats, preStats).length === 0 : true;
    const modsOK = pure ? tank.modifiers.length === preModCount : true;
    const queue = tank.cardEffects || [];
    const queueOK = queue.length === nonMods.length &&
      queue.every((e, i) => e.cardId === card.id && e.type === nonMods[i].type &&
        (nonMods[i].key === undefined || e.key === nonMods[i].key) &&
        (nonMods[i].field === undefined || e.field === nonMods[i].field) &&
        (nonMods[i].mode === undefined || e.mode === nonMods[i].mode) &&
        (nonMods[i].value === undefined || e.value === nonMods[i].value) &&
        (nonMods[i].kind === undefined || e.kind === nonMods[i].kind));
    ok(statsOK && modsOK && queueOK,
      `${tag}: 非 modifier 效果无未声明副作用且入队 cardEffects（${nonMods.length} 个）${queueOK ? '' : ' — 队列内容不符'}`);
  }

  // (d) maxStacks 堆叠：补满 maxStacks 次，计数与数值不溢出
  for (let i = 1; i < maxStacks; i++) cardsMod.applyCardEffects(tank, card);
  if (mods.length) {
    // cardStackCount 语义 = 修饰器数（每效果一个），非卡牌张数（tank_cards.js:138）
    ok(cardsMod.cardStackCount(tank, card.id) === maxStacks * mods.length,
      `${tag}: maxStacks=${maxStacks} 堆叠计数正确（cardStackCount=${maxStacks}×${mods.length} 修饰器）`);
    let expected = structuredClone(preStats);
    for (let i = 0; i < maxStacks; i++) expected = applyExpected(expected, mods);
    const bad = statsDiff(tank.stats, expected);
    ok(bad.length === 0 && tank.modifiers.length === preModCount + maxStacks * mods.length,
      `${tag}: maxStacks=${maxStacks} 满堆叠数值正确（${maxStacks}×${mods.length} 修饰器）${bad.length ? ` — stats 偏差: ${bad.join(', ')}` : ''}`);
  }
  if (nonMods.length) {
    const queue = tank.cardEffects || [];
    ok(queue.length === maxStacks * nonMods.length && queue.every(e => e.cardId === card.id),
      `${tag}: maxStacks=${maxStacks} 满堆叠入队 ${maxStacks}×${nonMods.length} 项`);
  }
}

// ---------- 框架级收尾检查 ----------

// removeRunModifiers：单局结束清除卡牌 run 修饰器（§5.1），stats 复原
{
  const card = CARDS.find(c => c.effects.some(e => e.type === 'modifier'));
  const tank = freshTank();
  const pre = structuredClone(tank.stats);
  cardsMod.applyCardEffects(tank, card);
  cardsMod.applyCardEffects(tank, card);
  model.removeRunModifiers(tank);
  ok(tank.modifiers.length === 0 && cardsMod.cardStackCount(tank, card.id) === 0 &&
     statsDiff(tank.stats, pre).length === 0,
    `removeRunModifiers 清除卡牌 run 修饰器且 stats 复原（${card.id}）`);
}

// ---------- P-17 战术卡牌能力：ability/drone 入队保真专项 ----------
// 运行时行为（strike/shield/drone 模块）随 P-17 后续子目标接线；此处验证数据契约：
// 新 3 张主动卡按 key 入队 tank.cardEffects；drone 卡 kind 保真（scout/striker）。
{
  const expectAbility = (cardId, key) => {
    const card = CARDS.find(c => c.id === cardId);
    ok(!!card, `${cardId}: P-17 主动卡存在`);
    if (!card) return;
    const tank = freshTank();
    cardsMod.applyCardEffects(tank, card);
    const entries = (tank.cardEffects || []).filter(e => e.cardId === cardId);
    ok(entries.length === 1 && entries[0].type === 'ability' && entries[0].key === key,
      `${cardId}: cardEffects 含 {type:'ability', key:'${key}', cardId}`);
  };
  expectAbility('artillery_strike', 'artillery');
  expectAbility('super_reload', 'overdrive');
  expectAbility('tactical_shield', 'shield');

  const expectDroneKind = (cardId, kind) => {
    const card = CARDS.find(c => c.id === cardId);
    ok(!!card, `${cardId}: 无人机卡存在`);
    if (!card) return;
    const tank = freshTank();
    cardsMod.applyCardEffects(tank, card);
    const entries = (tank.cardEffects || []).filter(e => e.cardId === cardId);
    ok(entries.length === 1 && entries[0].type === 'drone' && entries[0].kind === kind,
      `${cardId}: cardEffects 含 {type:'drone', kind:'${kind}', cardId}`);
  };
  expectDroneKind('escort_drone', 'striker');
  expectDroneKind('scout_drone', 'scout');
}

// 覆盖率与分布
console.log(`效果类型分布: ${JSON.stringify(dist)}（对照 DEVELOPMENT.md §2.13: modifier 101 / ammo 17 / ability 11 / passive 8 / economy 5 / drone 2）`);
console.log(`覆盖率: ${CARDS.length}/${CARDS.length} 张卡逐卡执行验证（applyCardEffects 全链路）`);
console.log(`  modifier 数值验证: ${modifierCards}/${CARDS.length} 张卡（${modifierEffects} 个 modifier 效果逐一数值核对）`);
console.log(`  结构+无副作用验证: ${structureOnlyCards}/${CARDS.length} 张卡（${nonModifierEffects} 个非 modifier 效果，运行时行为 TODO）`);
console.log('TODO（运行时行为测试随对应里程碑补充，见 DEVELOPMENT.md §6）:');
console.log('  - ammo/ability/passive/drone 运行时效果 → P-17（战术卡牌能力与主动装备拓展）');
console.log('  - economy 运行时效果 → 局内商店里程碑（M10）');
console.log('  - maxStacks 硬性截断（选择阶段拒绝超上限重复拿卡）→ 卡牌选择 UI 接线（当前 mvp pickCard 未截断，tank_mvp.html:668）');

console.log(`test-card-effects: 完成所有检查（${asserts} 断言，${CARDS.length} 张卡）`);
if (fails === 0) console.log('test-card-effects: 全部通过');
else console.error(`test-card-effects: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);