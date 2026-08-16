# 战术坦克 Roguelike — 开发与进度文档

> 配套原型文件：`tank_mvp.html`（单文件 Canvas 原型，验证战斗核心手感）
> 本文档记录：已定型的设计决策、已实现的系统、已知的技术债、以及明确待办的开放问题。
> 每次设计方向有实质变化时，应更新本文档，而不是让决策散落在对话记录里。

---

## 1. 项目定型

**类型**：节点式地图推进 + 局内得分驱动构筑 的战术坦克 Roguelike（俯视角 2D）。每个节点是一块独立的、有限范围的战场，难度随节点在地图中的推进程度随机生成，模拟真实战场"层层推进"的感觉。

**目标单局时长**：从 0 开始一局，控制在 10 分钟以内。

**核心战斗立意**：慢节奏、强博弈、拟真物理——摆角度找跳弹角、找掩体、抢位置，拒绝魔幻特效和高频输出。

---

## 2. 已定型的设计决策（按系统分类）

### 2.1 单局结构 —— 节点式地图（本次会话改动）
- 一局 = 一条节点式地图的推进路径，每个节点是一块独立的、有限边界的战场（**不再是"一张大地图无限刷怪"**）。
- 每个节点内部仍是 2.2 描述的摄像机/小地图/敌我构成模式（摄像机远小于该节点地图，约 1:9）。
- **节点内容按难度随机生成**：地图掩体布局、敌军构成、友军据点位置，都根据该节点在推进路径中的难度权重随机生成——难度应随推进程度提升。
- **节点图为纯线性链条**（无分支路线）。难度完全靠**敌人数量、敌人策略（AI 行为/构成复杂度）、数值强度**三者随节点推进同步提升，不靠路线选择制造深度。
- **卡牌与商店在节点之间（地图间）开放**，取代原先"局内得分达到阈值触发三选一"的规则。节点间的商店与死亡后开放的永久升级商店是**两套独立商店**（见 2.4）。

- **节点生成器（P-05 已定型与实现，2026-08-13）**：节点地图元素采用「开发期手写模板库 + 生成时按节点难度加权随机选 + 参数化变化」机制（新模块 `js/tank_nodegen.js`，纯逻辑无 DOM/Canvas 依赖、支持 dual Node/Browser 导出）。
  - **模板结构**：`{ id, name, tags:['low'|'mid'|'high'], w, h, items:[{tier, dx, dy, w, h, angle, verts?, collisionVerts?}] }`，内置 5 个标准模板（开阔走廊、密林阵地、城镇街区、交叉火力广场、混合障壁广场），支持 `registerTemplate` 扩展自定义模板。
  - **生成算法 (`generateNode(difficulty, options)`)**：`difficulty` 为 0~1 连续权重，使用确定性种子 RNG (`createRNG(seed)`，基于 Mulberry32)；按 `difficulty` 动态加权选模板（low/mid/high 权重分布）；做保序随机剔除（密度调节）、高低难度下元素配比调整（高难升 half/full/barricade 比例，低难降为 soft/half）、预损/残骸状态概率 spawned（树→树桩/倒树，沙袋→碎石）。
  - **实例化与快照**：生成兼容 `tank_cover.js` 的元素实例，`applyToCovers: true` 时自动替换全局 `covers` 数组并触发 `snapshotCovers()`，完美兼容 `snapshotCovers`/`resetCovers`/`damageCover` 机制。

### 2.2 战斗单位构成
- **玩家**：单一可操控坦克。
- **敌人**：1v多。分两态 AI（**P-10 已实现，2026-08-15**，见 `js/tank_ai.js` + `RULES.ai`）：
  - 摄像机范围内的敌人：主动索敌（朝玩家转向/靠近/开火，开火复用 `fireTank` shell 管线，含散布/弹种/掩体判定）。
  - 范围外的敌人：默认不活动；只有贴近摄像机边缘（视口外扩 `RULES.ai.edgeMargin`=200px，开放问题 2 已量化）的一批主动靠近，进入范围后转为主动态。
  - 第一版敌人不主动找掩体（开放问题 1 仍开放：正常突进/绕行，后续评估是否加"值不值得绕掩体"决策层）。
  - 敌我通用：`aiDecide(t, ctx)` 输出 `{turn, move, turretDesired, fire}` → 接入层 `driveTank`（车体）+ 炮塔转速/射界逼近 + `fireTank`（开火）。视线判定走 `hasLineOfSight`（§2.7 `vision:true` 灌木/树冠遮挡视线，与弹道穿透是两套判定）。**Boss 与 summons 复用同一敌对 AI**，阶段行为由 `onEnter.modifiers`（reload/maxSpeed/armor 等）自然产生差异。
- **友军据点**：地图上固定点位的我方单位，只在指定小范围内**消极防御**（不追击、不巡逻）。可被摧毁（P-10 已实现：`aiDecideAlly` 原地不动、只打射程内最近敌人）。
  - 据点本身**不是**保护目标/失败条件的一部分（失败条件见下）。
  - 友军击杀敌人 → **玩家获得该击杀分数的一半**（记分接入开放问题 4 非阻塞，见 §4）。
- **伴随机器人（浮游炮）**：卡牌获取的随行单位，提升玩家火力通道，不是独立的"友军据点"概念，两者不合并设计。

### 2.3 死亡 / 复活 / 失败
- 死亡为**永久性**（真正 Roguelike 式）。
- 失败条件：**仅当复活次数耗尽**（`RULES.revive.baseRevives` 耗尽即 gameover）。
- 复活次数：基础 2 次，可在**一局开始前**用商店点数购买追加次数（局内不可购买；购买接入口属经济里程碑 M10，当前只实现消耗/判定）。
- 复活效果：**满状态**复活（hp=maxHp、清 debuff/起火/履带断/弹药架殉爆），位置在**友军据点周围 `RULES.revive.reviveRadius`=150px 内、无障碍物的随机点**（无据点回退玩家出生点），复活后**短暂无敌 `RULES.revive.invulnSeconds`=3 秒**（直击/DOT 均不掉血，视觉半透明闪烁）。
- **P-11 已实现（2026-08-15）**：`js/tank_revive.js`（`findReviveSpot`/`reviveTank`/`canRevive`/`reviveAt` 纯逻辑）+ mvp 死亡判定（`canRevive` → 复活 / 耗尽 → gameover）+ `applyModuleDamage` 与 DOT 的无敌检查（`invulnT>0` 即不掉血）+ 无敌闪烁视觉。复活为**瞬间处理**（无过渡镜头/延迟，开放问题 3 定案：贴 10 分钟单局目标，不打断节奏）。

### 2.4 经济系统 —— 两条独立货币线，互不流通
| | 局内得分 | 商店点数 |
|---|---|---|
| 来源 | 击杀 + 节点通关奖励 (见 4.5 节) | 死亡时局内得分按比例转化 |
| 花费时机 | 仅本局内，节点之间开放 | 仅下一局开始前 |
| 用途 | 节点间三选一卡牌（可消耗得分刷新选项）+ **节点间商店**：买本局内的消耗品/临时强化 | **死亡后商店**：永久升级（贵，局内不可购买）、消耗品（如复活次数，便宜） |

- 节点间商店 与 死亡后商店 是**两套独立商店**，货币互不流通——维持"死亡才能换永久成长"的核心惩罚分量不被稀释。

### 2.5 掩体系统（已实现于原型）
掩体分两种，处理方式完全不同：

**全高掩体（`full`，如完整建筑）**：物理遮挡，只要射线穿过其轮廓就**确定性 100% 格挡**，不看距离、不看车型。

**半高掩体（`half`）**：垂直剖面 + 越掩插值模型（垂直剖面 2026-08-10 定型：弹道实时逐射线判定，取代旧的"距离压制"三规则模型；2026-08-14 C 实验新增受控距离因素——射线高度插值越掩，见第 7 条）：

1. **暴露与射击**（只按垂直剖面分类炮弹是打掩体、车体还是炮塔）：
   - **炮塔**：100% 露出（不受半高掩体阻挡），炮弹可自由越过半高掩体射击。
   - **车体**：中坦车体 100% 被阻挡（0% 露出）；重坦车体露出 25%（75% 被阻挡）。（C 实验：攻击方贴掩体时该分类被越掩覆盖，见第 7 条）
2. **弹道判定实时性**：弹道路径是否穿掩体由实际射线与掩体 OBB 的交点决定（`findCoversOnPath`）——射线绕过掩体（未相交）即无遮挡，直接命中；**半高掩体遮挡带距离因素（C 实验 2026-08-14 修订）**：射线高度在炮口（`RULES.heights.muzzle`，medium 1.8 / heavy 2.2）与目标部位中心高度之间线性插值——攻击方贴近半高掩体 → 射线在掩体入口处高于掩体顶（1.4m）→ 越掩（exposure 1.0）；拉开后恢复垂直剖面遮挡。**炮塔恒露与 16px 方向判据不变**；muzzle 高度为越掩带宽旋钮（详见第 7 条）。
3. **实弹拦截时机**：炮弹在穿越掩体的那一帧、在**掩体入口处**即时判决拦截（`tank_mvp.html` 的 `shellVerticalDecision`）：沿"弹道起点(fx,fy)→前方"整条射线解析会命中的部位，打车体 → 按曝光概率拦截于掩体入口（中坦 100% / 重坦 75%）；打炮塔 → 直接越过。跳弹/反射后弹道起点重置、重新判决。到达目标时按判决部位直接命中，不二次掷骰。
4. **通行门控（driveBy）**：半高掩体按车型决定能否开过——**重坦可压过**（不毁、不推）、**中坦被挡**（MTV 推出）。
5. **方向判据（cutoff）**：掩体必须被实际弹道射线**在命中目标车体前完整穿过**（掩体出口距离 < 命中距离 + 16px 容差）才参与遮挡；骑上/压入掩体的坦克**不会**获得全方向遮蔽。
6. **防炮管越界盲区与炮口穿墙（单向开火防御判据，2026-08-14 实装）**：
   - 坦克紧贴或推挤全高掩体/可破坏掩体时，可能导致程序计算所得的炮口尖端 `gunTip` 越过/贯穿到掩体背面，从而形成“炮管穿墙、在墙后无责任打墙外目标”或“单向无伤开火”漏洞。
   - **防御性阻挡判据**：在开火决策（`tryFire`）和瞄准预览解算（`updateSolution`）时，系统会首先提取并检测 `gunRoot(t)`（炮管根部）到 `gunTip(t)`（炮口尖端）的 2D 物理线段。
   - 如果该炮管物理线段与任何全高或单发阻挡掩体（`mode: 'solid'` 或 `mode: 'single'`，即建筑、沙袋路障或可破坏的树木等）相交：
     1. 开火拦截：开火判定会立即在炮管与掩体的交点处（即相交点）被直接拦截，不再向前发射出飞行的实弹实体。
     2. 特效与扣血：对该掩体施加 1 点普通炮弹扣血（`damageCover`），并在交点位置产生开火爆破火光、冒烟特效与击中能量粒子（`burstExplosion` / `spawnImpactFx`）。
     3. 阻止开火：该次开火无法生成向前的飞行实弹，完美防御并堵死“炮管穿墙无伤射击”漏洞。
   - **飞行动画与射线起点归一**：为了配合该防御判据，飞行炮弹在生成并飞行时的弹道拦截检测与预测射线判定中，其计算射线的逻辑起点统一采用 `fx/fy = gunRoot`（炮管根部），而其视觉生成和真实的初始飞行动画位置依旧对齐在 `gunTip`（炮口尖端），确保了飞弹在任何掩体边界判断上的严密连续性。
7. **半高掩体越掩判定（C 实验，2026-08-14 实装）**：半高掩体遮挡加入**受控距离因素**——本游戏弹道射线无下坠，其高度在**炮口高度**（`RULES.heights.muzzle`，按射手 heightClass：medium 1.8m / heavy 2.2m）与**目标部位中心高度**（`zMid = (zMin+zMax)/2`）之间线性插值：
   - 攻击方贴近半高掩体时，射线在掩体入口处（`t = distA/(distA+distB)`，distA=入口距离、distB=入口到目标距离）仍高于掩体顶（`RULES.heights.cover.half = 1.4m`）→ **该掩体被越过**（不参与遮挡，exposure 1.0）；拉开距离后射线降至掩体顶以下 → 恢复垂直剖面遮挡（中坦 0.0 / 重坦 0.25）。
   - **仅正式 `half` 掩体参与插值**；stump/rubble 等其他 graduated 残骸保持旧行为（永远留在候选列表）。`RULES.heights.cover.half` 缺失时不插值（保守回退旧行为）。
   - **不受影响**：炮塔恒露（zMin ≥ 1.2，插值在恒露 clamp 之后）、solid/single 确定性格挡、16px 方向判据、多掩体乘数路径。
   - 实现于 `getExposure`（`js/tank_cover.js`）；函数签名不变，所有消费点（mvp 预测面板 / 实弹判决 / 飞行）走同一函数自动生效。行为变化：贴半高掩体射击（射手距掩体入口 < 约 1/3 射程）车体可越掩命中——这是实验目的；`scripts/test-covers.js` 新增 5f 用例组（贴掩体越掩 / 拉开仍挡 / 重坦 / 炮塔恒露 / 临界点连续性）。

### 2.7 地图元素：树 / 灌木 / 可破坏掩体（本次会话新增，A1~A3 已实现）

掩体体系从"两种静态掩体"扩展为统一的**地图元素层**：每种元素的行为由 `RULES.coverTiers` 中的 tier 描述（`mode` = 炮弹交互 / `move` = 通行系数 / `crushable` = 压毁 / `hp` = 耐久 / `toTier` = 残骸 / `vision` = 视线遮挡 / `draw` = 渲染类型 / `residueW·residueH` = 残骸尺寸系数，有则用、无则回退 0.6/0.6），运行时状态（hp/残骸化）挂在 `covers` 数组的实例上。

#### 元素行为矩阵（炮弹 × 坦克 × 视线）

| 元素 | tier | 炮弹交互 | 坦克交互 | 视线 | 耐久 → 残骸 |
|---|---|---|---|---|---|
| 半高掩体 | `half` | 纯垂直剖面（炮塔恒露；中坦车体 100% 挡，重坦车体 25% 露），拦截在掩体入口即时判决（见 2.5）；**C 实验：贴掩体越掩**（射线高度插值，见 2.5 第 7 条） | 0.4 减速通行；**重坦可压过、中坦被挡推出**（driveBy） | 不遮 | ∞ |
| 全高掩体（建筑） | `full` | 确定性 100% 截停 | 不可通行（推出） | 不遮 | ∞ |
| 灌木丛 | `bush` | **穿透**（不参与遮挡判定） | 无碰撞无减速 | **方向遮挡**（渲染+未来 AI 索敌） | ∞（不可毁） |
| 树 | `tree` | 树干截停，每发 -1 耐久 | 不可通行（推出） | **树冠遮挡** | 1 发伐倒 → 倒树 |
| 倒树（残骸） | `fallen` | **穿透**（树冠不挡弹，`mode:'none'`） | 不挡路不推不毁（`move:1.0`、不可压毁） | **树冠遮挡** | 终态（`hp:∞` 不可再毁，纯视觉残留） |
| 栅栏（可穿透软掩体） | `soft` | **穿透**，穿过后元素即被摧毁 | 压过即毁 | 不遮 | 1 发 或 1 次压过 → 无残骸 |
| 沙袋路障（一次性） | `barricade` | **挡 1 发**后摧毁；入射角 >70° 时**跳弹**（不触发摧毁） | 压过即毁 | 不遮 | 1 发 或 1 次压过 → 碎石 |
| 树桩（残骸·死配置） | `stump` | 半高概率遮挡（低矮 0.6m） | 压过即毁 | 不遮 | 1 发/压过（当前无 covers 实例、无 toTier 引用，仅供地图作者手动放置） |
| 碎石（残骸） | `rubble` | 半高概率遮挡（更矮 0.5m） | 压过即毁 | 不遮 | 1 发/压过 |

设计要点：
- **视线遮挡只对灌木与树冠有效**：灌木/树冠绘制在坦克之上形成遮挡；`vision:true` 同时作为未来敌人 AI 索敌判断的预留接口（见第 4 节开放问题 1）。半高/全高与可破坏掩体均不遮视线。
- **"越打越平"残骸链**：树 → 倒树（横躺树干+树冠，**终态**：不挡弹不挡路、不可再毁、不可碾毁，纯视觉残留）；沙袋 → 碎石 → 碾毁。破坏不会无脑给纯收益，战场随对抗逐步夷平/清空。树桩已从残骸链移除（死配置保留于 `RULES.coverTiers`，见矩阵行标注）。
- **掩体几何支持任意多边形（2026-08-13，为贴图做准备）**：`covers` 实例带 `verts`（局部坐标顶点数组，长度≥3）时，全部角点计算走 `coverCorners` → `polyCorners`（`js/tank_cover.js`），否则回退矩形 `partCorners`（w/h 半宽半高）；`coverNormalAt`/`getCoverUnderTank`/`resolveCoverCollisions`/`findCoversOnPath` 与 `drawCover` 均按顶点数通用（边循环 `(i+1)%corners.length` 回绕），OBB/SAT 辅助（getOBBAxes/projectOBB/obbOverlap/obbMTV）本就对任意顶点数无假设。残骸化时 `delete cov.verts`（残骸按矩形 w/h 表现）；快照/重置（snapshotCovers/resetCovers）含 verts。对于 L 形凹多边形等复杂掩体，支持多凸包碰撞（`collisionVerts`）：若有 `collisionVerts` 则返回各子凸多边形（凸包）由 `coverCollisionParts` 计算各自的碰撞角点数组用于坦克碰撞与落底判定（`getCoverUnderTank` / `resolveCoverCollisions`），否则 fallback 到单一块的 `coverCorners` 凸轮廓，解决了坦克在凹多边形口袋内被隐形边界卡住的问题。mvp 内置 2 个验证实例：L 形凹多边形全高掩体 @ (250,650)、六边形半高掩体 @ (700,650)。已经解决坦克在口袋内或口袋边缘等视觉空余区被隐形边界卡住的问题，并在 `scripts/test-covers.js` 添加了完整回归测试，验证化合物物理凸包在 OBB SAT 判定下的精准动作。
- **软掩体的价值在减速区**：挡不住弹（穿透），但压过即毁且以 0.45 通行系数惩罚坦克——"用一发弹药买一条进攻路线"成为明确抉择。
- **A3·HE 破障**：HE 弹命中（任意形式销毁）时对落点半径 24px 内的可破坏元素造成 1 点溅射伤害（`RULES.breach`），可同时清理一排栅栏/残骸；**只作用于掩体，不对坦克溅射**（HE 对坦克仍是纯倍率，见 5.4）。
- **A3·路障跳弹**：弹丸与沙袋路障碰撞时复用坦克跳弹逻辑（>70° 反射，一次反射后 `canBounce=false`），跳弹不消耗路障耐久——斜向的沙袋是可以"弹走"的。
- 树为不可压毁（树干挡路，同建筑），只能炮弹伐倒，**树耐久 1 → 一发即倒**（伐倒后倒树仍不可压毁，见上）；灌木不可摧毁。

### 2.8 已明确排除 / 延后的机制（历史）
- 曾被提出并最终排除/延后的机制（无限波次、低矮掩体、1/2/0 部位锁定、友军防线回避区、3D 顶点装甲模型回退）的完整原文见 `ARCHIVE.md`（2026-08-13 归档自 DEVELOPMENT.md §2.8）。
- 其中两条后续指引仍有效：**1/2/0 按键位仍预留给未来"弹种切换"**（AP/APCR/HE 等，非部位锁定）；**3D 装甲模型回退后**，若未来要做"特殊 Boss 专属弱点"之类的差异化机制，应作为独立特例实现，不作为全体坦克的标配系统。

### 2.9 模块系统：装甲边段挂载（已定型并实装，2026-08-12）
- **定位**：模块（`RULES.modules.keys` 扁平 6 类：driver/ammo/engine/gunner/loader/commander，语义上 driver/ammo/engine 属车体、gunner/loader/commander 属炮塔、ammo 两侧均可）**挂载在装甲边上**——每处放置 = 一条车体/炮塔**全形边**（含前/后接缝边）+ 沿边覆盖比例 `len` 形成的边段，向内偏移 `bandDepth`（hull 10px / turret 8px）构成示意带（仅渲染与判定深度，不入 JSON）。**履带（track）不是挂载模块（2026-08-12 设计决策）**：roguelike 定位下不为履带设专门放置——履带碰撞盒 = **现有履带模型前后端一小段距离**（履带沿车体全长，其前后端即车体极前/极后端，`|relX|/halfL > zones.trackBound=0.78`），`moduleFromHit` 对该判定恒先于一切模块带执行、与是否挂载模块无关。
- **数据格式（作者帧）**：`modules: { "driver": [ { "part": "hull", "x": 25.0, "y": -6.5, "len": 0.5, "off": 0, "mirror": true }, ... ] }` —— `(x,y)` 为全形边中点的作者帧坐标，`len ∈ [lenMin=0.05, 1]`（默认 0.4；**2026-08-12 下限从 0.15 降到 0.05**，允许细长模块带）、`off ∈ [-0.35, 0.35]` 为带中心沿边偏移（`off=0` = 边中点对称）、`mirror=true` 时同时在跨轴镜像伙伴边（对 y=0 轴）生成带。**同模块可挂载多处**，命中取覆盖点 len 最小者（细分优先）。**存中点而非边索引**：顶点增删不漂移，且对前/后接缝两种半形约定都健壮。旧 v2 分区格式（`{hull:{...}, turret:{...}}`）由 `normalizeTankModules` 自动迁移（`off=0`、`mirror=true`、part 继承 v2 部件；v2 双 ammo → 2 个放置；v2 hull.track 因 track 已非模块而被丢弃——车体极前端/后端自动判定接管）。
- **坐标帧约定**：JSON 中 hull 模块坐标为**居中帧**（战斗端 `applyTankConfig` 恒把 hull 顶点平移至 bbox 居中；设计器 `defaultHull()` 未居中（bbox 中心 x≈4.75）→ `exportModules` 导出时减 bbox 中心、`applyTankData` 读入时加回——两处对称实现，否则"保存→重载后 hull 模块全丢"）；turret 模块坐标 = 作者帧（无居中换算）。
- **命中判定**：`moduleFromHit`（`js/tank_geometry.js`）车体侧面先做**自动履带区**判定（`|relX|/halfL > 0.78` → 履带/负重轮，任何坦克恒生效），再按 `tank.modules` 做带判定——`findModuleBands` 逐放置生成主边带 + 镜像伙伴带，**直接匹配（保持放置侧别）优先，跨轴镜像回退**（否则 mirror=false 的 y>0 放置会跳到对侧），命中取 len 最小者；无任何带命中 → 结构性 fallback。**镜像伙伴带 = 主带沿 y=0 轴的真镜像**（`off` 需取反：伙伴边在链中反向遍历，镜像点沿边参数 = 1−t，`off` 原样复用会把「镜像」变成「中心对称」——2026-08-12 修复）。**部件级判定**：该部件（hull/turret）存在放置才走带判定；部件无放置（或 `modules` 为 null/空）→ 该部件走旧 zones 分区逻辑保留（旧 json 零行为变化；车体侧面 zones 仅剩 driver/ammo/engine 三段，履带区由上文自动判定先行截获）。
- **设计器交互**：「模块 Modules」编辑模式——列表选中模块 → 点击任意全形装甲边挂载新放置（turret 优先再 hull；len=`moduleLenDefault`、off=0、mirror=`moduleMirrorDefault`；**对称轴两侧（y≤0 与 y>0）的边均可挂载/选中/拖拽**）、点带选中放置、**3 手柄拖拽**（两端 len + 中部 off，`modLenDrag` 时设置 `drag={poly:'moduleLen',...}`）、Delete/Backspace 移除、Esc 取消；「显示内部模块 Zones」复选框渲染已放置带（模块模式恒显示；履带自动区以橄榄色带恒渲染于车体极前/极后端并标注「履带」，不可编辑）；**车体/炮塔可见性切换按钮**（`partVisible`，互斥护栏、至少保留一个部件可见；隐藏部件不渲染、不参与边/带/悬停命中，纯编辑辅助不入 JSON）；保存前 6 个模块必须全部挂载（每类至少 1 处，缺失阻止保存并切到模块模式列出清单）。
- **兼容**：旧坦克（无 modules 字段）加载 → 空放置（不自动派生），需手动挂载全部模块后方可保存；v2 分区格式加载 → 自动迁移为扁平放置（track 除外）。

### 2.10 贴图系统（M0 已实现 2026-08-15；坦克纹理化为后续里程碑）

**现状基线**（2026-08-13 核实）：全程序化矢量渲染、零图片资产；`file://` 兼容承诺（`img` 标签加载本地相对路径可行，与 `fetch` 不同；`server.js` MIME 已支持 png/svg）；`PAINT_CACHE` 离屏缓存先例（`js/tank_paint.js`，key = color+kind+hasTurret+heightClass+verts）；`t.color` 单色主色。

**地图元素（M0，已实现 2026-08-15，P-06 完结）**：
- 新模块 `js/tank_assets.js`：`ASSET_DEFS` 注册表（soft/barricade/stump/rubble/bush/tree/fallen 七档 → 名义尺寸 w/h + 锚点 anchorX/anchorY + `bake(ctx,cov)` 程序化烘焙函数；bush/tree/fallen 另含 `bakeCanopy(ctx,cov)` 树冠/叶片层）+ 浏览器 Image 加载器（`assets/<key>.png` 与 `<key>_canopy.png`，未加载/失败保持 null 永久回退 bake）+ 离屏烘焙缓存（`ASSET_CACHE`，key = key+层+0.5px 量化尺寸，`getBakedSprite`/`bakeAssetCanvas` 先用探针画布 getImageData 量出内容包围盒再精确二次烘焙，锚点保证 ≥1px）+ `drawAsset(ctx,key,x,y,w,h,angle)`（有图 drawImage 绕锚点缩放 / 无图烘焙缓存回退；angle 为接口预留，原画法不随角度旋转）+ `drawAssetCanopy`（树冠层）。注册表纯数据 + 纯函数可 Node 测；document/Image/canvas 全部 `typeof document` 守卫（Node 加载安全）。
- **占位贴图来源**：`drawCover`/`drawFoliage` 原程序化画法（soft/barricade/stump/rubble/bush/tree/fallen 分支）逐字搬运为 `ASSET_DEFS[key].bake`/`bakeCanopy`——**视觉零变化、file:// 兼容、零依赖**；`tank_battledraw.js` 对应分支改走 `drawAsset`/`drawAssetCanopy`（half/full box 保持程序化；`typeof ASSET_DEFS` 守卫保证未加载时安全回退）。
- `tools/bake.html`：一键导出工具（`file://` 可直开）——遍历 ASSET_DEFS 离屏烘焙 + 锚点十字标注 + 合成预览（base+canopy），`canvas.toBlob` + `<a download>` 逐张导出 PNG 到 `assets/`（日后真实美术直接替换同名文件，接口不变）。
- `assets/` 目录契约（README.md）：当前为空 = 全部走程序化 bake 占位；精灵内"掩体中心"应位于 (anchorX, anchorY) 像素处。
- 验证：`scripts/test-assets.js`（61 断言：七键齐全、w/h>0、锚点合法、bake 为函数、mock ctx 调用不抛错且发出绘制调用、Node 下浏览器分支安全 no-op）挂进 `npm test`；`npm run check` 全绿；HTTP 冒烟 `js/tank_assets.js`/`tools/bake.html` 200。

**坦克纹理化（用户已确认：图案叠层 + 主色，后续里程碑）**：
- 不能做整坦克位图 sprite（几何是设计器逐顶点编辑的任意多边形）；做法 = **多边形 clip + 平铺图案叠层**（装甲板纹/焊缝/锈蚀/迷彩），保持 `t.color` 主色（灰度图案 + alpha 或 multiply 叠层），兼容设计器编辑、换色、`PAINT_CACHE` 缓存（key 加 pattern 段）。
- `texture` 字段进 tank JSON + `tank_schema.js` FIELD_ROWS 枚举 + 设计器选择器（外观件条目）。
- 与车型多样性内容合并为独立里程碑（排在摄像机/AI/复活/经济之后；见 §6 条目 11）。
- 炮管/附件/特效保持程序化（角度/状态驱动，贴图收益低）。

### 2.11 声音系统（M1 已实现 2026-08-15，P-07 完结）

- 现状（2026-08-13）：整个项目零音频。
- 决策：**先 Web Audio 程序化合成占位音效**（开火/击穿/未击穿/跳弹/殉爆/履带断/起火/UI），后续替换为资产文件。
- 新模块 `js/tank_audio.js`（2026-08-15 实现）：
  - `SOUND_DEFS` 参数表（fire/pen/block/bounce/ammoBlew/trackBreak/fireDOT/ui 八键，纯数据可 Node 测）——每键 = bus（combat/ui 音量总线）+ 若干合成层（`osc` 层：wave/f0/f1/dur/gain/attack 振荡器 + 频率滑音 + 增益包络；`noise` 层：白噪声突发 + 可选 lowpass/highpass/bandpass 滤波；任意层可带 `delay` 秒做多段打击声）。
  - `AUDIO_SETTINGS` 音量分级：combatGain=0.5 / uiGain=0.25（战斗响于 UI）。
  - AudioContext 惰性初始化（`ensureAudio`/`initAudio`：首次调用创建 + suspended 时 resume，符合浏览器自动播放策略；mvp 在 pointerdown/keydown 一次性监听解锁）+ `playSound(key, opts?)` 单入口（未知键/无 AudioContext 静默返回 false，Node 安全）。
  - `validateSoundDefs()` 纯逻辑校验（Node 可测）。
- **接入 `tank_mvp.html`（18 处挂接）**：开火 `tryFire` → 'fire'；炮管穿掩体拦截 → 'block'；命中四态（`resolveHit` BOUNCE → 'bounce' / PEN（HE 归 pen）→ 'pen' / 其他 → 'block'）；掩体拦截各分支（栅栏穿透毁/半高拦截/沙袋挡下/掩体截停）→ 'block'；殉爆 `spawnAmmoBlowFx` → 'ammoBlew'；履带断 `spawnTrackBreakFx` → 'trackBreak'；起火 DOT 用 `_prevFireT` 上升沿判定**只在起火开始/复燃帧触发一次**（不逐帧循环）；UI 交互（坦克应用/弹种切换/重置）→ 'ui'。
- 独立里程碑、不阻塞其他系统；验证：`scripts/test-audio.js`（51 断言：八键齐全、参数合法、音量分级、无 AudioContext 环境 playSound/ensureAudio/initAudio 不抛错）挂进 `npm test`。

### 2.12 摄像机 + 节点地图 + 小地图 + 流程状态机（P-08 已实现，2026-08-15；§6 条目 6）

单局结构（§2.1 节点式地图）的结构性落地：**每个节点是约 1:9 摄像机比例的大世界**，玩家居中巡航；节点链为纯线性；战斗、结算、卡牌、阵亡之间由全局流程状态机驱动。

**摄像机（`js/tank_camera.js`，纯逻辑，Node 可测）**：
- `createCamera({vw, vh, zoom, bounds})`：视口中心/尺寸/缩放/世界边界；`updateCamera` 指数阻尼跟随目标（`k = 1−exp(−lerp·dt)`）并 `clampCamera` 钳制在世界边界内（视口比世界大 → 居中；大 → 边缘不露世界外）。
- 坐标换算：`worldToScreen`/`screenToWorld`（含 zoom，互逆）；`viewBounds` 返回视口世界 AABB；`aabbInView(cam, x, y, w, h, margin=64)` 视口 AABB 剔除查询（物体中心+半尺寸+余量 vs 视口）。
- mvp 接入：run 模式战斗态每帧跟随玩家；**测试台模式（未开局）保持恒等视口**（`setBenchCamera`：bounds=画布、中心=画布中心 → 屏幕==世界，旧行为零变化）。

**节点地图（`js/tank_map.js`，纯逻辑，依赖 P-05 生成器 + `RULES.nodeMap`）**：
- `generateRun(seed, count)`：一局 = 线性节点链（无分支，§2.1），节点数 `RULES.nodeMap.runNodeCount`（5）；`makeNode` 每节点 =
  - **掩体布局**：复用 `generateNode`（P-05）并加 **`scale` 选项**（`tank_nodegen.js`，模板 w/h 与元素位置/尺寸/verts 同倍率放大；scale=1 零行为变化）——节点世界 = 模板 × `nodeScale`（3），约 700×400 → 2100×1200。
  - **难度曲线（初版，§6 条目 12 的细化另行定表）**：`difficultyForIndex = 0.15 + 0.8·t^1.25`（t=index/(count−1)，单调 0.15→0.95，后段加速）。
  - **敌军构成**：数量 `1 + floor(diff·4)`（1~4）；tankId 取自 `RULES.nodeMap.enemyTankPool`（默认 `['dummy']`，车型多样性里程碑扩充）；重坦占比随难度（diff>0.6 或 35% 概率）；散布在右 2/3 区域，拒绝采样避开掩体包围盒（+60px）、彼此 ≥`enemyMinDist`、离玩家出生点 ≥`enemyMinPlayerDist`。
  - **友军据点**：概率 `outpostChance`（0.7）出现在左侧友军区（x ∈ [0.12w, 0.30w]），远离敌军与出生点。
- **通关奖励（§4.5 落地）**：`scoreNode(node, {damageTaken, clearMs, outpostAlive})` —— base = `100·(1+index·0.2)`；无伤 +50%；速通（clearMs ≤ `RULES.nodeMap.speedClearMs`=120s）+20%；据点存活 +20%。
- **实体化 `materializeNode(node, env)`**：env 显式注入（浏览器传 covers/entities/spawnTank/applyTankConfig+resetEntity；Node 测试传 fake）——替换全局 covers + `snapshotCovers`、清场（保留 player 与测试靶车 dummy）、生成敌军/据点实体（`nodeSpawn` 标记，供清敌判定与 M7 AI 识别）。

**全局游戏流程状态机（`js/tank_flow.js`，纯逻辑，Node 可测）**：
- `FLOW_STATES = map / battle / settlement / reward / gameover`；`FLOW_TRANSITIONS` 白名单转移表（`battle→settlement|gameover|map`、`settlement→reward|map`、`reward→battle|map`、`gameover→map` 等；**非法转移抛错**——测试与 UI 接线的护栏）。
- `watchFlow(flow, fn)` 注册监听（UI 层消费；回调异常被吞，不中断状态机）；`restartRun` 重开（回 map、runId 自增）。
- **战斗循环只是其中一个状态**：mvp `loop()` 模拟门控 `simulating = !run || flow.state==='battle'`——非战斗状态冻结战场，覆盖层接管。

**小地图（`js/tank_minimap.js`，ctx 显式传参，布局纯函数 Node 可测）**：`minimapLayout`/`worldToMinimap`/`worldRectToMinimap` 世界→小地图等比换算；`drawMinimap` 画面板底、世界边界、掩体点（soft/bush 淡、full/barricade/tree 亮）、玩家绿/友军蓝/敌军红标记、摄像机视口矩形。mvp 屏幕空间右上角覆盖层（170×120）。

**视口剔除 culling（条目 6 捆绑前置）**：mvp `draw()` 全部世界绘制套摄像机变换（`translate→scale→translate(-cam)`），covers/树冠层/shells 按 `aabbInView` 剔除（余量 64px），网格只画视口内线段；粒子池化为后续可选项（`drawFxParticles` 暂全量）。

**UI 界面层约定（条目 6 捆绑前置）**：mvp 通过 `watchFlow` 监听状态转移 → 显隐 DOM 覆盖层（`#flowOverlay`：节点图 `mapScreen` / 结算 `settleScreen` / 卡牌 `rewardScreen` / 阵亡 `gameoverScreen`）；数据源是纯逻辑模块返回值（`generateRun`/`scoreNode`），UI 零耦合。卡牌三选一由 P-09 起接真实卡池（`cards/` → `/api/cards` → `drawCardChoices`，见 §2.13）。

**战斗判定接线（mvp）**：进入节点 → `enterBattle`（重置玩家到出生点、相机对齐、`materializeNode`）；战斗态逐帧累计玩家承伤（`damageTaken`）；**敌全灭 → settlement**；**玩家阵亡 → gameover**（M8 复活系统接入前的永久死亡占位）。敌军为静态靶标（无 AI，M7 接入 `driveTank` 即可行为化）；据点 `team:'ally'` 当前仅作结算加分标记（炮弹穿透友军，M7 起为可战斗单位）。测试台（未开局）行为不变。

**验证**：`scripts/test-camera.js`（22 断言：换算互逆/zoom/钳制/阻尼收敛/剔除边界与余量）、`scripts/test-map.js`（难度曲线/敌军数量/节点链确定性/§4.5 评分/materializeNode 注入序列）、`scripts/test-flow.js`（合法/非法转移/监听/异常吞没/restartRun）挂进 `npm test`（现共 14 套）；vm 运行时冒烟验证完整流程：开局 → 战斗帧 → 清敌 → 结算 → 卡牌 → 下一节点 → 阵亡 → 重开（临时脚本，未入库）。

### 2.13 卡牌系统（数据驱动，P-09 已实现，2026-08-15）

**定位（§2.4 已定型）**：卡牌 = 局内节点间**三选一的改装/战术强化**，**不是**手牌指令牌组。拟真坦克主题、拒绝魔幻——效果围绕装甲/穿深/装填/机动/散布/视野/弹种/乘员展开，贴合本游戏"摆角度找跳弹、找掩体抢位置"的博弈调性（参照 Slay the Spire 的稀有度分层+流派构筑，但把"卡牌"落到"坦克改装"语境）。

**数据**：`cards/<id>.json` 一型一文件（与 `tanks/` 同惯例，经 `GET /api/cards` 聚合）。Schema（唯一权威 = `js/tank_cards.js` 的 `validateCard`）：
```json
{ "id": "spaced_armor", "name": "间隙装甲", "rarity": "common", "tags": ["重甲"],
  "desc": "车体正面附加间隙装甲，等效厚度 +12mm。",
  "effects": [ { "type": "modifier", "stat": "armor.hull.front", "mode": "add", "value": 12 } ],
  "maxStacks": 3 }
```

**效果类型（6 类，type 决定 params）**：
1. `modifier` —— `{stat, mode:'add'|'mult', value}`，stat ∈ 白名单（穿透/伤害/装填/弹速/极速/转向/炮塔转速/装甲/履带锁/模块倍率/DOT 倍率/散布/缩圈）或装甲路径 `armor.hull.front` / `armor.hull` / `armor.turret.side`。**立即生效**（走 `addModifier` 管道，§5.1）。
2. `ammo` —— 弹种改造 `{key:'ap'|'apcr'|'he', field:'pen'|'dmg'|'speed', mode, value}`（接入点 §5.4）。
3. `ability` —— 主动装置 `{key:'smoke'|'repair'|'extinguish'|'recon'|'track_repair'}`（按键触发，M9 接入）。
4. `passive` —— 机制性被动 `{key:'reactive_armor'|'angle_boost'|'overmatch'|'spall_liner'|'commander_sight', value?}`。
5. `drone` —— 伴随浮游炮（§2.2 已定型，M7 接入）。
6. `economy` —— `{field:'scoreMul'|'shopDiscount'|'startScore'|'reviveCount', value}`（M10 落地）。

**稀有度与流派**：稀有度 4 档 `common/rare/epic/legendary`（抽卡权重 50/30/15/5）；流派 5 个标签 `重甲/狙击/机动/爆破/支援`（构筑方向，可多标签）。**内容规模已落地：111 张卡**（common 55 / rare 34 / epic 16 / legendary 6，实测占比 49.5/30.6/14.4/5.4%，5 流派各 21~23 张），覆盖 6 类效果（modifier 101 / ammo 17 / ability 8 / passive 8 / economy 5 / drone 1）。

**模块与工具**：`js/tank_cards.js`（纯逻辑：`validateCard`/`validateCardSet`/`applyCardEffects`/`drawCardChoices`/`cardStackCount`/`weightedRarity`）；`scripts/validate-content.js`（内容 schema 守门，挂 `npm test`）+ `scripts/audit-content.js`（稀有度/流派/效果类型分布与数值极值审计，`--strict` 按阈值失败）；`tools/content_designer.html`（卡牌+Boss 统一编辑器，表格化编辑 effects、保存写回 JSON）；子 agent `@card-author`/`@balance-auditor`。mvp 的节点间三选一已接真实卡池（`/api/cards` → `drawCardChoices` 抽 3 → `applyCardEffects`）。

### 2.14 Boss 系统（数据驱动，P-09 已实现，2026-08-15）

**定位**：Boss = **特殊坦克配置 + 数据驱动多阶段机制**（参照 FTL Rebel Flagship 多阶段——每阶段改变打法；Into the Breach 弱点驱动——意图可读、位置博弈）。**不是弹幕墙**，延续"摆角度/打弱点/抢位置"的拟真博弈。**内容规模已落地：5 种 Boss**，打法彼此区分。

**数据**：`bosses/<id>.json` 一型一文件（经 `GET /api/bosses` 聚合）。Schema（唯一权威 = `js/tank_boss.js` 的 `validateBoss`）：
```json
{ "id": "siege_fort", "name": "要塞炮台", "tankId": "dummy", "scale": 1.8,
  "stages": [ { "id": "fortified", "hpFrom": 1.0, "hpTo": 0.66, "behavior": "固守",
                 "weakspots": ["ammo"], "onEnter": { "modifiers": [ { "stat": "armor.hull.front", "mode": "add", "value": 80 } ] } }, ... ],
  "loot": { "score": 500, "cardRarity": "legendary", "cards": 3 } }
```

**阶段约束**：首阶段 `hpFrom=1`、末阶段 `hpTo=0`、相邻阶段阈值衔接（`validateBoss` 强制）；每阶段可声明 `behavior`（AI 接入层消费）、`weakspots`（弱点模块 ∈ `BOSS_WEAKSPOT_KEYS`：driver/ammo/engine/gunner/loader/commander/track）、`onEnter.modifiers`（阶段进入时叠加的 stat 修饰）。**阶段 modifiers 语义 = 该阶段相对 base 的完整画像**（`applyBossStage` 切阶段时自动 `removeModifierBySource` 移除上一阶段，故每阶段只写"本阶段应有的差值"，不写跨阶段 +X/−X 抵消）。

**5 Boss（已落地）**：
1. `boss_siege_fort` 要塞炮台——正面 +80 免疫固守 → 绕侧打弹药架破甲（回 base 恢复机动）→ 狂暴突击。
2. `boss_twin_track` 双体履带——打前段（track/engine/driver）降机动、后置引擎暴露 → 末段高速甩尾。
3. `boss_sniper` 幽灵狙击手——远距高穿低散布放冷枪 → 破观测（commander）后散布失控 → 近身盲射。
4. `boss_fortress` 移动堡垒——反应装甲 + 2 浮游炮（summons）→ 剥反应层 → 浮游炮全毁本体脆化。
5. `boss_commander` 装甲指挥官——护盾屏障 + 护卫（summons）→ 破盾打指挥塔 → 孤注一掷。

**模块与工具**：`js/tank_boss.js`（纯逻辑：`validateBoss`/`validateBossStage`/`bossStageFor`/`bossStageIndex`/`bossInStage` + 运行时 `makeBossEntity`/`applyBossStage`/`updateBossStage`）；编辑器/校验/审计工具与卡牌共用（`tools/content_designer.html` / `validate-content.js` / `audit-content.js`）；子 agent `@boss-author`/`@balance-auditor`。**运行时已接入**：`assignBossNode` 给链尾节点指定随机 Boss → `enterBattle` spawn Boss 实体（`makeBossEntity`，满血+首阶段 modifiers）→ 战斗态 `updateBossStage` 跨血阈值切阶段 → Boss 击杀结算 `bossLoot`（score + 卡牌稀有度）。

---

## 3. 当前原型（`tank_mvp.html`）已验证的系统

- **移动/转向（WASD）、鼠标瞄准（带转速限制）、开火/装填** — 加减速基于**车重 `weight` 与发动机马力 `enginePower`**（存于 base 层）：`accel = enginePower/weight * 180`（px/s²，`RULES.speed.accelPowerToPxScale`），越重越快达不到峰值、低马力的重型车加速最慢；刹车 `brake = accel × 3.5`（`RULES.speed.brakeFactor`）恒快于加速，松键减速再乘 1.8，实现真实的重型惯性与滑停感（数值以 `RULES.speed` 为准，见 §5.5）。
- **坦克间碰撞（2026-08-10 重写）**：每帧对实体两两做 OBB SAT 解析（`resolveTankCollisions` → `obbMTVs`，`js/tank_cover.js` 提供全部候选 MTV）。**稳定选轴**：近最小深度（≤1.15×）的候选轴内优先取"最抵消逼近运动"的轴（相对速度投影决胜），深叠/近方形重叠时推出轴不再逐帧横跳；**速度冲量**只作用于法向闭合分量（`j = 相对法向速度/2`，完全非弹性），标量速度经投影重建到各自车体轴（`js/tank_entity.js`），无 `Math.hypot` 方向丢失、无逐帧乘法砍速。两车对撞/推挤/交叉不再抖动、不穿模、不横向幽灵滑移；推挤时被推车沿自己车体轴获得动量（被顶走）。
- **瞄准线**：炮口沿炮管方向的虚线参考线（长 900px，无散布），任意角度朝向目标都有可见瞄准线；发射炮线已删除，炮弹用真实飞行动画呈现（旧 `firstObstructionPoint` 截停高亮线已移除）。
- **掩体遮挡：垂直剖面 + 射线高度插值（MVP 已实现）**：`getExposure`（`js/tank_cover.js`）删去旧"距离压制"规则，只按垂直剖面分类——炮塔（zMin≥1.2）恒 100% 露出；车体中坦 0% 露出 / 重坦 25%（`RULES.coverRules`）；方向判据 + 16px 贴掩体容差保留（`COVER_DIRECTION_TOLERANCE`，防骑掩体误遮蔽）。**C 实验（2026-08-14）**：正式 half 掩体参与射线高度插值——`rayH = 炮口高 + (zMid − 炮口高) × t` 在掩体入口高于 1.4m 即越掩（贴掩体越掩），stump/rubble 等残骸仍走纯垂直剖面。**实弹在掩体入口即时判决**：`tank_mvp.html` `shellVerticalDecision` 沿弹道起点(fx,fy)→前方整条射线解析命中部位，`graduated` 掩体在穿越帧按曝光概率拦截于掩体入口（中坦 100% / 重坦 75%），通过者到达时按判决部位直接命中（`s.dec`，不二次掷骰）；弹道起点随跳弹/反射重置、判决重算；**被挡即被拦截**（不回退改打另一部位，引导玩家改打炮塔，预测面板同源）。
- **双座圈圆心与炮管前缘交点绑定**：设计器 `tank_designer.html` 提供了两个独立的座圈圆心编辑：
  - **车体的炮塔座圈圆心 (`pivot`)**：车体坐标系下，炮塔在车体上的安装偏移（支持 `dx, dy` 双向数字输入与“车体”模式下的画布拖拽）。
  - **炮塔的炮塔座圈圆心 (`axis`)**：炮塔坐标系下，座圈圆心的相对横坐标（`axis.dx` 数字输入与“炮塔”模式下的画布拖拽，`axis.dy` 固定锁死为 0）。
  - **炮管与附件锚定**：炮管根部、炮盾、热护套、抽烟器与制退器全套依托 `turretToScreen([frontX, 0], angle)`（炮塔前缘装甲与 y=0 对称轴交点）绑定延伸，旋转时围绕 `axis` 精准自转，矢量紧密缝合，杜绝脱节分离。
  - **轴点 y 兜底（2026-08-12）**：`render()` 内「炮塔自身中心」甩尾距离读数以 `const ay = (state.turret.axis && state.turret.axis.dy) || 0` 取轴点 y（与 `ax` 对称、缺省兜底，无 `turret.axis` 的旧条目也安全）。
- **设计器模式按钮精简**：精简模式切换为「车体 Hull」、「炮塔 Turret」、「预览瞄准 Preview」3 个模式按钮，删除不必要的「旋转中心 Pivot」与「炮塔自身居中对齐」等冗余按钮，侧栏提供专用的「座圈中心 Turret Ring Centers」输入框面板。
- **多部位命中选择（炮塔优先）**：`raycastTank` 对 hull/turret 分别返回最近命中后，由 `bestHitForPref`（`tank_geometry.js:134`，P-01 起取代 `bestTankHit`——后者仅保留供测试做 parity 对照）在本步长区间内做唯一结算——**炮塔命中恒优先于车体**（炮塔是车体上层构件），非炮塔命中取最近处；`pref='hull'` 时强制取车体命中（P-01 鼠标径向意图）。修复"从正/后方射击只能命中车体"的问题（`ARCHIVE.md` #2）。
- **模块分区（旧数据回退路径，部件级）**：车体侧面命中**恒先被自动履带区截获**（`|relX|/halfL > 0.78` → 履带/负重轮，§2.9；任何坦克、无论是否挂载模块）；其后 `moduleFromHit` 对 `tank.modules` 为 null/空 的旧条目，以及**该部件（hull/turret）无任何模块放置**的部件，走本分区（`ARCHIVE.md` #3）——炮塔侧面按命中点局部 x 分 炮手/装填手/炮塔尾舱弹药架（后段 -0.62 倍半长内=弹药架，`RULES.modules.zones.turretAmmo`）；车体侧面（履带区外）分 驾驶员/弹药架/发动机。**该部件存在放置** → 走 2.9 的装甲边段挂载判定（hull 有放置而 turret 无放置时，turret 命中仍走本分区退化）。
- **三扩系数 + 缩圈速度（坦克级可配）**：`base.spreadMult`（移动/转车体/转炮塔三源散布统一倍率，缺省 1）与 `base.aimSpeed`（sigma 收缩速率，缺省取 `RULES.spread.shrinkRate`）；设计器『战斗参数』、`tank_compare.html`、`tanks/<id>.json` 均已接入（`ARCHIVE.md` #5）。
- **炮塔阴影方向固定（世界方向）**：`paintTurretShadow` 用车体朝向投影阴影偏移，炮塔自转不再改变光影方向（`ARCHIVE.md` #7）。
- **开火/命中/殉爆打击特效体系（戏剧化手感与视觉增强）**：
  - **开火出膛与制退器排焰**：出膛锥形炮口闪光（`spawnMuzzleFlash`）支持 8 种制退器样式（`none`/`single`/`double`/`multi`/`slug`/`pepperpot`/`heavy_square`/`cylinder` 向前、左右、斜后或多向星芒火舌排焰），并生成炮口出膛冲击波气浪环（`spawnShockwave`）与侧向高速排气火花粒子。
  - **飞行高亮彗星拖尾**：细长尖头弹体沿飞行方向绘制（`drawShells`），结合弹种专属颜色（`ammo.color`/`ammo.tail`）的高亮渐变彗星拖尾与弹头高光亮点。
  - **分级命中反馈与定向破片（四态）**：`spawnImpactFx` 根据命中四态生成差异化冲击光、火花与物理破片：
    - **击穿 (`pen`)**：橙红冲击环 + 沿入射方向前突扩散的炽热金属破片与反向回溅碎屑、烟尘及地面弹坑焦痕。
    - **跳弹 (`bounce`)**：锐利高亮电光蓝白冲击波 + 沿反弹方向集中喷射的高速锥形火针束与扩散火花。
    - **未击穿 (`block`)**：钝感灰白/亮橙跳屑 + 黑色碎渣弹跳 + 灰烟与小焦痕。
    - **高爆爆轰 (`he`)**：大范围烈焰冲击波 + 环形烈焰破片群 + 飞溅烟尘碎屑与大面积地面灼痕。
  - **多阶段殉爆与炮塔掀飞残骸（飞头）**：`spawnAmmoBlowFx` 与 `burstExplosion` 触发多阶剧烈扩张火球、双重巨型冲击波环（内层高亮白黄、外层橙红）、四散炽热重破片与地面持久大焦痕；炮塔被掀飞（`turretFlights`）沿抛物线翻滚升空并自旋坠地，全程伴随烟雾尾迹。
  - **起火持续喷射与履带断裂**：起火坦克（`emitTankFire`）从发动机舱持续翻滚喷射火焰、浓烟与火花；履带断裂（`spawnTrackBreakFx`）产生局部爆破与机械飞溅破片。
  - **屏幕震屏与打击张力**：系统级根据开火后坐、击中冲击、重创与致命殉爆施加分级震屏反馈，大幅增强战场沉浸感与厚重打击感。
- **炮口尖端（`gunTip`）发射原点绑定**：开火、弹道烟迹、飞行炮弹、瞄准射线及实时散布锥在 MVP 中均正确对齐至炮管最前端的**炮口位置**（`gunTip(t)`），消除了原有特效与炮弹在炮管结合部/炮塔原点（`gunRoot`）产生的错位。
- **实时散布锥去重与净化**：去除了 MVP 中最坏情况（`worstCase`）散布虚线常驻绘制，现在只显示灵动收缩、紧凑灵敏的实时散布锥，战斗界面和视觉大为净化。
- **自定义炮塔本地旋转轴**：在设计器 `tank_designer.html` 侧边栏新增了 `turret.axis` dx/dy 自定义数字输入控件，打通了与坦克条目间 round-trip 的无损存取，使设计师可以彻底、精确地微调座圈圆心与炮塔自转中心的关系（避免甩尾）。
- **逻辑模块可视化覆盖层**：设计器「显示内部模块 Zones」Toggle 复选框——开启后（模块模式下恒显示）在画布上渲染**每个模块放置的带**（半透明具名色带 + 名称标签；选中放置高亮描边并显示 3 手柄：两端 len + 中部 off；镜像开启时镜像侧带同步渲染），另以橄榄色带**恒渲染车体极前/极后端的自动履带区**（标注「履带」，不可编辑）。旧数据（无放置）不渲染任何带；`RULES.modules.zones` 的 OBB 色带仅作旧数据的判定回退，不再由本复选框描绘。
- **血条左侧车型徽章**：重坦=六边形、中坦=五边形（WoT 式），与血条同水平、不遮挡坦克本体。
- **坦克设计器 ⇄ `tanks/`**：设计器打开即拉取 `tanks/` 列表（`api/tanks`）填充下拉；支持**新增坦克**（默认形状+唯一 id）、**修改**（载入→编辑→保存覆盖同 id）、**删除**（确认后从列表移除）；保存/删除均写回 `tanks/<id>.json`（`js/tank_listio.js`）。坦克名称/ID 由顶部工具栏的「名称」输入框统一管理（新坦克即时出现在顶部下拉并选中），右侧面板不再单独显示坦克名。
- **设计器编辑列表（2026-08-12，列表驱动面板显隐）**：右栏「编辑模式」改造为**编辑列表**，条目 = 车体 / 炮塔 / 模块 / 外观件（炮管预设含制退器/抽烟器/护套/炮管样式 + 炮盾 + 履带外观）；`editTab` 驱动 `updatePanelVisibility()` 按 `panel-<tab>` 类显隐面板，列表选中 ↔ 画布编辑模式状态同步（`setMode` 同步 `editTab`，外观件条目 → 画布进入 preview）；「预览瞄准」保留为独立小切换按钮。面板归属：左栏基础/战斗参数常显，装甲厚度/装甲分段**按部件拆分**为 `panel-hull`/`panel-turret` 两组随条目显隐；右栏座圈中心+炮塔多边形预设+选中顶点 → 炮塔，模块面板 → 模块，炮管预设+炮盾+履带外观 → 外观件。配套：撤销/清空按钮仅车体/炮塔条目可用（消除「炮塔条目 + preview 时撤销误删车体顶点」隐患，目标取 `editTab` 而非 `mode`）。**模块编辑增强**：车体/炮塔**可见性切换按钮**（互斥、至少保留一个可见；隐藏部件不渲染、不参与边/带/悬停命中，不入 JSON——编辑炮塔模块时可隐藏车体防误选）；`RULES.modules.lenMin` 0.15 → **0.05**（设计器钳制与 `normalizeTankModules` 兜底同步；`moduleLenInput` min 改 5）。对称轴两侧（y>0）边的挂载/选中/手柄经 Node 复现验证可用（无 v2 残留钳制，已补 8 项回归测试）。
- **设计器布局（双栏重构，2026-08-12）**：`tank_designer.html` 页面骨架为 `#app` 三列网格 `20vw 1fr 380px` —— 左侧 `#left-sidebar` **数据/参数面板**（约窗口宽度 1/5：基础/战斗参数、装甲厚度、装甲分段）+ 中间 `#stage-wrap` **模型画布区** + 右侧 `#right-sidebar` **绘图/外观面板**（视图缩放、编辑模式、座圈中心、炮塔多边形预设、炮管预设、炮盾、履带外观、选中顶点），两栏各自独立滚动。**三列用显式 `grid-column:1/2/3` 定位**（不依赖 DOM 顺序，防止自动排布把面板放错列）；缩放范围 ZOOM_MIN~ZOOM_MAX（30%~800%），**打开默认缩放 500%**（`viewScale=5`，滚轮/±按钮可继续放大至 800%，「重置视图」回到 100%）。「座圈中心」置于「编辑模式」之下。
- **多边形坦克形状**：车体为箭镞形（前缘中间顶点前突，两侧斜边归正面装甲），炮塔为豹2A6式六边形楔形（前窄后宽，正面颊板+斜边归正面装甲）。几何由 `hullPoly`/`turretPoly` 定义本地顶点+逐边 faceKey，`polyCorners` 旋转到世界坐标，`polyEdges` 通过质心法算外法线。旧矩形 `partCorners`/`partEdges` 仍保留用于坦克矩形碰撞盒与**无 `verts` 掩体**的矩形回退渲染和路径检测（掩体带 `verts` 时走 `coverCorners` 多边形，见 2.7）。
- 水平散布（高斯分布），瞄准线/开火射线正确绑定在炮口（`gunRoot`，随炮塔转动）
- **扩圈/缩圈系统（WoT 三扩模型）**：玩家坦克维护一个实时 sigma 值，受移动速度、车体转速、炮塔转速、乘员受伤（fireDebuff）四源驱动。运动时 sigma 快速膨胀（`bloomRate`），停止后缓慢收缩回 base（`shrinkRate`）。HUD 以一条虚线锥可视化：实时锥（当前 sigma）——最坏情况锥已移除（见上文「实时散布锥去重与净化」）。参数集中在 `RULES.spread` 配置对象中；三源运动散布共用一个坦克级倍率 `spreadMult`、收缩速率可用 `aimSpeed` 覆盖（设计器/compare 可调），全局默认节奏由 `shrinkRate` 控制。四源全部生效（回归测试 `test-tankcollision.js`：传 keys 时 sigma = base+moveMax，不传时 = base）。
- **掩体弹道路径判定**：每发炮弹在散布范围内生成实际弹道射线，掩体判定基于该射线路径（`coverRollOnShellRay`）。全高掩体 100% 确定格挡，半高掩体按概率掷骰。实时预测面板仍用瞄准线显示参考格挡率。
- **入射角 + 等效厚度 三态判定：跳弹 / 未击穿 / 击穿** —— **跳弹现为真正的反弹**：入射角超过 70° 时，炮弹沿命中边外法线的反射方向继续飞行，仍可能二次命中并造成伤害，但**不允许二次跳弹**（反弹弹二次命中一律按未击穿/击穿判定，不再跳弹）。原型对每次开火弹道拆分为多段弹道，对跳弹的反射段绘制一束沿反射线射出的专属扩散环视觉（`resolveHit` + `bounceFx`）。
- **坦克选择（测试不同坦克）**：`tank_mvp.html` 的 HUD 新增「坦克选择」下拉框 +「应用到玩家」/「重新加载列表」，从 `tanks/` 列表（`api/tanks`）载入任意条目并整体替换玩家配置（几何/装甲/机动/无炮塔模式），便于横向对比不同坦克。支持首次加载根据列表中优先存在的合法配置（例如优先 `'Obj 780'` 或列表中首项）自动为玩家应用配置，保证首屏即生效。
- 模块伤害：履带（锁定移动）/ 弹药架（×2 伤害，未杀 → 装填降低 8s，击杀 → 殉爆掀飞炮塔）/ 发动机（×1.2 伤害 + 起火 DOT：每秒攻击方标准伤害的 10%，持续 5s，倍率/时长可随升级增强）/ 乘员（炮手/装填手/驾驶员/车长对应 debuff，8s）。**伤害取整（2026-08-13 定型）**：`applyModuleDamage` 在随机浮动（×0.85~1.15）与模块倍率全部乘完后 `Math.round` 取整为整数再扣血，日志文本直接用同一整数（不用 `toFixed`），保证"显示伤害 == 实际扣血"；HUD 血条数字因 DOT 逐帧扣血会残留小数 HP，显示改用 `Math.ceil`（取上整，显示值 ≥ 实际值；整数直击下恒无小数残留）。消除"显示 100 伤害却杀不死 100HP 目标"的浮点不一致。
- 车高等级（重坦/中坦）切换，用于掩体遮挡与 driveBy 通行门控
- 掩体系统：半高**垂直剖面模型**（弹道实时判定，见 2.5）+ **C 实验越掩插值**（2026-08-14：射线在炮口与目标部位中心间线性插值，贴掩体时射线高于掩体顶 → 越掩 exposure 1.0，拉开后恢复遮挡，见 2.5 第 7 条）+ 全高确定性截停 + 方向判据（骑上/压入掩体不遮蔽，见 2.5）；`distanceTier` 三档渐变与 `coverDefenseBase`/`attackerAmplitudeFactor` 死代码已移除
- **地图元素体系（A1~A3，见 2.7）**：树 / 灌木 / 栅栏 / 沙袋路障 + 倒树/碎石残骸（树桩为死配置保留，仅地图作者手动放置）。运行状态（耐久/残骸化）挂在 `covers` 实例上，`findCoversOnPath`/`getCoverUnderTank`/`getExposure` 均跳过已毁元素；炮弹穿透软掩体、沙袋挡 1 发（>70° 跳弹不触发）、**树干 1 发伐倒 → 倒树（横躺树干+树冠，树冠遮挡视线、不挡弹不挡路、不可再毁）**；坦克压过 crushable 元素即摧毁（`destroyCover` + 破坏粒子，残骸尺寸支持 tier 级 `residueW/residueH` 覆盖）；**掩体支持任意复杂多边形与凹多边形多凸包物理判定**（`covers` 实例带 `verts`/`collisionVerts` + `coverCollisionParts`/`coverCorners` 统一入口，mvp 内置 L 形凹多边形全高掩体与六边形半高掩体 2 个验证实例，确保坦克在凹口中视觉空旷区域不被假阻挡）；灌木/树冠绘制在坦克之上实现视线遮挡，`vision` 字段为未来 AI 索敌预留；HE 溅射（半径 24px）破障。预测面板逐掩体标注「可击毁」与 穿透/全挡/部分遮挡 分类（取代原先 NaN% 的占比显示）。
- 实时弹道预测面板：不开火即可看到当前瞄准点的入射角/等效厚度/掩体综合格挡率，帮助验证数值是否符合预期
- **`entities` 注册表**：`player`/`dummy` 不再是硬编码全局变量，改为统一实体数组（`id`/`team`/`spawn`快照）。新增 `isHostile(teamA,teamB)` 敌对判断、`nearestEnemyTo(shooter)` 目标搜索、`resetEntity()` 通用重置——开火/瞄准/重置/绘制现在都走这套通用查找，不再写死引用某个变量，为后续多敌人/友军/伴随机器人打好地基。测试靶的手动驾驶控制和 HUD 血条槽位暂时保持特化（本来就是测试台专属功能，非通用系统）。
- **测试靶控制台**（HUD 内）：满血值可调（1~99999）、无敌开关（开/关 INVULN）、自动复活开关（1.5s 满血复活）。无敌状态锁血但不影响击穿/跳弹判定显示；自动复活确保靶车始终可被瞄准。
- **装甲测试台 UI 重构（2026-08-14）**：`tank_mvp.html` `#app` 网格改为 `300px 1fr 340px` —— 左栏 `#leftPane`（发射解算面板 + 日志叠加）由原先绝对定位浮于画布之上改为**静态左列**，画布居中，右栏 `#hud`。弹种切换保留数字键（1/2/3），移除右栏「弹种 Ammo Type」下拉 + 图例，新增 `#ammoIndicator`（色点 + 标签）置于底部装填进度条 `#reloadWrap` 旁（`renderAmmoIndicator()` 读 `RULES.ammoTypes[player.ammoKey]`）。**散布恒开**（移除 `spreadOn` 开关）。移除右栏「架构扩展」（护盾/无人机）与「靶场」（`rangeBtn`/`spreadBtn`/`rangeOn`/`rangeShots`/`addRangeShot`/`renderRangeStats`/`drawRange`）区块及其 JS；靶场测散布功能随重构移除，散布验证改为直接观察实时散布锥/命中。

#### 3.6 工程基建与代码去重（2026-08-13 会话）
- **共享几何收口**：`rotate`/`distToSegment`/`partCorners`/`partEdges`/`reflectDir` 全部收敛到 `js/tank_utils.js`（单一实现）；`tank_geometry.js`、`tank_physics.js`、`tank_halfgeom.js`、`tank_designer.html` 内联脚本删除重复声明、改用 utils 全局。`tank_cover.js` 的 `distanceTier` 不再本地定义（已随 A1 双档模型移除）。
- **炮管规格单一数据源**：`normalizeBarrel` 只在 `js/tank_halfgeom.js` 定义一次，`tank_model.js`/设计器均复用；设计器不再内联第三方副本。
- **默认装甲基数收口**：`js/tank_rules.js` 提供 `RULES.defaultArmor`（110/38/26、140/50/24 单一来源），`tank_geometry.js`/`tank_model.js`/`tank_halfgeom.js` 的散落常量改读该处。
- **OBB 辅助函数复用**：`tank_cover.js` 的 `obbOverlap`/`obbMTV` 内部投影辅助提炼为模块顶层共享函数（消除两套私有 `getAxes`/`project`）。
- **Web 页面加载顺序**：三个页面统一加载同一组共享模块，顺序统一为 `rules → utils → geometry → halfgeom → model` 等。
- **`scripts/check-html.js` 扩展**：冒烟检查从固定 3 个文件扩展为遍历整个 `js/` 目录全部 JS + `server.js` + 三个原型的每个内联 `<script>`；并新增顶层重复函数声明检测（防止再次引入重复定义）。
- **`package.json` 测试脚本**：`npm test` → 串联 **9 个测试套件全部通过**：`scripts/test-covers.js`（掩体/地图元素行为）、`test-tanks.js`（tanks/ 条目结构与几何 round-trip）、`test-hitpart.js`（命中部位意图）、`test-tankcollision.js`（坦克碰撞稳定性）、`test-nodegen.js`（节点地图元素生成器），以及 **4 个极端测试套件** `test-extreme-combat.js` / `test-extreme-geometry.js` / `test-extreme-model.js` / `test-extreme-cover.js`（覆盖战斗/物理、多边形几何、模型/属性、掩体系统的**极端但合法输入**，见下条）。
- **极端输入测试里程碑（2026-08-14）**：新增 4 个「极端但合法」（extreme-but-valid）测试套件，共 **221 条断言**（`test-extreme-combat.js` 66 / `test-extreme-geometry.js` 84 / `test-extreme-model.js` 52 / `test-extreme-cover.js` 19），全部注册进 `npm test`（排在 `test-nodegen.js` 之后）与 `scripts/check-html.js` 的 scriptFile 冒烟数组；`npm run check`（语法 + typecheck）与 `npm test` 均退出码 0、9 个测试套件全绿：
  - `test-extreme-combat.js`（战斗/物理，66 断言）：`resolveHit`/`impactGeometry`/`applyModuleDamage` 极端但合法用例——近 0° 与近 70° 入射角、极端装甲厚度（1/1000/1e6）、极端穿深（0/1e9/NaN 健壮性）、极端伤害（1e9 击杀、0/0.001 无操作）、模块极端（履带锁定、发动机起火 DOT、弹药架殉爆）、无敌、极端 maxHp（1e6/1）、双重跳弹语义（`reflectDir` 反射对合；二次跳弹护栏在调用方侧 `canBounce`）。
  - `test-extreme-geometry.js`（多边形/半形几何，84 断言）：`hullPoly`/`turretPoly`/halfgeom 极端——微小但合法车体（200×0.5、2×1）、巨大坐标（±1e6）、极端长宽比（4000×4）、100 顶点半形、×1e6/×1e-3 尺度下的 `halfFromFull` 往返、近共线顶点、`normalizeBarrel` 极端（len 1e6/0.01/0/负、evac 新旧两种）、微小/巨大坦克的 `raycastTank`、`findModuleBands` len=1/lenMin。
  - `test-extreme-model.js`（模型/属性，52 断言）：`computeStats`/`makeTank`/`applyTankConfig` 极端——base 1e6/1e9、零值/0.001、accel 极端、修饰器 add +1e9 / mult ×0 / ×-0.5 / 叠加顺序、装甲修饰器 1e6、过期定时修饰器剪除、极薄车体（10×1px）、turret axis 1e5、barrel len 1e6、`motionSigma`/`updateSigma` 极端（dt 0/1e6、turnRate 1e-6、spreadMult 0/1e6）、全部 5 个 debuff 辅助函数、tankKmh 0/1e6、moduleMult 极端。
  - `test-extreme-cover.js`（掩体系统，19 断言）：`test-covers.js` §12~30 之外的极端掩体用例——shooter 参数惰性、零长度曝光段、深穿透 obbMTV（精确 2502 深度）、远处坦克无操作碰撞、路径端点恰在边/角、巨大坦克（hullLen 1e6）`getCoverUnderTank`、splash 半径 1e6、多边形中心 `coverNormalAt`、手动扩展数组后 `resetCovers`。
  - **约束**：显式排除 0 宽/0 长等退化 0 维用例（不合理输入不测）；全部用例均为极端但合法的输入。
- **`computeStats` / `applyTankConfig` 优化**：装甲深拷贝改用 `structuredClone`（替代 `JSON` 序列化）；`applyTankConfig` 表驱动化（配置数组统一拷贝，消除连续 `if (spec.X !== undefined)` 样板）。
- **`server.js` 健壮性**：`POST /api/tank_list` 增加 2MB body 上限与 `try...catch` 写入保护，非法/超大请求安全拒绝，不再 5xx 崩溃。
- **坦克数据拆分 `tanks/` 一型一文件（P-02#2 / P-03）**：删除聚合的 `tank_list.json` 与旧 `POST /api/tank_list`；`server.js` 提供 `GET /api/tanks`（遍历 `tanks/*.json`，文件名排序确定性聚合）、`POST /api/tanks/<id>`（临时文件+改名原子写）、`DELETE /api/tanks/<id>`；三个原型统一走 `js/tank_listio.js`（含无服务器时下载 `tanks/<id>.json` 的 fallback）。旧聚合文件由 `scripts/split-tank-list.js` 拆出（保留作维护工具）。
- **配置表下沉（P-02#4）**：`BARREL_PRESETS`/`MANTLE_PRESETS` → `js/tank_presets.js`；`FIELD_ROWS`/`MUZZLES`/`EVAC` → `js/tank_schema.js`（designer/compare 共用单一来源）。
- **坦克运动统一（P-02#6）**：新 `js/tank_move.js` 提供 `driveTank(t, dt, {turn, move})`，合并 `tank_mvp.html` 原来 player/dummy 两条完全平行的驾驶块（转向/加减速/掩体 `move` 通行系数/起火 `fireMul` 与 debuff 乘数/掩体碰撞推出/履带相位推进）；靶车转向速率改为统一走 `t.stats.turnRate`。未来敌方/友军 AI 只出 `{turn, move}` 即可驾驶。**履带相位**：`driveTank` 按 `advanceTracks(t, t.x-p0x, t.y-p0y, t.hullAngle-p0a)`（位移与转角差）累积相位，履带滚动动画与真实行驶/转向同步（回归测试 `test-tankcollision.js`）。
- **数据去重（P-02#5）**：模块中文标签 `MODULE_LABELS`/`moduleLabel` 集中到 `js/tank_model.js` 并导出（mvp HUD 删除本地副本，标签统一为"发动机"）；designer『显示内部模块 zones』改读 `RULES.modules.zones`（删除内联同值常量）。
- **战斗场景绘制层下沉（P-02#7，P-02 完结）**：新 `js/tank_battledraw.js` 收编 `tank_mvp.html` 战斗绘制（`drawTank`/`drawBrokenTracks`/`drawCharredHull`/`drawFireGlow`/`drawShells(ctx, shells)`/`drawCover`/`drawFoliage(ctx, covers)`/`drawClassBadge` 及薄封装 `shade`/`drawTracks`/`renderHullTexture`/`renderTurretTexture`，~600 行），全部显式传 `ctx`（`tank_fx.js` 先例，无 DOM 依赖）；原测试台靶场块（`drawRange`/`addRangeShot`/`RANGE_*`）已随 2026-08-14 装甲测试台 UI 重构移除（见 §3）；mvp 加载顺序插在 `tank_paint.js` 之后。`types/globals.d.ts` 已同步补齐相关函数声明（`turretPivot` 返回 `{x,y}`、`polyCorners`/`turretFrontDist` 与 8 个 draw 函数）。
- **节点地图元素生成器（P-05 完结，2026-08-13）**：新增 `js/tank_nodegen.js`（纯逻辑模块）与 `scripts/test-nodegen.js` 单测；`generateNode(difficulty, options)` 实现基于 Mulberry32 种子 RNG 的确定性生成、按难度加权模板选择（5 内置模板）、参数化密度与残骸预置，`tank_mvp.html` HUD 已增加「随机生成战场 GENERATE」测试按钮，`npm test` / `npm run check` 全绿。
- **M0 贴图资产层（P-06 完结，2026-08-15）**：新增 `js/tank_assets.js`（ASSET_DEFS 七档注册表 + Image 加载器 + 离屏烘焙缓存 + drawAsset/drawAssetCanopy，见 §2.10）、`tools/bake.html`（一键导出 PNG）、`assets/` 目录契约、`scripts/test-assets.js`（61 断言挂进 `npm test`）；`js/tank_battledraw.js` 的 soft/barricade/stump/rubble/bush/tree/fallen 分支改走资产层（half/full box 程序化保留）。浏览器冒烟：三个原型加载顺序补 `tank_assets.js`（在 `tank_battledraw.js` 之前），HTTP 200。
- **M1 声音占位系统（P-07 完结，2026-08-15）**：新增 `js/tank_audio.js`（SOUND_DEFS 八键参数表 + AUDIO_SETTINGS 音量分级 + 惰性 AudioContext + playSound 单入口 + validateSoundDefs，见 §2.11）、`scripts/test-audio.js`（51 断言挂进 `npm test`）；`tank_mvp.html` 挂接 18 处战斗/UI 事件（开火/命中四态/掩体拦截/殉爆/履带断/起火上升沿/UI 交互）+ pointerdown/keydown 首次交互解锁。
- **命中部位意图选择（P-01，已完结）**：开火瞬间沿无散布瞄准线把鼠标投影到目标命中距离上，`投影值 > 目标距 + partProbe(12px)` 判定意图打**炮塔**（上部），`< 目标距 - partProbe` 判定打**车体**，死区内 `'auto'` 默认炮塔优先；预测面板同源显示“本次将命中部位”（`aimPartPreference`/`bestHitForPref`，`js/tank_geometry.js:121/134`）。半高掩体按垂直剖面单一判定（2026-08-10 起）：被挡即拦截，**不再回退改打另一部位**（见 2.5，取代 P-01 原“首选部位全遮蔽才回退”决策）。已用 `scripts/test-hitpart.js` 覆盖投影边界、偏好取舍及窗口。**`partProbe=12` 于 2026-08-11 手感标定完成**：死区大小体感合适（偏离鼠标方向即可可靠分出炮塔/车体，又不至于晃动误判），保持可调。**实弹直击部位选判（2026-08-13）**：实弹直击路径与预测面板/半高掩体判决统一走「整条射线」口径——新增 `shellPartHit(hits, step, pref)`（`js/tank_geometry.js`，P-01 同源）：先探测相触帧（任一部位进入步长窗口），再对明确意图 `turret`/`hull` 沿整条射线选部位；**`'auto'`（死区）保持逐帧窗口语义**（已定型决策：死区正对仍可能命中车体，面板死区显示炮塔的差异为已知行为，不修正）。`tank_mvp.html:754` 直击路径用 `shellPartHit`；`test-hitpart.js` 含窗口回归用例。
- **git index stat 重新归一化（#21 修复，2026-08-14）**：工作区文件在 LF 状态时写入 index（stat 缓存记录 LF 大小），后整体被转为 CRLF（Windows 编辑器/autocrlf 检出）→ `git status` 按 stat 差异误报 ~50 个未修改文件为 modified（`git diff` 为空、归一化后内容与 index 一致）。已执行 `git add --renormalize .` + `git restore --staged .` 刷新 index stat，仅剩真实改动；`.gitattributes` 注释重写为 UTF-8。仓库约定：文本文件统一 LF 入库（`.gitattributes` `* text=auto`），Windows 检出 CRLF；改动文本文件后如 `git status` 误报，按上述命令刷新。
- **#18/#19/#20 修复（2026-08-14）**（三问题均修复并经 `npm run check` + `npm test` 全量验证通过）：
  - **#18 贴脸炮口入体命中后部模块**（核心修复：`js/tank_geometry.js` `raycastTank`）：每边求交时新增「进入边恢复」——`t ≤ 0.001` 且 `d·n < 0`（射线沿外法线反向进入多边形）的交点为进入边候选，取 `|t|` 最小者；体内判定 = 进入边存在 且 出射边（`d·n>0` 最小交点）在 0.001 前方；命中面取进入边（法线/faceKey 同步），`t` 归零、位置取进入点（炮管贯穿装甲真实交点）、带 `inside:true` 标记，出射边不再作为候选。`bestTankHit`/`bestHitForPref`/`shellPartHit` 窗口过滤改为 `(h.t > minT || h.inside)`；`tank_mvp.html` 炮弹逐帧落点改用命中对象自带 `hitT.x/y`（命中特效/跳弹点落在装甲表面）。一处修复惠及实弹逐帧、预测面板（`updateSolution`）、垂直剖面、开火意图四路同源路径；正面贴脸不再命中「后部·弹药架」，等效厚度按正面箭镞斜边结算（26.6° 入射 ≈ 123mm）。新增 15 条回归断言于 `scripts/test-hitpart.js`（体内发射/模块归属/同源/跳弹贴面外飞/身后不误判）。修复方向②③④未实施：②（出生点回退）被①完全覆盖（体内出生首帧按进入边结算）、③（开火门控）是 UX 变更、④（碰撞凸包）超出弹道修复范围——碰撞盒仍为车体矩形包围盒，紧贴时车体视觉重叠 ≈19px 残留，是否立项见 §6 条目 13（可选）。
  - **#19 设计器接缝边无法插入顶点**（`tank_designer.html`，`js/tank_halfgeom.js` 未改）：新增 `findSeamHitAtScreen(part, sx, sy)`——用 `mirrorPt`/`onCenterline` 构造接缝线段（前=mirror(v0)↔v0、后=v(n-1)↔mirror(v(n-1))），`distToSegment ≤ EDGE_HIT_R` 命中，返回 `{seam:'front'|'rear', nearMid}`。mouseup `drag.isNew` 分支：接缝命中先于 y≤0 检查；前接缝 → `half.splice(0,0,newPt)` + `halfFaces.splice(0,0,frontSeamFace)`；后接缝 → `half.push` + `halfFaces.push(rearSeamFace)`；新顶点 y 取镜像 `-|ly|`；接缝中点 → `nextFace` 循环切换装甲面。空白追加路径补 `halfFaces.push('side')`（修复长度错位）；`renderEdgeListFor` 面板顺序改为「接缝(前) → 内部边（链序）→ 接缝(后)」，只调显示顺序不改链。Playwright 真实浏览器验证：默认车体后接缝/默认炮塔前接缝/Obj 780 前板（原 ISSUE 场景）均正确插入并继承装甲面；`halfFaces.length = half.length-1` 不变量恒成立；删除/索引映射不破。
  - **#20 殉爆特效过大**（`js/tank_fx.js` `spawnAmmoBlowFx` 参数）：scale 3.2→2.0（火球最大 r 161→106px）、shockwave 140→95 / 85→60、焦痕 42→30、火花 24→18 且速度 160–420→120–320；`burstExplosion` 内部派生量（内层冲击波 128→80、内层焦痕 51→32、火焰散布 512→320px）随 scale 自动缩小；其他爆炸路径（`spawnTrackBreakFx`/`spawnImpactFx`/`spawnMuzzleFlash`/掩体 `burstExplosion`）零接触。

#### 3.7 节点地图流程（P-08，2026-08-15 会话；设计见 §2.12）
- **摄像机巡航**：run 模式战斗态相机跟随玩家（指数阻尼 + 世界边界钳制），节点世界为模板 ×3（约 1:9 摄像机比例）；全部世界绘制套摄像机变换，网格只画视口内线段；测试台模式（未开局）恒等视口、旧行为零变化。
- **视口 AABB 剔除**：`aabbInView`（余量 64px）过滤 covers/树冠层/shells；实体按 hull 尺寸剔除。
- **小地图**：右上角覆盖层（170×120），世界边界/掩体点/玩家绿·敌军红·友军蓝/摄像机视口矩形。
- **单局流程**：右侧 HUD「单局流程」区常驻「开始一局 NEW RUN」按钮 → 生成节点链并进入节点 1（节点图覆盖层也可在通关后重新开局）→ 战斗（玩家居中巡航，清敌判定）→ 结算（§4.5 评分：基础+无伤/速通/据点加成）→ 卡牌三选一（P-09 起接真实卡池 `cards/`，`applyCardEffects` 生效）→ 下一节点 → 全链通关回到节点图；玩家阵亡 → KIA 覆盖层 → 重开新局。测试台（未开局）不受影响。
- **战斗判定**：玩家承伤逐帧累计；敌全灭 → settlement；玩家阵亡 → gameover（M8 复活前的永久死亡占位）。敌军为静态靶标（`nodeSpawn` 标记，M7 接 AI）；据点 `team:'ally'` 为加分标记（炮弹穿透，M7 起为战斗单位）。
- **验证**：`scripts/test-camera.js`（22 断言）/ `test-map.js` / `test-flow.js` 挂进 `npm test`（共 14 套全绿）；vm 运行时冒烟覆盖「开局→战斗→清敌→结算→卡牌→下一节点→阵亡→重开」全流程（临时脚本，未入库）。

#### 3.8 卡牌/Boss 数据驱动框架（P-09 阶段 A，2026-08-15 会话；设计见 §2.13/§2.14）
- **卡牌真实化**：节点间三选一从占位改为真实卡池——`cards/` 11 张示例卡经 `/api/cards` 聚合 → `drawCardChoices` 抽 3 → `applyCardEffects`（modifier 走 `addModifier` 立即改 stats，其余挂 `tank.cardEffects` 供对应里程碑消费）。
- **Boss 框架**：`bosses/` 1 个示例 Boss（要塞炮台，3 阶段 + 弱点 + 掉落）；阶段判定纯逻辑 `bossStageFor`/`bossStageIndex`。
- **内容工具**：`scripts/validate-content.js`（schema 守门，挂 `npm test`）+ `scripts/audit-content.js`（分布/数值审计）+ `tools/content_designer.html`（卡牌+Boss 统一编辑器，effects/stages 表格化编辑、保存写回 JSON）。
- **子 agent**：新增 `@card-author`（卡牌作者）/ `@boss-author`（Boss 作者）/ `@balance-auditor`（平衡审计）三角色（`.opencode/agents/`）。
- **验证**：`scripts/test-cards.js` / `test-boss.js` / `validate-content.js` 挂进 `npm test`（现共 17 套全绿）；`/api/cards`/`/api/bosses` 端点 HTTP 200；vm 运行时冒烟覆盖「开局→清敌→结算→真实抽卡→选卡→stats 生效→下一节点」（临时脚本，未入库）。

#### 3.9 内容批量 + Boss 运行时接入（P-09 阶段 B，2026-08-15 会话；设计见 §2.13/§2.14）
- **卡牌批量 111 张**：5 个 `@card-author` 子 agent 并行产出（重甲/狙击/机动/爆破/支援 各 20 张 + 既有 11 张），稀有度实测 49.5/30.6/14.4/5.4%（期望 50/30/15/5），流派各 21~23 张；`validate-content.js` + `audit-content.js --strict` 全绿。
- **Boss 批量 5 种**：`@boss-author` 产出 5 Boss（要塞炮台/双体履带/幽灵狙击手/移动堡垒/装甲指挥官，各 3 阶段 + 弱点 + 掉落，打法彼此区分）；删除阶段 A 的旧示例 `siege_fort`（被 `boss_siege_fort` 取代，且旧文件的 +80/−80 抵消写法不兼容"阶段 modifiers=相对 base 完整画像"的运行时语义）。
- **Boss 运行时接入**：`assignBossNode`（链尾随机指定 Boss、清空普通敌军）→ `enterBattle` 用 `makeBossEntity` spawn Boss（满血+首阶段 modifiers）→ 战斗态 `updateBossStage` 跨血阈值切阶段（`applyBossStage` 移除旧阶段 modifiers 再叠加新阶段）→ 击杀结算 `bossLoot`（score + 卡牌稀有度，结算面板显示「Boss 战利品」行）。
- **验证**：`scripts/test-boss.js` 补运行时断言（makeBossEntity 满血/首阶段 modifiers/跨阶段切换/同阶段不重复/末阶段）；vm 运行时冒烟覆盖「开局→推进链尾→Boss 生成→阶段触发→击杀→结算含 Boss 战利品」（临时脚本，未入库）；`npm test` 17 套全绿。

#### 3.10 敌人 AI 双态 + 友军据点（P-10，2026-08-15 会话；设计见 §2.2）
- **视线遮挡查询**：`js/tank_cover.js` 加 `hasLineOfSight`（`vision:true` 灌木/树冠遮挡视线，与弹道穿透两套判定）；`test-covers.js` §31 回归。
- **敌人 AI**：新 `js/tank_ai.js`（纯逻辑 `aiDecide`/`aiDecideEnemy`/`aiDecideAlly`）——双态（摄像机内主动 / 边缘 `RULES.ai.edgeMargin`=200px 靠近 / 远处被动）；输出 `{turn, move, turretDesired, fire}`。
- **开火复用**：`tank_mvp.html` 的 `tryFire` 抽取为通用 `fireTank(shooter, target, hitPref)`，玩家（鼠标意图 hitPref）与 AI（'auto'）共用同一 shell 管线（散布/弹种/掩体判定）。
- **战斗接线**：battle 态逐帧 `aiDecide` → `driveTank`（车体）+ 炮塔转速/射界逼近 + `fireTank`；玩家与测试靶车保持手动控制；Boss 与 `summons` 走同一敌对 AI，阶段行为由 `onEnter.modifiers` 自然产生。
- **友军据点**：`aiDecideAlly` 消极防御（原地不动、只打射程内最近敌人）。
- **验证**：`scripts/test-ai.js`（15 断言：双态/转向/开火/视线/装填/友军消极防御/分发）挂进 `npm test`（现共 18 套全绿）；vm 运行时冒烟覆盖「远处被动/视口内转向开火/友军不移动」（临时脚本，未入库）。

#### 3.11 死亡/复活状态机（P-11，2026-08-15 会话；设计见 §2.3）
- **复活逻辑**：新 `js/tank_revive.js`（纯逻辑 `findReviveSpot`/`pointInAnyCover`/`reviveTank`/`canRevive`/`reviveAt`）——满状态复活（hp=maxHp、清 debuff/起火/履带断/殉爆）+ 友军据点旁随机无障碍点（无据点回退出生点）+ `RULES.revive.invulnSeconds`=3s 无敌。
- **无敌判定**：`applyModuleDamage`（`js/tank_physics.js`）与 DOT 伤害的 invuln 检查扩展为 `target.invuln || target.invulnT>0`（复活无敌 vs 测试靶车无敌共用一条路径）；`update` 逐帧递减 `invulnT`；`draw` 无敌半透明闪烁。
- **死亡判定**：`player._dead` → `canRevive` 则 `reviveAt`（次数 −1 + 满状态复活，日志提示）→ 次数耗尽则 `finishNode(false)` gameover（真 Roguelike 永久死亡）。
- **初始化**：`startNewRun`/`gameoverRestartBtn` 置 `player.revives = RULES.revive.baseRevives`（2）。
- **验证**：`scripts/test-revive.js`（16 断言：复活点/掩体避开/无据点回退/满状态/无敌/清状态/次数消耗/耗尽失败）挂进 `npm test`（现共 19 套全绿）；vm 运行时冒烟覆盖「阵亡→复活→无敌递减→次数耗尽→gameover」（临时脚本，未入库）。

#### 3.12 属性三层接线收尾（P-12，2026-08-15 会话；设计见 §5.1）
- **生命周期分类**：`js/tank_model.js` 的 `addModifier` 加 `scope` 字段（`permanent` 默认 / `run` 单局 / `timed` 限时），`addTimedModifier` 自动 `timed`；新增 `removeModifiersByScope`/`removeRunModifiers`。
- **卡牌/Boss 标 run**：`applyCardEffects`（`js/tank_cards.js`）与 `applyBossStage`（`js/tank_boss.js`）的 modifier 标 `scope:'run'`——run 结束（gameover/全链通关重开）由 `startNewRun`/`gameoverRestartBtn` 调 `removeRunModifiers(player)` 清除，修掉"卡牌 buff 跨 run 残留"的隐患。
- **验证**：`scripts/test-modifiers.js`（11 断言：scope 分类/timed 自动/run 清除/stats 恢复/卡牌与 Boss 标 run/过期剪除）挂进 `npm test`（现共 20 套全绿）。

---

## 4. 开放问题（已知但尚未确定，按优先级排序）

这些不是"以后再说"，是**当前系统已经隐含依赖、但还没有明确答案**的缺口：

1. **敌人是否会主动利用掩体？**
   当前假设：**第一版敌人不主动找掩体**（正常突进/绕行），先把玩家侧的核心手感跑通，再评估要不要给 AI 加"值不值得绕去掩体"的决策层。若长期观察发现"敌人无脑冲车"和"掩体系统的博弈感"割裂严重，需要重新评估优先级。

2. ~~**敌人"贴近摄像机边缘才主动"这一行为的具体触发距离/宽度**~~ **已量化（P-10）**：`RULES.ai.edgeMargin = 200px`（视口 AABB 外扩该宽度内主动靠近，可调）；连同接战/保持/太近/瞄准容差一并收口在 `RULES.ai`（engageRange 520 / closeRange 200 / aimTolerance 0.12 / allyEngageRange 460）。

3. ~~**复活流程细节**~~ **已定案（P-11）**：复活为**瞬间处理**（无过渡镜头/延迟，贴 10 分钟单局目标、不打断节奏）；无敌时长 `RULES.revive.invulnSeconds = 3 秒`（直击/DOT 均不掉血，视觉半透明闪烁）；复活点半径 `RULES.revive.reviveRadius = 150px`。全部收口 `RULES.revive` 可调。

4. **友军据点被摧毁后的后果**：目前只知道它会减少"友军击杀分成"的来源，是否也应该有更明确的战术后果（比如该区域附近的散兵坑群同时失去某种加成）？当前判定为**非阻塞项**，可以先不处理，据点纯粹作为"被动加分来源+复活参考点"存在。

5. **"节点通关"得分如何量化？** (初步设想见 4.5)
   原"击杀+波次存活"两项得分来源，"波次存活"已换成"节点通关"。具体分值、是否有额外的"无伤通关/限时通关"加成，以及节点通关后的得分奖励机制，都需要在后续开发中量化定义。

#### 4.5 节点通关奖励设想 (新)
- **基础奖励**：`100 * (1 + 节点索引 * 0.2)` 分。
- **无伤加成**：若该节点未受伤害，奖励 +50%。
- **速度加成**：在标定时间内完成，奖励 +20%。
- **据点存活**：若该节点有友军据点且未被摧毁，奖励 +20%。

6. **难度曲线的具体参数**：敌人数量、AI 策略复杂度、数值强度这三个难度杠杆，随节点推进具体怎么涨（线性/阶梯/曲线）？哪个节点索引对应哪档强度？需要在做节点生成器时定出具体表格。

7. **坦克类型与编辑器系统** (新增)：
   - **无炮塔坦克 (Fixed-Turret)**：旧格式的 `hasTurret` 属性已移除，改为统一"有旋转炮塔"模型——炮塔转向自由度完全由 `traverseLimit` 控制（180° = 360° 全向旋转；<180° 时炮塔只能在车体中线左右各 ±traverseLimit 内转动）。
   - **附件绑定系统 (Attachment System)**：通过 `anchors` 定义锚点，支持浮游炮、护盾等附件根据锚点实时跟随渲染。
   - **坦克编辑器 (Tank Editor)**：需要独立工具，支持几何形状、装甲厚度、模块位置、火控参数、机动参数的一站式编辑与 JSON 导出。
   - （v0.2~v0.7 的迭代进度叙述已归档至 `ARCHIVE.md`（2026-08-13 归档自 DEVELOPMENT.md §4.7）；当前编辑器功能状态见 §3「设计器编辑列表」「逻辑模块可视化覆盖层」「双座圈圆心」「多边形坦克形状」与 §2.9。）

---

## 5. 技术债 / 架构待办（不阻塞当前验证，但会在规模扩大时变得昂贵）

### 5.1 高优先级（下一步系统性扩展前必须做）
- **属性 base/modifiers/stats 三层结构 (底层接线)**：底层基础结构已实现于 `js/tank_model.js`（含 `computeStats`/`addModifier`/`refreshStats` 等 API），但卡牌、局内技能、局外永久升级的具体修饰器产生源尚未接入，后续工作重在具体升级系统的"接线"而非"底层结构实现"。结构：
  ```
  tank.base       = { penetration, damage, maxSpeed, turnRate, turretTurnRate, ... }
  tank.modifiers  = [{ stat, mode:'add'|'mult', value, source, persistent|expiresAt }]
  tank.stats      = computeStats(base, modifiers)   // 战斗逻辑只读这个，不摸 base
  ```
  需要确定的规则：叠加顺序（先加后乘）、同名修饰器是否可叠加、修饰器生命周期分类（永久/单局/限时）。
  **已收尾（P-12，2026-08-15）**：修饰器带 `scope` 生命周期分类——`permanent`（默认，局外永久升级）/`run`（单局，`removeRunModifiers` 在 run 结束清除）/`timed`（`expiresAt` 到期 `refreshStats` 剪除）；卡牌 modifier（`applyCardEffects`）与 Boss 阶段 modifier（`applyBossStage`）均标 `run`；`addTimedModifier` 自动 `timed`。先加后乘由 `computeStats` 两遍扫描；同名叠层由 `source`（`card:<id>`+`maxStacks` / `boss-stage:<id>`）区分。剩余：局外永久升级（`permanent`）的修饰器**内容**由 M10 经济里程碑落地（管道已就绪）。
- ~~**摄像机 + 节点地图 + 小地图**~~：**已完成（P-08，2026-08-15，见 §2.12）**——摄像机跟随（玩家居中、世界边界钳制）、小地图层（掩体/实体/视口矩形标注）、完整节点生成（线性节点链：掩体布局复用 P-05 + scale、敌军构成、友军据点、§4.5 通关奖励）、视口 AABB 剔除、全局游戏流程状态机（map/battle/settlement/reward/gameover）与 UI 界面层约定（watchFlow 监听 → DOM 覆盖层）全部落地；剩余相关项：粒子池化（可选项）、难度曲线表细化（§6 条目 12）。

### 5.2 中优先级（已实现——多边形碰撞盒）
- ~~**碰撞盒从"写死4边矩形"抽象成"任意多边形+具名装甲面"**~~：**已完成**。`hullPoly`/`turretPoly` 定义本地顶点+逐边 faceKey，`polyCorners`/`polyEdges` 提供世界坐标与外法线（质心法自适应绕行方向），`raycastTank`、`drawTank` 均已切换到多边形系统。矩形 `partCorners`/`partEdges` 保留给坦克矩形碰撞盒与无 `verts` 掩体的回退（掩体带 `verts` 时走 `coverCorners` 多边形，见 2.7）。所有坦克共用同一套多边形定义（箭镞车体+豹2A6炮塔）。

### 5.3 低优先级（纯表现层，随时可加，不影响任何结构）
- ~~履带转动动画（全宽/半宽可见）~~：**已实现**——`paintTracks` 以 `lineDashOffset` 滚动履带纹路，相位由 `advanceTracks` 按真实位移/转向累积（见 §3「坦克运动统一」）。
- 炮管后座动画
- 这两项与其他系统无耦合，可在任意阶段插入，无需提前规划。

### 5.4 尚无实现机制、不能只靠数值层解决的属性
以下属性已被列为"未来应可被卡牌/升级/技能影响"，但目前**功能本身不存在**，需要先实现机制才能接入 5.1 的 modifiers 系统：
- **HE 弹种的范围伤害**：~~未实现（纯倍率）~~ — **部分实现**：HE 破障溅射（半径 24px，只伤害可破坏掩体）已上线（A3，见 2.7）；HE 对**坦克**的范围伤害/碎片吸收仍不存在（设计上"HE 对坦克 = 纯倍率"暂不变）。
- 反弹炮弹（弹反）机制
- ~~瞄准精度随时间收缩（缩圈）机制~~：**已实现**（见第3节扩圈/缩圈系统）。SPREAD 配置 + motionSigma/updateSigma 驱动实时 sigma，可作为 modifiers 目标（如卡牌改变 bloomRate/shrinkRate/base）。
- 穿透多个敌人（当前炮弹命中第一个目标即结束；`resolveHit` 单目标结算）

### 5.5 原型当前数值参考（`tank_mvp.html` 中的硬编码默认值）

| 参数 | 值 | 说明 |
|------|-----|------|
| **坦克尺寸** |||
| hullLen | 64px | 车体全长 |
| hullWid | 38px | 车体全宽 |
| turLen | 34px | 炮塔全长 |
| turWid | 36px | 炮塔全宽（约占车体宽 91%） |
| **装甲厚度 (mm)** |||
| hull front/side/rear | 110 / 38 / 26 | 箭镞斜边算正面 |
| turret front/side/rear | 140 / 50 / 24 | 颊板+斜边算正面 |
| 跳弹角 | 70° | 大于此角度必然跳弹 |
| **战斗参数** |||
| 穿透力 | 120mm | 基础 |
| 单发伤害 | 34 | 基础 |
| 装填时间 | 1.3s | 基础 |
| 最大速度 | 120px/s | 基础 |
| 车体转速 | 2.0 rad/s | 基础 |
| 炮塔转速 | 2.2 rad/s | 基础 |
| **机动换算（`RULES.speed`）** |||
| accelPowerToPxScale | 180 | 马力/吨 → px/s²：`accel = enginePower/weight × 180` |
| brakeFactor | 3.5 | `brake = accel × 3.5`（松键减速再乘 1.8） |
| pxFactor | 1.6 | 推进速度 = maxSpeed × 1.6（px/s） |
| kmhFactor | 0.5 | HUD 显示 km/h = maxSpeed × 0.5 |
| **散布 (SPREAD)** |||
| base | 0.018 | 静止 sigma（越小越准） |
| fireDebuff | 0.020 | 乘员受伤额外 sigma |
| moveMax | 0.014 | 全速移动最大 sigma |
| hullRotMax | 0.012 | 全速转向最大 sigma |
| turretRotMax | 0.018 | 全速转炮最大 sigma |
| bloomRate | 2.0/s | sigma 膨胀速度 |
| shrinkRate | 0.15/s | sigma 收缩速度（坦克级 aimSpeed 可覆盖） |
| spreadMult / aimSpeed | 1 / 0.15 | 坦克级配置：三源统一倍率 / 缩圈速度（`tanks/<id>.json` 可配，缺省 1 / 0.15） |
| worstCase | ~0.082 | 所有源满值叠加的 sigma |
| **模块伤害** |||
| ammoMult（玩家） | 2.0 | 弹药架受伤倍率（可随升级增强） |
| ammoMult（敌方） | 2.0 | 弹药架受伤倍率（固定） |
| crewMult（玩家） | 1.2 | 发动机/乘员倍率（可随升级增强） |
| crewMult（敌方） | 1.2 | 发动机/乘员倍率（固定） |
| debuffSeconds | 8s | 成员/弹药架/发动机 debuff 时长 |
| **起火 DOT（`RULES.fire`）** |||
| dotRatio | 10% | 每秒灼烧 = 攻击方标准伤害 × dotRatio |
| dotSeconds | 5s | 持续时长 |
| dotRatioMult / dotDurationMult | 1.0 | 玩家侧可随升级增强（乘入上面两项） |
| speedMul | ×0.5 | 燃烧时移动速度倍率 |
| **瞄准部位意图（`RULES.aim`）** |||
| partProbe | 12px | 鼠标相对于目标距离偏离的判定死区半径 |
| **坦克⇄坦克碰撞（`resolveTankCollisions` 硬编码）** |||
| MTV 近轴系数 | 1.15 | 最小深度轴 ×1.15 内的候选轴视为"近轴"，进入相对速度决胜 |
| 法向冲量 | ×0.5 | 完全非弹性：闭合相对法向速度每次取其半，一次清零相对闭合 |
| 分离缓冲 | 0.1px | MTV 推出后额外间隙，防精度粘连（不参与速度计算） |
| **地图元素（`RULES.coverTiers` / `RULES.breach`）** |||
| 树耐久 | 1 发 | 一炮伐倒 → 倒树（横躺树干+树冠，树冠遮视线；倒树不挡弹不挡路、不可再毁） |
| 栅栏/沙袋耐久 | 1 | 软掩体被穿透弹毁，沙袋挡 1 发或 >70° 跳弹 |
| 通行系数 | 半高 0.4 / 栅栏 0.45 | 半高不可压毁；栅栏压过即毁 |
| 残骸高度 | 倒树 1.1m / 树桩 0.6m / 碎石 0.5m | 倒树 `mode:'none'` 不参与弹道（高度仅作记录）；树桩/碎石半高概率遮挡（弱于正式半高 1.4m） |
| HE 破障 | 半径 24px / 每目标 1 伤害 | `RULES.breach.heSplashRadius / heCoverDmg` |
| **越掩插值（C 实验 2026-08-14，`RULES.heights`）** |||
| 炮口高度 muzzle | medium 1.8m / heavy 2.2m | 弹道射线起点高度（无下坠）；越掩带宽旋钮——调高越掩更激进 |
| 掩体顶 cover.half | 1.4m | 与中坦车体齐平；射线在掩体入口高于此值 → 越掩 |

### 5.6 后续系统缺口（2026-08-13 规划讨论补充，归属里程碑见 §6）

新系统一律遵循现有工程惯例：「js/ 模块 + Node 测试 + `types/globals.d.ts` 同步」。

- **玩家进度持久化（存档，归属经济里程碑）**：永久升级 + 死亡时局内得分→商店点数转化需要存档（localStorage），需定存档结构、写入时机、版本化。
- ~~**视线遮挡查询函数（归属敌人 AI 里程碑，AI 前实现）**~~ — **已实现（P-10）**：`js/tank_cover.js` `hasLineOfSight(ox,oy,tx,ty)`（`vision:true` 的灌木/树冠遮挡视线，与弹道穿透两套判定），已接入敌人 AI 索敌；Node 回归见 `scripts/test-covers.js` §31。
- ~~**声音系统（独立里程碑 M1，见 2.11）**~~ — **已实现（2026-08-15，P-07 完结）**：`js/tank_audio.js` Web Audio 程序化合成 8 类占位音效（开火/击穿/未击穿/跳弹/殉爆/履带断/起火/UI），后续替换为资产文件；见 §2.11/§3.6。
- **卡牌池/商店商品/永久升级树内容设计（归属经济里程碑）**：modifiers 管道就绪但无内容，纯设计工作。
- **坦克车型多样性（归属坦克纹理化里程碑，见 2.10）**：所有 `tanks/` 条目共用同一箭镞车体+豹2A6炮塔模板，差异只在数值；需要几套定型几何模板 + 多色/迷彩方案（设计器已支持，缺内容资产），与纹理化合并。

---

## 6. 建议的下一步顺序

1. ~~`entities` 重构~~ — 已完成（见第3节）
2. ~~**修复 `ISSUES.md` #14/#15**（2026-08-11 战前审查确认）：`advanceTracks` 参数错位致 trackPhase=NaN / `updateSigma` 未传 keys 致移动散布源失效；均为单点修复，修后补 Node 测试回归。~~ — **已完成**（`tank_move.js:48` / `tank_mvp.html:662` + `test-tankcollision.js` 测试 5/6，`npm run check`+`npm test` 全绿；归档见 `ARCHIVE.md`）
3. **甲弹对抗自测工具（可选排期）**：如需「编辑器产出 → 判定逻辑」的轻量自测（固定炮·测装甲 / 固定靶·测穿深与散布），按 `ARCHIVE.md`（2026-08-13 归档自 DEVELOPMENT.md §4.7，v0.4 方案原文）重新实现。
4. ~~**M0 贴图资产层 + 地图元素贴图（2.10，独立、立即收益）**~~ — **已完成（2026-08-15，P-06 完结，见 §2.10/§3.6）**：
   - 新 `js/tank_assets.js` 资产层：`ASSET_DEFS` 注册表（tree/bush/barricade/stump/rubble/soft → 尺寸/锚点/烘焙函数）+ 浏览器 Image 加载器 + `drawAsset`（有图 drawImage、无图/未加载回退程序化）。
   - 把 `drawCover`/`drawFoliage` 现有程序化画法改造为可烘焙函数，首次使用离屏 canvas 烘焙进缓存（沿用 PAINT_CACHE 思路），后续 drawImage；**视觉零变化、file:// 兼容、零依赖**；`tools/bake.html` 一键导出 PNG 到 `assets/`（真实美术日后直接替换文件，接口不变）。
   - `tank_battledraw.js` 地图元素分支走资产层；half/full 保持程序化；设计器不画地图元素，不受影响。
5. ~~**M1 声音占位系统（2.11，独立、立即收益）**~~ — **已完成（2026-08-15，P-07 完结，见 §2.11/§3.6）**：
   - 新 `js/tank_audio.js`：Web Audio 程序化合成 8 类占位音效（开火/击穿/未击穿/跳弹/殉爆/履带断/起火/UI），后续替换为资产文件。
   - AudioContext 惰性初始化（首次用户交互解锁）；音量分级（战斗 vs UI）。
6. ~~**摄像机 + 节点地图 + 小地图（2.1 / 5.1，捆绑三个前置缺口）**~~ — **已完成（2026-08-15，P-08 完结，见 §2.12/§3.7）**：
   - 摄像机跟随系统（玩家居中，节点战场约 1:9 摄像机比例）、独立小地图层（掩体/实体/视口矩形标注）——`js/tank_camera.js` / `js/tank_minimap.js`。
   - **节点生成器**：按难度权重随机生成掩体布局、敌军构成、友军据点位置；数据结构用有序节点列表（纯线性链，无分支），字段含敌人构成/强度档/据点/通关奖励——`js/tank_map.js`（P-05 的 `generateNode` 加 `scale` 选项复用为掩体布局源）。
   - **视口剔除 culling（5.6 捆绑）**：摄像机系统内建视口 AABB 剔除（`aabbInView`，covers/树冠/shells 走剔除）；粒子池化为后续可选项。
   - **全局游戏流程状态机（5.6 捆绑）**：`js/tank_flow.js`（map/battle/settlement/reward/gameover，白名单转移 + watchFlow 监听）；战斗循环只是其中一个状态。
   - **UI 界面层约定（5.6 捆绑）**：mvp 经 watchFlow 监听 → DOM 覆盖层（节点图/结算/卡牌三选一/阵亡）；卡牌内容为占位（M10 落地）。
   - 节点切换流程：节点清空 → 结算（得分/无伤/限时/据点加成，见 4.5）→ 节点间商店与卡牌三选一 → 下一节点。
   - **剩余项**：敌人 AI 双态（条目 7）、复活状态机（条目 8）、难度曲线表细化（条目 12）。
7. ~~**敌人 AI 双态行为 + 友军据点（2.2 / 5.1）**~~ — **已完成（2026-08-15，P-10，见 §2.2/§3.10）**：
   - 入镜主动态：`js/tank_ai.js` `aiDecide`（索敌朝玩家转向/靠近/开火，开火复用 `fireTank` shell 管线）；范围外默认不活动；边缘靠近态（`RULES.ai.edgeMargin`=200px，开放问题 2 已量化）。
   - 友军据点：`aiDecideAlly` 消极防御（不追击/不巡逻）、可被摧毁；击杀敌人五折记分仍为开放问题 4（非阻塞，记分接入留待经济里程碑）。
   - 第一版敌人不主动找掩体（开放问题 1 保持开放）。
   - **视线遮挡查询函数（前置，5.6）**：`tank_cover.js` `hasLineOfSight`（`vision:true` 灌木/树冠遮挡视线，与弹道穿透两套判定）已实现并接入 AI 索敌。
   - Boss `summons` 伴随单位已生成并走同一敌对 AI；阶段行为由 `onEnter.modifiers` 自然产生。
8. ~~**死亡/复活状态机（2.3）**~~ — **已完成（2026-08-15，P-11，见 §2.3/§3.11）**：永久死亡 + 复活次数（基础 2，`RULES.revive.baseRevives`）+ 满状态复活于友军据点旁随机无障碍点 + `invulnSeconds`=3s 无敌（`js/tank_revive.js` + mvp 死亡判定 + `applyModuleDamage`/DOT 无敌检查 + 无敌闪烁视觉）。剩余：局前商店购买追加复活次数（M10 经济里程碑接入）。
9. ~~**base/modifiers/stats 三层接线（5.1）**~~ — **已完成（2026-08-15，P-12，见 §5.1/§3.12）**：修饰器 `scope` 生命周期分类（permanent/run/timed）+ `removeRunModifiers`/`removeModifiersByScope`；卡牌与 Boss 阶段 modifier 标 `run`、run 结束清除。剩余：局外永久升级的修饰器**内容**（M10）。
10. **经济与数值落地（含存档）**：击杀得分、节点通关奖励量化（4.5 方案）、局内得分→商店点数转化比例、卡牌三选一刷新费（开放问题 5）；**玩家进度持久化（存档，5.6）**：永久升级 + 死亡时局内得分→商店点数转化需要 localStorage，需定存档结构/写入时机/版本化；**卡牌池/商店商品/永久升级树内容设计（5.6）**：modifiers 管道就绪但无内容，纯设计工作。**进展（P-09）**：卡牌 economy 效果类型与 `cards/` 池已就绪（内容待批量）。
11. **坦克纹理化 + 车型多样性内容（2.10）**：`texture` 字段 + 多边形 clip 平铺图案叠层（保持 `t.color` 主色）；texture 进 tank JSON + `tank_schema.js` FIELD_ROWS 枚举 + 设计器选择器（外观件条目）；几套定型几何模板 + 多色/迷彩方案（`tanks/` 条目目前共用箭镞车体+豹2A6炮塔模板，差异只在数值）。
12. **难度曲线表**：敌人数量 / AI 策略复杂度 / 数值强度三杠杆随节点索引的涨法（线性/阶梯/曲线），供节点生成器使用（开放问题 6）。
13. **碰撞体积与视觉几何对齐（可选，低优先）**：#18 修复（2026-08-14）后正面贴脸不再误判后部模块，但坦克碰撞盒仍为车体矩形包围盒（不含炮塔/炮管/箭镞尖头），紧贴时车体视觉重叠 ≈19px 仍残留（#18 修复方向④未实施，属弹道范围外的独立改动）；如需彻底消除，可考虑碰撞改用 `hullPoly` 凸包，风险点为碰撞手感/推挤行为回归，需回归 `test-tankcollision.js`。
14. ~~**卡牌内容批量（≥100 张）+ Boss 内容批量（≥5 种）**~~ — **已完成（2026-08-15，P-09 阶段 B，见 §2.13/§2.14/§3.9）**：111 张卡（5 流派×稀有度按权重）+ 5 Boss（多阶段+弱点+掉落）+ Boss 链尾运行时接入（生成/阶段触发/掉落）全部落地，`validate-content.js` + `audit-content.js --strict` + `npm test` 全绿。剩余相关项：Boss `summons` 伴随单位与 `behavior` 的行为化随敌人 AI（条目 7）一并接入；卡牌 ability/passive/drone/economy 的运行时效果随对应里程碑（M7/M9/M10）接入。
