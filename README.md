# Rogue Tank

节点式地图推进 + 局内得分驱动构筑的战术坦克 Roguelike（俯视角 2D）。

纯前端 JavaScript，无构建步骤，零运行时依赖。五个单文件 HTML 原型 + `js/` 下 40+ 共享模块（浏览器端按序加载为全局脚本，Node 端可直接测试）。

## 快速开始

```bash
npm start          # 启动 dev server（默认端口 8000，可用 PORT=9000 覆盖）
```

浏览器访问（必须走 HTTP，不支持 `file://`）：

| 页面 | 地址 | 说明 |
|---|---|---|
| 首页 | `http://127.0.0.1:8000/` | 正式游戏 / 装甲测试台入口 |
| 正式游戏 | `http://127.0.0.1:8000/tank_mvp.html` | run 链路：存档 → 配装 → 商店 → 节点图 → 战斗/结算/卡牌/Boss |
| 装甲测试台 | `http://127.0.0.1:8000/tank_bench.html` | 靶车、发射解算、Enemy Lab、卡牌测试 |
| 设计器 | `http://127.0.0.1:8000/tank_designer.html` | 车体/炮塔多边形编辑、逐边装甲、甲弹对抗 |
| 数据对比 | `http://127.0.0.1:8000/tank_compare.html` | 坦克数据表格化对比/编辑 |

## 验证（三链全绿）

```bash
npm run check         # 语法冒烟 + tsc 类型检查（共享模块、server.js、页面内联脚本）
npm test              # 全套 Node 测试链（AI/物理/卡牌/Boss/地图/经济……）
npm run test:browser  # 浏览器冒烟四链（需系统 Edge + playwright-core 无头）
```

## 目录结构

```
index.html / tank_mvp.html / tank_bench.html / tank_designer.html / tank_compare.html
js/            共享模块（tank_rules.js 为机制参数唯一配置源，必须最先加载）
tanks/         坦克配置（一型一 JSON，经 api/tanks 读写）
cards/ bosses/ 卡牌与 Boss 数据
assets/        贴图资源
scripts/       测试与工具链（test-*.js / validate-content.js / audit-content.js …）
docs/          开发文档（DEVELOPMENT / PLAN / ISSUES / ARCHIVE + specs/ 五卷规范）
server.js      dev server（静态服务 + /api/tanks 读写）
```

## 给开发者的文档入口

- **`AGENTS.md`**（仓库根）：Agent/开发者工作指引——项目概览、文档分工与条目生命周期、开发工作流、架构要点。开始工作前请先通读。
- **`docs/DEVELOPMENT.md`**：长期权威文档（核心方向、架构演进、当前状态、批次落地结论 §4）。
- **`docs/specs/`**：各系统现行口径唯一权威（combat / map / cards / boss / editor）。
- **`docs/PLAN.md`**：近期待办（只存未完成项）；**`docs/ISSUES.md`**：已核实的问题清单。

## License

MIT — 见 [LICENSE](LICENSE)。
