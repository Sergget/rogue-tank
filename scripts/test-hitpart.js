// P-01 命中部位意图（鼠标径向）的 Node 测试：aimPartPreference 死区判定 + bestHitForPref 取舍。
// Run: node scripts/test-hitpart.js
'use strict';

const U = require('../js/tank_utils.js');
const H = require('../js/tank_halfgeom.js');
const RULES_MOD = require('../js/tank_rules.js');
global.norm = U.norm;
global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect;
global.partCorners = U.partCorners;
global.partEdges = U.partEdges;
global.reflectDir = U.reflectDir;
global.distToSegment = U.distToSegment;
global.RULES = RULES_MOD.RULES;
const G = require('../js/tank_geometry.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const MARGIN = 12;
// 水平射线：(0,0) 沿 (1,0)；hull 命中 t=100、turret 命中 t=120
const HITS = [
  { part:'hull',   t:100, x:100, y:0 },
  { part:'turret', t:120, x:120, y:0 }
];

// ---- aimPartPreference：死区边界（> +12 → turret；< -12 → hull；含等号在内 → auto）
ok(G.aimPartPreference(0,0, 1,0, 150, 0, HITS, MARGIN) === 'turret', 'mouse far ahead -> turret');
ok(G.aimPartPreference(0,0, 1,0, 50,  0, HITS, MARGIN) === 'hull', 'mouse short of target -> hull');
ok(G.aimPartPreference(0,0, 1,0, 112, 0, HITS, MARGIN) === 'auto', 'boundary tNear+margin -> auto');
ok(G.aimPartPreference(0,0, 1,0, 88,  0, HITS, MARGIN) === 'auto', 'boundary tNear-margin -> auto');
ok(G.aimPartPreference(0,0, 1,0, 105, 0, HITS, MARGIN) === 'auto', 'inside dead band -> auto');
ok(G.aimPartPreference(0,0, 1,0, 0, 30, HITS, MARGIN) === 'hull', 'off-axis y adds nothing to mt (0 -> hull)');
ok(G.aimPartPreference(0,0, 1,0, 200, 30, HITS, MARGIN) === 'turret', 'off-axis far ahead -> turret');
ok(G.aimPartPreference(0,0, 1,0, 30, -20, HITS, MARGIN) === 'hull', 'off-axis near -> hull');
ok(G.aimPartPreference(0,0, 1,0, 105, 0, null, MARGIN) === 'auto', 'no hits -> auto');
ok(G.aimPartPreference(0,0, 1,0, 105, 0, [], MARGIN) === 'auto', 'empty hits -> auto');
ok(G.aimPartPreference(0,0, 1,0, 105, 0, [{ part:'hull', t:Infinity }], MARGIN) === 'auto', 'infinite t only -> auto');

// ---- bestHitForPref：'hull' 取车体、'turret'/'auto'/未知 取炮塔优先，minT/maxT 窗口与 bestTankHit 一致
ok(G.bestHitForPref(HITS, 0.001, Infinity, 'hull').part === 'hull', "pref hull -> hull hit");
ok(G.bestHitForPref(HITS, 0.001, Infinity, 'turret').part === 'turret', "pref turret -> turret hit");
ok(G.bestHitForPref(HITS, 0.001, Infinity, 'auto').part === 'turret', "pref auto keeps turret-first default");
ok(G.bestHitForPref(HITS, 0.001, Infinity, '???').part === 'turret', "unknown pref keeps default");
ok(G.bestHitForPref(HITS, 0.001, Infinity, 'auto').t === G.bestTankHit(HITS, 0.001, Infinity).t, "auto == bestTankHit parity");
ok(G.bestHitForPref(HITS, 0.001, Infinity, 'hull').t === 100, 'hull pref picks t=100');
ok(G.bestHitForPref(HITS, 101, 119, 'turret') === null, 'window excludes both -> null');
ok(G.bestHitForPref(HITS, 101, 125, 'hull').part === 'turret', 'turret-only in window: hull pref falls back');
ok(G.bestHitForPref(HITS, 50, 110, 'hull').t === 100, 'window keeps hull only -> falls back to hull');
ok(G.bestHitForPref([{part:'turret', t:80}], 0.001, Infinity, 'hull').part === 'turret', 'turret-only: hull pref falls back');
ok(G.bestHitForPref([{part:'hull', t:80}], 0.001, Infinity, 'turret').part === 'hull', 'hull-only: turret pref falls back');
ok(G.bestHitForPref(null, 0.001, Infinity, 'auto') === null, 'null hits -> null');
ok(G.bestHitForPref([], 0.001, Infinity, 'auto') === null, 'empty hits -> null');

// ---- shellPartHit：实弹逐帧判定（ISSUES #14 回归）----
// 正对入射几何：车体面 t=0.5 先入窗，炮塔面 t=17.8 在窗外（120Hz step=10 场景）
const WINDOW_HITS = [
  { part:'hull',   t:0.5, x:100, y:0 },
  { part:'turret', t:17.8, x:117, y:0 }
];
ok(G.shellPartHit(WINDOW_HITS, 10, 'turret') && G.shellPartHit(WINDOW_HITS, 10, 'turret').part === 'turret', 'turret pref pierces window (regression: 窗外炮塔面仍按意图命中)');
ok(G.shellPartHit(WINDOW_HITS, 10, 'hull') && G.shellPartHit(WINDOW_HITS, 10, 'hull').part === 'hull', 'hull pref -> hull');
ok(G.shellPartHit(WINDOW_HITS, 10, 'auto') && G.shellPartHit(WINDOW_HITS, 10, 'auto').part === 'hull', 'auto keeps window semantics (turret outside -> nearest hull)');
ok(G.shellPartHit(WINDOW_HITS, 25, 'auto') && G.shellPartHit(WINDOW_HITS, 25, 'auto').part === 'turret', 'auto: turret inside window -> turret priority');
ok(G.shellPartHit(WINDOW_HITS, 25, 'turret').t === 17.8, 'turret pref with both in window -> turret@17.8');
ok(G.shellPartHit(WINDOW_HITS, 0.2, 'turret') === null, 'no contact this frame -> null');
ok(G.shellPartHit([{ part:'hull', t:0.5 }], 10, 'turret').part === 'hull', 'hull-only ray: turret pref falls back to hull');
ok(G.shellPartHit(null, 10, 'auto') === null, 'null hits -> null');
ok(G.shellPartHit([], 10, 'auto') === null, 'empty hits -> null');
ok(G.shellPartHit([{ part:'turret', t:999 }], 10, 'turret') === null, 'distant-only hits (no contact) -> null');

// ================= 线段挂载模块系统（设计器「模块 Modules」编辑） =================
// 默认形状的作者帧（= 居中帧；turret axis 恒 0 时 == 战斗帧）：
//   hull 半形链边0 = [41.5,0]→[32,-19]（前斜边，中点 (36.75,-9.5)）
//        半形链边1 = [32,-19]→[-32,-19]（后部长边，中点 (0,-19)）
//   turret 半形链边0 = [16.15,-14.76]→[0.85,-17.28]（前侧边，中点 (8.5,-16.02)）
// 数据格式：扁平 { key: [ { part, x, y, len, off, mirror }, ... ] }（可多放置）
const HULL_V = H.buildFullVerts(H.defaultHull().half);
const TURRET_V = H.buildFullVerts(H.defaultTurret().half);
const HULL_F = ['front','front','side','rear','side'];
function mockTank(over){
  return Object.assign({
    x:0, y:0, hullAngle:0, turretAngle:0,
    hullLen:64, hullWid:38, turLen:34, turWid:36,
    hullSpec:{ verts: HULL_V.map(v=>v.slice()), faces: HULL_F.slice() },
    turretSpec:{ verts: TURRET_V.map(v=>v.slice()), faces: HULL_F.slice() },
    turretPivotOffset:{ dx:8, dy:0 },
    turretAxis:{ dx:0, dy:0 },
    modules:null
  }, over);
}

// ---- normalizeTankModules：扁平结构清洗 + 旧 v2 格式迁移 ----
ok(G.normalizeTankModules(null) === null, 'normalize(null) -> null');
ok(G.normalizeTankModules(undefined) === null, 'normalize(undefined) -> null');
ok(G.normalizeTankModules('x') === null, 'normalize(non-object) -> null');
{
  const n = G.normalizeTankModules({});
  ok(n === null, 'normalize({}) -> null（无任何放置）');
}
{
  const n = G.normalizeTankModules({ foo:[{ part:'hull', x:1, y:2, len:0.5 }] });
  ok(n === null, 'normalize 丢弃未知键');
}
{
  const n = G.normalizeTankModules({ driver:[{ part:'hull', x:NaN, y:0, len:0.5 }] });
  ok(n === null, 'normalize 丢弃非法数值');
}
{
  const n = G.normalizeTankModules({ driver:[
    { part:'hull', x:1.234, y:-6.5, len:0.5, off:0.1, mirror:false },
    { part:'turret', x:8.5, y:-16.02, len:3 }
  ] });
  ok(n.driver.length === 2, 'normalize 保留多放置');
  ok(n.driver[0].x === 1.2 && n.driver[0].y === -6.5, 'normalize x/y 0.1 取整');
  ok(n.driver[0].off === 0.1 && n.driver[0].mirror === false, 'normalize off/mirror 原样保留');
  ok(n.driver[1].len === 1 && n.driver[1].off === 0 && n.driver[1].mirror === true, 'normalize len 上钳制到 1 / off 默认 0 / mirror 默认 true');
}
{
  const n = G.normalizeTankModules({ driver:[{ part:'hull', x:0, y:0, len:0.01 }] });
  ok(n.driver[0].len >= RULES_MOD.RULES.modules.lenMin, 'normalize len 下钳制到 lenMin');
}
{
  // 旧 v2 格式迁移：{hull:{key:{x,y,len}}, turret:{...}} → 扁平放置（off=0, mirror=true, part 继承）
  const n = G.normalizeTankModules({
    hull:{ driver:{ x:0, y:-19, len:0.5 }, ammo:{ x:0, y:-19, len:1 } },
    turret:{ gunner:{ x:8.5, y:-16.02, len:0.5 }, ammo:{ x:8.5, y:-16.02, len:0.5 } }
  });
  ok(n && n.driver && n.driver.length===1 && n.driver[0].part==='hull' && n.driver[0].off===0 && n.driver[0].mirror===true, 'v2 迁移: driver 单放置 (off=0/mirror=true)');
  ok(n.ammo.length === 2 && n.ammo[0].part==='hull' && n.ammo[1].part==='turret', 'v2 迁移: ammo 双放置 (hull+turret)');
  ok(n.gunner.length === 1 && n.gunner[0].part==='turret', 'v2 迁移: gunner');
  ok(n.engine === undefined && n.track === undefined, 'v2 迁移: 未挂载键不出现');
}
{
  // 新扁平键存在时，混入的 v2 分区对象不触发迁移
  const n = G.normalizeTankModules({ driver:[{ part:'hull', x:0, y:-19, len:0.5 }], hull:{ gunner:{ x:1, y:2, len:0.5 } } });
  ok(n && n.driver && n.driver.length===1 && !n.gunner, '扁平键优先: 忽略混入的 v2 分区');
}

// ---- 带形集合 findModuleBands：主边 + 可选镜像伙伴；off 偏移 ----
{
  // 车体后部长边 (0,-19)，len 0.5 → 带 x∈[-16,16]（边 64px 中央 50%），主边 + 镜像边各一条
  const bands = G.findModuleBands(HULL_V, { x:0, y:-19, len:0.5 }, { dx:0, dy:0 }, 10);
  ok(bands.length === 2, 'findModuleBands: 主边+镜像边共 2 条带');
  ok(G.pointInQuad(0, -19, bands[0]), '带内命中: 边中点');
  ok(!G.pointInQuad(30, -19, bands[0]), 'len 覆盖段外不命中 (x=30)');
  ok(G.pointInQuad(-16, -19, bands[0]) && !G.pointInQuad(-17, -19, bands[0]), 'len=0.5 覆盖 [−16,16] 边界');
}
{
  // 镜像侧：挂主边 (36.75,-9.5) 的模块，镜像边 (36.75,+9.5) 也有带
  const bands = G.findModuleBands(HULL_V, { x:36.75, y:-9.5, len:0.5 }, { dx:0, dy:0 }, 10);
  ok(bands.length === 2, '前斜边模块: 主边+镜像 2 条带');
  let hasMirror = false;
  for(const q of bands){ for(const [vx,vy] of q){ if(vx>35 && vy>0) hasMirror = true; } }
  ok(hasMirror, '镜像侧带存在 (y>0)');
}
{
  // mirror=false → 仅主边 1 条带
  const bands = G.findModuleBands(HULL_V, { x:36.75, y:-9.5, len:0.5, mirror:false }, { dx:0, dy:0 }, 10);
  ok(bands.length === 1, 'mirror=false: 仅主边 1 条带');
}
{
  // 左/右两侧同构：y>0 放置（左前斜边）直接匹配其所在边，镜像侧无带（不跳边）
  const bandsL = G.findModuleBands(HULL_V, { x:36.75, y:9.5, len:0.5, mirror:false }, { dx:0, dy:0 }, 10);
  ok(bandsL.length === 1, 'y>0 单侧放置: 仅 1 条带');
  let onLeft = false, onRight = false;
  for(const [vx,vy] of bandsL[0]){
    if(vx>35 && vy>0) onLeft = true;
    if(vx>35 && vy<0) onRight = true;
  }
  ok(onLeft && !onRight, 'y>0 单侧放置: 带在 y>0 侧（直接匹配优先，不跳边）');
  const bandsR = G.findModuleBands(HULL_V, { x:36.75, y:-9.5, len:0.5, mirror:false }, { dx:0, dy:0 }, 10);
  let onR = false;
  for(const [vx,vy] of bandsR[0]){ if(vx>35 && vy<0) onR = true; }
  ok(onR, 'y<0 单侧放置: 带在 y<0 侧');
}
{
  // off 偏移（边 A=[32,-19]→B=[-32,-19]）：off=+0.25 → 带中心 t=0.75，覆盖 t∈[0.5,1] → x∈[-32,0]
  const bands = G.findModuleBands(HULL_V, { x:0, y:-19, len:0.5, off:0.25 }, { dx:0, dy:0 }, 10);
  ok(bands.length === 2, 'off 放置仍生成 2 条带');
  ok(G.pointInQuad(-16, -19, bands[0]) && G.pointInQuad(0, -19, bands[0]), 'off=+0.25: 覆盖后移 (x∈[-32,0])');
  ok(!G.pointInQuad(17, -19, bands[0]), 'off=+0.25: 前段不再覆盖 (x=17)');
  const bands2 = G.findModuleBands(HULL_V, { x:0, y:-19, len:0.5, off:-0.25 }, { dx:0, dy:0 }, 10);
  ok(G.pointInQuad(16, -19, bands2[0]) && !G.pointInQuad(-17, -19, bands2[0]), 'off=-0.25: 覆盖前移 (x∈[0,32])');
  // 镜像伙伴带 = 主带沿 y=0 轴的真镜像：off=+0.25 时主带中心 (-16,-19)，伙伴带中心必须是
  // (-16,19)（覆盖 x∈[-32,0]），而不是随同向偏移成"中心对称"的 (16,19)
  const pm = [(bands[1][0][0]+bands[1][1][0])/2, (bands[1][0][1]+bands[1][1][1])/2];
  ok(Math.abs(pm[0]-(-16)) < 1e-6 && Math.abs(pm[1]-19) < 1e-6, 'off=+0.25: 镜像带中心 = (-16,19)（真镜像，不中心对称）');
  ok(G.pointInQuad(-16, 19, bands[1]) && !G.pointInQuad(16, 19, bands[1]), 'off=+0.25: 镜像带覆盖 x∈[-32,0]（y=19 侧）');
}
{
  // 无效模块 → 空
  ok(G.findModuleBands(HULL_V, null, { dx:0, dy:0 }, 10).length === 0, 'findModuleBands(null) -> []');
  ok(G.findModuleBands(HULL_V, { x:999, y:999, len:0.5 }, { dx:0, dy:0 }, 10).length === 0, '找不到边 -> []');
}

// ---- moduleFromHit：新扁平模块数据路径 ----
{
  const t = mockTank({ modules: { driver:[{ part:'hull', x:0, y:-19, len:0.5 }] } });
  let r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-10, y:-19, edgeName:'side' });
  ok(r && r.key==='driver', '车体模块带命中 -> driver');
  // 镜像侧命中（世界 +y 侧边）
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-10, y:19, edgeName:'side' });
  ok(r && r.key==='driver', '镜像侧命中 -> 同一模块');
  // len 覆盖段外 → 结构性 fallback（x=20 在履带自动区 |rx|>0.78 之外）
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:20, y:-19, edgeName:'side' });
  ok(r && r.key==='hullHull' && r.label==='车体侧装甲', 'len 覆盖段外 -> 车体侧装甲');
  // rear 未覆盖 → 发动机舱（结构性）
  r = G.moduleFromHit(t, { part:'hull', faceKey:'rear', x:-20, y:0, edgeName:'rear' });
  ok(r && r.key==='engine' && r.label==='发动机舱', '车体后部未覆盖 -> 发动机舱');
}
{
  // 同键多放置重叠：仍命中该键
  const t = mockTank({ modules: { driver:[
    { part:'hull', x:0, y:-19, len:0.5 }, { part:'hull', x:0, y:-19, len:1 }
  ] } });
  let r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-10, y:-19, edgeName:'side' });
  ok(r && r.key==='driver', '同键多放置重叠区命中 driver');
  // 不同键重叠：len 小者优先
  const t2 = mockTank({ modules: { driver:[{ part:'hull', x:0, y:-19, len:1 }], ammo:[{ part:'hull', x:0, y:-19, len:0.5 }] } });
  r = G.moduleFromHit(t2, { part:'hull', faceKey:'side', x:-10, y:-19, edgeName:'side' });
  ok(r && r.key==='ammo', '重叠区取 len 小者 (ammo 0.5)');
  // miss 区（x=-20：|rx|<0.78 履带区外、ammo 带外）→ driver
  r = G.moduleFromHit(t2, { part:'hull', faceKey:'side', x:-20, y:-19, edgeName:'side' });
  ok(r && r.key==='driver', '仅大覆盖区 -> driver');
}
{
  // off 偏移放置：带后移后原中心不命中、偏移区内命中
  const t = mockTank({ modules: { driver:[{ part:'hull', x:0, y:-19, len:0.5, off:0.25 }] } });
  let r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-16, y:-19, edgeName:'side' });
  ok(r && r.key==='driver', 'off 偏移带内命中');
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:16, y:-19, edgeName:'side' });
  ok(r && r.key==='hullHull', 'off 偏移带外 (x=16) -> 结构性');
  // off 放置的镜像侧：带在镜像位置（y=19 侧 x∈[-32,0]）命中；中心对称的旧行为会命中 (16,19)
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-16, y:19, edgeName:'side' });
  ok(r && r.key==='driver', 'off 镜像侧命中（镜像位置 (-16,19)）');
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:16, y:19, edgeName:'side' });
  ok(r && r.key==='hullHull', 'off 镜像侧带外 (x=16, y=19) -> 结构性');
}
{
  // mirror=false：单侧放置，镜像侧命中 → 结构性
  const t = mockTank({ modules: { driver:[{ part:'hull', x:0, y:-19, len:0.5, mirror:false }] } });
  let r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-10, y:-19, edgeName:'side' });
  ok(r && r.key==='driver', '单侧放置: 主侧命中 driver');
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-10, y:19, edgeName:'side' });
  ok(r && r.key==='hullHull', '单侧放置: 镜像侧 -> 车体侧装甲');
}
{
  // 履带碰撞盒自动派生（2026-08-12 设计决策：track 不再是挂载模块）：
  // 车体极前/极后端（|relX|/halfL > zones.trackBound，恒 0.78）即为履带，
  // 与是否挂载任何模块无关，无需设计器设置。
  const t = mockTank({ modules: { driver:[{ part:'hull', x:0, y:-19, len:0.5 }] } });
  let r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-25, y:0, edgeName:'side' });
  ok(r && r.key==='track', '自动履带区: 车体极后端命中 -> track（无需 track 放置）');
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:25, y:0, edgeName:'side' });
  ok(r && r.key==='track', '自动履带区: 车体极前端命中 -> track（模块带未覆盖也应履带）');
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-10, y:-14, edgeName:'side' });
  ok(r && r.key==='driver', '自动履带区外: 模块带判定照常（driver）');
}
{
  // 炮塔放置：命中点转局部帧（减 turretPivot）
  const t = mockTank({ modules: { gunner:[{ part:'turret', x:8.5, y:-16.02, len:0.5 }] } });
  const r = G.moduleFromHit(t, { part:'turret', faceKey:'side', x:16.5, y:-16.02, edgeName:'side' });
  ok(r && r.key==='gunner', '炮塔模块命中 -> gunner (pivot 偏移回推)');
  const r2 = G.moduleFromHit(t, { part:'turret', faceKey:'rear', x:-20, y:0, edgeName:'rear' });
  ok(r2 && r2.key==='turretHull', '炮塔未覆盖 -> 上部结构装甲');
}
{
  // part 过滤：hull 放置不生成炮塔带 → 炮塔无放置 → turret 走 zones 退化；hull 命中无带 → 结构性
  const t = mockTank({ modules: { gunner:[{ part:'hull', x:8.5, y:-16.02, len:0.5 }] } });
  let r = G.moduleFromHit(t, { part:'turret', faceKey:'side', x:16.5, y:-16.02, edgeName:'side' });
  ok(r && r.key==='gunner' && r.label==='炮手', 'part 过滤: hull 放置不参与 turret，走 zones');
  r = G.moduleFromHit(t, { part:'turret', faceKey:'rear', x:-20, y:0, edgeName:'rear' });
  ok(r && r.key==='commander', 'part 过滤: 炮塔后部 -> zones 车长');
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:16.5, y:-16.02, edgeName:'side' });
  ok(r && r.key==='hullHull', 'hull 放置无带命中 -> 结构性');
}
{
  // 同一模块键同时挂车体与炮塔（v2 的 hull-ammo + turret-ammo 双放置）
  const t = mockTank({ modules: { ammo:[
    { part:'hull', x:0, y:-19, len:0.5 }, { part:'turret', x:8.5, y:-16.02, len:0.5 }
  ] } });
  let r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-10, y:-19, edgeName:'side' });
  ok(r && r.key==='ammo', '混合放置: 车体命中 ammo');
  r = G.moduleFromHit(t, { part:'turret', faceKey:'side', x:16.5, y:-16.02, edgeName:'side' });
  ok(r && r.key==='ammo', '混合放置: 炮塔命中 ammo');
}
{
  // turret 轴偏移：战斗帧 = 作者帧 - axis，找边时回推 axis 匹配
  const t = mockTank({
    turretAxis:{ dx:4, dy:0 },
    turretSpec:{ verts: TURRET_V.map(([vx,vy])=>[vx-4, vy]), faces: HULL_F.slice() },
    modules: { gunner:[{ part:'turret', x:8.5, y:-16.02, len:0.5 }] }
  });
  // 命中点局部 rel = (4.5,-16.02)（战斗帧边中点）→ hit = pivot(8,0) + rel
  const r = G.moduleFromHit(t, { part:'turret', faceKey:'side', x:12.5, y:-16.02, edgeName:'side' });
  ok(r && r.key==='gunner', 'turret 轴偏移: 作者帧模块坐标经 axis 回推命中');
}

// ---- moduleFromHit：无 modules / 空对象 → zones 退化路径（行为与改动前一致） ----
{
  const t = mockTank({});  // modules:null（旧数据）
  let r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:-30, y:-10, edgeName:'side' });
  ok(r && r.key==='track', 'zones 退化: |rx|>0.78 -> 履带/负重轮');
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:10, y:-10, edgeName:'side' });
  ok(r && r.key==='driver', 'zones 退化: 前段 -> 驾驶员');
  r = G.moduleFromHit(t, { part:'hull', faceKey:'side', x:4, y:-10, edgeName:'side' });
  ok(r && r.key==='ammo', 'zones 退化: 中段 -> 弹药架');
  r = G.moduleFromHit(t, { part:'hull', faceKey:'rear', x:-20, y:0, edgeName:'rear' });
  ok(r && r.key==='engine', 'zones 退化: 后部 -> 发动机舱');
  r = G.moduleFromHit(t, { part:'turret', faceKey:'side', x:14, y:0, edgeName:'side' });
  ok(r && r.key==='gunner', 'zones 退化: 炮塔前段 -> 炮手');
  r = G.moduleFromHit(t, { part:'turret', faceKey:'rear', x:-20, y:0, edgeName:'rear' });
  ok(r && r.key==='commander', 'zones 退化: 炮塔后部 -> 车长');
  // 空对象（无已放置模块）→ 同样走 zones
  const t2 = mockTank({ modules:{ driver:[] } });
  r = G.moduleFromHit(t2, { part:'hull', faceKey:'side', x:10, y:-10, edgeName:'side' });
  ok(r && r.key==='driver', '空模块对象 -> zones 退化一致');
  // 部分挂载（只挂 hull）→ turret 仍走 zones
  const t3 = mockTank({ modules:{ driver:[{ part:'hull', x:0, y:-19, len:0.5 }] } });
  r = G.moduleFromHit(t3, { part:'turret', faceKey:'side', x:14, y:0, edgeName:'side' });
  ok(r && r.key==='gunner', '部分挂载: 未挂载部件仍走 zones');
}

// ---- 设计器模块编辑：对称轴另一侧（y>0）回归（tank_designer.html 纯逻辑复刻） ----
// 需求：模块模式下点击 y>0 侧的边可挂载新放置、点击 y>0 侧的模块带可选中、拖拽手柄正常。
// 复刻 designer 的 turretToScreen / findFullEdgeAtScreen / findModuleAtScreen / moduleLenHandles
// （modules 模式 angle=0；设计器顶点帧 = 作者帧，axis 偏移不计）。
{
  const VS = 5, EDGE_HIT_R = 8;
  const hc = { x:400, y:300 };
  const pivot = { dx:8, dy:0 };
  const turToS = pt => ({ x: hc.x + (pivot.dx + pt[0])*VS, y: hc.y + pt[1]*VS });
  const hullToS = pt => ({ x: hc.x + pt[0]*VS, y: hc.y + pt[1]*VS });
  const partVerts = part => H.buildFullVerts((part==='hull' ? H.defaultHull() : H.defaultTurret()).half);
  // 全形边命中（先炮塔再车体；含 y>0 镜像链边与前/后接缝）
  const findFullEdge = (sx, sy) => {
    const checks = [
      { part:'turret', verts: partVerts('turret'), toS: turToS },
      { part:'hull',   verts: partVerts('hull'),   toS: hullToS }
    ];
    for(const g of checks){
      if(g.verts.length < 3) continue;
      for(let i=0;i<g.verts.length;i++){
        const A = g.toS(g.verts[i]), B = g.toS(g.verts[(i+1)%g.verts.length]);
        if(U.distToSegment(sx, sy, A.x, A.y, B.x, B.y) <= EDGE_HIT_R){
          return { part:g.part, edgeIndex:i,
                   mid:{ x:(g.verts[i][0]+g.verts[(i+1)%g.verts.length][0])/2,
                         y:(g.verts[i][1]+g.verts[(i+1)%g.verts.length][1])/2 } };
        }
      }
    }
    return null;
  };
  const findModuleAtScreen = (sx, sy, mods) => {
    for(const key of RULES.modules.keys){
      const arr = mods[key] || [];
      for(let i=0;i<arr.length;i++){
        const p = arr[i];
        const bands = G.findModuleBands(partVerts(p.part), p, { dx:0, dy:0 }, RULES.modules.bandDepth[p.part]);
        for(const quad of bands){
          const sc = quad.map(([lx,ly]) => p.part==='hull' ? hullToS([lx,ly]) : turToS([lx,ly]));
          if(G.pointInQuad(sx, sy, sc.map(q=>[q.x,q.y]))) return { key, idx: i };
        }
      }
    }
    return null;
  };
  // 选中放置的手柄（直接匹配优先，保持放置侧别）
  const moduleLenHandles = p => {
    const verts = partVerts(p.part);
    let edgeIdx = -1, A = null, B = null;
    for(let pass=0; pass<2 && edgeIdx<0; pass++){
      for(let i=0;i<verts.length;i++){
        const a = verts[i], b = verts[(i+1)%verts.length];
        const mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2;
        if((pass===0 ? (Math.abs(mx-p.x)<=0.5 && Math.abs(my-p.y)<=0.5)
                     : (Math.abs(mx-p.x)<=0.5 && Math.abs(my+p.y)<=0.5))){ edgeIdx=i; A=a; B=b; break; }
      }
    }
    if(edgeIdx < 0) return null;
    const pA = p.part==='hull' ? hullToS(A) : turToS(A);
    const pB = p.part==='hull' ? hullToS(B) : turToS(B);
    const ex = pB.x-pA.x, ey = pB.y-pA.y, eLen = Math.hypot(ex,ey)||1;
    return { edge:{ ex:ex/eLen, ey:ey/eLen, len:eLen, mid:{ x:(pA.x+pB.x)/2, y:(pA.y+pB.y)/2 } },
             handles:[ {x:pA.x,y:pA.y,idx:0}, {x:(pA.x+pB.x)/2,y:(pA.y+pB.y)/2,idx:2}, {x:pB.x,y:pB.y,idx:1} ] };
  };
  // 炮塔 y>0 侧：全形边 5 = [0.85,17.28]→[16.15,14.76]，中点 (8.5,16.02)
  {
    const tp = turToS([8.5, 16.02]);
    const hit = findFullEdge(tp.x, tp.y);
    ok(hit && hit.part==='turret' && hit.mid.y > 0, '镜像侧: 点击炮塔 y>0 边可挂载（findFullEdge 命中）');
    const mods = { gunner:[ { part:hit.part, x:Math.round(hit.mid.x*10)/10, y:Math.round(hit.mid.y*10)/10, len:0.5, off:0, mirror:true } ] };
    ok(findModuleAtScreen(tp.x, tp.y, mods) !== null, '镜像侧: 炮塔 y>0 带可选中');
    const h = moduleLenHandles(mods.gunner[0]);
    ok(h && h.handles[0].y > hc.y && h.handles[2].y > hc.y, '镜像侧: 炮塔 y>0 放置手柄位于 y>0 侧');
    // 拖 A 端 (idx0) 沿边向带中心收 20px（designer modLenDrag 同款投影公式）→ len 缩短且 ≥ lenMin
    const e = h.edge, A = h.handles[0];
    const proj = ((A.x + e.ex*20) - e.mid.x)*e.ex + ((A.y + e.ey*20) - e.mid.y)*e.ey;
    const t = 0.5 + proj/e.len;
    const half = Math.max(RULES.modules.lenMin/2, Math.min(0.5, 0.5 - t));
    const len = Math.round(Math.max(RULES.modules.lenMin, Math.min(1, half*2))*100)/100;
    ok(len >= RULES.modules.lenMin && len < 0.5, `镜像侧: 炮塔 y>0 手柄拖拽可缩短 len (${len})`);
  }
  // 车体 y>0 侧：全形边 4 = [-32,19]→[32,19]，中点 (0,19)
  {
    const hp = hullToS([0, 19]);
    const hit = findFullEdge(hp.x, hp.y);
    ok(hit && hit.part==='hull' && hit.mid.y > 0, '镜像侧: 点击车体 y>0 边可挂载');
    const mods = { driver:[ { part:hit.part, x:Math.round(hit.mid.x*10)/10, y:Math.round(hit.mid.y*10)/10, len:0.5, off:0, mirror:true } ] };
    ok(findModuleAtScreen(hp.x, hp.y, mods) !== null, '镜像侧: 车体 y>0 带可选中');
    const h = moduleLenHandles(mods.driver[0]);
    ok(h && h.handles[0].y > hc.y, '镜像侧: 车体 y>0 放置手柄位于 y>0 侧');
  }
  // 车体前斜边 y>0（全形环绕段 [32,19]→[41.5,0]）中点 (36.75,9.5)
  {
    const fp = hullToS([36.75, 9.5]);
    const hit = findFullEdge(fp.x, fp.y);
    ok(hit && hit.part==='hull' && hit.mid.y > 0, '镜像侧: 车体前斜边 y>0 可挂载');
  }
}

// ---- 需求：模块长度下限降到 5%（RULES.modules.lenMin = 0.05） ----
ok(RULES.modules.lenMin === 0.05, `lenMin = 0.05（当前 ${RULES.modules.lenMin}）`);

// ---- 需求：模块只能挂在其部件类允许的边上（moduleAllowedParts，防「弹药架挂到未知部件」） ----
{
  const a = k => G.moduleAllowedParts(k);
  ok(a('track').length === 0, '允许部件: track 已非挂载模块 → []（自动履带区由规则派生）');
  ok(a('driver').length === 1 && a('driver')[0] === 'hull', '允许部件: driver → [hull]');
  ok(a('engine').length === 1 && a('engine')[0] === 'hull', '允许部件: engine → [hull]');
  ok(a('gunner').length === 1 && a('gunner')[0] === 'turret', '允许部件: gunner → [turret]');
  ok(a('loader').length === 1 && a('loader')[0] === 'turret', '允许部件: loader → [turret]');
  ok(a('commander').length === 1 && a('commander')[0] === 'turret', '允许部件: commander → [turret]');
  ok(a('ammo').length === 2 && a('ammo').indexOf('hull') >= 0 && a('ammo').indexOf('turret') >= 0, '允许部件: ammo → [hull,turret]（v2 双放置语义）');
  ok(a('unknown').length === 0, '允许部件: 未知键 → []');
  // 保存校验结构：每处放置的 part 必须 ∈ 允许列表（设计器 saveToTankList 同款纯逻辑）
  const bad = [];
  const good = { driver:[{part:'hull',x:0,y:0,len:0.5}], ammo:[{part:'hull',x:0,y:0,len:0.5},{part:'turret',x:0,y:0,len:0.5}], gunner:[{part:'turret',x:0,y:0,len:0.5}] };
  for(const key of Object.keys(good)){
    const allowed = a(key);
    for(const p of good[key]) if(!allowed.includes(p.part)) bad.push(key);
  }
  ok(bad.length === 0, '保存校验: 合法放置全部通过');
  ok(RULES.modules.keys.indexOf('track') < 0, '保存校验: track 不在模块键列表（无需挂载，6 类模块）');
}

// ---- off 边界钳制：lim 不可用 0.01 表示时（len=0.35 → lim=0.325）先舍后钳，保证 |off| ≤ (1-len)/2 ----
{
  const n1 = G.normalizeTankModules({ driver:[{ part:'hull', x:0, y:19, len:0.35, off:0.33 }] });
  ok(n1.driver[0].off === 0.32, `off 钳制: len=0.35, off=0.33 → 0.32（先舍后钳，实际 ${n1.driver[0].off}）`);
  ok(Math.abs(n1.driver[0].off) <= (1-0.35)/2 + 1e-9, 'off 钳制: 钳制后 |off| ≤ lim');
  const n2 = G.normalizeTankModules({ driver:[{ part:'hull', x:0, y:19, len:0.5, off:0.33 }] });
  ok(n2.driver[0].off === 0.25, 'off 钳制: len=0.5, off=0.33 → 0.25');
  const n3 = G.normalizeTankModules({ driver:[{ part:'hull', x:0, y:19, len:0.5, off:-0.25 }] });
  ok(n3.driver[0].off === -0.25, 'off 钳制: 合法边界值保留 (len=0.5, off=-0.25)');
  const n4 = G.normalizeTankModules({ driver:[{ part:'hull', x:0, y:19, len:1, off:0.33 }] });
  ok(n4.driver[0].off === 0, 'off 钳制: len=1 → off 恒 0');
}

console.log(fails === 0 ? '\nAll hitpart checks passed.' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);