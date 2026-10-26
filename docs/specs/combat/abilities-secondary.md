# 技能与副武器

> **摘要**：主动技能怎么按、副武器怎么开火、技能槽满了怎么顶替——三件事都在这一页。
> **适用版本**：现行（2026-10-21）
> **源自**：`docs/specs/combat.md` §4、§8.2、§9.4、§13.2（2026-10-21 拆分）
> **相关**：[武器与装填](./weapons-reload.md) · [部署物与布雷](./deployables.md) · [HUD 与界面](./hud-ui.md)

## 目录
- [副武器系统](#副武器系统)
- [主动技能与冷却池](#主动技能与冷却池)
- [技能槽指派](#技能槽指派)
- [APS 主动防御](#aps-主动防御)
- [无人机](#无人机)

## 副武器系统

（原 §4 首段；F 键直接击发副武器，左键/空格=主炮专属；2026-09-17 #C4e 用户裁定反转，取代 #A21 激活槽位分发）

- 副武器**单槽**（`player.weapons.secondary`；单槽不变量见 #A22 / DEVELOPMENT.md §4.16）。
- `F` 键（`fireSecondary`）= **直接击发副武器（按住连发）**，不再承担主/副切换——`activeWeaponSlot` 概念已移除。键位语义：**左键/空格 = 主炮专属**（`tryFirePrimary`，空格为双管齐射 salvo），**F（按住）= 副武器专属**（`tryFireSecondary` → `fireActiveSecondary(target=鼠标世界点)`，目标缺省回退炮塔前方 +100px）；`tank_bindings.js` keydown 屏蔽 `e.repeat` 重复边沿动作。
- **例外**：副武器类型为 `turret`（副炮塔）时**装上即由主循环 `updateSecondaryWeapon` 逐帧自主驱动**（自瞄，不响应击发）；副武器为 `none`/未装时 `tryFireSecondary` 返回 false（页面层提示，**不回落主炮**——主炮有专属键位）。
  - **副炮塔外观与弹道来源（#U43，2026-10-19 用户反馈「副炮塔似乎没有效果，贴图方面使用 1 个缩小版的自身炮塔叠在当前炮塔上方自主攻击」）**：机制侧本就生效（自瞄/独立装填/独立炮塔角），但**弹道起点与炮口特效都复用主炮的 `gunRoot`/`gunTip`** ⇒ 炮弹从主炮口飞出（实测起点与主炮 `gunTip` 逐位相同），玩家无法区分「多了一门炮」与「主炮多打了一发」，主观结论即「没有效果」。现行：
    - **弹道起点 = 副炮塔炮口**：`updateSecondaryTurret` 经 `secondaryTurretPose`（与绘制层**严格同源**，惰性解析以兼容 `tank_weapons.js` 先于 `tank_battledraw.js` 加载）取位姿，炮口 = `pose 位置 + 朝向 × (barrelLen + radius×0.6)`；炮管掩体截停判定同步改用该线段。弹体带 `fromSecondaryTurret: true`，`drawShells` 据此把弹体缩到 0.7 档；炮口特效缩放 0.55（主炮 0.8）。
    - **外观 = 缩小版自身炮塔**：`secondaryTurretPose` 锚点从「车体尾后 `hullLen×0.28` 的小圆盘」改为**主炮塔座圈中心（`turretPivot`）沿主炮塔朝向前移 `turLen×0.62×0.45`**，缩放 `scale=0.62`，绘制复用本车 `turretPoly` 顶点（同一套涂装/勾线/受光），读作「同一辆车上多装了一座小炮塔」。**沿革（已推翻）**：旧位姿在车尾、半径为 `hullWid×0.30 ≈ 11px` 的纯几何圆盘 + 一根棍子，与主炮塔无视觉关联。
- 副武器待机装填计时 `secondaryReloadT` 恒递减（与主炮 reloadT 对称）。**每种副武器的装填/伤害/射程等数值唯一口径是 `WEAPON_DEFAULTS.secondary`（`js/tank_weapons.js`）；本页只写行为语义，不重复罗列数值。**
- **锁定式反坦克导弹**（secondary `missile`）：**F = 激活索敌**（不是直接发射）——激活后逐帧由 `updateMissileLock` 在炮塔锁定扇形内、射程内索敌，锁定计时满后**自动发射**制导弹；再按 F 取消。**现行细则与参数（`lockArcDeg` / `lockSeconds` / `range` / `reload` / `damage`）唯一归口本页「副武器 F 键分派」+ `WEAPON_DEFAULTS.secondary.missile`，不重复罗列。**
  - **已作废的旧口径（#A21 时期，勿再引用）**：曾为「按 F 沿光标方向直飞、不做锁定、`target=null`」，该口径自 #E5（2026-09-20）起被取代；AI/Boss 侧副武器同样走 `updateMissileLock` 自主索敌。
  - **伤害口径（#J4 2026-09-30 明文化）**：基础伤害 `damage`（数值见 `WEAPON_DEFAULTS.secondary.missile`；升级卡另行覆盖）**再乘当前 HEAT 弹种系数** —— `getEffectiveHeatAmmoKey`（优先级 `heavy_tandem_heat > tandem_heat > heatfs > heat`，全部未持有时回退 `he`）→ `computeAmmoConfig` → `dmg = round(base × ammo.dmg + ammo.dmgAdd)`，穿深同理。即**导弹伤害跟随玩家的 HEAT 弹种升级链**，未升级时按 HE 口径计算。
  - **激活反馈（#J4 2026-09-30 用户反馈「导弹无法发射」）**：旧版激活后**无任何可见反馈** —— 炮塔未对准（超出锁定扇形）或目标在射程外时，导弹既不发也不提示，玩家只能得到「按了 F 没反应」。现三处反馈：① 激活日志写明锁定条件（扇形角/射程/锁定耗时）；② HUD `btnF` 角标显示「索」（已激活未锁定，琥珀脉动 `.lock-hunting`）/「n%」（锁定中，绿色 `.lock-on`）；③ 激活后 0.6s 仍无目标 → 一次性提示缺少的条件（射程内无敌人 / 炮塔未对准）。
- **火箭发射器逐发 burst（2026-09-19 #D4 用户反馈「同帧齐射改连续快速逐发」）**：`fireActiveSecondary` rocket 分支只发射第 1 发并登记 `t._rocketBurst={left, lastAngle}`；`updateRocketBurst`（tank_weapons.js，battle 主循环玩家侧 / `updateSecondaryMount` AI 侧逐帧驱动）按 `burstInterval`（`WEAPON_DEFAULTS.secondary.rocket.burstInterval`）逐发补完，队列清空后写入整组装填（`reload`）。瞄准：存活目标方向优先，目标丢失保持上一发角度（committal）。视觉：逐发口焰 `muzzle`+粒子烟 `spawnSmoke`×3+音效（旧齐射仅一次）、弹体 `fxScale` 放大 + 拖尾增亮（drawShells 消费）。队列不跨节点：enterBattle 清 `player._rocketBurst`/`_missileLock`，重置按钮清全员。
- **视野系统已整体退役（2026-09-30 #J3）**：敌对实体一律渲染、一律可被命中，只剩 `aabbInView` 视口剔除（纯性能，非玩法机制）。现行细则见 [视野与镜头](./camera-vision.md)。**注**：敌人 AI 的接战判定**从来与视野系统无关**，一直是「距离 + 直线视野」（`engageRequiresLoS` + `hasLineOfSight`），不受本条影响。

### 副武器 F 键分派

（原 §8.2，2026-09-20 #E5/#F7 + 2026-10-20 #X4/#X5）

`F` 键语义按副武器类型分派（`tank_battle.trySecondaryFire`）：

- **锁定式（`missile`）**：F = **激活**，立即开始索敌（炮塔 ±`lockArcDeg` 扇形内最近敌对目标）→ 锁定计时满 `lockSeconds` 后**立即发射**（`updateMissileLock`，玩家侧主循环逐帧驱动）；再按 F 取消激活。飞行制导 = 追尾 + **比例引导（PN）**：`RULES.missiles.lock`（`turnRate` **2.0 rad/s**、`navConstant N=2.5`）。沿革：~~turnRate 3.5 / N 3.0~~ → **2026-10-23 用户裁定「削弱拐弯能力」**。
- **线导式（`missile_wire`）**：F = **直接发射**，飞行方向由**鼠标**持续引导（`shooter._secondaryTargetPos` 每帧更新）——等效视线角速度为 0 的比例引导；`RULES.missiles.wire`（`turnRate` **2.5**、`N=0`）。沿革：~~4.5~~ → 2026-10-23 削弱。已并入 `RULES.weaponTypes.secondary` 白名单与 HUD 标签/图标（「反坦克导弹（线导式）」）。**#U39（2026-10-18）：飞行速度与装填已入 `WEAPON_DEFAULTS.secondary.missile_wire` 并由 `cfg` 消费**（原 `speed` 只在 `fireActiveSecondary` 的 wire 分支写死，升级卡无法覆盖）；同批该型补入卡牌白名单 `WEAPON_SECONDARY_TYPES` 并获得安装卡 + 2 张升级卡，见 `specs/cards.md` §8.3。

#### 导弹单发冷却 / 越障 / 攻顶（2026-10-23 用户裁定）

用户原话：「目前反坦克导弹是按下 1 次 F 键，一个节点都会生效，需要改为按 1 次生效 1 次，导弹击中、消失后进入冷却时间。」+「削弱线导、锁定式导弹的机动能力」+「线导导弹默认可以越过当前配置的掩体（不是建筑、岩石等），提供升级攻顶引信…锁定导弹仅 50% 几率可飞过去，并提供升级：攻顶式反坦克导弹」。

| 项 | 现行口径 | 唯一口径位置 |
|---|---|---|
| **单发在飞** | 发射即置 `t._missileInFlight = shell`，`secondaryReloadT = 0`；**在飞期间 `missile`/`missile_wire`/`updateMissileLock` 一律拒绝再次击发**。弹体在 `tank_battle.html` 弹体清理段死亡（命中/超程/出界/被拦）时释放标记并按 `cfg.reload` 写入装填 | `js/tank_weapons.js` `fireActiveSecondary` 两分支 + `tank_battle.html` shells 清理段 |
| **越障概率** | `RULES.missiles.lock.overflyChance = 0.5`（50%）、`wire.overflyChance = 1.0`（默认必越）；掷骰在**发射时**完成并写弹体 `s.overflyLow` | `RULES.missiles` |
| **可越 tiers** | `RULES.coverTiers[tier].missileOverfly === true`：`wall` / `wall_breakable` / `tree`。**不可越**：`building` / `intact` / `ruined` / `rock` / `perm_block` | `js/tank_rules.js` coverTiers |
| **越障语义** | 弹体 `overflyLow` 时，这些 tier 不参与 `findCoversOnPath` 拦截、部位裁剪（`_wallBlockAlong`）与部署掩体拦截 | `js/tank_fire.js` stepShells |
| **攻顶引信** | 弹体 `s.topAttack` → 命中结算改用 `resolveHit(..., allowBounce=false, {forceEffThickness: thinnestArmorThickness(target,'all')})`，且伤害 ×`RULES.missiles.topAttack.dmgScale`（**0.6**） | `RULES.missiles.topAttack` + `js/tank_fire.js` |
| **攻顶升级卡** | `weapon_secondary_missile_top_attack`（锁定式）/ `weapon_secondary_missile_wire_top_attack`（线导式），均 epic、`weapon upgrade` + `statOverrides.topAttack = true` | `cards/*.json` |

- **榴弹炮（`howitzer` 副武器槽）例外口径（2026-10-20 #X5）**：该槽**本身不发射**（射击走主炮左键/空格），F 对它 = **曲射/直射模式开关**，与 `missile`（激活/取消）、`mine_layer`（预形态/确认）同属**开关类**，一律走原生 `keydown` 边沿，严禁主循环逐帧轮询。默认 `_howitzerOn !== false`（装卡即曲射）；切到直射时清 `_howitzerBurst`（丢弃未打完的急速射追发队列，防止旧模式余弹继续打出）。模式判据唯一入口 `js/tank_weapons.js` 的 `isHowitzerMode(t)` / `toggleHowitzer(t)`（`isHowitzerMode` = 槽位判据 **且** 运行时开关，2026-10-20 前只有槽位判据 ⇒ 装卡后恒曲射、F 无法切回）。详见 [曲射火力](./arc-fire.md)。
- **火箭巢（`rocket`）发射朝向（2026-10-20 #X4）**：弹道基础角 = **炮塔朝向**（`t.turretAngle`），**不解析 `targetPos`/鼠标位置**；整组 burst 共用该角度，每发仅叠加独立散布（`fireRocketOne` 的 `gaussian(0.02)`）⇒ 扇形齐射。其他副武器（`mortar`/`missile`/`turret`/`mine_layer`）仍按目标点解算，语义不变。~~旧口径「朝向鼠标位置」~~ 已被取代。

### 开关类副武器的 F 边沿口径

（原 §8.2，2026-09-20 #F7）

**"按一次切换状态"的副武器（`missile` 激活/取消、`mine_layer` 预形态/确认、`howitzer` 曲射/直射）一律由原生 `keydown` 边沿驱动**（`tank_battle.html` 独立监听：`e.repeat` 过滤 + `inMenuState/statusOpen/devOpen` 门控 + 战斗态 `fireCtx` 判定），**不得**走主循环 `input.isDown('fireSecondary')` 逐帧轮询——逐帧轮询会让开关在按住期间每帧翻转（实测按住 F 250ms 内 9 次 true/false 交替），松手后的状态取决于帧数奇偶（轻按 F 约一半概率停在「已取消」，表现为「导弹按 F 没反应」）；mine_layer 更会一次按住跨帧连走「预形态→确认」（一按即预约，预形态名存实亡）。**"按住连发"类（`mortar`/`rocket`/`missile_wire`）保持逐帧轮询**（装填门控天然限速）。HUD 的 F 按钮点击走 `trySecondaryFire(true)`（`force=true` 绕过键盘边沿直调）。

> **适用范围：bench 同口径（2026-10-26 AA-b / #AA3）**。`tank_bench.html` 的 `tryBenchSecondaryFire(force)` 与 battle 完全对齐——三类开关副武器在**帧轮询通道**里 `if(force !== true) return;` 直接退出，原生 `keydown` 监听（`e.repeat` 过滤、键位取 `KEY_BINDINGS.fireSecondary`、输入框/devPanel 聚焦不响应）走 `force=true`；**轮询本身保留**（连续击发类靠它，删掉会让火箭巢按住连发失效）。回归：`scripts/test-bench-parity.js`（断言三类守卫各存在 + 边沿监听 + 轮询调用仍在 + 键集包含关系）。
> ⚠️ 历史教训：本条曾在 PLAN 里被误写成「bench 主循环内不得出现 `isDown('fireSecondary')` 轮询」——那是把「守卫」误读成「禁止通道」，照做的后果是打死连发。

## 主动技能与冷却池

（原 §4）

- **主动技能快捷键池 (1~3 数字键)**：
  - 快捷键 1/2/3 **严格对应技能池槽位 `player.skillSlots[0..2]`**（2026-09-30 #H3 重做，取代原「按 `cardEffects` 获得顺序自动推导」口径），按槽位快捷施放；**空槽按数字键无任何效果**（不再回落到任何默认技能）。**现行运行时能力键全集（5 个，2026-10-20 #W9 删键后）以 `js/tank_abilities.js` 的 `ABILITY_KEYS_RUNTIME` 为唯一口径**（`artillery / overdrive / shield / deploy_cover / aps`）——键数多于槽位数（3），**超出部分由玩家在「技能槽指派」面板中指定顶替**（见 [技能槽指派](#技能槽指派)）。**卡牌可授予的能力键全集（8 个）以 `js/tank_cards.js` 的 `ABILITY_KEYS` 为唯一口径**（上述 5 个 runtime 键 + innate 3 键 `repair / medkit / extinguish`）。
    - **#W9 死键删除（2026-10-20，用户裁定「删除」）**：`super_fire_control` / `super_speed` **已整体摘除**（`RULES.abilities` 两键、`ABILITY_KEYS_RUNTIME`、`ABILITY_LABELS`、`tryActivateAbility` 的两个 `case`、battle 的 dispatch 与获得提示、bench 测试按钮、`ABILITY_KEYS` 同步删除）。差集实测依据：RUNTIME 7 键 − 卡牌可授予键 = {`super_fire_control`, `super_speed`}，且 196 张卡 + `tanks/` + `bosses/` 全库两键**零命中** ⇒ 玩家在真实对局中永远拿不到，属死键。删除后 `tryActivateAbility(t, 'super_speed', {})` 返回 `{ok:false, reason:'unsupported'}`（**与合法键无卡时的 `reason:'no-ability'` 可区分**），`test-rework-r1.js` 以负向断言锁死（负向断言是死键类问题的根治手段，见 `DEVELOPMENT-batches-2026-10.md` §4.112）。
    - ~~「7 个键中不存在无激活路径的死键」~~（2026-10-20 前的表述）已被上述 #W9 结论取代——当时 7 键全集里恰好就藏着这 2 个死键。
    - **2026-09-23 A 档**：原 `recon`（侦察/无人机指令）已随 5 张对应卡整体摘除（归口 `docs/specs/cards.md` §3、`DEVELOPMENT.md` §4.35）。
    - **槽满顶替的排队顺序（#U43，2026-10-19 用户反馈「技能顶替时的顺序似乎不正确」）**：`syncSkillSlots(changedKey)` 现在只把**本次新获得且装不进槽**的那个技能放进待指派队列（`reconcileSkillSlotsAfterGain(newKey)` 由 `pickCard` / `__TEST__.giveCard` / `__TEST__.applyCard` 三处传入）。**沿革（已推翻）**：旧口径把「全部已持有但当前不在槽里的技能」都算待指派（按 `cardEffects` 顺序展开），而被顶掉的旧技能同样满足该条件且排在 `cardEffects` 更前面 ⇒ 玩家刚顶替完，面板立刻又追问旧技能放哪一格，读起来就是顺序反了。现行「已持有但未入槽」视为玩家主动放弃，随时可用 **Shift+点击某槽** 手动装回。
    - **护盾的键位（#U44，2026-10-19 用户反馈「战术护盾还在使用 R 触发」）**：**代码中不存在 R 键**——护盾自 #H3 起就走技能池，G/H 专属键已于 #U42 一并退役（`tank_bindings.js` 无 `abilityShield` 键位/说明行；battle `btnG`/`btnH` 按钮与 G/H 轮询已删）。护盾按**获得时的空槽**自动入池：`syncSkillSlots` 逐项填 `slots.indexOf(null)`，槽满才弹顶替面板。若实机仍显示 R 键提示，属浏览器缓存了旧 `tank_bindings.js`（强制刷新即可）。
- **冷却模型（2026-09-17 #C4c 用户裁定「按技能独立冷却」）**：
  - 运行时能力键（`artillery/overdrive/shield/deploy_cover/aps`）与 innate 键（`repair/medkit/extinguish`）统一走**按 key 隔离的独立冷却池 `t.abilityCds[key]`**（互不顶冷却；旧共享单字段 `t.abilityCdT` 废弃，`updateAbilityCd` 仅作兼容助手保留）；逐帧递减 `updateAbilityCds(t, dt)`（battle 主循环驱动）。
  - 获得技能/副武器 → `#gainToast` 屏幕一次性提示（不依赖底部按钮显隐，奖励页/战斗页均可见）+ **已有技能槽按钮金色脉冲**（#B10 保留；沿革：原为 G/H/V 专属字母按钮脉冲，三键已于 2026-09-21 #H3 与 2026-10-19 #U42 全部退役）。
- **各能力键的现行激活入口**：全部运行时技能（`artillery` 炮击 / `shield` 护盾 / `overdrive` 超装填 / `deploy_cover` 战术掩体 / `aps`）**只经技能池槽位 `#skillSlot1~3` + 数字键 1/2/3**；指派与顶替规则归口 [技能槽指派](#技能槽指派)，禁止另立键位口径。
  - **~~独立字母键（G 炮击 / H 定向护盾 / Shift+H 全向护盾 / V 超装填）~~ 已全部退役**：V 于 2026-09-21 #H3 删除（沿革见 [沿革与已作废](./changelog.md)），G/H 于 2026-10-19 #U42 删除；`tank_bindings.js` 现仅有 `benchTestStrike: 'g'`（bench 测试入口，非正式键位）。
  - **战术炮击**：呼叫延迟 AOE 覆盖（`callStrike` / `updateStrikes`），参数 `RULES.abilities.artillery`。
  - **战术护盾**：累计吸收伤害池（`applyShield`），定向/全向参数 `RULES.abilities.shield`。
  - **超装填**：爆发装填 + 立即清零 `reloadT`，激活路径唯一化为 `skillHotkey(n) → DISPATCH`，常驻显示走技能池槽 `#skillSlot1~3`。
  - **战术掩体**：**炮塔正前方**部署充能掩体（2026-09-17 #C4b 用户裁定——部署方向读 `turretAngle`）。**尺寸与数量上限的数值唯一口径 = [部署物与布雷](./deployables.md)，本页不重复罗列。**
  - **烟幕弹已移除**（2026-09-15 W2 用户裁定）：`fireSmokeShell`/`tryFireSmoke`/stepShells smoke 分支/烟幕卡（smoke_screen、ability_smoke_dense）整链删除；`tank_cover.js` smokeClouds 动态烟幕基础设施保留备用（当前无生产者）。

## 技能槽指派

（原 §13.2，2026-09-30 #H3/#H4；用户裁定「循环复用，按玩家选择顶替掉某个槽位的技能」）

- **原缺陷（实测）**：`skillHotkey` 用 `owned[num-1]`（`owned` = `cardEffects` 去重顺序）导致：① `artillery`/`shield` 既有专属键按钮（`btnG`/`btnH`）又自动进槽 ⇒ **同一技能两个按钮**；② 运行时键 7 个 > 槽位 3 个且 TAB 面板无激活入口 ⇒ **第 4 个及以后的技能彻底无法激活**；③ `owned` 不足时回落 `fallbackList(['deploy_cover','artillery'])` ⇒ **按隐藏的 3 号键会实际触发 1 号槽的技能**。（注：此处「7 个」为 2026-10-20 #W9 删键**之前**的实测数；现行 RUNTIME 为 5 键。）
- **现行口径**：
  - **槽位 = `player.skillSlots`**（长度 3，元素为 ability key 或 `null`），随局重置（`prepPlayerForRun` 清空）。
  - **指派流程**：新技能先自动填入空槽；**槽满时弹「技能槽指派」面板（`#skillSlotPicker`）列出 3 个槽各显当前技能，玩家点哪一格，新技能就顶替哪一格**。待指派技能进入队列**逐个弹出**（不静默丢弃）。`Esc` 关闭面板并吞键（不误触发暂停或施放），面板打开期间输入控制器 `gate` 拒绝全部按键。
  - **随时改指**：`Shift+点击`槽位按钮 → 面板列出全部已获得技能（含「清空该槽」）。
  - **数字键严格映射槽位**：`skillHotkey(n)` 只读 `skillSlots()[n-1]`，**空槽无任何效果**（**已删除 `fallbackList` 回落**）。技能键 → 激活动作由 `SKILL_DISPATCH` 单一表分发。
  - **~~专属键按钮~~（已被 #U42 取代，2026-10-19）**：`btnG`/`btnH` 专属键按钮与 G/H 键位**已整体退役**（沿革：#H3 曾按「未占用槽位时显示」折中保留——但双通道仍致同一技能两个键位，且 H 键=定向护盾与技能池=全向护盾**行为不一致**）。现行：**全部运行时技能（2026-10-20 #W9 后为 5 个）只经技能池 skillSlot1~3 + 数字键 1/2/3**；`KEY_BINDINGS` 的 `abilityStrike`/`abilityShield` 键位、说明行、ACTION_ORDER 同步删除；battle 的 G/H 主循环轮询、btnG/btnH 元素、`SKILL_DEDICATED_KEYS` 常量、脉冲回退表 `BTN_BY_ABILITY` 一并移除。bench 测试台保留 G 键为**测试入口**（`KEY_BINDINGS.benchTestStrike` 路由，`activateAbilityForTest` 无卡自动补卡，非正式游戏键位）。同先例：#H3 删超装填 V 键。
  - **角标语义**：技能槽角标为数字 `1/2/3`（对应 `KEY_BINDINGS.skill1~3`）；**弹种槽角标改为选中指示 `●/○`**，其 `title` 统一为「Q/E 环形切换 / 点击选择」——数字键归技能池，弹种切换走 Q/E（消除「按 1 切第一发」的误导）。
- **不变量（#U41 收紧）**：**技能键位单一来源**——运行时技能只存在「技能池槽位」一个入口（无专属字母键、无并列按钮）；innate 三键（repair/medkit/extinguish）是设计上正确的专属键（开局固有、不占技能槽，4/5/6）。
- **回归**：`scripts/test-browser-r4.cjs` E 段——`btnG`/`btnH` **已从 DOM 移除**（#U41）、槽满弹选槽位面板、玩家指定顶替、循环复用不产生重复入口、空槽按数字键不触发、数字键精确命中；C1/C2 段炮击/护盾改经技能池数字键触发。`scripts/test-bindings.js`——`abilityStrike`/`abilityShield` 键位与说明行已删除断言。

## APS 主动防御

（原 §9.4，2026-09-21 #G9，新技能）

`RULES.abilities.aps`：`duration` 6s / `radius` 240px / `maxIntercepts` 3 / `cooldown` 22s。

- 能力键 `aps`（runtime 键，加入 `ABILITY_KEYS_RUNTIME`）；卡牌 `ability_aps`（epic）经技能池 **1~3 号技能键**触发（无独立字母键）。
- 激活：置 `t._apsT = duration`、`t._apsHits = 0`，冷却入 `abilityCds.aps`。
- 拦截层 `updateAps(t, dt)`（页面主循环在 `stepShells` 之后逐帧调用）：`_apsT > 0` 时扫描 `shells`，**敌方阵营**弹药进入 `radius` 即销毁（`s.dead = true`）+ 拦截爆炸/音效/日志；达 `maxIntercepts` 后窗口保持但不再拦截；`_apsT` 递减至 0 自动关闭。
- 生命周期：`removeRunModifiers` 清零 `_apsT`/`_apsHits`（跨局不残留）。
- 与 `shield` 的分工：护盾是**吸收伤害**（入射角/定向/全向 + 吸收池破裂），APS 是**提前销毁弹药**（对己方无吸收池，对高爆/导弹类效果更彻底）。

## 无人机

（原 §4 无人机体系；参数唯一口径 `RULES.abilities.drone`，2026-10-21 核对）

- scout 侦察型：标记视口外敌军位置指示（`RULES.abilities.drone.scoutRange`）**（当前 gated 暂不加入游戏）**。
- striker 打击型：近身环绕索敌开火（`strikeRange` / `fireInterval` 见该配置）、伤害 = `dmgMult` × 拥有者伤害，不消耗玩家弹药。
- 上限 `countMax`，超限拒绝部署；owner 阵亡自动移除。**逐键数值一律回 `RULES.abilities.drone`，本页不重复。**
- **striker 视觉**：播放炮口闪光 + 曳光，保留侦察型离屏指示逻辑备用（`deployDronesFromCards` 已 gate 掉 scout）。

## 相关页面
- [武器与装填](./weapons-reload.md) — 主炮五型、装填时长公式
- [部署物与布雷](./deployables.md) — 战术掩体与地雷的数值表
- [HUD 与界面](./hud-ui.md) — 技能槽 UI、`btnF` 角标
- [曲射火力](./arc-fire.md) — `howitzer` 作为副武器槽的模式语义
