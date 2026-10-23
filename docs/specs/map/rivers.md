# 河流、水域与溺毙

> **摘要**：溺毙判定与豁免、AI 避水分档、可涉水宽度上限、河流互斥与沿程宽度。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/map.md` §11 / §20 / §21（2026-10-21 拆分）
> **相关**：[地形抽象与生成](./terrain.md) · [路网](./roads.md) · [生存与 strip](./survival-strip.md) · [沿革与未落地](./changelog.md)

## 目录
- [溺毙与 AI 避水](#溺毙与-ai-避水)
- [河流可涉水化三处修复](#河流可涉水化三处修复)
- [河宽硬上限](#河宽硬上限)
- [AI 敢涉水](#ai-敢涉水)
- [strip 河流互斥](#strip-河流互斥)
- [河道形态与沿程宽度](#河道形态与沿程宽度)

## 溺毙与 AI 避水

（原 §11，2026-09-14 落地）

> *主题：完全浸入溺毙（`tankFullyInWater`）/ 豁免对象（Boss、生存准备期）/ AI 避水（`applyWaterAvoidance`，**已按 [AI 敢涉水](#ai-敢涉水) 分档**）*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表。*

- **完全浸入溺毙**：`tank_cover.js` 新增 `tankFullyInWater(tank)`——车体四个角点（hullOBB 四角世界系）**全部**落在任一 `water`/`river` 凸部分内（点-in-多边形射线法）才算完全浸入；四角之一出水即复位。主循环（`tank_battle.html`）对每实体累计 `drownT += dt`；`drownT >= RULES.drowning.seconds(8)` → 经 `applyDamage` 沉没摧毁。玩家警示：**头顶 `≋ 溺毙 x.xs` 倒计时 HUD（<3s 红字）**；出水 `drownT` 复位。**（沿革：原文还写了 `warnAt(3s)` 倒计时临界音——该配置项 2026-10-20 #W15 实测零消费，已从 `RULES.drowning` 删除，见 [死配置清理](./generation-cleanup.md#死配置清理与一处误判纠正)；HUD 计时不受影响。）**
- **适用对象与豁免（2026-10-15 用户裁定，取代原「一视同仁」口径）**：
  - **玩家 / 普通敌军 / 友军**：正常溺毙。
  - **Boss：完全免疫溺毙**（`tank_battle.html` 溺毙门控加 `!e.isBoss`）。**根因**：Boss 走位由 `updateBossBehavior` 的 `_bossMoveOverride` 直接驱动（`js/tank_boss.js`），绕过 `aiDecide` → 也就绕过了 `applyWaterAvoidance` 的探点避水；Boss 因而可能停在深水中央。此时溺毙＝关卡核心对抗白给，与设计冲突。豁免后 Boss 在深水仅**减速通行**（`passability 0.4`），不受淹死威胁。
  - **生存模式准备期**：不累计 `drownT`（`!isSurvivalPrep` 门控）——见 `specs/combat.md` §14「全场伤害关闭窗口」。
- **敌人也会溺毙（AI 绕水寻路）**：`tank_ai.js` 新增 `applyWaterAvoidance(t, out, ctx)`（`aiDecide` 敌方分支输出后套用）——沿 `hullAngle` 前向探 140px（`RULES.ai.waterProbeDist`）：
  - 前向入水 + 至少一侧（±0.6rad 侧探）为干地 → `turn` 转向干地侧（move 保持 = 沿岸绕行）；
  - 前向+双侧全湿 → `move=0` 停驶（防 AI 冲水自杀溺毙）；
  - 前向干地 → 原样返回（零行为漂移）。
  - 入水判定 = cover 实例的 OBB / `verts` 多边形局部点测（自包含纯函数，`ctx.covers` 注入，covers 缺失时原样返回）。水区通行由 passability 0.4 经 `getCoverUnderTank` 减速，不另行阻断。
  - **⚠ 上述「water / river 一视同仁」口径已被 [AI 敢涉水](#ai-敢涉水) 取代（2026-10-18 #U37）**：river 可涉水、不再触发绕行；只有 water 仍规避。
- **update §5.4 checklist #3**：AI 读地形避水已由 `applyWaterAvoidance` 承担（绕行而非找掩体）；[地形抽象 · 地图元素与生成更新](./terrain.md#地图元素与生成更新) 覆盖 `shellBlock` 语义不受影响。
- **水面渲染（#S12，2026-10-15）**：`water-chain` 去掉单根中心高光线，改为 ① 两岸暗带（深色，暗示水深）② 每段 3 条流向 streak（浅色短线，横向偏移/长度/透明度由位置 hash 确定性派生）③ 经 `performance.now()` 驱动的缓慢漂移（0.03/s，Node 生图时相位 0）。实现 `js/tank_battledraw.js`。
- **支流缝合（#S1，2026-10-15）**：H1T 支流汇入点 y 改用干流实际 segment 采样（不再用同参数正弦估算）；支流末端伸入干流内部（过中心线 `thick*0.25`），取消末端收分（原 1.0→0.55）——汇入处为水体合并而非锥形对接。实现 `js/tank_nodegen.js`。**（沿革：支流设计已于 2026-10-18 #U34 整体删除，见 [河道形态与沿程宽度](#河道形态与沿程宽度)。）**

## 河流可涉水化三处修复

（原 §11.1，2026-10-18 #U37 用户裁定，现行口径）

**用户反馈**：①「河流贴图和实际『溺毙』生效的范围不一致，有的贴图有河流但是没有减速+溺毙效果」②「河流的宽度需要限制，不能造成坦克无法涉水过河」③「敌方 AI 的避水算法造成他们也不敢涉水追击玩家」。

### 贴图与物理不一致的根因

（原 §11.1.1）

`tankFullyInWater` 开头有「道路优先」豁免（桥/路口语义）：`if (getRoadUnderTank(tank)) return false`；`driveTank` 在读 `roadCover` 时也跳过 river 的 0.4 减速。**问题出在 `getRoadUnderTank` 的「在路上」判定本身**：

- 道路 cover 自 `cde3bc3` 起是**整链连续多边形**（`w/h` 只是整链 bbox，真实形状在 `verts`）。旧实现走 `obbOverlap(tankCorners, coverCorners(cov))`——拿**整条曲折路链的凸包**做 SAT。SAT 只对凸多边形正确，对细长弯曲路链**大面积误判**。
- 实测 `main-road-d0`：bbox **1030×4645**，真实路面多边形面积只占 bbox 的 **12.3%**；距路心 **894~1109px** 的河面点被判为「在路上」。
- 后果：`tankFullyInWater` 直接返回 false ⇒ 成片河面获得溺毙免疫；`driveTank` 跳过 0.4 减速。实测河内取样点 **16.8%** 被判「在路上」，其中**车体完全碰不到那条路**的真误判占 **8.3%**。
- **现行**：带 `verts` 的路链改走**真实多边形**判定——`pointInPolygon`（射线法，与 `tankFullyInWater` 原内联实现复用为单一入口）、`coverWorldPolygon`（WeakMap 缓存，按 verts 引用 + x/y/angle 失效）、`obbIntersectsCoverPolygon`；判定链 = 车体 AABB vs 多边形 AABB 粗筛 → 四角落入多边形 → 车体边 vs 多边形边（逐边 AABB 预筛）→ 短路段退化时多边形顶点落入车体。**无 `verts` 的旧式矩形路段（`hs-secondary` / `strip-row-trunk`）仍走原 SAT，零回归。**
- 实测：真误判 **8.3% → 0%**（Lead 独立复核 360 个「判在路上」位置，车体与路面几何不相交数 = **0**）。
- **性能反而更好**：生存多行片 10.5 vs 旧 32.5 µs/次；标准 strip 8.7 vs 旧 **284.9** µs/次（旧凸包在 318 顶点链上的 SAT 极贵）。
- **`getRoadUnderTank` 的语义没变**：车体压在路面上时仍不算浸水（桥/路口）、仍屏蔽 river 减速。变的只是「什么算压在路面上」。

### 河宽硬上限

（原 §11.1.2，`RULES.drowning.wadeMaxWidth = 260`）

- **口径**：8 秒溺毙倒计时内，**最慢可用车**能以水中速度渡过的宽度。唯一配置源 `RULES.drowning.wadeMaxWidth`（含推导注释），消费方 `js/tank_nodegen.js` 的 `placeStripRivers`/`buildRiver`。
- **推导**：水中速度 = `maxSpeed × speed.pxFactor(1.6) × river.passability(0.4) × speed.effMul(1.3)`；8s 可渡 = 该速度 × 8s。
  - `hummel`（最慢，maxSpeed 40）⇒ 33.3px/s ⇒ **266px**
  - `tiger-I`（120）⇒ 99.8px/s ⇒ 799px
  - 取 **260**（比最慢车能力再留 6px 余量）。
- **实测改前**：min 325 / p50 573 / p90 756 / **max 805** ⇒ `hummel` 穿 446px 河需 **9.8s > 8s ⇒ 必溺毙**（中坦 tiger-I 5.1s 可过）。
- **实测改后**：`thick` 基准由 stripH 的 7%~15% 降到 **4%~9%**，并在 `buildRiver` 出口对每段 `h` 做 `Math.min(wadeMaxWidth, ...)` 兜底 ⇒ p50 237.7 / p90 260.0 / **max 260.0**（保留沿程宽窄变化，只削波峰）。
- **端到端验收**（5 车型 × 8 seed × 4885 河段，真实速度公式 + 逐帧物理判定）：**溺毙 0 次**；最险 `hummel` 穿最宽 260px 河，溺毙计时峰值 **5.7s / 8s，余量 2.3s**。
- **反证护栏有效**：内存版「无钳制」生成器跑同一断言 ⇒ `max=876` ⇒ 断言红。

### AI 敢涉水

（原 §11.1.3，river 与 water 分档）

- **根因**：`isWaterAt` 原把 **water 与 river 一视同仁**。但两者语义完全不同：river 是 `passability=0.4` 的**可涉水减速带**（[河宽硬上限](#河宽硬上限) 已保证任何车 8s 内可渡），water 才是会泡死的水潭。于是 AI 把可通行水域当禁区：前向探点落在河上就转向，三向全水就 `move=0` 停驶 —— **玩家过河即脱离追击**。
- **现行**：新增 `_waterHazardTier(tier)`——`water` 恒为危险；`river` 以 **`RULES.coverTiers.river.passability > 0`** 判「可涉水 ⇒ 不算危险水体」。**判据不写死 tier 名，将来改 river 语义只改 RULES。**
- **保留不变**：water 的三条既有语义全部保留（前方水潭→转向干地、潭心→`_escapeWater` 朝最近干地脱困、河+潭同场时潭生效）。
- **实测**（真·追击样本 = 纯地面基线本身 `move>0`）：被避水打断直线追击 **100% → 0%**（80~90 样本全数直线涉水穿河）。
- **⚠ 度量陷阱（防复犯）**：用 `aiDecide` 量「AI 敢不敢过河」**必须固定机动随机源**（`_maneuverSetRng(() => 0.5)`）。`_applyManeuver` 按 `Math.random` 抽 `retreat` 模式并输出 `move=-1`，与河流完全无关；不固定会量出 **21.3% 假阳性**。另外样本须筛「基线本身在前进」——AI 在交战带内沿本就会驻停，那不属避水。两条都是实测踩到的坑。

### 回归覆盖

（原 §11.1.4）

- `scripts/test-covers.js`：∩ 形路链凹口（真实路面外 254px、落在整链凸包内）→ `getRoadUnderTank` 必须 `null`（**改前红、改后绿**）；车体压路带/侧臂 → 仍判在路上（零回归）；「路带+河面」→ 道路优先不算浸入（桥语义保留）；河面离路面 254px → 恢复完全浸入判定；河宽 ≤ `wadeMaxWidth`（多 seed + 无钳制反证）。
- `scripts/test-ai.js`：河不触发规避 / 河中继续穿河 / 潭仍绕行 / 潭心脱困 / 河+潭重叠时潭生效（原「河岸偏移→固定右转」那条用的是 river，与新语义直接冲突，已按分档语义替换；water 的三条全部保留）。

## strip 河流互斥

（原 §20，2026-10-17 #U33，现行口径）

> *主题：河↔河互斥（`_riverPairClash`）/ 河↔路平行避让（`relaxAmp` + `_riverRoadClearance`）/ 物理极限弃河*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表；支流例外已于 [河道形态与沿程宽度](#河道形态与沿程宽度) 删除。*

> 关联：[路网 v4](./roads.md#路网-v4-七拓扑)、strip 一体化河流 `placeStripRivers`、`js/tank_nodegen.js`。

- **问题**：H2 双横贯 / V 多纵贯的河在蜿蜒失配时相互穿越交织（实测 40 seed **471 段对**相交），河与路平行压叠亦存在。用户口径「河流不应该交叉、干涉」。
- **现行口径**：
  1. **河↔河互斥**（`_riverPairClash`）：两河短段 OBB SAT 相交即非法（AABB 拒收必须用旋转包络半宽——段 w 沿段向，纵河段 w 即纵向，直用 w 判 dx 会漏检）。H2：重试换 Y 后仍交叉 → 弃南河保主河；V：逐条与已有河互斥，重试换 baseX 后仍交叉 → 弃后河；**relaxAmp/平移收尾后再查一次**（拉直/平移可能把河推到别的河上）。~~H1T 支流汇入干流（Y 形水体合并）为唯一设计内例外~~ —— **已被 [河道形态与沿程宽度](#河道形态与沿程宽度) 取代（2026-10-18 #U34 删除支流汇入设计，河流互斥现无任何例外）**。
  2. **河↔路平行避让**（`relaxAmp` + `_riverRoadClearance`）：压河比 >3% → 振幅 ×0.6 重建拉直（两轮，保留最低限度自然蜿蜒）；拉直后仍压路 → 整河平移远离最近平行路（间隙 24px，钳 strip 界内；**平移判定必须用 `roadCoversToSegments` 还原短段**——整链 verts 路 OBB 大 bbox 会使平移量/方向完全失真，#U32 同源教训）。`pickClearY` 的 halfWin 含振幅余量 `amp*0.5`，但安全余量收紧 80→20 防止「全带 d≥1 → pickClearY 退化为贴路选择」。
  3. **物理极限**：stripH 有限，双横干道 + 双横河四带挤不下时以「弃河」收场（河可缺失，交叉不可接受）。
- **效果**：河间非法交叉 471 → **0**（残留 3 处经逐例核实均为 H1T 设计汇入；**该例外已于 2026-10-18 随支流设计一并删除**）；河↔路平行压叠（精确口径）6 → 8 处/40 seed（量级持平，均为河缘贴路缘的虚警边缘）。
- **验证注意**：河↔路重叠的量化脚本若用「路 verts 首边角 vs 河段 angle + 路顶点入河段 OBB」口径会严重虚警（河段斜 OBB 25% 搭接肥胖 + 首边角不代表整链方向，虚报 653 段）——精确口径须用路 verts 世界多边形顶点入河段 OBB 判定。

## 河道形态与沿程宽度

（原 §21，2026-10-18 #U34，现行口径）

> *主题：支流汇入删除（单向主河）/ 沿程宽度变化（数据层 + 渲染层）*
> *⚠️ 本节为批次章节，非主题基线。现行口径见卷首页「主题页」表。*

> 关联：[strip 河流互斥](#strip-河流互斥)、`js/tank_nodegen.js placeStripRivers/buildRiver`、`js/tank_battledraw.js drawRiverChain`。

- **① 支流汇入设计整体删除**（用户裁定「删除支流汇入干流的设计」）：原 H1T 形态（横贯干流 + 短支流 Y 形汇入，含 #S1 的「支流末端伸入干流过中心线 thick×0.25」缝合）全部移除。H1 现为**单条蜿蜒主河**（振幅 0.05~0.08×stripH，略大于原干流）。理由：支流与干流的 Y 形合并本身即 #U33「河流不应该交叉、干涉」所禁止的交叉，两者口径冲突，以用户裁定为准。随支流一并移除的还有其源头收分 taperFn 与「有湖」死分支（`hasLake` 自 2026-10-05 起已是 `false` 常量）。
- **② 沿程宽度变化**（用户「优化河道随机平滑的宽度变化计算，现在看起来宽度几乎不变」）：两处都有原因，同时修：
  - **数据层 `buildRiver`**：原河宽 `h = w × taperFn(t)`，而 strip 干流/纵河均不传 taperFn ⇒ 全链等宽。现每段乘一组平滑双正弦波（低频主波振幅 22~34%、频率 1.2~2.4 周；高频微扰 6~12%、3.0~5.5 周），钳制 **0.6~1.35×**。相位/频率/振幅在同一次 `buildRiver` 调用内固定（幂等派生），段间连续无跳变；`taperFn` 保留与波相乘（调用方如需额外收分仍可用）。实测 40 seed 各河宽度极差 1.8~2.4 倍（变异系数 ≈0.2）。
  - **渲染层 `drawRiverChain`**：原实现取**段宽中位数**做单一线宽的整链描边——即使数据层有宽度波也会被抹平。现改为**可变宽多边形**：沿中心线逐段取半宽（段自身 `h/2`，即 #U24 确立的「横向 = 短轴 h」口径），3 点平滑两轮后生成左右边线并闭合填充；岸影为同一多边形外扩 `bankW=6px`。实测渲染采样宽度 250~480px 沿程变化。
- **连通性口径**：宽度波峰值会使 `test-strip` 的连通性断言在 **step=60** 粗网格下出现 4 连通切角伪影（seed99 实测 step60 0.9987 / step20 0.9999）——与 #T1 已确立的同一类采样网格伪影。该断言步长已对齐为 **step=20**（38px 通道断言本就如此）。
- **效果**：河间交叉 0（无任何例外，H1T 汇入已删除）；每张 strip 河流数 ≤4（此前 H1T 恒多一条支流）；宽度沿程变化率 cv≈0.2；`npm test` 45/45。

## 河流与道路的交叉夹角 ≥75°（2026-10-22 落地为硬约束）

**用户反馈（ISSUES #Z3）**：「道路和河流的交叉点没有做到 75°以上的夹角」。

**核实结论**：≥75° 只存在于**方形模板**的 `placeEdgeRiver`（`minCrossAngle()` 迭代，MIN_DEG=75）；**strip 路径**的 `placeStripRivers` 只有「<30° 判平行」的避让 ⇒ **30°~75° 的斜交完全不处理**。而 strip 是标准/生存模式的主路径。

**现行实现**（`js/tank_nodegen.js`）：`placeStripRivers` 末尾新增 `enforceRiverRoadCrossAngle(rivers, roadCovers, roadW, opts)`：

1. 用 `roadCoversToSegments(roadCovers, roadW)` 还原路短段，与每条河的 segments 做线段求交；
2. 交点处计算两方向的**锐角** `acute = min(d, π−d)`；
3. 违例（<75°）处理链：① 该河振幅 ×0.6 重建（最多 2 轮）→ ② 交点附近 ±400px 段沿路法向平移（每轮 30px，最多 4 轮）→ ③ 仍违例则**弃该河**（与 #U33「河可缺失、交叉不可接受」同口径）。

**纯函数导出**：`minRiverRoadCrossAngle(rivers, roadCovers, roadW)`（返回度数，供测试/审计）。审计脚本 `scripts/audit-river-road-angle.js`（40 seed × 标准/生存，EXIT≠0 即失败）。

**沿革**：本约束在 2026-10-16 §17.3 只是「设计要求」（`docs/specs/map/difficulty.md`）；2026-10-22 落地为 strip 路径的硬护栏。方形节点的 `placeEdgeRiver` 保持原实现不变。

## 相关页面
- [地形抽象与生成](./terrain.md) — 水/河 `passability` 与 `shellBlock` 的设计视图
- [路网](./roads.md) — 河↔路互斥与道路 `verts` 多边形前提
- [生存与 strip](./survival-strip.md) — `placeStripRivers` 在生存多行片下的行为
- [沿革与未落地](./changelog.md) — 支流缝合（#S1）与「水系不可通行」时代原文
