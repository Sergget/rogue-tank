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