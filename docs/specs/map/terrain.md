# 地形抽象与生成

> **摘要**：地形类型抽象 schema、地形到 tier 的映射、biome 美术规范与生成期 LoS 走廊。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/map.md` §5 / §6 / §7（2026-10-21 拆分）
> **相关**：[掩体体系](./cover-system.md) · [路网](./roads.md) · [河流与溺毙](./rivers.md) · [沿革与未落地](./changelog.md)

## 目录
- [地形类型抽象](#地形类型抽象)
- [属性 schema 与取值域](#属性-schema-与取值域)
- [地形到 tier 的映射](#地形到-tier-的映射)
- [Biome 美术规范](#biome-美术规范)
- [地图元素与生成更新](#地图元素与生成更新)
- [LoS 走廊与运行期绕行](#los-走廊与运行期绕行)

## 地形类型抽象

（原 §5）

> 设计稿（原 PLAN.md 落地计划已归档）：将水域/泥潭与全高/半高掩体统一抽象为「地形类型」。每个地形即一个 cover 实例，由一组属性刻画，为后续丰富地图元素（水潭/河流/烂泥地/建筑等）提供一致基座。

### 属性 schema 与取值域

（原 §5.1）

每个地形实例携带（取值域为 **2026-10-21 代码实测**，`RULES.coverTiers` 18 键）：

- `passability`：坦克通行系数（move mult，0=不可入，1=自由，介于两者=减速；逐 tier 具体值只在 `RULES.coverTiers`）
- `shellBlock`：弹道交互——**规范取值只有三种**：`true`（solid，确定性挡弹）/ `'single'`（挡 1 发）/ `false`（越飞）。**`'grad'` 与任何概率剖面自 2026-09-20 #E1 起不再合法**（见 [确定性弹道拦截](./cover-system.md#确定性弹道拦截)）。
  - **历史遗留写法（2026-10-21 实测，勿照抄）**：`perm_block` 仍写 `shellBlock: 'solid'`（字符串）。`normalizeCoverTiers()` **只在 `shellBlock === undefined` 时派生**，故这个字符串被原样保留；其 `mode` 由 `true`/`'single'`/`vision` 三分支派生 ⇒ `'solid'` 落进 `vision ? 'none'` ⇒ **`mode: 'none'`**。结果是两条查询口径不一致：`js/tank_cover.js` 的遮蔽查询把它当「挡」（非 false 即入候选、最终返回 0.0），`js/tank_fire.js` 的弹道拦截只认 `mode === 'solid' | 'single'` ⇒ **不拦弹**。`perm_block` 当前无任何生成器产出（见 [tier 表现行口径](./cover-system.md#tier-表现行口径)），故无运行期影响；若将来启用该 tier，必须改写成 `shellBlock: true` 而不是 `'solid'`。
- `exposureProfile`：遮蔽剖面，**现行只有 `full` / `none` 两值**（`half` 随半高掩体于 2026-09-20 一并删除）
- `destructible`：耐久（`hp` 数值 / `null` 不属结构；`null` 归一为 `hp: Infinity` 表示不可毁）
- `drawStyle`：渲染风格（box/bush/tree/soft/barricade/stump/rubble/water/rock-poly/rubble-box/bridge-deck...）
- `tierGroup`：语义分组，**现行四值** `structure` / `foliage` / `liquid` / `ground`（旧 `cover` 组已于 2026-09-20 撤销，`normalizeCoverTiers` 的缺省回落仍为 `'cover'`，仅服务未迁移的自定义 tier）

### 地形到 tier 的映射

（原 §5.2，设计视图）

> **本节定位（2026-10-21）**：只作**地形抽象的设计视图**（说明「为什么这样抽象」），**不含任何参数值**——逐键现行值以 `RULES.coverTiers` 为唯一代码口径、以 [卷首页 tier 速查](./index.md#tier-速查18-键) 为唯一索引。下表把「自然语言地形」映射到 tier 名与行为定性。

| 具体地形 | tier | 通行 | 弹道 | 视线 | 可摧毁 | 绘制风格 | tierGroup |
|---|---|---|---|---|---|---|---|
| 全高掩体(建筑墙) | `full` | 自由 | 确定性挡弹 | 遮 | 否 | box | structure |
| ~~半高掩体(矮墙)~~ | — | — | — | — | — | — | **tier 已删除（2026-09-20 #E3）** |
| 水潭 | `water` | 减速 | 越飞 | 不遮 | 否 | water | liquid |
| 河流 | `river` | 减速 | 越飞 | 不遮 | 否 | water-chain | liquid |
| 烂泥地 / 水潭周围烂泥地 | `mud` | 减速 | 越飞 | 不遮 | 否 | mud | ground |
| 残破建筑 | `ruined` | 减速 | 确定性挡弹 | 遮 | 是（1 发→碎石） | rubble-box | structure |
| 完整建筑 | `intact` | 自由 | 确定性挡弹 | 遮 | 否 | box | structure |
| 岩石 | `rock` | **硬阻断** | 确定性挡弹 | 遮 | 否 | rock-poly | structure |
| 灌木 | `bush` | 自由 | 越飞 | 遮 | 否 | bush | foliage |
| 树木 | `tree` | 自由 | 挡弹 | 遮 | 是（1 发→倒树） | tree | foliage |

> 关键设计：(1) 水潭/河流「弹道越飞 + 减速通行」——**2026-09-14 水系重做**后不再硬阻断推出，完全浸入触发溺毙见 [河流与溺毙](./rivers.md)；(2) 河流为**多段连通**水体（见 [河流作为连通多段地形](#河流作为连通多段地形)）；(3) 岩石「硬阻断 + 确定性挡弹」且 `drawStyle` 走多边形；(4) 烂泥地减速通行且不挡弹；(5) 残破建筑现行＝确定性挡弹 + 全高剖面 + 可再摧毁（**沿革**：原文写的 `graduated`+`half` 是 2026-09-20 #E1 之前的取值，详见 [tier 表现行口径](./cover-system.md#tier-表现行口径)）；(6) 逐键数值（`passability` / `destructible` / `hp` 等）一律读 `RULES.coverTiers`，本节不复制。

### 河流作为连通多段地形

（原 §5.3）

河流由共享同一逻辑体的多个 water 段链接而成（连续 movement 阻断 + 单次笔触绘制），需在 cover 实例 schema 增加 `segments[]`/parent-link 字段。**（已落地：river 实例现携带 `segments[{dx,dy,w,h,angle}]` 相对偏移，经 `coverSegRects()` 展开，见 [P-40 落地注记](#p-40-地形类型抽象落地注记)。）**

### Biome 美术规范

（原 §5.5，地貌 Biome 与环境贴图美术规范）

- **Biome 调色板与材质规范**：
  - **混凝土/城镇 (Concrete/Urban)**：主色 `#4a4e52`（沥青暗灰）、`#6b7075`（水泥灰）；带有车道白线残痕、路面开裂纹理与砖石碎屑；
  - **草原 (Meadow)**：主色 `#3a5323`（深橄榄绿）、`#4c6b30`（草坪绿）；搭配黄褐色土路斑块与草丛细节；
  - **黄草/荒漠 (Steppe/Desert)**：主色 `#8c7647`（干草黄）、`#6e5b32`（风沙褐）；带有风蚀波纹与干裂土块痕迹；
  - **泥潭 (Mudland)**：主色 `#382a1b`（深湿泥褐）、`#291e12`（暗泥色）；具有高光湿润水膜感与深车轮辙痕；
  - **蓝水/水域 (Water)**：主色 `#22485e`（深蓝绿）、`#356885`（浅水碧）；带有微波涟漪网格与水岸浅滩过渡。
- **掩体与植物渲染分级 (Foliage & Structure Layers)**：
  - 掩体（如矮墙、路障、残建）具有明确的顶面与侧边法线阴影，体现立体高度感；
  - 树木/灌木实行**基底与树冠（Canopy）分层绘制**：树干与根部在坦克下方，树冠在坦克上方绘制；坦克进入树冠下方时，树冠自动转换为半透明（alpha 0.4），保证视野不被完全遮挡。

### P-40 地形类型抽象落地注记

（原 §5.6，2026-08-24 批次）

> *主题：schema 代码化 / 河流多段（`segments`）/ 新增 tier / 模板地形标签*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表。*

- §5.1 统一 schema 已全链路代码化：coverTiers 六属性（passability/shellBlock/exposureProfile/destructible/drawStyle/tierGroup）为唯一事实源，旧字段 move/mode/draw/hp 经 `normalizeCoverTiers()` 单向派生兼容。
- 河流采用方案 A：单 river 实例携带 `segments[{dx,dy,w,h,angle}]` 相对偏移，角点/碰撞/弹道/绘制统一经 `coverSegRects()` 展开。
- 新增 tier：mud / river / rock / ruined / intact；water 改 `shellBlock:false`——炮弹越飞、passability 0 阻挡移动（#85 裁定落地）；`getExposure` 按 exposureProfile 分发，消除 `tier==='half'` 硬编码。**（沿革：`water` 的 `passability` 已于 2026-09-14 由 0 改为 0.4 减速通行，见 [河流与溺毙](./rivers.md)。）**
- 模板地形标签分配：corridor_tutorial 无／forest_dense=edgeRiver／urban_block=mudPatch／crossfire_plaza=centralPond／mixed_barrier_plaza=mudPatch／village_center=centralPond+mudPatch／woodland_line=edgeRiver；地形生成不受 cullRate 剔除与难度升降级影响。

### 批次五落地注记

（原 §5.7，2026-08-24）

> *主题：掩体尺寸收敛（#77）/ Biome 地面层（P-36/#81）*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表。*

- **掩体调参（#77 解决）**：`RULES.nodeMap.coverWorldScale`（**当时值 half 0.55 / full 0.58 / barricade 0.40**）收敛世界尺寸——半高墙 ≈105~148px、全高 ≈153~209px、沙袋 ≈72~84px（@nodeScale=3，树维持 72px 不缩）；密度 ×1.57（总元素 120→188）；低难度 full→half 降级帽 30%（diff<0.35 窗口）、每模板前 2 个 full 免 cullRate 剔除；corridor_tutorial/forest_dense/woodland_line 三零全高模板分别补 +2/+3/+2。**（沿革：上列 0.55/0.58/0.40 为 2026-08-26 当时值、且早于 `building` tier 诞生（2026-09-21），已被现行值取代——现行四键值与消费方式见 [掩体世界缩放唯一口径](./cover-system.md#掩体世界缩放唯一口径-coverworldscale)；降级帽条款现行状态见 [死配置清理](./generation-cleanup.md#死配置清理与一处误判纠正)（`fullDowngradeCap` 已删除）、前 2 免剔除见 [节点布局难度校准](./map-architecture.md#节点布局难度校准)。）**
- **Biome 地面层（P-36/#81 解决）**：七模板带 `biome` 标签（urban/crossfire→concrete，forest/woodland/village→meadow，corridor/mixed→steppe），调色板收口 `RULES.biomes`（取自 P-44 底色表）；`tank_battledraw.drawGround(ctx,{cam/viewBounds,biome,seed})` 确定性程序化底色+色斑（alpha≤0.12），battle 态网格前绘制，纯程序化零资产。

### 批次六落地注记

（原 §5.8，2026-08-24）

> *主题：递增生成与击杀配额（P-38/#83）/ 增援落点四重约束*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表；配额与增援的现行机制已由 [防线式推进](./strip-defense.md) 的敌人数/增援/完成条件三节重塑，本节仅存 2026-08-24 的机制沿革。*

- **递增生成与击杀配额（P-38/#83 解决）**：非 Boss 节点 quota = max(初始敌数, 初始敌数 + quotaAddBase(2) + floor(effDiff×quotaDiffScale(6)))，节点结束条件改为「nodeKills ≥ quota」；`reinforcementTick(state)` 纯逻辑驱动补兵——alive < desiredAlive 且距上次 ≥ reinforceInterval(8s) 时每批生成 1~2 个（maxAlive=7 封顶）。
- 增援落点四重约束：视口 AABB 外扩 reinforceMargin(120px) 外 ∩ 世界边界内 ∩ 距玩家当前位置 ≥ aiTriggerDist×1.05 ∩ 距友军据点 ≥300px，掩体 padding 拒绝采样、rng 注入确定性。
- 增援实体化后立即 `alertEntity` 警觉并记 lastKnownPlayerPos=玩家当前位——主动推进而非蹲守；Boss 节点 quota=null 完全禁用递增生成（summons 即其机制）。

## 地图元素与生成更新

（原 §6，2026-09 批次；无子节编号）

> *主题：掩体尺寸与配色 / 自然化形状 / 水系与岩石通行性裁定 / 地图级路网与占位冲突 / 敌军聚集生成*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表。*

> **历史快照注记（2026-09-17）**：本节水系裁定与路网几何（分支概率/SAT 跳段）已被后续重做取代——水域现行值见 [河流与溺毙](./rivers.md)（passability 0.4 + 溺毙），路网现行见 [道路与路网](./roads.md)（v4 七拓扑）。

- **掩体尺寸与配色**：`RULES.nodeMap.coverWorldScale` 的**现行四键值见 [掩体世界缩放唯一口径](./cover-system.md#掩体世界缩放唯一口径-coverworldscale)**（本节按「同一数值只允许一处」纪律不再复写）；`coverTiers` 改用高对比色（建筑砖红 `#b5553f`、灌木/树提高饱和度）以区别于地表——**逐键 `fill`/`stroke` 配色以 `RULES.coverTiers` 为唯一口径**（半高墙深描边 `#2e2410` 随 half tier 于 2026-09-20 删除）。水体新增 `draw` 分支，现已可见。
- **自然化形状**：mud 改为径向噪声凸 blob；central pond 改为 14–18 边凸 blob；建筑经 `placeVillage` 以 5–9 个小矩形松散聚成村落（部分 L 形）。碰撞核心已支持凸多边形 SAT。
- **水系与岩石通行性裁定（2026-09-13 复查落地；已被 2026-09-14 水系重做取代）**：~~`RULES.coverTiers.water` 与 `river` 的 `passability` 统一定为 `0.0`（不可通行、实体碰撞推出硬阻断）~~——**现行值 0.4（减速通行 + 完全浸入溺毙，见 [河流与溺毙](./rivers.md)）**；炮弹维持 `shellBlock:false`（`mode:'pass'` 飞越不拦截）；`rock` 维持 `passability: 0` 且 `shellBlock: true`（不可通行，阻挡直射实弹）；`mud` 确定为 `passability: 0.4`（减速不挡弹）。
- **地图级路网与占位冲突重构 (#A11/P-43，2026-09 专轮落地)**：`generateNode` Phase 0 先调 `placeRoadNetwork` 生成贯穿战场的 `road` 主干道与分支，随后的模板物件/村落/树林/地形全部避让路网骨架。专轮收敛要点：
  - **密度收敛（已被后续路网重做取代）**：主干段数受模板控制，~~分支概率 `0.35`~~（v2 改六拓扑，无独立分支概率）；道路条带宽恒为 `rng.range(60, 80)` 世界 px（`test-nodegen.js` 断言 60~80）。
  - **避让与优先级（已被后续路网重做取代）**：~~路段 OBB 经 SAT（`obbSegmentHitsAvoid`）与模板 `full` 占位盒求交，命中即弃段~~——2026-09-16 路网重做取消跳段（`isSegOk` 只保留界内判定）；`full` 建筑自身不被路剔除；植被层（tree/bush/rock/water 等）不参与避让，路压植被属预期。
  - **村落单一路网**：`placeVillage` 在存在网络道路时**不再自铺街道**，核心建筑直接沿网络路段贴边锚定（消除旧版「村庄自铺街道 + 全局路网」双轨）；仅无网络道路时降级自铺 1~2 条。
  - **中央水潭**：`placeCentralPond` 相位网格 9×9（±0.30 模板边长内），忽略 `road` 层（路为地面层，水潭压路即「广场水池」）；全相位失败时取「碰撞重叠面积最小」点回退（保证标签必产出），并把落点移出出生走廊。
  - **出生走廊保护**：玩家出生点固定于世界左缘 10%、垂直中点；建筑/杂物/回退水潭一律避让该点周围通道（半宽 ±20% × 半高 ±9%），消除「随机杂物把出生点围死」类节点。运行期仍有 `findPlayerSpawn` + `ensureLoSCorridor` 二线兜底。
  - **度量口径修正**：`nodeLayoutMetrics` 的 BFS 种子改为「距起点最近的自由网格点」，消除「起点自由但最近网格被盖」导致的假 0 连通；校准测试显式传入绝对出生坐标（`centerX=600` 口径下 `600−0.4·w`）。
  - **校准重锚**：7 模板 × 5 难度 × 8 seed 全量重锚（`test-nodegen-calibration.js` BASE），连通性全线 `1.000`——开阔模板地板 ≥0.85、密林 ≥0.35 均显著富余，`coverCoverage` 随难度非降保持成立。
  - **回放重锚**：布局变更使五节点回放 hash 重锚为 `d60b9022`（`test-replay.js` 仅校验确定性/异 seed 分叉，不钉常量）。
	- **自然化不规则地形 (#78)**：新增 `rock` (岩石) 与 `mud` (泥地) tier。岩石具备 solid 碰撞、 `rock-poly` 棱线绘制与遮挡视线能力；泥地具备 0.4 减速且不挡弹能力。支持 `verts` 多边形几何，使掩体不再局限于矩形。
	- **贴图资产管线**：`tank_assets.js` 的 `ASSET_DEFS` 与 `drawAsset` 图片优先/程序化烘焙兜底管线已就绪，建筑、岩石、残骸已接入真实 PNG 贴图（或程序化烘焙），提升地形识别度。
- **敌军聚集生成**：`makeNode` 改为两层级——先按难度选 1–4 个聚集中心，每中心在 `enemyClusterRadius` 内生成 2–5 辆（保持 minPlayerDist / enemyMinDist），网格兜底仅作最后手段。

## LoS 走廊与运行期绕行

（原 §7，A17，2026-08-26 修复落地）

> *主题：生成期 LoS 走廊（`ensureLoSCorridor`）/ 运行期 AI 绕行（`_losDetour`）*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表。*

- **生成期 LoS 走廊**：`js/tank_cover.js` 新增 `losBlocker(ax,ay,bx,by)`，复用 `findCoversOnPath` 返回首个遮挡视线命中体及其线段侧向单位向量；`js/tank_nodegen.js` 新增 `ensureLoSCorridor(coversList, hints, rng)`，校验玩家↔各敌簇质心直视线，被挡则依次侧移遮挡体 / 降级 full→soft（去 vision）/ 移除，保底至少一条直视线，确定性、用节点 seed 派生 rng、不抛异常；`generateNode` 新增可选 `losHints` 参数（缺省不启用，向后兼容）。
- **运行期绕行**：`js/tank_ai.js` 新增 `_losDetour(t,p,heading)` 并在 search 分支（LoS 被挡路径）注入侧向绕行，朝向「目标大方向 + 侧向绕开遮挡体」合成行驶以恢复 LoS；开火仍需 `los` 为真（未采用盲射方案）；无遮挡节点行为零变化。
- **验证结论**：`npm run check` / `npm test`（含 test-replay.js 确定性校验）/ `npm run test:browser` 全绿；seed=1 回放基线 hash 随布局变化而漂移（A17 落地时为 `5b8c4126`，P-43 敌群构成改动后为 `799b65f`；test-replay.js 仅校验确定性，不钉常量，故无需改测试）；零开火节点 9/40 → 7/40（方案 1+2 合计改善）。

## 相关页面
- [掩体体系](./cover-system.md) — tier 全集、`coverWorldScale` 唯一口径、确定性拦截
- [路网](./roads.md) — 本节里「地图级路网与占位冲突」的现行归属
- [河流与溺毙](./rivers.md) — 水/河 `passability` 与溺毙判定
- [沿革与未落地](./changelog.md) — §5.4 落地前 checklist（未落地项在此）
