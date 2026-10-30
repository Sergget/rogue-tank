# 防线墙体

> **摘要**：沿垂直于玩家推进轴的方向布设成段竖墙（法线朝玩家、段间留通行口），把「随机散墙」变成可读的防御工事；每道防线另有 5 个点位带与点位掩体段。
> **适用版本**：现行（2026-10-30）
> **源自**：2026-10-22 用户反馈「地图掩体的摆放过于随机，要呈现 1 个防线的样子，防御玩家可能进攻的 2-3 个方向」新建
> **相关**：[掩体体系](./cover-system.md) · [敌人强度与难度](./difficulty.md) · [strip 条带生成](./strip-defense.md)

## 为什么需要这一页

改前墙体只有 `placeJunctionWalls`（路口环带随机墙）一种来源——**不知道玩家出生点、不知道敌军防线**，墙随机散在路口四周；而敌军却按 `planDefenseLines`（`js/tank_map.js`）成防线分布 ⇒ 视觉上「墙随机、敌人成线」，玩家读不出「我在进攻一道防线」。

## 设计（唯一数值口径 = `RULES.nodeMap.defenseWalls`）

| 键 | 值 | 语义 |
|---|---|---|
| `enabled` | true | 总开关（false = 回退旧行为：只有路口随机墙） |
| `linesMin / linesMax` | 1 / 2 | 防线墙体道数区间（实际道数由调用方按敌军防线数传入） |
| `segLenMin / segLenMax` | 110 / 190 px | 单段墙长 |
| `thick` | 26 px | 墙厚（与 `junctionBarricades.wallThick` 同口径） |
| `gapMin / gapMax` | 90 / 150 px | **通行口**（两段墙之间的缺口）——保证必有一条可通行走廊 |
| `breakableChance` | 0.45 | 可摧毁掩体占比（与路口墙同口径） |
| `jitter` | 0.10 rad | 每段墙的角度抖动——防线不是直线阅兵 |
| `avoidRoad / roadPad` | true / 10 px | 避让路面：竖墙横穿路面会封死道路；路面处自然形成**咽喉口** |

## 布防逻辑（`js/tank_nodegen.js placeDefenseWalls(rng, covers, opts)`）

1. **方向**：玩家固定从左缘出生、沿推进轴向右 ⇒ 防线 = **竖直墙段**（`angle = π/2 ± jitter`），法线朝左（正对玩家）。实测 8 seed × 全部墙段，**法线朝向玩家 = 100%**。
2. **道数与位置**：`linesWanted` 由调用方传敌军防线数；每道 x **优先对齐敌军防线锚点**（`opts.anchorXs`，把墙修在敌人守的位置），不在带内/冲突时退化为「出生点右侧 35%~80% 世界宽」带内均匀取。
3. **竖墙铺段**：每道沿世界 y 从 -2% 铺到 102%，段长/缺口按 cfg 区间抽取；被拒（压掩体/压路面）时前进 `min(len×0.5, 60)` 再试。
4. **整列重试**：该 x 被横贯河流带/建筑群大面积卡死（整列成果 <2 段）时**水平平移 ±(160~240)px 重试**，最多 5 次——strip 的横贯河流是常态，硬贴锚点会出「只有边缘段」。
5. **避让**：压已放置掩体（建筑/水体/岩石/其它墙，pad 8）与压路面（`obbHitsCover` 吃 `roadCoversToSegments` 短段，pad = roadPad）都拒绝。
6. **标记**：每段带 `defenseLine: true`（测试/审计可识别）；tier 按 `breakableChance` 在 `wall / wall_breakable` 间抽取。

## 调用时机与守卫（`js/tank_map.js makeNode`）

- **在敌军防线规划完成后**（`planDefenseLines` → `defense`）、敌人生成之前调用——墙先落位，`hitsCover` 敌人生成拒绝采样自然把敌人排在墙后；
- **Boss 节点跳过**（`defense.enabled` 已含 `!isBossNodeIndex` 门控——Boss 战地图有独立掩体验收断言）；
- **世界高下限守卫**：`h ≥ segLenMin×2 + gapMin`（矮世界塞不下两段，跳过避免「只塞 1 段」的尴尬）；
- **跨模块引用走 `globalThis`**（`placeDefenseWalls / roadCoversToSegments`）：浏览器里 nodegen 先于 map 加载即为全局；Node 测试端需显式挂到 global（见 `scripts/test-batch5-combat.js`）；裸标识符会让 tsc 报 TS2304。

## 「2-3 个进攻方向」怎么覆盖

玩家可能进攻的方向 = 左/左上/左下（出生点在左缘中部）。竖墙按世界高度分段铺满（上下缘都顶到），**正面、上包抄、下包抄**三条路线都必须穿过墙或绕行通行口；路面处被避让规则留出的缺口正好是「敌人的预设火力口」——防线读法完整：`墙后是守军（敌军防线锚点对齐），墙前是开阔地，墙上开门。`

## 防线点位带与点位掩体段（2026-10-30）

> 用户指认：「要在生成地图时预先设计好 3-4 条防线，比如路口、城镇边缘、中心、树林内部等处，并设计好敌人的生成点位、点位周边要有掩体以防御玩家的进攻」。

**改前**：每道防线只有 `anchorsPerLine = 1` 个锚点，波次投送时靠 `slotPos` 以锚点为中心沿 y 展开一排 ⇒ 敌人「围着玩家随机散开」的观感，且没有任何点位级掩体（`placeDefenseWalls` 的竖墙列落在**防线中心 x**，而守军站在它前方，等于墙在身后）。

### 1) 点位带（`js/tank_map.js planDefenseLines`）

每道防线沿 y 生成 `spotsPerLine = 5` 个点位，x 取防线 bucket 中心、y 在 `h×0.12 ~ h×0.88` 均匀铺 + ±40 抖动，再**就近吸附**到 150px 内的候选（`collectDefenseAnchors` 的 structure / junction / foliage 池——即「路口、城镇边缘、中心、树林内部」）。无候选时保留均匀点位。结果写进 `line.lineSpots`，并持久化到 `node.encounterAnchors[lineIdx]`（`[{x,y,kind}] × 5`）。

旧 `anchors`（单锚点）保留：`targetCount` 铺敌口径仍依赖它，`slotPos` 的单锚点分支也保留兼容。

### 2) 点位掩体段

`encounter` 节点在**点位带前方**生成竖墙段（`angle = π/2`、长 110~200、厚 22、`tier='wall'`、`wallStyle='concrete'`、`defenseLine: true`）：

| 项 | 值 | 语义 |
|---|---|---|
| 墙平面 x | `spot.x − 230` | 落在**最前一档纵深之前**（heavy 在 `spot.x − 160`，见 `tank_battle.html` 的 `CLS_DEPTH`）⇒ 整条防线都在工事之后 |
| 墙中心 y | `spot.y + 间距/2` | 错开点位，成锯齿状一条防线；点位正前方留空 = 守军的**射击口**，不会被自家墙堵住炮线 |
| 墙长 | `clamp(间距×1.1, 110, 200)` | 覆盖进攻通道的大部分，两端留绕行口 |
| 去重 | 130px 内已有墙则跳过 | 避免与 `placeDefenseWalls` 的列叠成两层 |

生成在 `generateNode` **之后**追加，故末尾必须再跑一遍 `clearCoversOnRoads`（否则竖墙压路面，`test-modes` 的「structure/foliage 不得压路」不变量会红）。

### 3) 生成落位（`tank_battle.html battleSpawnWaveUnits`）

- 波次 i 绑定防线 `i % lineCount`；同波 N 个单位在 5 个点位上**等距取样**（`slotPos` 折线插值），不再随机散布。
- 阵内纵深（用户裁定「重坦、中坦靠前、轻坦在侧翼、td、自行火炮在最后」）沿 **-x 递增**：
  `CLS_DEPTH = { heavy: 160, medium: 110, td: 60, spg: -10, light: 60 }`，落位 `x = spot.x − depth`；`light` 另有 y ±200 侧翼偏移。
  ⚠ 2026-10-30 修正：旧 `CLS_FRONT_OFFSET`（heavy 0 / spg 160）数值与语义**相反**，层级实际是倒的。
- y 抖动改为确定性序列 `((slot×37) % 41) − 20`（不引 `Math.random`，不污染截图基线）。
- 落位校验压掩体时沿 -x 再推 40px 重试（推离墙，不挤进墙）。

**验证**：`test-map` 4 条断言（每防线 5 点位 / y 跨度 >30% 图高 / 掩体段 ≥60% 点位 / tier=wall 族）；`probe-line-formation.cjs` 实测相邻间距变异系数 0.6%~1.9%；实机截图确认「竖墙成线、守军在墙后、射击口留空」。

## 实测效果（2026-10-22，5 seed × 标准节点 idx=1）

| seed | 防线墙 | 每道段数 | 道中心 x |
|---|---|---|---|
| 1 | 5 | 2,2,1 | 5760 / 7140~7380 |
| 2 | 4 | 2,2 | 4140 / 5760 |
| 3 | 4 | 2,2 | 4140 / 7380 |
| 4 | 5 | 2,3 | 5760 / 7380 |
| 5 | 2 | 1,1 | 4620 / 7740 |

## 相关页面
- [掩体体系](./cover-system.md) — wall / wall_breakable 的 tier 定义与部位裁剪（防线墙的两级强度语义在此）
- [敌人强度与难度](./difficulty.md) — 敌军防线（planDefenseLines）的锚点规划，防线墙 x 对齐其锚点
- [strip 条带生成](./strip-defense.md) — 标准模式主路径（≈10×2.2 屏），防线墙的主要舞台