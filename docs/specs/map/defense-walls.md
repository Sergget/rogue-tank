# 防线墙体

> **摘要**：沿垂直于玩家推进轴的方向布设成段竖墙（法线朝玩家、段间留通行口），把「随机散墙」变成可读的防御工事。
> **适用版本**：现行（2026-10-22）
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