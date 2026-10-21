# Boss 战与首领机制规范 —— 兼容索引（现行内容见 wiki 分页）

> ⚠️ **本页是 §N 兼容层**：全部章节编号原样保留（全仓引用本卷章节号的外部文档依赖它们），
> 但正文已迁至 `docs/specs/boss/` 下的主题页。**查现行口径请点每节的「详见」链接。**
> 拆分日期 **2026-10-21**；拆分前的单卷原文以 git 提交 `57be2ca` 为准（见 `docs/archive/2026-10-pre-wiki-boss.md` 的还原说明与分节行号表）。
> 规范见 [`docs/WIKI-STYLE.md`](../WIKI-STYLE.md)；卷首页见 [boss/index.md](./boss/index.md)。

---

## 0. 主题索引（按问题查，不按章节序读）

> ⚠️ **本卷含历史批次章节（§4~§10），章节号按时间追加，不代表主题分组**——Boss 机制**散落在 §4~§10 七节**。
> **查现行口径请用本索引**：每行给出「该主题的现行口径在哪一页」与「只是来源沿革、不必读的页」。
> 本卷章节号被外部文档直接引用——**编号保持稳定、不做重排**；本索引是唯一的「按主题导航」入口。

| 我想查…… | 现行口径（先看这里） | 来源沿革（不必读） |
|---|---|---|
| **Boss 设计定位 / 出现周期** | [定位与数据契约](./boss/overview-contract.md)（§1） | — |
| **`bosses/*.json` 有哪些字段** / schema | [定位与数据契约 · 数据契约](./boss/overview-contract.md#数据契约)（§2） | §4 的 `ai` 块、§6 的 `summons` 块 |
| **运行时三件套**（阶段切换/随从/掉落/AI 复用） | [运行时机制](./boss/runtime.md)（§3） | — |
| **几何放大**（`boss.scale` 2.0） | [运行时机制 · 几何放大](./boss/runtime.md#几何放大)（§5 第 1 条） | — |
| **阶段 AI 三模式**（hold / charge / skirmish） | [行为与弱点 · 阶段 AI 三模式](./boss/behavior.md#阶段-ai-三模式)（§4 首条） | — |
| **`anchorRange`/`targetRange`/`keepDist` 消费** | [阶段 AI 与机炮射程 · 三键消费](./boss/phase-ai-range.md#三键消费现行)（§10.1，**唯一口径**） | §4 首条的概述 |
| **Boss 数值倍率**（`hpMul`/`moveMul`/`dmgMul`/`engageDist`…） | [数值倍率与难度叠加 · tuning 表](./boss/scaling.md#rulesbosstuning-现行真值)（§5 第 2 条，**唯一口径**） | §5 的 hpMul ×8→×9 沿革 |
| **难度叠加 / 出生即交战** | [数值倍率与难度叠加](./boss/scaling.md#难度叠加)（§5 第 3~4 条） | — |
| **激光**（蓄能/射击/伤害/掩体阻断/炮塔转速/车体冻结） | [蓄能激光](./boss/laser.md)（§6 末条 + §8.1 + §8.2） | §7.1（乘数方案，**已废弃** → [沿革](./boss/changelog.md#laser-turn-乘数方案已废弃)） |
| **召唤**（分波次/时间兜底/兜底池/小兵机动锚定） | [召唤与小兵](./boss/summons.md)（§6 首条 + §7.2 + §9） | — |
| **随机技能**（`assignBossSkills`） | [行为与弱点 · Boss 随机技能](./boss/behavior.md#boss-随机技能)（§4） | — |
| **随机武备**（`pickBossArmament`）+ **进场简报** | [行为与弱点 · Boss 随机武备](./boss/behavior.md#boss-随机武备)（§4；参数唯一口径 `RULES.boss.armament`） | [卡牌规范 · 机制卡与武器 effect](./cards/weapon-cards.md#boss-随机武备)（卡池侧） |
| **弱点命中**（`RULES.boss.weakspot`） | [行为与弱点 · 弱点命中增益](./boss/behavior.md#弱点命中增益)（§4） | — |
| **战利品奖励链** | [行为与弱点 · 战利品奖励链](./boss/behavior.md#boss-战利品奖励链)（§4） | §9 的卡池过滤沿革（已推翻） |
| **受击反馈 / 开场行动 / 残血减速** | [行为与弱点 · 开场行动与受击反馈](./boss/behavior.md#开场行动与受击反馈)（§6 第 2~4 条） | — |
| **机炮射程 900→1200**（`applyBossWeaponTuning`） | [阶段 AI 与机炮射程 · 机炮射程](./boss/phase-ai-range.md#boss-机炮射程-900-1200)（§10.3） | — |
| **`aiState='chase'` 死状态** | [阶段 AI 与机炮射程 · aiState](./boss/phase-ai-range.md#taistate-chase-死状态已删)（§10.2） | §5 末条（旧描述） |
| **Boss 履带断落自修** | [召唤与小兵 · 履带自修](./boss/summons.md#boss-履带断落随机自修)（§9.2） | — |
| **全部历史 / 已作废机制** | — | [沿革与已作废](./boss/changelog.md) |

**读法建议**：Boss 机制分散在 7 个批次节里，是本卷最容易被「章节序」误导的地方——**只查现行行为就看「现行口径」列**。

---

## 1. Boss 战设计定位

> 周期性首领战（每 `bossInterval` 默认 **5** 个节点一次）；设计范式 = **FTL 多阶段 + Into the Breach 弱点机制**。

**详见**：[定位与数据契约 · Boss 战设计定位](./boss/overview-contract.md#boss-战设计定位)

## 2. 数据契约 (bosses/<id>.json)

> `validateBoss` 校验、`bossStageFor` 按 hp 比例取阶段；字段 = `tankId` / `stages[]`（`hpThreshold`+`modifiers`+`ai`）/ `summons[]` / `loot`。**当前池 5 个 Boss**（均 3 阶段、掉落齐全）。
> **⚠️ 不要塞 `weapons`**（`validateBoss` 不认，静默忽略）。

**详见**：[定位与数据契约 · 数据契约](./boss/overview-contract.md#数据契约)

## 3. 运行时机制 (makeBossEntity / applyBossStage / updateBossStage)

> 四条骨架：阶段切换（`applyBossStage` 挂 run scope modifiers）/ 随从 `summons`（`spawnTank` + `nodeSpawn`）/ 掉落 `loot.score`（`finishNode` 叠加）/ AI 复用（`aiDecideEnemy` 同一管线）。

**详见**：[运行时机制](./boss/runtime.md)

## 4. 数据驱动行为与弱点实装（P-51，2026-08-24 落地）

> 阶段 AI 三模式（hold/skirmish/charge）+ 炮击压制（三 Boss 参数）+ 召唤时间兜底（75s）+ 弱点命中（`dmgMul 1.5`/`penAdd 15`/`ignoreBounce`）+ 随机技能（4 选 1~2）+ **随机武备**（`RULES.boss.armament`）+ **进场简报**（`bossBriefing`）+ 战利品链（`bossRound.guarantee` 配比保底）+ 当前 ai.mode 分配表。

**详见**：[行为与弱点](./boss/behavior.md)

## 5. Boss 机制（P-51 同期批次落地，2026-08-24）

> 几何放大（`scale` **2.0**，整体替换新对象防污染共享 spec）+ **`RULES.boss.tuning` 十键真值表（全卷唯一口径）** + 难度叠加（`applyDifficultyMults` 带 `applyPlayerCap=false`）+ 出生即交战（`engageDist 99999`）。
> **`hpMul` 沿革**：×8 → ×9（2026-10-01），与 `entityMults.maxHp` 上调叠加后 Boss 总血量约 +29%~+36%。

**详见**：[运行时机制 · 几何放大](./boss/runtime.md#几何放大) · [数值倍率与难度叠加](./boss/scaling.md)

## 6. 2026-09-20 #E9 用户反馈修订（现行口径）

> 四项（用户反馈①~④）：**分波次召唤**（`hpFrom [0.75,0.5,0.25]`、`countDiffMul 1.6`、环形 160~320px）/ **开场行动**（`openingSeconds 1.6s`、`openingScanRate 0.9`）/ **受击反馈**（`bossHitReactT 0.35s`、冷却 0.45s）/ **残血减速**（`stageSpeedCapMul 1.15/1.1/1.15`）/ **蓄能激光参数表（唯一口径）**。

**详见**：[召唤与小兵 · 分波次召唤](./boss/summons.md#分波次召唤) · [行为与弱点 · 开场行动与受击反馈](./boss/behavior.md#开场行动与受击反馈) · [蓄能激光 · 参数表](./boss/laser.md#蓄能激光参数表唯一口径)

## 7. 2026-09-21 #G 用户反馈修订（现行口径）

> **§7.1 激光炮塔转速**：timed modifier 乘数方案**已废弃**（乘数在已被压低的基速上再乘 0.15~0.18 ⇒ 实际角速度 ≈ 0），现行改为**固定角速度直驱 0.35 rad/s**。
> **§7.2 召唤波次兜底**：`defaultPool` / `defaultWaves`（3）+ 5 个 Boss 的 3 波 `summons` 配置。

**详见**：[蓄能激光 · 炮塔转速](./boss/laser.md#炮塔转速固定角速度直驱) · [召唤与小兵 · 兜底池](./boss/summons.md#召唤波次兜底池)

### 7.1 激光炮塔转速：timed modifier 取代逐帧叠加（#G1）——**已被 #H4/#I1 取代**

> 乘数方案已废弃；现行 = `updateBossLaser` 直接推进 `turretAngle`，角速度固定 `RULES.boss.laser.laserTurnSpeed`（**0.35 rad/s**），不受 modifier/难度影响；激光期 `bossLaserHoldTurret` + `bossLaserHoldMove`（车体冻结）。

**详见**：[蓄能激光 · 炮塔转速](./boss/laser.md#炮塔转速固定角速度直驱)　**沿革原文**：[changelog · laser-turn 乘数方案](./boss/changelog.md#laser-turn-乘数方案已废弃)

### 7.2 召唤波次兜底（#G2）

> `RULES.boss.summonWaves` 补 `defaultPool`（缺省 `dummy×2`）与 `defaultWaves`（3）；空 `summons` 但 `t.boss.id` 存在时自动补 3 波；裸测试实体仍返回 `null`。**5 个 Boss 均已补 3 波**（`hpFrom` 1.0 / 0.66 / 0.33）。

**详见**：[召唤与小兵 · 召唤波次兜底池](./boss/summons.md#召唤波次兜底池)

## 8. 2026-09-21 #I 批次：激光定桩/降速 + 掩体阻断 + 随机走位（现行口径）

> **§8.1** 激光期车体冻结 + `laserTurnSpeed` 0.55→**0.35**；**§8.2** `_laserBeamBlockDist()`（Liang-Barsky 射线×OBB）+ 光束级伤害截断；**§8.3** `RULES.ai.bossWander` 随机走位（反站桩）；**§8.4** 建筑密度（归口 map）。

**详见**：[蓄能激光](./boss/laser.md) · [战斗规范 · Boss 战斗](./combat/boss-combat.md)（随机走位）· [沿革 · 建筑密度](./boss/changelog.md#建筑密度i3归口-map)

### 8.1 激光期车体冻结 + 炮塔再降速（#I1）

> `t.bossLaserHoldMove = true`（蓄能+射击全程）⇒ 接入层跳过 `driveTank`；`laserTurnSpeed` **0.55 → 0.35 rad/s**（固定角速度直驱）；单周期转角 41 帧 × 0.035 = 1.435 rad < π/2 ⇒ 走位窗口量化成立。

**详见**：[蓄能激光 · 激光期车体冻结](./boss/laser.md#激光期车体冻结)

### 8.2 蓄能虚线与光束反映掩体阻挡（#I2）

> `_laserBeamBlockDist()` 沿光束求最近全高掩体的**入口距离**（Liang-Barsky）；`laserCharge`/`laserFire` 携带 `blockedDist`；伤害改**光束级截断**（投影 > `blockDist` 不掉血，`laserBlocked` 事件）；绘制层按 `blockedDist` 截断。

**详见**：[蓄能激光 · 掩体阻挡](./boss/laser.md#蓄能虚线与光束反映掩体阻挡)

### 8.3 Boss 随机走位（反站桩）（#I4）

> `RULES.ai.bossWander`（interval 2.2~4.6s、环绕玩家 240~520px、`waypointReach 90`、`clampMargin 140`）；`updateBossBehavior` 写 `t._bossMoveOverride = {turn, move}`，mvp AI 循环对 Boss 替换车体输入（**炮塔照常锁定玩家瞄准开火**）。豁免：`crush` 风格、weave 冲刺窗口、激光期、目标已毁。hold/skirmish/command/**fortify** 均获得机动。

**详见**：[战斗规范 · Boss 战斗](./combat/boss-combat.md)（随机走位）

### 8.4 建筑密度（#I3）

> 地图侧现行口径见 [地图规范](./map.md) §13.4（参数提升 + Boss 节点 ×1.6 + 修复 `fits()` 道路误判导致的密度参数空转）；战斗侧摘要见 [战斗规范 · Boss 战斗](./combat/boss-combat.md)。

**详见**：[沿革 · 建筑密度](./boss/changelog.md#建筑密度i3归口-map)

## 9. 2026-09-23 #J 批次：召唤小兵速度锚定 + Boss 履带随机自修（现行口径）

> **§9.1** 召唤小兵沿用 P-46 锚定链（`applyEnemyAppearanceAndStats` + `entityMults`，非裸 `applyTankConfig`）；**§9.2** `updateBossTrackRepair`（`windowSeconds 8` / `chance 0.4`，单次决策、每次断裂独立）。

**详见**：[召唤与小兵](./boss/summons.md#召唤小兵机动锚定)

### 9.1 召唤小兵机动锚定（spawnBossSummonWave）

> 接入层沿用与节点敌军/增援**相同的 P-46 锚定链**：`applyEnemyAppearanceAndStats(s, spec, playerAnchorStats || player.stats, currentNode.entityMults)`，而非直挂 `applyTankConfig` 照搬原始机动值（后者绕过难度/玩家基准锚定，机动常暴超）。

**详见**：[召唤与小兵 · 召唤小兵机动锚定](./boss/summons.md#召唤小兵机动锚定)

### 9.2 Boss 履带断落随机自修（updateBossTrackRepair）

> 履带断落后**不再被动站桩**：`RULES.boss.trackRepair = {enabled, windowSeconds 8, chance 0.4}`，断裂瞬间预定随机决策时点 + 一次性 roll；命中则清零 `trackBroken`/`immobT`/`speed` 并发 `trackRepair` 事件（火星 + 音效 + 日志）。

**详见**：[召唤与小兵 · Boss 履带断落随机自修](./boss/summons.md#boss-履带断落随机自修)

## 10. 2026-10-20 批次现行口径（#W13 / #W-J）

> **§10.1** `anchorRange`/`targetRange`/`keepDist` 三键各只在自己分支读一次、零交叉（**`anchorRange = 0` = 原地固守**，首版实现曾把它当假值回落致 `boss_siege_fort` 贴脸冲锋）；**§10.2** `t.aiState='chase'` 死状态已删；**§10.3** Boss 机炮射程 900→1200（`applyBossWeaponTuning`，**必须在 `assignBossArmament` 之后调用**）。

**详见**：[阶段 AI 与机炮射程](./boss/phase-ai-range.md)

### 10.1 `anchorRange` / `targetRange` / `keepDist` 三键消费（#W13，2026-10-20）

> `hold` 读 `anchorRange`（**0 = 原地固守、永不前压**；缺省回落 `allyEngageRange` 460）/ `charge` 读 `targetRange`（0 = 全速贴脸）/ `skirmish` 读 `keepDist`（缺省 640）。`_passiveDefend` 函数体不读 `params`，故 `skirmish` 不会误吃 `anchorRange`。实测区分度：commander 300 / twin_track 350 / siege_fort **0** / 缺省 460。

**详见**：[阶段 AI 与机炮射程 · 三键消费](./boss/phase-ai-range.md#三键消费现行)

### 10.2 `t.aiState = 'chase'` 死状态已删（#W13-c，2026-10-20）

> 原赋值是**唯一写点**且首帧即被 `tank_ai.js` 覆盖，且 `'chase'` 不在 `aiState` 词表内 ⇒ 纯噪声、会误导调试。**已删除**；「出生即接战」由 `t.aiEngaged = true` 承担。

**详见**：[阶段 AI 与机炮射程 · aiState](./boss/phase-ai-range.md#taistate-chase-死状态已删)

### 10.3 Boss 机炮射程 900 → 1200（#W-J，**已于 2026-10-20 实施**）

> 新增 `RULES.boss.tuning.autocannonRange = 1200` + `js/tank_boss.js` 的 `applyBossWeaponTuning(t)`。**调用契约：必须在 `assignBossArmament` 之后**（安装会重置 `stats`，先调被覆盖）。非 autocannon 保持 900；幂等。
> **沿革**：本项曾被记为「不做」，2026-10-20 用户要求「全部修完」后改为实施（旧记录保留在归档并加注记）。

**详见**：[阶段 AI 与机炮射程 · 机炮射程](./boss/phase-ai-range.md#boss-机炮射程-900-1200)

---

> **维护**：新增章节仍按 `§N+1` 追加（编号只增不改）——本页加「标题 + 摘要 + 详见」，正文写进 `docs/specs/boss/` 对应主题页。改现行值只改主题页；本页摘要**尽量不写具体数值**。
