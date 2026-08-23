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

// 1) shellVerticalDecision: wiring — ray does hit; start offset to avoid inside case
{
  const shooter=M.makeTank({id:'s',team:'player',x:0,y:0,hullAngle:0,turretAngle:0});
  const target=M.makeTank({id:'t',team:'enemy',x:400,y:0,hullAngle:0,turretAngle:0});
  global.entities=[shooter,target];
  // place a half cover between
  const cov={x:200,y:0,w:60,h:40,angle:0,tier:'half',hp:Infinity};
  C.covers.push(cov);
  const s={shooter:shooter, fx:-200, fy:0, dx:1, dy:0, hitPref:'auto'};
  const dec=F.shellVerticalDecision(s);
  ok(dec && typeof dec.exposure==='number', 'shellVerticalDecision dec.exposure is number');
  C.covers.splice(C.covers.indexOf(cov),1);
}

// 2) fireTank: ammo consumption pen scaling & HE noBounce / smoke separate path
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
  ok(global.shells.length===1 && Math.abs(global.shells[0].pen-140)<1e-9, 'HEAT pen 1.4x (100->140)');
  // HE noBounce
  global.shells.length=0;
  shooter.ammoKey='he';
  shooter.reloadT=0;
  F.fireTank(shooter,target,'auto');
  ok(global.shells[0].ammoKey==='he', 'HE shell ammoKey preserved');
  // smoke separate path
  global.shells.length=0;
  shooter.reloadT=0;
  shooter.ammoKey='ap';
  const sm=F.fireSmokeShell(shooter);
  ok(sm===true && global.shells[0].ammoKey==='smoke' && global.shells[0].smoke===true && global.shells[0].pen===0, 'fireSmokeShell smoke separate path pen 0');
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

console.log(fails===0?'\nAll fire checks passed.':`\n${fails} FAILED`);
process.exit(fails===0?0:1);
