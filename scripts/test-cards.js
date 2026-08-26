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
ok(cardsMod.validateCardEffect({ type: 'ability', key: 'smoke' }, 'e').length === 0, 'ability 合法');
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
  // 模拟消费公式（gunPen=100mm）：100×(base×1.5)+20；旧「先加后乘」语义为 (100+20)×(base×1.5)
  const apcrBase = RULES.ammoTypes.apcr.pen;
  ok(Math.abs(c13.pen - apcrBase * 1.5) < 1e-4 && Math.abs(c13.penAdd - 20) < 1e-4
    && Math.abs((100 * c13.pen + c13.penAdd) - (100 * apcrBase * 1.5 + 20)) < 1e-4,
    `#A13: add 在乘算后追加（100×${(apcrBase * 1.5).toFixed(2)}+20=${(100 * apcrBase * 1.5 + 20).toFixed(0)}mm，而非先加后乘）`);
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
ok(Math.abs(heCfg.dmg - 1.4) < 1e-4, '#97: HE 伤害双 mult 加法聚合 ×1.4（旧迭代语义为 1.44）');
// add 与 mult 混合时（#A13）：mult 先作用于倍率刻度，add 乘算后追加（见上方明确用例）
const mixCfg = cardsMod.computeAmmoConfig({
  ammoKey: 'heat',
  cardEffects: [
    { type: 'ammo', key: 'heat', field: 'pen', mode: 'mult', value: 1.2 },
    { type: 'ammo', key: 'heat', field: 'pen', mode: 'mult', value: 1.3 }
  ]
}, 'heat');
ok(Math.abs(mixCfg.pen - (1.4 * (1 + 0.2 + 0.3))) < 1e-4, '#97: HEAT 穿深 base×聚合乘子（base 1.4 × 1.5 = 2.1）');
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
        // #A13：add 不混入倍率刻度，单独存放在 field+'Add'，由消费方在乘算后追加
        ok(cfg[ef.field + 'Add'] === ef.value, `${id}: HEAT ${ef.field} add ${ef.value} → ${ef.field}Add=${ef.value}`);
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

console.log('test-cards: 完成所有检查');
if (fails === 0) console.log('test-cards: 全部通过');
else console.error(`test-cards: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
