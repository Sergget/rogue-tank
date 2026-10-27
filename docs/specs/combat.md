# 战斗与物理系统规范 —— 兼容索引（现行内容见 wiki 分页）

> ⚠️ **本页是 §N 兼容层**：全部章节编号原样保留（全仓 **245 处**外部引用依赖它们，含 `js/*.js` 注释、`AGENTS.md`、`DEVELOPMENT*.md`、归档分卷、其它 specs 卷——2026-10-21 实测），
> 但正文已迁至 `docs/specs/combat/` 下的主题页。**查现行口径请点每节的「详见」链接。**
> 拆分日期 **2026-10-21**；拆分前的单卷原文以 git 提交 `57be2ca` 为准（见 `docs/archive/2026-10-pre-wiki-combat.md` 的还原说明与分节行号表）。
> 规范见 [`docs/WIKI-STYLE.md`](../WIKI-STYLE.md)；卷首页见 [combat/index.md](./combat/index.md)。

---

## 0. 主题索引（按问题查，不按章节序读）

> ⚠️ **本卷收录了大量历史批次章节（§5.1、§8~§13）。章节号按时间追加，不代表主题分组**——同一主题常散落在多节。
> **查现行口径请用本索引**：每行给出「该主题的现行口径在哪一页」与「只是来源沿革、不必读的页」。
> 本卷章节号被外部文档直接引用——**2026-10-21 实测 245 处指向本卷章节号**（docs 侧 226：`DEVELOPMENT*.md` 53、`ARCHIVE.md` 42、`archive/*` 70、其它 specs 卷 30、`PLAN/ISSUES` 8 等；代码与流程侧 19：`AGENTS.md` 6、`.claude/agents/role-*` 3（2026-10-27 由 `.dsh/skills/role-*` 迁入）、`js/*.js` 9、`scripts/` 1），故**编号保持稳定、不做重排**；本索引是唯一的「按主题导航」入口。

| 我想查…… | 现行口径（先看这里） | 来源沿革（不必读） |
|---|---|---|
| 装甲 / 等效厚度 / 跳弹 / 摆角特训 / 模块与成员伤害 / debuff | [装甲、跳弹与模块伤害](./combat/armor-ricochet.md) | §5.1（早期装甲/掩体条目，多数已废）、§13.1（敌军基准里的装甲取值） |
| 弹种数值：穿深 / 伤害 / 弹速 / 溅射半径 / 跳弹角 / 精度 / 未击穿 | [弹种系统 · 数值总表](./combat/ammo-system.md#数值总表)（唯一数值口径） | §3.3（平衡回归）、§9.2（`statOverrides` 语义） |
| 弹种升级链 / 调校效果与升级效果的分界 | [弹种系统 · 弹种升级链](./combat/ammo-system.md#弹种升级链) | §9.2、`specs/cards.md` §3 |
| 曲射 / 榴弹炮 / 越障 | [曲射火力](./combat/arc-fire.md) | §8.2（F 键语义）、§6.1（弹体俯仰视效） |
| 装填时长 / 装填环 / 参数硬限 | [武器与装填 · 装填时长公式](./combat/weapons-reload.md#装填时长公式) + [弹种系统 · 弹种升级链](./combat/ammo-system.md#弹种升级链) | §8.5（双联）、§9.1（弹夹）、§13.4（敌军 `entityMults.reload`） |
| 主动技能本体（炮击 / 护盾 / 超装填 / 战术掩体 / APS / 冷却池） | [技能与副武器](./combat/abilities-secondary.md) | §9.5（Boss 召唤保底）、§11.2（删 V 专属键） |
| 技能槽指派 / 数字键映射 / 槽满顶替 | [技能与副武器 · 技能槽指派](./combat/abilities-secondary.md#技能槽指派) | §11.2（V 键沿革） |
| 副武器本体（F 键语义 / 导弹 / 线导 / 火箭 / 副炮塔 / 榴弹炮槽） | [技能与副武器](./combat/abilities-secondary.md) | §8.5（双联主炮，非副武器） |
| 布雷 / 地雷（数量上限、雷场形状、触发与装填门控） | [部署物与布雷](./combat/deployables.md) | §13.3（雷场路径门控修复）、§13.6（`mineMax` 3→6 的动机） |
| 无人机（scout / striker） | [技能与副武器 · 无人机](./combat/abilities-secondary.md#无人机) | §5.1（striker 早期描述） |
| 敌方 AI：触发 / 警觉 / 反应延迟 / 接战传播 | [敌方 AI](./combat/enemy-ai.md) | §5.1 |
| 敌方 AI：接战机动 / 交战结构 / 侧翼 / 分离力 | [敌方 AI · 接战机动随机化](./combat/enemy-ai.md#接战机动随机化) + [交战结构重做](./combat/enemy-ai.md#交战结构重做) | §5.1 |
| 友军指挥：三命令（跟随/移动/集火）/ 目标权威 / 状态反馈（A0 已落地） | [友军指挥与战术协同](./combat/ally-command.md) | — |
| 遭遇导演：波次编成 / 阶段机 / 事件契约 / `RULES.encounter` 参数（3D 切片） | [遭遇导演](./combat/encounter-director.md) | — |
| 敌人数值 / 难度乘子 / 固定基准 | [敌人强度与难度](./combat/enemy-scaling.md) | §5「难度全面分化」段（仅机制表述）、§11.5 |
| Boss 激光 / 召唤 / 随机走位 | [Boss 战斗](./combat/boss-combat.md) | §9.5（#G1 乘数方案，已废） |
| Boss 血量 / 难度缩放 | 归口 **`specs/boss.md` §5** | §13.4（`entityMults.maxHp` 与 `hpMul` 两级叠加） |
| 特效 / 视效 / 伤害飘字 / 开火后坐 | [特效与视效](./combat/fx-visual.md) | §8.5（双联视效）、§12.2（Boss 激光截断绘制） |
| 音频 / 音效 | [音频与音效](./combat/audio.md) | — |
| 视野 / 可见距离 | [视野与镜头](./combat/camera-vision.md)（系统已退役，只剩视口剔除） | §10 全节、§11.1、§11.4、§11.5 —— **全部作废，仅沿革** |
| 镜头外延（摄像机随鼠标） | [视野与镜头 · 镜头随鼠标外延](./combat/camera-vision.md#镜头随鼠标外延) | §11.5（视野卡几何，作废） |
| HUD / UI（底部三区 / 装填环 / 技能槽 / 伤害飘字 / Boss 血条） | [HUD 与界面](./combat/hud-ui.md) | §2（模块状态条）、§13.2（技能槽语义） |
| 掩体 / 地形 / 岩石碰撞 / 移速受限 | [核心立意与物理契约 · 岩石接触卡死修复](./combat/core-concepts.md#岩石接触卡死修复) + `specs/map.md` | §5.1（半高掩体，2026-09-20 已整体删除） |
| 卡牌与战斗的交界（稀有度 / 硬限 / 武器安装与规格通道） | [武器与装填 · 卡牌稀有度与安装卡](./combat/weapons-reload.md#卡牌稀有度与安装卡)、[主炮类型与规格通道](./combat/weapons-reload.md#主炮类型与规格通道) | `specs/cards.md` |
| 武器本体（主炮五型 / 副武器五类 / `statOverrides`） | [武器与装填](./combat/weapons-reload.md)；数值以 `WEAPON_DEFAULTS` 为准 | §8.5（双联）、§3.2b（榴弹炮模式） |
| 游戏模式（Boss 战 / 生存战） | [游戏模式](./combat/game-modes.md) | — |
| **全部历史 / 已作废机制** | — | [沿革与已作废](./combat/changelog.md) |

> **用法示例**：想查「装填」→ 直接读 [武器与装填 · 装填时长公式](./combat/weapons-reload.md#装填时长公式) + [弹种系统 · 弹种升级链](./combat/ammo-system.md#弹种升级链)，共 2 页；§8.5/§9.1/§13.4 只在你要改双联、弹夹或敌军难度时才需要看。

---

## 1. 战斗立意与物理核心

> 慢节奏、强博弈、拟真物理；炮弹按真实速度逐帧推进，碰撞在命中瞬间判决。

**详见**：[核心立意与物理契约](./combat/core-concepts.md#战斗立意)

## 2. 装甲与跳弹机制 (Armor & Ricochet)

> 等效厚度 = 厚度 / cos(入射角)；跳弹角逐弹种（数值在弹种总表）；打穿后按几何分区抽模块伤害；含 innate 三键与散布下限。

**详见**：[装甲、跳弹与模块伤害](./combat/armor-ricochet.md)

## 3. 弹种系统 (Ammo Types)

> 唯一数据源 `RULES.ammoTypes`；逐弹种数值以 §3.2 总表为唯一口径；含 HE 机制细节与 14 键清单。

**详见**：[弹种系统](./combat/ammo-system.md)

### 3.1 弹种升级链（14 键 = 14 弹种；HEC 已移除）

> 三条线性链（KE / HEAT / HE），升级卡原地替换、禁止跳级；含卡牌通道硬限与弹种软上限。

**详见**：[弹种系统 · 弹种升级链](./combat/ammo-system.md#弹种升级链)

### 3.2 弹种数值总表（用户 2026-09-13 权威表，已落地 `RULES.ammoTypes` per-ammo 字段）

> 14 弹种的穿深/伤害/弹速/弹药架与成员倍率/模块抽取/跳弹角/精度/未击穿，外加 HE 家族溅射半径与击退系数——**本卷唯一数值口径**。

**详见**：[弹种系统 · 数值总表](./combat/ammo-system.md#数值总表)

### 3.2b 榴弹炮曲射模式（`howitzer`，副武器；2026-10-20 #W-I 现行口径）

> 模式载体而非武器类型：装进副武器槽后主炮切曲射；`WEAPON_DEFAULTS.primary.howitzer` 七个参数 + 落点/直击/近失/散布结算语义。

**详见**：[曲射火力 · 榴弹炮曲射模式](./combat/arc-fire.md#榴弹炮曲射模式)

### 3.2c 曲射弹越障契约（`isArc` 弹的帧处理，2026-10-20 #Y1 现行口径）

> `isArc` 块必须每帧 `return` 短路，否则途中坦克会被当直射结算；`maxRange` 对 isArc 弹恒不生效。

**详见**：[曲射火力 · 曲射弹越障契约](./combat/arc-fire.md#曲射弹越障契约)

### 3.3 平衡性回归（`scripts/test-ammo-balance.js`，接入 npm test）

> 真实 `resolveHit` 蒙特卡洛基线；首轮结论（APHE 1.1 / HEAT-FS 1.75 / HESH 家族维持）已全部落地。

**详见**：[弹种系统 · 平衡回归](./combat/ammo-system.md#平衡回归)

## 4. 战术能力、副武器与主动装备 (Abilities & Secondary Weapons)统一入口 `tryActivateAbility` + 武器系统 `tank_weapons.js`

> 副武器单槽与 F 键语义、五类副武器行为、技能池 1~3 数字键、按 key 独立冷却池、无人机参数。

**详见**：[技能与副武器](./combat/abilities-secondary.md)

## 5. 敌方 AI 激活触发 (Enemy AI Activation Trigger)（2026-08-24 定案）

> 距离 + 可见性触发（`triggerDistBase 700` / `engageRange 520` / `keepRange 320` / `allyEngageRange 460`）、滞回、生成点约束、五层警觉与非噪声半径。

**详见**：[敌方 AI · 激活与警觉](./combat/enemy-ai.md#激活与警觉)

### 5.1 战斗机制更新（2026-08-24 ~ 08-28 批次）

> **历史批次**：半高掩体 / graduated 拦截链已整体删除；回放 harness、控制与设置等条目仅作沿革（仍有效的三条已迁入对应主题页）。

**详见**：[沿革与已作废 · §5.1](./combat/changelog.md#51-战斗机制更新2026-08-24-08-28-批次)

## 6. 特效与视效表现规范 (FX Visual Standards)

> 开火/命中/爆轰分层绘制、确定性 draw 约束、零逐帧渐变、履带痕迹、电磁炮三段视效、伤害飘字、开火后坐。

**详见**：[特效与视效](./combat/fx-visual.md)

### 6.1 曲射弹体俯仰与透视（`arcShellPose`，2026-10-20 #X6 现行口径）

> 由同一 z 公式求导得伪俯仰；压长轴不压短轴；阴影恒贴地不随 tilt 转。

**详见**：[特效与视效 · 曲射弹体俯仰与透视](./combat/fx-visual.md#曲射弹体俯仰与透视)

## 7. 音频与声效表现规范 (Audio Visual Standards)

> 两条总线与并发上限、采样优先 + 合成兜底、2D 空间化的真实实现参数（HRTF / 500 / 24）。

**详见**：[音频与音效](./combat/audio.md)

### 7.1 `SOUND_DEFS` 条目 schema（唯一权威 = `js/tank_audio.js`；2026-10-19 按实现校正）

> `label`/`bus`/`gain`/`layers[]` 的必填与可选字段、`validateSoundDefs` 校验器；旧角色卡里的 `priority`/`env.type` 等均未实现。

**详见**：[音频与音效 · SOUND_DEFS schema](./combat/audio.md#sound_defs-schema)

## 8. 2026-09-20 用户反馈批次（#E4/#E5/#E7/#E8/#E10/#E12/#E13）现行口径

> **批次章节**，非主题基线：内容已按主题拆到部署物 / 技能与副武器 / 敌方 AI / Boss 战斗 / 视野与镜头 五页。

**详见**：[卷首页主题表](./combat/index.md#主题页)

### 8.1 便携式掩体与布雷器：部署上限、预约与触发口径（#E4/#F5/#F6；2026-10-22 雷场改带状 / 地雷总数不设上限）

> 单向透明、`deploy_cover` 尺寸表、`deploy_limits` 六个上限键与超限拒绝、两次 F 的雷场预约、地雷触发半径与 blastRadius 的缺省表口径。

**详见**：[部署物与布雷](./combat/deployables.md)

### 8.2 反坦克导弹两种制导（#E5）+ 开关类副武器 F 边沿口径（#F7）

> F 键按副武器类型分派：锁定式激活索敌、线导式直接发射、开关类必须走原生 keydown 边沿；火箭巢按炮塔朝向扇形齐射。

**详见**：[技能与副武器 · 副武器 F 键分派](./combat/abilities-secondary.md#副武器-f-键分派)

### 8.3 敌方 AI：反应延迟 + 全高掩体遮视野 + engage 传播（#E7/#E8）

> `react` 态只转炮塔不动不开火；接战需距离 + LoS；首次接战按半径与概率向友邻传播。

**详见**：[敌方 AI · 反应延迟与接战传播](./combat/enemy-ai.md#反应延迟与接战传播)

### 8.4 HE 系击退（#E10）

> 击退距离 = `splashRadius × splashKnockbackMul × (1 − dist/radius)`；逐弹种系数见弹种总表。

**详见**：[弹种系统 · 击退公式](./combat/ammo-system.md#击退公式)

### 8.5 双联火炮重做（#E13）

> 单管装填 + 顺序流水线、击发互相清零进度、交替装填卡解除干涉、空格齐射需两管就绪、双弧 HUD。

**详见**：[武器与装填 · 双联火炮](./combat/weapons-reload.md#双联火炮)

### 8.6 卡牌稀有度新增「神话」档（#E13）

> `CARD_RARITIES` 五档（权重 50/30/15/4.5/0.5）、`LOOT_RARITIES` 同步、Boss 保底池按新序自动生效。

**详见**：[武器与装填 · 卡牌稀有度与安装卡](./combat/weapons-reload.md#卡牌稀有度与安装卡)

### 8.6b 标准主炮的规格通道（#U39，2026-10-18）

> `primaryWeaponSpec` 对 standard 不再恒返回 null：无覆写仍为 null，有覆写则四条倍率通道全部可用。

**详见**：[武器与装填 · 主炮类型与规格通道](./combat/weapons-reload.md#主炮类型与规格通道)

### 8.7 摄像机随鼠标向外延伸（#E12）

> 外延 = `RULES.vision.radius × RULES.camera.mouseLeadRatio`（现行 0.40）× 归一化鼠标偏移，按 zoom 反向补偿、`leadLerp` 阻尼。**至今仍有效**。

**详见**：[视野与镜头 · 镜头随鼠标外延](./combat/camera-vision.md#镜头随鼠标外延)

## 9. 2026-09-21 用户反馈批次（#G1~#G8）现行口径

> **批次章节**，非主题基线：内容已按主题拆到武器与装填 / 技能与副武器 / HUD 与界面 / Boss 战斗 四页。

**详见**：[卷首页主题表](./combat/index.md#主题页)

### 9.1 主武器第五型「弹夹炮」`clip`（#G6）

> 弹夹炮六参数表、两段式装填（弹夹内固定间隔 / 打空整组重装）、扩容边际递减、HUD 余量数字。

**详见**：[武器与装填 · 弹夹炮](./combat/weapons-reload.md#弹夹炮)

### 9.2 弹种/武器 `statOverrides` 支持 `"+N"` 相对增量（#G6）

> 三类值（number / boolean / `"+N"`）、`mergeStatOverrides` 统一合并、`validateCard` 同口径。

**详见**：[武器与装填 · statOverrides 与换装](./combat/weapons-reload.md#statoverrides-与换装)

### 9.3 电磁轨道炮强度重调（#G5）

> `reloadMult 1.8` / `damageMult 1.8` / `penMult 2.0` / `shellSpeedMult 2.5` + `pierce 1` / `pierceDmgMul 0.6`（电磁炮数值唯一口径）。

**详见**：[武器与装填 · 电磁轨道炮](./combat/weapons-reload.md#电磁轨道炮)

### 9.4 主动防御系统 APS（#G9，新技能）

> 6s / 240px / 最多拦截 3 发 / 22s 冷却；拦截层在 `stepShells` 之后逐帧扫描；与护盾的分工（销毁 vs 吸收）。

**详见**：[技能与副武器 · APS 主动防御](./combat/abilities-secondary.md#aps-主动防御)

### 9.5 Boss 激光炮塔转速与召唤波次（#G1/#G2）

> 激光转速的 **#G1 乘数方案已废**（现行见 §11.3/§12.1）；召唤波次 `defaultPool`/`defaultWaves` 兜底仍有效。

**详见**：[Boss 战斗 · 召唤波次](./combat/boss-combat.md#召唤波次)、[激光炮塔转速](./combat/boss-combat.md#激光炮塔转速)

### 9.6 底部 HUD 三区重设计（#G7/#G8）

> `#bottomHud` flex 三区（VITALS / WEAPONS / SKILLS）、速度读数公式、技能槽映射、元素 id 测试契约。

**详见**：[HUD 与界面 · 底部 HUD 三区](./combat/hud-ui.md#底部-hud-三区)

### 9.7 装填进度环漏乘武器 `reloadMult` 的修复（#G5 附带）

> `dur = stats.reload × primaryWeaponSpec(t).reloadMult ÷ debuffReloadRate(t)`——**全卷装填时长公式的唯一口径**。

**详见**：[武器与装填 · 装填时长公式](./combat/weapons-reload.md#装填时长公式)

### 9.8 暂停菜单商店入口 + TAB 面板实时刷新 + Boss 血条（#S9/#S10/#S3-UI，2026-10-14）

> 暂停菜单内嵌商店、`refreshStatusPanel` 触发点、面板刷新抛错会冻结主循环的致命性约定、`hp_up` 回满、Boss 血条。

**详见**：[HUD 与界面 · 暂停菜单商店与 TAB 面板](./combat/hud-ui.md#暂停菜单商店与-tab-面板)

## 10. 2026-09-21 #H1 视野等距修正（**已被 §13.5 取代，仅沿革**）

> 视野圆与矩形视口的轴向优势分析、窄轴收口方案、设计取舍——**全节作废**，视野距离系统已于 2026-09-30 #J3 退役。

**详见**：[沿革与已作废 · §10](./combat/changelog.md#10-2026-09-21-h1-视野等距修正已被-135-取代仅沿革)、[视野与镜头](./combat/camera-vision.md)

### 10.1 轴向优势的根因

> 有效可见距离 = min(视野圆边界, 屏幕边界)；横屏 1920×1080 下横向 1215px vs 纵向 810px（约 1.5×）。

**详见**：[沿革与已作废 · 10.1](./combat/changelog.md#101-轴向优势的根因)

### 10.2 修正：视口窄轴收口（`tank_camera.visionRadiusForViewport`）

> `R = min(nominal, 窄轴前向容量/(1+bias))` 的纯函数与四档视口对照表——**已被 §13.5 取代**。

**详见**：[沿革与已作废 · 10.2](./combat/changelog.md#102-修正视口窄轴收口tank_cameravisionradiusforviewport)

### 10.3 设计取舍与边界（几何必然）

> 保留鼠标锚定与外延、视野圆整体缩小、卡牌加成的屏幕上限、严格等距与外延互斥——**已被 §13.5 取代**。

**详见**：[沿革与已作废 · 10.3](./combat/changelog.md#103-设计取舍与边界几何必然)

## 11. 2026-09-21 #H3/#H4 用户反馈（现行口径）

> **混合章节**：§11.1/§11.4/§11.5（可见距离）已作废进沿革；§11.2（删 V 键）为沿革；**§11.3（Boss 激光）仍现行**。

**详见**：[Boss 战斗](./combat/boss-combat.md)、[沿革与已作废](./combat/changelog.md)

### 11.1 敌方可见距离：屏幕相对化（#H5；**已被 §13.5 取代，仅沿革**）——曾取代 #H1/#H2

> `R = screenRadiusRatio × min(vw,vh)/2 ÷ zoom × 卡牌加成`、圆心取摄像机中心、R×zoom 恒定——**整节作废**。

**详见**：[沿革与已作废 · §11.1](./combat/changelog.md#111-敌方可见距离屏幕相对化h5已被-135-取代仅沿革曾取代-h1h2)

### 11.2 超装填移除 V 专属键（#H3）

> V 键激活删除（键位/ACTION_INFO/ACTION_ORDER/btnV/cdV 全删），overdrive 改为技能池数字键。

**详见**：[沿革与已作废 · §11.2](./combat/changelog.md#112-超装填移除-v-专属键h3)、[技能与副武器 · 技能槽指派](./combat/abilities-secondary.md#技能槽指派)

### 11.3 Boss 激光炮塔固定转速 + 全高掩体阻挡（#H4）

> 固定角速度直驱取代乘数方案、AI 转炮抑制、全高掩体阻挡判据（`tierGroup:'structure' && vision`）。

**详见**：[Boss 战斗 · 激光炮塔转速](./combat/boss-combat.md#激光炮塔转速)

### 11.4 敌方可见距离不得写死像素（#H5，见 §11.1）

> 屏幕相对化的动机说明——随视野系统整体退役，仅沿革。

**详见**：[沿革与已作废 · §11.4](./combat/changelog.md#114-敌方可见距离不得写死像素h5见-111)

### 11.5 镜头外延量与「视野卡收益」的几何关系（2026-09-23 B 档落地；**已被 #K1 与 §13.5 取代，仅沿革**）

> 旧公式、圆心偏移导致的「圆探出视口」缺陷、`mouseLeadRatio` 沿革数值——**整节作废**。

**详见**：[沿革与已作废 · §11.5](./combat/changelog.md#115-镜头外延量与视野卡收益的几何关系2026-09-23-b-档落地已被-k1-与-135-取代仅沿革)

## 12. 2026-09-21 #I 批次用户反馈（现行口径）

> **批次章节**：§12.1~§12.3 为 Boss 战斗现行口径（已迁入 Boss 战斗页）；§12.4 是地图生成内容，归口 `specs/map.md`。

**详见**：[Boss 战斗](./combat/boss-combat.md)

### 12.1 Boss 激光期车体冻结 + 炮塔再降速（#I1）

> 激光期 `bossLaserHoldMove` 连 `driveTank` 一并跳过；`laserTurnSpeed` 0.55 → **0.35 rad/s**（该参数唯一数值口径）。

**详见**：[Boss 战斗 · 激光期的车体冻结](./combat/boss-combat.md#激光期的车体冻结)、[激光炮塔转速](./combat/boss-combat.md#激光炮塔转速)

### 12.2 蓄能虚线与光束反映掩体阻挡（#I2）

> `_laserBeamBlockDist` 求最近全高掩体入口距离；伤害与绘制共用同一 `blockDist`，截断处画橙色阻挡标记。

**详见**：[Boss 战斗 · 光束被掩体截断](./combat/boss-combat.md#光束被掩体截断)

### 12.3 Boss 随机走位（反站桩）（#I4）

> `RULES.ai.bossWander` 航点环绕玩家 240~520px；炮塔仍照常锁敌；crush / weave / 激光期 / 目标已毁豁免。

**详见**：[Boss 战斗 · Boss 随机走位](./combat/boss-combat.md#boss-随机走位)

### 12.4 建筑密度提升与 Boss 战图加成（#I3，地图侧现行口径见 `specs/map.md` §13.4）

> 地图生成参数（`clusterPerJunction` / `maxPerNode` / `bossDensity`）**归口 `specs/map.md` §13.4**；本条只留 8-seed 结构数 87 → 103 的实测结论。

**详见**：[沿革与已作废 · §12.4](./combat/changelog.md#124-建筑密度提升与-boss-战图加成i3)

## 13. 2026-09-30 #H 批次用户反馈（现行口径）

> **批次章节**，但承载多条现行核心口径：§13.1（固定基准）、§13.4（难度乘子）、§13.5（视野退役）、§13.7/§13.8（AI 机动与交战结构）、§13.9（岩石卡死）。

**详见**：[敌人强度与难度](./combat/enemy-scaling.md)、[敌方 AI](./combat/enemy-ai.md)、[视野与镜头](./combat/camera-vision.md)

### 13.1 敌军数值基准：固定基准（#H1）

> `RULES.enemyAnchorBase` 十项固定基准；四个封顶键（`penCapVsBaseline 1.2` / `dmgFloorVsBaseline 0.4` / `speedVsBaseline` / `dmgCapAmmoMult 0.7` + `strongestAnchorMult 2.33`）的唯一数值口径。

**详见**：[敌人强度与难度 · 固定基准](./combat/enemy-scaling.md#固定基准)、[封顶键](./combat/enemy-scaling.md#封顶键)

### 13.2 技能槽指派体系：玩家选择顶替（#H3/#H4）

> `player.skillSlots` 三槽、槽满弹指派面板、数字键严格映射槽位、Shift+点击改指、键位单一来源不变量。

**详见**：[技能与副武器 · 技能槽指派](./combat/abilities-secondary.md#技能槽指派)

### 13.3 布雷器可用性与装填门控（#H2）

> 落雷数按可用余量裁剪、余量为 0 即刻提示、确认预约时写 `secondaryReloadT`、绘制层取 `pf.count`；含三个原缺陷。

**详见**：[部署物与布雷 · 布雷器与雷场](./combat/deployables.md#布雷器与雷场)

### 13.4 敌人难度数值再调优（2026-10-01 用户裁定，现行口径）

> `entityMults` 十键区间（**唯一数值口径**）、生效范围、#6 穿深触顶副作用、两张实测探针表。

**详见**：[敌人强度与难度 · 难度乘子](./combat/enemy-scaling.md#难度乘子)

### 13.5 视野距离系统退役（#J3，2026-09-30）

> 视野圆几何函数/剔除/视野卡整链删除；现行只剩 `aabbInView` 视口剔除；AI 接战仍走「距离 + LoS」。

**详见**：[视野与镜头 · 视野系统退役的现行后果](./combat/camera-vision.md#视野系统退役的现行后果)

### 13.6 地雷可连续布设（#J1）与主武器换装重置（#J2）

> `mineMax 3→6` / `mineMaxHardCap 8→12` 的动机与「同时在场数」语义；主武器换型先重置 stats 再合并 overrides。

**详见**：[部署物与布雷 · 部署上限](./combat/deployables.md#部署上限)、[武器与装填 · statOverrides 与换装](./combat/weapons-reload.md#statoverrides-与换装)

### 13.7 接战机动随机化（#M，2026-10-01，现行口径）

> 五种机动脚本与权重、偏角/行程/短停随机、装填期蠕行偏置、`t._mv` 生命周期与回退开关。

**详见**：[敌方 AI · 接战机动随机化](./combat/enemy-ai.md#接战机动随机化)

### 13.8 交战结构重做（#N，2026-10-02，现行口径）

> 交战距离带 / 攻守分工 / flank 重写 / 群体分离力 / 视口外提示 / 装填脱离；4 处实现期缺陷与量化验证。

**详见**：[敌方 AI · 交战结构重做](./combat/enemy-ai.md#交战结构重做)

### 13.9 岩石接触卡死修复（#O1，2026-10-10，用户反馈，现行口径）

> `driveTank` 通行系数只对 `pass > 0` 生效；推出量加 0.25px 缓冲 + 最多 4 遍重扫；岩石仍硬阻断。

**详见**：[核心立意与物理契约 · 岩石接触卡死修复](./combat/core-concepts.md#岩石接触卡死修复)

## 14. 游戏模式：Boss 战 / 生存战（#MODE，2026-10-15 落地，现行口径）

> `?mode=boss` / `?mode=survival` 入口（缺省 standard）；生存准备期与逐波选卡；Boss 模式商店时序。

**详见**：[游戏模式](./combat/game-modes.md)

### 14.1 生存模式：「准备期」伤害关闭窗口（2026-10-15 用户裁定）

> 删除「区域肃清」倒计时；5 秒准备期可移动但全场伤害关闭（`damageSuppressed` 总闸 + 来源门控两层）。

**详见**：[游戏模式 · 生存模式：准备期](./combat/game-modes.md#生存模式准备期)

### 14.1b 生存模式：卡牌挑选在**每一波结束**（2026-10-18 用户裁定，现行口径）

> 每波都弹选卡：普通波 5 选 2、Boss 波 5 选 3 + 保底；`survivalQuickPick` 期间冻结战场；补给站不再选卡。

**详见**：[游戏模式 · 生存模式：逐波选卡](./combat/game-modes.md#生存模式逐波选卡)

### 14.2 Boss 战模式：局内商店改在卡牌选择后（2026-10-15 用户裁定）

> reward 屏选完卡原地展开商店；三处入口共用 `buildRunShopInto`；每次进 reward 先 `resetRewardShop()`。

**详见**：[游戏模式 · Boss 模式：商店时序](./combat/game-modes.md#boss-模式商店时序)

## 15. 撞击伤害、隐蔽感知、战术闪跃与烟幕（2026-10-23 新增，现行口径）

> **撞击**：`resolveTankCollisions` 在 MTV 分离前按法向闭合速度结算动能伤害；硬直采用「伤害 ≥ 生命上限 × 0.25 **且** 动能 ≥ 上限 × 0.15」双轨**比例**判定（不用绝对点数，防后期必然触发）。参数唯一口径 `RULES.ramming`。
> **隐蔽**：隐蔽值 = 吨位基准 × 运动倍率 × 开火惩罚 + max(灌木, 烟幕)；映射为 AI 首次激活距离折扣 `clamp(1/(1+camo), 0.3, 1)`，脱离距离不吃折扣。参数唯一口径 `RULES.camouflage`。
> **闪跃**：`flash_dash` 独立冷却、独立速度乘子；激活只写状态位，位移仍由 `driveTank` 积分。五键闭环（RULES / ABILITY_KEYS_RUNTIME / ABILITY_LABELS / dispatch / 卡牌白名单）缺一即死键。
> **烟幕**：副武器 `smoke` 抛 `cloudCount` 团烟墙；发射几何归 `WEAPON_DEFAULTS.secondary.smoke`，单团半径/存续归 `RULES.smoke`；视线遮断与隐蔽加成是两条独立通道。

**详见**：[撞击伤害、隐蔽感知与战术闪跃](./combat/ramming-stealth-dash.md)

## 16. 友军指挥与战术协同（2026-10-26 新增；A0 三命令闭环 2026-10-27 落地）

> **A0 已落地（2026-10-27 用户裁定简化为三命令）**：follow（跟随 + 随机攻击可攻击目标）/ move（移动 + 攻击最近目标）/ focus（集火指定目标，不暗换）。**Z/X/C 直接快捷键**（命令转盘暂时关闭）；纯逻辑层 `js/tank_ally_command.js`，决策与击发读同一权威目标。A1（导航/职能）与单车/手柄命令仍为设计预留；不做多人合作。

**详见**：[友军指挥与战术协同](./combat/ally-command.md)

## 17. 电磁轨道炮三段声学（2026-10-26 AA-c 新增，现行口径）

> 听觉链分三段：① 充能上升电流 = **代码驱动的持续实例**（`startRailChargeLoop/updateRailChargePitch/stopRailChargeLoop`，基频随 `railChargeProgress` 单调上升，数值唯一口径 `RULES.railgunFx.audio`）；② 就绪 = 一次性瞬态 `SOUND_DEFS.railReady`；③ 开火 = `SOUND_DEFS.firerail`（三层，已覆盖放电撕拉与炮身共鸣，故原计划的 `railDischarge` 键**不拆**）。玩家侧必须先判 `type==='railgun' && reloadT>0`——`railChargeProgress` 对非电磁炮返回 1，不判会常驻鸣响。

**详见**：[音频与音效 · 电磁轨道炮三段声学](./combat/audio.md)

## 18. 界面版式与视觉令牌（2026-10-27 新增，现行口径）

> **混合章节，两页分叉**：七页共用的栅格 / 安全区 / 字号阶梯 / 设计令牌见 [界面版式与设计令牌](./combat/ui-layout.md)；按钮五态、面板、卡片、进度条、输入框、徽标、Toast 的组件规格见 [界面组件与状态](./combat/ui-components.md)。
> 令牌唯一物理载体是 `js/tank_ui.js`（用户 2026-10-27 裁定走 JS 注入而非外链 CSS），七页均以同步脚本接入、不再自带 `:root`。**视觉层只管看起来怎样，不改变元素 id、DOM 结构、交互语义与游戏行为**——`hud-ui.md` 的「元素 id 测试契约」仍是行为侧唯一权威。P0（色板统一 / 圆角归零 / 首页改版）已落地；P1（字号 5 档收敛）、P2（侧栏与弹窗尺寸、按钮五态）未落地，由 `scripts/test-ui-tokens.js` 的字号棘轮逐步收紧。

**详见**：[界面版式与设计令牌](./combat/ui-layout.md) · [界面组件与状态](./combat/ui-components.md)

## 19. 遭遇导演（2026-10-28 G1 完整 3～5 分钟遭遇，现行口径）

> 三波遭遇导演（W1 侦察分队 / W2 分进合击 / W3 装甲合围）+ `telegraph→wave→breather→victory/defeat` 阶段机 + 七类事件契约；参数唯一口径 `RULES.encounter`（`js/tank_rules.js`），纯逻辑层 `js/tank_encounter.js` 只发事件不写实体。**三条必守**：波次敌人强制 `aiEngaged=true` 并按 `intelInterval` 刷新方位（否则龟缩成无限局）、写入场反应延迟（否则出场即齐射）、方位回退后必须写回 bearing（否则 HUD 骗玩家）。`playerHpScale` / `enemyDamageScale` / `entryReactSeconds` 是**切片专用演示缩放，正式战斗不读**。

**详见**：[遭遇导演](./combat/encounter-director.md)
