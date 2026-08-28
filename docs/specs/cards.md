# 战术坦克 Roguelike — 卡牌与构筑系统规范 (Cards & Build Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_cards.js, cards/*.json, scripts/validate-content.js, scripts/audit-content.js, scripts/test-cards.js

---

## 1. 卡牌设计定位
- **局内改装强化**：卡牌是节点通关后三选一的坦克改装/战术强化，不是手牌指令牌组。
- **拟真坦克调性**：效果围绕装甲/穿深/装填/机动/散布/视野/弹种/乘员展开，贴合"摆角度找跳弹、找掩体抢位置"的博弈立意（参照 Slay the Spire 稀有度分层+流派构筑，落到坦克改装语境）。

## 2. 卡牌数据契约 (cards/<id>.json，一型一文件，经 GET /api/cards 聚合)
Schema 唯一权威 = js/tank_cards.js 的 validateCard：

    {
      "id": "spaced_armor",
      "name": "间隙装甲",
      "rarity": "common",
      "tags": ["重甲"],
      "desc": "车体正面附加间隙装甲，等效厚度 +12mm。",
      "effects": [
        { "type": "modifier", "stat": "armor.hull.front", "mode": "add", "value": 12 }
      ],
      "maxStacks": 3
    }

## 3. 六大效果类型 (type 决定 params)
1. **modifier**：{stat, mode:'add'|'mult', value}——stat 白名单（穿透/伤害/装填/弹速/极速/转向/炮塔转速/装甲路径 armor.hull.front 等）或履带锁/模块倍率/DOT倍率/散布。立即生效（走 addModifier 管道，§5.1 三层属性系统）。
2. **ammo**：弹种改造 {key:'ap'|'apcr'|'he', field:'pen'|'dmg'|'speed', mode, value}。
   - **mode:'mult'**：对 RULES 基准倍率做乘算聚合。
   - **mode:'add' = 乘算后毫米追加**（2026-08-26，原 ISSUES #A13 修复定案）：最终属性 = base × mult聚合 + Σadd，value 按**字段自然单位**计——pen=mm / dmg=伤害值 / speed=px/s（如「APCR穿深+14mm」即最终穿深加 14mm，而非倍率刻度 +14）。
   - `computeAmmoConfig` 将 Σadd 输出为独立的 `fieldAdd` 字段存放，由消费方（fireTank/computeAmmoConfig 合成端）在乘算聚合之后合成，杜绝把 mm 追加混入倍率刻度。
   - 软上限 `ammoTypeCap` 作用于**最终等效值**且仅钳 HE（AP/APCR/HEAT 不受限）。（接入点 §5.4）
3. **ability**：主动装置 {key:'smoke'|'artillery'|'shield'|'overdrive'}（按键触发，P-17 接入 G/H/V）。
4. **passive**：机制性被动 {key:'reactive_armor'|'angle_boost'|'overmatch'|'spall_liner'|'commander_sight', value?}。
5. **drone**：伴随浮游炮 {kind:'scout'|'striker'}（§2.2 已定型，countMax=2 上限）。
6. **economy**：{field:'scoreMul'|'shopDiscount'|'startScore'|'reviveCount', value}（运行时消费待接线）。

## 4. 稀有度分层与流派
- CARD_RARITIES：common / rare / epic / legendary 四档。
- CARD_TAGS 流派标签：重甲/机动/狙击/支援等，供 drawCardChoices 构筑导向抽卡。
- 当前分布（2026-08-22 审计）：common 47.8% / rare 31.3% / epic 15.7% / legendary 5.2%，115 张卡全量通过 --strict 零警告。
- 效果类型分布：modifier 101 / ammo 17 / ability 11 / passive 8 / economy 5 / drone 2。

## 5. 堆叠与验证工具链
- maxStacks：同卡最大持有数，cardStackCount 计数，选择阶段硬性截断。
- validate-content.js：逐卡 schema 校验。
- audit-content.js --strict：稀有度/流派/效果分布常态化审计（偏差 <3% 视为统计波动）。
- test-card-effects.js：442 断言 115 张卡全链路执行验证。
- **P-42 扩展审计维度（2026-08-28，audit-content.js）**：新增四个报告型维度——① 流派×稀有度覆盖率；② 流派→效果类型构成；③ 同稀有度强度曲线（`multDev = Σ|mult值−1|`，仅统计 mult 效果，passive/ability/economy/add 单独列出以避量纲混淆；含离群警示 + 跨档单调性检查，仅在高稀有度含 ≥3 张 mult 卡时比较防假失衡）；④ tag 组合矩阵 + `heat_*`/`he_*`/`demo_*` 定点交叉对比表。
- **P-42 首轮审计结论（2026-08-28）**：修正单调性检查后无 red 级 mult 失衡（0 警告）；唯一可观测缺口为**内容覆盖**——HEAT 弹种仅 3 张卡（heat_composite_pen/heat_overpressure common、heat_precision rare），无 epic/legendary 档，明显薄于 HE/AP/APCR；属 card-author 补卡范畴（内容前置），非数值调优，暂缓。

## 6. 被动卡接线结论（2026-08-26，#A14/#A15）
- **passive 统一消费入口** `passiveValues(tank, key)`（`js/tank_physics.js`）：收集 cardEffects 中 `type:'passive'` 的数值数组，多来源聚合语义由消费方自决——`overmatch` 取最大阈值、`spall_liner` 取最小乘数（取最强）。
- **`#A14b` overmatch（口径碾压，`demo_overmatch_shell` epic）**：AP/APCR（或 key 为空）命中时，若目标受击面等效厚度 eff ≤ 穿深×阈值（默认 0.85），跳过跳弹判定与过陡 BLOCK 分支、强制按穿透路径结算（正常未击穿判定 eff>effPen 仍保留）；命中结果带 `res.overmatch=true` 标记。HEAT/HE 本就走 noBounce，不走此路径。定案：按用户意向转 AP 弹种（原 HE dmg 效果移除，仅保留 passive overmatch）。
- **`#A14a` 全线高爆战术（`demo_all_he_doctrine` legendary）**：移除全局 reload×0.85 白送效果，仅保留 HE dmg×1.2 + HE pen×1.2 两重弹种效果——不再溢出到全弹种装填。
- **`#A15` 防崩落内衬（`support_spall_liner` rare 0.8 / `spall_liner` epic 0.85）**：spallMul 乘入击穿路径与 HE 残余爆轰的最终伤害（位于装甲/跳弹判定之后、随机抖动与取整之前，保证显示伤害=实际扣血整数一致）。
- 测试锚定：`scripts/test-cards.js` §#A14a/#A14b/#A15 断言覆盖（overmatch 免跳弹/阈值不满足仍跳弹/HEAT 不受影响；内衬 rare 0.8 + epic 0.85 多来源取最强）。
