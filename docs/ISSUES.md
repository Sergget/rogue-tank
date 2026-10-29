# Rogue Tank — 工程问题清单（已核实）

> **临时文档**：只存放**待处理 / 处理中**的已核实问题。每条必须有代码证据（`file:line`）与复现/触发条件；绝不收录未核实项。
> 条目**修复并验证有效后**按 `AGENTS.md` 4 步生命周期收尾：结论同步 `DEVELOPMENT.md` / `specs/` → 删除本条目 → 原文归档 `docs/archive/<yyyy-mm>.md` → 联动下一步计划。
> 已解决并归档的历史条目（#1~#26、#44、#49、#60~#101、#A1~#A28、#B1~#B11、#C1~#C4/#C6、#C5、#D1~#D5、#A9、#E1~#E13、#F1~#F6、#G1~#G9、#H1~#H5（2026-09-21 视野批次）、#H1~#H4（2026-09-30 敌军基准/布雷/技能槽批次）、#I1~#I4、#J1~#J4、#K1~#K3、#A16、#L1~#L7（2026-10-06 整车精灵对齐批次）、#M1~#M3（2026-10-08 设计器精灵绘制批次）、#L8 + #M4（2026-10-08 白底清理与炮塔参数重算）、#S8（2026-10-14 CI 校准基线第六次修正）、#S4 + #S14（2026-10-14 公路加速恢复与道路屏蔽减速）、#S9 + #S10（2026-10-14 暂停菜单商店与面板刷新）、#S3-UI（2026-10-14 Boss 血条）、#S6 + #S5（2026-10-14 副武器卡补齐与 Boss 弹种保底）、#S12 + #S1 + #S11 + #S13（2026-10-15 地图视觉四项）、#S2 + #S3（2026-10-15 AI 警觉与 Boss 行为）、#T1~#T6（2026-10-16 拉取后代码审计）、#U1~#U23（2026-10-17 用户反馈批次）、#U24~#U34（2026-10-17/18 第二轮反馈批次 + 布点避路 + 河流互斥 + 河道形态）、**#V1/#V2 + #W7~#W18 + #X1~#X7 + #Y1（2026-10-20 全量清账批次，见 §4.112）**）：见 `docs/ARCHIVE.md` 索引表。
> **2026-10-15 拉取后缺陷清理（未走 ISSUES 条目，直接落 §4 正文）**：本次发现的两个缺陷（#8 TAB 面板 `tanks` 未定义冻结主循环 / #6 上调 `entityMults` 致 `test-modifiers` 夹具失效）**发现即修复并三链验证通过**，未经 ISSUES 中转，结论直接落 `docs/DEVELOPMENT-batches-2026-10.md` §4.79 与 `specs/combat.md` §9.8/§13.4、`specs/map.md` §16。
> **编号重叠说明（2026-10-04 核实）**：`#H1~#H5` 与 `#H1~#H4` 分属**两个不同批次**（2026-09-21 视野等距批次 / 2026-09-30 敌军基准批次），编号发生重叠——与 `AGENTS.md` §2「编号不复用、跨批次延续」相悖，属历史遗留。因归档原文按纪律不可回改、且编号已被 `DEVELOPMENT.md` §4.40 与 `specs/combat.md` §13.1~§13.4 交叉引用，故**保留原编号 + 在此按日期与主题区分**（引用时须带批次日期），不再另案重编。

---

## #AC 批次（2026-10-29 audit-growth-curve 暴露的既有平衡债务）


## #AB 批次（2026-10-29：**#AB10 唯一存量**（规格已定、实现待 MS2）；#AB18 已关账（§4.176）；其余 14 条已修待归档）

> **#AC1 已于 2026-10-29 关账（§4.178）**。当前 ISSUES 存量仅 **#AB10**。

> **2026-10-29 更新**：#AB11/#AB11b/#AB12（MS1 收口）、#AB18（hull-down 路线 ②，§4.176）已关账归档。**唯一存量：#AB10**（遭遇时长内容量，规格已定 §4.159，实现待 MS2 波次导演进正式局）。

> **来源**：本日 G1 收尾（§4.155 完整遭遇 / §4.156 性能预算与降级）后的自查复查。以下每条**均已用代码证据 + 实跑复现核实**，不是推测。
> 修复顺序建议：**#AB1 → #AB3 → #AB2 → #AB4 → #AB5 → #AB6 → #AB7**（#AB1 影响所有玩家的画面几何，#AB3 是软锁，其余是体验与测试可信度）。#AB8 已在复查当轮修掉。**#AB10 / #AB11 优先级最高**——实测遭遇只有 41 秒（目标 3～5 分钟），且敌人压到 630px 就停下对射。

### #AB1 画面被拉伸变形：画布比例不跟随视口

- **证据**：`tank_3d.html:12` `#c { display:block; width:100vw; height:100vh; }` —— canvas 永远被 CSS 拉满视口；而基准渲染分辨率是固定值（`tank_3d.html` 的 `BASE_RES`，缺省 1280×720，或由 `?w=&h=` 指定），`applyRenderScale()` 只按它算尺寸，**没有任何一处跟随视口比例**。
- **实测（2026-10-28，`tmp/dbg-stretch.cjs`）**：

  | 视口 | canvas | CSS 盒子 | 横向缩放 | 纵向缩放 | 变形比 |
  |---|---|---|---|---|---|
  | 1280×800（16:10，Deck 尺度） | 1280×720 | 1280×800 | 1.000 | 1.111 | **1.111** |
  | 1600×900（16:9） | 1280×720 | 1600×900 | 1.250 | 1.250 | 1.000 |

- **影响**：玩家在 16:10 / 3:2 / 超宽屏上看到的是**画面几何失真**（圆形掩体变成竖椭圆、坦克被拉高），不是留黑边。这是最容易被读成「美术做歪了」的一类缺陷。
- **修法（已落地，§4.157）**：`BASE_RES` 无 `?w=&h=` 时取 `innerWidth/innerHeight`（1 CSS px = 1 渲染 px），并按 `RES_MAX_PIXELS = 1920×1200` 的像素预算**等比**收缩（4K 视口不按 4 倍填充率渲染）；显式 `?w=&h=` 仍钉死（基线/对照/三档测试要可复现）；另加 250ms 防抖的 `resize` 重算，否则拖拽/全屏后又回到拉伸。
- **验证（2026-10-28，`scripts/test-browser-perf.cjs` 第 4 组）**：1280×800 视口下 `base=1280×800`、`变形比=1.0000`（修复前 1.111）；视口改 1600×900 后基准跟随重算；`?w=1280&h=720` 在 1280×800 视口下仍为 1280×720（`baseAuto=false`）。
- **状态**：已修（待归档）。

### #AB2 波次清除提示会被喘息提示当场顶掉

- **证据**：`tank_3d.html:703-705`（`case 'wave-clear'` → `toast('第 N 波清除')`）与 `tank_3d.html:717`（`case 'breather'` → `toast('喘息 …')`）。`js/tank_encounter.js:479-488` 在**同一次 `updateEncounter` 调用**里连续 push `wave-clear` 与 `breather` 两条事件 ⇒ 页面同帧连续两次 `toast()`，第二次覆盖第一次（`toast()` 只有一个 DOM 槽位，`tank_3d.html:201`）。
- **影响**：玩家永远看不到「第 N 波清除」这条正反馈——而它是节奏里唯一的「你赢了这一波」的确认。同一类问题今天已在画质提示上踩过一次（已改用独立 `#perfNotice`）。
- **修法（已落地，§4.158）**：走 ① —— `wave-clear` 只记录到 `pendingWaveClear`，由紧随其后的 `breather` 合并成一句「第 N 波清除 · 喘息 12s · 抢修 +72 · 补员 N」；最后一波没有喘息可合并，直接单独弹；`spawn` 与 `restartEncounter()` 会清残留，避免跨波次带出旧文案。
- **状态**：已修（待归档）。

### #AB3 波次可能永久卡住（无敌人、无提示、无计时）

- **证据**：`js/tank_encounter.js:476` 的清波判定是 `enemyAlive === 0 && enc.spawnedThisWave > 0`。而 `enc.spawnedThisWave` 来自 `applySpawnGuard()` 的返回长度（`js/tank_encounter.js:457-458`），该函数对 `enc.pending` 做 **1:1 映射**（`:329-343`）——**pending 为空则 spawn 事件带空 units、`spawnedThisWave = 0`**，于是本波永远不满足清波条件，也不会判负（玩家还活着）。
- **触发条件**：`RULES.encounter.waves[i].units` 为空数组，或 `planWave` 因配置异常产出空 pending。今日配置下不会发生，但这是给后续调波次的人埋的**软锁**：最后只能用浏览器刷新逃生（R 键重开只在结算态生效，`tank_3d.html:1130` 附近）。
- **影响**：一旦踩中就是「游戏卡住且没有任何提示」，玩家会认为游戏崩了。
- **修法（已落地，§4.158）**：`spawn` 时 `enc.emptyWave = units.length === 0`，清波判定改为 `enemyAlive === 0 && (spawnedThisWave > 0 || emptyWave)`，并补发 `wave-empty` 事件；页面据此弹「第 N 波配置为空」红字提示。**反向验证**：`test-encounter.js` 用「空波 + 正常波」两波编成跑完整流程，断言产出 1 条 `wave-empty`、2 条 `wave-clear`、结局 `victory`——没有这层保护时该用例会卡在 `maxFrames`（outcome=null）。
- **状态**：已修（待归档）。

### #AB4 `intelInterval = 0` 会静默关掉「进攻意志」

- **证据**：`js/tank_encounter.js:470-474`，intel 事件由 `while (iv > 0 && enc.intelTimer >= iv)` 发出；`resolveEncounterConfig` 只做 `Math.max(0, …)`（`:176`），允许 0 ⇒ 该 while 永不进入 ⇒ **不产 intel 事件** ⇒ 页面 `refreshEnemyIntel()`（`tank_3d.html:523`）永不执行 ⇒ 敌人只在出生那帧拿到玩家方位。
- **影响**：`intelInterval = 0` 在语义上像是「不需要刷新」，实际等于**关掉防龟缩机制**——正是 §4.155 记录的三个反面教训之一。谁把它调成 0 试一试，就会得到一个「玩家躲着就永远打不完」的版本，而且没有任何报错。
- **修法（已落地，§4.158）**：新增模块常量 `INTEL_MIN_SECONDS = 0.5`，`resolveEncounterConfig` 用 `Math.max(INTEL_MIN_SECONDS, …)` 钳位（0 与负值都落回 0.5s），并导出供测试引用。
- **验证**：`test-encounter.js` 三条——0 被钳到 0.5、负值同样被钳、**哨兵**「钳位后 intel 事件真的发得出来」（20 秒内 36 条）。
- **状态**：已修（待归档）。

### #AB5 `test-browser-r4` 的 #J4 断言用固定等待 ⇒ 偶发假红

- **证据**：`scripts/test-browser-r4.cjs:726` `await waitFor(1200)` 之后立刻比对 `window.__shots.secondary`。导弹需「对准 → lock-on → 发射」三段时序，固定 1200ms 在慢帧机器上不够。
- **实测（2026-10-28）**：全量 `npm run test:browser` 时出现 `FAIL | #J4 对准后进入 lock-on（百分比）并成功发射 | lockOn=true shots 72 → 72`；紧接着单独重跑该链 `PASS … shots 75 → 76`。
- **影响**：假红会让「八链全绿」这个结论不可信，也让真正回归被噪音掩盖。
- **修法（已落地，§4.158）**：改成条件等待 `waitForFunction(() => __shots.secondary > shotsBefore, { timeout: 4000 })`，**保留 4s 上限**——真有「永不发射」的回归仍判红，只是不再赌时序。
- **验证**：单跑 `test-browser-r4` PASS（`lockOn=true fired=true shots 69 → 70`）。
- **状态**：已修（待归档）。

### #AB6 `particlePeak` 不随重开复位

- **证据**：`restartEncounter()`（`tank_3d.html` 内，清 `shells/impacts/bounceFx/particles`、`shotsFired`、`enemySeq`、`lastEnemyAlive`）**没有重置 `particlePeak`**；该变量只在 `__TEST3D__.perf().reset()` 里归零。
- **影响**：重开一局后 F1 清单与浏览器链读到的「粒子峰值」包含上一局数据，用它去校准 `particleCap` 会得到偏大的结论（诊断可信度问题，非玩法缺陷）。
- **修法（已落地，§4.157）**：`restartEncounter()` 内 `particlePeak = 0;`。
- **状态**：已修（待归档）。

### #AB7 R 键在结算态同时承担两件事，会残留一条提示到新一局

- **证据**：`tank_3d.html:450` `reloadClip: () => { if(… reloadClipWeapon(player)) toast('弹夹整装 — 重装完整弹夹'); }`；`tank_3d.html:1271-1276` 「结算态 R 重开」是**另一个**独立的 `keydown` 监听。两个监听都在 `window` 上，同一次按键会**都**触发；`restartEncounter()` 不隐藏 `#toast`。
- **触发条件**：**胜利**结算界面按 R（玩家还活着 ⇒ `reloadClipWeapon` 成功 ⇒ 弹提示）→ 新一局里残留「弹夹整装 — 重装完整弹夹」约 2 秒。失败结算时玩家已阵亡，`reloadClipWeapon` 大概率为假，所以只暴露在胜利路径上。
- **影响**：低（一条 2 秒的错位提示），但属于「同一按键两个语义」的结构性问题，后续加更多结算操作时会继续放大。
- **修法（已落地，§4.157）**：`input.actions.reloadClip` 加 `if(encOutcome) return;` 门控。
- **验证**：`scripts/test-browser-encounter.cjs` 在胜利态按 R 后断言 `#toast` 不含「弹夹整装」——实测 `toast="第 3 波清除" display=none`（未触发装弹）。
- **状态**：已修（待归档）。

### #AB8 来袭预警层会先显示空框（0~150ms），且测试用瞬时取值抓它

- **证据**：`renderEncHud()`（`tank_3d.html`）原先用 `const on = encounter.phase === 'telegraph'` 决定显示预警层，而文案 `encWarnText` 要等 `telegraph` **事件**才被赋值。首帧 `update()` 可能一次都没跑（`acc < STEP`），于是 phase 已是 `telegraph`、文案仍是空串 ⇒ 屏幕上闪一个空框。HUD 每 150ms 重绘一次，所以这个窗口最长 150ms。
- **测试侧的放大**：`test-browser-encounter.cjs` 原先在 `ready` 之后**瞬时**读 DOM，正好撞进这个窗口 —— 实测一次读到 `{"display":"block","text":""}`、修好页面后读到 `{"display":"none","text":""}`（后者是正确行为，却让断言红）。
- **影响**：视觉上是一次极短的空框闪烁（玩家多半只当成加载抖动）；工程上是「用固定时刻取值测异步 UI」的典型案例，与 #AB5 同源。
- **已修（2026-10-28）**：
  1. `tank_3d.html`：`const on = encounter.phase === 'telegraph' && encWarnText !== '';` —— 文案未就绪就不显示，不闪空框。
  2. `scripts/test-browser-encounter.cjs`：改成 `waitForFunction` 条件等待（5s 上限），等到「层可见 + 文案非空」再断言。
- **验证**：该链连跑 2 次均 `PASS | 来袭预警可读 | {"display":"block","text":"第 1 波来袭 · 东"}`，`全部通过`。
- **状态**：已修并验证；**尚未走 4 步生命周期归档**（结论未写入 `DEVELOPMENT.md` / specs），下次收口时一并处理。

### #AB9 `SPAWN_DIST_HARD_FLOOR` 的文档口径与代码不符（且命名与同表其它键不一致）

- **证据**：`docs/specs/combat/encounter-director.md:92` 写「模块内部常量（页面不读）」；实际它是 **`RULES.encounter` 的键**（`js/tank_rules.js:988` `SPAWN_DIST_HARD_FLOOR: 380`），且 `resolveEncounterConfig` 明确从配置读取（`js/tank_encounter.js:174` `encNum(src.SPAWN_DIST_HARD_FLOOR, …)`）。
- **影响**：① 想调这个值的人照文档去模块里找常量，会改错地方（模块里的 `ENCOUNTER_DEFAULTS` 只是兜底）；② 同一张参数表里只有它用 SCREAMING_SNAKE，其余全是 camelCase，容易被当成「不是配置项」。
- **建议修法**：文档改成「`RULES.encounter` 键，页面不读、模块在采样与外推校正时消费」；键名若要统一风格需同步改 `tank_rules.js` / `tank_encounter.js` / `test-encounter.js` 三处（**改名属契约变更，需一并更新 specs 与本表**）。
- **状态**：已修（`browser-tests.md` 已改为「首波 3 敌（波次投放，见 encounter 链）」；`SPAWN_DIST_HARD_FLOOR` 改名未做，保留原键名以免牵动其它引用）。

### #AB10 G1 的核心验收指标「3～5 分钟遭遇」没有任何实测证据

- **证据**：
  - `docs/DEVELOPMENT.md:66` 写「**完整 3～5 分钟遭遇已于 2026-10-28 完成（§4.155）**」；`docs/specs/combat/encounter-director.md:3` 摘要写「3D 切片的完整 3～5 分钟遭遇」——两处都是**陈述句**，没有 `[PLACEHOLDER 待实测]` 标注。
  - 但仓库里**没有任何一局真实通关的时长记录**：`scripts/test-browser-encounter.cjs` 里 `killAllEnemies()` 用了 3 次（靠清场推进波次），全文没有一处读 `encounter().elapsed` 做时长断言；Node 链 `scripts/test-encounter.js` 用假 ctx 手动推进 dt，更不反映真实战斗长度。
  - 已实测的只有**非战斗时间**：telegraph 2s × 3 + breather 12s × 2 = **30 秒**，占「3～5 分钟」的下限不到 1/6。剩下 2.5～4.5 分钟全部取决于战斗时长，而战斗时长一次都没测过。
- **实测（2026-10-28，`node scripts/measure-encounter.cjs`，自动瞄准 + 持续开火、不走位不修车）**：

  | 时点 | 阶段 | 场上敌人 | 玩家 hp | 累计击杀 |
  |---|---|---|---|---|
  | 0.6s | telegraph（W1） | 0 | 320 | 0 |
  | 5.5s | wave | 2 | 310 | 1 |
  | 15.5s | breather（W1 清完） | 0 | 300 | 3 |
  | 25.5s | telegraph（W2） | 0 | 300 | 3 |
  | 30.5s | wave | 4 | 255 | 3 |
  | 35.5s | wave | 3 | 97 | 4 |
  | **41.4s** | **defeat** | 3 | **0** | 4 |

  **总时长 41.4 秒，清 1 波，评级无**。同工具另两次实测：**24.7 秒**（W1 都没清完、只杀 2 辆）、
  「持续倒车」版 **40.4 秒**（与不走位几乎相同 ⇒ 生死不由走位决定）。三次落在 **24.7~41.4 秒**。
  同期承伤速率：W2 的 11 秒内掉 300 hp ≈ **27 hp/s**——与 §4.156 记录的「静止 31 hp/s」同量级，说明**缩放参数按设计生效了**，问题是**血量预算撑不住 4 辆车的集火**，不是缩放没起作用。
- **影响**：G1 的验收门写着「能玩 3～5 分钟」，实测 **41 秒**。**按现有数据 G1 这一项没过**，而文档写成已完成。
- **建议修法**（按成本从低到高）：
  1. 先把两处文档改成 `[PLACEHOLDER 待实测]` + 写上 41.4s，别写成既成事实（**5 分钟就能做完**）；
  2. 调整节奏杠杆：`breatherRepairPct` 再上调、`enemyDamageScale` 降到 0.22 左右、或把 W2/W3 的 heavy 数量下调——**但先定目标**：3 分钟意味着玩家要扛住约 6 倍当前伤害预算，单靠缩放会削掉「损失有痛感」，可能要引入「掩体收益」这条真正的减伤通道（见 #AB11）；
  3. 把 `scripts/measure-encounter.cjs`（已随本条加入仓库）接进日常：每次改数值后跑一遍，
     直到 `elapsed` 落进 180~300s；它目前只是手动工具，没有断言，不进 `test:browser`。
- **2026-10-28 复查：时长分解把「差 4~12 倍」拆成了可执行的规格**（`measure-encounter.cjs` 新增按时长分解输出）：
  ```
  wave       20.3s  54%     ← 真交战
  breather   11.8s  31%     ← 喘息
  telegraph   1.5s   4%
  总 37.9s     平均 5.07s 清 1 辆
  ```
  **两层真因**：
  1. **表现层**：37.9s 是**玩家阵亡**时长，不是通关时长（W2 中途血量 251→128→48→19→0，11 秒内清空）。这一层**不修**——「站着挨打会死」是正确反馈。
  2. **结构层（真缺口）**：12 敌 × 5.07s/杀 = 61s 交战 + 17.6s 固定开销 ⇒ **即使一次不死，天花板也只有 89s**。目标 180~300s，缺 2~3 倍**内容量**。
- **结论（已定，见 `specs/combat/encounter-pacing.md`）**：
  - **禁区：不许堆敌人血量**。把 `s/杀` 从 5.07 拉到 10 只是把「打 3 发」变成「打 6 发」，不产生任何新决策，还会把「绕侧省 1 发」的收益占比从 33% 稀释到 17%，反向破坏 #N1 的机动价值。
  - **正解：7 波 / 31 敌 / 每波 3~6 辆**（同屏上限仍是 5，超过才拆波内子波）。配合「喘息随波次规模浮动」`clamp(6, 4+敌数×1.2, 14)`——固定 12s 对 3 辆残局是空转（当前实测 11.8s 已占 31%），对 6 辆又不够。
  - 目标参数组全部 **[PLACEHOLDER]**，验证判据三条：总时长 180~300s、理想天花板 ≥180s、`breather` 占比 ≤25%。
- **阻塞关系**：`s/杀` 会随 #AB11b（绕障/推进）修复而**变长**（敌人压到 340px 后玩家必须边走边打，空窗变多）⇒ 参数必须在 #AB11b 之后重算，`E_total` 大概率要下调。**现在落地 31 敌有过度补偿风险，故本文档只定规格、不改 `waves`。**
- **状态**：诊断与规格已完成（§4.159）；**实现待 #AB11b**。




### #AB13 `browser-tests.md` 对 `test-browser-3d` 的描述仍是「6 敌」（波次化之前的事实）

- **证据**：`docs/specs/editor/browser-tests.md:19` 写「**R1 3D 切片**：WebGL 启动、世界生成（玩家/**6 敌**/2 友军）…」；而该链的断言早已改成波次投放，实测输出 `PASS | 首波敌人入场（波次投放，非预生成） | enemies=3`（`scripts/test-browser-3d.cjs:105`），场上只会有首波的 3 辆。
- **影响**：文档让读者以为这条链验证的是「预生成 6 敌」这个已废弃的行为，反而看不出它验证的是「波次投放」。同类漂移会让人误判覆盖范围。
- **修法（已落地，同段落）**：`specs/editor/browser-tests.md` 该行改为「世界生成（玩家/首波 3 敌（波次投放，见 encounter 链）/2 友军）」——复核时该段落已按此口径，本条为**描述已过期、无需再改代码**。
- **状态**：已修（待归档）。

### #AB14 沿墙滑行把坦克滑出世界边界，且永久留在场外

- **证据**：`js/tank_move.js` 的 `driveTank` 顺序是「位移 → 世界边界钳制（`worldBounds`）→ `resolveCoverCollisions` → `applyWallSlide`」，而 `applyWallSlide` 的回滚锚点 `preMoveX/preMoveY` 取自**钳制之前**：`t.x = preMoveX` 会把钳制修正一起撤销；同时 `progress` 的分子把钳制修正量当成了「实际位移」。
- **复现**（`tmp/probe-wallslide-bounds3.cjs`，修复前）：坦克贴西边界（margin 38.4）+ 正北一块 120×30 岩石，`driveTank(t, 1/60, {move:1, worldBounds:{0,0,1000,1000}})` 逐帧推进 ⇒ 采样 240 帧里 **168 帧越界、端点 x=−204.6**，延长到 300 帧继续外扩到 **x=−313.6 并永久留在场外**（每帧钳制拉回、每帧回滚再扔出去）。默认 3D 节点实测有掩体距边界仅 34.2px，触发条件不是构造出来的。
- **影响**：`tank_3d.html` 与 `tank_battle.html` 都传 `worldBounds`，玩家与敌人都会中。敌人一旦在界外贴墙卡住，`encounterCtx().enemyAlive` 永不为 0 ⇒ **波次永远清不掉**（G1 最想避免的软锁）。原有滑行用例全部不传 `worldBounds`，所以整条边界语义在测试里是空的。
- **修法（已落地，§4.162）**：边界框统一由 `tankBoundsFor` 产出（位移后与滑行后共用同一份；单边缺失时该侧取 ±Infinity，顺带堵掉旧实现「只给 minX 不给 maxX ⇒ `NaN` 写进坐标」）；`applyWallSlide` **返回是否真的滑过**，`driveTank` 只在 `true` 时 `clampTankToBounds` 重钳一次（常规帧零开销）；`applyWallSlide` 本身仍不碰边界（职责切开）。
- **验证**：`scripts/test-tankcollision.js` 新增 `#AB14` 组 **3 条断言**（300 帧全程不越界 / 终点在界内 / 关掉滑行同样不越界）；`npm run check` 全绿 / `npm test` 69 通过 0 失败；探针复跑「越界帧 0，终点 x=38.40」。
- **状态**：已修（待归档）。

### #AB17 首页选模式后进不去游戏：`#loadoutScreen` 残留让 initMenu 首屏抛错

- **证据**：`js/tank_screens.js:13` 的 `SCREENS` 仍含 `'loadoutScreen'`，而 HOME 与 LOADOUT 合并后（2026-10-29）该元素已从 `tank_battle.html` 删除（全仓 `grep loadoutScreen` 只剩这一处）。`hideAllScreens()` 遍历清单时 `document.getElementById('loadoutScreen').style` 拿到 `null` 并抛 `TypeError`——而它被 `initMenu()`（`tank_battle.html:7378`）在**首屏**调用 ⇒ `showScreen('homeScreen')` 与 `setOverlayVisible(true)` 都没执行，页面死在加载阶段。
- **复现**（`tmp/probe-mode-nav.cjs`，修复前）：打开 `index.html` → 点「标准模式」卡 → 跳到 `tank_battle.html` 后实测
  ```
  PAGEERROR: Cannot read properties of null (reading 'style')
      at hideAllScreens (tank_battle.html:2315:51)
      at showScreen (tank_battle.html:2317:26)
      at initMenu (tank_battle.html:7378:3)
  ```
  `#homeScreen` / `#flowOverlay` 均不可见 ⇒ 白屏，用户描述为「模式菜单选择后无法进入加载页面和游戏」。
- **影响**：**P0 全阻塞**——三条模式（标准/Boss/生存）全部进不去，正式游戏页等于不可用。同一批改动里 `scripts/test-browser-smoke.cjs` 已把断言从 `loadoutScreen` 换成 `homeLoadoutWrap`，但**清单侧漏改**，而 smoke 链当时没跑，所以没兜住。
- **修法（已落地，§4.167）**：① `js/tank_screens.js` 的 `SCREENS` 删掉 `loadoutScreen`（流程状态 `loadout` 保留，它复用 `homeScreen`）；② `hideAllScreens()` / `showScreen()` 逐个 `getElementById` 判空——屏幕清单是 UI 辅助表、不是不变量，**缺一个 id 的代价必须是「那屏不隐藏」，不能是「失去整页」**（缺屏时只往日志面板落一条 `CRIT`）。
- **验证**：`tmp/probe-mode-nav.cjs` 复跑 —— 落地后 `homeScreen=true`、`flowOverlay=true`、`PAGEERROR` 0 条；`tmp/probe-run-start2.cjs` 全链路 —— 新建存档 → 选车（Leapard_1）→ 出击 → 加载层出现（`#loadingOverlay` 被 MutationObserver 捕获 1 次）→ `flowOverlay` 隐藏、场上 12 敌、canvas 1440×900，非 404 报错 0 条（截图 `tmp/probe-battle.png`）；`test-browser-smoke` 新增「SCREENS 清单与 DOM 一一对应」断言 + **负向对照**（把 `loadoutScreen` 塞回清单 ⇒ 该断言红、但页面仍能进首页，证明两层防线各自成立）；浏览器冒烟链 ALL PASS。
- **状态**：已修（待归档）。


## 历史：当前无存量条目（#AA 批次 2026-10-26 全部关账）

> **来源**：用户 2026-10-24 四项反馈（电磁炮音效 / 节点间自动提速与公路加成 / 泥潭河流与低马力滑行 / bench 榴弹炮射程）。逐条以代码证据核实：3 项确认为缺陷、1 项（机动模型）确认根因并**已于 2026-10-24 AA-d 修复归档**（原 #AA4，见 `docs/DEVELOPMENT-batches-2026-10.md` §4.130）、1 项（Boss 节点自动提极速上限）**核实不成立**（排除结论原文见 `docs/archive/2026-10.md` 的 PLAN §6.1.1）。
> 电磁炮充能音效属**新能力缺口**（specs 从未定义），不是回归 ⇒ 归 PLAN 计划，不入本表。
> **2026-10-26 AA-a 关账**：#AA1（HUD 公路加成低估一半）、#AA2（bench `aimPoint` 缺失）与 #AA5（`specs/map/roads.md` 公路豁免口径过期）均已修复并归档，结论见 `docs/DEVELOPMENT-batches-2026-10.md` **§4.132**（#AA2 由用户于同日实机点击验收：bench 榴弹表现正常）。
> **2026-10-26 AA-b 关账**：#AA3（bench↔battle 运行时接线漂移，7 项 + F 键边沿 + 曲射散布圈）已修复并归档，结论见 **§4.136**；防回潮由 `scripts/test-bench-parity.js`（28 断言，含键集包含关系）承担。**本表当前为空**——#AA 批次（用户 2026-10-24 反馈）全部结束。

---

**上一轮清账**：2026-10-22 一次性清空了 #Z1~#Z8 共 8 条**已核实并修复**的缺陷：设计器顶点选不中/吸附无效、Boss 简报从未入库、strip 河路无 75° 护栏、卡池 common < rare、雷场伤害半径硬编码、机炮热量三方不一致、AI 听声永不升级到交战、栅栏沙包与直线掩体需求冲突。**原文已按 4 步生命周期归档至 `docs/archive/2026-10.md`**，结论归口 `docs/DEVELOPMENT-batches-2026-10.md` **§4.119**。

> **第五批新增的一条可复用纪律**：**「文档宣称已实现」不等于已实现**——#Z2 的 `bossBriefing` 在 specs/DEVELOPMENT 里被描述得完整（含返回字段、关闭方式），但 `git log -S` 证明它从未入库，`types/globals.d.ts` 的声明又让 `tsc` 查不出来。**凡 specs 声明的纯函数，必须有对应的 Node 单测**；只有 `typeof x === "function"` 守卫的降级路径会把「缺失」伪装成「关闭」。

2026-10-20 一次性清空了本文件此前累积的全部条目：#V1/#V2（文档过期 2 项）、#W7/#W8/#W9/#W11/#W13/#W14/#W15/#W16/#W17/#W18（#W 批次 10 项）、#X1~#X7（#X 批次 7 项）、#Y1（测试链审计批次 1 项）。其中 5 项经实测判定为「文档记载与代码现状脱节」（问题早已不存在或被更早提交修掉），其余均已修复并验证。**原文已按 4 步生命周期归档至 `docs/archive/2026-10.md`**，结论归口 `docs/DEVELOPMENT-batches-2026-10.md` **§4.112** 与对应 specs 卷。

> **2026-10-20 清账批次的两条可复用验证纪律**（写入此处以免随着条目一起被归档掉）：
> 1. **新增或改动测试脚本时，`process.exitCode` 是硬性要求**——没有退出码的测试不是测试，只是会打印 ✓/✗ 的日志。`test-rework-r2/r3` 曾因缺退出码而长期假绿，掩盖了 P1 玩法缺陷（#Y1）。
> 2. **负向断言是「死键 / 字段下线」类问题的根治手段**——只测「能用」永远发现不了「拿不到」。必须断言「不存在」与「不可激活/不可授予」。

---
