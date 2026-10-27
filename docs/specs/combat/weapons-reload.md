# 武器与装填

> **摘要**：主炮五型的参数、双联与弹夹的装填流水线、电磁炮的贯穿、以及装填时长公式的唯一写法。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/combat.md` §8.5、§8.6、§8.6b、§9.1、§9.2、§9.3、§9.7、§13.6（#J2）（2026-10-21 拆分）
> **相关**：[弹种系统](./ammo-system.md) · [技能与副武器](./abilities-secondary.md) · [卡牌规范](../cards.md)

## 目录
- [主炮类型与规格通道](#主炮类型与规格通道)
- [装填时长公式](#装填时长公式)
- [双联火炮](#双联火炮)
- [弹夹炮](#弹夹炮)
- [机炮](#机炮)
- [标准主炮的砰砰炮](#标准主炮的砰砰炮)
- [电磁轨道炮](#电磁轨道炮)
- [statOverrides 与换装](#statoverrides-与换装)
- [卡牌稀有度与安装卡](#卡牌稀有度与安装卡)

## 主炮类型与规格通道

（原 §8.6b，2026-10-18 #U39）

主武器类型枚举 `RULES.weaponTypes.primary = ['standard','autocannon','double_barrel','railgun','clip']`。每型的数值缺省在 `WEAPON_DEFAULTS.primary.<type>`（`js/tank_weapons.js`），本页只列出**有特殊机制的型**（双联 / 弹夹 / 电磁炮）。

`primaryWeaponSpec(shooter)` 原实现对 `weapons.primary.type === 'standard'` **恒返回 null**，因此写进 `weapons.primary.stats` 的任何 `statOverrides` 都被忽略——所有「标准主炮」升级卡天然无效（这也是「主武器升级卡感觉没提升」的根因之一）。

现行口径：**无 stats 覆写时仍返回 null**（与既有行为逐字节一致、零回归）；**一旦 stats 非空则产出规格**（基准取 `WEAPON_DEFAULTS.primary.standard`：四个倍率均 1.0、burst 1）。于是 `damageMult / penMult / reloadMult / shellSpeedMult` 四条通道对该型全部可用，`firePrimaryShell` / `fireTank` 的既有消费逻辑无需改动。`test-fire.js` 7a2 段锁住双向语义（无覆写 → null；有覆写 → 倍率生效）。

## 装填时长公式

（原 §9.7，2026-09-21 #G5 附带；**本页是全卷装填时长公式的唯一口径**）

`drawReloadRing` 单环分支（battle）与 bench 装填条此前用 `player.stats.reload / debuffReloadRate(player)` 作时长，**漏乘武器通道 `reloadMult`**——电磁轨道炮（`reloadMult` 数值见 [电磁轨道炮](#电磁轨道炮)）装填的前 44% 时间内进度环恒空、随后跳变。现统一经 `primaryWeaponSpec(player).reloadMult` 折算（双管/弹夹分支不受影响）。

```
dur = stats.reload × primaryWeaponSpec(t).reloadMult ÷ debuffReloadRate(t)
```

HUD 装填环、`fireTank` 门控、电磁炮充能进度三者同源。改公式时三处一起改。

## 双联火炮

（原 §8.5，2026-09-20 #E13；**2026-10-22 第五批：换管时间固定 0.8s、交替装填卡降 epic**）

- **装填语义**：装填时间是**单根炮管**的装填时间；两管按**顺序流水线**装填（同一时刻只有一根在装填）——例：「装填 5s，+0s 齐射 → +5s 第 1 管装好（可单发）→ +10s 第 2 管装好（可齐射）」。
- **换管时间（唯一口径）**：单管射击后切换时间**固定 0.8s**（`RULES.weapons.doubleBarrelSwitchSeconds`），**不受任何卡牌/升级影响**。`fireDoubleBarrel` 恒读该键，不再读 `spec.switchSeconds`；`WEAPON_DEFAULTS.double_barrel.switchSeconds` 保留 0.8 仅作展示。**沿革**：原为 0.5s 且可被卡牌覆盖（「同步击发装置」降到 0.1、「交替装填系统」降到 0.05）——该两张卡的可覆盖能力已删除。
- **默认进度互相干涉**：任一击发后**两管装填进度都归 0**（`_dbState.loadT` 全清），流水线从头开始。
- **「交替装填系统」卡**（`weapon_primary_alt_reload`，**epic**）：效果**只剩 `altReload: true`**——击发一管**不再重置另一管的装填进度**（「+6s 发射时另一管仍是 +1s 进度」）。**沿革**：曾为 mythic（神话）并附带 `switchSeconds 0.05` + `reloadMult 0.9`；2026-10-22 用户裁定「单管射击后切换时间固定 0.8s 不受卡牌影响（如有卡牌影响则需要删除）」⇒ 两键摘除、稀有度降为 epic。
- **「同步击发装置」卡已删除**（2026-10-22）：其唯一效果 `switchSeconds 0.5 → 0.1` 在新口径下完全失效。
- **击发（2026-09-20 #F 用户裁定细化）**：鼠标单击 = 发射一根已装填炮管；空格 = 齐射——**仅两管都就绪才发射**，仅 1 管（或无）就绪时空格**不发射**（与卡牌界面文案「空格齐射（仅两管都就绪时）」一致）。1 管就绪时齐射被拒对玩家侧写 `shooter._dbLastBlocked = 'salvo-not-ready'` 并推送提示「空格齐射需要两管装填完成 — 单击可先发 1 根就绪管」（COVER；重复触发不刷屏，`_dbLastBlocked` 同值时静默），且**不影响随后单击单发**（单击照常发射就绪管）；无就绪管时不提示。`fireDoubleBarrel` 返回 `{ fired:false, shells:0, reason:'salvo-not-ready'|'none-ready' }`。`_dbState = { count, ready[], loadT[], loader, altReload }`。
- **视觉/音频**：炮口火光尺寸 ×1.7（粒子同步放大）、开火音效增益 ×1.6（`playSound('fire', {gain:1.6})`）+ 额外烟雾；`barrelOffset` 0.9 → **1.85**（炮管间距加大，确保炮管与附件不穿模）；**两根炮管各自绘制完整附件**（护套 jacket / 制退器 muzzle brake / 抽烟器 evac 逐管成对）。
- **HUD**：双管时显示**两根炮管各自的独立装填进度弧**（沿炮塔法向左右分列，与炮管偏移同源；就绪的管显示实心亮点），取代单环指示。

## 弹夹炮

（原 §9.1，2026-09-21 #G6）

弹夹炮参数唯一口径 `WEAPON_DEFAULTS.primary.clip`：

| 参数 | 值 | 语义 |
|---|---|---|
| `reloadMult` | 3.0 | 弹夹间整组装填 = 标准装填 × 3.0 |
| `clipSize` / `clipSizeBase` | 4 | 初始弹夹容量（发），升级卡每 +1 发 |
| `clipCycleSeconds` | 0.7 | **弹夹内**逐发间隔（固定，**不受任何 modifier/卡牌/debuff 影响**） |
| `clipSizeReloadStep` | 0.8 | 每扩容 1 发，弹夹间装填 +0.8×标准装填 |
| `damageMult` / `penMult` / `shellSpeedMult` | 1.0 | 单发伤害/穿深/弹速与标准炮一致 |

- **装填两段式**：弹夹内有弹（`rounds > 0`）→ 击发后 `reloadT = clipCycleSeconds`（硬编码、不乘任何倍率）；弹夹打空 → 进入**整组重装**（`pendingRefill = true`），`reloadT = 标准装填 × (reloadMult + clipSizeReloadStep × (size − clipSizeBase)) ÷ debuffReloadRate(t)`（**该段生效 debuff**），归零后一次性回满 `rounds = size`。**上表即本式的系数唯一口径，正文不再重复数字。**
- **手动整夹重装（R 键，2026-10-27 用户需求）**：弹夹**未打空**时可按 `R` 主动放弃余弹、立即进入整组重装，装完回满。实现为纯函数 `reloadClipWeapon(shooter)`（`js/tank_fire.js`）：
  - 仅 `type === 'clip'` 生效；弹夹已满且不在装填、已在整组装填、或爆发队列（`_clipBurst`）进行中 → 返回 `false` 不动作；
  - 成功时置 `pendingRefill = true` 并写与打空相同的整组时长（同表系数，不另设参数）。
  - UI：battle 键位 `R`，成功写日志；3D 切片同样绑定。
- **弹夹间装填不随扩容线性膨胀是设计意图**：容量 4→6 时整组时间为「基准 + 2 × 步长倍率」而非线性 ×6，扩容卡仍有正收益但边际递减（具体倍数按上表系数算）。
- 运行时状态挂 `t._clipState = { size, rounds, pendingRefill }`；武器换装卡（主武器升级路径）清空该状态（与 `_dbState` 同生命周期）。逐帧驱动 `updatePrimaryClip(t, dt)` 由页面主循环负责（battle 玩家 + AI 实体 / bench 玩家 + 靶车）。
- **HUD**：`drawReloadRing` 弹夹分支——弹夹内显示余量数字 `rounds/size` + 蓝色间隔弧；整组重装期显示橙色「装填」弧（进度按 `clipMagReloadSeconds` 归一）。
- 卡牌：`weapon_primary_clip`（epic，安装）/ `weapon_primary_clip_extended`（rare，`{"clipSize":"+1"}`，maxStacks 2）/ `weapon_primary_clip_capacity`（rare，`{"clipSize":"+2"}`）。
- **短装填升级卡（2026-10-22）**：`weapon_primary_clip_short_reload`（rare，`{"clipCycleSeconds":"-0.1"}`，maxStacks 2）⇒ 0.7 → 0.6 → 0.5。钳制区间 = `RULES.parameterLimits.clipCycleSeconds = {min:0.5, max:1.0}`。**沿革**：`weapon_primary_clip_capacity` 曾同时给 `clipCycleSeconds 0.55`，与新卡上限冲突，已摘掉该键（只留 `clipSize "+2"`）。
- **爆发射击卡（2026-10-22，用户需求 5）**：`weapon_primary_clip_burst`（epic，`{"burstOnSalvo":true}`，maxStacks 1）。效果 = **按空格**以**固定 0.5s 短装填**（`RULES.weapons.clipBurstCycleSeconds`）把弹夹内剩余炮弹**全部**射出。
  - 实现：`fireClipWeapon(..., salvo)` 在 `salvo===true && spec.burstOnSalvo` 且队列为空时挂 `t._clipBurst = { left: st.rounds, t: 0 }`（首帧不发）；`updatePrimaryClip` 逐帧 `t += dt`，到 0.5s 直调 `firePrimaryShell`（**绕过 `reloadT` 门控**）、`left--`/`st.rounds--`；打完置 `pendingRefill = true` 并写整组装填时长（同 §装填两段式）。
  - 队列存在期间普通单击被拒（返回 `{fired:false, reason:'burst-running'}`）；`enterBattle` 清队列；AI 不驱动爆发（`salvo` 只由玩家空格传入）。

## 机炮

（2026-10-22 第五批，用户需求 2；**本表是机炮成长边界的唯一口径**）

基础参数在 `WEAPON_DEFAULTS.primary.autocannon`；本页只列**成长/机制口径**（唯一数值源 `RULES.autocannon`）：

| 键 | 值 | 语义 |
|---|---|---|
| `basePenRatio` | **0.80** | 机炮基础穿深 = 标准穿深的 80%（`penMult`）。**沿革**：0.85 → 0.80（2026-10-22 用户裁定「穿深改为标准穿深的 80%」） |
| `rangeBasePx` / `rangeStepPx` / `rangeMaxPx` | 900 / 100 / 1200 | 基础射程 / 每级加成 / 硬上限（卡面按 m 显示：900px≈82m、1000≈92m、1100≈101m、1200≈110m，换算 `RULES.scale.PX_PER_METER≈10.92`） |
| `overheatLockBase` / `overheatLockStep` / `overheatLockMin` | 2.0 / 0.5 / 1.0 | 过热锁定基础时长 / 每级缩减 / 下限 |
| `penRatioStep` / `penRatioMax` | 0.05 / 0.10 | 「相对标准穿深」的穿深增强：每级 +5%，最多 +10%（0.80 → 0.85 → 0.90） |

**过热机制（2026-10-22 语义变更）**：每发累积 `heatPerShot`，≥`heatMax` 触发过热并锁定。**锁定期间不降温**——`updatePrimaryHeat` 在 `heatLockT > 0` 时只递减锁定计时并 `return`，不解 `heatPct`；**锁定归零后的下一帧才开始按 `coolPerSec` 降温**。**沿革**：改前锁定与降温并行（锁 2s 后热量已降到 70%），与用户「过热后不再立即冷却，而是等待 2s 锁定结束后才开始冷却」相冲。

**射程**：`shell.maxRange` 取 `spec.maxRange` 并钳到 `rangeMaxPx`；`stepShells` 中超程即 `dead`（无伤害衰减）。

**卡牌（2026-10-22 新增 3 张 + 收口 2 张）**：`weapon_primary_autocannon_range`（rare，`{"maxRange":"+100"}`，maxStacks 3）/ `weapon_primary_autocannon_cooling`（rare，`{"overheatLock":"-0.5"}`，maxStacks 2）/ `weapon_primary_autocannon_pierce`（epic，`{"penMult":"+0.05"}`，maxStacks 2）。**收口**：`weapon_primary_autocannon_damage` 摘掉 `penMult 0.95`（会突破 +10% 上限）、`weapon_primary_autocannon_heat` 摘掉 `overheatLock 1.2`（会突破 1.0s 下限）。安装卡 `weapon_primary_autocannon` 的 `penMult` 同步 0.80、`heatPerShot` 统一 10（**沿革**：缺省表曾 12、卡面 10，三方不一致，见 ISSUES #Z6）。

**HUD**：热量环分母取 `spec.heatMax`（不再硬编码 100）。

## 标准主炮的砰砰炮

（2026-10-22 第五批，用户需求 6）

**卡牌**：`weapon_primary_standard_doubletap`（epic，`{"doubleTapEnabled":true}`，maxStacks 1）。

**机制**：主炮射击后 **0.8s** 再射出 1 发 **0.6 × 当前伤害**的炮弹（`RULES.weapons.standardDoubleTapDelay / standardDoubleTapDmgMul`）。

- 实现：`firePrimaryShell` 加可选第 6 参 `dmgScale`（缺省 1）；`fireTank` 的通用单发分支在 `spec.doubleTapEnabled` 时挂 `shooter._doubleTap = { t: 0.8, dmgScale: 0.6 }`；新增 `updatePrimaryFollowup(t, dt, ctx)` 逐帧递减，到点直调 `firePrimaryShell` 后清队列。
- 死亡 / 换武器（`primaryWeaponSpec` 不再有 `doubleTapEnabled`）→ 直接清队列，不发幽灵弹。
- 驱动点：battle 玩家主循环 + 全实体主循环（AI/友军同源）。

## 电磁轨道炮

（原 §9.3，2026-09-21 #G5；**本表是电磁炮全部数值的唯一口径**，2026-10-21 按 `js/tank_weapons.js` 核对）

| 参数 | 现行值 | 沿革 / 语义 |
|---|---|---|
| `reloadMult` | **1.8** | 沿革 2.2 → 1.8（#G5，装填 ×1.8） |
| `damageMult` | **1.8** | 沿革 1.5 → 1.8（#G5） |
| `penMult` | **2.0** | 高穿深主通道 |
| `shellSpeedMult` | **2.5** | 全武器最快弹速 |
| `pierce` | **1** | 击穿首个目标后继续飞行的**额外**目标数（1 = 共可命中 2 个） |
| `pierceDmgMul` | **0.6** | 后续目标伤害倍率（逐个连乘） |

> 表头写的是 `WEAPON_DEFAULTS.primary.railgun` 的当前值；四个倍率通道与 `burst` 的缺省基准见 [主炮类型与规格通道](#主炮类型与规格通道)。

- 实现（`tank_fire.js`）：`firePrimaryShell` 在 `spec.pierce > 0` 时给炮弹写 `pierceLeft` / `pierceDmgMul` / `pierceHitIds`；`stepShells` 命中判定跳过 `pierceHitIds` 内实体（不重复命中原目标），PEN 结果且 `pierceLeft > 0` 时递减计数、`shell.dmg *= pierceDmgMul`、把命中点写回 `fx/fy`、`dist += step` **继续飞行**；倍率耗尽或结果为非穿透才 `dead = true`。
- 定位：高穿深 + 高单发伤害 + 贯穿 2 目标（倍率见上表），代价是装填显著变长与弹速最快；配合 APFSDS+ 高穿弹收益最大（穿深叠加后能稳定贯穿中坦正面）。
- 配套卡：`weapon_primary_railgun`（epic 安装，数值与上表同源）/ `weapon_primary_railgun_upgrade`（rare，`{reloadMult:1.7, shellSpeedMult:3.0}`）。
- **视效**：三段（充能 / 击发放电 / 弹道）与三色口径见 [特效与视效 · 电磁轨道炮三段视效](./fx-visual.md#电磁轨道炮三段视效)。

## statOverrides 与换装

（原 §9.2 #G6 + §13.6 #J2）

- **`statOverrides` 支持三类值**：升级卡（`weapon_primary_*_upgrade` / `weapon_secondary_*_upgrade`）的 `statOverrides` 值支持 `number`（绝对值覆盖）、`boolean`（开关，如 `altReload`/`guided`）、`"+N"` 字符串（**在当前值基础上加 N**）。合并由 `tank_cards.js mergeStatOverrides(stats, overrides)` 统一执行（`"+N"` 走 `Number(...)+N`），主/副武器两条升级分支同源。`validateCard` 对三类值均放行，其它类型判非法。
- **换装重置（#J2，2026-09-30 用户反馈「获得电磁炮后再获得其他主炮，似乎会继承可穿透弹药的特性」）**：`js/tank_cards.js` 主武器 `install` 在**换型**时先重置 `stats` 为该型基准（`getWeaponDefaults('primary', wType)`），再合并卡牌 `statOverrides`。
  - **根因**：旧实现 `Object.assign({}, 旧 stats, overrides)` 把旧武器专有键一并带进新武器 —— 最典型的是 `railgun` 的 `pierce`/`pierceDmgMul`（`js/tank_fire.js firePrimaryShell` 据此赋予弹体贯穿能力），于是换上任何其他主炮后仍能贯穿两辆坦克。
  - **同型安装保持合并语义**（幂等，不丢 `tanks/*.json` 自定义数值）；副武器 install 原本就用 `getWeaponDefaults` 构造新对象，无此缺陷（两条路径现共用 `_weaponDefaultsResolver()`）。

## 卡牌稀有度与安装卡

（原 §8.6，2026-09-20 #E13）

`CARD_RARITIES = ['common','rare','epic','legendary','mythic']`（序号即强度序），权重 `50/30/15/4.5/0.5`；Boss 掉落白名单 `LOOT_RARITIES` 同步扩展；HUD 标签新增「神话」。Boss 保底池过滤按新序自动生效（`bossLootPool` 用 `CARD_RARITIES.indexOf` 比较）。卡池与稀有度细则归口 [卡牌规范](../cards.md)。

## 相关页面
- [弹种系统](./ammo-system.md) — 弹种数值与升级链
- [技能与副武器](./abilities-secondary.md) — 副武器与 `WEAPON_DEFAULTS.secondary`
- [特效与视效](./fx-visual.md) — 电磁炮三色与炮口分层
- [卡牌规范](../cards.md) — 安装卡与升级卡
