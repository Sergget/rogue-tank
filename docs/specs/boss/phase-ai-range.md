# 阶段 AI 与机炮射程

> **摘要**：`stages[].ai.params` 三个距离键的消费口径、`aiState` 死状态，以及 Boss 机炮射程 900→1200。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/boss.md` §10、§10.1、§10.2、§10.3（2026-10-21 拆分）
> **相关**：[行为与弱点](./behavior.md) · [数值倍率与难度叠加](./scaling.md) · [兼容索引](../boss.md)

## 三键消费（现行）

（原 §10、§10.1，#W13，2026-10-20）

**背景**：`bosses/*.json` 的 `stages[].ai.params` 里 `anchorRange`（3/5 份）与 `targetRange`（4 份 charge 阶段）此前**零消费**——数据写了但 `js/tank_ai.js` 从不读取，属"死配置"。2026-10-20 已接通，**唯一实现口径 `js/tank_ai.js`**（约 `:564-640`）。

**三键各只在自己分支读一次、零交叉**：

| 键 | 消费分支 | 语义 |
|---|---|---|
| `anchorRange` | **仅 `hold`**（`_passiveDefend`） | 驻守距离：`> 0` → 玩家超出 `anchorRange×1.2` 时 0.4 速前压（#S3 反站桩），进入后原地防御；**`= 0` → 原地固守、永不前压**；缺省（`undefined`/非有限）→ 回落 `allyEngageRange`(460)，保持 #S3 旧行为 |
| `targetRange` | **仅 `charge`** | 压到该距离内即松开油门：`= 0` → 全速贴脸（旧行为等价）；`> 0` → 进入后停止前压 |
| `keepDist` | **仅 `skirmish`** | 风筝距离：过近倒车（`move=-1`）/ 超过 `keepDist×1.25` 时 0.7 速接近 / 之间停。缺省 **640** |

### ⚠️ `anchorRange = 0` 的语义反转修正

**首版实现的坑，勿回退**：首版实现把 `0` 当"假值"回落缺省值 ⇒ 让 `boss_siege_fort`（「要塞炮台」、设计意图是**固守**）变成**贴脸冲锋**，与 Boss 定位完全相反。现行明确 **`0` = 原地固守**（用 `Number.isFinite` 判存在性，不用真值判断）。

### `_passiveDefend` 不被 `skirmish` 共用

该函数只有两个调用点——Boss `hold` 与友军据点消极防御；**函数体不读 `params`**（`anchorRange` 由调用侧的 Boss 分支单独传入/处理），故不存在 `skirmish` 误吃 `anchorRange` 的路径。

### 实测区分度表

（2026-10-20，5 份 `bosses/*.json` 解析结果）

| Boss | `anchorRange` |
|---|---|
| `boss_commander` | 300 |
| `boss_twin_track` | 350 |
| `boss_siege_fort` | **0**（原地固守） |
| 未声明者（缺省） | 460（`allyEngageRange`） |

## `t.aiState = 'chase'` 死状态已删

（原 §10.2，#W13-c，2026-10-20）

`js/tank_boss.js`（约 `:273`）原在 `makeBossEntity` 里写 `t.aiState = 'chase'`——该值是**唯一写点**且**首帧即被 `js/tank_ai.js` 覆盖**，且 `'chase'` **不在 `aiState` 词表内**（现行词表 `patrol/suspicious/react/search/...`）⇒ 纯噪声，会误导调试（读 `t.aiState` 以为 AI 处于"追击"态，实际并非如此）。

**已删除该赋值**；Boss「出生即接战」语义由同处的 `t.aiEngaged = true` 承担，不需要 `aiState` 参与。

## Boss 机炮射程 900 → 1200

（原 §10.3，#W-J，**已于 2026-10-20 实施**）

**⚠️ 沿革（被推翻的旧结论不静默删除）**：本项在 `docs/PLAN.md` §6.2 与 `docs/archive/2026-10.md` 里曾被记为「**不做**」。2026-10-20 用户要求「全部修完」后**改为实施**。旧记录保留在归档中，仅追加实施注记（见 `docs/archive/2026-10.md` 对应条目）。

**实现**（两个改动点）：

1. `RULES.boss.tuning.autocannonRange = 1200`（`js/tank_rules.js`，新增字段）；
2. `js/tank_boss.js` 新增导出 `applyBossWeaponTuning(t)`：当 `t.weapons.primary.type === 'autocannon'` 时写 `t.weapons.primary.stats.maxRange = RULES.boss.tuning.autocannonRange`。

**调用契约（关键，勿错序）**：**必须在 `assignBossArmament(bossEntity, bossNumber)` 之后调用**——Boss 主武器由 `pickBossArmament` 随机分配，`assignBossArmament` 会**重置** `stats`，先调会被覆盖。接线位置：`tank_battle.html` 的 `assignBossArmament` 之后一行。

**为什么不能直接改 `js/tank_weapons.js:33` 的全局 900**：那是**玩家机炮**的射程，会连带改玩家。Boss 加成必须在 Boss 实体上单独施加。

**实测**：autocannon 900 → **1200**；非 autocannon（railgun/double_barrel/clip/standard）保持 **900** 不受影响；**幂等**（重复调用结果不变）。回归：`scripts/test-boss.js`。

> `autocannonRange` 的数值本身列在 [数值倍率 · tuning 表](./scaling.md#rulesbosstuning-现行真值)（唯一口径），本页只讲调用契约。

## 相关页面
- [行为与弱点](./behavior.md) — 三模式在 `_passiveDefend` / `aiDecideEnemy` 里的上下文
- [数值倍率与难度叠加](./scaling.md) — `tuning` 全表（含 `autocannonRange` 的值）
- [召唤与小兵](./summons.md) — Boss 召唤物的机动锚定（同属 #J 批）
