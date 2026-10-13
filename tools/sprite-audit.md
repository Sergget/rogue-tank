# 坦克贴图资产审计报告

> 目标：修复不合格贴图、补齐缺失炮管、为后续批量制作做准备
> 核查日期：2026-10-10

## 1. 现状一览

| 部件 | 现有文件 (assets/tanks/) | 合格 | 备注 |
|---|---|---|---|
| track-links.png | ✅ | 全车共用履带贴图 |
| hulls | Leapard_1_hull / tiger-I_hull / panzer-IV_hull / hummel_hull / Obj780_hull | 4/5✅ | 命名不一致（Leopard1 vs Leapard_1）|
| turrets | leopard1-turret / tiger-I_turret / panzer-IV_turret / hummel_turret / obj780-turret | 4/5✅ | 同上，Tiger-I hull 体积 2.4MB 偏肥 |
| barrels (标准炮管) | barrel-standard.png | ✅ | 通用 |
| barrels (自行车管) | barrel-autocannon.png | ✅ | 通用 |
| barrels (磁轨炮) | barrel-railgun.png | ✅ | 通用 |
| barrels (hummel 专用) | barrel-hummel.png | ✅ | hummel.json ✅ 引用 |
| barrels (panzer-IV 专用) | barrel-panzer-IV.png | ✅ | panzer-IV.json ✅ 引用 |

## 2. 缺口：缺少的专用炮管

| 车型 | 缺缺专用枪管 (imgVehicle) | 当前回退 | 影响 |
|---|---|---|---|
| **Leopard 1** | `assets/tanks/barrels/barrel-leopard-1.png` ❌ 缺 | barrel-standard | 标准炮管图不能代表 90mm 平装 |
| **Tiger I** | `assets/tanks/barrels/barrel-tiger-I.png` ❌ 缺 | barrel-standard | 88mm 高平两种都应有专属 |
| **Obj 780** | `assets/tanks/barrels/barrel-obj780.png` ❌ 缺 | barrel-standard | 双联 122mm/130mm 炮管 |

> 结论：3 车型合计缺 3 根专用炮管贴图。
> 修复优先级：Tiger I / Leopard 1 > Obj 780（后者为 Boss 专用，渲染稀少）。

### 2.1 为何 `imgVehicle` 重要

`tank_battledraw.js:308-319` 的 `spriteBarrelImages` 决定逻辑：

```js
const std = b.imgVehicle || b.imgStandard || 'assets/tanks/barrels/barrel-standard.png';
```

因此只要填了 `imgVehicle` 字段即可无缝接入，无需改代码。

## 3. 不合格贴图（2026-10-10 复测修正）

> ⚠️ 本节原判断「白底 / 半透 / 需重新导出」**已作废**：§4.56 #M4 的可达性准则清理已把
> 外部白底清零（本次复测 `scripts/clean_sprite_bg.py --dry` 全部 16 张 `background: 0`，
> `semi_transparent_near_white = 0`）。**唯一真实缺口是体积**，已于同日用
> `scripts/optimize_sprites.py --colors 256 --inplace` 解决。

| 项 | 修复前 | 修复后 |
|---|---|---|
| assets/tanks 总量 | 15.6 MB | **6.1 MB（-60.0%）** |
| tiger-I_hull.png | 2.29 MB | 925 KB |
| hummel_hull.png | 2.06 MB | 719 KB |
| 其余 13 张 | — | 各降 31%~85% |

- 手段：RGBA → PNG-8 调色板（`MEDIANCUT`，256 色），**二值 alpha 逐像素保全**。
- 验证（与 git HEAD 原图逐像素比对）：`mean_abs_err ≤ 2.1/255`；`alpha_diff_px = 0`。
- **尺寸未动**：2400×2700 级像素数仍是主要体积来源。缩图需联动
  `tanks/*.json` 的 `sprite.hull/turret/track.scale`（`paintPartSprite` 用
  `naturalWidth × scale`），属独立一批（见 PLAN §1）。

> 另：命名风格不一致（`Leapard_1` vs `tiger-I` vs `leopard1-turret`），仍待统一。

## 4. 对齐问题（sprite 配置层）

### 4.1 配置不一致
`hummel.json`、`panzer-IV.json`、`tiger-I.json`、`Obj 780.json`、`Leapard_1.json`
均已接入 `sprite.enabled=true`，唯 `dummy.json` 缺 `sprite` 块 ——但 dummy 走程序化绘制即可，无影响。

### 4.2 锚点/缩放未标准化
各配置文件 `sprite.hull.scale`、`sprite.turret.pivot` 数值各异，缺少统一校准模板。
设计器 `tank_designer.html` 缺“批量导入/校验sprite参数”功能 ——易人工校错。

### 4.3 渲染层潜在 bug
`tank_battledraw.js:413-414`：
```js
ctx.ellipse(0, 0, hi.naturalWidth*(h.scale||0)*0.52, hi.naturalHeight*(h.scale||0)*0.52, 0, 0, TAU);
```
`0.52` 硬编码阴影半径，当 `scale=0`（track 层）会退到 0 —— 幽浮硬编码魔数，应挂 `RULES` 或 `sprite.hull.shadowScale`。

> 这条非紧急，我会单列一个 ISSUE 编号。

## 5. 地图元素贴图
`assets/` 根目录（用于 `tank_assets.js` 的地图元素 PNG）**目前为空** —— 全部走程序化 `bake` 回退，视觉零变化。
无需图像 MCP，可直接 `tools/bake.html` 导出。

## 6. MCP 调研结论（2026-10-10，npm registry 逐包实测）

> 结论先行：**生产贴图不需要图像生成 MCP**。项目已有确定性管线
> （`js/tank_assets.js` 的 `ASSET_DEFS` + `bake()` 纯函数 + 显式锚点、`tools/bake.html`
> 的 `toBlob` 导出、`scripts/clean_sprite_bg.py`），本轮体积问题也已由
> `scripts/optimize_sprites.py` 解决。MCP 的正确定位是**概念参考图**与**自动化验收**。

### 6.1 为什么生成式模型不适合做生产贴图

| 失效模式 | 对本项目的具体后果 |
|---|---|
| 尺寸离散（1024²/1536²） | 无法满足 `ASSET_DEFS` 的精确 `w/h`；缩放破坏 alpha 边缘 |
| 锚点不可控、每次漂移 | 与「锚点落在画布内 ≥1px」的契约直接冲突，炮塔会偏心 |
| 爱烘焙地面投影/渐变底 | 俯视 2D 里是 bug（历史痛点「白底/半透」正是此因） |
| 默认 3/4 透视 | 提示词纠正不可复现 |
| **帧间不一致**（最致命） | 爆炸/烟雾逐帧独立生成，尺寸/视角/爆心全跳变，做不了 spritesheet |
| 许可来源不透明 | FLUX 微调训练数据来源不明 |

### 6.2 可用 / 不可用清单（2026-10-10 实测）

| 包 | 版本 | 状态 | 适配度 |
|---|---|---|---|
| `comfyui-mcp` | 0.52.205 | 社区，本地 ComfyUI 178 工具，软件免费，**尺寸完全可控** | 中（唯一可控生成分支） |
| `mcp-image-adapter` | 1.0.0 | 路径进 base64 出，让 agent 能自查烘焙贴图 | 高（补「视觉回归闭环」） |
| `@playwright/mcp` | 0.0.83 | **微软官方**，截图 `tools/bake.html` / 战斗页做回归 | 高 |
| `@modelcontextprotocol/server-filesystem` | 2026.8.31 | 官方 | 中（现有 read/write 已够用） |
| `replicate-mcp` | 0.9.0 | **Replicate 官方**，`REPLICATE_API_TOKEN`，付费，返 URL 不返字节 | 中低，需代理 |
| `@volcengine/ark-cli` | 1.0.37 | 火山方舟官方，国内直连 | 中（概念图） |
| `@reaatech/media-pipeline-mcp-replicate` | 0.4.0 | 放大 + BRIA RMBG 去背景 + inpainting | 中 |

**不存在 / 别装**：
- `mcp.fal.ai` 实测 **404**，npm `mcp-fal` / `@fal-ai/mcp` 均 **404**——fal 无官方 MCP。
- OpenAI(gpt-image)、HuggingFace **无官方图像 MCP**。
- npm `mcp-server-git` 已被占为 `0.0.1-security` 占位包；`@modelcontextprotocol/server-fetch`(npm) 不存在——git/fetch server 走 **PyPI + `uvx`**。
- **ImageMagick / Pillow / pngquant / optipng 没有任何成熟 MCP 封装**，不要为「统一走 MCP」去装不存在的包。
- `mcp-image-generator`(npm) 看似 ModelScope 官方，实为 v1.0.1 一行描述 + `your-username` 占位 homepage 的**垃圾包**。

### 6.3 DSH 的 MCP 配置方式（本机实证）

DSH **不读** `.mcp.json` / `claude_desktop_config.json`，读 `$DSH_HOME/cordis.patch.yml`
（本机：`E:\Code\dsh_home\cordis.patch.yml`）：

```yaml
- insert:
    - id: mcp-playwright
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: playwright
        transport: stdio
        command: npx
        args: ["-y", "@playwright/mcp@latest", "--isolated"]
        reconnect:
          enabled: true
```

patch **整行替换 config 而非深度合并**；`patchReload: live` 热监视，新增无需重启。

⚠️ **中国网络**：本机已有实证——Brave Search MCP 因 `api.search.brave.com` 直连超时被移除。
同理 replicate.com / fal.ai / huggingface.co 大概率需代理；npm registry 与国内 API
（魔搭 / 火山方舟 / 阿里百炼 / 可灵）直连可用。

### 6.4 零 MCP 的本地工具链（本轮已落地）

```powershell
$env:PYTHONPATH = "$PWD/tmp/pylibs"     # Pillow + numpy（工作区本地库，不污染全局）
python scripts/optimize_sprites.py                 # 体检报告（只读）
python scripts/optimize_sprites.py --colors 256    # 试算
python scripts/optimize_sprites.py --colors 256 --inplace
```

### 6.5 绘图 MCP 实测（2026-10-10，非文生图：命令式绘制 / 代码渲染）

用户裁定接入（2026-10-10）：**dotloom-mcp + @playwright/mcp** 两枚；Aseprite 系条件具备后启用。

| 候选 | 实测内容 | 结果 |
|---|---|---|
| `dotloom-mcp` 1.0.0（npm，Node ≥22.13，`--standalone`） | 38 工具 / 101 条命令；`create_document` 16 色 `paletteLocked` + 5 层 → `apply_ops` 批量 op（`atomic`/`preview.scale`）→ `evaluate` 质量门 → `export_png` | ✅ **128×64 坦克 + 64×28 沙袋各 1**，op 全成功（43+16 / 18+14），evaluate **0.912 / 0.952 双 pass**，导出 1:1 与 ×4 全 RGBA 透明 |
| `@playwright/mcp`（微软官方；server 实报 Playwright 1.64.0-alpha） | `browser_run_code_unsafe`：`page.goto(file://…svg)` + `screenshot({omitBackground})` | ✅ 256×128 RGBA，与直连 playwright-core 输出**字节一致**（12459B / 5899B） |
| `aseprite-mcp-server` 0.3.0（npx 可跑，120 工具；同族 `@pebbly/aseprite-ai-artist`、`@letsagents/aseprite-mcp` 同样需本体） | `doctor` → `Aseprite executable not found`（18 个常见路径已查） | ⛔ **NOT READY**——装 Aseprite 后启用即首选 |

**分工**：dotloom = 像素风贴图生产主力（op 脚本确定性可复现、16 色锁色对齐 pixel-art-sprite skill、evaluate 自动质检过门再入库）；@playwright/mcp = 真实感 SVG→PNG 渲染 + `bake.html`/页面回归截图（§6.2 原定位不变）；Aseprite = 装本体后的动画/图集升级位。

**接入方式（经 Web GUI「MCP 服务器配置」插件卡添加，HMR 热加载；勿手改托管 yml）**：

| serverName | transport | command | args |
|---|---|---|---|
| `dotloom` | stdio | `cmd` | `/c npx -y dotloom-mcp --standalone` |
| `playwright` | stdio | `cmd` | `/c npx -y @playwright/mcp --browser msedge --headless --allow-unrestricted-file-access --timeout-navigation 90000` |

**实测坑（接入即避）**：@playwright/mcp 首调含浏览器冷启动易超 30s 超时（`--timeout-navigation 90000` 缓解）；`browser_take_screenshot` 必填 `scale`；透明底须走 `browser_run_code_unsafe` + `omitBackground`（工具默认白底）。dotloom 侧 initialize/首调需给足超时（npx 冷下载可 >120s）；**`draw_polygon` 的 `points` 仅接受整数坐标**（浮点顶点直接 `invalid_params` 且 `atomic: true` 整批回滚——几何模型顶点先取整再喂，2026-10-10 虎式实测）。

**产物与边界**：样张与脚手架在 `tmp/mcp-trials/`（`tmp/` 已 gitignore；`mcp-trial.mjs` 为可复用 stdio MCP 客户端）。**示例不直接入 `assets/`**——入库仍走锚点对齐 + `optimize_sprites.py` 压缩流程；当前模型无图像输入，目视确认留用户侧（§4.61 同类记录）。

## 7. 工作流安排

| 步 | 工具 | 产物 | 状态 |
|---|---|---|---|
| 1 | `scripts/optimize_sprites.py --colors 256 --inplace` | 15.6 MB → 6.1 MB | ✅ 2026-10-10（未提交；2026-10-12 从 HEAD 原图一步重做，见步 3） |
| 2 | 补齐 3 根专用炮管 | `barrel-tiger-I/-leopard-1/-obj780.png` | ✅ 2026-10-10 初始生成（§4.61），2026-10-12 修正管径（§4.66：`width` 百分比 vs 模型单位） |
| 3 | 贴图缩放（第二阶段） | `--max-width 1200 --sync-tanks` + 像素回归 | ✅ **2026-10-12 完成（§4.65）**：15/19 张缩至 1200px，15.6MB → **4.0MB（-74%）**；9 个 hull/turret 部件 JSON scale/pivot 自动同步；像素回归 10/10 格通过（包围盒偏差 ≤2px、MAE 0.253/255） |
| 4 | 统一命名与 JSON 引用 | 编辑 tanks/*.json | ⬜ 待做（PLAN §1 条目 6；坦克 id `Leapard_1` 不改） |
| 5 | 校准锚点 | tools/bake.html | ⬜ 人工/设计器 |
| 6 | 批量导入工具 | tank_designer.html PR | ⬜ 后续 |

**缩放命令（现行口径，2026-10-12）**：
```powershell
$env:PYTHONPATH = "$PWD\tmp\pylibs"
python scripts/optimize_sprites.py --colors 256 --max-width 1200 --inplace --sync-tanks
```
新贴图入库后跑一次收口；缩图判据与回归方法见 `docs/specs/editor.md` §6「缩图与 JSON 同步」。

## 8. 下一步
- 优先做第 2 步（3 根炮管）：缺图不影响现有渲染（已回退 `barrel-standard`），属纯增量。（**已被 §4.61 取代 2026-10-10**：`scripts/gen_barrels.py` 已补齐 tiger-I/Leapard_1/Obj780 三根。）
- 第 3 步（缩放）收益最大但需动 `tanks/*.json` 的 `scale`，务必配渲染像素级回归后再落地。
- 若日后要装 MCP，优先 `@playwright/mcp`（回归）+ `mcp-image-adapter`（自查）；
  出图通道按需选 `comfyui-mcp`（本地可控）或 `@volcengine/ark-cli`（国内直连）。
- **绘图 MCP 已裁定接入 dotloom-mcp + @playwright/mcp**（2026-10-10 用户裁定，实测见 §6.5）：像素风新贴图优先用 dotloom 命令式绘制（`evaluate` 过门 → 锚点对齐 → 压缩入库），真实感底图用 SVG + playwright 渲染；Aseprite 装本体后补接（`doctor` 现为 NOT READY）。
