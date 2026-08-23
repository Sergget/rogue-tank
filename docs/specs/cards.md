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
2. **ammo**：弹种改造 {key:'ap'|'apcr'|'he', field:'pen'|'dmg'|'speed', mode, value}（接入点 §5.4）。
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
