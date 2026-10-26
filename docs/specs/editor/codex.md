# 坦克图鉴页

> **摘要**：`tank_codex.html` 独立图鉴页的数据源、布局与入口；取代此前「图鉴塞在 bench 里」的形态。
> **适用版本**：现行（2026-10-22）
> **源自**：2026-10-22 第五批新建（用户需求「图鉴功能独立为一个单独的页面并在 npm start 和首页中提供」）
> **相关**：[坦克设计器](./designer.md) · [对比页与字段架构表](./compare-schema.md) · [开发者面板](./devpanel.md)

## 页面与入口

| 项 | 值 |
|---|---|
| 文件 | `tank_codex.html`（单文件，`<script src="js/...">` 复用全局模块） |
| 首页入口 | `index.html` 的 `.tools` 导航「坦克图鉴」 |
| dev server | `npm start` 后 `/tank_codex.html`（与其余页面同源，无需额外路由） |
| 语法冒烟 | 已加入 `scripts/check-html.js` 的页面白名单 |

## 数据源与计算

- **列表**：`fetch(/api/tanks)`（坦克）+ `fetch(/api/bosses)`（Boss），分组显示。
- **数值**：复用 `js/tank_panels_core.js` 的纯函数 `enemyPreviewStats(tankId, level, { boss })`（临时 makeTank，**不入 entities**，与实战解耦）。
- **等级滑杆**：`#codexLevel`（1~13，默认 1），联动全部数值（HP/穿深/伤害/装填/极速/六面装甲）。
- **已知口径边界（2026-10-22 更新）**：**普通坦克行**已按各车出厂值显示（`factory: true`，见下节）；**Boss 行**仍只**透传** `opts.boss`、未施加 Boss 调参倍率/阶段修饰 ⇒ 显示的是「其底盘的等级曲线」，页脚已显式标注。要真实 Boss 数值需在 `tank_panels_core.js` 补 boss 分支（未做）。

## 数值口径：`factory: true`（2026-10-22 修「各车数据相同」）

**用户反馈**：「图鉴页面各坦克装甲值等数据都是相同的」。

**根因**：`enemyPreviewStats` 原来一律走 `applyEnemyAppearanceAndStats`，而该函数按设计**只取外观与类型**——
数值一律用固定基准 `RULES.enemyAnchorBase × enemyClassProfiles[class]`，**`tanks/*.json` 的数值被完全丢弃**；
而 5 辆车的 `class` 字段全是 `undefined` ⇒ `deriveTankClass` 全落 `medium` ⇒ 乘子同为 1
⇒ 六面装甲 / HP / 穿深 / 伤害 / 装填 / 极速**全部一模一样**（实测确认）。

**修法**：`enemyPreviewStats(tankId, level, { factory: true })` —— 图鉴页传该标记：

| 维度 | factory 口径（图鉴） | 缺省口径（实战，零回归） |
|---|---|---|
| 装甲 | `resolvePartArmor(spec, part)` 逐面取 `tanks/*.json` 的 `hull.armor` / `turret.armor` | `enemyAnchorBase.armor × classProfile.armor` |
| HP/穿深/伤害/装填/极速/转速/弹速/马力 | `spec` 的顶层字段（该车出厂值） | `enemyAnchorBase × classProfile` |
| 等级曲线 | 叠加 `enemyLevelMults(level)`（曲线不变，便于横向对比） | 同 |

**实测（Lv1）**：tiger-I HP120 / 车体 110-80-54 / 炮塔 160-80-60；Leapard_1 HP80 / 60-38-26 / 80-50-24；
panzer-IV HP90 / 80-30-20 / 50-30-20；Obj 780 HP110 / 110-75-45 / 110-78-60；hummel HP70 / 30-20-15 / 20-15-10 —— **五车互不相同**。

**依赖**：`js/tank_model.js` 已导出 `resolvePartArmor`（2026-10-22）；`tank_panels_core.js` 用 `globalThis` 索引访问它
（该文件不持有裸标识符声明，直接写会 TS2304）。

**沿革（不静默删除）**：改前本页写「图鉴 Boss 行是其底盘等级曲线」——Boss 仍如此（`opts.boss` 只透传、未施加 Boss 调参倍率），
但**普通坦克行**现已按各车出厂值显示，两者口径不同，页脚已分别标注。

## 与 bench 的关系（2026-10-22 变更）

**沿革**：图鉴原为 bench 内的「坦克图鉴 CODEX」区块（`tank_bench.html` 的 `#codexTable` + `renderCodex`）。2026-10-22 用户要求「图鉴功能独立为一个单独的页面」⇒ 该区块与实现**已从 bench 删除**，bench 当时只留一行链接「完整图鉴见 坦克图鉴页 →」。**2026-10-26 用户裁定「从 bench 中完全删除」⇒ 连那一行链接也移除**，bench 现无任何图鉴入口；图鉴唯一入口 = 首页 `.tools` 导航「坦克图鉴」+ 直接访问 `tank_codex.html`。

## 相关页面
- [坦克设计器](./designer.md) — 设计出的坦克会出现在图鉴列表里
- [内容工具与 appearance](./appearance-aimspeed.md) — `enemyPreviewStats` 的等级乘子口径
- [开发者面板](./devpanel.md) — 另一套「标签页」（实时/卡牌/参数/开关），勿与设计器混淆