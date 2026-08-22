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
- **敌人**：1v多。多态战术 AI（**P-10 已实现 P-19 扩充，2026-08-15**，见 `js/tank_ai.js` + `RULES.ai`）：
  - 摄像机范围内的敌人：主动索敌（朝玩家转向/靠近/开火，开火复用 `fireTank` shell 管线，含散布/弹种/掩体判定）。
  - 范围外的敌人：默认不活动；只有贴近摄像机边缘（视口外扩 `RULES.ai.edgeMargin`=200px，开放问题 2 初版）的一批主动靠近，进入范围后转为主动态。
  - **P-19 多态状态机**（2026-08-15 扩充，DEVELOPMENT.md §5.5 新增）敌人在以下状态间切换，`t.aiState` 字段实时记录当前状态，P-25 可视化预留：
    - **Stunned / 呆滞/惊慌**：模块伤害（`trackBroken`/履带断、`immobT`/Immobilization、或 `fireDebuffT`）触发阈值（`RULES.ai.stunModuleThreshold`=0.5）或随机概率（`RULES.ai.dazedProbability`=0.3）进入。优先级最高：`fire=false`、转向随机抖动±0.25rad、移动微抖动±0.25、炮塔锁定原方向、计时 `stunDuration`=3s 后恢复至 `patrol`。由 `aiUpdateStateTimer(t, dt)` 由主循环统一递减（同 `reloadT` 模式）。
    - **Flank / 绕行进攻**：不正面直冲，先横向绕到目标侧翼（目标朝向的垂直方向之一，选择远离目标炮塔指向的一侧，点积判定 `dotRight < 0`），再推进开火。距离条件：`inRange && dist > engage && dist < flankMinDist×1.5`（`RULES.ai.flankMinDist`=400）。输出：`turn` 指向侧翼位置、`move=1`、`turretDesired` 朝向玩家，准备开火。
    - **Defensive / 消极防御**：守在据点/掩体后，只打射程内目标，不追击。`move=0`、`turn=0`，仅在 `aimErr<tol && los && dist<=engage && reloadT<=0` 时开火。触发距离设为极远（`engage×3+500`），确保正常游戏距离不触发；真正的据点守卫由有友军时的状态判定触发。`t.aiState='defensive'`。
    - **Search & Destroy / 搜索前进**：目标不可见（LoS 被掩体遮挡）时朝最后已知位置/目标方向推进，到达后小范围来回扫视。`move=1`、带摆动 `turn`（`RULES.ai.searchOscillationSpeed`=0.25 rad/s）和 `turretDesired`（带摆动扫视）。连续 LoS 被遮挡满 `searchMinLoSBlocked`=2.0 秒后触发，计时由主循环通过 `aiStateTimer` 累计。
    - **Patrol / 队列行军**：无目标或远离战场时沿固定方向/巡逻前进，带轻微正弦摆动（`patrolWanderSigma`=0.02, `patrolWanderSpeed`=1.5 rad/s）。`move=patrolSpeedFactor`=0.8（相对于基准速度的比例）、`turn=wanderOffset`（`Math.sin(timer×patrolWanderSpeed)×patrolWanderSigma`）、`turretDesired=desired+wanderOffset×0.5`。确保敌人不会卡死，即使没有玩家也会缓慢移动/环绕。
  - 敌我通用：`aiDecide(t, ctx)` 输出 `{turn, move, turretDesired, fire}` → 接入层 `driveTank`（车体）+ 炮塔转速/射界逼近 + `fireTank`（开火）。视线判定走 `hasLineOfSight`（§2.7 `vision:true` 灌木/树冠遮挡视线，与弹道穿透是两套判定）。**Boss 与 summons 复用同一敌对 AI**，状态机同样适用于它们。
- **友军据点**：地图上固定点位的我方单位，只在指定小范围内**消极防御**（不追击、不巡逻）。可被摧毁（P-10 已实现：`aiDecideAlly` 原地不动、只打射程内最近敌人）。
  - 据点本身**不是**保护目标/失败条件的一部分（失败条件见下）。
  - 友军击杀敌人 → **玩家获得该击杀分数的一半**（记分接口开放问题 4 非阻塞，见 §4）。
- **伴随机器人（浮游炮）**：卡牌获取的随行单位，提升玩家火力通道，不是独立的"友军据点"概念，两者不合并设计。
- **无人机体系（P-17 子目标 4，2026-08-20 阶段 2 定型并实现纯逻辑层，见 §3.21）**：两种无人机（kind 与 `tank_cards.js` `DRONE_KINDS` 一致）——
  - `scout` 侦察：不攻击，`droneIndicators` 输出**视口外敌军指示**（`scoutRange`=700px 内、`aabbInView` 语义剔除），供战场边缘箭头/小地图标记消费（mvp 绘制接线为阶段 3）；
  - `striker` 打击：近身自动索敌（`strikeRange`=260px 内最近、hp>0、非无敌目标），独立 `fireInterval`=2s 计时输出 `{type:'droneFire'}` 事件——**不消耗玩家炮弹、不受玩家装填影响**，伤害 = `dmgMult`×0.4 × `owner.stats.damage`（阶段 3 结算层执行，复用 `fireTank` 或直接伤害）；
  - 环绕：`orbitDist`=90px 圆周 + `orbitSpeed`=1.2rad/s 相位推进 + 指数阻尼跟随（`orbitLerp`=6），owner 位移天然跟随；
  - 生命周期：`countMax`=2 超限**拒绝部署**（不替换最旧）；owner 阵亡自动移除；`clearDrones(owner)` 清场（enterBattle/reset）；实体挂模块级 `drones` 数组（单一数据源），需要时经 `spawnDrone` 的 `opts.registry` 显式镜像进 `entities` 注册表。
  - **mvp 接入（P-17，2026-08-20，见 §3.22）**：`pickCard` 部署 / `updateDrones` 战斗循环 / `droneFire` 事件结算（复用伤害管道）/ 視口外指示箭头 + 小地图标记 / `entities` 镜像与 `isDrone` 守卫（resolveTankCollisions L72 / AI 循环 L1243 / 绘制 L1775）/ 死亡清 `clearDrones` / 复活后 `deployDronesFromCards`。

### 2.3 死亡 / 复活 / 失败
- 死亡为**永久性**（真正 Roguelike 式）。
- 失败条件：**仅当复活次数耗尽**（`RULES.revive.baseRevives` 耗尽即 gameover）。
- 复活次数：基础 2 次，可在**一局开始前**用商店点数购买追加次数（局内不可购买；**M10 已实现（2026-08-22）**：局前商店与死亡商店均经 `buyExtraRevive` 购买，写入 `profile.bonusRevives` 持久化，出击时 `revives = RULES.revive.baseRevives(2) + bonusRevives`，见 §2.16/§3.25）。
- 复活效果：**满状态**复活（hp=maxHp、清 debuff/起火/履带断/弹药架殉爆），位置在**友军据点周围 `RULES.revive.reviveRadius`=150px 内、无障碍物的随机点**（无据点回退玩家出生点），复活后**短暂无敌 `RULES.revive.invulnSeconds`=3 秒**（直击/DOT 均不掉血，视觉半透明闪烁）。
- **P-11 已实现（2026-08-15）**：`js/tank_revive.js`（`findReviveSpot`/`reviveTank`/`canRevive`/`reviveAt` 纯逻辑）+ mvp 死亡判定（`canRevive` → 复活 / 耗尽 → gameover）+ `applyModuleDamage` 与 DOT 的无敌检查（`invulnT>0` 即不掉血）+ 无敌闪烁视觉。复活为**瞬间处理**（无过渡镜头/延迟，开放问题 3 定案：贴 10 分钟单局目标，不打断节奏）。

### 2.4 经济系统 —— 两条独立货币线，互不流通
| | 局内得分 | 商店点数 |
|---|---|---|
| 来源 | 击杀 + 节点通关奖励 (见 4.5 节) | 死亡时局内得分按比例转化 |
| 花费时机 | 仅本局内，节点之间开放 | 仅下一局开始前 |
| 用途 | 节点间三选一卡牌（可消耗得分刷新选项）+ **节点间商店**：买本局内的消耗品/临时强化 | **死亡后商店**：永久升级（贵，局内不可购买）、消耗品（如复活次数，便宜） |

- 节点间商店 与 死亡后商店 是**两套独立商店**，货币互不流通——维持"死亡才能换永久成长"的核心惩罚分量不被稀释。
- **P-14 已实现（2026-08-15）**：`js/tank_economy.js`（`UPGRADE_DEFS` 永久升级树 + `scoreToPoints`/`killScore` + `loadProfile`/`saveProfile` 版本化存档 + `buyUpgrade`/`applyUpgrades`）。具体数值收口 `RULES.economy`：普通敌击杀 `killScoreBase`=20 分；死亡转化 `scoreToPointsRatio`=10%；卡牌刷新费 `refreshCost`=10；复活次数购买 `reviveCost`=40 点。**永久升级树（8 项，permanent scope，cost 25~40 点 / maxLevel 5）**：穿深/伤害/正面装甲/炮塔装甲/耐久/极速/装填/散布。存档 `{version, points, upgrades, stats}` 版本化存 localStorage（**M10 起演进为多存档槽位体系：元索引 `rogue-tank-saves-meta` + 槽位键 `rogue-tank-save:<id>`，旧单键自动迁移为默认存档且永不删除，见 §2.16**），版本不匹配回退默认；死亡后商店（gameover 覆盖层）用点数买永久升级 + 复活次数；开局 `applyUpgrades` 应用永久升级 + `runs++`。**开放问题 5（节点通关得分量化）已部分落地**：击杀得分 `killScore` + §4.5 节点通关奖励 + 转化比例均已量化，剩余"卡牌刷新费交互"（节点间局内商店 UI）留待后续里程碑。

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
8. **烟幕 = 动态区域视线掩体（P-17 子目标 2 已定型并实现，2026-08-20）**：烟雾是**动态、区域化**的 `vision` 掩体，与静态灌木/树冠互补——
   - **只遮挡视线、不遮挡弹道**：`hasLineOfSight`（`js/tank_cover.js`）穿越烟雾云即返回 false（AI 索敌被阻断）；`getExposure` 不受影响（弹道照穿，`mode:'none'` 语义）。
   - **对区域遮挡，不是"持卡即全图隐身"**：由 `smokeClouds` 数组维护各团烟雾（`{x, y, radius, life, maxLife}`），线段-圆距离判定，半径/时长/上限收口 `RULES.smoke`。
   - **命名决策**：核心函数 `spawnSmokeCloud`（`js/tank_cover.js`），避开 `tank_fx.js` 的粒子 `spawnSmoke`（弹道烟迹视觉粒子）的全局同名冲突；视觉渲染由接入层消费 `smokeClouds` 绘制。

### 2.6 弹种系统：多弹种物理化（P-16 已定型并实现，2026-08-19）
- **弹种表 `RULES.ammoTypes`**（`js/tank_rules.js`，机制参数唯一配置源，必须最先加载）：四弹种 ap / apcr / heat / he（heat/he 为 P-16 新增，ap/apcr 既有不动）。字段：`label` 显示名 / `color` HUD 色点 / `tail` 弹道拖尾 + 战斗系数 `speed`×飞速 / `pen`×穿深 / `dmg`×伤害 / `spread`×散布（缺省 1）/ `noBounce` 确定性不跳弹 / `splashRadius` HE 爆炸半径（px）——逻辑范围伤害与爆轰特效共用同一数值。
- **HEAT 破甲弹（`heat`）**：`{ speed 0.8, pen 1.4, dmg 1.0, spread 1.2, noBounce }`——**散布惩罚换穿深**：1.2× 散布（弹道更散）换 1.4× 穿深、0.8× 飞速；确定性不跳弹。
- **HE 高爆弹（`he`）**：`{ speed 0.95, pen 0.7, dmg 1.0, noBounce, splashRadius 90 }`——低穿深高爆；确定性不跳弹；命中即爆轰（击穿与未击穿两支都爆）。
- **noBounce 确定性不跳弹**：入射角 >70° 时跳过跳弹与角度 BLOCK 分支，直接按穿深判定——HEAT 高穿深仍可击穿；HE 走未击穿爆轰分支（残余爆轰伤害 `dmg × max(0.25, 0.5 × pen/eff)`，装甲吸收爆轰残余能量扣血，地板 25%）。AP/APCR 保持原跳弹语义（>70° 反射，二次跳弹仍不允许）。
- **HE 范围溅射（`splashRadius`）**：命中点对周围实体施加 `dmg × (1 − dist/radius) × 0.5`——贴脸 50%、边缘衰减到 0；友军/敌军一视同仁（不做阵营区分）；无敌（invuln/invulnT）与已摧毁目标免疫；主目标由主命中结算、不重复扣血（`applySplashAt`，走 entities 全局注册表）。
- **HE 破障（A3 保持独立）**：HE 弹销毁瞬间对落点半径 24px 内可破坏元素造成 1 点溅射伤害（`RULES.breach.heSplashRadius`），与 90px 坦克溅射是**两套并存**（前者只作用于掩体、后者作用于实体，见 2.7）。
- **特效对齐约定**：HE 爆轰视觉特效半径与逻辑 splashRadius 严格一致（`burstExplosion` scale = splashRadius/40；`tank_fx.js` `spawnShockwave` maxR = 40×scale），杜绝"特效看着大/实际炸得小"的视觉误导。

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
- **A3·HE 破障**：HE 弹命中（任意形式销毁）时对落点半径 24px 内的可破坏元素造成 1 点溅射伤害（`RULES.breach`），可同时清理一排栅栏/残骸；**只作用于掩体，不对坦克溅射**（对坦克的 90px 溅射与未击穿残余爆轰由 P-16 单独实现，见 §2.6——破障 24px 与坦克溅射 90px 两套并存）。
- **A3·路障跳弹**：弹丸与沙袋路障碰撞时复用坦克跳弹逻辑（>70° 反射，一次反射后 `canBounce=false`），跳弹不消耗路障耐久——斜向的沙袋是可以"弹走"的。
- 树为不可压毁（树干挡路，同建筑），只能炮弹伐倒，**树耐久 1 → 一发即倒**（伐倒后倒树仍不可压毁，见上）；灌木不可摧毁。

### 2.8 已明确排除 / 延后的机制（历史）
- 曾被提出并最终排除/延后的机制（无限波次、低矮掩体、1/2/0 部位锁定、友军防线回避区、3D 顶点装甲模型回退）的完整原文见 `ARCHIVE.md`（2026-08-13 归档自 DEVELOPMENT.md §2.8）。
- 其中两条后续指引仍有效：**1/2/0 按键位仍预留给未来"弹种切换"**（AP/APCR/HE 等，非部位锁定；**P-16 已落地**为数字键 1/2/3/4 → ap/apcr/he/heat，见 §2.6）；**3D 装甲模型回退后**，若未来要做"特殊 Boss 专属弱点"之类的差异化机制，应作为独立特例实现，不作为全体坦克的标配系统。

### 2.8b QA 与测试脚本规范（新增）
本节记录测试脚本的质量保证要求，确保项目各模块测试代码的健壮性、安全边界覆盖和规范一致性。

**核心检查项（`scripts/test-qa.js` 自动验证）：**

1. **语法合规**：
   - 必须包含 `'use strict'`（或 `"use strict"`）声明
   - 必须引用核心模块：`require('../js/tank_utils.js')`（纯工具层）和 `require('../js/tank_rules.js')`（RULES 源）
   - 必须使用 `ok()` 函数或 `let fails` 计数器模式进行断言

2. **全局上下文 shim**：
   - 必须设置 `global.TAU = U.TAU`（或等价常量）
   - 必须设置 `global.RULES = RULES_MOD.RULES`（规则来源）
   - 推荐包含 `function ok()` 模式以统一断言格式

3. **安全与健壮性边界覆盖**：
   - 测试脚本必须包含至少 3 种不同的边界检查模式，以确保关键机制在极端但合法输入下的行为
   - 必要的边界模式包括但不限于：
     - 断言模式（`ok()` 调用）
     - 计数器模式（`fails` 计数）
     - 重置/恢复模式（`resetCovers`、`resetEntity`）
     - 物理/几何检查（`getExposure`、`impactGeometry`、`resolveHit`、`moduleFromHit`）
     - 弹跳角度检查（`BOUNCE_ANGLE` / `bounceAngle`）
     - 无敌帧检查（`invuln`/`Invuln`/`invuln`）
     - 复活检查（`canRevive`、`reviveTank`、`findReviveSpot`）
     - 视线检查（`hasLineOfSight` / `lineOfSight`）
     - 高度类别检查（`weightClass` / `heightClass`）
     - 掩体层级检查（`full` / `half` / `bush` / `tree` / `soft` / `barricade`）
     - 驾驶越掩检查（`driveBy` / `DriveBy` / `driveby`）
     - 模块检查（`modules.` 前缀）
     - 炮口归一化检查（`normalizeBarrel`）

4. **已验证的测试脚本**：
     - `scripts/test-covers.js`：655 断言，31 个测试组（A1~A3 + 极端边界），通过 QA 合规检查，包含 7 种边界模式
     - `scripts/test-tanks.js`：坦克 JSON 完整性验证，通过 QA 合规检查
     - `scripts/test-flow.js`：流程状态机边界与健壮性测试（payload / 矩阵拦截 / watcher 防护 / 复活与实体制约），通过 QA 合规检查，包含 4 种边界模式（#44 已解决）
     - `scripts/test-modifiers.js`：属性修饰器系统分类与边缘健壮性测试，通过 QA 合规检查，包含 4 种边界模式（#49 已解决）
    - `scripts/test-extreme-combat.js`：物理/命中极端压力测试，通过 QA 合规检查，包含 7 种边界模式
    - `scripts/test-extreme-cover.js`：掩体系统极端边界测试（第 31-35 情况），通过 QA 合规检查，包含 5 种边界模式
    - `scripts/test-extreme-geometry.js`：几何边界测试，通过 QA 合规检查，包含 3+ 种边界模式
    - `scripts/test-hitpart.js`：模块命中检测，通过 QA 合规检查，包含 4 种边界模式
    - `scripts/test-tankcollision.js`：坦克碰撞测试，通过 QA 合规检查，包含 3 种边界模式

  5. **内容审计工具（`scripts/audit-content.js`）**：
     - 卡牌稀有度/流派/效果类型分布与 Boss 配置的常态化审计工具。
     - **2026-08-22 核实**：`node scripts/audit-content.js --strict` 115 张卡牌（common 47.8% / rare 31.3% / epic 15.7% / legendary 5.2%）与 5 个 Boss（均 3 阶段、掉落齐全）全量通过，**零警告**。分布偏差在预期统计波动范围内（< 3%），无需修正。

**QA 流程生命周期**（与 DEVELOPMENT.md §2 约定一致）：
- 新增测试脚本编写完成后，在提交前运行 `node scripts/test-qa.js` 确保合规
- 通过合规检查的脚本会在 `npm test` 起始时自动通过语法与结构验证
- 若脚本因新机制（如新增 cover tier、新增 AI 行为）而产生新的边界检查需求，应相应更新 `test-qa.js` 的模式列表
- 修复 QA 发现的问题后，从 `PLAN.md`/`ISSUES.md` 删除对应条目，归档至 `ARCHIVE.md`

**QA 与文档联动**：
- QA 发现的系统性问题应同步记录在 `DEVELOPMENT.md` §5（技术债/下一步）中
- 测试脚本的边界模式覆盖情况会在代码审查时作为质量指标参考
- 所有测试脚本必须保持 `module.exports` 导出以支持 Node 端单元测试

---

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

**坦克纹理化（已实现 2026-08-19，P-27 完结，见 §3.16）**：
- 不能做整坦克位图 sprite（几何是设计器逐顶点编辑的任意多边形）；做法 = **多边形 clip + 平铺图案叠层**（装甲板纹/焊缝/锈蚀/迷彩），保持 `t.color` 主色（灰度图案 + alpha 叠层），兼容设计器编辑、换色、`PAINT_CACHE` 缓存（key 加 texture 段）。
- `texture` 字段进 tank JSON + `tank_schema.js` FIELD_ROWS 枚举 + 设计器选择器（外观件条目）——全链路已接线（paintPartTextureDirect/paintPartTexture/tank JSON/schema/battledraw/compare 缩略图），4 型坦克已分配纹理。
- 车型多样性**几何模板**仍为 §6 条目 11 剩余项。
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
- `generateRun(seed, count, env)`：一局 = 线性节点链（无分支，§2.1），节点数 `RULES.nodeMap.runNodeCount`（5）；`makeNode(index, count, rng, env)` 每节点 =
  - **掩体布局**：复用 `generateNode`（P-05）并加 **`scale` 选项**（`tank_nodegen.js`，模板 w/h 与元素位置/尺寸/verts 同倍率放大；scale=1 零行为变化）。**视口驱动缩放（2026-08-19，#24 修复）**：`makeNode`/`generateRun` 显式注入 `env.viewport = { vw, vh }`（mvp 传画布尺寸、Node 测试传假值；纯逻辑可测）时，先经 `pickTemplate(diff, rng)`（nodegen 导出的难度加权选择）预选模板，再算 `nodeScaleFor = RULES.nodeMap.nodeScale(3) × max(vw/模板w, vh/模板h)` → 节点世界宽高各 ≥ 视口 3 倍（面积 ≥ 9 倍：1280×720 → ≥3840×2160、1920×1080 → ≥5760×3240）；env 缺省回退旧行为（固定 nodeScale=3，约 700×400 → 2100×1200）。敌军/据点散布区域按 w/h 比例（右 2/3、左 1/4）随世界放大，间距约束保持绝对 px（`enemyMinDist`/`enemyMinPlayerDist`）。
  - **内置模板（2026-08-19，#25 修复）**：`NODE_TEMPLATES` 由 5 个扩到 **7 个**（新增 `village_center` 村落中心广场 mid/high、`woodland_line` 林地战线 high），单模板 items 12~25 个（树/灌木/沙袋/栅栏/半高/全高混合，体现 开阔走廊/密林阵地/城镇街区/交叉火力广场/混合障壁/村落中心/林地战线 地貌）；剔除率随难度递减 `cullRate = rng.range(0, 0.12) × (1 − 0.7·diff)`（diff=1 → ≤0.036、diff=0 → ≤0.12，高难保留更多元素、低难仍可稀疏）；确定性（种子 RNG）不破坏。
  - **水体/桥梁（P-20 部分落地，2026-08-20）**：`generateNode` 以 `waterBridgeChance = diff×0.5` 概率随机插入 1 组水体/桥梁组合（`tier:'water'` 不可通行 `move:0`、`tier:'bridge'` 通道 `move:1`，RULES.coverTiers）。**边界约束（ISSUES #62 修复，2026-08-20）**：① 水体尺寸封顶到节点宽高 40%——原始尺寸区间 `[300,800]×[200,500]` 相对模板（700~860）本就占 35%~114%，scale 后会把大半个战场吞掉并耗尽敌军/据点拒绝采样 guard（`pointInCover` 排斥）；② 偏移按「模板单位 × scale」约定采样一次（旧实现先按世界尺寸算 maxDx 再乘 scale，双重缩放把水体/桥梁中心推出节点界，legacy scale=3 下实测越界 +348px~−3480px）；③ 桥梁 y 偏移钳制在节点半高内（水体贴近上缘时防越界）。legacy（scale=3）与视口模式两条路径下生成掩体均落在 [0,w]×[0,h] 内。**2026-08-21 加固（见 §3.23）**：玩家出生点经 `findPlayerSpawn` 排除水域/掩体（`js/tank_map.js`）；水体与已有 covers 重叠经 `rectHitsCover` 拒绝采样；桥梁 Dy 钳制计入自身半高防越北界；mvp 绘制改 water→bridge→其它 顺序防水域盖下层掩体。
  - **难度曲线（初版，§6 条目 12 的细化另行定表）**：`difficultyForIndex = 0.15 + 0.8·t^1.25`（t=index/(count−1)，单调 0.15→0.95，后段加速）。
  - **敌军构成**：数量 `1 + floor(diff·4)`（1~4）；tankId 取自 `RULES.nodeMap.enemyTankPool`（默认 `['dummy']`，车型多样性里程碑扩充）；重坦占比随难度（diff>0.6 或 35% 概率）；散布在右 2/3 区域，拒绝采样避开掩体包围盒（+60px）、彼此 ≥`enemyMinDist`、离玩家出生点 ≥`enemyMinPlayerDist`。
  - **友军据点**：概率 `outpostChance`（0.7）出现在左侧友军区（x ∈ [0.12w, 0.30w]），远离敌军与出生点。
- **通关奖励（§4.5 落地）**：`scoreNode(node, {damageTaken, clearMs, outpostAlive})` —— base = `100·(1+index·0.2)`；无伤 +50%；速通（clearMs ≤ `RULES.nodeMap.speedClearMs`=120s）+20%；据点存活 +20%。
- **实体化 `materializeNode(node, env)`**：env 显式注入（浏览器传 covers/entities/spawnTank/applyTankConfig+resetEntity；Node 测试传 fake）——替换全局 covers + `snapshotCovers`、清场（保留 player 与测试靶车 dummy）、生成敌军/据点实体（`nodeSpawn` 标记，供清敌判定与 M7 AI 识别）。

**全局游戏流程状态机（`js/tank_flow.js`，纯逻辑，Node 可测）**：
- `FLOW_STATES = map / battle / settlement / reward / gameover`（**M10 扩展（2026-08-22）：增 home / loadout / shop 三局外状态**，白名单 `home:['loadout','home']`、`loadout:['shop','map','home']`、`shop:['map','loadout','home']`、`gameover:['map','home']`，见 §2.16）；`FLOW_TRANSITIONS` 白名单转移表（`battle→settlement|gameover|map`、`settlement→reward|map`、`reward→battle|map`、`gameover→map` 等；**非法转移抛错**——测试与 UI 接线的护栏）。
- `watchFlow(flow, fn)` 注册监听（UI 层消费；回调异常被吞，不中断状态机）；`restartRun` 重开（回 map、runId 自增）。
- **战斗循环只是其中一个状态**：mvp `loop()` 模拟门控 `simulating = !run || flow.state==='battle'`——非战斗状态冻结战场，覆盖层接管。

**小地图（`js/tank_minimap.js`，ctx 显式传参，布局纯函数 Node 可测）**：`minimapLayout`/`worldToMinimap`/`worldRectToMinimap` 世界→小地图等比换算；`drawMinimap` 画面板底、世界边界、掩体点（soft/bush 淡、full/barricade/tree 亮）、玩家绿/友军蓝/敌军红标记、摄像机视口矩形。mvp 屏幕空间右上角覆盖层（170×120）。

**视口剔除 culling（条目 6 捆绑前置）**：mvp `draw()` 全部世界绘制套摄像机变换（`translate→scale→translate(-cam)`），covers/树冠层/shells 按 `aabbInView` 剔除（余量 64px），网格只画视口内线段；粒子池化为后续可选项（`drawFxParticles` 暂全量）。

**UI 界面层约定（条目 6 捆绑前置）**：mvp 通过 `watchFlow` 监听状态转移 → 显隐 DOM 覆盖层（`#flowOverlay`：节点图 `mapScreen` / 结算 `settleScreen` / 卡牌 `rewardScreen` / 阵亡 `gameoverScreen`）；数据源是纯逻辑模块返回值（`generateRun`/`scoreNode`），UI 零耦合。卡牌三选一由 P-09 起接真实卡池（`cards/` → `/api/cards` → `drawCardChoices`，见 §2.13）。**M10 扩展（2026-08-22）**：首页多存档 / 出战整备 Loadout / 局前升级商店三界面按同一约定接入（见 §2.16）。

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
6. `economy` —— `{field:'scoreMul'|'shopDiscount'|'startScore'|'reviveCount', value}`（运行时消费仍待接线——M10 本轮交付为局外闭环，未含卡牌 economy 效果消费）。

**稀有度与流派**：稀有度 4 档 `common/rare/epic/legendary`（抽卡权重 50/30/15/5）；流派 5 个标签 `重甲/狙击/机动/爆破/支援`（构筑方向，可多标签）。**内容规模已落地（会话 25b5b25d 产出）：111 张卡**（common 55 / rare 34 / epic 16 / legendary 6，占比 49.5/30.6/14.4/5.4%，5 流派各 21~23 张），覆盖 6 类效果（modifier 101 / ammo 17 / ability 8 / passive 8 / economy 5 / drone 1）。

**模块与工具**：`js/tank_cards.js`（纯逻辑：`validateCard`/`validateCardSet`/`applyCardEffects`/`drawCardChoices`/`cardStackCount`/`weightedRarity`）；`scripts/validate-content.js`（内容 schema 守门，挂 `npm test`）+ `scripts/audit-content.js`（稀有度/流派/效果类型分布与数值极值审计，`--strict` 按阈值失败，115 张卡牌与 5 个 Boss 审计 0 警告核实通过）；`tools/content_designer.html`（卡牌+Boss 统一编辑器，表格化编辑 effects、保存写回 JSON）；子 agent `@card-author`/`@balance-auditor`。mvp 的节点间三选一已接真实卡池（`/api/cards` → `drawCardChoices` 抽 3 → `applyCardEffects`）。
- **运行时消费（P-17）**：`modifier` 立即生效走 base/modifiers/stats 管道；`ability`/`passive`/`drone`/`economy` 效果挂 `tank.cardEffects`（`{type, key/kind, cardId}`），由对应里程碑按键接入消费（ability→`js/tank_abilities.js` 统一入口+cd；drone→`js/tank_drone.js`；详见 §3.22）。

### 2.14 Boss 系统（数据驱动，P-09 已实现，2026-08-15）

**定位**：Boss = **特殊坦克配置 + 数据驱动多阶段机制**（参照 FTL Rebel Flagship 多阶段——每阶段改变打法；Into the Breach 弱点驱动——意图可读、位置博弈）。**不是弹幕墙**，延续"摆角度/打弱点/抢位置"的拟真博弈。**内容规模已落地（会话 25b5b25d 产出）：5 种 Boss**，打法彼此区分。

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

### 2.15 三入口页面架构 + 正式游戏界面约定（P-15 已定型与实现，2026-08-19）

**三入口拆分**：原型按用途拆为三个独立入口（`server.js` '/' 路由指向 `index.html` 并在启动横幅列出四页；`scripts/check-html.js` 注册全部页面做内联脚本冒烟）：
- **`index.html` 首页**：正式游戏 / 装甲测试台两卡片入口 + 设计器 / 对比链接（封面路由，'/' 不再直达 mvp）。
- **`tank_mvp.html` 正式游戏页**：只保留正式 run 链路（NEW RUN / 节点链 / 结算 / 卡牌 / Boss / AI / 复活 / 经济 / 小地图）；**移除测试台专属物**（dummy 靶车、靶场控制台、左栏发射解算 + 日志）。
- **`tank_bench.html` 装甲测试台独立页**：承接原 mvp 的测试台职责——player + dummy 靶车、发射解算面板、靶场控制台（满血 / 无敌 / 自动复活）。

**正式游戏 HUD 极简约定**：日常仅保留 4 件套——装填进度条 `#reloadWrap`、弹种指示 `#ammoIndicator`（色点 + 标签）、提示条 `#hintBar`（TAB 状态 / 开发者面板 / 1/2/3/4 弹种 / WASD 移动 / 左键或空格开火）、右上角小地图（`tank_mvp.html` L163-168）；其余信息一律收纳进按需面板（状态面板 / 开发者面板），不在战斗常驻 HUD 里堆砌。

**伤害飘字模块规范（`js/tank_dmgtext.js`，纯逻辑双端导出）**：战斗命中反馈统一走飘字——`spawnDmgText(x, y, text, kind)` 生成 → `updateDmgTexts(dt)` 逐帧上浮 + 淡出 + 到期移除（life `DMG_TEXT.life`=0.9s、全程上浮 `rise`=30px 世界坐标，进度 = age/life 线性）→ `drawDmgTexts(ctx)` 在世界坐标绘制（消费方已套摄像机变换；深色描边底双画保证任何背景可读）。**五色语义（定型）**：击穿红/橙（`pen` `#ff6c5c`）、未击穿白（`block` `#d9dcc9`）、跳弹蓝/白（`bounce` `#5cc8ff`）、高爆黄（`he` `#ffb454`，HE 弹击穿 / 爆轰）、DOT 灼烧橙（`dot` `#ff9a3c`）；未知 kind 回退 `pen`。消费方（mvp / bench）在命中 / 跳弹 / DOT 结算处接线——击穿与 HE 显示 `res.dmg` 数值、未击穿与跳弹显示文字标签；`js/tank_physics.js` `applyModuleDamage` 返回值补 `dmg` 字段供飘字直接取整后伤害（显示伤害 == 实际扣血约定不破）。

**玩家状态面板**：TAB 键切换 `#statusPanel`（`tank_mvp.html` L193/411-425），只读 `player.stats` 显示 HP / 火力（穿深·伤害·装填）/ 机动（极速·马力）/ 当前散布 σ / 装甲分布（hull·turret × front/side/rear）——**读 stats 不摸 base**（§5.1 三层属性约定）。

**开发者面板**：F12（或反引号键）切换 `#devPanel`（L206/428-465），收纳调试日志与发射解算，并新增：
- **超级精度开关**（`devAim.zeroSpread`）：开火时 sigma 归零（L894）+ 每帧 `player.sigma = 0` 瞬间缩圈（L1064）；
- **数值临时调整控件**（`devOverrides`）：实时改穿深 / 伤害 / 装填 / 极速 / 马力，每帧写回 `player.stats`，一键重置（L439-462）；
- 卡牌列表 / 修饰器列表查看（开发期辅助）。

**弹种 4（HEAT）**：数字键 4 切换 HEAT（P-16 已接入，见 §2.6/§3.19）——heat 系数 1.4×穿深 / 0.8×速 / 1.2×散布 / 确定性不跳弹。

### 2.16 局外流程闭环：多存档 + 出战配置 + 局前商店（M10 扩展 / P-22，已实现并验证 2026-08-22）

**开局闭环定型**：`home`（首页多存档）→ `loadout`（出战坦克与弹药选配）→ `shop`（局前永久升级商店）→ `map`（节点链开局）。gameover 提供「重开（map）」与「返回首页（home）」两条出路；死亡购买 UX（永久升级 + 追加复活）继续内嵌在 gameover 态承接。

**多存档存储模型（`js/tank_economy.js`）**：
- 「元索引 + 槽位字典」两层结构：元索引键 `rogue-tank-saves-meta` = `{activeSaveId, saves:[{id, name, updatedAt}]}`；每个存档独立槽位键 `rogue-tank-save:<id>`（profile 遵循既有 normalizeProfile 校验）。
- profile 新增字段：`selectedTankId`（出战坦克）、`ammoLoadout`（出战弹种数组，≤3）、`bonusRevives`（局外购买的追加复活次数）；saveVersion 不变。
- API（纯逻辑、storage 显式注入、Node 可测）：`listSaveSlots` / `createSaveSlot` / `deleteSaveSlot` / `renameSaveSlot` / `setActiveSaveSlot` / `loadActiveProfile` / `saveActiveProfile` / `migrateLegacySave` / `buyExtraRevive`。
- 兼容性定型：`loadProfile`/`saveProfile` 变薄委托（读/写当前激活槽位），mvp 既有调用点零改动；legacy 单键 `rogue-tank-save` 自动迁移为「默认存档」，**旧键永不删除**（回滚安全）。

**流程状态机扩展（`js/tank_flow.js`）**：
- `FLOW_STATES` 新增 `home` / `loadout` / `shop` 三态；转移白名单：`home:['loadout','home']`、`loadout:['shop','map','home']`、`shop:['map','loadout','home']`、`gameover:['map','home']`。
- `createFlow(initialState?)` 缺省 `'map'` 向后兼容；`restartRun` 对局外三态 no-op 返回 runId（不打断存档选择）。
- **gameover→shop 口径**：规划流转图中的 `gameover→shop` 箭头由既有 **gameover 态内嵌的死亡购买 UX** 承接——这是设计解释而非缺口；gameover 白名单仅 `['map','home']`，不新增直达 shop 的转移。

**出战配置（Loadout）**：
- 出战坦克：`fetchTankList` 列表卡片选定 → 写入 `profile.selectedTankId`；出击时经 `applyTankConfig(player, selectedTankId)` 应用。
- 弹药选配：从 `RULES.ammoTypes` 复选，**上限 ≤3 种**（拒绝第 4 个）、**≥1 种才可出击**；保存在 `profile.ammoLoadout`。
- 战斗内切换（mvp）：数字键 `1/2/3` 按 `player.ammoLoadout` 槽位**索引化**切换（越界忽略），`Q` 环形循环；HUD 弹药槽位组显示 键位/弹种名/倍率/色点 并高亮激活槽；`fireTank` 按 `shooter.ammoKey` 结算（弹道管线零改动，P-16 已备全链路）。取代此前 mvp 全局直选 1/2/3/4 的弹种切换语义。
- 兜底：无 loadout 时回退全弹种表（调试直开战斗态等价旧行为）；AI/Boss 不受影响（不走玩家 loadout）。

**局前商店与统一出击路径（`beginRunFromMenu()`）**：
- 商店项 = `UPGRADE_DEFS` 八项永久升级（等级/费用/满级置灰）+ 追加复活次数购买（`buyExtraRevive` → `profile.bonusRevives` 持久化）。
- 出击统一走 `beginRunFromMenu()`：配置校验 → 清 run modifiers → `applyTankConfig(player, selectedTankId)` → `applyUpgrades` → `revives = RULES.revive.baseRevives(2) + bonusRevives` → 预挂载 `ammoLoadout`（`ammoKey` 同步首槽）→ `generateRun` → `transition('map')`。gameover 界面新增「返回首页」。

**范围决策（避免后人误判为遗漏）**：
- **tank_bench.html 不做索引化切换**：装甲测试台保留全局直选全弹种（调试台语义）；loadout 索引制为 mvp 正式游戏专属。
- **`js/tank_model.js` 无需改动**：弹种散布/倍率/noBounce/splash 全链路 P-16 已就绪，本里程碑只做选配与切换接线。
- 卡牌 `effect.type==='ammo'` 与 loadout 键集求交是遗留衔接点（未配备弹种的改造卡不应产生可切换目标）→ 见 §6 条目 27。

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
- **`scripts/check-html.js` 扩展**：冒烟检查从固定 3 个文件扩展为遍历整个 `js/` 目录全部 JS + `server.js` + 三个原型的每个内联 `<script>`；并新增顶层重复函数声明检测（防止再次引入重复定义）。**2026-08-19 重构**：语法冒烟从「临时文件 + `spawnSync --check`」改为进程内 `vm.Script(code, {filename})` 解析（无临时目录依赖、失败输出带文件名与堆栈，行为不变）。
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
- **内容校验修正（2026-08-20，ISSUES #59，31 项误报清零）**：`scripts/validate-content.js` 两处误报修复，校验能力未放松——
  1. **desc/Effect 数字一致性按 effect 语义分支**（原逻辑一律按乘法乘数 `(value−1)×100` 期望）：`modifier`/`ammo` `mode=add` → 期望 desc 数字 ≈ value 绝对量（+10mm → 10）；`mode=mult` → ≈ `(value−1)×100`（0.85 → −15），且 value<1 的缩减乘数允许 desc 写正数（「散布缩小 15%」）；`economy` scoreMul 乘数 / shopDiscount 小数（0.1 → +10%）/ startScore·reviveCount 绝对量；`passive` angle_boost·commander_sight 直接数值、overmatch·reactive_armor·spall_liner 阈值/标志/系数跳过；ability/drone 无数值期望跳过。同期望值 effect 共享 desc 数字匹配池（「整车等效厚度 +30%」合法覆盖 hull+turret 两个 ×1.3）；无 ±5 匹配时仅最近数字偏差（绝对值 >20 或相对 >50%）才报错（「缩圈更快」纯文字描述不误报）。
  2. **坦克 hull/turret 多边形凸性检查 → 简单多边形检查**（顶点 ≥3、坐标有限、面积非零、无自相交）：引擎与设计器半形对称几何（`js/tank_halfgeom.js`）天然支持合法凹车体（Leapard_1 / Obj 780 / tiger-I 实测 raycastTank 正常），凸性检查属误报。
  真实不一致仍可检出（验证用例：desc +15 vs mult 1.5 → 报错；自交/零面积多边形 → 报错；临时用例测完即删）。

#### 3.9 内容批量 + Boss 运行时接入（P-09 阶段 B，2026-08-15 会话；设计见 §2.13/§2.14）
- **卡牌批量 111 张**：5 个 `@card-author` 子 agent 并行产出（重甲/狙击/机动/爆破/支援 各 20 张 + 既有 11 张），稀有度实测 common 47.8%/rare 31.3%/epic 15.7%/legendary 5.2%（期望 50/30/15/5%），均落在正常统计容差范围内；`validate-content.js` + `audit-content.js --strict` 全绿（115 张卡牌与 5 个 Boss 审计 0 警告核实通过）。
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

#### 3.13 难度曲线表（P-13，2026-08-15 会话；设计见 §4 开放问题 6）
- **三杠杆定表**：`RULES.difficulty`（curveStart 0.15 / curveSpan 0.8 / curvePow 1.25 / enemyCountMax 4 / aiTierMax 2 / statMultMax 1.5）。
- **接入生成器**：`tank_map.js` 的 `difficultyForIndex` 改读 `RULES.difficulty`；新增 `aiTierForDifficulty`/`statMultForDifficulty`；`makeNode` 产 `aiTier`+`statMult`（节点级 + 每个 enemy 带 `statMult`）；`materializeNode` 经 `env.applyDifficulty(tank, statMult)` 应用数值强度（mvp 用 `addModifier` 给敌军 hp/穿深/伤害 乘 statMult，`scope:'run'`）。
- **验证**：`scripts/test-map.js` 补三杠杆断言（AI 档位/数值强度单调+范围+匹配难度+敌人带 statMult），`npm test` 全绿（现共 20 套）。

#### 3.14 经济与存档（P-14，2026-08-15 会话；设计见 §2.4）
- **纯逻辑 `js/tank_economy.js`**：`UPGRADE_DEFS`（8 项永久升级树：穿深/伤害/正面装甲/炮塔装甲/耐久/极速/装填/散布，cost 25~40 / maxLevel 5）+ `scoreToPoints`/`killScore` + `loadProfile`/`saveProfile`（版本化 + 损坏回退）+ `buyUpgrade`/`applyUpgrades`。
- **击杀得分**：`entities.forEach` 击杀检测里 `runScore += killScore()`（敌方、非测试靶车）+ `profile.stats.kills++`。
- **死亡转化**：gameover 分支 `scoreToPoints(runScore)`（10%）→ `profile.points` + `saveProfile`；gameover 覆盖层显示转化 + 现有点数 + 死亡商店（`renderDeathShop` 列永久升级与复活次数，`buyUpgradeAndRefresh`/`buyReviveAndRefresh` 挂 window）。
- **开局应用**：`startNewRun` 调 `applyUpgrades(player, profile)`（permanent scope）+ `profile.stats.runs++` + `saveProfile`。
- **验证**：`scripts/test-economy.js`（18 断言：存档默认/归一化/往返/转化/购买/满级/应用升级）挂进 `npm test`（现共 21 套全绿）；vm 运行时冒烟覆盖「开局应用升级+runs++ → gameover 转化+商店渲染 → 购买函数」（临时脚本，未入库）。
- **M10 扩展（2026-08-22）**：存档演进为多存档槽位体系 + 局前商店 + 出战配置接入——见 §2.16 / §3.25。

#### 3.15 战斗/地图修复 + 卡牌效果逐卡守门（2026-08-19 会话）
- **#23 敌方 AI 只开一炮（修复）**：根因 = `update(dt)` 的 `entities.forEach` 无 `e.reloadT` 递减（仅 player 在 L1061 单独递减），`fireTank` 设置的装填倒计时永不归零 → `aiDecideEnemy` 的 `t.reloadT<=0` 判定永不成立。修复：`tank_mvp.html:1129` 在 entities 循环顶部加 `if(e.id !== 'player' && e.reloadT > 0) e.reloadT = Math.max(0, e.reloadT - dt);`（player 保留 L1061 单独递减避免双递减、保持 `tryFire` 同帧时序；dummy 无开火路径恒为 0，无操作）。敌人/友军/Boss/召唤物统一恢复持续装填开火。
- **#22 正式 run 混入测试靶车（修复）**：根因 = `enterBattle` 清场显式保留 `dummy`（`e.id !== 'dummy'`）+ auto-revive 逻辑无条件生效。修复：`tank_mvp.html:557-569` 新增幂等 helper `detachDummyFromBattle`（splice 移出）/`restoreDummyToBench`（player 之后原位插回）；`enterBattle` 开头 detach、`watchFlow` 非 battle 态（map/结算/阵亡/奖励）restore；bench 模式（`!run`）零变化。选「数组缺席」方案使渲染/炮弹/垂直剖面/碰撞/得分/小地图所有 entities 循环自动绕开，无遗漏；L571 守卫留作防御性死代码。靶场控制台直接引用 dummy 对象，run 中操作仍生效（恢复带出）。
- **#24/#25/#26 修复（2026-08-19）**：见 §2.12（视口驱动 `nodeScaleFor` + 模板扩至 7 个 items 12~25 + 剔除随难度递减）与 §5.6（typecheck 0 错误）；mvp 侧 `generateRun(seed, count, { viewport: {vw, vh} })` 接线待做（接线前回退旧 nodeScale=3）。
- **卡牌效果逐卡守门（新测试套件）**：`scripts/test-card-effects.js`（420 断言）挂进 `npm test`（21 → **22 套**）——111 张卡逐卡 fresh tank 执行 `applyCardEffects`：79 张 modifier 卡数值增量与声明 add/mult 一致（含 8 种 armor 路径、17 个 stat 键、无未声明副作用）、32 张非 modifier 卡结构合法 + 入队保真（`tank.cardEffects` 含 cardId+args）、maxStacks 堆叠不溢出；非 modifier 运行时行为标 TODO 随 P-17/M10 接线补齐（后记 2026-08-22：ability/drone 已由 P-17 落地，见 §3.22；ammo/economy 类运行时消费仍未接线，ammo 卡与 loadout 键集求交见 §6 条目 27）。`package.json` npm test 链 + `scripts/check-html.js` 冒烟清单同步注册。
- **浏览器冒烟测试固化（P-26 工具链子项，2026-08-19）**：新 `scripts/test-browser-smoke.cjs`（10 项断言）挂 `package.json` `test:browser`（**不并入 npm test**，需要系统 Edge）——在真实浏览器内回归验证 ISSUES #22/#23/#24 的修复行为（dummy 分离/恢复、视口驱动缩放、敌人装填开火循环）。
  - **原理**：playwright-core + 系统 Edge（`chromium.launch({ channel: 'msedge', headless: true })`，零浏览器下载、复用系统安装）。
  - **关键技巧（IIFE 截获）**：tank_mvp.html 主脚本是 IIFE，`flow/cam/run/shells` 闭包私有、evaluate 不可达；通过主世界 `addScriptTag` 包装全局函数（`generateRun`→run、`transition`→flow、`viewBounds`→cam、`resolveHit`→玩家命中计数）截获闭包对象；`entities` 是全局 const（tank_entity.js）可直接访问（详见脚本头注释）。
  - **服务自管理**：8000 空闲则 spawn `node server.js`（被非本项目服务占用时 PORT=8123），finally kill；复用已运行的本项目服务。
  - `scripts/check-html.js` 已注册该文件语法冒烟（无需浏览器）。
- **验证**：`npm test`（22 套）+ `npm run check`（语法 + typecheck 0 错误）+ `npm run test:browser`（10 项断言 ALL PASS）全绿。
- **环境备注（MCP 配置坑，非代码问题）**：opencode 用户配置（`E:\data\onedrive\opencode\config\opencode.jsonc`）里 playwright MCP 的 `--browser channel=msedge` 是无效值——playwright-mcp 0.0.79 的 `resolveBrowserParam()` 是严格 switch，`channel=msedge` 落入 default 返回空 → 回落到默认 `channel="chrome"` → 找 `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe` → 报「Chromium distribution 'chrome' is not found」（看似缺浏览器，实为参数无效）。已改为 `--browser msedge` 修复。**报错信息误导性强，防复发**：MCP 浏览器参数按 `--browser <channel>` 直传（如 `--browser msedge`），不要用 `channel=` 前缀。

#### 3.16 坦克纹理化接线（P-27，2026-08-19 会话；设计见 §2.10）
- **全链路接线**：`paintPartTextureDirect`（`js/tank_paint.js`）在 base 填充后、clip 内调用 `TEXTURE_DEFS[opts.texture].draw(ctx, bbox)`（`opts.texture` 缺失/`none`/未知键/`faded` 跳过）；`paintPartTexture`（L262）把 `opts.texture` 透传 `getCachedTankSprite` 第 6 参 → **缓存 key 含 texture 段**（key = color+kind+hasTurret+heightClass+texture+verts），不同纹理同几何不互相污染。
- **数据链路**：`makeTank` 默认 `texture:'none'`；`applyTankConfig` instanceFields 加 `texture`（旧 JSON 无字段 → 缺省 none，向后兼容）；`tank_schema.js` 新增 `TEXTURES` 枚举 + FIELD_ROWS「纹理」sel 行（设计器/compare 共用单一来源）；`tank_designer.html` 外观件面板加「表面纹理 Texture」下拉（`#textureSelect`：切换即时生效、保存入 JSON、载入回显）；`tank_battledraw.js` 渲染入口传 `t.texture`；`tank_compare.html` 缩略图同步传 texture。
- **内容分配**：tiger-I=weld_seam、Obj 780=armor_plate、Leapard_1=camo、dummy=rust（new_tank 缺省 none）。
- **Node 测试**：`scripts/test-tanks.js` 每文件断言 texture 存在时为已知键（`TEXTURE_KEYS` 优先取 `require('../js/tank_paint.js').TEXTURE_DEFS`，静态兜底防加载失败）。
- **验证**：`npm test`（22 套）全绿（含新 texture 断言）；`npm run check` 语法冒烟全绿（`missing: index.html/tank_bench.html` 为他人未提交 check-html.js 变更引入的既有失败，与本节无关）；typecheck 0 错误（`types/globals.d.ts` 补齐 paint 系列与 `TEXTURE_DEFS` 声明）；`npm run test:browser` 全绿；浏览器验收脚本 ALL PASS——mvp 战斗中 player.texture=none / enemy_0_0=rust（来自 tank JSON）、缓存 key 含正确 texture 段、同几何异纹理 key/像素互异、主色保持（蓝通道主导：none=44,68,120 / rust=45,67,116 / camo=40,61,102）、设计器载入 tiger-I 回显 weld_seam、切换 camo 画布即时生效、保存→回读→恢复 round-trip 完好（其他字段无破坏）、零 console/page 错误。
- **车型多样性几何模板未做**：`tanks/` 条目仍共用箭镞车体+豹2A6炮塔模板（差异只在数值与纹理），留待 §6 条目 11 剩余项。

#### 3.17 三入口拆分 + 伤害飘字 + 玩家状态/开发者面板（P-15，2026-08-19 会话；设计见 §2.15）
- **三入口拆分**：新增 `index.html`（首页：正式游戏 / 装甲测试台两卡片 + 设计器 / 对比链接）、`tank_bench.html`（装甲测试台独立页：player + dummy 靶车、发射解算面板、靶场控制台）；`tank_mvp.html` 重写为正式游戏页（移除 dummy / 靶场控制台 / 左栏 solution + log，保留 NEW RUN / 节点链 / 结算 / 卡牌 / Boss / AI / 复活 / 经济 / 小地图）；`server.js` '/' 路由改指 index.html 并列出四页（L166/194/196）；`scripts/check-html.js` 注册 5 页面冒烟（L67，含新增两页）。**回归修复**：重写时遗漏的 mouseWorld / canvas 事件监听已补回（`tank_mvp.html` L376-383）。
- **伤害飘字**：新模块 `js/tank_dmgtext.js`（纯逻辑双端导出：dmgTexts / DMG_TEXT / spawnDmgText / updateDmgTexts / drawDmgTexts，life 0.9s / rise 30px / 五色语义，见 §2.15）；`scripts/test-dmgtext.js`（13 断言）挂进 `npm test`（现共 **23 套**）与 check-html 冒烟清单；mvp / bench 两页接线——DOT 灼烧橙（L1125）、跳弹蓝（L1299）、击穿 / HE 黄伤害数（L1309）、未击穿白（L1311）；`js/tank_physics.js` `applyModuleDamage` 返回值补 `dmg` 字段。
- **玩家状态面板**：TAB 切换 `#statusPanel`（L193/411-425），读 `player.stats` 显示火力 / 机动 / 散布 / 装甲分布。
- **开发者面板**：F12（或反引号键）切换 `#devPanel`（L206/428-465）——超级精度开关（`devAim.zeroSpread`：开火 sigma 归零 L894 + 每帧缩圈 L1064）、数值临时调整控件（`devOverrides` 实时改穿深 / 伤害 / 装填 / 极速 / 马力 + 重置，L439-462）、调试日志 / 发射解算收纳。
- **弹种 4（HEAT）**：数字键 4 切换 HEAT（P-16 已接入，见 §2.6/§3.19）。
- **验证**：`npm run check` 全绿（语法 + typecheck + 5 页面冒烟，§3.16 提及的 index.html/tank_bench.html 注册缺失已消除）；`npm test` 23 套全绿（含 test-dmgtext）；`npm run test:browser` 15 项全绿。

#### 3.18 烟幕射击（P-17 子目标 2，2026-08-20 会话；设计见 §2.5 第 8 条）
- **核心逻辑（`js/tank_cover.js`）**：动态区域烟雾——`smokeClouds` 数组（每团 `{x, y, radius, life, maxLife}`）+ `spawnSmokeCloud(x, y, radius, durationSec)`（参数缺省读 `RULES.smoke`，达 `maxClouds` 上限滚动丢弃最早一团）+ `updateSmoke(dt)`（逐帧递减 life、到期 splice 移除、返回是否仍有烟）+ `clearSmoke()` + `smokeBlocksLoS(ox, oy, tx, ty)`（线段-圆距离判定）；`hasLineOfSight` 已接入烟雾检查（射线穿越烟雾云 → false，在灌木/树冠 `vision` 检查之后）。纯逻辑可 Node 测，视觉渲染由接入层消费 `smokeClouds` 绘制。
- **配置（`js/tank_rules.js`）**：`RULES.smoke = { radius: 120, duration: 5, maxClouds: 8 }`（见 §5.5）。
- **AI 回滚（`js/tank_ai.js`）**：旧的坏逻辑（持卡即全图隐身）已删除；AI 走 `ctx.hasLoS`（mvp `tank_mvp.html:1154` 传 `hasLineOfSight`）→ 烟雾自动阻断 AI 索敌，无需 AI 层特判。
- **mvp 接线（`tank_mvp.html`）**：
  - F 键发射烟幕弹（`tryFireSmoke`/`fireSmokeShell`，玩家专属，与 `fireTank` 分离不共享弹种表）：速度 `shellSpeed×0.7`、装填 `stats.reload×0.8`、pen/dmg 恒 0、`canBounce:false`、散布 sigma×1、保留炮管贯穿掩体检测同口径。
  - `shells.forEach` 的 `ammoKey==='smoke'` 分支（L1256）：在任意终结条件处 `spawnSmokeCloud(detX, detY)` 引爆——坦克接触（敌对目标 raycast，不伤害）/ solid·single 掩体命中 / 半高掩体垂直判决拦截 / 射程耗尽 / 出界；不 `damageCover`、不 `resolveHit`。
  - `update(dt)` 内调 `updateSmoke(dt)`（L1475，受 simulating 门控）；`draw()` 在 `drawFoliage` 之后渲染径向渐变灰团（alpha 随 `life/maxLife` 淡出、`aabbInView` 剔除）；`enterBattle`/reset 时 `clearSmoke()`（L516/789）；HUD 提示条含 `· F 烟幕弹`。
- **测试（`scripts/test-covers.js`）**：新增 32/33 两组共 11 条烟雾断言（穿烟遮视线 / 偏离畅通 / 不遮弹道 getExposure=1 / 到期消散 / 上限 8 / 清空）——全绿。
- **验证**：`node scripts/test-covers.js` 全绿、test-ai 全绿、`npm run check` 语法冒烟全过（typecheck 仅 2 个预存在 bake-assets.js TS2307）、浏览器冒烟 ALL PASS。

#### 3.19 弹种系统：HEAT/HE（P-16，2026-08-19 会话；设计见 §2.6）
- **配置源**：`js/tank_rules.js` `ammoTypes` 四弹种表（ap/apcr/heat/he，heat/he 为 P-16 新增；数值见 §5.5 弹种行）。
- **resolveHit 消费路径（`js/tank_physics.js`）**：`shellAmmoKey(shell)`（`shell.ammoKey` 优先，回退 `shell.ammo.key`）取弹种 → `ammoCfg.noBounce` 跳过跳弹（θ>70°）与角度 BLOCK 分支，直接按穿深判定（L59-89）→ `splashRadius>0` 时**击穿/未击穿两支都触发** `applySplashAt`（entities 注册表范围衰减伤害）并附 `res.splash` 元数据（L92-128）；HE 未击穿残余爆轰 `dmg × max(0.25, 0.5×pen/eff)`（确定性公式，不做随机；无敌目标不扣血，L99-105）。
- **mvp/bench 接线（`tank_mvp.html` / `tank_bench.html`）**：`fireTank` 按 `RULES.ammoTypes[shooter.ammoKey] || RULES.ammoTypes.ap` 消费弹种系数（pen/speed/dmg/spread/noBounce/splashRadius，L892-893），`ammoKey` 随弹携带供 resolveHit 判定（L914）；**数字键 1/2/3/4 切弹种**（`AMMO_KEYS = {'1':'ap','2':'apcr','3':'he','4':'heat'}`，L354，HUD `#ammoIndicator` 色点+标签）；预测面板随弹种修正（穿深 ×ammo.pen、noBounce 弹种过陡角不跳弹，L1072-1073）；HE 破障 `splashCoversAt(s.x, s.y, RULES.breach.heSplashRadius)`（L1471）；HE 爆轰特效 `burstExplosion` scale = splashRadius/40 与逻辑半径严格一致（L1434-1440）。
- **验证**：`scripts/test-extreme-combat.js` §12 组（12.1~12.7）7 项边缘断言——表结构与系数（heat pen 1.4/speed 0.8/spread 1.2/noBounce、he pen 0.7/speed 0.95/splashRadius 90/noBounce、ap/apcr 未动）、HEAT θ=75° 大角度不跳弹直接击穿（dx/dy 不被反射、canBounce 不消耗）、HEAT 1.4× 穿深击穿对照（基准 100→140 vs 正面 110）、HE 不跳弹 + splash 元数据、HE 未击穿残余爆轰（公式可验/地板 0.25/无敌免疫）、HE 范围溅射（近距衰减/边缘 0/半径外无伤/主目标不重复）、AP/APCR 跳弹回归；`npm test` 全绿；浏览器冒烟 `scripts/test-browser-smoke.cjs` 断言「数字键 4 切换 HEAT（P-16 实装）」。

#### 3.20 数据/工具链修复（2026-08-20 会话）
- **水域 tier 描边色合法化（`js/tank_rules.js:91`）**：`coverTiers.water.stroke` 原为 `'#3b8esl'`（`s`/`l` 非法十六进制字符，Canvas 忽略该描边），改为 `'#409ce1'`——与 fill `rgba(64,156,225,0.5)`（= #409CE1）同色系的水域蓝，行尾注释标注。
- **test-audio.js 断言动态化（`scripts/test-audio.js`）**：P-21 M2 升级后 SOUND_DEFS 从 8 键扩展至 **13 键**（新增 engine/trackFx/flyby/ammoBlewAP/ammoBlewHE），旧断言「恰有 8 键且无多余键」失效（2 项失败）。改为动态对齐：① 键数 ≥ 历史基线 8（只增不减）；② 8 个历史必需键仍在（旧调用方 `playSound('fire')` 等兼容性保障）；③ 键名无重复；④ 每键参数完整性由 `validateSoundDefs`（0 问题）+ 逐键结构抽查（label 非空 / bus 分级 / layers 非空 / gain>0 / 每层 dur·gain>0）覆盖。
- **bake-assets.js 可选依赖降级（ISSUES #61 完结，`scripts/bake-assets.js`）**：playwright 是可选工具链依赖；改为 `tryRequire('playwright')`（模块说明符走运行时字符串，tsc 不做静态解析——两个 TS2307 消失，`npm run typecheck` 0 错误）。未安装时打印提示（改用 `tools/bake.html` 手动烘焙）并退出码 1，不 crash；已安装时行为不变（`playwright.chromium.launch({ executablePath, headless:'new' })` 驱动系统 Edge）。
- **验证**：`node scripts/test-audio.js` 84 断言全绿（exit 0）；`node scripts/bake-assets.js` 降级路径提示 + exit 1 无异常；`npm run check`（语法冒烟 + typecheck）全绿。

#### 3.21 无人机体系（P-17 子目标 4 阶段 2，2026-08-20 会话；设计见 §2.2）
- **纯逻辑 `js/tank_drone.js`**（无 DOM/Canvas，Node 可测）：模块级 `drones` 数组为单一数据源（镜像 `tank_dmgtext.js` 的 `dmgTexts` 惯例）；实体字段契约 `{id:'drone:<n>', isDrone:true, kind:'scout'|'striker', team:owner.team, owner, x, y, hp, maxHp, _dead, orbitPhase, fireT}`。
  - `spawnDrone(owner, kind, opts)`：kind 缺省/非法 → `striker`（兼容旧数据）；`countMax` 超限拒绝返回 null（不替换最旧）；`opts.registry` 显式镜像进 `entities` 注册表（阶段 3 接线用；届时需给 `resolveTankCollisions`/`aiDecide` 循环补 `isDrone` 跳过守卫——无人机无 hull 几何字段）；`opts.phase` 可指定初始环绕相位（确定性测试）。
  - `updateDrones(dt, ctx)`：环绕（相位推进 + 指数阻尼 `k=1−exp(−orbitLerp·dt)` 收敛，不依赖 `driveTank`）；striker 索敌（`ctx.enemies` 或 `ctx.entities` 阵营过滤；strikeRange 内最近、hp>0、`invulnT<=0` 目标）；`fireT` 仅在有效目标存在时累积，到 `fireInterval` 输出 `{type:'droneFire', drone, target, damage}` 并归零；**目标丢失 → fireT 冻结不清零**（重新锁定延续剩余计时）；owner 阵亡 → 自动移除；dt<=0 无操作。
  - `droneIndicators(cam, entities)`：纯计算视口外敌军指示——仅当存在存活 scout；视口内（`aabbInView` 语义，含 64px 外扩余量）不指示；距任一 scout ≤ `scoutRange` 才输出 `{x, y, angle, dist, team, kind}`（世界坐标 + 相对视口中心的方向角/距离）；**striker 不提供指示**（侦察能力专属 scout）。
  - `droneDamage(d)`：`round(dmgMult × owner.stats.damage)`（无 stats 回退基准 100）；`clearDrones(owner)`（缺省全清，联动 registry 镜像移除）；`countDrones(owner)`/`droneConfig()`/`DRONE_KINDS`。
- **配置（`js/tank_rules.js`）**：`RULES.abilities.drone` 在阶段 1 契约基础上补 `orbitSpeed: 1.2`（rad/s）与 `orbitLerp: 6`（收敛 λ）两个环绕键（见 §5.5）。
- **测试（`scripts/test-drone.js`）**：57 断言、14 组——spawn 契约/kind 回退/countMax/registry 镜像；环绕收敛（静止与 owner 位移后 dist≈orbitDist±3）；开火计时（累积/到点/归零/出范围冻结/回范围延续）；已毁/无敌目标不索敌、无敌结束恢复；scout 不攻击；droneIndicators（视口剔除/角度距离/scoutRange 过滤/空数组/fake cam/null 安全）；clearDrones；owner 阵亡移除；dt<=0/无 ctx 鲁棒；droneDamage 语义；droneConfig 读 RULES。挂进 `npm test` 链尾 + `scripts/check-html.js` 冒烟清单 + `types/globals.d.ts` 声明同步。
- **验证**：`node scripts/test-drone.js` 57 断言全绿（exit 0）；`npm run check`（语法冒烟 + typecheck 0 错误）全绿；`scripts/test-qa.js` 对 test-drone.js 零问题（合规 4 种边界模式；QA 链首基线失败为 ISSUES #27~#57 已登记待处理，与本模块无关）；跳过 test-qa.js 后 `npm test` 链其余 24 套全绿。
- **阶段 3 待办（未动 tank_mvp.html）**：mvp 接线——卡牌 `cardEffects` 部署（`applyCardEffects` 已入队 `{type:'drone', kind, cardId}`，按 `cardStackCount` 计数 ≤ countMax 生成）、`updateDrones` 接入战斗循环、`droneFire` 事件结算（复用 `fireTank` 或直接伤害）、指示箭头/小地图标记绘制、`entities` 注册与 `isDrone` 守卫、revive 后按 cardEffects 重新部署。

#### 3.22 战术卡牌能力 mvp 接线（P-17，2026-08-20；设计/纯逻辑层见 §2.2 / §2.13 / §3.21）
- **主动能力统一入口（`js/tank_abilities.js`, `js/tank_shield.js`, `js/tank_strike.js`，纯逻辑）**：`ABILITY_KEY_HINT`（artillery=炮击支援 G / shield=战术护盾 H(Shift+H 全向) / overdrive=超级装填 V）；`tryActivateAbility(t, key, ctx)` 持有检查（`tank.cardEffects` 含 `{type:'ability',key}`）+ 共享冷却 `t.abilityCdT`（readout `updateAbilityCd`）；callStrike 延迟 AOE（delay 2.5 / radius 110 / dmgMult 1.2 / shellCount散布连射 stagger 0.15 / maxStrikes 滚动丢弃）；applyShield 累计吸收（absorbCap 150 总池，入射角 `shieldAbsorbs` 在 resolveHit 前判定，穿透伤害续结算）；overdrive addTimedModifier reload mult 0.45 6s + 立即清零 reloadT。
- **mvp 接入（`tank_mvp.html`）**：L1224-1226 G/H/V 按键（玩家专属；炮击/护盾挂 reloadT+immobT 门控，V 仅 immobT；炮击落点鼠标 world 坐标）；`update` 入 `updateStrikes(dt, entities)`/`updateAbilityCd(player,dt)`（simulating 门控）；shells 循环护盾吸收判定（L1491-1516，全额吸收销毁弹，部分穿透 `s.dmg=bleed` 续结算，破裂播特效）；`ammoKey==='smoke'` HE 破障跳过已吸收（`!s.absorbed`）；`enterBattle`/reset/死亡清 `clearStrikes()`+`player.shield=null`（冷却跨节点保留）；AI 循环 `if(e.isDrone) continue`（L1243），debuff 循环 `if(e.isDrone) return`（L1277），tank draw `if(t.isDrone) return`（L1775）+ `drawDrones`（L1664，悬浮/旋转翼/scout天线/striker炮管）+`drawDroneIndicators`（L1713，屏幕边缘箭头）；`pickCard` 部署/提示（deployDronesFromCards L637，ABILITY_KEY_HINT L1037-1041）；hintBar 追加 `· G 炮击 · H 护盾(Shift+H 全向) · V 超装填`（L168）。strikeHit 落弹播 `burstExplosion(scale=radius/40)`+`spawnImpactFx('he')`+`playSound('ammoBlewHE')`+ dmgText 飘字；droneFire 消耗 `target.hp -= damage` 后经既有击杀检测计分 —— 无人机不消耗玩家弹药/装填。
- **验证**：`scripts/test-abilities.js` 76 断言 + `scripts/test-drone.js` 57 断言 + `scripts/validate-content.js`/`audit-content.js --strict` 全绿；`npm run check`（syntax smoke + typecheck 0 错误）；`npm run test:browser` 23 断言 ALL PASS（mvp/bench 无 console/page 错误）。`npm test` 仅链首 `test-qa.js` 静态合规自检失败（ISSUES #27~#57，13 脚本缺 require/shim，非 P-17）——跳过后余 26 套全绿；test-abilities/test-drone 被 test-qa.js 判定 `compliant`。

#### 3.23 地图生成缺陷与边界修复（2026-08-21 会话）

以下 8 项地图生成与边界缺陷经排查修复并完全通过验证（全部经 `npm run check` + `node scripts/test-covers.js` + `npm test` 24 套测试 exit 0）：

- **玩家出生点可落水域/掩体内（HIGH，已修复）**：`js/tank_map.js` `makeNode`（原约 L122）原本只对敌人/据点做掩体排斥，玩家出生点 `{x:w*0.10, y:h/2}` 无 cover/water 检查；新增内部 `findPlayerSpawn` helper（约 L215），用 `pointInCover` 确定性重定位到无障碍点。根因：反向排除（units-off-cover）只作用于敌人/据点、遗漏玩家。
- **水域随机采样压在沙包/树/灌木/栅栏上（HIGH，已修复）**：`js/tank_nodegen.js` `generateNode` 水体/桥梁块新增自包含 `rectHitsCover` AABB 辅助 + 拒绝采样（网格扫描 + rng 相位，最多约 2240 候选；无空位则跳过该水体）；水体尺寸下限降至 0.5×cap（保留 ≤40% 最大 cap）。根因：water 作为 `RULES.coverTiers` 条目在 covers 之后由独立 RNG 放置、无重叠测试。
- **桥条带越出节点北边界（MED，已修复）**：`js/tank_nodegen.js` 桥梁 Dy 钳制现计入桥梁自身半高（`bridgeHalfH = waterH/scale/2`），钳制区间改为 `[-(halfH-bridgeHalfH), (halfH-bridgeHalfH)]`。根因：旧钳制在中心、忽略桥梁自身半高。
- **水域绘制盖住下层掩体（MED，已修复）**：`tank_mvp.html` 掩体绘制循环改为 `water` → `bridge` → 其它 covers 顺序。根因：water 追加于 `outCovers` 末尾并按数组顺序绘制、无 z 排序。
- **`pointInCover` 几何判定加固（MED，已修复）**：`js/tank_map.js` `pointInCover` 引入旋转与 verts 多边形碰撞判定（射线相交/本地坐标反旋转 AABB/OBB 判别），消除旋转掩体与凸多边形掩体盲区。
- **敌军生成数量保底机制（MED，已修复）**：`js/tank_map.js` `makeNode` 在密集水域/掩体导致随机采样达到 `guard < 400` 上限时启用确定性网格扫描回退（grid fallback），确保敌军生成数量 100% 达成不被静默削减。
- **复活点避开敌军（MED，已修复）**：`js/tank_revive.js` `findReviveSpot` 扩充可选 `enemies` 参数与敌军安全距离判定；`tank_mvp.html` 复活逻辑传入当前存活敌军列表，避免玩家复活在敌群近身。
- **模板静态自重叠修复（LOW，已修复）**：`js/tank_nodegen.js` 修正内置模板 `mixed_barrier_plaza` 中树桩与栅栏的静态坐标重叠（树桩 `dy` 从 -140 调整为 -110）。

#### 3.24 模块代码质量与架构缺陷修复（2026-08-22 会话，ISSUES #61~#74）

> ⚠️ **2026-08-22 复核更正**：本节 #61/#62/#63/#64/#70/#71/#74 经逐文件比对**缺失于当前工作区**（#65/#72 高概率缺失；#66~#69、#73 确认存在），详见 `ISSUES.md` **#75**。下文各条"已修复"表述以 ISSUES #75 复核结论为准，待按归档原文重做修复后本注记方可移除。

以下 14 项共享模块代码质量与物理/逻辑缺陷经排查修复并完全通过验证：

- **`tank_model.js` 动态加速度/刹车受 Modifier 联动（#61，已修复）**：`s.accel` 与 `s.brake` 改在 modifier 循环处理完成后基于最新的 `stats.enginePower` 与 `stats.weight` 动态派生，确保影响马力或车重的卡牌/升级能正确改变移动加速度与刹车物理。
- **`tank_cards.js` `cardStackCount` 准确计数（#62，已修复）**：`cardStackCount` 改为按 `tank.cardEffects` 实体数组与卡牌 ID 精确统计，解决多 modifier 卡重复计数及纯非 modifier 卡（如 ability/drone）计数归零的缺陷。
- **`tank_economy.js` `applyUpgrades` 挂起刷新（#63，已修复）**：重构 `applyUpgrades` 循环叠加过程，采用批量修饰模式仅在最后统一触发一次 `refreshStats`，消除开局与 Run 启动时数十次冗余 `structuredClone` 与 GC 损耗。
- **`tank_cards.js` `AMMO_KEYS` 补齐 'heat'（#64，已修复）**：`AMMO_KEYS` 补齐 `'heat'` 弹种，与 `RULES.ammoTypes` 保持一致，使修改破甲弹属性的卡牌能正常通过 schema 校验。
- **`tank_model.js` `moduleMult` 零值判断与死代码清理（#65，已修复）**：`moduleMult` 判空改为显式类型/存在性检查，支持设置 0 倍率模块伤害；清理 `tickDebuffs` 中未使用的死变量 `alive`。
- **`tank_camera.js` `clampCamera` 缩放适配（#66，已修复）**：`clampCamera` 计算视口半宽高时计入 `cam.zoom`，修复非 1.0 缩放比例下摄像机边界钳制不准的问题。
- **`tank_nodegen.js` 预损倒树残骸尺寸缩放（#67，已修复）**：`generateNode` 生成预损树木（tree → fallen）时正确应用 `residueW`/`residueH` 比例缩放，恢复倒树应有的细长障碍物轮廓（38x14）。
- **`tank_minimap.js` 小地图视口框 Canvas 裁剪（#68，已修复）**：`drawMinimap` 绘制摄像机视口矩形时增加小地图框体 clip 保护，防止视口框在世界边缘或拉远时溢出 UI 边界。
- **`tank_assets.js` `ASSET_CACHE` 尺寸量化与无界增长防范（#69，已修复）**：`ASSET_CACHE` 缓存 Key 尺寸统一使用整数取整，避免浮点数导致离屏 Canvas 缓存无界膨胀。
- **`tank_move.js` AI 履带修复状态重置（#70，已修复）**：`driveTank` 在 `immobT` 归零时自动清除 `t.trackBroken = false`，确保 AI 坦克修复后正确清除断履 visual 与 Dirty 状态。
- **`tank_fx.js` 特效数组生命周期更新与渲染（#71，已修复）**：`updateFx` 补齐对 `shockwaves` 与 `scorchMarks` 的逐帧更新与到期过滤，并接入绘制管线，防止数组无限堆积。
- **`tank_battledraw.js` 附件数组安全校验（#72，已修复）**：`drawTank` 遍历 `t.attachments` 前增加存在性守卫，防止渲染未定义附件字段的坦克时抛出异常。
- **`tank_geometry.js` `turretFrontDist` tVal 范围钳制（#73，已修复）**：`turretFrontDist` 交点参数 `tVal` 增加 `[0, 1]` 范围钳制，消除临界水平线微小浮点误差导致的超界交点。
- **`tank_halfgeom.js` `halfFromFull` 逆时针顶点正向化（#74，已修复）**：`halfFromFull` 处理 CCW 顶点输入的完整多边形时强制转为 CW 顺序，防止半形几何中心化与装甲面映射倒置。

#### 3.25 局外流程闭环与存档/配置体系（M10 扩展 / P-22，2026-08-22 会话；设计见 §2.16）

- **多存档系统（`js/tank_economy.js`）**：元索引 `rogue-tank-saves-meta`（{activeSaveId, saves:[{id,name,updatedAt}]}）+ 槽位键 `rogue-tank-save:<id>`；新 API `listSaveSlots`/`createSaveSlot`/`deleteSaveSlot`/`renameSaveSlot`/`setActiveSaveSlot`/`loadActiveProfile`/`saveActiveProfile`/`migrateLegacySave`/`buyExtraRevive`（storage 显式注入，Node 可测）；profile 新增 `selectedTankId`/`ammoLoadout`(≤3)/`bonusRevives` 字段校验；`loadProfile`/`saveProfile` 变薄委托（mvp 零改动兼容）；legacy 单键自动迁移为「默认存档」且永不删除旧键；saveVersion 未动。mvp Home 界面：槽位卡（名称/局数/击杀/点数/最后游玩，active 高亮）、新建/选择进入/重命名（行内 input）/删除（两段式确认）。
- **流程状态机扩展（`js/tank_flow.js`）**：FLOW_STATES 增 home/loadout/shop；白名单 home:['loadout','home']、loadout:['shop','map','home']、shop:['map','loadout','home']、gameover:['map','home']；`createFlow(initialState?)` 缺省 'map' 向后兼容；restartRun 局外三态 no-op 返回 runId。
- **出战坦克与弹药选配**：Loadout 界面 `fetchTankList` 坦克卡（选定写 `profile.selectedTankId`）；`RULES.ammoTypes` 复选框 ≤3 上限拒绝第 4 个、≥1 才可出击。战斗内数字键 1/2/3 索引化切 `player.ammoLoadout` 槽位（越界忽略）、Q 环形循环、HUD 弹药槽位组（键位/弹种名/倍率/色点/激活高亮）；`fireTank` 按 `shooter.ammoKey` 结算（弹道管线零改动）；无 loadout 兜底 = 全弹种表（调试直开战斗态等价旧行为）；AI/Boss 不受影响。
- **局前永久升级商店**：UPGRADE_DEFS 八项卡片（等级/费用/置灰逻辑）+ `buyExtraRevive` 复活购买项 + points 实时刷新；出击路径统一 `beginRunFromMenu()`：校验 → 清 run modifiers → `applyTankConfig(player, selectedTankId)` → `applyUpgrades` → revives=基础2+bonusRevives → ammoLoadout 预挂载 → generateRun → transition('map')。gameover 界面新增「返回首页」。
- **附带修复 4 个真 bug**：
  1. **applyUpgrades 永久修饰器跨局叠加**：原每次开局无条件叠 permanent modifier → 出击准备阶段先剔除 `source='upgrade:*'` 再重挂（prepPlayerForRun）；
  2. **死亡商店复活购买无效**：原直接 `player.revives++` 但下次出击被重置（购买不生效）→ 改走 `buyExtraRevive` 记入 `profile.bonusRevives` 持久化；
  3. **resetEntity 不清 ammoKey**：跨局 HUD 高亮与实际弹种错位 → prepPlayerForRun 补 `player.ammoKey = loadout[0]` 同步；
  4. **test-economy updatedAt 断言毫秒竞态 flaky（~47%）**：白盒回拨时间戳 + 严格不等号手法硬化（此模式可作后续同类断言范式）。
- **验证**：`npm run check` exit 0；`npm test` 26 套件全绿跑到链尾；`npm run test:browser` 40 PASS / 0 FAIL（既有 #22/#23/#24 回归 + M10 断言 + 弹药切换断言三组全绿）；改动白名单干净。

---


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

6. ~~**难度曲线的具体参数**~~ **已定表（P-13）**：三杠杆收口 `RULES.difficulty`——难度曲线 `diff = curveStart(0.15) + curveSpan(0.8)·t^curvePow(1.25)`（单调 0.15→0.95，后段加速）；敌人数量 `1 + floor(diff·enemyCountMax(4))`；AI 策略复杂度档位 `aiTier = floor(diff·(aiTierMax(2)+1))`（0 基础索敌/1 主动贴近/2 协同，预留）；数值强度乘数 `statMult = 1 + (statMultMax(1.5)−1)·diff`（作用敌军 hp/穿深/伤害）。`tank_map.js` 的 `makeNode` 产 `aiTier`/`statMult`，`materializeNode` 经 `env.applyDifficulty` 应用。

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
  **已收尾（P-12，2026-08-15）**：修饰器带 `scope` 生命周期分类——`permanent`（默认，局外永久升级）/`run`（单局，`removeRunModifiers` 在 run 结束清除）/`timed`（`expiresAt` 到期 `refreshStats` 剪除）；卡牌 modifier（`applyCardEffects`）与 Boss 阶段 modifier（`applyBossStage`）均标 `run`；`addTimedModifier` 自动 `timed`。先加后乘由 `computeStats` 两遍扫描；同名叠层由 `source`（`card:<id>`+`maxStacks` / `boss-stage:<id>`）区分。**已收尾（M10，2026-08-22）**：局前永久升级商店落地，出击路径统一 `beginRunFromMenu()` 应用 `applyUpgrades` permanent modifiers（先剔除 `source='upgrade:*'` 旧修饰器防跨局叠加，见 §2.16/§3.25）。
- **已完成（2026-08-19）**：QA 测试基础设施重构——21/24 个测试脚本修复缺失 `require('../js/tank_utils.js')` / `require('../js/tank_rules.js')` 与全局 `global.TAU` / `global.RULES` Shim，QA 合规率从 11/24 提升至 24/24，`npm run check` + `npm test` 均退出码 0。详见 ISSUES #27~#39 修复记录与归档。
- ~~**摄像机 + 节点地图 + 小地图**~~：**已完成（P-08，2026-08-15，见 §2.12）**——摄像机跟随（玩家居中、世界边界钳制）、小地图层（掩体/实体/视口矩形标注）、完整节点生成（线性节点链：掩体布局复用 P-05 + scale、敌军构成、友军据点、§4.5 通关奖励）、视口 AABB 剔除、全局游戏流程状态机（map/battle/settlement/reward/gameover）与 UI 界面层约定（watchFlow 监听 → DOM 覆盖层）全部落地；剩余相关项：粒子池化（可选项）、难度曲线表细化（§6 条目 12）。

### 5.2 中优先级（已实现——多边形碰撞盒）
- ~~**碰撞盒从"写死4边矩形"抽象成"任意多边形+具名装甲面"**~~：**已完成**。`hullPoly`/`turretPoly` 定义本地顶点+逐边 faceKey，`polyCorners`/`polyEdges` 提供世界坐标与外法线（质心法自适应绕行方向），`raycastTank`、`drawTank` 均已切换到多边形系统。矩形 `partCorners`/`partEdges` 保留给坦克矩形碰撞盒与无 `verts` 掩体的回退（掩体带 `verts` 时走 `coverCorners` 多边形，见 2.7）。所有坦克共用同一套多边形定义（箭镞车体+豹2A6炮塔）。

### 5.3 低优先级（纯表现层，随时可加，不影响任何结构）
- ~~履带转动动画（全宽/半宽可见）~~：**已实现**——`paintTracks` 以 `lineDashOffset` 滚动履带纹路，相位由 `advanceTracks` 按真实位移/转向累积（见 §3「坦克运动统一」）。
- 炮管后座动画
- 这两项与其他系统无耦合，可在任意阶段插入，无需提前规划。

### 5.4 尚无实现机制、不能只靠数值层解决的属性
以下属性已被列为"未来应可被卡牌/升级/技能影响"，但目前**功能本身不存在**，需要先实现机制才能接入 5.1 的 modifiers 系统：
- ~~**HE 弹种的范围伤害**~~ — **已实现（P-16，2026-08-19，见 §2.6/§3.19）**：三套并存——HE 对坦克/实体的范围溅射（`splashRadius`=90px，`dmg×(1−dist/radius)×0.5`）+ 未击穿残余爆轰（`dmg×max(0.25, 0.5×pen/eff)`）+ A3 破障溅射（半径 24px，只伤害可破坏掩体，见 2.7）。"HE 对坦克 = 纯倍率"的旧设计已废除。
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
| **弹种（`RULES.ammoTypes`，P-16）** |||
| ap | speed 1.0 / pen 1.0 / dmg 1.0 | 标准弹（基准） |
| apcr | speed 1.2 / pen 1.2 / dmg 0.8 | 高速弹（既有，非 P-16 新增） |
| heat | speed 0.8 / pen 1.4 / dmg 1.0 / spread 1.2 | HEAT 破甲：散布惩罚（1.2×）换 1.4× 穿深；noBounce 确定性不跳弹 |
| he | speed 0.95 / pen 0.7 / dmg 1.0 / splashRadius 90 | HE 高爆：低穿深；noBounce 确定性不跳弹；命中即爆轰（90px 溅射 + 未击穿残余爆轰） |
| noBounce | heat / he | θ>70° 跳过跳弹与角度 BLOCK，直接按穿深判定（AP/APCR 保持原跳弹语义） |
| HE 溅射公式 | dmg × (1 − dist/radius) × 0.5 | 贴脸 50%、边缘衰减到 0；主目标不重复；无敌/已毁目标免疫 |
| HE 未击穿残余爆轰 | dmg × max(0.25, 0.5 × pen/eff) | 装甲吸收爆轰残余能量扣血，地板 25%（确定性公式） |
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
| **伤害飘字（`js/tank_dmgtext.js`，P-15）** |||
| life | 0.9s | 飘字存活时长（到期移除；上浮进度 = age/life 线性） |
| rise | 30px | 全程上浮总高度（世界坐标） |
| 五色语义 | pen 红/橙 · block 白 · bounce 蓝/白 · he 黄 · dot 橙 | 击穿/未击穿/跳弹/HE 击穿或爆轰/DOT 灼烧；未知 kind 回退 pen |
| **烟幕（`RULES.smoke`，P-17 子目标 2）** |||
| radius | 120px | 单团烟雾遮挡半径（线段-圆距离判定） |
| duration | 5s | 烟雾持续时长（`updateSmoke` 逐帧递减 life，到期移除） |
| maxClouds | 8 | 场上同时存在的烟雾云上限（超限滚动丢弃最早一团，防滥用） |
| **主动能力（`RULES.abilities`，P-17）** |||
| artillery | delay 2.5s / radius 110px / dmgMult 1.2 / shellCount 3 / maxStrikes 3 / cooldown 15s | 战术炮击：区域延迟 AOE（复用 applySplashAt 衰减，排除 owner/无敌免疫） |
| overdrive | reloadMult 0.45 / duration 6s / cooldown 20s | 超级装填：爆发清零 reloadT + 6s 装填加速 |
| shield | dirDuration 8s / omniDuration 4s / arc π/3(60°) / absorbCap 150 / cooldown 25s | 战术护盾：累计吸收，入射角判定 |
| drone | scoutRange 700 / strikeRange 260 / fireInterval 2.0 / dmgMult 0.4 / orbitDist 90 / orbitSpeed 1.2 / orbitLerp 6 / countMax 2 | 无人机：orbital scout（视口外指示）+ striker（近身打击） |
| **局外流程闭环（M10 扩展，2026-08-22）** |||
| ammoLoadout 上限 | ≤3 种 | 出战弹药选配上限；≥1 种才可出击 |
| 出击复活次数 | base 2 + bonusRevives | `RULES.revive.baseRevives` + `profile.bonusRevives`（buyExtraRevive 购买，`RULES.economy.reviveCost`=40 点/次） |
| 存档存储键 | rogue-tank-saves-meta + rogue-tank-save:<id> | 元索引 {activeSaveId, saves[]} + 每存档独立槽位；legacy 单键迁移为默认存档且永不删除旧键 |
| 战斗内弹种切换 | 数字键 1/2/3 + Q 环形循环 | mvp 按 ammoLoadout 槽位索引切换（越界忽略）；tank_bench 保留全局直选全弹种（调试台语义） |

### 5.6 后续系统缺口（2026-08-13 规划讨论补充，归属里程碑见 §6）

新系统一律遵循现有工程惯例：「js/ 模块 + Node 测试 + `types/globals.d.ts` 同步」。

- ~~**玩家进度持久化（存档，归属经济里程碑）**~~ — **已实现（P-14）**：`js/tank_economy.js` 的 `loadProfile`/`saveProfile`（版本化 `{version, points, upgrades, stats}`，键 `rogue-tank-save`，版本不匹配/损坏回退默认）；写入时机 = 开局（runs++）与死亡（得分转化 + 购买后）。
- ~~**视线遮挡查询函数（归属敌人 AI 里程碑，AI 前实现）**~~ — **已实现（P-10）**：`js/tank_cover.js` `hasLineOfSight(ox,oy,tx,ty)`（`vision:true` 的灌木/树冠遮挡视线，与弹道穿透两套判定），已接入敌人 AI 索敌；Node 回归见 `scripts/test-covers.js` §31。
- ~~**声音系统（独立里程碑 M1，见 2.11）**~~ — **已实现（2026-08-15，P-07 完结）**：`js/tank_audio.js` Web Audio 程序化合成 8 类占位音效（开火/击穿/未击穿/跳弹/殉爆/履带断/起火/UI），后续替换为资产文件；见 §2.11/§3.6。
- **卡牌池/商店商品/永久升级树内容设计（归属经济里程碑）**：modifiers 管道就绪但无内容，纯设计工作。
- ~~**坦克车型多样性（归属坦克纹理化里程碑，见 2.10）**~~ — **已启动（2026-08-19，见 §6 条目 11 / PLAN P-27）**：`tank_paint.js` 的 `TEXTURE_DEFS`（5 种叠层）与缓存 key 含 texture 段已落地但未接线；接线与几何模板/配色内容收尾见 PLAN P-27。
- ~~**typecheck 门禁失效（2026-08-19 核实，ISSUES #26）**~~ — **已修复（2026-08-19，ISSUES #24~#26 一并完结，见 §2.12）**：188 个 TS2339 清零——8 个文件（`tank_camera.js`/`tank_flow.js`/`tank_map.js`/`tank_minimap.js`/`tank_nodegen.js` + `test-map.js`/`test-camera.js`/`test-flow.js`）JSDoc 参数/返回 `{object}` → `{any}`（仅注解、零运行时改动），`types/globals.d.ts` 补 `NodeGenOptions.scale`、`GeneratedNodeResult.w/h` 及 `pickTemplate`/`nodeScaleFor` 声明；`npm run typecheck` 0 错误、`npm test` 全绿。

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
   - **UI 界面层约定（5.6 捆绑）**：mvp 经 watchFlow 监听 → DOM 覆盖层（节点图/结算/卡牌三选一/阵亡）；卡牌内容占位（后由 P-09 接真实卡池，见条目 14）。
   - 节点切换流程：节点清空 → 结算（得分/无伤/限时/据点加成，见 4.5）→ 节点间商店与卡牌三选一 → 下一节点。
   - **剩余项**：敌人 AI 双态（条目 7）、复活状态机（条目 8）、难度曲线表细化（条目 12）。
7. ~~**敌人 AI 双态行为 + 友军据点（2.2 / 5.1）**~~ — **已完成（2026-08-15，P-10，见 §2.2/§3.10）**：
   - 入镜主动态：`js/tank_ai.js` `aiDecide`（索敌朝玩家转向/靠近/开火，开火复用 `fireTank` shell 管线）；范围外默认不活动；边缘靠近态（`RULES.ai.edgeMargin`=200px，开放问题 2 已量化）。
   - 友军据点：`aiDecideAlly` 消极防御（不追击/不巡逻）、可被摧毁；击杀敌人五折记分仍为开放问题 4（非阻塞，记分接入留待经济里程碑）。
   - 第一版敌人不主动找掩体（开放问题 1 保持开放）。
   - **视线遮挡查询函数（前置，5.6）**：`tank_cover.js` `hasLineOfSight`（`vision:true` 灌木/树冠遮挡视线，与弹道穿透两套判定）已实现并接入 AI 索敌。
   - Boss `summons` 伴随单位已生成并走同一敌对 AI；阶段行为由 `onEnter.modifiers` 自然产生。
8. ~~**死亡/复活状态机（2.3）**~~ — **已完成（2026-08-15，P-11，见 §2.3/§3.11）**：永久死亡 + 复活次数（基础 2，`RULES.revive.baseRevives`）+ 满状态复活于友军据点旁随机无障碍点 + `invulnSeconds`=3s 无敌（`js/tank_revive.js` + mvp 死亡判定 + `applyModuleDamage`/DOT 无敌检查 + 无敌闪烁视觉）。追加复活次数的局前购买已由 M10 实现（`buyExtraRevive` → `profile.bonusRevives` 持久化，见 §2.16/§3.25）。
9. ~~**base/modifiers/stats 三层接线（5.1）**~~ — **已完成（2026-08-15，P-12，见 §5.1/§3.12）**：修饰器 `scope` 生命周期分类（permanent/run/timed）+ `removeRunModifiers`/`removeModifiersByScope`；卡牌与 Boss 阶段 modifier 标 `run`、run 结束清除。permanent 修饰器内容接入已由 M10 收尾（局前商店 + `applyUpgrades`，见 §2.16/§3.25）。
10. ~~**经济与数值落地（含存档）**~~ — **已完成（2026-08-15，P-14，见 §2.4/§3.14）**：击杀得分（`killScore`=20）+ 节点通关奖励（§4.5）+ 死亡转化（`scoreToPointsRatio`=10%）+ 版本化存档（`loadProfile`/`saveProfile`）+ 永久升级树（8 项 permanent scope，cost/maxLevel）+ 死亡后商店（买永久升级/复活次数）+ 开局 `applyUpgrades`。剩余：节点间商店（消耗品/临时强化）与卡牌刷新费 UI（局内商店界面留待后续）。
11. ~~**坦克纹理化接线**~~ — **已完成（2026-08-19，P-27，见 §3.16）**：`texture` 字段 + 多边形 clip 平铺图案叠层（保持 `t.color` 主色）已全链路接线（`paintPartTextureDirect`/`paintPartTexture` 透传/tank JSON/schema FIELD_ROWS/设计器选择器/battledraw/compare 缩略图，缓存 key 含 texture 段不互相污染）；4 型坦克已分配纹理（tiger-I=weld_seam、Obj 780=armor_plate、Leapard_1=camo、dummy=rust）。**剩余：车型多样性几何模板**（`tanks/` 条目目前共用箭镞车体+豹2A6炮塔模板，差异只在数值与纹理；继续以条目 11 追踪）。
12. ~~**难度曲线表**~~ — **已完成（2026-08-15，P-13，见 §4 开放问题 6/§3.13）**：三杠杆定表 `RULES.difficulty`（曲线/敌人数量/AI 档位/数值强度），`makeNode` 产 `aiTier`+`statMult`、`materializeNode` 应用数值强度。剩余：AI 档位 1/2 的实际行为差异留待未来 AI 细化（当前双态即档位 0）。
13. **碰撞体积与视觉几何对齐（可选，低优先）**：#18 修复（2026-08-14）后正面贴脸不再误判后部模块，但坦克碰撞盒仍为车体矩形包围盒（不含炮塔/炮管/箭镞尖头），紧贴时车体视觉重叠 ≈19px 仍残留（#18 修复方向④未实施，属弹道范围外的独立改动）；如需彻底消除，可考虑碰撞改用 `hullPoly` 凸包，风险点为碰撞手感/推挤行为回归，需回归 `test-tankcollision.js`。
14. ~~**卡牌内容批量（≥100 张）+ Boss 内容批量（≥5 种）**~~ — **已完成（2026-08-15，P-09 阶段 B，见 §2.13/§2.14/§3.9）**：111 张卡（5 流派×稀有度按权重）+ 5 Boss（多阶段+弱点+掉落）+ Boss 链尾运行时接入（生成/阶段触发/掉落）全部落地，`validate-content.js` + `audit-content.js --strict` + `npm test` 全绿。剩余相关项：Boss `summons` 伴随单位与 `behavior` 的行为化随敌人 AI（条目 7）一并接入；卡牌 ability/passive/drone/economy 的运行时效果随对应里程碑（M7/M9/M10）接入（后记 2026-08-22：ability/drone 已由 P-17 提前落地，见 §3.22；economy 效果消费未含在本轮 M10 交付内，ammo×loadout 衔接见条目 27）。
15. ~~**MVP 架构重构（正式游戏 vs 装甲测试台分离 + 首页路由 + 开发者面板，P-15）**~~ — **已完成（2026-08-19，P-15，见 §2.15/§3.17）**：三入口拆分（`index.html` 首页 / `tank_mvp.html` 正式游戏 / `tank_bench.html` 装甲测试台，`server.js` '/' 路由）；正式游戏 HUD 极简（装填条 + 弹种 + 提示条 + 小地图）；伤害飘字模块（`js/tank_dmgtext.js` 五色语义，`npm test` 23 套）；玩家状态面板（TAB 切换）；开发者面板（F12 / 反引号键：超级精度 `devAim.zeroSpread` + 数值覆盖 `devOverrides`）。弹种 4（HEAT）随后由条目 16（P-16）接入完成（见 §2.6/§3.19）。
16. ~~**击穿与弹种机制升级：HEAT 破甲弹与 HE 高爆弹物理改造（P-16）**~~ — **已完成（2026-08-19，P-16，见 §2.6/§3.19）**：
    - HEAT：确定性豁免跳弹（不计算 Bounce）、1.4 倍穿深、0.8 倍飞速、标准伤害、1.2 倍散布。
    - HE：确定性豁免跳弹、物理爆炸范围（`splashRadius`）与 Splash 范围伤害；增加未击穿爆轰伤害（基于装甲吸收后的残余能量扣血）；爆炸视觉特效范围与逻辑 Splash 半径完全对齐。
    - 实现：`RULES.ammoTypes` 配置源（heat/he 新增、ap/apcr 既有）+ `resolveHit` 弹种消费（noBounce 禁跳弹 / splashRadius 溅射 / 未击穿残余爆轰）+ mvp/bench 数字键 1/2/3/4 切弹种 + HE 破障（24px，与 90px 坦克溅射并存）+ 爆轰特效 scale=splashRadius/40 对齐；验证 `scripts/test-extreme-combat.js` §12 组 7 项边缘断言 + 浏览器冒烟「数字键 4 切 HEAT」全绿。
17. **战术卡牌能力与主动装备拓展（P-17）** — **已完成（2026-08-20）**：~~烟幕射击~~（子目标 2，2026-08-20，见 §2.5 第 8 条 / §3.18）+ 呼叫战术支援（炮击/轰炸延迟 AOE）+ 超级装填/战术护盾 + 无人机体系（scout/striker），详见 §3.18 / §3.21 / **§3.22**；验证 `scripts/test-abilities.js`（76 断言）/`scripts/test-drone.js`（57 断言）/`npm run test:browser`（23 断言 ALL PASS）；`npm run check` 0 错误（`npm test` 仅链首 `test-qa.js` 基线失败为 ISSUES #27~#57 已登记非-P-17，详见 §3.22）。
18. **内容生成与平衡性 Agent（P-18）**：定型 `@card-author` / `@boss-author` / `@balance-auditor` 子 agent 规范与工作流。**部分落地（2026-08-22，agent 配置维护）**：orchestrator 路由表与委派白名单纳入三内容 agent；全部 agent 正文过时事实刷新（node-map 认领 flow/map/camera 等 10 模块、掩体破坏链/树耐久等错误设定修正、`spreadOn`/`rangeOn` 等已删开关清除）；orchestrator 模式声明冲突修复（opencode.jsonc 残留 subagent 条目已删，以 `.md` 的 `mode: primary` 为唯一事实源）。剩余：实战演练一轮「内容生产 → 审计 → 整改」闭环。
19. **敌方 AI 战术状态机扩充（P-19）**：扩展绕行进攻（Flank）、消极防御、搜索前进、队列行军、呆滞惊慌等丰富 AI 行为状态。
20. **新地图元素与水体/桥梁地形（P-20）**：增加河流、池塘、桥梁水体地形，阻断/减速通行，塑造桥头堡战术瓶颈与村落森林地貌。**部分落地（2026-08-20）**：`generateNode` 随机水体/桥梁组合已实现（含 #62 边界修复：尺寸封顶 40% + 偏移单次缩放 + 桥梁 y 钳制，见 §2.12）；剩余：河流连接效果与桥头堡战术验证、减速/阻断语义细化。
21. **音效与 Web Audio 真实音效库升级（P-21）**：扩展动态引擎轰鸣、履带摩擦、近距离飞弹呼啸（Flyby）与 2D 空间音效（Panning/距离衰减）。
22. ~~**局外流程闭环与存档/配置体系（M10 扩展 / P-22）**~~ — **已完成（2026-08-22，见 §2.16/§3.25）**：
    - 首页多存档管理（元索引 + 槽位键 CRUD：创建/切换/重命名/删除 + legacy 单键自动迁移为默认存档）。
    - 出战坦克与弹药选配（Loadout：`selectedTankId` + `ammoLoadout` ≤3 种，战斗中 1/2/3 键索引切换 + Q 环形循环）。
    - 局前永久升级商店（UPGRADE_DEFS 八项 + `buyExtraRevive` 追加复活；出击路径统一 `beginRunFromMenu()`）。
    - 全局流程状态机扩充（home/loadout/shop 三态白名单接入；gameover→['map','home']，死亡购买 UX 由 gameover 态内嵌承接）。
    - 附带修复 4 个真 bug（applyUpgrades 跨局叠加 / 复活购买不持久 / ammoKey 跨局残留 / test-economy flaky 断言，见 §3.25）。
23. **战术小地图强化（P-23）**：M 键放大全屏战术地图、标识地形/桥梁/水体与视口外警报脉纹。
24. **无头战斗模拟器与数值平衡测算工具（P-24，`tools/sim_battle.js`）**：×1000 极速无头模拟 + 蒙特卡洛 10000 局测算，输出通关率/DPS/卡牌选取率 HTML 报告。
25. **AI 行为流可视化调试器与慢放/回放控制器（P-25）**：AI 视线/ Target 射线实时绘制、60 秒战斗录制与逐帧/慢放/步进分析。
26. **自动化内容 Lint 与 CLI 贴图烘焙 Pipeline（P-26）**：描述与 Effect 校验、掩体多边形拓扑检查与 CLI 无头一键导出贴图。
27. **卡牌 × Loadout 衔接（遗留衔接点，来自 M10）**：卡牌 `effect.type==='ammo'` 的弹种改造需与出战 `ammoLoadout` 键集求交——改造指向**未配备**弹种的改造卡不应产生可切换目标（或提示先装备该弹种）；方案待定后实现。**前置约束：先执行条目 29（P-28 战斗核心管线解耦）**，避免 ammo 改造在 mvp/bench 双份管线里各落一遍。
28. **tank_bench 弹种语义（范围决策记录，非遗漏）**：装甲测试台不做 loadout 索引化切换，保留全局直选全弹种（调试台语义）；mvp 正式游戏专属 loadout 索引制（见 §2.16）。若未来需要在测试台复现正式 loadout 行为，再评估接入。
29. **战斗核心管线解耦（P-28，见 PLAN.md）**：`tank_mvp.html` 与 `tank_bench.html` 各自内联同一套战斗核心且已分叉（`shellVerticalDecision` 320L vs 197L、`updateSolution`、`fireTank`、`tryFire` 逐行 DIFFERS；bench HE 破障缺 `!s.absorbed` 守卫等漂移实例）——收敛到新 `js/tank_fire.js`（纯逻辑 ctx 显式注入），页面只留输入/HUD 胶水；顺手收编两页重复小胶水。**排序：先于条目 27 及任何下一批弹道/掩体判决改动**。
30. **覆盖层 UI 纯逻辑下沉（P-29，低优先，见 PLAN.md）**：M10 的 Home/Loadout/Shop 与既有结算/卡牌/节点图覆盖层内联于 `tank_mvp.html`；将界面状态与渲染数据组装抽为 `js/` 纯逻辑模块（DOM 接线留内联），抑制单文件膨胀。随下次触碰相关界面时执行。
