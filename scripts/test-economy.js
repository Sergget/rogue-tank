// test-economy.js — 经济与存档测试（Node 端，Pure Logic）
// 运行：node scripts/test-economy.js
// M10 扩展：多存档「元索引 + 槽位字典」（CRUD/隔离/迁移/委托往返）+ normalizeProfile 新字段
// （selectedTankId / ammoLoadout / bonusRevives）+ buyExtraRevive + 损坏数据健壮回退。
'use strict';

require('../js/tank_utils.js');
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
global.addModifier = (t, m) => { t.modifiers = t.modifiers || []; t.modifiers.push(m); return t; };
const eco = require('../js/tank_economy.js');

let fails = 0;
let total = 0;
function ok(cond, label) {
  total++;
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

// fake storage（localStorage 同形：getItem/setItem/removeItem）
function makeStore() {
  return {
    m: {},
    getItem(k){ return this.m[k]; },
    setItem(k, v){ this.m[k] = String(v); },
    removeItem(k){ delete this.m[k]; }
  };
}
function readRawMeta(store){ try { return JSON.parse(store.m['rogue-tank-saves-meta']); } catch(e){ return null; } }

// 1) 存档默认值 + 归一化
const def = eco.defaultProfile();
ok(def.version === RULES_MOD.RULES.economy.saveVersion && def.points === 0 && typeof def.upgrades === 'object', 'defaultProfile 结构');
ok(def.selectedTankId === null && Array.isArray(def.ammoLoadout) && def.ammoLoadout.length === 0 && def.bonusRevives === 0, 'defaultProfile 新字段缺省（M10）');
ok(eco.normalizeProfile(null).points === 0, 'null profile → 默认');
ok(eco.normalizeProfile({ version: 999 }).points === 0, '版本不匹配 → 默认（防脏数据）');
const p2 = eco.normalizeProfile({ version: 1, points: 100, upgrades: { pen_up: 3, bogus: 5 }, stats: { runs: 2, kills: 7 } });
ok(p2.points === 100 && p2.upgrades.pen_up === 3, '合法字段保留');
ok(p2.upgrades.bogus === undefined, '未知升级 id 剔除');
ok(p2.stats.kills === 7, '统计保留');
// v1 旧档无新字段 → 缺省填充（向后兼容，不改 saveVersion）
const legacyShape = eco.normalizeProfile({ version: 1, points: 10 });
ok(legacyShape.version === RULES_MOD.RULES.economy.saveVersion && legacyShape.selectedTankId === null &&
   Array.isArray(legacyShape.ammoLoadout) && legacyShape.ammoLoadout.length === 0 && legacyShape.bonusRevives === 0,
   'v1 旧档缺新字段 → 缺省填充（saveVersion 不动）');

// 2) 存档读写（fake storage；多存档语义下经 active 槽位委托往返）
const store = makeStore();
ok(eco.loadProfile(store).points === 0, '空存储 → 默认');
ok(eco.listSaveSlots(store).length === 0 && readRawMeta(store) === null, '空存储 → 无元索引无槽位');
// 旧单键数据在场时 loadProfile 自动迁移并读出原进度（等价覆盖原 save→load 写入侧）
const prof = { version: 1, points: 55, upgrades: { dmg_up: 2 }, stats: { runs: 1, kills: 3 } };
store.setItem('rogue-tank-save', JSON.stringify(prof));
const loaded = eco.loadProfile(store);
ok(loaded.points === 55 && loaded.upgrades.dmg_up === 2, '旧单键迁移 → load 读到原进度');
ok(loaded.ammoLoadout.length === 0 && loaded.bonusRevives === 0, '迁移档补齐新字段缺省');
let slots = eco.listSaveSlots(store);
ok(slots.length === 1 && slots[0].name === '默认存档' && typeof slots[0].id === 'string', '迁移建首槽「默认存档」');
ok(readRawMeta(store).activeSaveId === slots[0].id, '迁移后设为 activeSaveId');
ok(store.m['rogue-tank-save:' + slots[0].id] !== undefined, '槽位键 = rogue-tank-save:<id>');
ok(store.m['rogue-tank-save'] !== undefined, '迁移不删除旧单键（防中途失败丢档）');
// 委托往返：saveProfile ≡ saveActiveProfile、loadProfile ≡ loadActiveProfile
const t0 = slots[0].updatedAt;
// 确定性硬化：先回拨该槽 updatedAt（白盒写 meta），与真实时钟必然拉开差距——
// 否则两次 Date.now() 采样落入同一毫秒时，「save 刷新了时间戳」无法用严格不等号判定。
const rawMeta0 = readRawMeta(store);
rawMeta0.saves[0].updatedAt = t0 - 10000;
store.m['rogue-tank-saves-meta'] = JSON.stringify(rawMeta0);
const edited = eco.loadProfile(store);
edited.points = 77; edited.upgrades.dmg_up = 4;
ok(eco.saveProfile(store, edited) === true, 'saveProfile 委托写入 active 槽');
ok(eco.loadProfile(store).points === 77 && eco.loadActiveProfile(store).upgrades.dmg_up === 4, 'save→load 往返（委托等价）');
slots = eco.listSaveSlots(store);
ok(slots.length === 1 && slots[0].updatedAt > t0 - 10000, 'save 刷新 meta.updatedAt');

// 3) 得分转化 + 击杀得分
ok(eco.scoreToPoints(100) === 10, '100 分 → 10 点（10%）');
ok(eco.scoreToPoints(123, 0.1) === 12, '123 分 → 12 点（向下取整）');
ok(eco.killScore() === 20, '击杀得分 20');

// 4) 升级购买
const prof2 = eco.defaultProfile();
prof2.points = 100;
ok(eco.upgradeLevel(prof2, 'pen_up') === 0, '初始等级 0');
ok(eco.canBuyUpgrade(prof2, 'pen_up') === true, '点数足够可买');
ok(eco.buyUpgrade(prof2, 'pen_up') === true && prof2.points === 70, '购买扣点 30');
ok(eco.upgradeLevel(prof2, 'pen_up') === 1, '等级 +1');
ok(eco.buyUpgrade(prof2, 'bogus') === false, '未知 id 购买失败');
// 满级不可买
prof2.upgrades.pen_up = 5;
ok(eco.canBuyUpgrade(prof2, 'pen_up') === false, '满级不可买');

// 5) applyUpgrades：永久升级应用（permanent scope，每级叠一层）
const tank = { modifiers: [], stats: {}, base: {} };
const prof3 = { version: 1, points: 0, upgrades: { pen_up: 3, hp_up: 2 } };
const applied = eco.applyUpgrades(tank, prof3);
ok(applied === 5, '应用 3+2=5 层');
ok(tank.modifiers.length === 5 && tank.modifiers.every(m => m.scope === 'permanent'), 'permanent scope');
ok(tank.modifiers.filter(m => m.source === 'upgrade:pen_up').length === 3, 'pen_up 3 层');
ok(tank.modifiers.filter(m => m.source === 'upgrade:hp_up').length === 2, 'hp_up 2 层');

// 6) normalizeProfile 新字段校验（M10 特性1/特性3 数据面）
ok(eco.normalizeProfile({ version: 1, selectedTankId: 'm4a3' }).selectedTankId === 'm4a3', 'selectedTankId 合法保留');
ok(eco.normalizeProfile({ version: 1, selectedTankId: '' }).selectedTankId === null, 'selectedTankId 空串 → null');
ok(eco.normalizeProfile({ version: 1, selectedTankId: 42 }).selectedTankId === null, 'selectedTankId 非字符串 → null');
ok(eco.normalizeProfile({ version: 1, selectedTankId: {} }).selectedTankId === null, 'selectedTankId 对象 → null');
ok(JSON.stringify(eco.normalizeProfile({ version: 1, ammoLoadout: ['ap', 'bogus', 'ap', 'he', 'heat', 'apcr'] }).ammoLoadout)
   === JSON.stringify(['ap', 'he', 'heat']), 'ammoLoadout 非法剔除+去重保序+截断前 3');
ok(JSON.stringify(eco.normalizeProfile({ version: 1, ammoLoadout: ['constructor', 'ap'] }).ammoLoadout)
   === JSON.stringify(['ap']), 'ammoLoadout 原型链 key 拒绝（hasOwnProperty 守卫）');
ok(Array.isArray(eco.normalizeProfile({ version: 1, ammoLoadout: 'ap,he' }).ammoLoadout) &&
   eco.normalizeProfile({ version: 1, ammoLoadout: 'ap,he' }).ammoLoadout.length === 0, 'ammoLoadout 非数组（字符串）→ []');
ok(eco.normalizeProfile({ version: 1, ammoLoadout: { 0: 'ap' } }).ammoLoadout.length === 0, 'ammoLoadout 非数组（对象）→ []');
ok(eco.normalizeProfile({ version: 1, ammoLoadout: [null, undefined, 42] }).ammoLoadout.length === 0, 'ammoLoadout 全非法项 → []');
ok(eco.normalizeProfile({ version: 1, bonusRevives: -1 }).bonusRevives === 0, 'bonusRevives 负数 → 0');
ok(eco.normalizeProfile({ version: 1, bonusRevives: 2.5 }).bonusRevives === 0, 'bonusRevives 非整数 → 0');
ok(eco.normalizeProfile({ version: 1, bonusRevives: '3' }).bonusRevives === 0, 'bonusRevives 字符串 → 0');
ok(eco.normalizeProfile({ version: 1, bonusRevives: 4 }).bonusRevives === 4, 'bonusRevives 合法保留');

// 7) buyExtraRevive：局前购买追加复活次数（reviveCost=40）
const pr = eco.defaultProfile();
pr.points = 79;
ok(eco.buyExtraRevive(pr) === true && pr.points === 39 && pr.bonusRevives === 1, '购买扣点 reviveCost 且 bonusRevives++');
ok(eco.buyExtraRevive(pr) === false && pr.points === 39 && pr.bonusRevives === 1, '点数不足拒绝且状态不变');
const pr2 = { points: 80 };
ok(eco.buyExtraRevive(pr2) === true && pr2.points === 40 && pr2.bonusRevives === 1, 'bonusRevives 缺省从 0 起');
ok(eco.buyExtraRevive(null) === false && eco.buyExtraRevive('x') === false, '参数坏 → false');
ok(eco.buyExtraRevive({ points: NaN }) === false, 'points NaN → false');

// 8) 槽位 CRUD 全生命周期 + 两槽隔离
const s2 = makeStore();
const idA = eco.createSaveSlot(s2, '档A', { points: 100, upgrades: { pen_up: 2 }, stats: { runs: 3, kills: 9 },
                                             selectedTankId: 'tank_a', ammoLoadout: ['ap', 'heat'], bonusRevives: 2 });
ok(typeof idA === 'string' && idA.length > 0, 'createSaveSlot 返回 slotId');
ok(eco.listSaveSlots(s2).length === 1 && eco.listSaveSlots(s2)[0].id === idA, '创建后列表含该槽');
const profA = eco.loadActiveProfile(s2);
ok(profA.points === 100 && eco.upgradeLevel(profA, 'pen_up') === 2 && profA.stats.runs === 3,
   'initialData 与 defaultProfile 合并入槽');
ok(profA.selectedTankId === 'tank_a' && JSON.stringify(profA.ammoLoadout) === JSON.stringify(['ap', 'heat']) && profA.bonusRevives === 2,
   'initialData 新字段落槽（normalize 后）');
const idB = eco.createSaveSlot(s2, '档B', { points: 7 });
ok(typeof idB === 'string' && idB !== idA, '同毫秒连续创建 id 唯一（时间戳+计数器+随机）');
ok(eco.loadActiveProfile(s2).points === 7, 'create 后 active 切到新槽');
// 显式切回 A（「选择进入」API），验证 B 的写入未污染 A
ok(eco.setActiveSaveSlot(s2, idA) === true, 'setActiveSaveSlot 切回 A');
const backToA = eco.loadActiveProfile(s2);
ok(backToA.points === 100 && eco.upgradeLevel(backToA, 'pen_up') === 2 &&
   backToA.selectedTankId === 'tank_a' && JSON.stringify(backToA.ammoLoadout) === JSON.stringify(['ap', 'heat']) &&
   backToA.bonusRevives === 2, '两槽隔离：A 的 points/upgrades/ammoLoadout/bonusRevives 不受 B 影响');

// 9) updatedAt 排序 / rename 边界
{
  const s3 = makeStore();
  const a = eco.createSaveSlot(s3, '旧档', { points: 1 });
  const b = eco.createSaveSlot(s3, '新档', { points: 2 });
  const c = eco.createSaveSlot(s3, '中档', { points: 3 });
  const m = readRawMeta(s3);
  const byId = {}; for (const e of m.saves) byId[e.id] = e;
  byId[a].updatedAt = 1000; byId[b].updatedAt = 9000; byId[c].updatedAt = 5000;
  s3.m['rogue-tank-saves-meta'] = JSON.stringify(m);
  const order = eco.listSaveSlots(s3).map(e => e.id);
  ok(JSON.stringify(order) === JSON.stringify([b, c, a]), 'listSaveSlots 按 updatedAt 降序');
  const beforeTs = byId[a].updatedAt;
  ok(eco.renameSaveSlot(s3, a, '改名档') === true, 'rename 成功 true');
  ok(eco.listSaveSlots(s3).find(e => e.id === a).name === '改名档', 'rename 仅改 name');
  ok(eco.listSaveSlots(s3).find(e => e.id === a).updatedAt === beforeTs, 'rename 不动 updatedAt');
  ok(eco.renameSaveSlot(s3, 'no-such-id', 'X') === false, 'rename 不存在 id → false');
  ok(eco.renameSaveSlot(s3, a, '') === false && eco.renameSaveSlot(s3, a, '   ') === false, 'rename 空白名 → false');
  ok(eco.renameSaveSlot(s3, a, null) === false, 'rename 非字符串名 → false');
}

// 10) delete 边界：删 active 迁移 / 删光 → null / 删不存在 → false
{
  const s4 = makeStore();
  const d = eco.createSaveSlot(s4, 'D', { points: 11 });
  const e = eco.createSaveSlot(s4, 'E', { points: 22 });
  ok(eco.deleteSaveSlot(s4, 'no-such-id') === false, '删不存在 id → false');
  // 先删非 active 的 D：active 仍是 E
  ok(eco.deleteSaveSlot(s4, d) === true && eco.loadActiveProfile(s4).points === 22, '删非 active → active 不变');
  ok(s4.m['rogue-tank-save:' + d] === undefined, '被删槽的槽位键已移除');
  // 再删 active 的 E：唯一剩余已空 → null
  ok(eco.deleteSaveSlot(s4, e) === true, '删 active 成功');
  ok(readRawMeta(s4).activeSaveId === null && eco.listSaveSlots(s4).length === 0, '删光 → activeSaveId null');
  ok(eco.loadActiveProfile(s4).points === 0 && eco.loadActiveProfile(s4).version === RULES_MOD.RULES.economy.saveVersion,
     '删光后 loadActiveProfile → 默认 profile');
  ok(eco.saveActiveProfile(s4, { version: 1, points: 5 }) === false, '无 active 时 saveActiveProfile → false');

  // 删 active 且有剩余 → 迁到 updatedAt 最大者
  const s5 = makeStore();
  const f = eco.createSaveSlot(s5, 'F', { points: 111 });
  const g = eco.createSaveSlot(s5, 'G', { points: 222 });
  const h = eco.createSaveSlot(s5, 'H', { points: 333 });
  const m5 = readRawMeta(s5); const byId5 = {};
  for (const en of m5.saves) byId5[en.id] = en;
  byId5[f].updatedAt = 3000; byId5[g].updatedAt = 8000; byId5[h].updatedAt = 1000;
  s5.m['rogue-tank-saves-meta'] = JSON.stringify(m5);
  ok(eco.deleteSaveSlot(s5, h) === true, '删除 active（H）');
  ok(readRawMeta(s5).activeSaveId === g && eco.loadActiveProfile(s5).points === 222,
     '删 active → 迁到剩余中 updatedAt 最大者（G）');
}

// 11) migrateLegacySave 细化
{
  // 无旧档 → no-op
  const m1 = makeStore();
  ok(eco.migrateLegacySave(m1) === false && eco.listSaveSlots(m1).length === 0, '无旧档 → 迁移 no-op');
  // 合法旧档 → true；幂等第二次 false；同槽不重复
  const m2 = makeStore();
  m2.setItem('rogue-tank-save', JSON.stringify({ version: 1, points: 66, upgrades: { hp_up: 1 } }));
  ok(eco.migrateLegacySave(m2) === true, '合法旧档 → 迁移执行');
  const firstList = eco.listSaveSlots(m2);
  const firstId = firstList[0].id;
  ok(firstList.length === 1 && firstList[0].name === '默认存档' && eco.loadActiveProfile(m2).points === 66,
     '迁移槽名「默认存档」且设 active');
  ok(eco.migrateLegacySave(m2) === false && eco.listSaveSlots(m2).length === 1 &&
     eco.listSaveSlots(m2)[0].id === firstId, '元索引已存在 → 幂等 no-op');
  // 元索引存在 + 旧键在场 → 不动（不重复导入）
  const m5b = makeStore();
  const pre = eco.createSaveSlot(m5b, '已有档', { points: 5 });
  m5b.setItem('rogue-tank-save', JSON.stringify({ version: 1, points: 999 }));
  ok(eco.migrateLegacySave(m5b) === false, 'meta 已存在 → 迁移 no-op false');
  ok(eco.listSaveSlots(m5b).length === 1 && eco.listSaveSlots(m5b)[0].id === pre &&
     eco.loadActiveProfile(m5b).points === 5, 'meta 已存在 + 旧键在场 → 不导入不动 active');
  // 损坏旧档 / 版本不符 / 非对象 → 不建垃圾槽
  const m3 = makeStore();
  m3.setItem('rogue-tank-save', '{bad json');
  ok(eco.migrateLegacySave(m3) === false && eco.listSaveSlots(m3).length === 0, '损坏旧档 JSON → 不迁移');
  const m4 = makeStore();
  m4.setItem('rogue-tank-save', JSON.stringify({ version: 99, points: 50 }));
  ok(eco.migrateLegacySave(m4) === false && eco.listSaveSlots(m4).length === 0, '版本不符旧档 → 不迁移');
  const m6 = makeStore();
  m6.setItem('rogue-tank-save', '"just-a-string"');
  ok(eco.migrateLegacySave(m6) === false && eco.listSaveSlots(m6).length === 0, '旧档非对象 → 不迁移');
  // 元索引损坏 + 合法旧档在场 → 视为缺失并恢复
  const m7 = makeStore();
  m7.setItem('rogue-tank-save', JSON.stringify({ version: 1, points: 123 }));
  m7.setItem('rogue-tank-saves-meta', '{corrupt');
  ok(eco.migrateLegacySave(m7) === true && eco.listSaveSlots(m7).length === 1 &&
     eco.loadActiveProfile(m7).points === 123, '元索引损坏 → 从旧键恢复迁移');
}

// 12) 损坏数据健壮回退 + storage 守卫
{
  // 元索引 JSON 损坏：列表空 / load 默认 / save 拒绝 / create 就地重建
  const c1 = makeStore();
  c1.setItem('rogue-tank-saves-meta', '{{{bad');
  ok(eco.listSaveSlots(c1).length === 0, '元索引损坏 → listSaveSlots []');
  ok(eco.loadActiveProfile(c1).points === 0, '元索引损坏 → loadActiveProfile 默认');
  ok(eco.saveActiveProfile(c1, { version: 1, points: 9 }) === false, '元索引损坏 → saveActiveProfile false');
  const rebuilt = eco.createSaveSlot(c1, '重建档', { points: 12 });
  ok(typeof rebuilt === 'string' && rebuilt.length > 0 && eco.loadActiveProfile(c1).points === 12,
     'createSaveSlot 对损坏元索引就地重建');
  // 槽位 JSON 损坏 → 默认 profile
  const c2 = makeStore();
  const sid = eco.createSaveSlot(c2, '坏槽数据');
  c2.m['rogue-tank-save:' + sid] = 'not-json{';
  ok(eco.loadActiveProfile(c2).points === 0, '槽位数据损坏 → loadActiveProfile 默认');
  // 最小 fake storage（无 removeItem）：删除走 setItem('') 回退，读取端视为缺失
  const mini = { m: {}, getItem(k){ return this.m[k]; }, setItem(k, v){ this.m[k] = String(v); } };
  const mid = eco.createSaveSlot(mini, '迷你档', { points: 31 });
  ok(typeof mid === 'string' && eco.loadActiveProfile(mini).points === 31, '无 removeItem 的 storage 可正常读写');
  ok(eco.deleteSaveSlot(mini, mid) === true && !mini.getItem('rogue-tank-save:' + mid),
     '删除回退写空串 → 读取端视为缺失');
  ok(eco.loadActiveProfile(mini).points === 0, '回退删除后 active 槽读默认');
  // null / 缺方法 storage 守卫
  ok(eco.loadProfile(null).points === 0 && eco.saveProfile(null, {}) === false, 'null storage 守卫（load/save）');
  ok(JSON.stringify(eco.listSaveSlots(null)) === '[]' && eco.createSaveSlot(null, 'x') === null, 'null storage 守卫（list/create）');
  ok(eco.deleteSaveSlot(null, 'x') === false && eco.renameSaveSlot(null, 'x', 'y') === false, 'null storage 守卫（delete/rename）');
  ok(eco.migrateLegacySave(null) === false, 'null storage 守卫（migrate）');
  ok(eco.loadProfile({}).points === 0 && eco.saveProfile({}, {}) === false, '缺 getItem/setItem 守卫');
}

// 13) setActiveSaveSlot：显式切换 active（「选择进入」；不 touch updatedAt）
{
  const sa = makeStore();
  const x = eco.createSaveSlot(sa, 'X档', { points: 10 });
  const y = eco.createSaveSlot(sa, 'Y档', { points: 20 });
  ok(eco.loadActiveProfile(sa).points === 20, '初始 active 为最新创建的 Y');
  // 合法切换 → true 且 loadActiveProfile 读到新槽数据
  ok(eco.setActiveSaveSlot(sa, x) === true && eco.loadActiveProfile(sa).points === 10, '合法切换 → loadActive 读到新槽');
  ok(eco.setActiveSaveSlot(sa, y) === true && eco.loadActiveProfile(sa).points === 20, '切回 Y 同样生效');
  // 纯选择动作不 touch updatedAt（最后游玩时间只由 load/save 驱动，排序不被浏览行为污染）
  const metaBefore = readRawMeta(sa);
  const tsX = metaBefore.saves.find(e => e.id === x).updatedAt;
  const tsY = metaBefore.saves.find(e => e.id === y).updatedAt;
  ok(eco.setActiveSaveSlot(sa, x) === true, '再次切换 X');
  const metaAfter = readRawMeta(sa);
  ok(metaAfter.activeSaveId === x &&
     metaAfter.saves.find(e => e.id === x).updatedAt === tsX &&
     metaAfter.saves.find(e => e.id === y).updatedAt === tsY,
     '切换不改任何槽的 updatedAt');
  // 切换后 saveActiveProfile 落到新槽且 updatedAt 更新。
  // 确定性硬化：先把 X 槽 updatedAt 人为回拨（白盒写 meta），与真实时钟必然拉开差距，
  // 严格 > 才能区分「确实刷新」与「从未写入」（同毫秒采样下 > 会随机判假，约同毫秒概率即失败率）。
  // 注：回拨须在上方「切换不改 updatedAt」相等断言之后、且在 loadActiveProfile 之前（load 不动时间戳）。
  const metaRewind = readRawMeta(sa);
  const rewound = tsX - 10000;
  metaRewind.saves.find(e => e.id === x).updatedAt = rewound;
  sa.m['rogue-tank-saves-meta'] = JSON.stringify(metaRewind);
  const profX = eco.loadActiveProfile(sa);
  profX.points = 33;
  ok(eco.saveActiveProfile(sa, profX) === true, '切换后 save 写入成功');
  const metaSaved = readRawMeta(sa);
  ok(metaSaved.activeSaveId === x && eco.loadActiveProfile(sa).points === 33, 'save 落在刚切换的槽 X');
  ok(metaSaved.saves.find(e => e.id === x).updatedAt > rewound, 'save 刷新该槽 updatedAt');
  // 边界与守卫
  ok(eco.setActiveSaveSlot(sa, 'no-such-id') === false, '不存在 id → false');
  ok(readRawMeta(sa).activeSaveId === x, '失败切换不动 activeSaveId');
  ok(eco.setActiveSaveSlot(sa, '') === false && eco.setActiveSaveSlot(sa, null) === false &&
     eco.setActiveSaveSlot(sa, 42) === false, '空/非字符串 id → false');
  ok(eco.setActiveSaveSlot(sa, x) === true, '重复切换同一 id 幂等 true');
  const corrupt = makeStore();
  corrupt.setItem('rogue-tank-saves-meta', '{corrupt');
  ok(eco.setActiveSaveSlot(corrupt, 'x') === false, 'meta 损坏 → false');
  ok(eco.setActiveSaveSlot(null, 'x') === false && eco.setActiveSaveSlot({}, 'x') === false,
     'storage 缺失/缺方法 → false');
}

// ---------- P-34：difficultyLevel 归一化 + settleRun 终局结算 ----------
{
  // 归一化守卫
  const d0 = eco.normalizeProfile({ version: 1, points: 5 });
  ok(d0.difficultyLevel === 0, '旧档缺 difficultyLevel → 缺省 0（向后兼容）');
  const d1 = eco.normalizeProfile({ version: 1, points: 5, difficultyLevel: 7 });
  ok(d1.difficultyLevel === 7, '合法 difficultyLevel 保留');
  const d2 = eco.normalizeProfile({ version: 1, points: 5, difficultyLevel: -3 });
  ok(d2.difficultyLevel === 0, '负数 difficultyLevel → 0');
  const d3 = eco.normalizeProfile({ version: 1, points: 5, difficultyLevel: 2.5 });
  ok(d3.difficultyLevel === 0, '非整数 difficultyLevel → 0');

  // settleRun：得分×10% 转点 + 难度等级 +1
  const sp = { version: 1, points: 100, difficultyLevel: 3 };
  const r = eco.settleRun(sp, 250);
  ok(r.pointsGained === 25 && sp.points === 125, `settleRun 转点 250×10%=25（实际 +${r.pointsGained}，points=${sp.points}）`);
  ok(r.difficultyLevel === 4 && sp.difficultyLevel === 4, 'settleRun 难度等级 +1（3→4）');
  const sp0 = { version: 1, points: 0 };
  const r0 = eco.settleRun(sp0, 0);
  ok(r0.pointsGained === 0 && r0.difficultyLevel === 1 && sp0.difficultyLevel === 1, '零分结算仍提升难度等级；缺省 level 从 0 起');
  const rn = eco.settleRun(sp0, 19);
  ok(rn.pointsGained === 1, '19 分 → floor(1.9)=1（向下取整）');
  ok(eco.settleRun(null, 100) === null, 'profile 缺失 → null（防御）');
  // 幂等说明：settleRun 本身不判重——同一局重复调用会重复加分/升级；
  // 幂等护栏由 mvp 调用方的 payload.settled 标记保证（transition payload 每次转移重建，天然隔离不同局）。
}

// ---------- P-41：局内商店（RUN_SHOP_DEFS 结构 / 定价曲线 / 账本购买 API） ----------
{
  // stats 键集合对照：computeStats 产物键（armor 路径单独放行）
  const model = require('../js/tank_model.js');
  const baseStats = model.computeStats(
    { penetration: 100, damage: 30, reload: 2, shellSpeed: 800, maxSpeed: 120,
      turnRate: 2, turretTurnRate: 2, maxHp: 100, weight: 300, enginePower: 900,
      armor: { hull: { front: 50 }, turret: { front: 60 } } }, []);
  const validStats = new Set(Object.keys(baseStats));

  ok(eco.RUN_SHOP_DEFS.length >= 5 && eco.RUN_SHOP_DEFS.length <= 6, `RUN_SHOP_DEFS 数量 5~6（实际 ${eco.RUN_SHOP_DEFS.length}）`);
  const ids = new Set();
  let structOk = true;
  for (const d of eco.RUN_SHOP_DEFS) {
    if (!d.id || ids.has(d.id)) structOk = false;
    ids.add(d.id);
    for (const k of ['name', 'desc', 'baseCost', 'costGrowth', 'maxLevel']) {
      if (!(k in d)) structOk = false;
    }
    if (!(typeof d.baseCost === 'number' && d.baseCost > 0 && typeof d.costGrowth === 'number' && d.maxLevel >= 1)) structOk = false;
    if (!Array.isArray(d.effects) && !d.instant) structOk = false;   // 属性类或即时类二选一
    for (const ef of (d.effects || [])) {
      if (ef.stat.startsWith('armor')) { /* armor 路径白名单 */ }
      else if (!validStats.has(ef.stat)) structOk = false;
      if (ef.mode !== 'add' && ef.mode !== 'mult') structOk = false;
    }
  }
  ok(structOk, 'RUN_SHOP_DEFS 结构校验（字段完备/id 唯一/effects stat 合法对照 computeStats 键集合）');

  // 定价曲线 runShopPriceFor
  const fr = eco.getRunShopDef('fast_reload');
  ok(fr && eco.runShopPriceFor(fr, 0) === fr.baseCost, `runShopPriceFor(lv0)=baseCost=${fr.baseCost}`);
  ok(eco.runShopPriceFor(fr, 2) === Math.round(fr.baseCost * Math.pow(fr.costGrowth, 2)), `runShopPriceFor(lv2)=round(${fr.baseCost}×${fr.costGrowth}²)=${eco.runShopPriceFor(fr, 2)}`);

  // 购买 API 三分支
  const st = { total: 300, spent: 0, levels: {} };
  ok(eco.applyRunShopPurchase(st, 'fast_reload') === true && st.spent === fr.baseCost && st.levels.fast_reload === 1, '购买成功：spent += price、levels +1');
  ok(eco.applyRunShopPurchase(st, 'fast_reload') === true && st.spent === fr.baseCost + eco.runShopPriceFor(fr, 1), '二级购买成功：costGrowth 递增计价');
  const stPoor = { total: 10, spent: 0, levels: {} };
  ok(eco.applyRunShopPurchase(stPoor, 'engine_overdrive') === false && stPoor.spent === 0, '余额不足 → false 且不改动账本');
  const stMax = { total: 999999, spent: 0, levels: { steady_mount: 1 } };
  ok(eco.applyRunShopPurchase(stMax, 'steady_mount') === false, '超 maxLevel → false');
  ok(eco.canAfford(50, 50) && !eco.canAfford(49, 50), 'canAfford 边界（=通过 / <拒绝）');

  // 即时效果类商品形态：effects 空 + instant healPct
  const rep = eco.getRunShopDef('emergency_repair');
  ok(rep && rep.effects.length === 0 && rep.instant && rep.instant.type === 'healPct', '紧急维修为即时类（effects 空 + instant.healPct）');
}

console.log(`test-economy: 共 ${total} 条断言`);
console.log('test-economy: 完成所有检查');
if (fails === 0) console.log(`test-economy: 全部通过（${total}/${total}）`);
else console.error(`test-economy: ${fails} 项失败（共 ${total} 条）`);
process.exit(fails === 0 ? 0 : 1);
