# Rogue Tank — 历史归档（ARCHIVE）

> 本文件是从 `PLAN.md` / `ISSUES.md` 中**删除的完成条目**的只读归档（原文保留，仅作追溯），**只增不删、不再更新**。
> 对应条目的最终设计/实现结论以 `DEVELOPMENT.md` 为准（权威文档；本文件仅供参考追溯，不参与判定）。
>
> 归档规则见 `AGENTS.md`「条目的 4 步生命周期」。

## 归档索引

| 归档日期 | 来源文档 | 条目 | 完结状态 |
|---|---|---|---|
| 2026-08-08 | `PLAN.md` | 全文（特性 1~5 规划 + 第 0/6/7/8/9 节 + 第 10 节 地图元素 A1~A3） | 已全部实现（见 DEVELOPMENT §3、§2.7、§5.5） |
| 2026-08-08 | `ISSUES.md` | #1~#8（含修复记录）+ 附：本轮新增特性 | #1~#8 已解决并验证；附注内容已并入 DEVELOPMENT §3 |
| 2026-08-13 | `PLAN.md` | 重构批次：代码去重 1.1~1.7 + 校验强化 2.1~2.3 + 性能优化 3.1~3.3 + 文档纠偏 4.1 | 全部完成并验证（结论见 DEVELOPMENT §3.6） |
| 2026-08-13 | 交互/重构 | 重坦/中坦不同车体高度与半高掩体交互关系简化方案 | 简化为 3 规则确定性模型，全部测试与 HTML 校验通过 |

------

# 一、2026-08-08 归档自 `PLAN.md`（原文）

---
# 功能执行计划（Features Plan）

> 本文档整理即将考虑实施的 5 项功能，分析每项的可行性、依赖关系与具体执行方案，供执行前对齐。
> **注意：本文件只是计划，不是代码改动清单的承诺；执行顺序与具体数值可在实现过程中调整。**
> 配合阅读：`DEVELOPMENT.md`（已定设计与技术债）、`AGENTS.md`（工作流）。

---

## 0. 总览与依赖

| # | 功能 | 类型 | 依赖 | 建议顺序 |
|---|------|------|------|----------|
| 1 | tank_compare 数据对比/编辑页 | 新页面 | 独立（复用现有模块） | 可与 2~4 并行 |
| 2 | 实时弹道命中（按炮弹飞行状态判命） | 核心物理重构 | 无（但为 3/4 打底） | 阶段 1 |
| 3 | 模块伤害重做（弹药架/成员/发动机） | 规则重构 | 2 | 阶段 2 |
| 4 | 真实炮弹外观 + 多弹种 | 视觉 + 数据 | 2（弹速差异才有意义）、3 的伤害倍率 | 阶段 3 |
| 5 | 机制参数抽取为独立配置文件 | 重构 | 无 | 阶段 0（最先做） |

**推荐执行顺序：`5 → 2 → 3 → 4`，`1` 独立可随时插入。**

理由：
- 特性 5 是纯重构、零风险，先把所有机制常数集中化，后面 2/3/4 的新参数能直接落进配置。
- 特性 2 是系统性架构变更（决定 3/4 的判定与表现方式），放最前。
- 特性 1 和 2~4 互不依赖，可并行推进。

每阶段完成后跑 `npm run check`（语法冒烟），并通过 dev server 在浏览器验证（见 AGENTS.md 的工作流）。

---

## 1. 特性 1 — tank_compare 对比编辑页

### 目标
新页面列出 `tank_list.json` 中所有坦克：一列一辆，顶部是坦克名+缩略图，下方逐行列出全部数据字段，字段可直接编辑，支持保存回 `tank_list.json`。

### 可行性
**可行，成本低。** 构件全部已就绪：
- `applyTankConfig()`（tank_model.js:153）能把 `tank_list.json` 条目加载进 `makeTank()` 产生的坦克对象。
- `tank_paint.js` 提供 `paintTracks` / `paintPartTexture` / `paintShade`，全部显式接收 `ctx`，无 DOM 依赖——完全可以在每辆坦克的独立小 canvas 上画缩略图（`tank_designer.html:1030` 已示范 `paintTracks` 用法）。
- `server.js` 已实现 `POST /api/tank_list`（server.js:39-55），校验 JSON 后写回根目录；`tank_designer.html` 的「保存」按钮已经走这条链路（tank_designer.html:1457-1492）。对比页直接复用同样的保存逻辑即可。

### 执行方案（新文件 `tank_compare.html`，沿用单文件原型风格）

1. **页面结构**
   - 顶部工具条：加载按钮、保存按钮、状态提示。
   - 主体：横向表格容器（`overflow-x:auto` 以防止车过多）。
   - 每列 = 一辆坦克；列头 = 名称 + 缩略图 canvas（约 110×70px）+ 该坦克的字段编辑区。
   - 每行 = 一个字段；行头 = 字段中文标签。

2. **渲染缩略图**
   - 对每条目的 spec 执行 `const t = makeTank({...}); applyTankConfig(t, spec);`（复用 tank_model.js）。
   - 在单个 canvas 内用 `hullPoly`/`turretPoly` → `polyCorners` → `paintTracks` + `paintPartTexture` + 炮管线段，画俯视缩略图。
   - 需要引入的脚本（按依赖顺序）：`js/tank_paint.js`、`js/tank_utils.js`、`js/tank_geometry.js`、`js/tank_model.js`。
   - 属性顺序问题：`applyTankConfig` 依赖 armor/几何都在别处也能工作；但注意它在坦克创建时先跑渲染，顺序上先 `makeTank` 再 `applyTankConfig` 即可。

3. **可编辑字段**
   - **标量数值字段**（用 `<input type=number>`）：`maxSpeed, turnRate, turretTurnRate, weight, enginePower, hp/maxHp, penetration, damage, reload, shellSpeed, trackWidth, trackOffset, trackLock`（`ammoFaultWindow` 已随特性 3 移除）。
   - **枚举字段**（`<select>`）：`heightClass`（medium/heavy）、`traverseLimit`（数值）。`barrel.muzzle`（none/single/double/multi/slug/pepperpot/heavy_square/cylinder）。
   - **结构化字段**（每组拆成多行或聚合输入框，编辑后写回对象）：
     - `armor`：hull/turret × front/side/rear 共 6 个数值输入。
     - `barrel`：len/width/evac.style/evac.pos/jacket.len/jacket.pos。
     - `turret.pivot`：dx / dy。
   - **只读或提示字段**：`hull.verts/hull.faces`、`turret.verts/turret.faces`、`anchors`。
     - 方案：这些几何数据展示为灰色只读（或一个“查看 JSON”折叠区），并提示「多边形几何请使用 tank_designer 编辑」。

4. **保存**
   - 编辑完成后重新组装出与原 `tank_list.json` 同构的对象（保持结构性字段不被误清）。
   - `fetch('api/tank_list', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(list,null,2)})`。
   - 失败/无 dev server 时回退为 `downloadTankList()`（即设计器已用的 Blob 下载覆盖逻辑，tank_designer.html:1390）。
   - 保存后重新拉取渲染，保证显示与文件一致。

5. **一致性检查**
   - `scripts/check-html.js` 目前只检查 `tank_mvp.html`/`tank_designer.html`（check-html.js:48）——需把 `tank_compare.html` 追加进数组，确保新页面的内联脚本也纳入冒烟检查。
   - 页面顶部标题/样式与现有两个原型保持同款视觉。

### 待决策
- **顶点是否可以表格内直接编辑？** 建议：不直接编辑（表格逐顶点编辑体验差），保留为只读 + 提供「完整 JSON 文本框」实施方式还是交给 design 工具，二者可都做（只读 + 可选的每个条目 JSON textarea）。

---

## 2. 特性 2 — 实时弹道命中（按飞行时刻判定）

### 现状与问题
- `tryFire()`（tank_mvp.html:452）在**按下射击键瞬间**调用 `resolveShot(ox,oy,dx,dy,player,target)`（tank_physics.js:13）。
- `resolveShot` 用**当时的**目标位置/车体朝向/掩体布局，完成：目标选取（`nearestEnemyTo`）、掩体判定、命中部位采样、入射角/等效厚度/穿透/跳弹判定，并**预计算好命中点与弹道折线**。
- 炮弹只有“飞行动画”（沿预计算线段推进，tank_mvp.html:710-735），伤害通过 `log()` 闭包在动画到达时施放——**但“打不打得到、打在哪”在开火瞬间就已固定**，与坦克移动、炮弹飞行时长无关。
- 结果：不存在“拉提前量/被反制”的空间；目标在炮弹飞行中移开，弹道依然按开火瞬间位置判定命中（不符合现实直觉）。

### 可行性结论
**完全可行，且很自然。** 底层几何函数全部都是“按输入射线即时计算”的纯逻辑，不需要重写：

| 现有函数 | 位置 | 在实时方案中的用途 |
|---|---|---|
| `segRayIntersect(ox,oy,dx,dy, ax,ay,bx,by)` | tank_utils.js:31 | 炮冰冰 swept 段与多边形边求交点 |
| `raycastTank(ox,oy,dx,dy,tank)` | tank_geometry.js:98 | 某坦克多边形与射线的第一交点 |
| `polyEdges`（外法线） | tank_geometry.js:78 | 命中时取表面法线算入射角 |
| `getExposure(...)` | tank_cover.js:146 | 命中时刻的半盖掩体概率 |
| `findCoversOnPath` | tank_cover.js:125 | 实时路径上的全盖/半盖检测 |
| `resolveImpact` | tank_physics.js:99 | 命中时刻的穿深/跳弹/模块判定（重组入即可） |
| `moduleFromHit` | tank_geometry.js:138 | 命中部位→模块（特性3会扩展） |

### 执行方案
*改造点集中在三个位置：`tryFire`、`resolveShot`/`resolveImpact`、`update`/`drawShells`。*

1. **开火 = 生成飞行炮弹（不再预计算）**
   - `tryFire` 删除 `resolveShot` 调用、删除预计算 segments/impact/log 逻辑，改为：
     - 从 `gunRoot(player)` 取初位，`direction = 炮塔方向 + gaussian(当前 sigma 散布)`（与现实一致：散布只影响出膛角）。
     - 生成炮弹对象：`{ x, y, dx, dy, speed, type:'apture/…', shooter, pen, dmg, maxDist, bounced:false }`。
   - 炮弹飞行**直线匀速**（无重力/阻力），简化工程；方向不随机身旋转改变（现实中炮弹出膛后不受车体转向）。

2. **逐帧飞行 + swept-segment 碰撞检测**
   - `update(dt)` 里对每发炮弹：
     - `prev = {x,y}`；`next = {x+dx*speed*dt, y+dy*speed*dt}`。
     - 对**每个存活实体**（`entities` 过滤 `hp>0`，且按 `isHostile(shooter.team, e.team)` 决定是否作为障碍）做 `raycastTank(prev.x, prev.y, ndx, ndy, e)`（用实际飞行方向向量）。
     - 同时对**全盖掩体**做同样检测（`findCoversOnPath(prev, next)`）。
     - 取所有候选命中中 **t 最小**的那个（路径上第一个障碍）。
     - ⚠ **防空速穿透**：抛弹道若每帧位移 > 命中部件宽度（炮弹速 1200px/s × 1/60s = 20px，榴弹 APCR 可达 1600px/s×1.2fps… 需 swept 段前后两个位置生成一条线段，用两个 `segRayIntersect` 交叉边界是否可能漏：**用 swept 策略允容飞行段与装甲边求交即可**（就是把 ‘sweep segment’ 当一条射线求交），常见做法，避免帧率抖动时穿模。

3. **命中则按“命中时刻”结算**
   - 求得交点后调用（改名的）`resolveImpactAt(e, hit, shell)`：
     - 法线来自被击边的朝向取法线 → 入射角 θ。
     - 半盖概率：以“炮弹当前位置+命中点”为路径调 `getExposure`，掷骰。全盖在 sweep 阶段已拦截。
     - 穿深/等效厚度判定（沿用 `resolveImpact` 现有逻辑）。
     - **跳弹**：θ > 70° 时 `reflectDir` 计算反射方向，把 `shell.dx/dy` 改为反射方向、位置设为命中点，`bounced=true` 后继续飞行，且 `bounced` 置位则不再进第二层跳弹（现有“二次弹不允许再弹”规则保留）。
     - 命中即结**：直接施加伤害/模块效果并写日志——不再需要 `log()` 延迟闭包（因为命中本身就是“炮弹到达”的时刻）。
     - 若是“未击穿”：炮弹销毁，发布火花/碎屑。
     - 命中后若不穿且非跳弹 → 炮弹消失。

4. **边界/清理**
   - 炮弹最远飞行距离上限（建议取当前预计算 1200px 的 ~2 倍，或改为配置）超时即销毁；出画布边界销毁。
   - 射程内无障碍 → 炮弹自然飞出画面消失，无 hit。

5. **保留现有“瞄准辅助”**
   - `updateSolution()`（实时预测面板）与散布锥绘线保持原样——它们是瞄准辅助（不参与判定），仍按开火瞬间的瞄准线给出预测。与真实弹道不符是预期（文档注明）。

### 由于此改动带来的新行为（设计收益）
- 移动/提前量变得有意义：命中与否取决于炮弹飞行期间目标的实际位置。
- 目标可在这期间跑进掩体/换位 → 半盖/全盖挡弹变成实时博弈。
- 能否“打中正在侧面的转弯坦克”按飞行期外真实位置判定。

### 关键决策点
- **友军/玩家坦克是否阻挡**：建议炮弹只与 `isHostile` 方相撞，友方坦克穿透（否则会误伤队友/被自己挡）。若要“友军误伤”需另外设计（默认不留）。
- **穿透多个敌人**：DEVELOPMENT.md 5.4 列为“未来机制”，本次不引入，命中即停;多头贯穿留到卡牌/技能改造。

### 影响范围
`tank_mvp.html`（tryFire/update/drawShells）、`tank_physics.js`（resolveImpact 重组为命中式）、可能新增 `tank_projectile.js` 放炮弹飞行实体与逐帧推进逻辑（保持模块化）。

---

## 3. 特性 3 — 模块伤害重做（依赖特性 2）

### 目标（合并原需求）
1. **弹药架命中不再直接击杀**：
   - 改为“命中+实际出伤”，当前伤害 ×2（玩家侧可随升级增加倍率）。
   - 若该伤害足以杀目标（`伤害后 hp≤0`）→ **“飞头”**（炮塔被掀飞，现有 `spawnAmmoBlowFx` 复用）。
   - 若未击杀 → **8 秒“弹药架受伤”**：装填速度降低（×0.6）。
2. **命发动机/成员**：造成 1.2 倍伤害（玩家侧，可随升级增强）；未击杀时施加 **8 秒对应效果降低**：
   - 乘员（炮手）→ 移动扩圈 ×1.6
   - 成员（装填手）→ 装填速度 ×0.6
   - 驾驶员 → 转向速度 ×0.6
   - 发动机 → 最大速度 ×0.6
   - 车长 → 所有成员效果 ×0.85
3. **敌方攻击玩家时倍率固定**：弹药 2.0 倍、发动机/成员 1.2 倍（不随升级）。

### 可行性结论
可行。`moduleFromHit`（tank_geometry.js:138）+ `resolveImpact`（tank_physics.js:99）的结构化逻辑已具备，只需：
- 1) 把 `moduleFromHit` 从现在的 6 种（crew/track/engine/ammo/turretHull/hullHull）扩展为 能区分 **车手/装填手/驾驶员/车长** 的具体角色（以及弹药架、发动机、履带）。
- 2) 把 `resolveImpact` 的 log() 里的“直接乐爆”分支改成“倍率伤害 + 杀人判定 + debuff 施加”。
- 3) 坦克新增**瞬时 debuff 状态**（8s 计时）+ 各属性读取处按 debuff 缩放。

### 执行方案

#### 3.1 模块分区扩展（`moduleFromHit`）
现有规则（tank.js:158-157）：
- 炮塔：侧面中段(s∈0.3~0.7)→crew；其余→turretHull 装甲。
- 车体侧面：两极致→track；其余按 `engineRearOf` 前后区分为 engine/ammo。
- 车体后部面 → engine。
- 正面 → hullHull 装甲。

**建议新分区**（具体边界比例待确认，用配置数据）：
| 命中部位 | 模块 | debuff |
|---|---|---|
| 炮塔侧面 前段/中段 | 车手 gunner | 移动扩圈 ×2 |
| 炮塔侧面 后段 | 装填手 loader | 装填速度 ×0.6 |
| 炮塔后部面 | 车长 commander | 所有成员效果 -20% |
| 车体侧面 前段（履带区外） | 驾驶员 driver | 转向速度 ×0.6 |
| 车体侧面 中段 | 弹药架 ammo | 装填速度 ×0.6（8s） |
| 车体侧面 后段 / 车体后部面 | 发动机 engine | 最大速度 ×0.6 |
| 车体侧面 极前端/极后端 | 履带 track | 履带断裂（现状保留）|

- 弹药架体积将到车体中段一个窄区（如 rel.x/halfL ∈ [−0.25..0.35]），便于玩家自瞄。
- 现有 `engine/ammo` 判定是“非引擎区即弹药”与“位置 0.78 外层是履带”，新方案将精确成“波带”。

**注意**：`deterministic` 模块=引擎区判定在 tank_geometry.js 中已将 `ammo/engine` 按普通“非引擎区”归为相同逻辑，新规则要重写这逻辑。

**3.2 伤害与死亡逻辑（`resolveImpact` 内部替换）**
伪代码（弹药架命中举例）：
```
if (mod.key==='ammo') {
  mult = isHostile(target) ? target==player ? RULES.ammo.playerMult : RULES.ammo.enemyMult  // 玩家对敌用库级
  // 注意：弹药的倍数乘的是“猛然· 主力”，不是总伤
  dmg = shell.dmg * mult
  target.hp -= dmg
  if (target.hp<=0) { target.ammoBlew=true; spawnAmmoBlowFx(target); /* 飞头 */ }
  else { target.ammoHurtT = 8 /* 弹药架受伤：装填×2 */ }
}
```
引擎/成员同理：`dmg = shell.dmg * (养护员比) / 引擎… × 倍率` ，未击杀则 `setKeyword to target.debuffs['engine'|'gunner'|'loader'|'driver'|'commander'] = 8s`。

**3. 状态管理与属性读取**
- 在 tank 对象新增 `debuffs:{}`（或 `hurt` 字段数组）：`{ ammo, gunner, loader, driver, engine, commander, fire }` 各带剩余秒数。
- `update(dt)` 统一 `-= dt`;归零自动清除。
- 属性消费点在：
  - 装填：`tryFire` 用 `debuffReloadRate(target)` 乘入 reload 计算（装填手/弹药受伤都降低装填速度 ×0.6）。
  - 移动扩圈：`motionSigma()` 的 `sMove` 项在 `gunner` 生效时 ×2。
  - 转向：`update()` 中 `player.stats.turnRate` 乘 `driver diff?直接乘`。
  - 最大速度：`player.stats.maxSpeed` 乘 `engine` diff。
  - 车长：对上述四项统一 ×(0.8)（或内联成系数乘法）。

**3. 删除旧机制**
- `ammoFaultT / ammoFaultHits`（两弹/窗口”机制）在逻辑中被新版替换。删除或保留为视觉字段，需移除引用（`tank_mvp.html` update 循环、`updateHud`、`makeTank`、`resetEntity`、`resolveImpact`）。
- 保留：`dotT/fireT`（起火）作为 Engine 命中的视觉层仍然有效（可选）。
- `mod.key==='crew'` 的旧含义被拆分为 roles。

**3. 玩家升级倍率的数据接口**
- `tank.stats` 增加 `ammoMult`（默认 2）、`crewMult`（默认 1.2）。`computeStats` 从 base/工作区供 upgrades 写。当前卡牌/商店系统未实现，先记住字段与默认，升级写入由后续机制接入（接口已预留，不需要写死）。

**3.7 敌人占用的这边**
- 敌人倍率固定：读 `RULES`（见特性 5）: `RULES.modules.ammo.enemy=2.0`, `.crew.enemy` = 1.2。

---

### 关键决策点（标黄的为待确认）
- **“车长（commander）”效果“所有成员效果降低 20%”** 精确读法：本计划建议 = 命中车长 → 全体乘员相关功能全局 ×0.8（装填 +20%时长 / 扩圈 ×1.2 / 转向 ×0.8 / 车速 ×0.8）。含义若与设计意图不同，请改。
- **同一模块反复命中**：建议“刷新时长，不累加效果”（第二次命中能有“刷新到 8s”但不会 16s）。
- **车厂倍率**：玩家命中弹药×2 可能直接打爆低血量目标→频繁“飞头”。数值平衡（血量/装甲）在实施时验证。

---

## 4. 特性 4 — 真实技术支持炮弹外观 + 多弹种（依赖特性 2、3的可选部分）

### 目标
- 炮弹不再画成圆形亮球，改为**真实炮弹形状（细长尖头，沿飞行方向）** + 简单拖尾。
- 弹种 3 种，颜色与三围乘数差异：

| 弹种 | 翅膀 | 飞行速度× | 穿深× | 伤害× | 备注 |
|------|------|----------|-------|-------|------|
| AP   | 蓝 | 1.0 | 1.0 | 1.0 | 标准弹 |
| APCR | 红 | 1.2 | 1.2 | 0.8 | 高初速 |
| HE   | 黄 | 0.6 | 0.6 | 1.2 | 慢速高爆弹 |

### 可行性结论
可行，且无新增物理复杂度：
- 炮弹已改实时飞行（特性 2），弹种参数能直接乘到 `speed/pen/dmg`，不会与当前“瞬间判定点位固定”冲突。
- 弹形绘制独立于判定：在 `drawShells` 中把圆形 `arc` 换成沿飞行方向绘制的尖头图形 + 尾部渐变轨迹 + 少量粒子。

### 执行方案
1. **弹种数据**：在特性 5 的规则文件里定义 `RULES.ammoTypes = { ap:{...}, apcr:{...}, he:{...} }`（含倍率与拖尾色）。
2. **开火参数**：`tryFire` 中 `shell.pen = shooter.stats.penetration * t.penMult; shell.dmg = shooter.stats.damage * t.dmgMult; shell.speed = shooter.stats.shellSpeed * t.speedMult;`。
3. **弹种切换 UI**：代码注释已预留按键位（tank_mvp.html 第 347 行“keys 1/2/0 dedicated for future ammo-type switch (AP/APCR/HE)”）。
   - 数字键 1/2/3 或 1/2/0 切换当前弹种；HUD 显示当前弹种名+颜色条。
   - 同一发换弹后再次开火使用新弹种。
4. **炮弹渲染**（tank_mvp.html `drawShells` 改造）：
   - 形状：以位置为“弹体中心”，沿方向画一个尖头椭圆（如长 14、宽 4px）。
   - 拖尾：尾部方向做线性渐变（颜色=弹种色）短尾（约 6~18px），可加时间；可选在飞行中每帧喷 1~2 个淡出小粒子。
   - HE 可加微弱扩散光晕（视觉上不明显区分），不做额外特效。
5. **HE 说明**：按本规格只是“数值倍率”，不做碎甲/伤害吸收（DEVELOPMENT.md §5.4 列为后续）；若后续要做“未破片溅射”，应在特性 3 之后单列。

---

## 5. 特性 5 — 机制参数配置文件（`js/tank_rules.js`）

### 目标
把所有“非坦克自身”的机制数值/参数集中到一个单独文件并加注释，函数都从该数据源取数，便于平衡调整。

### 决策：用 `.js` 而非 `.json`
因为需求明确“带好的注释”，JSON 不能写注释，故用 JS 文件（`const RULES = {...}` + 逐条注释），页面在脚本标签引入即可。若之后需要工具/外部编辑，再考虑迁移 json。

### 现在工作量与参数清单（※各参数查找当前硬编码位置）

**文件位置**：新建 `js/tank_rules.js`，导出 `RULES`（沿用现有模块的全局函数/顶级方式，如 `const RULES = ...`）。

包含内容（来源）：
| 组 | 参数 | 当前位置 |
|---|---|---|
| 弹道 | `BOUNCE_ANGLE`（70°） | tank_geometry.js:8 |
| 高度 | `HEIGHTS`（medium/heavy/cover） | tank_geometry.js:9-16 |
| 距离分档 | `distanceTier` 档位（15/45/90/∞） | tank_cover.js:15-20 |
| 避体基数 | `DEFENSE_BASE`、`ATTACKER_AMPLITUDE_FACTOR` | tank_cover.js:8-13 |
| 避体种类/文案 | `COVER_TIERS`（mode/fill/stroke 可保留显示生） | tank_cover.js:3-6 |
| 散布 | `SPREAD` 全套（base/moveMax/…/bloomRate/shrink…) | tank_model.js:248-257 |
| 速度换算 | `SPEED_KMH_FACTOR`、`SPEED_PX_FACTOR`、`ACCEL_POWER_TO_PX_SCALE`、`BRAKE_FACTOR` | tank_model.js:142-147 |
| 射击距离 | 炮弹 cap（见特性 2） | tank_mvp.html:488（原 1200）|
| 起火 | 燃烧 = 攻击方标准伤害 ×10%/秒（`dotRatio`，可升级），持续 5s（`dotSeconds`，可升级），速度×0.5（`speedMul`） | tank_physics.js engine 分支 + RULES.fire |
| 模块机制 | 弹药倍率（玩家2/敌2）、成员倍率（玩家1.2/敌1.2）、debuff 8s、装填/转向/速度 ×0.6、扩圈 ×1.6、车长 0.85 | 本特性 3（新增） |
| 履带 | 锁定秒数 `trackLock`（默认 8s，可随升级缩短） | tank_physics.js / tank_model.js |
| 弹种 | `ammoTypes` 表 + 拖尾色 | 本特性 4（新增） |
| 炮弹 | 拖尾长度、弹体尺寸（视觉参数） | 本特性 4（新增） |

**不迁移**（属坦克自身参数或测试台专属）：
- `ARMOR`（tank_geometry.js:3）——这是“缺省回退用的坦克装甲”，本质是坦克装甲，保留在模型层（改为引用 tank 自身数据）。若希望它全局可配，可放至 rules 的 “defaults.tank”，但标注清楚。
- `tank_model.js:114-122` 的 base 默认值（它们是坦克每台自身参数）。
- 测试台/靶场专属（RANGE_SPACING / autoRevive / dummy.HP 等）。

### 函数读取改造
凡引用上述常数处改为 `RULES.xxx`；若怕遗漏，先跑 `rg` 确认“魔数字”全部改到 `RULES`。
- `tank_geometry.js`：`BOUNCE_ANGLE`、`HEIGHTS`、`DEFENSE_BASE`、`ATTACKER_AMPLITUDE_FACTOR`、`distanceTier`。
- `tank_cover.js`：`COVER_*`、`distanceTier`、`DEFENSE_BASE`。
- `tank_model.js`：`SPREAD`、`SPEED_*`、`ACCEL`、`BRAKE`。
- `tank_physics.js`：模块伤害的倍率/debuff（特性 3 之后的代码）。
- `tank_mvp.html`：`fireMul`、`dotRatio`/`dotSeconds`（经 RULES.fire）、炮弹 1800 上限、视觉参数。

**检查脚本**：`scripts/check-html.js:43` 追加 `js/tank_rules.js`。

---

## 6. 变更文件总表（执行时参考）

| 文件 | 特性 1 | 特性 2 | 特性 3 | 特性 4 | 特性 5 |
|------|:---:|:---:|:---:|:---:|:---:|
| `PLAN.md`（本文件） | ✓ | ✓ | ✓ | ✓ | ✓ |
| `js/tank_rules.js`（新） | – | – | ✓ | ✓ | ✓（本文件主体） |
| `tank_compare.html`（新） | ✓ | — | — | — | — |
| `tank_mvp.html` | – | ✓ | ✓ | ✓ | ✓ |
| `js/tank_physics.js` | – | ✓ | ✓ | – | 引用 RULES |
| `js/tank_model.js` | – | –（计算字段读 shell） | ✓ | ✓（读弹种） | ✓（SPREAD 等） |
| `js/tank_geometry.js` | –（compare 复用） | ✓ | ✓（模块分区） | – | ✓ |
| `js/tank_designer.html` | – | – | ±（测试面板可顺带展示模块效果？可选） | – | 若引用 SPREAD 等同步 |
| `server.js` | –（已支持） | – | – | – | – |
| `scripts/check-html.js` | ✓ 追加 | – | – | – | ✓ 追加 rules.js |

---

## 7. 验证路径（每个阶段）

1. `npm run check` — 语法冒烟（须全绿；新增页面/脚本都要被检查到）。
2. `npm start` 打开 dev server：
   - `http://127.0.0.1:8000/` — 在 tank_mvp 验证实时弹道：移动/转向中开火，观察炮弹落点随时间变化（开火瞬间瞄准 vs 飞行后判定）、掩体实时遮挡、跳弹、二次命中。
   - `http://127.0.0.1:8000/tank_compare.html` — 字段编辑 + 保存 ⇒ `tank_list.json` 更新。
3. 特性 3 验证：用设计器/数组对靶车：
   - 弹药命中 → 若未杀：装填降低 8s；若杀：飞头。
   - 各成员/发动机命中 → 对应 debuff 在 HUD 显示并影响彼逻辑。
4. 特性 5 验证：修改 `RULES` 某参数（如 BOUNCE_ANGLE）后刷新立即生效，无需改战斗代码。

---

## 8. 未处理 / 后续（本次不规划，但受影响）

- 卡牌/升级/商店系统：给算了 ammoMult/crewMult/dotRatioMult/dotDurationMult 升级来源（只预留接口）。
- HE 溅射、过击未破片等特殊弹行为（DEVELOPMENT.md 5.4）。
- 穿透多个敌人的炮弹（5.4）。

---

## 9. 待决策清单（实施前需用户确认）

1. **车长 debuff 语义**（第 3 章 3.8）。
2. **HE 是否只做数值倍率**（不做特殊弹行为）——建议先行只做倍率。
3. **友军/玩家坦克是否被炮弹拦截**——建议 `isHostile` 即被拦截（穿）。
4. **模块命中次数叠加规则**——建议刷新时长不叠加。
5. **玩家弹药架被击中的相应规则**：~~新规统一为“2 倍伤害+8s 装填 debuff”（删除旧“两次命中才爆”），是否移除 `ammoFaultWindow` 机制待确认。~~ **已实施**：弹药架命中 → ×2 伤害（玩家侧可升级）；未杀 → 8s 装填降低；击杀 → 殉爆掀飞炮塔。`ammoFaultWindow` 机制已删除。
6. **对比页几何字段可编辑性**：建议只读 + 提示列到设计器。
7. **炮弹最大飞行距离**数值（建议 1500~2400px 可配）。

---

## 10. 地图元素 A1~A3（本次会话执行）

> 设计定稿见 `DEVELOPMENT.md` §2.7；本表只记录执行清单与状态。

| 步骤 | 内容 | 状态 |
|------|------|------|
| 前置 | 文档写入（本表 + DEVELOPMENT.md §2.7） | 已完成 |
| A1 | `RULES.coverTiers`/`heights.cover`/`breach` 扩展 + 元素注册（树/灌木/栅栏/沙袋） | 完成 |
| A1 | `tank_cover.js`：`damageCover`/`destroyCover`/`resolveCoverCollisions`/`coverNormalAt`/`splashCoversAt`/`snapshotCovers` + 已毁元素跳过 | 完成 |
| A1 | `tank_mvp.html`：炮弹穿透/单次阻挡判定、坦克压毁/通行减速、灌木/树干/树冠渲染与遮挡 | 完成 |
| A2 | 残骸残留（树→树桩、沙袋→碎石）+ 破坏粒子 + 预测面板「可击毁」标记与穿透/全挡分类 + 图例 | 完成 |
| A3 | HE 溅射破障 + 路障跳弹（>70° 弹离） | 完成 |
| 验证 | `npm run check` + 浏览器实测（伐树 3 发、沙袋挡 1 发/斜射跳弹、栅栏穿透毁、压毁、HE 清灌木、树冠遮挡靶车） | 待验证 |

验证路径：`npm start` → `http://127.0.0.1:8000/`，按上表逐项操作；`npm run check` 须全绿。
---
# 二、2026-08-08 归档自 `ISSUES.md`（原文）

---

# Rogue Tank — 工程问题清单（已核实）

> 本文档用于**核实并记录**代码库中已确认存在的问题。每条问题先给出可复现/可定位的代码证据（`文件:行号` + 数据/脚本演示），再说明根因与影响面，避免"怀疑但说不清"的模糊项堆积。
>
> 编号为人工分配，随发现追加。状态：`待处理` / `处理中` / `已解决`。
>
> 注：本文档是**问题清单**，与 `DEVELOPMENT.md`（设计决策与进度）互补；修复后再把结论同步回 `DEVELOPMENT.md`。

---

## #1 炮塔"自身中心"与"绕车体旋转中心"没有分离（旋转中心会落到炮塔尾部） — 已解决

> 解决时间：本次（#1 修复）。底层机制（数据格式 + 运行时归一化 + 设计器工具）见文末"修复记录"。

### 用户描述
> 炮塔自身的中心和其绕车体的旋转中心需要分开设置，目前炮塔自身的旋转中心有时会自动计算在炮塔的尾部。

### 核实结论（成立）

**现状：整个系统只有一个可配置点 `turret.pivot`，它把"炮塔局部坐标系原点 `(0,0)`"钉到车体上的某个点；炮塔自身的中心完全没有独立概念。**

1. **炮塔局部原点身兼两职** — 炮塔多边形的 `(0,0)` 既是：
   - **旋转轴**（经 `turretPivot()` 锚到车体，`tank_geometry.js:162-166`）；
   - **炮管根部 / 炮塔尺寸的基准**（`turretFrontDist()` = 多边形 `maxX`，`gunRoot()` = 轴点 + 前缘偏移，`tank_geometry.js:168-184`；`turLen/turWid` 由顶点包围盒推出，`tank_model.js:229-231`）。
   这两者被隐式绑定，**没有"炮塔自身中心"这个独立字段**。

2. **载入时对顶点原样零归一化、零校验**：
   - 设计器导入：`applyTankData()` 对炮塔 `verts` 直接 `halfFromFull`/`half` 原样保存，只单独读 `pivot`（`tank_designer.html:1302-1314`）；车体在导入时用 `recenterPoly()` 归一到包围盒中心（`tank_designer.html:1295,1299`），**炮塔刻意不做**（注释 `tank_designer.html:1249-1251`）。
   - 原型复用：`applyTankConfig()` 同样把 `turret.verts` 原样保留（`tank_model.js:221-231`），并注明"重新按包围盒居中会让旋转轴漂移"（`tank_model.js:217-220`）。

3. **后果**：一旦某条 `tank_list.json` 数据的炮塔顶点原点不在预定旋转轴（手写 JSON、旧"质心居中"约定导出的数据、或把原点画在尾部的数据），旋转轴就**自动落在多边形 `(0,0)` 所在处**——包括尾部。这种错误在编辑器里**无法修正**：`pivot` 模式只能整体移动炮塔在车体上的位置（`tank_designer.html:458-464`），顶点编辑也只能在"以轴点为原点"的坐标系里挪顶点；没有"把旋转轴在炮塔多边形内部重设"的入口。

4. **数值实测**（Node 脚本对 `tank_list.json` 全部条目核算，车体为原点、炮塔角=0 时）：

   | 坦克 | turret.pivot (dx,dy) | 炮塔包围盒中心 (x,y) | 轴点相对炮塔自身中心偏移 | 轴是否在多边形内 |
   |---|---|---|---|---|
   | dummy | (2,0) | (0.35,0) | 1.65 | 是 |
   | Leapard_1 | (8,0) | (1.90,0) | 6.10 | 是 |
   | tiger-I | (-3,0) | (3.35,0) | 6.35 | 是 |

   当前三条数据恰好都在多边形内部，但机制上**没有约束/校验保证**。以 tiger-I 顶点为样板、把多边形整体平移到"原点=尾缘"复现尾部落点：顶点跨度变为 `[0..39.3]`，轴点 `dx=-3` 已落在多边形**后缘之外**（尾部之后），炮塔本体仍绕它摆动——正是"旋转中心在尾部"的情形（脚本输出见下）。

### 根因
- 设计上默认"炮塔顶点原点 = 旋转轴"（`tank_designer.html` 炮塔模式提示原文："坐标以炮塔旋转中心为原点"；`tank_model.js:217-220` 同样这么写），因此旋转中心**从未被显式计算**，而是多边形的隐式原点；谁画的、原点落在哪，旋转中心就在哪。
- 文档与实际实现的**约定相互矛盾**，进一步放大歧义：
  - `DEVELOPMENT.md:89` 写"载入时把炮塔顶点按**自身质心**归一化，`pivot` 作为独立相对车体偏移"——这是与当前"原点=轴"**相反的**约定（质心居中会把旋转轴放到质心）。
  - `DEVELOPMENT.md:136` 写设计器 pivot"支持 dx/dy **双分量**偏移"——但设计器把 pivot 锁死在车体中轴线上，**dy 恒为 0**（编辑 `tank_designer.html:461-464`、提示 `tank_designer.html:656`、导出 `tank_designer.html:1208`、导入 `applyTankData` 内 `dy:0`，`tank_designer.html:1303-1304`），运行时 `turretPivot()` 却支持完整 dx/dy（`tank_geometry.js:162-166`）。文档描述与实际不符。
  - 按文档去"修正"代码（把炮塔顶点按质心归一化）恰恰会引入注释里警告过的"旋转中心漂移"类 bug（`tank_model.js:217-220`），说明文档第 89 行已过时。

### 影响面（共享同一声明的代码）
- 旋转/瞄准：`turretPivot()`、`polyCorners(..., turretAngle)`（`tank_geometry.js:75,162`）
- 炮管根部：`gunRoot()`（`tank_geometry.js:177-184`）、`tank_mvp.html:957-965`
- 绘制：`drawTank` 炮塔/炮环/阴影（`tank_mvp.html:888-955`）、设计器 `drawDesignerBarrel`（`tank_designer.html:891-904`）
- 炮弹判定盒子：`tank_geometry.js:59-66, 98-105`
- 殉爆"炮塔掀飞"的初始位置与姿态：`tank_fx.js:57-61`

### 影响表现
当某条目炮塔顶点原点落在尾部时：炮塔/战斗室整体绕"尾部点"摆动，炮管因 `turretFrontDist`（=maxX，相对原点）仍从炮塔前缘伸出，看起来"炮塔甩尾、越甩越偏"，没有任何加载时报错或可修复入口。当前 `tank_list.json` 三条数据暂无此症状，但**一旦从外部导入或手写数据即触发**。

### 建议修法方向（未定案，先记录）
- **方案 A（推荐）**：显式新增 `turret.pivotInTurret`（或 `turret.axis`）{"炮塔自身内的旋转轴位置，独立于车体上的 pivot"}。即把"炮塔自身中心"与"绕车体旋转中心"变为两个字段：运行时 `旋转中心 = 车体原点 + hullPivot + Rotate(turretPivotOffset, hullAngle)`，其中"炮塔自身中心"只用于纹理/包围盒/炮管根部对称性。
- **方案 B（最小改动）**：约定定位——在设计器内为炮塔新增"**轴点对齐**"命令：把一个已选顶点（或包围盒中心）设为 `(0,0)`，并自动改写所有顶点坐标，用纯 UI 操作把隐式轴点搬到预期位置；同时补一个导入校验：`pivot` 必须在炮塔包围盒/多边形内，否则报错提示。
- 两案共配套：**修文档**（`DEVELOPMENT.md:89,136` 与实现同步）、**让设计器支持 dy≠0**（如需非对称炮塔）、**加导入校验**。

### 复现步骤
1. 启动 `npm run dev`，浏览器打开 `tank_designer.html`。
2. 载入任意条目 → 删除炮塔 → 全部顶点清空 → 在模式下"从车头方向画顶点"（多边形顶点以 `turretCenter()`（=当前 pivot）为原点）。若画面坐标起点远离轴心，预制状态下的"炮塔旋转中心"即出现在多边形尾部。
3. 在 `tank_mvp.html` 通过「坦克选择」载入一条"原点在尾部"的 JSON，观察炮塔绕尾部摆动。

---

### 修复记录（#1）
- **数据格式**：新增可选字段 `turret.axis` `{dx, dy}` = **炮塔自身旋转轴**（在炮塔自己的编辑坐标帧内），与既有 `turret.pivot`（绕车体旋转中心，相对车体中心）完全分开。缺省 `(0,0)` = 原约定，旧数据零迁移、行为不变。
- **运行时归一化**（`js/tank_model.js` `applyTankConfig`）：读取 `spec.turret.axis` 后把炮塔顶点整体平移 `-axis`，保证"局部原点 (0,0) == 旋转轴"这一不变量对**所有下游**成立（`raycastTank`/`drawTank`/`gunRoot`/`turretFrontDist`/`tank_fx` 飞头 全部无需改动）。已用 Node 脚本验证：以"原点落在尾部 + axis 声明"编写的同一几何，归一化后顶点、pivot（绕车体旋转中心）、`gunRoot` 与参考数据完全一致。
- **设计器导入归一化**（`tank_designer.html` `applyTankData`）：turret 分支先按 `axis` 平移再 `halfFromFull` 还原半侧，兼容全多边形格式与半侧格式；已用 Node 脚本验证对 `tank_list.json` 三条数据 round-trip 逐顶点精确一致，尾部造样数据也能还原对称几何。
- **设计器 UI**（新增"两个中心"的可视化与修正工具）：
  - 画布新增青色标记"炮塔自身中心"（炮塔包围盒中心），与橙色"炮塔旋转中心"（pivot）区分；两者偏离时绘制虚线连线提示"甩尾"风险（仅在 炮塔/旋转中心 模式显示）。
  - 侧栏新增「炮塔自身居中对齐」按钮：一键把炮塔自身几何中心平移到旋转轴上，并实时显示"炮塔自身中心 ↔ 旋转轴偏移"读数（0 = 已重合）。
  - 模式提示文案同步更新，说明两个中心的含义。
- **导出**：`buildExport` 写出 `turret.axis`（归一化后恒为 (0,0)），与运行时配套。
- **文档同步**：`DEVELOPMENT.md` 第 89/136 行的过时描述已修正（见下）。
- **验证**：`npm run check` 通过；`tank_mvp.html` / `tank_compare.html` 复用 `applyTankConfig` 自动获得修复；旧 `tank_list.json` 无 `axis` 字段，加载行为与修复前一致。

（后续问题在下方追加，编号递增。）

---

## #2 从正面/后方射击只命中车体，命中不了炮塔 — 已解决

> 用户描述：车顶前方与后方命中仅触发车体判定，炮塔部分近似无法命中。

### 核实结论（成立）
`raycastTank()`（`js/tank_geometry.js:91`）对 hull/turret 各自返回最近命中（`hits` 数组），旧结算逻辑（`tank_mvp.html` 炮弹循环，lines 766-778）在**全部部位里取最小 `t`**。因 2D 同平面判定中同一炮弹依次穿过车体与炮塔投影，车体命中恒先于炮塔：实测（Node 加载 tank_geometry 复算）从正前方射击，`hull:rear t=13.0` vs `turret:rear t=28.9`；从正后方射击，`hull:front t=3.5` vs `turret:front t=28.9` —— 车体永远"先"命中，炮塔的 front/rear 面在实战中几乎无法命中。

### 修复
新增 `bestTankHit(hits, minT, maxT)`（`js/tank_geometry.js:122`）：在本步长推进区间内，**炮塔命中恒优先于车体**（炮塔是车体上层构件，同平面覆盖区内先被打中）；无炮塔命中时取最近命中。`tank_mvp.html` 炮弹地表改成单次 `bestTankHit(...)` 结算。Node 脚本验证：正面/侧面/后方弹道现在的返回值均为 turret 命中。

---

## #3 炮塔尾部只有"装填手"模块，没有装填手身后的弹药架区 — 已解决

> 用户：炮塔后部装填手身后应有一小块弹药架区。

### 核实（成立）
`moduleFromHit`（`tank_geometry.js:147`）炮塔侧面仅有双分：炮手/装填手（`Z.turretLoader = -0.25` 阈值），炮塔尾段不会触发弹药架。

### 修复
`RULES.modules.zones` 新增 `turretAmmo: -0.62`（`tank_rules.js`）；`moduleFromHit` 判定 `rel.x/halfL < turretAmmo` → `{key:'ammo', label:'炮塔尾舱弹药架'}`（叶面后约 35% 深度）。复测：+16px→炮手、-5px→装填手、-16/-24px→弹药架。

---

## #4 血量条的"伤害 <100 才显示"阈值与满血值不对应 — 已解决

> 用户：血条阈值写死 100。

### 模块（成立）
`tank_mvp.html`（原 1398-1411 行）：`maxHp = t.stats?.maxHp || t.maxHp || 100` —— `stats.maxHp` 是 `computeStats` 从 `base` 计算、且 HP 动态修改（HUD 满血输入 → `applyHp`？走 `t.maxHp`）与样式采样会与 `stats.maxHp`（init 时的 100）漂移：满血调高后矩形比例、显示门槛都会错。

### 修复
改为优先取实例 `t.maxHp`（`makeTank`/`applyHp` 均同步维护），仅其无效时回退 `stats.maxHp`/100。

---

## #5 三扩系数与缩圈速度不可配置 — 已解决

> 用户：缩圈太快、设计器没有入口。

### 已实现
- `computeStats`/`applyTankConfig`（`js/tank_model.js`）新增 `base.spreadMult`（三源统一倍率，缺省 1）与 `base.aimSpeed`（缩圈速率，缺省取 `RULES.spread.shrinkRate`）：`motionSigma` 的运动三源乘 `spreadMult`，`updateSigma` 的收缩速率用 `aimSpeed`。
- 设计器『战斗参数』新增两项输入；`buildExport`/`applyTankData` 读写字段；`tank_compare.html` 新增两行；`tank_list.json` 4 条数据各填了示例值。
- `RULES.spread.shrinkRate` 默认从 0.3 → 0.15（之前的缩圈显过快）。

---

## #6 炮塔"座圈圆心"（自转中心）在设计器里不可编辑 — 已解决

> 用户：炮塔旋转中心（座圈圆心）不支持编辑。

### 已实现
设计器『炮塔』模式下，按住画布上 16px 内的橙色十字（炮塔旋转中心）或青色点（炮塔自身中心）沿中轴线拖动：**平移整个炮塔多边形**，即把座圈圆心（局部原点）调整到炮塔上的任意位置（`pivot` 不动）。画布模式提示与十字标签同步更新。

---

## #9 坦克开火/相撞/设计器缺陷综合修复 — 已解决 (2026-08-08/2026-08-13)

### 问题反馈
- **开火点错位与特效单一**：开火和闪光特效在 `tank_mvp.html` 中产生在 `gunRoot`（结合部）而非真正的炮口，且所有制退器的开火闪光特效都是一样的，没有差异。
- **最大扩圈常驻**：在 MVP 中 `worstCase`（最坏情况）散布圈始终常驻在画面上，非常杂乱。
- **两车对撞鬼畜**：两台坦克在推挤相撞时会以 60Hz 产生快速高频抖动振荡（鬼畜）。
- **设计器无法微调本地轴心**：在 `tank_designer.html` 中无法自定义和保存精确的 `turret.axis` dx/dy 轴心设置。
- **内部模块不可见**：车体侧面和炮塔各区域的判定分区（弹药架/引擎/乘员等）在设计器中无法看见。

### 修复与改进实施
1. **炮口对齐 (`gunTip`)**：在 `js/tank_geometry.js` 新增并导出 `gunTip(t)`，结合 `t.turLen` 与 `barrel.len` 精确计算出炮口最前端在世界中的 2D 坐标。将 MVP 内的开火原点、飞行炮弹起点、瞄准线、散布锥原点全部对齐到 `gunTip`。
2. **8种制退器专属特效**：在 `js/tank_fx.js` 扩展 `spawnMuzzleFlash`，将 `muzzleType` 传入。并重写 `drawMuzzleFlashes`，程序化支持 `none`/`single`/`double`/`multi`/`slug`/`pepperpot`/`heavy_square`/`cylinder` 这 8 种特色排焰，包括侧向气流火喷、星芒细针、向前强焰、圆球气流及宽横幅喷砂。
3. **消除最大扩圈常驻**：移除 MVP 里的 `drawCone(SPREAD.worstCase(), ...)` 绘制，只绘制实时 Sigma 散布虚线，画面极大简化。
4. **数学级推开阻尼**：在 `js/tank_entity.js:resolveTankCollisions` 中规范化 MTV 推出数学向量，增加 `mtv.depth + 0.1` 缓冲区防粘连，同时对两车朝向速度投影碰撞法线，抵消并削弱法向上的撞击相对速度分量，两坦克对撞、推挤表现得极其丝滑，彻底消除了“鬼畜”Bug。
5. **轴心微调与 JSON 链路**：在设计器侧栏增加 `turret.axis` dx/dy 精确的数值输入，打通 `applyTankData` / `buildExport` 对 `axis` 的存取与导出，让旋转中心在炮塔内部的精细调整能切实落盘。
6. **判定模块可视化覆盖层 (`ShowZones`)**：在设计器中新增「显示内部模块 zones」Toggle 控制，开启后对车体侧面（驾驶员/弹药架/发动机/履带负重轮）和炮塔内部（炮手/装填手/尾舱弹药架）按照 `RULES.modules.zones` 划分的各个硬编码判定面以半透明彩色带进行 OBB 覆盖堆叠渲染，让几何与装甲厚度、内部模块面产生完美的设计呼应。

---

## #7 炮塔阴影方向随炮塔自转而旋转 — 已解决

> 用户：炮塔的立体感阴影只有一侧有。

### 模块（属实）
`paintTurretShadow`（`js/tank_paint.js:89`）在 `rotate(angle)` 之后才 `translate(ox,oy)`——偏移方向随炮塔角度一起转，炮塔转动时阴影方向跟着转，观感"光追着炮塔"。

### 修复
偏移量先按**世界方向**（`worldAng`=车体朝向）旋转再应用；`tank_mvp.html` 传入 `t.hullAngle`、`tank_compare.html` 传 0。炮塔旋转不再改变阴影方向。

---

## #8 设计器/原型履带宽度显示一致性核验 — 已解决（无差异）

### 核验结论
车履带宽的唯一数据源是条目字段 `trackWidth`：设计器（`trackWidthInput`）→ 导出 `trackWidth` → `each tank_list` → `applyTankConfig` → `paintTracks({trackWidth:t.trackWidth||8})`，MVP 与设计器共用同一 `tank_paint.js` 渲染（scale 换算一致）。仅 `js/tank_paint.js` 的模块内兜底值为 7（`opts.trackWidth || 7`）与调用方兜底 8 有 1px 差别，实际条目均显式携带 `trackWidth`、永不触发兜底，无用户可见差异。补齐：无，仅记录核验。

---

## 附：本轮新增特性（非问题，记录备查）
- **开火/命中特效升级**（`js/tank_fx.js`）：出膛锥形炮口闪光（`spawnMuzzleFlash`）、弹道烟迹（HE 更浓）、命中四态冲击闪光+火花+烟尘（`spawnImpactFx`：击穿/高爆/未击穿/跳弹各配不同色调与规模）、火花粒子（与既有火/烟/破片同池）；MVP 全部接入（含弹跳与掩体命中）。
- **血条左侧车型徽章**（`tank_mvp.html` `drawClassBadge`）：重坦=六边形 / 中坦=五边形，与血条同一水平、位于车体之外不遮挡坦克。
- **设计器装甲面板高亮**（`tank_designer.html`）：在画面/列表选中某条边后，「装甲厚度 Armor」面板顶部显示"当前装甲段"读数（部位·边·类型·mm），并高亮对应 mm 输入框。

---

# 三、2026-08-13 归档自 `PLAN.md`（原文）

---

# 功能与重构计划（Features & Refactoring Plan）

> 本文档是**临时文档**：只存放 "进行中 / 待实施" 的计划条目。
> 条目**实现并验证完成后**，按 `AGENTS.md` 定义的 4 步生命周期：先把结论同步进 `DEVELOPMENT.md` → **删除本条目** → 原文归档到 `ARCHIVE.md`。
> 本文档不保存已完成的历史（历史计划见 `ARCHIVE.md`）。

---

## 1. 代码去重与共享重构（High Priority）

- **Task 1.1: 清理 `tank_designer.html` 冗余函数声明**
  - 背景：`tank_designer.html` 已引入 `js/tank_halfgeom.js`，但在内联脚本里重复声明了 16 个相同的几何函数。
  - 动作：删除内联冗余声明，使用 `js/tank_halfgeom.js` 导出的全局函数。
  - 验证：`npm run check`，并通过 dev server 打开设计器验证渲染、编辑、导入导出功能。

- **Task 1.2: 统一 `partCorners` 与 `partEdges`**
  - 背景：`js/tank_utils.js` 与 `js/tank_geometry.js` 均包含了逐字相同的 `partCorners`/`partEdges` 实现。
  - 动作：保留 `js/tank_utils.js` 实现，移除 `js/tank_geometry.js` 中的重复函数。
  - 验证：`npm run check` & `node scripts/test-covers.js`。

- **Task 1.3: 统一 `reflectDir`**
  - 背景：`js/tank_utils.js` 与 `js/tank_physics.js` 重复定义了 `reflectDir`。
  - 动作：保留 `js/tank_utils.js`，删除 `js/tank_physics.js` 的独立定义。
  - 验证：`npm run check` & `node scripts/test-covers.js` & 浏览器测试弹道跳弹。

- **Task 1.4: 统一 `distanceTier`**
  - 背景：`js/tank_rules.js` 与 `js/tank_cover.js` 重复定义了 `distanceTier`。
  - 动作：保留 `js/tank_rules.js` 实现，删除 `js/tank_cover.js` 重复别名定义。
  - 验证：`npm run check` & `node scripts/test-covers.js`。

- **Task 1.5: 统一 `normalizeBarrel`**
  - 背景：`js/tank_halfgeom.js` 与 `js/tank_model.js` 存在两份逻辑相近的 `normalizeBarrel` 炮管规格归一化代码。
  - 动作：统一在 `js/tank_halfgeom.js` 提供，`js/tank_model.js`（及其它模块）复用该定义。
  - 验证：`npm run check`，设计器与 MVP 中加载不同炮管样式测试。

- **Task 1.6: 提炼 OBB 计算函数**
  - 背景：`js/tank_cover.js` 中 `obbOverlap` 与 `obbMTV` 内部各包含一套私有的 `getAxes`/`project` 投影辅助函数。
  - 动作：提炼至模块顶层共享函数。
  - 验证：`node scripts/test-covers.js`。

- **Task 1.7: 统一默认装甲基数定义**
  - 背景：`ARMOR`（110/38/26, 140/50/24）散落在 `js/tank_geometry.js`、`js/tank_model.js` 与 `js/tank_halfgeom.js` 多处。
  - 动作：收口统一至 `RULES` 或单一数据源。
  - 验证：`npm run check`，靶车装甲数值计算正确。

---

## 2. 测试与校验工具强化（Medium Priority）

- **Task 2.1: 扩展 `scripts/check-html.js` 校验范围**
  - 动作：从仅检查 3 个 JS 文件扩展为遍历整个 `js/` 目录中的所有 JS 文件做 Node 语法冒烟检查。
  - 验证：`node scripts/check-html.js` 运行并通过全量校验。

- **Task 2.2: 配置 `package.json` 测试命令**
  - 动作：增加 `"test": "node scripts/test-covers.js"` 脚本。
  - 验证：执行 `npm test` 正常跑通测试。

- **Task 2.3: `check-html.js` 增加重复函数声明校验**
  - 动作：在冒烟脚本中加入 AST/正则分析，检测 HTML/JS 文件中顶层函数的重复定义。
  - 验证：`npm run check`。

---

## 3. 性能与细节优化（Medium Priority）

- **Task 3.1: 优化 `computeStats` 装甲拷贝性能**
  - 动作：替换 `JSON.parse(JSON.stringify(base.armor))` 为逐层浅拷贝或 `structuredClone`。
  - 验证：`npm run check` & 浏览器运行无误。

- **Task 3.2: 表驱动化 `applyTankConfig` 属性映射**
  - 动作：消除连续 `if (spec.X !== undefined)` 样板代码，使用映射配置数组统一拷贝。
  - 验证：应用配置前后坦克属性保持完全一致。

- **Task 3.3: 增强 `server.js` 接口安全性与健壮性**
  - 动作：为 POST `/api/tank_list` 添加 body 大小限制（如 2MB）和 `try...catch` 包裹的写入保护。
  - 验证：测试正常保存与超大/非法请求拦截。

---

## 4. 文档一致性纠偏（Low Priority）

- **Task 4.1: 同步 `DEVELOPMENT.md` 属性系统实现状态**
  - 动作：更新 §5.1 / §3，将"属性 base/modifiers/stats 三层结构"标明为底层已完成，后续重点为"卡牌/技能接入"。

---

# 四、2026-08-13 归档：半高掩体 3 规则简化方案

## 方案详情
1. **车体与炮塔露出**：炮塔 100% 露出（不被半高掩体阻挡），炮弹可穿过半高掩体；中坦车体 100% 被阻挡（0% 露出），重坦车体 25% 露出（75% 被阻挡）。
2. **距离压制**：分析弹道路径上所有介于攻击方与被攻击方之间的半高掩体，取离【被攻击方】最近的一座掩体 C_near。若 dist(攻击方, C_near) < dist(被攻击方, C_near)，则被攻击方视为【无掩体】（exposure = 1.0）。
3. **通行**：重坦可越过半高掩体，中坦被阻挡（MTV 推出）。
4. **代码改动**：更新 `js/tank_rules.js`（`RULES.coverRules`）、`js/tank_cover.js`（`getExposure` 重构）、`scripts/test-covers.js`（Node 单元测试升级），同步更新 `DEVELOPMENT.md` §2.5 与 §2.7 行为矩阵。
