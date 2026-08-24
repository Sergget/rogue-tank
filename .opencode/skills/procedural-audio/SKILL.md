# Procedural Audio Skill

## 适用场景
- 战斗音效：开火/击穿/跳弹/未击穿/弹药架殉爆/履带断/起火灼烧
- 环境音效：引擎怠速/加速/履带滚动/风声
- UI 音效：按钮/卡牌选择/商店购买/升级
- 空间音效：炮弹飞越/爆炸远近衰减/方向性

## 现有基础（`js/tank_audio.js`）
- `SOUND_DEFS`：13 类音效参数表（`fire/pen/block/bounce/ammoBlew/trackBreak/fireDOT/ui/engine/flyby/trackFx/ammoBlewAP/ammoBlewHE`）
- `playSound(key, opts?)`：单入口，惰性初始化 `AudioContext`，Web Audio 全合成
- 总线：`combat` / `ui` 两路增益（`AUDIO_SETTINGS.combatGain=0.6` / `uiGain=0.35`）
- 合成器：`OscillatorNode` + `GainNode` (ADSR包络) + `BiquadFilterNode` + `AudioBufferSourceNode` (噪声)

## 扩展方向
| 维度 | 当前 | 目标 |
|------|------|------|
| 合成器 | 单振荡器+包络 | 多振荡器/FM/波表/物理建模 |
| 空间化 | 无 | `PannerNode` 3D 定位（距离/方向/多普勒/锥向） |
| 分层 | 单层 | 多层并行（低频冲击+高频碎片+尾音/共鸣） |
| 随机性 | 固定参数 | 受控随机（种子/概率分布/变奏/人化） |
| 自适应 | 无 | 战斗强度/距离/环境/载具类型动态调参 |

## 参数化定义扩展（`SOUND_DEFS` 新字段规范）
```js
// 完整示例：主炮开火
fire: {
  label: '主炮开火',
  bus: 'combat',                    // 'combat' | 'ui'
  priority: 100,                    // 并发抢占优先级（高者打断低者）
  maxConcurrent: 3,                 // 同键最大并发实例数
  spatial: {                        // 空间化配置（可选）
    pannerType: 'HRTF',             // 'HRTF' | 'equalpower'
    distanceModel: 'exponential',   // 'linear' | 'inverse' | 'exponential'
    rolloffFactor: 1.5,             // 衰减系数
    maxDistance: 800,               // 最大可听距离(px)
    refDistance: 50,                // 参考距离(px)
    coneInnerAngle: 60,             // 锥向内角(度)
    coneOuterAngle: 120,            // 锥向外角(度)
    coneOuterGain: 0.3              // 锥向外增益
  },
  layers: [                         // 多层合成（按顺序并行）
    // 层 1：低频冲击波
    {
      type: 'osc',                  // 'osc' | 'noise' | 'buffer'
      wave: 'square',               // osc: 'sine'|'square'|'sawtooth'|'triangle'
      freq: 80,                     // 基频(Hz)
      detune: -1200,                // 音分微调
      gain: 0.6,                    // 层增益(0-1)
      dur: 0.08,                    // 时长(秒)
      env: { type: 'perc', attack: 0.005, decay: 0.075 },  // 包络
      filter: { type: 'lowpass', freq: 200, Q: 2 }         // 滤波器
    },
    // 层 2：中频机械声
    {
      type: 'osc',
      wave: 'sawtooth',
      freq: 180,
      detune: 50,
      gain: 0.4,
      dur: 0.12,
      env: { type: 'perc', attack: 0.01, decay: 0.11 },
      filter: { type: 'bandpass', freq: 800, Q: 1.5 }
    },
    // 层 3：高频碎片/尾音
    {
      type: 'noise',
      color: 'brown',               // 'white'|'pink'|'brown'
      gain: 0.35,
      dur: 0.25,
      env: { type: 'exp', decay: 0.25 },
      filter: { type: 'highpass', freq: 2000, Q: 1 }
    },
    // 层 4：远处回声（延迟层）
    {
      type: 'osc',
      wave: 'sine',
      freq: 40,
      gain: 0.15,
      dur: 0.5,
      env: { type: 'exp', decay: 0.5 },
      delay: 0.08                   // 延迟触发(秒)
    }
  ]
}
```

## 包络类型（`env.type`）
- `'perc'`：打击乐型 — `attack` + `decay`（快启快衰）
- `'exp'`：指数衰减 — `decay`（自然衰落）
- `'adsr'`：完整 ADSR — `attack`/`decay`/`sustain`/`release`
- `'gate'`：门控 — `attack`/`release`（按键按下/释放）

## 空间化用法（运行时）
```js
// playSound 内部自动处理（若 SOUND_DEFS[key].spatial 存在）
const panner = ctx.createPanner();
Object.assign(panner, def.spatial);
panner.positionX.value = x;   // 世界坐标
panner.positionY.value = y;
panner.positionZ.value = 0;
// 监听器位置 = 摄像机位置（cam.x, cam.y）
```

## 验收标准
- `npm run check` 通过
- `npm test` → `scripts/test-audio.js` 全绿：
  - ✓ `SOUND_DEFS` 键数 ≥ 8（实际 13+）
  - ✓ 8 个历史必需键齐全：`fire/pen/block/bounce/ammoBlew/trackBreak/fireDOT/ui`
  - ✓ 所有参数合法（频率>0、增益0-1、时长>0、包络字段完整）
  - ✓ `playSound("fire")` / 未知键不抛错、无 `AudioContext` 环境静默返回 `false`
- 听感：无爆音/削波、战斗/UI 总线分离、远近衰减自然、方向感清晰

## 调试工具（可选）
- `tools/audio-preview.html`：实时调参页面，按键试听、波形可视化、频谱分析
- `playSound(key, { debug: true })`：控制台打印合成图节点结构