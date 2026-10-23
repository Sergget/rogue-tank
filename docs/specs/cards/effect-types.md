# 七类效果类型

> **摘要**：`effects[]` 每一项的 `type` 决定参数结构；本页是七类效果的参数与约束唯一口径。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/cards.md` §3 全节（2026-10-21 拆分）
> **相关**：[卡牌定位与数据契约](./overview-contract.md) · [被动卡与模块暴击](./passive-crit.md) · [三板块设计定稿](./design-blocks.md)

## 目录
- [modifier](#modifier)
- [ammo](#ammo)
- [ability](#ability)
- [passive](#passive)
- [drone](#drone)
- [economy](#economy)
- [weapon](#weapon)

> 类型枚举以 `js/tank_cards.js` 的 **`CARD_EFFECT_TYPES`（共 7 类）** 为唯一口径：modifier / ammo / ability / passive / drone / economy / weapon。
> **沿革**：本卷曾误标「六大」并漏列 `weapon`，2026-09-23 修正。

## modifier

（原 §3 第 1 条）

`{stat, mode:'add'|'mult', value}` —— stat 白名单（穿透/伤害/装填/弹速/极速/转向/炮塔转速/装甲路径 `armor.hull.front` 等）或履带锁/模块倍率/DOT倍率/散布。立即生效（走 `addModifier` 管道；三层属性模型 `base` / `modifiers` / `stats` 的实现见 `js/tank_model.js` 的 `makeTank`/`computeStats`，架构说明见 `AGENTS.md` §4）。

**白名单沿革（2026-10-10 #O3 补入 3 键，唯一口径 `MODIFIER_STATS`）**：`motionSpreadMul`（此前仅局内商店 `steady_mount` 可写）、`fireControlCrit` / `loaderAmmoCrit`（P-49 模块命中概率修正通道，此前三通道全空缺的死升级通道）。

### 运行时参数硬限

（2026-09-15 W5 用户裁定；2026-09-17 #C2 修订）

卡牌 modifiers 聚合后受 `RULES.parameterLimits` 两张硬限钳制：

| 通道 | 硬限 | 说明 |
|---|---|---|
| 装填 `reload` | **≥ 1.0s/发** | 2026-09-17 #C2 裁定，取代旧 0.5s；加速装填卡不得突破下限 |
| 极速 `maxSpeed` | **≤ 150km/h（375px/s）** | 超速卡不得突破上限 |

实现于 `js/tank_model.js` `applyParameterLimits(s, modifiers)`（computeStats 尾部，仅 modifiers 非空时生效，空修饰器出厂/纯计算不钳）。

**#C2 同轮细化**：硬限只约束**参数通道**（scope run/permanent）——**纯 timed 修饰器**（超装填 ×0.45 等能力爆发通道）**不钳**，其实际开火间隔可继续 <1s（与机炮 `reloadMult 0.25` 武器通道同语义）。火控系另有既有钳制（`spreadMult`/`motionSpreadMul` ≥ multFloor、crit ≤ critBonusCap）。消费链 `applyCardEffects`→`addModifier`→`refreshStats`→`computeStats` 天然接入，商店另有 `runShopLimitBlocked` 购买拦截（`fast_reload` limit.min=1.0 同步）。回归见 `scripts/test-rework-w5.js`（§5 timed 不钳 / 混合通道仍钳）。

## ammo

（原 §3 第 2 条）

弹种改造或弹种替换。**完整弹种键与升级总表见 [战斗规范 · 弹种系统](../combat/ammo-system.md)**（原引用：`docs/specs/combat.md` §3.1/§3.2）与 `js/tank_rules.js` 的 `RULES.ammoTypes` / `RULES.ammoChain`。

### 弹种属性改造

`{key, field:'pen'|'dmg'|'speed', mode:'mult'|'add', value}` —— `key` 支持现有体系下的有效弹种键。

### 弹种升级替换

`{type:'ammo', key, replaceAmmo?}`。`replaceAmmo` 为直系前驱弹种（显式）；**省略时仅对「无 field 的旧式演变效果」按 `RULES.ammoChain[key]` 推断（#U40 口径，2026-10-19）**。

**替换前提**：**前驱必须在 loadout 中**（`replaceAmmo`/`CHAIN[key]` ∈ `ammoLoadout`），否则视为跳级——拒绝变更；HE 线 `he→(heat|aphe)` 首张时「先新增」（保留 he，占第 3 槽）、其后再抽则「替换 he 槽」。KE/HEAT 链皆在前驱槽位原位替换，`ammoKey` 同步。三链语义详见 [战斗规范 · 弹种升级链](../combat/ammo-system.md#弹种升级链)。

### `replaceAmmo` 两层校验

（2026-10-20 #W8 新增，`validateCardEffect` 的 `case 'ammo'`）

此前该字段**零校验**——`"NOT_AN_AMMO"` / 错边前驱 / `123` / `null` 四种非法值全部返回 `[]`（放行），导致拼错即**静默 no-op**（玩家拿了卡没动静）、写错边即**错槽替换**。现行两层：

1. **白名单**：若字段存在，必须是 `AMMO_KEYS` 内的**字符串**（非字符串/不存在于弹种表 ⇒ 报错）；
2. **链条校验**：必须是 `RULES.ammoChain[ef.key]` 的**直系前驱**（`ammoChain[key] === replaceAmmo`）。

**字段语义澄清**（易混淆）：`ef.key` = **升级后的目标弹种**、`replaceAmmo` = **被替换的前驱**（因果方向与字段顺序相反）。

实测（2026-10-20 全库扫描）：196 张卡共 **13 个** `replaceAmmo` 效果，链条不符 **0 个** ⇒ 新校验对存量内容零误伤。回归 `scripts/test-cards.js` #W8 段。

### 调校效果与升级效果的严格分界

（#U40，2026-10-19 用户反馈「获取新弹种和参数升级搞混淆了」）

带 `field` 的 ammo 效果是**纯数值调校**（`demo_apcr_round`「APCR 穿深 +20%」等）——只改数值，**绝不触发链替换**（旧实现按 CHAIN 回退推断前驱，导致 AP 槽被隐形改名 APCR/HEAT 且可随 `maxStacks` 2~4 反复触发）。

判定口径三处同源（`applyCardEffects` 替换分支 / `isAmmoUpgradeCard` / `drawCardChoices` 链过滤）：**升级效果** = 显式 `replaceAmmo` ∨（无 field 且 CHAIN 有前驱）；**调校效果** = 带 field。回归 `scripts/test-cards.js` #U40 段。

### 聚合语义与软上限

- **`mode:'mult'`**：对 RULES 基准倍率做乘算聚合。
- **`mode:'add'` = 乘算后毫米追加**（2026-08-26，原 ISSUES #A13 修复定案）：最终属性 = `base × mult聚合 + Σadd`，value 按**字段自然单位**计——pen=mm / dmg=伤害值 / speed=px/s（如「APCR穿深+14mm」即最终穿深加 14mm，而非倍率刻度 +14）。
- `computeAmmoConfig` 将 Σadd 输出为独立的 `fieldAdd` 字段存放，由消费方（`fireTank`/`computeAmmoConfig` 合成端）在乘算聚合之后合成，杜绝把 mm 追加混入倍率刻度。
- 软上限 `ammoTypeCap` 作用于**最终等效值**且仅钳 HE（AP/APCR/HEAT 不受限）。（接入点见 `js/tank_rules.js` 的 `RULES.ammoTypeCap`）

## ability

（原 §3 第 3 条）

主动装置 `{key}`，`key` ∈ **`ABILITY_KEYS_RUNTIME`（2026-10-20 #W9 删键后为 5 键）**：`artillery` / `shield` / `overdrive` / `deploy_cover` / **`aps`**（经 1~3 号技能池槽触发，P-17 接入）。

- `smoke` 键已于 2026-09-15 W2 随烟幕整链删除；`aps`（主动防御系统）为 2026-09-21 #G9 新增。
- `validateCard` 的 `ABILITY_KEYS` 白名单同步包含 innate 键 `repair`/`medkit`/`extinguish` 与全部 runtime 键 ⇒ 现为 **8 键**。
- **`super_fire_control` / `super_speed` 已于 2026-10-20 #W9 从两端一并删除**（用户裁定「删除」；196 张卡 + `tanks/` + `bosses/` 全库两键零命中，属死键；删键后 `test-rework-r1.js` 以负向断言锁死，详见 [战斗规范 · 技能与副武器](../combat/abilities-secondary.md)）。

**死效果键已整体摘除（2026-09-23 A 档）**：`recon` / `track_repair` 原在 `ABILITY_KEYS` 白名单内、却在 `ABILITY_KEYS_RUNTIME` 与 `ABILITY_KEYS_INNATE` 两池之外，**无任何激活路径**（`recon` 的 battle 技能池 DISPATCH 分支调用全仓库无定义的 `tryDroneCommand()`，靠 `typeof` 守卫恒为 no-op）⇒ 对应 5 张卡（`support_recon` / `sniper_recon_mark` / `emergency_track` / `mobile_track_repair` / `support_track_repair`，均只带单一 `ability` 效果、卡面自述「占位」）能正常抽取但激活零反应。**用户裁定（2026-09-23）：整体摘除**——两键从 `ABILITY_KEYS`、battle DISPATCH 表、`ABILITY_LABELS` / `ABILITY_KEY_HINT` 一并删除，5 张卡文件删除（卡池 173 → 168）。细则归口本页与 `DEVELOPMENT.md` §4.35。

> **⚠️ 沿革（不静默删除）**：本段原结尾写「**现行不变量**：`ABILITY_KEYS` ≡ innate 3 键 + runtime **7** 键，无死键」——该表述**已于 2026-10-20 #W9 被取代**（7 键里恰藏着 `super_fire_control` / `super_speed` 两个死键，已删除）。**现行键集合见本节开头**（RUNTIME **5** 键 / `ABILITY_KEYS` **8** 键）。

## passive

（原 §3 第 4 条）

机制性被动 `{key, value?}`，`key` ∈ **`PASSIVE_KEYS`（现行 6 键）**——**键集合唯一口径在 [被动卡与模块暴击](./passive-crit.md#passive_keys-现行键集合)**，本处不重复罗列（`PASSIVE_KEYS` 会随批次增减，重复罗列必然过期）。

> **沿革（不静默删除）**：本节原写 `{key:'reactive_armor'|'angle_boost'|'overmatch'|'spall_liner'|'commander_sight', value?}`——其中 **`commander_sight` 已于 2026-09-30 #J3 随视野系统整体退役删除**（原消费点为 battle 视野半径 `entityHiddenByVision` / `visionRadiusEff`，2026-09-19 #D2 接线前为死效果）；`wet_ammo_rack` / `crew_liner` 两键于 2026-10-20 #W-H 新增。**旧列表照录如上以供追溯，勿当作现行键集合。**

### 应急护盾 `reactive_armor`

（#W-G，2026-10-19 用户裁定——机制整体重做）

卡名由「反应装甲」改为「**应急护盾**」。机制从「命中驱动拦截」改为「**低血主动生成**」：

- **触发**：`player.hp / player.maxHp < RULES.cards.emergencyShield.triggerHpRatio`（0.10）时自动展开；
- **效果**：生成 1 个**持续 10s** 的**全向**护盾，吸收池 `shieldHp`（150），走 `js/tank_shield.js` 的 `applyShield`（#W7 修复后 `hp`/`duration` 可覆盖）；
- **冷却**：基础 90s，卡牌升级可缩短，**下限 60s**（`cooldownMinSeconds`）——经 `t._emergencyShieldCdDelta` 叠加后钳制；
- **不重复生成**：已持盾或冷却中不触发；
- **状态字段**：`_emergencyShieldCd`（冷却剩余）。`applyCardEffects` 获得时清零；battle `enterBattle` 每节点重置（冷却不跨节点）；主循环 `updateEmergencyShieldRearm` 逐帧递减。
- **⚠️ 历史上两种旧机制均已废弃**：① 一次性消耗（挡 1 发即消解）；② #U40 的「拦截后再充能 60s」。`js/tank_physics.js` 中对应的拦截分支已整体删除，`rule.key` 保留为 `reactive_armor` 仅为**存档/卡牌 id 兼容**。

## drone

（原 §3 第 5 条）

伴随浮游炮 `{kind:'striker'}`（`countMax=2` 上限）。

- **2026-10-23 用户裁定「删除侦查无人机，加强攻击无人机」**：`kind:'scout'`（侦察指示）**已下线** —— `cards/scout_drone.json` 置 `enabled:false`（`cardEligible` 与 `drawCardChoices` 双重过滤，永不进抽卡池），`RULES.abilities.drone.scoutRange` 键删除。当前唯一 kind = `striker`。
- **攻击型加强**（`RULES.abilities.drone`，唯一数值口径）：`strikeRange` 260→**400**、`fireInterval` 2.0→**1.5s**、`dmgMult` 0.4→**0.8**。沿革：~~260 / 2.0 / 0.4~~。
- **归入被动技能**：`drone` 效果属于「被动技能」卡类别（见下方「被动技能类别与槽位」）。

## 被动技能类别与槽位（2026-10-23 用户裁定）

**分类判据（效果层面，`isPassiveSkillCard(card)`，唯一口径 `js/tank_cards.js`）**——满足任一即属**被动技能卡**：

| 判据 | 说明 | 卡池实测 |
|---|---|---|
| `type:'passive'` | 机制性被动（应急护盾/摆角特训/成员内衬/超口径/防崩落/湿式弹药架） | 8 张 |
| `type:'drone'` | 伴随无人机（获得即生效、无需按键） | 1 张（`escort_drone`） |
| `type:'ability'` 且 key ∈ `PASSIVE_SKILL_INNATE_KEYS`（repair/medkit/extinguish） | 固有技能**强化**卡（修理箱/医疗包/灭火器由主循环自动触发，玩家不按键） | 2 张（`repair_kit`/`support_extinguisher`） |

累计 **12 张**被动技能卡。**明确排除**：`modifier`（火力/装甲/血量/机动的直接升级）、`ammo`、`weapon`、`economy`，以及 runtime 主动技能 `artillery`/`overdrive`/`shield`/`deploy_cover`/`aps`（占**主动**技能槽 3 格）。

**槽位规则（用户原话「每辆坦克固定数量，后期高等级坦克会赋予更多」）**：

- 槽位数 = **车型配置** `tanks/<id>.json` 的 `passiveSlots`（`applyTankConfig` 拷贝到实例）；缺省回退 `RULES.abilities.passiveSlotsMax`（**=2**）。实测 `tiger-I` / `Obj 780` = 3，其余 4 型 = 2。
- **不是升级项**：`UPGRADE_DEFS` 与局内商店均**不得**新增 passive 槽扩容项（`scripts/test-passive-skills.js` 2f/2g 负向断言防回潮）；槽位只随**所选车型**变化。
- **满槽顶替**：槽满时获得新被动卡 → 弹「被动技能槽 PASSIVE SLOTS」面板（复用 `#skillSlotPicker`）列出已占槽被动卡，玩家点选顶替谁；选定后 `removePassiveCard(tank, cardId)` 撤除旧卡（清 `card:*` 修饰器 + `cardEffects` 条目 + `_cardApplyCount`，使旧卡可再抽到）再 `applyCardEffects` 新卡。与主动技能顶替同机制。
- **HUD**：`#hudSkills` 下 `#passiveSlots` 容器由 `updatePassiveSlots()` 逐帧渲染，每格显示卡名短标 + **冷却角标**。冷却映射：`reactive_armor`→`_emergencyShieldCd`、`support_extinguisher`→`abilityCds.extinguish`、`repair_kit`→`abilityCds.repair`；其余常驻被动无冷却。

## economy

（原 §3 第 6 条）

`{field, value}`，**`ECONOMY_FIELDS` 现为 3 项**（以 `js/tank_cards.js` 为唯一口径）：`scoreMul` / `shopDiscount` / `reviveCount`。

**接线现状（#U40，2026-10-19 全通道落地）**：

| 字段 | value 语义 | 消费点 |
|---|---|---|
| `scoreMul` | **最终乘数**（1.15 = +15%；旧实现 `(1+value)` 曾错算 ×2.15） | 结算类计分（节点分/波次分/击杀分）统一乘 `runScoreMultiplier(tank)`（battle 三处计分点接入） |
| `shopDiscount` | **折扣率**（0.1 = −10%，多张相加、防御上限 0.5） | 局内商店价格乘 `(1 − runShopDiscount(tank))`（`runShopPriceFor` 调用方 `buyRunShopItem` 与 `buildRunShopInto` 展示同口径） |
| `reviveCount` | 复活次数增量 | `applyCardEffects` 写 `runReviveBonus`，battle `pickCard` 即时回算 `player.revives`（旧实现只在下局 `prepPlayerForRun` 生效，局内获得零反馈） |

> **~~`startScore`~~ 已删除（2026-10-20 #W15）**：该字段历史上写 `runStartScore` 但**全库零消费**（无任何读取方），属"预留但永不接线"的死配置 ⇒ 从 `ECONOMY_FIELDS` 白名单与 `removeRunModifiers` 的 `runStartScore` 清零中一并移除（归口 `js/tank_model.js`）。若将来要做「开局送分」类卡，需重新走白名单登记 + 消费方接线，不得只加字段。

## weapon

（原 §3 第 7 条）

主/副武器安装与升级 `{type:'weapon', action:'install'|'upgrade', slot:'primary'|'secondary', weaponType, statOverrides?}`（2026-09-15 #A22/#A23 定型）。

**完整语义（安装/升级两支、副武器单槽不变量、抽卡资格、`"+N"` 相对增量）见 [机制卡与武器 effect](./weapon-cards.md)**——本页不重复。（原 §3 第 7 条结尾指向原 §3.7 的 `weapon` 段；拆分后该段已独立成页。）

## 2026-10-22 新增的武器专有 modifier 键

`MODIFIER_STATS` 追加 7 个**武器专有**键（`js/tank_cards.js`）：

| 键 | 消费者 | 边界（`RULES.parameterLimits`） |
|---|---|---|
| `maxRange` | 机炮 `shell.maxRange`（`firePrimaryShell`） | `{min:300, max:1200}` |
| `overheatLock` | 机炮过热锁定（`fireTank`） | `{min:1.0, max:4.0}` |
| `clipCycleSeconds` | 弹夹短装填（`fireClipWeapon`） | `{min:0.5, max:1.0}` |
| `mineFieldCount` | 雷带雷数（`mineFieldLayout`） | `{min:3, max:12}` |
| `mineFieldLength` | 雷带长度 | `{min:120, max:460}` |
| `mineFieldReload` | 布雷冷却 | `{min:6, max:15}` |
| `mineFieldMaxDeploy` | 雷场槽位 | `{min:1, max:3}` |

**这些键不参与 `computeStats` 聚合**——它们只走 `weapon` 卡的 `statOverrides` 通道（写入 `weapons.<slot>.stats`，由 `primaryWeaponSpec` 合并）。登记在 `parameterLimits` 的目的是让 #U20 属性达限过滤与 `runShopLimitBlocked` 能按 `{min,max}` 双向判定（否则新卡的 `maxStacks` 上限只是装饰）。

**布尔型 statOverrides**（2026-10-22 新增）：`burstOnSalvo`（弹夹爆发射击）、`doubleTapEnabled`（砰砰炮）、`altReload`（交替装填）。`validateCard` 的 statOverrides 校验已允许布尔（原有三型：数值 / 布尔 / `"+N"` 增量）。

## 相关页面
- [卡牌定位与数据契约](./overview-contract.md) — `effects[]` 所在的 JSON 结构
- [被动卡与模块暴击](./passive-crit.md) — `passive` 的键集合与消费语义
- [三板块设计定稿](./design-blocks.md) — `weapon` 效果的完整语义与安装卡清单
- [战斗规范 · 弹种系统](../combat/ammo-system.md) — `ammo` 引用的弹种键与数值
