# assets/ — 贴图资产目录（M0 贴图资产层，P-06 / DEVELOPMENT.md §2.10）

本目录存放地图元素的贴图 PNG。**当前为空 = 全部走程序化 bake 占位**（视觉零变化）。

## 生成方式（两条，任选其一）

**A. 纯程序化（默认，零资产）**：本目录留空即可，运行时自动走 `js/tank_assets.js` 的
离线烘焙回退（2026-10-17 #U11 起地面纹理与地物投影已补齐，空仓观感可接受）。

**B. 托管 API 出图 + 本地后处理**（ComfyUI 已否决）：

```bash
node tools/gen-covers.mjs --provider gemini --variants 4   # 出到 tmp/covers-src/
PYTHONPATH="$PWD/tmp/pylibs" python scripts/prepare_covers.py --dry      # 报告
PYTHONPATH="$PWD/tmp/pylibs" python scripts/prepare_covers.py --inplace  # 写到本目录
PYTHONPATH="$PWD/tmp/pylibs" python scripts/covers-anchor-check.py       # 尺寸/质心验收
```

尺寸与锚点基准见 `tools/cover-refs.json`（由 `node tools/dump-cover-refs.mjs` 从烘焙代码
导出，勿手改）；提示词见 `tools/cover-gen-prompts.md`。
也可用旧路径：`tools/bake.html` →「导出全部 PNG」手工下载到本目录。

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
