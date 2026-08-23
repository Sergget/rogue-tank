# 战术坦克 Roguelike — 地图与环境要素规范 (Map & Environment Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_cover.js, js/tank_nodegen.js, js/tank_map.js, js/tank_camera.js, js/tank_minimap.js, js/tank_assets.js

---

## 1. 节点地图与大世界架构
- **节点式大战场**：一局为一条线性节点链（默认 runNodeCount=5 节点）。每个节点是独立战场，地图尺寸约为视口的 9 倍（宽高各 ≥ 3 倍视口，满足 1:9 比例）。
- **节点生成器**：js/tank_nodegen.js 提供 7 内置模板（开阔走廊/密林阵地/城镇街区/交叉火力广场/混合障壁/村落中心/林地战线），generateNode(difficulty, {seed}) 确定性种子 RNG 生成，难度加权选模板 + 密度剔除随难度递减。
- **摄像机跟随与视口剔除**：js/tank_camera.js 实现指数阻尼平滑跟随 + 世界边界钳制；aabbInView（64px 余量）对掩体、树冠、炮弹进行高效视口剔除。
- **小地图**：js/tank_minimap.js 右上角等比缩放渲染战场边界、掩体分布、友军据点与敌我动态标记。
- **水体/桥梁（P-20）**：waterBridgeChance = diff×0.5 概率插入；水体不可通行（move:0）、桥梁通道（move:1）；尺寸封顶节点 40%，边界钳制防越界；玩家出生点 findPlayerSpawn 排除水域。

## 2. 地图元素体系 (Cover Tiers)
参数权威收口于 RULES.coverTiers：

| 元素 | tier | 弹道交互 | 坦克通行 | 视线遮挡 | 残骸链 |
|---|---|---|---|---|---|
| 半高掩体 | half | 垂直剖面拦截（炮塔恒露；中坦车体100%挡/重坦25%露；贴掩体越掩插值） | 中坦阻挡推出；重坦压过 | 不遮 | ∞ |
| 全高掩体 | full | 100% 确定性格挡 | 阻挡推出 | 不遮 | ∞ |
| 灌木丛 | bush | 穿透（不挡弹） | 自由通行 | 阻挡 AI 视线 | ∞ |
| 树木 | tree | 树干 1 发截停 | 阻挡推出 | 树冠遮挡视线 | 1 发 → fallen |
| 倒树 | fallen | 穿透 | 自由通行 | 树冠遮挡视线 | 终态纯视觉残留 |
| 栅栏 | soft | 穿透（穿透即毁） | 0.45 减速通过，压过即毁 | 不遮 | 无残骸 |
| 沙袋路障 | barricade | 挡 1 发后摧毁；>70° 可跳弹（不触发摧毁） | 压过即毁 | 不遮 | 1 发/碾压 → rubble |
| 碎石 | rubble | 半高概率遮挡（0.5m） | 压过即毁 | 不遮 | 终态 |

## 3. 掩体核心机制细节
- **越掩插值（C 实验）**：射线高度在炮口（medium 1.8m/heavy 2.2m）与目标部位中心间线性插值；攻击方贴近半高掩体（距入口 < 约1/3射程）时射线高于掩体顶（1.4m）→ 越掩 exposure=1.0。
- **方向判据 cutoff**：掩体必须被弹道在命中目标前完整穿过（出口距离 < 命中距离+16px 容差）才参与遮挡；骑上掩体的坦克不会获得全向遮蔽。
- **炮管穿墙防御**：gunRoot→gunTip 物理线段与 solid/single 掩体相交时，开火在交点处拦截（damageCover 1点 + 特效），堵死"炮管穿墙无伤射击"漏洞。飞行动画起点归一 gunRoot。
- **任意多边形几何**：covers 实例带 verts 时全角点走 polyCorners；凹多边形支持 collisionVerts 多凸包化合物碰撞（SAT/OBB），解决 L 形口袋卡模问题。

## 4. 贴图资产与烘焙层 (js/tank_assets.js)
- ASSET_DEFS 注册表管理 soft/barricade/stump/rubble/bush/tree/fallen 七档贴图规格与程序化 bake 函数。
- 零外部图片依赖：assets/ 目录为空时自动离屏烘焙缓存（ASSET_CACHE），file:// 离线完整兼容。
- tools/bake.html 一键导出 PNG 到 assets/，日后真实美术直接替换同名文件接口不变。
