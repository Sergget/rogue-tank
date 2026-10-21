# 三板块设计定稿（基础数值 / 技能卡）

> **摘要**：2026-09-13 会话裁定的三板块设计契约——设计裁定、基础数值梯度、技能卡梯度与总表。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/cards.md` §8、§8.1、§8.2、§8.4、§8.5（2026-10-21 拆分）
> **相关**：[机制卡与武器 effect](./weapon-cards.md) · [七类效果类型](./effect-types.md) · [兼容索引](../cards.md)

> 本节 2026-09-13 会话裁定为设计契约，同日已随 PLAN 阶段四/阶段六落地实现（见 `DEVELOPMENT.md` §4.9），数值梯度均按下方表格执行并验证。
>
> **§8 拆为两页**：本页承载「设计裁定 + 基础数值 + 技能卡」；**机制卡与武器 effect（原 §8.3，35 行）独立成页** → [机制卡与武器 effect](./weapon-cards.md)。两页 `源自` 均写 §8。

## 设计裁定（用户拍板）

（原 §8.1）

1. **不做百分比减伤**：防御成长只走装甲/跳弹/内衬（`spall_liner` 模式），不引入 `damage_reduce` 类整车减伤被动。
2. **空袭不新增独立键**：定点/地毯式空袭作为 `RULES.abilities.artillery` 的**升级形态**（卡牌改写 `delay`/`shellCount`/`radius`/`shape` 参数），复用 `callStrike` 管线与 `maxStrikes` 预警池。
3. **副武器卡牌直接安装**：局内 epic 起步的安装卡直接写入 `weapons.secondary`，不做局前 Loadout 双通道。

## 坦克基础数值卡梯度

（原 §8.2，modifier 通道，无新机制）✅ 已实现

| 维度 | common | rare | epic | legendary |
|---|---|---|---|---|
| 血量 maxHp | +12% | +20% | +35% | +50%（附带 weight +10%） |
| 装甲（逐面 add） | front +10 / side +6mm | front +18mm | 六面各 +12mm | front 等效 ×1.15（倾斜效应） |
| 射速 reload | ×0.93 | ×0.87 | ×0.80 | ×0.72（仍受 1.0s 地板钳制，2026-09-17 #C2） |
| 精度 aimSpeed | +15% | +25% | +40% | +60% + 静止首发 σ×0.6 |
| 三扩（motion/hullRot/turretRot 分卡） | 单项 −15% | 单项 −22% | 单项 −30% | 三项全 −25% |
| 马力 enginePower | +15% | +25% | +35% | +35% 且 maxSpeed +10% |

- 全部复用 `addModifier` 管道 `scope='run'`；装甲 add 沿用 `armor.hull.front` 等白名单路径。
- weight 联动为拟真 trade-off 杠杆：马力/血量线搭 `weight +x%`。
- 已生成 `cards/hull_hp_boost_1~4` / `hull_armor_front_1~2` / `hull_armor_all_3` / `reload_speed_1~4` / `aim_speed_1~4` / `engine_power_1~4`。

> **硬限提醒**：上表「射速」列的 1.0s 地板属 `RULES.parameterLimits` 的参数通道硬限，规则唯一口径见 [七类效果类型 · 运行时参数硬限](./effect-types.md#运行时参数硬限)。

## 技能卡定案

（原 §8.4，锚定现有 `RULES.abilities` 参数）✅ 已实现（阶段七 7.1 补进阶升级卡）

| 技能 | 升级梯度 |
|---|---|
| 召唤炮击 artillery | rare：`shellCount` 3→5；epic：`radius` 110→140；legendary：`reload` 15→10 |
| 空袭·定点（artillery 升级形态） | legendary：`delay` 2.5→1.5s、`radius` 110→60、单发 `dmgMult` ×1.2→×3.0、`shape:'point'` |
| 空袭·地毯（artillery 升级形态） | legendary：`delay` 2.5→3.5s、沿炮塔朝向矩形 240×80、8 发 `dmgMult` ×1.0、`shape:'carpet'` |
| 伴随无人机 drone | rare：`striker dmgMult` 0.4→0.55；epic：`fireInterval` 2.0→1.6 **（countMax 升级未生成，现行场上上限恒为 `RULES.abilities.drone.countMax=2`）** |
| 布设掩体 deploy_cover | epic：沙袋/护盾 OBB hp 200、cd 20s —— 接 R-2 deployables（战术护盾掩体已有运行时） |
| 主动防御 aps | epic 基础卡 `ability_aps`（#G9 2026-09-21 新增）；经 1~3 号技能键触发，参数见 `RULES.abilities.aps` |

### params 覆写通道

（阶段七 7.1 已落地）

`ability` 效果支持可选 `params` 对象，`tank_abilities.js` `computeAbilityConfig(t, key)` 聚合 `RULES.abilities` 基础 + `cardEffects` 覆写；`tryActivateAbility` 全分支消费聚合参数。已生成进阶卡：`ability_artillery_barrage` / `ability_artillery_heavy` / `ability_artillery_strike_point` / `ability_artillery_strike_carpet` / `ability_deploy_cover_fortified`（`DEVELOPMENT.md` §4.11）。

> 原 `ability_smoke_dense` 已随 2026-09-15 W2 烟幕整链删除。

### 空袭实现与 deploy_cover 现状

- 空袭实现集中在 `tank_strike.js` 落点分布函数（point/carpet 两形状）+ artillery 参数卡改写语义（ability 效果 `params` 覆写通道）。
- `callStrike` 已支持 `shape:'circle'|'point'|'carpet'`；`deploy_cover` 已入 `RULES.abilities`（hp 200 / shieldHp 150 / duration 30 / cooldown 20）与 `tank_abilities.js` 运行时键白名单，已生成 `cards/ability_deploy_cover`。

### ability 升级卡的持有资格 `requiresAbility`

（#A28，2026-09-16 定型）

`{type:'ability', key, requiresAbility?, params?}` —— `requiresAbility` 可选，**值恒等于自身 `key`**（ability 的「升级」语义 = 同一 key 的 `params` 覆写，经 `computeAbilityConfig` 按 key 聚合；故不引入 weapon 那样的 `action` 字段）。语义由 `cardEligible` 消费：`requiresAbility` 存在且不在 `owned.abilities` 中 → 该卡抽取期不合格。**`validateCardEffect` 显式校验**（必须是 `ABILITY_KEYS` 内的字符串，缺省合法）——拼写错误会让资格过滤静默失效。

- **已标记（5 张升级卡，均为 `params` 覆写卡）**：`ability_artillery_barrage` / `ability_artillery_heavy` / `ability_artillery_strike_point` / `ability_artillery_strike_carpet`（`requiresAbility:'artillery'`）、`ability_deploy_cover_fortified`（`requiresAbility:'deploy_cover'`）。
- **不得标记（6 张基础/安装卡，死锁防线）**：`artillery_strike` / `tactical_shield` / `super_reload` / `ability_deploy_cover` / `repair_kit` / `support_extinguisher`（原 11 张，2026-09-23 A 档摘除 5 张死效果卡后缩减）。**通用不变量**（`test-cards.js` 守门）：每个出现过的 ability key 至少有一张未标记卡作为获取途径；否则该能力永远无法获得。`repair`/`extinguish` 属 `ABILITY_KEYS_INNATE`（开局自带、绕过持有检查），其卡不受影响。
- **语义闭环**：`applyCardEffects` 非 modifier 分支 `Object.assign({}, ef, {cardId})` 保留 `ef.key` → 基础卡 key 落入 `player.cardEffects` → mvp `drawRewardCards` 组装 `owned.abilities` → 同 key 升级卡转为合格。
- **保底路径**：资格过滤在 small-pool early-return 与保底**之前**执行，保底只在已过滤的 `usable` 上取卡，**不复活**不合格升级卡；池内只剩升级卡时宁缺毋滥。
- **实况注意**：传奇档位池的 2 张 ability 卡（point/carpet）**全为升级卡** → 未持 `artillery` 者在该池抽不到能力卡（正确行为：artillery 基础卡在 common/rare/epic 池）。作者经 `tools/content_designer.html` 编辑能力卡时须保留 `params`/`requiresAbility`（该编辑器已补全三字段往返）。

## 技能卡总表

（原 §8.5，`#A28` 分类：base=可独立获取 / upgrade=需先持有同 key）

> **2026-09-23 A 档**：原 `recon` / `track_repair` 两键的 5 行（`support_recon` / `sniper_recon_mark` / `emergency_track` / `mobile_track_repair` / `support_track_repair`）已随死效果键整体摘除，不在下表。

| 卡 id | key | 分类 | requiresAbility |
|---|---|---|---|
| `artillery_strike` | artillery | base | — |
| `ability_artillery_barrage` | artillery | upgrade | `artillery` |
| `ability_artillery_heavy` | artillery | upgrade | `artillery` |
| `ability_artillery_strike_point` | artillery | upgrade | `artillery` |
| `ability_artillery_strike_carpet` | artillery | upgrade | `artillery` |
| `ability_deploy_cover` | deploy_cover | base | — |
| `ability_deploy_cover_fortified` | deploy_cover | upgrade | `deploy_cover` |
| `tactical_shield` | shield | base | — |
| `super_reload` | overdrive | base | — |
| `repair_kit` | repair（innate） | base | — |
| `support_extinguisher` | extinguish（innate） | base | — |

### innate 强化卡的卡面语义

（2026-10-17 #U21，现行口径）

`repair_kit` / `support_extinguisher` 以 `type:'ability'` 发放，但 `repair` / `extinguish` 是**开局固有的 innate 键**（`ABILITY_KEYS_INNATE`，`tryActivateAbility` 绕过持有检查）——这两张卡**不会新增技能槽**，只改写该能力的修复量/冷却（`tank_abilities.js` 按 `cardId` 应用）。卡面因此必须写「强化固有技能【修理箱】…（修理箱为开局固有技能，本卡是强化而非新增）」，避免被读成「占了一个技能位却不能激活」。

### innate 键豁免 #U18 已持去重

（#U40，2026-10-19）

`cardEligible` 的「已持技能去重」（#U18）对 `repair` / `medkit` / `extinguish` 三个 innate 键**豁免**（判定键 `ABILITY_KEYS_INNATE_LOCAL`，`js/tank_cards.js`，与 `tank_abilities.ABILITY_KEYS_INNATE` 同源）——玩家开局即「持有」固有键，若照 #U18 去重则这两张纯强化卡永远抽不到（#U21 改卡面仅解决语义误读，没解决抽取资格）。runtime 键照旧去重，口径不变。回归 `scripts/test-cards.js` #U40 段。

## 相关页面
- [机制卡与武器 effect](./weapon-cards.md) — 原 §8.3：安装/升级卡、`statOverrides`、Boss 随机武备
- [七类效果类型](./effect-types.md) — `ability` / `modifier` 的参数结构
- [抽卡规则与保底](./draw-rules.md) — `requiresAbility` 在抽卡侧的资格过滤
