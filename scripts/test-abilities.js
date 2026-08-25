// test-abilities.js — P-17 阶段 2 战术能力纯逻辑测试（Node 端，Pure Logic）
// 覆盖：
//   strike：callStrike 登记/散布落弹点数量/rng 确定性/齐射与连射 stagger/上限滚动丢弃/
//           到点触发（fake entities 验证 AOE 衰减公式、排除 owner、无敌免疫、阵营过滤）/
//           clearStrikes（按 owner / 全清）；
//   shield：定向角内吸收/角外不吸收/边界不吸收/全向恒吸收/累计 hp 消耗/单发超限穿透/
//           池耗尽破裂/到期移除/重复施放刷新；
//   abilities：overdrive timed modifier reload 倍率生效 + expiresAt 剪除恢复（参照
//              test-modifiers.js 先例）；共享冷却（激活后冷却期内拒绝、递减、结束可再激活）；
//              cardEffects 持有检查（无卡拒绝/缺参拒绝/unsupported/多卡同 key 不叠加）。
// 边界模式：clearStrikes 承担 resetEntity 等价清场职责；落弹为简化直伤（不触发
// resolveHit 的模块效果/debuff）；无敌（invuln/invulnT）与已摧毁目标免疫。
// 运行：node scripts/test-abilities.js
'use strict';

const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;

const model = require('../js/tank_model.js');
const strike = require('../js/tank_strike.js');
const shield = require('../js/tank_shield.js');
const abil = require('../js/tank_abilities.js');

let fails = 0;
function ok(cond, label) {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}`); fails++; }
}
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }
// 模块级 strikes 数组为全局单例：计数/位置敏感断言前先清空，避免跨块串扰
function resetAll() { while (strike.strikes.length) strike.clearStrikes(); }
// 固定序列 rng：确定性散布测试（每落弹点消费 2 次：angle + dist）
function seqRng(values) {
  let i = 0;
  return function () { return values[i++ % values.length]; };
}
function player(x, y, dmg) {
  return { id: 'player', team: 'player', x: x || 0, y: y || 0, hp: 100, stats: { damage: dmg || 100 } };
}
function enemy(x, y, hp) {
  return { id: 'enemy:' + x + ':' + y, team: 'enemy', x, y, hp: hp !== undefined ? hp : 100 };
}
// 主动能力测试坦克：真实 makeTank（overdrive 走 stats 管道）+ cardEffects
function abilityTank(effects) {
  const t = model.makeTank({ team: 'player' });
  t.cardEffects = effects || [];
  return t;
}

// ---- 1) callStrike：登记数量 / 记录字段契约 / 伤害计算（dmgMult × stats.damage）----
{
  resetAll();
  const p = player(0, 0, 100);
  const created = strike.callStrike(10, 20, { owner: p, rng: seqRng([0, 0.5, 0.25, 0.5, 0.75, 0.5]) });
  ok(created.length === 3 && strike.strikes.length === 3, 'shellCount=3 → 3 个落弹点登记');
  ok(strike.strikes.every(s => s.x !== undefined && s.y !== undefined && s.radius === 110
    && typeof s.delay === 'number' && typeof s.dmg === 'number' && typeof s.t === 'number'
    && s.owner === p && /^strike:\d+$/.test(s.id)), '记录字段契约 {x,y,radius,delay,dmg,t,owner,id}');
  ok(strike.strikes.every(s => s.dmg === Math.round(1.2 * 100)), '单发 dmg = round(dmgMult × stats.damage) = 120');
  ok(strike.strikes.every(s => Math.hypot(s.x - 10, s.y - 20) <= 110 + 1e-9), '落弹点在目标点 radius 内散布');
}

// ---- 2) rng 确定性：同序列两次呼叫 → 完全相同的落弹点 ----
{
  resetAll();
  const p = player(0, 0, 100);
  const a = strike.callStrike(10, 20, { owner: p, rng: seqRng([0, 0.5, 0.25, 0.5, 0.75, 0.5]) });
  resetAll();
  const b = strike.callStrike(10, 20, { owner: p, rng: seqRng([0, 0.5, 0.25, 0.5, 0.75, 0.5]) });
  ok(a.length === b.length && a.every((s, i) => close(s.x, b[i].x) && close(s.y, b[i].y)), '同 rng 序列 → 落弹点逐位一致');
}

// ---- 3) stagger 语义：缺省 0.15 → 散布连射（第 i 发 delay+i×stagger）；0 → 齐射 ----
{
  resetAll();
  const p = player(0, 0, 100);
  const volley = strike.callStrike(0, 0, { owner: p, rng: seqRng([0, 0, 0, 0, 0, 0]) });
  ok(close(volley[0].t, 2.5) && close(volley[1].t, 2.65) && close(volley[2].t, 2.8), '缺省 stagger=0.15 → t = 2.5/2.65/2.8（散布连射）');
  resetAll();
  const burst = strike.callStrike(0, 0, { owner: p, stagger: 0, rng: seqRng([0, 0, 0, 0, 0, 0]) });
  ok(burst.every(s => close(s.t, 2.5)), 'stagger:0 → 全部 t=delay（齐射）');
}

// ---- 4) maxStrikes 上限：超限滚动丢弃最早（同 smokeClouds 先例）----
{
  resetAll();
  const p = player(0, 0, 100);
  ok(strike.strikeConfig().maxStrikes === 3, 'strikeConfig 读 RULES maxStrikes=3');
  const a = strike.callStrike(0, 0, { owner: p, shellCount: 2, maxStrikes: 3, rng: seqRng([0, 0, 0, 0]) });
  const b = strike.callStrike(0, 0, { owner: p, shellCount: 2, maxStrikes: 3, rng: seqRng([0, 0, 0, 0]) });
  ok(strike.strikes.length === 3, '2+2 超 maxStrikes=3 → 数组钳到 3');
  ok(b.every(x => strike.strikes.some(s => s.id === x.id)), '最新批次全部保留');
  ok(!strike.strikes.some(s => a[0].id === s.id), '最早落弹点被滚动丢弃');
  ok(strike.strikes.some(s => a[1].id === s.id), '滚动丢弃只丢最旧一个（a[1] 保留）');
}

// ---- 5) 到点触发：AOE 衰减公式 / 排除 owner / 无敌免疫 / 阵营过滤 / 事件载荷 ----
{
  resetAll();
  const p = player(0, 0, 100);
  strike.callStrike(0, 0, { owner: p, rng: seqRng([0, 0, 0, 0, 0, 0]) });
  const s = strike.strikes[0];
  s.x = 0; s.y = 0; s.radius = 110; s.dmg = 100; s.t = 0.5;   // 手动摆布：已知落点与伤害

  const e1 = enemy(0, 0);            // dist 0   → round(100×1.0×0.5)=50
  const e2 = enemy(0, 55);           // dist 55  → round(100×0.5×0.5)=25
  const e3 = enemy(0, 110);          // dist 110 → round(100×0×0.5)=0 → 不命中
  const e4 = enemy(0, 200);          // 超半径 → 不命中
  const ally = { id: 'ally', team: 'ally', x: 0, y: 20, hp: 100 };      // 非敌对 → 不命中
  const invuln = enemy(0, 20); invuln.invuln = true;                    // 无敌 → 免疫
  const invulnT = enemy(0, 30); invulnT.invulnT = 99;                   // 复活无敌期 → 免疫
  const dead = enemy(0, 40); dead.hp = 0;                               // 已摧毁 → 免疫
  const list = [p, e1, e2, e3, e4, ally, invuln, invulnT, dead];

  ok(strike.updateStrikes(0.3, list).length === 0, 't 未到 0 → 无落弹事件（t=0.2 剩余）');
  ok(close(strike.strikes[0].t, 0.2), 'updateStrikes(0.3) 递减 t 至 0.2');
  const ev = strike.updateStrikes(0.2, list);
  ok(ev.length === 1 && ev[0].type === 'strikeHit' && ev[0].x === 0 && ev[0].y === 0
    && ev[0].radius === 110 && ev[0].dmg === 100 && ev[0].owner === p, '事件载荷 type/x/y/radius/dmg/owner');
  ok(ev[0].hits.length === 2, '实际命中 2 个目标（e1、e2）');
  ok(e1.hp === 50, '贴脸 AOE = round(dmg×1×0.5) = 50');
  ok(e2.hp === 75, '半距 AOE = round(dmg×(1−0.5)×0.5) = 25');
  ok(e3.hp === 100 && e4.hp === 100, '边缘/超半径目标不受伤');
  ok(p.hp === 100, '排除 owner 自身');
  ok(ally.hp === 100, '非敌对（ally）不受伤');
  ok(invuln.hp === 100 && invulnT.hp === 100, '无敌（invuln/invulnT）免疫');
  ok(dead.hp === 0, '已摧毁目标不动');
  ok(strike.strikes.length === 2, '该落弹点触发移除（余下 2 个错峰落弹点仍预警）');
}

// ---- 6) 落弹事件在 entities 缺省时仍输出（hits 空，供接线层播特效）；dt<=0 不推进 ----
{
  resetAll();
  const p = player(0, 0, 100);
  strike.callStrike(0, 0, { owner: p, rng: seqRng([0, 0, 0, 0, 0, 0]) });
  strike.strikes[0].t = 0.001;
  const ev = strike.updateStrikes(0.002);
  ok(ev.length === 1 && ev[0].hits.length === 0, '无 entities → 事件仍输出（hits 空）');
  strike.callStrike(0, 0, { owner: p, rng: seqRng([0, 0, 0, 0, 0, 0]) });
  ok(strike.updateStrikes(0).length === 0 && strike.updateStrikes(-1).length === 0, 'dt<=0 → 不推进无事件');
}

// ---- 7) clearStrikes：按 owner / 全清 / 返回移除数 ----
{
  resetAll();
  const p = player(0, 0, 100);
  const q = player(500, 500, 100);
  strike.callStrike(0, 0, { owner: p, maxStrikes: 9, rng: seqRng([0, 0, 0, 0, 0, 0]) });
  strike.callStrike(10, 10, { owner: p, maxStrikes: 9, rng: seqRng([0, 0, 0, 0, 0, 0]) });
  strike.callStrike(20, 20, { owner: q, maxStrikes: 9, rng: seqRng([0, 0, 0, 0, 0, 0]) });
  ok(strike.strikes.length === 9, '两 owner 共 9 个落弹点（maxStrikes 覆盖放宽）');
  ok(strike.clearStrikes(p) === 6 && strike.strikes.length === 3, 'clearStrikes(p) 移除 6 个');
  ok(strike.clearStrikes() === 3 && strike.strikes.length === 0, 'clearStrikes() 无参 → 全清');
}

// ---- 8) 护盾定向：角内吸收 / 角外不吸收 / 边界（严格小于）不吸收 ----
{
  const t = { team: 'player', turretAngle: 0, hp: 100 };
  const sh = shield.applyShield(t, { dir: 0 });
  ok(sh === t.shield && t.shield.omni === false && t.shield.dir === 0, '定向护盾挂载，dir=0、omni=false');
  ok(close(t.shield.arc, Math.PI / 3) && t.shield.hp === 150 && close(t.shield.t, 8), '定向 arc=π/3、hp=150、t=dirDuration=8');
  ok(shield.shieldAbsorbs(t, { dx: 1, dy: 0 }) === true, '入射方向 0°（正对 dir）→ 吸收');
  ok(shield.shieldAbsorbs(t, { dx: Math.cos(0.5), dy: Math.sin(0.5) }) === true, '入射 28.6° < arc/2 → 吸收');
  ok(shield.shieldAbsorbs(t, { dx: Math.cos(Math.PI / 6 - 1e-9), dy: Math.sin(Math.PI / 6 - 1e-9) }) === true, '入射恰边界内侧（arc/2−ε）→ 吸收');
  ok(shield.shieldAbsorbs(t, { dx: Math.cos(Math.PI / 6 + 1e-9), dy: Math.sin(Math.PI / 6 + 1e-9) }) === false, '入射恰边界外侧（arc/2+ε）→ 严格小于，不吸收');
  ok(shield.shieldAbsorbs(t, { dx: -1, dy: 0 }) === false, '入射 π（背向）→ 不吸收');
  ok(shield.shieldAbsorbs(t, { dx: 0, dy: 1 }) === false, '入射 π/2 > arc/2 → 不吸收');
}

// ---- 9) 护盾全向：恒吸收；时长 omniDuration；dir 缺省取 turretAngle ----
{
  const t = { team: 'player', turretAngle: 1.2, hp: 100 };
  shield.applyShield(t, { omni: true });
  ok(t.shield.omni === true && close(t.shield.arc, Math.PI * 2) && close(t.shield.t, 4), '全向 arc=2π、t=omniDuration=4');
  ok(shield.shieldAbsorbs(t, { dx: 1, dy: 0 }) && shield.shieldAbsorbs(t, { dx: -1, dy: 0 })
    && shield.shieldAbsorbs(t, { dx: 0, dy: 1 }) && shield.shieldAbsorbs(t, { dx: 0.3, dy: -0.9 }), '全向任意入射角恒吸收');
  const t2 = { team: 'player', turretAngle: 1.2, hp: 100 };
  const sh2 = shield.applyShield(t2, {});
  ok(sh2.omni === false && close(sh2.dir, 1.2), '定向 dir 缺省 → 取 t.turretAngle');
}

// ---- 10) absorbDamage：累计消耗池 / 单发超限穿透 / 池耗尽破裂 / 无护盾原样返回 ----
{
  const t = { team: 'player', turretAngle: 0, hp: 100 };
  shield.applyShield(t, { dir: 0 });
  ok(shield.absorbDamage(t, 60) === 0 && close(t.shield.hp, 90), '吸收 60 → 剩余 0、池 150→90');
  ok(shield.absorbDamage(t, 90) === 0 && t.shield === null, '再吸收 90 → 池耗尽破裂（t.shield 移除）');
  ok(shield.absorbDamage(t, 30) === 30, '无护盾 → 伤害原样返回（不吸收）');
  shield.applyShield(t, { dir: 0 });
  ok(shield.absorbDamage(t, 200) === 50 && t.shield === null, '单发 200 超 absorbCap=150 → 吸收 150、穿透 50、破裂');
  ok(shield.absorbDamage(t, 0) === 0, 'dmg=0 → 返回 0');
}

// ---- 11) updateShield：逐帧递减 / 到期移除；重复施放刷新时长与 hp ----
{
  const t = { team: 'player', turretAngle: 0, hp: 100 };
  shield.applyShield(t, { dir: 0 });
  shield.updateShield(t, 3);
  ok(shield.hasShield(t) && close(t.shield.t, 5), 'updateShield(3) → t=8−3=5 仍生效');
  shield.updateShield(t, 5.001);
  ok(t.shield === null && shield.hasShield(t) === false, 't≤0 → 护盾移除');
  shield.updateShield(t, 1);                       // 无护盾时安全
  shield.applyShield(t, { dir: 0 });
  shield.updateShield(t, 3);                       // 半途刷新
  shield.applyShield(t, { dir: 0 });
  ok(close(t.shield.t, 8) && t.shield.hp === 150, '重复施放 → 时长与吸收池刷新');
  shield.applyShield(t, { omni: true });
  ok(t.shield.omni === true && close(t.shield.t, 4), '定向→全向切换覆盖（时长 omniDuration）');
  ok(shield.updateShield(t, 0) === undefined, 'dt=0 不推进');
}

// ---- 12) overdrive：timed modifier reload 倍率生效 / reloadT 清零 / expiresAt 剪除恢复 ----
{
  const t = abilityTank([{ type: 'ability', key: 'overdrive', cardId: 'c1' }]);
  const baseReload = t.stats.reload;
  const res = abil.tryActivateAbility(t, 'overdrive', {});
  ok(res.ok === true && res.key === 'overdrive' && close(res.reloadMult, 0.45) && res.duration === 6, 'overdrive 激活成功');
  ok(close(t.stats.reload, baseReload * 0.45), 'reload 倍率 ×0.45 生效');
  ok(t.reloadT === 0, '激活立即清零 reloadT（爆发装填）');
  ok(t.modifiers.some(m => m.source === 'ability:overdrive' && m.scope === 'timed'
    && m.stat === 'reload' && m.mode === 'mult'), 'timed modifier 入列（source ability:overdrive）');
  const exp = t.modifiers.find(m => m.source === 'ability:overdrive').expiresAt;
  ok(exp > Date.now() + 5000 && exp < Date.now() + 7000, 'expiresAt ≈ now + duration×1000');
  const om = t.modifiers.find(m => m.source === 'ability:overdrive');
  om.expiresAt = Date.now() - 1;                    // 模拟到期（参照 test-modifiers.js 先例）
  model.refreshStats(t);
  ok(close(t.stats.reload, baseReload), '到期剪除 timed 修饰器 → reload 恢复原速');
}

// ---- 13) 共享冷却：激活后冷却期内拒绝 / 逐帧递减 / 归零后可再激活 / 去旧防叠乘 ----
{
  const t = abilityTank([
    { type: 'ability', key: 'overdrive', cardId: 'c1' },
    { type: 'ability', key: 'artillery', cardId: 'c2' },
    { type: 'ability', key: 'shield', cardId: 'c3' }
  ]);
  ok(abil.tryActivateAbility(t, 'overdrive', {}).ok === true, 'overdrive 首次激活');
  ok(close(t.abilityCdT, RULES.abilities.overdrive.cooldown), '冷却 = overdrive.cooldown = 20');
  let r = abil.tryActivateAbility(t, 'overdrive', {});
  ok(r.ok === false && r.reason === 'cooldown', '冷却期内 overdrive 拒绝');
  r = abil.tryActivateAbility(t, 'artillery', { target: { x: 0, y: 0 } });
  ok(r.ok === false && r.reason === 'cooldown', '冷却期内 artillery 也拒绝（共享冷却）');
  r = abil.tryActivateAbility(t, 'shield', { omni: true });
  ok(r.ok === false && r.reason === 'cooldown', '冷却期内 shield 也拒绝（共享冷却）');
  abil.updateAbilityCd(t, 5);
  ok(close(t.abilityCdT, 15), 'updateAbilityCd(5) → 15');
  abil.updateAbilityCd(t, 30);
  ok(t.abilityCdT === 0, 'updateAbilityCd 超量 → 钳到 0');
  r = abil.tryActivateAbility(t, 'overdrive', {});
  ok(r.ok === true, '冷却归零 → 可再激活');
  ok(t.modifiers.filter(m => m.source === 'ability:overdrive').length === 1, '重复激活先去旧 modifier（不叠乘）');
  abil.updateAbilityCd(t, -1);                       // dt<0 安全
  ok(close(t.abilityCdT, RULES.abilities.overdrive.cooldown), 'dt<0 不递减');
}

// ---- 14) cardEffects 持有检查：无卡拒绝 / 缺参拒绝 / unsupported / 多卡同 key 可用 ----
{
  const bare = abilityTank([]);
  let r = abil.tryActivateAbility(bare, 'overdrive', {});
  ok(r.ok === false && r.reason === 'no-ability', '无 cardEffects → overdrive 拒绝');
  ok(abil.hasAbility(bare, 'overdrive') === false && abil.hasAbility(bare, 'shield') === false, 'hasAbility 无卡查询 false');

  const wrong = abilityTank([{ type: 'ability', key: 'shield', cardId: 's1' }]);
  r = abil.tryActivateAbility(wrong, 'overdrive', {});
  ok(r.ok === false && r.reason === 'no-ability', '持 shield 卡 → overdrive 仍拒绝（按 key 持有检查）');

  const stacked = abilityTank([
    { type: 'ability', key: 'overdrive', cardId: 'a' },
    { type: 'ability', key: 'overdrive', cardId: 'b' }
  ]);
  r = abil.tryActivateAbility(stacked, 'overdrive', {});
  ok(r.ok === true && close(r.reloadMult, 0.45), '同 key 多卡 → 可用性生效、效果不叠加（maxStacks 语义）');

  const smoke = abilityTank([{ type: 'ability', key: 'smoke', cardId: 's' }]);
  r = abil.tryActivateAbility(smoke, 'smoke', {});
  ok(r.ok === false && r.reason === 'unsupported', '非本入口能力键（smoke）→ unsupported');

  const art = abilityTank([{ type: 'ability', key: 'artillery', cardId: 'a1' }]);
  r = abil.tryActivateAbility(art, 'artillery', {});
  ok(r.ok === false && r.reason === 'need-target', 'artillery 缺 ctx.target → need-target');

  const sh = abilityTank([{ type: 'ability', key: 'shield', cardId: 's1' }]);
  r = abil.tryActivateAbility(sh, 'shield', {});
  ok(r.ok === false && r.reason === 'need-dir-or-omni', 'shield 缺 ctx.dir/omni → need-dir-or-omni');
}

// ---- 15) 经统一入口激活 artillery：落弹委托共享模块 / 冷却置 reload / rng 透传确定性 ----
{
  resetAll();
  const t = abilityTank([{ type: 'ability', key: 'artillery', cardId: 'a1' }]);
  const r = abil.tryActivateAbility(t, 'artillery', { target: { x: 100, y: 100 }, rng: seqRng([0, 0.5, 0.25, 0.5, 0.75, 0.5]) });
  ok(r.ok === true && r.strikes.length === 3 && strike.strikes.length === 3, 'artillery 激活 → 3 落弹入共享 strikes');
  ok(r.strikes.every(s => s.owner === t && close(s.dmg, Math.round(1.2 * t.stats.damage))), '落弹 owner/dmg 正确');
  ok(close(t.abilityCdT, RULES.abilities.artillery.reload), 'artillery 冷却 = reload = 15');
  resetAll();

  const t2 = abilityTank([{ type: 'ability', key: 'shield', cardId: 's1' }]);
  const rs = abil.tryActivateAbility(t2, 'shield', { dir: 1.0 });
  ok(rs.ok === true && rs.shield === t2.shield && close(rs.shield.dir, 1.0) && rs.shield.omni === false, 'shield 经统一入口激活（dir 透传）');
  ok(close(t2.abilityCdT, RULES.abilities.shield.cooldown), 'shield 冷却 = cooldown = 25');
  const t3 = abilityTank([{ type: 'ability', key: 'shield', cardId: 's1' }]);
  const rs2 = abil.tryActivateAbility(t3, 'shield', { omni: true });
  ok(rs2.ok === true && rs2.shield.omni === true, 'shield 经统一入口激活（omni 透传）');
}

// ---- 16) repair/medkit（innate）：免持有检查 / 独立冷却池 / baseCd fallback 45 / 效果清除范围 / ammoBlew 不可修 ----
{
  // 16a) innate 绕过 hasAbility：无 cardEffects 的裸坦克可直接激活
  const bare = model.makeTank({ team: 'player' });
  ok(abil.hasAbility(bare, 'repair') === false, 'repair 无卡持有（hasAbility=false）——innate 不依赖卡牌');
  let r = abil.tryActivateAbility(bare, 'repair', {});
  ok(r.ok === true && r.key === 'repair', '裸坦克激活 repair 成功（绕过持有检查）');

  // 16b) 独立冷却池：写 abilityCds.repair、不动共享 abilityCdT；medkit 与 repair 互不干扰
  ok(typeof bare.abilityCds === 'object' && close(bare.abilityCds.repair, 45), '激活后 abilityCds.repair = 45（fallback 基础冷却）');
  ok((bare.abilityCdT || 0) === 0, '共享冷却 abilityCdT 未被 innate 触碰（独立池）');
  r = abil.tryActivateAbility(bare, 'medkit', {});
  ok(r.ok === true, 'repair 冷却期内 medkit 仍可激活（独立冷却互不干扰）');
  ok(close(bare.abilityCds.medkit, 45), 'abilityCds.medkit = 45');

  // 16c) 冷却期内重复激活拒绝 'cooldown'
  r = abil.tryActivateAbility(bare, 'repair', {});
  ok(r.ok === false && r.reason === 'cooldown' && close(r.cd, 45), 'repair 冷却期内重复激活 → reason=cooldown');
  ok(close(bare.abilityCds.repair, 45), '被拒绝的激活不重置冷却');

  // 16d) baseCd 覆盖：t.abilityBaseCd 注入商店减免值
  const boosted = model.makeTank({ team: 'player' });
  boosted.abilityBaseCd = { repair: 30, medkit: 42 };
  abil.tryActivateAbility(boosted, 'repair', {});
  abil.tryActivateAbility(boosted, 'medkit', {});
  ok(close(boosted.abilityCds.repair, 30), 'abilityBaseCd.repair=30 → 有效冷却 30');
  ok(close(boosted.abilityCds.medkit, 42), 'abilityBaseCd.medkit=42 → 有效冷却 42');
  const partial = model.makeTank({ team: 'player' });
  partial.abilityBaseCd = { medkit: 20 };   // repair 未注入 → fallback 45
  abil.tryActivateAbility(partial, 'repair', {});
  ok(close(partial.abilityCds.repair, 45), 'abilityBaseCd 缺该键 → fallback 45');

  // 16e) updateAbilityCds：逐键递减 / 钳 ≥0 / dt<=0 安全 / 与 updateAbilityCd 互不干扰
  const cdT = model.makeTank({ team: 'player' });
  cdT.abilityCds = { repair: 10, medkit: 1 };
  cdT.abilityCdT = 99;
  abil.updateAbilityCds(cdT, 2);
  ok(close(cdT.abilityCds.repair, 8) && cdT.abilityCds.medkit === 0, 'updateAbilityCds(2) → repair 8 / medkit 钳到 0');
  ok(cdT.abilityCdT === 99, 'updateAbilityCds 不触碰共享 abilityCdT');
  abil.updateAbilityCds(cdT, -5);
  ok(close(cdT.abilityCds.repair, 8), 'dt<0 不递减');
  abil.updateAbilityCd(cdT, 1);
  ok(cdT.abilityCdT === 98 && close(cdT.abilityCds.repair, 8), 'updateAbilityCd 只动 abilityCdT（两池互不干扰）');
  abil.updateAbilityCds(null, 1);   // 无实体安全

  // 16f) repair 效果清除范围：履带/机动状态 + engine/ammo debuff；乘员 debuff 保留
  const dmg = model.makeTank({ team: 'player' });
  dmg.trackBroken = true; dmg._trackFx = true; dmg.immobT = 5;
  dmg.debuffs = { engine: 3, ammo: 2, gunner: 4 };
  r = abil.tryActivateAbility(dmg, 'repair', {});
  ok(r.ok === true && r.repairedAmmoRack === true, 'repair 激活成功且弹药架可修');
  ok(dmg.trackBroken === false && dmg.immobT === 0, 'repair 清 trackBroken/immobT');
  ok(dmg.debuffs.engine === undefined && dmg.debuffs.ammo === undefined, 'repair 清 debuffs.engine/ammo');
  ok(dmg.debuffs.gunner > 0, 'repair 不清乘员 debuff（gunner 保留，属 medkit 范围）');

  // 16g) medkit 效果清除范围：四类乘员 debuff；发动机保留
  const crew = model.makeTank({ team: 'player' });
  crew.debuffs = { gunner: 2, loader: 3, commander: 1, driver: 2, engine: 6 };
  r = abil.tryActivateAbility(crew, 'medkit', {});
  ok(r.ok === true, 'medkit 激活成功');
  ok(crew.debuffs.gunner === undefined && crew.debuffs.loader === undefined
    && crew.debuffs.commander === undefined && crew.debuffs.driver === undefined, 'medkit 清 gunner/loader/commander/driver 四类乘员 debuff');
  ok(crew.debuffs.engine > 0, 'medkit 不清模块 debuff（engine 保留，属 repair 范围）');

  // 16h) ammoBlew 不可修：殉爆保留、ammo debuff 保留，其余照常修复、激活仍成功
  const blew = model.makeTank({ team: 'player' });
  blew.ammoBlew = true;
  blew.trackBroken = true; blew.immobT = 4;
  blew.debuffs = { ammo: 2, engine: 3 };
  r = abil.tryActivateAbility(blew, 'repair', {});
  ok(r.ok === true && r.repairedAmmoRack === false, 'ammoBlew 时 repair 激活成功但弹药架不可修（repairedAmmoRack=false）');
  ok(blew.ammoBlew === true, '殉爆状态保留（ammoBlew 不清除）');
  ok(blew.debuffs.ammo > 0, 'ammo debuff 保留（弹药架未修）');
  ok(blew.trackBroken === false && blew.immobT === 0 && blew.debuffs.engine === undefined, '其余（履带/机动/发动机）照常修复');
}


console.log('test-abilities: 完成所有检查');
if (fails === 0) console.log('test-abilities: 全部通过');
else console.error(`test-abilities: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);