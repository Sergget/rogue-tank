// test-boss-spawn.js — Boss 出生净空与选址（#AB16）+ Boss 图建筑密度乘子透传（#AB15）
// 运行：node scripts/test-boss-spawn.js
// 背景：2026-10-27 起 Boss 节点改走标准 strip 生成器（3×3 屏竞技场）。两处随之失效：
//   #AB15 建筑密度乘子只透传给 generateNode（strip 路径漏传）；
//   #AB16 出生净空写死 60px，小于 Boss 车体外接半径（scale=2，69~79px）。
'use strict';

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
global.norm = U.norm;
global.rotate = U.rotate;
global.distToSegment = U.distToSegment;
global.segRayIntersect = U.segRayIntersect;
global.partCorners = U.partCorners;
global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;

const HG = require('../js/tank_halfgeom.js');
global.normalizeBarrel = HG.normalizeBarrel;
require('../js/tank_geometry.js');
const MODEL = require('../js/tank_model.js');
const BOSS = require('../js/tank_boss.js');
const NG = require('../js/tank_nodegen.js');
for (const k of Object.keys(NG)) {
  if (typeof NG[k] === 'function' || Array.isArray(NG[k])) global[k] = NG[k];
}
require('../js/tank_cover.js');
const MAP = require('../js/tank_map.js');

// makeBossEntity 运行期依赖的全局（与 test-boss.js 同口径的最小桩）
global.addModifier = (t, m) => { t.modifiers = t.modifiers || []; t.modifiers.push(m); return t; };
global.removeModifierBySource = (t, s) => { t.modifiers = (t.modifiers || []).filter(m => m.source !== s); };
global.applyDamage = () => {};
global.callStrike = () => [];

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function section(name) { console.log('\n[' + name + ']'); }

const ROOT = path.join(__dirname, '..');
const VP = { vw: 1920, vh: 1080 };
const readTank = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tanks', id + '.json'), 'utf8'));
const bossIds = fs.readdirSync(path.join(ROOT, 'bosses')).filter(f => f.endsWith('.json'));

// 与 tank_battle.html spawnBossFromDef 同口径的「坏掩体」（阻挡 ∪ 液态）
function badCovers(covers) {
  return covers.filter(c => {
    const tier = RULES.coverTiers ? RULES.coverTiers[c.tier] : null;
    if (!tier) return false;
    return tier.passability === 0 || tier.shellBlock === true || tier.shellBlock === 'single'
      || tier.tierGroup === 'liquid' || c.tier === 'water' || c.tier === 'river';
  });
}

// 用真实坦克配置生成 Boss 实体（几何随 boss.scale 缩放，与实战同路径）
function spawnBoss(def) {
  return BOSS.makeBossEntity(def, {
    spawnTank: (spec) => MODEL.makeTank(spec),
    configureTank: (t, tankId) => { const spec = readTank(tankId); if (spec) MODEL.applyTankConfig(t, spec); }
  });
}

const bossDefs = bossIds.map(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'bosses', f), 'utf8')));

// ---------------------------------------------------------------- ① 车体外接半径
section('① bossFootprintRadius：车体半径随 boss.scale 生效（#AB16 的量化依据）');
const radii = [];
for (const def of bossDefs) {
  const t = spawnBoss(def);
  const r = BOSS.bossFootprintRadius(t);
  radii.push({ id: def.id, r: r });
  ok(r > 60, `${def.id} 外接半径 ${r.toFixed(1)}px > 旧固定净空 60px`);
}
ok(radii.length === 5, `覆盖全部 ${radii.length} 个 Boss 定义`);
ok(radii.every(x => x.r >= 65 && x.r <= 90), '半径落在 65~90px（tiger-I ×2 口径）');
ok(BOSS.bossFootprintRadius(null) === 0, '空实体返回 0（不抛错）');
ok(BOSS.bossFootprintRadius({ hullWid: 40, hullLen: 60 }) === Math.hypot(20, 30), '无几何规格时退化包围盒半对角线');

// ---------------------------------------------------------------- ② 选址纯函数
section('② findBossSpawn：默认点被阻挡时按净空外找');
{
  const node = { w: 4000, h: 3000 };
  const CX = node.w * 0.7, CY = node.h / 2, R_BLOCK = 120, PAD = 90;
  const blocked = (x, y, pad) => Math.hypot(x - CX, y - CY) <= R_BLOCK + pad;

  const free = BOSS.findBossSpawn({ w: 4000, h: 3000 }, () => false, PAD);
  ok(free.x === CX && free.y === CY && free.found === true && free.rescued === false,
    '未阻挡时原位返回（不挪动）');

  const sp = BOSS.findBossSpawn(node, blocked, PAD);
  ok(sp.found === true && sp.rescued === true, '被阻挡时执行救援搜索');
  ok(blocked(sp.x, sp.y, PAD) === false, `救援点满足净空（距中心 ${Math.hypot(sp.x - CX, sp.y - CY).toFixed(0)}px ≥ ${R_BLOCK + PAD}px）`);
  ok(sp.x >= PAD && sp.x <= node.w - PAD && sp.y >= PAD && sp.y <= node.h - PAD, '救援点不出界');

  const stuck = BOSS.findBossSpawn({ w: 300, h: 300 }, () => true, 80);
  ok(stuck.found === false && stuck.rescued === true, '全图阻挡时返回 found=false（调用方可提示）');

  const origin = BOSS.findBossSpawn(node, () => false, PAD, { x: 111, y: 222 });
  ok(origin.x === 111 && origin.y === 222, 'origin 覆盖生效（显式坐标优先）');
}

// ---------------------------------------------------------------- ③ #AB15 乘子透传
section('③ #AB15：Boss 建筑密度乘子透传进 generateStrip');
{
  const spy = { boss: null, normal: null };
  const real = global.generateStrip;
  ok(typeof real === 'function', '全局 generateStrip 就位（makeNode 的 strip 分支可达）');
  global.generateStrip = (diff, opts) => { spy.boss = opts; return real(diff, opts); };
  MAP.makeNode(0, NG.createRNG(2026), { viewport: VP, difficultyLevel: 0, bossOnly: true });
  global.generateStrip = (diff, opts) => { spy.normal = opts; return real(diff, opts); };
  MAP.makeNode(0, NG.createRNG(2026), { viewport: VP, difficultyLevel: 0, noOutpost: true });
  global.generateStrip = real;

  const bossDensity = (RULES.nodeMap.building && RULES.nodeMap.building.bossDensity) || 1.6;
  ok(!!spy.boss, 'boss 节点确实走 strip 路径（不是方形回退）');
  ok(spy.boss && spy.boss.buildingDensity === bossDensity,
    `boss 节点透传 buildingDensity=${bossDensity}（实际 ${spy.boss && spy.boss.buildingDensity}）`);
  ok(spy.normal && spy.normal.buildingDensity === 1,
    `普通节点透传 buildingDensity=1（实际 ${spy.normal && spy.normal.buildingDensity}）`);
}

// ---------------------------------------------------------------- ④ #AB15 效果
section('④ #AB15：同 seed 下 Boss 图建筑数高于乘子失效前口径');
{
  // 对照：同一批 seed 用 buildingDensity=1 直接调生成器，应与「修复前」等价
  const seeds = [1, 7, 42, 99, 777, 2024, 8888, 123456];
  let withMul = 0, withoutMul = 0;
  for (const sd of seeds) {
    const run = MAP.generateRun(sd, undefined, { viewport: VP, difficultyLevel: 0, bossOnly: true });
    withMul += run.nodes[0].covers.filter(c => c.tier === 'building').length;
    // 先落变量再传：与 tank_map.js 同口径，绕开 StripGenOptions 的过量属性检查
    const probe = {
      seed: sd, viewport: VP,
      scaleFor: (vp, tpl) => MAP.nodeScaleFor(vp, tpl),
      stripScreensX: 3, stripScreensY: 3, chunkRows: 1, chunkCount: 1,
      fillBands: true, buildingDensity: 1
    };
    const r = NG.generateStrip(0.5, probe);
    withoutMul += r.covers.filter(c => c.tier === 'building').length;
  }
  ok(withMul > withoutMul, `Boss 图建筑数 ${withMul} > 乘子 1.0 口径 ${withoutMul}（8 seed 聚合）`);
}

// ---------------------------------------------------------------- ⑤ #AB16 回归
section('⑤ #AB16：Boss 出生点车体不再压进阻挡物（20 seed × 5 节点）');
{
  let nodes = 0, rescued = 0, overlap = 0, notFound = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const run = MAP.generateRun(seed, undefined, { viewport: VP, difficultyLevel: 0, bossOnly: true });
    for (const node of run.nodes) {
      nodes++;
      const bad = badCovers(node.covers);
      if (!bad.length) continue;
      const def = bossDefs[seed % bossDefs.length];
      const t = spawnBoss(def);
      // 余量与页面一致：车体半径 + 16
      const clear = BOSS.bossFootprintRadius(t) + 16;
      const sp = BOSS.findBossSpawn(node, (x, y, pad) => MAP.pointInCover(bad, x, y, pad), clear);
      if (!sp.found) notFound++;
      if (sp.rescued) rescued++;
      // 断言口径：中心到阻挡物的距离 ≥ 车体半径（不留余量也成立）
      if (MAP.pointInCover(bad, sp.x, sp.y, BOSS.bossFootprintRadius(t))) overlap++;
    }
  }
  ok(nodes === 100, `覆盖 ${nodes} 个 Boss 节点`);
  ok(overlap === 0, `车体压阻挡物 0/${nodes}（修复前观测 4.6%~11.2%）`);
  ok(notFound === 0, `选址全部成功（未找到 ${notFound}）`);
  ok(rescued > 0, `确有节点需要救援搜索（${rescued}/${nodes}），用例非空转`);
}

console.log('\n' + '='.repeat(60));
console.log(`通过 ${pass} / 失败 ${fail}`);
process.exitCode = fail === 0 ? 0 : 1;
if (fail === 0) console.log('全部通过');
