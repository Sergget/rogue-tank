# Rogue Tank — 工程问题清单（已核实）

> **本文档是临时文档**：只存放**待处理 / 处理中**的已核实问题。
> 条目**修复并验证有效后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。

## QA Test Infrastructure Issues（2026-08-19）

> 当前无待处理问题。

---

> 已解决并归档的历史条目（#1~#26, #44, #49, #60~#75 及修复记录、附注特性）：见 `ARCHIVE.md`.

## 玩法设计问题（2026-08-24）

### #78. 掩体形状单一(矩形为主)，缺不规则岩石/连续曲线水域/烂泥减速地形

**可复现证据：**
- 引擎已支持多边形顶点：`coverCorners`/`coverCollisionParts` 当 `cov.verts≥3` 走多边形（`js/tank_cover.js:143-156`），`findCoversOnRay` 也消费多边形角点；但 7 个模板中仅 `urban_block`（`js/tank_nodegen.js:113-125`）、`village_center`（`js/tank_nodegen.js:207-219`）各 1 个掩体用 `verts`/`collisionVerts`，且只是"矩形+缺口"，并非不规则岩石。其余 ~115 个元素全是 `w/h/angle` 矩形 OBB。
- `RULES.coverTiers`（`js/tank_rules.js:81-92`）现有 tier：half/full/bush/tree/fallen/soft/barricade/stump/rubble/water/bridge；**无 rock、无 mud**。
- 水域 `water` 是 `mode:'solid'` 且 `draw:'box'`（`tank_rules.js:91`）：① 矩形 OBB 而非连续曲线；② `mode:'solid'` 既挡炮弹又因 `move:0.0` 完全阻断移动，非单纯地形。且仅"每节点≤1、概率 diff*0.5、封顶 40% 节点尺寸"生成（`js/tank_nodegen.js:476-491`）。
- 烂泥地（拖慢、不挡弹）：系统把"地形/掩体"统一抽象为 `covers` 数组，**无独立地面地形图层**；`driveTank` 运动系数取自 `COVER_TIERS[tier].move`（`js/tank_move.js:24-40`），`resolveCoverCollisions` 仅对 `solid` 推出（`js/tank_move.js:52`）。现有 tier 中无"减速但不挡弹"的地面地形（soft 可击毁、half 参与弹道遮蔽）。

**根因：** 数据层未充分利用引擎既有的多边形顶点能力；缺 rock/mud tier 与"减速不挡弹"地形图层概念。

**影响：** 地形同质化，缺自然掩体形态（不规则岩石、连续曲线水域）与减速地形博弈。

**进展（2026-08-24）**：随 P-40 部分解决——RULES.coverTiers 新增 mud/rock tier、nodegen 地形标签生成八边形 verts 水潭与多段河流（不规则形态已进生成层）；剩余范围：设计器侧 verts 多边形创作 UI、更多不规则掩体形态模板。

**状态：** 待处理

### #83. 敌方 AI 开局一次性生成，缺进度推进/镜头外递增生成

**可复现证据：**
- `js/tank_map.js:442-454` `materializeNode` 遍历 `node.enemies` 在节点实体化时**一次性** `env.spawnTank(...)` 全部敌人；`tank_mvp.html:674-695` `enterBattle` 调 `materializeNode`，所有敌方坦克+据点同时生成，Boss `summons`(:713-731) 亦同一时刻全量生成。
- 无波次/配额/镜头外进度生成：`grep wave|quota|killTarget` 在 `tank_mvp.html`/`tank_map.js` 无触发生成的机制；唯一 `spawnTank` 调用即开局批次与 Boss 召唤。
- 清场判定为"击杀全部初始生成"：`tank_mvp.html:739-741` `livingNodeEnemies()` 返回 `nodeSpawn && team==='enemy' && hp>0`，该列表清空即节点结束；无超出初始批次的击杀目标。

**根因：** 敌方生成完全前置且批量；无随节点进度/镜头外动态生成机制与击杀配额。

**影响：** 每节点战斗密度固定、缺乏"随推进增兵"的压迫感；单局可击杀数受限于初始批次。

**状态：** 待处理

---
