/* tank_hud.js — mvp/bench 共享 HUD 渲染工具
 *
 * 2026-10-15 HUD 渲染合并：将 tank_mvp.html 与 tank_bench.html 中重复的
 * HUD 逻辑抽为纯函数/共享实现。渲染形态（环 vs 条、位置）保留各自页面。
 *
 * 注意：debuffReloadRate / clipMagReloadSeconds 由页面全局提供（typeof 守卫）。
 */

// 内部：安全获取 debuffReloadRate（页面全局，未定义时返回 1）
function _debuffRate(player){
  const f = (typeof globalThis !== 'undefined' && typeof globalThis.debuffReloadRate === 'function')
    ? globalThis.debuffReloadRate : null;
  return f ? f(player) : 1;
}

// ---- FPS 计数器 ----
// state: { frames, last } — 调用方持有；el: 显示元素；返回当前 fps（或 null）
function updateFpsCounter(el, state, now){
  state.frames++;
  if(now - state.last >= 500){
    const fps = Math.round(state.frames * 1000 / (now - state.last));
    state.frames = 0; state.last = now;
    if(el) el.textContent = fps + ' FPS';
    return fps;
  }
  return null;
}

// ---- 装填进度（纯函数）----
// 返回 { kind, ... }，kind ∈ 'heat' | 'double_barrel' | 'clip' | 'single'
// 调用方根据 kind 做各自的渲染（mvp 环形 / bench 横条）
function reloadProgress(player){
  if(!player || !player.weapons || !player.weapons.primary) return null;
  const w = player.weapons.primary;
  // 机炮：热量
  if(w.type === 'autocannon'){
    return {
      kind: 'heat',
      heat: player.heatPct || 0,
      locked: player.heatLockT !== undefined && player.heatLockT > 0,
    };
  }
  // 双管：每管进度
  if(w.type === 'double_barrel' && player._dbState && player._dbState.count >= 2){
    const db = player._dbState;
    const spec = w.stats || {};
    const reloadMult = (typeof spec.reloadMult === 'number') ? spec.reloadMult : 1.0;
    const perDur = Math.max(0.05, player.stats.reload * reloadMult / _debuffRate(player));
    return {
      kind: 'double_barrel',
      barrels: db.loadT.map((t, i) => ({
        progress: db.ready[i] ? 1 : Math.max(0, Math.min(1, (t || 0) / perDur)),
        ready: db.ready[i],
      })),
      allReady: db.ready.every(v => v),
      swapWindow: player.reloadT > 0,
    };
  }
  // 弹夹
  if(w.type === 'clip' && player._clipState){
    const st = player._clipState;
    const _cmrs = (typeof globalThis !== 'undefined' && typeof globalThis.clipMagReloadSeconds === 'function')
      ? globalThis.clipMagReloadSeconds : null;
    const magDur = _cmrs ? _cmrs(player, w.stats || {}, st) : 1;
    return {
      kind: 'clip',
      inClip: st.rounds || 0,
      clipSize: st.size || 1,
      reloading: st.pendingRefill && player.reloadT > 0,
      progress: (st.pendingRefill && player.reloadT > 0)
        ? Math.max(0, Math.min(1, 1 - player.reloadT / Math.max(0.05, magDur)))
        : (st.rounds || 0) / Math.max(1, st.size || 1),
    };
  }
  // 单发
  const mult = (w.stats && typeof w.stats.reloadMult === 'number') ? w.stats.reloadMult : 1.0;
  const dur = Math.max(0.05, player.stats.reload * mult / _debuffRate(player));
  return {
    kind: 'single',
    progress: player.reloadT > 0 ? Math.max(0, Math.min(1, 1 - player.reloadT / dur)) : 1,
    reloading: player.reloadT > 0,
  };
}

// ---- 散布锥 ----
// sigma: 角度（弧度）；opts: { length, dual, color1, color2 }
// dual=true 画 1σ 实线 + 2σ 虚线；否则单锥虚线
function drawSpreadCones(ctx, gp, aimA, sigma, opts){
  opts = opts || {};
  const len = opts.length || 250;
  const draw = (s, style, dash) => {
    ctx.save();
    ctx.strokeStyle = style;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.moveTo(gp.x, gp.y);
    ctx.lineTo(gp.x + Math.cos(aimA - s) * len, gp.y + Math.sin(aimA - s) * len);
    ctx.moveTo(gp.x, gp.y);
    ctx.lineTo(gp.x + Math.cos(aimA + s) * len, gp.y + Math.sin(aimA + s) * len);
    ctx.stroke();
    ctx.restore();
  };
  if(opts.dual){
    draw(sigma, opts.color1 || 'rgba(255,180,84,0.75)', []);
    draw(sigma * 2, opts.color2 || 'rgba(255,180,84,0.35)', [4, 4]);
  } else {
    draw(sigma, opts.color1 || 'rgba(255,180,84,0.5)', [2, 4]);
  }
  ctx.setLineDash([]);
}
