'use strict';

// tank_fire.js — 战斗核心管线收敛（P-28）。
// mvp/bench 双份内联副本收口到此：
//   shellVerticalDecision / fireTank / fireSmokeShell / tryFire / tryFireSmoke
//   computeSolution / updateSolution + shells 飞行积分物理/判定（stepShells）
// 浏览器：全局脚本按序加载，ctx 缺省回退全局；Node：经 ctx 显式注入（covers/entities/fx/audio/RULES）
// 保持半高越掩插值/护盾吸收守卫(!s.absorbed)/HE破障(smoke分支)/二次跳弹禁止语义。

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

function fireTank(shooter, target, hitPref, ctx){
  const c=_ctx(ctx);
  const shells=c.shells||_G('shells',null);
  if(!shells) return false;
  const R=_rules(c), T=_tiers(c);
  const find=c.findCoversOnPath||_G('findCoversOnPath',null);
  const gunRoot=c.gunRoot||_G('gunRoot',null);
  const gunTip=c.gunTip||_G('gunTip',null);
  const debuffReload=c.debuffReloadRate||_G('debuffReloadRate',function(){return 1;});
  const gauss=c.gaussian||_G('gaussian',function(){return 0;});
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
  shooter.reloadT=shooter.stats.reload/debuffReload(shooter);
  const ox=tipP.x, oy=tipP.y;
  const getAmmoCfg=c.computeAmmoConfig||_G('computeAmmoConfig',function(s,k){ return (R.ammoTypes&&(R.ammoTypes[k]||R.ammoTypes.ap))||{speed:1,pen:1,dmg:1,spread:1}; });
  const ammo=getAmmoCfg(shooter,shooter.ammoKey);
  const zero=devAim&&devAim.zeroSpread&&shooter.id==='player';
  const sigma=zero?0:((shooter.sigma||0)*(ammo.spread||1));
  const spreadAngle=shooter.turretAngle+gauss(sigma);
  const dx=Math.cos(spreadAngle), dy=Math.sin(spreadAngle);
  const bMuzzle=(shooter.barrel&&shooter.barrel.muzzle)||'none';
  burst(ox,oy,0.6,4,2,0);
  muzzle(ox,oy,spreadAngle||shooter.turretAngle,1,bMuzzle);
  play('fire');
  shells.push({x:ox,y:oy,fx:rootP.x,fy:rootP.y,dx:dx,dy:dy,speed:Math.max(200,shooter.stats.shellSpeed*(ammo.speed||1)+(ammo.speedAdd||0)),pen:shooter.stats.penetration*(ammo.pen||1)+(ammo.penAdd||0),dmg:Math.max(0,shooter.stats.damage*(ammo.dmg||1)+(ammo.dmgAdd||0)),ammo:ammo,ammoKey:shooter.ammoKey,shooter:shooter,hitPref:hitPref,canBounce:true,bounced:false,dist:0,dead:false});
  return true;
}

function fireSmokeShell(shooter, ctx){
  const c=_ctx(ctx);
  const shells=c.shells||_G('shells',null);
  if(!shells) return false;
  const T=_tiers(c);
  const find=c.findCoversOnPath||_G('findCoversOnPath',null);
  const gunRoot=c.gunRoot||_G('gunRoot',null);
  const gunTip=c.gunTip||_G('gunTip',null);
  const debuffReload=c.debuffReloadRate||_G('debuffReloadRate',function(){return 1;});
  const gauss=c.gaussian||_G('gaussian',function(){return 0;});
  const burst=c.burstExplosion||_G('burstExplosion',function(){});
  const muzzle=c.spawnMuzzleFlash||_G('spawnMuzzleFlash',function(){});
  const impact=c.spawnImpactFx||_G('spawnImpactFx',function(){});
  const play=c.playSound||_G('playSound',function(){});
  const push=c.pushLog||_G('pushLog',function(){});
  if(!shooter) return false;
  // #95：烟幕弹经主炮发射（与普通炮弹同管线，含炮管掩体贯穿判定）——履带断不缴械火炮
  if(shooter.reloadT>0) return false;
  if(shooter.debuffs && shooter.debuffs.breech > 0) return false; // P-49 炮闩受损
  if(!gunRoot||!gunTip||!find) return false;
  const rootP=gunRoot(shooter), tipP=gunTip(shooter);
  const barrelCovers=find(rootP.x,rootP.y,tipP.x,tipP.y);
  const solid=barrelCovers.find(function(v){ const m=T[v.cover.tier]&&T[v.cover.tier].mode; return m==='solid'||m==='single'; });
  if(solid){
    shooter.reloadT=shooter.stats.reload/debuffReload(shooter);
    burst(solid.point.x,solid.point.y,0.6,4,2,0);
    muzzle(tipP.x,tipP.y,shooter.turretAngle,1,(shooter.barrel&&shooter.barrel.muzzle)||'none');
    impact(solid.point.x,solid.point.y,shooter.turretAngle,'block',0.8);
    play('block');
    if(shooter.team==='player') push('烟幕弹发射被掩体阻挡 — 炮管贯穿掩体','COVER');
    return false;
  }
  shooter.reloadT=(shooter.stats.reload/debuffReload(shooter))*0.8;
  const ox=tipP.x, oy=tipP.y;
  const spreadAngle=shooter.turretAngle+gauss(shooter.sigma||0);
  const dx=Math.cos(spreadAngle), dy=Math.sin(spreadAngle);
  const bMuzzle=(shooter.barrel&&shooter.barrel.muzzle)||'none';
  burst(ox,oy,0.6,4,2,0);
  muzzle(ox,oy,spreadAngle,1,bMuzzle);
  play('fire');
  shells.push({x:ox,y:oy,fx:rootP.x,fy:rootP.y,dx:dx,dy:dy,speed:Math.max(200,shooter.stats.shellSpeed*0.7),pen:0,dmg:0,ammo:{color:'#c8c8c8',tail:'rgba(150,150,150,0.6)'},ammoKey:'smoke',smoke:true,shooter:shooter,hitPref:'auto',canBounce:false,bounced:false,dist:0,dead:false});
  return true;
}

function tryFire(ctx){
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
  // 通过显式 ctx 调用，避免闭包隐式 shells 依赖
  if(c.shells||_G('shells',null)) return ft(player,target,hitPref,c);
  return ft(player,target,hitPref,ctx);
}

function tryFireSmoke(ctx){
  const c=_ctx(ctx);
  const player=c.player||_G('player',null);
  const f=c.fireSmokeShell||fireSmokeShell;
  // #95 语义裁定：烟幕弹虽是能力键位入口，但实际经主炮发射（fireSmokeShell 与普通开火
  // 同管线、同炮管掩体贯穿判定），非炮击/护盾类「施放」——immobT 门控一并移除；
  // 炮击(callStrike)/护盾(applyShield) 的施放门控在 tank_strike/tank_shield 接线层，不受此处影响。
  if(!player||player.reloadT>0) return false;
  return f(player,c);
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
  let willBounce=false;
  if(theta>bounce&&!ammoPred.noBounce) willBounce=true;
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
  const bounceAngle=c.bounceAngle!==undefined?c.bounceAngle:(_G('BOUNCE_ANGLE',R.ballistics?R.ballistics.bounceAngle:Math.PI*70/180));
  const worldW=c.worldW!==undefined?c.worldW:(c.worldWidth!==undefined?c.worldWidth:(_G('canvas',null)?_G('canvas',null).width:2000));
  const worldH=c.worldH!==undefined?c.worldH:(c.worldHeight!==undefined?c.worldHeight:(_G('canvas',null)?_G('canvas',null).height:2000));
  const rnd=c.random||Math.random;
  shells.forEach(function(s){
    if(s.dead) return;
    const step=s.speed*dt, sx=s.x, sy=s.y, nx=sx+s.dx*step, ny=sy+s.dy*step;
    if(s.ammoKey!=='smoke' && spawnTracer) spawnTracer(sx, sy, nx, ny, (s.ammo&&s.ammo.tracer)||'#ffd24a');
    if(s.ammoKey==='smoke'){
      let detX=null, detY=null;
      for(const e of ents){
        if(!e||e.hp<=0) continue;
        if(!isHostile(s.shooter.team,e.team)) continue;
        const hits=raycast?raycast(sx,sy,s.dx,s.dy,e):null;
        const bh=shellPartHit&&hits?shellPartHit(hits,step,'auto'):null;
        if(bh){ detX=sx+s.dx*bh.t; detY=sy+s.dy*bh.t; break; }
      }
      if(detX===null&&find){
        const covs=find(sx,sy,nx,ny);
        for(const cov of covs){
          const tier=T[cov.cover.tier]||{mode:'solid'};
          if(cov.distA>step) break;
          if(tier.mode==='solid'||tier.mode==='single'){ detX=cov.point.x; detY=cov.point.y; break; }
          if(tier.mode==='graduated'&&cov.distA<=step){
            const dec=shellVerticalDecision(s,c);
            if(dec&&dec.exposure<1&&(dec.exposure<=0||rnd()>dec.exposure)){ detX=cov.point.x; detY=cov.point.y; break; }
          }
        }
      }
      if(detX===null){ s.x=nx; s.y=ny; s.dist+=step; const maxD=(R.ballistics&&R.ballistics.shellMaxDist)||1800; if(s.dist>=maxD||nx<-60||nx>worldW+60||ny<-60||ny>worldH+60){ detX=nx; detY=ny; } }
      if(detX!==null){ s.x=detX; s.y=detY; spawnSmokeCloud(detX,detY); burst(detX,detY,0.5,0,10,0); spawnSmoke(detX,detY,12,1); if(s.shooter.team==='player') push('烟幕弹引爆 — 生成烟雾','COVER'); s.dead=true; }
      else if(rnd()<0.55) spawnSmoke(nx,ny,12);
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
    const covs=find?find(sx,sy,nx,ny):[];
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
      const exposure = s.dec ? (s.dec.exposure!==undefined ? s.dec.exposure : 1) : (getExp&&getZ ? getExp(s.fx,s.fy,hx,hy,s.shooter,hitTank,s.dec?s.dec.z.zMin:getZ(hitTank,hitT.part).zMin,s.dec?s.dec.z.zMax:getZ(hitTank,hitT.part).zMax,s.dist+hitDist) : 1);
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
    } else { s.x=nx; s.y=ny; s.dist+=step; const maxD=(R.ballistics&&R.ballistics.shellMaxDist)||1800; if(s.dist>=maxD) s.dead=true; else if(nx<-60||nx>worldW+60||ny<-60||ny>worldH+60) s.dead=true; }
  });
  const breachR=(R.breach&&R.breach.heSplashRadius)||24;
  shells.forEach(function(s){ if(s.dead&&s.ammoKey==='he'&&!s.absorbed) splashCovers(s.x,s.y,breachR); });
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={shellVerticalDecision:shellVerticalDecision,fireTank:fireTank,fireSmokeShell:fireSmokeShell,tryFire:tryFire,tryFireSmoke:tryFireSmoke,computeSolution:computeSolution,updateSolution:updateSolution,stepShells:stepShells};
}
