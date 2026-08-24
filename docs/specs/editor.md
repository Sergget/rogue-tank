# 战术坦克 Roguelike — 坦克编辑器与工具链规范 (Tank Designer & Tooling Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及页面与模块：tank_designer.html, tank_compare.html, js/tank_halfgeom.js, js/tank_presets.js, js/tank_schema.js, tools/bake.html

---

## 1. 坦克设计器 (tank_designer.html)
- **多边形顶点编辑**：车体/炮塔多边形自由编辑（半侧对称几何，js/tank_halfgeom.js halfFromFull 镜像重建全形）；逐边装甲厚度设定（front/side/rear faces）。
- **双中心分离**：turret.axis（炮塔自身旋转轴，局部帧内）与 turret.pivot（绕车体旋转中心，相对车体）完全分开；运行时 applyTankConfig 归一化平移保证"局部原点=旋转轴"不变量；设计器提供青色自身中心标记 + 橙色旋转中心标记 + 一键居中对齐按钮，防旋转甩尾。
- **炮管/炮盾预设**：js/tank_presets.js BARREL_PRESETS/MANTLE_PRESETS 表；normalizeBarrel 归一化（len/width/muzzle/evac/jacket 缺省兜底）。
- **模块可视化挂载**：六类模块（driver/ammo/engine/gunner/loader/commander）挂载于装甲边段——数据存作者帧边中点坐标+覆盖比例 len+偏移 off+镜像 mirror；3 手柄拖拽编辑（两端 len + 中部 off）；保存前 6 模块必须全部挂载。
- **甲弹对抗内置测试**：入射角/等效厚度/跳弹判定实时预览。
- **保存链路**：POST /api/tanks/<id> 写回 tanks/<id>.json；mvp/compare 重载列表即生效。

## 2. 参数对比页 (tank_compare.html)
- 表格化列出 tanks/ 全部配置：标量数值字段可编辑（极速/穿深/装填/装甲等）、枚举字段下拉（heightClass/muzzle 样式）、结构化字段分组展示。
- 编辑后重组同构对象保存回写；几何字段只读提示交设计器处理。

## 3. 字段架构表 (js/tank_schema.js)
- FIELD_ROWS 单一来源：designer/compare 共用字段清单+枚举，杜绝两页字段定义漂移。

## 4. 资产烘焙工具 (tools/bake.html)
- 遍历 ASSET_DEFS 离屏烘焙 + 锚点十字标注 + 合成预览，canvas.toBlob 逐张导出 PNG 到 assets/。
- file:// 可直开，零服务器依赖。

## 6. 坦克贴图与战术涂装视觉规范 (Tank Visual & Camo Spec)

- **多边形图案叠层 (Polygon Pattern Overlay)**：
  - 基于 `tank_paint.js` 的 `paintClipLocal` 进行多边形裁剪后叠层渲染；
  - 包含 4 套标准战术迷彩（`texture` 字段）：
    1. `camo-forest`（森林迷彩）：深绿/墨绿/暗褐斑块交错；
    2. `camo-desert`（沙漠伪装）：沙黄/浅褐/风蚀斑点；
    3. `camo-urban`（城市灰）：深灰/铸铁灰/沥青方块迷彩；
    4. `camo-winter`（雪地斑驳）：灰白底色 + 暗灰线条痕迹。
- **装甲质感与防滑涂层 (Armor Texture & Wear)**：
  - **焊缝 (Weld Seams)**：在装甲边缘与多边形顶点连接处绘制双重微弱高光/阴影线条；
  - **边缘磨损 (Edge Wear)**：车体与炮塔外角处叠加 5%~10% 的露底漆防锈色（dark rust）；
  - **铸造颗粒 (Cast Armor)**：对重型/中型坦克炮塔增加微弱噪点与铸造线。
