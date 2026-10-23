# 坦克设计器

> **摘要**：`tank_designer.html` 的几何编辑、双中心分离、炮管炮盾预设、属性耦合反馈与背景参考图。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/editor.md` §1（2026-10-21 拆分）
> **相关**：[对比页与字段架构表](./compare-schema.md) · [贴图与涂装视觉规范](./visual-spec.md) · [兼容索引](../editor.md)

## 多边形与装甲编辑

（原 §1 首条）

- **多边形顶点编辑**：车体/炮塔多边形自由编辑（半侧对称几何，`js/tank_halfgeom.js` 的 `halfFromFull` 镜像重建全形）；逐边装甲厚度设定（front/side/rear faces）。
- **甲弹对抗内置测试**：入射角/等效厚度/跳弹判定实时预览。
- **保存链路**：`POST /api/tanks/<id>` 写回 `tanks/<id>.json`；battle / compare 重载列表即生效。

## 双中心分离

（原 §1 第 2 条）

`turret.axis`（炮塔自身旋转轴，局部帧内）与 `turret.pivot`（绕车体旋转中心，相对车体）**完全分开**；运行时 `applyTankConfig` 归一化平移保证「局部原点 = 旋转轴」不变量；设计器提供**青色自身中心标记 + 橙色旋转中心标记 + 一键居中对齐**按钮，防旋转甩尾。

## 炮管/炮盾预设

（原 §1 第 3 条）

`js/tank_presets.js` 的 `BARREL_PRESETS` / `MANTLE_PRESETS` 表；`normalizeBarrel` 归一化（`len`/`width`/`muzzle`/`evac`/`jacket` 缺省兜底）。

> **2026-10-17 #U31 起同时透传 `imgStandard`/`imgAutocannon`/`imgRailgun`/`imgVehicle` 四个贴图路径键**——缺省会令设计器「读取→保存」永久删除炮管贴图引用（#L3 同类教训）。

## 模块/成员位置不再支持自定义

（2026-08-26 P-49 定案）

命中判定改为**几何分区 + 概率抽取**（规范见 [烘焙工具与模块分区](./bake-modules.md#p-49-模块成员概率分区) 与 [战斗规范 · 装甲、跳弹与模块伤害](../combat/armor-ricochet.md)），旧 JSON 的 `modules` 字段加载时**静默忽略**。

## 属性耦合链实时反馈

（2026-09-06）

设计器「基础参数」面板实时展示基于出厂几何与战斗参数推导的耦合结果：

- 穿深/单发伤害 → **装填时间与散布惩罚倍率**；
- 车体尺寸 → **最大可用马力上限**；
- 车体面积物理缩放 → **内部模块易损因子**（`moduleSizeFactor`，**0.70x~1.30x**，基于 **2500 px²** 标定：大车体内部宽敞不易损，小车体内部紧凑易损）。

完整耦合链见 [烘焙工具与模块分区 · 属性耦合链](./bake-modules.md#属性耦合链)。

## 背景参考图片

（Background Reference，2026-10-11）

右侧「背景参考 Background」面板提供图片上传/清除、显示开关、透明度（0–100%）、缩放（10–500%，100% = 整图完整显示在画布内）与 X/Y 像素偏移。

- 背景图在 **CSS 像素空间**内居中「contain」显示，**不随 `viewScale` 缩放**，始终作为固定参考；
- 在 `render()` 中 `clearRect` 后、`drawGrid()` 前绘制，网格与所有编辑标注绘制在其上层；
- 支持常见图片格式（PNG/JPG/WebP 等）；使用 `URL.createObjectURL` 加载（**仅设计器本地会话，不写入存档、不持久化**，刷新页面后需重新上传）；
- 图像异步解码完成后自动触发重绘（设计器无逐帧循环）。

> **外观件（车长塔/发动机舱盖）在局内是否生效**：见 [内容工具与 appearance · appearance](./appearance-aimspeed.md#applytankconfig-深拷贝-specappearance)（2026-10-20 #X1 修复前**从未生效**过）。

## 2026-10-22 第五批：Tab 重构、删掩体编辑、新增设计能力

### 三 Tab + 子目标（按钮归属）

| Tab | 左栏面板 | 画布 mode |
|---|---|---|
| 数据 Data | 基础参数 / 战斗参数 / 重量与上限 / **武器（主炮模式）** | 只读（无顶点编辑） |
| 装甲模型 Armor | **子目标：车体 / 炮塔** → 顶点、逐边装甲、座圈、正多边形预设、内部模块、**炮塔类型** | `hull` / `turret`（= `armorPart`） |
| 外观 Appearance | 炮管（含**炮管数量/间距**）/ 炮盾 / 履带 / 车长塔 / 发动机舱 / 纹理 / 精灵 / **预览瞄准** | `preview` |

**按钮可见性（用户硬性要求）**：

- **预览瞄准**：仅「外观」Tab 可见。
- **撤销末尾顶点 / 清空当前多边形 / 重置默认形状 / 网格吸附**：仅「装甲模型」Tab 可见。
- **拷贝掩体 JSON**：**已删除**。

### 删除掩体编辑（用户要求）

设计器里的「掩体编辑 Cover Editor」整块（`.panel-cover`：`#c-tier/c-x/c-y/c-w/c-h/c-angle`）与全部配套 JS（`state.currentCover`、`mode==="cover"` 的 mousedown/mousemove/拖拽/边中点插点分支、`findCoverVertexHit`、`findCoverEdgeMidpointHit`、`selectCoverVertex`、`syncSelectedCoverInputs`、`deleteSelectedCoverVertex`、`HINTS.cover`、`drawCoverPolygon`）**整体移除**。

> **沿革（不静默删除）**：该功能早在 2026-10-15 #3 就「删除掩体形状设计功能」（Tab 按钮已移除），但 DOM 与 JS 一直残留——`#copyCoverJsonBtn` 常驻可见可点、复制出 `{"tier":"half","verts":[]}`（`half` 还是已删除的 tier），`.panel-cover` 因 `mode` 永远进不到 `cover` 而恒 hidden。2026-10-22 按用户要求彻底删除。

### 修掉的三个设计器缺陷（ISSUES #Z1）

1. **顶点无法选中**：`setMode()` 原把 Tab 名（`data/armor/appearance`）直接写进画布 `mode`，而 `mousedown` 只认 `hull/turret/pivot/cover` ⇒ 点过任意 Tab 后**顶点拾取永久失效**，且没有任何回到 `hull/turret` 的入口。现引入 `armorPart`（`hull`|`turret`），「装甲模型」Tab 下用子按钮切换，`mode` 恒为该值。
2. **网格吸附按钮无效**：`#snapToggleBtn` 在 `designer.js` 中**零命中**（绑定在抽脚本时丢失），`snapToGrid` 恒 false、9 处消费点全部失效。现已补监听（文案「网格吸附 开/关」+ `.active`）。
3. **撤销/清空永远作用于车体**：目标判定原为 `editTab==='hull'||'turret'`（#TEX3 前的旧枚举，恒假）⇒ 目标恒回退 `hull`。现改为读 `armorPart`。

**附带修复**：`mousemove` 里错位的 `return;`（落在 turret 分支内）导致 hull 模式每次移动鼠标都抛 `TypeError: Cannot read properties of null (reading 'downX')`——已把 `return` 提到 `if(!drag)` 块末尾。

### 新增设计能力（用户需求 12）

| 能力 | 导出字段 | 控件位置 | 运行时消费 |
|---|---|---|---|
| **双管火炮** | `barrel.count = 2` + `barrel.gap`（px） | 外观 Tab「炮管数量 1/2」+ 2 时显示间距 | `tank_battledraw` 已支持 `count===2` 画两根；`WEAPON_DEFAULTS.double_barrel.barrelOffset` |
| **曲射主炮** | `weapons.secondary = { type: "howitzer" }` | 数据 Tab「主炮模式：直射 / 曲射」 | `isHowitzerMode` / `toggleHowitzerF` 全链已存在（曲射由**副武器槽**承载，占用后不能再装其它副武器） |
| **固定炮塔（战斗室）** | `hasTurret = false`（同时强制 `traverseLimit=180`、`turret.pivot={dx:0,dy:0}`） | 装甲模型 Tab「炮塔类型：旋转 / 固定」 | `tank_geometry.js superstructureAngle` 已支持（legacy 路径）；固定时画布 `previewAngle` 恒 0 |

**只在非缺省时写入**：三个能力对应的键（`barrel.count`/barrel.gap`/weapons`/hasTurret`）**缺省一律不写**，避免污染现有 6 个坦克 JSON（实测：panzer-IV / tiger-I / hummel / Leapard_1 载入→保存均不含这些键）。

### 车长塔缩放比例（用户需求 7）

- 数据结构：`appearance.cupola[i].scale`（number，缺省 1，范围 **0.5~2.0**）。
- 设计器：每行列表加「缩放」数字输入（`min .5 / max 2 / step .05`），越界输入钳制；`_appearanceForSave()` 输出含 scale；`applyTankData` 读入时**对象/数组两种形态都归一为数组并保留 scale**（旧数据补 1）。
- **运行时消费**：`js/tank_paint.js` 的 `paintAppearancePart(..., s)` 第 6 参由写死的 `1` 改为 `(_cup.scale || 1)`；`_appearanceKey` 的签名同步带 scale（否则不同缩放共用同一张烘焙 sprite）。
- **沿革**：改前设计器按 `viewScale` 缩放、局内固定 `1` ⇒ 同一车长塔两处尺寸基准不一致（位置公式 `_tW*0.44` 已对齐、尺寸未对齐）。

### UI 逻辑优化（用户「再考虑如何进一步优化设计器 ui 逻辑」）

1. **当前编辑目标状态条** `#editTargetBar`：动态显示 `数据 · 基础参数` / `装甲模型 · 车体` / `装甲模型 · 炮塔 · 选中顶点 #3` / `外观 · 炮管` / `预览瞄准`。
2. **工具条按 Tab 重排**：`tab-tools[data-tab]` 三组，只显示当前 Tab 的按钮（消除「8 个按钮平铺、5 个在别的 Tab 不可用」的混乱）。
3. **保存区固定**：`#top-bar` 改 `position:sticky`（原 absolute 会吃掉画布顶部条带的点击）。
4. **左栏独立滚动**：`#left-sidebar{overflow-y:auto; max-height:calc(100vh - 90px)}`。
5. **禁用态替代隐藏**：同 Tab 内不适用但需要被发现的控件用 `disabled` + `title`（如固定战斗室时的射界输入）。

## 相关页面

- [对比页与字段架构表](./compare-schema.md) — 同一批字段在对比页的编辑方式
- [贴图与涂装视觉规范](./visual-spec.md) — 设计器的「整车精灵」四层对齐面板
- [内容工具与 appearance](./appearance-aimspeed.md) — 外观件与叠加层基准的 2026-10-20 修复

- [对比页与字段架构表](./compare-schema.md) — 同一批字段在对比页的编辑方式
- [贴图与涂装视觉规范](./visual-spec.md) — 设计器的「整车精灵」四层对齐面板
- [内容工具与 appearance](./appearance-aimspeed.md) — 外观件与叠加层基准的 2026-10-20 修复
