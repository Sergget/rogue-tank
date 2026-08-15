# assets/ — 贴图资产目录（M0 贴图资产层，P-06 / DEVELOPMENT.md §2.10）

本目录存放地图元素的贴图 PNG。**当前为空 = 全部走程序化 bake 占位**（视觉零变化）。

## 生成方式

用浏览器打开 `tools/bake.html`（可 `file://` 直开，无需服务器），点「导出全部 PNG」，
把下载的 `<key>.png`（与 `<key>_canopy.png`）保存到本目录。

## 文件名约定（`js/tank_assets.js` 的 Image 加载器读取）

| 文件 | 图层 | 对应档位 |
|---|---|---|
| `<key>.png` | 基底层（绘制在坦克之下） | soft / barricade / stump / rubble / bush / tree / fallen |
| `<key>_canopy.png` | 树冠/叶片层（绘制在坦克之上，遮挡视线） | bush / tree / fallen（可选，缺省回退程序化） |

## 精灵契约

- 每张 PNG 内，"掩体中心"应位于 `(anchorX, anchorY)` 像素处（`ASSET_DEFS[key]` 的
  `anchorX/anchorY` / `canopyAnchorX/canopyAnchorY`；`tools/bake.html` 预览会标出实测锚点）。
- 有图 → `drawAsset` 走 `drawImage`（按实例尺寸绕锚点缩放）；无图/未加载 → 程序化 bake 回退。
- 替换真实美术时保持同名文件 + 锚点约定即可，渲染接口不变。
