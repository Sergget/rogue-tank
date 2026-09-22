'use strict';
// @ts-nocheck
// scripts/test-fire.js — P-28: tank_fire 收敛单测（掩体判决/弹种消费/跳弹/护盾守卫）
// Run: node scripts/test-fire.js

const U=require('../js/tank_utils.js');
const R=require('../js/tank_rules.js');
global.TAU=U.TAU; global.norm=U.norm; global.rotate=U.rotate; global.angDiff=U.angDiff;
global.segRayIntersect=U.segRayIntersect; global.partCorners=U.partCorners; global.partEdges=U.partEdges;
global.reflectDir=U.reflectDir; global.distToSegment=U.distToSegment; global.gaussian=U.gaussian;
global.RULES=R.RULES;
const G=require('../js/tank_geometry.js');
const G2=G;
global.ARMOR=G.ARMOR; global.BOUNCE_ANGLE=G.BOUNCE_ANGLE; global.HEIGHTS=G.HEIGHTS;
global.getPartZRange=G.getPartZRange; global.getGunHeight=G.getGunHeight;
global.hullPoly=G.hullPoly; global.turretPoly=G.turretPoly;
global.raycastTank=G.raycastTank; global.bestHitForPref=G.bestHitForPref; global.shellPartHit=G.shellPartHit;
global.aimPartPreference=G.aimPartPreference; global.moduleFromHit=G.moduleFromHit;
global.faceLabel=G.faceLabel; global.superstructureLabel=G.superstructureLabel;
global.gunRoot=G.gunRoot; global.gunTip=G.gunTip;
const M=require('../js/tank_model.js');
global.makeTank=M.makeTank; global.computeStats=M.computeStats; global.moduleMult=M.moduleMult;
global.debuffReloadRate=M.debuffReloadRate; global.setDebuff=M.setDebuff;
const C=require('../js/tank_cover.js');
global.COVER_TIERS=C.COVER_TIERS; global.findCoversOnPath=C.findCoversOnPath; global.getExposure=C.getExposure;
global.coverNormalAt=C.coverNormalAt; global.damageCover=C.damageCover; global.splashCoversAt=C.splashCoversAt;
global.covers=C.covers; global.spawnSmokeCloud=C.spawnSmokeCloud;
if(!global.entities) global.entities=[];
global.polyCorners=G.polyCorners; global.polyEdges=G.polyEdges;
const P=require('../js/tank_physics.js');
global.resolveHit=P.resolveHit; global.impactGeometry=P.impactGeometry;
const SH=require('../js/tank_shield.js');
global.hasShield=SH.hasShield; global.shieldAbsorbs=SH.shieldAbsorbs; global.absorbDamage=SH.absorbDamage;
global.applyShield=SH.applyShield;
// stubs for fx/audio
global.burstExplosion=function(){};
global.spawnMuzzleFlash=function(){};
global.spawnImpactFx=function(){};
global.spawnDmgText=function(){};
global.spawnSmoke=function(){};
global.playSound=function(){return true;};
global.pushLog=function(){};

const F=require('../js/tank_fire.js');

let fails=0;
function ok(c,l){ if(c) console.log('✓ '+l); else { console.error('✗ '+l); fails++; } }

// 1) #E1（2026-09-20）：半高/渐变剖面拦截链已整体移除——炮弹只被确定性掩体拦截
ok(F.shellVerticalDecision === undefined, 'shellVerticalDecision 已移除（#E1：不再被不可见物体概率拦截）');
{
  // 残骸（rubble，逻辑 OBB 远大于可见贴图）不再遮挡弹道
  const rubble={x:200,y:0,w:90,h:60,angle:0,tier:'rubble',hp:1};
  C.covers.push(rubble);
  const expRubble=C.getExposure(-200,0,600,0,null,{heightClass:'medium'},0,1.4);
  ok(expRubble===1, `残骸 rubble 不挡弹 (exposure=${expRubble})`);
  C.covers.splice(C.covers.indexOf(rubble),1);
  // 建筑（full）确定性 100% 遮挡（车体与炮塔一致）
  const bld={x:200,y:0,w:60,h:40,angle:0,tier:'full',hp:Infinity};
  C.covers.push(bld);
  const expBld=C.getExposure(-200,0,600,0,null,{heightClass:'medium'},0,1.4);
  const expBldTurret=C.getExposure(-200,0,600,0,null,{heightClass:'medium'},1.4,2.3);
  ok(expBld===0 && expBldTurret===0, `建筑 full 确定性挡弹 (hull=${expBld} turret=${expBldTurret})`);
  C.covers.splice(C.covers.indexOf(bld),1);
}

// 2) fireTank: ammo consumption pen scaling & HE noBounce（烟幕弹路径已随 2026-09-15 W2 移除）
{
  global.shells=[];
  global.devAim={zeroSpread:true};
  const shooter=M.makeTank({id:'player',team:'player',x:0,y:0,hullAngle:0,turretAngle:0, base:{penetration:100, damage:20, reload:1, shellSpeed:1000, maxHp:100}});
  shooter.ammoKey='heat';
  shooter.sigma=0;
  const target=M.makeTank({id:'e',team:'enemy',x:500,y:0});
  global.entities=[shooter,target];
  // ensure no barrel block
  C.covers.length=0;
  global.impacts=[]; global.bounceFx=[];
  const okFire=F.fireTank(shooter,target,'auto');
  ok(okFire===true, 'fireTank HEAT fires');
  ok(global.shells.length===1 && Math.abs(global.shells[0].pen-150)<1e-9, 'HEAT pen 1.5x (100->150)（弹种链 2026-09-13）');
  // HE noBounce
  global.shells.length=0;
  shooter.ammoKey='he';
  shooter.reloadT=0;
  F.fireTank(shooter,target,'auto');
  ok(global.shells[0].ammoKey==='he', 'HE shell ammoKey preserved');
  // 烟幕弹移除断言：fireSmokeShell/tryFireSmoke 不再存在（2026-09-15 W2 用户裁定）
  ok(F.fireSmokeShell===undefined && F.tryFireSmoke===undefined, 'fireSmokeShell/tryFireSmoke 已移除');
}

// 3) stepShells shield absorb guard: HE absorbed should not splashCoversAt
{
  // setup a cover near impact for splash check
  const cov={x:100,y:0,w:30,h:30,angle:0,tier:'barricade',hp:1};
  C.covers.push(cov);
  let splashCalled=false;
  const origSplash=C.splashCoversAt;
  // monkey patch via global
  global.splashCoversAt=function(){ splashCalled=true; };
  // need a shell that will hit player with shield and HE
  const player=M.makeTank({id:'player',team:'player',x:0,y:0,hullAngle:0,turretAngle:0});
  player.shield={dir:0, arc:Math.PI*2, hp:1000, t:10, omni:true};
  global.player=player;
  global.entities=[player];
  // shield should absorb
  const sh={x:-10,y:0, fx:-20,fy:0, dx:1,dy:0, speed:100, pen:1000, dmg:50, ammoKey:'he', ammo:{}, shooter:{team:'enemy', stats:{penetration:10,damage:10}}, hitPref:'auto', canBounce:false, bounced:false, dist:0, dead:false};
  // Need a target tank for raycast: player itself is target but isHostile(enemy,player)=true
  // For stepShells to find bestTank, entities must contain player and isHostile true
  global.shells=[sh];
  global.impacts=[]; global.bounceFx=[];
  // Provide needed globals for stepShells
  global.raycastTank=G.raycastTank;
  global.shellPartHit=G.shellPartHit;
  global.bestHitForPref=G.bestHitForPref;
  global.getPartZRange=G.getPartZRange;
  global.getExposure=G.getExposure;
  global.isHostile=require('../js/tank_entity.js').isHostile || function(a,b){return a!==b;};
  // Run one step where it should hit immediately
  // Place player close so t is small
  player.x=0; player.y=0;
  // step with dt small but enough to reach
  F.stepShells(0.05, {worldW:800, worldH:600, random:()=>0.99});
  // If absorbed, HE should not trigger splash (splashCalled stays false because we patched splashCoversAt, but stepShells also guards !s.absorbed)
  // sh should be absorbed
  ok(sh.absorbed===true, 'HE absorbed sets s.absorbed');
  ok(splashCalled===false, 'HE absorbed does not call HE breach splash');
  // restore
  global.splashCoversAt=origSplash;
  C.covers.splice(C.covers.indexOf(cov),1);
  // cleanup globals
  delete global.player;
  global.shells=[];
}

// 3b) #A8 半高掩体瞬移命中门控：dec.t 未飞抵时继续正常积分，到达后才结算
{
  const shooter=M.makeTank({id:'player',team:'player',x:0,y:0,hullAngle:0,turretAngle:0});
  const target=M.makeTank({id:'e',team:'enemy',x:500,y:0,hullAngle:0,turretAngle:0});
  global.entities=[shooter,target];
  const cov={x:100,y:0,w:60,h:40,angle:0,tier:'half',hp:Infinity};
  C.covers.push(cov);
  global.impacts=[]; global.bounceFx=[];
  // 低速弹：step=10px/帧，掩体入口当帧缓存 dec.t≈全弹道距离（≫dist+step）
  const s={x:-10,y:0, fx:-20,fy:0, dx:1,dy:0, speed:200, pen:1000, dmg:50, ammoKey:'ap', ammo:{}, shooter:shooter, hitPref:'auto', canBounce:true, bounced:false, dist:0, dead:false};
  global.shells=[s];
  let noTeleport=true, settled=false;
  for(let i=0;i<90 && !s.dead;i++){
    const hadDec=!!s.dec;
    F.stepShells(0.05,{worldW:4000,worldH:4000,random:()=>0.01});
    // 已有 dec 但本帧未结算 → hp 必须不变、坐标不得跳到命中点（只前进 step）
    if(hadDec && !s.dead && target.hp!==target.stats.maxHp) noTeleport=false;
    if(s.dead && target.hp<target.stats.maxHp) settled=true;
  }
  ok(noTeleport, '#A8: dec 缓存期间不瞬移结算（目标不掉血直到飞抵）');
  ok(settled, '#A8: 飞抵 dec.t 后正常穿透结算');
  C.covers.splice(C.covers.indexOf(cov),1);
  global.shells=[];
}

// 4) bounce semantics: secondary bounce forbidden (canBounce false after first)
{
  const shooter=M.makeTank({id:'a',team:'enemy',x:0,y:0,hullAngle:0});
  const target=M.makeTank({id:'b',team:'player',x:50,y:0,hullAngle:0});
  global.entities=[shooter,target];
  // theta >70 should bounce when allowBounce true and not noBounce
  const shell={x:0,y:0, dx:Math.cos(72*Math.PI/180), dy:Math.sin(72*Math.PI/180), pen:1e9, dmg:10, shooter:shooter, canBounce:true, bounced:false};
  const hit={part:'hull', faceKey:'front', x:32,y:0, nx:1,ny:0, edgeName:'front'};
  const res=P.resolveHit(shell,target,hit,true);
  ok(res.outcome==='BOUNCE' && shell.canBounce===false, 'first bounce sets canBounce false');
  const res2=P.resolveHit(shell,target,hit,true);
  // per tank_physics, still bounces if allowBounce true (caller must pass canBounce). So second still BOUNCE if caller passes true; but tank_fire passes s.canBounce so it will be false.
  // Verify that with allowBounce=false it does not bounce
  shell.canBounce=false;
  const res3=P.resolveHit(Object.assign({},shell,{canBounce:false}),target,hit,false);
  ok(res3.outcome!=='BOUNCE', 'allowBounce false -> no bounce');
}

// 5) #95: track break (immobT>0) must NOT block firing — only reloadT gates
{
  const shooter=M.makeTank({id:'p95',team:'player',x:0,y:0,hullAngle:0,turretAngle:0, base:{penetration:100, damage:20, reload:1, shellSpeed:1000, maxHp:100}});
  const target=M.makeTank({id:'e95',team:'enemy',x:500,y:0});
  global.entities=[shooter,target];
  C.covers.length=0;
  global.shells=[]; global.impacts=[]; global.bounceFx=[];
  global.devAim={zeroSpread:true};
  shooter.ammoKey='ap'; shooter.sigma=0;
  shooter.reloadT=0; shooter.immobT=5; shooter.trackBroken=true;
  ok(F.fireTank(shooter,target,'auto')===true && global.shells.length===1, '#95 fireTank fires while immobT>0 (track broken not disarmed)');
  global.shells.length=0;
  shooter.reloadT=0;
  // reloadT still blocks
  shooter.reloadT=2;
  ok(F.fireTank(shooter,target,'auto')===false, 'reloadT>0 still blocks fireTank (gating preserved)');
}

// 6) P-49: breech debuff（炮闩受损）blocks firing — fireTank / repair clears
{
  const shooter=M.makeTank({id:'p49',team:'player',x:0,y:0,hullAngle:0,turretAngle:0, base:{penetration:100, damage:20, reload:1, shellSpeed:1000, maxHp:100}});
  const target=M.makeTank({id:'e49',team:'enemy',x:500,y:0});
  global.entities=[shooter,target];
  C.covers.length=0;
  global.shells=[]; global.impacts=[]; global.bounceFx=[];
  global.devAim={zeroSpread:true};
  shooter.ammoKey='ap'; shooter.sigma=0;
  shooter.reloadT=0;
  shooter.debuffs={ breech: RULES.modules.debuffSeconds };
  ok(F.fireTank(shooter,target,'auto')===false && global.shells.length===0, 'P-49 breech debuff blocks fireTank');
  // debuff 到期恢复开火
  shooter.debuffs={};
  global.shells.length=0;
  ok(F.fireTank(shooter,target,'auto')===true && global.shells.length===1, 'P-49 breech debuff 过期后 fireTank 恢复');
  // 修理箱清除表含 breech：repair 激活后清 debuff
  shooter.debuffs={ breech: 5, engine: 5 };
  const A=require('../js/tank_abilities.js');
  const r=A.tryActivateAbility(shooter,'repair');
  ok(r && r.ok===true && !shooter.debuffs.breech && !shooter.debuffs.engine, 'P-49 repair 清除 breech/engine debuff');
}

// 7) 阶段七 7.3：主武器机制（weapons.primary 倍率 + double_barrel 状态机 + autocannon 热量机制；
//    2026-09-15 howitzer 曲射移除 / W6 机炮重做）
{
  global.shells=[]; global.impacts=[]; global.bounceFx=[];
  global.devAim={zeroSpread:true};
  C.covers.length=0;
  const mkShooter=(ptype, overrides)=>{
    const t=M.makeTank({id:'pw',team:'player',x:0,y:0,hullAngle:0,turretAngle:0, base:{penetration:100, damage:20, reload:2, shellSpeed:1000, maxHp:100}});
    t.ammoKey='ap'; t.sigma=0; t.reloadT=0;
    t.weapons={ primary:{ type: ptype, stats: Object.assign({}, overrides||{}) }, secondary:{ type:'none', stats:{} } };
    return t;
  };
  const target=M.makeTank({id:'pw-t',team:'enemy',x:500,y:0});
  global.entities=[mkShooter('standard'),target];
  global.entities[0].weapons.primary._spec=null;

  // 7a) 标准主炮：无倍率、单发
  global.shells.length=0;
  const std=global.entities[0];
  ok(F.fireTank(std,target,'auto')===true && global.shells.length===1, '7a 标准主炮单发');
  ok(Math.abs(global.shells[0].dmg-20)<1e-9 && Math.abs(global.shells[0].pen-100)<1e-9, '7a 标准主炮无倍率');
  ok(!std._primaryBurst, '7a 标准主炮无连发登记');

  // 7b) #E13（2026-09-20 用户裁定重做）：双联火炮——单管装填时间、两管顺序流水线装填，
  //     默认「两管进度互相干涉」（任一击发 → 两管进度归 0）；单击发 1 管、空格齐射 2 管。
  global.shells.length=0;
  const db=mkShooter('double_barrel');
  global.entities=[db,target];
  db._dbState=null;
  // (1) 单击：发射 1 管（管 0 左偏移管口），换管门控 reloadT=0.5s；两管进度都归 0
  ok(F.fireTank(db,target,'auto')===true && global.shells.length===1, '7b 单击发射 1 根已装填管');
  ok(db._dbState && db._dbState.ready[0]===false && db._dbState.ready[1]===true, '7b 管 0 进入装填、管 1 待发');
  ok(Math.abs(db.reloadT-0.5)<1e-9, '7b 换管时间 0.5s 写入 reloadT 门控');
  ok(Math.abs(db._dbState.loadT[0])<1e-9 && Math.abs(db._dbState.loadT[1])<1e-9,
     '#E13 默认两管进度互相干涉：击发后两管进度均归 0');
  ok(global.shells[0].y < G2.gunTip(db).y - 0.5, '7b 管 0 管口左偏移（弹道起点横向偏移）');
  // (2) 换管门控内不可再射击
  ok(F.fireTank(db,target,'auto')===false && global.shells.length===1, '7b 换管 0.5s 门控内单击无效');
  F.updatePrimaryBarrels(db,0.5);   // 换管计时走完（管 0 仍在装填）
  db.reloadT=0;
  // (3) 再单击：发射管 1（另一根已装填管）
  ok(F.fireTank(db,target,'auto')===true && global.shells.length===2, '7b 换管后单击发射另一根管');
  ok(db._dbState.ready[0]===false && db._dbState.ready[1]===false, '7b 两管均进入装填');
  // (4) 齐射：两管均未就绪 → 无发射
  ok(F.fireTank(db,target,'auto',{},true)===false && global.shells.length===2, '7b 齐射时无就绪管不发射');
  // (5) 顺序流水线装填：先装第 1 根（+stats.reload 2s）→ 可单发；再多 2s → 两管完成 → 齐射
  F.updatePrimaryBarrels(db,2.0);
  ok(db._dbState.ready[0]===true && db._dbState.ready[1]===false,
     '#E13 顺序流水线：一个装填时间只装好 1 根炮管（可单发射击）');
  // (5a) #F（2026-09-20 用户裁定）：空格齐射仅在两管都就绪时发射——仅 1 管就绪 → 不发射
  db.reloadT = 0;
  const salvoBlocked = F.fireTank(db, target, 'auto', {}, true);
  ok(salvoBlocked === false && global.shells.length === 2 && db._dbLastBlocked === 'salvo-not-ready',
     '#F 齐射时仅 1 管就绪不发射（空格齐射与单击可区分，且提示状态写回）');
  // 单击仍可发射 1 根就绪管（干涉清零，流水线从头开始）
  db.reloadT = 0;
  ok(F.fireTank(db,target,'auto')===true && global.shells.length===3,
     '#F 齐射被拒不影响单击单发（单击仍可发射 1 根就绪管）');
  // 重新经流水线装好两管（单击已清零全部进度）
  db.reloadT = 0;
  F.updatePrimaryBarrels(db, 2.0);
  F.updatePrimaryBarrels(db, 2.0);
  ok(db._dbState.ready[0]===true && db._dbState.ready[1]===true, '#E13 两个装填时间后两管均就绪（可齐射）');
  db.reloadT=0;
  ok(F.fireTank(db,target,'auto',{},true)===true && global.shells.length===5, '7b 空格齐射发射 2 发');
  db._dbLastBlocked = null;
  // (6) 齐射后换管门控 + 两管重新装填
  ok(Math.abs(db.reloadT-0.5)<1e-9 && db._dbState.ready[0]===false && db._dbState.ready[1]===false, '7b 齐射后两管装填 + 换管门控');
  // (7) 无 stagger 连发路径残留：_primaryBurst 不再为 double_barrel 登记
  ok(!db._primaryBurst, '7b 双管不再登记 stagger 连发队列');
  // (8) #E13 交替装填系统：进度互不干涉——击发一管不影响另一管已累计的进度
  {
    const alt = mkShooter('double_barrel', { altReload: true, switchSeconds: 0.05 });
    global.entities=[alt,target];
    alt._dbState=null;
    F.fireTank(alt,target,'auto',{},true);          // 齐射两管 → 两管同时开始（流水线先装管 0）
    F.updatePrimaryBarrels(alt, 1.0);               // 管 0 进度 1.0s
    const p0 = alt._dbState.loadT[0];
    ok(p0 > 0.9 && alt._dbState.loadT[1] === 0, '#E13 交替装填：流水线仍在装第 1 根');
    // 手动让管 1 就绪并击发，验证不影响管 0 进度
    alt._dbState.ready[1] = true; alt._dbState.loadT[1] = 0;
    alt.reloadT = 0;
    F.fireTank(alt,target,'auto');                  // 单击发射管 1
    ok(Math.abs(alt._dbState.loadT[0] - p0) < 1e-9,
       '#E13 交替装填：击发一根不影响另一根进度（进度互不干涉）');
  }

  // 7c) autocannon（2026-09-15 W6 用户裁定重做）：逐发短间隔 + 热量机制——
  //     伤害=标准 1/5、穿深=标准 85%、射击间隔=装填时间×0.25；
  //     每发 +10% 热量、每秒冷却 15%、≥100% 过热锁定 2s；burst 连发路径已删除。
  global.shells.length=0;
  const ac=mkShooter('autocannon');
  global.entities=[ac,target];
  ok(F.fireTank(ac,target,'auto')===true && global.shells.length===1, '7c 机炮首发单发（无 burst 队列）');
  ok(!ac._primaryBurst, '7c 机炮不再登记 burst 连发队列');
  ok(Math.abs(ac.reloadT-2*0.25)<1e-9, '7c 机炮射击间隔=装填×0.25');
  ok(Math.abs(global.shells[0].dmg-20*0.2)<1e-9, '7c 机炮伤害=标准 1/5（×0.2）');
  ok(Math.abs(global.shells[0].pen-100*0.85)<1e-9, '7c 机炮穿深=标准 85%（×0.85）');
  ok(Math.abs(global.shells[0].speed-1000*1.0)<1e-6, '7c 机炮弹速×1.0');
  ok(Math.abs((global.shells[0].fxScale||1)-0.55)<1e-9, '7c 机炮弹体 fxScale=0.55');
  ok(Math.abs(ac.heatPct-10)<1e-9, '7c 每发积累 10% 热量（首发后 10%）');
  // 连续射击 10 发 → 100% 过热 → 锁定 2s（期间 reloadT=0 也不可开火）
  for(let i=0;i<9;i++){ ac.reloadT=0; F.fireTank(ac,target,'auto'); }
  ok(Math.abs(ac.heatPct-100)<1e-9, '7c 连射 10 发热量 100%');
  ok(Math.abs(ac.heatLockT-2)<1e-9, '7c 过热触发 2s 惩罚锁定');
  const shellCountAtLock=global.shells.length;   // 10 发
  ac.reloadT=0;
  ok(F.fireTank(ac,target,'auto')===false && global.shells.length===shellCountAtLock, '7c 过热锁定期间禁止开火');
  // 冷却：updatePrimaryHeat 2s → 锁定结束 + 热量 100−15×2=70
  F.updatePrimaryHeat(ac, 2.0);
  ok(ac.heatLockT===0 && Math.abs(ac.heatPct-70)<1e-9, '7c 锁定 2s 后热量冷却至 70%');
  ac.reloadT=0;
  ok(F.fireTank(ac,target,'auto')===true && global.shells.length===shellCountAtLock+1, '7c 锁定结束后恢复开火');
  ok(Math.abs(ac.heatPct-80)<1e-9, '7c 恢复开火后热量 80%');
  // 卡牌 statOverrides 接入：coolPerSec 22 → 冷却加速
  const ac2=mkShooter('autocannon', { coolPerSec: 22 });
  global.entities=[ac2,target];
  ac2.heatPct=100; ac2.heatLockT=2;
  F.updatePrimaryHeat(ac2, 1.0);
  ok(Math.abs(ac2.heatPct-78)<1e-9 && Math.abs(ac2.heatLockT-1)<1e-9, '7c 卡牌 coolPerSec=22 冷却加速生效');

  // 7d) railgun（#G 2026-09-21 再平衡）：弹速×2.5 / 穿深×2.0 / 伤害×1.8 / 装填×1.8 + 贯穿字段
  global.shells.length=0;
  const rg=mkShooter('railgun');
  global.entities=[rg,target];
  ok(F.fireTank(rg,target,'auto')===true && global.shells.length===1, '7d 电磁炮单发');
  ok(Math.abs(global.shells[0].pen-100*2.0)<1e-9 && Math.abs(global.shells[0].dmg-20*1.8)<1e-9, '7d 电磁炮穿深×2.0 伤害×1.8');
  ok(Math.abs(global.shells[0].speed-(1000*1.0*2.5))<1e-6, '7d 电磁炮弹速×2.5');
  ok(Math.abs(rg.reloadT-2*1.8)<1e-9, '7d 电磁炮装填×1.8');
  ok(global.shells[0].pierceLeft===1 && Math.abs(global.shells[0].pierceDmgMul-0.6)<1e-9, '7d 电磁炮贯穿字段（pierceLeft=1 / dmgMul=0.6）');

  // 7e-clip) #G（2026-09-21）弹夹炮：弹夹内 0.7s 固定发际间隔 / 弹夹间 = 标准装填×(3.0+0.8×扩容)
  global.shells.length=0;
  const cp=mkShooter('clip');
  global.entities=[cp,target];
  ok(F.fireTank(cp,target,'auto')===true && global.shells.length===1, '7e-clip 弹夹炮首发');
  ok(cp._clipState && cp._clipState.rounds===3 && cp._clipState.size===4, '7e-clip 首发后弹夹余 3/4');
  ok(Math.abs(cp.reloadT-0.7)<1e-9, '7e-clip 弹夹内发际间隔=0.7s 固定');
  // 弹夹内连打 3 发（清零发际间隔模拟逐发就绪）→ 第 4 发打空进入弹夹间整组装填
  for(let i=0;i<3;i++){ cp.reloadT=0; cp._clipState.pendingRefill=false; F.updatePrimaryClip(cp,1/60); F.fireTank(cp,target,'auto'); }
  ok(cp._clipState.rounds===0 && cp._clipState.pendingRefill===true, '7e-clip 4 发打空进入弹夹间装填');
  ok(Math.abs(cp.reloadT-2*3.0)<1e-9, '7e-clip 弹夹间装填=标准装填×3.0（2s×3）');
  ok(F.fireTank(cp,target,'auto')===false, '7e-clip 弹夹间装填期间禁止开火');
  // 弹夹间装填完成 → 弹夹回满
  cp.reloadT=0; F.updatePrimaryClip(cp,1/60);
  ok(cp._clipState.rounds===4 && cp._clipState.pendingRefill===false, '7e-clip 弹夹间装填完成回满 4 发');
  // 扩容卡（+1 发 → 弹夹间 ×3.8）
  cp.weapons.primary.stats={ clipSize: 5 }; cp.weapons.primary._spec=null; cp._clipState=null;
  cp.reloadT=0; F.fireTank(cp,target,'auto');
  for(let i=0;i<4;i++){ cp.reloadT=0; cp._clipState.pendingRefill=false; F.updatePrimaryClip(cp,1/60); F.fireTank(cp,target,'auto'); }
  ok(cp._clipState.size===5 && cp._clipState.rounds===0 && cp._clipState.pendingRefill===true, '7e-clip 扩容后 5 发打空');
  ok(Math.abs(cp.reloadT-2*(3.0+0.8))<1e-9, '7e-clip 扩容 1 发 → 弹夹间=标准装填×3.8');

  // 7f) railgun 贯穿实战（#G）：一发命中并击穿两个串列目标（第二个受 pierceDmgMul 衰减伤害）

  // 7e) howitzer 曲射移除（2026-09-15 用户裁定）：主炮恢复纯平射——WEAPON_DEFAULTS 无 howitzer、
  //     WEAPON_PRIMARY_TYPES 白名单不含、主炮弹不再带 isArc/totalDist 落点标记
  global.shells.length=0;
  const hw=mkShooter('howitzer');
  global.entities=[hw,target];
  ok(F.primaryWeaponSpec(hw)===null || F.primaryWeaponSpec(hw).isArc===undefined, '7e howitzer 主炮不再携带曲射规格');
  ok(F.fireTank(hw,target,'auto')===true && global.shells.length===1, '7e howitzer 未知类型按标准平射回落（单发）');
  const hShell=global.shells[0];
  ok(hShell.isArc===undefined && hShell.totalDist===undefined && hShell.targetX===undefined, '7e 主炮弹无 isArc/totalDist/targetX 曲射落点标记');
  const W=require('../js/tank_weapons.js');
  ok(W.WEAPON_DEFAULTS.primary.howitzer===undefined, '7e WEAPON_DEFAULTS.primary 已无 howitzer');
  const C2=require('../js/tank_cards.js');
  ok(C2.WEAPON_PRIMARY_TYPES && C2.WEAPON_PRIMARY_TYPES.indexOf('howitzer')===-1, '7e 卡牌白名单已移除 howitzer');
  // 7f) railgun 贯穿实战（#G）：一发命中并击穿两个串列目标（第二个受 pierceDmgMul 衰减伤害）
  global.shells=[];
  global.raycastTank=G.raycastTank; global.shellPartHit=G.shellPartHit;
  global.bestHitForPref=G.bestHitForPref; global.getPartZRange=G.getPartZRange; global.getExposure=G.getExposure;
  global.resolveHit=require('../js/tank_physics.js').resolveHit;
  global.isHostile=require('../js/tank_entity.js').isHostile;
  global.impacts=[]; global.bounceFx=[]; global.spawnDmgText=function(){}; global.playSound=function(){};
  global.pushLog=function(){}; global.spawnImpactFx=function(){}; global.burstExplosion=function(){};
  const pa=M.makeTank({id:'pa',team:'enemy',x:400,y:0,hullAngle:0,turretAngle:0}); pa.hp=100000;
  const pb=M.makeTank({id:'pb',team:'enemy',x:800,y:0,hullAngle:0,turretAngle:0}); pb.hp=100000;
  const ps=M.makeTank({id:'ps',team:'player',x:0,y:0,hullAngle:0,turretAngle:0});
  global.entities=[ps,pa,pb];
  const hpA0=pa.hp, hpB0=pb.hp;
  const psh={x:0,y:0,fx:0,fy:0,dx:1,dy:0,speed:800,pen:1000,dmg:50,
    ammo:R.RULES.ammoTypes.ap,ammoKey:'ap',shooter:ps,hitPref:'auto',
    canBounce:true,bounced:false,dist:0,dead:false,
    pierceLeft:1,pierceDmgMul:0.6,pierceHitIds:[]};
  global.shells=[psh];
  let pf=0;
  while(!psh.dead && pf<300){ F.stepShells(0.05,{worldW:4000,worldH:4000,random:()=>0.99}); pf++; }
  ok(pa.hp<hpA0 && pb.hp<hpB0, '7f 贯穿：两个串列目标都掉血');
  // 伤害衰减用 dmgField 断言（确定性）：命中 A 后 s.dmg = 50×0.6 = 30；
  // 实收血量差含部位/模块随机系数，只做区间断言。
  ok(Math.abs(psh.dmg-30)<1e-9, '7f 贯穿伤害衰减 ×0.6（dmgField 50→30）');
  const dmgA=hpA0-pa.hp, dmgB=hpB0-pb.hp;
  // 实收血量差含部位/模块随机系数（可到 ×2），只断言双方都实际受伤；衰减的确定性证据在上面 dmgField
  ok(dmgA>0 && dmgB>0, '7f 两个串列目标均实际受伤（A='+dmgA.toFixed(1)+' B='+dmgB.toFixed(1)+'）');
  ok(psh.dead===true, '7f 贯穿次数耗尽后弹体销毁（pierceLeft='+psh.pierceLeft+'）');
}

// 8) 按住鼠标左键持续开火（2026-09-15 用户确认要求）：任何主炮类型在按住期间逐帧门控自然释放——
//    mvp 主循环每帧 tryFire→fireTank，reloadT/热量/炮管状态由 updatePrimaryHeat/updatePrimaryBarrels
//    逐帧驱动；本段以 dt=1/60 模拟「按住左键」8s 的逐帧链，验证四种主炮类型都能按住连发。
{
  global.devAim={zeroSpread:true};
  C.covers.length=0;
  const DT=1/60, SPAN=8;
  const mkHold=(ptype, overrides)=>{
    global.shells=[]; global.impacts=[]; global.bounceFx=[];
    const t=M.makeTank({id:'hold',team:'player',x:0,y:0,hullAngle:0,turretAngle:0, base:{penetration:100, damage:20, reload:2, shellSpeed:1000, maxHp:100}});
    t.ammoKey='ap'; t.sigma=0; t.reloadT=0;
    t.weapons={ primary:{ type: ptype, stats: Object.assign({}, overrides||{}) }, secondary:{ type:'none', stats:{} } };
    const target=M.makeTank({id:'hold-t',team:'enemy',x:500,y:0});
    global.entities=[t,target];
    return t;
  };
  const holdFire=(t)=>{
    let shots=0;
    for(let s=DT;s<=SPAN;s+=DT){
      F.updatePrimaryHeat(t, DT);
      F.updatePrimaryBarrels(t, DT);
      F.updatePrimaryClip(t, DT);
      if(t.reloadT>0) t.reloadT-=DT;
      const before=global.shells.length;
      F.fireTank(t, global.entities[1], 'auto');   // 按住左键：每帧尝试开火，门控未就绪则 no-op
      if(global.shells.length>before) shots++;
    }
    return shots;
  };
  const stdShots=holdFire(mkHold('standard'));
  ok(stdShots>=3 && stdShots<=4, '8a 按住标准炮 8s 连发 3~4 发（间隔 2.0s，got '+stdShots+'）');
  const rgShots=holdFire(mkHold('railgun'));
  ok(rgShots>=2 && rgShots<=3, '8b 按住电磁炮 8s 连发 2~3 发（间隔 3.6s，got '+rgShots+'）');
  const acShots=holdFire(mkHold('autocannon'));
  const acT=global.entities[0];
  ok(acShots>=15 && acShots<=16, '8c 按住机炮 8s 连发 15~16 发（间隔 0.5s，got '+acShots+'）');
  ok((acT.heatPct||0)>0 && (acT.heatPct||0)<100 && !(acT.heatLockT>0), '8c 机炮按住期间热量积累但未过热（heat='+(acT.heatPct||0).toFixed(1)+'%）');
  const dbShots=holdFire(mkHold('double_barrel'));
  // #E13（2026-09-20）：默认「两管进度互相干涉」+ 顺序流水线装填 → 单击连发节奏≈单管装填周期
  // （reload 2s + 换管门控），8s 内约 4~5 发；齐射需两管都就绪（本用例只按单击路径）。
  ok(dbShots>=4 && dbShots<=5, '#E13 按住双管 8s 连发 4~5 发（顺序流水线 + 进度干涉，got '+dbShots+'）');
  const cpShots=holdFire(mkHold('clip'));
  // #G（2026-09-21）弹夹炮按住连发：0.7s 弹夹内 ×4 发（t=0/0.7/1.4/2.1）+ 弹夹间 6.0s → 8s 内恰好 4 发
  ok(cpShots===4, '#G 按住弹夹炮 8s 连发 4 发（4 发弹夹 + 6s 整组装填溢出窗口，got '+cpShots+'）');
}

// 9) #C4e（2026-09-17）：分发拆分——tryFirePrimary（左键/空格=主炮专属）/ tryFireSecondary
//    （F=副武器专属，按住连发）；activeWeaponSlot 概念移除，副武器 none 不再回落主炮
{
  const W9=require('../js/tank_weapons.js');
  global.shells=[]; global.impacts=[]; global.bounceFx=[];
  global.devAim={zeroSpread:true};
  C.covers.length=0;
  const ENEMY=M.makeTank({id:'e21',team:'enemy',x:500,y:0});
  const mkP=(secType)=>{
    const p=M.makeTank({id:'p21',team:'player',x:0,y:0,hullAngle:0,turretAngle:0, base:{penetration:100, damage:20, reload:2, shellSpeed:1000, maxHp:100}});
    p.ammoKey='ap'; p.sigma=0; p.reloadT=0;
    const secStats=(secType==='none')?{}:Object.assign({}, W9.getWeaponDefaults('secondary',secType));
    p.weapons={ primary:{type:'standard',stats:{}}, secondary:{ type:secType, stats:secStats } };
    return p;
  };
  const mkCtx=(p, mouse, extra)=>{
    const base={
      player:p, mouseWorld:mouse, shells:global.shells, impacts:global.impacts, bounceFx:global.bounceFx,
      entities:global.entities, covers:C.covers, RULES:global.RULES, COVER_TIERS:C.COVER_TIERS,
      nearestEnemyTo:(t)=>ENEMY, gunRoot:G.gunRoot, gunTip:G.gunTip, raycastTank:G.raycastTank,
      aimPartPreference:G.aimPartPreference, bestHitForPref:G.bestHitForPref, getPartZRange:G.getPartZRange,
      getExposure:C.getExposure, findCoversOnPath:C.findCoversOnPath, shellPartHit:G.shellPartHit,
      coverNormalAt:C.coverNormalAt, reflectDir:U.reflectDir, resolveHit:P.resolveHit,
      burstExplosion:global.burstExplosion, spawnMuzzleFlash:global.spawnMuzzleFlash,
      spawnImpactFx:global.spawnImpactFx, spawnDmgText:global.spawnDmgText, playSound:global.playSound,
      pushLog:global.pushLog, damageCover:C.damageCover, splashCoversAt:C.splashCoversAt,
      isHostile:(a,b)=>a!==b, gaussian:()=>0, debuffReloadRate:M.debuffReloadRate,
      computeAmmoConfig:null, fireTank:F.fireTank, fireActiveSecondary:W9.fireActiveSecondary
    };
    return Object.assign(base, extra||{});
  };

  // ① primary 路径 → 委托 tryFire→fireTank（弹体 ammoKey=ap）；double_barrel 空格齐射 salvo 透传
  global.entities=[mkP('none'),ENEMY];
  const pStd=global.entities[0];
  global.shells.length=0;
  ok(F.tryFirePrimary(mkCtx(pStd,{x:500,y:0}))===true && global.shells.length===1 && global.shells[0].ammoKey==='ap', '9a tryFirePrimary → fireTank（1 发 ap）');
  const pDb=mkP('none');
  pDb.weapons.primary={type:'double_barrel',stats:{}};
  pDb._dbState=null;
  global.entities=[pDb,ENEMY];
  global.shells.length=0;
  ok(F.tryFirePrimary(mkCtx(pDb,{x:500,y:0}), true)===true && global.shells.length===2, '9b double_barrel 空格齐射经 tryFirePrimary 发射 2 发（salvo 透传）');

  // ② tryFireSecondary+mortar → isArc 且落点=鼠标世界点方向（min(距离, range 450)）
  global.entities=[ENEMY];
  const pMor=mkP('mortar');
  pMor.secondaryReloadT=0;
  global.shells.length=0;
  const ctxMor=mkCtx(pMor,{x:300,y:100});
  ok(F.tryFireSecondary(ctxMor)===true, '9c tryFireSecondary+mortar 击发成功');
  ok(global.shells.length===1 && global.shells[0].isArc===true, '9c 迫击炮曲射弹生成');
  const morTip=G.gunTip(pMor);
  const useDist=Math.min(Math.hypot(300-morTip.x,100-morTip.y),450);
  ok(Math.abs(global.shells[0].totalDist-useDist)<1e-6 && Math.abs(Math.hypot(global.shells[0].targetX-morTip.x, global.shells[0].targetY-morTip.y)-useDist)<1e-6, '9c 曲射落点=鼠标世界点方向（min(距鼠标,450)）');
  ok(Math.abs(pMor.secondaryReloadT-8)<1e-9, '9c 迫击炮装填重置 8s');

  // ③ tryFireSecondary+missile+纯点 → guided 弹、target=null（沿鼠标方向直飞，不回退 nearestEnemyTo 自动寻的）
  global.shells.length=0;
  const pMis=mkP('missile');
  pMis.secondaryReloadT=0;
  const ctxMis=mkCtx(pMis,{x:400,y:200});
  ok(F.tryFireSecondary(ctxMis)===true, '9d tryFireSecondary+missile 击发成功');
  ok(global.shells.length===1 && global.shells[0].guided===true && global.shells[0].mode==='lock', '9d 制导锁定弹生成（mode=lock）');
  ok(global.shells[0].target===null, '9d 手动击发 target=null（沿鼠标方向直飞，不自动寻的）');
  const misTip=G.gunTip(pMis);
  const wantAng=Math.atan2(200-misTip.y,400-misTip.x);
  const gotAng=Math.atan2(global.shells[0].dy,global.shells[0].dx);
  ok(Math.abs(gotAng-wantAng)<1e-9, '9d 弹向=朝向鼠标世界点');
  ok(global.shells[0].ammoKey==='he' && global.shells[0].dmg===Math.round(140*1.5), '9d 导弹按 HE 机制伤害（140×1.5）');

  // ④ tryFireSecondary 但副武器 none → 拒绝（不回落主炮——主炮有专属键位）
  global.entities=[mkP('none'),ENEMY];
  const pNone=global.entities[0];
  global.shells.length=0;
  ok(F.tryFireSecondary(mkCtx(pNone,{x:500,y:0}))===false && global.shells.length===0, '9e 副武器 none → tryFireSecondary 拒绝（不回落主炮）');
  // ④' 主炮路径不受影响：空格仍走 tryFire（1 发 ap）
  ok(F.tryFirePrimary(mkCtx(pNone,{x:500,y:0}))===true && global.shells.length===1 && global.shells[0].ammoKey==='ap', "9e' 副武器 none 时主炮路径照常（1 发 ap）");

  // ⑤ tryFireSecondary+mine_layer → 注入 spawnMine 时车尾布雷（hullAngle=0 → x=-45）
  const placed=[];
  const pMine=mkP('mine_layer');
  pMine.secondaryReloadT=0;
  global.shells.length=0;
  const ctxMine=mkCtx(pMine,{x:0,y:0},{spawnMine:(o)=>{ placed.push(o); return o; }, deployables:placed});
  ok(F.tryFireSecondary(ctxMine)===true, '9f tryFireSecondary+mine_layer 布雷成功');
  ok(placed.length===1 && placed[0].damage===100, '9f 地雷入注册表（damage=100）');
  ok(Math.abs(placed[0].x-(pMine.x-45))<1e-9 && Math.abs(placed[0].y)<1e-9, '9f 车尾 45px 布雷（hullAngle=0 → x=-45）');
  ok(F.tryFireSecondary(ctxMine)===false, '9f 装填冷却期间再次按 F 拒绝布雷');
  ok(placed.length===1, '9f 冷却期间不新增地雷');

  // ⑥ turret 型 → tryFireSecondary 不响应（设计例外，自主副炮塔由 updateSecondaryWeapon 驱动）
  global.shells.length=0;
  const pTur=mkP('turret');
  pTur.secondaryReloadT=0;
  global.entities=[pTur,ENEMY];
  ok(F.tryFireSecondary(mkCtx(pTur,{x:500,y:0}))===false && global.shells.length===0, '9g turret 型不响应击发（自主运作）');

  // ⑦ 主武器全类型补全（tryFirePrimary）：autocannon / railgun
  global.shells.length=0;
  const pAc=mkP('none');
  pAc.weapons.primary={type:'autocannon',stats:{}};
  pAc.reloadT=0; pAc.heatPct=0; pAc.heatLockT=0;
  global.entities=[pAc,ENEMY];
  ok(F.tryFirePrimary(mkCtx(pAc,{x:500,y:0}))===true && global.shells.length===1, '9h tryFirePrimary+autocannon 击发 1 发');
  ok((pAc.heatPct||0)>0, '9h 机炮击发累计热量（heatPct>0）');

  global.shells.length=0;
  const pRg=mkP('none');
  pRg.weapons.primary={type:'railgun',stats:{}};
  pRg.reloadT=0;
  global.entities=[pRg,ENEMY];
  ok(F.tryFirePrimary(mkCtx(pRg,{x:500,y:0}))===true && global.shells.length===1, '9i tryFirePrimary+railgun 击发 1 发');
  ok(pRg.reloadT>0, '9i 电磁炮装填计时重置（reloadMult 2.2 → reloadT>0）');

  // ⑧ 副武器全类型补全：rocket（#D4 逐发 burst：首发 1 发 + 队列 3）/ missile_wire（线导 mode=wire）
  global.shells.length=0;
  const pRk=mkP('rocket');
  pRk.secondaryReloadT=0;
  global.entities=[pRk,ENEMY];
  ok(F.tryFireSecondary(mkCtx(pRk,{x:400,y:0}))===true && global.shells.length===1
     && pRk._rocketBurst && pRk._rocketBurst.left===3,
    '9j tryFireSecondary+rocket 首发逐发（1 发 + burst 队列 3，#D4）');
  const WQ=require('../js/tank_weapons.js');
  for (let i=0;i<3;i++) WQ.updateRocketBurst(pRk, 1, mkCtx(pRk,{x:400,y:0}));
  ok(global.shells.length===4 && !pRk._rocketBurst && pRk.secondaryReloadT>5,
    '9j rocket 逐发驱动补完 4 发 + 队列清空进入整组装填（#D4）');

  global.shells.length=0;
  const pWire=mkP('missile_wire');
  pWire.secondaryReloadT=0;
  global.entities=[pWire,ENEMY];
  ok(F.tryFireSecondary(mkCtx(pWire,{x:400,y:200}))===true && global.shells.length===1 && global.shells[0].mode==='wire',
    '9k tryFireSecondary+missile_wire 击发（线导 mode=wire）');
}

// ===== #A27（2026-09-15）HE-VT（proximity_he）飞行回归：近炸引信分支必须每帧推进弹体 =====
{
  global.shells=[]; if(!global.entities) global.entities=[];
  const shooter=M.makeTank({ team:'player' });
  const ammo=R.RULES.ammoTypes.proximity_he;
  ok(!!ammo && !!ammo.proximity && R.RULES.proximityFuze && R.RULES.proximityFuze.enabled, '#A27: proximity_he 弹种 + 近炸引信开启');
  const mkShell=function(x,y){ return {x:x,y:y,fx:x,fy:y,dx:1,dy:0,speed:400,pen:100,dmg:50,ammo:ammo,ammoKey:'proximity_he',shooter:shooter,hitPref:'auto',canBounce:true,bounced:false,dist:0,dead:false}; };
  const ctx={worldW:4000,worldH:4000,random:()=>0.5};
  // 场景 1：空域飞行（无敌对实体）→ 弹体持续沿 x 正向前进，不静止（之前 dist=0 / x=0）
  global.entities=[shooter];
  const s1=mkShell(0,0); global.shells=[s1];
  for(let i=0;i<20;i++){ F.stepShells(0.05,ctx); }
  ok(s1.dist>0 && s1.x>0 && s1.dead===false, '#A27: HE-VT 飞行 20 帧推进（dist='+s1.dist.toFixed(1)+' x='+s1.x.toFixed(1)+'）');
  for(let i=0;i<2000 && !s1.dead;i++){ F.stepShells(0.05,ctx); }
  ok(s1.dead===true, '#A27: HE-VT 飞行后射程耗尽 / 出界死亡（dist='+s1.dist.toFixed(1)+' dead='+s1.dead+')');
  // 场景 2：近炸空爆命中敌人 — 弹体飞过敌人（未直接击中，y 偏 85 越过车身）触发引信空爆，
  // 弹出敌人实际受伤（hp 损失）而非“空爆”字样。applySplashAt 经修订返回实收伤害；
  // 武器为 proximity_he（splashRadius 90），偏 85 仍落内爆半径 → 敌人受 1 点伤害。
  const dmgCaptured=[]; global.applySplashAt=P.applySplashAt;
  const prevDmgText=global.spawnDmgText;
  global.spawnDmgText=function(x,y,text,kind){ dmgCaptured.push({text:String(text),kind:kind}); };
  const enemy=M.makeTank({ team:'enemy', x:800, y:0, vx:0, vy:0, hp:10000 });
  const hpBefore=enemy.hp;
  global.entities=[shooter,enemy];
  const ang=Math.atan2(85,800);
  const s2=Object.assign(mkShell(0,0), {dx:Math.cos(ang), dy:Math.sin(ang), _fuzeArmed:false});
  global.shells=[s2];
  let frames=0;
  while(!s2.dead && frames<400){ F.stepShells(0.05,ctx); frames++; }
  ok(s2.dead===true && frames<400, '#A27: HE-VT 飞过敌人触发近炸空爆（frames='+frames+' x='+s2.x.toFixed(1)+'）');
  ok(enemy.hp < hpBefore, '#A27: 敌人受到溅射伤害（hp '+hpBefore+'→'+(hpBefore-enemy.hp)+'）');
  const nums=dmgCaptured.filter(function(d){return /^\d+$/.test(d.text);}).map(function(d){return Number(d.text);});
  ok(nums.length>0 && nums[0]>0 && nums[0]===hpBefore-enemy.hp, '#A27: 空爆飘字为敌人实受伤害='+nums[0]+'（而非“空爆”字样，亦非静态 s.dmg）');
  ok(!dmgCaptured.some(function(d){return d.text==='空爆';}), '#A27: 不再弹出“空爆”字样');
  if(prevDmgText) global.spawnDmgText=prevDmgText; else delete global.spawnDmgText;
}

console.log(fails===0?'\nAll fire checks passed.':`\n${fails} FAILED`);
process.exit(fails===0?0:1);
