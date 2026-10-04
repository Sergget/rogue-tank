'use strict';

// tank_fire.js — 战斗核心管线收敛（P-28）。
// mvp/bench 双份内联副本收口到此：
//   shellVerticalDecision / fireTank / tryFire
//   computeSolution / updateSolution + shells 飞行积分物理/判定（stepShells）
// 浏览器：全局脚本按序加载，ctx 缺省回退全局；Node：经 ctx 显式注入（covers/entities/fx/audio/RULES）
// 保持半高越掩插值/护盾吸收守卫(!s.absorbed)/二次跳弹禁止语义。
// 2026-09-15 W2（用户裁定）：烟幕弹（fireSmokeShell/tryFireSmoke/stepShells smoke 分支）整链移除；
// smokeClouds 动态烟幕基础设施（tank_cover.js）保留备用，当前无生产者。

function _ctx(o){ return o || {}; }
function _G(k, fb){ return (typeof globalThis!=='undefined'&&globalThis[k]!==undefined)?globalThis[k]:fb; }
function _rules(c){ return (c&&c.rules)||(c&&c.RULES)||_G('RULES',{}); }
function _tiers(c){ return (c&&c.coverTiers)||_G('COVER_TIERS',(_rules(c).coverTiers||{})); }

// #E4（2026-09-20）便携式掩体的弹道求交：返回弹道段 (sx,sy)→(nx,ny) 与部署掩体 OBB 的首个交点
// 参数（0~1 的段比例 × 段长 → 直接返回像素距离，便于与 step/掩体 distA 同口径比较）；无交返回 null。
// 几何口径与绘制同源：中心 (x,y)、尺寸 hullLen×hullWid、朝向 hullAngle。
function _deployablePathHit(dc, sx, sy, nx, ny){
  const dx = nx - sx, dy = ny - sy;
  const segLen = Math.hypot(dx, dy);
  if(!(segLen > 0)) return null;
  const ux = dx / segLen, uy = dy / segLen;
  const ca = Math.cos(-(dc.hullAngle || 0)), sa = Math.sin(-(dc.hullAngle || 0));
  const ox = sx - dc.x, oy = sy - dc.y;
  const lox = ox * ca - oy * sa, loy = ox * sa + oy * ca;
  const lux = ux * ca - uy * sa, luy = ux * sa + uy * ca;
  const hw = (dc.hullLen || 50) / 2, hh = (dc.hullWid || 20) / 2;
  let tmin = 0, tmax = segLen;
  const slab = (o, u, h) => {
    if(Math.abs(u) < 1e-9) return (o >= -h && o <= h);
    let t1 = (-h - o) / u, t2 = (h - o) / u;
    if(t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    return tmin <= tmax;
  };
  if(!slab(lox, lux, hw)) return null;
  if(!slab(loy, luy, hh)) return null;
  if(tmax < 0 || tmin > segLen) return null;
  return Math.max(0, tmin);
}

// 2026-09-20 #E1（用户反馈「炮弹仍然被不可见物体拦截」）：
// 旧的 shellVerticalDecision（半高/渐变垂直剖面判决）与 s.dec 曝光缓存拦截链**整体删除**。
// 该链有三个不可见拦截来源：
//   ① rubble/stump 等残骸的逻辑 OBB 远大于可见贴图，却按 'grad' 100% 拦停直射实弹；
//   ② s.dec 曝光缓存只在跳弹时复位 —— 掩体被摧毁后缓存仍生效，炮弹停在目标车体命中点（隐形墙）；
//   ③ 视野圈外的敌军不绘制，但弹道 raycast 遍历全部实体 → 不可见车体拦弹。
// 现行口径：炮弹只被**确定性**掩体拦截——shellBlock===true（建筑/岩石/树，在掩体入口点截停）
// 与 'single'（沙袋，挡 1 发 / >70° 跳弹）；其余（水/泥/路/栅栏/残骸/灌木/倒树）一律越飞。

// 阶段七 7.3：主武器配置读取（weapons.primary 倍率：reloadMult/damageMult/penMult/shellSpeedMult/burst/stagger/count）
function primaryWeaponSpec(shooter) {
  const p = shooter && shooter.weapons && shooter.weapons.primary;
  if (!p || !p.type || p.type === 'standard' || p.type === 'none') {
    if (p) p._spec = null;
    return null;
  }
  if (p._spec) return p._spec;
  let base = {};
  let WD = (typeof WEAPON_DEFAULTS !== 'undefined') ? WEAPON_DEFAULTS : null;
  if (!WD && typeof require !== 'undefined') {
    try { WD = require('./tank_weapons.js').WEAPON_DEFAULTS; } catch (e) { WD = null; }
  }
  if (WD && WD.primary && WD.primary[p.type]) base = WD.primary[p.type];
  p._spec = Object.assign({ type: p.type }, base, p.stats || {});
  return p._spec;
}

// 阶段七 7.3：按主武器规格发射单发炮弹（2026-09-15 W6：autocannon 改逐发短间隔 + 热量机制，
// burst 连发次发路径已删除）。共享 fireTank 的弹道计算（倍率 + 弹种 + 散布），返回值 = 生成的 shell 或 null。
// 2026-09-15 W4：lateralOffsetPx = 炮口横向偏移（双管并排：±offset 各打各的管口）。
function firePrimaryShell(shooter, target, hitPref, ctx, lateralOffsetPx) {
  const c = _ctx(ctx);
  const shells = c.shells || _G('shells', null);
  if (!shells) return null;
  const R = _rules(c);
  const gunRoot = c.gunRoot || _G('gunRoot', null);
  const gunTip = c.gunTip || _G('gunTip', null);
  const gauss = c.gaussian || _G('gaussian', function () { return 0; });
  const burst = c.burstExplosion || _G('burstExplosion', function () {});
  const muzzle = c.spawnMuzzleFlash || _G('spawnMuzzleFlash', function () {});
  const play = c.playSound || _G('playSound', function () {});
  const devAim = c.devAim !== undefined ? c.devAim : _G('devAim', null);
  if (!shooter || !gunRoot || !gunTip) return null;
  const spec = primaryWeaponSpec(shooter);
  const dmgMult = (spec && typeof spec.damageMult === 'number') ? spec.damageMult : 1;
  const penMult = (spec && typeof spec.penMult === 'number') ? spec.penMult : 1;
  const speedMult = (spec && typeof spec.shellSpeedMult === 'number') ? spec.shellSpeedMult : 1;
  const rootP = gunRoot(shooter), tipP = gunTip(shooter);
  const getAmmoCfg = c.computeAmmoConfig || _G('computeAmmoConfig', function (s, k) { return (R.ammoTypes && (R.ammoTypes[k] || R.ammoTypes.ap)) || { speed: 1, pen: 1, dmg: 1, spread: 1 }; });
  const ammo = getAmmoCfg(shooter, shooter.ammoKey);
  const zero = devAim && devAim.zeroSpread && shooter.id === 'player';
  const spreadAcc = (ammo && typeof ammo.spreadAcc === 'number') ? ammo.spreadAcc : 1;
  const cardSpreadMul = (ammo && typeof ammo.spread === 'number') ? ammo.spread : 1;
  const sigma = zero ? 0 : ((shooter.sigma || 0) * spreadAcc * cardSpreadMul);
  const spreadAngle = shooter.turretAngle + gauss(sigma);
  const dx = Math.cos(spreadAngle), dy = Math.sin(spreadAngle);
  // 2026-09-15 W4：双管并排——炮口与弹道起点按 lateralOffsetPx 沿炮塔横向平移
  let ox = tipP.x, oy = tipP.y, fx = rootP.x, fy = rootP.y;
  if (lateralOffsetPx) {
    const perpX = -Math.sin(shooter.turretAngle || 0), perpY = Math.cos(shooter.turretAngle || 0);
    ox += perpX * lateralOffsetPx; oy += perpY * lateralOffsetPx;
    fx += perpX * lateralOffsetPx; fy += perpY * lateralOffsetPx;
  }
  // 2026-09-15 W6：autocannon 视觉炮管略短（barrelLenMult<1）——炮口/特效/弹道起点沿炮塔方向
  // 回缩 (1−barrelLenMult)×炮管可视长度，与 tank_battledraw.js 绘制同源，避免「炮口悬空」；
  // tank 级炮管贯穿掩体判定（gunRoot→gunTip 全长）保持不变。
  if (spec && spec.type === 'autocannon') {
    const lenMult = (typeof spec.barrelLenMult === 'number') ? spec.barrelLenMult : 0.8;
    if (lenMult < 1) {
      const pct = Math.max(0, Math.min(3, ((shooter.barrel && shooter.barrel.len) || 120) / 100));
      const back = (1 - lenMult) * (shooter.turLen || 0) * pct;
      ox -= Math.cos(shooter.turretAngle || 0) * back;
      oy -= Math.sin(shooter.turretAngle || 0) * back;
      fx -= Math.cos(shooter.turretAngle || 0) * back;
      fy -= Math.sin(shooter.turretAngle || 0) * back;
    }
  }
  const bMuzzle = (shooter.barrel && shooter.barrel.muzzle) || 'none';
  // 2026-09-15 W6：autocannon 特效/弹体随 fxScale 缩小（默认 0.55）——更细炮管的视觉跟随
  const isAC = spec && spec.type === 'autocannon';
  const fxScale = (isAC && typeof spec.fxScale === 'number') ? spec.fxScale : 1;
  // #E13（2026-09-20）：双联火炮需要**更大的炮口火光与更大的音效**（用户裁定）——
  // 火光尺寸 ×1.7、爆闪粒子与音效强度同步放大（playSound 的第二参在音频层作为增益倍率）。
  const isDB = spec && spec.type === 'double_barrel';
  const dbFx = isDB ? 1.7 : 1;
  burst(ox, oy, 0.6 * fxScale * dbFx, Math.round(4 * dbFx), Math.round(2 * dbFx), 0);
  muzzle(ox, oy, spreadAngle || shooter.turretAngle, fxScale * dbFx, bMuzzle);
  play('fire', isDB ? { gain: 1.6 } : undefined);
  if (isDB && typeof c.spawnSmoke === 'function') c.spawnSmoke(ox, oy, 1.3);
  shooter.recoilT = 0.08;
  const shell = {
    x: ox, y: oy, fx: fx, fy: fy, dx: dx, dy: dy,
    speed: Math.max(200, shooter.stats.shellSpeed * (ammo.speed || 1) * speedMult + (ammo.speedAdd || 0)),
    pen: shooter.stats.penetration * (ammo.pen || 1) * penMult + (ammo.penAdd || 0),
    dmg: Math.max(0, shooter.stats.damage * (ammo.dmg || 1) * dmgMult + (ammo.dmgAdd || 0)),
    ammo: ammo, ammoKey: shooter.ammoKey, shooter: shooter, hitPref: hitPref,
    fxScale: fxScale,
    canBounce: true, bounced: false, dist: 0, dead: false
  };
  // #G（2026-09-21）：轨道炮「超高速贯穿」——击穿并命中目标后弹体不消失，伤害按 pierceDmgMul
  // 衰减继续飞行，可命中同一直线上的后续目标（pierce = 剩余可贯穿目标数，stepShells 消费）。
  // pierceHitIds 防止同一发对同一目标重复结算。
  if (spec && typeof spec.pierce === 'number' && spec.pierce > 0) {
    shell.pierceLeft = Math.floor(spec.pierce);
    shell.pierceDmgMul = (typeof spec.pierceDmgMul === 'number') ? spec.pierceDmgMul : 0.6;
    shell.pierceHitIds = [];
  }
  // 2026-09-15：主武器曲射机制已移除（howitzer 删除）——主炮一律平射直线弹道；
  // isArc 落点分支（stepShells）仅保留给曲射副武器弹（mortar，自带 totalDist/targetX）。
  shells.push(shell);
  return shell;
}

// 2026-09-15 W6：速射机炮热量机制（用户裁定，burst 连发路径随之删除）。
// 每发 +heatPerShot%（fireTank 累积）；每秒冷却 coolPerSec%（本函数逐帧驱动，player/AI/sim 均调用）；
// ≥heatMax 触发过热：heatLockT = overheatLock 秒内禁止开火（fireTank 门控），冷却继续。
// 状态字段：t.heatPct（0..heatMax）、t.heatLockT（秒）。updatePrimaryBarrels 同款逐帧驱动模式。
function updatePrimaryHeat(t, dt) {
  if (!t || t.hp <= 0) return false;
  const spec = primaryWeaponSpec(t);
  if (!spec || spec.type !== 'autocannon') return false;
  const cool = (typeof spec.coolPerSec === 'number') ? spec.coolPerSec : 15;
  if (t.heatLockT !== undefined && t.heatLockT > 0) t.heatLockT = Math.max(0, t.heatLockT - dt);
  if (t.heatPct !== undefined && t.heatPct > 0) t.heatPct = Math.max(0, t.heatPct - cool * dt);
  return true;
}

// #E13（2026-09-20）双管状态机重做（用户裁定）：
//   1) 装填时间是「单根炮管」的装填时间；两管按**顺序流水线**装填（同一时刻只有一根在装填）。
//      例：装填 5s，+0s 齐射两管 → +5s 第 1 管装好（此时可单发射击）→ +10s 第 2 管装好（可齐射）。
//   2) 默认（无卡）**进度互相干涉**：任意一管击发后，两管的装填进度都归 0，流水线从头开始。
//   3) 「交替装填系统」卡（spec.altReload=true）解除干涉：击发一管不影响另一管的进度
//      （例：+6s 发射时另一管仍是 +1s 进度），并附带更短的换管间隔。
//   4) 鼠标单击 = 发射一根已装填炮管；空格 = 齐射（两管都就绪才双发）。
// _dbState = { count, ready:[bool], loadT:[progress 秒], loader: idx|null, altReload: bool }
function ensureDbState(shooter, spec) {
  const count = (spec && typeof spec.count === 'number' && spec.count >= 1) ? spec.count : 2;
  const altReload = !!(spec && spec.altReload);
  if (!shooter._dbState || shooter._dbState.count !== count) {
    shooter._dbState = {
      count: count,
      ready: new Array(count).fill(true),
      loadT: new Array(count).fill(0),
      loader: null,
      altReload: altReload
    };
  }
  shooter._dbState.altReload = altReload;
  return shooter._dbState;
}

// 双管顺序流水线装填（主循环逐帧驱动，player 与 AI 实体都调用）。
// 返回 true 表示状态有效（调用方据此判断是否需要驱动）。
function updatePrimaryBarrels(t, dt) {
  if (!t || !t._dbState) return false;
  const st = t._dbState;
  const spec = primaryWeaponSpec(t);
  const reloadMult = (typeof spec.reloadMult === 'number') ? spec.reloadMult : 1.0;
  const debuffReload = (typeof debuffReloadRate === 'function') ? debuffReloadRate : function(){ return 1; };
  const perReload = Math.max(0.05, (t.stats && t.stats.reload ? t.stats.reload : 3) * reloadMult / debuffReload(t));
  // 顺序流水线：一次只装一根（升序取第一根未就绪且未完成的）
  let idx = st.loader;
  if (idx === null || idx === undefined || st.ready[idx]) {
    idx = null;
    for (let i = 0; i < st.count; i++) { if (!st.ready[i]) { idx = i; break; } }
    st.loader = idx;
  }
  if (idx === null) return true;
  st.loadT[idx] += dt;
  if (st.loadT[idx] >= perReload) {
    st.loadT[idx] = perReload;
    st.ready[idx] = true;
    st.loader = null;   // 下一帧自动切到下一根未就绪的管
  }
  return true;
}

// 双管击发：salvo=true 时齐射（**全部**炮管就绪才发射，2026-09-20 用户裁定 #F），
// 否则发射 1 根已装填管。返回 {fired, shells, reason?}。
// reason='salvo-not-ready'：空格齐射但仅部分（非全部）炮管就绪——不发射，调用方提请玩家等待。
// 命中炮管掩体的 solid 截停在 fireTank 主体已先行处理。
function fireDoubleBarrel(shooter, target, hitPref, ctx, spec, salvo) {
  const st = ensureDbState(shooter, spec);
  const readyIdx = [];
  for (let i = 0; i < st.count; i++) { if (st.ready[i]) readyIdx.push(i); }
  if (!readyIdx.length) return { fired: false, shells: 0, reason: 'none-ready' };
  // #F（2026-09-20 用户裁定）：空格齐射仅在两管都就绪时发射——只就绪 1 管时
  // 不发（避免「空格与单击无区别」），等另一管装填完毕。
  if (salvo && readyIdx.length < st.count) {
    return { fired: false, shells: 0, reason: 'salvo-not-ready' };
  }
  const switchSeconds = (typeof spec.switchSeconds === 'number') ? spec.switchSeconds : 0.5;
  const barrelOffset = (typeof spec.barrelOffset === 'number') ? spec.barrelOffset : 1.85;
  const barrelWid = (shooter.barrel && shooter.barrel.width) || 14;
  const off = barrelWid * barrelOffset * 0.5;

  // 齐射 = 全部炮管就绪后一发射出；单击 = 只发第一根就绪管
  const toFire = salvo ? readyIdx.slice(0, st.count) : [readyIdx[0]];

  let count = 0;
  for (let k = 0; k < toFire.length; k++) {
    const i = toFire[k];
    // 并排偏移：管 0 → 左（-off），管 1 → 右（+off）
    const lateral = (i === 0) ? -off : off;
    const shell = firePrimaryShell(shooter, target, hitPref, ctx, lateral);
    if (shell) {
      count++;
      st.ready[i] = false;
      st.loadT[i] = 0;
    }
  }
  if (count > 0) {
    // #E13：默认「进度互相干涉」——任一管击发后两管进度都归 0，流水线从 0 重新开始；
    // 持「交替装填系统」卡（altReload）时进度互不干涉，仅被击发的那一管清零。
    if (!st.altReload) {
      for (let i = 0; i < st.count; i++) st.loadT[i] = 0;
      st.loader = null;
    }
    shooter.reloadT = switchSeconds;   // 换管时间门控（下一发）
  }
  return { fired: count > 0, shells: count };
}

// #G（2026-09-21 用户需求）：弹夹炮状态机。
//   _clipState = { size: 弹夹容量, rounds: 弹夹内剩余, pendingRefill: 弹夹间装填中（装完回满） }
//   - 弹夹内发际间隔 = clipCycleSeconds（固定 0.7s，不受任何影响：不乘 reloadMult / debuff / 卡牌）；
//   - 弹夹间整组装填 = 标准装填 × (reloadMult + clipSizeReloadStep × (size − clipSizeBase))，
//     受 debuffReloadRate 影响（弹夹间属"装填"，吃装填 debuff；弹夹内不吃）。
// ensureClipState 在容量变化（扩容卡）或缺失时重建；换装卡牌同样清空（tank_cards.js install/upgrade）。
function ensureClipState(shooter, spec) {
  const size = Math.max(1, Math.round((spec && spec.clipSize) || 4));
  if (!shooter._clipState || shooter._clipState.size !== size) {
    shooter._clipState = { size: size, rounds: size, pendingRefill: false };
  }
  return shooter._clipState;
}

// 弹夹间整组装填时长（秒）
function clipMagReloadSeconds(shooter, spec, st) {
  const debuffReload = (typeof debuffReloadRate === 'function') ? debuffReloadRate : function(){ return 1; };
  const base = (shooter.stats && shooter.stats.reload) ? shooter.stats.reload : 3;
  const mult = (spec && typeof spec.reloadMult === 'number') ? spec.reloadMult : 3.0;
  const step = (spec && typeof spec.clipSizeReloadStep === 'number') ? spec.clipSizeReloadStep : 0.8;
  const sizeBase = (spec && typeof spec.clipSizeBase === 'number') ? spec.clipSizeBase : 4;
  const extra = Math.max(0, (st ? st.size : sizeBase) - sizeBase) * step;
  return Math.max(0.05, base * (mult + extra) / debuffReload(shooter));
}

// 弹夹炮逐帧驱动（主循环调用，player 与 AI 实体都调）：
// 弹夹间装填由 reloadT 倒计时（fireTank 顶部 reloadT>0 门控复用），倒计时归零即回满弹夹。
function updatePrimaryClip(t, dt) {
  if (!t || t.hp <= 0) return false;
  const spec = primaryWeaponSpec(t);
  if (!spec || spec.type !== 'clip') return false;
  const st = ensureClipState(t, spec);
  if (st.pendingRefill && !(t.reloadT > 0)) {
    st.pendingRefill = false;
    st.rounds = st.size;
  }
  return true;
}

// 弹夹炮击发：弹夹内逐发（clipCycleSeconds 门控）→ 打空后整组装填（弹夹间）。
// 返回 { fired, shells, reason? }；reason='clip-empty'：状态异常兜底（正常时 reloadT 门控先行拦截）。
function fireClipWeapon(shooter, target, hitPref, ctx, spec) {
  const st = ensureClipState(shooter, spec);
  if (st.rounds <= 0) return { fired: false, shells: 0, reason: 'clip-empty' };
  const shell = firePrimaryShell(shooter, target, hitPref, ctx);
  if (!shell) return false;
  st.rounds--;
  if (st.rounds > 0) {
    // 弹夹内发际间隔：固定 0.7s，不受任何影响
    shooter.reloadT = (typeof spec.clipCycleSeconds === 'number') ? spec.clipCycleSeconds : 0.7;
  } else {
    st.pendingRefill = true;
    shooter.reloadT = clipMagReloadSeconds(shooter, spec, st);
  }
  return { fired: true, shells: 1 };
}

function fireTank(shooter, target, hitPref, ctx, salvo){
  const c=_ctx(ctx);
  const shells=c.shells||_G('shells',null);
  if(!shells) return false;
  const R=_rules(c), T=_tiers(c);
  const find=c.findCoversOnPath||_G('findCoversOnPath',null);
  const gunRoot=c.gunRoot||_G('gunRoot',null);
  const gunTip=c.gunTip||_G('gunTip',null);
  const debuffReload=c.debuffReloadRate||_G('debuffReloadRate',function(){return 1;});
  const burst=c.burstExplosion||_G('burstExplosion',function(){});
  const muzzle=c.spawnMuzzleFlash||_G('spawnMuzzleFlash',function(){});
  const impact=c.spawnImpactFx||_G('spawnImpactFx',function(){});
  const play=c.playSound||_G('playSound',function(){});
  const push=c.pushLog||_G('pushLog',function(){});
  const dmgCover=c.damageCover||_G('damageCover',function(){return false;});
  const devAim=c.devAim!==undefined?c.devAim:_G('devAim',null);
  if(!shooter||!target) return false;
  // #95：履带断（immobT>0）不再阻止开火——车体机动瘫痪 ≠ 火炮缴械，仅装填门控保留
  if(shooter.reloadT>0) return false;
  // P-49 炮闩受损：短时完全无法开火（机械缴械，与装填 debuff 不同）
  if(shooter.debuffs && shooter.debuffs.breech > 0) return false;
  // 2026-09-15 W6：autocannon 过热锁定——heatLockT>0 期间禁止开火（其他武器无此字段，天然无影响）
  if(shooter.heatLockT !== undefined && shooter.heatLockT > 0) return false;
  if(!gunRoot||!gunTip||!find) return false;
  const rootP=gunRoot(shooter), tipP=gunTip(shooter);
  const barrelCovers=find(rootP.x,rootP.y,tipP.x,tipP.y);
  const solid=barrelCovers.find(function(v){ const m=T[v.cover.tier]&&T[v.cover.tier].mode; return m==='solid'||m==='single'; });
  if(solid){
    shooter.reloadT=shooter.stats.reload/debuffReload(shooter);
    const pt=solid.point, tier=T[solid.cover.tier]||{label:solid.cover.tier};
    burst(pt.x,pt.y,0.6,4,2,0);
    muzzle(tipP.x,tipP.y,shooter.turretAngle,1,(shooter.barrel&&shooter.barrel.muzzle)||'none');
    impact(pt.x,pt.y,shooter.turretAngle,'block',0.8);
    play('block');
    if(shooter.team==='player'){
      if(tier.mode==='single'){ dmgCover(solid.cover,1,'shell'); push('开火被掩体阻挡 — 炮管贯穿'+tier.label+'，炮弹在掩体处被截停','COVER'); }
      else push('开火被掩体阻挡 — 炮管贯穿'+tier.label,'COVER');
    }
    return false;
  }
  // 阶段七 7.3：装填倍率与连发登记（weapons.primary）
  const spec=primaryWeaponSpec(shooter);
  // 2026-09-15 W4/W6：double_barrel 走独立状态机（每管独立装填/单击 1 管/空格齐射/换管 0.5s）；
  // autocannon 已改逐发短间隔 + 热量机制（2026-09-15 W6），burst 连发路径整体删除。
  if(spec && spec.type === 'double_barrel'){
    const db = fireDoubleBarrel(shooter, target, hitPref, ctx, spec, salvo);
    // #F：空格齐射未就绪 → 首次出现时向玩家提示（按住空格期间不刷屏）
    if(db.reason === 'salvo-not-ready'){
      if(shooter._dbLastBlocked !== 'salvo-not-ready'){
        shooter._dbLastBlocked = 'salvo-not-ready';
        if(shooter.team === 'player') push('空格齐射需要两管装填完成 — 单击可先发 1 根就绪管','COVER');
      }
    } else {
      shooter._dbLastBlocked = null;
    }
    return db.fired;
  }
  // #G（2026-09-21）：弹夹炮——弹夹内逐发 0.7s / 打空整组装填（reloadMult + 0.8×扩容步进）
  if(spec && spec.type === 'clip'){
    const clipRes = fireClipWeapon(shooter, target, hitPref, ctx, spec);
    return !!(clipRes && clipRes.fired);
  }
  const reloadMult=(spec&&typeof spec.reloadMult==='number')?spec.reloadMult:1;
  shooter.reloadT=shooter.stats.reload*reloadMult/debuffReload(shooter);
  const shell=firePrimaryShell(shooter, target, hitPref, ctx);
  if(!shell) return false;
  // 2026-09-15 W6：autocannon 热量累积（用户裁定）——每发 +heatPerShot%，≥heatMax 过热
  // 并锁定 overheatLock 秒（fireTank 顶部门控）；冷却由 updatePrimaryHeat 逐帧驱动。
  // burst 连发路径已删除：射击间隔=装填时间×reloadMult(0.25)，逐发持续射击。
  if(spec && spec.type === 'autocannon'){
    const heatPer = (typeof spec.heatPerShot === 'number') ? spec.heatPerShot : 10;
    const heatMax = (typeof spec.heatMax === 'number') ? spec.heatMax : 100;
    const lock = (typeof spec.overheatLock === 'number') ? spec.overheatLock : 2.0;
    shooter.heatPct = Math.min(heatMax, (shooter.heatPct || 0) + heatPer);
    if(shooter.heatPct >= heatMax) shooter.heatLockT = lock;
  }
  return true;
}

// 2026-09-15 W2：fireSmokeShell/tryFireSmoke 已随烟幕弹移除（用户裁定）——F 键改为主/副武器切换。

function tryFire(ctx, salvo){
  const c=_ctx(ctx);
  const player=c.player||_G('player',null);
  const mouseWorld=c.mouseWorld||_G('mouseWorld',{x:0,y:0});
  const nearest=c.nearestEnemyTo||_G('nearestEnemyTo',function(){return null;});
  const gunTip=c.gunTip||_G('gunTip',null);
  const raycast=c.raycastTank||_G('raycastTank',null);
  const aimPref=c.aimPartPreference||_G('aimPartPreference',null);
  const R=_rules(c);
  const ft=c.fireTank||fireTank;
  if(!player||!gunTip||!raycast||!aimPref) return false;
  const target=nearest(player);
  if(!target) return false;
  const tipP=gunTip(player);
  const aimA=player.turretAngle, aimU=Math.cos(aimA), aimV=Math.sin(aimA);
  const aimHits=raycast(tipP.x,tipP.y,aimU,aimV,target);
  const hitPref=aimPref(tipP.x,tipP.y,aimU,aimV,mouseWorld.x,mouseWorld.y,aimHits,(R.aim&&R.aim.partProbe)||12);
  // 通过显式 ctx 调用，避免闭包隐式 shells 依赖（salvo=空格齐射请求，2026-09-15 W4）
  if(c.shells||_G('shells',null)) return ft(player,target,hitPref,c,salvo);
  return ft(player,target,hitPref,ctx,salvo);
}

// 2026-09-17 #C4e（用户裁定）：F 键语义反转——F = 直接击发副武器（按住连发），不再承担
// 主/副切换（activeWeaponSlot 概念随之移除）。分发拆为两路（共享层，Node 可测）：
//   tryFirePrimary(ctx, salvo)   → 主炮（左键/空格），委托 tryFire（保留 W4 单发/齐射语义）；
//   tryFireSecondary(ctx)        → 副武器（F 按住连发），经 fireActiveSecondary 向光标世界点击发；
//           目标=ctx.mouseWorld，缺省回退玩家炮塔前方 +100px。
// turret 型为设计例外（PLAN 6.2 多炮塔 Boss 行为基座，带独立炮塔角的**自瞄自主**副炮塔）：
// 装上即由 mvp 主循环逐帧 updateSecondaryWeapon 自主驱动，tryFireSecondary 对其恒返回 false
// （无「点击被主炮路径劫持」问题——主/副已按键位分流）。副武器缺省（none/未装）时
// tryFireSecondary 返回 false，由页面层提示（不再回落主炮——主炮有专属键位）。
function tryFirePrimary(ctx, salvo){
  const c=_ctx(ctx);
  const ft=c.tryFire||tryFire;
  return ft(c,salvo);
}

function tryFireSecondary(ctx){
  const c=_ctx(ctx);
  const player=c.player||_G('player',null);
  if(!player||!player.weapons) return false;
  const w=player.weapons.secondary;
  if(!w || !w.type || w.type==='none') return false;
  if(w.type==='turret') return false;   // 自瞄副炮塔不响应击发（自主运作，设计例外）
  // 惰性取值：Node 用 require('./tank_weapons.js')，浏览器用全局（tank_weapons.js 先于本模块加载，时序安全）
  let fas=c.fireActiveSecondary||_G('fireActiveSecondary',null);
  if(!fas && typeof require!=='undefined'){ try{ fas=require('./tank_weapons.js').fireActiveSecondary; }catch(e){ fas=null; } }
  if(!fas) return false;
  const mouse=c.mouseWorld||_G('mouseWorld',null);
  const aim=mouse||{x:player.x+Math.cos(player.turretAngle||0)*100,y:player.y+Math.sin(player.turretAngle||0)*100};
  return fas(player,c,aim);
}

// 预测面板纯计算（供 Node 单测与 HTML DOM 胶水共用）
function computeSolution(ctx){
  const c=_ctx(ctx);
  const player=c.player||_G('player',null);
  const nearest=c.nearestEnemyTo||_G('nearestEnemyTo',function(){return null;});
  const gunRoot=c.gunRoot||_G('gunRoot',null);
  const gunTip=c.gunTip||_G('gunTip',null);
  const raycast=c.raycastTank||_G('raycastTank',null);
  const aimPref=c.aimPartPreference||_G('aimPartPreference',null);
  const best=c.bestHitForPref||_G('bestHitForPref',null);
  const getZ=c.getPartZRange||_G('getPartZRange',null);
  const getExp=c.getExposure||_G('getExposure',null);
  const find=c.findCoversOnPath||_G('findCoversOnPath',null);
  const R=_rules(c), T=_tiers(c);
  if(!player||!gunRoot||!gunTip||!raycast) return {blocked:'no-player'};
  const target=nearest(player);
  const rp=gunRoot(player), gp=gunTip(player);
  const ox=gp.x, oy=gp.y, dx=Math.cos(player.turretAngle), dy=Math.sin(player.turretAngle);
  if(find){
    const bc=find(rp.x,rp.y,gp.x,gp.y);
    const solid=bc.find(function(v){ const m=T[v.cover.tier]&&T[v.cover.tier].mode; return m==='solid'||m==='single'; });
    if(solid) return {blocked:'barrel',tier:T[solid.cover.tier]||{label:solid.cover.tier},cover:solid.cover};
  }
  const hits=target?raycast(ox,oy,dx,dy,target):null;
  if(!hits) return {blocked:'no-target',target:target};
  const mouseWorld=c.mouseWorld||_G('mouseWorld',{x:ox+100,y:oy});
  const hitPref=aimPref?aimPref(ox,oy,dx,dy,mouseWorld.x,mouseWorld.y,hits,(R.aim&&R.aim.partProbe)||12):'auto';
  let hit=best?best(hits,0.001,Infinity,hitPref):null;
  if(!hit&&best) hit=best(hits,0.001,Infinity,'auto');
  if(!hit) return {blocked:'no-hit',hits:hits};
  const exposure=(getExp&&getZ)?getExp(rp.x,rp.y,hit.x,hit.y,player,target,getZ(target,hit.part).zMin,getZ(target,hit.part).zMax,hit.t):1;
  const coverInfo={prob:1-exposure,hits:find?find(rp.x,rp.y,hit.x,hit.y):[]};
  const bounce=(typeof BOUNCE_ANGLE!=='undefined'?BOUNCE_ANGLE:(R.ballistics?R.ballistics.bounceAngle:Math.PI*70/180));
  const ARMOR=_G('ARMOR',null);
  const moduleFromHit=c.moduleFromHit||_G('moduleFromHit',function(){return {label:''};});
  const faceLabel=c.faceLabel||_G('faceLabel',function(k){return k;});
  const superLabel=c.superstructureLabel||_G('superstructureLabel',function(){return '';});
  const armorTable=(target.stats&&target.stats.armor)||target.customArmor||ARMOR||{hull:{front:110,side:38,rear:26},turret:{front:140,side:50,rear:24}};
  const thickness=(armorTable[hit.part]&&armorTable[hit.part][hit.faceKey]!==undefined)?armorTable[hit.part][hit.faceKey]:100;
  const mod=moduleFromHit(target,hit);   // P-49：概率余量可为 null → 标签留空
  const modLabel=(mod&&mod.label)||'';
  const cosT=Math.abs(dx*hit.nx+dy*hit.ny), theta=Math.acos(Math.min(1,Math.max(-1,cosT)));
  const getAmmoCfg=c.computeAmmoConfig||_G('computeAmmoConfig',function(s,k){ return (R.ammoTypes&&(R.ammoTypes[k]||R.ammoTypes.ap))||{pen:1,noBounce:false}; });
  const ammoPred=getAmmoCfg(player,player.ammoKey);
  const predPen=player.stats.penetration*(ammoPred.pen||1)+(ammoPred.penAdd||0);   // #A13: add 为乘算后 mm 追加
  // 弹种链 2026-09-13：per-ammo 强制跳弹角（度→rad）回退全局基准
  const bounceAmmoDeg=(ammoPred&&typeof ammoPred.bounceAngle==='number')?ammoPred.bounceAngle:null;
  const bounceUse=(bounceAmmoDeg!==null)?bounceAmmoDeg*Math.PI/180:bounce;
  let willBounce=false;
  if(theta>bounceUse&&!ammoPred.noBounce) willBounce=true;
  const eff=thickness/Math.cos(theta);
  const canPen=!willBounce&&eff<=predPen;
  return {blocked:null,hitPref:hitPref,hit:hit,target:target,partLabel:(hit.part==='turret'?superLabel(target):'车体')+'·'+faceLabel(hit.faceKey)+'('+modLabel+')',theta:theta,thickness:thickness,eff:eff,willBounce:willBounce,canPen:canPen,predPen:predPen,coverInfo:coverInfo,ammoKey:player.ammoKey};
}

function updateSolution(ctx){
  const c=_ctx(ctx);
  const devOpen=c.devOpen!==undefined?c.devOpen:(_G('devOpen',undefined)!==undefined?_G('devOpen',true):true);
  if(devOpen===false) return null;
  const sol=computeSolution(c);
  const hasDoc=typeof document!=='undefined'&&document.getElementById;
  if(!hasDoc) return sol;
  const elPart=document.getElementById('solPart');
  if(!elPart) return sol;
  const elAngle=document.getElementById('solAngle'), elThick=document.getElementById('solThick'), elEff=document.getElementById('solEff'), elResult=document.getElementById('solResult'), elCover=document.getElementById('solCover');
  if(sol.blocked==='barrel'){
    const mark=(Number.isFinite(sol.cover.hp)&&sol.cover.hp>0)?' ⚡可击毁':'';
    elPart.textContent='--'; elAngle.textContent='--'; elThick.textContent='--'; elEff.textContent='--';
    elResult.textContent='炮身被掩体阻挡'; elResult.className='v bad';
    elCover.textContent='100% — '+sol.tier.label+'(炮身贯穿掩体·全挡'+mark+')';
    if(elCover.className!==undefined) elCover.className='v cover';
    return sol;
  }
  if(sol.blocked==='no-target'||sol.blocked==='no-hit'||sol.blocked==='no-player'){
    elPart.textContent='--'; elAngle.textContent='--'; elThick.textContent='--'; elEff.textContent='--';
    elResult.textContent='未瞄准目标'; elResult.className='v';
    elCover.textContent='--'; if(elCover.className!==undefined) elCover.className='v';
    return sol;
  }
  if(sol.blocked) return sol;
  elPart.textContent=sol.partLabel;
  elAngle.textContent=(sol.theta*180/Math.PI).toFixed(1)+'°';
  elThick.textContent=sol.thickness+' mm';
  const T=_tiers(c);
  if(sol.coverInfo.prob>0){
    const detail=sol.coverInfo.hits.map(function(h){
      const t=T[h.cover.tier]||{label:h.cover.tier,mode:'solid'};
      const kind=(t.mode==='pass'||t.mode==='none')?'穿透':(t.mode==='solid'||t.mode==='single')?'全挡':'部分遮挡';
      const mark=(Number.isFinite(h.cover.hp)&&h.cover.hp>0)?' ⚡可击毁':'';
      return t.label+'(己方'+h.distA.toFixed(0)+'px/靶'+h.distB.toFixed(0)+'px·'+kind+mark+')';
    }).join(' × ');
    elCover.textContent=(sol.coverInfo.prob*100).toFixed(0)+'% — '+detail;
    if(elCover.className!==undefined) elCover.className='v cover';
  } else { elCover.textContent='无遮挡'; if(elCover.className!==undefined) elCover.className='v'; }
  if(sol.willBounce){ elEff.textContent='—'; elResult.textContent='必定跳弹(弹离后可能二次命中)'; elResult.className='v bounce'; }
  else { elEff.textContent=sol.eff.toFixed(0)+' mm'; if(!sol.canPen){ elResult.textContent='无法击穿'; elResult.className='v bad'; } else { elResult.textContent='可以击穿'; elResult.className='v ok'; } }
  return sol;
}

// shells 飞行积分的物理/判定部分（半高越掩/护盾吸收守卫/HE破障/烟幕/二次跳弹禁止）
function stepShells(dt, ctx){
  const c=_ctx(ctx);
  const shells=c.shells||_G('shells',null);
  if(!shells||!Array.isArray(shells)) return;
  const impacts=c.impacts||_G('impacts',null), bounceFx=c.bounceFx||_G('bounceFx',null);
  const ents=c.entities||_G('entities',[]);
  const find=c.findCoversOnPath||_G('findCoversOnPath',null);
  const T=_tiers(c), R=_rules(c);
  const raycast=c.raycastTank||_G('raycastTank',null);
  const shellPartHit=c.shellPartHit||_G('shellPartHit',null);
  const getZ=c.getPartZRange||_G('getPartZRange',null);
  const getExp=c.getExposure||_G('getExposure',null);
  const isHostile=c.isHostile||_G('isHostile',function(){return true;});
  // #J3（2026-09-30）：原 #E1 的 hiddenByVision 命中剔除钩子已随视野距离系统整体退役删除
  // —— 视野系统退役后不存在「看得见却打不中」的剔除源，保留该死钩子只会误导（不留死开关）。
  const coverNormalAt=c.coverNormalAt||_G('coverNormalAt',null);
  const reflect=c.reflectDir||_G('reflectDir',null);
  const resolveHit=c.resolveHit||_G('resolveHit',null);
  const hasShield=c.hasShield||_G('hasShield',function(){return false;});
  const shieldAbsorbs=c.shieldAbsorbs||_G('shieldAbsorbs',function(){return false;});
  const absorbDamage=c.absorbDamage||_G('absorbDamage',function(t,d){return d;});
  const player=c.player||_G('player',null);
  const burst=c.burstExplosion||_G('burstExplosion',function(){});
  const impactFx=c.spawnImpactFx||_G('spawnImpactFx',function(){});
  const dmgText=c.spawnDmgText||_G('spawnDmgText',function(){});
  const play=c.playSound||_G('playSound',function(){});
  const push=c.pushLog||_G('pushLog',function(){});
  const dmgCover=c.damageCover||_G('damageCover',function(){return false;});
  const splashCovers=c.splashCoversAt||_G('splashCoversAt',function(){});
  const spawnSmoke=c.spawnSmoke||_G('spawnSmoke',function(){});
  const spawnSmokeCloud=c.spawnSmokeCloud||_G('spawnSmokeCloud',function(){});
  const spawnTracer=c.spawnTracer||_G('spawnTracer',function(){});
  const applySplash=c.applySplashAt||_G('applySplashAt',null);
  const bounceAngle=c.bounceAngle!==undefined?c.bounceAngle:(_G('BOUNCE_ANGLE',R.ballistics?R.ballistics.bounceAngle:Math.PI*70/180));
  const worldW=c.worldW!==undefined?c.worldW:(c.worldWidth!==undefined?c.worldWidth:(_G('canvas',null)?_G('canvas',null).width:2000));
  const worldH=c.worldH!==undefined?c.worldH:(c.worldHeight!==undefined?c.worldHeight:(_G('canvas',null)?_G('canvas',null).height:2000));
  const rnd=c.random||Math.random;
  shells.forEach(function(s){
    if(s.dead) return;
    if(s.guided){
      // #E5（2026-09-20）制导：
      //   锁定式（mode:'lock'）：追尾 + 比例引导（PN）——横向修正量 ∝ 视线角速度，
      //     目标机动时提前量更足，比纯追尾更贴实战（纯追尾在横向移动目标前会绕圈）。
      //   线导式（mode:'wire'）：飞行方向由**鼠标**持续引导（_secondaryTargetPos 每帧更新）
      //     → 等效「视线角速度 = 0 的比例引导」：导弹始终朝操作者指定的方位收敛。
      let targetA = 0;
      let losRate = 0;
      if(s.mode === 'wire' && s.shooter && s.shooter._secondaryTargetPos){
        targetA = Math.atan2(s.shooter._secondaryTargetPos.y - s.y, s.shooter._secondaryTargetPos.x - s.x);
      } else if(s.target && s.target.hp > 0){
        targetA = Math.atan2(s.target.y - s.y, s.target.x - s.x);
        // 视线角速度（LOS rate）：本帧视线角与上一帧之差 / dt（PN 的输入项）
        if(Number.isFinite(s._lastLosA)){
          let d = targetA - s._lastLosA;
          while(d > Math.PI) d -= 2 * Math.PI;
          while(d < -Math.PI) d += 2 * Math.PI;
          losRate = d / Math.max(1e-3, dt);
        }
        s._lastLosA = targetA;
      } else {
        targetA = Math.atan2(s.dy, s.dx);
      }
      const curA = Math.atan2(s.dy, s.dx);
      let diff = targetA - curA;
      while(diff > Math.PI) diff -= 2 * Math.PI;
      while(diff < -Math.PI) diff += 2 * Math.PI;
      const R = _rules(c);
      const mcfg = (R.missiles && R.missiles[s.mode === 'wire' ? 'wire' : 'lock']) || {};
      const turnRate = (typeof mcfg.turnRate === 'number') ? mcfg.turnRate
                     : (typeof s.turnRate === 'number' ? s.turnRate : 3.5);
      // 比例引导系数 N（1~5，典型 3~4）；横向修正项按 N × 视线角速度 × 弹速 归一
      const N = (typeof mcfg.navConstant === 'number') ? mcfg.navConstant : 3.0;
      const pnTerm = (s.mode === 'wire') ? 0 : N * losRate * Math.max(1e-3, dt);
      const turnStep = turnRate * dt;
      const cmd = diff + pnTerm;
      const nextA = curA + Math.max(-turnStep, Math.min(turnStep, cmd));
      s.dx = Math.cos(nextA);
      s.dy = Math.sin(nextA);
    }
    const step=s.speed*dt, sx=s.x, sy=s.y, nx=sx+s.dx*step, ny=sy+s.dy*step;
    if(spawnTracer) spawnTracer(sx, sy, nx, ny, (s.ammo&&s.ammo.tracer)||'#ffd24a');

    if(s.isArc){
      if(!(s.totalDist > 0)){
        let tDist = s.range || (s.ammo && s.ammo.range) || 400;
        if(s.targetX !== undefined && s.targetY !== undefined){
          tDist = Math.hypot(s.targetX - s.fx, s.targetY - s.fy);
        }
        s.totalDist = tDist;
        s.targetX = s.fx + s.dx * s.totalDist;
        s.targetY = s.fy + s.dy * s.totalDist;
      }
      s.dist += step;
      s.x = s.fx + s.dx * s.dist;
      s.y = s.fy + s.dy * s.dist;
      if(s.dist >= s.totalDist){
        s.x = s.targetX; s.y = s.targetY;
        const sc = s.splashRadius || 90;
        if(impacts) impacts.push({x:s.x, y:s.y, life:0.4, color:'#ffb454'});
        burst(s.x, s.y, sc/40, Math.round(22*sc/40), Math.round(14*sc/40), Math.round(11*sc/40));
        impactFx(s.x, s.y, Math.atan2(s.dy, s.dx), 'he', 1);
        play('pen');
        dmgText(s.x, s.y - 14, '轰击', 'he');
        if(applySplash) applySplash(s.x, s.y, sc, s.dmg, null, s, ents);
        if(splashCovers) splashCovers(s.x, s.y, sc);
        s.dead = true;
      }
      return;
    }
    let bestDist=Infinity, bestTank=null, bestHit=null, bestCover=null;
    for(const e of ents){
      if(!e||e.hp<=0) continue;
      if(!isHostile(s.shooter.team,e.team)) continue;
      // #G：轨道炮贯穿——已命中的目标不再重复结算（防同发多杀同一目标）
      if(s.pierceHitIds && s.pierceHitIds.indexOf(e.id) >= 0) continue;
      const hits=raycast?raycast(sx,sy,s.dx,s.dy,e):null;
      const bh=shellPartHit&&hits?shellPartHit(hits,step,s.hitPref):null;
      if(bh&&bh.t<bestDist){ bestDist=bh.t; bestTank=e; bestHit=bh; bestCover=null; }
    }
    // 曲射弹药（武器层 ignoreCover: true，如 mortar 载荷；2026-09-14 HEC 弹种移除）越障直飞——
    // 掩体不参与拦截/曝光判定，弹体沿直线直奔目标，仅在命中坦克时结算（炮管贯穿的 barrel solid
    // 判定在 fireTank 发射阶段已处理，不在此处；开火时无遮挡即正常发射）。
    const ignoreCover = !!(s.ammo && s.ammo.ignoreCover);
    const covs=find&&!ignoreCover?find(sx,sy,nx,ny):[];
    for(const cov of covs){
      const tier=T[cov.cover.tier]||{mode:'solid'};
      if(s.dead) break;
      if(tier.mode==='pass'&&cov.distA<=step&&cov.distA<bestDist){
        if(dmgCover(cov.cover,1,'shell')){ if(impacts) impacts.push({x:cov.point.x,y:cov.point.y,life:0.4,color:'#96764a'}); impactFx(cov.point.x,cov.point.y,Math.atan2(s.dy,s.dx),'block',0.7); play('block'); }
        continue;
      }
      // #E1：确定性拦截唯一入口——solid/single 掩体在入口点截停（'graduated' 分支已删除）。
      if((tier.mode==='solid'||tier.mode==='single')&&cov.distA<=step&&cov.distA<bestDist){ bestDist=cov.distA; bestCover=cov; bestTank=null; bestHit=null; s._blockedByDeployable=null; }
    }
    // #E4（2026-09-20）便携式掩体「单向透明」：部署方阵营的炮弹可穿过（不拦截），
    // 对立方炮弹按确定性实体拦截（在掩体入口点截停）。视觉朝向指示见 mvp 绘制层。
    // 判定用部署物实例几何（hullLen×hullWid OBB）与弹道线段求交。
    const depCovers = (c.deployables || _G('deployables', null));
    if(!ignoreCover && Array.isArray(depCovers) && depCovers.length){
      for(const dc of depCovers){
        if(!dc || !dc.isDeployableCover || dc._dead || dc.hp <= 0) continue;
        if(dc.team === s.shooter.team) continue;         // 己方阵营：单向透明，炮弹穿过
        const seg = _deployablePathHit(dc, sx, sy, nx, ny);
        if(seg !== null && seg <= step && seg < bestDist){ bestDist = seg; bestCover = null; bestTank = null; bestHit = null; s._blockedByDeployable = dc; }
      }
    }
    if(s.dead){ /* 已在掩体入口被截停 */ }
    else if(bestCover){
      s.x=bestCover.point.x; s.y=bestCover.point.y;
      const tier=T[bestCover.cover.tier]||{label:bestCover.cover.tier,mode:bestCover.cover.tier};
      if(tier.mode==='single'){
        const n=coverNormalAt?coverNormalAt(bestCover.cover,s.x,s.y):null;
        const cosT=n?Math.abs(s.dx*n.nx+s.dy*n.ny):0;
        if(s.canBounce&&Math.acos(Math.min(1,Math.max(-1,cosT)))>bounceAngle){
          const r=reflect?reflect(s.dx,s.dy,n.nx,n.ny):{x:-s.dx,y:-s.dy};
          s.dx=r.x; s.dy=r.y; s.bounced=true; s.canBounce=false; s.fx=s.x; s.fy=s.y;
          if(bounceFx) bounceFx.push({x:s.x,y:s.y,life:0.5,angle:Math.atan2(r.y,r.x)});
          impactFx(s.x,s.y,Math.atan2(r.y,r.x),'bounce',0.8); play('bounce'); push('跳弹！炮弹在'+tier.label+'表面掠射弹开 — 路障无损','BOUNCE');
        } else { if(impacts) impacts.push({x:s.x,y:s.y,life:0.4,color:'#ffb454'}); impactFx(s.x,s.y,Math.atan2(s.dx,s.dy),'block',0.8); play('block'); dmgCover(bestCover.cover,1,'shell'); s.dead=true; }
      } else { if(impacts) impacts.push({x:s.x,y:s.y,life:0.4,color:'#ffb454'}); impactFx(s.x,s.y,Math.atan2(s.dx,s.dy),'block',0.8); play('block'); if(Number.isFinite(bestCover.cover.hp)){ if(!dmgCover(bestCover.cover,1,'shell')) push('被'+tier.label+'挡住 — 掩体受损（剩余耐久 '+bestCover.cover.hp+'）','COVER'); } else push('被'+tier.label+'挡住 — 炮弹被掩体截停','COVER'); s.dead=true; }
    } else if(s._blockedByDeployable){
      // #E4：敌方炮弹被部署掩体挡下（单向透明：部署方可穿过，对立方被挡）
      const dc = s._blockedByDeployable;
      s.dead = true;
      if(impacts) impacts.push({ x: s.x, y: s.y, life: 0.4, color: '#7ed957' });
      impactFx(s.x, s.y, Math.atan2(s.dy, s.dx), 'block', 0.8);
      play('block');
      push('被战术掩体挡下（单向透明：我方炮弹可穿过）', 'COVER');
      if(Number.isFinite(dc.hp)){ dc.hp = Math.max(0, dc.hp - 1); if(dc.hp <= 0) dc._dead = true; }
    } else if(bestTank){
      const hitT=bestHit, hitTank=bestTank, hx=hitT.x, hy=hitT.y;
      // #E1：曝光/概率拦截链整体删除——命中坦克即结算（掩体拦截只发生在 bestCover 分支）。
      s.x=hx; s.y=hy;
      {
        let shieldBlocked=false;
        if(hitTank===player&&hasShield(player)&&shieldAbsorbs(player,s)){
          const bleed=absorbDamage(player,s.dmg);
          if(bleed<=0){ impactFx(hx,hy,Math.atan2(s.dy,s.dx),'block',0.9); play('block'); s.dead=true; s.absorbed=true; shieldBlocked=true; }
          else s.dmg=bleed;
          if(!hasShield(player)){ burst(player.x,player.y,0.5,6,4,6); impactFx(player.x,player.y,player.turretAngle,'block',1); play('block'); push('护盾破裂 — 吸收池耗尽','CRIT'); }
        }
        if(!shieldBlocked){
          const hpBefore=hitTank.hp;   // #A6：飘字溢出截断基准（击杀前剩余血量）
          const res=resolveHit?resolveHit(s,hitTank,hitT,s.canBounce):{outcome:'PEN',dmg:0,splash:null,text:'',cls:'PEN',bouncePoint:{x:hx,y:hy},bounceAngle:0};
          if(res.outcome==='BOUNCE'){ s.fx=res.bouncePoint.x; s.fy=res.bouncePoint.y; if(bounceFx) bounceFx.push({x:res.bouncePoint.x,y:res.bouncePoint.y,life:0.5,angle:res.bounceAngle}); impactFx(res.bouncePoint.x,res.bouncePoint.y,res.bounceAngle,'bounce',1); dmgText(res.bouncePoint.x,res.bouncePoint.y-10,'跳弹','bounce'); push(res.text,res.cls); play('bounce'); }
          else { const isHe=s.ammoKey==='he', o=res.outcome==='PEN'?(isHe?'he':'pen'):'block'; if(impacts) impacts.push({x:hx,y:hy,life:0.4,color:isHe?'#ffb454':(res.outcome==='PEN'?'#ff6c5c':'#7a8065')}); impactFx(hx,hy,Math.atan2(s.dy,s.dx),o,1); if(res.splash){ const sc=res.splash.radius/40; burst(hx,hy,sc,Math.round(22*sc),Math.round(14*sc),Math.round(11*sc)); }
            if(res.outcome==='PEN'){
              // #A6 飘字：溢出截断（≤击杀前剩余血量）+ 部位颜色分类（弹药架红/成员与其他模块黄/普通白）
              const shown=Math.min(res.dmg||0, Math.ceil(hpBefore));
              const kind = res.modKey==='ammo' ? 'ammoRack' : (res.modKey ? 'module' : (isHe?'he':'plain'));
              dmgText(hx,hy-14,shown,kind);
            }
            else if(res.dmg>0) dmgText(hx,hy-14,Math.min(res.dmg,Math.ceil(hpBefore)),'he');
            else dmgText(hx,hy-14,'未击穿','block');
            push(res.text,res.cls); play(isHe?'pen':o);
            // #G（2026-09-21）：轨道炮「超高速贯穿」——击穿（PEN）后弹体不消失：伤害按
            // pierceDmgMul 衰减、记录已命中目标、从命中点继续直线飞行（pierceLeft 归零或
            // 未击穿/跳弹时仍按旧口径销毁）。物理语义：超高速动能弹穿透轻掩体/薄甲后仍具杀伤。
            if(s.pierceLeft > 0 && res.outcome === 'PEN'){
              s.pierceLeft--;
              s.dmg = s.dmg * s.pierceDmgMul;
              s.pierceHitIds.push(hitTank.id);
              s.fx = hx; s.fy = hy;
              s.dist += step;
            } else {
              s.dead = true;
            }
          }
        }
      }
    } else if(!bestTank && !bestCover && s.ammo && s.ammo.proximity && R.proximityFuze && R.proximityFuze.enabled){
      // 弹种链 2026-09-13：近炸空爆引信（proximity_he）
      // 基准（用户裁定）：炮弹飞行路线不命中目标时，计算与最近敌目标的「接近率」
      // （径向相对速度 = (目标速度 − 弹速)·单位径向向量；简化：弹直线飞行，目标径向
      // 距离变化率 dot = −(弹速) + 目标速度径向分量。dot>0 = 距离开始拉大 = 接近率变负）。
      // dot>0 且已进入引信激活距离内 → 立即空爆：在弹当前位置按 splashRadius 溅射。
      // #A27（2026-09-15 修复）：近炸分支未爆帧也必须按步进推进弹体位置/距离——
      // 之前只在空爆时写 s.x=nx（炮弹悬停原地不飞行、dist 不增长、射程/出界判定失效）。
      s.x=nx; s.y=ny; s.dist+=step;
      const maxD=(R.ballistics&&R.ballistics.shellMaxDist)||1800;
      if(s.dist>=maxD) s.dead=true;
      else if(nx<-60||nx>worldW+60||ny<-60||ny>worldH+60) s.dead=true;
      const fuze=R.proximityFuze;
      const maxT=fuze&&fuze.maxTravel!==undefined?fuze.maxTravel:1400;
      if(!s.dead && s.dist<maxT){
        let nearE=null, nearD=Infinity;
        for(const e of ents){
          if(!e||e.hp<=0) continue;
          if(!isHostile(s.shooter.team,e.team)) continue;
          const d=Math.hypot(e.x-s.x,e.y-s.y);
          if(d<nearD){ nearD=d; nearE=e; }
        }
        if(nearE){
          const minD=fuze&&fuze.minDist!==undefined?fuze.minDist:40;
          // 接近率：目标相对弹的径向距离变化率（>0 → 正在接近；≤0 → 开始远离 → 接近率变负 → 爆）
          const relVx=(nearE.vx||0)-s.dx*s.speed, relVy=(nearE.vy||0)-s.dy*s.speed;
          const rx=(nearE.x-s.x)/Math.max(1,nearD), ry=(nearE.y-s.y)/Math.max(1,nearD);
          const closingRate=-(relVx*rx+relVy*ry);   // >0 = 接近中；≤0 = 开始远离
          if(nearD>minD && closingRate<=0 && s._fuzeArmed){
            // 空爆：applySplashAt 对溅射半径内实体施加衰减伤害（无敌/已毁免疫；exclude=null 全体结算）
            const sc=(s.ammo&&s.ammo.splashRadius)||90;
            if(impacts) impacts.push({x:s.x,y:s.y,life:0.4,color:'#ffd0b0'});
            burst(s.x,s.y,sc/40,Math.round(22*sc/40),Math.round(14*sc/40),Math.round(11*sc/40));
            impactFx(s.x,s.y,Math.atan2(s.dy,s.dx),'he',1);
            play('pen');
            let dealt=0;
            if(typeof applySplash==='function'){
              const hits=applySplash(s.x,s.y,sc,s.dmg,null,s,ents);   // 2026-09-15：弹出坦克实际受到伤害，替代“空爆”字样
              if(Array.isArray(hits)){
                const near=hits.find(function(h){return h.entity===nearE;});
                const chosen = (near && near.dmg>0) ? near : hits.reduce(function(a,b){return b.dmg>a.dmg?b:a;});
                if(chosen) dealt=chosen.dmg;
              }
            }
            if(dealt>0) dmgText(s.x,s.y-14,Math.round(dealt),'he');
            if(s.shooter.team==='player') push('近炸引信触发 — 空爆溅射','HE');
            s.dead=true;
          } else if(closingRate>0 && nearD<=(fuze&&fuze.armRadius!==undefined?fuze.armRadius:120)){ s._fuzeArmed=true; }   // 进入引信武装半径（RULES.proximityFuze.armRadius，缺省 120）内且正在接近 → 武装
        }
      }
    } else { s.x=nx; s.y=ny; s.dist+=step; const maxD=(R.ballistics&&R.ballistics.shellMaxDist)||1800; if(s.dist>=maxD) s.dead=true; else if(nx<-60||nx>worldW+60||ny<-60||ny>worldH+60) s.dead=true; }
  });
  const breachR=(R.breach&&R.breach.heSplashRadius)||24;
  // 弹种链：HE 家族（he/hesh/proximity_he/blast_he）销毁瞬间均破障溅射
  const heFamily=function(k){ const a=k&&R.ammoTypes&&R.ammoTypes[k]; return !!(a&&(a.splashRadius>0||a.nonPenRatio>0)); };
  shells.forEach(function(s){ if(s.dead&&!s.absorbed&&heFamily(s.ammoKey)) splashCovers(s.x,s.y,breachR); });
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={fireTank:fireTank,tryFire:tryFire,tryFirePrimary:tryFirePrimary,tryFireSecondary:tryFireSecondary,computeSolution:computeSolution,updateSolution:updateSolution,stepShells:stepShells,primaryWeaponSpec:primaryWeaponSpec,firePrimaryShell:firePrimaryShell,updatePrimaryHeat:updatePrimaryHeat,fireDoubleBarrel:fireDoubleBarrel,updatePrimaryBarrels:updatePrimaryBarrels,ensureClipState:ensureClipState,updatePrimaryClip:updatePrimaryClip,fireClipWeapon:fireClipWeapon,clipMagReloadSeconds:clipMagReloadSeconds};
}
