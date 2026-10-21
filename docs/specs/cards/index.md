# 卡牌与构筑系统规范（Cards & Build Spec）

> **摘要**：本卷是卡池、效果类型、稀有度、抽卡规则与卡牌查看器的现行口径权威，共 9 个主题页。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/cards.md` 全卷（含 §0 主题索引；2026-10-21 wiki 化拆分）
> **相关**：[specs 总目录](../README.md) · [风格规范](../../WIKI-STYLE.md) · [兼容索引](../cards.md)

## 从这里开始

- 本卷管：**一张卡从 JSON 到生效**的完整链路（schema → 七类效果 → 稀有度与权重 → 抽卡资格与保底 → 局内查看器），以及卡牌设计的三板块定稿与武器安装卡通道。
- 本卷不管：**弹种逐键数值与升级链** → [战斗规范 · 弹种系统](../combat/ammo-system.md#数值总表)；**装填/穿深等属性怎么算** → [战斗规范 · 武器与装填](../combat/weapons-reload.md)；**Boss 数据与血量倍率** → [Boss 规范](../boss/index.md)。
- 所有数值的最终真值在 `js/tank_cards.js`（`CARD_EFFECT_TYPES` / `CARD_RARITIES` / `PASSIVE_KEYS` / `ECONOMY_FIELDS` / `ABILITY_KEYS`）与 `cards/*.json`；本卷写「当前值 + 约束 + 易错点」。
- 手上有一个 `§N` 旧引用（如 `cards.md §8.3`）→ 见 [兼容索引](../cards.md)，编号一一对应。

## 主题页

| 页面 | 一句话 | 覆盖原节 |
|---|---|---|
| [卡牌定位与数据契约](./overview-contract.md) | 卡牌是什么、JSON 字段、schema 唯一权威 | §1、§2 |
| [七类效果类型](./effect-types.md) | modifier / ammo / ability / passive / drone / economy / weapon 各自的参数与约束 | §3 |
| [稀有度、权重与验证工具链](./rarity-tools.md) | 五档稀有度、抽取权重、卡池分布、堆叠与审计脚本 | §4、§5 |
| [被动卡与模块暴击](./passive-crit.md) | `PASSIVE_KEYS` 六键、overmatch/内衬、防御方减伤、`fireControlCrit` 类修饰器 | §6、§7 |
| [三板块设计定稿](./design-blocks.md) | 基础数值梯度、机制卡与武器 effect、技能卡梯度与总表 | §8、§8.1~§8.5 |
| [抽卡规则与保底](./draw-rules.md) | 装备优先、资格过滤五条、弹种/稀有度保底、Boss 轮加权 | §9 |
| [升级覆盖面](./upgrade-coverage.md) | 卡牌白名单 / 局外永久商店 / 局内商店三通道补齐 | §10 |
| [局内卡牌查看器](./card-viewer.md) | `C` 键面板、分类维度、数据源 | §11 |
| [沿革与已作废](./changelog.md) | `tags` 下线、`commander_sight` 删除、`startScore` 删除等历史 | §3.4 旧列表、§4.2 沿革、§5 tag 审计维度 |

## 常见入口

| 我想…… | 去哪 |
|---|---|
| 写一张新卡的 JSON | [卡牌定位与数据契约](./overview-contract.md#卡牌数据契约) |
| 查某类效果怎么写 | [七类效果类型](./effect-types.md) |
| 查 `PASSIVE_KEYS` 现在有哪几个键 | [被动卡与模块暴击 · PASSIVE_KEYS](./passive-crit.md#passive_keys-现行键集合) |
| 查稀有度权重 / 卡池分布 | [稀有度、权重与验证工具链](./rarity-tools.md) |
| 加一张武器安装卡 / 升级卡 | [机制卡与武器 effect](./weapon-cards.md) |
| 改抽卡资格或保底 | [抽卡规则与保底](./draw-rules.md) |
| 查历史/已作废机制 | [沿革与已作废](./changelog.md) |
| 我手上有个 `§N` 引用 | [兼容索引](../cards.md) |

## 相关页面
- [specs 总目录](../README.md) — 五卷入口与查法
- [战斗规范 · 弹种系统](../combat/ammo-system.md) — 弹种键与升级链（本卷只引用不复制）
- [战斗规范 · 武器与装填](../combat/weapons-reload.md) — 武器类型、规格通道、装填公式
- [Boss 规范](../boss/index.md) — Boss 随机武备的运行时一侧
