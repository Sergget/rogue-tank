'use strict';
// test-tanks.js — tanks/ 目录（一型一文件）数据完整性校验。
// 验证：JSON 合法、id===文件名、必填字段齐全、半/全形几何 round-trip、barrel 归一化可加载。
// 运行：node scripts/test-tanks.js（npm test 已纳入）
require('../js/tank_utils.js');
const U = require('../js/tank_utils.js');  // <--- 添加：供 global.TAU / global.norm 使用
const fs = require('fs');
const path = require('path');

const H = require('../js/tank_halfgeom.js');
const RULES_MOD = require('../js/tank_rules.js');
global.RULES = RULES_MOD.RULES;
global.TAU = U.TAU;

// 表面纹理键（P-27）：优先取 tank_paint.js TEXTURE_DEFS（单一来源），require 失败时静态兜底
let TEXTURE_KEYS = ['none','armor_plate','weld_seam','rust','camo'];
try {
  const PAINT = require('../js/tank_paint.js');
  if (PAINT && PAINT.TEXTURE_DEFS) TEXTURE_KEYS = Object.keys(PAINT.TEXTURE_DEFS);
} catch (e) { /* 静态列表兜底 */ }

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

  // 线段挂载模块：字段存在时校验结构（扁平 { key: [placement] }；placement 含 part/x/y/len/off/mirror，
  // x/y/len 有限、len ∈ [lenMin,1]）；缺失 = 旧数据，允许
  if(spec.modules !== undefined){
    ok(typeof spec.modules === 'object' && spec.modules !== null && !Array.isArray(spec.modules), `${f}: modules 字段为对象`);
    const flatKeys = (RULES_MOD && RULES_MOD.RULES && RULES_MOD.RULES.modules && RULES_MOD.RULES.modules.keys) || [];
    for(const key of Object.keys(spec.modules)){
      const list = spec.modules[key];
      ok(flatKeys.includes(key), `${f}: modules.${key} 为已知模块键`);
      ok(Array.isArray(list) && list.length > 0, `${f}: modules.${key} 为放置数组（每类至少 1 处）`);
      if(Array.isArray(list)){
        list.forEach((m, i)=>{
          const okPart = m && (m.part==='hull' || m.part==='turret');
          const okStruct = m && Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.len) &&
            m.len >= RULES_MOD.RULES.modules.lenMin && m.len <= 1 &&
            Number.isFinite(m.off) && Math.abs(m.off) <= (1 - m.len)/2 + 1e-9;
          ok(okPart && okStruct, `${f}: modules.${key}[${i}] 结构合法 (part/x/y/len/off, len∈[lenMin,1], |off|≤(1-len)/2)`);
        });
      }
    }
  } else {
    ok(true, `${f}: 无 modules 字段（旧数据，允许）`);
  }

  // 表面纹理：可选字段；存在时必须是 TEXTURE_DEFS 已知键（缺省 none）
  if(spec.texture !== undefined){
    ok(TEXTURE_KEYS.includes(spec.texture), `${f}: texture 为已知纹理键 (${spec.texture})`);
  } else {
    ok(true, `${f}: 无 texture 字段（缺省 none，允许）`);
  }
}

console.log(fails === 0 ? 'test-tanks: 全部通过' : `test-tanks: ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
