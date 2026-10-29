# 掩体体系

> **摘要**：掩体 tier 全集、弹道/通行/视线三套判定、确定性拦截与半高掩体移除的现行口径。
> **适用版本**：现行（2026-10-29；新增「移动阻断判据与前向探测原语」）
> **源自**：`docs/specs/map.md` §2 / §3 / §12（2026-10-21 拆分）
> **相关**：[地形抽象与生成](./terrain.md) · [路网](./roads.md) · [纹理与烘焙](./textures.md) · [沿革与未落地](./changelog.md)

## 目录
- [掩体 tier 全集与元素表](#掩体-tier-全集与元素表)
- [掩体核心机制](#掩体核心机制)
- [掩体体系收敛](#掩体体系收敛)
- [tier 表现行口径](#tier-表现行口径)
- [hull-down 遮挡参与面（2026-10-30 口径澄清）](#hull-down-遮挡参与面2026-10-30-口径澄清)
- [移动阻断判据与前向探测原语（B1，2026-10-29）](#移动阻断判据与前向探测原语b12026-10-29)
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

## 直线掩体（wall / wall_breakable）：取代栅栏与沙袋（2026-10-22）

**用户裁定**：「删除现有的栅栏、沙包元素。全部改为掩体（单直线，射击多种不同的贴图），掩体两侧的坦克射击可以命中掩体另一侧比自己离掩体更远坦克的炮塔和车体、只能命中另一侧更近坦克的炮塔，分为不可摧毁和可摧毁，可摧毁的掩体可承受一定的伤害后消失」。

### tier 定义（唯一数值口径 = `RULES.coverTiers`）

| tier | label | passability | shellBlock | destructible / hp | vision | height (m) | drawStyle | wallStyle |
|---|---|---|---|---|---|---|---|---|
| `wall` | 掩体 | **0**（不可通行，只能绕） | `wall` | `null` / **Infinity**（不可摧毁） | true | **1.4** | `wall` | `concrete`（生成期按 biome 随机分配六种之一） |
| `wall_breakable` | 可摧毁掩体 | **0** | `wall` | **4**（承受 4 发后**直接消失**，`toTier: null` 不降级残骸） | true | **1.4** | `wall` | `sandbag` |

> **`height`（米）列是 2026-10-24 #P1/I1 新增的「视线遮挡分档唯一口径」**：某掩体挡住视线 ⇔ `height ≥ min(eyeZ, targetZ)`。
> 分档语义：`0` = 纯地面/水面（不参与视线）；`< 2.3` = 只挡车体（observed at `LOS_HULL_Z`=1.0m）；`≥ 2.3` = 全挡（可遮炮塔）。
> 全 18 键取值见 `RULES.coverTiers`；`hasLineOfSight` 消费，见 [视野-隐蔽与伪 3D 兼容性 §9](./vision-stealth-3d-compat.md#9-落地记录2026-10-24p1)。

**已删除**：`soft`（栅栏，原 passability 0.45 / shellBlock false / destructible 1）与 `barricade`（沙袋路障，原 shellBlock 为 single 挡 1 发）两个 tier **整体下线**。老存档/旧基线的这两个 tier 由 `snapshotCovers` 的 `_normalizeCoverTierKey` 映射（soft→wall、barricade→wall_breakable、未注册 tier→wall）。

### 导弹越障标记 `missileOverfly`（2026-10-23 用户裁定）

用户原话：「线导反坦克导弹默认可以越过当前配置的掩体（不是建筑、岩石等）」+「锁定式导弹仅 50% 几率可飞过去」。

`RULES.coverTiers[tier].missileOverfly === true` 的 tier 可被**发射时掷骰成功**的导弹越过（弹体 `s.overflyLow`；概率口径 `RULES.missiles.wire.overflyChance = 1.0` / `RULES.missiles.lock.overflyChance = 0.5`）：

| 可越（`missileOverfly: true`） | 不可越（无该标记） |
|---|---|
| `wall`（直线掩体）/ `wall_breakable`（沙袋）/ `tree`（树） | `building` / `intact` / `ruined` / `rock` / `perm_block` |

越障语义：这些 tier **不参与** `findCoversOnPath` 拦截、`wallPartBlock` 部位裁剪与部署掩体拦截（消费方 `js/tank_fire.js` stepShells 的 `overflyLow` 判定）。


### shellBlock=wall 的部位裁剪（新语义）

这是**第四种** shellBlock 取值（前三种：`true` 整发截停 / `single` 挡 1 发 / `false` 越飞）：不是简单挡弹，而是按「射手/目标各自到掩体直线的距离」裁剪可命中部位。判定唯一实现 = `js/tank_cover.js` 的纯函数 `wallPartBlock(cov, shooter, target)`：

1. **目标在另一侧且比射手更远** → 车体与炮塔**都可命中**（射界成立）；
2. **目标在另一侧且比射手更近** → **只能命中炮塔**（车体被墙挡住）；
3. **射手贴墙**（`dShooter <= RULES.coverRules.wallHugDist`，缺省 **22px**）→ 与 1 同效（贴墙有射界，这是「掩体后射击」的手感来源）。

消费方：`js/tank_fire.js stepShells` 在命中坦克前按整条弹道缓存 `_wallBlockCache` 过滤车体/炮塔命中（**必须按整条弹道判定，按步段查会在飞过墙后失效**）；全部被过滤则该墙段按入口截停。`getExposureWithHits` 对 `wall` 也走同一判据（炮塔 zMin≥1.2 恒露）。AI 侧：`tank_ai._wallTurretOnlyFiringLine` 让「只有炮塔可打」仍算有射界（`holdGate` 调用点做 OR）。

### 生成与贴图

- **单直线几何**：w=长度、h=厚度、angle=朝向，**不用 `verts` 多边形**。
- **俯视 2.5D（2026-10-22 修「贴图都是正视图」）**：六套贴图统一走 `wallFrame` 的俯视画框——
  **厚度方向只有「一层顶面 + 一条背光侧壁」**（侧壁厚 = T×26% 钳 [1.6, 5]），绝不堆多层；
  长轴方向才允许重复单元（伸缩缝/砖缝/板缝/桩位）。判据：正视图的特征是**厚度方向堆 2 层沙袋 / 多排砖**，
  俯视图的特征是**一个顶面 + 一条厚度带**。光源固定左上 ⇒ 顶面上缘受光、下缘露侧壁。
  **沿革（不静默删除）**：改前 sandbag 画 2 层堆叠、brick 画错缝砖块立面、steel 四角铆钉、concrete 上半亮下半暗
  ——全都是「正视图」读法；现 sandbag 改单层俯视袋阵、brick 改长轴砖缝 + 压顶线、steel 铆钉改沿长轴两排、
  concrete 改单一面 + 面内斑驳、hedgehog 铁丝改 1 条、barrier 收分只体现在长轴两端。
- **六套 `wallStyle`**（程序化烘焙，零外部图片，唯一表 `js/tank_assets.js`）：`concrete` 30% / `sandbag` 25% / `steel` 15% / `brick` 15% / `hedgehog` 10% / `barrier` 5%。按「节点 biome + 近路与否」确定性分配（同 seed 可复现），**同一节点内至少 3 种**。
- **可摧毁版破损表现**：按 hp / maxHp 分三级（>0.67 完好 / 0.34~0.67 裂纹 / <0.34 重度破损），在贴图上叠加裂纹线与缺口。
- **生成侧**：22 处模板 coverSpecs 的 soft/barricade 全部换成 wall/wall_breakable；`placeJunctionBarricades` 改名 `placeJunctionWalls`（旧名保留 alias）产出单直线掩体；难度互换改为「低难度多 wall_breakable（好破）→ 高难度多 wall（更硬）」。配置 `RULES.nodeMap.junctionBarricades`（breakableChance 0.45 / wallLenMin 62 / wallLenMax 96 / wallThick 26）。
- **尺寸收敛**：`RULES.nodeMap.coverWorldScale` 新增 wall 0.34 / wall_breakable 0.34 / perm_block 0.32。
- **`perm_block`（永久掩体）保留**：仍是 solid 语义（整发截停、不可摧毁），drawStyle 改为 `wall`、wallStyle `hedgehog`。

**回归影响**：strip 节点通道变窄（栅栏原可通行、沙袋只挡 1 发；现在两族都是不可通行的实体墙）⇒ `scripts/test-nodegen-calibration.js` 的 6 个 minPassage 基线已按实测重锚（corridor d0.5/0.7/0.9 = 3.6/3.1/3.1、forest_dense d0.5 = 0.6、crossfire_plaza d0.9 = 1.4、mixed_barrier_plaza d0.5 = 1.8）。

## hull-down 遮挡参与面（2026-10-30 口径澄清）

#AB18 的条件降档（`LOS_HULL_Z=1.0m`）作用于 **`needZ = min(eyeZ, targetZ)`**，因此**所有高度 ∈ [1.0, 2.3) 的 vision 掩体**都参与「目标静止+未开火」时的视线遮挡——不只是灌木：`bush 1.2` / **`wall 1.4` / `wall_breakable 1.4`** / `ruined 2.0` 全部在内。也就是说静止目标躲在**直线掩体**后面同样对 AI 隐身（移动/开火即炮塔露头）。此前文档只写「灌木挡车体」，口径窄于实现，本节补齐。细则归口 `specs/map/vision-stealth-3d-compat.md` §「hull-down 条件降档」。

## 移动阻断判据与前向探测原语（B1，2026-10-29）

**单一判据 `tierBlocksMove(tier)`**（`js/tank_cover.js`）：`passability === 0 || shellBlock === true | 'single'`，且 `crushable` 一律不阻断（树/树桩/碎石是「压过即倒」，不推车）。`resolveCoverCollisions` 与 `probeMoveBlocked` **共用这一个函数**——以前是内联表达式，AI 侧要再写一份必然漂移。逐 tier 行为由 `scripts/test-cover-probe.js` ① 段与 `resolveCoverCollisions` 的实际推出行为对照锁定（17 个 tier）。

**`probeMoveBlocked(t, heading, dist)`** —— 「往前走 dist 会不会撞」的纯查询，返回 `{ blocked, tier, nx, ny, hitDist }`：

- **只认掩体几何，绝不查 `entities`**（§4.160 的教训：出生点判定把实体自身算成障碍，误判了一整轮）。源码形状断言直接锁死这一条。
- 扫掠方式：车体 OBB 沿 heading 平移，取「起点四角 ∪ 终点四角」做 SAT。两个凸集之间「平移过程中是否相交」等价于「凸包是否相交」，而 SAT 对多余轴只会多算、不会漏判，所以直接复用 `obbOverlap`，无需显式求凸包。
- `nx/ny` 是命中处掩体表面**由掩体指向坦克**的归一化法线（`coverNormalAt` 返回的是边绕向法线，方向不固定，这里统一翻正）；`hitDist` 为首次接触距离（二分 8 次求得）。
- **不修改实体的任何字段**（纯查询）。

**`probeCellPassable(cx, cy, r, opts)`** —— 栅格通行采样，供 A* 航点寻路直接消费（2026-10-29 用户裁定：探测层必须同时能当栅格输入）。返回 `{ passable, tier, cost }`：不可通行 `cost=Infinity`；贴墙（放不下 `margin` 余量）`cost=1.6`；空旷 `cost=1`。与「把车摆在格心再 `probeMoveBlocked`」同口径（测试 ⑤ 段逐点对照）。

**回归**：`scripts/test-cover-probe.js`（判据同源 / 正前挡侧后不挡 / 距离阈值 / 实体不是地形 / 非阻断 tier 不误判 / 纯查询不写字段 / 栅格同口径）。

## 相关页面
- [地形抽象与生成](./terrain.md) — `shellBlock`/`passability` 的取值域与地形→tier 映射
- [路网](./roads.md) — §12.3/§12.4 的路网 v3、沿路建筑与路口沙包的现行值
- [卷首页 · tier 速查](./index.md#tier-速查18-键) — 18 个 tier 逐键行为与所在页
- [沿革与未落地](./changelog.md) — 半高掩体时代的原文与 §5.4 待办清单
