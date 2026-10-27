// scripts/browser-baseline3d.cjs — G1 / R1 3D 场景截图 + 帧时间基线
//
// 用法:
//   node scripts/browser-baseline3d.cjs --write   # 记录基线到 tmp/render-baseline3d/
//   node scripts/browser-baseline3d.cjs --check   # 与基线比对（默认）
//
// 固定条件：tank_3d.html、1280×720、固定相机（pitch 0.95 / distance 1150）、
//   进入即冻结模拟（setTimeScale 0），只采样绘制与首帧场景。
// 判定：canvas 32×18 网格（容差 mean≤2 / max≤16）；帧时间与堆占用只记录、不判定。
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');
const { GRID_W, GRID_H, compareScene, validateBaseline } = require('./lib/render-baseline.cjs');
const { summarizeMs } = require('../js/tank_perf.js');

const ROOT = path.join(__dirname, '..');
const VIEWPORT = { width: 1280, height: 720 };
const OUT_DIR = path.join(ROOT, 'tmp', 'render-baseline3d');
const BASELINE_PATH = path.join(OUT_DIR, 'baseline.json');
const PERF_FRAMES = 120;
const wait = ms => new Promise(r => setTimeout(r, ms));

function parseArgs(argv) {
  const opts = { mode: 'check', port: 0 };
  for (const a of argv.slice(2)) {
    if (a === '--write') opts.mode = 'write';
    else if (a === '--check') opts.mode = 'check';
    else if (a.startsWith('--port=')) opts.port = Number(a.slice(7)) | 0;
    else throw new Error('未知参数: ' + a);
  }
  return opts;
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
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });
    const deadline = Date.now() + 10000;
    const poll = async () => {
      if (await probeOurApi(`http://127.0.0.1:${port}/api/tanks`, 800)) { resolve(child); return; }
      if (child.exitCode !== null) { reject(new Error(`server.js exited early (${child.exitCode})\n${log}`)); return; }
      if (Date.now() > deadline) { reject(new Error(`server.js not ready\n${log}`)); return; }
      setTimeout(poll, 400);
    };
    poll();
  });
}

async function ensureServer(port) {
  if (await probeOurApi('http://127.0.0.1:8000/api/tanks')) {
    return { base: 'http://127.0.0.1:8000', child: null };
  }
  const p = port || 8128;
  return { base: `http://127.0.0.1:${p}`, child: await startServer(p) };
}

async function captureMetrics(page) {
  return page.evaluate(({ gw, gh }) => {
    const c = document.getElementById('c');
    if (!c) throw new Error('找不到 #c');
    const g = document.createElement('canvas');
    g.width = gw; g.height = gh;
    const gx = g.getContext('2d', { willReadFrequently: true });
    gx.drawImage(c, 0, 0, gw, gh);
    const d = gx.getImageData(0, 0, gw, gh).data;
    const grid = [];
    const luma = new Array(16).fill(0);
    for (let i = 0; i < gw * gh; i++) {
      const o = i * 4;
      const r = d[o], gg = d[o + 1], b = d[o + 2];
      grid.push([r, gg, b]);
      const L = Math.round(0.2126 * r + 0.7152 * gg + 0.0722 * b);
      luma[Math.min(15, L >> 4)]++;
    }
    return { size: [c.width, c.height], grid, luma };
  }, { gw: GRID_W, gh: GRID_H });
}

async function sampleFrameTimes(page, frames) {
  const stamps = await page.evaluate(async n => {
    const ts = [];
    await new Promise(resolve => {
      let i = 0;
      const tick = t => { ts.push(t); if (++i >= n) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    return ts;
  }, frames);
  const deltas = [];
  for (let i = 1; i < stamps.length; i++) deltas.push(stamps[i] - stamps[i - 1]);
  return summarizeMs(deltas, deltas.length);
}

async function main() {
  const opts = parseArgs(process.argv);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let baseline = null;
  if (opts.mode === 'check') {
    if (!fs.existsSync(BASELINE_PATH)) { console.error('找不到基线，先运行 --write'); process.exit(2); }
    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const v = validateBaseline(baseline);
    if (!v.ok) { console.error('基线无效：' + v.reason); process.exit(2); }
  }

  const server = await ensureServer(opts.port);
  let browser = null;
  try {
    browser = await launchBrowser(chromium);
    const page = await browser.newPage({ viewport: VIEWPORT });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !String(m.text()).includes('Failed to load resource')) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

    await page.goto(`${server.base}/tank_3d.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__TEST3D__ && window.__TEST3D__.ready === true, null, { timeout: 30000 });
    // G1（2026-10-28）：敌人改由波次投放，进入即冻结会拍到「空战场」——那样基线就失去了
    // 「记录一场真实战斗画面」的意义。先等首波入场（telegraph → spawn）再冻结。
    await page.waitForFunction(
      () => window.__TEST3D__.encounter && window.__TEST3D__.encounter().enemyAlive > 0,
      null, { timeout: 15000 }
    ).catch(() => {});
    await wait(500);
    await page.evaluate(() => {
      window.__TEST3D__.setTimeScale(0);
      window.__TEST3D__.setCamera({ pitch: 0.95, distance: 1150 });
    });
    await wait(300);
    const metrics = await captureMetrics(page);
    const pngPath = path.join(OUT_DIR, 'scene.png');
    await page.locator('#c').screenshot({ path: pngPath });
    await page.evaluate(() => window.__TEST3D__.setTimeScale(1));
    const frame = await sampleFrameTimes(page, PERF_FRAMES);
    const state = await page.evaluate(() => window.__TEST3D__.state());
    const mem = await page.evaluate(() => window.__TEST3D__.mem());
    const result = { size: metrics.size, grid: metrics.grid, luma: metrics.luma, frame, mem, state, errors };

    if (opts.mode === 'write') {
      const out = {
        version: 1,
        viewport: [VIEWPORT.width, VIEWPORT.height],
        scene: 'tank_3d',
        createdAt: new Date().toISOString(),
        scenes: { scene: { size: result.size, grid: result.grid, luma: result.luma, frame, mem, state } },
      };
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
      console.log(`3D 基线已写入 ${path.relative(ROOT, BASELINE_PATH)}`);
      console.log(`frame p50=${frame.p50}ms p95=${frame.p95}ms · entities=${state.entities} · mem=${mem ? mem.usedMB + 'MB' : 'n/a'}`);
      if (errors.length) console.log('控制台错误:', errors.slice(0, 3));
      process.exit(0);
    }

    const cmp = compareScene(baseline.scenes.scene, result);
    const g = cmp.grid || {};
    console.log(`${cmp.ok ? 'PASS' : 'FAIL'} | 3D scene | mean=${g.meanDelta} max=${g.maxDelta}` +
      (cmp.ok ? '' : ' | ' + cmp.failures.join('; ')));
    console.log(`frame p50=${frame.p50}ms p95=${frame.p95}ms · entities=${state.entities}`);
    if (errors.length) console.log('提示：控制台错误 ' + errors.length + ' 条（不参与判定）');
    process.exit(cmp.ok ? 0 : 1);
  } finally {
    if (browser) await browser.close();
    if (server.child) server.child.kill();
  }
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(2);
});
