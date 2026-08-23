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

------

