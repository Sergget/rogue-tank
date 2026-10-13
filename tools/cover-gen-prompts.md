# 地图元素 AI 生成提示词包（地图优先 · v1 2026-10-10）

> 路线：AI 生成贴图管线（用户已选）+ 地图元素优先。
> 生成后端二选一：**ComfyUI 本地**（可控尺寸首选）/ **Gemini / Replicate**（概念图，需后期处理）。
> 生产约束见 `tools/sprite-audit.md` §6：生成图只做**美术源图**，必须经过
> 抠图 → 锚点对齐 → `scripts/optimize_sprites.py` 压缩 → 游戏内目视确认，才能进 `assets/`。

## 0. 本次范围（10 张）

| # | 文件（`assets/` 根目录约定，见 `assets/README.md`） | 名义尺寸 `ASSET_DEFS` | 锚点 |
|---|---|---|---|
| 1 | `soft.png`（栅栏基体） | 170×10 | (85.75, 5.75) |
| 2 | `barricade.png`（沙袋路障） | 64×28 | (32.75, 14.75) |
| 3 | `stump.png`（树桩） | 24×18 | (12.75, 9.75) |
| 4 | `rubble.png`（碎石） | 38×17 | (20.04, 7.75) |
| 5 | `bush.png`（灌木基底阴影） | 56×34 | (28, 17) |
| 6 | `bush_canopy.png`（灌木叶片，上层） | 同上 | (24.64, 19.2) |
| 7 | `tree.png`（树干） | 24×18 | (15.15, 15.15) |
| 8 | `tree_canopy.png`（树冠，上层） | 冠径约 1.4×max(w,h)，见 `tank_assets.js:149` | (39.26, 39.26) |
| 9 | `fallen.png`（倒树干） | 58×9 | (33.55, 7.95) |
| 10 | `fallen_canopy.png`（倒树叶簇，上层） | 同上 | (1.0, 15.9) |

> ⚠️ skill 文档里的 `assets/covers/*.png` 路径与现行加载器不一致：
> 现行 `loadAssetImage` 读的是 `assets/<key>.png`（`js/tank_assets.js:229`）。
> **一律输出到 `assets/` 根目录**，不要建 `covers/` 子目录。

## 1. 全局风格前缀（每条 prompt 前面都加）

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, no ground shadow baked in,
isolated single object, transparent background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
```

## 2. 全局负面提示（Negative）

```
3/4 view, isometric, perspective distortion, ground plane, drop shadow,
white background, vignette, blur, bloom, photorealistic, painterly noise,
multiple objects, cropped, off-center
```

## 3. 生成参数

- ComfyUI：SDXL + `TransparentBG` / `LayerDiffuse` 工作流；出图 ≥ 512px 长边
  （小物件后期缩到名义尺寸，不要直接出 24×18——太小模型画不出细节）；
  sampler `DPM++ 2M Karras`，steps 28–36，CFG 5–7。
- Gemini（`gemini-2.5-flash-image` / Replicate 同类）：`aspect` 取接近名义宽高比
  的一档（soft 取 16:1 近似用 4:1 两张拼接，或直接方形出图后期裁），
  `transparent background` 必须写进 prompt，否则默认白底。
- 每种至少出 **4 选 1**（seed 固定一组，便于迭代）。

## 4. 逐件 prompt（复制即用）

### P1 soft —— 木栅栏（细长条，170×10）

```
[STYLE] long horizontal wooden fence segment, 7 vertical posts,
weathered pine planks, rope lashings, top-down 2D game sprite,
fence axis perfectly horizontal, centered
```

要点：横平竖直，后期旋转 0° 即用；镂空处必须真透明（alpha=0），不要画白底补洞。

### P2 barricade —— 沙袋路障（64×28）

```
[STYLE] sandbag barricade, two staggered rows of khaki sandbags,
stitched seams, slight sag between bags, oval footprint, centered
```

要点：俯视椭圆外形，与现有 `ellipse(x,y,w/2,h/2)` 碰撞近似一致。

### P3 stump —— 树桩（24×18）

```
[STYLE] sawn tree stump top view, concentric growth rings,
cracked bark rim, fresh cut wood grain, small round footprint, centered
```

### P4 rubble —— 碎石堆（38×17）

```
[STYLE] pile of 5 gray concrete rubble chunks, angular shards,
dust specks, scattered oval cluster, centered
```

要点：5 块、灰色两档（与现有 `rgba(96,92,84)/(112,108,98)` 色系接近即可）。

### P5 bush 基底（56×34，几乎纯阴影椭圆）

```
[STYLE] faint dark-green elliptical ground shadow blob,
soft edge, very subtle, no leaves in this layer, centered
```

> 基底就是个淡阴影椭圆——**建议不走生成**，直接沿用程序化 bake，
> 把生成预算留给 P6 叶片层。

### P6 bush_canopy —— 灌木叶片（上层，遮挡视线）

```
[STYLE] dense bush foliage cluster top view, 5 overlapping leaf blobs,
two greens (#466E32 / #60823C family), tiny highlight speckles, centered
```

### P7 tree —— 树干（24×18 小圆）

```
[STYLE] tree trunk top view, dark bark disc, rough bark ring,
moss speckle, small round footprint, centered
```

### P8 tree_canopy —— 树冠（上层，大圆，半径约 1.4×干径）

```
[STYLE] large round tree canopy top view, dark green base with
two lighter green lobes offset up-right and down-left,
soft rim stroke, canopy ~3x trunk diameter, centered
```

要点：冠径别贪大——现行已从 1.9 收到 1.4（`tank_assets.js:149`），
过大=视觉遮挡远超逻辑 OBB。

### P9 fallen —— 倒树干（58×9 横躺锥形）

```
[STYLE] fallen tree trunk lying horizontal, thick root end left
with sawn cross-section and growth rings, tapered tip right,
short broken branch stubs, bark texture, centered horizontal
```

### P10 fallen_canopy —— 倒树叶簇（上层，盖在树干右端部）

```
[STYLE] flattened leaf cluster draped over log end,
5 elongated foliage blobs, bush greens, low height, centered
```

## 5. 后处理流水线（必须走完才能进游戏）

```powershell
# 1) 抠图/清底：白底或半透光晕清零（二值 alpha）
$env:PYTHONPATH = "$PWD/tmp/pylibs"
python scripts/clean_sprite_bg.py --dry        # 先看报告
python scripts/clean_sprite_bg.py --inplace    # 确认后再写

# 2) 缩到名义尺寸 + 居中锚点（PIL，示例 bush 56×34，锚点 28,17）
#    —— 小图建议在ComfyUI里 outpaint 到方形再居中裁，不要拉伸变形

# 3) 压缩：调色板 PNG-8（对照坦克批：15.6MB→6.1MB，-60%）
python scripts/optimize_sprites.py --colors 256            # 试算
python scripts/optimize_sprites.py --colors 16 --inplace   # 地图小件可用 16 色

# 4) 落盘：assets/<key>.png + assets/<key>_canopy.png（根目录！）

# 5) 目视确认：浏览器开 tools/bake.html（file:// 直开），
#    看红十字锚点是否落在掩体中心 ±2px；再进游戏看 base/canopy 两层层级
```

## 6. 验收标准

- [ ] 10 张 PNG 透明底（`clean_sprite_bg --dry` 报 `background: 0`）
- [ ] 尺寸 = `ASSET_DEFS` 名义尺寸（tree_canopy 例外：按包围盒+锚点约定）
- [ ] 锚点误差 ≤ 2px（`bake.html` 红十字）
- [ ] 16 色内、无渐变洗白（`optimize --colors 16` 后 `mean_abs_err ≤ 2`）
- [ ] 游戏内：base 画在坦克下、canopy 画在坦克上，遮挡关系正确
- [ ] 无图回退仍可用（删图即回程序化 bake，视觉不断档）

## 7. 不做的事（本批明确排除）

- 坦克贴图 / 特效帧不在本批（地图元素先行，坦克 3 根炮管与 FX 帧排后）。
- 不建 `assets/covers/` 子目录（加载器不认）。
- 不直接 AI 出 FX 序列帧（帧间不一致是已知致命问题，见 sprite-audit §6.1）。
