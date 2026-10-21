# 坦克设计器

> **摘要**：`tank_designer.html` 的几何编辑、双中心分离、炮管炮盾预设、属性耦合反馈与背景参考图。
> **适用版本**：现行（2026-10-21）
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

## 相关页面
- [对比页与字段架构表](./compare-schema.md) — 同一批字段在对比页的编辑方式
- [贴图与涂装视觉规范](./visual-spec.md) — 设计器的「整车精灵」四层对齐面板
- [内容工具与 appearance](./appearance-aimspeed.md) — 外观件与叠加层基准的 2026-10-20 修复
