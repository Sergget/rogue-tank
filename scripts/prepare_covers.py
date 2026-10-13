"""AI 生成地图元素贴图后处理（配套 tools/cover-gen-prompts.md §5）。

用途
----
把源图目录（如 tmp/covers-src/）的 10 张 AI 生成源图，按名义尺寸等比
缩小（不变形、居中贴到透明画布）→ 白底/光晕清零 → PNG-8 量化 →
写到 ``assets/<key>.png``（根目录，加载器见 js/tank_assets.js loadAssetImage）。

三段管线的思路分别复用现有脚本（不复制大段代码）：
  缩放居中 —— 本脚本自有（现有脚本不改尺寸，见 optimize_sprites.py 头部约束）；
  白底清理 —— clean_sprite_bg.py 的「边框洪泛」判据（透明 ∪ 近白可达即背景）；
  PNG-8 量化 —— optimize_sprites.py encode() 的「透明占 0 号索引 + RGB 量化」，
    保证二值 alpha 逐像素还原、不打成半透明软边。

名义尺寸（与 cover-gen-prompts.md §0 / ASSET_DEFS 一致）
-------------------------------------------------------
soft 170x10、barricade 64x28、stump 24x18、rubble 38x17、bush 56x34、
tree 24x18、fallen 58x9；bush_canopy 同 bush（56x34）、fallen_canopy 同
fallen（58x9）；tree_canopy 无固定名义尺寸（§0 按包围盒 + 锚点约定），
此处取 78x78 ≈ 2×anchor(39.26)，使画布中心 ≈ 锚点 ±0.4px。

依赖
----
标准库 + Pillow + numpy。本机以工作区本地库运行（不污染全局 site-packages）：

    $env:PYTHONPATH = "$PWD/tmp/pylibs"
    python scripts/prepare_covers.py --dry

用法
----
    python scripts/prepare_covers.py --dry                  # 只报告（默认）
    python scripts/prepare_covers.py --dry --json           # 机器可读报告
    python scripts/prepare_covers.py --src tmp/covers-src --colors 16 --inplace

退出码：0 全 OK；1 有 MISSING/ERROR（缺图或源图损坏）。
落盘规则：默认只报告不写盘；--inplace 才写 assets/<key>.png；
--dry 显式给出时一律不写（--dry 优先于 --inplace）。
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
from collections import deque

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit('缺少 Pillow：$env:PYTHONPATH = "$PWD/tmp/pylibs" 后再运行')
try:
    import numpy as np
except ImportError:  # pragma: no cover
    sys.exit('缺少 numpy：$env:PYTHONPATH = "$PWD/tmp/pylibs" 后再运行')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# key -> 名义画布宽高 + ASSET_DEFS 实测锚点（§0 表格逐字转录）。
# 锚点 = 精灵内"掩体中心"应处像素；验收允差 ±2px（cover-gen-prompts.md §6）。
NOMINAL = {
    'soft':           dict(w=170, h=10, ax=85.75, ay=5.75),
    'barricade':      dict(w=64,  h=28, ax=32.75, ay=14.75),
    'stump':          dict(w=24,  h=18, ax=12.75, ay=9.75),
    'rubble':         dict(w=38,  h=17, ax=20.04, ay=7.75),
    'bush':           dict(w=56,  h=34, ax=28.0,  ay=17.0),
    'bush_canopy':    dict(w=56,  h=34, ax=24.64, ay=19.2),
    'tree':           dict(w=24,  h=18, ax=15.15, ay=15.15),
    # tree_canopy：§0 无固定尺寸（包围盒 + 锚点约定）。R = max(24,18)*1.4 = 33.6，
    # 内容半径 R*0.85 ≈ 28.6；取 78x78 ≈ 2*anchor(39.26)，中心 (39,39) ≈ 锚点。
    'tree_canopy':    dict(w=78,  h=78, ax=39.26, ay=39.26),
    'fallen':         dict(w=58,  h=9,  ax=33.55, ay=7.95),
    'fallen_canopy':  dict(w=58,  h=9,  ax=1.0,   ay=15.9),
}
ORDER = ['soft', 'barricade', 'stump', 'rubble', 'bush', 'bush_canopy',
         'tree', 'tree_canopy', 'fallen', 'fallen_canopy']

ANCHOR_TOL = 2.0  # 锚点误差允差 px（§6 验收：bake.html 红十字 ±2px）

# 白底判据与 clean_sprite_bg.py 同口径（THR_LIGHT/SPREAD/ALPHA_OPAQUE）。
THR_LIGHT = 170
SPREAD = 34
ALPHA_OPAQUE = 24


def fit_contain(im, tw, th):
    """等比缩小（只缩不放）+ 居中贴到 tw×th 透明画布。返回 (画布, 缩放比)。"""
    scale = min(1.0, tw / float(im.width), th / float(im.height))
    canvas = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    if scale < 1.0:
        nw = max(1, int(round(im.width * scale)))
        nh = max(1, int(round(im.height * scale)))
        small = im.resize((nw, nh), Image.LANCZOS)
    else:
        small, nw, nh = im, im.width, im.height
    canvas.paste(small, ((tw - nw) // 2, (th - nh) // 2), small)
    return canvas, round(scale, 4)


def clear_bg(im):
    """边框洪泛清底（思路同 clean_sprite_bg.py，紧凑实现）。

    从图片边框沿「透明 ∪ 近白」洪泛，可达的近白 = 背景白底；
    另把可达的半透明近白（ white 光晕/软边）一并清零；
    被本体包围、与边框不连通的近白（高光/涂装）一律保留。
    返回 (清理后图, 背景像素数, 光晕像素数)。
    """
    rgb = np.array(im.convert('RGB')).astype(np.int16)
    a = np.array(im.getchannel('A')).astype(np.int16)
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    opaque = a > ALPHA_OPAQUE
    near = (mx >= THR_LIGHT) & ((mx - mn) <= SPREAD)
    passable = (a <= ALPHA_OPAQUE) | (opaque & near)
    h, w = passable.shape
    seen = np.zeros((h, w), dtype=bool)
    dq = deque()
    for y in range(h):
        for x in (0, w - 1):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((x, y))
    for x in range(w):
        for y in (0, h - 1):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and passable[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                dq.append((nx, ny))
    bg = opaque & near & seen
    halo = opaque & (a < 254) & near & seen  # 半透明近白光晕
    if bg.any() or halo.any():
        out = np.array(im)
        out[bg | halo, 3] = 0
        im = Image.fromarray(out, 'RGBA')
    return im, int(bg.sum()), int(halo.sum())


def encode_p8(im, colors):
    """PNG-8 量化（思路同 optimize_sprites.py encode()，紧凑实现）。

    透明像素占位 0 号索引（tRNS 全透明）+ 只量化 RGB，
    alpha 逐像素精确还原，不产生半透明软边。
    """
    from PIL import ImageStat
    buf = io.BytesIO()
    if not colors:
        im.save(buf, format='PNG', optimize=True)
        return buf.getvalue()
    alpha = im.getchannel('A')
    solid = alpha.point(lambda v: 255 if v > 0 else 0)
    if solid.histogram()[255] == 0:
        bg = (0, 0, 0)  # 全透明：占位色任意
    else:
        stat = ImageStat.Stat(Image.merge('RGB', (solid, solid, solid)), mask=solid)
        bg = tuple(int(round(c)) for c in stat.mean)
    flat = Image.new('RGB', im.size, bg)
    flat.paste(im.convert('RGB'), mask=solid)
    body = max(1, min(255, colors - 1))  # 0 号索引留给透明
    q = flat.quantize(colors=body, method=Image.Quantize.MEDIANCUT,
                      dither=Image.Dither.NONE)
    idx = Image.frombytes('L', im.size, q.tobytes()).point(lambda v: v + 1)
    indices = Image.new('L', im.size, 0)
    indices.paste(idx, mask=solid)  # 透明像素保持索引 0
    out = indices.convert('P')
    pal = [0, 0, 0] + list(q.getpalette()[:body * 3])
    pal += [0] * (768 - len(pal))
    out.putpalette(pal)
    out.save(buf, format='PNG', transparency=0, optimize=True)
    return buf.getvalue()


def anchor_report(spec):
    """画布中心 vs ASSET_DEFS 实测锚点的像素差。"""
    cx, cy = spec['w'] / 2.0, spec['h'] / 2.0
    dx = round(cx - spec['ax'], 2)
    dy = round(cy - spec['ay'], 2)
    err = round((dx ** 2 + dy ** 2) ** 0.5, 2)
    outside = not (0 <= spec['ax'] <= spec['w'] and 0 <= spec['ay'] <= spec['h'])
    warn = outside or err > ANCHOR_TOL
    return dict(dx=dx, dy=dy, err=err, outside=outside, warn=warn)


def process_one(key, spec, src_path):
    info = dict(key=key, src=None, target=[spec['w'], spec['h']],
                anchor=[spec['ax'], spec['ay']], status='OK')
    info['anchor_err'] = anchor_report(spec)
    if not os.path.isfile(src_path):
        info['status'] = 'MISSING'
        return info, None
    try:
        with Image.open(src_path) as f:
            im = f.convert('RGBA')
            src_size = [im.width, im.height]
            im.load()
    except Exception as e:  # noqa: BLE001 —— 损坏文件记 ERROR，不中断整批
        info['status'] = f'ERROR: {e}'
        return info, None
    info['src'] = src_size
    info['src_bytes'] = os.path.getsize(src_path)
    canvas, scale = fit_contain(im, spec['w'], spec['h'])
    info['scale'] = scale
    canvas, n_bg, n_halo = clear_bg(canvas)
    info['cleared_bg'] = n_bg
    info['cleared_halo'] = n_halo
    return info, canvas


def main():
    ap = argparse.ArgumentParser(description='AI 生成地图元素贴图后处理（缩放到名义尺寸→清底→PNG-8→assets/）')
    ap.add_argument('--src', default='tmp/covers-src', help='源图目录（相对仓库根，默认 tmp/covers-src）')
    ap.add_argument('--colors', type=int, default=16,
                    help='量化调色板颜色数 2..256（默认 16，地图小件走 16 色；不传则只无损重编码需显式 --colors 0）')
    ap.add_argument('--inplace', action='store_true', help='真正写到 assets/<key>.png（默认只报告）')
    ap.add_argument('--dry', action='store_true', help='只报告不写盘（默认行为；显式给出时优先于 --inplace）')
    ap.add_argument('--json', action='store_true', help='以 JSON 行输出（机器可读）')
    args = ap.parse_args()

    if not (0 <= args.colors <= 256) or args.colors == 1:
        sys.exit('--colors 需在 2..256 之间（0 = 无损重编码）')
    colors = args.colors or None
    write = bool(args.inplace and not args.dry)

    src_dir = args.src if os.path.isabs(args.src) else os.path.join(ROOT, args.src)
    rows = []
    for key in ORDER:
        spec = NOMINAL[key]
        src_path = os.path.join(src_dir, key + '.png')
        info, canvas = process_one(key, spec, src_path)
        info['dst'] = f'assets/{key}.png'
        blob = None
        if canvas is not None:
            blob = encode_p8(canvas, colors)
            info['dst_bytes'] = len(blob)
        if write and blob is not None:
            dst_path = os.path.join(ROOT, 'assets', key + '.png')
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            with open(dst_path, 'wb') as f:
                f.write(blob)
            info['written'] = True
        else:
            info['written'] = False
        rows.append(info)

    bad = [r for r in rows if r['status'] != 'OK']
    if args.json:
        for r in rows:
            print(json.dumps(r, ensure_ascii=False))
        print(json.dumps(dict(summary=dict(total=len(rows), ok=len(rows) - len(bad),
                                           bad=len(bad), written=write,
                                           colors=args.colors, src=args.src)),
                         ensure_ascii=False))
    else:
        hdr = f'{"key":14} {"src":>11} {"target":>11} {"scale":>6} {"clr_bg":>7} {"dst":>9} {"anchor_err":>10}  status'
        print(hdr)
        print('-' * len(hdr))
        for r in rows:
            src = ('%dx%d' % tuple(r['src'])) if r['src'] else 'MISSING'
            tgt = '%dx%d' % tuple(r['target'])
            ae = r['anchor_err']
            flag = ''
            if ae['outside']:
                flag = 'ANCHOR_OUTSIDE'
            elif ae['warn']:
                flag = f'ANCHOR_WATCH>{ANCHOR_TOL}px'
            scale = ('%.3f' % r['scale']) if 'scale' in r else '-'
            clr = str(r.get('cleared_bg', '-'))
            dst = ('%.1fK' % (r['dst_bytes'] / 1024)) if 'dst_bytes' in r else '-'
            print(f'{r["key"]:14} {src:>11} {tgt:>11} {scale:>6} {clr:>7} {dst:>9} '
                  f'{ae["err"]:>8.2f}px  {r["status"]}{(" " + flag) if flag else ""}')
        print('-' * len(hdr))
        print(f'源: {args.src}  colors={args.colors}  '
              f'{"已写回 assets/（git 可回滚）" if write else "（报告模式，未写盘；确认后加 --inplace 落盘）"}')
        warned = [r['key'] for r in rows if r['anchor_err']['warn']]
        if warned:
            print('锚点提示（画布中心 vs ASSET_DEFS 实测锚点，允差 ±2px）：')
            for r in rows:
                if r['anchor_err']['warn']:
                    ae = r['anchor_err']
                    print(f'  {r["key"]}: 中心差 (dx={ae["dx"]}, dy={ae["dy"]}) err={ae["err"]}px'
                          f'{"，锚点落在画布外" if ae["outside"] else ""}'
                          f' —— 游戏内以 tank_assets.js 锚点绘制，bake.html 红十字复核')

    if bad:
        sys.exit('缺图/坏图 %d 张（%s）：先按 tools/cover-gen-prompts.md §3~§4 出图再跑 --inplace'
                 % (len(bad), ', '.join(r['key'] for r in bad)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
