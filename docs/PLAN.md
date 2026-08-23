# Rogue Tank — 近期开发计划 (PLAN.md)

本文档是**临时规划**文档，用于细化新特性/重构的执行路径。条目在实现并验证通过后按 4 步生命周期删除并归档（正文写入 `docs/archive/<yyyy-mm>.md` 当月卷，索引行更新进 `docs/ARCHIVE.md`）。

---

### P-29 覆盖层 UI 纯逻辑下沉（低优先，随下次触碰相关界面时执行）

M10 的 Home/Loadout/Shop 三屏与既有 结算/卡牌/节点图/gameover 覆盖层目前全部内联于 `tank_mvp.html`（`renderHome`/`renderLoadout`/`renderShop`/`renderMapList`/`renderDeathShop`/`showScreen`/`hideAllScreens` 等）。按 shared-module 惯例，把**界面状态与渲染数据组装**抽为 `js/` 纯逻辑模块（如 `js/tank_screens.js`：给定 profile/run/flow 数据 → 返回视图模型；DOM 接线留内联），抑制单文件继续膨胀。原计划为「M10 构建时同步下沉」；M10 已先行内联落地（见 ARCHIVE 2026-08-22），故转为事后重构条目。验证：抽取后 `npm run check` + `npm run test:browser` 全绿 + 五屏手动走查。

---

（其余无进行中条目。远期项 P-21/P-23/P-24/P-25/P-26 见 docs/archive 快照 §6。）
