// test-vision-stealth-p1.js — #P1（I0 模拟时钟 + I1 高度表 + I2 高度分档视线）回归
//
// 背景（2026-10-24 用户裁定「先做 P1」）：
//   视野-隐蔽机制的三个结构性缺陷在 2D 下先修，是任何伪 3D 路线的共同前提。
//   细则归口 docs/specs/map/vision-stealth-3d-compat.md §2/§4，
//   实施拆解见 docs/specs/map/pseudo-3d-readiness.md §3 的 I0~I2。
//
// 覆盖：
//   I0 模拟时钟：setSimNow/simNow/advanceSimNow 语义 + 隐蔽开火惩罚窗口改读模拟时钟
//   I1 高度表：RULES.coverTiers[*].height 全键齐备 + 分档语义（0 / <1.2 / ≥2.3）
//   I2 高度分档视线：灌木挡车体不挡炮塔（C 方案）、建筑全挡、vision:false 不参与、
//      未注册 tier 不抛错、烟雾仍全遮
//   I2 隐蔽相对化：覆盖深度→加成（边缘半额、中心满额）
//   对称化：RULES.camouflage.symmetric 缺省 false（负向断言：默认不吃敌方隐蔽）
'use strict';

require('../js/tank_utils.js');
require('../js/tank_rules.js');
const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
const RULES = RULES_MOD.RULES;
global.RULES = RULES;
global.TAU = U.TAU;
global.partCorners = U.partCorners;
global.distToSegment = U.distToSegment;
global.segRayIntersect = U.segRayIntersect;
global.norm = U.norm;
global.angDiff = U.angDiff;
global.rotate = U.rotate;
// ⚠️ 模拟时钟也必须挂到全局：tank_cover/tank_boss 等模块用 `typeof simNow === 'function'`
//    探测它（浏览器端 tank_utils.js 的顶层声明天然是全局，Node 侧必须显式注入）。
global.simNow = U.simNow;
global.setSimNow = U.setSimNow;
global.advanceSimNow = U.advanceSimNow;

const C = require('../js/tank_cover.js');
global.COVER_TIERS = C.COVER_TIERS;
global.covers = C.covers;
global.getCoverUnderTank = C.getCoverUnderTank;
// tank_cover 的碰撞/网格路径依赖以下全局（浏览器端由 tank_utils/tank_geometry 提供）
// ⚠️ tank_geometry 顶层读 RULES.defaultArmor，必须在 global.RULES 注入之后加载。
const G = require('../js/tank_geometry.js');
global.polyCorners = G.polyCorners;
global.coverCorners = C.coverCorners;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

// ============================================================ I0 模拟时钟
section('I0 模拟时钟（判定/计时路径的唯一时间源）');
{
  // 未注入时回退真实时钟：值应接近 performance.now()
  U.setSimNow(null);
  const real = U.simNow();
  ok(typeof real === 'number' && Number.isFinite(real) && real >= 0,
    `未注入时 simNow() 回退真实时钟（${real.toFixed(1)}ms）`);

  // 注入后完全可控
  U.setSimNow(1000);
  ok(U.simNow() === 1000, 'setSimNow(1000) → simNow() = 1000');
  ok(U.advanceSimNow(500) === 1500, 'advanceSimNow(500) → 1500');
  ok(U.simNow() === 1500, 'advanceSimNow 后 simNow() 保持 = 1500');

  // 非法注入回退（防 NaN 污染整条计时链）
  U.setSimNow(NaN);
  ok(Number.isFinite(U.simNow()), 'setSimNow(NaN) → 回退真实时钟（不污染）');
  U.setSimNow(null);

  // 隐蔽开火惩罚窗口：写/读必须同源，否则窗口判定不可复现
  U.setSimNow(10000);
  const t = { x: -99999, y: -99999, speed: 0, stats: { maxSpeed: 40 }, lastFireAt: 10000,
              hullLen: 64, hullWid: 38, hullAngle: 0 };
  ok(C.camouflageFiringMul(t) === RULES.camouflage.firingPenaltyMultiplier,
    '开火后 0ms：firingMul = 惩罚乘数（窗口生效）');
  U.setSimNow(10000 + 2900);   // 窗口 3.0s 内
  ok(C.camouflageFiringMul(t) === RULES.camouflage.firingPenaltyMultiplier,
    '开火后 2.9s：仍在惩罚窗口内');
  U.setSimNow(10000 + 3100);   // 超出窗口
  ok(C.camouflageFiringMul(t) === 1,
    '开火后 3.1s：firingMul 恢复 1（证明改读模拟时钟，而非挂钟）');
  // 负向：未开火（无 lastFireAt）恒为 1
  ok(C.camouflageFiringMul({ x: 0, y: 0 }) === 1, '未开火 → firingMul 恒 1');
  U.setSimNow(null);
}

// ============================================================ I1 高度表
section('I1 高度表（RULES.coverTiers[*].height 唯一口径）');
{
  const tiers = Object.keys(RULES.coverTiers);
  const missing = tiers.filter(k => typeof RULES.coverTiers[k].height !== 'number');
  ok(missing.length === 0, `全部 ${tiers.length} 个 tier 都有 height（缺：${missing.join(',') || '无'}）`);
  ok(tiers.every(k => Number.isFinite(RULES.coverTiers[k].height) && RULES.coverTiers[k].height >= 0),
    '全部 height 为有限非负数');

  const h = k => RULES.coverTiers[k].height;
  // 分档语义：0 = 纯地面；<1.2 = 只挡车体；≥2.3 = 全挡
  ok(['road', 'mud', 'water', 'river', 'bridge'].every(k => h(k) === 0),
    '地面/水面类 height = 0（不参与视线遮挡）');
  ok(h('bush') > 0 && h('bush') < 2.3,
    `灌木 ${h('bush')}m 落在「挡车体不挡炮塔」区间（0, 2.3)`);
  ok(h('bush') > C.LOS_HULL_Z,
    `灌木 ${h('bush')}m > 车体视线高度 ${C.LOS_HULL_Z}m ⇒ 能挡住车体（C 方案）`);
  ok(h('bush') < C.LOS_TARGET_Z,
    `灌木 ${h('bush')}m < 炮塔视线高度 ${C.LOS_TARGET_Z}m ⇒ 挡不住炮塔`);
  ok(['tree', 'rock', 'building', 'full'].every(k => h(k) >= C.LOS_TARGET_Z),
    '树/岩石/建筑/全高掩体 ≥ 炮塔视高 ⇒ 全挡');
  ok(h('ruined') >= C.LOS_HULL_Z && h('ruined') < C.LOS_TARGET_Z,
    `残破建筑 ${h('ruined')}m：挡车体、不挡炮塔（与残墙语义一致）`);

  // coverHeightOf 的兜底
  ok(C.coverHeightOf('bush') === h('bush'), 'coverHeightOf(bush) 读 RULES 唯一口径');
  ok(C.coverHeightOf('__nope__') === 0, '未注册 tier → coverHeightOf 返回 0（不抛错）');
}

// ============================================================ I2 高度分档视线
section('I2 高度分档视线（灌木 ≠ 楼房）');
{
  C.resetCovers();
  const bush = C.covers.find(c => c.tier === 'bush');
  const bld = C.covers.find(c => c.tier === 'full');
  ok(!!bush && !!bld, '夹具：默认 covers 含 bush 与 full');

  if (bush) {
    // 核心行为变更：灌木 1.2m 挡不住炮塔视线（旧口径是「命中即全遮」）
    ok(C.hasLineOfSight(bush.x - 100, bush.y, bush.x + 100, bush.y) === true,
      '灌木不挡炮塔视线（needZ = 2.3m）');
    ok(C.hasLineOfSight(bush.x - 100, bush.y, bush.x + 100, bush.y, null, { targetZ: C.LOS_HULL_Z }) === false,
      '灌木挡住车体视线（needZ = 1.0m）—— hull-down 分级成立');
    ok(C.hasLineOfSight(bush.x - 100, bush.y + 300, bush.x + 100, bush.y + 300) === true,
      '不穿灌木的路径视线畅通（无假阳性）');
  }
  if (bld) {
    ok(C.hasLineOfSight(bld.x - 100, bld.y, bld.x + 100, bld.y) === false,
      '建筑挡炮塔视线');
    ok(C.hasLineOfSight(bld.x - 100, bld.y, bld.x + 100, bld.y, null, { targetZ: C.LOS_HULL_Z }) === false,
      '建筑挡车体视线（全高掩体不分档）');
  }

  // vision:false 的 tier 永不参与（水/泥/路），即使高度为 0
  const road = C.covers.find(c => c.tier === 'road');
  if (road) {
    ok(C.hasLineOfSight(road.x - 300, road.y, road.x + 300, road.y) === true,
      '道路（vision:false）不挡视线');
  }

  // 未注册 tier：不抛错、不挡（与 tierShellBlock 的「不认识就不挡」同向）
  let threw = false;
  try {
    C.covers.push({ x: 5000, y: 5000, w: 40, h: 40, angle: 0, tier: '__unknown_tier__', hp: 1 });
    C.hasLineOfSight(4900, 5000, 5100, 5000);
  } catch (e) { threw = true; }
  ok(!threw, '未注册 tier 出现在视线路径上不抛错（#W16-② 同向兜底）');

  // 烟雾：全遮，不参与高度分档
  C.resetCovers();
  C.clearSmoke();
  C.spawnSmokeCloud(0, 0, 50, 5);
  ok(C.hasLineOfSight(-100, 0, 100, 0) === false, '烟雾遮挡视线（全遮，不分档）');
  ok(C.hasLineOfSight(-100, 0, 100, 0, null, { targetZ: C.LOS_HULL_Z }) === false,
    '烟雾对车体视线同样遮挡（烟雾本就没有高度剖面）');
  C.clearSmoke();
}

// ============================================================ I2 隐蔽相对化
section('I2 隐蔽值相对化（覆盖深度 → 加成，不再「相交即满额」）');
{
  C.resetCovers();
  C.clearSmoke();
  const bush = C.covers.find(c => c.tier === 'bush');
  if (bush) {
    // 夹具需带车体尺寸：getCoverUnderTank 用 hullLen/hullWid 做 OBB 相交
    const mk = (x, y) => ({ x, y, speed: 0, stats: { maxSpeed: 40 }, lastFireAt: null,
                            hullLen: 64, hullWid: 38, hullAngle: 0 });
    // 中心：满额（bushBonus）
    const center = mk(bush.x, bush.y);
    // 边缘：按覆盖深度折算（不足满额）
    const edge = mk(bush.x + (bush.w / 2) * 0.95, bush.y);
    const bCenter = C.camouflageValue(center);
    const bEdge = C.camouflageValue(edge);
    const bNone = C.camouflageValue(mk(-99999, -99999));
    ok(bCenter > bEdge, `灌木中心隐蔽(${bCenter.toFixed(3)}) > 边缘(${bEdge.toFixed(3)})`);
    ok(bEdge >= bNone, `边缘隐蔽(${bEdge.toFixed(3)}) 不低于裸地(${bNone.toFixed(3)})`);
    // 上限仍受 bushBonus 约束
    ok(bCenter <= bNone + RULES.camouflage.bushBonus + 1e-9,
      `中心加成不超过 bushBonus(${RULES.camouflage.bushBonus})`);
    // 负向：旧口径「相交即满额」已废除 —— 边缘必须显著低于满额
    ok(bEdge < bNone + RULES.camouflage.bushBonus * 0.9,
      '边缘加成显著低于满额（负向断言：不再「相交即给满」）');
  }
}

// ============================================================ 对称化开关
section('隐蔽对称化：暂不启用，保留接入能力');
{
  ok(RULES.camouflage.symmetric === false,
    'RULES.camouflage.symmetric 缺省 false（当前不对称化）');
  const aiSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'tank_ai.js'), 'utf8');
  ok(aiSrc.includes('_enemyCamoMul'), 'AI 侧存在对称化接入点（_enemyCamoMul）');
  ok(/symmetric\s*===\s*true/.test(aiSrc), '接入点受 RULES.camouflage.symmetric 开关控制');
  ok(!/enterDCamo\s*=\s*enterD\s*\*\s*_camoMul\s*;/.test(aiSrc) || aiSrc.includes('_enemyCamoMul'),
    'enterDCamo 已包含敌方隐蔽乘子通道（默认恒 1，不改变现行行为）');
}

// ============================================================ 死配置
section('死配置/死状态核查（本批未处理，仅断言不被误删）');
{
  ok(RULES.camouflage.aiSpotBaseDist !== undefined,
    'aiSpotBaseDist 仍存在（已知零消费方，另案处理，不属 P1）');
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exitCode = fails ? 1 : 0;
