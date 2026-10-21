# 卡牌定位与数据契约

> **摘要**：卡牌是节点通关后的三选一改装；本页给出 `cards/<id>.json` 的字段与 schema 权威。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/cards.md` §1、§2（2026-10-21 拆分）
> **相关**：[七类效果类型](./effect-types.md) · [三板块设计定稿](./design-blocks.md) · [兼容索引](../cards.md)

## 卡牌设计定位

（原 §1）

- **局内改装强化**：卡牌是节点通关后三选一的坦克改装/战术强化，不是手牌指令牌组。
- **拟真坦克调性**：效果围绕装甲/穿深/装填/机动/散布/视野/弹种/乘员展开，贴合"摆角度找跳弹、找掩体抢位置"的博弈立意（参照 Slay the Spire 稀有度分层+流派构筑，落到坦克改装语境）。

## 卡牌数据契约

（原 §2）

Schema 唯一权威 = `js/tank_cards.js` 的 `validateCard`。一型一文件，经 `GET /api/cards` 聚合：

```json
{
  "id": "spaced_armor",
  "name": "间隙装甲",
  "rarity": "common",
  "desc": "车体正面附加间隙装甲，等效厚度 +12mm。",
  "effects": [
    { "type": "modifier", "stat": "armor.hull.front", "mode": "add", "value": 12 }
  ],
  "maxStacks": 3
}
```

> **⚠️ `tags` 字段已下线（2026-10-20 #16，用户裁定「卡牌的角色设定没有意义，删除相关的字段」）**：上例**不含** `tags`。历史上该字段写作 `"tags": ["重甲"]`，现 196 张卡全部无此字段、`CARD_TAGS` 常量不再导出、`validateCard` 不再校验它（带 legacy `tags` 的卡也不报错，只是被忽略）。删除范围与沿革见 [沿革与已作废](./changelog.md#tags-字段下线2026-10-20-16)。

## 字段速查

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 字符串，卡池主键 |
| `name` | ✅ | 显示名 |
| `rarity` | ✅ | ∈ `CARD_RARITIES`（五档，见 [稀有度](./rarity-tools.md#稀有度五档)） |
| `desc` | — | 描述；支持 `{value}` / `{pct}` / `{ov:key}` 占位符求值（见 [查看器](./card-viewer.md)） |
| `effects` | ✅ | **非空数组**，每项 `type` ∈ `CARD_EFFECT_TYPES`（七类，见 [效果类型](./effect-types.md)） |
| `maxStacks` | — | 正整数；同卡最大持有数（堆叠规则见 [验证工具链](./rarity-tools.md#堆叠与验证)） |

> 校验细节（非法 rarity / 空 effects / maxStacks 非正整数）由 `validateCard` 负责，回归见 `scripts/test-cards.js`。

## 相关页面
- [七类效果类型](./effect-types.md) — `effects[]` 里每一项怎么写
- [稀有度、权重与验证工具链](./rarity-tools.md) — `rarity` 的取值与卡池分布
- [三板块设计定稿](./design-blocks.md) — 卡面数值梯度的设计来源
