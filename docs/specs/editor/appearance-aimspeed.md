# 内容工具与 appearance

> **摘要**：NF-1/NF-2/NF-4 内容工具；`spec.appearance` 生效、叠加层基准、`aimSpeed` 量纲、bench 稀有度分组、content_designer tags 移除。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/editor.md` §7.6、§8、§8.1~§8.6（2026-10-21 拆分）
> **相关**：[开发者面板](./devpanel.md) · [坦克设计器](./designer.md) · [兼容索引](../editor.md)

## 目录
- [内容工具与预览（NF-1 / NF-2 / NF-4）](#内容工具与预览nf-1-nf-2-nf-4)
- [applyTankConfig 深拷贝 spec.appearance](#applytankconfig-深拷贝-specappearance)
- [设计器叠加层基准统一](#设计器叠加层基准与-tank_paintjs-统一)
- [RULES.enemyAnchorBase.aimSpeed](#rulesenemyanchorbaseaimspeed)
- [bench 卡牌面板按稀有度分组](#bench-卡牌面板按稀有度分组)
- [content_designer 的 tags 编辑器移除](#toolscontent_designerhtml-的-tags-编辑器移除)
- [设计器三项（#15）](#设计器三项15)

## 内容工具与预览（NF-1 / NF-2 / NF-4）

（原 §7.6，2026-10-20）

| 项 | 实现 | 归口 |
|---|---|---|
| **NF-1 卡牌查看器扩展** | mvp `C` 键面板新增「**全池**」页签（数据源 `cardPool` 全表，按稀有度分组排序）；描述经 `formatCardDesc(card)` 求值（`{value}` / `{pct}` / `{ov:key}`，各带 `:N` effects 索引形式，未知占位符原样保留）；点击描述就地换 `textarea` 编辑，提交存 `sessionStorage['cardDescOverride']`（**仅会话预览，不写 `cards/*.json`**——写盘属内容批次职责）。 | `js/tank_cards.js` `formatCardDesc` + `tank_mvp.html` `renderCardsPanel` |
| **NF-2 坦克图鉴 CODEX** | bench 敌实验室新增面板：选等级 → `enemyPreviewStats(tankId, level, opts)` **纯查询**（临时 `makeTank` → `applyEnemyAppearanceAndStats` → `enemyLevelMults` 经 `addModifier` 注入 → 读 `stats`，**全程不触碰实体注册表**）。展示 HP/穿深/伤害/装填/极速/装甲六面。与 LIVE ENEMIES（真实实体，验证 AI/难度实战）分工互补。 | `js/tank_panels_core.js` `enemyPreviewStats` |
| **NF-4 面板卡牌悬停预览** | `tank_devpanel.js` 的 `attachCardTooltip(btn, card)`：单例 tooltip（稀有度彩色徽章 + `formatCardDesc` 求值正文），`mouseenter` **300ms** 延迟、`mouseleave` 立即隐藏；位置 = 按钮右缘 **+12px**，超出视口右/下边缘时翻折。`title` 保留为无 CSS/JS 极端环境的兜底。 | `js/tank_devpanel.js` |

> **`enemyPreviewStats` 与实战敌军的口径差异（有意为之）**：实战经 `applyDifficultyMults` 还会叠加难度封顶（`difficultyCapMuls`，含 `Math.random` 抖动）——那是平衡用的运行时钳制；图鉴展示**确定性基准**（无抖动），便于横向对比等级曲线。

## applyTankConfig 深拷贝 spec.appearance

（原 §8.1，`#X1`，2026-10-20）

**背景（根因比原条目描述更强）**：`tanks/*.json` 的 `appearance`（`cupola` 车长塔 / `engineDeck` 发动机舱盖外观件）**从未生效**——`js/tank_model.js` 的 `applyTankConfig`（约 `:516-655`）**完全不拷贝 `spec.appearance`** ⇒ 游戏内 `t.appearance` **恒 `null`**，所有外观件读到的都是缺省值。原 ISSUES #X1 只描述为「位置不受设计器影响」，实测**比这更严重：根本没有生效过**。

**修法**：按 `anchors` 的逐项拷贝手法**深拷贝**（避免实例级改写污染共享 `spec`）。

**实测**：`tiger-I` → `t.appearance = { cupola: 'panoramic', engineDeck: 'rearGrille' }`；切换车型无残留（不共享引用）。

## 设计器叠加层基准与 tank_paint.js 统一

（原 §8.2，`#X1`，2026-10-20）

`designer.js`（约 `:2192-2194`）此前用**座圈中心**为基准，而 `js/tank_paint.js`（约 `:879`）用 `(cym − W*0.44) + dy` ⇒ 两处基准不一致，设计器预览与实际贴图**位置偏差**。

**现行**：设计器**复用 `tank_paint.js` 同一公式**（唯一口径）——

- `cupola` = `(cxm + dx, (cym − W*0.44) + dy)`，再按 `turretAngle` 旋转；
- `engineDeck` = `(cxm + dx, cym + dy)`。

**并去重复叠加**：预览模式下 `paintPartTexture` 通道**已画**过一遍，仅 `!opts.detail` 的编辑模式才补画（旧实现两模式都补 ⇒ 叠加成双影）。

> **沿革**：`tank_paint.js` 的 `cupolaAnchor(opts)`（`js/tank_paint.js:1468-1487`）是车长塔绘制公式的**纯函数抽取**，本页的「同一公式」即指它；副炮塔位姿也复用它（见 [Boss 规范](../boss/index.md) 与 `DEVELOPMENT.md` §4.110）。

## RULES.enemyAnchorBase.aimSpeed

（原 §8.3，`#W14`，2026-10-20）

**根因（不是「难度表没调」）**：`applyEnemyAppearanceAndStats` 原先**不写 `base.aimSpeed`**，而 `makeTank` 的 base 也**无该键** ⇒ `computeStats` 回落 `RULES.spread.shrinkRate`（**0.15**）——那是「配装缺省」量纲；而真实坦克 `tanks/*.json` 的 `base.aimSpeed` 包络是 **1.0~2.5**。`entityMults.aimSpeed = [0.8, 1.35]` 是按真实坦克量纲设计的 ⇒ 满难度实测只有 `0.15×1.35 =` **0.2025**（玩家 `tiger-I` 1.5 的 **7.4%**），敌军缩圈几乎停滞、散布恒处扩散状态。

**现行**：`RULES.enemyAnchorBase.aimSpeed = 1.2`（中位中坦量级）；`applyEnemyAppearanceAndStats` 显式写 `base.aimSpeed`。`aimSpeed` **不参与** `enemyClassProfiles` 类别缩放（四类共用同一瞄准速度基准，差异由难度通道与玩家卡牌通道承担）。

**现行取值**（唯一口径 `js/tank_rules.js`）：

| 难度 | 乘子 | `stats.aimSpeed` |
|---|---|---|
| 低（`diff=0`） | 0.8 | **0.96**（= 1.2×0.8） |
| 满（`diff=diffMax=1.15`） | 1.35 | **1.62**（= 1.2×1.35） |

> **⚠️ 量纲锁定断言的正确写法（勿改）**：低难度 **0.96 低于 1.0 是设计意图**（低于玩家基准、略慢于中位中坦）——断言必须写 `≈0.96`，**不能写 `> 1.0`**（那会把设计意图判成缺陷）。真正的护栏是两条：① 结果 ≠ `RULES.spread.shrinkRate`（否则说明又回落到配装缺省量纲）；② 敌我量纲一致（满难度 1.62 落在真实坦克 1.0~2.5 包络内）。回归：`scripts/test-modifiers.js` #W14 段 13 条断言（含单调性、缺陷值 0.2025 回归、裸 `makeTank` 对照）。

## bench 卡牌面板按稀有度分组

（原 §8.4，`#7①`，2026-10-20）

`tank_bench.html` 的 `populateCardSelect`（约 `:626-640`）此前按 `id` 平铺下拉、无分类；分类逻辑只存在于 `js/tank_devpanel.js`。现改用 **`<optgroup>` 按稀有度分组**，新增两页共享的 `groupCardsByRarity` / `devRarityLabel` / `DEV_RARITY_*`（与正式游戏同源）。

> **⚠️ rarity-only，不依赖 tags**：因 #16 已删除 `tags` 字段，本实现**刻意不依赖 tags**（若依赖会随字段下线连带失效）。一键清除（`:227 clearCardsBtn`）保留。

**实测**（196 张）：分 **5 组**——神话 **1** / 传奇 **15** / 史诗 **44** / 稀有 **77** / 普通 **59**。

## tools/content_designer.html 的 tags 编辑器移除

（原 §8.5，`#16` 连带，2026-10-20）

该页 `:159` 的 `for(const t of CARD_TAGS)` 在 `CARD_TAGS` 不再导出后**打开即抛 TypeError**（**不在 `check-html.js` 的五页扫描范围内** ⇒ `npm run check` 不红，属工具链静默崩溃）。

**已整段删除 5 处**：

| 位置 | 删除内容 |
|---|---|
| `:107` | 列表元信息（改为**只显示 rarity**） |
| `:157-164` | 勾选框区域 |
| `:231` | tags 收集 |
| `:259` | 输出写回 |
| `:37-38` | `.tags` CSS |

每处带 `#16（2026-10-20）` 注释。

**A/B 验证**（同一 DOM stub）：旧写法 `for(const t of CARD_TAGS)` → `ReferenceError: CARD_TAGS is not defined`；新文件内联脚本加载正常、去注释后 `CARD_TAGS`/`tagWrap`/写回 `tags` 均消失。

> tags 字段本身的删除范围与沿革见 [卡牌规范 · 沿革与已作废](../cards/changelog.md#tags-字段下线2026-10-20-16)。

## 设计器三项（#15）

（原 §8.6，2026-10-20）

履带平铺对称 / 外观件实时预览 / 车长塔坐标统一——结论归口 **`DEVELOPMENT-batches-2026-10.md` §4.110** 与 `js/tank_paint.js` 的 `cupolaAnchor`，本页不重复罗列。

- 与 §8.1/§8.2 **无冲突**：§8.2 的「叠加层基准统一」正是 §4.110「车长塔坐标统一」的延续。

## 相关页面
- [开发者面板](./devpanel.md) — NF-1 / NF-4 所在的面板体系
- [坦克设计器](./designer.md) — appearance 的编辑入口
- [卡牌规范 · 沿革与已作废](../cards/changelog.md) — tags 下线
- [战斗规范 · 敌人强度与难度](../combat/enemy-scaling.md) — `aimSpeed` 的难度通道
