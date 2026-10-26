'use strict';

// 线段挂载模块（tank_designer「模块 Modules」编辑）：normalizeTankModules 由 tank_geometry.js
// 提供。浏览器端它是全局函数（geometry 先于 model 加载）；Node 测试端在下方 export 块内
// require tank_geometry.js 兜底赋值，保证 applyTankConfig 两侧行为一致。
let _normalizeTankModules = (typeof normalizeTankModules === 'function') ? normalizeTankModules : null;
let _normalizeTankWeapons = (typeof normalizeTankWeapons === 'function') ? normalizeTankWeapons : null;

// ---------- three-layer attribute system (base / modifiers / stats) ----------
// Combat code reads ONLY tank.stats. `tank.base` holds the untuned values; `tank.modifiers`
// (buffs/debuffs from cards, shop, skills) layer on top. Modifiers apply adds first, then mults.
// 2026-09-15 W5：修饰聚合后的最终 stats 只对「用户明确裁定的运行时硬限」钳制，且仅当
// modifiers 非空（卡牌奖励/局内升级/难度系数通道）时生效——空 modifiers（出厂 base 直写、
// 纯计算/extreme 极值基准）不钳，保住纯数学语义。
// 硬限来源（用户裁定）：装填 reload ≥ 1.0s/发（parameterLimits.reload.min，2026-09-17 #C2 裁定
// 取代旧 0.5s；卡牌加速装填不得突破下限）；极速 maxSpeed ≤ 150km/h = 375px/s（parameterLimits.maxSpeed.max，卡牌不得超速）。
// #C2 同轮裁定（2026-09-17）：硬限只约束「参数通道」（卡牌奖励/局内升级/难度系数，scope
// run/permanent）——**timed 修饰器（超装填 ×0.45 等能力爆发通道）不钳**，其实际开火间隔可继续 <1s
//（与机炮 reloadMult 0.25 的武器通道同一语义：fireTank 在 stats.reload 之上的二次倍率不受参数下限）。
// 火控 spreadMult/motionSpreadMul 已是默认 1 且 clamp ≥ multFloor（0.5），无需重复钳制（见 computeStats
// spreadMult floor 既存钳制、crit 通道另有 [0,critBonusCap]）。
function applyParameterLimits(s, modifiers, base){
  if(!s || typeof s !== 'object') return;
  const hasMods = Array.isArray(modifiers) && modifiers.length > 0;
  if(!hasMods) return;
  // #C2（2026-09-17）：仅参数通道（run/permanent）触发硬限；纯 timed 修饰器（能力爆发）不钳
  const hasHardLimitChannel = modifiers.some(m => m && m.scope !== 'timed');
  if(!hasHardLimitChannel) return;
  const pL = (typeof RULES !== 'undefined' && RULES && RULES.parameterLimits) ? RULES.parameterLimits : null;
  if(!pL) return;
  // #W1（2026-10-19 用户反馈「超级装填没生效」）：硬限此前是对**聚合完毕的最终值**一刀切，
  //   而 timed 能力倍率（overdrive reload ×0.45）早已聚合进 s.reload ⇒ 只要玩家持有任意一张
  //   run/permanent 修饰器，能力爆发就被同一刀切掉（实测 1.3s → 恒 1.0s，只快 23% vs 设计 ×0.45）。
  //   这偏离了本函数上方注释与 docs/specs/combat.md §3 的既定口径：
  //     「硬限只约束参数通道；fireTank 在 stats.reload 之上的二次倍率不受参数下限」。
  //   修法：按 scope 把 mult 拆成「参数通道」与「timed 通道」两个乘子（各自按 computeStats 的
  //   **加法聚合语义** 1 + Σ(v−1) 计算）。先由 base 直接算出**参数通道的独立结果**并对它施加硬限，
  //   再把 timed 乘子乘上去 ⇒ 卡牌/升级无法把装填压破 1.0s，能力爆发可在生效期间突破。
  //   注意不能"从聚合值反推"：add 型修饰器已在 pass1 累进 base，除法剥离不可逆。
  // 注意：count===0 时返回 1（无该 stat 的 timed/参数乘子）；count>0 时必须保留原值——
  // 包括 0（`maxSpeed ×0` 的「归零」语义是 test-modifiers 的既有断言，不能被吞成 1）。
  const scopeMult = (stat, wantTimed) => {
    let sum = 1, count = 0;
    for (let i = 0; i < modifiers.length; i++) {
      const mod = modifiers[i];
      if (!mod || mod.stat !== stat || mod.mode !== 'mult') continue;
      if ((mod.scope === 'timed') !== wantTimed) continue;
      if (typeof mod.value !== 'number' || !isFinite(mod.value)) continue;
      sum += mod.value - 1;
      count++;
    }
    if (count === 0) return 1;
    const mul = count > 1 ? Math.max(0, sum) : sum;
    return isFinite(mul) ? mul : 1;
  };
  const scopeAdd = (stat, wantTimed) => {
    let sum = 0;
    for (let i = 0; i < modifiers.length; i++) {
      const mod = modifiers[i];
      if (!mod || mod.stat !== stat || mod.mode !== 'add') continue;
      if ((mod.scope === 'timed') !== wantTimed) continue;
      if (typeof mod.value !== 'number' || !isFinite(mod.value)) continue;
      sum += mod.value;
    }
    return sum;
  };
  // 参数通道（不含 timed）的独立结果 = (base + 参数add) × 参数mul
  // 返回 null 表示拿不到 base（退化路径），调用方按旧口径处理。
  const channelValue = (stat) => {
    if (!base || typeof base[stat] !== 'number') return null;
    return (base[stat] + scopeAdd(stat, false)) * scopeMult(stat, false);
  };
  if(pL.reload && typeof pL.reload.min === 'number' && typeof s.reload === 'number'){
    const timedAdd = scopeAdd('reload', true);
    const timedMul = scopeMult('reload', true);
    const cv = channelValue('reload');
    if (cv !== null) {
      // 参数通道低于下限 → 抬到下限，再叠加 timed 通道（能力爆发可继续压低）
      const clamped = cv < pL.reload.min ? pL.reload.min : cv;
      s.reload = (clamped + timedAdd) * timedMul;
    } else if (s.reload < pL.reload.min) {
      s.reload = pL.reload.min;   // 退化口径：宁可多钳不漏钳
    }
  }
  if(pL.maxSpeed && typeof pL.maxSpeed.max === 'number' && typeof s.maxSpeed === 'number'){
    const timedAdd = scopeAdd('maxSpeed', true);
    const timedMul = scopeMult('maxSpeed', true);
    const cv = channelValue('maxSpeed');
    if (cv !== null) {
      // 只钳上限（极小值/负值属 test-extreme-model 刻意覆盖的边界，此处不额外夹 0——
      // 加 Math.max(0,…) 会改变既有极值语义并让该用例失败）
      const clamped = cv > pL.maxSpeed.max ? pL.maxSpeed.max : cv;
      s.maxSpeed = (clamped + timedAdd) * timedMul;
    } else if (s.maxSpeed > pL.maxSpeed.max) {
      s.maxSpeed = pL.maxSpeed.max;
    }
  }
  // #AA4（2026-10-24 用户裁定「刹车是独立系统」+「卡牌可以改善刹车」）：制动是独立通道，
  //   base 里没有 brake 字段（它的来源是 RULES.speed.brakeBasePx，不是车体 spec），
  //   所以参数通道基准取基准值本身，再按 min/max 双向钳制；timed 通道照 #W1 口径后置叠加。
  if(pL.brake && typeof s.brake === 'number'){
    const timedAdd = scopeAdd('brake', true);
    const timedMul = scopeMult('brake', true);
    const baseBrake = (typeof RULES.speed.brakeBasePx === 'number') ? RULES.speed.brakeBasePx : s.brake;
    let clamped = (baseBrake + scopeAdd('brake', false)) * scopeMult('brake', false);
    if(typeof pL.brake.min === 'number' && clamped < pL.brake.min) clamped = pL.brake.min;
    if(typeof pL.brake.max === 'number' && clamped > pL.brake.max) clamped = pL.brake.max;
    s.brake = (clamped + timedAdd) * timedMul;
  }
}

function computeStats(base, modifiers){
  const s = {
    penetration: base.penetration,
    damage: base.damage,
    reload: base.reload,
    shellSpeed: base.shellSpeed || 1200,
    maxSpeed: base.maxSpeed,
    turnRate: base.turnRate,
    turretTurnRate: base.turretTurnRate,
    // #AA4（2026-10-24 用户裁定「刹车是独立系统」）：制动基准独立于 enginePower/weight。
    // ⚠️ 必须写在字面量内——modifier 的 add/mult 两条通道都有 `s[stat] !== undefined` 门禁，
    // 写在字面量之外会让卡牌 field:'brake' 的修饰器被静默丢弃（旧 `brake = accel × 2.2`
    // 派生就是因此不可被卡牌触及）。旧公式已于 2026-10-24 作废，见 js/tank_rules.js RULES.speed 注记。
    brake: (RULES.speed && typeof RULES.speed.brakeBasePx === 'number') ? RULES.speed.brakeBasePx : 400,
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
    aimSpeed: base.aimSpeed !== undefined ? base.aimSpeed : RULES.spread.shrinkRate,
    // P-49: 模块暴击/概率修正 stat 通道 (fireControlCrit & loaderAmmoCrit)
    fireControlCrit: base.fireControlCrit !== undefined ? base.fireControlCrit : 0,
    loaderAmmoCrit: base.loaderAmmoCrit !== undefined ? base.loaderAmmoCrit : 0
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
  // P-49: 概率修正通道加值钳制在 [0, critBonusCap] (加法上限 0.25)
  const critCap = (RULES.modules && RULES.modules.critBonusCap) !== undefined ? RULES.modules.critBonusCap : 0.25;
  s.fireControlCrit = Math.min(critCap, Math.max(0, s.fireControlCrit));
  s.loaderAmmoCrit = Math.min(critCap, Math.max(0, s.loaderAmmoCrit));
  // #U40（2026-10-19 卡牌审计）：aimSpeed / trackLock 聚合边界——与 RULES.parameterLimits 新增
  //   边界同源（aimSpeed.max 6 / trackLock.min 3）。此前两参数无聚合钳制且无 parameterLimits
  //   条目 ⇒ cardEligible 的 #U20 达限过滤对精度/履带卡永不触发，满级卡反复出现（用户反馈）。
  //   注意：与 reload/maxSpeed 硬限不同，本钳制是无条件的（对齐 crit 通道既有行为——真实
  //   坦克 base.aimSpeed 包络 1.0~2.5、base.trackLock 8s 均在界内，钳制只影响越界叠加值）。
  const aimLimU40 = (RULES.parameterLimits && RULES.parameterLimits.aimSpeed) ? RULES.parameterLimits.aimSpeed : null;
  if(aimLimU40 && typeof aimLimU40.max === 'number' && typeof s.aimSpeed === 'number' && s.aimSpeed > aimLimU40.max){
    s.aimSpeed = aimLimU40.max;
  }
  const tlLimU40 = (RULES.parameterLimits && RULES.parameterLimits.trackLock) ? RULES.parameterLimits.trackLock : null;
  if(tlLimU40 && typeof tlLimU40.min === 'number' && typeof s.trackLock === 'number' && s.trackLock < tlLimU40.min){
    s.trackLock = tlLimU40.min;
  }
  // 2026-09-15 W5：修饰聚合后的最终参数按「用户裁定运行时硬限」钳制
  // （装填 ≥0.5s、极速 ≤150km/h；卡牌/局内升级/难度通道，modifiers 非空才生效）。
  applyParameterLimits(s, modifiers, base);

  // derived mobility: forward acceleration (px/s^2) from horsepower per tonne scaled to game units.
  // derived AFTER modifier loop so cards/upgrades modifying enginePower or weight affect actual accel.
  // ⚠️ brake 不再由 accel 派生（#AA4 2026-10-24）：它已在 s 字面量内独立初始化、可被卡牌修饰、
  //    并在 applyParameterLimits 里受 RULES.parameterLimits.brake 钳制。
  const effPower = typeof s.enginePower === 'number' ? s.enginePower : base.enginePower;
  const effWeight = typeof s.weight === 'number' && s.weight > 0 ? s.weight : base.weight;
  s.accel = (effPower / effWeight) * ACCEL_POWER_TO_PX_SCALE;

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
//   opts.player：**已废弃（#H1）**——原为玩家基准，现封顶一律改按 RULES.enemyAnchorBase 固定基准，
//     保留字段仅为兼容旧调用方（传了也忽略）。
//   opts.strongest：最强弹种终伤（battle 由 computeAmmoConfig 预计算传入，避免本文件倒序依赖
//   tank_cards）；#H1 起缺省改用固定基准伤害推算，见 strongestAnchorDmg。
//   opts.diffNorm：归一难度 0~1；opts.randFactor：每辆车独立随机浮动（0.85~1.15，运行期随机非 RNG 流，battle 用 Math.random 生成）。
// 返回「需要注入的 mult 字典」：只在真正要封顶/抬升时才出现对应键（penMul | dmgFloorMul |
// dmgCapMul | speedMul），无关键不存在——调用方据此遍历 addModifier，避免无谓注入。
function difficultyCapMuls(t, opts){
  const out = {};
  const D = (typeof RULES !== 'undefined' && RULES.difficulty) || {};
  opts = opts || {};
  // #H1：敌军封顶/地板的参照基准 = RULES.enemyAnchorBase（与玩家无关的固定基准）。
  // 缺 RULES 时回退到模块内字面常量（与 enemyAnchorBase 同值），保证纯函数可脱离 RULES 测试。
  const A = (typeof RULES !== 'undefined' && RULES.enemyAnchorBase) || {
    maxHp: 100, penetration: 120, damage: 34, reload: 1.3, maxSpeed: 120,
    turnRate: 2.0, turretTurnRate: 2.2
  };
  if(!t || !t.base || !t.stats) return out;

  // 穿深封顶：penCap = 固定基准穿深 × penCapVsBaseline；仅当当前生效值超限才压
  if(typeof t.stats.penetration === 'number' && typeof A.penetration === 'number'
     && typeof t.base.penetration === 'number' && t.base.penetration > 0){
    const penCap = A.penetration * (D.penCapVsBaseline !== undefined ? D.penCapVsBaseline : 1.2);
    if(t.stats.penetration > penCap){
      out.penMul = (penCap - t.stats.penetration) / t.base.penetration + 1;
    }
  }
  // 伤害地板/天花板（天花板 = 参照终伤 × dmgCapAmmoMult）。floor < cap 恒成立（参照终伤
  // ≥ 基准伤害），故二选一注入：低于地板抬升、高于天花板压制，中间不动。
  if(typeof t.stats.damage === 'number' && typeof A.damage === 'number'
     && typeof t.base.damage === 'number' && t.base.damage > 0){
    const floor = A.damage * (D.dmgFloorVsBaseline !== undefined ? D.dmgFloorVsBaseline : 0.4);
    // 参照终伤：调用方显式传入 strongest（玩家最强弹种终伤）时按其 × dmgCapAmmoMult；
    // 缺省（#H1 纯模块/测试路径）改用固定基准伤害 × strongestAnchorMult 推算等效终伤，
    // 再 × dmgCapAmmoMult —— 保证不传 strongest 时天花板仍有确定值，而非 Infinity。
    const strongest = typeof opts.strongest === 'number' && opts.strongest > 0 ? opts.strongest : 0;
    const capRef = strongest > 0 ? strongest
                 : A.damage * (D.strongestAnchorMult !== undefined ? D.strongestAnchorMult : 2.33);
    const cap = capRef * (D.dmgCapAmmoMult !== undefined ? D.dmgCapAmmoMult : 0.7);
    if(t.stats.damage < floor){
      out.dmgFloorMul = (floor - t.stats.damage) / t.base.damage + 1;
    } else if(t.stats.damage > cap){
      out.dmgCapMul = (cap - t.stats.damage) / t.base.damage + 1;
    }
  }
  // ★速度：targetSpeed = lerp(baseFloor, baseCeil, diffNorm) × randFactor × 固定基准 maxSpeed。
  // 旧实现直写 t.stats.maxSpeed（完全覆盖 entityMults.maxSpeed）；注入差量系数后同样逐值等价。
  if(typeof t.stats.maxSpeed === 'number' && typeof A.maxSpeed === 'number' && A.maxSpeed > 0
     && typeof t.base.maxSpeed === 'number' && t.base.maxSpeed > 0){
    const SV = D.speedVsBaseline || { baseFloor: 0.3, baseCeil: 0.5, randMin: 0.85, randMax: 1.15 };
    const diffNorm = typeof opts.diffNorm === 'number' ? Math.max(0, Math.min(1, opts.diffNorm)) : 0;
    const randFactor = typeof opts.randFactor === 'number' ? opts.randFactor : 1;
    const speedFactor = SV.baseFloor + (SV.baseCeil - SV.baseFloor) * diffNorm;
    const targetSpeed = speedFactor * randFactor * A.maxSpeed;
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
  // #P1 / I0（2026-10-24）：到期时刻改用模拟时钟（与 refreshStats 的过滤判据同源）。
  //   旧实现读 Date.now() ⇒ timed 修饰器到期判定不可复现（回放/单测都受真实时间影响）。
  const now = (typeof simNow === 'function') ? simNow() : Date.now();
  return addModifier(tank, Object.assign({}, mod, { scope: 'timed', expiresAt: now + durationMs }));
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
  // #A23 d：run 结束同时清零卡牌应用计数（maxStacks 防线），避免跨局残留
  if (tank && tank._cardApplyCount) tank._cardApplyCount = {};
  // #G（2026-09-21）：按序施加日志与计数同生命周期
  if (tank && tank._cardApplyLog) tank._cardApplyLog = [];
  // #G（2026-09-21）：APS 拦截窗口跨局不残留（battle updateAps 消费）
  if (tank) { tank._apsT = 0; tank._apsHits = 0; }
  // #W6（2026-10-19）：economy 运行期字段同样必须归零。
  //   根因：player 是 battle 模块级单例，runScoreMul / runReviveBonus 只由 applyCardEffects 写入，
  //   而 removeRunModifiers 与 prepPlayerForRun 都只清 modifiers/cardEffects，不清这两个字段 ⇒
  //   拿过一次「后勤保障」（scoreMul 1.15）之后，**以后每一局结算分永久 ×1.15 并继续复乘**；
  //   「战场救护协议」的 +1 复活同样永久累积。长期档因此单调膨胀。
  // #W15（2026-10-20 role-systems）：`runStartScore` 随 `economy.startScore` 死配置一并摘除
  //   —— 全仓零读点（ISSUES #W15 已核实），ECONOMY_FIELDS 的 startScore 项由 role-content
  //   在 js/tank_cards.js 同批删除。故此处不再归零该字段。
  if (tank) {
    tank.runScoreMul = 1;
    tank.runReviveBonus = 0;
  }
  return removeModifiersByScope(tank, 'run');
}

function refreshStats(tank){
  const now = (typeof simNow === 'function') ? simNow() : Date.now();   // #P1 / I0：与 addTimedModifier 同源
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
    // #TEX3 外观件配置（设计器外观标签）：各部件样式+位置+镜像；缺省走内置默认
    appearance: null,
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
    texture:'none',                  // 表面纹理叠层（TEXTURE_DEFS 键：none/armor_plate/weld_seam/rust/camo/camo_dunkelgelb/paint_panzergrau/camo_nato/paint_soviet）
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
    weapons: { primary: { type: 'standard', stats: {} }, secondary: { type: 'none', stats: {} } },
    moduleSlots: [],
    // #W6（2026-10-19）：economy 单局字段的显式初值。此前为 undefined，靠消费方
    // `|| 1` / `| 0` 兜底；显式初始化后与 removeRunModifiers 的归零值一致，
    // 避免「未持有卡 → undefined」与「持有后又清除 → 1」两种等价状态在断言里漂移。
    runScoreMul: 1,
    runReviveBonus: 0,
    // #W15（2026-10-20）：`runStartScore` 已随 `economy.startScore` 死配置摘除（全仓零读点）。
    _visualVersion: 0,
    _lastDrawnVersion: -1,
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
  // #TEX-2026-10-15: 程序化装饰件分配（确定性，同 id 同装饰）
  assignTankDecorations(tank);
  // 每车固定 weathering seed（损伤纹理不闪烁）
  tank.weatherSeed = _tankHash(tank.id || 'unknown') % 100000;
  return tank;
}

// 简单字符串 hash（装饰分配用）
function _tankHash(s){
  let h = 2166136261;
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 程序化装饰件：每车 2~3 件，位置在车体后部/侧面（避开炮塔座圈）。
// 以 tank id hash 确定性选择，保证同车同装饰。
function assignTankDecorations(t){
  const TYPES = ['toolbox', 'spareTrack', 'jerryCan', 'log', 'shovel', 'camoNet'];
  const h = _tankHash(t.id || 'unknown');
  const count = 2 + (h % 2);  // 2~3 件
  const L = (t.hullLen || 64) / 2, W = (t.hullWid || 38) / 2;
  // 候选位置：后甲板两侧、车体侧面（local 坐标，前=+x）
  const spots = [
    { dx: -L*0.72, dy: -W*0.55 }, { dx: -L*0.72, dy: W*0.55 },
    { dx: -L*0.45, dy: -W*0.78 }, { dx: -L*0.45, dy: W*0.78 },
    { dx: L*0.15, dy: -W*0.80 },  { dx: L*0.15, dy: W*0.80 },
  ];
  for(let i = 0; i < count; i++){
    const typeIdx = (h >>> (i*4)) % TYPES.length;
    const spotIdx = (h >>> (i*4 + 2)) % spots.length;
    const sp = spots[spotIdx];
    t.attachments.push({
      type: TYPES[typeIdx],
      bindTo: 'hull',
      // drawAttachments 用 anchors[bindTo] 做基点；这里直接用 dx/dy 做 anchor
      _decoDx: sp.dx, _decoDy: sp.dy,
      scale: 0.9 + ((h >>> (i*6)) % 30) / 100,  // 0.9~1.2
      relativeAngle: ((h >>> (i*8)) % 60) - 30,  // ±30° 随机朝向
    });
  }
}

const SPEED_KMH_FACTOR = RULES.speed.kmhFactor;      // maxSpeed(px/s) × kmhFactor = km/h（与 computeStats.maxSpeedKmh 同源）
const SPEED_PX_FACTOR  = RULES.speed.pxFactor;
// convert horsepower-per-tonne into game px/s^2 acceleration; this one sets the accel feel.
// For responsive roguelike action, responsiveness is high (accel ×15 scale)。
// 制动不走这里：#AA4（2026-10-24）起 `RULES.speed.brakeBasePx` 是唯一来源，~~brakeFactor~~ 已作废。
const ACCEL_POWER_TO_PX_SCALE = RULES.speed.accelPowerToPxScale;
function tankKmh(t){ return Math.round((t.stats?.maxSpeed ?? t.maxSpeed) * SPEED_KMH_FACTOR); }
// #AA1（2026-10-26）：公路加成的 HUD 表速增量。`roadBonus` 与 `stats.maxSpeed` **同尺度**
//   ——`js/tank_move.js` 以 `bonusPx = speedBonusKmh / kmhFactor` 写入、并在 `stats.maxSpeed` 同一
//   尺度上相加（`boostedMax = min(cap, baseMax + roadBonus)`）⇒ 换算 km/h **只乘 kmhFactor**，
//   与 tankKmh(stats.maxSpeed) 同源。
//   ⚠️ 不得再除 `pxFactor×effMul`：那套除法只适用于**像素速度** `t.speed`（见 tankCurrentKmh）；
//   旧实现两处混用 ⇒ HUD 标「+5km/h」而实机 +10km/h（低估一半）。
function roadBonusKmh(roadBonus){
  if (typeof roadBonus !== 'number' || !isFinite(roadBonus) || roadBonus <= 0) return 0;
  return Math.round(roadBonus * SPEED_KMH_FACTOR);
}

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

  // 2026-10-23（用户裁定）：「被动技能槽 … 每辆坦克固定数量，后期高等级坦克会赋予更多」——
  //   `passiveSlots` 是**车型配置**（tanks/<id>.json），随车型固定；不是升级项
  //   （UPGRADE_DEFS / 局内商店都不改它）。未配置时回退 RULES.abilities.passiveSlotsMax。
  const instanceFields = ['heightClass', 'trackWidth', 'trackOffset', 'texture', 'passiveSlots'];
  for (const f of instanceFields) {
    if (spec[f] !== undefined) tank[f] = spec[f];
  }
  // 整车精灵配置（tanks/<id>.json `sprite`）：深拷贝，防多实例共享引用被下游改写。
  // 结构：{ enabled, track:{img,scale,dx,dy}, hull:{img,scale,dx,dy,rot},
  //         turret:{img,scale,dx,dy,rot,pivot:[px,py]}, barrel:{...} }
  // 注意（#L6）：这里必须**无条件**赋值。applyTankConfig 会作用在复用的实体上
  //（玩家/靶车换车、prepPlayerForRun），若仅在 spec 有 sprite 时才写，切到无 sprite 的
  // 配置（如 tanks/dummy.json）会残留上一辆车的贴图，画出错误的车体。
  tank.sprite = (spec.sprite !== undefined)
    ? JSON.parse(JSON.stringify(spec.sprite))
    : null;

  // 外观件配置（tanks/<id>.json `appearance`）：深拷贝，防多实例共享引用被下游改写。
  // #X1（2026-10-20 role-systems）**本次修复的缺陷**：原 applyTankConfig 完全不拷贝
  //   `spec.appearance` ⇒ 游戏内 `t.appearance` **恒为 undefined**，而消费方一直在读：
  //     · js/tank_battledraw.js:44/55  `appearance: t.appearance || undefined`
  //     · js/tank_battledraw.js:1820   `cupolaStyle: t.appearance?.cupola?.style`
  //     · js/tank_paint.js:787/871     `opts.appearance.engineDeck / .cupola`
  //   后果：5 份 tanks/*.json 的 `cupola`（车长塔，low/standard/panoramic）与 `engineDeck`
  //   （发动机舱盖，standard/compact/rearGrille）**从未生效**，全部坦克都画默认外观。
  // 结构：{ cupola:{style,dx,dy,mirror}, engineDeck:{style,dx,dy,mirror} }
  // 与 sprite 同口径**无条件赋值**（切到无 appearance 的配置时不得残留上一辆车的外观件）。
  tank.appearance = (spec.appearance !== undefined)
    ? JSON.parse(JSON.stringify(spec.appearance))
    : null;

  // 锚点深拷贝（#B6）：Object.assign 只复制一层，嵌套的 {dx,dy} 仍与 spec 共享引用，
  // 下游实例级改写（Boss scale ×s 等）会原地污染共享配置。
  if (spec.anchors !== undefined) {
    for (const k in spec.anchors) {
      const a = spec.anchors[k];
      tank.anchors[k] = (a && typeof a === 'object') ? { dx: a.dx || 0, dy: a.dy || 0 } : a;
    }
  }
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
  // 拷贝而非引用（#B6）：spec 常驻 tankListData 缓存并被所有实体共享，
  // 直接引用会让下游的实例级几何改写（Boss scale ×s、炮塔前移等）原地污染源配置，
  // 导致后续节点/玩家加载到被改过的 pivot（跨节点炮塔逐渐前移的根因）。
  if (spec.turret && spec.turret.pivot) {
    tank.turretPivotOffset = { dx: spec.turret.pivot.dx || 0, dy: spec.turret.pivot.dy || 0 };
  } else {
    tank.turretPivotOffset = { dx: 8, dy: 0 };
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

  if (spec.weapons || spec.primary || spec.secondary) {
    tank.weapons = (typeof _normalizeTankWeapons === 'function') ? _normalizeTankWeapons(spec) : (spec.weapons || tank.weapons);
  }
  if (spec.moduleSlots) {
    tank.moduleSlots = [...spec.moduleSlots];
  }

  tank._visualVersion = (tank._visualVersion || 0) + 1;

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

/**
 * 敌军专属配置应用（只取外观与类型，不取数值）：
 *   1. 复制外观几何（hull/turret/barrel/texture/track 等）与 class 类型；
 *   2. 数值基准由 **固定基准 RULES.enemyAnchorBase** × RULES.enemyClassProfiles[class] 设定；
 *   3. 难度乘子 entityMults 在初始化后注入。
 * @param {any} tank 敌军实体
 * @param {any} spec tanks/*.json 规格
 * @param {any} [anchorStats] **已废弃（#H1）**——原为玩家基准快照入参，现一律忽略；
 *   保留该形参仅为兼容旧调用方（battle/bench/测试仍按位置传第三参）。见 RULES.enemyAnchorBase。
 * @param {any} [entityMults] 难度乘子表
 */
function applyEnemyAppearanceAndStats(tank, spec, anchorStats, entityMults){
  if (!tank) return;
  // 1. 复制纯外观与几何
  if (spec) {
    if (spec.traverseLimit !== undefined) tank.traverseLimit = spec.traverseLimit * Math.PI / 180;
    const instanceFields = ['heightClass', 'trackWidth', 'trackOffset', 'texture'];
    for (const f of instanceFields) {
      if (spec[f] !== undefined) tank[f] = spec[f];
    }
    // 锚点深拷贝（#B6）：Object.assign 只复制一层，嵌套的 {dx,dy} 仍与 spec 共享引用，
  // 下游实例级改写（Boss scale ×s 等）会原地污染共享配置。
  if (spec.anchors !== undefined) {
    for (const k in spec.anchors) {
      const a = spec.anchors[k];
      tank.anchors[k] = (a && typeof a === 'object') ? { dx: a.dx || 0, dy: a.dy || 0 } : a;
    }
  }
    if (spec.barrel) tank.barrel = normalizeBarrel(spec.barrel);

    if (spec.hull && spec.hull.verts && spec.hull.faces) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [vx, vy] of spec.hull.verts) {
        if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy; if (vy > maxY) maxY = vy;
      }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      tank.hullSpec = { verts: spec.hull.verts.map(([vx, vy]) => [vx - cx, vy - cy]), faces: spec.hull.faces };
      tank.hullLen = maxX - minX;
      tank.hullWid = maxY - minY;
    }

    if (spec.turret && spec.turret.verts && spec.turret.faces) {
      const axis = spec.turret.axis || null;
      const ax = (axis && axis.dx) || 0;
      const ay = (axis && axis.dy) || 0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [vx, vy] of spec.turret.verts) {
        if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy; if (vy > maxY) maxY = vy;
      }
      tank.turretSpec = { verts: spec.turret.verts.map(([vx, vy]) => [vx - ax, vy - ay]), faces: spec.turret.faces };
      tank.turLen = Math.max(1, maxX - minX);
      tank.turWid = Math.max(1, maxY - minY);
      tank.turretAxis = { dx: ax, dy: ay };
    }
    if (spec.turret && spec.turret.pivot) {
      // 拷贝而非引用（#B6）：同 applyTankConfig——共享 spec 不得被实例级几何改写污染。
      tank.turretPivotOffset = { dx: spec.turret.pivot.dx || 0, dy: spec.turret.pivot.dy || 0 };
    } else {
      tank.turretPivotOffset = { dx: 8, dy: 0 };
    }
    if (spec.modules) {
      tank.modules = (typeof _normalizeTankModules === 'function') ? _normalizeTankModules(spec.modules) : null;
    }
  }

  // 2. 类别识别
  const cls = (spec && deriveTankClass(spec)) || tank.tankClass || 'medium';
  tank.tankClass = cls;

  // 3. 数值锚定：以玩家基准 anchorStats × enemyClassProfiles 写入 base
  const profiles = (typeof RULES !== 'undefined' && RULES.enemyClassProfiles) || {};
  const prof = profiles[cls] || profiles.medium || {
    maxHp: 1.0, penetration: 1.0, damage: 1.0, reload: 1.0, maxSpeed: 1.0, turnRate: 1.0, armor: 1.0
  };

  // #H1：数值锚定基准 = RULES.enemyAnchorBase（与玩家无关的固定基准）。
  // 原实参 anchorStats（玩家出战快照）已废弃并忽略——它含局外永久升级，会让商店购买同比例
  // 抬高全部敌军，抵消玩家成长收益（#H1 实测：升级买满后敌军穿深 +23.7%/伤害 +30%/血量 +62.5%）。
  // 缺 RULES 时回退到与 enemyAnchorBase 同值的字面常量（纯函数可脱离 RULES 测试）。
  const b = tank.base;
  const p = (typeof RULES !== 'undefined' && RULES.enemyAnchorBase) || {
    maxHp: 100, penetration: 120, damage: 34, reload: 1.3, maxSpeed: 120, turnRate: 2.0, turretTurnRate: 2.2,
    shellSpeed: 1200, weight: 50, enginePower: 700,
    // #W14：与 RULES.enemyAnchorBase.aimSpeed 同值兜底（脱离 RULES 的纯函数测试路径）。
    aimSpeed: 1.2,
    armor: { hull: { front: 100, side: 40, rear: 25 }, turret: { front: 100, side: 40, rear: 25 } }
  };

  // 核心 6 维比例计算（相对固定基准的比例缩放）
  b.maxHp = Math.round(p.maxHp * (prof.maxHp || 1.0));
  b.penetration = Math.round(p.penetration * (prof.penetration || 1.0));
  b.damage = Math.round(p.damage * (prof.damage || 1.0));
  b.reload = Math.round(p.reload * (prof.reload || 1.0) * 100) / 100;
  b.maxSpeed = Math.round(p.maxSpeed * (prof.maxSpeed || 1.0));
  b.turnRate = Math.round(p.turnRate * (prof.turnRate || 1.0) * 100) / 100;
  b.turretTurnRate = Math.round(p.turretTurnRate * (prof.turnRate || 1.0) * 100) / 100;

  // 杂项属性兜底保留
  b.shellSpeed = p.shellSpeed || 1200;
  b.enginePower = p.enginePower || 700;
  b.weight = p.weight || 50;

  // #W14（2026-10-20 role-systems）：**必须显式写 base.aimSpeed**。
  //   根因：makeTank 的 base 无 aimSpeed 键，computeStats 于是回落 RULES.spread.shrinkRate(0.15)
  //   —— 那是「配装缺省」量纲，与真实坦克 spec 的 base.aimSpeed(1.0~2.5) 是两套量纲。
  //   而 entityMults.aimSpeed(0.8~1.35) 按真实量纲设计 ⇒ 满难度实测仅 0.15×1.35=0.2025
  //   （玩家 tiger-I 1.5 的 7.4%），敌军缩圈几乎停滞。写入锚定基准后 = 1.2×1.35 = 1.62。
  //   注意：aimSpeed 不参与 enemyClassProfiles 的类别缩放（四类共用同一瞄准速度基准，
  //   差异由 entityMults 难度通道与玩家卡牌通道承担），故此处直接取基准值不做 prof 乘算。
  if (p.aimSpeed !== undefined) b.aimSpeed = p.aimSpeed;

  // 装甲按 armor 系数缩放
  const armMul = prof.armor || 1.0;
  b.armor = {
    hull: {
      front: Math.round(((p.armor && p.armor.hull && p.armor.hull.front) || 100) * armMul),
      side:  Math.round(((p.armor && p.armor.hull && p.armor.hull.side)  || 40) * armMul),
      rear:  Math.round(((p.armor && p.armor.hull && p.armor.hull.rear)  || 25) * armMul)
    },
    turret: {
      front: Math.round(((p.armor && p.armor.turret && p.armor.turret.front) || 100) * armMul),
      side:  Math.round(((p.armor && p.armor.turret && p.armor.turret.side)  || 40) * armMul),
      rear:  Math.round(((p.armor && p.armor.turret && p.armor.turret.rear)  || 25) * armMul)
    }
  };

  // 重算 stats
  tank.modifiers = [];
  refreshStats(tank);

  // 4. 注入难度乘子 entityMults（若有）
  if (entityMults) {
    const STAT_KEYS = ['maxHp', 'penetration', 'damage', 'reload', 'spreadMult', 'aimSpeed', 'maxSpeed', 'turnRate', 'turretTurnRate'];
    for (const k of STAT_KEYS) {
      if (entityMults[k] !== undefined && entityMults[k] !== 1) {
        addModifier(tank, { stat: k, mode: 'mult', value: entityMults[k], source: 'difficulty', scope: 'run' });
      }
    }
    if (entityMults.armorAll !== undefined && entityMults.armorAll !== 1) {
      addModifier(tank, { stat: 'armor.hull', mode: 'mult', value: entityMults.armorAll, source: 'difficulty', scope: 'run' });
      addModifier(tank, { stat: 'armor.turret', mode: 'mult', value: entityMults.armorAll, source: 'difficulty', scope: 'run' });
    }
  }

  tank.hp = tank.stats.maxHp;
  tank.maxHp = tank.stats.maxHp;

  const pxPerMeter = (typeof RULES !== 'undefined' && RULES.scale && RULES.scale.PX_PER_METER) || 20;
  if (tank.hullLen && tank.hullLen > 0) {
    tank.stats.hullLengthM = Math.round((tank.hullLen / pxPerMeter) * 100) / 100;
  }
  if (tank.barrel && tank.barrel.len && tank.barrel.len > 0) {
    tank.stats.barrelLengthM = Math.round((tank.barrel.len / pxPerMeter) * 100) / 100;
  }
}

// ================= 敌军弹种分级（2026-10-19 用户裁定） =================
// 口径（用户原话）：「敌人等级每提升 3 个等级，敌人可用的弹种也跟随升一级，
//   且除了 boss，其他敌人只使用 ap 链的弹种」。
//
// 背景：此前敌军**从不设置 `ammoKey`**，`tank_fire.js` 的 `getAmmoCfg` 兜底成
//   `RULES.ammoTypes[k] || RULES.ammoTypes.ap` ⇒ 全部敌军恒定打 AP，难度对弹种零调制。
//
// 实现要点：
//   · **只走 AP 链**：`ap → apcr → apds → apfsds → apfsds_ad`（`RULES.ammoChain` 的动能支）。
//     表格顺序即升级顺序；不碰 heat/he 化学链（Boss 仍可自由配任何弹种，不回退）。
//   · **每 3 级升一档**：`step = floor((level - 1) / 3)`，钳到链长-1。
//     例：lv1~3 → ap，lv4~6 → apcr，lv7~9 → apds，lv10~12 → apfsds，lv13+ → apfsds_ad。
//   · 纯函数、无副作用，供 battle/bench/图鉴共用（单一数据源）。
const AP_AMMO_CHAIN = ['ap', 'apcr', 'apds', 'apfsds', 'apfsds_ad'];

/**
 * 按敌军等级返回应使用的 AP 链弹种键。
 * @param {number} level 敌人等级（1 起；缺省/非法按 1 处理）
 * @returns {string} 弹种键（恒为 AP 链之一）
 */
function enemyAmmoKeyForLevel(level) {
  const lv = (typeof level === 'number' && isFinite(level) && level >= 1) ? Math.floor(level) : 1;
  const step = Math.floor((lv - 1) / 3);
  const idx = Math.max(0, Math.min(AP_AMMO_CHAIN.length - 1, step));
  return AP_AMMO_CHAIN[idx];
}

/**
 * 给敌军实体按等级套用弹种（Boss 可跳过由调用方控制）。
 * 只写 `ammoKey`，不触碰 `ammoLoadout`（敌军不走玩家那套 Q/E 轮换）。
 *
 * 2026-10-22（第五批，用户裁定）：**敌方/Boss 弹种升级后，穿深与伤害不跟随弹种设定的比例**，
 *   按它们既有的成长速度（`RULES.difficulty.entityMults.penetration / damage` 线性插值）设定。
 *   实现：同时写 `ammoStatNeutral = true`，消费方 `js/tank_fire.js` 的 firePrimaryShell 对
 *   该标记的射手把 `ammo.pen` / `ammo.dmg` 按 1.0 处理（弹速/散布/跳弹角/模块/溅射等弹种
 *   特性全部保留）。`enemyLevel` 同时落盘，供击杀计分（js/tank_economy.js killScore）与
 *   面板展示读取。
 * @param {any} tank 实体（任意带 ammoKey 字段的坦克对象）
 * @param {number} level 敌人等级
 */
function applyEnemyAmmoByLevel(tank, level) {
  if (!tank) return;
  const lv = (typeof level === 'number' && isFinite(level) && level >= 1) ? Math.floor(level) : 1;
  tank.ammoKey = enemyAmmoKeyForLevel(lv);
  tank.enemyLevel = lv;
  tank.ammoStatNeutral = true;
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

/**
 * P-49 设计器出厂参数耦合推导函数：
 * 计算根据穿深、单发伤害推导出的建议装填时间增量与三扩增量，以及车体尺寸允许的最大马力。
 * @param {any} spec 坦克 spec
 * @returns {{ reloadMultiplier: number, spreadMultiplier: number, maxAllowedEnginePower: number, hullArea: number, moduleSizeFactor: number }}
 */
function deriveCoupledStats(spec){
  const cfg = (typeof RULES !== 'undefined' && RULES.coupling) ? RULES.coupling : {
    basePen: 120, baseDmg: 40, penReloadFactor: 0.005, dmgReloadFactor: 0.015,
    penSpreadFactor: 0.002, dmgSpreadFactor: 0.005, refHullArea: 2500, enginePowerPerArea: 0.36
  };
  const pen = (spec && spec.penetration !== undefined) ? spec.penetration : cfg.basePen;
  const dmg = (spec && spec.damage !== undefined) ? spec.damage : cfg.baseDmg;

  const deltaPen = Math.max(0, pen - cfg.basePen);
  const deltaDmg = Math.max(0, dmg - cfg.baseDmg);

  const reloadMultiplier = 1.0 + deltaPen * cfg.penReloadFactor + deltaDmg * cfg.dmgReloadFactor;
  const spreadMultiplier = 1.0 + deltaPen * cfg.penSpreadFactor + deltaDmg * cfg.dmgSpreadFactor;

  let area = cfg.refHullArea;
  if(spec && spec.hull && spec.hull.verts && Array.isArray(spec.hull.verts) && spec.hull.verts.length >= 3){
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for(const v of spec.hull.verts){
      const vx = v.x !== undefined ? v.x : v[0];
      const vy = v.y !== undefined ? v.y : v[1];
      if(vx < minX) minX = vx; if(vx > maxX) maxX = vx;
      if(vy < minY) minY = vy; if(vy > maxY) maxY = vy;
    }
    const w = maxX - minX, h = maxY - minY;
    if(w > 0 && h > 0) area = w * h;
  }
  const maxAllowedEnginePower = Math.round(Math.min(1200, Math.max(300, area * cfg.enginePowerPerArea)));

  const minF = (typeof RULES !== 'undefined' && RULES.modules && RULES.modules.sizeFactorMin !== undefined) ? RULES.modules.sizeFactorMin : 0.7;
  const maxF = (typeof RULES !== 'undefined' && RULES.modules && RULES.modules.sizeFactorMax !== undefined) ? RULES.modules.sizeFactorMax : 1.3;
  const moduleSizeFactor = Math.max(minF, Math.min(maxF, cfg.refHullArea / area));

  return { reloadMultiplier, spreadMultiplier, maxAllowedEnginePower, hullArea: area, moduleSizeFactor };
}

/**
 * P-46 坦克类别推导：优先读显式 spec.class，缺失时按数值启发式推导。
 * @param {any} spec 坦克 spec
 * @returns {string} 'light' | 'medium' | 'heavy' | 'spg' | 'target'
 */
function deriveTankClass(spec){
  const valid = ['light','medium','heavy','spg','target'];
  if(spec && valid.indexOf(spec.class) >= 0) return spec.class;
  // 目标靶车/占位（无战斗数值的 dummy 等）标记为 target（退出敌池）
  if(spec && (spec.target === true || spec.target === 'true')) return 'target';
  const arm = (spec && spec.armor) ||
    (spec && spec.hull && spec.hull.armor ? { front: spec.hull.armor.front } : null);
  const front = (arm && typeof arm.front === 'number') ? arm.front :
    (spec && spec.hull && spec.hull.armor && typeof spec.hull.armor.front === 'number' ? spec.hull.armor.front : null);
  const hp = (spec && typeof spec.hp === 'number') ? spec.hp : null;
  const spd = (spec && typeof spec.maxSpeed === 'number') ? spec.maxSpeed :
    (spec && spec.stats && typeof spec.stats.maxSpeed === 'number' ? spec.stats.maxSpeed : null);
  const barrel = spec && spec.barrel;  // SPG 通常炮管长/射界窄
  // 启发式：重甲 + 高血量 + 低速 → heavy；高穿深 + 长炮管 + 低速 → spg；轻血高机 → light
  if(front !== null && front >= 130 && hp !== null && hp >= 140) return 'heavy';
  if(barrel && typeof barrel.len === 'number' && barrel.len >= 220 && spd !== null && spd <= 95) return 'spg';
  if(hp !== null && hp <= 70 && spd !== null && spd >= 130) return 'light';
  return 'medium';
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

// #G（2026-09-21 用户需求 #8）：t.speed（px/s，带符号）→ 当前仪表 km/h（区别于 tankKmh = 最大速度上限读数）。
// 换算口径：RULES.speed 的 kmhFactor 是按「最大速度 = stats.maxSpeed × pxFactor × effMul 像素速度」
// 标定的（driveTank 的 effMul=1.3 生效路径），HUD 直接用 t.speed×kmhFactor 会读出 ~208km/h
// （超过 150 上限），必须先除以 pxFactor×effMul 还原到「基准最大速度像素速度」再乘 kmhFactor。
function tankCurrentKmh(t){
  if(!t) return 0;
  const spd = Math.abs(t.speed || 0);
  const cfg = (typeof RULES !== 'undefined' && RULES.speed) ? RULES.speed : { kmhFactor: 0.4, pxFactor: 1.6, effMul: 1.3 };
  return spd / ((cfg.pxFactor || 1.6) * (cfg.effMul || 1.3)) * (cfg.kmhFactor || 0.4);
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
    roadBonusKmh,
    TEAM_COLORS,
    teamColor,
    MODULE_LABELS,
    moduleLabel,
    applyTankConfig,
    applyEnemyAppearanceAndStats,
    resolvePartArmor,   // 2026-10-22：逐面装甲解析（图鉴 factory 口径消费）
  // 2026-10-19：敌军弹种分级（AP 链、每 3 级升一档）——纯函数 + 套用助手
  enemyAmmoKeyForLevel,
  applyEnemyAmmoByLevel,
  AP_AMMO_CHAIN,
    deriveWeight,
    weightLimitInfo,
    deriveCoupledStats,
    deriveTankClass,
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
    debuffSpeedRate,
    tankCurrentKmh,
    applyParameterLimits
  };
}
