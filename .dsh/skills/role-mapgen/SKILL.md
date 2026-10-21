---
name: role-mapgen
description: Use when the task touches terrain generation, node layout, cover tiers, strip road networks, rivers, camera or minimap in Rogue Tank. Owns js/tank_nodegen.js, tank_cover.js, tank_map.js, tank_camera.js, tank_minimap.js.
---

# Role: mapgen（地形生成与节点）

**系统归口**：`docs/specs/map/`（wiki 正文，2026-10-21 起）：节点架构 → `map-architecture.md`；掩体 tier/尺寸/收敛 → `cover-system.md`；地形抽象 → `terrain.md`；路网/避路/弯形 → `roads.md`；河流/溺毙/互斥 → `rivers.md`；strip/防线 → `strip-defense.md`；难度 → `difficulty.md`；贴图烘焙/审核标准 → `textures.md`；地面烘焙与相机 → `ground-camera.md`；生存模式 → `survival-strip.md`。**索引见 `docs/specs/map/index.md`**；`docs/specs/map.md` 仅为 §N 兼容索引页（**勿当正文写**）。
**项目状态**：`docs/DEVELOPMENT.md` §3
**改 specs 前必读**：`docs/WIKI-STYLE.md` + `AGENTS.md` §2.3（wiki 三步：改主题页 → 对齐兼容页摘要 → 跑 `node scripts/wiki-check.js`）

## 1. 你拥有的文件

- `js/tank_nodegen.js`（245KB，最大模块）— 7 内置模板、`generateNode`、`placeRoadNetwork` v4 七拓扑、`generateStrip`、`clearCoversOnRoads`、`bakeNodeGroundLayer` 相关
- `js/tank_cover.js` — `covers` 注册表、`getExposure`、`findCoversOnPath`/`findCoversOnRay`、`getCoverUnderTank`、`damageCover`/`destroyCover`、OBB/compound 碰撞、`smokeClouds`、`hasLineOfSight`
- `js/tank_map.js` — `generateRun`/`makeNode`/`scoreNode`/`materializeNode`/`extendRun`、难度曲线、player 出生点（`w×0.10`）、`reinforcementTick`
- `js/tank_camera.js` — `createCamera`/`updateCamera`/`viewBounds`/`aabbInView`、`visionRadiusForViewport`、**`renderCamPos`**
- `js/tank_minimap.js` — `minimapLayout`/`worldToMinimap`/`drawMinimap`、`roadCoverPolygonPoints`、`minimapSupplyMarks`

## 2. 现行口径（2026-10-19 核实）

1. **掩体 tier 全集以 `RULES.coverTiers`（`js/tank_rules.js`）为唯一口径**。`half`（半高）**已于 2026-09-20 #E3 整体删除**——tier 定义、`RULES.heights.cover.half`、`getExposure` 越掩插值、`shellBlock:'grad'` 拦截链、`s.dec` 曝光缓存全部移除。残破建筑 `ruined` 归入全高确定性挡弹；`stump`/`rubble` 残骸**不再挡弹**。
2. **水域**：`water`/`river` 炮弹越飞（`shellBlock:false`），坦克减速通行（`passability:0.4`）；完全浸入 8s 溺毙（`RULES.drowning`），**Boss 免疫**（2026-10-15 用户裁定）。河宽硬上限 `RULES.drowning.wadeMaxWidth=260`（2026-10-18 #U37）。
3. **路网**：`placeRoadNetwork` v4 七拓扑（A贯通/B十字/C单侧T/E双侧T/D双平行/G网格街区/I双干贯穿）。**道路上不得有房屋/树木**——strip 级路网在片生成之后才 append，片内 prune 看不见它，必须靠 **`clearCoversOnRoads` verts 精判收尾**（2026-10-18 #U35）。
4. **strip 节点**：`generateStrip` + `opts.chunkRows` 多行片（缺省 1 逐字节零回归）+ `fillEmptyBands` 补植；常规节点走 strip 路径，**Boss 保持方形**；生存模式已并入标准 strip 链（`env.noEnemies` + `RULES.nodeMap.strip.survival`），单图 6.0×6.5~6.6 屏。
5. **相机**：`renderCamPos` 是**渲染专用**位置（屏幕像素对齐 `round(x·zoom)/zoom`）；物理/AI/命中仍读浮点 `cam.x/cam.y`。世界空间取整是错的（zoom 1.6 实测反而更差）。
6. **小地图**：road 的 `verts` 是**局部坐标**，需逐点 `worldToMinimap` 换算（适配 strip 的 `sx≠sy`）。
7. **地面层**：`drawGroundCached`/`ensureGroundCache` 视口锚定滚动烘焙；`biomeZones` 是 **2 维矩形**（1 维 x 带会在下行片重叠）。
8. **河流与路网互斥**：非法交叉必须为 0（2026-10-18 #U33）；河路平行需避让（拉直/平移兜底）。河宽沿程变化用数据层双正弦波。

## 3. 硬约束

- `covers` 与 `entities` 都是全局唯一数组，**不得在页面脚本重复声明**。
- `COVER_DIRECTION_TOLERANCE = 16px` 是敏感常量，改动前必须有 Node 断言证据。
- `getExposure` 有两处消费（`shellVerticalDecision` 实时拦截 / `updateSolution` 瞄准预测），**两处必须同口径**。
- 树不可碾（坦克被顶回）；只有可破坏 tier 在接触时销毁。状态只有 `(tier, hp)`，**没有** `.crushed`/`.remnant` 字段。
- 视野（`hasLineOfSight`，bush/tree-crown + 烟幕）与弹道遮挡（`getExposure`）**是两个系统**，互不替代。

## 4. 调参边界

新增 tier、宽度、密度、难度曲线常量属于 `role-systems` 写域（`js/tank_rules.js` 的 `RULES.coverTiers` / `RULES.nodeMap` / `RULES.drowning`）。**提需求，不直接改。**

## 5. 验证

生成器改动必须跑 `node scripts/test-nodegen.js`、`test-strip.js`（重负载，单测上限 300s）、`test-map.js`、`test-nodegen-calibration.js`。
**校准基线漂移是高发回归**：改动会推动 `test-nodegen-calibration.js` 基线表、`test-replay.js` hash、4 条 browser 链。基线重标定需给出实测数据，不得"改数字让它过"。

审计脚本 `scripts/audit-map-gen.js` 现有既有硬失败（见 `docs/PLAN.md` §2.4），**不要把它当成你改坏的**。
