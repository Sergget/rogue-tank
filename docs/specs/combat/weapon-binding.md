# 主副武器固化与副武器型别池（设计预留）

> **摘要**：主武器与底盘绑定固化、副武器收敛为 6 型固化池、右键成为副武器主交互、反炮兵雷达与 22+4 台配表；均未落地。
> **适用版本**：设计预留（未落地，2026-10-29）
> **源自**：2026-10-29 用户六项裁定（原临时设计稿已删，本页为唯一口径）；本页新建，兼容页新增 §20
> **相关**：[武器与装填](./weapons-reload.md) · [技能与副武器](./abilities-secondary.md) · [设计器武器配置端](../editor/designer-weapon-config.md) · [曲射火力](./arc-fire.md)

## 目录
- [落地状态](#落地状态)
- [键位：右键成为副武器主交互](#键位右键成为副武器主交互)
- [副武器型别池（7 → 6 型）](#副武器型别池7-6-型)
- [车辆与主副武器配表（22 + 4 台）](#车辆与主副武器配表22-4-台)
- [反炮兵雷达](#反炮兵雷达)
- [实施入口](#实施入口)

## 落地状态

> **本页是设计预留，不是现状。** 不得据此写新代码、也不得在「现行口径」处引用；实施时以本页为准，逐条改成「已落地」后再转 `现行`。

| 子项 | 状态 | 说明 |
|---|---|---|
| 主武器与底盘固化（取消局内换装卡） | **已裁定，未落地** | 用户 2026-10-29；现行为 `weapons.primary` 可由卡牌/配置更换 |
| 副武器型别池 7 → 6 型 | **已裁定，未落地** | 现行为 `WEAPON_DEFAULTS` 五类（mortar/missile/rocket/mine_layer/turret） |
| 右键 = 副武器主交互（F 保留等效） | **已裁定，未落地** | 现行为右键「按住开镜」（2D）/ 完全空闲（3D） |
| smoke 全车标配、不占副武器槽 | **已裁定，未落地** | 现行为 smoke 属副武器 `smoke` 型 |
| 反炮兵雷达（玩家被动卡 + 敌方 G 类固有） | **已裁定，未落地** | 现无该机制；`RULES.radar` 键不存在 |
| 22 + 4 台车辆配表 | **已裁定，未落地** | 现 `tanks/*.json` 为 6 台 |
| 攻/防模式仅自动塔享有 | **已裁定，未落地** | 依赖型别池落地 |
| 首发范围 8 台核心档 | **已裁定，未落地** | 用户 2026-10-29 第 5 条 |

## 键位：右键成为副武器主交互

| 键 | 行为 |
|---|---|
| **鼠标右键** | **副武器主交互**：自动塔车 = 点按切攻/防模式；手动型 = 点按发射 1 次（**非按住连发**） |
| `F` | 保留为副武器等效键（与右键同功能，重映射玩家仍有键盘选项），不再是唯一入口 |
| 左键 / 空格 | 主炮（空格齐射），**不变** |

**事实核查（2026-10-29）**：3D 页右键完全空闲（只绑左键开火，连 `contextmenu` 都未拦截）；2D 正式局右键现有「按住开镜」（zoom 1.6×），属可迁移功能——用户裁定**开镜无迁移问题**（2D/2.5D 视角不存在开镜，3D 如需另案）。

## 副武器型别池（7 → 6 型）

| 型 | 机制来源 | 操作 |
|---|---|---|
| **rws** 自动机枪塔 | `turret`（直射 AP，伤害 = 主炮 base × 比例） | 自动开火；F = 攻（前向扇区、射程远）/ 防（炮塔后方 180°、射程稍近）切换 |
| **agl** 自动榴弹枪塔 | `mortar` 轻量自动变体（曲射越掩体） | 自动；F 攻/防同上 |
| **sam** 自动导弹塔 | `missile` 自动化（锁定式） | 自动；F 攻/防同上 |
| **missile** 锁定导弹吊舱 | `missile`（手动） | 手动击发（右键 / F） |
| **missile_wire** 线导导弹 | `missile_wire`（手动） | 手动击发 |
| **rocket** 火箭巢 | `rocket`（手动） | 手动击发 |

- **`smoke` 烟幕弹发射器**：**全车型初始标配，不占副武器槽**——朝炮塔前方一小段距离发射并爆开成烟（沿用现 smoke 的 `cloudCount` / `spreadPx` / `duration`）。卡牌「发动机排气拉烟（ESS）」升级为移动中沿车尾持续拉烟（对齐 `PLAN.md` §4.5 的发动机烟幕方向）。
- **不固化**：`mortar`（现实载体为步兵迫击炮，无适配车型）、`mine_layer`（无装甲布雷车车型）——两者不进型别池。

## 车辆与主副武器配表（22 + 4 台）

主武器全部固化；弹种升级走卡牌。主武器类型沿用现机制：`standard` / `autocannon` / `double_barrel` / `railgun` / `clip` / `howitzer`，新增 `missile_wire` 主武器化入口。

### 主战坦克（T）

| 底盘 | 主武器（固化） | 副武器（固化） |
|---|---|---|
| T-62 | standard 115mm 滑膛 | rws |
| M60A1 | standard 105mm 线膛 | rws |
| Leopard 1 | standard 105mm | rws |
| T-72B | standard 125mm（重 alpha） | rws |
| Leopard 2A6 | standard 120mm 高穿深 | rws |
| M1A2 SEP | standard 120mm 高速弹 | rws |
| 挑战者 2 | standard 120mm 线膛（重甲） | rws |
| K2 黑豹 | standard 120mm（液气悬挂） | rws |
| T-14 阿玛塔 | standard 125mm 2A82 | rws（无人炮塔另有被击穿减伤） |

### 步兵战车 / 轮式（I / L）

| 底盘 | 主武器（固化） | 副武器（固化） |
|---|---|---|
| BMP-2 | autocannon 30mm 2A42 | agl |
| BMP-3 | autocannon 30mm 2A72（100mm 2A70 并入弹种环） | agl |
| Puma | autocannon 30mm（空爆弹） | rws |
| ZBD-04A | autocannon 30mm | agl |
| Warrior 升级版 | autocannon 30mm（单发威力型） | rws |
| CV9035 | autocannon 35mm | rws |
| BMPT 终结者 | double_barrel 双联 30mm 2A42（**机炮为主武器**） | missile_wire 双联导弹箱（**不加挂 AGL**） |
| 半人马 B1 | standard 120mm | missile |
| BTR-82A | autocannon 30mm（薄甲低伤） | agl |

### 自行火炮（G）/ 导弹歼击车（D）

| 底盘 | 主武器（固化） | 副武器（固化） |
|---|---|---|
| 2S19 Msta-S | howitzer 152mm | rws |
| PzH 2000 | howitzer 155mm | rws |
| 2S7 Pion | howitzer 203mm（超重曲射） | rws |
| IT-1 | missile_wire 主武器化（龙式线导） | rws |
| 9P157-2 菊花-S | missile 主武器化（双联 AT-15） | agl |

### 无炮塔 / 原型 / 幻想线

| 底盘 | 主武器（固化） | 副武器（固化） |
|---|---|---|
| Strv 103B | standard 103mm（车体瞄准） | smoke ×2 双管 |
| Object 490 系 | clip 152mm 弹夹炮 | rws |
| 电磁炮实验车（PL-01 概念 / 自拟） | railgun | rws |
| Obj 780（已有） | standard | rws |

### 经典二战车（已有，低配副武器）

| 底盘 | 主武器（固化） | 副武器（固化） |
|---|---|---|
| Tiger I | standard 88mm | 车体机枪（rws 低配：自动、伤害更低） |
| Panzer IV | standard 75mm | 车体机枪（rws 低配） |
| Hummel | howitzer 150mm | 车体机枪（rws 低配） |

**首发范围（用户 2026-10-29 第 5、6 条）**：先做 8 台核心档——T-62 / BMP-2 / BMP-3 / BMPT / 2S19 / Leopard 1 / T-72B / M1A2——验证管线；其余纯数据行量产。**导弹主武器化**（IT-1 / 菊花-S）与**车体瞄准**（Strv 103B）进首发。

**专属升级卡方向**（示例，按底盘过滤进卡池）：T-62「APFSDS」「炮射导弹试验」；T-72B「接触-1 反应装甲」；Leopard 2A6「DM53 长杆弹」「猎-歼火控」；M1A2「M829A3」「CITV 猎手」；挑战者 2「乔巴姆套件」「L27A1 碎甲」；BMP-3「2A70 高爆榴弹」；BMPT「双联弹链扩容」「Ataka 攻顶改造」；2S19 / PzH 2000「红土地制导」「MRSI 同时弹着」；Strv 103B「液气悬挂」；T-14「Afganit 主动防御」「卡普坦装甲」；电磁炮实验车「电容过载」「贯穿电弧溅射」；通用被动「反炮兵雷达」。

## 反炮兵雷达

| 侧 | 行为 |
|---|---|
| 玩家（被动卡） | 敌方 G 类自行火炮开火后显示**来袭方向**（屏幕边缘方位 + 小地图扇区，复用 `threatIndicators` 管线）；**只给方向不给坐标**。升级卡：窗口延长 / 扇区收窄 / 多源测向 |
| 敌方（G 类固有） | 玩家或友军自行火炮射击累计 2s（窗口累计制）⇒ 炮位对敌暴露 6~10s；停火走完窗口解除，持续开火顺延刷新；**暴露不吃隐蔽 / 烟幕减免** |
| 边界 | 玩家 `callStrike`（空中支援）**不算射击** |

数值键（**待标定**，实施时落 `RULES.radar`）：`{ detectSeconds: 2, cbxExposureSeconds: 8 }`。暴露时长 6~10s 标 `[PLACEHOLDER]`。

## 实施入口

> **这一节回答「以后要动手时怎么知道改哪」。** 实施前先过 §「落地状态」确认前置，再按下表逐行改；每行都给了消费方，改动前用 `grep` 复核符号仍在。

### 前置条件

1. **排期**：本工作包尚未进 `PLAN.md` 的里程碑序列。开工前先在 `PLAN.md` 定它的位置（MS1 收口前不开工——§2.7「明确不做」禁止 MS1 期间引入新机制）。
2. **设计器先行**：22 台配表靠手工写 JSON 不现实，必须先有 [设计器武器配置端](../editor/designer-weapon-config.md) 的赋值面板。
3. **契约一次定死**：`availability` 与 `muzzleAnchor` 是**外部 JSON 契约**，一旦有车按新格式落盘，旧代码读不了——必须先写 schema + `validateTank` 断言再改数据。

### 契约 → 消费方

| 要改的东西 | 消费方（改动点） | 迁移注记 |
|---|---|---|
| 键位 `secondaryInteract`（右键 + F 双键值） | `js/tank_bindings.js` 的 `KEY_BINDINGS` / `ACTION_INFO` 单点登记；`tank_battle.html` 两处 mouse 绑定改绑；`tank_3d.html` 补 `contextmenu` 拦截 | 开镜是**唯一波及面**（`aimMode` 绑定 + `ACTION_INFO` 文案）；2D 不开镜后该 action 可退役 |
| 副武器 6 型池 | `js/tank_weapons.js` 的 `WEAPON_DEFAULTS`（型别键集）；`js/tank_weapons.js` 的 `updateSecondaryWeapon` 分发 | `mortar` / `mine_layer` 保留机制代码但退出型别池；旧 `tanks/*.json` 若引用二者需迁移或标废 |
| 自动塔攻/防模式 | `js/tank_weapons.js` 的 `updateSecondaryWeapon` 的 `turret` 分支（扇区/射程两档）；`RULES.weapons` 新增参数（**`role-systems` 写**） | 现有 `turret` 无模式概念，属**新增行为**，须配 `RULES.*.enabled` 关停开关 |
| smoke 全车标配 | `js/tank_weapons.js` 型别池；`js/tank_cards.js` 的 ESS 卡改为「移动拉烟」 | 现 smoke 在副武器槽内，改标配后**槽位腾出**，旧档若已装 smoke 需迁移 |
| 反炮兵雷达 | `RULES.radar`（新块，**`role-systems` 写**）；`js/tank_strike.js`（记录射击）；`js/tank_ai.js`（敌方 G 类暴露判定）；`js/tank_battledraw.js` / `js/tank_minimap.js`（方向提示，复用 `threatIndicators`） | 纯新增，无迁移；`RULES.radar` 必须带 `enabled` 与消费方哨兵断言 |
| 22 + 4 台配表 | `tanks/*.json`（一型一文件）；`js/tank_model.js` 的 `applyTankConfig` | 现有 6 台向后兼容：未声明固化字段时按旧 `weapons` 读 |
| 取消主武器更换卡 | `js/tank_cards.js` 的 `cardEligible` 过滤；`cards/*.json` 删除对应卡 | **卡池收缩**，需同步 `node scripts/audit-content.js` 的分布基线 |

### 验收口径

- **每一条契约都要有负向断言**：旧数据不带新字段 ⇒ 行为与改动前逐位一致（`muzzleAnchor` 缺省回退 `gunTip`、`availability` 缺省全 `true`）。
- **键位**：`test-bindings` 断言右键与 F 触发同一 action，且 `contextmenu` 被拦截（3D 页）。
- **型别池**：断言 6 型全部可实例化，且 `mortar` / `mine_layer` **不再出现在型别下拉**（负向）。
- **数据**：`node scripts/validate-content.js` exit 0 + `audit-content.js --strict` 分布不离线。

## 相关页面
- [武器与装填](./weapons-reload.md) — 主炮五型与装填公式（本页的型别池建在它的机制之上）
- [技能与副武器](./abilities-secondary.md) — 现行副武器五类与 F 键边沿口径
- [设计器武器配置端](../editor/designer-weapon-config.md) — 22 台配表与 `muzzleAnchor` 的编辑入口
- [曲射火力](./arc-fire.md) — `agl` / `howitzer` 的越障契约
