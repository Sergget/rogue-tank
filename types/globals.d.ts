// Ambient global declarations for browser global script architecture
declare var SPREAD: any;
declare function motionSigma(t: any, dt: any, keys?: any): number;

declare var RULES: any;
declare var TAU: number;
declare var ARMOR: any;
declare var COVER_TIERS: any;
declare var BOUNCE_ANGLE: number;

declare function norm(rad: any): number;
declare function angDiff(a: any, b: any): number;
declare function gaussian(sigma?: any): number;
declare function rotate(dx: any, dy: any, theta: any): { x: number; y: number };
declare function distToSegment(px: any, py: any, ax: any, ay: any, bx: any, by: any): number;
declare function segRayIntersect(ox: any, oy: any, dx: any, dy: any, ax: any, ay: any, bx: any, by: any): any;
declare function partCorners(t: any, partKey?: any, x?: any, y?: any, angle?: any): any;
declare function partEdges(corners: any): any;
declare function reflectDir(dirX: any, dirY: any, normalX: any, normalY: any): any;

declare function hullPoly(t: any): any;
declare function turretPoly(t: any): any;
declare function raycastTank(t: any, ox: any, oy: any, dx: any, dy: any, maxDist?: any): any;
declare function bestTankHit(hits: any): any;
declare function moduleFromHit(hit: any, target?: any): any;
declare function gunRoot(t: any): [number, number];
declare function gunTip(t: any): [number, number];
declare function aimPartPreference(px: any, py: any, tx: any, ty: any, prefDist: any, deadzone: any): 'turret' | 'hull' | 'auto';
declare function bestHitForPref(hits: any, minT: any, maxT: any, pref: any): any;

declare function makeTank(config?: any): any;
declare function clearPaintCache(): void;
declare function paintTracks(ctx: any, verts: any, cx: any, cy: any, angle: any, scale: any, color: any, phase: any, opts?: any): void;
declare function applyTankConfig(t: any, cfg: any): void;
declare function computeStats(t: any): void;
declare function normalizeBarrel(b: any): any;

declare function resolveHit(shooter: any, target: any, hit: any, angle: any, dist: any): any;
declare function resolveCoverCollisions(t: any, dt?: any, moveX?: any, moveY?: any): void;
declare function getCoverUnderTank(t: any): any;
declare function getPartZRange(t: any, part: any): any;

declare var entities: any[];
declare function spawnTank(cfg: any, team: any, x: any, y: any): any;
declare function isHostile(teamA: any, teamB: any): boolean;
declare function nearestEnemyTo(t: any): any;
declare function obbMTVs(polyA: any, polyB: any): any;

declare function spawnMuzzleFlash(x: any, y: any, angle: any, style?: any): void;
declare function spawnImpactFx(x: any, y: any, type: any, angle?: any): void;
declare function burstExplosion(x?: any, y?: any, r?: any, count?: any, speed?: any, color?: any): void;
declare function pushLog(msg: any, color?: any): void;

declare function turretPivot(t: any): { x: number; y: number };
declare function turretFrontDist(t: any): number;
declare function polyCorners(cx: number, cy: number, angle: number, poly: any): any[];
declare function superstructureAngle(t: any): number;
declare function engineLocalX(t: any): number;

declare function drawTank(ctx: any, t: any): void;
declare function drawBrokenTracks(ctx: any, t: any): void;
declare function drawCharredHull(ctx: any, t: any): void;
declare function drawFireGlow(ctx: any, t: any): void;
declare function drawShells(ctx: any, shells: any[]): void;
declare function drawCover(ctx: any, cov: any): void;
declare function drawFoliage(ctx: any, covers: any[]): void;
declare function drawClassBadge(ctx: any, t: any, x: number, y: number): void;
declare function setDebuff(t: any, name: any, sec: any): void;
declare function debuffTurnRate(t: any): number;
declare function debuffSpeedRate(t: any): number;
declare function clamp(val: any, min: any, max: any): number;
declare function advanceTracks(t: any, dx: any, dy: any, dAngle: any): void;

declare function superstructureLabel(hit: any): string;
declare function faceLabel(faceKey: any): string;
declare function moduleMult(m: any, target?: any): number;
