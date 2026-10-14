'use strict';

// 掩体系数统一收口到 js/tank_rules.js（特性5）；此处仅做别名保持调用方兼容
const COVER_TIERS = RULES.coverTiers;
// distanceTier 已随 A1 双档模型移除（见 RULES.coverHugDist），不再有距离渐变
// 2026-09-20 #E3：半高掩体（half）与其 driveBy 门控已整体移除——全高掩体 = 建筑/岩石。
// 地图元素（掩体体系，见 DEVELOPMENT.md §2.7）：每个元素带运行时耐久 hp——
// hp<=0 即毁（被炮弹/碾压/HE 溅射摧毁），已毁元素从所有判定与绘制中排除。
// 树伐倒 → 倒树(fallen，横躺树干+树冠，树冠=灌木遮挡效果)；沙袋击毁 → 碎石(rubble)。
// 掩体可承载任意复杂多边形：实例带 verts（局部坐标顶点数组）时，全部角点计算
// 走 coverCorners → polyCorners；否则回退矩形 partCorners（w/h 半宽半高）。
// 类型注解 any[]：与 types/globals.d.ts 的 `declare var covers: any[]` 同口径——
// 实例在运行期被各页面/测试按需扩展字段（hp/spawn/segments/groupId/_gone…），
// 收窄成字面量联合类型会让合法 push 报 TS2353。
/** @type {any[]} */
const covers = [
  { x:470, y:300, w:80, h:34, angle:0, tier:'full' },
  { x:660, y:300, w:70, h:34, angle:0, tier:'full' },
  { x:560, y:150, w:24, h:18, angle:0, tier:'tree' },       // 树：挡路+1 发伐倒→倒树
  { x:760, y:470, w:56, h:34, angle:0, tier:'bush' },       // 灌木：靶车可开入隐藏
  { x:930, y:150, w:56, h:30, angle:0, tier:'bush' },       // 灌木（装饰）
  { x:330, y:510, w:170, h:10, angle:0, tier:'soft' },      // 栅栏：穿透即毁 / 压过即毁
  { x:450, y:180, w:64, h:28, angle:0, tier:'barricade' },  // 沙袋路障：挡 1 发
  // 复杂多边形验证实例（需求2，为后续贴图做准备）：verts 为局部坐标顶点数组，
  // w/h 仅作包围盒参考；L 形凹多边形建筑 + 六边形建筑（#E3：原六边形半高已改全高）。
  { x:250, y:650, w:90, h:60, angle:0, tier:'full',
    verts: [[-45,-30],[45,-30],[45,-10],[5,-10],[5,30],[-45,30]],
    collisionVerts: [
      [[-45,-30],[5,-30],[5,30],[-45,30]],
      [[5,-30],[45,-30],[45,-10],[5,-10]]
    ] },
  { x:700, y:650, w:80, h:50, angle:0, tier:'full',
    verts: [[-40,0],[-20,-25],[20,-25],[40,0],[20,25],[-20,25]] }
];

// 每块掩体/元素在启动时快照初始状态（耐久取 tier 默认值），resetCovers() 用于重置战场
function snapshotCovers(){
  covers.forEach(c=>{
    if(c.hp === undefined) c.hp = COVER_TIERS[c.tier].hp;
    c.spawn = { tier:c.tier, x:c.x, y:c.y, w:c.w, h:c.h, angle:c.angle, hp:c.hp,
                ...(c.verts ? { verts: c.verts.slice() } : {}),
                ...(c.collisionVerts ? { collisionVerts: c.collisionVerts.map(v => v.map(pt => pt.slice())) } : {}),
                // P-40：河流多段连通——segments 相对偏移一并快照，resetCovers 可还原
                ...(c.segments ? { segments: c.segments.map(s => Object.assign({}, s)) } : {}) };
  });
}
function resetCovers(){
  covers.forEach(c=>{
    if(c.spawn) Object.assign(c, c.spawn);
    delete c._gone;
  });
}
snapshotCovers();

//// ---- 烟雾动态视线掩体（P-17 烟幕射击，2026-08-19 重写） ----
// 烟雾 = 动态区域掩体（不是持卡全局生效）：smokeClouds 数组存活动烟雾云，
// 每团 { x, y, radius, life, maxLife }。spawnSmokeCloud 生成、updateSmoke(dt) 逐帧消散。
// hasLineOfSight 检查射线是否穿过烟雾云 → 遮挡视线（vision）；getExposure 不动
// （烟雾 mode='none' 弹道穿透，只遮视线不挡弹）——与灌木 vision:true 同构。
// 注意：本函数命名避开 tank_fx.js 的粒子 spawnSmoke（弹道烟迹视觉粒子，全局同名冲突）。
// 本模块纯逻辑，视觉渲染由接入层（mvp）消费 smokeClouds 绘制。
const smokeClouds = [];

// 生成一团烟雾（位置/半径/持续秒）。叠加同位置不合并（每团独立计时）。
// 场上烟雾云数达 RULES.smoke.maxClouds 上限时移除最早的一团（滚动窗口）。
function spawnSmokeCloud(x, y, radius, durationSec){
  const smokeCfg = (typeof RULES !== 'undefined' && RULES.smoke) || {};
  const r = radius || smokeCfg.radius || 120;
  const dur = durationSec || smokeCfg.duration || 5;
  const max = smokeCfg.maxClouds || 8;
  smokeClouds.push({ x, y, radius: r, life: dur, maxLife: dur });
  while(smokeClouds.length > max) smokeClouds.shift();  // 超出上限丢弃最早烟雾
}

// 逐帧消散烟雾（mvp 主循环调用）。返回是否仍有烟雾存留。
function updateSmoke(dt){
  for(let i = smokeClouds.length - 1; i >= 0; i--){
    smokeClouds[i].life -= dt;
    if(smokeClouds[i].life <= 0) smokeClouds.splice(i, 1);
  }
  return smokeClouds.length > 0;
}

// 清除全部烟雾（重置战场/进入新节点时调用）。
function clearSmoke(){
  smokeClouds.length = 0;
}

// 线段 (ox,oy)→(tx,ty) 是否穿过任何烟雾云（圆与线段距离判定）。
function smokeBlocksLoS(ox, oy, tx, ty){
  for(const s of smokeClouds){
    const dx = tx - ox, dy = ty - oy;
    const len2 = dx*dx + dy*dy;
    let t = len2 > 0 ? ((s.x - ox)*dx + (s.y - oy)*dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ox + dx*t, cy = oy + dy*t;
    const dist2 = (s.x - cx)*(s.x - cx) + (s.y - cy)*(s.y - cy);
    if(dist2 <= s.radius * s.radius) return true;
  }
  return false;
}
// ------------------------------------------------

// 元素被摧毁：一次性消耗（_gone 幂等标志；每帧多辆车压上同一元素只毁一次）。
// toTier 残骸（树→倒树、沙袋→碎石）原地降级并保留于 covers；残骸尺寸默认通用
// 0.6/0.6 缩小，tier 配置了 residueW/residueH 时用其覆盖（如倒树横躺 2.4/0.5）。
// 多边形掩体（verts）被摧毁后残骸按矩形 w/h 表现，故清除 verts。
function destroyCover(cov, reason){
  if(cov._gone) return;
  cov._gone = true;
  cov.hp = 0;
  invalidateCoverGrid();   // 残骸链（toTier）改变几何（w/h/verts）→ 空间索引失效重建
  if(typeof burstExplosion === 'function'){
    burstExplosion(cov.x, cov.y, 0.9, 10, 5, 8);
  }
  if(typeof pushLog === 'function'){
    const why = reason==='shell' ? '炮弹击毁' : (reason==='splash' ? '爆炸波及' : '坦克碾碎');
    pushLog(`${COVER_TIERS[cov.tier].label}被${why}`, 'COVER');
  }
  const to = COVER_TIERS[cov.tier].toTier;
  if(to){
    cov.tier = to;
    cov.angle = 0;
    const rw = COVER_TIERS[to].residueW, rh = COVER_TIERS[to].residueH;
    if(rw !== undefined || rh !== undefined){
      cov.w = Math.max(8, cov.w * (rw !== undefined ? rw : 0.6));
      cov.h = Math.max(8, cov.h * (rh !== undefined ? rh : 0.6));
    } else {
      cov.w = Math.max(24, cov.w*0.6);
      cov.h = Math.max(16, cov.h*0.6);
    }
    cov.hp = COVER_TIERS[to].hp;
    cov._gone = false;          // 残骸重新"存活"（仍可再被毁/压毁）
    delete cov.verts;           // 残骸按矩形 w/h 表现，不再沿用多边形几何
    delete cov.collisionVerts;  // 同样清除多边形碰撞块
  }
}

// 扣除耐久；归零即摧毁。不可破坏元素（hp=Infinity）不受伤害。
function damageCover(cov, amt, reason){
  if(!cov || cov.hp <= 0 || !Number.isFinite(cov.hp)) return false;
  cov.hp = Math.max(0, cov.hp - (amt||1));
  if(cov.hp <= 0){ destroyCover(cov, reason||'shell'); return true; }
  return false;
}

// 掩体角点统一入口（需求2）：带 verts（局部坐标顶点数组，长度≥3）的复杂多边形
// 掩体走 polyCorners（tank_geometry.js 全局），否则回退矩形 partCorners（w/h 半宽半高）。
function coverCorners(cov){
  if(cov.verts && cov.verts.length >= 3){
    return polyCorners(cov.x, cov.y, cov.angle, { verts: cov.verts });
  }
  return partCorners(cov.x, cov.y, cov.angle, cov.w/2, cov.h/2);
}

// P-40 河流多段连通（docs/specs/map.md §5.3）：单 cover 实例可携带 segments
// [{dx,dy,w,h,angle}...]（dx/dy 为相对实例中心的偏移）。所有几何消费（角点/碰撞/
// 弹道/绘制）先经 coverSegRects 展开成世界坐标矩形列表；无 segments 的普通元素返回自身。
function coverSegRects(cov){
  if(cov.segments && cov.segments.length){
    return cov.segments.map(s=>({ x: cov.x + (s.dx||0), y: cov.y + (s.dy||0),
      w: s.w || cov.w, h: s.h || cov.h, angle: (cov.angle||0) + (s.angle||0) }));
  }
  return [cov];
}

// 支持多凸包碰撞（L型等凹多边形）：如果掩体有 collisionVerts，返回各子块角点数组组成的数组；否则返回含单一块 coverCorners(cov) 的数组。
// P-40：带 segments 的河流按各段矩形展开为独立凸块。
function coverCollisionParts(cov) {
  if (cov.segments && cov.segments.length > 0) {
    return coverSegRects(cov).map(r => partCorners(r.x, r.y, r.angle, r.w/2, r.h/2));
  }
  if (cov.collisionVerts && cov.collisionVerts.length > 0) {
    return cov.collisionVerts.map(cv => polyCorners(cov.x, cov.y, cov.angle, { verts: cv }));
  }
  return [coverCorners(cov)];
}

// 掩体表面法线：命中点最近一条边向外（方向无要求，反射公式对方向不敏感）
function coverNormalAt(cov, px, py){
  const c = coverCorners(cov);
  let best=null, bestD=Infinity;
  for(let i=0;i<c.length;i++){
    const a=c[i], b=c[(i+1)%c.length];
    const ex=b.x-a.x, ey=b.y-a.y;
    const len=Math.hypot(ex,ey)||1;
    const ux=ex/len, uy=ey/len;
    const t=Math.max(0, Math.min(len, (px-a.x)*ux + (py-a.y)*uy));
    const hx=a.x+ux*t, hy=a.y+uy*t;
    const d=(px-hx)*(px-hx)+(py-hy)*(py-hy);
    if(d<bestD){ bestD=d; best={ nx:-uy, ny:ux }; }
  }
  return best;
}

// HE 破障（A3）：落点半径内所有可破坏元素吃 1 点溅射伤害
function splashCoversAt(x, y, radius){
  let destroyed = 0;
  for(const cov of covers){
    if(cov.hp <= 0 || !Number.isFinite(cov.hp)) continue;
    const d = Math.hypot(cov.x-x, cov.y-y);
    if(d <= radius && damageCover(cov, 1, 'splash')) destroyed++;
  }
  return destroyed;
}

function getCoverUnderTank(tank) {
  if(!tank || !Number.isFinite(tank.x) || !Number.isFinite(tank.y)) return null;
  const tankCorners = partCorners(tank.x, tank.y, tank.hullAngle, tank.hullLen/2, tank.hullWid/2);
  for (const cov of coverQueryCandidates(tank.x, tank.y, tankQueryRadius(tank))) {
    if(cov.hp <= 0) continue;
    if(cov.tier === 'road') continue;   // 2026-09-14 曲线路网链段：纯地面标识，不参与通行系数查询
    const parts = coverCollisionParts(cov);
    for (const part of parts) {
      if (obbOverlap(tankCorners, part)) {
        return cov;
      }
    }
  }
  return null;
}

// #S4 + #S14（2026-10-14）：road 被 getCoverUnderTank 跳过（纯地面标识），
// 公路加速与"道路屏蔽下层减速"改走本函数单独查询（同款 OBB 相交判定 + 空间索引）。
function getRoadUnderTank(tank) {
  if(!tank || !Number.isFinite(tank.x) || !Number.isFinite(tank.y)) return null;
  const tankCorners = partCorners(tank.x, tank.y, tank.hullAngle, tank.hullLen/2, tank.hullWid/2);
  for (const cov of coverQueryCandidates(tank.x, tank.y, tankQueryRadius(tank))) {
    if(cov.hp <= 0) continue;
    if(cov.tier !== 'road') continue;
    const parts = coverCollisionParts(cov);
    for (const part of parts) {
      if (obbOverlap(tankCorners, part)) {
        return cov;
      }
    }
  }
  return null;
}

// 溺毙判定（2026-09-14 水域行为重做）：坦克车体四角是否「完全浸入」水体
// （每角均位于任一 water|river 覆盖凸块内，允许跨相邻水体拼接）。
// 纯函数、无 DOM；消费方：tank_mvp.html 战斗主循环 drownT 累计。
function tankFullyInWater(tank) {
  const corners = partCorners(tank.x, tank.y, tank.hullAngle, tank.hullLen/2, tank.hullWid/2);
  const parts = [];
  for (const cov of covers) {
    if (cov.hp <= 0) continue;
    if (cov.tier !== 'water' && cov.tier !== 'river') continue;
    for (const poly of coverCollisionParts(cov)) parts.push(poly);
  }
  if (!parts.length) return false;
  const pointInPoly = (p, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
    }
    return inside;
  };
  for (const c of corners) {
    let inside = false;
    for (const poly of parts) { if (pointInPoly(c, poly)) { inside = true; break; } }
    if (!inside) return false;
  }
  return true;
}

// ---------- OBB / SAT collision helpers ----------
function getOBBAxes(corners) {
  const axes = [];
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    const ex = corners[j].x - corners[i].x;
    const ey = corners[j].y - corners[i].y;
    const len = Math.hypot(ex, ey) || 1;
    axes.push({ x: -ey / len, y: ex / len });
  }
  return axes;
}

function projectOBB(corners, axis) {
  let min = Infinity, max = -Infinity;
  for (const c of corners) {
    const d = c.x * axis.x + c.y * axis.y;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

function obbOverlap(cornersA, cornersB) {
  const axes = getOBBAxes(cornersA).concat(getOBBAxes(cornersB));
  for (const axis of axes) {
    const pA = projectOBB(cornersA, axis);
    const pB = projectOBB(cornersB, axis);
    if (pA.max < pB.min || pB.max < pA.min) return false;
  }
  return true;
}

// 全部候选 MTV（每个 OBB 轴一个），供对稳定性敏感的调用方（坦克⇄坦克）做轴选择。
// 每个条目：{ dx, dy, depth, ux, uy } —— 单位轴已定向为"把 cornersA 推离 cornersB"
// （dot(centerA - centerB, (ux,uy)) >= 0，与 obbMTV 约定一致）。
// 任一轴分离 → 返回 null（不碰撞）。
function obbMTVs(cornersA, cornersB) {
  const axes = getOBBAxes(cornersA).concat(getOBBAxes(cornersB));
  const out = [];
  for (const axis of axes) {
    const pA = projectOBB(cornersA, axis);
    const pB = projectOBB(cornersB, axis);
    if (pA.max < pB.min || pB.max < pA.min) return null;
    const overlap = Math.min(pA.max - pB.min, pB.max - pA.min);
    let ax = axis.x, ay = axis.y;
    let acx = 0, acy = 0;
    for (const c of cornersA) { acx += c.x; acy += c.y; }
    acx /= cornersA.length; acy /= cornersA.length;
    let bcx = 0, bcy = 0;
    for (const c of cornersB) { bcx += c.x; bcy += c.y; }
    bcx /= cornersB.length; bcy /= cornersB.length;
    if ((acx - bcx) * ax + (acy - bcy) * ay < 0) { ax = -ax; ay = -ay; }
    out.push({ dx: ax * overlap, dy: ay * overlap, depth: overlap, ux: ax, uy: ay });
  }
  return out;
}

function obbMTV(tankCorners, covCorners) {
  const candidates = obbMTVs(tankCorners, covCorners);
  if (!candidates) return null;
  let best = candidates[0];
  for (const c of candidates) if (c.depth < best.depth) best = c;
  return { dx: best.dx, dy: best.dy, depth: best.depth };
}

// 掩体/元素 ⇄ 坦克 碰撞：三态处理（见 2.7）——
//   crushable 元素（栅栏/沙袋/树桩/碎石）：直接压毁；
//   solid 不可压毁（全高建筑/树）：MTV 推出，物理隔离；
//   graduated（半高）/ none（灌木）：只让 update 里做通行系数，不推。
//   半高掩体另有 driveBy 门控（A1 设定）：重坦可开过去，中坦等同 solid 被推出。
// 2026-10-10 #N1 两处修正（用户反馈「坦克碰到岩石后无法移动」）：
//   ① 分离缓冲：推出量 = 穿透深度 + RESOLVE_PUSH_BUFFER(0.25px)。旧实现只推到
//      「恰好贴合」，而 SAT 判「触=叠」→ 每帧都判为压在岩石上（driveTank 的通行系数
//      与 getCoverUnderTank 都据此判定）；加缓冲后静止接触是真实分离，不再粘连。
//   ② 多遍迭代：单遍顺序推出在两个硬阻断体夹角/贴世界边界场景下会把坦克推离 A 又
//      叠回 B；改为「有推出就重扫，最多 RESOLVE_MAX_PASS 遍」直至无穿透。
const RESOLVE_PUSH_BUFFER = 0.25;
const RESOLVE_MAX_PASS = 4;
function resolveCoverCollisions(tank) {
  if(!tank || !Number.isFinite(tank.x) || !Number.isFinite(tank.y)) return;
  for(let pass = 0; pass < RESOLVE_MAX_PASS; pass++){
    const tankCorners = () => partCorners(tank.x, tank.y, tank.hullAngle, tank.hullLen/2, tank.hullWid/2);
    let pushed = false;
    for (const cov of coverQueryCandidates(tank.x, tank.y, tankQueryRadius(tank))) {
      if (cov.hp <= 0) continue;
      if (cov.tier === 'road') continue;   // 2026-09-14 曲线路网链段：纯地面标识，零物理（抵消链段数量增长的热路径开销）
      const tier = COVER_TIERS[cov.tier];
      const parts = coverCollisionParts(cov);
      for (const part of parts) {
        const mtv = obbMTV(tankCorners(), part);
        if (!mtv) continue;
        if (tier.crushable) {
          destroyCover(cov, 'crush');
          break; // 已压毁则不再检测其他 collisionVerts
        }
        // #E3（2026-09-20）：passability=0（水/河）阻断移动；确定性挡弹类照旧实体推出；
        // 泥(0.4)不推只减速。driveBy 门控（半高掩体重坦可越）已随半高掩体移除。
        const blocked = tier.passability === 0 ||
          tier.shellBlock === true || tier.shellBlock === 'single';
        if (blocked) {
          // 沿同一 MTV 方向多推 RESOLVE_PUSH_BUFFER（= 深度 + 缓冲），保证分离而非恰好贴合
          const depth = Math.max(1e-6, mtv.depth);
          const scale = (mtv.depth + RESOLVE_PUSH_BUFFER) / depth;
          tank.x += mtv.dx * scale;
          tank.y += mtv.dy * scale;
          pushed = true;
        }
      }
    }
    if(!pushed) break;   // 无穿透即收敛（热路径常见情形：一遍退出）
  }
}

// ---------- 覆盖物空间哈希（2026-10-10 #N1/strip 性能） ----------
// C 档 strip 节点 covers 300+（实测 8 实体 × 全表 SAT = 13ms/帧，超 120Hz 预算），
// 且 getCoverUnderTank / resolveCoverCollisions 是「每实体每模拟步」的热路径。
// 按固定网格预索引每个 cover 碰撞凸块的 AABB 覆盖格，查询只取坦克 AABB 覆盖格内的候选。
// 口径：索引仅做候选粗筛（AABB），SAT 精判与语义完全不变；covers 数组长度变化
// （页面换节点 push/splice）即失效重建；destroyCover 只改 hp/tier/残骸尺寸不改位置，
// 命中数不变故索引保持有效（残骸 AABB 变化 ≤ 候选放宽方向，无漏检风险）。
const COVER_GRID_CELL = 512;
let _coverGrid = null;        // Map<string, number[]>（"cx,cy" → covers 下标数组）
let _coverGridLen = -1;       // 建索引时的 covers.length
let _coverGridCell = COVER_GRID_CELL;
// O(1) 有效性签名：长度 + 首末元素引用。换节点时 `covers.length=0; push(...)` 即使
// 新旧节点 cover 数相同，首末引用也必然不同 ⇒ 不会被陈旧索引蒙混（漏检=穿模）。
let _coverGridRef0 = null, _coverGridRefN = null;

// 掩体包络 AABB（世界坐标，恒为实际几何超集）：矩形按旋转包络、verts 多边形逐顶点，
// 带 segments 的多段取各段并集。供弹道查询做粗筛（宁可宽不可窄，绝不漏检）。
function coverEnvelope(cov){
  if(cov.segments && cov.segments.length){
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const r of coverSegRects(cov)){
      const a = r.angle || 0, hw = (r.w || 0) / 2, hh = (r.h || 0) / 2;
      const ex = Math.abs(Math.cos(a)) * hw + Math.abs(Math.sin(a)) * hh;
      const ey = Math.abs(Math.sin(a)) * hw + Math.abs(Math.cos(a)) * hh;
      minX = Math.min(minX, r.x - ex); maxX = Math.max(maxX, r.x + ex);
      minY = Math.min(minY, r.y - ey); maxY = Math.max(maxY, r.y + ey);
    }
    return { minX, minY, maxX, maxY };
  }
  const a = cov.angle || 0;
  if(cov.verts && cov.verts.length >= 3){
    const ca = Math.cos(a), sa = Math.sin(a);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const v of cov.verts){
      const wx = cov.x + v[0] * ca - v[1] * sa, wy = cov.y + v[0] * sa + v[1] * ca;
      if(wx < minX) minX = wx; if(wx > maxX) maxX = wx;
      if(wy < minY) minY = wy; if(wy > maxY) maxY = wy;
    }
    return { minX, minY, maxX, maxY };
  }
  const hw = (cov.w || 0) / 2, hh = (cov.h || 0) / 2;
  const ex = Math.abs(Math.cos(a)) * hw + Math.abs(Math.sin(a)) * hh;
  const ey = Math.abs(Math.sin(a)) * hw + Math.abs(Math.cos(a)) * hh;
  return { minX: cov.x - ex, minY: cov.y - ey, maxX: cov.x + ex, maxY: cov.y + ey };
}

// 射线 AABB 与掩体包络 AABB 是否相交（粗筛；输入非法时保守返真）
function coverEnvelopeHitsRay(cov, ox, oy, tx, ty){
  if(!Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(tx) || !Number.isFinite(ty)) return true;
  const e = coverEnvelope(cov);
  const rMinX = Math.min(ox, tx), rMaxX = Math.max(ox, tx);
  const rMinY = Math.min(oy, ty), rMaxY = Math.max(oy, ty);
  return e.minX <= rMaxX && e.maxX >= rMinX && e.minY <= rMaxY && e.maxY >= rMinY;
}

// 覆盖物碰撞块的世界 AABB 列表（河流多段按段展开）
function coverPartAABBs(cov){
  const parts = coverCollisionParts(cov);
  const out = [];
  for(const p of parts){
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for(const c of p){
      if(c.x < minX) minX = c.x;
      if(c.y < minY) minY = c.y;
      if(c.x > maxX) maxX = c.x;
      if(c.y > maxY) maxY = c.y;
    }
    if(minX <= maxX && minY <= maxY) out.push({ minX, minY, maxX, maxY });
  }
  return out;
}

function invalidateCoverGrid(){
  _coverGrid = null;
  _coverGridLen = -1;
  _coverGridRef0 = null;
  _coverGridRefN = null;
}

function rebuildCoverGrid(){
  _coverGrid = new Map();
  _coverGridLen = covers.length;
  _coverGridRef0 = covers.length ? covers[0] : null;
  _coverGridRefN = covers.length ? covers[covers.length - 1] : null;
  const cell = _coverGridCell;
  for(let i = 0; i < covers.length; i++){
    const cov = covers[i];
    if(!cov || !Number.isFinite(cov.x) || !Number.isFinite(cov.y)) continue;
    for(const b of coverPartAABBs(cov)){
      const x0 = Math.floor(b.minX / cell), x1 = Math.floor(b.maxX / cell);
      const y0 = Math.floor(b.minY / cell), y1 = Math.floor(b.maxY / cell);
      // 超大体块（跨 >64 格）时退化为全表索引项，防网格爆炸
      if((x1 - x0 + 1) * (y1 - y0 + 1) > 64){
        const key = '*';
        let arr = _coverGrid.get(key);
        if(!arr){ arr = []; _coverGrid.set(key, arr); }
        arr.push(i);
        continue;
      }
      for(let cx = x0; cx <= x1; cx++){
        for(let cy = y0; cy <= y1; cy++){
          const key = cx + ',' + cy;
          let arr = _coverGrid.get(key);
          if(!arr){ arr = []; _coverGrid.set(key, arr); }
          arr.push(i);
        }
      }
    }
  }
}

// 查询与 (x,y) 半径 r 的圆（AABB 近似）相交的候选 covers（去重、保序）。
// 索引缺失/长度不匹配时先重建；任何异常输入退化为全表（正确性优先）。
function coverQueryCandidates(x, y, r){
  if(!Number.isFinite(x) || !Number.isFinite(y)) return covers;
  // 有效性签名：长度 + 首末引用（换节点/换场后即使长度相同也能发现）
  const n = covers.length;
  if(!_coverGrid || _coverGridLen !== n ||
     _coverGridRef0 !== (n ? covers[0] : null) || _coverGridRefN !== (n ? covers[n - 1] : null)){
    rebuildCoverGrid();
  }
  if(_coverGrid.size === 0) return covers;
  const cell = _coverGridCell;
  const x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell);
  const y0 = Math.floor((y - r) / cell), y1 = Math.floor((y + r) / cell);
  const seen = new Set();
  const out = [];
  const pushIdx = (i) => { if(!seen.has(i)){ seen.add(i); out.push(covers[i]); } };
  for(let cx = x0; cx <= x1; cx++){
    for(let cy = y0; cy <= y1; cy++){
      const arr = _coverGrid.get(cx + ',' + cy);
      if(arr) for(const i of arr) pushIdx(i);
    }
  }
  const wild = _coverGrid.get('*');
  if(wild) for(const i of wild) pushIdx(i);
  return out;
}

// 坦克碰撞查询半径：旋转车体的 AABB 半幅上界 = (hullLen+hullWid)/2（45° 时最大）
function tankQueryRadius(tank){
  const hl = Number.isFinite(tank.hullLen) ? tank.hullLen : 32;
  const hw = Number.isFinite(tank.hullWid) ? tank.hullWid : 32;
  return (hl + hw) / 2;
}

function findCoversOnPath(ox,oy,tx,ty, coversList){
  const dx=tx-ox, dy=ty-oy;
  const dist = Math.hypot(dx,dy) || 1;
  const ux=dx/dist, uy=dy/dist;
  const hits = [];
  const list = (coversList && coversList.length) ? coversList : covers;
  for(const cov of list){
    if(cov.hp <= 0) continue;   // 已摧毁元素不再参与判定/预测
    // AABB 粗筛（2026-10-10 #N1）：strip 规模 covers（300+）下逐边求交成为热点；
    // 射线 AABB 与掩体包络 AABB 不相交即不可能命中，先行剔除（包络恒为形状超集 ⇒ 不漏检）。
    if(!coverEnvelopeHitsRay(cov, ox, oy, tx, ty)) continue;
    // P-40：河流多段——逐段求交，取最早入口段代表整个实例（cover 字段指向父实例）
    let bEntry=null, bExit=null, bPoint=null;
    for(const rect of coverSegRects(cov)){
      const corners = (rect === cov) ? coverCorners(cov)
                                     : partCorners(rect.x, rect.y, rect.angle, rect.w/2, rect.h/2);
      let entry = null, exit = null;
      for(let i=0;i<corners.length;i++){
        const a=corners[i], b=corners[(i+1)%corners.length];
        const hit = segRayIntersect(ox,oy,ux,uy, a.x,a.y,b.x,b.y);
        if(hit && hit.t>0.5){
          // entry 只取命中点之前的穿越；exit 取整个矩形的出口（可越过命中点，
          // 供方向判据判定"掩体是否完整位于射手与目标之间"）
          if(hit.t < dist){
            if(!entry || hit.t<entry) entry = hit.t;
          }
          if(!exit || hit.t>exit) exit = hit.t;
        }
      }
      if(entry !== null && (bEntry===null || entry<bEntry)){
        bEntry=entry; bExit=exit; bPoint={x:ox+ux*entry,y:oy+uy*entry};
      }
    }
    if(bEntry !== null){
      hits.push({ cover:cov, distA:bEntry, distB:dist-bEntry, distExit:bExit || bEntry,
                  point:bPoint });
    }
  }
  hits.sort((a,b)=>a.distA-b.distA);
  return hits;
}

// 掩体遮挡模型：垂直剖面 + 射线高度插值（C 实验，2026-08-14）：
//   1. 弹道路径是否穿掩体由实际射线与掩体 OBB 的交点决定（findCoversOnPath）——
//      射线绕过掩体（未相交）即无遮挡，直接命中；与"攻击方/被攻击方谁离掩体更近"无关。
//   2. 部位露出（垂直剖面）：炮塔（zMin >= 1.2）恒定 100% 露出；
//      半高掩体后，中坦车体 100% 阻挡（0% 露出），重坦车体露出 25%（75% 阻挡）。
//   3. C 实验——半高掩体越掩判定（受控距离因素）：本游戏弹道射线无下坠，其高度在
//      炮口高度（RULES.heights.muzzle，按射手 heightClass 取值）与目标部位中心高度
//      zMid 之间线性插值。攻击方贴近掩体时，射线在掩体入口处
//      （t = distA/(distA+distB)）仍高于掩体顶（RULES.heights.cover.half = 1.4）→
//      该掩体被越过（不参与遮挡，exposure 1.0）；拉开距离后射线降至掩体顶以下 →
//      恢复垂直剖面遮挡。仅正式 half 掩体参与插值；stump/rubble 等其他 graduated
//      残骸保持旧行为（永远留在候选列表）。RULES.heights.cover.half 缺失时不做插值
//      （保守回退旧行为）。炮塔恒露（zMin >= 1.2）与 16px 方向判据不受影响。
//   4. 方向判据（cutoffDist）：掩体须在命中车体前被射线完整穿过（distExit < cutoffDist）。
// P-40 地形抽象（§5.1/§5.2）：弹道交互统一消费 shellBlock（true/'single' 挡弹 / 'grad' 渐变 /
// false 越飞——水/河/泥不入遮蔽查询，#85 裁定）；半高剖面插值按 exposureProfile==='half'
// 分发（half + ruined 残破建筑同走 C 越掩），消除 tier==='half' 硬编码特判。
function tierShellBlock(tier){
  if(tier.shellBlock !== undefined) return tier.shellBlock;
  // 兜底：未迁移自定义 tier 按旧 mode 推导
  return tier.mode === 'solid' ? true : tier.mode === 'single' ? 'single'
       : tier.mode === 'graduated' ? 'grad' : false;
}
function getExposure(ox,oy,tx,ty, shooter, target, zMin, zMax, cutoffDist) {
  const hits = findCoversOnPath(ox,oy,tx,ty);
  const validHits = [];

  for(const h of hits){
    const tier = COVER_TIERS[h.cover.tier];
    const sb = tierShellBlock(tier);
    // 炮弹越飞的地形（水/河/泥）与纯视线/可穿透元素不参与弹道遮蔽
    if(sb === false) continue;
    // 方向判据：掩体须在命中车体前被射线完整穿过（骑上/包住车体的掩体不生效；
    // 贴掩体时 distExit 与 cutoffDist 极其接近，允许 16px 向后容差以确保贴掩体遮挡生效）
    const COVER_DIRECTION_TOLERANCE = 16;
    if(cutoffDist !== undefined && h.distExit >= cutoffDist + COVER_DIRECTION_TOLERANCE) continue;
    if(sb === true || sb === 'single') return 0; // 全遮剖面/固态掩体确定性 100% 格挡
    validHits.push(h);
  }

  if(validHits.length === 0) return 1.0;

  // 垂直剖面：炮塔（zMin >= 1.2m）恒定 100% 露出——半高掩体与 C 越掩插值已随
  // #E1/#E3（2026-09-20）整体移除，车体高度不再参与露出比例计算。
  if (zMin >= 1.2) {
    return 1.0;
  }

  // 走到这里说明命中列表里只剩「非确定性」剖面（历史 'grad' tier）。2026-09-20 起
  // 全部此类 tier（stump/rubble/ruined）已改为确定性挡弹或不挡弹，正常数据下不可达；
  // 兜底保守返回 0（= 完全遮蔽）。
  return RULES.coverRules && RULES.coverRules.mediumHullExposure !== undefined
    ? RULES.coverRules.mediumHullExposure : 0.0;
}

function coverBlockInfo(ox,oy,tx,ty, shooter, target, part, cutoffDist){
  const z = getPartZRange(target, part);
  const exposure = getExposure(ox,oy,tx,ty, shooter, target, z.zMin, z.zMax, cutoffDist);
  return { prob: 1 - exposure, hits: findCoversOnPath(ox,oy,tx,ty) };
}

function isBlockedBySolidCover(ox,oy,tx,ty, coversList){
  const hits = findCoversOnPath(ox,oy,tx,ty, coversList);
  for(const h of hits){
    if(tierShellBlock(COVER_TIERS[h.cover.tier]) === true) return h;
  }
  return null;
}

// A17：视线遮挡原语——返回 (ax,ay)→(bx,by) 线上首个挡视线（tier.vision）的掩体，
// 以及供 AI 绕行 / 生成期开走廊复用的侧向单位向量 (nx,ny)。纯函数、无 DOM 依赖。
// 与 hasLineOfSight 同口径（仅 tier.vision 决定的掩体遮挡视线；烟雾由调用方另行判定）。
// (nx,ny) 取"线段垂线方向"（spec 允许退化形式）：既可直接用于把遮挡体沿此平移露出缝隙，
// 也可供 AI 沿 ±(nx,ny) 侧向绕行。coversList 缺省走全局 covers；该参数使原语可作用于
// 任意掩体集合（如生成期的节点局部 covers，而非运行期全局数组）。
function losBlocker(ax, ay, bx, by, coversList) {
  const hits = findCoversOnPath(ax, ay, bx, by, coversList);
  for (const h of hits) {
    const tier = COVER_TIERS[h.cover.tier];
    if (tier && tier.vision) {
      const dx = bx - ax, dy = by - ay;
      const L = Math.hypot(dx, dy) || 1;
      // 垂线方向（侧向）：(-dy, dx)/L —— 开走廊时把遮挡体沿此平移即可露出缝
      const nx = -dy / L, ny = dx / L;
      return { cover: h.cover, nx: nx, ny: ny, point: h.point };
    }
  }
  return null;
}

// 视线遮挡查询（§2.7 / §5.6 前置）：两点间是否被 `vision:true` 的掩体（灌木/树冠）遮挡。
// 是敌人 AI 索敌（开放问题 1）与玩家被发现判定的公共前置；炮弹穿透的 pass/none 掩体（灌木
// 本身 mode='none' 但 vision=true）仍遮挡视线——视线与弹道是两套判定。
// P-17：烟雾动态掩体（smokeClouds）同样遮挡视线（弹道穿透不受影响）。
function hasLineOfSight(ox,oy,tx,ty, coversList){
  const hits = findCoversOnPath(ox,oy,tx,ty, coversList);
  for(const h of hits){
    const tier = COVER_TIERS[h.cover.tier];
    if(tier && tier.vision) return false;   // 灌木/树冠遮挡视线
  }
  if(smokeBlocksLoS(ox, oy, tx, ty)) return false;  // 烟雾云遮挡视线（P-17）
  return true;
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COVER_TIERS,
    covers,
    snapshotCovers,
    resetCovers,
    destroyCover,
    damageCover,
    coverNormalAt,
    coverCorners,
    coverSegRects,
    tierShellBlock,
    splashCoversAt,
    getCoverUnderTank,
    getRoadUnderTank,
    tankFullyInWater,
    obbOverlap,
    obbMTVs,
    obbMTV,
    resolveCoverCollisions,
    coverCollisionParts,
    coverPartAABBs,
    coverEnvelope,
    coverEnvelopeHitsRay,
    coverQueryCandidates,
    invalidateCoverGrid,
    findCoversOnPath,
    getExposure,
    coverBlockInfo,
    isBlockedBySolidCover,
    losBlocker,
    hasLineOfSight,
    smokeClouds,
    spawnSmokeCloud,
    updateSmoke,
    clearSmoke,
    smokeBlocksLoS
  };
}
