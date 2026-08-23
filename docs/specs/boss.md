# 战术坦克 Roguelike — Boss 战与首领机制规范 (Boss Spec)

> 权威子文档：由主文档 docs/DEVELOPMENT.md 索引。
> 涉及模块：js/tank_boss.js, bosses/*.json, js/tank_ai.js

---

## 1. Boss 战设计定位
- 线性节点推进链的终关首领（assignBossNode 放置于 run.nodes 最后一关；Boss 战不混普通敌军）。
- 设计范式：FTL 多阶段 + Into the Breach 弱点机制——阶段切换制造节奏变化，弱点部位制造瞄准博弈。

## 2. 数据契约 (bosses/<id>.json)
validateBoss 校验；bossStageFor 按 hp 比例取当前阶段：

    {
      "id": "...",
      "name": "...",
      "desc": "...",
      "tankId": "...",          // 底盘 tank JSON
      "stages": [
        { "hpThreshold": 1.0, "modifiers": [...], ... },
        { "hpThreshold": 0.6, "modifiers": [...] },
        { "hpThreshold": 0.25, "modifiers": [...] }
      ],
      "summons": [ { "tankId": "...", "count": 2 } ],
      "loot": { "score": 500 }
    }

当前池：5 个 Boss（均 3 阶段、掉落齐全，audit --strict 全绿）。

## 3. 运行时机制 (makeBossEntity / applyBossStage / updateBossStage)
- **阶段切换**：血量阈值触发 applyBossStage——挂 run scope modifiers（数值强度跃升），run 结束清除。
- **随从 summons**：入场 spawnTank 伴随单位（team:enemy，nodeSpawn 标记计入清敌判定）；复用同一敌对 AI 双态状态机。
- **击败掉落 loot.score**：finishNode 时叠加进节点通关得分。
- **AI 复用**：Boss 与 summons 走 aiDecideEnemy 同一管线（含 P-19 多态状态机 Stunned/Flank/Defensive/Search&Destroy/Patrol）。
