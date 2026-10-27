# 浏览器自动化测试链

> **摘要**：`npm run test:browser` 六链脚本矩阵、测试钩子与 r4 夹具约定；附 R0 渲染基线链。
> **适用版本**：现行（2026-10-27；2026-10-27 补渲染基线链）
> **源自**：`docs/specs/editor.md` §7.5（2026-10-21 拆分；原 §7.5 曾错排在 §7.6/§7.7 之后，2026-10-21 仅调物理位置、编号未改）
> **相关**：[开发者面板](./devpanel.md) · [内容工具与 appearance](./appearance-aimspeed.md) · [渲染路线](../map/rendering-roadmap.md)

## 六链脚本矩阵

`npm run test:browser` **六链脚本**（按序执行，任一失败即停）：

| 脚本 | 页面 | 覆盖 |
|---|---|---|
| `test-browser-smoke.cjs` | battle + bench | Home→Loadout→Shop→Map→battle 主链路、HUD/Tab/devPanel、弹种 E/Q 轮换、飘字、敌人开火命中、无 dummy、项目错误监听 |
| `test-browser-r3.cjs` | bench + battle | bench 技能/召唤物（炮塔/地雷/掩体注册投递）、弹种切换、G 炮击链路、掩体按钮超限拒绝（#F6） |
| `test-browser-run.cjs` | battle | 真实 run 链路、弹种三槽轮换、卡牌直系演变与跳级拒绝、G/H/V 入口、devPanel 四 Tab、卡牌选择器搜索/`/`/应用/×N/−1 回滚、雷场预约门控（#F6） |
| `test-browser-r4.cjs` | battle | **主武器各类型实战**（standard 单发 / double_barrel 空格齐射 2 发 / autocannon 连发+heatPct / railgun 单发）、**F 副武器**（mortar isArc / rocket burst / missile 锁定发射且按住不翻转 / mine_layer 按住只走一次边沿 + 雷场生成 + 触爆掉血）、**技能实战效果**（artillery 落弹掉血 / shield 吸收池 / overdrive 装填归零）、**商店购买结算**（hp_up 扣点+记录 / 复活加购 / 升级作用于开局） |
| `test-browser-ally.cjs` | battle | **A0 友军指挥**：2 辆编队生成、Z/X/C 三命令快捷键、集火目标权威（击发目标 ≡ 任务目标）、目标死亡不暗换最近敌人、非法目标整批拒绝、实际移动、HUD 与键位可发现性 |
| `test-browser-3d.cjs` | tank_3d | **R1 3D 切片**：WebGL 启动、世界生成（玩家/6 敌/2 友军）、屏幕射线地面拾取、主炮开火与**装填后再次开火**、Z/X/C 命令、命令转盘关闭、验证清单、截图产物 |

## 渲染基线链（R0 / I3，2026-10-27）

`scripts/browser-baseline.cjs` **不属于** `npm run test:browser`——它产出/比对基线而不是断言游戏逻辑，单独运行：

| 命令 | 作用 |
|---|---|
| `node scripts/browser-baseline.cjs --write` | 记录 `standard` / `boss` / `survival` 三个固定场景到 `tmp/render-baseline/` |
| `node scripts/browser-baseline.cjs --check` | 与基线比对（默认模式） |
| `--scene=boss` / `--seed=N` / `--out=dir` / `--port=N` | 只重录单场景（与既有基线合并）/ 换种子 / 换输出目录 / 指定服务端口 |

**固定条件**：1280×720、`deviceScaleFactor=1`、seed `20261027`、`Math.random` 固定序列、**进入战斗前** `setTimeScale(0)`（不推进模拟）、绘制时钟冻结在 `battleStartMs + 500`。

**采集内容**：

- 判定用：canvas 32×18 降采样网格 + 16 档亮度直方图（容差 `mean ≤ 2` / `max ≤ 16`，单通道 0..255）。
- 记录用（不判定）：`update` / `draw` 帧时间 p50/p95（`js/tank_perf.js` 环形缓冲 240 帧）、JS 堆占用（`performance.memory`，非 Chromium 为 `null`）。
- 每场景落一张 PNG（`--write` 存 `<out>/<scene>.png`，`--check` 存 `<out>/current/<scene>.png`，失败时可肉眼对比），作为「当前 Canvas 对照图」。

**基线是本地产物**（`tmp/` 已 gitignore）：不同 GPU / 字体 / 抗锯齿会让像素网格漂移，跨机器基线不可移植；CI 不跑浏览器链。判定逻辑在 `scripts/lib/render-baseline.cjs`，由 `scripts/test-render-baseline.js` 覆盖。

### 3D 场景基线（G1，2026-10-27）

`npm run baseline:3d`（`scripts/browser-baseline3d.cjs`）固定 `tank_3d.html`、1280×720、相机 `pitch 0.95 / distance 1150`，进入即 `setTimeScale(0)` 冻结；采集 32×18 网格 + PNG + 120 帧 rAF 帧时间 p50/p95 + 堆占用，输出 `tmp/render-baseline3d/`。`--write` 记录、`--check` 比对（容差同 2D 基线）；帧时间只记录、不判定。

## 边界与钩子

- **边界（浏览器不做，Node 侧覆盖）**：敌人 AI 决策与 Boss 阶段行为由 `test-ai.js` / `test-boss.js` 覆盖；浏览器仅验证敌人存在 + 开火命中。
- **测试钩子**（`tank_battle.html` 的 `window.__TEST__`，不影响生产路径）：`shells()`/`strikes()`/`profile()`/`rerenderShop()` 供 r4 采样闭包内状态；既有 `pendingMineFields`/`mineFieldPreview`/`giveCard`/`skipToNode`/`setTimeScale` 复用。

## r4 夹具约定

（2026-09-20 实测踩坑后固化）

1. **发射计数只统计 `shooter.id === 'player'`** —— `firePrimaryShell` 同时服务敌方/友军 AI，不过滤会把敌方射击算成玩家发射；
2. **夹具冻结全体敌人**（`maxHp/hp=1e6`、`immobT/reloadT=9999`），避免敌方还击打死玩家与「敌方全灭 → `isClearing` 跳过整个开火轮询块」造成的假失败；
3. **雷场枚数统计 `spawnMine` 调用次数**而非存活地雷数（触发半径 45px，目标站在场内会被立即引爆）；
4. **注入顺序**：`addScriptTag` 包装全局必须在 `page.reload()` **之后**，且 `waitForFunction` 的 `{timeout}` 必须作为**第三个**参数。

## 验证状态

六链 **ALL PASS / EXIT=0**（2026-10-27 实测；3D 链在无头 Edge 下走 SwiftShader WebGL）。

> **沙箱限制**：沙箱内跑 browser 链需按 `sandbox-verify` 一次性放宽进程权限（`spawn EPERM`），复用已监听的 server 可避开 listen 拒绝。失败时输出 `INCONCLUSIVE` + 退出码 **86**——**那是环境未放开，不是代码失败**。

实测中发现的 3 处真实缺陷（battle `devNoVision` TDZ、bench 陈旧复选框接线、开关类副武器 F 逐帧翻转）均已修复，见 `DEVELOPMENT.md` §4.27；F 键边沿口径归口 [战斗规范 · 开关类副武器](../combat/abilities-secondary.md)。

## 相关页面
- [开发者面板](./devpanel.md) — 六链中被验证的 devPanel 四 Tab 与卡牌选择器
- [内容工具与 appearance](./appearance-aimspeed.md) — NF-* 工具的验证归属
- [坦克设计器](./designer.md) — 设计器不在六链范围内（无浏览器自动化）
