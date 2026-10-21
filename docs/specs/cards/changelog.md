# 沿革与已作废机制（cards）

> **摘要**：本卷所有被取代或已删除的字段/键/维度都在这一页，现行口径不在此页。
> **适用版本**：历史（截至 2026-10-21）
> **源自**：`docs/specs/cards.md` §3 第 4 条（旧 passive 键列表）、§4（`CARD_TAGS` 删除段）、§5（P-42 tag 维度）、§3 第 6 条（`startScore`）（2026-10-21 拆分）
> **相关**：[卷首页](./index.md) · [七类效果类型](./effect-types.md) · [兼容索引](../cards.md)

## 怎么用

- 这里只做**追溯**：每条都保留原文与「已被 X 取代 / 已删除」注记，**不要**据此写新代码。
- 要找现行口径 → 回 [卷首页](./index.md) 的主题表。
- 本页不在 `§0` 主题索引的「现行口径」列出现，只出现在「来源沿革」列。

## 目录
- [tags 字段下线（2026-10-20 #16）](#tags-字段下线2026-10-20-16)
- [旧 passive 键列表（含 commander_sight）](#旧-passive-键列表含-commander_sight)
- [P-42 的 tag 审计维度](#p-42-的-tag-审计维度)
- [economy 的 startScore](#economy-的-startscore)
- [已从本卷删除、仅留索引的机制](#已从本卷删除仅留索引的机制)

---

## tags 字段下线（2026-10-20 #16）

**用户原话**：「卡牌的角色设定没有意义，删除相关的字段」。

删除范围：

1. `cards/*.json` 全部 `tags` 字段（实删后 **0/196 张**仍有该字段）；
2. `js/tank_cards.js` 的 `CARD_TAGS` 常量与导出（现 `require` 后为 `undefined`）；
3. `validateCard` 的 tags 校验（带任意 tags 的卡现返回 `[]` 不报错，见 [卡牌数据契约](./overview-contract.md#卡牌数据契约) 示例下的沿革注记）；
4. UI 侧：奖励面板的 tags 显示、`tank_devpanel.js` 的 tags 搜索维度、`tools/content_designer.html` 的 tags 勾选框编辑器（该页原 `for(const t of CARD_TAGS)` 在枚举消失后会**打开即抛 TypeError**——它不在 `check-html.js` 五页扫描范围内故 `npm run check` 不红，属工具链静默崩溃，细则归 [编辑器规范 · content_designer](../editor/appearance-aimspeed.md#toolscontent_designerhtml-的-tags-编辑器移除)）。

**沿革（不静默删除）**：该字段在 2026-10-20 之前用于「`drawCardChoices` 构筑导向抽卡」与卡牌查看器的标签分组。**抽卡逻辑不依赖 tags**（按稀有度权重 + 装备/升级保底），故下线对抽卡无行为影响；查看器分类维度改为**仅稀有度**。

**回归护栏**：`scripts/test-cards.js` 以**负向断言**锁死「`CARD_TAGS === undefined`」与「带 tags 不报错」，防止枚举被悄悄加回而数据侧已无字段（负向断言是字段下线类改动的根治手段）。

## 旧 passive 键列表（含 commander_sight）

**原文（§3 第 4 条的初始写法，照录以供追溯）**：

```
4. **passive**：机制性被动 {key:'reactive_armor'|'angle_boost'|'overmatch'|'spall_liner'|'commander_sight', value?}
```

**现状**：

- **`commander_sight` 已于 2026-09-30 #J3 随视野系统整体退役删除**（原消费点为 battle 视野半径 `entityHiddenByVision` / `visionRadiusEff`，2026-09-19 #D2 接线前为死效果）；
- `wet_ammo_rack` / `crew_liner` 两键于 2026-10-20 #W-H 新增。
- **现行键集合（6 键）见 [被动卡与模块暴击](./passive-crit.md#passive_keys-现行键集合)**。

> **旧列表照录如上，勿当作现行键集合。**

## P-42 的 tag 审计维度

**原文（§5，2026-08-28）**：`audit-content.js` 新增四个报告型维度——① 流派×稀有度覆盖率；② 流派→效果类型构成；③ 同稀有度强度曲线；④ **tag 组合矩阵** + `heat_*`/`he_*`/`demo_*` 定点交叉对比表。

**现状（2026-10-20 #16）**：上述 ①/②/④ 三个维度依赖卡牌 `tags` 字段，该字段下线后**已从 audit 输出中降级**——`scripts/audit-content.js` 现从 `cards/*.json` 动态收集 tags，**全部无 tags 时只输出一行「已下线」说明**（不再产空表）；仅 ③ 强度曲线与定点交叉对比仍有效。

> 现行审计维度与告警状态见 [稀有度、权重与验证工具链 · P-42 扩展审计维度](./rarity-tools.md#p-42-扩展审计维度)。

## economy 的 startScore

**原文（§3 第 6 条的初始字段枚举，照录以供追溯）**：

```
6. **economy**：{field:'scoreMul'|'shopDiscount'|'startScore'|'reviveCount', value}
```

**现状（2026-10-20 #W15）**：**`startScore` 已删除**——该字段历史上写 `runStartScore` 但**全库零消费**（无任何读取方），属"预留但永不接线"的死配置 ⇒ 从 `ECONOMY_FIELDS` 白名单与 `removeRunModifiers` 的 `runStartScore` 清零中一并移除（归口 `js/tank_model.js`）。若将来要做「开局送分」类卡，需重新走白名单登记 + 消费方接线，不得只加字段。

> **现行 3 项（`scoreMul` / `shopDiscount` / `reviveCount`）见 [七类效果类型 · economy](./effect-types.md#economy)。**

## 已从本卷删除、仅留索引的机制

| 机制 | 删除时间 / 批次 | 现行归口 |
|---|---|---|
| `tags` 字段 + `CARD_TAGS` 枚举 + tags 校验 + UI 三维度 | 2026-10-20 #16 | 本页「tags 字段下线」段 |
| `commander_sight` passive 键（车长潜望镜 / 车长观瞄镜两张卡） | 2026-09-30 #J3 | [战斗规范 · 视野与镜头](../combat/camera-vision.md)（视野系统退役） |
| `recon` / `track_repair` 能力键 + 5 张对应卡 | 2026-09-23 A 档 | [七类效果类型 · ability](./effect-types.md#ability) |
| `super_fire_control` / `super_speed` 能力键 | 2026-10-20 #W9 | [七类效果类型 · ability](./effect-types.md#ability) |
| `startScore` economy 字段 | 2026-10-20 #W15 | [七类效果类型 · economy](./effect-types.md#economy) |
| `ability_smoke_dense` 卡（烟幕整链） | 2026-09-15 W2 | [三板块设计定稿 · params 覆写通道](./design-blocks.md#params-覆写通道) |
| `weapon_primary_howitzer` 主武器卡（主武器曲射机制移除） | 2026-09-15 用户裁定 | [机制卡与武器 effect · 曲射](./weapon-cards.md#曲射)（现由副武器 `howitzer` 模式承担） |
| `hec` 弹种 + `hec_curvature_shell.json` | 2026-09-14 定案 | [机制卡与武器 effect · 曲射](./weapon-cards.md#曲射) |

## 相关页面
- [卷首页](./index.md) — 现行口径的主题表
- [七类效果类型](./effect-types.md) — `passive` / `economy` / `ability` 的现行为
- [被动卡与模块暴击](./passive-crit.md) — `PASSIVE_KEYS` 现行 6 键
