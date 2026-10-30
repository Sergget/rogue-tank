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
        // 2026-10-23（用户裁定「保留但修好」）：**分离（位置/速度解算）必须独立于存活状态**。
        //   旧实现在此直接 `if(a.hp<=0 || b.hp<=0) continue;` 跳过整对 —— 撞击伤害把某辆车
        //   打到 0 血之后，两车便不再被推开，实测「对向互顶残余深叠 48px / 中心距 15.97px」
        //   （test-tankcollision 两项失败）。物理上残骸仍占体积，必须继续分离。
        const aAlive = a.hp > 0, bAlive = b.hp > 0;
        if(!aAlive && !bAlive) continue;   // 两具残骸：不再结算（省算力，也避免残骸互相推挤抖动）
        if(a.isDrone || b.isDrone) continue;   // P-17：无人机无 hull 几何（hullAngle/hullLen/hullWid），跳过坦克碰撞（防 NaN 污染坐标）
        const cornersA = partCorners(a.x,a.y,a.hullAngle, a.hullLen/2, a.hullWid/2);
        const cornersB = partCorners(b.x,b.y,b.hullAngle, b.hullLen/2, b.hullWid/2);
        const candidates = obbMTVs(cornersA, cornersB);
        if(!candidates) continue;
        // 去重冗余候选轴：obbMTVs 可能返回方向相同 (u 平行) 的重复候选，
        // 留同方向里深度最小者即可——重复轴会污染 tie-break 的"近最小深度"集合，
        // 导致浅穿透轴被错误排除（交叉擦碰残余穿模 #A19 的根源之一）。
        const seenDirs = new Set();
        const uniqCandidates = [];
        for(const c of candidates){
          // 用方向键去重（u 与 -u 视为同轴；本约定下 u 恒指向 A 一侧，不会出现 -u）
          const key = (c.ux >= 0 ? c.ux : -c.ux).toFixed(6) + ',' + (c.uy >= 0 ? c.uy : -c.uy).toFixed(6);
          if(seenDirs.has(key)) continue;
          seenDirs.add(key);
          uniqCandidates.push(c);
        }
        // 稳定选轴：先按最小深度定基准，再在近基准轴里用"相对速度投影"决胜。
        // 注意 u=(ux,uy) 约定：从 B 质心指向 A 质心（推 A 远离 B 的方向，与掩体 obbMTV 一致）
        let minD = Infinity;
        for(const c of uniqCandidates) if(c.depth < minD) minD = c.depth;
        let best = uniqCandidates[0];
        const tie = uniqCandidates.filter(c => c.depth <= minD * 1.15);
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
        // #A19：阈值从 0.05 降到 1e-6——任何正深度都必须推出。旧阈值会跳过交叉擦碰时
        // 仅 ~0.03px 的浅穿透轴，B 车得以沿另一轴持续深入 A 车（残余重叠可达 18.7px）。
        // 0.1px 分离缓冲本身已防止精度粘连，无需再靠深度阈值兜底。
        if(depth <= 1e-6) continue;
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
        
        // ======================= 撞击伤害与状态结算（Ramming Damage Settlement） =======================
        // 2026-10-23（用户裁定「保留但修好」）：本块只做 **HP 结算 + 硬直计时**，
        //   绝不改写 a.speed/b.speed —— 下方非弹性冲量分离需要完整闭合速度才能把两车推开；
        //   旧实现这里 `speed *= 0.2`（急停）把分离力也一起打掉，实测导致
        //   「对向互顶后残余深叠 48px / 中心距 15.97px」（test-tankcollision 两项失败）。
        //   硬直语义改由 stiffTimer 表达（驱动层消费），不靠瞬时压速。
        // 2026-10-30 用户裁定「玩家与友军会有碰撞伤害，需要移除」：同阵营撞击
        //   （player↔ally / ally↔ally）**只推不伤**——跳过下方伤害与硬直结算；
        //   上方的位置分离与非弹性冲量照旧（物理语义不变）。敌对撞击原样。
        if (relN >= (RULES.ramming ? RULES.ramming.minVelThreshold : 90) && aAlive && bAlive && isHostile(a.team, b.team)) {
          // 接触去重：同一对车在同一次接触中只结算一次（分离解算每帧跑 4 次迭代、
          //   且持续互顶会连续多帧命中 ⇒ 不去重会一帧内重复扣血数次，实测数帧即可把
          //   100HP 打空）。冷却时长取 RULES.ramming.contactCooldown（缺省 0.5s）。
          // #P1 / I0（2026-10-24）：接触冷却改读模拟时钟，回放可复现。
          const nowMs = (typeof simNow === 'function') ? simNow()
            : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
          const pairKey = String(a.id) + '|' + String(b.id);
          const last = (a._ramHitAt && a._ramHitAt[pairKey]) || 0;
          const cdMs = ((RULES.ramming && RULES.ramming.contactCooldown) || 0.5) * 1000;
          if (nowMs - last < cdMs) { /* 冷却内不重复结算 */ } else {
            if (!a._ramHitAt) a._ramHitAt = {};
            a._ramHitAt[pairKey] = nowMs;
            const cfg = RULES.ramming || { damageScale: 0.038, hpRatioThreshold: 0.25, energyRatioThreshold: 0.15, massAdvantageRatio: 1.2, stiffDurationBase: 2.0 };
            const massA = (a.stats && a.stats.weight) || 40;
            const massB = (b.stats && b.stats.weight) || 40;
            const reducedMass = (massA * massB) / (massA + massB);
            const kineticEnergy = 0.5 * reducedMass * relN * relN * 0.001; // 折合动能 (kJ 级)

            // 局部装甲折减（取双方迎击部位基础装甲或默认值）
            const armorA = (a.defaultArmor && a.defaultArmor.front) || 110;
            const armorB = (b.defaultArmor && b.defaultArmor.front) || 110;

            // 双方各自受到的动能钝击伤害
            const dmgA = Math.max(1, Math.round(kineticEnergy * cfg.damageScale * (massB / (massA + massB)) * (100 / armorA)));
            const dmgB = Math.max(1, Math.round(kineticEnergy * cfg.damageScale * (massA / (massA + massB)) * (100 / armorB)));

            // 扣减 HP
            a.hp = Math.max(0, a.hp - dmgA);
            b.hp = Math.max(0, b.hp - dmgB);

            // 硬直判定（双轨条件：伤害 ≥ 上限×hpRatioThreshold 且 动能 ≥ 上限×energyRatioThreshold）。
            // 注意：maxHp 读 maxHp（旧实现错读 stats.hp，恒 undefined → 回退 100，判定失真）。
            const maxHpA = (a.stats && a.stats.maxHp) || a.maxHp || 100;
            const maxHpB = (b.stats && b.stats.maxHp) || b.maxHp || 100;

            if (dmgA >= maxHpA * cfg.hpRatioThreshold && kineticEnergy >= maxHpA * cfg.energyRatioThreshold) {
              a.stiffTimer = Math.max(a.stiffTimer || 0, cfg.stiffDurationBase);
            }
            if (dmgB >= maxHpB * cfg.hpRatioThreshold && kineticEnergy >= maxHpB * cfg.energyRatioThreshold) {
              b.stiffTimer = Math.max(b.stiffTimer || 0, cfg.stiffDurationBase);
            }
          }
        }
        // ===============================================================================================

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