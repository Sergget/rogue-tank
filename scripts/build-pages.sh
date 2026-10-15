#!/bin/sh
# Cloudflare Pages/Workers 构建脚本：只拷静态站点文件，排除 node_modules 等
set -e
rm -rf dist
mkdir -p dist
cp *.html dist/ 2>/dev/null || true
for d in js tanks cards bosses assets saves; do
  [ -d "$d" ] && cp -r "$d" dist/
done
# 排除测试脚本（可选，减小体积）
rm -rf dist/js/test-*.js 2>/dev/null || true
echo "dist/ ready: $(du -sh dist | cut -f1)"
