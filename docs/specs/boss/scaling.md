# 数值倍率与难度叠加

> **摘要**：`RULES.boss.tuning` 的全键真值（唯一口径）、hpMul 沿革、难度叠加与出生即交战。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/boss.md` §5 第 2~4 条（2026-10-21 拆分）
> **相关**：[运行时机制](./runtime.md) · [阶段 AI 与机炮射程](./phase-ai-range.md) · [战斗规范 · 敌人强度与难度](../combat/enemy-scaling.md)

## tuning 的施加方式

（原 §5 第 2 条首段）

`bosses/*.json` 的 `tuning` 块（缺省回退 `RULES.boss.tuning`），以 `addModifier source:'boss-base' scope:'run'` 叠乘 `maxHp` / `maxSpeed` / `turnRate` / `turretTurnRate` / `shellSpeed` / `reload` / `damage`。

> **本页承载原 §5 的四段主题**：几何放大（原 **5.1**，见 [运行时机制](./runtime.md#几何放大)）/ 数值调参 `RULES.boss.tuning` **唯一口径**（原 **5.2**）/ 难度叠加（原 **5.3**）/ 出生即交战（原 **5.4**）。

## RULES.boss.tuning 现行真值

**全卷唯一的 tuning 数值口径**；`node -e` 实测 2026-10-21。

| 键 | 值 | 语义 |
|---|---|---|
| `hpMul` | **9** | 血量倍率（沿革：×8 → ×9，见下） |
| `moveMul` | 0.5 | 极速倍率（降机动） |
| `turnMul` | 0.6 | 转向倍率（降机动） |
| `turretTurnMul` | 0.6 | 炮塔转速倍率（降机动） |
| `shellMul` | 0.8 | 弹速倍率 |
| `fireRateMul` | 0.6 | 装填倍率（提射速：`reload×0.6`） |
| `dmgMul` | 1.5 | 伤害倍率 |
| `penMul` | 1.4 | 穿深倍率 |
| `engageDist` | 99999 | 出生即交战距离（见下「出生即交战」） |
| `autocannonRange` | 1200 | Boss 机炮射程（2026-10-20 #W-J 新增；调用契约见 [阶段 AI 与机炮射程](./phase-ai-range.md#boss-机炮射程-900-1200)） |

> **其余页只描述语义、不重复罗列数字**——例如机炮射程的调用顺序见 [阶段 AI 与机炮射程](./phase-ai-range.md)，本表是值的唯一家。

## 血量沿革

（2026-10-01 用户裁定「提高敌人（包括 boss）血量」）

`tuning.hpMul` **×8 → ×9**（+12.5%）——5 份 `bosses/*.json` 均自带 `tuning.hpMul` 覆盖 `RULES.boss.tuning` 缺省，本次**两侧同步**修改。

**Boss 血量公式**：出战配置 `maxHp` × `hpMul` × `entityMults.maxHp(diff)`（Boss 经 `applyPlayerCap=false` 跳过穿深/速度封顶，但**吃血量难度乘子**）⇒ 与同轮 `entityMults.maxHp` 上限上调（[战斗规范 · 敌人强度](../combat/enemy-scaling.md)）叠加后，Boss 总血量约 **+29%~+36%**（探针实测 index4 5.91 → 7.88 倍），**高于普通敌军同幅度的 +15%~+20%**。手感偏肉时可回调本键。

## 难度叠加

（原 §5 第 3 条）

Boss 生成后经 `applyDifficultyMults(bossEntity, currentNode.entityMults, applyPlayerCap=false)` 叠加同级难度基准（并重设满血），再被 tuning 拉离基准，最终表现为传统 Boss（高血/高伤/高射速、低机动）。

## 出生即交战与防风筝

（原 §5 第 4 条）

`makeBossEntity` 出生即设置 `t.aiTriggerDist = RULES.boss.tuning.engageDist`（**99999**，见上表）+ `t.aiEngaged = true`。

`aiDecideEnemy` 对 Boss 建立快路径：跳过 patrol 早退判定，在非 hold/skirmish 阶段始终以 `move = 1` 朝玩家或最后记忆点主动推进并锁定开火，弱化近距倒车，从机制上根除被玩家远距离无限放风筝。

> **⚠️ 沿革（2026-10-20 #W13-c）**：本段原文还写有 `+ t.aiState = 'chase'`——该赋值**已删除**（唯一写点、首帧即被 `tank_ai.js` 覆盖，且 `'chase'` 不在 `aiState` 词表内）。现行「出生即接战」只由 `t.aiEngaged = true` 承担，详见 [阶段 AI 与机炮射程 · aiState](./phase-ai-range.md#taistate-chase-死状态已删)。

## 相关页面
- [运行时机制](./runtime.md) — 阶段 modifiers 与 tuning 的叠加顺序
- [阶段 AI 与机炮射程](./phase-ai-range.md) — `engageDist` 与 `autocannonRange` 的消费方
- [战斗规范 · 敌人强度与难度](../combat/enemy-scaling.md) — `entityMults.maxHp` 与 `difficultyCapMuls`
