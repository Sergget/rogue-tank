'use strict';

// tank_dmgtext.js — 伤害飘字（Floating Damage Numbers，P-15）。
// 纯逻辑模块：无 DOM / Canvas 依赖，Node 可测（module.exports 底部导出）。
// 消费方（tank_mvp.html 正式游戏 / tank_bench.html 测试台）在战斗循环内：
//   spawnDmgText(x, y, text, kind) 命中/跳弹/DOT 时生成 → updateDmgTexts(dt) 逐帧推进
//   （上浮 + 淡出 + 生命周期）→ drawDmgTexts(ctx) 在世界坐标绘制（调用方已套摄像机变换）。
//
// 颜色语义（P-15 定型）：击穿红/橙（pen）、未击穿白（block）、跳弹蓝/白（bounce）、
// 高爆黄（he，HE 弹击穿 / 爆轰）、DOT 灼烧橙（dot）。

const dmgTexts = [];

const DMG_TEXT = {
  life: 0.9,        // 存活时长（秒）
  rise: 30,         // 全程上浮总高度（px，世界坐标）
  font: '700 13px "JetBrains Mono", monospace',
  colors: {
    pen:    '#ff6c5c',   // 击穿红/橙
    block:  '#d9dcc9',   // 未击穿白
    bounce: '#5cc8ff',   // 跳弹蓝/白
    he:     '#ffb454',   // 高爆黄
    dot:    '#ff9a3c'    // DOT 灼烧橙
  }
};

/**
 * 生成一条飘字。kind ∈ DMG_TEXT.colors 键；未知 kind 回退 'pen'。
 * @param {number} x 世界坐标
 * @param {number} y 世界坐标
 * @param {string|number} text 显示文本（如伤害数值 / '跳弹'）
 * @param {string} [kind] 'pen'|'block'|'bounce'|'he'|'dot'
 */
function spawnDmgText(x, y, text, kind){
  dmgTexts.push({
    x, y,
    text: String(text),
    kind: kind || 'pen',
    age: 0,
    life: DMG_TEXT.life
  });
}

/**
 * 逐帧推进全部飘字（上浮进度 = age/life；到期移除）。
 * @param {number} dt 帧步长（秒）
 */
function updateDmgTexts(dt){
  if(dt <= 0) return;
  for(const t of dmgTexts) t.age += dt;
  for(let i = dmgTexts.length - 1; i >= 0; i--){
    if(dmgTexts[i].age >= dmgTexts[i].life) dmgTexts.splice(i, 1);
  }
}

/**
 * 在世界坐标绘制（消费方需先套好摄像机变换；屏幕空间也可直接调用）。
 * @param {CanvasRenderingContext2D} ctx
 */
function drawDmgTexts(ctx){
  if(!dmgTexts.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = DMG_TEXT.font;
  for(const t of dmgTexts){
    const p = Math.min(1, t.age / t.life);
    const alpha = 1 - p;
    const y = t.y - DMG_TEXT.rise * p;
    ctx.globalAlpha = Math.max(0, alpha);
    // 深色描边底（1px 偏移双画），保证任何背景上可读
    ctx.fillStyle = 'rgba(10,12,8,0.85)';
    ctx.fillText(t.text, t.x + 1, y + 1);
    ctx.fillStyle = DMG_TEXT.colors[t.kind] || DMG_TEXT.colors.pen;
    ctx.fillText(t.text, t.x, y);
  }
  ctx.restore();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    dmgTexts,
    DMG_TEXT,
    spawnDmgText,
    updateDmgTexts,
    drawDmgTexts
  };
}
