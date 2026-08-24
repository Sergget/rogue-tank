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

### 5.2 具体地形映射（设计值）
| 具体地形 | passability | shellBlock | exposureProfile | destructible | drawStyle | tierGroup |
|---|---|---|---|---|---|---|
| 全高掩体(建筑墙) | 1.0 | true(solid) | full | ∞ | box | structure |
| 半高掩体(矮墙) | 0.4 | grad | half | ∞ | box | cover |
| 水潭 | 0.0 | false(越飞) | none | null | water | liquid |
| 河流 | 0.0 | false(越飞) | none | null | water-chain | liquid |
| 烂泥地 | 0.35 | false | none | null | mud | ground |
| 水潭周围烂泥地 | 0.35 | false | none | null | mud | ground |
| 残破建筑 | 0.6 | grad | half | hp=1 | rubble-box | structure |
| 完整建筑 | 1.0 | true(solid) | full | ∞ | box | structure |
| 岩石 | 1.0 | true(solid) | full | ∞ | rock-poly | structure |
| 灌木 | 1.0 | false(vision) | none | null | bush | foliage |
| 树木 | 1.0 | true(tree) | full | 1→fallen | tree | foliage |

> 关键设计：(1) 水潭/河流 `shellBlock=false`（炮弹越飞、仅挡坦克）+ `passability=0`；(2) 河流为**多段连通**水体（见 5.3）；(3) 岩石/完整建筑复用 `solid`+`full` 但 `drawStyle` 走多边形；(4) 残破建筑=`graduated`+`half`+`destructible`。

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

