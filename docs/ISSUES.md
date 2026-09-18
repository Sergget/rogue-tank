# Rogue Tank — 工程问题清单（已核实）

> **临时文档**：只存放**待处理 / 处理中**的已核实问题。每条必须有代码证据（`file:line`）与复现/触发条件；绝不收录未核实项。
> 条目**修复并验证有效后**按 `AGENTS.md` 4 步生命周期收尾：结论同步 `DEVELOPMENT.md` / `specs/` → 删除本条目 → 原文归档 `docs/archive/<yyyy-mm>.md` → 联动下一步计划。
> 已解决并归档的历史条目（#1~#26、#44、#49、#60~#101、#A1~#A28、#B1~#B11、#C1~#C4/#C6）：见 `docs/ARCHIVE.md` 索引表。

---

## 当前待处理问题

### #C5 mvp ⇄ bench UI/按键不统一 + 开发者面板功能细化 — `待处理`

> 2026-09-17 会话裁定：#C5 与 PLAN.md §3（开发者面板 Tab 分页方案）**合并暂缓**，后续专轮处理；其余 2026-09-17 反馈条目（#C1~#C4/#C6）已修复归档（见 `docs/DEVELOPMENT.md` §4.20）。

**a. 按键不统一（键位源已共享，差异=注册差异，`js/tank_bindings.js:28-40`）**
- 仅 mvp：1/2/3 技能池、F、H/Shift+H、4/5/6、Tab、F12、ESC、F1、滚轮缩放、右键阻止菜单；仅 bench：方向键（第二驾驶位开靶车）。
- **同键不同语义（冲突）**：G（mvp=炮击 / bench=超级火控 Buff，`bench:465`）、V（mvp=超装填 / bench=超级速度 Buff，`bench:466`）。
- **真 bug：bench 弹种条 Q/E 提示颠倒**——`tank_bench.html:490` 把 Q 标在「下一个弹种格」，实际 E=下一个（`js/tank_bindings.js:33`；mvp 正确版 `tank_mvp.html:656`）；bench 玩家按提示按 Q 得到的是上一个弹种。
- 陈旧文案：bench 图例仍写「1/2/3 弹种切换」（`bench:271`，数字键 2026-09-13 已摘除且无效）；mvp 弹种槽按钮 title 仍写「1号主弹药 (1)」（`tank_mvp.html:293-295`）。
- bench 的 Tab 未 preventDefault（`bench:457-469` 未含）→ 落到浏览器焦点遍历。

**b. HUD/面板同功能两套实现**：血条（bottomHud vs 右栏文字）、装填指示（环形 vs 横条 `bench:193-196`）、弹种条（两份 `renderAmmoIndicator`：`mvp:648-683` vs `bench:482-522`）、日志（切换浮层 vs 常驻栏）、散布锥（250px 短锥 vs 全长 1σ+2σ）、FPS 读数（两份实现/存储）——重复实现清单见调查（9 处：`renderAmmoIndicator`/`updateHud`/散布锥/摄像机初始化/`genNodeBtn`/`loadCardPool`（对 `/api/cards` 形态假设还不一致）/FPS 循环/鼠标开火状态机/卡牌应用路径）。

**c. 开发者面板功能细化（用户点名）**
- mvp `#devPanel`（/F12）7 区块：调试开关（超级精度/无视野/随机战场/重置）、数值临时调整（穿/伤/装填/极速/马力 devOverrides）、实时参数、发射解算、卡牌选择器、已持有卡牌、修饰器列表（可改可删）（`tank_mvp.html:417-489`）。
- bench `#benchPanel` 仅 2 区块（作弊开关 + 键位表，`bench:159-189`）。
- bench 独有：无敌常驻、秒装填、满血重置、清场、面板状态持久化；mvp 独有：散布归零、无视野、stats 覆盖、修饰器编辑器、实时参数。两页面板功能粒度需统一规划。
- **PLAN.md §3 已有 mvp devPanel 改进方案（Tab 分页 + 卡牌选择器重构 + 搜索 + 单卡回滚），待用户裁定后实施**；本条细化范围应覆盖两页统一。

---

## 核验记录（2026-09-17，节选—与 #C5 相关）

- 核实方式：4 路只读调查（① 地图/射速 ② 卡牌 ③ 技能/副武器 ④ mvp/bench 对比），全部结论携带 `file:line` 证据，未修改任何代码文件（完整记录随 #C1~#C4/#C6 归档至 `docs/archive/2026-09.md`）。
- 调查附带发现已并入 #C5a：bench Q/E 提示颠倒与 Tab 未 preventDefault。
