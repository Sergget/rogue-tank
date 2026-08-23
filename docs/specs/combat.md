# 战术坦克 Roguelike — 战斗与物理系统规范 (Combat & Physics Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_rules.js, js/tank_physics.js, js/tank_fire.js, js/tank_geometry.js, js/tank_audio.js, js/tank_fx.js, js/tank_shield.js, js/tank_strike.js, js/tank_drone.js

---

## 1. 战斗立意与物理核心
- **慢节奏、强博弈、拟真物理**：摆角度找跳弹角、找掩体、抢位置，拒绝魔幻特效和高频输出。
- **实时弹道与发射解算**：炮弹按真实物理速度逐帧推进（js/tank_fire.js 的 stepShells），碰撞在命中瞬间判决，支持提前量与动态掩体拦截。

## 2. 装甲与跳弹机制 (Armor & Ricochet)
- **跳弹判定**：入射角 > 70° 时发生跳弹（RULES.ballistics.bounceAngle），沿法线方向真物理反射。
- **二次跳弹禁止**：跳弹后的炮弹标记 canBounce = false，再次命中不再发生二次反射。
- **等效厚度计算**：等效厚度 = 实际装甲厚度 / cos(入射角)。
- **弹药架与模块**：
  - 模块分 driver / ammo / engine / gunner / loader / commander 六类，挂载于装甲边段（RULES.modules.keys）。
  - 弹药架命中造成 2× 伤害；致死命中触发掀飞炮塔（"飞头"殉爆 spawnAmmoBlowFx）；未致死施加 8s 装填 debuff。
  - 发动机命中引发起火 DOT（dps=3.4，5s），并施加机动 debuff。
  - 履带命中 → trackBroken + immobT=8s 锁定。
  - 车长命中 → 全体乘员效果 ×0.85。

## 3. 弹种系统 (Ammo Types)
唯一数据源：RULES.ammoTypes（js/tank_rules.js，机制参数唯一配置源）
- **AP**：标准穿甲弹（基准 pen 1.0× / dmg 1.0× / speed 1.0×）。
- **APCR**：高速穿甲弹（pen 1.2× / dmg 0.8× / speed 1.2×）。
- **HEAT**：破甲弹（pen 1.4× / dmg 1.0× / speed 0.8× / spread 1.2×，noBounce 确定性不跳弹）。
- **HE**：高爆弹（pen 0.7× / dmg 1.0× / speed 0.95×，noBounce，splashRadius=90px）。
  - HE 击穿与未击穿均触发范围溅射（贴脸50%→边缘衰减到0）；未击穿走残余爆轰分支（地板 25%）。
  - HE 破障（A3）：HE 销毁时对落点半径 24px 内可破坏掩体造成 1 点独立破坏伤（与 90px 坦克溅射两套并存）。
  - 特效对齐约定：爆轰视觉特效半径与逻辑 splashRadius 严格一致，杜绝视觉误导。

## 4. 战术能力与主动装备 (Abilities & Drones)
统一入口 tryActivateAbility（G 炮击 / H 护盾 / V 超装填，共享冷却 abilityCdT）
- **烟幕弹 (F键)**：生成区域动态视线掩体（smokeClouds），只阻断 AI 索敌视线（hasLineOfSight=false），不阻挡实弹弹道。
- **战术炮击 (G键)**：呼叫延迟 AOE 覆盖（callStrike / updateStrikes，maxStrikes=3）。
- **战术护盾 (H键 定向 / Shift+H 全向)**：累计吸收伤害池（applyShield，入射角弧度判定吸收）。
- **超装填 (V键)**：reload ×0.45 爆发装填 + 立即清零 reloadT，timed modifier 到期自动恢复。
- **无人机体系**：
  - scout 侦察型：标记视口外敌军位置指示（scoutRange=700px）。
  - striker 打击型：近身环绕索敌开火（strikeRange=260px，fireInterval=2s），不消耗玩家弹药。
  - 上限 countMax=2，超限拒绝部署；owner 阵亡自动移除。

## 5. 战斗核心管线收敛 (js/tank_fire.js, P-28)
- 所有战斗发射、瞄准预测与命中判决唯一收敛于 js/tank_fire.js（~376行，ctx 显式注入）。
- 包含接口：fireTank / fireSmokeShell / tryFire / tryFireSmoke / computeSolution / updateSolution / stepShells / shellVerticalDecision。
- 统一维护半高掩体垂直判决、!s.absorbed 护盾守卫、HE破障/烟幕/二次跳弹禁止语义。
- tank_mvp.html 与 tank_bench.html 双页共用此模块，任何弹道/掩体判决修复单点生效。
