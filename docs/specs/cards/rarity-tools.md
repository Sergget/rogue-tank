# 稀有度、权重与验证工具链

> **摘要**：五档稀有度与抽取权重、卡池分布快照、堆叠规则与审计脚本入口。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/cards.md` §4、§5（2026-10-21 拆分）
> **相关**：[抽卡规则与保底](./draw-rules.md) · [卡牌定位与数据契约](./overview-contract.md) · [沿革与已作废](./changelog.md)

## 稀有度五档

（原 §4 第 1 条）

`CARD_RARITIES`（**2026-09-20 #E13 起五档**）：common / rare / epic / legendary / **mythic（神话）** —— 新增最高档，序号即强度序。

| 稀有度 | 抽取权重 |
|---|---|
| `common` | 50 |
| `rare` | 30 |
| `epic` | 15 |
| `legendary` | 4.5 |
| `mythic` | 0.5 |

- Boss 掉落白名单 `LOOT_RARITIES`（`js/tank_boss.js`）同步五档；HUD 标签新增「神话」。
- **Boss 轮的权重覆盖**见 [抽卡规则与保底 · Boss 轮加权](./draw-rules.md#boss-轮稀有度保底与非普通卡加权)（那里是唯一口径）。

## 卡池分布（带日期快照）

（原 §4 第 3~5 条）

**2026-10-22 `node scripts/audit-content.js` 实测**（第五批稀有度重排后）：**205 张卡**。

| 稀有度 | 张数 | 占比 | 权重期望占比 | 判定 |
|---|---|---|---|---|
| common | **97** | 47.3% | 48.8% | ✅ 达标（**common 已显著多于 rare**） |
| rare | **65** | 31.7% | 29.3% | ✅ 达标 |
| epic | **33** | 16.1% | 14.6% | ✅ 达标 |
| legendary | **9** | 4.4% | 4.4% | ✅ 达标 |
| mythic | **1** | 0.5% | 0.5% | ✅ 达标 |

> 目标值 = `总张数 × RARITY_WEIGHTS / 100`（50 / 30 / 15 / 4.5 / 0.5 归一化）。205 = 现有 196 − 删 1（`weapon_primary_sync_fire`）+ 新增 10。

### 2026-10-22 重排（修 ISSUES #Z4）

**问题**：重排前 common **59** < rare **77**，与抽取权重曲线（50/30/15/4.5/0.5）方向相反（**越稀有的档反而卡更多**）。rare 桶内 26 张是武器升级卡，「武器升级一律定 rare」是膨胀主因。

**执行规则（可复现）**：

1. `demo_*` 前缀的卡**全部降为 common**（教学/演示卡本就不该占 rare/epic）。
2. 纯 `modifier` 单效果、且 `mode==="mult" && value∈[0.90,1.10]` 或 `mode==="add" && |value|<=8` 的卡降 common（各系 II 级卡的合理归宿）。
3. `weapon.*.upgrade`：纯 DPS 增益保持 rare；机制型（`burstOnSalvo`/doubleTapEnabled`/altReload`/penMult` 比例/`maxRange`/overheatLock`/clipCycleSeconds`/mineField*`）保持 rare；混合通道（≥3 个 statOverrides）升 epic。
4. legendary 收敛到 9 张最高档（`aim_speed_4`、`bastion_armor`、`engine_power_4`、`hull_hp_boost_4`、`reactive_armor`、两个 artillery_strike、`ammo_upgrade_blast_he`、`ammo_upgrade_heavy_tandem_heat`）；其余 6 张降 epic。
5. mythic 保持 1 张：`weapon_primary_alt_reload` 降 epic 后由 `ability_aps`（主动防御系统）补位。

**同批收口**：`weapon_primary_sync_fire` 删除、`weapon_primary_alt_reload` 降 epic（详见 [机制卡与武器 effect](./weapon-cards.md#2026-10-22-第五批武器卡增删与收口)）。

**审计阈值对齐**：本页旧文写「偏差 <3% 视为统计波动」，而 `scripts/audit-content.js` 实际阈值曾是 **20%** 且默认不计失败 ⇒ 上述失衡长期未被拦截。现行：**偏差 >5% 即 warn，`--strict` 下 exit 1**（与本页口径一致）。

**沿革（不静默删除）**：2026-10-10 #O3 时 169 张；2026-10-18 #U39 新增 20 张武器卡达 191（`DEVELOPMENT.md` §4.99）；2026-10-19 #U40 复核 191；2026-10-20 达 **196**；2026-10-22 达 **205**。

**效果类型分布（效果数，2026-09-23 实测）**：modifier 128 / ammo 32 / weapon 17 / **ability 12** / passive 8 / economy 5 / drone 2（合计 204）—— 与 `CARD_EFFECT_TYPES` 的 **7 类** 一一对应。其中 `ability` 由 17 降为 12 即 5 张死效果卡摘除的结果。

> 最新数字以 `node scripts/audit-content.js` 输出为准（上表为带日期的快照，卡池随批次增长会过期）。

## 堆叠与验证

（原 §5）

- **`maxStacks`**：同卡最大持有数，`cardStackCount` 计数，选择阶段硬性截断。安装类卡（weapon install / ability 基础卡）的重复资格另有动态判定，见 [抽卡规则 · 资格过滤](./draw-rules.md#资格过滤五条现行)。
- **`validate-content.js`**：逐卡 schema 校验。
- **`audit-content.js --strict`**：稀有度/流派/效果分布常态化审计。**现行阈值：偏差 >5% 即 warn，`--strict` 下 exit 1**（2026-10-22 与实现对齐；旧实现阈值 20% 且默认不计失败）。
- **`test-card-effects.js`**：442 断言全卡池全链路执行验证。

### P-42 扩展审计维度

（2026-08-28，`audit-content.js`）

新增四个报告型维度：

1. **流派×稀有度覆盖率**；
2. **流派→效果类型构成**；
3. **同稀有度强度曲线**（`multDev = Σ|mult值−1|`，仅统计 mult 效果，passive/ability/economy/add 单独列出以避量纲混淆；含离群警示 + 跨档单调性检查，仅在高稀有度含 ≥3 张 mult 卡时比较防假失衡）；
4. **tag 组合矩阵** + `heat_*`/`he_*`/`demo_*` 定点交叉对比表。

> **⚠️ 沿革（2026-10-20 #16）**：上述 ①/②/④ 三个维度依赖卡牌 `tags` 字段，该字段下线后**已从 audit 输出中降级**——`scripts/audit-content.js` 现从 `cards/*.json` 动态收集 tags，**全部无 tags 时只输出一行「已下线」说明**（不再产空表）；仅 ③ 强度曲线与定点交叉对比仍有效。tag 字段本身见 [沿革与已作废](./changelog.md#tags-字段下线2026-10-20-16)。

### 审计结论与告警现状

（原 §5 末两条）

- **P-42 首轮审计结论（2026-08-28）**：修正单调性检查后无 red 级 mult 失衡（0 警告）；唯一可观测缺口为**内容覆盖**——HEAT 弹种仅 3 张卡（`heat_composite_pen` / `heat_overpressure` common、`heat_precision` rare），无 epic/legendary 档，明显薄于 HE/AP/APCR；属 card-author 补卡范畴（内容前置），非数值调优，暂缓。
- **审计警告现状（2026-10-19 #U40 批次复核，存量内容项）**：`⚠ 稀有度单调性破坏：epic 最强 multDev=0.65 > legendary 含 mult 卡中位 0.50`（主因 epic `demo_walking_fire` 三效果 multDev 0.35）。属内容强度曲线项而非缺陷（exit=0 不挂链），#U39 补卡后的卡面再平衡留待内容批次。

## 相关页面
- [抽卡规则与保底](./draw-rules.md) — 权重怎么被实际消费（保底与 Boss 轮覆盖）
- [卡牌定位与数据契约](./overview-contract.md) — `rarity` / `maxStacks` 字段定义
- [沿革与已作废](./changelog.md) — tags 下线与 P-42 维度的降级
