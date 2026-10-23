# 贴图资产管线 —— 备查手册（2026-10-23 重写）

> **本文件的定位**：**后期贴图接线**的唯一流程备查文档——即「外部美术/后期工具产出的 PNG
> 如何安全落盘到 `assets/`，并保证与运行时烘焙的尺寸/锚点一致」。
>
> **本仓库不出图（2026-10-23 用户裁定）**：程序化烘焙是**唯一实机路径**，AI 出图链已整体删除
> （`tools/gen-covers.mjs`、`tools/cover-gen-prompts.md`/`.json`、`tools/cover-gen-manual.md`、
> `tools/cover-comfyui-workflow.json`、`tools/sprite-audit.md`、`scripts/test-cover-gen.js`）。
> 本文件只讲**落盘、验收、排错**，不讲出图。
>
> **当前状态（2026-10-23 实测）**：`assets/` 下**没有任何 PNG**（仅 `README.md` 与空的
> `tanks/`、`tanks/barrels/` 目录）⇒ 全部走程序化烘焙。这是**预期状态，不是缺陷**。

---

## 1. 两类贴图的区别（先分清，否则会找错脚本）

| | **地图元素贴图**（cover） | **坦克精灵**（tank sprite） |
|---|---|---|
| 产物位置 | `assets/<key>.png`（9 个键，含 canopy 层） | `assets/tanks/<id>_hull.png` 等 + `assets/tanks/barrels/barrel-<type>.png` |
| 运行时消费 | `js/tank_assets.js` 的 `drawAsset` / `drawAssetCanopy` | `js/tank_battledraw.js` 的 `drawTankSprite`（经 `spriteEnabled(t)` 判定） |
| 是否有图回退 | **有**：无图即走程序化烘焙，视觉不断档 | **有**：`spriteReady(t)` 为假时回退程序化 |
| 当前状态 | **无产物**（全走程序化） | **无产物**（19 张 PNG 已于 2026-10-23 删除；6 车 `sprite.enabled=false`） |
| 落盘工具 | `scripts/prepare_covers.py` | 无（美术侧自行导出，按 `tanks/<id>.json` 的 scale/pivot 对齐） |
| 验收工具 | `scripts/covers-anchor-check.py` + `scripts/test-asset-pipeline.js` | 设计器「画布显示精灵」目视 + `scripts/test-tanks.js` 负向断言 |

---

## 2. 地图元素贴图：四步链

```
① 备图 → ② 后处理落盘 → ③ 验收 → ④ 目视
```

### 2.1 唯一基准：`tools/cover-refs.json`

**所有环节的尺寸/锚点/质心都从这里取，禁止手抄。**

```bash
node tools/dump-cover-refs.mjs          # 重新导出基准
node tools/dump-cover-refs.mjs --check   # CI 校验是否漂移
```

- 该文件由 `dump-cover-refs.mjs` **从运行时烘焙代码**（`js/tank_assets.js` 的
  `bakeAssetCanvas`）导出，不是手写的。
- 内容：每个 key 的 `canvas`（落盘尺寸）、`anchor`（画布内锚点）、`centroid`（内容质心）。
- **`anchor` 允许为负**（2026-10-19 #V1 修复后）——负值表示锚点落在内容包围盒之外，
  运行时 `ctx.drawImage(canvas, x-ax, y-ay)` 只把它当偏移量，完全合法。
- **改任何烘焙几何/包络后必须重导出**，否则 `test-asset-pipeline.js` 的 `--check` 断言会红
  （见 §4 排错）。

### 2.2 ① 备图

把源图按 `<key>.png` 放进一个源目录（例如 `tmp/covers-src/`）。当前 9 个键：

```
wall  stump  rubble  bush  bush_canopy  tree  tree_canopy  fallen  fallen_canopy
```

- `wall` 是**单一直线掩体**，六个外观变体共用一套烘焙（`wall:<style>` 变体键）。
- 旧 `soft`（栅栏）/ `barricade`（沙袋）已于 2026-10-22 合并进 `wall`，**不要再按旧键备图**。
- 源图**名字随意**：用 `--pick <key>=<文件名>` 指定即可（网页下载常见 `tree v2 (1).png` 这种名字）。

### 2.3 ② 后处理落盘

```bash
python scripts/prepare_covers.py --dry                      # 试算（不写盘，默认）
python scripts/prepare_covers.py --inplace                  # 真正落盘到 assets/
python scripts/prepare_covers.py --inplace --src tmp/covers-src --out <dir>
python scripts/prepare_covers.py --only tree,tree_canopy --inplace
python scripts/prepare_covers.py --pick tree=v2/tree_final.png --only tree --inplace
```

做四件事：**清底**（边框洪泛，保留被本体包围的高光）→ **按内容包围盒裁留白** →
**等比缩进 `refs.canvas`**（不拉伸）→ **居中放置** → **PNG-8（16 色）**。

- 依赖 Pillow + numpy。本机以工作区本地库运行（不污染全局 site-packages）：
  `$env:PYTHONPATH = "$PWD/tmp/pylibs"`。
- 退出码：`--dry` 下 MISSING 也算失败（防漏图静默通过）；给 `--only` 时只校验被选中的 key。

### 2.4 ③ 验收

```bash
python scripts/covers-anchor-check.py                  # 验收 assets/ 下已落盘的
python scripts/covers-anchor-check.py --src <dir>      # 验收指定目录
python scripts/covers-anchor-check.py --json           # 机器可读
```

**验收基准是 `refs.centroid`（内容质心），不是 `anchor`**——这是最容易搞错的一点。
容差默认 **±2px**。`ABSENT`（缺图）**不算失败**，表示该键走程序化回退。

另有一条 Node 回归锁住整条接线的完整性（挂 `npm test`）：

```bash
node scripts/test-asset-pipeline.js
```

它断言四件事：基准与烘焙代码一致、基准键 = `ASSET_DEFS`、`prepare_covers.py` 的 `ORDER`
覆盖全部基准键、空 `assets/` 下锚点验收退出码 0 且全 `ABSENT`。

### 2.5 ④ 目视

- `tools/bake.html`（`file://` 直开）看**程序化烘焙**预览与锚点十字；
- 进游戏看 **base / canopy 两层层级**与位置（树冠必须在坦克之上，形成视线遮挡）。

---

## 3. 三个「不能用错」的坐标口径

管线里最容易踩的坑是**三组数字混用**（`docs/specs/map/textures.md`「出图管线」有完整说明，此处给速查）：

| 数字组 | 来源 | 含义 | 能用来干什么 |
|---|---|---|---|
| `ASSET_DEFS.w/h/anchorX/anchorY` | `js/tank_assets.js` | 烘焙函数的**输入**尺寸与名义锚点 | **不能**当落盘尺寸用 |
| `tools/cover-refs.json` 的 `canvas` | 由烘焙代码导出 | 烘焙后**内容包围盒**尺寸 | 落盘 PNG 必须与它同尺寸 |
| `tools/cover-refs.json` 的 `centroid` | 同上 | 内容质心 | **唯一验收基准** |

> **手抄 `ASSET_DEFS.w/h` 当落盘尺寸会整体缩放错位**：`tree` 实际 30×30、`tree_canopy` 58×58，
> 而 `ASSET_DEFS` 里写的是 24×18 / 78×78。

---

## 4. 坦克精灵通道 —— 现状与启用前提

### 4.1 当前状态（2026-10-23 用户裁定）

- **盘上无图**：`assets/tanks/` 下 19 张 PNG（5 车车体/炮塔 + 共用履带 + 8 根炮管，约 3.7MB）
  已全部删除。`assets/tanks/` 与 `assets/tanks/barrels/` 保留为空目录。
- **代码全保留**：`tanks/*.json` 的 `sprite` 块、`drawTankSprite`、`spriteImage` 缓存、
  设计器「整车精灵」面板（`#sp-enabled` / `#sp-preview`）、开发者面板「游戏内显示精灵」开关。
- **设计器默认不启用**：`designer.js` 的 `defaultSprite().enabled = false`。
- **判据**：`spriteEnabled(t)` = `_spriteOverride`（运行时调试开关）> `tanks/*.json` 的
  `sprite.enabled`；`spriteReady(t)` 要求四层图片全部加载完成。

### 4.2 启用前的必要条件（逐车目视确认）

1. 设计器勾「画布显示精灵」，逐车检查：**层序**（履带 < 车体 < 炮塔 < 炮管）、
   **尺寸**、**炮管与炮塔衔接**、**白边残留**；
2. 确认后把该车 `sprite.enabled` 置 `true` 保存；
3. 进游戏跑一次实战，确认无穿帮（尤其殉爆飞头、断履带时的回退路径）。

> **负向断言**：`scripts/test-tanks.js` 会检查「`sprite.enabled === true` 时 `sprite.hull/turret/track.img`
> 必须在盘上」——防止配置指向不存在的图、又悄悄开着精灵（那会静默回退，没人发现配置坏了）。

### 4.3 命名约定（2026-10-19 统一，**仍然有效**）

统一为 **`<id>_<part>.png`，全小写**：

| 类别 | 约定 | 例 |
|---|---|---|
| 车体/炮塔 | `<id>_<hull\|turret>.png` | `tiger-i_hull.png`、`leopard1_turret.png` |
| 履带 | `track-links.png`（共用） | — |
| 炮管 | `barrels/barrel-<type>.png` | `barrels/barrel-tiger-i.png` |

**坦克 id 本身不改**（`Leapard_1`、`Obj 780` 等是存档/列表引用的主键，改名需迁移逻辑，另案）。

---

## 5. 排错对照表

| 现象 | 根因 | 处置 |
|---|---|---|
| `test-asset-pipeline` 报「`cover-refs.json` 与烘焙代码不一致」 | 改了烘焙几何但没重导出基准 | `node tools/dump-cover-refs.mjs` |
| `test-asset-pipeline` 报「`prepare_covers ORDER` ≠ 基准键」 | 新增/删除了 `ASSET_DEFS` 档但没同步 `ORDER` | 改 `scripts/prepare_covers.py` 的 `ORDER` |
| `covers-anchor-check` 报「产物质心偏 N px」 | 烘焙几何破坏内容居中，或 `fit_contain` 与烘焙口径不一致 | 查 `bakeAssetCanvas` 的锚点处理（#V1 已修一次：负锚点补边） |
| `prepare_covers` 报「内容不居中于锚点 (dx,dy)」 | **这是信息展示，不是缺陷** | 忽略；真正基准是 `centroid` |
| 落盘 PNG 尺寸不符 | 手抄了 `ASSET_DEFS.w/h` | 改用 `refs.canvas` |
| 树冠半径异常大 | 直接拿高分辨率当 `w/h` 传入烘焙 | 先在名义尺寸烘焙再整体放大 |
| 游戏里地物位置偏移 | 质心验收没跑 | `covers-anchor-check.py` |
| 游戏里看不到贴图 | `assets/` 为空 → 程序化回退（**正常**） | 无需处置；确认是预期 |
| `python` 报缺 Pillow/numpy | 未设本地库路径 | `$env:PYTHONPATH = "$PWD/tmp/pylibs"` |

---

## 6. 相关文件索引

| 文件 | 角色 |
|---|---|
| `js/tank_assets.js` | 烘焙唯一实现（`ASSET_DEFS` / `bakeAssetCanvas` / `drawAsset`） |
| `tools/dump-cover-refs.mjs` | 基准导出（从烘焙代码读，**权威源**） |
| `tools/cover-refs.json` | 导出产物（**禁止手改**） |
| `tools/bake.html` | 程序化烘焙预览与导出（`file://` 直开） |
| `scripts/prepare_covers.py` | 后期贴图后处理（清底/缩放/PNG-8），自包含 |
| `scripts/covers-anchor-check.py` | 尺寸 + 质心验收 |
| `scripts/test-asset-pipeline.js` | 接线的 Node 回归（挂 `npm test`） |
| `scripts/lib/mini-canvas.js` | 离线生图垫片（Node 端 canvas 语义） |

**系统规范归口**：`docs/specs/map/textures.md`（贴图资产与烘焙层 / 坦克贴图通道 / 出图管线）、
`docs/specs/editor/visual-spec.md`（四层精灵与对齐契约）。

---

## 7. 维护纪律

1. **改烘焙几何 → 必须重导出 `cover-refs.json`**，否则 Node 链挂假失败。
2. **不手改 `cover-refs.json`**——它是导出产物。
3. **`assets/` 为空是设计允许的正常状态**（程序化回退），不是缺件。
4. 落盘后**必须跑质心验收**再进游戏。
5. **不要在这里补回出图说明**——2026-10-23 用户裁定本仓库不出图；若将来重新引入出图路线，
   按 `docs/specs/map/textures.md` 的「教训留档」先做 1× 尺度可行性预研。
