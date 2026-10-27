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
//   perf           性能预算与自适应降级（三档分辨率/粒子/弹量/扬尘间隔 + EMA 门控）
// ======================= 机制参数兜底默认值 =======================
const DEFAULT_ARMOR = {
  hull:   { front: 110, side: 38, rear: 26 },
  turret: { front: 140, side: 50, rear: 24 }
};

const RULES = {
  // 默认坦克装甲
  defaultArmor: DEFAULT_ARMOR,

  // ======================= 物理碰撞与撞击伤害（Ramming Physics） =======================
  ramming: {
    minVelThreshold: 90,          // 触发撞击伤害的最低相对速度 (px/s)
    damageScale: 0.038,           // 动能转伤害基础系数
    hpRatioThreshold: 0.25,       // 触发硬直所需的 HP 损失比例（当前 HP 的 25%）
    energyRatioThreshold: 0.15,   // 动能级数门槛（折合动能需达到目标生命上限的 15%）
    massAdvantageRatio: 1.2,      // 触发质量压制的质量比阈值
    stiffDurationBase: 2.0,       // 基础硬直时间（秒）
    stiffSpeedMul: 0.35,          // 硬直期间速度倍率（不是完全冻结：转向仍可动）
    trackBreakChanceMax: 0.65,    // 极度悬殊撞击时的履带断裂概率上限
    // 2026-10-23（用户裁定「保留但修好」）：同一对车的撞击伤害结算冷却（秒）。
    //   分离解算每帧 4 次迭代、持续互顶连续多帧命中 ⇒ 不去重会一帧内重复扣血数次，
    //   实测数帧就把 100HP 打空（并把分离逻辑连带跳过，造成残余深叠）。
    contactCooldown: 0.5
  },

  // ======================= 隐蔽与战场感知机制（Stealth & Camouflage） =======================
  camouflage: {
    baseCamo: { light: 0.7, medium: 0.5, heavy: 0.3 },
    motionMultiplier: { idle: 1.2, move: 0.7, sprint: 0.4 },
    firingPenaltyDuration: 3.0,   // 开火惩罚持续时间（秒）
    firingPenaltyMultiplier: 0.1, // 开火瞬间隐蔽乘数（暴跌至 10%）
    bushBonus: 0.40,              // 灌木丛隐蔽加成上限（#P1 起按覆盖深度折算，边缘为一半）
    smokeBonus: 0.70,             // 烟幕隐蔽加成（全遮，不随深度折算）
    aiSpotBaseDist: 650,          // 敌方 AI 基础视距 (px)
    // #P1 / I2（2026-10-24 用户裁定）：**隐蔽对称化暂不启用，但保留接入能力**。
    //   false（缺省）= 现行口径：只有玩家一侧有隐蔽值（AI 不吃）。
    //   true  = 敌人也计算 camouflageDistanceMultiplier，玩家可被 AI 偷袭。
    //   ⚠️ 启用前必须先补「玩家侧被点亮反馈」（research §4.4），否则是纯粹的不公平；
    //      且会显著改变难度曲线，需单独做平衡标定。
    symmetric: false
  },
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

  // ======================= 高度系统（已整体删除，#9 2026-10-19） =======================
  // 用户裁定：「车高的设定已经不再使用，彻底删除半高掩体、车高相关代码」。
  // 删除前实测：`RULES.heights` 的数值**早已不影响任何行为**——
  //   · 半高掩体体系已于 2026-09-20 #E3 整体移除（`coverTiers.half` / `heights.cover.half` 均已删）；
  //   · `getExposure` 只剩 `zMin >= 1.2` 一条阈值，而 medium.hull(1.4)/heavy.hull(1.8) **都过阈值**
  //     ⇒ 只有「车体/炮塔」的二值区分在起作用，车高数值是死数据。
  // 现行：`js/tank_geometry.js` 的 `getPartZRange` 返回固定常量（车体 0~1.4 / 炮塔 1.4~2.3）。
  // 注意 `heightClass` **字段本身仍是活的**（AI 分类 tank_ai.js、徽章颜色 tank_battledraw.js、
  // 车长塔数量 tank_paint.js、难度重坦比例 tank_map.js 都在用），**不要删它与 tanks/*.json 的该字段**。


  // ======================= 掩体遮挡（确定性模型，2026-09-20 #E1 定案） =======================
  // 炮弹拦截只由确定性掩体承担：shellBlock===true（建筑/岩石/树，含残破建筑）→ 入口点 100% 截停；
  // 'single'（沙袋）→ 挡 1 发（>70° 可跳弹）。概率/剖面（'grad'/'half'）与越掩插值全部移除——
  // 修复用户反馈「炮弹被不可见物体拦截」。
  coverRules: {
    // 保留字段示意：弹道不再有概率拦截（消费方：tank_fire.stepShells）。
    // #W15（2026-10-20）实测零消费 ⇒ 已删 `deterministicOnly`；确定性挡弹是代码事实
    // （coverTiers[].shellBlock），不需要开关字段。
    // #W17（2026-10-20 role-systems 新增）：掩体方向容差（px）——findCoversOnPath 在被
    // `cutoffDist` 裁断时，允许出射点超出截止距离该容差再判定为「方向已脱离」。
    // 原硬编码在 js/tank_cover.js:710（COVER_DIRECTION_TOLERANCE=16），mapgen 改为读本字段（缺省回落 16）。
    directionTolerance: 16,
    // 2026-10-22（第五批）直线掩体（tier `wall` / `wall_breakable`，shellBlock:'wall'）的部位裁剪口径。
    //   用户口径：「掩体两侧的坦克，可以命中另一侧比自己离掩体更远的坦克的炮塔和车体；
    //   只能命中另一侧比自己离掩体更近的坦克的炮塔」。
    //   判定见 js/tank_cover.js 的 wallPartBlock（纯函数，可 Node 测试）。
    wallHugDist: 22,        // 贴掩体阈值（px）：射手到掩体直线距离 ≤ 该值视为「贴墙」，有完整射界
    wallTurretOnlyDist: 0   // 预留：目标更近侧的额外容差（0 = 严格按距离大小比较）
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
  //   height          **高度（米）**——2026-10-24 #P1/I1 新增，**视线遮挡分档的唯一口径**：
  //                   · 0 = 纯地面/水面（不参与视线遮挡）
  //                   · < 1.2 = 只挡车体（`getPartZRange` 的 zMin 阈值；灌木/倒树/树桩）
  //                   · ≥ 2.3 = 全挡（可遮炮塔；建筑/树/岩石）
  //                   渲染侧的侧壁宽度/投影偏移也应读它（不再按 tier 写死），保证「画多高 = 挡多少」。
  //                   沿革：此前视线只有 `vision` 布尔，导致「灌木 = 楼房」，见
  //                   docs/specs/map/vision-stealth-3d-compat.md §2.1。
  // 其余字段：vision 遮视线（**是否参与**视线判定；高度在参与后再分档）/ crushable 压过即毁 /
  //           toTier 摧毁残骸链 / driveBy 按 heightClass 门控越障。
  // 旧字段 mode/move/draw 由下方 normalizeCoverTiers 从新 schema 单向派生，供未迁移消费方过渡。
  // 2026-09-20 #E3 用户裁定：全高掩体明确衍生为「建筑 / 岩石」，半高掩体（half）及其
  // 垂直剖面/越掩插值计算整体移除（定义删除 + 生成早已屏蔽 + 弹道管线不再消费 grad/half）。
  // 现状：确定性挡弹只由 shellBlock===true（建筑 full/intact/rock/tree）与 'single'（沙袋）承担。
  coverTiers: {
    full:       { label: '建筑', fill: 'rgba(165,92,72,0.62)',  stroke: '#b5553f', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: Infinity, crushable: false, vision: true,  drawStyle: 'box',         tierGroup: 'structure', height: 8 },
    bush:       { label: '灌木丛',   fill: 'rgba(88,130,58,0.28)',   stroke: '#3f9a2e', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: true,  drawStyle: 'bush',        tierGroup: 'foliage', height: 1.2 },
    // 2026-09-20 #E11：树木缩小并由坦克可直接推倒（crushable=true → 压过即倒，转为 fallen）；
    // 逻辑尺寸收敛见 RULES.nodeMap.treeWorldScale（生成期）。仍保留「炮弹 1 发伐倒」。
    tree:       { label: '树',       fill: 'rgba(56,88,52,0.42)',    stroke: '#2e6e28', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: 1,        crushable: true,  vision: true,  drawStyle: 'tree',        tierGroup: 'foliage', toTier: 'fallen', missileOverfly: true, height: 6 },
    fallen:     { label: '倒树',     fill: 'rgba(56,72,44,0.35)',    stroke: '#4a5c3a', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: true,  drawStyle: 'fallen',      tierGroup: 'foliage', residueW: 2.4, residueH: 0.5, height: 1 },
    // ================= 2026-10-22（第五批）直线掩体体系 =================
    // 用户裁定：「删除现有的栅栏、沙包元素。全部改为掩体（单直线，射击多种不同的贴图），
    //   掩体两侧的坦克射击可以命中掩体另一侧比自己离掩体更远坦克的炮塔和车体、
    //   只能命中另一侧更近坦克的炮塔，分为不可摧毁和可摧毁，可摧毁的掩体可承受一定的伤害后消失」。
    // · 旧 `soft`（栅栏）/ `barricade`（沙袋路障）**两键已删除**（老存档实例由 tank_cover.snapshotCovers 映射为 wall）。
    // · shellBlock:'wall' 是**新语义**：不是简单挡弹，而是按「射手/目标各自到掩体直线的距离」
    //   裁剪可命中部位（`js/tank_cover.js` 的 wallPartBlock；弹道消费方 tank_fire.shellPartHit 前置过滤）。
    //   `'solid'` / `'single'` 旧语义不变（full/rock/tree/perm_block 仍整发截停）。
    // · passability 0：单直线墙体，坦克只能绕行（不能被碾碎，crushable false）。
    // · vision true：挡视线（旧沙包不挡，本批按用户「掩体」语义统一为挡）。
    // · wallStyle：贴图族（concrete/sandbag/steel/brick/hedgehog/barrier），由 mapgen 按 biome 确定性分配。
    wall:        { label: '掩体',     fill: 'rgba(140,140,132,0.72)', stroke: '#8a8a82', passability: 0.0, shellBlock: 'wall',  exposureProfile: 'wall',      destructible: null,     crushable: false, vision: true,  drawStyle: 'wall',        tierGroup: 'structure', wallStyle: 'concrete', missileOverfly: true, height: 1.4 },
    // 可摧毁掩体：承受 wallBreakableHp 发后**直接消失**（toTier:null，不降级成残骸）。
    wall_breakable: { label: '可摧毁掩体', fill: 'rgba(158,128,72,0.6)', stroke: '#9e8048', passability: 0.0, shellBlock: 'wall', exposureProfile: 'wall',      destructible: 4,        crushable: false, vision: true,  drawStyle: 'wall',        tierGroup: 'structure', wallStyle: 'sandbag', toTier: null, missileOverfly: true, height: 1.4 },
  // #10（2026-10-19 用户裁定）：永久掩体 = 不可摧毁、整体挡弹的反坦克桩组合（沿用旧"中括号"视觉）。
  //   2026-10-22 起仍保留：它是 `solid` 语义（整发截停），与新的 `wall`（部位裁剪）是两种掩体。
  perm_block: { label: '永久掩体', fill: 'rgba(120,118,110,0.62)', stroke: '#78766e', passability: 0.0,  shellBlock: 'solid',  exposureProfile: 'full',      destructible: null,     crushable: false, vision: true,  drawStyle: 'wall',        tierGroup: 'structure', wallStyle: 'hedgehog', height: 1.6 },
    // #E1/#E3（2026-09-20）：树桩/碎石改为**不挡弹**（shellBlock false）——旧 'grad' 渐变剖面是
    // 「炮弹被不可见小物件拦截」的主要来源之一；残骸类低矮杂物不再参与弹道遮蔽。
    stump:      { label: '树桩',     fill: 'rgba(112,74,40,0.65)',   stroke: '#6e4a26', passability: 0.6,  shellBlock: false,    exposureProfile: 'none',      destructible: 1,        crushable: true,  vision: false, drawStyle: 'stump',       tierGroup: 'structure', height: 0.8 },
    rubble:     { label: '碎石',     fill: 'rgba(104,100,92,0.6)',   stroke: '#6a665e', passability: 0.6,  shellBlock: false,    exposureProfile: 'none',      destructible: 1,        crushable: true,  vision: false, drawStyle: 'rubble',      tierGroup: 'structure', height: 0.6 },
    // ======================= P-20/P-40：水体/桥梁 + 新地形 =======================
    // 水系裁定（2026-09-14 重做）：水潭/河流可缓速通行（passability 0.4，与烂泥地同级）；
    // 完全浸入（整车四角入水）触发溺毙倒计时（RULES.drowning.seconds，缺省 8s）——
    // 玩家/敌人/Boss 一视同仁；AI 移动决策带绕水转向（tank_ai.applyWaterAvoidance）。
    // 炮弹维持越飞（shellBlock:false，#85 裁定不回退）。
    // #AA4（2026-10-24 用户裁定「泥潭、河流限速 + 影响刹车」）：passability 照旧压极速与加速，
    // 另用 brakeGrip 单独削弱制动（附着差 → 刹车距离变长）；未声明 brakeGrip 的 tier 缺省 1.0，
    // 由文件末尾 normalizeCoverTiers() 补齐（与 move 同处派生）。
    water:      { label: '水域',     fill: 'rgba(64,156,225,0.5)',   stroke: '#409ce1', passability: 0.4, brakeGrip: 0.7, shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'water',       tierGroup: 'liquid', height: 0 }, // #85：炮弹越飞；减速通行 + 完全浸入溺毙
    river:      { label: '河流',     fill: '#3578a8',                stroke: '#2a6496', passability: 0.4, brakeGrip: 0.7, shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'water-chain', tierGroup: 'liquid', height: 0 }, // 多段连通水体（segments）；同 water 减速通行 + 溺毙
    mud:        { label: '烂泥地',   fill: 'rgba(96,72,44,0.45)',    stroke: '#60482c', passability: 0.4, brakeGrip: 0.7, shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'mud',         tierGroup: 'ground', height: 0 }, // 减速不阻挡、不进弹道遮蔽（复查处置：0.35→0.4，与半高掩体同级）
    road:       { label: '道路',     fill: 'rgba(122,120,114,0.55)', stroke: '#6e6c66', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: null,     crushable: false, vision: false, drawStyle: 'road',        tierGroup: 'ground', height: 0 }, // 村庄街道：可自由通行、不挡弹、不遮视线（纯地面标识）
    // #G（2026-09-21 用户需求 #4）：可破坏楼房——完整但可摧毁的砖混建筑：耐久 3，
    // 摧毁后转 ruined 残破建筑（再 1 发 → rubble 碎石， rubble 不挡弹）。链：building→ruined→rubble。
    building:   { label: '楼房',     fill: 'rgba(150,96,78,0.66)',  stroke: '#a24a34', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: 3,        crushable: false, vision: true,  drawStyle: 'box',         tierGroup: 'structure', toTier: 'ruined', height: 8 },
    intact:     { label: '完整建筑', fill: 'rgba(165,92,72,0.62)',  stroke: '#b5553f', passability: 1.0,  shellBlock: true,     exposureProfile: 'full',      destructible: Infinity, crushable: false, vision: true,  drawStyle: 'box',         tierGroup: 'structure', height: 8 },
    // #E3（2026-09-20）：残破建筑归入全高掩体（建筑衍生）——shellBlock true / exposureProfile 'full'，
    // 直射实弹 100% 确定性格挡；hp 1 被击毁后转 rubble 残骸（残骸不再挡弹）。
    ruined:     { label: '残破建筑', fill: 'rgba(122,114,100,0.5)',  stroke: '#7a7264', passability: 0.6,  shellBlock: true,     exposureProfile: 'full',      destructible: 1,        crushable: false, vision: true,  drawStyle: 'rubble-box',  tierGroup: 'structure', toTier: 'rubble', height: 2 },
    rock:       { label: '岩石',     fill: 'rgba(138,138,132,0.85)', stroke: '#6f6f68', passability: 0,    shellBlock: true,     exposureProfile: 'full',      destructible: Infinity, crushable: false, vision: true,  drawStyle: 'rock-poly',   tierGroup: 'structure', height: 2.5 },
    bridge:     { label: '桥梁',     fill: '#5a5750',                stroke: '#33312c', passability: 1.0,  shellBlock: false,    exposureProfile: 'none',      destructible: 2,        crushable: false, vision: false, drawStyle: 'bridge-deck', tierGroup: 'structure', height: 0 }
  },

  // ======================= 溺毙（2026-09-14 水域行为重做） =======================
  // 完全浸入水体（车体四角均位于 water/river 覆盖内）后开始溺毙倒计时；
  // 归零即沉没摧毁（hp 归零走正常死亡管线：玩家可复活、敌人计分）。出口即复位。
  // 消费方：tank_battle.html 战斗主循环（drownT 累计）+ tank_cover.js tankFullyInWater。
  drowning: {
    seconds: 8,            // 溺毙倒计时（秒）
    // #W15（2026-10-20）实测零消费 ⇒ 已删 `warnAt`（原 3s 警示）。
    //   现行警示由消费方硬编码阈值实现（tank_battle.html 倒计时 HUD <3s 红字），不读本字段。
    // #U37（2026-10-18 用户「河流宽度需要限制，不能造成坦克无法涉水过河」）：
    //   河宽硬上限 = 最慢可用车在溺毙倒计时内能渡过的宽度。唯一口径，消费方
    //   js/tank_nodegen.js placeStripRivers/buildRiver（逐段钳制）。
    //   推导：水中速度 = maxSpeed × speed.pxFactor(1.6) × river.passability(0.4) × speed.effMul(1.3)
    //         8s 可渡 = 该速度 × drowning.seconds(8)
    //         · hummel（最慢，maxSpeed 40）⇒ 40×1.6×0.4×1.3 = 33.3px/s ⇒ 8s = 266px
    //         · tiger-I（120）⇒ 249.6×0.4 = 99.8px/s ⇒ 8s = 799px
    //   取 260（比最慢车的能力再留 6px 余量）。实测改前河宽 p50=573 / max=805，
    //   hummel 穿 446px 河需 9.8s > 8s ⇒ 必溺毙；钳到 260 后任何车都能安全涉水。
    wadeMaxWidth: 260
  },

  // ======================= 破障（可破坏地图元素） =======================
  breach: {
    heSplashRadius: 24    // HE 弹销毁瞬间的溅射半径（px）——只伤害可破坏元素，不对坦克溅射
    // #W15（2026-10-20）实测零消费 ⇒ 已删 `heCoverDmg`（原 1）：js/tank_fire.js 固定传 1，
    //   从不读本字段。若要参数化 HE 破障伤害，需同时改 tank_fire.js 的硬编码实参。
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
    // 2026-10-23（用户裁定）：① 削弱两种制导的拐弯能力（原 lock 3.5 / wire 4.5 → 2.0 / 2.5）；
    //   ② 越障口径：线导式**默认**可越过低矮掩体（非建筑/岩石等全高障碍），锁定式仅
    //      overflyChance 概率越障；③ 攻顶升级（topAttack）命中按 dmgScale 折减伤害、
    //      穿甲改按目标最薄装甲判定（见 tank_fire.stepShells 的 topAttack 分支）。
    lock: { turnRate: 2.0, navConstant: 2.5, overflyChance: 0.5 },
    wire: { turnRate: 2.5, navConstant: 0.0, overflyChance: 1.0 },
    // 攻顶引信（卡牌升级授予，弹体 s.topAttack=true 时消费）
    topAttack: {
      dmgScale: 0.6,        // 伤害基准按 60% 计算
      // 穿甲判定改为目标六面最薄装甲（复用 tank_geometry.thinnestArmorThickness）
      useThinnestArmor: true
    }
  },

  // ======================= 速度 / 机动换算 =======================
  speed: {
    // 2026-08-25 统一换算：kmhFactor=0.4 为唯一 px/s→km/h 系数（HUD/tankKmh 与
    // tank_model 的 stats.maxSpeedKmh 同源同值；旧 PX_PER_METER×3.6 与 CALIBRATED_KMH_FACTOR 双轨已废）
    kmhFactor: 0.4,            // maxSpeed(px/s) × 0.4 = km/h（HUD 显示）
    pxFactor: 1.6,             // 推进速度 = maxSpeed × pxFactor（px/s）
    effMul: 1.3,               // 运行期有效移动速度乘子（地图尺度提速 ~1.3x）；面板 stats.maxSpeed 不变
    accelPowerToPxScale: 15,    // 马力/吨 → px/s² 加速度比例（重校：15 px/s²，使轻坦加速~1.2s满速，重坦~3s满速，带来真实的机械重量感）
    // ===== 制动（#AA4，2026-10-24 用户裁定「刹车是独立系统」）=====
    // 旧口径：~~brakeFactor: 2.2~~ —— 刹车加速度 = 加速 × brakeFactor（即 brake ∝ enginePower/weight），
    //   导致低马力坦克在普通地面滑行距离成倍放大（靶车 ≈ panzer-IV 的 3.2 倍），已于 2026-10-24 作废。
    // 新口径：制动有独立基准，与马力/车重解耦；地形只经 RULES.coverTiers[*].brakeGrip 削弱制动。
    brakeBasePx: 400,          // 基准制动减速度 px/s²（≈ 旧口径中位值：tiger-I 405 / panzer-IV 396）
    terrainLerp: 10            // 地形减速乘子的插值速率（1/s）：进出泥潭/河流时 speedModifier 指数过渡，避免加速度突跳（#AA4 方案 D）
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
    // 闪跃姿态（Tesla RCS 风格闪避位移）
    flash_dash: {
      duration: 1.2,      // 闪跃持续时间（秒）
      speedMult: 2.5,     // 极速与加速度倍率
      cooldown: 8.0,      // 独立冷却时间（秒）
      overheatDuration: 2.0, // 过热减速持续时间（秒）
      overheatSlowMul: 0.7   // 过热期速度倍率（<1 = 减速）
    },
    // 战术护盾——定向/全向弹道吸收（子目标 3）
    shield: {
      dirDuration: 8,    // 定向护盾持续（秒）
      omniDuration: 4,   // 全向护盾持续（秒）
      arc: Math.PI / 3,  // 定向吸收角弧度（π/3 ≈ 60°）
      absorbCap: 150,    // 吸收伤害上限（超过后护盾破裂）
      cooldown: 25       // 冷却（秒）
    },
    // #W9（2026-10-20 用户裁定「删除 super_speed / super_fire_control」）：
    //   两键实测**零卡牌可授予**（196 张卡 + tanks/ + bosses/ 全库零命中），
    //   ABILITY_KEYS_RUNTIME(7) − 卡牌可授予集合 = {super_fire_control, super_speed}。
    //   已删除本处配置（原「// 无人机体系（子目标 4）」注释错挂于此，真正归口在下方 drone 块）。
    //   同批须删 js/tank_abilities.js 的两 case 与 tank_battle.html 的 dispatch/提示文案，
    //   否则 tryActivateAbility 会因 `_d(abilityCfg,'accelMult',3.0)` 全走缺省值而「静默还能用」。
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
      // 视觉上以**中括号形状**标明「我方穿透侧」（#10 2026-10-19 用户裁定改形状）。
      oneWay: true,
      width: 22,         // 掩体厚度（px，旧硬编码 20）
      // #10（2026-10-19 用户裁定）：「单向通过性**仅限掩体后一段有效距离**——如果掩体后
      //   有效区域内有坦克，则无法命中车体，只能命中炮塔；如果坦克不在掩体后的有效区域内，
      //   则可以命中炮塔或车体」。
      //   本值是「掩体装甲侧背后多远仍算有效区」（px）。判定见 js/tank_fire.js 的
      //   behindCoverOnlyTurretHit（纯函数，可 Node 测试）。
      behindValidDist: 220
    },
    deploy_limits: {     // #E4 可部署物数量上限（按类型独立计数）+ 升级增量
      coverMax: 2,       // 战术掩体基础上限（升级卡/局内升级各 +1）
      coverMaxUpgradeStep: 1,
      coverMaxHardCap: 6,
      // ================= 2026-10-22（第五批）雷场改「带状」=================
      // 用户裁定：① 形状改带状以阻挡敌方 AI 冲锋；② 第一次 F 定中心、方向**始终垂直于
      //   鼠标—玩家连线**；③ 伤害与「当前已取得的 HE 伤害」绑定；④ 以车体最薄部位装甲结算；
      //   ⑤ 地雷总数**不设上限**（只设雷场槽位），且**不向玩家显示雷数**。
      // 沿革：mineMax / mineMaxUpgradeStep / mineMaxHardCap 三键于本批**删除**（用户裁定不设总数上限）；
      //   mineFieldRadius（圆形半径 70）删除，被 mineFieldLength / mineFieldBandWidth 取代。
      mineFieldCount: 6,        // 单条雷带的雷数（密度旋钮）。**只影响手感，不在 UI 显示枚数。**
      mineFieldLength: 220,     // 雷带长度（px，沿「垂直于瞄准线」方向）
      mineFieldBandWidth: 56,   // 雷带宽度（px，法向）
      mineFieldDelay: 4,        // 确认布设后到雷场生成的延时（秒）
      // #H2（2026-09-30）布雷装填冷却：确认预约后写入 player.secondaryReloadT，
      //   冷却中再次按 F 直接拒绝（与单发布雷路径 js/tank_weapons.js 同口径，specs/combat.md §8.1）。
      mineFieldReload: 15,
      // 雷场槽位（同时存在的雷场数）：基础 1，升级卡每次 +1，硬上限 3（用户裁定）
      mineFieldMaxDeploy: 1,
      mineFieldMaxDeployCap: 3,
      // 伤害 = 玩家当前 HE 单发伤害 × mineFieldHeRatio（升级卡可 +0.15）
      mineFieldHeRatio: 1.0,
      // 「最薄部位」口径：'hull' = 只取车体三面最小值（用户原话「车体最薄部位」）；
      //   'all' = 车体+炮塔六面（与榴弹炮直击口径一致）。改这里即全局切换。
      mineArmorScope: 'hull',
      // #E4 部署数量升级来源：持有该卡即按 listed 增量累加 deployBonus（可叠多张）
      upgradeCards: {
        ability_deploy_cover_fortified: { cover: 1 },
        turret_bunker: { turret: 1 }
      }
    },
    drone: {
      strikeRange: 400,    // 打击无人机近身自动索敌攻击范围（px，由 260 加强到 400）
      fireInterval: 1.5,   // 攻击间隔（秒，由 2.0 加快到 1.5）
      dmgMult: 0.8,        // 伤害倍率（相对攻击方标准伤害，由 0.4 加强到 0.8）
      orbitDist: 90,       // 环绕玩家距离（px）
      orbitSpeed: 1.2,     // 环绕角速度（rad/s）
      orbitLerp: 6,        // 环绕跟随收敛速率
      countMax: 2          // 场上同时存在的无人机上限
    },
    passiveSlotsMax: 2     // 坦克默认被动技能槽数量（无法通过升级增减）
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
  //       （消费方：js/tank_physics.js resolveHit/applySplashAt + battle 爆轰特效 scale=splashRadius/40）。
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

  // ======================= 电磁轨道炮视效（#U38，2026-10-18；#U39 2026-10-19 配色口径） =======================
  // 消费方：js/tank_fx.js（击发放电弧）、js/tank_battledraw.js（炮身细节/充能电弧/弹体）、
  //   js/tank_fire.js（开火瞬间放弧）。
  // **配色三色口径（2026-10-19 用户裁定，现行）**：炮管 = 灰（金属本体）、基底 = 蓝（能量底座/
  //   导轨间衬底）、弧光 = 白（充能弧 + 放电弧）。三者一一对应下方 grey / base / arc 三组，
  //   **不得**再把弧光画成青蓝、把炮身画成车体色。
  // 三段视效 = ①充能（装填期，导轨间爬行白弧）②击发放电（炮身甩白弧）③弹道（电离针状弹）。
  //   ⚠ 电弧**只在炮身上**：炮弹本身不带电弧尾迹（2026-10-19 用户裁定，旧 shellTrailArcs 已删）。
  railgunFx: {
    // —— #AA-c（2026-10-26）充能循环音频的唯一数值口径 ——
    //   充能电流声是**代码驱动的持续实例**（`js/tank_audio.js` 的 start/update/stopRailChargeLoop），
    //   不是 SOUND_DEFS 键——那张表的层是一次性 start/stop，表达不了循环。
    //   就绪提示是一次性瞬态（键 `SOUND_DEFS.railReady`）；开火瞬态复用 `firerail`。
    //   三段式声学口径见 `docs/specs/combat/audio.md`「电磁轨道炮三段声学」。
    //   沿革（2026-10-27 用户反馈「充能的音效太尖锐、时间太长，只在充能完毕前有一点电流声」）：
    //     ~~sawtooth 110→760Hz / gain 0.16 / 整段装填都在响~~ → **triangle 180→520Hz / gain 0.11 /
    //     只在最后 windowSeconds 秒响**。锯齿的谐波列（含 7.6kHz 附近的高次）是「尖锐」的来源；
    //     2~4 秒的全程持续音是「太长」的来源。音高仍在窗口内完整从 freqMin 扫到 freqMax。
    audio: {
      chargeWave: 'triangle',   // 三角波 = 有电流感但谐波衰减快（锯齿谐波列太亮、太尖）
      freqMin: 180,             // 可听窗口**起点**的基频 Hz
      freqMax: 520,             // 充满前一瞬的基频 Hz（≤600：再高就重新变尖）
      gain: 0.11,               // 循环层增益（再乘 AUDIO_SETTINGS.combatGain 总线）
      attack: 0.06,             // 起音淡入秒数（窗口短，淡入也必须短）
      release: 0.10,            // 收尾淡出秒数（直接 stop 会听到咔声）
      windowSeconds: 0.6        // **可听窗口**：只在距充满 ≤ 该秒数时起声（时长唯一口径）
    },
    // —— 炮管（灰）：金属本体的三档明度，与车体涂装色无关 ——
    barrelGrey:     '#787d84',   // 导轨/炮管主体（中性灰，略偏冷）
    barrelGreyDark: '#4a4e55',   // 背光侧/缝隙
    barrelGreyLit:  '#a8aeb6',   // 受光侧高光
    // #U45（2026-10-19 实机校色）：**炮管可视宽度倍率**。电磁炮在实机上按常规口径算出
    //   barrelWid ≈ 3.24px，两根导轨 + 中间蓝缝的「双轨结构」在 3px 里放不下——
    //   实测两根 1.5px 灰轨直接盖掉 0.7px 缝隙，蓝色基底连 1 个像素都画不出来（炮管读作空管）。
    //   电磁炮本就是笨重的电磁加速器，加宽到 2.2× 才装得下双轨 + 蓝缝 + 白弧三层。
    //   只影响**视觉宽度**（drawTank 局部变量），不改 gunRoot/gunTip 判定与炮口坐标。
    barrelWidMult: 2.2,
    // —— 基底（蓝）：导轨之间缝隙里的能量衬底 ——
    baseBlue:       '#2f5d8c',   // 能量衬底（导轨间长条）
    baseBlueDeep:   '#1b3550',   // 衬底阴影
    baseBlueLit:    '#4d8ec4',   // 衬底受光边
    // —— 弧光（白）：充能弧与击发放电弧共用 ——
    arcWhite:       '#ffffff',   // 弧芯（最亮）
    arcHalo:        'rgba(214,232,255,1)', // 弧晕（冷白，非青蓝）
    // —— 充能（#U45 2026-10-19 实测校色：railgun 的 barrelWid 仅约 3.2px，线宽必须按 1px 级配） ——
    chargeArcs: 6,          // 充能期：导轨间电弧条数
    chargeArcSegs: 5,       // 每条电弧折线段数（越大越细碎）
    chargeArcWidth: 1.2,    // 电弧线宽（px）；1.6 在 3px 炮管上会糊成白斑（实机复核）
    chargeBreechGlow: 0.55, // 后膛能量核亮度（× 进度）
    chargeIdleAlpha: 0.16,  // 满电待机时的微光强度（不闪烁到 0，避免炮口「死掉」）
    // —— 击发放电（也在炮身上，不跟随炮弹）——
    dischargeArcs: 9,       // 击发瞬间：沿炮身的放电弧条数
    dischargeLife: 0.22,    // 放电弧寿命（秒）
    dischargeLenMult: 1.5,  // 放电弧沿炮身方向的伸展（× 炮管长）
    dischargeAmp: 2.2,      // 放电弧横向振幅（px，**炮身量级**——大了就飞散成电光球）
    dischargeWidth: 0.9,    // 放电弧芯线宽（px）；外晕 = ×3.2
    // —— 弹体（不含电弧）——
    shellGlowScale: 1.35,   // 弹体发光半径相对弹宽的倍率
    shellLenMult: 1.9       // 针状弹体长度相对 RULES.shellVisual.length 的倍率
  },

  // ======================= 卡牌抽取（2026-09-19 #D5 调参 → 2026-10-10 #N2 再调参） =======================
  // 消费方：js/tank_cards.js drawCardChoices。
  cards: {
    // #C3 弹种升级卡保底触发概率：候选池存在「链上前驱已在 loadout」的可解锁升级卡时，
    // 以该概率保证 1 张进入候选（单次抽取独立掷骰）。
    // 沿革：2026-09-19 #D5 用户反馈「弹种升级速度太快」——#C3 无条件保底（每节点 1 阶推进）
    ammoUpgradeGuaranteeChance: 0.18,
    //   下调为 0.4 概率触发；2026-10-10 #N2 用户再次反馈同一问题——再降至 0.18 并引入
    //   随局递减（ammoUpgradePace），同时权重抽样通道同步降权（此前只压保底压不住自然抽样）。
    ammoUpgradePace: { decay: 0.55 },
    // #W-G（2026-10-19 用户裁定）：「反应装甲改名为『应急护盾』，当玩家血量低于 10% 时，
    //   生成 1 个持续 10s 的护盾，冷却时间 90 秒，可由卡牌升级、最少 60s」。
    //   ⇒ 机制由 #U40 的「命中驱动拦截 + 60s 再充能」改为「**低血主动生成护盾**」：
    //     · triggerHpRatio：HP 比例低于此值触发（0.10 = 10%）
    //     · durationSeconds：生成的护盾持续时长（10s）
    //     · cooldownSeconds / cooldownMinSeconds：冷却（90s，卡牌可升到最少 60s）
    //     · shieldHp：护盾吸收池
    //   消费方：js/tank_cards.js（emergencyShieldCooldown / updateEmergencyShieldRearm）、
    //   tank_battle.html 主循环逐帧判定、js/tank_shield.js applyShield（生成护盾）。
    //   ⚠️ 旧键 reactiveArmor.rechargeSeconds 已被取代；保留键名兼容读取见 tank_cards.js。
    emergencyShield: {
      triggerHpRatio: 0.10,     // 血量低于 10% 触发
      durationSeconds: 10,      // 护盾持续 10s
      cooldownSeconds: 90,      // 基础冷却 90s
      cooldownMinSeconds: 60,   // 卡牌升级后的冷却下限 60s
      shieldHp: 150             // 护盾吸收池
    },
    // Boss 追加轮专属口径（2026-10-16 用户要求）：「确保至少 1 张传奇、2 张史诗，其余随意，
    //   并把非普通卡的抽中几率调高」。仅作用于 pendingLootRounds > 0 的追加轮，普通节点不变。
    //   · guarantee：按稀有度保底**至少**张数（从稀到常见逐项满足；池内无可用卡时该项静默跳过）。
    //     候选数 5、玩家选 3 ⇒ 这 3 张即可构成「1 传奇 + 2 史诗」，其余 2 张自由。
    //   · rarityWeights：覆盖 RARITY_WEIGHTS 的局部权重表，专供自由槽位抽样——压低普通卡、
    //     抬高稀有以上（原 50/30/15/4.5/0.5 → 20/32/30/15/3）。
    bossRound: {
      guarantee: { legendary: 1, epic: 2 },
      rarityWeights: { common: 20, rare: 32, epic: 30, legendary: 15, mythic: 3 }
    }
  },

  // P-36/#81 biome 地面配色板（取自 P-44 底色表；water 本批不做背景水体）。
  // 消费方：js/tank_battledraw.js drawGround（底色 + 种子确定性低频色斑）。
  biomes: {
    concrete: { base: '#6a6d6f', alt: ['#54575a', '#7d8082'] },   // 城镇街区/交叉火力广场
    meadow:   { base: '#4e5c33', alt: ['#42502b', '#5f6d40'] },   // 密林/林地/村落
    steppe:   { base: '#8a7a46', alt: ['#796b3d', '#9b8b55'] },   // 开阔走廊/混合障壁广场
    mudland:  { base: '#4a3a28', alt: ['#3e3122', '#59482f'] },   // 泥地主题（预留，本批无模板使用）
    // #U12（2026-10-17）：雪地过白刺眼、细节被掩盖。原 base #dfe6ea 相对亮度 0.78（近纯白），
    //   与 alt 色差仅 ~10%，低频色斑与地物对比不足。现整体压暗一档（0.78→0.59）并拉开
    //   base ↔ alt 的内部跨度（10.6%→22%），使纹理可见且不再刺眼。
    snow:     { base: '#c2ccd4', alt: ['#aeb9c2', '#dbe4ea'] },   // 雪地（#1 2026-10-16；#U12 2026-10-17 调暗）
    desert:   { base: '#d6b87a', alt: ['#c4a664', '#e5cb8d'] }    // 沙漠（#1 2026-10-16）
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
    coverWorldScale: { half: 0.42, full: 0.42, building: 0.42, barricade: 0.32, wall: 0.34, wall_breakable: 0.34, perm_block: 0.32 },
    // 2026-09-20 #E11：树木单独收敛（用户反馈树太大）——树/倒树/树桩在模板单位 × nodeScale
    // 之外再乘该系数；树冠视觉（tank_assets.bakeCanopy）同步乘同一系数保持视觉-逻辑同源。
    treeWorldScale: 0.6,
    // ======================= 2026-09-20 #E2 路网重做（去横平竖直 + 加宽 + 公路加速） =======================
    // 用户反馈：路网太单调，都是横平竖直。v3 拓扑在保持「贯穿/支路」骨架的同时引入
    // 斜向干道与更强的曲线弯曲，并按权重混入多种朝向。
    road: {
      widthMin: 92,            // 街道条带宽下限（世界 px，旧 60 → 加宽；#E3 公路加宽）
      widthMax: 124,           // 街道条带宽上限（旧 80）
      // #U45（2026-10-19 用户反馈「有些道路看起来像正弦函数，在地图内的弯太多」）：
      // curveAmp 语义已改为「单一弓形弯的弓顶偏移相对跨度比例」（tank_nodegen.js
      // buildFromPoints——旧版 1~2 个内部控制点独立随机偏移会叠出 S 形/正弦观感，
      // 已重做为全程恒定符号的单弓形）。0.16 → 0.075：弓顶最大横移 ≈7.5% 跨度
      // （2100 宽节点 ≈158px ≈ 1.4 条路宽），仍是可感知的平滑弯道，但一条路
      // 全程只弯一次、无中途回拐。D（平行）/I（双干）拓扑显式传 0.05 维持原收紧。
      curveAmp: 0.075,         // 干线弓形弯顶幅度（相对跨度比例，旧 0.16 → #U45 收敛）
      diagChance: 0.45,        // 干线走小角度斜向（而非正东西/正南北）的概率
      diagAngleMin: 0.18,      // 斜向偏角下限（rad ≈10°）
      // #G（2026-09-21）：0.52→0.42→0.34 —— 斜干 × 正交支道的交角 = 90°−θ−干道链段局部斜率
      // （弯曲引入 ≈7°）。实测 0.42 时最小交角 58.2°（<#B7 的 60° 护栏）；0.34(≈19.5°) 留 ≥63° 余量。
      // #U45 注：弯曲改为单弓形后端点切线即端点连线方向（无旧版端部反向弯），
      //   局部斜率仅由弓顶偏移贡献，浅角护栏余量进一步放大。
      diagAngleMax: 0.34,      // 斜向偏角上限（rad ≈19°）
      // #W15（2026-10-20）实测零消费 ⇒ 已删 `branchCurveAmp`（原 0.10）。
      //   T 形支道 TH/TV 自 #G（2026-09-21）起固定走直线 amp=0，全仓库无消费点；
      //   唯一残留是 js/tank_nodegen.js:1422 的历史注释（属 mapgen 写域，已交接）。
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
    junctionBarricades: {          // 2026-10-22（第五批）：沙包阵 → 直线掩体阵（placeJunctionWalls）
      chance: 0.85,            // 路口生成掩体的概率
      countMin: 2,             // 单路口掩体数下限
      countMax: 4,             // 单路口掩体数上限
      ringMin: 0.9,            // 掩体距路口中心的半径系数（×路宽）下限
      ringMax: 1.9,            // 上限（环形布防，留出通行口）
      breakableChance: 0.45,   // 可摧毁掩体（wall_breakable）的占比；其余为不可摧毁（wall）
      wallLenMin: 62,          // 掩体长度下限（px，单直线）
      wallLenMax: 96,          // 掩体长度上限
      wallThick: 26            // 掩体厚度（px）
    },
    // ======================= 2026-10-22 防线墙体（用户反馈「掩体摆放过于随机，要呈现防线的样子」） =======================
    // 玩家固定从左缘出生、沿推进轴向右推进 ⇒ 敌方防线 = 数道**竖直**墙段（法线朝左
    //   即朝向玩家），防御玩家可能进攻的 2~3 个方向（左/左上/左下 → 用竖墙 + 上下斜墙覆盖）。
    //   与 junctionBarricades（路口环带随机墙）互补：路口墙是「据点近防」，防线墙是「纵深防线」。
    defenseWalls: {
      enabled: true,           // 总开关（false = 回退旧行为：只有路口随机墙）
      linesMin: 1,             // 防线墙体道数下限（难度 0）
      linesMax: 2,             // 上限（难度 1；与敌军防线 linesMin/linesMax 同数量级）
      segLenMin: 110,          // 单段墙长下限（px）
      segLenMax: 190,          // 上限
      thick: 26,               // 墙厚（px）——与 junctionBarricades.wallThick 同口径
      gapMin: 90,              // 通行口（两段墙之间的缺口）下限（px）——保证必有一条可通行走廊
      gapMax: 150,             // 上限
      breakableChance: 0.45,   // 可摧毁掩体占比（与路口墙同口径）
      jitter: 0.10,            // 每段墙的角度抖动（rad）——防线不是直线阅兵，带一点锯齿
      avoidRoad: true,         // 是否避让路面（竖墙横穿路面会封死道路 ⇒ 只在路面之外布设）
      roadPad: 10              // 避让路面的外扩（px）
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
    // 敌军世界边界内缩（#E6：修复「敌人跑到地图范围之外」）。AI 移动输出由 battle 注入
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
    // #77 低难度 full→half 降级帽：**已于 2026-10-20 #W15 删除 `fullDowngradeCap`（原 0.30）**。
    //   根因：半高掩体体系在 2026-09-20 #E3 整体移除后，「full→half 降级」已改为无操作，
    //   降级帽预算随之废弃（js/tank_nodegen.js:3148-3150 明写「已改为无操作」）。
    //   不要恢复本字段：现行低难度掩体骨架靠下方 `fullCullProtect` 保底。
    // #77 cullRate 剔除保护：每模板至少前 N 个全高建筑不被随机剔除（保底掩体骨架）。
    fullCullProtect: 2,
    runNodeCount: 5,              // 一局初始节点数（线性链长度；开放式链下仅作起点，后续 extendRun 追加）
    // ======================= #N4 strip 横向条带节点（2026-10-10 接入实战） =======================
    // 来源：用户 2026-09-21 设计征询（横屏纵横视差）+ C 档 batch 1~2 落地（小地图条带化 /
    // generateStrip 拼接生成器）→ 2026-10-10 用户「使用新的地图生成器」接入实战。
    // 常规（非 Boss）节点改为 generateStrip 产出的 ≈10 屏 × 2.2 屏横向战场；
    // Boss 节点恒走方形模板路径（Boss 生成在 w×0.7、密度乘子 bossDensity 均按方形口径）。
    // 细则归口 docs/specs/map.md §14；false = 全节点回退方形模板（旧行为）。
    strip: {
      enabled: true,
      screensX: 10,               // 横向目标屏数（不做精确绑定，按 ≈3.5 屏/片估算片数）
      screensY: 2.2,              // 纵向目标屏数（片高 ≥3 屏，按中心裁剪）
      chunkCount: 0,              // 片数（0 = 按 screensX 自动估算）
      chunkRows: 1,               // 片行数（1 = 单行条带；>1 = 行×列网格，纵向不再裁剪）
      // 防线参数覆盖：strip 面积 ≈ 方形节点 7 倍，防线数与单线敌数同步放大
      // （每线 3~4 辆成批遭遇，maxAlive 7 仍封顶同时接战数；节奏不变）
      defenseLine: { linesMin: 4, linesMax: 6, perAnchorMin: 3, perAnchorMax: 4, maxPerNode: 18 },
      // #MODE（2026-10-15）生存模式单图口径 —— 2026-10-18 改走「标准 strip 生成链 + 多行片」；
      //   **2026-10-22（第五批）用户裁定「缩小地图」**：3×3 屏。
      //   实测约束：generateStrip 的宽度由 `chunkCount = opts.chunkCount || max(2, round(screensX/3.5))`
      //   决定（js/tank_nodegen.js:3804），且每片宽 ≥3 屏 ⇒ 只改 screensX=3 仍得 2 列 ≈6 屏。
      //   故必须显式给 `chunkCount:1` + `chunkRows:1`：1 列 × 1 行、片宽下限 3 屏 ⇒ 世界 ≈3×3 屏。
      //   唯一配置源；generateSurvivalRun 只读这里（探针不足时回退 chunkCount:2, chunkRows:1 = 6×3）。
      survival: { screensX: 3, screensY: 3, chunkRows: 1, chunkCount: 1 },
      // 2026-10-27 用户裁定：**Boss 节点改用标准 strip 生成器**（路网/水系/多片拼接），
      //   尺寸保持原方形竞技场的 3×3 屏；1 列 × 1 行 + 片宽下限 3 屏 ⇒ 世界 ≈3×3 屏。
      //   原「Boss 恒走方形模板路径」作废；无 viewport 时仍回退方形路径。
      boss: { screensX: 3, screensY: 3, chunkRows: 1, chunkCount: 1 },
      // 2026-10-22（第五批）生存补给点：用户裁定「补给点增加为 4 个，4 个角落各 1 个，
      //   且需要避开坦克不能到达、不能停留的位置」。
      //   · count=4 固定；cornerMargin=0.14 表示四角候选中心在 (0.14w,0.14h) 等四处；
      //   · searchRadius=180 每角方形搜索半径；searchRadiusMax=320 失败后放宽；
      //   · minStationDist=700 站点彼此最小间距；minPlayerDist=520 距玩家出生点最小距离；
      //   · coverPad=60 掩体避让外扩；reachGrid=40 可达性 BFS 网格步长（「不能到达」= 不可达）。
      survivalSupply: { count: 4, cornerMargin: 0.14, searchRadius: 180, searchRadiusMax: 320,
                        minStationDist: 700, minPlayerDist: 520, coverPad: 60, reachGrid: 40 }
    },
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
    // 消费方：js/tank_map.js nodeClearance（纯逻辑）+ tank_battle.html 完成判定/HUD。
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
    // #W14（2026-10-20 role-systems）：补 `aimSpeed`（缩圈/瞄准速度）。
    //   根因：`applyEnemyAppearanceAndStats` 原先不写 `base.aimSpeed`，`makeTank` 的 base 也无该键
    //   ⇒ `computeStats` 回落 `RULES.spread.shrinkRate(0.15)`（**这是另一套量纲**：真实坦克
    //   `tanks/*.json` 的 base.aimSpeed 包络 1.0~2.5）。而 `entityMults.aimSpeed` 的
    //   [0.8, 1.35] 是按真实坦克基准设计的 ⇒ 满难度实测只有 0.15×1.35 = **0.2025**，
    //   即玩家 tiger-I(1.5) 的 **7.4%**：敌军缩圈慢到几乎不收敛，散布恒处扩散状态。
    //   取值 1.2 = 中位中坦量级（落在真实坦克包络 1.0~2.5 内、略低于玩家基准）。
    //   修后满难度 = 1.2 × 1.35 = **1.62**。消费方 js/tank_model.js applyEnemyAppearanceAndStats。
    aimSpeed: 1.2,
    armor: { hull: { front: 100, side: 40, rear: 25 }, turret: { front: 100, side: 40, rear: 25 } }
  },

  // P-46 类别化敌军（#H1 起基准改为 enemyAnchorBase，玩家不再参与，见上）：
  //   敌军各项属性 = 固定基准 enemyAnchorBase × enemyClassProfiles[class] 比例 × 难度系数(entityMults)。
  //   四类比例向量（相对基准 1.0 的比例）收口于此——保证同一节点对所有玩家难度一致，
  //   且两条成长线（玩家卡牌/永久升级 vs 敌人难度）彻底解耦。消费方：js/tank_model.js
  //   applyEnemyAppearanceAndStats / difficultyCapMuls + battle 接线层。
  enemyClassProfiles: {
    light:  { maxHp: 0.80, penetration: 0.90, damage: 0.90, reload: 0.85, maxSpeed: 1.15, turnRate: 1.20, armor: 0.80 },
    medium: { maxHp: 1.00, penetration: 1.00, damage: 1.00, reload: 1.00, maxSpeed: 1.00, turnRate: 1.00, armor: 1.00 },
    heavy:  { maxHp: 1.40, penetration: 1.15, damage: 1.15, reload: 1.25, maxSpeed: 0.80, turnRate: 0.75, armor: 1.35 },
    spg:    { maxHp: 0.75, penetration: 1.10, damage: 1.30, reload: 1.60, maxSpeed: 0.85, turnRate: 0.70, armor: 0.65 }
  },

  // 敌人/友军 AI（P-10 / DEVELOPMENT.md §6 条目 7）：双态行为 + 友军据点消极防御。
  // 现已扩展为多态战术状态机（P-19）：状态包括 Stunned/Flank/Defensive/Search/Patrol。
  // 消费方：js/tank_ai.js（aiDecide）。
  // --- A0 友军指挥（2026-10-27，§4.148）---
  // 六命令 focus/move/follow/hold/retreat/flank 的参数唯一口径。
  // 消费方：js/tank_ally_command.js（纯逻辑）→ tank_ai.js 决策 / battle 开火目标。
  allyCommand: {
    enabled: true,
    wheelEnabled: false,       // 命令转盘暂时关闭（2026-10-27 用户裁定改用 Z/X/C 直接快捷键；实现保留）
    maxAllies: 4,
    arriveRadius: 70,          // 到达判定（px）
    formationSpacing: 110,     // 队形间距（follow 后方 / move 环形半径的基准）
    autoEngageRange: 460,      // 可攻击目标射程（follow 随机 / move 最近）
    stuckSeconds: 4,           // 移动阶段无位移超过该秒数 → blocked（stuck）
    stuckSpeed: 8,             // 「无位移」判定速度（px/s）
    retargetSeconds: 3,        // 自动目标保持时长（follow 随机 / move 最近），防逐帧重掷甩炮塔
    aimTolerance: 0.12,        // 炮塔对准容差（rad）才开火
    countByMode: { standard: 2, survival: 2, boss: 1 },   // 2026-10-27 标准模式保留指挥友军；不再预生成「友军据点」
    allyTankId: 'panzer-IV',   // 友军使用的坦克配置（tanks/<id>.json）
  },

  // ======================= 2026-10-28 G1：完整遭遇（3~5 分钟）——波次节奏唯一口径 =======================
  // Fun hypothesis（用户裁定，勿改）：一辆有重量的坦克 + 2 辆可指挥友军，在节奏可控的三波攻势里
  //   做走位 / 掩体 / 集火的实时决策，波间有喘息窗口用于抢修、占位、主动前压。
  // 分层纪律：**本块只被纯逻辑层消费**——js/tank_encounter.js 读它做状态机与 spawn 提案，
  //   tank_3d.html 读做「是否启用遭遇」的总开关 + 演出。两者都不触碰 entities / covers / DOM 之外的东西。
  // 为什么需要「进攻意志」（写在注释里防回潮）：js/tank_ai.js 的激活门控要求敌人
  //   距离 ≤ RULES.ai.triggerDistBase(700) **且**有 LoS 才置 aiEngaged=true，未激活时只做 patrol 原地微摆。
  //   ⇒ 波次敌人必须由**页面**在 spawn 时强制 aiEngaged=true，并按 intelInterval 秒刷新
  //   lastKnownPlayerPos 到玩家真实位置，否则玩家龟缩即成无限局。模块只负责发 `intel` 事件，不写实体。
  // bearing 口径：世界坐标弧度角（y 向下），0 = 正东(+x)，+π/2 = 正南(+y)，−π/4 = 东北。
  encounter: {
    enabled: true,             // 总开关（页面接线读它决定是否创建遭遇）；false = 退回旧沙盒，便于 A/B 对照

    telegraphSeconds: 2.0,     // spawn 前「来袭预警」时长（秒）。
                               // rationale：够玩家把镜头/炮塔转向告警方位并对位第一发，
                               // 又不至于长到让人干等；与 700px 触发距离 + 敌人推进速度（~100km/h ⇒ ≈280px/s）
                               // 匹配——预警结束时敌人距玩家仍 > 600px，玩家有一次抢占掩体的机会。
    breatherSeconds: 12,       // 波间喘息（秒）。
                               // rationale：按 3 波算共 2 次喘息 = 24s；抢修 + 换位 + 前压刚好够一轮决策循环，
                               // 12s 也短于 RULES 修理类技能的最短装填/引导时长，避免「喘息期无限续杯」。
    breatherRepairPct: 0.30,   // 喘息期抢修：回复 maxHp 的该比例（0.30 = 30%）。
                               // rationale（2026-10-28 上调，原 0.15）：切片没有维修技能、卡牌与商店，喘息是**唯一**
                               //   的血量补充点。按实测承伤速率（缩放后 30 hp/s）算，0.15 只回 36 hp ≈ 1.2 秒的挨打
                               //   时间，等于没有；0.30 ⇒ 单次回 72 hp ≈ 2.4 秒，两次喘息合计 144 hp（60% 血池）——
                               //   仍**不足以**抵消 W3 五辆车的伤害预算，所以「损失有痛感」这条保留，
                               //   但打得漂亮的玩家能站着打完第三波。上限不设更高：喘息的意义是
                               //   「让你有资本继续」，不是「把上一波的失误抹平」。
    reinforceMinAllies: 1,     // 喘息期友军低于该数则补员到该数（standard 模式满编 2，见 allyCommand.countByMode）。
                               // rationale：友军是玩家分配兵力的载体，全灭后该维度的决策消失，
                               // 补回 1 辆即可让「分兵/集火」重新成立；不给满编是让损失仍有痛感。
    minSpawnDist: 600,         // 出生点距玩家最小距离（px）。
                               // rationale：> 玩家有效射程/视野直觉边缘（engageRange 520），保证敌人是「压上来」而非
                               // 「贴脸生成」；同时 < 战场对角（1440×864 ⇒ 1656），留有足够的采样空间。
    maxSpawnDist: 900,         // 出生距离上限（px）。采样区间由 [minSpawnDist, 战场对角] 收紧为
                               //   [minSpawnDist, maxSpawnDist]（方位回退/兜底逻辑不变）。
                               // rationale：出生距离上限。大于 900px 的敌人要以 ~80px/s 推进十几秒才进入接战，
                               //   玩家只能干等，遭遇节奏当场塌陷；实测 W1 抽到 1229px 的点，8 秒内双方零接触。
                               //   900 是「敌人跑 4~6 秒进入交战」的距离，既留出「看见它们压上来」的过程感，
                               //   又不让节拍空转。
    // 出生距离的**硬下限**（px）——方位可行性回退与 spawn 前校正都在守这条线。
    // rationale：低于此距离敌人一出场就进入互射距离（engageRange 520 的一半量级），
    //   「压上来」的过程感全失，还会让 telegraph 的方位提示变成骗人的 HUD。
    //   380 取自 1440×864 战场居中最坏方位（正南：864/2 − 40 = 392）的下浮——
    //   即「连最窄的短轴方位也留得住」的取值。页面不读它，但数值口径必须唯一。
    SPAWN_DIST_HARD_FLOOR: 380,
    spawnTries: 40,            // 合法出生点采样上限（次/单位）。
                               // rationale：40 次伯努利采样在 covers 密集图上仍有 ~97% 命中率，
                               // 单次采样是 O(1) 的点判定，最坏 40 次 × 5 单位 = 200 次判定，不会造成卡帧。
    intelInterval: 6,          // 波次内刷新玩家方位（lastKnownPlayerPos）的间隔（秒）。
                               // rationale：语义是「进攻方指挥部持续更新你的方位」，频率要低于敌人 AI 的
                               // 机动重掷周期（maneuver.reRollTimeMax 4.5s×~1.3），让玩家换位/绕后的收益不被立刻抹平。
    // --- 以下三个键**模块不消费**，由页面（tank_3d.html）直接读取接线 ---
    //   （模块侧只做「键存在 + 取值合法」的哨兵断言，不假装消费。）
    entryReactSeconds: 1.5,    // rationale：波次敌人入场后的反应延迟（写进实体 `aiReactT`，由 `js/tank_ai.js:807`
                               //   消费：aiReactT>0 期间只转炮塔、不移动、不开火，aiState='react'）。没有它，
                               //   敌人出场瞬间就有 LoS 且炮塔已对准玩家（hullAngle 直接指向玩家），
                               //   会**出场即齐射**——玩家在看见敌人之前就吃满一轮。1.5s 同时是「炮塔起转」
                               //   的演出窗口和玩家抢占掩体的决策窗口。
    playerHpScale: 4,          // rationale：3D 切片专用演示缩放：玩家（与友军）maxHp 乘该系数，
                               //   只写 base 后 refreshStats，不动 stats 直写。正式游戏的有效血量由卡牌、
                               //   永久升级与维修技能共同堆叠，切片一条都没接入；不缩放就是「80 血对 50 伤害」，
                               //   出场两发即毁。×4 ⇒ 320 血 ≈ 承受 6~9 发，与「被打 → 找掩体 → 倒车 → 集火」
                               //   的决策窗口同量级。配套 enemyDamageScale=0.3 后：静止撑约 10 秒、
                               //   持续倒车撑约 20 秒。**这是切片演示参数，不是正式平衡值**，
                               //   正式战斗（tank_battle.html）不读它。
    enemyDamageScale: 0.3,     // rationale：3D 切片专用演示缩放：波次敌人的 damage 乘该系数
                               //   （页面写入 base.damage 后 refreshStats）。
                               //   实测（2026-10-28，3 辆敌人对静止不还击的玩家）：未缩放承伤 ≈103 hp/s，
                               //   玩家 2.3 秒即毁；×0.3 ⇒ ≈31 hp/s，配合 playerHpScale 后静止可撑约 10 秒。
                               //   校准目标 = 「站桩是明确惩罚但留有 2~3 秒的人类反应窗口」，
                               //   而真正的生存手段是机动与掩体（AI 无视线即停火，掩体收益远大于换血）。

    waves: [
      // W1 教学波：3 辆 medium 单一方位（东侧）压上。敌方数量 3 vs 玩家+2 友军 = 3，
      //   数量持平但玩家侧有掩体与指挥权 ⇒ 占优；目的是教「接战 → 卡掩体 → 放友军」，
      //   不给任何需要转炮塔的多线压力。
      { id: 'W1', label: '侦察分队', units: [
        { cls: 'medium', bearing: 0, count: 3 },
      ] },
      // W2 分进合击：东北 3 medium 主攻 + 南侧 1 heavy 牵制，共 4 辆。
      //   两个方位 ⇒ 必须转向或分兵；heavy 放次要方位是因为它慢（enemyClassProfiles.heavy
      //   maxSpeed 0.80、转向 0.75），玩家可以先集中掉主攻的 medium 再回头处理它。
      { id: 'W2', label: '分进合击', units: [
        { cls: 'medium', bearing: -Math.PI / 4, count: 3 },
        { cls: 'heavy',  bearing: Math.PI / 2, count: 1 },
      ] },
      // W3 高潮：东北 3 medium + 南/西各 1 heavy，共 5 辆、三个方位。
      //   两辆 heavy 分居南与西，刻意不与 W2 的牵制方向重合，逼玩家整场重排防线；
      //   5 辆是「同时接战仍能逐一点名」的上限——再多就变成被围死（见测试报告的风险项）。
      { id: 'W3', label: '装甲合围', units: [
        { cls: 'medium', bearing: -Math.PI / 4, count: 3 },
        { cls: 'heavy',  bearing: Math.PI / 2,  count: 1 },
        { cls: 'heavy',  bearing: Math.PI,      count: 1 },
      ] },
    ],
  },

  // ======================= 性能预算与自适应降级（G1，2026-10-28） =======================
  // 消费方：js/tank_perf.js 的 createGovernor / updateGovernor / getTierConfig（页面逐帧读生效档位）。
  //
  // 为什么只在这四处：3D 切片（tank_3d.html）是自研 WebGL1 渲染器（js/tank_render3d.js，无阴影、
  //   无后处理、批几何 + 一次 drawScene），性能预算不在「特效开关」而在——
  //   ① 渲染分辨率（canvas.width/height，CSS 撑满视口）
  //   ② 粒子总量（particles 数组：履带扬尘 / 开火烟 / 命中火花 / 破坏扬尘共用一个池）
  //   ③ 动态几何每帧重建量（坦克 + 特效 + 阵营环，每帧全部重建后一次 updateMesh）
  //   ④ 静态几何重建频率（掩体被打烂时重建整张 staticMesh）
  //
  // 降级优先级（玩家感知从低到高，**先降前者**）：
  //   1. 渲染分辨率缩放——变糊，但可读性、判定、操作精度全不变
  //   2. 粒子预算——先砍履带扬尘这类**环境氛围**（dustIntervalS），再砍命中火花/开火烟这类
  //      **战斗反馈**（particleCap 是总闸，只在该砍反馈时才咬）
  //   3. 静态几何重建节流
  //
  // ⚠️ 红线（**绝不降级**）：模拟步长（固定 1/120）、输入采样、HUD 刷新频率、炮弹碰撞判定、
  //   AI 决策频率。理由：这几项一旦降，手感与公平性当场崩（120Hz 步长是命中精度与穿深结算的
  //   前提，AI 决策频率决定敌人反应是否可信），而且它们本来不是瓶颈——60fps 下每帧只跑 2 次
  //   update(1/120)，HUD 每 150ms 一次。降级只能动**表现**，不能动**模拟**。
  perf: {
    enabled: true,               // 总开关：页面接线读它决定是否创建 governor；false = 完全关掉自适应
                                 //   （基线截图 / A/B 对照时必须关，否则档位漂移会让基线不可复现）。
    startTier: 'high',           // 起步档位 'high' | 'mid' | 'deck'。
                                 //   rationale：缺省乐观——1080p 目标机本来就该跑 high，靠 governor
                                 //   真掉帧时往下走，比「保守从 mid 起步」体验好（画质白丢）。
                                 //   Deck 档由页面按设备能力 `createGovernor({startTier:'deck'})` 指定，
                                 //   不在这里做设备嗅探（嗅探常错，且会把同一台机器判成两个档）。
    // 三档数值。**降级只能逐级走**（high→mid→deck，回升同理），不许跳级——跳级会让画面质量
    //   突变，玩家会以为渲染坏了。
    tiers: {
      // ---------- high：1080p 目标机（G1 验收门的基准档） ----------
      high: {
        resolutionScale: 1.0,    // 原生分辨率不缩放。
                                 //   rationale：降级序列的起点，high 档必须等于「接线前」的画质，
                                 //   否则降级没有对比基线，也就无法判断降级到底救回了多少帧。
        particleCap: 420,        // 粒子池硬上限（颗）。
                                 //   rationale：依据 2026-10-28 对本页发射口径的复刻实测（node 复刻
                                 //   tank_3d.html 的四个发射点 + 真实装填 1.4~2.6s，90s × 60 次蒙特卡洛）：
                                 //   开局 W1（6 车）稳态 ≈72 / 峰值 85~150（六车齐射同帧时取上限）、
                                 //   末期 W3（9 车）稳态 ≈150 / 峰值 150~255、极限（全员贴满射速）峰值 ≈295。
                                 //   420 ≈ 极限峰值 +40% 余量。cap 的语义是「防几何无界增长」的硬天花板，
                                 //   **不是**常规裁剪线——压到 300 会在最需要战斗反馈的合围高潮先砍特效，
                                 //   正好违反降级优先级。
        dustIntervalS: 0.09,     // 履带扬尘发射间隔（秒/车）。
                                 //   rationale：等于接线前 tank_3d.html updateTankVisual 的硬编码 0.09
                                 //   （≈11 颗/秒/车，life 0.7 ⇒ 单辆存活 ≈7.8 颗；6~9 车 ≈47~70 颗）。
                                 //   保留原值 = high 档视觉与接线前完全一致，实测能撑住 6 实体。
        maxShells: 40,           // 同屏飞行炮弹上限；超了丢**最老的**。
                                 //   rationale：弹速 ~600px/s、战场对角 1656px ⇒ 单发在飞 1.5~2.7s；
                                 //   9 车 × 0.5~1s 一发 ≈ 9~18 发同时在飞，40 留 2 倍余量。丢老弹几乎
                                 //   不可感知——它已远离炮口、飞向的背景里本来就有同名曳光。
        staticRebuildIntervalS: 0.25,
                                 // 静态几何重建的观察间隔（秒）。掩体被打烂时页面要重新生成整张 staticMesh，
                                 // 是 O(掩体数) 的几何生成——一次齐射同时打掉 3~4 栋楼会连着重建成帧尖峰。
                                 // 间隔只影响「楼倒下的画面更新得多快」，玩家几乎看不出来；但拉长能显著削掉这个尖峰。
                                 // high 0.25 = 接线前的原值（不做无谓改动）；deck 0.60 仍能在半秒内看到楼变成残骸。
      },
      // ---------- mid：降一档（像素 -28%，战斗反馈全保留） ----------
      mid: {
        resolutionScale: 0.85,   // 1080p ⇒ 实际渲染 1632×918（像素量 -28%）。
                                 //   rationale：0.85 是「玩家最不容易察觉」的第一档——几何边缘仍可辨、
                                 //   HUD 是 DOM 完全不受影响，而填充率降 28% 对 GPU 是最直接的减负。
                                 //   降级第一步就该走这里，所以它必须比 deck 温和得多。
        particleCap: 260,        // ≈ W3 合围峰值上界（150~255）。
                                 //   rationale：mid 的定位是「战斗反馈全保留、纯氛围冗余削掉」，260
                                 //   刚好装下巅峰交火；再低就要开始丢命中火花，属于下一档的事。
        dustIntervalS: 0.14,     // 扬尘存活 ≈5 颗/车（比 high 少 36%）。
                                 //   rationale：仍看得出「车在跑」（间隔 0.14s 远短于人眼对连续感的
                                 //   融合窗），再稀就成断续冒烟，反而更显眼。
        maxShells: 32,           // 每发炮弹是独立几何，与 0.85 缩放同档收紧；9 车 × ~3.5 发在飞留余量。
                                 //   rationale：这一档还没有帧时间余量做「按车裁剪」，只能先压总量天花板。
        staticRebuildIntervalS: 0.40,
                                 // 静态几何重建的观察间隔（秒）。掩体被打烂时页面要重新生成整张 staticMesh，
                                 // 是 O(掩体数) 的几何生成——一次齐射同时打掉 3~4 栋楼会连着重建成帧尖峰。
                                 // 间隔只影响「楼倒下的画面更新得多快」，玩家几乎看不出来；但拉长能显著削掉这个尖峰。
                                 // high 0.25 = 接线前的原值（不做无谓改动）；deck 0.60 仍能在半秒内看到楼变成残骸。
      },
      // ---------- deck：Steam Deck / 核显（画质让步换 45fps 以上） ----------
      deck: {
        resolutionScale: 0.7,    // 1080p ⇒ 1344×756（像素量 -51%）。
                                 //   rationale：0.7 是「还认得出是坦克」的下限（再低炮塔环/装甲倾角
                                 //   就读不出来了）；配合 1280×800 的 Deck 原生宽度也是整数像素对齐。
        particleCap: 160,        // ≈ high 档开局 W1 峰值（85~150）的量级。
                                 //   rationale：等于「deck 档的粒子密度 = high 档开局战况」，观感一致；
                                 //   低于 ~120 时命中火花会成片消失，反馈断裂（打中了却看不出打中）。
        dustIntervalS: 0.20,     // 5 颗/秒/车 ⇒ 单辆存活 ≈3.5 颗。
                                 //   rationale：「扬尘还在但不密」的下限。彻底关掉扬尘会让高速行驶
                                 //   失去速度感（3D 切片里没有履带痕迹，扬尘是唯一的位移反馈）。
        maxShells: 24,           // 9 车时仍能同时看见每辆的一次齐射（9~18 发），只裁真正的密集连射。
                                 //   rationale：炮弹本身是「威胁可见性」的一部分，砍过头等于降难度感知。
        staticRebuildIntervalS: 0.60,
                                 // 静态几何重建的观察间隔（秒）。掩体被打烂时页面要重新生成整张 staticMesh，
                                 // 是 O(掩体数) 的几何生成——一次齐射同时打掉 3~4 栋楼会连着重建成帧尖峰。
                                 // 间隔只影响「楼倒下的画面更新得多快」，玩家几乎看不出来；但拉长能显著削掉这个尖峰。
                                 // high 0.25 = 接线前的原值（不做无谓改动）；deck 0.60 仍能在半秒内看到楼变成残骸。
      },
    },
    emaAlpha: 0.12,              // 帧时间 EMA 系数（越小越钝）。
                                 //   rationale：时间常数 ≈ 1/0.12 ≈ 8.3 帧（60fps 下 ≈140ms）——
                                 //   够把单帧尖峰摊到只剩 12%（30ms 尖峰只把 16ms 的 EMA 推到 17.7ms，
                                 //   不到 22ms 门槛），又能让真实劣化在 ~0.3s 内显形。α=0.3 会被 GC 单帧
                                 //   带走（误降级），α=0.05 对 2s 级劣化反应太钝（降级来得太晚）。
    dropAboveMs: 22,             // 持续超过该帧时间就降级（45fps 地板）。
                                 //   rationale：16.7ms 是 60fps 的理论预算，但浏览器合成 + GC 要吃掉
                                 //   3~5ms，所以「稳 60」实际要求 GPU 帧时间 ≤14ms；22ms 意味着已经
                                 //   掉到 45fps 以下，观感开始明显卡顿——此时「降画质换流畅」的收益
                                 //   已经大于「保画质」的收益。
    raiseBelowMs: 14,            // 持续低于该帧时间才考虑回升。
                                 //   rationale：与 dropAboveMs 留 8ms 迟滞带（迟滞是防抖的第一道闸）。
                                 //   14ms 对应「稳 60 且有余量」（16.7 预算 − 3~5ms 合成开销），
                                 //   只有真的回到这个水平才值得把画质加回去，否则会在门槛附近来回抖。
    dropAfterSeconds: 2,         // 超预算持续多久才降（防瞬时尖峰误判）。
                                 //   rationale：GC、切地图、首帧 shader 编译都会瞬时 >22ms，不留滞后
                                 //   就会当场误降；2s 又短于一次交火的长度，真劣化不会拖太久才救。
    raiseAfterSeconds: 8,        // 富余持续多久才升（保守回升，防抖）。
                                 //   rationale：降级是救火要快，回升是加负担要保守——8s ≈ 一次喘息期
                                 //   （encounter.breatherSeconds=12）的大半，避免在波次间隙回升、
                                 //   下一波开打又掉回去，形成肉眼可见的锯齿。
    minTierHoldSeconds: 3,       // 升降后至少锁定多久。
                                 //   rationale：改分辨率会触发 framebuffer 重分配（一帧 hitch），
                                 //   EMA 因此在切换后短暂失真；不锁定就会出现「降→EMA 更差→再降」
                                 //   或「升→hitch→立刻降」的连环抖。3s > dropAfterSeconds(2)，
                                 //   保证每次降级都能被稳定观察 3s 再决定下一步。
  },

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

    // --- 2026-10-26 §4.140 AI 愿意开火的最大距离（= band.max × 该比例）---
    // 与交战带、物理射程三者解耦，各管一件事：
    //   engageBand.max  = 站位意图（dist > band.max → baseMove=1 接近）
    //   fireRangeRatio  = 战术意愿（多远以外宁可推进也不开火）← 本参数
    //   shellMaxDist    = 物理绝对上限（1800，炮弹能飞多远）
    // 1.5 ⇒ medium ≈858 / heavy ≈734 / light ≈999 / spg ≈1046。
    // ⚠️ 不要图省事直接用 shellMaxDist(1800)：开火半径较 572px 翻 ~10 倍覆盖面积，
    //   节点内过半敌人同时开火 + 1500px 外狙击 = 火力过密（用户 2026-10-26 反馈）。
    fireRangeRatio: 1.5,

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
    // #S2 五层级警觉（2026-10-15）：声音传播参数
    // #U4（2026-10-17 用户反馈「被攻击、近失弹、玩家开火在很近的距离上才会反应」）：
    //   原值相对交战尺度偏小（engageRange 520、triggerDistBase 700、strip 节点 17280 宽）——
    //   近失弹 180px 尤其过紧（炮弹落点需几乎贴身才被听见）。现整体上调一档，使「枪声/落点」
    //   在常见交战距离即可触发警觉调查；数值仍显著小于节点尺寸，不会全图联动。
    shotNoiseRadius: 1100,         // 玩家开火枪声传播半径（px）；railgun/autocannon 为 1400
    impactNoiseRadius: 420,        // 近失弹落点声传播半径（px）——原 180，过紧致「贴近才反应」
    suspiciousTimeout: 8.0,        // suspicious 状态无新声音后降级回 calm 的秒数
    // ================= 2026-10-22（第五批）噪声累积升级 + 友军被击中警觉 =================
    // 用户裁定：「标准模式下，敌方 ai『听到』多次射击、友军多次被命中等后就应当直接确定
    //   玩家位置进入交战状态」。
    // 沿革：此前 hearNoise 只把 alertLevel 置 1（suspicious），**全文件没有任何升级到 3 的路径**，
    //   连射越多反而因「同位置 2s 内丢弃」永远攒不满（ISSUES #Z7）。
    // 消费方：js/tank_ai.js hearNoise / noteAllyHit / updateNoiseHeat。
    noiseEscalate: {
      shotHeat: 0.34,          // 听到玩家开火一次累积的热度（3 次即 1.02 ≥ 阈值 → 交战）
      impactHeat: 0.20,        // 听到炮弹落点/爆炸一次累积的热度（5 次 → 交战）
      decayPerSec: 0.12,       // 新鲜窗口过后每秒自然衰减（与 suspiciousTimeout 同量级）
      decayGraceSec: 6,        // 距上次声音 < 该秒数时不衰减——否则主炮 4s 装填间隔的
                               //   每帧衰减量远大于「3 发 1.02 仅超阈值 0.02」的余量，升级永不触发
      escalateAt: 1.0,         // 达到该值即 alertEntity（进入交战 + 记录玩家位置）
      allyHitHeat: 0.5,        // 友军被命中一次为该敌人累积的热度（2 次 → 交战）
      allyHitRadius: 700       // 友军被命中时的群体警觉半径（px）
    },
    // Boss / 生存模式「所有敌人强制接战、立即攻击」的开火最小间隔（秒）。
    // 防止刷出来的敌人在生成帧就一发命中（aiReactT=0 的副作用），不改变接战判定本身。
    forceEngageOpenFireDelay: 0.35,
    // #I4（2026-09-21 用户裁定「boss 几乎完全是站桩等玩家」）：Boss 随机走位层——
    // 周期性在玩家周围随机选点（环绕/侧移），车体驶向该点（炮塔照常锁定玩家开火），
    // 消费方 updateBossBehavior 写 _bossMoveOverride、battle AI 循环覆盖 d.turn/d.move。
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
  // 消费方：js/tank_camera.js（createCamera 缺省 / setZoom 钳制 / updateCamera 阻尼）+ tank_battle.html（滚轮乘法步进）。
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
    // #6（2026-10-15 用户反馈「敌方成长太慢」）：1.20 → **1.0**（线性，中段难度最高）
    curvePow: 1.0,
    diffSatIndex: 12,        // 曲线饱和索引：index≥12 后基础难度封顶（开放式链的"虚拟末节点"）
    curveCap: 0.95,          // 基础难度封顶值
    crossRunLevelBonus: 0.04,// 每级跨局难度等级对基础难度的线性加成
    diffMax: 1.15,           // 有效难度绝对上限（含跨局加成后钳制）
    // 2026-08-25 敌军难度三键重构（替代旧 enemyStatCapVsPlayer=0.8 单一封顶，旧键已删除；
    // 消费方 tank_battle.html applyDifficultyMults 需同步接线）。
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
    speedVsBaseline: {       // 敌军极速相对固定基准的公式（消费方 tank_battle.html applyDifficultyMults）
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
    //   **Boss**（battle applyDifficultyMults 传 applyPlayerCap=false 不走封顶）与其它未封顶路径。
    entityMults: {
      maxHp:         [0.6, 1.8],   // 生命。沿革：#6（2026-10-15）[0.5,1.7]→[0.6,2.2]；
                                   //   §4.144（2026-10-27 成长曲线审计）[0.6,2.2]→[0.6,1.8]：
                                   //   实测高难度 HP 成长 2.37× 而玩家局内 DPS 仅 ~1.5× ⇒ 玩家 TTK
                                   //   恶化 1.58×、末节点优势度 0.45（打不过）。收到 1.8 后回可打区间。
      penetration:   [0.8, 1.5],   // 穿深（#6：[0.75,1.25]→[0.8,1.5]）
      damage:        [0.8, 1.35],  // 单发伤害。沿革：#6 [0.75,1.2]→[0.8,1.5]；
                                   //   §4.144（2026-10-27）：[0.8,1.5]→[0.8,1.35]——与 reload 高难度端
                                   //   加速（1.25→0.82）叠加时敌人 DPS 合计涨 2.10×，远超玩家 ~1.5×，
                                   //   是「被秒」主因。收 damage 保留压力但不一炮半血。
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
  // 消费方：js/tank_ai.js（aiModes，阶段行为模式）；tank_battle.html（weakspot，弱点结算，Wave 2 接线）。
  boss: {
    // #U13（2026-10-16）：Boss 掉血飘字字号倍率（用户要求「boss 掉血的数字需要加大」）。
    // 消费方 js/tank_fire.js 的 _bossTextScale（命中敌方 Boss 时透传给 spawnDmgText）。
    bossDmgTextScale: 1.6,
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
      engageDist: 99999,   // #21：Boss 出生即进入交战（巨大触发半径，绕过常规 trigDist 700 / 巡逻/风筝）
      // #W-J（2026-10-20 role-systems 新增）Boss 机炮射程（px）。
      // 背景：Boss 主武器由 js/tank_boss.js `pickBossArmament` 在运行时随机分配（bosses/*.json
      // 无 weapons 字段），因此**不能**改 js/tank_weapons.js 的全局 autocannon maxRange(900)——
      // 那会连带削弱玩家。改为安装后按 Boss 身份覆写：
      //   js/tank_boss.js `applyBossWeaponTuning(t)` 在 `t.weapons.primary.type === 'autocannon'`
      //   时写 `t.weapons.primary.stats.maxRange = RULES.boss.tuning.autocannonRange`。
      // **调用契约：必须在 assignBossArmament 之后**（安装会重置 stats，提前调用会被覆盖）。
      autocannonRange: 1200
    },
    // ======================= 2026-10-22（第五批）Boss 电磁炮（需求 #13） =======================
    // 用户裁定：「为 boss 使用电磁炮时提供激光炮线动画，为玩家提供 boss 正在使用电磁炮的预警」。
    // 现行口径：Boss 主武器随机到 railgun 时，发射前先进入 chargeSeconds 蓄能期，期间产出
    //   railCharge 事件（绘制白色炮线 + 电弧 + 屏幕顶部预警），蓄能完成后才真正开火。
    // 事件生产：js/tank_boss.js updateBossRailCharge；事件消费：tank_battle.html 的
    //   bossRailFx → drawBossRailLine（js/tank_battledraw.js）。
    // **唯一口径在本键**（勿在 RULES 顶层再写一份）。
    railgun: {
      enabled: true,
      chargeSeconds: 1.2,        // 蓄能时长（秒）——玩家预警窗口
      lineLength: 1400,          // 炮线预览/光束长度（px，与激光同量级）
      lineWidth: 6,              // **only fire 光束**宽度（px）；指示线宽走 laserCoreWidth
      warnLeadSeconds: 1.2,      // 预警提前量（= chargeSeconds，进入蓄能即预警）
      aimTolerance: 0.03,        // 蓄能期锁定的角度容差（rad）——超出则重新蓄能（防瞬转锁定）
      // ============ 2026-10-26 用户反馈四项（现行口径，细则见 specs/boss/railgun.md）============
      // ① 指向玩家的是**红色恒定指示线**（瞄准激光），不是放电攻击特效——旧口径（白 1px 主线 +
      //    3 条 lightningPath 电弧 + 蓝基底 + 线端白光点）已废弃。颜色/尺寸唯一口径在本组，
      //    `js/tank_battledraw.js drawBossRailLine` 只读不写死（`||` 之后只是无 RULES 环境的兜底）。
      laserColor: 'rgba(255,52,42,1)',       // 指示线芯色（红）
      laserGlowColor: 'rgba(255,70,52,1)',   // 外晕色（同色相，低 alpha 宽描边）
      laserCoreWidth: 1.8,                   // 线芯宽 px（细 = 指示性，不是光束）
      laserGlowWidthMult: 3.6,               // 外晕宽 = laserCoreWidth × 本倍率
      laserAlphaMin: 0.55,                   // progress = 0 的线亮度
      laserAlphaMax: 1.0,                    // progress = 1 的线亮度
      laserDotRadius: 3,                     // 线端小圆点半径 px（落点指示）
      // 指示线按全高掩体截断：炮弹确实会被全高掩体挡下，炮线画穿建筑会教错玩家决策。
      // 判据与蓄能激光共用同一几何（`_beamBlockDist`：tierGroup==='structure' 且 vision）。
      blockByFullCover: true,
      // ② 指向期**完全静音**（用户裁定「玩家被电磁炮激光指向时不需要有音效」）：不播充能循环声、
      //    不播 railReady、不播预警 ui 音；只保留屏幕预警（pushLog + 顶部横条）。
      //    ⚠ 只作用于 Boss 侧。玩家自己装电磁炮的 #AA-c 三段声学不受影响（tank_battle.html 玩家段）。
      //    true 会让 Boss 侧恢复 #AA-c 的三段声学接线（音高随蓄能进度上升 + 就绪双响）。
      aimAudio: false,
      // ③ Boss 开火音效改「放箭」而不是电磁炮轰响——键名 `SOUND_DEFS.bossRailFire`
      //    （音色与增益唯一口径在该键；玩家侧电磁炮仍走 `firerail`，分工在 js/tank_fire.js）。
      fireSoundKey: 'bossRailFire'
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
    },
    // 7) Boss 随机武备（#U39，2026-10-18 用户反馈「boss 似乎还不会随机到这些武器和升级」）：
    //    此前 spawnBossFromDef 只随机技能（assignBossSkills），Boss 永远用标准主炮 + 空副武器，
    //    主/副武器与它们的升级卡对 Boss 完全不可见。本表控制随机换装强度：
    //    ① primaryChance/secondaryChance = 分别随机换主炮/装副武器的概率（逐 Boss 独立掷骰）；
    //    ② upgradeChance = 每张升级卡的抽取概率，随遭遇序号按 upgradeChancePerBoss 递增
    //       （后续 Boss 更可能带满），张数上限 upgradeMax。
    //    消费方：js/tank_cards.js pickBossArmament（纯选择）+ tank_battle.html assignBossArmament
    //    （经 applyCardEffects 应用，与玩家卡牌同一语义通道）。
    armament: {
      enabled: true,
      primaryChance: 0.9,
      secondaryChance: 0.7,
      upgradeMax: 2,
      upgradeChance: 0.55,
      upgradeChancePerBoss: 0.1
    }
  },

  // 经济与存档（P-14 / DEVELOPMENT.md §2.4 / §6 条目 10）。
  // 消费方：js/tank_economy.js（UPGRADE_DEFS / scoreToPoints / killScore / profile 读写）。
  // 两条独立货币线（§2.4）：局内得分（击杀+节点通关，仅本局）vs 商店点数（死亡转化，跨局永久）。
  economy: {
    killScoreBase: 20,        // 普通敌人击杀得分（Boss 掉落见 bosses/*.json loot.score）
    // 2026-10-22（第五批）需求「提高击毁高等级敌人所获得的分数」：
    //   击杀分 = round(killScoreBase × (1 + killScoreLevelStep × (敌人等级 − 1)))
    //   实测：Lv1=20 / Lv4=35 / Lv7=50 / Lv10=65 / Lv13=80（友军击杀仍 ×0.5）。
    //   敌人等级唯一来源 = tank_battle.html enemyLevelForDifficulty（diff→Lv1~13），
    //   由 applyEnemyAmmoByLevel 写入 tank.enemyLevel（js/tank_model.js）。
    killScoreLevelStep: 0.25,
    scoreToPointsRatio: 0.1,  // 死亡时局内得分 → 商店点数 转化比例（10%）
    refreshCost: 10,          // 卡牌三选一刷新费（消耗局内得分，开放问题 5）
    reviveCost: 40,           // 局前购买追加复活次数（商店点数）
    // 2026-10-22（第五批）需求「小幅降低后期升级所需的花费」：
    //   价格 = round(baseCost × costGrowth^lv × (lv > shopLateFromLevel ? shopLateDiscount^(lv−shopLateFromLevel) : 1))
    //   实测 fast_reload(25/1.6)：Lv5 262 不变 → Lv10 2749→1812(−34%) → Lv15 28823→12520(−57%)。
    shopLateFromLevel: 5,     // 从第 6 级（ownedLevel=5）开始打折
    shopLateDiscount: 0.92,   // 每级额外 ×0.92（−8%）
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
    reload:           { min: 1.0, max: 3.0 },  // 装填秒数：下限 1.0s（2026-09-17 #C2 用户裁定，取代旧 0.5s；实际开火间隔=reload×reloadMult，reloadMult<1 通道不受此限）；上限 3.0
    //   ⚠️ #W15 注释纠正（2026-10-20 role-systems 实测）：ISSUES 曾记「reload.max 零消费」
    //   ——**不成立**。`max` 有两处真实消费，勿删：① `js/tank_panels_core.js` parameterClamp
    //   双向读 min/max（`scripts/test-panels.js:225` 断言 `parameterClamp('reload', 99) → 3.0`）；
    //   ② `designer.js:2390` clampParamInput 对任意 limKey 双向钳制。
    shellSpeed:       { min: 600, max: 2100 }, // 弹速 px/s 包络 1000~1600（±30% → 700~2080）
    maxSpeed:         { min: 60,  max: 375 },  // px/s；max=150km/h÷kmhFactor0.4=375（用户裁定 ≤150km/h）；min 对应 24km/h
    // #AA4（2026-10-24 用户裁定「卡牌可以改善刹车」）：制动成为卡牌可达 stats 字段，必须有硬限。
    //   基准 = RULES.speed.brakeBasePx(400)；min 150 防「零制动 → 无限滑行」，max 900 = 2.25× 基准
    //   （防止堆卡退化成瞬停）。达限判定由 cardEligible(#U20) 据同表双向过滤。
    brake:            { min: 150, max: 900 },  // px/s² 制动减速度
    turnRate:         { min: 1.0, max: 3.5 },  // 车体转速 rad/s 包络 1.6~2.5（±30% → 1.12~3.25）
    turretTurnRate:   { min: 1.0, max: 4.0 },  // 炮塔转速 rad/s 包络 1.5~3.0（±30% → 1.05~3.9）
        enginePower:      { min: 200, max: 9999 }, // 马力包络 300~900（±30% → 210~1170）；max=9999=无上限（B3 #73 修复：engine_power_up 升级「受运行时重量上限间接约束」，不受马力封顶）。仅 runShopLimitBlocked #A4 派生消费。
    spreadMult:       { min: 0.5, max: 3.0 },  // 三扩系数包络 0.8~2.0（±30% → 0.56~2.6）；min 与 RULES.spread.multFloor 同级防穿零
    motionSpreadMul:  { min: 0.5, max: 3.0 },  // 对齐 spreadMult 边界（用户 2026 决定：姿态稳定 steady_mount 的达限判定与三扩系数同级）
    // #U40（2026-10-19 卡牌审计）：补 3 个「卡牌单通道」参数的边界——此前无 limits ⇒ #U20 属性
    //   达限过滤（cardEligible）对它们永不触发，满级参数卡仍反复出现（用户反馈「射速、精度等
    //   升级在满级后不该再出现」的一部分）。口径：
    //   · aimSpeed：缩圈速度。**两套基准并存**——makeTank 缺省走 RULES.spread.shrinkRate(0.15)，
    //     真实坦克 spec 直写 base.aimSpeed（存量包络 1.0~2.5，实测 tanks/*.json 6 型）。
    //     max=6：从最低基准 1.0 起允许 ×6 叠加（全精度卡远超此值，实际对局 2~4 倍即触顶）；
    //     min=0.1 防负值。
    //   · trackLock：履带锁定秒数，基准 RULES.modules.trackLockDefault 8s（spec 均不覆写）；
    //     下限 3s（局内商店 track_field_kit 限 5s，卡牌稀有通道允许再压到 3s）；上限 20s 容错。
    //   · fireControlCrit / loaderAmmoCrit：P-49 概率修正加值，上限 = RULES.modules.critBonusCap
    //     （0.25）——与 computeStats 的 [0, cap] 钳制同源，越界卡牌被 #U20 过滤。
    aimSpeed:         { min: 0.1, max: 6 },
    //   ⚠️ #W15 注释纠正（2026-10-20 role-systems 实测）：ISSUES 曾记「aimSpeed.min /
    //   trackLock.max 单侧钳制、永不生效」——**不成立**，勿删这两个边界：
    //   · aimSpeed.min(0.1)：`js/tank_model.js` computeStats 只钳 `.max`（#U40 无条件钳制），
    //     但 `cardEligible` 的 #U20 达限过滤与商店 `runShopLimitBlocked` 都**双向**按
    //     `{min,max}` 取边界 ⇒ min 参与「模拟下一级后越界」判定（缩圈速度被压到 0.1 以下即判不合格）。
    //   · trackLock.max(20)：`computeStats` 只钳 `.min`（3s 下限），而 max 同样被上述两处
    //     达限判定双向消费（履带修复卡叠到 >20s 即判不合格）。
    //   即：**聚合钳制是单侧，资格判定是双侧**，两侧口径不同但都在用。
    trackLock:        { min: 3,   max: 20 },
    fireControlCrit:  { min: 0,   max: 0.25 },
    loaderAmmoCrit:   { min: 0,   max: 0.25 },
    // 2026-10-22（第五批）机炮/弹夹/雷场「武器通道」边界：#U20 达限过滤与 cardEligible 都按
    //   {min,max} 双向取边界，故这些键必须登记在此，否则新卡的 maxStacks 上限只是装饰。
    maxRange:         { min: 300, max: 1200 }, // 机炮射程 px（900→1200；PX_PER_METER≈10.92 ⇒ 82m→110m）
    overheatLock:     { min: 1.0, max: 4.0 },  // 机炮过热锁定秒数（2.0，升级 −0.5/次，下限 1.0）
    clipCycleSeconds: { min: 0.5, max: 1.0 },  // 弹夹内短装填秒（0.7，升级 −0.1/次，下限 0.5）
    mineFieldCount:   { min: 3,   max: 12 },   // 雷带雷数（6，升级 +2/次）
    mineFieldLength:  { min: 120, max: 460 },  // 雷带长度 px（220，升级 +80/次）
    mineFieldReload:  { min: 6,   max: 15 },   // 布雷冷却秒（15，升级 ×0.85/次）
    mineFieldMaxDeploy:{ min: 1,  max: 3 },    // 雷场槽位（1，升级 +1/次，硬上限 3）
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
    secondary: ['none', 'mortar', 'missile', 'missile_wire', 'rocket', 'mine_layer', 'turret', 'howitzer', 'smoke']
  },

  // ======================= 2026-10-22（第五批）武器机制常数（唯一口径） =======================
  // 全部由 js/tank_fire.js / js/tank_weapons.js 消费；**不得**在业务代码里写死这些秒数。
  weapons: {
    // 用户裁定：「单管射击后切换时间固定为 0.8s 不受卡牌、升级影响」。
    // 沿革：原 WEAPON_DEFAULTS.double_barrel.switchSeconds=0.5，且「同步击发装置」卡可改到 0.1、
    //   「交替装填系统」卡可改到 0.05 —— 该卡已删除，交替装填只保留 altReload 语义（epic）。
    doubleBarrelSwitchSeconds: 0.8,
    // 用户裁定：「爆发射击（按空格键以固定 0.5s 的短装填时间射出所有弹夹内的炮弹）」。
    clipBurstCycleSeconds: 0.5,
    // 用户裁定：「砰砰炮（主炮射击后 0.8s 再射出 1 发 0.6 倍当前伤害的炮弹）」。
    standardDoubleTapDelay: 0.8,
    standardDoubleTapDmgMul: 0.6
  },

  // ======================= 2026-10-22（第五批）速射机炮成长边界（唯一口径） =======================
  // 用户裁定：① 过热后**不再立即冷却**，等待 overheatLock 锁定结束后才开始冷却；
  //   ② 穿深改为标准穿深的 **80%**（原 85%）；
  //   ③ 射程升级每次 +100px、上限 1200px（卡面按 m 显示，PX_PER_METER≈10.92 ⇒ 82m→110m）；
  //   ④ 过热锁定时间每次 −0.5s、最少 1s；⑤ 穿深增强为「相对标准穿深」的比例，每次 +5%、最多 +10%。
  // 消费方：js/tank_fire.js（updatePrimaryHeat / fireTank / firePrimaryShell）、卡牌 statOverrides。
  autocannon: {
    basePenRatio: 0.80,        // 机炮基础穿深 = 标准穿深的 80%（WEAPON_DEFAULTS.autocannon.penMult 同值）
    rangeBasePx: 900,          // 基础射程（px）
    rangeStepPx: 100,          // 每级射程加成
    rangeMaxPx: 1200,          // 射程硬上限（卡牌 maxStacks 之外的兜底钳制）
    overheatLockBase: 2.0,     // 基础过热锁定（秒）
    overheatLockStep: 0.5,     // 每级缩减
    overheatLockMin: 1.0,      // 锁定下限
    penRatioStep: 0.05,        // 每级穿深比例 +5%
    penRatioMax: 0.10          // 最多 +10%（0.80 → 0.90）
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
    // #AA4（2026-10-24）：制动附着系数——只削制动、不碰极速/加速；未声明的 tier 一律 1.0
    if(t.brakeGrip === undefined) t.brakeGrip = 1.0;
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
