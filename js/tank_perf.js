'use strict';
// js/tank_perf.js — R0 性能采样（纯逻辑，无 DOM / 无 Canvas 依赖）
//
// 用途：逐帧记录 update / draw 的耗时，供页面 `__TEST__.perf()` 与
// `scripts/browser-baseline.cjs` 的渲染基线一并采集。
// 只做采样与统计，不参与模拟、不改任何游戏状态。

/**
 * @typedef {{count:number, p50:number, p95:number, max:number, mean:number}} MsStats
 */

/**
 * 对一组毫秒样本求统计量。
 * @param {ArrayLike<number>} values 样本数组（可含未使用的尾部槽位）
 * @param {number} count 有效样本数
 * @returns {MsStats}
 */
function summarizeMs(values, count) {
  const n = Math.max(0, Math.min((count | 0), values ? values.length : 0));
  if (!n) return { count: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  const a = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const ms = (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 0;
    a.push(ms);
    sum += ms;
  }
  a.sort((x, y) => x - y);
  const pick = p => a[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
  return {
    count: n,
    p50: round3(pick(0.5)),
    p95: round3(pick(0.95)),
    max: round3(a[n - 1]),
    mean: round3(sum / n),
  };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/**
 * 环形缓冲：每帧一次 `frame(updateMs, drawMs)`。
 * @param {number} [capacity] 保留帧数（默认 240；≤0 钳到 1）
 */
function createPerfRing(capacity) {
  const req = (typeof capacity === 'number' && isFinite(capacity)) ? Math.floor(capacity) : 240;
  const cap = Math.max(1, req);
  const upd = new Float64Array(cap);
  const drw = new Float64Array(cap);
  let n = 0;   // 有效样本数（≤ cap）
  let i = 0;   // 下一个写入槽位
  const sanitize = v => (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 0;

  return {
    capacity: cap,
    /**
     * 记录一帧。耗时非法（NaN/负数/缺失）按 0 计，不污染统计。
     * @param {number} updateMs
     * @param {number} drawMs
     */
    frame(updateMs, drawMs) {
      upd[i] = sanitize(updateMs);
      drw[i] = sanitize(drawMs);
      i = (i + 1) % cap;
      if (n < cap) n++;
    },
    reset() { n = 0; i = 0; },
    /**
     * @returns {{frames:number, update:MsStats, draw:MsStats}}
     */
    stats() {
      return {
        frames: n,
        update: summarizeMs(upd, n),
        draw: summarizeMs(drw, n),
      };
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    summarizeMs,
    createPerfRing,
  };
}
