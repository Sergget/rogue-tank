"""整车精灵贴图「白底 / 白色残留」清理工具。

用途
----
把 AI 生成的四层精灵贴图（`assets/tanks/**.png`）里未抠净的白色背景清成透明，
同时**保留坦克本体上的浅色高光与涂装**。

核心判据（一条，简单且不会误伤）
--------------------------------
把「图片外部」定义为：从图片边框出发，沿 **透明像素 ∪ 近白像素** 可达的区域。
→ 可达的近白像素 = 背景（外部白底、以及透过轮廓缝隙/镂空连通到外面的白边）
→ **不可达**的近白像素 = 被深色装甲完全包围 = 本体细节（高光/浅色涂装），一律保留

这样无论背景是全透明、半透明，还是整块不透明白底（外部白 → 从边框直接连通），
都能正确识别；而本体内部的白绝不与外部连通，因此永不被误删。

近白定义：不透明(alpha > 24) 且 max(RGB) >= 170 且 (max-min) <= 34。

不做羽化：这些贴图源本为**二值 alpha**（实测半透明像素数为 0），
早期版本用 alpha=128 做羽化会在深色战场上留下白色辉光边，已移除。

用法
----
  python scripts/clean_sprite_bg.py --dry [--ascii] [文件...]   # 只探测（可附清理后剪影预览）
  python scripts/clean_sprite_bg.py [文件...]                   # 清理（原地写回 png）
"""
import os
import sys
import json
from collections import deque

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets', 'tanks')

THR_LIGHT = 170     # 近白亮度阈值 max(RGB)
SPREAD = 34         # 近白饱和度上限 max-min
ALPHA_OPAQUE = 24   # 视为不透明的 alpha 下限


def resolve(name):
    p = os.path.join(ASSETS, name)
    if not os.path.exists(p):
        p = os.path.join(ASSETS, 'barrels', os.path.basename(name))
    return p


def near_white(rgb):
    mx = rgb[:, :, :3].max(axis=2)
    mn = rgb[:, :, :3].min(axis=2)
    return (mx >= THR_LIGHT) & ((mx - mn) <= SPREAD)


def outside_reachable(passable):
    """从图片边框沿 passable 洪泛（4 邻域），返回可达掩码。"""
    h, w = passable.shape
    out = np.zeros((h, w), dtype=bool)
    dq = deque()
    for y in range(h):
        for x in (0, w - 1):
            if passable[y, x] and not out[y, x]:
                out[y, x] = True; dq.append((x, y))
    for x in range(w):
        for y in (0, h - 1):
            if passable[y, x] and not out[y, x]:
                out[y, x] = True; dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and passable[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True; dq.append((nx, ny))
    return out


def components(mask, min_px=300):
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    out = []
    for sy in range(h):
        for sx in range(w):
            if mask[sy, sx] and not seen[sy, sx]:
                dq = deque([(sx, sy)]); seen[sy, sx] = True
                pts = []
                while dq:
                    x, y = dq.popleft(); pts.append((x, y))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; dq.append((nx, ny))
                if len(pts) >= min_px:
                    xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
                    out.append(dict(px=len(pts), bbox=[min(xs), min(ys), max(xs) + 1, max(ys) + 1]))
    out.sort(key=lambda c: -c['px'])
    return out


def process(path, dry=False):
    im = Image.open(path).convert('RGBA')
    arr = np.array(im).astype(np.int16)
    alpha = arr[:, :, 3]
    opaque = alpha > ALPHA_OPAQUE
    transparent = alpha <= ALPHA_OPAQUE
    nw = opaque & near_white(arr)

    rel = os.path.relpath(path, ROOT).replace('\\', '/')
    if not nw.any():
        return dict(file=rel, size=[im.width, im.height], near_white=0, note='无近白像素')

    reach = outside_reachable(transparent | nw)
    background = nw & reach
    keep = nw & ~reach

    # 半透明像素统计（源应为二值 alpha；非 0 说明有软边，需留意）
    semi = int(((alpha > ALPHA_OPAQUE) & (alpha < 254) & near_white(arr)).sum())

    info = dict(
        file=rel, size=[int(im.width), int(im.height)],
        opaque=int(opaque.sum()), near_white=int(nw.sum()),
        background=int(background.sum()),
        background_pct_of_opaque=round(100 * float(background.sum()) / max(1, int(opaque.sum())), 1),
        body_detail_keep=int(keep.sum()),
        body_detail_top=components(keep, 300)[:3],
        semi_transparent_near_white=semi,
    )
    if not dry and background.any():
        out = np.array(im)
        out[background, 3] = 0
        Image.fromarray(out, 'RGBA').save(path)
        info['rewritten'] = True
    return info


def ascii_preview(path, cols=100):
    im = Image.open(path).convert('RGBA')
    a = np.array(im.getchannel('A'))
    h, w = a.shape
    rows = max(6, int(cols * h / w * 0.5))
    lines = []
    for ry in range(rows):
        y0 = int(ry * h / rows); y1 = max(int((ry + 1) * h / rows), y0 + 1)
        line = []
        for rx in range(cols):
            x0 = int(rx * w / cols); x1 = max(int((rx + 1) * w / cols), x0 + 1)
            c = int((a[y0:y1, x0:x1] > ALPHA_OPAQUE).sum())
            t = (y1 - y0) * (x1 - x0)
            line.append('#' if c * 3 >= t else (' ' if c * 2 < t else '.'))
        lines.append(''.join(line))
    return lines


def all_pngs():
    names = sorted(f for f in os.listdir(ASSETS) if f.endswith('.png'))
    names += ['barrels/' + f for f in sorted(os.listdir(os.path.join(ASSETS, 'barrels'))) if f.endswith('.png')]
    return names


if __name__ == '__main__':
    dry = '--dry' in sys.argv
    show = '--ascii' in sys.argv
    files = [f for f in sys.argv[1:] if not f.startswith('--')] or all_pngs()
    for f in files:
        p = resolve(f)
        if not os.path.exists(p):
            print(json.dumps(dict(file=f, error='missing'), ensure_ascii=False))
            continue
        info = process(p, dry)
        print(json.dumps(info, ensure_ascii=False))
        if show and info.get('background'):
            print('  ---- 清理后剪影（# = 保留的不透明像素）----')
            for ln in ascii_preview(p):
                print('  ' + ln)
