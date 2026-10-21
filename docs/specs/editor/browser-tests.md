# 浏览器自动化测试链

> **摘要**：`npm run test:browser` 四链脚本矩阵、测试钩子与 r4 夹具约定。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/editor.md` §7.5（2026-10-21 拆分；原 §7.5 曾错排在 §7.6/§7.7 之后，2026-10-21 仅调物理位置、编号未改）
> **相关**：[开发者面板](./devpanel.md) · [内容工具与 appearance](./appearance-aimspeed.md) · [兼容索引](../editor.md)

## 四链脚本矩阵

`npm run test:browser` **四链脚本**（按序执行，任一失败即停）：

| 脚本 | 页面 | 覆盖 |
|---|---|---|
| `test-browser-smoke.cjs` | mvp + bench | Home→Loadout→Shop→Map→battle 主链路、HUD/Tab/devPanel、弹种 E/Q 轮换、飘字、敌人开火命中、无 dummy、项目错误监听 |
| `test-browser-r3.cjs` | bench + mvp | bench 技能/召唤物（炮塔/地雷/掩体注册投递）、弹种切换、G 炮击链路、掩体按钮超限拒绝（#F6） |
| `test-browser-run.cjs` | mvp | 真实 run 链路、弹种三槽轮换、卡牌直系演变与跳级拒绝、G/H/V 入口、devPanel 四 Tab、卡牌选择器搜索/`/`/应用/×N/−1 回滚、雷场预约门控（#F6） |
| `test-browser-r4.cjs` | mvp | **主武器各类型实战**（standard 单发 / double_barrel 空格齐射 2 发 / autocannon 连发+heatPct / railgun 单发）、**F 副武器**（mortar isArc / rocket burst / missile 锁定发射且按住不翻转 / mine_layer 按住只走一次边沿 + 雷场生成 + 触爆掉血）、**技能实战效果**（artillery 落弹掉血 / shield 吸收池 / overdrive 装填归零）、**商店购买结算**（hp_up 扣点+记录 / 复活加购 / 升级作用于开局） |

## 边界与钩子

- **边界（浏览器不做，Node 侧覆盖）**：敌人 AI 决策与 Boss 阶段行为由 `test-ai.js` / `test-boss.js` 覆盖；浏览器仅验证敌人存在 + 开火命中。
- **测试钩子**（`tank_mvp.html` 的 `window.__TEST__`，不影响生产路径）：`shells()`/`strikes()`/`profile()`/`rerenderShop()` 供 r4 采样闭包内状态；既有 `pendingMineFields`/`mineFieldPreview`/`giveCard`/`skipToNode`/`setTimeScale` 复用。

## r4 夹具约定

（2026-09-20 实测踩坑后固化）

1. **发射计数只统计 `shooter.id === 'player'`** —— `firePrimaryShell` 同时服务敌方/友军 AI，不过滤会把敌方射击算成玩家发射；
2. **夹具冻结全体敌人**（`maxHp/hp=1e6`、`immobT/reloadT=9999`），避免敌方还击打死玩家与「敌方全灭 → `isClearing` 跳过整个开火轮询块」造成的假失败；
3. **雷场枚数统计 `spawnMine` 调用次数**而非存活地雷数（触发半径 45px，目标站在场内会被立即引爆）；
4. **注入顺序**：`addScriptTag` 包装全局必须在 `page.reload()` **之后**，且 `waitForFunction` 的 `{timeout}` 必须作为**第三个**参数。

## 验证状态

四链 **ALL PASS / EXIT=0**（2026-09-20 实跑，r4 连跑 3 次全绿）。

> **沙箱限制**：沙箱内跑 browser 链需按 `sandbox-verify` 一次性放宽进程权限（`spawn EPERM`），复用已监听的 server 可避开 listen 拒绝。失败时输出 `INCONCLUSIVE` + 退出码 **86**——**那是环境未放开，不是代码失败**。

实测中发现的 3 处真实缺陷（mvp `devNoVision` TDZ、bench 陈旧复选框接线、开关类副武器 F 逐帧翻转）均已修复，见 `DEVELOPMENT.md` §4.27；F 键边沿口径归口 [战斗规范 · 开关类副武器](../combat/abilities-secondary.md)。

## 相关页面
- [开发者面板](./devpanel.md) — 四链中被验证的 devPanel 四 Tab 与卡牌选择器
- [内容工具与 appearance](./appearance-aimspeed.md) — NF-* 工具的验证归属
- [坦克设计器](./designer.md) — 设计器不在四链范围内（无浏览器自动化）
