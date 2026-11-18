// ======================= 节点任务类型：目标几何与目标欲望（纯逻辑层） =======================
// 2026-11-03 新增（M3-J 校准）。现行口径：docs/specs/combat/node-mission-types.md
//
// 【为什么存在】
//   M3-A~M3-H 把「节点任务类型」做成了**标签 + 胜利判定分支**，但地图生成完全不知道类型：
//   `js/tank_map.js` 只在 makeNode 末尾写一个 `node.kind` 字符串，`generateStrip` /
//   `generateNode` 里没有任何一处把 kind 传下去。结果是 defend / capture / breakthrough
//   在**内容结构**上与 exterminate 完全相同——同一张图、同一批防线、同一批锚点，
//   只有 HUD 文案与结算系数不同。用户 2026-11-02 的质疑（「各类型是不是只是改名、
//   实质仍是标准模式逐个防线突破」）指向的正是这一点。
//
// 【本模块的职责（两句话）】
//   ① 生成期：把「类型专属**几何**」算成纯数据（护墙环 / 占领点 / 突破通道），由
//      `js/tank_map.js` 的 applyNodeKindGeometry 写进 node（护墙块 push 进 covers）。
//   ② 运行期：`pickEngageTarget` 决定敌方这一帧打谁（不同模式不同目标欲望）。
//
// 【纯度】
//   全部纯函数：不读 DOM、不读全局状态、不产生副作用。实体/掩体由调用方传入 ⇒
//   可 Node 单测、可回放复现。确定性：同输入同输出（抖动走 FNV-1a 哈希，不耗 rng）。
//
// 【与「发明新机制」的边界】
//   本模块**不新增命中规则、不新增拦截规则、不改 getExposure / hasLineOfSight /
//   stepShells 任何一行**。护墙环之所以能做到「远距离只能在数个特定方向命中、近处更
//   容易击中」，靠的是**纯几何涌现**（见 planGuardRing 的推导注释），不是特判。

'use strict';

// ---------- 数值守卫（模块内自足，不依赖全局工具） ----------
function _num(v, dflt) {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : dflt;
}
function _pos(v, dflt) {
  const n = _num(v, NaN);
  return (Number.isFinite(n) && n > 0) ? n : dflt;
}

// FNV-1a：把 (seed, salt) 映射到 [0,1)。与 js/tank_map.js 的 kindHash 同算法但**独立实现**
//   ——本模块不 require tank_map（那会造成循环依赖），同算法保证可复现性口径一致。
function _objHash(seed, salt) {
  let h = 2166136261 >>> 0;
  const s = String(seed) + ':' + String(salt);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

function _dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// =======================================================================================
// 一、守点护墙环（defend）：让「敌军只能从数个特定方向远距离命中、近距离更容易击中」
// =======================================================================================
/**
 * 正上方的一句话：**这是几何，不是规则。**
 *
 * 守点目标 O 外围画一圈半径 R、厚 T 的实心掩体环，只留 G 个切向宽 W 的缺口。
 * 于是对任意射手 P（距离 D = |OP|，方位角 θ）：
 *
 *   · 弹道 OP 是直线 ⇒ 它穿过半径 R 处的方位角**恒为 θ**（与 D 无关）。
 *   · 因此「能打到 O」⇔「θ 落在某个缺口的角度范围内」
 *     ⇒ **可打方向恒为 G 个固定扇区，不随距离变化** —— 这就是用户要的
 *       「只能在数个特定方向命中」。
 *   · 缺口在 O 处的半角 = atan((W/2)/R)；在距离 D 的射手处看同一个缺口，
 *     允许的**横向位置**容差恒为 W/2，但允许的**方位角**容差 = atan((W/2)/D)。
 *     D 越大容差越小 ⇒ 远距离必须把炮口压在极窄的角度上；D 越小容差越大
 *     ⇒ **近距离更容易打中**。叠加炮弹本身的角度散布（gauss(sigma)，
 *     落点横向偏差 ≈ D·tan(σ)）后，远距离的命中难度进一步放大。
 *
 * 两个用户要求因此都是**几何涌现**的产物，代码里没有任何「远/近」特判。
 *
 * @param {object} o
 * @param {number} o.x 守点中心 x（世界 px）
 * @param {number} o.y 守点中心 y
 * @param {number} [o.radius=300] 护墙环中心线半径 R
 * @param {number} [o.thickness=70] 掩体径向厚度 T（须 ≥ 车宽量级，避免炮弹擦缝）
 * @param {number} [o.gaps=3] 缺口数 G（用户口径「数个」⇒ 3 是起判值）
 * @param {number} [o.gapWidth=150] 缺口切向宽度 W
 * @param {number} [o.blockLen=120] 单块切向长度（拼弧用；越大块数越少、弧越糙）
 * @param {number} [o.angleOffset=0] 缺口相位偏移（rad，确定性；由调用方按 seed 给）
 * @param {string} [o.tier='intact'] 掩体 tier（**必须 shellBlock===true** 才会真拦弹，
 *   见下注；缺省 intact = 不可摧毁 + mode 'solid'）
 * @param {number} [o.w] 节点宽（越界块剔除用）
 * @param {number} [o.h] 节点高
 * @param {number} [o.margin=40] 距地图边界的净空
 * @returns {{ blocks:Array<{x:number,y:number,w:number,h:number,angle:number,tier:string,guardRing:boolean}>,
 *   gaps:Array<{angle:number,width:number}>, radius:number, thickness:number, tier:string }}
 *
 * ⚠️ tier 选择不是随便挑的：`js/tank_fire.js` stepShells 只对 `tier.mode==='solid'||'single'`
 *   的掩体在入口点截停，而 `mode` 由 RULES 文件末尾 normalizeCoverTiers 从 shellBlock 派生：
 *     shellBlock===true → 'solid'；'single' → 'single'；其余（含 'wall' / 'solid' 字符串）
 *     按 vision 派生成 'none'/'pass'，**都不拦弹**。
 *   实测（node -e 逐 tier 打印）：只有 full/tree/building/intact/ruined/rock 是真 'solid'。
 *   故护墙 tier 缺省取 `intact`（solid + destructible Infinity + passability 1.0 + height 8
 *   + drawStyle 'box'）——真拦弹、打不掉、挡视线（height 8 ≥ LOS_EYE_Z 2.3）。
 *   **不要**改成 `wall` / `perm_block`：那两个是 mode 'none'，护墙会变成纯装饰。
 */
function planGuardRing(o) {
  const s = /** @type {any} */ (o || {});
  const cx = _num(s.x, NaN);
  const cy = _num(s.y, NaN);
  const empty = { blocks: [], gaps: [], radius: 0, thickness: 0, tier: '' };
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return empty;

  const radius = _pos(s.radius, 300);
  const thickness = _pos(s.thickness, 70);
  const gaps = Math.max(0, Math.round(_num(s.gaps, 3)));
  const gapWidth = _pos(s.gapWidth, 150);
  const blockLen = _pos(s.blockLen, 120);
  const angleOffset = _num(s.angleOffset, 0);
  const tier = (typeof s.tier === 'string' && s.tier) ? s.tier : 'intact';
  const nodeW = _pos(s.w, 0), nodeH = _pos(s.h, 0);
  const margin = _num(s.margin, 40);

  // 缺口中心角：均匀分布（G=0 ⇒ 无缺口 = 全封闭环，只用于「绝不可达」的极端配置）
  const gapCenters = [];
  const nG = Math.max(0, gaps);
  for (let i = 0; i < nG; i++) gapCenters.push(angleOffset + (2 * Math.PI * i) / Math.max(1, nG));

  // 缺口半角：缺口弧长 W 对应圆心角的一半（小角近似；R 远大于 W 时误差 <1%）
  const gapHalf = (nG > 0) ? (gapWidth / 2) / radius : 0;

  // 墙段 = 相邻缺口之间的弧。G=0 时一整段 [0, 2π)。
  const segs = [];
  if (nG === 0) {
    segs.push({ a0: angleOffset, a1: angleOffset + 2 * Math.PI });
  } else {
    for (let i = 0; i < nG; i++) {
      const a0 = gapCenters[i] + gapHalf;
      const a1 = (i + 1 < nG) ? (gapCenters[i + 1] - gapHalf)
                              : (gapCenters[0] + 2 * Math.PI - gapHalf);
      if (a1 > a0) segs.push({ a0: a0, a1: a1 });
    }
  }

  // 逐段拼弧：块数 = ceil(弧长/blockLen)，块长 ×1.08 重叠 8% 防圆弧缝隙漏弹。
  const blocks = [];
  for (const seg of segs) {
    const arcLen = (seg.a1 - seg.a0) * radius;
    if (!(arcLen > 0)) continue;
    const n = Math.max(1, Math.ceil(arcLen / blockLen));
    const stepArc = arcLen / n;
    for (let k = 0; k < n; k++) {
      const a = seg.a0 + (seg.a1 - seg.a0) * ((k + 0.5) / n);
      const bx = cx + Math.cos(a) * radius;
      const by = cy + Math.sin(a) * radius;
      // 越界剔除：节点是有限矩形，环若压到边界外就丢掉那一块（不裁剪，避免半块漏弹判定歧义）
      if (nodeW > 0 && (bx < margin || bx > nodeW - margin)) continue;
      if (nodeH > 0 && (by < margin || by > nodeH - margin)) continue;
      blocks.push({
        x: bx, y: by,
        // 局部 x 轴沿圆切线（angle = 半径角 + 90°）⇒ w 是切向长度、h 是径向厚度
        w: stepArc * 1.08, h: thickness,
        angle: a + Math.PI / 2,
        tier: tier,
        guardRing: true,
      });
    }
  }

  return {
    blocks: blocks,
    gaps: gapCenters.map(function (a) { return { angle: a, width: gapWidth }; }),
    radius: radius, thickness: thickness, tier: tier,
  };
}

/**
 * 守点目标位置（defend）。
 *
 * 改前的语义问题：页面侧 `spawnGuardTarget` 取的是**最后一个** defense anchor
 *   （`anchorGroups[anchorGroups.length-1]`）——也就是离出口最近、离玩家最远的那道防线。
 *   「守住这个点」却把点设在敌人纵深里，玩家要穿过全部防线才看得见自己的防守目标；
 *   而敌军本身就从那些锚点刷新 ⇒ 敌人**直接生在自己要打的目标上**，护墙环会被敌人从
 *   内部绕过（环对内部无效）。
 *
 * 现行语义：守点放在**玩家出生侧与首道防线之间**的 45% 处（`xProgress`），
 *   玩家出生即看见自己要守的东西，敌军从右侧推进过来 ⇒ 护墙环的缺口才有意义。
 *   y 轴给一个确定性偏移（±18% 高度），避免「笔直站在中线」的乏味读图。
 *
 * @param {object} o
 * @param {number} o.w 节点宽
 * @param {number} o.h 节点高
 * @param {{x:number,y:number}} o.spawn 玩家出生点
 * @param {number} [o.firstDefenseX] 首道防线 x（缺省 w*0.55）
 * @param {number} [o.xProgress=0.45] 在 spawn→首道防线 之间的推进比例
 * @param {number} [o.yOffsetPct=0.18] y 偏移幅度（占节点高）
 * @param {number} [o.seed=0] 确定性种子（决定 y 偏上还是偏下）
 * @returns {{x:number,y:number,clearRadius:number}}
 */
function planDefendObjective(o) {
  const s = /** @type {any} */ (o || {});
  const w = _pos(s.w, 1000);
  const h = _pos(s.h, 600);
  const spawn = (s.spawn && Number.isFinite(s.spawn.x) && Number.isFinite(s.spawn.y))
    ? s.spawn : { x: w * 0.10, y: h / 2 };
  const firstX = _pos(s.firstDefenseX, w * 0.55);
  const prog = Math.max(0.15, Math.min(0.85, _num(s.xProgress, 0.45)));
  const yOffPct = Math.max(0, Math.min(0.30, _num(s.yOffsetPct, 0.18)));
  const seed = _num(s.seed, 0);

  const x = spawn.x + (firstX - spawn.x) * prog;
  const sign = (_objHash(seed, 'defend:yside') < 0.5) ? -1 : 1;
  let y = h / 2 + sign * h * yOffPct;
  // 钳进地图：守点本身 + 护墙环半径都要留在地图内（半径由调用方同 cfg 决定，
  //   这里按 300+70 的现行默认留够净空，实际再由 planGuardRing 逐块剔除越界块）。
  const clear = 420;
  return {
    x: Math.round(Math.max(clear, Math.min(w - clear, x))),
    y: Math.round(Math.max(clear * 0.7, Math.min(h - clear * 0.7, y))),
    clearRadius: clear,
  };
}

// =======================================================================================
// 二、占领点分散（capture）：脱离「防线锚点」的空间重合
// =======================================================================================
/**
 * 改前（M3-F）：占领点直接取 `anchorGroups[i]`（= 第 i 个**防御点**组）的首点 x + y 均值，
 *   而防线 `lineXs` 也从同一批 anchorGroups 取 ⇒ 占领点与防线**空间完全重合**，
 *   玩家读到的路线仍是「沿防线逐个推进」。
 *
 * 本函数把占领点改成**独立的据点分布**：
 *   · x 沿推进轴均匀，且每点带 `+半格` 偏移 ⇒ 与 bucket 中心式的防线 x 天然错开；
 *   · y 锯齿分散（偶数点偏上、奇数点偏下）⇒ 强制玩家横向机动，不再是一条直线；
 *   · 抖动走 FNV-1a（确定性），幅度被钳在骨架的 ±3%/±5%，不破坏分散骨架。
 *
 * @param {object} o
 * @param {number} o.w 节点宽
 * @param {number} o.h 节点高
 * @param {number} [o.count=2] 点数（与 RULES.nodeKinds.capture.pointsMax 同源）
 * @param {number} [o.radius=130] 驻留圈半径（读条判定用）
 * @param {number} [o.x0] 起点 x（缺省 w*0.30，避开出生点与镜头净空）
 * @param {number} [o.x1] 终点 x（缺省 w*0.86，避开出口带）
 * @param {number[]} [o.ySpread] 锯齿两档 y 占比 [上, 下]（缺省 [0.24, 0.76]，与
 *   `RULES.nodeKinds.geometry.capturePoints.ySpread` 同源）
 * @param {number} [o.seed] 确定性种子
 * @returns {Array<{x:number,y:number,r:number,index:number}>}
 */
function planCapturePoints(o) {
  const s = /** @type {any} */ (o || {});
  const w = _pos(s.w, 1000);
  const h = _pos(s.h, 600);
  const count = Math.max(1, Math.round(_num(s.count, 2)));
  const radius = _pos(s.radius, 130);
  const x0 = _pos(s.x0, w * 0.30);
  const x1 = _pos(s.x1, w * 0.86);
  const seed = _num(s.seed, 0);
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  // 锯齿两档（上/下）：由配置给出，钳进 [0.05, 0.95] 防止压到边界钳制后失去锯齿。
  const ysp = Array.isArray(s.ySpread) ? s.ySpread : null;
  const yHi = ysp ? Math.max(0.05, Math.min(0.95, _num(ysp[1], 0.76))) : 0.76;
  const yLo = ysp ? Math.max(0.05, Math.min(yHi, _num(ysp[0], 0.24))) : 0.24;

  const out = [];
  for (let i = 0; i < count; i++) {
    // x：均匀分布 + 半格偏移（+0.5/count 让点位落在 bucket 边界附近而非中心 ⇒ 与防线的
    //   bucket 中心 x 错开半格；count 与防御点数不同时两者必然不重合）。
    const t = (i + 0.5) / count;
    const jx = (_objHash(seed, 'cap:x:' + i) - 0.5) * 2 * (w * 0.03);
    let x = lo + (hi - lo) * t + jx;
    // y：锯齿分散——偶数点偏上、奇数点偏下（count=1 时取两档中值）。
    const yBase = (count <= 1) ? (yLo + yHi) / 2 : (i % 2 === 0 ? yLo : yHi);
    const jy = (_objHash(seed, 'cap:y:' + i) - 0.5) * 2 * (h * 0.05);
    let y = h * yBase + jy;
    // 钳进地图（留半径 + 边距，保证驻留圈整体在节点内）
    const padX = radius + 40, padY = radius + 40;
    x = Math.max(padX, Math.min(w - padX, x));
    y = Math.max(padY, Math.min(h - padY, y));
    out.push({ x: Math.round(x), y: Math.round(y), r: radius, index: i });
  }
  return out;
}

// =======================================================================================
// 三、突破通道（breakthrough）：给出一条从出生点到出口的可走走廊
// =======================================================================================
/**
 * 改前（M3-G）：breakthrough 的全部实质就是 `battleExitUnlocked()` 不再锁出口 + 胜利判定
 *   改成 reachedExit。**地图与歼灭节点一模一样**——玩家仍要面对满图的建筑/防线，
 *   所谓「突破」只是「不要求全清」。
 *
 * 本函数在生成期产出一条走廊：调用方（tank_map.applyNodeKindGeometry）据此把走廊内的
 * **阻挡掩体**清掉（只清阻挡物，水面/道路/减速地形保留——那是地形语义不是障碍），
 * 并把两侧退让出的空隙补成护墙，形成「两端开口的巷道」。
 *
 * @param {object} o
 * @param {number} o.w 节点宽
 * @param {number} o.h 节点高
 * @param {{x:number,y:number}} [o.spawn] 玩家出生点
 * @param {number} [o.exitX] 出口 x（缺省 w*0.93，与 RULES.nodeMap.exitZone 同源）
 * @param {number} [o.width=340] 通道净宽（≥ 3 车宽，容纳会车与走位）
 * @param {number} [o.wallThickness=60] 两侧补墙厚度（0 = 不补墙，只清障）
 * @param {string} [o.wallTier='intact'] 补墙 tier
 * @returns {{ x0:number, y0:number, x1:number, y1:number, width:number,
 *   walls:Array<{x:number,y:number,w:number,h:number,angle:number,tier:string,channelWall:boolean}> }}
 */
function planBreakthroughChannel(o) {
  const s = /** @type {any} */ (o || {});
  const w = _pos(s.w, 1000);
  const h = _pos(s.h, 600);
  const spawn = (s.spawn && Number.isFinite(s.spawn.x) && Number.isFinite(s.spawn.y))
    ? s.spawn : { x: w * 0.10, y: h / 2 };
  const exitX = _pos(s.exitX, w * 0.93);
  const width = _pos(s.width, 340);
  const wallThickness = Math.max(0, _num(s.wallThickness, 60));
  const wallTier = (typeof s.wallTier === 'string' && s.wallTier) ? s.wallTier : 'intact';

  const y0 = Math.max(width / 2 + 40, Math.min(h - width / 2 - 40, spawn.y));
  const y1 = y0;   // 直通道：两端同 y（更易读，也避免「斜通道贴边」的边界 case）
  const x0 = Math.max(60, spawn.x);
  const x1 = Math.min(w - 60, exitX);

  const walls = [];
  if (wallThickness > 0 && x1 > x0) {
    const len = x1 - x0;
    const halfW = width / 2;
    // 上/下两侧各一段长条墙（不走挡路，只做「巷道」的视觉与弹道边界）
    const wallYUp = y0 - halfW - wallThickness / 2;
    const wallYDn = y0 + halfW + wallThickness / 2;
    if (wallYUp > 40) {
      walls.push({ x: (x0 + x1) / 2, y: wallYUp, w: len, h: wallThickness, angle: 0,
        tier: wallTier, channelWall: true });
    }
    if (wallYDn < h - 40) {
      walls.push({ x: (x0 + x1) / 2, y: wallYDn, w: len, h: wallThickness, angle: 0,
        tier: wallTier, channelWall: true });
    }
  }

  return { x0: x0, y0: y0, x1: x1, y1: y1, width: width, walls: walls };
}

/**
 * 判断一个掩体实例是否落在突破通道内（供生成期清障）。
 * 判据：阻挡物（passability===0 或 shellBlock truthy）且其包络与通道矩形相交。
 * 只清阻挡物——水面/河流/烂泥/道路（shellBlock false）是地形语义，不清。
 * @param {any} cov 掩体实例（读 x/y/w/h/angle/tier）
 * @param {any} ch planBreakthroughChannel 的产出
 * @param {any} tiers RULES.coverTiers
 * @returns {boolean}
 */
function coverBlocksChannel(cov, ch, tiers) {
  if (!cov || !ch) return false;
  const t = tiers && tiers[cov.tier];
  if (!t) return false;
  const blocked = (t.passability === 0) || t.shellBlock === true ||
    t.shellBlock === 'single' || t.shellBlock === 'solid' || t.shellBlock === 'wall';
  if (!blocked) return false;
  // 通道矩形（轴对齐）：[ch.x0, ch.x1] × [ch.y0 ± width/2]
  const halfW = ch.width / 2;
  const cw = Math.abs(cov.w || 0), chh = Math.abs(cov.h || 0);
  // 用「旋转矩形 → AABB 包络」粗判：包络相交即视为占道（宁可多清，避免通道被卡住）
  const ca = cov.angle || 0;
  const ex = (Math.abs(Math.cos(ca)) * cw + Math.abs(Math.sin(ca)) * chh) / 2;
  const ey = (Math.abs(Math.sin(ca)) * cw + Math.abs(Math.cos(ca)) * chh) / 2;
  const minX = cov.x - ex, maxX = cov.x + ex;
  const minY = cov.y - ey, maxY = cov.y + ey;
  if (maxX < ch.x0 || minX > ch.x1) return false;
  if (maxY < ch.y0 - halfW || minY > ch.y0 + halfW) return false;
  return true;
}

// =======================================================================================
// 四、敌方目标欲望（pickEngageTarget）：不同模式打不同目标
// =======================================================================================
/**
 * 决定一个敌方单位这一帧把谁当作交战目标。**纯函数、确定性**（无随机 —— 每帧随机会让
 * AI 在玩家与守点之间反复横跳，表现为炮塔抖动）。
 *
 * 打分模型（两个候选：玩家 / 守点目标）：
 *   score(候选) = 欲望权重 × 距离吸引
 *   距离吸引 = 1 / (1 + d / falloff)          —— 越近分越高（沿用 AI 既有的距离直觉）
 *   欲望权重 = 该模式下打这个目标的倾向（0..1）
 *   ⇒ 防御模式（objectiveBias 高）下，即使守点比玩家远，敌人也优先扑守点；
 *     普通节点（objectiveBias=0）下守点分数恒 0 ⇒ 与改前逐字段一致。
 *
 * @param {any} t 决策单位（读 id / x / y）
 * @param {object} ctx
 * @param {any} [ctx.player] 玩家实体
 * @param {any} [ctx.objective] 守点目标实体（见 guardTargetAsEntity；无目标时 null）
 * @param {number} [ctx.objectiveBias=0] 打守点的欲望权重（0..1；由页面按节点类型注入）
 * @param {number} [ctx.distanceFalloff=900] 距离衰减尺度（px）
 * @returns {any} 目标实体；两个候选都不可用时返回 null
 */
function pickEngageTarget(t, ctx) {
  const c = /** @type {any} */ (ctx || {});
  const player = c.player;
  const obj = c.objective;
  const pOk = !!(player && Number.isFinite(player.hp) ? player.hp > 0 : player);
  const oOk = !!(obj && Number.isFinite(obj.hp) ? obj.hp > 0 : obj);
  if (!pOk && !oOk) return null;
  if (!oOk) return player;
  if (!pOk) return obj;

  const bias = Math.max(0, Math.min(1, _num(c.objectiveBias, 0)));
  // bias=0 ⇒ 守点权重恒 0，直接短路返回玩家（与改前完全一致，零回归）。
  if (bias <= 0) return player;

  const falloff = _pos(c.distanceFalloff, 900);
  const tx = _num(t && t.x, 0), ty = _num(t && t.y, 0);
  const dp = _dist(tx, ty, _num(player.x, 0), _num(player.y, 0));
  const dop = _dist(tx, ty, _num(obj.x, 0), _num(obj.y, 0));
  const attractP = 1 / (1 + dp / falloff);
  const attractO = 1 / (1 + dop / falloff);
  const scoreP = (1 - bias) * attractP;
  const scoreO = bias * attractO;
  // 平票归玩家（保守：宁可打玩家也不要出现「全图 AI 一致转头打建筑」的突兀感）
  return (scoreO > scoreP) ? obj : player;
}

/**
 * 把「守点目标（covers 实例）」包装成 AI 可决策的实体形状。
 *
 * 为什么可以这么薄：实测 `js/tank_ai.js` 的 aiDecideEnemy 全文只读目标的
 *   `p.hp / p.x / p.y / p.hullAngle / p.turretAngle / p.id / p.isBoss` 七个字段
 *   （`grep -o '\bp\.[a-zA-Z_]+' js/tank_ai.js | sort -u` 全集），不读速度、不读武器、
 *   不调目标上的任何方法。故补齐这七个字段即可让 AI 正常解算朝向与交战距离。
 *
 * ⚠️ hp 是**快照**：调用方必须每帧重建（或每帧同步 hp），否则守点被打掉后 AI 仍会
 *   对着废墟开火。页面侧在 aiCtx 构造处每帧重建，开销可忽略。
 *
 * @param {any} cov 守点 covers 实例
 * @param {string} [id] 实体 id（缺省 'guard_target'）
 * @returns {any|null}
 */
function guardTargetAsEntity(cov, id) {
  if (!cov) return null;
  const hp = Number.isFinite(cov.hp) ? cov.hp : (cov.hp > 0 ? 1 : 0);
  if (!(hp > 0)) return null;   // 已毁 ⇒ 不返回代理（AI 自然回退打玩家）
  return {
    id: id || 'guard_target',
    team: 'player',            // 与敌方 team 敌对（isHostile 只判 team==='enemy' 二值）
    isObjective: true,         // 打标：开火/结算侧据此识别「这不是坦克」
    x: cov.x, y: cov.y,
    hp: hp,
    hullAngle: 0, turretAngle: 0,
    isBoss: false,
    hurtbox: cov,              // 指回原实例（供开火侧定位/扣血）
  };
}

/**
 * 节点类型 → 敌方打守点目标的欲望权重。
 * 单一映射表（不在页面里散落 if/else）；未列出的类型一律 0（= 只打玩家，零回归）。
 * @param {string} kind 节点类型
 * @param {any} cfgRULES RULES.nodeKinds（可缺省）
 * @returns {number} 0..1
 */
function objectiveBiasFor(kind, cfgRULES) {
  // 容错两种入参形态：整份 RULES，或已取的 RULES.nodeKinds 子段。
  //   历史坑（2026-11-03 实测）：页面原先传整份 RULES，而本函数只认 nodeKinds 段
  //   ⇒ 恒返回 0 ⇒ AI 目标偏置在生产里从未生效（单测直接传 nodeKinds 段，所以测不出来）。
  //   这里两种都接受，且**两种形态必须给同一结果**（由 test-node-objectives.js 锁住）。
  const src = cfgRULES || null;
  const nk = (src && src.nodeKinds) ? src.nodeKinds : src;
  const eng = (nk && nk.engage) ? nk.engage : null;
  if (!eng || eng.enabled !== true) return 0;
  if (kind === 'defend') return Math.max(0, Math.min(1, _num(eng.defendBias, 0)));
  if (kind === 'capture') return Math.max(0, Math.min(1, _num(eng.captureBias, 0)));
  return Math.max(0, Math.min(1, _num(eng.otherBias, 0)));
}

const TANK_OBJECTIVES_API = {
  planDefendObjective: planDefendObjective,
  planGuardRing: planGuardRing,
  planCapturePoints: planCapturePoints,
  planBreakthroughChannel: planBreakthroughChannel,
  coverBlocksChannel: coverBlocksChannel,
  pickEngageTarget: pickEngageTarget,
  guardTargetAsEntity: guardTargetAsEntity,
  objectiveBiasFor: objectiveBiasFor,
};

if (typeof module !== 'undefined' && module.exports) module.exports = TANK_OBJECTIVES_API;
