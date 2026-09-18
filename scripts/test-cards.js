// test-cards.js — 卡牌系统测试（Node 端，Pure Logic）
// 运行：node scripts/test-cards.js
'use strict';

const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const model = require('../js/tank_model.js');
global.addModifier = model.addModifier; // tank_cards.applyCardEffects 引用全局（浏览器惯例）
const cardsMod = require('../js/tank_cards.js');
const { createRNG } = require('../js/tank_nodegen.js');
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// 1) validateCard：合法卡
ok(cardsMod.validateCard({ id: 'a', name: 'A', rarity: 'common', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 10 }] }).length === 0,
  '合法卡无错误');

// 2) 各字段非法
ok(cardsMod.validateCard({ name: 'x', rarity: 'common', effects: [] }).length > 0, '缺 id 报错');
ok(cardsMod.validateCard({ id: 'a', name: 'x', rarity: 'mythic', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 1 }] }).length > 0, '非法 rarity 报错');
ok(cardsMod.validateCard({ id: 'a', name: 'x', rarity: 'common', tags: ['魔法'], effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 1 }] }).length > 0, '非法 tag 报错');
ok(cardsMod.validateCard({ id: 'a', name: 'x', rarity: 'common', effects: [] }).length > 0, '空 effects 报错');

// 3) 效果校验
ok(cardsMod.validateCardEffect({ type: 'modifier', stat: 'nope', mode: 'add', value: 1 }, 'e').length > 0, '非法 stat 报错');
ok(cardsMod.validateCardEffect({ type: 'modifier', stat: 'armor.hull.front', mode: 'mult', value: 1.2 }, 'e').length === 0, '装甲路径合法');
ok(cardsMod.validateCardEffect({ type: 'modifier', stat: 'armor.hull.xx', mode: 'add', value: 1 }, 'e').length > 0, '装甲路径非法面报错');
ok(cardsMod.validateCardEffect({ type: 'ammo', key: 'ap', field: 'pen', mode: 'mult', value: 1.1 }, 'e').length === 0, 'ammo 合法');
ok(cardsMod.validateCardEffect({ type: 'ammo', key: 'heat', field: 'pen', mode: 'mult', value: 1.2 }, 'e').length === 0, '#64: ammo key heat 合法');
ok(cardsMod.validateCardEffect({ type: 'ability', key: 'artillery' }, 'e').length === 0, 'ability 合法');
ok(cardsMod.validateCardEffect({ type: 'ability', key: 'smoke' }, 'e').length > 0, 'ability smoke 已移除白名单（2026-09-15 W2 烟幕弹删除）');
ok(cardsMod.validateCardEffect({ type: 'drone' }, 'e').length === 0, 'drone 合法');

// 4) validateCardSet：唯一性
const set = [
  { id: 'dup', name: 'A', rarity: 'common', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 1 }] },
  { id: 'dup', name: 'B', rarity: 'common', effects: [{ type: 'modifier', stat: 'damage', mode: 'add', value: 1 }] }
];
ok(cardsMod.validateCardSet(set).duplicates.length === 1, '重复 id 检出');

// 5) applyCardEffects：modifier 立即生效
const tank = model.makeTank({ team: 'player' });
const basePen = tank.stats.penetration;
cardsMod.applyCardEffects(tank, { id: 'ap', name: 'x', rarity: 'common', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 10 }] });
ok(tank.stats.penetration === basePen + 10, 'modifier 立即生效（穿深 +10）');
ok(cardsMod.cardStackCount(tank, 'ap') === 1, '卡牌叠加计数');
cardsMod.applyCardEffects(tank, { id: 'ap', name: 'x', rarity: 'common', effects: [{ type: 'modifier', stat: 'penetration', mode: 'add', value: 10 }] });
ok(cardsMod.cardStackCount(tank, 'ap') === 2 && tank.stats.penetration === basePen + 20, '同名卡叠加');
// armor 路径 modifier
cardsMod.applyCardEffects(tank, { id: 'arm', name: 'x', rarity: 'common', effects: [{ type: 'modifier', stat: 'armor.hull.front', mode: 'add', value: 12 }] });
ok(tank.stats.armor.hull.front === 110 + 12, '装甲路径 modifier 生效');

// #62 cardStackCount 纯 non-modifier 效果与混合效果统计
const tDrone = model.makeTank({ team: 'player' });
cardsMod.applyCardEffects(tDrone, { id: 'drone_card', name: 'drone', rarity: 'rare', effects: [{ type: 'drone', kind: 'scout' }] });
ok(cardsMod.cardStackCount(tDrone, 'drone_card') === 1, '#62: 纯 drone 效果卡 stackCount 为 1');
cardsMod.applyCardEffects(tDrone, { id: 'drone_card', name: 'drone', rarity: 'rare', effects: [{ type: 'drone', kind: 'scout' }] });
ok(cardsMod.cardStackCount(tDrone, 'drone_card') === 2, '#62: 重复应用后 stackCount 累积为 2');

// 6) drawCardChoices：确定性 + 数量 + 不重复
const pool = [];
const rarities = ['common', 'rare', 'epic', 'legendary'];
for (let i = 0; i < 40; i++) {
  pool.push({ id: 'c' + i, name: 'C' + i, rarity: rarities[i % 4], effects: [{ type: 'modifier', stat: 'damage', mode: 'add', value: 1 }] });
}
const rng1 = createRNG(123);
const rng2 = createRNG(123);
const d1 = cardsMod.drawCardChoices(pool, 3, rng1);
const d2 = cardsMod.drawCardChoices(pool, 3, rng2);
ok(d1.length === 3 && d2.length === 3, '抽 3 张');
ok(d1.map(c => c.id).join(',') === d2.map(c => c.id).join(','), '同种子抽卡确定');
ok(new Set(d1.map(c => c.id)).size === 3, '抽卡不重复');
ok(cardsMod.drawCardChoices(pool, 100).length === pool.length, '超量抽取返回全池');

// 7) P-27 弹种卡过滤与 computeAmmoConfig 校验
const samplePool = [
  { id: 'c_ap', name: 'AP穿深', rarity: 'common', tags: ['狙击'], effects: [{ type: 'ammo', key: 'ap', field: 'pen', mode: 'add', value: 10 }] },
  { id: 'c_he', name: 'HE增伤', rarity: 'common', tags: ['爆破'], effects: [{ type: 'ammo', key: 'he', field: 'dmg', mode: 'mult', value: 1.2 }] },
  { id: 'c_gen', name: '装甲强化', rarity: 'common', tags: ['重甲'], effects: [{ type: 'modifier', stat: 'maxHp', mode: 'add', value: 20 }] }
];
const drawnApOnly = cardsMod.drawCardChoices(samplePool, 3, { ammoLoadout: ['ap'] });
ok(drawnApOnly.some(c => c.id === 'c_ap'), '抽到匹配的 AP 卡');
ok(drawnApOnly.some(c => c.id === 'c_gen'), '抽到通用卡');
ok(!drawnApOnly.some(c => c.id === 'c_he'), '过滤掉未携带的 HE 改造卡');

// computeAmmoConfig 运算断言
const dummyShooter = {
  ammoKey: 'ap',
  cardEffects: [
    { type: 'ammo', key: 'ap', field: 'pen', mode: 'add', value: 15 },
    { type: 'ammo', key: 'ap', field: 'pen', mode: 'mult', value: 1.2 },
    { type: 'ammo', key: 'ap', field: 'dmg', mode: 'mult', value: 1.1 },
    { type: 'ammo', key: 'he', field: 'dmg', mode: 'mult', value: 2.0 } // 异种弹药不影响 ap
  ]
};
const apCfg = cardsMod.computeAmmoConfig(dummyShooter, 'ap');
// #A13 语义（2026-08-26）：mult 作用于倍率刻度 → cfg.pen = base(1)×1.2 = 1.2；
// add 在乘算后以 mm 追加 → cfg.penAdd = 15（消费方 tank_fire.js：stats.penetration×1.2 + 15mm）
ok(Math.abs(apCfg.pen - 1.2) < 1e-4, '#A13: AP 穿深倍率部分 base×multAggr=1.2');
ok(Math.abs(apCfg.penAdd - 15) < 1e-4, '#A13: AP 穿深追加部分 penAdd=15mm（自然单位、乘算后追加）');
ok(Math.abs(apCfg.dmg - 1.1) < 1e-4, 'AP 伤害乘算正确');

// #A13 明确用例：最终穿深 = 基础值×Π(mult) + Σ(add)，而非 (基础值+add)×mult
{
  const s13 = { ammoKey: 'apcr', cardEffects: [
    { type: 'ammo', key: 'apcr', field: 'pen', mode: 'mult', value: 1.5 },
    { type: 'ammo', key: 'apcr', field: 'pen', mode: 'add', value: 20 }
  ] };
  const c13 = cardsMod.computeAmmoConfig(s13, 'apcr');
  // 弹种链 2026-09-13 换算语义：add 量按弹种基准倍率换算 → penAdd = 20×base(apcr 1.2) = 24；
  // 消费公式（gunPen=100mm）：100×(base×1.5)+24；旧「先加后乘」语义为 (100+20)×(base×1.5)
  const apcrBase = RULES.ammoTypes.apcr.pen;
  ok(Math.abs(c13.pen - apcrBase * 1.5) < 1e-4 && Math.abs(c13.penAdd - 20 * apcrBase) < 1e-4
    && Math.abs((100 * c13.pen + c13.penAdd) - (100 * apcrBase * 1.5 + 20 * apcrBase)) < 1e-4,
    `#A13: add 按弹种倍率换算后乘算追加（100×${(apcrBase * 1.5).toFixed(2)}+${(20 * apcrBase).toFixed(0)}=${(100 * apcrBase * 1.5 + 20 * apcrBase).toFixed(0)}mm）`);
}

// #97 加法聚合：同 field 多条 mult 聚合为 1 + Σ(value−1) 应用一次（非迭代相乘）
const heShooter = {
  ammoKey: 'he',
  cardEffects: [
    { type: 'ammo', key: 'he', field: 'dmg', mode: 'mult', value: 1.2 },
    { type: 'ammo', key: 'he', field: 'dmg', mode: 'mult', value: 1.2 }
  ]
};
const heCfg = cardsMod.computeAmmoConfig(heShooter, 'he');
ok(Math.abs(heCfg.dmg - 1.5 * 1.4) < 1e-4, '#97: HE 伤害双 mult 加法聚合（base 1.5 × 聚合 1.4 = 2.1，旧迭代语义为 2.16）');
// add 与 mult 混合时（#A13）：mult 先作用于倍率刻度，add 乘算后追加（见上方明确用例）
const mixCfg = cardsMod.computeAmmoConfig({
  ammoKey: 'heat',
  cardEffects: [
    { type: 'ammo', key: 'heat', field: 'pen', mode: 'mult', value: 1.2 },
    { type: 'ammo', key: 'heat', field: 'pen', mode: 'mult', value: 1.3 }
  ]
}, 'heat');
ok(Math.abs(mixCfg.pen - (1.5 * (1 + 0.2 + 0.3))) < 1e-4, '#97: HEAT 穿深 base×聚合乘子（base 1.5 × 1.5 = 2.25）');
// 多条聚合钳 ≥0：两条大减益聚合为负时钳到 0
const negCfg = cardsMod.computeAmmoConfig({
  ammoKey: 'apcr',
  cardEffects: [
    { type: 'ammo', key: 'apcr', field: 'dmg', mode: 'mult', value: 0.4 },
    { type: 'ammo', key: 'apcr', field: 'dmg', mode: 'mult', value: 0.5 }
  ]
}, 'apcr');
ok(negCfg.dmg === 0, '#97: 多条 mult 聚合为负时钳 ≥0（0.8×max(0, 1−0.6−0.5)=0）');

// HEAT 弹种卡（内容分布 #97）：数据驱动逐卡校验 schema + computeAmmoConfig 增量
{
  const cardsDir = path.join(__dirname, '..', 'cards');
  const heatCards = ['heat_overpressure', 'heat_composite_pen', 'heat_precision'];
  for (const id of heatCards) {
    const card = JSON.parse(fs.readFileSync(path.join(cardsDir, id + '.json'), 'utf8'));
    ok(card.id === id && cardsMod.validateCard(card).length === 0, `${id}: 卡牌文件存在且 validateCard 通过`);
    const t = model.makeTank({ team: 'player' });
    cardsMod.applyCardEffects(t, card);
    ok(cardsMod.cardStackCount(t, id) === card.effects.filter(e => e.type !== 'modifier').length,
      `${id}: ammo 效果入队 cardEffects`);
    const cfg = cardsMod.computeAmmoConfig(t, 'heat');
    for (const ef of card.effects) {
      if (ef.type !== 'ammo') continue;
      const baseV = RULES.ammoTypes.heat[ef.field];
      if (ef.mode === 'add') {
        // #A13 → 弹种链换算：add 按弹种基准倍率换算（heat pen 1.5 → add 10 → 15）
        const scaled = ef.value * (typeof baseV === 'number' ? baseV : 1);
        ok(Math.abs(cfg[ef.field + 'Add'] - scaled) < 1e-4, `${id}: HEAT ${ef.field} add ${ef.value} → ${ef.field}Add=${scaled}`);
      } else {
        const expected = baseV * (1 + (ef.value - 1));
        ok(Math.abs(cfg[ef.field] - expected) < 1e-4, `${id}: HEAT ${ef.field} mult ${ef.value} → ${expected.toFixed(4)}`);
        ok(cfg[ef.field + 'Add'] === undefined, `${id}: mult 不产生追加量`);
      }
    }
    if (card.effects.some(e => e.type === 'modifier' && e.stat === 'spreadMult')) {
      const spreadEf = card.effects.find(e => e.stat === 'spreadMult');
      ok(Math.abs(t.stats.spreadMult - spreadEf.value) < 1e-9, `${id}: spreadMult modifier 立即生效`);
    }
  }
}

// 8) 实际 cards/ 数据全合法（由 validate-content.js 主校验，这里抽样确认模块可加载）
ok(typeof cardsMod.CARD_TAGS.includes('重甲') === 'boolean', 'CARD_TAGS 含 5 流派');

// ===== 弹种链 2026-09-13：升级替换 / HE 双分支并存 / add 换算 =====
{
  // (a) 链上自动替换：ap → apcr 原地占位 + 激活键同步
  const tA = model.makeTank({ team: 'player' });
  tA.ammoLoadout = ['ap', 'he']; tA.ammoKey = 'ap';
  cardsMod.applyCardEffects(tA, { id: 'chain_apcr', name: '链升级', rarity: 'rare', tags: [], desc: '', effects: [{ type: 'ammo', key: 'apcr' }] });
  ok(tA.ammoLoadout[0] === 'apcr' && tA.ammoLoadout[1] === 'he' && tA.ammoKey === 'apcr',
    '弹种链: ap→apcr 原地替换 + 激活键同步（loadout=apcr,he）');

  // (b) HE 双分支（2026-09-15 用户定案）：首条分支「先新增」弹种保留 he；第二条分支把 he 槽替换掉
  const tB = model.makeTank({ team: 'player' });
  tB.ammoLoadout = ['ap', 'he']; tB.ammoKey = 'he';
  cardsMod.applyCardEffects(tB, { id: 'chain_heat', name: 'HEAT', rarity: 'rare', tags: [], desc: '', effects: [{ type: 'ammo', key: 'heat' }] });
  ok(tB.ammoLoadout.join(',') === 'ap,he,heat' && tB.ammoKey === 'he',
    '弹种链: HE→heat 首条分支先新增（ap,he,heat），保留 he、激活弹种不变');
  cardsMod.applyCardEffects(tB, { id: 'chain_aphe', name: 'APHE', rarity: 'rare', tags: [], desc: '', effects: [{ type: 'ammo', key: 'aphe' }] });
  ok(tB.ammoLoadout.join(',') === 'ap,aphe,heat' && tB.ammoKey === 'aphe',
    '弹种链: 第二条分支 aphe 替换 he 槽（ap,aphe,heat），激活弹种同步为 aphe');

  // (b2) 反序：先抽 aphe 同样先新增；再抽 heat 才替换 he（分支语义与抽取顺序无关）
  const tB2 = model.makeTank({ team: 'player' });
  tB2.ammoLoadout = ['ap', 'he']; tB2.ammoKey = 'he';
  cardsMod.applyCardEffects(tB2, { id: 'chain_aphe2', name: 'APHE2', rarity: 'rare', tags: [], desc: '', effects: [{ type: 'ammo', key: 'aphe' }] });
  cardsMod.applyCardEffects(tB2, { id: 'chain_heat2', name: 'HEAT2', rarity: 'rare', tags: [], desc: '', effects: [{ type: 'ammo', key: 'heat' }] });
  ok(tB2.ammoLoadout.join(',') === 'ap,heat,aphe', '弹种链: 反序抽取同样先新增后替换（ap,heat,aphe）');

  // (b3) 跳级拒绝：未带直系前驱时不得新增/替换（apds 需 apcr、hesh 需 aphe、proximity_he 需 hesh）
  const tJ = model.makeTank({ team: 'player' });
  tJ.ammoLoadout = ['ap', 'he']; tJ.ammoKey = 'ap';
  cardsMod.applyCardEffects(tJ, { id: 'jump_apds', name: 'JMP', rarity: 'rare', tags: [], desc: '', effects: [{ type: 'ammo', key: 'apds' }] });
  ok(tJ.ammoLoadout.join(',') === 'ap,he', '弹种链: 无 apcr 时 apds 卡被拒（跳级不可新增）');
  cardsMod.applyCardEffects(tJ, { id: 'jump_hesh', name: 'JMP', rarity: 'rare', tags: [], desc: '', effects: [{ type: 'ammo', key: 'hesh' }] });
  ok(tJ.ammoLoadout.join(',') === 'ap,he', '弹种链: 无 aphe 时 hesh 卡被拒（跳级不可新增）');

  // (c) add 换算：+10mm 基础穿深卡在 apds（pen 1.4）上 penAdd = 14
  const sC = { ammoKey: 'apds', cardEffects: [{ type: 'ammo', key: 'apds', field: 'pen', mode: 'add', value: 10 }] };
  const cfgC = cardsMod.computeAmmoConfig(sC, 'apds');
  ok(Math.abs(cfgC.penAdd - 14) < 1e-4, '弹种链: +10mm 基础穿深卡 × apds 1.4 → penAdd=14（换算生效）');

  // (d) ap 基准不换算：+15mm AP 卡 penAdd 保持 15
  const sD = { ammoKey: 'ap', cardEffects: [{ type: 'ammo', key: 'ap', field: 'pen', mode: 'add', value: 15 }] };
  const cfgD = cardsMod.computeAmmoConfig(sD, 'ap');
  ok(Math.abs(cfgD.penAdd - 15) < 1e-4, '弹种链: AP 基准（×1.0）不换算 → penAdd=15');
}

// ===== #A14b / #A15：resolveHit 卡牌被动接线（overmatch 免跳弹 / spall_liner 整车减伤）=====
{
  const G = require('../js/tank_geometry.js');
  global.ARMOR = G.ARMOR; global.BOUNCE_ANGLE = G.BOUNCE_ANGLE;
  global.faceLabel = G.faceLabel; global.superstructureLabel = G.superstructureLabel;
  global.moduleFromHit = G.moduleFromHit;
  global.setDebuff = model.setDebuff; global.moduleMult = model.moduleMult;
  global.reflectDir = U.reflectDir; global.rotate = U.rotate;
  const P = require('../js/tank_physics.js');

  const HIT_FRONT = { part: 'hull', faceKey: 'front', x: 32, y: 0, nx: 1, ny: 0, edgeName: 'front' };
  const mkTarget15 = () => model.makeTank({ team: 'enemy', hullAngle: 0, turretAngle: 0 });
  // 陡角入射：与正面法线夹角 80°（> 跳弹角 70°），eff = 厚度 / cos(80°)
  const steep = { dx: Math.cos(80 * Math.PI / 180), dy: Math.sin(80 * Math.PI / 180) };
  const effSteep = P.impactGeometry(Object.assign({ x: 0, y: 0 }, steep), HIT_FRONT, mkTarget15()).eff;

  // 固定骰子：applyModuleDamage 的 0.85 + rand×0.3 抖动固定为 ×1.0，伤害可精确比对
  const realRandom = Math.random;
  Math.random = function () { return 0.5; };
  try {
    // (a) 基线：无卡 + AP 陡角 → 照常跳弹
    const rBase = P.resolveHit(
      { x: 0, y: 0, dx: steep.dx, dy: steep.dy, pen: effSteep * 2, dmg: 34, ammoKey: 'ap', shooter: null, canBounce: true },
      mkTarget15(), Object.assign({}, HIT_FRONT), true);
    ok(rBase.outcome === 'BOUNCE', '#A14b: 无卡基线 — AP 陡角照常跳弹');

    // (b) overmatch 免跳弹：eff ≤ pen×0.85 → 跳过跳弹/过陡 BLOCK，强制按穿透路径结算
    const omShooter = { cardEffects: [{ type: 'passive', key: 'overmatch', value: 0.85 }] };
    const rOm = P.resolveHit(
      { x: 0, y: 0, dx: steep.dx, dy: steep.dy, pen: effSteep / 0.85, dmg: 34, ammoKey: 'ap', shooter: omShooter, canBounce: true },
      mkTarget15(), Object.assign({}, HIT_FRONT), true);
    ok(rOm.outcome === 'PEN' && rOm.overmatch === true, '#A14b: overmatch 生效 — eff ≤ pen×0.85 免跳弹强制穿透');

    // (c) 阈值不满足：eff > pen×0.85 → 照常跳弹
    const rOmLow = P.resolveHit(
      { x: 0, y: 0, dx: steep.dx, dy: steep.dy, pen: effSteep * 0.8, dmg: 34, ammoKey: 'ap', shooter: omShooter, canBounce: true },
      mkTarget15(), Object.assign({}, HIT_FRONT), true);
    ok(rOmLow.outcome === 'BOUNCE', '#A14b: eff > pen×0.85 不触发碾压 — 照常跳弹');

    // (d) HEAT 不受 overmatch 影响（本就 noBounce；语义限定 AP/APCR）
    const rHeat = P.resolveHit(
      { x: 0, y: 0, dx: steep.dx, dy: steep.dy, pen: effSteep, dmg: 34, ammoKey: 'heat', shooter: omShooter, canBounce: true },
      mkTarget15(), Object.assign({}, HIT_FRONT), true);
    ok(rHeat.outcome !== 'BOUNCE' && rHeat.overmatch === undefined,
      '#A14b: HEAT 弹不走 overmatch 标记路径');

    // (e) spall_liner 整车减伤乘算：正入射击穿，dmg ≈ 基线 × 0.8（取整容差 ±1）
    const flat = { dx: 1, dy: 0 };
    const shellFlat = (extra) => Object.assign({ x: 0, y: 0, dx: 1, dy: 0, pen: 1e9, dmg: 100, ammoKey: 'ap', canBounce: false }, extra);
    const dBase = P.resolveHit(shellFlat({ shooter: null }), mkTarget15(), Object.assign({}, HIT_FRONT), false).dmg;
    const tS = mkTarget15();
    tS.cardEffects = [{ type: 'passive', key: 'spall_liner', value: 0.8 }];
    const dSpall = P.resolveHit(shellFlat({ shooter: null }), tS, Object.assign({}, HIT_FRONT), false).dmg;
    ok(Math.abs(dSpall - dBase * 0.8) <= 1, `#A15: spall_liner 减伤乘算 ${dBase}→${dSpall} ≈ ×0.8`);

    // (f) 多来源取最强：0.8 + 0.85 同时持有 → 按 0.8 结算（非叠乘 0.68）
    const tM = mkTarget15();
    tM.cardEffects = [
      { type: 'passive', key: 'spall_liner', value: 0.8 },
      { type: 'passive', key: 'spall_liner', value: 0.85 }
    ];
    const dMulti = P.resolveHit(shellFlat({ shooter: null }), tM, Object.assign({}, HIT_FRONT), false).dmg;
    ok(dMulti === dSpall, `#A15: 多来源取最强 — 双内衬按 ×0.8 结算（${dMulti}=${dSpall}，非叠乘 ×0.68）`);
  } finally {
    Math.random = realRandom;
  }

  // (g) 内容断言：三张涉改卡的 schema 与效果行
  const cardsDir = path.join(__dirname, '..', 'cards');
  const heDoc = JSON.parse(fs.readFileSync(path.join(cardsDir, 'demo_all_he_doctrine.json'), 'utf8'));
  ok(cardsMod.validateCard(heDoc).length === 0 && !heDoc.effects.some(e => e.type === 'modifier' && e.stat === 'reload'),
    '#A14a: 全线高爆战术 — 已移除全局 reload modifier 效果');
  const omCard = JSON.parse(fs.readFileSync(path.join(cardsDir, 'demo_overmatch_shell.json'), 'utf8'));
  ok(cardsMod.validateCard(omCard).length === 0
    && !omCard.effects.some(e => e.type === 'ammo')
    && omCard.effects.some(e => e.type === 'passive' && e.key === 'overmatch' && e.value === 0.85),
    '#A14b: 超口径穿甲弹 — 移除 HE dmg 效果、保留 passive overmatch 0.85');
  const spRare = JSON.parse(fs.readFileSync(path.join(cardsDir, 'support_spall_liner.json'), 'utf8'));
  const spEpic = JSON.parse(fs.readFileSync(path.join(cardsDir, 'spall_liner.json'), 'utf8'));
  ok(spRare.effects[0].value === 0.8 && spEpic.effects[0].value === 0.85
    && cardsMod.validateCard(spRare).length === 0 && cardsMod.validateCard(spEpic).length === 0,
    '#A15: 内衬双卡数值 rare 0.8 / epic 0.85 且 schema 合法');
}

// ===== 卡牌直系演变（2026-09-15 用户定案三链：replaceAmmo 替换直系前驱槽位 / ammoKey 同步 / 禁止跳级）=====
{
  const cardsDir = path.join(__dirname, '..', 'cards');
  const apfsdsCard = JSON.parse(fs.readFileSync(path.join(cardsDir, 'sniper_apfsds_conversion.json'), 'utf8'));
  const blastHeCard = JSON.parse(fs.readFileSync(path.join(cardsDir, 'ammo_upgrade_blast_he.json'), 'utf8'));
  ok(apfsdsCard.id === 'sniper_apfsds_conversion' && cardsMod.validateCard(apfsdsCard).length === 0, 'apfsds 演变卡 schema 合法');
  ok(blastHeCard.id === 'ammo_upgrade_blast_he' && cardsMod.validateCard(blastHeCard).length === 0, 'blast_he 演变卡 schema 合法');
  ok(apfsdsCard.maxStacks === 1 && blastHeCard.maxStacks === 1, '演变卡均为 maxStacks=1（不叠加）');
  ok(apfsdsCard.effects[0].replaceAmmo === 'apds', 'sniper_apfsds_conversion 前驱为 apds（禁跳级，不再 ap→apfsds）');
  ok(blastHeCard.effects[0].replaceAmmo === 'proximity_he', 'ammo_upgrade_blast_he 前驱为 proximity_he（HE 榴弹链末段）');

  // (a) KE 链逐级：ap → apcr → apds → apfsds（先持 apcr/apds 才可 apfsds，跳级拒绝）
  const tA = model.makeTank({ team: 'player' });
  tA.ammoLoadout = ['ap', 'he'];
  tA.ammoKey = 'ap';
  cardsMod.applyCardEffects(tA, apfsdsCard);   // 无 apds：跳级被拒
  ok(tA.ammoLoadout.join(',') === 'ap,he' && tA.ammoKey === 'ap', 'apfsds: 未持直系前驱 apds → 拒绝变更（不新增不替换）');
  tA.ammoLoadout = ['ap', 'apcr', 'apds']; tA.ammoKey = 'apds';
  cardsMod.applyCardEffects(tA, apfsdsCard);  // 已持 apds → 原位替换
  ok(tA.ammoLoadout.join(',') === 'ap,apcr,apfsds', 'apfsds: 已持前驱 apds → 槽位原位替换（ap,apcr,apfsds）');
  ok(tA.ammoKey === 'apfsds', 'apfsds: 当前弹种 ammoKey 同步为 apfsds');

  // (b) HE→APHE 分支（ammo_upgrade_aphe 新增 → hesh 替换 aphe → proximity_he 替换 hesh → blast_he 替换 proximity_he）
  const tH = model.makeTank({ team: 'player' });
  tH.ammoLoadout = ['ap', 'he'];
  tH.ammoKey = 'he';
  cardsMod.applyCardEffects(tH, blastHeCard);  // 未走分支：无 proximity_he → 拒绝
  ok(tH.ammoLoadout.join(',') === 'ap,he', 'blast_he: 未走 HE→APHE 分支 → 拒绝变更（不新增）');
  const apheCard = JSON.parse(fs.readFileSync(path.join(cardsDir, 'ammo_upgrade_aphe.json'), 'utf8'));
  const heshCard = JSON.parse(fs.readFileSync(path.join(cardsDir, 'ammo_upgrade_hesh.json'), 'utf8'));
  const proxCard = JSON.parse(fs.readFileSync(path.join(cardsDir, 'ammo_upgrade_proximity_he.json'), 'utf8'));
  cardsMod.applyCardEffects(tH, apheCard);    // 首条 HE 分支：新增 aphe，保留 he
  ok(tH.ammoLoadout.join(',') === 'ap,he,aphe', 'HE 分支: aphe 首条分支新增（ap,he,aphe）');
  cardsMod.applyCardEffects(tH, heshCard);    // hesh 替换 aphe
  ok(tH.ammoLoadout.join(',') === 'ap,he,hesh', 'HE 分支: hesh 替换 aphe（ap,he,hesh）');
  cardsMod.applyCardEffects(tH, proxCard);    // proximity_he 替换 hesh
  ok(tH.ammoLoadout.join(',') === 'ap,he,proximity_he', 'HE 分支: proximity_he 替换 hesh（ap,he,proximity_he）');
  cardsMod.applyCardEffects(tH, blastHeCard); // blast_he 替换 proximity_he
  ok(tH.ammoLoadout.join(',') === 'ap,he,blast_he', 'blast_he: 已持前驱 proximity_he → 原位替换（ap,he,blast_he）');
  const tH2 = model.makeTank({ team: 'player' });
  tH2.ammoLoadout = ['ap', 'he', 'blast_he'];
  tH2.ammoKey = 'ap';
  cardsMod.applyCardEffects(tH2, blastHeCard);
  ok(tH2.ammoKey === 'ap', 'blast_he: 当前弹种非替换目标时 ammoKey 不误改');

  // (c) 未带直系前驱且有空槽 → 不再追加（跳级拒绝；旧语义「追加末尾」废弃）
  const tP = model.makeTank({ team: 'player' });
  tP.ammoLoadout = ['heat'];
  tP.ammoKey = 'heat';
  cardsMod.applyCardEffects(tP, apfsdsCard);
  ok(tP.ammoLoadout.join(',') === 'heat', '演变卡: 未带前驱且有空槽 → 拒绝追加（不跳级）');

  // (d) 满 3 槽且无直系前驱 → 不再替换首槽（跳级拒绝；旧语义「替换首槽」废弃）
  const tF = model.makeTank({ team: 'player' });
  tF.ammoLoadout = ['heat', 'apcr', 'he'];
  cardsMod.applyCardEffects(tF, apfsdsCard);
  ok(tF.ammoLoadout.join(',') === 'heat,apcr,he', '演变卡: 槽满无前驱 → 拒绝替换首槽（不跳级）');

  // (e) maxStacks=1 幂等：重复应用不重复演变（目标已被替换、演变弹种已存在 → 无操作）
  const tI = model.makeTank({ team: 'player' });
  tI.ammoLoadout = ['ap', 'apcr', 'apds'];
  tI.ammoKey = 'apds';
  cardsMod.applyCardEffects(tI, apfsdsCard);
  cardsMod.applyCardEffects(tI, apfsdsCard);
  ok(tI.ammoLoadout.join(',') === 'ap,apcr,apfsds' && tI.ammoKey === 'apfsds', '演变卡幂等: 重复应用不重复演变/不溢出');

  // (f) 普通 ammo 改造卡（无 replaceAmmo、非演变 key）不触碰槽位（仍只走 computeAmmoConfig 倍率）
  const tN = model.makeTank({ team: 'player' });
  tN.ammoLoadout = ['ap', 'he'];
  const plainCard = { id: 'c_ap', name: 'AP穿深', rarity: 'common', effects: [{ type: 'ammo', key: 'ap', field: 'pen', mode: 'mult', value: 1.2 }] };
  cardsMod.applyCardEffects(tN, plainCard);
  ok(tN.ammoLoadout.join(',') === 'ap,he', '普通 ammo 卡不触发演变、槽位不变');

  // (g) 演变后 computeAmmoConfig 对新弹种正常输出（消费方按 RULES.ammoTypes 计算）
  const cfgA = cardsMod.computeAmmoConfig({ ammoKey: 'apfsds', cardEffects: [] }, 'apfsds');
  const cfgH = cardsMod.computeAmmoConfig({ ammoKey: 'blast_he', cardEffects: [] }, 'blast_he');
  ok(typeof cfgA.pen === 'number' && Number.isFinite(cfgA.pen) && cfgA.pen > 0, 'apfsds 演变后 computeAmmoConfig 正常');
  ok(typeof cfgH.dmg === 'number' && Number.isFinite(cfgH.dmg) && cfgH.dmg > 0, 'blast_he 演变后 computeAmmoConfig 正常');
}

// ===== 2026-09-14 装备优先（用户定案：无技能/武器时先提供装备卡） =====
{
  const equipPool = [
    { id: 'e_ability', name: '主动能力', rarity: 'common', effects: [{ type: 'ability', key: 'artillery_strike' }] },
    { id: 'e_weapon', name: '副武器安装', rarity: 'common', effects: [{ type: 'weapon', action: 'install', slot: 'secondary', weaponType: 'mortar' }] },
    { id: 'e_passive', name: '被动强化', rarity: 'common', effects: [{ type: 'passive', key: 'spall_liner', value: 0.9 }] },
    { id: 'e_mod', name: '属性增强', rarity: 'common', effects: [{ type: 'modifier', stat: 'maxHp', mode: 'add', value: 20 }] }
  ];
  // 无任何技能/副武器 → 抽 2 张：必含 ability 卡 + 副武器安装卡
  const drawNone = cardsMod.drawCardChoices(equipPool, 2, { owned: { abilities: [], secondaryWeapon: 'none' } });
  ok(drawNone.some(c => c.id === 'e_ability') && drawNone.some(c => c.id === 'e_weapon'),
    '装备优先：无技能+无副武器 → 两张保底含 ability 卡与副武器安装卡');
  // 已有能力但无副武器 → 保底副武器安装卡
  const drawHasAbil = cardsMod.drawCardChoices(equipPool, 2, { owned: { abilities: ['artillery_strike'], secondaryWeapon: 'none' } });
  ok(drawHasAbil.some(c => c.id === 'e_weapon'), '已有能力缺副武器 → 保底副武器安装卡');
  // 副武器已装（mortar）但无能力 → 保底 ability 卡
  const drawHasWeap = cardsMod.drawCardChoices(equipPool, 2, { owned: { abilities: [], secondaryWeapon: 'mortar' } });
  ok(drawHasWeap.some(c => c.id === 'e_ability'), '有副武器缺能力 → 保底 ability 卡');
  // 两者齐备 → 不再强制（抽样结果不保证任何装备卡）
  const drawFull = cardsMod.drawCardChoices(equipPool, 2, { owned: { abilities: ['artillery_strike'], secondaryWeapon: 'mortar' } });
  ok(drawFull.length === 2 && drawFull.every(c => equipPool.some(p => p.id === c.id)), '能力+副武器齐备 → 正常 2 选（无强制装备）');
  // 超量抽取：count > 池内可用 → 返回全部可用
  const drawOver = cardsMod.drawCardChoices(equipPool, 99, { owned: { abilities: [], secondaryWeapon: 'none' } });
  ok(drawOver.length === equipPool.length, '超量抽取返回全池（装备优先不改变上限语义）');
}

// ===== #A28 主动技能 upgrade 卡的持有资格（requiresAbility）=====
// 症状：全部 ability 卡都不带 requiresAbility，`炮击扩增`/`加固战术掩体` 这类「升级卡」在
// 玩家尚未持有对应基础能力时就被抽到（params 覆写无处生效，构筑语义错乱）。
// 定案：升级卡显式声明 `requiresAbility:<同 key>`，由既有 cardEligible 过滤；
// 基础/安装卡（该 key 的唯一获取途径）不得声明，否则该能力永远无法获得（死锁回归）。
{
  const cardsDir = path.join(__dirname, '..', 'cards');
  const ALL_CARDS = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json')).sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(cardsDir, f), 'utf8')));
  const byId = {};
  for (const c of ALL_CARDS) byId[c.id] = c;

  // 效果级谓词
  const abilEffects = c => (c.effects || []).filter(ef => ef && ef.type === 'ability');
  const isMarked = c => abilEffects(c).some(ef => ef.requiresAbility);
  const markedIds = ALL_CARDS.filter(isMarked).map(c => c.id).sort();

  // 1) schema：requiresAbility 必须是 ABILITY_KEYS 内的字符串（拼写错误曾让资格过滤静默失效）
  ok(cardsMod.validateCardEffect({ type: 'ability', key: 'artillery', requiresAbility: 'artillery' }, 'e').length === 0,
    '#A28: requiresAbility 合法值通过校验');
  ok(cardsMod.validateCardEffect({ type: 'ability', key: 'artillery', requiresAbility: 'artilery' }, 'e').length > 0,
    '#A28: requiresAbility 拼写错误（artilery）被 schema 拒绝');
  ok(cardsMod.validateCardEffect({ type: 'ability', key: 'artillery', requiresAbility: 7 }, 'e').length > 0,
    '#A28: requiresAbility 非字符串（7）被 schema 拒绝');
  ok(cardsMod.validateCardEffect({ type: 'ability', key: 'artillery' }, 'e').length === 0,
    '#A28: requiresAbility 缺省仍合法（基础/安装卡零声明）');

  // 2) 内容分类：5 张升级卡标记、同 key 基础卡不标记
  const EXPECT_UPGRADE = ['ability_artillery_barrage', 'ability_artillery_heavy',
    'ability_artillery_strike_point', 'ability_artillery_strike_carpet', 'ability_deploy_cover_fortified'];
  for (const id of EXPECT_UPGRADE) {
    const c = byId[id];
    ok(!!c && abilEffects(c).some(ef => ef.requiresAbility === ef.key && ef.params),
      `#A28: 升级卡 ${id} 声明 requiresAbility=自身 key 且带 params 覆写`);
  }
  const EXPECT_BASE = ['artillery_strike', 'tactical_shield', 'super_reload', 'ability_deploy_cover',
    'mobile_track_repair', 'support_track_repair', 'emergency_track', 'support_recon', 'sniper_recon_mark',
    'repair_kit', 'support_extinguisher'];
  for (const id of EXPECT_BASE) {
    const c = byId[id];
    ok(!!c && !isMarked(c), `#A28: 基础/安装卡 ${id} 不得声明 requiresAbility（保持恒可抽）`);
  }

  // 3) 通用不变量 A：requiresAbility 必须等于自身 key（ability 升级语义 = 同一 key 的 params 覆写）
  const mismatched = [];
  for (const c of ALL_CARDS) {
    for (const ef of abilEffects(c)) {
      if (ef.requiresAbility && ef.requiresAbility !== ef.key) mismatched.push(`${c.id}:${ef.requiresAbility}≠${ef.key}`);
    }
  }
  ok(mismatched.length === 0, `#A28: 全部 requiresAbility 与自身 key 一致${mismatched.length ? ` — ${mismatched.join(', ')}` : ''}`);

  // 4) 通用不变量 B（死锁回归防线）：每个出现过的 ability key 至少有一张「未标记」卡作为获取途径
  const keyAll = {}, keyUnmarked = {};
  for (const c of ALL_CARDS) {
    for (const ef of abilEffects(c)) {
      if (!ef.key) continue;
      keyAll[ef.key] = (keyAll[ef.key] || 0) + 1;
      if (!ef.requiresAbility) keyUnmarked[ef.key] = (keyUnmarked[ef.key] || 0) + 1;
    }
  }
  const deadlock = Object.keys(keyAll).filter(k => !keyUnmarked[k]);
  ok(deadlock.length === 0,
    `#A28: 无死锁 — 每个 ability key 都至少有一张未标记卡可获取${deadlock.length ? ` — 死锁 key: ${deadlock.join(', ')}` : ''}`);
  ok(keyAll['artillery'] >= 1 && keyUnmarked['artillery'] >= 1 && keyUnmarked['deploy_cover'] >= 1,
    '#A28: artillery / deploy_cover 的获取途径存在（artillery_strike / ability_deploy_cover）');

  // 5) cardEligible 直接判定：未持有 → 不合格；持有 → 合格；基础卡两态皆合格
  const barrage = byId['ability_artillery_barrage'];
  const fortified = byId['ability_deploy_cover_fortified'];
  const baseArt = byId['artillery_strike'];
  ok(cardsMod.cardEligible(barrage, { abilities: [], primaryWeapon: 'standard', secondaryWeapon: 'mortar' }) === false,
    '#A28: cardEligible — 未持有 artillery 时炮击扩增不合格');
  ok(cardsMod.cardEligible(barrage, { abilities: ['artillery'], primaryWeapon: 'standard', secondaryWeapon: 'mortar' }) === true,
    '#A28: cardEligible — 持有 artillery 后炮击扩增合格');
  ok(cardsMod.cardEligible(fortified, { abilities: [], secondaryWeapon: 'mortar' }) === false
    && cardsMod.cardEligible(fortified, { abilities: ['deploy_cover'], secondaryWeapon: 'mortar' }) === true,
    '#A28: cardEligible — 加固战术掩体随 deploy_cover 持有状态翻转');
  ok(cardsMod.cardEligible(baseArt, { abilities: [], secondaryWeapon: 'mortar' }) === true
    && cardsMod.cardEligible(baseArt, { abilities: ['artillery'], secondaryWeapon: 'mortar' }) === true,
    '#A28: cardEligible — 基础炮击卡两态皆合格（安装卡不受限）');

  // 6) 语义闭环（第 3 步确认）：抽到基础卡 → key 入 cardEffects → 升级卡随之合格
  const tSem = model.makeTank({ team: 'player' });
  ok(cardsMod.cardEligible(barrage, { abilities: [] }) === false, '#A28: 闭环前 — 未持基础卡，升级卡不合格');
  cardsMod.applyCardEffects(tSem, baseArt);
  const ownedNow = Array.from(new Set((tSem.cardEffects || [])
    .filter(ef => ef && ef.type === 'ability' && ef.key).map(ef => ef.key)));
  ok(ownedNow.indexOf('artillery') >= 0, '#A28: applyCardEffects 把基础卡 key 落入 cardEffects（非 modifier 分支保留 ef.key）');
  ok(cardsMod.cardEligible(barrage, { abilities: ownedNow }) === true, '#A28: 闭环后 — 升级卡变为合格（同源 mvp drawRewardCards 的 owned.abilities 组装）');

  // 7) 抽取端：真实卡池 + 未持有任何能力 → 升级卡绝不出现（多池 × 多种子）
  const FILLER = ALL_CARDS.filter(c => !isMarked(c) && abilEffects(c).length === 0);
  const realPools = {
    '全池': ALL_CARDS,
    '传奇池': ALL_CARDS.filter(c => c.rarity === 'legendary'),
    '能力池': ALL_CARDS.filter(c => abilEffects(c).length > 0)
  };
  for (const poolName in realPools) {
    const p = realPools[poolName];
    // 池内是否存在「未标记」的基础 ability 卡——决定该池是否应抽得到能力卡
    const poolBaseAbil = p.filter(c => abilEffects(c).length && !isMarked(c));
    let leaked = [];
    let baseSeen = false;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRNG(seed);
      const drawn = cardsMod.drawCardChoices(p, 5, {
        rng,
        ammoLoadout: ['ap', 'he'],
        owned: { abilities: [], primaryWeapon: 'standard', secondaryWeapon: 'mortar', cards: {} }
      });
      for (const c of drawn) {
        if (isMarked(c)) leaked.push(`seed${seed}:${c.id}`);
        else if (abilEffects(c).length) baseSeen = true;
      }
    }
    ok(leaked.length === 0, `#A28: ${poolName} × 200 种子、无能力 → 升级卡零泄漏${leaked.length ? ` — ${leaked.slice(0, 5).join(', ')}` : ''}`);
    ok(poolBaseAbil.length === 0 || baseSeen,
      `#A28: ${poolName} × 200 种子、无能力 → 基础 ability 卡仍可正常抽到（池内基础能力卡 ${poolBaseAbil.length} 张，过滤未过宽）`);
  }

  // 7b) 传奇池现状（实测发现）：池内 2 张 ability 卡（point/carpet）全为升级卡 →
  //     未持有 artillery 时该池「一张能力卡都不提供」。这是**正确**结果而非死锁：
  //     传奇档位本就不存在 artillery 基础卡，获取途径在 common/rare/epic 池。
  const legPool = realPools['传奇池'];
  const legAbil = legPool.filter(c => abilEffects(c).length);
  ok(legAbil.length > 0 && legAbil.every(isMarked),
    `#A28: 传奇池 ability 卡 ${legAbil.length} 张且全为升级卡（故无能力者抽不到，非 bug）`);
  const legDrawn = cardsMod.drawCardChoices(legPool, 5, {
    rng: createRNG(3), owned: { abilities: [], primaryWeapon: 'standard', secondaryWeapon: 'mortar', cards: {} }
  });
  ok(legDrawn.length === 5 && !legDrawn.some(c => abilEffects(c).length),
    '#A28: 传奇池无能力者 → 5 张候选零 ability 卡（保底无基础卡可补，宁缺毋滥）');
  ok(legAbil.every(c => cardsMod.cardEligible(c, { abilities: ['artillery'], secondaryWeapon: 'mortar' }) === true),
    '#A28: 传奇池升级卡在持有 artillery 后全部变为合格（筛选端翻转正确）');

  // 8) 抽取端：持有 artillery 后，artillery 升级卡确实可被抽到
  const artPool = ALL_CARDS.filter(c => abilEffects(c).some(ef => ef.key === 'artillery'));
  const upgradeDrawn = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const drawn = cardsMod.drawCardChoices(artPool, 2, {
      rng: createRNG(seed),
      owned: { abilities: ['artillery'], primaryWeapon: 'standard', secondaryWeapon: 'mortar', cards: {} }
    });
    for (const c of drawn) if (isMarked(c)) upgradeDrawn.add(c.id);
  }
  ok(upgradeDrawn.has('ability_artillery_barrage') || upgradeDrawn.has('ability_artillery_heavy')
    || upgradeDrawn.has('ability_artillery_strike_point') || upgradeDrawn.has('ability_artillery_strike_carpet'),
    `#A28: 持有 artillery 后 artillery 升级卡进入候选（400 种子覆盖 ${upgradeDrawn.size} 种）`);
  ok(!upgradeDrawn.has('ability_deploy_cover_fortified'),
    '#A28: 持有 artillery 但不持 deploy_cover → 掩体升级卡仍不出现（按 key 精确判定）');

  // 9) 保底路径：无能力时强制补 1 张 ability 卡，且必须是无 requiresAbility 的基础卡
  //    （过滤在 early-return/保底之前执行，保底不得复活已剔除的升级卡）
  const guaranteePool = [baseArt, byId['ability_artillery_barrage'], byId['ability_artillery_heavy'],
    byId['ability_artillery_strike_point'], byId['ability_artillery_strike_carpet']].concat(FILLER.slice(0, 12));
  let guaranteeBad = 0, guaranteeNoAbility = 0, guaranteeMulti = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const drawn = cardsMod.drawCardChoices(guaranteePool, 3, {
      rng: createRNG(seed),
      owned: { abilities: [], primaryWeapon: 'standard', secondaryWeapon: 'mortar', cards: {} }
    });
    const abil = drawn.filter(c => abilEffects(c).length);
    if (abil.length === 0) guaranteeNoAbility++;
    if (abil.length > 1) guaranteeMulti++;
    if (abil.some(isMarked)) guaranteeBad++;
  }
  ok(guaranteeBad === 0, `#A28: 保底路径 200 种子未复活任何 requiresAbility 升级卡${guaranteeBad ? ` — ${guaranteeBad} 次` : ''}`);
  ok(guaranteeNoAbility === 0, `#A28: 保底路径恰好 1 张 ability 卡（0 张异常次数=${guaranteeNoAbility}）`);
  ok(guaranteeMulti === 0, `#A28: 保底路径未额外掺入第 2 张 ability 卡（异常次数=${guaranteeMulti}）`);

  // 10) 极端防线：池内 ability 卡全是升级卡（无基础卡）→ 保底不得凭空复活（宁缺毋滥，不崩）
  const onlyUpgrades = [byId['ability_artillery_barrage'], byId['ability_deploy_cover_fortified']].concat(FILLER.slice(0, 10));
  const drawnOnlyUp = cardsMod.drawCardChoices(onlyUpgrades, 3, {
    rng: createRNG(7),
    owned: { abilities: [], primaryWeapon: 'standard', secondaryWeapon: 'mortar', cards: {} }
  });
  ok(drawnOnlyUp.length === 3 && !drawnOnlyUp.some(isMarked),
    '#A28: 池内只剩升级卡时保底不复活（返回 3 张非 upgrade 卡，不崩溃）');
}

// ===== #B8 副武器替换语义（2026-09-16 用户裁定：新 install 卡替换已装副武器，升级卡随类型接续） =====
{
  const W = require('../js/tank_weapons.js');
  const mkInst = (wt) => ({ id: 'swap_' + wt, name: '安装' + wt, rarity: 'common',
    effects: [{ type: 'weapon', action: 'install', slot: 'secondary', weaponType: wt }] });
  const mortarUp = { id: 'swap_mortar_up', name: '迫击炮升级', rarity: 'common', maxStacks: 1,
    effects: [{ type: 'weapon', action: 'upgrade', slot: 'secondary', weaponType: 'mortar',
      statOverrides: { range: 550 } }] };
  const missileUp = { id: 'swap_missile_up', name: '导弹升级', rarity: 'common', maxStacks: 1,
    effects: [{ type: 'weapon', action: 'upgrade', slot: 'secondary', weaponType: 'missile',
      statOverrides: { damage: 160 } }] };

  // (a) apply 层：空槽安装 → 换型替换 → 同型幂等
  const tSwap = model.makeTank({ team: 'player' });
  tSwap.secondaryReloadT = 5;   // 预置旧装填计时，验证换装重置
  cardsMod.applyCardEffects(tSwap, mkInst('mortar'));
  ok(tSwap.weapons.secondary.type === 'mortar'
    && tSwap.weapons.secondary.stats.reload === 8 && tSwap.weapons.secondary.stats.range === 450,
    '#B8: 空槽安装 mortar（stats 含 WEAPON_DEFAULTS 兜底）');
  cardsMod.applyCardEffects(tSwap, mortarUp);
  ok(tSwap.weapons.secondary.stats.range === 550, '#B8: mortar upgrade 生效（range=550）');
  cardsMod.applyCardEffects(tSwap, mkInst('missile'));
  ok(tSwap.weapons.secondary.type === 'missile', '#B8: 非同型 install 替换已装武器（mortar→missile）');
  ok(tSwap.weapons.secondary.stats.reload === 12 && tSwap.weapons.secondary.stats.range === 600
    && tSwap.weapons.secondary.stats.aoe === undefined,
    '#B8: 替换后 stats 全量重建为 missile 默认（旧 mortar upgrade 数值不残留）');
  ok(tSwap.secondaryReloadT === 0, '#B8: 替换时 secondaryReloadT 重置为 0（装填就绪）');
  ok(tSwap._missileLock === null, '#B8: 替换写入清空 _missileLock（旧锁定状态复位）');
  const dmgBefore = JSON.stringify(tSwap.weapons.secondary.stats);
  cardsMod.applyCardEffects(tSwap, mkInst('missile'));
  ok(tSwap.weapons.secondary.type === 'missile' && JSON.stringify(tSwap.weapons.secondary.stats) === dmgBefore,
    '#B8: 同型重复 install 幂等 no-op（stats 不被重置）');
  // 旧武器 upgrade 卡效果仍挂 cardEffects（保留不清），但 upgrade 应用按类型失配 no-op
  ok(tSwap.cardEffects.filter(e => e.cardId === 'swap_mortar_up').length === 1,
    '#B8: 旧 mortar upgrade 的 cardEffects 条目保留（未清除）');
  // 旧 mortar upgrade 对 missile 槽 re-apply：类型失配 + maxStacks 已计入 → 返回空效果且 stats 不变（双重防线）
  const rangeAfterMissile = cardsMod.applyCardEffects(tSwap, mortarUp);
  ok(rangeAfterMissile.length === 0 && tSwap.weapons.secondary.stats.range === 600
    && tSwap.weapons.secondary.stats.damage === 140,
    '#B8: 旧 mortar upgrade 对 missile 槽应用被拒（maxStacks 防线，stats 不变）');
  cardsMod.applyCardEffects(tSwap, missileUp);
  ok(tSwap.weapons.secondary.stats.damage === 160, '#B8: 新 missile upgrade 就位（damage=160）');

  // (b) 资格层：cardEligible — 非同型 install 放行 / 同型重复拒绝 / 升级卡随 owned.secondaryWeapon 翻转
  const owned = { abilities: [], primaryWeapon: 'standard', secondaryWeapon: 'mortar' };
  ok(cardsMod.cardEligible(mkInst('missile'), owned) === true, '#B8: 已装 mortar 时 missile 安装卡 eligible（替换资格）');
  ok(cardsMod.cardEligible(mkInst('mortar'), owned) === false, '#B8: 同型重复 install 拒绝');
  const ownedMissile = { abilities: [], primaryWeapon: 'standard', secondaryWeapon: 'missile' };
  ok(cardsMod.cardEligible(mkInst('missile'), ownedMissile) === false, '#B8: none 槽安装资格不受影响（同型=已装）');
  ok(cardsMod.cardEligible(mkInst('rocket'), { abilities: [], primaryWeapon: 'standard', secondaryWeapon: 'none' }) === true,
    '#B8: 空槽（none）安装资格保持');
  ok(cardsMod.cardEligible(mortarUp, owned) === true && cardsMod.cardEligible(mortarUp, ownedMissile) === false,
    '#B8: 升级卡资格随 owned.secondaryWeapon 动态翻转（mortar 有/missile 无）');

  // (c) 抽取层：已装 mortar 的玩家可从全池抽到其他型安装卡（替换语义落地到抽卡）
  const swapPool = [mkInst('missile'), mkInst('rocket'), mkInst('mine_layer'),
    { id: 'filler1', name: 'f', rarity: 'common', effects: [{ type: 'modifier', stat: 'maxHp', mode: 'add', value: 10 }] },
    { id: 'filler2', name: 'f', rarity: 'common', effects: [{ type: 'modifier', stat: 'damage', mode: 'add', value: 5 }] },
    { id: 'filler3', name: 'f', rarity: 'common', effects: [{ type: 'modifier', stat: 'reload', mode: 'mult', value: 0.95 }] },
    { id: 'filler4', name: 'f', rarity: 'common', effects: [{ type: 'passive', key: 'spall_liner', value: 0.9 }] }];
  const seenSwap = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const drawn = cardsMod.drawCardChoices(swapPool, 3, {
      rng: createRNG(seed),
      owned: { abilities: [], primaryWeapon: 'standard', secondaryWeapon: 'mortar', cards: {} }
    });
    for (const c of drawn) if (c.effects[0].type === 'weapon') seenSwap.add(c.effects[0].weaponType);
  }
  ok(seenSwap.size >= 2, `#B8: 已装 mortar 时其他型安装卡进入候选（200 种子覆盖类型 ${seenSwap.size} 种）`);
  ok(!seenSwap.has('mortar'), '#B8: 同型重复 install 不再进候选');
}

// ===== #C3（2026-09-17）：弹种升级卡保底 — 可解锁升级卡存在时候选必含 1 张（用户裁定「升级卡加权/保底」路线） =====
{
  const upPool = [
    { id: 'up_apcr', name: 'APCR 升级', rarity: 'rare', maxStacks: 1, effects: [{ type: 'ammo', key: 'apcr', replaceAmmo: 'ap', field: 'pen', mode: 'mult', value: 1.1 }] },
    { id: 'p1', name: '参数卡A', rarity: 'common', effects: [{ type: 'ammo', key: 'ap', field: 'pen', mode: 'add', value: 5 }] },
    { id: 'p2', name: '参数卡B', rarity: 'common', effects: [{ type: 'ammo', key: 'he', field: 'dmg', mode: 'add', value: 5 }] },
    { id: 'p3', name: '参数卡C', rarity: 'common', effects: [{ type: 'modifier', stat: 'maxHp', mode: 'add', value: 10 }] },
    { id: 'p4', name: '参数卡D', rarity: 'common', effects: [{ type: 'modifier', stat: 'damage', mode: 'add', value: 5 }] }
  ];
  let guaranteed = 0, overGuarantee = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const drawn = cardsMod.drawCardChoices(upPool, 3, { rng: createRNG(seed), ammoLoadout: ['ap', 'he'] });
    const ups = drawn.filter(c => c.id === 'up_apcr').length;
    if (ups >= 1) guaranteed++;
    if (ups > 1) overGuarantee++;
  }
  ok(guaranteed === 200, `#C3: 前驱在 loadout → 升级卡保底进候选（200/200，got ${guaranteed}）`);
  ok(overGuarantee === 0, '#C3: 保底恰好 1 张（不重复抽入）');
  // 已持有目标弹种（升级完成）→ 不再保底该卡，恢复稀有度权重抽样
  let ownedOut = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const drawn = cardsMod.drawCardChoices(upPool, 3, { rng: createRNG(seed), ammoLoadout: ['ap', 'apcr'] });
    if (!drawn.some(c => c.id === 'up_apcr')) ownedOut++;
  }
  ok(ownedOut > 0, `#C3: 已持有 apcr 后该升级卡不再保底（200 种子中 ${ownedOut} 次未出现，恢复权重抽样）`);
}

console.log('test-cards: 完成所有检查');
if (fails === 0) console.log('test-cards: 全部通过');
else console.error(`test-cards: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
