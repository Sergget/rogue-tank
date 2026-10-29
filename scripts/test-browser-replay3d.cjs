// scripts/test-browser-replay3d.cjs — 3D 确定性回放链（MS1 门 ⑥ / B6，2026-10-29）
//
// 验什么：同一 seed + 同一输入序列（这里是「无输入」），两次独立加载推进同样步数后，
//   **模拟层摘要必须逐字节一致**；换 seed 必须分化。
//
// 口径边界（写清楚，否则这条链会被误读成「画面也确定了」）：
//   · 摘要只取模拟层：id / x / y / 车体角 / 炮塔角 / 装填剩余 / 血量；
//   · **粒子、震屏、烟尘等纯视觉随机不在口径内**（它们不影响判定，仍走 Math.random）；
//   · 页面必须用 `?seed=N&fixed=1` 打开：fixed 关掉 rAF 主循环，时间只由
//     `__TEST3D__.step(n)` 推进；seed 把 AI 与开火散布收进同一条种子流。
//
// 用法: node scripts/test-browser-replay3d.cjs
// 退出码: 0=全过 / 1=断言失败 / 2=脚本异常
'use strict';

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8126;
const STEPS = 600;          // 5s @ 1/120 —— 足够覆盖 telegraph → 首波 spawn → 交战

const FAILS = [];
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
  if (!ok) FAILS.push(name);
}

function probeOurApi(url, timeoutMs = 1500) {
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
  if (await probeOurApi(`http://127.0.0.1:${DEFAULT_PORT}/tank_3d.html`)) {
    return { base: `http://127.0.0.1:${DEFAULT_PORT}`, child: null };
  }
  return { base: `http://127.0.0.1:${ALT_PORT}`, child: await startServer(ALT_PORT) };
}

async function runReplay(browser, base, seed) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  try {
    await page.goto(`${base}/tank_3d.html?seed=${seed}&fixed=1`, { waitUntil: 'load', timeout: 30000 });
    const ready = await page.waitForFunction(
      () => window.__TEST3D__ && window.__TEST3D__.ready === true, null, { timeout: 30000 }
    ).then(() => true).catch(() => false);
    if (!ready) return { ready: false, errors };
    const r = await page.evaluate((n) => {
      const T = window.__TEST3D__;
      const out = T.step(n);
      return { digest: T.digest(), steps: out.steps, simMs: out.simMs, outcome: out.outcome,
               state: T.state() };
    }, STEPS);
    return Object.assign({ ready: true, errors }, r);
  } finally {
    await page.close();
  }
}

(async () => {
  let browser = null;
  let server = null;
  try {
    server = await ensureServer();
    browser = await launchBrowser(chromium, {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });

    const a1 = await runReplay(browser, server.base, 12345);
    check('定步回放页面启动（?seed=&fixed=1）', a1.ready, JSON.stringify(a1.errors));
    if (!a1.ready) throw new Error('页面未就绪：' + JSON.stringify(a1.errors));

    check(`推进 ${STEPS} 步（simMs=${a1.simMs}）`, a1.steps === STEPS, `steps=${a1.steps}`);
    check('摘要非空（实体确实参与了模拟）', !!a1.digest && a1.digest.length > 20,
      `len=${(a1.digest || '').length} · 实体 ${a1.state && a1.state.entities}`);
    check('无 pageerror', a1.errors.length === 0, JSON.stringify(a1.errors));

    const a2 = await runReplay(browser, server.base, 12345);
    check('同 seed 第二次加载：摘要逐字节一致', a2.digest === a1.digest,
      a2.digest === a1.digest ? 'identical' : 'diverged');

    const b1 = await runReplay(browser, server.base, 99999);
    check('不同 seed：摘要必须分化（否则 seed 没接上）', b1.digest !== a1.digest,
      b1.digest === a1.digest ? 'identical（seed 未生效）' : 'diverged');
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    if (server && server.child) server.child.kill();
    if (process.exitCode === undefined || process.exitCode === 0) {
      if (FAILS.length) { process.exitCode = 1; console.log(`\n失败 ${FAILS.length} 项：${FAILS.join(' / ')}`); }
      else console.log('\n全部通过');
    }
  }
})();
