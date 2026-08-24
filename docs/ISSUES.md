# Rogue Tank — 工程问题清单（已核实）

> **本文档是临时文档**：只存放**待处理 / 处理中**的已核实问题。
> 条目**修复并验证有效后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。

## QA Test Infrastructure Issues（2026-08-19）

> 当前无待处理问题。

---

> 已解决并归档的历史条目（#1~#26, #44, #49, #60~#75 及修复记录、附注特性）：见 `ARCHIVE.md`.

## 玩法设计问题（2026-08-24）

### #76. 难度未驱动敌方属性与 AI 状态机分化

**可复现证据：**
- `js/tank_rules.js:296-303` 定义了 `RULES.difficulty`（curveStart/span/pow/enemyCountMax/aiTierMax/statMultMax），但 `js/tank_map.js:51-55` 的 `statMultForDifficulty` 仅用于 `js/tank_mvp.html:689-694` 的 `applyDifficulty`，只给 `maxHp`/`penetration`/`damage` 三个属性加乘子。
- 用户点名的装甲值（`armor.*`）、射速（`reload`）、精度（`spreadMult`/`aimSpeed`）、速度（`maxSpeed`）、转速（`turnRate`/`turretTurnRate`）在 `applyDifficulty` 与 `computeStats`（`js/tank_model.js:11-71`）中**完全不受难度影响**。
- `js/tank_ai.js:18,30` 的 `aiDecideEnemy` 只读取 `RULES.ai`，**无 difficulty/aiTier 引用**（已 grep 确认）。
- `aiTier` 在 `js/tank_map.js:132,221` 计算并挂在 node 上，但 `materializeNode`（`js/tank_map.js:435-471`）的 spawnTank spec 未把 `aiTier` 注入实体 → `aiTier` 是死值，从未被消费。
- 绕行攻击范围写死常量：`flankMinDist=400`（`tank_ai.js:107`）、`flankDist=300`（`tank_ai.js:124` 硬编码）、`engageRange=520`（`tank_ai.js:58`）。
- "随机旋转车体暴露侧面"行为缺失：`patrol` 分支（`tank_ai.js:173-181`）无随机摆动，`RULES.ai.patrolWanderSigma`/`patrolWanderSpeed`（`tank_rules.js:278-279`）未被消费。
- "高难度重坦主动找掩体"行为缺失：Defensive 仅 `dist>engage*3+500≈2060px` 触发（`tank_ai.js:144`），且**无任何朝最近掩体移动逻辑**；`RULES.ai.defensiveCoverThreshold`（`tank_rules.js:270`）从未被 `tank_ai.js` 引用。

**根因：** 难度只作为数值乘子作用于少量属性；AI 行为参数写死在代码/常量中，`aiTier` 死值未接线到实体与 AI。

**影响：** 不同难度敌人体感高度雷同，缺乏难度梯度带来的博弈差异；用户设想的"低难更小绕行范围/随机横移露侧、高难重坦找掩体"全部缺失。

**进展（2026-08-24）**：「距离受难度影响」已部分落地——RULES.ai.triggerDistBase/triggerDistDiffMultMax + tank_map.triggerDistForDifficulty + 实体 aiTriggerDist 注入；同时 AI 激活门控由摄像机视野（P-10 旧设计）改为距离+可见性触发，生成点距玩家 ≥ 触发距离×1.05。条目其余范围（装甲/射速/精度/速度等属性难度分化、flank/patrol/defensive 行为参数全面难度化、patrolWander 消费）仍待处理。

**状态：** 待处理

### #77. 掩体相对坦克过大、密度偏低、全高掩体过少

**可复现证据：**
- 坦克体量（世界单位，固定不随节点缩放）：`js/tank_model.js:140` `hullLen:64, hullWid:38`；Tiger I 实际 `hullLen=69px`（`js/tank_rules.js:319,330`），约 6.3m×3.5m（PX_PER_METER≈10.92）。
- 掩体经 `nodeScale:3` 放大到世界（`js/tank_rules.js:243`）：典型半高墙模板 w:80~90 → 世界 240~270px（≈4× 坦克长）；全高建筑 w:100~120 → 世界 300~360px（≈5× 坦克长）；沙袋 180~210px；仅树(72px)≈坦克大小。
- 全高太少：7 个 `NODE_TEMPLATES`（`js/tank_nodegen.js:48-268`）全高分布为 0/0/5/4/2/5/0，其中 `corridor_tutorial`/`forest_dense`/`woodland_line` 三个模板全高=0；低难度还会 `full→half` 降级（`js/tank_nodegen.js:413-420`）且随 `cullRate` 随机剔除元素（`js/tank_nodegen.js:387,399-401`）→ 前中期节点近平原战斗。
- 稀疏：每节点 14~19 个掩体散布在约 2.1M~4.0M px² 世界，掩体覆盖面积占比约 10~15%，对战术博弈偏稀。

**根因：** 节点模板尺寸按"模板单位×3"放大且偏低密度；低难度主动降级/剔除全高掩体。

**影响：** 多数节点等同平原战斗，掩体博弈缺失。

**状态：** 待处理

### #78. 掩体形状单一(矩形为主)，缺不规则岩石/连续曲线水域/烂泥减速地形

**可复现证据：**
- 引擎已支持多边形顶点：`coverCorners`/`coverCollisionParts` 当 `cov.verts≥3` 走多边形（`js/tank_cover.js:143-156`），`findCoversOnRay` 也消费多边形角点；但 7 个模板中仅 `urban_block`（`js/tank_nodegen.js:113-125`）、`village_center`（`js/tank_nodegen.js:207-219`）各 1 个掩体用 `verts`/`collisionVerts`，且只是"矩形+缺口"，并非不规则岩石。其余 ~115 个元素全是 `w/h/angle` 矩形 OBB。
- `RULES.coverTiers`（`js/tank_rules.js:81-92`）现有 tier：half/full/bush/tree/fallen/soft/barricade/stump/rubble/water/bridge；**无 rock、无 mud**。
- 水域 `water` 是 `mode:'solid'` 且 `draw:'box'`（`tank_rules.js:91`）：① 矩形 OBB 而非连续曲线；② `mode:'solid'` 既挡炮弹又因 `move:0.0` 完全阻断移动，非单纯地形。且仅"每节点≤1、概率 diff*0.5、封顶 40% 节点尺寸"生成（`js/tank_nodegen.js:476-491`）。
- 烂泥地（拖慢、不挡弹）：系统把"地形/掩体"统一抽象为 `covers` 数组，**无独立地面地形图层**；`driveTank` 运动系数取自 `COVER_TIERS[tier].move`（`js/tank_move.js:24-40`），`resolveCoverCollisions` 仅对 `solid` 推出（`js/tank_move.js:52`）。现有 tier 中无"减速但不挡弹"的地面地形（soft 可击毁、half 参与弹道遮蔽）。

**根因：** 数据层未充分利用引擎既有的多边形顶点能力；缺 rock/mud tier 与"减速不挡弹"地形图层概念。

**影响：** 地形同质化，缺自然掩体形态（不规则岩石、连续曲线水域）与减速地形博弈。

**状态：** 待处理

### #79. 完成 5 节点后无终局结算/商店/难度升级；无手动结算保存

**可复现证据：**
- `js/tank_map.js:377-387` `generateRun` 构建固定 `runNodeCount`(默认 5) 节点链，无终局/胜利处理。
- `tank_mvp.html:787-796` `nextNodeAfterReward`：末节点清除后仅 `transition(flow,'map',{finished:true})`，回到节点地图起始，**不进入商店/难度升级终局**。
- `js/tank_flow.js:26-27,32`：`shop` 仅可从 `home`/`loadout` 进入（局前）；`reward:['battle','map']` 无"完成→商店"分支。
- `tank_mvp.html:846-860` `settlement` 每节点后显示，`settleNextBtn`(:963) 仅去 `reward`，无最终 run 结算。
- 手动结算+保存 UI 缺失：所有 `saveProfile`/`saveActiveProfile` 调用均在局外（商店购买 :1233/1239/1251/1259、死亡转换 :883、buyUpgrade :934/942、startNewRun :957、beginRunFromMenu :1296）；局内 `settlement` 无保存动作。
- 难度跨局不升级：`tank_mvp.html:953` `startNewRun` 用新 seed 调 `generateRun` 重建相同 0.15→0.95 曲线；M10 `shop` 仅施加玩家永久 buff（`applyUpgrades`），从不提升敌方/难度参数。`js/tank_map.js:27-32` `difficultyForIndex` 仅局内逐节点 0.15→0.95 单调升。

**根因：** 流程状态机缺"完成 run 终局结算→商店→难度升级"分支；无局内手动结算/保存入口；跨局难度曲线恒定。

**影响：** 玩家打完 5 节点即"白打"，无资源结算/商店消费/难度成长正反馈（与 #76 互补：#76 是难度不驱动 AI/属性，此处是流程缺结算闭环）。

**设计更新（2026-08-24）**：单局改为开放式节点链，「完成 5 节点即终局」概念取消——终局 = 死亡耗尽 或 ESC 主动终止并结算（DEVELOPMENT.md §2.1 / PLAN P-34）。本条所列问题（无终局闭环/无手动保存/难度跨局不升级）仍然成立，修复按新设计执行。

**状态：** 待处理

### #80. 缺少 ESC 暂停/设置面板；倒车左右转向未倒置且无开关

**可复现证据：**
- `js/tank_flow.js:14-17` `FLOW_STATES = ['home','loadout','shop','map','battle','settlement','reward','gameover']` 无 `pause` 态；`tank_flow.js:23-34` 无暂停转移。
- `tank_mvp.html` 无 `Escape` 处理器（移动键 :460-464、弹药 1-9/Q :514-519、Tab/反引号/F12 面板 :548-552）；无暂停/设置/按键绑定配置面板（`tank_designer.html:1302` 的 Escape 仅用于设计器，与本游戏无关）。
- `js/tank_move.js:35` `driveTank` 直接 `t.hullAngle += turn * t.stats.turnRate * dt * turnModifier * debuffTurnRate(t)`，`turn` 不随 `move` 符号翻转；模块内无倒车转向倒置开关。

**根因：** 流程状态机与 UI 均无暂停/设置概念；倒车转向逻辑固定为非倒置。

**影响：** 玩家无法随时暂停/改键；倒车时转向手感反直觉（且无可选倒置开关）。

**设计更新（2026-08-24）**：ESC 面板将承载「终止游戏并结算」入口（PLAN P-35/P-34）；暂停/改键诉求不变。

**状态：** 待处理

### #81. 战斗地面单一平坦，缺生物群落地貌（混凝土/草原/黄草/泥潭/蓝水）

**可复现证据：**
- `tank_mvp.html:1848` `draw()` 仅 `ctx.clearRect` 清屏；地面为画布 CSS 底色 + 统一淡网格（:1859-1861, 40px 单元格，rgba(255,255,255,0.035)）。无任何 `drawGround`/`drawBackground` 主题化绘制。
- 无独立于 `covers` 的地面/地形层：`js/tank_battledraw.js` 仅 `drawCover`(:141)/`drawFoliage`(:161)/`drawTank`(:172)，无地面绘制函数；`js/tank_paint.js` 仅坦克渲染。
- 节点模板无 biome 标签：`grep biome|terrain|ground|theme` 在 `js/tank_nodegen.js` 无匹配；地形仅以 `covers` 障碍表达（`water` 是 `mode:'solid'` 实心障碍 `tank_rules.js:91`，非背景水体）。
- `RULES.coverTiers`（`tank_rules.js:80-93`）仅 half/full/bush/tree/fallen/soft/barricade/stump/rubble/water/bridge，**无 mud/concrete/grass 等地貌 tier**。

**根因：** 地面绘制缺主题化步骤，地形仅以障碍 covers 表达；节点模板无 biome 标签。

**影响：** 战斗画面同质化，缺地貌视觉差异（与 #78 的"减速不挡弹泥潭地形"诉求互补：#78 侧重 cover 形态，#81 侧重背景地面主题化）。

**状态：** 待处理

### #82. Boss 仅在链尾节点生成，无"每 5 节点一个"节奏配置

**可复现证据：**
- `tank_mvp.html:642-650` `assignBossNode(run)` 仅把 `run.nodes[last]` 标 `boss` 并清空其 `enemies`；:697 注释"链尾节点 spawn Boss 实体"；:698-732 `enterBattle` 仅 `if(node.boss)` 创建 Boss。
- `js/tank_map.js:377` `generateRun(seed,count,env)` 构建 `count` 节点，除 `assignBossNode` 外无任何节点被标 boss；`js/tank_rules.js` 仅有 `killScoreBase`(:309) 提及 boss，**无 `bossInterval`/节奏配置**。
- 结论：Boss 当前**只出现在最后一个节点**，并非每 5 节点一个，且无可调节奏参数。

**根因：** Boss 节奏硬编码为"链尾唯一"，无按节点索引的周期配置。

**影响：** 用户预期的"每 5 节点一个 Boss"未实现；长 run 中途无 Boss 节点，节奏单调。

**设计更新（2026-08-24）**：裁定维持「每 5 节点一个 Boss」，由开放式长链激活其意义（DEVELOPMENT.md §2.1 / PLAN P-37）。

**状态：** 待处理

### #83. 敌方 AI 开局一次性生成，缺进度推进/镜头外递增生成

**可复现证据：**
- `js/tank_map.js:442-454` `materializeNode` 遍历 `node.enemies` 在节点实体化时**一次性** `env.spawnTank(...)` 全部敌人；`tank_mvp.html:674-695` `enterBattle` 调 `materializeNode`，所有敌方坦克+据点同时生成，Boss `summons`(:713-731) 亦同一时刻全量生成。
- 无波次/配额/镜头外进度生成：`grep wave|quota|killTarget` 在 `tank_mvp.html`/`tank_map.js` 无触发生成的机制；唯一 `spawnTank` 调用即开局批次与 Boss 召唤。
- 清场判定为"击杀全部初始生成"：`tank_mvp.html:739-741` `livingNodeEnemies()` 返回 `nodeSpawn && team==='enemy' && hp>0`，该列表清空即节点结束；无超出初始批次的击杀目标。

**根因：** 敌方生成完全前置且批量；无随节点进度/镜头外动态生成机制与击杀配额。

**影响：** 每节点战斗密度固定、缺乏"随推进增兵"的压迫感；单局可击杀数受限于初始批次。

**状态：** 待处理

### #84. 镜头大小固定，滚轮被改作弹药切换，无缩放

**可复现证据：**
- `js/tank_camera.js:26` `zoom: opts.zoom || 1` 默认 1；全局 `grep '\.zoom\s*='` 无任何运行期赋值，`zoom` 恒为 1。
- `tank_mvp.html:520-523` `window.addEventListener('wheel', ...)` 调 `cycleAmmo(e.deltaY>0?1:-1)`，为 `passive` 且仅在 `inMenuState()` 内生效——滚轮被用于弹药槽循环，**未绑定缩放**；无独立 zoom 控制。
- `cam.zoom` 已被 `worldToScreen`(:75)/`screenToWorld`(:83)/`clampCameraToBounds`(:55-57) 消费，且绘制经 `ctx.scale(cam.zoom,cam.zoom)`（`tank_mvp.html:1853`）应用——**缩放管线已具备**，仅缺运行期写入路径。

**根因：** 缩放参数存在但恒为 1；滚轮被弹药切换占用，未接 zoom。

**影响：** 玩家无法放大观察/缩小纵览战场；滚轮交互与缩放预期不符。

**状态：** 待处理

### #85. 水体 tier 文档/代码矛盾（mode:'solid' 挡弹 vs AGENTS.md 称 pass 越飞）

**可复现证据：**
- `js/tank_rules.js:91` `water`：`mode:'solid'`, `move:0.0` → 炮弹 100% 被挡（`tank_cover.js:349` `solid`→`return 0`），坦克不可入。
- `AGENTS.md` §4 描述：`pass (soft/water — penetrable by shells; water blocks movement)` —— 称 water 应为 `pass`（炮弹越飞、仅挡移动）。
- 二者矛盾：代码把水当实心障碍挡弹，文档称水应让炮弹越过。

**根因：** 文档与实现对 water 的弹道语义不一致，且 `RULES.coverTiers` 无 `mud` tier（与 #81/#78 协同，地形富集前须先裁定）。

**影响：** 在落地「地形类型抽象」(PLAN P-40 / specs/map.md §5) 前，必须先行裁定水潭/河流是否挡弹，否则设计值（5.2 表 water `shellBlock=false`）与现有代码冲突，无法一致落地。

**裁定（2026-08-24）**：以 AGENTS.md §4 为准——水 = 炮弹越飞（不挡弹）、阻挡坦克移动。待代码落地：`js/tank_rules.js:91` water 的 `mode:'solid'` 改为 pass 语义（保留 `move:0.0` 移动阻断），随 PLAN P-40 实施并同步 specs/map.md §5.2。

**状态：** 处理中

---

