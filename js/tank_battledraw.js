'use strict';

// tank_battledraw.js — 正式游戏页战斗场景绘制层（坦克/断履带/焦黑车体/起火/炮弹/掩体/树冠/车型标志）。
// 仿 tank_fx.js 先例：每个 draw 函数显式接收 ctx（tank_paint.js 约定），不触碰 DOM。
// 测试台专用块（drawRange/addRangeShot/AMMO_KEYS/RANGE_*）留在 tank_battle.html 不拆。
//
// 全局依赖（tank_paint.js，经 <script> 先加载）：paintShade/paintTracks/paintPartTexture/
//   paintTurretShadow/DECORATION_DEFS/paintRivets/paintWeathering。
//   drawTank(ctx, t)              — 完整坦克（履带/车体/炮塔/炮管/附件/血条/车型标志）
//   drawBrokenTracks(ctx, t)      — 履带被击断的俯视表现
//   drawCharredHull(ctx, t)       — 弹药架殉爆后的焦黑车体
//   drawFireGlow(ctx, t)          — 起火坦克的炽热辉光
//   drawShells(ctx, shells)       — 飞行炮弹（弹种色拖尾 + 弹头亮点）
//   drawCover(ctx, cov)           — 掩体/地图元素分层绘制
//   drawFoliage(ctx, covers)      — 树冠/灌木叶片层（画在坦克之上形成视线遮挡）
//   drawGround(ctx, opts)         — P-36/#81 biome 地面（底色 + 种子确定性低频色斑）
//   drawClassBadge(ctx, t, x, y)  — 重/中型车型标志（六边形/五边形）

// thin wrappers delegating to the shared tank_paint.js module
function shade(hex, pct){ return paintShade(hex, pct); }
// 车体实色（历史涂装 base；无 base 回退队伍色）——炮管/炮盾/副炮塔等金属件取自实色
function tankBodyCol(t){ return (typeof tankBodyColor === 'function') ? tankBodyColor(t.color, t.texture) : t.color; }
// 履带统一深钢色（不再按队伍染色）
const TRACK_STEEL = '#42454b';
// rolling tank tracks under the hull, driven by t.trackPhase
function drawTracks(ctx, t){
  paintTracks(ctx, hullPoly(t).verts, t.x, t.y, t.hullAngle, 1, TRACK_STEEL, t.trackPhase||0, { trackWidth: t.trackWidth || 8, trackOffset: t.trackOffset || 0 });
}
// hull top-down paint.
function renderHullTexture(ctx, t){
  // #3（2026-10-19 用户反馈「坦克因被击中掉血而发生的外观变化删除，以优化性能」）：
  //   此前按 hp 比分 4 档（0/1/2/3）驱动 weathering，而 `damageLevel` 在**贴图缓存键**内
  //   （js/tank_paint.js 的 `${...}_d${damageLevel}_w${weatherSeed}_...`）⇒ **每掉 1 档就
  //   车体/炮塔各重烘焙一次**，每次约 4.5 万像素完整重栅格化。叠加残骸问题（#2）后更糟：
  //   生存敌人 id 逐波不同 ⇒ weatherSeed 逐具不同 ⇒ 193 残骸 × 4 档 × 2 部件 ≈ 1544 个
  //   缓存键，远超 LRU 上限 512，导致残骸还在屏幕上就要被反复重烤。
  //   ⇒ 固定 damageLevel = 0（所有坦克恒为"崭新"外观）。weatherSeed 保留（每车固定，
  //   不随血量变化，不是缓存抖动源），因此涂装差异仍在，只是不再随掉血变化。
  const hv = hullPoly(t).verts;
  // #TEX11：贴图图案框锚在车体 bbox（+每车固定平移），炮塔复用同一框以保持色块尺度/连续性
  const texBox = paintPatternBox(hv, 'hull', null, t.weatherSeed || 1);
  paintPartTexture(ctx, hv, t.x, t.y, t.hullAngle, 1, t.color, 'hull',
    { detail:true, texture: t.texture, damageLevel: 0, weatherSeed: t.weatherSeed || 1,
      appearance: t.appearance || undefined, texBox });
}
// turret top-down paint.
// #3（2026-10-19）：炮塔同样固定 damageLevel = 0（取消掉血外观变化，理由见 renderHullTexture）。
function renderTurretTexture(ctx, cx, cy, angle, t){
  // #TEX11：炮塔复用**车体**的图案框（平移 −座圈偏移），不再用自己的 32px 小框——
  //   否则同一套迷彩在炮塔上的色块只有车体的一半大，交界处图案还断开。
  const texBox = paintPatternBox(hullPoly(t).verts, 'turret', t.turretPivotOffset, t.weatherSeed || 1);
  paintPartTexture(ctx, turretPoly(t).verts, cx, cy, angle, 1, t.color, 'turret',
    { detail:true, heightClass: t.heightClass, texture: t.texture,
      damageLevel: 0, weatherSeed: (t.weatherSeed || 1) + 17,   // +17：炮塔磨损相位与车体错开
      appearance: t.appearance || undefined, texBox });
}

// 履带被击断的俯视表现：擦除断开段 + 撕裂金属残端 + 脱落履带节。
// 所有断链效果被限制在"履带带条"范围内（车体边缘之外），不再侵入车体表面。
function drawBrokenTracks(ctx, t){
  const L = t.hullLen/2, W = t.hullWid/2;
  const tw = t.trackWidth || 8;
  const off = t.trackOffset || 0;
  const gapX = L*0.45;
  const innerY = W + off + 1;   // 履带内侧边缘（车体之外固定空出 1px）
  const outerY = W + tw + off + 1; // 履带外侧边缘
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.hullAngle);
  for(const dir of [-1,1]){
    const y0 = Math.min(innerY*dir, outerY*dir);
    const y1 = Math.max(innerY*dir, outerY*dir);
    // 擦除断开处的履带段（露出地面，仅限履带带条）
    ctx.fillStyle = 'rgba(16,17,13,1)';
    ctx.fillRect(gapX - tw*1.1, y0, tw*2.2, y1-y0);
    // 撕裂的金属残端（锯齿状，全部在带条内）
    ctx.strokeStyle = 'rgba(150,140,110,0.9)'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(gapX - tw*1.0, y0 + dir*tw*0.15);
    ctx.lineTo(gapX - tw*0.2, y0 + dir*tw*0.65);
    ctx.lineTo(gapX + tw*0.4, y0 + dir*tw*1.0);
    ctx.lineTo(gapX + tw*1.0, y0 + dir*tw*1.25);
    ctx.stroke();
    // 脱落的履带节（悬垂在断裂处带条外侧）
    const hangY = outerY*dir + dir*tw*0.9;
    ctx.strokeStyle = paintShade(TRACK_STEEL, -58); ctx.lineWidth = tw*0.9; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(gapX - tw*1.2, hangY); ctx.lineTo(gapX + tw*0.3, hangY); ctx.stroke();
    ctx.strokeStyle = paintShade(TRACK_STEEL, -12); ctx.lineWidth = 1.2; ctx.setLineDash([3,4]); ctx.lineDashOffset = -((t.trackPhase||0)%7);
    ctx.beginPath(); ctx.moveTo(gapX - tw*1.2, hangY); ctx.lineTo(gapX + tw*0.3, hangY); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
// 弹药架殉爆后的焦黑车体
function drawCharredHull(ctx, t){
  const hc = polyCorners(t.x,t.y,t.hullAngle, hullPoly(t));
  ctx.beginPath();
  ctx.moveTo(hc[0].x,hc[0].y);
  for(let i=1;i<hc.length;i++) ctx.lineTo(hc[i].x,hc[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(18,16,12,0.6)';
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  const r1 = rotate(6, 2, t.hullAngle);
  ctx.beginPath(); ctx.arc(t.x+r1.x, t.y+r1.y, t.hullWid*0.32, 0, TAU); ctx.fill();
  const r2 = rotate(-10, 7, t.hullAngle);
  ctx.beginPath(); ctx.arc(t.x+r2.x, t.y+r2.y, t.hullWid*0.22, 0, TAU); ctx.fill();
}
// 起火坦克的炽热辉光（叠加在车体上）
// #FX2-2026-10-18：闪烁值派生自时钟哈希，不再用 Math.random——绘制期随机会让「同一帧重绘
//   （暂停/离线生图/回归快照）结果不同」，且 Node 生图无法复现。这里用 8Hz 量化时间做种子，
//   视觉上仍是摇曳火光，但同一时刻恒得同一值。
function _flickerAt(rate, seed){
  const t = (typeof performance !== 'undefined' && performance && performance.now) ? performance.now() : 0;
  const q = Math.floor(t * rate);
  let n = Math.imul((q ^ (seed || 0)) | 0, 0x9E3779B1);
  n = Math.imul(n ^ (n >>> 15), 0x85EBCA77);
  n = Math.imul(n ^ (n >>> 13), 0xC2B2AE3D);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function drawFireGlow(ctx, t){
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const W = t.hullWid*0.5;
  const ex = engineLocalX(t);
  const gx = t.x + Math.cos(t.hullAngle)*(ex*0.8);
  const gy = t.y + Math.sin(t.hullAngle)*(ex*0.8);
  const flick = 0.7 + _flickerAt(7.5, 0x51ed) * 0.3;
  const grad = ctx.createRadialGradient(gx,gy,0, gx,gy,W*1.3);
  grad.addColorStop(0,   `rgba(255,150,45,${0.34*flick})`);
  grad.addColorStop(0.55,`rgba(255,110,35,${0.16*flick})`);
  grad.addColorStop(1,   'rgba(255,90,30,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(gx, gy, W*1.3, 0, TAU); ctx.fill();
  ctx.restore();
}

// 炮弹渲染：细长尖头弹体沿飞行方向 + 弹种色拖尾 + 弹头亮点
// ---------- 电磁轨道炮视效（#U38，2026-10-18） ----------
// 充能进度 0..1（纯函数，绘制期确定性）：1 = 已装填完毕（满电待机），0 = 刚开完火。
//   时长口径与 HUD 装填环 / fireTank 完全同源：
//     dur = stats.reload × primaryWeaponSpec(t).reloadMult ÷ debuffReloadRate(t)
//   （2026-09-21 #G5 修正过的那条：曾漏乘 reloadMult，导致电磁炮前半程进度恒空。）
//   无 reloadT / 无 stats（测试探针、非战斗实体）时返回 1（满电），不会画成半充能。
function railChargeProgress(t){
  if(!t) return 1;
  const spec = (typeof primaryWeaponSpec === 'function') ? primaryWeaponSpec(t) : null;
  if(!spec || spec.type !== 'railgun') return 1;
  const base = (t.stats && t.stats.reload) ? t.stats.reload : 0;
  if(!(base > 0)) return 1;
  const mult = (typeof spec.reloadMult === 'number') ? spec.reloadMult : 1;
  const debuff = (typeof debuffReloadRate === 'function') ? debuffReloadRate(t) : 1;
  const dur = base * mult / (debuff || 1);
  if(!(dur > 0)) return 1;
  const rl = (typeof t.reloadT === 'number') ? t.reloadT : 0;
  if(!(rl > 0)) return 1;
  return Math.max(0, Math.min(1, 1 - rl / dur));
}

// #X6（2026-10-20）：曲射（isArc）弹体的绘制期姿态。**只服务绘制层**——落点/结算/命中判定
//   一律不读这些值，逻辑层零改动。
//
//   高度口径沿用既有的绘制期「假高」，**不引入第二套高度函数**：
//     z(p) = sin(p·π)·H，H = min(120, totalDist·0.35)，p = dist/totalDist
//   伪俯仰直接对该式求导（dz/dp = π·cos(p·π)·H），与地面位移 totalDist 求夹角：
//     pitch = atan2(dz, totalDist)  —— 上升段 > 0（抬头）、顶点 = 0、下坠段 < 0（低头）
//   这是「轴向仰角」，用于纵向透视缩短（foreshorten）。屏幕上的**倾斜**再投影一次：
//   高度在世界里表现为屏幕 −y 位移（drawY -= z），它在「垂直于弹道」方向上的分量才是
//   可读的抬头/低头；沿弹道方向的分量不该表现成旋转（否则 ang≈±90° 时纵向分量
//   会盖过横向位移、把弹体翻成 180°）。故：
//     tilt = atan2(−dz·cos(ang), totalDist)   // ang=0 时恒等于 −pitch
//   不变量：|tilt| = atan(|dz|/D) ≤ 47.7°（H 未截断时 π·0.35 的反正切），永不打 180° 翻面。
//   foreshorten = cos(pitch)，下限 0.55 —— 防止极端参数把弹体压成一条线。
//
//   `scale` 仍是既有的「透视放大」近似（1 + z/90），与 tilt/foreshorten 是两个独立维度。
//
//   ⚠️ **foreshorten 必须作用在弹体长轴（local x），绝不能压弹宽（local y）**——将来若要
//   「优化」这段，第一件最容易被改错的事就是把 `ctx.scale(scale * fore, scale)` 写成
//   `ctx.scale(scale, scale * fore)`。后者看着更像「纵向压缩」，实际语义是错的：
//   弹体沿切线抬离地面后，它**在地面上的投影长度**才是 L·cos(pitch)（长轴缩短）；
//   弹宽垂直于切线且保持水平，不参与缩短。压 y 会让弹体「越飞越细」（宽度随高度收缩），
//   读起来像一枚在缩水的针，而不是一枚抬头的炮弹——实测该写法下光栅主轴角名义上仍有
//   信号，但形态完全失真。2026-10-20 由 Lead 复核确认采用长轴口径。
function arcShellPose(s){
  const D = s.totalDist;
  const p = Math.max(0, Math.min(1, (s.dist || 0) / D));
  const H = Math.min(120, D * 0.35);
  const z = Math.sin(p * Math.PI) * H;
  const dz = Math.PI * Math.cos(p * Math.PI) * H;      // dz/dp（同一 z 公式的导数）
  const pitch = Math.atan2(dz, D);
  const ang = Math.atan2(s.dy, s.dx);
  const tilt = Math.atan2(-dz * Math.cos(ang), D);
  return {
    p: p, H: H, z: z, dz: dz, pitch: pitch, tilt: tilt,
    foreshorten: Math.max(0.55, Math.cos(pitch)),
    scale: 1 + z / 90
  };
}

// ===== 2026-10-22 B5-2：弹种家族（本地映射表，不改 RULES） =====
// PLAN §4.5 B5-2 原本打算在 `RULES.ammoTypes` 每键加 `family`，但 `RULES` 单写者是 role-systems；
// 渲染层按本批分工改为**本地映射表**：`s.ammoKey` → 'ap' | 'he' | 'heat'，未登记键回退 'ap'
// （与「其余 → ap」的初始口径一致）。新增弹种只需在这张表补一行。
const AMMO_FAMILY = {
  ap: 'ap', apcr: 'ap', apds: 'ap', apfsds: 'ap', apfsds_ad: 'ap',
  he: 'he', aphe: 'he', hesh: 'he', proximity_he: 'he', blast_he: 'he',
  heat: 'heat', heatfs: 'heat', tandem_heat: 'heat', heavy_tandem_heat: 'heat'
};
// 弹种键 → 家族（大小写不敏感，未登记回退 'ap'）
function ammoFamilyOf(ammoKey){
  const k = (ammoKey === undefined || ammoKey === null) ? '' : String(ammoKey).toLowerCase();
  return AMMO_FAMILY[k] || 'ap';
}

function drawShells(ctx, shells){
  const SV = RULES.shellVisual;
  const RFx = (RULES.railgunFx) || {};
  for(const s of shells){
    const ang = Math.atan2(s.dy, s.dx);
    const col  = (s.ammo && s.ammo.color) ? s.ammo.color : '#ffb454';
    // 2026-10-22 B5-2：`s.ammo.tail` 只在 railgun 分支之外的旧拖尾用过；家族化之后拖尾颜色
    //   由家族固定（AP 亮蓝白 / HE 橙黄 / HEAT 亮黄芯），故不再读取 tail（保留字段向后兼容）。
    // #U38（2026-10-18）：电磁轨道炮弹体——针状白热电离弹（更长更细）。
    //   #U39（2026-10-19 用户裁定）：**电弧只加在炮身上，不跟随炮弹**——旧的 shellTrailArcs
    //   电弧尾迹已删除，弹体只保留针状外形 + 白热芯晕 + 普通渐隐拖尾。
    const isRail = s.wType === 'railgun';
    const L = SV.length * (isRail ? (RFx.shellLenMult || 1.9) : 1);
    const W = SV.width * (isRail ? 0.55 : 1), tailLen = SV.tailLen * (isRail ? 1.8 : 1);
    // 2026-09-15 W6：autocannon 炮弹尺寸跟随 fxScale 缩小（更细炮管的视觉跟随；其他武器 fxScale=1）
    // #U42（2026-10-19）：副炮塔弹再缩一档（0.7）——它是「小炮塔」，弹体与主炮同大反而看不出是它打的。
    const sv = ((typeof s.fxScale === 'number' && s.fxScale > 0) ? s.fxScale : 1)
      * (s.fromSecondaryTurret ? 0.7 : 1);
    const _L = L * sv, _W = W * sv, _tailLen = tailLen * sv;
    // 2026-10-22 B5-2：家族化的**弹体形状倍率**（railgun 分支不读，保持原样）
    const fam = ammoFamilyOf(s.ammoKey);
    const bodyL = _L * (fam === 'ap' ? 1.15 : fam === 'he' ? 0.85 : 1);
    const bodyW = _W * (fam === 'ap' ? 0.85 : fam === 'he' ? 1.35 : 1);
    ctx.save();
    let drawX = s.x, drawY = s.y, scale = 1;
    // #X6：曲射弹的伪俯仰/纵向缩短（直线弹恒 0/1，不受影响）
    let tilt = 0, fore = 1;
    if(s.isArc && s.totalDist > 0){
      const po = arcShellPose(s);
      const z = po.z;
      drawY -= z;
      scale = po.scale;
      tilt = po.tilt;
      fore = po.foreshorten;
      // 地面阴影：始终**贴地**，只随 ang 与 z 变化，**不跟 tilt 旋转**。
      //   语义依据（2026-10-20 Lead 复核确认）：影子是弹体在**地面**上的投影，不是弹体的
      //   附属物——弹体抬头/低头改变的是它自身姿态，而光源是常顶光，阴影椭圆的朝向只由
      //   地面弹道方向 ang 决定。若把 tilt 也叠进 ellipse 的 rot，影子会跟着弹体一起翘起来，
      //   读作「一枚斜插在地里的炮弹」而不是「离地飞行的炮弹」。
      //   z 越大 → 影子越大越淡（离地越高、光照越散）：半径 ×(1 + z/150)、alpha 线性衰减。
      const shs = 1 + z / 150;
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${(0.3 * Math.max(0.35, 1 - z / 260)).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, W * 1.5 * shs, W * 0.75 * shs, ang, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.translate(drawX, drawY);
    ctx.rotate(ang + tilt);
    // #X6：纵向（local x = 弹体长轴）按 cos(pitch) 透视缩短；横向（local y = 弹宽）不变——
    //   弹轴抬离地面后，它在地面上的投影长度就是 L·cos(pitch)，而弹宽垂直于切线且保持水平，
    //   不被缩短。压反轴会变成「越飞越细」，与真实的俯仰透视不符。
    ctx.scale(scale * fore, scale);
    if(isRail){
      // ① 弹体外发光（白热芯晕，lighter 叠加）。
      //   渲染纪律（specs/combat.md §6「零逐帧渐变分配约束」）：这里**不得**每帧 createRadialGradient，
      //   改走 tank_fx.js 已烘焙的径向 sprite（haloW = 冷白外发光），绘制期只做 drawImage。
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = (RFx.shellGlowScale || 1.35) * Math.max(6, _W * 2.4);
      if (!(typeof _blitRadial === 'function' &&
            _blitRadial(ctx, _radialSprite('haloW', gr), 0, 0, gr, 0.85, 'lighter'))) {
        // 无 canvas 环境（Node 纯逻辑）回退：平涂圆，避免每帧渐变分配
        ctx.fillStyle = 'rgba(255,255,255,0.42)';
        ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU); ctx.fill();
      }
      ctx.restore();
      // ② 渐隐拖尾（普通弹同款手法，白热色）——**不再画电弧**：弧光属于炮身。
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tgR = ctx.createLinearGradient(-_tailLen, 0, 0, 0);
      tgR.addColorStop(0, 'rgba(255,255,255,0)');
      tgR.addColorStop(1, 'rgba(226,240,255,0.80)');
      ctx.strokeStyle = tgR; ctx.lineWidth = Math.max(1.6, _W * 1.1); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-_tailLen, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.restore();
      // ③ 针状弹体（白热芯 + 冷白边）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(_L * 0.5, 0);
      ctx.lineTo(-_L * 0.5, -_W * 0.5);
      ctx.lineTo(-_L * 0.5, _W * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(210,232,255,0.9)'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      ctx.restore();   // 与外层 ctx.save()（进入弹体绘制前的那次）配对
      continue;
    }
    // ===== 2026-10-22 B5-2：三系列弹种特效（AP / HE / HEAT）=====
    // 曲射（isArc）只换弹体形状、姿态仍走上面的伪俯仰（#X6 口径不变）。
    if(fam === 'ap'){
      // AP：细长尖头弹 + **短促直线曳光**（亮蓝白 #cfe9ff，长度 ×0.7，不拖烟）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const apTail = _tailLen * 0.7;
      ctx.strokeStyle = 'rgba(207,233,255,0.72)';
      ctx.lineWidth = Math.max(1, bodyW * 0.55);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-apTail, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.restore();
      // 弹体：细长尖头弹（长 ×1.15、宽 ×0.85）——圆柱段 + 收尖弹头
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      const apHl = bodyL * 0.5, apHw = bodyW * 0.5;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(apHl, 0);                          // 弹尖
      ctx.lineTo(apHl * 0.42, -apHw);               // 弹头肩部
      ctx.lineTo(-apHl * 0.92, -apHw);              // 柱体尾
      ctx.lineTo(-apHl, -apHw * 0.62);              // 尾端收口（弹底）
      ctx.lineTo(-apHl, apHw * 0.62);
      ctx.lineTo(-apHl * 0.92, apHw);
      ctx.lineTo(apHl * 0.42, apHw);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,238,255,0.8)'; ctx.lineWidth = 1;
      ctx.stroke();
      // 弹头亮点（冷白）
      ctx.fillStyle = 'rgba(240,250,255,0.95)';
      ctx.beginPath(); ctx.arc(apHl * 0.30, 0, Math.max(1, 1.1 * sv), 0, TAU); ctx.fill();
      ctx.restore();
    } else if(fam === 'he'){
      // HE：粗短圆头弹 + **断续烟尾**（橙黄 rgba(255,180,84,.55)，每 1/3 段留缝）
      ctx.save();
      const heTail = _tailLen * 1.05;
      for(let seg = 0; seg < 3; seg++){
        const t0 = seg / 3, t1 = (seg + 0.66) / 3;   // 每段留 1/3 的缝
        const x0 = -heTail * (1 - t0), x1 = -heTail * (1 - t1);
        ctx.strokeStyle = 'rgba(255,180,84,0.55)';
        ctx.lineWidth = Math.max(1.6, bodyW * 0.42);
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke();
      }
      // 外扩烟团（无渐变，实色小圆；确定性——不取 Math.random）
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,190,110,0.22)';
      for(let i = 0; i < 3; i++){
        const x = -heTail * (0.55 + i * 0.22);
        ctx.beginPath(); ctx.arc(x, 0, Math.max(1.2, bodyW * (0.30 + i * 0.06)), 0, TAU); ctx.fill();
      }
      ctx.restore();
      // 弹体：粗短圆头（长 ×0.85、宽 ×1.35）——前端半圆鼻 + 平底
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = col;
      const hl = bodyL * 0.5, hw = bodyW * 0.5;
      ctx.beginPath();
      ctx.moveTo(hl - hw, -hw);                     // 圆柱段前缘（上）
      ctx.lineTo(-hl, -hw);                         // 弹底（上）
      ctx.lineTo(-hl, hw);
      ctx.lineTo(hl - hw, hw);                      // 圆柱段前缘（下）
      // 圆头鼻：半圆（用多段折线逼近，mini-canvas/browser 同口径）
      const NOSE = 10;
      for(let i = 1; i <= NOSE; i++){
        const a = Math.PI / 2 - Math.PI * (i / NOSE);   // +π/2 → -π/2
        ctx.lineTo(hl - hw + Math.cos(a) * hw, Math.sin(a) * hw);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.stroke();
      // 引信帽（弹头顶点小亮点）
      ctx.fillStyle = 'rgba(255,240,200,0.9)';
      ctx.beginPath(); ctx.arc(hl - 0.2, 0, Math.max(1, 1.2 * sv), 0, TAU); ctx.fill();
      ctx.restore();
    } else {
      // HEAT：锥形装药（前 1/3 锥 + 后 2/3 柱）+ 橙色射流尾（细亮芯 #ffe27a + 弱外晕）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const jetLen = _tailLen * 1.15;
      const jetW = Math.max(0.8, bodyW * 0.26);
      // 弱外晕（宽而淡——只是"热空气"读数，不能盖掉亮芯）
      ctx.strokeStyle = 'rgba(255,140,60,0.16)';
      ctx.lineWidth = jetW * 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-jetLen, 0); ctx.lineTo(0, 0); ctx.stroke();
      // 细亮芯（alpha 压到 0.72：lighter 叠加下满不透明会糊成白棒）
      ctx.strokeStyle = '#ffe27a';
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = jetW;
      ctx.beginPath(); ctx.moveTo(-jetLen * 0.92, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
      // 弹体：前 1/3 锥 + 后 2/3 柱
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      const cl = bodyL * 0.5, cw = bodyW * 0.5;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(cl, 0);                       // 锥尖（前）
      ctx.lineTo(cl - bodyL * 0.33, -cw);      // 锥底 → 柱体前缘
      ctx.lineTo(-cl, -cw);
      ctx.lineTo(-cl, cw);
      ctx.lineTo(cl - bodyL * 0.33, cw);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,180,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cl, 0);
      ctx.lineTo(cl - bodyL * 0.33, -cw);
      ctx.lineTo(-cl, -cw);
      ctx.lineTo(-cl, cw);
      ctx.lineTo(cl - bodyL * 0.33, cw);
      ctx.closePath(); ctx.stroke();
      // 锥/柱分界亮线（药型罩口）
      ctx.strokeStyle = 'rgba(255,226,122,0.85)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cl - bodyL * 0.33, -cw * 0.92);
      ctx.lineTo(cl - bodyL * 0.33, cw * 0.92);
      ctx.stroke();
      // 弹头射流起点亮点
      ctx.fillStyle = 'rgba(255,240,190,0.95)';
      ctx.beginPath(); ctx.arc(cl, 0, Math.max(1, 1.1 * sv), 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

// ===== 2026-10-22 B5-3（需求 13）：Boss 电磁炮炮线 + 预警 =====
// fx = { kind:'charge'|'fire', x, y, angle, length, width, progress, alpha? }
//   charge → 蓄能期：白 1px 主线 + 3 条 lightningPath 电弧 + 线端光点 + 线两侧淡红晕（预警）
//   fire   → 击发期：白芯 + 冷白外晕，alpha 随调用方淡出（fx.alpha，缺省 1）
// 颜色三档全部取自 RULES.railgunFx（barrelGrey / baseBlue* / arcWhite+arcHalo），
// 不写死色值（下方 `||` 后面只是无 RULES 环境的兜底，与同文件其他 railgun 绘制同款）。
// 绘制期零 Math.random：电弧抖动种子由时间量子 + 进度派生（同帧重绘逐字节一致）。
function drawBossRailLine(ctx, fx){
  if(!ctx || !fx || typeof fx !== 'object') return;
  const kind = (fx.kind === 'fire') ? 'fire' : 'charge';
  const x = (typeof fx.x === 'number') ? fx.x : 0;
  const y = (typeof fx.y === 'number') ? fx.y : 0;
  const ang = (typeof fx.angle === 'number') ? fx.angle : 0;
  const RFx = (RULES && RULES.railgunFx) || {};
  const _white = RFx.arcWhite || '#ffffff';
  const _halo  = RFx.arcHalo  || 'rgba(214,232,255,1)';
  const _base  = RFx.baseBlue || '#2f5d8c';
  const _grey  = RFx.barrelGrey || '#787d84';
  const cfgBoss = (RULES && RULES.boss && RULES.boss.railgun) || {};
  const len = (typeof fx.length === 'number' && fx.length > 0) ? fx.length
    : (typeof cfgBoss.lineLength === 'number' ? cfgBoss.lineLength : 1400);
  const wid = (typeof fx.width === 'number' && fx.width > 0) ? fx.width
    : (typeof cfgBoss.lineWidth === 'number' ? cfgBoss.lineWidth : 6);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const nx = -sa, ny = ca;                       // 法线（用于两侧红晕 / 光点偏移）
  const x2 = x + ca * len, y2 = y + sa * len;
  const _nowQ = Math.floor(((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) * 20) | 0;

  if(kind === 'charge'){
    const p = Math.max(0, Math.min(1, (typeof fx.progress === 'number') ? fx.progress : 0));
    const lineA = 0.25 + 0.5 * p;
    const arcA  = 0.5 + 0.4 * p;
    const amp   = 4 + 6 * p;
    ctx.save();
    ctx.lineCap = 'round';
    // ⓪ 基底蓝衬底（railgunFx.baseBlue）：宽一点点垫在主线之下，读作「导轨之间的能量基底」
    ctx.strokeStyle = _base;
    ctx.globalAlpha = 0.10 + 0.20 * p;
    ctx.lineWidth = Math.max(2, wid * 0.55);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.globalAlpha = 1;
    // ① 主线：白色 1px 实线，alpha = 0.25 + 0.5*progress
    ctx.strokeStyle = _white;
    ctx.globalAlpha = lineA;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.globalAlpha = 1;
    // ② 线两侧淡红晕（预警语言）：宽 width+12、自宽 width/2+6
    //   色值由调用方口径固定为 rgba(255,80,60,0.10)（预警红，不属于炮身三色盘）
    const halfW = wid / 2 + 6;
    ctx.fillStyle = 'rgba(255,80,60,0.10)';
    ctx.beginPath();
    ctx.moveTo(x + nx * halfW, y + ny * halfW);
    ctx.lineTo(x2 + nx * halfW, y2 + ny * halfW);
    ctx.lineTo(x2 - nx * halfW, y2 - ny * halfW);
    ctx.lineTo(x - nx * halfW, y - ny * halfW);
    ctx.closePath();
    ctx.fill();
    // ③ 电弧：3 条沿主线的折线，锯齿幅度 4+6*progress，alpha 0.5+0.4*progress
    ctx.globalCompositeOperation = 'lighter';
    for(let i = 0; i < 3; i++){
      const pts = (typeof lightningPath === 'function')
        ? lightningPath(x, y, ang, len, amp, 7 + i * 2, _nowQ * 0.017 + i * 5.3 + p * 3.1)
        : [{ x: x, y: y }, { x: x2, y: y2 }];
      const jitter = ((_nowQ + i * 7) % 3);        // 0..2 的相位差（确定性）
      const segPts = pts.slice(0, Math.max(2, pts.length - jitter));
      // 外层冷白晕
      ctx.strokeStyle = _halo;
      ctx.globalAlpha = Math.min(1, arcA * 0.42);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(segPts[0].x, segPts[0].y);
      for(let k = 1; k < segPts.length; k++) ctx.lineTo(segPts[k].x, segPts[k].y);
      ctx.stroke();
      // 内层白芯
      ctx.strokeStyle = _white;
      ctx.globalAlpha = Math.min(1, arcA);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    // ④ 线端光点：半径 6+6*progress，白色芯 + 冷白晕
    const dotR = 6 + 6 * p;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = _halo;
    ctx.beginPath(); ctx.arc(x2, y2, dotR * 1.9, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = _white;
    ctx.beginPath(); ctx.arc(x2, y2, dotR, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // ⑤ 炮口端灰色发射器短段（railgunFx.barrelGrey：炮身结构色，给炮线一个"起点锚"）
    ctx.strokeStyle = _grey;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(2, wid * 0.7);
    ctx.beginPath();
    ctx.moveTo(x - ca * 4, y - sa * 4);
    ctx.lineTo(x + ca * Math.max(6, wid), y + sa * Math.max(6, wid));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  // fire：击发期光束（长度/宽度由调用方给，通常 lineLength × lineWidth）
  const a = (typeof fx.alpha === 'number') ? Math.max(0, Math.min(1, fx.alpha)) : 1;
  if(a <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  // 外晕：width*1.6 冷白（railgunFx.arcHalo）
  ctx.strokeStyle = _halo;
  ctx.globalAlpha = 0.42 * a;
  ctx.lineWidth = Math.max(2, wid * 1.6);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  // 白芯：max(2, width*0.5)（railgunFx.arcWhite）
  ctx.strokeStyle = _white;
  ctx.globalAlpha = a;
  ctx.lineWidth = Math.max(2, wid * 0.5);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}


// #U8（2026-10-16 新增）：河流整链绘制——把沿程铺开的一串段 OBB 还原为**单条中心线折线**，
// 用圆角连接的粗折线一次描边（先岸影后河色），彻底消除段间鳞片/砖块接缝与「双轨」线。
// rects 须为同一条河（同 groupId）的段，按沿程顺序传入。河色取 tier.fill（唯一口径
// RULES.coverTiers[tier].fill）。
// #U34（2026-10-18 用户「宽度几乎不变」）：原实现取**中位数单线宽**整条描边——即使数据层
//   有宽度波（buildRiver 的沿程宽度双正弦），渲染也把它抹平成等宽。现改为**可变宽多边形**：
//   沿中心线逐段取半宽（段自身 h/2，即真实横向），左右两侧各生成一条边线后闭合填充，
//   岸影以同一多边形外扩 bankW 再填充。宽度沿程连续变化（相邻段 25% 搭接使过渡平顺）。
function riverHalfWidths(rects){
  // 半宽序列：每段 h/2；前后各点取相邻均值（点 i 的半宽 = 段 (i-1) 与段 i 的平均）
  const hw = rects.map(r => Math.max(1, (r.h > 0 ? r.h : Math.min(r.w || 0, r.h || 0)) / 2));
  const out = hw.map((_, i) => {
    const a = hw[Math.max(0, i - 1)], b = hw[Math.min(hw.length - 1, i + 1)];
    return i === 0 || i === hw.length - 1 ? hw[i] : (a + b) / 2;
  });
  // 轻平滑（3 点加权），防段间搭接采样带来的小台阶
  for(let pass = 0; pass < 2; pass++){
    for(let i = 1; i < out.length - 1; i++) out[i] = out[i] * 0.6 + (out[i - 1] + out[i + 1]) * 0.2;
  }
  return out;
}
const _riverGeomCache = new WeakMap();
function riverChainGeom(rects, bankW){
  // 中心线左/右偏移多边形（世界系）。返回 {left, right} 两个点数组（同序）。
  const n = rects.length;
  const hw = riverHalfWidths(rects);
  const left = [], right = [];
  for(let i = 0; i < n; i++){
    const p = rects[i];
    const a = rects[Math.max(0, i - 1)], b = rects[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;              // 左法线
    const w = hw[i] + (bankW || 0);
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  }
  return { left, right };
}
function _fillVariWidthChain(ctx, geom, fill){
  const { left, right } = geom;
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for(let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for(let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function drawRiverChain(ctx, rects, tier){
  if(!rects || rects.length < 2) return false;
  if(!(medianSegWidth(rects) > 0)) return false;
  const bankW = 6;   // 岸影外露宽度（px）
  ctx.save();
  ctx.lineJoin = 'round';
  // 第 1 遍：岸影（同一中心线、半宽 +bankW 的多边形）
  _fillVariWidthChain(ctx, riverChainGeom(rects, bankW), 'rgba(20,50,80,0.38)');
  // 第 2 遍：河色（真实半宽多边形）
  _fillVariWidthChain(ctx, riverChainGeom(rects, 0), (tier && tier.fill) || '#3578a8');
  ctx.restore();
  return true;
}

// 段短边中位数（河宽估计；偶数取中间两者均值）。
// #U24（2026-10-17 用户反馈「河流生效位置和贴图错位」）：**不能取 min(w,h)**。
//   strip 河段的几何是 `w = 沿程长度`（dist×1.25）、`h = 河宽`（thick×收分系数），
//   `angle` 又恰好是**沿程方向**——所以绘制时的「横向」是 h 而不是 min(w,h)。
//   实测 290/290 段的 min(w,h) 都是 h，但真实河宽中位数 190px 而 min 中位数只有 149px
//   （短段 w≈101 < h），逐段取 min 会让线的粗细在 101~205px 之间抖动，河面忽宽忽窄、
//   与物理判定（真实宽度恒为 h）对不上。正确口径：横向 = 段自身的短轴 = h。
function medianSegWidth(rects){
  const ws = rects.map(r => (r.h > 0 ? r.h : Math.min(r.w || 0, r.h || 0)))
    .filter(w => w > 0).sort((a, b) => a - b);
  if(!ws.length) return 0;
  const m = ws.length >> 1;
  return ws.length % 2 ? ws[m] : (ws[m - 1] + ws[m]) / 2;
}

// 河流段沿程排序：段沿曲线单向铺开，需按**真实走向**排序（非包围盒宽高）。
// #U8b（2026-10-17 修复）：原实现按「包围盒 x 极差 vs y 极差」择轴——对竖直河流（x 几乎不变、
//   y 跨全图）会误判为「按 x 排序」，导致段被乱序连线，河流被画成锯齿/方块串（实测
//   strip-river-0 的段 x 极差仅数百、y 极差 2000+，却因包围盒整体偏宽而按 x 排）。
//   现改为**主成分方向（PCA）投影排序**：对段中心做协方差，取主轴后按投影值排序，
//   对横/竖/斜向河流一律正确。
function orderRiverSegs(segs){
  if(!segs || segs.length < 2) return segs || [];
  const n = segs.length;
  let mx = 0, my = 0;
  for(const s of segs){ mx += s.x; my += s.y; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for(const s of segs){
    const dx = s.x - mx, dy = s.y - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  // 主轴：协方差矩阵最大特征向量方向（2×2 解析解）
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc;
  // 特征向量 (l1 - syy, sxy)（sxy≠0 时）；退化情形回退坐标轴
  let ax, ay;
  if(Math.abs(sxy) > 1e-9){ ax = l1 - syy; ay = sxy; }
  else { if(sxx >= syy){ ax = 1; ay = 0; } else { ax = 0; ay = 1; } }
  const len = Math.hypot(ax, ay) || 1;
  ax /= len; ay /= len;
  return segs.slice().sort((a, b) => ((a.x - mx) * ax + (a.y - my) * ay) - ((b.x - mx) * ax + (b.y - my) * ay));
}

// 水流 streak（浅色短线，横向偏移与相位由位置 hash 确定性派生；沿流向缓慢漂移）。
// 与河流主体分离导出，供调用方在整链描边后单独叠加（Node 生图时无 performance → 相位 0）。
function drawCoverWaterStreak(ctx, cov){
  const rects = (typeof coverSegRects === 'function') ? coverSegRects(cov) : [cov];
  const _now = (typeof performance !== 'undefined' && performance.now) ? performance.now() / 1000 : 0;
  const _h1 = function (n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  for(const r of rects){
    const _ra = r.angle || 0, _rx = Math.cos(_ra), _ry = Math.sin(_ra);
    const _nx = -_ry, _ny = _rx; // 法向
    const _segLen = Math.max(r.w || 0, r.h || 0);
    const _halfW = Math.min(r.w || 0, r.h || 0) / 2;
    const _seed = (r.x || 0) * 0.37 + (r.y || 0) * 0.73;
    for (let _k = 0; _k < 3; _k++) {
      const _lat = (_h1(_seed + _k * 7.3) - 0.5) * 1.1 * _halfW;      // 横向偏移
      const _ph = _h1(_seed + _k * 13.7);                             // 纵向相位 0~1
      const _drift = ((_ph + _now * 0.03) % 1 - 0.5) * _segLen * 0.7; // 缓慢漂移
      const _sl = _segLen * (0.10 + _h1(_seed + _k * 3.1) * 0.10);    // streak 长
      const _cx = r.x + _rx * _drift + _nx * _lat;
      const _cy = r.y + _ry * _drift + _ny * _lat;
      ctx.strokeStyle = 'rgba(220,240,255,' + (0.22 + _h1(_seed + _k * 5.9) * 0.18).toFixed(2) + ')';
      ctx.lineWidth = 1.6 + _h1(_seed + _k * 9.2) * 1.4;
      ctx.beginPath();
      ctx.moveTo(_cx - _rx * _sl, _cy - _ry * _sl);
      ctx.lineTo(_cx + _rx * _sl, _cy + _ry * _sl);
      ctx.stroke();
    }
  }
}

// 地面投影（#U11，2026-10-17 用户需求「建筑、树木需要有淡淡的阴影」）。
// 统一光源假定自左上方，影子落在右下（+x,+y），与坦克炮塔影（paintTurretShadow 的
// 默认偏移）方向一致。只给「立在地上、有体积」的元素投影——建筑/岩石/残骸/植被；
// 水/河/泥/道路等贴地平面与纯装饰件不投影。
// 两层叠加做出软边：近层深、远层淡，零模糊开销（避免 shadowBlur 的逐帧模糊成本）。
//   box / rubble-box / rock-poly → 轮廓多边形投影（按 verts 或 OBB 角点）
//   tree / bush / fallen         → 椭圆投影（树按树冠半径，与 drawAssetCanopy 的 R 同源）
//   wall / stump                 → 细长/小件，只在脚下垫一层很淡的接触影
function drawCoverShadow(ctx, cov){
  const tier = COVER_TIERS && COVER_TIERS[cov.tier];
  if(!tier) return;
  const st = tier.draw;
  // 贴地/平面类（road/mud/water/water-chain/bridge-deck）不投影：早退避免逐段 save/restore
  if(st === 'road' || st === 'mud' || st === 'water' || st === 'water-chain' || st === 'bridge-deck') return;
  const w = cov.w || 24, h = cov.h || 24;
  const ang = cov.angle || 0;   // 防御：angle 缺失时 coverCorners 会得 NaN，投影直接消失
  ctx.save();
  if(st === 'box' || st === 'rubble-box' || st === 'rock-poly'){
    // 建筑/岩石/残骸：偏移轮廓。偏移量随体量微增（大体块影子更长），上限 26px ——
    // nodeScale=3 下建筑世界尺寸 150~450px，固定 12px 偏移在体量旁几乎看不出方向感。
    const off = Math.min(26, 6 + Math.max(w, h) * 0.08);
    // coverCorners 直接用 cov.angle（undefined→NaN 会让整个投影消失），缺省补 0
    const c = (cov.angle === undefined || cov.angle === null)
      ? coverCorners(Object.assign({}, cov, { angle: 0 }))
      : coverCorners(cov);
    const silhouette = (dx, dy, alpha) => {
      ctx.beginPath();
      ctx.moveTo(c[0].x + dx, c[0].y + dy);
      for(let i = 1; i < c.length; i++) ctx.lineTo(c[i].x + dx, c[i].y + dy);
      ctx.closePath();
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fill();
    };
    silhouette(off * 1.0,  off * 1.15, 0.17);     // 远层：最淡，撑出影子长度
    silhouette(off * 0.78, off * 0.90, 0.14);     // 中层：过渡，把 2 层硬边磨成 3 层渐变
    silhouette(off * 0.45, off * 0.52, 0.24);     // 近层：深（接触影，贴墙脚）
    // #U11-2026-10-18：墙脚接地面加一层「接触暗带」——只在轮廓内侧一圈，让体块与地面
    //   有明确接触关系（旧版两块偏移多边形之间总有一条亮缝，看起来像浮在地上）。
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = Math.min(10, 3 + Math.max(w, h) * 0.03);
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    for(let i = 1; i < c.length; i++) ctx.lineTo(c[i].x, c[i].y);
    ctx.closePath();
    ctx.stroke();
  } else if(st === 'tree'){
    // 树冠投影：树冠绘制半径 R = max(w,h)*1.4*0.85（见 tank_assets ASSET_DEFS.tree.bakeCanopy），
    // 影子半径取 0.92R，略偏右下，模拟斜射光下的落影。
    // #U11-2026-10-18：三层同心椭圆（远/中/近）+ 树干脆影点，靠叠加而不是模糊实现软边。
    const R = Math.max(w, h) * 1.4 * 0.85 * 0.98;
    const dy = 5 + Math.min(13, R * 0.20);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath(); ctx.ellipse(cov.x + dy * 0.85, cov.y + dy * 1.1, R * 1.06, R * 0.90, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(cov.x + dy * 0.7, cov.y + dy, R * 1.02, R * 0.84, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.17)';
    ctx.beginPath(); ctx.ellipse(cov.x + dy * 0.35, cov.y + dy * 0.5, R * 0.78, R * 0.62, 0, 0, TAU); ctx.fill();
    // 树干脆影：长椭圆沿光向拉出，把树冠影与树干位置连起来
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(cov.x + dy * 0.28, cov.y + dy * 0.30, Math.max(2.5, w * 0.10), Math.max(2, h * 0.07),
      Math.PI * 0.25, 0, TAU);
    ctx.fill();
  } else if(st === 'bush' || st === 'fallen'){
    const rx = w * 0.42, ry = h * 0.42;
    const dy = 2 + Math.min(6, Math.max(w, h) * 0.08);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.beginPath();
    ctx.ellipse(cov.x + dy * 0.85, cov.y + dy * 1.15, rx * 1.12, ry * 1.12, (cov.angle || 0), 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    ctx.beginPath(); ctx.ellipse(cov.x + dy * 0.6, cov.y + dy, rx, ry, (cov.angle || 0), 0, TAU); ctx.fill();
    // 接触影：中心再压一层小的暗斑，灌木根部才不「飘」
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath();
    ctx.ellipse(cov.x + dy * 0.3, cov.y + dy * 0.4, rx * 0.55, ry * 0.5, (cov.angle || 0), 0, TAU);
    ctx.fill();
  } else if(st === 'wall' || st === 'stump'){
    const dy = 2;
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.beginPath();
    ctx.ellipse(cov.x + dy * 0.9, cov.y + dy * 1.2, Math.max(w, 8) * 0.48, Math.max(h, 6) * 0.48,
      (cov.angle || 0), 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath();
    ctx.ellipse(cov.x + dy * 0.5, cov.y + dy, Math.max(w, 8) * 0.42, Math.max(h, 6) * 0.42,
      (cov.angle || 0), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ===== 2026-10-22 B5-3：掩体（wall）贴图 + 三级破损 =====
// wallStyle 六种：concrete / sandbag / steel / brick / hedgehog / barrier（表见 tank_assets.js）。
// 贴图选择：cov.wallStyle 优先（生成期由 mapgen 写入），缺失时回退 tier.wallStyle（RULES 缺省），
// 再缺失落 concrete。绘制走 `drawAsset(ctx, 'wall:<style>', ...)`——变体键保证缓存不串味。
const WALL_STYLE_FALLBACK = ['concrete', 'sandbag', 'steel', 'brick', 'hedgehog', 'barrier'];
function wallStyleOf(cov, tier){
  const pick = (v) => (v === undefined || v === null) ? '' : String(v);
  const cand = pick(cov && cov.wallStyle) || pick(tier && tier.wallStyle) || 'concrete';
  return WALL_STYLE_FALLBACK.indexOf(cand) >= 0 ? cand : 'concrete';
}
// 三级破损门限（PLAN §4.9.2(c)）：>0.67 完好 / 0.34~0.67 裂纹 / <0.34 重度破损
function wallDamageLevel(cov, tier){
  const maxHp = (tier && typeof tier.hp === 'number' && tier.hp > 0 && Number.isFinite(tier.hp)) ? tier.hp : 0;
  const hp = (typeof cov.hp === 'number') ? cov.hp : (maxHp || Infinity);
  if(!maxHp || !Number.isFinite(hp)) return 0;          // 不可摧毁墙 / 无耐久数据 → 恒完好
  const r = Math.max(0, Math.min(1, hp / maxHp));
  if(r > 0.67) return 0;
  if(r >= 0.34) return 1;
  return 2;
}
// 确定性 hash（绘制期不取 Math.random——同一帧重绘必须逐字节一致）
function _wallHash(n){
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}
// 在墙面上叠加裂纹（2~4 条深色折线）与缺口（1~2 个背景色"洞"多边形）。
// 所有几何由 cov 坐标 hash 派生 → 同一块墙的破损形状恒定，不随帧抖动。
function drawWallDamage(ctx, cov, level){
  if(level <= 0) return;
  const w = cov.w || 24, h = cov.h || 24;
  const ang = cov.angle || 0;
  const seed = (cov.x || 0) * 0.37 + (cov.y || 0) * 0.73;
  // 局部系：长轴 = x（与 bake 的 wallFrame 同口径：竖放墙旋转 90°）
  const vertical = h > w;
  const L = vertical ? h : w, T = vertical ? w : h;
  ctx.save();
  ctx.translate(cov.x, cov.y);
  ctx.rotate(ang + (vertical ? Math.PI / 2 : 0));
  // 裁剪在墙体内：裂纹/缺口不得画到墙外
  ctx.beginPath();
  ctx.rect(-L / 2, -T / 2, L, T);
  ctx.clip();
  // ① 裂纹线：一级 2 条、二级 4 条（折线，2~4 段）
  const nCrack = (level >= 2) ? 4 : 2;
  ctx.strokeStyle = (level >= 2) ? 'rgba(24,22,20,0.75)' : 'rgba(34,32,28,0.62)';
  ctx.lineWidth = Math.max(1, T * 0.07);
  for(let i = 0; i < nCrack; i++){
    const u0 = -L / 2 + L * (0.08 + 0.84 * _wallHash(seed + i * 13.7));
    const v0 = (T / 2) * (_wallHash(seed + i * 7.3) > 0.5 ? 1 : -1);
    const segs = 2 + Math.floor(_wallHash(seed + i * 3.1) * 3);   // 2~4 段
    ctx.beginPath();
    ctx.moveTo(u0, v0);
    let u = u0, v = v0;
    for(let k = 1; k <= segs; k++){
      // 裂纹**横贯墙厚**（纵向从一侧边缘走到另一侧），横向只做小幅锯齿（裂纹不是划痕）
      const du = (T * 0.55) * (_wallHash(seed + i * 19.1 + k * 2.7) - 0.5) * 2;
      const dv = -(v0) * (k / segs) * (0.7 + 0.6 * _wallHash(seed + i * 5.9 + k));
      u = Math.max(-L / 2 + 1, Math.min(L / 2 - 1, u + du));
      v = Math.max(-T / 2 + 0.5, Math.min(T / 2 - 0.5, v + dv));
      ctx.lineTo(u, v);
    }
    ctx.stroke();
  }
  // ② 缺口：一级 1 个、二级 2 个背景色多边形（读作被打穿的洞）。
  //   尺寸按**墙厚**取（墙是 10~14px 的薄条，洞不能比墙还厚），并优先落在上下缘——
  //   贴合「缺角/崩边」的读法，而不是在墙中间开一个大窟窿。
  const nHole = (level >= 2) ? 2 : 1;
  for(let i = 0; i < nHole; i++){
    const cu = -L / 2 + L * (0.14 + 0.72 * _wallHash(seed + 41.3 + i * 11.9));
    const edge = (_wallHash(seed + 17.3 + i * 6.1) > 0.5) ? 1 : -1;
    const cv = edge * (T / 2) * (0.55 + 0.25 * _wallHash(seed + 23.7 + i * 5.1));
    const rw = Math.max(2, T * (0.26 + 0.16 * _wallHash(seed + 61.7 + i * 3.3)));
    const rh = Math.max(1.6, T * (0.30 + 0.18 * _wallHash(seed + 71.3 + i * 9.7)));
    ctx.fillStyle = 'rgba(92,96,74,0.90)';   // 背景色（地表透出的"洞"）
    ctx.beginPath();
    const N = 7;
    for(let k = 0; k < N; k++){
      const a = (k / N) * TAU;
      const rr = 0.72 + 0.28 * _wallHash(seed + i * 31.1 + k * 4.3);
      const px = cu + Math.cos(a) * rw * rr, py = cv + Math.sin(a) * rh * rr;
      if(k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    // 缺口内缘的碎边高光（受光左上）
    ctx.strokeStyle = 'rgba(210,206,190,0.40)'; ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}
// wall 掩体绘制入口：贴图（变体键）→ 三级破损叠加 → 重度破损时整体压暗
function drawWallCover(ctx, cov, tier){
  const style = wallStyleOf(cov, tier);
  const key = 'wall:' + style;
  const w = cov.w || 24, h = cov.h || 24;
  if(typeof drawAsset === 'function' && typeof ASSET_DEFS !== 'undefined' && ASSET_DEFS.wall){
    // 带角度：wall 是单直线段，cov.angle 是真实朝向（与物理 OBB 同源）。
    //   `drawAssetRotated` 由 tank_assets.js（先加载）挂到全局；这里走索引访问，
    //   避免为一个可选通道在 types/globals.d.ts 里新增声明（该文件不属本角色写域）。
    const _drawRot = (typeof globalThis !== 'undefined') ? /** @type {any} */ (globalThis)['drawAssetRotated'] : undefined;
    if(typeof _drawRot === 'function') _drawRot(ctx, key, cov.x, cov.y, w, h, cov.angle || 0);
    else drawAsset(ctx, key, cov.x, cov.y, w, h, cov.angle || 0);
  } else {
    // 资产层缺失（未加载 tank_assets.js / Node 纯逻辑）：平涂兜底，保证物理存在即视觉可见
    const poly = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(poly[0].x, poly[0].y);
    for(let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    ctx.fillStyle = (tier && tier.fill) || 'rgba(138,138,130,0.8)';
    ctx.fill();
    ctx.strokeStyle = (tier && tier.stroke) || '#8a8a82'; ctx.lineWidth = 1.4; ctx.stroke();
  }
  const lvl = wallDamageLevel(cov, tier);
  drawWallDamage(ctx, cov, lvl);
  // 重度破损：整体压暗一层（体积感从"完整墙体"转为"残破断面"）
  if(lvl >= 2){
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#14161a';
    const poly = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(poly[0].x, poly[0].y);
    for(let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// 地图元素分层绘制（§2.7）：box=矩形掩体（含标签）保持程序化；wall/stump/rubble/
// bush/tree/fallen 走资产层（js/tank_assets.js：ASSET_DEFS 注册表 + drawAsset——有图
// drawImage / 无图烘焙缓存，画法与旧内联分支逐字一致）。树冠叶片（bush/tree/fallen 的上层
// 叶片）由 drawFoliage 在坦克之上调用 drawAssetCanopy 形成视线遮挡。
// wall（2026-10-22 B5-3）：单直线墙体 + 六种 wallStyle 贴图族；破损按 hp/maxHp 分三级叠加。
// road（#87）：地面类扁平条带，由 battle 按 tierGroup='ground' 垫底绘制，不遮单位。
function drawCover(ctx, cov){
  const tier = COVER_TIERS[cov.tier];
  // #U11：先落地面投影，再画实体（两层软边影，见 drawCoverShadow）
  drawCoverShadow(ctx, cov);
  if(tier.draw === 'box'){
    const c = coverCorners(cov);
    // #TEX13：建筑/全高掩体的侧壁（右下偏移暗色体块），顶面（屋顶）盖住其余部分；
    //   不然俯视建筑就是一块平色矩形，只有影子没有高度。
    ctx.fillStyle = 'rgba(58,44,36,0.88)';
    ctx.beginPath();
    ctx.moveTo(c[0].x + 4.5, c[0].y + 5.6);
    for(let i = 1; i < c.length; i++) ctx.lineTo(c[i].x + 4.5, c[i].y + 5.6);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill; ctx.fill();
    ctx.strokeStyle = tier.stroke; ctx.lineWidth=2; ctx.stroke();
    // #1（2026-10-16）：建筑屋顶参考真实人字坡屋顶——屋脊线 + 两坡明暗 + 瓦片横纹 + 屋檐。
    // 全部确定性（坐标 hash），不动包围盒。
    const _bx = cov.x, _by = cov.y, _bw = cov.w || 40, _bh = cov.h || 40;
    const _bang = cov.angle || 0;
    const _bh1 = function (n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    const _bseed = _bx * 0.913 + _by * 0.717;
    // #1（2026-10-16）：多种屋顶样式（按 hash 选择）：0=人字坡，1=平顶，2=四坡顶
    const _roofStyle = Math.floor(_bh1(_bseed + 3.1) * 3);
    ctx.save();
    ctx.translate(_bx, _by); ctx.rotate(_bang);
    const _hw = _bw / 2, _hh = _bh / 2;
    if (_roofStyle === 1) {
      // —— 平顶：女儿墙 + 屋面机房/水箱 ——
      ctx.fillStyle = 'rgba(120,110,100,0.95)';  // 屋面
      ctx.fillRect(-_hw, -_hh, _hw * 2, _hh * 2);
      // 女儿墙（内收边框）
      ctx.strokeStyle = 'rgba(80,70,60,1.0)'; ctx.lineWidth = 4;
      ctx.strokeRect(-_hw + 2, -_hh + 2, _hw * 2 - 4, _hh * 2 - 4);
      ctx.strokeStyle = 'rgba(160,150,135,0.6)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(-_hw + 6, -_hh + 6, _hw * 2 - 12, _hh * 2 - 12);
      // 屋面机房
      const _mx = (_bh1(_bseed + 11.7) - 0.5) * _hw * 0.8;
      const _my = (_bh1(_bseed + 23.3) - 0.5) * _hh * 0.8;
      const _mw2 = Math.min(22, _hw * 0.35), _mh2 = Math.min(16, _hh * 0.3);
      ctx.fillStyle = 'rgba(95,88,80,1.0)';
      ctx.fillRect(_mx - _mw2/2, _my - _mh2/2, _mw2, _mh2);
      ctx.fillStyle = 'rgba(70,65,58,1.0)';
      ctx.fillRect(_mx - _mw2/2, _my - _mh2/2, _mw2, 3);  // 阴影边
      // 水箱/通风管
      const _vx = (_bh1(_bseed + 37.9) - 0.5) * _hw * 1.2;
      const _vy = (_bh1(_bseed + 41.2) - 0.5) * _hh * 1.2;
      ctx.fillStyle = 'rgba(110,120,130,1.0)';
      ctx.beginPath(); ctx.arc(_vx, _vy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(80,88,96,1.0)';
      ctx.beginPath(); ctx.arc(_vx, _vy, 5, Math.PI, Math.PI * 2); ctx.fill();
    } else if (_roofStyle === 2) {
      // —— 四坡顶：中心点 + 四面坡 ——
      const _cx0 = 0, _cy0 = 0;
      // 四个三角形坡面（上/下/左/右，明暗不同）
      ctx.fillStyle = 'rgba(128,84,58,0.95)';  // 上（深）
      ctx.beginPath(); ctx.moveTo(-_hw, -_hh); ctx.lineTo(_hw, -_hh); ctx.lineTo(_cx0, _cy0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(148,98,66,0.95)';  // 下（浅）
      ctx.beginPath(); ctx.moveTo(-_hw, _hh); ctx.lineTo(_hw, _hh); ctx.lineTo(_cx0, _cy0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(138,91,62,0.95)';  // 左（中）
      ctx.beginPath(); ctx.moveTo(-_hw, -_hh); ctx.lineTo(-_hw, _hh); ctx.lineTo(_cx0, _cy0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(118,78,54,0.95)';  // 右（中深）
      ctx.beginPath(); ctx.moveTo(_hw, -_hh); ctx.lineTo(_hw, _hh); ctx.lineTo(_cx0, _cy0); ctx.closePath(); ctx.fill();
      // 脊线（四条）
      ctx.strokeStyle = 'rgba(70,42,28,1.0)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-_hw, -_hh); ctx.lineTo(_cx0, _cy0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(_hw, -_hh); ctx.lineTo(_cx0, _cy0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-_hw, _hh); ctx.lineTo(_cx0, _cy0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(_hw, _hh); ctx.lineTo(_cx0, _cy0); ctx.stroke();
      // 中心宝顶
      ctx.fillStyle = 'rgba(90,55,40,1.0)';
      ctx.fillRect(_cx0 - 4, _cy0 - 4, 8, 8);
    } else {
    // —— 人字坡屋顶（默认） ——
    // 屋脊方向：沿长边（_bw >= _bh 时屋脊横向，否则纵向）
    const _ridgeH = _bw >= _bh;
    const _rl = _ridgeH ? _hw : _hh;  // 屋脊半长
    const _rw = _ridgeH ? _hh : _hw;  // 坡面半宽
    // 屋檐：外扩 6% 的深色底
    ctx.fillStyle = 'rgba(45,25,18,0.85)';
    if (_ridgeH) ctx.fillRect(-_hw * 1.06, -_hh * 1.06, _hw * 2.12, _hh * 2.12);
    else ctx.fillRect(-_hw * 1.06, -_hh * 1.06, _hw * 2.12, _hh * 2.12);
    // 两坡：向阳面稍浅、背阴面稍深（微妙明暗，色差收敛）
    const _slopeLight = 'rgba(148,98,66,0.95)';
    const _slopeDark = 'rgba(128,84,58,0.95)';
    if (_ridgeH) {
      // 上坡（背阴，深）
      ctx.fillStyle = _slopeDark;
      ctx.fillRect(-_hw, -_hh, _hw * 2, _hh);
      // 下坡（向阳，浅）
      ctx.fillStyle = _slopeLight;
      ctx.fillRect(-_hw, 0, _hw * 2, _hh);
    } else {
      // 左坡（向阳，浅）
      ctx.fillStyle = _slopeLight;
      ctx.fillRect(-_hw, -_hh, _hw, _hh * 2);
      // 右坡（背阴，深）
      ctx.fillStyle = _slopeDark;
      ctx.fillRect(0, -_hh, _hw, _hh * 2);
    }
    // 屋脊线：深色脊
    ctx.fillStyle = 'rgba(70,42,28,1.0)';
    if (_ridgeH) ctx.fillRect(-_hw, -2.5, _hw * 2, 5);
    else ctx.fillRect(-2.5, -_hh, 5, _hh * 2);
    ctx.strokeStyle = 'rgba(255,220,180,0.25)'; ctx.lineWidth = 1;
    if (_ridgeH) { ctx.beginPath(); ctx.moveTo(-_hw, -1.5); ctx.lineTo(_hw, -1.5); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-1.5, -_hh); ctx.lineTo(-1.5, _hh); ctx.stroke(); }
    // 瓦片横纹：沿坡面方向的等距线（确定性间距）
    ctx.strokeStyle = 'rgba(60,35,22,0.35)'; ctx.lineWidth = 1;
    const _tileStep = 9;
    if (_ridgeH) {
      for (let _ty = _tileStep; _ty < _hh; _ty += _tileStep) {
        ctx.beginPath(); ctx.moveTo(-_hw, -_ty); ctx.lineTo(_hw, -_ty); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-_hw, _ty); ctx.lineTo(_hw, _ty); ctx.stroke();
      }
      // 瓦片竖缝（错缝，deterministic 偏移）
      for (let _tx = -_hw + 6; _tx < _hw; _tx += 12) {
        const _off = (_bh1(_bseed + _tx) - 0.5) * 6;
        ctx.beginPath(); ctx.moveTo(_tx + _off, -_hh); ctx.lineTo(_tx + _off, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(_tx - _off, 0); ctx.lineTo(_tx - _off, _hh); ctx.stroke();
      }
    } else {
      for (let _tx = _tileStep; _tx < _hw; _tx += _tileStep) {
        ctx.beginPath(); ctx.moveTo(-_tx, -_hh); ctx.lineTo(-_tx, _hh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(_tx, -_hh); ctx.lineTo(_tx, _hh); ctx.stroke();
      }
      for (let _ty = -_hh + 6; _ty < _hh; _ty += 12) {
        const _off = (_bh1(_bseed + _ty) - 0.5) * 6;
        ctx.beginPath(); ctx.moveTo(-_hw, _ty + _off); ctx.lineTo(0, _ty + _off); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, _ty - _off); ctx.lineTo(_hw, _ty - _off); ctx.stroke();
      }
    }
    // 烟囱：1~2 个 deterministic 位置
    const _nChim = 1 + Math.floor(_bh1(_bseed + 7.3) * 2);
    ctx.fillStyle = 'rgba(90,55,40,1.0)';
    for (let _ci = 0; _ci < _nChim; _ci++) {
      const _cx = (_bh1(_bseed + _ci * 13.7) - 0.5) * _hw * 1.2;
      const _cy = (_bh1(_bseed + _ci * 29.1) - 0.5) * _hh * 1.2;
      const _cs = Math.min(8, Math.min(_hw, _hh) * 0.18);
      ctx.fillRect(_cx - _cs/2, _cy - _cs/2, _cs, _cs);
      ctx.fillStyle = 'rgba(40,25,18,1.0)';
      ctx.fillRect(_cx - _cs/2, _cy - _cs/2, _cs, 2);
      ctx.fillStyle = 'rgba(90,55,40,1.0)';
    }
    }  // end 人字坡 else
    ctx.restore();
    ctx.fillStyle = tier.stroke; ctx.font='10px "JetBrains Mono", monospace';
    ctx.fillText(tier.label, cov.x-24, cov.y-cov.h/2-6);
  } else if(tier.draw === 'mud'){
    // P-40 烂泥地：暗褐斑块 + 湿润高光点（高光偏移由坐标派生，确定性）
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill; ctx.fill();
    ctx.strokeStyle = tier.stroke; ctx.lineWidth=1.5; ctx.stroke();
    for(let i=0;i<3;i++){
      const hx = cov.x + (((cov.x + i*37) % 100)/100 - 0.5) * cov.w * 0.6;
      const hy = cov.y + (((cov.y + i*53) % 100)/100 - 0.5) * cov.h * 0.6;
      ctx.fillStyle = 'rgba(180,160,120,0.35)';
      ctx.beginPath(); ctx.arc(hx, hy, Math.max(1.5, Math.min(cov.w,cov.h)*0.06), 0, TAU); ctx.fill();
    }
  } else if(tier.draw === 'rock-poly'){
    // P-40 岩石：verts 多边形灰岩。
    // #TEX13-2026-10-18：从「平涂多边形 + 两条棱线」升级为**多面体**：
    //   ① 右下偏移的暗色侧壁（高度）；② 以质心为顶点、逐边三角面按法线·光向着色
    //   （左上亮、右下暗）；③ 受光棱边高光；④ 2 条裂缝。全部由 cover 顶点确定性派生。
    const c = coverCorners(cov);
    const n = c.length;
    let gx = 0, gy = 0;
    for(const p of c){ gx += p.x; gy += p.y; }
    gx /= n; gy /= n;
    // ① 侧壁（世界光反向偏移）
    const swx = 3.5, swy = 4.6;
    ctx.fillStyle = 'rgba(62,62,58,0.95)';
    ctx.beginPath();
    ctx.moveTo(c[0].x + swx, c[0].y + swy);
    for(let i = 1; i < n; i++) ctx.lineTo(c[i].x + swx, c[i].y + swy);
    ctx.closePath(); ctx.fill();
    // ② 逐边三角面
    const Lx = -0.7071, Ly = -0.7071;
    for(let i = 0; i < n; i++){
      const a = c[i], b = c[(i + 1) % n];
      let nx = b.y - a.y, ny = -(b.x - a.x);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      // 外向法线
      const mx = (a.x + b.x) / 2 - gx, my = (a.y + b.y) / 2 - gy;
      if(nx * mx + ny * my < 0){ nx = -nx; ny = -ny; }
      const lit = Math.max(0, nx * Lx + ny * Ly);
      const t = 0.22 + 0.62 * lit;
      const tone = Math.round(74 + (188 - 74) * t);
      ctx.fillStyle = `rgba(${tone},${tone},${Math.round(tone*0.96)},0.95)`;
      ctx.beginPath();
      ctx.moveTo(gx, gy); ctx.lineTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.closePath(); ctx.fill();
    }
    // ③ 受光棱边高光
    ctx.strokeStyle = 'rgba(232,232,222,0.28)';
    ctx.lineWidth = 1.2;
    for(let i = 0; i < n; i++){
      const a = c[i], b = c[(i + 1) % n];
      let nx = b.y - a.y, ny = -(b.x - a.x);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      const mx = (a.x + b.x) / 2 - gx, my = (a.y + b.y) / 2 - gy;
      if(nx * mx + ny * my < 0){ nx = -nx; ny = -ny; }
      if(nx * Lx + ny * Ly > 0.25){
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    // ④ 裂缝
    ctx.strokeStyle = 'rgba(48,48,44,0.55)';
    ctx.lineWidth = 1;
    for(let k = 0; k < 2; k++){
      const i = (k * 3 + 1) % n;
      ctx.beginPath();
      ctx.moveTo(gx + (c[i].x - gx) * 0.15, gy + (c[i].y - gy) * 0.15);
      ctx.lineTo(gx + (c[i].x - gx) * 0.55 + 2, gy + (c[i].y - gy) * 0.55 - 1);
      ctx.lineTo(gx + (c[i].x - gx) * 0.82, gy + (c[i].y - gy) * 0.82);
      ctx.stroke();
    }
    // ⑤ 暗色勾线
    ctx.strokeStyle = tier.stroke; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y);
    for(let i = 1; i < n; i++) ctx.lineTo(c[i].x, c[i].y);
    ctx.closePath(); ctx.stroke();
  } else if(tier.draw === 'rubble-box'){
    // P-40 残破建筑（ruined）：破损轮廓 box——主体 box + 缺口锯齿线
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill; ctx.fill();
    ctx.strokeStyle = tier.stroke; ctx.lineWidth=2; ctx.stroke();
    // 破损轮廓：沿对角的两条锯齿裂缝
    ctx.strokeStyle = 'rgba(30,28,24,0.5)'; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(cov.x - cov.w*0.3, cov.y - cov.h*0.35);
    ctx.lineTo(cov.x - cov.w*0.1, cov.y - cov.h*0.05);
    ctx.lineTo(cov.x - cov.w*0.25, cov.y + cov.h*0.25);
    ctx.moveTo(cov.x + cov.w*0.32, cov.y + cov.h*0.3);
    ctx.lineTo(cov.x + cov.w*0.08, cov.y + cov.h*0.02);
    ctx.lineTo(cov.x + cov.w*0.22, cov.y - cov.h*0.28);
    ctx.stroke();
  } else if(tier.draw === 'water-chain'){
    // #R1 河面连续绘制（2026-10-13）：同组河段在数据层仍逐段落盘（连续性审计口径），
    // 渲染层不再逐段描边——半透明 fill + 每段 stroke 是「一段一段矩形叠加」观感的根因
    // （重叠区 alpha 二次叠加变深 + 每段 1.5px 描边形成网格线）。现改为不透明底色填充
    // （重叠同色无缝合并）+ 无描边 + 沿长轴单线高光；段间 25% 搭接保证外缘台阶为数 px 级。
    const rects = (typeof coverSegRects === 'function') ? coverSegRects(cov) : [cov];
    // #U8（2026-10-16 修复）：河流改由调用方按 groupId 合并整条链后一次性绘制
    //   （battle 的 drawRiverChain 调用点）。本分支仅作**单段/退化回退**：dev 随机场或无 groupId
    //   的孤立水段走这里。原缺陷：每段沿长轴两侧各画一条 rgba(20,50,80,0.28) 深色线且画在
    //   fill 之后，段段相连后合成两条贯穿全程的平行粗线（用户实测「像铁轨一样」）。
    if(!drawRiverChain(ctx, rects, tier)){
      // 退化（<2 段）：直接填充矩形并描岸影，保证水域一定可见
      for(const r of rects){
        const rc = partCorners(r.x, r.y, r.angle||0, r.w/2, r.h/2);
        ctx.beginPath(); ctx.moveTo(rc[0].x,rc[0].y);
        for(let i=1;i<rc.length;i++) ctx.lineTo(rc[i].x,rc[i].y);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(20,50,80,0.38)'; ctx.lineWidth = 12; ctx.stroke();
        ctx.fillStyle = tier.fill || '#3578a8'; ctx.fill();
      }
    }
    drawCoverWaterStreak(ctx, cov);
  } else if(tier.draw === 'water'){
    // ISSUE 3：水域可见——半透明蓝 blob（verts 多边形或矩形回退），区别于地形绿/褐/灰
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(60,110,150,0.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(150,200,230,0.7)'; ctx.lineWidth=1.5; ctx.stroke();
    // 涟漪高光：质心向外的浅弧（确定性，无需 rng）
    let gx=0, gy=0; for(const p of c){ gx+=p.x; gy+=p.y; } gx/=c.length; gy/=c.length;
    ctx.strokeStyle = 'rgba(180,220,245,0.45)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.arc(gx, gy, Math.min(cov.w, cov.h)*0.28, 0.4, Math.PI*0.9);
    ctx.stroke();
  } else if(tier.draw === 'bridge-deck'){
    // #R1 桥面绘制（2026-10-13）：与 road 同款沥青底（路面语言连续）+ 两侧护栏线 +
    // 桥向中线虚线（沿桥向=长边，白虚线），去 box 文本标签；battle 把 bridge 画在河面之上。
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill || '#5a5750'; ctx.fill();
    ctx.strokeStyle = tier.stroke || '#33312c'; ctx.lineWidth=2; ctx.stroke();
    ctx.save();
    ctx.translate(cov.x, cov.y);
    ctx.rotate(cov.angle || 0);
    const hl = Math.max(cov.w, cov.h) / 2, hw = Math.min(cov.w, cov.h) / 2;
    ctx.strokeStyle = 'rgba(235,220,170,0.75)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-hl*0.92, -hw*0.78); ctx.lineTo(hl*0.92, -hw*0.78);
    ctx.moveTo(-hl*0.92, hw*0.78); ctx.lineTo(hl*0.92, hw*0.78);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,235,210,0.65)'; ctx.lineWidth = 2;
    ctx.setLineDash([14,10]);
    ctx.beginPath(); ctx.moveTo(-hl*0.92, 0); ctx.lineTo(hl*0.92, 0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if(tier.draw === 'road'){
    // #87 村庄道路：扁平沥青条带（tierGroup='ground' → battle 地面图层垫底绘制，
    // 画在坦克之下不遮单位；tank_bench 全掩体先于坦克绘制，同样垫底）。
    // 深灰沥青 + 边缘浅描边 + 中线虚线（虚线沿长轴、无随机相位，确定性）。
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill || '#3c3c3e'; ctx.fill();
    ctx.strokeStyle = 'rgba(210,205,190,0.35)'; ctx.lineWidth=1.5; ctx.stroke();
    // 中线虚线（沿条带长轴方向）
    ctx.save();
    ctx.translate(cov.x, cov.y);
    ctx.rotate(cov.angle || 0);
    ctx.strokeStyle = 'rgba(225,220,195,0.55)'; ctx.lineWidth = 2;
    ctx.setLineDash([12,10]);
    ctx.beginPath();
    if(cov.w >= cov.h){ ctx.moveTo(-cov.w*0.46, 0); ctx.lineTo(cov.w*0.46, 0); }
    else { ctx.moveTo(0, -cov.h*0.46); ctx.lineTo(0, cov.h*0.46); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if(tier.draw === 'wall'){
    // ===== 2026-10-22 B5-3：掩体（wall）绘制 =====
    // 复用资产层：`wall:<wallStyle>` 变体键 → ASSET_DEFS.wall.bake 按 style 分派、
    // 缓存键含变体（同一 canvas 不混用不同贴图）。
    drawWallCover(ctx, cov, tier);
  } else if(typeof ASSET_DEFS !== 'undefined' && ASSET_DEFS[tier.draw]){
    // 资产层：stump/rubble/bush/tree/fallen（依赖 js/tank_assets.js 先加载）
    drawAsset(ctx, tier.draw, cov.x, cov.y, cov.w, cov.h, cov.angle||0);
  } else {
    // 兜底渲染逻辑：资产缺失或未知 drawStyle 时，绘制半透明彩色框，确保物理存在即视觉可见
    const c = coverCorners(cov);
    ctx.beginPath(); ctx.moveTo(c[0].x,c[0].y);
    for(let i=1;i<c.length;i++) ctx.lineTo(c[i].x,c[i].y);
    ctx.closePath();
    ctx.fillStyle = tier.fill || 'rgba(128,128,128,0.5)'; ctx.fill();
    ctx.strokeStyle = tier.stroke || '#888'; ctx.lineWidth=1.5; ctx.stroke();
  }
}

// 树冠 / 灌木叶片层：画在所有坦克之上，实现"遮挡视线"的表现（§2.7）。
// 叶片画法已下沉为 ASSET_DEFS[key].bakeCanopy（js/tank_assets.js），此处保留
// hp/vision 逐元素过滤后改走 drawAssetCanopy。
function drawFoliage(ctx, covers){
  for(const cov of covers){
    if(cov.hp === 0) continue;
    const tier = COVER_TIERS[cov.tier];
    if(tier.vision !== true) continue;
    // #1（2026-10-16）：雪地积雪树——白色树冠
    if (cov.variant === 'snowy' && cov.tier === 'tree') {
      ctx.save();
      ctx.translate(cov.x, cov.y);
      // #TEX15-2026-10-19：雪地树冠同样弃用整椭圆——波浪轮廓 + 积雪高光团
      ctx.fillStyle = 'rgba(235,242,246,0.92)';
      ctx.strokeStyle = 'rgba(200,215,225,0.8)';
      ctx.lineWidth = 2;
      const sb = (j) => 0.88 + 0.08*Math.sin(j*3 + 0.7) + 0.05*Math.sin(j*7 + 1.9);
      if(typeof blobPath === 'function'){
        blobPath(ctx, 0, 0, cov.w * 0.55, cov.h * 0.55, 0, sb, 28);
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, cov.w * 0.55, cov.h * 0.55, 0, 0, Math.PI * 2);
      }
      ctx.fill(); ctx.stroke();
      // 积雪高光
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      if(typeof blobPath === 'function'){
        blobPath(ctx, -cov.w * 0.15, -cov.h * 0.15, cov.w * 0.3, cov.h * 0.25, -0.3, (j)=>0.85 + 0.15*Math.sin(j*2.9), 12);
      } else {
        ctx.beginPath();
        ctx.ellipse(-cov.w * 0.15, -cov.h * 0.15, cov.w * 0.3, cov.h * 0.25, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
      continue;
    }
    if(typeof ASSET_DEFS !== 'undefined' && ASSET_DEFS[tier.draw] && ASSET_DEFS[tier.draw].bakeCanopy){
      drawAssetCanopy(ctx, tier.draw, cov.x, cov.y, cov.w, cov.h);
    }
  }
}

// ---------- 整车精灵替换通道（四层：履带/车体/炮塔/炮管） ----------
// spriteBarrelImages(t): 按主武器类型返回炮管图片数组（双管返回两张）。
//   standard/clip → 优先本车专用 imgVehicle（#L4：此前 imgHummel/imgPanzerIV 是死配置），
//   无则回退 imgStandard；autocannon → imgAutocannon；railgun → imgRailgun；
//   double_barrel → 两张同一来源图（横向偏移绘制）。
function spriteBarrelImages(t){
  const sp = t.sprite, b = (sp && sp.barrel) || {};
  const type = (t.weapons && t.weapons.primary && t.weapons.primary.type) || 'standard';
  const std = b.imgVehicle || b.imgStandard || 'assets/tanks/barrels/barrel-standard.png';
  const ac  = b.imgAutocannon || 'assets/tanks/barrels/barrel-autocannon.png';
  const rg  = b.imgRailgun || 'assets/tanks/barrels/barrel-railgun.png';
  let paths;
  if(type === 'autocannon') paths = [ac];
  else if(type === 'railgun') paths = [rg];
  else paths = [std];
  if(type === 'double_barrel') paths = [std, std];
  return paths.map(p => spriteImage(p)).filter(Boolean);
}
// spriteReady(t): 精灵已启用且四层图片都已加载完成。
function spriteReady(t){
  const sp = t.sprite;
  if(!sp || !sp.enabled) return false;
  const hi = spriteImage(sp.hull && sp.hull.img);
  const ti = spriteImage(sp.turret && sp.turret.img);
  if(!(hi && hi.complete && hi.naturalWidth && ti && ti.complete && ti.naturalWidth)) return false;
  const trk = spriteImage(sp.track && sp.track.img);
  if(!(trk && trk.complete && trk.naturalWidth)) return false;
  const bis = spriteBarrelImages(t);
  if(!bis.length) return false;
  for(const bi of bis){ if(!(bi.complete && bi.naturalWidth)) return false; }
  return true;
}
// drawSpriteTracks(ctx, t): 四层管线 Layer 0 —— 滚动履带条（车体之下）。
// 左右各一条 track-links.png 平铺带，随 hullAngle 旋转，用 t.trackPhase 滚动。
// 相位口径：滚动周期 = 整幅贴图宽度（track-links.png 宽 2548px 恰为 13×196px 链节周期的
// 整数倍，整幅首尾无缝）——不硬编码 196，换贴图后相位仍与平铺栅格自洽。
// 方向：与程序化 paintTracks 同源（该处 lineDashOffset = -phase，链节随 phase 增大向 +x 移动），
// 故此处同样取 +phase，否则两通道对同一 trackPhase 反向滚动。
function drawSpriteTracks(ctx, t){
  const sp = t.sprite, tr = (sp && sp.track) || {};
  const img = spriteImage(tr.img || 'assets/tanks/track-links.png');
  if(!img || !img.complete || !img.naturalWidth) return;
  const tw = t.trackWidth || 8;
  const s = (tr.scale > 0) ? tr.scale : tw / img.naturalHeight;
  const W = (t.hullWid || 30) / 2;
  const trackOff = t.trackOffset || 0;
  const L = t.hullLen || 60;
  const dx = tr.dx || 0, dy = tr.dy || 0;
  const tileLen = img.naturalWidth * s;
  const phase = (((t.trackPhase || 0) % tileLen) + tileLen) % tileLen;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.hullAngle || 0);
  for(const dir of [-1, 1]){
    const cy = dir * (W + trackOff + tw / 2) + dy;
    const x0 = dx - L / 2, x1 = dx + L / 2;
    const y0 = cy - tw / 2, y1 = cy + tw / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    const drawH = img.naturalHeight * s;
    const yImg = cy - drawH / 2;
    // #15①（2026-10-20 用户反馈「履带的动画长度 > 履带贴图长度」）：
    //   旧平铺从 `x0 + phase − tileLen` 起步、单向铺到 x1 ⇒ **一端完整、另一端被裁成残块**，
    //   加上相位漂移，视觉上就是「动画比贴图长、尾部露一截」。现改为**以车体中心对称平铺**：
    //   两端各铺 ceil(L/2/tileLen) 块，裁切量左右相等，滚动的是一整条连续带。
    const halfTiles = Math.ceil((L / 2) / tileLen) + 1;
    for(let k = -halfTiles; k <= halfTiles; k++){
      const x = dx + k * tileLen - (phase % tileLen) - (phase < 0 ? tileLen : 0);
      if(x > x1 || x + tileLen < x0) continue;
      ctx.drawImage(img, x, yImg, tileLen, drawH);
    }
    ctx.restore();
  }
  ctx.restore();
}
// drawSpriteBarrel(ctx, t, img, lateralOff): 四层管线 Layer 3 —— 炮管贴图。
// 炮管尾端 pivot 对准「座圈中心 + 炮塔局部 (mountDx-embed, mountDy+lateralOff)」旋转 turretAngle，
// 长度按 t.barrel.len（% turLen）缩放，带开火后座（复用 recoilT 逻辑）。
function drawSpriteBarrel(ctx, t, img, lateralOff){
  const sp = t.sprite, b = (sp && sp.barrel) || {};
  if(!img || !img.complete || !img.naturalWidth) return;
  const mountDx = +b.mountDx || 0, mountDy = +b.mountDy || 0;
  const embed = (b.embed !== undefined && b.embed !== null && b.embed !== '') ? +b.embed : 2;
  const scaleMult = +b.scaleMult || 1;
  const _bSpec = t.barrel || { len: 120 };
  let barrelLen = (t.turLen || 34) * Math.max(0, Math.min(3, (_bSpec.len || 120) / 100));
  let barrelWidMult = 1;
  const wtype = (t.weapons && t.weapons.primary && t.weapons.primary.type) || 'standard';
  if(wtype === 'autocannon'){
    const _ac = (t.weapons.primary.stats) || {};
    barrelLen *= (typeof _ac.barrelLenMult === 'number') ? _ac.barrelLenMult : 0.8;
    // 2026-10-22 B5-1：`barrelWidthMult` 通道——此前精灵分支只吃 barrelLenMult，
    //   于是同一辆 autocannon 在 sprite.enabled 时炮管**不比标准炮细**，与程序化分支不一致。
    //   宽度对贴图是**横向**缩放：长轴 scale 照旧、横向再乘该系数（见 paintPartSprite 的 extra）。
    if(typeof _ac.barrelWidthMult === 'number') barrelWidMult = Math.max(0.1, _ac.barrelWidthMult);
  }
  const scale = barrelLen / img.naturalWidth * scaleMult;
  const _recoilT = t.recoilT || 0;
  let recoilOff = 0;
  if(_recoilT > 0){
    const _rc = Math.min(1, Math.max(0, _recoilT / 0.08));
    recoilOff = 5 * Math.sin(Math.PI * _rc);
  }
  const ang = superstructureAngle(t);
  const pOff = turretPivot(t);
  const r = rotate(mountDx - embed, mountDy + (lateralOff || 0), ang);
  const bx = pOff.x + r.x - Math.cos(ang) * recoilOff;
  const by = pOff.y + r.y - Math.sin(ang) * recoilOff;
  // barrelWidMult === 1 时走原调用（逐字节零回归）；≠1 时**横向压缩**贴图：
  //   pivot 仍是图片中线，因此压缩后炮管仍以炮塔轴线居中。
  if(barrelWidMult !== 1){
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang);
    ctx.scale(1, barrelWidMult);
    ctx.drawImage(img, 0, -img.naturalHeight * scale / 2, img.naturalWidth * scale, img.naturalHeight * scale);
    ctx.restore();
    return;
  }
  paintPartSprite(ctx, img, bx, by, ang, 1, scale, 0, 0, 0, [0, img.naturalHeight / 2]);
}
// drawTankSprite(ctx, t): 用四层俯视精灵贴图替换程序化绘制。图片由后期美术提供（当前盘上无图）。
// Layer 0 履带（滚动）→ Layer 1 车体（对准坦克原点、随 hullAngle）→
// Layer 2 炮塔（pivot 对准座圈中心、随炮塔角）→ Layer 3 炮管（武器类型切换、双管偏移、后座）。
// 对齐参数由设计器写入 tanks/<id>.json `sprite`。
function drawTankSprite(ctx, t){
  const sp = t.sprite, h = sp.hull || {}, s = sp.turret || {};
  const hi = spriteImage(h.img), ti = spriteImage(s.img);
  // 地面软阴影（精灵无烘焙阴影，补一块）
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.hullAngle || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 0, hi.naturalWidth*(h.scale||0)*0.52, hi.naturalHeight*(h.scale||0)*0.52, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  drawSpriteTracks(ctx, t);
  paintPartSprite(ctx, hi, t.x, t.y, t.hullAngle, 1, h.scale, h.dx, h.dy, h.rot);

  // 与程序化分支保持层级：断履带/座圈/起火辉光位于主炮塔下方（#L1）。
  // #W2：副炮塔改到主炮塔之后绘制（见本函数末尾），与程序化分支同口径。
  if(t.trackBroken) drawBrokenTracks(ctx, t);
  const pOff = turretPivot(t);
  drawTurretRing(ctx, t, pOff.x, pOff.y);
  if(t.fireT>0) drawFireGlow(ctx, t);

  if(t.hasTurret !== false){
    // 与程序化分支同源的炮塔投影阴影（此前精灵分支只有车体地面软阴影，炮塔层次感偏平）。
    paintTurretShadow(ctx, turretPoly(t).verts, pOff.x, pOff.y, superstructureAngle(t), 1, 2.5, 3.5, t.hullAngle);
    paintPartSprite(ctx, ti, pOff.x, pOff.y, superstructureAngle(t), 1,
      s.scale, s.dx, s.dy, s.rot, s.pivot);
    if(!t.ammoBlew){
      const wtype = (t.weapons && t.weapons.primary && t.weapons.primary.type) || 'standard';
      const imgs = spriteBarrelImages(t);
      if(wtype === 'double_barrel' && imgs.length >= 2){
        const gap = (+((sp.barrel || {}).gap) > 0) ? +sp.barrel.gap : 3.7;
        drawSpriteBarrel(ctx, t, imgs[0], -gap / 2);
        drawSpriteBarrel(ctx, t, imgs[1], gap / 2);
      } else if(imgs.length){
        drawSpriteBarrel(ctx, t, imgs[0], 0);
      }
    }
  }

  // #W2（2026-10-19 用户反馈「副炮塔需要绘制在顶层贴图」）：移到主炮塔之后，
  // 与程序化分支同口径（原在 :999 主炮塔之前画，被子炮塔盖住）。
  drawSecondaryTurret(ctx, t);
}
// 车底地面软阴影（程序化分支）。精灵分支在 drawTankSprite 里手绘了一块椭圆阴影，
// 但**程序化分支（当前实机唯一路径，所有车 sprite.enabled=false）从来没有车底影**：
// 履带直接压在地面纹理上，车体像「贴纸」。这里按车体 OBB 画两层椭圆
// （远层淡 + 近层深，方向与光源一致：右下）。
//
// #TEX8-2026-10-18：**形状随车体转、偏移不随车体转**。
//   缩放/旋转要分开：先按世界坐标平移偏移量，再 rotate(hullAngle) 画车体形状轮廓。
//   若把偏移量放进旋转后的坐标系（旧精灵分支的写法），车头转 90° 影子也跟着转 90°，
//   同一屏里就和掩体投影（固定右下）打了两个光源。
function drawTankGroundShadow(ctx, t){
  const L = (t.hullLen || 64), W = (t.hullWid || 38);
  const off = Math.min(14, 3 + Math.max(L, W) * 0.05);
  ctx.save();
  // 偏移在**世界**坐标里（右下 = +x,+y），与 drawCoverShadow 同向
  ctx.translate(t.x + off * 0.55, t.y + off * 0.75);
  ctx.rotate(t.hullAngle || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.60, W * 0.64, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // 近层：接触影贴车体本身（偏移更小、更深），让履带与地面有接触感
  ctx.save();
  ctx.translate(t.x + off * 0.25, t.y + off * 0.35);
  ctx.rotate(t.hullAngle || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.52, W * 0.56, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// #TEX13-2026-10-18：俯视 2.5D 的「侧壁」。纯顶面 + 投影永远读不出高度——真实俯视图里，
//   凸起物在背光侧会露出一条**实体侧壁**（不是半透明影子）。做法：把部件轮廓按**世界光**
//   的反方向偏移 (dx,dy)，用暗色实心填充，再画顶面盖住其余部分；露出的窄带就是高度。
//   偏移必须世界固定（先 R(−angle) 转到局部），否则车体转 90° 侧壁会跑到受光侧。
function drawPartSideWall(ctx, verts, cx, cy, angle, dxWorld, dyWorld, color){
  if(!verts || verts.length < 3) return;
  const r = rotate(dxWorld, dyWorld, -(angle || 0));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle || 0);
  ctx.beginPath();
  for(let i = 0; i < verts.length; i++){
    const [vx, vy] = verts[i];
    const px = vx + r.x, py = vy + r.y;
    if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// #TEX12：暖色轮廓光（世界左上受光）。传入世界坐标多边形角点，沿轮廓外侧 0.5px
//   画一条从左上暖白到右下透明的渐变细线——只亮受光边，不形成整圈描边。
function drawTankRimLight(ctx, corners){
  if(!corners || corners.length < 3) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for(const p of corners){
    if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x;
    if(p.y < minY) minY = p.y; if(p.y > maxY) maxY = p.y;
  }
  const g = ctx.createLinearGradient(minX, minY, maxX, maxY);
  g.addColorStop(0, 'rgba(255,240,208,0.42)');
  g.addColorStop(0.42, 'rgba(255,240,208,0.06)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(-0.55, -0.55);
  ctx.strokeStyle = g;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for(let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// #5（2026-10-19 用户裁定）：坦克精灵**维持不启用**，但开发者面板给了一个运行时开关
//   （`_spriteOverride`，默认关，不写回 tanks/*.json）。
//   本函数是「是否走精灵分支」的唯一判据：
//     · `_spriteOverride` 已设置（true/false）→ 优先用它（调试开关）；
//     · 否则回落 tank JSON 的 `sprite.enabled`（现行全部为 false）。
function spriteEnabled(t){
  if(!t || !t.sprite) return false;   // 没有精灵数据 ⇒ 一律走程序化分支（override 也不能凭空造贴图）
  if(t._spriteOverride !== undefined) return !!t._spriteOverride;
  return !!t.sprite.enabled;
}

function drawTank(ctx, t){
  const pOff = turretPivot(t);
  const turCx = pOff.x;
  const turCy = pOff.y;  const bCol = tankBodyCol(t);   // 车体实色：炮管/炮盾等金属件取自实色，队伍色只留描边

  // 整车精灵替换通道（tanks/<id>.json `sprite.enabled`，设计器对齐后开启）：
  // 图片未就绪/殉爆飞头时回退程序化绘制，保证首帧与极端状态不穿帮。
  // 注意（#L1）：精灵只替换「车体/炮塔/炮管/履带」这四层画法，**不得**吞掉断履带、
  // 起火辉光、副炮塔、射界射线、附件与世界内血条——它们在两个分支中共用同一段收尾绘制。
  // #5：`_spriteOverride` 由开发者面板写入（默认关），优先于 JSON 的 sprite.enabled
  if(spriteEnabled(t) && !t.ammoBlew && spriteReady(t)){
    drawTankSprite(ctx, t);
    // 精灵主体已在 drawTankSprite 内按程序化层级绘制断履带/副炮塔/座圈/起火辉光；
    // 这里仅绘制主体之上的通用提示与 HUD。
    drawTraverseRays(ctx, t, turCx, turCy);
    // #17：精灵分支同样分层——车体件在下、炮塔/炮管件在上（与程序化分支同口径）。
    drawAttachments(ctx, t, t.x, t.y, 'hull');
    drawAttachments(ctx, t, turCx, turCy, 'turret');
    drawTankHud(ctx, t);
    return;
  }

  // 车底软阴影（#TEX8-2026-10-18）：程序化分支此前完全没有车底投影，履带直接压在
  // 地面纹理上，车体看起来像「贴纸」。与掩体投影同光源（左上 → 落在右下）。
  drawTankGroundShadow(ctx, t);

  // #TEX13：车体侧壁（世界固定右下偏移）——先于履带绘制：履带从两侧压住侧壁，
  //   只在车头/车尾露出厚度；否则侧壁会盖掉履带链节，像给坦克垫了一块黑板。
  drawPartSideWall(ctx, hullPoly(t).verts, t.x, t.y, t.hullAngle, 4.0, 5.2, paintShade(bCol, -52));
  drawPartSideWall(ctx, hullPoly(t).verts, t.x, t.y, t.hullAngle, 2.3, 3.1, paintShade(bCol, -18));

  // rolling tracks (under the hull)
  drawTracks(ctx, t);

  // hull — arrowhead polygon (verts: FR, tip, FL, RL, RR)
  const hPoly = hullPoly(t);
  const hc = polyCorners(t.x,t.y,t.hullAngle, hPoly);
  renderHullTexture(ctx, t);
  ctx.beginPath();
  ctx.moveTo(hc[0].x,hc[0].y);
  for(let i=1;i<hc.length;i++) ctx.lineTo(hc[i].x,hc[i].y);
  ctx.closePath();
  // 2026-10-05：亮色队伍描边太丑 → 改暗色勾线（队伍识别走血条/小地图）
  ctx.strokeStyle = 'rgba(15,15,18,0.60)'; ctx.lineWidth=2; ctx.stroke();
  // #TEX12：暖色轮廓光（左上受光边）。1px 级、只出现在受光侧，让车体从地面「立」起来；
  //   与暗色勾线一明一暗，是手绘微缩模型最常见的高光处理。
  drawTankRimLight(ctx, hc);

  // 履带被击断：断开处 + 脱落履带节 + 撕裂金属
  if(t.trackBroken) drawBrokenTracks(ctx, t);

  // PLAN §8.1.2：副炮塔（turret 型副武器）
  // #W2（2026-10-19 用户反馈「需要绘制在顶层贴图」）：此处原在主炮塔**之前**绘制，
  //   导致副炮塔被主炮塔整块盖住（位姿中心与座圈重合、scale 0.62，只剩一圈边缘）。
  //   现移到主炮塔/炮管绘制完成之后（见 drawTank 尾部 "#W2" 调用点）。

  // #17（2026-10-19）：车体绑定（bindTo:'hull'）的装饰件在**炮塔之前**绘制——
  //   它们挂在车体上（工具箱/备用履带/油桶/原木/铁锹/伪装网），落点 dy≈±0.40·hullWid
  //   正落在炮塔投影范围内；此前整组画在最后会盖住炮塔与副炮塔。
  //   炮塔/炮管绑定的附件仍画在最后（见 drawTank 尾部的 'turret' 分层调用）。
  drawAttachments(ctx, t, t.x, t.y, 'hull');

  // turret ring (on the hull, under the turret)
  // #TEX13：座圈凸台放在炮塔阴影之后、侧壁之前，确保不被软影整块盖掉
  // （调用点移入下方 if(!t.ammoBlew) 分支）

   // 弹药架殉爆后炮塔被掀飞（飞头），炮塔/炮管全部不再绘制；车体焦黑 + 炽热
   if(t.ammoBlew){ drawCharredHull(ctx, t); if(t.fireT>0) drawFireGlow(ctx, t); }
   if(!t.ammoBlew){
   // 阴影方向固定在世界方向（投影用 t.hullAngle），炮塔自转不改变阴影方向
   if(t.fireT>0) drawFireGlow(ctx, t);
   paintTurretShadow(ctx, turretPoly(t).verts, turCx, turCy, superstructureAngle(t), 1, 2.5, 3.5, t.hullAngle);
   drawTurretRing(ctx, t, turCx, turCy);
   // #TEX13：炮塔侧壁——比车体略薄（炮塔相对低矮），外层深 + 内层中暗
   drawPartSideWall(ctx, turretPoly(t).verts, turCx, turCy, superstructureAngle(t), 3.0, 4.0, paintShade(bCol, -48));
   drawPartSideWall(ctx, turretPoly(t).verts, turCx, turCy, superstructureAngle(t), 1.8, 2.4, paintShade(bCol, -14));

   const structureAngle = superstructureAngle(t);
   const tPoly = turretPoly(t);
   const tc = polyCorners(turCx,turCy,structureAngle, tPoly);
   renderTurretTexture(ctx, turCx, turCy, structureAngle, t);
  ctx.beginPath();
  ctx.moveTo(tc[0].x,tc[0].y);
  for(let i=1;i<tc.length;i++) ctx.lineTo(tc[i].x,tc[i].y);
  ctx.closePath();
  // 2026-10-05：亮色队伍描边太丑 → 改暗色勾线
  ctx.strokeStyle = 'rgba(15,15,18,0.60)'; ctx.lineWidth=1.5; ctx.stroke();
  drawTankRimLight(ctx, tc);

  // 炮塔转动射界：±traverseLimit 左右极限射线（仅当射界 < 180° 时有限制；180° = 360° 全向旋转）
  drawTraverseRays(ctx, t, turCx, turCy);

   // Barrel: 炮管根部接在炮塔前缘（=旋转中心 + 前缘偏移 turretFrontDist），长度按设计器口径
   // = 炮塔长 × (len/100)。与 gunRoot() 完全同轴，炮塔转动时根部随前缘一起走，不再从炮塔中心/尾部伸出。
   const barrelRayDx = Math.cos(t.turretAngle), barrelRayDy = Math.sin(t.turretAngle);
   // 2026-09-15 W6：autocannon 专用炮管外观（用户裁定）——更细（barrelWidthMult）略短（barrelLenMult）；
   //   制退器/抽烟器禁用（autocannon 无这些火炮件），**但护套保留**：
   //   2026-10-22 B5-1（需求 2）改为 autocannon 专用护套（见下方 "_AC 专用护套" 绘制块）——
   //   圆角矩形套筒 + 2×5 散热孔 + 前后锁环，与标准炮管（细长、无护套）在俯视角下可辨认。
   // #U31（2026-10-17 用户要求）：电磁炮同理——轨道炮是纯功能性结构，没有常规火炮的
   //   护套/制退器/抽烟器这些「火炮专用件」，贴图 barrel-railgun.png 也是无附件的双轨造型；
   //   程序化分支强制禁用三类附件（mantlet 炮盾保留）。
   const _isAc = !!(t.weapons && t.weapons.primary && t.weapons.primary.type === 'autocannon');
   const _isRailgun = !!(t.weapons && t.weapons.primary && t.weapons.primary.type === 'railgun');
   const _bSpec0 = t.barrel || { len: 120, width: 18, muzzle: 'none', evacPos: 55 };
   const bSpec = (_isAc || _isRailgun)
     ? Object.assign({}, _bSpec0, { muzzle: 'none', evac: { style: 'none' }, jacket: { len: 0 } })
     : _bSpec0;
   const barrelPct = Math.max(0, Math.min(3, (bSpec.len || 120) / 100));
   let barrelLen = t.turLen * barrelPct;
   const frontOff = turretFrontDist(t);
   let barrelWid = Math.max(3, t.turWid * ((bSpec.width || 18)/100) * 0.5);
   if(_isAc){
     const _acSpec = (t.weapons.primary && t.weapons.primary.stats) || {};
     barrelLen *= (typeof _acSpec.barrelLenMult === 'number') ? _acSpec.barrelLenMult : 0.8;
     barrelWid = Math.max(2, barrelWid * ((typeof _acSpec.barrelWidthMult === 'number') ? _acSpec.barrelWidthMult : 0.6));
   }
   // #U41（2026-10-19）：电磁炮炮管加宽——「双轨 + 蓝缝 + 白弧」三层在常规口径算出的
   //   barrelWid ≈ 3.2px 里放不下（实测蓝缝被两根灰轨完全盖掉，炮管读作空管）。
   //   **纯视觉**：只影响本函数内的绘制宽度，不改 gunRoot()/gunTip() 与炮口特效坐标。
   if(_isRailgun){
     const _rgMult = (RULES && RULES.railgunFx && RULES.railgunFx.barrelWidMult) || 2.2;
     barrelWid *= _rgMult;
   }
   const perpX = -barrelRayDy, perpY = barrelRayDx;

   // 开火后坐回弹（纯视觉）：recoilT 从 0.08 衰减到 0 时 sin(π·progress) 从 0 升到顶再回 0，
   // 形成「出击→回弹」。仅平移视觉炮管（baseX/baseY 全局后移），炮盾/护套/制退器均随 baseX/baseY
   // 自然跟随，避免「炮管后坐但制退器留在原地」穿帮。不改 gunRoot()/gunTip() 判定坐标。
   const _recoilT = t.recoilT || 0;
   const RECOIL_PX = 5;
   const _recoilMag = RECOIL_PX * (barrelWid / 18);
   let recoilOff = 0;
   if(_recoilT > 0){
     const _rc = Math.min(1, Math.max(0, _recoilT / 0.08));
     recoilOff = _recoilMag * Math.sin(Math.PI * _rc);
   }
   const baseX = turCx + barrelRayDx*frontOff - barrelRayDx*recoilOff;
   const baseY = turCy + barrelRayDy*frontOff - barrelRayDy*recoilOff;
   const endX = baseX + barrelRayDx*barrelLen, endY = baseY + barrelRayDy*barrelLen;

   // 2026-09-15 W4：双管并排——主武器 double_barrel 时炮盾上并排绘制 2 根炮管（左右各偏移），
   // 偏移量与 firePrimaryShell 的弹道横向偏移同源（barrelWid × barrelOffset × 0.5，管 0 左 / 管 1 右）。
   const _isDb = !!(t.weapons && t.weapons.primary && t.weapons.primary.type === 'double_barrel');
   let _dbOff = 0;
   if(_isDb){
     const _dbSpec = (t.weapons.primary && t.weapons.primary.stats) || {};
     const _dbMult = (typeof _dbSpec.barrelOffset === 'number') ? _dbSpec.barrelOffset : 1.85;
     _dbOff = barrelWid * _dbMult * 0.5;
   }
   const _tubeOffsets = _isDb ? [-_dbOff, _dbOff] : [0];
   // 电磁炮：双轨并排（两根导轨中间留空，一眼可辨）——程序化绘制，与游戏像素风格一致
   const _isRail = !!(t.weapons && t.weapons.primary && t.weapons.primary.type === 'railgun');
   // main barrel tube(s)（双管并排 / 单管居中 / 电磁炮双轨）
   for(const _toff of _tubeOffsets){
     const _tx = baseX + perpX*_toff, _ty = baseY + perpY*_toff;
     const _ex = endX + perpX*_toff, _ey = endY + perpY*_toff;
     if(_isRail){
       // #U31（2026-10-17）：双轨——两根导轨中间镂空。
       // #U38（2026-10-18）结构细节：导轨 + 箍环 + 能量芯 + 后膛核 + 充能电弧。
       // #U39（2026-10-19 用户裁定）**三色口径**：炮管 = **灰**（金属本体，与车体涂装无关）、
       //   基底 = **蓝**（导轨之间缝隙里的能量衬底）、弧光 = **白**（充能弧）。
       //   三色全部取自 RULES.railgunFx（唯一口径），不得再写死车体色 shade(bCol, …) 当炮管色。
       // #U41（2026-10-19 实机校色）：**实测量级修正**——railgun 的 barrelWid 只有约 3.2px，
       //   原实现把蓝色基底画成 `railOff+railW*1.25` 半宽（全宽 ≈7px）的**整条外包带**，
       //   结果是整根炮管被蓝带包住、灰导轨被埋掉、弧光糊成白斑（实机 1:1 出图复核确认）。
       //   现改为**缝隙内衬**：蓝色只铺在两根灰导轨之间的**空隙**里（不做外包边），
       //   灰导轨画在最上层且比缝隙更宽 → 「灰炮管 + 蓝基底」读得出来；弧光也压细压短。
       const _railOff = Math.max(1.5, barrelWid * 0.21);
       const _railW = Math.max(1.1, barrelWid * 0.17);
       const _rfx = (RULES && RULES.railgunFx) || {};
       const _charge = railChargeProgress(t);
       // 三色（缺省值兜底，保证无 RULES 环境也能画）
       const _greyMid  = _rfx.barrelGrey     || '#787d84';
       const _greyDark = _rfx.barrelGreyDark || '#4a4e55';
       const _greyLit  = _rfx.barrelGreyLit  || '#a8aeb6';
       const _blue     = _rfx.baseBlue       || '#2f5d8c';
       const _blueDeep = _rfx.baseBlueDeep   || '#1b3550';
       const _arcWhite = _rfx.arcWhite       || '#ffffff';
       const _arcHalo  = _rfx.arcHalo        || 'rgba(214,232,255,1)';
       ctx.lineCap = 'round';
       // ⓪ 蓝色基底：**只填两根导轨之间的缝隙**（半宽 = railOff − railW*0.5），
       //   不再向外包边。source-over 实色——基底是固体结构不是光，进 lighter 会发白。
       const _gapHalf = Math.max(0.6, _railOff - _railW * 0.45);
       ctx.strokeStyle = _blueDeep; ctx.lineWidth = _gapHalf * 2;
       ctx.beginPath(); ctx.moveTo(_tx, _ty); ctx.lineTo(_ex, _ey); ctx.stroke();
       ctx.strokeStyle = _blue; ctx.lineWidth = Math.max(0.8, _gapHalf * 1.35);
       ctx.beginPath(); ctx.moveTo(_tx, _ty); ctx.lineTo(_ex, _ey); ctx.stroke();
       // ① 灰色导轨本体（压在蓝基底之上）：暗边 → 中间调 → 内侧受光，三层明度
       for(const _ro of [-_railOff, _railOff]){
         const _sgn = _ro > 0 ? 1 : -1;
         const _rx0 = _tx + perpX*_ro, _ry0 = _ty + perpY*_ro;
         const _rx1 = _ex + perpX*_ro, _ry1 = _ey + perpY*_ro;
         ctx.strokeStyle = _greyDark; ctx.lineWidth = _railW * 1.25;
         ctx.beginPath(); ctx.moveTo(_rx0, _ry0); ctx.lineTo(_rx1, _ry1); ctx.stroke();
         ctx.strokeStyle = _greyMid; ctx.lineWidth = _railW * 0.86;
         ctx.beginPath(); ctx.moveTo(_rx0, _ry0); ctx.lineTo(_rx1, _ry1); ctx.stroke();
         const _hi = _railW * 0.24 * _sgn;
         ctx.strokeStyle = _greyLit;
         ctx.lineWidth = Math.max(0.6, _railW * 0.30);
         ctx.beginPath();
         ctx.moveTo(_rx0 + perpX*_hi, _ry0 + perpY*_hi);
         ctx.lineTo(_rx1 + perpX*_hi, _ry1 + perpY*_hi);
         ctx.stroke();
       }
       // ② 横向箍环：灰（炮身金属件），沿炮管 3 圈（避开炮口与炮尾）。
       //   宽度只略超导轨外缘——早期版本用 railOff+railW*0.9 跨度过大，实机上像贴了三条白杠。
       for(let _bi = 1; _bi <= 3; _bi++){
         const _bt = _bi / 4;
         const _bx = _tx + barrelRayDx * barrelLen * _bt;
         const _by = _ty + barrelRayDy * barrelLen * _bt;
         const _hw = _railOff + _railW * 0.35;
         ctx.strokeStyle = _greyDark; ctx.lineWidth = Math.max(0.9, _railW * 0.80);
         ctx.beginPath();
         ctx.moveTo(_bx + perpX*_hw, _by + perpY*_hw);
         ctx.lineTo(_bx - perpX*_hw, _by - perpY*_hw);
         ctx.stroke();
         ctx.strokeStyle = _greyLit; ctx.lineWidth = Math.max(0.5, _railW * 0.24);
         ctx.beginPath();
         ctx.moveTo(_bx + perpX*_hw, _by + perpY*_hw);
         ctx.lineTo(_bx - perpX*_hw, _by - perpY*_hw);
         ctx.stroke();
       }
       ctx.save();
       ctx.globalCompositeOperation = 'lighter';
       // ③ 轨间能量芯：**白**，但必须**让蓝基底读得出来**（#U41 实机校色）。
       //   旧实现 idle 时 alpha 已达 0.95、线宽盖满整条缝 → 炮管中段通体发白，蓝色基底被吃掉，
       //   实机读作「白炮管」而不是「蓝基底 + 白弧光」。现改为：
       //   · idle（charge=1）只留一道**很淡**的白芯（0.18）——蓝仍是基底主色；
       //   · 充能中（charge<1）白芯随进度增强，是「正在充能」的读数；
       //   · 「白」的主载体是 ⑤ 的**间歇电弧**，不是这条连续的芯。
       const _coreW = Math.max(0.5, _gapHalf * 0.55);
       const _coreA = (_charge >= 0.999) ? 0.18 : (0.16 + 0.42 * (1 - _charge));
       ctx.strokeStyle = `rgba(226,238,255,${_coreA * 0.55})`;
       ctx.lineWidth = _coreW * 1.5;
       ctx.beginPath(); ctx.moveTo(_tx, _ty); ctx.lineTo(_ex, _ey); ctx.stroke();
       ctx.strokeStyle = `rgba(255,255,255,${_coreA})`;
       ctx.lineWidth = _coreW;
       ctx.beginPath(); ctx.moveTo(_tx, _ty); ctx.lineTo(_ex, _ey); ctx.stroke();
       // ④ 后膛能量核：冷白晕，呼吸 = 进度 + 时间量子哈希（确定性，不碰 Math.random）。
       //   #U41：半径与亮度双双收敛——旧 ×2.4 半径 + 0.85 alpha 在实机是一颗压住整个炮尾、
       //   糊进炮塔前缘的白球；现在只作为「炮尾一点点能量」的读数。走烘焙 sprite（零逐帧渐变分配）。
       const _breechR = Math.max(1.1, barrelWid * 0.16) * (0.75 + 0.25 * _charge);
       const _pulse = 0.75 + 0.25 * _flickerAt(9, 0x7a11);
       const _breechA = ((_charge >= 0.999) ? 0.16 : (0.14 + 0.30 * (1 - _charge))) * _pulse;
       if (!(typeof _blitRadial === 'function' &&
             _blitRadial(ctx, _radialSprite('haloW', _breechR * 1.6), _tx, _ty, _breechR * 1.6,
               _breechA, 'lighter'))) {
         ctx.fillStyle = `rgba(255,255,255,${_breechA * 0.8})`;
         ctx.beginPath(); ctx.arc(_tx, _ty, _breechR * 1.6, 0, TAU); ctx.fill();
       }
       // ⑤ 充能电弧：装填期在两根导轨之间爬行的**白色**折线。
       //   条数 = 1 + floor(progress×(chargeArcs−1))：越接近装满爬得越多；
       //   满电切换到「微光待机」（chargeIdleAlpha），避免装满后炮身彻底死板。
       //   #U41 校色：振幅压到**缝内**（原 _railOff*1.15 会甩出炮身）、线宽收到 1px 级——
       //   早期版本 2.4× 外晕叠在 3px 炮管上，实机糊成一条白斑而不是「电弧」。
       const _arcN = (_charge >= 0.999)
         ? 2
         : 1 + Math.floor(_charge * ((_rfx.chargeArcs || 6) - 1) + 1e-6);
       const _arcAmp = Math.max(0.8, _gapHalf * 1.05) * (0.55 + 0.45 * _charge);
       const _q = Math.floor(((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) * 22) | 0;
       const _alphaBase = (_charge >= 0.999) ? (_rfx.chargeIdleAlpha || 0.16) : (0.12 + 0.60 * _charge);
       const _cw = _rfx.chargeArcWidth || 1.2;
       for(let _ai = 0; _ai < _arcN; _ai++){
         const _t0 = Math.max(0.05, 0.08 + 0.84 * ((_ai + 0.5) / Math.max(1, _arcN)) - 0.24);
         const _ax = _tx + barrelRayDx * barrelLen * _t0;
         const _ay = _ty + barrelRayDy * barrelLen * _t0;
         const _alen = barrelLen * (0.18 + 0.16 * _charge);
         const _pts = (typeof lightningPath === 'function')
           ? lightningPath(_ax, _ay, t.turretAngle, _alen, _arcAmp, (_rfx.chargeArcSegs || 5), _q * 0.011 + _ai * 3.7)
           : [{ x: _ax, y: _ay }, { x: _ax + barrelRayDx * _alen, y: _ay + barrelRayDy * _alen }];
         // 外层冷白晕（1.7×，薄）
         ctx.strokeStyle = _arcHalo;
         ctx.globalAlpha = _alphaBase * 0.34;
         ctx.lineWidth = _cw * 1.7;
         ctx.beginPath();
         ctx.moveTo(_pts[0].x, _pts[0].y);
         for(let _i = 1; _i < _pts.length; _i++) ctx.lineTo(_pts[_i].x, _pts[_i].y);
         ctx.stroke();
         // 内层纯白芯（0.7×）
         ctx.strokeStyle = _arcWhite;
         ctx.globalAlpha = _alphaBase;
         ctx.lineWidth = Math.max(0.5, _cw * 0.7);
         ctx.stroke();
         ctx.globalAlpha = 1;
       }
       ctx.restore();
     } else {
       // #TEX12：炮管按**圆柱**画，而不是一根平色线 + 一条高光。
       //   4 条平行带：深底 → 中间调 → 受光高光 → 背光暗边；偏移方向取世界光
       //   （左上）在炮管法线上的投影，炮管转到任何角度高光都在受光侧。
       ctx.lineCap = 'round';
       const side = (perpX * -0.7071 + perpY * -0.7071) >= 0 ? 1 : -1;
       const band = (off, style, width) => {
         ctx.strokeStyle = style; ctx.lineWidth = width;
         ctx.beginPath();
         ctx.moveTo(_tx + perpX*off, _ty + perpY*off);
         ctx.lineTo(_ex + perpX*off, _ey + perpY*off);
         ctx.stroke();
       };
       band(0, shade(bCol, -52), barrelWid);
       band(barrelWid * 0.18 * side, shade(bCol, -14), Math.max(1.2, barrelWid * 0.66));
       band(barrelWid * 0.30 * side, 'rgba(255,255,255,0.22)', Math.max(1, barrelWid * 0.20));
       band(-barrelWid * 0.30 * side, shade(bCol, -60), Math.max(1, barrelWid * 0.20));
     }
   }

   // 炮盾 mantlet（纯视觉，样式 none/single/double/collar/box/winged/wedge）：
   // 位于炮管根部（可沿炮管前后偏移 pos/%），宽度按炮塔全宽百分比计算；不影响任何判定。
   const mt = bSpec.mantlet || { style:'none', pos:0, width:40 };
   if(mt.style && mt.style !== 'none'){
      const mPos = (mt.pos||0)/100*barrelLen;
      const mW = Math.max(barrelWid*1.2, t.turWid*((mt.width!==undefined ? mt.width : 40)/100)*0.5);
      const mdx = baseX + barrelRayDx*mPos, mdy = baseY + barrelRayDy*mPos;
      const d = mW*0.6;
      ctx.save(); ctx.translate(mdx, mdy); ctx.rotate(t.turretAngle);
      ctx.lineWidth = 1;
      const dark = shade(bCol, -30), dark2 = shade(bCol, -14), edge = 'rgba(255,255,255,0.22)';
      if(mt.style === 'single'){
         ctx.fillStyle = dark; ctx.strokeStyle = edge;
         ctx.fillRect(-d/2, -mW, d, mW*2); ctx.strokeRect(-d/2, -mW, d, mW*2);
      } else if(mt.style === 'double'){
         ctx.fillStyle = dark; ctx.strokeStyle = edge;
         ctx.fillRect(-d*0.6, -mW*0.85, d*0.55, mW*1.7); ctx.strokeRect(-d*0.6, -mW*0.85, d*0.55, mW*1.7);
         ctx.fillStyle = dark2;
         ctx.fillRect(d*0.1, -mW*0.58, d*0.5, mW*1.16); ctx.strokeRect(d*0.1, -mW*0.58, d*0.5, mW*1.16);
      } else if(mt.style === 'collar'){
         ctx.fillStyle = dark2; ctx.strokeStyle = edge;
         ctx.fillRect(-d*0.3, -mW, d*0.6, mW*2); ctx.strokeRect(-d*0.3, -mW, d*0.6, mW*2);
         ctx.fillStyle = 'rgba(0,0,0,0.45)';
         ctx.fillRect(-d*0.05, -mW*0.72, d*0.1, mW*1.44);
      } else if(mt.style === 'box'){
         ctx.fillStyle = dark; ctx.strokeStyle = edge;
         ctx.fillRect(-d*0.9, -mW, d*1.8, mW*2); ctx.strokeRect(-d*0.9, -mW, d*1.8, mW*2);
         ctx.fillStyle = dark2;
         ctx.fillRect(d*0.55, -mW*0.9, d*0.2, mW*1.8);
      } else if(mt.style === 'winged'){
         ctx.fillStyle = dark; ctx.strokeStyle = edge;
         ctx.fillRect(-d*0.5, -mW*0.42, d, mW*0.84); ctx.strokeRect(-d*0.5, -mW*0.42, d, mW*0.84);
         ctx.fillRect(-d*0.5, -mW*1.1, d*0.55, mW*0.62); ctx.strokeRect(-d*0.5, -mW*1.1, d*0.55, mW*0.62);
         ctx.fillRect(-d*0.5, mW*0.48, d*0.55, mW*0.62); ctx.strokeRect(-d*0.5, mW*0.48, d*0.55, mW*0.62);
      } else if(mt.style === 'wedge'){
         ctx.fillStyle = dark; ctx.strokeStyle = edge;
         ctx.beginPath();
         ctx.moveTo(-d, -mW); ctx.lineTo(d, -mW*0.5); ctx.lineTo(d, mW*0.5); ctx.lineTo(-d, mW);
         ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
   }

   // #E13（2026-09-20）：双管时，炮管附件（护套 jacket / 制退器 muzzle brake / 抽烟器 evac）
   // 必须**逐管**绘制——否则两根炮管只有中线上一套附件，观感与几何都穿模。
   // _tubeBase = 每根管子的基准点（根部/口部），单管时退化为原基准（行为不变）。
   const _tubeBase = _tubeOffsets.map(function(o){
     return { bx: baseX + perpX*o, by: baseY + perpY*o, ex: endX + perpX*o, ey: endY + perpY*o };
   });

   // bore evacuator bulge at configured position (styles: none/ring/bulb/slotted/long)
   const evc = (bSpec.evac && bSpec.evac.style) ? bSpec.evac
     : (bSpec.evacPos !== undefined ? { style: bSpec.evacPos > 0 ? 'ring' : 'none', pos: bSpec.evacPos } : { style: 'none', pos: 30 });
   if(evc.style && evc.style !== 'none'){
    for(const _tb of _tubeBase){
      const ex = _tb.bx + barrelRayDx*(evc.pos/100)*barrelLen;
      const ey = _tb.by + barrelRayDy*(evc.pos/100)*barrelLen;
      const evacR = barrelWid*0.9;
      if(evc.style === 'ring' || evc.style === 'slotted'){
         ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(2, barrelWid*0.35);
         ctx.beginPath();
         ctx.moveTo(ex + perpX*evacR, ey + perpY*evacR);
         ctx.lineTo(ex - perpX*evacR, ey - perpY*evacR);
         ctx.stroke();
         ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = Math.max(1, barrelWid*0.2);
         ctx.beginPath();
         ctx.moveTo(ex + perpX*evacR*0.7, ey + perpY*evacR*0.7);
         ctx.lineTo(ex - perpX*evacR*0.7, ey - perpY*evacR*0.7);
         ctx.stroke();
         if(evc.style === 'slotted'){
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(ex - barrelRayDx*barrelWid*0.5 - perpX*evacR*0.35, ey - barrelRayDy*barrelWid*0.5 - perpY*evacR*0.35, barrelWid, evacR*0.7);
            ctx.fillRect(ex - barrelRayDx*barrelWid*0.5 + perpX*evacR*0.15, ey - barrelRayDy*barrelWid*0.5 + perpY*evacR*0.15, barrelWid, evacR*0.7);
         }
      } else if(evc.style === 'bulb'){
         ctx.save(); ctx.translate(ex, ey); ctx.rotate(t.turretAngle);
         ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = Math.max(1, barrelWid*0.2);
         ctx.beginPath(); ctx.ellipse(0, 0, barrelWid*0.6, barrelWid*0.95, 0, 0, TAU);
         ctx.fill(); ctx.stroke();
         ctx.restore();
      } else if(evc.style === 'long'){
         ctx.save(); ctx.translate(ex, ey); ctx.rotate(t.turretAngle);
         ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = Math.max(1, barrelWid*0.2);
         const L = barrelLen*0.12;
         ctx.fillRect(-barrelWid*0.35, -barrelWid*0.75, L, barrelWid*1.5);
         ctx.strokeRect(-barrelWid*0.35, -barrelWid*0.75, L, barrelWid*1.5);
         ctx.restore();
      }
    }
    }

   // muzzle brake at the end（#E13：逐管绘制）
   if(bSpec.muzzle && bSpec.muzzle !== 'none'){
    for(const _tb of _tubeBase){
      const mx = _tb.ex, my = _tb.ey;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      if(bSpec.muzzle === 'single'){
         ctx.lineWidth = barrelWid*1.3;
         ctx.beginPath();
         ctx.moveTo(mx + perpX*barrelWid*0.8, my + perpY*barrelWid*0.8);
         ctx.lineTo(mx - perpX*barrelWid*0.8, my - perpY*barrelWid*0.8);
         ctx.stroke();
      } else if(bSpec.muzzle === 'double'){
         const bw = barrelWid*1.2;
         for(const off of [-0.5, 0.5]){
            const bx = mx + barrelRayDx*barrelWid*off;
            const by = my + barrelRayDy*barrelWid*off;
            ctx.lineWidth = barrelWid*0.7;
            ctx.beginPath();
            ctx.moveTo(bx + perpX*bw, by + perpY*bw);
            ctx.lineTo(bx - perpX*bw, by - perpY*bw);
            ctx.stroke();
         }
      } else if(bSpec.muzzle === 'multi'){
         const bw = barrelWid*1.3;
         for(const off of [-0.75, -0.25, 0.25]){
            const bx = mx + barrelRayDx*barrelWid*off;
            const by = my + barrelRayDy*barrelWid*off;
            ctx.lineWidth = barrelWid*0.5;
            ctx.beginPath();
            ctx.moveTo(bx + perpX*bw, by + perpY*bw);
            ctx.lineTo(bx - perpX*bw, by - perpY*bw);
            ctx.stroke();
         }
      } else if(bSpec.muzzle === 'slug'){
         ctx.lineWidth = barrelWid*1.1;
         ctx.beginPath(); ctx.arc(mx, my, barrelWid*0.7, t.turretAngle-Math.PI*0.4, t.turretAngle+Math.PI*0.4); ctx.stroke();
         ctx.lineWidth = Math.max(1, barrelWid*0.3);
         for(let i=0;i<3;i++){
            const a = t.turretAngle - Math.PI*0.3 + i*(Math.PI*0.6/2);
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(mx + Math.cos(a)*barrelWid*0.7, my + Math.sin(a)*barrelWid*0.7);
            ctx.stroke();
         }
      } else if(bSpec.muzzle === 'pepperpot'){
         ctx.lineWidth = barrelWid*1.2;
         ctx.beginPath(); ctx.arc(mx, my, barrelWid*0.7, 0, TAU); ctx.stroke();
         ctx.lineWidth = Math.max(1, barrelWid*0.25);
         for(let i=0;i<4;i++){
            const a = t.turretAngle - Math.PI*0.5 + i*(Math.PI/2);
            ctx.beginPath();
            ctx.moveTo(mx + Math.cos(a)*barrelWid*0.7, my + Math.sin(a)*barrelWid*0.7);
            ctx.lineTo(mx + Math.cos(a)*barrelWid*0.45, my + Math.sin(a)*barrelWid*0.45);
            ctx.stroke();
         }
      } else if(bSpec.muzzle === 'heavy_square'){
         ctx.lineWidth = barrelWid*2.0;
         ctx.beginPath();
         ctx.moveTo(mx + perpX*barrelWid*1.1, my + perpY*barrelWid*1.1);
         ctx.lineTo(mx - perpX*barrelWid*1.1, my - perpY*barrelWid*1.1);
         ctx.stroke();
      } else if(bSpec.muzzle === 'cylinder'){
         ctx.save(); ctx.translate(mx, my); ctx.rotate(t.turretAngle);
         ctx.fillStyle = 'rgba(0,0,0,0.4)';
         ctx.fillRect(-barrelWid*0.8, -barrelWid*0.95, barrelWid*1.6, barrelWid*1.9);
         ctx.fillStyle = 'rgba(20,20,20,0.7)';
         ctx.fillRect(-barrelWid*0.6, -barrelWid*1.1, barrelWid*1.2, barrelWid*0.35);
         ctx.fillRect(-barrelWid*0.6, barrelWid*0.75, barrelWid*1.2, barrelWid*0.35);
         ctx.restore();
      }
    }
   }
   // 炮管护套 jacket: thicker rectangle sleeve over part of the barrel (len>0 → active)
   // #E13（2026-09-20）：逐管绘制护套（双管时两根炮管各自带护套，与制退器/抽烟器同源）。
   const jk = bSpec.jacket || { len: 0, pos: 45 };
   if((jk.len || 0) > 0){
      const jkS = Math.max(0, Math.min(90, jk.pos || 45))/100*barrelLen;
      const jkE = Math.min(100, (jk.pos || 45) + (jk.len || 0))/100*barrelLen;
      for(const _tb of _tubeBase){
        const ax = _tb.bx + barrelRayDx*jkS, ay = _tb.by + barrelRayDy*jkS;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(t.turretAngle);
        ctx.fillStyle = shade(bCol, -18); ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
        ctx.fillRect(0, -barrelWid*0.85, Math.max(1, jkE-jkS), barrelWid*1.7);
        ctx.strokeRect(0, -barrelWid*0.85, Math.max(1, jkE-jkS), barrelWid*1.7);
        ctx.restore();
      }
   }
   // ===== 2026-10-22 B5-1（需求 2）：autocannon 专用炮管护套 =====
   // 目标：与标准炮管（细长、无护套）在俯视角下**可辨认**。
   //   · 护套 = 圆角矩形，长度 = 炮管可视长 ×0.42，半径 = 炮管半径 ×1.55，
   //     中心在炮管靠炮盾一侧（起点贴炮塔前缘）；
   //   · 2 排 × 5 个散热孔（暗色小椭圆，沿轴向等距）；
   //   · 前后各一道亮色锁环（1px）。
   // 仅在 autocannon 分支生效；barrelWid 已含 barrelWidthMult(0.6)，barrelLen 已含
   // barrelLenMult(0.8)，因此护套尺寸自动跟随这两个既有语义（不另立参数）。
   if(_isAc && !_isRailgun){
      const jkLen = barrelLen * 0.42;
      const jkRad = barrelWid * 0.5 * 1.55;      // 半径 = 炮管半径 ×1.55
      const jkThick = jkRad * 2;
      const jkStart = Math.min(2, barrelLen * 0.04);   // 起点：炮塔前缘稍留 1~2px 缝
      for(const _tb of _tubeBase){
        const ax = _tb.bx + barrelRayDx * jkStart;
        const ay = _tb.by + barrelRayDy * jkStart;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(t.turretAngle);
        // 圆角矩形（不依赖 ctx.roundRect / arc 的「当前点连线」语义：离线光栅 mini-canvas
        //   的 arc 每次另起子路径，混拼会丢角 → 这里用**采样折线**近似四角圆弧，两端环境一致）
        const r = Math.min(jkThick * 0.45, jkLen * 0.5);
        const jkPath = () => {
          const CORNER_STEPS = 4;
          ctx.beginPath();
          const corner = (cx, cy, a0, a1) => {
            for(let i = 1; i <= CORNER_STEPS; i++){
              const a = a0 + (a1 - a0) * (i / CORNER_STEPS);
              ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
          };
          ctx.moveTo(r, -jkRad);
          ctx.lineTo(jkLen - r, -jkRad);
          corner(jkLen - r, -jkRad + r, -Math.PI / 2, 0);
          ctx.lineTo(jkLen, jkRad - r);
          corner(jkLen - r, jkRad - r, 0, Math.PI / 2);
          ctx.lineTo(r, jkRad);
          corner(r, jkRad - r, Math.PI / 2, Math.PI);
          ctx.lineTo(0, -jkRad + r);
          corner(r, -jkRad + r, Math.PI, Math.PI * 1.5);
          ctx.closePath();
        };
        // 套筒本体（深色金属底 + 中调 + 受光高光，与炮管同一光源：左上）
        jkPath();
        ctx.fillStyle = shade(bCol, -46); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = shade(bCol, -12);
        ctx.fillRect(0, -jkRad * 0.62, jkLen, jkRad * 0.62);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(0, -jkRad * 0.96, jkLen, Math.max(0.8, jkRad * 0.24));
        // 2 排 × 5 个散热孔：暗色小椭圆，沿轴向等距
        const holeN = 5, rows = [-1, 1];
        const holeRx = Math.max(0.8, jkLen * 0.055);
        const holeRy = Math.max(0.6, jkRad * 0.26);
        for(const sgn of rows){
          for(let i = 0; i < holeN; i++){
            const hx = jkLen * (0.16 + 0.68 * (i / (holeN - 1)));
            const hy = sgn * jkRad * 0.42;
            ctx.fillStyle = 'rgba(16,16,18,0.72)';
            ctx.beginPath(); ctx.ellipse(hx, hy, holeRx, holeRy, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(120,124,130,0.30)';
            ctx.beginPath(); ctx.ellipse(hx, hy - holeRy * 0.35, holeRx * 0.66, holeRy * 0.46, 0, 0, TAU); ctx.fill();
          }
        }
        ctx.restore();
        // 轮廓（暗边）
        ctx.strokeStyle = 'rgba(12,12,14,0.75)'; ctx.lineWidth = 1;
        jkPath(); ctx.stroke();
        // 前后各一道亮色锁环（1px）
        for(const u of [0.035, 0.965]){
          const lx = jkLen * u;
          ctx.strokeStyle = 'rgba(226,232,240,0.75)'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lx, -jkRad * 1.06); ctx.lineTo(lx, jkRad * 1.06);
          ctx.stroke();
        }
        ctx.restore();
      }
   }
   ctx.lineCap = 'butt';
   } // end turret/barrel block (skipped when the ammo rack blew the turret off)

  // #W2（2026-10-19 用户反馈「副炮塔需要绘制在顶层贴图」）：
  //   程序化分支此前在 :1151（主炮塔之前）画副炮塔 ⇒ 被主炮塔整块盖住，只露一圈边缘。
  //   现移到主炮塔/炮管绘制完成之后，读作「叠在主炮塔上的第二座炮塔」。
  if(!t.ammoBlew) drawSecondaryTurret(ctx, t);

  // ---- draw attachments ----
  // #17（2026-10-19）：炮塔/炮管绑定的附件画在最后（理应盖在炮塔上）；
  //   `bindTo:'hull'` 的车体装饰件已在炮塔之前画完（见上方 drawAttachments(...,'hull')）。
  drawAttachments(ctx, t, turCx, turCy, 'turret');

  // ---- 世界内 HUD（血条 / 车型徽标 / 敌方 Lv.X）----
  drawTankHud(ctx, t);
}

// 炮塔座圈虚线（画在车体上、炮塔之下）。两条绘制通道共用（#L1）。
function drawTurretRing(ctx, t, turCx, turCy){
  if(t.ammoBlew) return;
  const bCol = (typeof tankBodyCol === 'function') ? tankBodyCol(t) : (t.color || '#555');
  const r = t.turWid * 0.5;
  ctx.save();
  ctx.translate(turCx, turCy);
  // #TEX13：座圈凸台——炮塔不是「贴在车体上的贴纸」，而是坐在一圈凸起的座圈上。
  //   先画一圈右下偏移的暗色环形（凸台侧壁），再画座圈顶面；炮塔随后盖住中心，
  //   只露出背光侧 2~3px 的凸台厚度 + 座圈缝。
  ctx.fillStyle = paintShade(bCol, -52);
  ctx.beginPath(); ctx.ellipse(1.8, 2.4, r * 1.18, r * 1.13, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = paintShade(bCol, -24);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.14, r * 1.09, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = paintShade(bCol, 16); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.14, r * 1.09, 0, 0, TAU); ctx.stroke();
  // 座圈缝（原虚线保留为机械缝）
  ctx.strokeStyle = 'rgba(15,15,18,0.40)'; ctx.lineWidth = 1.5;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// 炮塔转动射界指示：±traverseLimit 左右极限射线（仅当射界 < π 时绘制；π = 360° 全向旋转）。
// 程序化与精灵两条绘制通道共用（#L1：精灵分支此前会吞掉该提示）。
function drawTraverseRays(ctx, t, turCx, turCy){
  if(!(t.traverseLimit < Math.PI)) return;
  ctx.strokeStyle = 'rgba(255,180,84,0.32)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4,4]);
  ctx.beginPath();
  ctx.moveTo(turCx,turCy);
  ctx.lineTo(turCx+Math.cos(t.hullAngle-t.traverseLimit)*80, turCy+Math.sin(t.hullAngle-t.traverseLimit)*80);
  ctx.moveTo(turCx,turCy);
  ctx.lineTo(turCx+Math.cos(t.hullAngle+t.traverseLimit)*80, turCy+Math.sin(t.hullAngle+t.traverseLimit)*80);
  ctx.stroke();
  ctx.setLineDash([]);
}

// 附件（shield/drone）绘制：绑定到车体/炮塔/gun_root 锚点。两条绘制通道共用（#L1）。
// #17（2026-10-19 用户反馈「部分外观杂项 z 轴高度不正确，如车体小组件会挡住炮塔
//   甚至是最高的副炮塔」）：附件此前**整组固定画在最后一层**（车体→座圈→炮塔→炮管
//   →副炮塔→附件），因此 `bindTo:'hull'` 的车体装饰件（工具箱/备用履带/油桶/原木/
//   铁锹/伪装网，由 `js/tank_model.js` 的 `assignTankDecorations` 生成，落点 dy=±0.40·hullWid，
//   **正落在炮塔投影范围内**）会盖住炮塔乃至已提到顶层的副炮塔。
//   ⇒ 新增 `layer` 参数按 bindTo 分层：
//     'hull'   —— 只画 bindTo==='hull' 的件（在炮塔**之前**调用，压在炮塔下）
//     'turret' —— 只画 turret*/gun_root 的件（在炮塔之后、副炮塔之前/之后均可）
//     省略     —— 画全部（向后兼容旧调用）
function drawAttachments(ctx, t, turCx, turCy, layer){
  if(t.ammoBlew || !Array.isArray(t.attachments)) return;
  t.attachments.forEach(att => {
    if(!att || !att.bindTo) return;
    if(layer === 'hull' && att.bindTo !== 'hull') return;
    if(layer === 'turret' && att.bindTo === 'hull') return;
    let basePos = { x: t.x, y: t.y }, baseAngle = t.hullAngle;
    if (att.bindTo.startsWith('turret')) {
      basePos = { x: turCx, y: turCy };
      baseAngle = superstructureAngle(t);
    } else if (att.bindTo === 'gun_root') {
      basePos = { x: turCx, y: turCy };
      baseAngle = t.turretAngle;
    }

    const anchor = (t.anchors && t.anchors[att.bindTo]) ? t.anchors[att.bindTo] : { dx: 0, dy: 0 };
    // #TEX-2026-10-15: 装饰件可用 _decoDx/_decoDy 直接指定 local 坐标（不占用 anchors）
    const dx = (att._decoDx !== undefined) ? att._decoDx : anchor.dx;
    const dy = (att._decoDy !== undefined) ? att._decoDy : anchor.dy;
    const r = rotate(dx, dy, baseAngle);
    const ax = basePos.x + r.x, ay = basePos.y + r.y;

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(baseAngle + (att.relativeAngle || 0));

    if (att.type === 'shield') {
      ctx.strokeStyle = 'rgba(92,200,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, att.size || 20, -Math.PI/3, Math.PI/3); ctx.stroke();
    } else if (att.type === 'drone') {
      ctx.fillStyle = t.color;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(-4, -4, 8, 8);
    } else if (typeof DECORATION_DEFS !== 'undefined' && DECORATION_DEFS[att.type]) {
      // #TEX-2026-10-15: 程序化装饰件（toolbox/spareTrack/jerryCan/log/shovel/camoNet）
      DECORATION_DEFS[att.type](ctx, att.scale || 1);
    }
    ctx.restore();
  });
}

// 世界内 HUD：血条（未满血或敌方时显示）+ 重/中型车型徽标 + 敌方等级 Lv.X。
// 两条绘制通道共用（#L1：精灵分支此前在血条之前 return，导致开启精灵后血量完全不可见）。
function drawTankHud(ctx, t){
  // 血条阈值用实例 maxHp（t.maxHp 由 makeTank/applyHp 同步），stats.maxHp 可能是旧的塔载默认值
  const maxHp = (t.maxHp && t.maxHp > 0) ? t.maxHp : (t.stats?.maxHp || 100);
  const isEnemy = t.team === 'enemy';
  if(!((t.hp < maxHp || isEnemy) && t.hp > 0)) return;
  const barW = 44, barH = 5;
  const bx = t.x - barW/2, by = t.y + (t.hullWid||38)/2 + 14;
  // 血条左侧重/中型标志（不遮挡坦克本体）
  drawClassBadge(ctx, t, bx - 9, by + barH/2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(bx-1, by-1, barW+2, barH+2);
  const hpPct = Math.max(0, Math.min(1, t.hp / maxHp));
  ctx.fillStyle = t.team === 'player' ? '#7ed957' : '#ff5c4d';
  ctx.fillRect(bx, by, barW * hpPct, barH);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, barW, barH);

  // 敌方等级标示 (Lv.X)
  if(isEnemy){
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Lv.${(t.aiTier || 0) + 1}`, bx + barW + 5, by + barH);
  }

  // #P2（2026-10-24）：敌方警戒状态（? / !）——画在血条正上方。
  //   显示范围已由调用方（drawTank 的 inView 判定）保证「仅视口内」。
  drawAlertIndicator(ctx, t);
}

// ======================= PLAN §8.1.2 副炮塔（secondary turret）绘制 =======================
// 副武器类型为 turret 时绘制一座**缩小版的自身炮塔**，叠在主炮塔上方（沿用本车炮塔多边形外观件）。
// 纯位姿计算抽成 secondaryTurretPose（Node 可测），绘制层只消费位姿。
//
// #U42（2026-10-19 用户反馈「副炮塔似乎没有效果，贴图方面使用1个缩小版的自身炮塔叠在当前炮塔上方自主攻击」）：
//   旧实现是「车体尾部一个小圆盘 + 一根棍子」——① 位置在**车尾**（hullAngle 反向 hullLen*0.28），
//   玩家看不到它跟着主炮塔；② 造型是纯几何圆盘，与本车观感无关；③ 半径 hullWid*0.30 ≈ 11px，
//   在 73×38 的车体上小到几乎不可见 ⇒ 玩家主观结论就是「副炮塔没效果」。
//   现行：位姿 = 主炮塔 **座圈中心**（turretPivot）+ 沿主炮塔朝向再前移一点，缩放 = 主炮塔的 0.62，
//   外观直接复用本车炮塔顶点（turretPoly）——读作「同一辆车上多装了一座小炮塔」。
const SECONDARY_TURRET_SCALE = 0.62;

function secondaryTurretPose(t){
  if(!t || !t.weapons || !t.weapons.secondary || t.weapons.secondary.type !== 'turret') return null;
  const hullLen = t.hullLen || 120;
  const turLen = t.turLen || 38, turWid = t.turWid || 34;
  const s = SECONDARY_TURRET_SCALE;
  const structureA = (typeof superstructureAngle === 'function') ? superstructureAngle(t) : (t.turretAngle || 0);
  // #4（2026-10-19 用户裁定）：「贴图改为固定的一个小型的 dummy 坦克的炮塔，
  // #4（2026-10-19 用户裁定）→ #4c（同日二次实测反馈「车长塔**为什么绑定在车体上**？
  //   肯定是绑定在炮塔上的」）：
  //   **坐标系口径（本函数返回世界坐标）**：
  //     · `updateSecondaryTurret`（js/tank_weapons.js）直接当世界系用（炮弹 x/y）——正确；
  //     · `drawSecondaryTurret` 的两处调用点（:1024 精灵 / :1606 程序化）都处于
  //       `translate(t.x,t.y)+rotate(hullAngle)` 的**车体局部变换**内——消费前必须把
  //       世界系 pose 逆变换回车体局部（本文件 `drawSecondaryTurret` 内做）。
  //   ⚠️ 关键事实：`turretPivot(t)` 返回的是**世界坐标**（已含 hullAngle 旋转 + t.x/t.y
  //   平移；实测 hullAngle=45° 时返回值随车转）——不是车体局部偏移！
  //   所以世界系合成：座圈世界位置 + cupola（炮塔系）按**世界炮塔角**旋转。
  let px = t.x, py = t.y;
  let anchored = false;
  if(typeof cupolaAnchor === 'function' && typeof turretPoly === 'function'){
    let tv = null;
    try { tv = turretPoly(t).verts; } catch(_) { tv = null; }
    const cup = cupolaAnchor({
      verts: tv,
      heightClass: t.heightClass,
      hasTurret: t.hasTurret !== false,
      cupolaStyle: (t.appearance && t.appearance.cupola && t.appearance.cupola.style) || undefined
    });
    if(cup && isFinite(cup.x) && isFinite(cup.y)){
      // 座圈世界位置
      let rx0 = t.x, ry0 = t.y;
      if(typeof turretPivot === 'function'){
        const off = turretPivot(t);
        if(off && isFinite(off.x) && isFinite(off.y)){ rx0 = off.x; ry0 = off.y; }
      }
      // 炮塔局部 → 世界：按**世界炮塔角** turretAngle 旋转 + 座圈平移
      const ta = t.turretAngle || 0;
      const ca = Math.cos(ta), sa = Math.sin(ta);
      px = rx0 + cup.x * ca - cup.y * sa;
      py = ry0 + cup.x * sa + cup.y * ca;
      anchored = true;
    }
  }
  if(!anchored){
    // 回退：炮塔旋转中心（turretPivot 本身就是世界系）
    if(typeof turretPivot === 'function'){
      const off = turretPivot(t);
      if(off && isFinite(off.x) && isFinite(off.y)){ px = off.x; py = off.y; }
    }
  }
  const angle = (typeof t.secondaryTurretAngle === 'number') ? t.secondaryTurretAngle : (t.turretAngle || 0);
  return {
    x: px, y: py, angle: angle,
    scale: s,
    // 缩放后的「炮塔半径」（供血条/命中提示等消费方估算体量）
    radius: Math.max(5, turWid * 0.5 * s),
    // 副炮塔炮管：比主炮短一截（按副武器削弱系数 0.75 的观感刻意略短）
    barrelLen: Math.max(10, t.turLen * 0.9 * s),
    barrelWid: Math.max(2, turWid * 0.18 * s)
  };
}

// 画一座「缩放版自身炮塔」：复用本车炮塔多边形顶点（turretPoly），按 pose.scale 缩放 + 平移到 pose 位置，
// 朝 pose.angle 旋转——外观件（涂装/勾线/受光）与主炮塔同源，读作同一辆车上多装的一座小炮塔。
function drawSecondaryTurret(ctx, t){
  const pose = secondaryTurretPose(t);
  if(!pose) return false;
  if(t.ammoBlew) return false;   // 殉爆掀飞炮塔后不绘制
  const s = pose.scale;
  const bCol = tankBodyCol(t);
  // 2026-10-23 修复：副炮塔「不显示/不生效」——
  //   `secondaryTurretPose` 返回的是**世界坐标**，而两个绘制分支调用本函数时 ctx 处于
  //   **世界坐标系**（无 translate(t.x,t.y)+rotate(hullAngle) 外层），此前的「逆变换回
  //   车体局部」把坐标多转/多平移一次，副炮塔画到屏幕外 ⇒ 观感「没显示」。
  //   现行直接按世界坐标定位、按世界角旋转，与 `updateSecondaryTurret` 弹道起点严格同源。
  const dxa = pose.x - t.x, dya = pose.y - t.y;
  // 炮塔多边形顶点（相对车体原点的模型坐标）——平移到原点后按 s 缩放
  let verts = null;
  if(typeof turretPoly === 'function'){
    const tp = turretPoly(t);
    if(tp && Array.isArray(tp.verts)) verts = tp.verts;
  }
  ctx.save();
  ctx.translate(pose.x, pose.y);
  // 底座投影（与主炮塔同款：世界固定光向右下）
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  if(verts){
    for(let i = 0; i < verts.length; i++){
      const vx = verts[i][0] * s + 2, vy = verts[i][1] * s + 3;
      i ? ctx.lineTo(vx, vy) : ctx.moveTo(vx, vy);
    }
  } else {
    ctx.arc(2, 3, pose.radius, 0, TAU);
  }
  ctx.closePath(); ctx.fill();

  ctx.rotate(pose.angle);
  // 炮塔本体（缩放多边形）+ 侧壁暗边 + 勾线
  ctx.beginPath();
  if(verts){
    for(let i = 0; i < verts.length; i++){
      const vx = verts[i][0] * s, vy = verts[i][1] * s;
      i ? ctx.lineTo(vx, vy) : ctx.moveTo(vx, vy);
    }
  } else {
    ctx.arc(0, 0, pose.radius, 0, TAU);
  }
  ctx.closePath();
  ctx.fillStyle = shade(bCol, -6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,15,18,0.60)'; ctx.lineWidth = 1.2; ctx.stroke();
  // 副炮塔炮管（沿 pose.angle，从炮塔前缘伸出）
  const frontX = (verts ? (verts[0][0] * s) : pose.radius) * 0.6;
  ctx.strokeStyle = shade(bCol, -12); ctx.lineWidth = pose.barrelWid; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(frontX, 0); ctx.lineTo(frontX + pose.barrelLen, 0); ctx.stroke();
  // 受光高光（与主炮塔 rim light 同向，避免「一块死色斑」）
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = Math.max(1, pose.barrelWid * 0.35);
  ctx.beginPath(); ctx.moveTo(frontX, -pose.barrelWid * 0.5); ctx.lineTo(frontX + pose.barrelLen * 0.9, -pose.barrelWid * 0.5); ctx.stroke();
  ctx.restore();
  // 炮口闪光/曳光由开火路径（updateSecondaryTurret → fireActiveSecondary → shell）统一处理，
  // 这里只画静态外观，不额外叠特效（避免与主炮特效混淆）。
  return true;
}

// ======================= 敌方警戒状态指示（#P2 2026-10-24） =======================
// 需求（用户）：「为敌人的警戒状态添加 ui 指示，如问号等」+ 两处裁定：
//   ① 显示范围 = **仅视口内敌人**（`aabbInView` 剔除；视口外不泄露情报）；
//   ② 语义 = **两档**：问号「?" = 怀疑/搜寻，感叹号 "!" = 已发现并锁定。
//
// 状态来源（实测 2026-10-24）：
//   `alertLevel` 0=calm / 1=suspicious(闻声) / 3=engaged；
//   `aiState`  patrol / suspicious / search / hold / skirmish / charge / react / stunned。
//   ⚠️ `alertLevel === 2`（友邻遇袭）**从未被写入**（`alertEntity` 直接置 3）——见 §4.128 已知项。
//
// 归并口径（纯函数，可 Node 测试）：
//   "engaged"  ← aiEngaged===true 且处于交火/机动/起转（react/skirmish/charge/hold）或 alertLevel>=3
//   "alert"    ← 正在搜寻玩家记忆位置（aiState==='search'）或 alertLevel>=1（闻声调查）
//   null       ← patrol / stunned / 已死 → **不显示**（不打扰画面）
function alertIndicatorFor(t){
  if(!t || t.hp <= 0) return null;
  if(t.team !== 'enemy') return null;
  if(t.isBoss) return null;                    // Boss 有独立血条/阶段 UI，不叠加
  if(t.aiState === 'stunned') return null;     // 硬直/眩晕不表达警戒

  const lv = (typeof t.alertLevel === 'number') ? t.alertLevel : 0;
  // 已接战：aiEngaged 且不在纯巡逻/搜寻态；或 alertLevel 已达 3
  const fightingStates = { react: 1, skirmish: 1, charge: 1, hold: 1 };
  if(lv >= 3 || (t.aiEngaged === true && fightingStates[t.aiState])) return 'engaged';
  // 搜寻/怀疑：闻声调查、或正朝 lastKnownPlayerPos 搜索
  if(t.aiState === 'search' || lv >= 1) return 'alert';
  return null;
}

// 绘制警戒指示：位于血条上方（不遮挡坦克本体与等级标签）。
function drawAlertIndicator(ctx, t){
  const kind = alertIndicatorFor(t);
  if(!kind) return;
  const barW = 44, barH = 5;
  const bx = t.x - barW/2, by = t.y + (t.hullWid||38)/2 + 14;
  const cx = bx + barW/2, cy = by - 12;         // 血条正上方
  const isEngaged = kind === 'engaged';
  const col = isEngaged ? '#ff4d3d' : '#ffd24d';

  ctx.save();
  // 深色底衬圆（保证任何地形上都可读）
  ctx.beginPath();
  ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(12,14,10,0.72)';
  ctx.fill();
  // 描边：已锁定用实线、怀疑用虚线（弱化，不抢焦点）
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.4;
  if(!isEngaged && typeof ctx.setLineDash === 'function') ctx.setLineDash([2.5, 2]);
  ctx.stroke();
  if(typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

  // 字形：**用路径绘制，不依赖字体**。
  //   为什么不用 fillText：① 离线回归垫片 `mini-canvas` 的 fillText 是**空实现**
  //   ⇒ 像素断言永远测不到字形（实测两状态像素数完全相同 = 假绿）；
  //   ② 不同设备/字体缺失时字形可能不可见。路径绘制在两处都稳定。
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  if(isEngaged){
    // 感叹号：上方竖条 + 下方圆点
    ctx.fillRect(cx - 1.1, cy - 5.2, 2.2, 6.4);
    ctx.beginPath();
    ctx.arc(cx, cy + 3.6, 1.35, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 问号：上钩弧 + 短竖 + 圆点
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy - 2.4, 2.9, Math.PI * 0.85, Math.PI * 2.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + 0.6);
    ctx.lineTo(cx, cy + 2.0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 4.1, 1.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 车型标志：六边形 = 重坦，五边形 = 中坦（显示在血条左侧）
function drawClassBadge(ctx, t, x, y){
  const n = t.heightClass === 'heavy' ? 6 : 5;
  const R0 = 6, r0 = 4;
  const cc = t.heightClass === 'heavy' ? '#ffb454' : '#5cc8ff';
  ctx.save();
  ctx.fillStyle = 'rgba(16,18,14,0.8)';
  ctx.strokeStyle = cc; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for(let i = 0; i < n; i++){
    const a = -Math.PI/2 + i*(2*Math.PI/n);
    const px = x + Math.cos(a)*R0, py = y + Math.sin(a)*R0;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cc; ctx.globalAlpha = 0.85;
  ctx.beginPath();
  for(let i = 0; i < n; i++){
    const a = -Math.PI/2 + i*(2*Math.PI/n);
    const px = x + Math.cos(a)*r0, py = y + Math.sin(a)*r0;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ======================= P-36/#81 biome 地面（drawGround） =======================
// 纯程序化零资产地面绘制：底色填充视口区 + 基于 seed 的确定性低频色斑。
// opts = { viewBounds: {minX,minY,maxX,maxY}, biome: 'concrete'|'meadow'|'steppe'|..., seed }
// 调色板来自 RULES.biomes；同 seed 同 biome 输出完全一致（LCG 确定性，不逐帧闪烁）。

// 种子哈希：数字直取；字符串 FNV-1a 压缩为 32bit 非零种子
function _groundSeedHash(seed) {
  let s;
  if (typeof seed === 'number') s = seed >>> 0;
  else {
    s = 2166136261 >>> 0;
    const str = String(seed);
    for (let i = 0; i < str.length; i++) {
      s = Math.imul(s ^ str.charCodeAt(i), 16777619) >>> 0;
    }
  }
  return s || 1;
}

function drawGround(ctx, opts) {
  opts = opts || {};
  const biomes = (typeof RULES !== 'undefined' && RULES.biomes) ? RULES.biomes : {};
  // 缺省调色板：RULES 未加载/未知 biome 时的中性草地回退
  const palFor = (b) => biomes[b] || { base: '#3d4630', alt: ['#353d29', '#46503a'] };
  const vb = opts.viewBounds;
  if (!vb || !(vb.maxX > vb.minX) || !(vb.maxY > vb.minY)) return;

  const x0 = vb.minX, y0 = vb.minY, w = vb.maxX - vb.minX, h = vb.maxY - vb.minY;
  // #U3（2026-10-17）：原 LCG 流（`next()`）已随色斑改为世界格 hash 而移除——
  //   其唯一用途是生成视口相对色斑（缺陷根源）。底色/gradient 不需要随机数。

  // #1（2026-10-16）：多 biome——按区段分别填充底色，交界处渐变过渡
  // #GT（2026-10-18）：区段升级为**2 维矩形带** `{x0,x1,y0,y1,biome}`（见 specs/map.md §25）。
  //   旧口径只有 x 带、且 fillRect 用**视口全高** ⇒ 多行片（chunkRows>1）时同列不同行的 zone
  //   x 区间完全相同、biome 却不同，后画的整片盖掉先画的，两个 biome 的纹理层还会**叠在同一片
  //   像素上**（alpha 叠加 → 偏亮 + 纹理密一倍），视口边缘来回切换时就读成「纹理随玩家移动变化」。
  //   现按矩形裁剪；兼容旧的「只有 x0/x1」zone（y0/y1 缺省 = 视口全高）。
  const zoneY0 = (z) => (Number.isFinite(z.y0) ? z.y0 : y0);
  const zoneY1 = (z) => (Number.isFinite(z.y1) ? z.y1 : y0 + h);
  const clampZone = (z) => ({
    x0: Math.max(x0, z.x0), x1: Math.min(x0 + w, z.x1),
    y0: Math.max(y0, zoneY0(z)), y1: Math.min(y0 + h, zoneY1(z)),
    biome: z.biome
  });
  const zones = opts.biomeZones;
  const TRANS_W = 260;  // 过渡带半宽（px）
  ctx.save();
  if (zones && zones.length) {
    for (let zi = 0; zi < zones.length; zi++) {
      const z = clampZone(zones[zi]);
      if (z.x1 <= z.x0 || z.y1 <= z.y0) continue;
      ctx.fillStyle = palFor(z.biome).base;
      ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
    }
    // 交界渐变：沿相邻两 zone 的**公共边界**画过渡带。
    //   #GT（2026-10-18）：只对「垂直方向区间确实相接/重叠」的邻居做渐变——2 维 zone 下同列
    //   不同行的邻居 x 边界相同但 y 不相接，那不是地貌交界（旧口径会给它们也画一条渐变，把整片刷一遍）。
    //
    // #1（2026-10-19 用户反馈「生存模式下上下 2 个地图分片间似乎没有渐变过渡」）：
    //   上面这段原本**只处理 x 方向**（左右相邻），而多行片（`opts.chunkRows >= 2`，生存模式用 2）
    //   的地貌交界是 **y 方向**（上下两行）⇒ 行与行之间是硬切色块，没有过渡。
    //   现补齐 `y` 方向：判据与 x 方向对偶（x 区间相接/重叠 + y 边界相等），
    //   过渡带几何同样对偶（沿公共 y 边界上下各 TRANS_W，横向覆盖两 zone 的交集）。
    //   两个方向都用「公共边界 + 区间交集」判据，因此对角相邻（既不接 x 也不接 y）不会误画。
    const drawSeam = (axis) => {
      for (let zi = 0; zi + 1 < zones.length; zi++) {
        const a = clampZone(zones[zi]), b = clampZone(zones[zi + 1]);
        if (axis === 'x') {
          if (a.x1 !== b.x0 && b.x1 !== a.x0) continue;       // 不是水平相邻
          const gy0 = Math.max(a.y0, b.y0), gy1 = Math.min(a.y1, b.y1);
          if (gy1 <= gy0) continue;                            // y 不相交 ⇒ 不是地貌交界
          const bx = (a.x1 === b.x0) ? a.x1 : b.x1;            // 交界 x
          const gx0 = Math.max(x0, bx - TRANS_W), gx1 = Math.min(x0 + w, bx + TRANS_W);
          if (gx1 <= gx0) continue;
          const cA = palFor(a.biome).base, cB = palFor(b.biome).base;
          const grad = ctx.createLinearGradient(gx0, 0, gx1, 0);
          grad.addColorStop(0, cA);
          grad.addColorStop(1, cB);
          ctx.fillStyle = grad;
          ctx.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
        } else {
          // y 方向（上下相邻）：判据与 x 完全对偶
          if (a.y1 !== b.y0 && b.y1 !== a.y0) continue;        // 不是上下相邻
          const gx0b = Math.max(a.x0, b.x0), gx1b = Math.min(a.x1, b.x1);
          if (gx1b <= gx0b) continue;                          // x 不相交 ⇒ 不是地貌交界
          const by = (a.y1 === b.y0) ? a.y1 : b.y1;            // 交界 y
          const gy0b = Math.max(y0, by - TRANS_W), gy1b = Math.min(y0 + h, by + TRANS_W);
          if (gy1b <= gy0b) continue;
          const cA = palFor(a.biome).base, cB = palFor(b.biome).base;
          const grad = ctx.createLinearGradient(0, gy0b, 0, gy1b);
          grad.addColorStop(0, cA);
          grad.addColorStop(1, cB);
          ctx.fillStyle = grad;
          ctx.fillRect(Math.max(x0, gx0b), gy0b, gx1b - Math.max(x0, gx0b), gy1b - gy0b);
        }
      }
    };
    drawSeam('x');
    drawSeam('y');
  } else {
    const pal = palFor(opts.biome);
    ctx.fillStyle = pal.base;
    ctx.fillRect(x0, y0, w, h);
  }
  // 色斑：用主 biome（或首区段）的 alt 色
  const pal = palFor((zones && zones.length ? zones[0].biome : opts.biome));
  const alts = (pal.alt && pal.alt.length) ? pal.alt : [pal.base];

  // #U3（2026-10-17 修复）：色斑改为**世界坐标锚定**——原实现以视口为基准生成
  //   （`x0 + next()*w`），视口每移动一点整组色斑随之平移，观感上「地面纹理跟着玩家走」。
  //   现改为按固定世界格（CELL）铺开：每格的色斑数量/位置/尺寸/角度全部由「格坐标 + seed」
  //   经 hash 派生（不用 LCG 流，避免顺序依赖），与视口无关 ⇒ 相机移动时色斑纹丝不动。
  //   只绘制与视口相交的格，成本与格数成正比（与视口面积成正比，同原实现）。
  const CELL = 640;                        // 世界格边长（px）
  const baseSeed = _groundSeedHash(opts.seed);
  const gx0 = Math.floor(x0 / CELL) - 1, gx1 = Math.floor((x0 + w) / CELL) + 1;
  const gy0 = Math.floor(y0 / CELL) - 1, gy1 = Math.floor((y0 + h) / CELL) + 1;
  // 格内确定性 hash（同格同值；与遍历顺序无关）
  const cellHash = (gx, gy, k) => {
    let n = baseSeed ^ Math.imul(gx | 0, 0x9E3779B1) ^ Math.imul(gy | 0, 0x85EBCA77) ^ Math.imul(k | 0, 0xC2B2AE3D);
    n = Math.imul(n ^ (n >>> 15), 0x2545F491);
    n = Math.imul(n ^ (n >>> 13), 0x27D4EB2F);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();   // 色斑裁剪在视口区内
  // #U11-2026-10-18：逐斑 beginPath/fill → **按 (alpha档 × 颜色) 合批**。
  //   旧实现每斑 4 次调用（globalAlpha/fillStyle/beginPath/ellipse/fill ≈ 5 次），
  //   视口 1920×1080 实测 107 个斑 → 约 535 次 ctx 调用/帧，全是可合并的纯填充。
  //   斑的不透明度只有 0.06~0.12 一个窄带，量化成 2 档后视觉无差异（同色同档共用一次 fill）。
  //   alpha 档与颜色作为桶键：桶数 ≤ 2×alt.length（实测 ≤ 8），远小于斑数。
  {
    const BUCKETS = new Map();
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const n = 3 + Math.floor(cellHash(gx, gy, 0) * 4);   // 每格 3~6 个斑（密覆视口，无缝无重叠感）
        const cxs = gx * CELL, cys = gy * CELL;
        for (let i = 0; i < n; i++) {
          const cx = cxs + cellHash(gx, gy, i * 6 + 1) * CELL;
          const cy = cys + cellHash(gx, gy, i * 6 + 2) * CELL;
          const rw = CELL * (0.10 + cellHash(gx, gy, i * 6 + 3) * 0.16);
          const rh = rw * (0.45 + cellHash(gx, gy, i * 6 + 4) * 0.5);
          const rot = cellHash(gx, gy, i * 6 + 5) * Math.PI;
          const aTier = cellHash(gx, gy, i * 6 + 6) < 0.5 ? 0 : 1;
          const col = alts[Math.floor(cellHash(gx, gy, i * 6 + 3) * alts.length) % alts.length];
          const bk = aTier + '|' + col;
          let bucket = BUCKETS.get(bk);
          if (!bucket) { bucket = { alpha: aTier ? 0.115 : 0.075, col, items: [] }; BUCKETS.set(bk, bucket); }
          bucket.items.push([cx, cy, rw, rh, rot]);
        }
      }
    }
    for (const b of BUCKETS.values()) {
      ctx.globalAlpha = b.alpha;
      ctx.fillStyle = b.col;
      ctx.beginPath();
      for (const [cx, cy, rw, rh, rot] of b.items) {
        // ellipse 会 push 独立子路径（mini-canvas 与浏览器一致），故一条 beginPath 内可累积多斑
        ctx.ellipse(cx, cy, rw, rh, rot, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // #U11（2026-10-17 用户需求）：biome 地面**材质纹理**——在底色与低频色斑之上叠一层
  //   细密、世界锚定的程序化纹理（纯 canvas，零资产，与 `assets/` 为空的设计一致）。
  //   按 biome 分别绘制：草地→短划草丛；雪地→细碎雪粒 + 微弱风纹；沙漠→沙纹涟漪；
  //   泥地→深色湿斑；城镇→横向铺装线。全部用 cellHash 派生（同格同值、随相机移动不动）。
  drawGroundTexture(ctx, opts, { x0, y0, w, h, baseSeed });
  ctx.restore();
}

// ============ 地面层视口锚定滚动烘焙（#GT，2026-10-18） ============
// 动机（用户报「部分 biome（雪地、沙漠）纹理会随玩家移动变化，帧率也大幅下降」）——两个独立成因：
//   ① **性能**：`_paintGroundTexture` 每帧按「世界格 hash」重算并重描全部图元。实测 1920×1080
//      单帧：雪地 11,717 图元 / 沙漠 4,777 / 草地 14,047 / 泥地 6,455；zoom 0.5（看全图，
//      视口 3840×2160）雪地 45,087、泥地 23,641 图元，单帧地面纹理耗时 **31.6~84.6ms**
//      —— 60fps 预算只有 16.7ms，于是「一移动就掉帧」。这些图元与相机无关（世界锚定），
//      **每帧重画纯属浪费**。
//   ② **观感抖动**：即使几何完全世界锚定，程序化细图元（雪粒 1~2px / 沙纹 1.2px 描边）在
//      **亚像素**相机位移下会被重采样成不同亮度；实测相机移动 0.5px 时 1.5%~2.9% 的采样点
//      亮度变化 >3 —— 雪地/沙漠这类高对比细纹理最明显，读起来就是「纹理随玩家移动而变」。
// 解法：把地面（底色 + 色斑 + 材质纹理）**烘焙成视口大小的离屏画布**，按世界坐标锚定，
//   相机在内半区移动时直接 blit（每次 1 次 drawImage），越过迟滞才重烘焙；
//   烘焙发生在整数化的世界原点上，所以亚像素位移被完全吸收。
//   与道路的 `ensureGroundBake`（tank_battle.html）同款迟滞思路，但只覆盖地面层、成本更低。
const GROUND_CACHE_MARGIN = 320;    // 烘焙区相对视口的外扩余量（世界 px，迟滞带 = 该值的一半）
// 单块烘焙画布的**像素**上限（不是世界尺寸上限）：决定内存与 blit 成本的是缓冲的像素数，
//   与世界覆盖范围无关。1966 万 px ≈ 75MB RGBA，是安全上限。
//   #GT 修正：旧判据用「世界尺寸 > 4096 就不烘焙」，而 zoom 0.5 看全图时世界视口 3840×2160
//   +MARGIN 达 4480×2800 ⇒ 被误拒，缩小视角时又退回每帧 45k 图元直绘（正掉帧最严重的场景）。
//   现按「世界尺寸 × zoom = 缓冲像素」判定：zoom 0.5 时 4480×2800 世界 ⇒ 2240×1400 缓冲，
//   远在预算内，可以正常烘焙。
const GROUND_CACHE_MAX_PX = 4096 * 4096;

// 地面纹理层的「代数」计数：biome/seed/zones 变化即失效（供调试与测试断言）
let _groundCache = null;            // { canvas, ctx, ox, oy, w, h, key }

function _groundCacheKey(opts, vb) {
  // seed + biome + zones 的紧凑指纹（zone 只取区间与 biome，数量少，直接拼串）
  const zs = opts.biomeZones;
  let z = '';
  if (zs && zs.length) {
    for (let i = 0; i < zs.length; i++) {
      const q = zs[i];
      z += Math.round(q.x0) + ',' + Math.round(q.x1) + ','
        + Math.round(Number.isFinite(q.y0) ? q.y0 : -1) + ','
        + Math.round(Number.isFinite(q.y1) ? q.y1 : -1) + ',' + q.biome + ';';
    }
  }
  return _groundSeedHash(opts.seed) + '|' + (opts.biome || '') + '|' + z;
}

/**
 * 取（必要时重建）与当前视口匹配的地面烘焙缓存。
 * 缓存命中条件：key 相同 + 视口仍在「外扩 MARGIN 后、再内缩 MARGIN/2」的迟滞区内。
 *
 * 烘焙缓冲区按**屏幕像素**尺寸建（世界尺寸 × zoom），画的时候再以 zoom 放大回世界变换里——
 * 这样无论 zoom 多少，缓冲成本恒为「视口像素 + 余量」，缩小看全图时不会因世界范围变大而爆内存。
 * @param {any} ctx 目标 ctx（仅用于读取尺寸；缺省用 document.createElement 建画布）
 * @param {any} opts drawGround 的 opts（含 viewBounds/biome/biomeZones/seed；`opts.zoom` 缺省 1）
 * @param {Function|null} makeCanvas (w,h)=>CanvasLike 工厂；缺省用 document.createElement
 * @returns {any|null} { canvas, ox, oy, w, h, z } 或 null（不能/无需烘焙）
 */
function ensureGroundCache(ctx, opts, makeCanvas) {
  const vb = opts && opts.viewBounds;
  if (!vb || !(vb.maxX > vb.minX) || !(vb.maxY > vb.minY)) return null;
  const zoom = (opts.zoom > 0) ? opts.zoom : 1;
  const vw = vb.maxX - vb.minX, vh = vb.maxY - vb.minY;
  // 世界尺寸的烘焙区（含余量）
  const wantW = vw + 2 * GROUND_CACHE_MARGIN, wantH = vh + 2 * GROUND_CACHE_MARGIN;
  // 缓冲像素尺寸（= 世界尺寸 × zoom）
  const bufW = Math.ceil(wantW * zoom), bufH = Math.ceil(wantH * zoom);
  if (!(bufW > 0) || !(bufH > 0)) return null;
  // 像素护栏：过大的视口（极端缩小）才回退直绘，避免几百 MB RGBA
  if (bufW * bufH > GROUND_CACHE_MAX_PX || bufW > 8192 || bufH > 8192) return null;
  const key = _groundCacheKey(opts) + '|z' + Math.round(zoom * 1000);
  if (_groundCache && _groundCache.key === key) {
    const c = _groundCache;
    const halfX = GROUND_CACHE_MARGIN / 2, halfY = GROUND_CACHE_MARGIN / 2;
    const insetX = ((c.w / zoom) - vw) / 2, insetY = ((c.h / zoom) - vh) / 2;
    if (insetX >= halfX && insetY >= halfY &&
        vb.minX >= c.ox + (insetX - halfX) && vb.maxX <= c.ox + (c.w / zoom) - (insetX - halfX) &&
        vb.minY >= c.oy + (insetY - halfY) && vb.maxY <= c.oy + (c.h / zoom) - (insetY - halfY)) {
      return c;
    }
  }
  // 重烘焙：以**整数化**的世界原点建画布（吸收亚像素抖动）
  const ox = Math.floor((vb.minX + vb.maxX) / 2 - wantW / 2);
  const oy = Math.floor((vb.minY + vb.maxY) / 2 - wantH / 2);
  const w = bufW, h = bufH;
  let canvas = null;
  if (typeof makeCanvas === 'function') canvas = makeCanvas(w, h);
  else if (typeof document !== 'undefined' && document.createElement) {
    canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
  }
  if (!canvas) return null;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return null;
  if (typeof g.clearRect === 'function') g.clearRect(0, 0, w, h);
  // 在烘焙画布的坐标系里：先把 zoom 放大（世界→缓冲像素），再把世界原点平移到 (ox, oy)
  g.save();
  g.scale(zoom, zoom);
  g.translate(-ox, -oy);
  drawGround(g, {
    viewBounds: { minX: ox, minY: oy, maxX: ox + wantW, maxY: oy + wantH },
    biome: opts.biome, biomeZones: opts.biomeZones, seed: opts.seed,
    _skipCache: true                 // 防止递归（drawGround 内部不再走缓存）
  });
  g.restore();
  _groundCache = { canvas: canvas, ctx: g, ox: ox, oy: oy, w: w, h: h, z: zoom, key: key };
  return _groundCache;
}

// 清空地面烘焙缓存（换节点 / dev 随机场 / 改 seed 时调用）
function clearGroundCache() { _groundCache = null; }

/**
 * 绘制地面层（带烘焙缓存）。世界坐标锚定；相机在内半区移动时直接 blit。
 * @param {any} ctx 世界系 ctx（已经过相机变换与 cam.zoom 缩放）
 * @param {any} opts 同 drawGround，另支持 `opts.noCache=true` 强制直绘（测试/调试）；
 *   `opts.zoom` 为当前 cam.zoom（缺省 1）——烘焙缓冲按屏幕像素建，必须传入才与屏幕 1:1
 * @param {Function|null} [makeCanvas] 离屏画布工厂（Node 测试注入）
 * @returns {boolean} true = 走了缓存 blit，false = 每帧直绘
 */
function drawGroundCached(ctx, opts, makeCanvas) {
  opts = opts || {};
  if (opts.noCache) { drawGround(ctx, opts); return false; }
  const cache = ensureGroundCache(ctx, opts, makeCanvas);
  if (!cache) { drawGround(ctx, opts); return false; }
  // 缓冲是「屏幕像素」分辨率，画回世界变换里要除以 zoom 还原世界尺寸
  ctx.drawImage(cache.canvas, cache.ox, cache.oy, cache.w / cache.z, cache.h / cache.z);
  return true;
}

// 地面材质纹理（#U11）。opts 同 drawGround；box 为视口世界矩形；seed 为基哈希。
// 每个 biome 用一套「图元」：位置/角度/尺寸/透明度全部由世界格 hash 派生，确定性且不随视口漂移。
// 支持 biomeZones：按区段分别取样式（strip 节点一根横向世界会跨多个 biome），
// 区段裁剪与 drawGround 的底色填充同口径（2 维矩形 `{x0,x1,y0,y1}`）。
function drawGroundTexture(ctx, opts, box){
  const { x0, y0, w, h, baseSeed } = box;
  const zones = opts.biomeZones;
  if(zones && zones.length){
    // #GT（2026-10-18）：2 维矩形 zone `{x0,x1,y0,y1,biome}`；兼容旧的只用 x0/x1 的 1 维 zone
    //   （y0/y1 缺省 = 视口全高）。**必须按矩形裁剪**：旧实现在多行片下同一 x 被两个 biome 各画
    //   一遍纹理，两层 alpha 叠在同一片像素上 ⇒ 纹理密一倍、整体偏亮，且视口边缘切换时像是
    //   「纹理随玩家移动变化」。
    for(let i = 0; i < zones.length; i++){
      const z = zones[i];
      const zx0 = Math.max(x0, z.x0), zx1 = Math.min(x0 + w, z.x1);
      const zy0 = Math.max(y0, Number.isFinite(z.y0) ? z.y0 : y0);
      const zy1 = Math.min(y0 + h, Number.isFinite(z.y1) ? z.y1 : y0 + h);
      if(zx1 <= zx0 || zy1 <= zy0) continue;
      _paintGroundTexture(ctx, z.biome, baseSeed, zx0, zy0, zx1 - zx0, zy1 - zy0);
    }
    return;
  }
  _paintGroundTexture(ctx, opts.biome, baseSeed, x0, y0, w, h);
}

// 单 biome 的纹理落笔（drawGroundTexture 的内层实现，按矩形区段裁剪）。
// #TEX5-2026-10-18 性能重做：原实现**每个图元一组 beginPath/moveTo/lineTo/stroke**，
//   1920×1080 实测（`tmp/bench-ground.js`，mini-canvas 计数）雪地 35,315 次 ctx 调用/帧、
//   草地 26,973 次、草原 21,061 次——纯地面纹理就吃掉上千次状态切换，是绘制层最大热点。
//   改为「按透明度分桶批处理」：同一 alpha 桶内所有图元合成**一条路径**，4 桶 → 每帧
//   最多 4 次 fill + 4 次 stroke。视觉几乎无差（alpha 由连续量化到 4 档），
//   图元位置/角度/尺寸仍逐格由 hash 派生，世界锚定与确定性完全不变。
const _GT_BUCKETS = 4;          // alpha 量化档数
const _GT_SCRATCH = [];         // 每档一个扁平数组（模块级复用，避免每帧分配）
for(let i = 0; i < _GT_BUCKETS; i++) _GT_SCRATCH.push([]);

function _paintGroundTexture(ctx, biome, baseSeed, x0, y0, w, h){
  const style = {
    // #U11 调色：纹理色必须与底色拉开 ≥12 个灰阶，否则在 0.35~0.85 的 globalAlpha 叠加后
    //   合成为「看不出有纹理」（实测 steppe/desert/mudland/concrete 首版全部踩到这个坑）。
    meadow:   { cell: 26,  n: 3, col: 'rgba(150,180,96,0.30)',  shape: 'blade' },
    snow:     { cell: 22,  n: 4, col: 'rgba(255,255,255,0.34)', shape: 'speck' },
    desert:   { cell: 40,  n: 2, col: 'rgba(170,136,74,0.42)',  shape: 'dune' },
    steppe:   { cell: 30,  n: 3, col: 'rgba(92,76,40,0.45)',    shape: 'blade' },
    mudland:  { cell: 34,  n: 2, col: 'rgba(38,28,18,0.42)',    shape: 'patch' },
    concrete: { cell: 48,  n: 2, col: 'rgba(176,180,186,0.45)', shape: 'pave' }
  }[biome];
  if(!style || !(w > 0) || !(h > 0)) return;
  const CELL = style.cell;
  // 独立于色斑的 hash 通道（用不同乘子避免与色斑完全同位）
  const h1 = (gx, gy, k) => {
    let n = baseSeed ^ Math.imul(gx | 0, 0x27D4EB2F) ^ Math.imul(gy | 0, 0x165667B1) ^ Math.imul(k | 0, 0x9E3779B1);
    n = Math.imul(n ^ (n >>> 15), 0x85EBCA77);
    n = Math.imul(n ^ (n >>> 13), 0xC2B2AE3D);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const gx0 = Math.floor(x0 / CELL) - 1, gx1 = Math.floor((x0 + w) / CELL) + 1;
  const gy0 = Math.floor(y0 / CELL) - 1, gy1 = Math.floor((y0 + h) / CELL) + 1;

  // ---- 第一遍：按 alpha 桶收集图元几何（不触碰 ctx，零 canvas 调用）----
  for(let i = 0; i < _GT_BUCKETS; i++) _GT_SCRATCH[i].length = 0;
  const isFill = (style.shape === 'speck' || style.shape === 'patch');
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const n = 1 + Math.floor(h1(gx, gy, 0) * style.n);
      for (let i = 0; i < n; i++) {
        const b = i * 5;
        const px = gx * CELL + h1(gx, gy, b + 1) * CELL;
        const py = gy * CELL + h1(gx, gy, b + 2) * CELL;
        const s = 0.5 + h1(gx, gy, b + 3);
        // alpha 0.35~0.85 → 4 档（取档中值，桶内统一 globalAlpha）
        const aRaw = 0.35 + h1(gx, gy, b + 4) * 0.5;
        const bi = Math.min(_GT_BUCKETS - 1, Math.floor((aRaw - 0.35) / 0.5 * _GT_BUCKETS));
        const bucket = _GT_SCRATCH[bi];
        if (style.shape === 'blade') {
          // 草丛短划：斜向 3~7px → [x1,y1,x2,y2]
          const ang = -1.2 + h1(gx, gy, b + 5) * 0.8;
          const len = 3 + s * 4;
          bucket.push(px, py, px + Math.cos(ang) * len, py + Math.sin(ang) * len);
        } else if (style.shape === 'speck') {
          // 雪粒：1~2px 小点 → [x,y,r]
          bucket.push(px, py, 0.6 + s * 0.9);
        } else if (style.shape === 'dune') {
          // 沙纹：横向短弧 → [x,y,rw,rot]
          bucket.push(px, py, 8 + s * 10, 0);
        } else if (style.shape === 'patch') {
          // 湿斑：暗色小椭圆 → [x,y,rx,ry,rot]
          bucket.push(px, py, 4 + s * 7, 3 + s * 5, h1(gx, gy, b + 5) * Math.PI);
        } else if (style.shape === 'pave') {
          // 铺装线：短横向直线 → [x1,y1,x2,y2]
          const len = 14 + s * 18;
          bucket.push(px - len / 2, py, px + len / 2, py);
        }
      }
    }
  }

  // ---- 第二遍：每档一次 path + 一次 fill/stroke ----
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  ctx.fillStyle = style.col;
  ctx.strokeStyle = style.col;
  if (isFill) {
    for (let bi = 0; bi < _GT_BUCKETS; bi++) {
      const bucket = _GT_SCRATCH[bi];
      if (!bucket.length) continue;
      ctx.globalAlpha = 0.35 + (bi + 0.5) / _GT_BUCKETS * 0.5;
      ctx.beginPath();
      if (style.shape === 'speck') {
        // 雪粒：1~2px 的点用方点近似（1~2px 尺度下圆/方肉眼无差，但路径点数少一个数量级）
        for (let i = 0; i < bucket.length; i += 3) {
          const px = bucket[i], py = bucket[i + 1], r = bucket[i + 2];
          ctx.rect(px - r, py - r, r * 2, r * 2);
        }
      } else {
        for (let i = 0; i < bucket.length; i += 5) {
          const px = bucket[i], py = bucket[i + 1], rx = bucket[i + 2], ry = bucket[i + 3], rot = bucket[i + 4];
          ctx.moveTo(px + rx * Math.cos(rot), py + rx * Math.sin(rot));
          ctx.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
  } else {
    ctx.lineWidth = (style.shape === 'dune') ? 1.2 : 1;
    for (let bi = 0; bi < _GT_BUCKETS; bi++) {
      const bucket = _GT_SCRATCH[bi];
      if (!bucket.length) continue;
      ctx.globalAlpha = 0.35 + (bi + 0.5) / _GT_BUCKETS * 0.5;
      ctx.beginPath();
      if (style.shape === 'dune') {
        for (let i = 0; i < bucket.length; i += 4) {
          const px = bucket[i], py = bucket[i + 1], rw = bucket[i + 2];
          ctx.moveTo(px + Math.cos(Math.PI * 0.15) * rw, py + Math.sin(Math.PI * 0.15) * rw * 0.28);
          ctx.ellipse(px, py, rw, rw * 0.28, 0, Math.PI * 0.15, Math.PI * 0.85);
        }
      } else {
        for (let i = 0; i < bucket.length; i += 4) {
          ctx.moveTo(bucket[i], bucket[i + 1]);
          ctx.lineTo(bucket[i + 2], bucket[i + 3]);
        }
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    drawTank,
    spriteEnabled,         // #5：精灵分支判据（_spriteOverride 优先，回落 JSON sprite.enabled）
    drawSpriteBarrel,      // 2026-10-22 B5-1：精灵分支炮管层（含 barrelWidthMult 横向通道，供回归测试）
    drawTankSprite,        // 四层精灵整车主入口（同上，测试需要单独驱动某层）
    drawBrokenTracks,
    drawCharredHull,
    drawFireGlow,
    drawShells,
    ammoFamilyOf,          // 2026-10-22 B5-2：弹种键 → 家族（'ap'|'he'|'heat'，本地映射表，不改 RULES）
    AMMO_FAMILY,           // 同上：映射表本体（测试与内容侧只读）
    arcShellPose,          // #X6：曲射弹绘制期姿态（pitch/tilt/foreshorten，纯函数，逻辑层不消费）
    railChargeProgress,    // #U38：电磁炮充能进度（0..1，与 fireTank/HUD 同源）
    drawBossRailLine,      // 2026-10-22 B5-3：Boss 电磁炮蓄能/击发炮线（fx 由 tank_battle.html 提供）
    drawCover,
    wallStyleOf,           // 2026-10-22 B5-3：cov.wallStyle → 六个合法 style 之一（含回退）
    drawWallCover,         // 同上：wall 贴图 + 三级破损叠加
    drawWallDamage,        // 同上：裂纹/缺口叠加（单独导出供回归测试）
    wallDamageLevel,       // 同上：hp/maxHp → 0/1/2 破损等级
    drawRiverChain,        // #U8：河流整链描边（调用方按 groupId 合并后单次调用）
    drawCoverWaterStreak,  // #U8：水流 streak 叠加（整链描边后逐段调用）
    orderRiverSegs,        // #U8：河流段沿程排序
    drawCoverShadow,       // #U11：地图元素地面投影
    drawTankGroundShadow,  // #TEX8：车底软阴影（程序化分支）
    // #V2（2026-10-20）：2.5D 侧壁 / 轮廓光——此前只在文件内定义、未进导出表（无消费方）。
    //   现补齐导出，供回归测试与未来绘制通道复用（两者均纯 ctx、无 DOM 依赖）。
    drawPartSideWall,      // #TEX13：世界光反向偏移的部件侧壁（外层深 + 内层中暗）
    drawTankRimLight,      // #TEX12：世界左上暖白轮廓光（1.1px，只亮受光边）
    renderHullTexture,     // #TEX8：车体纹理入口（供测试验证 weathering/外观件生效）
    renderTurretTexture,   // #TEX8：炮塔纹理入口（同上，炮塔 weathering 回归保护）
    drawGroundTexture,     // #U11：biome 地面材质纹理
    drawGroundCached,      // #GT：地面层视口锚定烘焙缓存（性能 + 亚像素抖动修复）
    ensureGroundCache,     // #GT：取/重建烘焙缓存（纯逻辑可测）
    clearGroundCache,      // #GT：换节点/改 seed 时失效
    _groundSeedHash,       // #GT：种子哈希（测试比对用）
    drawFoliage,
    drawClassBadge,
    alertIndicatorFor,     // #P2：警戒状态归并（纯函数，可 Node 测）
    drawAlertIndicator,    // #P2：警戒图标绘制（? / !）
    drawGround,
    secondaryTurretPose,
    drawSecondaryTurret,
    // 两条绘制通道共用的收尾视觉（#L1）：炮塔座圈 / 射界射线 / 附件 / 世界内 HUD
    drawTurretRing,
    drawTraverseRays,
    drawAttachments,
    drawTankHud
  };
}
// 2026-10-22 B5-3：显式挂到 globalThis（与 tank_fx.js 的 clearFx 同款写法）——
//   浏览器顶层 function 已自动全局，这里再挂一次是无害幂等；Node 侧经 require 后
//   `globalThis.drawBossRailLine` 也可直接调用（页面接线若走动态全局查找也能命中）。
if (typeof globalThis !== 'undefined') {
  globalThis.drawBossRailLine = drawBossRailLine;
  globalThis.ammoFamilyOf = ammoFamilyOf;
  globalThis.wallStyleOf = wallStyleOf;
}
