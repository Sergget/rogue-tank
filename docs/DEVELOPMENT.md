# 战术坦克 Roguelike — 开发主文档（核心流程控制）

> 本文档是**唯一长期权威文档**，2026-08-23 起采用分卷结构：本文件只保留**游戏核心流程控制**与**全局索引**；
> 各系统规范拆分至 `docs/specs/`，历史归档按月分卷至 `docs/archive/`。
> 拆分前的完整原文快照：`docs/archive/2026-08-development-full-snapshot.md`（只增不删）。

---

## 1. 项目定型

**类型**：节点式地图推进 + 局内得分驱动构筑 的战术坦克 Roguelike（俯视角 2D）。每个节点是一块独立的、有限范围的战场，难度随推进程度随机生成。

**目标单局时长**：从 0 开始一局，控制在 10 分钟以内。

**核心战斗立意**：慢节奏、强博弈、拟真物理——摆角度找跳弹角、找掩体、抢位置，拒绝魔幻特效和高频输出。

---

## 2. 核心流程控制

### 2.1 单局结构 —— 节点式地图
- 一局 = 一条**纯线性、开放式**节点链（2026-08-24 定案：不固定 5 节点收尾，节点随推进持续延伸），无分支路线。每个节点是独立、有边界的战场（约 1:9 摄像机比例）。
- 难度完全靠敌人数量、敌人策略（AI 复杂度）、数值强度三者随节点推进同步提升；曲线定表 `RULES.difficulty`（diff = 0.15 + 0.8·t^1.25）。
- **Boss 节奏**：每第 5 个节点为 Boss 节点（RULES.bossInterval=5；实现见 PLAN P-37）。
- 节点间开放卡牌三选一与**局内商店**（实现见 PLAN P-41）：局内商店按**当前得分**计价消费，只售 run 内属性升级（modifiers scope:'run'，本局结束清除、不带出存档），消费独立记账、**不减损**终局转化用的累计得分；**永久升级商店**消费由终局累计得分 ×10% 转化的点数。两套商店货币互不流通。
- 流程状态机 `js/tank_flow.js`：home → loadout → shop → map → battle ⇄ pause → settlement → reward → battle …。**终局条件（二选一，2026-08-24 定案）**：① 阵亡且复活次数耗尽 → gameover 强制终局结算；② 战斗中 ESC 暂停面板「终止游戏并结算」（PLAN P-35/P-34）→ 主动终局结算。两路终局均结算得分并使跨局难度等级 +1。白名单转移表护栏，非法转移抛错；UI 层经 watchFlow 监听显隐 DOM 覆盖层。（pause 等新态待实现落地）

### 2.2 死亡 / 复活 / 失败
- 死亡为永久性；失败条件**仅当复活次数耗尽**。
- 复活 = 基础 2 次 + 局前商店加购（`profile.bonusRevives`）；满状态复活于友军据点旁随机无障碍点，附 3 秒无敌。模块 `js/tank_revive.js`。
- 除阵亡耗尽外，玩家可在战斗中经 ESC 暂停面板主动「终止游戏并结算」结束本局（§2.1 / PLAN P-34）。

### 2.3 经济系统
- **局内得分**：击杀（20 分/辆）+ 节点通关奖励（base `100×(1+index×0.2)`，无伤+50%/速通+20%/据点存活+20%）。
- **双账本记分**：「累计得分」（击杀+节点奖励，用于终局转化）与「可花余额」（局内商店消费池，上限=当前累计得分快照）相互独立——局内购买扣余额、不扣累计（PLAN P-41）。
- **商店点数**：任一终局（阵亡耗尽或主动终止）时累计得分 ×10% 转化（scoreToPointsRatio=0.1）；购买永久升级（8 项 permanent scope 树）与追加复活。
- **跨局难度等级**：每次终局结算后 profile.difficultyLevel +1 持久化，下一局叠加入难度曲线（PLAN P-34）。
- 存档体系：多存档槽位（元索引 `rogue-tank-saves-meta` + 槽位键 `rogue-tank-save:<id>`，legacy 单键自动迁移且永不删除）；出战配置 Loadout（selectedTankId + ammoLoadout ≤3 种弹种，战斗中 1/2/3 键索引切换 + Q 环形循环）。模块 `js/tank_economy.js`。

### 2.4 战斗单位构成（概要）
- 玩家单一坦克；敌军多态战术 AI（Stunned/Flank/Defensive/Search&Destroy/Patrol 五态状态机）；友军据点消极防御可被摧毁。
- 伴随无人机两型（scout 侦察标记 / striker 自动打击），上限 2 架。

---

## 3. 子文档索引

| 子文档 | 内容 | 主要模块 |
|---|---|---|
| [specs/combat.md](specs/combat.md) | 战斗/物理/装甲跳弹/弹种/模块伤害/主动能力/无人机 | tank_physics, tank_fire, tank_geometry, tank_abilities, tank_drone |
| [specs/map.md](specs/map.md) | 地图元素/掩体体系/节点生成/摄像机/小地图/贴图资产 | tank_cover, tank_nodegen, tank_map, tank_camera, tank_assets |
| [specs/cards.md](specs/cards.md) | 卡牌数据契约/六大效果/稀有度流派/堆叠验证 | tank_cards, cards/*.json |
| [specs/boss.md](specs/boss.md) | Boss 多阶段/弱点/随从/掉落 | tank_boss, bosses/*.json |
| [specs/editor.md](specs/editor.md) | 坦克设计器/对比页/字段架构/纹理化/烘焙工具 | tank_designer.html, tank_compare.html, tank_halfgeom, tank_schema |

**归档分卷**（只增不删）：[archive/2026-08.md](archive/2026-08.md)（PLAN/ISSUES 完结条目原文）· [archive/2026-08-development-full-snapshot.md](archive/2026-08-development-full-snapshot.md)（本文档拆分前全文）

**冲突判定**：各文档描述冲突时以本文件 §2 为准；子文档是对应系统的细化展开。

---

## 4. 数值权威源

机制参数唯一配置源 = `js/tank_rules.js`（RULES）：ammoTypes 弹种系数 / coverTiers 元素行为 / heights 高度 / difficulty 曲线 / economy 经济 / revive 复活 / ai AI 参数 / abilities 主动能力 / smoke 烟幕 / nodeMap 节点图。完整数值参考表见归档快照 §5.5 与各子文档内嵌表。

## 5. 下一步顺序（活跃项）

- **活跃开发项（2026-08-24 起）**：近期计划见 docs/PLAN.md P-34~P-41；已核实问题见 docs/ISSUES.md #76~#85。下方历史记录中的 P-27/P-29/P-30 为旧编号（已完成工作），勿与本批混淆。

- **27. 卡牌 × Loadout 衔接（P-27）——已完成（2026-08-23）**：`js/tank_cards.js` 扩展 `drawCardChoices` 过滤未配弹种卡 + 导出 `computeAmmoConfig`（叠加 `cardEffects` 弹种改造，支持 add/mult）；`js/tank_fire.js` 开火与预测接入 `computeAmmoConfig`；`tank_mvp.html` 奖励抽卡传入 `ammoLoadout: player.ammoLoadout`；单测全绿。
- **30. 覆盖层 UI 纯逻辑下沉（P-29，低优先）——已完成（2026-08-23）**：`js/tank_screens.js` 纯逻辑视图模型（`SCREENS` + `buildHome/Loadout/Shop/MapList/DeathShop/SettlementViewModel` + `tankSummary/deploymentReady/formatStamp`，零 DOM 依赖、双端导出）+ `tank_mvp.html` 薄包装接线（DOM 渲染与事件留内联，行为零回归）；`npm run check` + `npm test` 全绿。
- **31. 文档分卷维护（P-30）——已完成（2026-08-23）**：ARCHIVE 正文已按月分卷至 `docs/archive/`（主文件只留索引表），DEVELOPMENT 已拆为核心流程控制 + specs 五卷索引；后续新归档写入当月卷并更新索引行即可。
- 其余远期项备案（暂不启动；清单保留于本文档，2026-08-24 裁定）：P-21 音效升级 / P-23 全屏战术地图 / P-24 无头模拟器 / P-25 AI 可视化 / P-26 内容 Lint Pipeline——规划原文见归档快照 §6。
