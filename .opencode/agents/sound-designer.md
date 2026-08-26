---
name: sound-designer
description: 程序化音效设计专员。输入：音效键/场景描述 → 输出：SOUND_DEFS 参数对象 + 空间化配置
mode: subagent
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
2. **需求分析**：战斗/环境/UI 三类 → 确定总线(`bus`: master/combat(0.5)/ui(0.25)/env(0.4) 四总线，env 挂 water/mud/rubble/treeFall/fenceBreak 且参与空间化)、优先级(`priority`)、并发上限(`maxConcurrent`)
3. **双通道决策**：采样优先 + 合成兜底——`AUDIO_BUFFERS` 字典惰性加载（首次 `playSound(key)` 发起 fetch 当次即走合成，不等待）；per-key 失败永久回退合成（fetch 非 2xx / decodeAudioData reject / `file://` 协议直接跳过 fetch，标记 `state='failed'` 本会话不再重试）；播放决策抽为纯函数 `resolvePlayback(key, playerState) → {action: 'sample'|'synth'|'steal'|'skip', victimId?}`（零 Web Audio 依赖，Node 可测四分支）
4. **参数化设计**：按 `layers[]` 多层合成（`osc`/`noise`/`buffer`）、包络 ADSR、滤波器链
5. **空间化**：`spatial` 字段定向 `PannerNode`（equalpower 声像/exponential 距离衰减/Lowpass 远场滤波；ui 总线不空间化）
6. **回归测试**：`node scripts/test-audio.js` 验证键数/参数/播放不抛错
7. **文档同步**：更新 `docs/specs/audio.md`（如有）或 `DEVELOPMENT.md` 索引

## SOUND_DEFS 完整字段规范
```js
'fire': {
  label: '主炮开火',           // 显示名（调试/预览用）
  bus: 'combat',              // 'combat' | 'ui' | 'env' —— 四总线（master 根节点）分离，独立增益
  priority: 100,              // 并发抢占优先级（高者打断低者）
  maxConcurrent: 3,           // 同键最大并发实例数（防爆音，oldest-steal 抢占）
  spatial: {                  // 空间化配置（可选，无则不创建 PannerNode；ui 总线不空间化）
    panningModel: 'equalpower', // 选型定案 equalpower：2D 俯视角无高度维，HRTF 引入音色染色与前后镜像混淆且 CPU 开销高
    distanceModel: 'exponential', // 'linear'|'inverse'|'exponential'
    rolloffFactor: 1.2,       // 衰减系数（combat=1.2 / env=1.5）
    maxDistance: 1200,        // 最大可听距离(px) ≈ 典型视口对角线
    refDistance: 100,         // 参考距离(px)
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

## 暂缓储备规范（2026-08-26 自 PLAN.md 移入，恢复执行时按此实施）

> **状态：暂缓——待玩法核心专项（新编号 P-42~P-44）完成后恢复。**
> 来源：原 `docs/PLAN.md`「音频与声效专项 PLAN (P-46 ~ P-49)」（实施方案细化 2026-08-24）。本批计划引入外部免费开源音效库（CC0 / OpenGameArt / Freesound）并升级音效系统，恢复执行前不改动代码逻辑。

### 储备一（原 P-46）：免费音频采样库引入与结构规划

**采样归类与选型**：武器与火炮（主炮开火/高爆弹爆响/机枪扫射）、命中与受损（跳弹尖啸/击穿切削/未击穿钝响/履带断裂/弹药架殉爆）、动力与机械（柴油引擎怠速/加速/高速、履带绞动、炮塔齿轮摩擦）、环境与交互（泥地水池泥潭溅射、树木倒塌、栅栏破坏）、战术与 UI（卡牌抽取点击/按钮反馈/装填卡扣/警告蜂鸣）。

**音效键清单表**（键名 → 用途 → 触发场景 → 来源候选检索关键词 → 格式规范，**原样保留**）：

| 键名 | 用途 | 触发场景 | 检索关键词（Freesound / OpenGameArt / Sonniss GDC 包） | 格式规范 |
|---|---|---|---|---|
| fire | 主炮开火 | 任意坦克开火（4 弹种共用，pitch 微随机区分） | "tank cannon fire", "120mm gunshot", "artillery blast" | WAV 44.1kHz 16bit 单声道 SFX |
| pen | 装甲击穿 | 命中结果 pen（穿透切削） | "metal penetration screech", "armor pierce clang" | 同上 |
| block | 未击穿钝响 | 命中结果 block（拦截） | "armor impact dull thud", "ricochet thunk metal" | 同上 |
| bounce | 跳弹尖啸 | 命中结果 bounce（>70° 反射） | "bullet ricochet whistle", "ricochet ping" | 同上 |
| ammoBlew / ammoBlewAP / ammoBlewHE | 弹药架殉爆（通用/AP/HE 变体） | 模块损伤弹药架殉爆 | "ammunition explosion", "interior explosion tank" | WAV 44.1kHz 16bit 单声道，允许轻微立体声宽化后处理 |
| trackBreak | 履带断裂 | 模块损伤履带断裂 | "metal crash debris", "track break clank" | WAV 44.1kHz 16bit 单声道 |
| fireDOT | 起火燃烧 | dot 持续伤害 tick | "fire crackle loop short", "burning metal creak" | WAV 44.1kHz 16bit 单声道，可选 loopable |
| flyby | 炮弹掠空 | 高速炮弹近距掠过摄像机 | "shell flyby whoosh" | 同上 |
| engine | 引擎循环 | 动态引擎层（储备三） | "diesel engine idle loop", "tank engine drive loop" | WAV 44.1kHz 16bit 单声道，必须无缝 loopable（首尾交叉淡化） |
| trackFx | 履带机械循环 | 履带滚动/侧滑（储备三） | "tracked vehicle rattle loop", "metal tread clank" | 同上 |
| turretLoop | 炮塔齿轮摩擦 | 炮塔回旋（储备三） | "gear grind slow", "motor whir mechanical" | 同上 |
| waterSplash | 涉水 | water tier 行驶（储备四） | "water splash shallow", "driving through water" | 同上 |
| mudSquelch | 泥泞 | mud tier 行驶（储备四） | "mud squelch", "wet soil suction" | 同上 |
| rubbleCrunch | 碎石碾压 | rubble/ruined tier 行驶（储备四） | "gravel crunch", "rubble crush short" | 同上 |
| treeFall | 树木倒塌 | 掩体破坏（树 tier） | "tree fall crash forest" | 同上 |
| fenceBreak | 栅栏破坏 | 掩体破坏（栅栏/沙袋 tier） | "wooden fence break", "sandbag hit thud" | 同上 |
| cardSelect | 卡牌抽取 | 卡牌奖励界面选择 | "card slide pick", "paper flick" | WAV 44.1kHz 16bit 单声道 UI 短音 |
| click | 按钮 | 全局按钮反馈 | "ui click soft", "button press plastic" | 同上 |
| reloadDone | 装填完成 | 主炮装填完毕卡扣 | "metal latch click", "bolt lock mechanical" | 同上 |
| warnBeep | 警告蜂鸣 | 低血量/弹药架受损警告 | "warning beep military", "alarm short tone" | 同上 |
| settleJingle | 结算/商店确认 | 节点结算、局内商店购买、奖励领取 | "success chime short", "coin reward" | 同上 |

**现有 SOUND_DEFS 八键映射对照表**（合成兜底保留，采样命中即替换音源不改触发点）：`fire→combat/fire_*.wav`；`pen→combat/pen_*.wav`；`block→combat/block_*.wav`；`bounce→combat/bounce_*.wav`；`ammoBlew(+AP/HE)→combat/explosion_ammo_*.wav`；`trackBreak→combat/track_break_*.wav`；`fireDOT→combat/fire_dot_loop.wav`；`ui→ui/click_*.wav`。后补键（engine/trackFx/flyby 等）直接对应新采样，无历史映射。

**采样文件命名规划与许可合规**：目录架构 `audio/combat/`、`audio/engine/`、`audio/env/`、`audio/ui/`，命名 `键名_变体.wav`（变体 `_01/_02/_03`，同键至少 2 个变体防听感重复）。完整规划：
- `audio/combat/`：fire_01/02/03.wav、pen_01/02.wav、block_01/02.wav、bounce_01/02/03.wav、explosion_ammo_01/02.wav（AP/HE 变体以 pitch 后缀 `_ap/_he` 区分）、track_break_01/02.wav、fire_dot_loop.wav、flyby_01/02.wav；
- `audio/engine/`：diesel_idle_loop.wav、diesel_drive_loop.wav、track_metal_loop.wav、turret_gear_loop.wav；
- `audio/env/`：water_splash_01/02/03.wav、mud_squelch_01/02/03.wav、rubble_crunch_01/02.wav、tree_fall_01.wav、fence_break_01/02.wav；
- `audio/ui/`：click_01/02.wav、card_select_01/02.wav、reload_done.wav、warn_beep.wav、settle_jingle.wav。
- 随机变体防重复机制：播放用「洗牌袋」而非纯随机——同键全部变体索引洗入队列逐个弹出，取尽重洗；保证任一变体不连续出现且频次均匀。

**许可合规要求**：CC0 优先选入；CC-BY / CC-BY-SA 允许但必须在 `audio/CREDITS.md` 逐文件记录，字段约定固定为：`file`（相对路径）/ `title` / `author` / `source_url` / `license` / `modifications`（是否裁剪/降采样）/ `added_date`。无 CREDITS.md 条目的 CC-BY 文件视为不合规，构建前校验脚本应报错。

**文件体积预算**：单文件 ≤ 300KB（loopable 循环类放宽至 ≤ 800KB）；`audio/` 总包上限 ≤ 8MB；首版统一 WAV 保证 `decodeAudioData` 行为一致。

### 储备二（原 P-47）：双通道 Web Audio 播放器与采样加载器

**目标**：「音频文件采样优先 + Web Audio 原生合成兜底」双通道架构。要点：
- **AUDIO_BUFFERS 缓存字典**：`AUDIO_BUFFERS[key] = {buffer|null, state: 'loading'|'ready'|'failed'}`；惰性加载——首次 `playSound(key)` 若 state 为 undefined 则发起 fetch 并立即走合成兜底（当次不等待），加载完成后下一次调用切换到采样；
- **预加载清单分级**：进战斗节点预载 combat 组（fire/pen/block/bounce 优先）；实体 spawn 时预载 engine 组循环；UI 组首页空闲预载；env 组按当前 biome 的 tier 子集预载；
- **内存释放**：跨节点复用不释放；LRU 总量上限默认 64MB，超限释放最久未用的非循环 buffer（loop 类常驻），state 重置为 undefined 以便再次惰性加载；
- **per-key 回退粒度**：满足其一即该 key 判定失败——① fetch 非 2xx；② decodeAudioData reject；③ `location.protocol === 'file://'` 则整个会话跳过 fetch。失败 key 标记 `state='failed'` **永久走 SOUND_DEFS 合成（本会话不再重试）**，不影响其他 key 继续用采样；无全局开关；
- **playSound 入口向后兼容**：保持 `playSound(key)` 及现有调用点零改动；新能力只经可选第二参数扩展（如 `playSound(key, {worldX, worldY, loopId})`）；
- **Node 双端可测**：决策逻辑抽成纯函数 `resolvePlayback(key, playerState) → {action: 'sample'|'synth'|'steal'|'skip', victimId?}`（输入缓存状态/并发计数/优先级表，零 Web Audio 依赖），副作用封装浏览器分支，保持底部 `module.exports` 双端导出。

**priority 与 maxConcurrent 参数表**（oldest-steal 抢占：同键超限停掉最旧实例而非拒绝新实例，**原样保留**）：

| 键组 | priority | maxConcurrent | 说明 |
|---|---|---|---|
| ammoBlew 系列 | 110 | 2 | 最高优先，殉爆不可被淹没 |
| fire | 100 | 3 | 开火连发防爆音 |
| pen | 90 | 4 | 高频命中主反馈 |
| trackBreak | 80 | 2 | |
| block | 70 | 5 | |
| bounce | 60 | 5 | |
| fireDOT / flyby | 40 | 2 | 低优先 tick 类 |
| env（splash/mud/rubble） | 35 | 4 | |
| ui 组 | 30 | 8 | 不参与战斗抢占 |
| engine/track/turret loop | — | 1 | 单实例循环，不受并发限制 |

### 储备三（原 P-48）：动态柴油引擎、履带与机械循环声

依据坦克运动状态（速度/加速度/转向）动态调制 pitch 与 volume 的连续音效。

**引擎循环调制参数表**：

| 参数 | 数值（默认，可调） | 说明 |
|---|---|---|
| playbackRate 区间 | 0.85 ~ 1.25 | 按 `speed/maxSpeed` 线性映射 idle→throttle |
| volume 曲线 | 0.25 → 0.70 | 按 `(speed/maxSpeed)^1.5` 缓动（低速段更安静） |
| 插值平滑时间常数 | 加速 τ=0.15s / 减速 τ=0.35s | 一阶低通平滑，不对称常数模拟柴油机响应迟滞 |
| 静止怠速保底 | speed < 0.05×maxSpeed 时锁定 idle 采样 | 防止蠕动速度抖动 |

- **履带循环节奏同步**：track click 与履带渲染 Phase 同源——每累计 Phase 走过 π 弧度触发一次 `trackFx` 短击（左右交替 pan ±0.2），Phase 由 `tank_move.js` 已有履带相位驱动；速度 < 0.1×maxSpeed 不触发；转弯侧滑阈值：`|turnRate × speed| > 0.6 × (turnRate上限 × maxSpeed)` 时叠加侧滑摩擦层（volume 随超出比例 0→0.4 映射）。
- **炮塔旋转齿轮声**：`|turretAngVel| > 0.15 rad/s` 启动；volume 线性映射 0→0.3（对应 0.15~1.2 rad/s）；playbackRate = 0.9 + 0.3 × 归一化角速度；角速度回落到阈值下继续播至包络 release 收尾（≥0.3s）防咔哒断音。
- **多车并存混音**：玩家循环全量播放；敌方/友军按距摄像机距离排序取最近 N=3 辆播放循环，其余静默；全场景循环实例总数上限 4（玩家 3 层算 1 辆），超限按距离砍尾。
- **停止条件**：实体死亡立即 fade-out（≤0.3s）；flow 进入 settlement/reward/map/gameover 态统一停止并复位调制参数；ESC 暂停面板打开时 master 总线 duck 至 -12dB（或 gain=0），关闭恢复。
- **Node 可测性约束**：`engineMod(speedRatio)`、`shouldTrackTick(phaseDelta)`、侧滑判定等调制计算抽纯函数供 Node 测试。

### 储备四（原 P-49）：2D 战场空间音效与环境反馈

利用 `PannerNode` 与 `AudioListener` 提升俯视角战场的空间方位感与沉浸感。

- **AudioListener 绑定约定**：mvp 页 `update()` 循环内每帧同步一次：`listener.positionX/Y = cam.x/cam.y`，`positionZ = 0`；朝向固定 forward=(0,-1)、up=(0,0,1)。
- **距离衰减参数定案**：`distanceModel='exponential'`、`refDistance=100px`、`maxDistance=1200px`（≈典型视口对角线，视口外战斗保留远沉爆轰可闻度）；`rolloffFactor` combat=1.2、env=1.5、ui 不空间化（直连 ui 总线）。
- **panningModel 选型结论：equalpower**。理由：2D 俯视角无高度维信息，HRTF 的三维卷积优势无法体现，反而引入音色染色与前后镜像混淆，且每实例 CPU 开销显著更高；equalpower 计算廉价、左右方位感对本项目完全够用，与大量并发 combat 实例的性能预算匹配。
- **Lowpass 远场滤波截止频率曲线**：`cutoff = 800 + 19200 × (1 − d/maxDistance)^1.5` Hz（近场全频 → 远场趋近 800Hz 闷响）；仅对含爆炸成分的键（fire/ammoBlew/pen/he 类）启用，UI 与循环声不滤波。
- **地形 tier → 音效键映射**：`water → waterSplash(_01..03)`；`mud → mudSquelch(_01..03)`；`ruined/rubble → rubbleCrunch(_01..02)`；`rock/intact grass → 无叠加`。触发机制为行程间隔而非定时器：按累计行驶里程每 ~90px 触发一次变体抽取（洗牌袋），静止不触发、速度快自然高频，里程清零于 tier 切换时。
- **总线分组与增益结构**（四总线，master 为根；**原样保留**）：

| 总线 | 相对增益 | 挂载内容 |
|---|---|---|
| master | 1.0 | 总出口，暂停 duck 作用于此 |
| combat | 0.5（沿用现有 combatGain） | fire/pen/block/bounce/ammoBlew/trackBreak/fireDOT/flyby + engine/track/turret 循环 |
| ui | 0.25（沿用现有 uiGain） | click/cardSelect/reloadDone/warnBeep/settleJingle，不空间化 |
| env | 0.4（新增，可调） | water/mud/rubble/treeFall/fenceBreak，参与空间化 |

- **Node 可测性约束**：tier→键映射、里程触发判定、cutoff 曲线计算抽纯函数供 Node 测试。

### 恢复执行时的验收标准汇总

- **储备一**：① 清单表中每个键在 `audio/` 下有 ≥1 个实际文件且命名符合规划；② 全部文件为 WAV 44.1kHz 16bit（loopable 首尾无缝）；③ `audio/CREDITS.md` 覆盖所有非 CC0 文件且字段齐全；④ 总体积 ≤ 预算上限。
- **储备二**：① 断网/删除 audio/ 目录时所有音效仍由合成兜底正常发声（per-key 回退无全局失效）；② file:// 协议打开不产生控制台报错风暴；③ 同键并发不超上限且被抢的是最旧实例；④ `resolvePlayback` 纯函数 Node 测试覆盖 sample/synth/steal/skip 四分支；⑤ 现有 `playSound(key)` 调用点 diff 为零。
- **储备三**：① 引擎 pitch/volume 随油门连续变化无可闻台阶；② 履带短击与画面履带滚轮节奏一致；③ 急转可闻侧滑层；④ 多车循环实例 ≤ 上限且优先最近车辆；⑤ 死亡/结算/暂停三态循环正确停止；⑥ 调制纯函数 Node 测试通过。
- **储备四**：① 屏幕边缘外开火有声像偏移与低通闷响；② equalpower 下无前后镜像错乱投诉点；③ 涉水/入泥/碾石切换地形即时换音且静止无声；④ 四总线增益独立可调、暂停时整体 duck；⑤ 映射与曲线纯函数 Node 测试通过。