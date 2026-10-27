// ======================= 玩家侧暴露度反馈（EXPOSURE） =======================
// 2026-10-27 新增（P0）。归口：docs/specs/combat/hud-ui.md「玩家侧暴露度指示器」。
//
// 【为什么存在】
//   隐蔽机制（`RULES.camouflage`）在**判定层**是通的——它确实把敌方首次激活距离从 700px
//   压到 380~660px（实测见 scripts/test-exposure-feedback.js）。但玩家**完全看不到**：
//   ① 玩家不知道自己当前隐蔽值多少；② 不知道自己此刻是否已被发现；③ 不知道附近有谁在警戒。
//   ⇒ 系统「能算」但玩家「看不懂」⇒ 隐蔽机制在体验层等于不存在，玩家只能归因为
//     「敌人不讲道理」。这是「感觉不对但说不清哪里」的主要来源之一。
//
// 【本模块的职责边界】
//   只做**玩家侧可读性**：把「我此刻有多暴露」翻译成一个玩家能据以行动的分档。
//   **不新增任何判定**——不改变 AI 触发距离、不改变 hasLineOfSight、不改变命中。
//   读数一律取自既有权威源（camouflageValue / aiTriggerDist / aiEngaged / alertLevel），
//   避免出现「HUD 说的」和「机制算的」两套口径（这正是 ISSUES #Z2 的教训）。
//
// 【纯度】
//   本模块为**纯函数**：不读 DOM、不读全局状态、不产生副作用。
//   实体数组由调用方传入 ⇒ 可 Node 单测、可回放复现。
//
// 【与敌方 ?/! 图标的分工】
//   敌方头顶 `?`/`!`（`alertIndicatorFor`）表达的是**敌方对玩家的认知**（谁在找我）。
//   本模块表达的是**玩家自身的暴露状态**（我是否被看见）。
//   两者是同一件事的两端，缺一不可：只有 ?/! 时玩家是「被通知」，只有本模块时玩家是「能预判」。

'use strict';

// ---------- 暴露度分档 ----------
// 数值语义（见设计规格）：分档由「当前有效触发距离相对安全基线的比例」决定，
// 而有效触发距离 = 敌方 aiTriggerDist × 玩家隐蔽视距倍率。
//
// 为什么不直接显示「隐蔽值」数字：camo 是内部量纲（0~1.55，且玩家无从建立
// 「0.6 是好还是坏」的心智模型）。**分档**才可行动——玩家要的不是「我隐蔽值 0.62」，
// 而是「我现在站在开阔地且刚开过火，快跑」。

const EXPOSURE_LEVELS = {
  hidden:    { id:'hidden',    label:'隐蔽', order:0, tone:'safe' },
  exposed:   { id:'exposed',   label:'暴露', order:1, tone:'warn' },
  detected:  { id:'detected',  label:'被察觉', order:2, tone:'danger' },
};

// 分档阈值（比值 = 有效触发距离 ÷ 安全基线距离）。
//   ≤ 0.72 ⇒ hidden    ：有效发现距离比安全基线短 28% 以上，敌方很难进入激活圈
//   ≤ 1.00 ⇒ exposed   ：距离未被压缩，处于基线水平
//   > 1.00 ⇒ detected  : 有效发现距离长于基线（开火惩罚等），高危
// ⚠️ 「被察觉」这一档的**主判据不是距离**而是**事实**（任一敌方已接战/警戒到 3 级）——
//   距离只是次要参考。因为「被看见」是二值事实，用连续量表达会失真。
const EXPOSURE_HIDDEN_RATIO   = 0.72;
const EXPOSURE_DETECTED_RATIO = 1.00;

/**
 * 玩家当前有效触发距离（敌方要在这个距离内才可能首次激活）。
 * 口径严格对齐 `js/tank_ai.js` 的 `enterDCamo`：
 *   enterDCamo = enterD × _camoMul × _enemyCamoMul
 *   其中 enterD = t.aiTriggerDist（实体字段，缺省 RULES.ai.triggerDistBase）
 *         _camoMul = camouflageDistanceMultiplier(玩家)   ← 玩家隐蔽值折扣
 *         _enemyCamoMul = 对称化乘子（当前恒 1，开关关闭）
 * ⚠️ 敌方各自的 aiTriggerDist 可能不同（按难度），此处取**最近的那个敌方**的距离
 *    —— 因为对玩家而言「最危险的那台」才决定我此刻的暴露程度。
 *
 * @returns {{dist:number, base:number, ratio:number, source:'entity'|'base'}|null}
 */
function playerEffectiveTriggerDist(player, enemies){
  if(!player) return null;
  const ai = (typeof RULES !== 'undefined' && RULES && RULES.ai) ? RULES.ai : {};
  const base = ai.triggerDistBase !== undefined ? ai.triggerDistBase : 700;

  // 最近敌方的有效触发距离（取最近者 ⇒ 玩家视角「最危险的那台」）。
  let nearest = null, nearestDist = Infinity;
  if(Array.isArray(enemies)){
    for(const e of enemies){
      if(!e || e.team !== 'enemy' || !e.hp || e.hp <= 0) continue;
      if(e.isBoss) continue;               // Boss 有独立观瞄，不吃玩家隐蔽值（口径同 tank_ai.js）
      const d = (e.aiTriggerDist && e.aiTriggerDist > 0) ? e.aiTriggerDist : base;
      const px = player.x !== undefined ? player.x : 0, py = player.y !== undefined ? player.y : 0;
      const dist = Math.hypot((e.x||0) - px, (e.y||0) - py);
      if(dist < nearestDist){ nearestDist = dist; nearest = { d:d, dist:dist }; }
    }
  }
  const enterD = nearest ? nearest.d : base;

  // 玩家隐蔽视距倍率（与 tank_ai.js 同源函数）。
  let camoMul = 1;
  const camoFn = (typeof camouflageDistanceMultiplier === 'function') ? camouflageDistanceMultiplier : null;
  if(camoFn){
    try{ camoMul = Math.max(0.3, Math.min(1, camoFn(player))); } catch(e){ camoMul = 1; }
  }

  // 对称化乘子：当前 RULES.camouflage.symmetric 缺省 false ⇒ 恒 1。
  // 保留此通道是为了开关一旦打开，本读数不会悄悄失真。
  let enemyCamoMul = 1;
  const camoCfg = (typeof RULES !== 'undefined' && RULES && RULES.camouflage) ? RULES.camouflage : {};
  if(camoCfg.symmetric === true){
    const cf = (typeof camouflageDistanceMultiplier === 'function') ? camouflageDistanceMultiplier : null;
    if(cf){
      for(const e of (Array.isArray(enemies) ? enemies : [])){
        if(!e || e.team !== 'enemy' || !e.hp || e.hp <= 0 || e.isBoss) continue;
        try{ enemyCamoMul = Math.max(0.3, Math.min(1, cf(e))); } catch(e){ enemyCamoMul = 1; }
        break;
      }
    }
  }

  const eff = enterD * camoMul * enemyCamoMul;
  return {
    dist: eff,
    base: enterD,
    ratio: enterD > 0 ? (eff / enterD) : 1,
    source: nearest ? 'entity' : 'base',
  };
}

/**
 * 玩家侧暴露度分档。
 *
 * 判据优先级（**事实优先于连续量**）：
 *   1. 已被发现（任一敌方 aiEngaged 或 alertLevel≥3）⇒ detected
 *   2. 否则按有效触发距离比值分档：≤0.72 hidden / ≤1.00 exposed / >1.00 detected
 *   3. 附近有敌人在警戒（alertLevel≥1 或 aiState==='search'）⇒ 至少 exposed
 *
 * @param {object} player  玩家实体
 * @param {Array}  enemies 敌方实体数组（可含友军/无人机，函数内部过滤）
 * @returns {{level:string,label:string,tone:string,ratio:number,effDist:number,baseDist:number,
 *            spotted:boolean, watchers:number, suspect:number}}
 */
function exposureFor(player, enemies){
  const list = Array.isArray(enemies) ? enemies : [];
  const eff = playerEffectiveTriggerDist(player, list);
  const effDist = eff ? eff.dist : 0;
  const baseDist = eff ? eff.base : 0;
  const ratio = eff ? eff.ratio : 1;

  // 统计：谁已经锁定我（事实）、谁在怀疑（预警）。
  let spotted = false, watchers = 0, suspect = 0;
  for(const e of list){
    if(!e || e.team !== 'enemy' || !e.hp || e.hp <= 0) continue;
    if(e.isBoss) continue;
    const lv = (typeof e.alertLevel === 'number') ? e.alertLevel : 0;
    const searching = e.aiState === 'search';
    // 「已锁定」= 接战事实（aiEngaged）或警戒等级拉满（alertLevel 3）
    if(e.aiEngaged === true || lv >= 3){ spotted = true; watchers++; }
    else if(lv >= 1 || searching){ suspect++; }
  }

  let level;
  if(spotted){
    // 事实优先：已被锁定 ⇒ 无论距离比多低都是最高档
    level = 'detected';
  } else if(suspect > 0){
    // ⚠️ 「有人在搜你」必须**优先于** hidden 判定：否则玩家正被 6 辆敌车搜索时
    //   HUD 仍显示「隐蔽」——这比没有反馈更糟（给了虚假的安全感）。
    //   距离比只在「没人找我」时才决定分档。
    level = (ratio > EXPOSURE_DETECTED_RATIO) ? 'detected' : 'exposed';
  } else if(ratio <= EXPOSURE_HIDDEN_RATIO){
    level = 'hidden';
  } else {
    level = 'exposed';
  }

  const L = EXPOSURE_LEVELS[level] || EXPOSURE_LEVELS.exposed;
  return {
    level: L.id,
    label: L.label,
    tone: L.tone,
    ratio: ratio,
    effDist: effDist,
    baseDist: baseDist,
    spotted: spotted,
    watchers: watchers,
    suspect: suspect,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EXPOSURE_LEVELS,
    EXPOSURE_HIDDEN_RATIO,
    EXPOSURE_DETECTED_RATIO,
    playerEffectiveTriggerDist,
    exposureFor,
  };
}
