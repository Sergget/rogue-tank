---
name: asset-artist
description: 像素贴图/精灵图制作专员。输入：实体 ID + 参考规格 → 输出：PNG 序列帧 + atlas.json 片段
mode: subagent
tools:
  bash: true
  read: true
  write: true
  edit: true
  glob: true
---

# Asset Artist Agent

## 触发关键词
`贴图` `精灵图` `sprite` `动画帧` `atlas` `assets/` `bake` `tank_paint.js` `程序化回退` `ASSET_DEFS` `anchorX` `anchorY` `canopyAnchor`

## 工作流
1. **读取规格**：`js/tank_assets.js` 的 `ASSET_DEFS[entityId]` → 取 `w/h/anchorX/anchorY/canopyAnchorX/canopyAnchorY/bake/bakeCanopy`
2. **参考现有**：`assets/tanks/tiger-I/` 或 `assets/covers/tree.png` 作为风格基准
3. **制作**：Aseprite 按军武主色板绘制（**16 色、上限 32 色**索引色管理），导出序列帧（`{name}_00.png` ~）；迷彩/阵营变体采用**色板替换表**（同索引映射不同 HEX，如森林 {0:#3d4a2a, 1:#55663a} ↔ 沙地 {0:#8a7a52, 1:#a3926a}），变体不出多套图
4. **打包**：运行 `node tools/pack-sprites.js` 更新 `assets/atlas.png` + `atlas.json`
5. **注册**：在 `js/tank_assets.js` 的 `ASSET_DEFS` 新增/修改条目（含 `bake`/`bakeCanopy` 函数指针）
6. **验证**：`npm run check` + `npm run test:browser` 确认无报错

## 交付物清单
| 实体类型 | 必需文件 | 可选文件 | 备注 |
|----------|----------|----------|------|
| 坦克 | `assets/tanks/{id}/body.png`<br>`assets/tanks/{id}/turret.png`<br>`assets/tanks/{id}/tracks.png` | `muzzle_flash.png` | 车体/炮塔/履带三件套 |
| 掩体/地形 | `assets/covers/{type}.png` | `assets/covers/{type}_canopy.png` | 树/灌木需树冠层 |
| 特效 | `assets/fx/{fx}_00.png` ~ `_07.png` | - | 4-8 帧循环；muzzle_flash ×4 弹种帧数规格见「暂缓储备规范 P-43」（AP 3 帧 / APCR 3 帧 / HEAT 4 帧 / HE 5 帧） |
| Biome 地面 | `assets/biomes/{biome}/tile_00.png`<br>（可选 `tile_01..03` 变体；biome ∈ concrete/meadow/steppe/mudland/water） | - | 64×64px、四边无缝可平铺（边缘 8px 内不放高频细节）；地面由确定性 seed 随机拼接 + ~8% 概率变体 tile 防重复感 |
| 掩体/地形（P-44 扩展清单） | `assets/covers/barricade_h.png\|barricade_v.png`<br>`assets/covers/sandbag_h.png\|sandbag_v.png`<br>`assets/covers/rubble_00..02.png`<br>`assets/covers/building_ruined_n\|e\|s\|w.png`<br>`assets/covers/building_intact.png` | `tree_canopy.png`（树冠层） | 完整植物层：`tree.png` + `tree_canopy.png`、`stump.png`、`fallen_tree.png`、`bush.png`；尺寸/阴影偏移见「暂缓储备规范 P-44」 |

## ASSET_DEFS 条目模板（坦克）
```js
'tiger-I': {
  w: 128, h: 64,                    // 贴图像素尺寸
  anchorX: 64, anchorY: 32,         // 车体中心锚点（相对贴图左上）
  canopyAnchorX: 64, canopyAnchorY: 20, // 炮塔/树冠锚点（如有）
  bake: (ctx, w, h, opts) => {      // 程序化回退绘制函数
    // ctx: CanvasRenderingContext2D
    // opts: { color, texture, detail, heightClass }
    // 必须绘制车体轮廓+履带+纹理
  },
  bakeTurret: (ctx, w, h, opts) => { // 可选：炮塔单独烘焙
  }
}
```

## ASSET_DEFS 条目模板（掩体/地形）
```js
'tree': {
  w: 24, h: 18,
  anchorX: 12, anchorY: 15,
  canopyAnchorX: 12, canopyAnchorY: 5,  // 树冠单独层锚点
  bake: (ctx, w, h) => { /* 树干 */ },
  bakeCanopy: (ctx, w, h) => { /* 树冠 */ }
}
```

## 常见坑 & 自查
- ❌ 贴图未预乘 Alpha → 混合错误 → 导出时勾选 "Premultiply Alpha"
- ❌ 锚点偏移导致炮塔旋转偏心 → 必须与 `tank_geometry.js` 的 `turretPivot`、`gunRoot` 对齐
- ❌ 图集打包后 UV 坐标未同步 → `atlas.json` 的 `frames[name].frame` 必须准确
- ❌ 色板限制被破坏（军武主色板 16 色、上限 32 色）→ Aseprite 索引色面板检查；变体必须走色板替换表换色，禁止另出多套图
- ❌ `bake` 函数未处理 `opts.color`/`opts.texture` → 导致颜色/纹理不生效

## 验收命令
```bash
npm run check          # 语法/类型检查
npm run test:browser   # Playwright 无头浏览器冒烟（贴图加载/渲染无报错）
```

## 协作接口
- **上游**：`tank-designer`（几何/装甲面导出）→ 提供 `anchorX/Y` 计算依据
- **下游**：`tank_paint.js`/`tank_battledraw.js`（渲染层消费 `drawAsset`/`drawAssetCanopy`）
- **并行**：`sound-designer`（同实体音效可并行制作）

## 暂缓储备规范（2026-08-26 自 PLAN.md 移入，恢复执行时按此实施）

状态：暂缓——待玩法核心专项（P-42~P-44 新编号）完成后恢复

> 来源：原 `docs/PLAN.md`「视觉与美术专项 PLAN (P-42 ~ P-45)」，2026-08-26 决策：项目优先级转向玩法核心（卡牌平衡/地图生成/战斗与 AI 修补），视觉专项暂缓执行。规则约定：本批计划只做文档层面的美术规范制定与管线规划，暂不改动代码逻辑。以下所有数值规格表原样保留。

### 附件贴图化范畴决策（2026-08-26 定案，修正版）
- **范畴**：坦克附件**全部**列入美术组制作范畴，统一走「几何骨架定锚点 + 位图蒙皮做表现」管线，无需分批：
  - 静态挂件：工具箱、杂物、探照灯、备用履带板等（随车体旋转，overlay 层位图）；
  - 功能性炮械：炮管、炮盾、制退器、抽烟器、护套等。
- **依据**：炮械组件**不参与命中判定**——`moduleFromHit` 仅映射车体/炮塔多边形面，`raycastTank` 命中面仅 `hullPoly`/`turretPoly`；炮管长度/制退器位置只影响开火特效锚点。因此贴图化无 gameplay 失真风险。
- **代码侧保留的几何权威**（美术不可绕过）：
  1. 锚点数学 `gunRoot` / `gunTip` / `turretPivot`（tank_geometry.js）——炮口特效起点与炮口闪光定位唯一来源；
  2. `normalizeBarrel` 规格（tank_halfgeom.js）+ BARREL_PRESETS 预设——决定轮廓比例与设计器编辑，贴图为蒙皮跟随。
- **渲染顺序约束**：挂件层 < 炮塔 < 炮管；全部变体经色板替换表 + tint 缓存，不产出多套图。

### P-42. 坦克实体贴图与多边形纹理管线 (Tank Assets & Polygon Texturing)
- **目标**：建立完整的坦克位图序列与程序化多边形纹理双重规范，支撑现有 9+ 车型及未来新坦克的战术军武风视觉。
- **要点**：
  - **位图精灵通道**：按 `ASSET_DEFS` 规范制作车体 `body.png`、炮塔 `turret.png`、履带 `tracks.png` 及炮口闪光 `muzzle_flash.png`，对齐 `tank_geometry.js` 的 `turretPivot` 与 `gunRoot` 锚点坐标。
  - **程序化多边形纹理通道**：扩展 `tank_paint.js` 的 `paintHull` / `paintTurret` 纹理库，新增装甲焊接线、防滑涂层、防锈底漆露角、铸造装甲颗粒及 4 套战术迷彩。
  - **履带与动感细节**：优化履带 Phase 滚动画法，补充履带断裂静态残骸与履带印遗留。
- **产出路径**：规范补充至 `docs/specs/editor.md`；待导出文件准备于 `assets/tanks/{id}/`。
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
- **调色板规范**：军武主色板 16 色、上限 32 色（Aseprite 索引色管理）；阵营/迷彩变体采用**色板替换表**（同索引映射不同 HEX），变体不出多套图。
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
- **要点**：
  - **开火特效 (Muzzle Flash)**：按弹种（AP/APCR/HEAT/HE）区分炮口火花与气流喷吐形状；HEAT 增加高狭窄金属射流闪光，HE 增加大面积黄红爆焰。
  - **弹道飞行 (Shell Traces)**：AP 灰白实线曳光、APCR 亮蓝高速气流线、HEAT 细长橙红拖尾、HE 滚滚黑烟拖尾；弹道高度/垂直剖面插值实时反映在特效缩放与阴影偏移上。
  - **命中与跳弹 (Hit & Ricochet FX)**：跳弹火花飞溅方向与反射法线严格一致 + 金属刮擦痕迹；穿透产生装甲碎片与内部火花；HE 爆轰火球与冲击波环半径严格对齐 `RULES.ammoTypes.HE.splashRadius` (90px)；殉爆掀飞炮塔优化抛物线弧度、旋转阴影及落点烟尘冲击波。
  - **地面痕迹 (Scorches & Scars)**：弹坑与弹着点灼痕 `scorchMarks` 按弹种产生不同形状（AP 小而深，HE 广大而浅）。
- **产出路径**：规范补充至 `docs/specs/combat.md`。
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
- **目标**：为 5 大 Biome 地貌及各类掩体/地形提供高质量程序化 bake 与位图资产规范。
- **要点**：
  - **Biome 底色与平铺纹理**：混凝土/城镇、草原、黄草/荒漠、泥潭、蓝水/水域五类，各配底色/辅色与细节元素（砖石裂纹、杂草斑块、干枯草簇、车轮痕积水、微波高光等）。
  - **掩体/地形资产**：矮墙、沙袋、碎石堆、残破建筑、完整建筑的像素/程序化纹理，增加法线与阴影表现。
  - **植物层 (Foliage)**：树/树干/倒树/灌木增加层次感与季节/Biome 色调变化；树冠层独立渲染支持透视遮挡。
- **产出路径**：规范补充至 `docs/specs/map.md`；文件位于 `assets/covers/` & `assets/biomes/`。
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
- **要点**：
  - **战斗 HUD**：拟真装甲车长仪盘样式，装填倒计时环、装甲角度指示器、模块受损状态图标。
  - **小地图 (Minimap)**：战术雷达质感（暗绿/雷达网格），不同地形图标化高亮，敌人/友军/Boss 战术标记分明。
  - **伤害飘字 (Dmgtext)**：强化 5 色语义（pen 穿透-黄/block 拦截-灰/bounce 跳弹-白/he 爆轰-橙/dot 起火-红）的字形冲击力与飞升淡出曲线。
- **产出路径**：规范补充至 `docs/specs/editor.md` / `docs/specs/map.md`。
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