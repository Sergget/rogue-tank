'use strict';
// js/tank_render3d.js — R1 真 3D 渲染最小层（原生 WebGL1，零依赖）
//
// 职责：矩阵/相机、屏幕射线拾取（I4 的 3D 版）、三角形批构建、单 shader 绘制。
// 不做场景内容（地物/坦克几何在 js/tank_scene3d.js），不读 DOM（canvas 由调用方传入）。
//
// 坐标约定：世界 (x, y) → 3D (x, height, y)，即 **Y 轴朝上**；地面 y=0。
// 相机：固定 yaw、可调 pitch/distance（路线图：可旋转相机不默认纳入）。

// ---------------- 4×4 矩阵（列主序，WebGL 直接可用） ----------------

function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4LookAt(eye, target, up) {
  let zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
  let zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up.y * zz - up.z * zy;
  let xy = up.z * zx - up.x * zz;
  let xz = up.x * zy - up.y * zx;
  let xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye.x + xy * eye.y + xz * eye.z),
    -(yx * eye.x + yy * eye.y + yz * eye.z),
    -(zx * eye.x + zy * eye.y + zz * eye.z),
    1,
  ]);
}

// ---------------- 相机 ----------------

/**
 * 创建固定 yaw 的俯视/轻倾斜相机。
 * @param {{yaw?:number, pitch?:number, distance?:number, fovY?:number, target?:{x:number,z:number}}} [opts]
 *   pitch = 仰角（弧度，0.2 ≈ 平视，1.2 ≈ 近俯视）；distance = 相机到目标的距离（世界 px）
 */
function createOrbitCamera(opts) {
  const o = opts || /** @type {any} */ ({});
  return {
    yaw: (typeof o.yaw === 'number') ? o.yaw : 0,
    pitch: (typeof o.pitch === 'number') ? o.pitch : 0.95,
    distance: (typeof o.distance === 'number') ? o.distance : 1100,
    fovY: (typeof o.fovY === 'number') ? o.fovY : 0.85,
    target: o.target ? { x: o.target.x, y: 0, z: o.target.z } : { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 0, z: 0 },
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    view: mat4Identity(),
    proj: mat4Identity(),
    vp: mat4Identity(),
  };
}

/**
 * 把相机对准目标并重算矩阵。
 * @param {any} cam createOrbitCamera 产物
 * @param {{x:number, y?:number, z:number}} target 世界点（x=世界 x，z=世界 y）
 * @param {number} aspect 视口宽高比
 */
function updateOrbitCamera(cam, target, aspect) {
  cam.target = { x: target.x, y: target.y || 0, z: target.z };
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  cam.eye = {
    x: cam.target.x + Math.sin(cam.yaw) * cp * cam.distance,
    y: cam.target.y + sp * cam.distance,
    z: cam.target.z + Math.cos(cam.yaw) * cp * cam.distance,
  };
  let fx = cam.target.x - cam.eye.x, fy = cam.target.y - cam.eye.y, fz = cam.target.z - cam.eye.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  cam.forward = { x: fx, y: fy, z: fz };
  // right = normalize(forward × worldUp)
  let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  cam.right = { x: rx, y: ry, z: rz };
  cam.up = {
    x: ry * fz - rz * fy,
    y: rz * fx - rx * fz,
    z: rx * fy - ry * fx,
  };
  cam.view = mat4LookAt(cam.eye, cam.target, { x: 0, y: 1, z: 0 });
  cam.proj = mat4Perspective(cam.fovY, aspect, 10, 12000);
  cam.vp = mat4Multiply(cam.proj, cam.view);
  return cam;
}

/**
 * 屏幕坐标 → 地面射线（I4 的 3D 版：屏幕射线 × 地面平面求交的射线部分）。
 * @param {any} cam updateOrbitCamera 产物
 * @param {number} sx 画布内 x（CSS px）
 * @param {number} sy 画布内 y
 * @param {number} vw 画布宽
 * @param {number} vh 画布高
 * @returns {{ox:number, oy:number, oz:number, dx:number, dy:number, dz:number}}
 */
function screenRay(cam, sx, sy, vw, vh) {
  const ndcX = (sx / vw) * 2 - 1;
  const ndcY = 1 - (sy / vh) * 2;
  const tanHalf = Math.tan(cam.fovY / 2);
  const aspect = vw / vh;
  let dx = cam.forward.x + cam.right.x * ndcX * tanHalf * aspect + cam.up.x * ndcY * tanHalf;
  let dy = cam.forward.y + cam.right.y * ndcX * tanHalf * aspect + cam.up.y * ndcY * tanHalf;
  let dz = cam.forward.z + cam.right.z * ndcX * tanHalf * aspect + cam.up.z * ndcY * tanHalf;
  const l = Math.hypot(dx, dy, dz) || 1;
  return { ox: cam.eye.x, oy: cam.eye.y, oz: cam.eye.z, dx: dx / l, dy: dy / l, dz: dz / l };
}

/**
 * 屏幕坐标 → 世界地面点（y=0）。射线朝上或平行地面时返回 null。
 * @returns {{x:number, y:number}|null} x/z 平面坐标（y 即世界 y）
 */
function rayGroundHit(cam, sx, sy, vw, vh) {
  const r = screenRay(cam, sx, sy, vw, vh);
  if (r.dy >= -1e-6) return null;
  const t = -r.oy / r.dy;
  if (t < 0) return null;
  return { x: r.ox + r.dx * t, y: r.oz + r.dz * t };
}

// ---------------- 三角形批构建 ----------------
// 顶点格式：[px,py,pz, nx,ny,nz, r,g,b,a]（10 floats）。颜色 0..1。

function createMeshBuilder() {
  const data = [];
  const push = (p, n, c) => {
    data.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], c[3]);
  };
  const normalOf = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  return {
    data,
    triangle(a, b, c, color, normal) {
      const n = normal || normalOf(a, b, c);
      push(a, n, color); push(b, n, color); push(c, n, color);
    },
    quad(a, b, c, d, color) {
      const n = normalOf(a, b, c);
      push(a, n, color); push(b, n, color); push(c, n, color);
      push(a, n, color); push(c, n, color); push(d, n, color);
    },
    /**
     * 轴对齐/绕 Y 旋转的盒体。
     * @param {number} cx 中心 x
     * @param {number} baseY 底部高度
     * @param {number} cz 中心 z
     * @param {number} sx 宽（x）
     * @param {number} sy 高
     * @param {number} sz 深（z）
     * @param {number[]} color
     * @param {number} [yaw] 绕 Y 旋转（弧度）
     */
    box(cx, baseY, cz, sx, sy, sz, color, yaw) {
      const hx = sx / 2, hz = sz / 2;
      const ca = Math.cos(yaw || 0), sa = Math.sin(yaw || 0);
      const rot = (x, z) => [cx + x * ca - z * sa, cz + x * sa + z * ca];
      const p = (x, y, z) => { const r = rot(x, z); return [r[0], baseY + y, r[1]]; };
      const a = p(-hx, 0, -hz), b = p(hx, 0, -hz), c = p(hx, 0, hz), d = p(-hx, 0, hz);
      const e = p(-hx, sy, -hz), f = p(hx, sy, -hz), g = p(hx, sy, hz), h = p(-hx, sy, hz);
      this.quad(a, b, c, d, color);       // 底
      this.quad(e, f, g, h, color);       // 顶
      this.quad(a, b, f, e, color);       // -z
      this.quad(b, c, g, f, color);       // +x
      this.quad(c, d, h, g, color);       // +z
      this.quad(d, a, e, h, color);       // -x
    },
    /** 平铺地面四边形（y 固定）。 */
    ground(x0, z0, x1, z1, y, color) {
      this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], color);
    },
    /**
     * 竖直挤出多边形（世界 x/z 顶点数组 [{x,y}] → 3D）。
     * @param {{x:number,y:number}[]} poly 世界 x/z 顶点
     * @param {number} baseY
     * @param {number} height
     * @param {number[]} color
     */
    extrude(poly, baseY, height, color) {
      const n = poly.length;
      if (n < 3) return;
      const top = poly.map(p => [p.x, baseY + height, p.y]);
      const bot = poly.map(p => [p.x, baseY, p.y]);
      for (let i = 1; i < n - 1; i++) {
        this.triangle(top[0], top[i], top[i + 1], color);
        this.triangle(bot[0], bot[i + 1], bot[i], color);
      }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.quad(bot[i], bot[j], top[j], top[i], color);
      }
    },
    /** 低模圆锥（树冠）。 */
    cone(cx, baseY, cz, radius, height, segments, color) {
      const n = Math.max(3, segments | 0 || 8);
      const apex = [cx, baseY + height, cz];
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const p0 = [cx + Math.cos(a0) * radius, baseY, cz + Math.sin(a0) * radius];
        const p1 = [cx + Math.cos(a1) * radius, baseY, cz + Math.sin(a1) * radius];
        this.triangle(p0, p1, apex, color);
        this.triangle([cx, baseY, cz], p1, p0, color);
      }
    },
  };
}

// ---------------- WebGL ----------------

const VERT_SRC = [
  'attribute vec3 aPos;',
  'attribute vec3 aNormal;',
  'attribute vec4 aColor;',
  'uniform mat4 uVP;',
  'varying vec3 vNormal;',
  'varying vec4 vColor;',
  'void main(){',
  '  vNormal = aNormal;',
  '  vColor = aColor;',
  '  gl_Position = uVP * vec4(aPos, 1.0);',
  '}',
].join('\n');

const FRAG_SRC = [
  'precision mediump float;',
  'varying vec3 vNormal;',
  'varying vec4 vColor;',
  'uniform vec3 uLight;',
  'void main(){',
  '  float d = max(dot(normalize(vNormal), normalize(uLight)), 0.0);',
  '  vec3 c = vColor.rgb * (0.45 + 0.55 * d);',
  '  gl_FragColor = vec4(c, vColor.a);',
  '}',
].join('\n');

function _compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader compile: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

/**
 * 创建渲染器；WebGL 不可用时返回 null（页面据此显示降级提示）。
 * @param {HTMLCanvasElement} canvas
 */
function createRenderer(canvas) {
  const anyCanvas = /** @type {any} */ (canvas);
  const gl = /** @type {WebGLRenderingContext|null} */ (
    anyCanvas.getContext('webgl', { antialias: true, alpha: false })
    || anyCanvas.getContext('experimental-webgl')
  );
  if (!gl) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, _compile(gl, gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, _compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('program link: ' + gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);
  const loc = {
    aPos: gl.getAttribLocation(prog, 'aPos'),
    aNormal: gl.getAttribLocation(prog, 'aNormal'),
    aColor: gl.getAttribLocation(prog, 'aColor'),
    uVP: gl.getUniformLocation(prog, 'uVP'),
    uLight: gl.getUniformLocation(prog, 'uLight'),
  };
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  return { gl, prog, loc };
}

/**
 * 上传批数据到 GPU。
 * @param {any} renderer createRenderer 产物
 * @param {number[]} data createMeshBuilder().data
 */
function uploadMesh(renderer, data) {
  const gl = renderer.gl;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return { buffer: buf, count: data.length / 10 };
}

/**
 * 复用已有 buffer 更新动态几何（坦克/炮弹/烟尘），避免每帧新建 buffer 泄漏。
 * @param {any} renderer
 * @param {{buffer:any, count:number}} mesh
 * @param {number[]} data
 */
function updateMesh(renderer, mesh, data) {
  const gl = renderer.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
  mesh.count = data.length / 10;
  return mesh;
}

function _bindMesh(renderer, mesh) {
  const gl = renderer.gl, loc = renderer.loc;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
  const stride = 10 * 4;
  gl.enableVertexAttribArray(loc.aPos);
  gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(loc.aNormal);
  gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, stride, 3 * 4);
  gl.enableVertexAttribArray(loc.aColor);
  gl.vertexAttribPointer(loc.aColor, 4, gl.FLOAT, false, stride, 6 * 4);
}

/**
 * 绘制一帧。
 * @param {any} renderer
 * @param {{meshes:any[], cam:any, clear?:number[], light?:number[]}} opts
 */
function drawScene(renderer, opts) {
  const gl = renderer.gl, loc = renderer.loc;
  const o = opts || /** @type {any} */ ({});
  const clear = o.clear || [0.06, 0.07, 0.05, 1];
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(renderer.prog);
  gl.uniformMatrix4fv(loc.uVP, false, o.cam.vp);
  const light = o.light || [-0.45, -0.8, -0.4];
  gl.uniform3fv(loc.uLight, light);
  for (const mesh of (o.meshes || [])) {
    if (!mesh || !mesh.count) continue;
    _bindMesh(renderer, mesh);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mat4Identity,
    mat4Multiply,
    mat4Perspective,
    mat4LookAt,
    createOrbitCamera,
    updateOrbitCamera,
    screenRay,
    rayGroundHit,
    createMeshBuilder,
    createRenderer,
    uploadMesh,
    updateMesh,
    drawScene,
  };
}
