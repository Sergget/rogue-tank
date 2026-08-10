# 功能与重构计划（Features & Refactoring Plan）

> 本文档是**临时文档**：只存放 "进行中 / 待实施" 的计划条目。
> 条目**实现并验证完成后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。
> 本文档不保存已完成的历史（历史计划见 `ARCHIVE.md`）。

---

## 当前进行中条目

### P-01 命中部位由鼠标径向意图决定（打炮塔 / 打车体）

**问题**：命中车体还是炮塔由 `bestTankHit`（炮塔恒优先）+ 散布落弹方位共同决定，玩家无法用输入影响，体感"完全随机"。

**方案**（已定稿）：开火瞬间沿"无散布瞄准线"把鼠标投影到炮口距离上，与目标最近碰撞距离比较：
- `鼠标投影 > 目标碰撞距离 + partProbe` → 打**炮塔**（上部）；
- `鼠标投影 < 目标碰撞距离 - partProbe` → 打**车体**；
- 处于死区内 → `auto`（保持现状：炮塔优先，兼容 `ARCHIVE.md #2` 修复）。
- 掩体：垂直剖面单一判定（2026-08-10 修订，取代原"首选部位全遮蔽才回退"决策）——所选部位被半高掩体拦就是被拦截，不回退改打另一部位；引导玩家改打炮塔（详见 `DEVELOPMENT.md` §2.5）。
- 预测面板 `updateSolution` 用**同源逻辑**显示"本次将命中部位"，与实弹判定一致。

**改动**：
1. `js/tank_rules.js` → 新增 `RULES.aim = { partProbe: 12 }`（死区 px）。
2. `js/tank_geometry.js` → 新增 `aimPartPreference(...)`（纯投影判定，返回 `'turret'|'hull'|'auto'`）与 `bestHitForPref(hits,minT,maxT,pref)`（按偏好取部位命中）；`bestTankHit` 保留不动。
3. `tank_mvp.html` → `tryFire` 预算并写 `shell.hitPref`；炮弹循环改用 `bestHitForPref` + 掩体回退；`updateSolution` 同源预览。
4. 测试：新增 `scripts/test-hitpart.js`（Node 覆盖两函数与死区边界），`package.json` `test` 脚本跑两个测试文件。

**玩法价值**：炮塔正面 140 > 车体正面 110——打炮塔=穿透难但拆炮手/装填手/弹药架（debuff/殉爆）；打车体=穿透易但打引擎/驾驶员/履带。

**验证路径**：`npm run test` + `npm run check` 全绿；dev server 下真机手感标定 `partProbe`。

**决策清单**：
- [x] 交互：仅鼠标位置（不加快捷键位）
- [x] 反馈：仅预测面板（`solPart`），不画画面标记
- [x] 掩体：垂直剖面单一判定（2026-08-10 修订，见上方方案说明）
- [x] 实现 + 测试（全绿）
- [ ] `partProbe=12` 体感标定（可调）

**上次完成批次**（2026-08-13，命中意图 + 掩体回退逻辑实现与 Node 测试）见 `DEVELOPMENT.md` §3.6 / §3.7 与 `ARCHIVE.md`。

---

### P-02 模块化重构：内联大脚本下沉 + 数据去重

**背景**：`tank_mvp.html`（内联 ~1300 行）与 `tank_designer.html`（内联 ~1500 行）各自持有可共享的实现；`tank_list.json` I/O 逻辑在三个原型里重复三份；若干配置数据与 `RULES` 重复。

**状态**：子条目 1~6 已完成（P-03 先行拆分 / listio / paintBarrel / 配置表下沉 / 数据去重 / tank_move），见 `DEVELOPMENT.md` §3.6 与 `ARCHIVE.md`。剩余第 7 条（可选）：

7. **`js/tank_battledraw.js`**（可选，低优先）：mvp 战斗场景绘制层（`drawTank`/`drawBrokenTracks`/`drawCharredHull`/`drawFireGlow`/`drawShells`/`drawCover`/`drawFoliage`/`drawClassBadge`，~400 行）仿 `tank_fx.js` 先例 ctx 显式传参下沉。测试台专用块（`drawRange`/`addRangeShot`/`AMMO_KEYS`/`RANGE_*`）留在 mvp 不拆。

**验证路径**：每批 `npm run check` + `npm run test` 全绿；dev server 手动过一遍三个原型（加载/切换坦克、设计器保存回写、对比页编辑保存）。

---