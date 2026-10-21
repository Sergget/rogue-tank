# 掩体体系

> **摘要**：掩体 tier 全集、弹道/通行/视线三套判定、确定性拦截与半高掩体移除的现行口径。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/map.md` §2 / §3 / §12（2026-10-21 拆分）
> **相关**：[地形抽象与生成](./terrain.md) · [路网](./roads.md) · [纹理与烘焙](./textures.md) · [沿革与未落地](./changelog.md)

## 目录
- [掩体 tier 全集与元素表](#掩体-tier-全集与元素表)
- [掩体核心机制](#掩体核心机制)
- [掩体体系收敛](#掩体体系收敛)
- [tier 表现行口径](#tier-表现行口径)
- [确定性弹道拦截](#确定性弹道拦截)

## 掩体 tier 全集与元素表

（原 §2）

参数权威收口于 RULES.coverTiers：

> **现行口径指针**：本表为 2026-09 早期版本，其中 `half`（半高掩体）与「越掩插值/exposure 概率遮挡」等列已被 [tier 表现行口径](#tier-表现行口径) 取代（half tier 已整体删除）；可破坏楼房 `building` 见 [可破坏楼房](./roads.md#可破坏楼房-building)（原 §13.2）。以 [tier 表现行口径](#tier-表现行口径) 为现行口径。
> **2026-10-21 补正**：「视线遮挡」列的 `full` 一格原写「不遮」，与 `RULES.coverTiers.full.vision = true` 不符（代码实测），已改「遮挡视线」。tier **全集 18 键**（含原表未列的 `rock`/`stump`/`intact`/`perm_block`/`bridge`）的逐键索引见 [卷首页 tier 速查](./index.md#tier-速查18-键)。

| 元素 | tier | 弹道交互 | 坦克通行 | 视线遮挡 | 残骸链 |
|---|---|---|---|---|---|
| 半高掩体 | half | **已删除**——tier 不再存在 | — | — | — |
| 全高掩体 | full | 100% 确定性格挡 | 阻挡推出 | 遮挡视线（2026-10-21 补正） | ∞ |
| 可破坏楼房 | building | 100% 确定性格挡（耐久 3） | 阻挡推出 | 遮挡视线 | 3 发 → ruined → 1 发 → rubble |
| 残破建筑 | ruined | 100% 确定性格挡（耐久 1） | 0.6 减速通过 | 遮挡视线 | 1 发 → rubble |
| 灌木丛 | bush | 穿透（不挡弹） | 自由通行 | 阻挡 AI 视线 | ∞ |
| 树木 | tree | 树干 1 发截停 | 阻挡推出（可推倒） | 树冠遮挡视线 | 1 发/碾压 → fallen |
| 倒树 | fallen | 穿透 | 自由通行 | 树冠遮挡视线 | 终态纯视觉残留 |
| 栅栏 | soft | 穿透（穿透即毁） | 0.45 减速通过，压过即毁 | 不遮 | 无残骸 |
| 沙袋路障 | barricade | 挡 1 发即毁（**2026-10-15 #12 起不跳弹**） | 压过即毁 | 不遮 | 1 发/碾压 → rubble |
| 碎石 | rubble | **不挡弹** | 压过即毁 | 不遮 | 终态 |

### 掩体世界缩放唯一口径 coverWorldScale

**这是本卷 `coverWorldScale` 的唯一一处「= 值」，其它页一律链接到本节。**

```js
// RULES.nodeMap.coverWorldScale（js/tank_rules.js:593，代码实测 2026-10-21）
{ half: 0.42, full: 0.42, building: 0.42, barricade: 0.32 }
```

- **代码里是四个键、其中 `half` 已无消费方**：`full` / `building` / `barricade` 三个键被 `js/tank_nodegen.js` 实际读取；`half` 键为历史残留（`half` tier 已于 2026-09-20 删除），保留不影响行为、也**不得据此认为「存在半高掩体」**。`building`（可破坏楼房）与 `full` **同系数**＝「同为建筑体量」；`barricade` 单独一档（更小）。
- **`building` 键缺失是实质性错误**：`js/tank_nodegen.js:3308` 的 `sizeFactor` 在 `typeof coverWorldScale[tier] !== 'number'` 时回落 **1**（不减算）⇒ 楼房世界尺寸会比 `full` 大约 **2.4 倍**（= 1 ÷ full 系数）。这正是 2026-10-20 #W18-1 修掉的缺陷（见 [生成清理 · coverWorldScale 补 building](./generation-cleanup.md#coverworldscale-补-building)）。
- **消费方式**：`js/tank_nodegen.js` 生成期按 `coverWorldScale[tier]` 逐元素乘算世界尺寸；未列出的地形/植被 tier 不受影响（树另乘 `RULES.nodeMap.treeWorldScale`，见 [tier 表现行口径](#tier-表现行口径)）。
- **沿革（不静默删除）**：2026-08-26 #77 当时值为 `half 0.55 / full 0.58 / barricade 0.40`（无 `building` 键——该 tier 2026-09-21 才随 [可破坏楼房](./roads.md#可破坏楼房-building) 引入），**已被上表取代**；2026-09-21 #G4 补 `building`，2026-10-20 #W18-1 确认取值同源。

## 掩体核心机制

（原 §3）

- **越掩插值（C 实验）——已作废（2026-09-20 #E3）**：~~射线高度在炮口（medium 1.8m/heavy 2.2m）与目标部位中心间线性插值；攻击方贴近半高掩体（距入口 < 约1/3射程）时射线高于掩体顶（1.4m）→ 越掩 exposure=1.0。~~ **半高掩体 `half` tier 与 `RULES.heights.cover.half` 已整体删除**，现行拦截模型是确定性的、无任何越掩插值。本条仅存实验期沿革。
- **方向判据 cutoff**：掩体必须被弹道在命中目标前完整穿过（出口距离 < 命中距离+16px 容差）才参与遮挡；骑上掩体的坦克不会获得全向遮蔽。
- **炮管穿墙防御**：gunRoot→gunTip 物理线段与 solid/single 掩体相交时，开火在交点处拦截（damageCover 1点 + 特效），堵死"炮管穿墙无伤射击"漏洞。飞行动画起点归一 gunRoot。
- **任意多边形几何**：covers 实例带 verts 时全角点走 polyCorners；凹多边形支持 collisionVerts 多凸包化合物碰撞（SAT/OBB），解决 L 形口袋卡模问题。

## 掩体体系收敛

（原 §12，2026-09-20 #E1/#E3 用户裁定）

**用户反馈**：① 炮弹仍然被不可见物体拦截；③ 全高掩体明确衍生为建筑、岩石，半高掩体相关计算代码全部移除不再使用。

> 本节后半（路网 v3 / 沿路建筑与路口沙包 / 校准重锚）虽挂在本节编号下，内容属路网与生成，正文已迁至 [路网 · 参数收口](./roads.md#参数收口) 与 [路网 · 建筑密度](./roads.md#建筑密度与-boss-战图加成)。

### tier 表现行口径

（原 §12.1，唯一事实源 `RULES.coverTiers`）

- **`half`（半高掩体）tier 定义已删除**——`RULES.coverTiers.half` 不再存在；`RULES.heights.cover.half`（旧 1.4m 越掩高度）一并删除。**（2026-10-21 补正：`RULES.heights` 整个体系已于 2026-10-19 #9 退役（`js/tank_geometry.js` `getPartZRange` 改按部位直接判定），不只是 `cover.half` 一个键。代码实测 `RULES.heights === undefined`。）**
- **tier 全集 18 键**（2026-10-21 代码实测 `RULES.coverTiers`，按 `tierGroup`）：

  | tierGroup | 键 |
  |---|---|
  | `structure` | `full` / `building` / `intact` / `ruined` / `rock` / `perm_block` / `barricade` / `soft` / `stump` / `rubble` / `bridge` |
  | `foliage` | `tree` / `fallen` / `bush` |
  | `liquid` | `water` / `river` |
  | `ground` | `mud` / `road` |

  其中 `perm_block` / `intact` / `bridge` **当前无任何生成器产出**（`generateNode` 132 节点实测 0 次），仅作旧存档/基线兼容。**注意 `perm_block` 的 `shellBlock` 是字符串 `'solid'`、派生 `mode:'none'`，弹道拦截侧实际不拦弹**——详见 [地形抽象 · 属性 schema](./terrain.md#属性-schema-与取值域)；逐键行为索引见 [卷首页 tier 速查](./index.md#tier-速查18-键)。
- **`full` 的 label 改为「建筑」**（全高掩体的具体化）；`rock`（岩石）保持 `solid + full + passability 0`。二者即「全高掩体」的全部具象。
- **`ruined`（残破建筑）归入全高掩体**：`shellBlock: true` / `exposureProfile: 'full'`（旧 `'grad' + 'half'`）——直射实弹 100% 确定性格挡（含炮塔），击毁后转 `rubble` 残骸。
- **`stump`（树桩）/ `rubble`（碎石）改为不挡弹**：`shellBlock: false` / `exposureProfile: 'none'`（旧 `'grad'`）。二者 `passability` 为 **0.6**（减速通过，非「压过即毁」的那种自由通行）。
- **`tree`（树）改为可被坦克推倒**：`crushable: true`（旧 false）——坦克压过即 `tree → fallen`（与炮弹 1 发伐倒同一残骸链）。树木世界尺寸另乘 `RULES.nodeMap.treeWorldScale`（默认 0.6，主循环与林地簇同源）。
- **通行系数按档位分三组，别记混**：① 硬阻断（0）：`rock` / `perm_block`；② 减速通行（<1 且 >0）：`soft`、`stump`/`rubble`/`ruined`、`water`/`river`/`mud` 三档；③ 自由通行（1）：其余。**每一档的具体系数以 `RULES.coverTiers[tier].passability` 为唯一口径**，本节不逐一复写数值。

### 确定性弹道拦截

（原 §12.2，#E1 根因修复）

旧实现的拦截链有三处「不可见拦截」来源，**整链删除**（`js/tank_fire.js` 顶部注记保留根因说明）：

| 来源 | 机制 | 处置 |
|---|---|---|
| ① 残骸逻辑体格远大于可见贴图 | `rubble` 逻辑 OBB 90×60 仅绘制 5 颗 2.2~4.2px 石子；`grad` 剖面 + 中坦 exposure=0 ⇒ 100% 拦停 | `stump`/`rubble` 改不挡弹 |
| ② `s.dec` 曝光缓存跨帧失效 | 缓存仅在跳弹时复位；掩体被摧毁后 `findCoversOnPath` 已跳过 `hp<=0`，仍按旧 exposure 拦停 ⇒ 炮弹停在目标车体命中点（隐形墙） | 删除 `s.dec` / `_decCoverId` / `shellVerticalDecision` 缓存链 |
| ③ 视野圈外实体不绘制却拦弹 | `entityHiddenByVision` 跳过绘制，但 `stepShells` 对全部 `entities` raycast ⇒ 不可见车体拦弹 | 接入层经 `fireCtx.hiddenByVision` 注入判定，弹道命中扫描跳过不可见实体 |

**现行口径**：炮弹只被**确定性**掩体拦截——`shellBlock===true`（建筑/岩石/树/残破建筑，在掩体**入口点**截停）与 `'single'`（沙袋，挡 1 发即毁）。`shellBlock: 'grad'` 不再是合法取值（`normalizeCoverTiers` 派生同步收敛）；水/河/泥/路/栅栏/残骸/灌木/倒树一律越飞。`getExposure` 保留为视线/预测用纯函数，但不再有 `half` 越掩插值（`RULES.coverRules.mediumHullExposure/heavyHullExposure` 删除）。

> **2026-10-21 补正（沙袋跳弹口径）**：本节原文写「`'single'`（沙袋，挡 1 发 / >70° 可跳弹）」，与 `js/tank_fire.js` 现行实现不符——`bestCover` 命中路径里 `tier.mode === 'single'` 分支是「**不跳弹，直接 `dmgCover` 摧毁**」（`js/tank_fire.js:1107-1108`，注记 #12，2026-10-15 用户裁定「沙袋为软质掩体」）。`70°` 是**装甲跳弹角基准**（`RULES.ballistics.bounceAngle`，按弹种 `ammoTypes.*.bounceAngle` 覆盖），只作用于**坦克装甲命中**，不是掩体命中。现行为：沙袋一律不跳弹。

## 相关页面
- [地形抽象与生成](./terrain.md) — `shellBlock`/`passability` 的取值域与地形→tier 映射
- [路网](./roads.md) — §12.3/§12.4 的路网 v3、沿路建筑与路口沙包的现行值
- [卷首页 · tier 速查](./index.md#tier-速查18-键) — 18 个 tier 逐键行为与所在页
- [沿革与未落地](./changelog.md) — 半高掩体时代的原文与 §5.4 待办清单
