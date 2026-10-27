# Rogue Tank

节点式地图推进 + 局内得分驱动构筑的战术坦克 Roguelike（俯视角 2D）。

> **技术栈现状（不是承诺）**：纯前端 JavaScript，当前无构建步骤、零运行时依赖；六个单文件 HTML 原型 + `js/` 下 40+ 共享模块（浏览器端按序加载为全局脚本，Node 端可直接测试）。**这是现阶段的临时选择，不是硬约束**——如某项特性（如真 3D 渲染）值得，可引入打包与第三方依赖（见 `docs/specs/map/pseudo-3d-2p5d.md` §3.1）。

## 快速开始

```bash
npm start          # 启动 dev server（默认端口 8000，可用 PORT=9000 覆盖）
```

浏览器访问（必须走 HTTP，不支持 `file://`）：

| 页面 | 地址 | 说明 |
|---|---|---|
| 首页 | `http://127.0.0.1:8000/` | 正式游戏 / 装甲测试台入口 |
| 正式游戏 | `http://127.0.0.1:8000/tank_battle.html` | run 链路：存档 → 配装 → 商店 → 节点图 → 战斗/结算/卡牌/Boss |
| 装甲测试台 | `http://127.0.0.1:8000/tank_bench.html` | 靶车、发射解算、Enemy Lab、卡牌测试 |
| 设计器 | `http://127.0.0.1:8000/tank_designer.html` | 车体/炮塔多边形编辑、逐边装甲、甲弹对抗 |
| 数据对比 | `http://127.0.0.1:8000/tank_compare.html` | 坦克数据表格化对比/编辑 |
| 坦克图鉴 | `http://127.0.0.1:8000/tank_codex.html` | 按等级查询坦克/Boss 的六面装甲、HP、穿深、伤害、装填、极速与尺寸（纯查询，不生成实体） |
| 3D 切片 (R1) | `http://127.0.0.1:8000/tank_3d.html` | 真 3D 可玩切片：小战场、轻倾斜相机、主炮与友军命令、基础破坏（原生 WebGL1） |

## 验证（五条命令全绿）

```bash
npm run check         # 语法冒烟 + tsc 类型检查（共享模块、server.js、页面内联脚本）
npm test              # 全套 Node 测试链（AI/物理/卡牌/Boss/地图/经济……）
npm run test:browser  # 浏览器六链（smoke/r3/run/r4/ally/3d；需系统 Edge + playwright-core 无头）
npm run baseline      # 2D 渲染基线（三场景固定截图 + 性能；首次 -- --write）
npm run baseline:3d   # G1 3D 场景基线（固定相机/冻结首帧截图 + 帧时间；基线在 tmp/ 不入库）
```

## 目录结构

```
index.html / tank_battle.html / tank_bench.html / tank_designer.html / tank_compare.html / tank_codex.html / tank_3d.html
js/            共享模块（tank_rules.js 为机制参数唯一配置源，必须最先加载）
tanks/         坦克配置（一型一 JSON，经 api/tanks 读写）
cards/ bosses/ 卡牌与 Boss 数据
assets/        后期贴图目录（当前为空 = 全部走程序化烘焙；见 assets/README.md）
scripts/       测试与工具链（test-*.js / validate-content.js / audit-content.js …）
docs/          开发文档（DEVELOPMENT / PLAN / ISSUES / ARCHIVE + specs/ 五卷规范）
server.js      dev server（静态服务 + /api/tanks 读写）
```

> **贴图口径（2026-10-23）**：程序化生成是唯一实机路径，PNG 通道保留作后期贴图接线；
> 本仓库不出图（AI 出图链已删除）。流程见 `docs/ASSETS-PIPELINE.md`。

## 给开发者的文档入口

- **`AGENTS.md`**（仓库根）：Agent/开发者工作指引——项目概览、文档分工与条目生命周期、开发工作流、架构要点。开始工作前请先通读。
- **`docs/DEVELOPMENT.md`**：长期权威文档（核心方向、架构演进、当前状态、批次落地结论 §4）。
- **`docs/specs/`**：各系统现行口径唯一权威（combat / map / cards / boss / editor）。
- **`docs/PLAN.md`**：近期待办（只存未完成项）；**`docs/ISSUES.md`**：已核实的问题清单。

## License

MIT — 见 [LICENSE](LICENSE)。
