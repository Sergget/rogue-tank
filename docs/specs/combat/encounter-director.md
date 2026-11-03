# 遭遇导演

> **摘要**：遭遇导演——3D 切片的三波编成（W1~W3）+ 正式局（standard）波次管线（波数 = 防线/防御点数、出口硬胜利、同屏上限与分批投送、守军/防御点 A/B 开关）、阶段状态机与 `RULES.encounter` 参数口径。**时长目标 = 单节点 180~300s（2026-11-02 D1 裁定）**；当前基线待重测（历史读数 24.7~41.4s / 91s / 50.5s / 280~300s 互相矛盾，见 [遭遇节奏与时长预算](./encounter-pacing.md)）。
> **适用版本**：现行（2026-11-02；正式局管线自 2026-10-30 §4.186 起，开关态与数值沿革见「正式局扩展契约」）
> **源自**：2026-10-28 G1「完整 3～5 分钟遭遇」新增；`docs/specs/combat.md` §19（新建）
> **相关**：[遭遇节奏与时长预算](./encounter-pacing.md) · [敌方 AI](./enemy-ai.md) · [友军指挥与战术协同](./ally-command.md) · [浏览器测试链](../editor/browser-tests.md) · [渲染路线](../map/rendering-roadmap.md)

## 目录
- [遭遇形态与分层](#遭遇形态与分层)
- [波次编成](#波次编成)
- [阶段机与事件](#阶段机与事件)
- [参数表](#参数表)
- [三条关键机制与反面教训](#三条关键机制与反面教训)
- [切片专用演示缩放](#切片专用演示缩放)
- [实测数据与回归链](#实测数据与回归链)

## 遭遇形态与分层

目标是让玩家驾驶**一辆有重量的坦克 + 2 辆可指挥友军**，在节奏可控的三波攻势里持续做「走位 / 掩体 / 集火」的实时决策，波与波之间留出可用于抢修、占位、主动前压的喘息窗口。一次性放完的沙盒局面不成立。

分层边界（改这三层前先确认落在哪一层）：

| 层 | 载体 | 职责 | 不做什么 |
|---|---|---|---|
| 纯逻辑 | `js/tank_encounter.js` | 波次状态机、出生点采样与提案、事件产出 | 不触碰 `entities` / `covers` / DOM；Node 可直接测 |
| 演出与接线 | `tank_3d.html` | 实体生成、HUD 演出、喘息/告警、结算 | 不写死任何波次数值 |
| 数值口径 | `RULES.encounter`（`js/tank_rules.js`） | 全参数唯一真值源 | 页面只读不写 |

`RULES.encounter.enabled=false` 时页面退回旧沙盒（`node.enemies` 预生成），用于 A/B 对照——这是唯一允许的「非遭遇」入口，不要另辟其道。

模块每次调用返回一个**事件数组**，实体写入动作全部由页面完成（`handleEncounterEvent`）。这条边界是为了让「何时做」与「怎么做」分别在 Node 链与浏览器链上各自可测。

## 波次编成

bearing 口径：世界坐标弧度角（y 向下），`0` = 正东(+x)，`+π/2` = 正南(+y)，`−π/4` = 东北，`π` = 正西。

这张表同时给出「预设」与「实测落点」两列：

| 波 | label | 编成 | 预设 bearing（意图） | 实测落点（回退后） | 设计意图 |
|---|---|---|---|---|---|
| W1 | 侦察分队 | 3 × medium | 东 `0` | 东 `0.00` | 教学波：玩家 + 2 友军对 3 敌数量持平，但玩家侧有掩体与指挥权 ⇒ 占优；不给任何需要转炮塔的多线压力 |
| W2 | 分进合击 | 3 × medium + 1 × heavy | 东北 `−π/4` ／ 南 `π/2` | 东北偏东 `−0.44` ／ 东南偏东 `0.52` | 两个方位逼玩家分兵；heavy 放在次要方位是因为它慢，玩家可先清掉主攻的 medium 再回头处理 |
| W3 | 装甲合围 | 3 × medium + 2 × heavy | 东北 `−π/4` ／ 南 `π/2` ／ 西 `π` | 东北偏东 `−0.44` ／ 东南偏东 `0.52` ／ **西北偏北** `4.19` | 高潮：5 辆三方位，两辆 heavy 分居东南与西北，刻意不与 W2 的牵制方向重合，逼玩家整场重排防线 |

> 预设方位是「设计意图上的来袭方向」，落点是「在该方位纵深不足时回退后的实际方向」。
> HUD 的来袭提示读的是**落点**（`telegraph` 事件的 `bearings` 取自实际出生点），不是预设值——
> 这条必须对上，否则 HUD 报「南」而敌人从别处出来。

> **落点数据来源**（2026-10-28 实测）：`js/tank_encounter.js` 在 **world 1440×864 / seed 7 / `isBlocked` 恒 false / 玩家出生点 `(360,432)`**（即 `0.25w`）下跑出的 `telegraph.bearings`；三方小数按实际返回值四舍五入。
> **落点不是固定值**：`resolveBearing` 的回退判据是「该方位到战场边界的可行性纵深是否 ≥ `minSpawnDist`」，而玩家位置会改变纵深 ⇒ 玩家换位后同一波的落点可能不同。预设与实测不一致是**预期行为**，不是 bug。

> W3 的 5 辆是「同时接战仍能逐一点名」的上限——再多就变成被围死而不是决策压力。
>
> **沿革（2026-11-02）**：该「5 辆红线」是**切片口径**。正式局自 §4.195 起 `maxAlivePerWave=8`（压测证据见 §4.194），「可逐一点名」改由 `measure-encounter` 校准门按实际手感验收；D4 进一步裁定按难度分档。**本条不再作为正式局的硬上限。**

## 阶段机与事件

阶段流转：`telegraph（来袭预警）→ wave（交战）→ breather（喘息）→ 下一波 … → victory / defeat`。

| 阶段 | 进入条件 | 时长 | 退出去向 |
|---|---|---|---|
| `telegraph` | 新波首帧（`pendingTelegraph`） | `telegraphSeconds` | 计时归零 → `wave` |
| `wave` | telegraph 计时归零，同时发 `spawn` | 直到本波敌人全灭 | 清波 → `breather`（还有下一波）或 `victory` |
| `breather` | `wave-clear` 且仍有下一波 | `breatherSeconds` | 计时归零 → 下一波 `telegraph` |
| `victory` | 最后一波清波 | 终局 | — |
| `defeat` | 任意阶段 `ctx.playerAlive === false` | 终局 | — |

四条硬约束（都是防回归的）：**终局幂等**（`enc.outcome` 已定即不再产事件）、**每波恰好一条 telegraph**、**清波判定要求 `spawnedThisWave > 0`**（否则新波尚未入场就被误判通过）、**空波必须自我了结**（`spawnedThisWave === 0` 且 `emptyWave` 为真时按「已清」推进并发 `wave-empty`——否则是无敌人、无计时、无提示的软锁，见 ISSUES #AB3）。

**终局必须在调用点短路（#AB14 同批审查所得，2026-10-28）**：`enterTelegraph` 在「没有可进的波」时会把遭遇直接判成 `victory` 并写 `outcome` / 改写 `phase` / 把 `timer` 归零。若调用方（`updateEncounter` 的 telegraph 分支）不检查 `enc.outcome` 就继续往下走，条件 `timer <= 0` 立刻成立 ⇒ 同帧再发 `spawn` + `wave-empty`，并把 `phase` 从 `victory` 改回 `wave`（自相矛盾的事件序列）。今天两个调用点都带前置守卫、这条路径不可达，但它是**错误处理**路径，所以照样在 `enterTelegraph(...)` 之后留 `if (enc.outcome) return events;`。

事件契约：

| 事件 | 载荷 | 页面侧动作 |
|---|---|---|
| `telegraph` | `wave / waveId / waveLabel / seconds / bearings` | HUD 方位告警与倒计时；`bearings` **已取真实出生方位** |
| `spawn` | `wave / waveId / units[{cls,x,y,hullAngle,bearing}]` | 生成实体 + 写「进攻意志」与 `aiReactT` |
| `intel` | `wave` | 对所有存活波次敌人重刷 `lastKnownPlayerPos` |
| `wave-clear` | `wave / elapsed` | 统计与该波演出收尾（页面把它并入紧随的 `breather` 文案，见 ISSUES #AB2） |
| `wave-empty` | `wave / waveId` | 本波配置为空（`units: []`）：弹红字提示，不要把玩家丢在真空里 |
| `breather` | `seconds / repairPct / reinforce` | 按 `repairPct` 回血、按 `reinforce` 补友军 |
| `victory` / `defeat` | `stats{seconds,kills,wavesCleared}` | 结算面板 |

**补员车的编队槽号（2026-10-28 审查所得）**：页面在 `spawnTank` **之前**取 `livingAllies().length` 作 `_allyIndex`（`spawnTank` 立即入册，之后再数会把自己算进去）。取错的后果不是崩溃而是**座位错位**——首个补员被排到 1 号槽，`move`/`focus` 下还会因 `_allyCount` 与实际队形不匹配而贴在锚点上。

## 参数表

全部键的唯一真值在 `RULES.encounter`（`js/tank_rules.js`）。本页只写当前值与 rationale，其它页面一律链接到这里。

| 键 | 当前值 | rationale |
|---|---|---|
| `enabled` | `true` | 总开关；`false` 退回旧沙盒便于 A/B 对照 |
| `telegraphSeconds` | `2.0` | 够玩家把镜头/炮塔转向告警方位并对位第一发，又不至于干等；预警结束时敌人距玩家仍 > 600px，留一次抢占掩体的机会 |
| `breatherSeconds` | `12` | 三波共 2 次喘息 = 24s，抢修 + 换位 + 前压刚好够一轮决策循环；短于修理类技能的最短引导时长，避免「喘息期无限续杯」 |
| `breatherRepairPct` | `0.30`（原 `0.15`） | 切片没有维修技能、卡牌与商店，喘息是**唯一**血量补充点。0.15 只回 36 hp ≈ 1.2 秒挨打时间，等于没有；0.30 ⇒ 单次 72 hp，两次合计 60% 血池，仍**不足以**抵消 W3 五辆车的伤害预算 ⇒ 「损失有痛感」保留 |
| `reinforceMinAllies` | `1` | 友军是分兵载体，全灭后该维度决策消失，补回 1 辆让「分兵/集火」重新成立；不给满编是让损失仍有痛感 |
| `minSpawnDist` | `600` | > 玩家接战距离（`RULES.ai.engageRange` 520）⇒ 敌人是「压上来」而非贴脸生成；< 战场对角留出采样空间 |
| `maxSpawnDist` | `900` | > 900px 的敌人要以 ~80px/s 推进十几秒才接战，玩家只能干等、节奏塌陷；900 对应「敌人跑 4～6 秒进入交战」 |
| `SPAWN_DIST_HARD_FLOOR` | `380` | 模块内部常量（页面不读）。低于此距离敌人出场即互射，「压上来」的过程感全失还会让 HUD 骗人；取自 1440×864 战场居中最窄方位（正南：`864/2 − 40 = 392`）的下浮 |
| `spawnTries` | `40` | 40 次伯努利采样在 covers 密集图上仍有 ~97% 命中率；单次 O(1) 点判定，最坏 40 × 5 单位 = 200 次判定，不卡帧 |
| `intelInterval` | `6` | 语义是「进攻方指挥部持续更新你的方位」；频率低于敌人机动重掷周期，让换位/绕后的收益不被立刻抹平 |
| `waves` | 3 波 | 见 [波次编成](#波次编成)。**切片口径**——正式局（`tank_battle.html`，`standardEnabled:true`）自 2026-10-30 夜批（§4.186）起按 `standardWaves` **原型循环派生**：波数 = `node.encounterAnchors.length`（strip 防线数 4~6），第 i 波取 `standardWaves[i % len]`；`mode:'lines'` 节拍（`lineHold` 等玩家推进）见 §4.181 |

### 正式局（standard）扩展契约（2026-10-30 夜批 §4.186，现行）

- **波↔防线绑定单一数据源**：模块导出纯函数 `encounterLineXFor(enc, waveIndex)`（`lineXs` 空数组返回 `null`；否则 `lineXs[min(waveIndex, len-1)]` **钳末非取模**——波数 > 防线数时钳到最后一道，绝不折回已清防线）；实例字段 `boundLineX` 每波 telegraph 时写入；`telegraph` 与 `spawn` 事件载荷携带 `lineX`。**页面唯一来源 = 事件载荷**（页面禁止自行取模；落位组经 `pickLineByX` 按组均值 x 精确匹配，lineX 非有限或组全空才回退旧取模）。
- **胜利判定**：encounter 节点波次全清后若玩家未达 `exitX` ⇒ 只置页面 `battleExitReady`、不结算，玩家开到出口才走 clearing（Boss 节点不受影响）。
- **telegraph 文案**：有锚点且 `lineX` 有限时为「第 N 波来袭 · 前方约 Xpx」（防线语义），否则回退 bearing 八方位。
- **已知语义分歧（已定案 2026-10-31）**：`standardScale.maxPerWave` 语义定案为「**单波总敌数**封顶」（旧「每 unit 各自封顶」作废）；新增 `maxPerNode=24`（单节点总量闸，补上旧波次路径绕过铺敌上限的缺口）与 `maxAlivePerWave`（同波同屏上限）。页面按节点预算**按防线均分**并**按兵种比例裁剪**；超出同屏上限的单位进待投送队列，由击杀驱动在**摄像机视口外**逐辆补投（0.25s 节流）。三值 `[PLACEHOLDER]` 待 `measure-encounter` 标定。实测效果见 `DEVELOPMENT-batches-2026-10.md` §4.187（diff=1×6 防线 60→24 辆、单波峰值 14→≤6）。
  - **数值沿革（2026-11-02 订正）**：~~`maxAlivePerWave=4`~~ → **`maxAlivePerWave=8`**（`maxPerWave` 同步 6→8）。依据：12 辆同屏压测 §4.194（8 敌 + 2 友 + 1 玩家全层 PASS，1080p EMA 16.62ms、4→8 敌边际成本 ≈0）+ 用户 2026-11-01 裁定「1+2」落地（§4.195）。关系不变式 `maxAlivePerWave ≤ maxPerWave` 由 `test-encounter` ⑯d 锁住。**现行唯一口径 = `js/tank_rules.js` 的 `RULES.encounter.standardScale`**（当前 `{ maxPerWave: 8, maxPerNode: 24, maxAlivePerWave: 8 }`）。
  - **2026-11-02 用户裁定 D4**：同屏活体上限改为**按难度分档**（低难度回收、高难度维持 8）；分档值待 MS3 校准，标 `[PLACEHOLDER]`。

### 正式局开关态（2026-11-02 补记，**默认全关**）

以下两组机制**代码已落地、默认关闭**，属「A/B 开关」而非现行行为；文档不得把它们写成现状：

| 键 | 默认值 | 已落地批次 | 开启后的行为 |
|---|---|---|---|
| `RULES.nodeMap.defensePoints.enabled` | **`false`** | E1/E3 §4.190、E2 §4.192 | 防线 → **防御点**：点位在 covers 之前选址、墙/工事围绕点生成、波数 = 点数（4~5），逐个拔点 |
| `RULES.encounter.garrisonMode` | **`false`** | §4.189 | 守军语义：出生不预写 `aiEngaged`/`lastKnownPlayerPos`，靠 `aiTriggerDist` + LoS 自然激活；每波 1~2 辆**反冲击前锋**仍主动压上 |
| `RULES.encounter.garrisonFallbackSeconds` | **`0`（关闭）** | §4.189 | 守军超时兜底：未点亮 N 秒后注入玩家方位（标定目标 20s，**不是默认值**） |
| `RULES.encounter.garrisonVanguard` | `{ count: 2, aheadOffsetPx: 260 }` | §4.189 | 前锋数量与前出距离（末波强制 0） |
| `RULES.nodeKinds.enabled` + 各分型 `enabled` | **全 `false`** | M3-A~H §4.203~§4.210 | 节点任务类型（歼灭/防御/占领/突破/商店/补给/事件）、类型胜利条件与类型奖励；`false` 时 `node.kind` 不存在 |

`garrisonMode=false` / `defensePoints.enabled=false` 时页面走现行路径，逐字段零回归（`test-p2g-wiring.js` 89 断言、`test-e2-defense-point-waves.js` 115 断言各自锁死）。**2026-11-02 用户裁定 D2/D3 = 启用**，执行顺序按 D5：契约层 → 干净重测 → 同批翻开关 → 再校准（见 `PLAN.md` §2.10）。

## 三条关键机制与反面教训

### 1. 进攻意志必须强制写入

`js/tank_ai.js` 的敌人激活门控要求「距离 ≤ `RULES.ai.triggerDistBase`(700) **且**有 LoS」才置 `aiEngaged = true`，未激活时只做 patrol 原地微摆。

因此页面在收到 `spawn` 时必须：

```js
e.aiEngaged = true;                              // 进攻意志（必写）
e.lastKnownPlayerPos = { x: player.x, y: player.y };  // 首帧就给一次方位
```

并在随后每条 `intel` 事件（间隔 `intelInterval`）对所有存活波次敌人重刷 `lastKnownPlayerPos`。**不写这两处的后果是玩家龟缩即成无限局**——敌人永远走不到触发距离。

### 2. 入场反应延迟（`entryReactSeconds`）

波次敌人在生成时写入 `aiReactT = entryReactSeconds`（`1.5`），由 `js/tank_ai.js` 消费：`aiReactT > 0` 期间只转炮塔、不移动、不开火，`aiState = 'react'`。

反面教训：不设这个延迟，敌人出场瞬间就有 LoS 且炮塔已对准玩家（`hullAngle` 直接指向玩家），会**出场即齐射**——实测玩家在看见敌人之前就吃满一轮。1.5s 同时承担「炮塔起转」的演出窗口和玩家抢占掩体的决策窗口。

### 3. 方位可行性回退必须写回 bearing

预设 bearing 若在该方位的可行纵深 < `minSpawnDist`，按 `0 / ±0.35 / ±0.70 / ±1.05 rad` 依次左右交替试偏（`BEARING_FALLBACK_OFFSETS`），取第一个养得出来的方位；全不可行时取纵深最大者。三波预设与 seed 7 下的实测落点见 [波次编成](#波次编成)。

两条纪律：

- 回退后的 bearing **必须写回 unit**，且 `telegraph` 事件的 `bearings` 取自**已回退的真实出生点**。
- 反面教训：HUD 报「南」而敌人从别的方向出来，等于**骗玩家**——风险在于玩家按提示转向后背后挨打。

整波在 telegraph 阶段一次性预规划（`planWave`），spawn 前只做不改语义的距离校正（`applySpawnGuard`），以保证 telegraph 的提示与实际出生点始终同源。

## 切片专用演示缩放

> ⚠️ **以下三个键是 3D 切片（`tank_3d.html`）专用演示参数，不是正式平衡值。正式战斗（`tank_battle.html`）不读取它们。**
> 引用这些数值做正式战斗调平衡是错误用法——正式局的有效血量由卡牌、永久升级与维修技能共同堆叠。

| 键 | 当前值 | rationale |
|---|---|---|
| `entryReactSeconds` | `1.5` | 见 [入场反应延迟](#2-入场反应延迟entryreactseconds) |
| `playerHpScale` | `4` | 玩家与友军 `maxHp` 乘该系数（只写 `base` 后 `refreshStats`，不直写 `stats`）。正式游戏的血量堆叠通道切片一条都没接入，不缩放就是「80 血对 50 伤害」，出场两发即毁；×4 ⇒ 320 血 ≈ 承受 6～9 发，与「被打 → 找掩体 → 倒车 → 集火」的决策窗口同量级 |
| `enemyDamageScale` | `0.3` | 波次敌人 `damage` 乘该系数（页面写入 `base.damage` 后 `refreshStats`）。校准目标 = 「站桩是明确惩罚但留有 2～3 秒人类反应窗口」，真正生存手段是机动与掩体 |

模块侧不消费这三个键，只对「键存在 + 取值合法」做哨兵断言。

## 实测数据与回归链

### 实测时长（2026-10-28，**切片口径**；正式局基线待重测）

> **口径说明（2026-11-02）**：本节全部为 **3D 切片**（`tank_3d.html`，三波）的读数，**不是正式局基线**。正式局自 §4.180 起走 4~6 波 + 出口硬胜利 + 分批投送，历史读数互相矛盾（§4.180 中位 91s / §4.189 真局中位 50.5s / `encounter-pacing.md` 记的 280~300s 含撞 CAP 截断样本）⇒ **在 D5 的「干净重测」出数前，任何一方都不得作为验收依据**。D1 已裁定目标口径为**单节点 180~300s**。

用 `node scripts/measure-encounter.cjs` 跑真实遭遇（探针驱动「自动瞄准 + 持续开火」的玩家，0.5s 采样时间线）：

| 打法 | 用时 | 结果 | 清波 | 击杀 |
|---|---|---|---|---|
| 不走位、不修车 | **41.4s** | defeat | 1/3 | 4 |
| 持续倒车 | **40.4s** | defeat | 1/3 | 4 |
| 不走位（另一次） | **24.7s** | defeat | 0/3 | 2 |

**对照 G1 验收门 3～5 分钟（180～300s），差 4～12 倍。** 三次都死在第二波，且「倒车」与「不走位」几乎同时阵亡 ⇒ 生死不由走位决定。

两条根因（详见 `docs/ISSUES.md` #AB10 / #AB11）：

1. **敌人压到约 630px 就停下对射**，不再接近（11 秒只近 6px）⇒ 遭遇退化为纯 DPS 比拼，走位与掩体这两个核心决策维度被架空。承伤速率 27 hp/s 与「静止 31 hp/s」同量级，说明缩放参数是**按设计生效**的，问题是血量预算撑不住 4～5 辆车集火。
2. 波次非战斗时间是 30s（telegraph 2×3 + breather 12×2），只占目标下限的 1/6，其余全靠战斗长度支撑。

> 这条数据来自「会瞄准但不会走位」的探针玩家，不等于人类上限；但**人类不可能比探针强 4 倍**——即便走位把承伤砍半，也只是 50～80 秒量级。要进 3 分钟必须改设计（推进规则 + 减伤通道），不是微调缩放。

### 浏览器实跑（2026-10-28）

| 项 | 实测 |
|---|---|
| 出生点到玩家距离 | 506～893px（seed 7 实测：W1 810/726/628、W2 819/756/677/651、W3 893/850/760/715/506） |
| 最远两颗的推进时间 | W3 的 893px 那颗约 **4.7s**、850px 那颗约 **4.1s** 才推进到 `engageRange`（520）内（按 ~80px/s） |
| 交战中·静止不还击承伤 | **14～35 hp/s**（4 秒样本波动较大）⇒ 玩家 320 血静止存活约 **9～22 秒** |
| 交战中·持续倒车（无掩体） | 承伤下降到静止的 0～85%（波动大）⇒ **倒车不是可靠生存手段，掩体才是**（AI 的 `engageRequiresLoS` 让断视线即停火） |
| 未缩放时的静止承伤 | ≈103 hp/s（玩家 80 血 ⇒ 2.3 秒即毁）——这是必须缩放的原因 |
| 3D 场景基线 | `npm run baseline:3d` p50 17.4～17.6ms / p95 18.2ms / 6 实体 / 11MB |

### 回归链

| 链 | 落点 |
|---|---|
| Node 纯逻辑 | `scripts/test-encounter.js`（186 条断言，已登记 `scripts/run-tests.js`）：阶段转移、事件计数、全阻挡图出生点兜底、intel 间隔、方位回退、`RULES.encounter` 消费哨兵 |
| 浏览器 | `scripts/test-browser-encounter.cjs`（**第七链**，已加入 `package.json` 的 `test:browser`） |
| 既有 3D 链 | `scripts/test-browser-3d.cjs` 的「战场含敌军」断言改为「首波敌人入场（波次投放）」——旧断言隐含「开局预生成 6 敌」，新遭遇下已不成立 |
| 场景基线 | `npm run baseline:3d --check`（mean=0 max=0） |

## 相关页面
- [敌方 AI](./enemy-ai.md) — 激活门控、`aiReactT` 与 `engageRequiresLoS` 的行为侧口径
- [友军指挥与战术协同](./ally-command.md) — 喘息期补员（`reinforceMinAllies`）所依赖的友军命令系统
- [浏览器测试链](../editor/browser-tests.md) — 七链的组成与跑法（含新增 encounter 链）
- [渲染路线](../map/rendering-roadmap.md) — G1 品质切片的整体范围与 Go/No-Go 门槛
