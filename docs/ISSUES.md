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

**状态：** 待处理（剩余范围：设计器 verts UI）

---

> 其余历史问题（#76~#77、#79~#82、#84~#85 等）：已全部解决并归档，见 `ARCHIVE.md` 索引表 2026-08-24 条目。

---
