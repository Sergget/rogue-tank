// scripts/measure-encounter.cjs — G1 遭遇时长测量（不是测试链，没有断言，只产出数据）
//
// 为什么需要它：G1 的验收门写着「能玩 3～5 分钟」，但所有自动化链都用 `killAllEnemies()`
// 跳波推进（`test-browser-encounter.cjs` 用了 3 处），**没有一条测过「一局到底多久」**。
// 2026-10-28 用它测出实测只有 41.4 秒（见 docs/ISSUES.md #AB10），此前无人发现。
//
// 用法:
//   node scripts/measure-encounter.cjs            # 自动瞄准 + 持续开火、不走位不修车
//   REVERSE=1 node scripts/measure-encounter.cjs  # 同上，外加持续倒车（对比机动收益）
//   CAP=240 node scripts/measure-encounter.cjs    # 采样上限秒数（默认 180）
//
// 输出: 每 5 秒一条状态行（阶段 / 波次 / 场上敌人 / 血量 / 击杀 / 最近敌人距离）+ 结局汇总。
// 说明: 「玩家」由探针驱动（炮塔指向最近敌人 + 100ms 一次的 `__TEST3D__.fire()`），
//       不写任何 encounter 状态，因此不改变被测量的行为。
'use strict';

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8135;
const CAP_S = Number(process.env.CAP) || 180;
const WANT_REVERSE = process.env.REVERSE === '1';
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
      cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore',
    });
    const api = `http://127.0.0.1:${port}/api/tanks`;
    const deadline = Date.now() + 10000;
    const poll = async () => {
      if (await probeOurApi(api, 800)) { resolve(child); return; }
      if (child.exitCode !== null) { reject(new Error(`server.js exited early (${child.exitCode})`)); return; }
      if (Date.now() > deadline) { reject(new Error('server.js not ready')); return; }
      setTimeout(poll, 400);
    };
    poll();
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
    await page.goto(`${server.base}/tank_3d.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__TEST3D__ && window.__TEST3D__.ready === true, null, { timeout: 30000 });

    console.log('开局：自动瞄准最近敌人并持续开火'
      + (WANT_REVERSE ? '、持续倒车' : '、不走位') + '、不修车');

    // 开火与记录用**两个独立 interval**：记录逻辑一旦抛错，绝不能连带跳过结局检测
    // （第一版把两者写在一起，异常导致「8 分钟无结局」的假象，白查了一轮）。
    await page.evaluate((rev) => {
      const T = window.__TEST3D__;
      window.__LOG = [];
      window.__SHOTS = 0;
      window.__DONE = null;
      window.__revOn = false;
      window.__fireId = setInterval(() => {
        try {
          const p = T.player();
          if (!p || p.hp <= 0) return;
          if (rev && !window.__revOn) {
            window.__revOn = true;
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
          }
          const es = T.entities().filter(e => e.team === 'enemy' && e.hp > 0);
          if (!es.length) return;
          let best = null, bd = Infinity;
          for (const e of es) {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < bd) { bd = d; best = e; }
          }
          p.turretAngle = Math.atan2(best.y - p.y, best.x - p.x);
          T.setMouse(best.x, best.y);
          if (T.fire()) window.__SHOTS++;
        } catch (e) { /* 单次击发失败不影响测量 */ }
      }, 100);
      window.__logId = setInterval(() => {
        try {
          const T2 = window.__TEST3D__;
          const enc = T2.encounter();
          const p = T2.player();
          const es = T2.entities().filter(e => e.team === 'enemy' && e.hp > 0);
          window.__LOG.push({
            t: Math.round((enc.elapsed || 0) * 10) / 10,
            phase: enc.phase || 'none', wave: enc.waveIndex || 0,
            enemies: es.length, hp: p ? Math.round(p.hp) : -1, kills: enc.kills || 0,
            minDist: (es.length && p) ? Math.round(Math.min(...es.map(e => Math.hypot(e.x - p.x, e.y - p.y)))) : -1,
          });
          if (enc.outcome && !window.__DONE) {
            window.__DONE = {
              outcome: enc.outcome, elapsed: enc.elapsed, kills: enc.kills,
              cleared: enc.stats ? enc.stats.wavesCleared : null,
              hpPct: enc.stats ? enc.stats.hpPct : null,
              grade: enc.stats ? enc.stats.grade : null,
            };
            clearInterval(window.__logId); clearInterval(window.__fireId);
          }
        } catch (e) { /* 记录失败不影响主循环 */ }
      }, 500);
    }, WANT_REVERSE);

    const deadline = Date.now() + CAP_S * 1000;
    let done = null;
    while (Date.now() < deadline) {
      done = await page.evaluate(() => window.__DONE);
      if (done) break;
      await wait(1000);
    }
    const log = await page.evaluate(() => window.__LOG);
    const shots = await page.evaluate(() => window.__SHOTS);

    console.log(`\n采样 ${log.length} 条（0.5s 间隔），开火 ${shots} 次`);
    for (let i = 0; i < log.length; i++) {
      const r = log[i];
      if (i % 10 === 0 || i >= log.length - 12) {
        console.log(`  t=${String(r.t).padStart(6)}s ${String(r.phase).padEnd(9)} W${r.wave + 1}`
          + ` 敌${String(r.enemies).padStart(2)} hp=${String(r.hp).padStart(4)} 杀${r.kills}`
          + ` 最近敌${r.minDist}px`);
      }
    }
    if (done) {
      const m = Math.floor(done.elapsed / 60), s = Math.round(done.elapsed % 60);
      console.log(`\n结局: ${done.outcome} · 用时 ${m}分${s}秒（elapsed=${done.elapsed.toFixed(1)}s）`
        + ` · 击杀 ${done.kills} · 清波 ${done.cleared}`
        + ` · 剩余装甲 ${done.hpPct === null ? 'n/a' : Math.round(done.hpPct * 100) + '%'}`
        + ` · 评级 ${done.grade}`);
      console.log('对照口径：G1 验收门是 3～5 分钟（180~300s）。');
    } else {
      console.log(`\n${CAP_S}s 内无结局（可能卡住，见 docs/ISSUES.md #AB3）`);
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
