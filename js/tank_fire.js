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

// 半高掩体垂直剖面判决：沿整条弹道（fx,fy→前方）解析会命中的目标部位
function shellVerticalDecision(s, ctx){
  const c=_ctx(ctx);
  const ents=c.entities||_G('entities',[]);
  const isHostile=c.isHostile||_G('isHostile',function(){return true;});
  const raycast=c.raycastTank||_G('raycastTank',null);
  const best=c.bestHitForPref||_G('bestHitForPref',null);
  const getZ=c.getPartZRange||_G('getPartZRange',null);
  const getExp=c.getExposure||_G('getExposure',null);
  if(!raycast||!best||!getZ||!getExp) return null;
  let dec=null;
  for(const e of ents){
    if(!e||e.hp<=0) continue;
    if(!isHostile(s.shooter.team,e.team)) continue;
    const hits=raycast(s.fx,s.fy,s.dx,s.dy,e);
    if(!hits) continue;
    const bh=best(hits,0.001,Infinity,s.hitPref);
    if(!bh) continue;
    const hx=s.fx+s.dx*bh.t, hy=s.fy+s.dy*bh.t;
    const z=getZ(e,bh.part);
    const exposure=getExp(s.fx,s.fy,hx,hy,s.shooter,e,z.zMin,z.zMax,bh.t);
    if(!dec||bh.t<dec.hit.t) dec={tank:e,hit:bh,z:z,exposure:exposure,t:bh.t};
  }
  return dec;
}

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
  burst(ox, oy, 0.6 * fxScale, 4, 2, 0);
  muzzle(ox, oy, spreadAngle || shooter.turretAngle, fxScale, bMuzzle);
  play('fire');
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

// 2026-09-15 W4：双管状态机（炮盾并排 2 炮管，每管独立装填）。
// _dbState = { ready: [bool, bool], reloadT: [s, s] }——ready 由 updatePrimaryBarrels 逐帧维护。
// 装填时间 ×reloadMult（默认 ×1.0）应用于**单根炮管**；单击发射 1 根已装填管；空格齐射（两管就绪才可）。
// 换管时间 switchSeconds（默认 0.5s）：任一击发后 shooter.reloadT 置为该值，作为下一发的全局门控。
function ensureDbState(shooter, spec) {
  const count = (spec && typeof spec.count === 'number' && spec.count >= 1) ? spec.count : 2;
  if (!shooter._dbState || shooter._dbState.count !== count) {
    shooter._dbState = { count: count, ready: new Array(count).fill(true), reloadT: new Array(count).fill(0) };
  }
  return shooter._dbState;
}

// 双管每管独立装填计时（主循环逐帧驱动，player 与 AI 实体都调用）
function updatePrimaryBarrels(t, dt) {
  if (!t || !t._dbState) return false;
  const st = t._dbState;
  for (let i = 0; i < st.count; i++) {
    if (!st.ready[i] && st.reloadT[i] > 0) {
      st.reloadT[i] -= dt;
      if (st.reloadT[i] <= 0) { st.reloadT[i] = 0; st.ready[i] = true; }
    }
  }
  return true;
}

// 双管击发：salvo=true 时齐射全部就绪管（≥2 根），否则发射 1 根已装填管。
// 返回 {fired, shells}。命中炮管掩体的 solid 截停在 fireTank 主体已先行处理。
function fireDoubleBarrel(shooter, target, hitPref, ctx, spec, salvo) {
  const st = ensureDbState(shooter, spec);
  const readyIdx = [];
  for (let i = 0; i < st.count; i++) { if (st.ready[i]) readyIdx.push(i); }
  if (!readyIdx.length) return { fired: false, shells: 0 };
  const reloadMult = (typeof spec.reloadMult === 'number') ? spec.reloadMult : 1.0;
  const switchSeconds = (typeof spec.switchSeconds === 'number') ? spec.switchSeconds : 0.5;
  const barrelOffset = (typeof spec.barrelOffset === 'number') ? spec.barrelOffset : 0.9;
  const barrelWid = (shooter.barrel && shooter.barrel.width) || 14;
  const off = barrelWid * barrelOffset * 0.5;
  const debuffReload = (ctx && ctx.debuffReloadRate) || (typeof globalThis !== 'undefined' && globalThis.debuffReloadRate) || function(){ return 1; };
  const perReload = shooter.stats.reload * reloadMult / debuffReload(shooter);

  let toFire;
  if (salvo) {
    toFire = readyIdx.slice(0, 2);   // 齐射 = 发射全部就绪管（1 根或 2 根）
  } else {
    toFire = [readyIdx[0]];
  }

  let count = 0;
  for (let k = 0; k < toFire.length; k++) {
    const i = toFire[k];
    // 并排偏移：管 0 → 左（-off），管 1 → 右（+off）
    const lateral = (i === 0) ? -off : off;
    const shell = firePrimaryShell(shooter, target, hitPref, ctx, lateral);
    if (shell) {
      count++;
      st.ready[i] = false;
      st.reloadT[i] = perReload;
    }
  }
  if (count > 0) shooter.reloadT = switchSeconds;   // 换管时间门控（下一发）
  return { fired: count > 0, shells: count };
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
    return db.fired;
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
      let targetA = 0;
      if(s.mode === 'wire' && s.shooter && s.shooter._secondaryTargetPos){
        targetA = Math.atan2(s.shooter._secondaryTargetPos.y - s.y, s.shooter._secondaryTargetPos.x - s.x);
      } else if(s.target && s.target.hp > 0){
        targetA = Math.atan2(s.target.y - s.y, s.target.x - s.x);
      } else {
        targetA = Math.atan2(s.dy, s.dx);
      }
      const curA = Math.atan2(s.dy, s.dx);
      let diff = targetA - curA;
      while(diff > Math.PI) diff -= 2 * Math.PI;
      while(diff < -Math.PI) diff += 2 * Math.PI;
      const turnStep = 3.5 * dt;
      const nextA = curA + Math.max(-turnStep, Math.min(turnStep, diff));
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
      if((tier.mode==='solid'||tier.mode==='single')&&cov.distA<=step&&cov.distA<bestDist){ bestDist=cov.distA; bestCover=cov; bestTank=null; bestHit=null; }
      if(tier.mode==='graduated'&&cov.distA<=step&&cov.distA<bestDist){
        // #36：s.dec 曝光判定按掩体实例判重——首个半高掩体算出的 dec 不得套用到后续
        // 不同掩体；_decCoverId 记录缓存归属的 cover 引用，命中不同 cover 时重算。
        // 同一 cover 跨帧维持缓存（原语义：dec 只在跳弹时经 s.dec=null 复位，见下两处）。
        if(!s.dec || s._decCoverId !== cov.cover){
          const dec=shellVerticalDecision(s,c);
          if(dec){ s.dec=dec; s._decCoverId=cov.cover; }
        }
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
          s.dx=r.x; s.dy=r.y; s.bounced=true; s.canBounce=false; s.fx=s.x; s.fy=s.y; s.dec=null; s._decCoverId=null;
          if(bounceFx) bounceFx.push({x:s.x,y:s.y,life:0.5,angle:Math.atan2(r.y,r.x)});
          impactFx(s.x,s.y,Math.atan2(r.y,r.x),'bounce',0.8); play('bounce'); push('跳弹！炮弹在'+tier.label+'表面掠射弹开 — 路障无损','BOUNCE');
        } else { if(impacts) impacts.push({x:s.x,y:s.y,life:0.4,color:'#ffb454'}); impactFx(s.x,s.y,Math.atan2(s.dx,s.dy),'block',0.8); play('block'); dmgCover(bestCover.cover,1,'shell'); s.dead=true; }
      } else { if(impacts) impacts.push({x:s.x,y:s.y,life:0.4,color:'#ffb454'}); impactFx(s.x,s.y,Math.atan2(s.dx,s.dy),'block',0.8); play('block'); if(Number.isFinite(bestCover.cover.hp)){ if(!dmgCover(bestCover.cover,1,'shell')) push('被'+tier.label+'挡住 — 掩体受损（剩余耐久 '+bestCover.cover.hp+'）','COVER'); } else push('被'+tier.label+'挡住 — 炮弹被掩体截停','COVER'); s.dead=true; }
    } else if(bestTank||s.dec){
      const hitT=s.dec?s.dec.hit:bestHit, hitTank=s.dec?s.dec.tank:bestTank, hitDist=s.dec?s.dec.t:bestDist, hx=hitT.x, hy=hitT.y;
      // #A8：graduated 掩体入口当帧缓存的 s.dec.t 是全弹道距离（自炮根起算）——
      // 剩余飞行距离未到预测命中点时不得瞬移结算，继续按正常飞行积分；本帧若已有
      // 实体命中（bestTank，t≤步长）则照常优先结算。飞抵 dec.t 的那一帧才进入下方结算。
      if(!bestTank && s.dec && s.dist + step < s.dec.t){
        s.x=nx; s.y=ny; s.dist+=step;
        const maxDG=(R.ballistics&&R.ballistics.shellMaxDist)||1800;
        if(s.dist>=maxDG) s.dead=true; else if(nx<-60||nx>worldW+60||ny<-60||ny>worldH+60) s.dead=true;
        return;
      }
      s.x=hx; s.y=hy;
      const exposure = (ignoreCover || s.dec) ? (s.dec ? (s.dec.exposure!==undefined ? s.dec.exposure : 1) : 1) : (getExp&&getZ ? getExp(s.fx,s.fy,hx,hy,s.shooter,hitTank,s.dec?s.dec.z.zMin:getZ(hitTank,hitT.part).zMin,s.dec?s.dec.z.zMax:getZ(hitTank,hitT.part).zMax,s.dist+hitDist) : 1);
      if(exposure<=0||rnd()>exposure){
        let stopX=hx, stopY=hy;
        if(find){ const iCovs=find(s.fx,s.fy,hx,hy); for(const cov of iCovs){ const tc=T[cov.cover.tier]||{mode:'solid'}; if(tc.mode==='solid'||tc.mode==='single') continue; if(tc.mode==='none'||tc.mode==='pass') continue; if(cov.distExit<s.dist+bestDist+16){ stopX=cov.point.x; stopY=cov.point.y; break; } } }
        s.x=stopX; s.y=stopY; if(impacts) impacts.push({x:stopX,y:stopY,life:0.4,color:'#ffb454'}); impactFx(stopX,stopY,Math.atan2(s.dy,s.dx),'block',0.7); play('block'); push('未命中 — 被半高掩体拦截','COVER'); s.dead=true;
      } else {
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
          if(res.outcome==='BOUNCE'){ s.fx=res.bouncePoint.x; s.fy=res.bouncePoint.y; s.dec=null; s._decCoverId=null; if(bounceFx) bounceFx.push({x:res.bouncePoint.x,y:res.bouncePoint.y,life:0.5,angle:res.bounceAngle}); impactFx(res.bouncePoint.x,res.bouncePoint.y,res.bounceAngle,'bounce',1); dmgText(res.bouncePoint.x,res.bouncePoint.y-10,'跳弹','bounce'); push(res.text,res.cls); play('bounce'); }
          else { const isHe=s.ammoKey==='he', o=res.outcome==='PEN'?(isHe?'he':'pen'):'block'; if(impacts) impacts.push({x:hx,y:hy,life:0.4,color:isHe?'#ffb454':(res.outcome==='PEN'?'#ff6c5c':'#7a8065')}); impactFx(hx,hy,Math.atan2(s.dy,s.dx),o,1); if(res.splash){ const sc=res.splash.radius/40; burst(hx,hy,sc,Math.round(22*sc),Math.round(14*sc),Math.round(11*sc)); }
            if(res.outcome==='PEN'){
              // #A6 飘字：溢出截断（≤击杀前剩余血量）+ 部位颜色分类（弹药架红/成员与其他模块黄/普通白）
              const shown=Math.min(res.dmg||0, Math.ceil(hpBefore));
              const kind = res.modKey==='ammo' ? 'ammoRack' : (res.modKey ? 'module' : (isHe?'he':'plain'));
              dmgText(hx,hy-14,shown,kind);
            }
            else if(res.dmg>0) dmgText(hx,hy-14,Math.min(res.dmg,Math.ceil(hpBefore)),'he');
            else dmgText(hx,hy-14,'未击穿','block');
            push(res.text,res.cls); play(isHe?'pen':o); s.dead=true; }
        }
      }
    } else if(!bestTank && !s.dec && !bestCover && s.ammo && s.ammo.proximity && R.proximityFuze && R.proximityFuze.enabled){
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
  module.exports={shellVerticalDecision:shellVerticalDecision,fireTank:fireTank,tryFire:tryFire,tryFirePrimary:tryFirePrimary,tryFireSecondary:tryFireSecondary,computeSolution:computeSolution,updateSolution:updateSolution,stepShells:stepShells,primaryWeaponSpec:primaryWeaponSpec,firePrimaryShell:firePrimaryShell,updatePrimaryHeat:updatePrimaryHeat,fireDoubleBarrel:fireDoubleBarrel,updatePrimaryBarrels:updatePrimaryBarrels};
}
