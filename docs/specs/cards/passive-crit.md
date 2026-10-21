# 被动卡与模块暴击

> **摘要**：`PASSIVE_KEYS` 六键的接线、overmatch 与内衬口径、防御方减伤通道、模块暴击修饰器。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/cards.md` §6、§7（2026-10-21 拆分）
> **相关**：[七类效果类型](./effect-types.md) · [抽卡规则与保底](./draw-rules.md) · [战斗规范 · 装甲、跳弹与模块伤害](../combat/armor-ricochet.md)

> **本页承载原 §6 的五个主题段**：passive 键集合与接线（原 **6.0**）/ overmatch 口径碾压（原 **6.1**）/ 全线高爆（原 **6.2**）/ 防崩落内衬（原 **6.3**）/ 防御方减伤（原 **6.4**）；末节为原 §7 模块暴击。

## PASSIVE_KEYS 现行键集合

（原 §6 首条 = 原 6.0——**全卷唯一的键集合口径，其余页一律指向本条**）

**以 `js/tank_cards.js` 为唯一口径**，2026-10-21 实测，**现行 6 键**：

| # | 键 | 语义入口 |
|---|---|---|
| 1 | `reactive_armor` | 应急护盾（低血触发，见 [effect-types · 应急护盾](./effect-types.md#应急护盾-reactive_armor)） |
| 2 | `angle_boost` | 摆角增益 |
| 3 | `overmatch` | 口径碾压（见下「overmatch」） |
| 4 | `spall_liner` | 防崩落内衬（见下「防崩落内衬」） |
| 5 | `wet_ammo_rack` | 湿式弹药架（防御方减伤，见下「防御方减伤通道」） |
| 6 | `crew_liner` | 成员内衬（防御方减伤，见下「防御方减伤通道」） |

> **~~`commander_sight`~~ 已于 #J3（2026-09-30 视野系统退役）删除**，**实测不在表内**——本卷此前若有引用均属过期（[effect-types · passive](./effect-types.md#passive) 已加沿革注记）。

## passive 统一消费入口

（原 §6 第 2 条）

`passiveValues(tank, key)`（`js/tank_physics.js`）：收集 `cardEffects` 中 `type:'passive'` 的数值数组，多来源聚合语义**由消费方自决**——`overmatch` 取最大阈值、`spall_liner` 取最小乘数（取最强）。

## overmatch（口径碾压，原 6.1）

（原 §6 `#A14b`；`demo_overmatch_shell` epic）

AP/APCR（或 key 为空）命中时，若目标受击面等效厚度 `eff` ≤ 穿深×阈值（默认 **0.85**），跳过跳弹判定与过陡 BLOCK 分支、强制按穿透路径结算（正常未击穿判定 `eff > effPen` 仍保留）；命中结果带 `res.overmatch=true` 标记。HEAT/HE 本就走 noBounce，不走此路径。定案：按用户意向转 AP 弹种（原 HE dmg 效果移除，仅保留 passive overmatch）。

## 全线高爆战术（原 6.2）

（原 §6 `#A14a`；`demo_all_he_doctrine` legendary）

移除全局 `reload×0.85` 白送效果，仅保留 HE `dmg×1.2` + HE `pen×1.2` 两重弹种效果——不再溢出到全弹种装填。

## 防崩落内衬（原 6.3）

（原 §6 `#A15`；`support_spall_liner` rare 0.8 / `spall_liner` epic 0.85）

`spallMul` 乘入击穿路径与 HE 残余爆轰的最终伤害（位于装甲/跳弹判定之后、随机抖动与取整之前，保证显示伤害=实际扣血整数一致）。

## 防御方减伤通道（原 6.4）

（原 §6 `#W-H`，2026-10-20 新增，`wet_ammo_rack` / `crew_liner`）—— **唯一口径**（实现在 `js/tank_physics.js` 的 `getMultForKey`）

- **语义与攻击方乘子的区别（关键，勿混淆）**：`ammoMult`/`crewMult` 是「**我打得痛**」（攻击方，来自 `shell.shooter.stats` 或弹种表值）；本通道是「**我挨得不痛**」（防御方，读**受击方** `target.cardEffects` 的 `passiveValues`）。
- **映射**：`ammo` 键 → `wet_ammo_rack`；6 个 crew 键（engine/gunner/loader/driver/commander/breech）→ `crew_liner`。
- **取值**：`defense = max(0, 1 − maxValue)`（多张同类取**最强**，与 `spall_liner` 同口径的 min 方向；`max(0, ·)` 钳制保证不出现负伤害）。
- **不叠乘（if/else 单通道）**：`ammo` 键**只**走 `wet_ammo_rack`、crew 键**只**走 `crew_liner` ⇒ 两卡同在手时各自只作用自己那类键，**不会**变成 `0.7×0.8`。
- **不在通道内**：`track` 键与 `null`（概率余量）不受任一防御卡影响。
- **实测精确比值**（`ammoKey:'ap'`，表值 `ammoMult=2` / `crewMult=1.5`；`moduleFromHit` 打桩 + `Math.random=0.5` 固定抖动为 1.0）：`ammo` 200→140 = **×0.7000**；6 个 crew 键 150→120 = **×0.8000**；两卡同在手 ammo=140（叠乘应为 112）、crew=120（叠乘应为 84）⇒ **证明确未叠乘**。
- **⚠️ 可观测性前提（重要口径，不是缺陷）**：`draws=1` 时 `effectiveMult = Math.max(mult1, mult2)`，而 `mult2` 恒为 `1.0` ⇒ 当攻击方 base **≤ 1.0** 时，防御减伤因子会被 `max` 吃掉而**不可观测**（实测 `ammoMult=0.5` 时 wet 反而显示 ×1.2989「加伤」）。**写断言必须挑 base>1 的弹种**（如 `ap` 的 2）。这是既有实现的真实行为，非缺陷。
- 回归：`scripts/test-physics.js` #W-H 段 **33 条断言**（含隔离性、不叠乘、多张取最强、攻击方独立、cardEffects 格式健壮性、`value≥1` 钳制、多抽取弹种仍生效）。

## 测试锚定

（原 §6 末条）

`scripts/test-cards.js` 的 `#A14a`/`#A14b`/`#A15` 断言覆盖：overmatch 免跳弹 / 阈值不满足仍跳弹 / HEAT 不受影响；内衬 rare 0.8 + epic 0.85 多来源取最强。

## 模块暴击修饰器

（原 §7，`#A16`）

- **修饰器白名单与几率加成**：
  - 新增 `fireControlCrit`（火控增强提升炮手、炮闩受损概率）与 `loaderAmmoCrit`（提升装填手、弹药架受损概率）修饰器。
  - 加法叠加，**最大加成限制在 ≤25%**，修正后单区判定概率**限制在 ≤90%**（确保保留击穿而没有额外成员/模块损伤的余量空间）。
  - 在 `tank_physics.js` 的 `moduleFromHit` 中完整应用。`scripts/test-cards.js` 对应新增判定几率加成及钳制上限测试断言，全部通过。

> 这两个键的**三通道补齐**（卡牌白名单 / 局外永久商店 / 局内商店）见 [升级覆盖面](./upgrade-coverage.md)。

## 相关页面
- [七类效果类型 · passive](./effect-types.md#passive) — `passive` 效果的参数结构
- [升级覆盖面](./upgrade-coverage.md) — `fireControlCrit`/`loaderAmmoCrit` 的三通道来源
- [战斗规范 · 装甲、跳弹与模块伤害](../combat/armor-ricochet.md) — `moduleFromHit` 与模块概率分区
- [抽卡规则与保底](./draw-rules.md) — 「取最优」被动去重
