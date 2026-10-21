# 卡牌与构筑系统规范 —— 兼容索引（现行内容见 wiki 分页）

> 本卷原名「战术坦克 Roguelike — 卡牌与构筑系统规范 (Cards & Build Spec)」；**Roguelike 卡牌**的构筑定位与调性见 [cards/index.md](./cards/index.md)。
>
> ⚠️ **本页是 §N 兼容层**：全部章节编号原样保留（全仓引用本卷章节号的外部文档依赖它们），
> 但正文已迁至 `docs/specs/cards/` 下的主题页。**查现行口径请点每节的「详见」链接。**
> 拆分日期 **2026-10-21**；拆分前的单卷原文以 git 提交 `57be2ca` 为准（见 `docs/archive/2026-10-pre-wiki-cards.md` 的还原说明与分节行号表）。
> 规范见 [`docs/WIKI-STYLE.md`](../WIKI-STYLE.md)；卷首页见 [cards/index.md](./cards/index.md)。

---

## 0. 主题索引（按问题查，不按章节序读）

> ⚠️ **本卷含历史批次章节（§6、§8~§11），章节号按时间追加，不代表主题分组**——同一机制可能两处都有。
> **查现行口径请用本索引**：每行给出「该主题的现行口径在哪一页」与「只是来源沿革、不必读的页」。
> 本卷章节号被外部文档直接引用——**编号保持稳定、不做重排**；本索引是唯一的「按主题导航」入口。

| 我想查…… | 现行口径（先看这里） | 来源沿革（不必读） |
|---|---|---|
| **卡牌 JSON 有哪些字段** / schema | [卡牌定位与数据契约](./cards/overview-contract.md)（§1、§2） | §8.2 / §8.3 的卡面示例 |
| **七类效果类型**（modifier / ammo / ability / passive / drone / economy / weapon） | [七类效果类型](./cards/effect-types.md)（§3） | — |
| **弹种链替换 / `replaceAmmo` 校验** | [七类效果类型 · ammo](./cards/effect-types.md#ammo)（§3 第 2 条）；链语义归 [战斗规范 · 弹种系统](./combat/ammo-system.md) | §8.3「弹药升级」 |
| **ability 键集合**（RUNTIME **5 键** / `ABILITY_KEYS` **8 键**） | [七类效果类型 · ability](./cards/effect-types.md#ability)（§3 第 3 条） | §8.4 技能卡梯度、§8.5 技能卡总表 |
| **passive 键集合**（现行 **6 键**） | [被动卡与模块暴击 · PASSIVE_KEYS](./cards/passive-crit.md#passive_keys-现行键集合)（§6 首条，**唯一口径**） | §3 第 4 条的旧键列表（**已过期**，见 [沿革](./cards/changelog.md#旧-passive-键列表含-commander_sight)） |
| **economy 字段**（现行 **3 项**） | [七类效果类型 · economy](./cards/effect-types.md#economy)（§3 第 6 条） | [沿革 · startScore](./cards/changelog.md#economy-的-startscore) |
| **稀有度五档 + 抽取权重 + 卡池分布** | [稀有度、权重与验证工具链](./cards/rarity-tools.md)（§4、§5） | §8.2 各稀有度的数值梯度 |
| **卡牌 `tags`（流派）** | **已于 2026-10-20 #16 整体下线** → [沿革](./cards/changelog.md#tags-字段下线2026-10-20-16) | §5 的 tag 审计维度、§11 的查看器分类维度（均已随之下线） |
| **堆叠 `maxStacks` / 验证工具链** | [稀有度、权重与验证工具链 · 堆叠与验证](./cards/rarity-tools.md#堆叠与验证)（§5） | — |
| **模块暴击**（`fireControlCrit` / `loaderAmmoCrit`，上限 0.25） | [被动卡与模块暴击 · 模块暴击修饰器](./cards/passive-crit.md#模块暴击修饰器)（§7） | §10「三通道全空缺」的补齐记录 |
| **三板块设计**（基础数值 / 机制 / 技能） | [三板块设计定稿](./cards/design-blocks.md)（§8、§8.1、§8.2、§8.4、§8.5） | — |
| **武器 effect（安装/升级卡）与 `statOverrides`** | [机制卡与武器 effect](./cards/weapon-cards.md)（§8.3） | §3 第 7 条的入口概述 |
| **Boss 随机武备**（`pickBossArmament`） | [机制卡与武器 effect · Boss 随机武备](./cards/weapon-cards.md#boss-随机武备)（§8.3 末） | [Boss 规范 · 行为](./boss/behavior.md#boss-随机武备)（运行时一侧） |
| **装备优先抽卡 / 各类保底 / Boss 轮加权** | [抽卡规则与保底](./cards/draw-rules.md)（§9，**唯一口径**） | — |
| **升级覆盖面**（`MODIFIER_STATS` / `UPGRADE_DEFS` / `RUN_SHOP_DEFS`） | [升级覆盖面](./cards/upgrade-coverage.md)（§10） | — |
| **局内卡牌查看器**（`C` 键） | [局内卡牌查看器](./cards/card-viewer.md)（§11） | — |
| **全部历史 / 已删除机制** | — | [沿革与已作废](./cards/changelog.md) |

---

## 1. 卡牌设计定位

> 卡牌是节点通关后三选一的**坦克改装/战术强化**（不是手牌牌组）；调性围绕装甲/穿深/装填/机动/散布/弹种/乘员展开。

**详见**：[卡牌定位与数据契约 · 卡牌设计定位](./cards/overview-contract.md#卡牌设计定位)

## 2. 卡牌数据契约 (cards/<id>.json，一型一文件，经 GET /api/cards 聚合)

> JSON 字段与示例：`id` / `name` / `rarity` / `desc` / `effects[]` / `maxStacks`；Schema 唯一权威 = `js/tank_cards.js` 的 `validateCard`。
> **约束**：`tags` 字段已于 2026-10-20 #16 整体下线（196 张卡均无此字段，`CARD_TAGS` 不再导出、校验已移除）。

**详见**：[卡牌定位与数据契约 · 卡牌数据契约](./cards/overview-contract.md#卡牌数据契约)

## 3. 七大效果类型 (type 决定 params)

> **7 类**（唯一口径 `CARD_EFFECT_TYPES`）：modifier / ammo / ability / passive / drone / economy / weapon。
> 各类型参数结构、`replaceAmmo` 两层校验、参数硬限（装填 ≥1.0s / 极速 ≤150km/h）、`ABILITY_KEYS` 8 键、`ECONOMY_FIELDS` 3 项——都在主题页。

**详见**：[七类效果类型](./cards/effect-types.md)

## 4. 稀有度分层与流派

> **五档**（common / rare / epic / legendary / mythic）+ 抽取权重（50 / 30 / 15 / 4.5 / 0.5）+ 卡池分布快照（196 张，2026-10-20 实测）。
> **`CARD_TAGS` 流派标签已于 2026-10-20 #16 整体下线**（含卡牌 `tags` 字段、校验、导出、UI 三处）。

**详见**：[稀有度、权重与验证工具链](./cards/rarity-tools.md)

## 5. 堆叠与验证工具链

> `maxStacks` 与 `cardStackCount` 的截断语义；`validate-content` / `audit-content --strict` / `test-card-effects` 三脚本；P-42 四维审计（其中 ①/②/④ 依赖 tags，已随 #16 降级）。

**详见**：[稀有度、权重与验证工具链 · 堆叠与验证](./cards/rarity-tools.md#堆叠与验证)

## 6. 被动卡接线结论（2026-08-26，#A14/#A15）

> **`PASSIVE_KEYS` 现行 6 键**（唯一口径）：`reactive_armor` / `angle_boost` / `overmatch` / `spall_liner` / `wet_ammo_rack` / `crew_liner`。
> 另含：`passiveValues` 聚合入口、overmatch 口径碾压、全线高爆、防崩落内衬、**`#W-H` 防御方减伤通道**（`wet_ammo_rack`/`crew_liner`，`defense = max(0, 1 − maxValue)`，if/else 单通道**不叠乘**）。

**详见**：[被动卡与模块暴击](./cards/passive-crit.md)

## 7. 模块暴击修饰器接线结论（#A16）

> `fireControlCrit` / `loaderAmmoCrit` 加法叠加，**最大 ≤25%**、修正后单区概率 **≤90%**；在 `moduleFromHit` 完整应用。

**详见**：[被动卡与模块暴击 · 模块暴击修饰器](./cards/passive-crit.md#模块暴击修饰器)

## 8. 卡牌设计定稿：坦克基础数值 / 机制 / 技能三板块（2026-09-13 会话裁定）

> 三板块设计契约：**§8.1** 设计裁定（不做百分比减伤 / 空袭走 artillery 升级形态 / 副武器卡直接安装）；**§8.2** 基础数值梯度（血量/装甲/射速/精度/三扩/马力 × 四档稀有度）；**§8.3** 机制卡与武器 effect；**§8.4** 技能卡梯度；**§8.5** 技能卡总表。
> **本节拆为两页**：基础数值与技能卡 → `design-blocks.md`；机制卡与武器 effect（原 §8.3）→ `weapon-cards.md`。

**详见**：[三板块设计定稿](./cards/design-blocks.md) · [机制卡与武器 effect](./cards/weapon-cards.md)

### 8.1 设计裁定（用户拍板）

> 三条裁定：**不做百分比减伤**（防御成长只走装甲/跳弹/内衬）、**空袭不新增独立键**（走 `artillery` 升级形态）、**副武器卡牌直接安装**（不做局前 Loadout 双通道）。

**详见**：[三板块设计定稿 · 设计裁定](./cards/design-blocks.md#设计裁定用户拍板)

### 8.2 坦克基础数值卡梯度（modifier 通道，无新机制）

> 六维度 × 四档稀有度的数值梯度表（maxHp / 装甲 add / reload / aimSpeed / 三扩 / enginePower），全部走 `addModifier` scope='run'；weight 联动为 trade-off 杠杆。

**详见**：[三板块设计定稿 · 坦克基础数值卡梯度](./cards/design-blocks.md#坦克基础数值卡梯度)

### 8.3 机制卡定案 ✅ Schema 已实现 + 阶段七运行时与卡牌已落地（2026-09-13）

> 主武器双管（流水线装填 + 交替装填 mythic）、autocannon 热量机制、可部署物数量卡、曲射沿革、弹药升级、**副武器安装/升级两支**（含 `howitzer` 模式载体）、武器升级卡数值梯度与全覆盖（#U39 的 4 处通道断点 + 20 张补齐清单）、**Boss 随机武备**（`RULES.boss.armament`）、APS。

**详见**：[机制卡与武器 effect](./cards/weapon-cards.md)

### 8.4 技能卡定案（锚定现有 RULES.abilities 参数）

> 六类技能的升级梯度表（artillery / 空袭定点 / 空袭地毯 / drone / deploy_cover / aps）；`params` 覆写通道；**`requiresAbility` 持有资格**（5 张已标记升级卡 / 6 张不得标记的获取途径卡 + 「每个 ability key 至少一张未标记卡」不变量）。

**详见**：[三板块设计定稿 · 技能卡定案](./cards/design-blocks.md#技能卡定案)

### 8.5 技能卡总表（#A28 分类：base=可独立获取 / upgrade=需先持有同 key）

> 11 张技能卡的总表（卡 id / key / base|upgrade / requiresAbility）；innate 强化卡的卡面语义（#U21）与 innate 键豁免 #U18 去重（#U40）。

**详见**：[三板块设计定稿 · 技能卡总表](./cards/design-blocks.md#技能卡总表)

## 9. 装备优先抽卡（2026-09-14 用户定案）

> 动机（不能只给升级卡）+ `drawCardChoices` 入口与 `owned` 结构 + **资格过滤五条**（装备资格 / maxStacks 与 #U44 安装类豁免 / 已持技能去重 / 属性达限 / 取最优被动）+ **三类保底**（装备 / 弹种 0.18 与 0.55ⁿ 衰减 / Boss 追加轮必保底）+ **Boss 轮加权**（`guaranteeRarity` 1 传奇 + 2 史诗、`rarityWeights` `20/32/30/15/3`）。

**详见**：[抽卡规则与保底](./cards/draw-rules.md)

## 10. 升级覆盖面（2026-10-10 #O3 对账，现行口径）

> `fireControlCrit` / `loaderAmmoCrit` 三通道全空缺的死升级通道，已补齐三条：卡牌白名单（+3 键 +3 卡）/ 局外永久商店（+7 项）/ 局内商店（+3 项，总数 12→15）。

**详见**：[升级覆盖面](./cards/upgrade-coverage.md)

## 11. 局内卡牌查看器（2026-10-17 #U23，现行口径）

> `C` 键面板：与 Tab / 开发者面板互斥；分类维度现为**稀有度 / 全部两选一**（原「标签」维度已随 #16 下线）；数据源 `player.cardEffects` + `cardPool`；稀有度中文标签单常量 `CARD_RARITY_LABELS`。

**详见**：[局内卡牌查看器](./cards/card-viewer.md)

---

> **维护**：新增章节仍按 `§N+1` 追加（编号只增不改）——本页加「标题 + 摘要 + 详见」，正文写进 `docs/specs/cards/` 对应主题页。改现行值只改主题页；本页摘要**不写具体数值**（只写「见 X」）。
