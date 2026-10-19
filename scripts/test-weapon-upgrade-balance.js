'use strict';
// ============================================================================
// scripts/test-weapon-upgrade-balance.js — 武器升级卡数值复核（PLAN.md §8.1.1 → #U39 扩面）
//
// 目的：对全部 weapon upgrade 卡做「基础规格 → 升级规格」的持续输出（DPS）复核，锁定升级
//       梯度落在统一带内，防止后续改数出现「某张升级卡明显过强/过弱」的失衡。
//
// #U39（2026-10-18 用户要求「主/副武器每种 2~3 张升级卡」）：复核面从原 4 张副武器 rare 卡
//   扩到**卡池内全部** weapon upgrade 卡，并按通道性质分三档判定：
//     ① 纯 DPS 通道（只有 damage/damageMult/reload/reloadMult/count）→ 增益带 [1.15, 1.75]
//        （原有 4 张副武器 rare 卡另按历史带 [1.25, 1.60] 严格复核，保持 #S6 结论不回退）
//     ② 混合通道（DPS 字段 + 功能性字段）→ DPS 不得倒退（gain ≥ 1.0）且有功能字段实际变化
//     ③ 纯功能性通道（无 DPS 字段）→ 至少 1 个字段相对基础规格实际变化（防「写了不生效」）
//   另校验：每张升级卡的 weaponType 必须有对应安装卡（standard 为隐式缺省炮，豁免）。
//
// 方法：走真实数据（WEAPON_DEFAULTS 基础值 + cards/*.json 的 statOverrides）。
//   DPS 公式（按机制区分）：
//     主武器 standard/autocannon/double_barrel/railgun: count × damageMult / reloadMult
//     副武器 turret:                                    damageMult / reloadMult（相对主炮）
//     副武器 mortar/missile/missile_wire/mine_layer:    damage / reload
//     副武器 rocket:                                    count × damage / reload
//     副武器 clip:                                      机制型（弹夹容量 + 发际间隔），不算 DPS
//
// 运行：node scripts/test-weapon-upgrade-balance.js
// 退出码：0 = 梯度一致；1 = 有升级卡越界或数据缺失。
// ============================================================================
const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const W = require('../js/tank_weapons.js');
const C = require('../js/tank_cards.js');

const CARDS_DIR = path.join(__dirname, '..', 'cards');

let fails = 0, warns = 0;
function ok(cond, label){ if(cond) console.log('  ✓ ' + label); else { console.error('  ✗ ' + label); fails++; } }
function warn(cond, label){ if(!cond){ console.log('  [WARN] ' + label); warns++; } }

function loadCard(id){
  const p = path.join(CARDS_DIR, id + '.json');
  ok(fs.existsSync(p), `${id}.json 存在`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// 全部 card JSON（升级卡集合由此派生，新增卡自动纳入复核——不再手工维护 id 清单）
const ALL_CARDS = fs.readdirSync(CARDS_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => { try { return JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), 'utf8')); } catch (e) { return null; } })
  .filter(Boolean);

function weaponEffect(card){
  return (card.effects || []).find(e => e && e.type === 'weapon') || null;
}

// ---- DPS 公式与通道分类 ----
// DPS 字段：这些键的变化直接算进 DPS 增益
const DPS_FIELDS = new Set(['damageMult', 'reloadMult', 'damage', 'reload', 'count']);
// 机制型（DPS 公式不适用于"容量/发际间隔"这类非线性改造）
const MECHANICAL_TYPES = new Set(['clip']);

const DPS_FN = {
  standard:      (s) => (s.count || 1) * (s.damageMult || 1) / (s.reloadMult || 1),
  autocannon:    (s) => (s.count || 1) * (s.damageMult || 1) / (s.reloadMult || 1),
  double_barrel: (s) => (s.count || 1) * (s.damageMult || 1) / (s.reloadMult || 1),
  railgun:       (s) => (s.count || 1) * (s.damageMult || 1) / (s.reloadMult || 1),
  turret:        (s) => (s.damageMult || 1) / (s.reloadMult || 1),
  mortar:        (s) => (s.damage || 0) / (s.reload || 1),
  missile:       (s) => (s.damage || 0) / (s.reload || 1),
  missile_wire:  (s) => (s.damage || 0) / (s.reload || 1),
  rocket:        (s) => (s.count || 1) * (s.damage || 0) / (s.reload || 1),
  mine_layer:    (s) => (s.damage || 0) / (s.reload || 1)
};

// 基础规格：主武器/副武器统一从 WEAPON_DEFAULTS 取（standard 有隐式缺省炮）
function baseSpecOf(slot, wType){
  const cat = (slot === 'primary') ? 'primary' : 'secondary';
  return W.getWeaponDefaults(cat, wType) || {};
}

const PURE_DPS_MIN = 1.15, PURE_DPS_MAX = 1.75;   // 纯 DPS 通道带
const LEGACY_MIN = 1.25, LEGACY_MAX = 1.60;       // 原 4 张副武器 rare 卡的历史带（#S6 不回退）
// 历史 4 张（#S6 定案带 + 梯度极差断言的对象；新增卡不受此紧带约束）
const LEGACY_IDS = [
  'weapon_secondary_mortar_upgrade', 'weapon_secondary_missile_upgrade',
  'weapon_secondary_rocket_upgrade', 'weapon_secondary_mine_upgrade'
];

console.log('=== 武器升级卡数值复核（#U39：全部 weapon upgrade 卡） ===\n');

// 1) 收集全部升级卡
const upgrades = ALL_CARDS.filter(c => {
  const ef = weaponEffect(c);
  return ef && ef.action === 'upgrade' && ef.weaponType;
});
console.log(`卡池 weapon upgrade 卡：${upgrades.length} 张\n`);

// 2) 逐卡复核
const rows = [];
for(const card of upgrades.sort((a, b) => String(a.id).localeCompare(String(b.id)))){
  const ef = weaponEffect(card);
  const slot = ef.slot || 'secondary';
  const wType = ef.weaponType;
  const ov = ef.statOverrides || {};
  const keys = Object.keys(ov);

  ok(keys.length > 0, `${card.id}: 有 statOverrides（非空）`);
  // 至少一个字段相对基础规格实际变化（防「写了等于没写」）
  const base = baseSpecOf(slot, wType);
  const changed = keys.filter(k => {
    const v = ov[k];
    if (typeof v === 'string' && v[0] === '+') return parseFloat(v.slice(1)) !== 0;
    return base[k] !== v;
  });
  ok(changed.length > 0, `${card.id}: 至少 1 个字段相对基础规格变化（${changed.join('/') || '无'}）`);

  // 通道分类
  const dpsKeys = keys.filter(k => DPS_FIELDS.has(k));
  const funcKeys = keys.filter(k => !DPS_FIELDS.has(k));

  if(MECHANICAL_TYPES.has(wType)){
    console.log(`  · ${card.id} [${card.rarity}] 机制型（${wType}）跳过 DPS 复核；变化字段 ${changed.join('/')}`);
    rows.push({ id: card.id, type: wType, mode: 'mechanical', gain: null });
    continue;
  }
  const fn = DPS_FN[wType];
  ok(typeof fn === 'function', `${card.id}: 有 ${wType} 的 DPS 公式`);
  if(typeof fn !== 'function') continue;

  const dpsBase = fn(base);
  const upSpec = Object.assign({}, base, ov);
  // "+N" 相对增量（clip 专用）不参与 DPS；其余数值直接覆盖
  for(const k of Object.keys(upSpec)) {
    if(typeof upSpec[k] === 'string' && upSpec[k][0] === '+') {
      const cur = (typeof base[k] === 'number') ? base[k] : 0;
      upSpec[k] = cur + (parseFloat(upSpec[k].slice(1)) || 0);
    }
  }
  const dpsUp = fn(upSpec);
  ok(dpsBase > 0, `${card.id}: 基础 DPS > 0（${dpsBase.toFixed(2)}）`);
  const gain = dpsBase > 0 ? dpsUp / dpsBase : 0;
  const pureDps = funcKeys.length === 0 && dpsKeys.length > 0;
  const isLegacy = LEGACY_IDS.includes(card.id);

  if(isLegacy){
    ok(gain >= LEGACY_MIN && gain <= LEGACY_MAX,
      `${card.id}: DPS 增益 ${gain.toFixed(3)}× 落在历史带 [${LEGACY_MIN}, ${LEGACY_MAX}]（${dpsBase.toFixed(2)} → ${dpsUp.toFixed(2)}）`);
  } else if(pureDps){
    ok(gain >= PURE_DPS_MIN && gain <= PURE_DPS_MAX,
      `${card.id}: 纯 DPS 通道增益 ${gain.toFixed(3)}× ∈ [${PURE_DPS_MIN}, ${PURE_DPS_MAX}]（${dpsBase.toFixed(2)} → ${dpsUp.toFixed(2)}）`);
  } else if(dpsKeys.length > 0){
    ok(gain >= 1.0,
      `${card.id}: 混合通道 DPS 不倒退（${gain.toFixed(3)}× ≥ 1.0；功能性 ${funcKeys.join('/') || '无'}）`);
  } else {
    // 纯功能性：DPS 完全不变是设计预期，只要求有实际变化的字段（上面已断言）
    ok(Math.abs(gain - 1) < 1e-9,
      `${card.id}: 纯功能性通道不影响 DPS（${gain.toFixed(3)}× = 1.0；功能 ${funcKeys.join('/')}）`);
  }
  if(funcKeys.length) console.log(`    · 功能性提升：` + funcKeys.map(k => `${k}=${ov[k]}`).join(' '));
  rows.push({ id: card.id, type: wType, mode: pureDps ? 'dps' : (funcKeys.length ? 'mixed' : 'func'), gain, dpsBase, dpsUp });
}

// 3) 历史 4 张卡的梯度一致性（防单卡离群；#S6 结论不回退）
console.log('\n—— 历史 4 张副武器 rare 升级卡 增益梯度 ——');
const legacyRows = rows.filter(r => LEGACY_IDS.includes(r.id) && r.gain !== null);
console.log('  升级卡'.padEnd(40) + 'DPS 基础 → 升级'.padEnd(24) + '增益');
for(const r of legacyRows){
  console.log('  ' + r.id.padEnd(38) + `${r.dpsBase.toFixed(2)} → ${r.dpsUp.toFixed(2)}`.padEnd(24) + r.gain.toFixed(3) + '×');
}
ok(legacyRows.length === LEGACY_IDS.length, `历史 4 张卡全部复核到（${legacyRows.length}/${LEGACY_IDS.length}）`);
if(legacyRows.length >= 2){
  const gains = legacyRows.map(r => r.gain).sort((a, b) => a - b);
  const spread = gains[gains.length - 1] - gains[0];
  ok(spread <= 0.35, `升级卡增益极差 ${spread.toFixed(3)} ≤ 0.35（梯度一致，无离群升级卡）`);
}

// 4) 契约：升级卡必须有对应安装卡（standard 为隐式缺省炮，豁免）
console.log('\n—— 安装卡 ↔ 升级卡契约 ——');
const installTypes = new Set();
for(const c of ALL_CARDS){
  const ef = weaponEffect(c);
  if(ef && ef.action === 'install' && ef.weaponType) installTypes.add(`${ef.slot || 'secondary'}:${ef.weaponType}`);
}
let contractBad = 0;
const upgradeTypes = new Set();
for(const card of upgrades){
  const ef = weaponEffect(card);
  const slot = ef.slot || 'secondary';
  upgradeTypes.add(`${slot}:${ef.weaponType}`);
  if(ef.weaponType === 'standard') continue;                 // 隐式缺省主炮
  if(!installTypes.has(`${slot}:${ef.weaponType}`)){
    contractBad++;
    console.error(`  ✗ ${card.id}: ${slot}:${ef.weaponType} 无对应安装卡（玩家无法通过卡池获得该武器）`);
  }
}
ok(contractBad === 0, `全部升级卡的武器型都有安装卡（缺 ${contractBad} 个）`);

// 5) 覆盖面：每种主/副武器型都至少有 1 张升级卡（用户要求「每种武器 2~3 张」的下限）
console.log('\n—— 升级覆盖面（每型 ≥1 张） ——');
const PRIMARY_TYPES = C.WEAPON_PRIMARY_TYPES;
const SECONDARY_TYPES = C.WEAPON_SECONDARY_TYPES.filter(t => t !== 'none');
const upByType = {};
for(const card of upgrades){
  const ef = weaponEffect(card);
  const k = `${ef.slot || 'secondary'}:${ef.weaponType}`;
  upByType[k] = (upByType[k] || 0) + 1;
}
console.log('  主武器：' + PRIMARY_TYPES.map(t => `${t}=${upByType['primary:' + t] || 0}`).join('  '));
console.log('  副武器：' + SECONDARY_TYPES.map(t => `${t}=${upByType['secondary:' + t] || 0}`).join('  '));
const missingP = PRIMARY_TYPES.filter(t => !upByType['primary:' + t]);
const missingS = SECONDARY_TYPES.filter(t => !upByType['secondary:' + t]);
ok(missingP.length === 0, `主武器全型有升级卡（缺 ${missingP.join('/') || '无'}）`);
ok(missingS.length === 0, `副武器全型有升级卡（缺 ${missingS.join('/') || '无'}）`);
// 提示项：只给 1 张的类型（不失败，但值得后续补足到 2~3 张）
const thin = [];
for(const t of PRIMARY_TYPES) if((upByType['primary:' + t] || 0) === 1) thin.push(`primary:${t}`);
for(const t of SECONDARY_TYPES) if((upByType['secondary:' + t] || 0) === 1) thin.push(`secondary:${t}`);
warn(true, '');
console.log(`  仅 1 张升级卡的类型：${thin.join(' / ') || '无'}`);

console.log(`\n结果：${fails} 项失败 / ${warns} 项警告`);
console.log(fails === 0 ? 'test-weapon-upgrade-balance: PASS' : 'test-weapon-upgrade-balance: FAIL');
process.exit(fails === 0 ? 0 : 1);
