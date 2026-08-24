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

## 6. 特效与视效表现规范 (FX Visual Standards)

- **开火与弹道 (Muzzle & Traces)**：
  - **AP**：灰白实线曳光（tracer），炮口单向锥形火花。
  - **APCR**：亮蓝高速气流拖尾（blue-tint tracer），炮口高压窄束闪光。
  - **HEAT**：细长橙红高温熔流拖尾，炮口高温金属射流火花。
  - **HE**：滚滚黑烟+浓烈黄红烟尘拖尾，炮口大面积圆环爆焰。
- **命中、跳弹与爆轰 (Hit, Ricochet & Explosion)**：
  - **跳弹 (Bounce)**：严格沿法线方向喷射高亮金黄切削火花（sparks），并在装甲表面留淡灰色划痕。
  - **穿透 (Penetration)**：向车体内部与后方喷射装甲金属碎片（debris）与高压火花，触发局部小范围闪光。
  - **HE 爆轰 (Explosion)**：爆轰火球 `explosions` 与冲击波 `shockwaves` 扩散半径必须严格按 `RULES.ammoTypes.HE.splashRadius` (90px) 动态缩放；地面生成深色弹坑痕迹 `scorchMarks`。
  - **飞头/殉爆 (Turret Blow-off)**：弹药架致死摧毁触发 `spawnAmmoBlowFx`；炮塔在空中弧形抛物线飞行并剧烈自旋，一路留滚滚黑烟粒子 `smoke`，落地时生成剧烈震屏与落点冲击波。
## 7. 音频与声效表现规范 (Audio Visual Standards)

- **声音总线与并发管理 (Busses & Concurrency)**：
  - `combat` 总线（主音量受 `AUDIO_SETTINGS.combatGain` 控制）：开火/爆炸/击穿/跳弹/履带断裂，`maxConcurrent=3`；
  - `ui` 总线（主音量受 `AUDIO_SETTINGS.uiGain` 控制）：点击/选卡/装填完成/警告，`maxConcurrent=4`；
- **采样优先与合成兜底 (Sample-Priority Architecture)**：
  - 音频系统优先加载并播放 `audio/` 目录下的 CC0/Freesound 真实采样（WAV/OGG）；
  - 若采样缺失、网络加载超时或本地 `file://` 环境下，系统无缝自动回退至 `SOUND_DEFS` 程序化合成器。
- **2D 空间化与距离衰减 (Spatialization)**：
  - 战斗事件通过 `playSound(key, opts, {x, y})` 传入世界坐标，使用 `PannerNode`（HRTF / `exponential` rolloff）进行定位；
  - 听众位置 `setListenerPos(cam.x, cam.y)` 实时跟随摄像机；超出 1200px 范围的音效自动施加 Lowpass 滤镜模拟远距离钝音感。
