'use strict';
// scripts/test-recent-mods.js —— 2026-10-23 批次：近期可落地机制回归
//   ① 撞击伤害（RULES.ramming）：动能→伤害、装甲折减、双轨硬直、接触冷却
//   ② 隐蔽机制（RULES.camouflage）：隐蔽值四维模型、视距倍率、AI 有效触发距离
//   ③ 战术闪跃（RULES.abilities.flash_dash）：速度通道、过热回落、冷却与死键闭环
//
// 口径纪律（AGENTS.md §2）：本文件必须有 process.exitCode；下线/不可达类断言必须**负向**。

const fs = require('fs');
const path = require('path');
// QA 规则（scripts/test-qa.js）按字面量匹配 `require('../js/xxx.js')`，故这里**不能**用
// path.join 动态拼接（曾因此被判「missing require」）。保持静态字面量写法。
require('../js/tank_utils.js');
require('../js/tank_rules.js');
const _RULESMOD = require('../js/tank_rules.js');
const RULES = _RULESMOD.RULES;
// Node 侧的全局注入口径与 scripts/test-move.js 完全一致（tank_move 顶层读全局 RULES）。
global.RULES = RULES;
const _U = require('../js/tank_utils.js');
global.TAU = _U.TAU; global.norm = _U.norm; global.rotate = _U.rotate;
global.segRayIntersect = _U.segRayIntersect; global.partCorners = _U.partCorners;
global.partEdges = _U.partEdges; global.reflectDir = _U.reflectDir;
const _CV = require('../js/tank_cover.js');
global.getCoverUnderTank = _CV.getCoverUnderTank;
global.getRoadUnderTank = _CV.getRoadUnderTank;
global.resolveCoverCollisions = _CV.resolveCoverCollisions;
global.COVER_TIERS = _CV.COVER_TIERS;
_CV.covers.length = 0;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function section(name) { console.log('\n[' + name + ']'); }

// ---------------------------------------------------------------- ① 撞击伤害
section('① RULES.ramming 配置完整性');
ok(RULES.ramming && typeof RULES.ramming === 'object', 'RULES.ramming 存在');
for (const k of ['minVelThreshold', 'damageScale', 'hpRatioThreshold', 'energyRatioThreshold',
                 'massAdvantageRatio', 'stiffDurationBase', 'stiffSpeedMul',
                 'trackBreakChanceMax', 'contactCooldown']) {
  ok(typeof RULES.ramming[k] === 'number', 'RULES.ramming.' + k + ' 为数值');
}
ok(RULES.ramming.hpRatioThreshold > 0 && RULES.ramming.hpRatioThreshold < 1,
   'hpRatioThreshold 是**比例**（0~1），不是绝对点数（防后期必然触发）');
ok(RULES.ramming.energyRatioThreshold > 0 && RULES.ramming.energyRatioThreshold < 1,
   'energyRatioThreshold 是**比例**（0~1）');
ok(RULES.ramming.contactCooldown > 0, 'contactCooldown > 0（防止一帧内重复结算）');

section('① 撞击结算：浏览器侧全局可达 + Node 侧导出');
const ent = require(path.join(__dirname, '..', 'js', 'tank_entity.js'));
ok(typeof ent.resolveTankCollisions === 'function', 'tank_entity 导出 resolveTankCollisions');
const entSrc = require('fs').readFileSync(path.join(__dirname, '..', 'js', 'tank_entity.js'), 'utf8');
ok(entSrc.includes('RULES.ramming'), 'tank_entity.js 消费 RULES.ramming（非死配置）');
ok(entSrc.includes('contactCooldown'), 'tank_entity.js 消费 contactCooldown 去重');
ok(!/a\.speed\s*\*=\s*0\.2/.test(entSrc), '撞击结算**不**再瞬时压速（旧实现会把分离力一起打掉）');

section('① 撞击硬直驱动消费');
const move = require(path.join(__dirname, '..', 'js', 'tank_move.js'));
ok(typeof move.stiffMul === 'function', 'tank_move 导出 stiffMul');
ok(typeof move.flashDashMul === 'function', 'tank_move 导出 flashDashMul');
{
  const t = { stiffTimer: 0 };
  ok(move.stiffMul(t) === 1, '无硬直 → 倍率 1');
  t.stiffTimer = 1.5;
  ok(Math.abs(move.stiffMul(t) - RULES.ramming.stiffSpeedMul) < 1e-9,
     '硬直中 → 倍率 = RULES.ramming.stiffSpeedMul');
}
ok(/stiffTimer/.test(require('fs').readFileSync(path.join(__dirname, '..', 'js', 'tank_move.js'), 'utf8')),
   'driveTank 消费 stiffTimer（逐帧递减）');

// ---------------------------------------------------------------- ② 隐蔽
section('② RULES.camouflage 配置完整性');
ok(RULES.camouflage && typeof RULES.camouflage === 'object', 'RULES.camouflage 存在');
ok(RULES.camouflage.baseCamo && RULES.camouflage.baseCamo.light > RULES.camouflage.baseCamo.heavy,
   '轻型隐蔽基准 > 重型（吨位越大越难藏）');
ok(RULES.camouflage.motionMultiplier.idle > RULES.camouflage.motionMultiplier.sprint,
   '静止隐蔽 > 疾驰隐蔽');
ok(RULES.camouflage.firingPenaltyMultiplier < 1, '开火惩罚乘数 < 1');
ok(RULES.camouflage.bushBonus > 0 && RULES.camouflage.smokeBonus > 0,
   '灌木/烟幕加成为正');
ok(RULES.camouflage.aiSpotBaseDist > 0, 'aiSpotBaseDist > 0');

section('② 隐蔽纯函数（tank_cover）');
const cov = require(path.join(__dirname, '..', 'js', 'tank_cover.js'));
for (const fn of ['camouflageClassOf', 'camouflageMotionOf', 'camouflageValue', 'camouflageDistanceMultiplier']) {
  ok(typeof cov[fn] === 'function', 'tank_cover 导出 ' + fn);
}
{
  const light = { vehicleClass: 'light', speed: 0, stats: { maxSpeed: 100 } };
  const heavy = { vehicleClass: 'heavy', speed: 0, stats: { maxSpeed: 100 } };
  ok(cov.camouflageClassOf(light) === 'light', 'vehicleClass=light → light');
  ok(cov.camouflageClassOf(heavy) === 'heavy', 'vehicleClass=heavy → heavy');
  ok(cov.camouflageClassOf({}) === 'medium', '缺字段回退 medium');

  const still = { vehicleClass: 'medium', speed: 0, stats: { maxSpeed: 100 } };
  const fast = { vehicleClass: 'medium', speed: 100 * (RULES.speed.pxFactor || 1) * (RULES.speed.effMul || 1), stats: { maxSpeed: 100 } };
  ok(cov.camouflageMotionOf(still) === 'idle', '速度 0 → idle');
  ok(cov.camouflageMotionOf(fast) === 'sprint', '接近极速 → sprint');

  const cStill = cov.camouflageValue(still);
  const cFast = cov.camouflageValue(fast);
  ok(cStill > cFast, `静止隐蔽(${cStill.toFixed(3)}) > 疾驰隐蔽(${cFast.toFixed(3)})`);

  const mStill = cov.camouflageDistanceMultiplier(still);
  const mFast = cov.camouflageDistanceMultiplier(fast);
  ok(mStill < mFast, `静止视距倍率(${mStill.toFixed(3)}) < 疾驰倍率(${mFast.toFixed(3)})`);
  ok(mStill >= 0.3 && mStill <= 1, '视距倍率钳制在 [0.3, 1]（不会完全隐身）');

  // 开火惩罚：时间戳距今 0ms → 隐蔽暴跌
  const fired = { vehicleClass: 'medium', speed: 0, stats: { maxSpeed: 100 }, lastFireAt: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now() };
  ok(cov.camouflageValue(fired) < cStill, `开火瞬间隐蔽(${cov.camouflageValue(fired).toFixed(3)}) 低于静止隐蔽(${cStill.toFixed(3)})`);
}

section('② AI 感知接入（非死配置）');
const aiSrc = require('fs').readFileSync(path.join(__dirname, '..', 'js', 'tank_ai.js'), 'utf8');
ok(aiSrc.includes('camouflageDistanceMultiplier'), 'tank_ai.js 消费 camouflageDistanceMultiplier');
ok(aiSrc.includes('enterDCamo'), '首次激活距离使用隐蔽修正值');
ok(!/exitD\s*=\s*enterDCamo/.test(aiSrc), '脱离距离**不**吃隐蔽折扣（防贴脸脱战抖动）');

// ---------------------------------------------------------------- ③ 闪跃
section('③ RULES.abilities.flash_dash 配置完整性');
const fd = RULES.abilities && RULES.abilities.flash_dash;
ok(!!fd, 'RULES.abilities.flash_dash 存在');
for (const k of ['duration', 'speedMult', 'cooldown', 'overheatDuration', 'overheatSlowMul']) {
  ok(typeof fd[k] === 'number', 'flash_dash.' + k + ' 为数值');
}
ok(fd.speedMult > 1, 'speedMult > 1（真加速）');
ok(fd.overheatSlowMul < 1, 'overheatSlowMul < 1（过热减速）');

section('③ 能力表与卡牌白名单闭环（防死键）');
const ab = require(path.join(__dirname, '..', 'js', 'tank_abilities.js'));
const cards = require(path.join(__dirname, '..', 'js', 'tank_cards.js'));
ok(ab.ABILITY_KEYS_RUNTIME.indexOf('flash_dash') >= 0, 'ABILITY_KEYS_RUNTIME 含 flash_dash');
ok(cards.ABILITY_KEYS.indexOf('flash_dash') >= 0, '卡牌 ABILITY_KEYS 含 flash_dash（非死键）');
ok(!!ab.ABILITY_LABELS.flash_dash, 'ABILITY_LABELS 有中文名');
ok(typeof fd.speedMult === 'number', 'RULES 有 flash_dash 配置（三处闭环）');

// 卡牌文件存在且能被校验
const cardPath = path.join(__dirname, '..', 'cards', 'ability_flash_dash.json');
ok(fs.existsSync(cardPath), 'cards/ability_flash_dash.json 存在');
{
  const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
  ok(card.effects && card.effects[0] && card.effects[0].type === 'ability' && card.effects[0].key === 'flash_dash',
     '卡牌效果 = ability:flash_dash');
  const _verr = (typeof cards.validateCard === 'function') ? cards.validateCard(card) : null;
  ok(Array.isArray(_verr) && _verr.length === 0,
     'validateCard 无错误（返回空数组；实测 ' + JSON.stringify(_verr) + '）');
}

section('③ 闪跃运行时：激活写状态位、不直接改位置');
{
  const t = {
    id: 'T1', team: 'player', hp: 100, maxHp: 100,
    cardEffects: [{ type: 'ability', key: 'flash_dash' }],
    abilityCds: {}, reloadT: 0,
    stats: { reload: 1, maxSpeed: 100 },
    x: 500, y: 500, hullAngle: 0, turretAngle: 0, speed: 0
  };
  const res = ab.tryActivateAbility(t, 'flash_dash', {});
  ok(res.ok === true, '激活成功');
  ok(t.flashDashT > 0, '写入 flashDashT > 0');
  ok(t.x === 500 && t.y === 500, '**未**直接改写坐标（位移交 driveTank 积分）');
  ok(t.abilityCds.flash_dash > 0, '写入独立冷却 abilityCds.flash_dash');
  const cd = t.abilityCds.flash_dash;
  const res2 = ab.tryActivateAbility(t, 'flash_dash', {});
  ok(res2.ok === false && res2.reason === 'cooldown', `冷却中二次激活被拒（cd=${cd}）`);
}

section('③ 闪跃速度通道：激活加速、结束后过热回落');
{
  const t = { flashDashT: 1.0, flashOverheatT: 0 };
  ok(Math.abs(move.flashDashMul(t) - fd.speedMult) < 1e-9, '闪跃中 → speedMult');
  t.flashDashT = 0; t.flashOverheatT = 1.5;
  ok(Math.abs(move.flashDashMul(t) - fd.overheatSlowMul) < 1e-9, '过热期 → overheatSlowMul');
  t.flashOverheatT = 0;
  ok(move.flashDashMul(t) === 1, '两者皆无 → 1');
}

// ---------------------------------------------------------------- ④ 烟雾弹副武器
section('④ 战术烟幕发射器（副武器 smoke）');
{
  const W = require(path.join(__dirname, '..', 'js', 'tank_weapons.js'));
  const wdef = W.WEAPON_DEFAULTS;
  ok(!!wdef.secondary.smoke, 'WEAPON_DEFAULTS.secondary.smoke 存在');
  for (const k of ['reload', 'range', 'cloudCount', 'spreadPx', 'duration']) {
    ok(typeof wdef.secondary.smoke[k] === 'number', 'smoke.' + k + ' 为数值');
  }
  ok(wdef.secondary.smoke.cloudCount >= 2, 'cloudCount ≥ 2（形成烟墙而非单点）');
  ok(RULES.weaponTypes.secondary.indexOf('smoke') >= 0, 'RULES.weaponTypes.secondary 含 smoke');
  ok(cards.WEAPON_SECONDARY_TYPES.indexOf('smoke') >= 0, '卡牌 WEAPON_SECONDARY_TYPES 含 smoke（否则任何烟幕卡判非法）');

  const wsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'tank_weapons.js'), 'utf8');
  ok(/case 'smoke'/.test(wsSrc), 'tank_weapons 有 smoke 开火分支');
  ok(wsSrc.includes('spawnSmokeCloud'), 'smoke 分支调用 spawnSmokeCloud（非空实现）');
  ok(wsSrc.includes('RULES') && /RULES\.smoke|smokeCfg/.test(wsSrc),
     '单团半径/存续读 RULES.smoke（与发射几何分离）');

  for (const id of ['weapon_secondary_smoke', 'weapon_secondary_smoke_upgrade']) {
    const p = path.join(__dirname, '..', 'cards', id + '.json');
    ok(fs.existsSync(p), 'cards/' + id + '.json 存在');
    const verr = cards.validateCard(JSON.parse(fs.readFileSync(p, 'utf8')));
    ok(Array.isArray(verr) && verr.length === 0, id + ' validateCard 无错误');
  }
}

// ---------------------------------------------------------------- ⑤ 残留死配置哨兵
section('⑤ 死配置哨兵：所有新 RULES 块都至少有一个消费方');
{
  const files = ['tank_rules.js', 'tank_entity.js', 'tank_move.js', 'tank_cover.js', 'tank_ai.js',
                 'tank_abilities.js', 'tank_fire.js', 'tank_cards.js', 'tank_weapons.js'];
  const all = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
  ok(all.includes('RULES.ramming'), 'RULES.ramming 有消费方');
  ok(all.includes('RULES.camouflage'), 'RULES.camouflage 有消费方');
  ok(all.includes('RULES.abilities.flash_dash') || /abilities\.flash_dash/.test(all), 'RULES.abilities.flash_dash 有消费方');
  ok(all.includes('RULES.smoke') || /smokeCfg/.test(all), 'RULES.smoke 有消费方（烟雾弹发射器）');
}

console.log('\n' + '='.repeat(60));
console.log(`通过 ${pass} / 失败 ${fail}`);
process.exitCode = fail === 0 ? 0 : 1;
if (fail === 0) console.log('全部通过');
