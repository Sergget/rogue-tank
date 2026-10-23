'use strict';

// tank_weapons.js — 武器与槽位解耦模块（R-1 阶段）
// 提供主武器（Primary Weapon）与副武器/挂载（Secondary Weapon）的数据契约、
// 属性计算与向后兼容适配。

const WEAPON_DEFAULTS = {
  primary: {
    // 2026-09-15 W6 用户裁定：速射机炮重做——伤害=标准 1/5、穿深=标准 80%（弹种系数机制不变）；
  standard:    { reloadMult: 1.0, damageMult: 1.0, penMult: 1.0, shellSpeedMult: 1.0, burst: 1 },
  // #W-I（2026-10-19 用户裁定）：榴弹炮曲射模式——「该模式更改主炮为曲射武器，行进速度将为
  //   最大速度的 1/3。只能发射当前生效的 he 弹种，未直接命中时按距离计算伤害，直接命中时，
  //   按坦克最薄的装甲值作为命中部位来计算伤害。可越过掩体，瞄准器变成一个在鼠标位置的
  //   一个虚线圈，初始半径为 he 的爆炸半径」。**这是一个模式（howitzerMode），不是独立武器
  //   类型**——挂载卡把当前主炮切进/切出该模式，弹种锁定 he。
  //   · reloadMult 2.2：曲射重装填（显著慢于直射）；
  //   · splashRadius：落点爆炸半径（he 系数链可改）；arcSpeed：曲射弹飞行速度（px/s）；
  //   · moveSpeedRatio 1/3：模式下限速系数（js/tank_move.js 消费，勿走 speedModifier——
  //     公路会把 speedModifier 强制归 1 静默清零减速）；
  //   · spreadFactor 4.0（2026-10-23 用户裁定「削弱榴弹炮模式：精度 = 4 × 主炮 base 精度 × 距离」，
  //     历史值 2.0、更早 1.2）：**名不副实的历史键名**——实际语义是「相对**主炮 base 精度**的
  //     倍率」，**不乘 player.sigma**（sigma 含 aimSpeed/spreadMult/运动扩圈等主武器改装）。
  //     保留键名只是为了不破坏卡牌 statOverrides / 旧数据。散布圈半径与实际落点散布
  //     **同一参数源**，消费方 js/tank_fire.js 的落点切向偏移 + tank_battle.html 的 howitzer 瞄准圈；
  //   · barrage：急速射升级卡参数（3 发间隔 0.5s，仅模式内生效）。
    howitzer:    { reloadMult: 2.2, damageMult: 1.0, penMult: 1.0, shellSpeedMult: 1.0,
                   isArc: true, arcSpeed: 260, splashRadius: 90, minArcRange: 120,
                   moveSpeedRatio: 1/3, spreadFactor: 4.0, barrage: null },
    // 2026-09-15 W6 用户裁定：速射机炮重做——伤害=标准 1/5、穿深=标准 80%（弹种系数机制不变）；
    // 2026-10-22（第五批）：penMult 0.85 → 0.80（「穿深 = 标准穿深的 80%」），
    //   与 RULES.autocannon.basePenRatio（夹克钳制基准）同值；穿深增强卡每级 +0.05、最多 +0.10。
    // 射击间隔=装填时间×0.25（不再 burst 连发，逐发短间隔持续射击）；
    // 热量机制：每发 +heatPerShot%、每秒冷却 coolPerSec%、≥heatMax 过热并锁定 overheatLock 秒；
    // 外观：炮管更细(barrelWidthMult)略短(barrelLenMult)，无护套/制退器/抽烟器（battledraw 消费），
    // 炮口特效与炮弹尺寸随 fxScale 缩小。
    autocannon:  { reloadMult: 0.25, damageMult: 0.2, penMult: 0.80, shellSpeedMult: 1.0,
                   heatPerShot: 12, coolPerSec: 15, heatMax: 100, overheatLock: 2.0,
                   maxRange: 900,   // #7：机炮射程限制 900px（卡牌 +100/次；硬上限 RULES.autocannon.rangeMaxPx 1200）
                   barrelWidthMult: 0.6, barrelLenMult: 0.8, fxScale: 0.55 },
    // #E13（2026-09-20 用户裁定）：双联火炮重做——barrelOffset 0.9 → 1.85（炮管间距加大，确保
    // 两根炮管连同各自附件不穿模）；altReload=false 表示默认两管装填进度互相干涉
    // （任一管击发 → 两管进度归 0）；装填流水线见 tank_fire.js。
    // 2026-10-22（第五批用户裁定「换管时间固定 0.8s」）：switchSeconds 0.5 → 0.8，
    //   **仅供展示，运行时恒读 RULES**（fireDoubleBarrel 不再读 spec.switchSeconds，
    //   任何卡牌/数据都改不动它；RULES.weapons.doubleBarrelSwitchSeconds 是唯一口径）。
    double_barrel: { reloadMult: 1.0, damageMult: 1.0, penMult: 1.0, shellSpeedMult: 1.0, count: 2, switchSeconds: 0.8, barrelOffset: 1.85, altReload: false },
    // #G（2026-09-21）电磁轨道炮再平衡（用户反馈「相比双管、机炮不够强力」）：
    //   旧参数 reloadMult 2.2 / damageMult 1.5 → 持续 DPS = 标准炮的 68%（全类型最低）且零机制补偿。
    //   现行参数 reloadMult 1.8 / damageMult 1.8 → DPS 与标准炮持平（1.0），单发 alpha 1.8（仅低于双管齐射 2.0）；
    //   新增专属机制「超高速贯穿」：击穿并命中目标后弹体不消失，以 pierceDmgMul 衰减伤害继续飞行，
    //   可命中同一直线上的后续目标（pierce = 最大贯穿目标数）。弹速 ×2.5 / 穿深 ×2.0 维持不变。
    railgun:     { reloadMult: 1.8, damageMult: 1.8, penMult: 2.0, shellSpeedMult: 2.5,
                   pierce: 1, pierceDmgMul: 0.6, burst: 1 },
    // #G（2026-09-21 用户需求）：弹夹炮——弹夹内逐发短间隔 + 弹夹间整组装填。
    //   弹夹内装填 clipCycleSeconds（0.7s，**固定值，不受任何影响**：不乘 reloadMult、不吃装填 debuff）；
    //   弹夹间装填 = 标准装填 × (reloadMult + clipSizeReloadStep × (容量 − 初始容量))，
    //   即初始 4 发时 ×3.0、每 +1 发容量再 +0.8×（容量由升级卡提升，WEAPON_DEFAULTS 与卡牌 statOverrides 同步）。
    //   运行时状态 _clipState = { size, rounds, pendingRefill }（tank_fire.js ensureClipState/fireClipWeapon）。
    clip:        { reloadMult: 3.0, damageMult: 1.0, penMult: 1.0, shellSpeedMult: 1.0,
                   clipSize: 4, clipSizeBase: 4, clipCycleSeconds: 0.7, clipSizeReloadStep: 0.8 }
  },
  secondary: {
    none:        { reload: 0, damage: 0 },
    // #4（2026-10-19 用户裁定，副炮塔全面重做）：
    //   「待机时随机方向摆动、进入交战范围后立即转动攻击距离最近的敌人，固定使用 ap 弹、
    //     伤害为基础参数的 1/2、其他参数与主炮基础参数绑定、不受其他技能影响」。
    //   · damageFromBaseRatio：伤害不再走 `damageMult × ammo.dmg` 链，而是
    //     `t.base.damage × 0.5` —— **只看主炮基础参数**，不吃任何 modifier/技能/弹种改造。
    //   · idleWanderRate / idleWanderRange：待机摆动（进入射程前炮塔缓慢随机摆动）。
    //   · ignoreModifiers：显式标记「本武器读取 t.base 而非 t.stats」。
    // #W-I（2026-10-20 用户裁定改口径）：榴弹炮曲射模式 = **副武器**（不是技能）。
    //   用户原话：「该模式更改主炮为曲射武器，行进速度将为最大速度的 1/3。只能发射当前生效的
    //   he 弹种，未直接命中时按距离计算伤害，直接命中时，按坦克最薄的装甲值作为命中部位来计算
    //   伤害。可越过掩体，瞄准器变成一个在鼠标位置的一个虚线圈…升级卡牌提供爆炸范围升级
    //   （仅对该模式生效，直射模式时不生效）、急速射」。
    //   ⇒ 装进**副武器槽**后：主炮切曲射（副武器槽本身不发射，只作为模式载体）；
    //     卸下/换掉即回直射。F 键不响应（与 turret 同属"自主/被动"例外）。
    //   实际参数读 WEAPON_DEFAULTS.primary.howitzer（单一口径）；此处只占类型位。
    howitzer:    { range: 900, reload: 2.2 },
    // #5（2026-10-19 用户反馈「检查副武器伤害等参数…升级卡牌是否能生效」）：
    //   **把此前散落在 fireActiveSecondary 各分支的字面量全部收口进缺省表**（#U39 的延续）——
    //   此前 `pen`（除 turret 外 5/6 类都没有键）与 mortar/rocket 的 `speed` 只存在于
    //   `typeof cfg.pen === 'number' ? cfg.pen : 硬编码` 的回退里，升级卡写 `statOverrides`
    //   **理论上能覆盖**，但缺省表里查不到这些键 ⇒ 数据审计/文档都会漏掉它们的存在。
    //   数值与原字面量逐一对应（零行为变化）：
    //     mortar pen 60 / speed 350 · rocket pen 90 / speed 450 · missile pen 250 / speed 320
    //     missile_wire pen 260 / speed 340（原已收口，此处为完整性列出）
    turret:      { reloadMult: 1.6, damageMult: 0.6, penMult: 0.75, spreadMult: 1.3, range: 800,
                   turretTurnRate: 2.5,
                   damageFromBaseRatio: 0.5,   // 伤害 = t.base.damage × 0.5
                   ignoreModifiers: true,      // 参数绑主炮基础，不受技能/卡牌影响
                   idleWanderRate: 0.6,        // 待机摆动角速度（rad/s）
                   idleWanderRange: 0.9 },     // 待机摆动幅度（±rad，约 ±51°）
    mortar:      { range: 450, aoe: 90, reload: 8, damage: 60, pen: 60, speed: 350, isArc: true, accuracySpread: 0.05 },
    missile:     { guided: true, mode: 'lock', reload: 12, damage: 140, range: 600, speed: 320, pen: 250, lockArcDeg: 30, lockSeconds: 1.0 },
    // #U39（2026-10-18）：补 speed（飞行速度，fireActiveSecondary 的 wire 分支消费；
    //   此前缺省只在代码里写死 340，升级卡无法覆盖）。range 目前仅供 AI/面板展示。
    missile_wire:{ guided: true, mode: 'wire', reload: 10, damage: 150, range: 700, speed: 340, pen: 260 },
    // 2026-09-19 #D4（用户反馈）：火箭巢改连续快速逐发——burstInterval=发际间隔（秒），
    // count 发逐发射出后才进入整组装填 reload；fxScale=弹体视觉缩放（drawShells 尺寸通道）。
    rocket:      { count: 4, reload: 10, burstInterval: 0.18, damage: 35, range: 500, speed: 450, pen: 90, direct: true, aoe: 40, fxScale: 1.3 },
    // #U39（2026-10-18）：blastRadius/triggerRadius 由硬编码收口进缺省表，升级卡可覆盖
    //（此前 fireActiveSecondary 的 mine_layer 分支直接写死 70/45，"阔域地雷"类升级卡无处生效）。
    mine_layer:  { duration: 30, reload: 15, damage: 100, blastRadius: 70, triggerRadius: 45 },
    // 2026-10-23（本批新增，用户需求 5）：战术烟幕发射器。
    //   与既有 `RULES.smoke`（radius 120 / duration 5 / maxClouds 8）分工：
    //     · 本表管**发射**（一次抛几团、抛多远、散布多大、装填多久）；
    //     · RULES.smoke 管**单团烟雾**的半径/存续与全场云数上限（spawnSmokeCloud 内部消费）。
    //   落地形态：一次 F 在炮口前方抛射 `cloudCount` 团，横向偏移由 `spreadPx` 控制，
    //   形成一道烟墙（不是单点一团）。烟幕的**视线遮断**走 smokeBlocksLoS，
    //   **隐蔽加成**走 camouflageTerrainBonus（两条独立通道）。
    smoke:       { reload: 14, range: 260, cloudCount: 3, spreadPx: 70, duration: 5 }
  }
};

function getWeaponDefaults(category, type) {
  const cat = WEAPON_DEFAULTS[category];
  if (!cat) return {};
  return cat[type] || cat[Object.keys(cat)[0]] || {};
}

// 兼容旧坦克 JSON 转换为 weapons 结构
function normalizeTankWeapons(spec) {
  if (!spec) return { primary: { type: 'standard', stats: {} }, secondary: { type: 'none', stats: {} } };
  if (spec.weapons) {
    return {
      primary: {
        type: (spec.weapons.primary && spec.weapons.primary.type) || 'standard',
        stats: Object.assign({}, getWeaponDefaults('primary', (spec.weapons.primary && spec.weapons.primary.type) || 'standard'), spec.weapons.primary ? spec.weapons.primary.stats : {})
      },
      secondary: {
        type: (spec.weapons.secondary && spec.weapons.secondary.type) || 'none',
        stats: Object.assign({}, getWeaponDefaults('secondary', (spec.weapons.secondary && spec.weapons.secondary.type) || 'none'), spec.weapons.secondary ? spec.weapons.secondary.stats : {})
      }
    };
  }
  // Fallback for legacy specs
  return {
    primary: { type: 'standard', stats: getWeaponDefaults('primary', 'standard') },
    secondary: { type: 'none', stats: getWeaponDefaults('secondary', 'none') }
  };
}

// #U42（2026-10-19）：副炮塔位姿解析器——纯位姿函数定义在 js/tank_battledraw.js（绘制层），
//   但浏览器端本模块先加载 ⇒ 惰性取值；Node 端 require 兜底；两处都取不到时返回 null（回退主炮口）。
function _secondaryTurretPoseFn() {
  if (typeof secondaryTurretPose === 'function') return secondaryTurretPose;
  if (typeof require !== 'undefined') {
    try {
      const bd = require('./tank_battledraw.js');
      if (bd && typeof bd.secondaryTurretPose === 'function') return bd.secondaryTurretPose;
    } catch (e) { /* 绘制层不可用（纯逻辑测试环境）→ 走回退 */ }
  }
  return function () { return null; };
}

// 阶段六 6.2：副炮塔（secondary turret）自主开火循环（机制验证，Boss 侧先行）。
// 行为：自动索敌最近敌人（复用 nearestEnemyTo），独立炮塔角 secondaryTurretAngle 向目标转向，
// 独立装填计时 secondaryReloadT，射速/穿深/伤害/散布全部读主炮对应值 × WEAPON_DEFAULTS 削弱系数。
// 与主炮解耦：不占用 shooter.reloadT / turretAngle / ammoKey；弹体直接入 shells 管线（复用
// stepShells/resolveHit 判定）。ctx 显式注入（shells/nearestEnemyTo/gunRoot/gunTip/gaussian/
// spawnMuzzleFlash/playSound/debuffReloadRate/computeAmmoConfig），浏览器缺省回退全局。
function updateSecondaryTurret(t, dt, ctx) {
  const c = ctx || {};
  const w = t && t.weapons && t.weapons.secondary;
  if (!w || w.type !== 'turret') return false;
  if (t.hp <= 0) return false;
  const shells = c.shells || (typeof globalThis !== 'undefined' && globalThis.shells);
  if (!shells) return false;
  const nearestEnemyTo = c.nearestEnemyTo || (typeof globalThis !== 'undefined' && globalThis.nearestEnemyTo) || (function(){ return null; });
  const debuffReload = c.debuffReloadRate || (typeof globalThis !== 'undefined' && globalThis.debuffReloadRate) || (function(){ return 1; });
  const gaussian = c.gaussian || (typeof globalThis !== 'undefined' && globalThis.gaussian) || (function(){ return 0; });
  const muzzle = c.spawnMuzzleFlash || (typeof globalThis !== 'undefined' && globalThis.spawnMuzzleFlash) || (function(){});
  const play = c.playSound || (typeof globalThis !== 'undefined' && globalThis.playSound) || (function(){});
  const computeAmmoConfig = c.computeAmmoConfig || (typeof globalThis !== 'undefined' && globalThis.computeAmmoConfig) || null;
  const R = c.RULES || c.rules || (typeof globalThis !== 'undefined' && globalThis.RULES) || {};
  const T = c.coverTiers || (typeof globalThis !== 'undefined' && globalThis.COVER_TIERS) || (R.coverTiers || {});
  const find = c.findCoversOnPath || (typeof globalThis !== 'undefined' && globalThis.findCoversOnPath) || null;
  const gunRoot = c.gunRoot || (typeof globalThis !== 'undefined' && globalThis.gunRoot) || null;
  const gunTip = c.gunTip || (typeof globalThis !== 'undefined' && globalThis.gunTip) || null;
  if (!nearestEnemyTo || !gunRoot || !gunTip || !find) return false;

  // 独立装填计时（秒级递减；与主炮 reloadT 互不干扰）
  if (!(t.secondaryReloadT > 0)) t.secondaryReloadT = 0;
  if (t.secondaryReloadT > 0) t.secondaryReloadT -= dt;

  const cfg = w.stats || {};
  const maxRange = (typeof cfg.range === 'number') ? cfg.range : 400;
  const turnRate = (typeof cfg.turretTurnRate === 'number') ? cfg.turretTurnRate : 2.5;
  if (typeof t.secondaryTurretAngle !== 'number') t.secondaryTurretAngle = t.turretAngle || 0;

  // #4（2026-10-19 用户裁定）：「**待机时随机方向摆动**，进入交战范围后立即转动攻击
  //   距离最近的敌人」。⇒ 待机摆动必须在**索敌之前**、且**不受装填门控**（装填中也要摆）。
  //   摆动实现：以 `_secondaryIdleBase`（首次进入待机时的角度）为中心做正弦游走，
  //   而非纯随机 —— 正弦保证「缓慢连续」，随机会导致抖动。
  const target0 = t;   // 占位，真正索敌在下方
  {
    // 先算「最近敌人是否在射程内」以决定是否待机
    let inRange = false;
    if (nearestEnemyTo) {
      const near = nearestEnemyTo(t);
      if (near && near.hp > 0) {
        const dx0 = near.x - t.x, dy0 = near.y - t.y;
        if (dx0 * dx0 + dy0 * dy0 <= maxRange * maxRange) inRange = true;
      }
    }
    if (!inRange) {
      // 待机：缓慢摆动。基准角度取「首次待机角度」，保证来回摆而不是单向漂。
      if (typeof t._secondaryIdleBase !== 'number') t._secondaryIdleBase = t.secondaryTurretAngle;
      if (typeof t._secondaryIdlePhase !== 'number') t._secondaryIdlePhase = Math.random() * Math.PI * 2;
      const rate = (typeof cfg.idleWanderRate === 'number') ? cfg.idleWanderRate : 0.6;
      const range = (typeof cfg.idleWanderRange === 'number') ? cfg.idleWanderRange : 0.9;
      t._secondaryIdlePhase += rate * dt;
      t.secondaryTurretAngle = t._secondaryIdleBase + Math.sin(t._secondaryIdlePhase) * range;
      return false;   // 待机不索敌、不开火
    }
    // 进入交战范围 ⇒ 清除待机状态，立刻转向最近敌人（下方逻辑）
    delete t._secondaryIdleBase;
    delete t._secondaryIdlePhase;
  }

  if (t.secondaryReloadT > 0) return false;

  const target = nearestEnemyTo(t);
  if (!target || target.hp <= 0) return false;

  const d2 = (target.x - t.x) * (target.x - t.x) + (target.y - t.y) * (target.y - t.y);
  if (d2 > maxRange * maxRange) return false;

  // 炮塔向目标转向（独立副塔角；转速来自削弱系数 turretTurnRate）
  const desired = Math.atan2(target.y - t.y, target.x - t.x);
  let diff = desired - t.secondaryTurretAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const maxStep = turnRate * dt;
  t.secondaryTurretAngle = t.secondaryTurretAngle + Math.max(-maxStep, Math.min(maxStep, diff));

  // #4d（2026-10-19 用户反馈「副炮塔在遇敌时会射击，但是**没有射击最近的敌人**」）：
  //   根因：装填就绪后**不等转到位就开火**——上一帧瞄着 A，这帧索敌切到更近的 B，
  //   本帧只转了一小步就照旧击发，炮弹沿旧朝向飞出去（散布再叠加），观感即「开火但
  //   不打当前目标」。现加**瞄角闸**：只有当炮口与目标的角差 ≤ 本帧最大转角 +
  //   小容差（0.05 rad ≈ 2.9°，吸收散布前的硬性对准要求）才允许开火；
  //   否则本帧只转向不射击（下一帧继续追）。目标切换时天然经过此闸，弹道不再漂移。
  const aimTol = Math.max(maxStep, 0.05);
  if (Math.abs(diff) > aimTol) return false;   // 尚未对准：只转不打

  // 炮管掩体贯穿判定（复用主炮同款：barrelCovers solid → 截停计装填）
  const rootP = gunRoot(t), tipP = gunTip(t);
  // #U42（2026-10-19 用户反馈「副炮塔似乎没有效果」）：**弹道起点必须来自副炮塔本身**。
  //   旧实现直接复用主炮的 gunRoot/gunTip ⇒ 子弹与炮口特效都从**主炮口**飞出，与主炮
  //   完全无法区分（实测 tip 与主炮 gunTip 逐位相同），玩家看到的就是「多了个装饰、没多一门炮」。
  //   现行：起点取副炮塔位姿（与绘制层 tank_battledraw.secondaryTurretPose 严格同源），
  //   副炮塔未就绪（老数据/无位姿）时回退主炮口，不抛错。
  //   注意加载顺序：tank_battledraw.js 在本模块**之后**加载（浏览器），故惰性取值 + require 兜底。
  // #4c（2026-10-19）：`secondaryTurretPose` 现返回**车体局部坐标**（相对车体中心、未含
  //   hullAngle——与绘制层 `translate(t.x,t.y)+rotate(hullAngle)` 的变换口径一致）。
  //   炮弹要用**世界坐标**，故在此把 pose（及沿角度伸出的炮口）经 hullAngle 旋转 + 车体平移
  //   换算到世界；pose 缺失时回退主炮口（gunTip，本就是世界系）。
  const secPoseRaw = _secondaryTurretPoseFn()(t);
  let secMuzzle = null;
  if (secPoseRaw) {
    // 2026-10-23 修复：`secondaryTurretPose` 返回的是**世界坐标**（pose.x/y 已含
    //   t.x/t.y 与炮塔角旋转），此前按「车体局部坐标」再做 hullAngle 旋转 + 车体平移，
    //   把坐标多变换一次 ⇒ 炮弹从错误位置发射（观感「副炮塔没效果」）。
    //   现行直接把 pose 当世界系用，与绘制层严格同源。
    const wx = secPoseRaw.x;
    const wy = secPoseRaw.y;
    const mx = wx + Math.cos(secPoseRaw.angle) * (secPoseRaw.barrelLen + secPoseRaw.radius * 0.6);
    const my = wy + Math.sin(secPoseRaw.angle) * (secPoseRaw.barrelLen + secPoseRaw.radius * 0.6);
    secMuzzle = { x: mx, y: my, rootX: wx, rootY: wy };
  }
  const muzzleX = secMuzzle ? secMuzzle.x : tipP.x;
  const muzzleY = secMuzzle ? secMuzzle.y : tipP.y;
  let solid = null;
  if (find && rootP && tipP) {
    const bRootX = secMuzzle ? secMuzzle.rootX : rootP.x;
    const bRootY = secMuzzle ? secMuzzle.rootY : rootP.y;
    const barrelCovers = find(bRootX, bRootY, muzzleX, muzzleY);
    if (barrelCovers && barrelCovers.length) {
      solid = barrelCovers.find(function(v){ const m = T[v.cover.tier] && T[v.cover.tier].mode; return m === 'solid' || m === 'single'; }) || null;
    }
  }
  if (solid) {
    t.secondaryReloadT = ((t.stats ? t.stats.reload : 1) * (cfg.reloadMult != null ? cfg.reloadMult : 1.6)) / debuffReload(t);
    return false;
  }

  // 开火：主炮数值 × 削弱系数（reload ×1.6 / dmg ×0.6 / pen ×0.75 / spread ×1.3）
  const reloadMult = (typeof cfg.reloadMult === 'number') ? cfg.reloadMult : 1.6;
  const dmgMult = (typeof cfg.damageMult === 'number') ? cfg.damageMult : 0.6;
  const penMult = (typeof cfg.penMult === 'number') ? cfg.penMult : 0.75;
  const spreadMult = (typeof cfg.spreadMult === 'number') ? cfg.spreadMult : 1.3;
  // #4（2026-10-19 用户裁定）：「固定使用 ap 弹、伤害为基础参数的 1/2、其他参数与主炮基础
  //   参数绑定、**不受其他技能影响**」。
  //   ⇒ 用 `t.base`（出厂/配置基础值，**不含任何 modifier**）而非 `t.stats`
  //     （后者已聚合技能 timed / 卡牌 run / 升级 permanent）。这就是「不受技能影响」的实现。
  const baseStats = (cfg.ignoreModifiers !== false && t.base) ? t.base
    : (t.stats || { reload: 1, damage: 1, penetration: 1, shellSpeed: 1, spread: 1 });
  // #4：固定 AP——不读 `t.ammoKey`、不走 `computeAmmoConfig`（后者会叠加玩家的弹种改造卡）
  const ammo = (R.ammoTypes && R.ammoTypes.ap) || {};
  const ox = muzzleX, oy = muzzleY;
  // #W3（2026-10-19）：散布此前读 `baseStats.sigma`，但 **tank.stats 没有 sigma 字段**
  //   （sigma 是实体运行时字段、由 updateSigma 维护，主炮 tank_fire.js 读的是 shooter.sigma）
  //   ⇒ 副炮塔散布恒为 gaussian(0)，比主炮还准。改读实体上的 sigma。
  const spreadAngle = t.secondaryTurretAngle + gaussian(((t.sigma || 0)) * spreadMult);
  const dx = Math.cos(spreadAngle), dy = Math.sin(spreadAngle);
  // #U42：炮口特效同样落在副炮塔口（0.55 缩放，与「缩小版炮塔」体量匹配；主炮是 0.8）
  muzzle(ox, oy, spreadAngle, 0.55, (t.barrel && t.barrel.muzzle) || 'none');
  play('fire');
  // #4：伤害 = 主炮基础伤害 × 0.5（不乘 damageMult、不乘 ammo.dmg、不加 ammo.dmgAdd）
  const dmgRatio = (typeof cfg.damageFromBaseRatio === 'number') ? cfg.damageFromBaseRatio : 0.5;
  shells.push({
    x: ox, y: oy,
    // #W3（2026-10-19）：曳光起点此前用 secMuzzle.rootX/Y —— 那是副炮塔**座圈中心**，
    //   不是炮口 ⇒ 弹道起点 (x,y) 正确、拖尾起点错，抛物曳光从炮塔中心冒出。改用炮口。
    fx: ox, fy: oy,
    dx: dx, dy: dy,
    // #U42：标记来源，绘制层可据此把副炮塔弹画细一档（不与主炮弹混淆）
    fromSecondaryTurret: !!secMuzzle,
    speed: Math.max(200, (baseStats.shellSpeed || 1) * (ammo.speed || 1)),
    pen: (baseStats.penetration || 1) * (ammo.pen || 1) * penMult + (ammo.penAdd || 0),
    dmg: Math.max(0, (baseStats.damage || 1) * dmgRatio),
    ammo: ammo, ammoKey: 'ap', shooter: t, hitPref: 'auto',
    canBounce: true, bounced: false, dist: 0, dead: false
  });
  t.secondaryReloadT = (baseStats.reload * reloadMult) / debuffReload(t);
  return true;
}

function updateSecondaryMount(t, dt, ctx) {
  const w = t && t.weapons && t.weapons.secondary;
  if (!w || !w.type || w.type === 'none' || w.type === 'turret') return false;
  if (t.hp <= 0) return false;
  // #D4：火箭巢逐发队列优先驱动（burst 进行中接管 secondaryReloadT 计时）
  if (w.type === 'rocket' && t._rocketBurst) updateRocketBurst(t, dt, ctx);
  // 2026-09-15 W2：锁定式反坦克导弹走锁定流程（±30° 扇形选目标 → 1s 锁定 → 自动发射）
  if (w.type === 'missile') return updateMissileLock(t, dt, ctx);
  if (!(t.secondaryReloadT > 0)) t.secondaryReloadT = 0;
  if (t.secondaryReloadT > 0) {
    t.secondaryReloadT -= dt;
    return false;
  }
  const nearestEnemyTo = (ctx && ctx.nearestEnemyTo) || (typeof globalThis !== 'undefined' && globalThis.nearestEnemyTo) || function(){ return null; };
  const target = nearestEnemyTo(t);
  if (!target || target.hp <= 0) return false;
  const cfg = Object.assign({}, getWeaponDefaults('secondary', w.type), w.stats || {});
  const maxRange = (typeof cfg.range === 'number') ? cfg.range : 500;
  const dist = Math.hypot(target.x - t.x, target.y - t.y);
  if (dist > maxRange) return false;
  return fireActiveSecondary(t, ctx, target);
}

// 2026-09-15 W2：锁定式反坦克导弹锁定机制（用户裁定）。
// 行为：装填就绪后，在炮管朝向（turretAngle）±lockArcDeg 扇形、射程内选择最近目标开始锁定；
// 锁定耗时 lockSeconds（期间目标死亡/出扇形/出射程则立即重新选择）；锁定完成自动发射制导弹
// （guided:true + mode:'lock'，stepShells 既有引导）。2026-09-17 #C4e 起玩家已无主/副切换概念
// （activeWeaponSlot 移除）：玩家与 AI 的副武器导弹锁定均由调用方逐帧驱动 `updateMissileLock`
//（玩家侧见 tank_battle.html 主循环；AI 侧见 updateSecondaryWeapon），无「激活槽位」门控。
function updateMissileLock(t, dt, ctx) {
  const c = ctx || {};
  const w = t && t.weapons && t.weapons.secondary;
  if (!w || w.type !== 'missile') return false;
  if (t.hp <= 0) return false;
  // 2026-10-23（用户裁定「按 1 次生效 1 次」）：在飞导弹结束前不重新索敌锁定，
  //   否则锁定计时会在导弹飞行途中又走满一次（表现为「一个节点内持续发射」）。
  if (t._missileInFlight && !t._missileInFlight.dead) return false;
  const cfg = Object.assign({}, getWeaponDefaults('secondary', 'missile'), w.stats || {});
  // #7（2026-10-15）：锁定距离 = 摄像机视角内（视口对角线一半），不再用固定 range
  //
  // #5（2026-10-19 用户反馈「升级卡牌是否能生效」取证发现的缺陷）：
  //   旧实现**只要 `cam` 存在就无条件用视口对角线覆盖 `cfg.range`** —— 而 battle 的 fireCtx
  //   总是带 cam ⇒ 「射程 600→780」这类 range 升级卡在玩家侧**恒失效**（卡面数字是假的）。
  //   现改为：锁定距离 = **max(卡面 range, 视口对角线一半)**——升级卡把 range 抬高到超出
  //   视口时才真正生效；不升级时视口仍占优（维持 #7 的「不锁视野外敌人」语义）。
  let maxRange = (typeof cfg.range === 'number') ? cfg.range : 600;
  const cam = c.cam || (typeof globalThis !== 'undefined' && globalThis.cam);
  if (cam && cam.vw > 0 && cam.vh > 0) {
    const viewRange = Math.hypot(cam.vw, cam.vh) / 2;
    if (viewRange > maxRange) maxRange = viewRange;
  }
  const lockArcDeg = (typeof cfg.lockArcDeg === 'number') ? cfg.lockArcDeg : 30;
  const lockSeconds = (typeof cfg.lockSeconds === 'number') ? cfg.lockSeconds : 1.0;
  const lockArcCos = Math.cos(lockArcDeg * Math.PI / 180);

  // 装填计时（锁定只在就绪后进行；装填中锁定进度保持冻结）
  if (!(t.secondaryReloadT > 0)) t.secondaryReloadT = 0;
  if (t.secondaryReloadT > 0) {
    t.secondaryReloadT -= dt;
    return false;
  }

  const ents = c.entities || (typeof globalThis !== 'undefined' && globalThis.entities) || [];
  const isHostile = c.isHostile || (typeof globalThis !== 'undefined' && globalThis.isHostile) || function(){ return true; };

  // 扇形内最近目标（±lockArcDeg @ turretAngle，射程内，存活敌对）
  const aimA = t.turretAngle || 0;
  const ax = Math.cos(aimA), ay = Math.sin(aimA);
  let best = null, bestD2 = Infinity;
  for (const e of ents) {
    if (!e || e.hp <= 0 || e.isDrone) continue;
    if (!isHostile(t.team, e.team)) continue;
    const ex = e.x - t.x, ey = e.y - t.y;
    const d2 = ex * ex + ey * ey;
    if (d2 > maxRange * maxRange) continue;
    const d = Math.sqrt(d2) || 1;
    if ((ex * ax + ey * ay) / d < lockArcCos) continue;   // 出扇形
    if (d2 < bestD2) { bestD2 = d2; best = e; }
  }

  // 现有锁定失效（目标死亡/出扇形/出射程/被更近目标替代）→ 重新选择
  if (t._missileLock) {
    const L = t._missileLock;
    const dead = !L.target || L.target.hp <= 0;
    let outOfCone = false;
    if (!dead) {
      const ex = L.target.x - t.x, ey = L.target.y - t.y;
      const d = Math.hypot(ex, ey) || 1;
      if (d > maxRange || (ex * ax + ey * ay) / d < lockArcCos) outOfCone = true;
    }
    if (dead || outOfCone || (best && best !== L.target)) {
      t._missileLock = best ? { target: best, t: 0 } : null;
    }
  } else if (best) {
    t._missileLock = { target: best, t: 0 };
  }
  if (!t._missileLock) return false;

  // 锁定计时推进
  t._missileLock.t += dt;
  if (t._missileLock.t < lockSeconds) return false;

  // 锁定完成 → 自动发射制导弹
  const target = t._missileLock.target;
  const fired = fireActiveSecondary(t, ctx, target);
  t._missileLock = null;
  return !!fired;
}

// #D4（2026-09-19）：火箭巢单发发射原语——fireActiveSecondary rocket 分支与
// updateRocketBurst 逐发驱动共用。每发独立解算当前 HEAT 弹种状态（伤害跟随主弹种
// 升级，原语义保留）；口焰/烟/音效逐发触发（旧齐射实现只触发一次）。
function fireRocketOne(t, ctx, cfg, angle) {
  const c = ctx || {};
  const shells = c.shells || (typeof globalThis !== 'undefined' && globalThis.shells);
  if (!shells || !t || t.hp <= 0) return false;
  const gaussian = c.gaussian || (typeof globalThis !== 'undefined' && globalThis.gaussian) || (function(){ return 0; });
  const muzzle = c.spawnMuzzleFlash || (typeof globalThis !== 'undefined' && globalThis.spawnMuzzleFlash) || (function(){});
  const play = c.playSound || (typeof globalThis !== 'undefined' && globalThis.playSound) || (function(){});
  const spawnSmoke = c.spawnSmoke || (typeof globalThis !== 'undefined' && globalThis.spawnSmoke) || null;
  const gunTip = c.gunTip || (typeof globalThis !== 'undefined' && globalThis.gunTip) || (function(u){ return {x: u.x + Math.cos(u.turretAngle||0)*30, y: u.y + Math.sin(u.turretAngle||0)*30}; });
  const computeAmmoConfig = c.computeAmmoConfig || (typeof globalThis !== 'undefined' && globalThis.computeAmmoConfig) || null;
  const R = c.RULES || c.rules || (typeof globalThis !== 'undefined' && globalThis.RULES) || {};
  const tipP = gunTip(t);
  const heatKey = getEffectiveHeatAmmoKey(t);
  const heatAmmoCfg = computeAmmoConfig ? computeAmmoConfig(t, heatKey) : ((R.ammoTypes && R.ammoTypes[heatKey]) || (R.ammoTypes && R.ammoTypes.he) || { dmg: 1, pen: 1 });
  const baseDmg = (typeof cfg.damage === 'number') ? cfg.damage : 35;
  const basePen = (typeof cfg.pen === 'number') ? cfg.pen : 90;
  const dmg = Math.round(baseDmg * (heatAmmoCfg.dmg || 1) + (heatAmmoCfg.dmgAdd || 0));
  const pen = Math.round(basePen * (heatAmmoCfg.pen || 1) + (heatAmmoCfg.penAdd || 0));
  const aoe = (typeof cfg.aoe === 'number') ? cfg.aoe : 40;
  const rocketSplash = (heatAmmoCfg.splashRadius > 0) ? heatAmmoCfg.splashRadius : aoe;
  const spd = (typeof cfg.speed === 'number') ? cfg.speed : 450;
  const rocketAmmo = Object.assign({}, heatAmmoCfg, {
    color: '#ffaa33',
    tail: 'rgba(255,170,60,0.85)',
    splashRadius: rocketSplash
  });
  const a = angle + gaussian(0.02);
  const dx = Math.cos(a), dy = Math.sin(a);
  shells.push({
    x: tipP.x, y: tipP.y, fx: tipP.x, fy: tipP.y, dx: dx, dy: dy,
    speed: spd, pen: pen, dmg: dmg, direct: true,
    fxScale: (typeof cfg.fxScale === 'number') ? cfg.fxScale : 1.3,
    splashRadius: rocketSplash,
    ammo: rocketAmmo,
    ammoKey: heatKey, shooter: t, hitPref: 'auto',
    canBounce: false, bounced: false, dist: 0, dead: false
  });
  muzzle(tipP.x, tipP.y, a, 1.0, 'he');
  if (spawnSmoke) {
    for (let i = 0; i < 3; i++) spawnSmoke(tipP.x - dx * 12, tipP.y - dy * 12, 45, 0.8);
  }
  play('fire');
  return true;
}

// #D4（2026-09-19）：火箭巢逐发队列驱动——_rocketBurst = { left, lastAngle }。
// 由接线层逐帧调用（玩家 battle 主循环 / AI updateSecondaryMount 顶部）：
// burst 期间 secondaryReloadT 作为发际间隔（burstInterval），队列清空后写入整组装填 cfg.reload。
// #X4（2026-10-20 用户裁定「火箭弹朝炮塔正前方」）：追发弹**不再**逐发重选最近敌人（那会让
// 整组跟着目标转头），改为沿用整组基础角度 lastAngle（= 首发的炮塔朝向），每发只叠加
// fireRocketOne 内的独立散布 ⇒ 扇形齐射。`lastAngle` 仍在首发时写入，故组内角度恒定。
function updateRocketBurst(t, dt, ctx) {
  const b = t && t._rocketBurst;
  if (!b) return false;
  if (!t.weapons || !t.weapons.secondary || t.weapons.secondary.type !== 'rocket') { t._rocketBurst = null; return false; }
  if (t.hp <= 0) { t._rocketBurst = null; return false; }
  const c = ctx || {};
  const debuffReload = c.debuffReloadRate || (typeof globalThis !== 'undefined' && globalThis.debuffReloadRate) || (function(){ return 1; });
  const cfg = Object.assign({}, getWeaponDefaults('secondary', 'rocket'), t.weapons.secondary.stats || {});
  const burstInterval = (typeof cfg.burstInterval === 'number') ? cfg.burstInterval : 0.18;
  if (t.secondaryReloadT > 0) {
    t.secondaryReloadT -= dt;
    if (t.secondaryReloadT > 0) return false;   // 发际间隔未到（dt 跨帧超额则本帧立即发射）
  }
  // #X4：角度 = 整组基础角度（缺省回退当前炮塔朝向）——committal burst，整组同一指向
  const angle = (typeof b.lastAngle === 'number') ? b.lastAngle : (t.turretAngle || 0);
  const fired = fireRocketOne(t, c, cfg, angle);
  b.left -= 1;
  b.lastAngle = angle;
  if (!fired || b.left <= 0) {
    t._rocketBurst = null;
    const reload = (typeof cfg.reload === 'number') ? cfg.reload : 10;
    t.secondaryReloadT = reload / debuffReload(t);
  } else {
    t.secondaryReloadT = burstInterval / debuffReload(t);
  }
  return true;
}

function getEffectiveHeatAmmoKey(tank) {
  if (!tank) return 'he';
  const HEAT_HIERARCHY = ['heavy_tandem_heat', 'tandem_heat', 'heatfs', 'heat'];
  const loadout = (tank.ammoLoadout && Array.isArray(tank.ammoLoadout)) ? tank.ammoLoadout : [tank.ammoKey || 'he'];
  for (const k of HEAT_HIERARCHY) {
    if (loadout.includes(k)) return k;
  }
  if (tank.unlockedAmmo && Array.isArray(tank.unlockedAmmo)) {
    for (const k of HEAT_HIERARCHY) {
      if (tank.unlockedAmmo.includes(k)) return k;
    }
  }
  return 'he';
}

// #A21（2026-09-15）：手动主动击发副武器（左键/空格按激活槽位分发；右键击发已于 W2 移除）
function fireActiveSecondary(t, ctx, targetPos) {
  const c = ctx || {};
  const w = t && t.weapons && t.weapons.secondary;
  if (!w || !w.type || w.type === 'none') return false;
  if (t.hp <= 0) return false;
  if (t.secondaryReloadT > 0) return false;

  const cfg = Object.assign({}, getWeaponDefaults('secondary', w.type), w.stats || {});
  const shells = c.shells || (typeof globalThis !== 'undefined' && globalThis.shells);
  const nearestEnemyTo = c.nearestEnemyTo || (typeof globalThis !== 'undefined' && globalThis.nearestEnemyTo) || (function(){ return null; });
  const debuffReload = c.debuffReloadRate || (typeof globalThis !== 'undefined' && globalThis.debuffReloadRate) || (function(){ return 1; });
  const gaussian = c.gaussian || (typeof globalThis !== 'undefined' && globalThis.gaussian) || (function(){ return 0; });
  const muzzle = c.spawnMuzzleFlash || (typeof globalThis !== 'undefined' && globalThis.spawnMuzzleFlash) || (function(){});
  const play = c.playSound || (typeof globalThis !== 'undefined' && globalThis.playSound) || (function(){});
  const gunRoot = c.gunRoot || (typeof globalThis !== 'undefined' && globalThis.gunRoot) || (function(u){ return {x: u.x, y: u.y}; });
  const gunTip = c.gunTip || (typeof globalThis !== 'undefined' && globalThis.gunTip) || (function(u){ return {x: u.x + Math.cos(u.turretAngle||0)*30, y: u.y + Math.sin(u.turretAngle||0)*30}; });
  const computeAmmoConfig = c.computeAmmoConfig || (typeof globalThis !== 'undefined' && globalThis.computeAmmoConfig) || null;
  const R = c.RULES || c.rules || (typeof globalThis !== 'undefined' && globalThis.RULES) || {};

  const rootP = gunRoot(t), tipP = gunTip(t);
  const target = targetPos || nearestEnemyTo(t) || { x: t.x + Math.cos(t.turretAngle || 0) * 300, y: t.y + Math.sin(t.turretAngle || 0) * 300 };

  switch (w.type) {
    case 'mortar': {
      if (!shells) return false;
      const maxRange = (typeof cfg.range === 'number') ? cfg.range : 450;
      const tDist = Math.hypot(target.x - tipP.x, target.y - tipP.y);
      const useDist = Math.min(tDist, maxRange);
      const angle = Math.atan2(target.y - tipP.y, target.x - tipP.x);
      const accSpread = (typeof cfg.accuracySpread === 'number') ? cfg.accuracySpread : 0.05;
      const spreadAngle = angle + gaussian(accSpread);
      const dx = Math.cos(spreadAngle), dy = Math.sin(spreadAngle);
      const targetX = tipP.x + dx * useDist;
      const targetY = tipP.y + dy * useDist;
      muzzle(tipP.x, tipP.y, spreadAngle, 0.9, 'he');
      play('fire');
      const aoe = (typeof cfg.aoe === 'number') ? cfg.aoe : 90;
      // 迫击炮弹种固定为 HESH 计算机制（碎甲/内部爆轰/大溅射）
      const heshCfg = computeAmmoConfig ? computeAmmoConfig(t, 'hesh') : ((R.ammoTypes && R.ammoTypes.hesh) || { dmg: 1.5, pen: 0.7, nonPenRatio: 0.8 });
      const baseDmg = (typeof cfg.damage === 'number') ? cfg.damage : 60;
      const basePen = (typeof cfg.pen === 'number') ? cfg.pen : 60;
      const dmg = Math.round(baseDmg * (heshCfg.dmg || 1) + (heshCfg.dmgAdd || 0));
      const pen = Math.round(basePen * (heshCfg.pen || 1) + (heshCfg.penAdd || 0));
      const mortarAmmo = Object.assign({}, heshCfg, {
        color: '#ffb454',
        tail: 'rgba(255,180,84,0.7)',
        splashRadius: aoe,
        ignoreCover: true
      });
      shells.push({
        x: tipP.x, y: tipP.y, fx: tipP.x, fy: tipP.y, dx: dx, dy: dy,
        targetX: targetX, targetY: targetY, totalDist: useDist,
        speed: 350, pen: pen, dmg: dmg,
        isArc: true, ignoreCover: true, splashRadius: aoe,
        ammo: mortarAmmo,
        ammoKey: 'hesh', shooter: t, hitPref: 'auto',
        canBounce: false, bounced: false, dist: 0, dead: false
      });
      const reload = (typeof cfg.reload === 'number') ? cfg.reload : 8;
      t.secondaryReloadT = reload / debuffReload(t);
      return true;
    }
    case 'missile': {
      if (!shells) return false;
      // 2026-10-23（用户裁定）：「按 1 次生效 1 次，导弹击中、消失后进入冷却时间」——
      //   在飞弹未结束前拒绝再次击发（`_missileInFlight` 由 battle 弹体清理段在弹体死亡时释放并写装填）。
      if (t._missileInFlight && !t._missileInFlight.dead) return false;
      // #A21：手动击发（targetPos 为鼠标世界点，纯点无 hp）→ 制导弹沿指向该点方向直飞
      // （guided:true 但 target=null，stepShells 无存活 target 时保持初始方向，即沿鼠标方向），
      // 不再回退 nearestEnemyTo 自动寻的；自动路径（updateSecondaryMount/updateMissileLock 传入
      // 存活实敌，hp>0）保持锁定追尾不变。
      const targetEnemy = (target && target.hp > 0) ? target : null;
      const angle = Math.atan2((targetEnemy ? targetEnemy.y : target.y) - tipP.y, (targetEnemy ? targetEnemy.x : target.x) - tipP.x);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      muzzle(tipP.x, tipP.y, angle, 0.7, 'none');
      play('fire');
      // 伤害机制跟随玩家 HEAT 弹种升级状态（未升级时按主武器 HE 弹，升级到 T-HEAT 等按对应机制）
      const heatKey = getEffectiveHeatAmmoKey(t);
      const heatAmmoCfg = computeAmmoConfig ? computeAmmoConfig(t, heatKey) : ((R.ammoTypes && R.ammoTypes[heatKey]) || (R.ammoTypes && R.ammoTypes.he) || { dmg: 1, pen: 1 });
      const baseDmg = (typeof cfg.damage === 'number') ? cfg.damage : 140;
      const basePen = (typeof cfg.pen === 'number') ? cfg.pen : 250;
      const dmg = Math.round(baseDmg * (heatAmmoCfg.dmg || 1) + (heatAmmoCfg.dmgAdd || 0));
      const pen = Math.round(basePen * (heatAmmoCfg.pen || 1) + (heatAmmoCfg.penAdd || 0));
      const spd = (typeof cfg.speed === 'number') ? cfg.speed : 320;
      const missileAmmo = Object.assign({}, heatAmmoCfg, {
        color: '#ff3311',
        tail: 'rgba(255,100,0,0.8)'
      });
      const shell = {
        x: tipP.x, y: tipP.y, fx: tipP.x, fy: tipP.y, dx: dx, dy: dy,
        speed: spd, pen: pen, dmg: dmg,
        guided: true, mode: 'lock', target: targetEnemy,
        ammo: missileAmmo,
        ammoKey: heatKey, shooter: t, hitPref: 'auto',
        canBounce: false, bounced: false, dist: 0, dead: false,
        // 2026-10-23：越障与攻顶标记（用户裁定）——
        //   锁定式仅 overflyChance（50%）概率可飞越低矮掩体；攻顶升级（卡牌授予 statOverrides
        //   .topAttack）时飞越全部低矮掩体并在目标顶部引爆（伤害 ×0.6、穿甲按最薄装甲）。
        overflyLow: (Math.random() < ((R.missiles && R.missiles.lock && typeof R.missiles.lock.overflyChance === 'number') ? R.missiles.lock.overflyChance : 0.5)) || !!cfg.topAttack,
        topAttack: !!cfg.topAttack,
        missileKind: 'missile'
      };
      shells.push(shell);
      t._missileInFlight = shell;      // 单发在飞标记（弹体死亡后才进入冷却）
      t.secondaryReloadT = 0;
      return true;
    }
    case 'missile_wire': {
      if (!shells) return false;
      // 2026-10-23（用户裁定）：同 missile —— 单发在飞期间禁止再次击发，弹体结束后才冷却。
      if (t._missileInFlight && !t._missileInFlight.dead) return false;
      t._secondaryTargetPos = target;
      const angle = Math.atan2(target.y - tipP.y, target.x - tipP.x);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      muzzle(tipP.x, tipP.y, angle, 0.7, 'none');
      play('fire');
      // 伤害机制跟随玩家 HEAT 弹种升级状态
      const heatKey = getEffectiveHeatAmmoKey(t);
      const heatAmmoCfg = computeAmmoConfig ? computeAmmoConfig(t, heatKey) : ((R.ammoTypes && R.ammoTypes[heatKey]) || (R.ammoTypes && R.ammoTypes.he) || { dmg: 1, pen: 1 });
      const baseDmg = (typeof cfg.damage === 'number') ? cfg.damage : 150;
      const basePen = (typeof cfg.pen === 'number') ? cfg.pen : 260;
      const dmg = Math.round(baseDmg * (heatAmmoCfg.dmg || 1) + (heatAmmoCfg.dmgAdd || 0));
      const pen = Math.round(basePen * (heatAmmoCfg.pen || 1) + (heatAmmoCfg.penAdd || 0));
      const spd = (typeof cfg.speed === 'number') ? cfg.speed : 340;
      const missileAmmo = Object.assign({}, heatAmmoCfg, {
        color: '#ff5522',
        tail: 'rgba(255,120,50,0.8)'
      });
      const shell = {
        x: tipP.x, y: tipP.y, fx: tipP.x, fy: tipP.y, dx: dx, dy: dy,
        speed: spd, pen: pen, dmg: dmg,
        guided: true, mode: 'wire',
        ammo: missileAmmo,
        ammoKey: heatKey, shooter: t, hitPref: 'auto',
        canBounce: false, bounced: false, dist: 0, dead: false,
        // 2026-10-23（用户裁定）：线导式**默认**可越过低矮掩体（非建筑/岩石等全高障碍）；
        //   攻顶升级（卡牌 statOverrides.topAttack）时顶攻引爆。
        overflyLow: true,
        topAttack: !!cfg.topAttack,
        missileKind: 'missile_wire'
      };
      shells.push(shell);
      t._missileInFlight = shell;
      t.secondaryReloadT = 0;
      return true;
    }
    case 'rocket': {
      // #D4（2026-09-19）：同帧齐射改连续逐发——本次仅发射第 1 发并登记 _rocketBurst
      // 队列（剩余 count-1 发经 updateRocketBurst 按 burstInterval 逐发驱动），随后进入
      // 整组装填 reload（队列清空时写入）。旧实现同帧 push 全部 count 发。
      // #X4（2026-10-20 用户裁定「火箭弹应朝炮塔正前方」）：基础角度**不再解算到 target**
      //   （此前 atan2(target−tipP) 让火箭弹朝鼠标点飞，与炮塔指向脱钩）。现恒取炮塔朝向，
      //   整组共用该角度；每发散布仍由 fireRocketOne 的 `angle + gaussian(0.02)` 独立采样
      //   ⇒ 保持「扇形齐射」手感而非同点重叠。其他副武器（mortar/missile/turret/mine_layer）
      //   仍按 target 解算，语义不变。
      const baseAngle = (typeof t.turretAngle === 'number') ? t.turretAngle : 0;
      const count = (typeof cfg.count === 'number') ? cfg.count : 4;
      const fired = fireRocketOne(t, c, cfg, baseAngle);
      if (!fired) return false;
      if (count > 1) {
        t._rocketBurst = { left: count - 1, lastAngle: baseAngle };
        const burstInterval = (typeof cfg.burstInterval === 'number') ? cfg.burstInterval : 0.18;
        t.secondaryReloadT = burstInterval / debuffReload(t);
      } else {
        const reload = (typeof cfg.reload === 'number') ? cfg.reload : 10;
        t.secondaryReloadT = reload / debuffReload(t);
      }
      return true;
    }
    case 'mine_layer': {
      let spawnMineFn = c.spawnMine;
      if (!spawnMineFn) {
        if (typeof spawnMine === 'function') spawnMineFn = spawnMine;
        else if (typeof require !== 'undefined') {
          try { spawnMineFn = require('./tank_deployables.js').spawnMine; } catch (e) {}
        }
      }
      if (!spawnMineFn) return false;
      const angle = (t.hullAngle || 0) + Math.PI;
      const mx = t.x + Math.cos(angle) * 45;
      const my = t.y + Math.sin(angle) * 45;
      const dmg = (typeof cfg.damage === 'number') ? cfg.damage : 100;
      const dur = (typeof cfg.duration === 'number') ? cfg.duration : 30;
      // #U39（2026-10-18）：爆炸/触发半径走 cfg（缺省表 + 升级卡 statOverrides），
      //   不再写死 70/45——「阔域地雷」类升级卡据此生效。
      const blastRadius = (typeof cfg.blastRadius === 'number') ? cfg.blastRadius : 70;
      const triggerRadius = (typeof cfg.triggerRadius === 'number') ? cfg.triggerRadius : 45;
      spawnMineFn({
        team: t.team,
        x: mx,
        y: my,
        damage: dmg,
        blastRadius: blastRadius,
        triggerRadius: triggerRadius,
        duration: dur,
        registry: c.deployables || (typeof globalThis !== 'undefined' && globalThis.deployables) || null
      });
      // 2026-10-22（第五批 B2-1 用户裁定）：**单发布雷路径同样不再设地雷总数上限**——
      //   原 #E4 的「超限时最早布设的地雷直接消失」（enforceDeployLimits('mine')）已删除；
      //   雷场/布雷只受「雷场槽位」限制（tank_battle.html 的 activeMineFieldSlots），
      //   单发地雷不占槽位、也不淘汰旧雷。
      play('ui');
      const reload = (typeof cfg.reload === 'number') ? cfg.reload : 15;
      t.secondaryReloadT = reload / debuffReload(t);
      return true;
    }
    case 'smoke': {
      // 2026-10-23（本批新增，用户需求 5）：战术烟幕发射器——一次 F 在炮口前方抛射
      //   `cloudCount` 团烟雾，横向按 `spreadPx` 展开形成烟墙。
      //   依赖解析顺序与既有 spawn 类一致：ctx 注入 → 全局函数 → require 兜底。
      let spawnCloudFn = c.spawnSmokeCloud;
      if (!spawnCloudFn && typeof spawnSmokeCloud === 'function') spawnCloudFn = spawnSmokeCloud;
      if (!spawnCloudFn && typeof require !== 'undefined') {
        try { spawnCloudFn = require('./tank_cover.js').spawnSmokeCloud; } catch (e) {}
      }
      if (!spawnCloudFn) return false;

      // 单团半径/存续的唯一口径是 RULES.smoke（本表只管发射几何）。
      const smokeCfg = (c.RULES || (typeof globalThis !== 'undefined' && globalThis.RULES) || {}).smoke || {};
      const cloudRadius = (typeof smokeCfg.radius === 'number') ? smokeCfg.radius : 120;
      const cloudDuration = (typeof cfg.duration === 'number') ? cfg.duration
        : ((typeof smokeCfg.duration === 'number') ? smokeCfg.duration : 5);

      const aim = (typeof t.turretAngle === 'number') ? t.turretAngle : (t.hullAngle || 0);
      const dist = (typeof cfg.range === 'number') ? cfg.range : 260;
      const count = Math.max(1, (typeof cfg.cloudCount === 'number') ? Math.floor(cfg.cloudCount) : 3);
      const spread = (typeof cfg.spreadPx === 'number') ? cfg.spreadPx : 70;
      // 垂直方向展开（沿烟墙方向），首团居中，其余左右均分。
      const nx = -Math.sin(aim), ny = Math.cos(aim);
      const cx = t.x + Math.cos(aim) * dist;
      const cy = t.y + Math.sin(aim) * dist;
      for (let i = 0; i < count; i++) {
        // 均分展开：count=3 → off ∈ {-spread/2, 0, +spread/2}；count=1 → 0。
        const off = (count === 1) ? 0 : ((i / (count - 1)) - 0.5) * spread;
        spawnCloudFn(cx + nx * off, cy + ny * off, cloudRadius, cloudDuration);
      }
      play('ui');
      const reload = (typeof cfg.reload === 'number') ? cfg.reload : 14;
      t.secondaryReloadT = reload / debuffReload(t);
      return true;
    }
    case 'turret': {
      return updateSecondaryTurret(t, 0.016, ctx);
    }
  }
  return false;
}

// 统一副武器自主开火分发
function updateSecondaryWeapon(t, dt, ctx) {
  if (!t || !t.weapons || !t.weapons.secondary) return false;
  const w = t.weapons.secondary;
  if (!w || w.type === 'none') return false;
  if (w.type === 'turret') return updateSecondaryTurret(t, dt, ctx);
  return updateSecondaryMount(t, dt, ctx);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WEAPON_DEFAULTS,
    getWeaponDefaults,
    normalizeTankWeapons,
    isHowitzerMode,
    toggleHowitzer,
    updateSecondaryTurret,
    updateSecondaryMount,
    updateSecondaryWeapon,
    updateMissileLock,
    fireActiveSecondary,
    fireRocketOne,
    updateRocketBurst
  };
}
// #W-I（2026-10-20）：榴弹炮曲射**模式判据**（唯一口径）。
//   用户裁定：该模式是**副武器**，装进副武器槽后主炮切曲射；卸下/换掉即回直射。
//   ⇒ 判据 = `weapons.secondary.type === 'howitzer'`。
//   #X5（2026-10-20 用户裁定「F = 曲射/直射切换」）：判据再加**运行时开关** `t._howitzerOn`
//   —— 该槽本身不发射，F 对它是模式开关（唯一例外，见 docs/specs/combat.md §8.2）：
//     · 缺省（`undefined`）视为 **true** ⇒ 装上即曲射，保持 #W-I 以来的既有体验；
//     · 显式 `false` ⇒ 曲射关闭，主炮回到直射（弹无 isArc）；
//     · 切换只经 toggleHowitzer（单一定义处），F 的边缘触发由页面层 keydown 承担。
//   消费方：js/tank_fire.js（开火/落点/预检/装填）、js/tank_move.js（1/3 限速）、
//   tank_battle.html（散布圈瞄准器 / F 状态角标）、js/tank_cards.js（模式升级卡的有效性判定）。
function isHowitzerMode(t){
  if (!(t && t.weapons && t.weapons.secondary && t.weapons.secondary.type === 'howitzer')) return false;
  // 默认 true：只有**显式关闭**才算直射（`!== false` 而非真值判断——避免漏字段被当关闭）
  return t._howitzerOn !== false;
}

// #X5（2026-10-20 用户裁定）：曲射/直射**模式开关**——返回切换后的布尔值（true=曲射）。
//   调用契约：
//     · 唯一入口是 F 键的**原生 keydown 边沿**（tank_battle.html 与 mine_layer/missile 同列），
//       严禁主循环逐帧轮询（会每帧翻转，见 docs/specs/combat.md §8.2）；
//     · 切换时清 `_howitzerBurst`：急速射追发队列属旧模式，模式切走后不得继续打出
//       （否则「切到直射」后仍有曲射弹凭空飞出）；
//     · 非 howitzer 槽恒返回 false（不写状态，不抛错）。
function toggleHowitzer(t){
  if (!(t && t.weapons && t.weapons.secondary && t.weapons.secondary.type === 'howitzer')) return false;
  const next = (t._howitzerOn === false);   // 当前关闭 → 打开；当前开启/缺省 → 关闭
  t._howitzerOn = next;
  if (!next) t._howitzerBurst = null;       // 关闭曲射：丢弃未打完的追发队列
  return next;
}
if (typeof globalThis !== 'undefined') {
  globalThis.isHowitzerMode = isHowitzerMode;
  globalThis.toggleHowitzer = toggleHowitzer;
}

