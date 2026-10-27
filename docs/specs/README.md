# 系统规范总目录（Specs Wiki）

> **摘要**：五卷系统规范的入口；查现行机制进主题页，查历史进 changelog，查 `§N` 进兼容索引。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/` 五卷（2026-10-21 wiki 化）
> **相关**：[docs 总导航](../README.md) · [Wiki 风格规范](../WIKI-STYLE.md) · [工作指引](../../AGENTS.md)

## 五卷

| 卷 | 一句话定位 | 首页 | 页数 | 标题数 | 兼容索引 |
|---|---|---|---|---|---|
| combat | 战斗与物理：弹道、装甲、弹种、技能、AI、友军指挥、特效、音频、HUD、UI 版式、模式 | [combat/index.md](./combat/index.md) | 20 | 68 | [combat.md](./combat.md) |
| map | 地图与地形：节点、掩体 tier、路网、水域、生成校准、渲染路线 | [map/index.md](./map/index.md) | 16 | 131 | [map.md](./map.md) |
| cards | 卡牌：稀有度、效果类型、卡池与校验、卡牌查看器 | [cards/index.md](./cards/index.md) | 9 | 18 | [cards.md](./cards.md) |
| boss | Boss：数据契约、阶段、血量倍率、AI 模式、激光与召唤 | [boss/index.md](./boss/index.md) | 8 | 24 | [boss.md](./boss.md) |
| editor | 编辑器工具链：设计器、对比页、字段架构、开发者面板 | [editor/index.md](./editor/index.md) | 8 | 23 | [editor.md](./editor.md) |

> **状态（2026-10-27 实测）**：五卷**已全部 wiki 化**，`docs/specs/<卷>/` 下共 **71 个 `.md`** = **61 个纯主题页** + 5 个卷首页 `index.md` + 5 个 `changelog.md`（`wiki-check` 的 `pages=71` 即此数）。每卷的 `<vol>/index.md` 是卷首页，`<vol>/changelog.md` 收沿革与已作废节；`docs/specs/<vol>.md` 保留为 **§N 兼容索引页**（既有编号不改，新机制追加新编号），供旧引用继续解析。
> **拆分前单卷原文**：以 git 提交 `57be2ca` 为准，各卷快照说明见 `docs/archive/2026-10-pre-wiki-<卷>.md`（含还原命令与分节行号表）。

## 怎么查

| 我要查什么 | 走哪条路 |
|---|---|
| **现行机制**（「这个现在怎么算？」） | 从上面表格进对应卷首页 → 主题页 → 页内「目录」定位小节 |
| **历史沿革**（「以前为什么是那样？」） | `<卷>/changelog.md`（已拆卷）或卷内 `§0 主题索引` 的「来源沿革」列 |
| **某个 `§N`**（代码注释/旧文档里的引用） | `docs/specs/<卷>.md` —— 兼容索引页，每节 1~3 行摘要 + 「详见」链接 |
| **某个具体数值** | 主题页里标了「唯一数值口径」的那张表；最终真值在 `js/tank_rules.js` / `js/tank_weapons.js` |
| **跨卷主题**（如「护盾」横跨 combat 与 cards） | 先看卷首页的「本卷不管什么」，再跳对应卷 |

## 跨卷归口（避免重复维护）

| 主题 | 归口 | 其它卷只做 |
|---|---|---|
| 弹种数值 / 装填公式 / AI 决策 | **combat** | 引用 |
| 掩体 tier / 路网 / 地形 `passability` / 节点难度曲线 | **map** | 引用 |
| 卡池 / 稀有度 / 卡牌效果与校验 | **cards** | 引用 |
| Boss 数据契约 / 阶段 / `tuning.hpMul` | **boss** | 引用 |
| 设计器 / 对比页 / 字段 schema | **editor** | 引用 |

## 相关页面
- [docs 总导航](../README.md) — 四份主文档与 specs 的关系
- [Wiki 风格规范](../WIKI-STYLE.md) — 新增页面必须遵循
- [combat 卷首页](./combat/index.md) — 已完成的样板卷
