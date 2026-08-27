'use strict';

// 线段挂载模块（tank_designer「模块 Modules」编辑）：normalizeTankModules 由 tank_geometry.js
// 提供。浏览器端它是全局函数（geometry 先于 model 加载）；Node 测试端在下方 export 块内
// require tank_geometry.js 兜底赋值，保证 applyTankConfig 两侧行为一致。
let _normalizeTankModules = (typeof normalizeTankModules === 'function') ? normalizeTankModules : null;

// ---------- three-layer attribute system (base / modifiers / stats) ----------
// Combat code reads ONLY tank.stats. `tank.base` holds the untuned values; `tank.modifiers`
// (buffs/debuffs from cards, shop, skills) layer on top. Modifiers apply adds first, then mults.
function computeStats(base, modifiers){
  const s = {
    penetration: base.penetration,
    damage: base.damage,
    reload: base.reload,
    shellSpeed: base.shellSpeed || 1200,
    maxSpeed: base.maxSpeed,
    turnRate: base.turnRate,
    turretTurnRate: base.turretTurnRate,
    maxHp: base.maxHp,
    weight: base.weight,
    enginePower: base.enginePower,
    armor: (typeof structuredClone === 'function') ? structuredClone(base.armor) : JSON.parse(JSON.stringify(base.armor)),
    // 履带被击毁锁定时间（秒）；玩家侧可随升级缩短
    trackLock: base.trackLock !== undefined ? base.trackLock : RULES.modules.trackLockDefault,
    // 模块伤害倍率（玩家侧可随卡牌/技能升级增强；敌方固定倍率见 RULES.modules.ammo/crew.enemy）
    ammoMult: base.ammoMult !== undefined ? base.ammoMult : RULES.modules.ammo.player,
    crewMult: base.crewMult !== undefined ? base.crewMult : RULES.modules.crew.player,
    // 发动机起火 DOT：倍率/时长可随升级增强（默认 1）
    dotRatioMult: base.dotRatioMult !== undefined ? base.dotRatioMult : 1,
    dotDurationMult: base.dotDurationMult !== undefined ? base.dotDurationMult : 1,
    // 三扩系数（移动/转车体/转炮塔 三源散布统一倍率，默认 1）与缩圈速度（sigma 收缩速率，默认取 RULES.spread.shrinkRate）
    spreadMult: base.spreadMult !== undefined ? base.spreadMult : 1,
    // 独立运动三扩系数（D3 #A1/#A3 解耦，2026-08-26）：只缩放移动/转车体/转炮塔三个运动散布源。
    // 默认继承出厂 base.spreadMult（设计器「三扩系数」对标定底盘运动散布的既有调校保持不变）；
    // 解耦的是【运行期】通道——精密火控等 spreadMult 修饰器不再泄漏到运动散布，反之亦然。
    motionSpreadMul: base.motionSpreadMul !== undefined ? base.motionSpreadMul
      : (base.spreadMult !== undefined ? base.spreadMult : 1),
    aimSpeed: base.aimSpeed !== undefined ? base.aimSpeed : RULES.spread.shrinkRate
  };
  // pass 1: adds, pass 2: mults (so mult scales the accumulated add result).
  // mult 语义（2026-08-25 用户决定 #97）：同一 stat 的所有 mult 修饰器先【加法聚合】为
  // 单一乘子 1 + Σ(value_i − 1) 再应用一次（例：×1.2×1.2 → 1.4 而非 1.44；×0.85×0.85 → 0.70）。
  // 单条修饰器数学上不变（1+(v−1)=v）；多条聚合结果钳 ≥0 防负乘子（单条保留原值，行为不变）。
  // armor 路径按完整 stat 字符串分组聚合（armor.hull 与 armor.hull.front 属不同组），
  // 组间仍按首次出现顺序先后应用——整组与单面路径的组合语义与旧实现一致。
  for(const m of (modifiers||[])){
    if(m.mode !== 'add') continue;
    if(m.stat.startsWith('armor')){
      applyArmorMod(s.armor, m);
    } else if(s[m.stat] !== undefined){
      s[m.stat] += m.value;
    }
  }
  const multAgg = new Map();   // stat -> { mul, count }（Map 保持首次出现顺序）
  for(const m of (modifiers||[])){
    if(m.mode !== 'mult') continue;
    let e = multAgg.get(m.stat);
    if(!e){ e = { mul: 1, count: 0 }; multAgg.set(m.stat, e); }
    e.mul += m.value - 1;
    e.count++;
  }
  for(const [stat, e] of multAgg){
    const mul = e.count > 1 ? Math.max(0, e.mul) : e.mul;
    if(stat.startsWith('armor')){
      applyArmorMod(s.armor, { stat: stat, mode: 'mult', value: mul });
    } else if(s[stat] !== undefined){
      s[stat] *= mul;
    }
  }
  // D3 #A2 下限钳制（2026-08-26）：spreadMult 聚合完成后钳 ≥ RULES.spread.multFloor。
  // 姿态稳定（run shop add −0.15）等叠加曾使三扩系数穿越 0 变负 → motionSigma 负目标。
  // floor 作用在最终生效值上：负中间值不外泄，三源运动散布合成链语义不变。
  s.spreadMult = Math.max(s.spreadMult, RULES.spread.multFloor);
  // motionSpreadMul 同样钳 ≥ multFloor：与 spreadMult 同级下限，防叠加穿越 0 使运动源变负
  s.motionSpreadMul = Math.max(s.motionSpreadMul !== undefined ? s.motionSpreadMul : s.spreadMult, RULES.spread.multFloor);
  // 运行时重量硬上限（2026-08-26 用户裁定）：80t 只是设计器出厂上限（parameterLimits.weight.max），
  // 卡牌/局内升级可突破；但聚合后的最终 weight 一律钳 ≤ RULES.weightRuntimeCap（240t）。
  if (typeof RULES.weightRuntimeCap === 'number' && s.weight > RULES.weightRuntimeCap) {
    s.weight = RULES.weightRuntimeCap;
  }
  // derived mobility: forward acceleration (px/s^2) from horsepower per tonne scaled to game units.
  // derived AFTER modifier loop so cards/upgrades modifying enginePower or weight affect actual accel/brake.
  const effPower = typeof s.enginePower === 'number' ? s.enginePower : base.enginePower;
  const effWeight = typeof s.weight === 'number' && s.weight > 0 ? s.weight : base.weight;
  s.accel = (effPower / effWeight) * ACCEL_POWER_TO_PX_SCALE;
  s.brake = s.accel * BRAKE_FACTOR;

  // ======================= 真实世界单位标定字段 =======================
  // 基于 RULES.scale (以 Tiger I 为基准) 计算真实单位数值
  // 注意：hullLengthM 和 barrelLengthM 需要 tank 实例的几何数据，在 applyTankConfig 中补全
  const scale = RULES.scale;
  const pxPerMeter = scale.PX_PER_METER;

  // 极速 km/h：maxSpeed(px/s) × RULES.speed.kmhFactor（2026-08-25 统一换算：
  // 与 tankKmh 同源同值，废除旧 PX_PER_METER×3.6 双轨标定）
  s.maxSpeedKmh = Math.round(s.maxSpeed * RULES.speed.kmhFactor);

  // 弹速 m/s：shellSpeed(px/s) / pxPerMeter
  s.shellSpeedMs = Math.round(s.shellSpeed / pxPerMeter);

  // 占位，applyTankConfig 后会根据 tank.hullLen 和 tank.barrel.len 补全
  s.hullLengthM = 0;
  s.barrelLengthM = 0;

  return s;
}

// ---------- #A16 敌军能力封顶/地板 → mult 系数换算（纯函数，双端可 Node 测试） ----------
// applyDifficultyMults 原以直写 t.stats.* 对敌人能力封顶/抬升，绕过 modifiers 三层结构，
// 任何后续 addModifier/refreshStats 会把直写值抹回未封顶。本函数把「相对玩家的目标绝对值」
// 换算成「相对 t.base.X 的 mode:'mult' 系数」，交由调用方经 addModifier 注入（scope 'run'、
// source 'difficulty-cap'），与 spawn 时先行的 entityMults（source 'difficulty'）加法聚合兼容。
//
// 关键换算（2026-08-27 #A16）：computeStats 对同一 stat 的多条 mult 加法聚合为 1+Σ(v_i−1)，
// 故注入系数不能简单取 target/base（会与 entityMults 相乘而非替换）。正确公式以「当前生效值
// t.stats.X」为基准算差量：
//     mul = (target − t.stats.X) / t.base.X + 1
// 注入后聚合乘数多出 (mul−1)，final = t.stats.X + t.base.X·(mul−1) = target —— 与旧直写「把
// stats.X 设为 target」逐值等价，且不依赖 base 之外的其他修饰器。
//
// 入参 t：敌人坦克（含 .base 与 .stats，stats 已含先行 entityMults）；
//   opts.player：玩家坦克（读 .stats）；opts.strongest：最强弹种终伤（mvp 由 computeAmmoConfig
//   预计算传入，避免本文件倒序依赖 tank_cards）；opts.diffNorm：归一难度 0~1；opts.randFactor：
//   每辆车独立随机浮动（0.85~1.15，运行期随机非 RNG 流，mvp 用 Math.random 生成）。
// 返回「需要注入的 mult 字典」：只在真正要封顶/抬升时才出现对应键（penMul | dmgFloorMul |
// dmgCapMul | speedMul），无关键不存在——调用方据此遍历 addModifier，避免无谓注入。
function difficultyCapMuls(t, opts){
  const out = {};
  const D = (typeof RULES !== 'undefined' && RULES.difficulty) || {};
  opts = opts || {};
  const player = opts.player;
  if(!t || !t.base || !t.stats || !player || !player.stats) return out;

  // 穿深封顶：penCap = player.penetration × penCapVsPlayer；仅当当前生效值超限才压
  if(typeof t.stats.penetration === 'number' && typeof player.stats.penetration === 'number'
     && typeof t.base.penetration === 'number' && t.base.penetration > 0){
    const penCap = player.stats.penetration * (D.penCapVsPlayer !== undefined ? D.penCapVsPlayer : 1.2);
    if(t.stats.penetration > penCap){
      out.penMul = (penCap - t.stats.penetration) / t.base.penetration + 1;
    }
  }
  // 伤害地板/天花板（天花板 = 最强弹种终伤 × dmgCapAmmoMult）。floor < cap 恒成立（强弹种
  // dmg ≥ 玩家 dmg），故二选一注入：低于地板抬升、高于天花板压制，中间不动。
  if(typeof t.stats.damage === 'number' && typeof player.stats.damage === 'number'
     && typeof t.base.damage === 'number' && t.base.damage > 0){
    const floor = player.stats.damage * (D.dmgFloorVsPlayer !== undefined ? D.dmgFloorVsPlayer : 0.4);
    const strongest = typeof opts.strongest === 'number' ? opts.strongest : 0;
    const cap = strongest > 0 ? strongest * (D.dmgCapAmmoMult !== undefined ? D.dmgCapAmmoMult : 0.7) : Infinity;
    if(t.stats.damage < floor){
      out.dmgFloorMul = (floor - t.stats.damage) / t.base.damage + 1;
    } else if(t.stats.damage > cap){
      out.dmgCapMul = (cap - t.stats.damage) / t.base.damage + 1;
    }
  }
  // ★速度：targetSpeed = lerp(baseFloor, baseCeil, diffNorm) × randFactor × player.maxSpeed。
  // 旧实现直写 t.stats.maxSpeed（完全覆盖 entityMults.maxSpeed）；注入差量系数后同样逐值等价。
  if(typeof t.stats.maxSpeed === 'number' && typeof player.stats.maxSpeed === 'number' && player.stats.maxSpeed > 0
     && typeof t.base.maxSpeed === 'number' && t.base.maxSpeed > 0){
    const SV = D.speedVsPlayer || { baseFloor: 0.3, baseCeil: 0.6, randMin: 0.85, randMax: 1.15 };
    const diffNorm = typeof opts.diffNorm === 'number' ? Math.max(0, Math.min(1, opts.diffNorm)) : 0;
    const randFactor = typeof opts.randFactor === 'number' ? opts.randFactor : 1;
    const speedFactor = SV.baseFloor + (SV.baseCeil - SV.baseFloor) * diffNorm;
    const targetSpeed = speedFactor * randFactor * player.stats.maxSpeed;
    out.speedMul = (targetSpeed - t.stats.maxSpeed) / t.base.maxSpeed + 1;
  }
  return out;
}

// armor modifiers use paths like "armor.hull.front", "armor.hull", "armor.turret.side"
function applyArmorMod(armor, m){
  const parts = m.stat.split('.');
  const group = armor[parts[1]];
  if(!group) return;
  if(parts[2]){
    if(group[parts[2]] !== undefined){
      group[parts[2]] = m.mode==='add' ? group[parts[2]]+m.value : group[parts[2]]*m.value;
    }
  } else {
    for(const k in group){
      group[k] = m.mode==='add' ? group[k]+m.value : group[k]*m.value;
    }
  }
}

// 修饰器生命周期分类（P-12 / §5.1 / §6 条目 9）：
//   scope = 'permanent'（默认，局外永久升级）| 'run'（单局，run 结束清除）| 'timed'（限时，expiresAt 到期剪除）
// 叠层规则：同名修饰器由 source 区分（卡牌 `card:<id>` + maxStacks、Boss 阶段 `boss-stage:<id>` 切换时移除）；
// 先加后乘由 computeStats 两遍扫描保证（见 §5.1）。
function addModifier(tank, mod){
  const scope = mod.scope || (mod.expiresAt !== undefined && mod.expiresAt !== Infinity ? 'timed' : 'permanent');
  tank.modifiers.push({
    stat: mod.stat, mode: mod.mode || 'add', value: mod.value,
    source: mod.source || 'generic',
    scope: scope,
    expiresAt: mod.expiresAt !== undefined ? mod.expiresAt : Infinity
  });
  refreshStats(tank);
  return tank.stats;
}

function addTimedModifier(tank, mod, durationMs){
  return addModifier(tank, Object.assign({}, mod, { scope: 'timed', expiresAt: Date.now()+durationMs }));
}

function removeModifierBySource(tank, source){
  tank.modifiers = tank.modifiers.filter(m => m.source !== source);
  refreshStats(tank);
  return tank.stats;
}

// 按生命周期 scope 批量移除（run 结束清除单局修饰器；M10 局外永久升级用 permanent）
function removeModifiersByScope(tank, scope){
  tank.modifiers = tank.modifiers.filter(m => m.scope !== scope);
  refreshStats(tank);
  return tank.stats;
}

// 单局结束（gameover / 全链通关回 map）时清除 run 修饰器（卡牌、Boss 阶段、局内临时 buff）
function removeRunModifiers(tank){
  return removeModifiersByScope(tank, 'run');
}

function refreshStats(tank){
  const now = Date.now();
  if(tank.modifiers.some(m => m.expiresAt !== Infinity && m.expiresAt <= now)){
    tank.modifiers = tank.modifiers.filter(m => m.expiresAt === Infinity || m.expiresAt > now);
  }
  // #A12：maxHp 变化的 hp 同步放在 refreshStats 收口处（而非 addModifier 内）——
  // addModifier/addTimedModifier/removeModifierBySource/removeModifiersByScope/卡牌批量注入
  // 全部经此处收敛，多 modifier 叠加只按累计差量抬升一次，不会重复加血。
  const prevMaxHp = (tank.stats && typeof tank.stats.maxHp === 'number') ? tank.stats.maxHp : null;
  tank.stats = computeStats(tank.base, tank.modifiers);
  if(prevMaxHp !== null && typeof tank.hp === 'number' && tank.stats.maxHp !== prevMaxHp){
    const dHp = tank.stats.maxHp - prevMaxHp;
    if(dHp > 0){
      // 上限提升：当前 hp 按增量同步抬升（钳新上限），spawn 快照同步为满血，
      // 防下一节点 resetEntity 把 hp 恢复到不含加成的旧 maxHp。
      tank.hp = Math.min(tank.stats.maxHp, tank.hp + dHp);
      if(tank.spawn) tank.spawn.hp = tank.stats.maxHp;
    } else {
      // 上限回落（移除修饰器/限时到期）：仅钳制，不主动扣血。
      tank.hp = Math.min(tank.hp, tank.stats.maxHp);
    }
  }
  return tank.stats;
}

function makeTank(opts){
  const tank = Object.assign({
    id:null, team:'enemy', // 'player' | 'ally' | 'enemy'
    x:0,y:0,hullAngle:0,turretAngle:0,
    hullLen:64, hullWid:38,
    turLen:34, turWid:36,
    speed:0,
    hasTurret:true,              // legacy field kept for backward compat; new specs omit it
    traverseLimit: Math.PI,      // 180° = full 360° rotation by default; < π → limited traverse
    reloadT:0,
    immobT:0, fireDebuffT:0, dotT:0, dotDps:0, dotSeconds:0,
    fireT:0,                         // 起火燃烧视觉时间（秒）
    trackBroken:false,               // 履带被击断（视觉用）
    ammoBlew:false, _blowFx:false,   // 弹药架殉爆状态 + 视觉已生成标记
    debuffs:{},                      // 模块 debuff（8s 计时）：gunner/loader/driver/engine/commander/ammo
    heightClass:'medium',
    color:'#7ed957',
    texture:'none',                  // 表面纹理叠层（TEXTURE_DEFS 键：none/armor_plate/weld_seam/rust/camo）
    trackPhase:0,
    attachments: [],
    anchors: {
      hull_top: { dx: 0, dy: 0 },
      hull_front: { dx: 32, dy: 0 },
      hull_rear: { dx: -32, dy: 0 },
      turret_top: { dx: 0, dy: 0 },
      gun_root: { dx: 17, dy: 0 }
    },
    base: {
      maxSpeed: 120, turnRate: 2.0, turretTurnRate: 2.2,
      penetration: 120, damage: 34, reload: 1.3, shellSpeed: 1200,
      maxHp: 100,
      weight: 300, enginePower: 900,
      armor: { hull:{front:110,side:38,rear:26}, turret:{front:140,side:50,rear:24} },
      trackLock: RULES.modules.trackLockDefault,
      ammoMult: RULES.modules.ammo.player,
      crewMult: RULES.modules.crew.player,
      dotRatioMult: 1,
      dotDurationMult: 1
    },
    modifiers: [],
    modules: null,                  // 线段挂载模块（设计器导出；null/无字段 = 旧数据，走 zones 退化）
    sigma:0, prevHullAngle:0, prevTurretAngle:0
  }, opts);

  const base = tank.base = Object.assign({}, tank.base);
  const dflt = { maxSpeed:120, turnRate:2.0, turretTurnRate:2.2, penetration:120, damage:34, reload:1.3, shellSpeed:1200, maxHp:100, weight:300, enginePower:900 };
  for(const k in dflt) if(base[k] === undefined) base[k] = dflt[k];
  if(!base.armor) base.armor = { hull:{front:110,side:38,rear:26}, turret:{front:140,side:50,rear:24} };
  tank.modifiers = tank.modifiers || [];
  refreshStats(tank);
  tank.hp = tank.stats.maxHp;
  tank.maxHp = tank.stats.maxHp;
  tank.color = teamColor(tank);
  if (opts.traverseLimitInDeg !== undefined) {
    tank.traverseLimit = opts.traverseLimitInDeg * Math.PI / 180;
  }
  return tank;
}

const SPEED_KMH_FACTOR = RULES.speed.kmhFactor;      // maxSpeed(px/s) × kmhFactor = km/h（与 computeStats.maxSpeedKmh 同源）
const SPEED_PX_FACTOR  = RULES.speed.pxFactor;
// convert horsepower-per-tonne into game px/s^2 acceleration; these two set the accel feel.
// For responsive roguelike action, responsiveness is high (accel x180 scale, quick brake x3.5).
const ACCEL_POWER_TO_PX_SCALE = RULES.speed.accelPowerToPxScale;
const BRAKE_FACTOR = RULES.speed.brakeFactor;
function tankKmh(t){ return Math.round((t.stats?.maxSpeed ?? t.maxSpeed) * SPEED_KMH_FACTOR); }

const TEAM_COLORS = { player: '#5c8cff', ally: '#7ed957', enemy: '#ff8a8a' };
function teamColor(t){ return TEAM_COLORS[t.team] || TEAM_COLORS.enemy; }

function applyTankConfig(tank, spec){
  if (!spec) return;
  if (spec.hasTurret !== undefined) tank.hasTurret = spec.hasTurret; // legacy entries only
  if (spec.traverseLimit !== undefined) tank.traverseLimit = spec.traverseLimit * Math.PI / 180;
  const b = tank.base;
  
  // Table-driven field copies to reduce boilerplate
  const baseFields = [
    'maxSpeed', 'turnRate', 'turretTurnRate', 'enginePower', 'weight',
    'penetration', 'damage', 'reload', 'shellSpeed',
    'trackLock', 'ammoMult', 'crewMult', 'spreadMult', 'motionSpreadMul', 'aimSpeed'
  ];
  for (const f of baseFields) {
    if (spec[f] !== undefined) b[f] = spec[f];
  }
  if (spec.hp !== undefined) b.maxHp = spec.hp;
  if (spec.maxHp !== undefined) b.maxHp = spec.maxHp;

  const instanceFields = ['heightClass', 'trackWidth', 'trackOffset', 'texture'];
  for (const f of instanceFields) {
    if (spec[f] !== undefined) tank[f] = spec[f];
  }

  if (spec.anchors !== undefined) Object.assign(tank.anchors, spec.anchors);
  if (spec.barrel){
    // normalize: shared normalizeBarrel from tank_halfgeom.js (loaded on all pages)
    tank.barrel = normalizeBarrel(spec.barrel);
  }
  if (spec.armor !== undefined){
    tank.customArmor = spec.armor;
    if (!b.armor) b.armor = {};
    if (spec.armor.hull){ if(!b.armor.hull) b.armor.hull = {}; Object.assign(b.armor.hull, spec.armor.hull); }
    if (spec.armor.turret){ if(!b.armor.turret) b.armor.turret = {}; Object.assign(b.armor.turret, spec.armor.turret); }
  }

  if (spec.hull) {
    if (spec.hull.verts && spec.hull.faces) {
      let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
      for (const [vx, vy] of spec.hull.verts) {
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy;
        if (vy > maxY) maxY = vy;
      }
      const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
      tank.hullSpec = { verts: spec.hull.verts.map(([vx,vy])=>[vx-cx, vy-cy]), faces: spec.hull.faces };
      tank.hullLen = maxX - minX;
      tank.hullWid = maxY - minY;
    }
    if (spec.hull.armor) {
      if (!b.armor) b.armor = {};
      if (!b.armor.hull) b.armor.hull = {};
      Object.assign(b.armor.hull, spec.hull.armor);
    }
  }

  // Turret geometry has TWO independent settings (issue #1):
  //   - `turret.axis`  {dx,dy} — the turret's OWN rotation point inside the turret's authored local
  //     frame. The hull-side `turret.pivot` then anchors that axis onto the hull. This decouples
  //     "炮塔自身的旋转中心" from "绕车体的旋转中心".
  //   - To keep every downstream consumer (raycast/draw/barrel/fx) working on the invariant
  //     "turret local origin (0,0) IS the rotation axis", the verts are normalized here: axis is
  //     translated to the origin. Hand-authored data whose (0,0) drifted to the tail no longer
  //     silently spins the turret around the tail (炮塔旋转轴漂移/落在炮塔尾部的根因)。
  if (spec.turret && spec.turret.verts && spec.turret.faces) {
    const axis = (spec.turret && spec.turret.axis) || null;
    const ax = (axis && axis.dx) || 0;
    const ay = (axis && axis.dy) || 0;
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const [vx, vy] of spec.turret.verts) {
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vy < minY) minY = vy;
      if (vy > maxY) maxY = vy;
    }
    tank.turretSpec = { verts: spec.turret.verts.map(([vx,vy])=>[vx - ax, vy - ay]), faces: spec.turret.faces };
    tank.turLen = Math.max(1, maxX - minX);
    tank.turWid = Math.max(1, maxY - minY);
    tank.turretAxis = { dx: ax, dy: ay };   // recorded for rollout/inspection; already applied above
  }
  if (spec.turret && spec.turret.pivot) {
    tank.turretPivotOffset = spec.turret.pivot;
  }
  if (spec.turret && spec.turret.armor) {
    if (!b.armor) b.armor = {};
    if (!b.armor.turret) b.armor.turret = {};
    Object.assign(b.armor.turret, spec.turret.armor);
  }

  // 线段挂载模块：仅当 spec.modules 存在才写（旧数据无字段 → 保持 makeTank 的 null，
  // moduleFromHit 走 zones 退化路径）
  if (spec.modules){
    tank.modules = (typeof _normalizeTankModules === 'function') ? _normalizeTankModules(spec.modules) : null;
  }

  refreshStats(tank);
  tank.hp = tank.stats.maxHp;
  tank.maxHp = tank.stats.maxHp;

  // 真实世界单位标定：补全车体长度和炮管长度（米）
  const scale = RULES.scale;
  const pxPerMeter = scale.PX_PER_METER;
  if (tank.hullLen && tank.hullLen > 0) {
    tank.stats.hullLengthM = Math.round((tank.hullLen / pxPerMeter) * 100) / 100; // 保留两位小数
  }
  if (tank.barrel && tank.barrel.len && tank.barrel.len > 0) {
    tank.stats.barrelLengthM = Math.round((tank.barrel.len / pxPerMeter) * 100) / 100;
  }
  if (tank.spawn) tank.spawn.hp = tank.stats.maxHp;
}

// ---------- P-49 派生重量（纯函数，双端可用） ----------
// 设计裁定（2026-08-26）：weight 一律按装甲几何派生，不允许自定义。本函数是唯一派生源，
// 作为设计器保存校验与显示的数据源；computeStats 不受影响（weight 仍读 base/stats）。
//
// 公式：weight(t) = 底盘基数 + Σ(车体各边长px × 该边厚度mm × 车体系数) + Σ(炮塔各边长px × 厚度mm × 炮塔系数)
//       = 28 + (车体Σ(px·mm) × 0.82 + 炮塔Σ(px·mm) × 1.5) / 1000
// 单位映射：内部数值即"吨"（tiger-I 存 57、Obj780 存 55、Leapard_1 存 42——与真实吨位一致；
// 比对器/设计器按原值显示为 t，无换算系数）。makeTank 默认 weight:300 是 legacy 占位尺度
// （dummy.json 同源），非物理值；deriveWeight(dummy) ≈ 44t 才是其几何对应的物理重量。
// 系数标定：对 tiger-I/Obj780/Leapard_1 三元方程组求解后圆整（底盘基数吸收动力总成/悬挂/
// 炮管/乘员等非装甲质量），三车派生偏差均 <±1%（见 scripts/test-weight.js）。
const DERIVE_WEIGHT_BASE_T = 28;             // 底盘基数（吨）：动力/悬挂/火炮等非装甲固定质量
const DERIVE_WEIGHT_HULL_KG_PER_PXMM = 0.82; // 车体每 px·mm 的千克数（标定见上）
const DERIVE_WEIGHT_TUR_KG_PER_PXMM = 1.5;   // 炮塔每 px·mm 的千克数（炮塔铸造件密度更高 → 系数更大）

// 多边形逐边长度按 faces 标签分组求和（闭合环）
function polyPerimeterByFace(verts, faces){
  const sums = {};
  const n = verts.length;
  for(let i = 0; i < n; i++){
    const a = verts[i], b = verts[(i+1)%n];
    const len = Math.hypot(b[0]-a[0], b[1]-a[1]);
    const face = (faces && faces[i]) ? faces[i] : 'side';
    sums[face] = (sums[face] || 0) + len;
  }
  return sums;
}

// 解析某部件（hull/turret）的逐面厚度：spec.armor.<part> 与 spec.<part>.armor 合并，
// 缺面回退 RULES.defaultArmor（旧数据无显式厚度时的单一事实源）。
function resolvePartArmor(spec, part){
  const dflt = (typeof RULES !== 'undefined' && RULES.defaultArmor && RULES.defaultArmor[part])
    ? RULES.defaultArmor[part] : { front: 110, side: 40, rear: 25 };
  const out = Object.assign({}, dflt);
  if(spec.armor && spec.armor[part]) Object.assign(out, spec.armor[part]);
  if(spec[part] && spec[part].armor) Object.assign(out, spec[part].armor);
  return out;
}

// 部件 Σ(边长px × 厚度mm)，单位 px·mm
function partPxMm(verts, faces, armor){
  const byFace = polyPerimeterByFace(verts, faces);
  let sum = 0;
  for(const face in byFace){
    const t = typeof armor[face] === 'number' ? armor[face]
            : (armor.side !== undefined ? armor.side : 40);   // 未标注面按侧厚兜底
    sum += byFace[face] * t;
  }
  return sum;
}

function deriveWeight(spec){
  if(!spec) return DERIVE_WEIGHT_BASE_T;
  let hullPxmm = 0, turPxmm = 0;
  if(spec.hull && Array.isArray(spec.hull.verts)){
    hullPxmm = partPxMm(spec.hull.verts, spec.hull.faces, resolvePartArmor(spec, 'hull'));
  }
  if(spec.turret && Array.isArray(spec.turret.verts)){
    turPxmm = partPxMm(spec.turret.verts, spec.turret.faces, resolvePartArmor(spec, 'turret'));
  }
  // 底盘基数 + 车体装甲质量 + 炮塔装甲质量（px·mm × kg/(px·mm) ÷ 1000 → 吨）
  return DERIVE_WEIGHT_BASE_T
       + (DERIVE_WEIGHT_HULL_KG_PER_PXMM * hullPxmm + DERIVE_WEIGHT_TUR_KG_PER_PXMM * turPxmm) / 1000;
}

// P-49 重量上限判定：返回派生值 + 上限判定 + 区间钳制结果（设计器批次消费入口）。
// 上限来自 RULES.parameterLimits.weight（当前 80t，用户暂定值）。
function weightLimitInfo(spec){
  const lim = (typeof RULES !== 'undefined' && RULES.parameterLimits && RULES.parameterLimits.weight)
    ? RULES.parameterLimits.weight : { min: 10, max: 80 };
  const derived = deriveWeight(spec);
  return {
    derived,                                  // 派生重量（吨）
    min: lim.min, max: lim.max,               // 允许区间（吨）
    ok: derived <= lim.max && derived >= lim.min,  // 是否在区间内（超上限 → 设计器禁用增量）
    clamped: Math.min(Math.max(derived, lim.min), lim.max) // 钳到允许区间后的显示值
  };
}


const SPREAD = {
  base: 0.018, moveMax: 0.014, hullRotMax: 0.012, turretRotMax: 0.018, fireDebuff: 0.02, bloomRate: 2.0, shrinkRate: 0.15,
  worstCase(){ return this.base + this.moveMax + this.hullRotMax + this.turretRotMax + this.fireDebuff; }
};
if (typeof RULES !== 'undefined' && RULES.spread) {
  Object.assign(SPREAD, RULES.spread);
}

function motionSigma(t, dt, keys){
  if(dt<=0) return SPREAD.base;
  const hullRate  = Math.abs(norm(t.hullAngle - t.prevHullAngle + Math.PI) - Math.PI) / dt;
  const turRate   = Math.abs(norm(t.turretAngle - t.prevTurretAngle + Math.PI) - Math.PI) / dt;
  let speed = 0;
  if(t.id==='player' && keys){
    speed = (keys['w']||keys['s']) ? t.stats.maxSpeed : 0;
  }
  // 炮手受伤（gunner debuff）→ 移动扩圈加倍；运动三源统一缩放系数优先消费独立键 stats.motionSpreadMul
  // （D3 #A1/#A3 解耦：steady_mount 只作用于运动散布、不影响精度基准 spreadMult）；
  // 向后兼容：旧运行时快照无 motionSpreadMul 键时回退 spreadMult。
  const stK = t.stats || {};
  const mK = stK.motionSpreadMul !== undefined ? stK.motionSpreadMul
    : (stK.spreadMult !== undefined ? stK.spreadMult : 1);
  let sMove = SPREAD.moveMax    * Math.min(1, speed / t.stats.maxSpeed) * debuffSpread(t) * mK;
  const sHull = SPREAD.hullRotMax * Math.min(1, hullRate / t.stats.turnRate) * mK;
  const sTur  = SPREAD.turretRotMax * Math.min(1, turRate / t.stats.turretTurnRate) * mK;
  let base = SPREAD.base + (t.fireDebuffT>0 ? SPREAD.fireDebuff : 0);
  // D3 #A2：最终生效 σ 下限（RULES.spread.sigmaFloor）——floor 作用在合成结果上，负中间值不允许外泄
  return Math.max(base + sMove + sHull + sTur, SPREAD.sigmaFloor);
}

function updateSigma(t, dt, keys){
  const target = motionSigma(t, dt, keys);
  const debuffBase = SPREAD.base + (t.fireDebuffT>0 ? SPREAD.fireDebuff : 0);
  // 缩圈速度支持坦克级覆盖（stats.aimSpeed），默认走 RULES.spread.shrinkRate
  const shrinkK = (t.stats && t.stats.aimSpeed > 0) ? t.stats.aimSpeed : SPREAD.shrinkRate;
  if(target > t.sigma){
    t.sigma += Math.min(target - t.sigma, SPREAD.bloomRate * dt);
  } else {
    t.sigma -= Math.min(t.sigma - Math.max(target, debuffBase), shrinkK * dt);
    if(t.sigma < debuffBase) t.sigma = debuffBase;
  }
}

// ---------- 模块 debuff（特性3）：8s 瞬时状态 + 属性消费 ----------
// 命中弹药架/乘员/发动机后在本体上打 buff。debuffs[key] 存剩余秒数，>0 即生效。
// 数值全部来自 RULES.modules（倍率 / 时长 / 分区）。玩家侧倍率可经 stats 升级（ammoMult/crewMult）。
const DB = RULES.modules;

// 模块中文标签（HUD/debug 显示用，集中定义避免各处复制）
const MODULE_LABELS = { gunner:'炮手', loader:'装填手', driver:'驾驶员', engine:'发动机', commander:'车长', ammo:'弹药架', breech:'炮闩' };
function moduleLabel(key){ return MODULE_LABELS[key] || key; }

function setDebuff(t, key, seconds){
  t.debuffs = t.debuffs || {};
  // 刷新时长、不叠加（决策：第二次命中刷新到 N 秒，不累加伤害加深）
  t.debuffs[key] = seconds || DB.debuffSeconds;
}
// 每帧对所有 debuff 统一倒扣，归零清除
function tickDebuffs(t, dt){
  if(!t.debuffs) return;
  for(const k in t.debuffs){
    t.debuffs[k] -= dt;
    if(t.debuffs[k] <= 0){ delete t.debuffs[k]; }
  }
}
// 取"成员/模块伤害"的实际倍率：玩家侧默认 ammo×2 / crew×1.2（stats 可升级），敌方固定 ammo×2 / crew×1.2
function moduleMult(shooter, modKey){
  const isPlayer = shooter && shooter.team === 'player';
  if(modKey === 'ammo'){
    if(!isPlayer) return DB.ammo.enemy;
    return (shooter && shooter.stats && typeof shooter.stats.ammoMult === 'number') ? shooter.stats.ammoMult : DB.ammo.player;
  }
  if(!isPlayer) return DB.crew.enemy;
  return (shooter && shooter.stats && typeof shooter.stats.crewMult === 'number') ? shooter.stats.crewMult : DB.crew.player;
}
// debuffSpread：炮手受伤 → 扩圈 ×spreadHurt；车长 → 全体 ×commanderDebuff
function debuffSpread(t){
  const d = t.debuffs || {};
  let mul = 1;
  if(d.gunner > 0) mul *= DB.rates.spreadHurt;
  if(d.commander > 0) mul *= DB.rates.commanderDebuff;
  return mul;
}
// debuffReloadRate：装填手/弹药架受伤 → 装填速度 ×0.6；车长 ×0.85
function debuffReloadRate(t){
  const d = t.debuffs || {};
  let mul = 1;
  if(d.loader > 0 || d.ammo > 0) mul *= DB.rates.reloadHurt;
  if(d.commander > 0) mul *= DB.rates.commanderDebuff;
  return mul;
}
// debuffTurnRate：驾驶员受伤 → 转向速度 ×0.6；车长 ×0.85
function debuffTurnRate(t){
  const d = t.debuffs || {};
  let mul = 1;
  if(d.driver > 0) mul *= DB.rates.turnHurt;
  if(d.commander > 0) mul *= DB.rates.commanderDebuff;
  return mul;
}
// debuffSpeed：发动机受伤 → 最大速度 ×0.6；车长 ×0.85
function debuffSpeedRate(t){
  const d = t.debuffs || {};
  let mul = 1;
  if(d.engine > 0) mul *= DB.rates.speedHurt;
  if(d.commander > 0) mul *= DB.rates.commanderDebuff;
  return mul;
}

// Export for Node.js if running in test environment
if (typeof module !== 'undefined' && module.exports) {
  // Node 测试端兜底：浏览器端 normalizeTankModules 是 tank_geometry.js 的全局函数，
  // Node 端模块作用域看不到全局，从 require 的 geometry 拿同一实现（保持单一来源）。
  try {
    const _geom = require('./tank_geometry.js');
    if (!_normalizeTankModules && _geom && typeof _geom.normalizeTankModules === 'function'){
      _normalizeTankModules = _geom.normalizeTankModules;
    }
  } catch(e){ /* geometry 未加载时保持 null（浏览器端不会走到这里） */ }
  module.exports = {
    computeStats,
    applyArmorMod,
    addModifier,
    addTimedModifier,
    removeModifierBySource,
    removeModifiersByScope,
    removeRunModifiers,
    refreshStats,
    makeTank,
    difficultyCapMuls,
    SPEED_KMH_FACTOR,
    SPEED_PX_FACTOR,
    tankKmh,
    TEAM_COLORS,
    teamColor,
    MODULE_LABELS,
    moduleLabel,
    applyTankConfig,
    deriveWeight,
    weightLimitInfo,
    DERIVE_WEIGHT_BASE_T,
    DERIVE_WEIGHT_HULL_KG_PER_PXMM,
    DERIVE_WEIGHT_TUR_KG_PER_PXMM,
    SPREAD,
    motionSigma,
    updateSigma,
    setDebuff,
    tickDebuffs,
    moduleMult,
    debuffSpread,
    debuffReloadRate,
    debuffTurnRate,
    debuffSpeedRate
  };
}
