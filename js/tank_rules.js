'use strict';

// tank_rules.js — 集中式机制参数配置（唯一的平衡调整入口）。
// 所有"非坦克自身"的战斗机制数值都收口在这里，带注释便于平衡调整与对照设计文档。
// 必须最先被页面加载（其他模块引用 RULES）。
// ---------------------------------------------------------------
//   ballistics     弹道：跳弹角 / 炮弹极限射程
//   heights        身高（车体/炮塔/掩体高度，米）——决定掩体遮挡与露头概率
//   coverHugDist   掩体遮挡 A1 双档：贴掩体全藏 / 拉开恒定露出
//   coverTiers     掩体种类与显示样式（half=半高渐变 / full=全高实体）
//   spread         射击散布（扩圈缩圈）全套参数
//   speed          速度换算系数（px↔kmh / 功率→加速度 / 刹车）
//   fire           起火燃烧：每秒灼烧伤害 / 时长 / 速度惩罚
//   modules        模块伤害重做相关：倍率 / debuff 时长 / 削弱系数 / 部件分区
//   ammoTypes      弹种表（倍率 + 表现色）
//   shellVisual    炮弹外观视觉参数
// ======================= 机制参数兜底默认值 =======================
const DEFAULT_ARMOR = {
  hull:   { front: 110, side: 38, rear: 26 },
  turret: { front: 140, side: 50, rear: 24 }
};

const RULES = {
  // 默认坦克装甲
  defaultArmor: DEFAULT_ARMOR,
  // ======================= 弹道 =======================
  ballistics: {
    // 跳弹角：入射角（与表面法线夹角）超过该值 → 判定跳弹并反射
    bounceAngle: 70 * Math.PI / 180,
    // 炮弹最大飞行距离（px），超出即销毁
    shellMaxDist: 1800
  },

  // ======================= 瞄准部位选择 =======================
  // 命中车体/炮塔由玩家鼠标沿瞄准线的径向位置决定：
  // 鼠标投影距离比目标最近命中距离大 partProbe 以上 → 打炮塔（上部）；
  // 小 partProbe 以上 → 打车体；落在死区内 → auto（保持炮塔优先默认）。
  aim: {
    partProbe: 12   // 死区（px）：鼠标与目标碰撞距离的判定阈值
  },

  // ======================= 高度系统 =======================
  heights: {
    // heightClass → { hull, turret }: 中坦/重坦车体与炮塔高度（米级抽象）
    medium: { hull: 1.4, turret: 0.9 },   // 总高 2.3m
    heavy:  { hull: 1.8, turret: 1.0 },   // 总高 2.8m
    // 掩体相对高度（与车体高度比较决定露出程度）
    cover: {
      half: 1.4,  // 与中坦车体齐平
      full: 3.0,   // 完全遮蔽一切
      bush: 1.1,   // 灌木丛（纯视线元素，不参与遮挡判定）
      soft: 0.8,   // 栅栏（可穿透软掩体）
      barricade: 1.4, // 沙袋路障（一次性）
      tree: 2.8,   // 树（树干全高，树冠高）
      fallen: 1.1, // 倒树（残骸，与灌木同高；mode none 下高度仅作记录）
      stump: 0.6,  // 树桩（残骸，低矮；地图作者可手动放置）
      rubble: 0.5  // 碎石（残骸，更矮）
    },
    // 炮口高度（米）：弹道射线起点高度（本游戏无弹道下坠）。2026-08-14 C 实验——
    // 半高掩体越掩判定用：攻击方离掩体越近，射线在掩体入口处越高，越容易越过 1.4m 掩体。
    // 旋钮：调高 → 越掩带宽更大（更激进）；调低接近 1.4 → 只有贴掩体才能越掩。
    muzzle: { medium: 1.8, heavy: 2.2 }
  },

  // ======================= 掩体遮挡（纯垂直剖面模型） =======================
  // 1. 中坦在半高掩体后车体 100% 被挡（仅露炮塔）；重坦车体露 25%（75% 被挡），双方炮塔均 100% 露出且可穿过掩体射击。
  // 2. 方向判据（cutoffDist）：掩体须在命中车体前被射线完整穿过，贴掩体时按 16px 容差判定（骑上/压入掩体不遮蔽）。
  // 3. 通行（driveBy）：重坦可开过半高掩体，中坦被挡（MTV 推出）。
  coverRules: {
    mediumHullExposure: 0.0,   // 中坦车体在半高掩体后的露出比例（0 = 100% 阻挡）
    heavyHullExposure: 0.25    // 重坦车体在半高掩体后的露出比例（0.25 = 75% 阻挡，25% 漏出）
  },

  // ======================= 掩体 / 地图元素 =======================
  // 每种 tier 是一个"行为描述"：mode 决定炮弹交互；move 决定坦克通行系数；
  // crushable 决定坦克压过是否摧毁；hp 为耐久（Infinity = 不可破坏）；
  // vision 决定是否遮挡视线（灌木/树冠，未来接 AI 索敌）；toTier 为被摧毁后的残骸；
  // draw 决定渲染类型（box/bush/tree/soft/barricade/stump/rubble）。
  // driveBy：按 heightClass 门控"能否开过去"——半高掩体重坦可越、中坦被挡（MTV 推出）。
  coverTiers: {
    half:       { label: '半高掩体', fill: 'rgba(166,138,60,0.4)',   stroke: '#a68a3c', mode: 'graduated', move: 0.4,  crushable: false, hp: Infinity, vision: false, draw: 'box', driveBy: { heavy: true, medium: false } },
    full:       { label: '全高掩体', fill: 'rgba(106,106,106,0.55)', stroke: '#6a6a6a', mode: 'solid',     move: 1.0,  crushable: false, hp: Infinity, vision: false, draw: 'box' },
    bush:       { label: '灌木丛',   fill: 'rgba(88,130,58,0.28)',   stroke: '#5c8238', mode: 'none',      move: 1.0,  crushable: false, hp: Infinity, vision: true,  draw: 'bush' },
    tree:       { label: '树',       fill: 'rgba(56,88,52,0.42)',    stroke: '#3f5c3c', mode: 'solid',     move: 1.0,  crushable: false, hp: 1,        vision: true,  draw: 'tree', toTier: 'fallen' },
    fallen:     { label: '倒树',     fill: 'rgba(56,72,44,0.35)',    stroke: '#4a5c3a', mode: 'none',      move: 1.0,  crushable: false, hp: Infinity, vision: true,  draw: 'fallen', residueW: 2.4, residueH: 0.5 },
    soft:       { label: '栅栏',     fill: 'rgba(150,118,70,0.4)',   stroke: '#96764a', mode: 'pass',      move: 0.45, crushable: true,  hp: 1,        vision: false, draw: 'soft' },
    barricade:  { label: '沙袋路障', fill: 'rgba(158,128,72,0.55)',  stroke: '#9e8048', mode: 'single',    move: 1.0,  crushable: true,  hp: 1,        vision: false, draw: 'barricade', toTier: 'rubble' },
    stump:      { label: '树桩',     fill: 'rgba(112,74,40,0.65)',   stroke: '#6e4a26', mode: 'graduated', move: 0.6,  crushable: true,  hp: 1,        vision: false, draw: 'stump' },
    rubble:     { label: '碎石',     fill: 'rgba(104,100,92,0.6)',   stroke: '#6a665e', mode: 'graduated', move: 0.6,  crushable: true,  hp: 1,        vision: false, draw: 'rubble' }
  },

  // ======================= 破障（可破坏地图元素） =======================
  breach: {
    heSplashRadius: 24,   // HE 弹销毁瞬间的溅射半径（px）——只伤害可破坏元素，不对坦克溅射
    heCoverDmg: 1         // HE 溅射对单个元素的伤害（树耐久 1，栅栏/沙袋/树桩/碎石 1 击毁）
  },

  // ======================= 散布（summare dimension bloom/shrink） =======================
  spread: {
    base: 0.018,              // 静止基准散布（弧度 σ）
    fireDebuff: 0.020,        // 炮手 debuff（起火/阵亡）额外加量
    moveMax: 0.014,           // 行进中散布上限
    hullRotMax: 0.012,        // 车体转向散布上限
    turretRotMax: 0.018,      // 炮塔旋转散布上限
    bloomRate: 2.0,           // 散布扩散速度
    shrinkRate: 0.15          // 缩圈（集中）速度 — 坦克级设置：三扩系数×散布上限 / 缩圈速度走 base.spreadMult / base.aimSpeed
  },

  // ======================= 速度 / 机动换算 =======================
  speed: {
    kmhFactor: 0.5,            // maxSpeed(px/s) × 0.5 = km/h（HUD 显示）
    pxFactor: 1.6,             // 推进速度 = maxSpeed × pxFactor（px/s）
    accelPowerToPxScale: 180,   // 马力/吨 → px/s² 加速度比例
    brakeFactor: 3.5           // 刹车加速度 = 加速 × brakeFactor
  },

  // ======================= 起火 =======================
  fire: {
    dotRatio: 0.10,            // 燃烧灼伤 = 攻击方标准伤害 × dotRatio / 秒
    dotSeconds: 5,             // 燃烧持续（秒）
    speedMul: 0.5,             // 燃烧时移动速度倍率（×50%）
    fireVisualSeconds: 4       // 起火视觉燃烟时长（秒）
  },

  // ======================= 模块伤害（特性3） =======================
  modules: {
    debuffSeconds: 8,           // 各类模块 debuff 持续时间（秒）
    trackLockDefault: 8,        // 履带被击毁锁定时间（秒），随升级可缩短
    // 伤害倍率：玩家（可随升级增强，读 shooter.stats.ammoMult/crewMult）vs 敌方固定值
    ammo: { player: 2, enemy: 2 },
    crew: { player: 1.2, enemy: 1.2 },
    // 各削弱效果倍率（0~1 = 减速，2 = 加倍；惩罚较早期版本适当调轻）
    rates: {
      reloadHurt: 0.6,          // 装填手/弹药架受伤:装填速度 ×0.6（时间 ×1.67）
      turnHurt: 0.6,            // 驾驶员受伤:转向速度 ×0.6
      speedHurt: 0.6,           // 发动机受伤:最大速度 ×0.6
      spreadHurt: 1.6,          // 炮手受伤:移动扩圈 ×1.6
      commanderDebuff: 0.85     // 车长受伤:全体成员效果 ×0.85
    },
    // 命中部位的局部坐标分区（hull/turret 的局部 x 或走参 s，用于 moduleFromHit）
    zones: {
      trackBound: 0.78,         // |relX|/halfL 超过 → 履带/负重轮
      driverFront: 0.25,        // 车体侧面 relX ≥ → 驾驶员
      ammoRear: -0.25,          // relX < → 发动机；介于两者 → 弹药架
      turretLoader: -0.25,      // 炮塔侧面 relX < → 装填手（否则炮手）
      turretAmmo: -0.62         // 炮塔侧面 relX < → 炮塔尾舱弹药架（装填手身后小范围弹药架）
    },
    // 线段挂载模块系统（tank_designer「模块 Modules」编辑器）：
    // 扁平 6 类模块，每类可挂载多处；每处放置挂在一条车体/炮塔全形边（含前/后接缝边）上，
    // 坐标为该边中点的作者帧坐标；len = 覆盖长度比例、off = 沿边偏移（带中心 = 0.5+off，
    // 均钳制在边内）、mirror = 是否同时镜像到另一侧（默认 true）。向内偏移深度不入 JSON
    // （纯视觉示意带），运行时判定也用它。v2 旧格式（{hull:{key:{x,y,len}}, turret:{...}}）
    // 由 normalizeTankModules 迁移为扁平放置。
    // 履带（track）不是挂载模块：履带碰撞盒 = 现有履带模型前后端一小段距离（车体极前/极后端，
    // 见 zones.trackBound），moduleFromHit 恒自动判定（2026-08-12 设计决策，无需设计器设置）。
    keys: ['driver', 'ammo', 'engine', 'gunner', 'loader', 'commander'],
    legacyPartKeys: {
      hull:   ['driver', 'ammo', 'engine'],
      turret: ['gunner', 'loader', 'ammo', 'commander']
    },
    labels: {
      driver: '驾驶员', ammo: '弹药架', engine: '发动机',
      gunner: '炮手', loader: '装填手', commander: '车长'
    },
    bandDepth: { hull: 10, turret: 8 },   // 模块带向内偏移深度（px，视觉 + 判定共用）
    lenMin: 0.05,                         // len 下限（比例，=5%）；len 上限恒为 1（整条边）
    lenDefault: 0.5                       // 设计器挂载时的默认 len
  },

  // ======================= 弹种（特性（4） =======================
  ammoTypes: {
    ap:   { label: 'AP',   color: '#5cc8ff', speed: 1.0, pen: 1.0, dmg: 1.0, tail: 'rgba(92,200,255,0.6)' },
    apcr: { label: 'APCR', color: '#ff6c5c', speed: 1.2, pen: 1.2, dmg: 0.8, tail: 'rgba(255,106,92,0.6)' },
    he:   { label: 'HE',   color: '#ffb454', speed: 0.6, pen: 0.6, dmg: 1.2, tail: 'rgba(255,180,84,0.6)' }
  },

  // 炮弹视觉
  shellVisual: {
    length: 14,   // 弹体长度（px）
    width: 4,     // 弹体宽度（px）
    tailLen: 18   // 拖尾长度（px）
  },

  // 节点地图（P-08 / DEVELOPMENT.md §6 条目 6）：单局线性节点链的构成参数。
  // 消费方：js/tank_map.js（generateRun/makeNode/scoreNode）。
  nodeMap: {
    nodeScale: 3,                 // 模板尺寸放大倍率：700×400 模板 → 2100×1200 世界
                                  // （摄像机约 1:9 比例；P-05 的 scale 选项）
    runNodeCount: 5,              // 一局节点数（线性链长度）
    speedClearMs: 120000,         // 限时通关阈值（ms）→ 结算速通 +20%
    outpostChance: 0.7,           // 节点出现友军据点的概率
    enemyTankPool: ['dummy'],     // 敌军构成使用的坦克池（tanks/ 中解析，缺省回退默认配置；
                                  // 后续车型多样性里程碑（§6 条目 11）扩充池内容）
    enemyMinDist: 150,            // 敌军彼此最小间距（px）
    enemyMinPlayerDist: 250       // 敌军离玩家出生点最小间距（px）
  },

  // 敌人/友军 AI（P-10 / DEVELOPMENT.md §6 条目 7）：双态行为 + 友军据点消极防御。
  // 消费方：js/tank_ai.js（aiDecide）。
  ai: {
    edgeMargin: 200,        // 摄像机边缘靠近触发宽度（开放问题 2 初版：视口外扩该距离内主动靠近）
    engageRange: 520,       // 主动开火/接战距离（px）
    keepRange: 320,         // 保持距离下限（大于 engage 靠近，小于 close 后退）
    closeRange: 200,        // 太近阈值：后退拉开
    aimTolerance: 0.12,     // 炮塔对准容差（rad）才开火
    allyEngageRange: 460    // 友军据点射程（消极防御，只打射程内敌人）
  },

  // 死亡/复活（P-11 / DEVELOPMENT.md §2.3 / §6 条目 8）。
  // 消费方：js/tank_revive.js（findReviveSpot/reviveTank）。
  revive: {
    baseRevives: 2,          // 基础复活次数（一局开始前可用商店点数购买追加，见 §2.4/M10）
    invulnSeconds: 3,        // 复活后无敌时长（开放问题 3 定值：3 秒）
    reviveRadius: 150        // 复活点 = 友军据点周围半径内随机无障碍点（无据点回退玩家出生点）
  },

  // 难度曲线表（P-13 / DEVELOPMENT.md §6 条目 12 / 开放问题 6）。
  // 消费方：js/tank_map.js（difficultyForIndex / makeNode）。
  // 三杠杆随节点推进（t = index/(count-1)）的涨法：
  //   敌人数量 = 1 + floor(diff × enemyCountMax)
  //   AI 策略复杂度档位 = floor(diff × (aiTierMax+1)) 钳到 [0, aiTierMax]（0=基础索敌/1=主动贴近/2=协同，预留）
  //   数值强度乘数 statMult = 1 + (statMultMax−1) × diff（作用敌军 hp/穿深/伤害）
  difficulty: {
    curveStart: 0.15,        // 首节点难度（t=0）
    curveSpan: 0.8,          // 难度跨度（末节点 = curveStart+curveSpan）
    curvePow: 1.25,          // 曲率（>1 后段加速，模拟"层层推进越打越难"）
    enemyCountMax: 4,        // 敌人数量上限（enemyCount = 1 + floor(diff × 4)）
    aiTierMax: 2,            // AI 策略复杂度档位上限
    statMultMax: 1.5         // 数值强度乘数上限（1.0 → 1.5）
  },

  // 经济与存档（P-14 / DEVELOPMENT.md §2.4 / §6 条目 10）。
  // 消费方：js/tank_economy.js（UPGRADE_DEFS / scoreToPoints / killScore / profile 读写）。
  // 两条独立货币线（§2.4）：局内得分（击杀+节点通关，仅本局）vs 商店点数（死亡转化，跨局永久）。
  economy: {
    killScoreBase: 20,        // 普通敌人击杀得分（Boss 掉落见 bosses/*.json loot.score）
    scoreToPointsRatio: 0.1,  // 死亡时局内得分 → 商店点数 转化比例（10%）
    refreshCost: 10,          // 卡牌三选一刷新费（消耗局内得分，开放问题 5）
    reviveCost: 40,           // 局前购买追加复活次数（商店点数）
    saveVersion: 1,           // 存档版本号（profile.version；不匹配则重置）
    saveKey: 'rogue-tank-save' // localStorage 键名
  }
};

// 距离分档函数已移除（A1 双档模型见 coverHugDist，掩体遮挡不再有连续渐变）

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RULES };
}