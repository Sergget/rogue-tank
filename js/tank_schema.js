'use strict';

// tank_schema.js — 坦克配置字段架构表（tank_compare.html 的 FIELD_ROWS + 枚举）。
// 字段架构的单一来源：designer 与 compare 后续如需字段一致性校验，以此为基准。
// 纯数据，无依赖。

// 炮口制退器 / 排烟器样式枚举（与 tank_paint.js 支持的绘制样式保持一致）
const MUZZLES = ['none','single','double','multi','slug','pepperpot','heavy_square','cylinder'];
const EVAC = ['none','ring','bulb','slotted','long'];
// 表面纹理枚举（与 js/tank_paint.js TEXTURE_DEFS 的键一一对应，P-27 接线）
const TEXTURES = ['none','armor_plate','weld_seam','rust','camo'];

// 可编辑字段描述表：label = 列头，path = tank_list 条目内的点路径，type = num | sel
const FIELD_ROWS = [
  { label:'最大速度',   path:'maxSpeed',            type:'num' },
  { label:'转向速度',   path:'turnRate',           type:'num' },
  { label:'炮塔转速',   path:'turretTurnRate',     type:'num' },
  { label:'重量',       path:'weight',             type:'num' },
  { label:'马力',       path:'enginePower',        type:'num' },
  { label:'生命值',     path:'hp',                 type:'num' },
  { label:'穿深',       path:'penetration',        type:'num' },
  { label:'伤害',       path:'damage',             type:'num' },
  { label:'装填(s)',    path:'reload',             type:'num' },
  { label:'弹速',       path:'shellSpeed',         type:'num' },
  { label:'射界(°)',    path:'traverseLimit',      type:'num' },
  { label:'身高等级',   path:'heightClass',        type:'sel', options:['medium','heavy'] },
  { label:'履带宽',     path:'trackWidth',         type:'num' },
  { label:'履带偏置',   path:'trackOffset',        type:'num' },
  { label:'履带锁定(s)',path:'trackLock',          type:'num' },
  { label:'纹理',       path:'texture',            type:'sel', options:TEXTURES },
  { label:'三扩系数',   path:'spreadMult',          type:'num' },
  { label:'缩圈速度',   path:'aimSpeed',            type:'num' },
  { label:'装甲·车体正面', path:'hull.armor.front', type:'num' },
  { label:'装甲·车体侧面', path:'hull.armor.side',  type:'num' },
  { label:'装甲·车体后部', path:'hull.armor.rear',  type:'num' },
  { label:'装甲·炮塔正面', path:'turret.armor.front', type:'num' },
  { label:'装甲·炮塔侧面', path:'turret.armor.side',  type:'num' },
  { label:'装甲·炮塔后部', path:'turret.armor.rear',  type:'num' },
  { label:'炮管长度',   path:'barrel.len',         type:'num' },
  { label:'炮口宽',     path:'barrel.width',       type:'num' },
  { label:'炮口制退器', path:'barrel.muzzle',      type:'sel', options:MUZZLES },
  { label:'排烟器样式', path:'barrel.evac.style',  type:'sel', options:EVAC },
  { label:'排烟器位置', path:'barrel.evac.pos',    type:'num' },
  { label:'护套长度',   path:'barrel.jacket.len',  type:'num' },
  { label:'护套位置',   path:'barrel.jacket.pos',  type:'num' },
  { label:'炮塔枢轴 dx',path:'turret.pivot.dx',    type:'num' },
  { label:'炮塔枢轴 dy',path:'turret.pivot.dy',    type:'num' }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MUZZLES, EVAC, TEXTURES, FIELD_ROWS };
}