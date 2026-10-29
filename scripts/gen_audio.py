#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
程序化音效采样生成器（离线，旁路通道）。

用途
    生成 `audio/<key>.wav`，供 `js/tank_audio.js` 的**采样优先通道**
    （`AUDIO_SAMPLE_PATHS`）使用。该通道在采样缺失 / 超时 / `file://` 下
    自动回退到 WebAudio 程序化合成。

现状（2026-10-29）
    **实机路径是全合成零资产**（2026-10-23 用户裁定，见 `docs/DEVELOPMENT.md`
    §4.124 与 `docs/specs/combat/audio.md`）。`audio/` 目录当前不存在，
    采样通道全部 404 并回退合成——这是**预期状态**，不是缺陷。
    本脚本是那条通道的供给侧，保留以备后续启用真实采样。

覆盖度
    生成 14 个键：fire / pen / block / bounce / ammoBlew / trackBreak /
    fireDOT / ui / engine / trackFx / flyby / ammoBlewAP / ammoBlewHE /
    firerail。
    `SOUND_DEFS` 现有 16 个键，**缺 `railReady` / `bossRailFire`**
    （2026-10-26 AA-c 新增，本脚本未跟进）——启用采样前需补齐这两条配方。

用法
    python scripts/gen_audio.py [输出目录]
    默认输出到仓库根的 `audio/`；`audio/` 已 gitignore（生成物不入库）。

依赖
    numpy（本仓库唯一的 Python 第三方依赖，仅本脚本需要）

注意
    波形全部按 `SR=44100` 单声道 16-bit 写出；`np.random.uniform` 无固定种子，
    同一配方每次生成的噪声成分不同（听感一致，文件不逐字节可复现）。
"""

import os
import sys
import wave

import numpy as np

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else "audio"


def save(name, samples):
    """把 [-1,1] 浮点波形写成单声道 16-bit WAV，末尾 200 采样淡出防爆音。"""
    samples = np.clip(samples, -1.0, 1.0)
    n = len(samples)
    fade = np.ones(n)
    if n > 200:
        fade[-200:] = np.linspace(1, 0, 200)
    samples = samples * fade
    pcm = (samples * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name + ".wav"), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def env(t, attack=0.005, decay=0.2):
    e = np.zeros_like(t)
    a = int(attack * SR)
    d = int(decay * SR)
    if a > 0:
        e[:a] = np.linspace(0, 1, a)
    if d > 0 and a + d <= len(t):
        e[a:a + d] = np.exp(-np.linspace(0, 6, d))
    if a + d < len(t):
        e[a + d:] = e[a + d - 1] * np.exp(-np.linspace(0, (len(t) - a - d) / SR * 8, len(t) - a - d))
    return e


def noise(n):
    return np.random.uniform(-1, 1, n)


def tone(freq, dur, amp=0.5):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    return amp * np.sin(2 * np.pi * freq * t)


recipes = {}

# fire：枪口爆鸣 = 短促噪声 + 低频鼓包
dur = 0.35
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
s = np.zeros(int(SR * dur))
s[:int(SR * 0.015)] = noise(int(SR * 0.015)) * np.exp(-np.linspace(0, 30, int(SR * 0.015))) * 0.9
s += 0.7 * np.sin(2 * np.pi * 90 * t) * np.exp(-t * 7)
recipes['fire'] = s

# pen：金属穿透鸣响
dur = 0.4
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
recipes['pen'] = (0.6 * np.sin(2 * np.pi * 1200 * t) * np.exp(-t * 8)
                  + 0.3 * np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 12))

# block：闷响（未穿透）
dur = 0.25
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
recipes['block'] = (0.8 * np.sin(2 * np.pi * 60 * t) * np.exp(-t * 10)
                    + 0.4 * noise(int(SR * dur)) * np.exp(-t * 15) * 0.3)

# bounce：跳弹啸叫（频率上扫）
dur = 0.3
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
f = 800 + 2000 * t / dur
recipes['bounce'] = 0.5 * np.sin(2 * np.pi * f * t) * np.exp(-t * 4)

# ammoBlew：弹药爆轰
dur = 0.8
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
recipes['ammoBlew'] = (0.9 * noise(int(SR * dur)) * np.exp(-t * 4)
                       + 0.6 * np.sin(2 * np.pi * 50 * t) * np.exp(-t * 3))

# trackBreak：履带崩断（调制噪声）
dur = 0.3
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
recipes['trackBreak'] = (0.7 * noise(int(SR * dur)) * np.exp(-t * 8)
                         * (0.5 + 0.5 * np.sin(2 * np.pi * 30 * t)))

# fireDOT：持续燃烧嘶声
dur = 0.6
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
recipes['fireDOT'] = (0.4 * noise(int(SR * dur))
                      * (0.3 + 0.7 * np.sin(2 * np.pi * 7 * t)) * np.exp(-t * 2))

# ui：界面点击
dur = 0.08
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
recipes['ui'] = 0.5 * np.sin(2 * np.pi * 880 * t) * np.exp(-t * 40)

# engine：怠速低频轰鸣
dur = 0.6
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
recipes['engine'] = 0.4 * np.sin(2 * np.pi * 45 * t) + 0.2 * noise(int(SR * dur)) * 0.3

# flyby：弹丸掠过（高斯包络 + 频率上扫）
dur = 0.5
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
f = 200 + 1500 * t / dur
recipes['flyby'] = 0.5 * np.sin(2 * np.pi * f * t) * np.exp(-((t - dur / 2) ** 2) * 8)

# trackFx：履带金属撞击
dur = 0.2
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
recipes['trackFx'] = (0.6 * np.sin(2 * np.pi * 400 * t) * np.exp(-t * 12)
                      + 0.4 * np.sin(2 * np.pi * 800 * t) * np.exp(-t * 18))

# ammoBlewAP：穿甲弹殉爆（重）
dur = 0.9
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
recipes['ammoBlewAP'] = (1.0 * noise(int(SR * dur)) * np.exp(-t * 3)
                         + 0.8 * np.sin(2 * np.pi * 40 * t) * np.exp(-t * 2.5))

# ammoBlewHE：高爆殉爆（更重更长）
dur = 1.0
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
recipes['ammoBlewHE'] = (1.0 * noise(int(SR * dur)) * np.exp(-t * 2.5)
                         + 0.7 * np.sin(2 * np.pi * 35 * t) * np.exp(-t * 2))

# firerail：电磁炮放电（高频扫频 + 爆裂）
dur = 0.4
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
f = 100 + 3000 * t / dur
recipes['firerail'] = (0.7 * np.sin(2 * np.pi * f * t) * np.exp(-t * 5)
                       + 0.4 * noise(int(SR * dur)) * np.exp(-t * 20))

os.makedirs(OUT, exist_ok=True)
for k, s in recipes.items():
    save(k, s)
print("done", len(recipes), "->", os.path.abspath(OUT))
