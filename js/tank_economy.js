'use strict';

// tank_economy.js — 经济与存档（P-14 + M10 扩展·特性1步骤1/特性3数据面 / DEVELOPMENT.md §2.4 / §6 条目 10、22）。
// 纯逻辑模块：无 DOM 依赖，storage 显式注入（浏览器 localStorage / Node 测试 fake），Node 可测。
//
// 两条独立货币线（§2.4 已定型）：
//   局内得分（击杀 + 节点通关奖励，仅本局）→ 节点间三选一卡牌（可消耗得分刷新）
//   商店点数（死亡时局内得分按比例转化，跨局永久）→ 局前/死亡后商店：永久升级（贵）+ 复活次数（便宜）
// 永久升级树（UPGRADE_DEFS）为数据驱动内容，作用于 permanent scope 的 modifier（§5.1/P-12），
// 每项含 cost/maxLevel，商店用点数购买。
//
// 存储模型（M10 扩展：「元索引 + 槽位字典」多存档体系，替代 P-14 单一键）：
//   元索引键 <savesMetaKey>（缺省 'rogue-tank-saves-meta'）
//     = { activeSaveId: string|null, saves: Array<{ id, name, updatedAt }> }
//   槽位键   <saveSlotPrefix><id>（缺省前缀 'rogue-tank-save:'）= 该槽 profile（走 normalizeProfile）
//   旧单键   <saveKey>（缺省 'rogue-tank-save'，无冒号，与槽位前缀不冲突，保持原样）
//   兼容策略：读取路径先跑 migrateLegacySave——元索引不存在且旧单键有合法 v1 数据时，
//   以其数据创建首个槽位（名「默认存档」）并设 active；迁移后旧键保留不删除
//   （防迁移中途失败丢档，由 UI 层后续确认后清理）。元索引已存在则幂等 no-op。

function economyConfig(){ return (typeof RULES !== 'undefined' && RULES.economy) ? RULES.economy : {}; }

// ---------- 存储键名（RULES.economy 可选覆盖，缺省用字面量） ----------

function savesMetaKey(){ return economyConfig().savesMetaKey || 'rogue-tank-saves-meta'; }
function saveSlotPrefix(){ return economyConfig().saveSlotPrefix || 'rogue-tank-save:'; }
function legacySaveKey(){ return economyConfig().saveKey || 'rogue-tank-save'; }
function slotKey(id){ return saveSlotPrefix() + id; }

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

// 弹种配备上限（PLAN 特性2：严格限制最多选择 3 种弹种）
const AMMO_LOADOUT_MAX = 3;

// profile = { version, points, upgrades: { id → level }, stats: { runs, kills },
//             selectedTankId, ammoLoadout: [ammoKey×≤3], bonusRevives }
function defaultProfile(){
  return {
    version: economyConfig().saveVersion || 1,
    points: 0,
    upgrades: {},
    stats: { runs: 0, kills: 0 },
    selectedTankId: null,
    ammoLoadout: [],
    bonusRevives: 0
  };
}

// 校验并归一化 profile（版本不匹配/损坏 → 回退默认，避免脏数据崩 UI）。
// 版本规则保持不变：version 不匹配 → 整档回退默认（防脏数据）；新字段缺省填充即可向后兼容 v1 旧档。
function normalizeProfile(p){
  const cfg = economyConfig();
  const def = defaultProfile();
  if(!p || typeof p !== 'object' || p.version !== (cfg.saveVersion || 1)) return def;
  const out = {
    version: p.version,
    points: Number.isFinite(p.points) && p.points >= 0 ? Math.floor(p.points) : 0,
    upgrades: {},
    stats: { runs: 0, kills: 0 },
    selectedTankId: (typeof p.selectedTankId === 'string' && p.selectedTankId.length > 0) ? p.selectedTankId : null,
    ammoLoadout: [],
    bonusRevives: Number.isInteger(p.bonusRevives) && p.bonusRevives >= 0 ? p.bonusRevives : 0
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
  if(Array.isArray(p.ammoLoadout)){
    // 逐项必须是 RULES.ammoTypes 的 key；去重保序；最多保留前 AMMO_LOADOUT_MAX 个
    const seen = {};
    for(const k of p.ammoLoadout){
      if(typeof k !== 'string' || seen[k]) continue;
      if(typeof RULES === 'undefined' || !RULES.ammoTypes || !Object.prototype.hasOwnProperty.call(RULES.ammoTypes, k)) continue;
      seen[k] = true;
      out.ammoLoadout.push(k);
      if(out.ammoLoadout.length >= AMMO_LOADOUT_MAX) break;
    }
  } // 非数组 → 保持 []（非法输入整体归空）
  return out;
}

// ---------- 元索引内部读写（非导出） ----------

function defaultMeta(){ return { activeSaveId: null, saves: [] }; }

// 校验并归一化元索引结构（剔除坏条目/重复 id/悬空 activeSaveId）
function normalizeMeta(m){
  const out = defaultMeta();
  if(!m || typeof m !== 'object') return out;
  const ids = {};
  if(Array.isArray(m.saves)){
    for(const s of m.saves){
      if(!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id || ids[s.id]) continue;
      ids[s.id] = true;
      out.saves.push({
        id: s.id,
        name: (typeof s.name === 'string' && s.name.length > 0) ? s.name : '未命名存档',
        updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt : 0
      });
    }
  }
  if(typeof m.activeSaveId === 'string' && ids[m.activeSaveId]) out.activeSaveId = m.activeSaveId;
  return out;
}

// 读元索引。返回 null 表示「缺失或损坏」（区别于合法的空列表），调用方决定回退策略。
function readMeta(storage){
  try{
    if(!storage || typeof storage.getItem !== 'function') return null;
    const raw = storage.getItem(savesMetaKey());
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== 'object') return null;
    return normalizeMeta(parsed);
  } catch(e){ return null; }
}

function writeMeta(storage, meta){
  if(!storage || typeof storage.setItem !== 'function') return false;
  try{
    storage.setItem(savesMetaKey(), JSON.stringify(normalizeMeta(meta)));
    return true;
  } catch(e){ return false; }
}

// 删键：优先 removeItem；无 removeItem 的最小 fake storage 回退写空串（读取端 !raw 视为缺失）
function removeStorageItem(storage, key){
  try{
    if(typeof storage.removeItem === 'function') storage.removeItem(key);
    else storage.setItem(key, '');
  } catch(e){}
}

// 槽位 id：时间戳(36 进制) + 模内计数器 + 随机后缀——同毫秒多次创建也不冲突
let saveIdSeq = 0;
function newSaveId(){
  saveIdSeq = (saveIdSeq + 1) % 0xffff;
  return 'sv' + Date.now().toString(36) + '-' + saveIdSeq.toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function byUpdatedAtDesc(a, b){ return b.updatedAt - a.updatedAt; }

// ---------- 多存档槽位 API（storage 显式注入） ----------

// 旧单键 → 多存档迁移。返回 true 表示执行了迁移。
// 元索引存在（含合法空列表）→ 幂等 no-op 返回 false；
// 元索引缺失且旧单键有合法 v1 数据 → 建首槽（名「默认存档」，可配 legacySaveName）并设 active；
// 迁移后不删除旧键（防中途失败丢档，UI 层后续再清理）。元索引损坏视为缺失 → 尝试从旧键恢复。
function migrateLegacySave(storage){
  try{
    if(!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return false;
    if(readMeta(storage)) return false;                       // 已迁移（或用户已建档）→ no-op
    const raw = storage.getItem(legacySaveKey());
    if(!raw) return false;                                    // 无旧档可迁
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== 'object' ||
       parsed.version !== (economyConfig().saveVersion || 1)) return false; // 旧档不合法 → 不建垃圾槽
    const id = newSaveId();
    storage.setItem(slotKey(id), JSON.stringify(normalizeProfile(parsed)));
    const meta = defaultMeta();
    meta.saves.push({ id, name: economyConfig().legacySaveName || '默认存档', updatedAt: Date.now() });
    meta.activeSaveId = id;
    return writeMeta(storage, meta);
  } catch(e){ return false; }
}

// 存档列表元数据，按 updatedAt 降序（最近游玩在前）
function listSaveSlots(storage){
  const meta = readMeta(storage);
  if(!meta) return [];
  return meta.saves.slice().sort(byUpdatedAtDesc);
}

// 创建新槽位：合并 defaultProfile 与 initialData 后 normalize 入槽，并设为 active。
// 返回新 slotId；storage 无效/写入失败返回 null。（先试一次迁移，避免损坏元索引场景下旧档被永久搁置）
function createSaveSlot(storage, name, initialData){
  try{
    if(!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return null;
    migrateLegacySave(storage);
    const meta = readMeta(storage) || defaultMeta();          // 元索引损坏 → 就地重建
    const merged = Object.assign(defaultProfile(), (initialData && typeof initialData === 'object') ? initialData : {});
    const id = newSaveId();
    storage.setItem(slotKey(id), JSON.stringify(normalizeProfile(merged)));
    const label = (typeof name === 'string' && name.trim().length > 0) ? name.trim() : '新存档';
    meta.saves.push({ id, name: label, updatedAt: Date.now() });
    meta.activeSaveId = id;
    return writeMeta(storage, meta) ? id : null;              // 极小概率：槽已写但 meta 失败 → 孤儿槽（无事务，容忍）
  } catch(e){ return null; }
}

// 删除槽位。删的是 active 时，activeSaveId 迁到剩余槽中 updatedAt 最大者；无剩余 → null。
// 删不存在的 id / 元索引缺失或损坏 → false。
function deleteSaveSlot(storage, id){
  try{
    if(!storage || typeof id !== 'string' || !id) return false;
    if(typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return false;
    const meta = readMeta(storage);
    if(!meta) return false;
    const idx = meta.saves.findIndex(s => s.id === id);
    if(idx < 0) return false;
    removeStorageItem(storage, slotKey(id));
    meta.saves.splice(idx, 1);
    if(meta.activeSaveId === id){
      const rest = meta.saves.slice().sort(byUpdatedAtDesc);
      meta.activeSaveId = rest.length > 0 ? rest[0].id : null;
    }
    return writeMeta(storage, meta);
  } catch(e){ return false; }
}

// 重命名：仅改元索引中的 name（不动 updatedAt）。id 不存在 / 新名非法 → false。
function renameSaveSlot(storage, id, newName){
  try{
    if(!storage || typeof id !== 'string' || !id) return false;
    if(typeof newName !== 'string' || newName.trim().length === 0) return false;
    if(typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return false;
    const meta = readMeta(storage);
    if(!meta) return false;
    const entry = meta.saves.find(s => s.id === id);
    if(!entry) return false;
    entry.name = newName.trim();
    return writeMeta(storage, meta);
  } catch(e){ return false; }
}

// 切换 active 存档（「选择进入」）。id 必须已存在于元索引 saves 中；成功 true，否则 false。
// 约定：纯选择动作【不 touch】该槽 updatedAt——「最后游玩时间」只由 loadActiveProfile/saveActiveProfile
// 驱动（save 时刷新），避免首页浏览/切换行为污染 listSaveSlots 的排序。
function setActiveSaveSlot(storage, id){
  try{
    if(!storage || typeof id !== 'string' || !id) return false;
    if(typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return false;
    const meta = readMeta(storage);
    if(!meta) return false;
    const entry = meta.saves.find(s => s.id === id);
    if(!entry) return false;
    meta.activeSaveId = id;
    return writeMeta(storage, meta);
  } catch(e){ return false; }
}

// 读 active 槽。无 active / 元索引缺失或损坏 / 槽数据损坏 → defaultProfile()。
// 先跑 migrateLegacySave：老玩家首次进入（只有旧单键）也能直接读到自己的进度。
function loadActiveProfile(storage){
  try{
    migrateLegacySave(storage);
    if(!storage || typeof storage.getItem !== 'function') return defaultProfile();
    const meta = readMeta(storage);
    if(!meta || !meta.activeSaveId) return defaultProfile();
    const raw = storage.getItem(slotKey(meta.activeSaveId));
    if(!raw) return defaultProfile();
    return normalizeProfile(JSON.parse(raw));
  } catch(e){ return defaultProfile(); }
}

// 写 active 槽（normalize 后落盘），并刷新该槽在元索引中的 updatedAt。
// 无 active / 元索引缺失或损坏 → false（不静默建档，交由 UI 显式 createSaveSlot）。
function saveActiveProfile(storage, profile){
  try{
    migrateLegacySave(storage);                               // 幂等：保证「只 save 未 load」路径也能接上旧档
    if(!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return false;
    const meta = readMeta(storage);
    if(!meta || !meta.activeSaveId) return false;
    const entry = meta.saves.find(s => s.id === meta.activeSaveId);
    if(!entry) return false;
    storage.setItem(slotKey(meta.activeSaveId), JSON.stringify(normalizeProfile(profile)));
    entry.updatedAt = Date.now();
    return writeMeta(storage, meta);
  } catch(e){ return false; }
}

// ---------- 向后兼容委托（签名不变，mvp 现有调用零改动获得多存档语义） ----------

function loadProfile(storage){ return loadActiveProfile(storage); }

function saveProfile(storage, profile){ return saveActiveProfile(storage, profile); }

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

// 局前购买追加复活次数（M10 扩展·特性3数据面）：按 reviveCost 扣点，bonusRevives++。
// 点数不足 / 参数坏 → false（风格对齐 canBuyUpgrade/buyUpgrade）。
function buyExtraRevive(profile){
  const cost = economyConfig().reviveCost || 40;
  if(!profile || typeof profile !== 'object') return false;
  if(!Number.isFinite(profile.points) || profile.points < cost) return false;
  profile.points -= cost;
  profile.bonusRevives = (Number.isInteger(profile.bonusRevives) && profile.bonusRevives > 0 ? profile.bonusRevives : 0) + 1;
  return true;
}

// 把已购永久升级应用到坦克（permanent scope，每级叠一层；开局调用）
// 优化：批量 push 进 tank.modifiers 并在末尾统一触发一次 refreshStats，消除频繁 structuredClone
function applyUpgrades(tank, profile){
  if(!profile || !profile.upgrades || !tank) return 0;
  let applied = 0;
  tank.modifiers = tank.modifiers || [];
  for(const id in profile.upgrades){
    const u = getUpgradeDef(id);
    if(!u) continue;
    const lv = profile.upgrades[id];
    for(let i = 0; i < lv; i++){
      tank.modifiers.push({
        stat: u.stat,
        mode: u.mode || 'add',
        value: u.value,
        source: 'upgrade:' + id,
        scope: 'permanent',
        expiresAt: Infinity
      });
      applied++;
    }
  }
  if(applied > 0 && typeof refreshStats === 'function'){
    refreshStats(tank);
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
    savesMetaKey,
    saveSlotPrefix,
    legacySaveKey,
    listSaveSlots,
    createSaveSlot,
    deleteSaveSlot,
    renameSaveSlot,
    setActiveSaveSlot,
    loadActiveProfile,
    saveActiveProfile,
    migrateLegacySave,
    loadProfile,
    saveProfile,
    killScore,
    scoreToPoints,
    upgradeLevel,
    canBuyUpgrade,
    buyExtraRevive,
    buyUpgrade,
    applyUpgrades
  };
}
