# 部署物与布雷

> **摘要**：便携式掩体的单向透明与上限、地雷与雷场的预约/触发/装填（2026-10-22 改带状），以及全部部署上限的唯一数值表。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/combat.md` §8.1、§13.3、§13.6（#J1）（2026-10-21 拆分；2026-10-22 第五批改雷场口径）
> **相关**：[技能与副武器](./abilities-secondary.md) · [敌方 AI](./enemy-ai.md) · [地图规范](../map.md)

## 目录
- [便携式掩体](#便携式掩体)
- [部署上限](#部署上限)
- [布雷器与雷场](#布雷器与雷场)
- [地雷的触发与伤害](#地雷的触发与伤害)

## 便携式掩体

（原 §8.1，2026-09-20 #E4/#F5/#F6）

- **单向透明**：部署方阵营的炮弹可穿过便携式掩体（不拦截），**对立方**炮弹按确定性实体在掩体入口点被挡下（`tank_fire.js stepShells` 的 `_deployablePathHit` 与部署物 OBB 求交）。视觉上以朝向指示标注「我方穿透侧」：穿透侧画青色虚线 + 绿色箭头（`tank_battle.html` 部署物绘制），对敌面为实线装甲边。
- **尺寸（唯一数值口径）**：`RULES.abilities.deploy_cover` 的 `dist` **90** / `lenMult` **3.2** / `width` **22** / `hp` **200** / `shieldHp` **150** / `duration` **30s** / `cooldown` **20s**（2026-10-21 按 `RULES.abilities` 核对）。沿革：`lenMult` 1.6 → 3.2（2026-09-20 #E4「再加长至当前 2 倍」）；`width` 22 取代旧硬编码 20。**[技能与副武器](./abilities-secondary.md) 的「战术掩体」条只讲部署方向语义，数值一律回本条。**
- **部署方向**：炮塔正前方（读 `turretAngle`），2026-09-17 #C4b 用户裁定。

## 部署上限

（原 §8.1 #F6，2026-09-20；**2026-10-22 第五批：地雷总数上限整体删除**）

基础上限与升级步长**唯一数值口径 = 下表（`RULES.abilities.deploy_limits`，2026-10-22 核对）**，升级卡经 `upgradeCards` 映射（`ability_deploy_cover_fortified→cover+1`、`turret_bunker→turret+1`）：

| 键 | 值 | 语义 |
|---|---|---|
| `coverMax` | 2 | 战术掩体基础上限 |
| `coverMaxUpgradeStep` | 1 | 每张升级卡增加的掩体槽位 |
| `coverMaxHardCap` | 6 | 掩体槽位升级的绝对硬上限 |
| `mineFieldCount` | 6 | 单条雷带的雷数（密度旋钮，**不在 UI 显示枚数**） |
| `mineFieldLength` / `mineFieldBandWidth` | 220 / 56 px | 雷带长度 / 宽度（法向） |
| `mineFieldDelay` / `mineFieldReload` | 4s / 15s | 预形态等待 / 装填冷却 |
| `mineFieldMaxDeploy` / `mineFieldMaxDeployCap` | 1 / 3 | **雷场槽位**基础值 / 硬上限（用户裁定「最多可同时部署 3 个」） |
| `mineFieldHeRatio` | 1.0 | 雷场伤害 = 玩家当前 HE 单发伤害 × 该比例 |
| `mineArmorScope` | `'hull'` | 「最薄部位」口径：`hull`=车体三面最小值；`all`=车体+炮塔六面 |

**⚠ 2026-10-22 用户裁定：地雷总数不设上限**——`mineMax` / `mineMaxUpgradeStep` / `mineMaxHardCap` 三键已**删除**，`deployableCap('mine')` 恒返回 `Infinity` ⇒ `enforceDeployLimits('mine')` 成为 no-op（不再「超限淘汰最早布设的地雷」）。地雷的**唯一约束是雷场槽位**（`mineFieldMaxDeploy`），判定在 `tank_battle.html` 的 `activeMineFieldSlots()`（pending + 已生成且仍有存活地雷的 `fieldId` 数）。

**沿革（不静默删除）**：#J1（2026-09-30）曾把 `mineMax` 3 → 6、`mineMaxHardCap` 8 → 12 以修「一个节点只能布 1 次」的缺陷；该缺陷随上限删除而根治。`mineFieldRadius`（圆形半径 70）亦于本批删除，被 `mineFieldLength` / `mineFieldBandWidth` 取代。

**能力/页面部署路径超限时拒绝新部署并提示，保留已部署物**：`js/tank_abilities.js` `deploy_cover` 与 `tank_bench.html` `spawnCoverBtn` 部署前检查 `deployableCount >= deployableCap` → 拒绝（不生成新掩体）；`tank_battle.html` `handleMineFieldF` 在**雷场槽位已满**时直接拒绝并提示「雷场槽位已满 (n/3) — 等已有雷场消耗完再布设」，同时**不产生预形态、不 push `pendingMineFields`**。掩体仍走「淘汰最早」兜底（绕过能力路径直接 spawn 时生效）；按类型独立计数。

## 布雷器与雷场

（原 §8.1 + §13.3，2026-09-20 #F5/#F6；2026-09-30 #H2；**2026-10-22 第五批改带状**）

**形状与方向（2026-10-22 用户裁定）**：雷场是**带状**（旋转矩形，非圆形），用于阻挡敌方 AI 冲锋。

- 几何：以 `center` 为中心、`len = mineFieldLength`、`wid = mineFieldBandWidth`；方向角 `angle = atan2(mouse − player) + π/2`，即**始终垂直于「鼠标—玩家」连线**。
- **第一次 F**：显示预形态，**中心在按下瞬间定格**（之后移动鼠标不再改变落点），但 `angle` 随鼠标实时刷新（可微调朝向）。
- **第二次 F**：确认 → `pendingMineFields` → `mineFieldDelay` 秒后生成。
- 排布：沿带长方向等距铺 `n = mineFieldCount` 枚，横向在 `±bandWidth×0.25` 内做 `k%2` 交错（确定性）。**绘制与生成共用同一纯函数 `mineFieldLayout(field)`**（`js/tank_deployables.js`），消除旧实现三份重复公式的「所见非所得」风险。
- F 的按键语义为**原生 keydown 边沿**（见 [技能与副武器 · 开关类副武器的 F 边沿口径](./abilities-secondary.md#开关类副武器的-f-边沿口径)）。

**不向玩家显示雷数（2026-10-22 用户裁定）**：日志只写「雷场已确认 — Ns 后生成」，不再报具体枚数；`mineFieldCount` 仅作密度手感旋钮。

**AI 避雷（同批新增）**：`js/tank_ai.js` 的 `applyHazardAvoidance(t, out, hazards)` 在 `aiDecide` 末尾执行（可覆盖机动层），把 `tank` 位置与「前方 120px 预测点」投影到带的局部坐标：落在带内（外扩 20px）→ 全速冲出并向带法向转向；将进带 → 停车并转向带端点绕行。**只对 `team==='enemy'` 生效**（玩家/友军不避雷）。hazard 列表由 `tank_battle.html` 每帧从雷场构建。

**装填门控（#F5 + #H2）**：布雷受 `secondaryReloadT` 装填冷却门控——**单发路径**由 `fireActiveSecondary` 顶部统一拒绝（单发装填时长取 `WEAPON_DEFAULTS.secondary.mine_layer.reload`），**雷场路径**由 `handleMineFieldF` 在确认预约时写入 `player.secondaryReloadT = reload / debuffReloadRate`（兜底 `RULES.abilities.deploy_limits.mineFieldReload = 15`）、冷却中按 F 拒绝。

## 地雷的触发与伤害

（原 §8.1「装填与触发口径」，#U39 2026-10-18 半径入缺省表；**2026-10-22 第五批改伤害结算**）

地雷**触发半径**与 `spawnMine` 默认值、爆炸 AOE `blastRadius` **唯一数值口径 = `WEAPON_DEFAULTS.secondary.mine_layer`**（`triggerRadius` / `blastRadius`，bench 手动布雷同源）——判定为敌对实体**中心点**距离 ≤ `triggerRadius`。

**伤害（2026-10-22 用户裁定）**：雷场每枚雷的伤害 = **玩家当前 HE 单发伤害 × `mineFieldHeRatio`**（`heCfg = computeAmmoConfig(player,'he')`；`heDmg = stats.damage × heCfg.dmg + heCfg.dmgAdd`）。引爆结算改为按「**最薄部位装甲**」走 `resolveHit(shellLike, target, hitFake, false, { forceEffThickness })`：

- `pen >= thinnest` → 全伤 + 模块判定（`pen` 取该玩家当前 HE 弹穿深）；
- 否则按 `he.nonPenRatio` 给残伤；
- 「最薄部位」由 `thinnestArmorThickness(tank, scope)`（`js/tank_geometry.js`，共用纯函数）计算，`scope` 取 `RULES.abilities.deploy_limits.mineArmorScope`（缺省 `'hull'` = 只取车体三面最小值，对应用户原话「车体最薄部位」；`'all'` = 六面，与榴弹炮直击口径一致）。

**沿革（不静默删除）**：改前雷场生成处写死 `damage:(RULES.abilities.deploy_limits.mineDamage||100)`、`blastRadius:70`、`triggerRadius:45`，而 `mineDamage` **这个键在 RULES 中根本不存在** ⇒ 伤害恒 100，且「阔域雷场」（`weapon_secondary_mine_radius`）与「高爆战术地雷」（`weapon_secondary_mine_upgrade`）两张卡对雷场路径**完全无效**（ISSUES #Z5）。本批一并修掉：半径读 cfg，伤害改由 HE 比例驱动。

## 相关页面
- [技能与副武器](./abilities-secondary.md) — 战术掩体技能入口与 F 键分派
- [敌方 AI](./enemy-ai.md) — 敌人如何绕开部署物
- [地图规范](../map.md) — tier 与地形对部署的限制
- [武器与装填](./abilities-secondary.md) — `WEAPON_DEFAULTS.secondary` 的定位
