# 贴图资产管线 —— 备查手册（2026-10-19 汇编）

> **本文件的定位**：**地图元素贴图**（`assets/*.png`，covers 的地物）与**坦克精灵**（`assets/tanks/*.png`）
> 两条资产链路的**唯一流程备查文档**——把此前散在 `tools/cover-gen-manual.md`、
> `tools/cover-gen-prompts.md`、各处代码注释与 `PLAN.md` 条目里的信息收敛到一处。
>
> **不重复的地方**：提示词正文仍在 `tools/cover-gen-prompts.md`（运行时被
> `tools/gen-covers.mjs` 现解析，**不复制正文**，避免两处不同步）；逐件 prompt 的
> 网页端手抄版在 `tools/cover-gen-manual.md`。本文件只讲**管线、契约、校验、排错**。
>
> **状态（2026-10-19）**：管线已端到端跑通（mock 后端），**唯一阻塞项是出图凭据**。
> 当前 `assets/` 下**没有任何 cover 产物**，全部走程序化烘焙回退——这是**预期状态，不是缺陷**。

---

## 1. 两条资产链路的区别（先分清，否则会找错脚本）

| | **地图元素贴图**（cover） | **坦克精灵**（sprite） |
|---|---|---|
| 产物位置 | `assets/*.png`（10 个键） | `assets/tanks/*.png`（车体/炮塔/履带/炮管） |
| 运行时消费 | `js/tank_assets.js` 的 `drawAsset` / `drawAssetCanopy` | `js/tank_battledraw.js` 的 `drawTankSprite`（经 `spriteEnabled(t)` 判定） |
| 是否有图回退 | **有**：`assets/` 为空即走程序化烘焙，视觉不断档 | **有**：`spriteReady(t)` 为假时回退程序化绘制 |
| 当前启用状态 | **未出图**（全走程序化） | **未启用**（5 车 `sprite.enabled = false`，`dummy` 无 sprite 字段） |
| 生成方式 | **AI 出图**（托管 API / 网页手动）→ 后处理 → 落盘 | 已有 PNG，需**逐车目视确认对齐**后才可启用 |
| 验收脚本 | `covers-anchor-check.py` + `test-cover-gen.js` | 设计器「画布显示精灵」目视 |

---

## 2. 地图元素贴图管线（cover）—— 五步链

```
① 出图 → ② 后处理（缩放/清底/PNG-8）→ ③ 落盘 → ④ 验收 → ⑤ 目视
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
- **改任何烘焙几何/包络后必须重导出**，否则 `test-cover-gen.js` 的 `--check` 断言会红
  （见 §5 排错）。

### 2.2 ① 出图

```bash
# 托管 API（需凭据，见 §2.6）
node tools/gen-covers.mjs --provider gemini     # 或 replicate / openai
node tools/gen-covers.mjs --provider mock       # 不出网，用仓库 bake 代码出图，验证整条链

# 常用参数
--only <key>          # 只处理指定 key（分批出图）
--variants <n>        # 每卡出 n 张候选
--pick <key>=<file>   # 从候选里指定用哪张
--force               # 覆盖已存在的产物
--dry                 # 只报告不出图
```

**手动路径**（无 API Key）：网页端出图 → 下载 PNG/JPG → 放进 `tmp/covers-src/`，
再用 `--pick` 指定。逐件 prompt 见 `tools/cover-gen-manual.md`。

### 2.3 ② 后处理

```bash
python scripts/prepare_covers.py --dry                    # 试算（不写盘）
python scripts/prepare_covers.py --inplace                # 真正落盘到 assets/
python scripts/prepare_covers.py --inplace --src tmp/covers-src --out <dir>
```

做四件事：**清底**（边框洪泛，保留被本体包围的高光）→ **按内容包围盒裁留白** →
**等比缩进 `refs.canvas`**（不拉伸）→ **居中放置** → **PNG-8（16 色）**。

### 2.4 ③④ 落盘与验收

```bash
python scripts/covers-anchor-check.py                  # 验收 assets/ 下已落盘的
python scripts/covers-anchor-check.py --src <dir>      # 验收指定目录
python scripts/covers-anchor-check.py --json           # 机器可读
```

**验收基准是 `refs.centroid`（内容质心），不是 `anchor`**——这是最容易搞错的一点。
容差默认 **±2px**。`ABSENT`（缺图）**不算失败**，表示该键走程序化回退。

### 2.5 ⑤ 目视

- `tools/bake.html`（`file://` 直开）看程序化烘焙预览；
- 进游戏看 **base / canopy 两层层级**与位置（树冠必须在坦克之上，形成视线遮挡）。

### 2.6 凭据

只从**进程环境变量**或仓库根 `.env` 读取，输出按 `abcd...wxyz` 掩码。
`.env` 已在 `.gitignore` 中，样例见 `.env.example`。

| Provider | 环境变量 |
|---|---|
| Gemini | `GEMINI_API_KEY` |
| Replicate | `REPLICATE_API_TOKEN` |
| OpenAI | `OPENAI_API_KEY` |

---

## 3. 三个「不能用错」的坐标口径

管线里最容易踩的坑是**三组数字混用**（`specs/map.md` §18 有完整说明，此处给速查）：

| 数字组 | 来源 | 含义 | 能用来干什么 |
|---|---|---|---|
| `ASSET_DEFS.w/h/anchorX/anchorY` | `js/tank_assets.js` | 烘焙函数的**输入**尺寸与名义锚点 | **不能**当落盘尺寸用 |
| `tools/cover-refs.json` 的 `canvas` | 由烘焙代码导出 | 烘焙后**内容包围盒**尺寸 | 落盘 PNG 必须与它同尺寸 |
| `tools/cover-refs.json` 的 `centroid` | 同上 | 内容质心 | **唯一验收基准** |

> **手抄 `ASSET_DEFS.w/h` 当落盘尺寸会整体缩放错位**：`tree` 实际 30×30、`tree_canopy` 58×58，
> 而 `ASSET_DEFS` 里写的是 24×18 / 78×78。

**canopy 层的特殊之处**：`bakeCanopy` 用 `R = Math.max(w, h) * 1.4` 算树冠半径，
即**几何依赖传入尺寸**。所以出图必须先在名义尺寸下烘焙、再整体放大到出图分辨率
（`gen-covers.mjs` 的 mock 后端就是这么做的），**不能**直接拿 1024 当 `w/h`。

---

## 4. 坦克精灵管线（sprite）—— 现状与启用前提

### 4.1 当前状态（2026-10-19 用户裁定）

- **维持不启用**：5 车 `tanks/*.json` 的 `sprite.enabled` 全为 `false`，`dummy.json` 无 sprite 字段。
- **设计器默认也不启用**：`designer.js` 的 `defaultSprite().enabled = false`。
- **面板已提供开关**（默认关）：
  - 设计器：`#sp-enabled`（写入 tank JSON）、`#sp-preview`（仅画布预览）；
  - battle/bench 开发者面板（`` ` `` 键 → 开关 Tab）：「游戏内显示精灵」——
    运行时写 `t._spriteOverride`，**不写回存档**，判据见 `js/tank_battledraw.js` 的 `spriteEnabled(t)`。

### 4.2 启用前的必要条件（逐车目视确认）

1. 设计器勾「画布显示精灵」，逐车检查：**层序**（履带 < 车体 < 炮塔 < 炮管）、
   **尺寸**、**炮管与炮塔衔接**、**白边残留**；
2. 确认后把该车 `sprite.enabled` 置 `true` 保存；
3. 进游戏跑一次实战，确认无穿帮（尤其殉爆飞头、断履带时的回退路径）。

### 4.3 已知的参数校准记录

- 白底清理：`scripts/clean_sprite_bg.py`，16 张贴图 `background: 0`；
- 炮塔 scale/轴心已按几何重算（`hummel` 0.03413→0.048059、`panzer-IV` 0.0201→0.024476），
  10/10 部件映射长度比 0.999~1.000。

### 4.4 命名约定（2026-10-19 统一）

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
| `test-cover-gen` 报「`cover-refs.json` 与烘焙代码不一致」 | 改了烘焙几何但没重导出基准 | `node tools/dump-cover-refs.mjs` |
| `test-cover-gen` 报「产物质心偏 N px」 | 烘焙几何破坏内容居中，或 `fit_contain` 与烘焙口径不一致 | 查 `bakeAssetCanvas` 的锚点处理（#V1 已修一次：负锚点补边） |
| `prepare_covers` 报「内容不居中于锚点 (dx,dy)」 | **这是信息展示，不是缺陷** | 忽略；真正基准是 `centroid` |
| 落盘 PNG 尺寸不符 | 手抄了 `ASSET_DEFS.w/h` | 改用 `refs.canvas` |
| 树冠半径异常大 | 直接把出图分辨率当 `w/h` 传入烘焙 | 先在名义尺寸烘焙再放大 |
| 游戏里地物位置偏移 | 质心验收没跑 | `covers-anchor-check.py` |
| 游戏里看不到贴图 | `assets/` 为空 → 程序化回退（**正常**） | 无需处置；确认是预期 |

---

## 6. 相关文件索引

| 文件 | 角色 |
|---|---|
| `js/tank_assets.js` | 烘焙唯一实现（`ASSET_DEFS` / `bakeAssetCanvas` / `drawAsset`） |
| `tools/dump-cover-refs.mjs` | 基准导出（从烘焙代码读，**权威源**） |
| `tools/cover-refs.json` | 导出产物（**禁止手改**） |
| `tools/gen-covers.mjs` | 出图索引层（托管 API + mock） |
| `tools/cover-gen-prompts.md` | 提示词包（运行时现解析，不复制正文） |
| `tools/cover-gen-manual.md` | 网页端手动出图手册 |
| `tools/bake.html` | 程序化烘焙预览（`file://` 直开） |
| `scripts/prepare_covers.py` | 后处理（清底/缩放/PNG-8） |
| `scripts/covers-anchor-check.py` | 尺寸 + 质心验收 |
| `scripts/test-cover-gen.js` | 管线的 Node 回归（挂 `npm test`） |
| `scripts/lib/mini-canvas.js` | 离线生图垫片（Node 端 canvas 语义） |

**系统规范归口**：`docs/specs/map.md` §18（资产基准与出图口径）、§22~§25（纹理/材质/立体感）。

---

## 7. 维护纪律

1. **改烘焙几何 → 必须重导出 `cover-refs.json`**，否则 Node 链挂假失败。
2. **不手改 `cover-refs.json`**——它是导出产物。
3. **不手改提示词正文到本文件**——正文在 `cover-gen-prompts.md`，避免双份。
4. 出图后**必须跑质心验收**再进游戏。
5. `assets/` 为空是**设计允许的正常状态**（程序化回退），不是缺件。
