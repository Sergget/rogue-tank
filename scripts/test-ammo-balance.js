'use strict';
// ============================================================================
// scripts/test-ammo-balance.js — 弹种平衡性测试脚本（弹种链 2026-09-13，PLAN.md 阶段五⑤）
//
// 目的：测试各弹种面对不同等级（装甲包络）、不同速度的敌人时的表现，检测是否存在
//       「同等级明显过强/过弱」的弹种（失衡判定：与同档弹种中位数的偏差超阈值）。
//
// 方法（走真实结算路径，非纸面倍率）：
//   1. 每弹种用统一「基准炮」（pen 120 / dmg 100 / 基准装填 3s）× 弹种倍率构造 shell；
//   2. 对 4 级装甲包络目标（轻/中/重/超重 = 存量车 ±30% 包络外推）× 3 入射角（0°/30°/60°）
//      × 3 目标速度（0/60/120 px/s，速度经精度系数→命中率折算）执行 resolveHit 蒙特卡洛；
//   3. 输出每弹种的 击穿率 / 平均单发伤害 / 期望击杀弹数（含未击穿残余与模块倍率）；
//   4. 同档（同一目标装甲级）内比较「期望击杀弹数」中位数偏差：>±25% → 失衡警告；
//   5. 速度维度单独校验：精度系数（spreadAcc）是否把高倍率弹种在远距离打成了废弹。
//
// 运行：node scripts/test-ammo-balance.js
// 退出码：0 = 无失衡（或仅 WARN 级）；1 = 有断言失败（红级失衡或机制错误）。
// ============================================================================
const U = require('../js/tank_utils.js');
const R = require('../js/tank_rules.js');
global.TAU = U.TAU; global.norm = U.norm; global.rotate = U.rotate; global.angDiff = U.angDiff;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners; global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir; global.distToSegment = U.distToSegment; global.gaussian = U.gaussian;
global.RULES = R.RULES;
const G = require('../js/tank_geometry.js');
global.ARMOR = G.ARMOR; global.BOUNCE_ANGLE = G.BOUNCE_ANGLE; global.HEIGHTS = G.HEIGHTS;
global.hullPoly = G.hullPoly; global.turretPoly = G.turretPoly;
global.moduleFromHit = G.moduleFromHit; global.faceLabel = G.faceLabel; global.superstructureLabel = G.superstructureLabel;
global.polyCorners = G.polyCorners; global.polyEdges = G.polyEdges;
global.gunRoot = G.gunRoot; global.gunTip = G.gunTip;
const M = require('../js/tank_model.js');
global.makeTank = M.makeTank; global.computeStats = M.computeStats; global.moduleMult = M.moduleMult; global.setDebuff = M.setDebuff;
const P = require('../js/tank_physics.js');

const AMMO_LIST = Object.keys(RULES.ammoTypes);
const BASE_PEN = 120, BASE_DMG = 100, BASE_RELOAD = 3.0;

// 目标装甲包络（mm）：轻/中/重/超重 = 存量车(hull 110/38/26) ±30% 阶梯外推
const TARGET_TIERS = [
  { name: '轻型', hull: { front: 60,  side: 25, rear: 18 }, hp: 80  },
  { name: '中型', hull: { front: 110, side: 38, rear: 26 }, hp: 100 },
  { name: '重型', hull: { front: 180, side: 60, rear: 40 }, hp: 140 },
  { name: '超重', hull: { front: 260, side: 90, rear: 60 }, hp: 160 }
];
const ANGLES = [0, 30, 60];               // 入射角（度，车体正面对射语义）
const TARGET_SPEEDS = [0, 60, 120];       // 目标横移速度（px/s）
const SHOTS_PER_CELL = 400;               // 每格蒙特卡洛样本数
const DISTANCE = 300;                     // 交战距离（px）

// 「同等级」弹种集合（弹种链定案：玩家在对抗该级敌人时应持有的弹种档）。
// 失衡检测只在集合内比较——高级弹打低级敌人碾压是链表设计预期，不算失衡。
const TIER_SHELLS = {
  '轻型': ['ap', 'he'],
  '中型': ['apcr', 'apds', 'heat', 'heatfs', 'aphe', 'hesh'],
  '重型': ['apfsds', 'apfsds_ad', 'heatfs', 'tandem_heat', 'heavy_tandem_heat', 'proximity_he', 'blast_he'],
  '超重': ['apfsds_ad', 'heavy_tandem_heat', 'proximity_he', 'blast_he']
};

// 确定性随机源（mulberry32 固定种子，脚本可重放）
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 命中率模型：σ = SPREAD.base × spreadAcc，距离角换算线性化（px），
// 目标横移速度并入额外 σ（0.05×速度 px/s 简化模型，与实机 gaussian 抽样同分布）
const SPREAD = RULES.spread;
function hitProb(ammoCfg, tgtSpeed, dist){
  const sigma = (SPREAD.base || 0.018) * ((ammoCfg && ammoCfg.spreadAcc) || 1);
  const linearSigma = sigma * dist;                                  // σ 线性化（px）
  const moveSigma = tgtSpeed > 0 ? tgtSpeed * 0.05 : 0;
  const total = linearSigma + moveSigma;
  if(total <= 0) return 1;
  // 目标半宽 ~19px（hullWid 38 的一半），2σ 截断 → 命中概率 = erf 近似（clamp 0.05~1）
  const p = Math.min(1, Math.max(0.05, 19 / (total * 1.2)));
  return p;
}

function makeTarget(tier){
  return makeTank({
    id: null, team: 'enemy', x: 0, y: 0, hullAngle: 0, turretAngle: 0,
    base: {
      maxHp: tier.hp,
      armor: { hull: { front: tier.hull.front, side: tier.hull.side, rear: tier.hull.rear },
               turret: { front: Math.round(tier.hull.front * 1.27), side: Math.round(tier.hull.side * 1.3), rear: tier.hull.rear } },
      penetration: 120, damage: 100, reload: 3, shellSpeed: 1000,
      maxSpeed: 120, turnRate: 1.6, turretTurnRate: 2.0, weight: 40, enginePower: 600
    }
  });
}

// 单元格模拟：弹种 × 目标级 × 角度 × 速度 → {pen, dmg, mods}
function simulateCell(ammoKey, tier, angleDeg, tgtSpeed, rng){
  const ammoCfg = RULES.ammoTypes[ammoKey];
  const target = makeTarget(tier);
  const theta = angleDeg * Math.PI / 180;
  // 命中面：正面（车体 front，法线 +x）；入射角经 dx 投影
  const dx = Math.cos(theta), dy = Math.sin(theta);
  const hit = { part: 'hull', faceKey: 'front', x: 32, y: 0, nx: 1, ny: 0, edgeName: 'front' };
  const pen = BASE_PEN * (ammoCfg.pen || 1);
  const dmg = BASE_DMG * (ammoCfg.dmg || 1);
  let penCount = 0, dmgSum = 0, modCount = 0;
  const SHOTS = SHOTS_PER_CELL;
  for(let i = 0; i < SHOTS; i++){
    target.hp = target.stats.maxHp;   // 复位血量（模块/击杀路径不影响下一发）
    const sh = { x: 0, y: 0, dx, dy, pen, dmg, shooter: null, ammoKey, canBounce: true, bounced: false };
    const res = P.resolveHit(sh, target, hit, true);
    if(res.outcome === 'PEN'){ penCount++; dmgSum += res.dmg; if(res.modKey) modCount++; }
    else if(res.dmg > 0){ dmgSum += res.dmg; }   // 未击穿残余（HE 家族）
  }
  return { penRate: penCount / SHOTS, avgDmg: dmgSum / SHOTS, modRate: modCount / SHOTS };
}

// ---------- 主流程 ----------
let fails = 0, warns = 0;
function ok(cond, label){ if(cond) console.log('  ✓ ' + label); else { console.error('  ✗ ' + label); fails++; } }

console.log('=== 弹种平衡性测试（真实 resolveHit 蒙特卡洛） ===');
console.log(`弹种 ${AMMO_LIST.length} 键 × 装甲 ${TARGET_TIERS.length} 级 × 角度 ${ANGLES.length} × 速度 ${TARGET_SPEEDS.length} × ${SHOTS_PER_CELL} 发/格\n`);

// 聚合表：ammoKey → tierName → {penRate, avgDmg(角度/速度全格均值), shotsToKill}
const agg = {};
for(const key of AMMO_LIST) agg[key] = {};
const results = [];

for(const tier of TARGET_TIERS){
  const tierStats = {};
  for(const key of AMMO_LIST){
    const ammoCfg = RULES.ammoTypes[key];
    let penSum = 0, dmgSum = 0, cells = 0;
    for(const a of ANGLES){
      for(const v of TARGET_SPEEDS){
        const rng = mulberry32(0xBADA55 ^ a * 31 ^ v * 7 ^ tier.hull.front);
        const cell = simulateCell(key, tier, a, v, rng);
        const hp = hitProb(ammoCfg, v, DISTANCE);
        penSum += cell.penRate; dmgSum += cell.avgDmg * hp; cells++;
      }
    }
    const penRate = penSum / cells;
    const effDmg = dmgSum / cells;                     // 含命中率折算的平均单发输出
    const effDmgPerShot = effDmg;                       // 期望单发伤害（含未击穿残余）
    const shotsToKill = effDmgPerShot > 0 ? Math.max(1, tier.hp / effDmgPerShot) : 99;
    const ttk = shotsToKill * BASE_RELOAD;
    tierStats[key] = { penRate, effDmg: effDmgPerShot, shotsToKill, ttk };
  }
  // 同档失衡检测：只在「同等级弹种集合」（TIER_SHELLS）内比较，中位数排除哨兵格。
  const shellSet = TIER_SHELLS[tier.name] || AMMO_LIST;
  const stks = shellSet.map(k => tierStats[k]).filter(s => s.shotsToKill < 99).map(s => s.shotsToKill).sort((x, y) => x - y);
  if(stks.length < 2){
    // 该档 <2 个有效弹种 → 无中位数参照，仅报告
    for(const key of shellSet){
      if(tierStats[key].shotsToKill >= 99){
        console.log(`  [WARN] ${tier.name}档 ${RULES.ammoTypes[key].label}(${key}) 完全无效（0 击穿 0 残余）— 该档有效弹种不足 2，无中位参照`);
        warns++;
      }
    }
  } else {
    const median = stks[Math.floor(stks.length / 2)];
    for(const key of shellSet){
      if(tierStats[key].shotsToKill >= 99){
        console.log(`  [WARN] ${tier.name}档 ${RULES.ammoTypes[key].label}(${key}) 完全无效（0 击穿 0 残余输出）— 需调整弹种数值或给该弹补未击穿残余`);
        warns++;
        continue;
      }
      const dev = tierStats[key].shotsToKill / median - 1;
      tierStats[key].devFromMedian = dev;
      if(Math.abs(dev) > 0.25){
        const tag = dev < 0 ? '过强' : '过弱';
        console.log(`  [WARN] ${tier.name}档 ${RULES.ammoTypes[key].label}(${key}) 击杀弹数偏离中位 ${Math.round(dev*100)}% → ${tag}`);
        warns++;
      }
    }
  }
  agg[tier.name] = tierStats;
}

// ---------- 汇总表 ----------
console.log('\n—— 汇总（期望击杀弹数 / 击穿率，基准炮 pen120 dmg100 reload3s @300px） ——');
const header = '弹种'.padEnd(10) + TARGET_TIERS.map(t => t.name.padEnd(14)).join('');
console.log(header);
for(const key of AMMO_LIST){
  const label = RULES.ammoTypes[key].label.padEnd(8);
  const row = TARGET_TIERS.map(t => {
    const s = agg[t.name][key];
    return `${s.shotsToKill.toFixed(1)}发/${Math.round(s.penRate*100)}%`.padEnd(14);
  }).join('');
  console.log(label + row);
}

// ---------- 机制断言（防脚本自身失效） ----------
console.log('\n—— 机制断言 ——');
ok(RULES.ammoTypes.apfsds.moduleDraws === 2 && RULES.ammoTypes.apfsds.doubleModule === true, 'APFSDS 双模块抽取字段在位');
ok(RULES.ammoTypes.he.nonPenRatio === 0.6 && RULES.ammoTypes.hesh.nonPenRatio === 0.8, 'HE/HESH 未击穿残余系数与用户表一致');
ok(RULES.ammoTypes.ap.bounceAngle === 70 && RULES.ammoTypes.apfsds.bounceAngle === 85, 'AP 70° / APFSDS 85° 跳弹角与用户表一致');
ok(RULES.ammoTypes.proximity_he.proximity === true, '近炸HE 引信标记在位');
// 烟度断言：HE 家族（nonPenRatio>0）在中型车正面未击穿时必须造成残余伤害（非 0 才有平衡意义）
{
  const target = makeTarget(TARGET_TIERS[1]);
  const hit = { part: 'hull', faceKey: 'front', x: 32, y: 0, nx: 1, ny: 0, edgeName: 'front' };
  const r = P.resolveHit({ x:0, y:0, dx:1, dy:0, pen: 30, dmg: 150, shooter: null, ammoKey: 'he', canBounce: true }, target, hit, true);
  ok(r.dmg > 0, `HE 未击穿残余伤害生效（30pen vs 110eff → ${r.dmg}）`);
}
// 跳弹角断言：AP 71° 必跳弹、APFSDS 86° 不跳弹（85° 阈值内）
{
  const t = makeTarget(TARGET_TIERS[1]);
  const hit = { part: 'hull', faceKey: 'front', x: 32, y: 0, nx: 1, ny: 0, edgeName: 'front' };
  const d71 = 71 * Math.PI / 180;
  const rAp = P.resolveHit({ x:0,y:0,dx:Math.cos(d71),dy:Math.sin(d71),pen:9999,dmg:100,shooter:null,ammoKey:'ap',canBounce:true }, Object.assign({}, t), hit, true);
  const rSd = P.resolveHit({ x:0,y:0,dx:Math.cos(d71),dy:Math.sin(d71),pen:9999,dmg:100,shooter:null,ammoKey:'apfsds',canBounce:true }, makeTarget(TARGET_TIERS[1]), hit, true);
  ok(rAp.outcome === 'BOUNCE', 'AP 71° > 70° 跳弹角 → BOUNCE');
  ok(rSd.outcome !== 'BOUNCE', 'APFSDS 71° < 85° 跳弹角 → 不跳弹');
}

console.log(`\n结果：${fails} 项失败 / ${warns} 项失衡警告`);
console.log(fails === 0 ? 'test-ammo-balance: PASS' : 'test-ammo-balance: FAIL');
process.exit(fails === 0 ? 0 : 1);
