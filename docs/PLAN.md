# Rogue Tank — 近期开发计划 (PLAN.md)

本文档是**临时规划**文档，用于细化新特性/重构的执行路径。条目在实现并验证通过后按 4 步生命周期删除并归档进 `ARCHIVE.md`。

---

## 2026-08-22 规划：工程解耦两则（P-28 / P-29）

### P-28 战斗核心管线解耦：mvp⇄bench 双份收敛到 `js/tank_fire.js`（优先执行）

#### 背景与证据（已核实）
`tank_mvp.html` 与 `tank_bench.html` 各自内联了同一套战斗核心，且已实质分叉（同函数逐行比对 DIFFERS）：

| 函数 | tank_mvp.html | tank_bench.html | 状态 |
|---|---|---|---|
| `shellVerticalDecision`（半高掩体拦截判决） | ~320 行 | ~197 行 | **DIFFERS** |
| `updateSolution`（瞄准预测解算） | 85 行 | 88 行 | **DIFFERS** |
| `fireTank`（通用开火管线） | 69 行 | 68 行 | **DIFFERS** |
| `tryFire` / `drawCone` / `updateHud` / shells 飞行积分块 | — | — | 各自维护 |

具体漂移实例：mvp 的 HE 破障带护盾吸收守卫 `!s.absorbed`（tank_mvp.html ~L1594），bench 无此守卫（tank_bench.html ~L902）；P-16 弹种预测修正、烟幕分支只存在于 mvp 侧。**任何弹道/掩体判决修复都要双改双测**，是 #18/#23 类回归成本的根源。

#### 方案
- 新建 `js/tank_fire.js`（纯逻辑 + ctx 显式注入，遵循 shared-module-dev 惯例）收编：`fireTank`/`tryFire`/`shellVerticalDecision`/`updateSolution` + shells 飞行积分循环的物理/判定部分；依赖经 ctx 显式传入（covers/entities/fx/audio/RULES 钩子）。
- 两页面只保留输入处理/HUD/DOM 胶水，战斗管线统一 require 同一模块（浏览器全局脚本按序加载）。
- 顺手项（不单独立项）：两页重复的小胶水 `renderAmmoIndicator`/`setAmmo`/`logClear`/`pushLog`/`unlockAudio` 收进薄共享层。
- 附带收益：缓解 test-browser-smoke 对 mvp IIFE 闭包不可达的测试难题（管线入 js/ 后可 vm 直测）。

#### 执行顺序约束
**先于下一批触碰弹道管线的战斗工作执行**——特别是 §6 条目 27「卡牌 × Loadout 衔接」（ammo 效果改造将同时触及 fireTank/ammoLoadout），先收敛可避免改动在双份代码里各落一遍。

#### 涉及文件与验证路径
| 步骤 | 内容 | 涉及文件 | 验证方式 |
|---|---|---|---|
| 1 | 抽取 `js/tank_fire.js`（fireTank/tryFire/shellVerticalDecision/updateSolution/飞行积分） | 新 `js/tank_fire.js` | 新增 `scripts/test-fire.js` Node 单测（掩体判决/弹种消费/跳弹语义） |
| 2 | mvp/bench 改为加载共享模块并删内联副本 | `tank_mvp.html`, `tank_bench.html`, `scripts/check-html.js` 冒烟清单 | 双页手动冒烟：开火/跳弹/半高拦截/HE 溅射/烟幕/护盾吸收 |
| 3 | 小胶水共享层（可选顺手项） | 视抽取结果定 | `npm run check` |
| 4 | 全量回归 | 全部 | `npm run check` + `npm test` + `npm run test:browser` 全绿 |

---

### P-29 覆盖层 UI 纯逻辑下沉（低优先，随下次触碰相关界面时执行）

M10 的 Home/Loadout/Shop 三屏与既有 结算/卡牌/节点图/gameover 覆盖层目前全部内联于 `tank_mvp.html`（`renderHome`/`renderLoadout`/`renderShop`/`renderMapList`/`renderDeathShop`/`showScreen`/`hideAllScreens` 等）。按 shared-module 惯例，把**界面状态与渲染数据组装**抽为 `js/` 纯逻辑模块（如 `js/tank_screens.js`：给定 profile/run/flow 数据 → 返回视图模型；DOM 接线留内联），抑制单文件继续膨胀。原计划为「M10 构建时同步下沉」；M10 已先行内联落地（见 ARCHIVE 2026-08-22），故转为事后重构条目。验证：抽取后 `npm run check` + `npm run test:browser` 全绿 + 五屏手动走查。

---

### P-30 文档分卷：ARCHIVE.md 按月拆卷 + 大文档读取纪律落地（低优先，ARCHIVE 再增 ~50KB 时执行）

**背景**：`docs/ARCHIVE.md` 已 ~165KB 且只增不删；2026-08-22 复盘证实 agent 对巨型单体文档反复全文读取是子代理死循环的系统性根因之一（同会话内主 agent 也两次背靠背全文读同一 165KB 文件）。

**方案**：
- ARCHIVE.md 保留「归档索引表」（轻量、常查），正文按月分卷：`docs/archive/2026-08.md` 起逐月迁移原文，`ARCHIVE.md` 正文替换为各卷链接；只增不删语义不变。
- 配套：`AGENTS.md §3.5`「大文档 grep 优先、禁全文读取」约定已先行生效（本批次落地）；`.opencode/agents/test-runner.md` 与 `docs-agent.md` 已写入硬性迭代上限与切片读取纪律。

**验证**：分卷后 `AGENTS.md`/各 agent 配置中的路径引用全部更新；`grep -r "ARCHIVE.md"` 无断链；文档生命周期 4 步在新结构下演练一次。

---

（其余无进行中条目。）
