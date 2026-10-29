# 设计器武器配置端（设计预留）

> **摘要**：设计器从几何/装甲编辑扩展为武器完整配置端——主副武器选型赋值、阵营可用性字段、发射锚点；均未落地。
> **适用版本**：设计预留（未落地，2026-10-29）
> **源自**：2026-10-29 用户裁定（原临时设计稿已删，本页为唯一口径）；本页新建，兼容页新增 §9
> **相关**：[坦克设计器](./designer.md) · [对比页与字段架构表](./compare-schema.md) · [内容工具与 appearance](./appearance-aimspeed.md) · [主副武器固化](../combat/weapon-binding.md)

## 目录
- [落地状态](#落地状态)
- [武器选择与赋值面板](#武器选择与赋值面板)
- [阵营可用性字段 availability](#阵营可用性字段-availability)
- [武器外观与发射点位](#武器外观与发射点位)
- [实施入口](#实施入口)

## 落地状态

> **本页是设计预留，不是现状。** 设计器当前只有「几何 / 装甲 / 炮管炮盾 / 外观件」四块，武器类型仅一个「主炮模式」下拉。

| 子项 | 状态 | 说明 |
|---|---|---|
| 主武器类型下拉 + 机制参数表 | **已裁定，未落地** | 现只有「直射 / 曲射」模式开关（`tank_designer.html` 主炮模式区块） |
| 副武器类型下拉 + 赋值表 | **已裁定，未落地** | 现无副武器编辑入口 |
| 自动塔参数（扇区 / 转速 / 攻防射程系数） | **已裁定，未落地** | 依赖 [型别池](../combat/weapon-binding.md) 落地 |
| `availability` 三布尔字段 | **已裁定，未落地** | 现 `tanks/<id>.json` 无该字段 |
| `appearance.primaryWeapon.muzzleAnchor` | **已裁定，未落地** | 现炮弹起点由 `gunTip` 实时计算 |
| 副武器安装点 / 发射点位 / 特效按实例绑定 | **已裁定，未落地** | 现特效只有主炮唯一位 |
| 试射预览 | **已裁定，未落地** | 现外观 Tab 只有「预览瞄准」 |

## 武器选择与赋值面板

（设计器「数据」Tab 扩展）

| 区块 | 内容 |
|---|---|
| **主武器** | 类型下拉（`standard` / `autocannon` / `double_barrel` / `clip` / `howitzer` / `railgun` / `missile_wire`——后两者为导弹主武器化新入口）；选中后展开该类型的**机制参数表**（伤害 / 穿深 / 装填 / 弹速 / 散布 / 弹夹容量 / 双联间隔等），缺省值来自 `WEAPON_DEFAULTS`、可覆盖、受 `RULES.parameterLimits` 钳制 |
| **副武器** | 类型下拉（`rws` / `agl` / `sam` / `missile` / `missile_wire` / `rocket` / 无）+ 按类型展开赋值表；导出写 `fixedSecondary: <type>` + `weapons.secondary.stats` 覆盖 |
| **自动塔参数**（rws / agl / sam） | 攻击扇区大小（角度）、炮塔旋转速度、基础攻击距离、攻/防两档射程系数、伤害跟随主炮比例（`damageFromBaseRatio`）、（rws）榴弹间歇配置 |
| **手动型参数** | 迫击炮初始射程 / 弹速；导弹引导能力（`lockArcDeg` 锁定扇区 / `lockSeconds` 锁定时长 / 线导修正）；火箭巢 `count` / `burstInterval`。**参数表 = `WEAPON_DEFAULTS` 对应项键集**，设计器按表生成输入行，禁止散落硬编码 |
| **弹种环** | 并入弹种环的第二武器选择（Bradley TOW / BMP-3 100 炮）+ 各弹种参数 |

## 阵营可用性字段 availability

`tanks/<id>.json` 顶层新增（**纯增量契约**）：

```json
"availability": { "player": true, "ally": true, "enemy": true }
```

- 三布尔**独立**，缺省全 `true`（向后兼容既有 6 台）。
- **消费方三处，各自过滤互不串扰**：
  1. 玩家车库 —— `js/tank_flow.js`（Loadout）+ `server.js` 的 `api/tanks` 过滤
  2. 友军池 —— `js/tank_ally_command.js`（生成）+ 生存补给站购买（§4.165）
  3. 敌方池 —— `js/tank_map.js` / `js/tank_nodegen.js`（难度曲线选车）+ `enemyPreviewStats`（图鉴过滤）
- 设计器 UI：三个勾选框；`js/tank_schema.js` 增字段登记 + `validateTank` 断言。
- **测试**：schema 正/负向断言（非法值拒绝入库）+ 三池过滤互不串扰断言。

## 武器外观与发射点位

> **目标**：主副武器的**摆放位置与贴图**在设计器可视化配置；**发射特效与炮弹生成位置严格跟随这些锚点**——所见即所得，杜绝「贴图画在左、子弹从右冒」。

| 区块 | 内容 |
|---|---|
| **主武器摆放** | 现有炮管安装点 / 嵌入深度 / 双管间距（`sp-barrel-*`）与按主武器类型的贴图四路（标准 / 本车 / 机炮 / 磁轨）——扩展：① 贴图路按主武器类型全集补齐（`howitzer` / `clip` / `missile_wire` 各一路）；② **炮口锚点 `muzzleAnchor`**（炮口尖端，炮塔局部坐标）显式可调——炮弹生成、炮口火光、曳光起点、后坐动画**全部读它** |
| **副武器摆放** | 新增副武器外观块：部件（机枪塔 / 榴弹塔 / 导弹箱）的**贴图选择 + 安装点**（车体局部坐标 + 朝向）；自动塔的炮塔轴心即其索敌旋转中心 |
| **副武器发射点位** | 每个副武器部件自带 `muzzleAnchor`（塔顶 / 箱口）；自动塔开火、手动导弹 / 火箭发射、烟幕抛射的弹道与特效起点全部读各自锚点 |
| **发射特效绑定** | 从「主炮唯一位」改为**按武器实例绑定**——主炮挂 `weapons.primary.muzzleAnchor`，副武器挂各自锚点；特效尺寸随口径（沿用现 `fxScale` 通道） |
| **试射预览** | 外观 Tab「预览瞄准」扩展为试射预览：按住可见主/副武器**同时**按各自锚点生成弹道与特效——配置错位当场可见 |

**导出契约**（`tanks/<id>.json` 外观层新增，纯增量）：

```json
"appearance": {
  "primaryWeapon":   { "muzzleAnchor": [x, y] },
  "secondaryWeapon": { "mount": [x, y], "angle": 0, "muzzleAnchor": [x, y] }
}
```

## 实施入口

> **这一节回答「以后要动手时怎么知道改哪」。** 顺序不可颠倒：先定契约与 schema，再改运行时，最后批量填数据。

### 前置条件

1. **排期**：本页是 [主副武器固化](../combat/weapon-binding.md) 的实施前置，后者尚未进 `PLAN.md` 里程碑序列。
2. **schema 先行**：`availability` 与 `appearance.*muzzleAnchor` 是**外部 JSON 契约**，必须先有 `tank_schema.js` 字段登记 + `validateTank` 断言，才能让设计器导出、才能改运行时读取点。
3. **旧入口合并**：现「主炮模式」区块（直射 / 曲射下拉）并入新主武器面板——`howitzer` 由**模式开关**转为**类型**后，旧 `weapons.secondary = { type:'howitzer' }` 契约要在 [武器与装填](../combat/weapons-reload.md) 留迁移注记。

### 契约 → 消费方

| 要改的东西 | 消费方（改动点） | 迁移注记 |
|---|---|---|
| `availability` 三布尔 | `js/tank_schema.js`（`FIELD_ROWS` + `validateTank`）；`js/tank_flow.js`；`server.js` 的 `api/tanks`；`js/tank_ally_command.js`；`js/tank_map.js` / `js/tank_nodegen.js`；图鉴的 `enemyPreviewStats` | 缺省全 `true` ⇒ 旧车零回归；**三池过滤必须各自独立断言**，否则「敌方池过滤顺手把玩家车库也过滤了」这类串扰查不出来 |
| `muzzleAnchor`（主） | `js/tank_fire.js` 的 `firePrimaryShell`（弹道起点，现读 `gunTip`）；`js/tank_fx.js`（炮口特效挂点）；`js/tank_battledraw.js`（后坐动画原点）；`js/tank_scene3d.js` 的 `buildTankMesh`（3D 部件摆放） | **缺省回退现 `gunTip` 计算，且必须逐位一致**（负向断言）；旧车不配置即零回归 |
| `secondaryWeapon.mount` / `muzzleAnchor` | `js/tank_weapons.js`（副武器实例创建与发射起点）；`js/tank_fx.js`；`js/tank_scene3d.js` | 副武器现无独立部件实体，属**新增概念**；须同时加 `RULES.*.enabled` 关停开关 |
| 设计器面板与导出 | `tank_designer.html`（数据 Tab + 外观 Tab）；`js/tank_listio.js`（`tanks/` 读写）；`js/tank_schema.js` | 参数覆盖写 `weapons.secondary.stats` 现有链路（`computeAmmoConfig` 已消费）——**设计器只加 UI 与导出，运行时零新代码路径**（锚点消费除外） |

### 验收口径

- **负向断言（最关键）**：未配置 `muzzleAnchor` 时，弹道起点与现行 `gunTip` 计算**逐位一致**——这是「新契约不改旧车」的唯一机械证明。
- **schema**：非法 `availability` 值（字符串 / 缺键 / 非布尔）必须被 `validateTank` 拒绝入库。
- **互不串扰**：`availability.player=false` 的车**不得**出现在玩家车库，但**必须**能出现在敌方池（同一份数据、三种过滤）。
- **设计器链**：`scripts/test-designer` / `test-schema` 扩展后 `npm run check` 收口。

## 相关页面
- [坦克设计器](./designer.md) — 现行几何/装甲/炮管炮盾编辑能力（本页在它之上扩展）
- [对比页与字段架构表](./compare-schema.md) — `FIELD_ROWS` 与枚举，新增字段必须在此登记
- [内容工具与 appearance](./appearance-aimspeed.md) — `spec.appearance` 深拷贝与叠加层基准（本页的 `muzzleAnchor` 挂在同一层）
- [主副武器固化](../combat/weapon-binding.md) — 本页服务的工作包与配表
