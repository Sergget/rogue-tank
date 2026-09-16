'use strict';
// ============================================================================
// scripts/test-weapon-upgrade-balance.js — PLAN.md §8.1.1 副武器 rare 升级卡数值复核
//
// 目的：对 4 张副武器 rare 升级卡（weapon_secondary_{mortar,missile,rocket,mine}_upgrade）
//       做「基础安装卡 → 升级卡」的持续输出（DPS）复核，锁定升级梯度落在统一带内，
//       防止后续改数出现「某张升级卡明显过强/过弱」的失衡（升级卡进卡牌池实测的前提）。
//
// 方法：走真实数据（WEAPON_DEFAULTS 基础值 + cards/*.json 的 statOverrides），
//       用「每轮输出 = 单轮伤害 × 轮次」/「轮次时长 = reload」计算 DPS：
//         mortar : DPS = damage / reload                     （单发曲射，spread 与 AOE 均不放大 DPS）
//         missile: DPS = damage / reload                     （单发制导）
//         rocket : DPS = count × damage / reload             （巢式齐射）
//         mine   : DPS = damage / reload                     （布雷，duration 为功能性提升不计 DPS）
//       升级增益 gain = DPS_upgraded / DPS_base，断言落在 [1.25, 1.60] 带内（覆盖 ±数值抖动）。
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

const CARDS_DIR = path.join(__dirname, '..', 'cards');

let fails = 0, warns = 0;
function ok(cond, label){ if(cond) console.log('  ✓ ' + label); else { console.error('  ✗ ' + label); fails++; } }
function warn(cond, label){ if(!cond){ console.log('  [WARN] ' + label); warns++; } }

function loadCard(id){
  const p = path.join(CARDS_DIR, id + '.json');
  ok(fs.existsSync(p), `${id}.json 存在`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// 每型副武器的 DPS 公式（按机制区分单发/齐射）
const DPS_FN = {
  mortar:     (s) => (s.damage || 0) / (s.reload || 1),
  missile:    (s) => (s.damage || 0) / (s.reload || 1),
  rocket:     (s) => (s.count || 1) * (s.damage || 0) / (s.reload || 1),
  mine_layer: (s) => (s.damage || 0) / (s.reload || 1)
};

// 升级卡 id ↔ 副武器类型
const UPGRADE_CARDS = [
  { id: 'weapon_secondary_mortar_upgrade',  type: 'mortar' },
  { id: 'weapon_secondary_missile_upgrade', type: 'missile' },
  { id: 'weapon_secondary_rocket_upgrade',  type: 'rocket' },
  { id: 'weapon_secondary_mine_upgrade',    type: 'mine_layer' }
];

const GAIN_MIN = 1.25, GAIN_MAX = 1.60;

console.log('=== PLAN §8.1.1 副武器升级卡数值复核（DPS 增益带 ' + GAIN_MIN + '×~' + GAIN_MAX + '×） ===\n');

const rows = [];
for(const uc of UPGRADE_CARDS){
  const card = loadCard(uc.id);
  const ef = (card.effects || []).find(e => e && e.type === 'weapon');
  ok(!!ef, `${uc.id}: 含 weapon 效果`);
  if(!ef) continue;

  ok(ef.action === 'upgrade', `${uc.id}: action=upgrade（#A23 元数据）`);
  ok(ef.slot === 'secondary', `${uc.id}: slot=secondary`);
  ok(ef.weaponType === uc.type, `${uc.id}: weaponType=${uc.type}`);
  ok(card.maxStacks === 1, `${uc.id}: maxStacks=1（不叠加）`);

  const base = W.getWeaponDefaults('secondary', uc.type);
  const up = Object.assign({}, base, ef.statOverrides || {});
  const dpsOf = DPS_FN[uc.type];
  ok(typeof dpsOf === 'function', `${uc.id}: 有 DPS 公式`);
  if(typeof dpsOf !== 'function') continue;

  const dpsBase = dpsOf(base), dpsUp = dpsOf(up);
  ok(dpsBase > 0, `${uc.id}: 基础 DPS > 0（${dpsBase.toFixed(2)}）`);
  const gain = dpsBase > 0 ? dpsUp / dpsBase : 0;
  rows.push({ id: uc.id, type: uc.type, dpsBase, dpsUp, gain });

  ok(gain >= GAIN_MIN && gain <= GAIN_MAX,
    `${uc.id}: DPS 增益 ${gain.toFixed(3)}× 落在 [${GAIN_MIN}, ${GAIN_MAX}]（${dpsBase.toFixed(2)} → ${dpsUp.toFixed(2)}）`);
  // 功能性提升不应被 DPS 复核漏掉（有则记 WARN 提供可见性，不算失败）
  if(ef.statOverrides && (ef.statOverrides.range || ef.statOverrides.aoe || ef.statOverrides.duration)){
    warn(true, '');
    console.log(`    · 功能性提升：` + ['range','aoe','duration'].filter(k => ef.statOverrides[k] != null).map(k => `${k}=${ef.statOverrides[k]}`).join(' '));
  }
}

// 梯度一致性：4 张升级卡增益的极差不应过大（防单卡离群）
console.log('\n—— 增益梯度汇总 ——');
console.log('  升级卡'.padEnd(40) + 'DPS 基础 → 升级'.padEnd(24) + '增益');
for(const r of rows){
  console.log('  ' + r.id.padEnd(38) + `${r.dpsBase.toFixed(2)} → ${r.dpsUp.toFixed(2)}`.padEnd(24) + r.gain.toFixed(3) + '×');
}
if(rows.length >= 2){
  const gains = rows.map(r => r.gain).sort((a, b) => a - b);
  const spread = gains[gains.length - 1] - gains[0];
  ok(spread <= 0.35, `升级卡增益极差 ${spread.toFixed(3)} ≤ 0.35（梯度一致，无离群升级卡）`);
}

// 安装卡（epic）与升级卡（rare）的 weaponType / slot 契约对齐（升级卡必须能挂在同型安装卡上）
console.log('\n—— 安装卡 ↔ 升级卡契约 ——');
for(const uc of UPGRADE_CARDS){
  const installId = 'weapon_secondary_' + (uc.type === 'mine_layer' ? 'mine_layer' : uc.type);
  if(!fs.existsSync(path.join(CARDS_DIR, installId + '.json'))){ console.log(`  [WARN] 无 ${installId}.json（跳过契约检查）`); warns++; continue; }
  const inst = loadCard(installId);
  const ief = (inst.effects || []).find(e => e && e.type === 'weapon');
  ok(ief && ief.action === 'install' && ief.slot === 'secondary' && ief.weaponType === uc.type,
    `${installId}: action=install + slot=secondary + weaponType=${uc.type}（与升级卡匹配）`);
}

console.log(`\n结果：${fails} 项失败 / ${warns} 项警告`);
console.log(fails === 0 ? 'test-weapon-upgrade-balance: PASS' : 'test-weapon-upgrade-balance: FAIL');
process.exit(fails === 0 ? 0 : 1);
