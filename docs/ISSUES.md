# Rogue Tank — 工程问题清单（已核实）

> **本文档是临时文档**：只存放**待处理 / 处理中**的已核实问题。
> 条目**修复并验证有效后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。
> 本轮只记录当前工作区中可由代码路径或定向 Node 复现确认、且尚未实现修复的问题；未修复条目不得提前删除或归档。

---

> 已解决并归档的历史条目（#1~#26、#44、#49、#60~#75、#78~#101、#A1~#A20、#B1~#B5 等）：见 `ARCHIVE.md`。

---

## 当前待处理问题

### 本轮核验记录（2026-09-15/16）：暂无待处理问题

> #A21~#A25 已修复并验证，原文归档至 `docs/archive/2026-09.md`（结论见 `DEVELOPMENT.md` §4.16）：
> - **#A21** F 切换未让鼠标左键击发激活武器、副武器仍自动运作 → `js/tank_fire.js` 新增 `tryFireWeaponSlot(ctx, salvo)` 按激活槽位分发（primary→`tryFire` / secondary→`fireActiveSecondary(target=鼠标世界点)`），turret 型保留自主运作（设计例外）；`tank_mvp.html` 左键/空格改调该入口。
> - **#A22** 副武器单槽不变量未落实、卡牌层仍创建双槽 → 删除 `secondarySlots`/`activeSecondaryIndex` 双槽路径，统一单槽 `install`（仅空槽）/`upgrade`（仅同型）语义。
> - **#A23** 武器升级卡未按已拥有武器过滤、install/upgrade 与 maxStacks 未闭环 → weapon effect `action` 必填 + `cardEligible(card, owned)` 资格过滤（小池 early-return 与保底之前）+ `owned.primaryWeapon/cards` 纳入 + apply 层 `_cardApplyCount` maxStacks 最终防线（ammo 链豁免）。
> - **#A24** 面板模块未分层、参数与卡牌取消不完整 → 新增 `js/tank_panels_core.js`（纯核心 + 卡牌事务 receipt/rollback + `parameterClamp`）/ `js/tank_panels_dom.js`（DOM 适配）/ `js/tank_panels.js` 门面；两页仅注入元素与状态。
> - **#A25** 日志未拆独立左下方面板、未与 Tab 联动 → `createLogPanel` 独立浮层（open/close/toggle + hiddenClass）+ `showPanelGroup` 统一 Tab 状态面板与「开发者+日志」组互斥呼入/呼出；Bench 复用同一模块。

---

> #A26 / #A27 弹种升级链 + HE-VT 飞行 2026-09-15 已修复并验证，原文归档至 `docs/archive/2026-09.md`。
> #A28 主动技能 upgrade 卡提前发放（`requiresAbility` 未落内容）2026-09-16 已修复并验证，结论见 `DEVELOPMENT.md` §4.17 / `docs/specs/cards.md` §8.4·§8.5·§9，原文归档至 `docs/archive/2026-09.md`。
> #B6 炮塔随节点推进逐渐前移（Boss scale 原地污染共享 spec + W3 前移特性）/ #B7 路网被截断·圆弧路头·交叉口叠加 2026-09-16 已修复并验证，结论见 `DEVELOPMENT.md` §4.18 / `docs/specs/map.md` §10.1，原文归档至 `docs/archive/2026-09.md`。
> **当前无待处理问题。**

## 本轮核验记录

- 定向复现（`scripts/_tmp_verify_ammo.js`）：12 张 `ammo_upgrade_*` 卡在 loadout=`ap,he` 抽到 0 张；apply heat 得 `ap,heat`（应为 `ap,he,heat`）；apply sniper_apfsds 得 `apfsds,he`（跳级）；apply hesh 得 `ap,hesh`（跳级）；apply apds 得 `ap,he,apds`（跳级）。
- 定向复现（`scripts/_tmp_verify_vt.js`）：HE-VT 飞行 20 帧 `x=0.0 dist=0.0 dead=false`（静止）。
- **修复后（2026-09-15，经 `npm run check`/`npm test` 复核；当轮定向复现脚本 `scripts/_tmp_verify_ammo.js` / `_tmp_verify_vt.js` 已删除）**：升级卡抽取修复 — loadout=`[ap,he]` 时 `drawCardChoices` 可抽到 `ammo_upgrade_apcr/aphe/heat`（3 张），apds/apfsds/hesh/proximity_he/blast_he 等跳级卡被拒；heat 首抽 `ap,he,heat`（先新增）→ aphe 取代 he → `ap,aphe,heat`；HE-APHE 链 he→aphe→hesh→proximity_he→blast_he 逐级替换；sniper_apfsds_conversion 前驱为 `apds` → 在 `[ap,he]` 拒绝不变。HE-VT 飞行修复 — `test-fire.js` 断言 HE-VT 20 帧 `dist=400/x=400` 推进（之前 `dist=0/x=0` 静止），飞近敌人触发空爆。
- 验收：`node scripts/test-cards.js` 全绿（heat/aphe 双分支并存 + 跳级拒绝 + KE/HE-APHE 链逐级）；`node scripts/test-fire.js` 全给，新增 #A27 HE-VT 飞行回归（20 帧 dist=400/x=400；飞近敌人触发空爆）；`npm run check` + `npm test` 全绿（test-browser-run.cjs 同步新语义）。
- **本轮验收（2026-09-15/16，关闭 #A21~#A25）**：`npm test`（新增 `scripts/test-weapon-keypress.js` 按键链路端到端 + `scripts/test-weapon-upgrade-balance.js` 升级卡数值梯度）全绿；`node node_modules/typescript/bin/tsc --noEmit` 0 错误；`npm run test:browser`（smoke/r3/run 三脚本，全访问模式 Edge）ALL PASS、零 console/page 错误。`npm run check` 因沙箱 `check-html.js` spawnSync pipe EPERM 无法执行（环境限制，已用 `node --check` 逐文件 + 内联脚本提取编译等价覆盖）。
