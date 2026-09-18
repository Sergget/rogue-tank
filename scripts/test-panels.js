'use strict';
// test-panels.js — Node tests for js/tank_panels.js (P-15/P-46 shared UI logic).
// 覆盖：makeLogSink / applyCardToTank / clearCardsFromTank / heldCardsVM /
// activateAbilityForTest / enemyLevelMults / spawnEnemyAt / buildTankDataVM /
// liveEnemies。
// 运行：node scripts/test-panels.js（npm test 已纳入）
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

// ---- global bootstrap (mirrors scripts/test-extreme-combat.js / test-tankcollision.js) ----
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU; global.RULES = R.RULES;
global.norm = U.norm; global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir; global.distToSegment = U.distToSegment;
global.gaussian = U.gaussian; global.angDiff = U.angDiff;
// RULES must be global BEFORE geometry/model/entity loads (they read RULES at module scope)
const G = require('../js/tank_geometry.js');
global.HEIGHTS = G.HEIGHTS; global.ARMOR = G.ARMOR; global.BOUNCE_ANGLE = G.BOUNCE_ANGLE;
global.faceLabel = G.faceLabel; global.moduleFromHit = G.moduleFromHit;
global.moduleLabel = typeof G.moduleLabel === 'function' ? G.moduleLabel : (m => m);
global.hullPoly = G.hullPoly; global.turretPoly = G.turretPoly;
global.gunRoot = G.gunRoot; global.gunTip = G.gunTip;
const H = require('../js/tank_halfgeom.js');
global.normalizeBarrel = H.normalizeBarrel; global.normalizeTankModules = G.normalizeTankModules;
const MD = require('../js/tank_model.js');
global.makeTank = MD.makeTank; global.applyTankConfig = MD.applyTankConfig; global.computeStats = MD.computeStats;
global.setDebuff = MD.setDebuff; global.moduleMult = MD.moduleMult;
global.addModifier = MD.addModifier; global.addTimedModifier = MD.addTimedModifier;
global.removeModifierBySource = MD.removeModifierBySource;
global.refreshStats = MD.refreshStats; global.deriveTankClass = MD.deriveTankClass;
global.tankKmh = MD.tankKmh; global.MODULE_LABELS = MD.MODULE_LABELS;
const EN = require('../js/tank_entity.js');
global.entities = EN.entities; global.spawnTank = EN.spawnTank; global.resetEntity = EN.resetEntity;
global.livingEnemiesOf = EN.livingEnemiesOf; global.nearestEnemyTo = EN.nearestEnemyTo;
global.resolveTankCollisions = EN.resolveTankCollisions;
const CR = require('../js/tank_cards.js');
global.applyCardEffects = CR.applyCardEffects; global.cardStackCount = CR.cardStackCount;
global.computeAmmoConfig = CR.computeAmmoConfig;
const AB = require('../js/tank_abilities.js');
global.hasAbility = AB.hasAbility; global.tryActivateAbility = AB.tryActivateAbility;
global.updateAbilityCd = AB.updateAbilityCd; global.updateAbilityCds = AB.updateAbilityCds;
const MP = require('../js/tank_map.js');
global.triggerDistForDifficulty = MP.triggerDistForDifficulty;
const AI = require('../js/tank_ai.js');
global.alertEntity = AI.alertEntity; global.propagateAlert = AI.propagateAlert;

const P = require('../js/tank_panels.js');

let fails = 0;
function ok(cond, label){ if (cond){ console.log('  ok | ' + label); } else { fails++; console.error('  FAIL | ' + label); } }
function close(a, b, e){ return Math.abs(a - b) <= (e || 1e-9); }

// ---- fixtures ----
const TANK_LIST = {
  dummy:  JSON.parse(fs.readFileSync(path.join(ROOT, 'tanks/dummy.json'), 'utf8')),
  hummel: JSON.parse(fs.readFileSync(path.join(ROOT, 'tanks/hummel.json'), 'utf8'))
};
const LAYERED = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards/layered_armor.json'), 'utf8'));

// ---- helper: build a fresh player-ish tank via real makeTank ----
function playerTank(){ return MD.makeTank({ id:'player', team:'player', x:0, y:0 }); }

console.log('enemyLevelMults (pure curve):');
ok(Object.keys(P.enemyLevelMults(1)).length === 0, 'lv1 -> no mults');
ok(close(P.enemyLevelMults(3).maxHp, Math.pow(1.14, 2)), 'lv3 maxHp = 1.14^2');
ok(P.enemyLevelMults(5).reload < 1, 'lv5 reload is a speed-up (<1)');
ok(P.enemyLevelMults(0).maxHp === undefined, 'lv0 clamped to 1 -> no mults');
ok(P.enemyLevelMults(-3).maxHp === undefined, 'negative clamped to 1');
ok(P.enemyLevelMults(3).armorAll === 1.2, 'lv3 armorAll additive +0.10*2 = 1.2');
ok(P.enemyLevelMults(9999).maxHp > P.enemyLevelMults(10).maxHp, 'high level > mid level');

console.log('heldCardsVM (pure, dual pool shape):');
{
  const tank = { cardEffects: [{cardId:'a'},{cardId:'b'},{cardId:'a'}], modifiers:[] };
  const pool = [{id:'a',name:'A',rarity:'common'},{id:'b',name:'B',rarity:'rare'}];
  const rows = P.heldCardsVM(tank, pool);
  ok(rows.length === 2, '2 distinct cards');
  const a = rows.find(r=>r.id==='a');
  ok(a && a.count === 2, 'card a stack count = 2 (via cardEffects)');
  ok(a && a.name === 'A' && a.rarity === 'common', 'card a name/rarity from pool');
  const tank2 = { cardEffects: [], modifiers: [{source:'card:c'},{source:'card:c'},{source:'other'}] };
  const rows2 = P.heldCardsVM(tank2, [{id:'c',name:'C',rarity:'rare'}]);
  ok(rows2.length === 1 && rows2[0].id==='c' && rows2[0].count === 2, 'modifier-only card surfaced via card: source fallback');
  const rows3 = P.heldCardsVM(tank, { a:{id:'a',name:'A',rarity:'common'}, b:{id:'b',name:'B',rarity:'rare'} });
  ok(rows3.length === 2, 'object cardPool normalised to array');
}

console.log('makeLogSink (shared, replaces dup pushLog):');
{
  const el = {
    _c: [],
    get children(){ return this._c; },
    get lastChild(){ return this._c[this._c.length-1]; },
    prepend(d){ this._c.unshift(d); },
    removeChild(){ this._c.pop(); },
    set innerHTML(v){ if (v === '') this._c = []; },
    get innerHTML(){ return this._c.map(d=>d.textContent||'').join(''); }
  };
  global.document = (/** @type {any} */ ({
    createElement: function(){ return { className:'', textContent:'', parentNode:null }; }
  }));
  const log = P.makeLogSink(el);
  log.push('hello', 'PEN');
  log.push('world', 'CRIT');
  ok(el.children.length === 2, '2 log entries after 2 pushes');
  ok(/world/.test(el.children[0].textContent), 'newest prepended to top (children[0]=world)');
  ok(el.children[0].className === 'CRIT', 'class set on newest entry (CRIT)');
  ok(/hello/.test(el.children[1].textContent), 'oldest now second (children[1]=hello)');
  for (let i = 0; i < 60; i++){ log.push('x' + i, 'COVER'); }
  ok(el.children.length <= 25, 'caps at 25 entries (got ' + el.children.length + ')');
  log.clear();
  ok(el.children.length === 0, 'clear() empties the list (innerHTML="")');
  delete global.document;
}

console.log('applyCardToTank + clearCardsFromTank:');
{
  const t = playerTank();
  const before = t.modifiers.length;
  const applied = P.applyCardToTank(t, LAYERED);
  ok(applied.length >= 1, 'applyCardToTank reports applied effects');
  ok(t.modifiers.length > before, 'modifier added to tank');
  ok(t.modifiers.some(m=>m.source==='card:layered_armor' && m.stat==='armor.hull' && m.mode==='mult' && close(m.value,1.18)), 'card modifier shape correct (armor.hull,mult,1.18)');
  const info = P.clearCardsFromTank(t);
  ok(info.removedMods >= 1 && info.removedEffects === 0, 'clearCardsFromTank removed modifiers + 0 cardEffects');
  ok(!t.modifiers.some(m=>m.source==='card:layered_armor'), 'no card modifiers remain after clear');
  const info2 = P.clearCardsFromTank(t);
  ok(info2.removedMods === 0 && info2.removedEffects === 0, 'clearCardsFromTank idempotent on clean tank');
}

console.log('spawnEnemyAt + buildTankDataVM + liveEnemies:');
{
  EN.entities.length = 0;
  global.tankListData = TANK_LIST;
  const player = playerTank();
  global.player = player;

  const e1 = P.spawnEnemyAt(120, 0, { tankId:'dummy', level:1, anchorStats: player.stats, alert:false });
  ok(!!e1 && e1.team === 'enemy' && e1.id.indexOf('enemy_') === 0, 'spawned enemy, team enemy, prefixed id');
  ok(e1._benchLevel === 1, 'bench level tagged = 1');
  ok(e1.nodeSpawn === true, 'nodeSpawn default true');
  ok(e1.hp === e1.stats.maxHp, 'hp full after spawn (level 1)');

  const eA = P.spawnEnemyAt(700, 0, { tankId:'hummel', level:1, anchorStats: player.stats, alert:false });
  const eB = P.spawnEnemyAt(800, 0, { tankId:'hummel', level:3, anchorStats: player.stats, alert:false });
  ok(eB.stats.maxHp > eA.stats.maxHp, 'lv3 maxHp > lv1 maxHp (level mult applied)');
  ok(eB.stats.penetration >= eA.stats.penetration, 'lv3 penetration >= lv1 (level mult)');
  ok(eB._benchLevel === 3, 'lv3 tagged');
  ok(eB.modifiers.some(m=>/bench-level:LV3/.test(m.source)), 'lv3 carry bench-level:LV3 modifier');

  const eC = P.spawnEnemyAt(900, 0, { tankId:'dummy', level:1, anchorStats: player.stats, alert:false, nodeSpawn:false, aiTier:2 });
  ok(eC.nodeSpawn === false, 'nodeSpawn:false overridden');
  ok(eC.aiTier === 2, 'aiTier override applied');

  let threw = false;
  try { P.spawnEnemyAt(0,0,{tankId:'nope',level:1,alert:false}); } catch(err){ threw = true; }
  ok(threw, 'unknown tankId throws');

  const vm = P.buildTankDataVM(eB);
  ok(vm && vm.id === eB.id && vm.team === 'enemy', 'VM id/team');
  ok(typeof vm.armorFront === 'number', 'VM armorFront is a number');
  ok(vm.mods.length >= 1, 'VM lists applied difficulty modifiers (lv3)');
  ok(typeof vm.status === 'string' && vm.status.length > 0, 'VM status string present: ' + vm.status);
  ok(typeof vm.weight === 'number', 'VM weight is a number (enemy)');
  ok(Array.isArray(vm.ammoLoadout) && vm.ammoLoadout.length === 0, 'VM ammoLoadout defaults to [] (enemy)');
  ok(vm.armor && vm.armor.hull && typeof vm.armor.hull.front === 'number', 'VM armor is live object (enemy hull.front number)');

  const live = P.liveEnemies('enemy');
  ok(live.length >= 2 && live.some(e=>e.id===e1.id) && live.some(e=>e.id===eB.id), 'liveEnemies returns spawned enemies');

  delete global.player;
  delete global.tankListData;
  EN.entities.length = 0;
}

// ============================================================================
console.log('buildTankDataVM (player loadout + live stats modifier):');
{
  const p = playerTank();
  const baseMax = p.stats.maxHp;
  p.ammoLoadout = ['ap','he']; p.ammoKey = 'ap';
  // maxHp has no runtime cap (unlike weight=240t clamp) -> clean live-modifier probe
  MD.addModifier(p, { stat:'maxHp', mode:'add', value: 15, source:'test', scope:'run' });
  const vm = P.buildTankDataVM(p);
  ok(close(vm.maxHp, baseMax + 15), 'VM maxHp reflects live +15 modifier (' + vm.maxHp + ')');
  ok(typeof vm.weight === 'number', 'VM weight is a number (runtime-capped at weightRuntimeCap)');
  ok(vm.ammoKey === 'ap', 'VM ammoKey = ap');
  ok(Array.isArray(vm.ammoLoadout) && vm.ammoLoadout.length === 2, 'VM ammoLoadout length 2');
  ok(typeof vm.currentAmmoIndex === 'number', 'VM currentAmmoIndex present');
  ok(vm.ammo.length >= 2, 'VM per-key ammo read-out >= 2');
  const ap = vm.ammo.find(a=>a.key==='ap');
  ok(ap && typeof ap.pen === 'number' && typeof ap.dmg === 'number', 'VM ammo ap pen/dmg numbers');
  ok(typeof vm.enginePower === 'number', 'VM enginePower is a number');
  ok(vm.mods.length === 1 && vm.mods[0].source === 'test', 'VM surfaces the test maxHp modifier');
}

// ============================================================================
console.log('difficultyCapMuls (speed cap, #B4):');
{
  const player = playerTank();                  // stats.maxSpeed = 120 (makeTank default)
  const enemy = MD.makeTank({ team:'enemy', x:0, y:0 });
  MD.addModifier(enemy, { stat:'maxSpeed', mode:'mult', value:2, source:'entity', scope:'run' }); // 240
  const m = MD.difficultyCapMuls(enemy, { player: player, diffNorm: 1, randFactor: 1 });
  ok(typeof m.speedMul === 'number' && m.speedMul < 1, 'fast enemy -> speedMul<1 caps it down (' + (m.speedMul != null ? m.speedMul.toFixed(3) : 'n/a') + ')');
  // inject the cap mult, recompute -> final ≈ lerp(0.3,0.6,1)*1.0*120 = 72
  MD.addModifier(enemy, { stat:'maxSpeed', mode:'mult', value: m.speedMul, source:'difficulty-cap', scope:'run' });
  MD.refreshStats(enemy);
  ok(Math.abs(enemy.stats.maxSpeed - 72) < 1, 'capped enemy maxSpeed ≈ 72px/s (=0.6×120 player), got ' + enemy.stats.maxSpeed.toFixed(2));
  const slow = MD.makeTank({ team:'enemy', x:0, y:0 });
  MD.addModifier(slow, { stat:'maxSpeed', mode:'mult', value:0.3, source:'slow', scope:'run' }); // -> 36 (< floor 72)
  const m2 = MD.difficultyCapMuls(slow, { player: player, diffNorm: 1, randFactor: 1 });
  ok(typeof m2.speedMul === 'number' && m2.speedMul > 1, 'slow enemy -> speedMul>1 raises it up to floor (0.3×player)');
}

// ============================================================================
// #A24 分层新增：卡牌事务 receipt/rollback + 参数钳制（parameterLimits 唯一收口）
console.log('#A24 card transaction (receipt + rollback) / parameterClamp:');
{
  // (a) parameterClamp：RULES.parameterLimits 区间钳制（含 armor.* 3 段路径）
  ok(P.parameterClamp('reload', 0.1).value === 1.0 && P.parameterClamp('reload', 0.1).clamped === true,
    '#A24/#C2 parameterClamp: reload 0.1 → 下限 1.0（clamped）');
  ok(P.parameterClamp('reload', 99).value === 3.0, '#A24 parameterClamp: reload 99 → 上限 3.0');
  ok(P.parameterClamp('reload', 1.5).value === 1.5 && P.parameterClamp('reload', 1.5).clamped === false,
    '#A24 parameterClamp: 区间内原值返回（clamped=false）');
  ok(P.parameterClamp('armor.hull.front', 5).value === 40, '#A24 parameterClamp: armor 3 段路径 hull.front 下限 40');
  ok(P.parameterClamp('notAStat', 123).value === 123, '#A24 parameterClamp: 无 limits 字段原值返回');
  const cm = P.clampParameterMap({ reload: 99, maxHp: 120 });
  ok(cm.values.reload === 3.0 && cm.values.maxHp === 120 && cm.any === true, '#A24 clampParameterMap: 批量钳制 + any 标记');

  // (b) applyCardTx → receipt → rollbackCardTx：modifier 卡完整回退（stats 复原）
  const t = playerTank();
  const preStats = JSON.parse(JSON.stringify(t.stats));
  const preMods = t.modifiers.length;
  const tx = P.applyCardTx(t, LAYERED);
  ok(tx.ok === true && tx.receipt && tx.receipt.cardId === 'layered_armor', '#A24 applyCardTx: 返回 receipt 快照（含 cardId）');
  ok(t.modifiers.length > preMods, '#A24 applyCardTx: 卡牌 modifier 已应用');
  const rb = P.rollbackCardTx(t, tx.receipt);
  ok(rb.mods >= 1 && t.modifiers.length === preMods, '#A24 rollbackCardTx: modifier 精确回退到快照长度');
  ok(JSON.stringify(t.stats) === JSON.stringify(preStats), '#A24 rollbackCardTx: stats 复原为应用前');

  // (c) 武器安装卡 rollback：weapons 还原为快照
  const t2 = playerTank();
  const installCard = { id: 'tx_install', name: '副武器安装', rarity: 'epic', maxStacks: 1,
    effects: [{ type: 'weapon', action: 'install', slot: 'secondary', weaponType: 'mortar', statOverrides: { reload: 8, damage: 60 } }] };
  const tx2 = P.applyCardTx(t2, installCard);
  ok(t2.weapons.secondary.type === 'mortar', '#A24 applyCardTx: 副武器安装卡写入 weapons.secondary');
  const rb2 = P.rollbackCardTx(t2, tx2.receipt);
  ok(rb2.weapons === true && t2.weapons.secondary.type === 'none', '#A24 rollbackCardTx: 武器安装回退（secondary → none）');
  ok(rb2.effects >= 1 && t2.cardEffects.length === 0, '#A24 rollbackCardTx: cardEffects 队列回退');

  // (d) 满回退后同卡可再 Apply（_cardApplyCount 已还原，maxStacks=1 不误锁）
  const tx3 = P.applyCardTx(t2, installCard);
  ok(tx3.applied.length >= 1 && t2.weapons.secondary.type === 'mortar', '#A24 回退后可重新 Apply 同卡（应用计数已还原）');

  // (e) clearCardsFromTank 现在覆盖武器副作用（#A24 完整取消）
  const info = P.clearCardsFromTank(t2);
  ok(info.removedEffects >= 1 && t2.weapons.secondary.type === 'none', '#A24 clearCardsFromTank: 同步回退武器安装副作用');
}

// ============================================================================
// #A25 独立日志面板：createLogPanel 生命周期（open/close/toggle）+ 复用 makeLogSink 行为
console.log('#A25 createLogPanel (independent log panel lifecycle):');
{
  // 最小 DOM stub（含 classList），模拟页面容器 + 列表
  const list = {
    _c: [],
    get children(){ return this._c; },
    get lastChild(){ return this._c[this._c.length-1]; },
    prepend(d){ this._c.unshift(d); },
    removeChild(){ this._c.pop(); },
    set innerHTML(v){ if (v === '') this._c = []; },
    get innerHTML(){ return this._c.map(d=>d.textContent||'').join(''); }
  };
  const classes = new Set(['rt-log-hidden']);
  const root = {
    classList: { add:(c)=>classes.add(c), remove:(c)=>classes.delete(c) },
    appendChild(){}
  };
  global.document = (/** @type {any} */ ({
    createElement: () => ({ className:'', textContent:'', parentNode:null })
  }));
  let opened = 0, closed = 0;
  const lp = P.createLogPanel(root, { list: list, onOpen: ()=>opened++, onClose: ()=>closed++ });
  ok(typeof lp.push === 'function' && typeof lp.toggle === 'function' && lp.listEl === list,
    '#A25 createLogPanel: 返回 push/clear/toggle 且复用注入的列表元素');
  lp.push('log-a', 'PEN');
  ok(list.children.length === 1 && /log-a/.test(list.children[0].textContent),
    '#A25 独立日志面板 push 写入注入列表（行为与 makeLogSink 一致）');
  const wasOpen = lp.isOpen();
  lp.toggle();
  ok(lp.isOpen() === !wasOpen, '#A25 toggle() 翻转 open/close 状态');
  ok((opened + closed) >= 1, '#A25 open/close 生命周期回调被触发');
  lp.toggle(false);
  ok(lp.isOpen() === false && classes.has('rt-log-hidden'), '#A25 toggle(false) 关闭并加上 hiddenClass（独立浮层可隐藏）');
  lp.toggle(true);
  ok(lp.isOpen() === true && !classes.has('rt-log-hidden'), '#A25 toggle(true) 打开并移除 hiddenClass');
  lp.clear();
  ok(list.children.length === 0, '#A25 clear() 清空独立日志面板');
  delete global.document;
}

console.log('activateAbilityForTest (auto-inject debug card + cooldown):');{
  const t = playerTank();
  const r = P.activateAbilityForTest(t, 'overdrive', {});
  ok(r.ok === true && r.key === 'overdrive', 'overdrive ok (auto-injected card)');
  ok(t.abilityCds && t.abilityCds.overdrive > 0, 'overdrive set abilityCds.overdrive (per-key cooldown, #C4c)');
  ok(t.reloadT === 0, 'overdrive cleared reloadT (burst reload)');
  const r2 = P.activateAbilityForTest(t, 'overdrive', {});
  ok(r2.ok === false && r2.reason === 'cooldown', 'second overdrive within CD -> cooldown');
  const r3 = P.activateAbilityForTest(t, 'nope_key', {});
  ok(r3.ok === false, 'unknown ability key rejected');
  const r4 = P.activateAbilityForTest(null, 'overdrive', {});
  ok(r4.ok === false && r4.reason === 'no-tank', 'null tank -> no-tank');
}

process.exitCode = fails ? 1 : 0;
console.log('\n' + (fails === 0 ? 'ALL PASS' : (fails + ' failure(s)')));
