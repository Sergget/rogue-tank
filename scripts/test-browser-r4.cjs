// 浏览器集成测试（#F7 2026-09-20 特性补全）：在真实 Edge (channel=msedge, headless) 中验证
// tank_mvp.html 的（A）主武器各类型实战（standard / double_barrel 空格齐射 / autocannon 连发+热量 /
// railgun 单发）（B）副武器 F 击发（mortar 曲射 / rocket burst / missile 锁定发射 / mine_layer 雷场生成）
// （C）主动技能实战效果（artillery 呼叫+落弹伤害 / shield 吸收池 / overdrive 装填归零）
// （D）商店整备购买结算（升级扣点+记录 / 复活加购 / 升级作用于开局）。
// 敌人 AI / Boss 深层行为不在浏览器覆盖（Node 侧 test-ai.js / test-boss.js 覆盖）。
// 用法: node scripts/test-browser-r4.cjs
'use strict';
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8125;
const BASE_PROBE = `http://127.0.0.1:${DEFAULT_PORT}/`;
const API_PROBE = `http://127.0.0.1:${DEFAULT_PORT}/api/tanks`;

const FAILS = [];
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
  if (!ok) FAILS.push(name);
}

function probeOk(url, timeoutMs = 1200) {
  return new Promise(resolve => {
    const req = http.get(url, res => { res.resume(); resolve(true); });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function probeOurApi(url, timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => { try { JSON.parse(body); resolve(true); } catch { resolve(false); } });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let log = '';
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });
    const url = `http://127.0.0.1:${port}/api/tanks`;
    const deadline = Date.now() + 10000;
    const poll = async () => {
      if (await probeOurApi(url, 800)) { resolve(child); return; }
      if (child.exitCode !== null) { reject(new Error(`server.js exited early (code ${child.exitCode})\n${log}`)); return; }
      if (Date.now() > deadline) { reject(new Error(`server.js not ready on :${port} within 10s\n${log}`)); return; }
      setTimeout(poll, 500);
    };
    poll();
  });
}

function realErrorsOf(errs) {
  return errs.filter(e => !String(e).includes('Failed to load resource'));
}

const waitFor = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let child = null;
  let browser = null;
  try {
    let base = null;
    if (await probeOk(BASE_PROBE) && await probeOurApi(API_PROBE)) {
      base = `http://127.0.0.1:${DEFAULT_PORT}`;
      console.log(`[server] reuse existing: ${base}`);
    } else if (await probeOk(BASE_PROBE)) {
      base = `http://127.0.0.1:${ALT_PORT}`;
      console.log(`[server] :${DEFAULT_PORT} occupied by foreign service, spawning on :${ALT_PORT}`);
      child = await startServer(ALT_PORT);
      console.log(`[server] spawned: ${base}`);
    } else {
      base = `http://127.0.0.1:${DEFAULT_PORT}`;
      console.log(`[server] spawning on :${DEFAULT_PORT}`);
      child = await startServer(DEFAULT_PORT);
      console.log(`[server] spawned: ${base}`);
    }

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

    await page.goto(`${base}/tank_mvp.html`, { waitUntil: 'load', timeout: 30000 });
    await waitFor(1500);

    // ---- 存档 + 局外链路：Home → loadout → 商店（购买结算）→ START RUN → map → battle ----
    const tankResp = await fetch(`${base}/api/tanks`);
    const tanks = await tankResp.json();
    const tankIds = Object.keys(tanks || {});
    check('api/tanks 返回至少 1 辆坦克（r4）', tankIds.length > 0, `count=${tankIds.length}`);
    const tankId = tankIds[0];
    const slotId = 'e2e-r4-slot';
    const savesMetaKey = 'rogue-tank-saves-meta';
    const slotKey = 'rogue-tank-save:' + slotId;

    await page.evaluate(({ savesMetaKey, slotKey, slotId, tankId }) => {
      localStorage.setItem(savesMetaKey, JSON.stringify({
        activeSaveId: slotId,
        saves: [{ id: slotId, name: 'E2E-R4', updatedAt: 1 }]
      }));
      localStorage.setItem(slotKey, JSON.stringify({
        version: 1, points: 0, upgrades: {}, stats: { runs: 0, kills: 0 },
        selectedTankId: tankId, ammoLoadout: ['ap', 'he'],
        bonusRevives: 0, difficultyLevel: 0, settings: {}
      }));
    }, { savesMetaKey, slotKey, slotId, tankId });
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await waitFor(1200);

    // 主世界注入（必须在 reload 之后：reload 会重建页面，注入随之丢失）：
    // 包装全局函数截获 IIFE 闭包对象（cam/流动状态/玩家命中弹）
    await page.addScriptTag({ content: `
      (() => {
        const origGen = window.generateRun, origTrans = window.transition,
              origVB = window.viewBounds, origHit = window.resolveHit;
        window.__shellHits = [];
        window.generateRun = function(...a){ const r = origGen.apply(this, a); window.__lastRun = r; return r; };
        window.transition = function(f, ...a){ window.__flow = f; return origTrans.apply(this, [f, ...a]); };
        window.viewBounds = function(c, ...a){ window.__cam = c; return origVB.apply(this, [c, ...a]); };
        window.resolveHit = function(s, t, h, ab){
          const r = origHit.apply(this, [s, t, h, ab]);
          if (s && s.shooter && s.shooter.id === 'player')
            window.__shellHits.push({ key: s.ammoKey || null });
          return r;
        };
        window.__dbg = {
          get flow(){ return window.__flow; }, get cam(){ return window.__cam; },
          get run(){ return window.__lastRun; }, get shots(){ return window.__shots; }
        };
        // 发射事件计数：炮弹命中/出界后即从 shells 移除（瞬时长度不可靠，尤其敌人贴近时），
        // 改为包装发射函数累计「玩家确实击发过几次」。
        // 注意**必须过滤 shooter**：firePrimaryShell/fireActiveSecondary 也服务于敌方/友军 AI
        //（主循环 AI 段直接调 fireTank），不过滤会把敌方射击算到玩家头上（实测「空格 1 发」偶发 2 发）。
        window.__shots = { primary: 0, secondary: 0 };
        const origPrimary = window.firePrimaryShell, origSecFire = window.fireActiveSecondary;
        if (origPrimary) window.firePrimaryShell = function(sh, ...a){
          if (sh && sh.id === 'player') window.__shots.primary++;
          return origPrimary.apply(this, [sh, ...a]);
        };
        if (origSecFire) window.fireActiveSecondary = function(sh, ...a){
          if (sh && sh.id === 'player') window.__shots.secondary++;
          return origSecFire.apply(this, [sh, ...a]);
        };
        // 雷场生成枚数：地雷触发半径 45px，若目标就站在雷场里会被立即引爆，
        // 用「存活地雷数」会少算，故直接统计 spawnMine 真实调用次数
        window.__minesSpawned = 0;
        const origSpawnMine = window.spawnMine;
        if (origSpawnMine) window.spawnMine = function(...a){ window.__minesSpawned++; return origSpawnMine.apply(this, a); };
      })();
    `});

    const entered = await page.evaluate(() => {
      const btn = document.querySelector('.enter-btn');
      if (!btn) return false;
      btn.click();
      return true;
    });
    check('Home 显示存档卡片并可点击进入（r4）', entered);
    await page.waitForFunction(() => window.__dbg && window.__dbg.flow && window.__dbg.flow.state === 'loadout', null, { timeout: 8000 });

    // ---- D：商店整备购买结算（loadout ⇄ shop）----
    await page.evaluate(() => document.getElementById('loadShopBtn').click());
    await page.waitForFunction(() => window.__dbg && window.__dbg.flow && window.__dbg.flow.state === 'shop', null, { timeout: 5000 });
    // D1：25 点恰可购买 hp_up（cost 25；pen_up/dmg_up 30 不可买）→ 点数扣减 + 升级记录 + UI 刷新
    const buyRes = await page.evaluate(() => {
      const p = window.__TEST__.profile();
      p.points = 25;
      window.__TEST__.rerenderShop();
      const cards = Array.from(document.querySelectorAll('#shopUpgradeList .shop-card'));
      const buyable = cards.filter(c => !c.classList.contains('off'));
      const name = buyable.length ? ((buyable[0].querySelector('.sname span') || {}).textContent || null) : null;
      if (buyable.length) buyable[0].click();
      const after = window.__TEST__.profile();
      return {
        buyable: buyable.length, name,
        points: after.points, hpUp: (after.upgrades || {}).hp_up,
        ptsText: document.getElementById('shopPoints').textContent
      };
    });
    check('商店购买结算：25 点购 hp_up → 点数归零 + 升级 Lv1 + UI 刷新',
      buyRes.name === '车体耐久' && buyRes.buyable >= 1 && buyRes.points === 0 && buyRes.hpUp === 1 &&
      /0/.test(buyRes.ptsText), JSON.stringify(buyRes));
    // D2：复活加购（cost 40）→ bonusRevives +1 + 点数扣减
    const reviveRes = await page.evaluate(() => {
      const p = window.__TEST__.profile();
      p.points = 120;
      window.__TEST__.rerenderShop();
      const btn = document.querySelector('#shopReviveRow button');
      const disabled0 = !btn || btn.disabled;
      if (btn && !btn.disabled) btn.click();
      const after = window.__TEST__.profile();
      return { disabled0, revives: after.bonusRevives, points: after.points };
    });
    check('商店复活加购：40 点 → bonusRevives +1 且点数扣减',
      reviveRes.disabled0 === false && reviveRes.revives === 1 && reviveRes.points === 80, JSON.stringify(reviveRes));
    await page.evaluate(() => document.getElementById('shopLoadoutBtn').click());
    await page.waitForFunction(() => window.__dbg && window.__dbg.flow && window.__dbg.flow.state === 'loadout', null, { timeout: 5000 });
    check('商店返回 loadout', true);

    await page.evaluate(() => document.getElementById('loadStartBtn').click());
    await page.waitForFunction(() => window.__dbg && window.__dbg.flow && window.__dbg.flow.state === 'map', null, { timeout: 10000 });
    const battleState = await page.evaluate(() => {
      if (window.__TEST__.flowState() !== 'map') return null;
      window.__TEST__.skipToNode(0);
      return window.__TEST__.flowState();
    });
    check('START RUN → map → skipToNode(0) battle', battleState === 'battle', `state=${battleState}`);
    await waitFor(600);

    // D3：商店升级作用于开局（hp_up Lv1 → stats.maxHp ≥ base + 10）
    const hpBoost = await page.evaluate(() => {
      const p = entities.find(e => e.id === 'player');
      return { maxHp: p.stats.maxHp, baseMaxHp: p.base.maxHp, diff: p.stats.maxHp - p.base.maxHp };
    });
    check('商店升级作用于开局：maxHp ≥ base + 10', hpBoost.diff >= 10, JSON.stringify(hpBoost));

    // 开火前置：清装填/压制/双管就绪/副武器冷却（测试作弊，帧内必可开火）
    const fireReady = () => page.evaluate(() => {
      const p = entities.find(e => e.id === 'player');
      p.reloadT = 0; p.immobT = 0; p.secondaryReloadT = 0;
      p.invulnT = 9999;   // 夹具：本链只验证玩家输出，敌人不还击也不允许把玩家打死
      // 夹具：全体敌人冻结（不移动/不还击/不可击杀）。敌方 AI 会自主开火（主循环 AI 段
      // 直接调 fireTank），既污染发射计数，也可能在长链中把玩家打死造成假失败。
      for (const e of entities) {
        if (e.team !== 'enemy') continue;
        e.stats.maxHp = 1e6; e.hp = 1e6; e.immobT = 9999; e.reloadT = 9999;
      }
      // 双管就绪表仅在当前主武器确为 double_barrel 时保留（否则清掉，防单管武器走双管路径被拒）；
      // 注意**不**清 _rocketBurst/_missileLock 等武器自身状态——清掉会破坏 burst 链与锁定语义
      const isDb = !!(p.weapons && p.weapons.primary && p.weapons.primary.type === 'double_barrel');
      if (!isDb) p._dbState = null;
      else if (p._dbState) { p._dbState.ready.fill(true); p._dbState.loadT.fill(0); }
      return true;
    });
    const shellsLen = () => page.evaluate(() => window.__TEST__.shells().length);
    const shotsNow = () => page.evaluate(() => ({ primary: window.__shots.primary, secondary: window.__shots.secondary }));
    const primaryType = () => page.evaluate(() => entities.find(e => e.id === 'player').weapons.primary.type);
    // 敌人右前方放置 + 屏幕坐标（炮塔追踪鼠标）
    const placeEnemy = (dx) => page.evaluate(([dx]) => {
      const p = entities.find(e => e.id === 'player');
      const en = entities.find(e => e.team === 'enemy' && e.hp > 0) || entities.find(e => e.team === 'enemy');
      en.x = p.x + dx; en.y = p.y;
      // 夹具：敌人巨大血量（不可击杀——否则敌方全灭触发清场 isClearing，主循环整块跳过开火轮询，
      // 后续段"不开火"全是假失败）+ 冻结且不还击（reloadT 极大，防玩家中途战死）
      en.stats.maxHp = 1e6; en.hp = 1e6; en.immobT = 9999; en.reloadT = 9999;
      return { x: en.x, y: en.y, maxHp: en.stats.maxHp };
    }, [dx]);
    const mouseTo = async (wx, wy) => {
      const scr = await page.evaluate(([wx, wy]) => {
        const s = worldToScreen(window.__dbg.cam, wx, wy);
        return [s.x, s.y];
      }, [wx, wy]);
      await page.mouse.move(scr[0], scr[1]);
      await waitFor(300);
    };

    // ---- A：主武器各类型实战（判据=发射事件计数：敌人贴近时炮弹命中后立即离开 shells） ----
    await fireReady();
    const pe = await placeEnemy(220);
    await mouseTo(pe.x, pe.y);
    {
      const s0 = (await shotsNow()).primary;
      await page.keyboard.down(' ');
      await waitFor(200); await page.keyboard.up(' ');
      await waitFor(150);
      const s1 = (await shotsNow()).primary;
      const t1 = await primaryType();
      // 默认主炮可能是双管（车型配置）——按类型给出对应期望发射数（单管 1 / 双管齐射 2）
      const expect1 = (t1 === 'double_barrel') ? 2 : 1;
      check(`A1 默认主炮（${t1}）：空格击发 → 发射 ${expect1} 发`, s1 - s0 === expect1, `type=${t1} shots=${s1 - s0}`);
    }
    {
      await page.evaluate(() => window.__TEST__.giveCard('weapon_primary_double_barrel'));
      await fireReady();
      const s0 = (await shotsNow()).primary;
      await page.keyboard.down(' ');
      await waitFor(200); await page.keyboard.up(' ');
      await waitFor(150);
      const s1 = (await shotsNow()).primary;
      const db = await page.evaluate(() => {
        const p = entities.find(e => e.id === 'player');
        return { type: p.weapons.primary.type, count: p._dbState ? p._dbState.count : null };
      });
      check('A2 double_barrel：空格齐射 2 发（两管都就绪，#F2 接线）',
        db.type === 'double_barrel' && db.count === 2 && s1 - s0 === 2, `type=${db.type} count=${db.count} shots=${s1 - s0}`);
    }
    {
      await page.evaluate(() => window.__TEST__.giveCard('weapon_primary_autocannon'));
      await fireReady();
      const s0 = (await shotsNow()).primary;
      await page.keyboard.down(' ');
      await waitFor(400); await page.keyboard.up(' ');
      await waitFor(120);
      const s1 = (await shotsNow()).primary;
      const heat = await page.evaluate(() => entities.find(e => e.id === 'player').heatPct);
      // autocannon 装填 = reloadMult 0.25 × 1.5s ≈ 0.375s/发 → 400ms 内 2 发即「连发」成立
      check('A3 autocannon：空格按住连发（≥2 发）且热量积累（heatPct>0）',
        s1 - s0 >= 2 && heat && heat > 0, `shots=${s1 - s0} heatPct=${heat}`);
    }
    {
      await page.evaluate(() => window.__TEST__.giveCard('weapon_primary_railgun'));
      await fireReady();
      const s0 = (await shotsNow()).primary;
      await page.keyboard.down(' ');
      await waitFor(200); await page.keyboard.up(' ');
      await waitFor(150);
      const s1 = (await shotsNow()).primary;
      const tp = await primaryType();
      check('A4 railgun：安装生效 + 空格单发', tp === 'railgun' && s1 - s0 === 1, `type=${tp} shots=${s1 - s0}`);
    }

    // ---- B：副武器 F 击发（五类）----
    {
      await page.evaluate(() => window.__TEST__.giveCard('weapon_secondary_mortar'));
      await fireReady();
      const en3 = await placeEnemy(600);   // 目标放远：曲射弹飞行时间长，便于在 shells 里观察到 isArc
      await mouseTo(en3.x, en3.y);
      await page.keyboard.down('f'); await waitFor(250); await page.keyboard.up('f');
      await waitFor(200);
      const arc = await page.evaluate(() => {
        const s = window.__TEST__.shells();
        const pl = entities.find(e => e.id === 'player');
        return { arc: s.some(x => x.isArc), shells: s.length, sec: (pl.weapons.secondary || {}).type,
                 secT: +(pl.secondaryReloadT || 0).toFixed(2) };
      });
      check('B1 mortar：F 击发 → 曲射炮弹（isArc）入 shells 且装填启动',
        arc.arc && arc.secT > 0,
        `arc=${arc.arc} shells=${arc.shells} sec=${arc.sec} secT=${arc.secT}`);
    }
    {
      await page.evaluate(() => window.__TEST__.giveCard('weapon_secondary_rocket'));
      await fireReady();
      await page.keyboard.down('f'); await waitFor(250); await page.keyboard.up('f');
      await waitFor(200);
      // 注：__shots.secondary 计数的是「击发尝试」（含被装填门控拒绝的帧），
      // 因此这里以「装填启动 / burst 队列建立」作为真实发射证据
      const k1 = await page.evaluate(() => {
        const pl = entities.find(e => e.id === 'player');
        return { secT: +(pl.secondaryReloadT || 0).toFixed(2), burst: !!pl._rocketBurst, sec: (pl.weapons.secondary || {}).type };
      });
      check('B2 rocket：F 击发 → 装填启动 + burst 链建立',
        k1.sec === 'rocket' && (k1.secT > 0 || k1.burst), JSON.stringify(k1));
    }
    {
      await page.evaluate(() => window.__TEST__.giveCard('weapon_secondary_missile'));
      await fireReady();
      const en2 = await placeEnemy(260);
      await mouseTo(en2.x, en2.y);
      const s0 = (await shotsNow()).secondary;
      // 按住 250ms 才松手：同时回归「激活是开关、不得被逐帧轮询翻转」——此前每帧翻转，
      // 松手后的状态取决于帧数奇偶（约一半概率停在已取消）
      await page.keyboard.down('f');
      await waitFor(120);
      const midHold = await page.evaluate(() => !!entities.find(e => e.id === 'player')._missileActivated);
      await waitFor(130); await page.keyboard.up('f');
      const activated = await page.evaluate(() => !!entities.find(e => e.id === 'player')._missileActivated);
      await waitFor(2800);              // lockSeconds 1.0 + 飞行
      const s1 = (await shotsNow()).secondary;
      const stillLocking = await page.evaluate(() => !!entities.find(e => e.id === 'player')._missileActivated);
      check('B3 missile：F 激活 → 锁定 1s 自动发射（按住期间不被逐帧轮询翻转）',
        activated && midHold && (s1 - s0 >= 1 || stillLocking === false),
        `activated=${activated} midHold=${midHold} shots=${s1 - s0} stillLocking=${stillLocking}`);
    }
    {
      await page.evaluate(() => window.__TEST__.giveCard('weapon_secondary_mine_layer'));
      await fireReady();
      const dStart = await page.evaluate(() => window.deployables.filter(d => d.isMine).length);
      const spawn0 = await page.evaluate(() => window.__minesSpawned);
      // B4a（#F7 回归）：**按住** F 400ms 只算一次边沿——此前 mine_layer 走主循环逐帧轮询，
      // 一次按住会跨帧连走「预形态 → 确认」（一按即预约完成，预形态名存实亡）
      await page.keyboard.down('f'); await waitFor(400); await page.keyboard.up('f');
      await waitFor(150);
      const held = await page.evaluate(() => ({
        pv: !!window.__TEST__.mineFieldPreview(), pend: window.__TEST__.pendingMineFields()
      }));
      check('B4a mine_layer：按住 F 只走一次边沿（仅显示预形态，未预约）',
        held.pv && held.pend === 0, `preview=${held.pv} pending=${held.pend}`);
      await page.keyboard.press('f'); await waitFor(150);   // 第二次 F：确认预约
      const pending1 = await page.evaluate(() => window.__TEST__.pendingMineFields());
      await waitFor(4800);              // mineFieldDelay 4s
      const suspended = await page.evaluate(() => ({
        pend: window.__TEST__.pendingMineFields(),
        mines: window.deployables.filter(d => d.isMine).length,
        spawned: window.__minesSpawned
      }));
      check('B4 mine_layer：两次 F 预约 → 4s 后端雷场生成（预约清空 + 整场 ≥3 枚）',
        pending1 === 1 && suspended.pend === 0 && suspended.spawned - spawn0 >= 3,
        `pending=${pending1} → ${suspended.pend} 生成 ${suspended.spawned - spawn0} 枚 存活 ${dStart}→${suspended.mines}`);
      // B4b（#F5 用户反馈核心）：地雷触爆必须造成真实伤害——把敌人移到第一枚地雷上
      const mineHit = await page.evaluate(() => {
        const mine = window.deployables.filter(d => d.isMine)[0];
        if (!mine) return null;
        const en = entities.find(e => e.team === 'enemy' && e.hp > 0) || entities.find(e => e.team === 'enemy');
        if (!en) return null;
        const before = en.hp;
        en.x = mine.x; en.y = mine.y;
        return { before };
      });
      await waitFor(1400);
      const mineAfter = await page.evaluate(() => {
        const en = entities.find(e => e.team === 'enemy' && e.hp > 0) || entities.find(e => e.team === 'enemy');
        return { hp: en ? en.hp : 0, alive: !!en && en.hp > 0 };
      });
      check('B4b 地雷触爆对敌人造成伤害（#F5 核心）',
        !!mineHit && (!mineAfter.alive || mineAfter.hp < mineHit.before),
        `before=${mineHit ? mineHit.before.toFixed(1) : 'n/a'} after=${mineAfter.hp.toFixed(1)} alive=${mineAfter.alive}`);
    }

    // ---- C：主动技能实战效果 ----
    {
      await page.evaluate(() => window.__TEST__.giveCard('artillery_strike'));
      const en = await placeEnemy(200);
      await mouseTo(en.x, en.y);
      const st0 = await page.evaluate(() => window.__TEST__.strikes().length);
      await page.evaluate(() => document.getElementById('btnG').click());
      await waitFor(200);
      const st1 = await page.evaluate(() => window.__TEST__.strikes().length);
      await waitFor(400);
      // 落点由呼叫瞬间的鼠标世界点决定（相机会随后移动，落点会与敌人位置有偏差）
      // ——直接把敌人搬到落点上做伤害验证（与 B4b 同思路，稳定且真实验证 AOE 结算）
      const strikePos = await page.evaluate(() => {
        const st = window.__TEST__.strikes();
        const en = entities.find(e => e.team === 'enemy' && e.hp > 0) || entities.find(e => e.team === 'enemy');
        const before = en ? en.hp : 0;
        if (st.length && en) { en.x = st[0].x; en.y = st[0].y; }
        return { sx: st.length ? st[0].x : null, sy: st.length ? st[0].y : null, before };
      });
      await waitFor(3200);   // delay 2.5 + 落弹
      const hp = await page.evaluate(() => {
        const en = entities.find(e => e.team === 'enemy' && e.hp > 0) || entities.find(e => e.team === 'enemy');
        return { hp: en.hp, maxHp: en.stats.maxHp };
      });
      const posTxt = strikePos.sx === null ? 'strike=none'
        : `strike=(${strikePos.sx.toFixed(0)},${strikePos.sy.toFixed(0)})`;
      check('C1 artillery：G 呼叫 → strikes +3 登记 + 落弹后敌人掉血',
        st1 - st0 >= 3 && hp.hp < strikePos.before,
        `strikes ${st0}→${st1} hp ${strikePos.before.toFixed(1)}→${hp.hp.toFixed(1)} ${posTxt}`);
    }
    {
      await page.evaluate(() => window.__TEST__.giveCard('tactical_shield'));
      await page.evaluate(() => document.getElementById('btnH').click());
      await waitFor(180);
      const sh = await page.evaluate(() => {
        const p = entities.find(e => e.id === 'player');
        return p.shield ? { hp: p.shield.hp, t: p.shield.t } : null;
      });
      check('C2 shield：H 展开 → 吸收池 hp>0 且存活', sh && sh.hp > 0 && sh.t > 0, JSON.stringify(sh));
    }
    {
      await page.evaluate(() => window.__TEST__.giveCard('super_reload'));
      await fireReady();
      await page.evaluate(() => { entities.find(e => e.id === 'player').reloadT = 5; });
      // #H3（2026-09-21）：V 键删除——超装填经技能池数字键触发（与正式游戏同路径）。
      // owned 序列 = cardEffects ability 键去重（C1/C2 已给 artillery/shield 卡）→ 动态定位
      // overdrive 的槽位后按对应数字键（不写死 1，避免前文卡序耦合）。
      const slotIdx = await page.evaluate(() => {
        const p = entities.find(e => e.id === 'player');
        const keys = (p.cardEffects || []).filter(ef => ef && ef.type === 'ability' && ef.key)
          .map(ef => ef.key).filter((k, i, a) => a.indexOf(k) === i);
        return keys.indexOf('overdrive');
      });
      if (slotIdx < 0) throw new Error('overdrive 不在技能池（super_reload 卡未生效）');
      await page.keyboard.press(String(slotIdx + 1));
      await waitFor(150);
      const od = await page.evaluate(() => {
        const p = entities.find(e => e.id === 'player');
        return { reloadT: p.reloadT, cd: (p.abilityCds || {}).overdrive };
      });
      check('C3 overdrive：技能池数字键 → 装填归零 + 冷却入池（>0）', od.reloadT === 0 && od.cd && od.cd > 0, JSON.stringify(od));
    }

    // ---- 收尾：无 console/page 错误 ----
    await waitFor(400);
    check('全程无 console error / page error', realErrorsOf(errors).length === 0, JSON.stringify(realErrorsOf(errors).slice(0, 5)));

    console.log(`test-browser-r4: ${FAILS.length === 0 ? '全部通过' : FAILS.length + ' 项失败'}`);
  } catch (e) {
    console.error('test-browser-r4: 异常 —', e.message);
    process.exitCode = 2;
    return;
  } finally {
    try { if (browser) browser.close(); } catch {}
    try { if (child) child.kill(); } catch {}
  }
  process.exitCode = FAILS.length > 0 ? 1 : 0;
})();