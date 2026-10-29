// test-survival-reinforce.js — 生存模式补给站「增援」升级（2026-10-29 用户需求）
// 运行：node scripts/test-survival-reinforce.js
//
// 需求：补给点可购买「增援」，每次 +1 辆友军，AI 档位与**下一波**敌军相同，上限暂定 2。
// 覆盖三层：① 配置唯一口径（RULES + 商店条目） ② 档位推导语义 ③ 友军 AI 的档位通道真的生效
// + 页面接线（定义≠接线，只测「函数存在」会漏掉「按钮没接」）。
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
global.angDiff = U.angDiff;
global.norm = U.norm;
global.rotate = U.rotate;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;

const ECO = require('../js/tank_economy.js');
const AC = require('../js/tank_ally_command.js');
const AI = require('../js/tank_ai.js');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function section(n) { console.log('\n[' + n + ']'); }

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- ① 配置唯一口径
section('① 配置：上限与商店条目');
const cap = RULES.allyCommand && RULES.allyCommand.survivalReinforceMax;
ok(cap === 2, `RULES.allyCommand.survivalReinforceMax === 2（实际 ${cap}）`);
ok((RULES.allyCommand.countByMode.survival + cap) <= RULES.allyCommand.maxAllies,
  `初始 ${RULES.allyCommand.countByMode.survival} 辆 + 上限 ${cap} 辆 ≤ maxAllies ${RULES.allyCommand.maxAllies}`);

const def = ECO.getRunShopDef('survival_reinforce');
ok(!!def, '商店条目 survival_reinforce 存在');
ok(!!def && def.maxLevel === cap, 'maxLevel 绑定 RULES（不是硬编码副本）');
ok(!!def && def.survivalOnly === true, 'survivalOnly === true（其它模式不渲染）');
ok(!!def && !!(def.instant && def.instant.type === 'reinforceAlly'), 'instant.type === reinforceAlly');
ok(!!def && Array.isArray(def.effects) && def.effects.length === 0, '不走修饰器通道（effects 为空）');

// ---------------------------------------------------------------- ② 档位推导
section('② 档位推导：下一波 = 当前波次序号作为 index');
{
  const calls = [];
  const deps = {
    difficultyForIndex: (i, lv) => { calls.push({ i: i, lv: lv }); return i * 0.1; },
    aiTierForDifficulty: (d) => (d >= 0.2 ? 2 : d >= 0.1 ? 1 : 0)
  };
  ok(AC.reinforcementAiTier(0, deps) === 0, '未开波（wave 0）→ 第 1 波 → index 0 → tier 0');
  ok(calls.length === 1 && calls[0].i === 0 && calls[0].lv === 0, '难度函数以 (index=0, level=0) 调用');
  calls.length = 0;
  ok(AC.reinforcementAiTier(2, deps) === 2, 'wave 2 → index 2 → diff 0.2 → tier 2');
  ok(calls.length === 1 && calls[0].i === 2, 'index 语义 = 当前波次序号（即下一波的 index）');
  ok(AC.reinforcementAiTier(-5, deps) >= 0, '负波次钳到 0（不产生 NaN/负索引）');
  ok(AC.reinforcementAiTier(3, null) === 1, '缺依赖时退中档 1（不静默给最低档）');
}

// ---------------------------------------------------------------- ③ 友军 AI 档位通道
section('③ 友军 AI：aiTier 真的改变接战距离与瞄准容差');
{
  const mk = (tier) => {
    const t = { x: 0, y: 0, turretAngle: 0, reloadT: 0 };
    if (tier !== undefined) t.aiTier = tier;
    return t;
  };
  const ctx = { hasLoS: () => true };
  const far = { x: 520, y: 0, hp: 10 };   // 460 < 520 < 460×1.2=552

  const noTier = AI._passiveDefend(mk(undefined), ctx, far);
  ok(noTier.fire === false, '负向：无 aiTier 的友军（既有指挥友军）行为零漂移，520px 处不开火');

  const tier0 = AI._passiveDefend(mk(0), ctx, far);
  ok(tier0.fire === false, 'tier 0 与无档位一致（engageMul 缺省 1）');

  const tier2 = AI._passiveDefend(mk(2), ctx, far);
  ok(tier2.fire === true, 'tier 2 在 520px 处开火（接战距离 ×1.2 生效）');

  const near = { x: 300, y: 0, hp: 10 };
  const t0 = { x: 0, y: 0, turretAngle: 0.1, reloadT: 0, aiTier: 0 };
  const t2 = { x: 0, y: 0, turretAngle: 0.1, reloadT: 0, aiTier: 2 };
  // 容差通道方向：档位越高越**严格**（aimTolMul 0.6 ⇒ 容差 0.12→0.072）。0.1rad 偏差下
  //   tier0 仍在容差内开火，tier2 已超出 ⇒ 只有真正对准才开火。
  ok(AI._passiveDefend(t0, ctx, near).fire === true && AI._passiveDefend(t2, ctx, near).fire === false,
    '瞄准容差 ×aimTolMul 生效：0.1rad 偏差 tier0 开火、tier2 更严（不开火）');
}

// ---------------------------------------------------------------- ④ 页面接线
section('④ 页面接线：函数有定义 ≠ 已接线');
{
  // 先剥注释再匹配（源码形状断言的既有纪律：注释里提到旧实现属合法沿革）
  const raw = fs.readFileSync(path.join(ROOT, 'tank_battle.html'), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(/function\s+spawnSurvivalReinforcement\s*\(/.test(src), 'spawnSurvivalReinforcement 已定义');
  ok(/spawnSurvivalReinforcement\s*\(\)/.test(src) && (src.match(/spawnSurvivalReinforcement\s*\(\)/g) || []).length >= 2,
    'spawnSurvivalReinforcement 被调用（定义 + 至少一处调用）');
  ok(/instant\.type\s*===\s*'reinforceAlly'/.test(src), '购买链有 reinforceAlly 分支');
  ok(/def\.survivalOnly\s*&&\s*GAME_MODE\s*!==\s*'survival'/.test(src), '商店渲染按 survivalOnly 过滤');
  ok(/reinforcementAiTier\s*\(/.test(src), '页面使用统一的档位推导函数（不自写公式）');
  ok(/t\.aiTier\s*=/.test(src), '召唤时写入 aiTier');
}

console.log('\n' + '='.repeat(60));
console.log(`通过 ${pass} / 失败 ${fail}`);
process.exitCode = fail === 0 ? 0 : 1;
if (fail === 0) console.log('全部通过');
