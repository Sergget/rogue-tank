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

// ============================== #3（2026-10-20）：弹种指示器（两页同源） ==============================
// mvp 与 bench 此前各有一份 renderAmmoIndicator（PLAN §2.2 差异清单之一）：同一渲染逻辑
// 两处维护。现收敛到共享 tank_hud.js，host 经 H 注入差异点：
//   · list()        当前可用弹种键数组（mvp=activeLoadout()，bench=getAmmoKeys()）
//   · currentIndex() 激活索引（两页同语义：player.currentAmmoIndex 取模）
//   · onPick(key)    点击格切换弹种（可选；bench 有点击切弹，mvp 用 Q/E/滚轮）
//   · showMult       是否显示「穿×/伤×」倍率列（mvp 战斗 HUD 显示，bench 简版不显示）
//   · centerActive   是否把激活格平移到屏幕中线（两页 CSS 都是 fixed+left:50%，同语义）
// DOM 契约（两页样式表必须各自持有同名规则）：容器 `#ammoIndicator`，格子 `.ammo-cell`，
//   激活格 `.ammo-cell.active`，内部 `.dot` / `.key` / `.label` / `.mult`。
//   ⚠️ 2026-10-20 审查修复：bench 此前只有元素内联样式、没有 `.ammo-cell` 规则，
//   切到本共享实现后激活高亮整体消失——已在 tank_bench.html 的 <style> 补齐（见 §4.111）。
function renderAmmoIndicator(H){
  const h = H || {};
  const el = document.getElementById('ammoIndicator');
  if(!el) return;
  const list = (typeof h.list === 'function') ? h.list() : [];
  if(!list.length) { el.innerHTML = ''; return; }
  const cur = ((h.currentIndex() | 0) % list.length + list.length) % list.length;
  let html = '';
  for(let i = 0; i < list.length; i++){
    const a = (typeof RULES !== 'undefined' && RULES.ammoTypes[list[i]]) || (RULES && RULES.ammoTypes && RULES.ammoTypes.ap) || {};
    const dirHint = (i === (cur + 1) % list.length) ? 'E' : ((i === (cur - 1 + list.length) % list.length) ? 'Q' : '');
    const active = i === cur;
    html += `<span class="ammo-cell${active ? ' active' : ''}" data-ammo="${list[i]}">`
      + `<span class="dot" style="background:${a.color || '#888'}"></span>`
      + `<span class="key">${dirHint || (active ? '★' : '')}</span><span class="label">${a.label || list[i]}</span>`
      + (h.showMult ? `<span class="mult">穿×${a.pen}/伤×${a.dmg}</span>` : '')
      + `</span>`;
  }
  el.innerHTML = html;
  // bench：点击格切弹（mvp 不绑，走键盘/滚轮）
  if(typeof h.onPick === 'function'){
    el.querySelectorAll('[data-ammo]').forEach(c => c.addEventListener('click', () => h.onPick(c.getAttribute('data-ammo'))));
  }
  // 激活格平移到屏幕中线（两页同语义）
  if(h.centerActive){
    const q = /** @type {HTMLElement|null} */ (el.querySelector('[data-ammo].active'));
    const activeEl = q || /** @type {HTMLElement} */ (el.children[cur]);
    if(activeEl && typeof activeEl.offsetLeft === 'number'){
      const center = activeEl.offsetLeft + activeEl.offsetWidth / 2;
      el.style.transform = `translateX(${-center}px)`;
    }
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { drawSpreadCones, renderAmmoIndicator };
}
// 浏览器端 TankHud 命名空间（两页页内代码以 TankHud.renderAmmoIndicator 调用；纯函数层无 DOM 依赖，drawSpreadCones 同源挂出）
if (typeof globalThis !== 'undefined') {
  globalThis.TankHud = { drawSpreadCones, renderAmmoIndicator };
}