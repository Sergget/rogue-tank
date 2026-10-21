# 2026-10-21 wiki 化拆分前快照 —— `docs/specs/map.md`

> **来源**：`docs/specs/map.md`（2026-10-21 wiki 化拆分前的单卷原文）
> **快照目的**：wiki 化是结构性破坏（正文从单卷迁到 `docs/specs/map/` 的 13 个主题页）。万一迁移中有内容丢失，可据本快照逐节比对。
> **原文件实测**：**1304 行 / 102 025 字符 / 180 500 字节 / 119 个 `##`+`###`+`####` 编号标题（29 个 `##` / 86 个 `###` / 4 个 `####`）**；SHA256 `7D6FB4CE5143A8E5DB55887658E547D5A7ECCD40DEF3F043D2A89A5926995464`（2026-10-21 拆分前工作副本版本）
> **基线提交**：`57be2ca`（`docs(specs): 五卷主题化重构 —— 卷首主题索引 + 数值去重 + 实质错误修正（编号零变更）`）——`git show 57be2ca:docs/specs/map.md` 与拆分前工作副本**逐行比对差异 = 0**（1304 vs 1304 行）。
> **当前状态**：`docs/specs/map.md` 已改为 §N 兼容索引页；正文见 [map/index.md](../specs/map/index.md)。
> **规范**：`docs/WIKI-STYLE.md`

---

## 为什么这里不是逐字转载

本文件原本计划内联 1304 行原文。实测该路径在沙箱下**只允许创建、不允许二次写入**（`write` 可建文件，但随后任何 append / 覆盖 / 删除均被拒：PowerShell、`cmd`、`.NET File.Move`、`node fs` 全部返回 `EPERM` / `Access denied`——与 combat 卷同一限制）。因此改用**等价且更可靠**的留存方式：

1. **原文在 git 对象库里逐字保存**——拆分前的 `docs/specs/map.md` 已随提交 **`57be2ca`** 入库。
2. **实测等价**：把 `git show 57be2ca:docs/specs/map.md` 与拆分前工作副本逐行比对，**差异行数 = 0**（1304 vs 1304 行）；拆分前工作副本 SHA256 = 上表值。
3. **可随时还原**（在仓库根目录执行）：

```bash
# 查看原文
git show 57be2ca:docs/specs/map.md | less

# 还原成文件（另存，不覆盖兼容索引页）
git show 57be2ca:docs/specs/map.md > /tmp/map-pre-wiki.md

# 仅还原某一节（例：§12 掩体体系收敛，行 376–436）
git show 57be2ca:docs/specs/map.md | sed -n '376,436p'
```

4. 下方给出**分节行号清单**（全部 119 个编号标题），即使不还原全文，也能按节定位到上面的 git 原文里核对任何一段。

> 若将来需要把原文内联进本文件，请在**沙箱外**（或获得写权限后）执行上表第 2 条命令并追加到本文件末尾即可。

## 分节行号清单（拆分前 `map.md`，共 119 条）

> 「行」为标题所在行；节尾 = 下一个标题前一行 - 1（末节到 1304 行）。

| 节 | 行 | 节 | 行 | 节 | 行 |
|---|---|---|---|---|---|
| §0 主题索引 | 8 | §10.2 路口感 + 拓扑 v2 | 289 | §20 strip 河流互斥 | 770 |
| §1 节点地图与大世界架构 | 38 | §11 水域溺毙 + AI 避水 | 315 | §21 河道形态与沿程宽度 | 785 |
| §2 地图元素体系 | 47 | §11.1 河流可涉水化 | 335 | §22 贴图与阴影质量 | 799 |
| §3 掩体核心机制 | 79 | §11.1.1 贴图 vs 物理根因 | 339 | §22.1 坦克纹理 | 806 |
| §4 贴图资产与烘焙层 | 85 | §11.1.2 河宽硬上限 | 351 | §22.2 缓存键与 LRU | 822 |
| §5 地形类型抽象 | 98 | §11.1.3 AI 敢涉水 | 363 | §22.3 阴影光源固定 | 829 |
| §5.1 统一属性 schema | 102 | §11.1.4 回归覆盖 | 371 | §22.4 植被烘焙 | 837 |
| §5.2 具体地形映射 | 112 | §12 掩体体系收敛 | 376 | §22.5 地面材质 | 853 |
| §5.3 河流多段地形 | 129 | §12.1 tier 表现行口径 | 383 | §22.5b drawImage 不可互换 | 861 |
| §5.4 落地前 checklist | 132 | §12.2 确定性弹道拦截 | 402 | §22.6 mini-canvas 语义 | 869 |
| §5.5 Biome 美术规范 | 146 | §12.3 路网 v3 | 414 | §22.7 回归保护 | 878 |
| §5.6 P-40 落地注记 | 158 | §12.4 沿路建筑 + 路口沙包 | 422 | §22.8 立体感 2.5D | 884 |
| §5.7 批次⑤ 落地注记 | 168 | §12.5 难度校准重锚 | 432 | §23 坦克贴图审核标准 | 896 |
| §5.8 批次⑥ 落地注记 | 176 | §13 路网 v4 + 可破坏楼房 | 437 | §23.1 两条前置事实 | 903 |
| §6 地图元素与生成更新 | 185 | §13.1 路网 v4 七拓扑 | 444 | §23.2 八条指标 | 909 |
| §7 A17 LoS 走廊 | 210 | §13.2 可破坏楼房 building | 465 | §23.3 按意图分类评分 | 926 |
| §8 节点布局难度校准 | 221 | §13.3 校准重锚（第二次） | 484 | §23.4 指标返工记录 | 936 |
| §9 P-46 类别化敌军 | 251 | §13.4 建筑密度 + Boss 加成 | 487 | §23.5 三处迷彩缺陷 | 948 |
| §10 道路曲线化 + 预烘焙 | 268 | §14 strip 设计预留 | 501 | §23.6 顺带修掉的两处 | 954 |
| §10.1 路网重做 #B7 | 278 | §14.1 节点形态与尺寸 | 511 | §23.7 v2 基线 | 959 |
| | | §14.2 strip 片拼接 | 517 | §23.8 v3 跨部件检查 | 965 |
| | | §14.3 防线式敌人生成 | 527 | §24 生存模式 + 道路净空 | 989 |
| | | §14.4 渲染与工程配套 | 535 | §24.1 同一套 strip 链 | 994 |
| | | §14.5 结算与推进 | 550 | §24.2 多行片 chunkRows | 1004 |
| | | §14.6 测试重锚清单 | 555 | §24.3 道路上无房屋树木 | 1013 |
| | | §14.7 第二阶段预留 | 559 | §24.4 校准基线 | 1023 |
| | | §15 防线式推进体系 | 565 | §24.5 回归覆盖 | 1027 |
| | | §15.1 设计动机 | 572 | §25 地面烘焙 + 相机对齐 | 1034 |
| | | §15.2 分桶与间距 | 576 | §25.1 成因一 每帧重画 | 1042 |
| | | §15.3 锚点来源与优先级 | 583 | §25.2 成因二 亚像素 | 1072 |
| | | §15.4 敌人数 | 597 | §25.3 回归覆盖 | 1098 |
| | | §15.5 兜底补满约束 | 607 | §25.4 biomeZones 2 维化 | 1111 |
| | | §15.6 Boss 节点与回退 | 611 | §26 道路单弓形弯 | 1122 |
| | | §15.7 路口沙包越界 | 617 | §26.1 根因 | 1129 |
| | | §15.8 回归锚点 | 621 | §26.2 单弓形修法 | 1136 |
| | | §15.9 增援只补前方 | 625 | §26.3 参数收口 | 1144 |
| | | §15.10 推进完成条件 | 633 | §26.4 实测与回归 | 1153 |
| | | §15.11 Boss 循环 | 649 | §27 2026-10-20 批次 | 1163 |
| | | §16 难度成长曲线 | 656 | §27.1 coverWorldScale 补 building | 1170 |
| | | §17 #1 地图生成重做 | 669 | §27.2 出生点判据 + 液态排除 | 1178 |
| | | §17.1 总体原则 | 677 | §27.3 水域收尾顺序 | 1198 |
| | | §17.2 道路 | 682 | §27.4 未注册 tier 兜底 | 1208 |
| | | §17.3 河流 | 691 | §27.5 directionTolerance + 缓存 | 1217 |
| | | §17.4 建筑 | 696 | §27.6 死配置清理 | 1224 |
| | | §17.5 地形与 Biome | 701 | §27.7 回归覆盖 | 1250 |
| | | §17.6 地图尺寸与缩放 | 712 | §28 掩体归并视图 | 1256 |
| | | §17.7 出生点 | 720 | §28.1 掩体主题分布 | 1261 |
| | | §17.8 性能要求 | 729 | §28.2 tier → 行为 → 所在节 | 1274 |
| | | §18 出图管线 | 737 | §28.3 一句话结论 | 1299 |
| | | §19 布点与修剪避路 | 755 | | |

## 节 → 页映射（拆分结果，全 119 条编号标题逐条对应）

> 「状态」列三态：**现行/沿革**（正文在目标页）、**未落地待办**（只在 `map/changelog.md` 的未落地区）、**设计预留**（`map/strip-defense.md` 标「未落地」，同时留档于 changelog）。

| 原节 | 标题 | 目标页 | 状态 |
|---|---|---|---|
| §0 | 主题索引（按问题查，不按章节序读） | [index.md](../specs/map/index.md)（重写为卷首页主题表） | 现行/沿革 |
| §1 | 节点地图与大世界架构 | [map-architecture.md](../specs/map/map-architecture.md#节点地图与大世界架构) | 现行/沿革 |
| §2 | 地图元素体系 (Cover Tiers) | [cover-system.md](../specs/map/cover-system.md#掩体-tier-全集与元素表) | 现行/沿革 |
| §3 | 掩体核心机制细节 | [cover-system.md](../specs/map/cover-system.md#掩体核心机制) | 现行/沿革 |
| §4 | 贴图资产与烘焙层 (js/tank_assets.js) | [textures.md](../specs/map/textures.md#贴图资产与烘焙层) | 现行/沿革 |
| §5 | 地形类型抽象 (Terrain-Type Abstraction) | [terrain.md](../specs/map/terrain.md#地形类型抽象) | 现行/沿革 |
| §5.1 | 统一属性 schema | [terrain.md](../specs/map/terrain.md#属性-schema-与取值域) | 现行/沿革 |
| §5.2 | 具体地形映射（设计视图） | [terrain.md](../specs/map/terrain.md#地形到-tier-的映射) | 现行/沿革 |
| §5.3 | 河流作为连通多段地形 | [terrain.md](../specs/map/terrain.md#河流作为连通多段地形) | 现行/沿革 |
| §5.4 | 其他需补充内容（落地前 checklist） | [changelog.md](../specs/map/changelog.md#54-落地前-checklist未落地待办) | **未落地待办** |
| §5.5 | 地貌 Biome 与环境贴图美术规范 | [terrain.md](../specs/map/terrain.md#biome-美术规范) | 现行/沿革 |
| §5.6 | P-40 地形类型抽象落地注记（2026-08-24） | [terrain.md](../specs/map/terrain.md#p-40-地形类型抽象落地注记) | 现行/沿革 |
| §5.7 | 批次⑤ 落地注记（2026-08-24） | [terrain.md](../specs/map/terrain.md#批次五落地注记) | 现行/沿革 |
| §5.8 | 批次⑥ 落地注记（2026-08-24） | [terrain.md](../specs/map/terrain.md#批次六落地注记) | 现行/沿革 |
| §6 | 地图元素与生成更新（2026-09 落地） | [terrain.md](../specs/map/terrain.md#地图元素与生成更新) | 现行/沿革 |
| §7 | A17 生成期 LoS 走廊 + 运行期绕行 | [terrain.md](../specs/map/terrain.md#los-走廊与运行期绕行) | 现行/沿革 |
| §8 | 节点布局难度校准（2026-08-26） | [map-architecture.md](../specs/map/map-architecture.md#节点布局难度校准) | 现行/沿革 |
| §9 | P-46 类别化敌军与生成机制优化 | [map-architecture.md](../specs/map/map-architecture.md#类别化敌军与生成机制) | 现行/沿革 |
| §10 | 道路曲线化 + 预烘焙 + 跨相重叠消解 | [roads.md](../specs/map/roads.md#道路曲线化与预烘焙) | 现行/沿革 |
| §10.1 | 路网重做：取消跳段 / 出界路头 / 抑制浅角互穿 | [roads.md](../specs/map/roads.md#路网重做取消跳段与路口感) | 现行/沿革 |
| §10.2 | 路口感 + 拓扑多样化（#B7 v2） | [roads.md](../specs/map/roads.md#路网重做取消跳段与路口感) | 现行/沿革 |
| §11 | 水域溺毙 + AI 避水（2026-09-14 落地） | [rivers.md](../specs/map/rivers.md#溺毙与-ai-避水) | 现行/沿革 |
| §11.1 | 河流可涉水化：三处修复（#U37） | [rivers.md](../specs/map/rivers.md#河流可涉水化三处修复) | 现行/沿革 |
| §11.1.1 | ① 贴图 vs 物理不一致的根因 | [rivers.md](../specs/map/rivers.md#贴图与物理不一致的根因) | 现行/沿革 |
| §11.1.2 | ② 河宽硬上限 `wadeMaxWidth = 260` | [rivers.md](../specs/map/rivers.md#河宽硬上限) | 现行/沿革 |
| §11.1.3 | ③ AI 敢涉水（river 与 water 分档） | [rivers.md](../specs/map/rivers.md#ai-敢涉水) | 现行/沿革 |
| §11.1.4 | 回归覆盖 | [rivers.md](../specs/map/rivers.md#回归覆盖) | 现行/沿革 |
| §12 | 掩体体系收敛（2026-09-20 #E1/#E3） | [cover-system.md](../specs/map/cover-system.md#掩体体系收敛) | 现行/沿革 |
| §12.1 | tier 表现行口径（唯一事实源） | [cover-system.md](../specs/map/cover-system.md#tier-表现行口径) | 现行/沿革 |
| §12.2 | 弹道拦截模型：确定性唯一入口 | [cover-system.md](../specs/map/cover-system.md#确定性弹道拦截) | 现行/沿革 |
| §12.3 | 路网 v3：去横平竖直 + 加宽 + 加速 | [roads.md](../specs/map/roads.md#路网-v3-与沿路建筑) | 现行/沿革 |
| §12.4 | 建筑沿路/路口聚集 + 路口沙包 | [roads.md](../specs/map/roads.md#路网-v3-与沿路建筑) | 现行/沿革 |
| §12.5 | 难度校准重锚（第一次） | [roads.md](../specs/map/roads.md#路网-v3-与沿路建筑) | 现行/沿革 |
| §13 | 路网 v4 + 可破坏楼房（#G3/#G4） | [roads.md](../specs/map/roads.md#路网-v4-七拓扑) | 现行/沿革 |
| §13.1 | 路网 v4：新增两种街区拓扑 + 删除浅角拓扑 | [roads.md](../specs/map/roads.md#路网-v4-七拓扑) | 现行/沿革 |
| §13.2 | 可破坏楼房 tier `building` + 建筑混合 | [roads.md](../specs/map/roads.md#可破坏楼房-building) | 现行/沿革 |
| §13.3 | 难度校准重锚（第二次） | [roads.md](../specs/map/roads.md#可破坏楼房-building) | 现行/沿革 |
| §13.4 | 建筑密度再提升 + Boss 战图加成（#I3） | [roads.md](../specs/map/roads.md#建筑密度与-boss-战图加成) | 现行/沿革 |
| §14 | 横向卷轴（strip）节点 —— 设计预留 | [strip-defense.md](../specs/map/strip-defense.md#落地状态先看这里) | **设计预留** |
| §14.1 | 节点形态与尺寸 | [strip-defense.md](../specs/map/strip-defense.md#strip-节点形态与尺寸) | 现行（已落地） |
| §14.2 | strip 构造（片拼接） | [strip-defense.md](../specs/map/strip-defense.md#片拼接构造) | 现行（已落地） |
| §14.3 | 防线式敌人生成（取代全向环带） | [strip-defense.md](../specs/map/strip-defense.md#防线式敌人生成设计原稿) | **已被 §15 取代** |
| §14.4 | 渲染与工程配套 | [strip-defense.md](../specs/map/strip-defense.md#渲染与工程配套) | 现行（已落地） |
| §14.5 | 结算与推进 | [strip-defense.md](../specs/map/strip-defense.md#结算与推进设计原稿) | **已被 §15.10 取代** |
| §14.6 | 测试重锚清单 | [strip-defense.md](../specs/map/strip-defense.md#测试重锚清单) | 部分落地 |
| §14.7 | 第二阶段预留（不限于横线） | [strip-defense.md](../specs/map/strip-defense.md#第二阶段预留) | **设计预留** |
| §15 | 防线式推进体系（B 档①②③） | [strip-defense.md](../specs/map/strip-defense.md#防线式推进体系) | 现行/沿革 |
| §15.1 | 设计动机 | [strip-defense.md](../specs/map/strip-defense.md#设计动机) | 现行/沿革 |
| §15.2 | 分桶与间距 | [strip-defense.md](../specs/map/strip-defense.md#防线参数与锚点) | 现行/沿革 |
| §15.3 | 锚点来源与优先级 | [strip-defense.md](../specs/map/strip-defense.md#防线参数与锚点) | 现行/沿革 |
| §15.4 | 敌人数（现行值） | [strip-defense.md](../specs/map/strip-defense.md#敌人数与兜底) | 现行/沿革 |
| §15.5 | 兜底补满的防线约束 | [strip-defense.md](../specs/map/strip-defense.md#敌人数与兜底) | 现行/沿革 |
| §15.6 | Boss 节点与回退路径 | [strip-defense.md](../specs/map/strip-defense.md#boss-节点与回退路径) | 现行/沿革 |
| §15.7 | 附带修复：路口沙包越界 | [strip-defense.md](../specs/map/strip-defense.md#路口沙包越界修复与回归) | 现行/沿革 |
| §15.8 | 回归锚点 | [strip-defense.md](../specs/map/strip-defense.md#路口沙包越界修复与回归) | 现行/沿革 |
| §15.9 | 增援只补前方未清空防线 | [strip-defense.md](../specs/map/strip-defense.md#增援与前向约束) | 现行/沿革 |
| §15.10 | 推进式节点完成条件 | [strip-defense.md](../specs/map/strip-defense.md#推进式节点完成条件) | 现行/沿革 |
| §15.11 | Boss 循环（#K3） | [strip-defense.md](../specs/map/strip-defense.md#boss-循环) | 现行/沿革 |
| §16 | 敌人难度成长曲线调优 | [difficulty.md](../specs/map/difficulty.md#难度成长曲线) | 现行/沿革 |
| §17 | #1 地图生成重做（设计要求） | [difficulty.md](../specs/map/difficulty.md#地图生成重做总则) | 现行/沿革 |
| §17.1 | 总体原则 | [difficulty.md](../specs/map/difficulty.md#地图生成重做总则) | 现行/沿革 |
| §17.2 | 道路 | [difficulty.md](../specs/map/difficulty.md#道路与河流) | 现行/沿革 |
| §17.3 | 河流 | [difficulty.md](../specs/map/difficulty.md#道路与河流) | 现行/沿革 |
| §17.4 | 建筑 | [difficulty.md](../specs/map/difficulty.md#biome-与泥潭) | 现行/沿革 |
| §17.5 | 地形与 Biome | [difficulty.md](../specs/map/difficulty.md#biome-与泥潭) | 现行/沿革 |
| §17.6 | 地图尺寸与缩放 | [difficulty.md](../specs/map/difficulty.md#尺寸出生点与性能) | 现行/沿革 |
| §17.7 | 出生点 | [difficulty.md](../specs/map/difficulty.md#尺寸出生点与性能) + [generation-cleanup.md](../specs/map/generation-cleanup.md#出生点判据与液态地形排除) | 现行/沿革 |
| §17.8 | 性能要求 | [difficulty.md](../specs/map/difficulty.md#尺寸出生点与性能) | 现行/沿革 |
| §18 | 贴图资产出图管线 | [textures.md](../specs/map/textures.md#出图管线) | 现行/沿革 |
| §19 | 布点/修剪避路收紧（#U32） | [roads.md](../specs/map/roads.md#布点与修剪避路) | 现行/沿革 |
| §20 | strip 河流互斥与避路收尾（#U33） | [rivers.md](../specs/map/rivers.md#strip-河流互斥) | 现行/沿革 |
| §21 | 河道形态：删支流 + 沿程宽度（#U34） | [rivers.md](../specs/map/rivers.md#河道形态与沿程宽度) | 现行/沿革 |
| §22 | 贴图与阴影质量（#TEX6~9/TEX11） | [textures.md](../specs/map/textures.md#贴图与阴影质量) | 现行/沿革 |
| §22.1 | 坦克纹理（`TEXTURE_DEFS`，14 键） | [textures.md](../specs/map/textures.md#纹理与缓存) | 现行/沿革 |
| §22.2 | 贴图缓存键与 LRU | [textures.md](../specs/map/textures.md#纹理与缓存) | 现行/沿革 |
| §22.3 | 阴影：光源必须世界固定 | [textures.md](../specs/map/textures.md#阴影与立体感) | 现行/沿革 |
| §22.4 | 植被烘焙 | [textures.md](../specs/map/textures.md#植被与地面材质) | 现行/沿革 |
| §22.5 | 地面材质（`_paintGroundTexture`） | [textures.md](../specs/map/textures.md#植被与地面材质) | 现行/沿革 |
| §22.5b | `drawImage` 在离线图与浏览器不可互换 | [textures.md](../specs/map/textures.md#植被与地面材质) | 现行/沿革 |
| §22.6 | mini-canvas 语义对齐 | [textures.md](../specs/map/textures.md#植被与地面材质) | 现行/沿革 |
| §22.7 | 回归保护（`test-render.js`） | [textures.md](../specs/map/textures.md#植被与地面材质) | 现行/沿革 |
| §22.8 | 立体感（2.5D 高度与方向光） | [textures.md](../specs/map/textures.md#阴影与立体感) | 现行/沿革 |
| §23 | 坦克贴图审核标准（v2 + v3） | [textures.md](../specs/map/textures.md#贴图审核标准) | 现行/沿革 |
| §23.1 | 两条前置事实 | [textures.md](../specs/map/textures.md#贴图审核标准) | 现行/沿革 |
| §23.2 | 八条指标 | [textures.md](../specs/map/textures.md#贴图审核标准) | 现行/沿革 |
| §23.3 | 按设计意图分类评分 | [textures.md](../specs/map/textures.md#贴图审核标准) | 现行/沿革 |
| §23.4 | 指标设计的三次返工记录 | [textures.md](../specs/map/textures.md#贴图审核标准) | 现行/沿革 |
| §23.5 | 三处迷彩缺陷与修法 | [textures.md](../specs/map/textures.md#贴图审核标准) | 现行/沿革 |
| §23.6 | 顺带修掉的两处 | [textures.md](../specs/map/textures.md#贴图审核标准) | 现行/沿革 |
| §23.7 | v2 当前基线 | [textures.md](../specs/map/textures.md#贴图审核标准) | 现行/沿革 |
| §23.8 | v3 跨部件 / 跨实例 / 沿边检查 | [textures.md](../specs/map/textures.md#贴图审核标准) | 现行/沿革 |
| §24 | 生存模式地图生成 + 道路净空（#U35） | [survival-strip.md](../specs/map/survival-strip.md#生存模式生成链) | 现行/沿革 |
| §24.1 | 生存模式：同一套 strip 生成链 | [survival-strip.md](../specs/map/survival-strip.md#生存模式生成链) | 现行/沿革 |
| §24.2 | 多行片（`opts.chunkRows`） | [survival-strip.md](../specs/map/survival-strip.md#多行片-chunkrows) | 现行/沿革 |
| §24.3 | 道路上不得有房屋、树木 | [survival-strip.md](../specs/map/survival-strip.md#道路上不得有房屋树木) | 现行/沿革 |
| §24.4 | 校准基线 | [survival-strip.md](../specs/map/survival-strip.md#校准与回归) | 现行/沿革 |
| §24.5 | 回归覆盖 | [survival-strip.md](../specs/map/survival-strip.md#校准与回归) | 现行/沿革 |
| §25 | 地面层视口锚定烘焙 + 相机像素对齐（#GT） | [ground-camera.md](../specs/map/ground-camera.md) | 现行/沿革 |
| §25.1 | 成因一：每帧重画世界锚定纹理 | [ground-camera.md](../specs/map/ground-camera.md#成因一每帧重画地面纹理) | 现行/沿革 |
| §25.2 | 成因二：亚像素重采样 | [ground-camera.md](../specs/map/ground-camera.md#成因二亚像素重采样) | 现行/沿革 |
| §25.3 | 回归覆盖（`test-render.js` ⑨） | [ground-camera.md](../specs/map/ground-camera.md#回归覆盖) | 现行/沿革 |
| §25.4 | biomeZones 升级为 2 维矩形（#U36） | [ground-camera.md](../specs/map/ground-camera.md#biomezones-2-维化) | 现行/沿革 |
| §26 | 道路单弓形弯（#U45） | [roads.md](../specs/map/roads.md#道路单弓形弯) | 现行/沿革 |
| §26.1 | 根因 | [roads.md](../specs/map/roads.md#道路单弓形弯) | 现行/沿革 |
| §26.2 | 修法：单一弓形弯 | [roads.md](../specs/map/roads.md#道路单弓形弯) | 现行/沿革 |
| §26.3 | 参数收口（`RULES.nodeMap.road`，唯一口径） | [roads.md](../specs/map/roads.md#参数收口) | 现行/沿革 |
| §26.4 | 实测与回归 | [roads.md](../specs/map/roads.md#道路单弓形弯) | 现行/沿革 |
| §27 | 2026-10-20 批次现行口径 | [generation-cleanup.md](../specs/map/generation-cleanup.md#本批定位) | 现行/沿革 |
| §27.1 | `coverWorldScale` 补 `building` | [generation-cleanup.md](../specs/map/generation-cleanup.md#coverworldscale-补-building) | 现行/沿革 |
| §27.2 | 出生点判据与液态地形排除 | [generation-cleanup.md](../specs/map/generation-cleanup.md#出生点判据与液态地形排除) | 现行/沿革 |
| §27.3 | 水域收尾顺序 + 真多边形判定 | [generation-cleanup.md](../specs/map/generation-cleanup.md#水域收尾顺序与真多边形判定) | 现行/沿革 |
| §27.4 | 两套「未注册 tier」兜底语义 | [generation-cleanup.md](../specs/map/generation-cleanup.md#未注册-tier-的两套兜底语义) | 现行/沿革 |
| §27.5 | `directionTolerance` + `coverEnvelope` 缓存 | [generation-cleanup.md](../specs/map/generation-cleanup.md#directiontolerance-与缓存) | 现行/沿革 |
| §27.6 | 死配置清理与一处误判纠正 | [generation-cleanup.md](../specs/map/generation-cleanup.md#死配置清理与一处误判纠正) | 现行/沿革 |
| §27.7 | 回归覆盖 | [generation-cleanup.md](../specs/map/generation-cleanup.md#回归覆盖) | 现行/沿革 |
| §28 | 掩体体系主题归并视图 | [index.md](../specs/map/index.md#tier-速查18-键)（并入卷首页） | 已并入 |
| §28.1 | 掩体主题在本卷的全部分布 | [index.md](../specs/map/index.md#从这里开始) | 已并入 |
| §28.2 | tier → 行为 → 现行口径所在节 | [index.md](../specs/map/index.md#tier-速查18-键) | 已并入 |
| §28.3 | 一句话结论 | [index.md](../specs/map/index.md#tier-速查18-键) | 已并入 |
