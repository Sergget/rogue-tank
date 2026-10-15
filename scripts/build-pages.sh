#!/bin/sh
# Cloudflare Pages/Workers 构建脚本：只拷静态站点文件，排除 node_modules 等
set -e
rm -rf dist
mkdir -p dist
cp *.html dist/ 2>/dev/null || true
for d in js tanks cards bosses assets saves; do
  [ -d "$d" ] && cp -r "$d" dist/
done
# 排除测试脚本（减小体积）
rm -rf dist/js/test-*.js 2>/dev/null || true
# 生成静态索引（供无 server.js 的静态托管 fallback：/api/* 不可用时读 index.json）
python3 -c "
import os, json
for d in ['tanks', 'cards', 'bosses']:
    p = f'dist/{d}'
    if os.path.isdir(p):
        ids = [f[:-5] for f in os.listdir(p) if f.endswith('.json') and f != 'index.json']
        open(f'{p}/index.json', 'w').write(json.dumps(ids))
"
echo "dist/ ready: $(du -sh dist | cut -f1)"
