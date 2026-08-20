// Ambient global declarations for browser global script architecture
declare var SPREAD: any;
declare function motionSigma(t: any, dt: any, keys?: any): number;

declare var RULES: any;
declare var TAU: number;
declare var ARMOR: any;
declare var COVER_TIERS: any;
declare var BOUNCE_ANGLE: number;
declare var HEIGHTS: any;

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
declare function gunRoot(t: any): { x: number; y: number };
declare function gunTip(t: any): { x: number; y: number };
declare function aimPartPreference(px: any, py: any, tx: any, ty: any, prefDist: any, deadzone: any): 'turret' | 'hull' | 'auto';
declare function bestHitForPref(hits: any, minT: any, maxT: any, pref: any): any;
declare function shellPartHit(hits: any, step: any, pref: any): any;

// 线段挂载模块系统（设计器「模块 Modules」编辑；tank_geometry.js）
// 扁平数据模型：{ key: [ { part, x, y, len, off, mirror }, ... ] }（6 键见 RULES.modules.keys；
// 履带 track 非挂载模块，履带碰撞盒 = 车体极前/极后端自动判定）
declare function normalizeTankModules(m: any): any;
declare function pointInQuad(px: number, py: number, quad: any): boolean;
declare function moduleBandForEdge(verts: any, edgeIdx: number, gx: number, gy: number, len: number, depth: number, off?: any): any;
declare function findModuleBands(verts: any, m: any, axis: any, depth: number): any;
declare function moduleHitFromBands(verts: any, mods: any, part: string, axis: any, depth: number, rx: number, ry: number): any;
declare function hasModulePlacementsOn(mods: any, part: string): boolean;
declare function moduleLabelOf(key: string): string;
declare function moduleAllowedParts(key: string): string[];

declare function makeTank(config?: any): any;
declare function clearPaintCache(): void;
declare function paintShade(hex: string, pct?: number): string;
declare function paintBounds(verts: any): { minX: number; maxX: number; minY: number; maxY: number };
declare function paintBeginLocal(ctx: any, verts: any): void;
declare function paintClipLocal(ctx: any, verts: any): void;
declare function paintTracks(ctx: any, verts: any, cx: any, cy: any, angle: any, scale: any, color: any, phase: any, opts?: any): void;
declare function paintTurretShadow(ctx: any, verts: any, cx: any, cy: any, angle: any, scale: any, ox: number, oy: number, worldAng?: any): void;
declare function getCachedTankSprite(color: any, kind: any, verts: any, hasTurret: any, heightClass: any, texture?: any): any;
declare function paintPartTextureDirect(ctx: any, verts: any, cx: any, cy: any, angle: any, scale: any, color: any, kind: any, opts?: any): void;
declare function paintPartTexture(ctx: any, verts: any, cx: any, cy: any, angle: any, scale: any, color: any, kind: any, opts?: any): void;
declare var TEXTURE_DEFS: Record<string, { name: string; draw: ((ctx: any, bbox: any) => void) | null }>;
declare function applyTankConfig(t: any, cfg: any): void;
declare function computeStats(base: any, modifiers?: any): any;
declare function addModifier(t: any, mod: any): any;
declare function addTimedModifier(t: any, mod: any, durationMs: any): any;
declare function removeModifierBySource(t: any, source: any): any;
declare function removeModifiersByScope(t: any, scope: string): any;
declare function removeRunModifiers(t: any): any;
declare function refreshStats(t: any): any;
declare function tankKmh(t: any): number;
declare function updateSigma(t: any, dt: any, keys?: any): void;
declare function tickDebuffs(t: any, dt: any): void;
declare function debuffSpread(t: any): number;
declare function debuffReloadRate(t: any): number;
declare function normalizeBarrel(b: any): any;

declare function resolveHit(shooter: any, target: any, hit: any, angle: any, dist: any): any;
declare function resolveCoverCollisions(t: any, dt?: any, moveX?: any, moveY?: any): void;
declare function getCoverUnderTank(t: any): any;
declare function coverCorners(cov: any): any[];
declare function coverCollisionParts(cov: any): any[][];
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

interface NodeGenOptions {
  seed?: number | string;
  templateId?: string;
  centerX?: number;
  centerY?: number;
  x?: number;
  y?: number;
  scale?: number;       // #24：模板放大倍率（tank_nodegen.js generateNode 消费）
  cullRate?: number;
  applyToCovers?: boolean;
}

interface GeneratedNodeResult {
  template: {
    id: string;
    name: string;
    tags: string[];
    w: number;
    h: number;
    items: any[];
  };
  covers: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    angle: number;
    tier: string;
    hp: number;
    verts?: number[][];
    collisionVerts?: number[][][];
  }>;
  seed: number | string;
  difficulty: number;
  w: number;            // #24：#26 补全——缩放后的节点世界尺寸（tank_map.js 读取）
  h: number;
}

declare var covers: any[];
declare function snapshotCovers(): void;
declare function resetCovers(): void;
declare function hasLineOfSight(ox: number, oy: number, tx: number, ty: number): boolean;

declare var NODE_TEMPLATES: any[];
declare function createRNG(seed?: any): any;
declare function registerTemplate(template: any): void;
declare function getTemplates(): any[];
declare function pickTemplate(diff: number, rng: any): any;   // #24：难度加权模板选择（tank_map 预选用）
declare function generateNode(difficulty?: number, options?: NodeGenOptions): GeneratedNodeResult;

// M0 贴图资产层（js/tank_assets.js，P-06 / §2.10）
declare var ASSET_DEFS: any;
declare var ASSET_IMAGES: any;
declare var ASSET_CACHE: any;
declare function assetImage(key: string): any;
declare function loadAssetImage(key: string): void;
declare function preloadAssets(): void;
declare function getBakedSprite(key: string, w: number, h: number, layer?: string): any;
declare function bakeAssetCanvas(key: string, w: number, h: number, layer?: string): any;
declare function drawAsset(ctx: any, key: string, x: number, y: number, w: number, h: number, angle?: number): void;
declare function drawAssetCanopy(ctx: any, key: string, x: number, y: number, w: number, h: number): void;

// M1 声音占位系统（js/tank_audio.js，P-07 / §2.11）
declare var SOUND_DEFS: any;
declare var AUDIO_SETTINGS: any;
declare function initAudio(): any;
declare function ensureAudio(): any;
declare function playSound(key: string, opts?: any): boolean;
declare function validateSoundDefs(defs?: any): string[];
// webkitAudioContext：旧 WebKit 前缀 AudioContext（Safari <14.1 等），不在 TS DOM lib 标准类型中
declare var webkitAudioContext: any;

// 摄像机 + 视口剔除（js/tank_camera.js，P-08 / §6 条目 6）
interface CameraState {
  x: number;
  y: number;
  vw: number;
  vh: number;
  zoom: number;
  bounds: { w: number; h: number } | null;
}
declare function createCamera(opts?: any): CameraState;
declare function updateCamera(cam: CameraState, target: any, dt: number, opts?: any): void;
declare function clampCamera(cam: CameraState): void;
declare function worldToScreen(cam: CameraState, wx: number, wy: number): { x: number; y: number };
declare function screenToWorld(cam: CameraState, sx: number, sy: number): { x: number; y: number };
declare function viewBounds(cam: CameraState): { minX: number; minY: number; maxX: number; maxY: number };
declare function aabbInView(cam: CameraState, x: number, y: number, w: number, h: number, margin?: number): boolean;

// 全局游戏流程状态机（js/tank_flow.js，P-08 / §6 条目 6 捆绑前置）
interface FlowState {
  state: string;
  prev: string | null;
  payload: any;
  runId: number;
  _watchers: Function[];
}
declare var FLOW_STATES: string[];
declare var FLOW_TRANSITIONS: any;
declare function createFlow(): FlowState;
declare function watchFlow(flow: FlowState, fn: Function): Function;
declare function transition(flow: FlowState, next: string, payload?: any): void;
declare function restartRun(flow: FlowState): void;

// 线性节点链生成 / 通关奖励评分 / 节点实体化（js/tank_map.js，P-08 / §6 条目 6）
declare function difficultyForIndex(index: number, count: number): number;
declare function enemyCountForDifficulty(diff: number): number;
declare function aiTierForDifficulty(diff: number): number;
declare function statMultForDifficulty(diff: number): number;
declare function nodeScaleFor(viewport: any, templateDims: any): number;   // #24：视口 → 节点世界缩放倍率
declare function makeNode(index: number, count: number, rng: any, env?: any): any;
declare function generateRun(seed?: number | string, count?: number, env?: any): { nodes: any[]; seed: number | string };
declare function scoreNode(node: any, result: any): { base: number; bonuses: Array<{ label: string; amount: number }>; total: number };
declare function materializeNode(node: any, env: any): { spawned: any[]; outpost: any };

// 小地图（js/tank_minimap.js，P-08 / §6 条目 6）
declare function minimapLayout(worldW: number, worldH: number, mmW: number, mmH: number): { scale: number; ox: number; oy: number };
declare function worldToMinimap(layout: any, wx: number, wy: number): { x: number; y: number };
declare function worldRectToMinimap(layout: any, minX: number, minY: number, maxX: number, maxY: number): { x: number; y: number; w: number; h: number };
declare function drawMinimap(ctx: any, opts: any): void;

// 卡牌系统（js/tank_cards.js，P-09 / §2.13）
declare var CARD_RARITIES: string[];
declare var RARITY_WEIGHTS: any;
declare var CARD_TAGS: string[];
declare var MODIFIER_STATS: string[];
declare var AMMO_KEYS: string[];
declare var AMMO_FIELDS: string[];
declare var ABILITY_KEYS: string[];
declare var PASSIVE_KEYS: string[];
declare var ECONOMY_FIELDS: string[];
declare var ARMOR_PARTS: string[];
declare var ARMOR_FACES: string[];
declare var CARD_EFFECT_TYPES: string[];
declare function validateCard(card: any): string[];
declare function validateCardEffect(ef: any, path: string): string[];
declare function validateCardSet(cards: any[]): { errors: Array<{ id: string; errs: string[] }>; duplicates: string[] };
declare function isArmorPath(stat: string): boolean;
declare function applyCardEffects(tank: any, card: any, ctx?: any): any[];
declare function cardStackCount(tank: any, cardId: string): number;
declare function drawCardChoices(pool: any[], n?: number, rng?: any): any[];
declare function weightedRarity(r: any): string;

// Boss 系统（js/tank_boss.js，P-09 / §2.14）
declare var BOSS_WEAKSPOT_KEYS: string[];
declare var LOOT_RARITIES: string[];
declare function validateBoss(boss: any): string[];
declare function validateBossStage(stage: any, idx: number): string[];
declare function bossStageFor(boss: any, hpRatio: number): any;
declare function bossStageIndex(boss: any, hpRatio: number): number;
declare function bossInStage(boss: any, hpRatio: number, stageId: string): boolean;
declare function makeBossEntity(boss: any, env: any): any;
declare function applyBossStage(entity: any, stage: any): void;
declare function updateBossStage(entity: any): { changed: boolean; from?: string; to?: string; stage: any };

// 敌人/友军 AI 决策（js/tank_ai.js，P-10 / §6 条目 7）
declare function aiConfig(): any;
declare function aiDecideEnemy(t: any, ctx: any): { turn: number; move: number; turretDesired: number; fire: boolean };
declare function aiDecideAlly(t: any, ctx: any): { turn: number; move: number; turretDesired: number; fire: boolean };
declare function aiDecide(t: any, ctx: any): { turn: number; move: number; turretDesired: number; fire: boolean };

// 死亡/复活状态机（js/tank_revive.js，P-11 / §2.3 / §6 条目 8）
declare function reviveConfig(): any;
declare function findReviveSpot(outpost: any, covers: any[], playerSpawn: any, rng?: any, radius?: number): { x: number; y: number };
declare function pointInAnyCover(covers: any[], x: number, y: number, padding: number): boolean;
declare function reviveTank(t: any, spot: any, invulnSeconds?: number): any;
declare function canRevive(t: any): boolean;
declare function reviveAt(t: any, outpost: any, covers: any[], playerSpawn: any, rng?: any): boolean;

// 无人机体系（js/tank_drone.js，P-17 子目标 4 阶段 2）
declare var DRONE_KINDS: string[];
declare var drones: any[];
declare function droneConfig(): any;
declare function spawnDrone(owner: any, kind?: string, opts?: any): any;
declare function countDrones(owner?: any): number;
declare function clearDrones(owner?: any): number;
declare function updateDrones(dt: number, ctx?: any): Array<{ type: string; drone: any; target: any; damage: number }>;
declare function droneIndicators(cam: any, entities: any[]): Array<{ x: number; y: number; angle: number; dist: number; team: string; kind: string }>;
declare function droneDamage(drone: any): number;

// 战术炮击（js/tank_strike.js，P-17 子目标 1 阶段 2）
declare var strikes: any[];
declare function strikeConfig(): any;
declare function callStrike(x: number, y: number, opts?: any): any[];
declare function updateStrikes(dt: number, entities?: any[], ctx?: any): Array<{ type: string; x: number; y: number; radius: number; dmg: number; owner: any; hits: any[] }>;
declare function activeStrikes(): any[];
declare function clearStrikes(owner?: any): number;
declare function strikeDamage(owner: any, dmgMult?: number): number;

// 战术护盾（js/tank_shield.js，P-17 子目标 3 阶段 2）
declare function shieldConfig(): any;
declare function applyShield(t: any, opts?: any): any;
declare function updateShield(t: any, dt: number): void;
declare function shieldAbsorbs(t: any, shell: any): boolean;
declare function absorbDamage(t: any, dmg: number): number;
declare function hasShield(t: any): boolean;

// 主动能力统一入口（js/tank_abilities.js，P-17 子目标 3 阶段 2）
declare var ABILITY_KEYS_RUNTIME: string[];
declare function abilitiesConfig(): any;
declare function hasAbility(t: any, key: string): boolean;
declare function updateAbilityCd(t: any, dt: number): void;
declare function tryActivateAbility(t: any, key: string, ctx?: any): any;

// 经济与存档（js/tank_economy.js，P-14 / §2.4 / §6 条目 10）
declare var UPGRADE_DEFS: any[];
declare function economyConfig(): any;
declare function getUpgradeDef(id: string): any;
declare function defaultProfile(): any;
declare function normalizeProfile(p: any): any;
declare function loadProfile(storage: any): any;
declare function saveProfile(storage: any, profile: any): boolean;
declare function killScore(): number;
declare function scoreToPoints(score: number, ratio?: number): number;
declare function upgradeLevel(profile: any, id: string): number;
declare function canBuyUpgrade(profile: any, id: string): boolean;
declare function buyUpgrade(profile: any, id: string): boolean;
declare function applyUpgrades(tank: any, profile: any): number;
