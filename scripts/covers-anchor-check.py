#!/usr/bin/env python3
"""covers-anchor-check.py — 图片通道产物的锚点 / 尺寸 / 透明度验收（替代人眼看 bake.html）。

背景：`tools/bake.html` 用「实测内容包围盒」定位红十字，对**程序化 bake** 有效，
但图片通道（assets/<key>.png）用的是 `ASSET_DEFS` 的**固定** anchorX/anchorY ——
导出的 PNG 尺寸一旦与名义尺寸不一致，`drawAssetSprite` 会按 `w/def.w` 缩放粘贴，
锚点随之漂移。本脚本直接按运行时的粘贴公式复算「掩体中心落在 PNG 的哪一像素」，
不依赖浏览器。

判据：
  1. 文件尺寸 = tools/cover-refs.json 的运行时烘焙画布尺寸（图片通道 1:1 贴图）
  2. 有效内容（alpha>0）的质心与名义锚点距离 ≤ 2px（允许 --tol 覆盖）
  3. 内容不得触及画布边缘（默认只报告；内容抵边是允许的——树桩/栅栏本就铺满名义画布，
     `--strict-edges` 才把抵边判为违例）
  4. 不同图层（base / canopy）分别按各自锚点校验

用法：
  python scripts/covers-anchor-check.py                       # 校验 assets/ 下已落盘的地图元素 PNG（9 个键）
  python scripts/covers-anchor-check.py --src tmp/covers-src --tol 3
退出码：0 全部通过（或文件不存在视为「走程序化回退」，不算失败）；1 有违例。
"""
from __future__ import annotations

import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit('缺少 Pillow：$env:PYTHONPATH = "$PWD/tmp/pylibs" 后再运行')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 基准单一来源：tools/cover-refs.json（由 node tools/dump-cover-refs.mjs 从运行时烘焙导出）。
# 早期这里手抄的是 ASSET_DEFS.w/h（bake 的输入尺寸），与图片通道实际尺寸不符。
def load_refs():
    import json
    p = os.path.join(ROOT, 'tools', 'cover-refs.json')
    if not os.path.isfile(p):
        sys.exit('缺少 tools/cover-refs.json —— 先运行 node tools/dump-cover-refs.mjs')
    with open(p, encoding='utf-8') as f:
        data = json.load(f)
    return {k: dict(w=v['canvas'][0], h=v['canvas'][1], ax=v['anchor'][0], ay=v['anchor'][1],
                    cx=(v.get('centroid') or [v['anchor'][0], v['anchor'][1]])[0],
                    cy=(v.get('centroid') or [v['anchor'][0], v['anchor'][1]])[1])
            for k, v in data['assets'].items()}


NOMINAL = load_refs()


def check_one(key, spec, src_path, tol):
    """验收单张图片通道产物。

    基准是**烘焙内容质心**（refs.centroid），不是 anchor：图片通道里 anchor 只是
    `drawImage` 的偏移量，真正决定「画得对不对」的是内容在画布里的相对位置。
    出图 → 缩放落盘后，质心必须落在烘焙质心的 ±tol 内，否则游戏里物体会整体偏移。
    """
    w, h = spec['w'], spec['h']
    row = dict(key=key, file=os.path.basename(src_path), size=None, anchor=(spec['ax'], spec['ay']),
               centroid=None, target=(spec['cx'], spec['cy']), dist=None,
               edge_contact=None, status='OK', problems=[])
    if not os.path.isfile(src_path):
        row['status'] = 'ABSENT'      # 缺图 = 走程序化回退，不是失败
        return row
    with Image.open(src_path) as f:
        im = f.convert('RGBA')
    row['size'] = [im.width, im.height]

    # 1) 尺寸（必须与运行时烘焙画布一致：图片通道按 1:1 贴图）
    if (im.width, im.height) != (w, h):
        row['problems'].append(f'尺寸 {im.width}x{im.height} ≠ 基准 {w}x{h}')

    # 2) 内容质心 vs 烘焙质心
    px = im.load()
    sx = sy = n = 0
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] > 24:
                sx += x
                sy += y
                n += 1
    if n == 0:
        row['problems'].append('无有效内容（全透明）')
    else:
        cx, cy = sx / n, sy / n
        dist = ((cx - spec['cx']) ** 2 + (cy - spec['cy']) ** 2) ** 0.5
        row['centroid'] = (round(cx, 2), round(cy, 2))
        row['dist'] = round(dist, 2)
        if dist > tol:
            row['problems'].append(f'内容质心偏离烘焙基准 {dist:.2f}px > {tol}px')

    # 3) 边缘贴边：只报告，不判违例（树桩/栅栏本就铺满画布）
    touches = []
    if any(px[x, 0][3] > 24 for x in range(im.width)): touches.append('上')
    if any(px[x, im.height - 1][3] > 24 for x in range(im.width)): touches.append('下')
    if any(px[0, y][3] > 24 for y in range(im.height)): touches.append('左')
    if any(px[im.width - 1, y][3] > 24 for y in range(im.height)): touches.append('右')
    row['edge_contact'] = touches
    if touches and getattr(check_one, 'strict_edges', False):
        row['problems'].append('内容触及画布边缘：' + '/'.join(touches))

    if row['problems']:
        row['status'] = 'FAIL'
    return row


def main():
    ap = argparse.ArgumentParser(description='图片通道产物锚点/尺寸/透明度验收')
    ap.add_argument('--src', default='assets', help='待校验目录（默认 assets）')
    ap.add_argument('--tol', type=float, default=2.0, help='质心与锚点允差 px（默认 2.0）')
    ap.add_argument('--strict-edges', action='store_true',
                    help='内容触碰画布边即判违例（默认允许：树桩/栅栏本就铺满名义画布）')
    ap.add_argument('--json', action='store_true', help='JSON 行输出')
    args = ap.parse_args()
    check_one.strict_edges = args.strict_edges

    src = args.src if os.path.isabs(args.src) else os.path.join(ROOT, args.src)
    rows = [check_one(k, v, os.path.join(src, k + '.png'), args.tol) for k, v in NOMINAL.items()]

    if args.json:
        import json
        for r in rows:
            print(json.dumps(r, ensure_ascii=False, default=list))
    else:
        hdr = f'{"key":15} {"size":>10} {"centroid":>16} {"target":>12} {"dist":>7} {"edge":>8}  status'
        print(hdr)
        print('-' * len(hdr))
        for r in rows:
            size = ('%dx%d' % tuple(r['size'])) if r['size'] else '-'
            cen = ('%.1f,%.1f' % r['centroid']) if r['centroid'] else '-'
            tgt = '%.1f,%.1f' % r['target']
            dist = ('%.2f' % r['dist']) if r['dist'] is not None else '-'
            edge = ('-' if r['edge_contact'] is None else ('触' + '/'.join(r['edge_contact']) if r['edge_contact'] else 'ok'))
            print(f'{r["key"]:15} {size:>10} {cen:>16} {tgt:>12} {dist:>7} {edge:>8}  {r["status"]}'
                  + (('  ' + '; '.join(r['problems'])) if r['problems'] else ''))

    absent = [r for r in rows if r['status'] == 'ABSENT']
    bad = [r for r in rows if r['status'] == 'FAIL']
    print(f'\n{len(rows) - len(absent) - len(bad)} OK / {len(bad)} FAIL / {len(absent)} 缺图（走程序化回退）')
    if bad:
        print('提示：锚点偏差多由「PNG 尺寸 ≠ 名义尺寸」引起（drawAssetSprite 按 w/def.w 缩放粘贴）。'
              '重新跑 scripts/prepare_covers.py --inplace 可归位。')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
