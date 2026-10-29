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
  // 2026-10-22（第五批）：`soft`（栅栏）/`barricade`（沙袋路障）两个 tier 已从 RULES.coverTiers 删除，
  //   bench/单测用的这两条演示元素改挂新墙体家族——不可摧毁 `wall` / 可摧毁 `wall_breakable`。
  //   （旧值保留在此注释备查：原 `{ x:330…tier:'soft' }` = 栅栏；`{ x:450…tier:'barricade' }` = 沙袋路障。）
  { x:330, y:510, w:170, h:10, angle:0, tier:'wall' },             // 直线掩体（不可摧毁，单直线墙体）
  { x:450, y:180, w:64, h:28, angle:0, tier:'wall_breakable' },    // 可摧毁掩体（4 发后彻底移除）
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
// 2026-10-22（第五批）：老数据兼容——`soft`（栅栏）/`barricade`（沙袋路障）两个 tier 已删除，
//   读到时映射进新墙体家族（soft→wall 不可摧毁、barricade→wall_breakable 可摧毁），
//   避免旧存档/旧基线快照让 `COVER_TIERS[c.tier]` 取到 undefined 直接抛 TypeError
//   （实测：默认 covers 里残留 `barricade` 会让 require('./js/tank_cover.js') 当场崩）。
function _normalizeCoverTierKey(tier){
  if(tier === 'soft') return 'wall';
  if(tier === 'barricade') return 'wall_breakable';
  if(!COVER_TIERS[tier]) return 'wall';   // 其它未知 tier：按最保守的不可摧毁墙体处理
  return tier;
}

// 2026-10-22（第五批）：**可还原的实例清单**。
//   `destroyCover` 对 `toTier === null` 的掩体（wall_breakable）会 `covers.splice()` 物理移除
//   ——这是「彻底消失，不留残骸」的语义要求，但也意味着 `resetCovers()` 遍历当前数组时
//   永远看不到它（Node 测试 + bench「重置战场」会越重置越少墙）。
//   因此这里保留一份「初始实例引用清单」：resetCovers 用它把被移除的实例放回数组。
//   ⚠️ 刷新时机：只在 snapshotCovers()（模块初始化 + 页面 setCovers 重建战场）时刷新——
//   那两处正是「实例集合被重新定义」的时刻，因此天然幂等，不会把战时移除误当初始状态。
let _initialCovers = [];
function snapshotCovers(){
  covers.forEach(c=>{
    c.tier = _normalizeCoverTierKey(c.tier);
    if(c.hp === undefined) c.hp = COVER_TIERS[c.tier].hp;
    c.spawn = { tier:c.tier, x:c.x, y:c.y, w:c.w, h:c.h, angle:c.angle, hp:c.hp,
                ...(c.verts ? { verts: c.verts.slice() } : {}),
                ...(c.collisionVerts ? { collisionVerts: c.collisionVerts.map(v => v.map(pt => pt.slice())) } : {}),
                // P-40：河流多段连通——segments 相对偏移一并快照，resetCovers 可还原
                ...(c.segments ? { segments: c.segments.map(s => Object.assign({}, s)) } : {}) };
  });
  // 初始实例清单（引用，不是拷贝）：resetCovers 据此把被物理移除的实例放回数组
  _initialCovers = covers.slice();
}
function resetCovers(){
  // ① 先补回被 destroyCover 移除的实例（toTier===null 的可摧毁掩体），保持与初始集合**顺序一致**
  //    （顺序是 `getCoverUnderTank` 等「取首个重叠」判定的隐式契约，不能把墙挪到队尾）。
  //    只补 `_initialCovers` 里缺的，**不删除**手工 push 的临时元素（保持既有兼容语义）。
  for(let i = 0; i < _initialCovers.length; i++){
    const c = _initialCovers[i];
    if(covers.indexOf(c) < 0) covers.splice(Math.min(i, covers.length), 0, c);
  }
  // ② 逐条还原快照（含 hp / tier / 几何），并清掉销毁标志
  covers.forEach(c=>{
    if(c.spawn) Object.assign(c, c.spawn);
    delete c._gone;
    delete c._removed;
  });
}
snapshotCovers();

//// ---- 烟雾动态视线掩体（P-17 烟幕射击，2026-08-19 重写） ----
// 烟雾 = 动态区域掩体（不是持卡全局生效）：smokeClouds 数组存活动烟雾云，
// 每团 { x, y, radius, life, maxLife }。spawnSmokeCloud 生成、updateSmoke(dt) 逐帧消散。
// hasLineOfSight 检查射线是否穿过烟雾云 → 遮挡视线（vision）；getExposure 不动
// （烟雾 mode='none' 弹道穿透，只遮视线不挡弹）——与灌木 vision:true 同构。
// 注意：本函数命名避开 tank_fx.js 的粒子 spawnSmoke（弹道烟迹视觉粒子，全局同名冲突）。
// 本模块纯逻辑，视觉渲染由接入层（battle）消费 smokeClouds 绘制。
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

// 逐帧消散烟雾（battle 主循环调用）。返回是否仍有烟雾存留。
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
//
// 2026-10-22（第五批）：`toTier === null` 分支——可摧毁掩体（wall_breakable）**不降级、直接消失**：
//   从 covers 里真正移除（不是留一具"hp=0 的残骸"），语义与 tree→fallen / building→ruined 的
//   降级链区分开。`_gone` 仍置 true 保证幂等（同一帧多辆车/多发炮弹命中只处理一次）。
function destroyCover(cov, reason){
  if(cov._gone) return;
  cov._gone = true;
  cov.hp = 0;
  invalidateCoverGrid();   // 残骸链（toTier）/移除 改变几何 → 空间索引失效重建
  if(typeof burstExplosion === 'function'){
    burstExplosion(cov.x, cov.y, 0.9, 10, 5, 8);
  }
  // #W16-②（2026-10-20）：tier 未注册时不得抛 TypeError（原 `COVER_TIERS[cov.tier].label`）。
  // 未注册 tier 的 destroy 不应中断爆炸/日志/残骸链，退化用 tier 名本身作标签。
  const _tier = COVER_TIERS[cov.tier] || null;
  if(typeof pushLog === 'function'){
    const why = reason==='shell' ? '炮弹击毁' : (reason==='splash' ? '爆炸波及' : '坦克碾碎');
    pushLog(`${(_tier && _tier.label) || cov.tier || '掩体'}被${why}`, 'COVER');
  }
  // 2026-10-22：toTier === null（显式声明「彻底移除」）→ 直接从 covers 移除，不生成残骸。
  //   ⚠️ 与 #W16-② 的「未注册 tier 不得抛错」不同：这里靠 `_tier` 存在才走该分支，
  //   未注册 tier 仍落到下面「按彻底摧毁（保留 hp=0 实例）」的兜底。
  if(_tier && _tier.toTier === null){
    const idx = covers.indexOf(cov);
    if(idx >= 0) covers.splice(idx, 1);
    return;
  }
  const to = _tier ? _tier.toTier : null;
  // 残骸 tier 自身也必须已注册（toTier 指向未注册 tier 时按"彻底摧毁"处理）
  if(to && COVER_TIERS[to]){
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
// ⚠️ 该 1 是**现行唯一口径**：原 RULES.breach.heCoverDmg 已于 2026-10-20 #W15 删除
//    （当时即零消费——本函数一直固定传 1，从不读该字段）。
//    HE 溅射对单个可破坏元素恒为 1 点：树耐久 1 / 栅栏·沙袋路障·树桩·碎石耐久 1 ⇒ 一发即毁；
//    残破建筑（ruined，耐久 1）同理；楼房（building，耐久 3）需 3 发。
//    若要参数化，须同时新增 RULES 字段（RULES 唯一写者 role-systems）并改此处实参。
// 注：半径由调用方传入（消费 RULES.breach.heSplashRadius，该字段仍生效），本函数不读 RULES。
function splashCoversAt(x, y, radius){
  let destroyed = 0;
  // 2026-10-22（第五批）：`destroyCover` 现在会为 `toTier === null` 的掩体（wall_breakable）
  //   **从 covers 中 splice 移除**——遍历期间改动数组会让正向循环跳过下一项（实测：
  //   半径内 3 个可摧毁掩体只炸掉 1 个）。改为遍历快照副本，删除语义不受影响。
  for(const cov of covers.slice()){
    if(!cov || cov.hp <= 0 || !Number.isFinite(cov.hp)) continue;
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

// ---------- 隐蔽值（camouflage）与可见距离——2026-10-23 本批新增 ----------
// 归口：`RULES.camouflage`（唯一口径在 js/tank_rules.js）。本组为**纯函数**，可 Node 测试。
// 设计口径（用户 2026-10-23 需求 2）：以「车型吨位 / 移动状态 / 开火状态 / 所处地形」四维
//   决定可见性，最终折算为「敌方对本车的基础视距折扣」。调用方（tank_ai.js）只消费
//   `camouflageDistanceMultiplier`，不自己算权重（避免两处口径漂移）。
//
// 返回值语义：**<1 = 更难被发现**（敌方有效视距 = 基础视距 × 返回值）。
//   0.3 表示「原本 650px 才能看见，现在 195px 内才会被点亮」。

// 车型吨位分档：从 tank.heightClass / tank.vehicleClass 推断（缺失回退 medium）。
//   注意 heightClass 在本项目里是**活的**字段（见 tank_rules.js 注释），不要与已删除的 heights 混淆。
function camouflageClassOf(t) {
  if (!t) return 'medium';
  const raw = String(t.vehicleClass || t.heightClass || 'medium').toLowerCase();
  if (raw === 'light' || raw === 'wheeled' || raw === 'medium' && false) return 'light';
  if (raw === 'light' || raw === 'wheeled') return 'light';
  if (raw === 'heavy' || raw === 'spg' || raw === 'atgm') return 'heavy';
  return 'medium';
}

// 运动状态分档：静止 / 移动 / 疾驰（速度占极速比例 ≥0.75 视为疾驰）。
function camouflageMotionOf(t) {
  const v = Math.abs(t.speed || 0);
  if (v <= 6) return 'idle';
  const maxPx = ((t.stats && t.stats.maxSpeed) || 0) * ((RULES.speed && RULES.speed.pxFactor) || 1)
              * ((RULES.speed && RULES.speed.effMul) || 1);
  if (maxPx > 0 && v / maxPx >= 0.75) return 'sprint';
  return 'move';
}

// 开火惩罚：t.lastFireT 由开火层写入（距今秒数）。窗口内按 firingPenaltyMultiplier 折算。
function camouflageFiringMul(t) {
  const cfg = (typeof RULES !== 'undefined' && RULES.camouflage) || {};
  const win = cfg.firingPenaltyDuration !== undefined ? cfg.firingPenaltyDuration : 3.0;
  const mul = cfg.firingPenaltyMultiplier !== undefined ? cfg.firingPenaltyMultiplier : 0.1;
  const last = (t && typeof t.lastFireAt === 'number') ? t.lastFireAt : null;
  if (last === null) return 1;
  // #P1 / I0（2026-10-24）：改读模拟时钟（tank_fire 写入 lastFireAt 亦用同一时钟）。
  //   旧实现读 performance.now() ⇒ 同一输入在不同时刻结果不同，回放不可复现。
  const now = (typeof simNow === 'function') ? simNow()
    : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
  return (now - last) < win * 1000 ? mul : 1;
}

// 地形加成：灌木/树林给 bushBonus；烟雾云覆盖给 smokeBonus（取较大者，不叠加
//   ——否则树+烟可叠到 1.1 让坦克彻底隐身，失去对抗性）。
//
// #P1 / I2（2026-10-24）：从「OBB 相交即给满额」改为**按覆盖深度折算**。
//   旧实现只要车体与 foliage 有一点相交就 +0.40 ⇒ 贴着灌木边缘（视觉上完全暴露）
//   与灌木正中拿到相同加成，且与距离/是否真被遮无关（research §2.2）。
//   现口径：`depthRatio = 车体中心到灌木中心的「归一化内缩量」`∈[0,1]，
//   实际加成 = `bushBonus × (0.5 + 0.5×depthRatio)`——中心处满额、边缘处半额。
//   · 仍不看「敌人是否在正面」：那需要视线方向，属后续可选深化（research §4.3 第二段）。
function camouflageTerrainBonus(t) {
  const cfg = (typeof RULES !== 'undefined' && RULES.camouflage) || {};
  const bushB = cfg.bushBonus !== undefined ? cfg.bushBonus : 0.40;
  const smokeB = cfg.smokeBonus !== undefined ? cfg.smokeBonus : 0.70;
  let bonus = 0;
  const cov = (typeof getCoverUnderTank === 'function') ? getCoverUnderTank(t) : null;
  if (cov) {
    const tier = (typeof COVER_TIERS !== 'undefined' && COVER_TIERS) ? COVER_TIERS[cov.tier] : null;
    if (tier && tier.tierGroup === 'foliage') {
      // 覆盖深度：用「到掩体中心的距离 / 掩体半对角线」近似归一化，0=边缘、1=中心
      const hw = Math.max(1, (cov.w || 1) / 2), hh = Math.max(1, (cov.h || 1) / 2);
      const dx = (t.x || 0) - (cov.x || 0), dy = (t.y || 0) - (cov.y || 0);
      const halfDiag = Math.hypot(hw, hh);
      const depth = Math.max(0, Math.min(1, 1 - Math.hypot(dx, dy) / halfDiag));
      bonus = bushB * (0.5 + 0.5 * depth);
    }
  }
  if (typeof smokeClouds !== 'undefined' && Array.isArray(smokeClouds)) {
    for (const s of smokeClouds) {
      if (s.life <= 0) continue;
      const d = Math.hypot((t.x || 0) - s.x, (t.y || 0) - s.y);
      if (d <= s.radius) { bonus = Math.max(bonus, smokeB); break; }
    }
  }
  return bonus;
}

// 隐蔽值（0~1.5 量级）：baseCamo × 运动 × 开火 + 地形加成。
function camouflageValue(t) {
  const cfg = (typeof RULES !== 'undefined' && RULES.camouflage) || {};
  const base = (cfg.baseCamo || { light: 0.7, medium: 0.5, heavy: 0.3 })[camouflageClassOf(t)];
  const motion = (cfg.motionMultiplier || { idle: 1.2, move: 0.7, sprint: 0.4 })[camouflageMotionOf(t)];
  const b = (base !== undefined ? base : 0.5);
  const m = (motion !== undefined ? motion : 0.7);
  const value = b * m * camouflageFiringMul(t) + camouflageTerrainBonus(t);
  return Math.max(0, value);
}

// 敌方有效视距倍率：隐蔽值越高，视距越短。映射采用 1/(1+camo) 的单调平滑曲线，
//   camo=0 → 1.0（全额视距）；camo=0.5 → 0.67；camo=1.0 → 0.5；camo≥1.55 → ≤0.39。
//   下限 0.3 防止「完全不可见」（用户要求 AI 仍应能通过噪声/受击警觉反应）。
function camouflageDistanceMultiplier(t) {
  const camo = camouflageValue(t);
  const mul = 1 / (1 + camo * 1.0);
  return Math.max(0.3, Math.min(1, mul));
}
// 背景（用户「河流贴图和实际溺毙生效范围不一致」的根因）：道路 cover 自 cde3bc3 起是
// **整链连续多边形**——`verts` = 沿中心线左右各偏移半宽的「左链 + 反向右链」。而
// coverCorners / coverCollisionParts 对它返回的是**整链凸包**，SAT（obbOverlap）是凸多边形
// 相交测试，对细长弯曲路链会产生大面积误判：实测 main-road-d0 的 bbox 1030×4645，真实路面
// 多边形只占该 bbox 的 12.3%；距 bbox 中心 894~1109px 的河面点都被判「在路上」。后果：
// tankFullyInWater 开头的「道路优先」直接 return false（整片河面获得溺毙免疫）+
// driveTank 的 roadCover 分支跳过 river 的 0.4 减速 ⇒「贴图有河但不减速不溺毙」。
// 修法：对带 verts 的路链改用**真实多边形**判定（角点射线点测 + 车体边/多边形边相交），
// 无 verts 的旧式矩形路段（hs-secondary / strip-row-trunk 等 w×h 直路段）仍走 SAT（矩形正确）。
// 性能：getRoadUnderTank 每帧被 driveTank 与 tankFullyInWater 各调一次，整链 verts 可达 146 点
// ⇒ ① 多边形顶点与逐边 AABB 只建一次（WeakMap 按 cover 缓存，几何变更即失效重建）；
//    ② 每次查询先做「车体 AABB vs 多边形 AABB」粗筛，再逐边 AABB 预筛。
function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
  }
  return inside;
}

// 凸多边形（角点按序）包含点判定：叉积符号一致即在内
function pointInConvexPolygon(p, corners) {
  let sign = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// 线段严格交叉（共线/端点相接不计——由「角点落入多边形」「多边形顶点落入车体」两条覆盖）
function _segSegCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// verts 路链 → 世界坐标多边形缓存（WeakMap: cover → {sig, poly, edges, bbox}）
// 失效条件：verts 引用/长度、cover 的 x/y/angle 变化（残骸降级/换节点/挪位）。
const _coverPolyCache = new WeakMap();

function coverWorldPolygon(cov) {
  const verts = cov.verts;
  const sig = { vref: verts, vlen: verts.length, x: cov.x, y: cov.y, angle: cov.angle || 0 };
  const hit = _coverPolyCache.get(cov);
  if (hit && hit.sig.vref === sig.vref && hit.sig.vlen === sig.vlen &&
      hit.sig.x === sig.x && hit.sig.y === sig.y && hit.sig.angle === sig.angle) return hit;
  const poly = polyCorners(cov.x, cov.y, sig.angle, { verts });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const edges = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y,
                 minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
                 minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) });
  }
  const entry = { sig, poly, edges, minX, minY, maxX, maxY };
  _coverPolyCache.set(cov, entry);
  return entry;
}

// 车体 OBB（凸四角）与 verts 路链真实多边形是否相交：
// 角点落入多边形 / 车体边与多边形边相交 / 多边形完全落在车体内（短路段）。
function obbIntersectsCoverPolygon(tankCorners, cov) {
  const poly = coverWorldPolygon(cov);
  // 粗筛：车体 AABB vs 多边形 AABB（不相交 ⇒ 不可能相交，直接跳过）
  let tMinX = Infinity, tMinY = Infinity, tMaxX = -Infinity, tMaxY = -Infinity;
  for (const c of tankCorners) {
    if (c.x < tMinX) tMinX = c.x;
    if (c.x > tMaxX) tMaxX = c.x;
    if (c.y < tMinY) tMinY = c.y;
    if (c.y > tMaxY) tMaxY = c.y;
  }
  if (tMaxX < poly.minX || tMinX > poly.maxX || tMaxY < poly.minY || tMinY > poly.maxY) return false;
  for (const c of tankCorners) {
    if (pointInPolygon(c, poly.poly)) return true;
  }
  for (let i = 0; i < tankCorners.length; i++) {
    const a = tankCorners[i], b = tankCorners[(i + 1) % tankCorners.length];
    const exMinX = Math.min(a.x, b.x), exMaxX = Math.max(a.x, b.x);
    const exMinY = Math.min(a.y, b.y), exMaxY = Math.max(a.y, b.y);
    for (const e of poly.edges) {
      if (exMaxX < e.minX || exMinX > e.maxX || exMaxY < e.minY || exMinY > e.maxY) continue;
      if (_segSegCross(a.x, a.y, b.x, b.y, e.ax, e.ay, e.bx, e.by)) return true;
    }
  }
  // 短路段完全落在车体内（无角点、无边相交）——取多边形首个顶点做车体局部判定
  return pointInConvexPolygon(poly.poly[0], tankCorners);
}

// #S4 + #S14（2026-10-14）：road 被 getCoverUnderTank 跳过（纯地面标识），
// 公路加速与"道路屏蔽下层减速"改走本函数单独查询（空间索引 + 相交判定）。
// #U37（2026-10-18）：带 verts 的整链路带改用**真实多边形**判定（见上方 note）；
// 无 verts 的旧式矩形路段保持 SAT（矩形下 SAT 正确，零回归）。
function getRoadUnderTank(tank) {
  if(!tank || !Number.isFinite(tank.x) || !Number.isFinite(tank.y)) return null;
  const tankCorners = partCorners(tank.x, tank.y, tank.hullAngle, tank.hullLen/2, tank.hullWid/2);
  for (const cov of coverQueryCandidates(tank.x, tank.y, tankQueryRadius(tank))) {
    if(cov.hp <= 0) continue;
    if(cov.tier !== 'road') continue;
    if (cov.verts && cov.verts.length >= 3) {
      if (obbIntersectsCoverPolygon(tankCorners, cov)) return cov;
      continue;
    }
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
// #1（2026-10-16）：道路-河流交叉处，道路生效——坦克在 road 上时不判定为浸水（桥）。
// 纯函数、无 DOM；消费方：tank_battle.html 战斗主循环 drownT 累计。
function tankFullyInWater(tank) {
  // 道路优先：在 road 上即使下方有 river 也不算浸水
  if (typeof getRoadUnderTank === 'function' && getRoadUnderTank(tank)) return false;
  const corners = partCorners(tank.x, tank.y, tank.hullAngle, tank.hullLen/2, tank.hullWid/2);
  const parts = [];
  for (const cov of covers) {
    if (cov.hp <= 0) continue;
    if (cov.tier !== 'water' && cov.tier !== 'river') continue;
    for (const poly of coverCollisionParts(cov)) parts.push(poly);
  }
  if (!parts.length) return false;
  for (const c of corners) {
    let inside = false;
    for (const poly of parts) { if (pointInPolygon(c, poly)) { inside = true; break; } }
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

// 掩体是否**阻断坦克移动**的唯一判据（2026-10-29 B1 抽出）。
//   口径与旧内联表达式逐项一致：passability===0（岩石/单直线掩体/永久掩体）
//   || shellBlock===true|'single'（全高实体）。`shellBlock:'wall'` 靠 passability=0 命中。
//   可碾类（crushable：树/树桩/碎石）**不阻断**——resolveCoverCollisions 遇到它们只销毁不推出。
//   泥/水（passability 0.4）不阻断，只减速。
//   新增 tier 或改 shellBlock 语义时必须同时看这里与 `specs/map/cover-system.md`。
function tierBlocksMove(tier){
  if(!tier) return false;
  if(tier.crushable) return false;
  return tier.passability === 0 || tier.shellBlock === true || tier.shellBlock === 'single';
}

function resolveCoverCollisions(tank) {
  if(!tank || !Number.isFinite(tank.x) || !Number.isFinite(tank.y)) return;
  // #AB11b（§4.161）：把本次解算的**累计推出法线**留给调用方（tank_move 的沿墙滑行要用）。
  //   累加而非覆盖：多掩体同时命中时，法线之和才是真实的「被堵住的方向」。
  //   每帧由本函数重置（含下方 immobT 早退路径之外的常规路径），调用方无需清理；
  //   下游对 NaN/零向量自行守卫（无推出时滑行直接返回）。
  tank._pushNx = 0; tank._pushNy = 0;
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
        // 2026-10-29 B1：判据抽成 `tierBlocksMove()`，与 `probeMoveBlocked` 同源（禁止各写一份）。
        const blocked = tierBlocksMove(tier);
        if (blocked) {
          // 沿同一 MTV 方向多推 RESOLVE_PUSH_BUFFER（= 深度 + 缓冲），保证分离而非恰好贴合
          const depth = Math.max(1e-6, mtv.depth);
          const scale = (mtv.depth + RESOLVE_PUSH_BUFFER) / depth;
          tank.x += mtv.dx * scale;
          tank.y += mtv.dy * scale;
          // 供沿墙滑行：mtv.dx/dy 是单位分离轴（`scale` 已把 depth 展开），直接累加即为法线
          tank._pushNx += mtv.dx;
          tank._pushNy += mtv.dy;
          pushed = true;
        }
      }
    }
    if(!pushed) break;   // 无穿透即收敛（热路径常见情形：一遍退出）
  }
}

// ---------- 前向探测原语（2026-10-29 B1，MS1 / #AB11b 后半的前置） ----------
//
// 为什么需要它：AI 现在只有两种绕障手段——`_losDetour`（要求 `!los`，低矮掩体不满足）
//   与 `#M` 机动层（不看障碍物）。物理层 `resolveCoverCollisions` 只会把车从掩体里推出，
//   从不告诉决策层「前面走不通」。于是三辆车会顶着同一片掩体排队（§4.160 实测 67.8% 的帧
//   前方 50px 是 `cover:full`，同时 `move=1`、速度 0）。
//
// 两条纪律（都是踩过的坑）：
//   1. **只认掩体几何，绝不查 entities**。§4.160 拿 `spawnBlockedWhy`（出生点判定，把实体
//      自身也算成障碍）当行进判定，误判了一整轮。实体互推由 `resolveTankCollisions` 负责，
//      不在本原语的职责内。
//   2. **阻断判据与 `resolveCoverCollisions` 同源**（`tierBlocksMove`），不另写一份。
//
// 扫掠方式：车体 OBB 沿 heading 平移 dist，取「起点四角 ∪ 终点四角」八个点做 SAT。
//   两个凸集之间「平移过程中是否相交」等价于「凸包是否相交」，而 SAT 对多余轴只会多算、
//   不会漏判 —— 因此直接复用 `obbOverlap` 即可，无需显式求凸包。
//
// 用法（B2 的绕障状态机）：
//   const p = probeMoveBlocked(t, t.hullAngle, 90);
//   if (p.blocked) { /* 承诺期内朝 p.nx/p.ny 的切向绕行 */ }
//
// 用法（A* 航点寻路，2026-10-29 用户裁定「探测层同时要能当栅格输入」）：
//   const cell = probeCellPassable(cx, cy, tankQueryRadius(t));
//   if (cell.passable) grid[i] = cell.cost;

/** 构造以 (cx,cy) 为心、half 为半边的轴对齐方形（SAT 用；保守取外接方形）。 */
function _probeSquare(cx, cy, half){
  return [
    { x: cx + half, y: cy - half }, { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half }, { x: cx - half, y: cy - half }
  ];
}

/** 车体在 (cx,cy)、朝向 angle 时的四角（缺省尺寸与 `tankQueryRadius` 同口径）。 */
function _probeHull(cx, cy, angle, halfL, halfW){
  return partCorners(cx, cy, angle, halfL, halfW);
}

/**
 * 前向探测：从坦克当前位置沿 heading 前进 dist，车体是否会撞上阻断类掩体。
 *
 * @param {{x:number, y:number, hullAngle?:number, hullLen?:number, hullWid?:number}} t
 *                 实体（缺省 64×38、朝向 0；其余字段不读）
 * @param {number} heading 前进方向（弧度，世界坐标）
 * @param {number} dist    探测距离（px）
 * @returns {{blocked:boolean, tier:(string|null), nx:number, ny:number, hitDist:number}}
 *   `nx/ny` 为命中处掩体表面的外法线（由 `coverNormalAt` 给出，指向坦克一侧，已归一化）；
 *   `hitDist` 为沿路径**首次**接触的距离（未命中等于 dist）。
 *   **不修改 t 的任何字段**。
 */
function probeMoveBlocked(t, heading, dist){
  const out = { blocked: false, tier: null, nx: 0, ny: 0, hitDist: dist };
  if(!t || !Number.isFinite(t.x) || !Number.isFinite(t.y)) return out;
  const d = (Number.isFinite(dist) && dist > 0) ? dist : 0;
  if(d === 0) return out;
  const hd = Number.isFinite(heading) ? heading : 0;
  const angle = Number.isFinite(t.hullAngle) ? t.hullAngle : 0;
  const halfL = (Number.isFinite(t.hullLen) ? t.hullLen : 64) / 2;
  const halfW = (Number.isFinite(t.hullWid) ? t.hullWid : 38) / 2;
  const hx = Math.cos(hd), hy = Math.sin(hd);

  // 候选粗筛：扫掠区中心 + 覆盖半径（车体半径 + 半程 + 余量），空间哈希会再收敛
  const qr = tankQueryRadius(t);
  const midX = t.x + hx * d / 2, midY = t.y + hy * d / 2;
  const cands = coverQueryCandidates(midX, midY, qr + d / 2 + 64);
  if(!cands || !cands.length) return out;

  // 预筛：只留会阻断移动的掩体（跳过 road / 可碾 / 非阻断），避免每个采样点重复判 tier
  const blocking = [];
  for(const cov of cands){
    if(!cov || cov.hp <= 0) continue;
    if(cov.tier === 'road') continue;            // 纯地面标识，零物理（同 resolveCoverCollisions）
    const tier = COVER_TIERS[cov.tier];
    if(!tierBlocksMove(tier)) continue;
    blocking.push({ cov, parts: coverCollisionParts(cov) });
  }
  if(!blocking.length) return out;

  const start = _probeHull(t.x, t.y, angle, halfL, halfW);
  const end = _probeHull(t.x + hx * d, t.y + hy * d, angle, halfL, halfW);
  const swept = start.concat(end);

  let hit = null;
  for(const b of blocking){
    for(const part of b.parts){
      if(obbOverlap(swept, part)){ hit = b.cov; break; }
    }
    if(hit) break;
  }
  if(!hit) return out;

  out.blocked = true;
  out.tier = hit.tier;
  // 首次接触距离：在 [0, d] 上二分（只做 8 次，且仅在本就命中的路径上）
  let lo = 0, hi = d;
  for(let i = 0; i < 8; i++){
    const m = (lo + hi) / 2;
    const probe = _probeHull(t.x, t.y, angle, halfL, halfW)
      .concat(_probeHull(t.x + hx * m, t.y + hy * m, angle, halfL, halfW));
    let any = false;
    for(const b of blocking){
      for(const part of b.parts){ if(obbOverlap(probe, part)){ any = true; break; } }
      if(any) break;
    }
    if(any) hi = m; else lo = m;
  }
  out.hitDist = hi;
  const cpx = t.x + hx * hi, cpy = t.y + hy * hi;
  const nrm = coverNormalAt(hit, cpx, cpy);
  if(nrm){
    // `coverNormalAt` 返回的是边的**固定绕向**法线，方向取决于多边形绕向（同一块掩体
    //   左右两边可能都指向 +x）。AI 需要的是「由掩体指向坦克」的推出方向，这里统一翻正。
    let nx = nrm.nx, ny = nrm.ny;
    const bx = t.x - cpx, by = t.y - cpy;
    if(bx * nx + by * ny < 0){ nx = -nx; ny = -ny; }
    out.nx = nx; out.ny = ny;
  }
  return out;
}

/**
 * 栅格通行采样：以 (cx,cy) 为格心、r 为车体外接半径，判断该格能否容纳车体。
 * 供 A* 航点寻路直接消费（`PLAN.md` §2.8 B1 的 2026-10-29 用户裁定）。
 *
 * @param {number} cx,cy 格心（世界坐标）
 * @param {number} r     车体外接半径（通常 `tankQueryRadius(t)`）
 * @param {object} [opts] `{ margin }` —— 贴墙惩罚带宽，缺省 `max(8, r*0.35)`
 * @returns {{passable:boolean, tier:(string|null), cost:number}}
 *   不可通行 ⇒ `cost = Infinity`；贴墙（放不下 margin 余量）⇒ `cost = 1.6`（寻路会绕开窄缝）；
 *   空旷 ⇒ `cost = 1`。**不修改任何状态**。
 */
function probeCellPassable(cx, cy, r, opts){
  /** @type {{margin?:number}} */
  const o = opts || {};
  const _m = o.margin;
  const rad = (Number.isFinite(r) && r > 0) ? r : 32;
  const margin = (Number.isFinite(_m) && _m >= 0) ? _m : Math.max(8, rad * 0.35);
  const cands = coverQueryCandidates(cx, cy, rad + margin + 64);
  if(!cands || !cands.length) return { passable: true, tier: null, cost: 1 };

  const hard = _probeSquare(cx, cy, rad);
  const soft = _probeSquare(cx, cy, rad + margin);
  let tightTier = null;
  for(const cov of cands){
    if(!cov || cov.hp <= 0) continue;
    if(cov.tier === 'road') continue;
    const tier = COVER_TIERS[cov.tier];
    if(!tierBlocksMove(tier)) continue;
    for(const part of coverCollisionParts(cov)){
      if(obbOverlap(hard, part)) return { passable: false, tier: cov.tier, cost: Infinity };
      if(obbOverlap(soft, part)) tightTier = cov.tier;
    }
  }
  if(tightTier) return { passable: true, tier: tightTier, cost: 1.6 };
  return { passable: true, tier: null, cost: 1 };
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
// #W17（2026-10-20）：加 WeakMap 缓存（对照 :268 的 _coverPolyCache）。findCoversOnPath
// 在 strip 规模 covers（300~1100，部分为 80+ 顶点的整链 verts / 数十段 segments）下每次
// 弹道查询都要对全部候选算包络 —— 逐顶点遍历 + Math.cos/sin 是纯重复计算。
// 失效签名：几何变更的全部入口（残骸降级改 w/h/angle 并删 verts、segment 变化、挪位）。
const _coverEnvelopeCache = new WeakMap();

function _coverEnvelopeSig(cov){
  // 签名只含「会影响包络」的字段：x/y/angle/w/h + verts 引用及长度 + segments 引用及长度。
  // segment 内部字段（dx/dy/w/h/angle）在生成期建好后不再原地改写，故引用+长度足够。
  return {
    x: cov.x, y: cov.y, angle: cov.angle || 0,
    w: cov.w, h: cov.h,
    vref: cov.verts || null, vlen: (cov.verts && cov.verts.length) || 0,
    sref: cov.segments || null, slen: (cov.segments && cov.segments.length) || 0
  };
}

function _coverEnvelopeCompute(cov){
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

function coverEnvelope(cov){
  const hit = _coverEnvelopeCache.get(cov);
  const sig = _coverEnvelopeSig(cov);
  if(hit && hit.sig.x === sig.x && hit.sig.y === sig.y && hit.sig.angle === sig.angle &&
     hit.sig.w === sig.w && hit.sig.h === sig.h &&
     hit.sig.vref === sig.vref && hit.sig.vlen === sig.vlen &&
     hit.sig.sref === sig.sref && hit.sig.slen === sig.slen) return hit.env;
  const env = _coverEnvelopeCompute(cov);
  _coverEnvelopeCache.set(cov, { sig, env });
  return env;
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
// #W17（2026-10-20 role-systems 落字段）：掩体方向容差（px）唯一配置源 = RULES.coverRules。
// directionTolerance（js/tank_rules.js）。**双读**：字段缺失（旧存档/裁剪版 RULES/未同步的
// 测试桩）时回落历史硬编码 16——保证零行为差；不得在本模块写死或自行定义该常量。
const COVER_DIRECTION_TOLERANCE_DEFAULT = 16;
function coverDirectionTolerance(){
  const cr = (typeof RULES !== 'undefined' && RULES) ? RULES.coverRules : null;
  const v = cr ? cr.directionTolerance : undefined;
  return (typeof v === 'number' && Number.isFinite(v)) ? v : COVER_DIRECTION_TOLERANCE_DEFAULT;
}

// ================= 2026-10-22（第五批）直线掩体（tier `wall` / `wall_breakable`）的部位裁剪 =================
// 用户口径（docs/PLAN.md §4.9.2(b)）：
//   「掩体两侧的坦克，射击可以命中**另一侧比自己离掩体更远**的坦克的炮塔和车体；
//     只能命中**另一侧比自己更近**的坦克的炮塔」。
// 以掩体所在直线为界把射手与目标分到两侧：近侧一方被掩体「保护」（车体被挡、只露炮塔），
// 远侧一方其弹道越过掩体顶落到目标身上——但如果目标比射手更近，则目标车体在掩体阴影里。
//
// 判据（按顺序，先命中先返回）：
//   ① 射手贴掩体（dS <= RULES.coverRules.wallHugDist）→ 视为贴墙，完整射界（不裁）；
//   ② 目标与射手在**同一侧** → 不裁（掩体不在两者之间）；
//   ③ 目标在另一侧且**更远**（dT > dS + wallTurretOnlyDist）→ 不裁（车体+炮塔都能打）；
//   ④ 目标在另一侧且**更近/等距** → blockHull（只能打炮塔，blockTurret 恒 false）。
//
// 几何：dX = |(P − cov)·n|，n = 掩体法向 (−sin(angle), cos(angle))；
//   带符号投影 sX = (P − cov)·n 的**符号**即「在哪一侧」。
// 纯函数（无 DOM / 无全局状态），供 tank_fire.stepShells / tank_cover.getExposureWithHits /
// AI 射界门控共用；可 Node 单测（scripts/test-wall-ballistics.js）。
// @param {any} cov    掩体实例（x/y/angle；w/h 不参与本判据）
// @param {any} shooter 射手（x/y）
// @param {any} target  目标（x/y）
// @returns {{blockHull:boolean, blockTurret:boolean}}
function wallPartBlock(cov, shooter, target){
  const none = { blockHull: false, blockTurret: false };
  if(!cov || !shooter || !target) return none;
  const cr = (typeof RULES !== 'undefined' && RULES && RULES.coverRules) || {};
  const hug = (typeof cr.wallHugDist === 'number') ? cr.wallHugDist : 22;
  const turretOnlyExtra = (typeof cr.wallTurretOnlyDist === 'number') ? cr.wallTurretOnlyDist : 0;
  const ang = cov.angle || 0;
  const nx = -Math.sin(ang), ny = Math.cos(ang);          // 掩体法向 n = (−sin θ, cos θ)
  const dS = Math.abs((shooter.x - cov.x) * nx + (shooter.y - cov.y) * ny);   // 射手到掩体直线距离
  const dT = Math.abs((target.x - cov.x) * nx + (target.y - cov.y) * ny);     // 目标到掩体直线距离
  // ① 射手贴墙（dS <= RULES.coverRules.wallHugDist）：视为「掩体后射击」，完整射界（PLAN 判据 4）
  if(dS <= hug) return none;
  // ② 目标不比射手更近（dT >= dS − wallTurretOnlyDist，含等距）：弹道越过掩体顶落到目标身上
  //    ⇒ 车体 + 炮塔都可命中（PLAN 判据 1「同侧」与判据 2「目标更远」在**生产路径上等价**：
  //    调用方（tank_fire.stepShells / tank_cover.getExposureWithHits）只会传入
  //    **弹道真正穿过**的掩体——能穿过凸矩形掩体的弹道两端必然位于掩体直线两侧；
  //    同侧坦克的弹道不会与该掩体相交，压根到不了这里。故本函数只按距离比较，
  //    保持纯函数的全域单调性，也便于单测用「同侧但目标更远」的简化几何断言。）
  if(dT + turretOnlyExtra >= dS) return none;
  // ③ 目标在另一侧且**更近**（dT < dS）：车体落在掩体阴影里 ⇒ 只能命中炮塔（PLAN 判据 3）
  return { blockHull: true, blockTurret: false };
}

// #W16-②（2026-10-20）：未注册 tier 不得抛 TypeError。原实现 `tierShellBlock(COVER_TIERS[tier])`
// 在 tier 缺注册时对 undefined 取 .shellBlock ⇒ TypeError（生成期外部/旧存档/内容包新增 tier
// 都会命中）。统一守卫：null ⇒ 视为 `false`（不参与弹道遮蔽）。
//
// ⚠️ **不要把这个兜底与 tank_fire.js 的 `|| {mode:'solid'}` "统一"掉——两者语义不同且互补。**
//   本函数是**遮蔽查询**（getExposure）：未注册 tier ⇒ false ⇒ 该 cover 被从候选里彻底丢弃
//   ⇒ 炮弹**越飞**。这是"我不认识它，所以不拿它挡视线"。
//   `js/tank_fire.js:808` / `:1029` 的 `|| {mode:'solid'}` 是**弹道拦截查询**（stepShells 实际
//   推进弹丸）：未注册 tier ⇒ 当 solid ⇒ 炮弹**被挡住**。这是"我不认识它，但当墙处理"。
//   方向相反是**刻意的**：拦截侧宁可多挡（漏挡=炮弹穿墙，是可见的物理错误）；遮蔽侧宁可
//   少挡（多挡=玩家在看不见的物体后挨打，是不可解释的挫败感）。谁若把两边改成同向，
//   必然在另一侧制造回归。要改先读 docs/specs/map.md §5.1/§5.2 的两套查询口径。
//
// 取 false 而非 true 的补充理由：tank_cover 的候选一律来自 covers 实例，未注册 tier 极少见
// （只出现在跨版本数据），保守选择不引入新的挡弹来源。
function tierShellBlock(tier){
  if(!tier) return false;
  if(tier.shellBlock !== undefined) return tier.shellBlock;
  // 兜底：未迁移自定义 tier 按旧 mode 推导
  return tier.mode === 'solid' ? true : tier.mode === 'single' ? 'single'
       : tier.mode === 'graduated' ? 'grad' : false;
}
// 遮蔽判定唯一实现体。hits 可选：调用方已算过 findCoversOnPath 时直接传入以复用
// （#W17：strip 规模 covers 下避免同一查询跑两遍 O(n) 全表扫描）。
function getExposureWithHits(ox,oy,tx,ty, shooter, target, zMin, zMax, cutoffDist, hits) {
  const list = hits || findCoversOnPath(ox,oy,tx,ty);
  const validHits = [];

  // #W17：方向容差读配置（缺失回落 16），循环外取一次
  const COVER_DIRECTION_TOLERANCE = coverDirectionTolerance();

  for(const h of list){
    const tier = COVER_TIERS[h.cover.tier];
    if(!tier) continue;   // #W16-②：未注册 tier 不参与遮蔽（不抛错、不新增挡弹来源）
    const sb = tierShellBlock(tier);
    // 炮弹越飞的地形（水/河/泥）与纯视线/可穿透元素不参与弹道遮蔽
    if(sb === false) continue;
    // 方向判据：掩体须在命中车体前被射线完整穿过（骑上/包住车体的掩体不生效；
    // 贴掩体时 distExit 与 cutoffDist 极其接近，允许容差向后以确保贴掩体遮挡生效）
    if(cutoffDist !== undefined && h.distExit >= cutoffDist + COVER_DIRECTION_TOLERANCE) continue;
    // 2026-10-22（第五批）：直线掩体（shellBlock:'wall'）**不再整段 return 0**——
    //   按 wallPartBlock 的部位裁剪判据决定：炮塔（zMin>=1.2）恒露；车体看「谁更近」。
    //   缺 shooter/target（瞄准预测等无实体场景）时保守按「车体被挡」处理（旧行为等价）。
    if(sb === 'wall'){
      if(zMin >= 1.2) return 1.0;                       // 炮塔高于掩体顶：恒露
      const wb = (shooter && target)
        ? wallPartBlock(h.cover, shooter, target)
        : { blockHull: true, blockTurret: false };
      if(wb.blockHull) return 0;                        // 车体在掩体阴影里 → 完全遮蔽
      continue;                                         // 不裁 → 该掩体不参与遮蔽
    }
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
  //
  // #W16-②（2026-10-20）**删除**此前的 `RULES.coverRules.mediumHullExposure` 分支：
  // 该字段在 RULES 中从不存在（实测 `grep mediumHullExposure js/tank_rules.js` 零命中），
  // 恒 undefined ⇒ 恒返回 0.0，形成一个读死字段的不可达路径。现值直接固化 0.0。
  return 0.0;
}

// 保号兼容：既有调用方（shellVerticalDecision 实时拦截 / updateSolution 瞄准预测）不变。
function getExposure(ox,oy,tx,ty, shooter, target, zMin, zMax, cutoffDist) {
  return getExposureWithHits(ox,oy,tx,ty, shooter, target, zMin, zMax, cutoffDist, null);
}

// #W17（2026-10-20）：coverBlockInfo 原先调用两次 findCoversOnPath（getExposure 内部一次 +
// 返回 hits 一次），strip 规模 covers（300~1100）下白跑一次 O(n) 全表扫描。改为算一次复用。
function coverBlockInfo(ox,oy,tx,ty, shooter, target, part, cutoffDist){
  const z = getPartZRange(target, part);
  const hits = findCoversOnPath(ox,oy,tx,ty);   // #W17：只算一次，两处复用
  const exposure = getExposureWithHits(ox,oy,tx,ty, shooter, target, z.zMin, z.zMax, cutoffDist, hits);
  return { prob: 1 - exposure, hits: hits };
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

// 视线遮挡查询（§2.7 / §5.6 前置）：两点之间是否被掩体遮挡。
// 是敌人 AI 索敌与玩家被发现判定的公共前置；炮弹穿透的 pass/none 掩体（灌木
// 本身 mode='none' 但 vision=true）仍参与视线判定——视线与弹道是两套判定。
// P-17：烟雾动态掩体（smokeClouds）同样遮挡视线（弹道穿透不受影响）。
//
// #P1 / I2（2026-10-24）：**从布尔改高度分档**。
//   旧实现：命中任一 `vision:true` 的 cover 即 return false ⇒ **灌木 = 楼房**（高度差消失）。
//   现行口径（唯一判据，读 `RULES.coverTiers[*].height`）：
//     某掩体挡住视线 ⇔ `coverHeight >= min(eyeZ, targetZ)`
//       · eyeZ    观察者视高（米），缺省 `LOS_EYE_Z`=2.3（炮塔顶，与 getPartZRange 同源）
//       · targetZ 被观察部位高度（米），缺省 2.3（看炮塔）；查「能否看到车体」传 1.4
//     于是：灌木 1.2 / 树桩 0.8 / 倒树 1.0 **挡不住炮塔视线**（但挡得住 1.4 以下的车体视线），
//          树 6.0 / 岩石 2.5 / 建筑 8.0 **全挡**。这正是「画多高 = 挡多少」。
//   ⚠️ 行为变更（刻意）：灌木不再让人「隐身」，改为由 `camouflageTerrainBonus` 的高度折算
//      提供**部分**隐蔽加成——见 docs/specs/map/vision-stealth-3d-compat.md §2.1/§4.3。
//   · `vision:false` 的 tier（水/泥/路/碎石）**永不参与**（与旧口径一致）。
//   · `coversList` 与 `opts` 均可省略（向后兼容既有调用方）。
//
// 2026-10-24 用户裁定（C 方案）：**车体视线高度取 1.0m**（不是 getPartZRange 的 1.4）。
//   目的：让「灌木 1.2m」能够挡住车体、但挡不住炮塔（2.3m）⇒ 真正的 hull-down 分级。
//   ⚠️ 这**只影响视线**，不改弹道侧的 `getPartZRange`（hull 0~1.4 / turret 1.4~2.3）
//   与 `getExposure` 的 `zMin >= 1.2` 判据——两套判定各自独立，改动不得互相渗透。
const LOS_EYE_Z = 2.3;      // 观察者视高（米）——炮塔顶，与 getPartZRange 的 turret.zMax 同源
const LOS_HULL_Z = 1.0;     // 观察「车体」时的视线高度（米）——**用户裁定值**，低于灌木 1.2m
const LOS_TARGET_Z = 2.3;   // 观察「炮塔」时的视线高度（米）

/** 掩体高度（米）。未注册 tier ⇒ 0（不挡视线，与 tierShellBlock 的「不认识就不挡」同向）。 */
function coverHeightOf(tierKey){
  const tier = COVER_TIERS[tierKey];
  if(!tier) return 0;
  return (typeof tier.height === 'number' && Number.isFinite(tier.height)) ? tier.height : 0;
}

function hasLineOfSight(ox,oy,tx,ty, coversList, opts){
  const o = opts || {};
  const eyeZ = (typeof o.eyeZ === 'number' && Number.isFinite(o.eyeZ)) ? o.eyeZ : LOS_EYE_Z;
  const targetZ = (typeof o.targetZ === 'number' && Number.isFinite(o.targetZ)) ? o.targetZ : LOS_TARGET_Z;
  // 视线需要越过的有效高度：取两者较小（看车体时 1.4 就够，看炮塔才需 2.3）
  const needZ = Math.min(eyeZ, targetZ);
  const hits = findCoversOnPath(ox,oy,tx,ty, coversList);
  for(const h of hits){
    const tier = COVER_TIERS[h.cover.tier];
    if(!tier) continue;                     // 未注册 tier 不参与（同 tierShellBlock 的兜底方向）
    if(!tier.vision) continue;              // 该 tier 本就不遮视线（水/泥/路/碎石）
    if(coverHeightOf(h.cover.tier) >= needZ) return false;   // 够高才挡
  }
  if(smokeBlocksLoS(ox, oy, tx, ty)) return false;  // 烟雾云遮挡视线（P-17，全遮不参与分档）
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
    pointInPolygon,
    coverWorldPolygon,
    obbIntersectsCoverPolygon,
    obbMTVs,
    obbMTV,
    resolveCoverCollisions,
    tankQueryRadius,       // B1（2026-10-29）：车体外接半径（probeCellPassable 的入参来源）
    tierBlocksMove,        // B1（2026-10-29）：掩体是否阻断坦克移动的唯一判据
    probeMoveBlocked,      // B1：前向扫掠探测（AI 绕障用）
    probeCellPassable,     // B1：栅格通行采样（A* 航点寻路用）
    coverCollisionParts,
    coverPartAABBs,
    coverEnvelope,
    coverEnvelopeHitsRay,
    coverDirectionTolerance,
    wallPartBlock,
    coverQueryCandidates,
    invalidateCoverGrid,
    findCoversOnPath,
    getExposure,
    getExposureWithHits,
    coverBlockInfo,
    isBlockedBySolidCover,
    losBlocker,
    hasLineOfSight,
    coverHeightOf,     // #P1 / I2：掩体高度（米）——视线分档与渲染共用的唯一口径
    LOS_EYE_Z,         // #P1 / I2：观察者视高缺省（米）
    LOS_HULL_Z,        // #P1 / I2：观察车体时的视线高度（米，用户裁定 1.0）
    LOS_TARGET_Z,      // #P1 / I2：观察炮塔时的视线高度缺省（米）
    smokeClouds,
    spawnSmokeCloud,
    updateSmoke,
    clearSmoke,
    smokeBlocksLoS,
    camouflageClassOf,
    camouflageMotionOf,
    camouflageFiringMul,      // #P1：开火惩罚乘数（读模拟时钟；测试需单独验证窗口）
    camouflageTerrainBonus,   // #P1：地形加成（按覆盖深度折算）
    camouflageValue,
    camouflageDistanceMultiplier
  };
}

// 2026-10-22（第五批）：直线掩体部位裁剪判据的浏览器全局导出。
//   浏览器端本模块是普通全局脚本（顶层 function 已自动挂 window），这里额外写一份
//   `globalThis.wallPartBlock` 是为了与 `js/tank_weapons.js` 的 isHowitzerMode /
//   `js/tank_physics.js` 的 applyDamage 同款「显式全局导出」口径——纯 Node 侧 require
//   走上面的 module.exports，两侧同源同实现。
if (typeof globalThis !== 'undefined') { globalThis.wallPartBlock = wallPartBlock; }
