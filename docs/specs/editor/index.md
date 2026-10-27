# 编辑器与工具链规范 (Tank Designer & Tooling Spec)

> **摘要**：本卷是坦克设计器、对比页、烘焙工具、开发者面板与 appearance/aimSpeed 的现行口径权威，共 8 个主题页。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/editor.md` 全卷（含 §0 主题索引；2026-10-21 wiki 化拆分）
> **相关**：[specs 总目录](../README.md) · [风格规范](../../WIKI-STYLE.md) · [兼容索引](../editor.md)

## 从这里开始

- 本卷管：**改坦克数据 / 看参数 / 调面板**的全部工具链——设计器（几何/装甲/炮管/外观件）、参数对比页、字段架构表、资产烘焙、模块概率分区、贴图涂装规范、开发者面板、浏览器测试链、内容工具（NF-*）。
- 本卷不管：**运行时怎么用这些数据** → [战斗规范](../combat/index.md)（属性三层、命中结算）、[地图规范](../map.md)（掩体/路网）；**卡牌与 Boss 数据** → [卡牌规范](../cards/index.md) / [Boss 规范](../boss/index.md)。
- 字段的最终真值在 `js/tank_schema.js`（`FIELD_ROWS`）与 `tanks/*.json`；本卷写「怎么编辑 + 约束 + 易错点」。
- 手上有一个 `§N` 旧引用（如 `editor.md §7`）→ 见 [兼容索引](../editor.md)，编号一一对应。

## 主题页

| 页面 | 一句话 | 覆盖原节 |
|---|---|---|
| [坦克设计器](./designer.md) | 多边形/装甲/炮管炮盾编辑、双中心分离、背景参考图 | §1 |
| [对比页与字段架构表](./compare-schema.md) | `tank_compare.html` 的单位直标与四分组、`tank_schema.js` 的 `FIELD_ROWS` | §2、§3 |
| [烘焙工具与模块分区](./bake-modules.md) | `tools/bake.html` 出图；P-49 模块/成员概率分区与属性耦合链 | §4、§5 |
| [贴图与涂装视觉规范](./visual-spec.md) | 迷彩叠层、装甲质感、整车精灵四层与对齐契约、后期贴图入库与验收指标（当前无图） | §6 |
| [开发者面板](./devpanel.md) | devPanel 四 Tab、卡牌选择器、两页按键统一、HUD 合并状态 | §7、§7.1~§7.4 |
| [浏览器自动化测试链](./browser-tests.md) | `npm run test:browser` 八链脚本矩阵、测试钩子、r4 夹具约定 | §7.5 |
| [坦克图鉴页](./codex.md) | `tank_codex.html` 的数据源、布局与首页入口（取代 bench 内嵌图鉴） | 2026-10-22 新建 |
| [内容工具与 appearance](./appearance-aimspeed.md) | NF-1/2/4；`spec.appearance` 深拷贝、叠加层基准、aimSpeed 量纲、bench 分组、content_designer tags 移除 | §8、§8.1~§8.6；§7.6 |
| [沿革与已作废](./changelog.md) | 已关闭的「未纳入本轮」项、被取代的叠加层基准与旧 aimSpeed | §7.7、§8.2 沿革、§8.3 沿革 |

## 常见入口

| 我想…… | 去哪 |
|---|---|
| 改一辆坦克的几何/装甲 | [坦克设计器](./designer.md) |
| 改参数并看单位（km/h、m） | [对比页与字段架构表](./compare-schema.md#参数对比页) |
| 出一套贴图资产 | [烘焙工具与模块分区 · 烘焙工具](./bake-modules.md#资产烘焙工具) |
| 查缺省贴图/迷彩/对齐契约 | [贴图与涂装视觉规范](./visual-spec.md) |
| 改开发者面板 | [开发者面板](./devpanel.md) |
| 跑浏览器六链 | [浏览器自动化测试链](./browser-tests.md) |
| 查外观件（车长塔/舱盖）为何不生效过 | [内容工具与 appearance · appearance](./appearance-aimspeed.md#applytankconfig-深拷贝-specappearance) |
| 查敌军 `aimSpeed` 量纲 | [内容工具与 appearance · aimSpeed](./appearance-aimspeed.md#rulesenemyanchorbaseaimspeed) |
| 我手上有个 `§N` 引用 | [兼容索引](../editor.md) |

## 相关页面
- [specs 总目录](../README.md) — 五卷入口与查法
- [地图规范](../map.md) — 掩体 tier 与视觉标准（本卷只引用不复制）
- [战斗规范](../combat/index.md) — 属性三层、模块命中、武器规格
- [卡牌规范](../cards/index.md) — 卡牌数据结构与效果类型
