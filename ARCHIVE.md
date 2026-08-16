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

------

# 一、2026-08-08 归档自 `PLAN.md`（原文）

---

# 二、2026-08-11 归档自 `PLAN.md`（P-04 工具链与性能批次，原文）

### P-04 工具链/工程效率批次（短期，本次会话新增）

**动机**：模块数量增长后，纯语法冒烟（`npm run check`）拦不住类型错误与浏览器侧回归；为 AI 协作与手测效率补齐轻量工具链，全部零运行时依赖、不引入构建。

**子条目**：
1. **JSDoc 类型检查**：`devDependencies` 加 `typescript`；新建 `tsconfig.json`（`checkJs: true`, `noEmit: true`）；共享模块关键签名加 JSDoc（`tank_utils`/`tank_geometry`/`tank_model`/`tank_physics` 优先）；`package.json` 加 `typecheck` 脚本；`npm run check` 串入 `npm run typecheck`。
2. **pre-commit git hook**：创建 `.git/hooks/pre-commit` 自动执行 `npm run check`（含语法检查与重复声明检测）。
3. **OpenCode `test-runner` skill**：创建 `.opencode/skills/test-runner/SKILL.md`，固化测试与检查规范。
4. **Canvas 性能三件套**（`js/tank_paint.js`/`js/tank_fx.js`，纯表现层）：
   - 程序化坦克贴图**离屏预渲染缓存**；
   - **粒子对象池**（火花/烟尘/碎片）；
   - **fixed timestep** 帧率稳定。

**验证路径**：`npm run check` 全绿；三个原型浏览器正常加载。

**决策清单**：
- [x] 1. JSDoc + typescript + tsconfig 接入
- [x] 2. pre-commit hook 挂载
- [x] 3. test-runner skill 创建
- [x] 4. Canvas 性能优化（离屏缓存/粒子池/fixed timestep）

---

# 三、2026-08-08 归档自 `ISSUES.md`（原文）

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

## #10 射击紧贴半高掩体的中坦车体时仍能命中（方向判据把"贴掩体"误判为"骑掩体"） — 已解决 (2026-08-10)

### 归档自 `ISSUES.md` #10

#### 用户描述
> 射击紧贴着半高掩体的中坦时，仍能命中车体。

#### 可复现证据（Node 脚本复现，场景见下）
- 半高掩体 `(470,300)` w=80（x∈[430,510]）；中坦（hullLen=64, hullWid=38, heightClass=medium）贴掩体右侧停放（`resolveCoverCollisions` 推出后中心 x=542，车体后缘 x=510 恰好与掩体出口重合）；射手 `(70,300)` 沿 x 轴直射。
- `raycastTank`：车体 rear 面命中 `t=440 (510,300)`；`findCoversOnPath` 给出掩体 `distA=360, distExit=440`。
- `getExposure(..., cutoffDist=bh.t=440)`：`js/tank_cover.js:235` 的 `if(cutoffDist !== undefined && h.distExit >= cutoffDist) continue;` → `440 >= 440` 成立 → **掩体被跳过** → 中坦车体 exposure=1.0（应为 0.0，即 100% 格挡）；重坦同场景 exposure=1.0（应为 0.25）。
- 调用方把"命中车体的距离"作为 cutoffDist：`tank_mvp.html:588`（瞄准解算）、`tank_mvp.html:805`（炮弹命中时刻判定）、`tank_mvp.html:737/742`（部位回退）。

#### 根因
方向判据（掩体须在命中车体前被完整穿过）用严格 `distExit >= cutoffDist` 判定，无任何容差。坦克贴掩体时"掩体出口 == 车体命中点"（`distExit == cutoffDist`），被误判成"骑上/包住掩体"（本该是 `distExit` 明显大于 `cutoffDist` 的情形），导致掩体不参与遮挡、车体直接吃弹。

#### 修复
`js/tank_cover.js` 的 `getExposure` 中引入常量 `COVER_DIRECTION_TOLERANCE = 16`，将方向判据修改为 `if(cutoffDist !== undefined && h.distExit >= cutoffDist + COVER_DIRECTION_TOLERANCE) continue;`。16px 容差覆盖了坦克贴掩体时因 OBB 边缘重合带来的边缘浮点与深度切削，使中坦/重坦贴掩体时的车体掩体遮挡正常生效（中坦 0.0、重坦 0.25），同时维持了"骑在掩体上"（target 在掩体内部）的 exposure=1.0 不受干扰。在 Node 端对中坦/重坦贴掩体 8 个旋转朝向做了全覆盖测试，全部通过。

---

## #11 设计器炮塔自身旋转中心仍无法"自由设置"且 axis 落盘 round-trip 漂移 — 已解决 (2026-08-10)

### 归档自 `ISSUES.md` #11

#### 用户描述
> 设计器中，炮塔自身的旋转中心仍然不能自由设置。

#### 可复现证据
- **axis 数值输入无视觉效果**：`tank_designer.html:826-834` 的 `t-axisDx`/`t-axisDy` 输入只写 `state.turret.axis` 并 `render()`；而渲染路径 `tank_designer.html:1370`（`drawPolygon(state.turret, tc, …)`，tc=车体中心+`pivot`）**从不读取 `state.turret.axis`** → 改了输入画面上的炮塔/旋转中心纹丝不动。
- **axis 落盘 round-trip 漂移**：导出 `tank_designer.html:1541` 写原始 axis；导入 `tank_designer.html:1593` 按 `-axis` 平移全部顶点。Node 复现：把 axis 设为 `(6,0)` 后每存→载一轮，炮塔几何整体再平移 -6（半形 x 跨 `[-18..30]→[-24..24]→[-30..18]→[-36..12]`），永不稳定。
- **旋转中心只能沿中轴线移动**：`pivot` 模式拖拽 `tank_designer.html:507-510` 与『炮塔』模式平移多边形 `tank_designer.html:519` 都把 dy 锁 0（模式提示 `tank_designer.html:719` 自述"只能在车体中轴线上…dy 固定为 0"）；可编辑旋转中心仅限 dx。

#### 根因
`#9` 修复（ARCHIVE.md 5）为 `axis` 加了输入框与导出，但只打通了"存取"，没打通"几何语义"：设计器内部始终以"局部原点=旋转轴"编辑（顶点已被 `-axis` 归一化），`axis` 值对画布是死数据；又因导出/导入都按原始 axis 处理，形成每轮 -axis 的累积漂移。`#1` 修复原约定"导出恒写 axis=(0,0)"被 `#9` 破坏，round-trip 不变量失效。

#### 修复
1. 移除 `tank_designer.html` 侧边栏中无几何响应、易引发误导的 `t-axisDx`/`t-axisDy` 独立数字输入组件。
2. 恢复 `#1` 修复确立的"旋转轴恒为 (0,0)"归一化不变量：`buildExport()` 中的 `axis` 恒写出 `{dx: 0, dy: 0}`；`applyTankData()` 读入包含非零 `axis` 的第三方/旧 JSON 数据时，对顶点进行一次 `-axis` 偏移归一化，随后锁定 `state.turret.axis = {dx: 0, dy: 0}`。
3. 经 Node 模拟 5 轮 save/load round-trip 验证，顶点几何精度与范围 100% 恒定（零漂移）。炮塔自身旋转轴在设计器中统一由『炮塔』模式下的画布拖拽/对齐工具维护。

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

---

# 五、2026-08-13 归档自 `PLAN.md`：P-02 子条目 1~6（原文）

> 来源：`PLAN.md` 条目 P-02「模块化重构：内联大脚本下沉 + 数据去重」的子条目 1~6。
> 第 7 条（`js/tank_battledraw.js`，可选低优先）仍保留在 PLAN.md。实现结论见 `DEVELOPMENT.md` §3.6。

**方案**（研究结论，按依赖顺序分批次，每批可独立落地、独立验证）：

1. **P-03 先行**：坦克数据拆到 `tanks/` 一型一文件（见 P-03），`js/tank_listio.js` 接口以其为准。
2. **`js/tank_listio.js`**（复用 P-03 的 `/api/tanks` 端点）：统一 `fetchTankList(cb)` / `saveTankList(list, cb)`（含无服务器时下载 fallback）。当前三处重复：`tank_mvp.html:319-341`、`tank_designer.html:1693-1804`、`tank_compare.html:326-358`。
3. **`paintBarrel(ctx, cx, cy, angle, opts)` 下沉到 `tank_paint.js`**：`tank_designer.html:1084-1239`（drawDesignerBarrel）与 `tank_mvp.html:1201-1384`（drawTank 内炮管段）是同一套炮管几何参数（barrel/mantlet/jacket/evac/muzzle）的两份 ~150 行复制 → 二变一。难点：两处的坐标系约定一致（+x 朝前、%炮塔长/宽），仅端口不同。
4. **配置表下沉**：`BARREL_PRESETS` + `MANTLE_PRESETS`（`tank_designer.html:397-414`）→ 新 `js/tank_presets.js`；`FIELD_ROWS` + `MUZZLES`/`EVAC` 枚举（`tank_compare.html:109-144`）→ 新 `js/tank_schema.js`（字段架构单一来源，designer/compare 共用）。
5. **数据去重（快）**：designer `render()` 中 Z 分区常量（`tank_designer.html:1422-1428`）删除，改读 `RULES.modules.zones`（`js/tank_rules.js:136-142`，完全同值）；mvp `dbLabels`（`tank_mvp.html:892`）与 `tank_geometry.js:165-184` 的模块标签合并为集中 map。
6. **`js/tank_move.js`：`driveTank(t, dt, { turn, move })`**：合并 `tank_mvp.html:629-668` 与 `693-723` 两条完全平行的驾驶块（转向/加减速/掩体 move 系数/起火/fireMul/debuff 乘数/碰撞推出），为技术债 #3（敌方/友军 AI）铺路——AI 只出输入。

---

# 六、2026-08-13 归档自 `PLAN.md`：P-03 坦克数据拆分（原文）

**问题**：`tank_list.json` 聚合全部坦克，任何设计器保存/删除都会整体重写；多人/多分支编辑冲突面大；未来"节点内可拾取/敌方池"等按型引用需拆文件。

**方案**：拆分 `tanks/` 目录 = 每辆坦克一个 JSON 文件：
- 文件：`tanks/<id>.json`，内容为现在的单个条目（`tank_list.json` 中某 key 的值，不含外层包裹）；`id` 与文件名一致（含空格等合法字符保留，URL 编码传输；若未来 id 出现 `/` 再约定净化规则）。
- server（`server.js`）新增：
  - `GET /api/tanks` → 遍历 `tanks/*.json` 聚合为 `{ id → spec }`（文件名排序，确定性输出；暂不引入 `tanks/index.json` 有序清单，如需要再议）。
  - `POST /api/tanks/<id>` → 写单个文件（原子写：先写临时文件再改名）。
  - `DELETE /api/tanks/<id>` → 删除单个文件。
  - 迁移完成后移除旧 `POST /api/tank_list` 与根目录 `tank_list.json`（或保留 `GET /tank_list.json` 兼容另议——倾向不保留，三个原型一次性切换）。
- 原型改动（与 P-02#2 联动，`js/tank_listio.js` 统一）：
  - mvp：`loadTankList` → `fetch('api/tanks')`；
  - designer：`fetchTankList`/`saveToTankList`/删除 → 对应端点；无服务器降级下载改为下载 `tanks/<id>.json`；
  - compare：`load`/`save` 同上。
- 迁移工具：`scripts/split-tank-list.js`（读旧 `tank_list.json` → 写入 `tanks/*.json`；保留仓库作维护工具）。
- 校验：新增 Node 测试（纳入 `npm run test`）：遍历 `tanks/*.json` 验证 JSON 合法、`id===文件名`、几何 half/full round-trip（`buildFullVerts`/`halfFromFull`）、必填字段齐全；`npm run check` 保持全绿。

**决策清单**（已全部完成）：
- [x] 文件名直接 = id（空格保留）
- [x] 聚合排序：文件名字母序（确定性）
- [x] 不保留 `tank_list.json` 兼容路径（一次性迁移）
- [x] 实现 server API + 迁移脚本
- [x] 三个原型切换到 `/api/tanks`
- [x] 文档（AGENTS.md §4/§3.1/§3.2/§3.3、DEVELOPMENT.md）同步

**验证路径**：迁移后 `npm run test` + `npm run check` 全绿；dev server 下三个原型全流程（载入列表、替换坦克、designer 保存/删除回写、compare 保存）。

---

### [2026-08-10] 归档自 ISSUES.md #9

### #9. tank_mvp.html 首次加载玩家坦克未从 tanks/ 目录正确应用

- **现象/证据**：`tanks/` 目录下文件为 `dummy.json`, `Leapard_1.json`, `new_tank.json`, `Obj 780.json`, `tiger-I.json`，无 `T-90M1`。但在 `tank_mvp.html` 中：
  - L293: `if(selId==='playerTankSelect') sel.value = 'T-90M1' in tankListData ? 'T-90M1' : keys[0];`
  - L329: `if (tankListData["T-90M1"]) applyPlayerTank('T-90M1');`
  由于 `T-90M1` 不存在，导致下拉选框及首次自动加载未能应用来自 `tanks/` 目录的任何实际玩家坦克配置。
- **修复方案**：将玩家默认回退配置切换为列表中优先存在的合法配置（例如 preferred `'Obj 780'` 或列表首项 `keys[0]`），确保首次加载时应用真实的 `tanks/` 配置。

---

### [2026-08-10] 修复记录：半高掩体改为纯垂直剖面模型（弹道实时判定）

> 来源：用户复审 ISSUES.md #10（已归档 2026-08-10）后复测：紧贴半高掩体的中坦车体仍可被命中；并明确模型口径——"弹道是实时计算的，无需考虑宽度问题，仅在垂直剖面考虑炮弹是命中了半高掩体、车体（重坦）还是炮塔"。

**更正：原 #10 归档（16px 方向判据容差方案）并非完整修复。** 16px 容差只补上了方向判据的贴掩体边缘误判；真实漏判还有两个根因：

1. **MVP 到达帧取点错误**：炮弹循环逐帧用炮弹**当前**位置 (sx,sy) 求 `getExposure`——弹丸飞过掩体后，射线起点已在掩体另一侧，射线不再与掩体相交 → `findCoversOnPath` 永空 → exposure 恒 1，半高掩体从不拦截。
2. **旧 3 规则模型的距离压制在贴掩体场景歧义**：`distB` 取"目标到掩体入口"在贴掩体时可与攻击方距离比较得出错误压制方向。

**新模型（2026-08-10 实施，见 DEVELOPMENT.md §2.5）**：

- `getExposure`（`js/tank_cover.js`）删去规则2 距离压制，只保留垂直剖面分类：炮塔（zMin≥1.2）恒 100% 露出；车体中坦 0% 露出 / 重坦 25%（`RULES.coverRules`）；方向判据 + 16px 贴掩体容差保留（防骑掩体误遮蔽）。
- **实弹在掩体入口即时判决**（`tank_mvp.html` `shellVerticalDecision`）：沿"弹道起点 (fx,fy) → 前方"整条射线按 `hitPref` 解析会命中的部位；穿越 `graduated` 掩体的那一帧按曝光概率拦截于掩体入口（中坦 100% / 重坦 75%）；打炮塔则直接越过。通过者到达时按判决部位直接命中（`s.dec`，不二次掷骰）。
- 弹道起点 (fx,fy) 在开火与每次跳弹/反射（barricade / 坦克）时重置，判决随弹道段重算。
- **回退机制移除**：删除"首选部位全遮蔽 → 回退打另一部位"（`updateSolution` 与实弹同源）——被挡即被拦截，引导玩家改打炮塔。
- 测试同步：`scripts/test-covers.js` 删 5d 距离压制用例；新增 Windows 临时验证 `test-mvp-flow.js`（复刻 MVP 逐帧飞行）确认：中坦贴掩体 100% 拦截于入口 x=430、0 车体/炮塔命中；auto/turret-pref 100% 越掩体打炮塔；重坦 25% 击穿；无掩体时不受影响；射手贴掩体（x=400）仍正确拦截。
- 验证：`npm run check`（17 模块全绿）+ `scripts/test-covers.js` + `scripts/test-hitpart.js` 全绿。

---

### [2026-08-10] 归档自 ISSUES.md #13

### #13 设计器"炮塔自身旋转中心"（turret.axis）自由设置缺工具 — 已解决

- **用户报告**：设计器中不能调整炮塔绕自身的旋转中心（复测 #11）。
- **根因**：早期提交 `7e0c739` 的 `t-axisDx`/`t-axisDy` 输入只写 state、渲染路径从不读 `axis`（无几何效果、误导）；`ARCHIVE.md` #11 修复（删输入+导出恒 0 归一化）矫枉过正——画布只剩沿车体中轴线的平移，dy 恒 0，无法把旋转中心自由设置到多边形内任意点。
- **修复（工作副本已含，验证通过）**：恢复侧栏 `t-axisDx`/`t-axisDy` 双向输入（`syncAxisInputs()`）；『炮塔』模式拖拽改 **dx/dy 双向**自由滑移（`turretDrawCenter()` = 座圈圆心 − axis，座圈不动、几何随光标滑移，绘制/命中/提示环全部以 tdc 为原点）；`buildExport` 写真实 axis、`applyTankData` 原样导入（不做 -axis 平移）→ round-trip 零漂移；「炮塔自身居中对齐」直接设置 `axis={bbox中心}`（`axisDevReadout` = axis 与 bbox 中心甩尾距离）。
- **验证**：`verify-axis-rt.js` 5 轮存/载逐顶点一致（axis=(6,-3) 存取逐位不变、axis 世界点精确落在 pivot）；`npm run check` + `test-covers.js` + `test-hitpart.js` 全绿；MVP 经 `applyTankConfig` 按 -axis 归一化渲染一致。
- **结论**：`#11` 归档（2026-08-10）的"删输入 + 导出恒 0 归一化"方案已被本实现取代（真实 axis 存取 + 双向自由编辑）。

---

### [2026-08-10] 归档自 ISSUES.md #12

### #12 两辆坦克交叉碰撞时"鬼畜"抖动（MTV 轴歧义 + 幽灵穿模 + 速度模型破坏） — 已解决

> 核实时间：2026-08-10。已用 Node 模拟复现（垂直交叉/对向互顶两种场景）。

**复现场景**：`tank_mvp.html` 中玩家与靶车（或任何两辆存活坦克）垂直交叉相遇、车头对顶推进时，接触点周围坦克以约 60Hz 频率被交替朝不同方向弹飞抖动（"鬼畜"）。模拟复现：垂直交叉 300 帧内 **MTV 推出轴翻转 31 次**、**幽灵穿模 16 帧**（x 向深叠 >20px 但 SAT 判定不碰撞）、单帧推出幅度 ±30~42px 来回跳（f=62 推 -32.4 → f=64 推 +42.6），速度被抽干至 0~5 后又被 driveTank 加速回 192，形成速度 0↔192 高频振荡。

**代码位置**：`js/tank_entity.js:59-123`（`resolveTankCollisions`）。该段含速度阻尼/冲量的逻辑由 commit `7e0c739`（"fix tank collision jitter"）引入，属**修复引入的回归**——ARCHIVE.md 中"已消除鬼畜"的记录针对的是更早的纯推出版本，当前实现并未兑现。

**根因**（三个叠加）：

1. **MTV 最小深度轴歧义**（`js/tank_entity.js:68-83` + `js/tank_cover.js:139-163` `obbMTV`）：重叠较深/近方形时两轴投影深度接近，每帧 `minDepth` 取到的轴在两轴间反复横跳（交叉场景实测 31 次/300 帧），推出向量方向每帧剧烈翻转 → 抖动直接来源。
2. **幽灵穿模**（`js/tank_entity.js:78` `separation = depth + 0.1`）：沿 MTV 推出多加 0.1px buffer，任何一轴分离后 SAT 判定整体"不再碰撞"（`obbMTV` 返回 null），另一轴即使深叠 50px 也不处理 → 坦克贴着 0.1px 间隙直接对穿（实测对向互顶两车互换位置后继续全速行驶）。交叉时 MTV 优先推较窄轴（宽度轴），y 先分离后 x 深叠任意穿。
3. **速度模型被破坏**（`js/tank_entity.js:85-116`）：`t.speed` 是标量，但阻尼逻辑按"速度矢量"运算后经 `Math.hypot(newA_X,newA_Y)` 还原，再乘 `*0.7`（冲量 `normalVel*0.5` 之后又砍 30%，且横向切向分量也被误砍）；速度方向与 `hullAngle` 不一致时下一帧 `driveTank`（`js/tank_move.js:43-44`）沿 hullAngle 重建速度 → 能量注入方向错误；else 分支（`js/tank_entity.js:113-116`）只要重叠就每帧 `speed *= 0.8`（即使正在分离），配合 4 次迭代每帧最多砍 4 次 → 速度 0↔192 抖动。另有 `*0.7` 后的符号判定 `velA·newA > 0`（`js/tank_entity.js:104`）在速度接近 0 时对数值噪声极敏感，前后反复抽搐。

**影响**：坦克接触手感极差（战场核心交互）；玩家被"弹开/穿模"误导走位；两车可重叠卡死（实测交叉后末尾 xOverlap=63.8 仍互相叠住）。

**修复方向（建议）**：碰撞角点共线冲突时稳定选取"接近冲量方向"的轴（或用各轴深度 * 相对速度投影加权）；分离 buffer 改为仅沿"深叠轴"施加或不再依赖单轴分离即判不碰撞（如保留最小穿深分离）；速度阻尼改为纯法向分量衰减、保留切向滑动，避免 `Math.hypot` 破坏方向并去掉 `*0.7`/`*0.8` 的双重砍速（切向不砍）。

---

### [2026-08-10] 修复记录：坦克⇄坦克碰撞解析重写（稳定选轴 + 标量冲量）

> 对应 `ARCHIVE.md` #12（已归档 2026-08-10，结论以 DEVELOPMENT.md §3「坦克间碰撞」为准）。

**新模型**（`js/tank_entity.js` `resolveTankCollisions` / `js/tank_cover.js` `obbMTVs`）：

1. **稳定选轴**：`obbMTVs` 返回全部候选 MTV；近最小深度轴（`depth ≤ minDepth*1.15`）内优先取"最抵消逼近运动"的轴（相对速度在轴上的投影为负、且抵消比最大），相对速度接近 0 时回退最小深度轴。交叉/对顶轴不再逐帧横跳（300 帧测试 0 次翻转）。
2. **标量冲量**：取消矢量运算 + `Math.hypot` 方向还原；法向闭合速度每次减半（完全非弹性，冲量系数 0.5），标量速度经**投影重建**到各自车体轴（受撞车的侧向冲量换向到自身 hullAngle，抵除上面再开车能被动"甩出"方向正确的 bug），切向速度不砍（保留滑动）。
3. **分离缓冲**：0.1px buffer 仅加在"实际求解的推出轴上"（冲量分支适用的分离），不再"单轴分离即判整体不碰撞"——新版收集全部候选 MTV，缓冲导致的分离不再掩盖另一轴的深叠（幽灵对穿消除）。
4. 拦截后 `speed *= 0` 只对仍在闭合的轴发生（`updateSpeedInvariant`），对向互顶静止；全部摩擦砍速（`*0.8`）删除。

**验证**（`scripts/test-tankcollision.js`，已挂入 `npm test`）：

- 垂直交叉对撞：穿透深度 0.00px，300 帧轴翻转 0 次，速度全程平滑 ≤ cap 192，无 0↔192 振荡，无残余重叠。
- 对向互顶：静止不抽搐（速度 0→(-1) 微漂→稳定 0），位置锁定。
- 推挤：被顶车沿自身车体轴获得动量（x−0.77/-y−63.05/-x 三方向均符合预期），法向传递系数 ~1。
- 快速穿插（200 帧 640px/s）：永不穿模、无幽灵帧，推出方向始终背离穿透方向。
- `npm run check`（19 模块 + HTML 全绿）+ `npm test` 4 文件全绿（含本次新增 `test-tankcollision.js`）。

---

# 四、2026-08-11 归档自 `PLAN.md`（P-01 命中部位意图，原文）

### P-01 命中部位由鼠标径向意图决定（打炮塔 / 打车体）

**问题**：命中车体还是炮塔由 `bestTankHit`（炮塔恒优先）+ 散布落弹方位共同决定，玩家无法用输入影响，体感"完全随机"。

**方案**（已定稿）：开火瞬间沿"无散布瞄准线"把鼠标投影到炮口距离上，与目标最近碰撞距离比较：
- `鼠标投影 > 目标碰撞距离 + partProbe` → 打**炮塔**（上部）；
- `鼠标投影 < 目标碰撞距离 - partProbe` → 打**车体**；
- 处于死区内 → `auto`（保持现状：炮塔优先，兼容 `ARCHIVE.md #2` 修复）。
- 掩体：垂直剖面单一判定（2026-08-10 修订，取代原"首选部位全遮蔽才回退"决策）——所选部位被半高掩体拦就是被拦截，不回退改打另一部位；引导玩家改打炮塔（详见 `DEVELOPMENT.md` §2.5）。
- 预测面板 `updateSolution` 用**同源逻辑**显示"本次将命中部位"，与实弹判定一致。

**改动**：
1. `js/tank_rules.js` → 新增 `RULES.aim = { partProbe: 12 }`（死区 px）。
2. `js/tank_geometry.js` → 新增 `aimPartPreference(...)`（纯投影判定，返回 `'turret'|'hull'|'auto'`）与 `bestHitForPref(hits,minT,maxT,pref)`（按偏好取部位命中）；`bestTankHit` 保留不动。
3. `tank_mvp.html` → `tryFire` 预算并写 `shell.hitPref`；炮弹循环改用 `bestHitForPref` + 掩体回退；`updateSolution` 同源预览。
4. 测试：新增 `scripts/test-hitpart.js`（Node 覆盖两函数与死区边界），`package.json` `test` 脚本跑两个测试文件。

**玩法价值**：炮塔正面 140 > 车体正面 110——打炮塔=穿透难但拆炮手/装填手/弹药架（debuff/殉爆）；打车体=穿透易但打引擎/驾驶员/履带。

**验证路径**：`npm run test` + `npm run check` 全绿；dev server 下真机手感标定 `partProbe`。

**决策清单**：
- [x] 交互：仅鼠标位置（不加快捷键位）
- [x] 反馈：仅预测面板（`solPart`），不画画面标记
- [x] 掩体：垂直剖面单一判定（2026-08-10 修订，见上方方案说明）
- [x] 实现 + 测试（全绿）
- [x] `partProbe=12` 体感标定（可调）

**上次完成批次**（2026-08-13，命中意图 + 掩体回退逻辑实现与 Node 测试）见 `DEVELOPMENT.md` §3.6 / §3.7 与 `ARCHIVE.md`。

---

# 八、2026-08-11 归档自 `PLAN.md`：P-02（第 7 条 battledraw，P-02 完结，原文）

### P-02 模块化重构：内联大脚本下沉 + 数据去重

**背景**：`tank_mvp.html`（内联 ~1300 行）与 `tank_designer.html`（内联 ~1500 行）各自持有可共享的实现；`tank_list.json` I/O 逻辑在三个原型里重复三份；若干配置数据与 `RULES` 重复。

**状态**：子条目 1~6 已完成（P-03 先行拆分 / listio / paintBarrel / 配置表下沉 / 数据去重 / tank_move），见 `DEVELOPMENT.md` §3.6 与 `ARCHIVE.md`。剩余第 7 条（可选）：

7. **`js/tank_battledraw.js`**（可选，低优先）：mvp 战斗场景绘制层（`drawTank`/`drawBrokenTracks`/`drawCharredHull`/`drawFireGlow`/`drawShells`/`drawCover`/`drawFoliage`/`drawClassBadge`，~400 行）仿 `tank_fx.js` 先例 ctx 显式传参下沉。测试台专用块（`drawRange`/`addRangeShot`/`AMMO_KEYS`/`RANGE_*`）留在 mvp 不拆。

**验证路径**：每批 `npm run check` + `npm run test` 全绿；dev server 手动过一遍三个原型（加载/切换坦克、设计器保存回写、对比页编辑保存）。

**完结结论**：第 7 条已实现并验证（`npm run check` + `npm test` 全绿；Playwright 真机确认坦克/掩体正常渲染、无控制台错误）；实现细节见 `DEVELOPMENT.md` §3.6。


---

# 九、2026-08-11 归档自 `ISSUES.md`（#14/#15 修复，原文）

### #14 履带相位 trackPhase 恒为 NaN，履带滚动动画失效（2026-08-11 战前代码审查确认）
- **证据**：`js/tank_move.js:47` 调用 `advanceTracks(t, Math.hypot(t.x-p0x, t.y-p0y))`，而 `js/tank_entity.js:32` 的签名为 `advanceTracks(t, dx, dy, dAngle)` —— dy/dAngle 为 `undefined`，`Math.hypot(dist, undefined)` 返回 `NaN` → `t.trackPhase = NaN`。Node 复现：`driveTank` 一次 move 后 `trackPhase` 即 NaN；`tank_move.js` 中记录的 `p0a`（hullAngle 旧值）从未被使用，本意即传角度差。
- **影响**：`js/tank_battledraw.js:20/61` 以 `t.trackPhase||0` 兜底 → 履带纹路相位恒为 0，**滚动动画失效**（视觉回归，不崩溃）；未来任何直接消费 phase 的代码会扩散 NaN。

### #15 移动散布源失效：`updateSigma` 未传 keys（2026-08-11 战前代码审查确认）
- **证据**：`tank_mvp.html:662` 调用 `updateSigma(player, dt)` 未传第三个参数 `keys`；`js/tank_model.js:271` 的 `if(t.id==='player' && keys)` 分支因 `keys === undefined` 恒不成立 → `speed = 0` → `sMove = 0`。Node 复现：`motionSigma(t, dt, {w:true})` 与 `motionSigma(t, dt, undefined)` 返回值完全相同。
- **影响**：三扩系统中**移动源（`moveMax`，全速 0.014 rad）永不生效**，仅车体转向/炮塔转向两源生效；与 DEVELOPMENT.md §3「受移动速度、车体转速、炮塔转速、乘员受伤四源驱动」不符——玩家按住 W 直线行驶时散布不扩大。

**修复记录（2026-08-11）**：
- #14：`js/tank_move.js:48` 改传 `advanceTracks(t, t.x-p0x, t.y-p0y, t.hullAngle-p0a)`；`types/globals.d.ts` 同步声明 `advanceTracks(t, dx, dy, dAngle)`；新增 `test-tankcollision.js` 测试 5（履带相位有限且随行驶/转向累积）。
- #15：`tank_mvp.html:662` 改 `updateSigma(player, dt, keys)`；新增 `test-tankcollision.js` 测试 6（传 keys：sigma=base+moveMax；不传：sigma=base）。
- 验证：`npm run check` + `npm test` 全绿。结论已同步 `DEVELOPMENT.md` §3（坦克运动统一 / 扩圈缩圈系统）、§5.3（履带转动动画已实现）、§6.2（标记完成）。


---

# 十、2026-08-12 归档自 `ISSUES.md`（#16，原文）
### #16 设计器渲染函数引用未声明的 `ay`，炮塔模式/载入坦克时 `ReferenceError: ay is not defined` — 已解决（2026-08-12）
- **用户报告**：在 `tank_designer.html` 载入 `tanks/` 列表中的坦克时控制台报错「ay 没有定义」。
- **证据**：`tank_designer.html:1553` `render()` 内 `const offLocal = Math.hypot(oc.cx - ax, oc.cy - ay)` 引用了 `ay`，但该函数从未声明它——第 1527 行只声明了 `ax`（`(state.turret.axis && state.turret.axis.dx) || 0`），轴点 y 在 `turretToScreen([ax, 0], ...)` 处被硬编码为 0。
- **复现**：处于「炮塔」编辑模式时触发 `render()` 即抛错（载入坦克 → `applyTankData()` → `render()`，或加载后切换到炮塔模式）。与具体坦克数据无关；`npm run check` 只做语法冒烟，检测不到自由变量引用，故全绿掩盖了此缺陷。
- **修复（2026-08-12）**：`tank_designer.html:1527` 处补充声明 `const ay = (state.turret.axis && state.turret.axis.dy) || 0;`，与 `ax` 对称、带缺省兜底（载入无 `turret.axis` 的旧坦克条目如 dummy/Leapard_1 也安全）。
- **验证**：`npm run check`（含 tsc typecheck）全绿；Node 侧 `applyTankConfig` 对 5 个坦克文件全量通过；炮塔模式渲染路径不再有未声明标识符。


---

# 十一、2026-08-13 归档自 `ISSUES.md`（#17，原文）

### #17 实弹直击路径未按意图选部位：打炮塔意图被逐帧窗口截胡（高刷屏/慢弹速时命中车体） → 已解决（2026-08-13）
- **用户报告**：按鼠标位置选择命中部位（车体/炮塔）再次变难——预测面板显示「炮塔」但实际命中车体。
- **证据**：`tank_mvp.html:588`（预测面板）与 `:728`（半高掩体判决）用整条射线窗口 `bestHitForPref(hits, 0.001, Infinity, pref)`，而实弹直击路径 `:754` 用逐帧步长窗口 `bestHitForPref(hits, 0.001, step, s.hitPref)`（`step = s.speed*dt`，`tank_mvp.html:742`）。浏览器内实测（`raycastTank` 正对入射，真实坦克配置）：车体面与炮塔面沿射线间距约 10.75~17.3px；60Hz 时 `step≈20px` 勉强覆盖，120Hz≈10px、144Hz≈8.3px 及慢弹速（600px/s→10px）时炮塔候选被窗口滤掉，`bestHitForPref` 无炮塔候选时退回最近命中=车体（`js/tank_geometry.js:140-142`）→ 意图打炮塔实际命中车体，而面板仍显示炮塔（帧率相关的概率性行为，解释「再次变难」）。
- **根因**：面板/掩体判决与实弹直击路径的窗口口径不一致；直击路径保留了旧的逐帧物理窗口语义。
- **修复（2026-08-13）**：`js/tank_geometry.js` 新增 `shellPartHit(hits, step, pref)`——先探测本帧是否与目标相触（任一部位进入 (0.001, step]），相触后 `pref='turret'/'hull'` 沿整条射线（Infinity）按意图选部位（与面板/掩体判决同源）；`'auto'` 保持旧逐帧窗口行为（已定型决策：死区正对仍可能命中车体，与面板死区显示差异为已知行为）。`tank_mvp.html:754` 直击路径改用 `shellPartHit(hits, step, s.hitPref)`；`types/globals.d.ts` 同步声明；`scripts/test-hitpart.js` 补窗口回归用例（10 条）。
- **验证**：`node scripts/test-hitpart.js` + `npm run check` 全绿；Playwright 端到端（慢弹速 600px/s，step≈10px < gap 10.75，正对入射、炮塔对齐 0°、弹道无遮挡）：炮塔意图→命中 炮手（炮塔模块，旧逻辑必为车体）、车体意图→命中 驾驶员（车体模块）、死区 auto→命中 驾驶员（保持旧行为）。


---

# 十二、2026-08-13 归档自 `DEVELOPMENT.md`（历史整理，原文）

> 本次整理把 DEVELOPMENT.md 中「已过时 / 后续开发不再需要」的历史信息移入本文件。
> 对应结论已保留在 DEVELOPMENT.md（§1/§2/§3/§4/§6），本段仅为历史追溯，不参与设计判定。

---

### A. §1 与 §2.4：被新设计推翻的旧决策（对应结论保留于 DEVELOPMENT.md §1「项目定型」与 §2.4「经济系统」）

#### §1（原文）「曾定为无限波次」纠偏

**类型**：节点式地图推进 + 局内得分驱动构筑 的战术坦克 Roguelike（俯视角 2D）。
~~曾定为"无限波次刷怪"~~ — 已推翻：无限波次的数值膨胀式压力和"慢节奏、拼角度"的战斗立意冲突，改为**节点式地图**，每个节点是一块独立的、有限范围的战场，难度随节点在地图中的推进程度随机生成，模拟真实战场"层层推进"的感觉。

#### §2.4（原文）卡牌获取节奏旧规则

- ~~卡牌获取节奏：局内得分达到节点阈值 → 三选一~~ — 已被"节点间开放三选一"取代，不再依赖战斗中的得分阈值触发。

---

### B. §2.8 已明确排除 / 延后的机制（整节原文；对应结论保留于 DEVELOPMENT.md §2.1/§2.5 与 §2.8 保留行）

### 2.8 已明确排除 / 延后的机制

- ~~无限波次~~：已推翻，改为节点式地图（见 2.1）。
- ~~低矮掩体~~：已移除，只保留半高/全高两档。
- ~~1/2/0 部位锁定~~：已移除。**该按键位预留给后续"弹种切换"**（AP/APCR/HE 等），非部位锁定。
- ~~"友军防线"作为敌人回避区域~~：已废弃，改为固定位置的密集掩体点，双方都可利用，不是敌人主动回避的区域。
- ~~3D 顶点装甲模型（首上/首下/炮盾上下）~~：已实现过完整版本（含 Newell 法线、等效厚度、画中画命中演示），后判定为"对 Roguelike 过于复杂——玩家无法操控俯仰角，Z 轴搜索变成黑箱计算"，**已整体回退**为纯 2D 单厚度装甲（front/side/rear 各一个数）。3D 模型代码不建议复用，如未来要做"特殊 Boss 专属弱点"之类的差异化机制，应作为独立特例实现，不作为全体坦克的标配系统。

---

### C. §3 修复历史与过时注记（对应结论保留于 DEVELOPMENT.md §2.5/§3 各当前行为条目与 §5.5 数值表）

#### C-1. §3「移动/转向」过时数值注记（原文）

> 旧文档 "×30 / ×2.2" 为过时数值，2026-08-11 审查时以 `RULES.speed` 为准更正。

#### C-2. §3「坦克间碰撞」标题中的 ISSUES #12 标注（原文摘录）

> （2026-08-10 重写，ISSUES #12 修复）

（#12 的完整核实与修复记录见上文「#12 两辆坦克交叉碰撞时"鬼畜"抖动」与「修复记录：坦克⇄坦克碰撞解析重写（稳定选轴 + 标量冲量）」。）

#### C-3. §3「瞄准线」旧截停高亮线移除注记（原文）

> （旧条目中的 `firstObstructionPoint` 截停高亮线已随 P-01/P-02 重构移除，2026-08-11 审查确认）

#### C-4. §3「掩体遮挡」根因更正段（原文）

> 根因更正：原 #10 的 16px 容差方案并未解决 MVP 漏判——炮弹循环在到达帧用逐帧近端位置求 exposure，炮弹飞过掩体后射线不再穿掩体导致永不自检；新模型在掩体入口处整条弹道判定解决之（见 `ARCHIVE.md` 2026-08-10 修复记录）。

#### C-5. §3「双座圈圆心」ISSUES #16 修复记录（原文）

> **2026-08-12 修复（ISSUES #16）**：`render()` 内「炮塔自身中心」甩尾距离读数 `Math.hypot(oc.cx - ax, oc.cy - ay)` 引用了从未声明的 `ay`（轴点 y 在 `turretToScreen([ax, 0], ...)` 处硬编码 0），处于炮塔模式（含该模式下载入 `tanks/` 条目触发 `render()`）时抛 `ReferenceError: ay is not defined`——已补 `const ay = (state.turret.axis && state.turret.axis.dy) || 0`（与 `ax` 对称、缺省兜底，无 `turret.axis` 的旧条目也安全）；`npm run check`（含 tsc）全绿。

（#16 的完整核实与修复记录见上文「# 十、2026-08-12 归档自 `ISSUES.md`（#16，原文）」。）

#### C-6. §3「坦克碰撞（Jitter 鬼畜消除，ISSUES #12 重写结论）」整条（原文）

> **坦克碰撞（Jitter 鬼畜消除，ISSUES #12 重写结论）**：~~`resolveTankCollisions` 的 OBB MTV 推开逻辑经过了数学上的精准推开向量化重构，对碰撞法向速度进行了投影摩擦阻尼计算。两车对撞、推挤时能够极其平滑地阻隔并滑行，彻底消除了极速前后高频振荡、卡入和"鬼畜"的问题。~~ **旧实现（7e0c739 引入）实际是回归**：MTV 最小深度轴在近方形重叠时逐帧横跳、推出方向与 u 约定相反导致深叠、0.1px 缓冲造成"单轴分离即判不碰撞"的横向幽灵对穿、`Math.hypot`+`×0.7`/`×0.8` 双砍速搞出速度 0↔max 高频振荡（2026-08-10 已重写，详见上文「坦克间碰撞」条目与 `ARCHIVE.md` #12 修复记录）。

#### C-7. §3「扩圈/缩圈系统」ISSUES #15 修复记录（原文）

> **2026-08-11 修复（ISSUES #15）**：移动源（`moveMax`）此前因 MVP 调用 `updateSigma(player, dt)` 未传 `keys` 而恒为 0——已改 `updateSigma(player, dt, keys)`，四源全部生效；已补 `test-tankcollision.js` 回归测试（传 keys 时 sigma = base+moveMax，不传时 = base）。

（#15 的完整核实与修复记录见上文「# 九、2026-08-11 归档自 `ISSUES.md`（#14/#15 修复，原文）」。）

#### C-8. §3「模块伤害」历史比较注记（原文摘录）

> 乘员（炮手/装填手/驾驶员/车长对应 debuff，8s，惩罚较早期版本调轻）

#### C-9. §3.6「共享几何收口」distanceTier 移除细节（原文）

> （2026-08-08 已随 A1 双档模型整体移除，含 `tank_rules.js`/`tank_cover.js`/`test-covers.js` 全部引用与导出）

#### C-10. §3.6「Web 页面加载顺序」历史对比（原文）

> **哪些 Web 页面加载哪些模块**（设计师此前不加载 `tank_utils.js`，现在三个页面都加载同一组共享模块，顺序统一为 `rules → utils → geometry → halfgeom → model` 等）。

#### C-11. §3.6「坦克运动统一」ISSUES #14 修复记录（原文）

> **2026-08-11 修复（ISSUES #14）**：`advanceTracks(t, Math.hypot(...))` 参数错位（签名 `(t, dx, dy, dAngle)`）致 `trackPhase=NaN`、履带滚动动画失效——改传 `advanceTracks(t, t.x-p0x, t.y-p0y, t.hullAngle-p0a)`（`p0a` 位移前的车体角），已补 `test-tankcollision.js` 回归测试（履带相位有限且随行驶/转向累积）。

（#14 的完整核实与修复记录见上文「# 九、2026-08-11 归档自 `ISSUES.md`（#14/#15 修复，原文）」。）

#### C-12. §3.6「战斗场景绘制层下沉」顺带修复（原文）

> 顺带修复：`tank_fx.js:87-89` 用 `p[0]`/`p[1]` 取 `turretPivot(t)` 坐标，而运行时返回值实为 `{x, y}` 对象（`p[0]===undefined`）→ 弹药架殉爆的"炮塔掀飞"以 NaN 坐标生成、不可见；已改 `p.x`/`p.y`。`types/globals.d.ts` 同步：`turretPivot` 声明更正为 `{x,y}`，并补齐 `polyCorners`/`turretFrontDist` 与 8 个 draw 函数声明。

#### C-13. §3.6「命中部位意图选择」ISSUES #17 修复记录（原文，证据/根因部分）

> **2026-08-13 修复（ISSUES #17）**：实弹直击路径原用「逐帧步长窗口」（`bestHitForPref(hits, 0.001, step, pref)`，`step=speed*dt`），与预测面板/半高掩体判决的「整条射线窗口」口径不一致——正对入射时车体→炮塔沿射线间距约 11~17px，高刷屏（120/144Hz）或慢弹速下 `step`（60Hz≈20px / 120Hz≈10px / 144Hz≈8.3px）小于间距，炮塔候选被窗口滤掉，意图打炮塔实际命中车体。新增 `shellPartHit(hits, step, pref)`（`js/tank_geometry.js`，P-01 同源）：先探测相触帧（任一部位进入步长窗口），再对明确意图 `turret`/`hull` 沿整条射线选部位；**`'auto'`（死区）保持逐帧窗口语义**（已定型决策：死区正对仍可能命中车体，面板死区显示炮塔的差异为已知行为，不修正）。`tank_mvp.html:754` 直击路径改用 `shellPartHit`；`test-hitpart.js` 补窗口回归用例。

（#17 的完整核实与修复记录见上文「# 十一、2026-08-13 归档自 `ISSUES.md`（#17，原文）」。）

#### C-14. §3「设计器布局」8e894aa 回归修复历史（原文）

> 8e894aa 曾误把网格改为 `360px 1fr 380px` 并将侧栏样式规则从 `#sidebar` 改名为 `#left-sidebar`/`#right-sidebar` 而未同步改名 HTML 元素，导致侧栏失去样式、内容墙铺满整页、画布被挤成左窄条；已修复并顺带完成双栏分列，「座圈中心」置于「编辑模式」之下，删除游离 `</head>`（:95）与嵌套错位的 section。

#### C-15. §5.5 数值表 shrinkRate 历史括注（原文摘录）

> （坦克级 aimSpeed 可覆盖，旧默认 0.3 过块）

---

### D. §4.7（开放问题 7）v0.2~v0.7 版本迭代进度（原文；对应结论保留于 DEVELOPMENT.md §2.9 模块系统、§3「设计器编辑列表」「逻辑模块可视化覆盖层」「双座圈圆心」「多边形坦克形状」、§6.3 甲弹对抗可选排期；§2.9 标题原历史括注「；同日 v2→v3 数据模型扁平化；同日 track 移除」一并归档于此）

- **v0.2 进度（本次会话）**：`tank_designer.html` 已从"固定矩形+四个数值输入框"升级为**任意多边形顶点编辑器**：
  - 车体/炮塔均可自由添加/拖动/删除顶点（画布交互：空白处点击加点、拖动移动、单击顶点删除、点击边线中点循环装甲面类型 front/side/rear）。
  - 新增**炮塔旋转中心（pivot）**可视化设置（`tank_designer.html`：编辑器把 `pivot` 锁在车体中轴线上、只编辑 dx；运行时 `turretPivot()` 支持完整 dx/dy，两者在 #1 修复后与 `turret.axis`（炮塔自身旋转轴）一起构成"两个独立旋转中心"）。
  - 装甲不再是车体/炮塔各一个笼统数值，而是**逐边指定 front/side/rear**，配合独立的三个厚度输入框（mm）。
  - 新增预览瞄准模式：模拟无炮塔坦克炮管在射界限制内的摆动。
  - 导出 JSON 结构与 `tank_mvp.html` 的 `hullPoly()`/`turretPoly()`/`ARMOR` 直接同构（`{verts, faces, armor}` + 炮塔 `pivot`/`axis`），**加载链路已打通**：`tank_mvp.html` 的「坦克选择」与 `tank_compare.html` 均通过 `makeTank()+applyTankConfig()`（`js/tank_model.js`）读取 `tanks/<id>.json` 条目，编辑器保存 → 写回 `tanks/<id>.json` → 原型下拉重载即可生效（见 `ARCHIVE.md` #1 的格式约定）。
  - 尚未覆盖：火控参数（穿深/伤害/装填）、几何尺寸参数（hullLen/turLen 等）与多边形顶点解耦后如何互相印证也未处理。
- **v0.3 进度（本次会话）**：
  - **镜像对称编辑**：车体/炮塔改为只编辑 y≤0 一侧（右半），另一侧由代码按中心线（y=0）自动镜像生成，杜绝手改 JSON 时两侧对不齐的问题。内部数据结构从"完整闭合多边形 verts+faces"改为"半侧 `half`/`halfFaces` + 可选的前/后接缝装甲面 `frontSeamFace`/`rearSeamFace`"，闭合多边形在渲染/导出时按需现算（`buildFullVerts`/`buildFullFacesWithFlags`）。已用 node 脚本验证：默认车体/炮塔的半侧数据镜像还原后，与原型 `hullPoly()`/`turretPoly()` 的面积和逐边装甲分类完全一致。
  - **画布缩放**：滚轮或 +/− 按钮缩放（0.3x~4x），车体中心固定为缩放基准点。
  - **顶点精确编辑**：单击顶点不再直接删除，而是选中并在侧栏显示可编辑的 X/Y 数值输入框（Y 会被钳制在 ≤0，防止越过镜像轴），删除顶点需要点击专门的"删除选中顶点"按钮，避免误操作。
  - 装甲边列表相应简化为只列出"半侧内部边 + 前/后接缝边"（数量少很多），并注明镜像侧边线自动沿用同一分类、无需单独设置。
  - 导入功能同时兼容"半侧格式"（完整还原）和"旧版完整多边形格式"（尽力反推出半侧数据，假设源数据本身左右对称）。
- **v0.4 进度（本次会话）**：~~新增**甲弹对抗测试**（新编辑模式按钮「甲弹对抗」+侧栏测试面板…）~~ — **2026-08-11 代码审查核实：该功能在 `tank_designer.html` 与 git 历史中均不存在**（无对应按钮/函数/提交），疑为未落地或随「设计器模式按钮精简」回退而文档未同步删除；如需「编辑器产出 → 判定逻辑」的轻量自测，需按下列原始方案重新实现：
  - **固定炮·测装甲**：设置穿深、命中部位（车体/炮塔战斗室）、装甲面（正/侧/后）、入射角 θ，对当前设计的装甲做**绝对精准**的单发判定并高亮命中面、画出炮位射线与命中标识。
  - **固定靶·测穿深与散布**：对一块固定厚度/入射角/半张角的钢靶执行 N 发射击，用高斯散布 σ 统计命中率、跳弹数、未击穿数、击穿数与命中击穿率，画布绘出靶板、瞄准线与散布/命中窗口锥。
  - 属于把"编辑器产出的几何/装甲"直接喂进原型判定逻辑的轻量自测工具，不依赖 `tank_mvp.html` 的加载链路。
- **v0.5 进度（本次会话）**：炮塔外形与炮管造型的快速预设——
  - **正多边形炮塔预设**：正三~正八边形一键生成（`turretRegularPreset`），以炮塔旋转中心为圆心、**外接圆半径 R**（可调 6~60px，默认 20）为尺寸参数，支持「尖角朝前 / 齐边朝前」两种朝向；应用时仅替换顶点几何（保留装甲值与旋转轴心）。两种朝向的正多边形均以车体中轴为对称轴，半形提取自动正确（已 Node 验证 3~8 边 × 2 朝向的对称性与逐边装甲分类）。
  - **炮盾 Mantlet（炮管结合部视觉件）**：新增 `barrel.mantlet = { style, pos, width }`：
    - 预设样式 7 种：`none` 无 / `single` 单层 / `double` 双层 / `collar` 环颈套筒 / `box` 盒式护罩 / `winged` 侧翼式 / `wedge` 楔形，预设下拉一键应用全套配置。
    - `pos`：炮盾中心相对炮塔前缘的轴向偏移（% 炮管长，负值=缩回炮塔内，可调 -40~+60）；`width`：相对炮塔全宽的百分比（默认 40）。
    - **纯视觉件**：不参与穿深/跳弹/命中/掩体任何判定。
  - 数据链路已打通：设计器保存时写入 `mantlet` 字段；`normalizeBarrel`（`js/tank_halfgeom.js` 与设计器内各一份）与 `tank_model.js` 的 `applyTankConfig` 均做旧数据兼容（缺省=无）；**实战斗画面 `tank_mvp.html` 同步渲染同一套炮盾**（基于 `gunRoot` 同一锚点，位置/宽度语义一致），确保设计器所见即战斗所得。
- **v0.6 进度（本次会话）**：
  - **座圈圆心可拖拽编辑**（`ARCHIVE.md` #6）：『炮塔』模式按住画布上旋转中心的十字或"炮塔自身中心"青点 **dx/dy 双向**拖动，即自由调整炮塔自身旋转中心（座圈圆心不动、炮塔多边形相对滑移，见 §3「炮塔自身旋转中心（axis）可自由编辑」）；『车体』模式拖拽十字 = 沿车体中轴线平移 pivot（dy 固定 0；「旋转中心」独立模式已随 §3 模式精简移除）。
  - **装甲厚度面板联动高亮**：选中画布边线/列表行后，面板顶部显示"当前装甲段"读数（部位·边·类型·mm），对应 mm 输入框高亮。
  - **战斗参数新增 三扩系数 / 缩圈速度**（`spreadMult` / `aimSpeed`），随条目存取，`tank_compare.html` 同步展示（`ARCHIVE.md` #5）。
  - **工具链/性能三件套（P-04，本次会话已实现）**：
    - **JSDoc + tsc 类型检查**：配置 TypeScript 类型检查（`checkJs: true`, `noEmit: true`），类型文件存于 `types/globals.d.ts`，打通了 IDE 类型提示与开发期零构建错误检测（`npm run typecheck`）。
    - **pre-commit git hooks**：挂载本地 `pre-commit` 钩子，提交前强制自检 `npm run check`。
    - **OpenCode Skill (test-runner)**：固化 `npm run check`（包含语法和类型两重防线）与 `npm test`，大幅提升 AI 与 Agent 自检效率。
    - **Canvas 性能三件套**：
      1. **离屏预渲染缓存**（`PAINT_CACHE`）：程序化坦克渲染支持在 `scale === 1` 下（实战游玩时）首帧将车体/炮塔细节栅格化至 offscreen 离屏 canvas 缓存，后续帧直接调用 `drawImage`，彻底节省了每帧昂贵的多边形和路径（Path）重建。
      2. **粒子对象池**（`PARTICLE_POOL`）：对 `tank_fx.js` 下的火焰/浓烟/碎片/火花粒子接入对象池，大幅减少特效高频创建/销毁带来的内存抖动和垃圾回收（GC）开销。
      3. **fixed timestep (120Hz)**：将 `tank_mvp.html` 的物理更新与主循环解耦，基于 fixed step 累加器保持恒定的物理模拟与碰撞更新，消除高刷/低刷屏下的速度与阻尼手感漂移。
- **v0.7 进度（本次会话）**：模块系统改为**装甲边段挂载**（见 §2.9 定型设计）——
  - 新增「模块 Modules」第 4 编辑模式（v2 起）：点击装甲边挂载（镜像感知）、点带选中、两端手柄沿边拖 len、Delete 移除、Esc 取消；「显示内部模块 Zones」复选框驱动已放置带的渲染。
  - **2026-08-12 数据模型重构（v2 分区单放置 → v3 扁平多放置）**：模块数据从 `{hull:{...}, turret:{...}}`（每模块单放置、仅半形链边）改为扁平 7 键 `{key: [ {part,x,y,len,off,mirror}, ... ]}`（`RULES.modules.keys`：driver/ammo/engine/track/gunner/loader/commander，去掉 v2 的 turretAmmo/radio）——支持**同模块多处挂载**、**沿边偏移 off**（拖中部手柄）、**镜像开关 mirror**（可选双侧）；挂载边从半形链边放宽为**全形边（含前/后接缝边）**；v2 旧格式由 `normalizeTankModules` 自动迁移（`js/tank_geometry.js`）。
  - **2026-08-12 履带移除（用户设计决策，track 回退）**：履带不再作为挂载模块——`RULES.modules.keys` 7→6（去 track）、`legacyPartKeys.hull` 去 track、保存校验 7→6 类；**履带碰撞盒 = 现有履带模型前后端一小段距离**（车体极前/极后端 `|relX|/halfL > zones.trackBound`），`moduleFromHit` 车体侧面恒先做该自动判定（优先于一切模块带，与是否挂载模块无关）；设计器模块列表/提示文案去 track，新增 `drawTrackZone` 以橄榄色带恒渲染自动履带区（标注「履带」、不可编辑）；两型坦克 JSON 移除 track 放置；测试改写：track 挂载断言 → 自动履带区断言（带/不带模块放置均履带）、`moduleAllowedParts('track') → []`、受牵连坐标用例（x=25/±30 落入履带区）改到区外并补「区外模块带照常」断言，`npm run check`+`npm test` 全绿。
  - 保存校验改为 6 类扁平模块每类至少 1 处放置（缺失阻止保存并切到模块模式列出清单）；`exportModules` 逐放置重新匹配当前半形链（直接匹配优先、失败 console.warn 跳过）；顶点编辑/undo/clear → `clearModulePlacementsOf(part)` 清除该部件全部放置。
  - 顺带修复 v2 潜伏 bug：模块手柄拖拽原先只设 `modLenDrag` 未设 `drag` → `drag.poly==='moduleLen'` 分支永不触发；已改为 `drag = {poly:'moduleLen', moved:false, downX, downY}`。
  - 画布高分屏适配：`resize()` 按 `devicePixelRatio` 建物理像素缓冲 + `ctx.setTransform` 缩放（全部绘制/命中逻辑保持 CSS 像素坐标，`hullCenter`/网格/清屏同步改用 `clientWidth/Height`），修复高 DPI 屏下模型画面模糊。
  - 模块带判定回归测试（`scripts/test-hitpart.js` 重写 + `test-tanks.js` 新增扁平结构校验）：v2 迁移断言、off/mirror/多放置、**mirror=false 侧别保持（直接匹配优先）**、镜像侧命中、len 覆盖段外→结构性、同边多模块取 len 小者、turret axis≠0 坐标回推、旧数据 zones 退化逐条锁定（35 种零件组合全覆盖）。
  - **2026-08-12 镜像偏移修复（用户实测反馈）**：`findModuleBands` 生成镜像伙伴带时把主带的 `off` 原样复用——伙伴边在链中反向遍历（镜像点沿边参数 = 1−t），导致 off≠0 时伙伴带朝主带同向移动，两条带呈**中心对称**而非镜像对称（如主带中心 (-16,-19)，伙伴带中心应为 (-16,19) 却落在 (16,19)）——已改为镜像伙伴带 = 主带四边形沿 y=0 轴逐点取反（真镜像，方向无关、形状对称时与「伙伴边 −off 重算」严格相等）；补回归测试（`findModuleBands` 伙伴带中心/覆盖区间 + `moduleFromHit` 镜像侧 off 命中），`npm run check`+`npm test` 全绿。
  - **2026-08-12 设计器编辑增强（用户需求）**：①右栏「编辑模式」→ **编辑列表**（车体/炮塔/模块/外观件，`editTab` 驱动 `panel-<tab>` 面板显隐，列表↔模式双向同步；外观件 = 炮管预设+炮盾+履带外观；预览保留独立切换；装甲厚度/分段按部件拆分显隐；撤销/清空按 `editTab` 限车体/炮塔条目）——见 §3「设计器编辑列表」；②车体/炮塔**可见性切换按钮**（隐藏部件不渲染/不命中/不入 JSON，防编辑炮塔模块误选车体）；③`RULES.modules.lenMin` 0.15→**0.05**；④对称轴另一侧（y>0）可编辑性核查：Node 复现证实无 v2 残留钳制（挂载/选中/手柄全可用），补 8 项回归测试（含 lenMin=0.05 断言），`npm run check`+`npm test` 全绿。
  - **2026-08-12 交互修复（用户实测反馈，v2 遗留）**：①`moduleLenHandles` 对未挂载模块返回 `[]`（空数组），mousedown 中 `for(const hd of h.handles)` 迭代 undefined 抛 TypeError → 整个点击处理器中断（选中模块后点边无任何反应）——已改为恒返回 `{ edge, handles }` 形状；②`findModuleAtScreen` 把 `{x,y}` 对象顶点传给期望 `[x,y]` 数组的 `pointInQuad` → 交叉积恒 NaN、对所有点击恒判命中 → 任一模块已挂载后其余挂载/取消选中全部失效——已改为 `sc.map(p=>[p.x,p.y])` 传参。已用 Node 抽取真实函数复现验证：点边挂载（含已挂载后再挂载）、保存→重载 round-trip（含 recenterPoly 帧换算）、旧坦克（Leapard_1）挂载全部通过；v3 重构后 Node e2e（`applyTankConfig`→`moduleFromHit` 全流程，含 off/mirror/多放置/居中帧换算/v2 迁移）再验通过。

---

# 十二、2026-08-13 归档自 `PLAN.md`（P-05 节点地图元素生成器，原文）

### P-05 节点地图元素生成器（模板库 + 难度加权随机选）

**动机**：当前 `covers` 掩体数组是 `js/tank_cover.js:11-19` 的手写固定列表（相当于开发期预生成）。DEVELOPMENT.md §2.1 已定型"节点内容按难度随机生成（掩体布局/敌军构成/友军据点位置）"，但具体机制未定。已与用户确认设计决策：**节点地图元素采用"开发期手写模板库 + 生成时按节点难度加权随机选 + 参数化变化"机制**（质量锁在模板里，变化留给生成器；排除"纯程序随机散布"与"开发期预生成整图"）。本条目是 DEVELOPMENT.md §6 下一步顺序第 4 条「摄像机 + 节点地图 + 小地图」下"节点生成器"的**第一步**（只做元素布局生成，不做摄像机/小地图）。

1. **目标**：实现 `generateNode(difficulty)` 生成节点战场元素布局。`difficulty` 为 0~1 连续难度权重；节点索引→难度映射表后补，对应 DEVELOPMENT.md §4 开放问题 6（难度曲线的具体参数）。
2. **模板定义**（开发期手写资产，沿用坦克 JSON"作者帧相对坐标"惯例）：
   - 模板结构：`{ id, tags:[low|mid|high], w, h, items:[{tier, dx, dy, w, h, angle}] }`。
   - 首版于新模块内联 4~6 个模板：开阔走廊 / 森林 / 城镇街区 / 交叉火力广场 / 低难教学图。
   - `maps/*.json` 外部加载预留（同 `tank_listio` 模式）。
   - 模板按难度标签（low/mid/high）分池。
3. **生成流程**（新模块 `js/tank_nodegen.js`，纯逻辑、可 Node 测试）：
   - **选模板**：从匹配难度档的池中加权随机（种子化 RNG，确定性可复现）。
   - **参数化变化**（保守起步，全基于难度）：
     - 密度系数：保序随机剔除；
     - 元素配比：难度越高 half/full/barricade 占比升、bush/soft 降；
     - 残骸预置：低概率 tree/barricade 直接以 stump/rubble 态 spawn。
   - **不做镜像/旋转变体**（half 方向判据与沙袋跳弹有方向性，先保公平）。
   - **实例化**：输出到现有 `covers` 格式（含 spawn 快照），复用 `snapshotCovers`/`resetCovers`。
4. **接入与验证**：
   - `tank_mvp.html` 加「随机生成战场」按钮对照验证（保留现有手写布局为对照）。
   - 新增 `scripts/test-nodegen.js`（确定性种子、元素数量区间、难度档匹配、无重叠/不越界），挂进 `npm test`。
   - `npm run check` 全绿。
   - 顺带基准 covers 元素数量对逐弹道 O(n) 扫描的性能上限。
5. **文档生命周期**：实现并验证后按 4 步走完——同步 DEVELOPMENT.md §2.1 补"模板 + 难度加权"定型与 §6 条目 6 状态 → 删除本条目 → 原文归档 ARCHIVE.md。



---

## #21 git status 误报大量未修改文件（index stat 记录 LF 大小、工作区为 CRLF） — 已解决 (2026-08-14)

**用户报告**（2026-08-14）：
- git 工作区有很多文件看起来没有修改，但被追踪为更改（`git status` 显示 ~45 个文件 modified，`git diff` 却为空）。

**已核实证据（file:line）**：
1. **`git status` 报 modified 但 `git diff` 无差异**：`git status --short -- js/tank_fx.js` → ` M`，`git diff -- js/tank_fx.js` 无输出；`git hash-object --path js/tank_fx.js js/tank_fx.js` == index blob（`bd9106...`），内容 CRLF→LF 归一化后与 index 完全一致，确无真实改动。
2. **index stat 记录 LF 大小、工作区为 CRLF**：`git ls-files --debug js/tank_fx.js` → `size: 19840`；实际文件 20327（差 487 = 行数，CRLF 每行 +1 字节）。所有被误报文件均为「idx 大小 = LF 版本、实际 = CRLF 版本」。
3. **与行尾转换配置无关**：`git -c core.autocrlf=false` / `-c core.eol=lf` 均不改变判定（`git status --short` 仍 50 行）。
4. **副本复现与修复验证**：整仓拷贝（含 `.git`）复现 50 行误报；`git add --renormalize .` 后仅剩真实改动 `tanks/Leapard_1.json`（staged），再 `git restore --staged .` 后仅剩该文件 unstaged 的真实改动。

**根因**：工作区文件在 LF 状态时写入 index（stat 缓存记录 LF 大小），后整体被转为 CRLF（Windows 编辑器/autocrlf 检出），index stat 过期（size 不符）→ `git status` 按 stat 差异标 modified；`git diff` 先做 CRLF→LF 归一化故无差异。

**影响**：~45 个文件持续显示 modified，无法确认真实改动、易误提交全量文件。

**修复方向**（已在副本验证，未对工作区执行）：`git add --renormalize .` + `git restore --staged .`。顺带发现：`.gitattributes` 注释为 GBK 编码显示乱码（仅注释，属性行 ASCII 正常，可选 UTF-8 重写）。

**修复记录**（2026-08-14 实装）：工作区执行 `git add --renormalize .` + `git restore --staged .`，误报从 50+ 行降到仅剩 3 个真实改动（`ISSUES.md`/`tank_mvp.html`/`tanks/Leapard_1.json`）；`.gitattributes` 注释已重写为 UTF-8（内容与 HEAD 一致，仅重写编码）。结论见 DEVELOPMENT.md §3.6「git index stat 重新归一化」。

---

# 十三、2026-08-14 归档自 `ISSUES.md`（#18/#19/#20，原文）

### [2026-08-14] 归档自 ISSUES.md #18

## #18 坦克紧贴时炮口伸入对方车体，正面贴脸射击命中后部模块（弹药架）＋车体视觉重叠 — 待处理

**用户报告**（2026-08-14）：
- 坦克间碰撞、紧贴时有重叠部分。
- 从正面紧贴的靶车射击会击中弹药架，但所有弹药架都设置为只能从侧后击中。

**已核实证据（`file:line`）**：
1. **碰撞体积不含炮塔/炮管/箭镞尖头**：`resolveTankCollisions` 只用车体矩形包围盒分离
   （`js/tank_entity.js:72-73` `partCorners(a.x,a.y,a.hullAngle, a.hullLen/2, a.hullWid/2)`）；
   车体 `hullPoly` 箭镞尖头超出矩形前缘 `tip = hullWid*0.5/2`（`js/tank_geometry.js:25-33`，hullWid=38 时≈9.5px）；
   炮管 `gunTip` 距车体中心≈65px（`js/tank_geometry.js:481-499`），正面对贴时嵌入对方车体≈33px。
   静止贴住即保持嵌入（分离只留 0.1px 缓冲，`tank_entity.js:95-101`；每固定步调用一次，`tank_mvp.html:744`）。
2. **开火无「炮口伸入敌方坦克」检测**：`tryFire` 只对 gunRoot→gunTip 炮管线段做**掩体**贯穿检测
   （`tank_mvp.html:518-550` `findCoversOnPath`），不对敌方坦克做 point-in-polygon 检测；炮弹出生在 gunTip（`tank_mvp.html:591-605`）。
3. **从多边形内部发射只命中出射（远侧）边**：`raycastTank` 取 `t>0.001` 的最小正值（`js/tank_geometry.js:88-93`），
   体内发射时进入边 `t<0` 被丢弃，唯一命中为远侧后缘；炮弹逐帧检测用当前位置（首帧=体内枪口，`tank_mvp.html:815-816`）。
4. **远侧后缘命中被判定为后部模块**：`moduleFromHit` 对 rear face / 后段 rel.x 判 发动机/弹药架/车长
   （`js/tank_geometry.js:387-447`）；用户自设的 ammo 模块带挂在车体后缘（`moduleHitFromBands`）→ 正前方命中「弹药架」。
5. **预测面板同源错误**：`updateSolution` 用 gunTip 起射线（`tank_mvp.html:613-615`），开火前即显示「车体·后部（弹药架）」。

**根因**：①碰撞体积（车体矩形）与弹道几何（炮管/炮塔/箭镞尖头）不一致 → 紧贴时炮口必然入体；
②`raycastTank` 无「体内发射 → 恢复进入边」处理；③`moduleFromHit` 按出射边归属模块。三者串联：
紧贴 → 枪口入体 → 弹丸首帧命中目标远侧后缘 → 正面贴脸被结算为后部模块命中。

**影响**：正面贴脸命中弹药架（×2 伤害、8s 装填 debuff、击杀殉爆掀飞炮塔，`js/tank_physics.js:100-111`）、
发动机（起火 DOT）、车长；等效厚度按后部结算（rear 26 vs front 110），正面贴脸反而更容易击穿；
跳弹判定用出射边法线，入射角/反射方向全错；箭镞尖头视觉重叠≈19px、炮管插入对方车体。
范围不限 player→dummy，所有敌对坦克对紧贴皆有此问题；长炮管（barrelPct 上限 3×）嵌入更深。

**修复方向**（未实施）：①`raycastTank` 增加「原点在部件多边形内部 → 取进入边（`t<0` 且 `|t|` 最小）为命中面」
（核心，一处同时修实弹+预测+垂直剖面）；②`tryFire` 对伸入敌方车体的 gunTip 沿炮口方向回退出生点到多边形边界外（兜底）；
③（可选）开火门控「贴脸压住」拦截；④（可选）碰撞体积改用 `hullPoly` 凸包消除尖头重叠。

---

### [2026-08-14] 归档自 ISSUES.md #19

## #19 设计器接缝边（前/后板）无法点击插入顶点（恒追加且不同步 halfFaces），装甲面板顺序非「前→后」 — 待处理

**用户报告**（2026-08-14）：
- 为车体新增装甲线段的顶点时仍始终追加最后一个点；希望与炮塔类似，允许在线段上点击新增点。
- 装甲（前/侧/后）设置面板中，线段的顺序要在插入顶点后按「前→后」重新排列。

**已核实证据（`file:line`）**：
1. **插入/追加逻辑 hull 与 turret 逐行对称**（`tank_designer.html:1053-1111` mouseup `drag.isNew` 分支）：
   先试 `findEdgeMidpointHit*`（命中→循环切换装甲面），再试 `findEdgeHit*`（命中→`splice(ei+1,0,newPt)` 插入），
   都没命中才 `push` 追加（`:1076` / `:1106`）。
2. **接缝边不参与命中 → 恒追加**：`findEdgeHit`（`:556-564`）/`findEdgeMidpointHit`（`:566-575`）及 ForTurret 版
   循环均为 `i<n-1`，只遍历半形链内部边，**前/后接缝边（front/rear seam）恒返回 -1**。
   但接缝边在画布上以亮色可编辑渲染（`drawPolygon` `:1904`/`:1940-1945`，`js/tank_halfgeom.js:46-50` primary 标记）。
   实测：点击默认车体后板→追加到链尾；点击 Obj 780 前板→新顶点出现在车头却追加到链尾（几何乱序「幽灵边」）。
   「车体恒追加、炮塔可插入」的感知差异来自点击了不同边类型（默认车体的后板/Obj 780 的前板恰为接缝边）。
3. **追加分支不同步 `halfFaces`**（`:1076`/`:1106` 只 `half.push`，未 `halfFaces.push`）：
   新边索引落在 halfFaces 之外 → `getFace` fallback `'side'`（`js/tank_halfgeom.js:80`），面板合计计数失真。
4. **面板顺序非「前→后」**：`renderEdgeListFor`（`:1644-1652`）输出 = 内部边（链序）+ `接缝(后)` + `接缝(前)`——
   **前板恒排最后**；半形链方向由 `halfFromFull`/`buildFullVerts` 决定，并非强制前→后。

**根因**：接缝边命中盲区（`i<n-1` 循环不含 seam 边）→ 接缝点击必然落入追加分支；追加对后接缝几何恰等、
对前接缝几何错误（应 `splice(0,…)`），且追加路径丢失装甲面继承（恒 side）。面板顺序问题源于接缝行位置
（前接缝排最后）与前接缝追加造成的链序错乱。

**影响**：接缝边（前后装甲板）无法点击插入顶点；插入/追加后装甲面丢失继承、`halfFaces` 长度错位
（影响删除索引映射与面板合计）；面板顺序非前→后；亮色可编辑边点击行为与内部边不一致（UX 混淆）。

**修复方向**（未实施）：①接缝边命中与插入——复用 `findFullEdgeAtScreen`（`:635-654` 全形边遍历）或
`fullEdgeHalfRef` 映射：前接缝 → `splice(0,…)` 并继承 `frontSeamFace`；后接缝 → 追加但同步写继承的 `rearSeamFace`；
②统一所有新增顶点路径保证 `halfFaces` 长度 = `half.length-1`；
③面板按「前接缝 → 内部边（链序）→ 后接缝」排列（只调显示顺序，不改链本身）。

---

### [2026-08-14] 归档自 ISSUES.md #20

## #20 弹药架殉爆特效范围过大（火球最大 r 161px / 冲击波环 140px，远超坦克尺寸） — 待处理

**用户报告**（2026-08-14）：
- 弹药架殉爆特效不错，但范围太大，希望改小。

**已核实证据（file:line）**：
1. **火球半径随 scale 放大**：`spawnAmmoBlowFx` 调 `burstExplosion(bp.x, bp.y, 3.2, 70, 45, 36)`（`js/tank_fx.js:120`）；`drawExplosions` 半径 `r = 14 + t*46*ex.scale`（`js/tank_fx.js:278`）→ 最大 161px（直径 ~322px），远超坦克尺寸（对比履带断裂 `spawnTrackBreakFx` scale=0.8，`js/tank_fx.js:149`）。
2. **双重巨型冲击波**：`spawnShockwave(bp.x, bp.y, 140, 0.55, ...)` 与 `spawnShockwave(bp.x, bp.y, 85, 0.4, ...)`（`js/tank_fx.js:121-122`）→ 半径 140 / 85px。
3. **粒子散布全部 ×scale**：`burstExplosion` 内火焰/烟/碎片的 spread 参数 ×sc=3.2（`js/tank_fx.js:98-100`，火焰 spread 160*3.2≈512px）；另加 24 枚火花速度 160–420（`js/tank_fx.js:126-130`）。
4. **焦痕半径 42**（`js/tank_fx.js:123` `spawnScorchMark`；`burstExplosion` 内另有 `16*sc≈51`）。

**根因**：`spawnAmmoBlowFx`（`js/tank_fx.js:117-145`）为戏剧化效果使用 scale=3.2 且独立追加超大 shockwave 半径与粒子数，全部硬编码、无 RULES 配置项。

**影响**：殉爆视觉半径远超车体（火球 ~322px 直径、双冲击波环 140/85px、碎屑散布 ~500px），画面过载、压制坦克本体。

**修复方向**（未实施）：仅改 `spawnAmmoBlowFx` 参数——scale 3.2→2.0（火球最大 r 161→106px）、shockwave 140→95 / 85→60、焦痕 42→30、火花速度 160–420→120–320 且数量 24→18；不影响 `spawnTrackBreakFx` 等其他爆炸。


---

### [2026-08-15] 归档自 PLAN.md P-06

### P-06 M0 贴图资产层 + 地图元素贴图（待实施）

**动机**：当前全程序化矢量渲染、零图片资产。现状核实：`drawCover`（`js/tank_battledraw.js:139`）的 soft/barricade/stump/rubble/bush/tree 分支与 `drawFoliage`（`:233`）均为内联程序化画法；`js/tank_paint.js:121-148` 已有 PAINT_CACHE 离屏缓存先例（key = color+kind+hasTurret+heightClass+verts）；`server.js` MIME 已支持 png/svg（`img` 标签加载本地相对路径可行，与 `fetch` 不同，`file://` 兼容承诺不受影响）。已与用户确认设计决策：**贴图走"注册表 + 可烘焙程序化占位 + 可选图片文件替换"机制**，视觉零变化、`file://` 兼容、零依赖。本条目是 DEVELOPMENT.md §6 条目 4「M0 贴图资产层 + 地图元素贴图」的执行方案（设计定型见 §2.10）。

1. **目标**：新增 `js/tank_assets.js` 资产层——`ASSET_DEFS` 注册表（tree/bush/barricade/stump/rubble/soft 每档 → 尺寸/锚点/程序化烘焙函数）+ 浏览器 Image 加载器 + `drawAsset(ctx, key, ...)`（有图 drawImage，无图/未加载回退程序化）。注册表纯数据可 Node 测，加载器浏览器分支。
2. **占位贴图来源**：把 `drawCover`/`drawFoliage` 现有程序化画法改造成可烘焙函数，首次使用时离屏 canvas 烘焙进缓存（沿用 PAINT_CACHE 思路），后续 drawImage——视觉零变化、file:// 兼容、零依赖。
3. **导出工具**：`tools/bake.html` 一键导出 PNG 到 `assets/`（日后真实美术直接替换文件，接口不变）。
4. **接入**：`tank_battledraw.js` 的 tree/bush/barricade/stump/rubble/soft 分支改走资产层；half/full 保持程序化。设计器不画地图元素，不受影响。
5. **验证路径**：新增 `scripts/test-assets.js`（注册表条目完整性、尺寸/锚点合法、烘焙函数可绘制）挂进 `npm test`；`npm run check` 全绿；浏览器对照原程序化渲染无视觉差异；`tools/bake.html` 导出后在 `file://` 下验证图片加载路径。
6. **文档生命周期**：实现并验证后按 4 步走完——同步 DEVELOPMENT.md §2.10/§3/§5.5 → 删除本条目 → 原文归档 ARCHIVE.md。

---

### [2026-08-15] 归档自 PLAN.md P-07

### P-07 M1 声音占位系统（待实施）

**动机**：整个项目零音频（无任何 audio 代码）。已与用户确认设计决策：**先 Web Audio 程序化合成占位音效**（开火/击穿/未击穿/跳弹/殉爆/履带断/起火/UI），后续替换为资产文件。独立里程碑、不阻塞其他系统。本条目是 DEVELOPMENT.md §6 条目 5「M1 声音占位系统」的执行方案（设计定型见 §2.11）。

1. **目标**：新增 `js/tank_audio.js`——Web Audio 程序化合成 8 类占位音效（开火/击穿/未击穿/跳弹/殉爆/履带断/起火/UI 交互），挂接战斗事件（`resolveHit` 四态、炮口闪光、破障、履带断、起火 DOT）与 UI 交互。
2. **设计要点**：AudioContext 惰性初始化（首次用户交互解锁，符合浏览器自动播放策略）；音量/增益分级（战斗 vs UI）；零音频资产依赖（全合成）；音效参数表（频率/包络/时长）集中可配。
3. **接入与验证**：`tank_mvp.html` 战斗事件处接入；`npm run check` 全绿；浏览器实测各类音效触发与音量分级合理。
4. **文档生命周期**：实现并验证后按 4 步走完——同步 DEVELOPMENT.md §2.11/§3 → 删除本条目 → 原文归档 ARCHIVE.md。

---

### [2026-08-15] 归档自 PLAN.md 条目 6 摄像机 + 节点地图 + 小地图（P-08 已完成）

> 2026-08-15 删除自 PLAN.md「后续里程碑缺口清单」：条目 6（含三个捆绑前置）已由 P-08 实现并验证完结，详见 DEVELOPMENT.md §2.12 / §3.7。被删条目原文如下：

- **全局游戏流程状态机**（节点切换→结算→卡牌→商店→死亡/复活→局外商店的场景状态管理；简单状态机模块、纯逻辑可 Node 测，战斗循环只是其中一个状态）—— 归属条目 6。已实现：`js/tank_flow.js`（map/battle/settlement/reward/gameover，白名单转移 + watchFlow 监听；局外商店为 M10 扩展点）。
- **UI 界面层约定**（节点图/商店/卡牌三选一/永久升级均为新界面；定界面模块归属与战斗循环通信方式，保持零依赖）—— 归属条目 6。已实现：mvp 经 watchFlow 监听 → DOM 覆盖层；卡牌内容为占位（M10 落地）。
- **性能剔除 culling**（节点约 1:9 摄像机比例，全图遍历不可行；摄像机系统必须内建视口 AABB 剔除，`drawCover`/`drawFoliage` 现遍历全部 covers；粒子考虑池化）—— 归属条目 6。已实现：`aabbInView` 视口剔除（covers/树冠/shells）；粒子池化为后续可选项。

---

### [2026-08-15] 归档自 PLAN.md P-09 卡牌/Boss 数据驱动框架 + 内容批量（已完成）

> 2026-08-15 删除自 PLAN.md「当前进行中条目」：P-09（阶段 A 框架 + 阶段 B 内容批量）已实现并验证完结，详见 DEVELOPMENT.md §2.13/§2.14/§3.8/§3.9。被删条目原文如下：

**阶段 A —— 框架 + 工具 + 示例（已完成 2026-08-15）**：卡牌/Boss schema（`js/tank_cards.js` / `js/tank_boss.js` 纯逻辑）、一型一文件 `cards/`+`bosses/` + `/api/cards`+`/api/bosses` 端点、`scripts/validate-content.js` + `scripts/audit-content.js`、`tools/content_designer.html` 编辑器、子 agent `@card-author`/`@boss-author`/`@balance-auditor`、示例内容（11 卡 + 1 Boss）。定型见 DEVELOPMENT §2.13/§2.14，验证见 §3.8。

**阶段 B —— 内容批量（待实施）**：
- **卡牌 ≥100 张**：稀有度分布按权重 common 50% / rare 30% / epic 15% / legendary 5%，5 流派（重甲/狙击/机动/爆破/支援）全覆盖；效果类型覆盖 modifier/ammo/ability/passive/drone/economy 六类；拟真坦克主题。
- **Boss ≥5 种**：强化坦克 + 多阶段机制（每阶段换打法/弱点/威胁），打法彼此区分；5 Boss 提案见 DEVELOPMENT §2.14。
- **Boss 运行时接入**：节点链末端为 Boss 战（生成 boss 实体、阶段触发、掉落结算）。
- 验证：`node scripts/validate-content.js` 通过、`node scripts/audit-content.js --strict` 无警告、`npm test` 全绿。

