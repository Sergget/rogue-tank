'use strict';

// scripts/measure-encounter-real.cjs — MS2/C2：正式局遭遇时长测量（数据工具，无断言）
//
// 测什么：encounter 节点（波次导演投送）在**带卡牌/商店通道的真局**里一场遭遇多久。
//   与 3D 切片版 `measure-encounter.cjs` 的区别：走 tank_battle.html 的完整 run 链路
//   （存档 → 整备 → 出击 → 节点），玩家有正式血量/卡牌/永久升级，敌人吃 entityMults
//   难度乘子——这是 MS2 门 ①「带卡牌/商店的真局 180~300s」的唯一测量口径。
//
// 驱动方式（与 test-browser-run 同款进入序列）：
//   localStorage 预置存档 → 选择进入 → START → battle；
//   探针玩家 = 自动瞄准最近敌人 + 100ms 击发尝试（两个独立 interval，measure-encounter 教训）。
//   每 0.5s 采样：导演 phase / 波次 / 场上敌人 / 玩家血量 / 击杀 / 最近敌距。
//   结局 = 导演 phase 变 victory/defeat，或玩家死亡（defeat）。
//
// 用法：
//   node scripts/measure-encounter-real.cjs              # 默认 CAP 300s，节点 0
//   CAP=180 NODE=1 node scripts/measure-encounter-real.cjs
//
// 输出：采样摘要 + 时长分解（telegraph/wave/breather 占比）+ 结局。无断言不挂链。

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8141;
const CAP_S = Number(process.env.CAP) || 300;
const NODE_INDEX = Number(process.env.NODE) || 0;
const wait = ms => new Promise(r => setTimeout(r, ms));

function probeOurApi(url, timeoutMs = 1200) {
  return new Promise(resolve => {
    const req = http.get(url, res => { res.resume(); resolve(true); });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port) }), stdio: 'ignore'
    });
    child.on('error', reject);
    setTimeout(() => resolve(child), 900);
  });
}

async function ensureServer() {
  if (await probeOurApi(`http://127.0.0.1:${DEFAULT_PORT}/api/tanks`)) {
    return { base: `http://127.0.0.1:${DEFAULT_PORT}`, child: null };
  }
  return { base: `http://127.0.0.1:${ALT_PORT}`, child: await startServer(ALT_PORT) };
}

(async () => {
  let browser = null;
  let server = null;
  try {
    server = await ensureServer();
    browser = await launchBrowser(chromium, {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push('PAGEERROR: ' + e.message));

    // ---- 进入序列（test-browser-run 同款）----
    // 2026-10-30 修正：键名以 tank_economy 为准（savesMetaKey='rogue-tank-saves-meta'、
    //   槽位键 = saveSlotPrefix+id = 'rogue-tank-save:'+id）。此前写成 'rt_saves_v1' /
    //   'rt_save_<id>' ⇒ 预置存档**从未被读到**，脚本一直跑在默认档上。
    const savesMetaKey = 'rogue-tank-saves-meta';
    const slotKey = 'rogue-tank-save:e2e-real';
    const slotId = 'e2e-real';
    await page.goto(`${server.base}/tank_battle.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(({ savesMetaKey, slotKey, slotId }) => {
      localStorage.setItem(savesMetaKey, JSON.stringify({
        activeSaveId: slotId,
        saves: [{ id: slotId, name: 'E2E-Real', updatedAt: 1 }]
      }));
      localStorage.setItem(slotKey, JSON.stringify({
        version: 1, points: 0, upgrades: {}, stats: { runs: 0, kills: 0 },
        selectedTankId: 'Leapard_1', ammoLoadout: ['ap', 'he', 'heat'],
        bonusRevives: 0, difficultyLevel: 0, settings: {}
      }));
    }, { savesMetaKey, slotKey, slotId });
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await wait(1200);
    await page.evaluate(() => { const b = document.querySelector('.enter-btn'); if (b) b.click(); });
    // 条件等待（r4 #J4 教训：固定等待在慢帧机器上会赌输时序）
    const inLoadout = await page.waitForFunction(
      () => !!document.getElementById('loadStartBtn'), null, { timeout: 8000 }
    ).then(() => true).catch(() => false);
    if (!inLoadout) throw new Error('loadout 未就绪（loadStartBtn 未出现）');
    // deploymentReady 依赖 tankListData（fetch 异步）——未就绪时点击被拒绝（CRIT 日志）
    await page.waitForFunction(
      () => { const b = document.getElementById('loadStartBtn'); return b && !b.disabled; },
      null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => { const b = document.getElementById('loadStartBtn'); if (b) b.click(); });
    const inBattle = await page.waitForFunction(
      () => window.__TEST__ && window.__TEST__.flowState() === 'battle', null, { timeout: 25000 }
    ).then(() => true).catch(() => false);
    if (!inBattle) {
      const diag = await page.evaluate(() => ({
        flow: window.__TEST__ ? window.__TEST__.flowState() : 'no-hook',
        loadoutVisible: !!document.getElementById('loadStartBtn'),
      })).catch(() => ({ diag: 'eval-failed' }));
      throw new Error('battle 未就绪（25s 超时）——诊断: ' + JSON.stringify(diag));
    }
    await wait(1500);   // 地面烘焙 + 首帧稳定
    const flowState = await page.evaluate(() => window.__TEST__ ? window.__TEST__.flowState() : null);
    if (flowState !== 'battle') throw new Error('未进入 battle 态：' + flowState);

    // ---- 探针驱动：自动瞄准 + 持续开火（两个独立 interval）----
    await page.evaluate(() => {
      const T = window.__TEST__;
      window.__LOG = [];
      window.__DONE = null;
      // 2026-10-30：开火计数改为包装 firePrimaryShell（与 test-browser-r4 同款）。
      //   旧写法数 `p._lastFireReject === null` —— 该字段只有 dev 路径才写，正式页面恒 undefined
      //   ⇒ 永远数到 0，无法区分「没开火」和「开了没打中」。
      window.__SHOTS = 0;
      const origPrimary = window.firePrimaryShell;
      if (origPrimary) window.firePrimaryShell = function(sh, ...a2){
        if (sh && sh.id === 'player') window.__SHOTS++;
        return origPrimary.apply(this, [sh, ...a2]);
      };
      // 按键边沿控制（避免每帧重复 keydown）：w/a/d 三键状态机
      const keys = { w: false, a: false, d: false };
      const setKey = (k, on) => {
        if (keys[k] === on) return;
        keys[k] = on;
        window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { key: k, bubbles: true }));
      };
      window.__fireId = setInterval(() => {
        try {
          const p = T.player();
          if (!p || p.hp <= 0) return;
          const es = T.entities().filter(e => e.team === 'enemy' && e.hp > 0);
          // 2026-10-30：lineHold 阶段场上无敌人，下一波要等玩家推进过「防线 x − 400」。
          //   旧探针只在有敌人时才动 ⇒ 清完一波就永久卡在 lineHold（测出 270s「无结局」）。
          //   现在无敌人时以**下一道防线**为目标点继续推进。
          let goal = null, bd = Infinity;
          if (es.length) {
            for (const e of es) {
              const d = Math.hypot(e.x - p.x, e.y - p.y);
              if (d < bd) { bd = d; goal = e; }
            }
          } else {
            const enc = T.encounter ? T.encounter() : null;
            const groups = T.encounterAnchors ? T.encounterAnchors() : null;
            if (enc && groups && groups.length) {
              const gi = Math.min(groups.length - 1, (enc.waveIndex || 0) + 1);
              const spots = groups[gi] || [];
              // 取该防线 y 最接近玩家的点位作为推进目标
              let sp = spots[0];
              for (const q of spots) if (Math.abs(q.y - p.y) < Math.abs(sp.y - p.y)) sp = q;
              goal = { x: sp.x, y: sp.y };
              bd = Math.hypot(goal.x - p.x, goal.y - p.y);
            }
          }
          if (!goal) return;
          if (es.length) p.turretAngle = Math.atan2(goal.y - p.y, goal.x - p.x);
          // 推进：敌人躲在防线竖墙后时原地打不到（墙挡弹）——向最近敌推进到 600px 内
          //   （600 > band.max 338 ⇒ 不干扰敌人交战带；600 < 玩家射程 1800 ⇒ 射程内）。
          //   用 keydown 'w' 模拟油门（与 measure-survival 的按键驱动同款）。
          // 2026-10-30 修复：`d` 是 for 块内声明（块作用域）——出循环即 ReferenceError，
          //   探针每次都抛异常 ⇒ 从未开火/推进（300s 无结局的真因）。改用循环外的最近距离 bd。
          // 转向 + 油门：目标方向与车体朝向夹角 >0.15rad 就先转向（a=左/-1、d=右/+1），
          //   对准后踩油门；有敌人时推进到 600px 内（600 > band.max 338 不干扰交战带）。
          const desired = Math.atan2(goal.y - p.y, goal.x - p.x);
          let diff = desired - p.hullAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          setKey('d', diff > 0.15);
          setKey('a', diff < -0.15);
          const wantAdvance = es.length ? (bd > 600) : (bd > 120);
          setKey('w', wantAdvance && Math.abs(diff) < 1.2);
          // battle 页无 __TEST__.fire —— 用左键事件驱动 mouseFireHeld（update 内每帧 tryFirePrimary）。
          //   mousedown→mousedown 按住 100ms 再 up：装填门控在 tryFirePrimary 内部，重复按下无害。
          if (!window.__mouseDown) {
            document.querySelector('canvas').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
            window.__mouseDown = true;
            setTimeout(() => { window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })); window.__mouseDown = false; }, 50);
          }
        } catch (e) { window.__FIRE_ERR = (window.__FIRE_ERR || 0) + 1; window.__FIRE_MSG = String(e && e.message); }
      }, 100);
      window.__logId = setInterval(() => {
        try {
          const T2 = window.__TEST__;
          const enc = T2.encounter ? T2.encounter() : null;
          const p = T2.player();
          const es = T2.entities().filter(e => e.team === 'enemy' && e.hp > 0);
          window.__LOG.push({
            t: Math.round((enc ? enc.elapsed : 0) * 10) / 10,
            phase: enc ? enc.phase : 'none', wave: enc ? enc.waveIndex : -1,
            waveCount: enc ? enc.waveCount : 0,
            enemies: es.length, hp: p ? Math.round(p.hp) : -1,
            maxHp: p && p.stats ? Math.round(p.stats.maxHp) : -1,
            kills: enc ? enc.kills : 0,
            minDist: (es.length && p) ? Math.round(Math.min(...es.map(e => Math.hypot(e.x - p.x, e.y - p.y)))) : -1,
          });
          const playerDead = p && p.hp <= 0;
          const encDone = enc && (enc.phase === 'victory' || enc.phase === 'defeat');
          if ((encDone || playerDead) && !window.__DONE) {
            window.__DONE = {
              outcome: playerDead ? 'player-dead' : enc.phase,
              elapsed: enc ? enc.elapsed : 0,
              kills: enc ? enc.kills : 0,
              waveIndex: enc ? enc.waveIndex : -1,
              waveCount: enc ? enc.waveCount : 0,
            };
            clearInterval(window.__logId); clearInterval(window.__fireId);
          }
        } catch (e) { /* 记录失败不影响主循环 */ }
      }, 500);
    });

    const deadline = Date.now() + CAP_S * 1000;
    let done = null;
    while (Date.now() < deadline) {
      done = await page.evaluate(() => window.__DONE);
      if (done) break;
      await wait(1000);
    }
    const log = await page.evaluate(() => window.__LOG);
    const shots = await page.evaluate(() => window.__SHOTS || 0);
    const fireErr = await page.evaluate(() => ({ n: window.__FIRE_ERR || 0, msg: window.__FIRE_MSG || null }));

    console.log(`=== 正式局遭遇测量（MS2/C2）===`);
    console.log(`节点 ${NODE_INDEX} · CAP ${CAP_S}s · 采样 ${log.length} 条 · 开火 ${shots} 次 · pageerror ${pageErrors.length} · 探针异常 ${fireErr.n}${fireErr.msg ? '（' + fireErr.msg + '）' : ''}`);
    if (pageErrors.length) console.log(pageErrors.slice(0, 5).join('\n'));

    // 时长分解（按 phase 累计）
    {
      const segs = [];
      for (const r of log) {
        const key = r.phase + '#' + r.wave;
        const last = segs[segs.length - 1];
        if (last && last.key === key) last.to = r.t;
        else segs.push({ key, phase: r.phase, wave: r.wave, from: r.t, to: r.t });
      }
      const sum = {};
      for (const g of segs) {
        const d = Math.max(0, g.to - g.from);
        sum[g.phase] = (sum[g.phase] || 0) + d;
      }
      const total = log.length ? log[log.length - 1].t : 0;
      console.log('\n--- 时长分解（按 phase 累计）---');
      for (const k of Object.keys(sum)) {
        const pct = total > 0 ? Math.round(sum[k] / total * 100) : 0;
        console.log(`  ${k.padEnd(10)} ${String(sum[k].toFixed(1)).padStart(7)}s  ${String(pct).padStart(3)}%`);
      }
      const waveS = sum.wave || 0;
      console.log(`  ⇒ 真交战 ${waveS.toFixed(1)}s / 固定开销 ${(total - waveS).toFixed(1)}s / 总 ${total.toFixed(1)}s`);
    }

    // 波次时间线
    const waveSegs = [];
    for (const r of log) {
      const last = waveSegs[waveSegs.length - 1];
      if (last && last.wave === r.wave && last.phase === r.phase) last.to = r.t;
      else waveSegs.push({ wave: r.wave, phase: r.phase, from: r.t, to: r.t });
    }
    console.log('\n--- 波次时间线 ---');
    for (const g of waveSegs) {
      console.log(`  W${g.wave + 1} ${g.phase.padEnd(10)} ${g.from.toFixed(1)}s → ${g.to.toFixed(1)}s`);
    }

    if (done) {
      const m = Math.floor(done.elapsed / 60), sec = Math.round(done.elapsed % 60);
      console.log(`\n结局: ${done.outcome} · 遭遇 ${m}分${sec}秒（elapsed=${done.elapsed.toFixed(1)}s）`
        + ` · 击杀 ${done.kills} · 波次 ${done.waveIndex + 1}/${done.waveCount}`);
      console.log(`对照口径：MS2 门 ① 带卡牌/商店的真局一场 180~300s。`);
      // 对照：中位血量
      const hps = log.map(r => r.hp).filter(v => v >= 0);
      if (hps.length) {
        console.log(`玩家血量 首末：${hps[0]} → ${hps[hps.length - 1]}（maxHp ${log[0].maxHp}）`);
      }
    } else {
      console.log(`\n${CAP_S}s 内无结局（可能卡住；见日志末段 phase）`);
      const tail = log.slice(-5);
      for (const r of tail) console.log(`  t=${r.t} ${r.phase} W${r.wave + 1} 敌${r.enemies} hp=${r.hp}`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    if (server && server.child) server.child.kill();
  }
})();
