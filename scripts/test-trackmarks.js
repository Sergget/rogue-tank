'use strict';
// #U41（2026-10-19）履带痕迹回归：盖章节流 / 差速位移 / 寿命淡出 / 上限 / clear。
// 纯逻辑（mini-canvas 不需要），Node 直跑。
// #U42（2026-10-19）：补项目分层约定的 require/shim（test-qa 检查：utils 层先加载 + global.TAU/RULES）。
const path = require('path');
const U = require('../js/tank_utils.js');
global.TAU = U.TAU;
global.norm = U.norm; global.rotate = U.rotate;
global.segRayIntersect = U.segRayIntersect; global.partCorners = U.partCorners;
global.partEdges = U.partEdges; global.reflectDir = U.reflectDir;
global.distToSegment = U.distToSegment; global.gaussian = U.gaussian; global.angDiff = U.angDiff;
const R = require('../js/tank_rules.js');
global.RULES = R.RULES;
const FX = require(path.join(__dirname, '..', 'js', 'tank_fx.js'));

let fails = 0;
function ok(cond, label) {
  if (cond) console.log('  ok ' + label);
  else { console.log('  FAIL ' + label); fails++; }
}
function mkTank(x, y, ang) {
  return { hp: 1, x, y, hullAngle: ang, hullWid: 32, trackOffset: 0, trackWidth: 8 };
}

// ① 9px 位移 → 两侧各 1 段；1px 不盖章
{
  FX.clearTrackMarks();
  const t = mkTank(0, 0, 0);
  FX.emitTankTracks(t);
  t.y = 9; FX.emitTankTracks(t);
  ok(FX.trackMarkCount() === 2, '9px move stamps both tracks (2 segments)');
  t.y = 10; FX.emitTankTracks(t);
  ok(FX.trackMarkCount() === 2, '1px move does not stamp');
}
// ② 转向差速：原地转 90°（两侧履带反向位移）
{
  FX.clearTrackMarks();
  const t = mkTank(0, 0, 0);
  FX.emitTankTracks(t);
  t.hullAngle = Math.PI / 2;   // 原地转：左履带点位移 = 16*sqrt2 ≈ 22.6px
  FX.emitTankTracks(t);
  ok(FX.trackMarkCount() === 2, 'pivot turn stamps both tracks (differential)');
}
// ③ 寿命到期淡出
{
  FX.clearTrackMarks();
  const t = mkTank(0, 0, 0);
  FX.emitTankTracks(t);
  t.y = 9; FX.emitTankTracks(t);
  ok(FX.trackMarkCount() === 2, 'pre-expiry segments exist');
  FX.updateTrackMarks(12.5);
  ok(FX.trackMarkCount() === 0, 'segments expire after max life');
}
// ④ 上限封顶（600）
{
  FX.clearTrackMarks();
  const t = mkTank(0, 0, 0);
  FX.emitTankTracks(t);
  for (let i = 1; i <= 700; i++) { t.y = i * 9; FX.emitTankTracks(t); }
  ok(FX.trackMarkCount() <= FX.FX_MAX_TRACK_MARKS, 'cap ' + FX.trackMarkCount() + ' <= ' + FX.FX_MAX_TRACK_MARKS);
  ok(FX.trackMarkCount() === FX.FX_MAX_TRACK_MARKS, 'cap reached exactly');
}
// ⑤ clear
{
  FX.clearTrackMarks();
  ok(FX.trackMarkCount() === 0, 'clearTrackMarks empties');
}
// ⑥ 死车不盖章
{
  FX.clearTrackMarks();
  const t = mkTank(0, 0, 0); t.hp = 0;
  FX.emitTankTracks(t);
  t.y = 9; FX.emitTankTracks(t);
  ok(FX.trackMarkCount() === 0, 'dead tank emits nothing');
}
console.log(fails === 0 ? 'test-trackmarks: 全部通过' : fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
