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
- 一局 = 一条**纯线性**节点链（默认 5 节点），无分支路线。每个节点是独立、有边界的战场（约 1:9 摄像机比例）。
- 难度完全靠敌人数量、敌人策略（AI 复杂度）、数值强度三者随节点推进同步提升；曲线定表 `RULES.difficulty`（diff = 0.15 + 0.8·t^1.25）。
- 节点间开放卡牌三选一与局内商店；死亡后开放永久升级商店——**两套独立商店，货币互不流通**。
- 流程状态机 `js/tank_flow.js`：`home → loadout → shop → map → battle → settlement → reward → battle …`（阵亡耗尽复活次数 → gameover）。白名单转移表护栏，非法转移抛错；UI 层经 `watchFlow` 监听显隐 DOM 覆盖层。

### 2.2 死亡 / 复活 / 失败
- 死亡为永久性；失败条件**仅当复活次数耗尽**。
- 复活 = 基础 2 次 + 局前商店加购（`profile.bonusRevives`）；满状态复活于友军据点旁随机无障碍点，附 3 秒无敌。模块 `js/tank_revive.js`。

### 2.3 经济系统
- **局内得分**：击杀（20 分/辆）+ 节点通关奖励（base `100×(1+index×0.2)`，无伤+50%/速通+20%/据点存活+20%）。
- **商店点数**：死亡时得分 ×10% 转化；购买永久升级（8 项 permanent scope 树）与追加复活。
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

- **27. 卡牌 × Loadout 衔接**：ammo 改造卡与 ammoLoadout 键集求交（前置阻塞已解除，P-28 完成）。
- **30. 覆盖层 UI 纯逻辑下沉（P-29，低优先）——已完成（2026-08-23）**：`js/tank_screens.js` 纯逻辑视图模型（`SCREENS` + `buildHome/Loadout/Shop/MapList/DeathShop/SettlementViewModel` + `tankSummary/deploymentReady/formatStamp`，零 DOM 依赖、双端导出）+ `tank_mvp.html` 薄包装接线（DOM 渲染与事件留内联，行为零回归）；`npm run check` + `npm test` 全绿。
- **31. 文档分卷维护（P-30）——已完成（2026-08-23）**：ARCHIVE 正文已按月分卷至 `docs/archive/`（主文件只留索引表），DEVELOPMENT 已拆为核心流程控制 + specs 五卷索引；后续新归档写入当月卷并更新索引行即可。
- 其余远期项（P-21 音效升级 / P-23 全屏战术地图 / P-24 无头模拟器 / P-25 AI 可视化 / P-26 内容 Lint Pipeline）详见 PLAN.md 与归档快照 §6。
