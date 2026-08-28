# Rogue Tank — 历史归档索引（ARCHIVE INDEX）

> 本文件是已完成条目的**顶层只读索引表**。
> 为防止单体文档过大引发上下文死循环，归档正文已按月分卷存放在 docs/archive/ 目录下。
>
> 规则：
> 1. 新完成条目在当月分卷（如 docs/archive/YYYY-MM.md）底部追加原文。
> 2. 本文件仅更新下方表格索引与分卷链接，保持主文档始终极简轻量。

## 分卷列表 (Archive Volumes)

- 📘 [2026年08月历史归档 (docs/archive/2026-08.md)](archive/2026-08.md)

---

## 归档总索引

| 归档日期 | 来源文档 | 条目 | 完结状态 |
|---|---|---|---|
| 2026-08-08 | `PLAN.md` | 全文（特性 1~5 规划 + 第 0/6/7/8/9 节 + 第 10 节 地图元素 A1~A3） | 已全部实现（见 DEVELOPMENT §3、§2.7、§5.5） |
| 2026-08-08 | `ISSUES.md` | #1~#8（含修复记录）+ 附：本轮新增特性 | #1~#8 已解决并验证；附注内容已并入 DEVELOPMENT §3 |
| 2026-08-13 | `PLAN.md` | 重构批次：代码去重 1.1~1.7 + 校验强化 2.1~2.3 + 性能优化 3.1~3.3 + 文档纠偏 4.1 | 全部完成并验证（结论见 DEVELOPMENT §3.6） |
| 2026-08-13 | 交互/重构 | 重坦/中坦不同车体高度与半高掩体交互关系简化方案 | 简化为 3 规则确定性模型，全部测试与 HTML 校验通过 |
| 2026-08-13 | `PLAN.md` | P-02（子条目 1~6）模块化重构批次 | 已完成并验证（结论见 DEVELOPMENT §3.6；第 7 条 battledraw 可选延后） |
| 2026-08-13 | `PLAN.md` | P-03 坦克数据拆分 tanks/ 一型一文件 | 已全部完成并验证（结论见 DEVELOPMENT §3.6；`split-tank-list.js` 保留作维护工具） |
| 2026-08-10 | `ISSUES.md` | #9. tank_mvp.html 首次加载玩家坦克未从 tanks/ 目录正确应用 | 已修复并验证（玩家默认加载适配 tanks/ 优先存在的配置） |
| 2026-08-10 | `ISSUES.md` | #12. 坦克交叉碰撞"鬼畜"抖动（MTV 轴歧义 + 幽灵穿模 + 速度模型破坏） | 已重写碰撞解析并验证（结论见 DEVELOPMENT §3「坦克间碰撞」） |
| 2026-08-11 | `PLAN.md` | P-04 工具链与性能批次（JSDoc/tsc/pre-commit/Skill/性能三件套） | 已全部完成并验证（结论见 DEVELOPMENT §4.7.4 / §4.5.6 等） |
| 2026-08-11 | `PLAN.md` | P-01 命中部位由鼠标径向意图决定（打炮塔 / 打车体） | 已全部完成并验证（结论见 DEVELOPMENT §3.6 / §2.5；`partProbe=12` 手感标定完成） |
| 2026-08-11 | `PLAN.md` | P-02（第 7 条 battledraw 绘制层下沉，P-02 完结） | 已完成并验证（结论见 DEVELOPMENT §3.6；顺带修复 `tank_fx.js` 飞头坐标 `p[0]` 取 `undefined` 的潜伏 bug） |
| 2026-08-12 | `ISSUES.md` | #16. 设计器渲染函数引用未声明的 `ay`，炮塔模式/载入坦克时 ReferenceError | 已修复并验证（结论见 DEVELOPMENT §3「双座圈圆心与炮管前缘交点绑定」） |
| 2026-08-13 | `PLAN.md` | P-05a. L形等凹多边形掩体 SAT/OBB 物理碰撞口袋卡住问题 | 已解决，支持 compound convex 碰撞并补充回归测试，并修正了坦克在口袋视觉空闲区的假碰撞（结论见 DEVELOPMENT §2.7） |
| 2026-08-13 | `PLAN.md` | P-05 节点地图元素生成器（模板库 + 难度加权随机选） | 已完成并验证，支持种子 RNG 与加权选取、参数化变体（结论见 DEVELOPMENT §2.1 / §3.6） |
| 2026-08-13 | `PLAN.md` | P-05 节点地图元素生成器（模板库 + 难度加权随机选） | 已全部完成并验证（结论见 DEVELOPMENT §2.1 / §3.6） |
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
| 2026-08-20 | `PLAN.md` | P-17 战术卡牌能力与主动装备拓展（战术炮击/护盾/超装填/无人机） | 已完成并验证（mvp 接入 G/H/V 按键、护盾吸收插入 resolveHit、延迟 AOE 炮击、无人机部署+视口外指示；结论见 DEVELOPMENT.md §3.22 / §6 条目 17） |
| 2026-08-19 | `PLAN.md` | P-15 MVP 架构重构（三入口拆分 + HUD 极简 + 伤害飘字 + 状态/开发者面板） | 已完成并验证（结论见 DEVELOPMENT §2.15 / §3.17 / §6 条目 15） |
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
------

