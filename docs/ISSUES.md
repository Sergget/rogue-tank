# Rogue Tank — 工程问题清单（已核实）

> **本文档是临时文档**：只存放**待处理 / 处理中**的已核实问题。
> 条目**修复并验证有效后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。

## QA Test Infrastructure Issues（2026-08-19）

> 当前无待处理问题。

---

> 已解决并归档的历史条目（#1~#26, #44, #49, #60~#75 及修复记录、附注特性）：见 `ARCHIVE.md`.

---

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

## 平衡与系统接线问题（2026-08-26，#A1~#A16）


### #A9. 半高掩体实战低生效评估（属实，三条件互斥）

**状态：** 已缓解（D5 半高禁令 + #A8 修复落地；彻底剥离按 D5 延后决策）

**可复现证据链：**
- 交战距离短（engageRange=520/keepRange 320，`tank_rules.js:322,326`）使 C 插值豁免几乎恒成立。
- 炮塔恒露让敌方打炮塔即可绕过整个 half 模型（Ttk≈3发）。
- AI 仅 coverSeek（`tank_ai.js:333` 重甲+hp<60%+500px）才用 half，且 half vision:false 不遮视线（`tank_cover.js:447-455`+`tank_rules.js:94`）。
- 再叠 A8 瞬移 bug 观感恶化。

**剥离可行性：**
- 最小方案 half.shellBlock 'grad'→true + exposureProfile:'full'，可删 shellVerticalDecision/C 插值子系统（`tank_fire.js:16-39,347-355,371-378` + `tank_cover.js:399-419`）。
- 联动项：`tank_ai.js:333`、`tank_nodegen.js:958-962`、docs/specs/map.md §2、test-covers/test-fire/test-extreme-cover。
- ruined 共享 exposureProfile:'half'（`tank_rules.js:109`）需一并裁定。

**反向意见：** half 是"打炮塔破掩体位"战术深度唯一载体，建议先修 A8 再观察数据。

**定案（2026-08-28）：**
- **D5 已落地源头缓解**：`generateNode` 主循环 `if (tier === 'half') continue;` 禁止半高掩体实例落位（`test-nodegen-snapshot.js` 断言 halfViolations=0），实战中不再生成 half 掩体 → 「三条件互斥下的低生效」在生成层面已中和。
- **反向意见条件已满足**：原"先修 A8 再观察数据"前提（瞬移 bug）已于 2026-08-26 修复（specs/combat.md §5.1），全程无半高掩体生成，无现场数据可再观测。
- **彻底剥离延后**：受 D5 明确裁定——待游玩测试后再决定是否剥离子系统；且 `ruined` 残破建筑共享 `exposureProfile:'half'`+`shellBlock:'grad'`（`tank_rules.js:109`），half 子系统并非死代码，强行剥离会破坏残缺建筑遮蔽，必须在剥离时同步裁定 ruined 归属。

---

### #A11. 地形占位冲突：道路/水域任意叠加 + 道路不贯穿

**状态：** 待处理

**可复现证据：**
- 村庄道路落位零检测（`tank_nodegen.js:641` 直接 push，不避让模板 items:161 与林地簇:1037-1041）。
- edgeRiver 零检测（:482-510）；中央水潭 25 相位全失败兜底强制居中（:456）仍叠加。
- P-20 水体/桥有检测（:1072-1148）。
- 道路单街长度仅模板边长×[0.55~0.75]（:617）不到达边缘即止+折线偏转±0.08~0.22rad 造成断裂；道路只是村落附属层非地图骨架。

**影响：** 道路与建筑/林地/水域任意重叠；路网断裂不贯穿。

**处理方向：** generateNode 最前新增地图级路网阶段（2~3 条贯穿主干道 polyline + 分支 + occupied 集合复用 obbPairHits:583-593），village 层沿路网选簇心，edgeRiver 加 rectHitsCover（压路处放 bridge 反成特性），去掉水潭强制居中。约 +150 行中等重构。

**试探结论（2026-08-28，四向侦察，均回滚保持绿树）**：凡触碰 `placeVillage` 道路/`placeEdgeRiver`/`placeCentralPond` 的任意小改都会连锁漂移 `nodeLayoutMetrics` 校准带，且部分击穿设计地板（不可仅靠重锚基线）——

| 改动 | 结果 | 是否可重锚 |
|---|---|---|
| 道路加长至 0.82~0.92×（贯穿）+ 更缓折线 | urban/crossfire/village 三模板 connectivity 0.99→0.83~0.87，**击穿 0.85 开阔地板**（village_center 0.74） | ✗ 地板硬违例 |
| 仅道路加长（无避让） | 同上，connectivity 0.83~0.87 仍破 0.85 | ✗ |
| 道路段间避让侧移（obbHits 法向 nudge） | minPassage 乱升乱降、connectivity 更低 | ✗ |
| edgeRiver 段跳过压物段 | forest_dense d=0.7 connectivity 0.375→0.250 **击穿 0.35 密林地板** | ✗ |
| 中央水潭去强制居中（无落点则跳过） | 效果正确（减覆盖+加通路）但 coverCoverage 0.106→0.074、非降断言破坏 | 可重锚但需随重构一并 |

**根因**：道路长度与「沿街建筑落位」（placeVillage 第二层 4~7 栋，沿 roads 随机分散）强耦合——加长道路会把建筑推向地图边缘成排成墙，压低网格可达性；而边缘河流/中央水潭均计入 coverCoverage/connectivity/minPassage，任何增删都需重锚。**正确的路线是 issue 处理方向所述：generateNode 最前新增地图级路网阶段（先路后物、占用集合反选），而非对现有分层做增量打补丁。** 该重构必须专轮实施：重锚 7 模板校准 BASE + 论证三地板（开阔 0.85/密林 0.35/覆盖非降）不破 + 回放 hash 重锚 + 5 模板逐难度人工核对。

---


