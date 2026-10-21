# 游戏模式

> **摘要**：`?mode=boss` 与 `?mode=survival` 两种模式的入口、准备期伤害关闭、逐波选卡与商店时序。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §14、§14.1、§14.1b、§14.2（2026-10-21 拆分）
> **相关**：[Boss 战斗](./boss-combat.md) · [HUD 与界面](./hud-ui.md) · [卡牌规范](../cards.md)

## 目录
- [模式入口](#模式入口)
- [生存模式：准备期](#生存模式准备期)
- [生存模式：逐波选卡](#生存模式逐波选卡)
- [Boss 模式：商店时序](#boss-模式商店时序)

## 模式入口

（原 §14 首段，#MODE，2026-10-15 落地）

入口：`tank_mvp.html?mode=boss` / `tank_mvp.html?mode=survival`（缺省 `standard`；`GAME_MODE` 解析 URL 参数）。**标准模式零改动。**

## 生存模式：准备期

（原 §14.1，2026-10-15 用户裁定）

- **背景（原缺陷）**：波次清空原先走 `clearing` 通道（`clearing=true; clearingT=2.0`，「区域肃清」2 秒缓冲），但 `finishSurvivalWave` 只复位 `waveActive`/`cleared`、**不复位 `clearing`** ⇒ `isClearing` 恒真：随后 5 秒波次倒计时里玩家被冻结（`driveTank` 被跳过）、战斗管线全停。
- **现行口径**：
  - **删除「区域肃清」倒计时**——波次清空即调 `finishSurvivalWave()`（不再经 `clearing`）。该函数同时显式复位 `clearing=false/clearingT=0` 防残留。
  - **波次间隔 5 秒 = 准备期**：玩家**可自由移动**（不禁驾驶），但**全场伤害判定关闭**。
  - **伤害关闭的两层拦截**（缺一不可）：
    ① **伤害总闸**：`js/tank_physics.js applyDamage` 开头查询 `globalThis.damageSuppressed()`，为真即 `return 0`——所有伤害的单一收口（炮弹/溅射/炮击/DOT/溺毙/无人机/地雷/碾压），一处生效无遗漏。缺省无该函数 → 零影响（Node 测试/bench）。
    ② **伤害来源门控**：`tank_mvp.html` 主循环内 `isSurvivalPrep`（`isSurvivalPrepWindow()` 同一判定）拦住「不打伤害但留痕迹」的路径——玩家/AI/副炮塔开火、`stepShells` 炮弹飞行、`updateStrikes` 落弹、`updateDeployables` 触发、`updateDrones` 打击、溺毙倒计时累计。进入准备期时还清空残留弹道/落弹预警（`shells`/`impacts`/`bounceFx`/`clearStrikes()`）与导弹锁定，防静止悬停 5 秒后同时爆开。
  - **Boss 行为层无需门控**：准备期全程 `battleState.cleared=true`，其判定块本就跳过。
- **判定窗口**：`isSurvivalPrepWindow() = GAME_MODE==='survival' && battleState.waveCountdownActive && flow.state==='battle'`。
- **HUD**：`#survivalWaveHud` 显示「第 N 波已清 · 准备期 x 秒（可移动 / 暂不受伤害）」。

## 生存模式：逐波选卡

（原 §14.1b，2026-10-18 用户裁定，现行口径）

- **背景**：原口径只在 **Boss 波**（每 3 波）结束时弹快速选卡、且固定 **5 选 1**；普通波结束直接进 5 秒准备期，玩家整场拿不到卡。用户裁定：选卡属波次奖励，与补给点无关。
- **现行口径**：**每一波清空都弹选卡**，张数/抽取口径与标准模式**完全同源**：

  | 波次 | `pendingLootRounds` | 张数 | 抽取保底 |
  |---|---|---|---|
  | 普通波（`survivalWave % 3 !== 0`） | `0` | **5 选 2**（普通节点同款） | 无（全池权重抽） |
  | Boss 波（`survivalWave % 3 === 0`） | `1` | **5 选 3**（Boss 节点同款） | `RULES.cards.bossRound` 的稀有度配比 + 弹种/技能/主副武器安装保底 |

- **实现**：`finishSurvivalWave()` 统一置 `survivalQuickPick=true` + 上述 `pendingLootRounds`/`pendingLootRarityIdx`，再 `resetRewardShop()` → `openRewardScreen()`；确认后走 `rewardConfirmBtn` 的 `survivalQuickPick` 分支 → `startSurvivalCountdown()`（不经 `settlement`/`reward` 流程态、不重载地图）。
- **`rewardPickTarget()` 不再有 survival 特例**（原 `GAME_MODE==='survival' ? 1` 已删除），故 `renderRewardCards` 的 `shortBy` 口径也统一为 `(pendingLootRounds>0 ? 3 : 2) - need`。
- **选卡期间冻结战场**：卡片是模态遮罩，标准模式 reward 屏本就冻结世界；生存模式的快速选卡不切 `flow` 态、上面的 `battle` 门控拦不住，故 `loop()` 的 `paused` 并入 `survivalQuickPick`（只跳 `update`，`draw` 照常渲染冻结快照，与 pause 同款）。
- **补给站职责收窄**：只剩「按 E 回血 50% + 打开局内参数升级商店」，**不再承担选卡**（`tryUseSupplyStation` → `openSupplyShop` 链路未变）。

## Boss 模式：商店时序

（原 §14.2，2026-10-15 用户裁定）

- **背景**：`fbf7f73` 曾「完全禁用 Boss 模式局内商店」（理由「每局回满血，不需要升级」，但所有模式本就 `enterBattle` 满血进节点，该理由不成立）。
- **现行口径**：Boss 模式商店在 **reward 屏（卡牌选择）选完卡后**原地展开（`revealRewardShop`），不与结算屏重复出现。
  - 流程：`battle → settlement（仅得分展示，不内嵌商店）→ reward（选卡）→ 选完确认 → 同屏展开商店 → 点「继续 NEXT BOSS」→ 下一场`。
  - 商店列表与结算内嵌版/暂停菜单版**共用** `buildRunShopInto`（同一数据源与购买链）。Boss 模式仍移除「紧急维修」项。
  - 每次进入 reward 调 `resetRewardShop()`——Boss 追加卡牌有多轮（`reward→reward`），上一轮展开的商店必须收起并还原选卡按钮。
- **验证**：`scripts/test-modes.js`（生成逻辑）；浏览器定向验证（选完卡商店展开/点继续进下一场/准备期可移动且伤害为 0）。

## 相关页面
- [Boss 战斗](./boss-combat.md) — Boss 激光与召唤
- [HUD 与界面](./hud-ui.md) — `#survivalWaveHud` 与 Boss 血条
- [卡牌规范](../cards.md) — 选卡张数与保底池
- [specs 总目录](../README.md) — 回到五卷导航
