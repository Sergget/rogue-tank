// test-boss.js — Boss 系统测试（Node 端，Pure Logic）
// 运行：node scripts/test-boss.js
'use strict';

const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;

// 运行时函数（makeBossEntity/applyBossStage/updateBossStage）引用全局 addModifier/removeModifierBySource
global.addModifier = (t, m) => { t.modifiers = t.modifiers || []; t.modifiers.push(m); return t; };
global.removeModifierBySource = (t, s) => { t.modifiers = (t.modifiers || []).filter(m => m.source !== s); };
// #91 行为消费引用的全局：applyDamage / callStrike（可注入计数桩）
let dmgCalls = [];
global.applyDamage = (target, amount) => {
  dmgCalls.push({ target, amount });
  if (target && target.hp !== undefined) target.hp = Math.max(0, target.hp - amount);
};
let strikeCalls = [];
global.callStrike = (x, y, opts) => {
  strikeCalls.push({ x, y, opts });
  return [{ x, y, delay: opts.delay, radius: opts.radius }]; // fake 落弹记录
};

const {
  BOSS_WEAKSPOT_KEYS,
  validateBoss,
  validateBossStage,
  validateBossBehavior,
  BOSS_BEHAVIOR_STYLES,
  bossStageFor,
  bossStageIndex,
  bossInStage,
  makeBossEntity,
  applyBossStage,
  updateBossStage,
  updateBossBehavior,
  bossCurrentStage,
  isWeakspotHit
} = require('../js/tank_boss.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}

const boss = {
  id: 'b1', name: 'B',
  stages: [
    { id: 'p1', hpFrom: 1.0, hpTo: 0.6, weakspots: ['ammo'] },
    { id: 'p2', hpFrom: 0.6, hpTo: 0.2, weakspots: ['engine'] },
    { id: 'p3', hpFrom: 0.2, hpTo: 0.0, weakspots: [] }
  ],
  loot: { score: 500, cardRarity: 'legendary', cards: 3 }
};

// 1) 合法 boss
ok(validateBoss(boss).length === 0, '合法 boss 无错误');

// 2) 阶段判定
ok(bossStageFor(boss, 1.0).id === 'p1', '满血 → p1');
ok(bossStageFor(boss, 0.6).id === 'p2', '0.6 → p2（边界归下段）');
ok(bossStageFor(boss, 0.2).id === 'p3', '0.2 → p3');
ok(bossStageFor(boss, 0.0).id === 'p3', '0 → p3');
ok(bossStageFor(boss, 0.99).id === 'p1', '0.99 → p1');
ok(bossStageIndex(boss, 0.5) === 1, '索引正确');
ok(bossInStage(boss, 0.3, 'p2') === true && bossInStage(boss, 0.3, 'p3') === false, 'bossInStage 正确');

// 3) 校验：非法阶段
ok(validateBossStage({ id: 'x', hpFrom: 0.5, hpTo: 0.5 }, 0).length > 0, 'hpFrom 不大于 hpTo 报错');
ok(validateBossStage({ id: 'x', hpFrom: 1.5, hpTo: 0.5 }, 0).length > 0, '阈值越界报错');
ok(validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, weakspots: ['nope'] }, 0).length > 0, '非法 weakspot 报错');

// 4) 校验：阶段不连续 / 首末阈值
const bad1 = { id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 0.9, hpTo: 0.4 }, { id: 'p2', hpFrom: 0.4, hpTo: 0.0 }] };
ok(validateBoss(bad1).length > 0, '首阶段 hpFrom ≠ 1 报错');
const bad2 = { id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0.5 }, { id: 'p2', hpFrom: 0.6, hpTo: 0.0 }] };
ok(validateBoss(bad2).some(e => e.includes('不衔接')), '阶段阈值不衔接报错');
const bad3 = { id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0.4 }] };
ok(validateBoss(bad3).length > 0, '末阶段 hpTo ≠ 0 报错');

// 5) loot 校验
ok(validateBoss({ id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }], loot: { cardRarity: 'mythic' } }).length > 0, '非法 loot.cardRarity 报错');

// 6) 枚举
ok(BOSS_WEAKSPOT_KEYS.includes('track') && BOSS_WEAKSPOT_KEYS.includes('ammo'), '弱点枚举含履带/弹药架');

// 7) 运行时：makeBossEntity + 阶段切换（fake env + addModifier shim）
const bossDef = {
  id: 'b1', name: 'B', tankId: 'dummy', scale: 1.8,
  stages: [
    { id: 'p1', hpFrom: 1.0, hpTo: 0.6, ai: { mode: 'hold', params: { anchorRange: 300 } }, onEnter: { modifiers: [{ stat: 'armor.hull.front', mode: 'add', value: 80 }] } },
    { id: 'p2', hpFrom: 0.6, hpTo: 0.2, ai: { mode: 'charge' }, onEnter: { modifiers: [{ stat: 'turnRate', mode: 'mult', value: 2 }] } },
    { id: 'p3', hpFrom: 0.2, hpTo: 0.0, onEnter: { modifiers: [] } }
  ],
  loot: { score: 500, cardRarity: 'legendary', cards: 3 }
};
let spawnCount = 0;
const env = {
  spawnTank(spec) { spawnCount++; return Object.assign({ id: spec.id, team: spec.team, x: spec.x, y: spec.y, hullAngle: spec.hullAngle, modifiers: [], hp: 1000, maxHp: 1000, stats: { maxHp: 1000 } }, spec); },
  configureTank() {}
};
const bossEntity = makeBossEntity(bossDef, env);
ok(spawnCount === 1 && bossEntity.isBoss === true && bossEntity.boss === bossDef, 'makeBossEntity 生成带元数据实体');
ok(bossEntity.stageId === 'p1'
   && bossEntity.modifiers.some(m => m.value === 80 && m.source === 'boss-stage:p1')
   && bossEntity.modifiers.filter(m => m.source === 'boss-base').length === 8,
   '首阶段 modifiers 已应用（含 8 项 boss tuning，#91 含 penMul）');
// #91 penMul：RULES.boss.tuning.penMul 缺省 fallback 1.4（tank-model 未落地时）
const penMods = bossEntity.modifiers.filter(m => m.stat === 'penetration' && m.source === 'boss-base');
ok(penMods.length === 1 && penMods[0].mode === 'mult' && penMods[0].value === 1.4 && penMods[0].scope === 'run',
   '#91 penetration mult boss-base 应用（fallback 1.4）');
ok(bossEntity.hp === 1000 && bossEntity.maxHp === 1000, 'boss 满血出生（stats.maxHp）');

// 阶段切换：hp 降到 0.6 以下 → p2，旧 p1 modifier 移除、新 p2 modifier 叠加
bossEntity.hp = 500;  // ratio 0.5
const r = updateBossStage(bossEntity);
ok(r.changed === true && r.from === 'p1' && r.to === 'p2', '跨阶段触发（p1→p2）');
ok(bossEntity.stageId === 'p2'
   && bossEntity.modifiers.some(m => m.stat === 'turnRate' && m.source === 'boss-stage:p2')
   && !bossEntity.modifiers.some(m => m.source === 'boss-stage:p1')
   && bossEntity.modifiers.filter(m => m.source === 'boss-base').length === 8,
   '旧阶段 modifier 已移除、新阶段已叠加（tuning 保留）');
// 同阶段不重复触发
const r2 = updateBossStage(bossEntity);
ok(r2.changed === false, '同阶段不重复触发');
// 末阶段
bossEntity.hp = 100;  // ratio 0.1
const r3 = updateBossStage(bossEntity);
ok(r3.to === 'p3'
   && !bossEntity.modifiers.some(m => m.source && m.source.startsWith('boss-stage:'))
   && bossEntity.modifiers.filter(m => m.source === 'boss-base').length === 8,
   '末阶段 阶段 modifiers 清空，仅保留 boss tuning');

// 8) 阶段 AI 字段校验（P-51）
ok(validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, ai: { mode: 'skirmish', params: { keepDist: 800 } } }, 0).length === 0, '合法 ai 通过');
ok(validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5 }, 0).length === 0, '缺 ai 仍合法（向后兼容）');
const badMode = validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, ai: { mode: 'rush' } }, 0);
ok(badMode.some(e => e.includes('ai.mode 非法 rush')), '非法 ai.mode 报错');
const badParams = validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, ai: { mode: 'charge', params: [1, 2] } }, 0);
ok(badParams.some(e => e.includes('ai.params 应为对象')), 'params 非对象报错');
ok(validateBossStage({ id: 'x', hpFrom: 1, hpTo: 0.5, ai: 'charge' }, 0).length > 0, 'ai 非对象报错');

// 9) stageAI：makeBossEntity 后为首阶段 ai；跨阶段切换后跟随更新（无 ai 阶段 → null）
const aiEnt = makeBossEntity(bossDef, env);
ok(aiEnt.stageAI === bossDef.stages[0].ai, 'makeBossEntity 后 stageAI 为首阶段 ai');
bossEntity.hp = 500;  // ratio 0.5 → p2
updateBossStage(bossEntity);
ok(bossEntity.stageAI === bossDef.stages[1].ai && bossEntity.stageAI.mode === 'charge', '阶段切换后 stageAI 更新');
bossEntity.hp = 100;  // ratio 0.1 → p3（无 ai）
updateBossStage(bossEntity);
ok(bossEntity.stageAI === null, '无 ai 阶段 → stageAI null');

// 10) bossCurrentStage / isWeakspotHit
ok(bossCurrentStage({}) === null && bossCurrentStage(null) === null, '非 Boss/无数据 → bossCurrentStage null');
const we = { boss: boss, hp: 900, maxHp: 1000 };  // ratio 0.9 → p1（weakspots ammo）
ok(bossCurrentStage(we) === boss.stages[0], 'bossCurrentStage 返回当前阶段对象');
ok(isWeakspotHit(we, 'ammo') === true, '命中当前阶段弱点 → true');
ok(isWeakspotHit(we, 'track') === false, '非弱点模块 → false');
ok(isWeakspotHit({}, 'ammo') === false && isWeakspotHit(null, 'ammo') === false, '非 Boss 实体 → false');
we.hp = 500;  // ratio 0.5 → p2（weakspots engine）
ok(isWeakspotHit(we, 'engine') === true && isWeakspotHit(we, 'ammo') === false, '阶段切换后弱点跟随更新');
ok(isWeakspotHit({ boss: boss, hp: 100, maxHp: 0 }, 'engine') === false, 'maxHp=0 除零防护不抛错且返回 false');

// 11) #91 behavior 校验
ok(BOSS_BEHAVIOR_STYLES.includes('crush') && BOSS_BEHAVIOR_STYLES.includes('skirmish_long'), '#91 行为风格枚举完整');
ok(validateBossBehavior({ style: 'command', barrage: { shots: 3, delay: 3.5, interval: 9, radius: 110, dmgMult: 0.8 } }).length === 0,
   '#91 合法 behavior（command+barrage）通过');
ok(validateBossBehavior({ style: 'weave', chargeInterval: 7, chargeSpeed: 1.6 }).length === 0, '#91 合法 behavior（weave）通过');
ok(validateBossBehavior({ style: 'fortify' }).length === 0 && validateBossBehavior({ style: 'skirmish_long' }).length === 0, '#91 纯 style behavior 通过');
const bb1 = validateBoss({ id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }], behavior: { style: 'dance' } });
ok(bb1.some(e => e.includes('behavior.style 非法 dance')), '#91 非法 style 报错');
const bb2 = validateBossBehavior({ style: 'command', barrage: { shots: 0 } });
ok(bb2.some(e => e.includes('barrage.shots 应为正整数')), '#91 barrage.shots 非法报错');
const bb3 = validateBossBehavior({ style: 'crush', contact: { dmg: -5 } });
ok(bb3.some(e => e.includes('contact.dmg 应为非负数')), '#91 contact.dmg 负数报错');
const bb4 = validateBossBehavior({ style: 'weave', chargeSpeed: 'fast' });
ok(bb4.some(e => e.includes('chargeSpeed 应为正数')), '#91 chargeSpeed 非数值报错');
ok(validateBossBehavior('weave').some(e => e.includes('应为对象')), '#91 behavior 非对象报错');
// tuning.penMul 白名单放行
ok(validateBoss({ id: 'x', name: 'X', stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }], tuning: { penMul: 1.2 } }).length === 0,
   '#91 tuning.penMul 白名单放行');

// 12) #91 behavior 存取：makeBossEntity 把顶层 behavior 存到 t.bossStyle / t.bossBehavior + 计时器初始化
const mkEnv = () => ({
  spawnTank(spec) { return Object.assign({ modifiers: [], hp: 1000, maxHp: 1000, stats: { maxHp: 1000 }, hullLen: 128 }, spec); },
  configureTank() {}
});
const behBossDef = {
  id: 'bc', name: 'C', tankId: 'dummy',
  behavior: { style: 'command', barrage: { shots: 3, delay: 3.5, interval: 9, radius: 110, dmgMult: 0.8 },
              extraIgnored: true },
  stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }],
  loot: {}
};
const behEnt = makeBossEntity(behBossDef, mkEnv());
ok(behEnt.bossStyle === 'command' && behEnt.bossBehavior === behBossDef.behavior, '#91 makeBossEntity 存 bossStyle/bossBehavior');
ok(behEnt.barrageCdT === 9 && behEnt.contactCdT === 0 && behEnt.chargeTimerT === 0, '#91 行为计时器初始化（首轮炮击延迟=interval）');
// 无 behavior 的 boss 不设置行为字段
const plainEnt = makeBossEntity(bossDef, mkEnv());
ok(plainEnt.bossStyle === undefined && plainEnt.bossBehavior === undefined, '#91 无 behavior 时行为字段不设置');
// per-boss tuning.penMul 覆盖 fallback
const penEnt = makeBossEntity(Object.assign({}, bossDef, { tuning: Object.assign({}, bossDef.tuning, { penMul: 2 }) }), mkEnv());
ok(penEnt.modifiers.some(m => m.stat === 'penetration' && m.value === 2 && m.source === 'boss-base'),
   '#91 per-boss tuning.penMul 覆盖缺省');

// 13) #91 updateBossBehavior：crush 碾压接触（伤害走 applyDamage + 击退 + 边界钳制 + cd 冷却）
const crushDef = {
  id: 'bsf', name: 'S', tankId: 'dummy',
  behavior: { style: 'crush', contact: { dmg: 120, knockback: 260, cd: 1.5 } },
  stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }]
};
dmgCalls = [];
const crushEnt = makeBossEntity(crushDef, mkEnv());
crushEnt.x = 0; crushEnt.y = 0;
const player = { hp: 500, maxHp: 500, x: 100, y: 0, hullLen: 64 }; // dist=100 < radSum≈76.8? no…
// hullLen 128+64 → radSum=(128+64)/2*0.8=76.8；dist 100 未接触 → 先验证不触发
let evs = updateBossBehavior(crushEnt, 0.016, player);
ok(evs.length === 0 && dmgCalls.length === 0, '#91 crush 距离外不触发接触');
player.x = 60; // dist=60 < 76.8 → 接触
evs = updateBossBehavior(crushEnt, 0.016, player);   // 无 bounds → 不钳制
ok(evs.length === 1 && evs[0].type === 'contact' && evs[0].dmg === 120, '#91 crush 接触产生 contact 事件');
ok(dmgCalls.length === 1 && dmgCalls[0].target === player && dmgCalls[0].amount === 120, '#91 crush 伤害经 applyDamage 路径');
ok(player.hp === 380, '#91 crush 伤害扣减玩家 hp（500-120）');
ok(Math.abs(player.x - 320) < 0.001 && player.y === 0, '#91 crush 击退沿撞击方向推 knockback px');
// maxX=200 钳制：再撞一次应被夹回
crushEnt.contactCdT = 0; player.hp = 500; dmgCalls = [];
player.x = 70; // 重新贴近
evs = updateBossBehavior(crushEnt, 0.016, player, { bounds: { minX: -1000, maxX: 200, minY: -1000, maxY: 1000 } });
ok(player.x <= 200, '#91 击退受世界边界钳制');
// cd 内不重复触发
dmgCalls = [];
evs = updateBossBehavior(crushEnt, 0.1, player);
ok(evs.length === 0 && dmgCalls.length === 0, '#91 crush 冷却期内不重复触发');

// 14) #91 updateBossBehavior：weave 周期冲刺（timed modifier + 到期回收）+ 缺省碾压参数
const weaveDef = {
  id: 'btt', name: 'W', tankId: 'dummy',
  behavior: { style: 'weave', chargeInterval: 7, chargeSpeed: 1.6 },
  stages: [{ id: 'p1', hpFrom: 1, hpTo: 0 }]
};
const weaveEnt = makeBossEntity(weaveDef, mkEnv());
weaveEnt.x = 0; weaveEnt.y = 0;
const wp = { hp: 900, maxHp: 900, x: 50, y: 0, hullLen: 64 };
evs = updateBossBehavior(weaveDef ? weaveEnt : null, 7.1, wp);
const chargeEv = evs.find(e => e.type === 'chargeStart');
ok(!!chargeEv && chargeEv.speedMul === 1.6 && Math.abs(chargeEv.durationSec - 1.2) < 0.001, '#91 weave 冲刺间隔到点触发 chargeStart');
ok(weaveEnt.modifiers.some(m => m.stat === 'maxSpeed' && m.mode === 'mult' && m.value === 1.6
   && m.source === 'boss-charge' && m.scope === 'timed'), '#91 冲刺期 maxSpeed × chargeSpeed timed modifier 已加');
ok(typeof weaveEnt.bossChargeUntil === 'number', '#91 冲刺到期时间戳已记录');
// 到期回收：把时间戳拨回过去 → 下帧移除 modifier
weaveEnt.bossChargeUntil = Date.now() - 1;
evs = updateBossBehavior(weaveEnt, 0.016, wp);
ok(!weaveEnt.modifiers.some(m => m.source === 'boss-charge') && weaveEnt.bossChargeUntil === undefined,
   '#91 冲刺到期后 boss-charge modifier 回收');
// 缺省碾压（weave 无 contact 配置 → WEAVE_CONTACT_DEFAULTS dmg 100 / kb 240 / cd 1.5）
dmgCalls = [];
weaveEnt.contactCdT = 0;   // 清掉首轮接触冷却，单独验证缺省参数
wp.x = 40; wp.y = 0;
evs = updateBossBehavior(weaveEnt, 0.016, wp);
const contactEv = evs.find(e => e.type === 'contact');
ok(!!contactEv && contactEv.dmg === 100, '#91 weave 缺省碾压伤害 100 生效');
ok(Math.abs(wp.x - 280) < 0.001, '#91 weave 缺省击退 240 px');

// 15) #91 updateBossBehavior：command 炮击压制（callStrike 自定义 delay/radius/dmgMult/shellCount + 计时节律）
strikeCalls = [];
const cmdPlayer = { hp: 800, maxHp: 800, x: 333, y: 444, hullLen: 64 };
evs = updateBossBehavior(behEnt, 1.0, cmdPlayer); // dt 累计 1 < interval 9 → 未触发
ok(strikeCalls.length === 0, '#91 command 首轮炮击前（interval 内）不触发');
behEnt.barrageCdT = 0.01; // 拨到触发点
evs = updateBossBehavior(behEnt, 0.02, cmdPlayer);
ok(strikeCalls.length === 1, '#91 command interval 到点呼叫一轮炮击');
const sc = strikeCalls[0];
ok(sc.x === 333 && sc.y === 444, '#91 炮击落点取玩家当前位置附近散布');
ok(sc.opts.owner === behEnt && sc.opts.delay === 3.5 && sc.opts.radius === 110
   && sc.opts.dmgMult === 0.8 && sc.opts.shellCount === 3, '#91 callStrike 收到自定义 delay/radius/dmgMult/shots');
ok(evs.some(e => e.type === 'barrage'), '#91 产生 barrage 事件');
ok(behEnt.barrageCdT === 9, '#91 炮击后节律计时器重置为 interval');
// 目标死亡 → 不开火
strikeCalls = [];
cmdPlayer.hp = 0;
behEnt.barrageCdT = 0;
evs = updateBossBehavior(behEnt, 0.02, cmdPlayer);
ok(strikeCalls.length === 0, '#91 目标已毁不开火');
// 非 Boss 实体安全
ok(updateBossBehavior(null, 0.016, cmdPlayer).length === 0 && updateBossBehavior(plainEnt, 0.016, cmdPlayer).length === 0,
   '#91 非 Boss/无行为实体 updateBossBehavior 安全返回空');

console.log('test-boss: 完成所有检查');
if (fails === 0) console.log('test-boss: 全部通过');
else console.error(`test-boss: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
