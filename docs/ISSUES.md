# Rogue Tank — 工程问题清单（已核实）

> **临时文档**：只存放**待处理 / 处理中**的已核实问题。每条必须有代码证据（`file:line`）与复现/触发条件；绝不收录未核实项。
> 条目**修复并验证有效后**按 `AGENTS.md` 4 步生命周期收尾：结论同步 `DEVELOPMENT.md` / `specs/` → 删除本条目 → 原文归档 `docs/archive/<yyyy-mm>.md` → 联动下一步计划。
> 已解决并归档的历史条目（#1~#26、#44、#49、#60~#101、#A1~#A28、#B1~#B11、#C1~#C4/#C6、#C5、#D1~#D5、#A9、#E1~#E13、#F1~#F6、#G1~#G9、#H1~#H5（2026-09-21 视野批次）、#H1~#H4（2026-09-30 敌军基准/布雷/技能槽批次）、#I1~#I4、#J1~#J4、#K1~#K3、#A16、#L1~#L7（2026-10-06 整车精灵对齐批次）、#M1~#M3（2026-10-08 设计器精灵绘制批次）、#L8 + #M4（2026-10-08 白底清理与炮塔参数重算）、#S8（2026-10-14 CI 校准基线第六次修正）、#S4 + #S14（2026-10-14 公路加速恢复与道路屏蔽减速）、#S9 + #S10（2026-10-14 暂停菜单商店与面板刷新）、#S3-UI（2026-10-14 Boss 血条）、#S6 + #S5（2026-10-14 副武器卡补齐与 Boss 弹种保底）、#S12 + #S1 + #S11 + #S13（2026-10-15 地图视觉四项）、#S2 + #S3（2026-10-15 AI 警觉与 Boss 行为）、#T1~#T6（2026-10-16 拉取后代码审计）、#U1~#U23（2026-10-17 用户反馈批次）、#U24~#U34（2026-10-17/18 第二轮反馈批次 + 布点避路 + 河流互斥 + 河道形态）、**#V1/#V2 + #W7~#W18 + #X1~#X7 + #Y1（2026-10-20 全量清账批次，见 §4.112）**）：见 `docs/ARCHIVE.md` 索引表。
> **2026-10-15 拉取后缺陷清理（未走 ISSUES 条目，直接落 §4 正文）**：本次发现的两个缺陷（#8 TAB 面板 `tanks` 未定义冻结主循环 / #6 上调 `entityMults` 致 `test-modifiers` 夹具失效）**发现即修复并三链验证通过**，未经 ISSUES 中转，结论直接落 `docs/DEVELOPMENT-batches-2026-10.md` §4.79 与 `specs/combat.md` §9.8/§13.4、`specs/map.md` §16。
> **编号重叠说明（2026-10-04 核实）**：`#H1~#H5` 与 `#H1~#H4` 分属**两个不同批次**（2026-09-21 视野等距批次 / 2026-09-30 敌军基准批次），编号发生重叠——与 `AGENTS.md` §2「编号不复用、跨批次延续」相悖，属历史遗留。因归档原文按纪律不可回改、且编号已被 `DEVELOPMENT.md` §4.40 与 `specs/combat.md` §13.1~§13.4 交叉引用，故**保留原编号 + 在此按日期与主题区分**（引用时须带批次日期），不再另案重编。

---

## 当前待处理问题（#AA：2026-10-24 用户反馈批次）

> **来源**：用户 2026-10-24 四项反馈（电磁炮音效 / 节点间自动提速与公路加成 / 泥潭河流与低马力滑行 / bench 榴弹炮射程）。逐条以代码证据核实：3 项确认为缺陷、1 项（机动模型）确认根因并**已于 2026-10-24 AA-d 修复归档**（原 #AA4，见 `docs/DEVELOPMENT-batches-2026-10.md` §4.130）、1 项（Boss 节点自动提极速上限）**核实不成立**（排除结论见 `docs/PLAN.md` §6.1.1）。
> 电磁炮充能音效属**新能力缺口**（specs 从未定义），不是回归 ⇒ 归 PLAN 计划，不入本表。

### #AA1 公路加成 HUD 标注「+5km/h」，实机生效 +10km/h（换算重复除了一次尺度）

- **现象**：HUD `#hudRoadBonus` 在公路上显示「公路 +5km/h」，但实际表速提升约为此值两倍。
- **核实结论**：数值链路正确，**只有 HUD 文案的换算口径错**。
  1. 配置源 `RULES.nodeMap.road.speedBonusKmh = 10`（`js/tank_rules.js:697`，注释即写「受 maxSpeed 150km/h 上限钳制」）。
  2. `js/tank_move.js:107-109` 把它换成 `bonusPx = 10 / kmhFactor(0.4) = 25`，并在 **`stats.maxSpeed` 同一尺度**上相加：`boostedMax = min(375, baseMax + t.roadBonus)`（`js/tank_move.js:113-115`），像素速度在链尾才乘 `pxFactor × effMul`（`:140`）⇒ 实际表速增益 **+10km/h**，与 `scripts/test-move.js:89-91`（断言 `roadBonus ≈ 25px/s`）和 `docs/specs/map/roads.md:72` 一致。
  3. HUD 却对已是 maxSpeed 尺度的 `roadBonus` **又除一次** `pxFactor × effMul`：`tank_battle.html:5307-5311` 的 `Math.round(roadBonus * kmhFactor / (pxFactor * effMul))` = `25 × 0.4 / 2.08 = 4.81` → 显示「+5km/h」（`Math.round`）。对照正确口径：`tankKmh = stats.maxSpeed × kmhFactor`（`js/tank_model.js:515`）；`tankCurrentKmh` 的除法只适用于**像素速度** `t.speed`（`js/tank_model.js:1142-1146`）。
- **影响**：HUD 读数与实机行为不符（文案低估一半）；数值与上限钳制无缺陷。附带效应：`roadBonus` 使 `t.speed` 可超过进度条按 `tankKmh` 折算的满格（`tank_battle.html:5302-5305` 的 `spFill` 被 clamp 到 100%），数字越过条尾 ⇒ 易被读作「极速上限被抬高」（见 #AA 排除项）。
- **状态**：待处理（修复面一行：去掉 `/ (RSp.pxFactor * RSp.effMul)`，并补断言锁 HUD 文案与 `speedBonusKmh` 同源）。

### #AA2 bench 榴弹炮曲射落点恒钉在炮口前 ≈50px，与光标无关（fireCtx 缺 `aimPoint`）

- **现象**：用户报「bench 中榴弹炮射程极短」，与正式游戏表现不同。
- **核实结论**：根因是**页面接线缺字段**，不是武器数值差异。
  1. 曲射落点优先级：`aimPointFrozen` → `ctx.aimPoint` → 兜底（`js/tank_fire.js:349-363`）；兜底把落点钉在 `shooter.x + cos(turretAngle) × minArcRange`，`minArcRange = 120`（`js/tank_fire.js:350`；`js/tank_weapons.js:27`）。
  2. 正式游戏注入 `aimPoint: mouseWorld`（`tank_battle.html:4355-4360`，注释 `:4358-4359` 写明「howitzer 分支消费 `ctx.aimPoint`」）；**bench 的 fireCtx 字面量只有 `mouseWorld`（`tank_bench.html:1072-1122`，`:1074`），没有 `aimPoint`** ⇒ 恒走兜底，`totalDist = aimDistW ≈ 120 − 炮口距(≈55~65px) ≈ 50px`。
  3. 榴弹炮**没有射程配置项**可背锅：`WEAPON_DEFAULTS.primary.howitzer` 无 `range`/`maxRange`（`js/tank_weapons.js:26-28`）；`secondary.howitzer = { range: 900 }` 只是类型占位（`:78-79`，仅 `updateSecondaryMount` 作自主开火闸门读）；`isArc` 弹不受 `maxRange` 钳制（`js/tank_fire.js:1129`；`docs/specs/combat/arc-fire.md:29` 已写「落点 = `ctx.aimPoint`」、`:47`「射程由 `totalDist` 单一口径承担」）⇒ 曲射射程 ≡ 到 `aimPoint` 的距离，缺 `aimPoint` 就等于射程塌到最小弧。
  4. 无重力弹道模型（全仓 `gravity|ballisticArc|loftAngle|flightTime` 零命中），排除「弹速/抛体参数不同」这一类猜测。
- **复现条件**：bench 页装 `weapon_secondary_howitzer` 并切到曲射 → 把鼠标移到远处 → 左键击发 → 落点仍在车体正前方且**不随光标变化**；正式游戏同卡落点跟手。
- **状态**：待处理（修复 = bench fireCtx 补 `aimPoint: mouseWorld`，一行；连带对齐清单见 `docs/PLAN.md` §6.4）。

### #AA3 bench 与正式游戏的运行时接线不一致 ⇒ 同一张卡在两侧行为不同

- **现象**：用户报「bench 中榴弹炮**等卡牌**的接入与正式游戏似乎不同」。
- **核实结论**：**卡牌应用路径本身是一致的**（bench `tank_bench.html:690/699` 与 battle 同走 `js/tank_panels_core.js` 的 `applyCardToTank`/`clearCardsFromTank`，devPanel 同源 `js/tank_devpanel.js:461/494-500`），差异全在**逐帧驱动与 fireCtx 上下文注入**。左 = battle，右 = bench：

  | 依赖 | battle | bench | 缺失后果 |
  |---|---|---|---|
  | `fireCtx.aimPoint` | `:4360` | **缺** | 曲射射程塌到 `minArcRange`（=#AA2） |
  | `fireCtx.cam` | `:4366` | **缺** | 导弹锁定距离不随视口放宽（`js/tank_weapons.js:375-380`） |
  | `updateHowitzerBurst` | `:4513-4514` | **全页零调用** | 急速射卡（`howitzer_rapid_barrage`）静默失效 |
  | `updatePrimaryFollowup` | `:4532-4533` | **缺** | 砰砰炮追发卡静默失效 |
  | `updateDrones` | `:4709` | **缺** | 无人机卡在 bench 不运作 |
  | `emitShotNoise` | `:4384-4387` | **缺** | 开火声纹告警链路不可测 |
  | `resolveHit` 包装（Boss 弱点 + 命中告警传播） | `:4393-4433` | **裸函数**（`tank_bench.html:1094`） | Boss 弱点倍率 / 群体警觉在 bench 不可测 |
  | 曲射散布圈绘制 | `:6564` | **无** | 看不到落点，#AA2 这类错位更难被发现 |

  另有一条**键位口径违规**（AGENTS.md §4 / `docs/specs/combat/abilities-secondary.md`）：bench 主循环**逐帧轮询** F（`tank_bench.html:1126` `if(input.isDown('fireSecondary')) tryBenchSecondaryFire();`，而 `isDown` 是电平读取 `js/tank_bindings.js:137-140`），`tryFireSecondary` 对 howitzer 直接转发模式开关（`js/tank_fire.js:928-931`），注释 `:926-927` 明确要求「页面层必须走原生 keydown 边沿」⇒ 按住 F 时榴弹炮曲/直模式**每帧翻转**（battle 侧已按边沿实现，`tank_battle.html:967-970`/`:978-990`）。
- **状态**：待处理（与 #AA2 同批收口；对齐清单与防回潮断言见 `docs/PLAN.md` §6.4）。

### #AA5 文档漂移：公路对地形减速的豁免口径，specs 全卷仍停留在 #S14 的「无条件归 1」

- **核实结论**：现行代码只豁免液态地形与烂泥——`roadExempt = cover.tierGroup === 'liquid' || cover.tier === 'mud'`（`js/tank_move.js:91-99`），代码注释 `:86-90` 明确记录改动理由（「原实现无条件归 1 会把所有地形减速通道在公路上静默清零……改为只豁免 river/mud，其余减速来源在公路上仍然生效」，**#W17，2026-10-20**）。但 specs 侧从未跟进：
  1. 唯一描述该机制的位置仍是旧口径——`docs/specs/map/roads.md:73` 的沿革注记写「**道路屏蔽下层减速**（#S14）：road 存在时 `speedModifier`/`turnModifier` 强制 1.0——压在 river/mud 上的路段不再吃 0.4 减速」，且**没有**「已被 #W17 取代」的注记（违反 `AGENTS.md` §2.1「被推翻的设计不静默删除、旧值以注记指向新值」）。
  2. 检索全 `docs/specs/map/` 的 `roadExempt` / 「只豁免」 / 「在路上仍」**零命中** ⇒ #W17 的收窄**从未进入 specs**，读者按文档口径实现新增 `pass<1` 地形会得到与代码相反的行为（以为路上必不吃减速）。
  3. `docs/specs/map/rivers.md:48` 只描述 river 侧豁免（该部分仍与代码一致），不能补上缺口。
- **附带（同类统计漂移，已于 2026-10-24 同批更正）**：`AGENTS.md` §3.7 原写 `npm test` 为「**47 项** Node 链」，实测 `scripts/run-tests.js` 登记 **53 项**（磁盘上 `scripts/test-*.js` 亦 53 个）⇒ 已按 `AGENTS.md` §2.1「必须实测并标日期」改为「53 项 Node 链，2026-10-24 实测」；同日 AA-d 批次新增 `scripts/test-movement-braking.js` 并登记后，**当前口径为 54 项**（2026-10-24 实测，`AGENTS.md` §3.7 已同步）。注：`docs/DEVELOPMENT.md` §4 内的 45/48 等数字属历史条目，按「只增不改」**不动**；§3 无测试项数表述，无需改。
- **状态**：待处理（按 `AGENTS.md` §2.3 三步：改 `specs/map/roads.md`「公路加速」处为现行口径 + 在旧值上留 `~~强制 1.0~~ → 只豁免 liquid/mud（2026-10-20 #W17）` 沿革注记 → 必要时对齐 `docs/specs/map.md` 兼容页该节摘要 → `node scripts/wiki-check.js`）。附带统计项已于 2026-10-24 更正完毕，不再挂在本条下。

---

**上一轮清账**：2026-10-22 一次性清空了 #Z1~#Z8 共 8 条**已核实并修复**的缺陷：设计器顶点选不中/吸附无效、Boss 简报从未入库、strip 河路无 75° 护栏、卡池 common < rare、雷场伤害半径硬编码、机炮热量三方不一致、AI 听声永不升级到交战、栅栏沙包与直线掩体需求冲突。**原文已按 4 步生命周期归档至 `docs/archive/2026-10.md`**，结论归口 `docs/DEVELOPMENT-batches-2026-10.md` **§4.119**。

> **第五批新增的一条可复用纪律**：**「文档宣称已实现」不等于已实现**——#Z2 的 `bossBriefing` 在 specs/DEVELOPMENT 里被描述得完整（含返回字段、关闭方式），但 `git log -S` 证明它从未入库，`types/globals.d.ts` 的声明又让 `tsc` 查不出来。**凡 specs 声明的纯函数，必须有对应的 Node 单测**；只有 `typeof x === "function"` 守卫的降级路径会把「缺失」伪装成「关闭」。

2026-10-20 一次性清空了本文件此前累积的全部条目：#V1/#V2（文档过期 2 项）、#W7/#W8/#W9/#W11/#W13/#W14/#W15/#W16/#W17/#W18（#W 批次 10 项）、#X1~#X7（#X 批次 7 项）、#Y1（测试链审计批次 1 项）。其中 5 项经实测判定为「文档记载与代码现状脱节」（问题早已不存在或被更早提交修掉），其余均已修复并验证。**原文已按 4 步生命周期归档至 `docs/archive/2026-10.md`**，结论归口 `docs/DEVELOPMENT-batches-2026-10.md` **§4.112** 与对应 specs 卷。

> **2026-10-20 清账批次的两条可复用验证纪律**（写入此处以免随着条目一起被归档掉）：
> 1. **新增或改动测试脚本时，`process.exitCode` 是硬性要求**——没有退出码的测试不是测试，只是会打印 ✓/✗ 的日志。`test-rework-r2/r3` 曾因缺退出码而长期假绿，掩盖了 P1 玩法缺陷（#Y1）。
> 2. **负向断言是「死键 / 字段下线」类问题的根治手段**——只测「能用」永远发现不了「拿不到」。必须断言「不存在」与「不可激活/不可授予」。

---
