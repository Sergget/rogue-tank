/* tank_ui.js — Rogue Tank 界面版式令牌（UI Design Tokens）唯一来源
 *
 * 2026-10-27 新建。视觉口径权威：docs/specs/combat/ui-layout.md（§18 兼容条目）。
 *
 * 为什么用 JS 注入而不是 css/ui-tokens.css（用户 2026-10-27 裁定 B）：
 *   七个页面各自内联 <style>，抽外链 CSS 要同时改七处 <link> 与 server.js 静态路径约定；
 *   JS 注入只加一个 <script>，且天然保证「令牌先于页面样式生效」——同步脚本在 head 内
 *   执行时 body 尚未渲染，不会产生 FOUC。
 *
 * 红线：
 *   1. 本模块**只定义变量，不写任何页面专属选择器**。页面内联样式继续拥有自己的布局规则，
 *      逐步改用 var(--x)（迁移路线见规范 §6 三期）。
 *   2. 变量值是本文件的唯一真值。**不得**在任何 .html / .css 里重复定义同名变量——
 *      scripts/test-ui-tokens.js 会断言这一点。
 *   3. 字号阶梯只有 5 档（11/13/16/20/32），11px 是硬下限。依据不是审美，而是
 *      docs/specs/combat/hud-ui.md §#AA8 的用户实证（10px 任务描述在雪地/沙漠不可读），
 *      且被 scripts/test-hud-readability.js 锁为断言。
 */

// ---- 令牌分组表（本文件的唯一数据源） ----
// 顺序即 CSS 输出顺序；renderTokenCss() 按组生成注释块。
const UI_TOKEN_GROUPS = [
  {
    name: '色彩 · 暖橄榄基准（原 3 套色板收敛于此）',
    tokens: {
      '--bg-0':      '#12140f',
      '--bg-canvas': '#0c0d09',
      '--bg-1':      '#1a1d15',
      '--bg-2':      'rgba(255,255,255,.015)',
      '--line':      '#3a3f2c',
      '--line-soft': '#2a2d20',
      '--text':      '#d9dcc9',
      '--text-dim':  '#7a8065',
      '--amber':     '#ffb454',
      '--amber-dim': '#8a6a35',
      '--green':     '#7ed957',
      '--red':       '#ff5c4d',
      '--blue':      '#5cc8ff',
      '--purple':    '#b98aff',
      '--scrim-1':   'rgba(8,9,6,.62)',
      '--scrim-2':   'rgba(8,9,6,.72)',
      '--scrim-3':   'rgba(18,20,15,.97)',
      '--scrim-modal': 'rgba(6,7,4,.72)'
    }
  },
  {
    name: '字体（Rajdhani 不含 CJK，必须显式回落）',
    tokens: {
      '--font-ui':   "'Rajdhani','Noto Sans SC','Microsoft YaHei',sans-serif",
      '--font-mono': "'JetBrains Mono','Consolas',monospace"
    }
  },
  {
    name: '字号阶梯 · 5 档，硬下限 11px',
    tokens: {
      '--fs-hero': '32px',
      '--fs-h1':   '20px',
      '--fs-h2':   '16px',
      '--fs-body': '13px',
      '--fs-xs':   '11px'
    }
  },
  {
    name: '间距 · 8px 基准',
    tokens: {
      '--sp-1': '4px',
      '--sp-2': '8px',
      '--sp-3': '12px',
      '--sp-4': '16px',
      '--sp-5': '24px',
      '--sp-6': '32px',
      '--sp-7': '48px'
    }
  },
  {
    name: '圆角（默认直角，仅状态标记用 pill）',
    tokens: {
      '--r-0':    '0',
      '--r-pill': '999px'
    }
  },
  {
    name: '描边',
    tokens: {
      '--bd':        '1px solid var(--line)',
      '--bd-strong': '1px solid var(--amber-dim)',
      '--bd-accent': '1px solid var(--amber)'
    }
  },
  {
    name: '控件尺寸',
    tokens: {
      '--ctl-h':    '28px',
      '--ctl-h-sm': '24px',
      '--ctl-h-lg': '36px',
      '--w-num':    '72px',
      '--w-text':   '160px'
    }
  },
  {
    name: '进度条高度',
    tokens: {
      '--bar-thin': '4px',
      '--bar':      '10px',
      '--bar-lg':   '12px'
    }
  },
  {
    name: '安全区（沉浸页贴边 12 / 文档页 24，两层不合并）',
    tokens: {
      '--safe-hud':  '12px',
      '--safe-page': '24px',
      '--safe-top':  'max(var(--safe-hud),env(safe-area-inset-top))'
    }
  },
  {
    name: '弹窗宽度',
    tokens: {
      '--dlg-sm': '360px',
      '--dlg-lg': '640px'
    }
  },
  {
    name: '栅格（文档页）',
    tokens: {
      '--grid-cols':    '12',
      '--grid-gutter':  '16px',
      '--content-max':  '1440px',
      '--sidebar-w':    '320px'
    }
  },
  {
    name: '层级',
    tokens: {
      '--z-hud':     '10',
      '--z-overlay': '20',
      '--z-panel':   '30',
      '--z-dialog':  '40',
      '--z-toast':   '50',
      '--z-cursor':  '60'
    }
  }
];

// 扁平视图：name -> value。测试与页面均可直接读。
const UI_TOKENS = (function(){
  const out = {};
  for (const g of UI_TOKEN_GROUPS) {
    for (const k in g.tokens) out[k] = g.tokens[k];
  }
  return out;
})();

// 字号阶梯的「允许值集合」——CI 断言的唯一依据（scripts/test-ui-tokens.js 引用）。
const UI_TYPE_SCALE = ['11px', '13px', '16px', '20px', '32px'];

// 允许的圆角值（0 与 pill）。
const UI_RADIUS_ALLOWED = ['0', '999px'];

const UI_STYLE_ID = 'ui-tokens';

// 生成 :root 声明块（纯函数，无 DOM 依赖，供 Node 测试直接断言）
function renderTokenCss(){
  const lines = ['/* 由 js/tank_ui.js 注入 — 不要手改，改令牌请改该模块 */', ':root{'];
  UI_TOKEN_GROUPS.forEach(function(g, i){
    if (i > 0) lines.push('');
    lines.push('  /* ' + g.name + ' */');
    for (const k in g.tokens) lines.push('  ' + k + ':' + g.tokens[k] + ';');
  });
  lines.push('}');
  return lines.join('\n');
}

// 幂等注入。重复调用不会产生第二个 <style>。
// 返回被创建的 <style> 元素；已存在或不可注入时返回 null。
function injectUiTokens(doc){
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return null;
  const existing = doc.getElementById(UI_STYLE_ID);
  if (existing) return null;
  const el = doc.createElement('style');
  el.id = UI_STYLE_ID;
  el.textContent = renderTokenCss();
  doc.head.appendChild(el);
  return el;
}

// 浏览器端：模块加载即注入（同步脚本，早于 body 渲染）
if (typeof document !== 'undefined') {
  injectUiTokens(document);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    UI_TOKEN_GROUPS, UI_TOKENS, UI_TYPE_SCALE, UI_RADIUS_ALLOWED,
    UI_STYLE_ID, renderTokenCss, injectUiTokens
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.TankUI = {
    tokens: UI_TOKENS,
    typeScale: UI_TYPE_SCALE,
    radiusAllowed: UI_RADIUS_ALLOWED,
    styleId: UI_STYLE_ID,
    renderTokenCss: renderTokenCss,
    inject: injectUiTokens
  };
}
