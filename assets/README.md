# assets/ — 贴图资产目录

本目录存放**后期贴图**用的 PNG。当前 **为空**（仅本 README 与两个空子目录 `tanks/`、`tanks/barrels/`）。

**空目录 = 全部走程序化烘焙，视觉零变化、`file://` 完整兼容。这是设计允许的正常状态，不是缺件。**

## 两条通道（2026-10-23 用户裁定）

1. **程序化烘焙（现行唯一实机路径）**：无需任何文件。运行时由 `js/tank_assets.js`（地图元素）
   与 `js/tank_paint.js`（坦克）离屏烘焙。
2. **后期贴图接线（保留，当前无图）**：把 PNG 放到下面的约定路径，运行时自动优先使用；
   删除文件即回退程序化。

> **本仓库不出图**：AI 出图链已于 2026-10-23 整体删除；坦克的 19 张旧 PNG 也已删除。
> 后续贴图须由美术侧提供，并按 `docs/ASSETS-PIPELINE.md` 落盘 + 验收。

## 地图元素 PNG（`js/tank_assets.js` 的加载器读取）

| 文件 | 图层 | 对应键 |
|---|---|---|
| `<key>.png` | 基底层（绘制在坦克之下） | `wall` / `stump` / `rubble` / `bush` / `tree` / `fallen` |
| `<key>_canopy.png` | 树冠/叶片层（绘制在坦克之上，遮挡视线） | `bush` / `tree` / `fallen` |

尺寸与锚点的**唯一基准**是 `tools/cover-refs.json`（由 `node tools/dump-cover-refs.mjs` 从烘焙代码导出，勿手改）；
落盘用 `python scripts/prepare_covers.py --inplace`，验收用 `python scripts/covers-anchor-check.py`（内容质心 ±2px）。

## 坦克精灵 PNG

| 文件 | 说明 |
|---|---|
| `tanks/<id>_hull.png` / `tanks/<id>_turret.png` | 车体/炮塔（`id` 与 `tanks/<id>.json` 同名，含 `Leapard_1` 这类历史拼写） |
| `tanks/track-links.png` | 共用履带条（滚动相位 = 整幅贴图宽） |
| `tanks/barrels/barrel-<type>.png` | 炮管（`standard` / `autocannon` / `railgun` / 各车专用） |

四层对齐契约（`scale` 量纲 = 模型单位/图片像素、`pivot` = 图片像素坐标、`mountDx − embed = turretFrontDist`）
与启用前提见 `docs/specs/editor/visual-spec.md`；**图片不存在时不得把 `sprite.enabled` 置 `true`**
（`scripts/test-tanks.js` 有负向断言）。

## 替换真实美术时的约定

- 保持同名文件 + 锚点约定，渲染接口完全不变；
- 地图元素：内容质心必须落在 `cover-refs.json` 的 `centroid` ±2px；
- 坦克精灵：逐车在设计器「画布显示精灵」下确认层序与衔接后再启用。
