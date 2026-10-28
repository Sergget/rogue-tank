# 道路与路网

> **摘要**：路网拓扑、单弓形弯参数唯一口径、可破坏楼房密度、避路判定与预烘焙。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/map.md` §10 / §13 / §19 / §26（2026-10-21 拆分）
> **相关**：[掩体体系](./cover-system.md) · [地形抽象与生成](./terrain.md) · [地面烘焙与相机](./ground-camera.md) · [沿革与未落地](./changelog.md)

## 目录
- [道路曲线化与预烘焙](#道路曲线化与预烘焙)
- [路网重做：取消跳段与路口感](#路网重做取消跳段与路口感)
- [路网 v4 七拓扑](#路网-v4-七拓扑)
- [可破坏楼房 building](#可破坏楼房-building)
- [建筑密度与 Boss 战图加成](#建筑密度与-boss-战图加成)
- [布点与修剪避路](#布点与修剪避路)
- [道路单弓形弯](#道路单弓形弯)

## 道路曲线化与预烘焙

（原 §10，2026-09-14 落地）

> *主题：道路曲线化（Catmull-Rom）/ `bakeNodeGroundLayer` 预烘焙 / 跨相重叠消解（`pruneOverlappingCovers`）*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表；路网参数唯一口径在 [道路单弓形弯 · 参数收口](#参数收口)，拓扑在 [路网 v4 七拓扑](#路网-v4-七拓扑)。*

- **道路曲线化（用户定案：曲线+直线结合）**：`placeRoadNetwork` 重写——道路控制点经 **Catmull-Rom 平滑**（`_catmullRomSample(points, step=110)`，端点 p1/p2 + 1–2 个横向抖动中点）生成曲线路径点。道路以**短 OBB 链段**写回（`_emitRoadChain`：`w = 段长 + roadW×0.35` 搭接、`h = roadW`、`tier:'road'`、同链共享 `groupId`），角度沿段方向 `atan2(dy,dx)`。
- **进入地图前预烘焙（修复"远距整段消失"）**：旧实现道路为**旋转长 OBB**，横跨大距离时被 `aabbInView` 轴对齐包围盒剔除（长段旋转后 AABB 覆盖视口外）→ 视觉上"离开一段距离整段消失"。修复分两层：
  1. 生成端改为**短链段**（每段 ~110px，AABB 与 OBB 差异极小）；
  2. 运行时 `tank_battle.html` 在 `enterBattle` 实体化节点后调 **`bakeNodeGroundLayer(node)`**——按 `groupId` 从几何中线端点自适应贪心串联，把同链段重连为完整平滑多段线，全节点预烘到一块 node 尺寸画布（`groundLayerCanvas`），分层描画路基/沥青路面/中心虚线，`draw()` 整图 blit（`drawImage`）替代逐段实时渲染，**彻底消除胶囊串联感与远距消失**。端帽 `lineCap:'butt'`（见 [路网重做](#路网重做取消跳段与路口感)）、连接 `lineJoin:'round'`。dev 随机场按钮重置画布（回退逐段绘制路径仍可用）。
- **跨相重叠消解（道路/岩石/建筑/水域/泥潭互不重叠）**：`pruneOverlappingCovers(covers)`（generateNode 尾部统一执行）——对每对元素取 **3×3 局部采样点**（66% 范围世界系），任一元素 ≥3/9 采样点落入另一方多边形/OBB 内 = 显著重叠；**优先级高者胜**（`_PRUNE_PRIORITY`：岩石 > 完整建筑 > 半高/路障 > 水/泥 > 植被；road 与同 `groupId` 链段豁免）。败者 **nudge 平移优先**（环形候选 6 环×8 向，避开其余所有元素；保住地形标签数量契约，`test-nodegen.js` 的"标签必产出"），无空位才整株移除。纯函数确定性（`_pointInPrunePoly` 局部点测，无 rng）；实际剖面见 `test-nodegen-calibration.js`。

### 路网重做：取消跳段与路口感

（原 §10.1 / §10.2，#B7，2026-09-16 用户反馈修复）

**§10.1 —— 用户反馈三条**：**① 道路被其他物体截断 ② 道路尽头都是圆弧形 ③ 交叉口太多、道路之间看起来像叠加在一起**。三者对应三个独立根因，逐一处理。

| 反馈 | 根因 | 修复 |
|---|---|---|
| ① 被截断 | 旧实现对模板 `full` 建筑（`avoidBoxes`）**逐链段跳段**（`obbSegmentHitsAvoid` 命中即弃该段），实测留下 **202~246px** 缺口（≈建筑尺寸） | **取消跳段**：`isSegOk` 只保留界内判定。道路属 `ground` 层、先于一切元素绘制，建筑/岩石天然盖在路面之上，跳段纯属有害。实测链内最大接驳间距 **202–246px → 0.00px** |
| ② 圆弧尽头 | 端点内缩 `0.5*roadW + 12`px + 渲染层 `lineCap:'round'` → 完整圆弧端帽整个可见 | 端点**严格落在节点边界线上**，端帽被节点画布裁掉一半 = 道路延伸出画面；`bakeNodeGroundLayer` 的 `lineCap` 改 **`'butt'`**（保留 `lineJoin:'round'`）。实测孤悬路头 **0 个** |
| ③ 交叉像叠加 | 端点偏移 ±0.42×半幅、控制点横向偏移 ±0.18×跨度 → 纵向"干道"斜成 139°+，与横干道以 **35° 浅角**互穿 | 端点偏移 ±0.42→**±0.13**、控制点横向偏移 ±0.18→**±0.04**×跨度；取消斜向支线。实测夹角 → 近似直角（≥60° 护栏） |

- **回归**：`scripts/test-nodegen.js` §16——链内无断口（<1e-6）/ 无孤悬路头（必须出界或 T 形接驳）/ 交叉口上界 / 交叉夹角 ≥60°，7 模板 × 8 seed。`test-nodegen-calibration.js` 剖面重锚（连通性 **1.000**）。

**§10.2 —— 用户二次反馈**：「交叉处还是没有『路口』的感觉，只是机械地叠加」「似乎所有地图都是横竖各一条公路」。

- **（a）拓扑多样化**——v1 恒为「1 横 + 0~1 纵」，即每张图都是同一个十字（实测 **70/84** 张），且 `wide = halfW >= halfH` **恒为 true**（7 个模板全为横向）→ 纵干道永远是配角、最多 1 条。v2 改为按 `rng()` 从 **6 种拓扑**抽取（**该表已被 [路网 v4 七拓扑](#路网-v4-七拓扑) 取代**：F 删除、G/I 新增、概率重排）：

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
- **（b）路口感=渲染问题，不只是几何**——v1 把每条链**各自独立描边三遍**（路基→沥青→中心虚线），后画的链整幅盖掉前一条，且两条链的中心虚线都笔直穿过交点 → 视觉上就是「两条路叠在一起」。v2 把 `bakeNodeGroundLayer` 改为**两遍绘制**：
  1. **第 1 遍**：所有链的路基（外扩 8px 暗色路缘）+ 沥青路面 —— 交叉处自然合并成一片连续沥青广场；
  2. **第 2 遍**：统一画中心虚线，随后**在每个路口处用路面同色圆挖空**（`generateNode` 新增返回 `roadJunctions`，经 `makeNode` 平移到世界系后由 `node.roadJunctions` 传入渲染层）——路面连续、**标线让位**，这才是真实交叉路口的读法。**挖空圆半径 = roadW×0.5**（2026-09-17 #C1 修复：旧 0.85×roadW 在 45° 方向越过路缘（0.6×roadW > 0.5×roadW 路半宽）→ 圆形沥青凸斑外溢路面；r=0.5×roadW 时圆内任意点到两条正交路中线距离 ≤ 0.354×roadW，恒在沥青并集内，且虚线让位区直径恰为路宽）。回归：`test-nodegen.js` §16 新增「全部路口 r ≤ 40」断言。**沿革注记（2026-10-13 #R1）**：strip 窄支路 junction 取相交链路宽的较小者——strip-branch（路宽 0.7×stripRoadW）`r=stripRoadW×0.35`、hs-secondary（路宽 0.65×stripRoadW）`r=stripRoadW×0.325`（`js/tank_nodegen.js:2603/2670`）；主干道与本节 roadW×0.5 口径不变（`test-nodegen.js` §16 只覆盖方形节点）。
- **实测数据**：210 张地图样本——拓扑分布 `HV j=1`×112 / `HVV j=2`×49 / `VV j=0`×28 / `HH j=0`×7 / `V j=0`×7 / `H j=0`×7；平均路口 1.00、**上界 2**；链内最大断口 **0.00px**；孤悬路头 **0 个**。
- **回归**：`scripts/test-nodegen.js` §16 扩到**七条护栏**——无断口 / 无孤悬路头 / 交叉 ≤2 / 夹角 ≥60° / **拓扑 ≥3 种** / 路口数分布覆盖 1 与 2 / **存在 0 路口拓扑**（防「总是有路口」这一新单调）。渲染顺序另以 mock ctx 复刻验证（路口挖空 `fill` 发生在标线 `stroke` 之后）。剖面见 `test-nodegen-calibration.js`（#B7 重锚 v2，连通性维持 1.000）。

## 路网 v3 与沿路建筑

（原 §12.3 / §12.4 / §12.5，2026-09-20 #E2/#E3；编号在原卷属 §12 掩体体系收敛，内容属路网）

- **参数收口（§12.3）**：`RULES.nodeMap.road`（旧硬编码 60~80 世界px、amp 0.04）的逐键现行值以 [参数收口](#参数收口) 为唯一口径（`widthMin/Max`、`curveAmp`、`branchCurveAmp`、`diagChance`、`diagAngleMin/Max`、`speedBonusKmh`、`speedBonusLerp` 全在表内）。
- **斜向干道（§12.3）**：新增 `DH/DV`——倾斜角 θ∈[`diagAngleMin`, `diagAngleMax`] 的横/纵干道（端点沿边界按 `tanθ × 跨度` 错开），由 `TRUNK()` 按 `diagChance` 混入六拓扑；B 十字拓扑固定「横（可斜）× 纵」以保证交点必然存在。端点沿边偏移由 ±0.13 放宽到 ±0.20。
- **公路加速（§12.3）**：`RULES.nodeMap.road.speedBonusKmh = 10`——坦克在 `tier:'road'` 条带上行驶时表速 **+10km/h**，受 `RULES.parameterLimits.maxSpeed.max`（150km/h，即 375 px/s）上限钳制；加成经 `speedBonusLerp`（现行 6）指数阻尼平顺生效（进出路面不突跳）。消费方 `js/tank_move.js` 的 `driveTank`。
  > **沿革注记（2026-10-14 #S4/#S14）**：road 为纯地面标识，2026-09-14 起被 `getCoverUnderTank` 显式跳过（零物理优化），导致 #E3 的公路加速判定 `onRoad` 恒 false、加成**从未生效**（2026-09-20~2026-10-14）。修复：`js/tank_cover.js` 新增 `getRoadUnderTank`（同款 OBB 相交 + 空间索引，仅查 road tier），`driveTank` 改走本函数判定 `onRoad`。**道路屏蔽下层减速**（#S14）：~~road 存在时 `speedModifier`/`turnModifier` 强制 1.0——压在 river/mud 上的路段不再吃 0.4 减速~~（此前 `getCoverUnderTank` 返回下层 river/mud 照常减速）。**现行口径（2026-10-20 #W17；本条按 #AA5 于 2026-10-26 更正）**：公路**只豁免液态地形（`tierGroup === 'liquid'`，即 `water`/`river`）与烂泥（`mud`）**——判据 `roadExempt` 见 `js/tank_move.js:96-105`；其余 `passability < 1` 的地形在公路上**仍照常减速**（旧「无条件归 1」会把任何新增减速通道在公路上静默清零）。2026-10-24 #AA4 起 `brakeGrip` 走**同一豁免集合**（路面上的泥/水不影响刹车）。
  > **HUD 表速增量口径（#AA1，2026-10-26）**：`roadBonus` 与 `stats.maxSpeed` **同尺度** ⇒ HUD 显示值 = `roadBonusKmh(roadBonus)` = `round(roadBonus × kmhFactor)`（`js/tank_model.js`，与 `tankKmh` 同源）；**不得**再除 `pxFactor × effMul`——那套换算只适用于像素速度 `t.speed`（见 `tankCurrentKmh`）。旧实现两处混用 ⇒ 标「+5km/h」而实机 +10km/h。
- **村镇街道同步加宽（§12.3）**：`placeVillage` 的 `roadW` 亦改读 `RULES.nodeMap.road`（消除两套硬编码）。
- **出界路段裁剪（§12.3，#S11，2026-10-15）**：strip 级出界路段原整段删除 → 轴对齐段沿地图边界精确矩形裁剪（旋转段仍丢弃）；`bridge-approach`（引道）加出界丢弃。20 seed 全量扫描出界道路 0 条。
- **建筑沿路/路口聚集 + 路口沙包（§12.4，#E3）**：新增 `placeRoadsideBuildings`（读 `RULES.nodeMap.building`）与 `placeJunctionBarricades`（读 `RULES.nodeMap.junctionBarricades`）。**参数现行值不在此复写**——`building` 组以 [建筑密度与 Boss 战图加成](#建筑密度与-boss-战图加成) 为唯一口径，`junctionBarricades` 组（`chance` / `countMin` / `countMax` / `ringMin` / `ringMax`）以 `RULES.nodeMap.junctionBarricades` 为唯一口径。
  > **沿革注记（2026-09-23，2026-10-21 校正）**：本节原文括号内列的 `roadBand 96 / junctionBias 0.9 / junctionRadius 210 / clusterPerJunction 3~5 / maxPerNode 18` 与 `chance 0.85 / countMin~Max 2~4 / ringMin~Max 0.9~1.9×路宽` 均为 **#E3（2026-09-20）落地当时值**。其中 `clusterPerJunction / maxPerNode` 已经 #I3 两次上调取代（现行 `4~8 / 28`，另加 `bossDensity`）；`roadBand`/`junctionBias`/`junctionRadius` 与 `junctionBarricades` 各组**未再改动**、当前值与 #E3 落地值相同（可直接读 `RULES`）。另 `RULES.nodeMap.road.junctionClearR`（0.85）原为**死配置**（全仓库除定义处外零消费，生成器实际以 `roadW × 0.5` 硬编码路口清空半径）——**已于 2026-09-23 A 档从 `js/tank_rules.js` 删除**，现行 `RULES` 不再含该键（见 `DEVELOPMENT.md` §4.35）。
  - **路口邻域聚集程度最高**：每个路口先在 `junctionRadius` 内环形布建筑（规模由 [建筑密度](#建筑密度与-boss-战图加成) 的 `clusterPerJunction` 决定，避让路面与路口中心）。
  - **沿路成排**：随后沿路链段采样，在路缘外侧 `roadBand` 带内成排布建筑，朝向对齐街道轴。
  - **路口沙包**：每个路口按概率生成 2~4 个 `barricade`，落在路口环外、不压路面的位置。
  - 两者在**统一消叠（`pruneOverlappingCovers`）之前**注入 → 天然参与「建筑/岩石/树/可破坏物/水域/泥潭互不重叠」消解；建筑间与建筑/既有元素间保留 30px 通行间隙（`obbHitsCover` pad）。
  - `generateNode` 新增返回 `roadW`（本节点实际路宽，供渲染/敌人生成/测试读取）。
- **难度校准重锚（§12.5）**：元素变多（沿路/路口建筑 + 沙包）使 `coverCoverage` 整体上移约 +0.005、`minPassageWidth` 进一步收窄（路口邻域建筑把通道压到 1 格 ≈40px，仍 > 车体宽 38px）；**全模板连通性维持 0.999~1.000**。基线表按实测重锚（TOL 不变：cov ±0.02 / con ±0.05 / minw ±0.5）。**（已被 [可破坏楼房](#可破坏楼房-building) 的第二次重锚取代。）**

## 路网 v4 七拓扑

（原 §13，2026-09-21 #G3/#G4；拓扑表见 §13.1）

> *主题：路网 v4 七拓扑（§13.1）/ 可破坏楼房 tier `building`（§13.2）/ 校准重锚（§13.3）/ 建筑密度与 Boss 加成（§13.4，现行）*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表；路网**参数**唯一口径在 [参数收口](#参数收口)。*

**用户反馈**：「公路现在有更多形状了，但是我期待更复杂的路网和更多的建筑等物体」。

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
- **删除旧 F「斜向丁字对」**：斜干线弯曲后与正交支道的实测交角低至 **36.9°**（`urban_block` seed6），无法稳定满足 ≥60° 护栏。斜干线观感由 B/C/E 的 `diagChance` 分支保留。
- **T 形支道改直线**：`TH`/`TV` 的构建振幅由 `branchCurveAmp`(0.10) 改为 **0**，终点沿边偏移收紧为 ±0.04。旧实现按**整条干道跨度**折算振幅百分比，而支道自身跨度只有半幅 ⇒ 同样的百分比产生大得多的局部斜率（与斜干相交时实测 36.9°，`#B7` 夹角护栏盲区）。
- **D 平行拓扑收紧**：端点错位 ±0.05 + 弯曲振幅 0.05（旧实现两端点独立抽取 ±0.62~−0.24，链自身可斜跨半区 → 两条「平行」路以 5.1° 浅角互穿，实测 `urban_block` seed2086）。
- **`diagAngleMax` 0.52 → 0.34 rad**（≈30°→19°）：斜干 × 正交支道的交角 = 90°−θ−干道链段局部斜率（弯曲引入 ≈7°）；0.42 时实测最小交角 58.2°（低于护栏），0.34 时 ≥62.5°。
- **附带修复**：林地簇（`placeForestClusters`）此前无节点边界钳制，簇区域贴边时（`village_center` 防风林 `dx=-340`）簇心随机偏移可把树推到边界外（实测 `x=-0.0099`，`test-map`「掩体在界内」失败）。现经 `opts.bounds` 做**放置后修正**（不消耗 rng、不改变采样流，同 seed 确定性不变）。

### 可破坏楼房 building

（原 §13.2 + §13.3）

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
- **密度提升（2026-09-21 #G4）**：`clusterPerJunction` 3~5 → 3~6、`maxPerNode` 18 → 20、沿路排布采样步 `segs/6` → **`segs/4`**；建筑间/建筑与既有元素的通行间隙 30 → **34px**（密度上升时保证可用通道）。**（本行参数已被 [建筑密度与 Boss 战图加成](#建筑密度与-boss-战图加成) 的 #I3 再次上调取代——现行值以该节为唯一口径。）**
- **`coverWorldScale`** 补 `building` 键（与 `full` 同尺度收敛）——现行四键值见 [掩体世界缩放唯一口径](./cover-system.md#掩体世界缩放唯一口径-coverworldscale)，本节不复写数值；补键动机见 [生成清理 · coverWorldScale 补 building](./generation-cleanup.md#coverworldscale-补-building)。
- 同步点（新增 tier 必须登记处）：`VILLAGE_SOLID`（村庄避让集合）、`_PRUNE_PRIORITY`（building: 9，与 full/intact 同级，消叠时优先保留）、`tank_map.js` 敌军建筑聚集的 `structCovers` 过滤（加入 `building`）。`full` 仍为 `Infinity`（`test-covers.js` 断言不变），`ASSET_DEFS` 不新增建筑条目（复用 full 的贴图路径）。

**校准重锚（第二次，原 §13.3）**：路网 v4（拓扑重排 + 支道改直线 + 平行收紧）+ 可破坏建筑与密度提升，使 `coverCoverage` 整体下移约 -0.002、`minPassageWidth` 因建筑密度上升而收窄；**全模板连通性维持 0.999~1.000**、开阔模板地板 ≥0.85 全部富余。基线表按实测重锚（TOL 不变：cov ±0.02 / con ±0.05 / minw ±0.5）。

### 建筑密度与 Boss 战图加成

（原 §13.4，2026-09-21 #I3，现行口径）

**用户裁定**：「继续增加地图、特别是 boss 战地图的建筑密度」。

- **参数提升**（`RULES.nodeMap.building`）：`clusterPerJunction` 3~5 → **4~8**、`maxPerNode` 18 → **28**；沿路采样数随乘子提升（`wantRoadside = round(segs/4 × den)`）。**参数键与取值以 `RULES.nodeMap.building` 为唯一口径**（`roadBand`/`roadBias`/`junctionBias`/`junctionRadius`/`clusterPerJunction`/`clusterPerJunctionMax`/`maxPerNode`/`bossDensity`）。
- **Boss 战图加成**：`bossDensity: 1.6`——`makeNode` 用纯函数 `isBossNodeIndex(index)` 提前判定 boss 节点，再经 `generateNode(opts.buildingDensity)` **或** `generateStrip(opts.buildingDensity)`（2026-10-27 起 Boss 走 strip）→ `placeRoadsideBuildings(…, density)` 放大路口簇规模/总量上限/沿路采样密度（普通节点恒 1）。
  > **沿革（2026-10-27 ~ 2026-10-28）**：Boss 节点切到 strip 生成器时**只透传了 `generateNode` 分支**，`stripOpts` 漏传 ⇒ 乘子恒按 1.0（实测同 seed 8 个竞技场 4.13 栋 vs 应为 7.13 栋）。已于 **#AB15（§4.163）** 补齐，并加「探针替换 `global.generateStrip` 断言 `opts.buildingDensity`」的导线断言防回潮。现行两条路径都透传，勿再只改一条。
- **顺带修复 #E3/#G 遗留缺陷**：`placeRoadsideBuildings` 的 `fits()` 此前对 `outCovers` 用 pad 34 判重叠，而 `outCovers` **含全部道路段**（宽 92~124px 条带）⇒ 沿路/路口建筑几乎全部被拒，函数产出恒为 0、所有密度参数空转（实测同 seed 下仅有模板自带建筑）。现行：道路按 pad 10 判定（不压路面），**非道路**元素才按 pad 34 留通行间隙；`placed` 之间仍 pad 34。
- **实测**：同模板 8-seed 结构总数 87 → 103（×1.6，`building`/`ruined` 首次实际出现）；连通性维持 **0.999~1.000**、`minPassageWidth` 仍高于可通行下限（≥1.0 格）。
- **校准重锚（第三次）**：`coverCoverage` 整体上移约 +0.015~0.021（建筑变多），基线表按实测重锚（TOL 不变），见 [可破坏楼房](#可破坏楼房-building) 内的第二次重锚段与文件内 #I3 注记。
- 回归：`scripts/test-nodegen.js` #I3 段（参数值/8-seed 聚合乘子生效/沿路建筑实际生成/`buildingDensity=1` 与缺省一致/`bossDensity` 存在）；`scripts/test-nodegen-calibration.js` 重锚通过。
- 战斗侧影响摘要见 `specs/combat.md` §12.4。

## 布点与修剪避路

（原 §19，2026-10-17 #U32，现行口径）

> *主题：掩体避路三处判定统一为 verts 精确多边形（模板物品 / prune nudge / mud↔road）*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表。*

> 关联：[跨相重叠消解](#道路曲线化与预烘焙)（pruneOverlappingCovers）、[路网 v4](#路网-v4-七拓扑)（道路连续多边形）、`js/tank_nodegen.js`。

- **问题**：cde3bc3 起道路 cover 为整链连续多边形（OBB = 整链大 bbox，实测 verts 多边形面积仅 OBB 的 ~6%），但模板物品避路（#A11 推挤）与 prune `tryNudge` 仍按 OBB 判定，且 `need ≤ 0 → pushed = true` 短路放行、`best` 选「全局最近路心」而非「实际相交的路」、nudge 落点不查 road——四因叠加，实测 60 seed ×3 scale 有 **163 处建筑/岩石/树/栅栏压在路面上**（用户反馈「房屋落在道路上」）。
- **现行判定口径（三处统一为 verts 精确多边形相交）**：
  1. **模板物品避路**（`generateNode` 主循环）：触发判定 = 物品 OBB 四角/路采样点互入/边相交三重精判（`_itemHitsRoad`，无 verts 的 road 回退 OBB pad 6）；`best` = 精判相交的路中最近一条；`need ≤ 0` 不再放行，仍走 `tryPos` verts 复验；8 向搜索距离 280→480。
  2. **prune `tryNudge` 落点避路**（`_hitsRoadPoly`）：verts 精判（采样点互入 + 边相交，`_getCached` AABB 预检），候选环 6→12。此前 60 seed ×3 scale 有 100 处：推挤/布点阶段合法的元素被 prune 挪上路面（`o.tier === 'road'` 被无条件跳过）。
  3. **mud↔road 严判**（#U26 已有）不变。
- **效果**：压路 163 → **0**；strip 密度 seed42 10.91→11.01/屏（verts 精判下不降反升——虚警剔除消失）；连通性 7 模板 ×5 难度维持 1.000。
- **基线**：校准第十一次重标定（见 `scripts/test-nodegen-calibration.js` 头注）；test-nodegen 泥斑环带断言中心修正为世界帧 (600,350)（原 W/2,H/2 是 0 原点帧假设）、村庄建筑上限 20→24。

## 道路单弓形弯

（原 §26，2026-10-19 #U45，现行口径）

> *主题：正弦/S 形根因（§26.1）/ 单弓形修法（§26.2）/ `RULES.nodeMap.road` 参数唯一口径（§26.3）/ 实测回归（§26.4）*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表；[参数收口](#参数收口) 是道路参数的唯一口径节。*

**用户反馈原文**：「修改道路生成算法，目前有些道路看起来像正弦函数，在地图内的弯太多」。

- **根因（§26.1）**：`placeRoadNetwork` → `buildFromPoints`（`js/tank_nodegen.js`）旧实现随机放 **1~2 个内部控制点**（`nCtrl = rng.int(1,2)`），每个控制点独立 `rng.range(-a,+a) × span` 横向偏移（`curveAmp=0.16`）：
  - 两个控制点**反号**时，Catmull-Rom 样条的横向偏移曲线沿跨度方向正负交替 = **S 形**（即用户所说的「像正弦函数」）；
  - 两个控制点**同号**时也是「中段两处渐变弯」，叠加端部天然反拐，观感仍是「弯太多」。
- **修法（§26.2）—— `buildFromPoints` 重做为单弓形**（弯向全程恒定、无回拐）：
  1. 只放 **1 个内部控制点**（弓顶，`t=0.5`），偏移 = `side × rng.range(0.55, 1.0) × curveAmp × span`（`side = ±1` 为弯向，0.55~1.0 保留幅度多样性）；
  2. 两端点各加一个与弓顶**同号、1/4 幅**的预弯控制点（`t=0.08/0.92`，`endOff = bowOff × 0.25`）——消除旧版「弓形两端必然反拐」的端部反向弯，使横向偏移沿跨度恒同号、单调过渡；
  3. `tan1`（G1 切线连续，单节点 weTrunk 链式口径）分支保留同样结构：切线控制点并入弓顶偏移（×0.4），后续弓点 `t=0.55, off=bowOff×0.8`。

### 参数收口

（原 §26.3，`RULES.nodeMap.road`，**全卷道路参数唯一口径**）

| 参数 | 现行值 | 说明 |
|---|---|---|
| `curveAmp` | **0.075**（旧 0.16） | 语义改为「单弓形弓顶偏移相对跨度比例」：弓顶最大横移 ≈7.5% 跨度（2100 宽节点 ≈158px ≈ 1.4 条路宽），全程只弯一次 |
| `widthMin` / `widthMax` | **92 / 124**（世界 px） | 公路加宽口径（旧硬编码 60~80）；`placeVillage` 的 `roadW` 同读本组键，消除两套硬编码 |
| `branchCurveAmp` | **已删除** | 自 #G（2026-09-21）起零消费（T 形支道固定 amp=0，唯一残留是生成器里的死变量）——按 `junctionClearR` 先例删除 |
| `diagChance` / `diagAngleMin/Max` | 0.45 / 0.18/0.34（不变） | 单弓形后端点切线即端点连线方向（无旧版端部反向弯），#B7 浅角护栏余量进一步放大 |
| D 平行 / I 双干拓扑显式振幅 | 0.05（不变） | 维持 #G 的平行收紧 |
| `speedBonusKmh` / `speedBonusLerp` | 10 / 6 | 公路加速与阻尼（见下方「公路加速」） |

- **实测与回归（§26.4）**：
  - **弯形数值验证**（9 模板 × 30 seed × scale 3，648 条道路链）：以每条链两端连线为基线，横向偏移序列的符号变化次数 **max = 0**（全部为单弓形，无 S 形）；弓顶横移封顶 7.50% 跨度；路身中段出界 0 条（两端 20% 内 ≤29px 的端帽探出属设计行为——路端点落边界线、端帽随路缘斜切被画布裁掉，[路网重做](#路网重做取消跳段与路口感) 的口径不变）。
  - `test-nodegen.js` §16 七护栏全过（无断口 / 无孤悬路头 / 交叉口 ≤2 / 最小夹角 **81.8°** / 拓扑 5 种 / 路口分布覆盖 / 0 路口拓扑存在）。
  - `test-nodegen-calibration.js` **第十三次基线重锚**：`curveAmp` 与 rng 消耗序列变化（`nCtrl` + 逐点偏移 → `side` + `bowOff`）重排路网走向 → `minPassageWidth` 为纯流位差重排（无系统性收窄，车体宽下限仍富余）；**connectivity 维持 0.9999~1.000**、cov 微幅漂移（±0.004 内）。BASE 表按实测重锚，TOL 不变（cov ±0.02 / con ±0.05 / minw ±0.5）。
  - `test-strip.js` §6c 接缝断言**修正判定盲区**：旧实现用「cover 中心距接缝 <800px」近似「横贯河应跨接缝」——纵贯（V）河链恰好从接缝旁经过时误报（该注释首行早已声明「纵贯河形不强制」，实现未兑现；#U45 路网 rng 重掷后 seed42 河形 H→V 首次踩中）。现按 groupId 聚类，仅「x 跨度 > y 跨度的横贯链且 bbox 实际覆盖接缝 x」才要求接缝 300px 内有水系。strip 河流为整链一次生成，接缝结构上不可能断链。
  - `test-replay.js`：布局重排使 seed=1 五节点回放暴露**代理玩家策略盲区**（进入接敌距离即停车，若停车点恰在建筑后死角则全程 0 开火假超时，实测玩家 120s 停在 (735,675)、最近敌 422px 恒无 LoS）。修法（`js/tank_sim.js` `_defaultPlayerPolicy`，与 `tank_ai.js` #M 失去 LoS 突进 patch 同语义）：目标已进入接敌距离但 LoS 被挡时**继续向目标开进**直至重现 LoS。修复后 seed=1 有真实交战（总开火 36 次），回放确定性断言全过。
  - 视觉抽查：`scripts/render-map-shot.js` seed=7 / seed=12 生图目视——道路均为单弓形缓弯、无正弦回拐（`tmp/road-s7.png` / `tmp/all-s12.png`）。
  - 沿革：[道路曲线化](#道路曲线化与预烘焙) 的「1–2 个横向抖动中点」、`curveAmp = 0.16`、以及第二次校准基线中的对应描述**已被本节取代**。

## 相关页面
- [掩体体系](./cover-system.md) — 道路 `tier:'road'` 的通行与挡弹语义、`building` tier 行为
- [地形抽象与生成](./terrain.md) — 路网与地形的占位消解、`verts` 局部坐标前提
- [地面烘焙与相机](./ground-camera.md) — `bakeNodeGroundLayer` 的运行时落点
- [沿革与未落地](./changelog.md) — 六拓扑时代的路网原文
