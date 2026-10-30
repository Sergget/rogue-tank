'use strict';

// scripts/probe-line-formation.cjs — 临时目视验证探针（不进 npm test）
//
// 目的：验证 tank_battle.html battleSpawnWaveUnits 改为「防线式横向排布」后，
//   同一波敌人沿防线锚点连线排布成线（间距近似均匀、y 分布在防线走向上）。
//
// 驱动（measure-encounter-real.cjs 同款进入序列）：预置存档 → 选择进入 → START → battle；
//   轮询 __TEST__.encounter() 等 W1 spawn（enemies > 0 且 waveIndex===0）后立即 dump
//   波次全部敌人坐标 + currentNode.encounterAnchors，计算：
//     1) 相邻单位（按 x 排序）间距序列与方差 / 均匀性
//     2) 各单位 y 与该防线锚点 y 均值的偏差（应 ≤ 锚点跨度 + 抖动，而非 ±160 散布）
//   并与防线锚点跨度对照（防线本身是弯的时 y 偏差可以大，但应贴近锚点折线插值）。

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const { launchBrowser } = require('./lib/browser-launch.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PORT = 8000;
const ALT_PORT = 8171;
const wait = ms => new Promise(r => setTimeout(r, ms));

// 与 measure-encounter-real.cjs 同款：response 回调内 resolve(true)——
// 注意 resolve 挂在 res.resume() 的 wrapper 里会因 setTimeout 先注册而把 promise 悬死。
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

// 对比：给定点集到锚点折线的「贴线度」——每点到折线最近线段的距离的均值/最大值
function distToPolyline(pts, poly) {
  const ds = [];
  for (const p of pts) {
    let best = Infinity;
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1;
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
    }
    if (poly.length === 1) best = Math.hypot(p.x - poly[0].x, p.y - poly[0].y);
    ds.push(best);
  }
  return ds;
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

    const savesMetaKey = 'rt_saves_v1';
    const slotKey = 'rt_save_probe_line';
    const slotId = 'probe-line';
    await page.goto(`${server.base}/tank_battle.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(({ savesMetaKey, slotKey, slotId }) => {
      localStorage.setItem(savesMetaKey, JSON.stringify({
        activeSaveId: slotId,
        saves: [{ id: slotId, name: 'ProbeLine', updatedAt: 1 }]
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
      .catch(() => {});
    await page.waitForFunction(() => {
      const b = document.getElementById('loadStartBtn'); return b && !b.disabled;
    }, null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => { const b = document.getElementById('loadStartBtn'); if (b) b.click(); });
    const inBattle = await page.waitForFunction(
      () => window.__TEST__ && window.__TEST__.flowState() === 'battle', null, { timeout: 25000 }
    ).then(() => true).catch(() => false);
    if (!inBattle) throw new Error('battle 未就绪');

    // 找一个 encounter 节点：检查当前节点是否 encounter；不是则 skipToNode 沿 run 找
    let nodeIdx = await page.evaluate(() => {
      const T = window.__TEST__;
      if (T.currentNodeEncounter && T.currentNodeEncounter()) return 0;
      for (let i = 0; i < 12; i++) { try { T.skipToNode(i); return i; } catch (e) { /* continue */ } }
      return -1;
    });
    if (nodeIdx < 0) throw new Error('找不到 encounter 节点');
    await page.waitForFunction(() => window.__TEST__.flowState() === 'battle', null, { timeout: 15000 });
    await wait(2000);

    // 确认是 encounter 节点（skipToNode 盲试可能落在普通节点；逐个试）
    nodeIdx = await page.evaluate(() => {
      const T = window.__TEST__;
      if (T.currentNodeEncounter && T.currentNodeEncounter()) return T.currentNodeIndex ? T.currentNodeIndex() : 0;
      return -1;
    });
    console.log(`当前节点 index=${nodeIdx} · encounter=${await page.evaluate(() => window.__TEST__.currentNodeEncounter())}`);

    // 等 W1 spawn：enemies 出现（波次导演 spawn 后 entities 里有 waveSpawn 敌人）
    const spawned = await page.waitForFunction(() => {
      const T = window.__TEST__;
      const es = T.entities().filter(e => e.team === 'enemy' && e.waveSpawn);
      return es.length >= 2;
    }, null, { timeout: 120000 }).then(() => true).catch(() => false);
    if (!spawned) {
      const diag = await page.evaluate(() => ({
        enc: window.__TEST__.encounter(),
        enemies: window.__TEST__.entities().filter(e => e.team === 'enemy').length,
      }));
      throw new Error('120s 内未见波次 spawn（W1）——诊断: ' + JSON.stringify(diag));
    }

    // dump：波次敌人坐标 + 防线锚点
    const data = await page.evaluate(() => {
      const T = window.__TEST__;
      return {
        enemies: T.entities()
          .filter(e => e.team === 'enemy' && e.waveSpawn && e.hp > 0)
          .map(e => ({ id: e.id, x: Math.round(e.x), y: Math.round(e.y) })),
        anchors: (typeof T.encounterAnchors === 'function')
          ? T.encounterAnchors() : null,
        enc: T.encounter(),
      };
    });
    console.log(`\n=== 探针 dump（节点 ${nodeIdx} · enc=${JSON.stringify(data.enc)}）===`);
    console.log('敌人坐标:', JSON.stringify(data.enemies));
    if (data.anchors) console.log('锚点:', JSON.stringify(data.anchors));

    // 统计
    const pts = data.enemies.map(e => ({ x: e.x, y: e.y }));
    if (pts.length < 2) throw new Error('敌人不足 2 个，无法算成线性');
    const sorted = pts.slice().sort((a, b) => a.x - b.x);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(Math.round(Math.hypot(sorted[i].x - sorted[i - 1].x, sorted[i].y - sorted[i - 1].y)));
    }
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const varr = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
    console.log(`\n相邻间距（按 x 排序）: ${gaps.join(', ')}`);
    console.log(`间距均值 ${mean.toFixed(1)}px · 方差 ${varr.toFixed(1)} · 标准差 ${Math.sqrt(varr).toFixed(1)} · 变异系数 ${(Math.sqrt(varr) / mean * 100).toFixed(1)}%`);

    const anchorGroups = data.anchors;
    if (anchorGroups && anchorGroups.length) {
      // 波次绑定防线 = waveIdx % lineCount；取各防线逐一对比，取贴线度最小的
      let best = null;
      for (let li = 0; li < anchorGroups.length; li++) {
        const poly = anchorGroups[li];
        const ds = distToPolyline(pts, poly);
        const avg = ds.reduce((s, d) => s + d, 0) / ds.length;
        const max = Math.max(...ds);
        if (!best || avg < best.avg) best = { li, avg, max };
        console.log(`防线#${li}（${poly.length} 锚点）: 点到折线距离 均值 ${avg.toFixed(1)}px / 最大 ${max.toFixed(1)}px`);
      }
      console.log(`\n⇒ 最佳贴合防线 #${best.li}: 平均偏距 ${best.avg.toFixed(1)}px · 最大 ${best.max.toFixed(1)}px`);
      console.log(`   （对照：改前 ±160px 随机散布期望偏距约 46px 以上；<25px 视为成线）`);
    }
    if (pageErrors.length) console.log('\npageerror:', pageErrors.slice(0, 3).join(' | '));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server && server.kill) server.kill();
  }
})().catch(e => { console.error('PROBE FAIL:', e.message, (e.stack || '').split('\n')[1] || ''); process.exit(1); });
