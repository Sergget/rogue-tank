# Rogue Tank — 近期开发计划 (PLAN.md)

本文档是**临时规划**文档，用于细化新特性/重构的执行路径。条目在实现并验证通过后按 4 步生命周期删除并归档（正文写入 `docs/archive/<yyyy-mm>.md` 当月卷，索引行更新进 `docs/ARCHIVE.md`）。

---

（其余无进行中条目。远期项 P-21/P-23/P-24/P-25/P-26 见 docs/archive 快照 §6。）

## 玩法系统 PLAN（2026-08-24）——已全部完成清零

> 编号说明：原 P-27/P-29/P-30 与 DEVELOPMENT.md §5 记录的历史已完成条目撞号，2026-08-24 起重编号。玩法线 P-34~P-41 已全部完成并归档；当前活跃条目为视觉/音频专项 P-42~P-49 与候选库 P-50。

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
- **实施方案细化（2026-08-24）**：
  - **ASSET_DEFS 注册条目字段规范表**：
    | 字段 | 说明 |
    |---|---|
    | id | 资产键，命名规范见下条 |
    | w / h | 位图像素尺寸；body 128×64、turret 256×128、tracks 128×64、muzzle_flash 64×64 |
    | anchorX / anchorY | 车体中心锚点（相对贴图左上），默认建议 = w/2、h/2 |
    | canopyAnchorX / canopyAnchorY | 炮塔枢轴锚点；必须对齐 `tank_geometry.js` 的 `turretPivot(t)` 归一化坐标 × 贴图尺寸后取整（误差 ≤1px） |
    | gunAnchorX / gunAnchorY（可选） | 炮口根点；对齐 `gunRoot(t)` 归一化坐标，供 muzzle_flash / 曳光起点定位 |
    | bake / bakeTurret | 程序化回退绘制函数，必须消费 `opts.{color, texture, detail, heightClass}`，绘制车体轮廓+履带+纹理 |
    - 回退策略：Image 加载失败 → 离屏 canvas 调用对应 bake 烘焙并缓存；bake 也缺失 → 维持 `tank_paint.js` 纯色多边形填充现状。
  - **资产 ID 命名规范**：`tank-{id}-body` / `tank-{id}-turret` / `tank-{id}-tracks` / `tank-{id}-muzzle_flash`；`{id}` 与 `tanks/{id}.json` 文件名严格一致（kebab-case）；现有 9+ 车型逐型登记于 specs/editor.md 附表，新增车型必须先补 ASSET_DEFS 再出图。
  - **像素密度与缩放规则**：基准密度为世界 1px = 贴图 1px；渲染缩放仅允许整数倍（1×/2×）且关闭平滑（imageSmoothingEnabled=false）防糊边；摄像机 zoom 非整数倍时允许线性采样但禁止 mipmap。
  - **调色板规范**：军武主色板 16 色、上限 32 色（Aseprite 索引色管理）；阵营/迷彩变体采用**色板替换表**（同索引映射不同 HEX，如森林 {0:#3d4a2a, 1:#55663a} ↔ 沙地 {0:#8a7a52, 1:#a3926a}），变体不出多套图。
  - **程序化纹理五要素参数表与 bake 流程步骤**：
    | 要素 | 默认参数（可调） |
    |---|---|
    | 焊接线 weld seam | 沿装甲边内缩 2~3px 平行走线，1px 宽，明度 = 底色 ±10%，点划段间距 8~12px |
    | 防滑涂层 anti-slip | 密度 ~12 点/100px²、点半径 1px、明度抖动 ±8%，全顶视面适用 |
    | edge wear | 多边形顶点/凸角处 1~2px 露底漆色 #6e5a43，暴露概率按 heightClass 反比（重坦最少） |
    | 铸造颗粒 cast grain | 1px 噪声颗粒、覆盖率 ~18%，仅炮塔正面弧区 |
    | 迷彩 ×4（森林/沙地/雪地斑驳/城市灰） | blob 半径 4~9px、每 96×48 区域 5~8 块，由色板替换表驱动 |
    - bake 步骤：① 底色 + 伪光照明度渐变（左上亮/右下暗 ±6%）→ ② 防滑涂层 → ③ 铸造颗粒 → ④ 迷彩斑块 → ⑤ 焊接线 → ⑥ edge wear → ⑦ 1px 深色轮廓描边。
  - **履带与动感细节规格**：Phase 滚动 4 帧（相位 0/0.25/0.5/0.75，可选升级 8 帧）；履带断裂残骸为静态单帧散链贴图（3~5 段链节随机散布），同屏上限 32 个、超限移除最旧；履带印起始 alpha 0.35、每秒衰减 0.05（约 7s 淡完），同屏上限 256 条（环形缓冲覆盖最旧）。
  - **导出管线（tools/bake.html 操作步骤）**：① dev server 打开 bake.html → ② 下拉选车型 → ③ 逐项 Export body/turret/tracks/muzzle_flash PNG，导出勾选 **Premultiply Alpha**（防混合边缘发黑）→ ④ 写入 `assets/tanks/{id}/body.png|turret.png|tracks.png|muzzle_flash.png` → ⑤ 若走图集通道则运行 `node tools/pack-sprites.js` 同步 atlas.json UV。四件套缺件自动回退 bake，不阻塞加载。
  - **架构约束**：浏览器端保持全局脚本按序加载（非 ES Module）；ASSET_DEFS 及新增辅助函数须保留底部 `module.exports` 双端导出，保证 Node 侧测试可用。
  - **验收标准**：① `npm run check` 通过且全部车型 ASSET_DEFS 字段齐全；② 有图/无图双路径轮廓一致、炮塔旋转无锚点偏心抖动（≤1px）；③ 16/32 色限制抽查通过；④ 整数缩放无采样糊边；⑤ 履带印/残骸同屏上限生效、满负荷不掉帧。

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
- **实施方案细化（2026-08-24）**：
  - **炮口闪光规格表（×4 弹种，尺寸可调）**：
    | 弹种 | 形状 | 帧数/时长 | 主色→尾色 | 长×宽 px |
    | AP | 锥形星芒 + 短气环 | 3 帧 / 90ms | #fff2c0→#ff9a30 | 34×22 |
    | APCR | 细长针状喷流 | 3 帧 / 70ms | #dff4ff→#7ab8ff | 40×12 |
    | HEAT | 高狭窄金属射流闪光（中轴亮线+侧向小焰） | 4 帧 / 110ms | #ffe9a0→#ff5a20 | 44×14 |
    | HE | 大面积黄红爆焰团 | 5 帧 / 160ms | #fff0b0→#ff4010→#802010 | 56×40 |
    - 定位原点 = `gunRoot` 沿炮管方向前推炮管长度，随炮管角度旋转（复用 `normalizeBarrel` 规格）。
  - **曳光规格表（×4 弹种）**：
    | 弹种 | 颜色 | 宽度 px | 拖尾长度 px | 透明度曲线（头→尾） |
    | AP | #cfd4d8 实线 | 2 | 60 | 0.9→0 线性 |
    | APCR | #9fd0ff | 1.5 | 90 | 1.0→0 指数快衰（λ≈3） |
    | HEAT | #ff8a4a | 1.5 | 45 | 0.85→0 线性 |
    | HE | #55504a 烟团链 | 4（渐扩至 7） | 70 | 0.6→0，每 40ms 一个烟团、膨胀+上飘 |
    - 弹道高度插值：特效纵向缩放 = lerp(0.85, 1.15, 高度归一化)；阴影偏移 = 高度 × 0.4px 向下（与 P-42 阴影方向一致右下）。
  - **命中三类特效规格**：
    - bounce：火花束沿反射法线扇形喷射（±25° 内 6~10 粒），寿命 200~350ms，白黄 #ffffff→#ffd070；附 1 条刮痕 decal（长 8~14px、alpha 0.3、3s 淡出）；二次跳弹禁止 → 二次命中不再喷 bounce 火花束（仅小尘点）。
    - pen：装甲碎片 8~14 片（多边形小片带旋转、重力 600px/s²、寿命 400~700ms）+ 入口内侧火花 10~16 粒（橙白色、寿命 150~300ms）。
    - HE 爆轰：火球半径 r(t)：120ms 内从 0.25×R 涨至 1.0×R，随后 300ms 收缩至 0.6×R 并淡出；冲击波环在 250ms 内从 0 扩展至 splashRadius=90px 后淡出；通用缩放公式 `scale = 当前弹种 splashRadius / 90`，splashRadius 改动时特效等比适配。
  - **殉爆掀飞炮塔抛物线参数建议（均可调）**：初速 vx=±60~120px/s（随机侧向）、vy=-260~-340px/s 向上，重力 g=900px/s²，旋转角速度 ω=±4~7 rad/s，滞空 ~0.6s 落地；落点生成烟尘冲击环（半径 0→50px / 300ms）+ 大椭圆 scorch；飞行期间同步绘制分离投影（随高度偏移的椭圆影）。
  - **scorchMarks 规格**：AP/APCR 小深椭圆（长短轴 ~14×8px、#1a1512、alpha 0.75）；HEAT 中椭圆（20×12px、同色 alpha 0.65）；HE 大浅圆（半径 ~26px、#241d16、alpha 0.55、边缘 3~5 瓣不规则）。存留上限同屏 64 个（环形缓冲覆盖最旧），每个 alpha 每秒衰减 0.02（约 25~37s 淡完）。
  - **对象池与性能预算**：同屏粒子上限 512（可调 384~768），超限时按优先级挤占最旧（命中 > 开火 > 环境）；decal 类独立上限（见上）；全部 FX 对象池化复用避免 GC 抖动。
  - **验收标准**：① 四弹种视觉差异肉眼可辨且参数与 `RULES.ammoTypes` 一致；② bounce 火花主方向与反射法线夹角 ≤25°；③ HE 冲击波环实测最大半径 = splashRadius ±2px；④ 极端混战（8 车 + 连射）帧时间因 FX 劣化 ≤10%；⑤ `npm run check` + 浏览器冒烟无报错。

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
- **实施方案细化（2026-08-24）**：
  - **5 biome 底色 HEX 表与 tile 规格（辅色/密度可调）**：
    | biome | 底色 | 辅色 | 细节元素 |
    | concrete | #6a6d6f | #54575a / #7d8082 | 砖石破损裂纹、马路划线残迹、井盖 |
    | meadow | #4e5c33 | #3f4b28 / #5d6b3e | 杂草斑块、泥土裸露交错 |
    | steppe | #8a7a46 | #77683a / #9c8c55 | 干枯草簇、风蚀沙尘纹 |
    | mudland | #4a3a28 | #3c2f20 / #584633 | 脚印/车轮痕、洼地积水镜面 |
    | water | #2e5560 | #24454e / #3a6570 | 微波高光纹、水岸湿润沙石边缘 |
    - tile 规格：64×64px、四边无缝可平铺（边缘 8px 内不放高频细节）、细节元素 3~6 个/tile；地面由确定性 seed 随机拼接 + ~8% 概率变体 tile 防重复感。
  - **掩体/地形资产规格表**：
    | 资产 | 尺寸 px | 朝向变体 | 阴影偏移 |
    | barricade 矮墙 | 48×24 | 0°/90° 两向 | (+2,+3) |
    | sandbag 沙袋 | 36×20 | 0°/90° | (+2,+3) |
    | rubble 碎石堆 | 40×40 | 同图 ×3 随机种子变体 | (+3,+4) |
    | ruined 残破建筑 | 96×96 | 4 向（缺口朝向各异） | (+4,+5) |
    | intact 完整建筑 | 96×96 | 单型（屋顶俯视） | (+4,+5) |
    - 阴影统一右下柔和投影（黑 alpha 0.25，可调），与车辆阴影方向一致。
  - **植物层规格**：
    | 资产 | 尺寸 px | 图层拆分 |
    | tree 树 | 48×48 | trunk 着地层 + canopy 树冠层（canopyAnchor 定位，独立渲染） |
    | stump 树干 | 24×18 | 单层 |
    | fallen 倒树 | 64×24 | 单层 |
    | bush 灌木 | 28×20 | 单层（半遮挡，遮挡规则同 half tier） |
    - 透视遮挡 alpha 规则：canopy 层最后绘制（`drawAssetCanopy`），单位处于其正下时 canopy alpha 降至 0.45（≤100ms 平滑过渡），离开恢复 1.0；
    - 季节/biome 色调变化实现方式：单一中性绿源图 + **色板 tint**（离屏 tint 缓存按 biome 键缓存），不产出多套季节图。
  - **文件路径规划完整清单**：
    - `assets/biomes/{biome}/tile_00.png`（可选 `tile_01..03` 变体），biome ∈ concrete/meadow/steppe/mudland/water；
    - `assets/covers/`：`barricade_h.png|barricade_v.png`、`sandbag_h.png|sandbag_v.png`、`rubble_00..02.png`、`building_ruined_n|e|s|w.png`、`building_intact.png`；
    - 植物层：`tree.png` + `tree_canopy.png`、`stump.png`、`fallen_tree.png`、`bush.png`。
  - **与 P-40 tier 的 drawStyle 对应关系表**：
    | P-40 tier | drawStyle | 资产来源 |
    | intact | full-block 不透明 | building_intact / tree canopy |
    | ruined | full-block + 破损轮廓 | building_ruined_* |
    | rock / rubble | OBB 碰撞 + 碎石贴图 | rubble_* |
    | half（sandbag/barricade） | 半高剖面垂直遮挡 | sandbag_* / barricade_* |
    | bush / foliage | 半透明遮挡（alpha 插值） | bush / tree_canopy |
    | water / mud | 地面 tile 层、无碰撞 | biomes tiles |
  - **验收标准**：① 5 组 tile 无缝平铺目检无接缝；② canopy 遮挡 alpha 切换 ≤100ms 无跳变；③ 全部资产具备 bake 回退且双路径轮廓一致；④ 文件清单与注册表一一对应、缺件回退不报错；⑤ 规范落 specs/map.md 后 `npm run check` 通过。

### P-45. 战术 UI、HUD 与小地图视觉提升 (Tactical UI, HUD & Minimap Visuals)
- **目标**：打造沉浸式战术军武 UI/HUD 风格，强化信息传递的清晰度与严肃质感。
- **具体计划**：
  - **战斗 HUD**：拟真装甲车长仪盘样式，装填倒计时环、装甲角度指示器（Angle Indicator）、模块受损状态图标（driver/ammo/engine 等）；
  - **小地图 (Minimap)**：战术雷达质感（暗绿/雷达网格），不同地形（水域/泥地/建筑/半高掩体）图标化高亮，敌人/友军/Boss 战术标记分明；
  - **伤害飘字 (Dmgtext)**：强化 5 色语义（pen 穿透-黄/block 拦截-灰/bounce 跳弹-白/he 爆轰-橙/dot 起火-红）的字形冲击力与飞升淡出曲线。
- **产出路径**：规范补充至 `docs/specs/editor.md` / `docs/specs/map.md`。
- **实施方案细化（2026-08-24）**：
  - **HUD 元素清单表（数值均可调）**：
    | 元素 | 规格建议 |
    | 装填倒计时环 | 外半径 26px、线宽 4px、进度色 #d8c86a、背景环 #333830 alpha 0.6、装填完成瞬间闪白 1 帧；环心显示剩余秒数（13px） |
    | 装甲角度指示器 | 炮塔外圈弧形刻度（半径 ~34px、跨度 ±90°），当前入射角指针 + >70° 跳弹危险区红橙弧 #ff6a3a |
    | 模块受损图标集 | driver/ammo/engine/tracks/gun/loader 六枚 14×14px 单色剪影 × 三态配色：正常 #9aa88a / 受损 #e0a030 / 损毁 #c04030 |
    | 血量/护盾条 | 宽 140px 高 8px、圆角 2px、底板 #222 alpha 0.55 |
  - **小地图雷达风格规范**：面板底暗绿 #14231a alpha 0.85、网格间距 24px（minimap 坐标系）线色 #234030；地形图标化符号集——water 双波浪线 #3a7a8a、mud 点阵 #6a5a3a、building 实心方块 #8a8a82、half-cover 空心方块 #6a7a5a；单位标记——敌=红三角 #e04838、友=绿圆 #58c058、玩家=白箭头、Boss=大红菱形 + 外圈脉动环；视野范围淡白扇形。布局继续复用 `tank_minimap.js` 的 minimapLayout/worldToMinimap 纯函数，仅扩展绘制样式。
  - **伤害飘字五色语义字形规格**（衔接 `tank_dmgtext.js` 五色语义）：
    | 语义 | 色 | 字号 | 飞升速度→衰减 | 缓出曲线 | 存活时长 |
    | pen | 黄 #ffd84a | 14→17px | 初速 46px/s 减速至 0 | easeOutCubic | 0.9s |
    | block | 灰 #b8bcc0 | 13px | 36px/s | easeOutQuad | 0.8s |
    | bounce | 白 #f2f2f2 | 13px + 斜向漂移 | 40px/s | easeOutQuad | 0.7s |
    | he | 橙 #ff8a30 | 15px | 50px/s | easeOutCubic | 0.9s |
    | dot | 红 #e04838 | 12px（小而频繁） | 30px/s | linear | 0.6s |
    - 统一 1px 深色描边 #14100c；出现前 80ms 缩放弹入（0.6→1.0）。
  - **UI 风格统一约束**：字体族 `"Segoe UI", Arial, sans-serif`，数字启用 tabular-nums 防跳动；面板统一圆角 3px、1px 描边 #3a4038、面板底 alpha 0.55~0.70；强调色军黄 #d8c86a、警示红 #e04838；禁用纯饱和原色。
  - **产出物路径取舍说明**：优先**纯程序化绘制**（延续 tank_battledraw/tank_minimap 显式传 ctx 风格，零资产依赖、模块保持 Node 可测试）；仅当图标细节超出程序化合理复杂度（如六枚模块剪影）才落 `assets/ui/modules/*.png` 并登记 ASSET_DEFS；取舍结论记录于 specs/editor.md。浏览器端全局脚本加载顺序与非 ES Module 架构不变。
  - **验收标准**：① HUD 全元素在 1280×720 与 1920×1080 下不错位；② 小地图符号与地形实际类型一一对应、敌我 Boss 标记可即时区分；③ 五色飘字语义肉眼可辨且动画参数符合本表；④ 若零新增位图则 `npm test` 全绿不受影响；⑤ 规范落档后 `npm run check` 通过。

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
- **实施方案细化（2026-08-24）**：
  - **音效键清单表**（键名 → 用途 → 触发场景 → 来源候选检索关键词 → 格式规范）：

    | 键名 | 用途 | 触发场景 | 检索关键词（Freesound / OpenGameArt / Sonniss GDC 包） | 格式规范 |
    |---|---|---|---|---|
    | fire | 主炮开火 | 任意坦克开火（4 弹种共用，pitch 微随机区分） | "tank cannon fire", "120mm gunshot", "artillery blast" | WAV 44.1kHz 16bit 单声道 SFX |
    | pen | 装甲击穿 | 命中结果 pen（穿透切削） | "metal penetration screech", "armor pierce clang" | 同上 |
    | block | 未击穿钝响 | 命中结果 block（拦截） | "armor impact dull thud", "ricochet thunk metal" | 同上 |
    | bounce | 跳弹尖啸 | 命中结果 bounce（>70° 反射） | "bullet ricochet whistle", "ricochet ping" | 同上 |
    | ammoBlew / ammoBlewAP / ammoBlewHE | 弹药架殉爆（通用/AP/HE 变体） | 模块损伤弹药架殉爆 | "ammunition explosion", "interior explosion tank" | WAV 44.1kHz 16bit 单声道，允许轻微立体声宽化后处理 |
    | trackBreak | 履带断裂 | 模块损伤履带断裂 | "metal crash debris", "track break clank" | WAV 44.1kHz 16bit 单声道 |
    | fireDOT | 起火燃烧 | dot 持续伤害 tick | "fire crackle loop short", "burning metal creak" | WAV 44.1kHz 16bit 单声道，可选 loopable |
    | flyby | 炮弹掠空 | 高速炮弹近距掠过摄像机 | "shell flyby whoosh" | 同上 |
    | engine | 引擎循环 | P-48 动态引擎层 | "diesel engine idle loop", "tank engine drive loop" | WAV 44.1kHz 16bit 单声道，必须无缝 loopable（首尾交叉淡化） |
    | trackFx | 履带机械循环 | P-48 履带滚动/侧滑 | "tracked vehicle rattle loop", "metal tread clank" | 同上 |
    | turretLoop | 炮塔齿轮摩擦 | P-48 炮塔回旋 | "gear grind slow", "motor whir mechanical" | 同上 |
    | waterSplash | 涉水 | P-49 water tier 行驶 | "water splash shallow", "driving through water" | 同上 |
    | mudSquelch | 泥泞 | P-49 mud tier 行驶 | "mud squelch", "wet soil suction" | 同上 |
    | rubbleCrunch | 碎石碾压 | P-49 rubble/ruined tier 行驶 | "gravel crunch", "rubble crush short" | 同上 |
    | treeFall | 树木倒塌 | 掩体破坏（树 tier） | "tree fall crash forest" | 同上 |
    | fenceBreak | 栅栏破坏 | 掩体破坏（栅栏/沙袋 tier） | "wooden fence break", "sandbag hit thud" | 同上 |
    | cardSelect | 卡牌抽取 | 卡牌奖励界面选择 | "card slide pick", "paper flick" | WAV 44.1kHz 16bit 单声道 UI 短音 |
    | click | 按钮 | 全局按钮反馈 | "ui click soft", "button press plastic" | 同上 |
    | reloadDone | 装填完成 | 主炮装填完毕卡扣 | "metal latch click", "bolt lock mechanical" | 同上 |
    | warnBeep | 警告蜂鸣 | 低血量/弹药架受损警告 | "warning beep military", "alarm short tone" | 同上 |
    | settleJingle | 结算/商店确认 | 节点结算、局内商店购买（P-41）、奖励领取 | "success chime short", "coin reward" | 同上 |
  - **现有 SOUND_DEFS 八键映射对照表**（合成兜底保留，采样命中即替换音源不改触发点）：`fire→combat/fire_*.wav`；`pen→combat/pen_*.wav`；`block→combat/block_*.wav`；`bounce→combat/bounce_*.wav`；`ammoBlew(+AP/HE)→combat/explosion_ammo_*.wav`；`trackBreak→combat/track_break_*.wav`；`fireDOT→combat/fire_dot_loop.wav`；`ui→ui/click_*.wav`。后补键（engine/trackFx/flyby 等）直接对应新采样，无历史映射。
  - **许可合规要求**：CC0 优先选入；CC-BY / CC-BY-SA 允许但必须在 `audio/CREDITS.md` 逐文件记录，字段约定固定为：`file`（相对路径）/ `title` / `author` / `source_url` / `license` / `modifications`（是否裁剪/降采样）/ `added_date`。无 CREDITS.md 条目的 CC-BY 文件视为不合规，构建前校验脚本应报错。
  - **audio/ 四子目录完整文件名规划**（变体命名 `_01/_02/_03` 约定，同键至少 2 个变体防听感重复）：
    - `audio/combat/`：fire_01/02/03.wav、pen_01/02.wav、block_01/02.wav、bounce_01/02/03.wav、explosion_ammo_01/02.wav（AP/HE 变体以 pitch 后缀 `_ap/_he` 区分）、track_break_01/02.wav、fire_dot_loop.wav、flyby_01/02.wav；
    - `audio/engine/`：diesel_idle_loop.wav、diesel_drive_loop.wav、track_metal_loop.wav、turret_gear_loop.wav；
    - `audio/env/`：water_splash_01/02/03.wav、mud_squelch_01/02/03.wav、rubble_crunch_01/02.wav、tree_fall_01.wav、fence_break_01/02.wav；
    - `audio/ui/`：click_01/02.wav、card_select_01/02.wav、reload_done.wav、warn_beep.wav、settle_jingle.wav；
    - **随机变体防重复机制设计说明**：播放时使用「洗牌袋（shuffle bag）」而非纯随机——同键把全部变体索引洗入队列，逐个弹出，取尽后重新洗牌；保证任一变体不会连续两次出现，且各变体出现频次均匀。
  - **文件体积预算**：单文件 ≤ 300KB（loopable 循环类放宽至 ≤ 800KB，可调）；`audio/` 目录总包上限 ≤ 8MB（可调）；首版统一 WAV 保证 `decodeAudioData` 行为一致，后续如需压缩再评估 OGG（需双端回退验证）。
  - **验收标准**：① 清单表中每个键在 `audio/` 下有 ≥1 个实际文件且命名符合规划；② 全部文件为 WAV 44.1kHz 16bit（loopable 文件首尾无缝）；③ `audio/CREDITS.md` 覆盖所有非 CC0 文件且字段齐全；④ 总体积 ≤ 预算上限；⑤ 纯文档阶段不改动任何 js/html 代码。

### P-47. 双通道 Web Audio 播放器与采样加载器 (Dual-Channel Audio Player & Sampler)
- **目标**：扩展 `tank_audio.js`，实现“音频文件采样优先 + Web Audio 原生合成兜底”的双通道架构。
- **具体计划**：
  - **采样预加载与缓存**：构建 `AUDIO_BUFFERS` 字典，启动时异步 fetch 并通过 `AudioContext.decodeAudioData` 解码音频文件；
  - **平滑回退机制**：若采样文件加载失败（如 404 或 `file://` 跨域限制），`playSound` 自动无缝切回 `SOUND_DEFS` 的 `osc`/`noise` 多层合成器；
  - **实例上限与抢占 (maxConcurrent & Priority)**：引入声音优先级与同类音效最大并发实例限制（如开火最多 3 个，爆轰最多 2 个），避免爆音与性能卡顿。
- **实施方案细化（2026-08-24）**：
  - **AUDIO_BUFFERS 缓存字典生命周期设计**：
    - **惰性加载时机**：`AUDIO_BUFFERS[key] = {buffer|null, state: 'loading'|'ready'|'failed'}`；首次 `playSound(key)` 若 state 为 undefined 则发起 fetch 并立即走合成兜底（当次不等待），加载完成后的下一次调用切换到采样；
    - **预加载清单分级**：进入战斗节点时预加载 combat 组（fire/pen/block/bounce 优先，其余 combat 键次级异步）；实体 spawn 时预加载 engine 组循环；UI 组在首页空闲时预载；env 组按当前 biome 的 tier 子集预载（配合 P-40/P-44）；
    - **内存释放策略**：跨节点复用不释放；设 LRU 总量上限（默认 64MB，可调），超限时释放最久未使用的非循环 buffer（loop 类常驻），state 重置为 undefined 以便再次惰性加载。
  - **回退判定具体条件与粒度**：满足其一即该 key 判定失败——① fetch 响应非 2xx（404/500）；② `decodeAudioData` reject（损坏/不支持格式）；③ `location.protocol === 'file://'` 探测命中则整个会话直接跳过 fetch 尝试。**切换粒度为 per-key**：失败 key 标记 `state='failed'` 并永久走 SOUND_DEFS 合成（本会话不再重试），不影响其他 key 继续用采样；无任何全局开关。
  - **maxConcurrent 与 priority 参数表建议**（oldest-steal 抢占：同键超限停掉最旧实例而非拒绝新实例）：

    | 键组 | priority | maxConcurrent | 说明 |
    |---|---|---|---|
    | ammoBlew 系列 | 110 | 2 | 最高优先，殉爆不可被淹没 |
    | fire | 100 | 3 | 开火连发防爆音 |
    | pen | 90 | 4 | 高频命中主反馈 |
    | trackBreak | 80 | 2 | |
    | block | 70 | 5 | |
    | bounce | 60 | 5 | |
    | fireDOT / flyby | 40 | 2 | 低优先 tick 类 |
    | env（splash/mud/rubble） | 35 | 4 | |
    | ui 组 | 30 | 8 | 不参与战斗抢占 |
    | engine/track/turret loop | — | 1 | 单实例循环，不受并发限制 |
  - **playSound 入口签名向后兼容约定**：保持 `playSound(key)` 及现有全部调用点零改动；新增能力只经可选第二参数扩展（如 `playSound(key, {worldX, worldY, loopId})`），缺省行为与 M1 完全一致。
  - **Node 双端可测性拆分建议**：把决策逻辑抽成纯函数 `resolvePlayback(key, playerState) → {action: 'sample'|'synth'|'steal'|'skip', victimId?}`（输入缓存状态/并发计数/优先级表，输出动作，零 Web Audio 依赖）供 Node 测试；AudioContext/PannerNode 等副作用封装在浏览器专属分支。沿用共享模块底部 `module.exports` 双端导出约定（浏览器全局脚本、Node require 两栖）。
  - **验收标准**：① 断网/删除 audio/ 目录时所有音效仍由合成兜底正常发声（per-key 回退无全局失效）；② file:// 协议打开不产生控制台报错风暴；③ 同键并发不超上限且被抢的是最旧实例；④ `resolvePlayback` 纯函数在 Node 测试覆盖 sample/synth/steal/skip 四分支；⑤ 现有 `playSound(key)` 调用点 diff 为零。

### P-48. 动态柴油引擎、履带与机械循环声 (Dynamic Engine, Track & Mechanical Loops)
- **目标**：实现依据坦克运动状态（速度/加速度/转向）动态调制 pitch 与 volume 的连续音效。
- **具体计划**：
  - **引擎音效 (Engine Loop)**：根据 `tank.speed / maxSpeed` 动态插值怠速 (idle) 与高转速 (throttle) 采样的音量与 playbackRate；
  - **履带音效 (Track Loop)**：履带 Phase 滚动时触发金属咬合声，转弯时增加侧滑摩擦音效；
  - **炮塔旋转 (Turret Loop)**：炮塔转向角速度 `turretAngVel > 0` 时播放齿轮微弱摩擦声。
- **实施方案细化（2026-08-24）**：
  - **引擎循环调制参数表**：

    | 参数 | 数值（默认，可调） | 说明 |
    |---|---|---|
    | playbackRate 区间 | 0.85 ~ 1.25 | 按 `speed/maxSpeed` 线性映射 idle→throttle |
    | volume 曲线 | 0.25 → 0.70 | 按 `(speed/maxSpeed)^1.5` 缓动（低速段更安静） |
    | 插值平滑时间常数 | 加速 τ=0.15s / 减速 τ=0.35s | 一阶低通平滑，不对称常数模拟柴油机响应迟滞 |
    | 静止怠速保底 | speed < 0.05×maxSpeed 时锁定 idle 采样 | 防止蠕动速度抖动 |
  - **履带循环节奏同步方式**：track click 与履带渲染 Phase 同源——每累计 Phase 走过 π 弧度触发一次 `trackFx` 短击（左右交替 pan ±0.2），Phase 由 `tank_move.js` 已有的履带相位驱动，天然与视觉滚轮同步；速度 < 0.1×maxSpeed 不触发；**转弯侧滑触发阈值**：`|turnRate × speed| > 0.6 × (turnRate上限 × maxSpeed)`（可调）时叠加侧滑摩擦层（volume 随超出比例 0→0.4 映射）。
  - **炮塔旋转齿轮声**：`|turretAngVel| > 0.15 rad/s` 启动；volume 线性映射 0 → 0.3（对应 0.15 ~ 1.2 rad/s，可调）；playbackRate = 0.9 + 0.3 × 归一化角速度；角速度回落到阈值下继续播放至包络 release 收尾（≥0.3s）防咔哒断音。
  - **多车并存混音规则**：玩家循环全量播放；敌方/友军按距摄像机距离排序取最近 N=3（可调）辆播放循环，其余静默；全场景循环实例总数上限 4（玩家 3 层算 1 辆），超限按距离砍尾。
  - **停止条件**：实体死亡立即 fade-out（≤0.3s）停止其全部循环；flow 进入 settlement/reward/map/gameover 态统一停止并复位调制参数；ESC 暂停面板打开时 master 总线 duck 至 -12dB（可调，或直接 gain=0），关闭恢复。
  - **Node 可测性约束**：`engineMod(speedRatio)`、`shouldTrackTick(phaseDelta)`、侧滑判定等调制计算抽为纯函数（零 Web Audio 依赖）供 Node 测试；音频图搭建留在浏览器分支；模块保持底部 `module.exports` 双端导出。
  - **验收标准**：① 引擎 pitch/volume 随油门连续变化无可闻台阶；② 履带短击与画面履带滚轮节奏一致；③ 转弯急转可闻侧滑层；④ 多车场景循环实例 ≤ 上限且优先最近车辆；⑤ 死亡/结算/暂停三态循环正确停止；⑥ 调制纯函数 Node 测试通过。

### P-49. 2D 战场空间音效与环境反馈 (2D Spatialization & Environmental Audio)
- **目标**：利用 `PannerNode` 与 `AudioListener` 提升 2D 俯视角战场的空间方位感与沉浸感。
- **具体计划**：
  - **摄像机听众绑定**：`setListenerPos(cam.x, cam.y)` 实时随摄像机移动，实现屏幕边缘开火与爆炸的方位感；
  - **距离衰减模型**：采用 `exponential` 衰减模型，`refDistance=100px`, `maxDistance=1200px`，超出视口的战斗提供远沉爆轰感（Lowpass 滤波）；
  - **地形步进音效 (Terrain Footstep/Drive Sound)**：结合 P-40/P-44 地形类型，坦克驶过泥潭 (mud) 触发泥泞溅剥声，驶过水域 (water) 触发水花声，驶过沙石 (rubble) 触发碎石碾压声。
- **实施方案细化（2026-08-24）**：
  - **AudioListener 绑定约定**：在 mvp 页 `update()` 循环内每帧同步一次（随 rAF，不额外节流）：`listener.positionX/Y = cam.x/cam.y`，`positionZ = 0`；朝向固定 forward=(0,-1)、up=(0,0,1)（俯视角恒定，无需旋转监听器）。
  - **距离衰减参数复核**：维持 `distanceModel='exponential'`、`refDistance=100px`、`maxDistance=1200px`；`rolloffFactor` 建议 combat=1.2、env=1.5、ui 不空间化（直连 ui 总线）（均可调）。1200px ≈ 覆盖典型视口对角线，视口外战斗保留远沉爆轰可闻度。
  - **Lowpass 远场滤波截止频率曲线建议**：`cutoff = 800 + 19200 × (1 − d/maxDistance)^1.5` Hz（近场 20kHz 全频 → 远场趋近 800Hz 闷响，指数 1.5 可调）；仅对含爆炸成分的键（fire/ammoBlew/pen/he 类）启用，UI 与循环声不滤波。
  - **PannerNode panningModel 选型结论：equalpower**。理由：2D 俯视角无高度维信息，HRTF 的三维卷积优势无法体现，反而引入音色染色与前后镜像混淆，且每实例 CPU 开销显著更高；equalpower 计算廉价、左右方位感对本项目完全够用，与大量并发 combat 实例的性能预算匹配。
  - **地形 tier → 音效键映射表**：`water → waterSplash(_01..03)`；`mud → mudSquelch(_01..03)`；`ruined/rubble → rubbleCrunch(_01..02)`；`rock/intact grass → 无叠加`（可调，后续可加轻胎噪）。**触发机制为行程间隔而非定时器**：按该坦克累计行驶里程每 ~90px（可调）触发一次变体抽取（洗牌袋），静止不触发、速度快自然高频，里程清零于 tier 切换时（换地形立即允许触发一次）。
  - **总线分组与增益结构**（四总线，master 为根）：

    | 总线 | 相对增益 | 挂载内容 |
    |---|---|---|
    | master | 1.0 | 总出口，暂停 duck 作用于此 |
    | combat | 0.5（沿用现有 combatGain） | fire/pen/block/bounce/ammoBlew/trackBreak/fireDOT/flyby + engine/track/turret 循环 |
    | ui | 0.25（沿用现有 uiGain） | click/cardSelect/reloadDone/warnBeep/settleJingle，不空间化 |
    | env | 0.4（新增，可调） | water/mud/rubble/treeFall/fenceBreak，参与空间化 |
  - **Node 可测性约束**：tier→键映射、里程触发判定、cutoff 曲线计算抽为纯函数供 Node 测试；PannerNode/AudioListener 副作用留浏览器分支；保持 `module.exports` 双端导出约定。
  - **验收标准**：① 屏幕边缘外开火有声像偏移与低通闷响；② equalpower 下无前后镜像错乱投诉点；③ 涉水/入泥/碾石切换地形即时换音且静止无声；④ 四总线增益独立可调、暂停时整体 duck；⑤ 映射与曲线纯函数 Node 测试通过。

---

## 远期候选设计选项 (P-50)

> 说明：本部分记录经讨论定案的远期候选设计选项，作为后续版本设计的决策参考与候选库，不作为当前版本的直接落地实施规划。

### P-50. 战术动态隐蔽、扇形盲射压制与残余隐蔽机制（候选选项）
- **定位**：远期候选设计选项（非当前落地实施规划）。
- **具体选项与方案设计**：
  1. **盲射压制方式（选项 B：扇形扫射）**：丢失 LoS 后进入盲射压制期 $T_{\text{sup}}$（受难度缩放），AI 以 `lastKnownPlayerPos`（最后已知坐标）为中心，向隐蔽区域左右扇形区域做弧形扫射压制，逼迫隐蔽中的玩家微调走位。
  2. **玩家开火破隐机制（选项 B：残余隐蔽）**：隐蔽内开火不触发瞬间全场暴开锁定，而是增加“暴露值”。单发冷枪仅增加暴露值并诱发 AI 向开火点盲射；连续开火使暴露值满后才彻底破隐，重置为全场 AI 直接锁定。
  3. **镜头缩放**：保持现有的滚轮手动缩放机制，隐蔽时不进行自动镜头拉远/缩放。
  4. **卡牌视野/隐蔽联动（选项 B 考虑）**：局内卡牌（如微声炮管、消焰器、热成像仪等）通过“降低开火暴露值”、“缩小开火暴露半径”或“加速 AI 降级”与残余隐蔽机制联动。
  5. **AI 降级链**：盲射压制期 $T_{\text{sup}}$ 结束转入 `search` 扫视，玩家持续不开火达 $T_{\text{deg}}$（受难度缩放）后清除 `lastKnownPlayerPos` 降级为 `patrol` 巡逻。




