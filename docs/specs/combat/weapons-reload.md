# 武器与装填

> **摘要**：主炮五型的参数、双联与弹夹的装填流水线、电磁炮的贯穿、以及装填时长公式的唯一写法。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §8.5、§8.6、§8.6b、§9.1、§9.2、§9.3、§9.7、§13.6（#J2）（2026-10-21 拆分）
> **相关**：[弹种系统](./ammo-system.md) · [技能与副武器](./abilities-secondary.md) · [卡牌规范](../cards.md)

## 目录
- [主炮类型与规格通道](#主炮类型与规格通道)
- [装填时长公式](#装填时长公式)
- [双联火炮](#双联火炮)
- [弹夹炮](#弹夹炮)
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

`drawReloadRing` 单环分支（mvp）与 bench 装填条此前用 `player.stats.reload / debuffReloadRate(player)` 作时长，**漏乘武器通道 `reloadMult`**——电磁轨道炮（`reloadMult` 数值见 [电磁轨道炮](#电磁轨道炮)）装填的前 44% 时间内进度环恒空、随后跳变。现统一经 `primaryWeaponSpec(player).reloadMult` 折算（双管/弹夹分支不受影响）。

```
dur = stats.reload × primaryWeaponSpec(t).reloadMult ÷ debuffReloadRate(t)
```

HUD 装填环、`fireTank` 门控、电磁炮充能进度三者同源。改公式时三处一起改。

## 双联火炮

（原 §8.5，2026-09-20 #E13）

- **装填语义**：装填时间是**单根炮管**的装填时间；两管按**顺序流水线**装填（同一时刻只有一根在装填）——例：「装填 5s，+0s 齐射 → +5s 第 1 管装好（可单发）→ +10s 第 2 管装好（可齐射）」。
- **默认进度互相干涉**：任一击发后**两管装填进度都归 0**（`_dbState.loadT` 全清），流水线从头开始。
- **「交替装填系统」卡**（`weapon_primary_alt_reload`）：稀有度由 **legendary 升为 mythic（神话，新增最高档）**；效果 = `altReload: true` 解除干涉（击发一管不影响另一管的进度——「+6s 发射时另一管仍是 +1s 进度」）+ `switchSeconds 0.05` + `reloadMult 0.9`。
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
- **弹夹间装填不随扩容线性膨胀是设计意图**：容量 4→6 时整组时间为「基准 + 2 × 步长倍率」而非线性 ×6，扩容卡仍有正收益但边际递减（具体倍数按上表系数算）。
- 运行时状态挂 `t._clipState = { size, rounds, pendingRefill }`；武器换装卡（主武器升级路径）清空该状态（与 `_dbState` 同生命周期）。逐帧驱动 `updatePrimaryClip(t, dt)` 由页面主循环负责（mvp 玩家 + AI 实体 / bench 玩家 + 靶车）。
- **HUD**：`drawReloadRing` 弹夹分支——弹夹内显示余量数字 `rounds/size` + 蓝色间隔弧；整组重装期显示橙色「装填」弧（进度按 `clipMagReloadSeconds` 归一）。
- 卡牌：`weapon_primary_clip`（epic，安装）/ `weapon_primary_clip_extended`（rare，`{"clipSize":"+1"}`，maxStacks 2）。

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
