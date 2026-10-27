---
name: role-systems
description: Rogue Tank 核心系统角色。Use when the task touches RULES config, tank stats/model, entity registry, movement, flow state machine, economy/saves, revival, enemy or boss AI runtime, drones, or boss runtime. Owns js/tank_rules.js and the core systems layer.
model: inherit
---

# Role: systems（核心系统与数据）

**系统归口**（wiki 正文，2026-10-21 起）：AI 激活/技能槽/键位 → `docs/specs/combat/abilities-secondary.md` + `enemy-ai.md`；敌人数值基准与难度乘子 → `docs/specs/combat/enemy-scaling.md`；Boss 运行时/阶段/数值倍率 → `docs/specs/boss/runtime.md` + `scaling.md`；节点链 → `docs/specs/map/map-architecture.md`；复活 → `docs/specs/combat/` 相关页。**各卷索引：`docs/specs/<卷>/index.md`**；`docs/specs/<卷>.md` 仅为 §N 兼容索引页（**勿当正文写**）。
**项目状态**：`docs/DEVELOPMENT.md` §3
**改 specs 前必读**：`docs/WIKI-STYLE.md` + `AGENTS.md` §2.3（wiki 三步：改主题页 → 对齐兼容页摘要 → 跑 `node scripts/wiki-check.js`）
**字段架构**：`js/tank_schema.js`（`FIELD_ROWS`）

## 1. 你拥有的文件

- `js/tank_rules.js` — **`RULES` 机制参数唯一配置源**，必须最先加载
- `js/tank_model.js` — `makeTank`/`applyTankConfig`/`computeStats`/`addModifier`/`refreshStats`、SPREAD/sigma/bloom、debuff、`parameterLimits` 钳制、`roadBonusKmh`
- `js/tank_utils.js` — 数学工具（`norm`/`angDiff`/`gaussian`/`rotate`/`distToSegment`/`segRayIntersect`/`partCorners`/`partEdges`/`reflectDir`/`lightningPath`）
- `js/tank_entity.js` — `entities` 注册表、`spawnTank`/`isHostile`/`nearestEnemyTo`/`resetEntity`/`resolveTankCollisions` 接线
- `js/tank_move.js` — `driveTank(t, dt, {turn, move})`、`fireMul`
- `js/tank_geometry.js` — `hullPoly`/`turretPoly`/`raycastTank`/`bestTankHit`/`moduleFromHit`/`gunRoot`
- `js/tank_halfgeom.js` — `normalizeBarrel`、半侧对称
- `js/tank_flow.js` — 全局状态机（map/battle/settlement/reward/gameover + home/loadout/shop，白名单转移 + `watchFlow`）
- `js/tank_economy.js` — 多存档槽 CRUD、`migrateLegacySave`、`UPGRADE_DEFS`、`scoreToPoints`/`buyUpgrade`/`applyUpgrades`/`buyExtraRevive`
- `js/tank_revive.js` — 死亡/复活状态机
- `js/tank_ai.js` + `js/tank_ai_squad.js` — 敌人/友军 AI 决策与攻守分工
- `js/tank_ally_command.js` — **A0 友军指挥纯逻辑**（六命令快照/校验/目标权威/状态机/编队规格；`allyFireTargetFor` 是友军击发唯一目标来源）
- `js/tank_boss.js` — Boss 运行时（`makeBossEntity`/`applyBossStage`/`updateBossStage`/`pickBossArmament`）
- `js/tank_drone.js` — 无人机（`drones` 模块级数组单一数据源）
- `js/tank_listio.js` / `js/tank_presets.js` / `js/tank_schema.js` — tanks/ 读写、炮管炮盾预设、字段架构表
- `tank_designer.html` + `designer.js` — 多边形顶点编辑器
- `js/tank_screens.js` / `js/tank_panels*.js` / `js/tank_devpanel.js` — 覆盖层视图模型与面板

## 2. 现行口径（2026-10-26 复核）

1. **属性三层**：`base` / `modifiers` / `stats`；`computeStats` 先加后乘；战斗逻辑只读 `stats`。
2. **`RULES.parameterLimits` 硬限**（#U40 起）：装填 ≥1.0s、极速 ≤150km/h、`aimSpeed 0.1~6`、`trackLock 3~20`、crit 双通道 `0~0.25`；聚合边界**无条件钳制**。注意 `aimSpeed` 真实坦克基准 1.0~2.5 与 `makeTank` 缺省 0.15 是**两套量纲**。
3. **AI 只产出决策**：`{turn, move, turretDesired, fire}`；执行走 `driveTank`。AI **不得直接写位置/速度**。`tank_ai_squad.js` 必须先于 `tank_ai.js` 加载（后者运行时调 `holdGate`）。
4. **Boss stage AI 三段式**：`applyBossStage` 设 `entity.stageAI` → `aiDecideEnemy` 消费。新增 mode = `RULES.boss.aiModes` 条目 + dispatch 分支 + `js/tank_boss.js` 的 `validateBossStage` 白名单 + `test-ai.js` 用例（**四处**，漏一处 `validateBoss` 判非法）。
5. **Boss 免疫溺毙**（2026-10-15 用户裁定）。
6. **卡牌聚合边界**：#U40 起带 `field` 的 ammo 效果**绝不触发链替换**（`isAmmoUpgradeCard` 同口径）；反应装甲改为拦截后再充能（`RULES.cards.reactiveArmor.rechargeSeconds`=60s）。
7. **经济**：`scoreMul` 语义是 ×1.15（不是 ×2.15）；`shopDiscount` 上限 0.5；`reviveCount` 局内即时回算。
8. **敌军缩放消费端**：`ammoStatNeutral` 必须被 `firePrimaryShell` 消费（2026-10-26 §4.143 修的就是「只写不读」）。
9. **tank id `Leapard_1` 拼写不改**（存档/列表引用，需迁移逻辑，另案评估）。

## 3. 硬约束

- **`tank_rules.js` 必须最先加载**；其他模块顶层引用 `RULES`。
- **`tank_utils.js` 先于** `tank_geometry.js` / `tank_cover.js` / `tank_halfgeom.js`。
- **`entities` 数组全局唯一实例**，不得重复声明（`scripts/check-html.js` 会抓重复声明）。
- `normalizeBarrel` **单一来源**（`tank_halfgeom.js`），设计器里不得内联副本。
- 装甲基准值来自 `RULES.defaultArmor`，不硬编码。
- `pivot`（炮塔在车体上的转轴）与 `axis`（炮塔自身几何旋转中心）是**两套坐标系**，save/load 往返必须无损。
- 改动 `tanks/<id>.json` 格式必须向后兼容（`applyTankConfig` 要能吃旧数据）。
- 双导出：每个 `js/*.js` 底部带 `module.exports` 供 Node 测试。

## 4. 你是 RULES 的唯一写者

其他角色要新参数，**找你加**。加字段时同步：① `js/tank_rules.js`；② 需要暴露给设计器的进 `js/tank_schema.js` 的 `FIELD_ROWS`；③ 数值口径文档归口 `docs/specs/<卷>/` 对应主题页（**不要**再写 `DEVELOPMENT.md §5.5` —— 该章节已不存在，现行结构是 §0~§4）；④ 加一条「新 RULES 块必须有消费方」的哨兵断言（`scripts/test-recent-mods.js` 有先例）。

## 5. 验证

- 改动调 `node scripts/test-modifiers.js`、`test-model` 类与 `test-ai.js`、`test-boss.js`、`test-economy.js`、`test-enemy-scaling-audit.js`、`test-ally-command.js`。
- `test-ai.js` 的「#E7 反应延迟随距离增大」是**已知 flaky**（随机抖动采样）：单跑 2~3 次确认，别按真失败处理。
- 全链交给 `role-verify-docs`。
