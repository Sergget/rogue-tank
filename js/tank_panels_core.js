'use strict';

// ============================================================================
// tank_panels_core.js — P-15/P-46/#A24 panel layer 1/4：PURE CORE
//
// 纯逻辑层：零 DOM、零页面状态。所有函数只做「读坦克 / 算视图模型 / 对注入状态施加
// 副作用」，DOM 与键位绑定由 tank_panels_dom.js（层 2）与各页面控制器（层 3）承担。
//
// #A24 分层（验收方向）：
//   层 1 纯核心  = 本文件（enemyLevelMults / buildTankDataVM / heldCardsVM / spawnEnemyAt /
//                  applyCardToTank / clearCardsFromTank / 卡牌事务 receipt+rollback / parameterClamp）
//   层 2 DOM 适配 = tank_panels_dom.js（makeLogSink / createLogPanel / createDevPanelController）
//   层 3 面板控制器 = 各页面（注入元素与状态，调用本层）
//   门面       = tank_panels.js（re-export，保持既有消费方与 test-panels.js 契约不变）
//
// 依赖注入：global-first + require-fallback 的 `_dep()`（tank_abilities.js 同款惯例）。
// 加载顺序：tank_rules..tank_cards 之后、本文件、tank_panels_dom.js、tank_panels.js、页面内联脚本。
// 双端：浏览器 = 全局脚本（顶层声明即全局）；Node = require()（测试自行设置所需全局）。
// ============================================================================

// --- lazy dependency resolver: global-first, require-fallback (tank_abilities style) ---
function _dep(name){
  if (typeof globalThis !== 'undefined' && typeof globalThis[name] !== 'undefined') return globalThis[name];
  if (typeof window !== 'undefined' && typeof window[name] !== 'undefined') return window[name];
  if (typeof module !== 'undefined' && module.exports){
    var map = {
      spawnTank:'./tank_entity.js', resetEntity:'./tank_entity.js',
      livingEnemiesOf:'./tank_entity.js', nearestEnemyTo:'./tank_entity.js',
      applyCardEffects:'./tank_cards.js', cardStackCount:'./tank_cards.js',
      computeAmmoConfig:'./tank_cards.js',
      refreshStats:'./tank_model.js', addModifier:'./tank_model.js',
      removeModifierBySource:'./tank_model.js', removeModifiersByScope:'./tank_model.js',
      applyEnemyAppearanceAndStats:'./tank_model.js', moduleLabel:'./tank_model.js',
      tankKmh:'./tank_model.js', deriveTankClass:'./tank_model.js',
      tryActivateAbility:'./tank_abilities.js', hasAbility:'./tank_abilities.js',
      updateAbilityCd:'./tank_abilities.js', updateAbilityCds:'./tank_abilities.js',
      triggerDistForDifficulty:'./tank_map.js', alertEntity:'./tank_ai.js',
      spawnDrone:'./tank_drone.js', updateDrones:'./tank_drone.js',
      clearDrones:'./tank_drone.js',
      applyTankConfig:'./tank_model.js'
    };
    var m = map[name];
    if (m) { try { var mod = require(m); if (mod && typeof mod[name] === 'function') return mod[name]; } catch(e){} }
  }
  return undefined;
}

// ============================================================================
// Card apply / clear / transaction (shared by mvp dev panel card picker and bench card panel)
// ============================================================================

// Apply a card to a tank via the canonical applyCardEffects pipeline, then
// refreshStats so modifier cards take effect immediately.
function applyCardToTank(tank, card){
  var apply = _dep('applyCardEffects');
  var refresh = _dep('refreshStats');
  if (!apply || !card) return [];
  var applied = apply(tank, card);
  if (typeof refresh === 'function') refresh(tank);
  return applied;
}

// #A24：卡牌事务快照——记录一次 Apply 前的全部可副作用面（modifiers/cardEffects/
// weapons/ammo/drones/apply-count），供 Cancel/Rollback 精确回退。
function snapshotCardTx(tank, card){
  if (!tank) return null;
  var drones = (_dep('drones') || (typeof drones !== 'undefined' ? drones : null));
  return {
    cardId: card ? card.id : null,
    modCount: Array.isArray(tank.modifiers) ? tank.modifiers.length : 0,
    effectCount: Array.isArray(tank.cardEffects) ? tank.cardEffects.length : 0,
    weapons: tank.weapons ? JSON.parse(JSON.stringify(tank.weapons)) : null,
    ammoLoadout: Array.isArray(tank.ammoLoadout) ? tank.ammoLoadout.slice() : null,
    unlockedAmmo: Array.isArray(tank.unlockedAmmo) ? tank.unlockedAmmo.slice() : null,
    applyCount: (tank._cardApplyCount && card) ? (tank._cardApplyCount[card.id] || 0) : 0,
    droneCount: Array.isArray(drones) ? drones.length : 0
  };
}

// #A24：Apply（返回 receipt 快照，供 rollback 使用）
function applyCardTx(tank, card, ctx){
  if (!tank || !card) return { ok: false, applied: [], receipt: null };
  var receipt = snapshotCardTx(tank, card);
  var applied = applyCardToTank(tank, card);
  return { ok: true, applied: applied, receipt: receipt };
}

// #A24：Rollback——按 receipt 精确撤销一次 Apply 的全部副作用面：
//   modifiers（本次新增的 card:<id> 修饰器，按数量从尾部移除）、cardEffects（截断到快照长度）、
//   weapons（还原）、ammoLoadout / unlockedAmmo（还原）、_cardApplyCount（还原）。drones 由调用方
//   按 clearDrones/来源清理（本层不强耦合无人机模块内部结构）。
function rollbackCardTx(tank, receipt){
  var removed = { mods: 0, effects: 0, weapons: false, ammo: false, drones: 0 };
  if (!tank || !receipt) return removed;
  var refresh = _dep('refreshStats');

  if (Array.isArray(tank.modifiers)){
    while (tank.modifiers.length > receipt.modCount){
      tank.modifiers.pop(); removed.mods++;
    }
  }
  if (Array.isArray(tank.cardEffects)){
    if (tank.cardEffects.length > receipt.effectCount){
      removed.effects = tank.cardEffects.length - receipt.effectCount;
      tank.cardEffects.length = receipt.effectCount;
    }
  }
  if (receipt.weapons !== null && receipt.weapons !== undefined){
    tank.weapons = JSON.parse(JSON.stringify(receipt.weapons));
    removed.weapons = true;
  }
  if (receipt.ammoLoadout !== null && receipt.ammoLoadout !== undefined){
    tank.ammoLoadout = receipt.ammoLoadout.slice(); removed.ammo = true;
  }
  if (receipt.unlockedAmmo !== null && receipt.unlockedAmmo !== undefined){
    tank.unlockedAmmo = receipt.unlockedAmmo.slice();
  }
  if (receipt.cardId && tank._cardApplyCount){
    if (receipt.applyCount > 0) tank._cardApplyCount[receipt.cardId] = receipt.applyCount;
    else delete tank._cardApplyCount[receipt.cardId];
  }
  if (typeof refresh === 'function') refresh(tank);
  return removed;
}

// Clear every card-borne effect from a tank. #A24 扩展：除 card:* modifiers 与 cardEffects 外，
// 还尽力回退卡牌造成的 weapons / ammo / drones 副作用（Bench「Clear all」= 完整取消）。
// 返回值保持既有契约 { removedMods, removedEffects }（test-panels.js 断言依赖）。
function clearCardsFromTank(tank){
  var removed = 0;
  var removedEffects = 0;
  if (tank){
    if (Array.isArray(tank.modifiers)){
      for (var i = tank.modifiers.length - 1; i >= 0; i--){
        var m = tank.modifiers[i];
        if (m && typeof m.source === 'string' && m.source.indexOf('card:') === 0){
          tank.modifiers.splice(i, 1); removed++;
        }
      }
    }
    removedEffects = Array.isArray(tank.cardEffects) ? tank.cardEffects.length : 0;
    // #A24：卡牌武器安装/升级 → 还原为初始 weapons（standard/none），弹种链 → 清空解锁标记
    if (tank.weapons && removedEffects > 0){
      var w = tank.weapons;
      var pType = (w.primary && w.primary.type) || 'standard';
      var sType = (w.secondary && w.secondary.type) || 'none';
      if (pType !== 'standard' || sType !== 'none'){
        w.primary = { type: 'standard', stats: {} };
        w.secondary = { type: 'none', stats: {} };
      }
    }
    if (Array.isArray(tank.unlockedAmmo) && tank.unlockedAmmo.length > 2) tank.unlockedAmmo = ['ap', 'he'];
    tank.cardEffects = [];
    if (tank._cardApplyCount) tank._cardApplyCount = {};
    // 无人机：卡牌部署的伴随机（tank_drone 模块数组）在完整取消时清空
    var clearDrones = _dep('clearDrones');
    if (typeof clearDrones === 'function'){ try { clearDrones(); } catch(e){} }
    var refresh = _dep('refreshStats');
    if (typeof refresh === 'function') refresh(tank);
  }
  return { removedMods: removed, removedEffects: removedEffects };
}

// ============================================================================
// Parameter transaction (P-49 parameterLimits 唯一收口) —— #A24
// ============================================================================

// 按 RULES.parameterLimits 把 { stat: value } 钳到合法区间（armor.* 路径支持 3 段）。
// 返回 { value, clamped }；无 limits 时原值返回。纯函数。
function parameterClamp(stat, value){
  var R = (typeof RULES !== 'undefined') ? RULES : null;
  var lim = R && R.parameterLimits;
  var num = (typeof value === 'number' && Number.isFinite(value)) ? value : null;
  if (num === null || !lim) return { value: value, clamped: false };
  var node = lim;
  var parts = String(stat).split('.');
  for (var i = 0; i < parts.length; i++){
    if (!node || typeof node !== 'object'){ node = null; break; }
    node = node[parts[i]];
  }
  if (!node || typeof node.min !== 'number' || typeof node.max !== 'number') return { value: num, clamped: false };
  var out = Math.max(node.min, Math.min(node.max, num));
  return { value: out, clamped: out !== num };
}

// 批量钳制 { stat: value } 映射，返回 { values, clamped: { stat: bool } }。纯函数。
function clampParameterMap(map){
  var values = {}, clamped = {}, any = false;
  if (map && typeof map === 'object'){
    for (var k in map){
      var r = parameterClamp(k, map[k]);
      values[k] = r.value;
      if (r.clamped){ clamped[k] = true; any = true; }
    }
  }
  return { values: values, clamped: clamped, any: any };
}

// ============================================================================
// Card view-model (held cards strip)
// ============================================================================

// Build a compact view-model of the cards currently held by a tank, grouped by
// cardId and counted. `cardPool` may be an Array or an id→spec Object.
function heldCardsVM(tank, cardPool){
  var stackCount = _dep('cardStackCount');
  var arr = Array.isArray(cardPool) ? cardPool : (cardPool ? Object.values(cardPool) : []);
  var rows = [];
  var effs = (tank && tank.cardEffects) || [];
  var seen = {};
  for (var i = 0; i < effs.length; i++){
    var ef = effs[i];
    if (!ef || !ef.cardId) continue;
    var id = ef.cardId;
    seen[id] = (seen[id] || 0) + 1;
  }
  // fallback to modifier source if cardEffects missed it (e.g. modifier-only cards)
  var mods = (tank && tank.modifiers) || [];
  for (var j = 0; j < mods.length; j++){
    var src = mods[j] && mods[j].source;
    if (typeof src === 'string' && src.indexOf('card:') === 0){
      var cid = src.slice(5);
      if (seen[cid] === undefined) seen[cid] = (typeof stackCount === 'function') ? stackCount(tank, cid) : 1;
    }
  }
  var ids = Object.keys(seen);
  for (var k = 0; k < ids.length; k++){
    var cid2 = ids[k];
    var card = arr.find(function(c){ return c && c.id === cid2; }) || null;
    rows.push({
      id: cid2,
      name: card ? card.name : cid2,
      rarity: (card && card.rarity) || 'common',
      count: seen[cid2]
    });
  }
  return rows;
}

// ============================================================================
// Ability activation (test-bench privileged path)
// ============================================================================
function activateAbilityForTest(tank, key, ctx){
  var has = _dep('hasAbility');
  var activate = _dep('tryActivateAbility');
  if (!tank) return { ok: false, reason: 'no-tank' };
  if (typeof has === 'function' && !has(tank, key)){
    if (!Array.isArray(tank.cardEffects)) tank.cardEffects = [];
    tank.cardEffects.push({ type: 'ability', key: key, cardId: 'bench_debug' });
  }
  return (typeof activate === 'function') ? activate(tank, key, ctx || {}) : { ok: false, reason: 'unavailable' };
}

// ============================================================================
// Enemy level curve (test bench: "修改敌人等级")
// ============================================================================
function enemyLevelMults(level){
  var lv = Math.max(1, Math.min(9999, Math.floor(Number(level) || 1)));
  if (lv <= 1) return {};
  var p = lv - 1;
  var mul = function(b, e){ return Math.pow(1 + b, e); };
  var armorAll = 1 + 0.10 * p;
  var out = {
    maxHp: mul(0.14, p),
    penetration: mul(0.10, p),
    damage: mul(0.10, p),
    reload: mul(-0.08, p),
    maxSpeed: mul(0.02, p),
    turnRate: mul(0.03, p),
    turretTurnRate: mul(0.03, p)
  };
  out.armorAll = armorAll;
  var res = {};
  for (var k in out){ if (out[k] !== 1) res[k] = out[k]; }
  return res;
}

// ============================================================================
// Enemy spawning (test bench: "生成敌人 / 生成一批")
// ============================================================================
function spawnEnemyAt(x, y, opts, ctx){
  opts = opts || {};
  ctx = ctx || {};
  var spawn = _dep('spawnTank');
  var applyAppearance = _dep('applyEnemyAppearanceAndStats');
  var applyConfig = _dep('applyTankConfig');
  var reset = _dep('resetEntity');
  var triggerDist = _dep('triggerDistForDifficulty');
  var alertEntity = _dep('alertEntity');
  if (!spawn) throw new Error('spawnEnemyAt: spawnTank unavailable');

  var tankListData = ctx.tankListData || _dep('tankListData') || null;
  if (!tankListData) throw new Error('spawnEnemyAt: tankListData unavailable (pass ctx.tankListData)');
  var spec = tankListData[opts.tankId];
  if (!spec) throw new Error('spawnEnemyAt: unknown tankId: ' + opts.tankId);

  var id = opts.id || ('enemy_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
  var playerTank = _dep('player') || null;
  var anchor = opts.anchorStats || (playerTank && playerTank.stats) || null;

  var t = spawn({
    id: id,
    team: 'enemy',
    x: x, y: y,
    hullAngle: opts.hullAngle != null ? opts.hullAngle : Math.PI,
    turretAngle: opts.turretAngle != null ? opts.turretAngle : Math.PI,
    heightClass: opts.heightClass || spec.heightClass || 'medium',
    color: opts.color || '#ff5c4d'
  });

  if (typeof applyAppearance === 'function'){
    applyAppearance(t, spec, anchor);
  } else {
    if (spec && typeof applyConfig === 'function') applyConfig(t, spec);
    if (typeof reset === 'function') reset(t);
  }

  var lv = Math.max(1, Math.floor(opts.level || 1));
  var baseMults = enemyLevelMults(lv);
  var merged = {};
  for (var bk in baseMults){ merged[bk] = baseMults[bk]; }
  var extra = opts.entityMults || {};
  for (var ek in extra){
    if (extra[ek] == null || extra[ek] === 1) continue;
    if (ek === 'armorAll'){ merged.armorAll = (merged.armorAll || 1) * extra[ek]; continue; }
    merged[ek] = (merged[ek] || 1) * extra[ek];
  }
  _applyStatMults(t, merged, 'bench-level' + (lv > 1 ? ':LV' + lv : ''));

  if (opts.aiTier !== undefined) t.aiTier = opts.aiTier;
  if (t.aiTriggerDist === undefined && typeof triggerDist === 'function'){
    t.aiTriggerDist = triggerDist(opts.difficulty != null ? opts.difficulty : 0.5);
  }
  t.nodeSpawn = opts.nodeSpawn !== false;
  t.benchSpawn = true;
  t._benchLevel = lv;

  if (opts.alert !== false && typeof alertEntity === 'function' && playerTank){
    alertEntity(t, playerTank.x, playerTank.y);
  }
  return t;
}

function _applyStatMults(t, mults, source){
  var addMod = _dep('addModifier');
  var refresh = _dep('refreshStats');
  if (!t || !mults || typeof addMod !== 'function') return 0;
  var count = 0, v;
  for (var k in mults){
    v = mults[k];
    if (v == null || v === 1) continue;
    if (k === 'armorAll'){
      addMod(t, { stat:'armor.hull',   mode:'mult', value:v, source:source || 'difficulty', scope:'run' });
      addMod(t, { stat:'armor.turret',  mode:'mult', value:v, source:source || 'difficulty', scope:'run' });
      count += 2;
    } else {
      addMod(t, { stat:k, mode:'mult', value:v, source:source || 'difficulty', scope:'run' });
      count += 1;
    }
  }
  if (typeof refresh === 'function') refresh(t);
  return count;
}

// ============================================================================
// Tank view-models (status / enemy data inspector)
// ============================================================================
function buildTankDataVM(t, opts){
  opts = opts || {};
  if (!t) return null;
  var s = (t.stats) || {};
  var label = _dep('moduleLabel');
  var kmh = _dep('tankKmh');
  var mods = (Array.isArray(t.modifiers) ? t.modifiers : []);
  var now = Date.now ? Date.now() : 0;
  var modVM = mods.map(function(m){
    var ttl = null;
    if (m && m.scope === 'timed' && m.expiresAt !== Infinity){
      ttl = Math.max(0, (m.expiresAt - now) / 1000);
    }
    return { source: m.source, stat: m.stat, mode: m.mode, value: m.value, scope: m.scope, ttl: ttl };
  });

  var debuffs = (t.debuffs) || {};
  var debLines = Object.keys(debuffs).filter(function(k){ return debuffs[k] > 0; })
    .map(function(k){
      var lab = (typeof label === 'function') ? label(k) : k;
      return { key: k, label: lab, ttl: debuffs[k] };
    });

  var armor = s.armor || (t.base && t.base.armor) || {};
  var hullFront = (armor && armor.hull) ? armor.hull.front : undefined;
  var hullSide  = (armor && armor.hull) ? armor.hull.side : undefined;
  var hullRear  = (armor && armor.hull) ? armor.hull.rear : undefined;
  var turFront  = (armor && armor.turret) ? armor.turret.front : undefined;
  var turSide   = (armor && armor.turret) ? armor.turret.side : undefined;
  var turRear   = (armor && armor.turret) ? armor.turret.rear : undefined;

  var computeAmmo = _dep('computeAmmoConfig');
  var ammoVM = [];
  if (typeof computeAmmo === 'function' && s && typeof s.penetration === 'number'){
    var rules = (typeof RULES !== 'undefined' && RULES.ammoTypes) || {};
    for (var ak in rules){
      var ac = computeAmmo(t, ak);
      if (!ac) continue;
      ammoVM.push({
        key: ak, label: rules[ak].label, color: rules[ak].color,
        pen: Math.round((ac.pen || 0) * s.penetration + (ac.penAdd || 0)),
        dmg: Math.round((ac.dmg || 0) * s.damage + (ac.dmgAdd || 0))
      });
    }
  }

  var speed = typeof kmh === 'function' ? kmh(t) : (s && s.maxSpeed);

  return {
    id: t.id,
    team: t.team || 'enemy',
    tankClass: t.tankClass || '—',
    heightClass: t.heightClass || '—',
    hp: typeof t.hp === 'number' ? t.hp : 0,
    maxHp: (s && typeof s.maxHp === 'number') ? s.maxHp : (typeof t.maxHp === 'number' ? t.maxHp : 0),
    armor: armor,
    armorFront: hullFront, armorSide: hullSide, armorRear: hullRear,
    turretArmorFront: turFront, turretArmorSide: turSide, turretArmorRear: turRear,
    penetration: s.penetration, damage: s.damage, reload: s.reload,
    maxSpeed: s.maxSpeed, speedKmh: speed,
    weight: (typeof s.weight === 'number') ? s.weight : (t.base && t.base.weight),
    enginePower: s.enginePower,
    aiTier: t.aiTier,
    position: { x: t.x || 0, y: t.y || 0 },
    reloadT: typeof t.reloadT === 'number' ? t.reloadT : 0,
    abilityCds: (t.abilityCds && typeof t.abilityCds === 'object') ? Object.assign({}, t.abilityCds) : {},   // #C4c：按技能独立冷却池（取代旧共享 abilityCdT）
    invulnT: typeof t.invulnT === 'number' ? t.invulnT : 0,
    mods: modVM,
    debuffs: debLines,
    ammo: ammoVM,
    ammoKey: t.ammoKey || null,
    ammoLoadout: Array.isArray(t.ammoLoadout) ? t.ammoLoadout.slice() : [],
    currentAmmoIndex: typeof t.currentAmmoIndex === 'number' ? t.currentAmmoIndex : -1,
    status: describeEntityStatus(t, debLines)
  };
}

function describeEntityStatus(t, debLines){
  if (!t) return '—';
  if (t.hp <= 0){
    if (t.ammoBlew) return '弹药库殉爆';
    if (t._dead) return '已摧毁';
  }
  if (t.immobT > 0) return '履带损坏 (' + t.immobT.toFixed(1) + 's)';
  if (t.dotT > 0 || t.fireT > 0) return '起火中';
  if (debLines && debLines.length) return debLines[0].label + ' 受损 (' + debLines[0].ttl.toFixed(1) + 's)';
  return '正常';
}

function liveEnemies(team){
  var f = _dep('livingEnemiesOf');
  if (typeof f === 'function'){
    return f(team === 'enemy' ? 'player' : team) || [];
  }
  var ents = (typeof entities !== 'undefined' && entities) || (typeof window !== 'undefined' && window.entities) || [];
  return ents.filter(function(e){ return e && e.team === 'enemy' && e.hp > 0; });
}

// --- dual-end export ---
if (typeof module !== 'undefined' && module.exports){
  module.exports = {
    _dep: _dep,
    applyCardToTank: applyCardToTank,
    clearCardsFromTank: clearCardsFromTank,
    snapshotCardTx: snapshotCardTx,
    applyCardTx: applyCardTx,
    rollbackCardTx: rollbackCardTx,
    parameterClamp: parameterClamp,
    clampParameterMap: clampParameterMap,
    heldCardsVM: heldCardsVM,
    activateAbilityForTest: activateAbilityForTest,
    enemyLevelMults: enemyLevelMults,
    spawnEnemyAt: spawnEnemyAt,
    buildTankDataVM: buildTankDataVM,
    describeEntityStatus: describeEntityStatus,
    liveEnemies: liveEnemies
  };
}
