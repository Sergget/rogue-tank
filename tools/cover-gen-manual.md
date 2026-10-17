# 地图元素贴图 —— 网页端手动出图手册（无 API Key 版）

> 适用于 Midjourney / ChatGPT / Gemini 网页版 / Stable Diffusion 网页工具 / 即梦·通义万相 等
> **任意能贴提示词出图的网页端**。出完图丢进仓库跑两条命令，其余（缩放、清底、PNG-8、尺寸、质心）
> 全部自动完成。
>
> 机器出图路径（需 API Key）见同目录 `cover-gen-prompts.md`；两条路径共用同一套后处理与验收。

---

## 0. 一分钟流程

```bash
# ① 网页出图 → 下载 PNG/JPG → 放进 tmp/covers-src/（目录不存在就新建）

# ② 试算：看缩放比、清底数、尺寸是否对得上（不写盘）
PYTHONPATH="$PWD/tmp/pylibs" python scripts/prepare_covers.py --dry --only tree_canopy

# ③ 落盘到 assets/
PYTHONPATH="$PWD/tmp/pylibs" python scripts/prepare_covers.py --only tree_canopy --inplace

# ④ 验收（尺寸 + 内容质心，自动判过不过）
PYTHONPATH="$PWD/tmp/pylibs" python scripts/covers-anchor-check.py
```

**文件名怎么起都行**，用 `--pick` 指定「4 选 1」的那张：

```bash
python scripts/prepare_covers.py --only tree_canopy \
    --pick tree_canopy=tree_canopy_v3.png --inplace
```

不加 `--pick` 时默认找 `<key>.png`（即把图改名成 `tree_canopy.png` 即可）。

`--only` 可以写多个：`--only tree,tree_canopy,bush_canopy`。没出的 key 继续走程序化回退，
**不影响游戏运行**，可以一张一张慢慢补。

---

## 1. 出图铁律（比提示词本身更重要）

| 规则 | 原因 |
|---|---|
| **纯白背景**（不是透明、不是黑底、不是渐变） | 后处理沿「边框连通的近白像素」清底。黑底/彩色底清不掉，会带一块方块进游戏 |
| **俯视正交，无透视** | 游戏是俯视 2D，3/4 视角会与坦克/地形透视冲突 |
| **单一物体、完整居中、四周留白 ≥ 10%** | 后处理按内容包围盒裁剪；贴边的物体等于被裁掉一部分 |
| **不要画投影 / 地面 / 场景** | 阴影已由代码统一绘制（`drawCoverShadow`），图里再画会变成双层影 |
| **平的哑光色，≤16 色，不要渐变洗白、不要照片纹理** | 游戏整体是低饱和扁平风格 |
| **物体自身比例要对**（见每条的「目标宽高比」） | 后处理只缩放不拉伸，比例错了会占满一个方向、另一方向留空 |

**关于透明通道**：网页端多数不给真 alpha。用**纯白底**反而更稳——后处理会清掉外部白，
同时**保留被物体包住的浅色高光**（判据是「能否从边框连通到外部」）。

**关于分辨率**：一律出 ≥1024 长边，不要直接出 30×30。模型画不出那个尺度的细节，
后期缩下来才干净。

---

## 2. 通用提示词模板

**正向**（每条都在最前面拼上这段）：

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, isolated single object,
on a plain pure white background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
no drop shadow, no ground plane, centered with margin
```

**负向**（支持负向提示的界面填这里；Midjourney 用 `--no`）：

```
3/4 view, isometric, perspective distortion, ground plane, drop shadow,
black background, colored background, vignette, blur, bloom,
photorealistic, painterly noise, multiple objects, cropped, off-center,
text, watermark
```

---

## 3. 逐件提示词（复制即用）

下面每条 = 「通用正向」+「本条内容」。为省事可直接整段复制。

### P1 `soft.png` —— 木栅栏（目标 172×12，约 14:1 细长条）

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, isolated single object,
on a plain pure white background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
no drop shadow, no ground plane, centered with margin,
long horizontal wooden fence segment, 7 vertical posts,
weathered pine planks, rope lashings, fence axis perfectly horizontal
```

- 建议画幅：`16:9`（Midjourney `--ar 16:9`）。栅栏要**很长很细**，占满宽度、高度只有几像素的视觉厚度。
- 要点：横平竖直，**不要**画成透视里斜着的栅栏；缝隙处要是白底，别用色块补。

### P2 `barricade.png` —— 沙袋路障（目标 66×30，约 2.2:1）

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, isolated single object,
on a plain pure white background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
no drop shadow, no ground plane, centered with margin,
sandbag barricade seen from directly above, two staggered rows of
khaki sandbags, stitched seams, slight sag between bags, oval footprint
```

- 建议画幅：`1:1`。
- 要点：俯视是**椭圆外形**，与碰撞盒的椭圆近似一致，不要画成侧视的沙袋墙。

### P3 `stump.png` —— 树桩（目标 26×20，约 1.3:1）

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, isolated single object,
on a plain pure white background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
no drop shadow, no ground plane, centered with margin,
sawn tree stump seen from directly above, concentric growth rings,
cracked bark rim, fresh cut wood grain, small round footprint
```

- 建议画幅：`1:1`。
- 要点：正上方看下去应该**只有年轮切面和一圈树皮**，不要画树干高度。

### P4 `rubble.png` —— 碎石堆（目标 37×13，约 2.9:1）

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, isolated single object,
on a plain pure white background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
no drop shadow, no ground plane, centered with margin,
pile of 5 gray concrete rubble chunks seen from directly above,
angular shards, dust specks, scattered horizontal oval cluster
```

- 建议画幅：`3:2`。
- 要点：5 块、两档灰（游戏内用 `#605C54` / `#706C62` 附近色）；碎块**横向散开**，别堆成圆塔。

### P5 `bush.png` —— 灌木基底（目标 55×34）

> **建议直接跳过**，沿用程序化版本：这一层就是一个淡阴影椭圆，生成图反而更难控，
> 把出图预算留给 P6 叶片层。若不跳过：

```
top-down 2D game sprite, very faint dark-green elliptical ground shadow blob,
soft edge, very subtle, no leaves in this layer,
on a plain pure white background, flat flat colors
```

- ⚠️ 白底 + 极淡阴影 = 后处理很可能把它当背景清掉。**不推荐**。

### P6 `bush_canopy.png` —— 灌木叶片（目标 46×38，上层遮挡视线）

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, isolated single object,
on a plain pure white background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
no drop shadow, no ground plane, centered with margin,
dense bush foliage cluster seen from directly above, 5 overlapping
leaf blobs, two greens (#466E32 and #60823C family), tiny highlight speckles
```

- 建议画幅：`1:1`。
- **优先级最高**（视觉增益最大）。要点：叶片要**填满一个圆形区域**、外缘不规则；
  不要画枝干（那是 P7 的活）。

### P7 `tree.png` —— 树干（目标 30×30，1:1 小圆）

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, isolated single object,
on a plain pure white background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
no drop shadow, no ground plane, centered with margin,
tree trunk seen from directly above, dark bark disc, rough bark ring,
moss speckle, small round footprint
```

- 建议画幅：`1:1`。
- 要点：就是一个**深色圆盘**，四周露出一点树皮环。不要画任何叶子。

### P8 `tree_canopy.png` —— 树冠（目标 58×58，上层遮挡视线）

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, isolated single object,
on a plain pure white background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
no drop shadow, no ground plane, centered with margin,
large round tree canopy seen from directly above, dark green base with
two lighter green lobes offset up-right and down-left, soft rim stroke,
canopy about 2x the trunk diameter
```

- 建议画幅：`1:1`。
- **与 P6 并列最高优先级**。要点：**冠径别贪大**——大约树干（P7 那个圆盘）的 2 倍直径；
  画太大 = 遮挡范围远超实际碰撞盒，玩家会觉得"看着没树却打不中"。

### P9 `fallen.png` —— 倒树干（目标 63×15，约 4.2:1）

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, isolated single object,
on a plain pure white background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
no drop shadow, no ground plane, centered with margin,
fallen tree trunk lying horizontally seen from directly above,
thick root end on the left with sawn cross-section and growth rings,
tapered tip to the right, short broken branch stubs, bark texture
```

- 建议画幅：`3:2`。
- 要点：**左粗右细、水平放置**。断面年轮在左端（游戏里那个位置是"树根"）。

### P10 `fallen_canopy.png` —— 倒树叶簇（目标 37×31，上层）

```
top-down 2D game sprite, Into the Breach / FTL pixel-art style,
flat orthographic, no perspective, isolated single object,
on a plain pure white background, crisp 1px outlines,
matte colors, max 16 colors, no gradient wash, no photo texture,
no drop shadow, no ground plane, centered with margin,
flattened leaf cluster draped over the end of a fallen log,
5 elongated foliage blobs, bush greens, low height
```

- 建议画幅：`1:1`。
- 要点：只是**一团压在木头端部的叶子**，不需要画木头本身。

---

## 4. 各平台小抄

| 平台 | 正向提示 | 负向提示 | 画幅 |
|---|---|---|---|
| **Midjourney** | 直接粘整段 | 结尾加 `--no 3/4 view, isometric, drop shadow, black background, text` | `--ar 1:1` / `--ar 16:9`（P1/P9） |
| **ChatGPT** | 直接粘整段 | 正向里已有 `no drop shadow` 等，通常够用 | 提一句「1024×1024」或「宽幅横构图」 |
| **Gemini 网页** | 直接粘整段 | 同上 | 提一句"square image"或"wide banner" |
| **SD 网页 / Civitai** | 粘「通用正向 + 本条内容」 | 粘「通用负向」到 Negative 框 | 按表格设宽高 |
| **即梦 / 通义万相** | 直接粘整段 | 若有负向框就填 | 选最接近的预设比例 |

**网页端通用技巧**：
- 一次让模型出 4 张（多数平台默认就是 4 张），挑最符合「俯视 + 白底 + 比例对」的那张。
- 不满意的常见原因排序：① 画成 3/4 视角 → ② 物体贴边被裁 → ③ 加了投影/场景 → ④ 比例不对。
  前面三条改提示词能救，第四条只能重出。
- 如果平台只肯给方图，也没关系——后处理会按内容包围盒裁剪，方图里画一条横栅栏同样能用。

---

## 5. 下载后检查（30 秒）

1. 用图片查看器打开：**背景是不是纯白/接近白**？发灰、带纹理、带渐变都不行。
2. 物体**有没有贴到画布边缘**？贴边就先裁一下再放进去。
3. 文件放进 `tmp/covers-src/`，跑 `--dry --only <key>`，看两个数：
   - `scale` 在 0.02~1.0 之间（>1 表示源图比目标还小，细节会糊）；
   - `clr_bg` 明显 > 0（说明白底被正确识别；为 0 且源图是白底 → 说明白不够白）。

## 6. 出完之后的验收

```bash
PYTHONPATH="$PWD/tmp/pylibs" python scripts/covers-anchor-check.py
```

输出里 `dist` 是「内容质心 vs 烘焙基准」的像素差，**≤2px 即通过**。
超了多半是物体在画面里不居中（生成时偏了），裁一下重跑即可，不用重出图。

进游戏看两件事：**位置对不对**（树冠是否盖在树干上、倒树叶簇是否在木头端部）、
**层级对不对**（base 在坦克下、canopy 在坦克上）。

---

## 7. 分批策略（推荐）

想尽快看到效果，按这个顺序做，每做完一张就能直接进游戏看：

| 轮次 | 出哪几张 | 理由 |
|---|---|---|
| 第 1 轮 | `tree_canopy`、`bush_canopy` | 视觉增益最大，树/灌木是地图上最密的东西 |
| 第 2 轮 | `tree`、`fallen`、`fallen_canopy` | 配合第 1 轮形成完整植被 |
| 第 3 轮 | `barricade`、`stump`、`rubble` | 小件，数量少 |
| 第 4 轮 | `soft` | 细长条最难出，收益最低 |
| 跳过 | `bush` | 纯阴影，程序化更好控 |

每轮只跑 `--only` 指定那几张，其余保持程序化回退，游戏随时可玩。
