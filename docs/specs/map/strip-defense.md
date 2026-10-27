# strip 节点与防线式推进

> **摘要**：横向条带节点的设计预留与落地状态、防线式敌军推进的现行口径。
> **适用版本**：现行（2026-10-21）；§14 部分为 **设计预留（未落地，2026-09-21）**
> **源自**：`docs/specs/map.md` §14 / §15（2026-10-21 拆分）
> **相关**：[节点架构与敌军布点](./map-architecture.md) · [生存与 strip](./survival-strip.md) · [难度与地图生成重做](./difficulty.md) · [沿革与未落地](./changelog.md)

## 目录
- [落地状态（先看这里）](#落地状态先看这里)
- [strip 节点形态与尺寸](#strip-节点形态与尺寸)
- [strip 构造与工程配套](#strip-构造与工程配套)
- [strip 未落地部分](#strip-未落地部分)
- [防线式推进体系](#防线式推进体系)
- [防线参数与锚点](#防线参数与锚点)
- [推进完成条件与 Boss 循环](#推进完成条件与-boss-循环)

## 落地状态（先看这里）

原 §14 标题写「设计预留（未落地）」，但**逐子节状态不同**（2026-10-21 实测核校）：

| 子节 | 内容 | 状态 |
|---|---|---|
| §14.1 | 节点形态与尺寸 | **已落地**（尺寸由 `RULES.nodeMap.strip` 决定，与 §24 同源） |
| §14.2 | strip 构造（片拼接） | **已落地**（自 2026-10-10 #N4 接入 `makeNode` 实战） |
| §14.3 | 防线式敌人生成 | **已被 §15 取代**（见 [防线式推进体系](#防线式推进体系)） |
| §14.4 | 渲染与工程配套 | **已落地**（小地图条带 / 公路 / 补给点 / 空间分桶） |
| §14.5 | 结算与推进 | **已被 §15.10 取代**（推进式完成条件落地） |
| §14.6 | 测试重锚清单 | 部分落地（strip 专用回归已建） |
| §14.7 | 第二阶段预留 | **未落地**（设计预留） |

> **代码实测（2026-10-21）**：`makeNode` 常规节点默认走 `generateStrip`；1280×720 视口下节点 **11520×1584** ＝ 9×2.2 屏、`chunks` 3 片（§24 生存模式的 `chunkRows` 多行片只是在同一生成器上叠行，不影响结论）。故 **strip 尺寸与生成的现行值看 [生存与 strip](./survival-strip.md)（生存/multirow）与本节「片拼接构造」，不要再按「未落地」理解**。
>
> **研究依据**（file:line 诊断、探针实测数据、已实测排除的路径、分批计划）：`docs/PLAN.md` §2（**临时文档，非权威引用目标**；该研究可能随时归档，历史版本见 `docs/archive/<yyyy-mm>.md`）。

## strip 节点形态与尺寸

（原 §14.1，设计预留）

- **基准尺寸**：横向 ≈10 屏 × 纵向 ≈2.2 屏（1920×1080 ⇒ ≈19200×2400 世界 px），面积 ≈现状（5.8k×3.5k）的 2.7 倍。**不做精确数值绑定**（2026-09-21 用户裁定：按可玩性定），允许依实测通道/密度上下浮动。
- 「屏」按 zoom=1 的视口世界尺寸（`vw × vh`）计，**不**按最远缩放（`minZoom`）口径——后者把地图再放大 1.56 倍，烘焙与遍历成本同步上升。
- 玩家出生点维持左缘 `w×0.10`（[出生走廊保护](./terrain.md#地图元素与生成更新) 不变），推进方向 = `+x`。

## strip 构造与工程配套

（原 §14.2 / §14.4；均已落地）

### 片拼接构造

（原 §14.2）

- **片（chunk）** = 一个现有模板实例 —— **已落地**：`generateStrip` 每片调一次 `generateNode`（`templateId` 按难度发牌或 `templateIds` 指定），**片内 `scale` 沿用现行 `nodeScaleFor` 口径**（调用方经 `opts.scaleFor` 传入；生产传 `tank_map.nodeScaleFor`），元素世界尺寸与当前版本一致。
- **接缝净空（必需）** —— **已落地**：内部片边界 ±300px 带内移除 `structure`/`foliage`（按 `tierGroup`），保留 `ground`/`liquid`；不再有 `bridge` 豁免（桥梁体系已于 2026-10-17 #U7 删除）。
- **路网 strip 一体化（必需，2026-10-05 修订）** —— **已落地**：废弃逐片生成+接缝链式衔接（`weTrunk`/`tan1` 传递退役，`tan1` 参数保留供单节点调用）。`generateStrip` 规划 pass 预算各片 `x0`/`cw` 后，`stripRng` 一次调 `placeRoadNetwork`（虚拟模板 `{w:totalW,h:stripH}`，`{requireWETrunk:true, trunkAmp:0.03}`）；每片按 x 区间裁路网转片内帧，经 `roadOpts.externalRoads/Junctions/RoadW` 传入（片内跳过自生成，仅避让；路面由 strip 统一追加）。宽幅下拓扑曲线振幅致段出界被裁时，后处理在无路面接缝处按最近 road y 补水平直段。旧 `opts.weTrunk` 链式口径保留（单节点模式）。
- **水系 strip 一体化（必需，2026-10-05 新增）** —— **已落地**：`placeStripRivers` 每条 strip 必生成 1–2 条横向蜿蜒河流（正弦 meander，段重叠 30%），贯穿整条 strip；旧 `edgeRiver` 模板标签在 strip 模式下跳过。**路河交叉处直接保留河段**（2026-10-17 #U7 用户裁定删除桥梁体系——原「切出缺口放 `bridge`」路径已整体移除，交叉处车辆按 `river.passability=0.4` 涉水）。建筑避让（#A11）扩展至河流。river 的 `passability=0.4` 为减速通行，不阻断连通性。
- **纵向裁剪** —— **已落地**：片高 > 目标高（2.2 屏）时按中心丢弃上下边缘元素；**不做坐标压缩**。
- **密度补偿** —— **已落地**：带外元素钳制回界内（80px 边距 + OBB 重叠检测）而非直接丢弃。实测密度 ≈20/屏（≥ 现状 13/屏）。
- 验收指标（`nodeLayoutMetrics`）：连通性 ≥0.999（实测 0.9996~1.0）；「最窄通道 ≥ 车体宽 38px」操作化为**阻挡掩体按车体半宽膨胀后连通性 ≥0.999**（实测 0.9997~1.0；原始 minGap 口径对装饰性贴靠对极敏感，常规节点基线仅 1~3px，不直接采用）；`coverCoverage` 不随片数下降（待 batch 3 实战接入后复核）。连通性口径 2026-10-05 对齐游戏（阻挡 = `passability===0` 或 `shellBlock`）。

### 渲染与工程配套

（原 §14.4）

- **敌人渲染/可见范围 —— ⚠️ 原预留口径已被 2026-09-23 用户裁定作废**：原预留的 `R = max(现行屏幕相对公式, 最大 engage × 1.15)`（随难度增长、不随视口窄轴缩水）**不再实施**；可见半径口径**保持不变**（`js/tank_camera.js:119-143` 屏幕相对式），「敌人开火时看不见」改走**视野卡 + 镜头外延做强**（几何上限、已核实数值与配套约束见 `specs/combat.md` §11.5；`docs/PLAN.md` 的对应条目已于 2026-10-20 归档，现见 `docs/ARCHIVE.md` 索引）。（原注记保留追溯：拉远时的额外绘制由 `aabbInView` 兜底，弹道命中口径经 `fireCtx.hiddenByVision`（`tank_battle.html:3547`）同步。）
- **地面层分块烘焙**：`bakeNodeGroundLayer`（`tank_battle.html:3563-3696`）由「整节点单画布」改为**按片 tile 烘焙 + 视口内按需 blit**——整图口径下 12.3 屏宽 ≈223MB RGBA，最远缩放口径 ≈619MB。**（2026-10-18 #GT 起的视口锚定烘焙见 [地面烘焙与相机](./ground-camera.md)。）**
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

## strip 未落地部分

（原 §14.3 / §14.5 / §14.6 / §14.7 —— **设计预留，未落地**）

> ⚠️ 以下内容**尚未实现**，实施时以本节为准，不得据此写新代码或断言现状。§14.3 的防线式生成**已被 [防线式推进体系](#防线式推进体系) 以不同参数落地**，此处保留 2026-09-21 的设计原稿。

### 防线式敌人生成（设计原稿）

（原 §14.3 —— **已被 §15 取代**，保留作设计沿革）

- **防线（defense line）**：沿推进轴把地形锚点分桶（桶宽 1~1.5 屏），每桶 = 一条防线。
- **锚点来源**（全部为现有产出物，不引入新数据源）：`roadJunctions`（路口）、solid 结构（`full`/`intact`/`building`/`ruined`/`rock`）、liquid（`water`/`river`）、foliage 簇（`tree`/`bush` 连通块）。每线取 1~2 锚点，敌人在锚点周边成批生成（半径沿用 `RULES.nodeMap.enemySpawn.structureRadius` 口径），每批 3~6 辆。
- **难度调制**：防线数量与每线敌数随难度联动；现行 `enemyCountForDifficulty`（1~4 辆/节点）须按地图面积同比上调。
- **激活**：保留 `aiTriggerDist`（现行触发距离口径），复用 `engagePropagate`（`RULES.ai.engagePropagateRadius`/`engagePropagateChance`）实现同一防线整体响应。
- **增援**：仅允许补给玩家**前方**未清空防线（现行「视口外扩 + 距玩家 ≥ 触发距离×1.05」落点约束会把兵刷在玩家后方，横向推进下失效）。

### 结算与推进（设计原稿）

（原 §14.5 —— **已由 §15.10 落地**，保留作设计沿革）

- 节点完成条件改为**「抵达右端出口 + 防线清空/配额」双条件**，取代现行单一 `quotaDone || (noEnemies && !canReinforce)`（`tank_battle.html:3028-3036`）。
- Boss 节点形态：**2026-10-27 用户裁定改为标准 strip 生成器 + 3×3 屏**（`RULES.nodeMap.strip.boss`，1 列 × 1 行 + `fillBands` 补植），不再走方形模板竞技场；无 viewport 时回退方形路径。

### 测试重锚清单

（原 §14.6）

`scripts/test-map.js:105-109`（节点宽高 ≥3 倍视口断言）、`test-nodegen.js` §16 七条护栏、`test-nodegen-calibration.js` 基线表、`test-replay.js` 确定性 hash、`test-browser-smoke/r3/run/r4/ally/3d.cjs` 六链。横向节点需新增专用回归：拼接确定性（同 seed 同布局）/ 接缝无断口 / 最窄通道 ≥ 车体宽 / 防线锚点覆盖全部桶。

### 第二阶段预留

（原 §14.7 —— **设计预留，未落地**）

strip 生成器与防线生成器一律以「推进轴」参数表达（`advanceAxis: 'x' | 'y' | 路径`）；换竖向、蛇形或环形只换轴，生成相位与结算语义不动。

## 防线式推进体系

（原 §15，B 档①②③，2026-09-23 落地，现行口径）

> *主题：分桶与间距（§15.2）/ 锚点优先级（§15.3）/ 敌人数（§15.4）/ 兜底补满（§15.5）/ Boss 回退（§15.6）/ 增援（§15.9）/ 推进完成条件（§15.10）/ Boss 循环（§15.11）*
> *⚠️ 本节为批次章节，但 §15.2~§15.11 **仍是防线现行值**；strip 模式另有放大系数（`RULES.nodeMap.strip.defenseLine`）。*

> **现行口径**：参数唯一来源 `RULES.nodeMap.defenseLine`（`js/tank_rules.js`）；实现 `planDefenseLines` / `collectDefenseAnchors` / `pickDefenseLineAnchor`（`js/tank_map.js`），消费方 `makeNode`。本节取代旧口径「以玩家出生点为原点的全向环带撒簇」（该路径保留为 `enabled=false` 的回退，见 [Boss 节点与回退路径](#boss-节点与回退路径)）。

### 设计动机

（原 §15.1）

旧生成按难度扇区把敌人撒在玩家四周，玩家没有推进方向感。B 档改为**沿推进轴分桶的防线**：玩家从左侧出生（`w×0.10`）、Boss 生成点 `w×0.7`，故推进轴取 **+x**，敌人在每道防线的地形锚点周边成批生成。因 AI 激活受 `aiTriggerDist` 限制，玩家通常**一次只遭遇前方一条防线**，形成「推进—遭遇—清剿」节奏。

### 防线参数与锚点

（原 §15.2 / §15.3）

- **推进轴区间** = `[playerSpawn.x + max(lineMargin, minPlayerDist), w × axisTopFraction(0.92)]`。
- **间距** = `spacingScreens(0.9) × 视口宽 × lerp(spacingDiff[0]=1.15, spacingDiff[1]=0.85, diffNorm)` ⇒ **难度越高间距越窄、防线越密**。
- **防线数** = `clamp(max(linesMin, round(linesMin + (linesMax-linesMin) × diffNorm)), 1, floor(span / max(240, spacing×0.5)))`——以难度期望值为主，仅受「每桶至少 240px」的几何上限约束（若用 `round(span/spacing)` 当上限，高难度永远拿不到 `linesMax` 条）。
- 视口缺省时 `vw` 回退为 `w/3`（与 `nodeScaleFor` 保证的「节点宽 ≥ 3 屏」一致）。

**锚点来源与优先级（原 §15.3）**：`collectDefenseAnchors` 在桶内聚合四类候选，`pickDefenseLineAnchor` 按 `anchorJunctionChance(0.45)` **优先路口**，否则从其余候选随机取：

| 类别 | 来源 | kind |
|---|---|---|
| 路口 | `roadJunctions`（桶内） | `junction` |
| 结构 | tier `full` / `intact` / `building` / `rock` / `ruined` | `structure` |
| 水体 | tier `water` / `river` | `liquid` |
| 林地簇 | tier `tree` / `bush` 按 240px 网格聚合、成员 ≥3 视为一簇 | `foliage` |
| 兜底 | 桶内无候选 ⇒ 桶中心 + 纵向随机 | `fallback` |

锚点坐标钳制在节点内 `[60, w-60] × [60, h-60]`。

### 敌人数与兜底

（原 §15.4 / §15.5）

`targetCount = clamp(lineCount × anchorsPerLine × perAnchor, [enemyCountForDifficulty(diff), maxPerNode(12)])`，其中 `perAnchor = round(lerp(perAnchorMin 2, perAnchorMax 3, diffNorm))`。

- 低难度（1080p 视口）：2 条防线 × 1 锚点 × 2 辆 = **4 辆/节点**（quota 6）。
- 高难度：3 条 × 1 × 3 = **9 辆/节点**（quota 11~17）。
- **沿革**：旧口径恒为 `enemyCountForDifficulty` = 1~4 辆/节点；该函数保留为**下界**（仍由 `test-map` 独立断言）。
- **连带影响**：`quotaForDifficulty(initialCount, effDiff)` 公式未改动，故节点内击杀配额随初始敌数上升 ⇒ 单节点战斗时长较旧版上升约 1.3~1.5 倍。
- `enemyCompositionForDepth(index, diff, rng, cfg, countOverride)` 新增第 5 参以接受防线制目标数（缺省回退旧公式，向后兼容）。

**兜底补满的防线约束（原 §15.5）**：锚点周边因掩体密集/贴边放不满时，兜底网格扫描**限定在推进轴防线区间内**，并按「离最近锚点距离」升序取点（贴防线补位）。旧口径按「离玩家最远」排序，会把未放满的敌人全推到地图最右缘成一列、破坏防线结构（实测同一 x 列四个敌人）。

### Boss 节点与回退路径

（原 §15.6）

- **Boss 节点强制走旧全向环带**：其常规敌人随后即被清空，但敌簇质心仍驱动 A17 LoS 走廊 ⇒ 若改用防线锚点会连带改变 Boss 战地图（实测打破「掩体在界内」断言）。`defenseLine.enabled` 对 Boss 节点不生效。
- `RULES.nodeMap.defenseLine.enabled = false` ⇒ 全节点回退旧全向环带，`targetCount` 回到 `enemyCountForDifficulty`。
- 旧参数 `enemySpawn.structureChance / structureChanceMax / junctionChance / structRadius` **现仅服务回退路径**；防线模式下锚点抽取由 `defenseLine.anchorJunctionChance` 承担。

### 路口沙包越界修复与回归

（原 §15.7 / §15.8）

`placeJunctionBarricades`（`js/tank_nodegen.js`）原无节点边界检查，路口靠近边界且 `r` 取到 `ringMax×路宽` 时沙包会生成到节点外（实测 `run-seed` 节点 4 有三个 `barricade` 落在 `y≈1509 > 半高 720`）。现新增 `bounds` 参数（调用方传模板 w/h × scale ÷ 2），沙包含半个外接圆余量做边界拒绝。

**回归锚点（原 §15.8）**：`scripts/test-map.js`「B 档① 防线式敌人生成」段：敌军全部位于推进方向前方 / 敌数落在 `[难度基线, maxPerNode]` / 同 seed 逐字段确定性 / `targetCount` 随难度单调非降 / 高难防线数与每锚点敌数 ≥ 低难 / 锚点落在所属桶区间内 / 锚点来源合法 / 视口模式敌军不越右缘。`test-replay.js`（同 seed 摘要一致）与 `test-nodegen*.js`（元素生成）保持全绿。

### 增援与前向约束

（原 §15.9，B 档②）

- `reinforcementTick` 消费新增的 `state.defenseLines`（`makeNode` 输出的各防线 `{x0,x1}`）：候选 x 区间限定为「`x1 > playerPos.x`」的**前方防线桶**（先随机选区间、再在区间内取 x，rng 消耗序列固定 ⇒ 确定性不变）；y 仍全高随机。
- **玩家越过全部防线 ⇒ 不增援**（`frontRanges` 为空即返回空数组），避免在出口区反复刷兵。
- 原有落点约束全部保留（视口外扩 `reinforceMargin` 之外 / 距玩家 ≥ `aiTriggerDist×1.05` / 距据点 ≥ `reinforceOutpostDist` / 避 solid 掩体 60px）。因「距玩家 ≥ 触发距离」仍然生效，若前方防线可采区间已被玩家贴近到可见范围，则本次增援自然为空——符合「不刷不可见兵」原则。
- **「是否还可能增援」的判定必须与 tick 门控同源**：纯函数 `reinforcementPossible(node, playerX, kills)`（`js/tank_map.js`）——Boss / 配额已满 / 无前方防线时返回 false。battle 的 `canReinforce` 消费此函数；**不得**再按旧口径（仅 `kills < quota`）计算，否则「越过全部防线 + 清残敌 + 配额未达」会因 `linesCleared` 恒假而**永久无法完成节点**（已核实的软锁，2026-09-23 修复）。
- **回退**：`RULES.nodeMap.reinforceFrontOnly = false` 或未提供 `defenseLines` ⇒ 旧全向随机落点。

## 推进完成条件与 Boss 循环

（原 §15.10 / §15.11）

### 推进式节点完成条件

（原 §15.10，B 档③）

- 纯逻辑 `nodeClearance(state)`（`js/tank_map.js`），battle 逐帧消费：`state = { playerX, nodeW, exitX, alive, quota, kills, canReinforce, boss }`。
- **常规节点**：`done = exitReached && (linesCleared || quotaDone)`：
  - `exitReached`：`playerX ≥ exitX`（`exitX = w × RULES.nodeMap.exitZone.xFraction(0.93)`，边界含）；
  - `linesCleared`：场上无存活敌军且已无法增援；
  - `quotaDone`：`kills ≥ quota`（并列条件：抵达出口后即使有残敌也可凭配额通关）。
- **Boss 节点**：`done = 场上无敌`（沿用「Boss + summons 全灭」，不要求出口）。
- `reason` 取值：`pushing`（未到出口且仍有敌）/ `advance`（未到出口且已清空）/ `clearing`（到出口但仍在交战）/ `exit+cleared` / `exit+quota` / `boss` / `boss-cleared`；battle 据此写结算日志（「抵达出口 · 区域肃清」/「BOSS 击破」）。
- **HUD（#K2 2026-09-29 重写为显式目标卡）**：`#quotaHud` 三行——首行「目标 OBJECTIVE」；次行两个条件状态（`① 推进至出口（还差 Npx）` / `✓ 已抵达出口` ＋ `② 清空防线（配额 k/q，场上 N）` / `✓ 防线已清空`）；末行进度（`推进 % / 出口线 % / 残敌 / 待击杀`）。**沿革**：旧文案 `推进 N% → 出口 M% ｜ 配额 k/q` 信息齐但读不出**条件关系**，用户反馈「一个节点的完成目标和出口没有 UI 提示」（#K2）。
- **#K2 出口可视化（2026-09-29）**：
  - **世界层**（`tank_battle.html` 绘制循环）：`exitX` 之后的绿色出口带（`exitZone.bandWidth = 220px` 横向渐变）+ 出口竖线 + 沿线 3 枚脉动 `>>` 箭头 + `EXIT 出口` 字样；Boss 节点与结算缓冲期（`battleState.clearing`）不画。
  - **小地图**（`js/tank_minimap.js` `drawMinimap`）：出口区半透明绿带 + 出口线 + `EXIT` 标签——传 `opts.exitZone = { x }`；Boss 节点传 `null` 不画。
  - **参数**：`RULES.nodeMap.exitZone = { xFraction: 0.93, bandWidth: 220, draw: true }`；`draw = false` 时只保留 HUD 文案、不画世界标记。
- **沿革**：旧口径为「`kills ≥ quota`」单条件（P-38），与推进正交（原地刷够配额即通关）。

### Boss 循环

（原 §15.11，#K3，2026-09-29）

- **现行值**：`RULES.nodeMap.bossInterval = 3`（由 5 缩短，用户反馈「节点略长，缩短 boss 循环：5->3」）⇒ `(index+1) % 3 === 0` 的节点为 Boss：**index 2 / 5 / 8 / 11 / 14…**（沿革：interval 5 ⇒ index 4/9/14）。
- 一局初始 5 节点（`runNodeCount: 5`）内含 **1 个 Boss**（index 2）；开放式链（`extendRun`）下每 3 个节点循环一次。
- Boss 节点无配额（`quota = null`）且不生成常规敌军 ⇒ **以 Boss 战替代常规节点的配额 grind**，这是本次缩短循环缓解「节点略长」体感的机制。
- 回归锚点：`scripts/test-map.js` #K3 段（`isBossNodeIndex` 周期 2/5/14、非周期索引、12 节点内恰 4 个 Boss、`extendRun` 后周期延续）。

## 相关页面
- [节点架构与敌军布点](./map-architecture.md) — 节点链、Boss 周期、被本节取代的多向环带
- [生存与 strip](./survival-strip.md) — 生存模式复用 strip 链与多行片
- [难度与地图生成重做](./difficulty.md) — 难度曲线与 strip 尺寸的设计要求
- [沿革与未落地](./changelog.md) — §14 未落地设计的完整原文
