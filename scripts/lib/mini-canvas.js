// @ts-nocheck
// mini-canvas.js — 纯 JS 最小 Canvas2D 垫片（Node 无浏览器渲染用）。
// 覆盖 tank_battledraw.js / tank_assets.js 烘焙所用的 API 子集：
// 路径（moveTo/lineTo/closePath/rect/arc/ellipse）、fill/stroke、fillRect、
// save/restore/translate/rotate/scale、颜色/渐变、globalAlpha、lineWidth/lineDash/lineCap、
// clip（矩形剪刀 + 通用路径）、drawImage、getImageData、fillText（空实现）、PNG 输出。
// 运行期无任何外部依赖（PNG 编码用 Node 内建 zlib）。
'use strict';
const zlib = require('zlib');

// ---------- 颜色 ----------
const NAMED = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  transparent: 'rgba(0,0,0,0)'
};
function parseColor(s) {
  if (s == null) return [0, 0, 0, 255];
  if (typeof s !== 'string') return [0, 0, 0, 255];
  s = s.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m;
  if ((m = /^#([0-9a-f]{3})$/.exec(s))) {
    return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), 255];
  }
  if ((m = /^#([0-9a-f]{6})$/.exec(s))) {
    return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 255];
  }
  if ((m = /^#([0-9a-f]{8})$/.exec(s))) {
    return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), parseInt(m[1].slice(6, 8), 16)];
  }
  if ((m = /^rgba?\(\s*([^)]+)\)$/.exec(s))) {
    const p = m[1].split(',').map(x => x.trim());
    const ch = i => p[i].endsWith('%') ? Math.round(parseFloat(p[i]) * 2.55) : Math.round(parseFloat(p[i]));
    return [ch(0), ch(1), ch(2), p.length > 3 ? Math.round(parseFloat(p[3]) * 255) : 255];
  }
  return [0, 0, 0, 255];
}

// ---------- 渐变 ----------
class MiniGradient {
  // #MC3-2026-10-18：渐变的坐标是**创建时的用户空间**，绘制时随 CTM 变换（Canvas 规范）。
  //   旧实现直接在设备像素上套用原始坐标 —— scale=2 的超采样 sprite 里渐变只覆盖
  //   左上四分之一，离线图与浏览器不等价（实测 2× 降采样 vs 1× 直出平均亮度差 8.2）。
  //   这里在创建时捕获 CTM，at() 时把设备像素中心反变换回用户空间再求值。
  constructor(type, args, ctm) {
    this.type = type; this.args = args; this.stops = [];
    this.ctm = ctm ? ctm.slice() : [1, 0, 0, 1, 0, 0];
  }
  addColorStop(off, color) { this.stops.push([off, parseColor(color)]); this.stops.sort((a, b) => a[0] - b[0]); }
  at(dx, dy) {
    if (!this.stops.length) return [0, 0, 0, 0];
    const [a, b, c, d, e, f] = this.ctm;
    const det = a * d - b * c;
    let x = dx + 0.5, y = dy + 0.5;
    if (det) {
      const px = x - e, py = y - f;
      x = (d * px - c * py) / det;
      y = (-b * px + a * py) / det;
    }
    let t;
    if (this.type === 'linear') {
      const [x0, y0, x1, y1] = this.args;
      const dx2 = x1 - x0, dy2 = y1 - y0, len2 = dx2 * dx2 + dy2 * dy2 || 1;
      t = ((x - x0) * dx2 + (y - y0) * dy2) / len2;
    } else {
      const [x0, y0, r0, x1, y1, r1] = this.args;
      const dd = Math.hypot(x - x1, y - y1);
      t = r1 > r0 ? (dd - r0) / (r1 - r0) : 0;
    }
    t = Math.max(0, Math.min(1, t));
    let a0 = this.stops[0], b0 = this.stops[this.stops.length - 1];
    for (let i = 0; i < this.stops.length - 1; i++) {
      if (t >= this.stops[i][0] && t <= this.stops[i + 1][0]) { a0 = this.stops[i]; b0 = this.stops[i + 1]; break; }
    }
    const k = (b0[0] > a0[0]) ? (t - a0[0]) / (b0[0] - a0[0]) : 0;
    return [0, 1, 2, 3].map(i => Math.round(a0[1][i] + (b0[1][i] - a0[1][i]) * k));
  }
}

// ---------- 画布 ----------
function createMiniCanvas(w0, h0) {
  let W = Math.max(1, Math.round(w0)), H = Math.max(1, Math.round(h0));
  let buf = new Uint8ClampedArray(W * H * 4); // 全透明初始
  const I = (x, y) => (y * W + x) * 4;
  // 尺寸重设（如 bake 探针先 createElement 再赋值 width/height）：清空重分配
  function resize(nw, nh) {
    nw = Math.max(1, Math.round(nw)); nh = Math.max(1, Math.round(nh));
    if (nw === W && nh === H) return;
    W = nw; H = nh; buf = new Uint8ClampedArray(W * H * 4);
  }

  const ident = () => [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
  ];
  const xform = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  function newState() {
    return {
      fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1,
      globalAlpha: 1, globalCompositeOperation: 'source-over',
      lineCap: 'butt', lineDash: [], lineDashOffset: 0,
      font: '10px sans-serif', textAlign: 'start',
      transform: ident(), clipRect: null, clipPath: null
    };
  }

  const ctx = {
    canvas: null, // 回填
    _state: newState(),
    _stack: [],
    _path: [], // subpaths: {pts:[[x,y]...], closed:bool}

    // ----- 状态 -----
    save() { this._stack.push(JSON.parse(JSON.stringify({ ...this._state, transform: this._state.transform }))); this._stack[this._stack.length - 1].transform = this._state.transform.slice(); },
    restore() { const s = this._stack.pop(); if (s) { this._state = s; } },
    translate(x, y) { const s = this._state; s.transform = mul(s.transform, [1, 0, 0, 1, x, y]); },
    rotate(a) { const c = Math.cos(a), si = Math.sin(a); const s = this._state; s.transform = mul(s.transform, [c, si, -si, c, 0, 0]); },
    scale(x, y) { const s = this._state; s.transform = mul(s.transform, [x, 0, 0, y == null ? x : y, 0, 0]); },
    setTransform(a, b, c, d, e, f) { this._state.transform = [a, b, c, d, e, f]; },

    // ----- 路径 -----
    beginPath() { this._path = []; },
    _cur() { if (!this._path.length || this._path[this._path.length - 1].closed) this._path.push({ pts: [], closed: false }); return this._path[this._path.length - 1]; },
    moveTo(x, y) { this._path.push({ pts: [[x, y]], closed: false }); },
    lineTo(x, y) { this._cur().pts.push([x, y]); },
    closePath() { const p = this._cur(); if (p.pts.length) p.closed = true; },
    rect(x, y, W, H) { this._path.push({ pts: [[x, y], [x + W, y], [x + W, y + H], [x, y + H]], closed: true }); },
    arc(x, y, r, a0, a1, ccw) {
      const pts = [];
      const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 0.12));
      for (let i = 0; i <= steps; i++) {
        const a = a0 + (a1 - a0) * (i / steps);
        pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
      }
      if (ccw) pts.reverse();
      const sub = { pts, closed: Math.abs(Math.abs(a1 - a0) - Math.PI * 2) < 1e-6 };
      this._path.push(sub);
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
      const pts = [];
      const steps = Math.max(10, Math.ceil(Math.abs(a1 - a0) / 0.12));
      const cr = Math.cos(rot), sr = Math.sin(rot);
      for (let i = 0; i <= steps; i++) {
        const a = a0 + (a1 - a0) * (i / steps);
        const ex = rx * Math.cos(a), ey = ry * Math.sin(a);
        pts.push([x + ex * cr - ey * sr, y + ex * sr + ey * cr]);
      }
      if (ccw) pts.reverse();
      this._path.push({ pts, closed: Math.abs(Math.abs(a1 - a0) - Math.PI * 2) < 1e-6 });
    },

    // ----- 裁剪 -----
    clip() {
      const s = this._state;
      // 矩形单闭合子路径 → 快捷剪刀；否则存通用路径
      if (this._path.length === 1 && this._path[0].closed && this._path[0].pts.length === 4) {
        const tp = this._path[0].pts.map(p => xform(s.transform, p[0], p[1]));
        const xs = tp.map(p => p[0]), ys = tp.map(p => p[1]);
        const r = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
        s.clipRect = s.clipRect ? intersectRect(s.clipRect, r) : r;
      } else {
        s.clipPath = this._path.map(sp => ({ pts: sp.pts.map(p => xform(s.transform, p[0], p[1])), closed: sp.closed }));
      }
    },

    // ----- 绘制 -----
    fillRect(x, y, W, H) {
      const s = this._state;
      const p = [xform(s.transform, x, y), xform(s.transform, x + W, y), xform(s.transform, x + W, y + H), xform(s.transform, x, y + H)];
      this._fillPoly(p, resolveStyle(s.fillStyle), s);
    },
    clearRect(x, y, cw, ch) {
      const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(W, Math.ceil(x + cw)), y1 = Math.min(H, Math.ceil(y + ch));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = I(xx, yy); buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0;
      }
    },
    strokeRect(x, y, W, H) {
      this.beginPath(); this.rect(x, y, W, H); this.stroke();
    },
    fill() {
      const s = this._state;
      const style = resolveStyle(s.fillStyle);
      for (const sp of this._path) {
        if (sp.pts.length < 3 && !sp.closed) continue;
        const tp = sp.pts.map(p => xform(s.transform, p[0], p[1]));
        this._fillPoly(tp, style, s);
      }
    },
    stroke() {
      const s = this._state;
      const style = resolveStyle(s.strokeStyle);
      const lw = Math.max(0.5, s.lineWidth * Math.hypot(s.transform[0], s.transform[1]));
      for (const sp of this._path) {
        const tp = sp.pts.map(p => xform(s.transform, p[0], p[1]));
        const pts = sp.closed ? tp.concat([tp[0]]) : tp;
        for (let i = 0; i + 1 < pts.length; i++) this._strokeSeg(pts[i], pts[i + 1], lw / 2, style, s);
      }
    },
    _inClip(x, y) {
      const s = this._state;
      if (s.clipRect && (x < s.clipRect.x0 || x >= s.clipRect.x1 || y < s.clipRect.y0 || y >= s.clipRect.y1)) return false;
      if (s.clipPath) {
        for (const sp of s.clipPath) if (pointInPoly(x, y, sp.pts)) return true;
        return false;
      }
      return true;
    },
    _blend(x, y, rgba, alphaMul) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      if (!this._inClip(x + 0.5, y + 0.5)) return;
      const st = this._state;
      const a = (rgba[3] / 255) * st.globalAlpha * (alphaMul == null ? 1 : alphaMul);
      if (a <= 0) return;
      const i = I(x, y);
      if (st.globalCompositeOperation === 'lighter') {
        // #MC2-2026-10-18：'lighter' 此前只是被存进状态、从不生效——代价是**所有发光特效**
        //   在离线生图里都按 source-over 合成（暗部被压掉、火焰/曳光/爆闪全都发灰），
        //   离线图与实机视觉不可互验。此处按 Canvas 规范实现加法混合（AlphaComposite.PLUS）：
        //   Cs·as + Cb·ab 分量相加，alpha 也相加（钳制到 1）。
        buf[i]     = Math.min(255, Math.round(rgba[0] * a + buf[i]));
        buf[i + 1] = Math.min(255, Math.round(rgba[1] * a + buf[i + 1]));
        buf[i + 2] = Math.min(255, Math.round(rgba[2] * a + buf[i + 2]));
        buf[i + 3] = Math.min(255, Math.round(255 * a + buf[i + 3]));
        return;
      }
      const ia = 1 - a;
      buf[i] = Math.round(rgba[0] * a + buf[i] * ia);
      buf[i + 1] = Math.round(rgba[1] * a + buf[i + 1] * ia);
      buf[i + 2] = Math.round(rgba[2] * a + buf[i + 2] * ia);
      buf[i + 3] = Math.round(255 * (a + (buf[i + 3] / 255) * ia));
    },
    _fillPoly(pts, style, s) {
      if (pts.length < 3) return;
      let y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
      for (let y = y0; y <= y1; y++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a[1] > y + 0.5) !== (b[1] > y + 0.5)) {
            xs.push(a[0] + (b[0] - a[0]) * ((y + 0.5 - a[1]) / (b[1] - a[1])));
          }
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(W - 1, Math.floor(xs[k + 1]));
          for (let x = xa; x <= xb; x++) {
            const rgba = style instanceof MiniGradient ? style.at(x, y) : style;
            this._blend(x, y, rgba);
          }
        }
      }
    },
    _strokeSeg(p0, p1, r, style, s) {
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const steps = Math.max(1, Math.ceil(len / 0.75));
      const dash = s.lineDash && s.lineDash.length ? s.lineDash : null;
      let dist = 0;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t;
        if (dash) {
          const dd = (dist + (s.lineDashOffset || 0)) % (dash[0] + (dash[1] || dash[0]));
          if (dd > dash[0]) { dist += len / steps; continue; }
        }
        this._stampDisc(x, y, r, style);
        dist += len / steps;
      }
    },
    _stampDisc(cx, cy, r, style) {
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) {
          const rgba = style instanceof MiniGradient ? style.at(x, y) : style;
          this._blend(x, y, rgba);
        }
      }
    },

    // ----- 图像 -----
    // #MC1-2026-10-18 修复：旧实现完全忽略 CTM（只按 dx/dy 原始坐标落点），
    //   而 scripts/render-map-shot.js 等工具都用 ctx.scale/translate 做全局缩放 ——
    //   于是「--scale≠1 时掩体/树冠位置全错」：图形（路径/填充）跟着缩放走，
    //   贴图（bake 精灵、掩体资产）停在未缩放坐标，离线生图无法当视觉基线。
    //   现改为**逆变换采样**：遍历设备像素包围盒，用逆 CTM 映射回图片 uv；
    //   平移/缩放/旋转/斜切全部正确，代价是每像素一次逆变换（离线工具可接受）。
    drawImage(img, dx, dy, dw, dh) {
      if (!img || !img._buf) return;
      if (dw === undefined) { dw = img.width; dh = img.height; }
      const s = this._state;
      const a = s.transform[0], b = s.transform[1], c = s.transform[2],
            d = s.transform[3], e = s.transform[4], f = s.transform[5];
      const det = a * d - b * c;
      if (!det) return;
      // 目标四角（user space）→ 设备空间包围盒
      const corners = [[dx, dy], [dx + dw, dy], [dx + dw, dy + dh], [dx, dy + dh]]
        .map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
      const mins = [0, 1].map(k => Math.min(...corners.map(p => p[k])));
      const maxs = [0, 1].map(k => Math.max(...corners.map(p => p[k])));
      const X0 = Math.max(0, Math.floor(mins[0])), X1 = Math.min(W - 1, Math.ceil(maxs[0]));
      const Y0 = Math.max(0, Math.floor(mins[1])), Y1 = Math.min(H - 1, Math.ceil(maxs[1]));
      const sx = dw / img.width, sy = dh / img.height;
      const iw = img.width, ih = img.height, ib = img._buf;
      // #MC2-2026-10-18：**缩小采样必须双线性**。2× 超采样 sprite（#TEX12）靠
      //   drawImage 降到 1× 显示；旧 nearest 采样会把超采样的收益全部丢掉（离线图
      //   与浏览器不等价）。仅在「设备像素/图像像素 < 1」时启用，1:1 与放大保持
      //   nearest，既有逐像素断言（10× 放大 100px 等）不受影响。
      const devScale = Math.sqrt(Math.abs(det)) * sx;
      const bilinear = devScale < 0.999;
      const clampX = v => v < 0 ? 0 : (v >= iw ? iw - 1 : v);
      const clampY = v => v < 0 ? 0 : (v >= ih ? ih - 1 : v);
      const texel = (x, y) => {
        const si = (clampY(y) * iw + clampX(x)) * 4;
        return [ib[si], ib[si + 1], ib[si + 2], ib[si + 3]];
      };
      for (let Y = Y0; Y <= Y1; Y++) {
        for (let X = X0; X <= X1; X++) {
          // 设备像素中心 → user space
          const px = X + 0.5 - e, py = Y + 0.5 - f;
          const ux = (d * px - c * py) / det;
          const uy = (-b * px + a * py) / det;
          const u = (ux - dx) / sx;
          const v = (uy - dy) / sy;
          if (u < 0 || v < 0 || u >= iw || v >= ih) continue;
          if (!bilinear) {
            const si = (Math.floor(v) * iw + Math.floor(u)) * 4;
            this._blend(X, Y, [ib[si], ib[si + 1], ib[si + 2], ib[si + 3]]);
            continue;
          }
          // 双线性：以 texel 中心为采样点，先乘 alpha 插值再还原（避免透明边缘发黑）
          const fx = u - 0.5, fy = v - 0.5;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = fx - x0, ty = fy - y0;
          const c00 = texel(x0, y0), c10 = texel(x0 + 1, y0);
          const c01 = texel(x0, y0 + 1), c11 = texel(x0 + 1, y0 + 1);
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
          const w01 = (1 - tx) * ty, w11 = tx * ty;
          const alpha = c00[3] * w00 + c10[3] * w10 + c01[3] * w01 + c11[3] * w11;
          if (alpha < 0.5) continue;
          const ch = k => (c00[k] * c00[3] * w00 + c10[k] * c10[3] * w10 +
                           c01[k] * c01[3] * w01 + c11[k] * c11[3] * w11) / alpha;
          this._blend(X, Y, [ch(0), ch(1), ch(2), alpha]);
        }
      }
    },
    getImageData(sx, sy, sw, sh) {
      const data = new Uint8ClampedArray(sw * sh * 4);
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const gx = sx + x, gy = sy + y;
        if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
        const si = I(gx, gy), di = (y * sw + x) * 4;
        data[di] = buf[si]; data[di + 1] = buf[si + 1]; data[di + 2] = buf[si + 2]; data[di + 3] = buf[si + 3];
      }
      return { data, width: sw, height: sh };
    },
    createLinearGradient(x0, y0, x1, y1) { return new MiniGradient('linear', [x0, y0, x1, y1], this._state.transform); },
    createRadialGradient(x0, y0, r0, x1, y1, r1) { return new MiniGradient('radial', [x0, y0, r0, x1, y1, r1], this._state.transform); },
    fillText() { /* 文字在生图验证中跳过 */ },
    strokeText() { },
    measureText() { return { width: 0 }; },

    // ----- 输出 -----
    toPNGBuffer() { return encodePNG(buf, W, H); }
  };

  // 属性代理
  for (const k of ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'globalCompositeOperation', 'lineCap', 'font', 'textAlign', 'lineDashOffset']) {
    Object.defineProperty(ctx, k, {
      get() { return this._state[k]; },
      set(v) { this._state[k] = v; }
    });
  }
  Object.defineProperty(ctx, 'lineDash', {
    get() { return this._state.lineDash; }, set(v) { this._state.lineDash = v; }
  });
  ctx.setLineDash = function (d) { this._state.lineDash = d ? d.slice() : []; };
  ctx.getLineDash = function () { return this._state.lineDash.slice(); };

  // 画布对象：width/height 必须是**访问器**——浏览器里 `canvas.width = n` 会重分配像素缓冲，
  // `bakeAssetCanvas` 正是「先 createElement 再赋值 width/height」的写法。早期版本用普通属性，
  // 赋值只改了对象字段、内部缓冲仍是创建时的尺寸（32×32），导致离屏烘焙量出的内容包围盒
  // 全是错的（实测 tree 内容被判成 25×19 而非 30×30）。此处补上 resize + _buf 同步。
  const canvas = { _buf: buf, getContext: () => ctx, toPNGBuffer: () => ctx.toPNGBuffer() };
  Object.defineProperty(canvas, 'width', {
    get() { return W; },
    set(v) { resize(v, H); syncBuf(); }
  });
  Object.defineProperty(canvas, 'height', {
    get() { return H; },
    set(v) { resize(W, v); syncBuf(); }
  });
  // resize 会换新缓冲数组，canvas._buf 需同步（drawImage 之类的调用方直接读 _buf）
  function syncBuf() { canvas._buf = buf; }
  ctx.canvas = canvas;
  return canvas;
}

function resolveStyle(s) {
  if (s instanceof MiniGradient) return s;
  return parseColor(s);
}
function intersectRect(a, b) {
  return { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
}
function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;
  }
  return inside;
}

// ---------- PNG 编码（truecolor+alpha） ----------
function crc32(data) {
  let c, table = crc32._t;
  if (!table) {
    table = crc32._t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(rgba, W, H) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0; // filter 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit truecolor+alpha
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))
  ]);
}

module.exports = { createMiniCanvas };
