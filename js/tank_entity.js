'use strict';

// tank_entity.js — shared entity registry + lifecycle helpers.
// Every tank (player, allies, enemies, and eventually escort drones) lives in ONE `entities`
// array. Modules treat `entities` as a global (browser: shared top-level lexical binding, also
// mirrored to window.entities so the console can inspect it; Node tests: via the test harness
// sandbox). Pure logic only — no DOM / canvas — so it can be required into a test harness.
//
// The array itself is created here (first module to declare it) so all later modules and the
// inline game loop share the same instance; nothing should re-declare `entities`.

const entities = [];
if (typeof window !== 'undefined') window.entities = entities;

// Spawn a tank from a config and stamp its spawn snapshot so resetEntity() can restore it.
function spawnTank(opts){
  const t = makeTank(opts);
  t.spawn = { x:t.x, y:t.y, hullAngle:t.hullAngle, turretAngle:t.turretAngle, hp:t.hp }; // for resetEntity()
  entities.push(t);
  return t;
}

function resetEntity(t){
  Object.assign(t, t.spawn, { immobT:0, dotT:0, dotDps:0, dotSeconds:0, fireDebuffT:0, reloadT:0, _dead:false, reviveT:0,
    fireT:0, trackBroken:false,
    debuffs:{},
    ammoBlew:false, _blowFx:false, _trackFx:false });
}

// accumulate rolling-track phase from real displacement (translation + hull rotation). Turning a
// tracked vehicle in place also rolls its tracks (differential feel).
function advanceTracks(t, dx, dy, dAngle){
  t.trackPhase = (t.trackPhase||0) + Math.hypot(dx,dy) + Math.abs(dAngle)*(t.hullWid/2);
}

function isHostile(teamA, teamB){
  const enemySide = t => t==='enemy';
  return enemySide(teamA) !== enemySide(teamB); // enemy team vs. (player+ally) side
}

function clamp(v, minV, maxV){ return v < minV ? minV : (v > maxV ? maxV : v); }

function livingEnemiesOf(team){
  return entities.filter(e=>isHostile(e.team,team) && e.hp>0);
}

function nearestEnemyTo(shooter){
  const candidates = livingEnemiesOf(shooter.team);
  let best=null, bestD=Infinity;
  for(const c of candidates){
    const d = Math.hypot(c.x-shooter.x, c.y-shooter.y);
    if(d<bestD){ bestD=d; best=c; }
  }
  return best;
}

// Tank ⇄ tank collision: tanks must never overlap. Each pair that overlaps is pushed apart
// along its minimum-translation vector (MTV), split equally between both so the whole comes across.
// #12 修复要点：
//  1. MTV 轴选择速度稳定化——近最小深度（≤1.15×）的候选轴里，优先取"最抵消逼近运动"的轴，
//     深叠/近方形重叠时不再逐帧在两轴间横跳（旧版横跳直接造成"鬼畜"抖动与横向幽灵穿模）；
//  2. 速度响应只作用在碰撞法向闭合分量上（完全非弹性冲量 j = 相对法向速度/2），
//     切向滑动分量原样保留；标量速度经投影重建到各自车体轴，不再用 Math.hypot 丢方向、
//     不再有 ×0.7 / ×0.8 每帧堆叠砍速（旧版使速度 0↔max 高频振荡）。
function resolveTankCollisions(iterations){
  for(let it=0; it < (iterations||4); it++){
    let moved = false;
    for(let i=0;i<entities.length;i++){
      for(let j=i+1;j<entities.length;j++){
        const a = entities[i], b = entities[j];
        if(a.hp<=0 || b.hp<=0) continue;
        if(a.isDrone || b.isDrone) continue;   // P-17：无人机无 hull 几何（hullAngle/hullLen/hullWid），跳过坦克碰撞（防 NaN 污染坐标）
        const cornersA = partCorners(a.x,a.y,a.hullAngle, a.hullLen/2, a.hullWid/2);
        const cornersB = partCorners(b.x,b.y,b.hullAngle, b.hullLen/2, b.hullWid/2);
        const candidates = obbMTVs(cornersA, cornersB);
        if(!candidates) continue;
        // 稳定选轴：先按最小深度定基准，再在近基准轴里用"相对速度投影"决胜。
        // 注意 u=(ux,uy) 约定：从 B 质心指向 A 质心（推 A 远离 B 的方向，与掩体 obbMTV 一致）
        let minD = Infinity;
        for(const c of candidates) if(c.depth < minD) minD = c.depth;
        let best = candidates[0];
        const tie = candidates.filter(c => c.depth <= minD * 1.15);
        if(tie.length > 1){
          const vAx = Math.cos(a.hullAngle) * a.speed, vAy = Math.sin(a.hullAngle) * a.speed;
          const vBx = Math.cos(b.hullAngle) * b.speed, vBy = Math.sin(b.hullAngle) * b.speed;
          let bestScore = -Infinity;
          for(const c of tie){
            const score = (vBx - vAx) * c.ux + (vBy - vAy) * c.uy;   // >0 = 沿该轴闭合逼近
            if(score > bestScore){ bestScore = score; best = c; }
          }
          if(bestScore <= 0) best = tie[0];   // 正在分离/纯切向：退回最小深度
        } else {
          best = tie[0];
        }
        const depth = best.depth;
        if(depth <= 0.05) continue;
        // 沿解析后的 MTV 等量分离（0.1px 缓冲防精度粘连）：A 沿 +u、B 沿 -u
        const separation = depth + 0.1;
        const pushX = best.ux * separation;
        const pushY = best.uy * separation;
        a.x += pushX * 0.5; a.y += pushY * 0.5;
        b.x -= pushX * 0.5; b.y -= pushY * 0.5;

        // 速度冲量（仅法向闭合分量；t.speed 为沿 hullAngle 的标量）：
        //   vA' = vA + j·u, vB' = vB − j·u，j = relN/2（完全非弹性，闭合速度一次清零）；
        //   切向分量原样保留；结果向量投影回各自车体轴得到新标量，不破坏方向。
        const vAx = Math.cos(a.hullAngle) * a.speed, vAy = Math.sin(a.hullAngle) * a.speed;
        const vBx = Math.cos(b.hullAngle) * b.speed, vBy = Math.sin(b.hullAngle) * b.speed;
        const relN = (vBx - vAx) * best.ux + (vBy - vAy) * best.uy;
        if(relN > 0){
          const j = relN * 0.5;
          a.speed = (vAx + best.ux * j) * Math.cos(a.hullAngle)
                  + (vAy + best.uy * j) * Math.sin(a.hullAngle);
          b.speed = (vBx - best.ux * j) * Math.cos(b.hullAngle)
                  + (vBy - best.uy * j) * Math.sin(b.hullAngle);
          const cap = t => (t.stats && t.stats.maxSpeed) ? t.stats.maxSpeed * RULES.speed.pxFactor * RULES.speed.effMul : 0;
          const capA = cap(a), capB = cap(b);
          if(capA > 0) a.speed = Math.max(-capA, Math.min(capA, a.speed));
          if(capB > 0) b.speed = Math.max(-capB, Math.min(capB, b.speed));
        }
        moved = true;
      }
    }
    if(!moved) break;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    entities,
    spawnTank,
    resetEntity,
    advanceTracks,
    isHostile,
    clamp,
    livingEnemiesOf,
    nearestEnemyTo,
    resolveTankCollisions
  };
}