# Boss 定位与数据契约

> **摘要**：Boss 的出现周期、设计范式，以及 `bosses/<id>.json` 的字段与 schema 权威。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/boss.md` §1、§2（2026-10-21 拆分）
> **相关**：[运行时机制](./runtime.md) · [行为与弱点](./behavior.md) · [兼容索引](../boss.md)

## Boss 战设计定位

（原 §1）

- **周期首领机制**：每第 `RULES.nodeMap.bossInterval`（默认 **5**）个节点为 Boss 关卡（由 `js/tank_map.js` 的 `isBossNodeIndex` 周期标记并在进入战斗时懒指定定义；Boss 战清空常规敌人，不混编杂兵）。
- **设计范式**：**FTL 多阶段 + Into the Breach 弱点机制**——阶段切换制造节奏变化，弱点部位制造瞄准博弈。

## 数据契约

（原 §2）

`validateBoss` 校验；`bossStageFor` 按 hp 比例取当前阶段：

```json
{
  "id": "...",
  "name": "...",
  "desc": "...",
  "tankId": "...",          // 底盘 tank JSON
  "stages": [
    { "hpThreshold": 1.0, "modifiers": [...], "ai": { "mode": "hold", "params": {} }, ... },
    { "hpThreshold": 0.6, "modifiers": [...] },
    { "hpThreshold": 0.25, "modifiers": [...] }
  ],
  "summons": [ { "tankId": "...", "count": 2 } ],
  "loot": { "score": 500, "cards": 2, "cardRarity": "rare" }
}
```

**当前池：5 个 Boss**（均 3 阶段、掉落齐全，`audit --strict` 全绿）。

> **校验工具链**：`validateBoss` 是 schema 唯一权威；`check-html` 覆盖脚本语法门禁，`test-boss.js` 覆盖行为断言——改动 `bosses/*.json` 后应跑 `node scripts/validate-content.js` 与 `node scripts/test-boss.js`。

### 字段速查

| 字段 | 说明 | 细节归口 |
|---|---|---|
| `tankId` | 底盘坦克 JSON（几何/装甲来自 `tanks/`） | 缩放见 [运行时机制 · 几何放大](./runtime.md#几何放大) |
| `stages[]` | 阶段数组：`hpThreshold` + `modifiers[]` + 可选 `ai{mode,params}` | 阶段切换见 [运行时机制](./runtime.md#运行时四件套)；三模式见 [行为与弱点](./behavior.md#阶段-ai-三模式) |
| `summons[]` | 波次随从：`tankId` / `count` / 可选 `hpFrom` | 见 [召唤与小兵](./summons.md) |
| `loot` | `score` / `cards` / `cardRarity` | 见 [行为与弱点 · 战利品链](./behavior.md#boss-战利品奖励链) |
| （`tuning` 块，可选） | 覆盖 `RULES.boss.tuning` 缺省 | 见 [数值倍率 · tuning 表](./scaling.md#rulesbosstuning-现行真值) |

> **⚠️ 不要在 `bosses/*.json` 里塞 `weapons`**——`validateBoss` 不认，会被静默忽略。Boss 主/副武器由 `pickBossArmament` 随机分配（见 [行为与弱点 · 随机武备](./behavior.md#boss-随机武备)）。

## 相关页面
- [运行时机制](./runtime.md) — `makeBossEntity` / `applyBossStage` / `updateBossStage`
- [行为与弱点](./behavior.md) — `stages[].ai` 与 `summons` 的运行语义
- [数值倍率与难度叠加](./scaling.md) — `tuning` 块如何叠乘
