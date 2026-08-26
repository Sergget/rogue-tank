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
// 全形面序与 buildFullFaces 一致（与 buildFullVerts 索引对齐）：
//   hull   [41.5,0]→[32,-19] front / [32,-19]→[-32,-19] side / [-32,-19]→[-32,19] rear /
//          [-32,19]→[32,19] side / [32,19]→[41.5,0] front
//   turret [16.15,-14.76]→[0.85,-17.28] front / →[-16.15,-16.56] side / rear 接缝 /
//          镜像 side / 镜像 front / [16.15,14.76]→[16.15,-14.76] front
const HULL_V = H.buildFullVerts(H.defaultHull().half);
const TURRET_V = H.buildFullVerts(H.defaultTurret().half);
const HULL_F = ['front','side','rear','side','front'];
const TURRET_F = ['front','side','rear','side','front','front'];
function mockTank(over){
  return Object.assign({
    x:0, y:0, hullAngle:0, turretAngle:0,
    hullLen:64, hullWid:38, turLen:34, turWid:36,
    hullSpec:{ verts: HULL_V.map(v=>v.slice()), faces: HULL_F.slice() },
    turretSpec:{ verts: TURRET_V.map(v=>v.slice()), faces: TURRET_F.slice() },
    turretPivotOffset:{ dx:8, dy:0 },
    turretAxis:{ dx:0, dy:0 },
    modules:null
  }, over);
}

// ---- ISSUES #18 体内发射 → 恢复进入边（raycastTank）----
// 坦克紧贴时炮口（gunTip）伸入敌方车体，弹丸出生点在装甲内侧：命中面必须是炮管贯穿的
// 进入边（正面），而不是远侧出射边（后部 → 弹药架/发动机/车长、等效厚度与跳弹法线全错）。
{
  // 用户场景：弹药架模块带挂在车体后缘（后部长边 (0,-19)，len=1 → 整条后边）
  const t = mockTank({ modules: { ammo:[{ part:'hull', x:0, y:-19, len:1 }] } });
  // 中轴贴脸：炮口 (30,0) 在车体内（前缘顶点 41.5），朝车内射击 (-1,0)
  const hits = G.raycastTank(30, 0, -1, 0, t);
  const h = (hits || []).find(x => x.part === 'hull');
  ok(h && h.faceKey === 'front' && h.inside === true && h.t === 0, '体内发射: 车体命中=正面进入边（t=0 / inside）');
  ok(h && h.x > 32 && h.x <= 41.5 && Math.abs(h.y) < 1e-9, '体内发射: 命中点=前缘表面交点（非后缘）');
  // P-49：前缘命中点落入发动机段概率区——固定首抽 0.99 抽中余量（null），
  // 断言「非后部模块」语义不变（绝不判为 ammo/engine 强制模块）
  const mod = withRng(() => G.moduleFromHit(t, h), 7, 0.99);
  ok(!mod || (mod.key !== 'ammo' && mod.key !== 'engine'), `正面贴脸模块=非后部模块或余量 null（实际 ${mod && mod.key}）`);
  ok(hits && hits.every(x => x.faceKey === 'front'), '体内发射: 全部命中面均为 front（无后部面）');
  // 预测面板（bestHitForPref 整条射线）与实弹逐帧（shellPartHit）同源：
  // 'hull' 强制车体进入边；'auto'/'turret' 可因炮塔优先选中射线前方的炮塔正面
  // （同为 front，绝不落回后部出射边）。
  for(const pref of ['auto','turret','hull']){
    const bh = G.bestHitForPref(hits, 0.001, Infinity, pref);
    ok(bh && bh.faceKey === 'front', `体内发射: bestHitForPref(${pref}) 命中面为 front（非后部）`);
    const sh = G.shellPartHit(hits, 8, pref);
    ok(sh && sh.faceKey === 'front', `体内发射: shellPartHit(${pref}) 首帧命中面为 front（非后部）`);
  }
  {
    const bh = G.bestHitForPref(hits, 0.001, Infinity, 'hull');
    ok(bh && bh.inside === true && bh.t === 0, '体内发射: pref=hull 强制选中车体进入边（t=0）');
  }
  // 外部发射行为不变（回归）：2 条命中、无 inside 标记
  const ext = G.raycastTank(-100, 0, 1, 0, t);
  ok(ext && ext.length === 2 && ext.every(x => !x.inside), '外部射线: 2 条命中且全部无 inside 标记');
  // 跳弹后贴面外飞/切向掠开：原点在表面但已离开 → 不得再触发体内命中
  const away = G.raycastTank(41.5, 0, 1, 0, t);
  ok(away === null || away.every(x => !x.inside), '跳弹后贴面外飞: 无体内命中（可继续飞行）');
  const graze = G.raycastTank(41.5, 0, 0, 1, t);
  ok(graze === null || graze.every(x => !x.inside), '跳弹后贴面切向: 无体内命中');
  // 目标在射线反向延伸处：不得误判体内
  ok(G.raycastTank(100, 0, 1, 0, t) === null, '目标在身后: 无命中（不误判体内）');
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

// ================= P-49 moduleFromHit：几何分区 + 概率抽取（RULES.modules.zonesV2） =================
// 固定 LCG 替换全局 Math.random（与 tank_sim 回放同通道——moduleFromHit 的随机源即全局 Math.random）。
// firstVal：首抽指定值，用于精确断言累积抽样分支边界；缺省走纯 seed 流。
function withRng(fn, seed, firstVal){
  let s = (seed >>> 0) || 1;
  const orig = Math.random;
  let n = 0;
  Math.random = function(){
    if(n++ === 0 && firstVal !== undefined) return firstVal;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  try { return fn(); } finally { Math.random = orig; }
}
const TUR_C = G.polyCentroidLocal(TURRET_V);
const HUL_C = G.polyCentroidLocal(HULL_V);
// 炮塔命中点构造：pivot(8,0)，tank 在原点、角度 0 → rel = hit - pivot，再减 centroid 得分区局部坐标
function turHit(lx, ly){
  return { part:'turret', faceKey:'side', x: 8 + TUR_C.x + lx, y: TUR_C.y + ly };
}
{
  const t = mockTank({});
  // 左前区（lx>0, ly<0）：{gunner:0.50, breech:0.05}
  let r = withRng(() => G.moduleFromHit(t, turHit(12, -14)), 11, 0.0);
  ok(r && r.key==='gunner' && r.label==='炮手', 'P-49 炮塔左前: r<0.50 -> gunner');
  r = withRng(() => G.moduleFromHit(t, turHit(12, -14)), 11, 0.52);
  ok(r && r.key==='breech' && r.label==='炮闩', 'P-49 炮塔左前: 0.50≤r<0.55 -> breech');
  // 右前区：{commander:0.30, loader:0.30, breech:0.05}
  r = withRng(() => G.moduleFromHit(t, turHit(12, 14)), 11, 0.0);
  ok(r && r.key==='commander', 'P-49 炮塔右前: r<0.30 -> commander');
  r = withRng(() => G.moduleFromHit(t, turHit(12, 14)), 11, 0.35);
  ok(r && r.key==='loader', 'P-49 炮塔右前: 0.30≤r<0.60 -> loader');
  r = withRng(() => G.moduleFromHit(t, turHit(12, 14)), 11, 0.62);
  ok(r && r.key==='breech', 'P-49 炮塔右前: 0.60≤r<0.65 -> breech');
  // 左/右后区：{ammo:0.50}，余量 0.5 -> null
  r = withRng(() => G.moduleFromHit(t, turHit(-12, -14)), 11, 0.0);
  ok(r && r.key==='ammo', 'P-49 炮塔左后: r<0.50 -> ammo');
  r = withRng(() => G.moduleFromHit(t, turHit(-12, 14)), 11, 0.6);
  ok(r === null, 'P-49 炮塔右后: r≥权和 -> null（正常结算无加成）');
  // 象限随炮塔旋转：turretAngle=π 时同一世界点象限翻转
  const tRot = mockTank({ turretAngle: Math.PI });
  r = withRng(() => G.moduleFromHit(tRot, { part:'turret', faceKey:'side', x: -(8 + TUR_C.x + 12), y: -(TUR_C.y - 14) }), 11, 0.0);
  ok(r && r.key==='gunner', 'P-49 象限随炮塔旋转（turretAngle=π 对称点仍左前 -> gunner）');

  // 统计抽样：固定 seed 下 N 次左前区命中分布近似 50/5/45
  const N = 4000;
  let cntG=0, cntB=0, cntNull=0;
  withRng(() => {
    for(let i=0;i<N;i++){
      const m = G.moduleFromHit(t, turHit(12, -14));
      if(!m) cntNull++; else if(m.key==='gunner') cntG++; else if(m.key==='breech') cntB++;
    }
  }, 20260826);
  ok(Math.abs(cntG/N - 0.50) < 0.04 && Math.abs(cntB/N - 0.05) < 0.02 && Math.abs(cntNull/N - 0.45) < 0.04,
    `P-49 左前区抽样 N=${N}: gunner ${(cntG/N*100).toFixed(1)}% / breech ${(cntB/N*100).toFixed(1)}% / 余量 ${(cntNull/N*100).toFixed(1)}% ≈ 50/5/45`);

  // ---- 车体纵轴区段（默认 turretPivotOffset dx=8 > hull centroid x → 前置构型）----
  ok(HUL_C.x < 8, `P-49 构型前提: 座圈(8) 在车体 centroid(${HUL_C.x.toFixed(2)}) 前 -> 前置`);
  function hullHit(relX, relY, faceKey){ return { part:'hull', faceKey: faceKey||'side', x: relX, y: relY }; }
  // 车体纵轴投影范围 [-32, 41.5]，range=73.5，t=(maxX−x)/range（0=车头=+x 端，同 engineLocalX「+x 为前」约定）；
  // 驾驶员段 [0,0.1) 需 x>34.15 → 只能经正面面命中（侧面 |x|≤24.96 已被履带区外限覆盖不到）
  r = withRng(() => G.moduleFromHit(t, hullHit(38, 0, 'front')), 11, 0.05);
  ok(r && r.key==='driver', 'P-49 前置车体 [0,0.1): 抽中 driver（0.10）');
  r = withRng(() => G.moduleFromHit(t, hullHit(38, 0, 'front')), 11, 0.15);
  ok(r && r.key==='ammo', 'P-49 前置车体 [0,0.1): 抽中 ammo（0.10）');
  r = withRng(() => G.moduleFromHit(t, hullHit(38, 0, 'front')), 11, 0.9);
  ok(r === null, 'P-49 前置车体 [0,0.1): r≥0.20 -> null 余量');
  // 弹药段 [0.1,0.5)：x=12 → t≈0.401
  r = withRng(() => G.moduleFromHit(t, hullHit(12, -10)), 11, 0.2);
  ok(r && r.key==='ammo', 'P-49 前置车体 [0.1,0.5): -> ammo');
  // 发动机段 [0.5,1]（车尾 −x 半段）：x=-20 → t≈0.837
  r = withRng(() => G.moduleFromHit(t, hullHit(-20, 0)), 11, 0.1);
  ok(r && r.key==='engine', 'P-49 前置车体 [0.5,1]: -> engine');
  r = withRng(() => G.moduleFromHit(t, hullHit(-20, 0)), 11, 0.9);
  ok(r === null, 'P-49 前置车体 [0.5,1]: r≥0.40 -> null 余量');
  r = withRng(() => G.moduleFromHit(t, hullHit(30, 0)), 11, 0.1);
  ok(r && r.key==='track', 'P-49 前置车体 x=30 侧面命中被自动履带区截获（先于概率分区）');
  // 自动履带区保留（先于概率分区）：车体极前/极后端恒 track
  ok(G.moduleFromHit(t, hullHit(-25, 0)) && G.moduleFromHit(t, hullHit(-25, 0)).key==='track', 'P-49 自动履带区保留: 极后端 -> track');
  ok(withRng(()=>G.moduleFromHit(t, hullHit(25, 0)), 11, 0.9).key === 'track', 'P-49 自动履带区保留: 极前端 -> track');

  // ---- 后置构型（turretPivotOffset dx=-20 < centroid x）----
  const tRear = mockTank({ turretPivotOffset:{ dx:-20, dy:0 } });
  r = withRng(() => G.moduleFromHit(tRear, hullHit(20, 0)), 11, 0.1);
  ok(r && r.key==='engine', 'P-49 后置车体 [0,0.5): -> engine');
  r = withRng(() => G.moduleFromHit(tRear, hullHit(0, 0)), 11, 0.02);
  ok(r && r.key==='driver', 'P-49 后置车体 [0.5,0.6): 抽中 driver（0.05）');
  r = withRng(() => G.moduleFromHit(tRear, hullHit(0, 0)), 11, 0.3);
  ok(r && r.key==='ammo', 'P-49 后置车体 [0.5,0.6): 抽中 ammo（0.50）');
  r = withRng(() => G.moduleFromHit(tRear, hullHit(0, 0)), 11, 0.9);
  ok(r === null, 'P-49 后置车体 [0.5,0.6): r≥0.55 -> null 余量');
  r = withRng(() => G.moduleFromHit(tRear, hullHit(-20, 0)), 11, 0.1);
  ok(r && r.key==='ammo', 'P-49 后置车体 [0.6,1]: -> ammo（0.40）');

  // ---- 旧 json 自定义 modules 挂载数据：忽略不再消费（不报错、不影响分区）----
  const tLegacy = mockTank({ modules: { ammo:[{ part:'hull', x:0, y:-19, len:1 }], gunner:[{ part:'turret', x:8.5, y:-16.02, len:1 }] } });
  r = withRng(() => G.moduleFromHit(tLegacy, hullHit(12, -10)), 11, 0.2);
  ok(r && r.key==='ammo', 'P-49 旧挂载数据忽略: 车体段位照常概率分区');
  r = withRng(() => G.moduleFromHit(tLegacy, turHit(12, -14)), 11, 0.0);
  ok(r && r.key==='gunner', 'P-49 旧挂载数据忽略: 炮塔照常象限概率（非挂载强制）');
}

// ---- P-49 applyModuleDamage：概率余量（null）正常结算 + breech debuff 施加 ----
{
  const PHYS = require('../js/tank_physics.js');
  global.RULES.modules.zonesV2; // 触达即校验存在
  global.moduleFromHit = G.moduleFromHit; // applyModuleDamage 以全局引用调用（本文件其余处走 G.* 命名空间）
  global.moduleLabelOf = G.moduleLabelOf;
  global.moduleMult = require('../js/tank_model.js').moduleMult;
  global.setDebuff = require('../js/tank_model.js').setDebuff;
  const target = { hp:1000, maxHp:1000, debuffs:{}, invuln:false, invulnT:0, team:'enemy',
                   x:0, y:0, hullAngle:0, turretAngle:0, hullLen:64, hullWid:38, turLen:34, turWid:36,
                   hullSpec:{ verts: HULL_V.map(v=>v.slice()), faces: HULL_F.slice() },
                   turretSpec:{ verts: TURRET_V.map(v=>v.slice()), faces: TURRET_F.slice() },
                   turretPivotOffset:{ dx:8, dy:0 }, stats:{} };
  const shell = { dmg: 100, shooter: { team:'player', stats:{} }, ammoKey:'ap' };
  // 余量（null）：无 debuff、伤害=基础整数抖动域内、文本无模块名
  const resNull = withRng(() => PHYS.applyModuleDamage(shell, Object.assign({}, target, {hp:1000}), turHit(-12, 14), {}), 5, 0.99);
  ok(resNull.cls==='PEN' && resNull.text.indexOf('命中') < 0 && !target.debuffs.breech,
    'P-49 applyModuleDamage 余量: 正常结算、无模块文本');
  // breech 分支：debuff 施加 + 文本
  const tgt2 = Object.assign({}, target, { hp:1000, debuffs:{} });
  const resBr = withRng(() => PHYS.applyModuleDamage(shell, tgt2, turHit(12, -14), {}), 5, 0.51);
  ok(resBr.text.indexOf('炮闩') >= 0 && tgt2.debuffs.breech === RULES.modules.debuffSeconds,
    'P-49 applyModuleDamage: breech 命中施加无法开火 debuff（8s）');
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