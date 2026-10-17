# 地图元素 AI 生成提示词包（地图优先 · v2 2026-10-17）

> 路线：AI 生成贴图管线 + 地图元素优先。**出图后端已裁定**（2026-10-17 用户）：
> ComfyUI 本地因硬件成本**否决**；走**托管 API**（Gemini / Replicate / OpenAI 图像），
> 或保持纯程序化（`assets/` 为空即自动走 bake，视觉已由 `#U11` 补齐地面纹理与地物投影）。
>
> **一键出图**：`node tools/gen-covers.mjs --provider gemini`（凭据只从进程环境或仓库根
> `.env` 读取，脚本不打印、不落副本）。不带凭据时用 `--provider mock` 走仓库自己的烘焙
> 产物，验证「出图 → 后处理 → 落盘 → 游戏渲染」整条链路。
> 生产约束见 `tools/sprite-audit.md` §6：生成图只做**美术源图**，必须经过
> 缩放/清底 → 锚点验收 → 游戏内确认，才能进 `assets/`。

## 0. 本次范围（10 张）

**尺寸与锚点的唯一来源是 `tools/cover-refs.json`**（由 `node tools/dump-cover-refs.mjs`
从烘焙代码导出）。下表是 2026-10-17 的实跑值，仅供人读；出图脚本与后处理脚本都读 JSON，
不会因本表过期而错位。

| # | 文件（`assets/` 根目录） | 画布尺寸 | 画布内锚点 | 内容质心（验收基准） |
|---|---|---|---|---|
| 1 | `soft.png`（栅栏基体） | 172×12 | (86, 6) | (85.5, 5.5) |
| 2 | `barricade.png`（沙袋路障） | 66×30 | (33, 15) | (32.7, 13.5) |
| 3 | `stump.png`（树桩） | 26×20 | (13, 10) | (12.6, 9.5) |
| 4 | `rubble.png`（碎石） | 37×13 | (20, 5.5) | (15.5, 5.7) |
| 5 | `bush.png`（灌木基底阴影） | 55×34 | (27, 17) | (27, 16.5) |
| 6 | `bush_canopy.png`（灌木叶片，上层） | 46×38 | (24, 19) | (23.9, 18.5) |
| 7 | `tree.png`（树干） | 30×30 | (15, 15) | (14.5, 14.5) |
| 8 | `tree_canopy.png`（树冠，上层） | 58×58 | (29, 29) | (28.5, 28.5) |
| 9 | `fallen.png`（倒树干） | 63×15 | (33, 7.5) | (30.9, 6.9) |
| 10 | `fallen_canopy.png`（倒树叶簇，上层） | 37×31 | (1, 15.5) | (19.5, 15.0) |

> ⚠️ 这三组数字互相**不能混用**：`ASSET_DEFS.w/h` 是烘焙函数的**输入**尺寸，
> `refs.canvas` 是烘焙后的**内容包围盒**（图片通道按 1:1 贴图，必须与它同尺寸），
> `refs.anchor` 是画布内锚点，`refs.centroid` 才是「内容该画在哪儿」的验收基准。
> 早期版本把前两者混为一谈，导致 tree 从 30×30 被当成 24×18、整体缩放 1.25 倍。
>
> ⚠️ 加载器只认 `assets/<key>.png`（`js/tank_assets.js` 的 `loadAssetImage`），
> **不要建 `assets/covers/` 子目录**。

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

- **分辨率**：一律按基准画布的宽高比出图、最长边 1024（`tools/cover-gen-prompts.json`
  的 `generateLongest`；实际尺寸由 `gen-covers.mjs` 从 refs 派生并打印在 `--dry` 里）。
  不要直接出 24×18 —— 模型画不出这个尺度的细节，后期再缩。
- **托管 API**：
  - Gemini：`gemini-2.5-flash-image`（`responseModalities: ['IMAGE']`，`imageConfig.aspectRatio`
    取基准画布最接近的离散档）。
  - Replicate：默认 `black-forest-labs/flux-schnell`，可 `--model owner/name` 覆盖。
  - OpenAI：默认 `gpt-image-1`（`background: 'transparent'`）。
  - `transparent background` 必须写进 prompt，否则多半回白底（后处理会清，但细节会被啃掉）。
- **每种至少出 4 选 1**（`--variants 4`，产物为 `<key>_v2.png` 等），seed 固定便于迭代。
- **凭据**：`GEMINI_API_KEY` / `REPLICATE_API_TOKEN` / `OPENAI_API_KEY`（或统一 `COVER_API_KEY`），
  优先进程环境，其次仓库根 `.env`；脚本只读取、掩码输出、不写任何副本。

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

```bash
# 1) 出图 → tmp/covers-src/<key>.png（不出网的自检：--provider mock）
node tools/gen-covers.mjs --provider gemini --variants 4

# 2) 报告：缩放/清底/PNG-8 试算（不写盘）
PYTHONPATH="$PWD/tmp/pylibs" python scripts/prepare_covers.py --dry

# 3) 落盘到 assets/（git 可回滚；确认后再加 --inplace）
PYTHONPATH="$PWD/tmp/pylibs" python scripts/prepare_covers.py --inplace

# 4) 锚点/尺寸/质心验收（图片通道的真实对齐基准）
PYTHONPATH="$PWD/tmp/pylibs" python scripts/covers-anchor-check.py

# 5) 目视确认：浏览器开 tools/bake.html（file:// 直开）看程序化预览，
#    再进游戏看 base/canopy 两层层级与位置
```

> 第 4 步取代了原来「人眼看 bake.html 红十字」——红十字量的是**烘焙内容包围盒**
> 内的锚点，对图片通道没有意义（图片按 1:1 贴图，锚点是画布内像素）。脚本直接
> 复算运行时粘贴公式，质心偏离烘焙基准 >2px 即判失败。

## 6. 验收标准

- [ ] 10 张 PNG 尺寸 = `tools/cover-refs.json` 的 `canvas`（`covers-anchor-check.py` 自动判）
- [ ] 内容质心与 `refs.centroid` 距离 ≤ 2px（同上）
- [ ] 透明底（`prepare_covers` 报告 `cleared_bg` 只清掉外部白；本体高光保留）
- [ ] 16 色内、无渐变洗白，单张 ≤ 64KB
- [ ] 游戏内：base 画在坦克下、canopy 画在坦克上，遮挡关系正确
- [ ] 无图回退仍可用（删图即回程序化 bake，视觉不断档）
- [ ] `node scripts/test-cover-gen.js` 全绿（含 mock 端到端 + 质心验收）

## 7. 不做的事（本批明确排除）

- 坦克贴图 / 特效帧不在本批（地图元素先行，坦克 3 根炮管与 FX 帧排后）。
- 不建 `assets/covers/` 子目录（加载器不认）。
- 不直接 AI 出 FX 序列帧（帧间不一致是已知致命问题，见 sprite-audit §6.1）。
