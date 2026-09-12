# 战术坦克 Roguelike — 开发主文档（新方向：技能与武器构筑流派）

> 本文档是**唯一长期权威文档**，2026-09-08 起切换至全新演进方向：淡化单一弹种数值纠结，全面引入**技能系统**、**主副武器解耦**、**多类型召唤物（炮塔、无人机、掩体、地雷）**与**曲射/特种弹药体系**。

---

## 1. 项目新定型与核心方向

**类型**：俯视角 2D 战术坦克 Roguelike，强构筑、轻弹道、强调主动技能与战术组合。

**核心改动方向**：
1. **武器分化与双槽位**：坦克配置由单一主炮扩充为“主武器（机炮/双管/自动炮/电磁炮）”+“副武器/挂载（迫击炮、导弹、火箭弹、地雷布撒器）”。
2. **主动技能与模组化**：引入超级火控、超级速度、紧急装填、战术呼叫等主动技能与可拆卸模组槽位。
3. **召唤与部署系统**：支持召唤侦察/打击无人机、部署固定炮塔、放置战术护盾掩体及布雷。
4. **视觉热重载**：支持在战斗升级过程中动态改变炮塔外观、炮管附件与实体视觉版本。

---

## 2. 架构演进与演练模块

- **技能管线**：`js/tank_abilities.js` (扩展支持超级火控、超级速度等主动能力)
- **武器/弹药拓展**：`js/tank_fire.js` 与 `js/tank_rules.js` (支持曲射迫击炮、长杆 APFSDS 等特种弹药)
- **召唤物体系**：`js/tank_drone.js` / `js/tank_entity.js` (扩展固定炮塔、护盾、地雷部署)
- **炮塔与视觉热重载**：`js/tank_geometry.js` 与渲染层 `tank_mvp.html` 的脏标记刷新管线。

---

## 3. 当前活跃项与下一步顺序

1. **分支初始化**：已切换至 `feature/rogue-tank-rework`，归档旧架构核心文档。
2. **最小原型验证**：实现“炮管延长 + 护盾加装”与“主副武器切换/主动技能基础”的跑通。
3. **实体与视觉热重载对接**。

---

## 4. R-1/R-2/R-3 阶段落地结论（2026-09-12）

### 4.1 R-1 主副武器与主动技能
- 主副武器双槽位（`weapons.primary`/`weapons.secondary`，`tank_weapons.js` `WEAPON_DEFAULTS`）与 `moduleSlots` 挂载经 `applyTankConfig` 接入实体。
- 主动技能：超级火控（`super_fire_control` 散布 ×0.3）与超级速度（`super_speed` 极速 ×1.5）落地 `tank_abilities.js`，冷却与 HUD 状态条接线。
- 视觉热重载：实体 `_visualVersion`/`_lastDrawnVersion` 脏标记管线，战斗中改配即触发重绘；`window.__TEST__` 暴露 `getVisualVersion`/`getWeaponState`/`triggerSkill` 测试钩子。

### 4.2 R-2 召唤物与战术部署
- 固定炮塔（`isDeployableTurret`，极速 0 + 自动索敌开火，`fixedTurretFire` 事件）、地雷（武装延迟 + `mineExplode` 触发爆炸）、战术护盾掩体（护盾吸收池）全部注册进 `deployables`，测试台 `tank_bench.html` 面板按钮可直接生成。

### 4.3 R-3 特种弹药与曲射
- `RULES.ammoTypes` 新增：**APFSDS**（`doubleModule: true` — 命中结算 `applyModuleDamage` 双次模块抽取，取两 roll 倍率最大值）与 **HEC**（`ignoreCover: true` 越障曲射 + `noBounce` + `arc` + `splashRadius: 110`）。
- `stepShells`（`js/tank_fire.js`）消费 `ignoreCover`：HEC 弹道完全跳过掩体拦截/曝光判定，直飞目标；曝光结算处 `ignoreCover` 时恒 exposure=1（曲射抛物线越过掩体顶不遮挡）。
- 2σ 高斯散布截断：`tank_utils.js` `gaussian(sigma)` 拒绝采样保证 100% 弹着点在 ±2σ 内。
- 曲射武器配置：榴弹炮（`isArc: true`，射程 ≥400）与迫击炮副武器（`isArc: true`，`aoe ≥ 80`）。

### 4.4 #A19 坦克碰撞回归修复
- 根因：`resolveTankCollisions`（`js/tank_entity.js`）的 MTV 候选轴存在同方向重复向量污染 tie-break 集合，且 `depth<=0.05` 跳过阈值把擦碰浅穿透全部放行 → 交叉场景残留 ~18.72px 深叠、推挤分支退化。
- 修复：候选轴按方向去重（保留首个）+ 阈值降为 `depth<=1e-6`。全部 21 项碰撞检查通过，未触碰任何手感常数。

### 4.5 测试基线
- 新增 `scripts/test-rework-r3.js`（APFSDS 双模块/HEC 越障/2σ 散布行为断言）与 `scripts/test-browser-r3.cjs`（Edge headless `channel=msedge` 冒烟：测试台按钮/5·6 弹种键/mvp Home 态，8 项全 PASS）。
- 已知遗留：`test-nodegen.js` 16 项失败为基线预置问题（`git stash` 后在 bae560a 同样复现，主因道路条带宽断言与校准漂移），与本次改动无关；#A11 已备案同类"nodegen 重构需专轮实施"。
