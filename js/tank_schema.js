'use strict';

// tank_schema.js — 坦克配置字段架构表（tank_compare.html 的 FIELD_ROWS + 枚举）。
// 字段架构的单一来源：designer 与 compare 后续如需字段一致性校验，以此为基准。
// 纯数据，无依赖。（注意：designer 页当前不消费 FIELD_ROWS，仅 compare 页渲染。）

// 炮口制退器 / 排烟器样式枚举（与 tank_paint.js 支持的绘制样式保持一致）
const MUZZLES = ['none','single','double','multi','slug','pepperpot','heavy_square','cylinder'];
const EVAC = ['none','ring','bulb','slotted','long'];
// 表面纹理枚举（与 js/tank_paint.js TEXTURE_DEFS 的键一一对应，P-27 接线）
const TEXTURES = ['none','armor_plate','weld_seam','rust','camo'];

// 分组语义（对齐局内商店 RUN_SHOP_DEFS 的四分组）：'firepower'(火力) | 'armor'(防护) |
// 'mobility'(机动) | 'misc'(杂项)。消费方：tank_compare.html 按组分节渲染（组序固定
// 火力→防护→机动→杂项，组内保持表内顺序）。

// 可编辑字段描述表：label = 列头，path = tank_list 条目内的点路径，type = num | sel，
// group = 四分类分组标记。
//
// 可选 edit 元数据（单位直标编辑，纯数据描述；系数由消费方从 RULES 取，JSON 存储格式不变）：
//   edit.unit   — 输入框显示/输入的真实单位（如 'km/h' / 'm'）
//   edit.factor — [RULES 子键名, 系数键名]，系数唯一权威：RULES.speed.kmhFactor / RULES.scale.PX_PER_METER
//   edit.op     — 'div' = 存储值 = 输入值 ÷ 系数（maxSpeed px/s = km/h ÷ kmhFactor=0.4）
//                 'mul' = 存储值 = 输入值 × 系数（barrel.len px = m × PX_PER_METER≈10.92）
//
// 可选 special 元数据（消费方用特殊控件替换普通数字输入框）：
//   special:'spread100m' — 以「100m 散布范围(m)」口径设定三扩系数 spreadMult
//                          （映射公式见 tank_compare.html；底层仍写 spreadMult 单参数）
const FIELD_ROWS = [
  // ---- 火力 firepower ----
  { label:'穿深',       path:'penetration',        type:'num', group:'firepower' },
  { label:'伤害',       path:'damage',             type:'num', group:'firepower' },
  { label:'装填(s)',    path:'reload',             type:'num', group:'firepower' },
  { label:'弹速(px/s)', path:'shellSpeed',         type:'num', group:'firepower' },
  { label:'射界(°)',    path:'traverseLimit',      type:'num', group:'firepower' },
  { label:'三扩系数',   path:'spreadMult',          type:'num', group:'firepower', special:'spread100m' },
  { label:'缩圈速度',   path:'aimSpeed',            type:'num', group:'firepower' },
  { label:'炮管长度(m)',path:'barrel.len',         type:'num', group:'firepower',
    edit:{ unit:'m', factor:['scale','PX_PER_METER'], op:'mul' } },
  { label:'炮口宽',     path:'barrel.width',       type:'num', group:'firepower' },
  { label:'炮口制退器', path:'barrel.muzzle',      type:'sel', options:MUZZLES, group:'firepower' },
  { label:'排烟器样式', path:'barrel.evac.style',  type:'sel', options:EVAC, group:'firepower' },
  { label:'排烟器位置', path:'barrel.evac.pos',    type:'num', group:'firepower' },
  { label:'护套长度',   path:'barrel.jacket.len',  type:'num', group:'firepower' },
  { label:'护套位置',   path:'barrel.jacket.pos',  type:'num', group:'firepower' },
  // ---- 防护 armor ----
  { label:'生命值',     path:'hp',                 type:'num', group:'armor' },
  { label:'装甲·车体正面', path:'hull.armor.front', type:'num', group:'armor' },
  { label:'装甲·车体侧面', path:'hull.armor.side',  type:'num', group:'armor' },
  { label:'装甲·车体后部', path:'hull.armor.rear',  type:'num', group:'armor' },
  { label:'装甲·炮塔正面', path:'turret.armor.front', type:'num', group:'armor' },
  { label:'装甲·炮塔侧面', path:'turret.armor.side',  type:'num', group:'armor' },
  { label:'装甲·炮塔后部', path:'turret.armor.rear',  type:'num', group:'armor' },
  { label:'身高等级',   path:'heightClass',        type:'sel', options:['medium','heavy'], group:'armor' },
  // ---- 机动 mobility ----
  { label:'极速(km/h)', path:'maxSpeed',            type:'num', group:'mobility',
    edit:{ unit:'km/h', factor:['speed','kmhFactor'], op:'div' } },
  { label:'转向速度(rad/s)',   path:'turnRate',           type:'num', group:'mobility' },
  { label:'炮塔转速(rad/s)',   path:'turretTurnRate',     type:'num', group:'mobility' },
  { label:'重量',       path:'weight',             type:'num', group:'mobility' },
  { label:'马力',       path:'enginePower',        type:'num', group:'mobility' },
  { label:'履带宽',     path:'trackWidth',         type:'num', group:'mobility' },
  { label:'履带偏置',   path:'trackOffset',        type:'num', group:'mobility' },
  { label:'履带锁定(s)',path:'trackLock',          type:'num', group:'mobility' },
  // ---- 杂项 misc ----
  { label:'纹理',       path:'texture',            type:'sel', options:TEXTURES, group:'misc' },
  { label:'炮塔枢轴 dx',path:'turret.pivot.dx',    type:'num', group:'misc' },
  { label:'炮塔枢轴 dy',path:'turret.pivot.dy',    type:'num', group:'misc' }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MUZZLES, EVAC, TEXTURES, FIELD_ROWS };
}
