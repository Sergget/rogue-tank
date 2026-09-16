'use strict';

// ============================================================================
// tank_panels_dom.js — P-15/P-46/#A24/#A25 panel layer 2/4：DOM ADAPTER
//
// 只做 DOM 适配，不含游戏逻辑（游戏逻辑在 tank_panels_core.js）。
// 每个工厂都「注入式」：页面把元素/回调传进来，本层不假定页面结构、不抓全局 id。
//
// #A25 独立日志面板：
//   makeLogSink(el)                        —— 既有契约（push/clear，cap 25），保持 test-panels 通过
//   createLogPanel(root, opts)             —— 独立浮层日志面板：push/clear/open/close/toggle/attach
//                                             位置与层级由调用方 CSS 决定（MVP 左下角 / Bench 复用）
//
// #A24 面板控制器 DOM 适配：
//   createDevPanelController(els, hooks)   —— 参数输入的 dirty/undo + Apply/Reset 适配
//
// 双端：浏览器 = 全局脚本；Node = require()（test-panels 设 global.document 后调用 makeLogSink）。
// 本层在 Node 下不主动触碰 document（仅在函数被调用时才用），因此 require 安全。
// ============================================================================

// --- 独立日志面板 / 日志 sink ------------------------------------------------

// Build a {clear(), push(text, cls)} sink bound to a DOM element. The consumer
// passes its own element (mvp: devLog list; bench: logOverlay), so the sink
// stays DOM-agnostic in spirit while the element is owned by the page.
function makeLogSink(el){
  var max = 25;
  function pad(n){ return n < 10 ? '0' + n : n; }
  function clear(){ if (el) el.innerHTML = ''; }
  function push(text, cls){
    if (!el) return;
    var d = document.createElement('div');
    d.className = cls || '';
    var now = new Date();
    d.textContent = '[' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()) + '] ' + text;
    el.prepend(d);
    while (el.children.length > max) el.removeChild(el.lastChild);
  }
  return { clear: clear, push: push };
}

// #A25：独立日志面板——在 makeLogSink 的 push/clear 之上，补齐「独立浮层」的
// 位置/层级/生命周期（open/close/toggle）。root 为面板容器元素（其内部由本工厂创建
// 一个 .log-list 列表；若 root 已是列表容器则直接复用）。opts:
//   { max=25, list: <可选既有列表元素>, hiddenClass='rt-log-hidden', onOpen, onClose }
// 位置与层级（左下角等）由调用方 CSS 决定，本层不写死坐标。
function createLogPanel(root, opts){
  opts = opts || {};
  var max = (typeof opts.max === 'number') ? opts.max : 25;
  var hiddenClass = opts.hiddenClass || 'rt-log-hidden';
  var list = opts.list || null;
  if (!list && root && typeof document !== 'undefined'){
    list = document.createElement('div');
    list.className = 'rt-log-list';
    root.appendChild(list);
  }
  var sink = makeLogSink(list);
  var open = true;

  function isOpen(){ return open; }
  function show(){
    open = true;
    if (root && root.classList && root.classList.remove) root.classList.remove(hiddenClass);
    else if (root && root.style) root.style.display = '';
    if (typeof opts.onOpen === 'function') opts.onOpen();
  }
  function hide(){
    open = false;
    if (root && root.classList && root.classList.add) root.classList.add(hiddenClass);
    else if (root && root.style) root.style.display = 'none';
    if (typeof opts.onClose === 'function') opts.onClose();
  }
  function toggle(force){
    var want = (force === undefined) ? !open : !!force;
    if (want) show(); else hide();
    return open;
  }

  return {
    push: sink.push,
    clear: sink.clear,
    el: root,
    listEl: list,
    isOpen: isOpen,
    open: show,
    close: hide,
    toggle: toggle
  };
}

// --- 开发者/参数面板控制器 DOM 适配 (#A24) -----------------------------------

// 把「参数输入 + Apply/Reset」的通用行为抽出来：逐字段 dirty 追踪 + undo（Reset 还原到
// 进入编辑前的快照）。页面传入元素与回调；纯 DOM 适配，不碰坦克状态。
//   els:   { panel, applyBtn, resetBtn, inputs: { stat: HTMLInputElement } }
//   hooks: { readValues(): {stat:number}, onApply(values), onReset(), getSnapshot(): obj }
function createDevPanelController(els, hooks){
  els = els || {}; hooks = hooks || {};
  var baseline = null;      // 进入编辑前的快照（供 undo/Reset）
  var dirty = {};           // { stat: true } 本会话被改动的字段

  function captureBaseline(){
    if (baseline) return;
    if (typeof hooks.getSnapshot === 'function'){
      try { baseline = JSON.parse(JSON.stringify(hooks.getSnapshot())); } catch(e){ baseline = null; }
    }
  }
  function markDirty(stat){ captureBaseline(); dirty[stat] = true; }
  function dirtyStats(){ return Object.keys(dirty); }
  function apply(){
    var values = (typeof hooks.readValues === 'function') ? hooks.readValues() : {};
    if (typeof hooks.onApply === 'function') hooks.onApply(values);
    return values;
  }
  function reset(){
    if (typeof hooks.onReset === 'function') hooks.onReset(baseline);
    dirty = {};
    baseline = null;
  }
  function isDirty(){ return Object.keys(dirty).length > 0; }

  // 输入框 change/input 事件 → 标 dirty
  if (els.inputs && typeof els.inputs === 'object'){
    for (var stat in els.inputs){
      (function(s, input){
        if (!input || !input.addEventListener) return;
        input.addEventListener('change', function(){ markDirty(s); });
      })(stat, els.inputs[stat]);
    }
  }
  if (els.applyBtn && els.applyBtn.addEventListener) els.applyBtn.addEventListener('click', apply);
  if (els.resetBtn && els.resetBtn.addEventListener) els.resetBtn.addEventListener('click', reset);

  return { markDirty: markDirty, dirtyStats: dirtyStats, isDirty: isDirty, apply: apply, reset: reset };
}

// --- dual-end export ---
if (typeof module !== 'undefined' && module.exports){
  module.exports = {
    makeLogSink: makeLogSink,
    createLogPanel: createLogPanel,
    createDevPanelController: createDevPanelController
  };
}
