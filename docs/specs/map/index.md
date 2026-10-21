# 地图与环境要素规范

> **摘要**：本卷是地图/掩体/路网/水域/生成与贴图的现行口径权威，共 11 个主题页。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/map.md` 全卷（含 §0 主题索引与 §28 掩体归并视图；2026-10-21 wiki 化拆分）
> **相关**：[specs 总目录](../README.md) · [Wiki 风格规范](../../WIKI-STYLE.md) · [兼容索引](../map.md)

## 从这里开始

- 本卷管：**一张战场图怎么长出来**——节点架构与尺寸、掩体 tier 与三套判定（挡弹/通行/视线）、地形抽象、路网与河流、strip 条带与防线推进、难度曲线、贴图烘焙与审核、地面层烘焙与相机。
- 本卷不管：**弹道命中与模块伤害** → [战斗规范](../combat/index.md)；**卡牌效果** → [卡牌规范](../cards.md)；**Boss 数据与血量** → [Boss 规范](../boss.md)；**设计器工具链** → [编辑器规范](../editor.md)。
- 所有数值的最终真值在 `js/tank_rules.js`（`RULES`：`coverTiers` / `nodeMap` / `drowning` / `biomes` / `difficulty`）；本卷写「当前值 + 约束 + 易错点」。
- 手上有一个 `§N` 旧引用（如 `map.md §12`）→ 见 [兼容索引](../map.md)，编号一一对应。

## 主题页

| 页面 | 一句话 | 覆盖原节 |
|---|---|---|
| [节点架构与敌军布点](./map-architecture.md) | 节点链与尺寸、布局度量与难度旋钮、类别化敌军与旧环带布点 | §1、§8、§9 |
| [掩体体系](./cover-system.md) | tier 全集、`coverWorldScale` 唯一口径、确定性拦截、半高移除 | §2、§3、§12 |
| [地形抽象与生成](./terrain.md) | 属性 schema、地形→tier 映射、Biome 美术规范、生成期 LoS 走廊 | §5、§6、§7 |
| [道路与路网](./roads.md) | 七拓扑、单弓形弯参数、建筑密度、避路判定与预烘焙 | §10、§13、§19、§26 |
| [河流、水域与溺毙](./rivers.md) | 溺毙与豁免、AI 避水分档、可涉水宽度、河流互斥与沿程宽度 | §11、§20、§21 |
| [strip 节点与防线式推进](./strip-defense.md) | strip 设计预留与落地状态、防线推进的现行参数 | §14、§15 |
| [难度曲线与地图生成重做](./difficulty.md) | 难度成长曲线、地图生成的自然语言设计要求 | §16、§17 |
| [贴图资产与审核标准](./textures.md) | 烘焙契约、出图管线、纹理/阴影质量、v2+v3 审核标准 | §4、§18、§22、§23 |
| [生存模式与 strip 多行片](./survival-strip.md) | 生存复用 strip 链、多行片、全模式道路净空 | §24 |
| [地面烘焙与相机对齐](./ground-camera.md) | 地面层视口锚定烘焙、`renderCamPos` 屏幕像素对齐 | §25 |
| [2026-10-20 批次收口修正](./generation-cleanup.md) | 缩放补键、出生判据、水域收尾顺序、兜底语义、死配置 | §27 |
| [沿革与未落地](./changelog.md) | 作废原文、§5.4 未落地待办（只追溯，不导航） | §5.4、§14.3~§14.7 未落地部分 |

## tier 速查（18 键）

tier 全集以 `RULES.coverTiers`（`js/tank_rules.js`）为唯一口径（2026-10-21 实测 18 键）。下表只给**行为定性与所在页**，数值回原页读——本节取代原 §28.2 的完整表。

| tier | tierGroup | 行为（定性） | 现行口径所在页 |
|---|---|---|---|
| `full` | structure | 确定性挡弹 + 阻挡推出 + 遮视线 + 不可摧毁 | [掩体体系](./cover-system.md#tier-表现行口径) |
| `building` | structure | 同 `full` 的全高遮挡，但**可摧毁**，破坏后转残破建筑 | [道路与路网 · 可破坏楼房](./roads.md#可破坏楼房-building) |
| `intact` | structure | 行为同 `full`；**当前无生成器产出**，仅旧存档/基线兼容 | [掩体体系](./cover-system.md#tier-表现行口径) |
| `ruined` | structure | 确定性挡弹 + 遮视线 + 减速通行 + 可再摧毁成碎石 | [掩体体系](./cover-system.md#tier-表现行口径) |
| `rock` | structure | **不可通行** + 确定性挡弹 + 遮视线 | [掩体体系](./cover-system.md#tier-表现行口径) |
| `perm_block` | structure | **不可通行**；`shellBlock` 写成字符串 `'solid'`、派生 `mode:'none'` ⇒ **弹道拦截侧实际不拦**；**无生成器产出** | [地形抽象 · 属性 schema](./terrain.md#属性-schema-与取值域) |
| `barricade` | structure | `shellBlock:'single'`（挡单发即毁）+ 可被碾压/击毁，残骸为碎石 | [掩体体系](./cover-system.md#确定性弹道拦截) |
| `soft` | structure | 越飞 + 减速通行 + 可击毁/碾压，无残骸 | [掩体体系](./cover-system.md#tier-表现行口径) |
| `stump` | structure | 越飞 + 减速通行 + 可击毁 | [掩体体系](./cover-system.md#tier-表现行口径) |
| `rubble` | structure | 越飞 + 减速通行（终态残骸） | [掩体体系](./cover-system.md#tier-表现行口径) |
| `bridge` | structure | 越飞 + 可通行；**已不再产出**（旧存档兼容） | [沿革与未落地](./changelog.md#水系与桥梁的作废原文) |
| `tree` | foliage | 挡弹 + 阻挡推出 + **可被坦克推倒**成倒树 | [掩体体系](./cover-system.md#tier-表现行口径) |
| `fallen` | foliage | 越飞 + 自由通行，仍遮视线（纯视觉残留） | [掩体体系](./cover-system.md#tier-表现行口径) |
| `bush` | foliage | 越飞 + 自由通行，遮视线 | [掩体体系](./cover-system.md#tier-表现行口径) |
| `water` | liquid | 越飞 + 减速通行 + **溺毙危险体**（AI 规避） | [河流、水域与溺毙](./rivers.md#溺毙与-ai-避水) |
| `river` | liquid | 越飞 + 减速通行 + **可涉水**（不算危险水体） | [河流、水域与溺毙](./rivers.md#ai-敢涉水) |
| `mud` | ground | 越飞 + 减速通行 | [地形抽象](./terrain.md#地形到-tier-的映射) |
| `road` | ground | 纯地面层：公路加速 + 屏蔽下层减速 | [掩体体系](./cover-system.md#确定性弹道拦截) |

> **掩体主题的阅读顺序**：[掩体体系](./cover-system.md) → [地形抽象](./terrain.md) → 本页 tier 速查 → [2026-10-20 批次收口修正](./generation-cleanup.md)（仅在排查缺陷时读）。

## 常见入口

| 我想…… | 去哪 |
|---|---|
| 查掩体 tier 现在的挡弹/通行/视线行为 | [掩体体系 · tier 表现行口径](./cover-system.md#tier-表现行口径) |
| 调掩体的世界尺寸系数 | [掩体体系 · 掩体世界缩放唯一口径](./cover-system.md#掩体世界缩放唯一口径-coverworldscale) |
| 改道路弯曲或宽度 | [道路与路网 · 参数收口](./roads.md#参数收口) |
| 改河流宽度或河道形态 | [河流、水域与溺毙 · 河宽硬上限](./rivers.md#河宽硬上限) |
| 改敌人数量 / 防线 / 节点完成条件 | [strip 节点与防线式推进](./strip-defense.md) |
| 改难度曲线 | [难度曲线与地图生成重做 · 难度成长曲线](./difficulty.md#难度成长曲线) |
| 查贴图审核分数怎么算 | [贴图资产与审核标准 · 贴图审核标准](./textures.md#贴图审核标准) |
| 查历史/已作废机制、或未落地待办 | [沿革与未落地](./changelog.md) |
| 我手上有个 `§N` 引用 | [兼容索引](../map.md) |

## 相关页面
- [specs 总目录](../README.md) — 五卷入口与查法
- [兼容索引 `map.md`](../map.md) — 全部 `§N` 标题的摘要与「详见」链接
- [战斗规范](../combat/index.md) — 弹道与命中结算（本卷只管掩体几何与地形）
- [Wiki 风格规范](../../WIKI-STYLE.md) — 新增页面必须遵循
