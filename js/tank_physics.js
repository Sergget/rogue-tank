'use strict';

// Every shot resolves to a result object that also carries a `log()` closure. `log()` applies any
// deferred state mutation (damage / tracks / ammo / fire / crew) on the target and returns
// `{ text, cls }` for the HUD. Callers fire the shell visually and invoke `log()` only when the
// projectile physically reaches its hit point — a shell must never produce an effect before impact.
function withLog(res){
  if(res.log) return res;
  res.log = () => ({ text: res.text, cls: res.cls || '' });
  return res;
}

function resolveShot(ox,oy,dx,dy, shooter, target){
  const farX = ox+dx*1200, farY = oy+dy*1200;
  // First obstruction wins, in flight order: a solid cover ANYWHERE on the ray stops the round —
  // even when the aim misses every tank (no pass-through tracers through walls).
  const coversOnRay = findCoversOnPath(ox, oy, farX, farY);
  const solidCover = coversOnRay.find(c => COVER_TIERS[c.cover.tier].mode === 'solid');

  const potentialHits = raycastTank(ox,oy,dx,dy, target);
  if(!potentialHits){
    if(solidCover){
      return withLog({
        outcome:'COVER', cls:'COVER',
        text:`被${COVER_TIERS[solidCover.cover.tier].label}挡住 — 炮弹被掩体截停`,
        hitPoint:{ x:solidCover.point.x, y:solidCover.point.y },
        segments:[{ x1:ox, y1:oy, x2:solidCover.point.x, y2:solidCover.point.y }]
      });
    }
    return withLog({
      outcome:'MISS', text:'脱靶 — 未命中目标轮廓',
      segments:[{ x1:ox, y1:oy, x2:farX, y2:farY }]
    });
  }

  // A cover may only block a shot when the projectile would hit it BEFORE reaching the target —
  // a cover behind (or past) the target's hull must never eat the round.
  potentialHits.sort((a,b) => a.t - b.t);
  const firstHit = potentialHits[0];
  const coversToHit = findCoversOnPath(ox, oy, firstHit.x, firstHit.y);
  const solidToHit = coversToHit.find(c => COVER_TIERS[c.cover.tier].mode === 'solid');
  if(solidToHit){
    return withLog({
      outcome:'COVER', cls:'COVER',
      text:`被${COVER_TIERS[solidToHit.cover.tier].label}挡住 — 炮弹被掩体截停`,
      hitPoint:{ x:solidToHit.point.x, y:solidToHit.point.y },
      segments:[{ x1:ox, y1:oy, x2:solidToHit.point.x, y2:solidToHit.point.y }]
    });
  }

  const weightedParts = potentialHits.map(h => {
    const z = getPartZRange(target, h.part);
    const exposure = getExposure(ox,oy, h.x, h.y, shooter, target, z.zMin, z.zMax);
    return { hit: h, weight: exposure };
  });

  const totalWeight = weightedParts.reduce((sum, p) => sum + p.weight, 0);
  let hit = null;

  if (totalWeight <= 0) {
    return withLog({
      outcome:'COVER', cls:'COVER',
      text:`未命中 — 目标被掩体完全遮蔽`,
      hitPoint: {x: firstHit.x, y: firstHit.y},
      segments:[{ x1:ox, y1:oy, x2:firstHit.x, y2:firstHit.y }]
    });
  }

  // Half-cover probability check: if the exposure roll exceeds the total part exposure, the round
  // is caught by the half-cover between the muzzle and the hit point instead of reaching the target.
  const rollEx = Math.random();
  if(rollEx > totalWeight) {
    return withLog({
      outcome:'COVER', cls:'COVER',
      text:`未命中 — 被半高掩体拦截`,
      hitPoint: {x: firstHit.x, y: firstHit.y},
      segments:[{ x1:ox, y1:oy, x2:firstHit.x, y2:firstHit.y }]
    });
  }

  let roll = Math.random() * totalWeight;
  for (const p of weightedParts) {
    roll -= p.weight;
    if (roll <= 0) {
      hit = p.hit;
      break;
    }
  }
  if (!hit) hit = weightedParts[0].hit;

  return resolveImpact(ox,oy,dx,dy, shooter, target, hit, true);
}

function reflectDir(dx,dy,nx,ny){
  const dot = dx*nx + dy*ny;
  return { x: dx - 2*dot*nx, y: dy - 2*dot*ny };
}

function resolveImpact(ox,oy,dx,dy, shooter, target, hit, allowBounce){
  const cosT = Math.abs(dx*hit.nx + dy*hit.ny);
  const theta = Math.acos(Math.min(1,Math.max(-1,cosT)));
  const armorTable = target.stats.armor || target.customArmor || ARMOR;
  const thickness = (armorTable[hit.part] && armorTable[hit.part][hit.faceKey] !== undefined)
    ? armorTable[hit.part][hit.faceKey]
    : ARMOR[hit.part][hit.faceKey];
  const mod = moduleFromHit(target, hit);
  const hitPoint = { x:hit.x, y:hit.y };
  const seg = [{ x1:ox, y1:oy, x2:hit.x, y2:hit.y }];
  const head = `${hit.part==='turret'?superstructureLabel(target):'车体'} ${faceLabel(hit.faceKey)}`;
  const deg = (theta*180/Math.PI).toFixed(0);

  if(allowBounce && theta > BOUNCE_ANGLE){
    const r = reflectDir(dx,dy,hit.nx,hit.ny);
    const ex = hit.x + r.x*1.5, ey = hit.y + r.y*1.5;

    let secHit = null, secTarget = null;
    let secBestT = Infinity;
    for(const e of entities){
      if(e.hp <= 0) continue;
      const hits = raycastTank(ex, ey, r.x, r.y, e);
      if(hits){
        for(const h of hits){
          if(h.t > 0.001 && h.t < secBestT){
            secBestT = h.t;
            secHit = h;
            secTarget = e;
          }
        }
      }
    }

    if(secHit && secTarget){
      const secRes = resolveImpact(ex, ey, r.x, r.y, shooter, secTarget, secHit, false);
      const endX = secRes.hitPoint ? secRes.hitPoint.x : ex + r.x * secBestT;
      const endY = secRes.hitPoint ? secRes.hitPoint.y : ey + r.y * secBestT;
      const log = () => {
        const s = secRes.log ? secRes.log() : { text: secRes.text, cls: secRes.cls || '' };
        return {
          text: `跳弹二次命中！${head} 入射角 ${deg}° 超过跳弹角，炮弹被装甲弹开 → 二次命中 ${secTarget.id==='player'?'玩家':'目标'} (${s.text})`,
          cls: s.cls || 'BOUNCE'
        };
      };
      return {
        outcome: 'BOUNCE', cls: 'BOUNCE', text: '跳弹二次命中',
        part: hit.part, faceKey: hit.faceKey,
        hitPoint: secRes.hitPoint || hitPoint,
        segments: seg.concat([{ x1:ex, y1:ey, x2:endX, y2:endY }]),
        bouncePoint: hitPoint,
        bounced: true,
        log
      };
    } else {
      const bounceLen = 220;
      const bx = ex + r.x*bounceLen, by = ey + r.y*bounceLen;
      return withLog({
        outcome: 'BOUNCE', cls: 'BOUNCE',
        text: `跳弹！${head} 入射角 ${deg}° 超过跳弹角 — 炮弹沿反射方向飞离`,
        part: hit.part, faceKey: hit.faceKey,
        hitPoint,
        segments: seg.concat([{ x1:ex, y1:ey, x2:bx, y2:by }]),
        bouncePoint: hitPoint,
        bounced: true
      });
    }
  }

  if(theta > BOUNCE_ANGLE){
    return withLog({
      outcome:'BLOCK', cls:'BLOCK',
      text:`未击穿 — ${head}，入射角 ${deg}° 过陡`,
      part:hit.part, faceKey:hit.faceKey, hitPoint, segments:seg
    });
  }

  const eff = thickness/Math.cos(theta);
  if(eff > shooter.stats.penetration){
    return withLog({
      outcome:'BLOCK', cls:'BLOCK',
      text:`未击穿 — ${head} 等效厚度 ${eff.toFixed(0)} > 穿深 ${shooter.stats.penetration}`,
      part:hit.part, faceKey:hit.faceKey, hitPoint, segments:seg
    });
  }

  // PEN: 命中角度/等效厚度/部位判定在开火瞬间完成；但对目标血量与模块状态的改动只能
  // 在炮弹实际落地时执行（log 闭包），保证"炮去命中坦克之前不产生效果"。
  const log = () => {
    const invuln = !!(target.invuln);
    let extra = '';
    let cls = 'PEN';
    let dmg = shooter.stats.damage * (0.85 + Math.random()*0.3);
    if(invuln){
      extra = '（靶车无敌，不掉血）';
    } else if(target.hp <= 0){
      extra = '（目标已摧毁）';
    } else {
      if(mod.key==='ammo'){
        // 弹药架：敌方一发直接殉爆；玩家/友方第一次命中"故障弹药排障"窗口，
        // 窗口内二次命中弹药架才判定殉爆。
        const isPlayerSide = (target.team==='player' || target.team==='ally');
        if(isPlayerSide){
          target.ammoFaultHits = (target.ammoFaultHits||0) + 1;
          const win = (target.stats && target.stats.ammoFaultWindow !== undefined) ? target.stats.ammoFaultWindow : 5;
          if(target.ammoFaultHits >= 2 && target.ammoFaultT > 0){
            target.ammoBlew = true; target.fireT = 4;
            target.blowHitPoint = { x:hit.x, y:hit.y };
            dmg = target.hp;
            extra = '（弹药架殉爆！炮塔被掀飞）'; cls='CRIT';
          } else {
            target.ammoFaultT = win;
            dmg = shooter.stats.damage * 0.4;
            extra = `（弹药故障排障：${win.toFixed(1)}s 内再次命中弹药架将殉爆）`; cls='CRIT';
          }
        } else {
          target.ammoBlew = true; target.fireT = 4;
          target.blowHitPoint = { x:hit.x, y:hit.y };
          dmg = target.hp;
          extra = '（弹药库殉爆！击杀判定）'; cls='CRIT';
        }
      } else if(mod.key==='track'){
        target.trackBroken = true;
        target.trackFxPoint = { x:hit.x, y:hit.y };
        const lock = (target.stats && target.stats.trackLock !== undefined) ? target.stats.trackLock : 8;
        target.immobT = lock;
        extra = `（履带被击断，锁定 ${lock.toFixed(0)}s）`;
      } else if(mod.key==='engine'){
        target.dotT = 4; target.fireT = 4;
        extra = '（发动机/油箱起火：持续伤害，速度-50%）';
      } else if(mod.key==='crew'){
        target.fireDebuffT = 5; extra = '（炮手阵亡，散布增大）';
      }
      target.hp = Math.max(0, target.hp - dmg);
    }
    return {
      text: `击穿！命中 ${mod.label}，造成 ${dmg.toFixed(0)} 伤害 ${extra}`,
      cls
    };
  };

  return {
    outcome:'PEN', cls:'PEN',
    text:'击穿！命中 ' + mod.label,
    part:hit.part, faceKey:hit.faceKey,
    hitPoint, segments:seg,
    log
  };
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    resolveShot,
    reflectDir,
    resolveImpact
  };
}