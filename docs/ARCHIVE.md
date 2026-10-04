# Rogue Tank — 历史归档索引（ARCHIVE INDEX）

> 本文件是已完成条目的**顶层只读索引表**。
> 为防止单体文档过大引发上下文死循环，归档正文已按月分卷存放在 docs/archive/ 目录下。
>
> 规则：
> 1. 新完成条目在当月分卷（如 docs/archive/YYYY-MM.md）底部追加原文。
> 2. 本文件仅更新下方表格索引与分卷链接，保持主文档始终极简轻量。

## 分卷列表 (Archive Volumes)

- 📘 [2026年08月历史归档 (docs/archive/2026-08.md)](archive/2026-08.md)
- 📘 [2026年09月历史归档 (docs/archive/2026-09.md)](archive/2026-09.md)
- 📘 [2026年10月历史归档 (docs/archive/2026-10.md)](archive/2026-10.md)

---

## 归档总索引

| 归档日期 | 来源文档 | 条目 | 完结状态 |
|---|---|---|---|
| 2026-08-08 | `PLAN.md` | 全文（特性 1~5 规划 + 第 0/6/7/8/9 节 + 第 10 节 地图元素 A1~A3） | 已全部实现（见 DEVELOPMENT §3、§2.7、§5.5） |
| 2026-08-08 | `ISSUES.md` | #1~#8（含修复记录）+ 附：本轮新增特性 | #1~#8 已解决并验证；附注内容已并入 DEVELOPMENT §3 |
| 2026-08-10 | `ISSUES.md` | #9. tank_mvp.html 首次加载玩家坦克未从 tanks/ 目录正确应用 | 已修复并验证（玩家默认加载适配 tanks/ 优先存在的配置） |
| 2026-08-10 | `ISSUES.md` | #12. 坦克交叉碰撞"鬼畜"抖动（MTV 轴歧义 + 幽灵穿模 + 速度模型破坏） | 已重写碰撞解析并验证（结论见 DEVELOPMENT §3「坦克间碰撞」） |
| 2026-08-11 | `PLAN.md` | P-04 工具链与性能批次（JSDoc/tsc/pre-commit/Skill/性能三件套） | 已全部完成并验证（结论见 DEVELOPMENT §4.7.4 / §4.5.6 等） |
| 2026-08-11 | `PLAN.md` | P-01 命中部位由鼠标径向意图决定（打炮塔 / 打车体） | 已全部完成并验证（结论见 DEVELOPMENT §3.6 / §2.5；`partProbe=12` 手感标定完成） |
| 2026-08-11 | `PLAN.md` | P-02（第 7 条 battledraw 绘制层下沉，P-02 完结） | 已完成并验证（结论见 DEVELOPMENT §3.6；顺带修复 `tank_fx.js` 飞头坐标 `p[0]` 取 `undefined` 的潜伏 bug） |
| 2026-08-12 | `ISSUES.md` | #16. 设计器渲染函数引用未声明的 `ay`，炮塔模式/载入坦克时 ReferenceError | 已修复并验证（结论见 DEVELOPMENT §3「双座圈圆心与炮管前缘交点绑定」） |
| 2026-08-13 | `PLAN.md` | 重构批次：代码去重 1.1~1.7 + 校验强化 2.1~2.3 + 性能优化 3.1~3.3 + 文档纠偏 4.1 | 全部完成并验证（结论见 DEVELOPMENT §3.6） |
| 2026-08-13 | 交互/重构 | 重坦/中坦不同车体高度与半高掩体交互关系简化方案 | 简化为 3 规则确定性模型，全部测试与 HTML 校验通过 |
| 2026-08-13 | `PLAN.md` | P-02（子条目 1~6）模块化重构批次 | 已完成并验证（结论见 DEVELOPMENT §3.6；第 7 条 battledraw 可选延后） |
| 2026-08-13 | `PLAN.md` | P-03 坦克数据拆分 tanks/ 一型一文件 | 已全部完成并验证（结论见 DEVELOPMENT §3.6；`split-tank-list.js` 保留作维护工具） |
| 2026-08-13 | `PLAN.md` | P-05a. L形等凹多边形掩体 SAT/OBB 物理碰撞口袋卡住问题 | 已解决，支持 compound convex 碰撞并补充回归测试，并修正了坦克在口袋视觉空闲区的假碰撞（结论见 DEVELOPMENT §2.7） |
| 2026-08-13 | `PLAN.md` | P-05 节点地图元素生成器（模板库 + 难度加权随机选） | 已全部完成并验证（支持种子 RNG 与加权选取、参数化变体；结论见 DEVELOPMENT §2.1 / §3.6） |
| 2026-08-13 | `DEVELOPMENT.md` | 历史整理：§1/§2.4 旧决策推翻纠偏、§2.8 排除机制整节、§3 修复历史与过时注记（#12/#14/#15/#16/#17 等）、§4.7 v0.2~v0.7 版本进度（含 v0.4 甲弹对抗核实） | 已归档（当前结论保留于 DEVELOPMENT §1/§2/§3/§4/§6） |
| 2026-08-14 | `ISSUES.md` | #21. git status 误报大量未修改文件（index stat 记录 LF 大小、工作区为 CRLF） | 已修复并验证（结论见 DEVELOPMENT §3.6「git index stat 重新归一化」） |
| 2026-08-14 | `ISSUES.md` | #18. 坦克紧贴时炮口伸入对方车体，正面贴脸射击命中后部模块（弹药架）＋车体视觉重叠 | 已修复并验证（结论见 DEVELOPMENT §3.6「#18/#19/#20 修复」） |
| 2026-08-14 | `ISSUES.md` | #19. 设计器接缝边（前/后板）无法点击插入顶点（恒追加且不同步 halfFaces），装甲面板顺序非「前→后」 | 已修复并验证（结论见 DEVELOPMENT §3.6「#18/#19/#20 修复」） |
| 2026-08-14 | `ISSUES.md` | #20. 弹药架殉爆特效范围过大（火球最大 r 161px / 冲击波环 140px，远超坦克尺寸） | 已修复并验证（结论见 DEVELOPMENT §3.6「#18/#19/#20 修复」） |
| 2026-08-15 | `PLAN.md` | P-06 M0 贴图资产层 + 地图元素贴图 | 已实现并验证（结论见 DEVELOPMENT §2.10 / §3.6） |
| 2026-08-15 | `PLAN.md` | P-07 M1 声音占位系统 | 已实现并验证（结论见 DEVELOPMENT §2.11 / §3.6） |
| 2026-08-19 | `ISSUES.md` | #24. 地图尺寸过小，不满足 1:9 视口比例要求 | 已修复并验证（视口驱动 nodeScale，结论见 DEVELOPMENT §2.12） |
| 2026-08-19 | `ISSUES.md` | #27~#39. 测试基础设施缺失 requires/shim 修复 | 已解决（21/24 脚本修复缺失 require/global shim，QA 合规率 24/24） |
| 2026-08-19 | `ISSUES.md` | #25. 地图元素密度与模板丰富度不足 | 已修复并验证（模板 5→7、items 12~25、剔除随难度递减，结论见 DEVELOPMENT §2.12） |
| 2026-08-19 | `ISSUES.md` | #26. `npm run check` 的 typecheck 阶段失败（188 个 TS2339） | 已修复并验证（JSDoc `{object}`→`{any}` + globals.d.ts 补声明，`npm run typecheck` 0 错误） |
| 2026-08-19 | `ISSUES.md` | #22. Formal Run 中测试靶车 dummy 混入且无限复活 | 已修复并验证（detach/restore helper，结论见 DEVELOPMENT §3.15） |
| 2026-08-19 | `ISSUES.md` | #23. 敌方 AI 在战斗中只开一次炮 | 已修复并验证（entities 循环补 reloadT 递减，结论见 DEVELOPMENT §3.15） |
| 2026-08-19 | `PLAN.md` | P-21 音效与 Web Audio 真实音效库升级 | 已完成并验证（音效库扩展 Panning/距离衰减，结论见 DEVELOPMENT §2.11） |
| 2026-08-19 | `PLAN.md` | P-27 坦克纹理化接线 | 已完成并验证（全链路接线，结论见 DEVELOPMENT §3.16 / §6 条目 11） |
| 2026-08-19 | `PLAN.md` | P-16 弹种与击穿机制扩充：HEAT/HE | 已完成并验证（HEAT：1.4×穿深/0.8×速/1.2×散布，确定性不跳弹；HE：splashRadius 90 + 残余爆轰，确定性不跳弹，结论见 DEVELOPMENT §2.6 / §3.19） |
| 2026-08-19 | `PLAN.md` | P-15 MVP 架构重构（三入口拆分 + HUD 极简 + 伤害飘字 + 状态/开发者面板） | 已完成并验证（结论见 DEVELOPMENT §2.15 / §3.17 / §6 条目 15） |
| 2026-08-20 | `PLAN.md` | P-17 战术卡牌能力与主动装备拓展（战术炮击/护盾/超装填/无人机） | 已完成并验证（mvp 接入 G/H/V 按键、护盾吸收插入 resolveHit、延迟 AOE 炮击、无人机部署+视口外指示；结论见 DEVELOPMENT.md §3.22 / §6 条目 17） |
| 2026-08-20 | `ISSUES.md` | #62. test-map legacy 模式节点 3/4 掩体越界 | 已修复并验证（P-20 水体/桥梁双重缩放 + 尺寸失控，结论见 DEVELOPMENT §2.12 / §6 条目 20） |
| 2026-08-20 | `ISSUES.md` | #61. bake-assets.js: missing 'playwright' module | 已修复并验证（可选依赖 tryRequire 降级，结论见 DEVELOPMENT §3.20） |
| 2026-08-22 | `ISSUES.md` | #44 test-flow.js: only 0 edge-case patterns found | 已解决并验证（增加 payload 边缘、转移矩阵拦截、watcher 异常与重复注销隔离、复活与重置状态集成测试，4 种 QA 模式） |
| 2026-08-22 | `ISSUES.md` | #61~#74 模块化代码审查质量与物理缺陷问题 | 已全部修复并验证（结论见 DEVELOPMENT §3.24） |
| 2026-08-22 | `ISSUES.md` | #49 test-modifiers.js 缺乏边缘用例模式警告 | 已修复并增加健壮性边缘测试用例，QA 校验通过 |
| 2026-08-22 | `ISSUES.md` | #60 audit-content.js: 无警告但分布异常 | 已核实分布正常（common 47.8% / rare 31.3% / epic 15.7% / legendary 5.2%，5 个 Boss 3 阶段），`--strict` 全绿 0 警告，归档完结 |
| 2026-08-22 | `PLAN.md` | 2026-08-21 规划：局外流程闭环与存档/配置体系 (M10 扩展) | 已全部实现并验证（结论见 DEVELOPMENT §2.16 / §3.25 / §5.5 / §6 条目 22） |
| 2026-08-22 | `ISSUES.md` | #75 归档条目 #61~#74 的修复大部分缺失于工作区 | 已核实同步充分并归档（结论见 DEVELOPMENT §3.24；28 行原文见下） |
| 2026-08-23 | `PLAN.md` | P-28 战斗核心管线解耦：mvp⇄bench 双份收敛到 `js/tank_fire.js` | 已完成并验证（`js/tank_fire.js` ~376 行 / 24783 字节 + `scripts/test-fire.js` 9 项全绿 + 双页 811 deletions；结论见 DEVELOPMENT §3.26 / §6 条目 29，§6 条目 27 前置阻塞已解除） |
| 2026-08-23 | `PLAN.md` | P-30 文档分卷：ARCHIVE 按月拆卷 + DEVELOPMENT 拆 specs 五卷 | 已完成并验证（archive/2026-08.md 169KB 分卷 + ARCHIVE.md 9KB 索引 + DEVELOPMENT 5KB 核心流控 + specs 五卷；结论见 DEVELOPMENT §5 条目 31） |
| 2026-08-23 | `PLAN.md` | P-29 覆盖层 UI 纯逻辑下沉 | 已完成并验证（`js/tank_screens.js` 纯逻辑 viewModel + `tank_mvp.html` 薄包装，结论见 DEVELOPMENT §5 条目 30） |
| 2026-08-23 | `PLAN.md` | P-27 卡牌 × Loadout 衔接 | 已完成并验证（`drawCardChoices` 过滤未配弹种卡 + `computeAmmoConfig` 弹种强化生效，结论见 DEVELOPMENT §5 条目 27） |
| 2026-08-24 | `PLAN.md` | P-39 镜头滚轮缩放 | 已完成并验证（RULES.camera minZoom/maxZoom/zoomStep + setZoom 钳制 + zoom 指数阻尼 + zoom-to-cursor 滚轮缩放，见 DEVELOPMENT.md §2.1 / specs/map.md） |
| 2026-08-24 | `PLAN.md` | P-35 ESC 暂停/设置面板 + 终止游戏并结算 + 倒车转向倒置开关 | 已完成并验证（battle⇄pause 冻结战斗循环 + pause→settlement voluntaryEnd 终止入口 + invertReverseTurn 倒车转向倒置，见 DEVELOPMENT.md §2.1 / specs/map.md） |
| 2026-08-24 | `PLAN.md` | P-34 终局结算闭环（死亡耗尽/ESC 主动终止）+ 跨局难度升级 + 手动结算保存 | 已完成并验证（settleRun 双路终局 + extendRun 开放式链 + difficultyLevel 跨局叠加，见 DEVELOPMENT.md §2.1/§2.3 / specs/map.md） |
| 2026-08-24 | `PLAN.md` | P-37 Boss 节奏可配置（每 N 节点一个） | 已完成并验证（`RULES.nodeMap.bossInterval`=5 周期预标 + 清常规敌人，见 DEVELOPMENT.md §2.1 / specs/map.md） |
| 2026-08-24 | `PLAN.md` | P-41 局内商店（当前得分消费 · run 内属性升级） | 已完成并验证（`RUN_SHOP_DEFS` 6 项 + 双账本 API，购买扣余额不动累计，见 DEVELOPMENT.md §2.1/§2.3） |
| 2026-08-24 | `ISSUES.md` | #79 完成 5 节点后无终局结算/商店/难度升级；无手动结算保存 | 已修复并验证（P-34/P-41 落地：终局闭环+难度升级+手动保存，见 DEVELOPMENT.md §2.1/§2.3） |
| 2026-08-24 | `ISSUES.md` | #80 缺少 ESC 暂停/设置面板；倒车转向未倒置且无开关 | 已修复并验证（P-35 pause 面板落地，本批核验确认，见 DEVELOPMENT.md §2.1） |
| 2026-08-24 | `ISSUES.md` | #82 Boss 仅在链尾节点生成，无“每 5 节点一个”节奏配置 | 已修复并验证（P-37 bossInterval=5 周期落地，见 DEVELOPMENT.md §2.1 / specs/map.md） |
| 2026-08-24 | `ISSUES.md` | #84 镜头大小固定，滚轮被改作弹药切换，无缩放 | 已修复并验证（P-39 滚轮缩放落地，本批核验确认，见 DEVELOPMENT.md §2.1 / specs/map.md） |
| 2026-08-24 | `ISSUES.md` | #76 难度未驱动敌方属性与 AI 状态机分化 | 已全面解决并验证（entityMults 十维属性分化 + aiTierProfiles 行为分层 + coverSeek 寻掩 + patrol wander，见 specs/combat.md §5） |
| 2026-08-24 | `PLAN.md` | P-40 地形类型抽象落地 | 已完成并验证（coverTiers 六属性 schema / water 弹越飞阻移动 / river segments 方案 A / mud·rock·ruined·intact 新 tier，见 specs/map.md §5.6） |
| 2026-08-24 | `ISSUES.md` | #85 水体 tier 文档/代码矛盾 | 已解决并验证（water shellBlock:false 弹越飞、保留移动阻断，随 P-40 落地，见 specs/map.md §5.6） |
| 2026-08-24 | `PLAN.md` | P-36 地面生物群落地貌 | 已完成并验证（RULES.biomes 四色调色板 + drawGround 确定性程序化地面层，见 specs/map.md §5.7） |
| 2026-08-24 | `ISSUES.md` | #77 掩体过大/密度低/全高过少 | 已解决并验证（coverWorldScale 收敛 + 密度×1.57 + 全高补齐与降级/剔除双保护，见 specs/map.md §5.7） |
| 2026-08-24 | `ISSUES.md` | #81 战斗地面单一平坦缺地貌 | 已解决并验证（biome 标签 + drawGround 主题化底色，见 specs/map.md §5.7） |
| 2026-08-24 | `PLAN.md` | P-38 敌方递增生成 + 击杀配额 | 已完成并验证（quota 配额制节点结算 + reinforcementTick 镜头外确定性补兵 + 增援立即警觉，见 specs/map.md §5.8；玩法线 PLAN 清零） |
| 2026-08-24 | `ISSUES.md` | #83 敌方一次性生成缺递增生成 | 已解决并验证（同 P-38 落地，见 specs/map.md §5.8） |
| 2026-08-24 | `PLAN.md` | P-51 Boss 数据驱动机制补全（weakspots / loot 卡牌掉落 / ai 行为脚本） | 已完成并验证（resolveHit 可选增益 opts + 阶段声明式行为三模式 hold/charge/skirmish + loot.cards 三选一奖励链，见 specs/boss.md §4 / specs/combat.md §2） |
| 2026-08-25 | `ISSUES.md` | #86~#101 玩法设计问题第二批（16 条，含原 #37b 重编号并入本批的说明） | 已全部解决并验证（对比器真实单位/村庄分层生成/AI侧摆/视野系统v1/商店v2/Boss行为五风格/敌军参数新封顶/履带断不缴械/加法聚合/修理箱医疗包，见 DEVELOPMENT.md §2.5「玩法设计第二批修复与机制定型」） |
| 2026-08-26 | `ISSUES.md` | #A2. 姿态稳定无限购买致 spreadMult 负值（0.00→−0.15） | 已修复并验证（spread.multFloor=0.2/sigmaFloor + maxLevel 判定恢复 + 满级按钮禁用，见 specs/combat.md §2「散布下限防负值」） |
| 2026-08-26 | `ISSUES.md` | #A12. 节点间回血不满（选了 maxHp 升级后） | 已修复并验证（enterBattle 满血兜底 + refreshStats 收口处 maxHp 差量抬 hp/同步 spawn.hp，见 DEVELOPMENT.md §2.2） |
| 2026-08-26 | `ISSUES.md` | #A4. 履带断时按 4 键修理无效 | 已修复并验证（tryRepairKit/tryMedkit 删除 immobT 反向早退、拦截移交共享层 reason 提示，见 specs/combat.md §2） |
| 2026-08-26 | `ISSUES.md` | #A6. 伤害飘字溢出剩余血量 + 死亡后 DOT 继续跳字 + 缺颜色分类 | 已修复并验证（飘字 min(dmg,剩余HP)/DOT 存活检查与死亡清 dot/白·黄·红颜色语义+pen legacy 别名，见 specs/combat.md §6） |
| 2026-08-26 | `ISSUES.md` | #A7. 按住左键不能连射 | 已修复并验证（mouseFireHeld 标志 + battle 态逐帧 tryFire、reloadT/breech 射速门控，见 specs/combat.md §5.1） |
| 2026-08-26 | `ISSUES.md` | #A8. 半高掩体炮弹瞬移命中 | 已修复并验证（graduated 判决缓存 s.dec 后结算分支剩余距离门控、实体直接命中优先，见 specs/combat.md §5.1） |
| 2026-08-26 | `ISSUES.md` | #A13. ammo 卡 mode:'add' 语义错位（严重平衡炸弹） | 已修复并验证（add 改乘算后毫米追加、computeAmmoConfig 输出 fieldAdd 单独合成、软上限仅钳 HE 最终值，见 specs/cards.md §3） |
| 2026-08-26 | `ISSUES.md` | #A1. 局内商店姿态稳定/精密火控字段耦合 + 恒价 | 已修复并验证（独立 stat motionSpreadMul ×0.85 解耦运动散布、motionSigma 消费 `motionSpreadMul ?? spreadMult` 向后兼容，见 specs/combat.md §2 / DEVELOPMENT §2.1） |
| 2026-08-26 | `ISSUES.md` | #A3. 局内商店结构缺陷合集 | 已按用户裁定重构并验证（RUN_SHOP_DEFS 12 项四分组：新增穿深加工/火力增强/马力强化、防护六面改两打包商品、fast_reload 0.5s 下限与 engine_overdrive 150km/h 上限达限拒购、极速 km/h 口径、冷却钳底 15s、可重复购买 growth ≥1.5，见 DEVELOPMENT §2.1） |
| 2026-08-26 | `ISSUES.md` | #A15. 成员防护内衬两张卡完全未实现（已修复） | 已修复并验证（tank_physics.js 经 passiveValues 消费 spall_liner 乘入模块伤害，活浏览器实测 PEN 伤害均值降至无内衬 0.7981 倍，见 specs/combat.md §2） |
| 2026-08-26 | `ISSUES.md` | #A17. 批量 seed 回放出现高比例零开火节点 | 已修复并验证（生成期 LoS 走廊 + 运行期侧向绕行落地于 tank_cover.js/tank_nodegen.js/tank_ai.js；零开火节点 9/40→7/40，npm run check / npm test / test:browser 全绿；见 specs/map.md §7） |
| 2026-08-27 | `ISSUES.md` | #A16. 敌方/Boss 参数绑定审计结论 + 配套发现 | 已解决并验证（三处 spawn 直写改经 addModifier 注入 difficulty-cap；纯函数 difficultyCapMuls 收口换算；speedVsPlayer 收口 RULES；test-modifiers.js §21 断言等价；回放 hash 不变；见 DEVELOPMENT §2.1） |
| 2026-08-27 | `ISSUES.md` | #A14. "全线高爆战术"过强 / "超口径高爆弹"未生效死效果 | 已修复并验证（demo_all_he_doctrine 移除 reload×0.85、demo_overmatch_shell 转 AP 保留 passive overmatch 0.85；tank_physics.js passiveValues + resolveHit overmatch 口径碾压分支；test-cards.js #A14a/#A14b 断言，见 specs/cards.md §6） |
| 2026-08-28 | `ISSUES.md` | #A5. 自身模块受损/成员受伤无 UI 指示 | 已修复并验证（tank_mvp.html 顶部中央 #moduleStatus 状态条 + updateModuleStatus 读 debuffs/trackBroken，无受伤隐藏；check + test:browser 全绿，见 specs/combat.md §2） |
| 2026-08-28 | `ISSUES.md` | #A18. 回放基线批量 seed 扫描：大量节点超时 | 已修复并验证（根因=tank_sim.js 代理玩家不瞄准不开火致 0 开火假超时；补 turretDesired 指向+对准即开火，超时率 46.5%→15.5%，回放 hash→5d754f53；见 specs/combat.md §5.1） |
| 2026-09-06 | `PLAN.md` | P-46. 类别化敌军体系与生成机制优化 | 已完成并验证（结论见 DEVELOPMENT / specs） |
| 2026-09-06 | `PLAN.md` | P-48. 对比器单位标定与分组重构 | 已完成并验证（结论见 specs/editor.md） |
| 2026-09-06 | `PLAN.md` | P-49. 模块/成员概率分区系统与设计器耦合链 | 已完成并验证（结论见 specs/combat.md 与 specs/editor.md） |
| 2026-09-06 | 交互/修复 | #A19. HUD弹种清理与修理箱医疗包损伤门控 | 已完成并验证（精简 HUD 并彻底隔离修理箱医疗包损伤门控，见 specs/combat.md §2） |
| 2026-09-08 | 会话修复/商店/UI | 局内商店规则调优、修理箱/医疗包随时可用与回血、新局难度重置与炮塔漂移修复、Tab 面板与卡牌 UI 扩展、敌人等级与掩体渲染兜底 | 已实现并验证（见 archive/2026-09.md） |
| 2026-09-08 | `PLAN.md` / `ISSUES.md` | P-42 卡牌平衡调优、P-43/#A11 地图级路网与占位冲突重构、#78 不规则岩石与泥地地形层 | 已完成并验证（见 2026-09 分卷） |
| 2026-09-12 | `ISSUES.md` / rework | #A19 坦克碰撞回归修复（候选轴去重+浅穿透阈值）+ R-3 特种弹药与曲射（APFSDS 双模块/HEC 越障/2σ 散布）+ Edge 浏览器冒烟测试 | 已实现并验证（见 2026-09 分卷） |
| 2026-09-13 | `PLAN.md` | 阶段七：技能/主副武器卡牌体系闭环（params 覆写通道 + 进阶技能卡 + 副武器全类型运行时 + 主武器机制与卡牌） | 已实现并验证（见 DEVELOPMENT §4.11、specs/cards.md §8.3/8.4、archive/2026-09.md） |
| 2026-09-13 | `PLAN.md` | 阶段四 4a/4b/4c 卡牌三板块 + 阶段六 6.1/6.2/6.3 开局弹种/副炮塔 + 阶段五 5.4 键位重排与浏览器复跑 | 已实现并验证（见 DEVELOPMENT §4.9、specs/cards.md §8、archive/2026-09.md） |
| 2026-09-13 | `ISSUES.md` | #A11. 地形占位冲突：道路/水域任意叠加 + 道路不贯穿 | 已修复并验证（地图级路网专轮：先路后物 + OBB 避让全高优先 + 村落单一路网 + 水潭回退/出生走廊保护 + 度量口径修正；7 模板×5 难度校准重锚、连通性全线 1.000、回放 hash→`d60b9022`，check/test/browser 三链全绿；见 specs/map.md §6） |
| 2026-09-13 | `ISSUES.md` | #A20. HUD 静态按钮内联 onclick 引用 IIFE 内函数 → 点击必然 ReferenceError | 已修复并验证（8 按钮改 addEventListener 绑定；test-browser-run.cjs 17 项全 PASS + 本轮回归复验，见 DEVELOPMENT §4.6） |
| 2026-09-13 | `ISSUES.md` | #B1~#B5 + #78（结算/缓冲/商店/速度封顶+聚簇/面板/设计器多边形） | 已全部修复并验证（npm check/test/browser 全绿；test-panels 难度封顶断言通过；tank_map 聚簇接入；designers verts UI 完整） |
| 2026-09-13 | 会话方案 | 操作/设置/面板解耦（mvp⇄测试台同源键位 tank_bindings.js + 测试台专用面板 #benchPanel + 切弹语义对齐 Q/E/点选） | 已实现并验证（check/test 全绿含新增 test-bindings；browser 三链待 Edge 环境回归，test-browser-r3 已同步新语义；见 DEVELOPMENT §4.10） |
| 2026-09-14 | `PLAN.md` | 副武器手动开火与真曲射弹道物理（抛物线高度/跳过沿途碰撞/落点AOE/地面阴影）+ 直射火箭巢与线导/锁定反坦克导弹 | 已实现并验证（见 DEVELOPMENT §4.3、archive/2026-09.md） |
| 2026-09-14 | `PLAN.md` | 阶段五 5.1 旧 15 键弹种链（含 legacy HEC）、阶段六 6.1/6.3 旧开局弹种方案与解锁持久化 | 已按 2026-09-14 定案修订移除（HEC 弹种删除→14 键、开局弹种选配 UI 移除、弹种解锁不跨局；结论见 DEVELOPMENT.md §4.13 / specs/map.md §10/11 / specs/combat.md §3/5 / specs/cards.md §8.3/9） |
| 2026-09-14 | 七项用户定案 | HEC 移除 / 局内商店回归（基础参数+硬上限+装甲合一）/ 受击即警觉（任意来源+Boss 破 hold）/ 地图重做（曲线路+预烘焙+重叠消解）/ 水域溺毙+AI 避水 / 装备优先抽卡 / 开局弹种 UI 移除+新局归零 | 已全部实现并验证（check/test 40 脚本+browser 三链全绿，含新断言与校准重锚；结论见 DEVELOPMENT.md §4.13） |
| 2026-09-15 | `PLAN.md` | 副武器弹种机制绑定（迫击炮固定 HESH；线导/锁定导弹与火箭伤害跟随玩家 HEAT 升级链，无升级回退 HE） | 已实现并验证（见 DEVELOPMENT §4.3、archive/2026-09.md） |
| 2026-09-15 | `ISSUES.md` | #A26. 弹种升级链语义错误：链结构/分支替换与跳级 / #A27. he-vt 原地静止不飞 | 已修复并验证（三链线性化 + 禁跳+HE 先增后替 + drawCardChoices 前驱放行 + stepShells 飞行推进；check/test 全绿，回归见 2026-09 分卷） |
| 2026-09-15 | `PLAN.md` | 阶段九 主武器系统改版五项（曲射移除/烟幕删除+F 切换+导弹锁定/双管重做/炮塔前移/卡牌硬限）+ W6 速射机炮热量重做 | 已全部实现并验证（check/test 全绿；结论见 DEVELOPMENT.md §4.15，规范见 specs/combat·cards·map） |
| 2026-09-16 | `ISSUES.md` | #A21~#A25（F 切换/左键按激活槽位分发、副武器单槽不变量、升级卡资格过滤+install/upgrade+maxStacks 防线、面板四层分层+卡牌事务、独立左下角日志面板） | 已修复并验证（npm test + tsc + test:browser 三链全绿；结论见 DEVELOPMENT.md §4.16，规范见 specs/combat.md §4 / specs/cards.md §8.3·§9，原文见 archive/2026-09.md） |
| 2026-09-16 | `PLAN.md` | 阶段八 §8.1.1 副武器 rare 升级卡数值复核 + §8.1.2 玩家侧副炮塔挂载 UI（第二炮塔绘制 + HUD 指示） | 已实现并验证（升级卡增益带收敛 1.33/1.52/1.39/1.50，新增 test-weapon-upgrade-balance；副炮塔 secondaryTurretPose/drawSecondaryTurret，见 DEVELOPMENT.md §4.16） |
| 2026-09-16 | `ISSUES.md` | #A28 主动技能 upgrade 卡在玩家持有基础能力之前即可被抽到（`requiresAbility` 语义已实现但内容侧零落地） | 已修复并验证（5 张升级卡标注 requiresAbility≡自身 key + `validateCardEffect` 白名单校验 + 11 张基础卡零声明防死锁 + 保底不复活不合格卡 + 修复 content_designer 保存丢 `params`/`requiresAbility`；test-cards/validate-content/test-qa/test-card-effects/`node --check` 五链全绿；见 DEVELOPMENT.md §4.17 / specs/cards.md §8.4·§8.5·§9，原文见 archive/2026-09.md） |
| 2026-09-16 | 用户反馈（会话） | #B6 坦克炮塔随节点推进逐渐前移（Boss scale 原地污染 tankListData 共享 spec 指数雪球 + W3「节点推进炮塔前移」有意特性） | 已修复并验证（pivot/anchors 改拷贝、Boss 缩放整体替换、W3 特性整体删除含 RULES.progress/两函数/mvp 调用点/test-rework-w3.js；新增 test-boss §16 #B6 回归；check/test/browser 三链全绿；见 DEVELOPMENT.md §4.18 / specs/map.md §10.1，原文见 archive/2026-09.md） |
| 2026-09-16 | 用户反馈（会话） | #B7 道路被其他物体截断 / 尽头是圆弧形 / 交叉口太多且看起来叠加（逐段跳段 + 端点内缩+round 端帽 + ±0.42 端点漂移与 ±0.18 控制点造成 35° 浅角互穿） | 已修复并验证（路网重做为「正交双干道」：取消跳段、端点落边界+lineCap butt、拓扑 1 横+0~1 纵且取消斜向支线；断口 240→0px、交叉 2~4→≤1、夹角 35°→68.8°、全模板连通性 1.000；新增 test-nodegen §16 #B7 四护栏 + 校准重锚；见 DEVELOPMENT.md §4.18 / specs/map.md §10/§10.1，原文见 archive/2026-09.md） |
| 2026-09-16 | 用户反馈（会话） | #B8 副武器安装卡无法替换已装副武器（升级卡接续语义） / #B9 布雷器地雷不生效 / #B10 技能获取无 HUD 提示 / #B11 部署掩体不可见 | 已修复并验证（替换语义：apply 非同型覆盖+同型幂等+资格层放行+drawCardChoices 随之放开，升级卡随类型接续、cardEffects 条目保留；部署物运行时接 mvp：updateDeployables+mineExplode AOE+三类绘制+clearDeployables 生命周期+mine/cover duration 落地；技能提示：ABILITY_KEY_HINT 补全 7 键+pickCard 按钮脉冲高亮；check/test（#B8 段 17 断言）/tsc/browser 三链（67 PASS）全绿；见 DEVELOPMENT.md §4.19，原文见 archive/2026-09.md） |
| 2026-09-17 | `PLAN.md` | 文档整理：阶段一~九已完成条目压缩为归档指针（R-1/R-2/R-3、阶段四/六/七、阶段五 §5.4、阶段八 §8.1.1/8.1.2、阶段九 §9.2）；§5.1~§5.3 弹种升级链/数值总表/平衡回归**内容移交** `specs/combat.md` §3.1~§3.3 | 已归档（原文见 archive/2026-09.md 末节；PLAN.md 仅存待办：难度联动、开发者面板方案、2026-09-17 反馈批次） |
| 2026-09-17 | `ISSUES.md` | 文档整理：清理历史核验噪音；2026-09-17 用户反馈五条核实为 **#C1~#C5** 写入（路口圆斑 / 射速下限 1s / 弹种卡顺序 / 技能副武器操作链 / 两页 UI 统一） | 新条目见 `docs/ISSUES.md`（待处理；#C2 口径已裁定仅参数层） |
| 2026-09-17 | `ISSUES.md` | #C1 路口圆斑（r 收敛 roadW×0.5）/ #C2 射速下限 1s（timed 通道豁免）/ #C3 弹种升级卡保底 / #C4 技能副武器操作链五子项（获取提示 + 掩体炮塔锚定 + 按技能独立冷却 + 副武器 HUD 图标 + F=直接击发副武器）/ #C6 灭火器死前置修复+自动触发 | 已全部修复并验证（#C5 暂缓仍在 ISSUES；check/test/browser 三链全绿；见 DEVELOPMENT.md §4.20 / specs/combat.md §4 / specs/cards.md §3·§9 / specs/map.md §10.2，原文见 archive/2026-09.md） |
| 2026-09-19 | `ISSUES.md` | #D1 graduated 拦截者对齐（日志谎报「半高掩体」+ 截停点脱离掩体）/ #D2 视野卡 commander_sight 死效果接线 + 视野圈可视化 / #D3 传奇卡「交替装填系统」重定义（换管≈0 + 装填×0.9）/ #D4 火箭发射器同帧齐射改连续逐发 burst + 视觉更新 / #D5 弹种升级保底改概率触发（RULES.cards 0.4）降速 | 已全部修复并验证（#C5 仍在 ISSUES；check/test/browser 三链全绿；见 DEVELOPMENT.md §4.21 / specs/combat.md §4·§5.1 / specs/cards.md §8.3·§9，原文见 archive/2026-09.md） |
| 2026-09-19 | `ISSUES.md` #C5 + `PLAN.md` §3 | 开发者面板改进 + mvp⇄bench 两页统一（devPanel 四 Tab 分页 + 卡牌选择器重构：11 组分组/搜索/持有 ×N/−1 单卡回滚/清除全部/`/` 聚焦；480px；bench G/V 语义统一为炮击/超装填、Q/E 方向提示修正、Tab preventDefault、陈旧文案清理；bench 作弊项对齐进 mvp 开关 Tab；HUD 渲染级合并移入 PLAN §2 非阻塞遗留） | 已完成并验证（check/test/browser 三链全绿；见 DEVELOPMENT.md §4.22 / specs/editor.md §7，原文见 archive/2026-09.md） |
| 2026-09-20 | `DEVELOPMENT.md` §3.1 长期债务「#A9 半高掩体」 | #A9 半高掩体子系统整体移除（#E3：`RULES.coverTiers.half` 定义删除 + `heights.cover.half` 删除 + getExposure 越掩插值删除 + stepShells `grad`/`s.dec` 拦截链删除 + ruined 归入全高 + stump/rubble 停止挡弹 + 静态掩体 fixture 与全部 half 断言改写） | 已完成并验证（check-html+tsc / npm test / test:browser 三链全绿；见 DEVELOPMENT.md §4.23 / specs/map.md §12 / specs/combat.md §5.1·§8，原文见 archive/2026-09.md） |
| 2026-09-20 | 用户反馈（会话） | #F1 测试台开发者面板未应用新面板（devPanel 抽离共享模块 `js/tank_devpanel.js`，mvp/bench 两页同源）/ #F2 双联火炮发射 2 次后无法发射 + 单击观感歧义（空格齐射**仅两管都就绪才发射**，否则不发 + COVER 提示）/ #F3 火箭、导弹等副武器在测试台无法发射（F 键接线 + 逐帧驱动 + spawnMine/deployables 注入）/ #F4 mvp 双管 HUD 装填弧从不绘制（分支提前到 `reloadT` 门控之前） | 已修复（node --check 0 失败 / npm test EXIT=0 含 test-fire (5a) 齐射门控断言；`npm run test:browser` 本会话沙箱不可跑，需正常环境补跑；见 DEVELOPMENT.md §4.24 / specs/combat.md §8.5 / specs/editor.md §7，原文见 archive/2026-09.md） |
| 2026-09-20 | 用户反馈（会话） | #F5 布雷器「按下 F 无限召唤地雷 + 没有伤害」（雷场预约无上限 → 同一时刻仅 1 个待生成雷场；地雷触发半径 30/25px 过小 → 单发/雷场 45px、spawnMine 默认 40px） | 已修复（node --check 0 失败 / npm test EXIT=0 含 test-fire 9f 装填门控 + test-rework-r2 触发半径断言；`npm run test:browser` 本会话沙箱不可跑，需正常环境补跑；见 DEVELOPMENT.md §4.25 / specs/combat.md §8.1，原文见 archive/2026-09.md） |
| 2026-09-20 | 用户反馈（会话） | #F6 雷场/掩体「新的生成、旧的失效」（雷场生成前 `pendingMineFields` 被提前移除 + 掩体超限淘汰最早） | 已修复（雷场生成前超限拒绝保留旧雷；`deploy_cover`/bench 掩体按钮部署前超限拒绝保留旧掩体；node --check 0 失败 / npm test EXIT=0 含 test-abilities #F6；`npm run test:browser` 本会话沙箱不可跑，需正常环境补跑；见 DEVELOPMENT.md §4.26 / specs/combat.md §8.1，原文见 archive/2026-09.md） |
| 2026-09-21 | 用户反馈（会话，8 项 + 设计征询 1 项） | #G1 Boss 激光炮塔转速太快（蓄能期逐帧叠加同源 modifier → mult 加法聚合钳到 0 冻结、射击期又全速甩头）/ #G2 部分 Boss 没有召唤敌人（空 summons 静默跳过 → `defaultPool` 兜底 + 5 个 Boss JSON 补 3 波）/ #G3 开发者面板「−1」按钮无效（逐帧 innerHTML 重建销毁按钮 + modifier-only 卡不入清单 → 签名节流 + 事件委托 + `_cardApplyLog` 按序日志 + 独立脏标记）/ #G4 更复杂路网 + 更多建筑（新增 G 网格街区 / I 双干贯穿、删除浅角 F 拓扑、支道改直线、新增可破坏楼房 tier `building` + 建筑混合与密度提升）/ #G5 电磁轨道炮加强（reloadMult 1.8 / damageMult 1.8 + 贯穿机制 + 装填环漏乘 reloadMult 修复）/ #G6 新增主武器「弹夹炮」`clip`（0.7s 弹夹内固定 / ×3.0 弹夹间 / 每扩容 +0.8× / 初始 4 发；同轮 `statOverrides` 支持 `"+N"`）/ #G7 技能常驻显示按键与名称（`#skillSlot1~3` + `ABILITY_LABELS` + 提示表补全）/ #G8 玩家 UI 面板重设计（flex 三区 HUD + 档位/速度条/公路加成，新增 `tankCurrentKmh`）/ #G9 武备与技能扩展建议清单 + 实装 APS 主动防御系统 | 已完成并验证 9/9（三链全绿：`npm run check` EXIT=0 / `npm test` EXIT=0 / `npm run test:browser` 四链 ALL PASS EXIT=0；见 DEVELOPMENT.md §4.28 / specs/combat.md §9 / specs/map.md §13 / specs/boss.md §7 / specs/cards.md §8.3，原文见 archive/2026-09.md） |
| 2026-09-21 | 用户反馈（会话） | #H1 视野等距：横屏下横向接近敌人可见距离更长（1.5× ≈ 宽高比）——有效可见距离 = min(视野圆, 屏幕)，横屏横向半幅 960 ≫ 纵向 540 使屏幕在纵轴先收口（810px vs 视野边界 1215px） | 已修复（`tank_camera.visionRadiusForViewport` 视口窄轴收口：R=min(nominal, 窄轴容量/(1+bias))，1080p 下 R 900→600、前向可见距离恒 810px 各方向等距、纵向体验零变化；超宽屏/竖屏同上限、zoom 联动等距、4K 基准绑定；三链全绿含 test-camera #H1 轴向等距断言；见 DEVELOPMENT.md §4.29 / specs/combat.md §10，原文见 archive/2026-09.md） |
| 2026-09-21 | 用户反馈（会话，3 项） | #H2 视野等距改口径：纵向视野拉长而非削弱横向（镜头自动拉远 `visionFitZoom` 1080p≈0.667，名义视野 900 全方向生效——纵向前向 810→1215px；缩放模型改「用户基准×适配值」，minZoom 0.8→0.45；#H1 收口降级为等距安全网）/ #H3 超装填删除 V 专属键（bindings/mvp/bench 三层删除，激活唯一化为技能池 skillHotkey→DISPATCH）/ #H4 Boss 激光炮塔固定角速度直驱（0.55rad/s + bossLaserHoldTurret 抑制 AI 转炮）+ 全高掩体（building/full/intact/rock/ruined）阻挡光束伤害 | 已完成并验证 3/3（三链全绿：`npm run check` EXIT=0 / `npm test` EXIT=0 / `npm run test:browser` 四链 ALL PASS EXIT=0；见 DEVELOPMENT.md §4.30 / specs/combat.md §11，原文见 archive/2026-09.md） |
| 2026-09-21 | 用户反馈（会话） | #H5 敌方可见距离不得写死像素（#H1/#H2 的固定 900px 圆受缩放影响，迫使玩家始终最高倍率游玩失去细节）——可见半径重定义为屏幕相对（`R = screenRadiusRatio × 窄半幅/zoom × (1+加成)`，R×zoom 恒定，敌人在屏幕上的出现位置与缩放无关）；移除 visionFitZoom/基准×适配模型与进节点强制缩放；minZoom 回 0.8；缩放回归 P-39 纯视觉偏好（默认 zoom=1 全细节） | 已修复（`visionRadiusForViewport` 重写 + RULES.vision.screenRadiusRatio；窄轴容量/(1+bias) 保留为极扁视口护栏；三链全绿含 test-camera #H5 段 R×zoom 恒定断言；见 DEVELOPMENT.md §4.31 / specs/combat.md §11.1·§11.4，原文见 archive/2026-09.md） |
| 2026-09-21 | 用户反馈（会话，4 项） | #I1 Boss 激光期车体冻结（`bossLaserHoldMove` 连 driveTank 跳过）+ 炮塔转速 0.55→0.35rad/s（单周期转不满 π/2，走位窗口变宽）/ #I2 蓄能虚线与光束反映掩体阻挡（`_laserBeamBlockDist` 射线×OBB 入口距离 + `blockedDist` 事件 + 绘制层截断与阻挡标记；伤害改光束级截断）/ #I3 建筑密度提升（cluster 4~8、maxPerNode 28、Boss 战图 ×1.6；修复 `fits()` 对含道路的 outCovers 用 pad 34 判重叠导致沿路建筑恒被拒、密度参数空转；校准第三次重锚）/ #I4 Boss 随机走位（`RULES.ai.bossWander` + `_bossMoveOverride` 环绕玩家随机航点，炮塔照常锁定瞄准；crush/冲刺/激光期豁免） | 已完成并验证 4/4（三链全绿：`npm run check` EXIT=0 / `npm test` EXIT=0 / `npm run test:browser` 四链 ALL PASS EXIT=0；见 DEVELOPMENT.md §4.32 / specs/combat.md §12 / specs/map.md §13.4 / specs/boss.md §8，原文见 archive/2026-09.md） |
| 2026-09-23 | `DEVELOPMENT.md` | **文档整改（补归档）**：§0 文档体系索引与目录 / §1 项目新定型与核心方向 / §2 架构演进与演练模块 / §3 当前活跃项与下一步顺序 + §4.1~§4.20 全部批次结论（276 行）。原定于 2026-09-22 提交 `994bdfd` 随 §4.27~§4.33 同步删除，但漏走 AGENTS.md §2.2 第 3 步「原文归档」 | 已补归档（原文快照见 archive/2026-09.md；现行口径以 DEVELOPMENT.md 续编条目与 specs/ 五卷为准。同批整改：补 §4.21~§4.26 编号区间的缺号说明、清理 PLAN/ISSUES 已完成章节、修正 specs 数值与键位清单，见 DEVELOPMENT.md §4.34） |
| 2026-09-23 | `PLAN.md` | **生命周期清理**：§3~§9.1 共 8 个「✅ 已完成」反馈批次章节（#C1~#C6 / #D1~#D5 / #F1~#F7 / #G1~#G9 / #H1~#H5 / #I1~#I4 的完成情况记录） | 已归档并删除（PLAN.md 只保留未完成项：§1 待办总览 3 项 / §2 非阻塞遗留 / §3 横向卷轴设计研究；结论见 DEVELOPMENT.md §4.20~§4.33，原文见 archive/2026-09.md） |
| 2026-09-23 | `ISSUES.md` | **生命周期清理**：10 个「核验记录」章节（2026-09-17 ~ 2026-09-21，覆盖 #C5 / #E1~#E13 / #F1~#F6 / #G1~#G9 / #H1~#H5 / #I1~#I4 的 `file:line` 核实证据） | 已归档并删除（对应条目均已修复并三链验证；ISSUES.md 当前无存量待处理条目，原文见 archive/2026-09.md） |
| 2026-09-23 | `PLAN.md` §1/§4.2「A 档·清账」 | 死效果键 `recon` / `track_repair` 与 5 张对应卡（`support_recon` / `sniper_recon_mark` / `emergency_track` / `mobile_track_repair` / `support_track_repair`）接线或摘除 ＋ `RULES.nodeMap.road.junctionClearR` 死配置清理 | 已完成并归档：用户裁定**整体摘除**（两键从 `ABILITY_KEYS` / DISPATCH / `ABILITY_KEY_HINT` / `ABILITY_LABELS` 删除 + 5 卡文件删除，卡池 173→168）＋ 死配置删除；`check-html` EXIT=0 / `tsc --noEmit` EXIT=0 / `npm test` EXIT=0（`test:browser` 待正常环境补跑）；见 DEVELOPMENT.md §4.35 / specs/cards.md §3·§4·§8.5，原文见 archive/2026-09.md） |
| 2026-09-23 | `PLAN.md` §1/§4.2「B 档·推进轴玩法」 | 推进轴玩法四子项：① 防线式敌人生成（沿推进轴分桶 + 地形锚点抽取 + 难度调制的防线/人头数）／② 增援只补玩家前方未清空防线／③ 节点完成条件改「抵达右端出口 + 防线清空/配额」双条件／④ 视野卡/镜头外延做强 | 已完成并归档（①→DEVELOPMENT.md §4.37；②③→§4.38；④→§4.36。现行口径 `specs/map.md` §15「防线式推进体系」与 `specs/combat.md` §11.5；三链 `check-html`/`tsc`/`npm test` EXIT=0，`test:browser` 待正常环境补跑；原文见 archive/2026-09.md） |
| 2026-09-30 | 用户反馈（会话，4 项） | **#H 批次**：#H1 敌军数值随局外商店永久升级同步放大（玩家锚定：applyEnemyAppearanceAndStats 基准 + difficultyCapMuls 四键）／#H2 布雷器第二次起雷场全部静默丢弃（`mineFieldCount(5) > mineMax(3)` 与 `existing+n>cap` 判据矛盾；装填冷却未写入 `secondaryReloadT`）／#H3 技能 HUD 缺陷（artillery/shield 专属键与技能池槽双按钮；7 键 vs 3 槽 ⇒ 第 4 个技能为死技能；弹种槽角标与 Q/E 键位语义冲突）／#H4 `skillHotkey` 的 `fallbackList` 回落使隐藏数字键误触发 1 号槽技能 | 已修复并归档（用户裁定 #H3 采用「循环复用，按玩家选择顶替槽位技能」）。敌军改锚定固定基准 `RULES.enemyAnchorBase`（`playerAnchorStats` 退役）；雷场按可用余量裁剪 + 补装填门控（`mineFieldCount` 5→3）；技能槽改为玩家指派 `player.skillSlots` + 顶替面板（无 fallback）。三链全绿：`npm run check` EXIT=0 / `npm test` EXIT=0（`test-modifiers` #H1 段 6 项）/ `npm run test:browser` 四链 ALL PASS EXIT=0（97 PASS / 0 FAIL，r4 新增 E 段 10 项）；见 DEVELOPMENT.md §4.40 / specs/combat.md §13.1~§13.3，原文见 archive/2026-09.md） |
| 2026-10-01 | 用户反馈（会话，4 项） | **#J 批次**：#J1 地雷在 1 个节点内只能布 1 次（`mineMax` 恰等于 `mineFieldCount`，首轮即用尽同时上限）／#J2 获得电磁炮后再获得其他主炮会继承 `pierce` 贯穿特性（主武器 install 用 `Object.assign(旧 stats, overrides)` 未重置基线）／#J3 改为全屏幕渲染敌人、视野距离系统整体退役（含 2 张视野卡成死效果卡）／#J4 导弹「无法发射」（真因是激活后零可见反馈 + 换装未复位 `_missileActivated` 的自动索敌残留；卡面未写明「伤害跟随 HEAT」；specs §4 与 §8.2 口径互相矛盾） | 已修复并归档（用户裁定 #J3「全屏幕渲染，AI 维持距离+直线视野」）。#J1 `mineMax` 3→6 / 硬上限 8→12；#J2 换型安装先重置为新类型基准；#J3 删除 `visionRadiusForViewport/visionCenter/visionClamped` + 剔除/虚线圈/dev「无视野」开关 + 2 张视野卡（卡池 168→166），AI 的 `engageRequiresLoS` + `hasLineOfSight` 保持不变；#J4 HUD 加「索/n%」状态 + 一次性缺条件提示 + 换装复位激活态 + 卡面与 specs 同步。三链全绿：`npm run check` EXIT=0 / `npm test` EXIT=0（`test-cards` #J2 段 7 项、`test-rework-r2` #J1 段 6 项）/ `npm run test:browser` 四链 ALL PASS EXIT=0（r4 新增 F 段 10 项，smoke P-39 改为退役断言）；见 DEVELOPMENT.md §4.42 / specs/combat.md §13.5·§13.6，原文见 archive/2026-10.md） |
