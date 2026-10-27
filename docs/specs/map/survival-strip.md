# 生存模式与 strip 多行片

> **摘要**：生存模式复用标准 strip 生成链、多行片拼接与全模式的道路净空收尾。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/map.md` §24（2026-10-21 拆分）
> **相关**：[strip 节点与防线式推进](./strip-defense.md) · [地面烘焙与相机](./ground-camera.md) · [道路与路网](./roads.md) · [沿革与未落地](./changelog.md)

## 目录
- [生存模式生成链](#生存模式生成链)
- [多行片 chunkRows](#多行片-chunkrows)
- [道路上不得有房屋树木](#道路上不得有房屋树木)
- [校准与回归](#校准与回归)

## 生存模式生成链

（原 §24，2026-10-18 #U35，现行口径；§24.1）

> *主题：生存模式同一套 strip 链（§24.1）/ 多行片 `chunkRows`（§24.2）/ 道路上无房屋树木（§24.3）/ 校准基线（§24.4）/ 回归（§24.5）*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表。*

用户裁定（2026-10-18）：地图生成算法参考最新标准模式，但保留更大的单图。

- **删除两个 hack**：旧 `generateSurvivalRun` 靠 `bossOnly`（强制 Boss 标记）+ `stripForBoss`（强制走 strip）绕道。现改为**标准 `makeNode` 路径 + `env.noEnemies`**，`run.env` 里不再出现 `bossOnly`/`stripForBoss`（注：2026-10-27 起 Boss 战模式也走 strip 3×3，见 [尺寸与出生点](./difficulty.md#尺寸出生点与性能)）。
- **`env.noEnemies`**（`js/tank_map.js makeNode`）：常规敌军不生成（`defenseEnabled=false`、`targetCount=0`、`composition=[]`、不撒簇）、`quota=null`、`defenseLines=[]`、`boss=null`；其余字段（covers/roadJunctions/exitX 等）全部走标准路径。生存敌人由波次系统手动生成。
- **尺寸参数唯一归口** `RULES.nodeMap.strip.survival = { screensX: 5, screensY: 5, chunkRows: 2 }`。
- **实测尺寸（1280×720，8 seed）**：`7680×4645 ~ 7680×4741` ＝ **6.0×6.5~6.6 屏**，约 349 covers / **8.89 屏⁻¹**。
- **旧实现的缺陷（已修）**：`screensY=5` 但片高只有 ≈3.05 屏 ⇒ 纵向裁剪后上下留大块空白带（底部 400px 带内元素数 **0**）。现多行片让 `stripH = Σ行高`（由片决定，≈4600），**纵向不再裁剪** ⇒ 顶部空白 53→36px、底部 525→26px、底 400px 带元素数 0→15。

## 多行片 chunkRows

（原 §24.2）

- 缺省 `1` = 旧单行条带，**逐字节零回归**（`chunkRows` 缺省 vs 显式 1，covers JSON sha1 一致）。
- `>1`：按 **行×列** 网格铺片。列宽取各行同列最大值、行高取该行片高最大值、`stripH = Σ行高`；chunk 元数据补 `y0/row/col`；片内帧 `localRoads/localJunctions/localRivers` 同时平移 x 与 y（`rowCenterY`）。
- **每行横向路面保证**：每行沿中线 400px 采样，未覆盖的连续区段补 `groupId='strip-row-trunk'` 横向干道并并入 `junctions`（不耗 rng）。实测每行覆盖 19/19（单行时 row0 仅 2/19）。
- **行间接缝 = 推出而非整带删除**（v3 定稿，关键教训）：只处理「世界 AABB 真正跨过行界」的元素，沿 y 推到最近单侧、留 `ROW_SEAM_GAP=24`；完全落在某行内部的元素不动；推不出（界外/压路/与其它非地面元素重叠）才删。
  - **返工记录（避免重犯）**：v1 用「行界 ±300px 整带删除 structure/foliage」⇒ 在地图上劈出**整条 600px 横贯空白带**（seed=999 y2000~2600 连续 6 个 100px 细带元素数**全 0**）；v2 收窄到 ±110px 仍推出 ⇒ 空白带缩到 220px，但 seed=7 的 2300-2400 带变空。⇒ **行方向不是推进轴，不需要「留出可通行竖带」语义**，x 向接缝那套整带净空不能照搬到行方向。
- **`fillEmptyBands()`**：仅在 `chunkRows>1` 启用。任何 100px 等高带非 road 元素数 = 0 时，用确定性植被补 2~3 丛（位置由「带号+attempt+seed」hash 派生，不耗 rng、不跨行界、不压路、不压其它实体）。实测逐 seed 400px 空带 **0 个**；100px 空带仅剩两类合法情况——「整带被横向路面 100% 覆盖」与「<50px 边角薄片」。

## 道路上不得有房屋树木

（原 §24.3，全模式，用户硬性要求）

- **根因（已核实）**：strip 级路网 cover 是在**所有片生成完之后**才 push 进 `covers` 的，而逐片 `pruneOverlappingCovers`（含 #U32 避路）在片内跑，**看不到 strip 级路面** ⇒ 片内生出的建筑/树/灌木压路无人清理。旁路来源还有 `placeForestClusters` 的 `clampInside`（选点后钳回界内可能落上路面）与河岸植被 `groupId='riparian'`（strip 级路网之后生成、仅 AABB 粗判）。
- **修法**：新增 `clearCoversOnRoads(covers, roadCovers, opts)`，在 **`generateNode` 返回前**与 **`generateStrip` 收尾**（strip 级 road/river/植被全部 append + mud 收尾之后）各调用一次。
  - 判定：**verts 精确多边形相交**（顶点互入 + 边相交）；无 verts 的旧 OBB 段退化为四角多边形（与 SAT 等价）。**禁止只看 AABB / 中心距**——道路 cover 的 `w/h` 是整链 bbox（实测某链 1030×4645），按包络判会把整片地图判成「压路」。
  - 处理对象：`tierGroup ∈ {structure, foliage}`。`road`/`mud`/`river`/`water` 等 ground/liquid 一律不动。
  - 命中：先沿「背离最近路心」确定性最小推出（8 向兜底，与 #U32 prune 同口径），推不出（界外/仍压路/与其它非地面元素重叠）才移除。**全过程不耗 rng**（同 seed 逐字段可复现）。
  - 性能：AABB + 256px 边空间网格双重粗筛 ⇒ `test-strip` 实测 8.7s（远低于 300s 上限）。
- **实测（8 seed）**：生存压路 9/0/0/4/2 → **全 0**；标准模式 3 seed × 2 节点 → **0**。清理统计（单行 strip 17280×2376）：seed42 moved 14 / removed 0；seed7 moved 16 / removed 1；seed99 moved 13 / removed 0。

## 校准与回归

（原 §24.4 / §24.5）

**校准基线（§24.4）**：`scripts/test-nodegen-calibration.js` 与 HEAD 基线逐格对照（7 模板×5 难度×8 seed）：**coverCoverage 漂移 0.000000**（口径 ±0.02）、**connectivity 漂移 0.000000**（±0.05，7 模板×5 难度仍全 1.000）、**minPassageWidth 最大 0.168**（±0.5）——均未超口径，**BASE 一个没改**，仅在文件头重锚注释块追加一条带日期的漂移记录。当前最紧的是 `village_center d=0.1` 0.884→0.716（距 ±0.5 窗口下沿仅余 0.316），后续再叠加改动需重标定。

**回归覆盖（§24.5）**：

- `scripts/test-modes.js`：#U35 段——noEnemies / `quota=null` / 无 `bossOnly`+`stripForBoss` / `chunkRows` 与行元数据 / **逐 seed** 400px 与 100px 填满 / 上下极端带 / 每行横向路面 / **压路 = 0（3 seed × 2 模式）** / 补给站存在且不在路面水体上 / 标准模式零回归。合计 41 通过。
- `scripts/test-strip.js`：`chunkRows` 缺省 = 显式 1 逐字节一致、片数翻倍、`row/y0/col` 元数据、`stripH=Σ行高`、跨界 structure/foliage = 0、无 400px 空带、每行有横向路面、多行无压路。

## 生存模式 3×3 屏 + 四角补给点（2026-10-22 第五批）

**用户裁定**：①「缩小地图」；②「补给点增加为 4 个，4 个角落各 1 个，且需要避开坦克不能到达、不能停留的位置」。

### 地图尺寸：3×3 屏

唯一配置源 `RULES.nodeMap.strip.survival = { screensX: 3, screensY: 3, chunkRows: 1, chunkCount: 1 }`。

> ⚠️ **为什么必须同时给 chunkCount**：`generateStrip` 的宽度**不是**由 screensX 直接决定——`chunkCount = opts.chunkCount || max(2, round(screensX/3.5))`，每片宽由 `nodeScaleFor` 保证 ≥3 屏。只把 screensX 改成 3 仍会得到 2 列 ≈6 屏。显式 `chunkCount: 1` + `chunkRows: 1` ⇒ 1 列 × 1 行、片宽下限 3 屏 ⇒ 世界 ≈3×3 屏。

**沿革**：2026-10-18 #U35 曾定为 `{screensX:5, screensY:5, chunkRows:2}`（实测 6.00×6.45~6.67 屏）；2026-10-22 用户要求缩小地图，改为 3×3。标准模式 strip 节点不受影响（仍 ≈10×2.2 屏）。

### 补给点：4 个、四角各 1

唯一配置源 `RULES.nodeMap.strip.survivalSupply`：

| 键 | 值 | 语义 |
|---|---|---|
| `count` | 4 | 站点数（四角各 1） |
| `cornerMargin` | 0.14 | 四角候选中心 = (0.14w, 0.14h) / (0.86w, 0.14h) / (0.14w, 0.86h) / (0.86w, 0.86h) |
| `searchRadius` / searchRadiusMax | 180 / 320 px | 每角螺旋搜索半径（失败后放宽） |
| `minStationDist` | 700 px | 站点彼此最小间距（3×3 屏下 1500 太远） |
| `minPlayerDist` | 520 px | 距玩家出生点最小距离 |
| `coverPad` | 60 px | 掩体避让外扩 |
| `reachGrid` | 40 px | 可达性 BFS 网格步长 |

**选址约束**（对应「避开坦克不能到达、不能停留的位置」）：

1. 不在 `passability===0`（wall / rock / perm_block 等）或整发挡弹（full / building / intact / rock / wall）的掩体内（padding `coverPad`）；
2. 不在 `water` / `river` 上（溺毙风险 = 不能停留）；
3. **从玩家出生点可达**——新增 `isReachableFromSpawn(node, pt, cfg)`：以 `passability===0` 的 cover 为阻挡（含 20px 半径），在 [0,w]×[0,h] 上以 `reachGrid` 建网格做 8 邻域 BFS，从 `node.playerSpawn` 洪泛；目标格可达即 true。**网格缓存**在 `node._reachGrid`（同节点只建一次）。

**沿革（不静默删除）**：改前 `placeSupplyStations` 恒 **3 个**站点，只有几何避让（`pointInCover(covers,x,y,80)`）+ 两个距离下限（900 / 1500px），**没有任何可达性判定**——「坦克不能到达」的角落也可能刷出补给点。

**回归**：`scripts/test-modes.js` 断言「恰好 4 个 / 每象限 1 个 / 全部 BFS 可达 / 不在水体与实体掩体内」（40 seed 扫描）；同时把 areaRatio 断言从 ≈2.0x 重锚为 ≈0.45x（3×3 屏 vs 标准 ≈10×2.2 屏）。

## 相关页面
- [strip 节点与防线式推进](./strip-defense.md) — `generateStrip` 的片拼接与接缝净空
- [地面烘焙与相机](./ground-camera.md) — 多行片下的 `biomeZones` 2 维化（`rowsPlan` 来源）
- [道路与路网](./roads.md) — `clearCoversOnRoads` 依赖的 `verts` 多边形口径
- [沿革与未落地](./changelog.md) — 生存模式 `bossOnly`/`stripForBoss` 时代的原文
