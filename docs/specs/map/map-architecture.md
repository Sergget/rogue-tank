# 节点架构与敌军布点

> **摘要**：节点链与尺寸、布局度量与难度旋钮、类别化敌军与旧全向环带生成。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/map.md` §1 / §8 / §9（2026-10-21 拆分）
> **相关**：[防线式推进](./strip-defense.md) · [难度与地图生成重做](./difficulty.md) · [地面烘焙与相机](./ground-camera.md) · [沿革与未落地](./changelog.md)

## 目录
- [节点地图与大世界架构](#节点地图与大世界架构)
- [节点布局难度校准](#节点布局难度校准)
- [类别化敌军与生成机制](#类别化敌军与生成机制)

## 节点地图与大世界架构

（原 §1）

- **节点式大战场**：一局为一条线性节点链（默认 runNodeCount=5 节点）。每个节点是独立战场，地图尺寸约为视口的 9 倍（宽高各 ≥ 3 倍视口，满足 1:9 比例）。
- **节点生成器**：js/tank_nodegen.js 提供 7 内置模板（开阔走廊/密林阵地/城镇街区/交叉火力广场/混合障壁/村落中心/林地战线），generateNode(difficulty, {seed}) 确定性种子 RNG 生成，难度加权选模板 + 密度剔除随难度递减。
- **Boss 周期与开放式链（2026-08-24 落地）**：`isBossNodeIndex` 按 `(index+1)%RULES.nodeMap.bossInterval===0` 预标 Boss 节点并清空常规敌人；`extendRun(run)` 以原 seed 流确定性续接节点；`difficultyForIndex` 改为索引驱动饱和曲线并叠加跨局等级（详见 RULES.difficulty）；materializeNode 注入实体 `aiTriggerDist` 与 `aiTier`。**`bossInterval` 现行值为 3，见 [防线式推进 · Boss 循环](./strip-defense.md#boss-循环)。**
- **摄像机跟随与视口剔除**：js/tank_camera.js 实现指数阻尼平滑跟随 + 世界边界钳制；aabbInView（64px 余量）对掩体、树冠、炮弹进行高效视口剔除。**屏幕像素对齐的渲染取值见 [地面烘焙与相机](./ground-camera.md)。**
- **滚轮缩放（P-39，2026-08-24 落地）**：`RULES.camera`（minZoom 0.5 / maxZoom 2.0 / zoomStep 0.15）+ `createCamera` targetZoom/minZoom/maxZoom 字段 + `setZoom` 钳制入口 + `updateCamera` zoom 指数阻尼；tank_battle.html 滚轮改绑缩放（passive:false + preventDefault），以光标下世界点为焦点反解相机中心（zoom-to-cursor）。
- **小地图**：js/tank_minimap.js 右上角渲染战场边界、**公路走向**、掩体分布、友军据点、敌我动态标记与**生存模式补给点**（公路/补给点口径见 [strip 节点 · 渲染与工程配套](./strip-defense.md#渲染与工程配套)）。
- **水体/桥梁（P-20，历史）**：waterBridgeChance = diff×0.5 概率插入；水体不可通行（move:0）、桥梁通道（move:1）；尺寸封顶节点 40%，边界钳制防越界；玩家出生点 findPlayerSpawn 排除水域。**（已被 2026-09-14 水系重做取代：water/river `passability=0.4` 减速通行 + 完全浸入溺毙，现行值见 [河流与溺毙](./rivers.md)；本条仅存 P-20 时期的桥梁机制沿革。）**

## 节点布局难度校准

（原 §8，2026-08-26，P-43 切片(a)）

> *主题：布局度量口径（`nodeLayoutMetrics`）/ 难度旋钮当前值 / 实测剖面与回归带宽*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表；「难度旋钮」仍是现行值，剖面表为 2026-08-26 基线、后续已三次重锚（见 [可破坏楼房](./roads.md#可破坏楼房-building) 与 [建筑密度与 Boss 战图加成](./roads.md#建筑密度与-boss-战图加成)）。*

- **度量来源**：`js/tank_nodegen.js` `nodeLayoutMetrics(result, opts)` → `coverCoverage / connectivityRatio / losSymmetry / minPassageWidth / coverCount / waterArea`；回归脚本 `scripts/test-nodegen-calibration.js`（7 模板 × 5 难度 × 8 seed 锚定，已挂入 `npm test` 链）。
- **难度旋钮（当前值，`js/tank_nodegen.js` / `RULES.nodeMap`）**：
  - `cullRate = rng.range(0,0.12) * (1 - 0.7*diff)`（高难保留更多元素）
  - `wreckProb = 0.05 + 0.10*diff`
  - `RULES.nodeMap.coverWorldScale`：四个键缺一不可，现行值见 **[掩体世界缩放唯一口径](./cover-system.md#掩体世界缩放唯一口径-coverworldscale)**（本节不重复数值；`half` 无对应 tier）
  - 高难（diff>0.6）`bush/soft→barricade` 概率 `(diff-0.5)*0.4`；低难（diff<0.35）`barricade→soft` 概率 `(0.4-diff)*0.4`
  - `fullCullProtect=2`（每模板前 2 个 full 免剔除）
  - 密林/林地簇由 `placeForestClusters` 生成、**绕过 cullRate**，密度不随 diff 缩放（设计性分区，非难度旋钮可控）
- **实测剖面（scale=3，8-seed 均值；cov=coverCoverage, con=connectivityRatio, cnt=coverCount）**：

  | 模板 | d0.1 | d0.3 | d0.5 | d0.7 | d0.9 |
  |---|---|---|---|---|---|
  | corridor_tutorial | cov.064 con1.00 cnt13 | cov.075 con1.00 cnt14 | cov.073 con1.00 cnt14 | cov.067 con1.00 cnt14 | cov.075 con1.00 cnt14 |
  | forest_dense | cov1.14 con.88 cnt26 | cov1.14 con.88 cnt26 | cov1.15 con.75 cnt27 | cov1.17 con.38 cnt27 | cov1.16 con.63 cnt27 |
  | urban_block | cov.12 con.99 cnt37 | cov.13 con.99 cnt38 | cov.13 con.99 cnt39 | cov.14 con.99 cnt40 | cov.14 con.99 cnt40 |
  | crossfire_plaza | cov.11 con1.00 cnt34 | cov.11 con1.00 cnt34 | cov.11 con1.00 cnt35 | cov.12 con1.00 cnt35 | cov.12 con1.00 cnt35 |
  | mixed_barrier_plaza | cov.07 con1.00 cnt21 | cov.07 con1.00 cnt22 | cov.07 con1.00 cnt22 | cov.09 con1.00 cnt23 | cov.10 con1.00 cnt24 |
  | village_center | cov.15 con.98 cnt45 | cov.15 con.98 cnt46 | cov.17 con.98 cnt47 | cov.18 con.97 cnt47 | cov.19 con.97 cnt47 |
  | woodland_line | cov1.09 con.88 cnt28 | cov1.13 con.63 cnt27 | cov1.10 con1.00 cnt28 | cov1.12 con.63 cnt28 | cov1.12 con.63 cnt29 |

- **校准结论与带宽**：
  - 开阔模板（corridor/mixed/crossfire/urban/village）：con≈0.97–1.0，cov 随 diff **单调非降**（~0.06→0.19），难度曲线健康；回归带 `con≥0.85` 且 `cov[d=0.9] ≥ cov[d=0.1]`。

## 类别化敌军与生成机制

（原 §9，P-46，2026-09-06 落地）

> *主题：敌军 class 分类档案 / 数值锚定（`playerAnchorStats`）/ 多向环带布点（**已被防线式推进取代**）/ 回放确定性*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表；敌人数与防线口径现行值见 [防线式推进](./strip-defense.md)。*

- **类别化与生成机制优化已全线实施**：
  - `tanks/*.json` 增加可选 `class` 字段（light/medium/heavy/spg），缺省按数值启发式自动推导；`tanks/dummy.json` 标 `"target": true` 退出敌池。
  - `RULES.ai.classProfiles` 四类行为档案落地（轻型侧绕强化、中型基线、重型只进不退且抗晕、SPG 保持距离防逼近）。
  - `aiDecideEnemy` 类别分发落地：tier与class乘性合成 engage/aimTol，flankBias 调制 flank 窗口，moveLock/keepRange 调制移动语义，stunResist 决定抗晕。
  - 敌军「数值锚定制」落地（外观与数值彻底分离）：敌军彻底仅取几何外观与 class，数值统一锚定玩家出战时刻的 frozenstats 快照 `playerAnchorStats` × `enemyClassProfiles[class]` × 难度系数。
  - 多方向环带生成：废除旧右侧单向聚簇生成，改为以玩家出生点为原点，随难度递增的多扇区（2~4向）环带分布布点，保障全方位压制，带全网格净空兜底。**（该布点方式现已被 [防线式推进](./strip-defense.md) 取代，仅 Boss 节点与 `defenseLine.enabled=false` 时回退使用。）**
  - 战局确定性测试及 sim 回放全线接通，五节点回放 hash 重锚为 `d60b9022`（#A11 路网专轮后）。
  - 密林模板（forest_dense/woodland_line）：cov≈1.1（设计即密），con 随 rng 抖动 0.35–1.0（自然空间分区）；真实对局由 `makeNode` 的 `findPlayerSpawn` + `ensureLoSCorridor` 兜底可玩性。回归带 `con≥0.35`，**不做强行降密**以免破坏林相设计。
  - 当前参数**未做破坏性调整**（实测已满足难度曲线意图）。本切片交付 = 把实测剖面**锁定为回归锚点** + 文档化，使未来任何布局/难度旋钮改动都能被 `test-nodegen-calibration.js` 捕获劣化。
  - 注：密林模板若后续要做「高难更通透」可调 `placeForestClusters` 的簇数/spacing（机制已随 #A11 路网专轮落地，作为后续平衡调节旋钮保留）。

## 相关页面
- [防线式推进](./strip-defense.md) — 敌军布点的现行体系（取代本节的多向环带）
- [难度与地图生成重做](./difficulty.md) — 难度曲线与地图生成的设计要求
- [地面烘焙与相机](./ground-camera.md) — 摄像机跟随的渲染侧取值
- [沿革与未落地](./changelog.md) — P-20 桥梁体系与 P-46 前的布点原文
