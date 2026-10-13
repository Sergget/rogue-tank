---
name: pixel-art-sprite
description: Use when authoring or packing pixel art textures, spritesheets, and animation frames for tanks, covers, effects, or UI icons.
disable-model-invocation: true
---

# Pixel Art Sprite Skill

## 适用场景
- 坦克车体/炮塔/履带/炮口闪光 贴图（俯视角 2D）
- 掩体/树/灌木/残骸 贴图
- 爆炸/烟雾/火焰/跳弹火花 特效序列帧
- UI 图标/弹种图标/能力图标

## 规范约束
- **画布基准**：1px = 1 世界单位（与 `RULES.scale.PX_PER_METER ≈ 10.92` 对齐）
- **坦克贴图**：车体长 69px (Tiger I 基准) → 贴图建议 128×64 或 256×128
- **调色板**：限制 16 色（含透明），风格参考《Into the Breach》/《FTL》
- **动画**：循环帧数 4-8，命名 `{name}_00.png` ~ `{name}_07.png`
- **输出目录**：
  - `assets/tanks/{id}/body.png` (车体)、`turret.png` (炮塔)、`tracks.png` (履带)
  - `assets/covers/{tree|bush|barricade|soft|stump|rubble|fallen}.png`
  - `assets/fx/{explosion|smoke|fire|ricochet|muzzle|trackbreak|ammoblow}_00.png`...
- **图集**：`tools/pack-sprites.js` 打包 → `assets/atlas.png` + `assets/atlas.json`

## 工具链
- **首选**：Aseprite (支持命令行导出、图层、洋葱皮)
- **备选**：Piskel (Web) / LibreSprite (开源)
- **导出脚本**：`node tools/pack-sprites.js` → 聚合生成图集
- **运行时加载**：`js/tank_assets.js` 的 `ASSET_DEFS` 注册表 + `assetImage()` + `bakeAssetCanvas()` 离屏烘焙缓存
- **无图回退**：`tank_paint.js` 程序化绘制（`paintPartTexture`/`paintTracks`/`paintTurretShadow`）

## 5.5 阴影与立体感约定
- **光源**：统一左上（西北 45°）；key light 打在顶部/正面，暗面与投影在右下/背面。
- **阴影专层**：阴影画在**最底层**（`shadow`，比任何实体层更靠下），实体层盖住自身轮廓之内、只露轮廓之外 → 阴影永不渗到部件前缘。
- **阴影色**：取调色板中最深的**非描边色**，色相与主体一致或灰化 1 档；**严禁用描边 ink 色**——实测炮口内膛用 ink 色贴边会让 `evaluate` 把它算成轮廓加粗（`outline depth 3px`），改用次深色并内收 1px 后 `value` 850→950。
- **三种阴影**：
  1. **接触阴影（部件环影）**：部件（炮塔）轮廓外扩约 2px，画在其正下层，被自身盖住内圈、只露外环 → 表达「坐」在承载面上；
  2. **贴身影**：悬置/突出零件（炮管）正下方偏移 2~3px 的条带；只在该投影确实落在同层或更低层的地方画，避免悬空在透明处；
  3. **地面投影**：整体剪影向右下偏移 3px 的暗色遮罩，画在最底层。
- **明度分层**：并排面之间至少间隔 1~2 个 value step。为拉开零件可辨度：**承载面/顶面**抬 1~2 档（如炮塔顶盖），**凹陷/悬置部件**压 1~2 档（如炮管比车体暗 2 档）；同色系相邻部件靠「顶亮线 + 底暗线 + 分段缝」区分，而不是靠换色相。
- **质量门**：`evaluate` 的 `value` 应 ≥900；若报 `key-light-inconsistent`（旧版 850）说明明暗方向不统一，先统一阴影再调色。`outline` ≥700 且 `blocking: []`。

## 验收标准
- `npm run check` 通过（语法/类型检查）
- `npm run test:browser` 无贴图缺失/加载报错
- 视觉回归：`tools/visual-diff.js` 对比基准截图（如有）
- 贴图尺寸/锚点与 `ASSET_DEFS` 定义一致（`w/h/anchorX/anchorY/canopyAnchorX/canopyAnchorY`）

## 交付清单（供 asset-artist agent 使用）
| 实体类型 | 必需贴图 | 可选贴图 | 备注 |
|----------|----------|----------|------|
| 坦克 | body.png, turret.png, tracks.png | muzzle_flash.png | 3 张核心 |
| 掩体/地形 | {type}.png | canopy.png (树/灌木) | 树冠单独层 |
| 特效 | {fx}_00.png ~ _07.png | - | 循环动画 |

## 常见坑
- ❌ 贴图未预乘 Alpha → 混合错误
- ❌ 锚点偏移导致炮塔旋转偏心 → 必须与 `tank_geometry.js` 的 `turretPivot` 对齐
- ❌ 图集打包后 UV 坐标未同步 → `atlas.json` 的 `frames[name].frame` 必须准确
- ❌ 16 色限制被破坏 → 导入 Aseprite 时检查调色板