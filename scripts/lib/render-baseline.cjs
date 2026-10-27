'use strict';
// scripts/lib/render-baseline.cjs — R0 渲染基线（I3）的纯逻辑部分
//
// 截图基线不比对 PNG 字节（不同 GPU / 字体 / 抗锯齿会让字节全变），而是比对
// 页面内用 canvas 降采样得到的 32×18 网格平均色 + 亮度直方图：
//   - 网格：32×18 个 [r,g,b]（0..255 整数）
//   - 直方图：16 档亮度计数（用于报告，不单独判失败）
// 阈值默认 mean ≤ 2、max ≤ 16（单通道 0..255）。
// 浏览器脚本只负责取数/落盘，判定逻辑全部在这里，便于 Node 测试。

const GRID_W = 32;
const GRID_H = 18;
const DEFAULT_TOL = { mean: 2, max: 16 };

/**
 * @typedef {{size:number[], grid:number[][], luma:number[], perf?:object, mem?:object|null}} SceneMetric
 */

/**
 * 比较两份 32×18 网格。
 * @param {number[][]} base 基线网格
 * @param {number[][]} cur 当前网格
 * @param {{mean?:number, max?:number}} [tol] 覆盖默认阈值
 * @returns {{ok:boolean, maxDelta:number, meanDelta:number, worstIndex:number, worstCell:number[]|null, reason:string|null}}
 */
function compareGrid(base, cur, tol) {
  const t = Object.assign({}, DEFAULT_TOL, tol || {});
  const n = GRID_W * GRID_H;
  if (!Array.isArray(base) || !Array.isArray(cur)) {
    return { ok: false, maxDelta: Infinity, meanDelta: Infinity, worstIndex: -1, worstCell: null, reason: 'grid-missing' };
  }
  if (base.length !== n || cur.length !== n) {
    return { ok: false, maxDelta: Infinity, meanDelta: Infinity, worstIndex: -1, worstCell: null,
      reason: `grid-size: base=${base.length} cur=${cur.length} expected=${n}` };
  }
  let maxDelta = 0, sum = 0, worstIndex = -1, worstCell = null;
  for (let i = 0; i < n; i++) {
    const a = base[i], b = cur[i];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) {
      return { ok: false, maxDelta: Infinity, meanDelta: Infinity, worstIndex: i, worstCell: null, reason: 'cell-invalid' };
    }
    let cellMax = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs((b[c] | 0) - (a[c] | 0));
      cellMax = Math.max(cellMax, d);
      sum += d;
    }
    if (cellMax > maxDelta) { maxDelta = cellMax; worstIndex = i; worstCell = b; }
  }
  const meanDelta = sum / (n * 3);
  const ok = meanDelta <= t.mean && maxDelta <= t.max;
  return {
    ok,
    maxDelta: round3(maxDelta),
    meanDelta: round3(meanDelta),
    worstIndex,
    worstCell,
    reason: ok ? null : `mean ${round3(meanDelta)} > ${t.mean} or max ${maxDelta} > ${t.max}`,
  };
}

/**
 * 比较一个场景的完整度量。
 * 性能数字（perf/mem）只随基线记录、**不参与判定**——它随机器与负载变化。
 * @param {SceneMetric} base 基线场景对象 { size, grid, luma, perf, mem }
 * @param {SceneMetric} cur 当前场景对象
 * @param {object} [tol] 覆盖默认阈值
 */
function compareScene(base, cur, tol) {
  const failures = [];
  if (!base || !cur) return { ok: false, failures: ['scene-missing'], grid: null };
  const bs = Array.isArray(base.size) ? base.size : [];
  const cs = Array.isArray(cur.size) ? cur.size : [];
  if (bs[0] !== cs[0] || bs[1] !== cs[1]) {
    failures.push(`canvas-size: base=${bs.join('x')} cur=${cs.join('x')}`);
  }
  const g = compareGrid(base.grid, cur.grid, tol);
  if (!g.ok) failures.push('grid: ' + g.reason);
  return { ok: failures.length === 0, failures, grid: g };
}

/**
 * 校验基线文件形状（防止把半截 JSON 当基线用）。
 * @param {any} obj
 * @returns {{ok:boolean, reason:string|null}}
 */
function validateBaseline(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'not-object' };
  if (obj.version !== 1) return { ok: false, reason: 'version' };
  if (!Array.isArray(obj.viewport) || obj.viewport.length !== 2) return { ok: false, reason: 'viewport' };
  if (!obj.scenes || typeof obj.scenes !== 'object') return { ok: false, reason: 'scenes' };
  const names = Object.keys(obj.scenes);
  if (!names.length) return { ok: false, reason: 'scenes-empty' };
  for (const name of names) {
    const s = obj.scenes[name];
    if (!s || !Array.isArray(s.size) || !Array.isArray(s.grid)) {
      return { ok: false, reason: 'scene-shape:' + name };
    }
    if (s.grid.length !== GRID_W * GRID_H) {
      return { ok: false, reason: 'scene-grid:' + name };
    }
  }
  return { ok: true, reason: null };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

module.exports = {
  GRID_W,
  GRID_H,
  DEFAULT_TOL,
  compareGrid,
  compareScene,
  validateBaseline,
};
