#!/usr/bin/env python3
"""gen_barrels.py — 为缺失 imgVehicle 的三型坦克程序化生成炮管贴图。

背景：drawSpriteBarrel（js/tank_battledraw.js）以 pivot=[0, naturalHeight/2]（尾端左缘、
垂直居中）绘制炮管，长度按 barrelLen/naturalWidth 归一化；tiger-I / Leapard_1 /
Obj 780 的 sprite.barrel 缺 imgVehicle，一直回退到通用 barrel-standard.png
（其纵横比 10.2% 使实绘管径只有 JSON barrel.width 的约一半）。

本脚本按**运行时程序化管径**反推画布纵宽比。运行时公式（js/tank_battledraw.js:523）：
    barrelWid = max(3, turWid * (barrel.width/100) * 0.5)  —— width 是炮塔宽度百分比，
    而非模型单位。H 反推：thickness_model = barrelWid（模型单位）
    H = thickness_model * W / (TUBE_FRAC * barrelLen)，管体占画布高 70%（对标 standard 实测 68%），
    barrelLen = turLen * len/100（turLen/turWid 经 tank_model.js 实测）
炮塔座（mantlet）全高通栏绘制，保证内容垂直中心 == 画布中心 == pivot 高度。

风格对标现存 barrel-*.png 实测剖面：尾端全高炮塔座 → 向炮口渐细约 6% →
炮口端满幅出图；顶部受光/底部 AO；确定性颗粒噪声。特征件取自各车 JSON barrel 字段：
    tiger-I   jacket(len35 pos11) + muzzle single（双室制退器）+ mantlet winged
    Leapard_1 evac long pos29（长抽烟器）+ muzzle none + mantlet collar
    Obj 780   evac slotted pos30（开槽抽烟器）+ muzzle none + mantlet box（粗管 w18）

确定性：random.Random(固定种子) 噪声，多次运行逐字节一致。
输出：assets/tanks/barrels/barrel-{tiger-I,leopard-1,obj780}.png（RGBA）；
建议随后跑 scripts/optimize_sprites.py --colors 16 收成 PNG-8。

运行：$env:PYTHONPATH="$PWD\\tmp\\pylibs"; python scripts/gen_barrels.py
"""
import os
import random
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.path.insert(0, os.path.join(os.getcwd(), 'tmp', 'pylibs'))
    from PIL import Image, ImageDraw

W = 1400
TUBE_FRAC = 0.70
SEED = 0xBA44E1

SPECS = {
    # out: 输出名；blen: 实测 barrelLen；width: JSON 管径（百分比）；turLen/turWid: 炮塔几何用于反推管径；base: 管体基色（hull 主色压暗后微调）
    'tiger-I':   dict(out='barrel-tiger-I.png',   blen=47.16, width=10, turLen=39.30, turWid=35.00, base=(61, 58, 52),
                      mantlet=('winged', 0.11), jacket=(0.11, 0.46, 1.18),
                      evac=None, muzzle='brake'),
    'leopard-1': dict(out='barrel-leopard-1.png', blen=48.14, width=10, turLen=33.20, turWid=26.40, base=(53, 53, 50),
                      mantlet=('collar', 0.08), jacket=None,
                      evac=(0.29, 0.13, 1.32, 'plain'), muzzle='rim'),
    'obj780':    dict(out='barrel-obj780.png',    blen=54.60, width=18, turLen=45.50, turWid=34.40, base=(50, 50, 50),
                      mantlet=('box', 0.09), jacket=None,
                      evac=(0.30, 0.11, 1.28, 'slotted'), muzzle='rim'),
}


def shade(base, mult):
    return tuple(max(0, min(255, int(c * mult))) for c in base)


def build(key, sp):
    # 管体半宽（模型单位）= 运行时程序化管径：max(3, turWid * width/100 * 0.5)
    thickness = max(3, sp['turWid'] * sp['width'] / 100 * 0.5)
    H = round(thickness * W / (TUBE_FRAC * sp['blen']))
    H += H % 2  # 偶数高，中心行对称
    cy = H / 2
    th = H * TUBE_FRAC / 2  # 管体半高
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    base = sp['base']
    mfrac = sp['mantlet'][1]

    def tube_half(fx):
        return th * (1 - 0.06 * fx)

    # 管体（分 64 条竖带逐带渐细）
    N = 64
    for i in range(N):
        x0 = int(mfrac * W + (W - mfrac * W) * i / N)
        x1 = int(mfrac * W + (W - mfrac * W) * (i + 1) / N)
        hh = tube_half((x0 + x1) / 2 / W)
        d.rectangle([x0, cy - hh, x1, cy + hh], fill=base + (255,))

    # jacket（加粗套筒段）/ evac（抽烟器鼓包）
    if sp['jacket']:
        j0, j1, jm = sp['jacket']
        d.rectangle([j0 * W, cy - th * jm, j1 * W, cy + th * jm],
                    fill=shade(base, 1.06) + (255,))
        for gx in (j0 + (j1 - j0) * 0.3, j0 + (j1 - j0) * 0.7):
            d.rectangle([gx * W - 2, cy - th * jm, gx * W + 2, cy + th * jm],
                        fill=shade(base, 0.55) + (255,))
    if sp['evac']:
        ec, el, em, style = sp['evac']
        ex0, ex1 = (ec - el / 2) * W, (ec + el / 2) * W
        d.rounded_rectangle([ex0, cy - th * em, ex1, cy + th * em],
                            radius=int(th * em), fill=shade(base, 1.08) + (255,))
        if style == 'slotted':
            for k in range(3):
                gx = ex0 + el * W * (0.25 + 0.25 * k)
                d.rectangle([gx - 2, cy - th * em, gx + 2, cy + th * em],
                            fill=shade(base, 0.5) + (255,))

    # 炮口：brake=双室制退器（加宽 + 双水平导气槽 + 端箍），rim=plain 端箍
    if sp['muzzle'] == 'brake':
        mx0 = 0.895 * W
        d.rectangle([mx0, cy - th * 1.32, W, cy + th * 1.32],
                    fill=shade(base, 0.97) + (255,))
        for sy in (-0.55, 0.05):
            d.rectangle([mx0 + 8, cy + th * sy, W - 14, cy + th * (sy + 0.28)],
                        fill=shade(base, 0.35) + (255,))
        d.rectangle([W - 10, cy - th * 1.32, W, cy + th * 1.32],
                    fill=shade(base, 1.15) + (255,))
    else:
        d.rectangle([0.985 * W, cy - th * 1.08, W, cy + th * 1.08],
                    fill=shade(base, 1.12) + (255,))

    # 炮塔座（全高通栏：定垂直中心；风格区分）
    style = sp['mantlet'][0]
    mwi = int(mfrac * W)
    d.rectangle([0, 0, mwi, H], fill=shade(base, 0.92) + (255,))
    if style == 'winged':
        d.polygon([(0, 0), (mwi, 0), (mwi - 14, 16), (0, 16)],
                  fill=shade(base, 1.1) + (255,))
        for bx in (mwi * 0.35, mwi * 0.7):
            d.ellipse([bx - 4, cy - 4, bx + 4, cy + 4], fill=shade(base, 0.5) + (255,))
    elif style == 'collar':
        d.rectangle([mwi - 22, 0, mwi, H], fill=shade(base, 1.12) + (255,))
    d.rectangle([0, 0, mwi, H], outline=shade(base, 0.45) + (255,), width=2)

    # 顶部受光 / 底部 AO（按行乘子；mantlet 同样受益成倒角感）
    px = img.load()
    for y in range(H):
        mult = 1.30 - 0.62 * (y / (H - 1))
        for x in range(W):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (min(255, int(r * mult)), min(255, int(g * mult)),
                            min(255, int(b * mult)), a)
    # 每列最顶端不透明像素提亮（顶部高光线）
    for x in range(W):
        for y in range(H):
            if px[x, y][3]:
                r, g, b, a = px[x, y]
                px[x, y] = (min(255, r + 70), min(255, g + 70), min(255, b + 70), a)
                if y + 1 < H and px[x, y + 1][3]:
                    r2, g2, b2, a2 = px[x, y + 1]
                    px[x, y + 1] = (min(255, r2 + 30), min(255, g2 + 30),
                                    min(255, b2 + 30), a2)
                break

    # 确定性颗粒噪声 ±4
    rng = random.Random(SEED)
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a:
                n = rng.randint(-4, 4)
                px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)),
                            max(0, min(255, b + n)), a)
    return img


def main():
    outdir = os.path.join('assets', 'tanks', 'barrels')
    os.makedirs(outdir, exist_ok=True)
    for key, sp in SPECS.items():
        img = build(key, sp)
        p = os.path.join(outdir, sp['out'])
        img.save(p)
        # 自检：左/右满幅、垂直中心
        a = img.split()[3]
        bbox = a.getbbox()
        assert bbox[0] == 0 and bbox[2] == W, f'{key} 左右不满幅 {bbox}'
        assert abs((bbox[1] + bbox[3]) / 2 - img.size[1] / 2) < 2, f'{key} 垂直偏心 {bbox}'
        print(f'{key}: {img.size} bbox={bbox} -> {p}')


if __name__ == '__main__':
    main()
