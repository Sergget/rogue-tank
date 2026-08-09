'use strict';

// tank_presets.js — 炮管/炮盾预设表（内容数据，原 tank_designer.html 内联）。
// 由 tank_designer.html 加载（tank_utils / tank_halfgeom 之后）。
// 若未来需要按炮组目录/卡牌复用，这里就是配置入口。

// gun barrel presets: len/% of turret length, width/% of turret width, muzzle brake,
// evacuator style + pos/% of barrel, jacket len/% + pos/%
const BARREL_PRESETS = {
   standard:    { len:120, width:18, muzzle:'none',  evac:{ style:'ring', pos:30 }, jacket:{ len:0, pos:45 } },
   long50:      { len:195, width:10, muzzle:'none',  evac:{ style:'slotted', pos:62 }, jacket:{ len:0, pos:45 } },
   shorthowitzer: { len:85, width:28, muzzle:'double', evac:{ style:'bulb', pos:35 }, jacket:{ len:0, pos:45 } },
   cannon:      { len:140, width:16, muzzle:'single', evac:{ style:'ring', pos:48 }, jacket:{ len:0, pos:45 } },
   longcannon:  { len:220, width:12, muzzle:'double', evac:{ style:'ring', pos:58 }, jacket:{ len:40, pos:50 } },
   autoloader:  { len:110, width:22, muzzle:'slug',  evac:{ style:'none', pos:0 }, jacket:{ len:0, pos:45 } }
};
// 炮盾 mantlet 预设（纯视觉）：style = 样式，pos = 位置(%炮管长，负=缩回炮塔内)，width = 宽度(%炮塔全宽)
const MANTLE_PRESETS = {
   none:   { style:'none',   pos:0,  width:40 },
   single: { style:'single', pos:0,  width:40 },
   double: { style:'double', pos:5,  width:50 },
   collar: { style:'collar', pos:0,  width:28 },
   box:    { style:'box',    pos:0,  width:66 },
   winged: { style:'winged', pos:-12, width:46 },
   wedge:  { style:'wedge',  pos:0,  width:44 }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BARREL_PRESETS, MANTLE_PRESETS };
}