# Rogue Tank — 近期开发计划 (PLAN.md)

本文档是**临时规划**文档，用于细化新特性/重构的执行路径。条目在实现并验证通过后按 4 步生命周期删除并归档（正文写入 `docs/archive/<yyyy-mm>.md` 当月卷，索引行更新进 `docs/ARCHIVE.md`）。

---

（其余无进行中条目。远期项 P-21/P-23/P-24/P-25/P-26 见 docs/archive 快照 §6。）

## 玩法系统 PLAN（2026-08-24）

> 编号说明：原 P-27/P-29/P-30 与 DEVELOPMENT.md §5 记录的历史已完成条目撞号，2026-08-24 起重编号为 P-34/P-35/P-36；本批活跃条目为 P-34~P-41。

### P-34. 终局结算闭环（死亡耗尽 / ESC 主动终止）+ 跨局难度升级 + 手动结算保存
- **目标**：一局不再固定 5 节点收尾——节点链随推进持续延伸（开放式），Boss 每 5 节点出现（协同 P-37）。终局仅两种触发：① 阵亡且复活次数耗尽 → gameover 强制终局；② 战斗中 ESC 暂停面板（P-35）选「终止游戏并结算」→ 主动终局。两路均进入终局结算屏（得分/评分汇总）→ 得分 ×10% 转永久点数 → `profile.difficultyLevel` +1 持久化（下一局叠加入 generateRun 曲线）。另：局内 settlement 保留手动「结算并保存」按钮。
- **改动点**：
  - `js/tank_flow.js`：新增 `pause` 态（已落地，2026-08-24）与转移 battle→pause、pause→settlement（终止并结算）；gameover 保持死亡耗尽出口；扩展白名单表并补单测。
  - `tank_mvp.html`：`nextNodeAfterReward` 末节点分支改为开放式续接生成下一节点而非回图收束；ESC 暂停面板挂「终止游戏并结算」；终局结算屏复用现有 settlement 渲染。
  - `js/tank_map.js`：`generateRun` 支持链尾续接生成；接受 `difficultyLevel` 参数叠加难度曲线；`aiTier` 注入 spawnTank spec（协同 ISSUES #76）。
  - `js/tank_economy.js` + `tank_mvp.html`：difficultyLevel 持久化与任一终局 +1；双账本记分（约定见 P-41）；「结算并保存」按钮调 `saveActiveProfile`。
- **依赖**：P-35（暂停面板承载终止入口）（已落地，2026-08-24）；P-37 提供 Boss 周期标记。
- **验证**：`npm run check` + `npm test`；浏览器连续推进 >5 节点且每第 5 节点遇 Boss；两条终局路径均正确结算且下一局难度提升；中途保存重载生效。

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

---

## 视觉与美术专项 PLAN (P-42 ~ P-45)

> 规则约定：本批计划只做文档层面的美术规范制定与管线规划，暂不改动代码逻辑。

### P-42. 坦克实体贴图与多边形纹理管线 (Tank Assets & Polygon Texturing)
- **目标**：建立完整的坦克位图序列与程序化多边形纹理双重规范，支撑现有 9+ 车型及未来新坦克的战术军武风视觉。
- **具体计划**：
  - **位图精灵通道**：按 `ASSET_DEFS` 规范制作车体 `body.png`、炮塔 `turret.png`、履带 `tracks.png` 及炮口闪光 `muzzle_flash.png`（尺寸 128×64 / 256×128），对齐 `tank_geometry.js` 的 `turretPivot` 与 `gunRoot` 锚点坐标。
  - **程序化多边形纹理通道**：扩展 `tank_paint.js` 的 `paintHull` / `paintTurret` 纹理库，新增装甲焊接线（weld seam）、防滑涂层（anti-slip coating）、防锈底漆露角（edge wear）、铸造装甲颗粒（cast armor texture）及 4 套战术迷彩（森林迷彩/沙地伪装/雪地斑驳/城市灰）。
  - **履带与动感细节**：优化履带 Phase 滚动画法，补充履带断裂（track broken）静态残骸与履带印 (track tread marks) 遗留。
- **产出路径**：规范补充至 `docs/specs/editor.md`；待导出文件准备于 `assets/tanks/{id}/`。

### P-43. 开火、弹道与爆炸特效重构 (Fire, Ballistics & Explosion FX)
- **目标**：重构并增强战斗视觉特效，确保视觉表现完全匹配拟真物理与伤害判定。
- **具体计划**：
  - **开火特效 (Muzzle Flash)**：按弹种（AP/APCR/HEAT/HE）区分炮口火花与气流喷吐形状；HEAT 增加高狭窄金属射流闪光，HE 增加大面积黄红爆焰。
  - **弹道飞行 (Shell Traces)**：AP 灰白实线曳光、APCR 亮蓝高速气流线、HEAT 细长橙红拖尾、HE 滚滚黑烟拖尾；弹道高度/垂直剖面插值实时反映在特效缩放与阴影偏移上。
  - **命中与跳弹 (Hit & Ricochet FX)**：
    - 跳弹（Bounce）：70° 临界点火花飞溅方向与反射法线严格一致，伴随金属刮擦痕迹；
    - 穿透（Penetration）：产生装甲碎片（debris）与内部火花（sparks）；
    - HE 爆轰（Explosion）：爆轰火球与冲击波环（shockwaves）半径严格对齐 `RULES.ammoTypes.HE.splashRadius` (90px)；
    - 殉爆与掀飞炮塔（Turret Blow-off）：优化飞头抛物线弧度、旋转阴影及地面落点烟尘冲击波。
  - **地面痕迹 (Scorches & Scars)**：弹坑与弹着点灼痕 `scorchMarks` 按弹种产生不同形状（AP 小而深，HE 广大而浅）。
- **产出路径**：规范补充至 `docs/specs/combat.md`。

### P-44. 地面 Biome、地形与环境贴图 (Biome Ground, Terrain & Environment Assets)
- **目标**：配合 P-36 / P-40，为 5 大 Biome 地貌及各类掩体/地形提供高质量程序化 bake 与位图资产规范。
- **具体计划**：
  - **Biome 地质底色与平铺纹理**：
    1. 混凝土/城镇 (Concrete/Urban)：铸造灰/沥青暗灰，砖石破损裂纹、马路划线残迹；
    2. 草原 (Meadow)：深浅橄榄绿，杂草斑块与泥土交错；
    3. 黄草/荒漠 (Steppe/Desert)：干枯黄褐与风蚀沙尘纹理；
    4. 泥潭 (Mudland)：暗褐湿润光泽、脚印/车轮痕与洼地积水；
    5. 蓝水/水域 (Water)：深浅蓝绿微波纹理、水岸湿润沙石边缘。
  - **掩体/地形资产 (Cover & Terrain Assets)**：
    - 半高/全高掩体：矮墙 (barricade)、沙袋、碎石堆 (rubble)、残破建筑 (ruined)、完整建筑 (intact) 的像素/程序化纹理，增加法线与阴影表现；
    - 植物层 (Foliage)：树木 (tree)、树干 (stump)、倒树 (fallen)、灌木 (bush) 增加层次感与季节/Biome 色调变化；树冠层 (canopy) 独立渲染支持透视遮挡。
- **产出路径**：规范补充至 `docs/specs/map.md`；文件位于 `assets/covers/` & `assets/biomes/`。

### P-45. 战术 UI、HUD 与小地图视觉提升 (Tactical UI, HUD & Minimap Visuals)
- **目标**：打造沉浸式战术军武 UI/HUD 风格，强化信息传递的清晰度与严肃质感。
- **具体计划**：
  - **战斗 HUD**：拟真装甲车长仪盘样式，装填倒计时环、装甲角度指示器（Angle Indicator）、模块受损状态图标（driver/ammo/engine 等）；
  - **小地图 (Minimap)**：战术雷达质感（暗绿/雷达网格），不同地形（水域/泥地/建筑/半高掩体）图标化高亮，敌人/友军/Boss 战术标记分明；
  - **伤害飘字 (Dmgtext)**：强化 5 色语义（pen 穿透-黄/block 拦截-灰/bounce 跳弹-白/he 爆轰-橙/dot 起火-红）的字形冲击力与飞升淡出曲线。
- **产出路径**：规范补充至 `docs/specs/editor.md` / `docs/specs/map.md`。

---

## 音频与声效专项 PLAN (P-46 ~ P-49)

> 规则约定：本批计划旨在引入外部免费开源音效库（CC0 / OpenGameArt / Freesound）并升级音效系统，暂不改动代码逻辑。

### P-46. 免费音频采样库引入与结构规划 (Free Sound Assets & Directory Structure)
- **目标**：筛选并整理符合 2D 拟真战术军武风格的 CC0/OpenGameArt/Freesound 免费音效采样，建立 `audio/` 存储目录。
- **采样归类与选型**：
  - **武器与火炮**：坦克主炮开火 (heavy/medium cannon)、高爆弹爆响、副武器机枪扫射；
  - **命中与受损**：跳弹金属尖啸 (ricochet/whistle)、装甲击穿切削声、未击穿钝响、履带断裂金属崩裂声、弹药架殉爆；
  - **动力与机械**：柴油引擎低沉轰鸣（怠速/加速/高速）、履带金属绞动声、炮塔旋转齿轮摩擦声；
  - **环境与交互**：泥地/水池/泥潭步进溅射声、树木倒塌折断声、栅栏破坏声；
  - **战术与 UI**：卡牌抽取/点击声、按钮反馈、装填完成机械卡扣声、警告蜂鸣。
- **目录架构**：
  - `audio/combat/`（cannon_fire.wav, ricochet_01.wav, pen_heavy.wav, explosion_large.wav...）
  - `audio/engine/`（diesel_idle.wav, diesel_drive.wav, track_metal.wav...）
  - `audio/env/`（tree_fall.wav, water_splash.wav, mud_squelch.wav...）
  - `audio/ui/`（click.wav, card_select.wav, reload_done.wav...）

### P-47. 双通道 Web Audio 播放器与采样加载器 (Dual-Channel Audio Player & Sampler)
- **目标**：扩展 `tank_audio.js`，实现“音频文件采样优先 + Web Audio 原生合成兜底”的双通道架构。
- **具体计划**：
  - **采样预加载与缓存**：构建 `AUDIO_BUFFERS` 字典，启动时异步 fetch 并通过 `AudioContext.decodeAudioData` 解码音频文件；
  - **平滑回退机制**：若采样文件加载失败（如 404 或 `file://` 跨域限制），`playSound` 自动无缝切回 `SOUND_DEFS` 的 `osc`/`noise` 多层合成器；
  - **实例上限与抢占 (maxConcurrent & Priority)**：引入声音优先级与同类音效最大并发实例限制（如开火最多 3 个，爆轰最多 2 个），避免爆音与性能卡顿。

### P-48. 动态柴油引擎、履带与机械循环声 (Dynamic Engine, Track & Mechanical Loops)
- **目标**：实现依据坦克运动状态（速度/加速度/转向）动态调制 pitch 与 volume 的连续音效。
- **具体计划**：
  - **引擎音效 (Engine Loop)**：根据 `tank.speed / maxSpeed` 动态插值怠速 (idle) 与高转速 (throttle) 采样的音量与 playbackRate；
  - **履带音效 (Track Loop)**：履带 Phase 滚动时触发金属咬合声，转弯时增加侧滑摩擦音效；
  - **炮塔旋转 (Turret Loop)**：炮塔转向角速度 `turretAngVel > 0` 时播放齿轮微弱摩擦声。

### P-49. 2D 战场空间音效与环境反馈 (2D Spatialization & Environmental Audio)
- **目标**：利用 `PannerNode` 与 `AudioListener` 提升 2D 俯视角战场的空间方位感与沉浸感。
- **具体计划**：
  - **摄像机听众绑定**：`setListenerPos(cam.x, cam.y)` 实时随摄像机移动，实现屏幕边缘开火与爆炸的方位感；
  - **距离衰减模型**：采用 `exponential` 衰减模型，`refDistance=100px`, `maxDistance=1200px`，超出视口的战斗提供远沉爆轰感（Lowpass 滤波）；
  - **地形步进音效 (Terrain Footstep/Drive Sound)**：结合 P-40/P-44 地形类型，坦克驶过泥潭 (mud) 触发泥泞溅剥声，驶过水域 (water) 触发水花声，驶过沙石 (rubble) 触发碎石碾压声。



