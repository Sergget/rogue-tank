P-17 "战术卡牌能力与主动装备拓展" - 实现分析报告
==================================================

基于代码库实地勘测（2026-08-19），对 PLAN.md 中 P-17 的 4 个子目标进行实现状态分析。

## 1. 子目标实现状态概览

| 子目标 | 实现状态 | 备注 |
|--------|----------|------|
| 1. 战术支援 bombardment（战术炮击/轰炸） | **未实现** | 无 ability key、无卡牌效果、无游戏逻辑 |
| 2. 烟幕 smoke screen | **部分实现** | 卡牌 `smoke_screen.json` 已注册，ABILITY_KEYS 包含 'smoke'，但无实际视线遮挡/gameplay 效果 |
| 3. 超级装填 / 战术护盾 | **未实现** | 无 shield ability key、无 shield modifier stat、无护盾游戏逻辑 |
| 4. 无人机 Drone 体系 | **部分实现** | 卡牌 `escort_drone.json` 已注册，type 'drone' 已定义，但无 drone 实体、AI 或 gameplay 效果 |

**整体完成度：约 12.5%**（4 个子目标中，有卡牌 schema 定义的 2 个已获 25% 实现进度，另 2 个零实现）

---

## 2. 详细子目标分析

### 子目标 1：战术支援 bombardment（战术炮击/轰炸）
**预期效果**：指定区域延迟 AOE 判定，在目标区域内造成区域伤害。

**当前代码状态**：
- `js/tank_cards.js` 中 `ABILITY_KEYS = ['smoke', 'repair', 'extinguish', 'recon', 'track_repair']`——**不包含 'bombardment' 或类似关键字**
- `CARD_EFFECT_TYPES` 包含 'ability' 类型，但 ability key 仅限上述 5 种
- 无任何 'bombardment' 相关的卡牌定义（cards/ 目录下无对应 JSON）
- `js/tank_physics.js` / `js/tank_model.js` 中无 bombardment 相关逻辑
- 卡牌系统 `applyCardEffects` 只能应用已定义的 ability key

**缺失的代码变更**：
1. 在 `js/tank_cards.js` 中向 `ABILITY_KEYS` 添加 'bombardment'（或 'strike', 'aerial_support' 等）
2. 创建一张或多张包含 type: 'ability', key: 'bombardment' 的卡牌 JSON 至 `cards/`
3. 在 `js/tank_physics.js` 或新模块中实现 AOE 结算逻辑（目标区域内单位伤害、模块伤害、debuff）
4. 将 bombardment ability 接入卡牌抽选与使用流程（mvp HUD 中的卡牌使用按键）
5. 可能需要在 `js/tank_flow.js` 或 `js/tank_entity.js` 中注入目标区域坐标

**相关文件**：
- `js/tank_cards.js` - ability key 定义
- `js/tank_physics.js` - 现有的 resolveHit/ModuleDamage 逻辑（需扩展为 AOE）
- `js/tank_model.js` - computeStats、modifier 管线
- `js/tank_flow.js` - 流程状态机（卡牌使用时机）
- `cards/` 目录 - 新增卡牌 JSON

---

### 子目标 2：烟幕 smoke screen（烟幕弹，阻断 AI 索敌与玩家视线）
**预期效果**：发射遮挡视线的烟幕弹，阻断 AI 索敌与玩家视线（`vision: true` 动态掩体）。

**当前代码状态**：
- ✅ `cards/smoke_screen.json` 已存在，定义：
  ```json
  { "id": "smoke_screen", "name": "烟雾弹", "type": "ability", "key": "smoke" }
  ```
- ✅ `js/tank_cards.js` 中 `ABILITY_KEYS = ['smoke', 'repair', 'extinguish', 'recon', 'track_repair']`——已包含 'smoke'
- ✅ `scripts/test-cards.js` 第 33 行测试通过：`ok(cardsMod.validateCardEffect({ type: 'ability', key: 'smoke' }, 'e').length === 0, 'ability 合法')`
- ❌ **实际 gameplay 效果缺失**：
  - 没有烟幕弹投放时的视觉效果
  - 没有动态视线遮挡（dynamic vision occlusion）
  - AI `tank_ai.js` 中无烟幕相关状态转换或行为修正
  - `js/tank_cover.js` 中无 smoke 相关的 vision 处理
  - HUD 中无烟幕图标/计时显示

**缺失的代码变更**：
1. 在 `js/tank_cover.js` 中扩展 `getExposure` 或新增 `applySmokeScreen` 函数，根据时间戳计算 smoke 遮挡层
2. 在 `js/tank_ai.js` 中：当己方或敌方处于烟幕效应区时，修正 `aiDecideEnemy` 的 `hasLoS` 判定或使敌人进入 'search' 状态
3. 在 `js/tank_flow.js` 或 MVP 主循环中：烟幕持久计时、视线重计时机制
4. 在 `js/tank_fx.js` 或 `js/tank_paint.js` 中：烟幕粒子/视觉效果生成
5. 在卡牌使用 HUD 中：添加烟幕卡牌的使用界面/按键绑定
6. 可能需要 `RULES.heights` 或新增 smoke 高度参数

**相关文件**：
- `js/tank_cover.js` - 视线遮挡 `getExposure`、cover tier 定义
- `js/tank_ai.js` - AI 决策，需要烟幕状态反应
- `js/tank_fx.js` - 战斗特效（烟幕粒子）
- `js/tank_paint.js` - 程序化渲染（烟幕视觉）
- `cards/smoke_screen.json` - 已存在，作为已实现部分
- `scripts/test-cards.js` - 卡牌测试（通过，表示 schema 正确）

---

### 子目标 3：超级装填 / 战术护盾
**预期效果**：主动爆发装填；定向/全向护盾（吸收指定角度或全向弹道）。

**当前代码状态**：
- **Super reload（主动爆发装填）**：
  - `MODIFIER_STATS` 包含 'reload'，modifier 类型可修改 reload
  - 但无 'burst_reload' 或 'quick_reload' 之类的 ability key
  - 无卡牌效果能触发"立即完成装填"的行为
  
- **Tactical shield（战术护盾）**：
  - 无 'shield' 相关 stat 在 `MODIFIER_STATS` 中
  - 无 'shield' ability key 在 `ABILITY_KEYS` 中
  - `js/tank_model.js` `computeStats` 中无 shield 相关逻辑
  - 无护盾破坏/消耗的 gameplay 逻辑

**缺失的代码变更**：
1. **对于 super reload**：
   - 在卡牌 effect 中添加 type: 'ability', key: 'burst_reload'（或类似）
   - 在 `js/tank_model.js`/`js/tank_physics.js` 中：当 tank.reloadT <= 0 时，主动结算一次满装填（重置 reloadT），或给予"下发射必击穿/无散布"的临时 buff
   - 或者在 `js/tank_cards.js` 中添加 modifier 类型的 `mode: 'burst_reload'` 支持

2. **对于 tactical shield**：
   - 向 `js/tank_cards.js` `MODIFIER_STATS` 添加 'shield' 或 'absorb' 相关 stat
   - 或者新增 ability key 'shield' 并实现吸收机制
   - 实现 shield 损毁逻辑：每次受到弹道时减少 shield 值，耗尽时破裂
   - 在 `applyModuleDamage` 或 `resolveHit` 中集成 shield 检查

**相关文件**：
- `js/tank_cards.js` - MODIFIER_STATS 白名单、ABILITY_KEYS
- `js/tank_model.js` - computeStats、modifier 管线
- `js/tank_physics.js` - resolveHit、模块伤害结算
- `js/tank_entity.js` - 实体状态（shield 计时器等）

---

### 子目标 4：无人机 Drone 体系
**预期效果**：小地图/战场箭头指引视口外敌军位置；近身自动索敌与主动打击敌方 AI。

**当前代码状态**：
- ✅ `cards/escort_drone.json` 已存在，定义：
  ```json
  { "id": "escort_drone", "name": "伴随浮游炮", "type": "drone" }
  ```
- ✅ `js/tank_cards.js` 中 `CARD_EFFECT_TYPES` 包含 'drone'
- ✅ `scripts/test-cards.js` 第 34 行测试通过：`ok(cardsMod.validateCardEffect({ type: 'drone' }, 'e').length === 0, 'drone 合法')`
- ❌ **实际 drone 系统零实现**：
  - 无 drone 实体（`js/tank_entity.js` entities 数组中无 drone）
  - 无 drone AI 或视线引导逻辑
  - 无小地图/战场箭头指引视口外敌军的渲染
  - 无近身自动索敌与主动打击的行为逻辑
  - `js/tank_minimap.js` 中无 drone 标记
  - 卡牌 `applyCardEffects` 中 'drone' case 为空（仅 `break`）

**缺失的代码变更**：
1. 在 `js/tank_cards.js` 的 `applyCardEffects` 中实现 'drone' type：向 `tank.cardEffects` 推入 drone 效果，或直接生成 drone 实体
2. 在 `js/tank_entity.js` 中：添加 drone 实体类型，包含 position、homePosition、behavior AI
3. 在 `js/tank_ai.js` 中： drones 可视为 "伴随单位"，对近敌自动开火
4. 在 `js/tank_minimap.js` 中：渲染 drone 标记，指引玩家前往视口外敌军位置
5. 在 `js/tank_camera.js` 或 `js/tank_flow.js` 中：实现"视口外敌军箭头"功能
6. 创建 drone 行为逻辑：巡逻、锁定最近敌人、开火
7. 在卡牌使用后：生成持续一段时间的 drone 实体，时间结束后自动销毁

**相关文件**：
- `js/tank_cards.js` - drone effect type 定义
- `js/tank_entity.js` - 实体注册表，需扩展支持 drone
- `js/tank_ai.js` - AI 决策，需考虑 drone 行为
- `js/tank_minimap.js` - 小地图渲染，需添加 drone 标记
- `js/tank_camera.js` - 视口坐标转换，用于箭头指引
- `cards/escort_drone.json` - 已存在，作为已实现部分

---

## 3. 经济系统 P-17 第二部分（UI 与交互）
**次要内容**：为 P-14 经济系统补全 UI 界面，以及死亡/通关后直接进入商店。

**当前代码状态**：
- ✅ `js/tank_economy.js` 已完整实现：
  - `UPGRADE_DEFS` 永久升级树（8 项）
  - `loadProfile` / `saveProfile` 存档
  - `buyUpgrade` / `applyUpgrades`
- ❌ **UI 界面缺失**：
  - 无商店 UI 组件（HUD 中仅保留 4 件套，见 DEVELOPMENT.md §2.15）
  - 无死亡/结算后的商店进入入口
  - 无局内节点间商店 UI
  - `tank_mvp.html` 中无永久升级购买界面
- ❌ **流程接入缺失**：
  - 结算 `settlement` → `reward` 流程中无卡牌/商店选择入口
  - 游戏结束 `gameover` 后无复活购买界面

**缺失的代码变更**：
1. 在 `tank_mvp.html` 或新建 UI 页面中：添加永久升级商店界面
2. 在 `js/tank_flow.js` 中：扩展 reward 状态，包含经济购买选项
3. 在 `js/tank_economy.js` 中：可能需要额外的 UI 辅助函数
4. 在 DEVELOPMENT.md §2.15 中：更新 HUD 约定，接入商店 UI
5. 复活次数购买入口：见 M10 里程碑

**相关文件**：
- `js/tank_economy.js` - 已实现核心逻辑
- `tank_mvp.html` - 需要 UI 补充
- `js/tank_flow.js` - 流程状态，需扩展 reward 状态
- DEVELOPMENT.md §2.15 / §6 条目 15 - HUD 约定

---

## 4. 测试脚本更新检查

**现有测试脚本状态**：
- `scripts/test-cards.js`：全部通过✓（包括 drone 和 smoke ability 合法性测试）
- `scripts/test-economy.js`：全部通过✓（永久升级、存档、买断全部通过）
- `scripts/test-flow.js`：全部通过✓（状态机转移全部正确）
- `scripts/test-qa.js`：见后文

**需要更新的测试**：
1. **`scripts/test-cards.js`**：目前测试仅覆盖 schema 合法性，未覆盖 drone/smoke 的 gameplay 行为。建议后续补充：
   - drone 实际效果测试（实体生成、AI 交互）
   - smoke 实际视线遮挡测试

2. **`scripts/test-economy.js`**：已覆盖经济逻辑，无需更新（除非新增 UI 相关功能）

3. **`scripts/test-qa.js`**：
   - QA 规范要求至少 3 种边界检查模式
   - 已覆盖模式包括：断言、计数器、重置/恢复、物理/几何、弹跳角度、无敌帧、复活、视线、高度类别、掩体层级、驾驶越掩、模块、炮口归一化
   - 如新增 drone/smoke/ bombardments 机制，应相应更新边界检查列表

**QA 流程**：
- 新增测试脚本编写完成后，在提交前运行 `node scripts/test-qa.js` 确保合规
- 通过合规检查的脚本会在 `npm test` 起始时自动通过语法与结构验证

---

## 5. 完成度计算

**计入实现的度量标准**：
- 是否有对应的 code（function / variable / JSON 定义）
- 是否有 gameplay 效果（实际游戏中的可玩功能）
- 是否通过测试验证

**各子目标实现百分比估算**：

| 子目标 | Schema/代码 | Gameplay | 综合得分 |
|--------|-------------|----------|----------|
| 1. 战术支援 bombardment | 0% | 0% | 0% |
| 2. 烟幕 smoke screen | 100% (card + key) | 25% (vision logic缺失) | ~62.5% |
| 3. 超级装填 / 战术护盾 | 0% | 0% | 0% |
| 4. 无人机 Drone 体系 | 100% (card + type) | 25% (实体+AI缺失) | ~62.5% |

**P-17 总体完成度**：
- 4 个子目标平均得分： (0 + 62.5 + 0 + 62.5) / 4 = **31.25%**
- 但考虑到 "已实现" 仅指 schema/卡牌定义而非 gameplay，按"纯代码实现"标准： **(0 + 25 + 0 + 25) / 4 = 12.5%**

**最终报告**：P-17 当前完成度 **约 12-13%**（以实际 gameplay 可用功能为准），若仅计入卡牌 schema 与代码定义则为 **约 50%**（2/4 个子目标的 schema 已完全定型，2/4 仍缺失 even schema）。

**建议**：优先实现 2 个高优先级子目标（烟幕 smoke screen 已有 card 可复用，无人机 drone 同样有 card 基础），随后 tackl 心援 bombardment 和 超级装填/护盾，涉及新的 ability key 与 gameplay 逻辑开发。

---
*报告生成时间：2026-08-19*
*分析依据：PLAN.md P-17、DEVELOPMENT.md §2.13/§2.4/§2.15、js/tank_cards.js、js/tank_economy.js 及相关模块实际代码*