# 行为与弱点

> **摘要**：阶段 AI 三模式、炮击压制、弱点命中、随机技能、随机武备与进场简报、战利品链。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/boss.md` §4 全节、§6 第 2~4 条（2026-10-21 拆分）
> **相关**：[阶段 AI 与机炮射程](./phase-ai-range.md) · [召唤与小兵](./summons.md) · [卡牌规范 · Boss 随机武备](../cards/weapon-cards.md#boss-随机武备)

## 目录
- [阶段 AI 三模式](#阶段-ai-三模式)
- [炮击压制](#炮击压制)
- [弱点命中增益](#弱点命中增益)
- [随机技能](#boss-随机技能)
- [随机武备与进场简报](#boss-随机武备)
- [战利品奖励链](#boss-战利品奖励链)
- [开场行动与受击反馈](#开场行动与受击反馈)
- [残血减速](#残血减速)
- [当前 ai.mode 分配](#当前-aimode-分配)

> **本页承载原 §4 的七段主题**：阶段 AI 三模式（原 **4.0**）/ 炮击压制（原 **4.1**）/ 召唤时间兜底（原 **4.2**，见 [召唤与小兵](./summons.md#召唤时间兜底)）/ 弱点命中（原 **4.3**）/ 随机技能（原 **4.4**）/ 随机武备与简报（原 **4.5**）/ 战利品链（原 **4.6**）。

## 阶段 AI 三模式

（原 §4 首条，P-51，2026-08-24 落地）

`stages[].ai = { mode:'hold'|'charge'|'skirmish', params }`；`validateBossStage` 校验枚举；`applyBossStage` 设置 `entity.stageAI`；`js/tank_ai.js` 消费三模式：

| 模式 | 行为 |
|---|---|
| `hold` | 复用友军消极防御 `_passiveDefend`（#S3：超出射程 1.2× 时 0.4 速前压，不再纯站桩；**`anchorRange` 消费口径见 [阶段 AI 与机炮射程](./phase-ai-range.md#三键消费现行)**） |
| `skirmish` | `keepDist` 风筝（#S3：过近倒车 / 超过 `keepDist×1.25` 时 0.7 速接近 / 之间停） |
| `charge` | 基线激进（**`targetRange` 消费口径见 [阶段 AI 与机炮射程](./phase-ai-range.md#三键消费现行)**） |

参数源 `RULES.boss.aiModes`（`skirmish.keepDist` 默认 **640**），读取带内联 fallback。

## 炮击压制

（#S3，2026-10-15）

`behavior.barrage` 去 `style==='command'` 门控，任意 Boss 配置即生效。现行：

| Boss | 炮击参数 |
|---|---|
| `commander` | 3 发 / 9s / 半径 110 |
| `fortress` | 4 发 / 14s / 半径 160（防御迫击炮） |
| `sniper` | 2 发 / 12s / 半径 70（精确打击） |

## 弱点命中增益

（原 §4）

命中模块与当前阶段 `weakspots` 匹配时（`isWeakspotHit` + `moduleFromHit`），从 `RULES.boss.weakspot`（`dmgMul:1.5` / `penAdd:15` / `ignoreBounce:true`）构造 `resolveHit` opts 注入增益。

> 物理语义（`resolveHit` 可选增益 opts）见 [战斗规范 · 装甲、跳弹与模块伤害](../combat/armor-ricochet.md)。

## Boss 随机技能

（原 §4，2026-10-15 #MODE 批次）

`assignBossSkills`（battle）从 `['shield','artillery','overdrive','aps']` 随机 1~2 个技能（`bossNumber > 0` 起 2 个），增强参数 `shield durationMult 1.5` / `artillery shellCountMult 1.5`；`updateBossSkills` 每 **8~15s** 触发一次携带技能。日志 `BOSS 携带技能：…（增强版）`。

## Boss 随机武备

（原 §4，#U39，2026-10-18 用户反馈「boss 似乎还不会随机到这些武器和升级」）

Boss 此前只有随机技能，`weapons` 恒为 `standard` + `none` ⇒ 主/副武器安装卡（`weapon_primary_*` / `weapon_secondary_*`）与全部武器升级卡对 Boss **完全不可见**。现行：

- **选择**：纯函数 `pickBossArmament(pool, {rng, bossNumber})`（`js/tank_cards.js`）—— ① 以 `primaryChance` 掷骰从 `slot=primary && action=install` 随机取 1 张；② 以 `secondaryChance` 掷骰从 `slot=secondary && action=install` 随机取 1 张；③ 对已选中的主/副武器**类型**，从 `action=upgrade && weaponType 匹配` 逐张独立掷骰，最多 `upgradeMax` 张（概率 `upgradeChance + bossNumber × upgradeChancePerBoss`）。任一步无货静默跳过，不抛错。
- **参数唯一口径** `RULES.boss.armament` = `{ enabled:true, primaryChance:0.9, secondaryChance:0.7, upgradeMax:2, upgradeChance:0.55, upgradeChancePerBoss:0.1 }`。
- **施加**：battle `assignBossArmament`（`spawnBossFromDef` 内、`assignBossSkills` 之后）经 `applyCardEffects` 施加 —— **与玩家卡牌同一语义通道**（换装重置 `stats` 基线、升级仅同型合并、`_spec`/`_dbState`/`_clipState` 缓存失效）。Boss 侧不维护 `_cardApplyCount`（属性独立、无跨局残留）。
- **实测分布（2026-10-18，500 次探针 / 真实卡池 191 张）**：平均每 Boss **3.27 张**武备卡（升级卡 830 次），施加失败 0；主武器各型 22.2%~22.8%（仍标准炮 9.8%），副武器 6 型 10.8%~12.2%（空槽 29.6%）。
- **可读性**：TAB 状态面板 Boss 行追加 `· 武备:主武器+副武器·改装×N`；出生日志 `BOSS 武备：…｜改装 …`。

> 卡池侧的选择逻辑参数与「每型 2~4 张」覆盖清单见 [卡牌规范 · 机制卡与武器 effect](../cards/weapon-cards.md#boss-随机武备)。

### 进场简报

（#U43，2026-10-19 用户要求「进入 boss 节点时，需要提示 boss 持有的技能和主、副武器」）

`spawnBossFromDef` 在 `assignBossSkills` + `assignBossArmament` **之后**调用 `showBossBriefing(bossEntity)`，居中覆盖层（`#bossBriefing`）列出主/副武器、改装卡（含数值摘要）、技能（增强版带「强化」标签）与阶段数；关闭 = 按钮 / 点击遮罩 / Esc。

**它不是 flow 状态**（不进状态机、Boss 战不暂停），日志同时留一份纯文本兜底。

- **数据层纯函数** `bossBriefing(entity)` / `bossBriefingLines(entity)`（`js/tank_boss.js`）：从**实体本身**读取（不是配置），故与随机结果严格一致；`cardEffects` 条目携带 `cardName`（`applyCardEffects` 写入时一并带上）后，纯逻辑层无需卡池即可显示可读卡名。
- 武器数值摘要走 `_weaponStatLines`，只列对决策有意义的字段（伤害/穿深/装填/弹速/射程/溅射/容量/热量/转向），内部开关（`altReload`/`guided`/`pierceDmgMul` 等）不显示。

**测试**：`scripts/test-cards.js` #U39 段 **20 断言**（分布覆盖 / 升级卡只挂已选型 / 开关关闭 / 空池与 null 安全 / 施加通道 / 新卡 schema / 每型有升级卡）。

## Boss 战利品奖励链

（原 §4）

`loot.cards > 0` 时 settlement→reward 追加 N 轮三选一；结算界面显示追加卡牌行。

**卡池不再按 `loot.cardRarity` 做稀有度下限过滤**（2026-10-16 用户要求「至少 1 传奇 + 2 史诗、其余随意、非普通卡几率调高」）——现行由抽取层表达：`RULES.cards.bossRound.guarantee`（配比保底）+ `.rarityWeights`（抬高非普通卡权重）。

> **沿革（被推翻）**：原按 `CARD_RARITIES.indexOf(c.rarity) >= indexOf(loot.cardRarity)` 过滤，3 个 Boss 配 `legendary` ⇒ `epic` 整档（含电磁炮与全部副武器安装卡）在 Boss 轮不可见，且 Boss 模式每节点都是 Boss 轮 ⇒ 池子逐轮枯竭卡死。`loot.cardRarity` 现仅作结算界面文案的兜底标签。
>
> 现行细则（`guaranteeRarity` / `rarityWeights` / 容量上限）见 [卡牌规范 · Boss 轮加权](../cards/draw-rules.md#boss-轮稀有度保底与非普通卡加权)。

## 开场行动与受击反馈

（原 §6 第 2~3 条，2026-09-20 #E9 用户反馈②）

> **本页同页承载原 §6 的 6.1~6.5 段**：分波次召唤（**6.1**，见 [召唤与小兵](./summons.md#分波次召唤)）/ 开场行动（**6.2**）/ 受击反馈（**6.3**）/ 残血减速（**6.4**）/ 蓄能激光参数表（**6.5**，见 [蓄能激光](./laser.md#蓄能激光参数表唯一口径)）。

- **开场行动（早期阶段不站桩）**：`makeBossEntity` 置 `bossOpeningT = RULES.boss.openingSeconds`（**1.6s**）；期间 `updateBossBehavior` 持续以 `openingScanRate`（**0.9 rad/s**）转动炮塔扫描（有可读动作），之后进入常规阶段行为。
- **受击反馈（被击中必有反应）**：`triggerBossHitReact(t, weak)` —— 命中即触发短暂顿挫：`bossHitReactT`（**0.35s**，弱点命中 ×1.6）+ `timed maxSpeed ×slowMul`（0.35，0.25s）+ 渲染层可读的炮塔抖动窗口；冷却 `hitReact.cooldown`（**0.45s**）防高射速下抖动到无法瞄准。接入层在 `resolveHit` 包装里按目标 `isBoss` 调用（`opts.dmgMul>1` 视为弱点命中）。

## 残血减速

（原 §6 第 4 条，修复「残血后太快」）

`applyBossStage` 对阶段 `onEnter.modifiers` 中的**乘性机动增益**（`maxSpeed`/`turnRate`/`turretTurnRate` 且 `mode:'mult'` 且 `value>1`）施加上限 `RULES.boss.stageSpeedCapMul`（**1.15 / 1.1 / 1.15**）——`bosses/*.json` 里 ×1.2~1.8 的阶段加速不会再失控。

## 当前 ai.mode 分配

（5 Boss × 3 阶段共 15 个）

| Boss | 三阶段 ai.mode |
|---|---|
| `commander` | hold / skirmish / charge |
| `fortress` | hold / charge / charge |
| `siege_fort` | hold / skirmish / charge |
| `sniper` | skirmish ×3（`keepDist` 900 / 800 / 700） |
| `twin_track` | skirmish / hold / charge |

**测试**：`scripts/test-boss.js`（+16 断言）/ `scripts/test-ai.js`（+15）/ `scripts/test-physics.js`（新建，19 断言）。

> 三模式的**消费实现**（`anchorRange`/`targetRange` 各在哪读、`0` 的语义）见 [阶段 AI 与机炮射程](./phase-ai-range.md)。

## 相关页面
- [阶段 AI 与机炮射程](./phase-ai-range.md) — 三键消费与机炮射程的调用契约
- [召唤与小兵](./summons.md) — 分波次召唤与时间兜底
- [卡牌规范 · Boss 随机武备](../cards/weapon-cards.md#boss-随机武备) — `pickBossArmament` 与卡池覆盖
- [蓄能激光](./laser.md) — 激光参数表与阶段解锁阈值
