# Rogue Tank — 近期开发计划 (PLAN.md)

本文档是**临时规划**文档，用于细化新特性/重构的执行路径。条目在实现并验证通过后按 4 步生命周期删除并归档（正文写入 `docs/archive/<yyyy-mm>.md` 当月卷，索引行更新进 `docs/ARCHIVE.md`）。

---

（其余无进行中条目。远期项 P-21/P-23/P-24/P-25/P-26 见 docs/archive 快照 §6。）

## 玩法系统 PLAN（2026-08-24）

> 编号说明：原 P-27/P-29/P-30 与 DEVELOPMENT.md §5 记录的历史已完成条目撞号，2026-08-24 起重编号为 P-34/P-35/P-36；本批活跃条目为 P-34~P-41。

### P-34. 终局结算闭环（死亡耗尽 / ESC 主动终止）+ 跨局难度升级 + 手动结算保存
- **目标**：一局不再固定 5 节点收尾——节点链随推进持续延伸（开放式），Boss 每 5 节点出现（协同 P-37）。终局仅两种触发：① 阵亡且复活次数耗尽 → gameover 强制终局；② 战斗中 ESC 暂停面板（P-35）选「终止游戏并结算」→ 主动终局。两路均进入终局结算屏（得分/评分汇总）→ 得分 ×10% 转永久点数 → `profile.difficultyLevel` +1 持久化（下一局叠加入 generateRun 曲线）。另：局内 settlement 保留手动「结算并保存」按钮。
- **改动点**：
  - `js/tank_flow.js`：新增 `pause` 态（P-35 先行）与转移 battle→pause、pause→settlement（终止并结算）；gameover 保持死亡耗尽出口；扩展白名单表并补单测。
  - `tank_mvp.html`：`nextNodeAfterReward` 末节点分支改为开放式续接生成下一节点而非回图收束；ESC 暂停面板挂「终止游戏并结算」；终局结算屏复用现有 settlement 渲染。
  - `js/tank_map.js`：`generateRun` 支持链尾续接生成；接受 `difficultyLevel` 参数叠加难度曲线；`aiTier` 注入 spawnTank spec（协同 ISSUES #76）。
  - `js/tank_economy.js` + `tank_mvp.html`：difficultyLevel 持久化与任一终局 +1；双账本记分（约定见 P-41）；「结算并保存」按钮调 `saveActiveProfile`。
- **依赖**：P-35（暂停面板承载终止入口）先行；P-37 提供 Boss 周期标记。
- **验证**：`npm run check` + `npm test`；浏览器连续推进 >5 节点且每第 5 节点遇 Boss；两条终局路径均正确结算且下一局难度提升；中途保存重载生效。

### P-35. ESC 暂停/设置面板 + 终止游戏并结算 + 倒车转向倒置开关
- **目标**：ESC 打开暂停/设置面板（含按键绑定展示、倒车转向倒置开关、「终止游戏并结算」按钮——后者承接 P-34 主动终局入口），暂停冻结战斗循环。
- **改动点**：
  - `js/tank_flow.js`：新增 `pause` 态 + `battle⇄pause` 转移；`draw()` 在 `pause` 态跳过更新仅渲染。
  - `tank_mvp.html`：新增 ESC 监听与暂停/设置 overlay（按键绑定说明 + 倒车倒置开关写入 profile 设置，默认关）。
  - `js/tank_move.js:35` 附近：依据 profile 开关在 `move<0` 时翻转 `turn` 符号。
- **验证**：`npm run check` + `npm test`；浏览器 ESC 暂停/恢复；切换开关后倒车手感验证。

### P-36. 地面生物群落地貌（混凝土/草原/黄草/泥潭/蓝水）
- **目标**：战斗地面按节点 biome 主题化填充（混凝土灰/草原绿/黄草/暗泥/蓝水），与 #78 的「减速不挡弹泥潭地形」协同。
- **改动点**：
  - `js/tank_nodegen.js`：节点模板加 `biome` 标签（或 `generateRun` 按 index 分配），驱动地面配色。
  - `tank_mvp.html` `draw()`：新增地面填充步骤（按 biome 选底色 + 可选纹理/网格），替换单一清屏。
  - `RULES.coverTiers`：新增 `mud` tier（减速不挡弹，`mode` 区分）；水域弹道语义已裁定为「弹越飞、挡移动」（#85，随 P-40 落地），本条目仅负责地面配色与视觉层。
- **验证**：`npm run check` + `npm test`；浏览器不同节点地面配色/纹理切换。

### P-37. Boss 节奏可配置（每 N 节点一个 / 链尾 + 周期）
- **目标**：落实 2026-08-24 定案——默认 RULES.bossInterval=5（每 5 节点一个 Boss），节奏参数可调；配合开放式长链（P-34）使周期标记在推进中自然生效。
- **改动点**：
  - `js/tank_rules.js`：新增 `RULES.bossInterval`（默认如 5）或 `bossSchedule` 配置。
  - `tank_mvp.html` `assignBossNode`：依据 `RULES.bossInterval` 标记多个 Boss 节点（链尾保留 + 周期节点），并相应清敌。
  - `js/tank_map.js` `generateRun`：节点生成时按节奏预标 `boss`。
- **验证**：`npm run check` + `npm test`；调整 `bossInterval` 后确认多个 Boss 节点出现。

### P-38. 敌方进度推进/镜头外递增生成 + 击杀配额
- **目标**：每节点在开局外，随进度/镜头外动态增兵，提升单局可击杀数与压迫感。
- **改动点**：
  - `js/tank_map.js` `materializeNode` / `tank_mvp.html` `enterBattle`：保留开局批次，新增"进度触发生成"——按已击杀数 / 节点计时 / 镜头外空位调用 `env.spawnTank`。
  - 引入 per-node `killQuota`（可超过初始批次），节点结束条件改为 `kills>=quota` 或"清场+配额达成"。
  - 利用 `hasLineOfSight`/camera bounds 判定镜头外生成点。
- **验证**：`npm run check` + `npm test`；浏览器确认推进中镜头外持续增兵、击杀数超过初始批次。

### P-39. 镜头滚轮缩放
- **目标**：鼠标滚轮调节 `cam.zoom`（带上下限与阻尼），将滚轮从弹药切换解耦或改为组合键。
- **改动点**：
  - `js/tank_camera.js`：为 `zoom` 增加 `minZoom/maxZoom` 与 `updateCamera` 阻尼收敛。
  - `tank_mvp.html`：新增 `wheel` 监听改绑 `cam.zoom` 调整（弹药切换可移至 `Q`/数字键或 Shift+滚轮），并调用 `worldToScreen`/`screenToWorld` 以焦点为中心缩放。
- **验证**：`npm run check` + `npm test`；浏览器滚轮缩放顺滑、缩放中心合理。

### P-40. 地形类型抽象落地（水域/泥潭 + 具体地形 + 富集准备）
- **目标**：将 water/mud 抽象为类似全高/半高掩体的「地形类型」，具象出水潭、河流、烂泥地、水潭周围烂泥地、残破建筑、完整建筑等，并为后续富集地图元素（岩石/不规则形态、biome 地面、AI 找掩体、摧毁特效）打基座。设计稿见 `docs/specs/map.md` §5。
- **前置（已解除，2026-08-24 裁定）**：ISSUES #85 已裁定水=炮弹越飞（不挡弹）、阻挡坦克移动；落地时将 js/tank_rules.js:91 water 的 mode:'solid' 改为 pass 语义（保留 move:0.0 移动阻断），实施时同步 specs/map.md §5.2 表述。
- **改动点**：
  - `js/tank_rules.js` `RULES.coverTiers`：新增 `mud`/`river`/`rock`/`ruined`/`intact` 等 tier，按 §5.1 schema 设属性；重裁定 `water` 的 `shellBlock`。
  - `js/tank_cover.js`：泛化 `getExposure` 的 `exposureProfile` 分发（取代硬编码 `tier==='half'`，:361-373）；支持 `segments[]` 连通多段（河流）。
  - `js/tank_nodegen.js`：模板打地形放置标签（中央水潭/沿边河流/泥环），生成新 tier。
  - `js/tank_battledraw.js` + `tank_minimap.js`：新 `drawStyle`（water-chain/rock-poly/mud/structure）与液体/地面 tier 的小地图表征。
  - 交叉任务：地面 biome 图层 (#81)、不规则岩石 (#78)、AI 找掩体钩子 (#76)、建筑摧毁 FX、地形步进音效/特效。
- **验证**：`npm run check` + `npm test`；浏览器确认水潭越弹但挡坦克、泥地减速、河流连通、建筑 half/full 剖面与摧毁残骸。

### P-41. 局内商店（节点间 · 当前得分消费 · run 内属性升级）
- **目标**：2026-08-24 定案落地——节点间开放真正的局内商店：出售仅当局有效的属性升级（modifiers `scope:'run'`，本局结束清除、不带出存档）；按当前得分计价消费，消费独立记账、**不减损**终局转化用的累计得分。
- **改动点**：
  - `js/tank_economy.js`：`RUN_SHOP_DEFS` 商品表 + 双账本 API（累计得分流水与可花余额分离；购买扣余额、不动累计）。
  - `tank_mvp.html`：settlement/reward 界面新增商店入口与购买 UI（复用 shop 屏骨架）；购买应用 scope='run' modifiers（复用 `removeRunModifiers` 清理时机）。
- **依赖**：与 P-34 同批实施（共享经济账本改造）；属性修饰器机制已有（P-12）。
- **验证**：`npm run check` + `npm test`；浏览器购买后属性生效、本局结束升级消失、终局转化分数不受购买影响。

