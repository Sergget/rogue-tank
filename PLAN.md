# 功能与重构计划（Features & Refactoring Plan）

> 本文档是**临时文档**：只存放 "进行中 / 待实施" 的计划条目。
> 条目**实现并验证完成后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。
> 本文档不保存已完成的历史（历史计划见 `ARCHIVE.md`）。

---

## 当前进行中条目

### P-02 模块化重构：内联大脚本下沉 + 数据去重

**背景**：`tank_mvp.html`（内联 ~1300 行）与 `tank_designer.html`（内联 ~1500 行）各自持有可共享的实现；`tank_list.json` I/O 逻辑在三个原型里重复三份；若干配置数据与 `RULES` 重复。

**状态**：子条目 1~6 已完成（P-03 先行拆分 / listio / paintBarrel / 配置表下沉 / 数据去重 / tank_move），见 `DEVELOPMENT.md` §3.6 与 `ARCHIVE.md`。剩余第 7 条（可选）：

7. **`js/tank_battledraw.js`**（可选，低优先）：mvp 战斗场景绘制层（`drawTank`/`drawBrokenTracks`/`drawCharredHull`/`drawFireGlow`/`drawShells`/`drawCover`/`drawFoliage`/`drawClassBadge`，~400 行）仿 `tank_fx.js` 先例 ctx 显式传参下沉。测试台专用块（`drawRange`/`addRangeShot`/`AMMO_KEYS`/`RANGE_*`）留在 mvp 不拆。

**验证路径**：每批 `npm run check` + `npm run test` 全绿；dev server 手动过一遍三个原型（加载/切换坦克、设计器保存回写、对比页编辑保存）。

---