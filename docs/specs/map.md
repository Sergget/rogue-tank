# 战术坦克 Roguelike — 地图与环境要素规范 (Map & Environment Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_cover.js, js/tank_nodegen.js, js/tank_map.js, js/tank_camera.js, js/tank_minimap.js, js/tank_assets.js

---

## 1. 节点地图与大世界架构
- **节点式大战场**：一局为一条线性节点链（默认 runNodeCount=5 节点）。每个节点是独立战场，地图尺寸约为视口的 9 倍（宽高各 ≥ 3 倍视口，满足 1:9 比例）。
- **节点生成器**：js/tank_nodegen.js 提供 7 内置模板（开阔走廊/密林阵地/城镇街区/交叉火力广场/混合障壁/村落中心/林地战线），generateNode(difficulty, {seed}) 确定性种子 RNG 生成，难度加权选模板 + 密度剔除随难度递减。
- **Boss 周期与开放式链（2026-08-24 落地）**：`isBossNodeIndex` 按 `(index+1)%RULES.nodeMap.bossInterval===0` 预标 Boss 节点并清空常规敌人；`extendRun(run)` 以原 seed 流确定性续接节点；`difficultyForIndex` 改为索引驱动饱和曲线并叠加跨局等级（详见 RULES.difficulty）；materializeNode 注入实体 `aiTriggerDist` 与 `aiTier`。
- **摄像机跟随与视口剔除**：js/tank_camera.js 实现指数阻尼平滑跟随 + 世界边界钳制；aabbInView（64px 余量）对掩体、树冠、炮弹进行高效视口剔除。
- **滚轮缩放（P-39，2026-08-24 落地）**：`RULES.camera`（minZoom 0.5 / maxZoom 2.0 / zoomStep 0.15）+ `createCamera` targetZoom/minZoom/maxZoom 字段 + `setZoom` 钳制入口 + `updateCamera` zoom 指数阻尼；tank_mvp.html 滚轮改绑缩放（passive:false + preventDefault），以光标下世界点为焦点反解相机中心（zoom-to-cursor）。
- **小地图**：js/tank_minimap.js 右上角等比缩放渲染战场边界、掩体分布、友军据点与敌我动态标记。
- **水体/桥梁（P-20，历史）**：waterBridgeChance = diff×0.5 概率插入；水体不可通行（move:0）、桥梁通道（move:1）；尺寸封顶节点 40%，边界钳制防越界；玩家出生点 findPlayerSpawn 排除水域。**（已被 2026-09-14 水系重做取代：water/river `passability=0.4` 减速通行 + 完全浸入溺毙，现行值见 §5.2 与 §11；本条仅存 P-20 时期的桥梁机制沿革。）**

## 2. 地图元素体系 (Cover Tiers)
参数权威收口于 RULES.coverTiers：

> **现行口径指针**：本表为 2026-09 早期版本，其中 `half`（半高掩体）与「越掩插值/exposure 概率遮挡」等列已被 **§12.1** 取代（half tier 已整体删除）；可破坏楼房 `building` 见 **§13.2**。以 §12.1 的 tier 表现行口径为准。

| 元素 | tier | 弹道交互 | 坦克通行 | 视线遮挡 | 残骸链 |
|---|---|---|---|---|---|
| 半高掩体 | half | **已删除**（§12.1）——tier 不再存在 | — | — | — |
| 全高掩体 | full | 100% 确定性格挡 | 阻挡推出 | 不遮 | ∞ |
| 可破坏楼房 | building | 100% 确定性格挡（耐久 3） | 阻挡推出 | 遮挡视线 | 3 发 → ruined → 1 发 → rubble |
| 残破建筑 | ruined | 100% 确定性格挡（耐久 1） | 0.6 减速通过 | 遮挡视线 | 1 发 → rubble |
| 灌木丛 | bush | 穿透（不挡弹） | 自由通行 | 阻挡 AI 视线 | ∞ |
| 树木 | tree | 树干 1 发截停 | 阻挡推出（可推倒） | 树冠遮挡视线 | 1 发/碾压 → fallen |
| 倒树 | fallen | 穿透 | 自由通行 | 树冠遮挡视线 | 终态纯视觉残留 |
| 栅栏 | soft | 穿透（穿透即毁） | 0.45 减速通过，压过即毁 | 不遮 | 无残骸 |
| 沙袋路障 | barricade | 挡 1 发后摧毁；>70° 可跳弹（不触发摧毁） | 压过即毁 | 不遮 | 1 发/碾压 → rubble |
| 碎石 | rubble | **不挡弹**（§12.1） | 压过即毁 | 不遮 | 终态 |

## 3. 掩体核心机制细节
- **越掩插值（C 实验）**：射线高度在炮口（medium 1.8m/heavy 2.2m）与目标部位中心间线性插值；攻击方贴近半高掩体（距入口 < 约1/3射程）时射线高于掩体顶（1.4m）→ 越掩 exposure=1.0。
- **方向判据 cutoff**：掩体必须被弹道在命中目标前完整穿过（出口距离 < 命中距离+16px 容差）才参与遮挡；骑上掩体的坦克不会获得全向遮蔽。
- **炮管穿墙防御**：gunRoot→gunTip 物理线段与 solid/single 掩体相交时，开火在交点处拦截（damageCover 1点 + 特效），堵死"炮管穿墙无伤射击"漏洞。飞行动画起点归一 gunRoot。
- **任意多边形几何**：covers 实例带 verts 时全角点走 polyCorners；凹多边形支持 collisionVerts 多凸包化合物碰撞（SAT/OBB），解决 L 形口袋卡模问题。

## 4. 贴图资产与烘焙层 (js/tank_assets.js)
- ASSET_DEFS 注册表管理 soft/barricade/stump/rubble/bush/tree/fallen 七档贴图规格与程序化 bake 函数。
- 零外部图片依赖：assets/ 目录为空时自动离屏烘焙缓存（ASSET_CACHE），file:// 离线完整兼容。
- tools/bake.html 一键导出 PNG 到 assets/，日后真实美术直接替换同名文件接口不变。
- **树冠视觉-逻辑对齐（#A10）**：`tree.bakeCanopy` 冠径乘数由 `1.9` 降至 `1.4`，使树冠视觉半径更贴近逻辑 OBB（24×18），缓解"所见远大于所挡"的脱节；倒树（fallen）保留根部伐倒断面高亮。如需进一步收紧可继续下调或提为 RULES 参数。

## 5. 地形类型抽象 (Terrain-Type Abstraction)

> 设计稿（原 PLAN.md 落地计划已归档）：将水域/泥潭与全高/半高掩体统一抽象为「地形类型」。每个地形即一个 cover 实例，由一组属性刻画，为后续丰富地图元素（水潭/河流/烂泥地/建筑等）提供一致基座。

### 5.1 统一属性 schema
每个地形实例携带：
- `passability`：坦克通行系数（move mult，0=不可入，1=自由，0.35/0.6=减速）
- `shellBlock`：弹道交互（true=`solid` 挡弹 / `single` 挡 1 发 / false 且减速=`pass` 越障 / false 且不减速=`none`/`graduated` 概率垂直剖面）
- `exposureProfile`：遮蔽剖面（`full`/`half`/`none`）
- `destructible`：耐久（`hp` 数值 / `Infinity` 不可毁 / `null` 不属结构）
- `drawStyle`：渲染风格（box/bush/tree/soft/barricade/stump/rubble/water/rock-poly/structure...）
- `tierGroup`：语义分组（cover/structure/foliage/liquid/ground）

### 5.2 具体地形映射（设计与实装值）
| 具体地形 | passability | shellBlock | exposureProfile | destructible | drawStyle | tierGroup |
|---|---|---|---|---|---|---|
| 全高掩体(建筑墙) | 1.0 | true(solid) | full | ∞ | box | structure |
| 半高掩体(矮墙) | 0.4 | grad | half | ∞ | box | cover **（D5：生成期已屏蔽，仅 ruined 共享剖面）** |
| 水潭 | 0.4 | false(越飞) | none | null | water | liquid |
| 河流 | 0.4 | false(越飞) | none | null | water-chain | liquid |
| 烂泥地 | 0.4 | false | none | null | mud | ground |
| 水潭周围烂泥地 | 0.4 | false | none | null | mud | ground |
| 残破建筑 | 0.6 | grad | half | hp=1 | rubble-box | structure |
| 完整建筑 | 1.0 | true(solid) | full | ∞ | box | structure |
| 岩石 | 0.0 | true(solid) | full | ∞ | rock-poly | structure |
| 灌木 | 1.0 | false(vision) | none | null | bush | foliage |
| 树木 | 1.0 | true(tree) | full | 1→fallen | tree | foliage |

> 关键设计：(1) 水潭/河流 `shellBlock=false`（炮弹越飞不拦截）+ `passability=0.4`（**2026-09-14 水系重做：减速通行**，与泥地同级——不再硬阻断推出；完全浸入触发溺毙见 §11）；(2) 河流为**多段连通**水体（见 5.3）；(3) 岩石具备 `solid`+`full` 且 `passability=0`（不可通行且阻挡直射实弹，`drawStyle` 走多边形）；(4) 烂泥地具备 `passability=0.4` 减速通行且不挡弹；(5) 残破建筑=`graduated`+`half`+`destructible`。

### 5.3 河流作为连通多段地形
河流由共享同一逻辑体的多个 water 段链接而成（连续 movement 阻断 + 单次笔触绘制），需在 cover 实例 schema 增加 `segments[]`/parent-link 字段。**（已落地：river 实例现携带 `segments[{dx,dy,w,h,angle}]` 相对偏移，经 `coverSegRects()` 展开，见 §5.6。）**

### 5.4 其他需补充内容（落地前 checklist）

> **状态注记（2026-09-17）**：本 checklist 为 2026-08-24 时期的待办清单，其中第 1/2/7/8/9 条已随后续批次落地（#81 biome 图层→§5.7；#78 不规则岩石与 verts→§6；模板打标→§5.6；`getExposure` 泛化→§5.6；河流 segments→§5.3/§5.6），第 3 条（AI 找掩体）由 coverSeek 态落地（specs/combat.md §5），第 4~6 条（建筑摧毁 FX/小地图/水声）仍属待办。逐条原文保留如下。

1. **地面 biome 图层 (#81)**：水/泥需独立于 OBB covers 的铺地图层，才能连续平铺而非孤立方块。**✅ 已落地（P-36）**
2. **不规则岩石形态 (#78)**：需 nodegen/designer 的 `verts` 多边形创作（基础设施 `tank_cover.js:143-156` 已具备，但缺编辑器 UI 与 `rock` tier）。**✅ 已落地（#78/设计器 verts UI）**
3. **AI 找掩体钩子 (#76)**：AI 须读取 `exposureProfile`/`shellBlock` 选地形；当前 `aiDecide` 仅用 LoS/距离。**✅ 已落地（#76 coverSeek 态，specs/combat.md §5）**
4. **建筑摧毁/特效**：`destroyCover` 当前仅换 `toTier` 残骸（tree→fallen、barricade→rubble）；完整/残破建筑需碎屑 FX + `tierGroup:'structure'` 残骸链。
5. **小地图表征**：`tank_minimap.js` 须编码 liquid/ground tier（当前仅通用绘制 covers），使水潭/河流读作地形而非障碍。**✅ 已落地（`tank_minimap.js` 按 tierGroup 编码：liquid 蓝 / ground 褐点 / structure 新地形实心方块）**
6. **音效/特效**：`tank_audio.js`/`tank_fx.js` 需入水溅射、泥地迟滞声（当前无地形步进 SFX）。**（截至 2026-09-17 未落地，仍属待办。）**
7. **nodegen 模板打标**：模板须携带地形放置标签（中央水潭、沿边河流、泥环）以生成新 tier。**✅ 已落地（§5.6 模板地形标签分配）**
8. **新地形 half 曝光**：`getExposure` C 插值（`tank_cover.js:361-373`）硬编码 `tier==='half'`；残破建筑/带 half 剖面的岩石需泛化 `exposureProfile` 分发。**✅ 已落地（§5.6：getExposure 按 exposureProfile 分发）**
9. **河流连通多段字段**：见 5.3。**✅ 已落地（§5.3/§5.6）**

### 5.5 地貌 Biome 与环境贴图美术规范 (Biome & Environment Assets Spec)

- **Biome 调色板与材质规范**：
  - **混凝土/城镇 (Concrete/Urban)**：主色 `#4a4e52`（沥青暗灰）、`#6b7075`（水泥灰）；带有车道白线残痕、路面开裂纹理与砖石碎屑；
  - **草原 (Meadow)**：主色 `#3a5323`（深橄榄绿）、`#4c6b30`（草坪绿）；搭配黄褐色土路斑块与草丛细节；
  - **黄草/荒漠 (Steppe/Desert)**：主色 `#8c7647`（干草黄）、`#6e5b32`（风沙褐）；带有风蚀波纹与干裂土块痕迹；
  - **泥潭 (Mudland)**：主色 `#382a1b`（深湿泥褐）、`#291e12`（暗泥色）；具有高光湿润水膜感与深车轮辙痕；
  - **蓝水/水域 (Water)**：主色 `#22485e`（深蓝绿）、`#356885`（浅水碧）；带有微波涟漪网格与水岸浅滩过渡。
- **掩体与植物渲染分级 (Foliage & Structure Layers)**：
  - 掩体（如矮墙、路障、残建）具有明确的顶面与侧边法线阴影，体现立体高度感；
  - 树木/灌木实行**基底与树冠（Canopy）分层绘制**：树干与根部在坦克下方，树冠在坦克上方绘制；坦克进入树冠下方时，树冠自动转换为半透明（alpha 0.4），保证视野不被完全遮挡。

### 5.6 P-40 地形类型抽象落地注记（2026-08-24）

- §5.1 统一 schema 已全链路代码化：coverTiers 六属性（passability/shellBlock/exposureProfile/destructible/drawStyle/tierGroup）为唯一事实源，旧字段 move/mode/draw/hp 经 `normalizeCoverTiers()` 单向派生兼容。
- 河流采用方案 A：单 river 实例携带 `segments[{dx,dy,w,h,angle}]` 相对偏移，角点/碰撞/弹道/绘制统一经 `coverSegRects()` 展开。
- 新增 tier：mud / river / rock / ruined / intact；water 改 `shellBlock:false`——炮弹越飞、passability 0 阻挡移动（#85 裁定落地）；`getExposure` 按 exposureProfile 分发，消除 tier==='half' 硬编码。
- 模板地形标签分配：corridor_tutorial 无／forest_dense=edgeRiver／urban_block=mudPatch／crossfire_plaza=centralPond／mixed_barrier_plaza=mudPatch／village_center=centralPond+mudPatch／woodland_line=edgeRiver；地形生成不受 cullRate 剔除与难度升降级影响。

### 5.7 批次⑤ 落地注记（2026-08-24）

- **掩体调参（#77 解决）**：`RULES.nodeMap.coverWorldScale`（**当时值 half 0.55 / full 0.58 / barricade 0.40**）收敛世界尺寸——半高墙 ≈105~148px、全高 ≈153~209px、沙袋 ≈72~84px（@nodeScale=3，树维持 72px 不缩）；密度 ×1.57（总元素 120→188）；低难度 full→half 降级帽 30%（diff<0.35 窗口）、每模板前 2 个 full 免 cullRate 剔除；corridor_tutorial/forest_dense/woodland_line 三零全高模板分别补 +2/+3/+2。**（现行 coverWorldScale 已调小为 {half:0.42, full:0.42, barricade:0.32}，以 §8 难度旋钮表为准；降级帽/前 2 免剔除条款现行值亦见 §8。）**
- **Biome 地面层（P-36/#81 解决）**：七模板带 `biome` 标签（urban/crossfire→concrete，forest/woodland/village→meadow，corridor/mixed→steppe），调色板收口 `RULES.biomes`（取自 P-44 底色表）；`tank_battledraw.drawGround(ctx,{cam/viewBounds,biome,seed})` 确定性程序化底色+色斑（alpha≤0.12），battle 态网格前绘制，纯程序化零资产。

### 5.8 批次⑥ 落地注记（2026-08-24）

- **递增生成与击杀配额（P-38/#83 解决）**：非 Boss 节点 quota = max(初始敌数, 初始敌数 + quotaAddBase(2) + floor(effDiff×quotaDiffScale(6)))，节点结束条件改为「nodeKills ≥ quota」；`reinforcementTick(state)` 纯逻辑驱动补兵——alive < desiredAlive 且距上次 ≥ reinforceInterval(8s) 时每批生成 1~2 个（maxAlive=7 封顶）。
- 增援落点四重约束：视口 AABB 外扩 reinforceMargin(120px) 外 ∩ 世界边界内 ∩ 距玩家当前位置 ≥ aiTriggerDist×1.05 ∩ 距友军据点 ≥300px，掩体 padding 拒绝采样、rng 注入确定性。
- 增援实体化后立即 `alertEntity` 警觉并记 lastKnownPlayerPos=玩家当前位——主动推进而非蹲守；Boss 节点 quota=null 完全禁用递增生成（summons 即其机制）。

## 6. 地图元素与生成更新（2026-09 落地）

> **历史快照注记（2026-09-17）**：本节水系裁定与路网几何（分支概率/SAT 跳段）已被后续重做取代——水域现行值见 §5.2/§11（passability 0.4 + 溺毙），路网现行见 §10/§10.1/§10.2（无跳段、六拓扑）。村落/水潭/出生走廊/度量/校准/敌群各小节仍为现行机制。

- **掩体尺寸与配色**：`RULES.nodeMap.coverWorldScale` 调小为 {half:0.42, full:0.42, barricade:0.32}（相对坦克更协调）；`coverTiers` 改用高对比色（建筑砖红 #b5553f、半高墙深描边 #2e2410、灌木/树提高饱和度）以区别于地表。水体新增 `draw` 分支，现已可见。
- **自然化形状**：mud 改为径向噪声凸 blob；central pond 改为 14–18 边凸 blob；建筑经 `placeVillage` 以 5–9 个小矩形松散聚成村落（部分 L 形）。碰撞核心已支持凸多边形 SAT。
- **水系与岩石通行性裁定（2026-09-13 复查落地；已被 2026-09-14 水系重做取代）**：~~`RULES.coverTiers.water` 与 `river` 的 `passability` 统一定为 `0.0`（不可通行、实体碰撞推出硬阻断）~~——**现行值 0.4（减速通行 + 完全浸入溺毙，见 §5.2/§11）**；炮弹维持 `shellBlock:false`（`mode:'pass'` 飞越不拦截）；`rock` 维持 `passability: 0` 且 `shellBlock: true`（不可通行，阻挡直射实弹）；`mud` 确定为 `passability: 0.4`（减速不挡弹）。
- **地图级路网与占位冲突重构 (#A11/P-43，2026-09 专轮落地)**：`generateNode` Phase 0 先调 `placeRoadNetwork` 生成贯穿战场的 `road` 主干道与分支，随后的模板物件/村落/树林/地形全部避让路网骨架。专轮收敛要点：
  - **密度收敛（已被 §10.1/§10.2 取代）**：主干段数受模板控制，~~分支概率 `0.35`~~（v2 改六拓扑，无独立分支概率）；道路条带宽恒为 `rng.range(60, 80)` 世界 px（`test-nodegen.js` 断言 60~80）。
  - **避让与优先级（已被 §10.1 取代）**：~~路段 OBB 经 SAT（`obbSegmentHitsAvoid`）与模板 `full` 占位盒求交，命中即弃段~~——2026-09-16 路网重做取消跳段（`isSegOk` 只保留界内判定）；`full` 建筑自身不被路剔除；植被层（tree/bush/rock/water 等）不参与避让，路压植被属预期。
  - **村落单一路网**：`placeVillage` 在存在网络道路时**不再自铺街道**，核心建筑直接沿网络路段贴边锚定（消除旧版「村庄自铺街道 + 全局路网」双轨）；仅无网络道路时降级自铺 1~2 条。
  - **中央水潭**：`placeCentralPond` 相位网格 9×9（±0.30 模板边长内），忽略 `road` 层（路为地面层，水潭压路即「广场水池」）；全相位失败时取「碰撞重叠面积最小」点回退（保证标签必产出），并把落点移出出生走廊。
  - **出生走廊保护**：玩家出生点固定于世界左缘 10%、垂直中点；建筑/杂物/回退水潭一律避让该点周围通道（半宽 ±20% × 半高 ±9%），消除「随机杂物把出生点围死」类节点。运行期仍有 `findPlayerSpawn` + `ensureLoSCorridor` 二线兜底。
  - **度量口径修正**：`nodeLayoutMetrics` 的 BFS 种子改为「距起点最近的自由网格点」，消除「起点自由但最近网格被盖」导致的假 0 连通；校准测试显式传入绝对出生坐标（`centerX=600` 口径下 `600−0.4·w`）。
  - **校准重锚**：7 模板 × 5 难度 × 8 seed 全量重锚（`test-nodegen-calibration.js` BASE），连通性全线 `1.000`——开阔模板地板 ≥0.85、密林 ≥0.35 均显著富余，`coverCoverage` 随难度非降保持成立。
  - **回放重锚**：布局变更使五节点回放 hash 重锚为 `d60b9022`（`test-replay.js` 仅校验确定性/异 seed 分叉，不钉常量）。
	- **自然化不规则地形 (#78)**：新增 `rock` (岩石) 与 `mud` (泥地) tier。岩石具备 solid 碰撞、 `rock-poly` 棱线绘制与遮挡视线能力；泥地具备 0.4 减速且不挡弹能力。支持 `verts` 多边形几何，使掩体不再局限于矩形。
	- **贴图资产管线**：`tank_assets.js` 的 `ASSET_DEFS` 与 `drawAsset` 图片优先/程序化烘焙兜底管线已就绪，建筑、岩石、残骸已接入真实 PNG 贴图（或程序化烘焙），提升地形识别度。
- **敌军聚集生成**：`makeNode` 改为两层级——先按难度选 1–4 个聚集中心，每中心在 `enemyClusterRadius` 内生成 2–5 辆（保持 minPlayerDist / enemyMinDist），网格兜底仅作最后手段。

---

## 7. A17 生成期 LoS 走廊 + 运行期绕行（2026-08-26 修复落地）

- **生成期 LoS 走廊**：`js/tank_cover.js` 新增 `losBlocker(ax,ay,bx,by)`，复用 `findCoversOnPath` 返回首个遮挡视线命中体及其线段侧向单位向量；`js/tank_nodegen.js` 新增 `ensureLoSCorridor(coversList, hints, rng)`，校验玩家↔各敌簇质心直视线，被挡则依次侧移遮挡体 / 降级 full→soft（去 vision）/ 移除，保底至少一条直视线，确定性、用节点 seed 派生 rng、不抛异常；`generateNode` 新增可选 `losHints` 参数（缺省不启用，向后兼容）。
- **运行期绕行**：`js/tank_ai.js` 新增 `_losDetour(t,p,heading)` 并在 search 分支（LoS 被挡路径）注入侧向绕行，朝向「目标大方向 + 侧向绕开遮挡体」合成行驶以恢复 LoS；开火仍需 `los` 为真（未采用盲射方案）；无遮挡节点行为零变化。
- **验证结论**：`npm run check` / `npm test`（含 test-replay.js 确定性校验）/ `npm run test:browser` 全绿；seed=1 回放基线 hash 随布局变化而漂移（A17 落地时为 `5b8c4126`，P-43 敌群构成改动后为 `799b65f`；test-replay.js 仅校验确定性，不钉常量，故无需改测试）；零开火节点 9/40 → 7/40（方案 1+2 合计改善）。

---

## 8. 节点布局难度校准（2026-08-26，P-43 切片(a)）

- **度量来源**：`js/tank_nodegen.js` `nodeLayoutMetrics(result, opts)` → `coverCoverage / connectivityRatio / losSymmetry / minPassageWidth / coverCount / waterArea`；回归脚本 `scripts/test-nodegen-calibration.js`（7 模板 × 5 难度 × 8 seed 锚定，已挂入 `npm test` 链）。
- **难度旋钮（当前值，`js/tank_nodegen.js` / `RULES.nodeMap`）**：
  - `cullRate = rng.range(0,0.12) * (1 - 0.7*diff)`（高难保留更多元素）
  - `wreckProb = 0.05 + 0.10*diff`
  - `RULES.nodeMap.coverWorldScale = { half:0.42, full:0.42, barricade:0.32 }`（half 已被生成期跳过，见 A17/§7）
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

---

## 9. P-46 类别化敌军与生成机制优化（2026-09-06 落地）
- **类别化与生成机制优化已全线实施**：
  - `tanks/*.json` 增加可选 `class` 字段（light/medium/heavy/spg），缺省按数值启发式自动推导；`tanks/dummy.json` 标 `"target": true` 退出敌池。
  - `RULES.ai.classProfiles` 四类行为档案落地（轻型侧绕强化、中型基线、重型只进不退且抗晕、SPG 保持距离防逼近）。
  - `aiDecideEnemy` 类别分发落地：tier与class乘性合成 engage/aimTol，flankBias 调制 flank 窗口，moveLock/keepRange 调制移动语义，stunResist 决定抗晕。
  - 敌军「数值锚定制」落地（外观与数值彻底分离）：敌军彻底仅取几何外观与 class，数值统一锚定玩家出战时刻的 frozenstats 快照 `playerAnchorStats` × `enemyClassProfiles[class]` × 难度系数。
  - 多方向环带生成：废除旧右侧单向聚簇生成，改为以玩家出生点为原点，随难度递增的多扇区（2~4向）环带分布布点，保障全方位压制，带全网格净空兜底。
  - 战局确定性测试及 sim 回放全线接通，五节点回放 hash 重锚为 `d60b9022`（#A11 路网专轮后）。
  - 密林模板（forest_dense/woodland_line）：cov≈1.1（设计即密），con 随 rng 抖动 0.35–1.0（自然空间分区）；真实对局由 `makeNode` 的 `findPlayerSpawn` + `ensureLoSCorridor` 兜底可玩性。回归带 `con≥0.35`，**不做强行降密**以免破坏林相设计。
  - 当前参数**未做破坏性调整**（实测已满足难度曲线意图）。本切片交付 = 把实测剖面**锁定为回归锚点** + 文档化，使未来任何布局/难度旋钮改动都能被 `test-nodegen-calibration.js` 捕获劣化。
  - 注：密林模板若后续要做「高难更通透」可调 `placeForestClusters` 的簇数/spacing（机制已随 #A11 路网专轮落地，作为后续平衡调节旋钮保留）。

---

## 10. 道路曲线化 + 预烘焙 + 跨相重叠消解（2026-09-14 落地；2026-09-16 路网重做见 §10.1）
- **道路曲线化（用户定案：曲线+直线结合）**：`placeRoadNetwork` 重写——道路控制点经 **Catmull-Rom 平滑**（`_catmullRomSample(points, step=110)`，端点 p1/p2 + 1–2 个横向抖动中点）生成曲线路径点。道路以**短 OBB 链段**写回（`_emitRoadChain`：`w = 段长 + roadW×0.35` 搭接、`h = roadW`、`tier:'road'`、同链共享 `groupId`），角度沿段方向 `atan2(dy,dx)`。
- **进入地图前预烘焙（修复"远距整段消失"）**：旧实现道路为**旋转长 OBB**，横跨大距离时被 `aabbInView` 轴对齐包围盒剔除（长段旋转后 AABB 覆盖视口外）→ 视觉上"离开一段距离整段消失"。修复分两层：
  1. 生成端改为**短链段**（每段 ~110px，AABB 与 OBB 差异极小）；
  2. 运行时 `tank_mvp.html` 在 `enterBattle` 实体化节点后调 **`bakeNodeGroundLayer(node)`**——按 `groupId` 从几何中线端点自适应贪心串联，把同链段重连为完整平滑多段线，全节点预烘到一块 node 尺寸画布（`groundLayerCanvas`），分层描画路基/沥青路面/中心虚线，`draw()` 整图 blit（`drawImage`）替代逐段实时渲染，**彻底消除胶囊串联感与远距消失**。端帽 `lineCap:'butt'`（见 §10.1）、连接 `lineJoin:'round'`。dev 随机场按钮重置画布（回退逐段绘制路径仍可用）。
- **跨相重叠消解（道路/岩石/建筑/水域/泥潭互不重叠）**：`pruneOverlappingCovers(covers)`（generateNode 尾部统一执行）——对每对元素取 **3×3 局部采样点**（66% 范围世界系），任一元素 ≥3/9 采样点落入另一方多边形/OBB 内 = 显著重叠；**优先级高者胜**（`_PRUNE_PRIORITY`：岩石 > 完整建筑 > 半高/路障 > 水/泥 > 植被；road 与同 `groupId` 链段豁免）。败者 **nudge 平移优先**（环形候选 6 环×8 向，避开其余所有元素；保住地形标签数量契约，`test-nodegen.js` 的"标签必产出"），无空位才整株移除。纯函数确定性（`_pointInPrunePoly` 局部点测，无 rng）；实际剖面见 `test-nodegen-calibration.js`。

### 10.1 路网重做：取消跳段 / 出界路头 / 抑制浅角互穿（#B7，2026-09-16 用户反馈修复）
用户反馈三条：**① 道路被其他物体截断 ② 道路尽头都是圆弧形 ③ 交叉口太多、道路之间看起来像叠加在一起**。三者对应三个独立根因，逐一处理。

| 反馈 | 根因 | 修复 |
|---|---|---|
| ① 被截断 | 旧实现对模板 `full` 建筑（`avoidBoxes`）**逐链段跳段**（`obbSegmentHitsAvoid` 命中即弃该段），实测留下 **202~246px** 缺口（≈建筑尺寸） | **取消跳段**：`isSegOk` 只保留界内判定。道路属 `ground` 层、先于一切元素绘制，建筑/岩石天然盖在路面之上，跳段纯属有害。实测链内最大接驳间距 **202–246px → 0.00px** |
| ② 圆弧尽头 | 端点内缩 `0.5*roadW + 12`px + 渲染层 `lineCap:'round'` → 完整圆弧端帽整个可见 | 端点**严格落在节点边界线上**，端帽被节点画布裁掉一半 = 道路延伸出画面；`bakeNodeGroundLayer` 的 `lineCap` 改 **`'butt'`**（保留 `lineJoin:'round'`）。实测孤悬路头 **0 个** |
| ③ 交叉像叠加 | 端点偏移 ±0.42×半幅、控制点横向偏移 ±0.18×跨度 → 纵向"干道"斜成 139°+，与横干道以 **35° 浅角**互穿 | 端点偏移 ±0.42→**±0.13**、控制点横向偏移 ±0.18→**±0.04**×跨度；取消斜向支线。实测夹角 → 近似直角（≥60° 护栏） |

- **回归**：`scripts/test-nodegen.js` §16——链内无断口（<1e-6）/ 无孤悬路头（必须出界或 T 形接驳）/ 交叉口上界 / 交叉夹角 ≥60°，7 模板 × 8 seed。`test-nodegen-calibration.js` 剖面重锚（连通性 **1.000**）。

### 10.2 路口感（路口标线让位）+ 拓扑多样化（#B7 v2，2026-09-16 用户二次反馈）
用户二次反馈：**「交叉处还是没有『路口』的感觉，只是机械地叠加」「似乎所有地图都是横竖各一条公路」**。

**（a）拓扑多样化**——v1 恒为「1 横 + 0~1 纵」，即每张图都是同一个十字（实测 **70/84** 张），且 `wide = halfW >= halfH` **恒为 true**（7 个模板全为横向）→ 纵干道永远是配角、最多 1 条。v2 改为按 `rng()` 从 **6 种拓扑**抽取：

| 拓扑 | 概率 | 链构成 | 路口数 |
|---|---|---|---|
| A 单条贯通 | 16% | 1 条（横或纵由 rng 定，不绑定长边） | 0 |
| B 十字 | 26% | 1 横 + 1 纵 | 1 |
| C 单侧 T 形 | 18% | 1 条贯通 + 1 条锚定支道 | 1 |
| E 双侧 T 形 | 18% | 1 条贯通 + 2 条锚定支道（分居两侧） | 2 |
| D 错位平行 | 14% | 2 条同向，端点分居两个半区（不相交） | 0 |
| F 错位丁字对 | 8% | 1 条贯通 + 2 条锚定支道 | 2 |

- **T 形支道必须锚定在干道的真实折线上**（`anchorOn(pts, u)` 取采样点）：若按「干道两端点连线的猜测位置」取锚点，会因干道自身 ±4% 跨度弯曲（≈±96px > 半个路宽）而悬空，产生路面缺口（实测曾出现 118 处）。支道另一端落在垂直边的边界线上 → 恒为「真 T 形 + 恰好 1 个路口」，不会像「另一条贯穿道路」那样与其它路再次相交（避免回到「路口太多」）。
- **路口检测用采样折线求交**（而非链段 OBB 口径）：T 形锚点恰好位于干道折线上某点，若用「段中心 ± 半跨」判定，交点参数正好压在容差边界上，浮点噪声会让 T 形路口随机漏报（漏报 → 标线不断开 → 没有路口感）。
- **不设三岔拓扑**：任何含 3 个以上路口的构型都被排除（用户明确反对「路口太多」）。

**（b）路口感=渲染问题，不只是几何**——v1 把每条链**各自独立描边三遍**（路基→沥青→中心虚线），后画的链整幅盖掉前一条，且两条链的中心虚线都笔直穿过交点 → 视觉上就是「两条路叠在一起」。v2 把 `bakeNodeGroundLayer` 改为**两遍绘制**：

1. **第 1 遍**：所有链的路基（外扩 8px 暗色路缘）+ 沥青路面 —— 交叉处自然合并成一片连续沥青广场；
2. **第 2 遍**：统一画中心虚线，随后**在每个路口处用路面同色圆挖空**（`generateNode` 新增返回 `roadJunctions`，经 `makeNode` 平移到世界系后由 `node.roadJunctions` 传入渲染层）——路面连续、**标线让位**，这才是真实交叉路口的读法。**挖空圆半径 = roadW×0.5**（2026-09-17 #C1 修复：旧 0.85×roadW 在 45° 方向越过路缘（0.6×roadW > 0.5×roadW 路半宽）→ 圆形沥青凸斑外溢路面；r=0.5×roadW 时圆内任意点到两条正交路中线距离 ≤ 0.354×roadW，恒在沥青并集内，且虚线让位区直径恰为路宽）。回归：`test-nodegen.js` §16 新增「全部路口 r ≤ 40」断言。

- **实测数据**：210 张地图样本——拓扑分布 `HV j=1`×112 / `HVV j=2`×49 / `VV j=0`×28 / `HH j=0`×7 / `V j=0`×7 / `H j=0`×7；平均路口 1.00、**上界 2**；链内最大断口 **0.00px**；孤悬路头 **0 个**。
- **回归**：`scripts/test-nodegen.js` §16 扩到**七条护栏**——无断口 / 无孤悬路头 / 交叉 ≤2 / 夹角 ≥60° / **拓扑 ≥3 种** / 路口数分布覆盖 1 与 2 / **存在 0 路口拓扑**（防「总是有路口」这一新单调）。渲染顺序另以 mock ctx 复刻验证（路口挖空 `fill` 发生在标线 `stroke` 之后）。剖面见 `test-nodegen-calibration.js`（#B7 重锚 v2，连通性维持 1.000）。**（拓扑表已被 §13.1 的 v4 取代：F 删除、G/I 新增、概率重排。）**

## 11. 水域溺毙 + AI 避水（2026-09-14 落地）- **完全浸入溺毙**：`tank_cover.js` 新增 `tankFullyInWater(tank)`——车体四个角点（hullOBB 四角世界系）**全部**落在任一 `water`/`river` 凸部分内（点-in-多边形射线法）才算完全浸入；四角之一出水即复位。主循环（`tank_mvp.html`）对每实体累计 `drownT += dt`；`drownT >= RULES.drowning.seconds(8)` → 经 `applyDamage` 沉没摧毁（玩家/敌人/Boss/友军一视同仁；结算缓冲期 `isClearing` 不累计防清场误杀）。玩家警示：`warnAt(3s)` 倒计时临界音 + 头顶 `≋ 溺毙 x.xs` 倒计时 HUD（<3s 红字）；出水 `drownT` 复位。
- **敌人也会溺毙（AI 绕水寻路）**：`tank_ai.js` 新增 `applyWaterAvoidance(t, out, ctx)`（`aiDecide` 敌方分支输出后套用）——沿 `hullAngle` 前向探 140px（`RULES.ai.waterProbeDist`）：
  - 前向入水 + 至少一侧（±0.6rad 侧探）为干地 → `turn` 转向干地侧（move 保持 = 沿岸绕行）；
  - 前向+双侧全湿 → `move=0` 停驶（防 AI 冲水自杀溺毙）；
  - 前向干地 → 原样返回（零行为漂移）。
  - 入水判定 = cover 实例的 OBB / `verts` 多边形局部点测（自包含纯函数，`ctx.covers` 注入，covers 缺失时原样返回）。水区通行由 passability 0.4 经 `getCoverUnderTank` 减速，不另行阻断。
- **update §5.4 checklist #3**：AI 读地形避水已由 `applyWaterAvoidance` 承担（绕行而非找掩体）；§6 覆盖 `shellBlock` 语义不受影响。

## 12. 掩体体系收敛：全高=建筑/岩石、半高掩体移除、确定性挡弹（2026-09-20 #E1/#E3 用户裁定）

**用户反馈**：① 炮弹仍然被不可见物体拦截；③ 全高掩体明确衍生为建筑、岩石，半高掩体相关计算代码全部移除不再使用。

### 12.1 tier 表现行口径（唯一事实源 `RULES.coverTiers`）
- **`half`（半高掩体）tier 定义已删除**——`RULES.coverTiers.half` 不再存在；`RULES.heights.cover.half`（旧 1.4m 越掩高度）一并删除。
- **`full` 的 label 改为「建筑」**（全高掩体的具体化）；`rock`（岩石）保持 `solid + full + passability 0`。二者即「全高掩体」的全部具象。
- **`ruined`（残破建筑）归入全高掩体**：`shellBlock: true` / `exposureProfile: 'full'`（旧 `'grad' + 'half'`）——直射实弹 100% 确定性格挡（含炮塔），击毁后转 `rubble` 残骸。
- **`stump`（树桩）/ `rubble`（碎石）改为不挡弹**：`shellBlock: false` / `exposureProfile: 'none'`（旧 `'grad'`）。
- **`tree`（树）改为可被坦克推倒**：`crushable: true`（旧 false）——坦克压过即 `tree → fallen`（与炮弹 1 发伐倒同一残骸链）。树木世界尺寸另乘 `RULES.nodeMap.treeWorldScale`（默认 0.6，主循环与林地簇同源）。

### 12.2 弹道拦截模型：确定性唯一入口（#E1 根因修复）
旧实现的拦截链有三处「不可见拦截」来源，**整链删除**（`js/tank_fire.js` 顶部注记保留根因说明）：

| 来源 | 机制 | 处置 |
|---|---|---|
| ① 残骸逻辑体格远大于可见贴图 | `rubble` 逻辑 OBB 90×60 仅绘制 5 颗 2.2~4.2px 石子；`grad` 剖面 + 中坦 exposure=0 ⇒ 100% 拦停 | `stump`/`rubble` 改不挡弹（§12.1） |
| ② `s.dec` 曝光缓存跨帧失效 | 缓存仅在跳弹时复位；掩体被摧毁后 `findCoversOnPath` 已跳过 `hp<=0`，仍按旧 exposure 拦停 ⇒ 炮弹停在目标车体命中点（隐形墙） | 删除 `s.dec` / `_decCoverId` / `shellVerticalDecision` 缓存链 |
| ③ 视野圈外实体不绘制却拦弹 | `entityHiddenByVision` 跳过绘制，但 `stepShells` 对全部 `entities` raycast ⇒ 不可见车体拦弹 | 接入层经 `fireCtx.hiddenByVision` 注入判定，弹道命中扫描跳过不可见实体 |

**现行口径**：炮弹只被**确定性**掩体拦截——`shellBlock===true`（建筑/岩石/树/残破建筑，在掩体**入口点**截停）与 `'single'`（沙袋，挡 1 发 / >70° 可跳弹）。`shellBlock: 'grad'` 不再是合法取值（`normalizeCoverTiers` 派生同步收敛）；水/河/泥/路/栅栏/残骸/灌木/倒树一律越飞。`getExposure` 保留为视线/预测用纯函数，但不再有 `half` 越掩插值（`RULES.coverRules.mediumHullExposure/heavyHullExposure` 删除）。

### 12.3 路网 v3：去横平竖直 + 公路加宽 + 公路加速（#E2/#E3）
- **参数收口** `RULES.nodeMap.road`（旧硬编码 60~80 世界px、amp 0.04）：`widthMin/Max = 92/124`（**公路加宽**）、`curveAmp = 0.16`、`branchCurveAmp = 0.10`、`diagChance = 0.45`、`diagAngleMin/Max = 0.18/0.52 rad`。
- **斜向干道**：新增 `DH/DV`——倾斜角 θ∈[diagAngleMin, diagAngleMax] 的横/纵干道（端点沿边界按 `tanθ × 跨度` 错开），由 `TRUNK()` 按 `diagChance` 混入六拓扑；B 十字拓扑固定「横（可斜）× 纵」以保证交点必然存在。端点沿边偏移由 ±0.13 放宽到 ±0.20。
- **公路加速**：`RULES.nodeMap.road.speedBonusKmh = 10`——坦克在 `tier:'road'` 条带上行驶时表速 +10km/h，受 `RULES.parameterLimits.maxSpeed.max`（150km/h，即 375 px/s）上限钳制；加成经 `speedBonusLerp` 指数阻尼平顺生效（进出路面不突跳）。消费方 `js/tank_move.js driveTank`。
- **村镇街道同步加宽**：`placeVillage` 的 `roadW` 亦改读 `RULES.nodeMap.road`（消除两套硬编码）。

### 12.4 建筑沿路/路口聚集 + 路口沙包（#E3）
新增 `placeRoadsideBuildings`（`RULES.nodeMap.building`：`roadBand 96 / junctionBias 0.9 / junctionRadius 210 / clusterPerJunction 3~5 / maxPerNode 18`）与 `placeJunctionBarricades`（`RULES.nodeMap.junctionBarricades`：`chance 0.85 / countMin~Max 2~4 / ringMin~Max 0.9~1.9×路宽`）：

> **沿革注记（2026-09-23）**：本段括号内的 `clusterPerJunction 3~5 / maxPerNode 18` 为 #E3 落地时值，**已被 §13.4（#I3）取代**为 `4~8 / 28`（另加 `bossDensity: 1.6`）。另 `RULES.nodeMap.road.junctionClearR`（0.85）原为**死配置**（全仓库除定义处外零消费，生成器实际以 `roadW × 0.5` 硬编码路口清空半径，`js/tank_nodegen.js` `junctions.push({r: roadW * 0.5})`）——**已于 2026-09-23 A 档从 `js/tank_rules.js` 删除**，现行 `RULES` 不再含该键（见 `DEVELOPMENT.md` §4.35）。
- **路口邻域聚集程度最高**：每个路口先在 `junctionRadius` 内环形布 3~5 栋建筑（避让路面与路口中心）。
- **沿路成排**：随后沿路链段采样，在路缘外侧 `roadBand` 带内成排布建筑，朝向对齐街道轴。
- **路口沙包**：每个路口按概率生成 2~4 个 `barricade`，落在路口环外、不压路面的位置。
- 两者在**统一消叠（`pruneOverlappingCovers`）之前**注入 → 天然参与「建筑/岩石/树/可破坏物/水域/泥潭互不重叠」消解；建筑间与建筑/既有元素间保留 30px 通行间隙（`obbHitsCover` pad）。
- `generateNode` 新增返回 `roadW`（本节点实际路宽，供渲染/敌人生成/测试读取）。

### 12.5 难度校准重锚（`scripts/test-nodegen-calibration.js`）
元素变多（沿路/路口建筑 + 沙包）使 `coverCoverage` 整体上移约 +0.005、`minPassageWidth` 进一步收窄（路口邻域建筑把通道压到 1 格 ≈40px，仍 > 车体宽 38px）；**全模板连通性维持 0.999~1.000**。基线表按实测重锚（TOL 不变：cov ±0.02 / con ±0.05 / minw ±0.5）。**（已被 §13.3 重锚取代——路网 v4 与可破坏建筑落地后基线再次更新。）**

---

## 13. 路网 v4 + 可破坏楼房（2026-09-21 #G3/#G4 用户需求）

**用户反馈**：「公路现在有更多形状了，但是我期待更复杂的路网和更多的建筑等物体」。

### 13.1 路网 v4：新增两种街区拓扑 + 删除浅角拓扑

`placeRoadNetwork` 拓扑表由 6 种改为 **7 种**（概率重排：A 12% / B 22% / C 14% / E 14% / D 14% / G 12% / I 14%）：

| 代号 | 拓扑 | 路数 | 路口 | 说明 |
|---|---|---|---|---|
| A | 单条贯通 | 1 | 0 | `TRUNK(0)`（横/纵/斜随机） |
| B | 十字 | 2 | 1 | 横（可斜 `DH`）× 纵 `V` |
| C | 单侧 T 形 | 2 | 1 | 贯通干道 + 锚定支道（`TH`/`TV`） |
| E | 双侧 T 形 | 3 | 2 | 一条横干 + 两条锚定支道 |
| D | 双同向平行 | 2 | 0 | 错位半区、互不相交 |
| **G** | **网格街区（新增）** | **3** | **2** | 一条正交横干 `H` + 两条贯穿纵路 `VT` → 「日」字形街区 |
| **I** | **双干贯穿（新增）** | **3** | **2** | 两条近平行横干 + 一条贯穿纵干 `VT` → 环形路网雏形 |

- **新增近正交纵路 `VT`**：端点错位收紧到 ±0.08（干线 `V` 为 ±0.20）——街区拓扑里纵路可达 2 条，沿用干线错位时宽模板（`halfW ≫ halfH`）的纵路会斜到与横干夹角 <60°。
- **删除旧 F「斜向丁字对」**：斜干线弯曲后与正交支道的实测交角低至 **36.9°**（`urban_block` seed6），无法稳定满足 §10.1 的 ≥60° 护栏。斜干线观感由 B/C/E 的 `diagChance` 分支保留。
- **T 形支道改直线**：`TH`/`TV` 的构建振幅由 `branchCurveAmp`(0.10) 改为 **0**，终点沿边偏移收紧为 ±0.04。旧实现按**整条干道跨度**折算振幅百分比，而支道自身跨度只有半幅 ⇒ 同样的百分比产生大得多的局部斜率（与斜干相交时实测 36.9°，`#B7` 夹角护栏盲区）。
- **D 平行拓扑收紧**：端点错位 ±0.05 + 弯曲振幅 0.05（旧实现两端点独立抽取 ±0.62~−0.24，链自身可斜跨半区 → 两条「平行」路以 5.1° 浅角互穿，实测 `urban_block` seed2086）。
- **`diagAngleMax` 0.52 → 0.34 rad**（≈30°→19°）：斜干 × 正交支道的交角 = 90°−θ−干道链段局部斜率（弯曲引入 ≈7°）；0.42 时实测最小交角 58.2°（低于护栏），0.34 时 ≥62.5°。
- **附带修复**：林地簇（`placeForestClusters`）此前无节点边界钳制，簇区域贴边时（`village_center` 防风林 `dx=-340`）簇心随机偏移可把树推到边界外（实测 `x=-0.0099`，`test-map`「掩体在界内」失败）。现经 `opts.bounds` 做**放置后修正**（不消耗 rng、不改变采样流，同 seed 确定性不变）。

### 13.2 可破坏楼房 tier `building` + 建筑混合与密度提升

新增 `RULES.coverTiers.building`（可破坏楼房）：

| 字段 | 值 | 说明 |
|---|---|---|
| `destructible` | 3 | 耐久 3 发才击毁（`full` 为 `Infinity`） |
| `toTier` | `ruined` | 击毁后转残破建筑（**再 1 发 → `rubble`**，碎石不挡弹） |
| `shellBlock` / `exposureProfile` | `true` / `'full'` | 与 `full` 同为全高掩体（确定性 100% 格挡直射） |
| `drawStyle` | `'box'` | 复用 full 的建筑绘制 |
| `passability` / `vision` | `1.0` / `true` | 可通行、遮视线 |

破坏链：**`building`(3发) → `ruined`(1发) → `rubble`**。`ruined` 此前在 tier 表中定义但**从未被生成**，本次随建筑混合首次实际进入地图。

- **`placeRoadsideBuildings` 建筑混合配比**：30% `building`（可破坏楼房）/ 10% `ruined`（残破建筑）/ 60% `full`（不可摧毁），由 `pickTier()` 按 rng 抽取。
- **密度提升（2026-09-21 #G4）**：`clusterPerJunction` 3~5 → 3~6、`maxPerNode` 18 → 20、沿路排布采样步 `segs/6` → **`segs/4`**；建筑间/建筑与既有元素的通行间隙 30 → **34px**（密度上升时保证可用通道）。**（本行参数已被 §13.4 的 #I3 再次上调取代——现行值为 `clusterPerJunction` 4~8、`maxPerNode` 28，另加 Boss 战图 `bossDensity: 1.6`；以 §13.4 为唯一口径。）**
- **`coverWorldScale`** 补 `building: 0.42`（与 `full` 同尺度收敛）。
- 同步点（新增 tier 必须登记处）：`VILLAGE_SOLID`（村庄避让集合）、`_PRUNE_PRIORITY`（building: 9，与 full/intact 同级，消叠时优先保留）、`tank_map.js` 敌军建筑聚集的 `structCovers` 过滤（加入 `building`）。`full` 仍为 `Infinity`（`test-covers.js` 断言不变），`ASSET_DEFS` 不新增建筑条目（复用 full 的贴图路径）。

### 13.3 难度校准重锚（第二次，`scripts/test-nodegen-calibration.js`）
路网 v4（拓扑重排 + 支道改直线 + 平行收紧）+ 可破坏建筑与密度提升，使 `coverCoverage` 整体下移约 -0.002、`minPassageWidth` 因建筑密度上升而收窄；**全模板连通性维持 0.999~1.000**、开阔模板地板 ≥0.85 全部富余。基线表按实测重锚（TOL 不变：cov ±0.02 / con ±0.05 / minw ±0.5）。

### 13.4 建筑密度再提升 + Boss 战图加成（2026-09-21 #I3，现行口径）

**用户裁定**：「继续增加地图、特别是 boss 战地图的建筑密度」。

- **参数提升**（`RULES.nodeMap.building`）：`clusterPerJunction` 3~5 → **4~8**、`maxPerNode` 18 → **28**；沿路采样数随乘子提升（`wantRoadside = round(segs/4 × den)`）。
- **Boss 战图加成**：新增 `bossDensity: 1.6`——`makeNode` 用纯函数 `isBossNodeIndex(index)` 提前判定 boss 节点，经 `generateNode(opts.buildingDensity)` → `placeRoadsideBuildings(…, density)` 放大路口簇规模/总量上限/沿路采样密度（普通节点恒 1）。
- **顺带修复 #E3/#G 遗留缺陷**：`placeRoadsideBuildings` 的 `fits()` 此前对 `outCovers` 用 pad 34 判重叠，而 `outCovers` **含全部道路段**（宽 92~124px 条带）⇒ 沿路/路口建筑几乎全部被拒，函数产出恒为 0、所有密度参数空转（实测同 seed 下仅有模板自带建筑）。现行：道路按 pad 10 判定（不压路面），**非道路**元素才按 pad 34 留通行间隙；`placed` 之间仍 pad 34。
- **实测**：同模板 8-seed 结构总数 87 → 103（×1.6，`building`/`ruined` 首次实际出现）；连通性维持 **0.999~1.000**、`minPassageWidth` 仍高于可通行下限（≥1.0 格）。
- **校准重锚（第三次）**：`coverCoverage` 整体上移约 +0.015~0.021（建筑变多），基线表按实测重锚（TOL 不变），见 §13.3 上方基线表与文件内 #I3 注记。
- 回归：`scripts/test-nodegen.js` #I3 段（参数值/8-seed 聚合乘子生效/沿路建筑实际生成/`buildingDensity=1` 与缺省一致/`bossDensity` 存在）；`scripts/test-nodegen-calibration.js` 重锚通过。
- 战斗侧影响摘要见 `specs/combat.md` §12.4。

---

## 14. 横向卷轴（strip）节点 —— 设计预留（2026-09-21，**未落地**）

> **状态：设计预留，代码尚未改动。** 本节是 2026-09-21 用户设计征询的**参数与规则口径唯一归口**，实施时以此为准；完成并三链验证后按 AGENTS.md §2.2 去掉「未落地」标注、改写为现行口径，并新增 `DEVELOPMENT.md` §4.x。
> **在此之前，地图尺寸/生成/视野的现行值仍以 §1~§13 与 `specs/combat.md` §11.1 为准**——本节不得作为「现状描述」引用。
> 研究依据（file:line 诊断、探针实测数据、已实测排除的路径、分批计划）：`docs/PLAN.md` §3。

### 14.1 节点形态与尺寸

- **基准尺寸**：横向 ≈10 屏 × 纵向 ≈2.2 屏（1920×1080 ⇒ ≈19200×2400 世界 px），面积 ≈现状（5.8k×3.5k）的 2.7 倍。**不做精确数值绑定**（2026-09-21 用户裁定：按可玩性定），允许依实测通道/密度上下浮动。
- 「屏」按 zoom=1 的视口世界尺寸（`vw × vh`）计，**不**按最远缩放（`minZoom`）口径——后者把地图再放大 1.56 倍，烘焙与遍历成本同步上升。
- 玩家出生点维持左缘 `w×0.10`（§6 出生走廊保护不变），推进方向 = `+x`。

### 14.2 strip 构造（片拼接）

- **片（chunk）** = 一个现有模板实例，**片内 `scale` 沿用现行 `nodeScaleFor` 口径**（元素世界尺寸与当前版本一致）。不得为凑地图比例去缩放片内元素——实测该做法使相对通道劣化到 0.03px（道路宽等绝对像素参数不随之缩放）。
- **接缝净空（必需）**：片边界 ±300px 带内移除 `structure`/`foliage`（按 `tierGroup`）元素，保留 `ground`/`liquid`。不做净空时实测最窄通道 4px < 车体宽 38px ⇒ 接缝卡死；净空加宽到 ±500 无额外收益、只掉密度。
- **横向贯通干道约束（必需）**：每个横向节点的各片必须含一条沿推进轴的贯通干道，端点落在片的左右边界线上（复用 §10.1 的端点口径）。现行 7 拓扑中近半数 seed 可能产出纯纵向贯通（左右边界端点 0~2 个）⇒ `placeRoadNetwork` 需增加该约束。
- **纵向裁剪**：片高 > 目标高时丢弃上下边缘元素；**不做坐标压缩**（实测压缩使实体重叠对 14→32、最窄通道 3px）。
- **密度补偿**：裁剪后须维持 ≥ 现状量级（≈13 实体/屏；实测裁剪版仅 6.7/屏）——手段为片内叠加建筑/森林相位，或把边缘元素钳制回界内而非丢弃。验收指标取 `nodeLayoutMetrics`：连通性 ≥0.999、最窄通道 ≥ 车体宽 38px + 余量、`coverCoverage` 不随片数下降。

### 14.3 防线式敌人生成（取代全向环带）

- **防线（defense line）**：沿推进轴把地形锚点分桶（桶宽 1~1.5 屏），每桶 = 一条防线。
- **锚点来源**（全部为现有产出物，不引入新数据源）：`roadJunctions`（路口）、solid 结构（`full`/`intact`/`building`/`ruined`/`rock`）、liquid（`water`/`river`）、foliage 簇（`tree`/`bush` 连通块）。每线取 1~2 锚点，敌人在锚点周边成批生成（半径沿用 `RULES.nodeMap.enemySpawn.structureRadius` 口径），每批 3~6 辆。
- **难度调制**：防线数量与每线敌数随难度联动；现行 `enemyCountForDifficulty`（1~4 辆/节点）须按地图面积同比上调。
- **激活**：保留 `aiTriggerDist`（现行触发距离口径），复用 `engagePropagate`（`RULES.ai.engagePropagateRadius`/`engagePropagateChance`）实现同一防线整体响应。
- **增援**：仅允许补给玩家**前方**未清空防线（现行「视口外扩 + 距玩家 ≥ 触发距离×1.05」落点约束会把兵刷在玩家后方，横向推进下失效）。

### 14.4 渲染与工程配套

- **敌人渲染/可见范围 —— ⚠️ 原预留口径已被 2026-09-23 用户裁定作废**：原预留的 `R = max(现行屏幕相对公式, 最大 engage × 1.15)`（随难度增长、不随视口窄轴缩水）**不再实施**；可见半径口径**保持不变**（`js/tank_camera.js:119-143` 屏幕相对式），「敌人开火时看不见」改走**视野卡 + 镜头外延做强**（几何上限、已核实数值与配套约束见 `specs/combat.md` §11.5 与 `docs/PLAN.md` §4.2）。（原注记保留追溯：拉远时的额外绘制由 `aabbInView` 兜底，弹道命中口径经 `fireCtx.hiddenByVision`（`tank_mvp.html:3547`）同步。）
- **地面层分块烘焙**：`bakeNodeGroundLayer`（`tank_mvp.html:3563-3696`）由「整节点单画布」改为**按片 tile 烘焙 + 视口内按需 blit**——整图口径下 12.3 屏宽 ≈223MB RGBA，最远缩放口径 ≈619MB。
- **空间分桶**：covers 数随片数线性增长（12 屏 ≈ 443~1200）；`draw` 视口过滤、`tank_minimap` 全量遍历、`tank_ai` 避水探针（每敌每帧）、`resolveCoverCollisions` 均按片索引只扫邻近片。
- **小地图**：等比缩放（`js/tank_minimap.js:15-19`）在 10:2 比例下退化成细线 ⇒ 改「横向条带 + 视口窗口」布局。

### 14.5 结算与推进

- 节点完成条件改为**「抵达右端出口 + 防线清空/配额」双条件**，取代现行单一 `quotaDone || (noEnemies && !canReinforce)`（`tank_mvp.html:3028-3036`）。
- Boss 节点形态待裁定（方形竞技场 or 横向走廊末端）；默认先沿用「`w×0.7` 生成点 + 走廊末端」。

### 14.6 测试重锚清单

`scripts/test-map.js:105-109`（节点宽高 ≥3 倍视口断言）、`test-nodegen.js` §16 七条护栏、`test-nodegen-calibration.js` 基线表、`test-replay.js` 确定性 hash、`test-browser-smoke/r3/run/r4.cjs` 四链。横向节点需新增专用回归：拼接确定性（同 seed 同布局）/ 接缝无断口 / 最窄通道 ≥ 车体宽 / 防线锚点覆盖全部桶。

### 14.7 第二阶段预留（不限于横线）

strip 生成器与防线生成器一律以「推进轴」参数表达（`advanceAxis: 'x' | 'y' | 路径`）；换竖向、蛇形或环形只换轴，生成相位与结算语义不动。

---

## 15. 防线式推进体系（B 档①②③，2026-09-23 落地，现行口径）

> **现行口径**：参数唯一来源 `RULES.nodeMap.defenseLine`（`js/tank_rules.js`）；实现 `planDefenseLines` / `collectDefenseAnchors` / `pickDefenseLineAnchor`（`js/tank_map.js`），消费方 `makeNode`。本节取代旧口径「以玩家出生点为原点的全向环带撒簇」（该路径保留为 `enabled=false` 的回退，见 §15.6）。

### 15.1 设计动机

旧生成按难度扇区把敌人撒在玩家四周，玩家没有推进方向感。B 档改为**沿推进轴分桶的防线**：玩家从左侧出生（`w×0.10`）、Boss 生成点 `w×0.7`，故推进轴取 **+x**，敌人在每道防线的地形锚点周边成批生成。因 AI 激活受 `aiTriggerDist` 限制，玩家通常**一次只遭遇前方一条防线**，形成「推进—遭遇—清剿」节奏。

### 15.2 分桶与间距

- 推进轴区间 = `[playerSpawn.x + max(lineMargin, minPlayerDist), w × axisTopFraction(0.92)]`。
- 间距 = `spacingScreens(0.9) × 视口宽 × lerp(spacingDiff[0]=1.15, spacingDiff[1]=0.85, diffNorm)` ⇒ **难度越高间距越窄、防线越密**。
- 防线数 = `clamp(max(linesMin, round(linesMin + (linesMax-linesMin) × diffNorm)), 1, floor(span / max(240, spacing×0.5)))`——以难度期望值为主，仅受「每桶至少 240px」的几何上限约束（若用 `round(span/spacing)` 当上限，高难度永远拿不到 `linesMax` 条）。
- 视口缺省时 `vw` 回退为 `w/3`（与 `nodeScaleFor` 保证的「节点宽 ≥ 3 屏」一致）。

### 15.3 锚点来源与优先级

`collectDefenseAnchors` 在桶内聚合四类候选，`pickDefenseLineAnchor` 按 `anchorJunctionChance(0.45)` **优先路口**，否则从其余候选随机取：

| 类别 | 来源 | kind |
|---|---|---|
| 路口 | `roadJunctions`（桶内） | `junction` |
| 结构 | tier `full` / `intact` / `building` / `rock` / `ruined` | `structure` |
| 水体 | tier `water` / `river` | `liquid` |
| 林地簇 | tier `tree` / `bush` 按 240px 网格聚合、成员 ≥3 视为一簇 | `foliage` |
| 兜底 | 桶内无候选 ⇒ 桶中心 + 纵向随机 | `fallback` |

锚点坐标钳制在节点内 `[60, w-60] × [60, h-60]`。

### 15.4 敌人数（现行值）

`targetCount = clamp(lineCount × anchorsPerLine × perAnchor, [enemyCountForDifficulty(diff), maxPerNode(12)])`，其中 `perAnchor = round(lerp(perAnchorMin 2, perAnchorMax 3, diffNorm))`。

- 低难度（1080p 视口）：2 条防线 × 1 锚点 × 2 辆 = **4 辆/节点**（quota 6）。
- 高难度：3 条 × 1 × 3 = **9 辆/节点**（quota 11~17）。
- **沿革**：旧口径恒为 `enemyCountForDifficulty` = 1~4 辆/节点；该函数保留为**下界**（仍由 `test-map` 独立断言）。
- **连带影响**：`quotaForDifficulty(initialCount, effDiff)` 公式未改动，故节点内击杀配额随初始敌数上升 ⇒ 单节点战斗时长较旧版上升约 1.3~1.5 倍。**待 B 档子项③（推进式节点完成条件）重塑**。
- `enemyCompositionForDepth(index, diff, rng, cfg, countOverride)` 新增第 5 参以接受防线制目标数（缺省回退旧公式，向后兼容）。

### 15.5 兜底补满的防线约束

锚点周边因掩体密集/贴边放不满时，兜底网格扫描**限定在推进轴防线区间内**，并按「离最近锚点距离」升序取点（贴防线补位）。旧口径按「离玩家最远」排序，会把未放满的敌人全推到地图最右缘成一列、破坏防线结构（实测同一 x 列四个敌人）。

### 15.6 Boss 节点与回退路径

- **Boss 节点强制走旧全向环带**：其常规敌人随后即被清空，但敌簇质心仍驱动 A17 LoS 走廊 ⇒ 若改用防线锚点会连带改变 Boss 战地图（实测打破「掩体在界内」断言）。`defenseLine.enabled` 对 Boss 节点不生效。
- `RULES.nodeMap.defenseLine.enabled = false` ⇒ 全节点回退旧全向环带，`targetCount` 回到 `enemyCountForDifficulty`。
- 旧参数 `enemySpawn.structureChance / structureChanceMax / junctionChance / structRadius` **现仅服务回退路径**；防线模式下锚点抽取由 `defenseLine.anchorJunctionChance` 承担。

### 15.7 附带修复：路口沙包越界（2026-09-23）

`placeJunctionBarricades`（`js/tank_nodegen.js`）原无节点边界检查，路口靠近边界且 `r` 取到 `ringMax×路宽` 时沙包会生成到节点外（实测 `run-seed` 节点 4 有三个 `barricade` 落在 `y≈1509 > 半高 720`）。现新增 `bounds` 参数（调用方传模板 w/h × scale ÷ 2），沙包含半个外接圆余量做边界拒绝。

### 15.8 回归锚点

`scripts/test-map.js`「B 档① 防线式敌人生成」段：敌军全部位于推进方向前方 / 敌数落在 `[难度基线, maxPerNode]` / 同 seed 逐字段确定性 / `targetCount` 随难度单调非降 / 高难防线数与每锚点敌数 ≥ 低难 / 锚点落在所属桶区间内 / 锚点来源合法 / 视口模式敌军不越右缘。`test-replay.js`（同 seed 摘要一致）与 `test-nodegen*.js`（元素生成）保持全绿。

### 15.9 增援只补前方未清空防线（B 档②）

- `reinforcementTick` 消费新增的 `state.defenseLines`（`makeNode` 输出的各防线 `{x0,x1}`）：候选 x 区间限定为「`x1 > playerPos.x`」的**前方防线桶**（先随机选区间、再在区间内取 x，rng 消耗序列固定 ⇒ 确定性不变）；y 仍全高随机。
- **玩家越过全部防线 ⇒ 不增援**（`frontRanges` 为空即返回空数组），避免在出口区反复刷兵。
- 原有落点约束全部保留（视口外扩 `reinforceMargin` 之外 / 距玩家 ≥ `aiTriggerDist×1.05` / 距据点 ≥ `reinforceOutpostDist` / 避 solid 掩体 60px）。因「距玩家 ≥ 触发距离」仍然生效，若前方防线可采区间已被玩家贴近到可见范围，则本次增援自然为空——符合「不刷不可见兵」原则。
- **「是否还可能增援」的判定必须与 tick 门控同源**：纯函数 `reinforcementPossible(node, playerX, kills)`（`js/tank_map.js`）——Boss / 配额已满 / 无前方防线时返回 false。mvp 的 `canReinforce` 消费此函数；**不得**再按旧口径（仅 `kills < quota`）计算，否则「越过全部防线 + 清残敌 + 配额未达」会因 `linesCleared` 恒假而**永久无法完成节点**（已核实的软锁，2026-09-23 修复）。
- **回退**：`RULES.nodeMap.reinforceFrontOnly = false` 或未提供 `defenseLines` ⇒ 旧全向随机落点。

### 15.10 推进式节点完成条件（B 档③）

- 纯逻辑 `nodeClearance(state)`（`js/tank_map.js`），mvp 逐帧消费：`state = { playerX, nodeW, exitX, alive, quota, kills, canReinforce, boss }`。
- **常规节点**：`done = exitReached && (linesCleared || quotaDone)`：
  - `exitReached`：`playerX ≥ exitX`（`exitX = w × RULES.nodeMap.exitZone.xFraction(0.93)`，边界含）；
  - `linesCleared`：场上无存活敌军且已无法增援；
  - `quotaDone`：`kills ≥ quota`（并列条件：抵达出口后即使有残敌也可凭配额通关）。
- **Boss 节点**：`done = 场上无敌`（沿用「Boss + summons 全灭」，不要求出口）。
- `reason` 取值：`pushing`（未到出口且仍有敌）/ `advance`（未到出口且已清空）/ `clearing`（到出口但仍在交战）/ `exit+cleared` / `exit+quota` / `boss` / `boss-cleared`；mvp 据此写结算日志（「抵达出口 · 区域肃清」/「BOSS 击破」）。
- HUD：`#quotaHud` 显示 `推进 N% → 出口 M% ｜ 配额 k/q`（推进百分比 = `playerX / w`）。
- **沿革**：旧口径为「`kills ≥ quota`」单条件（P-38），与推进正交（原地刷够配额即通关）。


