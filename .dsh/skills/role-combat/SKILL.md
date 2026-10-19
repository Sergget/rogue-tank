---
name: role-combat
description: Use when the task touches hit resolution, ballistics, shell lifecycle, weapons, active abilities, shields, artillery strikes or deployables in Rogue Tank. Owns the combat pipeline in js/ and the battle-loop wiring in tank_mvp.html.
---

# Role: combat（战斗与弹道）

**系统归口**：`docs/specs/combat.md`（装甲/跳弹 §3、能力与副武器 §4、特效 §6、AI 激活 §11、键位 §13）
**项目状态**：`docs/DEVELOPMENT.md` §3

## 1. 你拥有的文件

- `js/tank_fire.js` — 开火通用层：`fireTank`、`tryFirePrimary`（左键/空格=主炮，salvo 齐射）、`tryFireSecondary`（F=副武器）、`primaryWeaponSpec`、`firePrimaryShell`、`stepShells`
- `js/tank_physics.js` — `resolveHit`（入射角/等效厚度/跳弹/穿透/模块概率分区伤害）、`applyModuleDamage`
- `js/tank_weapons.js` — `WEAPON_DEFAULTS` 双槽缺省表、`updateSecondaryWeapon`（mortar/missile/rocket/mine_layer/turret 五类）、`updateMissileLock`
- `js/tank_abilities.js` — `tryActivateAbility`、`ABILITY_KEYS_RUNTIME`、`abilityCds`
- `js/tank_shield.js` — 累计吸收护盾
- `js/tank_strike.js` — 延迟 AOE 炮击（circle/point/carpet）
- `js/tank_deployables.js` — 固定炮塔 / 地雷 / 战术掩体注册表
- `tank_mvp.html` 的战斗循环、开火管线、HUD 装填指示段（**页面单写者，见 `rogue-tank-roles` §1**）

## 2. 现行口径（2026-10-19 核实，勿按旧文档改）

1. **主副武器双入口**：左键/空格 = 主炮专属（`tryFirePrimary`，空格齐射）；`F` = 副武器（`tryFireSecondary`）。`activeWeaponSlot` 已移除（2026-09-17 #C4e）。
2. **开关类副武器**（`missile` 激活/取消、`mine_layer` 预形态/确认）的 F **必须走原生 `keydown` 边沿**，不得主循环逐帧轮询（会每帧翻转）。
3. **技能键位单一来源**：7 个运行时技能（artillery / shield / overdrive / deploy_cover / super_fire_control / super_speed / aps）**只经技能池 skillSlot1~3 + 数字键 1/2/3**。**G / H 专属键已于 2026-10-19 #U42 退役**（`KEY_BINDINGS` 已删 `abilityStrike`/`abilityShield`）；innate 三键（repair/medkit/extinguish）走 4/5/6。键位唯一口径 = `js/tank_bindings.js`。
4. **弹药切换是 Q / E**（`player.ammoKey` / `player.ammoLoadout`），数字键 1/2/3 已让位技能池。
5. **冷却按 key 独立**：`abilityCds[key]`，逐帧 `updateAbilityCds`。`abilityCdT` / `updateAbilityCd` 是废弃兼容助手，不要在新代码用。
6. **跳弹**：per-ammo `ammoBounceAngle`（65°~90°），HEAT/HE 系 `noBounce`；跳弹后沿命中面法线真实反射，**二次跳弹不允许**。数值唯一口径 `docs/specs/combat.md` §3.2。
7. **弹种表**以 `RULES.ammoTypes` 为唯一来源，不要在文档或代码里另抄一份数值。
8. **电磁炮视效**：炮管=灰、基底=蓝、弧光=白（2026-10-19 #U41 三色口径）；电弧只挂炮身不跟炮弹；参数唯一口径 `RULES.railgunFx`。

## 3. 硬约束

- 战斗逻辑只读 `tank.stats`，**不摸 `tank.base`/`tank.modifiers`**；新属性注入走 modifiers。
- 实体操作走 `entities` 注册表 + `isHostile`/`nearestEnemyTo`，**不写死玩家/敌人变量引用**。
- `shell.dec`（曝光缓存）跳弹时重置，不可破坏该不变式。
- 被吸收的炮弹置 `s.absorbed` 并跳过后续效果（HE 破障等），保持该 guard。
- 新增共享模块：`'use strict'` + 底部双导出（Node/browser），并同步 `scripts/check-html.js` 与 `tsconfig.json`。

## 4. 调参边界

新增/调整 `RULES` 字段属于 `role-systems` 的写域。需要新参数时，**提需求给 `role-systems`**，不要直接改 `js/tank_rules.js`。

## 5. 验证

改完交给 `role-verify-docs` 跑三链；战斗类改动至少额外抽查 `node scripts/test-fire.js`、`node scripts/test-physics.js`（注意 `test-physics.js` 目前是孤儿测试，见 `role-verify-docs` §3）。
