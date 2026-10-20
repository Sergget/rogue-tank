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
- **小地图**：js/tank_minimap.js 右上角渲染战场边界、**公路走向**、掩体分布、友军据点、敌我动态标记与**生存模式补给点**（公路/补给点口径见 §14.4）。
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
- **建筑程序化细节（#S13，2026-10-15）**：`drawStyle:'box'`（full/building/intact）不再是纯色块——加屋顶内收（12%，深色）+ 天窗网格（2~3 列，25% 空缺，deterministic hash）+ 墙体左上高光。实现 `js/tank_battledraw.js` `drawCover` box 分支。
- **地面投影（2026-10-17 #U11，现行口径）**：`drawCoverShadow(ctx, cov)` 在 `drawCover` 实体之前落两层软边影（近层深、远层淡，零模糊开销），统一光源假定左上、影子偏右下（与坦克炮塔影同向）。按绘制风格分流：
  - `box` / `rubble-box` / `rock-poly`（建筑/残骸/岩石）→ **轮廓多边形**投影，偏移量 `min(26, 6 + max(w,h)×0.08)`（大体块影子更长）；
  - `tree` → **树冠椭圆**投影，半径随树冠绘制半径 `R = max(w,h)×1.4×0.85` 派生，与 `ASSET_DEFS.tree.bakeCanopy` 同源；
  - `bush` / `fallen` → OBB 椭圆投影；`soft` / `barricade` / `stump` → 脚下淡接触影；
  - `road` / `mud` / `water` / `water-chain` / `bridge-deck`（贴地平面）→ **不投影**，函数早退。
  - **防御**：`coverCorners` 直接用 `cov.angle`（`undefined` 会得 NaN、投影整体消失），缺失时按 0 处理。

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
2. **第 2 遍**：统一画中心虚线，随后**在每个路口处用路面同色圆挖空**（`generateNode` 新增返回 `roadJunctions`，经 `makeNode` 平移到世界系后由 `node.roadJunctions` 传入渲染层）——路面连续、**标线让位**，这才是真实交叉路口的读法。**挖空圆半径 = roadW×0.5**（2026-09-17 #C1 修复：旧 0.85×roadW 在 45° 方向越过路缘（0.6×roadW > 0.5×roadW 路半宽）→ 圆形沥青凸斑外溢路面；r=0.5×roadW 时圆内任意点到两条正交路中线距离 ≤ 0.354×roadW，恒在沥青并集内，且虚线让位区直径恰为路宽）。回归：`test-nodegen.js` §16 新增「全部路口 r ≤ 40」断言。**沿革注记（2026-10-13 #R1）**：strip 窄支路 junction 取相交链路宽的较小者——strip-branch（路宽 0.7×stripRoadW）`r=stripRoadW×0.35`、hs-secondary（路宽 0.65×stripRoadW）`r=stripRoadW×0.325`（`js/tank_nodegen.js:2603/2670`）；主干道与 §10.2 的 roadW×0.5 口径不变（`test-nodegen.js` §16 只覆盖方形节点）。

- **实测数据**：210 张地图样本——拓扑分布 `HV j=1`×112 / `HVV j=2`×49 / `VV j=0`×28 / `HH j=0`×7 / `V j=0`×7 / `H j=0`×7；平均路口 1.00、**上界 2**；链内最大断口 **0.00px**；孤悬路头 **0 个**。
- **回归**：`scripts/test-nodegen.js` §16 扩到**七条护栏**——无断口 / 无孤悬路头 / 交叉 ≤2 / 夹角 ≥60° / **拓扑 ≥3 种** / 路口数分布覆盖 1 与 2 / **存在 0 路口拓扑**（防「总是有路口」这一新单调）。渲染顺序另以 mock ctx 复刻验证（路口挖空 `fill` 发生在标线 `stroke` 之后）。剖面见 `test-nodegen-calibration.js`（#B7 重锚 v2，连通性维持 1.000）。**（拓扑表已被 §13.1 的 v4 取代：F 删除、G/I 新增、概率重排。）**

## 11. 水域溺毙 + AI 避水（2026-09-14 落地）

- **完全浸入溺毙**：`tank_cover.js` 新增 `tankFullyInWater(tank)`——车体四个角点（hullOBB 四角世界系）**全部**落在任一 `water`/`river` 凸部分内（点-in-多边形射线法）才算完全浸入；四角之一出水即复位。主循环（`tank_mvp.html`）对每实体累计 `drownT += dt`；`drownT >= RULES.drowning.seconds(8)` → 经 `applyDamage` 沉没摧毁。玩家警示：`warnAt(3s)` 倒计时临界音 + 头顶 `≋ 溺毙 x.xs` 倒计时 HUD（<3s 红字）；出水 `drownT` 复位。
- **适用对象与豁免（2026-10-15 用户裁定，**取代**原「一视同仁」口径）**：
  - **玩家 / 普通敌军 / 友军**：正常溺毙。
  - **Boss：完全免疫溺毙**（`tank_mvp.html` 溺毙门控加 `!e.isBoss`）。**根因**：Boss 走位由 `updateBossBehavior` 的 `_bossMoveOverride` 直接驱动（`js/tank_boss.js`），绕过 `aiDecide` → 也就绕过了 `applyWaterAvoidance` 的探点避水；Boss 因而可能停在深水中央。此时溺毙＝关卡核心对抗白给，与设计冲突。豁免后 Boss 在深水仅**减速通行**（`passability 0.4`），不受淹死威胁。
  - **生存模式准备期**：不累计 `drownT`（`!isSurvivalPrep` 门控）——见 `specs/combat.md` §14「全场伤害关闭窗口」。
- **敌人也会溺毙（AI 绕水寻路）**：`tank_ai.js` 新增 `applyWaterAvoidance(t, out, ctx)`（`aiDecide` 敌方分支输出后套用）——沿 `hullAngle` 前向探 140px（`RULES.ai.waterProbeDist`）：
  - 前向入水 + 至少一侧（±0.6rad 侧探）为干地 → `turn` 转向干地侧（move 保持 = 沿岸绕行）；
  - 前向+双侧全湿 → `move=0` 停驶（防 AI 冲水自杀溺毙）；
  - 前向干地 → 原样返回（零行为漂移）。
  - 入水判定 = cover 实例的 OBB / `verts` 多边形局部点测（自包含纯函数，`ctx.covers` 注入，covers 缺失时原样返回）。水区通行由 passability 0.4 经 `getCoverUnderTank` 减速，不另行阻断。
  - **⚠ 上述「water / river 一视同仁」口径已被 §11.1.3 取代（2026-10-18 #U37）**：river 可涉水、不再触发绕行；只有 water 仍规避。
- **update §5.4 checklist #3**：AI 读地形避水已由 `applyWaterAvoidance` 承担（绕行而非找掩体）；§6 覆盖 `shellBlock` 语义不受影响。
- **水面渲染（#S12，2026-10-15）**：`water-chain` 去掉单根中心高光线，改为 ① 两岸暗带（深色，暗示水深）② 每段 3 条流向 streak（浅色短线，横向偏移/长度/透明度由位置 hash 确定性派生）③ 经 `performance.now()` 驱动的缓慢漂移（0.03/s，Node 生图时相位 0）。实现 `js/tank_battledraw.js`。
- **支流缝合（#S1，2026-10-15）**：H1T 支流汇入点 y 改用干流实际 segment 采样（不再用同参数正弦估算）；支流末端伸入干流内部（过中心线 `thick*0.25`），取消末端收分（原 1.0→0.55）——汇入处为水体合并而非锥形对接。实现 `js/tank_nodegen.js`。

### 11.1 河流可涉水化：三处修复（#U37，2026-10-18 用户裁定，现行口径）

**用户反馈**：①「河流贴图和实际『溺毙』生效的范围不一致，有的贴图有河流但是没有减速+溺毙效果」②「河流的宽度需要限制，不能造成坦克无法涉水过河」③「敌方 AI 的避水算法造成他们也不敢涉水追击玩家」。

#### 11.1.1 ① 贴图 vs 物理不一致 —— 根因是「道路免疫」的几何误判

`tankFullyInWater` 开头有「道路优先」豁免（桥/路口语义）：`if (getRoadUnderTank(tank)) return false`；`driveTank` 在读 `roadCover` 时也跳过 river 的 0.4 减速。**问题出在 `getRoadUnderTank` 的「在路上」判定本身**：

- 道路 cover 自 `cde3bc3` 起是**整链连续多边形**（`w/h` 只是整链 bbox，真实形状在 `verts`）。旧实现走 `obbOverlap(tankCorners, coverCorners(cov))`——拿**整条曲折路链的凸包**做 SAT。SAT 只对凸多边形正确，对细长弯曲路链**大面积误判**。
- 实测 `main-road-d0`：bbox **1030×4645**，真实路面多边形面积只占 bbox 的 **12.3%**；距路心 **894~1109px** 的河面点被判为「在路上」。
- 后果：`tankFullyInWater` 直接返回 false ⇒ 成片河面获得溺毙免疫；`driveTank` 跳过 0.4 减速。实测河内取样点 **16.8%** 被判「在路上」，其中**车体完全碰不到那条路**的真误判占 **8.3%**。
- **现行**：带 `verts` 的路链改走**真实多边形**判定——`pointInPolygon`（射线法，与 `tankFullyInWater` 原内联实现复用为单一入口）、`coverWorldPolygon`（WeakMap 缓存，按 verts 引用 + x/y/angle 失效）、`obbIntersectsCoverPolygon`；判定链 = 车体 AABB vs 多边形 AABB 粗筛 → 四角落入多边形 → 车体边 vs 多边形边（逐边 AABB 预筛）→ 短路段退化时多边形顶点落入车体。**无 `verts` 的旧式矩形路段（`hs-secondary` / `strip-row-trunk`）仍走原 SAT，零回归。**
- 实测：真误判 **8.3% → 0%**（Lead 独立复核 360 个「判在路上」位置，车体与路面几何不相交数 = **0**）。
- **性能反而更好**：生存多行片 10.5 vs 旧 32.5 µs/次；标准 strip 8.7 vs 旧 **284.9** µs/次（旧凸包在 318 顶点链上的 SAT 极贵）。
- **`getRoadUnderTank` 的语义没变**：车体压在路面上时仍不算浸水（桥/路口）、仍屏蔽 river 减速。变的只是「什么算压在路面上」。

#### 11.1.2 ② 河宽硬上限 `RULES.drowning.wadeMaxWidth = 260`

- **口径**：8 秒溺毙倒计时内，**最慢可用车**能以水中速度渡过的宽度。唯一配置源 `RULES.drowning.wadeMaxWidth`（含推导注释），消费方 `js/tank_nodegen.js` 的 `placeStripRivers`/`buildRiver`。
- **推导**：水中速度 = `maxSpeed × speed.pxFactor(1.6) × river.passability(0.4) × speed.effMul(1.3)`；8s 可渡 = 该速度 × 8s。
  - `hummel`（最慢，maxSpeed 40）⇒ 33.3px/s ⇒ **266px**
  - `tiger-I`（120）⇒ 99.8px/s ⇒ 799px
  - 取 **260**（比最慢车能力再留 6px 余量）。
- **实测改前**：min 325 / p50 573 / p90 756 / **max 805** ⇒ `hummel` 穿 446px 河需 **9.8s > 8s ⇒ 必溺毙**（中坦 tiger-I 5.1s 可过）。
- **实测改后**：`thick` 基准由 stripH 的 7%~15% 降到 **4%~9%**，并在 `buildRiver` 出口对每段 `h` 做 `Math.min(wadeMaxWidth, ...)` 兜底 ⇒ p50 237.7 / p90 260.0 / **max 260.0**（保留沿程宽窄变化，只削波峰）。
- **端到端验收**（5 车型 × 8 seed × 4885 河段，真实速度公式 + 逐帧物理判定）：**溺毙 0 次**；最险 `hummel` 穿最宽 260px 河，溺毙计时峰值 **5.7s / 8s，余量 2.3s**。
- **反证护栏有效**：内存版「无钳制」生成器跑同一断言 ⇒ `max=876` ⇒ 断言红。

#### 11.1.3 ③ AI 敢涉水（river 与 water 分档）

- **根因**：`isWaterAt` 原把 **water 与 river 一视同仁**。但两者语义完全不同：river 是 `passability=0.4` 的**可涉水减速带**（§11.1.2 已保证任何车 8s 内可渡），water 才是会泡死的水潭。于是 AI 把可通行水域当禁区：前向探点落在河上就转向，三向全水就 `move=0` 停驶 —— **玩家过河即脱离追击**。
- **现行**：新增 `_waterHazardTier(tier)`——`water` 恒为危险；`river` 以 **`RULES.coverTiers.river.passability > 0`** 判「可涉水 ⇒ 不算危险水体」。**判据不写死 tier 名，将来改 river 语义只改 RULES。**
- **保留不变**：water 的三条既有语义全部保留（前方水潭→转向干地、潭心→`_escapeWater` 朝最近干地脱困、河+潭同场时潭生效）。
- **实测**（真·追击样本 = 纯地面基线本身 `move>0`）：被避水打断直线追击 **100% → 0%**（80~90 样本全数直线涉水穿河）。
- **⚠ 度量陷阱（防复犯）**：用 `aiDecide` 量「AI 敢不敢过河」**必须固定机动随机源**（`_maneuverSetRng(() => 0.5)`）。`_applyManeuver` 按 `Math.random` 抽 `retreat` 模式并输出 `move=-1`，与河流完全无关；不固定会量出 **21.3% 假阳性**。另外样本须筛「基线本身在前进」——AI 在交战带内沿本就会驻停，那不属避水。两条都是我实测踩到的坑。

#### 11.1.4 回归覆盖

- `scripts/test-covers.js`：∩ 形路链凹口（真实路面外 254px、落在整链凸包内）→ `getRoadUnderTank` 必须 `null`（**改前红、改后绿**）；车体压路带/侧臂 → 仍判在路上（零回归）；「路带+河面」→ 道路优先不算浸入（桥语义保留）；河面离路面 254px → 恢复完全浸入判定；河宽 ≤ `wadeMaxWidth`（多 seed + 无钳制反证）。
- `scripts/test-ai.js`：河不触发规避 / 河中继续穿河 / 潭仍绕行 / 潭心脱困 / 河+潭重叠时潭生效（原「河岸偏移→固定右转」那条用的是 river，与新语义直接冲突，已按分档语义替换；water 的三条全部保留）。

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
- **参数收口** `RULES.nodeMap.road`（旧硬编码 60~80 世界px、amp 0.04）：`widthMin/Max = 92/124`（**公路加宽**）、`curveAmp = 0.16`、`branchCurveAmp = 0.10`、`diagChance = 0.45`、`diagAngleMin/Max = 0.18/0.52 rad`。**（curveAmp/branchCurveAmp 已被 §26（#U45，2026-10-19）取代：`curveAmp = 0.075` 且语义改为单弓形弓顶比例、`branchCurveAmp` 死配置删除；现行值以 §26.3 为唯一口径。）**
- **斜向干道**：新增 `DH/DV`——倾斜角 θ∈[diagAngleMin, diagAngleMax] 的横/纵干道（端点沿边界按 `tanθ × 跨度` 错开），由 `TRUNK()` 按 `diagChance` 混入六拓扑；B 十字拓扑固定「横（可斜）× 纵」以保证交点必然存在。端点沿边偏移由 ±0.13 放宽到 ±0.20。
- **公路加速**：`RULES.nodeMap.road.speedBonusKmh = 10`——坦克在 `tier:'road'` 条带上行驶时表速 +10km/h，受 `RULES.parameterLimits.maxSpeed.max`（150km/h，即 375 px/s）上限钳制；加成经 `speedBonusLerp` 指数阻尼平顺生效（进出路面不突跳）。消费方 `js/tank_move.js driveTank`。
  > **沿革注记（2026-10-14 #S4/#S14）**：road 为纯地面标识，2026-09-14 起被 `getCoverUnderTank` 显式跳过（零物理优化），导致 #E3 的公路加速判定 `onRoad` 恒 false、加成**从未生效**（2026-09-20~2026-10-14）。修复：`js/tank_cover.js` 新增 `getRoadUnderTank`（同款 OBB 相交 + 空间索引，仅查 road tier），`driveTank` 改走本函数判定 `onRoad`。**道路屏蔽下层减速**（#S14）：road 存在时 `speedModifier/turnModifier` 强制 1.0——压在 river/mud 上的路段不再吃 0.4 减速（此前 `getCoverUnderTank` 返回下层 river/mud 照常减速）。
- **村镇街道同步加宽**：`placeVillage` 的 `roadW` 亦改读 `RULES.nodeMap.road`（消除两套硬编码）。
- **出界路段裁剪（#S11，2026-10-15）**：strip 级出界路段原整段删除 → 轴对齐段沿地图边界精确矩形裁剪（旋转段仍丢弃）；`bridge-approach` 引道加出界丢弃。20 seed 全量扫描出界道路 0 条。

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

### 14.2 strip 构造（片拼接）—— **部分落地（2026-10-05 C 档 batch 2，`generateStrip`；尚未接入 `makeNode`/实战）**

- **片（chunk）** = 一个现有模板实例 —— **已落地**：`generateStrip` 每片调一次 `generateNode`（`templateId` 按难度发牌或 `templateIds` 指定），**片内 `scale` 沿用现行 `nodeScaleFor` 口径**（调用方经 `opts.scaleFor` 传入；生产传 `tank_map.nodeScaleFor`），元素世界尺寸与当前版本一致。
- **接缝净空（必需）** —— **已落地**：内部片边界 ±300px 带内移除 `structure`/`foliage`（按 `tierGroup`），保留 `ground`/`liquid`；不再有 `bridge` 豁免（桥梁体系已于 2026-10-17 #U7 删除）。
- **路网 strip 一体化（必需，2026-10-05 修订）** —— **已落地**：废弃逐片生成+接缝链式衔接（`weTrunk`/`tan1` 传递退役，`tan1` 参数保留供单节点调用）。`generateStrip` 规划 pass 预算各片 `x0`/`cw` 后，`stripRng` 一次调 `placeRoadNetwork`（虚拟模板 `{w:totalW,h:stripH}`，`{requireWETrunk:true, trunkAmp:0.03}`）；每片按 x 区间裁路网转片内帧，经 `roadOpts.externalRoads/Junctions/RoadW` 传入（片内跳过自生成，仅避让；路面由 strip 统一追加）。宽幅下拓扑曲线振幅致段出界被裁时，后处理在无路面接缝处按最近 road y 补水平直段。旧 `opts.weTrunk` 链式口径保留（单节点模式）。
- **水系 strip 一体化（必需，2026-10-05 新增）** —— **已落地**：`placeStripRivers` 每条 strip 必生成 1–2 条横向蜿蜒河流（正弦 meander，段重叠 30%），贯穿整条 strip；旧 `edgeRiver` 模板标签在 strip 模式下跳过。**路河交叉处直接保留河段**（2026-10-17 #U7 用户裁定删除桥梁体系——原「切出缺口放 `bridge`」路径已整体移除，交叉处车辆按 `river.passability=0.4` 涉水）。建筑避让（#A11）扩展至河流。river 的 `passability=0.4` 为减速通行（§5.2），不阻断连通性。
- **纵向裁剪** —— **已落地**：片高 > 目标高（2.2 屏）时按中心丢弃上下边缘元素；**不做坐标压缩**。
- **密度补偿** —— **已落地**：带外元素钳制回界内（80px 边距 + OBB 重叠检测）而非直接丢弃。实测密度 ≈20/屏（≥ 现状 13/屏）。
- 验收指标（`nodeLayoutMetrics`）：连通性 ≥0.999（实测 0.9996~1.0）；「最窄通道 ≥ 车体宽 38px」操作化为**阻挡掩体按车体半宽膨胀后连通性 ≥0.999**（实测 0.9997~1.0；原始 minGap 口径对装饰性贴靠对极敏感，常规节点基线仅 1~3px，不直接采用）；`coverCoverage` 不随片数下降（待 batch 3 实战接入后复核）。连通性口径 2026-10-05 对齐游戏（阻挡 = `passability===0` 或 `shellBlock`）。

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
- **小地图**：~~等比缩放（`js/tank_minimap.js:15-19`）在 10:2 比例下退化成细线 ⇒ 改「横向条带 + 视口窗口」布局~~ —— **已落地（2026-10-05 C 档 batch 1）**：`minimapLayout` 按世界宽高比自适应，>2.5 进条带模式（横向占满、纵向 ×2.5 拉伸后居中，纵向示意不保真）；常规节点保持等比适配零变化。回归：`scripts/test-minimap.js`（18 断言）。
  - **元素粒度分 tierGroup（2026-10-17 #U5，现行口径）**：**植被**（`tierGroup='foliage'`：tree/bush/fallen/soft 之前的树丛类）不再逐点绘制，改为累加到**小地图像素 4px 网格**（格尺寸由 `layout.sx/sy` 反算世界尺寸，与世界大小解耦），格内有植被即铺半透明绿色块、α 随格内株数微增（`0.40 + n×0.12`，上限 0.85）——密集处自然成片、零散处不着色。**其余**（`liquid` 水/河蓝点、`ground` 泥褐点、`structure` 建筑/岩石浅色方块）仍逐元素绘制：数量少且位置关键，保留可读性。`hp<=0` 的元素一律不参与聚合。
  - **公路（2026-10-18 #U35，现行口径；用户需求「小地图上需要显示公路」）**：`tier==='road'` 的 cover 自 `cde3bc3` 起是**整链连续多边形**——`w/h` 只是整链外接 bbox、`angle` 恒 0、真实形状在 `verts`（**局部坐标**，加 `c.x/c.y` 才是世界系）。旧实现把 road 归入 `tierGroup='ground'` 按 bbox 中心画一个 2.2px 点 ⇒ 一条横贯 17000px 的公路在小地图上**只有一个点**，完全读不出走向。
    - 现行：纯函数 `roadCoverPolygonPoints(layout, cov)` 把每个 vert 平移后**逐点**经 `worldToMinimap` 换算（strip 模式 `sx≠sy`，**绝不能统一 scale**），`drawMinimap` 用 path 填充浅灰 `rgba(150,148,142,0.9)`。
    - **绘制顺序**：公路属底图，必须先于建筑/植被/实体；`vegCells` 聚合循环里 `tier==='road'` 直接 continue（road 已在底图层画完，不参与植被网格、也不再多画一个 ground 点）。
    - **兼容**：无 `verts` 的旧 OBB 段、或 `verts < ROAD_POLY_MIN_VERTS(6)` 的退化链 → 回退原来的单点绘制。
    - 性能实测：真实量级（4 链 × 220 verts + 420 covers）0.21 ms/帧；极端 8 链 × 1200 verts + 1100 covers 0.72 ms/帧 ⇒ 不做抽稀，形状保真优先。
  - **补给点标记（2026-10-18 #U35，生存模式；用户需求「补给点需要显示在小地图上」）**：`opts.supplyStations`（世界坐标 `[{x,y}]`，来自 `currentNode.supplyStations`）经纯函数 `minimapSupplyMarks(layout, stations)` 换算，画 **5px 方块 + 十字（臂总长 10px）+ 细描边**，色 `rgba(190,255,150)`——与玩家绿点（`#7ed957` 圆点 r=3）**异色异形**，170×120 框内一眼可辨。`opts.supplyOnCooldown=true` 变灰（与世界里冷却变灰同语义）。缺省/`null`/非数组 ⇒ 一个都不画（零回归）；坏坐标跳过。
  - 回归：`scripts/test-minimap.js` 共 **49 条断言**（含 #U5 原 6 组 + 公路多边形/退化兼容/绘制顺序/逐点换算 + 补给标记数量/形状/异色/冷却变灰，另含 2 组*空转断言自检*——用内存态变异确认断言会真变红）。

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
- **HUD（#K2 2026-09-29 重写为显式目标卡）**：`#quotaHud` 三行——首行「目标 OBJECTIVE」；次行两个条件状态（`① 推进至出口（还差 Npx）` / `✓ 已抵达出口` ＋ `② 清空防线（配额 k/q，场上 N）` / `✓ 防线已清空`）；末行进度（`推进 % / 出口线 % / 残敌 / 待击杀`）。**沿革**：旧文案 `推进 N% → 出口 M% ｜ 配额 k/q` 信息齐但读不出**条件关系**，用户反馈「一个节点的完成目标和出口没有 UI 提示」（#K2）。
- **#K2 出口可视化（2026-09-29）**：
  - **世界层**（`tank_mvp.html` 绘制循环）：`exitX` 之后的绿色出口带（`exitZone.bandWidth = 220px` 横向渐变）+ 出口竖线 + 沿线 3 枚脉动 `>>` 箭头 + `EXIT 出口` 字样；Boss 节点与结算缓冲期（`battleState.clearing`）不画。
  - **小地图**（`js/tank_minimap.js` `drawMinimap`）：出口区半透明绿带 + 出口线 + `EXIT` 标签——传 `opts.exitZone = { x }`；Boss 节点传 `null` 不画。
  - **参数**：`RULES.nodeMap.exitZone = { xFraction: 0.93, bandWidth: 220, draw: true }`；`draw = false` 时只保留 HUD 文案、不画世界标记。
- **沿革**：旧口径为「`kills ≥ quota`」单条件（P-38），与推进正交（原地刷够配额即通关）。

### 15.11 Boss 循环（#K3，2026-09-29）

- **现行值**：`RULES.nodeMap.bossInterval = 3`（由 5 缩短，用户反馈「节点略长，缩短 boss 循环：5->3」）⇒ `(index+1) % 3 === 0` 的节点为 Boss：**index 2 / 5 / 8 / 11 / 14…**（沿革：interval 5 ⇒ index 4/9/14）。
- 一局初始 5 节点（`runNodeCount: 5`）内含 **1 个 Boss**（index 2）；开放式链（`extendRun`）下每 3 个节点循环一次。
- Boss 节点无配额（`quota = null`）且不生成常规敌军 ⇒ **以 Boss 战替代常规节点的配额 grind**，这是本次缩短循环缓解「节点略长」体感的机制。
- 回归锚点：`scripts/test-map.js` #K3 段（`isBossNodeIndex` 周期 2/5/14、非周期索引、12 节点内恰 4 个 Boss、`extendRun` 后周期延续）。

## 16. 敌人难度成长曲线调优（2026-10-01 用户裁定，现行口径）

- **用户裁定**：**略微提高敌人升级速度**——敌人强度随节点推进上升更快（本次三条数值调整之一，其余两条见 `specs/combat.md` §13.4）。
- **现行值**：`RULES.difficulty.curvePow` **1.0**（沿革 1.25 → 1.20 → **1.0**，2026-10-15 #6 用户反馈「敌方成长太慢」再调）。曲线口径不变：
  `diff = min(curveCap 0.95, curveStart 0.15 + curveSpan 0.8 · min(1, index/diffSatIndex 12)^curvePow)`，再叠加跨局等级 `difficultyLevel × crossRunLevelBonus 0.04`（钳 `diffMax 1.15`）。
- **方向性（易踩坑）**：`curvePow` **越接近 1 中段难度越高**（= 敌人升级越快）；**取 1.0 即完全线性，中段难度为各档最高**；**端点与封顶不变**（index 0 恒 0.15、index ≥ 12 恒 0.95），故本次为「中段上移」，不改变难度上限；跨局叠加 `difficultyLevel` 未改动。
- **实测（2026-10-15 复算，curvePow 1.0）**：index 3：**0.35**；index 6：**0.55**；index 8：**0.68**（index 0/12 两端不变：0.15 / 0.95）。
- **配套**：随难度增长的敌人数值现行值（血量/穿深/伤害/极速上限）归口 `specs/combat.md` §13.4；Boss 血量归口 `specs/boss.md` §5。
- **回归锚点**：`scripts/test-map.js` 难度段「升级速度基线」断言随本键同步重锚（`curvePow === 1.0`、`difficultyForIndex(3) === 0.35`、`difficultyForIndex(6) === 0.55`），原端点/单调/封顶/越界断言不变。

## 17. #1 地图生成重做（2026-10-16 用户设计要求，现行口径）

> 用户原话："小范围反复试错、不重叠、1px=1 element、连续可变宽河流、道路边缘无缝衔接"。
> 本节为自然语言设计要求，不涉及代码实现细节。实现归口 `js/tank_nodegen.js` / `js/tank_map.js`。

### 17.1 总体原则
- **小范围反复试错**：地图生成采用"生成→检测→修正"的循环，而非一次成型。元素放置后检查重叠、连通性等约束，不满足则调整位置或移除，保证输出质量。
- **不重叠**：不同元素之间不应有显著重叠。显著重叠的定义是：一方超过三分之一的采样点落入另一方。道路（地面层）除外——道路是地面，元素可以压在路上。
- **1px=1 element**：每个像素只属于一个元素，不允许多个元素在同一位置堆叠造成视觉或逻辑混乱。

### 17.2 道路
- **连续多边形**：整条道路是一条连续的多边形，不再是分段拼接。视觉上没有断裂感，边缘平滑。
- **边缘无缝衔接**：道路与道路的交叉口、道路与地形的交界处，边缘要自然过渡，不能有锯齿或缝隙。
- **交叉优先级**：多条道路交叉时，有明确的优先级，决定哪条在上、哪条在下，保证视觉层次清晰。
- **沿路建筑**：建筑应沿道路两侧放置，与道路保持合理距离，形成街区感。
- **路口沙包**：交叉路口处应有沙包路障，作为战术掩体。
- **`verts` 坐标系口径（2026-10-16 #T3 起为现行值，**必须遵守**）**：掩体的 `verts`/`collisionVerts` 一律为**相对 `c.x`/`c.y` 的局部坐标**，世界坐标 = `c.x + v`（`angle` 为 0 时；非 0 时需按 `c.angle` 旋转）。这与 `js/tank_cover.js` 的 `coverCorners` 契约一致，也是模板内联 verts（`NODE_TEMPLATES` 的 `rock`/`mud` 等）与全部几何消费端（`pointInCover`、`coverCorners`、`buildCoverIndex`、`tank_ai` 避水探针）的统一前提。
  - 沿革注记：`_emitRoadChain`（`cde3bc3` 引入）曾产出**调用方帧的绝对坐标**，仅当 `placeRoadNetwork` 的 `centerX/centerY` 恰为 0 时才偶然正确——方形/Boss 路径 `centerX=0` 蒙对，strip 路径 `centerX=totalW/2` 则整体偏移半个地图宽，致 strip 节点道路的命中判定、空间索引与公路查询全部错位（实测幻影命中 153 / 漏检 610，6000 采样点）。**已被 #T3 取代**——`_emitRoadChain` 出口统一减去 bbox 中心；渲染层 `bakeNodeGroundLayer` 相应改为先做「局部 → 世界」换算。

### 17.3 河流
- **连续可变宽**：河流是一条连续的多边形，宽度沿流程平滑变化（宽窄相间），不是等宽的。
- **与道路的关系**：河流与道路交叉时，交叉角度应接近 75°，保证视觉自然。
- **泥潭互斥**：泥潭不能压在道路上，两者完全互斥。泥潭避路判定（`placeMudPatch` 的 `hitsRoad`）依赖道路 `verts` 的局部坐标口径（见 §17.2）；每次尝试 24 轮（角度铺满 2π、半径外扩 0.55~1.45×ringR）以保住「地形标签必产出」契约。

### 17.4 建筑
- **人字坡屋顶**：建筑要有屋顶，优先人字坡样式，多种屋顶样式可切换。
- **密度**：建筑密度是一个可调参数。提高密度时，沿路建筑数量应明显增加（用户明确要求"建筑密度乘子必须有效果"）。
- **Boss 战地图**：Boss 战地图的建筑密度应更高（1.6 倍），营造决战氛围。

### 17.5 地形与 Biome
- **多 Biome 同图**：一张地图可以包含多种地形（草地/城镇/沙漠/雪地），不同区域用不同配色和植被。
- **交界渐变**：Biome 交界处应有渐变过渡带（约 520px），不能生硬切换。
- **河流渲染宽度（2026-10-17 #U24，现行口径）**：`drawRiverChain` 的线宽 = `medianSegWidth` 取各段 **`h`（短轴）** 的中位数——strip 河段 `w=沿程长度`、`h=河宽`、`angle=沿程方向`，绘制横向恒为 h（与物理 OBB 同源）。**禁止**改回 `min(w,h)`：短段 w≈101 < h 时逐段粗细在 101~205px 抖动，河面与减速带对不上。
- **地面材质纹理（2026-10-17 #U11，现行口径）**：底色与低频色斑之上再叠一层**世界锚定**的程序化纹理，按 biome 分套——草地/草原→短划草丛、雪地→细碎雪粒、沙漠→沙纹弧线、泥地→深色湿斑、城镇→横向铺装线。实现 `js/tank_battledraw.js drawGroundTexture`（`drawGround` 末尾调用），全部由「世界格坐标 + seed」的 hash 派生（与色斑独立的 hash 通道），**随相机移动不动**；`opts.biomeZones` 存在时按区段分别取纹理（与底色填充同口径）。纹理色与底色需拉开 ≥12 个灰阶，否则在 `globalAlpha` 叠加后不可见。
- **雪地配色（2026-10-17 #U12）**：`RULES.biomes.snow.base` 由 `#dfe6ea` 压暗至 `#c2ccd4`，base↔alt 跨度 10.6%→22%（原近纯白刺眼、纹理被淹没）。
- **泥潭**：泥潭是减速地形，与道路互斥。泥潭数量随地图面积缩放。
  - **数量与分布（2026-10-17 #U2）**：数量按**面积平方根**缩放并钳上限 `MUD_MAX=32`；块数 >12 时改**全节点网格铺位**（原环带布点在小半径内扎堆）。实测单节点 272 → 44 块，平均最近邻距 227 → 561px。
  - **泥潭与水体互斥（2026-10-17 #U16）**：strip 级河流在片（含泥潭）生成**之后**才追加，`placeMudPatch` 运行时看不到河流。现行在河流追加后做确定性收尾：移除与任一 `river`/`water` 段 OBB（SAT）相交的 `mud`（实测 26.8% → 1.4%）；`prune` 对 `ground↔liquid` 组合改用更严阈值（浅交叠亦触发）。`river` 之间的叠加属同组 25% 段间搭接（有意设计），非重叠缺陷。
  - **泥潭与道路互斥（2026-10-17 #U26）**：`placeMudPatch.hitsRoad` 用**足印采样**（泥潭中心 + 8 向 0.55×半幅点 + 路多边形顶点反查泥潭椭圆），不是只判中心点；strip 模式下 `placeMudPatch` 收到 `avoidCovers`（externalRoads+externalRivers，**不是** outCovers——此刻路还没进 covers）；strip 级路在 chunk 循环后追加，故尾部还有一次 **mud↔road SAT 收尾**（压路泥潭直接移除，与 mud↔water 收尾同款）。实测 4 seed 泥↔路多边形相交 21% → **0%**。

### 17.6 地图尺寸与缩放
- **面积自适应**：地图元素数量应随地图面积缩放，保证不同尺寸的地图密度一致。大地图元素多，小地图元素少，但单位面积密度相同。
- **Strip 模式**：常规节点为横向条带，约 10 屏宽 × 2.2 屏高。条带由多片拼接而成，片与片之间接缝处 300px 内不应有建筑/植被（净空），但道路必须贯通。
- **Boss 节点**：方形竞技场，3.0–3.2 屏见方（测试硬要求）。不能太大（失去竞技场感），不能太小（施展不开）。
  - **模板长宽比的可行区间随视口推导，不写死常数（2026-10-16 #T5 起为现行值）**：`nodeScaleFor` 取 `base·max(vw/tw, vh/th)`，故 `w/vw = base·max(1, r/A)`、`h/vh = base·max(1, A/r)`（`A` = 视口长宽比、`r` = 模板长宽比、`base` = `RULES.nodeMap.nodeScale`）。要求两轴均 ≤ `MAX_SCREENS`(3.2) ⇒ **`r ∈ [A·base/3.2, A·3.2/base]`**。越界时确定性改选长宽比最接近视口者（不耗 RNG）。
  - 沿革注记：`f40454d` 曾把该区间硬编码为 `[1.667, 1.896]`——那是 `A=16/9`、`base=3` 时的特例，其他比例下判据失效（3:2 由 7 个超标恶化到 10 个，1:1 最差由 5.00 屏恶化到 5.25 屏）；且回退模板 `mixed_barrier_plaza`（800/480 = 1.6667）本身低于其设的下界 1.667，阈值自相矛盾。**已被 #T5 取代**。
  - **已知结构性限制**：内置模板长宽比全在 1.60~1.75，故仅当 `A ∈ [1.5, 1.87]` 时区间才存在可行解。极端视口比例（如 1:1、21:9）下**无**单一缩放能令两轴同时落进 3.0–3.2，此时取最接近者（实测 4:3 最差 3.60、21:9 最差 4.06、1:1 最差 4.80）。若日后要求全比例达标，需按视口动态生成非等比竞技场或扩充模板长宽比谱系——属设计变更，非缺陷修复。

### 17.7 出生点
- **位置**：玩家出生点在地图左 1/4 区域内，默认在 (0.10w, h/2)。
- **净空保证**：地图生成必须保证出生点周围有空地，不能被掩体堵死。如果生成后发现被堵，应清除阻挡物，而非将出生点挪到右邊。
- **设计意图**：玩家从左向右推进，出生点在左是核心玩法假设，不可动摇。
- **「阻挡」的口径（2026-10-16 #T4 起为现行值）**：出生点净空与选址**只避让阻挡通行的元素**，判据与坦克碰撞一致（`passability === 0 || shellBlock`，见 `js/tank_cover.js` `resolveCoverCollisions`）。可通行地形（`mud`/`river`/`water`/`bush`/`soft`/`stump`/`rubble`/`bridge`/`road`）**允许**出生点落在其上——坦克可以压着泥潭/浅水/灌木开局，这不构成「被堵死」。
  - 沿革注记：2026-10-16（`e030aa1`）曾用 `c.w/c.h` 的 AABB 包络且不按 tier 过滤做清场，结果把 `mud`/`river`/`bush` 一并删除（10 seed 删 14 个全属此类），并在连续河道上凿出空洞；同时选址走 `pointInCover` 避让**一切**掩体，与清场互相掩盖。**已被 #T4 取代**——清场与选址统一按上表口径，只处理阻挡物。

### 17.8 性能要求
- 地图生成应在合理时间内完成。元素数量增加时，算法复杂度不应爆炸（如 O(n²) 在元素 ×20 时会慢 400 倍，不可接受）。
- 优化不得改变生成结果（同样种子必须生成同样的地图），这是确定性的底线。
- **重叠消解不得把元素推出节点边界**（2026-10-16 #T4b 起为现行值）：`pruneOverlappingCovers` 的 nudge 平移仅在「败者原本在界内」时约束候选点落在节点界内；原本就出界的元素（如 `placeEdgeRiver` 的 river 以节点边线为中心，天然半幅越界）不受此约束，以免 nudge 全部失败导致元素被整株移除、破坏「地形标签必产出」契约。




## 18. 贴图资产出图管线（2026-10-17 重构，现行口径）

> 关联：§4「贴图资产与烘焙层」（运行时回退与烘焙契约）、`assets/README.md`（目录与文件名约定）、`tools/cover-gen-prompts.md` v2（提示词与操作手册）。

- **三组数字不能混用（本节的唯一要点）**：
  1. `ASSET_DEFS.w/h/anchorX/anchorY` —— 烘焙函数的**输入**尺寸与「内容包围盒内锚点」；
  2. `tools/cover-refs.json` 的 `canvas` / `anchor` —— **图片通道基准**：`canvas` = 烘焙后内容包围盒尺寸，`anchor` = 画布内像素；
  3. `refs.centroid` —— 内容质心，**唯一验收基准**。
  图片通道 `drawAssetSprite` 直接 `drawImage(img, x-ax*sx, …)`（图片像素 = 世界像素），所以落盘 PNG 必须与 `refs.canvas` 同尺寸，内容质心必须落在 `refs.centroid` ±2px。手抄 `ASSET_DEFS.w/h` 当落盘尺寸会整体缩放错位（tree 实际 30×30、tree_canopy 58×58）。
- **基准单一来源**：`node tools/dump-cover-refs.mjs` 从烘焙代码导出 `tools/cover-refs.json`；`--check` 供 CI 校验是否漂移。禁止手改该 JSON。
- **出图**：`node tools/gen-covers.mjs --provider <gemini|replicate|openai|mock>`。Prompt 运行时从 `tools/cover-gen-prompts.md` 现解析（不复制正文）；出图分辨率按 `refs.canvas` 宽高比、最长边 1024；凭据只从进程环境或仓库根 `.env` 读取并按 `abcd...wxyz` 掩码输出。`mock` 走仓库自己的烘焙产物，不出网。
- **后处理**：`python scripts/prepare_covers.py --inplace [--src tmp/covers-src] [--out assets]` —— 清底 → 按内容包围盒裁留白 → 等比缩进 `refs.canvas` → 居中 → PNG-8（16 色）。**不做拉伸变形**。
- **验收**：`python scripts/covers-anchor-check.py [--src assets]` —— 尺寸 + 内容质心；取代「人眼看 `tools/bake.html` 红十字」（红十字量的是烘焙包围盒内锚点，对图片通道无意义）。
- **回退**：`assets/` 为空即走 `js/tank_assets.js` 的程序化烘焙，视觉不断档；删除任一 `<key>.png` 即对该档回退。

## 19. 布点/修剪避路收紧（2026-10-17 #U32，现行口径）

> 关联：§10.2 跨相重叠消解（pruneOverlappingCovers）、§13 路网 v4（道路连续多边形）、`js/tank_nodegen.js`。

- **问题**：cde3bc3 起道路 cover 为整链连续多边形（OBB = 整链大 bbox，实测 verts 多边形面积仅 OBB 的 ~6%），但模板物品避路（#A11 推挤）与 prune `tryNudge` 仍按 OBB 判定，且 `need ≤ 0 → pushed = true` 短路放行、`best` 选「全局最近路心」而非「实际相交的路」、nudge 落点不查 road——四因叠加，实测 60 seed ×3 scale 有 **163 处建筑/岩石/树/栅栏压在路面上**（用户反馈「房屋落在道路上」）。
- **现行判定口径（三处统一为 verts 精确多边形相交）**：
  1. **模板物品避路**（`generateNode` 主循环）：触发判定 = 物品 OBB 四角/路采样点互入/边相交三重精判（`_itemHitsRoad`，无 verts 的 road 回退 OBB pad 6）；`best` = 精判相交的路中最近一条；`need ≤ 0` 不再放行，仍走 `tryPos` verts 复验；8 向搜索距离 280→480。
  2. **prune `tryNudge` 落点避路**（`_hitsRoadPoly`）：verts 精判（采样点互入 + 边相交，`_getCached` AABB 预检），候选环 6→12。此前 60 seed ×3 scale 有 100 处：推挤/布点阶段合法的元素被 prune 挪上路面（`o.tier === 'road'` 被无条件跳过）。
  3. **mud↔road 严判**（#U26 已有）不变。
- **效果**：压路 163 → **0**；strip 密度 seed42 10.91→11.01/屏（verts 精判下不降反升——虚警剔除消失）；连通性 7 模板 ×5 难度维持 1.000。
- **基线**：校准第十一次重标定（见 `scripts/test-nodegen-calibration.js` 头注）；test-nodegen 泥斑环带断言中心修正为世界帧 (600,350)（原 W/2,H/2 是 0 原点帧假设）、村庄建筑上限 20→24。

## 20. strip 河流互斥与避路收尾（2026-10-17 #U33，现行口径）

> 关联：§10.1 路网 v4、§17 #1 地图生成重做（strip 一体化河流 `placeStripRivers`）、`js/tank_nodegen.js`。

- **问题**：H2 双横贯 / V 多纵贯的河在蜿蜒失配时相互穿越交织（实测 40 seed **471 段对**相交），河与路平行压叠亦存在。用户口径「河流不应该交叉、干涉」。
- **现行口径**：
  1. **河↔河互斥**（`_riverPairClash`）：两河短段 OBB SAT 相交即非法（AABB 拒收必须用旋转包络半宽——段 w 沿段向，纵河段 w 即纵向，直用 w 判 dx 会漏检）。H2：重试换 Y 后仍交叉 → 弃南河保主河；V：逐条与已有河互斥，重试换 baseX 后仍交叉 → 弃后河；**relaxAmp/平移收尾后再查一次**（拉直/平移可能把河推到别的河上）。~~H1T 支流汇入干流（Y 形水体合并）为唯一设计内例外~~ —— **已被 §21 取代（2026-10-18 #U34 删除支流汇入设计，河流互斥现无任何例外）**。
  2. **河↔路平行避让**（`relaxAmp` + `_riverRoadClearance`）：压河比 >3% → 振幅 ×0.6 重建拉直（两轮，保留最低限度自然蜿蜒）；拉直后仍压路 → 整河平移远离最近平行路（间隙 24px，钳 strip 界内；**平移判定必须用 `roadCoversToSegments` 还原短段**——整链 verts 路 OBB 大 bbox 会使平移量/方向完全失真，#U32 同源教训）。`pickClearY` 的 halfWin 含振幅余量 `amp*0.5`，但安全余量收紧 80→20 防止「全带 d≥1 → pickClearY 退化为贴路选择」。
  3. **物理极限**：stripH 有限，双横干道 + 双横河四带挤不下时以「弃河」收场（河可缺失，交叉不可接受）。
- **效果**：河间非法交叉 471 → **0**（残留 3 处经逐例核实均为 H1T 设计汇入；**该例外已于 2026-10-18 随支流设计一并删除，见 §21**）；河↔路平行压叠（精确口径）6 → 8 处/40 seed（量级持平，均为河缘贴路缘的虚警边缘）。
- **验证注意**：河↔路重叠的量化脚本若用「路 verts 首边角 vs 河段 angle + 路顶点入河段 OBB」口径会严重虚警（河段斜 OBB 25% 搭接肥胖 + 首边角不代表整链方向，虚报 653 段）——精确口径须用路 verts 世界多边形顶点入河段 OBB 判定。

## 21. 河道形态：删除支流汇入 + 沿程宽度变化（2026-10-18 #U34，现行口径）

> 关联：§20 河流互斥、`js/tank_nodegen.js placeStripRivers/buildRiver`、`js/tank_battledraw.js drawRiverChain`。

- **① 支流汇入设计整体删除**（用户裁定「删除支流汇入干流的设计」）：原 H1T 形态（横贯干流 + 短支流 Y 形汇入，含 #S1 的「支流末端伸入干流过中心线 thick×0.25」缝合）全部移除。H1 现为**单条蜿蜒主河**（振幅 0.05~0.08×stripH，略大于原干流）。理由：支流与干流的 Y 形合并本身即 #U33「河流不应该交叉、干涉」所禁止的交叉，两者口径冲突，以用户裁定为准。随支流一并移除的还有其源头收分 taperFn 与「有湖」死分支（`hasLake` 自 2026-10-05 起已是 `false` 常量）。
- **② 沿程宽度变化**（用户「优化河道随机平滑的宽度变化计算，现在看起来宽度几乎不变」）：两处都有原因，同时修：
  - **数据层 `buildRiver`**：原河宽 `h = w × taperFn(t)`，而 strip 干流/纵河均不传 taperFn ⇒ 全链等宽。现每段乘一组平滑双正弦波（低频主波振幅 22~34%、频率 1.2~2.4 周；高频微扰 6~12%、3.0~5.5 周），钳制 **0.6~1.35×**。相位/频率/振幅在同一次 `buildRiver` 调用内固定（幂等派生），段间连续无跳变；`taperFn` 保留与波相乘（调用方如需额外收分仍可用）。实测 40 seed 各河宽度极差 1.8~2.4 倍（变异系数 ≈0.2）。
  - **渲染层 `drawRiverChain`**：原实现取**段宽中位数**做单一线宽的整链描边——即使数据层有宽度波也会被抹平。现改为**可变宽多边形**：沿中心线逐段取半宽（段自身 `h/2`，即 #U24 确立的「横向 = 短轴 h」口径），3 点平滑两轮后生成左右边线并闭合填充；岸影为同一多边形外扩 `bankW=6px`。实测渲染采样宽度 250~480px 沿程变化。
- **连通性口径**：宽度波峰值会使 `test-strip` 的连通性断言在 **step=60** 粗网格下出现 4 连通切角伪影（seed99 实测 step60 0.9987 / step20 0.9999）——与 #T1 已确立的同一类采样网格伪影。该断言步长已对齐为 **step=20**（38px 通道断言本就如此）。
- **效果**：河间交叉 0（无任何例外，H1T 汇入已删除）；每张 strip 河流数 ≤4（此前 H1T 恒多一条支流）；宽度沿程变化率 cv≈0.2；`npm test` 45/45。

## 22. 贴图与阴影质量（2026-10-18 #TEX6~#TEX9 / #TEX11，现行口径）

> 关联：§4（贴图资产与烘焙层）、§18（出图管线）、`docs/specs/combat.md` §6（特效分层）、`js/tank_paint.js` / `js/tank_assets.js` / `js/tank_battledraw.js`。

### 22.1 坦克纹理（`TEXTURE_DEFS`，14 键）

- 两个质感工具（`js/tank_paint.js`）：`_texGrain`（表面颗粒：0.5~1.5px 明暗碎点，抵消「大块纯色 = 塑料感」）与 `_texPatch`（**硬边多边形**迷彩色块）。位置全部由**固定种子哈希** `_texRand(seed, i)` 派生，不用 `Math.random` ⇒ 同纹理每次烘焙像素一致，离屏缓存可安全复用。
- **硬边替代椭圆**：真实迷彩是喷涂模板的硬边色块，旧实现全部用 `ellipse` 填充，放大看像水彩晕染。现 `camo` / `camo_dunkelgelb` / `camo_nato` / `camo_desert` / `camo_winter` 的色块一律走 `_texPatch`（顶点半径带哈希抖动，7 边形为主）。
- **单色涂装补齐层次**：`paint_panzergrau` / `paint_soviet` / `paint_olive` 由「2 个大椭圆」升级为 暗部 + 受光部 + 颗粒 + 掉漆露底/泥渍（苏军绿泥渍集中在下缘，符合俯视光照习惯）。
- **图案坐标系锚在整车上（#TEX11，2026-10-18）**：`TEXTURE_DEFS.draw(ctx, bbox)` 拿到的 `bbox` 不再是「本部件自己的包围盒」，而是 `paintPatternBox()` 派生的**整车图案框**——车体用 hull bbox，炮塔用车体 bbox 平移到炮塔局部系（减 `turretPivotOffset`）。因此同一条 `fx=0.30` 规则在车体/炮塔上得到**相同绝对像素尺寸**的色块，炮塔转正时迷彩跨座圈连续。网格类贴图（`armor_plate` / `weld_seam`）额外用 `bbox.originX/originY`（车体原点在本部件系的坐标）对齐板缝，否则 14px 网格会在炮塔上错开 `pivot mod 14`。该框按 `weatherSeed` 做 ±8px/±5px 平移 ⇒ 同型多车不再共用同一套迷彩；`texBox` 已纳入 sprite 缓存键。
- **喷涂边缘与分叉块**：`_texPatch` 由「单个硬边七边形」升级为 主块 + 1 个错位 lobe（块 >7×5px 时）+ 同色 alpha×0.30 的 1px overspray 描边 + 边缘散点；顶点抖动 0.66~1.20。1:1 下这层过渡决定「像涂装」还是「像 UI 色块」。
- **边缘磨损（`paintEdgeWear`）**：沿部件多边形边界内侧 1.0~3.0px 布掉漆点（亮金属/深褐锈底两种，深色用于浅色涂装提供对比）+ 1px 缺口阴影 + 等级 ≥2 的锈水下渗；dmg0 不画。**位置由「边索引 + 沿边 t」派生**，天然贴合轮廓——旧 weathering 的面内随机点放大看是「彩色碎屑」。
- **机械件亮度收敛**：铆钉高光 +26%→+14%、车长塔周视镜 +34%→+22%、散热器叶片 +24%→+15%、瞄具边框 +20%→+12% 等。1:1 下过亮的 1px 结构会连成「LED 点阵/电路板」，反而抢走涂装的视觉层级。
- **履带重做**：旧「防滑齿 +10% + 导向齿圆点」在 1:1 下是一条等距亮灰点阵（10 倍图里就是履带中央的 LED 虚线）。现行 = 深色基体（−62%）+ 上缘 0.8px 受光 + 下缘蔽光 + 每节暗缝（−44%）+ 短横向花纹（−14%）+ 压暗导向齿（−52%）。
- **3× 超采样烘焙（#TEX12，2026-10-18）**：`getCachedTankSprite` 以 `SPRITE_SCALE=3` 渲染（约 246×138），`paintPartTexture` 绘制时 `scale(1/3)` + 双线性降采样回 1×。根因：旧实现按 1:1 烘焙 73×38 再被相机 zoom 0.8~1.3 缩放 = 放大一张 1× 位图，迷彩边缘/铆钉全是硬像素。`spriteView1x(entry)` 提供「玩家实际看到的 1:1 图」，供审计与测试使用（运行时直接 drawImage 3× 位图，不走该函数）。
- **材质光照层（`paintMaterialPass`，烘焙期一次完成）**：① 内侧 AO：多边形向质心收 3 圈描边，形成 3~4px 软暗边；② 渐变倒角：左上暖白→右下暗（clip 内只露内侧一半）+ 偏移 0.7px 的受光亮边/0.8px 背光暗边；③ 受光面高光池（左上大而淡的径向亮斑）；④ 沿 +x 的拉丝（26 条极淡明暗线）；⑤ 亚像素细颗粒（面积自适应 ~0.08/px）；⑥ 下缘积尘暖色渐变（车体 0.10 / 炮塔 0.05）。车体底色同时由 −18% 抬到 −12%。
- **细节立体化**：车长塔/驾驶员舱盖/装填手舱盖/瞄具加右下软投影（凸起件与光源同向）；炮管由「平色线 + 一条高光」改为 4 条平行带（深底→中间调→受光高光→背光暗边），偏移方向取世界光在炮管法线上的投影；车体/炮塔暗色勾线外再加一条**暖色轮廓光**（左上受光边 1.1px 渐变，`drawTankRimLight`）。
- **量化效果**：现行口径见 §23.7（v2 评分 + v3 跨部件检查）。早期 140×50 探针的「颜色数/局部对比度」数字已随 #TEX11 的 overspray、图案框与细节亮度调整失效，不再作为口径。
- **数码迷彩**：现行 **10×10 网格**（单元约 4.6px，是能活过 0.8 缩放的最小簇）+ 三色明度差 −24/+22/−12 + **簇生长**（每簇 2~5 个相邻格，优先横向延伸）。旧的 18×18 方案单元仅 2.56px，实机读成一片纯色，已废弃（见 §23.5）。

### 22.2 贴图缓存键与 LRU（**两个必修缺陷**）

- **键必须覆盖所有影响像素的入参**：`getCachedTankSprite(color, kind, verts, hasTurret, heightClass, texture, extra)` 的键含 `damageLevel` / `weatherSeed` / `appearance` 签名（`_appearanceKey`：cupola 支持对象与数组、engineDeck 对象，按 `style,dx,dy,mirror` 定序拼接；#TEX11 起还含 `texBox` 量化值）。旧键缺这三项导致：① `renderHullTexture` 每帧算出的损伤分级永远不生效（weathering 是死代码）；② `tanks/*.json` 的 cupola/engineDeck 样式被静默忽略。
- **炮塔也吃 weathering**：`paintWeathering` 原被 `if(isHull)` 包住，炮塔永远「出厂漆」；`renderTurretTexture` 也没传 `damageLevel`。现炮塔按与车体**相同**的 hp 比推导损伤分级，`weatherSeed` 取 `车体 seed + 17`（磨损相位错开），画在车长塔/瞄具**之前**（磨损是底漆层，机械件覆盖其上）。
- **缓存有界 + 真 LRU**：`PAINT_CACHE` 上限 **512**，命中 move-to-tail（Map 迭代序 = 插入序）。#TEX12 起每张 sprite 以 3× 烘焙 ⇒ 单条内存约 9×；典型 <100 条 ≈ 20MB，512 条最坏 ≈ 70MB（LRU 保证长局不单调增长）。`ASSET_CACHE` 同改为真 LRU（原为 FIFO：删最早插入者、命中不刷新，视口常用键照样被踢）。
- **烘焙探针自适应缩小**：`bakeAssetCanvas` 的探针从「`PAD = 2×max(w,h)+16` 固定」改为「`1.2×max+8` 起步，**触边即加倍重试**，上限 `4×max+64`」。正确性由触边重试保证（不会静默裁切）；10 个资产层实测探针像素量降 **59%**（1,216,006 → 497,422），单次烘焙峰值内存随之下降。

### 22.3 阴影：**光源必须世界固定**

- **统一光源**：左上方 → 影子落右下（+x,+y）。地图元素（`drawCoverShadow`）、坦克车底（`drawTankGroundShadow`）、炮塔（`paintTurretShadow`）三处同向。
- **修复「旋转两次」**（`paintTurretShadow`）：炮塔影的偏移 `(ox,oy)` 必须当作**世界向量**，而多边形画在 `R(angle)` 的局部系内，故局部平移取 `R(−angle)·(ox,oy)`。旧实现按 `worldAng` 旋转偏移、又在已旋转的局部系里平移，净效果 `R(angle)·R(worldAng)·off`——实测 `hull=0`、炮塔 0→90° 时影方位从 54° 摆到 144°，同屏两个光源。修复后 0° vs 90° 质心漂移 **0.54px**（原 ~4.4px）。`worldAng` 形参保留仅为兼容既有调用点。
- **修复车底影缺失**：程序化分支（实机唯一路径，所有车 `sprite.enabled=false`）此前**完全没有车底影**，履带直接压在地面纹理上、车体像贴纸。现按车体 OBB 画两层椭圆；**形状随车体转、偏移不随车体转**（先在世界坐标平移偏移量，再 `rotate(hullAngle)` 画轮廓）。修复后 0° vs 90° 质心漂移 **0.04px**。
- **三层软边（零模糊开销）**：建筑/岩石/残骸 = 远/中/近三层偏移剪影 + 墙脚接触暗带描边（消除两块偏移多边形之间的亮缝）；树 = 三层同心椭圆 + 树干脆影；灌木/倒树 = 外扩柔和影 + 主影 + 根部接触暗斑；soft/barricade/stump = 淡外影 + 接触影。**禁用 `shadowBlur`**（逐帧模糊成本不可接受）。
- **不投影的档位保持不变**（早退）：`road` / `mud` / `water` / `water-chain` / `bridge-deck`——`scripts/test-nodegen.js` 对此有强制断言。

### 22.4 植被烘焙（`js/tank_assets.js`）

- **灌木 `bakeCanopy`**：#TEX14（2026-10-18）先补方向光与体积渐变；**#TEX15（2026-10-19）重做轮廓**——用户反馈「椭圆拼贴的树冠太难绷」，5 大叶团 + 9 小叶团拼贴整体废弃，改为**单条波浪轮廓（`blobPath`，36 段，双频正弦 + hash 抖动，包络 ≤ 0.44）**；内部 5 枚 + 边缘 7 枚不规则小叶团按相对全局光源（左上）方向连续取色；叶点散斑按受光/背光取亮/暗两档；clip 波浪轮廓的球面体积渐变 + 左上受光叶团两枚 + 右下背光团。
- **树 `bakeCanopy`**：#TEX15 重做——「底层整圆 + 11 枚椭圆叶团环」改为**单条波浪树冠轮廓（40 段，包络 ≤ R*0.85 不变）**；体积渐变与自阴影 clip 在波浪轮廓内；内侧 7 枚不规则叶团按光源方向连续取色；受光侧亮叶团两枚、枝叶纹 24 道按方向取明暗、包络描边走波浪轮廓；树干（`tree.bake`）同步改**不规则折线轮廓**（不再正圆）+ 圆柱受光渐变 + 左上受光月牙 + 7 道受光树皮短纹。
- **倒树 `fallen.bake`（#TEX15）**：两段平涂椭圆的「哑铃」废弃——改**单条连续波浪原木轮廓**（上缘受光、下缘背光渐变 + 逐段 hash 抖动，锥度根部粗梢部细）+ 接触影椭圆 + 上缘受光细线 + 9 道**短竖向树皮刻痕**（整弧在原木上读成「一串圆环」，已废弃）+ 枝杈受光/背光两档 + 波浪圆伐倒断面（受光渐变 + 年轮）。
- **倒树树冠 `fallen.bakeCanopy`（#TEX15）**：波浪叶团轮廓；锚点收窄贴回树干端部（cx = x + w*0.24，旧版 x + w*0.32 悬在树梢外；rw/rh 改由干径 h 派生，旧版按 w 派生在 242px 原木上膨成 130px 方块冠）；体积渐变 + 受光叶团 + 右下暗缘。
- **雪地树冠**（`tank_battledraw.js` `drawFoliage` snowy 分支）：整椭圆 → `blobPath` 波浪轮廓 + 波浪积雪高光团（与程序化树冠同语言）。
- **`blobPath` 工具**（`js/tank_assets.js` 导出）：不规则轮廓的唯一画法——beginPath + N 段折线闭合，radiusFn(i, t) 提供 0..1 相对半径，确定性无随机；`scripts/lib/mini-canvas.js` 的 lineTo 路径即支持，浏览器/离线生图一致。
- **俯视栅栏/沙包（#TEX17，2026-10-19，现行口径）**：用户裁定「俯视图就是薄墙/沙袋堆的顶面」——
  - **栅栏 `soft.bake`**：整个 OBB 即墙顶面（删 #TEX16 的立柱/斜撑立面元素）；沿长轴木板拼缝（hash 相位）+ 长轴两段明暗 + 受光/背光长缘 + 木纹短划 + path 外缘描边；支持竖放（h>w 时拼缝沿 y）。
  - **沙包 `barricade.bake`**：两排错缝圆角袋顶 + 堆底背光暗带（删整排椭圆接触影，交给投影层）；每袋左上受光/右下背光弧 + 布纹短缝。
  - **投影 `drawCoverShadow`**（`js/tank_battledraw.js`）：soft/barricade 从「脚下小椭圆」改为与建筑（box）**同源的三层偏移轮廓投影**（off = min(26, 6+max(w,h)*0.08)，方向右下 +x/+y，alpha 0.10/0.13/0.18 比建筑淡）；stump 保留脚下接触影。方向/长度自此与全套元素一致。
  - **`roundedRectPath`**（`js/tank_assets.js` 导出）：圆角矩形路径（4 段 arc + 直线，mini-canvas 兼容）；**外缘一律 path stroke，不用 `strokeRect`**（mock ctx/mini-canvas 无此 API）。
  - **回归**：`test-assets` 全绿（mock ctx 补 `rect`/`strokeRect` no-op）+ 定向 mini-canvas 像素探针 9 条（本体色差/受光>背光/投影右下且比 bg 暗/方向性 TL 对照）。
- **包络硬约束**：任何新图元外沿必须 ≤ 原有最大包络（树 `R*0.85`、灌木 0.42 名义尺寸），否则烘焙内容包围盒涨大 ⇒ `tools/cover-refs.json` 的图片通道尺寸基准失效。`tree_canopy` 保持 58×58、`bush_canopy` 保持 46×38（只有 `centroid` 随叶重分布从 23.88,18.52 → 24.01,18.46，已同步回 `cover-refs.json`）。

### 22.5 地面材质（`_paintGroundTexture`）

- **两趟 alpha 分桶批处理**：先收集几何到 4 个 alpha 桶（blade 4 浮点 / speck 3 / dune 4 / patch 5 / pave 4），再每桶 ≤1 次 `beginPath` + 1 次 `fill`/`stroke`。speck 由 `arc` 圆改为 `ctx.rect` 方块（细节点阵无需圆弧细分）。
- **色斑合批**（`drawGround` 低频色斑层）：逐斑 `beginPath/ellipse/fill` → 按 (alpha 档 × 颜色) 合批，alpha 0.06~0.12 量化为 2 档（视觉无差异）。视口 1920×1080 从约 535 次调用降到 ≤8 次 `fill`。
- **网格线合批**（两页）：每条线一次 `beginPath/stroke` → 一条 path + 一次 `stroke`（实测省 154 次调用/帧）。
- **量化效果**（1920×1080，`ctx` 调用数）：meadow 26,973→13,451，steppe 21,061→10,495，desert 7,184→4,695，snow 35,315→11,795，mudland 9,311→6,113，concrete 6,749→3,339。
- **⚠ 上述合批后仍然不够（2026-10-18 #GT 再次修）**：合批只把「每图元 5 次调用」压到「每桶 2 次」，图元数本身没变——雪地仍有 **11,717 个图元/帧**、zoom 0.5 看全图时达 **45,087**，单帧 31~85ms（60fps 预算 16.7ms），所以「一移动就掉帧」。现行解**不是再优化合批，而是不再每帧重画**：见 §25。

### 22.5b `drawImage` 在离线图与浏览器不可互换（#GT 度量教训）

`scripts/lib/mini-canvas.js` 的 `drawImage` 是**纯 JS 逐像素拷贝**，而浏览器 `drawImage` 走 GPU blit。二者性能差几个数量级，因此：

- **禁止用 mini-canvas 的墙钟时间去断言「缓存优化是否生效」**：实测「直绘 vs 缓存」墙钟都是 ~350-570ms，比值恒为 **1x**，完全掩盖了真实收益（浏览器里是 11,742 → 6 次 ctx 调用）。
- 正确指标是**与实现无关的量**：① 每帧 `ctx` 调用次数（`Proxy` 计数）；② 烘焙次数 / 命中率；③ 像素一致性。
- 同理，`getImageData` + 新建画布的开销必须排除在计时外，否则会把绘制成本淹没。

### 22.6 `scripts/lib/mini-canvas.js` 语义对齐（离线图可信前提）

两处此前「只存状态不生效」，导致离线生图与实机视觉**不可互验**：

- **`drawImage` 跟随 CTM**：旧实现完全忽略变换矩阵（只按原始 `dx/dy` 落点），而 `scripts/render-map-shot.js` 等工具都用 `ctx.scale/translate` 做全局缩放 ⇒ **默认 `--scale≠1` 下掩体/树冠位置全错**，离线图无法当基线。现改为**逆变换采样**：遍历设备像素包围盒，用逆 CTM 映射回图片 uv（平移/缩放/旋转/斜切全部正确）。
- **`globalCompositeOperation = 'lighter'`**：旧实现只把值存进状态、`_blend` 恒按 source-over 合成 ⇒ 所有发光（火焰/曳光/爆闪/轨炮电弧）在离线图里发灰。现按 Canvas 规范实现加法混合（`Cs·as + Cb` 分量相加，alpha 相加钳制）。
- **缩小采样必须双线性（#TEX12）**：3× 超采样 sprite 靠 `drawImage` 降到 1×，旧 nearest 采样会把超采样收益全部丢掉（离线图与浏览器不等价）。现仅在「设备像素/图像像素 < 1」时启用双线性（alpha 预乘插值），1:1 与放大保持 nearest，既有逐像素断言不受影响。
- **渐变坐标必须随 CTM（#TEX12）**：`MiniGradient` 在创建时捕获 CTM，`at()` 把设备像素中心逆变换回用户空间再求值。旧实现直接在设备像素上套原始坐标——3× 烘焙时顶光渐变只覆盖左上 1/9，实测 1× 直出 vs 3× 降采样平均亮度差 8.2，修复后 0.2。

### 22.7 回归保护（新增 `scripts/test-render.js`）

- **为什么必须新增**：`scripts/test-tanks.js` 的绘制断言是 `new Proxy({}, {get: () => () => mockCtx})` + 「不抛错」——mock 让任何调用恒返回自身，NaN 坐标/漏画/缓存键丢字段**一律测不出**；`scripts/test-assets.js` 同理只验「不抛错 + 绘制数 > 0」。上述缺陷正是这样长期存活的。
- **新测试用真实光栅化**（`mini-canvas`）做逐像素断言，覆盖：① 缓存键三项字段生效 + 缓存有界/LRU；② 炮塔 weathering 与 cupola 样式生效；③ 炮塔影与车底影方向世界固定（质心漂移 < 1.5px）+ 落在右下；④ `drawImage` 跟随 CTM、`lighter` 真加法合成、source-over 未回归；⑤ 特效绘制期确定性（同帧重绘逐字节一致）。#TEX12 追加 ①b 三项：`SPRITE_SCALE≥2`、`spriteView1x` 尺寸 = 烘焙/3、材质层关/开像素差 >100px。
- **入口**：`node scripts/test-render.js` 或 `npm run test:render`；已接入 `scripts/run-tests.js`。

### 22.8 立体感（2.5D 高度与方向光，#TEX13-2026-10-18）

俯视 2D 的「立体感」不能靠增加贴图细节，必须显式画出**高度**与**方向光**。现行三处：

- **坦克侧壁 `drawPartSideWall`**：把部件轮廓按**世界光反向**（右下 +x/+y）偏移后实心填充，再画顶面盖住其余部分；只露出背光侧窄带 = 高度。两层：外层深（接触影）+ 内层中暗（立面）。偏移必须世界固定（局部 `R(−angle)`），否则车体转 90° 侧壁会跑到受光侧。**绘制顺序**：地面影 → **车体侧壁 → 履带** → 车体顶面；侧壁先于履带，履带才不会被一块黑板盖掉。炮塔侧壁同理（薄一档）。顶面再加 `drawTankRimLight`（左上暖白渐变 1.1px），与暗勾线形成一明一暗的手绘微缩高光。
- **炮塔座圈**：`drawTurretRing` 画凸台（右下偏移暗环 + 顶面 + 受光描边 + 原虚线座圈缝），炮塔坐在凸台上而不是贴在车体上；放在炮塔软影之后、侧壁之前。
- **树冠体积**：`bakeCanopy` 在叶团之上叠**左上受光→右下蔽光**的线性渐变 + 右下暗冠缘 + 定向高光；受光侧由旧实现的**右上方**改为左上（旧版与影子方向相反，是树冠读起来平的根因）。投影三层加深（0.14/0.15/0.17，偏移 5~18px，半径 1.06R）。
- **岩石多面体**：`rock-poly` 由「平涂多边形 + 两条棱线」改为：右下偏移侧壁 → 以质心为顶点逐边三角面，按 **边法线·光向** 从 `rgb(74,74,71)` 插到 `rgb(188,188,180)` 着色 → 受光棱边 1.2px 高光 → 2 条裂缝 → 暗勾线；`drawCoverShadow` 的 box/rock 三层影加深（0.17/0.14/0.24）。
- **建筑/全高掩体侧壁**：`drawCover` 的 `box` 分支在屋顶之前先画一个右下偏移 4.5/5.6px 的暗色体块，屋顶盖住其余部分，露出 2~3px 背光侧墙体；否则俯视建筑只有影子没有高度。
- **植被方向光与轮廓（#TEX14 2026-10-18 / #TEX15 2026-10-19）**：#TEX14 先补方向光——叶团按相对全局光源（左上）方向连续插值取色、树干圆柱受光、冠层加 clip 包络的球面体积渐变与右下暗缘；#TEX15 再重做轮廓——灌木/树冠/倒树树冠从「多个椭圆拼贴」改为**单条波浪轮廓（`blobPath`）**，倒树树干从两段椭圆改为单条波浪原木，雪地树冠同步。与树冠/岩石同一光源（左上受光、右下投影），全套元素光照方向自此统一。
- **回归**：`test-render.js` ⑧a（树冠左上 > 右下 + 投影 < 裸地）、⑧b（岩石顶面 ≥3 个量化色阶 + 左上 > 右下 + 右下外缘有影）。

## 23. 坦克贴图审核标准（v2 分数 + v3 跨部件检查；2026-10-18 #TEX10/#TEX11，现行口径）

「好看」若不量化就只能靠肉眼，而肉眼在本项目的渲染尺度上会系统性误判。本章定义**可执行的审核标准**，实现见 `scripts/audit-textures.js`（CLI 报表 / `--json` / `require` 三模式，被 `scripts/test-render.js` ⑦ 引用为强制回归）。

### 23.1 两条前置事实（标准的立论基础）

- **实机显示尺寸只有 59~96px**：`hullPoly` 本地 bbox 实测 **73.5×38** 世界像素，`turretPoly` **32.3×34.6**；`renderHullTexture` 以 `scale=1` 贴回，相机 `RULES.camera` zoom 0.8~1.3。⇒ **所有指标必须在离屏 sprite 的 1:1 像素上测量**（那正是显示像素）。在 300×300 探针上「越看越精细」的改动实机可能完全不可见——称**放大审美陷阱**。
- **1:1 视图的取法（#TEX12）**：sprite 以 `SPRITE_SCALE=3` 烘焙，审计/测试统一经 `spriteView1x(entry)` 做 alpha 预乘盒式平均得到 1:1 图后再量；直接量 3× 原图会得到与实机不同的数值。
- **单指标一律可作弊**：任何「越高越好」的单调指标都会被噪声刷分。实测教训：以「颜色数」和「相邻像素对比度」判定成功，两个指标都被 1px 颗粒噪点刷高，颗粒越密分越高，但玩家看到的只是「脏」，迷彩块反而更读不出来。⇒ 标准必须使用**双向区间**（过高过低都扣分）。

### 23.2 八条指标（按意图取用）

| 指标 | 定义 | 作用 |
|---|---|---|
| `tones` | 8 级量化后占比 >3% 的色调数 | 过少=读成单色，过多=脏 |
| `tonesSpread` | 色调直方图归一化熵 | 细节只挤在一个色调 = 假细节（单色涂装必看） |
| `valueSpan` | p5~p95 亮度跨度 | 过小=塑料平色，过大=黑白失真 |
| `shadeAmp` | r=10 平滑后的 std | 体积感/光照渐变，必须有但不能盖过涂装 |
| `blockAmp` ★ | 去趋势残差 6px 分块 std | 「迷彩块看不看得出来」的核心指标 |
| `blockRatio` ★ | `blockAmp / shadeAmp` | <0.35 涂装被渐变淹没；>1.3 压过体积感变「迷彩纸片」 |
| `patchScale` ★ | 平滑残差连通域中位直径 / 车宽 | <0.12 碎成噪点；>0.55 糊成一整块 |
| `mipSurvival` ★ | 2×2 降采样后块级振幅 / 原图同频段振幅 | 结构能否活过缩放。1px 噪点大幅抵消，4~8px 结构存活；上界 1.10（大色块迷彩降采样后保留更大尺度结构，略 >1 正常） |

加权 100 分，每项 S/A/B/C 四档，**达标线 80 分（A）**，目标「实机尺寸下结构清晰、层次分明、无噪点化」。

**#TEX12 重标定（2026-10-18）**：测量基准从「1× 烘焙图」换成「3× 超采样降采样后的 1:1 视图」后，三项区间按新读数调整——`tones` 上限放宽到 8（平滑顶光/倒角会铺满 8 级，脏由 `tonesSpread`/结构项抓）；`mipSurvival` 上界 1.0→1.15（平滑材质保留大尺度结构，比值可略 >1）；`patchScale` 目标 0.18~0.45→**0.08~0.26**（超采样后连通域只保留色块核心，整体读数下降 ~35%；并排除轮廓 3px 带，否则量到的是材质倒角亮带）。

### 23.3 按设计意图分类评分（不可混用一套区间）

用一套标准评判迷彩与单色涂装是**错的**：迷彩的**目的**就是高块级对比 + 明确色块周期；单色涂装靠蚀刻细节（板缝/焊缝/铆钉）与光影体积感取胜。拿迷彩的 `blockAmp` 区间卡 `paint_panzergrau` 只会逼出「给灰漆加假迷彩」这种错误改法。

- `plain`（单色/蚀刻：none / armor_plate / weld_seam / rust / paint_panzergrau / paint_soviet / paint_olive）→ 主要看 `shadeAmp`、`mipSurvival`、`tonesSpread`。
- `camo`（块状迷彩：camo / camo_dunkelgelb / camo_nato / camo_desert / camo_winter / camo_urban）→ 主要看 `blockAmp`、`blockRatio`、`patchScale`、`mipSurvival`。
- `digital`（camo_digital）→ **第三种意图，不可并入 camo**：其设计语言就是「小像素簇」，用块状迷彩的 `patchScale` 目标（0.18~0.45）去卡它等于「要求数码迷彩别那么数码」。改用更严的 `mipSurvival`（簇须活过缩放）+ 更小的簇尺寸区间（0.045~0.16）。

**新增贴图时必须同时在 `INTENT` 表登记意图**；未登记默认按 `plain` 评。

### 23.4 指标设计的三次返工记录（避免重犯）

「噪点 vs 结构」的判据先后失败 5 次，根因都是想从**单尺度**统计反推「这是线还是点」：

1. `microContrast / blockAmp` 颗粒比 → 全部贴图 2.4~3.3，零区分度（把 1px 蚀刻线与 1px 随机噪点算成一样）；
2. 「邻居是否也显著」→ 全部 1.00（密集颗粒的邻居当然显著，方向完全反了）；
3. `L − blockMeans(6px)` 同号邻域 → 全部 1.00（块均值图是分段常数，块内残留的是平滑渐变，符号一致）；
4. 中值残差同号邻域 → 0.18~0.38 有数值区分，但 `weld_seam`（最该是「线」）反而最低，该指标实际量的是「厚度」；
5. **最终 `mipSurvival`** —— 这问题本来就有标准答案：看它能否活过降采样。

`patchScale` 同样返工 4 次：块均值连通域全 0.08（6px 网格把连续色块切成碎岛）→ 块均值自相关全 0.22（量到网格自造周期 lag=18）→ 平滑残差自相关全 0.12（量到最快振荡分量）→ 同号游程全 0.11（残差在零附近抖动，游程被 1px 翻转切碎）→ **平滑残差连通域**才得真实值。

### 23.5 三处迷彩缺陷与修法（均先量化再动手）

- **`camo_winter`**：白块 `rgba(255,255,255,0.35)` 叠在亮度 216 的近白底上，落色仅 229，**只差 13** ⇒ 几乎不可见。修法：改用**更深底色透出**而非「更白」——4 块深灰掉漆区（−45 级）作骨架 + 2 小块纯白高光 + 深斑沿掉漆区边缘聚集（真实掉漆从边角扩散）。`patchScale` 0.09→0.17，分 85→96。
- **`camo_urban`**：5 深 + 4 浅 `fillRect`，**轴对齐矩形**在菱形车体上像 UI 色块；深块仅 −21、浅块 +16，低于车体自身光照渐变。修法：改硬边多边形（与其他迷彩统一 `_texPatch`）、明度差拉到 −38/+36、沿车身长轴分布。分 85→90。
- **`camo_digital`**：18×18 网格 ⇒ 单元 **2.56px**（已是单像素噪点级，zoom 0.8 下被平均掉）；色2/色3 与底色只差 **+5/−5** 等于没画；三套 `%5/%7/%11` 散点未形成「成簇」结构。修法：10×10 网格（单元 4.6px）+ 三色差 −24/+22/−12 + **簇生长**（每簇 2~5 相邻格，优先横向延伸）。

### 23.6 顺带修掉的两处（体检项发现，非评分项）

- **`armor_plate` 与裸装甲差异块仅 1.5%**：全部笔画压在 1px 网格线上，实机被 `paintShade` 渐变与颗粒淹没。修法：板缝 2px 加深至 0.26 + 每板交错极淡明度偏移 + 板缘倒角高光（装甲板最核心的识别特征）。差异升到 **85.3%**。
- **`paintWeathering` 锈斑太小**：半径 1.5~4.5px 在 73px 车体上只占 ~1% 面积，`paint_soviet` 的 dmg0→dmg3 差异块仅 3.0%（等于损伤看不见）。修法：半径放大到 2.5~6.5px、alpha 提到 `0.38 + 0.17×level`。`paint_soviet` 3.0%→5.5%，`rust` 13.4%→16.5%。

### 23.7 v2 当前基线（2026-10-18 实测，3× 超采样后）

`node scripts/audit-textures.js` → 平均 **97/100，14/14 达标**（14 个 S；最低 `camo_nato` 92）。体检项全部通过（与裸装甲可区分 ≥10%，`armor_plate` 按设计豁免）。

**回归断言**（`scripts/test-render.js` ⑦ + ⑦b，共 9 项）：覆盖全部 14 个 `TEXTURE_DEFS` 键 / 全部 ≥80 分 / 无 C 级指标 / 核心指标无 C / 与裸装甲可区分 / `rust` 损伤 0→3 可见；⑦b 再断言 v3 三项齐全且全部 PASS、迷彩/数码迷彩 `continuity` ≤0.85。**改任何贴图后必须重跑**——本轮三处缺陷在旧的 test-render 里全部不可见（旧断言只看「画了没画 / 抛不抛错」）。另有 ①b 三项：`SPRITE_SCALE≥2`、`spriteView1x` 尺寸 = 烘焙/3、材质层关/开像素差 >100。

### 23.8 v3：跨部件 / 跨实例 / 沿边检查（#TEX11，2026-10-18）

v2 只量**车体一张 sprite 的统计量**。2026-10-18 的 1:1 视觉审阅（离屏 5×/10× 出图逐像素复核）暴露了三类「统计全绿、肉眼不对」的缺陷，v2 完全量不到：

- **炮塔图案缩水**：旧 `TEXTURE_DEFS.draw` 拿到的是**部件自己的 bbox**。车体宽 73.5px、炮塔宽 32.3px，同一条 `fx=0.30` 的色块在炮塔上只有车体的一半大；炮塔/车体交界处图案断开。⇒ 引入整车图案框（§22.1）。
- **同型车共用同一套迷彩**：图案种子全是常量，两辆 Tiger 像素级完全一样。⇒ 图案框按 `weatherSeed` 平移。
- **磨损只在装甲面内**：棱边没有掉漆，10 倍图里 weathering 是「彩色碎屑」。⇒ `paintEdgeWear` 沿边界布点。

因此 v3 是 **3 条通过/不通过检查**（不并进 v2 的 100 分，避免为了凑分而调区间），实现同 `scripts/audit-textures.js`，`scripts/test-render.js` ⑦b 强制回归：

| 检查 | 定义 | 目标 | 代码依据 |
|---|---|---|---|
| `variation` | 同贴图 × 两个 `weatherSeed`（5 / 98765）画面差异像素占比；只对 `camo`/`digital` 评（单色涂装没有「图案布局」可言） | ≥8% | 图案框 `weatherSeed` 平移 |
| `edgeWear` | dmg0→dmg2 在「轮廓内侧 2px 带」上的亮度改变占比 | ≥17% | `paintEdgeWear` 随等级加量 |
| `continuity` | **涂装层**（`detail:false`）在车体/炮塔**同一像素坐标**的高通残差比 `stdΔ/stdHull`；≈1.4 = 两套独立图案，≈0.3 = 同一套漆 | ≤0.85 | `paintPatternBox` 车体 bbox − 座圈偏移 |

**为什么 continuity 必须只比涂装层**：车长塔/观察镜/铆钉等机械件本来就只长在炮塔/车体上，把它们算进残差会把「同一套漆」误判成两套图案（实测直接比整张 sprite 相关仅 0.13~0.48，只比涂装层后 0.96~0.99）。#TEX12 起材质层（倒角/AO/拉丝/积尘）也必须在测量时关掉——它是逐部件独立生成的光照，不是涂装图案（否则 plain 贴图残差比 2.4）。

**为什么网格类贴图要 `originX/originY`**：`armor_plate` 的 14px 板缝按 `b.minX` 量化起点；炮塔框平移 8px 后 `ceil((minX−8)/14)` 会让板缝错开 `8 mod 14 = 8px`。改用「车体原点 + n×s」派生后，`continuity` 1.29→0.16。

**当前基线（2026-10-18 实测，3× 超采样后）**：`node scripts/audit-textures.js` → v3 **14/14 PASS**；`continuity` 最差 0.84（`paint_olive`），迷彩/数码迷彩最差 0.37；`edgeWear` 27.0%~30.7%；`variation` 18.5%~38.1%。

---

## 24. 生存模式地图生成 + 道路净空（#U35，2026-10-18，现行口径）

### 24.1 生存模式：与标准模式**同一套** strip 生成链

用户裁定（2026-10-18）：地图生成算法参考最新标准模式，但保留更大的单图。

- **删除两个 hack**：旧 `generateSurvivalRun` 靠 `bossOnly`（强制 Boss 标记）+ `stripForBoss`（强制走 strip）绕道。现改为**标准 `makeNode` 路径 + `env.noEnemies`**，`run.env` 里不再出现 `bossOnly`/`stripForBoss`（Boss 战模式的 `bossOnly` 路径不受影响）。
- **`env.noEnemies`**（`js/tank_map.js makeNode`）：常规敌军不生成（`defenseEnabled=false`、`targetCount=0`、`composition=[]`、不撒簇）、`quota=null`、`defenseLines=[]`、`boss=null`；其余字段（covers/roadJunctions/exitX 等）全部走标准路径。生存敌人由波次系统手动生成。
- **尺寸参数唯一归口** `RULES.nodeMap.strip.survival = { screensX: 5, screensY: 5, chunkRows: 2 }`。
- **实测尺寸（1280×720，8 seed）**：`7680×4645 ~ 7680×4741` ＝ **6.0×6.5~6.6 屏**，约 349 covers / **8.89 屏⁻¹**。
- **旧实现的缺陷（已修）**：`screensY=5` 但片高只有 ≈3.05 屏 ⇒ 纵向裁剪后上下留大块空白带（底部 400px 带内元素数 **0**）。现多行片让 `stripH = Σ行高`（由片决定，≈4600），**纵向不再裁剪** ⇒ 顶部空白 53→36px、底部 525→26px、底 400px 带元素数 0→15。

### 24.2 多行片（`opts.chunkRows`）

- 缺省 `1` = 旧单行条带，**逐字节零回归**（`chunkRows` 缺省 vs 显式 1，covers JSON sha1 一致）。
- `>1`：按 **行×列** 网格铺片。列宽取各行同列最大值、行高取该行片高最大值、`stripH = Σ行高`；chunk 元数据补 `y0/row/col`；片内帧 `localRoads/localJunctions/localRivers` 同时平移 x 与 y（`rowCenterY`）。
- **每行横向路面保证**：每行沿中线 400px 采样，未覆盖的连续区段补 `groupId='strip-row-trunk'` 横向干道并并入 `junctions`（不耗 rng）。实测每行覆盖 19/19（单行时 row0 仅 2/19）。
- **行间接缝 = 推出而非整带删除**（v3 定稿，关键教训）：只处理「世界 AABB 真正跨过行界」的元素，沿 y 推到最近单侧、留 `ROW_SEAM_GAP=24`；完全落在某行内部的元素不动；推不出（界外/压路/与其它非地面元素重叠）才删。
  - **返工记录（避免重犯）**：v1 用「行界 ±300px 整带删除 structure/foliage」⇒ 在地图上劈出**整条 600px 横贯空白带**（seed=999 y2000~2600 连续 6 个 100px 细带元素数**全 0**）；v2 收窄到 ±110px 仍推出 ⇒ 空白带缩到 220px，但 seed=7 的 2300-2400 带变空。⇒ **行方向不是推进轴，不需要「留出可通行竖带」语义**，x 向接缝那套整带净空不能照搬到行方向。
- **`fillEmptyBands()`**：仅在 `chunkRows>1` 启用。任何 100px 等高带非 road 元素数 = 0 时，用确定性植被补 2~3 丛（位置由「带号+attempt+seed」hash 派生，不耗 rng、不跨行界、不压路、不压其它实体）。实测逐 seed 400px 空带 **0 个**；100px 空带仅剩两类合法情况——「整带被横向路面 100% 覆盖」与「<50px 边角薄片」。

### 24.3 道路上不得有房屋、树木（全模式，用户硬性要求）

- **根因（已核实）**：strip 级路网 cover 是在**所有片生成完之后**才 push 进 `covers` 的，而逐片 `pruneOverlappingCovers`（含 #U32 避路）在片内跑，**看不到 strip 级路面** ⇒ 片内生出的建筑/树/灌木压路无人清理。旁路来源还有 `placeForestClusters` 的 `clampInside`（选点后钳回界内可能落上路面）与河岸植被 `groupId='riparian'`（strip 级路网之后生成、仅 AABB 粗判）。
- **修法**：新增 `clearCoversOnRoads(covers, roadCovers, opts)`，在 **`generateNode` 返回前**与 **`generateStrip` 收尾**（strip 级 road/river/植被全部 append + mud 收尾之后）各调用一次。
  - 判定：**verts 精确多边形相交**（顶点互入 + 边相交）；无 verts 的旧 OBB 段退化为四角多边形（与 SAT 等价）。**禁止只看 AABB / 中心距**——道路 cover 的 `w/h` 是整链 bbox（实测某链 1030×4645），按包络判会把整片地图判成「压路」。
  - 处理对象：`tierGroup ∈ {structure, foliage}`。`road`/`mud`/`river`/`water` 等 ground/liquid 一律不动。
  - 命中：先沿「背离最近路心」确定性最小推出（8 向兜底，与 #U32 prune 同口径），推不出（界外/仍压路/与其它非地面元素重叠）才移除。**全过程不耗 rng**（同 seed 逐字段可复现）。
  - 性能：AABB + 256px 边空间网格双重粗筛 ⇒ `test-strip` 实测 8.7s（远低于 300s 上限）。
- **实测（8 seed）**：生存压路 9/0/0/4/2 → **全 0**；标准模式 3 seed × 2 节点 → **0**。清理统计（单行 strip 17280×2376）：seed42 moved 14 / removed 0；seed7 moved 16 / removed 1；seed99 moved 13 / removed 0。

### 24.4 校准基线

`scripts/test-nodegen-calibration.js` 与 HEAD 基线逐格对照（7 模板×5 难度×8 seed）：**coverCoverage 漂移 0.000000**（口径 ±0.02）、**connectivity 漂移 0.000000**（±0.05，7 模板×5 难度仍全 1.000）、**minPassageWidth 最大 0.168**（±0.5）——均未超口径，**BASE 一个没改**，仅在文件头重锚注释块追加一条带日期的漂移记录。当前最紧的是 `village_center d=0.1` 0.884→0.716（距 ±0.5 窗口下沿仅余 0.316），后续再叠加改动需重标定。

### 24.5 回归覆盖

- `scripts/test-modes.js`：#U35 段——noEnemies / `quota=null` / 无 `bossOnly`+`stripForBoss` / `chunkRows` 与行元数据 / **逐 seed** 400px 与 100px 填满 / 上下极端带 / 每行横向路面 / **压路 = 0（3 seed × 2 模式）** / 补给站存在且不在路面水体上 / 标准模式零回归。合计 41 通过。
- `scripts/test-strip.js`：`chunkRows` 缺省 = 显式 1 逐字节一致、片数翻倍、`row/y0/col` 元数据、`stripH=Σ行高`、跨界 structure/foliage = 0、无 400px 空带、每行有横向路面、多行无压路。

---

## 25. 地面层视口锚定烘焙 + 相机屏幕像素对齐（#GT，2026-10-18，现行口径）

**用户反馈**：「部分地图 biome（如雪地、沙漠）的纹理会随着玩家移动变化，相应的帧率也大幅下降。」
两个**互相独立**的成因，各有独立的修法；只修一个都只能解决一半。

### 25.1 成因一：每帧重画世界锚定纹理（性能）

`_paintGroundTexture` 每帧按「世界格 hash」重算并重描全部图元。这些图元**与相机无关**（世界锚定是对的），每帧重画纯属浪费：

| biome | 视口 1920×1080 | zoom 0.5（看全图 3840×2160） | 单帧耗时 |
|---|---|---|---|
| meadow | 14,047 图元 | 52,275 | 8.4 / 43.8 ms |
| snow | 11,717 | 45,087 | 7.5 / 31.6 ms |
| desert | 4,777 | 17,293 | 11.8 / 59.9 ms |
| mudland | 6,455 | 23,641 | 21.8 / 84.6 ms |

⇒ 60fps 只有 16.7ms 预算，仅地面纹理就吃掉 31~85ms。

**修法**：`ensureGroundCache` / `drawGroundCached`（`js/tank_battledraw.js`）把地面层（底色 + 色斑 + 材质纹理）烘焙进**视口大小的离屏画布**，按世界坐标锚定；相机在内半区移动时**只 blit 1 次** `drawImage`，越过迟滞（`GROUND_CACHE_MARGIN=320` 的一半）才重烘焙。

- **烘焙缓冲区按屏幕像素建**（世界尺寸 × zoom），画回世界变换时再 `/zoom` 还原世界尺寸。这样无论 zoom 多少，缓冲成本恒为「视口像素 + 余量」。
  - ⚠ **返工记录**：首版用「世界尺寸 > 4096 就不烘焙」的护栏，而 zoom 0.5 看全图时世界视口 3840×2160 +MARGIN 达 4480×2800 ⇒ 被误拒，**恰好掉在最需要优化的场景**（每帧 45k 图元直绘）。现改为按**像素数**判定（`GROUND_CACHE_MAX_PX = 4096²`），实测 zoom 1 / 0.8 / 0.5 / 0.35 全部可烘焙（缓冲 2560×1720 / 2432×1592 / 2240×1400 / 2144×1304）。
- **实测效果**（1920×1080，玩家每帧移动 4px，40 帧）：

  | biome | zoom | 直绘 ctx 调用/帧 | 缓存后 | 烘焙次数 | 命中率 |
  |---|---|---|---|---|---|
  | snow | 1.0 | 11,742 | **6** | 1/40 | 97.5% |
  | desert | 1.0 | 4,802 | **6** | 1/40 | 97.5% |
  | snow | 0.8 | 18,316 | **6** | 1/40 | 97.5% |
  | snow | 0.5 | 45,112 | **6** | 1/40 | 97.5% |

- **缓存 key**：`seed | biome | 所有 zone 的 x0/x1/y0/y1/biome | zoom`。换 biome / seed / zones / zoom 均强制重烘焙（`test-render.js` ⑨e 断言：同参命中 1 次，换 biome+seed+zones 后累计 4 次）。
- **失效点**：`enterBattle`（换节点）与 dev 随机场各调一次 `clearGroundCache()`。
- **回退**：仅当缓冲像素超过护栏（极端缩小/超大视口）才回退每帧直绘，保证不吃几百 MB RGBA。

### 25.2 成因二：亚像素重采样（观感）

即使几何完全世界锚定，**渲染仍会把整个世界推进亚像素位置**：`cam.x/cam.y` 是阻尼跟随的浮点值，`translate(-cam.x, -cam.y)` 后 1~2px 的高对比细图元（雪粒、沙纹 1.2px 描边、草丛短划）每帧被**不同相位重采样**，亮度逐帧跳变 —— 读起来就是「纹理在动」。这也解释了为什么**只有雪地/沙漠等细纹理 biome 明显**。

**修法**：`renderCamPos(cam)`（`js/tank_camera.js`）给出**屏幕像素对齐**的渲染用相机位置：

```
x = round(cam.x · zoom) / zoom      // 量化为 1/zoom 的整数倍
```

**为什么必须量化在屏幕空间而不是世界空间**：世界点 x 的屏幕位置 = `(x − camX)·zoom + W/2`，相机移动 δ 对应屏幕位移 `δ·zoom`。要让屏幕位移恒为整数，须 `δ·zoom ∈ ℤ`。若直接 `round(camX)`（世界整数），在 zoom≠1 时屏幕位移仍带小数——**反而更差**。

| zoom | 浮点（旧） | 世界取整（错） | **屏幕取整（现行）** |
|---|---|---|---|
| 0.5 | 0.00% | 0.02% | **0.00%** |
| 0.8 | 1.80% | 0.31% | **0.00%** |
| 1.0 | 0.00% | 0.00% | **0.00%** |
| 1.3 | 0.00% | 0.00% | **0.00%** |
| 1.6 | 0.41% | **0.80%（比旧更差）** | **0.00%** |

（表为「相机 0→+0.5px 后同一世界点的颜色变化率」，`tmp/probe-snap-space.js`。）
终验（`test-render.js` ⑨b，3 zoom × 2 biome × 360 个世界点）：**像素对齐后最大通道差 = 0**，旧行为最大 27。

- **这是纯渲染取值**：物理 / AI / 命中判定仍用 `cam.x/cam.y` 的浮点值，不得替换。`vb`（视口 AABB）改用对齐后的中心，保证地物剔除口径与地面一致。
- **观感代价**：相机只在跨整数屏幕像素时整体平移 1px，无可见影响。

### 25.3 回归覆盖（`scripts/test-render.js` ⑨）

| 断言 | 内容 |
|---|---|
| ⑨a | `renderCamPos` 在 6 个 zoom × 3 组坐标下，屏幕位移恒为整数（18/18） |
| ⑨b | 亚像素移动后同一世界点**逐字节一致**（最大通道差 0；并附「旧实现确实有重采样 max 27」的对照，防断言空转） |
| ⑨c | 缓存命中后每帧 ctx 调用 ≤8（直绘 1,574 @zoom1 / 5,419 @zoom0.5） |
| ⑨d | 缓存画面与直绘画面一致（不一致像素 0.00%，<3%） |
| ⑨e | 缓存失效语义：换 biome/seed/zones 必须重烘焙 |
| ⑨f | 2 维 zone 分区正确：上（雪）rgb 196,206,214 冷色 / 下（沙）rgb 214,184,122 暖色 |

三条关键断言均做过**变异测试**确认非空转：把 `renderCamPos` 改回世界取整 → ⑨a 红（10/18）；缓存 key 去掉 biome → ⑨e 红（3 次≠4 次）；`drawGroundCached` 强制直绘 → ⑨c 红（1,574=1,574）。

### 25.4 biomeZones 升级为 2 维矩形（#U36，与 §25.1/25.2 同批）

`generateStrip` 在多行片（`chunkRows>1`）下 `chunks` 是「行×列」展开的，而旧版 `biomeZones` 只有 x 区间 ⇒ **同一列不同行的 zone x 完全相同但 biome 不同**，`drawGround` 又按视口全高 `fillRect` ⇒ 后画的整片盖掉先画的，两个 biome 的纹理层还**叠在同一片像素上**（alpha 叠加 → 偏亮 + 纹理密一倍），视口边缘切换时同样读成「纹理随玩家移动变化」。

- 现行契约：`{ x0, x1, y0, y1, biome }`。`y1 = c.y0 + rowsPlan[c.row].h`（**行带高**，不是 chunk 自己的 `c.h`——后者是片自身模板高，小于行带高，用它会在行间留 37~147px 纵缝）。
- `drawGround` / `drawGroundTexture` 均按矩形裁剪；相邻渐变只对「x 相邻**且 y 区间真相交**」的 zone 绘制（同列上下行不是地貌交界）。
- 单行（`chunkRows=1`）零回归：`rowsPlan[0].h === stripH` ⇒ `y0=0`、`y1=h`，`x0/x1/biome` 与旧公式逐字段相等（24 个标准 strip 节点实测漂移 0 项）。
- 回归：`test-modes.js` 4 条（结构契约 / 生存任意两矩形交集面积 = 0 / 单行零回归 / 256 点抽样覆盖整张世界）。

---

## 26. 道路单弓形弯：杜绝正弦/S 形道路（#U45，2026-10-19，现行口径）

**用户反馈原文**：「修改道路生成算法，目前有些道路看起来像正弦函数，在地图内的弯太多」。

### 26.1 根因

`placeRoadNetwork` → `buildFromPoints`（`js/tank_nodegen.js`）旧实现随机放 **1~2 个内部控制点**（`nCtrl = rng.int(1,2)`），每个控制点独立 `rng.range(-a,+a) × span` 横向偏移（`curveAmp=0.16`）：

- 两个控制点**反号**时，Catmull-Rom 样条的横向偏移曲线沿跨度方向正负交替 = **S 形**（即用户所说的「像正弦函数」）；
- 两个控制点**同号**时也是「中段两处渐变弯」，叠加端部天然反拐，观感仍是「弯太多」。

### 26.2 修法：全程恒定符号的单一弓形弯

`buildFromPoints` 重做为**单弓形**（弯向全程恒定、无回拐）：

1. 只放 **1 个内部控制点**（弓顶，`t=0.5`），偏移 = `side × rng.range(0.55, 1.0) × curveAmp × span`（`side = ±1` 为弯向，0.55~1.0 保留幅度多样性）；
2. 两端点各加一个与弓顶**同号、1/4 幅**的预弯控制点（`t=0.08/0.92`，`endOff = bowOff × 0.25`）——消除旧版「弓形两端必然反拐」的端部反向弯，使横向偏移沿跨度恒同号、单调过渡；
3. `tan1`（G1 切线连续，单节点 weTrunk 链式口径）分支保留同样结构：切线控制点并入弓顶偏移（×0.4），后续弓点 `t=0.55, off=bowOff×0.8`。

### 26.3 参数收口（`RULES.nodeMap.road`，唯一口径）

| 参数 | 现行值 | 说明 |
|---|---|---|
| `curveAmp` | **0.075**（旧 0.16） | 语义改为「单弓形弓顶偏移相对跨度比例」：弓顶最大横移 ≈7.5% 跨度（2100 宽节点 ≈158px ≈ 1.4 条路宽），全程只弯一次 |
| `branchCurveAmp` | **已删除** | 自 #G（2026-09-21）起零消费（T 形支道固定 amp=0，唯一残留是生成器里的死变量）——按 `junctionClearR` 先例删除 |
| `diagChance` / `diagAngleMin/Max` | 0.45 / 0.18/0.34（不变） | 单弓形后端点切线即端点连线方向（无旧版端部反向弯），#B7 浅角护栏余量进一步放大 |
| D 平行 / I 双干拓扑显式振幅 | 0.05（不变） | 维持 #G 的平行收紧 |

### 26.4 实测与回归

- **弯形数值验证**（9 模板 × 30 seed × scale 3，648 条道路链）：以每条链两端连线为基线，横向偏移序列的符号变化次数 **max = 0**（全部为单弓形，无 S 形）；弓顶横移封顶 7.50% 跨度；路身中段出界 0 条（两端 20% 内 ≤29px 的端帽探出属设计行为——路端点落边界线、端帽随路缘斜切被画布裁掉，§10.1 口径不变）。
- `test-nodegen.js` §16 七护栏全过（无断口 / 无孤悬路头 / 交叉口 ≤2 / 最小夹角 **81.8°** / 拓扑 5 种 / 路口分布覆盖 / 0 路口拓扑存在）。
- `test-nodegen-calibration.js` **第十三次基线重锚**：`curveAmp` 与 rng 消耗序列变化（`nCtrl` + 逐点偏移 → `side` + `bowOff`）重排路网走向 → `minPassageWidth` 为纯流位差重排（无系统性收窄，车体宽下限仍富余）；**connectivity 维持 0.9999~1.000**、cov 微幅漂移（±0.004 内）。BASE 表按实测重锚，TOL 不变（cov ±0.02 / con ±0.05 / minw ±0.5）。
- `test-strip.js` §6c 接缝断言**修正判定盲区**：旧实现用「cover 中心距接缝 <800px」近似「横贯河应跨接缝」——纵贯（V）河链恰好从接缝旁经过时误报（该注释首行早已声明「纵贯河形不强制」，实现未兑现；#U45 路网 rng 重掷后 seed42 河形 H→V 首次踩中）。现按 groupId 聚类，仅「x 跨度 > y 跨度的横贯链且 bbox 实际覆盖接缝 x」才要求接缝 300px 内有水系。strip 河流为整链一次生成，接缝结构上不可能断链。
- `test-replay.js`：布局重排使 seed=1 五节点回放暴露**代理玩家策略盲区**（进入接敌距离即停车，若停车点恰在建筑后死角则全程 0 开火假超时，实测玩家 120s 停在 (735,675)、最近敌 422px 恒无 LoS）。修法（`js/tank_sim.js` `_defaultPlayerPolicy`，与 `tank_ai.js` #M 失去 LoS 突进 patch 同语义）：目标已进入接敌距离但 LoS 被挡时**继续向目标开进**直至重现 LoS。修复后 seed=1 有真实交战（总开火 36 次），回放确定性断言全过。
- 视觉抽查：`scripts/render-map-shot.js` seed=7 / seed=12 生图目视——道路均为单弓形缓弯、无正弦回拐（`tmp/road-s7.png` / `tmp/all-s12.png`）。
- 沿革：§10「1–2 个横向抖动中点」、§12.3 `curveAmp = 0.16`、§13.3 校准基线中的对应描述**已被本节取代**。

## 27. 2026-10-20 批次现行口径（#W15 / #W16-② / #W17 / #W18 / #X2 / #X3）

本节收口 2026-10-20 批次地图侧的全部现行口径。**逐条数值以对应实现文件为唯一口径**，本节只记语义与归口，不重复罗列参数表。

### 27.1 `coverWorldScale` 补 `building`（#W18-1）

`js/tank_cover.js` 的 `coverWorldScale`（三处：约 `:122` / `:135` / `:167`）**补入 `building` 键**，现行：

```js
{ half: 0.42, full: 0.42, building: 0.42, barricade: 0.32 }
```

**根因**：可破坏楼房 tier `building`（§13.2）此前**不在缩放表内** ⇒ 落到 `undefined` 分支/缺省值，导致此类掩体的世界缩放过小或与 `full` 不一致（同为 3 发可破坏的全高建筑，观感与判定比例不同源）。`building` 与 `full`/`half` 同取 0.42 表示「同为建筑体量」。

### 27.2 出生点判据与液态地形排除（#W18-2 + #X3，2026-10-20）

**`tierBlocksSpawn` 判据（现行两支）**：
```js
passability === 0 || shellBlock === true || shellBlock === 'single'
```
`shellBlock === 'single'` 一支为 2026-10-20 补入（此前漏判，导致某些"只挡单发"的 tier 被当作可通行出生点）。

**#X3 液态地形不可出生（2026-10-20 新增）**：`js/tank_map.js` 拆成**两个谓词**——
| 谓词 | 用途 | 判定集合 |
|---|---|---|
| 清场谓词 | 出生点周围**推除/清理**元素 | **只认阻挡物**（原 `tierBlocksSpawn`） |
| 选址谓词 | 出生点**选址合法性** | 阻挡物 **∪ 液态地形**（`water`/`river`） |

**为什么不直接改 `tierBlocksSpawn`（关键，勿回退）**：该谓词被「清场 splice」复用——把水域并入它会**把河段当阻挡物删掉**，直接打断河流拓扑（属 #T4 回归）。因此只能拆两个谓词。

`findPlayerSpawn` 的兜底点同样加水域复核 + 就近推出。**实测玩家落水 0/100 节点**（改前 60 节点有 1 例）。

**#X3 敌方侧澄清（ISSUES 原文判断有误）**：原文称「敌人生成无避水校验」，实测 **该侧不成立**——`hitsCover`（约 `:540`）走**全量 covers（含水域）**，720 敌 **0 例**落水。⇒ **该侧未改动代码**。

### 27.3 水域收尾顺序 + 真多边形判定（#X2，2026-10-20）

**`clearCoversOnWater` 必须放在 `clearCoversOnRoads` 与 `fillEmptyBands` 之后**（`js/tank_nodegen.js` strip 级收尾链）。

**根因（不是「清理没跑」）**：清理确实在 strip 路径执行，但跑在上述两步**之前**——这两步会把元素**重新推出/补植到河道与湖面**（`fillEmptyBands` 的"纵向填满"兜底尤其会往空带补植被，而河道正是一条"空带"）。⇒ 顺序不对，清了等于没清。

**判定改真多边形 SAT**：弃用旋转包络 AABB 近似（注释自称 "OBB 近似"），改用 `_obbHit` / 真 SAT——参照 #U37 的**8 倍面积教训**（AABB 包络对细长/斜置多边形的面积可达真实形状的 8 倍）。`bridge` / `road` 豁免（桥面与水共存是设计意图）。

**实测重叠**：改前 生存 35 / 标准 21 / Boss 5 ⇒ **改后 0**。

### 27.4 两套「未注册 tier」兜底语义：方向相反但互补，不要统一（#W16-②）

| 查询 | 未注册 tier 的兜底 | 取向 | 若反向的后果 |
|---|---|---|---|
| `js/tank_cover.js` 遮蔽查询（`getExposure` / `coverBlockInfo`） | 返回 **false** | **宁少挡** | 取 true 会让玩家在**看不见的物体**后面挨挡（无法理解的无敌墙） |
| `js/tank_fire.js` 弹道拦截 | `\|\| {mode:'solid'}` | **宁多挡** | 取 false 会让炮弹**穿墙**（更明显的破绽） |

**结论：口径不同但互补，禁止为了「统一」而改动任一侧**。两侧的不可达路径（`mediumHullExposure` 读取、`destroyCover` 的 `label` 未判空）已于 2026-10-20 一并清理/补守卫（见 §27.5）。

### 27.5 `directionTolerance` + `coverEnvelope` 缓存（#W17，2026-10-20）

- **`RULES.coverRules.directionTolerance`（缺省 16，唯一键）**：此前是 `js/tank_cover.js` 内的**硬编码常量**（约 `:710`）。现由 `role-systems` 在 `RULES` 登记、`role-mapgen` 经 `coverDirectionTolerance()` 消费；缺失/非法值（`null`/字符串/`NaN`/整块 `coverRules` 缺失）一律**回落 16 且不抛错**。
- **`coverEnvelope` 已加 WeakMap 缓存**：签名 = `verts` 引用 + 长度 + `x`/`y`/`angle`（几何变更即失效重建）；`getRoadUnderTank` 每帧两次调用，整链 verts 可达 300+ 点。
- **`mediumHullExposure` 从未存在，已删读取**：该字段在 `RULES` 中**从不存在**（实测 grep 零命中）⇒ 恒 `undefined` ⇒ 恒返回 `0.0` 的不可达死路径，现直接固化 `0.0`。
- 回归：`scripts/test-covers.js` #W17 段（含「字段确实驱动行为」的 exposure 翻转断言，防「读了但没用」的空接线）。

### 27.6 死配置清理与一处误判纠正（#W15，2026-10-20）

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
**注**：`generateStrip`（strip 链）路径下 `water` tier 恒为 0/40——strip 有自己的 `placeStripRivers` 一体化水系，且有 `_ro.externalRoads` 跳过守卫（§20/§24.1 口径）。两个生成器的水体语义不同，**统计时不可混用**。

### 27.7 回归覆盖

`scripts/test-nodegen.js` / `test-nodegen-calibration.js` / `test-covers.js`（180 断言）/ `test-map.js` / `test-strip.js`；`scripts/audit-map-gen.js` 的 **G4 口径已重写**（旧 AABB 矩形口径 669 项硬失败 → 真实多边形足迹判定 0 项，并加 6 条合成几何自检防「归零即失效」，详见 `DEVELOPMENT-batches-2026-10.md` §4.112）。
