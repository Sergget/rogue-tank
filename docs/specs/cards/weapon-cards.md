# 机制卡与武器 effect

> **摘要**：原 §8.3——主/副武器安装卡与升级卡、`statOverrides` 三态、Boss 随机武备。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/cards.md` §8、§8.3（2026-10-21 拆分；原 §8.3 为 35 行，独立成页）
> **相关**：[三板块设计定稿](./design-blocks.md) · [七类效果类型 · weapon](./effect-types.md#weapon) · [战斗规范 · 武器与装填](../combat/weapons-reload.md)

> **本页是 §8 的第二半**：§8 拆为「[设计裁定 + 基础数值 + 技能卡](./design-blocks.md)」与本页「机制卡与武器 effect」。两页 `源自` 均写 §8。
>
> 各段机制细则的原归口（原 §8.3 内的跨节引用）：弹夹炮 → `combat.md` §9.1；电磁轨道炮 → `combat.md` §9.3；APS → `combat.md` §9.4。

## 主武器双管

（2026-09-20 #E13 用户裁定重做；`WEAPON_DEFAULTS.double_barrel`：`reloadMult ×1.0/管`、`count 2`、`switchSeconds 0.5`、`barrelOffset` **1.85**、`altReload false`）

- **epic 安装卡**：primary → `double_barrel`（`cards/weapon_primary_double_barrel`）——炮盾并排 2 炮管渲染（`tank_battledraw.js`，两根炮管**各自**绘制护套/制退器/抽烟器；偏移与弹道横向偏移同源）；装填时间为**单管**时间，两管**顺序流水线**装填（一个装填时间只装好一根 → 「+5s 第 1 管可单发 / +10s 第 2 管可齐射」）；单击（鼠标）发射 1 根已装填管，空格齐射（仅两管都就绪）；**默认两管装填进度互相干涉**（任一击发 → 两管进度归零）；HUD 显示两根炮管各自的独立进度弧；开火火光 ×1.7 + 音效增益 ×1.6；
- **rare「同步击发」**：`switchSeconds` 0.5→0.1（`cards/weapon_primary_sync_fire`）；
- **mythic「交替装填系统」**（2026-09-19 #D3 重定义；**2026-09-20 #E13 升为神话档并解除进度干涉**）：`altReload:true` —— 击发一管**不影响**另一根炮管已累计的装填进度（「+6s 发射时另一管仍是 +1s 进度」）+ 换管间隔 `switchSeconds` 0.5→0.05 + 单管装填 `reloadMult` ×1.0→×0.9（`cards/weapon_primary_alt_reload`）；
- **autocannon 线**（2026-09-15 W6 用户裁定重做）：epic 安装卡 `weapon_primary_autocannon`——伤害=标准 1/5（`damageMult 0.2`）、穿深=标准 85%（`penMult 0.85`，弹种系数机制不变）、射击间隔=装填时间×0.25（`reloadMult 0.25`）；热量机制：每发 `+heatPerShot 10%`、每秒冷却 `coolPerSec 15%`、≥`heatMax 100%` 过热并锁定 `overheatLock 2s`（`updatePrimaryHeat` 逐帧驱动冷却，`fireTank` 门控过热期开火；旧 burst 连发路径整体删除）；外观：炮管更细（`barrelWidthMult 0.6`）略短（`barrelLenMult 0.8`）、不绘护套/制退器/抽烟器、炮口特效与弹体随 `fxScale 0.55` 缩小（`tank_battledraw.js` 消费）；玩家装填环改热量表（绿 <50% / 黄 50–<100% / 红 ≥100%，锁定红色闪烁）；
- **rare「机炮散热强化」**：`coolPerSec` 15→22（`cards/weapon_primary_burst_tune` 改语义，id 不变保卡池计数）；
- **主武器运行时**：`fireTank` 消费倍率；双管走 `fireDoubleBarrel`/`updatePrimaryBarrels` 状态机——**`_dbState{count, ready[], loadT[], loader, altReload}`** 顺序流水线装填 + 干涉开关，旧 `reloadT[]` 独立并行装填语义已废弃；autocannon 改逐发短间隔 + 热量机制 `updatePrimaryHeat`，burst 连发已删除。细则归口 [战斗规范 · 武器与装填](../combat/weapons-reload.md)。

## 可部署物数量升级卡

（#E4，2026-09-20）

`ability_deploy_cover_fortified`（便携掩体上限 +1）、`weapon_secondary_mine_upgrade`（地雷上限 +1）——数量加成经 `RULES.abilities.deploy_limits.upgradeCards` 按持有卡累计到 `player.deployBonus`，超限时最早部署的可部署物直接消失。细则归口 [战斗规范 · 部署物与布雷](../combat/deployables.md)。

## 曲射

`mortar` aoe 90→120 / reload 8→6.5 分两卡。

- **2026-09-14 定案**：独立 HEC 弹种已移除（`RULES.ammoTypes` 删 `hec`、`cards/hec_curvature_shell.json` 删除）。
- **2026-09-15 用户裁定：主武器曲射机制移除**——`weapon_primary_howitzer` 卡与 `WEAPON_DEFAULTS.primary.howitzer` 删除、`RULES.weaponTypes.primary`/`WEAPON_PRIMARY_TYPES` 白名单同步剔除，主炮一律平射直线弹道（`firePrimaryShell` 的 isArc 落点块删除，`stepShells` isArc 分支仅服务副武器迫击炮弹）。
- **现行**：曲射/越障由**副武器层**承担——mortar 弹药 `ignoreCover:true` + `isArc` 落点（见下「副武器安装/升级」与 `DEVELOPMENT.md` §4.13）。HE 系链上代表升级卡为 `cards/ammo_upgrade_blast_he`（**终结点**，前驱 `proximity_he`，HE-OP 超压榴弹，溅射向）。

## 弹药升级

走现有 `ammo` effect 通道（mult 聚合 + mm 追加 + `ammoTypeCap` 软上限 dmg 2.5 / pen 1.8 / speed 2.0），只补内容梯度不改机制。通道语义唯一口径见 [七类效果类型 · ammo](./effect-types.md#ammo)。

## 副武器安装/升级

（效果类型 `weapon`，2026-09-15 #A22/#A23 定型）

`{type:'weapon', action:'install'|'upgrade', slot:'primary'|'secondary', weaponType, statOverrides}` —— **`action` 必填**（`validateCardEffect` 强制）。

| 分支 | 语义 |
|---|---|
| `install`（epic 安装卡） | `primary` 换装写入 `weapons.primary.type` + 合并 overrides 并清 `_spec`/`_dbState`；`secondary` **仅空槽**写入（默认值+overrides 合并），槽已占则 no-op（effect 仍入 `cardEffects`） |
| `upgrade`（rare/legendary 升级卡） | **仅当同型已持有**时合并 `statOverrides`，否则 no-op |

- **副武器单槽不变量**（无 `secondarySlots`/`activeSecondaryIndex`）。
- **抽卡资格**：`cardEligible(card, owned)` 在可用池阶段过滤——`install(primary)`=未持有该型 / `install(secondary)`=槽空 / `upgrade`=已持有同型 / `owned.cards` 达 `maxStacks` 则排除；`owned = {abilities, primaryWeapon, secondaryWeapon, cards?}`。
- 运行时 `updateSecondaryWeapon`（mortar 曲射/missile 制导/rocket 扇形/mine_layer 布雷 + turret 副炮塔）阶段七 7.2 已落地；玩家侧手动击发见 [战斗规范 · 技能与副武器](../combat/abilities-secondary.md)。

### `howitzer`（榴弹炮曲射模式）

（2026-10-20 #W-I，副武器语义）

`install` 卡 `weapon_secondary_howitzer`（epic，`{type:'weapon', action:'install', slot:'secondary', weaponType:'howitzer'}`）。

它是**模式载体**而非独立武器类型——装进副武器槽后**主炮**切曲射（判据 `isHowitzerMode(t)`），**副武器槽本身不发射**（`tryFireSecondary` 对 howitzer 直接 `return false`，与 `turret` 同属「载体/自主」例外），卸下/换掉即回直射。

升级卡走**副武器 upgrade 通道**写 `weapons.secondary.stats`（仅模式内生效）：`howitzer_blast_range`（rare，`splashRadius` 90→135）、`howitzer_rapid_barrage`（epic，`barrage` 3 连发 0.5s）。

> ⚠️ **`howitzer` 不进主武器类型表**（`WEAPON_PRIMARY_TYPES` 不含），但**进副武器白名单** `WEAPON_SECONDARY_TYPES`——`validateCardEffect` 放行 `weaponType:'howitzer'` 的 install/upgrade 两类卡。机制与参数唯一口径见 [战斗规范 · 曲射火力](../combat/arc-fire.md)。

## 武器升级卡数值梯度与补齐

（2026-09-15 数值复核，原 PLAN 阶段八 §8.1.1 已归档）

副武器 4 张 rare 升级卡 DPS 增益：mortar **1.333×**（reload 6）/ missile **1.524×** / rocket **1.389×**（count 5、reload 9）/ mine **1.500×**，统一带 `[1.25,1.60]`；`scripts/test-weapon-upgrade-balance.js` 锁定。

**副武器属性升级卡补齐（#S6，2026-10-14 用户反馈"副武器卡牌偏少"）**：新增 2 张 rare 升级卡——`weapon_secondary_missile_lock_upgrade`「导弹快速锁定」（`lockSeconds` 1.0→0.6、`lockArcDeg` 30→45；`updateMissileLock` 经 `cfg` 消费）、`weapon_secondary_rocket_speed_upgrade`「火箭高速推进器」（`speed` 450→650、`aoe` 40→55；`updateSecondaryMount` 火箭分支 `cfg.speed ?? 450` 消费）。升级资格照常（须持有同型副武器）。副武器卡总数 8→10（4 安装 + 6 升级）。

## 主武器 `clip`（弹夹炮）

（#G6，2026-09-21 新增）

epic 安装卡 `weapon_primary_clip`（primary → clip，`statOverrides` 与 `WEAPON_DEFAULTS.primary.clip` 同源）；rare 扩容卡 `weapon_primary_clip_extended`（`{"clipSize":"+1"}`，`maxStacks 2`，每 +1 发弹夹间装填 +0.8×标准装填）。机制细则（0.7s 弹夹内固定间隔 / ×3.0 弹夹间整组 / 扩容递减收益）归口 [战斗规范 · 武器与装填](../combat/weapons-reload.md)。

## 电磁轨道炮重调

（#G5，2026-09-21）

epic 安装卡 `weapon_primary_railgun` 数值更新为 `reloadMult 1.8 / damageMult 1.8 / penMult 2.0 / shellSpeedMult 2.5 / pierce 1 / pierceDmgMul 0.6`（新增贯穿 2 目标）；rare 升级卡 `weapon_primary_railgun_upgrade`（`{reloadMult:1.7, shellSpeedMult:3.0}`）。细则归口 [战斗规范 · 武器与装填](../combat/weapons-reload.md)。

## `statOverrides` 支持 `"+N"` 相对增量

（#G6，2026-09-21）

升级卡的 `statOverrides` 值合法类型扩为三类：

| 类型 | 语义 |
|---|---|
| `number` | 绝对值覆盖（原行为） |
| `boolean` | 开关（如 `altReload` / `guided`） |
| `"+N"` 字符串 | **在当前值基础上 +N** |

合并统一走 `mergeStatOverrides(stats, overrides)`（主/副武器两条升级分支同源），`"+N"` 经 `Number(cur) + N` 计算；`validateCard` 对三类放行、其它类型判非法。此前 boolean 值会被校验拒绝（`altReload`/`guided` 升级卡曾报非法）。

## 武器升级卡全覆盖

（#U39，2026-10-18 用户要求「主/副武器每种 2~3 张升级卡」）

清理了 4 处「升级卡写了不生效」的通道断点，并把覆盖面补齐到**每种武器 2~4 张**（实测 2026-10-18，`scripts/test-weapon-upgrade-balance.js` 的覆盖面段自动复核）。

1. **标准主炮通道从死到活**（`js/tank_fire.js` `primaryWeaponSpec`）：原实现对 `type==='standard'` **恒返回 null**，`weapons.primary.stats` 里的任何 `statOverrides` 都被忽略 ⇒ 所有 `weapon_primary_standard_*` 卡天然无效。现行：**无 stats 覆写时仍返回 null（与既有行为逐字节一致）**，有覆写才产出规格（缺省表由 `WEAPON_DEFAULTS.primary.standard` 兜底，倍率全 1.0）。新增 3 张 standard 升级卡（rare 硬芯穿甲弹 dmg ×1.15/pen ×1.08、rare 快速装填机 reload ×0.85/speed ×1.15、epic 锥膛炮管 pen ×1.22/speed ×1.25）。
2. **`missile_wire` 进入卡牌白名单**：它一直在 `RULES.weaponTypes.secondary` / `WEAPON_DEFAULTS.secondary` / `fireActiveSecondary` 的 wire 分支里，却漏在 `WEAPON_SECONDARY_TYPES` 外 ⇒ 任何线导导弹卡都被 `validateCardEffect` 判「weaponType 非法」。现补入，并新增**安装卡** `weapon_secondary_missile_wire`（此前该型没有任何获取途径）+ 2 张升级卡（rare 双级推力 speed 340→560/reload 10→8、rare 串联战斗部 damage 150→220/range 700→900）。
3. **`mine_layer` 的爆炸/触发半径收口进缺省表**：`fireActiveSecondary` 原把 `blastRadius 70` / `triggerRadius 45` 写死在字面量里，升级卡无法覆盖。现 `WEAPON_DEFAULTS.secondary.mine_layer` 补这两个字段并改读 `cfg`，新增 rare 阔域雷场（105/70）。
4. **`missile_wire` 的 speed 收口**：原只在 wire 分支写死 `340`，现缺省表补 `speed: 340` 并由 `cfg.speed` 消费。
5. **新增安装卡 `weapon_secondary_turret`（副炮塔）**：`turret` 型此前同样无任何安装卡（只在 Boss/bench 内部使用）。配套 3 张升级卡（rare 加长身管 / rare 伺服传动 / epic 重炮塔座）。

**新增/补齐清单（共 20 张）**：

- 主武器 9 张 —— standard ×3（`_damage`/`_reload`/`_pen`）、autocannon ×3（`_damage` rare / `_heat` rare / `_feed` epic）、railgun ×1（`_damage` rare，含 pierce 1→2）、clip ×1（`_capacity` rare，`"+2"` 容量 + 发际 0.55s）、double_barrel ×1（`_turret` rare）；
- 副武器 11 张 —— turret 安装 ×1 + 升级 ×3、missile_wire 安装 ×1 + 升级 ×2、mortar ×1（`_accuracy` rare）、mine_layer ×1（`_radius` rare）、rocket ×1（`_warhead` rare）、missile ×1（`_damage` rare）。

**复核带（`scripts/test-weapon-upgrade-balance.js` 扩面）**：复核面从原 4 张副武器 rare 卡扩到**卡池内全部 weapon upgrade 卡**并按通道分三档——① 纯 DPS 通道增益 ∈ `[1.15, 1.75]`；② 混合通道 DPS ≥ 1.0 且功能字段实际变化；③ 纯功能性通道 DPS 不变且有 ≥1 字段相对基础规格变化（防「写了等于没写」）。原 4 张（#S6 定案）另按历史紧带 `[1.25, 1.60]` + 极差 ≤0.35 复核，结论不回退（实测增益 1.333/1.524/1.389/1.500，极差 0.190）。同时新增「每张升级卡的 weaponType 必须有对应安装卡（standard 豁免）」契约断言。

**机制型豁免**：`clip` 属「弹夹容量 + 发际间隔」的非线性改造，DPS 公式不适用，只校验字段实际变化。

## Boss 随机武备

（#U39，2026-10-18 用户反馈「boss 似乎还不会随机到这些武器和升级」）

Boss 此前只有 `assignBossSkills` 随机技能，`weapons` 恒为 `standard` + `none` ⇒ 主/副武器安装卡与升级卡对 Boss 完全不可见。现行：

- **选择逻辑**（纯函数 `pickBossArmament(pool, {rng, bossNumber})`，`js/tank_cards.js`）：① 以 `primaryChance` 掷骰从 `slot=primary && action=install` 随机取 1 张；② 以 `secondaryChance` 掷骰从 `slot=secondary && action=install` 随机取 1 张；③ 对**已选中**的主/副武器类型，从 `action=upgrade && weaponType 匹配` 里逐张独立掷骰抽取，最多 `upgradeMax` 张（概率 `upgradeChance + bossNumber × upgradeChancePerBoss`）。任何一步无货静默跳过。
- **参数唯一口径 `RULES.boss.armament`**：`{ enabled, primaryChance 0.9, secondaryChance 0.7, upgradeMax 2, upgradeChance 0.55, upgradeChancePerBoss 0.1 }`。
- **施加通道**：battle `assignBossArmament`（`tank_battle.html`，在 `assignBossSkills` 之后调用）经 `applyCardEffects` 施加 —— 与玩家卡牌**同一语义通道**（换装重置 stats 基线、升级仅同型合并），不另开旁路。
- **实测分布（2026-10-18，500 次探针，真实卡池 191 张）**：平均每 Boss 携带 **3.27 张**卡（含升级卡 830 次），`applyCardEffects` 失败 0 次；主武器 five-way 均匀（各 22.2%~22.8%）、仍为标准主炮 9.8%；副武器 6 型各 10.8%~12.2%、空槽 29.6%。
- **可读性**：TAB 状态面板 Boss 行新增「武备:主武器+副武器·改装×N」，出生时日志输出 `BOSS 武备：…｜改装 …`。

> 运行时（Boss 实体上的施加时机与简报）见 [Boss 规范 · 随机武备](../boss/behavior.md#boss-随机武备)。

## 主动防御系统 APS

（#G9，2026-09-21 新增能力卡）

epic `ability_aps`（`{type:'ability', key:'aps'}`，`maxStacks 1`）——经技能池 1~3 号技能键触发（无独立字母键）；参数 `RULES.abilities.aps`（duration 6s / radius 240px / maxIntercepts 3 / cooldown 22s）。机制细则归口 [战斗规范 · 技能与副武器](../combat/abilities-secondary.md)。

## 2026-10-22 第五批：武器卡增删与收口

### 新增 10 张

| id | 名称 | 稀有度 | statOverrides | maxStacks |
|---|---|---|---|---|
| `weapon_secondary_mine_density` | 布雷器：加密装药 | rare | `mineFieldCount: "+2"` | 3 |
| `weapon_secondary_mine_length` | 布雷器：延展雷带 | rare | `mineFieldLength: "+80"` | 3 |
| `weapon_secondary_mine_cooling` | 布雷器：快速布雷 | rare | `mineFieldReload: "-2"` | 3 |
| `weapon_secondary_mine_slot` | 布雷器：多雷场控制器 | epic | `mineFieldMaxDeploy: "+1"` | 2 |
| `weapon_primary_autocannon_range` | 机炮：加长身管 | rare | `maxRange: "+100"` | 3 |
| `weapon_primary_autocannon_cooling` | 机炮：强制风冷 | rare | `overheatLock: "-0.5"` | 2 |
| `weapon_primary_autocannon_pierce` | 机炮：钨芯弹链 | epic | `penMult: "+0.05"` | 2 |
| `weapon_primary_clip_short_reload` | 弹夹炮：快速推弹机 | rare | `clipCycleSeconds: "-0.1"` | 2 |
| `weapon_primary_clip_burst` | 弹夹炮：爆发射击 | epic | `burstOnSalvo: true` | 1 |
| `weapon_primary_standard_doubletap` | 标准主炮：砰砰炮 | epic | `doubleTapEnabled: true` | 1 |

机制细节分别归口：[布雷器 · 雷场](../combat/deployables.md#布雷器与雷场) / [机炮](../combat/weapons-reload.md#机炮) / [弹夹炮](../combat/weapons-reload.md#弹夹炮) / [砰砰炮](../combat/weapons-reload.md#标准主炮的砰砰炮)。本表只锁卡面数据。

### 删除 1 张、改造 1 张

- **删除** `weapon_primary_sync_fire`（同步击发装置）：唯一效果 `switchSeconds 0.5 → 0.1` 在「换管时间固定 0.8s」后完全失效（2026-10-22 用户裁定）。
- **改造** `weapon_primary_alt_reload`（交替装填系统）：稀有度 **mythic → epic**；`statOverrides` 只留 `{altReload: true}`（删 `switchSeconds: 0.05` 与 `reloadMult: 0.9`）。语义改为「单管射击不再重置另一管的装填进度」。

### 既有卡与新机制的冲突收口（6 处）

| 卡 | 动作 | 原因 |
|---|---|---|
| `weapon_primary_autocannon_damage` | 摘掉 `penMult 0.95`（只留 `damageMult 0.26`） | 会突破「穿深增强最多 +10%（0.80→0.90）」上限 |
| `weapon_primary_autocannon_heat` | 摘掉 `overheatLock 1.2`（只留 `heatMax 140`） | 会突破「过热锁定 ≥1.0s」下限 |
| `weapon_primary_clip_capacity` | 摘掉 `clipCycleSeconds 0.55`（只留 `clipSize "+2"`） | 会突破「短装填最多 −0.2s（0.7→0.5）」 |
| `weapon_secondary_mine_upgrade` | 改为 `{ mineFieldHeRatio: "+0.15", duration: 45 }`（删 `damage: 150`） | 雷场伤害已改为「HE × 比例」，`damage` 对雷场失效 |
| `weapon_primary_sync_fire` | **删除** | 换管时间固定后完全失效 |
| `weapon_primary_alt_reload` | 只留 `altReload: true`、降 epic | 同上 |

> **收口原则**：每个新上限只能有一个卡牌来源；既有卡若已给到超限值必须先摘键再上线新卡，否则 `maxStacks` 只是装饰。

## 相关页面
- [三板块设计定稿](./design-blocks.md) — 原 §8 的第一半：设计裁定 / 基础数值 / 技能卡
- [七类效果类型 · weapon](./effect-types.md#weapon) — `weapon` 效果的参数结构
- [战斗规范 · 武器与装填](../combat/weapons-reload.md) — 主炮五型的机制细则与装填公式
- [Boss 规范 · 行为与弱点](../boss/behavior.md) — 随机武备在 Boss 实体上的施加
