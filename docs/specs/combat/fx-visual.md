# 特效与视效

> **摘要**：开火、命中、爆轰、焦痕、电磁炮放电各画几层、按什么规则画，以及伤害飘字与曲射弹俯仰。
> **适用版本**：现行（2026-10-22）
> **源自**：`docs/specs/combat.md` §6、§6.1（2026-10-21 拆分）
> **相关**：[音频与音效](./audio.md) · [曲射火力](./arc-fire.md) · [HUD 与界面](./hud-ui.md)

## 目录
- [开火与弹道](#开火与弹道)
- [命中、跳弹与爆轰](#命中跳弹与爆轰)
- [特效分层规范](#特效分层规范)
- [电磁轨道炮三段视效](#电磁轨道炮三段视效)
- [伤害飘字](#伤害飘字)
- [曲射弹体俯仰与透视](#曲射弹体俯仰与透视)

## 开火与弹道

（原 §6，Muzzle & Traces）

- **AP**：灰白实线曳光（tracer），炮口单向锥形火花。
- **APCR**：亮蓝高速气流拖尾（blue-tint tracer），炮口高压窄束闪光。
- **HEAT**：细长橙红高温熔流拖尾，炮口高温金属射流火花。
- **HE**：滚滚黑烟+浓烈黄红烟尘拖尾，炮口大面积圆环爆焰。
- **主炮开火基础特效（原 §5.1，仍有效）**：开火生成炮口双侧+前方闪光（`spawnMuzzleFlash`），炮弹每帧生成曳光拖尾（`spawnTracer`，颜色取自 `ammo.tracer` 或默认 `#ffd24a`），替代原烟雾拖尾。

## 命中、跳弹与爆轰

（原 §6，Hit, Ricochet & Explosion）

- **跳弹 (Bounce)**：严格沿法线方向喷射高亮金黄切削火花（sparks），并在装甲表面留淡灰色划痕。
- **穿透 (Penetration)**：向车体内部与后方喷射装甲金属碎片（debris）与高压火花，触发局部小范围闪光。
- **HE 爆轰 (Explosion)**：爆轰火球 `explosions` 与冲击波 `shockwaves` 扩散半径必须严格按当前弹种的 `splashRadius`（[弹种系统 · 数值总表](./ammo-system.md#数值总表)，唯一数值口径）动态缩放；地面生成深色弹坑痕迹 `scorchMarks`。
- **飞头/殉爆 (Turret Blow-off)**：弹药架致死摧毁触发 `spawnAmmoBlowFx`；炮塔在空中弧形抛物线飞行并剧烈自旋，一路留滚滚黑烟粒子 `smoke`，落地时生成剧烈震屏与落点冲击波。
- **三套此前从未绘制的 FX 已接线**：`drawScorchMarks`（地面贴花层，坦克之下）、`drawShockwaves` 与 `drawTracers`（炮口闪光之后）——两页均在 `tank_battle.html` / `tank_bench.html` 的战斗绘制块中调用。

## 特效分层规范

（原 §6，#FX3-2026-10-18，现行口径）

绘制顺序与层数固定如下，新增特效必须归入其中一层，不得再用「单层渐变平涂」表达有体积的效果。

- **炮口（`drawMuzzleFlashes`）**：① 炮口烟（膨胀烟球，`source-over`，磁轨炮为电离白烟）② 双层火舌（外层宽暗外焰 + 内层窄亮白热芯；按 (宽度角, 长度系数) 烘焙 sprite，绘制期 `drawImage` 缩放旋转）③ 核心圆斑（径向渐变的「过曝白芯 → 琥珀边」）④ 外发光 ⑤ 冲击环。
- **爆轰（`drawExplosions`）**：① 外烟壳（`source-over`，提供暗部对比）② 地面受光晕（`lighter`，照亮脚下地面）③ 主火球（`lighter`，四段色阶）④ 白热核（`lighter`，仅 `t<0.45` 可见）⑤ **12 段不规则冲击边缘**（顶点抖动由 `_fxHash` 派生，非正圆）。
- **焦痕（`drawScorchMarks`）**：三层——尘土光晕（1.35× 椭圆）/ 10 段不规则焦体（半径抖动 0.82~1.12）/ 弹坑内核（0.55× 深色），并带 `min(1, lifeT*12)` 淡入。
- **冲击波（`drawShockwaves`）**：双层环（外环 + 内侧 0.06~0.16 跟进环），`lighter` 合成。
- **确定性硬约束**：**spawn 阶段**可用 `Math.random()`（每次爆炸本就该不同）；**draw 阶段一律禁止**——同帧重绘必须逐字节一致，抖动一律走 `_fxHash` / `_fxNow` 时间量子（见 `js/tank_fx.js` 头部约定）。回归保护：`scripts/test-render.js` ⑤。
- **零逐帧渐变分配约束**：所有径向/线性渐变必须按「色阶名 + 半径档」烘焙为离屏 sprite（`_radialSprite` / `_explosionSprite` / `_plumeSprite` / `_flameGlowSprite`），绘制期只做 `drawImage` + `globalAlpha`。实测 20 个殉爆 + 10 类炮口的每帧 `createRadialGradient/LinearGradient` 分配已降为 **0**（改造前 60 + 61）。
- **烘焙 sprite 的画布必须按弧的伸展定尺寸**（2026-10-18 实测踩坑）：`_plumeSprite` 的外层扇形半径 `R = len × 2.4`，画布高度若按 `len` 定，`wa=0.65` 时外焰垂直方向被切掉 **58px**，炮口焰画出来像被水平削平的梯形。正确做法是按 `R·sin(wa)`（垂直）/ `R`（水平）派生包围盒。回归断言：`scripts/test-render.js` ⑥「四边无触边不透明像素」（对旧公式实测触发 54/56/178 个边缘像素）。
- **地面履带痕迹（#U41，2026-10-19，现行口径）**：`js/tank_fx.js` `trackMarks` 段数组（上限 600、寿命 12s）；`emitTankTracks(t)` 由 `driveTank` 末尾经 `globalThis` 可选调用，左右履带中心与 `paintTracks` 同源（`±(hullWid/2 + trackOffset + trackWidth/2)`），每侧位移 ≥9px 盖章（原地转向画差速弧）；绘制走 `drawTrackMarks`，与焦痕同层（地物/道路之后、坦克之前），深土色 0.20 alpha、前 8% 淡入线性淡出；`clearFx`/`enterBattle`/`devGenNode` 均清空。回归 `scripts/test-trackmarks.js`（9 断言，已登记 run-tests.js）。

## 电磁轨道炮三段视效

（原 §6，#U38 2026-10-18；#U41 2026-10-19 配色与归属修正，现行口径）

参数唯一口径 `RULES.railgunFx`（`js/tank_rules.js`），实现分三阶段，全部由 `reloadT` / 炮身几何派生，**不引入新的运行时状态字段**。

**三色口径（2026-10-19 用户裁定，现行）——炮管=灰 / 基底=蓝 / 弧光=白**：

| 角色 | 配置键 | 现行值 | 语义 |
|---|---|---|---|
| 炮管（金属本体） | `barrelGrey` / `barrelGreyDark` / `barrelGreyLit` | `#787d84` / `#4a4e55` / `#a8aeb6` | 导轨、箍环；**与车体涂装色无关**（旧实现用 `shade(bCol, …)` 取车体色，已废） |
| 炮管宽度倍率 | `barrelWidMult` | **2.2** | 常规口径算出 `barrelWid ≈ 3.2px`，「双轨 + 蓝缝 + 白弧」三层放不下（实测蓝缝被两根灰轨完全盖掉、炮管读作空管）；加宽后装得下。**纯视觉**，不改 `gunRoot`/`gunTip` 与炮口特效坐标 |
| 基底（能量衬底） | `baseBlue` / `baseBlueDeep` / `baseBlueLit` | `#2f5d8c` / `#1b3550` / `#4d8ec4` | **只填两根灰导轨之间的缝隙**（半宽 `railOff − railW×0.45`），不向外包边；`source-over` 实色，**不进 `lighter`**（是固体结构不是光） |
| 弧光 | `arcWhite` / `arcHalo` | `#ffffff` / `rgba(214,232,255,1)` | 充能弧与放电弧共用；纯白弧芯 + 冷白晕（`b−r ≤ 45`，**不再是青蓝**） |

**白/蓝的配比纪律（#U41 实机校色，关键）**：白色在待机态**必须收敛**（`chargeIdleAlpha` 0.16，白芯 alpha 0.18），否则整条缝隙通体发白、蓝色基底被吃掉——实机读作「白炮管」而非「蓝基底 + 白弧光」。**「白」的主载体是充能电弧与击发放电，不是那条连续的轨间芯**。回归断言按充能中（35%）取真、并要求待机白 < 充能白。

| 阶段 | 触发 | 实现 | 视觉 |
|---|---|---|---|
| ① 充能 | 装填期每帧 | `tank_battledraw.js railChargeProgress(t)` → 白色轨间能量芯亮度、冷白后膛核呼吸、`chargeArcs` 条爬行白弧 | 装填越满电弧越多越亮；满电切「微光待机」(`chargeIdleAlpha`) 而非全灭 |
| ② 击发放电 | `firePrimaryShell` 命中 railgun 分支 | `spawnRailDischarge(gunRoot, ang, 炮管长, 1)` → `railArcs` 数组（上限 `FX_MAX_RAIL_ARCS=24`）+ 炮口白色冲击波 | **沿炮管轴向**甩出 `dischargeArcs` 条白弧，0.22s 内沿炮向收束淡出 |
| ③ 弹道 | 炮弹飞行每帧 | `drawShells` 的 `s.wType==='railgun'` 分支 | 针状白热弹（`shellLenMult` 1.9× 长 / 0.55× 宽）+ 白热渐隐拖尾 + 冷白外发光；**不带电弧** |

- **电弧只挂在炮身上（#U41 用户裁定，关键口径）**：`spawnRailDischarge` 的弧起点按 `startT` 沿炮管轴向铺开、横向抖动压在炮身量级内，回归断言锁「炮身走廊内像素 / 走廊外溢出 < 35%」。**炮弹本身不带电弧**——旧 `shellTrailArcs` 配置键与 `drawShells` 的电弧尾迹已删除，`drawShells` railgun 分支只剩针状弹体 + 普通渐隐拖尾。
- **炮身结构细节**：蓝色缝隙衬底 + 灰色双轨本体（暗边/中间调/受光高光三层）+ 3 圈灰色横向箍环（读作一根炮管而非两条线）+ 淡白轨间能量芯 + 冷白后膛核 + 白色充能电弧，共六层；`tank_battledraw.js drawTank` 的 `_isRail` 分支。
- **线宽按 1px 级配（#U41 实测）**：实测炮管 `barrelWid ≈ 3.2px`（×2.2 后约 7px）。`chargeArcWidth 1.2` / `dischargeWidth 0.9` / `dischargeAmp 2.2` 都是按这个量级定的——早期 `2.4× 外晕` 叠在 3px 炮管上，实机糊成一条白斑而不是电弧。
- **充能进度的时长口径**与 HUD 装填环 / `fireTank` 完全同源：`dur = stats.reload × primaryWeaponSpec(t).reloadMult ÷ debuffReloadRate(t)`（公式唯一口径见 [武器与装填 · 装填时长公式](./weapons-reload.md#装填时长公式)）；非电磁炮恒返回 1。
- **电弧几何**走 `js/tank_utils.js lightningPath(x0,y0,ang,len,amp,segs,seed)`：纯函数、两端收敛到轴线、中段抖动由 `seed` 哈希派生（draw 期无 `Math.random`）。这是**共享工具**，`tank_battledraw` / `tank_fx` 两处消费，不得各自手写 zigzag。
- **炮口（`spawnMuzzleFlash('railgun')`）**：白色能量锥 + 针状白热长矛 + 3 条**短**残余分叉（长度明显短于炮身弧，不喧宾夺主）+ 冷白核心/光晕/冲击环（走 `_radialSprite('coreW'/'haloW')`，白烟而非青蓝烟）。
- **音效**：专属键 `firerail`（`SOUND_DEFS`）——高频方波放电下扫 + 带通噪声（电离空气）+ 延迟低频炮身共鸣；电磁炮开火不再复用 `fire`。
- **HUD 装填环**：battle 单环分支对 railgun 改**白色**双层充能弧（外层冷白晕 + 内层纯白芯），与炮身弧光同色；其他武器仍为琥珀色单弧。
- 回归保护：`scripts/test-render.js` ⑩ —— 电弧确定性/端点收敛、充能进度同源、**三色分工分别量测**（灰 261 / 蓝 168 / 充能中白 44 px；待机白仅 2 px 且必须 < 充能白）+ 三色配置值直查 + 放电弧白且锁在炮身走廊（外溢 0%）、弹体不带电弧（青蓝 0 px）、弹体形态与长度、重绘逐字节一致。

## 伤害飘字

（原 §6，Damage Numbers，2026-08-26 原 ISSUES #A6 修复定案）

- 飘字显示 min(res.dmg, 击杀前剩余HP)，击杀伤害不再溢出虚高；
- DOT tick 加存活检查，目标死亡即清 dot 字段（battle + bench 双页一致），尸体不再持续跳字；
- 颜色语义：普通伤害白(plain) / 成员与非弹药架模块黄(module) / 弹药架红(ammoRack)；pen 色保留为 legacy 别名。
- **Boss 飘字放大（2026-10-17 #U13，现行口径）**：`spawnDmgText(x, y, text, kind, scale)` 新增可选 `scale`（字号倍率，缺省 1）。`js/tank_fire.js` 在命中敌对 Boss 时透传 `RULES.boss.bossDmgTextScale`（现行 **1.6**），非 Boss 目标逐字不变；`js/tank_dmgtext.js drawDmgTexts` 按 `t.scale` 缩放字号与上浮距离。

## 曲射弹体俯仰与透视

（原 §6.1，`arcShellPose`，2026-10-20 #X6 现行口径）

**唯一口径**：`js/tank_battledraw.js` 的纯函数 `arcShellPose(s)`（Node 可测；`drawShells` 的 `isArc` 分支消费）。**逻辑层（落点/结算/hit 判定）零改动**——高度与俯仰纯属绘制期量。

**推导**：从**同一个** z 公式求导取伪俯仰，而非另设一套拟合——z(p) = sin(p·π)·H ⇒ `dz/dp = π·cos(p·π)·H`，其中 `p = dist/totalDist`。

**产出三量**：

| 量 | 语义 | 用途 |
|---|---|---|
| `pitch` | 轴向仰角（rad） | 上升段为负（抬头）、下坠段为正（低头）、顶点 ≈ 0 |
| `tilt` | 屏幕倾斜（已做弹道方向投影） | 供 `rotate(ang + tilt)`；`ang ≈ ±90°` 时不翻成 180° |
| `foreshorten` | `cos(pitch)`，**下限 0.55** | 纵向压缩比，防止极端角度压成一条线 |

**绘制约定（易错点，勿改）**：

- 变换 = `rotate(ang + tilt)` + **压长轴** `scale(scale*fore, scale)`——即压 local **x**（弹体长轴）；
- ⚠️ 压 local **y**（短轴）会让弹体「越飞越细」，实机读起来像**在缩水的针**而不是抬头的炮弹；
- **地面阴影恒贴地**，只随 `ang` 与 `z` 变化，**不随 `tilt` 旋转**——影子是地面投影，不是弹体附属物（若随 tilt 转会与地面纹理打架）。

**实测（2026-10-20）**：`p=0.25 → pitch −33.8°`（抬头）/ `p=0.75 → +33.9°`（低头）/ `p=0.5`（顶点）`0.000000°` / 直线弹 `0.00°`（**不受影响**）；阴影主轴角在两姿态点均为 `0.0°`（证明未随 tilt 旋转）；**零逐帧渐变**（曲射 1 次绘制 ≤ 直线 1 次）。回归断言见 `scripts/test-render.js` ⑪ 段（含 ⑩ 电磁炮三色分工不被破坏）。

**沿革**：~~旧实现弹体 `rotate(ang)` 恒平行地面~~（`ang = atan2(s.dy, s.dx)`），高度只做整体上移 + 等比放大 + 地面阴影 ⇒ 上升段不抬头、下坠段不低头、拖尾也不沿含 z 的弹道切线绘制（#X6 原条目描述逐字对应）。

## 弹种三系列命中特效（2026-10-22）

**唯一口径在 [弹种系统 · 弹种三系列与视效分工](./ammo-system.md#弹种三系列ap-he-heat与视效分工2026-10-22)**，本页不重复数值，只给实现落点：

- 弹体外形分派：`js/tank_battledraw.js drawShells`（按 `ammoFamilyOf` 分三形）。
- 命中特效分派：`js/tank_fx.js spawnImpactFx` 的 `'impact_ap' / 'impact_heat' / 'impact_he'` 三档；`drawHitFx` 同步三档闪光配色（AP 冷白、HEAT 橙黄、HE 暖橙）。
- 调用契约：命中结算处把 outcome 从 `'pen'` 改成按 `s.ammo.family` 选的 `'impact_ap' / 'impact_heat' / 'impact_he'`。

## 相关页面
- [弹种系统](./ammo-system.md) — 溅射半径与曳光颜色的数据源
- [曲射火力](./arc-fire.md) — `isArc` 的结算契约
- [音频与音效](./audio.md) — `firerail` 等音效键
- [HUD 与界面](./hud-ui.md) — 装填环与伤害飘字的 UI 契约
