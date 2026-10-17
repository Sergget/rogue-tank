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

网页端手动出图（无 API Key）时：
    # 把网页下载的图放进 tmp/covers-src/，名字随意（如 tree_canopy_v3.png），
    # 用 --pick 指定「4 选 1」的结果，用 --only 只处理这一批：
    python scripts/prepare_covers.py --pick tree_canopy=tree_canopy_v3.png \
        --only tree_canopy --inplace
    # 或直接把图改名为 <key>.png（tree_canopy.png）后省略 --pick

退出码：0 全 OK（未给 --only 时 MISSING 也按失败处理，防漏图静默通过）；
        1 有 MISSING/ERROR。给了 --only 时只校验被选中的 key。
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

# key -> 图片通道基准（画布宽高 + 画布内锚点）。
# **单一来源 `tools/cover-refs.json`**（由 `node tools/dump-cover-refs.mjs` 从运行时烘焙
# 代码导出）：图片通道 `drawAssetSprite` 直接 `drawImage(img, x-ax*sx, …)`，故图片必须
# 与「程序化 bake 的内容包围盒」同尺寸，锚点也必须是**画布内**坐标。
# 早期版本这里手抄的是 `ASSET_DEFS.w/h + anchorX/anchorY`（那是 bake 的**输入**口径），
# 与图片通道不符：tree 实际 30×30（抄成 24×18）、tree_canopy 58×58（抄成 78×78），
# 导致出图后整体缩放错位；`fallen_canopy` 的声明锚点 ay=15.9 更是落在 9px 画布之外。
def _load_refs():
    path = os.path.join(ROOT, 'tools', 'cover-refs.json')
    if not os.path.isfile(path):
        sys.exit('缺少 tools/cover-refs.json —— 先运行 node tools/dump-cover-refs.mjs')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    out = {}
    for key, v in data['assets'].items():
        out[key] = dict(w=v['canvas'][0], h=v['canvas'][1], ax=v['anchor'][0], ay=v['anchor'][1])
    return out


NOMINAL = _load_refs()
ORDER = ['soft', 'barricade', 'stump', 'rubble', 'bush', 'bush_canopy',
         'tree', 'tree_canopy', 'fallen', 'fallen_canopy']

ANCHOR_TOL = 2.0  # 历史常量（bake.html 红十字 ±2px）；本脚本的验收改由 covers-anchor-check.py 用 centroid 判定

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
    """基准画布中心 vs 画布内锚点的偏移（仅供信息展示）。

    注意：**不是缺陷指标**。锚点本来就允许偏离画布中心（树桩的掩体中心在画布
    的偏左上、倒树在偏左），烘焙通道与图片通道都用同一个 (ax, ay) 定位，只要
    图片内容与烘焙内容在画布里的相对位置一致就不会错位。真正的验收基准是
    `tools/cover-refs.json` 的 `centroid`（见 scripts/covers-anchor-check.py）。
    """
    cx, cy = spec['w'] / 2.0, spec['h'] / 2.0
    dx = round(cx - spec['ax'], 2)
    dy = round(cy - spec['ay'], 2)
    err = round((dx ** 2 + dy ** 2) ** 0.5, 2)
    outside = not (0 <= spec['ax'] <= spec['w'] and 0 <= spec['ay'] <= spec['h'])
    return dict(dx=dx, dy=dy, err=err, outside=outside)


def fit_to_canvas(im, spec):
    """按内容包围盒裁掉留白 → 等比缩进基准画布 → 居中放置。返回 (画布, 缩放比)。

    为什么「缩到基准画布」而不是「缩到 ASSET_DEFS.w/h」：图片通道
    `drawAssetSprite` 直接 `drawImage(img, x-ax*sx, …)`，图片像素 = 世界像素。
    烘焙通道 `bakeAssetCanvas` 先把画布裁到**内容包围盒**再用 (ax, ay) 定位，
    所以图片必须与那个包围盒同尺寸（基准来自 tools/cover-refs.json，由烘焙代码
    导出）。早期版本手抄 ASSET_DEFS.w/h，让 tree 从 30×30 被当成 24×18，整体
    缩小 1.25 倍、锚点也随之漂移。

    内容居中而非按锚点摆位：基准画布本身就是「原图内容包围盒」，把新内容按
    同一规则缩进同一尺寸，相对位置自然与烘焙视觉一致（`covers-anchor-check.py`
    以 refs.centroid 为准做验收）。
    """
    w, h = spec['w'], spec['h']
    bbox = im.getchannel('A').getbbox()
    if not bbox:
        return Image.new('RGBA', (w, h), (0, 0, 0, 0)), 1.0
    content = im.crop(bbox)
    cw, ch = content.size
    scale = min(1.0, w / float(cw), h / float(ch))
    nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    if (nw, nh) != (cw, ch):
        content = content.resize((nw, nh), Image.LANCZOS)
        scale = max(nw / float(cw), nh / float(ch))
    else:
        scale = 1.0

    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    layer.paste(content, (int(round((w - nw) / 2.0)), int(round((h - nh) / 2.0))), content)
    return Image.alpha_composite(canvas, layer), round(scale, 4)


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
    # 先清底（AI 出图的白底会撑大包围盒），再按锚点摆放
    im, n_bg0, n_halo0 = clear_bg(im)
    canvas, scale = fit_to_canvas(im, spec)
    info['scale'] = scale
    canvas, n_bg, n_halo = clear_bg(canvas)
    info['cleared_bg'] = n_bg0 + n_bg
    info['cleared_halo'] = n_halo0 + n_halo
    return info, canvas


def main():
    ap = argparse.ArgumentParser(description='AI 生成地图元素贴图后处理（缩放到名义尺寸→清底→PNG-8→assets/）')
    ap.add_argument('--src', default='tmp/covers-src', help='源图目录（相对仓库根，默认 tmp/covers-src）')
    ap.add_argument('--colors', type=int, default=16,
                    help='量化调色板颜色数 2..256（默认 16，地图小件走 16 色；不传则只无损重编码需显式 --colors 0）')
    ap.add_argument('--inplace', action='store_true', help='真正写到 assets/<key>.png（默认只报告）')
    ap.add_argument('--dry', action='store_true', help='只报告不写盘（默认行为；显式给出时优先于 --inplace）')
    ap.add_argument('--json', action='store_true', help='以 JSON 行输出（机器可读）')
    ap.add_argument('--out', default='assets', help='落盘目录（相对仓库根，默认 assets；测试用临时目录）')
    ap.add_argument('--only', action='append', default=[], metavar='KEY',
                    help='只处理指定 key（可重复）。分批出图时用，未列出的 key 既不报告也不落盘')
    ap.add_argument('--pick', action='append', default=[], metavar='KEY=FILE',
                    help='网页端手动出图时按「4 选 1」指定源文件（相对 --src），可重复。'
                         '例：--pick tree_canopy=tree_canopy_v3.png；未指定的 key 仍回退 <key>.png')
    args = ap.parse_args()

    if not (0 <= args.colors <= 256) or args.colors == 1:
        sys.exit('--colors 需在 2..256 之间（0 = 无损重编码）')
    colors = args.colors or None
    write = bool(args.inplace and not args.dry)

    src_dir = args.src if os.path.isabs(args.src) else os.path.join(ROOT, args.src)
    picks = {}
    for item in args.pick:
        k, sep, f = item.partition('=')
        k, f = k.strip(), f.strip()
        if not sep or not k or not f:
            sys.exit(f'--pick 格式应为 KEY=FILE，收到：{item}')
        if k not in NOMINAL:
            sys.exit(f'--pick 的 key 未知：{k}（可用：{", ".join(ORDER)}）')
        picks[k] = f
    only = set()
    for k in args.only:
        k = k.strip()
        if k not in NOMINAL:
            sys.exit(f'--only 的 key 未知：{k}（可用：{", ".join(ORDER)}）')
        only.add(k)
    keys = [k for k in ORDER if not only or k in only]
    rows = []
    for key in keys:
        spec = NOMINAL[key]
        src_path = os.path.join(src_dir, picks.get(key, key + '.png'))
        info, canvas = process_one(key, spec, src_path)
        info['dst'] = f'{args.out}/{key}.png'
        blob = None
        if canvas is not None:
            blob = encode_p8(canvas, colors)
            info['dst_bytes'] = len(blob)
        if write and blob is not None:
            dst_path = os.path.join(ROOT, args.out, key + '.png')
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            with open(dst_path, 'wb') as f:
                f.write(blob)
            info['written'] = True
        else:
            info['written'] = False
        rows.append(info)

    # 只处理部分 key 时，缺图不算失败（分批出图的正常状态）
    # 只处理部分 key 时，缺图不算失败（分批出图的正常状态）
    bad = [r for r in rows if r['status'] not in ('OK', 'MISSING')] if only           else [r for r in rows if r['status'] != 'OK']
    missing = [r for r in rows if r['status'] == 'MISSING']
    if args.json:
        for r in rows:
            print(json.dumps(r, ensure_ascii=False))
        print(json.dumps(dict(summary=dict(total=len(rows), ok=len(rows) - len(bad) - len(missing),
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
            flag = 'ANCHOR_OUTSIDE' if ae['outside'] else ''
            scale = ('%.3f' % r['scale']) if 'scale' in r else '-'
            clr = str(r.get('cleared_bg', '-'))
            dst = ('%.1fK' % (r['dst_bytes'] / 1024)) if 'dst_bytes' in r else '-'
            print(f'{r["key"]:14} {src:>11} {tgt:>11} {scale:>6} {clr:>7} {dst:>9} '
                  f'{ae["err"]:>8.2f}px  {r["status"]}{(" " + flag) if flag else ""}')
        print('-' * len(hdr))
        print(f'源: {args.src}  colors={args.colors}  '
              f'{("已写回 " + args.out + "/") if write else "（报告模式，未写盘；确认后加 --inplace 落盘）"}')
        off = [r for r in rows if abs(r['anchor_err']['err']) >= 2.0]
        if off:
            print('锚点偏置（信息项，非缺陷；锚点允许不在画布中心）：')
            for r in off:
                ae = r['anchor_err']
                print(f'  {r["key"]}: 画布中心与锚点相差 (dx={ae["dx"]}, dy={ae["dy"]})'
                      f'{"，锚点落在画布外" if ae["outside"] else ""}')

    if bad:
        sys.exit('坏图/缺图 %d 张（%s）：先按 tools/cover-gen-prompts.md §3~§4 出图，'
                 '或在 --src 目录放 <key>.png 再跑 --inplace'
                 % (len(bad), ', '.join(r['key'] for r in bad)))
    if missing and not only:
        print('\n提示：以上 MISSING 项会继续走程序化回退，不影响游戏运行；'
              '分批出图时可加 --only <key> 只处理已备好的图。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
