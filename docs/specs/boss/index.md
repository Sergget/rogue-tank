# Boss 战与首领机制规范 (Boss Spec)

> **摘要**：本卷是 Boss 数据契约、行为、激光、召唤、数值倍率与机炮射程的现行口径权威，共 8 个主题页（**Roguelike** 首领战的完整机制链）。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/boss.md` 全卷（含 §0 主题索引；2026-10-21 wiki 化拆分）
> **相关**：[specs 总目录](../README.md) · [风格规范](../../WIKI-STYLE.md) · [兼容索引](../boss.md)

## 从这里开始

- 本卷管：**一场 Boss 战**的全部机制——数据契约（`bosses/*.json`）、运行时三件套、阶段 AI 三模式、弱点、激光、召唤、随机技能/武备、数值倍率与机炮射程。
- 本卷不管：**通用 AI 决策与交战结构** → [战斗规范 · 敌方 AI](../combat/enemy-ai.md)；**Boss 激光的绘制与命中截断实现** → [战斗规范 · Boss 战斗](../combat/boss-combat.md)；**Boss 随机武备的卡池一侧** → [卡牌规范 · 机制卡与武器 effect](../cards/weapon-cards.md#boss-随机武备)。
- 所有数值的最终真值在 `js/tank_rules.js`（`RULES.boss`）与 `bosses/*.json`；本卷写「当前值 + 约束 + 易错点」。
- 手上有一个 `§N` 旧引用（如 `boss.md §4`）→ 见 [兼容索引](../boss.md)，编号一一对应。

## 主题页

| 页面 | 一句话 | 覆盖原节 |
|---|---|---|
| [定位与数据契约](./overview-contract.md) | Boss 出现周期、设计范式、`bosses/*.json` 的字段与 schema | §1、§2 |
| [运行时机制](./runtime.md) | 阶段切换、随从、掉落、AI 复用的四条骨架 | §3 |
| [行为与弱点](./behavior.md) | 阶段 AI 三模式、炮击压制、弱点命中、随机技能、随机武备与简报、战利品链 | §4 |
| [数值倍率与难度叠加](./scaling.md) | `RULES.boss.tuning` **唯一口径表**、hpMul 沿革、难度叠加、出生即交战 | §5 |
| [蓄能激光](./laser.md) | 激光参数表（唯一口径）、事件流、车体冻结与炮塔定速、掩体阻断 | §6、§7.1、§8.1、§8.2 |
| [召唤与小兵](./summons.md) | 分波次召唤、召唤时间兜底、兜底池、小兵机动锚定、履带自修 | §6 首条、§7.2、§9 |
| [阶段 AI 与机炮射程](./phase-ai-range.md) | `anchorRange`/`targetRange`/`keepDist` 三键消费、`aiState` 死状态、机炮 900→1200 | §10、§10.1~§10.3 |
| [电磁炮的炮线与预警](./railgun.md) | Boss 随机到 railgun 时的蓄能/红色指示线/掩体截断/指向期静音/开火音效参数与事件流 | 2026-10-22 新建 · 2026-10-26 改口径 |
| [沿革与已作废](./changelog.md) | timed modifier 激光转速方案、建筑密度归口、已删除的 `aiState` | §7.1、§8.4、§5 末条 |

## 常见入口

| 我想…… | 去哪 |
|---|---|
| 加一个新 Boss | [定位与数据契约](./overview-contract.md#数据契约) |
| 查 Boss 的各项数值倍率 | [数值倍率与难度叠加 · tuning 表](./scaling.md#rulesbosstuning-现行真值) |
| 调 Boss 阶段行为（驻守/冲锋/风筝） | [阶段 AI 与机炮射程 · 三键消费](./phase-ai-range.md#三键消费现行) |
| 查激光的参数 | [蓄能激光 · 参数表](./laser.md#蓄能激光参数表唯一口径) |
| 查召唤波次与小兵 | [召唤与小兵](./summons.md) |
| 查机炮射程 1200 怎么生效 | [阶段 AI 与机炮射程 · 机炮射程](./phase-ai-range.md#boss-机炮射程-900-1200) |
| 查历史/已作废机制 | [沿革与已作废](./changelog.md) |
| 我手上有个 `§N` 引用 | [兼容索引](../boss.md) |

## 相关页面
- [specs 总目录](../README.md) — 五卷入口与查法
- [战斗规范 · 敌方 AI](../combat/enemy-ai.md) — 通用 AI 决策与本卷的调用关系
- [战斗规范 · Boss 战斗](../combat/boss-combat.md) — 激光绘制、随机走位、召唤在战斗层的接法
- [卡牌规范](../cards/index.md) — Boss 随机武备的卡池与选择逻辑
