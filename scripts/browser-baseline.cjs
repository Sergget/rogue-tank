'use strict';
// scripts/browser-baseline.cjs — R0 / I3：固定场景截图 + 性能基线
//
// 用法:
//   node scripts/browser-baseline.cjs --write          # 记录基线到 tmp/render-baseline/
//   node scripts/browser-baseline.cjs --check          # 与基线比对（默认模式）
//   node scripts/browser-baseline.cjs --write --scene=boss
//   node scripts/browser-baseline.cjs --out=tmp/my-baseline
//
// 固定条件：1280×720 / deviceScaleFactor=1 / seed=20261027 / Math.random 固定序列。
// 采集内容：canvas 32×18 降采样网格 + 亮度直方图 + update/draw 帧时间 + JS 堆占用。
//
// 为什么比对网格而不是 PNG 字节：不同 GPU / 字体 / 抗锯齿会让 PNG 字节全变，
// 而 32×18 平均色对渲染管线差异不敏感、对「画面结构变了」敏感。
// 基线是本地产物（tmp/ 已 gitignore）：CI 不跑浏览器链，跨机器基线不可移植。
//
// 退出码: 0=通过/已写入 / 1=与基线不符 / 2=脚本异常 / 86=环境拒绝 spawn（见 lib/browser-launch）

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');
const { GRID_W, GRID_H, compareScene, validateBaseline } = require('./lib/render-baseline.cjs');

const ROOT = path.join(__dirname, '..');
const VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_SEED = 20261027;
const PERF_FRAMES = 120;     // 性能采样帧数（rAF 驱动）

const SCENES = [
  { name: 'standard', mode: '' },
  { name: 'boss', mode: 'boss' },
  { name: 'survival', mode: 'survival' },
];

// ---------- 参数 ----------
function parseArgs(argv) {
  const opts = { mode: 'check', out: path.join('tmp', 'render-baseline'), seed: DEFAULT_SEED, scenes: null, port: 0 };
  for (const a of argv.slice(2)) {
    if (a === '--write') opts.mode = 'write';
    else if (a === '--check') opts.mode = 'check';
    else if (a.startsWith('--out=')) opts.out = a.slice(6);
    else if (a.startsWith('--seed=')) opts.seed = Number(a.slice(7)) | 0;
    else if (a.startsWith('--port=')) opts.port = Number(a.slice(7)) | 0;
    else if (a.startsWith('--scene=')) opts.scenes = a.slice(8).split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else throw new Error('未知参数: ' + a);
  }
  if (!isFinite(opts.seed)) throw new Error('--seed 必须是有限数值');
  return opts;
}

function printHelp() {
  console.log([
    'node scripts/browser-baseline.cjs [--write|--check] [--scene=a,b] [--seed=N] [--out=dir] [--port=N]',
    '  --write   记录基线（PNG + baseline.json）',
    '  --check   与基线比对（默认）',
    '  --scene   只跑指定场景（standard / boss / survival，逗号分隔）',
  ].join('\n'));
}

// ---------- 本地服务 ----------
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

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
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
    const api = `http://127.0.0.1:${port}/api/tanks`;
    const deadline = Date.now() + 10000;
    const poll = async () => {
      if (await probeOurApi(api, 800)) { resolve(child); return; }
      if (child.exitCode !== null) { reject(new Error(`server.js 提前退出（code ${child.exitCode}）\n${log}`)); return; }
      if (Date.now() > deadline) { reject(new Error(`server.js 10s 内未就绪\n${log}`)); return; }
      setTimeout(poll, 400);
    };
    poll();
  });
}

/**
 * 复用已在跑的项目服务，否则在指定端口拉起一个。
 * @returns {Promise<{base:string, child:ChildProcess|null}>}
 */
async function ensureServer(preferredPort) {
  const first = preferredPort || 8000;
  if (await probeOurApi(`http://127.0.0.1:${first}/api/tanks`)) {
    return { base: `http://127.0.0.1:${first}`, child: null };
  }
  const port = preferredPort || 8123;   // 默认避开 8000 上可能存在的非本项目服务
  const child = await startServer(port);
  return { base: `http://127.0.0.1:${port}`, child };
}

// ---------- 页面 ----------
const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * 打开一个场景并推进到战斗态。
 * @param {import('playwright-core').Browser} browser
 * @param {string} base 服务地址
 * @param {{name:string, mode:string}} scene
 * @param {string} tankId 存档用的坦克 id
 * @param {number} seed
 */
async function openScene(browser, base, scene, tankId, seed) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  // 固定 Math.random：Boss 武备、开场扫描方向等仍走 Math.random（种子只固定节点生成）。
  // 页面加载期会消耗不同数量的随机数（贴图 weatherSeed / 卡池等），故在开战前重置序列，
  // 保证「进入战斗时」的随机流位置逐次一致。
  await page.addInitScript(() => {
    let s = 0x9E3779B9 >>> 0;
    Math.random = function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    window.__R0_RESET_RNG = () => { s = 0x9E3779B9 >>> 0; };
  });

  const url = `${base}/tank_battle.html${scene.mode ? '?mode=' + scene.mode : ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const slotId = 'r0-baseline';
  await page.evaluate(({ tankId, slotId }) => {
    localStorage.setItem('rogue-tank-saves-meta', JSON.stringify({
      activeSaveId: slotId,
      saves: [{ id: slotId, name: 'R0-Baseline', updatedAt: 1 }],
    }));
    localStorage.setItem('rogue-tank-save:' + slotId, JSON.stringify({
      version: 1, points: 0, upgrades: {}, stats: { runs: 0, kills: 0 },
      selectedTankId: tankId, ammoLoadout: ['ap', 'he', 'heat'],
      bonusRevives: 0, difficultyLevel: 0, settings: {},
    }));
  }, { tankId, slotId });

  await page.reload({ waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!window.__TEST__, null, { timeout: 15000 });
  await page.evaluate(s => window.__TEST__.setSeed(s), seed);
  await page.evaluate(() => { if (window.__R0_RESET_RNG) window.__R0_RESET_RNG(); });
  // 从进入战斗的第一帧起就不推进模拟：否则「检测到 battle → 冻结」之间的几帧
  // 会随机器负载跑出不同步数，生存模式的波次/巡逻因此每次都落在不同模拟时刻。
  await page.evaluate(() => window.__TEST__.setTimeScale(0));

  const entered = await page.evaluate(() => {
    const btn = document.querySelector('.enter-btn');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!entered) throw new Error(`${scene.name}: 找不到 .enter-btn（Home 存档卡片）`);
  await wait(600);

  const started = await page.evaluate(() => {
    const btn = document.getElementById('loadStartBtn');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!started) throw new Error(`${scene.name}: 找不到 #loadStartBtn`);
  await page.waitForFunction(
    () => window.__TEST__ && window.__TEST__.flowState() === 'battle',
    null,
    { timeout: 30000 }
  );

  const state = await page.evaluate(() => ({
    flow: window.__TEST__.flowState(),
    seed: window.__TEST__.seed(),
    node: window.__TEST__.currentNode(),
    entities: window.__TEST__.entities().length,
  }));
  return { page, context, errors, state };
}

/** 安装可冻结的时钟包装（截图前冻结，采样性能前解冻）。 */
async function installClock(page) {
  await page.evaluate(() => {
    const realPerf = performance.now.bind(performance);
    const realDateNow = Date.now.bind(Date);
    const clock = { frozen: null, dateFrozen: 0 };
    performance.now = () => (clock.frozen === null ? realPerf() : clock.frozen);
    Date.now = () => (clock.frozen === null ? realDateNow() : clock.dateFrozen);
    window.__R0_FREEZE = (t) => {
      clock.frozen = (typeof t === 'number' && isFinite(t)) ? t : realPerf();
      clock.dateFrozen = realDateNow();
    };
    window.__R0_THAW = () => { clock.frozen = null; };
  });
}

/** 等待 n 个 rAF（冻结时钟不影响 rAF 调度）。 */
async function waitFrames(page, n) {
  await page.evaluate(count => new Promise(resolve => {
    let i = 0;
    const tick = () => { if (++i >= count) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), n);
}

/** 采样帧时间 + 堆占用（必须在冻结时钟之前调用）。 */
async function samplePerf(page) {
  return page.evaluate(async frames => {
    window.__TEST__.perf({ reset: true });
    await new Promise(resolve => {
      let n = 0;
      const tick = () => { if (++n >= frames) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    return { perf: window.__TEST__.perf(), mem: window.__TEST__.mem() };
  }, PERF_FRAMES);
}

/** 画布 32×18 降采样网格 + 16 档亮度直方图。 */
async function captureMetrics(page) {
  return page.evaluate(({ gw, gh }) => {
    const c = document.getElementById('c');
    if (!c) throw new Error('找不到 #c 画布');
    const g = document.createElement('canvas');
    g.width = gw;
    g.height = gh;
    const gx = g.getContext('2d', { willReadFrequently: true });
    gx.imageSmoothingEnabled = true;
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

// ---------- 主流程 ----------
async function main() {
  const opts = parseArgs(process.argv);
  const outDir = path.resolve(ROOT, opts.out);
  const baselinePath = path.join(outDir, 'baseline.json');
  const wanted = opts.scenes ? SCENES.filter(s => opts.scenes.includes(s.name)) : SCENES;
  if (!wanted.length) throw new Error('--scene 没有匹配到任何场景');

  let baseline = null;
  if (opts.mode === 'check') {
    if (!fs.existsSync(baselinePath)) {
      console.error(`找不到基线：${baselinePath}\n先运行 --write 记录一次。`);
      process.exit(2);
    }
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const v = validateBaseline(baseline);
    if (!v.ok) {
      console.error(`基线文件无效（${v.reason}）：${baselinePath}`);
      process.exit(2);
    }
    if (baseline.viewport[0] !== VIEWPORT.width || baseline.viewport[1] !== VIEWPORT.height) {
      console.error(`基线视口 ${baseline.viewport.join('x')} ≠ 当前 ${VIEWPORT.width}x${VIEWPORT.height}`);
      process.exit(2);
    }
  }
  if (opts.mode === 'check' && opts.seed !== baseline.seed) {
    console.error(`基线 seed=${baseline.seed} ≠ 当前 ${opts.seed}；换 seed 请重新 --write。`);
    process.exit(2);
  }

  fs.mkdirSync(outDir, { recursive: true });
  // --check 把当前截图写到 current/，避免覆盖 --write 留下的基线图（失败时还能肉眼对比）
  const shotDir = opts.mode === 'write' ? outDir : path.join(outDir, 'current');
  fs.mkdirSync(shotDir, { recursive: true });

  const { base, child } = await ensureServer(opts.port);
  const tanks = await fetchJson(`${base}/api/tanks`);
  const tankId = Object.keys(tanks || {})[0];
  if (!tankId) throw new Error('api/tanks 为空');

  let browser = null;
  const results = {};
  try {
    browser = await launchBrowser(chromium);
    for (const scene of wanted) {
      const { page, context, errors, state } = await openScene(browser, base, scene, tankId, opts.seed);
      try {
        // 截图必须在 t=0 冻结快照上取：先冻结模拟与挂钟，再等首帧绘制完成。
        // 若先跑一段时间再冻结，生存模式的波次/巡逻会让每个场景落在不同模拟时刻。
        await installClock(page);
        const freezeAt = await page.evaluate(() => {
          const start = window.__TEST__.battleStartMs();
          return (typeof start === 'number' && isFinite(start)) ? start + 500 : null;
        });
        await page.evaluate(t => {
          window.__R0_FREEZE(t);
          window.__TEST__.setTimeScale(0);
        }, freezeAt);
        await waitFrames(page, 3);

        const metrics = await captureMetrics(page);
        const pngPath = path.join(shotDir, `${scene.name}.png`);
        await page.locator('#c').screenshot({ path: pngPath });

        // 截图完成后再解冻采性能：此时测的是正常运行的 update/draw 成本。
        await page.evaluate(() => {
          window.__R0_THAW();
          window.__TEST__.setTimeScale(1);
        });
        const perf = await samplePerf(page);

        results[scene.name] = {
          size: metrics.size,
          grid: metrics.grid,
          luma: metrics.luma,
          perf: perf.perf,
          mem: perf.mem,
          state,
          errors,
        };
        const p = perf.perf && perf.perf.draw ? perf.perf.draw : {};
        console.log(
          `[${scene.name}] flow=${state.flow} seed=${state.seed} node=${state.node} ` +
          `entities=${state.entities} draw p50=${p.p50}ms p95=${p.p95}ms ` +
          `mem=${perf.mem ? perf.mem.usedMB + 'MB' : 'n/a'} → ${path.relative(ROOT, pngPath)}`
        );
        if (errors.length) {
          console.log(`[${scene.name}] 控制台错误 ${errors.length} 条：`);
          for (const e of errors.slice(0, 5)) console.log('  - ' + e);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    if (child) child.kill();
  }

  if (opts.mode === 'write') {
    // --scene 只重录指定场景：与既有基线合并，避免整份文件被覆盖成残缺集合
    let prev = null;
    if (opts.scenes && fs.existsSync(baselinePath)) {
      try { prev = JSON.parse(fs.readFileSync(baselinePath, 'utf8')); } catch { prev = null; }
      if (prev && !validateBaseline(prev).ok) prev = null;
    }
    const out = {
      version: 1,
      viewport: [VIEWPORT.width, VIEWPORT.height],
      seed: opts.seed,
      createdAt: new Date().toISOString(),
      scenes: (prev && prev.seed === opts.seed) ? prev.scenes : {},
    };
    for (const name of Object.keys(results)) {
      const r = results[name];
      out.scenes[name] = { size: r.size, grid: r.grid, luma: r.luma, perf: r.perf, mem: r.mem };
    }
    fs.writeFileSync(baselinePath, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`\n基线已写入 ${path.relative(ROOT, baselinePath)}（${Object.keys(out.scenes).length} 个场景）`);
    process.exit(0);
  }

  let failed = 0;
  for (const name of Object.keys(results)) {
    const b = baseline.scenes[name];
    if (!b) {
      console.log(`FAIL | ${name} | 基线里没有该场景（请重新 --write）`);
      failed++;
      continue;
    }
    const cmp = compareScene(b, results[name]);
    const g = cmp.grid || {};
    console.log(
      `${cmp.ok ? 'PASS' : 'FAIL'} | ${name} | mean=${g.meanDelta} max=${g.maxDelta}` +
      (cmp.ok ? '' : ' | ' + cmp.failures.join('; '))
    );
    if (!cmp.ok) failed++;
  }
  console.log(failed ? `\n${failed} 个场景与基线不符` : '\n全部场景与基线一致');
  process.exit(failed ? 1 : 0);
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(2);
});
