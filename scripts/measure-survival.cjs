'use strict';

// scripts/measure-survival.cjs — 生存差测量（MS1 门 ③ / B5，数据工具，没有断言）
//
// 测什么：**同一张图、同一套波次**下，三种走位政策的存活时间之比。
//   门 ③ 要求「站桩 vs 走位」≥ **2×** —— 这是支柱 P1「决策可见」的可测判据：
//   如果站着和绕着走活一样久，那么「走位」这个决策就不存在。
//
// 三种政策（都由探针按键驱动，不写任何 encounter 状态）：
//   stand   站桩：只瞄准开火，不给移动输入
//   strafe  侧向环绕：按住 A/D 交替，持续横移
//   reverse 倒车：按住 S 持续后撤
//
// 用法：
//   node scripts/measure-survival.cjs              # 每政策 3 次，输出中位生存秒与比值
//   RUNS=5 CAP=120 node scripts/measure-survival.cjs
//
// 读法：
//   · 三组中位生存秒落在 0.8~1.2 区间 ⇒ 走位不影响生死，门 ③ 不达标（现状 1.02×）；
//   · 出现 ≥2× 才算过。**未过不自行加机制**（PLAN §2.8 B5：交 creative-director 裁定）。
//   · 探针驱动的是真实 3D 页面，地图与波次由页面内的固定 `SEED` 决定 ⇒ 三组面对同一张图；
//     唯一的运行间差异是 AI 的 `Math.random`，故每政策跑多次取中位数。

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8136;
const CAP_S = Number(process.env.CAP) || 120;
const RUNS = Number(process.env.RUNS) || 3;
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
    setTimeout(() => resolve({ child, base: `http://127.0.0.1:${port}` }), 900);
  });
}

async function ensureServer() {
  for (const port of [DEFAULT_PORT, ALT_PORT]) {
    if (await probeOurApi(`http://127.0.0.1:${port}/tank_3d.html`)) {
      return { child: null, base: `http://127.0.0.1:${port}` };
    }
  }
  return startServer(ALT_PORT);
}

// 跑一次：返回 { outcome, elapsed }
async function runOnce(browser, base, policy) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await page.goto(`${base}/tank_3d.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__TEST3D__ && window.__TEST3D__.ready === true, null, { timeout: 30000 });

    await page.evaluate((pol) => {
      const T = window.__TEST3D__;
      window.__DONE = null;
      window.__key = null;
      window.__HP = [];          // 每秒一条 {t, hp, hpPct}
      // 开火与记录用两个独立 interval（measure-encounter 的教训：记录抛错不能跳过结局检测）
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
          T.setMouse(best.x, best.y);
          T.fire();
        } catch (e) { /* 单次击发失败不影响测量 */ }
      }, 100);
      window.__logId = setInterval(() => {
        try {
          const enc = T.encounter();
          const p2 = T.player();
          if (p2) window.__HP.push({ t: Math.round((enc && enc.elapsed || 0) * 10) / 10,
                                     hp: Math.max(0, p2.hp), hpPct: p2.stats ? p2.hp / p2.stats.maxHp : 0 });
          if (enc && enc.outcome && !window.__DONE) {
            window.__DONE = { outcome: enc.outcome, elapsed: enc.elapsed, hp: window.__HP.slice() };
            clearInterval(window.__logId); clearInterval(window.__fireId);
          }
        } catch (e) { /* 记录失败不影响主循环 */ }
      }, 1000);

      // 走位输入：按住键即可（页面输入控制器按 keydown/keyup 维护按住态）
      if (pol !== 'stand') {
        const press = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
        const release = (k) => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
        if (pol === 'reverse') press('s');
        if (pol === 'strafe') {
          // 侧向环绕：每 2.5s 换一次方向，避免一直顶同一侧边界
          let dir = 'a';
          press(dir);
          window.__key = setInterval(() => {
            try {
              release(dir);
              dir = (dir === 'a') ? 'd' : 'a';
              press(dir);
            } catch (e) { /* 忽略 */ }
          }, 2500);
        }
      }
    }, policy);

    const deadline = Date.now() + CAP_S * 1000;
    let done = null;
    while (Date.now() < deadline) {
      done = await page.evaluate(() => window.__DONE);
      if (done) break;
      await wait(250);
    }
    if (done) return done;
    const hp = await page.evaluate(() => window.__HP || []);
    return { outcome: 'timeout', elapsed: CAP_S, hp };
  } finally {
    await page.close();
  }
}

// 首次掉血时刻（秒）：比「30s 时血量」有判别力得多——实测三政策在 30s 都还是满血，
// 那条读数完全没有区分度（2026-10-29 实测 98~100%）。
const firstDamageAt = (hp) => {
  if (!Array.isArray(hp) || !hp.length) return null;
  for (const r of hp) if (r.hpPct < 0.99) return r.t;
  return null;
};
const fmtPct = (v) => (v === null || v === undefined) ? 'n/a' : Math.round(v * 100) + '%';

const median = (arr) => {
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

(async () => {
  let browser = null;
  let server = null;
  try {
    server = await ensureServer();
    browser = await launchBrowser(chromium, {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });

    const policies = ['stand', 'strafe', 'reverse'];
    const results = {};
    for (const pol of policies) {
      const runs = [];
      const hpAt = [];
      for (let i = 0; i < RUNS; i++) {
        const r = await runOnce(browser, server.base, pol);
        runs.push(r.elapsed);
        hpAt.push(firstDamageAt(r.hp));
        console.log(`  ${pol.padEnd(8)} #${i + 1}  ${r.outcome.padEnd(8)} ${r.elapsed.toFixed(1)}s`
          + `  首次掉血=${(firstDamageAt(r.hp) ?? 'n/a')}s`);
      }
      results[pol] = { runs, med: median(runs), hpAt, hpMed: (function(){ const v = hpAt.filter(x => x !== null); return v.length ? median(v) : 0; })() };
    }

    console.log('\n--- 中位生存秒 ---');
    for (const pol of policies) {
      console.log(`  ${pol.padEnd(8)} ${results[pol].med.toFixed(1)}s   （样本 ${results[pol].runs.map(v => v.toFixed(0)).join(' / ')}）`);
    }

    const base = Math.max(0.1, results.stand.med);
    const strafeRatio = results.strafe.med / base;
    const reverseRatio = results.reverse.med / base;
    console.log('\n--- 门 ③：走位 vs 站桩 生存时间比（目标 ≥ 2×）---');
    console.log(`  strafe  / stand = ${strafeRatio.toFixed(2)}×`);
    console.log(`  reverse / stand = ${reverseRatio.toFixed(2)}×`);
    const best = Math.max(strafeRatio, reverseRatio);
    console.log(best >= 2
      ? `  ⇒ 达标（最佳 ${best.toFixed(2)}×）`
      : `  ⇒ **不达标**（最佳 ${best.toFixed(2)}×）——按 PLAN §2.8 B5，未过不自行加机制，交 creative-director 裁定`);
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    if (server && server.child) server.child.kill();
  }
})();
