# 召唤与小兵

> **摘要**：分波次召唤的血量阈值与难度缩放、时间兜底、默认池、小兵机动锚定与 Boss 履带自修。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/boss.md` §6 首条、§7.2、§9、§9.1、§9.2（2026-10-21 拆分）
> **相关**：[行为与弱点](./behavior.md) · [运行时机制](./runtime.md) · [兼容索引](../boss.md)

## 分波次召唤

（原 §6 首条，2026-09-20 #E9 用户反馈①「boss 周围小兵没有持续生成，要随血量下降分波次生成」）

`bossSummonWave(entity, difficulty)` 按血量阈值逐波触发。

| 项 | 值 / 语义 |
|---|---|
| 默认阈值 | `RULES.boss.summonWaves.hpFrom = [0.75, 0.5, 0.25]`（`bosses/*.json` 的 `summons[i].hpFrom` 可覆盖） |
| 每波只触发一次 | `bossSummonWavesDone` 记账 |
| 单波敌数 | `summons[i].count × (1 + (countDiffMul−1)×diffNorm)`（**难度越高集中生成越多**，`countDiffMul` **1.6**） |
| spawn 位置 | Boss 周围 `spawnRadiusMin~Max`（**160~320px**）环形，且保证在有效触发距离之外（不脸刷） |
| 接入层 | `tank_battle.spawnBossSummonWave`（进入阶段时检查） |

> **旧实现在 `enterBattle` 一次性生成，已删除**。

> **本页承载原 §6/§7/§9 的召唤相关段**：分波次召唤（原 **6.1**）/ 召唤时间兜底（原 **4.2**）/ 兜底池（原 **7.2**）/ 小兵机动锚定（原 **9.1**）/ 履带自修（原 **9.2**）。

## 召唤时间兜底

（原 §4「召唤时间兜底」条，2026-10-15 #S3）

`bossSummonWave` 除 `hpFrom` 阈值外，开战 `RULES.boss.summonWaves.timeTriggerSec`（缺省 **75s**）后强制触发下一未触发波次（`t.bossFightT` 由 battle 主循环累计）。防久战磨血无召唤。

## 召唤波次兜底池

（原 §7.2，#G2）

- `RULES.boss.summonWaves` 新增 `defaultPool`（缺省 `[{ tankId:'dummy', count:2 }]`）与 `defaultWaves`（**3**）。
- `bossSummonWave` 在配置 `summons` 为空**且**实体 `t.boss.id` 存在时，用 `defaultPool` 自动补足 3 波（`hpFrom` 依次取 1.0 / 配置缺省），使「未声明 summons 的 Boss」也有分波召唤行为；**裸测试实体**（无 `t.boss.id`）的空 summons 仍返回 `null`（不污染 Node 单测）。

### 5 个 Boss 的 summons 配置

（全部 3 波，`hpFrom` = 1.0 / 0.66 / 0.33，对应 100% / 67% / 33% HP 触发；全部通过 `validateBoss` 校验）

| Boss | 三波随从 |
|---|---|
| `commander` | `dummy`×2, `tiger-I`×1, `panzer-IV`×2 |
| `fortress` | `dummy`×2, `panzer-IV`×1, `tiger-I`×1 |
| `siege_fort` | `dummy`×2, `panzer-IV`×1, `tiger-I`×1 |
| `sniper` | `dummy`×2, `hummel`×1, `Leapard_1`×2 |
| `twin_track` | `dummy`×2, `Leapard_1`×1, `tiger-I`×1 |

## 召唤小兵机动锚定

（原 §9、§9.1，#J，2026-09-23 用户反馈「boss 召唤的小兵移动速度太快」）

接入层 `tank_battle.spawnBossSummonWave` 沿用与节点敌军/增援**相同的 P-46 锚定链**：

`applyEnemyAppearanceAndStats(s, spec, playerAnchorStats || player.stats, currentNode.entityMults)`（仅取外观与类型，数值基准 = 玩家出击基准 × 兵种 profile × 难度 `entityMults`），而非直挂 `applyTankConfig` 照搬 `tanks/*.json` 的原始机动值——后者绕过难度/玩家基准锚定，机动常暴超。此前裸 `applyTankConfig` 已删除。

## Boss 履带断落随机自修

（原 §9.2，`updateBossTrackRepair`）

履带被击断（`resolveHit` → module `track` → `target.trackBroken=true` + `immobT = trackLock`，缺省 **8s**）后，Boss **不再被动整场站桩等锁归零**。改用 `updateBossTrackRepair(t, dt, opts)` 逐帧消费（接入层在 Boss AI 循环后调用）：

- `RULES.boss.trackRepair = { enabled, windowSeconds: 8, chance: 0.4 }`。
- **断裂瞬间**：预定一个 `(0, windowSeconds]` 内均匀随机的决策时点 + 一次性 `rng() < chance` 的命中判定；单次决策、不重复 roll。
- **到达决策时点**：命中 → 立即清零 `trackBroken`/`immobT`/`speed`（事件 `{ type:'trackRepair' }`）；未命中 → 保持锁定直至 `trackLock` 自然归零（`driveTank` 倒计时）。
- **每次断裂独立**：恢复（`broken→false`）后清空调度；再次被击断 → 重新预定新时点/新 roll。
- 非 Boss 实体 / `disabled` / 死亡安全返回空，`rng` 可透传入（浏览器接入层复用 `battleState.reinforceRng`）。
- **界面反馈**：`trackRepair` 事件触发 `spawnTrackRepairFx`（`spawnImpactFx` + `burstExplosion` 微型火星）+ `'ui'` 音效 + `pushLog('⚙ BOSS 履带自动修复 — 恢复机动')` 日志。
- **验证**：`scripts/test-boss.js` 覆盖未断/命中/未命中/再次断裂/非 Boss 五路断言。

> **原文的历史验证记录（照录，勿按字面当前状态理解）**：本段曾写「Node 测试 `npm test` **PASS**，浏览器 `npm run test:browser` 四链 **ALL PASS**」（2026-09-23 #J 当时实测）。当前浏览器链在沙箱内为 `spawn EPERM`（环境限制，非断言失败），权威验证状态以 `DEVELOPMENT.md` §3 为准。
>
> 本段原归口另记：`DEVELOPMENT.md` **§4.33**（#J 批次）、`ARCHIVE.md`（归档索引）。

## 相关页面
- [行为与弱点](./behavior.md) — 召唤与阶段行为的触发关系
- [运行时机制](./runtime.md) — `summons` 在 `makeBossEntity` 中的实例化
- [定位与数据契约](./overview-contract.md) — `summons[]` 的字段定义
