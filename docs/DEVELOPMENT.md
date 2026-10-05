# 战术坦克 Roguelike — 开发主文档

> 本文档是**长期内容权威**：§0 文档体系索引与目录 / §1 核心方向 / §2 架构演进 / §3 当前状态与下一步 / §4 批次落地结论（按编号升序）。
> 系统**现行细则**归口 `docs/specs/` 五卷（combat / map / cards / boss / editor）；临时文档（`PLAN.md` / `ISSUES.md`）只存未完成项；历史条目见 `docs/ARCHIVE.md` 索引 → `docs/archive/<yyyy-mm>.md`（**严禁全文读取**，按索引 Grep 切片）。
> 文档分工、条目生命周期与冲突判定顺序见根目录 `AGENTS.md` §2。

---

## 0. 文档体系索引与目录

| 文档 | 角色 | 内容 |
|---|---|---|
| `docs/DEVELOPMENT.md`（本文档） | 长期内容权威 | 文档索引、核心方向、架构演进、当前状态与下一步（§3）、批次落地结论（§4 按编号升序） |
| `docs/specs/combat.md` | 系统规范 | 装甲/跳弹、弹种系统（§3 升级链与数值总表）、能力/副武器、AI 激活、特效、音频、HUD |
| `docs/specs/map.md` | 系统规范 | 节点地图 / 掩体与地形类型抽象 / 路网 / 水域溺毙 / 元素生成与校准 |
| `docs/specs/cards.md` | 系统规范 | 卡牌数据契约 / 效果类型 / 稀有度分层 / 设计定稿 / 装备优先抽卡 |
| `docs/specs/boss.md` | 系统规范 | Boss 数据契约 / 阶段机制 / 数据驱动行为 / 激光与召唤 |
| `docs/specs/editor.md` | 系统规范 | 设计器 / 对比页 / 字段架构 / 烘焙工具 / 涂装规范 / 开发者面板 |
| `docs/PLAN.md` | 临时 | 只存**未完成**的近期待办与计划（是计划，非承诺） |
| `docs/ISSUES.md` | 临时 | 只存**待处理 / 处理中**的已核实问题（每条须有 `file:line` 证据） |
| `docs/ARCHIVE.md` | 只读索引 | 完结条目索引表 → `docs/archive/<yyyy-mm>.md` 分卷正文 |

**目录**：§1 核心方向 · §2 架构演进 · §3 当前状态与下一步 · §4 批次落地结论（§4.1~§4.42）

> **§4 编号说明（2026-09-23 文档整改）**：§0~§3 与 §4.1~§4.26 的**逐条正文**曾于 2026-09-22 提交 `994bdfd` 随 §4.27~§4.33 一并从本文件移除，且该次漏走 `AGENTS.md` §2.2 第 3 步「原文归档」（276 行原文未进归档分卷）。2026-09-23 整改已将该原文快照**补归档**至 `docs/archive/2026-09.md`（见 `docs/ARCHIVE.md` 索引 2026-09-23 行），本文件重建精简骨架并保留下方**§4 编号索引表**，使全部历史交叉引用可解析。
> **续写规则**：新增批次一律在 §4 正文末尾按编号递增续写（当前最大编号 §4.42）；§4 正文只增不回改，被推翻的旧结论以注记指向新节。

---

## 1. 核心方向

**类型**：节点式地图推进 + 局内得分驱动构筑 的战术坦克 Roguelike（俯视角 2D）。每个节点是一块独立、有边界的战场。

**核心改动方向**（2026-09-08 起定型，持续有效）：

1. **武器分化与双槽位**：坦克配置由单一主炮扩充为「主武器」（标准 / 双管 / 自动炮 / 电磁轨道炮 / 弹夹炮）+「副武器·挂载」（迫击炮、导弹、火箭弹、地雷布撒器、副炮塔）解耦，副武器单槽。
2. **主动技能与模组化**：超级火控、超级速度、超装填、战术呼叫（炮击）、战术护盾、主动防御系统（APS）等主动技能，**按 key 独立冷却**（`abilityCds[key]`）。
3. **召唤与部署系统**：侦察/打击无人机、固定炮塔、战术掩体、布雷，统一注册进 `deployables` / `drones`，Boss 召唤走同一敌对 AI。
4. **节点式推进与局内构筑**：近线性开放式节点链 + 卡牌三选一 + 局内商店与局外永久升级双账本；构筑与难度均经 `base` / `modifiers` / `stats` 三层属性注入。

---

## 2. 架构演进

- **分层约定**：共享逻辑放 `js/`（浏览器端以全局脚本按序加载、**非 ES Module**，每个模块底部带 `module.exports` 以支持 Node 测试）；DOM 接线留页面。机制参数**唯一配置源** `js/tank_rules.js`（`RULES`），必须最先加载。
- **战斗管线**：`tank_fire.js`（开火通用层 + `stepShells`）→ `tank_physics.js`（`resolveHit` 命中结算）→ `tank_cover.js`（掩体/地形）/ `tank_shield.js`（护盾吸收）→ `tank_battledraw.js`（绘制层）。
- **实体与召唤**：`tank_entity.js` 中央 `entities` 注册表；部署物 `tank_deployables.js`（炮塔/地雷/掩体）；无人机 `tank_drone.js`。
- **地图与流程**：`tank_nodegen.js`（元素生成器）→ `tank_map.js`（节点链 / 难度曲线 / 实体化）→ `tank_flow.js`（全局状态机）；`tank_camera.js` / `tank_minimap.js` 为视口与小地图纯逻辑。
- **AI 与 Boss**：`tank_ai.js`（双态决策 + 受击警觉 + 找掩体）→ `tank_boss.js`（阶段/激光/召唤/行为风格）。
- **UI 与工具**：`tank_panels_core.js` / `tank_panels_dom.js` / `tank_panels.js` 三层 + `tank_devpanel.js`（开发者面板，mvp/bench **两页同源**）；`tank_bindings.js` 为键位唯一数据源。
- 完整模块清单、加载顺序与依赖约束见根目录 `AGENTS.md` §1 / §3.4。

---

## 3. 当前状态与下一步

（**本节为当前状态、批次史与长期债务的唯一维护点**；待办清单归 `docs/PLAN.md`。）

### 3.1 当前状态（截至 2026-09-23）

- **架构**：节点式地图 + 主副武器解耦 + 主动技能 + 卡牌构筑 + 部署物/无人机 + Boss 全链可用；三条验证链 `npm run check` / `npm test` / `npm run test:browser`（smoke / r3 / run / r4 四链）近期各批次均全绿。
- **批次史**：R-1/R-2/R-3 起步（§4.1~§4.3）→ 卡牌三板块与开局弹种/副炮塔（§4.9）→ 面板解耦（§4.10）→ 阶段七卡牌闭环（§4.11）→ 2026-09-14 三批定案（§4.12~§4.14）→ 主武器改版五项 + W6 机炮热量（§4.15）→ 输入分发/卡牌资格/面板分层（§4.16）→ 技能 upgrade 资格闭环（§4.17）→ 炮塔前移根治 + 路网重做（§4.18）→ #B8~#B11（§4.19）→ #C 批（§4.20）→ #D 批（§4.21）→ 开发者面板两页统一（§4.22）→ #E 批掩体体系收敛（§4.23）→ #F 批（§4.24~§4.27）→ #G 批（§4.28）→ #H 批视野/激光（§4.29~§4.31）→ #I 批（§4.32）→ #J 批（§4.33）→ 文档整改（§4.34）。**§4.1~§4.26 逐条正文已归档**（见上方 §4 编号说明与索引表）。
- **长期债务**：
  1. 友军击杀五折记分留待经济里程碑。
  2. ~~`RULES.nodeMap.road.junctionClearR`（0.85）为死配置~~ —— **已于 2026-09-23 A 档删除**（见 §4.35）。
  3. ~~`recon` / `track_repair` 两个能力键为死效果（对应 5 张卡能抽不能用）~~ —— **已于 2026-09-23 A 档整体摘除**（两键 + 5 张对应卡，见 §4.35）。
  （截至 2026-09-23 A 档收尾，长期债务仅剩第 1 条。）

### 3.2 下一步顺序（2026-09-23 路线裁定后）

**用户裁定（2026-09-23）**：路线取 **A 清账 → B 推进轴玩法**；完整 strip 横向卷轴降级为 **C 档**（待 A/B 完成后评估）；可见半径口径**不变**，「敌人开火时看不见」改走**视野卡 + 镜头外延做强**。待办总览与裁定理由见 `docs/PLAN.md` §1/§4；镜头外延与视野卡的几何上限见 `docs/specs/combat.md` §11.5。

**A 档（清账）与 B 档（推进轴玩法）已于 2026-09-23 完成并验证**（见 §4.35~§4.38）——现行顺序如下：

1. **C 档·横向卷轴节点**（4 批次，方案已定案、未开工）：方案与实测见 `docs/PLAN.md` §3，参数口径预留见 `docs/specs/map.md` §14（**尚未落地，不得作为现状引用**）。
2. **难度联动**：新弹种是否进敌军池（`parameterLimits` / `enemyClassProfiles` 与弹种表联动）——非阻塞开放问题，见 `docs/PLAN.md` §2.1。
3. **HUD 渲染实现级合并**：mvp⇄bench 同功能仍有两套渲染实现（血条/装填指示/弹种条/日志/散布锥/FPS 读数等 9 处）——非阻塞遗留，见 `docs/PLAN.md` §2.2。

---

## 4. 批次落地结论（按编号升序）

> **正文只增不回改**：被推翻的旧结论在原条目加「已被 §4.x/§y 取代」注记，不删原文。
> 每条结论 = 简结论 + specs 归口指针 + 三链验证记录（`npm run check` / `npm test` / `npm run test:browser`）。
> **§4.1~§4.26 的逐条正文已归档**（2026-09-23 整改补归档，原文快照见 `docs/archive/2026-09.md`），下方索引表保留其编号与归口以便交叉引用。

### 4.0 §4.1~§4.26 编号索引（正文见归档）

| 编号 | 日期 | 主题 | 正文 / 现行归口 |
|---|---|---|---|
| §4.1 | 2026-09-12 | R-1 主副武器与主动技能 | 归档快照（2026-09-23 行）· `specs/combat.md` §4 |
| §4.2 | 2026-09-12 | R-2 召唤物与战术部署 | 归档快照 · `specs/combat.md` §4 |
| §4.3 | 2026-09-12 | R-3 特种弹药、曲射与副武器手动开火体系 | 归档快照 · `specs/combat.md` §3/§4 |
| §4.4 | 2026-09-12 | #A19 坦克碰撞回归修复 | 归档快照 · `specs/combat.md` §1 |
| §4.5 | 2026-09-13 | 测试基线（历史遗留清零） | 归档快照 · `specs/editor.md` §7.5 |
| §4.6 | 2026-09-13 | #A11 地图级路网与地形占位重构 | 归档快照 · `specs/map.md` §10 |
| §4.7 | 2026-09-13 | #A20 HUD 静态按钮内联 onclick 失效修复 | 归档快照 · `specs/combat.md` §9.6 |
| §4.8 | 2026-09-12/13 | 核心运行时缺陷修复（#B1~#B5 与 #78） | 归档快照 |
| §4.9 | 2026-09-13 | 卡牌三板块 + 开局弹种/副炮塔落地 | 归档快照 · `specs/cards.md` §8 |
| §4.10 | 2026-09-13 | 操作/设置/面板解耦（mvp ⇄ 测试台同源） | 归档快照 · `specs/editor.md` §7 |
| §4.11 | 2026-09-13 | 阶段七：技能/主/副武器卡牌体系闭环 | 归档快照 · `specs/cards.md` §8.3 |
| §4.12 | 2026-09-14 | 局内商店退场收尾 + 卡牌选择定案 + 键位反向/敌军血量修订 | 归档快照 · `specs/cards.md` §9 |
| §4.13 | 2026-09-14 | 七项用户定案（HEC 移除 / 商店回归 / 受击警觉 / 地图重做 / 水域溺毙 / 装备优先 / 新局归零） | 归档快照 · `specs/combat.md` §3·§5 / `specs/map.md` §11 |
| §4.14 | 2026-09-14 | 弹种缩写规范化 / 双副武器与右键击发 / 技能池 1~3 / 道路平滑烘焙 / 商店与 Boss 结算修复 | 归档快照 · `specs/combat.md` §3/§4 |
| §4.15 | 2026-09-15 | 主武器系统改版五项（含 W6 机炮热量重做） | 归档快照 · `specs/combat.md` §9 |
| §4.16 | 2026-09-15/16 | 输入分发 / 卡牌资格与单槽 / 面板分层 / 副炮塔挂载与升级卡复核 | 归档快照 · `specs/combat.md` §4 / `specs/cards.md` §8.3 |
| §4.17 | 2026-09-16 | 主动技能 upgrade 卡持有资格闭环（#A28） | 归档快照 · `specs/cards.md` §8.4 · §8.5 |
| §4.18 | 2026-09-16 | 炮塔跨节点前移根治 / 路网重做（#B6·#B7） | 归档快照 · `specs/map.md` §10 |
| §4.19 | 2026-09-16 | 用户反馈批次：副武器替换语义 / 部署物接 mvp / 技能获取提示（#B8~#B11） | 归档快照 · `specs/combat.md` §4 |
| §4.20 | 2026-09-17 | 用户反馈批次：路口圆斑 / 射速下限 1s / 弹种升级卡保底 / 技能副武器操作链 / 灭火器死前置（#C1~#C4/#C6） | **归档快照** · `specs/combat.md` §4 / `specs/cards.md` §3·§9 / `specs/map.md` §10.2 |
| §4.21 | 2026-09-19 | 用户反馈批次 #D1~#D5（拦截日志对齐 / 视野卡接线 / 交替装填重定义 / 火箭逐发 burst / 弹种保底概率化） | **缺号**——正文从未写入本文件；**归口** `specs/combat.md` §4/§5.1、`specs/cards.md` §8.3/§9；原文见 `archive/2026-09.md`（2026-09-19 行） |
| §4.22 | 2026-09-19 | 开发者面板改进 + mvp⇄bench 两页统一（原 ISSUES #C5 + PLAN §3 专轮） | **缺号**——归口 `specs/editor.md` §7；原文见 `archive/2026-09.md`（2026-09-19 行） |
| §4.23 | 2026-09-20 | #E1~#E13 批次：掩体体系收敛（半高掩体移除 / 确定性挡弹 / 路网 v3 / 沿路建筑与路口沙包） | **缺号**——归口 `specs/map.md` §12、`specs/combat.md` §8、`specs/boss.md` §6；原文见 `archive/2026-09.md`（#A9 关闭说明）与 `ISSUES.md` 核验记录 |
| §4.24 | 2026-09-20 | #F1~#F4：devPanel 两页同源 / 双联火炮齐射门控 / 测试台副武器接线 / 双管装填弧修复 | **缺号**——归口 `specs/combat.md` §8.5、`specs/editor.md` §7；原文见 `archive/2026-09.md` |
| §4.25 | 2026-09-20 | #F5：布雷器「无限召唤 + 无伤害」（雷场预约上限 + 触发半径 45/40px） | **缺号**——归口 `specs/combat.md` §8.1；原文见 `archive/2026-09.md` |
| §4.26 | 2026-09-20 | #F6：雷场/掩体「新的生成、旧的失效」（超限改部署前拒绝） | **缺号**——归口 `specs/combat.md` §8.1；原文见 `archive/2026-09.md` |

---

### 4.27 浏览器自动化特性补全（2026-09-20 会话，已完成）

> 用户要求补全浏览器自动化测试，覆盖此前未验证的主武器各类型实战、F 副武器击发与伤害、技能实战效果、商店购买结算。新增 `scripts/test-browser-r4.cjs`（#F7），接入 `npm run test:browser` 四链（smoke / r3 / run / r4）。mvp `window.__TEST__` 新增测试钩子（`shells()` / `strikes()` / `profile()` / `rerenderShop()`），仅采样闭包内状态，不改变生产路径；顺手修复 `js/tank_devpanel.js` 的 tsc 类型债务（EventTarget/Element 收窄 + `window['xxx']` 索引访问），使 `npm run check` 全绿。

- **r4 覆盖**：主武器 standard 空格单发 / double_barrel 空格齐射 2 发（#F2 接线）/ autocannon 空格按住连发 + `heatPct` 积累 / railgun 单发；副武器 mortar F→`isArc` 曲射弹 / rocket F→burst 首发 / missile F 激活→锁定 1s 自动发射（并断言**按住 F 不被逐帧轮询翻转**）/ mine_layer 按住 F 只走一次边沿 + 两次 F→4s 雷场生成（预约清空 + 整场 3 枚 + 触爆对敌人掉血）；技能 artillery G→`strikes` +3 登记→落弹敌人掉血 / shield H→吸收池 / overdrive V→`reloadT=0` + 冷却入池；商店 loadout⇄shop 购买 hp_up（25 点→点数归零 + 升级 Lv1 + UI 刷新）/ 复活加购（40 点→`bonusRevives` +1）/ 升级作用于开局（`stats.maxHp ≥ base + 10`）。
- **明确边界**：敌人 AI / Boss 深层行为仍由 Node 侧 `test-ai.js` / `test-boss.js` 覆盖；浏览器只验证敌人存在 + 开火命中（smoke #23）。
- **四链实测中发现的 3 处真实缺陷（均已修复）**：
  1. `tank_mvp.html` `mountDevPanel` 读取 `let devNoVision` 先于其定义（TDZ，`Cannot access 'devNoVision' before initialization`）→ 页面脚本中断、Home 态不渲染。修复：把 `let devNoVision` 提升到 `devAim`/`devCheat` 旁（`typeof` 守卫**不能**救 TDZ——`typeof` 对 TDZ 的 `let` 同样抛错）。
  2. `tank_bench.html` 遗留的 `benchInvulnChk`/`benchInstantReloadChk` 取元素后直接 `addEventListener`——#F1 移除旧 `#benchPanel` 后 DOM 不存在 → 加载即 `TypeError`。修复：删除该死接线（勾选状态仍由 `onCheatChange` 同步）。
  3. **开关类副武器的 F 被逐帧轮询**：`missile`（激活/取消）与 `mine_layer`（预形态/确认）由主循环 `input.isDown('fireSecondary')` 每帧调用 `trySecondaryFire` → 按住 F 期间**每帧翻转**（实测 250ms 内 9 次 true/false 交替；mine_layer 则一次按住跨帧连走「预形态→确认」）。后果：轻按 F 约一半概率停在「已取消」，导弹表现为「按 F 没反应」。修复：两类改走**原生 `keydown` 边沿**（独立监听 + `e.repeat` 过滤 + 菜单/面板门控），帧轮询分支直接 return；HUD F 按钮走 `trySecondaryFire(true)`（force 直调）。细则归口 `specs/combat.md` §8.2。
- **r4 夹具（仅测试侧，非产品缺陷）**：① 发射计数必须按 `shooter.id === 'player'` 过滤——`firePrimaryShell` 同时服务敌方/友军 AI（主循环 AI 段直接调 `fireTank`），不过滤会把敌方射击算成玩家发射（表现为「空格 1 发」偶发 2 发）；② 夹具统一冻结全体敌人（`maxHp/hp=1e6` + `immobT/reloadT=9999`），否则敌方 AI 会还击并可能打死玩家造成假失败；③ 雷场枚数改统计 `spawnMine` 真实调用次数（触发半径 45px，目标站在场内会被立刻引爆，存活计数会少算）。
- **验证**：① `node --check`（r4 + mvp 内联 + `tank_devpanel.js`）**0 失败**；② `npm run check` **EXIT=0**（含 `tsc --noEmit`，devpanel 类型债务清零）；③ `npm test` **EXIT=0**；④ `npm run test:browser` **四链（smoke / r3 / run / r4）全部 ALL PASS、EXIT=0**（2026-09-20 实跑；沙箱内需按 `sandbox-verify` 一次性放宽进程权限跑 browser 链，且复用已监听 server 可避开 listen 拒绝），r4 连跑 3 次均全绿（抖动已消除）。
- 细则归口 `specs/editor.md` §7.5（工具链与浏览器覆盖矩阵）；F 键边沿语义归口 `specs/combat.md` §8.2。

### 4.28 2026-09-21 用户反馈批次 #G（8 项反馈 + 1 项设计征询，已完成 9/9）

> 用户在同一轮反馈中提出 8 项具体问题/需求 + 1 项设计征询（#G1~#G9）。全部落地并三链验证通过。本条为简结论，现行细则按系统分别归口 `specs/combat.md` §9（战斗/武器/能力/HUD）、`specs/map.md` §13（路网/建筑）、`specs/boss.md` §7（Boss）、`specs/cards.md` §8.3（卡牌）。

- **#G1 Boss 激光炮塔转速太快**：蓄能期旧实现每帧 `addModifier` 叠加同源修饰器，而 mult 聚合是加法式 `1+Σ(value−1)` 且钳到 ≥0 ⇒ 转速被钳成 0（蓄能完全冻结），射击期又恢复全速（「开火瞬间甩头」）。改为 `BOSS_LASER_TURN_SOURCE` timed modifier：`_setBossLaserTurretMod` **同源先移除再添加**（幂等）+ 400ms 到期续期；蓄能 ×0.18 / 射击 ×0.15（`RULES.boss.laser.fireTurretTurnMul` 新增）。细则 `specs/boss.md` §7.1。
- **#G2 部分 Boss 没有召唤敌人**：`RULES.boss.summonWaves` 新增 `defaultPool`/`defaultWaves`，`bossSummonWave` 对空 `summons` 且带 `t.boss.id` 的实体自动补 3 波（裸测试实体仍返回 null 不污染单测）；5 个 `bosses/*.json` 全部补齐 3 波召唤（`hpFrom` 1.0/0.66/0.33）。细则 `specs/boss.md` §7.2。
- **#G3 开发者面板「−1」按钮无效**：主因是 `renderDevOwnedCards()` 被 `updateDevParams` **逐帧无条件 `innerHTML` 重建**——真实鼠标 mousedown→mouseup 跨帧时按钮被销毁，click 落在无监听的持久容器上。修复三件套：① 持有清单签名缓存 `devOwnedSig`（未变即 no-op，逐帧路径零重建）+ 容器级事件委托（`data-card-id` → `rollbackDevCard`）；② 重放序列改读新增的**按序施加日志** `tank._cardApplyLog`（`applyCardEffects` 写入；此前只读 `cardEffects`，而纯 modifier 卡只写 `tank.modifiers` ⇒ 任意一次 −1 都会永久抹掉其他 modifier 卡效果）；③ 持有统计合并 `cardEffects` + `modifiers` 的 `card:*` 源（96/169 张纯 modifier 卡此前**根本不显示**，也就没有 −1 行）。**浏览器链实测另暴露一处**：`devOwnedSig = ''` 兼作「强制重绘」标记时，空列表分支把 `''` 当作「已画过空态」⇒ 回滚掉最后一张卡时残留行永不清除；改用独立脏标记 `devOwnedDirty`。
- **#G4 更复杂的路网 + 更多建筑物体**：路网 v4——新增两种街区拓扑 **G 网格街区**（正交横干 + 两条贯穿纵路「日」字格）与 **I 双干贯穿**（两条近平行横干 + 一条贯穿纵干），删除旧 **F 斜向丁字对**（斜干 × 正交支道实测交角低至 36.9°，无法满足 #B7 的 ≥60° 护栏）；T 形支道改**直线**（振幅 0，旧实现按整条干道跨度折算振幅、支道只有半幅 ⇒ 局部斜率过大是浅角根因）；平行拓扑端点/弯曲双收紧（旧实现两条「平行」路曾以 5.1° 浅角互穿）；`diagAngleMax` 0.52→0.34。建筑——新增可破坏楼房 tier `building`（耐久 3 → `ruined` → `rubble` 破坏链，`ruined` 此前定义但从未生成）与建筑混合配比（30% building / 10% ruined / 60% full）、密度提升（`maxPerNode` 18→20、沿路采样步 /6→/4、通行间隙 30→34px）。**顺带修复**：林地簇无边界钳制，贴边簇（`village_center` 防风林）会把树推到节点外（`test-map`「掩体在界内」失败）。细则 `specs/map.md` §13。
- **#G5 电磁轨道炮太弱**：`reloadMult` 2.2→1.8、`damageMult` 1.5→1.8，并新增**贯穿**机制（`pierce: 1` 额外目标数 + `pierceDmgMul: 0.6` 逐个衰减）——`firePrimaryShell` 写 `pierceLeft/pierceDmgMul/pierceHitIds`，`stepShells` 命中后跳过已命中实体并继续飞行。配套新增 rare 升级卡 `weapon_primary_railgun_upgrade`。**附带修复**：`drawReloadRing` 单环与 bench 装填条漏乘武器通道 `reloadMult`（轨道炮装填前 44% 进度环恒空）。细则 `specs/combat.md` §9.3/§9.7。
- **#G6 新增主武器「弹夹炮」`clip`**：严格按用户规格——弹夹内间隔 **0.7s 固定（不受任何 modifier/debuff 影响）**、弹夹间装填 **标准 × 3.0**、初始容量 4 发、每扩容 1 发弹夹间装填 **+0.8× 标准**（`clipSizeReloadStep`）。运行时 `_clipState{size,rounds,pendingRefill}` + `updatePrimaryClip` 逐帧驱动（mvp 玩家/AI + bench）；`drawReloadRing` 新增弹夹分支（余量数字 + 弹夹内蓝色间隔弧 / 整组橙色装填弧）。卡牌：`weapon_primary_clip`（epic 安装）/ `weapon_primary_clip_extended`（rare `{"clipSize":"+1"}` maxStacks 2）。**同轮扩展 `statOverrides` 支持 `"+N"` 相对增量**（`mergeStatOverrides`；此前 boolean 值还会被校验拒绝，`altReload`/`guided` 升级卡报非法）。细则 `specs/combat.md` §9.1/§9.2、`specs/cards.md` §8.3。
- **#G7 技能获得后只有文字提示、UI 无按键与技能名**：底部 HUD 新增**技能池常驻槽** `#skillSlot1~3`——显示技能中文名（`ABILITY_LABELS`）+ 数字键 + 冷却；序列与 `skillHotkey(n)` 完全同源（`cardEffects` 的 ability key 去重列表，不过滤 artillery/shield/overdrive）；点击槽位等价于按对应数字键。`ABILITY_KEY_HINT` 补 `repair`/`medkit`/`extinguish`（4/5/6 键）与 `aps`，G/H/V 文案改为「G 键 / 1~3 号技能键」。细则 `specs/combat.md` §9.6。
- **#G8 血条与按键太近、无速度显示、重设计玩家 UI 面板**：`#bottomHud` 由旧「血条 + 单排按钮」改为 **flex 三区**——VITALS（血条 + **档位 D/R + 当前 km/h + 速度条 + 公路加成**）/ WEAPONS（弹种槽 + 补给键 + 副武器）/ SKILLS（G/H/V 专属键 + 技能池槽）。速度读数经新增 `tankCurrentKmh(t)`（**必须先除 `pxFactor×effMul` 再乘 `kmhFactor`**，直接乘会读出 ~208km/h 虚高值）。JS 侧 `display` 同步由 `'block'` 改 `'flex'`；`#reloadWrap`/`#bottomHud`/`#hintBar` 等 id 与 `btnG/btnH/btnV` 可点击性作为测试契约保留。细则 `specs/combat.md` §9.6。
- **#G9 武备与技能扩展（设计征询）**：给出扩展建议清单（见下）并**实装其一**——主动防御系统 **APS**（`RULES.abilities.aps`：6s 窗口 / 240px 半径 / 最多拦截 3 发 / 冷却 22s），激活后由页面主循环 `updateAps` 在 `stepShells` 之后逐帧扫描并**销毁**进入半径的敌方弹药；卡牌 `ability_aps`（epic），经 1~3 号技能键触发；`removeRunModifiers` 清 `_apsT`/`_apsHits` 防跨局残留。细则 `specs/combat.md` §9.4、`specs/cards.md` §8.3。
- **验证（三链）**：① `npm run check`（含 `tsc --noEmit`）**EXIT=0**；② `npm test` **EXIT=0**（含 `test-nodegen` 七条护栏、`test-nodegen-calibration` 重锚、`test-map`、`test-fire` 新增 7e-clip/7f-pierce/8e-clip 断言、`test-cards`/`test-abilities`/`test-panels`/`test-boss`、`validate-content` 全部通过）；③ `npm run test:browser` **四链（smoke / r3 / run / r4）ALL PASS、EXIT=0**——沙箱内 `spawn EPERM` 属管道捕获限制，按 `sandbox-verify` 一次性放宽进程权限后实跑；run 链「卡牌 −1 回滚」用例由 FAIL 转 PASS 即 #G3 修复的端到端证据。
- **#G9 扩展建议清单（未实装，供后续排期）**：① **武器侧**——`plasma`（蓄力穿透光束炮，与 Boss 激光同源判定）、`swarm_missile`（多联装齐射，复用 rocket burst 链）、`arc_gun`（链式闪电，命中后跳到 2 个近距离目标，可复用 pierce 的命中队列）、`flamethrower`（持续锥形伤害 + 起火 DOT，复用 `debuffs.fire`）。② **技能侧**——`smoke_screen`（烟幕，`tank_cover.smokeClouds` 基础设施**已保留但当前无生产者**，接线成本最低）、`airstrike_designate`（指定坐标延迟轰炸，复用 `tank_strike`）、`engine_boost`（瞬发冲刺 + 履带锁免疫）、`repair_drone`（伴随维修，复用 `tank_drone`）、`decoy`（诱饵假目标，吸引 AI 索敌）。③ **Boss 侧**——多阶段形态切换（已有 `applyBossStage` 骨架）、护盾发生器（需先破盾再伤本体，复用 `tank_shield`）。
- **细则归口**：`specs/combat.md` §9（§9.1 弹夹炮 / §9.2 statOverrides `+N` / §9.3 轨道炮 / §9.4 APS / §9.5 Boss 激光与召唤 / §9.6 HUD 三区 / §9.7 装填环修复）、`specs/map.md` §13（§13.1 路网 v4 / §13.2 building tier / §13.3 校准重锚）、`specs/boss.md` §7、`specs/cards.md` §3/§8.3/§8.5。

### 4.29 视野等距修正（2026-09-21 #H1，已完成）

> 用户反馈：「重新检查摄像头随鼠标移动和视野机制，确保使用鼠标在各个方向上，可看到敌人的距离都是相同的，现在对于横屏设备，横向接近敌人依然是最有利的」。本条为简结论，现行细则归口 `specs/combat.md` §10。

- **根因（file:line）**：有效可见距离 = min(视野圆边界, 屏幕边界)。视野圆各向同性（`tank_mvp.html entityHiddenByVision` 世界空间圆），但屏幕是矩形——横屏 1920×1080 横向半幅 960 ≫ 纵向 540：鼠标指向横向时屏幕容量 1230 ≥ 视野边界 1215（视野收口），指向纵向时容量 810 < 1215（屏幕收口）⇒ 横向 1215px vs 纵向 810px（1.5× ≈ 宽高比）。镜头外延（#E12）量级各向同性，不是根因。
- **修正**：`js/tank_camera.js` 新增纯函数 `visionRadiusForViewport(cam, opts)`——`R = min(nominal, 窄轴屏幕前向容量/(1+bias))`，收口后视野圆在所有方向都是约束边界 ⇒ 鼠标指向任意方向的前向可见距离恒等。`tank_mvp.html visionRadiusEff()` 接线（判定 + 视野圈绘制同源）。
- **数值**（1080p/zoom1）：R 900→600，前向可见距离恒 **810px**——纵向体验零变化（此前即 810），横向 1215→810（目标修正）；纵向后向 270→390 改善。**更宽的显示器不再看得更远**（21:9 与 16:9 窄半幅同为 540 → 同一上限）；竖屏同规则；zoom 0.8/1.3 全程保持等距；4K 视口基准半径绑定（900/前向 1215）。
- **边界（几何必然，已文档化）**：保留鼠标锚定 bias 与镜头外延——「完全均匀气泡」与外延互斥（外延使屏幕相对玩家不对称）；视野卡（commander_sight）在收口绑定时无法突破屏幕容量（大视口下按上限生效）。
- **验证**：`scripts/test-camera.js` #H1 段（轴向等距 6 方向恒等 / 超宽屏同上限 / 竖屏一致 / zoom 联动 / 4K 基准绑定 / 卡牌边界 / 值域）全绿；三链复验 `npm run check` EXIT=0 / `npm test` EXIT=0 / `npm run test:browser` 四链 ALL PASS（2026-09-21，沙箱内按 `sandbox-verify` 一次性放宽进程权限实跑）。
- 细则归口 `specs/combat.md` §10（§10.1 根因 / §10.2 收口函数与数值表 / §10.3 设计取舍与边界）。

### 4.30 2026-09-21 用户反馈 #H3/#H4（超装填去 V 键 + Boss 激光固定转速与掩体阻挡，已完成 2/2）

> 本条为简结论，现行细则归口 `specs/combat.md` §11（§11.1 视野适配缩放为 #H2 同轮裁定、§11.2 超装填 / §11.3 Boss 激光）。

- **#H3 超装填移除 V 专属键**：用户裁定超装填只作为数字技能键技能。删除 `tank_bindings.js` 的 `abilityOverdrive` 键位/ACTION_INFO/ACTION_ORDER、mvp 的 `btnV` 按钮/监听/`cdV` 角标/`BTN_BY_ABILITY` 映射/isDown 轮询、bench 的动作与 `benchAbilityOverdrive`；激活路径唯一化为 **skillHotkey(n) → DISPATCH**（常驻显示走 §4.28 的技能池槽）。`ABILITY_KEYS_RUNTIME` 与 super_reload 卡不变。
- **#H4 Boss 激光炮塔固定转速 + 掩体阻挡**：#G1 的乘数方案实际角速度 = Boss 基础转速（tuning ×0.6 与难度乘子压低）× 0.15~0.18 ≈ 0（用户实测「又不转动了」）。改为 `updateBossLaser` **直接推进炮塔**：角速度 = `RULES.boss.laser.laserTurnSpeed`（0.55 rad/s 固定绝对值），转向目标 = AI 本帧期望方向（已含射界钳制），到向即停；激光期置 `bossLaserHoldTurret` 供 mvp AI 循环跳过炮塔驱动（两套驱动不再叠加）。**全高掩体阻挡**：伤害循环逐目标做炮口→目标连线 × OBB 判定（自包含零依赖实现，`opts.covers` 注入），`tierGroup:'structure' && vision`（building/full/intact/rock/ruined）遮挡目标不掉血（`laserBlocked` 事件），灌木/栅栏等不阻挡；`RULES.boss.laser` 新增 `laserTurnSpeed`/`blockByFullCover`，删除两乘子与 `BOSS_LASER_TURN_SOURCE` 导出。
- **同轮 #H2（视野适配缩放，用户裁定「纵向拉长而非削弱横向」）**：§4.29 的窄轴收口降级为安全网；镜头自动拉远（`visionFitZoom`，1080p ≈ 0.667）使名义视野 900 全方向生效（纵向前向 810 → 1215px 与横向一致）；缩放模型改「用户基准 × 适配值」，`minZoom` 0.8 → 0.45。细则 `specs/combat.md` §11.1。
- **验证（三链）**：`npm run check` EXIT=0；`npm test` EXIT=0（test-boss #H4 段：hold 标志/固定转速单帧转角/到向即停/hold 释放/建筑岩石阻挡/灌木不阻挡；test-bindings abilityOverdrive 已删除断言）；`npm run test:browser` 四链 ALL PASS（smoke P-39 探针改 #H2 基准口径；r4 C3 改技能池数字键动态定位触发；(d) ammoKey 断言为既有 flaky，重跑通过）。
- 细则归口 `specs/combat.md` §11（§11.1 / §11.2 / §11.3）。

### 4.31 敌方可见距离屏幕相对化（2026-09-21 #H5，已完成 1/1）

> 用户裁定：「目前敌方渲染的距离写死成了像素，会受缩放影响，迫使玩家始终以最高倍率游玩，失去一些细节」。本条为简结论，现行细则归口 `specs/combat.md` §11.1/§11.4。

- **根因**：#H1 窄轴收口与 #H2 深度拉远都把可见距离定义为**固定世界像素**（900px 圆），缩放必然改变敌人的屏幕出现位置——#H2 只能靠强制拉远（zoom≈0.67 + minZoom 0.45）补偿，代价是玩家失去放大细节的自由。
- **修正**：可见半径重定义为**屏幕相对**——`R = RULES.vision.screenRadiusRatio(1.0) × min(vw,vh)/2 ÷ zoom × (1+视野卡加成)`，`R×zoom` 恒定 ⇒ 敌人的屏幕出现位置与缩放无关；`visionRadiusForViewport` 重写（窄轴容量/(1+bias) 保留为极扁视口的几何护栏）。
- **连带回退**：`visionFitZoom`/「用户基准×适配值」模型/进节点强制缩放全部移除；`minZoom` 0.45 → 0.8（P-39 原值）；缩放回归纯视觉偏好（默认 zoom=1 全细节，滚轮自由）；`RULES.vision.radius` 降级为镜头外延基准。等距（#H1 目标）与屏幕公平性（超宽屏不占优）在屏幕相对口径下自然保持。
- **验证（三链）**：`npm run check` EXIT=0；`npm test` EXIT=0（test-camera #H5 段：R×zoom 恒定 / 屏幕相对等距 / 超宽竖屏同规则 / 卡牌护栏 / minZoom 回退）；`npm run test:browser` 四链 ALL PASS（smoke P-39 探针重写：默认 zoom=1 + 放大后 R×zoom 恒定断言）。
- 细则归口 `specs/combat.md` §11.1（现行口径）/ §11.4（动机）；§9.6 视野圈绘制、§10 演进史随注记指向本节。

### 4.32 2026-09-21 用户反馈 #I 批次（4 项，已完成 4/4）

> 本条为简结论，现行细则归口 `specs/combat.md` §12（§12.1 激光定桩降速 / §12.2 虚线反映阻挡 / §12.3 Boss 随机走位 / §12.4 建筑密度）、`specs/map.md` §13.4（密度与 Boss 战图加成）、`specs/boss.md` §8。

- **#I1 Boss 激光期车体冻结 + 炮塔再降速**：新增 `bossLaserHoldMove`——激光期（蓄能+射击）接入层连 `driveTank` 一并跳过，车体全程定桩（此前仅抑制炮塔转炮、车体仍被 AI 驱动）；`RULES.boss.laser.laserTurnSpeed` **0.55 → 0.35 rad/s**（仍为固定角速度直驱）。量化：单激光周期 41 帧 × 0.035 = 1.435 rad < π/2 ⇒ 炮塔转不满 90°，走位窗口显著变宽。
- **#I2 蓄能虚线与光束反映掩体阻挡**：新增 `_laserBeamBlockDist`（Liang-Barsky 射线×OBB 求最近全高掩体入口距离）；伤害口径由「逐目标连线判定」改为**光束级截断**（沿光束投影 > blockDist 不掉血，`laserBlocked` 事件）；`laserCharge`/`laserFire` 事件携带 `blockedDist`，绘制层据此截断虚线/光束并在截断点画阻挡标记——判定与表现严格同源。
- **#I3 建筑密度（含 Boss 战图加成）**：`nodeMap.building` clusterPerJunction 3~5→**4~8**、maxPerNode 18→**28**；新增 `bossDensity: 1.6` 经 `makeNode(isBossNodeIndex)` → `generateNode(buildingDensity)` → `placeRoadsideBuildings(density)` 放大路口簇/总量/沿路采样。**顺带修复 #E3/#G 遗留缺陷**：`fits()` 对含全部道路段的 `outCovers` 用 pad 34 判重叠 ⇒ 沿路/路口建筑恒被拒绝、`placeRoadsideBuildings` 产出恒为 0、**所有密度参数此前完全空转**；现行道路按 pad 10、非道路元素才按 pad 34。实测 8-seed 结构 87→103、`building`/`ruined` 首次实际出现；校准基线**第三次重锚**（连通性维持 0.999~1.000、minPassage 仍高于可通行下限）。
- **#I4 Boss 随机走位（反站桩）**：新增 `RULES.ai.bossWander`；`updateBossBehavior` 周期性在玩家周围随机选航点（环绕 240~520px、2.2~4.6s 换点、钳进边界），写 `t._bossMoveOverride`，mvp AI 循环对 Boss 替换车体 `turn/move`（**炮塔照常锁定玩家瞄准开火**）。豁免 crush 风格/weave 冲刺窗口/激光期/目标已毁；hold、skirmish、command、fortify 全部由站桩转为机动。
- **验证（三链）**：`npm run check` EXIT=0（同步补 `types/globals.d.ts` 的 `NodeGenOptions.buildingDensity`）；`npm test` EXIT=0（test-boss #I1 车体冻结标志/转速 0.35/#I2 blockedDist 与截断伤害/#I4 走位覆盖与豁免；test-nodegen #I3 密度聚合生效与沿路建筑实际生成；test-nodegen-calibration 重锚通过）；`npm run test:browser` 四链 ALL PASS。（test-ai 的 #E7 反应延迟断言为既有随机抖动采样，复跑通过，与本次改动无关。）

### 4.33 2026-09-23 用户反馈批次 #J（2 项，已完成 2/2）

> 现行细则归口 `specs/boss.md` §9（§9.1 召唤小兵速度锚定 / §9.2 Boss 履带随机自修）。

- **#J1 召唤小兵机动锚定（修「boss 召唤的小兵移动速度太快」）**：`tank_mvp.spawnBossSummonWave` 由裸 `applyTankConfig(spec)`（照搬 `tanks/*.json` 原始机动值，绕过玩家基准/难度锚定）改为与节点敌军/增援同一条 P-46 锚定链：`applyEnemyAppearanceAndStats(s, spec, playerAnchorStats || player.stats, currentNode.entityMults)`——只取外观与类型，数值 = 玩家出击基准 × 兵种 profile × 难度乘子。
- **#J2 Boss 履带随机立即自修（修「boss 频繁断履带后长时间站桩」）**：新增 `js/tank_boss.js updateBossTrackRepair(t, dt, opts)` + `RULES.boss.trackRepair = { enabled, windowSeconds: 8, chance: 0.4 }`。口径：履带被击断（`trackBroken + immobT=trackLock`）瞬间预定 `(0, 8s]` 内均匀随机决策时点 + 一次性概率 roll；到点命中 → 立即清零 `trackBroken/immobT` 并发 `{type:'trackRepair'}` 事件（mvp 层播火星特效 + 日志），未命中 → 保持锁定直至 `trackLock` 自然归零；每次断裂独立决策，单次决策不重复 roll。接入层在 boss AI 循环内逐帧调用（rng 复用 `battleState.reinforceRng`）。
- **验证（三链）**：`npm run check` EXIT=0；`npm test` EXIT=0（test-boss 新增 trackRepair 五路断言：未断无调度 / 随机时点预定 / roll 命中立即修复 / roll 失败保持锁定不重滚 / 再次断裂重新决策）；`npm run test:browser` 四链 ALL PASS。

### 4.34 2026-09-23 文档整改：DEVELOPMENT.md 误删补归档 + specs 现行口径修正

> 本条记录**文档体系整改**（无代码行为变更）。触发：用户指出「`docs/` 中的文档似乎已经落后代码」；核查确认存在文档结构级缺失与多卷数值/键位滞后。

- **根因（file:line）**：2026-09-22 提交 `994bdfd`（「docs: 同步批次结论 + 归档闭环条目」）在新增 §4.27~§4.33 的同时，删除了 `docs/DEVELOPMENT.md` 的 **§0 文档体系索引与目录 / §1 项目新定型与核心方向 / §2 架构演进与演练模块 / §3 当前活跃项与下一步顺序 + §4.1~§4.20 全部批次结论**（276 行 → 79 行、H1 标题一并丢失），且**未执行 `AGENTS.md` §2.2 第 3 步「原文归档」**——经逐串核验，这些内容在 `docs/archive/2026-09.md` 中不存在（`「路口感」语义保留` / `timed 通道豁免` / `灭火器死前置` / `测试基线历史遗留已清零` 等特征串命中数均为 0）。
- **连带悬空引用**：`AGENTS.md`（`:7` §1、`:52` §0/§1/§2/§3、`:76`/`:82`/`:141` §3）、`specs/`（`combat.md:87` §4.16、`cards.md:38`/`:74`/`:104`/`:123`、`boss.md:46`）、`PLAN.md` / `ISSUES.md` / `ARCHIVE.md` 多处引用已不存在的章节。
- **补归档**：将 `525d412` 时点的 276 行原文快照追加至 `docs/archive/2026-09.md`（标注来源 `DEVELOPMENT.md`、原删除日期 2026-09-22、本次补归档日期 2026-09-23），并在 `docs/ARCHIVE.md` 索引表表尾加行。
- **骨架重建**：本文件恢复 H1 标题与 §0~§3 精简骨架（§0 索引表 / §1 核心方向 / §2 架构演进 / §3 当前状态与下一步，含长期债务），并把 §4 重排为**编号升序**（与 `AGENTS.md` §2 的「按编号递增」一致，此前为降序）；因 §4.1~§4.26 逐条正文已归档，新增 **§4.0 编号索引表**保留其编号与归口指针，使历史交叉引用可解析。
- **§4.21~§4.26 缺号说明**：经遍历全部提交历史确认，这 6 个编号**从未在本文件中存在过**（旧文件止于 §4.20，新文件始于 §4.27），而 `ARCHIVE.md:127-132`、`PLAN.md:26,37,41,46`、`ISSUES.md:18,27,35,43`、`editor.md:79,131` 共 17 处引用它们。已在 §4.0 索引表中逐条登记主题与现行归口（#D1~#D5→§4.21、#C5 专轮→§4.22、#E 批→§4.23、#F1~#F4→§4.24、#F5→§4.25、#F6→§4.26）。
- **跨卷编号冲突修正**：`specs/boss.md` §9 标题原写 `#I5`，与 `DEVELOPMENT.md` §4.33 的 `#J` 指同一批次（2026-09-23 召唤小兵锚定 + 履带自修）——统一为 **#J**。
- **specs 现行口径修正（已核实项，file:line）**：
  1. `specs/combat.md` §4 运行时能力键清单由 6 类补为 **7 类**（补 `aps` 与 `recon`），与 `js/tank_abilities.js:53 ABILITY_KEYS_RUNTIME` 一致；同节 stale「超装填 (V键)」改为技能池数字键（#H3 已于 `tank_bindings.js` 删除 `abilityOverdrive`，mvp `btnV` 已移除）。
  2. `specs/cards.md` §4 卡池快照更新为 2026-09-23 `node scripts/audit-content.js` 实测：**173 张卡**——common 61（35.3%）/ rare 57（32.9%）/ epic 39（22.5%）/ legendary 15（8.7%）/ mythic 1（0.6%）；效果类型分布修正 `weapon 14→17`、`ability 16→17`，并补记第 7 种效果类型 `weapon`。
  3. `specs/map.md` §13.2 的密度参数与 §13.4 现行值冲突（3~5 / 18→20 vs 4~8 / 28）——§13.2 改写为现行值并留沿革注记（`RULES.nodeMap.building` 实测 `clusterPerJunction 4 / clusterPerJunctionMax 8 / maxPerNode 28 / bossDensity 1.6`）。
  4. `specs/map.md` §12.4 把 `junctionClearR` 当现行口径引用，但该键**全仓库零消费**（生成器用 `roadW × 0.5`）——改为注记「死配置，待清理」，并在 §3.1 长期债务登记。
  5. `specs/combat.md` §3.2 弹种表补注 5 个 noBounce 弹种（he/hesh/proximity_he/blast_he/heat 系）在 `RULES.ammoTypes` 中**不设** `bounceAngle` 字段（表内 90° 为「不可能跳弹」的语义值，由 `noBounce` 承载）。
- **临时文档生命周期清理**：`docs/PLAN.md` 原有 8 个「✅ 已完成」章节、`docs/ISSUES.md` 原有 10 个「核验记录」章节，均违反 `AGENTS.md` §2.2「实现并验证后**完全删除**」。已完成条目原文按 §2.2 第 3 步归档至 `docs/archive/2026-09.md`，正文只保留未完成项（PLAN §1 待办总览 3 项 + §2 非阻塞遗留 + §10 横向卷轴设计研究；ISSUES 无存量条目）。
- **改后一致性自检**：`AGENTS.md` §5 指针（`DEVELOPMENT.md` §3 / §4）与 §2 章节号描述复位；§4 编号升序；specs 数值与 `node scripts/audit-content.js` 实测一致；全部 `§4.x` 交叉引用可解析。

### 4.35 2026-09-23 A 档清账：recon/track_repair 死效果键整体摘除 + junctionClearR 死配置清理（已完成）

> 现行细则归口 `specs/cards.md` §3（死效果键摘除与现行不变量）/ §4（卡池快照）/ §8.4~§8.5（能力卡分类），地图侧归口 `specs/map.md` §12.4（沿革注记）。

- **用户裁定**：死效果键**不接线、整体摘除**（2026-09-23）。
- **摘除内容（两键 + 5 张卡 + 3 处接线点）**：
  1. `js/tank_cards.js` `ABILITY_KEYS` 剔除 `recon` / `track_repair` ⇒ 现恒等于「innate 3 键（repair/medkit/extinguish）+ runtime 7 键」，**无死键**；
  2. `tank_mvp.html` 技能池 DISPATCH 删除 `recon` 分支（其调用的 `tryDroneCommand()` **全仓库无定义**，靠 `typeof` 守卫恒为 no-op）；
  3. `tank_mvp.html` `ABILITY_KEY_HINT` 与 `js/tank_abilities.js` `ABILITY_LABELS` 删除 `recon` 词条（原表内 `recon: '侦察指令'` 与提示「侦察标记」）；
  4. 删除 5 张只带单一 `ability` 效果、卡面自述「占位」的卡：`cards/support_recon.json`（rare）、`cards/sniper_recon_mark.json`（epic）、`cards/emergency_track.json`（epic）、`cards/mobile_track_repair.json`（common）、`cards/support_track_repair.json`（common）。
- **连带清理**：`RULES.nodeMap.road.junctionClearR`（0.85；全仓库零消费，生成器实际用 `roadW × 0.5` 硬编码路口清空半径）从 `js/tank_rules.js` 删除。
- **卡池与统计（实测）**：`node scripts/audit-content.js` —— **173 → 168 张**（common 61→59 / rare 57→56 / epic 39→37 / legendary 15 / mythic 1）；效果数 209 → 204（`ability` 17→12）。
- **测试夹具同步**：`scripts/test-cards.js` 的 `EXPECT_BASE`（#A28 死锁防线清单）由 11 张缩为 6 张。
- **验证（三链）**：① `npm run check` 两部实测等价——`node scripts/check-html.js` **EXIT=0（All checks passed）** + `node node_modules/typescript/bin/tsc --noEmit` **EXIT=0**（注：`check-html.js` 已重构为 `fs`+`vm` 实现、不含 spawn，沙箱内可直接运行，与 `sandbox-verify` 早期的 EPERM 记录不同）；② `npm test` 全链 **EXIT=0**；③ `npm run test:browser` 四链**本次未在沙箱内实跑**（需系统 Edge + 放宽进程权限），**待正常环境补跑**——本次改动面（卡牌白名单 / 能力键 / 地图死参数）不在 smoke / r3 / run / r4 既有断言路径上。
- **同轮发现的既有 flaky（非本次引入）**：`scripts/test-ai.js` 的 `#E7 反应延迟随距离增大` 为**随机抖动采样**断言——首次全链运行出现 1 次失败，随后单跑 3 次与全链复跑均通过（`§4.32` 已记录同款现象）。
- **文档同步**：`specs/cards.md` §3/§4/§8.4/§8.5、`specs/combat.md` §4（技能快捷键池行）、`specs/map.md` §12.4、`AGENTS.md` §1/§5、本文件 §3.1（长期债务 2/3 结清）/§3.2（顺序重排）。

### 4.36 2026-09-23 B 档（1/2）：镜头外延上调 0.30 → 0.40 —— 视野卡收益解除截断（已完成）

> 现行细则归口 `specs/combat.md` §11.5（镜头外延量与视野卡收益的几何关系）；参数唯一口径 `js/tank_rules.js` 的 `RULES.camera.mouseLeadRatio`。

- **动机**：2026-09-23 视野裁定（同日，见 `docs/PLAN.md` §4）确认「可见半径口径不改，改走**视野卡 + 镜头外延做强**」。核实发现视野卡收益被几何护栏吃掉：`cap = (窄半幅 + radius×mouseLeadRatio)/(1+bias)`，`mouseLeadRatio 0.30` ⇒ `cap = 600` ⇒ `support_commander_periscope`（+15%）与 `sniper_commander_sight`（+25%）在 1080p 下**同被压到 `R = 600`**（卡面不同、实得同为 +11.1%）。
- **改动**：`RULES.camera.mouseLeadRatio` **0.30 → 0.40**（**单字段**——该值既是 `cap` 的分子外延项，又是 `updateCameraLead` 的外延量来源，两处同源自动一致）。未改视野卡数值、未改 `bias`/`screenRadiusRatio`/`minZoom`。
- **效果（`test-camera` #H5 实测输出）**：`cap` 600 → **667**；+25% 卡 `R = 666.7 = min(×1.25=675, 护栏 667)`（原 600）；+15% 卡足额 621；**无卡 `R = 540` 不变**（前向可见 729px 不变——外延上调只改构图与前向屏幕容量，不改无卡可见距离）。
- **代价**：鼠标顶在屏幕前缘时后向可见 270 → **180px**；外延按鼠标偏移归一化，**鼠标回屏幕中心即恢复满幅**（非单向收窄）。B 档余下项「增援只在前方」落地后可进一步抵消。
- **验证（三链）**：`node scripts/check-html.js` **EXIT=0（All checks passed）** / `node node_modules/typescript/bin/tsc --noEmit` **EXIT=0** / `npm test` 全链 **EXIT=0**（含 `test-camera` #H5 段——该段 cap 与卡牌护栏断言按 `RULES.camera.mouseLeadRatio` **动态计算**，改值自动跟随，无需重锚）。`npm run test:browser` 待正常环境补跑。
- **文档同步**：`specs/combat.md` §11.5 由「裁定待实施」改写为现行口径；`docs/PLAN.md` §1/§4.2 标注 B 档子项④完成。

### 4.37 2026-09-23 B 档（2/2 之一）：防线式敌人生成（已完成）

> 现行细则归口 `specs/map.md` §15（防线式敌人生成：分桶与间距 / 锚点来源 / 敌人数 / 兜底约束 / Boss 例外 / 回退路径）；参数唯一来源 `RULES.nodeMap.defenseLine`。

- **动机**：旧生成以玩家出生点为原点做**全向环带撒簇**（1~4 辆/节点），玩家没有推进方向感。B 档改为沿推进轴（+x，与玩家左缘出生 `w×0.10`、Boss 生成点 `w×0.7` 同向）分桶的**防线**；因 AI 激活受 `aiTriggerDist` 限制，玩家通常一次只遭遇前方一条防线 ⇒「推进—遭遇—清剿」节奏。
- **改动**（`js/tank_map.js`）：
  1. 新增纯函数 `planDefenseLines` / `collectDefenseAnchors` / `pickDefenseLineAnchor`（确定性，只消费注入 rng）；
  2. `makeNode` 的簇中心来源由「全向扇区环带」改为「防线锚点」（锚点优先级：路口 > 结构 full/intact/building/rock/ruined > 水体 > 林地簇（240px 网格聚合、≥3 成员）> 桶中心兜底）；
  3. `enemyCompositionForDepth` 新增第 5 参 `countOverride`（防线制目标数；缺省回退旧公式，向后兼容）；
  4. 兜底补满网格限定在推进轴防线区间内、按「离最近锚点距离」升序补位（旧口径按「离玩家最远」排序，会把未放满的敌人全推到地图最右缘成一列、破坏防线结构）；
  5. **Boss 节点强制走旧路径**（其常规敌人随后即清空，但敌簇质心驱动 A17 LoS 走廊——改锚点会连带改变 Boss 战地图，实测打破「掩体在界内」断言）。
- **参数**（`RULES.nodeMap.defenseLine`）：`spacingScreens 0.9` / `spacingDiff [1.15, 0.85]` / `linesMin 2` / `linesMax 3` / `anchorsPerLine 1` / `perAnchorMin 2` / `perAnchorMax 3` / `maxPerNode 12` / `anchorJunctionChance 0.45` / `axisTopFraction 0.92` / `lineMargin 300`；`enabled=false` 回退旧全向环带。
- **实测数值**（1080p 视口）：低难 **4 辆/节点**（2 防线 × 2 辆，quota 6）、高难 **9 辆/节点**（3 防线 × 3 辆，quota 11~17）；**敌军 100% 位于推进方向前方**（旧口径四周随机）；同 seed 逐字段确定性保持。
- **连带影响**：`quotaForDifficulty(initialCount, effDiff)` 公式未改动 ⇒ 击杀配额随初始敌数上升，**单节点战斗时长较旧版上升约 1.3~1.5 倍**（待子项③「推进式节点完成条件」重塑）。
- **附带修复（同轮发现并核实）**：
  1. **路口沙包越界**：`placeJunctionBarricades`（`js/tank_nodegen.js`）原无节点边界检查，路口靠近边界且 `r` 取到 `ringMax×路宽` 时沙包会生成到节点外（实测 `run-seed` 节点 4 三个 `barricade` 落在 `y≈1509 > 半高 720`）——新增 `bounds` 参数（调用方传模板 w/h × scale ÷ 2）+ 含半个外接圆余量的边界拒绝；
  2. **`test-ai` #E7 反应延迟断言 flaky**：`_reactionSeconds` 内含 ±25% `Math.random` 抖动（不可注入），near/far 真值差仅 26% ⇒ 单次采样约 1/4 概率误判（实测连续 2/3 次失败）——改为 **25 次采样均值**（标准误 ≈ 5% ≪ 真值差），断言语义不变，改后连跑 5 次全绿。
- **验证（三链）**：`node scripts/check-html.js` **EXIT=0** / `node node_modules/typescript/bin/tsc --noEmit` **EXIT=0** / `npm test` 全链 **EXIT=0**（含 `test-map` 新增「B 档① 防线式敌人生成」段断言、`test-replay` 同 seed 摘要一致、`test-nodegen` 七护栏与校准基线全绿）。`npm run test:browser` 待正常环境补跑。
- **文档与测试同步**：`specs/map.md` 新增 §15（现行口径）；`docs/PLAN.md` §1/§4.2 标注子项①完成；`scripts/test-map.js` 数量断言重锚（原「敌数 ≡ `enemyCountForDifficulty`」→「落在 `[难度基线, maxPerNode]`」，并新增防线专项断言段）。

### 4.38 2026-09-23 B 档（2/2 之二）：增援只补前方防线 + 推进式节点完成条件（已完成）

> 现行细则归口 `specs/map.md` §15.9（增援前方约束）/ §15.10（完成条件）；参数唯一来源 `RULES.nodeMap.reinforceFrontOnly` 与 `RULES.nodeMap.exitZone.xFraction`；判定纯函数 `nodeClearance`（`js/tank_map.js`）。

- **用户裁定**：节点完成条件改「**抵达右端出口 +（防线清空 或 配额达成）**」双条件（`docs/PLAN.md` §4.2-③）。旧口径（P-38）为「击杀数 ≥ 配额」单条件，**与推进正交**——玩家原地不动刷够配额即通关。
- **改动**：
  1. `js/tank_map.js` 新增纯函数 `nodeClearance(state)` → `{ exitReached, linesCleared, quotaDone, done, reason }`；常规节点要求 `exitReached && (linesCleared || quotaDone)`；**Boss 节点沿用「Boss + summons 全灭」**（不要求出口）；
  2. `reinforcementTick` 新增 `state.defenseLines` 消费：候选 x 区间限定为「`x1 > 玩家 x`」的**前方防线桶**（沿推进轴由近至远；先选区间再取 x，rng 消耗序列固定 ⇒ 确定性不变）；**玩家越过全部防线时不再增援**；未提供 `defenseLines` 或 `reinforceFrontOnly=false` 时回退旧全向行为；
  3. `makeNode` 输出 `defenseLines`（各防线 x 区间）与 `exitX`（= `w × exitZone.xFraction`）供运行时消费；
  4. mvp 完成判定改调 `nodeClearance`（统一 Boss / 常规两分支，替换原 `quotaDone || (noEnemies && !canReinforce)`），`#quotaHud` 文案改推进式提示（`推进 N% → 出口 M% ｜ 配额 k/q`）。
- **参数**：`RULES.nodeMap.reinforceFrontOnly: true`、`RULES.nodeMap.exitZone.xFraction: 0.93`。
- **效果**：增援不再出现在玩家身后；通关必须沿 +x 推进到出口线（`w×0.93`）且清空防线（或达成配额）。
- **同轮发现并修复的软锁（已核实，2026-09-23）**：mvp 侧 `canReinforce` 原按旧口径计算（`kills < quota`），与改造后的 `reinforcementTick`**门控不同源**——玩家冲过全部防线后（`x > 最后防线 x1`）杀死残敌但配额未达时，tick 已不再增援，而 `canReinforce` 仍为真 ⇒ `linesCleared` 恒假、`quotaDone` 亦假 ⇒ **节点永久无法完成**。修复：抽出纯函数 `reinforcementPossible(node, playerX, kills)`（与 tick 的落点门控严格同源），mvp 改用它；`test-map` 新增「软锁回归」6 项断言（含端到端：越过全部防线 + 清残敌 + 配额未满 ⇒ `done` 且 `reason='exit+cleared'`）。
- **同轮核查的相邻风险（探针实测无问题）**：tick 仍要求落点距玩家 ≥ `triggerDist×1.05`（≈846px），而 1280×720 下防线桶仅约 1152px 宽——理论上可能出现「前方有防线但刷不出兵」的死区。逐点扫描 1280×720（35 点）与 1920×1080（53 点）实测**死区 0 个**（距离按 `hypot` 含 y 维余量，极端掩体密集时最多延迟到下一个 8s 周期重试，不构成永久软锁）。
- **验证（三链）**：`node scripts/check-html.js` **EXIT=0** / `node node_modules/typescript/bin/tsc --noEmit` **EXIT=0** / `npm test` 全链 **EXIT=0**——`test-map` 新增「B 档②③」段 28 项断言（双条件真值表含出口边界与 Boss 分支 / `reason` 语义 / 增援落点**全在玩家前方**且落在防线区间 / 越过全部防线不增援 / 前方无防线不增援 / 无 `defenseLines` 回退旧行为 / `makeNode` 输出 `defenseLines` 与 `exitX` / 初始敌军全在出口线内 / 软锁回归 6 项）。
- **浏览器四链**：`npm run test:browser` **四链（smoke / r3 / run / r4）ALL PASS、EXIT=0**（2026-09-23 实跑；沙箱内需一次性放宽进程权限才能 spawn headless Edge，`spawn EPERM` 为已知固定限制）。**覆盖边界（已核实）**：四链**不含**完成判定 / 增援前方约束 / 推进 HUD 的专项断言（`test-browser-run.cjs` 无 `quota`/`exit`/`clearance` 用例），其价值为**回归证据**（新生成与判定路径未破坏既有浏览器断言、节点流程可跑通）；新语义的**直接**覆盖在 `test-map` 的 `nodeClearance` / `reinforcementPossible` / `reinforcementTick` 纯函数断言段。
- **文档同步**：`specs/map.md` §15 扩为「防线式推进体系」并新增 §15.9/§15.10；`docs/PLAN.md` B 档条目按生命周期归档（`archive/2026-09.md` + `ARCHIVE.md` 索引）；本文件 §3.2 下一步顺序更新（B 档收尾 ⇒ 下一步只剩 C 档 / 难度联动 / HUD 合并）。

### 4.39 2026-09-29 #K 批次：视野圆心口径修正（#K1）+ 出口/目标 UI（#K2）+ Boss 循环缩短（#K3）

> 现行细则归口 `specs/combat.md` §11.1/#K1（视野圆心与半径，§11.5 降为沿革）、`specs/map.md` §15.10（出口可视化与 HUD 目标卡）/ §15.11（Boss 循环）。

- **用户反馈**：① 敌人渲染出来的距离似乎还是短于视野距离；② 一个节点的完成目标和出口没有 UI 提示；③ 节点略长，缩短 boss 循环 5→3。
- **#K1 视野圆心口径修正（根因修复，非调参）**：旧圆心 = 玩家 + `bias×R`（鼠标向量被归一化 ⇒ 偏移恒 ≈189px），而摄像机另有**独立**外延量（`RULES.camera.mouseLeadRatio`，随鼠标偏移 0~360px）⇒ 两者几乎总不相等 ⇒ **视野圆探出视口**（外延 < 189 时向前探出，鼠标居中时达 189px）；探出带内的敌人「`entityHiddenByVision` 判定为可见，却被 `aabbInView` 视口剔除 ⇒ 不渲染」= 反馈①的成因。
  - 修复：`visionCenter(cam, player, R)` 圆心改取**摄像机中心**；半径 ≤ 窄半幅/zoom ⇒ **圆恰好内切视口** ⇒ **渲染边界 ≡ 视野边界**（新增不变量，与鼠标偏移、缩放均无关）。同时**取消原收口上限 cap**（圆既已内切便无需护栏）⇒ 视野卡加成由被削的 ≈667 恢复为**全额 675**（附带治好「+15%/+25% 两卡近乎同效」）。
  - 边界：镜头被 `clampCamera` 钳住时圆心向玩家收敛至偏移 ≤ `R×0.85`，**保证玩家恒在圆内**（贴身威胁可见）。持视野卡时半径 675 > 窄半幅 540 ⇒ 纵向被屏幕裁掉，属长宽比的几何必然，已在 specs 诚实记录。
- **#K2 出口与完成目标 UI**：新增世界层出口带（`exitX` 后 220px 绿色渐变 + 出口线 + 3 枚脉动箭头 + `EXIT 出口` 字样）、小地图出口标记（`drawMinimap` 新增 `opts.exitZone`）、HUD 显式目标卡（「目标 OBJECTIVE」+ 两条件状态 + 进度行）。参数 `RULES.nodeMap.exitZone = { xFraction: 0.93, bandWidth: 220, draw: true }`。
- **#K3 Boss 循环缩短**：`RULES.nodeMap.bossInterval` **5 → 3** ⇒ Boss 索引 2/5/8/11/14；一局 5 节点内含 1 个 Boss（index 2）。Boss 节点无配额、不生成常规敌军 ⇒ 以 Boss 战替代部分常规节点的配额 grind，这是缓解「节点略长」的机制本身。
- **验证（三链）**：`node scripts/check-html.js` **EXIT=0** / `tsc --noEmit` **EXIT=0** / `npm test` **EXIT=0**——`test-camera` 新增 #K1 段（圆心 ≡ 摄像机中心且圆内切视口：无外延/满外延/斜向外延/临界 R×0.85 四种镜头状态；镜头被钳时玩家恒在圆内；卡牌半径可超窄半幅），并重锚卡牌加成断言（675 无截断）；`test-map` 重锚 #K3 Boss 周期断言（12 节点内恰 4 个 Boss）。
- **浏览器四链**：`npm run test:browser` **四链 ALL PASS、EXIT=0**（本批改了 mvp 绘制层与 HUD DOM，全程无 console/page error）。覆盖边界沿用 §4.38 记录：四链不含完成判定/出口 UI 的专项断言，其价值为回归证据。
- **遗留（不记为问题）**：#K2 的世界出口标记与 HUD 属**观感**，需实机确认（字号/带透明度/箭头位置）；#K1 后玩家在鼠标居中时前向可见为 540（< 高难接战 650），「激活→可见」窗口仍在（用户此前已接受该边界，且朝推进方向瞄准时可见 900）。
- **验证（三链）**：`npm run check` EXIT=0；`npm test` EXIT=0；`npm run test:browser` 四链 ALL PASS（沙箱内 `spawn EPERM` 属管道捕获限制，按 `sandbox-verify` 需一次性放宽进程权限后实跑）。本条为纯文档改动，无代码路径变更——三链用于确认文档未误伤任何被引用的实现。

### 4.40 2026-09-30 #H 批次：敌军基准解耦（#H1）+ 布雷器可用性（#H2）+ 技能槽指派体系（#H3/#H4）

> 现行细则归口 `specs/combat.md` §12（敌军数值基准与技能槽指派体系）。

- **用户反馈（四条，均浏览器实测复现后立项）**：① 敌人难度似乎会随着**全局商店升级**变化，不应该，只应随节点推进变化；② 地雷无法释放；③ 获得便携掩体卡牌时 UI 栏出现 2 个按钮且占用的数字键不正确；④（举一反三）检查其他 UI 组件同类问题。核查后拆为 #H1~#H4 四条已核实问题，用户裁定 #H3 采用「**循环复用，按玩家选择顶替某个槽位的技能**」。

- **#H1 敌军数值基准由「玩家锚定」改为「固定基准」（核心平衡修复）**
  - **根因（实测定位）**：难度曲线本身干净——`difficultyForIndex` 只吃 `index` + 跨局等级，`difficultyLevel` 亦确认每次新局强制归零，同 seed 下买满五项永久升级后 `node0.difficulty` 与节点难度序列**完全不变**。真凶是两条**以玩家为锚**的放大链：① `applyEnemyAppearanceAndStats` 把敌军 `base` 全部写成 `玩家 anchorStats × enemyClassProfiles`，而锚点快照在 `applyUpgrades()` **之后**冻结；② `difficultyCapMuls` 的穿深封顶/伤害地板与天花板/速度目标全部乘 `player.stats`。⇒ 商店每买一级，下一局全部敌军血/穿/伤/速同比例抬升，玩家成长收益被同步抵消（实测：五项升级买满后敌军穿深 149.96→173.60、伤害 35→45.50、血量 64.29→104.47）。
  - **修复**：新增 `RULES.enemyAnchorBase`（与玩家无关的固定基准，取中位中坦量级）；`applyEnemyAppearanceAndStats` 第三参 `anchorStats` **正式废弃并忽略**（保留形参仅为兼容旧调用方），`difficultyCapMuls` 四键改按固定基准计算并改名 `penCapVsBaseline` / `dmgFloorVsBaseline` / `speedVsBaseline`（+ 新增 `strongestAnchorMult`，使「不传 strongest」时天花板有确定值而非退化为 `Infinity`）；mvp 三处调用（Boss 召唤 / 节点敌军 / 增援）不再传玩家快照，`playerAnchorStats` 整体退役。
  - **净效果**：敌军强度只由节点难度 `diff` 决定，玩家选车与局外永久升级**一律不影响**敌军；数值曲线形状不变（entityMults 难度表未动）。

- **#H2 布雷器「只能放一次」+ 装填冷却失效**
  - **根因**：`RULES.abilities.deploy_limits` 里 `mineFieldCount(5) > mineMax(3)`，而生成侧 `n = min(mineMax, count)` 把 5 钳成 3，再配上「`existing + n > cap` 即拒绝」的判据 ⇒ 首轮布满 3 枚后**所有后续雷场 100% 静默丢弃**（实测第 2/3 轮均 0 新增）；叠加 `handleMineFieldF` 既不检查也不写入 `player.secondaryReloadT`，15s 装填完全失效（可无冷却连点）。绘制层二次用 `mineMax` 钳制，预形态与实际落点数也对不上。
  - **修复**：① 落雷数改按**可用余量裁剪** `n = clamp(count, 0, cap − existing)`（预约时与生成时各裁一次），余量为 0 才拒绝并**即时**提示（不再让玩家白等 4s）；② `mineFieldCount` 由 5 改为 3 与基础上限自洽；③ 补装填门控：冷却中拒绝并提示，确认后写入 `secondaryReloadT = reload / debuffReloadRate`（与单发路径同口径）；④ 绘制层直取预约时的数量，所见即所得。#F6「超限拒绝且保留已布地雷」的原意保留——上限仍是硬约束，但满上限时能立即得到反馈。

- **#H3/#H4 技能槽由「自动推导」改为「玩家指派」**
  - **根因**：旧 `skillHotkey` 用 `owned[num-1]`（`owned` = cardEffects 去重顺序），带来三个互为因果的缺陷：① `artillery`/`shield` 既有专属键按钮（`btnG`/`btnH`）又自动进槽 ⇒ **同一技能两个按钮**；② 运行时技能键 7 个（`ABILITY_KEYS_RUNTIME`）而槽位固定 3 个，TAB 面板无激活入口 ⇒ **第 4 个及以后的技能彻底无法激活**；③ `owned[num-1]` 缺失时回落 `fallbackList(['deploy_cover','artillery'])` ⇒ 按隐藏的 3 号键会**实际触发 1 号槽的技能**（部署掩体）。此外弹种槽角标写死 1/2/3，与「数字键已归技能池、弹种走 Q/E」矛盾。
  - **修复（用户裁定口径）**：槽位改为 `player.skillSlots`（长度 3，玩家可指派）——新技能先自动填入空槽；**槽满时弹「选槽位」面板由玩家指定顶替哪一格**（循环复用），待指派技能进入队列逐个弹出，不静默丢弃；数字键**严格映射槽位、无 fallback**（#H4 消除隐藏键误触发）；专属键按钮仅在该技能未入槽时显示（#H3a 消除双按钮）；`Shift+点击`槽位可随时改指，面板 `Esc` 关闭并吞键（不误触发暂停/施放）；弹种槽角标改为纯选中指示（`●/○`），title 对齐 `Q/E`。
  - **效果**：7 个运行时技能键不再有「死键」——超出 3 个时由玩家决定谁上槽；任一技能都至少有一个可见入口。

- **验证（三链）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **EXIT=0**——`test-modifiers` 新增 #H1 段 7 项断言（2026-10-04 实测；`enemyAnchorBase` 已定义、**强弱玩家下封顶系数逐值相同**、`applyEnemyAppearanceAndStats` 传玩家基准不改变敌军 base、缺 `strongest` 时天花板有确定值），并把原 #A16 段 4 项断言重锚到新键名与固定基准。
- **浏览器四链**：`npm run test:browser` **四链 ALL PASS、EXIT=0**（97 PASS / 0 FAIL）。`test-browser-r4.cjs` 新增 **E 段 10 项 #H 回归断言**：布雷确认后入冷却 / 冷却中拒绝 / 第二次雷场可再生成、`btnG`/`btnH` 不重复显示、槽满弹选槽位面板、玩家指定顶替、槽位循环复用不产生重复入口、空槽按数字键不触发、数字键 3 精确命中第 3 槽。
- **实机对照（同 seed、无升级 vs 五项升级买满）**：`node0.difficulty` 0.15 → 0.15、节点难度序列完全相同；玩家穿深 160→185（对照组，确认升级确实生效）；敌军穿深 112.47 → **112.47**、伤害 31.551 → **31.551**、血量 80.36 → **80.36**（完全不变）。
- **遗留（不记为问题）**：敌军速度仍每辆有 `randFactor(0.85~1.15)` 的独立随机浮动（与玩家无关，属难度设计内的个体差异）；`enemyAnchorBase` 的绝对量级为中位中坦取值，若实机体感偏易/偏难应调该表（而非回退玩家锚定）。
- **文档同步**：`specs/combat.md` 新增 §12（敌军数值基准与技能槽指派体系）；`docs/ISSUES.md` #H1~#H4 按生命周期归档（`archive/2026-09.md` + `ARCHIVE.md` 索引）。

### 4.41 2026-10-01 敌人难度数值调优（用户裁定 3 项：速度上限↓ / 血量↑含 Boss / 升级略快）

> 现行细则归口 `specs/combat.md` §13.4（敌人数值乘子与极速封顶）、`specs/map.md` §16（难度成长曲线）、`specs/boss.md` §5（Boss 血量倍率）；参数唯一口径 `js/tank_rules.js` 的 `RULES.difficulty` 与 `RULES.boss.tuning`。

- **用户裁定（三项）**：① 降低敌人**速度上限倍率**；② 提高敌人（**包括 Boss**）**血量**；③ **略微提高敌人升级速度**（敌人随节点推进变强更快）。口径经用户确认：作用于**正式游戏随节点推进的敌人强度**（节点难度 `diff` → `entityMults`），**不是** bench「Enemy Lab 等级 Lv.」曲线（`js/tank_panels_core.js` `enemyLevelMults`，本次未动）。
- **改动（纯参数变更，公式结构未改）**：

  | 参数 | 沿革 | 现行 | 效果 |
  |---|---|---|---|
  | `RULES.difficulty.curvePow` | 1.25 | **1.20** | 越接近 1 中段难度越高 ⇒ 敌人升级更快；端点不变（index 0 = 0.15 / index ≥ 12 = 0.95） |
  | `RULES.difficulty.entityMults.maxHp` | [0.45, 1.4] | **[0.5, 1.7]** | 血量低难度端 +11%、满难度端 +21% |
  | `RULES.difficulty.entityMults.maxSpeed` | [0.7, 1.15] | **[0.7, 1.0]** | 满难度极速上限倍率 −13%；普通敌人被 `speedVsBaseline` 封顶覆盖 ⇒ 主要作用于 Boss |
  | `RULES.difficulty.speedVsBaseline.baseCeil` | 0.6 | **0.5** | 普通敌军极速上限系数（`baseFloor 0.3` 不变 ⇒ 低难度速度不变、曲线更平） |
  | `RULES.boss.tuning.hpMul` + 5×`bosses/*.json` | 8 | **9** | Boss 血量（5 份 boss 定义自带 `tuning.hpMul` 覆盖缺省，两侧同改） |

- **同步的回退默认值（防脱离 RULES 的纯函数走旧值）**：`js/tank_map.js` `difficultyForIndex` 缺省块（curvePow）与 `entityMultsForDifficulty` 回退表（maxHp/maxSpeed）；`js/tank_model.js` `difficultyCapMuls` 的 `speedVsBaseline` 缺省字面量（baseCeil）。
- **实测增幅（2026-10-01 探针，脚本用后即删）**：普通敌人血量 **+14.5%（index 0）→ +20.4%（index 8）**；普通敌人极速上限（高难度、含每辆 `randFactor` 上限 1.15）**82.8 → 69.0 px/s**；Boss 血量 **+28.8% ~ +35.5%**（高于普通敌人幅度，对应「包括 Boss」的裁定）；难度曲线中段 index3 0.29 → 0.30、index6 0.49 → 0.50、index8 0.63 → 0.64。
- **验证（三链）**：`node scripts/check-html.js` **EXIT=0（All checks passed）** / `node node_modules/typescript/bin/tsc --noEmit` **EXIT=0** / `npm test` 全链 **EXIT=0**（含 `test-map` 新增「升级速度基线」断言：`curvePow === 1.20`、`index3 === 0.30`、`index6 === 0.50`；`test-panels` 速度封顶断言重锚 **72 → 60 px/s**）。`npm run test:browser` **待正常环境补跑**（沙箱内 `spawn EPERM`，见 `sandbox-verify` skill）。
  - **同轮顺带修复**：`scripts/test-cards.js` 块内重复 `const model = require('../js/tank_model.js')` 触发 `tsc` **TS2300 Duplicate identifier**（由前序会话未提交改动引入，非本次改动），改为复用文件顶部 require ⇒ `npm run check` 恢复 EXIT=0。
- **归口与生命周期**：`specs/combat.md` 新增 §13.4 并改写 §13.1 现行值（`baseCeil 0.5`，原处留沿革）；`specs/map.md` 新增 §16；`specs/boss.md` §5 血量 ×9 + 沿革；测试同步 `test-map` / `test-panels` / `test-modifiers`。本次无 `PLAN.md` / `ISSUES.md` 条目需删除或归档，故不产生归档分卷条目。

### 4.42 2026-10-01 #J 批次：地雷可连布（#J1）+ 换装不继承（#J2）+ 视野退役（#J3）+ 导弹反馈（#J4）

> 现行细则归口 `specs/combat.md` §13.5（视野距离系统退役）·§13.6（地雷可连续布设与主武器换装重置）·§4 副武器条目（导弹口径与反馈）。

- **用户反馈（四条）**：① 地雷在 1 个节点内似乎只能部署 1 次；② 获得电磁炮后再获得其他主炮，似乎会继承可穿透弹药的特性；③ **裁定**「改为全屏幕渲染敌人，不再计算视野距离的问题。敌人 AI 是否被触发维持为距离 + 是否有直线视野（建筑或草丛、树冠等）」；④ 导弹无法发射（附带指出卡面未写明「伤害跟随 HEAT」）。

- **#J1 地雷只能布 1 次 → `mineMax` 3→6、硬上限 8→12**
  - **根因**：`mineMax`（**场上同时存在**的地雷数上限）恰等于单次雷场数量 `mineFieldCount`（均为 3），首轮雷场即把上限用尽；地雷存续 30~45s、单节点战斗远长于此 ⇒ 后续雷场全部被 #F6 的「超限拒绝」判据拒收。**口径澄清**：`mineMax` 是同时在场数，不是本局总数。

- **#J2 换装继承 `pierce` → 换型安装先重置为新类型基准**
  - **根因**：`js/tank_cards.js` 主武器 `install` 用 `Object.assign({}, 旧 stats, overrides)` 合并，**旧武器专有键被带进新武器** —— 最典型的是 `railgun` 的 `pierce`/`pierceDmgMul`（`js/tank_fire.js firePrimaryShell` 据此赋予贯穿能力），实测换上 `double_barrel` 后仍 `pierce=1 / pierceDmgMul=0.6`。
  - **修复**：换型时先 `getWeaponDefaults('primary', wType)` 重建基准再合并卡牌覆写；同型安装保持合并语义（幂等，不丢 `tanks/*.json` 自定义值）。副武器 install 原本就构造新对象，无此缺陷；两条路径共用新增的 `_weaponDefaultsResolver()`。

- **#J3 视野距离系统整体退役（改为全屏渲染）**
  - **退役范围（不留死开关）**：`js/tank_camera.js` 的 `visionRadiusForViewport`/`visionCenter`/`visionClamped`；mvp 的剔除逻辑（`entityHiddenByVision` 保留同名函数恒返回 `false`）、视野虚线圈、`visionRadiusEff` 的卡牌加成与屏幕相对计算；dev 面板「无视野」开关（`tank_devpanel.js` + mvp/bench 接线 + `types/globals.d.ts`）；两张视野卡 `support_commander_periscope`（+15%）与 `sniper_commander_sight`（+25%）按 2026-09-23 A 档死效果卡先例删除，`PASSIVE_KEYS` 移除 `commander_sight`（**卡池 168 → 166**）。
  - **现行口径**：敌对实体一律渲染、一律可被命中，只剩 `aabbInView` 视口剔除（纯性能）。`tank_fire.js` 的 `hiddenByVision` 命中剔除钩子一并移除（否则「看得见却打不中」）。`RULES.vision` 仅作历史配置留档。
  - **明确不受影响（用户要求的第二半）**：AI 接战判定一直是 **「距离 + 直线视野」**——`RULES.ai.engageRequiresLoS` + `js/tank_ai.js` 的 `hasLoS`，遮挡由 `js/tank_cover.js hasLineOfSight` 按掩体的 `vision: true` 键判定（建筑/岩石/树/灌木/倒树遮视线；栅栏/沙袋/残骸/水/泥/路不遮）。

- **#J4 导弹「无法发射」→ 实为激活后零反馈 + 状态残留**
  - **核实（两条都成立）**：导弹**本身能发射**（条件为「炮塔 ±30° 扇形内、600px 内、持续锁定 1s」，实测对准后 `shots:1`）；真缺陷是 `_missileActivated` 激活后**UI 零指示**（锁定指示器仅在 `_missileLock` 存在时绘制），炮塔没对准或目标在射程外时既不发也不提示。
  - **附带状态残留缺陷**：`_missileActivated` 是**开关态**，换掉副武器时未复位（主循环的 `type==='missile'` 门控只是不再推进它）⇒ 实测「激活 → 换成布雷器 → 再装回导弹」会在玩家没按 F 的情况下**自动索敌并发射**。
  - **卡面/规格不一致**：代码实现「伤害跟随当前 HEAT 弹种系数」（`getEffectiveHeatAmmoKey` → `computeAmmoConfig`），卡面只写「伤害 140」；`specs/combat.md` §4 原写「手动击发沿光标直飞、不自动寻的」（#A21 旧口径）与 §8.2 的「激活→锁定→自动发射」互相矛盾。
  - **修复**：HUD `btnF` 加「索」（已激活未锁定，琥珀脉动 `.lock-hunting`）/「n%」（锁定中，绿色 `.lock-on`）+ `title` 写明条件；激活后 0.6s 仍无目标 → 一次性提示**缺哪一条**（射程内无敌人 / 炮塔未对准）；激活日志写明条件；换装复位 `_missileActivated`/`_missileLock`/提示标志；两张导弹卡面同步写明锁定流程与 HEAT 跟随；`specs/combat.md` §4 改为现行口径并标注 #A21 旧口径作废。

- **验证（三链）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **EXIT=0** / `node scripts/validate-content.js` **EXIT=0**——`test-cards` 新增 #J2 段 7 项；`test-rework-r2` 新增 #J1 段 6 项；`test-camera` 删除原 #H5/#K1 视野圆断言段（被测对象已不存在），保留 `aabbInView` 与 `minZoom`。
- **浏览器四链**：`npm run test:browser` **四链 ALL PASS、EXIT=0**。`test-browser-r4.cjs` 新增 **F 段 10 项 #J 回归断言**（地雷同节点连布 2 轮 / 电磁炮换装不继承 pierce / 视野剔除恒 false 且 LoS 原语仍在 / 换装复位激活态 / 无目标「索」+ lock-hunting / 日志说明原因 / 对准 lock-on 并发射）；`test-browser-smoke.cjs` P-39 段由「R×zoom 恒定」改写为**退役断言**（`visionRadiusEff` 恒为名义常数、不随 zoom 补偿；无隐藏实体）。
- **遗留（不记为问题）**：`RULES.vision` 四键（`radius`/`bias`/`inner`/`screenRadiusRatio`）保留为历史留档并仅供调试钩子 `__TEST__.visionZoom()` 读取，不再参与任何判定；若后续确定无调试价值可整键删除（届时同步 `test-browser-smoke` P-39 探针）。
- **文档同步**：`specs/combat.md` 新增 §13.5/§13.6 并改写 §4（导弹）与「视野系统」段；`docs/archive/2026-10.md` 新建（本批次为该分卷首条）+ `ARCHIVE.md` 索引与分卷列表登记。

### 4.43 2026-10-01 #M 接战机动随机化（敌人接近玩家时的多形态轨迹 + 开火节奏）

> 现行细则归口 `specs/combat.md` §13.7（唯一口径：机动类型/权重、偏角与行程随机、短停与开火节奏、装填期偏置、不覆盖语义、回退开关）。

- **用户裁定**：「敌人接近玩家时，要有多种行为：直线/斜线/曲线行进或后退，行进时/短停后开火，其行进的角度、距离、短停的时间也随机，以增加随机性。」
- **问题定位（实测）**：改前接近轨迹单一——`js/tank_ai.js` 按单点 `engage`(520px) 决策 `dist>engage→move=1`，**恒定直线冲脸**；偏航仅来自 #83 peek（±0.5rad 单帧叠加）与 #88 侧摆（装填期 ±0.78~1.57rad），都不是持续轨迹，开火时刻也只由装填结束决定 ⇒ 整簇敌人同节奏逼近。
- **实现（`RULES.ai.maneuver` + `js/tank_ai.js` `_maneuverRoll` / `_applyManeuver` / `_maneuverReloadGap`）**：
  - 敌人接战时懒分配**机动脚本**（挂 `t._mv`），一次随机决定**类型 + 偏角 + 行程 + 短停时长**，走完/超时即**重掷**；五类：`direct` 直线 / `slant` 斜线 / `curve` 曲线 / `arc` 弧线绕行 / `retreat` 后撤。
  - 偏角与行程分档随机；曲线 `sweep` 与起始偏角**反号** ⇒ 偏角穿过 0，轨迹 **S 形回正**而非单向甩开。
  - 每段结束按 `holdChance` 进入**短停**：短停中 `move=0` 但炮塔照锁敌、可开火 ⇒ 形成「行进时开火 / 短停后开火」双节奏；短停结束瞬间放宽开火容差 `resumeAimTolMul` 再收回，与 `reactionJitter` 叠加错开齐射。
  - **装填期偏置承接 #88**：装填前段改用偏置权重（压低直冲、抬高侧向）并压为微速蠕行；**普通敌人的装填期躲避由此统一承担，旧 `sideSwing` 仅保留 Boss 路径**（沿革：#88 原对普通敌与 Boss 均生效）。
- **刻意不覆盖的语义**：① 已在射程内（`baseMove===0`）保持原地驻停，「进入射程即停下开火」不被随机化推翻（**沿革：被 §4.44 修订并收窄**——初版仅保护 `baseMove===0`，`baseMove<0` 的退让曾被覆盖；§4.44 起判据改称「交战带」，驻停与退让一律确定性）；② **Boss 与 SPG 定距车不启用机动层**（角色定位为始终推进/保持距离）；③ `flank`/`coverSeek`/`stunned` 优先；④ 脱离接战即 `t._mv = null`。
- **回退**：`RULES.ai.maneuver.enabled = false` 完全退回改前直冲语义。
- **实现期修正的三处缺陷（均由测试暴露，非推测）**：`_MV_RNG` 初版存 `Math.random` **引用**导致测试的随机替换失效（改惰性求值）；`reloadGap` 未传入 `_maneuverPickMode` 使装填期权重偏置失效；机动层一度覆盖 `baseMove===0` 的驻停语义（已按上条①收窄）。
- **验证（三链）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **EXIT=0**（全链 0 项失败）/ `node scripts/test-ai.js` **全部通过**。新增 `#M 段 13 项` 断言；`#88 段` 改为断言「装填期抽到非 direct 机动 + 前进压为蠕行」，Boss 路径断言不变；滞回带断言由写死 `move===1` 改为状态不变量（机动后 `move` 可为 ±1 或 0）。
- **文档同步**：`specs/combat.md` 新增 §13.7；本条为 §4 正文延续（编号 4.43）。

### 4.44 2026-10-02 #N 交战结构重做（交战带 / 攻守分工 / flank 重写 / 分离力 / 来袭提示 / 装填脱离）

> 现行细则归口 `specs/combat.md` §13.8（唯一口径：6 个子系统参数、4 处实现期缺陷、量化对照表、回归清单）。

- **用户反馈**：「敌人全部尝试贴近玩家、又在屏幕边缘被动受击，玩家像打靶」→ 先给出诊断与方案（会话第一轮），再要求「再结合你建议的方案落地」。**用户裁定 2 项（2026-10-01）**：① 反打靶可见性**仅做玩家侧提示**（不给敌人加视口门控，保留 #J3「全屏可命中」口径与边缘压迫感）；② 实施范围 = 全部落地（交战带 / 攻守分工 / flank 重写 / 分离力 / 装填脱离）。
- **实现（6 项，配置全收口 `RULES.ai`，见 §13.8）**：
  1. **交战距离带** `engageBand`：单点 `engage/close` → 按类别 `[minRatio,maxRatio]×engage`（light/medium/heavy/spg 四档 + 车体尺度下界兜底）；`dist>max` 接近 / `dist<min` 脱离 / 带内驻停开火。heavy「只进不退」的 `moveLock` 角色特性保留。
  2. **攻守分工** `squad` + 新模块 **`js/tank_ai_squad.js`**（纯逻辑、可 Node 测）：节点级协调器每 0.6s 按「距离/LoS/血量」评分 + 角色粘性，分配 `press`（压上，名额 2~4 随难度）/ `flank` / `hold`；`hold` 走 `holdGate` 射界门控。协调器只写 `t.aiRole`，不产生位移。
  3. **flank 重写** `flankRewrite`：站位点改为**玩家为圆心的定点扇区站位**（半径 = 交战带外沿 ×1.15、方位 ±60°~120°、按实体稳定哈希分左右），进入时锁定、到位转 press。旧 flank 分支降级为回退路径。
  4. **群体分离力** `separation`：同类（180px）+ 玩家（108px×0.7）线性衰减斥力 → 相对朝向的 ±1 转向偏置，**仅作用于 press**。
  5. **视口外来袭方向提示** `threatIndicators`：筛选「已接战 + 视口外 + ≤engage×1.4」前 6 条，mvp 画**琥珀色边缘箭头**（与无人机红箭头区分）。纯玩家侧信息层，不改任何 AI/命中判定。
  6. **装填脱离** `retreatReload`：装填期中距离退到掩体背弹面，与 #76 C6 `coverSeek`（重甲残血）构成两条独立退避通道。
  - **回退**：5 个子系统各自 `enabled` 开关，全关即回到 #M 及更早的单点直冲行为。
- **实现期修正的 4 处缺陷（均由量化探针 `scripts/diagnose-ai-crowd.js` 暴露，非推测）**——这是本轮最值得留档的部分：
  1. **退让被机动层覆盖**：#M 初版只保护 `baseMove===0`，`baseMove=-1` 的退让被机动层 `move=+1` 覆盖 ⇒ 退着退着又贴上。→ 机动层收窄为**只接管 `baseMove>0`**。
  2. **旧 `repos`（#83）在驻停帧复活**：守卫条件 `!maneuverOn` 依赖逐帧变化的 `baseMove`/`role`，驻停帧为真 ⇒ `repos` 重新接管 `move` 随机 ±1 冲向玩家。→ 改为**静态判据** `legacyMicroOn`（仅 Boss / SPG 定距车 / 整体关闭机动层 走旧 `sideSwing`+`peek`+`repos`）。
  3. **flank 站位「棘轮内移」**（最隐蔽的一处）：站位半径 0.95×engage 落在交战带**内侧**，且站位点按当前方位角**每帧重算**（目标绕玩家转 ⇒ 螺旋内收），叠加 0.6s 角色重排 ⇒「当 flank 内移、转 press 驻停」逐次逼近（实测 700→395→**273px**=带内沿）。→ 站位点**进入时锁定一次** + 半径改以 `band.max×1.15` 为基准（恒在带外）+ `roleStickiness` 抑制横跳。已加防复发断言。
  4. **分离力干扰 flank 定点到达**：斥力改写 `turn` 使敌人进不了 `arriveDist` 圈，持续前进螺旋贴脸。→ 分离力**仅作用于 press**。
- **量化对照（决策层探针，同初始态势：6 辆环形 700px、30 秒、固定随机种子）**：

  | 指标 | 改前 | 改后 | 变化 |
  |---|---|---|---|
  | 同时压上（press）车辆数 | 6.00 | **2.00** | −67% |
  | 近身圈内（≤engage×0.9）敌人数 | 0.71 | **0.00** | −100% |
  | 最近敌人距离 | 447px | **522px** | +17% |

  ⇒ 「全员贴脸」与「一拥而上」同时消除。`fanout` 3.33→1.87 属预期：改前六辆均匀包围（全方位压迫），改后 2 压上 / 3 驻守 / 1 绕行 ⇒ 玩家不再同时面对所有方向。
- **新增/修订测试**：`scripts/test-squad.js` **新增 25 项**（已接入 `npm test` 链）；`scripts/test-ai.js` 新增 **#N 段 26 项**（两项计数均为 2026-10-04 实测 `ok()`），旧 flank 断言改为「回退路径」语义（`flankRewrite.enabled=false` 下验证），滞回带断言改为状态不变量。
- **验证（三链，2026-10-02；2026-10-04 复核）**：`npm run check` **EXIT=0**（含 `tsc --noEmit`）/ `npm test` **EXIT=0**（全链 0 项失败）/ `npm run test:browser` **四链 ALL PASS、EXIT=0**。
- **文档同步**：`specs/combat.md` 新增 §13.8 并给 §13.7 的被修订项加沿革注记；`js/tank_ai_squad.js` 已按加载顺序接入 `tank_mvp.html`（在 `tank_ai.js` 之前），`types/globals.d.ts` 补齐 **14 个** `declare`（`js/tank_ai.js` 侧 7 + `js/tank_ai_squad.js` 侧 7；2026-10-04 实测）。
- **2026-10-04 复核修正（文档↔代码一致性审计 + 死代码清理）**：对 §4.41~§4.44 / `specs/combat.md` §13.4~§13.8 / `specs/map.md` / `specs/boss.md` 逐条比对代码后修正 6 项：
  1. **死配置清理（4 键，无任何消费方）**：`engageBand.breakAwayTurn`、`flankRewrite.distMinRatio`/`distMaxRatio`、`retreatReload.holdAfterArrive` —— 四键在 `js/tank_rules.js` 声明但全仓无消费者，其中 `breakAwayTurn` 的注释还描述了并未实现的行为并引用了 §4.44 中不存在的内容。按 2026-09-23 A 档死配置清理先例**整体删除**（行为零变化；flank 的触发本由 #N2 角色评分决定、无距离窗口，到位后原地还击亦为无条件行为）。
  2. **死钩子清理**：`js/tank_fire.js` 的 `hiddenByVision` 命中剔除钩子与其在 mvp `fireCtx` 的注入补齐删除（#J3 声明「不留死开关」但当时漏删）——该钩子注入的是恒 `false` 的 `entityHiddenByVision`，属纯死开关；`entityHiddenByVision` 函数本体**保留**（渲染剔除调用点 + `__TEST__` 探针，`test-browser-r4` F3 仍断言其恒 false）。至此 §13.5/§4.42 所述「钩子已移除」与代码一致。
  3. **魔数收口**：分离力的玩家斥力半径原为硬编码 `radius × 0.6`，新增 `RULES.ai.separation.playerRadiusMul`(0.6) 收口（与力度权重 `playerFactor` 语义区分：前者管半径、后者管力度）。
  4. **保留项核对（非缺陷）**：`RULES.ai.retreatReload.hpGate`(0.0) 与 `classProfiles`/`tierProfiles` 等开关有明确消费者，仅默认值使其不生效，不属死配置。
  5. **文档计数实测更正**：`test-ai.js` #N 段 30→**26** 项、`test-squad.js` 24→**25** 项、`test-modifiers` #H1 段 6→**7** 项、`types/globals.d.ts` declare 9→**14** 个、`RULES.vision`「三键」→**四键**（键名本列了 4 个）。
  6. **文档措辞更正**：`resumeAimTolMul` 原写「放宽后再线性收回」，实为**单帧峰值**（无衰减逻辑），§13.7 与 `js/tank_ai.js` 注释同步改写；分离力「玩家（×0.7，半径 108px）」混淆半径与力度两个系数，改为分别引用 `playerRadiusMul`/`playerFactor`。
  7. **沿革注记补登**：`specs/combat.md` §10.2 / §11.1 / §11.4 / §11.5 四节仍把已退役的视野距离体系标为「现行口径」，补加「已被 §13.5（#J3）取代，仅作沿革」注记（§11.5 原仅有 #K1 注记）。
  8. **编号重叠说明**：`docs/ISSUES.md` 归档清单中 `#H1~#H5`（2026-09-21）与 `#H1~#H4`（2026-09-30）为**两个批次共用编号**，与 `AGENTS.md` §2「编号不复用」相悖；因归档原文按纪律不可回改且编号已被 §4.40 与 §13.1~§13.4 交叉引用，采取**保留原编号 + 按批次日期与主题区分**并就地加说明。
  - **复核验证**：`npm run check` **EXIT=0** / `npm test` **EXIT=0**（0 项失败）/ `npm run test:browser` **四链 ALL PASS、EXIT=0**；`node scripts/diagnose-ai-crowd.js` 数字与 §13.8 对照表逐格一致（6.00→2.00 / 0.71→0.00 / 447→522px / 3.33→1.87），确认上述清理**行为零变化**。

### 4.45 2026-10-04 P0 审计跟进（flaky 测试修复 / LICENSE / README / CI）

- **背景**：第三方视角代码审计指出 4 项 P0 仓库卫生问题（无 LICENSE、无 README、无 CI、flaky 测试中断 `npm test` 链），本批次逐项落地。
- **flaky 测试修复**（`scripts/test-ai.js`）：#M 机动随机化后两处断言仍写死 `move === 1`（「超过接战距离→靠近」与 F 段「tier0 带外沿→接近」），机动层掷出 `retreat`/`hold` 时约 1/4 概率失败。复现：连续 12 次运行 6 次失败（`move=-1`）。修复：改断言为接战不变量——`aiEngaged === true` + 机动脚本已分配（`_mv` 非空）+ `move ∈ {-1,0,1}`（与 4b 段滞回带断言先例一致：接近机动 ±1/0 均合法）。分布实测（300 次采样）：curve/arc/slant/direct 下 `move=1`、retreat 下 `move=-1`，`engaged` 恒为 true。修复后连续 25 次运行 0 失败。
- **LICENSE**：新增 MIT（Copyright (c) 2026 qi）。公开仓库此前无许可，他人 technically 无权使用/贡献。
- **README.md**：新增（项目简介、快速开始五页入口表、三链验证命令、目录结构、文档入口指针、MIT 声明）。
- **CI**：新增 `.github/workflows/ci.yml`（push/PR/workflow_dispatch；Node 20+22 矩阵；`npm ci` → `npm run check` → `npm test`）。`npm run test:browser` 需系统 Edge，未纳入 CI，合并前本地手动跑。
- **验证**：`npm run check` EXIT=0 / `npm test` 全链 EXIT=0（0 项失败）/ `test-ai.js` 25 连跑 0 失败。

### 4.46 2026-10-04 P1：npm test 改独立运行 + 汇总（run-tests.js）

- **背景**：§4.45 审计跟进指出 `npm test` 的 41 文件 `&&` 长链任一失败即中断后续，且看不到整体通过率。
- **实现**：新增 `scripts/run-tests.js`——逐个子进程独立运行（失败不中断后续），每项打印 ✓/✗ + 耗时，失败项附输出尾部（25 行），最后输出汇总表（通过/失败数、失败清单、总耗时）；退出码 0=全绿、1=有失败、2=无匹配。支持按文件名关键词过滤（`node scripts/run-tests.js ai`）与 `RT_EXTRA` 追加调试文件。`package.json` 的 `"test"` 改为 `node scripts/run-tests.js`（单行 diff）。
- **验证**：全量 `npm test` EXIT=0（41/41 通过）；失败路径用临时 exit(1) 文件验证：汇总正确列出失败项且 EXIT=1；`npm run check` 不受影响。

### 4.47 2026-10-04 CI 首跑失败修复（run-tests.js 类型错误）

- **背景**：§4.46 落地后 GitHub Actions 首次运行即失败（Node 20/22 双 job），均倒在 "Syntax + typecheck" 步骤。根因：`scripts/run-tests.js` 的 `r.error.code`——`spawnSync` 的 `error` 类型为 `Error`，`checkJs` 下直接访问 `.code` 触发 TS2339。本地当时未重跑 `npm run check` 即推送，漏检。
- **修复**：JSDoc 转型 `/** @type {any} */ (r.error).code` 读取 code。`npm run check` 本地 EXIT=0 复验通过。
- **教训**：新增/修改 `scripts/**` 后必须重跑 `npm run check`（tsconfig `checkJs` 覆盖该目录），不能只跑 `npm test`。

### 4.48 2026-10-05 C 档 batch 1：小地图条带化

- **背景**：用户拍板启动 C 档（2026-10-05）。按 `docs/PLAN.md` §3.8 分批计划开工 batch 1；其中「视野口径改锚定接战距离」已于 2026-09-23 被用户裁定否决（`docs/PLAN.md` §4），本批次**只做小地图条带化**。
- **问题**：strip 节点（≈10 屏 × 2.2 屏）按旧等比适配（`minimapLayout` 取 min 缩放）会退化成 ~20px 细线（`docs/PLAN.md` §3.6 风险 #5），推进进度不可读。
- **实现**（`js/tank_minimap.js`）：`minimapLayout(worldW, worldH, mmW, mmH, opts?)` 按世界宽高比自适应——≤2.5 走旧等比适配（行为零变化，常规节点不受影响）；>2.5 进条带模式：横向占满框宽（`sx = mmW/worldW`，推进轴保真、两端精确映射框左右缘），纵向按 `STRIP_Y_BOOST=2.5` 拉伸后垂直居中（纵向示意性不保真）。`worldToMinimap`/`worldRectToMinimap` 改走 `sx/sy` 双轴；`scale` 字段保留（=sx）兼容旧调用方。`drawMinimap` 内三处 `layout.scale` 改为 `sx/sy`（世界边框、出口区）。
- **口径同步**：`docs/specs/map.md` §14.4 小地图条目由「设计预留」改写为现行口径（已落地注记）；§14 其余条目仍为预留。
- **验证**：新增 `scripts/test-minimap.js`（18 断言：常规回归/阈值边界/条带占满/拉伸/居中/推进轴保真/视口矩形/opts 覆盖/旧字段兼容），已注册进 `scripts/run-tests.js`。`npm run check` 待全量复验（与坦克涂装批次合并跑）。

### 4.49 2026-10-05 坦克历史涂装（名实相符贴图）

- **背景**：用户要求「为现有的坦克绘制一些符合其名称的贴图」。坦克为程序化绘制（`js/tank_paint.js` TEXTURE_DEFS 叠层体系，非图片贴图），故以新增历史涂装键 + 逐车指定实现。
- **实现**（子代理并行，主代理验收）：TEXTURE_DEFS 新增 4 键（仿照既有 `camo`：固定 blob 坐标、确定性、ellipse 半透明叠层，clip 到部件多边形内）——`camo_dunkelgelb`（深黄底+橄榄绿/红棕色块）、`paint_panzergrau`（装甲灰单色+明暗变化）、`camo_nato`（北约绿底+棕/黑色块）、`paint_soviet`（苏军保护绿单色+明暗变化）。分配：tiger-I/hummel→`camo_dunkelgelb`、panzer-IV→`paint_panzergrau`、Leapard_1→`camo_nato`、Obj 780→`paint_soviet`（dummy 保持 rust）。同步 3 处：`js/tank_schema.js` TEXTURES 枚举、`js/tank_model.js` 注释键列表、`scripts/test-tanks.js` 兜底键；设计器 `textureSelect` 下拉 + allowlist + 注释同步。
- **验证**：`npm run check` EXIT=0；`npm test` 42/42（含新增 `test-minimap.js`）；视觉验收——自包含 file:// 验证页经 `makeTank`/`applyTankConfig`/`paintPartTexture` 真实管线渲染 5 车缩略图，4 种新涂装图案各自可辨、无绘制异常（底色为 teamColor 体系主色，叠层保持之，符合既有设计）。

### 4.50 2026-10-05 C 档 batch 2：`generateStrip`（片拼接生成器）

- **背景**：`docs/PLAN.md` §3.8 batch 2。只产出布局（covers/w/h），不接 `makeNode`/实战（防线生成与敌人布置是 batch 3）。
- **实现**（`js/tank_nodegen.js`）：
  - `generateStrip(difficulty, options)`：`advanceAxis` 参数（§14.7；本批次仅实现 `'x'`，其他抛错）；`stripScreensX/Y` 缺省 10/2.2（§14.1，不做精确绑定）；`chunkCount` 缺省按 ≈3.5 屏/片估算；`scaleFor` 必传（生产传 `tank_map.nodeScaleFor`，片内 scale 沿用现行口径）；`templateIds` 可逐片指定（测试用）。
  - 批量发牌：每片一次 `generateNode`（`centerX/Y=0`，`roadOpts.requireWETrunk: true`），片宽为模板自然宽度（`tpl.w × scale`），总长 ≈10 屏（实测 9.0 屏）。
  - 纵向裁剪：片高（≥3 屏）> 目标高（2.2 屏）时按中心丢弃带外元素，不做坐标压缩。
  - 密度补偿：带外 `structure`/`foliage` 钳制回界内（80px 边距 + SAT OBB 重叠检测，命中则放弃）；`ground`/`liquid` 不钳制。实测 ≈20/屏（≥ 现状 13）。
  - 接缝净空：内部片边界 ±300px 带内移除 `structure`/`foliage`，保留 `ground`/`liquid`（`STRIP_SEAM_CLEAR`）。
  - `placeRoadNetwork` 新增第 6 参数 `opts.requireWETrunk`（additive；拓扑掷骰后若无 W→E 干道则补一条正交横干，端点严格落左右边界线，§10.1 口径）；`generateNode` 新增 `opts.roadOpts` 透传。缺省关闭，既有 7 拓扑零回归（test-strip 断言同 seed covers 一致）。
- **口径同步**：`types/globals.d.ts` 新增 `NodeGenOptions.roadOpts`、`StripGenOptions`、`generateStrip` 声明，`nodeScaleFor` 签名收紧；`docs/specs/map.md` §14.2 逐条标注已落地（未接入实战）。
- **验证**：新增 `scripts/test-strip.js`（18 断言）：拼接确定性/seed 敏感/尺寸/裁剪/接缝净空/每片横向贯通干道/密度≥10/连通性≥0.999/38px 通道≥0.999/零回归/参数校验。**「最窄通道 ≥38px」操作化说明**：`nodeLayoutMetrics` 原始 minGap 对装饰性贴靠对极敏感（常规节点基线仅 1~3px），故以「阻挡掩体按车体半宽 19px 膨胀后连通性 ≥0.999」验收（3 seed 实测 0.9997~1.0）。
- `npm run check` EXIT=0；`npm test` 43/43 全绿（含新增 `test-strip.js`）。

### §4.51 C 档反馈修复批（2026-10-05）：接缝公路贯通 + 历史涂装体系 + 路面净空
- **接缝公路连续**：`placeRoadNetwork` 新增 `opts.weTrunk = { entryT }`——强制一条 W→E 贯通路，入口 t 衔接上一片出口 t；`generateNode` 回传 `weTrunk`，`generateStrip` 逐片传递。首片复用拓扑自带横干（避免重复）。`test-strip.js` 新增链式断言（出口 t = 下一片入口 t）。
- **历史涂装体系**：`TEXTURE_DEFS` 4 历史涂装新增 `base` 实色；`paintPartTextureDirect` 车体填充/细节线改取 `tankBodyColor()`（base 优先），队伍色退出车体，仅保留描边/血条/小地图标识。履带统一深钢色，炮管/炮盾取实色深阶。`getCachedTankSprite` 缓存键改按实色（同纹理跨队伍共享）。
- **体积感**：`paintPartTextureDirect` 新增顶光→底阴纵向渐变；`paintTurretShadow` 加硬投影（炮塔剪影平移填充）+ 软阴影加深，偏移 7,9→9,12，炮塔/车体区分明显。
- **路面净空（#A11 修订）**：模板物品避路豁免取消（原 #77「建筑优先于路」），压路时沿法线最小推出，推不出才删；ground tier 豁免。strip 密度补偿钳制时亦避路。实测侵入 29→3~4 处（0.1~2.4% 边角轻擦）。
- **附带修复**：`test-map.js` 河流锚点越界豁免（预存 bug，段坐标才是实际几何）；`test-nodegen-calibration.js` 基线两次重标定（避路致通道变宽，符合预期）。
- `npm run check` EXIT=0；`npm test` 43/43 全绿。

### §4.52 C 档反馈第二批（2026-10-05）：暗色勾线 + 路网水系 strip 一体化
- **暗色勾线**：`tank_battledraw.js` 车体/炮塔/炮塔基座环/转向极限虚线圈的亮色描边（`t.color`/`shade(t.color)`）全换为暗色 `'rgba(15,15,18,0.60)'`；删除车体前装甲斜边与炮塔前颊的加粗亮边（方向由车体箭头+炮管表达已足够）。队伍识别只走血条/小地图。
- **G1 切线连续（后被一体化取代）**：`buildFromPoints` 新增第 5 参数 `tan1`——首个控制点沿 tan1 方向放置，使样条在 p1 处切线与给定一致；`generateStrip` 逐片传递 `exitTan→entryTan`。实测相邻片出口切线夹角最大 25.7°（≤45° 通过）。后因路网改 strip 一体生成，此链式机制退役（保留 `tan1` 参数供单节点调用）。
- **公路 strip 一体化**：`generateStrip` 增加规划 pass（每片 tpl/scale/cw/x0/seed 预算，`totalW` 累加）；`stripRng` 一次调 `placeRoadNetwork`（虚拟模板 `{w:totalW,h:stripH}`，`{requireWETrunk:true, trunkAmp:0.03}`）；每片按 x 区间裁路网转片内帧，经 `roadOpts.externalRoads/Junctions/RoadW` 传入 `generateNode`（片内跳过自生成，仅避让；路面由 strip 统一追加）。`generateNode` 回传 `weTrunk` 字段保留（单节点模式仍用）。宽幅模板下拓扑曲线振幅致段出界被裁——后处理补缝：在无路面接缝处按最近 road y 补水平直段。`test-strip.js` 6b/6c 改写为一体化断言（接缝两侧有路面、路网横跨 ≥80% 条带宽、河流横贯）。
- **河流水系 strip 一体化 + 提频**：新增 `placeStripRivers(rng,totalW,stripH)`——每条 strip 必生成 1–2 条横向蜿蜒河流（正弦 meander，段重叠 30% 保连通），贯穿整条 strip（旧 `edgeRiver` 模板标签在 strip 模式下跳过，避免重复+接缝断开）。路河交叉处切出缺口放 `bridge`（缺口宽=路宽+40，桥不压河——游戏内 river 的 passability=0.4 会把桥上坦克推出）。建筑避让（#A11）扩展至河流（`avoidCovers = 道路+河流`）。接缝净空豁免 `bridge`（基础设施）。
- **连通性口径对齐**：`nodeLayoutMetrics` 的 `isBlocked` 旧实现把一切非 ground 当墙；对齐 `tank_cover.js` 游戏口径（阻挡 = `passability===0` 或 `shellBlock`）——river/water 的 0.4 是减速通行（AGENTS.md §4），不阻断。`test-nodegen-calibration.js` 第三次重标定（urban_block d=0.7 连通性 0.875→1.000）。
- 细则归口 `docs/specs/map.md` §14（C 档 strip）。`npm run check` EXIT=0；`npm test` 43/43 全绿。改动未 commit/push（等 qi 回电脑审查）。
- **后续修补（同日）**：河流河段改短段曲线铺设（~120px 步长带角度，替代 800px 砖块段）；村庄/林地/沿路建筑/路口沙包避让列表统一为 `avoidCovers`（道路+河流），修复建筑/岩石压河；路河交叉改"河段被桥替换"（不再切分长段）；strip 路网出界路段严格过滤（整段须在界内，`segInBounds` 只查中心）；沿最长横干每 ~1200px 加短岔路（24 条，`strip-branch`），丰富路网细节。
- **三河形（同日）**：`placeStripRivers` 按种三选一——H2 双横贯（反相蜿蜒）、H1T（横贯干流+支流汇入/湖）、V 纵贯（1~2 条）。湖改凸包 blob（仿 centralPond），支流止于湖边、末端收分（1.0→0.55）汇入干流；P-20 per-node 矩形水体在 strip 模式禁用。
- **热点驱动管线（同日，用户四步架构）**：
  1. 热点：每 ~4000px 一个敌方生成热点（`hotspots`，玩法先行）；
  2. 中心线：路网拓扑 + 三河形水系；无交叉的热点修次要路（T 形接主干道，`hs-secondary`，夹角≥45°），保证每热点都是路网节点；
  3. 范围：道路/河流/湖泊带宽度（既有）；
  4. 范围外生成：模板项对河流严格跳过（零容忍），对道路保留推挤（保建筑数）；林地簇 itemBoxes 用旋转包络；最终后处理删除一切压水实体——四 seed 实测压河 0。
- **桥梁机制（同日）**：桥必须垂直于河流中心线（`bridgeDir = riverDir + 90°`，`riverDir` 取 ±200px 河段局部平均方向，避免单段抖动）；两侧公路加过渡段平滑连接（夹角>15°时）；桥是路（`tier:'bridge'`，`destructible:2`，hp=2）；河-路（桥）夹角<45°时留涵洞（河段跳过，路不断）；**只有射击桥梁侧面（长边，炮弹方向与桥长轴夹角≥45°）时才被击中**，沿长轴射击穿过不拦截（`tank_fire.js`）。
- **路河分离（同日）**：H2/H1T 横向河选 Y 时避开路密集带（`roadYDensity` 直方图 + `pickClearY`）；平行重叠（<30°且近距）>30% 则重选 Y（最多3次，`parallelOverlapRatio`），避免平行重叠。
- **次要路不过河（同日）**：`hs-secondary` / `strip-branch` 在河流生成后删除穿越河段者（主干道可经桥跨河，次要路绕行）。
- **删除湖泊（同日）**：不再生成湖元素——H1T 湖（`hasLake=false`）、模板水潭（`centralPond` strip 模式跳过）、村庄水塘（`village-pond` 禁用）。四 seed 实测 water=0。
- **平行主干道去重（同日）**：两主干道平行（<15°）、X 重叠、Y<100px 时只保留较长一条，避免路口-端点间 2 条公路冗余（如 seed 100 的 t0/h2）。
