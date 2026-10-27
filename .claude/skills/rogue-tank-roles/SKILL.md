---
name: rogue-tank-roles
description: Use when dispatching or acting as a Rogue Tank specialist role — maps any task to one of six write-disjoint roles (combat / mapgen / systems / content / render-fx / verify-docs), and enforces the single-writer rules for pages, specs and shared modules.
---

# Rogue Tank — 角色索引与写域纪律

本项目只认 **6 个角色**，角色卡位于 `.claude/agents/role-*.md`。调度前先在本表定位角色，再加载对应 agent：

| 角色卡 | 负责系统 | 典型触发词 |
|---|---|---|
| `role-combat` | 命中结算 / 弹道 / 武器 / 技能 / 护盾 / 炮击 / 部署物 | `resolveHit` `bounce` `穿深` `散布` `弹种` `ability` `shield` `strike` `部署物` `地雷` |
| `role-mapgen` | 地形生成 / 节点 / 掩体 / 视口 / 小地图 / 河流路网 | `cover` `tier` `nodegen` `strip` `路网` `河流` `小地图` `camera` `出生点` |
| `role-systems` | RULES / 属性 / 实体 / 运动 / 流程 / 经济 / 复活 / AI / Boss 运行时 / 无人机 | `RULES` `computeStats` `entities` `driveTank` `flow` `存档` `复活` `aiDecide` `boss` `drone` |
| `role-content` | 卡牌与 Boss 的数据内容 + schema 校验 | `cards/*.json` `bosses/*.json` `validateCard` `validateBoss` `稀有度` `流派` |
| `role-render-fx` | 贴图 / 声音 / 绘制 / 特效 / 飘字 | `贴图` `sprite` `烘焙` `音效` `SOUND_DEFS` `特效` `FX` `飘字` `paint` |
| `role-verify-docs` | 测试链 / 冒烟 / 文档 4 步生命周期 | `npm test` `check-html` `验证` `DEVELOPMENT` `PLAN` `ISSUES` `ARCHIVE` `specs` |

## 1. 单写者规则（并行前必读）

线上真实撞车点（历史 14 个角色里有 14 个文件被 ≥2 个角色同时声明所有权）已收敛为下列硬规则：

| 文件 | 规则 |
|---|---|
| `tank_battle.html`（390KB+） | **单写者**。同一批次只允许 1 个角色改页面接线，其余角色只交付 `js/` 模块。默认写者是 `role-combat`（战斗循环）/ `role-systems`（流程经济）二选一，由调度方指定 |
| `tank_bench.html` | 同上，默认 `role-render-fx` 或 `role-combat` |
| `tank_designer.html` / `designer.js` | 仅 `role-systems`（几何） |
| `js/tank_cards.js` | 仅 `role-content`（枚举与校验单一来源） |
| `js/tank_boss.js` | 仅 `role-systems`（运行时）；`role-content` 只写 `bosses/*.json` |
| **`docs/specs/<卷>/` + `docs/specs/<卷>.md`** | **一整个卷 = 一个不可分割的写单元**，同一时刻只允许 1 个角色改（含该卷全部主题页 + 兼容索引页）。跨卷可并行。必须与 `docs/DEVELOPMENT-batches-<yyyy-mm>.md` 的 §4.x 同批落地，并跑 `node scripts/wiki-check.js` |
| `docs/WIKI-STYLE.md` | specs 形态规范权威；改它等同改纪律，需 Lead 批准 |
| `scripts/run-tests.js` / `scripts/check-html.js` / **`scripts/wiki-check.js`** | 仅 `role-verify-docs` |

**并行安全规则**：派发 N 个角色时，先确保它们的可写文件集合两两不相交；交集非空就必须串行，或改由 Lead 合并。

## 2. 交接契约（模块边界即接口）

- `role-systems` 持有 `RULES`（`js/tank_rules.js`）与 `computeStats`。其他角色**新增调参**时向 `role-systems` 提字段需求，不直接改 `tank_rules.js`。
- `role-mapgen` 持有 `covers`；`role-combat` 只调用 `getExposure` / `findCoversOnPath`，不自己算遮挡。
- `role-systems` 持有 `entities` 与 `driveTank`；AI 只产出 `{turn, move, turretDesired, fire}`，不写位置速度。
- `role-content` 持有 `cards/` `bosses/`；运行时消费方（`role-systems`）只读 schema，不改数据文件。

## 3. 验证归口

任何角色完成改动后**不自称验证通过**，统一由 `role-verify-docs` 跑：

```
node scripts/check-html.js          # 语法冒烟（EXIT=0 才算过）
node node_modules/typescript/bin/tsc --noEmit
npm test                            # Node 全链（64 个 test-*.js；runner 登记 65 项）
npm run test:browser                # 浏览器六链（smoke/r3/run/r4/ally/3d）；受限环境下 spawn EPERM 属环境限制
npm run baseline                    # R0 渲染基线（默认 --check；首次 -- --write）
node scripts/wiki-check.js          # 仅当本批改过 docs/：断链/锚点/兼容页结构/wiki 页模板
```

> **wiki 化后新增的第 5 条链**：`scripts/wiki-check.js` 只在**改过 docs** 的批次需要跑；`broken=0 anchorBad=0 struct=0 template=0` 才算过。它检查：① 全 docs 树 Markdown 链接目标文件存在 ② `page.md#anchor` 的锚点在目标页有对应标题（GitHub slug 实算）③ `docs/specs/<卷>.md` 有兼容索引警告块且每节有「详见」 ④ `docs/specs/<卷>/*.md` 有 摘要/适用版本/源自/相关 四行 + `## 相关页面`。**`docs/archive/**` 也在检查范围内**（2026-10-21 已修完历史遗留的 7 处相对路径错误并取消该豁免）；归档正文内容仍「只增不改」，但**链接可达性必须可查**——将来若报错请修路径，不要加豁免。

停止条件：三条链全绿即止。**禁止**为了"确认"而反复重跑同一链超过 2 次（flaky 项除外，见 `sandbox-verify` skill §5）。
