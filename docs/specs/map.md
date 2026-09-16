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
- **水体/桥梁（P-20）**：waterBridgeChance = diff×0.5 概率插入；水体不可通行（move:0）、桥梁通道（move:1）；尺寸封顶节点 40%，边界钳制防越界；玩家出生点 findPlayerSpawn 排除水域。

## 2. 地图元素体系 (Cover Tiers)
参数权威收口于 RULES.coverTiers：

| 元素 | tier | 弹道交互 | 坦克通行 | 视线遮挡 | 残骸链 |
|---|---|---|---|---|---|
| 半高掩体 | half | 垂直剖面拦截（炮塔恒露；中坦车体100%挡/重坦25%露；贴掩体越掩插值） | 中坦阻挡推出；重坦压过 | 不遮 | ∞ |
| 全高掩体 | full | 100% 确定性格挡 | 阻挡推出 | 不遮 | ∞ |
| 灌木丛 | bush | 穿透（不挡弹） | 自由通行 | 阻挡 AI 视线 | ∞ |
| 树木 | tree | 树干 1 发截停 | 阻挡推出 | 树冠遮挡视线 | 1 发 → fallen |
| 倒树 | fallen | 穿透 | 自由通行 | 树冠遮挡视线 | 终态纯视觉残留 |
| 栅栏 | soft | 穿透（穿透即毁） | 0.45 减速通过，压过即毁 | 不遮 | 无残骸 |
| 沙袋路障 | barricade | 挡 1 发后摧毁；>70° 可跳弹（不触发摧毁） | 压过即毁 | 不遮 | 1 发/碾压 → rubble |
| 碎石 | rubble | 半高概率遮挡（0.5m） | 压过即毁 | 不遮 | 终态 |

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

> 设计稿（落地计划见 PLAN.md P-33）：将水域/泥潭与全高/半高掩体统一抽象为「地形类型」。每个地形即一个 cover 实例，由一组属性刻画，为后续丰富地图元素（水潭/河流/烂泥地/建筑等）提供一致基座。

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
| 半高掩体(矮墙) | 0.4 | grad | half | ∞ | box | cover |
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
河流由共享同一逻辑体的多个 water 段链接而成（连续 movement 阻断 + 单次笔触绘制），需在 cover 实例 schema 增加 `segments[]`/parent-link 字段（当前实例 schema 无此字段，见 §5.4-9）。

### 5.4 其他需补充内容（落地前 checklist）
1. **地面 biome 图层 (#81)**：水/泥需独立于 OBB covers 的铺地图层，才能连续平铺而非孤立方块。
2. **不规则岩石形态 (#78)**：需 nodegen/designer 的 `verts` 多边形创作（基础设施 `tank_cover.js:143-156` 已具备，但缺编辑器 UI 与 `rock` tier）。
3. **AI 找掩体钩子 (#76)**：AI 须读取 `exposureProfile`/`shellBlock` 选地形；当前 `aiDecide` 仅用 LoS/距离。
4. **建筑摧毁/特效**：`destroyCover` 当前仅换 `toTier` 残骸（tree→fallen、barricade→rubble）；完整/残破建筑需碎屑 FX + `tierGroup:'structure'` 残骸链。
5. **小地图表征**：`tank_minimap.js` 须编码 liquid/ground tier（当前仅通用绘制 covers），使水潭/河流读作地形而非障碍。
6. **音效/特效**：`tank_audio.js`/`tank_fx.js` 需入水溅射、泥地迟滞声（当前无地形步进 SFX）。
7. **nodegen 模板打标**：模板须携带地形放置标签（中央水潭、沿边河流、泥环）以生成新 tier。
8. **新地形 half 曝光**：`getExposure` C 插值（`tank_cover.js:361-373`）硬编码 `tier==='half'`；残破建筑/带 half 剖面的岩石需泛化 `exposureProfile` 分发。
9. **河流连通多段字段**：见 5.3。

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

- **掩体调参（#77 解决）**：`RULES.nodeMap.coverWorldScale`（half 0.55 / full 0.58 / barricade 0.40）收敛世界尺寸——半高墙 ≈105~148px、全高 ≈153~209px、沙袋 ≈72~84px（@nodeScale=3，树维持 72px 不缩）；密度 ×1.57（总元素 120→188）；低难度 full→half 降级帽 30%（diff<0.35 窗口）、每模板前 2 个 full 免 cullRate 剔除；corridor_tutorial/forest_dense/woodland_line 三零全高模板分别补 +2/+3/+2。
- **Biome 地面层（P-36/#81 解决）**：七模板带 `biome` 标签（urban/crossfire→concrete，forest/woodland/village→meadow，corridor/mixed→steppe），调色板收口 `RULES.biomes`（取自 P-44 底色表）；`tank_battledraw.drawGround(ctx,{cam/viewBounds,biome,seed})` 确定性程序化底色+色斑（alpha≤0.12），battle 态网格前绘制，纯程序化零资产。

### 5.8 批次⑥ 落地注记（2026-08-24）

- **递增生成与击杀配额（P-38/#83 解决）**：非 Boss 节点 quota = max(初始敌数, 初始敌数 + quotaAddBase(2) + floor(effDiff×quotaDiffScale(6)))，节点结束条件改为「nodeKills ≥ quota」；`reinforcementTick(state)` 纯逻辑驱动补兵——alive < desiredAlive 且距上次 ≥ reinforceInterval(8s) 时每批生成 1~2 个（maxAlive=7 封顶）。
- 增援落点四重约束：视口 AABB 外扩 reinforceMargin(120px) 外 ∩ 世界边界内 ∩ 距玩家当前位置 ≥ aiTriggerDist×1.05 ∩ 距友军据点 ≥300px，掩体 padding 拒绝采样、rng 注入确定性。
- 增援实体化后立即 `alertEntity` 警觉并记 lastKnownPlayerPos=玩家当前位——主动推进而非蹲守；Boss 节点 quota=null 完全禁用递增生成（summons 即其机制）。

## 6. 地图元素与生成更新（本轮落地）

- **掩体尺寸与配色**：`RULES.nodeMap.coverWorldScale` 调小为 {half:0.42, full:0.42, barricade:0.32}（相对坦克更协调）；`coverTiers` 改用高对比色（建筑砖红 #b5553f、半高墙深描边 #2e2410、灌木/树提高饱和度）以区别于地表。水体新增 `draw` 分支，现已可见。
- **自然化形状**：mud 改为径向噪声凸 blob；central pond 改为 14–18 边凸 blob；建筑经 `placeVillage` 以 5–9 个小矩形松散聚成村落（部分 L 形）。碰撞核心已支持凸多边形 SAT。
- **水系与岩石通行性裁定（2026-09-13 复查落地）**：`RULES.coverTiers.water` 与 `river` 的 `passability` 统一定为 `0.0`（不可通行、实体碰撞推出硬阻断），炮弹维持 `shellBlock:false`（`mode:'pass'` 飞越不拦截）；`rock` 维持 `passability: 0` 且 `shellBlock: true`（不可通行，阻挡直射实弹）；`mud` 确定为 `passability: 0.4`（减速不挡弹）。
- **地图级路网与占位冲突重构 (#A11/P-43，2026-09 专轮落地)**：`generateNode` Phase 0 先调 `placeRoadNetwork` 生成贯穿战场的 `road` 主干道与分支，随后的模板物件/村落/树林/地形全部避让路网骨架。专轮收敛要点：
  - **密度收敛**：主干段数受模板控制，分支概率 `0.35`（旧 0.6 会「路网爆炸」）；道路条带宽恒为 `rng.range(60, 80)` 世界 px（`test-nodegen.js` 断言 60~80）。
  - **避让与优先级**：路段 OBB 经 SAT（`obbSegmentHitsAvoid`）与模板 `full` 占位盒求交，命中即弃段——**全高建筑骨架优先于路**；`full` 建筑自身不被路剔除（旧实现会把模板 `full` 吃掉）；植被层（tree/bush/rock/water 等）不参与避让，路压植被属预期。
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

### 10.1 路网重做：正交双干道（#B7，2026-09-16 用户反馈修复）
用户反馈三条：**① 道路被其他物体截断 ② 道路尽头都是圆弧形 ③ 交叉口太多、道路之间看起来像叠加在一起**。三者对应三个独立根因，逐一处理。

| 反馈 | 根因 | 修复 |
|---|---|---|
| ① 被截断 | 旧实现对模板 `full` 建筑（`avoidBoxes`）**逐链段跳段**（`obbSegmentHitsAvoid` 命中即弃该段），实测留下 **202~246px** 缺口（≈建筑尺寸） | **取消跳段**：`isSegOk` 只保留界内判定。道路属 `ground` 层、先于一切元素绘制，建筑/岩石天然盖在路面之上，跳段纯属有害。`avoidBoxes` 参数保留仅为兼容调用签名。实测链内最大接驳间距 **202–246px → 0.00px** |
| ② 圆弧尽头 | 端点内缩 `0.5*roadW + 12`px + 渲染层 `lineCap:'round'` → 完整圆弧端帽整个可见 | 端点**严格落在节点边界线上**（沿轴偏移 ±0.13），端帽被节点画布裁掉一半 = 道路延伸出画面；`bakeNodeGroundLayer` 的 `lineCap` 改 **`'butt'`**（保留 `lineJoin:'round'`）。实测孤悬路头 **0 个** |
| ③ 交叉太多/像叠加 | 端点偏移 ±0.42×半幅、控制点横向偏移 ±0.18×跨度 → 纵向"干道"斜成 139°+，与横干道以 **35° 浅角**互穿；再叠加 2~3 主干 + 35% 斜向分支 → 组间交叉 2~4 处 | 拓扑收敛为「**1 条横干道 + 0~1 条纵干道**」；端点偏移 ±0.42→**±0.13**、控制点横向偏移 ±0.18→**±0.04**×跨度；**取消斜向支线**（沿干道法向引出即与另一轴干道平行 = 叠加观感 + 地图内死头）。实测交叉恒 **≤1 个**、夹角 **35.0° → 68.8°** |

- **拓扑**：`wide = halfW >= halfH` 决定主轴——长边方向为横向干道（恒有），短边方向为纵向干道（85% 概率）——两者正交。干道端点沿轴漂移 ±0.13、控制点法向偏移 ±0.04×跨度，保持轻微自然弯曲而不产生浅角互穿。
- **回归**：`scripts/test-nodegen.js` §16——链内无断口（<1e-6）/ 无孤悬路头（必须出界或 T 形接驳）/ 交叉口 ≤1 / 交叉夹角 ≥60°，7 模板 × 8 seed。`test-nodegen-calibration.js` 重锚：全模板连通性升至 **1.000**（`forest_dense` 原 0.875 消除）、`minPassageWidth` 整体上移（corridor 2.9→4.8、woodland 2.6→5.0 量级）、`coverCoverage` 基本不变（道路不计入）。

## 11. 水域溺毙 + AI 避水（2026-09-14 落地）
- **完全浸入溺毙**：`tank_cover.js` 新增 `tankFullyInWater(tank)`——车体四个角点（hullOBB 四角世界系）**全部**落在任一 `water`/`river` 凸部分内（点-in-多边形射线法）才算完全浸入；四角之一出水即复位。主循环（`tank_mvp.html`）对每实体累计 `drownT += dt`；`drownT >= RULES.drowning.seconds(8)` → 经 `applyDamage` 沉没摧毁（玩家/敌人/Boss/友军一视同仁；结算缓冲期 `isClearing` 不累计防清场误杀）。玩家警示：`warnAt(3s)` 倒计时临界音 + 头顶 `≋ 溺毙 x.xs` 倒计时 HUD（<3s 红字）；出水 `drownT` 复位。
- **敌人也会溺毙（AI 绕水寻路）**：`tank_ai.js` 新增 `applyWaterAvoidance(t, out, ctx)`（`aiDecide` 敌方分支输出后套用）——沿 `hullAngle` 前向探 140px（`RULES.ai.waterProbeDist`）：
  - 前向入水 + 至少一侧（±0.6rad 侧探）为干地 → `turn` 转向干地侧（move 保持 = 沿岸绕行）；
  - 前向+双侧全湿 → `move=0` 停驶（防 AI 冲水自杀溺毙）；
  - 前向干地 → 原样返回（零行为漂移）。
  - 入水判定 = cover 实例的 OBB / `verts` 多边形局部点测（自包含纯函数，`ctx.covers` 注入，covers 缺失时原样返回）。水区通行由 passability 0.4 经 `getCoverUnderTank` 减速，不另行阻断。
- **update §5.4 checklist #3**：AI 读地形避水已由 `applyWaterAvoidance` 承担（绕行而非找掩体）；§6 覆盖 `shellBlock` 语义不受影响。

