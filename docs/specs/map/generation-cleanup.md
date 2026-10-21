# 2026-10-20 批次收口修正

> **摘要**：补偿缩放键、出生点判据、水域收尾顺序、未注册 tier 兜底与死配置清理。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/map.md` §27（2026-10-21 拆分）
> **相关**：[掩体体系](./cover-system.md) · [河流、水域与溺毙](./rivers.md) · [难度曲线与地图生成重做](./difficulty.md) · [沿革与未落地](./changelog.md)

## 目录
- [本批定位](#本批定位)
- [coverWorldScale 补 building](#coverworldscale-补-building)
- [出生点判据与液态地形排除](#出生点判据与液态地形排除)
- [水域收尾顺序与真多边形判定](#水域收尾顺序与真多边形判定)
- [未注册 tier 的两套兜底语义](#未注册-tier-的两套兜底语义)
- [directionTolerance 与缓存](#directiontolerance-与缓存)
- [死配置清理与一处误判纠正](#死配置清理与一处误判纠正)
- [回归覆盖](#回归覆盖)

## 本批定位

（原 §27 引子，2026-10-20 批次：#W15 / #W16-② / #W17 / #W18 / #X2 / #X3）

> *主题：`coverWorldScale` 补 building（§27.1）/ 出生点判据与液态排除（§27.2）/ 水域收尾顺序（§27.3）/ 未注册 tier 兜底（§27.4）/ `directionTolerance` 与缓存（§27.5）/ 死配置清理（§27.6）/ 回归（§27.7）*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表。*

本节收口 2026-10-20 批次地图侧的全部现行口径。**逐条数值以对应实现文件为唯一口径**，本节只记语义与归口，不重复罗列参数表。

## coverWorldScale 补 building

（原 §27.1，#W18-1）

**现行值见 [掩体世界缩放唯一口径](./cover-system.md#掩体世界缩放唯一口径-coverworldscale)（本节不复写数值）。** 本节只记本批次为何补这个键。

**根因**：可破坏楼房 tier `building`（见 [可破坏楼房](./roads.md#可破坏楼房-building)）此前**不在缩放表内** ⇒ `coverWorldScale['building']` 为 `undefined`，`js/tank_nodegen.js` 的 `sizeFactor` 分支回落 `1`（**不减算**）⇒ 此类掩体的世界尺寸显著大于 `full`，同为全高建筑却观感与判定比例不同源。`building` 与 `full` 同系数表示「同为建筑体量」。**具体数值见 [掩体世界缩放唯一口径](./cover-system.md#掩体世界缩放唯一口径-coverworldscale)。**

**沿革注记（2026-10-21 修正）**：本段原文写「`js/tank_cover.js` 的 `coverWorldScale`（三处：约 `:122` / `:135` / `:167`）」——**该 file:line 指向已过期**：`coverWorldScale` 的唯一定义处是 `RULES`（`js/tank_rules.js:593`），`js/tank_cover.js` 内无此表；`:122/:135/:167` 是 2026-10-20 当时 `docs/specs/map.md` 自身的行号，不是代码位置。阅读时以 [掩体世界缩放唯一口径](./cover-system.md#掩体世界缩放唯一口径-coverworldscale) 为数值口径、以 `RULES.nodeMap.coverWorldScale` 为代码口径。

## 出生点判据与液态地形排除

（原 §27.2，#W18-2 + #X3，2026-10-20）

**`tierBlocksSpawn` 判据（现行三支）**：

```js
passability === 0 || shellBlock === true || shellBlock === 'single'
```

`shellBlock === 'single'` 一支为 2026-10-20 补入（此前漏判，导致某些"只挡单发"的 tier 被当作可通行出生点）。源码位置 `js/tank_map.js:493-497`。

**沿革（两值判据为何会误导）**：本节原文只写 `passability === 0 || shellBlock`——`shellBlock` 作为 truthy 值恰好仍把 `'single'` 判为阻挡，但写成两值判据会让人误以为 `'single'` 与 `false` 同义（`'single'` 是字符串、`true` 是布尔，二者在 `tank_fire` 侧走不同分支）。2026-10-20 #W18-2 补为**显式三支**。

**#X3 液态地形不可出生（2026-10-20 新增）**：`js/tank_map.js` 拆成**两个谓词**——

| 谓词 | 用途 | 判定集合 |
|---|---|---|
| 清场谓词 | 出生点周围**推除/清理**元素 | **只认阻挡物**（原 `tierBlocksSpawn`） |
| 选址谓词 | 出生点**选址合法性** | 阻挡物 **∪ 液态地形**（`water`/`river`） |

**为什么不直接改 `tierBlocksSpawn`（关键，勿回退）**：该谓词被「清场 splice」复用——把水域并入它会**把河段当阻挡物删掉**，直接打断河流拓扑（属 #T4 回归）。因此只能拆两个谓词。

`findPlayerSpawn` 的兜底点同样加水域复核 + 就近推出。**实测玩家落水 0/100 节点**（改前 60 节点有 1 例）。

**#X3 敌方侧澄清（ISSUES 原文判断有误）**：原文称「敌人生成无避水校验」，实测 **该侧不成立**——`hitsCover`（约 `:540`）走**全量 covers（含水域）**，720 敌 **0 例**落水。⇒ **该侧未改动代码**。

## 水域收尾顺序与真多边形判定

（原 §27.3，#X2，2026-10-20）

**`clearCoversOnWater` 必须放在 `clearCoversOnRoads` 与 `fillEmptyBands` 之后**（`js/tank_nodegen.js` strip 级收尾链）。

**根因（不是「清理没跑」）**：清理确实在 strip 路径执行，但跑在上述两步**之前**——这两步会把元素**重新推出/补植到河道与湖面**（`fillEmptyBands` 的"纵向填满"兜底尤其会往空带补植被，而河道正是一条"空带"）。⇒ 顺序不对，清了等于没清。

**判定改真多边形 SAT**：弃用旋转包络 AABB 近似（注释自称 "OBB 近似"），改用 `_obbHit` / 真 SAT——参照 #U37 的**8 倍面积教训**（AABB 包络对细长/斜置多边形的面积可达真实形状的 8 倍）。`bridge` / `road` 豁免（桥面与水共存是设计意图）。

**实测重叠**：改前 生存 35 / 标准 21 / Boss 5 ⇒ **改后 0**。

## 未注册 tier 的两套兜底语义

（原 §27.4，#W16-②）

| 查询 | 未注册 tier 的兜底 | 取向 | 若反向的后果 |
|---|---|---|---|
| `js/tank_cover.js` 遮蔽查询（`getExposure` / `coverBlockInfo`） | 返回 **false** | **宁少挡** | 取 true 会让玩家在**看不见的物体**后面挨挡（无法理解的无敌墙） |
| `js/tank_fire.js` 弹道拦截 | `\|\| {mode:'solid'}` | **宁多挡** | 取 false 会让炮弹**穿墙**（更明显的破绽） |

**结论：口径不同但互补，禁止为了「统一」而改动任一侧**。两侧的不可达路径（`mediumHullExposure` 读取、`destroyCover` 的 `label` 未判空）已于 2026-10-20 一并清理/补守卫（见 [directionTolerance 与缓存](#directiontolerance-与缓存)）。

## directionTolerance 与缓存

（原 §27.5，#W17，2026-10-20）

- **`RULES.coverRules.directionTolerance`（缺省 16，唯一键）**：此前是 `js/tank_cover.js` 内的**硬编码常量**（约 `:710`）。现由 `role-systems` 在 `RULES` 登记、`role-mapgen` 经 `coverDirectionTolerance()` 消费；缺失/非法值（`null`/字符串/`NaN`/整块 `coverRules` 缺失）一律**回落 16 且不抛错**。
- **`coverEnvelope` 已加 WeakMap 缓存**：签名 = `verts` 引用 + 长度 + `x`/`y`/`angle`（几何变更即失效重建）；`getRoadUnderTank` 每帧两次调用，整链 verts 可达 300+ 点。
- **`mediumHullExposure` 从未存在，已删读取**：该字段在 `RULES` 中**从不存在**（实测 grep 零命中）⇒ 恒 `undefined` ⇒ 恒返回 `0.0` 的不可达死路径，现直接固化 `0.0`。
- 回归：`scripts/test-covers.js` #W17 段（含「字段确实驱动行为」的 exposure 翻转断言，防「读了但没用」的空接线）。

## 死配置清理与一处误判纠正

（原 §27.6，#W15，2026-10-20）

**已删除的 5 项零消费字段**（全部经 grep + 实测确认零读取方）：

| 字段 | 原位 |
|---|---|
| `RULES.nodeMap.fullDowngradeCap` | `js/tank_rules.js` |
| `RULES.nodeMap.road.branchCurveAmp` | 同上 |
| `RULES.drowning.warnAt` | 同上 |
| `RULES.breach.heCoverDmg` | 同上（HE 破障对单元素恒 1 点，无需倍率，见 `specs/combat.md` §3） |
| `RULES.coverRules.deterministicOnly` | 同上 |

**同步清理**：`VILLAGE_SOLID` 移除 `'half'`（2026-09-20 #E3 半高掩体已整体删除，此处残留会被 `:3202` 的 `continue` 丢弃）；bridge 特判 **4 处**（`:1658` / `:2721` / `:2982` / `:4298` 等，`bridge` 已不再产出）加「已不再产出」统一注记。

**⚠️ 纠正 ISSUES #W15 的一处判断有误（不静默删除，留沿革）**：原文把 `waterBridgeChance` 列为**死配置**（「仍在算概率但结果被丢弃」）要求删除——**该判断错误**。变量只影响**生成门槛**（名字里的 `Bridge` 是历史遗留，桥梁已随 #U7 删除，此处只剩水体）；水体 `push` 在下方 `if (waterDx !== null)` 分支里**真的执行**。

**实测（2026-10-20，`tmp` 探针，40 seed × `generateNode`，`cullRate=0`）**：

| 难度 | 有 `water` 的节点 | `water` 实例 |
|---|---|---|
| `diff=0` | **1/40**（来自模板自带的村池塘） | 1 |
| `diff=0.25` | 12/40 | 13 |
| `diff=0.5` | **17/40** | 18 |
| `diff=1` | 22/40 | 25 |

⇒ 门槛**真实放行水体**，是活配置。删掉会把「难度↑水体↑」的地形分布改成常数 0，属**行为变更**。**保留不删**，仅澄清注释（不重命名变量——重命名会改变 RNG 流位差、影响校准基线）。`tank_nodegen.js:3463-3464` 处原「算完丢弃」的描述同样不成立。

**注**：`generateStrip`（strip 链）路径下 `water` tier 恒为 0/40——strip 有自己的 `placeStripRivers` 一体化水系，且有 `_ro.externalRoads` 跳过守卫（见 [strip 河流互斥](./rivers.md#strip-河流互斥) 与 [生存模式生成链](./survival-strip.md#生存模式生成链)）。两个生成器的水体语义不同，**统计时不可混用**。

## 回归覆盖

（原 §27.7）

`scripts/test-nodegen.js` / `test-nodegen-calibration.js` / `test-covers.js`（180 断言）/ `test-map.js` / `test-strip.js`；`scripts/audit-map-gen.js` 的 **G4 口径已重写**（旧 AABB 矩形口径 669 项硬失败 → 真实多边形足迹判定 0 项，并加 6 条合成几何自检防「归零即失效」，详见 `DEVELOPMENT-batches-2026-10.md` §4.112）。

## 相关页面
- [掩体体系](./cover-system.md) — `coverWorldScale` 唯一口径与 tier 全集
- [河流、水域与溺毙](./rivers.md) — 水域判定与 AI 避水
- [道路与路网](./roads.md) — `clearCoversOnRoads` 与 `verts` 精确多边形口径
- [沿革与未落地](./changelog.md) — 桥梁体系与 `union` 兜底的历史原文
