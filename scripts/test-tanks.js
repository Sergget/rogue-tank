'use strict';
// test-tanks.js — tanks/ 目录（一型一文件）数据完整性校验。
// 验证：JSON 合法、id===文件名、必填字段齐全、半/全形几何 round-trip、barrel 归一化可加载。
// 运行：node scripts/test-tanks.js（npm test 已纳入）
const fs = require('fs');
const path = require('path');

const H = require('../js/tank_halfgeom.js');

const TANKS_DIR = path.join(__dirname, '..', 'tanks');
let fails = 0;
function ok(cond, label){
  if(cond){ console.log('  ✓ ' + label); }
  else { fails++; console.error('  ✗ ' + label); }
}

if(!fs.existsSync(TANKS_DIR)){
  console.error(`tanks/ 目录不存在: ${TANKS_DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(TANKS_DIR).filter(f => f.endsWith('.json')).sort();
ok(files.length >= 1, `找到 ${files.length} 个坦克文件`);

const REQUIRED = ['id','traverseLimit','maxSpeed','turnRate','hp','penetration','damage','reload',
  'heightClass','barrel','hull','turret'];
const ARMOR_FACES = ['front','side','rear'];

for(const f of files){
  const base = f.slice(0, -5);
  let spec = null;
  try { spec = JSON.parse(fs.readFileSync(path.join(TANKS_DIR, f), 'utf8')); }
  catch(e){ ok(false, `${f}: JSON 解析失败 (${e.message})`); continue; }

  ok(spec.id === base, `${f}: id === 文件名 (${spec.id} === ${base})`);
  for(const key of REQUIRED){
    ok(spec[key] !== undefined && spec[key] !== null, `${f}: 字段 ${key} 存在`);
  }
  ok(spec.hull.armor && ARMOR_FACES.every(face => Number.isFinite(spec.hull.armor[face])), `${f}: 车体装甲 front/side/rear 完整`);
  ok(spec.turret.armor && ARMOR_FACES.every(face => Number.isFinite(spec.turret.armor[face])), `${f}: 炮塔装甲 front/side/rear 完整`);

  // 几何 round-trip：full 多边形 → 半形 → 重建 full，顶点应一致（按序、含镜像去重）
  const fullRoundTrip = (key) => {
    const part = spec[key];
    if(!part || !Array.isArray(part.verts)) return false;
    const verts = part.verts;
    const faces = part.faces || [];
    const half = H.halfFromFull(verts, faces);
    if(half.half.length === 0) return false;
    const rebuilt = H.buildFullVerts(half.half);
    if(rebuilt.length !== verts.length) return false;
    for(let i=0;i<verts.length;i++){
      if(Math.abs(rebuilt[i][0]-verts[i][0]) > 1e-6 || Math.abs(rebuilt[i][1]-verts[i][1]) > 1e-6) return false;
    }
    return true;
  };
  ok(fullRoundTrip('hull'), `${f}: hull 半/全形 round-trip 一致`);
  ok(fullRoundTrip('turret'), `${f}: turret 半/全形 round-trip 一致`);

  // barrel 归一化：新格式加载无异常且结构完整
  const b = H.normalizeBarrel(spec.barrel);
  ok(b && Number.isFinite(b.len) && b.evac && b.jacket && b.mantlet, `${f}: barrel 归一化结构完整`);
}

console.log(fails === 0 ? 'test-tanks: 全部通过' : `test-tanks: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
