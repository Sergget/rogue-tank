# 战术坦克 Roguelike — 开发主文档（核心流程控制）

> 本文档是**唯一长期权威文档**，2026-08-23 起采用分卷结构：本文件只保留**游戏核心流程控制**与**全局索引**；
> 各系统规范拆分至 `docs/specs/`，历史归档按月分卷至 `docs/archive/`。
> 拆分前的完整原文快照：`docs/archive/2026-08-development-full-snapshot.md`（只增不删）。

---

## 1. 项目定型

**类型**：节点式地图推进 + 局内得分驱动构筑 的战术坦克 Roguelike（俯视角 2D）。每个节点是一块独立的、有限范围的战场，难度随推进程度随机生成。

**目标单局时长**：从 0 开始一局，控制在 10 分钟以内。

**核心战斗立意**：慢节奏、强博弈、拟真物理——摆角度找跳弹角、找掩体、抢位置，拒绝魔幻特效和高频输出。

**视觉与美术基调**：冷峻硬核的战术军武风（2D Top-Down 拟真质感/低饱和度工业像素），强调钢铁碰撞的厚重感、真实弹道反馈与物理破坏痕迹；杜绝魔幻光效与无意义的高饱和光污染；所有战斗特效半径严格与物理判定对齐。

---

## 2. 核心流程控制

### 2.1 单局结构 —— 节点式地图
- 一局 = 一条**纯线性、开放式**节点链（2026-08-24 定案：不固定 5 节点收尾，节点随推进持续延伸），无分支路线。每个节点是独立、有边界的战场（约 1:9 摄像机比例）。已落地：generateRun 初始链 + `extendRun` 无限续接；难度参数化 diff(index)=min(0.95, 0.15+0.8·min(1,index/12)^1.25) 再叠加 difficultyLevel×0.04（封顶 1.15）。（数值以 RULES.difficulty 收口字段为准）
- 难度完全靠敌人数量、敌人策略（AI 复杂度）、数值强度三者随节点推进同步提升；曲线定表 `RULES.difficulty`（diff = 0.15 + 0.8·t^1.25）。（2026-08-24 全面落地：entityMults 十维属性分化 + AI tierProfiles 行为分层，玩家隔离）。敌人难度现已采用弱→强曲线：RULES.difficulty.entityMults 十维属性表下界<1（简单节点敌人更弱更慢）、上界略>1（困难节点更强更快）；普通敌人输出端封顶采用三键方案（2026-08-25 起，取代旧 enemyStatCapVsPlayer=0.8）：penCapVsPlayer=1.2（spawn 快照封顶）/ dmgFloorVsPlayer=0.4（伤害地板）/ dmgCapAmmoMult=0.7（最强弹种终伤天花板），Boss 经 applyDifficultyMults 第三参跳过此封顶。敌军生成改为聚集布点（RULES.nodeMap.enemyClusterRadius/SizeMin/Max/CountBase）：每聚集点 2–5 辆、聚集点数随难度提升。
- **Boss 节奏**：每第 5 个节点为 Boss 节点（已落地，2026-08-24，`RULES.nodeMap.bossInterval`=5）。Boss 复用 tanks/*.json 模型并放大 2× 几何（hull/turret 多边形、炮塔枢轴、锚点、履带同步缩放，barrel.len 不缩放）；经 bosses/*.json 的 tuning 块（默认 RULES.boss.tuning：hpMul 8 / moveMul 0.5 / turnMul 0.6 / turretTurnMul 0.6 / shellMul 0.8 / fireRateMul 0.6 / dmgMul 1.5）在同级普通敌人基准上进一步降机动、提射速/伤害/血量；生成后再叠加 applyDifficultyMults 以同级敌人为基准。
- 节点间开放卡牌三选一与**局内商店**（已落地，2026-08-24）：局内商店按**当前得分**计价消费，只售 run 内属性升级（modifiers scope:'run'，本局结束清除、不带出存档），消费独立记账、**不减损**终局转化用的累计得分；**永久升级商店**消费由终局累计得分 ×10% 转化的点数。两套商店货币互不流通。商品表 `RUN_SHOP_DEFS`（6 项：紧急维修/快速装填/精密火控/引擎超压/姿态稳定/装甲应急补强），定价 `round(baseCost×costGrowth^level)`。局内商店除结算/奖励节点外，现也可从 ESC 暂停菜单的「局内商店」按钮进入；暂停面板内商店按钮此前因 pointer-events 失效不可点击，已修复。
- 流程状态机 `js/tank_flow.js`：home → loadout → shop → map → battle ⇄ pause → settlement → reward → battle …。**终局条件（二选一，2026-08-24 定案）**：① 阵亡且复活次数耗尽 → gameover 强制终局结算；② 战斗中 ESC 暂停面板「终止游戏并结算」（已落地）→ 主动终局结算。两路终局均结算得分并使跨局难度等级 +1。白名单转移表护栏，非法转移抛错；UI 层经 watchFlow 监听显隐 DOM 覆盖层。pause 态已落地（2026-08-24，P-35）：battle⇄pause 冻结战斗循环（仅渲染不更新）；pause→settlement 为「终止游戏并结算」入口（voluntaryEnd payload，终局结算语义已完善）；玩家设置 profile.settings.invertReverseTurn 经 driveTank invertTurnWhenReversing 实现倒车转向倒置。ESC 暂停菜单的按键绑定已收入「控制」子菜单；暂停菜单保留「局内商店」与「终止游戏并结算」两个子按钮。

### 2.2 死亡 / 复活 / 失败
- 死亡为永久性；失败条件**仅当复活次数耗尽**。
- **节点间满血进入与 maxHp 同步（#A12，2026-08-26）**：enterBattle 经 resetEntity 恢复 spawn 快照后兜底 `player.hp = stats.maxHp`（与 #99 出击路径同款）；战斗中任何经 `refreshStats` 的 maxHp 正向变化按增量抬升当前 hp 并把 `spawn.hp` 同步为新满血值——差量对比收口在 refreshStats 而非 addModifier，多 modifier 叠加只按累计差量抬升一次；上限回落（移除修饰器/限时到期）仅钳制不主动扣血。
- 复活 = 基础 2 次 + 局前商店加购（`profile.bonusRevives`）；满状态复活于友军据点旁随机无障碍点，附 3 秒无敌。模块 `js/tank_revive.js`。
- 除阵亡耗尽外，玩家可在战斗中经 ESC 暂停面板主动「终止游戏并结算」结束本局（已落地，2026-08-24）。

### 2.3 经济系统
- **局内得分**：击杀（20 分/辆）+ 节点通关奖励（base `100×(1+index×0.2)`，无伤+50%/速通+20%/据点存活+20%）。
- **双账本记分**：「累计得分」（击杀+节点奖励，用于终局转化）与「可花余额」（局内商店消费池，上限=当前累计得分快照）相互独立——局内购买扣余额、不扣累计（已落地，`RUN_SHOP_DEFS` 双账本 API）。
- **商店点数**：任一终局（阵亡耗尽或主动终止）时累计得分 ×10% 转化（scoreToPointsRatio=0.1）；购买永久升级（8 项 permanent scope 树）与追加复活。
- **跨局难度等级**：每次终局结算后 profile.difficultyLevel +1 持久化，下一局叠加入难度曲线（已落地，settleRun 终局 difficultyLevel +1）。
- 存档体系：多存档槽位（元索引 `rogue-tank-saves-meta` + 槽位键 `rogue-tank-save:<id>`，legacy 单键自动迁移且永不删除）；出战配置 Loadout（selectedTankId + ammoLoadout ≤3 种弹种，战斗中 1/2/3 键索引切换 + Q 环形循环）。模块 `js/tank_economy.js`。

### 2.5 视觉风格与美术管线定型
- **调色板与材质规范**：统一采用 16 色低饱和军武调色板（灰绿/沙黄/铸造灰/防锈漆褐/火焰橙/烟尘黑），严格区分阵营标识与底色。
- **渲染分层**：
  1. 地面 Biome & 痕迹层（履带印、弹坑灼痕 scorchMarks、泥潭/水域）；
  2. 实体底盘层（履带、悬挂阴影、车体多边形/纹理）；
  3. 炮塔与装甲层（炮塔旋转、炮管预设、装甲板厚度法线/凸显）；
  4. 掩体与环境层（half/full 掩体、树干、障碍物）；
  5. 树冠与遮蔽层（tree canopy、bush 叶片，坦克过树下半透明）；
  6. 粒子与特效层（炮口闪光 muzzleFlash、爆轰火球 explosions、烟雾/火花/破片/冲击波 shockwaves）；
  7. UI & HUD 飘字层（伤害飘字 dmgtext、小地图 minimap、视口剔除指示器）。
- **资产与程序化双通道**：所有实体资产优先读取 `assets/` 位图序列与 atlas 图集，无外部文件时无缝回退至 `ASSET_DEFS` 离屏 bake / `tank_paint.js` 程序化 Canvas 渲染，确保 `file://` 零依赖与生产级美术无缝替换。
- **开发者面板与特效更新（本轮落地）**：开发者面板现已与 HUD 面板数据对齐（极速显示 km/h 而非 px/s），并新增节点类型、实时敌人数、已持有卡牌（按 cardEffects 卡名枚举）展示。主炮特效改为炮口双侧+前方闪光与炮弹曳光拖尾（取代原烟雾拖尾）。
- **局内生态与平衡扩展（本轮落地）**：
  - **水域涉水**：水体/河流 passability 调为 0.4（减速可驶入，不再硬阻断），炮弹维持 mode:'pass' 飞越。
  - **弹种隔离与 HE 软上限**：卡牌弹种效果按弹种独立隔离；HE 卡牌幅度与叠层上限下调，并在 computeAmmoConfig 施加 RULES.ammoTypeCap 软上限（dmg:2.5, pen:1.8, speed:2.0）；战斗 HUD 增设实时弹种数值读数。
  - **无限局内商店**：移除局内商店 maxLevel 购买上限，下调单级提升幅度（维修 10%、装填 -3%、散布 -4%、移速 +3、装甲 +2mm），依托 costGrowth 成本滚雪球维持平衡。
  - **Boss 防风筝**：Boss 出生即全局交战（aiTriggerDist 99999 + aiEngaged），AI 跳过 patrol 早退与近距倒车，全程以 move=1 主动追击玩家。
  - **UI 与设置**：暂停菜单「控制」子菜单完整补充 `、Tab 等按键映射；新增 profile.settings.showFps 开关与实时 FPS 读数；左上角增设常驻常显控制提示（字号 ≥13px）。
- **玩法设计第二批修复与机制定型（2026-08-25 落地，原 ISSUES #86~#101）**：
  - **数值权威源统一**：km/h 换算 kmhFactor=0.4 全库唯一；难度封顶三键 penCapVsPlayer=1.2 / dmgFloorVsPlayer=0.4 / dmgCapAmmoMult=0.7（取代 enemyStatCapVsPlayer）；敌军速度 = lerp(0.3,0.6,diffNorm)×玩家极速×每辆 ±15% 随机；敌军聚集 CountBase=2、Size 3~6。
  - **修饰器 mult 全局加法聚合**：同 stat 多条 mult 按 `1+Σ(v−1)` 单次应用（computeStats 与 computeAmmoConfig 同语义）；HE 软上限 ammoTypeCap 仅作用于 he 弹种。
  - **视野系统 v1**：`RULES.vision{radius:900, bias:0.35, inner:0.45}`，鼠标锚定偏移圆；主画布视野外敌军隐藏、小地图恒显。
  - **主动道具 innate 化**：修理箱(4)/医疗包(5) 开局自带、独立冷却池 abilityCds 基础 45s；永久升级 −1s/级、局内商店 −3s/级。
  - **局内商店 v2**：四分组（火力/防护/机动/杂项）+ 当前→购买后数值预览 + 六面装甲独立商品 + 整体降价 40% + 维修回血 25%。
  - **Boss 行为差异化 v1**：behavior 字段五风格（command 炮击召唤 / fortify 掩体火力点 / crush 碾压碰撞伤害击退 / skirmish_long 超远伸缩 / weave 随机走位冲撞）+ penMul=1.4 + strikes 落点红圈预警。
  - **地形生成 v2**：road tier 村庄分层生成（街道→沿街建筑→杂物）+ placeForestClusters 树林簇；full/intact/rock `vision:true` 挡 AI 视野。
  - **其他修复**：履带断不再缴械（fireTank 仅 reloadT 门控）、耐久升级后满血开局、控制子菜单默认折叠、Tab 面板装甲取整 + 分弹种参数行、AI 装填间隙侧摆 45–90°、bench 卡牌测试面板、对比器真实单位 + σ精度读数。
- **模块概率分区与参数极限制（2026-08-26 落地，P-49 核心批）**：
  - 命中判定改为**七类模块几何概率分区**（炮塔四象限 + 车体纵轴区段、区内互斥抽取，breech 新键；细节见 specs/combat.md「弹药架与模块」），设计器废除自定义挂载，旧 json modules 字段加载静默忽略。
  - **全参数极限制**：`RULES.parameterLimits` 全参数极限表生效（reload 下限 0.5s / maxSpeed ≤150km/h 等），设计器与运行时统一钳制。
  - **重量双层上限**：weight 改为 `deriveWeight` 派生（不可手动自定义）+ 设计上限 80t + `RULES.weightRuntimeCap` 运行硬顶 240t。
  - **功重比显示**：设计器 / 对比器新增功重比读数。
   - **回放基线重锚**：28f3e684 → 1e49b3fc（归因 P-49 概率分区 + 重量运行时钳制的累计数值面改动）。

### 2.6 音效设计与声音管线定型
- **音效立意**：低沉、厚重、具有战场压迫感的拟真机械与爆破音效，杜绝轻飘的电子合成感。
- **总线与优先级**：音效分为 `combat`（战斗）与 `ui`（界面）两大总线，支持独立增益调节与并发抢占（`maxConcurrent` 防爆音）。
- **音频资产与程序化双通道**：
  - **采样通道 (Sample Channel)**：引入 CC0 / MIT / OpenGameArt / Freesound 授权的开源真实音频采样（WAV/OGG），存放于 `audio/` 目录；
  - **程序化通道 (Synth Channel)**：沿用 `tank_audio.js` 的 Web Audio API 原生合成器（`osc` 振荡器 + `noise` 噪声 + ADSR 包络 + 滤波器），作为采样未加载或 `file://` 离线环境下的零资源兜底。
- **2D 空间化与距离衰减**：基于 `PannerNode`（HRTF / exponential rolloff）实现战场 2D 空间音频定位，包含开火、击中、爆轰与移动的距离衰减及多普勒效应。

---

| 子文档 | 内容 | 主要模块 |
|---|---|---|
| [specs/combat.md](specs/combat.md) | 战斗/物理/装甲跳弹/弹种/模块伤害/主动能力/无人机 | tank_physics, tank_fire, tank_geometry, tank_abilities, tank_drone |
| [specs/map.md](specs/map.md) | 地图元素/掩体体系/节点生成/摄像机/小地图/贴图资产 | tank_cover, tank_nodegen, tank_map, tank_camera, tank_assets |
| [specs/cards.md](specs/cards.md) | 卡牌数据契约/六大效果/稀有度流派/堆叠验证 | tank_cards, cards/*.json |
| [specs/boss.md](specs/boss.md) | Boss 多阶段/弱点/随从/掉落/数据驱动行为与战利品卡牌 | tank_boss, bosses/*.json, tank_ai |
| [specs/editor.md](specs/editor.md) | 坦克设计器/对比页/字段架构/纹理化/烘焙工具 | tank_designer.html, tank_compare.html, tank_halfgeom, tank_schema |

**归档分卷**（只增不删）：[archive/2026-08.md](archive/2026-08.md)（PLAN/ISSUES 完结条目原文）· [archive/2026-08-development-full-snapshot.md](archive/2026-08-development-full-snapshot.md)（本文档拆分前全文）

**冲突判定**：各文档描述冲突时以本文件 §2 为准；子文档是对应系统的细化展开。

---

## 4. 数值权威源

机制参数唯一配置源 = `js/tank_rules.js`（RULES）：ammoTypes 弹种系数 / coverTiers 元素行为 / heights 高度 / difficulty 曲线 / economy 经济 / revive 复活 / ai AI 参数 / abilities 主动能力 / smoke 烟幕 / nodeMap 节点图。完整数值参考表见归档快照 §5.5 与各子文档内嵌表。

## 5. 下一步顺序（活跃项）

- **活跃开发项（2026-08-26 起）**：近期计划见 docs/PLAN.md：玩法线 PLAN 已全部完成归档（P-34~P-41）；当前着力**玩法核心专项 P-42~P-44**（卡牌平衡审计 / 地图生成质量 / 战斗与 AI 修补）；视觉专项（旧 P-42~P-45）与音频专项（旧 P-46~P-49）暂缓，规格全文移交 `.opencode/agents/asset-artist.md` / `sound-designer.md`「暂缓储备规范」章节维护；候选库前移为 P-45。已核实问题仅余 #78 部分范围（设计器 verts UI）。下方历史记录中的 P-27/P-29/P-30 为旧编号（已完成工作），勿与本批混淆。

- **32. Godot 引擎迁移可行性评估——已完成（2026-08-26，决策：技术可行、暂不迁移）**：在 `feat/godot-eval` 分支完成最小验证工程 `godot-eval/`（Godot 4.7.2 + godot-mcp 接入），四项试点全部冒烟通过：TileMapLayer 掩体布局 + 碰撞多边形 / CoverTier `.tres` 资源化对齐 RULES.coverTiers / canvas_item shader（换色·闪白·履带滚动）/ GPUParticles2D 枪口火焰。结论：地图/素材/渲染三维度收益显著，但全量迁移需重建 28 个 Node 测试链且甲弹对抗物理回归风险最高，工时约 22~36 人日；现阶段以"思想移植"方式在现有栈内吸收收益（离屏 tint 缓存、程序化地图编辑器页等），分支与评估工程已存档备查（`feat/godot-eval` @ `5b81959`，含 `godot-eval/README.md` 复现指引），首个可玩版发布后或需原生导出时重启评估。

- **27. 卡牌 × Loadout 衔接（P-27）——已完成（2026-08-23）**：`js/tank_cards.js` 扩展 `drawCardChoices` 过滤未配弹种卡 + 导出 `computeAmmoConfig`（叠加 `cardEffects` 弹种改造，支持 add/mult）；`js/tank_fire.js` 开火与预测接入 `computeAmmoConfig`；`tank_mvp.html` 奖励抽卡传入 `ammoLoadout: player.ammoLoadout`；单测全绿。
- **30. 覆盖层 UI 纯逻辑下沉（P-29，低优先）——已完成（2026-08-23）**：`js/tank_screens.js` 纯逻辑视图模型（`SCREENS` + `buildHome/Loadout/Shop/MapList/DeathShop/SettlementViewModel` + `tankSummary/deploymentReady/formatStamp`，零 DOM 依赖、双端导出）+ `tank_mvp.html` 薄包装接线（DOM 渲染与事件留内联，行为零回归）；`npm run check` + `npm test` 全绿。
- **31. 文档分卷维护（P-30）——已完成（2026-08-23）**：ARCHIVE 正文已按月分卷至 `docs/archive/`（主文件只留索引表），DEVELOPMENT 已拆为核心流程控制 + specs 五卷索引；后续新归档写入当月卷并更新索引行即可。
- 其余远期项备案（暂不启动；清单保留于本文档，2026-08-24 裁定）：P-21 音效升级 / P-23 全屏战术地图 / P-24 无头模拟器 / P-25 AI 可视化 / P-26 内容 Lint Pipeline——规划原文见归档快照 §6。
