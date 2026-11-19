# 批次日志 — 2026年11月 (§4.189–)

### 4.189 2026-11-01 P2-G 守军语义 + 防线间反冲击：兜底机制落地与收口（用户裁定「防线要有守军感，防线间的敌人、事件要有点敌人反冲击的意思」+ 兜底 1+2+4 采纳）

> 现行细则归口 `specs/combat/enemy-ai.md` + `specs/combat/encounter-director.md`（本批收口注记，正式细则同步待 E 批次合并后统一走）。
> 计划与裁定链：`docs/PLAN.md` §2.8.3（含键名契约 v2、兜底裁定、判据 2026-11-01 订正版）。
> 派活契约纪律沉淀：PLAN §2.8.5「派活契约纪律」（默认值≠标定值 / 字段标类型+出处 / 判据方向对照实测 / 数值口径唯一来源）。

- **前置门探针（`tmp/measure-garrison-probe.cjs`，2026-10-31 EXIT=0）**：守军语义（删强制 `aiEngaged=true`）在玩家静止时**确定性软锁**——真因不是「无 LoS」（原案归因错误），而是**静止玩家 `camouflageDistanceMultiplier=0.625` ⇒ 有效触发距离 `enterDCamo=889×0.625=556px`（camoMul 可低至 0.3 ⇒ 267px）**，分界场景 G 加密扫描实测分界 ∈ (520,556]；玩家越龟缩越隐蔽越难被发现 = 正反馈死循环。对照组 E（开 intel 刷新）3/3 激活 ⇒ 探针有分辨力。`propagateAlert` 只救 600px 内且半径锚在**射手位置**（`js/tank_ai.js:1932`）。
- **兜底裁定（2026-11-01 用户采纳 lead 推荐）**：**1（前哨车恒接战）+ 2（超时兜底注入，标定目标 20s）+ 4（出口侧解耦）采纳；3（守军不吃 camo 折扣）不采纳**（动 §4.176 hull-down 与 HUD 暴露度同源口径，风险面大于软锁本身）。
- **键名契约 v2（含一次 Lead 自错订正）**：`RULES.encounter.garrisonMode=false`（零回归总门）/ `garrisonFallbackSeconds=0`（**默认=关闭态**；20s 是标定目标非默认——Lead 曾误把标定值写成默认值，role-systems 按「未排除不得置 true」铁律落 0 并被采纳）/ `garrisonVanguard={count:2,aheadOffsetPx:260}`（对象形态；键名采纳 role-systems 的 `garrisonVanguard` 同前缀命名族，作废 v1 的 `vanguard` 并加负向断言 `RULES.encounter.vanguard===undefined` 锁死）。**不新增封顶键**（复用 §4.187 `maxAlivePerWave`）；末波强制 0 前锋（裁定⑩）。
- **实施（三批并行，写域两两不相交）**：
  - **role-systems**（`js/tank_rules.js` + `js/tank_encounter.js` 纯增补）：三键 + 兜底四导出 `garrisonFallbackTrack`（幂等登记）/`garrisonFallbackDue`（`seconds<=0` 恒 false）/`garrisonFallbackApply`（注入 `aiEngaged`/`lastKnownPlayerPos`/`alertLevel=3`/`_threatDir`）/`garrisonAssignVanguards`（+x 前出、负偏移钳 0、末波 0、纯函数副本）。**`_threatDir` 类型裁定**：弧度角标量（`Math.atan2`，与 `alertEntity` 逐字段一致）——Lead 契约初稿误写「单位向量」，role-systems 按**代码不按措辞**执行并举证 `tank_ai.js:1917`（写）/`:1081`（当角度消费）/`:1083-1084`（对准清空），照 Lead 原文会让 `angDiff` 出 NaN 炮塔静默不转；**不调用 `alertEntity`**（保留 `reactionAlertMul` 反应延迟——计时器唤醒不该比子弹打醒更快，否则「无理由瞬间锁定」穿透隐蔽机制设计意图）。
  - **role-combat**（`tank_battle.html` 单写者）：守军分流（true 时不预写接战信息）/ 前哨车接线 / 兜底每帧消费（`simNow()` 时钟）/ `battleExitUnlocked` 尾接逃生门（三重门控：false 不解锁、兜底关不解锁、有守军未注入不解锁）。**主动堵掉两条静默绕过（本批最有价值发现）**：① intel 事件每 6s 刷方位 ⇒ `canSee = los || !!lastKnownPlayerPos` **无条件点亮守军**（「开关 true 行为 false」最阴险形态）→ `isGarrisonUnit` 跳过；② 补投队列 `assembleWaveEnemyAt` 同源强制接战 → `garrison` 标记透传。另自查兜底遍历判据过宽（会误注入前锋）→ 统一 `isGarrisonUnit`。
  - **role-verify-docs**：激活链探针（前述）+ 收口批（探针转正 + 三链 + 标定 A/B）。
- **Lead 补跑的环境限制项（沙箱 EPERM/86 边界，AGENTS §3.7）**：浏览器 encounter 链 **30 PASS 全绿**（三波全清/胜利/R 重开/失败链/终局冻结/console 0 error/零回归出生点断言）；`npm test` **79/79**（asset-pipeline 放宽后过，确证环境限制非代码失败）；batch-gate **GATE: PASS**（后台版卡死 30 分钟已 kill，前台复跑）。
- **收口验证链**：`scripts/test-p2g-wiring.js`（两探针合并转正，**89 断言**含 6 负向：末波 0 前锋/负偏移钳 0/纯函数不改入参/幂等/零回归逐字段比对——零回归段保持「抽取页面源码原文 3585~3634 行 vm 执行」强度未降级；`tmp/verify-p2g-wiring.cjs` 67/0 + `tmp/verify-p2g-regression.cjs` 20/0 原始结论）/ `scripts/test-garrison-fallback.js`（8 段 40+ 断言含 6 负向）；78→79 个 test-*.js 全部登记无孤儿；`wiki-check` broken=0 anchorBad=0。
- **标定 A/B（双向断言，harness 口径 `tmp/measure-p2g-ab.cjs`）**：

  | 组 | 配置 | 中位 | 结局 |
  |---|---|---|---|
  | A | garrison=true + fallback=20（纯守军） | **165.8s** | victory×3，0 悬挂，兜底注入 7/7/7 |
  | B | garrison=true + fallback=0 | 300s | **timeout×3（软锁复现，断言非恒真）** |
  | C | garrison=false（现状对照） | 141.6s | victory |
  | D | garrison=true + fallback=0 + 前锋2（方案1单独） | 300s | **timeout×3** |

  **D 组变量分离（关键）**：与 B 唯一差异是 `vanguardCount` 0→2 ⇒ **前哨车单独不足以破环，兜底是必需项而非冗余保险**——「20s 该不该置」的直接依据。探针文件头写明换算：fallback 为游戏秒（simNow）、每波独立计时 ⇒ waveCount×20=80s ≪ CAP 300s。
- **真局口径（`measure-encounter-real.cjs` ×3，garrisonMode=false 零回归路径）**：50.5s / 62.0s / 33.5s，中位 **50.5s**，**3 局全部 player-dead（战死）而非 timeout（悬挂）** ⇒ 守军/前锋在关闭态行为正常、节点能正常打完，真局无软锁病态。**口径注记**：§4.180 的 91s 基线为当日环境所测，本轮同口径 33~62s 与其同量级；A 组 165.8s 为 **harness 口径**（无卡牌/商店/真血量），**不等价真局数字**，正式标定待 `garrisonMode=true` 真局 A/B（归 E 批次合并校准）。
- **规划同步**：防线 → 防御点（A 取代/B 按点/C 生成顺序反转，用户 2026-11-01 三项裁定）落 `PLAN §2.8.5`（E1/E2/E3 分批 + `#AC2` 护栏同批重写硬约束）；E1 可行性探针 `tmp/probe-defense-points.cjs` 结论**有条件可行**（几何前提成立/收尾链不动点/可达性 0 退化），实施条件 C1（road 定稿后再跑一次 `clearCoversOnRoads`，先例 `tank_map.js:990-995`）/ C2（**反转后 `kind` 语义 100% 丢失**（600/600 `open`），D3 主题化输入受影响，待用户三选一）/ C3（`clearCoversOnWater` 末端不动）。
- **当前 RULES 落盘态（零回归保持）**：`garrisonMode=false` / `garrisonFallbackSeconds=0` / `garrisonVanguard={count:2,aheadOffsetPx:260}`。**`garrisonFallbackSeconds` 0→20 的置值与 `garrisonMode` 默认启用属用户裁定**——机器判据已齐（双向断言成立 + D 组必需性证明），但「守军+兜底比现状慢 ~17%（harness 口径 165.8 vs 141.6）是特性还是退化」需实机体感判读，默认值纪律 = 零回归态优先。

### 4.190 2026-11-01 防线 → 防御点：E1 选址原语 + E3 生成顺序反转 + #AC2 护栏同批重写（用户裁定 A 取代 / B 按点 / C 反转 + [C2] 选项 2「C 优先 + kind 回填」）

> 计划与事实基线：`docs/PLAN.md` §2.8.5（含 [C2] 裁定与派活契约纪律）。可行性探针 `tmp/probe-defense-points.cjs`（§4.189 规划同步段）。**E2（页面波次按点契约切换）未做**，串行在本批之后（`tank_battle.html` 单写者）。
> 写域：`role-mapgen-e3` · `js/tank_rules.js`（只加不改）+ `js/tank_map.js` + `js/tank_nodegen.js` + `scripts/`；verifier = Lead（全量链复跑 + 断言强度抽查）。

- **RULES**：新增 `RULES.nodeMap.defensePoints`（**enabled:false 零回归开关** + 12 参数，含 `openRatioMax`），只加不改，不碰 `RULES.encounter.*`。
- **`planDefensePoints`（E1）**：纯几何选址（签名无 covers = 类型级独立），产出 `node.defensePoints` 持久化；同 seed 逐字节复现、点数随难度单调 4→5→6；`encounterAnchors`/`defenseLines` 兼容产出到 E2（false 路径走现行 `planDefenseLines` 一字不差——**零回归指纹 16/16**：covers/enemies/anchors/rngState 逐字段入 hash，挂墙夹具与浏览器同构）。
- **#AC2 护栏同批重写（硬门）**：`scripts/test-exit-reachability.js` 双分支判据——false 读 `encounterAnchors`（现行）/ true 读 `defensePoints`；**72 节点 × 三档 0 不可达** + `isReachableFromSpawn` 交叉 8/8（加格点自由化防假分歧）+ 横贯全高 `rock` 必红；③b 段锁 points 数据契约。规模从 40 扩到 ≥60 门槛（E1 探针遗留项闭合）。
- **E3 本体（生成顺序反转）**：`placeDefenseWalls` 的 `anchorXs` 升级 `number | {x,y}` 双形态（同 rng 流对拍逐字节等价），点驱动工事取代「线中心」；**C1**：点驱动墙追加后二次收尾 `clearCoversOnRoads` moved=20（对比式，非「不抛错」弱绿；收尾不动点 16/16 双路径同判据）；**C3**：`clearCoversOnWater` 末端原位未动（`tank_nodegen.js:5025`）。
- **[C2] kind 回填（选项 2）**：`backfillDefensePointKinds`——covers 生成完后 150px 就近回填 junction/structure/foliage（只补标签点不动，无命中保 `open`）；**双向非恒真断言**：正常图聚合 open 81.9% ≤ `openRatioMax:0.85`（④c）+ 人为清空候选池 ⇒ filled=0 / open 100% ⇒ 同款判据必红（④e）。**定标纠错**：`openRatioMax` 起判 0.6 会被现行吸附路径（聚合 open 77.4%）误杀 ⇒ 按实测定标 0.85，注释写明依据——「判据方向对照实测」纪律的执行样本。单节点最差 open 95%（steppe/snow 稀疏 biome 合法态）⇒ 判据取聚合口径。
- **验证链（Lead 复核）**：`npm run check` EXIT=0 / **`npm test` 80 通过 0 失败**（249.8s，含 `test-defense-points.js` 37 断言 + ert 双分支；后台首跑子进程挂起已 kill，前台复跑出真结论）/ `wiki-check` 全 0。断言 ≈49 条含 ≥6 负向（≥4 计划值达标）。
- **风险披露（3 条，均实证）**：① `linesWanted` 受 `defenseWalls.linesMax=2` 钳制——现行路径同样被钳，非本批引入；② 回填率 81.9% 与现行 77.4% 同量级，D3 若需更高须扩候选池（D3 批事项）；③ points 态可达性 0/72 是双分支判据下的实测，E2 接线后仍须真局复验。
- **不变量**：最窄通道 560px / 河宽 162.8 ≤ 260 / 压路零退化（`test-modes`/`test-nodegen`/`test-strip` 全绿）。
- **下一步**：E2（`tank_battle.html` 波次按点契约切换）已解锁；D3「防线主题化」语义随防御点 + kind 回填自动迁移（输入保留），纵深参数在 E2 后一次性校准。

### 4.191 2026-11-01 E2.1 刷脸修正：首个防御点选址下限 ≥ 镜头最大范围（用户实机反馈「防线敌人还是刷在脸上」+ 方案 B 用户裁定「可」）

> 计划归口：`docs/PLAN.md` §2.8.5 E2.1 条目（根因分析 + A/B 方案，A 落位侧因与守军语义冲突被否决）。写域：`role-mapgen-e21` · `js/tank_rules.js`（只加不改）+ `js/tank_map.js`（仅 points 分支）+ `scripts/test-defense-points.js`；verifier = Lead（双链实跑 + 负向断言抽查）。
> 并行合规：与 E2（`role-combat-e2`，`tank_battle.html` 单写者）写域不相交，同窗并行。

- **根因（数据坐实）**：改前直调实测首点 dx=**1534px（0.96 屏）**< 拉远极限世界半宽 2000px（1.25 屏）——防线/防御点锚点本身在视口内，守军语义下敌人「在工事上凭空出现」。落位侧修不了（A 方案与「守军已在工事里」冲突），修选址。
- **改动（3 文件）**：① `RULES.nodeMap.defensePoints.spawnClearanceScreens=1.25`（[PLACEHOLDER]，数值源 = `vw/2/minZoom(0.8)=0.625vw × 鼠标外延+走位余量 ≈1.25 屏`，引用 `RULES.camera` 现值零新数值）；② `planDefensePoints` margin 三元 max 加 clearancePx（`max(300, minPlayerDist, 1.25×vw)`，**仅 points 分支，`planDefenseLines` false 路径一字未改**）；③ `test-defense-points.js` ⑨ 节 7 条断言（正向三档难度 + makeNode 实图 12/12 节点；**负向 ⑨d/⑨e**：clearance=0 退回旧下限 600px、5/30 点跌破判据线 ⇒ ⑨a 判据非恒真；⑨f/⑨g 同 seed 对拍键值真实参与选址）。
- **效果（makeNode 实图 24 节点）**：首点 dx **2981~3226px 全部 ≥2000px 判据线**（改前 1981~2204 部分裸奔）；相邻点间距 1961~2452（avg 2172）；**点数量级 4~6 未下探**（span≈11760px 放得下，连带约束风险未触发）；targetCount 未动（test-map 防线敌数断言全绿）；可达性双分支 72+72 节点 unreachable=0（持平——首段本就无贯穿阻断，非改善项）。
- **验证（Lead 复核）**：`test-defense-points.js` **44/44**（原 30 + 新 14）/ `test-exit-reachability.js` 双分支全绿（分歧 0）/ `npm run check` EXIT=0 / `npm test` **80/80**（221.9s）。夹具 w 5600→14400 仅动 ②/⑨ 节（真实 encounter = strip 9 屏 × vw1600；1.25 屏净空下 3.5 屏合成夹具放不下 linesMin=4，属实机不存在场景，头注释注明）；⑧ 节 placeDefenseWalls 对拍仍留小夹具不受影响。16/16 指纹零漂移（false 路径零回归）。
- **已披露边界**：`pointMargin=300` 被 1.25 屏净空覆盖（max 语义大者生效——方案 B 本意）；enabled=true 全难度谱扫描未跑（直调证据 ⑨b 覆盖三档）；改前基线探针留存 `tmp/probe-e21-baseline.js`。

### 4.192 2026-11-01 E2 页面波次契约切换：组 = 一个防御点（B 裁定「逐个拔点」正式落地）

> 计划归口：`docs/PLAN.md` §2.8.5。写域：`role-combat-e2` · `tank_battle.html`（单写者）+ `scripts/run-tests.js`（登记）+ `scripts/test-e2-defense-point-waves.js`（新增）；verifier = Lead（双链实跑 + 负向断言抽查）。
> 前置：E1/E3（§4.190）/ E2.1（§4.191）已收口——`node.defensePoints` 已持久化、首个防御点已 ≥ 镜头净空。

- **切换面**：`tank_battle.html` 9 处 `encounterAnchors` 消费全部切双入口（`encDefensePointsEnabled` + `encAnchorGroupsForNode`）——enabled=true 门内读 `defensePoints`（按「x 变化切组」取组数），false 走原文一字不差。波数=防御点数（实测 4~5）；波 0 落位 x 命中点 0（±240px 含纵深 160）；`lineXs`=点 x 升序；label「第 N 防御点」。
- **契约纠错 1 条（派活纪律 #2 执行样本）**：Lead 任务书写「改读 `node.defensePoints.length`」——按字面执行会把波数算成 20~30（**defensePoints 是扁平数组**：每点 `spotsPerPoint=5` 个纵向点位共享同 x，`js/tank_map.js:394-413`；`test-defense-points.js:81/333` 已锁）。实现方按「x 变化切组」达成 DONE 语义（波数=点数），并加 **N6 负向断言**（波数 ≠ defensePoints.length ×12 节点）防回潮。
- **零回归**：改前冻结基线（`tmp/probe-e2-baseline.cjs` vm 原文执行改前派生块双快照）→ false 模式派生 12 节点 JSON 逐字节一致 + 落位 24 案例 sha256 一致；**115 断言**含 ≥5 类负向（N2 points 播报不含「道防线」/ N4 false 日志不含「防御点」/ N5 落位距本点近于他点 ×12 / N6 扁平数组陷阱 ×12 / 探针原文保留）。
- **P2-G 全链回归保护**：`test-p2g-wiring.js` **89 断言全绿**（守军/前锋/兜底只换锚点来源，分流块一行语义未动）；预算分摊探针实测 points 波数 4~5 ⇒ `nodeBudget=min(24, waveCount×6)=24` 恒成立、`maxAlivePerWave=4` 分批闸不变 ⇒ 同屏红线未破。
- **验证（Lead 复核）**：`test-e2-defense-point-waves.js` **115/0** / `test-p2g-wiring.js` **89/0** / `test-encounter` / `test-map` / `test-exit-reachability` 双分支全绿 / `npm run check` EXIT=0 / `npm test` **81/0**（231s）/ **浏览器 encounter 链 25 PASS 实跑通过**（实施方 danger-full-access 自跑，三波→victory→R 重开→defeat 全链，0 console error，无需 Lead 补跑）。
- **事实披露**：points 模式下 `encounterAnchors` 兼容层与 `defensePoints` 分组同构（E1 已组装组=防御点，`tank_map.js:796-814`）⇒ false/points 的波数/lineXs/落位数值同 seed 相同，可区分证据面 = 文案 label/log + 数据来源字段——E1 兼容层「切换零行为差、语义升级」设计的预期形态。
- **遗留**：① points 态真局节奏（逐个拔点手感）未经人肉试玩——归 `measure-encounter` 校准批；② `test-qa.js` 形态门教训入账：测试文件必须字面量 require（拼路径判错）；③ 12 辆同屏压测为下一批（用户裁定规模：8 敌 + 2 友 + 1 玩家 + 1 余量，口径切换前测会作废——现已就位）。

### 4.193 2026-11-01 bench 两按钮下线 + 「调用了但没加载」同源核查（用户要求「移除 bench 的随机生成战场 / 重置」+「检查 bench 和 battle 共有的功能是否接到了同样的功能模块」）

> 计划归口：无 PLAN 条目（用户当轮直接指令，属单页清理 + 缺陷修复，不排期）。写域（单写者）：`tank_bench.html`（Lead 直接持有）+ `scripts/test-bench-parity.js`（断言扩写）+ `docs/specs/combat/abilities-secondary.md` / `docs/specs/editor/devpanel.md`（口径订正）。验证 = Lead 三链实跑。

#### ① 移除两个按钮（用户指令，非缺陷）

- **删除面**：`#genNodeBtn`（随机生成战场 GENERATE）与 `#resetBtn`（重置 RESET）的 DOM 节点 + 两条 `addEventListener` 接线（原 `tank_bench.html:554-568`）。
- **连带删除**：`logClear()`（唯一调用点是重置处理器）；`js/tank_nodegen.js` 的 script 标签（`generateNode` 是 bench 内该模块的**唯一**消费点，删除后加载即空转——已实测 bench 无 `generateStrip` / `pickTemplate` / `createRNG` / `NODE_TEMPLATES` 等其它导出调用）。
- **能力变化（显式披露，不是静默缩水）**：初始战场仍由 `js/tank_cover.js:16` 的全局默认 `covers` 表提供（启动即有靶场元素）；删除后 bench **不再有**「换一张随机战场」与「还原被摧毁掩体」两个入口——掩体被破坏后无法在页内恢复，只能刷新页面。靶车满血 / 清场 / 清空卡牌仍可用（`#applyHpBtn` + devPanel 开关 Tab 三按钮）。
- **未受影响**：`resetEntity` / `resetCovers` 在共享层与测试链的其它消费方不变（`tank_battle.html:6015` 的 `devReset` 仍调用 `resetCovers()`）。

#### ② 同源核查：查出 4 类「接了点但模块没加载」的漏接线（本轮主要产出）

**结论先说**：bench 与 battle 共有的功能**没有**全部接到同一批功能模块。核查方法不是看源码像不像，而是把两页的 `<script src="js/…">` 清单做差集，再逐个确认「页面调用的函数」是否由已加载模块定义（`tmp/check-global-names.cjs` 在 vm 中按页面脚本顺序真跑，读 `typeof`）。

| 差异面 | 改前事实 | 后果 |
|---|---|---|
| `js/tank_weapons.js` | bench **未加载**；该模块定义 `updateSecondaryWeapon` / `updateMissileLock` / `updateRocketBurst` / `fireActiveSecondary` / `toggleHowitzer` / `isHowitzerMode` / `WEAPON_DEFAULTS` | `tryFireSecondary` 取不到 `fireActiveSecondary` 直接 `return false`（`js/tank_fire.js:1010`）⇒ **连续击发类副武器（mortar / rocket / missile_wire）在 bench 从未真正开过火**；导弹逐帧锁定的 `typeof` 守卫恒跳过；曲射散布圈恒走硬编码兜底 `4.0` |
| `js/tank_drone.js` | bench **未加载**；定义 `updateDrones` / `clearDrones` / `spawnDrone` | 主循环的 `updateDrones(dt, {player, entities})` 恒被 typeof 守卫跳过 |
| `js/tank_boss.js` | bench **未加载**；定义 `isWeakspotHit` | bench `resolveHit` 包装里已写好的 Boss 弱点层**永不生效**（注释声称「接入 Boss 即可用」不成立） |
| `updateReactiveArmorRearm` | bench 按此名调用，但该名**只是 `js/tank_cards.js` 的 `module.exports` 别名**，浏览器经典脚本环境没有这个全局（实测两页均 `undefined`）；battle 用的是 `updateEmergencyShieldRearm` | bench 该行从落地起恒被守卫跳过；battle 侧未调用旧名故不受影响 |

**为什么四轮没被发现**：`scripts/test-bench-parity.js` 原有 30 条断言**全部是源码形状匹配**（「bench 里有这行调用」「有这几个守卫」），没有任何一条检查「定义该函数的模块是否被加载」⇒ 断言全绿而功能全废。这与 `#AA3` 自己写下的结论「接线缺失经 `typeof` 守卫会把『拿不到』伪装成『已关闭』」是同一类错误的复现。

**修复**：① bench 补载三模块（次序与 battle 对齐：`tank_weapons` 先于 `cards`、`tank_boss` 在 `cards` 之后、`tank_drone` 在 `abilities` 之后）；② `updateReactiveArmorRearm` → `updateEmergencyShieldRearm`（改回与 battle 同源，非新增机制）。
**补载前的安全前置**：先跑 `tmp/check-global-collisions.cjs` 检查顶层声明撞车——浏览器经典脚本共享 global lexical scope，`const`/`let` 重名会直接 SyntaxError 打废整页。实测**致命冲突 0**；覆盖型重名 2 处（`_d` 与 `_hostile`，`tank_drone.js` 覆盖 `tank_shield.js` / `tank_strike.js`），两组函数体**逐字符相同**，覆盖无害。

#### ③ 判据加固（防回潮）

`scripts/test-bench-parity.js` 新增 **段③ 共 18 条断言**（实测总数 30 → **48**，逐条 `✓` 计数；含 12 条主判据 + 1 条负向反例 + 3 条回归锁 + 2 条旧名断言）：
- **主判据**：`DRIVER_HOME` 表登记「函数名 → 定义它的模块」，凡 bench 里出现 `fn(` 调用，该模块必须在 bench 的 script 清单内（12 条随现有调用触发）。
- **负向反例**：`!benchScripts.has('tank_minimap.js')` —— 证明判据不是恒真。
- **三条回归锁**：显式锁死 `tank_weapons` / `tank_drone` / `tank_boss` 必须在 bench 加载。
- **旧名负向**：bench 不得再调用 `updateReactiveArmorRearm(`，且必须调用 `updateEmergencyShieldRearm(`（先剥 HTML 注释与行注释，防注释误判）。
- **变异测试（已执行并回滚）**：临时移除 `tank_weapons.js` 一行 ⇒ **5 条断言变红**（4 条主判据 + 1 条回归锁），证明判据有分辨力；随后回滚并复验全绿、无 `MUTATION` 残留、脚本数回到 33。

#### ④ 验证

- `npm run check` **EXIT=0**（`All checks passed.` + `tsc --noEmit` 无输出）。
- `npm test` **80 通过 / 1 失败**——唯一失败项 `scripts/test-asset-pipeline.js` 的 3 条失败**全部是「退出码 null」**（`spawnSync` 捕获管道被 workspace-write 沙箱拒绝），已按 `AGENTS.md` §3.7 用原文核实为环境限制，非断言不成立。
- `node scripts/wiki-check.js`：`broken=0 anchors=966 anchorBad=0 struct=0 template=0`，全部通过。
- bench 专项：`test-bench-parity`（**48/0**，含变异验证）/ `test-bench-tools`（19/0）/ `test-pick` / `test-ui-tokens` 全绿。
- 可达性复核：`tmp/check-global-names.cjs` 改前 11 项 `undefined` → 改后**全部 `function`/`object`**，与 battle 逐项一致。

#### ⑤ 未修的已知边界与遗留

1. **bench 仍无法实测无人机**：`deployDronesFromCards` 只定义在 `tank_battle.html:4312`，bench 无等价实现 ⇒ 无人机卡应用后只留 `cardEffects`、不产出实体，补载后 `updateDrones` 仍可能在驱动空数组。补载只解决「键集与实现同源」，**不宣称** bench 已能实测无人机。
2. **浏览器链未跑**：本会话沙箱禁 `spawn` 命名管道（`spawn EPERM`，`scripts/lib/browser-launch.cjs` 已固定返回 INCONCLUSIVE/86）。补载三模块的**运行时冒烟**（页面能正常加载、无 console error）需在放开权限的环境补跑 `npm run test:browser` 的 r3 / smoke 两链。
3. **bench 图例仍有过期项**（本轮未动）：`#solutionPanel` 图例首行写「半高掩体 — 中坦车体近乎全藏，重坦仍半露」，而 `RULES.coverTiers` 自 2026-09-20 #E3 起已无 `half` tier（`RULES.heights.cover` 为 `undefined`）。属「测试台教一个不存在的掩体类型」，建议单独立项修。
4. **`tank_ai.js:1348` 的无效分支**（本轮未动）：`if(!c || (c.tier !== 'full' && c.tier !== 'half')) continue;` —— `half` 永不存在，第二条件恒假。行为正确（等价只认 `full`），属可清理的无效分支，需配断言防回潮。

#### ⑥ 文档联动

- `docs/specs/combat/abilities-secondary.md` §「开关类副武器的 F 边沿口径」：原文「bench 与 battle 完全对齐」**在 2026-10-26 ~ 2026-11-01 期间是错的**，已按 `WIKI-STYLE` 加 2026-11-01 订正（保留原文不删 + 写明根因、现行口径、未修边界）。
- `docs/specs/editor/devpanel.md` §devPanel 四 Tab 表：原文「随机生成战场 / 重置 后两项为 2026-09-19 从 bench 对齐」**措辞不成立**（该两项由 `genResetRow` 按 `onGenNode`/`onReset` 条件渲染，bench 从未传入）——已订正并注明 bench 页面按钮同日删除。

### 4.194 2026-11-01 12 辆同屏压测：S1 战斗场景 8 敌 PASS（边际成本 ≈0）+ 齐射塌陷与实体数正交（结构性发现：battle 页无 governor 接线）

> 用户需求：「同时生成的敌人数量不少于 8 个，但是目前似乎性能很成问题」→ Lead 裁定先测再调（规模 8 敌 + 2 友 + 1 玩家 + 1 余量 = 12）。写域：`role-verify-docs-perf` · 仅 `tmp/` 探针（零生产文件改动）。数据：`tmp/probe-12tank-results.json`（21 cell）+ `tmp/probe-12tank-perf.cjs` + 双日志。
> 方法：真渲染管线（Edge 无头真 GPU，seed=20261101，node0=encounter）、非齐射=左键持续+真实装填节律、预热 2.5s 丢弃、采样 ≥600 帧且 ≥8s、排干 reserve drip 后构造人口、S1@high 复跑方差 ±0.09ms、S2d 对照排除归因悖论。
> 编号注记：本条预分配 §4.193 时该号被并行批次（bench 清理，上条）占用 ⇒ 顺延 §4.194（PLAN/批次编号只增不回改纪律）。

- **S1 战斗压力（8 敌+2 友+1 玩家=11 实体）全层 PASS**：1080p EMA **16.62ms** / p99 31.7 / 59.6fps / 降档 0；720p EMA 16.66 / p99 27.3。**4→8 敌边际成本 ≈0**（EMA Δ −0.12~+0.08ms，p99 +5.6~9.7ms）；4→6 +0.14~1.16ms。掉帧形态：p99 毛刺不连续（p50 贴 16.7）。
- **S2 齐射窗口 4/6/8/9 敌全部 FAIL（正交发现）**：EMA 24.6~92.7 / upd-p95 27.9~120ms（瓶颈在 update 侧，draw-p95 仅 10~12ms）/ 粒子峰 **1194~1197 贴 `FX_MAX_PARTICLES=1200` 硬顶** / 炮弹峰 43~92。**S2d（4 敌齐射 = 现行口径规模）同样 FAIL**（720p EMA 24.64 / 1080p 28.30）⇒ 齐射塌陷与 `maxAlivePerWave` **正交**——机械套「S2 FAIL ⇒ 不抬」会得出「现行 4 敌也应回退」的悖论，已排除。
- **结构性事实（比压测本身更值钱的发现）**：① **`tank_battle.html` 无 governor/`?tier=` 接线**（grep `getTierConfig|resolutionScale|governor` 零命中——§4.156 三档降级只在 `tank_3d.html`，正式战斗页裸奔）；压测的「三档」用各档实际渲染分辨率做视口代理（1920×1080 / 1632×918 / 1344×756）+ 页面内复刻 `updateGovernor` 喂真实 rAF delta 作压力指示器；② **battle 页粒子无档位预算**，只有 1200 全局顶——齐射即贴顶。
- **判读（数据支持）**：**a 成立——`maxAlivePerWave` 可抬 8**（战斗场景证据充分）；**齐射窗口 FX/炮弹预算单列独立治理**（现行 4 敌已塌，不在抬限裁定范围内）。1080p 目标机复测保留建议：本宿主 control@1080p EMA 16.74 贴线（判据边缘机），720p 富余层为主判据。
- **采样防假绿（方法入账）**：v1 曾「p95=0.04」假绿（帧存秒没乘 1000）与「336 帧判无效」（把慢机当坏数据）——修后帧数门槛 300、判据改墙钟深度优先；人口稳定用 100ms 维持驱动 + 窗口末校验（敌数 ∈ [0.6×目标, 目标+2] / flow=battle / 玩家存活）。
- **待裁定（归用户）**：① `maxAlivePerWave` 4→8 置值；② battle 页接 `RULES.perf` 三档 governor + 粒子档位预算（建议立 E2.2——事件地图守圈/占圈 = 持续刷兵 + 齐射场景，性能地基须先行）；③ 1080p 目标机复测（有真目标机时收口绝对判据）。

### 4.195 2026-11-01 用户裁定「1+2」落地：`maxAlivePerWave` 4→8（连带 `maxPerWave` 齐平）+ E2.2 battle 页性能地基（governor 接线 + 粒子档位预算）

> 裁定依据：§4.194 压测数据（S1 8 敌全层 PASS / S2d 正交对照）。执行方式：本会话 teammate 满编（8 上限），两批由 Lead 直接执行（§4.193 bench 批先例：Lead 可直接持有页面写域）。验证 = Lead 全链实跑。
> 写域：`js/tank_rules.js`（standardScale 两键 + 注释）· `js/tank_fx.js`（粒子 cap 可注入）· `tank_battle.html`（governor 接线）· `tank_bench.html`（**并行会话遗留文案修补**，见本条⑤）。

- **① `maxAlivePerWave` 4→8**：S1 战斗场景 11 实体全层 PASS（1080p EMA 16.62ms / 边际成本 ≈0）+ S2d 对照证明齐射塌陷与实体数正交 ⇒ 性能维度抬限成立；「可逐一点名」玩法红线改由 measure-encounter 校准门接管。
- **连带（非可选）**：`maxPerWave` 6→**8** 齐平——关系不变式 `maxAlivePerWave ≤ maxPerWave`（test-encounter ⑯d）是分批投送的数学前提（活体闸 > 单波总量 ⇒ 首批永远投不满），首置后 ⑯d/⑯e 如期咬住，连带改后全绿。两值仍 `[PLACEHOLDER]` 随校准走；`garrisonVanguard.count=2` 的「合计守住活体闸」推导基线放宽，结论不变（接战台阶语义非闸从动量），注释加注记不改原文。
- **② E2.2 battle 页性能地基**：
  - **governor 接线**（对齐 tank_3d.html 样本）：`?tier=high|mid|deck` URL 参数（hasOwnProperty 防原型链键，继承 3D 页踩坑口径）+ 缺省自动档；主循环以**缩放前 raw delta** 喂 `updateGovernor`（`testTimeScale` 模拟缩放不得进 EMA——测试暂停会被误判为「帧极快」）；降档动作 = 渲染分辨率缩放（`resize()` 乘 `resolutionScale`）+ 粒子 cap 同步 + 尘埃间隔，**模拟层零接触**（「降表现不降模拟」红线）。
  - **粒子档位预算**：`tank_fx.js` 的 `FX_MAX_PARTICLES=1200` const → `fxSetParticleCap(n)`/`fxParticleCap()` 可注入（缺省 1200 零回归；非法入参回退；spawn 侧**拒绝新增**不替换旧粒子——替换会造成特效闪断）。7 处消费点全部切 cap。**行为披露（非纯零回归）**：接线后 high 档粒子顶从 1200 → **420**（§4.156 档位表原定标：蒙特卡洛极限峰值 ≈295 + 40% 余量，两套数字此前从未对齐——这正是「battle 页粒子无档位预算」的实质）——常规战斗稳态 72~150/极限 ≈295 全在 420 内，齐射极端压力下特效比改前稀，即治理目标本身。
  - **结构验证**（宿主漂移致帧时间绝对值不可判，改用直接证据）：同齐射构造下 deck(160) 与 high(420) 粒子数均**恰好贴顶被挡**（peek = cap）⇒ 预算真实管住 spawn；`?tier=deck` 冷启动画布 896×504（0.7 缩放）+ cap 160 即时生效、0 pageerror。
- **⑤ 并行会话遗留修补**：`test-bench-tools` 报 bench 可见文案泄漏实现路径（「（js/tank_card_picker.js」）——§4.193 批新增文件 `tank_card_picker.js` 的未加载提示文案，改「请刷新页面；若持续出现请反馈」。bench-tools / bench-parity 复跑全绿。
- **验证（Lead 实跑）**：`npm test` **84 通过 / 0 失败**（242.3s，含并行会话新登记的 test-card-picker / test-hud-panel）/ `npm run check` EXIT=0 / 浏览器 encounter 链全绿（0 console error）/ fx cap 注入单元验证（set 160 / 非法回退 1200）。
- **遗留与口径**：① 压测探针复跑时宿主状态漂移（S1@1080p EMA 16.62→20.39，同机 4 小时内）⇒ 绝对帧时间判读须目标机；② S2 齐射治理效果数字待目标机同口径复测（本机结构性证据已闭环）；③ `?tier=` 参数为部署侧新入口，正式发布默认 auto 不受影响。

### 4.196 2026-11-01 bench 底部 HUD 对齐 battle + 通用卡牌选择器（用户两轮裁定的合并落地）

> **需求演进（按顺序读，否则会误判本批"改了又改"）**：
> **第 1 轮**：「bench 中底部的弹种选择条太长了，**直接删除**，在右侧面板的卡牌测试区开发新的卡牌选择器
> （主武器与升级 / 副武器与升级 / 技能与升级〔分主动、被动〕/ 常规升级 等多个下拉菜单 + 管理按键），
> 该选择器考虑通用化，完成后接入 battle 开发者面板」。
> **第 2 轮（修正）**：「弹种选择条还是**要和 battle 中的相同**；技能（主被动）、速度、血量的 UI 也采用
> `tank_battle.html` 中的 UI」→ 随即更正「**我的错误，记错了。血条控件不变**」，并追加「再增加接入 battle 中的瞄准器 UI」。
> ⇒ 最终口径**不是**「删掉弹种条」，而是「**换成 battle 同款的 3 槽弹种栏**」——14 种平铺才是"太长"的根因。

#### ① 底部弹种条：删除的是「14 弹种平铺」，不是「弹种选择」

- **根因（实测）**：bench 此前**没有 `player.ammoLoadout`**，`renderAmmoIndicator` 直接把 `Object.keys(RULES.ammoTypes)`（**14 种**）全铺出来；battle 只渲染 `ammoLoadout`（**≤3 槽**）⇒ 两页长度差异的**全部**来源就是这一个字段。
- **处置**：删除 `#ammoIndicator` 元素 + 其 CSS + 旧内联渲染分支；改为 battle 同款三槽结构（`#slot1~3` + `.label/.num`，角标 ●/○），底部 HUD 容器 `#benchBottomHud`（vitals / weapons / skills 三区）。
- **loadout 引入**：`player.ammoLoadout` 缺省 `['ap','apcr','he']`；`setAmmo` 的 `currentAmmoIndex` 改按 **loadout 下标**取（旧实现按全弹种表下标，删条后会错位）；`benchCycleAmmo` 只在 loadout 内环形（与 battle 同口径）。
- **测试台语义保留**：新增「弹种槽 Ammo Slots」面板区（3 个下拉 + 应用/恢复默认），`benchSetLoadout()` 允许任意换槽内容 ⇒ **全 14 种弹种仍可测**，只是不再一次性铺开。
- **负向锁**：`test-bench-hud-wiring.js` 断言 `#ammoIndicator` 的元素 / CSS / 查询三者均不存在，防回潮。

#### ② 血量 / 速度 / 技能（主被动）：抽出共享渲染层

- **抽离理由**：这些控件此前**全部内联在 `tank_battle.html` 的 `updateBottomHud()`**（约 190 行，混装通用内容与 Boss 血条/暴露度两块 battle 专属）。bench 复用只能二选一：复制一份（= AGENTS.md §2.1 警告的「同功能两套实现」）或抽共享层 ⇒ **选后者**。
- **新模块** `js/tank_hud_panel.js`（242 行，6 个纯渲染函数）：`renderPlayerVitals` / `renderSpeedGauge` / `renderAmmoSlots` / `renderSkillSlots` / `renderPassiveSlots` / `renderAbilityCdBadges`。
- **设计约束**：纯渲染（不写实体字段、不新增判定）；DOM id 由调用方注入（不硬编码只属于某页的 DOM）；缺元素静默跳过（两页 DOM 不完全一致也能共用）；字号全走 `var(--fs-*)` 令牌（**不写死 px**，否则撞 bench 的字号棘轮上限 9px=3/10px=13/11px=8/12px=3）。
- **速度换算**：走 `tankCurrentKmh` / `roadBonusKmh`（经 `globalThis` 读取，与 `tank_hud.js` 同惯例）。**负向断言**锁死「直接乘 kmhFactor」那条错路（会读出 ~208km/h）。
- **血条**：靶车 `#eHpBar` **保留**（用户更正「血条控件不变」），新增玩家血条与之并存。

#### ③ 通用卡牌选择器（用户要求的「通用化」）

- **新模块** `js/tank_card_picker.js`（348 行）：`buildPickerGroups`（纯分组）+ `mountCardPicker`（DOM 构建）。
- **分类口径**（实测 211 张卡，四类之和 == 卡池总数，无卡落进「其它」）：

  | 分类 | 张数 | 判据 |
  |---|---|---|
  | 主武器与升级 | 23 | `effect.type==='weapon' && slot==='primary'` |
  | 副武器与升级 | 33 | `effect.type==='weapon' && slot==='secondary'` |
  | 技能与升级 | 23 | `ability` / `passive` / `drone`；**内分主动 15 + 被动 8**（`<optgroup>`） |
  | 常规升级 | 132 | `modifier` / `ammo` / `economy` |

- **多下拉语义**：每个分类一行独立 `<select>`（不是"一个下拉装全部"）；某条选中后其余自动置空 ⇒「应用」只作用于这一条，避免误读成批量操作。
- **管理按键**：应用 / 撤销一张 / 清除全部。撤销走 `_cardApplyLog` 重放语义（先清空再按剩余顺序重放），与 battle devPanel 的 −1 同口径。
- **通用性**：模块**不读全局 `player` / `cardPool`**（全部经 `opts` 注入）；卡池形态（数组 or `{id→spec}` 映射）由宿主自行转换，两种形态实测产生**完全相同**的分组构成。
- **两页接线**：bench → `#benchCardPicker`（`idPrefix: 'benchCp'`）；battle → `tank_devpanel.js` 卡牌 Tab 顶部 `#devCardPickerByGroup`（`idPrefix: 'devCp'`，由面板动态生成）。**battle 原有搜索 + 折叠全列表保留**（"按类别找"与"搜具体卡"互补，不互相替换）。

#### ④ 用户要求的「瞄准器 UI」：已评估、**未实施**（明确披露）

battle 的瞄准器有两种风格（`profile.settings.aimStyle`：`default` / `crosshair`）。其中 `drawCrosshairReticle`（`tank_battle.html:8336` 起，约 150 行）与装填/热量/弹夹状态强耦合，抽取面显著大于底部 HUD（涉及 `worldToScreen` / `cam.zoom` / `player._dbState` / `_clipState` / 热量三态）。本批**未动**该函数——避免在半成品状态下破坏正式游戏的核心瞄准反馈。**下一批接续点**：先把纯绘制部分抽出为入参注入式函数，再让 bench 复用。

#### ⑤ 验证

- `npm run check` **EXIT=0**（语法冒烟 + `tsc --noEmit`）。
- `npm test` **84 通过 / 1 失败 / 共 85 项**——唯一失败项 `scripts/test-asset-pipeline.js` 已多轮用原文核实为 `spawnSync` 管道沙箱限制（3 条失败均为「退出码 null」，无一条断言不成立）。
- 新增测试（均已登记 `TESTS`）：`test-hud-panel`（30 断言）/ `test-card-picker`（28）/ `test-bench-hud-wiring`（45）。
- `test-bench-tools` 段④ 扫描面从「4 个页面」扩到「3 个共享模块」：删掉 `tank_devpanel.js` 的「（js/tank_card_picker.js」式文案，并排除 `styleEl.textContent` 注入的 CSS 文本（否则会把 `#devPanel` 选择器误判为泄漏——本轮实测撞到过）。
- `node scripts/wiki-check.js`：`broken=0 anchors=966 anchorBad=0`。
- **浏览器链未跑**（本会话 `spawn EPERM`）：`test-browser-r3.cjs` 中依赖旧弹种条的 4 条断言**已改写**为 3 槽语义，另加 2 条负向断言；需在放开权限的环境补跑 r3 / smoke。

#### ⑥ 未完成的边界（不宣称已解决）

1. **瞄准器 UI 未接入 bench**（见 ④）——用户明确要求，本轮为控制风险未动，下批接续。
2. **浏览器实机未验证**：bench 页面加载、三槽点击、卡牌选择器交互的运行时行为只有静态断言覆盖，需补跑 r3。
3. **battle 侧 HUD 未切到共享层**：`tank_battle.html` 的 `updateBottomHud` 仍是内联实现。两页现在**共用同一份渲染代码**，但 battle 还没切过去——这是下一步真正消除「两套实现」的收尾，风险在于 battle 的 Boss 血条 / 暴露度 / 战斗态门控需要保留。

### 4.197 2026-11-01 三条用户反馈：副武器卡"不生效"根因 + 已持有管理器 + 悬停详情

> **用户反馈原文**：「副武器卡牌不生效？缺少已持有卡牌的管理器，缺少悬停显示卡牌详细文本」。

#### ① 「副武器卡牌不生效」——根因不是卡牌系统，是 F 按钮从未被渲染

- **先证伪了三个候选假设**（都做过实测，不靠推断）：
  - ❌「`applyTankConfig` 覆盖副武器」——实测 **0/6 辆**坦克配置带 `weapons/primary/secondary` 段，不会覆盖；
  - ❌「`resetEntity` 清空副武器」——实测调用后 `secondary` 仍为 `turret`；
  - ❌「装卡/切坦克顺序冲突」——两种顺序实测都保住副武器。
- **共享层实测正常**：4 张副武器安装卡应用后 `secondary` 均从 `none` 正确变为目标类型；驱动函数 `updateSecondaryWeapon`/`updateMissileLock`/`fireActiveSecondary` 全部可达（上一批 §4.193 补载 `tank_weapons.js` 的成果）。
- **真根因**：bench 的 `#btnF` 按钮在 HTML 里写死 `style="display:none"`，而**没有任何代码更新它**。battle 侧这段渲染内联在 `updateBottomHud`（约 55 行），bench **一行都没有** ⇒ 装上副武器后按钮仍隐藏、按 F 无任何反馈，用户观感就是"卡不生效"。
- **修法**：把 battle 的 F 按钮渲染抽成共享 `TankHudPanel.renderSecondaryButton`（含 `SECONDARY_LABELS`/`SECONDARY_ICONS`），两页共用。三态口径完整保留（#J4）：未激活显示装填秒数 / 索敌中角标「索」+ lock-hunting / 锁定中显示百分比 + lock-on；榴弹炮显示「曲/直」；副炮塔提示"自主开火"。
- **角标优先级纠错（本轮自查发现）**：初版照搬了 battle 的 `cd()` 把"装填中显示秒数"写在最前，导致榴弹炮装填期间角标显示成「5.0」——与 battle 注释「榴弹炮模式角标不受装填计时压制（#X5）」**正好相反**。现行优先级：榴弹炮模式 > 导弹激活态 > 装填秒数。

#### ② 已持有卡牌管理器（用户要求）

- 新增共享 `TankCardPicker.mountOwnedCards`：每行 = 卡名 ×层数 + `−1` 回退，另有「清除全部」。
- bench 挂到卡牌测试区 `#benchOwnedCards`；`−1` 走与选择器同一个 `benchRollbackCard`（`_cardApplyLog` 重放语义）。
- **口径纠错**：bench 原用 `cardStackCount(player, card.id)` 取层数——它只统计 `card:*` modifiers，**会漏掉纯 modifier 卡**。改按 `cardEffects` 的 `cardId` 计数（与 battle devPanel 同口径）。

#### ③ 悬停显示卡牌详情（用户要求）

- 新增共享 `TankCardPicker.attachCardTip` + `cardTipHtml`：稀有度彩色标题 + `formatCardDesc` 求值 + 视口边界翻折定位（沿用 `tank_devpanel.js` 既有实现的口径）。
- 挂在两处：**持有列表的卡名**、**选择器下拉**（原生 `option` 绑不了事件，改为「悬停 select 时显示当前选中项详情」，取卡用函数延迟求值以跟随选中变化）。
- **两个自查修掉的缺陷**：
  1. 初版每次 `mouseenter` 都 `attachCardTip` ⇒ **监听器无限叠加**。改为每元素只绑一次，后续调用只更新取卡函数。
  2. 复用判定用 `_tipEl.isConnected`，而该属性在非浏览器宿主恒 `undefined` ⇒ 每次 hover 新建一个 tooltip 元素、页面越积越多。改为「存在 + 仍挂在我挂载的父节点下」。

#### ④ 验证

- `npm run check` **EXIT=0**；`npm test` **85 通过 / 1 失败 / 共 86 项**（唯一失败仍是 `test-asset-pipeline` 的 `spawnSync` 沙箱限制，3 条均为「退出码 null」）。
- 新增 `scripts/test-card-picker-extra.js`（**42 断言**，实测逐条 `✓` 计数；已登记 `TESTS`）：覆盖 F 按钮三态、持有管理器 −1/清除、tooltip 内容与显隐，并含**两条负向**——「5 次 attach 后监听器仍为 1 个」「card 为 null 时 hover 不抛错」。
- `wiki-check`：`broken=0 anchorBad=0`。

#### ⑤ 未完成边界

1. **浏览器实机未验证**：F 按钮、持有管理器、tooltip 的运行时表现只有 Node 桩覆盖，需在放开权限的环境补跑 `test-browser-r3`。
2. **battle 未改用共享的 `renderSecondaryButton`**：battle 仍走 `updateBottomHud` 内联实现（本轮只让 bench 接上共享层）。两页逻辑现已一致，但"一份代码"尚未落实——同 §4.196 遗留 3。
3. **tooltip 只覆盖卡牌**：稀有度徽章之外的字段（如 `maxStacks`/`effects` 明细）未展开。

### 4.198 2026-11-01 bench「敌我坦克无法操作」根因修复：面板控件吞掉驾驶键

> **用户反馈原文**：「我是说 bench 中敌我坦克无法操作」，经追问确认为：**按 WASD 完全无反应（坦克不动）**，且**最近几轮改动后才出现**。

#### ① 根因：浏览器原生行为 + 本批把 `select` 从 3 个加到 10 个

- **机制**：`<select>` 获得焦点时，字母键被用于「按首字母跳选项」(typeahead)，该 `keydown` **不冒泡到 window**；`<input>` 获得焦点时按键被输入框消费。而共享输入控制器（`js/tank_bindings.js`）是**在 window 上监听**的 ⇒ 收不到按键，驾驶链整条断开。
- **为什么本批才炸**：bench 的 select 从 **3 个**（坦克选择 ×2 / 敌人坦克 ×1）增加到 **6 静态 + 4 动态**（弹种槽 3 个 + 卡牌选择器 4 个分类下拉）。用户只要在右侧面板点过任意一个下拉，焦点就停在它上面，此后 **WASD / 方向键全部失效**——表面现象就是「坦克无法操作」。
- **先证伪了 5 个假设**（全部实测，不靠推断）：`applyTankConfig` 覆盖副武器（0/6 辆配置带 weapons 段）/ `resetEntity` 清空（保留）/ 装卡与切车顺序（两序都保住）/ 按钮抢焦点（输入控制器无 typing 守卫）/ 模块加载顺序（`tank_bindings.js` 在 `tank_card_picker.js` 之前，且 35 个外部模块顶层加载零异常）。

#### ② 修法：capture 阶段按白名单接管，只还驾驶键

- 在 **capture 阶段**挂 `keydown`：焦点落在 `SELECT / INPUT / TEXTAREA` 且按键属于**驾驶键白名单**（`w/a/s/d` + 四个方向键）时，`preventDefault()` + `blur()`，把焦点还给画布，事件继续派发到 window 的输入控制器。
- **只接管驾驶键**：其它按键在控件上是正常交互（select 跳选项 / input 打字），不应被全面禁掉。这是本修法的关键取舍——无差别拦截会让下拉搜索、数值输入全部失效。

#### ③ 判据加固与变异验证

`test-bench-hud-wiring.js` 新增段⑧（6 条）与段⑨（2 条）：
- 白名单常量存在、含 WASD 与方向键；存在 capture 阶段监听（第三参 `true`）；接管块内同时有 `preventDefault` + `blur`；接管范围限定 `SELECT / INPUT`。
- **负向**：capture 接管必须先判白名单（`BENCH_DRIVE_KEYS.indexOf` 存在），不许无差别拦截。
- 段⑨锁「静态 select 数 ≥ 6」——数量再变时必须回头复核接管仍生效。

**变异测试（已执行并回滚）**：把常量改名为 `BENCH_DRIVE_KEYS_MUTATED` 后，断言**首次未判红**——原因是我第一版写成 `/BENCH_DRIVE_KEYS/` 前缀匹配，改名也命中，属**假绿**。改为 `/const BENCH_DRIVE_KEYS = \[/` 精确匹配后变异被正确捕获，随后回滚、复验全绿、无 `MUTATED` 残留。

#### ④ 验证

- `npm run check` **EXIT=0**；`npm test` **85 通过 / 1 失败 / 共 86 项**（唯一失败 `test-asset-pipeline` 的 `spawnSync` 沙箱限制，3 条均「退出码 null」）。
- `test-bench-hud-wiring`：段⑧⑨ 全绿（含变异验证后的精确断言）。
- `wiki-check`：`broken=0 anchorBad=0`。

#### ⑤ 未完成边界

1. **浏览器实机未验证**：本轮修复的正确性只有静态断言 + 机制推理支撑（`spawn EPERM` 无法起浏览器）。**请实机确认**：点过任意下拉后 WASD 是否恢复。
2. **只覆盖驾驶键**：鼠标瞄准、左键开火、F 副武器在控件聚焦时仍会被吞（原设计如此，且属合理——在输入框里打字不该开火）。
3. **同类风险未排查**：其它页面（designer / compare）若有「面板控件 + 全局键盘监听」的组合，可能有相同问题，本轮未查。

---

### 4.199 2026-11-01 下一阶段立项：MS3「内容量落地与校准」——战略裁定落规格 + 实施拆分（用户裁定「按建议执行」+「下一阶段 MS3」）

### ① 立项依据：路线 C 的主干

- **路线**：`PLAN.md` §2.7 路线 C「不对称双线」，MS1（决策空间：压迫与绕障）/ MS2（同一房间：波次导演进正式局）**均已收口**，路线表写明**下一步 = MS3「内容量落地与校准」**（完成门：总时长 180~300s / 理想天花板 ≥180s / `breather` 占比 ≤25% / `enemyClassProfiles[].maxHp` 的 `diff` 必须为空）。
- **战略层裁定（创意总监，用户逐项确认）**：节点任务类型体系 = **三型闭环 + 1 变速器**；普通节点正式视为**歼灭**任务（正名）；**防御**、**占领**为新增节点模式；**突破**作时间节奏变速器；猎杀留长期池；**敌后破坏砍**（与 2026-10-31「常驻巡逻不做」裁定冲突），改造为猎杀变体留池；非战斗节点（商店/补给/事件）**纳入且「替换不追加」**；奖励走**轻量差异化**（score bonus + 稀有度权重）。**裁定的核心定位**：借 Warframe 的「任务动词」，不借其「任务体系」；靠**语义层翻转**（防御点「敌守」→「我夺」）实现，不改地图生成器。

### ② 落盘产物

| # | 产物 | 位置 | 层级 / 标注 |
|---|---|---|---|
| 1 | 节点任务类型体系规格（三型 + 突破 + 非战斗节点 + 奖励绑定 + 地图需求对照表 + **MS3 验收口径**） | [docs/specs/combat/node-mission-types.md](E:\Code\rogue-tank\docs\specs\combat\node-mission-types.md) | 策划级 + 创意级 · **设计预留（未落地，2026-11-01）** |
| 2 | Boss 挑战设计（延迟裁定 + 硬软依赖 + 固化前准备清单 + 冲撞暴君降级 + 备选池重排） | [docs/specs/boss/challenge-design.md](E:\Code\rogue-tank\docs\specs\boss\challenge-design.md) | 策划级 + 创意级 · **设计预留（未落地，2026-11-01）** |
| 3 | 待办条目（N1~N8 完成门） | [docs/PLAN.md](./PLAN.md) §2.8.6 | 计划层 |
| 4 | 实施批次拆分（M3-A~M3-J 硬串行链、写域、回退点） | [docs/PLAN.md](./PLAN.md) §2.8.6.1 | 实施级计划 |
| 5 | **三层文档层级**判据表（创意级/策划级/实施级 → 落点/产出者）+ 三条不重叠纪律 | [AGENTS.md](E:\Code\rogue-tank\AGENTS.md#L140) §2.4 | 工作流纪律 |

### ③ 三层不重叠纪律（本批起生效）

| # | 纪律 | 落点约束 |
|---|---|---|
| 1 | **实施级不进 specs** | specs 主题页「实现与约束」只写**已落地机制**的代码入口/字段名/易错点指针；**未落地**机制的实施步骤（改哪个文件的哪段）只进 `PLAN.md` |
| 2 | **策划级数值只有一个家** | 设计预留页里的数值是「计划值」；落地后按 §2.3 迁入现行主题页唯一口径处，不得两页都是「当前值」 |
| 3 | **两层职责不跨写** | `creative-director` 只写创意级+策划级（specs 设计预留页）；`lead-programmer` 只写实施级拆分（PLAN）；`role-*` 只写代码与现行口径页 |

> **与 §3.6.1 的关系**：§2.4 是「**文档层级**」判据，§3.6.1 是「**职责层级**」。映射：§3.6.1 层 1（战略）≈ 创意级 + 策划级；层 2（拆分/测划/门禁）= 实施级计划与验收；层 3（执行）= 实施级落地。这两套「三层」**不得混淆**——前者决定「句子写进哪个文件」，后者决定「谁来做」。

### ④ 当前实施状态与边界

| 对象 | 状态 |
|---|---|
| 规格（两页 specs） | **已完成落盘**，均标「设计预留」 |
| 计划条目 §2.8.6（N1~N8） | 已完成 |
| 实施拆分 §2.8.6.1（M3-A~M3-J） | 已完成 |
| 代码实施 | **未启动**——按裁定「不设执行者、不设排期」，待 Lead 裁定纳入 MS3 批次链 |
| 文档统计口径 | 已按 2026-11-01 实测更新（五卷目录内 **78 个 `.md`** = 68 主题页 + 5 index + 5 changelog，含 **6 页整页设计预留** + 6 页部分设计预留） |

> **验证**：`node scripts/wiki-check.js` → `files=105 pages=78 links=1977 broken=0 anchors=990 anchorBad=0 struct=0 template=0` · **全部通过**（本批纯文档，无代码改动，故不重跑 `npm run check` / `npm test`）。

**下一步**：待用户/Lead 裁定 MS3 批次链归属与执行者后，按 §2.8.6.1 的 M3-A → M3-J 硬串行链推进实施。

### 4.200 2026-11-02 bench 主循环死亡：HUD 引用 battle 专属函数（用户报「坦克不可移动 + 坦克列表无法加载」）

> **编号订正（2026-11-02 文档收口）**：本条原误写为 §4.199（与上一条重号，违反「编号只增不回改」）。按时间顺序顺延为 §4.200，原 §4.200「bench 弹种 UI 竖排修复」顺延为 §4.201；两条正文未改，仅改编号。

> **用户反馈原文（连续两轮）**：① 「bench 中敌我坦克无法操作」→ 追问确认「按 WASD 完全无反应、最近几轮改动后才出现」；② **「仍然不可移动、坦克列表的坦克也无法加载」**。
> 第 ② 句是本批的关键线索：**「动不了」与「列表加载不出来」看起来无关，实际是同一个崩溃**。

#### ① 根因：`updateHud` 调用了 battle 页面专属的 `skillSlots()`

- **事故链**：`tank_bench.html` 的 `updateHud()` 里写

  ```js
  TankHudPanel.renderSkillSlots(player, { skillSlots: () => skillSlots(), ... }, {});
  ```

  而 `skillSlots()` **只定义在 `tank_battle.html:1445`**（页面内联函数），bench 从未有它 ⇒ 每帧 `ReferenceError` ⇒ `update()` 抛到 `loop()` ⇒ `requestAnimationFrame(loop)` **永不执行** ⇒ 主循环当场死亡。
- **为什么「列表也加载不出来」**：主循环死亡后 `loadTankList()` 的后续渲染与页面交互全部停摆——用户感知为「两个独立故障」，实为一个。
- **引入时点**：2026-11-01 批（§4.196）把底部 HUD 改为共享渲染层时，我照抄了 battle 的调用约定，但**没核对被注入的函数在本页是否存在**。这正是 §4.193 那次教训的同型错误（「调用了但模块没加载」），只是这次漏的是**页面级函数**而非模块。

#### ② 两层修复

**第一层（根因）**：共享层不再依赖宿主提供技能槽读取。
- `js/tank_hud_panel.js` 新增 `skillSlotsOf(player, count)`：惰性初始化 `player.skillSlots` 为 count 个 `null`（与 battle 同语义）。
- `renderSkillSlots` 缺省分支改为 `skillSlotsOf(player, count)`；bench 侧**移除** `() => skillSlots()` 注入。
- 宿主若仍要注入（如 battle 的 `resetSkillSlots` 等特殊语义），`deps.skillSlots` 仍优先——保持向后兼容。

**第二层（结构韧性）**：`bench` 的 HUD 渲染整块包 `try/catch`。
- 纪律：**HUD 是装饰层，任何 HUD 异常都不允许打死模拟主循环**。
- 首次异常记一次日志（`updateHud._hudErrLogged`，不逐帧刷屏），并 `console.error` 留证据。

#### ③ 判据：把「页面级未定义引用」变成机械可查

`test-bench-hud-wiring.js` 新增段⑩（8 条）与段⑪（1 条）：
- 共享层实现 `skillSlotsOf`，且 **`renderSkillSlots` 的缺省分支真的调用它**（不只是函数存在）；
- **负向**：bench 不得再注入 `() => skillSlots()`；bench 内不存在对未定义 `skillSlots()` 的调用；
- HUD 渲染块被 `try` 包住、有 `catch`、异常只记一次；
- 主循环结构不变式：固定步长调用 `update()`、`draw()` 之后重新排队 rAF；
- **段⑪ 端到端**：用桩 DOM 复刻 `updateHud` 的 HUD 段，**连跑 60 帧**，任一帧抛错即判红。这是本轮最有价值的断言——它能在**不启动浏览器**的前提下抓出「HUD 引用未定义符号」这类事故，而在此之前所有测试都没覆盖到。

**变异测试（两次，都做过回滚）**：
1. 把缺省分支改回 `player.skillSlots || []` ⇒ 首版断言**未判红**（我只断言了 `skillSlotsOf` 函数存在，没断言它被调用）⇒ 改成「从 `renderSkillSlots` 函数体内取代码片段再断言调用」后能正确判红。
2. 剥注释修正：负向断言起初被函数体内的**沿革说明注释**（`此前缺省走 player.skillSlots || []`）误触发 ⇒ 改为先剥注释再判。现恢复正常态全绿、变异态准确判红。

#### ④ 验证

- `npm run check` **EXIT=0**。
- `npm test` **85 通过 / 1 失败 / 共 86 项**（唯一失败 `test-asset-pipeline` 的 `spawnSync` 沙箱限制，3 条均「退出码 null」）。
- 端到端探针 `tmp/probe-loop-alive.cjs`：**60/60 帧无异常**；`skillSlotsOf` 惰性初始化生效（`[null,null,null]` 并写回 `player.skillSlots`）。
- bench HUD 所需 18 个 DOM id 逐一确认存在于 HTML。
- `wiki-check`：`broken=0 anchorBad=0`。

#### ⑤ 未完成边界（不宣称已解决）

1. **浏览器实机仍未验证**（`spawn EPERM`）。本轮证据是「Node 端复刻 HUD 段连跑 60 帧 + 静态结构断言」，**请实机确认**：打开 bench → 坦克能动、坦克列表能加载。
2. **battle 存在同类脆弱性**：`tank_battle.html` 的 `updateBottomHud()` 同样在 `update()` 路径内，其内部异常也会打死正式游戏主循环。本轮**未动 battle**（写域与风险面不同，正式游戏页改动须单独评估）。
3. **未做全页面扫描**：本轮用 `tmp/scan-bench-undefined.cjs` 扫过 bench，命中大量注释/CSS 误报，人工确认真实未定义引用只有 `skillSlots` 一处；**designer / compare / codex 未做同口径扫描**。

### 4.201 2026-11-02 bench 弹种 UI 竖排修复：抄了 DOM 结构却没抄度量

> **编号订正（2026-11-02 文档收口）**：本条原为 §4.200，因上条重号订正（§4.199 → §4.200）而顺延为 §4.201；正文未改。

> **用户反馈原文**：「弹种UI竖起来了」。

#### ① 根因：三处 CSS 缺失叠加，缺一不成立

§4.196 把 bench 底部 HUD 改为 battle 同款时，我**照抄了 DOM 结构**（`#abilityBtns` > `.abtn` > `.label/.num/.cd`），却**没有照抄 battle 的度量约束**（`tank_battle.html:97-130`）。三处叠加才表现为竖排：

| # | 项 | battle 基准 | bench 原实现 | 后果 |
|---|---|---|---|---|
| ① | `#abilityBtns` | `display:flex; gap:6px;` | 多了 **`flex-wrap:wrap`** | 窄容器内按钮折行 ⇒ 竖排 |
| ② | `.abtn` | `min-width:40px; **height:30px**;` | 漏定高，且用 `flex-direction:column` | 按钮被内容撑成高竖条 |
| ③ | `.num` / `.cd` | **`position:absolute`**（右下/右上角标） | 写成**流内元素** | 角标占真实高度 ⇒ 进一步撑高 |

**三处必须同时修掉**——只去掉 `flex-wrap` 仍会竖，因为 ②③ 让每个按钮自己变高。

#### ② 修法：按 battle 的度量逐项对齐

- `#abilityBtns, #skillBtns{display:flex; gap:6px;}`（去掉 `flex-wrap`）
- `.abtn{min-width:40px; height:30px; padding:0 6px; ...}`（补定高与最小宽）
- `.num{position:absolute; bottom:1px; right:2px;}` / `.cd{position:absolute; top:2px; right:2px;}`
- 字号继续保持 `var(--fs-*)` 令牌（bench 的字号棘轮 9px=3/10px=13/11px=8/12px=3 已用满，**不能新增 px**）。

#### ③ 判据：把「照抄结构却没抄度量」变成机械可查

`test-bench-hud-wiring.js` 新增段⑫（9 条）：
- 容器不得有 `flex-wrap:wrap`（负向）、必须是 flex 横排；
- `.abtn` 必须有 `height:30px` 与 `min-width:40px`（与 battle 同度量）；
- `.num` / `.cd` 必须 `position:absolute`；
- **基准核对**：同时断言 battle 侧仍是 `height:30px`——若基准变了，这条会提醒同步；
- **负向组合断言**：`flex-wrap / 无定高 / 角标非绝对定位` 三者计数必须为 0，任一回退即判红。

**变异测试（已执行并回滚）**：加回 `flex-wrap:wrap` ⇒ 2 条断言准确判红（单点负向 + 组合计数）；回滚后全绿。

#### ④ 验证

- `npm run check` **EXIT=0**；`test-ui-tokens` 全绿（字号棘轮未被触发）。
- `npm test` **85 通过 / 1 失败 / 共 86 项**（唯一失败 `test-asset-pipeline` 的 `spawnSync` 沙箱限制，3 条均「退出码 null」）。
- `wiki-check` 全部通过。

#### ⑤ 未完成边界

1. **浏览器实机未验证**：本轮只有 CSS 源码断言与 battle 基准比对，**请实机确认**弹种按钮已横排（三槽并排、角标在角上）。
2. **同类风险未扫**：bench 其它照搬 battle 的区块（如 `#hudZone` 宽度、`#playerHpTrack` 240px 定宽）是否也缺少度量约束，未逐项核对；bench 是 300/1fr/340 三栏 grid，battle 是整屏布局，**同结构在不同容器下未必同表现**。
3. **这已是第二次「照抄 battle」引发回归**（第一次是 §4.200 照抄调用约定引入不存在的 `skillSlots()`）。两次的共同教训：**复用 battle 的实现时，「结构 + 度量 + 依赖」三者必须一起搬，只搬其中一样就会出问题**——但这条尚未被写成通用检查项。

### 4.202 2026-11-02 文档收口：编号/导航/统计/ISSUES 归档/specs 开关态 + D1~D7 决策落定

> **来源**：用户要求「阅读 docs 检查整理状态与下一步决策」→ 审查报告列出 4 类问题 → 用户裁定「立刻修好不需要决策的 1~5；D1~7 按建议执行；D1 的 180~300s 是每节点」。本批**纯文档**，无代码改动。

#### ① 编号与导航

- **§4.199 重号订正**：原有两个 §4.199（2026-11-01 MS3 立项 / 2026-11-02 bench 主循环死亡）。按时间顺序，后者 → **§4.200**，原 §4.200「bench 弹种 UI 竖排」→ **§4.201**；两条正文未改，仅改编号并各加订正注记。顺带把 §4.199 的标题级别从 `##` 统一为 `###`（与全卷一致）。
- **`DEVELOPMENT.md`**：目录最大编号 §4.188 → **§4.202**；§4 分卷链接补 **2026-11（§4.189–§4.202）**——此前该分卷未被主文档链接，最新 12 条从主文档不可达。
- **统计数字**：`DEVELOPMENT.md` 与 `AGENTS.md` §3.7 的「72 个 test + validate = 73 项 / 浏览器八链」→ **85 个 `test-*.js` + `validate-content.js` = 86 项 / 浏览器九链**（补 `test-browser-replay3d.cjs`，§4.175 新增）。沙箱口径同步为「85 通过 / 1 失败；放宽后 86 通过 / 0 失败」。
- **`PLAN.md` §1**：条目 1「剩 B7 收口」、条目 2「A1/A2 待实施」、条目 6「MS1 收口前不开工」三处过期状态改为现行口径。

#### ② 现行数值冲突

| 冲突 | 处置 |
|---|---|
| `encounter-director.md` 写 `maxAlivePerWave=4`，`js/tank_rules.js:1047` 为 8 | 正文改为「三值 + 唯一口径指针」，加沿革注记 `~~4~~ → 8`（依据 §4.194/§4.195） |
| `encounter-director.md` 整页仍是 3D 切片三波口径 | 摘要与适用版本改为「切片编成 + 正式局管线」；「5 辆可逐一点名红线」加沿革注记（切片口径，正式局已 8）；「实测时长」节标为**切片口径、正式局基线待重测** |
| 遭遇时长三处矛盾（91s / 50.5s / 280~300s） | `encounter-pacing.md` 加**口径告警**：280~300s 含撞 CAP 截断样本、50.5s 三局全战死、91s 同称真局 ⇒ **三组数字不可并存**，D5 干净重测出数前均不得作为验收依据；判据行改为「**单节点**总时长」（D1 口径） |

#### ③ ISSUES 4 步生命周期

- **15 条已修复条目一次性关账**：#AC2/#AC3/#AC4 + #AB1~#AB9 + #AB13/#AB14/#AB17。
- **原文整批归档**至新建 `docs/archive/2026-11.md`（34.9KB，原文照录，仅修复 #AC2 中一处编码损坏的占位符）；`ARCHIVE.md` 补分卷链接 + 表尾索引行；`ISSUES.md` 重写为**仅存 #AB10**，并同步文件头/批次头/清账记录。
- **#AC2 残余**（地图侧 `makeNode` 生成期可达性断言/重滚）**未排期**，已记入 `PLAN.md` §2.10 工程债，不随条目一起消失。

#### ④ specs 补「已落地但默认关闭」状态

- `encounter-director.md` 新增**「正式局开关态」表**：`defensePoints.enabled=false` / `garrisonMode=false` / `garrisonFallbackSeconds=0` / `garrisonVanguard`，注明各自落地批次与开启后行为。
- `map/defense-walls.md` 新增「防御点模式（默认关闭）」对照表（选址 / 生成顺序 / 波数 / 首点位置 / 工事）。
- `combat/enemy-ai.md` 新增「守军语义与反冲击（默认关闭）」：激活链、前锋、兜底、出口解耦、软锁实测风险。

#### ⑤ D1~D7 决策落定

写入 `PLAN.md` **§2.10**：D1 单节点 180~300s（`runNodeCount=5` ⇒ 一局 15~25 分钟）；D2 守军+反冲击启用、D3 防御点启用（同批，先重测再翻开关）；D4 同屏上限按难度分档（先落机制、缺省等价 8）；D5 先 M3-A/B 契约层再干净重测；D6 车库固化排在 MS3 之后、M2 之前；D7 MS4 立即开跑、硬时间盒 ≤1 周。附 10 步执行顺序与三条纪律（默认值≠标定值 / 双向断言 / 单写者）。

#### ⑥ 验证

- `node scripts/wiki-check.js`：`files=106 pages=78 links=1984 broken=0 anchors=991 anchorBad=0 struct=0 template=0` — 全部通过。
- **本批无代码改动**，故不重跑 `npm run check` / `npm test`。

#### ⑦ 未完成边界（不宣称已解决）

1. **M3-A 起尚未开工**——本批只落决策与文档，代码序 1 起按 `PLAN.md` §2.10 执行。
2. **干净重测未跑**——遭遇时长基线仍是三个互斥读数，MS3 的任何数值标定在重测前都是空转。
3. **`docs/README.md` 的文档地图未列月度批次分卷**——属导航增强，未改。

### 4.203 2026-11-02 M3-A：节点任务类型契约层（`RULES.nodeKinds`，全部缺省关闭）

> **依据**：`PLAN.md` §2.8.6.1 M3-A（类型契约层，链首、先于一切消费端）+ §2.10 D5「先契约层再重测」。设计口径 `specs/combat/node-mission-types.md`。

- **新增 `RULES.nodeKinds`（`js/tank_rules.js`，只加不改）**：总开关 `enabled:false`；7 型枚举 `kinds`（`exterminate` / `defend` / `capture` / `breakthrough` / `shop` / `supply` / `event`）；各分型 `enabled:false`；参数组 `defend{wavesMin/Max 3~4, ringSectorsMin/Max 2~4, clearBonusPct}`、`capture{pointsMin/Max 2~3, counterAttackAt 0.5}`、`breakthrough{timeLimitSeconds, earlyBonusPct}`、`nonCombat{replaceEvery 4, maxSharePct 0.25}`、`reward{enabled}`。**全部数值标 `[PLACEHOLDER]`**，待 `measure-encounter --mode=real` 校准。
- **零回归**：`enabled:false` 时 `makeNode` / `generateRun` 不写任何 `node.kind`，run 链与改前逐字节一致；回退点 = 删块或全置 `false`。
- **测试**：`scripts/test-map.js` 新增 **20 条断言**（14 处 `ok()`，其中「分型 `enabled`」一条随 7 型循环展开）——契约块存在 / 总开关 false / 枚举 7 型无缺漏无重复 / 长期池类型（`hunt`/`escort`）不得进入当前枚举（负向）/ 7 个分型 `enabled` 存在且 false / 四个参数组区间合法 / **关闭态 `node.kind` 不得出现**（3 seed × 5 节点，负向）。
- **验证**：`node scripts/test-map.js` 全绿（新增 20 条全 `✓`）；`npm run check` EXIT=0（语法 + `tsc --noEmit`）；`npm test` **86 通过 / 0 失败**（674.2s，本环境权限已放宽，`test-asset-pipeline` 的沙箱 EPERM 未出现）；`node scripts/test-replay.js` 基线 hash 不变（`5aa511e0`）。
- **未做（M3-B 起）**：`makeNode` 写 `node.kind`、`generateRun` / `extendRun` 的「替换不追加」注入、突破置中段、分型抽样——本批只落契约，**不产生任何行为差异**。
- **归口**：`specs/combat/node-mission-types.md` 落地状态表新增「契约层已落地（M3-A）」行；`PLAN.md` §2.10 序 1 标 ✅。

### 4.204 2026-11-02 M3-B：节点链合成（`node.kind` / 突破置中段 / 非战斗「替换不追加」）

> **依据**：`PLAN.md` §2.8.6.1 M3-B。设计口径 `specs/combat/node-mission-types.md`。

- **`makeNode` 写 `node.kind`**（`js/tank_map.js`）：仅当 `RULES.nodeKinds.enabled===true`；Boss / 生存节点写 `null`（不参与类型体系）；index 0 恒 `exterminate`（教学节点）；其余按 `defend.share` / `capture.share` 抽样。
- **类型不消耗 rng**：`kind` 由 `(templateResult.seed, index)` 的 FNV-1a 哈希派生 ⇒ **开关前后同 seed 的地图几何逐字节一致**（零回归的核心保证）。
- **链级规则 `applyRunKinds(nodes, fromIndex)`**：① 突破置「战斗节点中段」（已有 breakthrough 则不移动——已打过的节点不能改语义）；② 非战斗节点每 `replaceEvery`（缺省 4）个节点替换 1 个，跳过 index 0 / Boss / 突破，并按 `maxSharePct` 回退超限项；**只改标签、不增删节点** ⇒ 链长恒不变。
- **`generateRun` / `extendRun` 接线**：前者对全链应用、后者只对新增节点应用（不重排已打过的节点）。
- **测试**：`test-map.js` 新增 **19 条断言**（关闭态无 kind / 总开关开且分型关只有 exterminate / Boss null / **开关前后几何指纹一致** / 链长不变 / 非战斗替换位置与占比 / 替换不追加 / 负向 nonCombat 关闭不出现 / 突破恰好 1 个且在中段 / index 0 恒歼灭 ×5 seed / 防御占领抽样 / 同 seed 类型序列一致）。
- **验证**：`test-map` 全绿；`npm run check` EXIT=0；`test-replay` 基线 hash `5aa511e0` 不变。

### 4.205 2026-11-02 M3-C：类型-奖励绑定（score bonus + 稀有度权重）

> **依据**：`PLAN.md` §2.8.6.1 M3-C。`RULES.nodeKinds.reward` 全部 `[PLACEHOLDER]`。

- **`scoreNode`**（`js/tank_map.js`）：`reward.enabled===true` 且 `node.kind` 有 `scoreBonusPct` 时追加「任务类型加成 +X%」；关闭态与现行逐项相等。
- **稀有度权重**（`js/tank_cards.js`）：新增纯函数 `nodeKindRarityWeights(kind, rewardCfg)`——关闭态 / 未知 kind / 空表返回 `null`（回退全局权重）。`tank_battle.html` 的 `drawRewardCards` 取值优先级 **Boss 追加轮 > 节点类型 > 全局**。
- **测试**：`test-map` 新增 6 条（关闭态零回归 / defend 加成生效 / 标签 / 歼灭与 `kind=null` 负向）；`test-cards` 新增 6 条（关闭态 null / 权重表读入 / 歼灭与未知 kind 负向 / 各型可辨 / **同 r 序列下权重真的改变抽取结果**——非死配置）。

### 4.206 2026-11-02 M3-D：歼灭正名与 kind 枚举一致性审计

> **依据**：`PLAN.md` §2.8.6.1 M3-D。

- **新增 `scripts/test-node-kinds.js`**（已登记 `TESTS`）：① `RULES.nodeKinds.kinds` 与规范 7 型逐项一致；② 扫描 `js/` 全部 `node.kind` 字面量，越界即红；③ **检测器负向自证**（旧称 `annihilate` / `elimination` 必须被判非法）；④ 规格页列出全部 7 型且含「歼灭 / `exterminate`」；⑤ 消费方存在（`makeNode` 写、`scoreNode` 读、卡牌层解析权重）；⑥ M3-H 页面接线静态判据。
- **规格订正**：`node-mission-types.md` 的 `node.kind` 行补全 7 型枚举与「Boss/生存为 `null`」。

### 4.207 2026-11-02 M3-E：防御节点（守点目标存活 + 目标被毁归零）

- **模块**（`js/tank_encounter.js`）：`createEncounter({kind:'defend'})`；`ctx.objectiveAlive` 每帧注入；目标被毁 ⇒ 一次性 `objective-lost` 事件（**不判负**）；波清 ⇒ victory 载荷带 `objectiveFailed`。
- **页面**（`tank_battle.html`）：`spawnGuardTarget` 在最后一个防御点放一个 `building` 级守点目标（复用 building 生命周期，可被炮弹/溅射打掉）；`battleEncounterCtx` 注入 `objectiveAlive`；HUD 目标卡改为「守住守点目标（N 波）」并在目标被毁时提示。
- **结算**：`scoreNode` 对 `kind==='defend' && result.objectiveAlive===true` 追加「守点目标存活 +20%」；目标被毁则归零。
- **测试**：`test-encounter` 5 条（存活胜利 / 载荷 false / 被毁发事件 / **被毁仍 victory 不是 gameover** / 载荷 true）；`test-map` 2 条（存活加成 / 被毁归零）。

### 4.208 2026-11-02 M3-F：占领节点（驻留读条 + 50% 反冲击 + 拔满判胜）

- **模块**：`kind:'capture'` + `captureTotal` / `counterAttackAt`；`ctx.captureDone` 每帧注入；**波次清空不判胜**（停在 lineHold 等目标条件）；读条过 50% 发一次性 `counterattack`；拔满 ⇒ victory 载荷带 `captureDone`。
- **页面**：`setupCaptureZones` 在前 N 个防御点建驻留圈（半径 130px）；`updateCaptureZones(dt)` 每帧推进——我方在圈内且圈内无敌方才读条，敌方进圈暂停；`counterattack` 事件在最后一个防御点刷 1~2 辆前锋（同屏 ≤6）；HUD 显示「占领 N 个点（已拔 X）」。
- **测试**：`test-encounter` 4 条（波清未拔点不判胜 / 50% 发反冲击 / 拔满胜利 / 载荷 captureDone）。

### 4.209 2026-11-02 M3-G：突破节点（限时抵达出口 + 超时低分结算）

- **模块**：`kind:'breakthrough'` + `timeLimitSeconds`；`ctx.reachedExit` ⇒ victory（载荷 `reason:'exit'`）；超时 ⇒ `timeout` 事件 + `outcome:'settlement'`（**不是 defeat/gameover**，载荷 `reason:'timeout'`）；波次清空同样不判胜。
- **页面**：`finishNodeTimedOut()` 复用 `finishNode` 收尾链，得分乘 `RULES.nodeKinds.breakthrough.timeoutScorePct`（缺省 0.5）后进 `settlement`；HUD 显示「限时抵达出口（剩余 Xs）」。
- **测试**：`test-encounter` 6 条（timeout 事件 / settlement 终局 / 载荷 reason / 抵达出口 victory / 载荷 exit / **时限=0 回落波清判胜**负向）。

### 4.210 2026-11-02 M3-H：非战斗节点路由（商店 / 补给 / 事件，「替换不追加」）

- **路由**：`routeNonCombatNode(node, index)`——节点标记已清 + 写档，**不新增 flow 状态**：商店复用 reward 屏内嵌局内商店（`revealRewardShop` → `buildRunShopInto`）；补给 = 全员抢修 40% + 选卡；事件 = 选卡即事件。
- **接线**：`nextNodeAfterReward` 在 `transition(flow,'battle')` **之前**分流；`enterBattle` 顶部加**防御性兜底**（读档/开发者跳节点直接落到非战斗节点 ⇒ 自动完成并结算，绝不进战场）。
- **标签**：`NODE_KIND_LABELS` 7 型中文名；进入节点日志带类型；reward 屏状态栏显示节点类型与编号。
- **测试**：`test-node-kinds` 6 条静态判据（路由函数 / 分流在 transition 前 / 商店复用 / 选卡管线 / 标签表 / enterBattle 兜底）。

### 4.211 2026-11-02 M3-B~M3-H 收口验证

- `npm run check` **EXIT=0**（语法 + `tsc --noEmit`）。
- **`npm run test:browser` 九链全绿**（smoke / r3 / run / r4 / ally / 3d / encounter / perf / replay3d，exit 0）。
- 定向链全绿：`test-map`（M3-A/B/C/E）、`test-encounter`（M3-E/F/G）、`test-cards`（M3-C）、`test-node-kinds`（M3-D/H）、`test-flow`、`test-replay`。
- 全量 `npm test`：**87 通过 / 0 失败**（328.2s，权限放宽环境；`test-asset-pipeline` 通过）。
- **开发期试玩入口（2026-11-03）**：`js/tank_rules.js` 末尾新增 URL 覆盖（**不改默认值**；Node 环境无 `location` 自动跳过）——`?nodeKinds=all` 自然抽样、`?nodeKinds=defend,capture` 指定分型、`?forceKind=<kind>` 强制所有非 Boss 节点为该类型。`__TEST__` 新增只读探针 `nodeKind()` / `captureZones()` / `guardTarget()`，`encounter()` 补 `kind/captureDone/captureTotal/timeLimitSeconds/objectiveFailed`。探针 `tmp/probe-node-kinds.cjs` 实测四类真局（defend / capture / breakthrough / shop）**全部进入正确节点类型、pageerror 0**：defend 守点目标 hp=3、capture 3 个驻留圈、breakthrough 时限 180s、shop 自动完成进 settlement。
- **未做（M3-J）**：全部类型参数仍为 `[PLACEHOLDER]`，`measure-encounter --mode=real` 校准与 4 步生命周期收口未跑；`RULES.nodeKinds.enabled` 与各分型 `enabled` 仍全部 `false`（零回归态），**玩家默认看不到任何类型机制**。类型开启态的**玩法手感/数值**（守点强度、占领读条时长、突破时限、非战斗节奏）未人肉试玩——归 M3-J 校准批。
- **顺带修复（浏览器链暴露的既有缺陷）**：① `tank_bench.html` 整段脚本包在 IIFE 里，`benchSetLoadout` / `benchCycleAmmo` / `benchLoadout` 从未挂到 `window`，而 `test-browser-r3.cjs:153` 按全局名调用 ⇒ `ReferenceError: benchSetLoadout is not defined`（§4.196 引入，当时浏览器链未跑）。已按既有 `window.benchSpawnCover` 同口径显式导出；探针 `tmp/probe-bench-global.cjs` 复验三函数均为 `function`、pageerror 0。② `test-browser-encounter.cjs` 首读假设「`ready` 时仍在 telegraph」，且页面非前台时 rAF 被节流 ⇒ 整链顺序跑 6~4 条假红（实测 `phase=wave / enemyAlive=3 / react=0`）。改为 `bringToFront()` + ready 后先 `__TEST3D__.restart()` 再断言（与 #AB5/#AB8 同类修复），单跑与整链均全绿。③ `test-browser-perf.cjs` 的「deck 档油门响应」在整链顺序跑时假红（`maxSpeed=0 / moved=0`）：该页不是前台页 ⇒ 后台标签 rAF 被节流。改为按键前 `bringToFront()`，单跑与整链均全绿。④ 其余浏览器链（smoke / r3 / run / r4 / 3d / replay3d）统一在 `newPage` 后补 `bringToFront()`，防同类「整链顺序跑时失焦/节流」假红；`test-browser-ally.cjs` 的 C 键集火另加一次「重算屏幕坐标再按」的重试（仍走真实 C 键路径，不放宽断言）。

### 4.212 2026-11-03 M3-J 结构批：类型专属地图几何 + 敌方目标欲望（「类型不是改名」的实证）

- **用户指认（2026-11-02）**：MS3 的节点任务类型「是否只是改名、实质仍是标准模式逐个防线突破」。核查结论——**是**。语义层差异只有 4 项（HUD 文案 `tank_battle.html:8265`；结算 bonus 百分比 `js/tank_map.js:1991`；defend 波数截断 + 敌人 bearing 铺开 `tank_battle.html:3365`；capture/breakthrough 胜利判定分支 `js/tank_encounter.js:570/562`），而 `generateNode` / `generateStrip` / 路网 v4 **一处都不读 `node.kind`** ⇒ 同图同内容。门禁为何没拦住：`test-node-kinds.js` 是静态审计（字面量在枚举内、消费方函数存在），`test-encounter.js:1085` 是纯逻辑单测（喂 ctx 断言载荷），**两层都不检查「内容结构是否与歼灭不同」**。
- **修法（用户裁定「按建议逐个修复」）**：把类型差异从语义层下沉到**地图生成期**，并让敌方 AI 按类型改目标。新增纯逻辑层 `js/tank_objectives.js`（8 个导出，零 DOM / 零 `entities` 依赖，可 Node 测试）；`js/tank_map.js` 新增 `computeNodeKind` / `planNodeKindGeometry` / `applyNodeKindGeometry`；`tank_battle.html` 消费 `currentNode.typeObjective` 并每帧算 `engageTarget`。
- **防御·守点护墙环**：守点从「最后一个防御点（敌人纵深）」移到出生点→首道防线之间 `xProgress=0.45`；环 `radius 300 / thickness 70 / gaps 3 / gapWidth 150 / blockLen 120`，tier 必须 `intact`（`wall` / `perm_block` 的派生 `mode` 是 `none`，**不拦弹**，做护墙会成纯装饰）。几何涌现实测：**可命中方位占比恒 20.1%、恒 3 个固定扇区**（D=400~4000 七档全同）；瞄准容差 D=350 `±10.7°` → D=4000 `±0.87°` 严格单调收窄 ⇒ 用户要的「远距离只能数个特定方向命中、近处更易击中」**不靠任何距离特判**。敌人不会生在环内：波次刷怪锚点→环心最小距离 **539px**（350 样本）> 环外沿 335。
- **占领·点脱离防线**：改前占领圈直接复用 `anchorGroups[i]`（防线锚点），与「逐个突破防线」空间完全重合。现按 `pointsMin/Max`（2~3）确定性抽点数、x 均布 30%~86%、y 在 `0.24/0.76` 两带锯齿散开；负向断言锁住「不得全部落在防线 bucket 中心」。顺带修 `captureTotal` 软锁：胜利判据 `captureDone >= captureTotal`，而 `captureTotal` 原按「防御点组数 ∩ pointsMax」算、圈数另按抽样 ⇒ 不等时**永远无法达成**，改为以实际圈数为准。
- **突破·通道净空**：直通道沿出生点 y 到出口、净宽 `340`，两侧补 `intact` 墙（`wallThickness 60`，标记 `channelWall`），通道内阻挡型掩体清除。三 seed 实测：通道内残留阻挡物 **0**、两侧墙 **2**、敌人与墙体重叠 `stuck 0`。
- **敌方目标欲望**：`RULES.nodeKinds.engage` = `defendBias 0.82 / captureBias 0.35 / otherBias 0 / distanceFalloff 900`，打分 `bias × 1/(1+d/falloff)`；`bias<=0` 短路返回玩家 ⇒ 歼灭/突破/非战斗与改前逐字段一致。`js/tank_ai.js` 的 `aiDecideEnemy` 只改一处——`const p = ctx.engageTarget || ctx.player`（`p` 是整条决策链的唯一目标变量）⇒ 追击/绕后/炮塔朝向/`lastKnownPlayerPos` 全链路换目标；开火分支读**同一个** `engageTarget`，消除「炮塔朝 A、炮弹飞 B」。
- **失败语义（本轮自捕软锁）**：守点被毁 ⇒ 本节点任务失败（用户裁定；改前只归零 bonus、清完波仍判胜利 ⇒ 类型语义不成立）。但**任务失败 ≠ 玩家阵亡**：`finishEncounter` 的 `defeat` 必须带 `failReason`（`objective-lost` / `player-dead`），页面据此分叉——后者交既有复活/gameover 管线，前者走**低分结算** `finishNodeObjectiveLost`（`defend.failScorePct` 0.4，低于突破超时 0.5）。**缺这个字段就是确定性软锁**：实测守点被毁那一帧后连续 2000 帧零事件（`enc.outcome` 幂等），而页面 `case 'defeat'` 当时只记一行日志 ⇒ 不结算、不 gameover、`battleExitReady` 永不置位 ⇒ 玩家打完也出不去。
- **生成后被改写类型的补建**：`applyRunKinds` 在 `makeNode` **之后**改 kind（突破置中段 / 非战斗替换 / 占比回退），几何只在生成期建一次会漏。新增 `applyNodeKindGeometry(node, kind)`：按标记字段（`guardRing` / `channelWall`）摘旧结构 → 重建 → 把压在新结构里的敌人沿 y 推出（`pad 40`，钳进 `[60,h-60]`）；非几何类型若有旧结构或 `typeObjective` **同样摘除**（防「商店里长了个要塞」）；三者皆无则 `return null`，普通节点逐字节不动。
- **新增测试 `scripts/test-node-objectives.js`（43 项，已登记 `run-tests.js`）**：护墙环固定扇区 / 瞄准容差 ∝ 1/距离（含静态扫描「无距离特判」）/ 占领点脱离防线（含负向）/ 突破通道净空 / `pickEngageTarget`（含 `bias=0` 零回归、`engage.enabled=false`、守点 hp=0 回落）/ `guardTargetAsEntity` 七字段形状。`scripts/test-encounter.js` 的 defend 段改写并新增 `failReason` 双向断言（`objective-lost` 与 `player-dead` 必须可区分）+ 回退开关负向块。
- **验证**：`npm run check` → **All checks passed**（`js/tank_objectives.js` 被共享 js 冒烟自动纳入）；`test-encounter` / `test-map` / `test-node-kinds` / `test-node-objectives`（43 项）/ `wiki-check`（`links=1988 broken=0 anchors=994 anchorBad=0`）全绿；全量 `npm test` **87 通过 / 1 失败**（唯一失败 `test-asset-pipeline` = AGENTS.md §3.7 沙箱 EPERM 已知噪音）。**2026-11-03 补充实测**：另一次全量跑出现 `test-ai-press` 超时（302.9s > 300s 上限）而单跑通过（282.7s）——已用基线 worktree 对照证明为该测试既有负载抖动，非本批回归，详见下条「门禁噪音排查记录」。
- **过程教训**：三次 `edit` 的 `old_string` 跨函数边界把下一函数首行（`function baseKindFor(...)` / `const cfg = nodeConfig();`）吞掉 ⇒ `SyntaxError` / 运行时缺变量。规则：`old_string` 收尾必须停在函数体内的完整语句上，不得贴着 `}` 就结束。另修一处**静默失效**：`objectiveBiasFor` 只认 `RULES.nodeKinds` 子段而页面传整份 `RULES` ⇒ 生产恒返回 0（单测传子段全绿测不出），现按两种入参形态容错并加一致性断言。
- **门禁噪音排查记录（2026-11-03，`test-ai-press` 超时）**：全量跑时该项报「超时（>300s）」，单跑 282.7s 通过 —— 逼近上限而非逻辑失败。用 `git worktree add` 检出改动前基线 `7a7a662` 跑同一组 10 seed × 40s 窗口做对照：**基线 `minDist` 273/56/123/330/74/151/136/171/119/319 与改动后逐 seed 完全一致**（`net` / `detour` 亦全部一致）⇒ `aiDecideEnemy` 的 `p = ctx.engageTarget || ctx.player` 在 `engageTarget` 缺省时为逐字节零回归。耗时抖动来自机器负载：同一份代码三次测量 218.8s / 120.7s / 139.8s（基线），跨度近 2×。**结论：不改断言、不放宽门限**——该测试的 300s 上限本就为容忍负载抖动设在 180s→300s（见 `scripts/run-tests.js:17-21`），本次属已知边界，不是本批引入的问题。
- **文档**：`docs/specs/combat/node-mission-types.md` 新增现行节「类型专属内容结构（现行，2026-11-03）」，页面头部改成混装（该节现行、其余仍设计预留），「落地状态」表加行 + 沿革注记保留旧结论。
- **未做（仍归 M3-J 校准批）**：数值全 `[PLACEHOLDER]`，`RULES.nodeKinds.enabled` 与各分型 `enabled` 仍全 `false`（玩家默认看不到）；类型开启态的手感/数值未人肉试玩。
