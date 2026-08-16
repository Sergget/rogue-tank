'use strict';

// tank_economy.js — 经济与存档（P-14 / DEVELOPMENT.md §2.4 / §6 条目 10）。
// 纯逻辑模块：无 DOM 依赖，storage 显式注入（浏览器 localStorage / Node 测试 fake），Node 可测。
//
// 两条独立货币线（§2.4 已定型）：
//   局内得分（击杀 + 节点通关奖励，仅本局）→ 节点间三选一卡牌（可消耗得分刷新）
//   商店点数（死亡时局内得分按比例转化，跨局永久）→ 死亡后商店：永久升级（贵）+ 复活次数（便宜）
// 永久升级树（UPGRADE_DEFS）为数据驱动内容，作用于 permanent scope 的 modifier（§5.1/P-12），
// 每项含 cost/maxLevel，死亡后商店用点数购买。

function economyConfig(){ return (typeof RULES !== 'undefined' && RULES.economy) ? RULES.economy : {}; }

// ---------- 永久升级树（内容，permanent scope） ----------

// 每项：{ id, name, stat, mode, value, cost, maxLevel, desc }
// stat 用卡牌同款白名单（穿透/伤害/装填/极速/装甲路径/耐久/散布等）；mode add=绝对量 / mult=倍率。
const UPGRADE_DEFS = [
  { id: 'pen_up',       name: '穿深强化', stat: 'penetration',         mode: 'add',  value: 5,    cost: 30, maxLevel: 5, desc: '穿透 +5mm/级' },
  { id: 'dmg_up',       name: '伤害强化', stat: 'damage',              mode: 'add',  value: 3,    cost: 30, maxLevel: 5, desc: '伤害 +3/级' },
  { id: 'armor_up',     name: '正面装甲', stat: 'armor.hull.front',    mode: 'add',  value: 5,    cost: 40, maxLevel: 5, desc: '车体正面装甲 +5mm/级' },
  { id: 'turret_armor', name: '炮塔装甲', stat: 'armor.turret.front',  mode: 'add',  value: 5,    cost: 40, maxLevel: 5, desc: '炮塔正面装甲 +5mm/级' },
  { id: 'hp_up',        name: '车体耐久', stat: 'maxHp',               mode: 'add',  value: 10,   cost: 25, maxLevel: 5, desc: '车体耐久 +10/级' },
  { id: 'speed_up',     name: '机动强化', stat: 'maxSpeed',            mode: 'add',  value: 5,    cost: 25, maxLevel: 5, desc: '极速 +5/级' },
  { id: 'reload_up',    name: '装填优化', stat: 'reload',              mode: 'mult', value: 0.97, cost: 35, maxLevel: 5, desc: '装填时间 −3%/级' },
  { id: 'aim_up',       name: '火控优化', stat: 'spreadMult',          mode: 'mult', value: 0.95, cost: 35, maxLevel: 5, desc: '散布 −5%/级' }
];

function getUpgradeDef(id){ return UPGRADE_DEFS.find(u => u.id === id) || null; }

// ---------- 存档结构（版本化） ----------

// profile = { version, points, upgrades: { id → level }, stats: { runs, kills } }
function defaultProfile(){
  return { version: economyConfig().saveVersion || 1, points: 0, upgrades: {}, stats: { runs: 0, kills: 0 } };
}

// 校验并归一化 profile（版本不匹配/损坏 → 回退默认，避免脏数据崩 UI）
function normalizeProfile(p){
  const cfg = economyConfig();
  const def = defaultProfile();
  if(!p || typeof p !== 'object' || p.version !== (cfg.saveVersion || 1)) return def;
  const out = {
    version: p.version,
    points: Number.isFinite(p.points) && p.points >= 0 ? Math.floor(p.points) : 0,
    upgrades: {},
    stats: { runs: 0, kills: 0 }
  };
  if(p.upgrades && typeof p.upgrades === 'object'){
    for(const id in p.upgrades){
      const lv = p.upgrades[id];
      if(getUpgradeDef(id) && Number.isInteger(lv) && lv > 0) out.upgrades[id] = lv;
    }
  }
  if(p.stats && typeof p.stats === 'object'){
    out.stats.runs = Number.isInteger(p.stats.runs) && p.stats.runs > 0 ? p.stats.runs : 0;
    out.stats.kills = Number.isInteger(p.stats.kills) && p.stats.kills > 0 ? p.stats.kills : 0;
  }
  return out;
}

// storage 注入：{ getItem(key), setItem(key, str) }（浏览器 localStorage / 测试 fake）
function loadProfile(storage){
  try {
    if(!storage || typeof storage.getItem !== 'function') return defaultProfile();
    const raw = storage.getItem(economyConfig().saveKey || 'rogue-tank-save');
    if(!raw) return defaultProfile();
    return normalizeProfile(JSON.parse(raw));
  } catch(e){ return defaultProfile(); }
}

function saveProfile(storage, profile){
  if(!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(economyConfig().saveKey || 'rogue-tank-save', JSON.stringify(normalizeProfile(profile)));
    return true;
  } catch(e){ return false; }
}

// ---------- 得分与转化 ----------

function killScore(){ return economyConfig().killScoreBase || 20; }

// 死亡时局内得分 → 商店点数（向下取整）
function scoreToPoints(score, ratio){
  const r = ratio !== undefined ? ratio : (economyConfig().scoreToPointsRatio || 0.1);
  return Math.floor((score || 0) * r);
}

// ---------- 升级购买与应用 ----------

function upgradeLevel(profile, id){ return (profile.upgrades && profile.upgrades[id]) || 0; }

function canBuyUpgrade(profile, id){
  const u = getUpgradeDef(id);
  if(!u) return false;
  return upgradeLevel(profile, id) < u.maxLevel && profile.points >= u.cost;
}

// 购买一级；成功返回 true 并扣点
function buyUpgrade(profile, id){
  if(!canBuyUpgrade(profile, id)) return false;
  const u = getUpgradeDef(id);
  profile.points -= u.cost;
  profile.upgrades[id] = upgradeLevel(profile, id) + 1;
  return true;
}

// 把已购永久升级应用到坦克（permanent scope，每级叠一层；开局调用）
function applyUpgrades(tank, profile){
  if(!profile || !profile.upgrades) return 0;
  let applied = 0;
  for(const id in profile.upgrades){
    const u = getUpgradeDef(id);
    if(!u) continue;
    const lv = profile.upgrades[id];
    for(let i = 0; i < lv; i++){
      if(typeof addModifier === 'function'){
        addModifier(tank, { stat: u.stat, mode: u.mode, value: u.value, source: 'upgrade:' + id, scope: 'permanent' });
        applied++;
      }
    }
  }
  return applied;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    economyConfig,
    UPGRADE_DEFS,
    getUpgradeDef,
    defaultProfile,
    normalizeProfile,
    loadProfile,
    saveProfile,
    killScore,
    scoreToPoints,
    upgradeLevel,
    canBuyUpgrade,
    buyUpgrade,
    applyUpgrades
  };
}
