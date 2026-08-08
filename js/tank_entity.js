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
  for(let it=0; it < (iterations||3); it++){
    let moved = false;
    for(let i=0;i<entities.length;i++){
      for(let j=i+1;j<entities.length;j++){
        const a = entities[i], b = entities[j];
        if(a.hp<=0 || b.hp<=0) continue;
        const cornersA = partCorners(a.x,a.y,a.hullAngle, a.hullLen/2, a.hullWid/2);
        const cornersB = partCorners(b.x,b.y,b.hullAngle, b.hullLen/2, b.hullWid/2);
        const mtv = obbMTV(cornersA, cornersB);
        if(mtv && mtv.depth > 0.1){
          // Add small EPSILON buffer (0.5px) along MTV to break sticking/vibration
          const buffer = 0.5;
          const pushX = mtv.dx + (mtv.dx > 0 ? buffer : -buffer);
          const pushY = mtv.dy + (mtv.dy > 0 ? buffer : -buffer);
          a.x -= pushX * 0.5; a.y -= pushY * 0.5;
          b.x += pushX * 0.5; b.y += pushY * 0.5;
          // Dampen collision relative speed
          if(a.speed) a.speed *= 0.8;
          if(b.speed) b.speed *= 0.8;
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