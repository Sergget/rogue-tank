'use strict';

// scripts/probe-survival-spawn.cjs — 生存波次敌人生成点实测（数据工具，无断言，不进 npm test）
//
// 验证 2026-10-30 的新生成逻辑（tank_battle.html spawnSurvivalWaveEnemies ~2638）：
//   敌人出生在「玩家为圆心的视口边缘环带」（rMin = max(700, 对角半长×0.9)，
//   rMax = max(rMin+100, 对角半长×1.1)），硬下限 700px（协调方 2026-10-30 修订口径），
//   贴掩体重采样（pointInCover padding 40），20 次全败图心兜底。
//
// 三判据（退出码 0=PASS / 1=FAIL / 2=环境异常）：
//   ① 无敌人生成在玩家 700px 内；
//   ② ≥80% 敌人在环带 0.9~1.1×对角半长 ±10% 容差内，或紧邻其外（距离 > 容差上限但 < 1.2×上限，
//      覆盖钳界/掩体重采样被推出的情况）；
//   ③ 无敌人卡掩体：生成后 1s 被推出 >20px 视为卡。
//
// 用法：node scripts/probe-survival-spawn.cjs   [WAVES=2 CAP=120]

const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8147;
const CAP_S = Number(process.env.CAP) || 120;
const WAVES = Number(process.env.WAVES) || 2;
const wait = ms => new Promise(r => setTimeout(r, ms));

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port) }), stdio: 'ignore'
    });
    child.on('error', reject);
    setTimeout(() => resolve(child), 900);
  });
}

function probeOurApi(url, timeoutMs = 1200) {
  return new Promise(resolve => {
    const http = require('http');
    const req = http.get(url, res => { res.resume(); resolve(true); });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

(async () => {
  let browser = null;
  let server = null;
  let exitCode = 2;
  try {
    if (await probeOurApi(`http://127.0.0.1:${DEFAULT_PORT}/api/tanks`)) {
      server = { base: `http://127.0.0.1:${DEFAULT_PORT}`, child: null };
    } else {
      server = { base: `http://127.0.0.1:${ALT_PORT}`, child: await startServer(ALT_PORT) };
    }
    browser = await launchBrowser(chromium, {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push('PAGEERROR: ' + e.message));

    // ---- 进入序列（test-browser-run 同款）----
    const savesMetaKey = 'rt_saves_v1';
    const slotKey = 'rt_save_e2e_spawn';
    const slotId = 'e2e-spawn';
    await page.goto(`${server.base}/tank_battle.html?mode=survival`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(({ savesMetaKey, slotKey, slotId }) => {
      localStorage.setItem(savesMetaKey, JSON.stringify({
        activeSaveId: slotId,
        saves: [{ id: slotId, name: 'E2E-Spawn', updatedAt: 1 }]
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
    await page.waitForFunction(() => !!document.getElementById('loadStartBtn'), null, { timeout: 8000 })
      .then(() => true).catch(() => false);
    await page.waitForFunction(
      () => { const b = document.getElementById('loadStartBtn'); return b && !b.disabled; },
      null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => { const b = document.getElementById('loadStartBtn'); if (b) b.click(); });
    const inBattle = await page.waitForFunction(
      () => window.__TEST__ && window.__TEST__.flowState() === 'battle', null, { timeout: 25000 }
    ).then(() => true).catch(() => false);
    if (!inBattle) throw new Error('battle 未就绪（25s 超时）');
    await wait(1500);

    // ---- 探针：开火（击杀推进波次）与记录两个独立 interval ----
    await page.evaluate(() => {
      const T = window.__TEST__;
      window.__SPAWN_LOG = [];     // 每个敌人的出生快照（spawn 时第一帧看到它）
      window.__FRAME = [];         // 出生点稳定性观察：id → [{t,x,y}]
      window.__WAVE_DONE = null;
      const seen = new Set();
      window.__fireId = setInterval(() => {
        try {
          const p = T.player();
          if (!p || p.hp <= 0) return;
          const es = T.entities().filter(e => e.team === 'enemy' && e.hp > 0);
          if (!es.length) return;
          let best = null, bd = Infinity;
          for (const e of es) {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < bd) { bd = d; best = e; }
          }
          p.turretAngle = Math.atan2(best.y - p.y, best.x - p.x);
          if (!window.__mouseDown) {
            document.querySelector('canvas').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
            window.__mouseDown = true;
            setTimeout(() => { window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })); window.__mouseDown = false; }, 50);
          }
        } catch (e) { /* 单次失败不影响 */ }
      }, 100);
      window.__recId = setInterval(() => {
        try {
          const T2 = window.__TEST__;
          const p = T2.player();
          if (!p) return;
          const cam = T2.cam();
          const now = performance.now();
          for (const e of T2.entities()) {
            if (e.team !== 'enemy' || e.isBoss || !e.survivalWaveSpawn) continue;
            if (!seen.has(e.id)) {
              seen.add(e.id);
              window.__SPAWN_LOG.push({
                id: e.id, wave: e.survivalWaveSpawn ? 1 : 0,
                x: e.x, y: e.y, px: p.x, py: p.y,
                dist: Math.round(Math.hypot(e.x - p.x, e.y - p.y)),
                t: now,
              });
              window.__FRAME[e.id] = [{ x: e.x, y: e.y, t: now }];
            } else if (window.__FRAME[e.id].length < 40) {
              window.__FRAME[e.id].push({ x: e.x, y: e.y, t: now });
            }
          }
          const playerDead = p.hp <= 0;
          if (playerDead && !window.__WAVE_DONE) {
            window.__WAVE_DONE = { outcome: 'player-dead' };
            clearInterval(window.__recId); clearInterval(window.__fireId);
          }
        } catch (e) { /* 忽略 */ }
      }, 200);
    });

    // 等待 CAP 秒或死亡；期间尽量把波次推完
    const deadline = Date.now() + CAP_S * 1000;
    let wavesSeen = 1;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => ({
        done: window.__WAVE_DONE,
        wave: (window.__SPAWN_LOG || []).length,
        hp: (window.__TEST__ && window.__TEST__.player() && window.__TEST__.player().hp) || 0,
        prep: !!(window.__TEST__ && (() => { try { return document.getElementById('survivalWaveHud').textContent; } catch(e){ return ''; } })()),
      })).catch(() => null);
      if (!st || st.done) break;
      await wait(1000);
    }

    const spawnLog = await page.evaluate(() => window.__SPAWN_LOG || []);
    const frames = await page.evaluate(() => window.__FRAME || {});
    if (pageErrors.length) console.log(pageErrors.slice(0, 5).join('\n'));

    // ---- 统计 ----
    // 视口半幅：1280×720 zoom 由页面读；对角半长 = hypot(hw, hh)
    const camInfo = await page.evaluate(() => {
      const cam = window.__TEST__.cam();
      return { vw: cam.vw, vh: cam.vh, zoom: cam.zoom };
    }).catch(() => null);
    const zoom = (camInfo && camInfo.zoom) || 1;
    const hw = 1280 / 2 / zoom, hh = 720 / 2 / zoom;
    const diagHalf = Math.hypot(hw, hh);
    const bandLo = diagHalf * 0.9 * 0.9;   // 0.9 基准 ±10% 容差 → [0.81, 0.99]×diagHalf
    const bandHi = diagHalf * 0.9 * 1.1;
    const nearOuter = diagHalf * 0.9 * 1.2;  // 紧邻其外上限

    console.log(`=== 生存波次生成点实测（probe-survival-spawn）===`);
    console.log(`zoom=${zoom.toFixed(2)} 半宽=${hw.toFixed(0)} 半高=${hh.toFixed(0)} 对角半长=${diagHalf.toFixed(0)} → 理论环带 [${Math.max(700, diagHalf*0.9).toFixed(0)}, ${Math.max(800, diagHalf*1.1).toFixed(0)}]`);
    console.log(`样本 ${spawnLog.length} 个敌人生成点`);

    let n = 0, minD = Infinity, maxD = 0, sumD = 0;
    let inBand = 0, nearOut = 0, tooClose = 0;
    const perWave = {};
    for (const s of spawnLog) {
      n++;
      minD = Math.min(minD, s.dist); maxD = Math.max(maxD, s.dist); sumD += s.dist;
      const w = 'w' + (s.id.split('_')[1] || '?');
      perWave[w] = perWave[w] || { n: 0, min: Infinity, max: 0 };
      perWave[w].n++; perWave[w].min = Math.min(perWave[w].min, s.dist); perWave[w].max = Math.max(perWave[w].max, s.dist);
      if (s.dist < 700) tooClose++;
      else if (s.dist >= bandLo && s.dist <= bandHi) inBand++;
      else if (s.dist > bandHi && s.dist <= nearOuter) nearOut++;
    }
    console.log(`\n--- 判据 ①：无敌人生成在 700px 内 ---`);
    console.log(`  <700px 的生成点：${tooClose}/${n}  min 距离=${minD}px  ${tooClose === 0 ? 'PASS' : 'FAIL'}`);
    console.log(`\n--- 判据 ②：≥80% 在环带 [${bandLo.toFixed(0)}, ${bandHi.toFixed(0)}]（±10% 容差）或紧邻其外（≤${nearOuter.toFixed(0)}）---`);
    console.log(`  环带内=${inBand}  紧邻外=${nearOut}  更远（钳界/兜底）=${n - tooClose - inBand - nearOut}  <700=${tooClose}`);
    const okPct = n ? (inBand + nearOut) / n * 100 : 0;
    console.log(`  达标率=${okPct.toFixed(1)}%  ${okPct >= 80 ? 'PASS' : 'FAIL'}`);
    console.log(`\n--- 判据 ③：无敌人卡掩体（1s 内被推出 >20px 视为卡）---`);
    let stuck = 0;
    for (const id of Object.keys(frames)) {
      const fr = frames[id];
      const first = fr[0];
      const oneSec = fr.filter(f => f.t - first.t <= 1000);
      const last1s = oneSec[oneSec.length - 1];
      if (!last1s) continue;
      const pushed = Math.hypot(last1s.x - first.x, last1s.y - first.y);
      if (pushed > 20) { stuck++; console.log(`  卡掩体：${id} 首秒位移 ${pushed.toFixed(0)}px`); }
    }
    console.log(`  卡掩体数：${stuck}/${Object.keys(frames).length}  ${stuck === 0 ? 'PASS' : 'FAIL'}`);
    console.log(`\n--- 按波距离分布 ---`);
    for (const w of Object.keys(perWave).sort()) {
      console.log(`  ${w}: n=${perWave[w].n} min=${perWave[w].min} max=${perWave[w].max}`);
    }
    console.log(`  总体: mean=${n ? (sumD / n).toFixed(0) : '-'} min=${n ? minD : '-'} max=${n ? maxD : '-'}`);
    console.log(`\n出生明细（前 12）:`);
    for (const s of spawnLog.slice(0, 12)) {
      console.log(`  ${s.id}  d=${s.dist}  at=(${Math.round(s.x)},${Math.round(s.y)})  player=(${Math.round(s.px)},${Math.round(s.py)})`);
    }

    exitCode = (tooClose === 0 && okPct >= 80 && stuck === 0) ? 0 : 1;
  } catch (err) {
    console.error('PROBE-ERROR: ' + (err && err.message || err));
    exitCode = 2;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server && server.child) server.child.kill();
  }
  process.exit(exitCode);
})();
