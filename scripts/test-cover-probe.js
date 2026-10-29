'use strict';

// test-cover-probe.js — 前向探测原语的回归（MS1 / B1，2026-10-29）
//
// 锁四类东西：
//   ① 判据同源   —— `tierBlocksMove()` 与 `resolveCoverCollisions` 的实际行为逐 tier 对齐
//                   （不是把同一个表达式抄两遍再互相比）；
//   ② 负向口径   —— **实体不是地形**：正前方只站一辆车时 `blocked=false`，且函数源码里
//                   不出现 `entities`（§4.160 拿出生点判定当行进判定、把自身算成障碍，
//                   误判了一整轮，这是本批的头号防回潮点）；
//   ③ 几何正确性 —— 正前方挡、侧后方不挡、距离阈值、`hitDist` 落在 (0, dist]、
//                   法线归一化且指向坦克一侧、调用不写实体字段；
//   ④ 栅格同口径 —— `probeCellPassable` 与「把车摆在格心再 `probeMoveBlocked`」结论一致
//                   （2026-10-29 用户裁定：探测层必须同时能当 A* 栅格输入）。
//
// 运行：node scripts/test-cover-probe.js

const fs = require('fs');
const path = require('path');
const U = require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');

global.RULES = RULES_MOD.RULES;        // tank_cover 顶层读 RULES.coverTiers，必须先于它 require
global.TAU = U.TAU;
global.partCorners = U.partCorners;
global.distToSegment = U.distToSegment;
global.segRayIntersect = U.segRayIntersect;
global.norm = U.norm;
global.rotate = U.rotate;

const CV = require('../js/tank_cover.js');
global.COVER_TIERS = CV.COVER_TIERS;
global.covers = CV.covers;

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function section(t) { console.log(`\n== ${t} ==`); }

// ---------- 场景工具 ----------
const HULL_LEN = 64, HULL_WID = 38;
const HALF_L = HULL_LEN / 2;

function clearCovers() { CV.covers.length = 0; }
function addCover(o) {
  const c = Object.assign({ x: 0, y: 0, w: 80, h: 80, tier: 'wall', hp: 10, angle: 0, verts: null }, o);
  CV.covers.push(c);
  return c;
}
function mkTank(o) {
  return Object.assign({
    x: 0, y: 0, hullAngle: 0, hullLen: HULL_LEN, hullWid: HULL_WID,
    speed: 0, team: 'enemy'
  }, o || {});
}

// ============================================================
section('① 判据同源：tierBlocksMove 与 resolveCoverCollisions 的实际行为一致');

{
  // 对每个 tier：造一块压在车上的掩体，看 resolveCoverCollisions 是否把车推走，
  // 再与 tierBlocksMove 的结论比对。可碾类会销毁掩体（也是「不阻断移动」的一种）。
  const rows = [];
  for (const name of Object.keys(CV.COVER_TIERS)) {
    if (name === 'road') continue;                    // road 在 resolveCoverCollisions 里被显式跳过
    const tier = CV.COVER_TIERS[name];
    clearCovers();
    addCover({ x: 0, y: 0, w: 120, h: 120, tier: name, hp: 10 });
    const t = mkTank({ x: 0, y: 0 });
    CV.resolveCoverCollisions(t);
    const pushedOut = Math.hypot(t.x, t.y) > 0.01;
    rows.push({ name, expect: CV.tierBlocksMove(tier), actual: pushedOut });
  }
  const bad = rows.filter(r => r.expect !== r.actual);
  ok(bad.length === 0,
    `全部 ${rows.length} 个 tier 的「阻断移动」判据与 resolveCoverCollisions 一致`
    + (bad.length ? `（不一致：${bad.map(b => `${b.name} expect=${b.expect} actual=${b.actual}`).join(', ')}）` : ''));

  // 非空转护栏：必须有阻断与非阻断两类样本，否则上一条什么也没证明
  ok(rows.some(r => r.actual) && rows.some(r => !r.actual),
    `样本两类齐全（阻断 ${rows.filter(r => r.actual).length} / 不阻断 ${rows.filter(r => !r.actual).length}）`);
}

// ============================================================
section('② 几何正确性：正前方挡、侧后方不挡、距离阈值');

{
  clearCovers();
  addCover({ x: 200, y: 0, w: 40, h: 200, tier: 'wall' });
  const t = mkTank({ x: 0, y: 0, hullAngle: 0 });
  const far = CV.probeMoveBlocked(t, 0, 50);
  const near = CV.probeMoveBlocked(t, 0, 200);
  ok(far.blocked === false, `墙在 130px 外、只探 50px ⇒ 未阻挡（hitDist=${far.hitDist.toFixed(1)}）`);
  ok(near.blocked === true && near.tier === 'wall', `同一条线探 200px ⇒ 阻挡，tier=${near.tier}`);
  ok(near.hitDist > 0 && near.hitDist <= 200, `hitDist 落在 (0, dist]：${near.hitDist.toFixed(1)}px`);
  // 车头在 x=32，墙面在 x=180 ⇒ 首次接触约 148px（车体前沿贴到墙面）
  ok(Math.abs(near.hitDist - (180 - HALF_L)) < 3,
    `hitDist ≈ 墙面 − 车头半长 = ${180 - HALF_L}px（实测 ${near.hitDist.toFixed(1)}）`);

  const back = CV.probeMoveBlocked(t, Math.PI, 200);
  ok(back.blocked === false, '同场景朝反方向（-x）探 200px ⇒ 未阻挡');

  // 法线：墙面朝 -x 一侧，法线应与 -x 同向（指向坦克）
  ok(Math.abs(near.nx + 1) < 0.2 && Math.abs(near.ny) < 0.2,
    `法线指向坦克一侧（nx=${near.nx.toFixed(3)}, ny=${near.ny.toFixed(3)}）`);
  ok(Math.abs(Math.hypot(near.nx, near.ny) - 1) < 1e-6, '法线已归一化（|n| = 1）');
}

{
  // 斜向：墙在正东，车朝东北 45° 走 200px ⇒ 端点 (141,141)，扫掠区掠过墙面附近但不应命中
  clearCovers();
  addCover({ x: 200, y: 0, w: 40, h: 40, tier: 'wall' });
  const t = mkTank({ x: 0, y: 0, hullAngle: Math.PI / 4 });
  const diag = CV.probeMoveBlocked(t, Math.PI / 4, 200);
  ok(diag.blocked === false, '斜向 45° 从墙旁掠过 ⇒ 未阻挡');
}

// ============================================================
section('③ 负向口径：实体不是地形，非阻断 tier 不算阻挡');

{
  // 正前方只站一辆车（空场，无任何掩体）——探测必须说「能走」
  clearCovers();
  const t = mkTank({ x: 0, y: 0, hullAngle: 0 });
  const r = CV.probeMoveBlocked(t, 0, 200);
  ok(r.blocked === false, '空场（正前方只有实体）⇒ 未阻挡');

  // 源码形状护栏：剥注释后函数体内不得出现 entities / spawnBlockedWhy
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'tank_cover.js'), 'utf8');
  const body = src.slice(src.indexOf('function probeMoveBlocked'), src.indexOf('function probeCellPassable'));
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok(!/entities/.test(code), 'probeMoveBlocked 源码（剥注释）不引用 entities');
  ok(!/spawnBlockedWhy/.test(code), 'probeMoveBlocked 源码（剥注释）不引用 spawnBlockedWhy');
  ok(code.length > 200, `源码形状断言非空转（函数体 ${code.length} 字符）`);
}

{
  // 非阻断 tier 逐个验：灌木 / 水 / 烂泥 / 可碾树 / 桥 / 倒树
  const cases = ['bush', 'water', 'river', 'mud', 'tree', 'bridge', 'fallen', 'stump', 'rubble'];
  const leaked = [];
  for (const name of cases) {
    clearCovers();
    addCover({ x: 150, y: 0, w: 60, h: 200, tier: name });
    const r = CV.probeMoveBlocked(mkTank({ x: 0, y: 0 }), 0, 200);
    if (r.blocked) leaked.push(`${name}(tier=${r.tier})`);
  }
  ok(leaked.length === 0, `非阻断 tier 全部不触发阻挡（${cases.join(' / ')}）`
    + (leaked.length ? `（误判：${leaked.join(', ')}）` : ''));
}

// ============================================================
section('④ 不写实体字段 + 边界输入');

{
  clearCovers();
  addCover({ x: 200, y: 0, w: 40, h: 200, tier: 'wall' });
  const t = mkTank({ x: 0, y: 0, hullAngle: 0, speed: 100 });
  const before = JSON.stringify(t);
  CV.probeMoveBlocked(t, 0, 200);
  ok(JSON.stringify(t) === before, '调用后实体字段逐字节不变（纯查询）');

  const noArg = CV.probeMoveBlocked(null, 0, 100);
  ok(noArg.blocked === false, '入参为 null ⇒ 安全返回未阻挡');
  const nan = CV.probeMoveBlocked({ x: NaN, y: 0 }, 0, 100);
  ok(nan.blocked === false, '坐标为 NaN ⇒ 安全返回未阻挡');
  const zero = CV.probeMoveBlocked(t, 0, 0);
  ok(zero.blocked === false && zero.hitDist === 0, 'dist=0 ⇒ 未阻挡且 hitDist=0');
  const noDim = CV.probeMoveBlocked({ x: 0, y: 0 }, 0, 200);
  ok(noDim.blocked === true, '缺 hullLen/hullWid/hullAngle ⇒ 走缺省尺寸仍能命中（不是静默 false）');
}

// ============================================================
section('⑤ 栅格同口径：probeCellPassable 与「车摆格心再探测」一致');

{
  clearCovers();
  addCover({ x: 200, y: 0, w: 40, h: 200, tier: 'wall' });
  const r = CV.tankQueryRadius(mkTank({}));

  const inside = CV.probeCellPassable(200, 0, r);
  ok(inside.passable === false && inside.cost === Infinity,
    `格心压在墙上 ⇒ 不可通行（cost=Infinity, tier=${inside.tier}）`);

  const open = CV.probeCellPassable(0, 0, r);
  ok(open.passable === true && open.cost === 1, `空旷格 ⇒ 可通行 cost=1`);

  // 贴墙带：格心在墙面外 margin 内、但车体本身放得下
  const margin = Math.max(8, r * 0.35);
  const tightX = 180 - r - margin * 0.5;
  const tight = CV.probeCellPassable(tightX, 0, r);
  ok(tight.passable === true && tight.cost > 1,
    `贴墙格（格心距墙面 ${(180 - tightX).toFixed(1)}px < r+margin）⇒ 可通行但加价（cost=${tight.cost}）`);

  // 与单点探测同口径：不可通行 ⇔ 把车摆在格心会被判定阻挡
  const parity = [];
  for (const [cx, cy] of [[0, 0], [200, 0], [150, 0], [400, 0], [200, 400]]) {
    const cell = CV.probeCellPassable(cx, cy, r);
    const t = mkTank({ x: cx, y: cy, hullAngle: 0 });
    const blockedAtSpot = CV.probeMoveBlocked(t, 0, 1).blocked;   // 1px 探测≈当前位置是否已压住
    parity.push({ cx, cy, cell: cell.passable, probe: !blockedAtSpot });
  }
  const mismatch = parity.filter(p => p.cell !== p.probe);
  ok(mismatch.length === 0,
    `5 个采样点两种口径结论一致` + (mismatch.length ? `（不一致：${JSON.stringify(mismatch)}）` : ''));
  ok(parity.some(p => !p.cell) && parity.some(p => p.cell),
    `对照非空转（不可通行 ${parity.filter(p => !p.cell).length} / 可通行 ${parity.filter(p => p.cell).length}）`);
}

// ============================================================
clearCovers();
console.log(`\n=== test-cover-probe: ${fails === 0 ? 'ALL PASS' : fails + ' FAILED'} ===`);
if (fails > 0) process.exitCode = 1;
