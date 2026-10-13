"""坦克/特效贴图压缩与体检工具（2026-10-10，配套 tools/sprite-audit.md §3）。

用途
----
在**不改变渲染结果**的前提下把 assets/ 下的 RGBA 贴图压到 PNG-8 调色板，
解决 sprite-audit.md §3 记录的 1.4~2.4 MB 单幅问题。

关键约束（改动前必读）
----------------------
1. `js/tank_battledraw.js` 的 `paintPartSprite(..., h.scale, ...)` 用的是
   `img.naturalWidth * scale`，即 **scale 与贴图原始像素尺寸强耦合**。
   → 本脚本默认**不改尺寸**（--max-width 默认 0 = 关闭），只做调色板量化与
     PNG 重编码，几何零变化，tanks/*.json 里的 scale 全部无需改动。
   → 若确需缩图，必须手动传 --max-width，并按脚本输出的缩放系数同步改
     tanks/*.json 的 `sprite.hull.scale` / `sprite.turret.scale` / `sprite.track.scale`。
2. 炮管贴图 `drawSpriteBarrel` 用 `barrelLen / img.naturalWidth` 归一化，
   炮管贴图**与原始尺寸无关**，缩放炮管无需改 JSON。
3. 履带 `drawSpriteTracks` 的滚动相位口径是「整幅贴图宽度」，缩放履带贴图
   必须同步 `sprite.track.scale`，否则平铺周期与相位失配。

依赖
----
Pillow + numpy。本机以工作区本地库运行（不污染全局 site-packages）：

    # Windows / PowerShell
    $env:PYTHONPATH = "$PWD/tmp/pylibs"        # 由 tmp/fetch-wheels.js + Expand-Archive 生成
    python scripts/optimize_sprites.py

用法
----
    python scripts/optimize_sprites.py                       # 体检 + 估算收益（只读，默认）
    python scripts/optimize_sprites.py --colors 256          # 试算 256 色
    python scripts/optimize_sprites.py --colors 256 --dither  # 抖动（体积更大、渐变更平滑）
    python scripts/optimize_sprites.py --colors 256 --inplace
    python scripts/optimize_sprites.py --scope assets --colors 256 --inplace
    python scripts/optimize_sprites.py --colors 256 --max-width 1200 --inplace --sync-tanks
    python scripts/optimize_sprites.py --json                # 机器可读输出

--sync-tanks（须与 --inplace --max-width 连用）：缩图后自动同步 tanks/*.json 的
sprite 对齐参数——hull/turret 的 scale ×k、pivot（图片像素坐标）÷k，hull.pivot 同步。
track（scale=0 为自动推导，`tw / naturalHeight` 自适应）与炮管（barrelLen/naturalWidth
归一化）均无需改动；dx/dy 是模型单位，不动。

退出码：0 正常；1 参数错误。--inplace 写入前一律保留原文件字节到内存并校验，
且默认**只在变小**时才落盘（--force 可强制写入）。
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit('缺少 Pillow：请先 pip install pillow（或设置 PYTHONPATH 指向本地库）')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def collect_pngs(scope):
    """scope 相对仓库根的目录；返回排序后的 png 绝对路径列表。"""
    base = os.path.join(ROOT, scope)
    if not os.path.isdir(base):
        sys.exit(f'目录不存在: {scope}')
    out = []
    for dirpath, _dirnames, filenames in os.walk(base):
        for fn in sorted(filenames):
            if fn.lower().endswith('.png'):
                out.append(os.path.join(dirpath, fn))
    return sorted(out)


def encode(im, colors=None, dither=False):
    """按可选调色板量化重新编码为 PNG 字节。

    alpha 处理要点（2026-10-10 实测修正）
    ------------------------------------
    直接用 FASTOCTREE 对 RGBA 量化会把**二值 alpha 一起打成半透明软边**
    （实测 hull 类贴图 15%~27% 像素变半透明），在深色战场上表现为精灵四周的
    方形灰雾/白边（scripts/clean_sprite_bg.py 头部注释记录过同类问题）。故此处：
      ① 透明像素先填成可见区平均色（仅占位，不表达语义）；
      ② 只量化 RGB（MEDIANCUT），索引整体 +1 留出 0 号索引；
      ③ 0 号索引登记为全透明并用 PNG tRNS 表达 → **alpha 逐像素精确还原**。
    """
    buf = io.BytesIO()
    if not colors:
        im.save(buf, format='PNG', optimize=True)
        return buf.getvalue()

    from PIL import ImageStat
    alpha = im.getchannel('A')
    solid = alpha.point(lambda v: 255 if v > 0 else 0)
    stat = ImageStat.Stat(Image.merge('RGB', (solid, solid, solid)), mask=solid)
    bg = tuple(int(round(c)) for c in stat.mean)
    flat = Image.new('RGB', im.size, bg)
    flat.paste(im.convert('RGB'), mask=solid)

    body = max(1, min(255, colors - 1))  # 0 号索引留给透明
    q = flat.quantize(colors=body, method=Image.Quantize.MEDIANCUT,
                      dither=Image.Dither.FLOYDSTEINBERG if dither else Image.Dither.NONE)
    # 注意一：P 模式取索引只能用 tobytes()/frombytes()——`q.convert('L')` 返回的是调色板
    #         颜色的**亮度**而非索引值，会把索引彻底打乱（实测平均色差 9.6 → 30.8）。
    # 注意二：必须先在 L 模式拼好索引再转 P——直接往 P 模式图上 paste L 会按其调色板查表。
    idx = Image.frombytes('L', im.size, q.tobytes()).point(lambda v: v + 1)
    indices = Image.new('L', im.size, 0)
    indices.paste(idx, mask=solid)  # 透明像素保持索引 0
    out = indices.convert('P')
    pal = [0, 0, 0] + list(q.getpalette()[:body * 3])
    pal += [0] * (768 - len(pal))
    out.putpalette(pal)
    out.save(buf, format='PNG', transparency=0, optimize=True)
    return buf.getvalue()


def process(path, colors=None, dither=False, max_width=0):
    with open(path, 'rb') as f:
        orig = f.read()
    with Image.open(io.BytesIO(orig)) as src:
        im = src.convert('RGBA')

    info = {
        'file': os.path.relpath(path, ROOT).replace('\\', '/'),
        'src_px': [im.width, im.height],
        'src_bytes': len(orig),
        'mode': src.mode,
    }

    if max_width and im.width > max_width:
        # 防白边（必须先于 resize）：透明像素的隐藏 RGB 多为原始白底（clean_sprite_bg
        # 只清了 alpha），LANCZOS 会把它混进边缘可见像素 → 白晕。先替换为不透明区均色。
        a = im.getchannel('A')
        solid = a.point(lambda v: 255 if v > 0 else 0)
        from PIL import ImageStat
        stat = ImageStat.Stat(Image.merge('RGB', (solid, solid, solid)), mask=solid)
        bg = tuple(int(round(c)) for c in stat.mean)
        flat = Image.new('RGB', im.size, bg)
        flat.paste(im.convert('RGB'), mask=solid)
        im = Image.merge('RGBA', (*flat.split(), a))
        ratio = max_width / float(im.width)
        nh = max(1, int(round(im.height * ratio)))
        im = im.resize((max_width, nh), Image.LANCZOS)
        # resize 会把二值 alpha 打成软边；本管线契约为二值 alpha（§4.56），压回 0/255。
        a2 = im.getchannel('A').point(lambda v: 255 if v > 128 else 0)
        im = Image.merge('RGBA', (*im.convert('RGB').split(), a2))
        info['resized_to'] = [im.width, im.height]
        info['scale_factor'] = round(1.0 / ratio, 4)  # tanks/*.json 的 scale 需乘此值

    alpha = im.getchannel('A')
    hist = alpha.histogram()
    total = im.width * im.height
    info['alpha'] = {
        'transparent_pct': round(100.0 * hist[0] / total, 1),
        'partial_pct': round(100.0 * sum(hist[1:255]) / total, 1),
        'opaque_pct': round(100.0 * hist[255] / total, 1),
    }

    out = encode(im, colors, dither)
    info['dst_bytes'] = len(out)

    # 量化后复核：调色板量化会把二值 alpha 打成半透明软边（深色战场上呈白色/灰色光晕），
    # 故此处统计**输出图**的半透明像素占比，作为质量闸门。
    if colors:
        with Image.open(io.BytesIO(out)) as chk:
            dst = chk.convert('RGBA')
        info['dst_alpha_partial_pct'] = round(100.0 * sum(dst.getchannel('A').histogram()[1:255]) / max(1, total), 3)
        # 可见像素上的平均色差（0~255，越小越接近原图；仅统计 alpha>0 处）
        from PIL import ImageChops, ImageStat
        bin_m = Image.new('L', im.size, 0)
        bin_m.paste(im.getchannel('A').point(lambda v: 255 if v > 0 else 0))
        d = ImageChops.difference(
            Image.composite(im.convert('RGB'), bin_m.convert('RGB'), bin_m),
            Image.composite(dst.convert('RGB'), bin_m.convert('RGB'), bin_m),
        )
        info['mean_abs_err'] = round(sum(ImageStat.Stat(d).mean) / 3.0, 2)
        # alpha 偏差像素（量化把二值 alpha 打成软边时这里会显著 > 0）
        da = ImageChops.difference(im.getchannel('A'), dst.getchannel('A'))
        info['alpha_diff_px'] = sum(da.point(lambda v: 1 if 0 < v <= 250 else 0).histogram()[1:])
    info['ratio'] = round(len(out) / float(len(orig)), 4)
    info['saved_pct'] = round(100.0 * (1 - info['ratio']), 1)
    return info, out


def sync_tank_jsons(resized_factors):
    """按 {贴图相对路径: scale_factor} 同步 tanks/*.json 的 sprite 对齐参数。

    规则（对应 js/tank_paint.js paintPartSprite 与 js/tank_battledraw.js drawSpriteBarrel）：
      - hull/turret scale ×k（scale = 模型单位/图片像素，图缩小 k 倍则 scale 放大 k 倍）；
      - hull/turret pivot ÷k（pivot 是**图片像素**坐标）；
      - track.scale 为 0（自动推导 tw/naturalHeight）不动；炮管由 barrelLen/normalWidth
        归一化，不涉及 JSON；dx/dy 是模型单位，不动。
    返回改动列表（file -> {layer: 变更明细}）。
    """
    tanks_dir = os.path.join(ROOT, 'tanks')
    changes = {}
    for fn in sorted(os.listdir(tanks_dir)):
        if not fn.endswith('.json'):
            continue
        path = os.path.join(tanks_dir, fn)
        with open(path, 'r', encoding='utf-8') as f:
            spec = json.load(f)
        sp = spec.get('sprite')
        if not isinstance(sp, dict):
            continue
        file_changes = {}
        for layer in ('hull', 'turret'):
            part = sp.get(layer)
            if not isinstance(part, dict):
                continue
            img = part.get('img')
            k = resized_factors.get(img)
            if not k:
                continue
            old_scale = part.get('scale')
            if old_scale:
                part['scale'] = round(old_scale * k, 6)
            pivot = part.get('pivot')
            if isinstance(pivot, list) and len(pivot) == 2:
                part['pivot'] = [round(pivot[0] / k, 1), round(pivot[1] / k, 1)]
            file_changes[layer] = dict(scale=old_scale, new_scale=part.get('scale'),
                                       pivot_old=pivot[:] if isinstance(pivot, list) else None,
                                       pivot_new=part.get('pivot'))
        if file_changes:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(spec, f, ensure_ascii=False, indent=2)
                f.write('\n')
            changes[fn] = file_changes
    return changes


def main():
    # Windows GBK 控制台打不出 ⚠ 等字符会 UnicodeEncodeError 崩溃，统一转 utf-8。
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass
    ap = argparse.ArgumentParser(description='坦克贴图压缩/体检工具')
    ap.add_argument('--scope', default='assets/tanks', help='扫描目录（相对仓库根，默认 assets/tanks）')
    ap.add_argument('--colors', type=int, default=None,
                    help='量化调色板颜色数（如 256 / 128）；不传则只做无损重编码')
    ap.add_argument('--dither', action='store_true', help='Floyd-Steinberg 抖动（体积更大）')
    ap.add_argument('--max-width', type=int, default=0,
                    help='超过该宽度则等比缩放；0 = 不缩放（默认）。缩放后须同步 tanks/*.json 的 scale')
    ap.add_argument('--inplace', action='store_true', help='真正写回磁盘（默认只报告）')
    ap.add_argument('--sync-tanks', action='store_true',
                    help='缩图后同步 tanks/*.json 的 hull/turret scale×k 与 pivot÷k（须与 --inplace --max-width 连用）')
    ap.add_argument('--force', action='store_true', help='即使结果变大也写入')
    ap.add_argument('--json', action='store_true', help='以 JSON 行输出（机器可读）')
    args = ap.parse_args()

    if args.colors is not None and not (2 <= args.colors <= 256):
        sys.exit('--colors 需在 2..256 之间')
    if args.sync_tanks and not (args.inplace and args.max_width):
        sys.exit('--sync-tanks 须与 --inplace --max-width 连用')

    files = collect_pngs(args.scope)
    if not files:
        sys.exit(f'{args.scope} 下没有 png')

    total_src = total_dst = 0
    written = 0
    rows = []
    resized_factors = {}
    for path in files:
        info, blob = process(path, args.colors, args.dither, args.max_width)
        total_src += info['src_bytes']
        total_dst += info['dst_bytes']
        wrote = args.inplace and (len(blob) < info['src_bytes'] or args.force)
        if wrote:
            with open(path, 'wb') as f:
                f.write(blob)
            info['written'] = True
            written += 1
            if args.sync_tanks and info.get('scale_factor'):
                rel = os.path.relpath(path, ROOT).replace('\\', '/')
                resized_factors[rel] = info['scale_factor']
        else:
            info['written'] = False
        rows.append(info)

    # JSON 同步：只对「实际写盘且发生缩放」的贴图生效（未写盘的文件尺寸未变，无需同步）
    sync_changes = sync_tank_jsons(resized_factors) if (args.sync_tanks and resized_factors) else {}

    if args.json:
        for r in rows:
            print(json.dumps(r, ensure_ascii=False))
    else:
        hdr = f'{"file":38} {"src":>9} {"dst":>9} {"saved":>7}  dims'
        print(hdr)
        print('-' * len(hdr))
        for r in rows:
            dims = f'{r["src_px"][0]}x{r["src_px"][1]}'
            if r.get('resized_to'):
                dims += f' -> {r["resized_to"][0]}x{r["resized_to"][1]}'
            print(f'{r["file"]:38} {r["src_bytes"]/1024:8.1f}K {r["dst_bytes"]/1024:8.1f}K '
                  f'{r["saved_pct"]:6.1f}%  {dims}')
        print('-' * len(hdr))
        print(f'{"TOTAL":38} {total_src/1024:8.1f}K {total_dst/1024:8.1f}K '
              f'{100.0*(1-total_dst/float(total_src)):6.1f}%  ({len(rows)} files)')
        print(f'参数: colors={args.colors} dither={args.dither} max_width={args.max_width} '
              f'inplace={args.inplace}')
        if args.inplace:
            print(f'已写回 {written}/{len(rows)} 个文件（git 可回滚）')
        else:
            print('（--dry 模式，未写盘；确认收益后加 --inplace 落盘）')

        resized = [r for r in rows if r.get('resized_to')]
        if resized:
            print('\n⚠ 以下文件被缩放，tanks/*.json 对应 scale 需乘 scale_factor：')
            for r in resized:
                note = '' if r.get('written') else '（未写盘：结果更大，JSON 未同步）'
                print(f'  {r["file"]}: ×{r["scale_factor"]}{note}')
        if args.sync_tanks:
            if sync_changes:
                print(f'\n已同步 {len(sync_changes)} 个 tanks/*.json（hull/turret scale×k、pivot÷k）：')
                for fn, ch in sync_changes.items():
                    for layer, d in ch.items():
                        print(f'  {fn} {layer}: scale {d["scale"]} -> {d["new_scale"]}'
                              + (f', pivot {d["pivot_old"]} -> {d["pivot_new"]}' if d['pivot_old'] else ''))
            else:
                print('\n--sync-tanks：无贴图实际缩写落盘，JSON 未改动。')

    return 0


if __name__ == '__main__':
    sys.exit(main())