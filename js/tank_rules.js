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
  // 敌方可见圆（2026-09-21 #H5 重定义——现行口径）：
  //   可见半径 R = min( screenRadiusRatio × 窄半幅/zoom × (1+视野卡加成), 窄轴前向容量/(1+bias) )
  //   其中窄半幅 = min(vw,vh)/2（屏幕 px）、窄轴前向容量 = (窄半幅 + radius×mouseLeadRatio)/zoom。
  //   ⇒ R 随 zoom 等比补偿（R×zoom 恒定）：敌人在屏幕上的出现位置与缩放无关，
  //     玩家自由缩放（看细节/看全局）不再被「固定像素可见距离」绑架（#H5 用户裁定）。
  //   圆心仍向鼠标方向偏移 bias×R（朝指向侧更远）；车内圈 inner×R 恒常可见。
  //   radius 字段保留为**镜头外延基准**（updateCameraLead）与收口上限的外延项，不再直接定可见距离。
  vision: {
    radius: 900,   // 镜头外延基准（世界 px）；#H5 起不再作为敌方可见距离
    bias: 0.35,    // 圆心朝鼠标方向偏移量（×R）
    inner: 0.45,   // 车内圈恒显半径（×R）
    // #H5：可见半径的屏幕相对比例——1.0 = 恰好内切视口窄轴（前向边界在屏幕容量内、
    // 留外延余量）；<1 留更多反应余量；卡牌加成受同式上限钳制（保持各方向等距）。
    screenRadiusRatio: 1.0
  },

  // ======================= 高度系统 =======================
  heights: {
    // heightClass → { hull, turret }: 中坦/重坦车体与炮塔高度（米级抽象）
    medium: { hull: 1.4, turret: 0.9 },   // 总高 2.3m
    heavy:  { hull: 1.8, turret: 1.0 },   // 总高 2.8m
    // 掩体相对高度（与车体高度比较决定露出程度）
    // 2026-09-20 #E3：`half`（半高掩体）高度项随半高掩体整体移除，不再参与任何判定。
    cover: {
      full: 3.0,   // 完全遮蔽一切
      bush: 1.1,   // 灌木丛（纯视线元素，不参与遮挡判定）
      soft: 0.8,   // 栅栏（可穿透软掩体）
      barricade: 1.4, // 沙袋路障（一次性）
      tree: 2.8,   // 树（树干全高，树冠高）
      fallen: 1.1, // 倒树（残骸，与灌木同高；mode none 下高度仅作记录）
      stump: 0.6,  // 树桩（残骸，低矮；地图作者可手动放置）
      rubble: 0.5  // 碎石（残骸，更矮）
    },
    // 炮口高度（米）：弹道射线的参考高度（本游戏无弹道下坠）。2026-09-20 #E3 起
    // 不再用于「越掩插值」（半高掩体已移除），仅作高度语义记录。
    muzzle: { medium: 1.8, heavy: 2.2 }
  },

  // ======================= 掩体遮挡（确定性模型，2026-09-20 #E1 定案） =======================
  // 炮弹拦截只由确定性掩体承担：shellBlock===true（建筑/岩石/树，含残破建筑）→ 入口点 100% 截停；
  // 'single'（沙袋）→ 挡 1 发（>70° 可跳弹）。概率/剖面（'grad'/'half'）与越掩插值全部移除——
  // 修复用户反馈「炮弹被不可见物体拦截」。
  coverRules: {
    deterministicOnly: true   // 保留字段示意：弹道不再有概率拦截（消费方：tank_fire.stepShells）
  },

  // ======================= 掩体 / 地图元素（P-40 地形类型抽象，docs/specs/map.md §5） =======================
  // 每个 tier 是一个"行为描述"，统一 schema 六属性（§5.1）：
  //   passability     坦克通行系数（0=不可入 / 0.35·0.6=减速 / 1=自由）——旧字段 move 由归一化同步
  //   shellBlock      弹道交互：true=solid 确定性挡弹 / 'single'=挡 1 发 / false=炮弹越飞（不入弹道遮蔽查询）
  //                   （2026-09-20 #E1：'grad' 渐变剖面已废除，确定性挡弹是唯一拦截来源）
  //   exposureProfile 遮蔽剖面：'full'=全遮 / 'none'=不参与（'half'/'graduated' 已随半高掩体移除）
  //   destructible    耐久语义：数值=可毁 / Infinity=不可毁结构 / null=非结构（水/泥/植被）；运行时 hp 由归一化回填
  //   drawStyle       渲染风格（box/bush/tree/soft/barricade/stump/rubble/water/water-chain/mud/rock-poly/rubble-box）——旧字段 draw 由归一化同步
  //   tierGroup       语义分组（cover/structure/foliage/liquid/ground）——小地图/AI 找掩体消费
  // 其余字段：vision 遮视线 / crushable 压过即毁 / toTier 摧毁残骸链 / driveBy 按 heightClass 门控越障。
  // 旧字段 mode/move/draw 由下方 normalizeCoverTiers 从新 schema 单向派生，供未迁移消费方过渡。
  // 2026-09-20 #E3 用户裁定：全高掩体明确衍生为「建筑 / 岩石」，半高掩体（half）及其
  // 垂直剖面/越掩插值计算整体移除（定义删除 + 生成早已屏蔽 + 弹道管线不再消费 grad/half）。
  // 现状：确定性挡弹只由 shellBlock===true（建筑 full/intact/rock/tree）与 'single'（沙袋）承担。
  coverTiers: {
    full:       { label: '建筑', fill: 'rgba(165,92,72,0.62)',  stroke: '#b5553f', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: Infinity, crushable: false, vision: true,  drawStyle: 'box',         tierGroup: 'structure' },
    bush:       { label: '灌木丛',   fill: 'rgba(88,130,58,0.28)',   stroke: '#3f9a2e', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: true,  drawStyle: 'bush',        tierGroup: 'foliage' },
    // 2026-09-20 #E11：树木缩小并由坦克可直接推倒（crushable=true → 压过即倒，转为 fallen）；
    // 逻辑尺寸收敛见 RULES.nodeMap.treeWorldScale（生成期）。仍保留「炮弹 1 发伐倒」。
    tree:       { label: '树',       fill: 'rgba(56,88,52,0.42)',    stroke: '#2e6e28', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: 1,        crushable: true,  vision: true,  drawStyle: 'tree',        tierGroup: 'foliage', toTier: 'fallen' },
    fallen:     { label: '倒树',     fill: 'rgba(56,72,44,0.35)',    stroke: '#4a5c3a', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: true,  drawStyle: 'fallen',      tierGroup: 'foliage', residueW: 2.4, residueH: 0.5 },
    soft:       { label: '栅栏',     fill: 'rgba(150,118,70,0.4)',   stroke: '#96764a', passability: 0.45, shellBlock: false,    exposureProfile: 'none',      destructible: 1,        crushable: true,  vision: false, drawStyle: 'soft',        tierGroup: 'structure' },
    barricade:  { label: '沙袋路障', fill: 'rgba(158,128,72,0.55)',  stroke: '#9e8048', passability: 1.0,  shellBlock: 'single', exposureProfile: 'full',      destructible: 1,        crushable: true,  vision: false, drawStyle: 'barricade',   tierGroup: 'structure', toTier: 'rubble' },
    // #E1/#E3（2026-09-20）：树桩/碎石改为**不挡弹**（shellBlock false）——旧 'grad' 渐变剖面是
    // 「炮弹被不可见小物件拦截」的主要来源之一；残骸类低矮杂物不再参与弹道遮蔽。
    stump:      { label: '树桩',     fill: 'rgba(112,74,40,0.65)',   stroke: '#6e4a26', passability: 0.6,  shellBlock: false,    exposureProfile: 'none',      destructible: 1,        crushable: true,  vision: false, drawStyle: 'stump',       tierGroup: 'structure' },
    rubble:     { label: '碎石',     fill: 'rgba(104,100,92,0.6)',   stroke: '#6a665e', passability: 0.6,  shellBlock: false,    exposureProfile: 'none',      destructible: 1,        crushable: true,  vision: false, drawStyle: 'rubble',      tierGroup: 'structure' },
    // ======================= P-20/P-40：水体/桥梁 + 新地形 =======================
    // 水系裁定（2026-09-14 重做）：水潭/河流可缓速通行（passability 0.4，与烂泥地同级）；
    // 完全浸入（整车四角入水）触发溺毙倒计时（RULES.drowning.seconds，缺省 8s）——
    // 玩家/敌人/Boss 一视同仁；AI 移动决策带绕水转向（tank_ai.applyWaterAvoidance）。
    // 炮弹维持越飞（shellBlock:false，#85 裁定不回退）。
    water:      { label: '水域',     fill: 'rgba(64,156,225,0.5)',   stroke: '#409ce1', passability: 0.4,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'water',       tierGroup: 'liquid' }, // #85：炮弹越飞；减速通行 + 完全浸入溺毙
    river:      { label: '河流',     fill: 'rgba(64,156,225,0.5)',   stroke: '#409ce1', passability: 0.4,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'water-chain', tierGroup: 'liquid' }, // 多段连通水体（segments）；同 water 减速通行 + 溺毙
    mud:        { label: '烂泥地',   fill: 'rgba(96,72,44,0.45)',    stroke: '#60482c', passability: 0.4, shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'mud',         tierGroup: 'ground' }, // 减速不阻挡、不进弹道遮蔽（复查处置：0.35→0.4，与半高掩体同级）
    road:       { label: '道路',     fill: 'rgba(122,120,114,0.55)', stroke: '#6e6c66', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'road',        tierGroup: 'ground' }, // 村庄街道：可自由通行、不挡弹、不遮视线（纯地面标识）
    // #G（2026-09-21 用户需求 #4）：可破坏楼房——完整但可摧毁的砖混建筑：耐久 3，
    // 摧毁后转 ruined 残破建筑（再 1 发 → rubble 碎石， rubble 不挡弹）。链：building→ruined→rubble。
    building:   { label: '楼房',     fill: 'rgba(150,96,78,0.66)',  stroke: '#a24a34', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: 3,        crushable: false, vision: true,  drawStyle: 'box',         tierGroup: 'structure', toTier: 'ruined' },
    intact:     { label: '完整建筑', fill: 'rgba(165,92,72,0.62)',  stroke: '#b5553f', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: Infinity, crushable: false, vision: true,  drawStyle: 'box',         tierGroup: 'structure' },
    // #E3（2026-09-20）：残破建筑归入全高掩体（建筑衍生）——shellBlock true / exposureProfile 'full'，
    // 直射实弹 100% 确定性格挡；hp 1 被击毁后转 rubble 残骸（残骸不再挡弹）。
    ruined:     { label: '残破建筑', fill: 'rgba(122,114,100,0.5)',  stroke: '#7a7264', passability: 0.6,  shellBlock: true,     exposureProfile: 'full',      destructible: 1,        crushable: false, vision: true,  drawStyle: 'rubble-box',  tierGroup: 'structure', toTier: 'rubble' },
    rock:       { label: '岩石',     fill: 'rgba(138,138,132,0.85)', stroke: '#6f6f68', passability: 0,    shellBlock: true,     exposureProfile: 'full',      destructible: Infinity, crushable: false, vision: true,  drawStyle: 'rock-poly',   tierGroup: 'structure' },
    bridge:     { label: '桥梁',     fill: 'rgba(139,92,25,0.8)',    stroke: '#8b5c1a', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: 1,        crushable: false, vision: false, drawStyle: 'box',         tierGroup: 'structure' }
  },

  // ======================= 溺毙（2026-09-14 水域行为重做） =======================
  // 完全浸入水体（车体四角均位于 water/river 覆盖内）后开始溺毙倒计时；
  // 归零即沉没摧毁（hp 归零走正常死亡管线：玩家可复活、敌人计分）。出口即复位。
  // 消费方：tank_mvp.html 战斗主循环（drownT 累计）+ tank_cover.js tankFullyInWater。
  drowning: {
    seconds: 8,            // 溺毙倒计时（秒）
    warnAt: 3              // 剩余该秒数时播报警告音/强化提示
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

  // ======================= #E5（2026-09-20）反坦克导弹制导参数 =======================
  // 两种制导方式（消费方 tank_fire.stepShells guided 分支 / tank_weapons.updateMissileLock）：
  //   lock（锁定式）：F 激活 → 自动索敌（炮塔 ±lockArcDeg 扇形）→ 锁定 lockSeconds → 立即发射；
  //                   飞行用「追尾 + 比例引导（PN）」。
  //   wire（线导式）：F 直接发射 → 鼠标持续引导飞行方向（比例引导，操作者即导引源）。
  missiles: {
    lock: { turnRate: 3.5, navConstant: 3.0 },   // 锁定式：转向率 rad/s + PN 系数 N
    wire: { turnRate: 4.5, navConstant: 0.0 }    // 线导式：转向更快（手动操舵手感），N=0（纯视线跟随鼠标）
  },

  // ======================= 速度 / 机动换算 =======================
  speed: {
    // 2026-08-25 统一换算：kmhFactor=0.4 为唯一 px/s→km/h 系数（HUD/tankKmh 与
    // tank_model 的 stats.maxSpeedKmh 同源同值；旧 PX_PER_METER×3.6 与 CALIBRATED_KMH_FACTOR 双轨已废）
    kmhFactor: 0.4,            // maxSpeed(px/s) × 0.4 = km/h（HUD 显示）
    pxFactor: 1.6,             // 推进速度 = maxSpeed × pxFactor（px/s）
    effMul: 1.3,               // 运行期有效移动速度乘子（地图尺度提速 ~1.3x）；面板 stats.maxSpeed 不变
    accelPowerToPxScale: 15,    // 马力/吨 → px/s² 加速度比例（重校：15 px/s²，使轻坦加速~1.2s满速，重坦~3s满速，带来真实的机械重量感）
    brakeFactor: 2.2            // 刹车加速度 = 加速 × brakeFactor（使滑行减速更具惯性）
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
    super_fire_control: {
      duration: 8,
      spreadMult: 0.3,    // 70% reduction in spread (above multFloor 0.2)
      aimSpeedMult: 3.0,  // 3x aiming speed
      cooldown: 25
    },
    super_speed: {
      duration: 6,
      accelMult: 3.0,     // 3x engine power / accel
      maxSpeedMult: 1.5,  // +50% top speed
      cooldown: 20
    },
    // #G（2026-09-21 用户需求 #9）：主动防御系统（APS，Active Protection System）——
    // 激活后 duration 秒内自动拦截进入 radius 的来袭敌方弹药（炮弹/导弹）：
    // 弹体直接销毁并触发小型拦截特效。maxIntercepts 限制单次激活的拦截数（雷达/发射器弹匣），
    // 拦截满上限后系统仍保持开启但不再拦截。冷却独立（abilityCds.aps）。
    aps: {
      duration: 6,          // 拦截窗口（秒）
      radius: 240,          // 拦截半径（px，车体中心）
      maxIntercepts: 3,     // 单次激活最多拦截数
      cooldown: 22          // 冷却（秒）
    },
    deploy_cover: {
      hp: 200,
      shieldHp: 150,
      duration: 30,
      cooldown: 20,
      dist: 90,          // #C4b（2026-09-17 用户裁定）：部署距离（自车体中心沿炮塔方向，px；取代旧硬编码 50）
      // #E4（2026-09-20 用户裁定）：掩体长度再加长至当前 2 倍（1.6 → 3.2）。
      lenMult: 3.2,
      // #E4 单向透明：部署方阵营的炮弹可穿过掩体，对立方炮弹被 100% 格挡；
      // 视觉上以朝向指示（部署面虚线 + 箭头）标明「我方穿透侧」。
      oneWay: true,
      width: 22          // 掩体厚度（px，旧硬编码 20）
    },
    deploy_limits: {     // #E4 可部署物数量上限（按类型独立计数）+ 升级增量
      coverMax: 2,       // 战术掩体基础上限（升级卡/局内升级各 +1）
      // #J1（2026-09-30 用户反馈「地雷在 1 个节点内似乎只能部署 1 次」）：mineMax 3 → 6。
      //   mineMax 是「**场上同时存在**的地雷数」上限，而地雷存续 30s（升级 45s）、单节点战斗
      //   通常远长于此 —— cap 3 恰好等于单次雷场数量 mineFieldCount(3)，导致首轮布满后
      //   「一个节点只能布 1 次」。上调基础上限使节点内可连续布设多轮（每轮 3 枚），
      //   上限语义仍是「同时在场数」，不是「本局总数」。
      mineMax: 6,
      coverMaxUpgradeStep: 1,
      mineMaxUpgradeStep: 1,
      coverMaxHardCap: 6,
      mineMaxHardCap: 12,
      mineFieldCount: 3,   // #E4 单次雷场布设的地雷数。#H2（2026-09-30）：原值 5 > mineMax(3)，
                           //   与「existing + n ≤ cap」的拒收判据互相矛盾（首轮布满后后续雷场恒被丢弃），
                           //   改为与基础上限自洽；实际落雷数再按**生成时刻的可用余量**裁剪
                           //   n = clamp(count, 0, cap − existing)（tank_mvp.html mineFieldCountNow）。
                           //   想要更大的单次雷场应同步上调 mineMax，而非只调本值。
      mineFieldRadius: 70, // 雷场半径（px，预形态与最终布设一致）
      mineFieldDelay: 4,   // #E4 确认布设后到雷场生成的延时（秒）
      // #H2（2026-09-30）布雷装填冷却：确认预约后写入 player.secondaryReloadT，
      //   冷却中再次按 F 直接拒绝（与单发布雷路径 js/tank_weapons.js 同口径，specs/combat.md §8.1）。
      mineFieldReload: 15,
      // #E4 部署数量升级来源：持有该卡即按 listed 增量累加 deployBonus（可叠多张）
      upgradeCards: {
        ability_deploy_cover_fortified: { cover: 1 },
        weapon_secondary_mine_upgrade: { mine: 1 },
        turret_bunker: { turret: 1 }
      }
    },
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
    critBonusCap: 0.25,        // 单类概率修正加值硬上限 (+25%)
    zoneProbCap: 0.90,         // 修正后单项概率硬上限 (90%)
    sizeFactorMin: 0.7,        // 车体尺寸对模块概率缩放下限
    sizeFactorMax: 1.3,        // 车体尺寸对模块概率缩放上限
    critStatKeys: {
      fireControl: 'fireControlCrit', // 对应 gunner, breech
      loaderAmmo: 'loaderAmmoCrit'    // 对应 loader, ammo
    },
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
  //
  // ======================= 弹种体系扩展（2026-09-13 弹种链定案，PLAN.md 阶段五/六） =======================
  // 14 弹种三链（用户数值总表 2026-09-13，唯一权威）：
  //   KE 链：  ap → apcr → apds → apfsds → apfsds-ad
  //   HEAT 链：heat → heatfs → tandem_heat → heavy_tandem_heat
  //   HE 链：  he → aphe / hesh / proximity_he / blast_he（he 处四向分岔，可并存取用）
  // 升级语义：开局仅 ap/he，卡牌升级 = 弹种在 loadout 槽位内替换（Q/E 循环切换不变）。
  // per-ammo 扩展字段（缺省回退全局 ballistics/modules 基准）：
  //   bounceAngle   强制跳弹角（rad；θ>该值即跳弹，noBounce 弹种忽略）
  //   moduleDraws   模块抽取数量（1/2/3：applyModuleDamage 抽取次数）
  //   ammoMult      弹药架伤害倍率；crewMult 成员和其他模块倍率（缺省回退 stats/modules 基准）
  //   spreadAcc     精度系数（散布 σ ×该值；与卡牌 spread× 相乘）
  //   nonPenRatio   未击穿伤害系数（0=无；>0 走「伤害×(1−(eff−pen)/eff)×k」装甲吸收公式）
  //   nonPenFloor   未击穿伤害下限比例（缺省 0.25）
  //   splashRadius  溅射半径（px，HE 家族；proximity_he 近炸引信按当时 he 基准半径）
  //   proximity     近炸引信（true：弹道不命中目标时，接近率变负处空爆溅射）
  ammoTypes: {
    ap:   { label: 'AP',   color: '#5cc8ff', speed: 1.0, pen: 1.0, dmg: 1.0, bounceAngle: 70, moduleDraws: 1, ammoMult: 2,   crewMult: 1.5, spreadAcc: 1,   nonPenRatio: 0, tail: 'rgba(92,200,255,0.6)' },
    apcr: { label: 'APCR', color: '#ff6c5c', speed: 1.2, pen: 1.2, dmg: 1.0, bounceAngle: 65, moduleDraws: 1, ammoMult: 2,   crewMult: 1.5, spreadAcc: 1,   nonPenRatio: 0, tail: 'rgba(255,106,92,0.6)' },
    apds: { label: 'APDS', color: '#ffa25c', speed: 1.4, pen: 1.4, dmg: 1.2, bounceAngle: 75, moduleDraws: 2, ammoMult: 2,   crewMult: 2,   spreadAcc: 0.9, nonPenRatio: 0, tail: 'rgba(255,162,92,0.7)' },
    apfsds: { label: 'APFSDS', color: '#d8f8ff', speed: 1.8, pen: 1.8, dmg: 1.2, bounceAngle: 85, moduleDraws: 2, ammoMult: 2.5, crewMult: 2,   spreadAcc: 0.8, nonPenRatio: 0, doubleModule: true, tail: 'rgba(216,248,255,0.8)' },
    apfsds_ad: { label: 'APFSDS-AD', color: '#b8f0ff', speed: 1.8, pen: 2.0, dmg: 1.4, bounceAngle: 87, moduleDraws: 2, ammoMult: 2.5, crewMult: 2,   spreadAcc: 0.7, nonPenRatio: 0, doubleModule: true, tail: 'rgba(184,240,255,0.9)' },
    he:   { label: 'HE',   color: '#ffb454', speed: 0.8, pen: 0.5, dmg: 1.5, noBounce: true, splashRadius: 90, splashKnockbackMul: 0.55, moduleDraws: 3, ammoMult: 3,   crewMult: 2,   spreadAcc: 1.2, nonPenRatio: 0.6, tail: 'rgba(255,180,84,0.6)' },
    heat: { label: 'HEAT', color: '#ffd23c', speed: 0.9, pen: 1.5, dmg: 1.0, noBounce: true, bounceAngle: 87, moduleDraws: 1, ammoMult: 2,   crewMult: 1.5, spreadAcc: 1.2, nonPenRatio: 0, tail: 'rgba(255,210,60,0.6)' },
    heatfs: { label: 'HEAT-FS', color: '#ffe27a', speed: 1.2, pen: 1.75, dmg: 1.0, noBounce: true, bounceAngle: 87, moduleDraws: 1, ammoMult: 2,   crewMult: 1.5, spreadAcc: 1.1, nonPenRatio: 0, tail: 'rgba(255,226,122,0.7)' },
    tandem_heat: { label: 'T-HEAT', color: '#ffec9e', speed: 1.2, pen: 2.0, dmg: 1.2, noBounce: true, bounceAngle: 87, moduleDraws: 2, ammoMult: 2,   crewMult: 1.5, spreadAcc: 1.05, nonPenRatio: 0, tail: 'rgba(255,236,158,0.75)' },
    heavy_tandem_heat: { label: 'HT-HEAT', color: '#fff6c0', speed: 1.2, pen: 2.0, dmg: 1.4, noBounce: true, bounceAngle: 87, moduleDraws: 2, ammoMult: 2.5, crewMult: 2,   spreadAcc: 1.1, nonPenRatio: 0, tail: 'rgba(255,246,192,0.85)' },
    aphe: { label: 'APHE', color: '#ffc9a0', speed: 1.0, pen: 1.1, dmg: 1.2, bounceAngle: 70, moduleDraws: 2, ammoMult: 2,   crewMult: 1.5, spreadAcc: 1.1, nonPenRatio: 0, tail: 'rgba(255,201,160,0.6)' },
    hesh: { label: 'HESH', color: '#e8a0ff', speed: 0.8, pen: 0.7, dmg: 1.5, noBounce: true, splashRadius: 100, splashKnockbackMul: 0.7, moduleDraws: 2, ammoMult: 2,   crewMult: 1.8, spreadAcc: 1.1, nonPenRatio: 0.8, tail: 'rgba(232,160,255,0.7)' },
    // #E10（2026-09-20）：HE-VT / HE-OP 增加击退——击退距离 = splashRadius × splashKnockbackMul
    // （「数值和爆炸范围绑定」）。HE-OP(0.95×110=104.5px) > HE-VT(0.6×90=54px)，满足用户要求。
    proximity_he: { label: 'HE-VT', color: '#ffd0b0', speed: 0.9, pen: 0.9, dmg: 1.5, noBounce: true, splashRadius: 90, splashKnockbackMul: 0.6, moduleDraws: 2, ammoMult: 2.5, crewMult: 2,   spreadAcc: 1.1, nonPenRatio: 0.8, proximity: true, tail: 'rgba(255,208,176,0.7)' },
    blast_he: { label: 'HE-OP', color: '#ff9a6c', speed: 0.9, pen: 0.8, dmg: 1.8, noBounce: true, splashRadius: 110, splashKnockbackMul: 0.95, moduleDraws: 3, ammoMult: 3,   crewMult: 2,   spreadAcc: 1.1, nonPenRatio: 0.8, tail: 'rgba(255,154,108,0.8)' }
    // 注：legacy HEC 曲射弹种已按用户裁定移除（2026-09-14）——曲射越障能力由榴弹炮/迫击炮
    // 武器层（isArc + ignoreCover）承担，不再占用独立弹种键。
  },
  // 近炸引信（proximity_he）：弹道沿直线飞行不命中任何目标时，对每个敌方实体计算「接近率」
  // （径向距离变化率 dotProduct，负值=接近）。当最近目标的接近率开始变负（由接近转远离）
  // 时立即空爆，在爆点按 splashRadius 施加溅射伤害。细节见 tank_fire.js stepShells。
  proximityFuze: {
    enabled: true,        // 总开关
    maxTravel: 1400,      // 引信激活最大飞行距离（px，超过按普通未命中处理）
    armRadius: 120,       // 引信武装半径（px）：进入该半径且正在接近才武装（原硬编码 120 收口，2026-09-13）
    minDist: 40           // 空爆点与目标最小距离（px，防贴脸爆自己视野内一帧爆）
  },

  // ======================= 弹种升级链（2026-09-13 阶段六定案；2026-09-15 用户修订为定案三链） =======================
  // key → 链上直接前驱（applyCardEffects 弹种升级卡的自动替换目标；PLAN.md 阶段五表 1）。
  // 用户 2026-09 定案三链（唯一权威）：
  //   KE 链：   ap → apcr → apds → apfsds → apfsds-ad
  //   HE 榴弹链：he → aphe → hesh → proximity_he(he-vt) → blast_he(he-op)
  //   HEAT 链： he → heat → heatfs → tandem_heat(t-heat) → heavy_tandem_heat(ht-heat)
  // 升级语义（用户裁定）：链内升级 = loadout 槽内「直系前驱」原地替换（KE 链替换原 KE 弹种）；
  // HE 处双分支（he→heat / he→aphe）：首条分支「先新增」一个弹种保留 he，槽满后第二条分支再替换 he；
  // 禁止跳级——前驱不在 loadout 时升级卡不生效、不抽到。
  ammoChain: {
    apcr:               'ap',
    apds:               'apcr',
    apfsds:             'apds',
    apfsds_ad:          'apfsds',
    heat:               'he',
    heatfs:             'heat',
    tandem_heat:        'heatfs',
    heavy_tandem_heat:  'tandem_heat',
    aphe:               'he',
    hesh:               'aphe',
    proximity_he:       'hesh',
    blast_he:           'proximity_he'
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

  // ======================= 卡牌抽取（2026-09-19 #D5 调参） =======================
  // 消费方：js/tank_cards.js drawCardChoices。
  cards: {
    // #C3 弹种升级卡保底触发概率：候选池存在「链上前驱已在 loadout」的可解锁升级卡时，
    // 以该概率保证 1 张进入候选（单次抽取独立掷骰）。2026-09-19 #D5 用户反馈「弹种升级
    // 速度太快」——#C3 无条件保底（每节点 1 阶推进）下调为概率触发。
    ammoUpgradeGuaranteeChance: 0.4
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
    coverWorldScale: { half: 0.42, full: 0.42, building: 0.42, barricade: 0.32 },
    // 2026-09-20 #E11：树木单独收敛（用户反馈树太大）——树/倒树/树桩在模板单位 × nodeScale
    // 之外再乘该系数；树冠视觉（tank_assets.bakeCanopy）同步乘同一系数保持视觉-逻辑同源。
    treeWorldScale: 0.6,
    // ======================= 2026-09-20 #E2 路网重做（去横平竖直 + 加宽 + 公路加速） =======================
    // 用户反馈：路网太单调，都是横平竖直。v3 拓扑在保持「贯穿/支路」骨架的同时引入
    // 斜向干道与更强的曲线弯曲，并按权重混入多种朝向。
    road: {
      widthMin: 92,            // 街道条带宽下限（世界 px，旧 60 → 加宽；#E3 公路加宽）
      widthMax: 124,           // 街道条带宽上限（旧 80）
      curveAmp: 0.16,          // 干线弯曲幅度（相对跨度比例，旧 0.04 → 明显弯曲）
      diagChance: 0.45,        // 干线走小角度斜向（而非正东西/正南北）的概率
      diagAngleMin: 0.18,      // 斜向偏角下限（rad ≈10°）
      // #G（2026-09-21）：0.52→0.42→0.34 —— 斜干 × 正交支道的交角 = 90°−θ−干道链段局部斜率
      // （弯曲引入 ≈7°）。实测 0.42 时最小交角 58.2°（<#B7 的 60° 护栏）；0.34(≈19.5°) 留 ≥63° 余量。
      diagAngleMax: 0.34,      // 斜向偏角上限（rad ≈19°）
      branchCurveAmp: 0.10,    // 支路弯曲幅度
      // 2026-09-23 A 档：删除死配置 junctionClearR（0.85）——全仓库零消费，生成器实际用
      // roadW × 0.5 硬编码路口清空半径（js/tank_nodegen.js junctions.push({r: roadW * 0.5})）。
      speedBonusKmh: 10,       // 在公路上行驶的速度加成（km/h，受 maxSpeed 150km/h 上限钳制）
      speedBonusLerp: 6        // 公路上加成生效/失效的阻尼速率（1/s）
    },
    // ======================= 2026-09-20 #E3 建筑沿路聚集 / 路口最密 =======================
    // 建筑（tier 'full'）落位优先级：路口邻域 > 沿路两侧 > 自由散布。
    building: {
      roadBand: 96,            // 「沿路」判定的路缘外扩带（px）：建筑中心在该带内计为沿路
      roadBias: 0.62,          // 非模板建筑的落位被拉向最近路段的概率
      junctionBias: 0.9,       // 建筑落位在路口邻域的概率（高于 roadBias → 路口最密）
      junctionRadius: 210,     // 路口邻域半径（px）
      // #I3（2026-09-21 用户裁定「继续增加建筑密度」）：3~5/18 → 4~8/28
      clusterPerJunction: 4,   // 每个路口额外聚集的建筑数下限
      clusterPerJunctionMax: 8, // 每个路口额外聚集的建筑数上限
      maxPerNode: 28,          // 单节点沿路/路口新增建筑总数的硬上限（防密度失控）
      // #I3：Boss 战图建筑密度乘子（makeNode 对 boss 节点传入 generateNode.buildingDensity）
      bossDensity: 1.6
    },
    // ======================= 2026-09-20 #E3 路口沙包 + 敌人生成点位 =======================
    junctionBarricades: {
      chance: 0.85,            // 路口生成沙包（barricade）阵的概率
      countMin: 2,             // 单路口沙包数下限
      countMax: 4,             // 单路口沙包数上限
      ringMin: 0.9,            // 沙包距路口中心的半径系数（×路宽）下限
      ringMax: 1.9             // 上限（环形布防，留出通行口）
    },
    // 敌方生成候选：优先建筑旁/路口，且随难度提高「集中生成」的敌数（#E6）。
    enemySpawn: {
      structureChance: 0.55,   // 单簇中心落在建筑邻域的概率（低难度基线）
      structureChanceMax: 0.85,// 高难度上限（难度越高越偏向建筑/路口）
      junctionChance: 0.35,    // 在建筑候选中进一步偏向路口的概率
      structureRadius: 130,    // 建筑邻域判定半径（px）
      clusterBonusMin: 0,      // 高难度追加敌簇数下限（#E6：难度越高集中生成数量越多）
      clusterBonusMax: 3       // 上限（diff=1 时追加 3 簇）
    },
    // 敌军世界边界内缩（#E6：修复「敌人跑到地图范围之外」）。AI 移动输出由 mvp 注入
    // worldBounds 钳制；本值为距节点边界的最小内缩量（px，含车体半长余量）。
    enemyBoundsMargin: 56,
    // #83 敌方集群生成：把同节点的敌军按"簇"布置（而非均匀散点），地图观感更像战术编队
    enemyClusterRadius: 150,       // 簇内成员彼此最大间距（px）
    enemyClusterSizeMin: 3,        // 单簇最小敌数（2026-08-25 数量上调 2→3）
    enemyClusterSizeMax: 6,        // 单簇最大敌数（2026-08-25 数量上调 5→6）
    enemyClusterCountBase: 2,      // 基础簇数（随难度线性叠加；2026-08-25 上调 1→2）
    // B 档①（2026-09-23）：防线式敌人生成——取代旧「以玩家出生点为原点的全向环带撒簇」。
    // 沿推进轴（+x，与玩家左缘出生 / Boss 生成点同向）把节点切成若干「防线」桶，每线取 1 个
    // 地形锚点（路口 > 结构 > 水体/林地簇），敌人在锚点周边成批生成（每批 perAnchorMin~Max 辆）。
    // 防线间距随难度收紧 ⇒ 难度越高防线越密；`enabled=false` 回退旧全向环带（对照/调试用）。
    // 消费方：js/tank_map.js planDefenseLines / makeNode。现行总量 4~9 辆/节点（原 1~4）。
    defenseLine: {
      enabled: true,             // false = 回退旧全向环带撒簇路径
      spacingScreens: 0.9,       // 防线基准间距（× 视口宽 vw；1080p ⇒ ≈1728px）
      spacingDiff: [1.15, 0.85], // 间距难度系数（低→高）：难度越高间距越窄 ⇒ 防线数越多
      linesMin: 2,               // 防线数下限（低难度）
      linesMax: 3,               // 防线数上限（高难度；仍受可用推进距离约束）
      anchorsPerLine: 1,         // 每线锚点数（调 2 ⇒ 单节点敌数翻倍，供后续调参）
      perAnchorMin: 2,           // 单锚点敌数下限（低难度）
      perAnchorMax: 3,           // 单锚点敌数上限（高难度）
      maxPerNode: 12,            // 单节点初始敌数上限（防爆炸；现行实际 4~9）
      anchorJunctionChance: 0.45,// 锚点取「路口」的概率（其余取结构/水体/林地簇）
      axisTopFraction: 0.92,     // 推进轴可用终点（× 节点宽 w）
      lineMargin: 300            // 首条防线距出生点的最小推进距离（px；与 minPlayerDist 取大者）
    },
    // #77 低难度 full→half 降级帽：单节点最多降 floor(full数×帽值) 个（≤30%），
    // 保证低难度下每节点仍保留 ≥70% 全高建筑（掩体骨架可读性）。
    fullDowngradeCap: 0.30,
    // #77 cullRate 剔除保护：每模板至少前 N 个全高建筑不被随机剔除（保底掩体骨架）。
    fullCullProtect: 2,
    runNodeCount: 5,              // 一局初始节点数（线性链长度；开放式链下仅作起点，后续 extendRun 追加）
    // #K3（2026-09-29 用户反馈「节点略长，缩短 boss 循环：5->3」）：Boss 循环由 5 缩短为 3
    // ⇒ 一局内更早遇到 Boss（index 2/5/8…），以 Boss 战（无配额 grind）替代部分常规节点的拉长感。
    bossInterval: 3,              // 每第 3 个节点为 Boss 节点（(index+1) % 3 === 0 → index 2/5/8/11/14…）
    speedClearMs: 120000,         // 限时通关阈值（ms）→ 结算速通 +20%
    outpostChance: 0.7,           // 节点出现友军据点的概率
    enemyTankPool: ['tiger-I', 'Leapard_1', 'Obj 780', 'panzer-IV', 'hummel'], // P-46: 敌军车型池（dummy 标 target 退出）
    enemyMinDist: 150,            // 敌军彼此最小间距（px）
    enemyMinPlayerDist: 250,      // 敌军离玩家出生点最小间距（px）
    // P-46 多方向环带生成参数（以玩家出生点为参考）：
    // 随难度 diffNorm 递增方向扇区数与环带扩展范围
    ringSectorsBase: 2,           // 基础包围方向数（低难度至少 2 向）
    ringSectorsMax: 4,            // 最大包围方向数（高难度扩展至 4 向多角包围）
    ringMinDist: 350,             // 环带内径最小间距（px，确保不在脸刷兵）
    ringMaxDistMult: 0.85,        // 环带外径系数（相对地图半尺寸）
    // P-38 敌方进度推进：击杀配额 + 镜头外递增生成（消费方 js/tank_map.js reinforcementTick）
    reinforceInterval: 8,         // 两次递增生成的最小间隔（秒）
    maxAlive: 7,                  // 常规节点场上存活敌军上限（初始+增援合计封顶）
    quotaAddBase: 2,              // 配额加项基数：quota = max(初始敌数, 初始 + base + floor(effDiff×scale))
    quotaDiffScale: 6,            // 配额难度系数（effDiff 为该节点有效难度）
    desiredAliveRatio: 0.6,       // 补兵阈值：desiredAlive = ceil(初始敌数×ratio) + floor(effDiff×3)，封顶 maxAlive
    reinforceMargin: 120,         // 增援落点必须在视口 AABB 外扩该值之外（玩家不可见刷兵）
    reinforceOutpostDist: 300,    // 增援落点距友军据点最小间距（px）
    // B 档②（2026-09-23）：增援只补玩家**前方**未清空防线——落点限定在「x1 > 玩家 x」的防线区间内
    // （沿推进轴由近至远），玩家已越过全部防线时不再增援。false = 回退旧全向随机落点。
    reinforceFrontOnly: true,
    // B 档③（2026-09-23）：推进式节点完成——**抵达右端出口 + （防线清空 或 配额达成）**双条件。
    // 旧口径为「击杀数 ≥ 配额」单条件（与推进正交），现要求玩家沿 +x 推进到出口线。
    // 消费方：js/tank_map.js nodeClearance（纯逻辑）+ tank_mvp.html 完成判定/HUD。
    // #K2（2026-09-29）：新增出口区可视化参数（此前只有底部一行小字，玩家无从得知出口在哪）。
    exitZone: {
      xFraction: 0.93,            // 出口线位置（× 节点宽 w；玩家 x ≥ 该线即视为抵达出口）
      bandWidth: 220,             // 出口带宽度（px，画在 exitX 之后作为目标区）
      draw: true                  // 绘制出口带/箭头标记（false = 仅 HUD 文案，不画世界标记）
    }
  },

  // #H1（2026-09-30 用户裁定「敌人难度不应随局外商店升级变化，只随节点推进变化」）：
  //   原 P-46「玩家基准锚定制」把敌军 base 数值与封顶公式全部锚在玩家实际 stats 上，而玩家 stats
  //   含局外永久升级（applyUpgrades）→ 商店每买一级，下一局全部敌军血/穿/伤/速同比例抬升，
  //   玩家的成长收益被难度同步抵消。实测（#H1）：五项永久升级买满后同一节点敌军
  //   穿深 149.96→173.60 / 伤害 35→45.50 / 血量 64.29→104.47 / 速度 40.60→45.63，
  //   而 node.difficulty 与节点难度序列完全不变（问题不在难度曲线，在数值锚错了玩家）。
  //   现行口径：敌军数值 = **enemyAnchorBase（与玩家无关的固定基准）** × enemyClassProfiles
  //   × entityMults(diff) × difficultyCapMuls（改按 enemyAnchorBase 封顶）。玩家选车/永久升级
  //   一律不影响敌军强度，敌军强度只由节点难度 diff 决定。
  // 基准取自 tanks/ 中位中坦的典型量级（对应 difficultyForIndex(0)=0.15 首节点的「可打赢」体感）；
  // armor 为四类共享基准，profile.armor 系数再在其上缩放。
  enemyAnchorBase: {
    maxHp: 100, penetration: 120, damage: 34, reload: 1.3, maxSpeed: 120,
    turnRate: 2.0, turretTurnRate: 2.2, shellSpeed: 1200, weight: 50, enginePower: 700,
    armor: { hull: { front: 100, side: 40, rear: 25 }, turret: { front: 100, side: 40, rear: 25 } }
  },

  // P-46 类别化敌军（#H1 起基准改为 enemyAnchorBase，玩家不再参与，见上）：
  //   敌军各项属性 = 固定基准 enemyAnchorBase × enemyClassProfiles[class] 比例 × 难度系数(entityMults)。
  //   四类比例向量（相对基准 1.0 的比例）收口于此——保证同一节点对所有玩家难度一致，
  //   且两条成长线（玩家卡牌/永久升级 vs 敌人难度）彻底解耦。消费方：js/tank_model.js
  //   applyEnemyAppearanceAndStats / difficultyCapMuls + mvp 接线层。
  enemyClassProfiles: {
    light:  { maxHp: 0.80, penetration: 0.90, damage: 0.90, reload: 0.85, maxSpeed: 1.15, turnRate: 1.20, armor: 0.80 },
    medium: { maxHp: 1.00, penetration: 1.00, damage: 1.00, reload: 1.00, maxSpeed: 1.00, turnRate: 1.00, armor: 1.00 },
    heavy:  { maxHp: 1.40, penetration: 1.15, damage: 1.15, reload: 1.25, maxSpeed: 0.80, turnRate: 0.75, armor: 1.35 },
    spg:    { maxHp: 0.75, penetration: 1.10, damage: 1.30, reload: 1.60, maxSpeed: 0.85, turnRate: 0.70, armor: 0.65 }
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

    // --- 2026-10-01 #M 接战机动随机化（用户反馈「敌人全部尝试贴近玩家」）---
    // 敌人接近玩家时不再一律直冲：按「机动脚本」执行，每脚本随机决定
    //   机动类型（直线/斜线/曲线/绕后/后撤/短停）+ 偏角 + 行程距离 + 短停时长，
    // 单脚本走完（或到时限）后重掷，形成不可预测的接近节奏与开火节奏。
    // 消费方：js/tank_ai.js _maneuverRoll / _applyManeuver（纯函数、可 Node 测）。
    maneuver: {
      enabled: true,              // 总开关；false = 完全退回旧的直冲语义（回退/对照用）
      reRollDist: 90,             // 接近途中每移动该距离（px）即重掷脚本 ⇒ 轨迹持续碎化
      reRollTimeMax: 4.5,         // 单脚本最长时间（秒）：超时强制重掷（防极端参数卡死）
      // 机动类型权重（相对概率；curve/arc 为曲线，flankStep 为斜切侧向，retreat 为后撤）
      weights: {
        direct: 3,                // 直线：直冲玩家（保留原始接敌手感，仍是最高权重之一）
        slant: 4,                 // 斜线：以固定偏角切入
        curve: 4,                 // 曲线：偏角随时间渐变（S 形接近）
        arc: 3,                   // 弧线绕行：绕玩家侧向弧线移动，始终不掉出射程
        retreat: 2                // 后撤：接近途中反向拉开（打断玩家逼近）
      },
      // 偏角（rad，相对「指向玩家」方向；正=逆时针）
      slantAngleMin: 0.35, slantAngleMax: 1.15,
      curveAngleMin: 0.25, curveAngleMax: 0.95,   // 曲线起始偏角
      curveSweepMin: 0.5, curveSweepMax: 1.9,    // 曲线全程偏角总变化量
      arcAngleMin: 0.8, arcAngleMax: 2.0,         // 弧线单侧绕行角
      // 短停：行进一段后短停（可开火）再继续，是「行进时/短停后开火」的开火节奏来源
      holdChance: 0.35,           // 每个脚本结束后进入短停的概率
      holdMin: 0.4, holdMax: 1.8, // 短停时长区间（秒）
      // 后撤段
      retreatDistMin: 120, retreatDistMax: 320,   // 后撤的目标后撤距离（px）
      retreatMinT: 0.5, retreatMaxT: 1.4,         // 后撤最短/最长持续（秒）
      // 开火节奏：短停结束瞬间给一个「重新瞄准」窗口（对齐后才恢复开火），
      // 与 reactionJitter 叠加 ⇒ 敌人不会整簇同时开火
      resumeAimTolMul: 1.8,       // 短停后恢复开火的容差放大倍数（相对常规 aimTolerance）
      // 装填期偏置（承接旧 #88 sideSwing 的玩法意图，改由机动层统一承担）：
      //   reloadGapFrac  — 装填前段门槛（× 装填时长；与 sideSwingReloadFrac 同一语义）
      //   reloadGapCreep — 装填前段前进速度压低为该值（取代旧侧摆的 move 微降 0.3）
      //   reloadGapWeights — 装填期改用这套权重：压低 direct（不再直冲）、抬高 slant/arc（侧向躲避）
      reloadGapFrac: 0.3,
      reloadGapCreep: 0.35,
      reloadGapWeights: { direct: 1, slant: 4, curve: 3, arc: 4, retreat: 1 }
    },

    // --- 2026-10-01 #N 交战距离带（取代单点 engageRange，消除「全部贴脸」）---
    // 改前只有单点 engage(520px)：dist>engage 前进、dist<close(200px) 退，形成
    // 「200~520px 全静止、<200px 全挤上来」的夹逼结构。改为**按类别分档的区间**：
    //   dist > maxRange → 接近（进）
    //   dist < minRange → 脱离（退）
    //   区间内        → 驻停开火（band 内原地）
    // 消费方：js/tank_ai.js _engageBand()。
    engageBand: {
      enabled: true,              // false = 回退旧单点 engageRange/closeRange 语义
      // 各档区间（比例相对 engage 基准 520px；min/max 单位 px）
      //   light  轻坦：远程试探，站得更开
      //   medium 中坦：基线
      //   heavy  重坦：近距钢猛，区间最窄且下探最深
      //   spg    曲射：最远（配合 classProfiles.spg.keepRange 定距语义）
      classBands: {
        light:  { minRatio: 0.52, maxRatio: 1.28 },
        medium: { minRatio: 0.42, maxRatio: 1.10 },
        heavy:  { minRatio: 0.30, maxRatio: 0.94 },
        spg:    { minRatio: 0.66, maxRatio: 1.34 }
      },
      defaultBand: { minRatio: 0.42, maxRatio: 1.10 }   // 类别缺失/未知时的兜底
    },

    // --- 2026-10-01 #N2 攻守分工（节点级协调器，消除「一拥而上」）---
    // 同时只允许 N 辆敌人主动压上（press），其余分配 flank / hold。
    // 消费方：js/tank_ai_squad.js（纯逻辑、可 Node 测）。
    squad: {
      enabled: true,              // false = 全员 press（回退旧行为）
      pressSlotsBase: 2,          // 基础压上名额
      pressSlotsPerDiff: 1.5,     // 难度加成系数：slots = base + floor(diff × 该值)
      pressSlotsMax: 4,           // 名额硬上限
      reassignInterval: 0.6,       // 名额重分配间隔（秒）——避免逐帧抖动导致角色反复横跳
      // 候选评分权重：决定谁优先拿到 press 名额
      scoreWeights: { dist: 1.0, los: 1.2, hp: 0.4 },
      // 角色粘性：上一轮已是 press 的实体获得该评分加成，避免 press/flank 反复横跳
      // （#N 实测：无粘性时 flank 与 press 交替会形成敌军「棘轮内移」逼近玩家）
      roleStickiness: 0.2,
      // hold 态：留在原地/掩体，只打有把握的射界（不主动接近）
      holdFireMaxDist: 640,       // hold 态允许开火的最大距离（超出则纯待机）
      holdFireAimTolMul: 2.0      // hold 态开火容差放宽（远距离命中率低，放宽以保持火力存在感）
    },

    // --- 2026-10-01 #N3 flank 重写（真正的侧翼站位，取代原横向平移）---
    // 改前 flank 的触发窗口是 dist>engage && dist<flankMinDist×1.5×flankBias，
    // heavy（上限 400×1.5×0.6=360 < engage≈478）恒不触发、spg（bias 0）被排除，
    // medium 高难度下 engage 超过窗口上限 ⇒ 四类里只有 light 偶发，且目标点是
    // 「自身 + targetRight×300」每帧重算的横向平移，不是绕到侧翼的站位。
    flankRewrite: {
      enabled: true,              // false = 回退旧 flank 分支
      // 注：flank 的**触发**由 #N2 攻守分工的角色决定（squad 按距离/LoS/血量评分），
      //     不再设距离窗口——进入 flank 角色即驶向站位点；距玩家过远者由评分排到 press/hold。
      sectorMin: 1.05,            // 侧翼站位相对「玩家→敌人」连线的方位角下限（rad ≈ 60°）
      sectorMax: 2.10,            // 上限（rad ≈ 120°）
      // 站位半径 = **交战带外沿 band.max** × 该比例（语义为「相对带外沿的倍数」）。
      // 必须 ≥ 1：小于 1 会把敌人带进交战带内侧，与 press 名额交替时形成「棘轮内移」
      // （每次当 flank 往内挪一点、转 press 后驻停，逐次逼近玩家；探针实测 700→395→273）。
      // 以 band.max 为基准可自动适配各档次（light/heavy/spg 的带宽度不同）。
      radiusRatio: 1.15,
      // 左右名额：0 辆时全走右侧，1 时随机，2 时左右各一（避免全部挤同一侧）
      sideSlots: 1,
      arriveDist: 70              // 距站位点进入该半径即算到位（转 press/hold）
    },

    // --- 2026-10-01 #N4 群体分离力（反「挤成肉球」）---
    // 物理碰撞 resolveTankCollisions 只会沿连线把敌人推开，靠内侧者被推向玩家；
    // 决策层叠加斥力，在移动输出上产生侧向 turn 分量，先于物理分离生效。
    separation: {
      enabled: true,
      radius: 180,                // 斥力生效半径（px）
      strength: 1,                // 斥力转角强度（与 turn 同量纲，钳制到 ±1）
      // 玩家对敌同样有斥力（避免围成一圈贴脸）——半径与力度分别可控：
      playerRadiusMul: 0.6,       // 玩家斥力半径 = radius × 该比例（=108px，比同类斥力更近）
      playerFactor: 0.7           // 玩家方向的斥力**力度**权重（相对同类敌人间斥力）
    },

    // --- 2026-10-01 #N6 装填脱离（Retreat & Reload）---
    // 装填期主动退到掩体背弹面，而不是在开阔地互相点名。
    // 扩展 #76 C6 的 coverSeek：原条件仅「重甲 + 血量<60%」，现增加装填期通道，
    // 使轻中坦在装填期也有战术退避。
    retreatReload: {
      enabled: true,
      // 装填期且距玩家在此距离内才触发（太远没必要退）
      minDist: 300, maxDist: 760,
      coverRadius: 620,           // 寻掩搜索半径（px）
      standoffMargin: 45,         // 背弹面外扩边距（px）
      hpGate: 0.0                 // 血量门槛（0 = 不额外要求；>0 则需低于该比例才触发）
      // 到位后一律原地还击、不再前压（行为无条件生效，见 js/tank_ai.js 的 rrArrive 分支）
    },

    // --- 2026-09-20 #E7 敌人反应速度（用户反馈「反应太快」） ---
    // 进入接战（首次获得目标）后，敌人需经过 reactionSeconds 的「察觉/炮塔起转」延迟
    // 才会移动与开火；受击警觉（alertEntity）只把延迟减半（被打醒更快，但不瞬发）。
    // 延迟按 AI 档位递减（tierProfiles.reactionMul），按难度不叠加——难度只影响数量与强度。
    reactionSecondsBase: 1.15,   // 基线反应延迟（秒）
    reactionSecondsMax: 1.9,     // 低难度/低档位上限（秒）
    reactionAlertMul: 0.5,       // 受击警觉后的延迟倍率（被打醒的反应更快）
    reactionJitter: 0.25,        // 每辆车的随机抖动比例（±25%，避免整簇同时开火）

    // --- 2026-09-20 #E8 全高掩体遮挡视野 + engage 状态传播 ---
    // 1) 激活（进入接战）必须「距离达标 **且** 有视线」——建筑/岩石/树等 vision:true 掩体
    //    挡住视线时敌人不再就地激活；受击/友邻告警不受此限（被打醒是合法通道）。
    engageRequiresLoS: true,
    // 2) engage 状态传播：某个敌人首次进入接战时，把状态传播给 engagePropagateRadius 内的友邻
    //    （它们同样进入接战并按各自反应延迟行动）。
    engagePropagateRadius: 420,
    engagePropagateChance: 0.7,  // 传播成功率（避免一次暴露唤醒整张图）

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
      { engageMul: 1.1, aimTolMul: 0.8, reactionMul: 0.82 },  // tier 1：更警觉、更准、反应更快
      { engageMul: 1.2, aimTolMul: 0.6, stunResist: true, reactionMul: 0.65 }  // tier 2：精英——远距压制、高精度、抗晕、反应最快
    ],
    defensiveHQRadius: 200,         // 友军据点防御半径（px），保持在该半径内优先驻守
    searchOscillationSpeed: 0.25,   // 搜索状态扫描摆动速度（rad/s），来回扫视的频率
    searchMinLoSBlocked: 2.0,       // 连续 LoS 被遮挡多少秒后触发搜索状态（秒）
    stunModuleThreshold: 0.5,       // 模块 debuff 严重程度阈值（0~1）：超过此值触发惊慌状态
    stunDuration: 3.0,              // 惊慌/呆滞状态持续时间（秒）
    stunImmunityAfter: 2.0,         // stunned 自然结束后免疫窗时长（秒）：期间不再被压入 stunned（防高射速无限连控）
    dazedProbability: 0.3,          // 模块伤害触发惊慌而非直接进入 stun 的概率
    alertRadius: 600,               // 警觉传播半径（px）：敌对 AI 被击中时，该半径内友邻一并警觉（propagateAlert）
    // #I4（2026-09-21 用户裁定「boss 几乎完全是站桩等玩家」）：Boss 随机走位层——
    // 周期性在玩家周围随机选点（环绕/侧移），车体驶向该点（炮塔照常锁定玩家开火），
    // 消费方 updateBossBehavior 写 _bossMoveOverride、mvp AI 循环覆盖 d.turn/d.move。
    // crush 风格（冲撞碾压为身份）豁免；激光期走 hold 冻结不叠加。
    bossWander: {
      enabled: true,
      intervalMin: 2.2,       // 换点间隔下限（秒）——到点/超时即重选走位目标
      intervalMax: 4.6,       // 换点间隔上限（秒）
      distMin: 240,           // 走位点距玩家的最小半径（px，保持交战距离）
      distMax: 520,           // 走位点距玩家的最大半径（px）
      waypointReach: 90,      // 到达判定半径（px，进入即视为到位/提前换点）
      clampMargin: 140        // 走位点钳制进节点边界的内缩量（px）
    },
    patrolSpeedFactor: 0.8,         // 巡逻/行军状态移动速度因子（相对于基准速度的比例）
    patrolWanderSigma: 0.02,        // 巡逻状态正弦摆动幅度（rad），轻微摆动路径
    patrolWanderSpeed: 1.5,       // 巡逻状态摆动周期频率（rad/s）
    // #83 探头/重部署节奏（消费方 js/tank_ai.js）：探头露头 + 周期性变位
    peekAngleMax: 0.5,            // 探头最大偏摆角（rad）
    peekInterval: [3, 6],         // 探头随机再触发间隔（秒，区间随机）
    reposInterval: [4, 8],        // 重部署（变位）间隔（秒，区间随机）
    // 2026-08-25 装填间隙侧摆：装填期间车体随机侧摆（rad 区间随机，45°~90°）
    sideSwingAngleMin: 0.78,      // 最小侧摆角（≈45°）
    sideSwingAngleMax: 1.57,      // 最大侧摆角（≈90°）

    // --- 绕水转向（2026-09-14 水域行为重做）：AI 前向探水 + 侧向绕行 ---
    // 水域不再硬阻断（passability 0.4 + 溺毙），AI 移动输出前做避水修正：
    // 前向探点入水且侧向有干地 → 转向干地侧；三探点全水 → 停驶防自杀。
    // 消费方：js/tank_ai.js applyWaterAvoidance（ctx.covers 注入）。
    waterProbeDist: 140,          // 前向探点距离（px，≈1s 车程）
    waterProbeAngle: 0.6,         // 侧向探点偏角（rad）

    // --- classProfiles（P-46 类别化敌军）：按实体 t.tankClass 的行为档案覆盖 ---
    //   与 tierProfiles 正交：先按 aiTier 取档位、再按 tankClass 叠加类型行为修正。
    //   engageMul   — 接战距离乘数（轻型远距试探/重型近距钢猛）
    //   aimTolMul   — 开火容差乘数（<1 更准）
    //   flankBias   — 侧翼绕行倾向（轻型高、重型低、SPG 0 绝不侧绕）
    //   moveLock    — true = 只前进不后撤（重型钢猛贴脸，防风筝由强度承担）
    //   keepRange   — true = 与目标保持距离（SPG 曲射/远距直射，过近倒车）
    //   stunResist  — 抗晕（重型）
    classProfiles: {
      light:  { engageMul: 1.18, aimTolMul: 1.0,  flankBias: 1.35, moveLock: false, keepRange: false, stunResist: false },
      medium: { engageMul: 1.0,  aimTolMul: 1.0,  flankBias: 1.0,  moveLock: false, keepRange: false, stunResist: false },
      heavy:  { engageMul: 0.92, aimTolMul: 1.1,  flankBias: 0.6,  moveLock: true,  keepRange: false, stunResist: true  },
      spg:    { engageMul: 1.25, aimTolMul: 0.95, flankBias: 0.0,  moveLock: false, keepRange: true,  stunResist: false }
    }
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
    // #H5（2026-09-21 用户裁定）：0.45 → 0.8 回退——敌方可见距离已改为屏幕相对
    // （vision.screenRadiusRatio，随 zoom 补偿），不再需要 #H2 的深度拉远来装入固定视野圆；
    // 缩放回归纯视觉偏好（默认 1.0 = 全细节，玩家自由缩放不受 gameplay 惩罚）。
    minZoom: 0.8,            // 最小缩放（拉远下限，视野最大）
    maxZoom: 1.3,            // 最大缩放（推近上限）
    zoomStep: 0.15,          // 每格滚轮的乘法步进系数（targetZoom *= 1±zoomStep）
    // 2026-09-20 #E12：摄像机随鼠标向外延伸（构图前移，扩大朝向鼠标一侧的可见范围）。
    // 延伸距离 = RULES.vision.radius × leadRatio × 鼠标偏移归一化值（0~1，视口半宽/半高为满值），
    // 即「距离和视野绑定」：视野越大，可外延的距离越远；再乘 cam.zoom 反向补偿（缩小时外延更远）。
    // 2026-09-23（B 档·视野做强）：0.30 → **0.40**。
    // #J3（2026-09-30 视野距离系统退役）注：本键**只剩「摄像机外延」一个用途**（鼠标方向构图前移），
    //   2026-09-23 那段「放宽可见半径收口 cap / 解锁视野卡收益」的说明随视野圆一起失效 ——
    //   视野卡（commander_sight）已随视野系统删除，本键不再影响任何剔除或命中判定。
    // 代价：鼠标指正前时后向可见 540 → 180px——外延按鼠标偏移归一化，鼠标回屏幕中心即恢复满幅。
    mouseLeadRatio: 0.40,
    mouseLeadZoomComp: true, // true = 外延距离 ÷ cam.zoom（缩放不改变世界侧外延量）
    leadLerp: 5              // 外延量的阻尼收敛速率（1/s）
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
    // 曲率（>1 后段加速，模拟"层层推进越打越难"）。
    // 2026-10-01 用户裁定「略微提高敌人升级速度」：1.25 → **1.20**（更接近线性 ⇒ 各中间索引的
    // 难度更高 = 敌人随节点升级更快；端点不变：index=0 仍 0.15、index≥diffSatIndex 仍封顶 curveCap 0.95）。
    // 方向性提示：本键越接近 1，中段难度越高（升级越快）；调大则中段更低、只有末端陡升。
    curvePow: 1.20,
    diffSatIndex: 12,        // 曲线饱和索引：index≥12 后基础难度封顶（开放式链的"虚拟末节点"）
    curveCap: 0.95,          // 基础难度封顶值
    crossRunLevelBonus: 0.04,// 每级跨局难度等级对基础难度的线性加成
    diffMax: 1.15,           // 有效难度绝对上限（含跨局加成后钳制）
    // 2026-08-25 敌军难度三键重构（替代旧 enemyStatCapVsPlayer=0.8 单一封顶，旧键已删除；
    // 消费方 tank_mvp.html applyDifficultyMults 需同步接线）。
    // 2026-08-27 #A16 补第四键 speedVsBaseline：把 maxSpeed 页内硬编码 lerp 收口进 RULES，
    // 消除与 entityMults.maxSpeed（同函数先行注入）两套机制打架，并改经 modifiers 注入防 refreshStats 回归。
    // #H1（2026-09-30）**四键全部由「相对玩家」改为「相对固定基准 enemyAnchorBase」**——
    // 玩家选车与局外永久升级一律不再抬高敌军上限（实测五项升级买满敌军穿深 +23.7%、伤害 +30%、血量 +62.5%）。
    // 四键（pen/dmg floor/dmg cap）为基础的封顶/地板绝对值；第四键约束速度公式：
    //   targetSpeed = lerp(baseFloor, baseCeil, diffNorm) × randFactor(randMin~randMax 每辆独立) × enemyAnchorBase.maxSpeed
    penCapVsBaseline: 1.2,   // 敌军穿深上限 = 1.2 × 固定基准穿深
    dmgFloorVsBaseline: 0.4, // 敌军伤害下限 = 0.4 × 固定基准伤害
    dmgCapAmmoMult: 0.7,     // 敌军伤害上限 = 0.7 × 参照终伤（strongestAnchorMult 推算或调用方传入 strongest）
    strongestAnchorMult: 2.33, // 参照终伤/基准伤害的等效倍数（缺 strongest 时的天花板推算用；≈ 中坦满血 2 发打死标准敌）
    speedVsBaseline: {       // 敌军极速相对固定基准的公式（消费方 tank_mvp.html applyDifficultyMults）
      baseFloor: 0.3,        // diffNorm=0 时速度系数下限
      // 2026-10-01 用户裁定「降低速度上限倍率」：0.6 → **0.5**（普通敌军极速上限
      // 0.5×enemyAnchorBase.maxSpeed=60px/s；含每辆 randFactor 上限 1.15 → 69px/s，
      // 原 0.6 → 72 / 82.8px/s）。下限 0.3 不变，低难度敌军速度不变，曲线更平。
      baseCeil: 0.5,         // diffNorm=1 时速度系数上限
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
    // 2026-10-01 用户裁定「提高敌人（包括 boss）血量 + 降低速度上限倍率」：
    //   maxHp  [0.45, 1.4] → **[0.5, 1.7]**（低难度 +11%、满难度 +21% 血量）；
    //   maxSpeed [0.7, 1.15] → **[0.7, 1.0]**（满难度极速上限倍率 1.15 → 1.0，-13%）。
    //   注：普通敌军的极速最终由 speedVsBaseline 封顶覆盖（见上），maxSpeed 上限主要作用于
    //   **Boss**（mvp applyDifficultyMults 传 applyPlayerCap=false 不走封顶）与其它未封顶路径。
    entityMults: {
      maxHp:         [0.5, 1.7],   // 生命（易弱难强，开局平滑；2026-10-01 由 [0.45,1.4] 上调）
      penetration:   [0.75, 1.25], // 穿深
      damage:        [0.75, 1.2],  // 单发伤害
      armorAll:      [0.6, 1.3],   // 装甲全面乘（遍历 hull/turret 各面叠乘）
      reload:        [1.25, 0.82], // 装填时间（易慢难快）
      spreadMult:    [1.3, 0.78],  // 三扩系数（易散难准）
      aimSpeed:      [0.8, 1.35],  // 缩圈速度
      maxSpeed:      [0.7, 1.0],   // 极速（2026-10-01 上限 1.15 → 1.0）
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
      // 2026-10-01 用户裁定「提高敌人（包括 boss）血量」：8 → **9**（+12.5%）。
      // Boss 血量 = 出战配置 maxHp × hpMul × entityMults.maxHp(diff)（Boss 跳过速度/穿深封顶）；
      // 本次 entityMults.maxHp 上限上调（1.4→1.7）与 hpMul 叠加后，Boss 总血量约 **+29%~+36%**
      // （探针实测 index0 4.59→5.91 = +28.8%、index4 5.91→7.88 = +33.4%、index8 7.76→10.51 = +35.5%），
      // 高于普通敌军同幅度（+14.5%~+20.4%）。
      // **各 bosses/*.json 自带 tuning.hpMul 覆盖本缺省**，已同步 5 份 boss 定义；
      // 改缺省只影响未声明 hpMul 的自定义 Boss。手感偏肉时可回调本键（沿革：×8 → ×9）。
      hpMul: 9,            // 生命 ×9（2026-10-01 由 ×8 上调）
      moveMul: 0.5,        // 极速 ×0.5
      turnMul: 0.6,        // 车体转速 ×0.6
      turretTurnMul: 0.6,  // 炮塔转速 ×0.6
      shellMul: 0.8,       // 炮弹威力 ×0.8
      fireRateMul: 0.6,    // 射速 ×0.6（装填时间 ×1/0.6）
      dmgMul: 1.5,         // 单发伤害 ×1.5
      penMul: 1.4,         // 穿深 ×1.4（2026-08-25 新增：Boss 穿深独立乘子，不受敌军 penCapVsPlayer 封顶）
      engageDist: 99999    // #21：Boss 出生即进入交战（巨大触发半径，绕过常规 trigDist 700 / 巡逻/风筝）
    },
    // ======================= 2026-09-20 #E9 Boss 修订（用户反馈） =======================
    // 1) 残血减速上限：阶段 onEnter.modifiers 里的 maxSpeed/turnRate 倍率过猛会让残血 Boss
    //    快到无法处理。聚合后对 Boss 的车体机动施加硬上限（相对 boss 出战配置的基准倍率）。
    stageSpeedCapMul: { maxSpeed: 1.15, turnRate: 1.1, turretTurnRate: 1.15 },
    // 2) 早期行动：Boss 出生后先有一小段「展开/预热」窗口，期间有可见动作（慢速前压 + 炮塔扫描），
    //    之后进入正常阶段行为；避免开场站着不动。
    openingSeconds: 1.6,
    openingScanRate: 0.9,      // 开场炮塔扫描角速度（rad/s）
    // 3) 受击反馈：命中 Boss 时（非弱点）触发一次短暂受击反应——炮塔抖动 + 轻微车体顿挫，
    //    有冷却，避免高射速下抖动到无法瞄准。弱点命中只给更强的顿挫。
    hitReact: {
      enabled: true,
      seconds: 0.35,           // 单次反应时长（秒）
      cooldown: 0.45,          // 反应冷却（秒）
      turretJitter: 0.10,      // 炮塔抖动幅度（rad）
      stunSlowSeconds: 0.25,   // 短暂减速时长（秒）
      slowMul: 0.35            // 顿挫期速度倍率
    },
    // 4) 分波次召唤：boss.summons 不再一次性投放——按 Boss 血量阈值分波（hpFrom 为该波触发血量比例），
    //    每波的敌数随难度放大（难度越高集中生成越多）。
    //    #G（2026-09-21）：新增 defaultPool/defaultWaves —— 正式 Boss 漏写 summons 时按默认池回退，
    //    杜绝「该 Boss 整场不召唤任何敌人」的静默失效（旧实现 list 为空直接 return null）。
    summonWaves: {
      enabled: true,
      tolerance: 0.02,         // 血量跨过阈值的判定容差
      hpFrom: [0.75, 0.5, 0.25],  // 默认波次触发血量比例（boss.summons[i].hpFrom 可覆盖）
      countDiffMul: 1.6,       // 难度对单波敌数的放大上限（diff=1 时 ×1.6）
      spawnRadiusMin: 160,     // 波次生成点距 Boss 的半径下限（px）
      spawnRadiusMax: 320,     // 上限
      defaultPool: [{ tankId: 'dummy', count: 2 }],  // 漏写 summons 的正式 Boss 的回退池
      defaultWaves: 3          // 回退池铺满 3 波（对应 hpFrom 三段阈值）
    },
    // 5) 蓄能激光（主炮发射）：蓄能期炮塔转速大幅下降 + 在炮线上生成虚线警示带与红色透明填充，
    //    蓄能完毕对带内目标持续快速掉血。数值与「坦克主炮」无关，是 Boss 专属机制。
    laser: {
      enabled: true,
      ranges: [0.98, 0.72, 0.45, 0.18],  // 各阶段启用/加强激光的血量比例阈值（从首阶段起依次）
      chargeSeconds: 2.6,      // 蓄能时长（秒）——期间给出警示带
      fireSeconds: 1.5,        // 射击持续时长（秒）
      cooldown: 9,             // 两次激光之间的冷却（秒）
      width: 34,               // 光束/警示带宽度（px，沿炮线法向的半宽 ×2）
      length: 1400,            // 光束长度（px）
      dpsRatio: 0.55,          // 每秒伤害 = Boss 标准伤害 × dpsRatio
      // #H4（2026-09-21 用户裁定）：激光期炮塔**固定角速度直驱**（rad/s，绝对值），取代
      // charge/fireTurretTurnMul 乘数方案——乘数方案下 Boss 基础 turretTurnRate 已被 tuning
      // （×0.6）与难度乘子压低，再乘 0.15~0.18 后实际角速度趋近 0（用户实测「又不转动了」）。
      // 固定转速不受任何 modifier/难度乘子影响；激光期 AI 转炮被抑制（bossLaserHoldTurret）。
      // #I1（2026-09-21 用户裁定「炮塔转速再降低」）：0.55 → 0.35 rad/s（≈20°/s，走位窗口更宽）。
      laserTurnSpeed: 0.35,    // 激光期炮塔转向角速度（rad/s，固定、较慢——给玩家走位机会）
      blockByFullCover: true,  // 光束被建筑/岩石等全高掩体（tierGroup:'structure' 且 vision）阻挡：被挡目标不掉血
      // #I2（2026-09-21 用户裁定）：蓄能虚线与光束在绘制层反映全高掩体阻挡（截断到阻挡点）
      telegraphDash: [16, 12], // 虚线参数 [实线长, 间隔]（px）
      telegraphColor: 'rgba(255,64,48,0.28)' // 红色透明填充
    },
    // 6) Boss 履带断落随机自修（2026-09-23 用户裁定）：
    //    被击毁履带后，在锁定时间（trackLock, 缺省 8s）内，boss 会在一个随机时点、
    //    以随机概率立即修复履带——而非整场被动站桩等锁自然归零，缓解「频繁断履带」。
    //    单次决策：履带断时预定一个 (0, windowSeconds] 内的随机时点 → 到点 roll chance →
    //    命中立即修复（trackBroken/immobT 清零）；不命中则保持锁定直至 trackLock 自然结束。
    trackRepair: {
      enabled: true,
      windowSeconds: 8,   // 修复决策窗口上限（s）
      chance: 0.4         // 到达决策点时立即修复的概率（0~1）
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

  // ======================= P-49 属性耦合链配置 =======================
  // 仅在设计器出厂推导时消费：穿深/伤害与装填/三扩耦合、车体尺寸与马力上限挂钩。
  coupling: {
    basePen: 120,             // 基准穿深 (mm)
    baseDmg: 40,              // 基准伤害
    penReloadFactor: 0.005,   // 每高于基准 1mm 穿深，装填增加 0.5%
    dmgReloadFactor: 0.015,   // 每高于基准 1 点伤害，装填增加 1.5%
    penSpreadFactor: 0.002,   // 每高于基准 1mm 穿深，散布增加 0.2%
    dmgSpreadFactor: 0.005,   // 每高于基准 1 点伤害，散布增加 0.5%
    refHullArea: 2500,        // 参考车体投影面积 (px^2) ≈ 65px × 38px
    enginePowerPerArea: 0.36  // 允许最大马力系数：maxHp = clamp(area * 0.36, 400, 1200)
  },

  // ======================= P-49 全参数极限表（唯一收口） =======================
  // 取值方法：存量四车（tanks/dummy|Leapard_1|Obj 780|tiger-I.json）数值包络 ±30% 后取整；
  // reload 下限 1.0s 为用户既定需求（2026-09-17 #C2 裁定，取代旧 0.5s；reloadMult<1 通道不受此限）；maxSpeed 上限按用户裁定 ≤150km/h ÷ kmhFactor(0.4) = 375 px/s；
  // weight 上限 80t 为用户裁定（P-49，2026-08-26 细化：仅约束设计器出厂校验）。
  // 设计器保存校验消费方应把输入钳到 [min,max] 区间。
  parameterLimits: {
        maxHp:            { min: 50,  max: 9999 }, // 存量 hp 包络 80~120（±30% → 56~156，取整）；max=9999=无上限（B3 #73 修复：hp_up 升级「无上限」，与装甲同级）。仅 runShopLimitBlocked #A4 派生消费；设计器出厂校验只约束 weight.max。
    penetration:      { min: 80,  max: 9999 }, // 穿深无上限（用户需求：火力/穿深/装甲不设上限）
    damage:           { min: 25,  max: 9999 }, // 单发伤害无上限（用户需求：火力/穿深/装甲不设上限）
    reload:           { min: 1.0, max: 3.0 },  // 装填秒数：下限 1.0s（2026-09-17 #C2 用户裁定，取代旧 0.5s；实际开火间隔=reload×reloadMult，reloadMult<1 通道不受此限）；上限包络 2.0×1.3≈2.6 → 圆整 3.0
    shellSpeed:       { min: 600, max: 2100 }, // 弹速 px/s 包络 1000~1600（±30% → 700~2080）
    maxSpeed:         { min: 60,  max: 375 },  // px/s；max=150km/h÷kmhFactor0.4=375（用户裁定 ≤150km/h）；min 对应 24km/h
    turnRate:         { min: 1.0, max: 3.5 },  // 车体转速 rad/s 包络 1.6~2.5（±30% → 1.12~3.25）
    turretTurnRate:   { min: 1.0, max: 4.0 },  // 炮塔转速 rad/s 包络 1.5~3.0（±30% → 1.05~3.9）
        enginePower:      { min: 200, max: 9999 }, // 马力包络 300~900（±30% → 210~1170）；max=9999=无上限（B3 #73 修复：engine_power_up 升级「受运行时重量上限间接约束」，不受马力封顶）。仅 runShopLimitBlocked #A4 派生消费。
    spreadMult:       { min: 0.5, max: 3.0 },  // 三扩系数包络 0.8~2.0（±30% → 0.56~2.6）；min 与 RULES.spread.multFloor 同级防穿零
    motionSpreadMul:  { min: 0.5, max: 3.0 },  // 对齐 spreadMult 边界（用户 2026 决定：姿态稳定 steady_mount 的达限判定与三扩系数同级）
    weight:           { min: 10,  max: 80 },   // 吨：max=80t 为【设计上限】，仅设计器出厂校验（卡牌/局内升级可突破）；下限给超轻底盘留余地
    armor: {                                   // 各面装甲厚度 mm：无上限（用户需求：装甲不设上限）
      hull: {
        front: { min: 40, max: 9999 },
        side:  { min: 25, max: 9999 },
        rear:  { min: 15, max: 9999 }
      },
      turret: {
        front: { min: 55, max: 9999 },
        side:  { min: 35, max: 9999 },
        rear:  { min: 15, max: 9999 }
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
  weightRuntimeCap: 240,

  // ======================= 武器与槽位解耦 (R-1) =======================
  weaponTypes: {
    // #G（2026-09-21）：新增 clip（弹夹炮）——弹夹内 0.7s 固定发际间隔 / 弹夹间 ×3.0 起步整组装填
    primary: ['standard', 'autocannon', 'double_barrel', 'railgun', 'clip'],
    secondary: ['none', 'mortar', 'missile', 'missile_wire', 'rocket', 'mine_layer', 'turret']
  }
};

// 距离分档函数已移除（A1 双档模型见 coverHugDist，掩体遮挡不再有连续渐变）

// P-40 tier schema 归一化：新六属性（passability/shellBlock/exposureProfile/destructible/
// drawStyle/tierGroup）为唯一事实源；旧字段 move/draw/mode/hp 单向派生，供未迁移消费方
// （tank_move 的 move、渲染层的 draw、tank_fire 等的 mode）过渡使用。派生规则：
//   mode = solid（shellBlock true）/ single / none（vision 遮视线穿透弹）/
//          pass（其余 shellBlock false：栅栏/水/河/泥/残骸——炮弹越飞；移动阻断由 passability=0 承担）
//   （2026-09-20 #E1：'graduated' 派生已废除——grad 不再是合法 shellBlock 取值。）
(function normalizeCoverTiers(){
  for(const k of Object.keys(RULES.coverTiers)){
    const t = RULES.coverTiers[k];
    if(t.passability === undefined) t.passability = (t.move !== undefined ? t.move : 1.0);
    t.move = t.passability;                       // 旧别名：driveTank 减速系数
    if(t.drawStyle === undefined) t.drawStyle = (t.draw || 'box');
    t.draw = t.drawStyle;                         // 旧别名：渲染层分支
    if(t.shellBlock === undefined){
      // 兜底：自定义/未迁移 tier 按旧 mode 推导
      t.shellBlock = t.mode === 'solid' ? true : t.mode === 'single' ? 'single' : false;
    }
    if(t.destructible === undefined) t.destructible = t.hp;
    t.hp = (t.destructible === null || t.destructible === undefined) ? Infinity : t.destructible;
    if(t.tierGroup === undefined) t.tierGroup = 'cover';
    if(t.mode === undefined){
      t.mode = t.shellBlock === true ? 'solid'
             : t.shellBlock === 'single' ? 'single'
             : (t.vision ? 'none' : 'pass');
    }
  }
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RULES };
}