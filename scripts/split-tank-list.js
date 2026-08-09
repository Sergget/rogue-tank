'use strict';
// split-tank-list.js — 把旧的聚合文件 tank_list.json 拆分为 tanks/<id>.json 一型一文件。
// 用法：node scripts/split-tank-list.js [tank_list.json 路径]
// 保留在仓库作为维护工具（把外部/旧格式的聚合列表重新导入 tanks/）。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, 'tank_list.json');
const TANKS_DIR = path.join(ROOT, 'tanks');

if (!fs.existsSync(SRC)) {
  console.error(`源文件不存在: ${SRC}`);
  process.exit(1);
}
const list = JSON.parse(fs.readFileSync(SRC, 'utf8'));
if (!fs.existsSync(TANKS_DIR)) fs.mkdirSync(TANKS_DIR);

let written = 0;
for (const key of Object.keys(list)) {
  const spec = list[key];
  const file = path.join(TANKS_DIR, key + '.json');
  fs.writeFileSync(file, JSON.stringify(spec, null, 2), 'utf8');
  written++;
  console.log(`  ✓ tanks/${key}.json  (${JSON.stringify(spec).length} bytes)`);
}
console.log(`拆分完成：${written} 辆坦克 → ${TANKS_DIR}/`);
