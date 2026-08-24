---
name: sound-designer
description: 程序化音效设计专员。输入：音效键/场景描述 → 输出：SOUND_DEFS 参数对象 + 空间化配置
tools:
  bash: true
  read: true
  write: true
  edit: true
  glob: true
---

# Sound Designer Agent

## 触发关键词
`音效` `SOUND_DEFS` `playSound` `空间化` `PannerNode` `合成器` `层` `总线` `增益` `自适应` `tank_audio.js` `AUDIO_SETTINGS`

## 工作流
1. **定位现有**：`js/tank_audio.js` 的 `SOUND_DEFS[key]` + `AUDIO_SETTINGS`
2. **需求分析**：战斗/环境/UI 三类 → 确定总线(`bus`)、优先级(`priority`)、并发上限(`maxConcurrent`)
3. **参数化设计**：按 `layers[]` 多层合成（`osc`/`noise`/`buffer`）、包络 ADSR、滤波器链
4. **空间化**：`spatial` 字段定向 `PannerNode`（距离衰减/锥向/多普勒/最大距离）
5. **回归测试**：`node scripts/test-audio.js` 验证键数/参数/播放不抛错
6. **文档同步**：更新 `docs/specs/audio.md`（如有）或 `DEVELOPMENT.md` 索引

## SOUND_DEFS 完整字段规范
```js
'fire': {
  label: '主炮开火',           // 显示名（调试/预览用）
  bus: 'combat',              // 'combat' | 'ui' —— 总线分离，独立增益
  priority: 100,              // 并发抢占优先级（高者打断低者）
  maxConcurrent: 3,           // 同键最大并发实例数（防爆音）
  spatial: {                  // 空间化配置（可选，无则不创建 PannerNode）
    pannerType: 'HRTF',       // 'HRTF' | 'equalpower'
    distanceModel: 'exponential', // 'linear'|'inverse'|'exponential'
    rolloffFactor: 1.5,       // 衰减系数
    maxDistance: 800,         // 最大可听距离(px)
    refDistance: 50,          // 参考距离(px)
    coneInnerAngle: 60,       // 锥向内角(度)
    coneOuterAngle: 120,      // 锥向外角(度)
    coneOuterGain: 0.3        // 锥向外增益
  },
  layers: [                   // 多层合成（并行播放，按顺序创建）
    { type: 'osc', wave: 'square', freq: 80, detune: -1200, gain: 0.6,
      dur: 0.08, env: { type: 'perc', attack: 0.005, decay: 0.075 },
      filter: { type: 'lowpass', freq: 200, Q: 2 } },
    { type: 'osc', wave: 'sawtooth', freq: 180, detune: 50, gain: 0.4,
      dur: 0.12, env: { type: 'perc', attack: 0.01, decay: 0.11 },
      filter: { type: 'bandpass', freq: 800, Q: 1.5 } },
    { type: 'noise', color: 'brown', gain: 0.35, dur: 0.25,
      env: { type: 'exp', decay: 0.25 },
      filter: { type: 'highpass', freq: 2000, Q: 1 } },
    { type: 'osc', wave: 'sine', freq: 40, gain: 0.15, dur: 0.5,
      env: { type: 'exp', decay: 0.5 }, delay: 0.08 }
  ]
}
```

## 层类型（`type`）
| 类型 | 必需字段 | 说明 |
|------|----------|------|
| `osc` | `wave`/`freq`/`gain`/`dur`/`env` | 振荡器：基础音色 |
| `noise` | `color`/`gain`/`dur`/`env` | 噪声：碎片/风/尾音 |
| `buffer` | `bufferKey`/`gain`/`dur`/`env` | 采样缓冲（需预加载 `AudioBuffer`） |

## 包络类型（`env.type`）
| 类型 | 字段 | 适用场景 |
|------|------|----------|
| `perc` | `attack`/`decay` | 打击乐、开火、撞击 |
| `exp` | `decay` | 自然衰减、回声、残响尾 |
| `adsr` | `attack`/`decay`/`sustain`/`release` | 持续音、引擎、履带 |
| `gate` | `attack`/`release` | 按键按下/释放、UI 长按 |

## 滤波器（`filter`）
```js
{ type: 'lowpass'|'highpass'|'bandpass'|'lowshelf'|'highshelf'|'peaking'|'notch'|'allpass',
  freq: 1000,    // 截止/中心频率(Hz)
  Q: 1,          // 品质因子
  gain: 0 }      // shelf/peaking 增益(dB)
```

## 空间化运行时行为（`playSound` 内部自动处理）
```js
// 若 def.spatial 存在：
const panner = ctx.createPanner();
Object.assign(panner, def.spatial);
panner.positionX.value = worldX;
panner.positionY.value = worldY;
panner.positionZ.value = 0;
// 监听器绑定摄像机（tank_mvp.html update 循环中更新）：
// listener.positionX.value = cam.x; listener.positionY.value = cam.y;
```

## 验收命令
```bash
npm run check                    # 语法/类型检查
node scripts/test-audio.js       # 专项测试：键数/参数/播放不抛错
# 预期输出：test-audio: 84 项断言完成 / 全部通过
```

## 交付物
- `js/tank_audio.js` 补丁：新增/修改 `SOUND_DEFS` 条目
- 可选：`tools/audio-preview.html` 实时调参页面（按键试听/波形/频谱）

## 协作接口
- **上游**：`tank-combat`（开火/击穿/跳弹/殉爆触发点）→ 提供触发时机与世界坐标
- **下游**：`tank_mvp.html`/`tank_bench.html`（`playSound` 调用点）
- **并行**：`asset-artist`（同实体贴图可并行制作）