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
function resolveTankCollisions(iterations){
  for(let it=0; it < (iterations||4); it++){
    let moved = false;
    for(let i=0;i<entities.length;i++){
      for(let j=i+1;j<entities.length;j++){
        const a = entities[i], b = entities[j];
        if(a.hp<=0 || b.hp<=0) continue;
        const cornersA = partCorners(a.x,a.y,a.hullAngle, a.hullLen/2, a.hullWid/2);
        const cornersB = partCorners(b.x,b.y,b.hullAngle, b.hullLen/2, b.hullWid/2);
        const mtv = obbMTV(cornersA, cornersB);
        if(mtv && mtv.depth > 0.05){
          const depth = mtv.depth;
          // Calculate true unit direction from MTV
          const mtvLen = Math.hypot(mtv.dx, mtv.dy);
          if (mtvLen < 1e-4) continue;
          const ux = mtv.dx / mtvLen;
          const uy = mtv.dy / mtvLen;
          
          // Separate them along the MTV. Add a tiny buffer (0.1px) to prevent precision sticking.
          const separation = depth + 0.1;
          const pushX = ux * separation;
          const pushY = uy * separation;
          
          a.x -= pushX * 0.5; a.y -= pushY * 0.5;
          b.x += pushX * 0.5; b.y += pushY * 0.5;
          
          // Dampen speed along the collision normal to prevent sticking and endless vibration
          // Project velocities onto collision normal (ux, uy)
          const velA_X = a.speed ? Math.cos(a.hullAngle) * a.speed : 0;
          const velA_Y = a.speed ? Math.sin(a.hullAngle) * a.speed : 0;
          const velB_X = b.speed ? Math.cos(b.hullAngle) * b.speed : 0;
          const velB_Y = b.speed ? Math.sin(b.hullAngle) * b.speed : 0;
          
          const relVelX = velA_X - velB_X;
          const relVelY = velA_Y - velB_Y;
          const normalVel = relVelX * ux + relVelY * uy;
          
          // If moving towards each other, subtract the relative speed component along normal
          if (normalVel > 0) {
            const impulse = normalVel * 0.5;
            if (a.speed) {
              const aNormalX = ux * impulse;
              const aNormalY = uy * impulse;
              const newA_X = velA_X - aNormalX;
              const newA_Y = velA_Y - aNormalY;
              a.speed = Math.hypot(newA_X, newA_Y) * (velA_X * newA_X + velA_Y * newA_Y > 0 ? 1 : -1) * 0.7;
            }
            if (b.speed) {
              const bNormalX = ux * impulse;
              const bNormalY = uy * impulse;
              const newB_X = velB_X + bNormalX;
              const newB_Y = velB_Y + bNormalY;
              b.speed = Math.hypot(newB_X, newB_Y) * (velB_X * newB_X + velB_Y * newB_Y > 0 ? 1 : -1) * 0.7;
            }
          } else {
            if(a.speed) a.speed *= 0.8;
            if(b.speed) b.speed *= 0.8;
          }
          moved = true;
        }
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