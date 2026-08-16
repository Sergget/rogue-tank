'use strict';

// tank_revive.js — 死亡/复活状态机（P-11 / DEVELOPMENT.md §2.3 / §6 条目 8）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
//
// 定位（§2.3 已定型）：死亡为永久性（真 Roguelike）；失败条件 = 复活次数耗尽。
// 复活效果 = 满状态 + 友军据点周围随机无障碍点 + 短暂无敌（RULES.revive.invulnSeconds）。
// 复活次数基础 2，局前可用商店点数购买追加（购买接入口属经济里程碑 M10，本模块只负责
// 消耗/判定与复活点查找）。

function reviveConfig(){ return (typeof RULES !== 'undefined' && RULES.revive) ? RULES.revive : {}; }

// 查找复活点：友军据点周围半径内随机无障碍点；无据点回退玩家出生点。
// covers 为掩体数组（{x,y,w,h,tier}），排除 solid/graduated 掩体包围盒（+padding 余量）。
// rng 为随机源（可选），确定性测试可传 createRNG。
function findReviveSpot(outpost, covers, playerSpawn, rng, radius){
  const cfg = reviveConfig();
  const center = outpost ? { x: outpost.x, y: outpost.y } : (playerSpawn || { x: 0, y: 0 });
  const R = radius !== undefined ? radius : (cfg.reviveRadius !== undefined ? cfg.reviveRadius : 150);
  const r = rng || Math.random;
  for(let attempt = 0; attempt < 40; attempt++){
    const ang = r() * Math.PI * 2;
    const dist = r() * R;
    const x = center.x + Math.cos(ang) * dist;
    const y = center.y + Math.sin(ang) * dist;
    if(!pointInAnyCover(covers, x, y, 40)) return { x: Math.round(x), y: Math.round(y) };
  }
  return { x: Math.round(center.x), y: Math.round(center.y) };   // 兜底：中心点
}

// 点是否落在任一掩体包围盒内（padding 外扩）
function pointInAnyCover(covers, x, y, padding){
  if(!covers) return false;
  for(const c of covers){
    if(c.hp <= 0) continue;
    const halfW = (c.w || 0) / 2 + padding, halfH = (c.h || 0) / 2 + padding;
    if(Math.abs(x - c.x) <= halfW && Math.abs(y - c.y) <= halfH) return true;
  }
  return false;
}

// 满状态复活：重置 hp/位置/debuffs/起火/履带/弹药架，置无敌计时器。
// 返回复活后的实体。invulnSeconds 缺省取 RULES.revive.invulnSeconds。
function reviveTank(t, spot, invulnSeconds){
  const cfg = reviveConfig();
  const inv = invulnSeconds !== undefined ? invulnSeconds : (cfg.invulnSeconds !== undefined ? cfg.invulnSeconds : 3);
  if(t.stats && t.stats.maxHp){ t.maxHp = t.stats.maxHp; t.hp = t.stats.maxHp; }
  else { t.hp = t.maxHp || 100; }
  t.x = spot.x; t.y = spot.y;
  t._dead = false;
  t.immobT = 0; t.dotT = 0; t.dotDps = 0; t.dotSeconds = 0; t.fireDebuffT = 0;
  t.fireT = 0; t.debuffs = {}; t.trackBroken = false;
  t.ammoBlew = false; t._blowFx = false; t._trackFx = false;
  t.reviveT = 0; t._prevFireT = 0;
  t.invulnT = inv;
  return t;
}

// 是否可复活（剩余复活次数 > 0）
function canRevive(t){ return (t.revives || 0) > 0; }

// 消耗一次复活次数并执行满状态复活；返回是否成功（次数耗尽则失败）。
function reviveAt(t, outpost, covers, playerSpawn, rng){
  if(!canRevive(t)) return false;
  t.revives--;
  const spot = findReviveSpot(outpost, covers, playerSpawn, rng);
  reviveTank(t, spot);
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    reviveConfig,
    findReviveSpot,
    pointInAnyCover,
    reviveTank,
    canRevive,
    reviveAt
  };
}
