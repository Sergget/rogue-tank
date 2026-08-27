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

  // ======================= 视野系统（offset-circle 视野模型） =======================
  // 可视圆心 = 车身位置向鼠标方向偏移 bias × radius，半径 radius；
  // 车内圈 inner × radius 恒常可见（不受偏移影响）。
  vision: {
    radius: 900,   // 视野半径（px）
    bias: 0.35,    // 圆心朝鼠标方向偏移量（×radius）
    inner: 0.45    // 车内圈恒显半径（×radius）
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

  // ======================= 掩体 / 地图元素（P-40 地形类型抽象，docs/specs/map.md §5） =======================
  // 每个 tier 是一个"行为描述"，统一 schema 六属性（§5.1）：
  //   passability     坦克通行系数（0=不可入 / 0.35·0.6=减速 / 1=自由）——旧字段 move 由归一化同步
  //   shellBlock      弹道交互：true=solid 确定性挡弹 / 'single'=挡 1 发 / 'grad'=渐变垂直剖面 / false=炮弹越飞（不入弹道遮蔽查询，#85 裁定）
  //   exposureProfile 遮蔽剖面：'full'=全遮 / 'half'=半高垂直剖面+C 越掩插值 / 'graduated'=渐变无插值 / 'none'=不参与
  //   destructible    耐久语义：数值=可毁 / Infinity=不可毁结构 / null=非结构（水/泥/植被）；运行时 hp 由归一化回填
  //   drawStyle       渲染风格（box/bush/tree/soft/barricade/stump/rubble/water/water-chain/mud/rock-poly/rubble-box）——旧字段 draw 由归一化同步
  //   tierGroup       语义分组（cover/structure/foliage/liquid/ground）——小地图/AI 找掩体消费
  // 其余字段：vision 遮视线 / crushable 压过即毁 / toTier 摧毁残骸链 / driveBy 按 heightClass 门控越障。
  // 旧字段 mode/move/draw 由下方 normalizeCoverTiers 从新 schema 单向派生，供未迁移消费方过渡。
  coverTiers: {
    half:       { label: '半高掩体', fill: 'rgba(150,128,72,0.45)',  stroke: '#2e2410', passability: 0.4,  shellBlock: 'grad',   exposureProfile: 'half',      destructible: Infinity, crushable: false, vision: false, drawStyle: 'box',         tierGroup: 'cover',     driveBy: { heavy: true, medium: false } },
    full:       { label: '全高掩体', fill: 'rgba(165,92,72,0.62)',  stroke: '#b5553f', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: Infinity, crushable: false, vision: true,  drawStyle: 'box',         tierGroup: 'structure' },
    bush:       { label: '灌木丛',   fill: 'rgba(88,130,58,0.28)',   stroke: '#3f9a2e', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: true,  drawStyle: 'bush',        tierGroup: 'foliage' },
    tree:       { label: '树',       fill: 'rgba(56,88,52,0.42)',    stroke: '#2e6e28', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: 1,        crushable: false, vision: true,  drawStyle: 'tree',        tierGroup: 'foliage', toTier: 'fallen' },
    fallen:     { label: '倒树',     fill: 'rgba(56,72,44,0.35)',    stroke: '#4a5c3a', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: true,  drawStyle: 'fallen',      tierGroup: 'foliage', residueW: 2.4, residueH: 0.5 },
    soft:       { label: '栅栏',     fill: 'rgba(150,118,70,0.4)',   stroke: '#96764a', passability: 0.45, shellBlock: false,    exposureProfile: 'none',      destructible: 1,        crushable: true,  vision: false, drawStyle: 'soft',        tierGroup: 'structure' },
    barricade:  { label: '沙袋路障', fill: 'rgba(158,128,72,0.55)',  stroke: '#9e8048', passability: 1.0,  shellBlock: 'single', exposureProfile: 'full',      destructible: 1,        crushable: true,  vision: false, drawStyle: 'barricade',   tierGroup: 'structure', toTier: 'rubble' },
    stump:      { label: '树桩',     fill: 'rgba(112,74,40,0.65)',   stroke: '#6e4a26', passability: 0.6,  shellBlock: 'grad',   exposureProfile: 'graduated', destructible: 1,        crushable: true,  vision: false, drawStyle: 'stump',       tierGroup: 'structure' },
    rubble:     { label: '碎石',     fill: 'rgba(104,100,92,0.6)',   stroke: '#6a665e', passability: 0.6,  shellBlock: 'grad',   exposureProfile: 'graduated', destructible: 1,        crushable: true,  vision: false, drawStyle: 'rubble',      tierGroup: 'structure' },
    // ======================= P-20/P-40：水体/桥梁 + 新地形 =======================
    water:      { label: '水域',     fill: 'rgba(64,156,225,0.5)',   stroke: '#409ce1', passability: 0.4,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'water',       tierGroup: 'liquid' }, // #85：炮弹越飞；#16 改为可涉水（passability 0.4 慢速通行，不再硬阻断）
    river:      { label: '河流',     fill: 'rgba(64,156,225,0.5)',   stroke: '#409ce1', passability: 0.4,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'water-chain', tierGroup: 'liquid' }, // 多段连通水体（segments）；#16 同改为可涉水
    mud:        { label: '烂泥地',   fill: 'rgba(96,72,44,0.45)',    stroke: '#60482c', passability: 0.35, shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'mud',         tierGroup: 'ground' }, // 减速不阻挡、不进弹道遮蔽
    road:       { label: '道路',     fill: 'rgba(122,120,114,0.55)', stroke: '#6e6c66', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'road',        tierGroup: 'ground' }, // 村庄街道：可自由通行、不挡弹、不遮视线（纯地面标识）
    intact:     { label: '完整建筑', fill: 'rgba(165,92,72,0.62)',  stroke: '#b5553f', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: Infinity, crushable: false, vision: true,  drawStyle: 'box',         tierGroup: 'structure' },
    ruined:     { label: '残破建筑', fill: 'rgba(122,114,100,0.5)',  stroke: '#7a7264', passability: 0.6,  shellBlock: 'grad',   exposureProfile: 'half',      destructible: 1,        crushable: false, vision: false, drawStyle: 'rubble-box',  tierGroup: 'structure', toTier: 'rubble', driveBy: { heavy: true, medium: false } },
    rock:       { label: '岩石',     fill: 'rgba(138,138,132,0.85)', stroke: '#6f6f68', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: Infinity, crushable: false, vision: true,  drawStyle: 'rock-poly',   tierGroup: 'structure' },
    bridge:     { label: '桥梁',     fill: 'rgba(139,92,25,0.8)',    stroke: '#8b5c1a', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: 1,        crushable: false, vision: false, drawStyle: 'box',         tierGroup: 'structure' }
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
    shrinkRate: 0.15,         // 缩圈（集中）速度 — 坦克级设置：三扩系数×散布上限 / 缩圈速度走 base.spreadMult / base.aimSpeed
    multFloor: 0.2,           // D3 #A2（2026-08-26）：stats.spreadMult 聚合后的下限钳制——卡牌/升级叠加不得使三扩系数穿越 0 变负
    sigmaFloor: 0.01          // D3 #A2（2026-08-26）：最终生效 σ 下限——floor 作用在合成结果上，负中间值不外泄
  },

  // ======================= 速度 / 机动换算 =======================
  speed: {
    // 2026-08-25 统一换算：kmhFactor=0.4 为唯一 px/s→km/h 系数（HUD/tankKmh 与
    // tank_model 的 stats.maxSpeedKmh 同源同值；旧 PX_PER_METER×3.6 与 CALIBRATED_KMH_FACTOR 双轨已废）
    kmhFactor: 0.4,            // maxSpeed(px/s) × 0.4 = km/h（HUD 显示）
    pxFactor: 1.6,             // 推进速度 = maxSpeed × pxFactor（px/s）
    effMul: 1.3,               // 运行期有效移动速度乘子（地图尺度提速 ~1.3x）；面板 stats.maxSpeed 不变
    accelPowerToPxScale: 130,   // 马力/吨 → px/s² 加速度比例（P-修正：由 180 下调至 130，加速 ramp 略迟缓更"肉"，top speed 不变）
    brakeFactor: 3.5           // 刹车加速度 = 加速 × brakeFactor
  },

  // ======================= 起火 =======================
  fire: {
    dotRatio: 0.10,            // 燃烧灼伤 = 攻击方标准伤害 × dotRatio / 秒
    dotSeconds: 5,             // 燃烧持续（秒）
    speedMul: 0.5,             // 燃烧时移动速度倍率（×50%）
    fireVisualSeconds: 4       // 起火视觉燃烟时长（秒）
  },

  // ======================= 烟幕（P-17 烟幕射击） =======================
  smoke: {
    radius: 120,               // 单团烟雾遮挡半径（px）
    duration: 5,               // 烟雾持续（秒）
    maxClouds: 8               // 场上同时存在的烟雾云上限（防滥用）
  },

  // ======================= 战术卡牌能力（P-17 战术卡牌能力与主动装备拓展） =======================
  // 主动装置/无人机运行时参数（数据契约，schema 先行）：消费方为后续里程碑的
  // strike（炮击）/ shield（护盾）/ drone（无人机）运行时模块；key 白名单与
  // js/tank_cards.js 的 ABILITY_KEYS / DRONE_KINDS 保持一致。
  abilities: {
    // 呼叫战术支援——战术炮击：指定区域延迟 AOE（子目标 1）
    artillery: {
      delay: 2.5,        // 落弹延迟（秒）：从确认目标点到第一发落地
      radius: 110,       // 爆炸半径（px），与 ammoTypes.he.splashRadius 同语义（范围伤害）
      dmgMult: 1.2,      // 伤害倍率（相对攻击方标准伤害）
      shellCount: 3,     // 单次呼叫落弹数（覆盖目标点附近小范围）
      maxStrikes: 3,     // 场上同时预警中的炮击上限（防滥用）
      reload: 15         // 主动能力冷却（秒）
    },
    // 超级装填——主动爆发装填（子目标 3）
    overdrive: {
      reloadMult: 0.45,  // 装填时间倍率（×0.45 ≈ 2.2 倍射速）
      duration: 6,       // 持续（秒）
      cooldown: 20       // 冷却（秒）
    },
    // 战术护盾——定向/全向弹道吸收（子目标 3）
    shield: {
      dirDuration: 8,    // 定向护盾持续（秒）
      omniDuration: 4,   // 全向护盾持续（秒）
      arc: Math.PI / 3,  // 定向吸收角弧度（π/3 ≈ 60°）
      absorbCap: 150,    // 吸收伤害上限（超过后护盾破裂）
      cooldown: 25       // 冷却（秒）
    },
    // 无人机体系（子目标 4）
    drone: {
      scoutRange: 700,     // 侦察指示范围（px）：视口外敌军位置指示箭头（默认视口 960×600，半对角线 ≈566，取 700 覆盖视口外一圈）
      strikeRange: 260,    // 打击无人机近身自动索敌攻击范围（px）
      fireInterval: 2.0,   // 攻击间隔（秒）
      dmgMult: 0.4,        // 伤害倍率（相对攻击方标准伤害）
      orbitDist: 90,       // 环绕玩家距离（px）
      orbitSpeed: 1.2,     // 环绕角速度（rad/s，≈0.19 圈/秒；切线速度 ≈orbitDist×1.2 ≈108px/s）
      orbitLerp: 6,        // 环绕跟随收敛速率（指数阻尼 λ：每帧 k=1−exp(−λ·dt)；越大贴得越紧）
      countMax: 2          // 场上同时存在的无人机上限
    }
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
    // P-49 前自动履带区阈值（仍生效）：|relX|/halfL 超过 → 履带/负重轮
    //（moduleFromHit + tank_designer 履带区渲染共用）。
    zones: {
      trackBound: 0.78,
      // ——以下四键已废弃（P-49 几何分区+概率抽取上线后不再消费；保留仅供旧存档/外部读取兼容，
      //   新代码一律走 zonesV2）——
      driverFront: 0.25,        // [废弃 P-49]
      ammoRear: -0.25,          // [废弃 P-49]
      turretLoader: -0.25,      // [废弃 P-49]
      turretAmmo: -0.62         // [废弃 P-49]
    },
    // P-49 几何分区 + 概率抽取表（唯一消费方 js/tank_geometry.js moduleFromHit）：
    //   炮塔四象限（turretQuadrants）：原点 = 炮塔装甲多边形几何中心（centroid，非座圈中心）、
    //     坐标轴为炮塔局部系（x=炮塔朝向、随炮塔旋转）；左右 = 从炮塔内面向正面时的左右。
    //   车体纵轴区段（hullFrontPivot/hullRearPivot）：t = 击穿点沿车体纵轴投影归一化（0=车头）；
    //     构型由座圈圆心相对车体多边形 centroid 的前后位置决定（前(含重合)=hullFrontPivot，否则 rear）。
    //   区内互斥抽取单分支（按对象键序累积抽样）；权和<1 的余量 → null = 正常结算伤害、
    //     无成员/模块倍率加成。随机源 = 全局 Math.random（回放经 seed 流整体替换保持确定性）。
    zonesV2: {
      turretQuadrants: {
        frontLeft:  { gunner: 0.50, breech: 0.05 },
        frontRight: { commander: 0.30, loader: 0.30, breech: 0.05 },
        rearLeft:   { ammo: 0.50 },
        rearRight:  { ammo: 0.50 }
      },
      hullFrontPivot: [
        { tMin: 0.0, tMax: 0.1, weights: { driver: 0.10, ammo: 0.10 } },
        { tMin: 0.1, tMax: 0.5, weights: { ammo: 0.50 } },
        { tMin: 0.5, tMax: 1.0, weights: { engine: 0.40 } }
      ],
      hullRearPivot: [
        { tMin: 0.0, tMax: 0.5, weights: { engine: 0.40 } },
        { tMin: 0.5, tMax: 0.6, weights: { driver: 0.05, ammo: 0.50 } },
        { tMin: 0.6, tMax: 1.0, weights: { ammo: 0.40 } }
      ]
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
      gunner: '炮手', loader: '装填手', commander: '车长',
      breech: '炮闩'
    },
    bandDepth: { hull: 10, turret: 8 },   // 模块带向内偏移深度（px，视觉 + 判定共用）
    lenMin: 0.05,                         // len 下限（比例，=5%）；len 上限恒为 1（整条边）
    lenDefault: 0.5                       // 设计器挂载时的默认 len
  },

  // ======================= 弹种（特性（4） / P-16：HEAT 与 HE 物理化） =======================
  // 字段：label 显示名 / color HUD 色点 / tail 弹道拖尾 / speed×飞速 / pen×穿深 / dmg×伤害 /
  //       spread×散布（缺省 1）/ noBounce 确定性不跳弹（HEAT 破甲弹 / HE 高爆弹）/
  //       splashRadius HE 爆炸半径（px）——逻辑范围伤害与爆轰特效共用同一数值
  //       （消费方：js/tank_physics.js resolveHit/applySplashAt + mvp 爆轰特效 scale=splashRadius/40）。
  ammoTypes: {
    ap:   { label: 'AP',   color: '#5cc8ff', speed: 1.0, pen: 1.0, dmg: 1.0, tail: 'rgba(92,200,255,0.6)' },
    apcr: { label: 'APCR', color: '#ff6c5c', speed: 1.2, pen: 1.2, dmg: 0.8, tail: 'rgba(255,106,92,0.6)' },
    heat: { label: 'HEAT', color: '#ffd23c', speed: 0.8, pen: 1.4, dmg: 1.0, spread: 1.2, noBounce: true, tail: 'rgba(255,210,60,0.6)' },
    he:   { label: 'HE',   color: '#ffb454', speed: 0.95, pen: 0.7, dmg: 1.0, noBounce: true, splashRadius: 90, tail: 'rgba(255,180,84,0.6)' }
  },

  // ======================= 弹种增益软上限（ISSUE 19） =======================
  // 卡牌叠乘（ammo-card / 改装）对各弹种 dmg/pen/speed 的最终值做软钳制：
  // final[field] ≤ base[field] × ammoTypeCap[field]（per-ammo 独立钳制）。
  // 消费方：js/tank_fire.js computeAmmoConfig（card-author 读取并 clamp 每弹种最终值）。
  ammoTypeCap: { dmg: 2.5, pen: 1.8, speed: 2.0 },

  // 炮弹视觉
  shellVisual: {
    length: 14,   // 弹体长度（px）
    width: 4,     // 弹体宽度（px）
    tailLen: 18   // 拖尾长度（px）
  },

  // P-36/#81 biome 地面配色板（取自 P-44 底色表；water 本批不做背景水体）。
  // 消费方：js/tank_battledraw.js drawGround（底色 + 种子确定性低频色斑）。
  biomes: {
    concrete: { base: '#6a6d6f', alt: ['#54575a', '#7d8082'] },   // 城镇街区/交叉火力广场
    meadow:   { base: '#4e5c33', alt: ['#42502b', '#5f6d40'] },   // 密林/林地/村落
    steppe:   { base: '#8a7a46', alt: ['#796b3d', '#9b8b55'] },   // 开阔走廊/混合障壁广场
    mudland:  { base: '#4a3a28', alt: ['#3e3122', '#59482f'] }    // 泥地主题（预留，本批无模板使用）
  },

  // 节点地图（P-08 / DEVELOPMENT.md §6 条目 6）：单局线性节点链的构成参数。
  // 消费方：js/tank_map.js（generateRun/makeNode/scoreNode）。
  nodeMap: {
    nodeScale: 3,                 // 模板尺寸放大倍率：700×400 模板 → 2100×1200 世界
                                  // （摄像机约 1:9 比例；P-05 的 scale 选项）
    // #77 掩体尺寸收敛：掩体类元素在「模板单位 × nodeScale」之外再乘的 tier 级系数。
    // 调参理由：nodeScale=3 下旧掩体世界尺寸过大（半高墙 240~270px ≈4× 车长、沙袋 180~210px），
    // 收敛到 半高≈1.5~2×车长(100~150px)/全高≈2~3×(150~220px)/沙袋≈1×(60~90px)；
    // 地形标签生成物（pond/river/mud）与树丛不在此表 → 尺寸不受影响。
    coverWorldScale: { half: 0.42, full: 0.42, barricade: 0.32 },
    // #83 敌方集群生成：把同节点的敌军按"簇"布置（而非均匀散点），地图观感更像战术编队
    enemyClusterRadius: 150,       // 簇内成员彼此最大间距（px）
    enemyClusterSizeMin: 3,        // 单簇最小敌数（2026-08-25 数量上调 2→3）
    enemyClusterSizeMax: 6,        // 单簇最大敌数（2026-08-25 数量上调 5→6）
    enemyClusterCountBase: 2,      // 基础簇数（随难度线性叠加；2026-08-25 上调 1→2）
    // #77 低难度 full→half 降级帽：单节点最多降 floor(full数×帽值) 个（≤30%），
    // 保证低难度下每节点仍保留 ≥70% 全高建筑（掩体骨架可读性）。
    fullDowngradeCap: 0.30,
    // #77 cullRate 剔除保护：每模板至少前 N 个全高建筑不被随机剔除（保底掩体骨架）。
    fullCullProtect: 2,
    runNodeCount: 5,              // 一局初始节点数（线性链长度；开放式链下仅作起点，后续 extendRun 追加）
    bossInterval: 5,              // 每第 5 个节点为 Boss 节点（(index+1) % 5 === 0 → index 4/9/14…）
    speedClearMs: 120000,         // 限时通关阈值（ms）→ 结算速通 +20%
    outpostChance: 0.7,           // 节点出现友军据点的概率
    enemyTankPool: ['dummy'],     // 敌军构成使用的坦克池（tanks/ 中解析，缺省回退默认配置；
                                  // 后续车型多样性里程碑（§6 条目 11）扩充池内容）
    enemyMinDist: 150,            // 敌军彼此最小间距（px）
    enemyMinPlayerDist: 250,      // 敌军离玩家出生点最小间距（px）
    // P-38 敌方进度推进：击杀配额 + 镜头外递增生成（消费方 js/tank_map.js reinforcementTick）
    reinforceInterval: 8,         // 两次递增生成的最小间隔（秒）
    maxAlive: 7,                  // 常规节点场上存活敌军上限（初始+增援合计封顶）
    quotaAddBase: 2,              // 配额加项基数：quota = max(初始敌数, 初始 + base + floor(effDiff×scale))
    quotaDiffScale: 6,            // 配额难度系数（effDiff 为该节点有效难度）
    desiredAliveRatio: 0.6,       // 补兵阈值：desiredAlive = ceil(初始敌数×ratio) + floor(effDiff×3)，封顶 maxAlive
    reinforceMargin: 120,         // 增援落点必须在视口 AABB 外扩该值之外（玩家不可见刷兵）
    reinforceOutpostDist: 300     // 增援落点距友军据点最小间距（px）
  },

  // 敌人/友军 AI（P-10 / DEVELOPMENT.md §6 条目 7）：双态行为 + 友军据点消极防御。
  // 现已扩展为多态战术状态机（P-19）：状态包括 Stunned/Flank/Defensive/Search/Patrol。
  // 消费方：js/tank_ai.js（aiDecide）。
  ai: {
    // --- 激活触发（重设计）：距离 + 可见性，与摄像机视野彻底解耦 ---
    // 有效触发距离在实体生成时按难度算好挂 t.aiTriggerDist（js/tank_map.js
    // triggerDistForDifficulty），aiDecideEnemy 读实体字段、缺省回退基准值。
    triggerDistBase: 700,          // 有效触发距离基准（px）：量级取 engageRange(520) 与
                                   // 原视口半宽+edgeMargin(~880) 之间，保证接战前先激活
    triggerDistDiffMultMax: 1.6,   // 难度乘数上限：有效值 = base × lerp(1.0, multMax, 难度归一化)
    triggerHysteresis: 1.25,       // 滞回防抖：脱离接战阈值 = 进入阈值 × 该系数
    engageRange: 520,       // 主动开火/接战距离（px）
    keepRange: 320,         // 保持距离下限（大于 engage 靠近，小于 close 后退）
    closeRange: 200,        // 太近阈值：后退拉开
    aimTolerance: 0.12,     // 炮塔对准容差（rad）才开火
    allyEngageRange: 460,   // 友军据点射程（消极防御，只打射程内敌人）

    // --- P-19 多态状态机参数 ---
    flankZoneAngle: Math.PI / 2,    // 90度：判定" flank 侧向"的角度窗口（相对于目标朝向）
    flankMinDist: 400,              // 开始尝试 flank 状态的最小玩家距离（px）
    flankDist: 300,                 // #76 B：flank 侧翼目标点距自身横向偏移（px）——原 tank_ai.js 硬编码收口
    flankSideSelect: 0.7,           // 选择"远离炮塔指向一侧"的概率/偏向权重（0~1，数值越倾向于总是选远侧）
    defensiveCoverThreshold: 0.6,   // 消极防御时倾向寻找/贴掩体的阈值（0~1）；#76 C6 复用为重坦受创寻掩的血量阈值
    coverSeekRadius: 500,           // #76 C6：重坦受创寻掩的搜索半径（px），找半径内最近 full/half 掩体
    coverArriveDist: 90,            // #76 C6：距背弹面目标点多近算"到位"（px），到位后原地还击
    coverStandoffMargin: 40,        // #76 C6：背弹面外扩边距（px），避免贴墙卡住
    coverHeavyArmorMin: 100,        // #76 C6：「重甲」车体正面装甲阈值（mm），达标或 aiTier≥1 才会寻掩
    // --- tierProfiles（#76 B）：按实体 t.aiTier 索引的档位表；越高级越警觉/越准/越抗晕 ---
    //   engageMul  — 接战距离乘数（高级敌人更远即开火压制）
    //   aimTolMul  — 开火炮塔容差乘数（<1 更准）
    //   stunResist — 抗晕：dazedProbability 减半 + stun 阈值 +0.2
    tierProfiles: [
      {},                                  // tier 0：基础行为，无修正
      { engageMul: 1.1, aimTolMul: 0.8 },  // tier 1：更警觉、更准
      { engageMul: 1.2, aimTolMul: 0.6, stunResist: true }  // tier 2：精英——远距压制、高精度、抗晕
    ],
    defensiveHQRadius: 200,         // 友军据点防御半径（px），保持在该半径内优先驻守
    searchOscillationSpeed: 0.25,   // 搜索状态扫描摆动速度（rad/s），来回扫视的频率
    searchMinLoSBlocked: 2.0,       // 连续 LoS 被遮挡多少秒后触发搜索状态（秒）
    stunModuleThreshold: 0.5,       // 模块 debuff 严重程度阈值（0~1）：超过此值触发惊慌状态
    stunDuration: 3.0,              // 惊慌/呆滞状态持续时间（秒）
    stunImmunityAfter: 2.0,         // stunned 自然结束后免疫窗时长（秒）：期间不再被压入 stunned（防高射速无限连控）
    dazedProbability: 0.3,          // 模块伤害触发惊慌而非直接进入 stun 的概率
    alertRadius: 600,               // 警觉传播半径（px）：敌对 AI 被击中时，该半径内友邻一并警觉（propagateAlert）
    patrolSpeedFactor: 0.8,         // 巡逻/行军状态移动速度因子（相对于基准速度的比例）
    patrolWanderSigma: 0.02,        // 巡逻状态正弦摆动幅度（rad），轻微摆动路径
    patrolWanderSpeed: 1.5,       // 巡逻状态摆动周期频率（rad/s）
    // #83 探头/重部署节奏（消费方 js/tank_ai.js）：探头露头 + 周期性变位
    peekAngleMax: 0.5,            // 探头最大偏摆角（rad）
    peekInterval: [3, 6],         // 探头随机再触发间隔（秒，区间随机）
    reposInterval: [4, 8],        // 重部署（变位）间隔（秒，区间随机）
    // 2026-08-25 装填间隙侧摆：装填期间车体随机侧摆（rad 区间随机，45°~90°）
    sideSwingAngleMin: 0.78,      // 最小侧摆角（≈45°）
    sideSwingAngleMax: 1.57       // 最大侧摆角（≈90°）
  },

  // 死亡/复活（P-11 / DEVELOPMENT.md §2.3 / §6 条目 8）。
  // 消费方：js/tank_revive.js（findReviveSpot/reviveTank）。
  revive: {
    baseRevives: 2,          // 基础复活次数（一局开始前可用商店点数购买追加，见 §2.4/M10）
    invulnSeconds: 3,        // 复活后无敌时长（开放问题 3 定值：3 秒）
    reviveRadius: 150        // 复活点 = 友军据点周围半径内随机无障碍点（无据点回退玩家出生点）
  },

  // 摄像机缩放（P-39 镜头滚轮缩放）。
  // 消费方：js/tank_camera.js（createCamera 缺省 / setZoom 钳制 / updateCamera 阻尼）+ tank_mvp.html（滚轮乘法步进）。
  camera: {
    minZoom: 0.8,            // 最小缩放（拉远下限，视野最大）
    maxZoom: 1.3,            // 最大缩放（推近上限）
    zoomStep: 0.15           // 每格滚轮的乘法步进系数（targetZoom *= 1±zoomStep）
    // 设计理由：区间收敛防不对称优势（拉远信息/拉近瞄准）；步进取 0.15 保证
    // [0.8,1.3] 区间内每格缩放有可感知的观感变化（0.1 时用户反馈"看不出变了"）。
  },

  // 难度曲线表（P-13 / DEVELOPMENT.md §6 条目 12 / 开放问题 6；P-34 开放式链参数化改造）。
  // 消费方：js/tank_map.js（difficultyForIndex / makeNode）。
  // 三杠杆随节点推进的涨法：
  //   敌人数量 = 1 + floor(diff × enemyCountMax)
  //   AI 策略复杂度档位 = floor(diff × (aiTierMax+1)) 钳到 [0, aiTierMax]（0=基础索敌/1=主动贴近/2=协同，预留）
  //   数值强度乘数：P-13 旧三项（maxHp/penetration/damage）已并入下方 entityMults 表（#76 A）。
  // P-34：开放式节点链下 t=index/(count-1) 失效，难度改为索引驱动饱和曲线：
  //   diff = min(curveCap, curveStart + curveSpan·min(1,index/diffSatIndex)^curvePow)
  //   再叠加跨局等级：effDiff = min(diffMax, diff + difficultyLevel×crossRunLevelBonus)
  //   （每终局一次 difficultyLevel+1，下一局整体抬升；数值经 P-34 定表，可微调但需注释说明）
  difficulty: {
    curveStart: 0.15,        // 首节点难度（index=0）
    curveSpan: 0.8,          // 难度跨度
    curvePow: 1.25,          // 曲率（>1 后段加速，模拟"层层推进越打越难"）
    diffSatIndex: 12,        // 曲线饱和索引：index≥12 后基础难度封顶（开放式链的"虚拟末节点"）
    curveCap: 0.95,          // 基础难度封顶值
    crossRunLevelBonus: 0.04,// 每级跨局难度等级对基础难度的线性加成
    diffMax: 1.15,           // 有效难度绝对上限（含跨局加成后钳制）
    // 2026-08-25 敌军难度三键重构（替代旧 enemyStatCapVsPlayer=0.8 单一封顶，旧键已删除；
    // 消费方 tank_mvp.html applyDifficultyMults 需同步接线）。
    // 2026-08-27 #A16 补第四键 speedVsPlayer：把 maxSpeed 页内硬编码 lerp 收口进 RULES，
    // 消除与 entityMults.maxSpeed（同函数先行注入）两套机制打架，并改经 modifiers 注入防 refreshStats 回归。
    // 三键（pen/dmg floor/dmg cap）为相对玩家的封顶/地板绝对值；第四键约束相对玩家速度公式：
    //   targetSpeed = lerp(baseFloor, baseCeil, diffNorm) × randFactor(randMin~randMax 每辆独立) × player.maxSpeed
    penCapVsPlayer: 1.2,     // 敌军穿深上限 = 1.2 × 玩家穿深
    dmgFloorVsPlayer: 0.4,   // 敌军伤害下限 = 0.4 × 玩家伤害
    dmgCapAmmoMult: 0.7,     // 敌军伤害上限 = 0.7 × 玩家所携 ap/apcr/heat 中最终伤害最高者的伤害值
    speedVsPlayer: {         // 敌军极速相对玩家公式（消费方 tank_mvp.html applyDifficultyMults）
      baseFloor: 0.3,        // diffNorm=0 时速度系数下限
      baseCeil: 0.6,         // diffNorm=1 时速度系数上限
      randMin: 0.85,         // 每辆独立随机浮动下限
      randMax: 1.15          // 每辆独立随机浮动上限
    },
    enemyCountMax: 4,        // 敌人数量上限（enemyCount = 1 + floor(diff × 4)）
    aiTierMax: 2,            // AI 策略复杂度档位上限
    statMultMax: 1.5,        // 【已废弃 → entityMults.penetration[1]】保留仅为旧存档/调用兼容
    // #76 A 敌军属性全面难度分化（表驱动）：每键 [diff=0 乘子, diff=diffMax 乘子]，
    // 按 diffNorm = effDiff/diffMax 线性插值（js/tank_map.js entityMultsForDifficulty 消费）。
    // 只作用于敌军实体生成（materializeNode 经 env.applyDifficulty 叠乘到 stats），玩家绝不走此路径。
    // 终值校准说明：生存端 maxHp/armorAll 抬升最高（拖长 TTK、鼓励玩家绕侧打背面），
    // 输出端 damage/penetration 温和（避免一击必杀挫败），机动/火控端小幅强化（更难风筝）。
    entityMults: {
      maxHp:         [0.8, 1.4],   // 生命（易弱难强，下限<1）
      penetration:   [0.75, 1.25], // 穿深
      damage:        [0.75, 1.2],  // 单发伤害
      armorAll:      [0.7, 1.3],   // 装甲全面乘（遍历 hull/turret 各面叠乘）
      reload:        [1.25, 0.82], // 装填时间（易慢难快）
      spreadMult:    [1.3, 0.78],  // 三扩系数（易散难准）
      aimSpeed:      [0.8, 1.35],  // 缩圈速度
      maxSpeed:      [0.7, 1.15],  // 极速
      turnRate:      [0.7, 1.2],   // 车体转速
      turretTurnRate:[0.7, 1.25]   // 炮塔转速
    }
  },

  // P-51：Boss 数据驱动机制参数（弱点命中增益 + 阶段声明式行为脚本）。
  // 消费方：js/tank_ai.js（aiModes，阶段行为模式）；tank_mvp.html（weakspot，弱点结算，Wave 2 接线）。
  boss: {
    weakspot: {
      dmgMul: 1.5,         // 命中当前阶段 weakspots 模块时伤害 ×1.5
      penAdd: 15,          // 穿深 +15mm（穿透判定前加算）
      ignoreBounce: true   // 弱点命中跳过跳弹判定
    },
    aiModes: {
      hold: {},                          // 消极防御（复用友军 passive 语义）
      charge: { keepDist: 0 },           // 全速接敌
      skirmish: { keepDist: 640 }        // 与目标保持距离（风筝）
    },
    // #83 Boss 数值调谐（消费方 js/tank_boss.js / materializeNode）：以"体型放大的普通坦克"为基准
    // 再套下列乘子；hpMul 抬血量、move/turn/turretTurn 放慢、shell/fireRate/dmg 调整输出节奏。
    tuning: {
      hpMul: 8,            // 生命 ×8
      moveMul: 0.5,        // 极速 ×0.5
      turnMul: 0.6,        // 车体转速 ×0.6
      turretTurnMul: 0.6,  // 炮塔转速 ×0.6
      shellMul: 0.8,       // 炮弹威力 ×0.8
      fireRateMul: 0.6,    // 射速 ×0.6（装填时间 ×1/0.6）
      dmgMul: 1.5,         // 单发伤害 ×1.5
      penMul: 1.4,         // 穿深 ×1.4（2026-08-25 新增：Boss 穿深独立乘子，不受敌军 penCapVsPlayer 封顶）
      engageDist: 99999    // #21：Boss 出生即进入交战（巨大触发半径，绕过常规 trigDist 700 / 巡逻/风筝）
    }
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
  },

  // ======================= 真实世界单位标定（以 Tiger I 为基准） =======================
  // Tiger I 真实数据：车长 6.316m（不含炮）、宽 3.73m、高 3.0m、极速 38 km/h、88mm炮弹初速 ~810 m/s (AP)
  // 游戏里 Tiger I 车体顶点：front x=34.5, rear x=-34.5 → 车体长 69px
  // PX_PER_METER = 69 / 6.316 ≈ 10.92 px/m
  // 标定后的换算（2026-08-25 统一）：px/s → km/h 走 RULES.speed.kmhFactor=0.4
  //   - maxSpeed(px/s) × kmhFactor = km/h（tankKmh 与 computeStats.maxSpeedKmh 同源同值）
  //   - shellSpeed(px/s) / PX_PER_METER = m/s
  //   - barrel.len(px) / PX_PER_METER = m
  //   - hullLen(px) / PX_METER = m
  //   - armor mm 保持不变、weight 吨保持不变
  scale: {
    REF_TANK_ID: 'tiger-I',
    REF_HULL_LENGTH_M: 6.316,      // Tiger I 车体长（不含炮），米
    REF_HULL_LENGTH_PX: 69,        // Tiger I 车体长（游戏像素）：front 34.5 - rear (-34.5)
    REF_MAX_SPEED_KMH: 38,         // Tiger I 真实极速 km/h
    REF_SHELL_SPEED_MS: 810,       // Tiger I 88mm AP 弹初速 m/s
    // 计算得出的比例常量
    get PX_PER_METER() { return this.REF_HULL_LENGTH_PX / this.REF_HULL_LENGTH_M; }  // ≈10.92
  },

  // ======================= P-49 全参数极限表（唯一收口） =======================
  // 取值方法：存量四车（tanks/dummy|Leapard_1|Obj 780|tiger-I.json）数值包络 ±30% 后取整；
  // reload 下限 0.5s 为用户既定需求；maxSpeed 上限按用户裁定 ≤150km/h ÷ kmhFactor(0.4) = 375 px/s；
  // weight 上限 80t 为用户裁定（P-49，2026-08-26 细化：仅约束设计器出厂校验）。
  // 设计器保存校验消费方应把输入钳到 [min,max] 区间。
  parameterLimits: {
    maxHp:            { min: 50,  max: 160 },  // 存量 hp 包络 80~120（±30% → 56~156，取整）
    penetration:      { min: 80,  max: 210 },  // 穿深包络 120~160mm（±30% → 84~208）
    damage:           { min: 25,  max: 65 },   // 单发伤害包络 35~50（±30% → 24.5~65）
    reload:           { min: 0.5, max: 3.0 },  // 装填秒数：下限 0.5s 用户既定需求；上限包络 2.0×1.3≈2.6 → 圆整 3.0
    shellSpeed:       { min: 600, max: 2100 }, // 弹速 px/s 包络 1000~1600（±30% → 700~2080）
    maxSpeed:         { min: 60,  max: 375 },  // px/s；max=150km/h÷kmhFactor0.4=375（用户裁定 ≤150km/h）；min 对应 24km/h
    turnRate:         { min: 1.0, max: 3.5 },  // 车体转速 rad/s 包络 1.6~2.5（±30% → 1.12~3.25）
    turretTurnRate:   { min: 1.0, max: 4.0 },  // 炮塔转速 rad/s 包络 1.5~3.0（±30% → 1.05~3.9）
    enginePower:      { min: 200, max: 1200 }, // 马力包络 300~900（±30% → 210~1170）
    spreadMult:       { min: 0.5, max: 3.0 },  // 三扩系数包络 0.8~2.0（±30% → 0.56~2.6）；min 与 RULES.spread.multFloor 同级防穿零
    weight:           { min: 10,  max: 80 },   // 吨：max=80t 为【设计上限】，仅设计器出厂校验（卡牌/局内升级可突破）；下限给超轻底盘留余地
    armor: {                                   // 各面装甲厚度 mm：逐面取包络 ±30%
      hull: {
        front: { min: 40, max: 150 },          // 包络 60~110（±30% → 42~143）
        side:  { min: 25, max: 105 },          // 包络 38~80（±30% → 26.6~104）
        rear:  { min: 15, max: 75 }            // 包络 26~54（±30% → 18.2~70.2）
      },
      turret: {
        front: { min: 55, max: 210 },          // 包络 80~160（±30% → 56~208）
        side:  { min: 35, max: 105 },          // 包络 50~80（±30% → 35~104）
        rear:  { min: 15, max: 80 }            // 包络 24~60（±30% → 16.8~78）
      }
    },
    geometry: {                                // 外形尺寸 px（由 verts 包围盒导出，包络 ±30% 取整）
      hullLen: { min: 40, max: 95 },           // 车体长包络 58~69.6（±30% → 75.4→圆整 95 含余量）
      hullWid: { min: 24, max: 55 },           // 车体宽包络 38~38.4（±30% ≈ 50，留余量 55）
      turLen:  { min: 20, max: 60 },           // 炮塔长包络 31.7~45.5（±30% → 59.2）
      turWid:  { min: 18, max: 48 }            // 炮塔宽包络 34.4~35（±30% ≈ 45.5 → 圆整 48）
    }
  },

  // 运行时重量绝对上限（吨）：卡牌/局内升级可突破 parameterLimits.weight.max(80t) 设计上限，
  // 但 computeStats 聚合后的最终 s.weight 一律钳 ≤ 此值（2026-08-26 用户裁定）。
  weightRuntimeCap: 240
};

// 距离分档函数已移除（A1 双档模型见 coverHugDist，掩体遮挡不再有连续渐变）

// P-40 tier schema 归一化：新六属性（passability/shellBlock/exposureProfile/destructible/
// drawStyle/tierGroup）为唯一事实源；旧字段 move/draw/mode/hp 单向派生，供未迁移消费方
// （tank_move 的 move、渲染层的 draw、tank_fire 等的 mode）过渡使用。派生规则：
//   mode = solid（shellBlock true）/ single / graduated（grad）/ none（vision 遮视线穿透弹）/
//          pass（其余 shellBlock false：栅栏/水/河/泥——炮弹越飞；移动阻断由 passability=0 承担）
(function normalizeCoverTiers(){
  for(const k of Object.keys(RULES.coverTiers)){
    const t = RULES.coverTiers[k];
    if(t.passability === undefined) t.passability = (t.move !== undefined ? t.move : 1.0);
    t.move = t.passability;                       // 旧别名：driveTank 减速系数
    if(t.drawStyle === undefined) t.drawStyle = (t.draw || 'box');
    t.draw = t.drawStyle;                         // 旧别名：渲染层分支
    if(t.shellBlock === undefined){
      // 兜底：自定义/未迁移 tier 按旧 mode 推导
      t.shellBlock = t.mode === 'solid' ? true : t.mode === 'single' ? 'single'
                   : t.mode === 'graduated' ? 'grad' : false;
    }
    if(t.destructible === undefined) t.destructible = t.hp;
    t.hp = (t.destructible === null || t.destructible === undefined) ? Infinity : t.destructible;
    if(t.tierGroup === undefined) t.tierGroup = 'cover';
    if(t.mode === undefined){
      t.mode = t.shellBlock === true ? 'solid'
             : t.shellBlock === 'single' ? 'single'
             : t.shellBlock === 'grad' ? 'graduated'
             : (t.vision ? 'none' : 'pass');
    }
  }
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RULES };
}