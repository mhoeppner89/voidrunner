import * as THREE from 'three';
import { AudioManager } from './audio.js';
import { COMMODITIES, DOCK_LOCATION_IDS, EQUIPMENT, GUILD_RANK_NAMES, LOCATIONS, NAV_LOCATION_IDS, SHIPS, displaySpeed, equipmentIds, hyperdriveArrivalRadius, locationInstanceRadius, sectorEncounterChance, spawnClearance } from './data.js';
import { buyCommodity, cargoCapacity, cargoFree, cargoMass, refreshAllPrices, sellCommodity, tickEconomy } from './economy.js';
import { InputManager } from './input.js';
import { acceptMission, awardCareerProgress, completeBountyMission, completeMissionsAtDock, failExpiredMissions, joinGuild, refreshMissionOffers, VALUABLE_CARGO_LABELS, } from './missions.js';
import { clamp, damp, formatCredits, pick, proceduralCallsign, randomBetween, randomInt, seededRandom } from './random.js';
import { EntityStore } from './entityStore.js';
import { SpaceRenderer } from './render.js';
import { saveGame } from './save.js';
import { equipmentUnlocked, getEffectiveShipStats, refillCost, repairCost } from './shipStats.js';
import { asteroidCollisionRadius, generateAsteroidField, generateGraveyardPieces, generateWreckNodes } from './worldData.js';
import { PILOT_LINES, pilotMod, rollPilot, TEMPERAMENT_LABELS, TIER_LABELS } from './pilots.js';
import { playerShipVariant, shipVariantForRole } from './voxelModels.js';
const FORWARD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
// Situation lines that land at most once per ship (first contact, the player's
// rank, and the valuable-load callouts) — remembered in pilotLineHistory.said.
const PILOT_ONESHOT_KEYS = new Set(['contact', 'rank', 'case', 'cargo']);
const PLAYER_RADIUS = 1.25;
// The widest rendered field obstacle (a scaled monolith ≈ 130u × 1.6) exceeds
// the old 140u collision margin, so grid queries must pad by this much to catch
// the surface of the biggest rocks before the ship is inside them.
const MAX_FIELD_OBSTACLE_RADIUS = 320;
const HYPERDRIVE_THREAT_RADIUS = 360;
const HYPERDRIVE_CRUISE_SPEED = 50000;
const HYPERDRIVE_DISPLAY_SPEED = 1000;
const HYPERDRIVE_SPOOL_SECONDS = 2;
const HYPERDRIVE_FX_DURATION = 0.9;
const HYPERDRIVE_INTERRUPT_DURATION = 1.1;
const ENCOUNTER_LOCK_RADIUS = 8000;
const AUTO_DOCK_SPEED = 8;
const DOCK_SAFE_RADIUS = 320;
const COMBAT_CALM_SECONDS = 40;
const HYPERDRIVE_ALIGNMENT = 0.88;
// Nav-map contact radii track the doubled base sensor range (radarRange 800/1200),
// so the map and radar show the same volume target selection can reach.
const MAP_CONTACT_RANGE = 720;
const MAP_RESOURCE_CONTACT_RANGE = 300;
const MAP_RESOURCE_CONTACT_LIMIT = 48;
const MAP_WRECK_CONTACT_RANGE = 600;
const MAP_WRECK_CONTACT_LIMIT = 48;
const TARGET_TAP_DRIFT = 14;
// Fixed-timestep simulation: the sim advances in exact 1/60s steps regardless of
// render rate, so combat feel is frame-rate independent and headless probes are
// deterministic. Leftover frame time is carried in simAccumulator and the render
// interpolates between the previous and current sim states by that fraction.
const SIM_STEP = 1 / 60;
const MAX_SIM_STEPS = 6;
// Strafing-run dogfight pacing (WW2 fighter / Privateer jousting): close in, fire,
// blow past, then extend before turning back. No point-blank hugging, no endless circles.
const ATTACK_PASS_RANGE = 55;
// Beyond this range a timid pilot only calls for help when a hit actually
// bites hull — long-range potshots that just graze shields aren't worth a
// MAYDAY. Sits just past the player's max bolt range (~277), so the rule only
// bites when the fight is genuinely long.
const DISTRESS_CLOSE_RANGE = 300;
// How close the player must get before a pilot mutters a proximity line — an
// edge-triggered reaction to being noticed, separate from the timed chatter.
const PROXIMITY_RANGE = 350;
// One voice at a time: the minimum gap between pilot lines, so a furball of
// hostiles can't drown the comms bar — each line is fully visible before the
// next lands. Story lines bypass the gate (they mute everything else).
const CHATTER_GAP = 9;
// How often the first scan of a recognized pilot offers a favor (a valuable
// wreck tip or a market contact) instead of just a deferential scan.
const PILOT_FAVOR_CHANCE = 0.35;
// How much more likely a wary pilot (one who escaped after surrendering) is
// to give up on any hull hit than their temperament would normally allow.
const WARY_FLEE_MULTIPLIER = 1.5;
// Marker shown in the scan toast and target monitor for a ship whose pilot
// remembers the player from a previous surrender (spared or escaped).
const SPARED_MARK = '✦';
// Which surrender action a beaten pilot picks, weighted by temperament: run,
// jettison cargo or pay and run, or power down (optionally after dumping the
// hold). Timid pilots give up everything; aggressive pilots mostly run and
// almost never power down.
const SURRENDER_WEIGHTS = {
    timid: { flee: 1, eject: 3, pay: 3, down: 2, downEject: 4, downPay: 4 },
    steady: { flee: 3, eject: 2, pay: 2, down: 2, downEject: 1, downPay: 1 },
    aggressive: { flee: 6, eject: 2, pay: 1, down: 1, downEject: 0, downPay: 0 },
    flamboyant: { flee: 2, eject: 4, pay: 3, down: 1, downEject: 2, downPay: 1 },
};
// What a surrendering pilot jettisons, by role: the hold matches what the
// ship would actually be hauling — trade goods from a freighter, ore from a
// miner, looted tech (and the occasional smuggled arms, already a wreck-
// salvage type) from pirates and bounty targets.
const SURRENDER_EJECT_POOLS = {
    trader: ['water', 'food', 'medicine', 'electronics', 'machinery', 'luxuries'],
    miner: ['ore', 'machinery', 'scrap'],
    patrol: ['food', 'water', 'medicine'],
    pirate: ['electronics', 'machinery', 'scrap', 'luxuries'],
    bounty: ['electronics', 'machinery', 'luxuries', 'arms'],
    escort: ['electronics', 'machinery', 'scrap', 'luxuries'],
};
const ATTACK_RESET_RANGE = 175;
const ATTACK_SEPARATION = 22;
const ATTACK_FIRE_RANGE = 140;
// Lateral aim offset so a strafing pass is a near-miss beside the target
// (WW2-style deflection joust) rather than a ram through its center.
const ATTACK_PASS_STANDOFF = 15;
const ATTACK_PASS_STANDOFF_FLOOR = 10;
// Ship-to-ship avoidance: when another ship (usually the player) is closing on a
// line that will cross within a few units, the pilot throws in a decisive evasive
// turn rather than riding the line into a collision. The separation threshold sits
// below the intended near-miss pass standoff so normal jousts are unaffected.
const SHIP_AVOID_SEPARATION = 10;
const SHIP_AVOID_HORIZON = 4.0;
const SHIP_AVOID_RANGE = 240;
const SHIP_AVOID_STEER = 1.8;
// Cover-seeking: a damaged ship with drained shields ducks behind a big rock
// or wreck to let shields regenerate before breaking out for another joust.
const COVER_MIN_RADIUS = 42;
const COVER_SEEK_RANGE = 720;
const COVER_ARRIVE_DIST = 48;
const COVER_RECHARGE_SHIELD = 0.8;
const COVER_HOLD_MAX = 9;
const vec = (value, out = new THREE.Vector3()) => out.set(value[0], value[1], value[2]);
const tuple = (value) => [value.x, value.y, value.z];
const quat = (value, out = new THREE.Quaternion()) => out.set(value[0], value[1], value[2], value[3]);
const quatTuple = (value) => [value.x, value.y, value.z, value.w];
// In-place variants: entities keep their transform arrays for the whole
// lifetime now, so writes mutate instead of replacing (zero allocation).
const tupleInto = (dst, value) => {
    dst[0] = value.x;
    dst[1] = value.y;
    dst[2] = value.z;
    return dst;
};
const quatTupleInto = (dst, value) => {
    dst[0] = value.x;
    dst[1] = value.y;
    dst[2] = value.z;
    dst[3] = value.w;
    return dst;
};
// Allocation-free segment/sphere intersection: scalar math only, no Vector3
// temporaries, because this runs over hundreds of field obstacles per frame.
const segmentSphereHit = (start, end, center, radius) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const ox = start.x - center.x;
    const oy = start.y - center.y;
    const oz = start.z - center.z;
    const a = dx * dx + dy * dy + dz * dz;
    if (a < 1e-8)
        return undefined;
    const b = 2 * (ox * dx + oy * dy + oz * dz);
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0)
        return undefined;
    const root = Math.sqrt(discriminant);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    if (t1 >= 0 && t1 <= 1)
        return t1;
    if (t2 >= 0 && t2 <= 1)
        return t2;
    return undefined;
};
export class GameSession {
    ui;
    onQuit;
    save;
    renderer;
    input;
    audio = new AudioManager();
    asteroids;
    graveyard;
    wreckNodes;
    ships = [];
    projectiles = [];
    pickups = [];
    // Per-ship chat memory: the last pool key and line index used, so chatter
    // rotates through the pools instead of repeating the same line back to
    // back, and the one-shot first-contact line only lands once per ship.
    pilotLineHistory = new Map();
    // Story-mission seam: while a story line is up (storyLineUntil in the
    // future), every chatter emitter returns before rolling, so no combat
    // lines, mutters, taunts, or distress calls land and the seeded roll
    // streams stay untouched — chatter resumes where it left off.
    storyLineUntil;
    // Global one-voice gate: the world time at which the next pilot line may
    // land (see chatterOpen/sayPilotLine).
    nextChatterAt;
    // Flat component stores: projectile/pickup transforms live in Float32Array
    // channels keyed by slot; the renderer reads the same channels (no sync
    // arrays, no per-step tuple() allocations, no shared scratch objects).
    projStore = new EntityStore(256);
    pickupStore = new EntityStore(64);
    extractionCarry = new Map();
    tmpA = new THREE.Vector3();
    tmpB = new THREE.Vector3();
    tmpC = new THREE.Vector3();
    tmpQ = new THREE.Quaternion();
    tmpQ2 = new THREE.Quaternion();
    tmpEuler = new THREE.Euler();
    // Scratch vectors/matrices reused across the per-ship AI so the flight loop
    // allocates almost nothing on the hot path (GC pauses were janking combat).
    tmpD = new THREE.Vector3();
    tmpE = new THREE.Vector3();
    tmpF = new THREE.Vector3();
    tmpG = new THREE.Vector3();
    tmpH = new THREE.Vector3();
    tmpI = new THREE.Vector3();
    tmpJ = new THREE.Vector3();
    tmpK = new THREE.Vector3();
    tmpL = new THREE.Vector3();
    tmpM4 = new THREE.Matrix4();
    tmpAvoidance = new THREE.Vector3();
    tmpShipAvoid = new THREE.Vector3();
    // Dedicated scratch for the collision normal: the player position vector in
    // updatePlayer aliases this.tmpA, so writing the normal into tmpA used to
    // overwrite the ship's position with a unit vector (teleport to open space).
    tmpCollide = new THREE.Vector3();
    // Projectile/pickup step scratches (store reads/writes). Owned by
    // updateProjectiles/updatePickups so they never alias live sim state.
    tmpP0 = new THREE.Vector3();
    tmpP1 = new THREE.Vector3();
    tmpP2 = new THREE.Vector3();
    tmpP3 = new THREE.Vector3();
    tmpP4 = new THREE.Vector3();
    frameId = 0;
    lastFrame = performance.now();
    simAccumulator = 0;
    active = true;
    autopilot = false;
    afterburning = false;
    utilityActive = false;
    utilitySoundCooldown = 0;
    gunCooldown = 0;
    missileCooldown = 0;
    playerShieldDelay = 0;
    collisionMessageCooldown = 0;
    hintCooldown = 0;
    scanCooldown = 0;
    encounterCounter = 0;
    jumpCounter = 0;
    interceptCounter = 0;
    hyperdriveEncounterAt = null;
    hyperdriveFx = 'none';
    hyperdriveSpoolStartedAt = 0;
    hyperdriveFxUntil = 0;
    // Throttle the ship was holding when the current jump started; restored on
    // every hyperdrive exit so a jump never silently changes the cruise speed.
    hyperdriveReturnThrottle = 0.35;
    lastCombatAt = -Infinity;
    entityCounter = 0;
    projectileCounter = 0;
    pickupCounter = 0;
    nextEncounterAt = 0;
    lastAutosaveAt = 0;
    lastMissionCheck = 0;
    lastHudUpdate = 0;
    deathTimer = 0;
    salvageAmbushTriggered = new Set();
    fpsAccumulator = 0;
    obstacleGrid = null;
    obstacleGridInstance = undefined;
    obstacleGridBuiltAt = -Infinity;
    obstacleCellSize = 256;
    fpsFrames = 0;
    qualityScale = 1;
    activeInstanceId;
    targetPointer;
    arena = null;
    constructor(save, ui, onQuit, arena = null, tiltGranted = false) {
        this.arena = arena;
        this.ui = ui;
        this.onQuit = onQuit;
        this.save = save;
        this.ui.attachSave(save);
        this.asteroids = generateAsteroidField(save.world.seed, save.world.depletedAsteroids, save.world.scannedNodes);
        this.graveyard = generateGraveyardPieces(save.world.seed);
        this.wreckNodes = generateWreckNodes(save.world.seed, save.world.depletedWrecks, save.world.scannedNodes);
        this.renderer = new SpaceRenderer(ui.viewport, save.world.seed, this.asteroids, this.graveyard, this.wreckNodes, save.settings.quality);
        this.renderer.canvas.addEventListener('pointerdown', this.onSpacePointerDown, { passive: true });
        this.renderer.canvas.addEventListener('pointerup', this.onSpacePointerUp);
        this.renderer.canvas.addEventListener('pointercancel', this.onSpacePointerCancel);
        this.input = new InputManager(ui.root);
        this.input.configureTilt(save.settings);
        // Tilt steering auto-enables for players who asked for it — returning
        // players with a saved neutral, or anyone who granted gyroscope permission
        // from the title screen this session. New players fall back to the stick
        // until they tap ENABLE TILT STEER (which also calibrates neutral).
        if (save.settings.steering !== 'stick' && (save.settings.tiltNeutral || tiltGranted)) {
            void this.input.enableTilt(tiltGranted).then((active) => {
                if (active) {
                    if (!save.settings.tiltNeutral) {
                        this.input.calibrateTilt();
                        save.settings.tiltNeutral = { beta: this.input.tiltNeutralBeta, gamma: this.input.tiltNeutralGamma };
                    }
                    save.settings.steering = 'tilt';
                    saveGame(save);
                    this.ui.setTouchSteering('tilt');
                }
                else {
                    this.ui.setTouchSteering('stick');
                }
            });
        }
        else {
            this.ui.setTouchSteering('stick');
        }
        this.audio.setVolumes(save.settings.music, save.settings.effects);
        this.audio.setStationMode(Boolean(save.player.dockedAt));
        this.ui.setTouchScale(save.settings.touchScale);
        this.nextEncounterAt = save.world.time + 12 + seededRandom(`${save.world.seed}:next-encounter:${Math.floor(save.world.time)}`)() * 14;
        if (arena)
            this.setupArena(arena);
        else
            this.spawnInitialTraffic();
        this.updateActiveInstance(true);
        this.restoreViewState();
        this.frameId = requestAnimationFrame(this.frame);
    }
    setupArena(config, announce = true) {
        const environment = config.environment ?? 'open';
        const scenario = config.scenario ?? '1v1';
        const centers = {
            open: new THREE.Vector3(0, 0, 0),
            'asteroid-field': vec(LOCATIONS.shardbelt.position),
            'debris-field': vec(LOCATIONS['mourning-line'].position),
        };
        const center = centers[environment] ?? centers.open;
        const player = this.save.player;
        const stats = getEffectiveShipStats(player);
        player.dockedAt = undefined;
        // The arena undocks the player (a fresh save starts docked), so the
        // engine must come back on — otherwise the silo's stationMode leaves
        // the arena flight silent until the first restart.
        this.audio.setStationMode(false);
        player.position = tuple(center);
        player.rotation = [0, 0, 0, 1];
        player.velocity = [0, 0, 0];
        player.angularVelocity = [0, 0, 0];
        player.throttle = 0.35;
        player.fuel = stats.fuel;
        player.shield = stats.shield;
        player.armor = stats.armor;
        player.hull = stats.hull;
        player.missiles = stats.missileCapacity;
        player.navTargetId = environment === 'asteroid-field' ? 'shardbelt' : environment === 'debris-field' ? 'mourning-line' : 'helix';
        const hostileCount = scenario === '1v2' ? 2 : scenario === '1v3' || scenario === '2v3' ? 3 : 1;
        const withWingman = scenario === '2v3';
        // The difficulty selector pins the hostile pilot tier (temperament still
        // rolls per faction); ROOKIE / VETERAN / ACE map straight onto the pilot
        // tiers, so the arena is a clean skill ladder.
        const hostilePilot = { tier: config.difficulty ?? 'veteran' };
        let wingman;
        if (withWingman) {
            // 2v3 is two concurrent dogfights: a wingman pockets one hostile off
            // to the side while two hostiles press the player. The pair spawns
            // facing each other so they open with a head-on joust instead of a
            // slow conga-line tail chase.
            const wingDir = new THREE.Vector3(0, 0.15, -1).normalize();
            const wingmanPos = center.clone().addScaledVector(wingDir, 170);
            const attackerPos = center.clone().addScaledVector(wingDir, 360);
            wingman = this.spawnShip('patrol', tuple(wingmanPos));
            const wingAttacker = this.spawnShip('escort', tuple(attackerPos), undefined, undefined, hostilePilot);
            wingAttacker.targetId = wingman.id;
            const faceToward = (ship, toward) => {
                const dir = toward.clone().sub(vec(ship.position)).normalize();
                ship.rotation = quatTuple(new THREE.Quaternion().setFromUnitVectors(FORWARD, dir));
            };
            faceToward(wingman, attackerPos);
            faceToward(wingAttacker, wingmanPos);
        }
        if (withWingman) {
            // Two hostiles press the player from opposite flanks.
            const flanks = [new THREE.Vector3(1, 0, 0.25), new THREE.Vector3(-0.9, 0, -0.3)];
            flanks.forEach((dir, index) => {
                const hostile = this.spawnShip(index === 0 ? 'pirate' : 'escort', tuple(center.clone().addScaledVector(dir.normalize(), 220 + index * 40)), undefined, undefined, hostilePilot);
                hostile.targetId = 'player';
            });
        }
        else {
            for (let index = 0; index < hostileCount; index += 1) {
                const angle = (index / Math.max(1, hostileCount)) * Math.PI * 2 + 0.6;
                const offset = new THREE.Vector3(Math.cos(angle), index % 2 ? 0.5 : -0.35, Math.sin(angle)).normalize().multiplyScalar(220 + index * 40);
                const hostile = this.spawnShip(index === 0 ? 'pirate' : 'escort', tuple(center.clone().add(offset)), undefined, undefined, hostilePilot);
                hostile.targetId = 'player';
            }
        }
        if (announce) {
            const envLabel = environment === 'asteroid-field' ? 'ASTEROID FIELD' : environment === 'debris-field' ? 'DEBRIS FIELD' : 'OPEN SPACE';
            const difficultyLabel = TIER_LABELS[config.difficulty ?? 'veteran'] ?? 'Veteran';
            this.ui.showToast(`COMBAT SIMULATOR · ${scenario.toUpperCase()} · ${envLabel} · ${difficultyLabel.toUpperCase()} PILOTS`, 'info', 5200);
            this.ui.showToast('Hostiles inbound. Weapons free.', 'danger', 3600);
        }
    }
    restartArena() {
        this.ships = [];
        this.projectiles = [];
        this.pickups = [];
        this.autopilot = false;
        this.afterburning = false;
        this.hyperdriveFx = 'none';
        this.hyperdriveEncounterAt = null;
        this.deathTimer = 0;
        this.renderer.setCockpitVisible(true);
        this.audio.setStationMode(false);
        this.ui.hideDock();
        this.ui.showHud();
        this.setupArena(this.arena, false);
        this.ui.showToast('Ship destroyed — arena reset.', 'warning', 3600);
    }
    onSpacePointerDown = (event) => {
        if (event.button !== 0 || this.save.player.dockedAt || this.ui.isModalOpen)
            return;
        this.targetPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
    };
    onSpacePointerUp = (event) => {
        const start = this.targetPointer;
        this.targetPointer = undefined;
        if (!start || start.id !== event.pointerId || this.save.player.dockedAt || this.ui.isModalOpen)
            return;
        const drift = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (drift > TARGET_TAP_DRIFT || performance.now() - start.at > 650)
            return;
        const picked = this.renderer.pickTarget(event.clientX, event.clientY);
        if (picked)
            this.selectPickedTarget(picked);
    };
    onSpacePointerCancel = () => {
        this.targetPointer = undefined;
    };
    selectPickedTarget(target) {
        this.selectTarget(target.kind, target.id);
    }
    updateActiveInstance(force = false) {
        const player = vec(this.save.player.position);
        let next;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const id of NAV_LOCATION_IDS) {
            const distance = player.distanceTo(vec(LOCATIONS[id].position));
            if (distance <= locationInstanceRadius(id) && distance < nearestDistance) {
                next = id;
                nearestDistance = distance;
            }
        }
        if (!force && next === this.activeInstanceId)
            return;
        this.activeInstanceId = next;
        this.renderer.setActiveInstance(next);
        const current = this.getTargetRef(false);
        if (current?.kind === 'asteroid' && next !== 'shardbelt')
            this.clearTarget();
        if (current?.kind === 'wreck' && next !== 'mourning-line')
            this.clearTarget();
    }
    restoreViewState() {
        if (this.save.player.dockedAt) {
            this.renderer.setCockpitVisible(false);
            const messages = completeMissionsAtDock(this.save, this.save.player.dockedAt);
            refreshMissionOffers(this.save);
            this.ui.showDock(this.save, this.save.player.dockedAt);
            messages.forEach((message) => this.ui.showToast(message, 'success', 5200));
            saveGame(this.save);
        }
        else {
            this.renderer.setCockpitVisible(true);
            this.ui.hideDock();
            this.ui.hideTitle();
            this.ui.showHud();
        }
    }
    async enableAudio() {
        await this.audio.enable();
    }
    debugSnapshot() {
        return {
            autopilot: this.autopilot,
            afterburning: this.afterburning,
            ships: this.ships.map((ship) => ({ ...ship, position: [...ship.position], velocity: [...ship.velocity], rotation: [...ship.rotation] })),
            projectiles: this.projectiles.map((projectile) => ({ ...projectile, position: [...this.projStore.pos.subarray(projectile.slot * 3, projectile.slot * 3 + 3)], velocity: [...this.projStore.vel.subarray(projectile.slot * 3, projectile.slot * 3 + 3)] })),
            pickups: this.pickups.map((pickup) => ({ ...pickup, position: [...this.pickupStore.pos.subarray(pickup.slot * 3, pickup.slot * 3 + 3)], velocity: [...this.pickupStore.vel.subarray(pickup.slot * 3, pickup.slot * 3 + 3)] })),
            activeInstance: this.activeInstanceId,
        };
    }
    dispose() {
        if (!this.active)
            return;
        this.active = false;
        cancelAnimationFrame(this.frameId);
        saveGame(this.save);
        this.renderer.canvas.removeEventListener('pointerdown', this.onSpacePointerDown);
        this.renderer.canvas.removeEventListener('pointerup', this.onSpacePointerUp);
        this.renderer.canvas.removeEventListener('pointercancel', this.onSpacePointerCancel);
        this.input.dispose();
        this.renderer.dispose();
    }
    frame = (now) => {
        if (!this.active)
            return;
        let dt = (now - this.lastFrame) / 1000;
        this.lastFrame = now;
        if (dt < 0 || !Number.isFinite(dt))
            dt = 0;
        if (dt > 0.25)
            dt = 0.25;
        this.simAccumulator += dt;
        // Hard cap so a stall/tab-switch can't queue an unbounded catch-up burst.
        if (this.simAccumulator > SIM_STEP * MAX_SIM_STEPS)
            this.simAccumulator = SIM_STEP * MAX_SIM_STEPS;
        // End a story line's mute when the player dismissed the bar or the
        // duration elapsed; runs before the sim so chatter can resume the
        // same frame the story clears.
        this.refreshStoryLine();
        const actions = this.input.getActions();
        const flying = !this.save.player.dockedAt;
        if (flying) {
            if (this.ui.isModalOpen) {
                // Pause/map freeze the sim: drop the accumulated time entirely.
                this.simAccumulator = 0;
                if (actions.pause) {
                    this.ui.hidePause();
                    this.ui.hideMap();
                    this.ui.hideShipMenu();
                    this.ui.hideChatLog?.();
                }
            }
            else if (actions.pause) {
                this.simAccumulator = 0;
                this.ui.showPause();
            }
            else if (actions.map) {
                this.simAccumulator = 0;
                this.openMap();
            }
            else {
                // Edge actions (target cycle, hyperdrive toggle, missile, scan…) run
                // exactly once per frame — never per sim step: a multi-step frame
                // would otherwise double-toggle the hyperdrive or double-cycle
                // targets, and a zero-step frame (120Hz displays) would drop the
                // press entirely. getActions() consumes each edge once.
                if (this.deathTimer <= 0)
                    this.handleActions(actions);
                let steps = 0;
                while (this.simAccumulator >= SIM_STEP && steps < MAX_SIM_STEPS) {
                    this.updateSimulation(SIM_STEP, actions);
                    this.simAccumulator -= SIM_STEP;
                    steps += 1;
                }
            }
        }
        else {
            this.simAccumulator = 0;
        }
        const stats = getEffectiveShipStats(this.save.player);
        const damage = 1 - this.save.player.hull / stats.hull;
        this.audio.update(dt, this.save.player.throttle, this.afterburning, damage);
        this.syncRender(dt, now);
        this.frameId = requestAnimationFrame(this.frame);
    };
    // Copy current entity transforms into prev* slots so the renderer can
    // interpolate. Zero-allocation: the slots are preallocated per entity.
    snapshotInterpolationState() {
        const player = this.save.player;
        player.prevPosition = player.prevPosition ?? new Float64Array(3);
        player.prevRotation = player.prevRotation ?? new Float64Array(4);
        player.prevPosition.set(player.position);
        player.prevRotation.set(player.rotation);
        for (const ship of this.ships) {
            ship.prevPosition = ship.prevPosition ?? new Float64Array(3);
            ship.prevRotation = ship.prevRotation ?? new Float64Array(4);
            ship.prevPosition.set(ship.position);
            ship.prevRotation.set(ship.rotation);
        }
        for (const projectile of this.projectiles)
            this.projStore.snapshot(projectile.slot);
        for (const pickup of this.pickups)
            this.pickupStore.snapshot(pickup.slot);
    }
    updateSimulation(dt, actions) {
        this.snapshotInterpolationState();
        this.renderer.updateWorld(dt);
        this.save.world.time += dt;
        tickEconomy(this.save.world, dt);
        refreshMissionOffers(this.save);
        this.gunCooldown -= dt;
        this.missileCooldown -= dt;
        this.playerShieldDelay -= dt;
        this.collisionMessageCooldown -= dt;
        this.hintCooldown -= dt;
        this.scanCooldown -= dt;
        this.utilitySoundCooldown -= dt;
        if (this.deathTimer > 0) {
            this.deathTimer -= dt;
            this.updateDeathDrift(dt);
            if (this.deathTimer <= 0)
                this.recoverPlayer();
            return;
        }
        this.updatePlayer(dt, actions);
        this.autoScanDeposit();
        this.autoDockCheck();
        this.updateActiveInstance();
        this.updateBountySpawns();
        this.updateDynamicEncounters();
        this.updateShips(dt);
        this.updatePlayerWeapons(dt, actions);
        this.updateProjectiles(dt);
        this.updatePickups(dt);
        this.updateDiscovery();
        this.updateRegeneration(dt);
        this.cleanupEntities();
        if (this.save.world.time - this.lastMissionCheck > 0.8) {
            this.lastMissionCheck = this.save.world.time;
            failExpiredMissions(this.save).forEach((message) => this.ui.showToast(message, 'danger', 4800));
        }
        if (this.save.world.time - this.lastAutosaveAt > 12) {
            this.lastAutosaveAt = this.save.world.time;
            saveGame(this.save);
        }
    }
    handleActions(actions) {
        if (actions.cycleMode) {
            const order = ['combat', 'mining', 'salvage'];
            const index = order.indexOf(this.save.player.mode);
            this.save.player.mode = order[(index + 1) % order.length];
            this.save.player.currentTargetId = undefined;
            this.renderer.setTarget();
            this.ui.showToast(`${this.save.player.mode.toUpperCase()} systems selected.`, 'info');
            this.audio.play('ui');
        }
        if (actions.navNext) {
            const index = NAV_LOCATION_IDS.indexOf(this.save.player.navTargetId);
            this.setNav(NAV_LOCATION_IDS[(index + 1) % NAV_LOCATION_IDS.length]);
        }
        if (actions.targetNearestHostile)
            this.targetNearestHostile();
        else if (actions.targetNext)
            this.cycleTarget();
        if (actions.scan)
            this.scanTarget();
        if (actions.autopilot)
            this.toggleHyperdrive();
        if (actions.missile)
            this.fireMissile();
    }
    updatePlayer(dt, actions) {
        const stats = getEffectiveShipStats(this.save.player);
        // A laden hold dulls the controls: turn rate and acceleration fall with cargo mass.
        const loadScale = this.flightLoadScale();
        stats.acceleration *= loadScale;
        stats.angularAcceleration *= loadScale;
        const position = vec(this.save.player.position, this.tmpA);
        const velocity = vec(this.save.player.velocity, this.tmpB);
        const orientation = quat(this.save.player.rotation, this.tmpQ);
        const angularVelocity = vec(this.save.player.angularVelocity, this.tmpC);
        if (actions.throttleSet !== undefined)
            this.save.player.throttle = actions.throttleSet;
        this.save.player.throttle = clamp(this.save.player.throttle + actions.throttleDelta * dt, 0, 1);
        const manualAuthority = Math.max(Math.abs(actions.pitch), Math.abs(actions.yaw), Math.abs(actions.roll));
        if (this.autopilot && manualAuthority > 0.35) {
            this.autopilot = false;
            this.hyperdriveEncounterAt = null;
            this.hyperdriveFx = 'drop';
            this.hyperdriveFxUntil = this.save.world.time + HYPERDRIVE_FX_DURATION;
            this.save.player.throttle = clamp(this.hyperdriveReturnThrottle, 0, 1);
            this.ui.showToast('Hyperdrive disengaged by manual input.', 'warning');
        }
        // Afterburner: the burn is live whenever the button is held with fuel
        // (never in autopilot), at ANY throttle and ANY speed — turn authority
        // doubles and the burn visuals (FOV, cockpit zoom, engine audio) play
        // the whole time. Only the speed ceiling is gated: it rises to
        // afterburnSpeed once the ship is moving at >= 90% of max speed, so
        // below that the burn holds the current speed instead of adding to it.
        this.afterburning = !this.autopilot && actions.afterburner && this.save.player.fuel > 0.5;
        if (this.autopilot) {
            if (this.hyperdriveEncounterAt !== null && this.save.world.time >= this.hyperdriveEncounterAt) {
                this.hyperdriveEncounterAt = null;
                this.spawnHyperdriveIntercept();
            }
            if (this.hostilesNear(position, HYPERDRIVE_THREAT_RADIUS)) {
                this.autopilot = false;
                this.hyperdriveEncounterAt = null;
                this.hyperdriveFx = 'interrupt';
                this.hyperdriveFxUntil = this.save.world.time + HYPERDRIVE_INTERRUPT_DURATION;
                this.snapToCombatSpeed();
                this.save.player.throttle = clamp(this.hyperdriveReturnThrottle, 0, 1);
                // Re-sync the local velocity: it was captured before the break, so
                // otherwise the stale cruise vector would overwrite the combat-speed snap.
                velocity.copy(vec(this.save.player.velocity));
                this.ui.showToast('HYPERDRIVE BREAK: hostile intercept.', 'danger', 4200);
                this.audio.play('warning');
            }
            else {
                this.steerAutopilot(position, orientation, angularVelocity, dt);
            }
        }
        else {
            // Afterburn doubles turn authority so a boost is also a fight move,
            // not just a straight-line speedup.
            const burnBoost = this.afterburning ? 2 : 1;
            angularVelocity.x += actions.pitch * stats.angularAcceleration * burnBoost * dt;
            angularVelocity.y += -actions.yaw * stats.angularAcceleration * burnBoost * dt;
            angularVelocity.z += -actions.roll * stats.angularAcceleration * burnBoost * dt;
            const dampingRate = stats.angularDamping * (this.save.settings.flightAssist ? 1 : 0.38);
            angularVelocity.multiplyScalar(Math.exp(-dampingRate * dt));
            const deltaRotation = this.tmpQ2.setFromEuler(new THREE.Euler(angularVelocity.x * dt, angularVelocity.y * dt, angularVelocity.z * dt, 'XYZ'));
            orientation.multiply(deltaRotation).normalize();
        }
        const forward = FORWARD.clone().applyQuaternion(orientation).normalize();
        let targetSpeed = this.save.player.throttle * stats.maxSpeed;
        // Speed gate: below 90% of max speed the burn holds the current cruise
        // ceiling (turn move); past it the ceiling rises to afterburnSpeed and
        // the damped acceleration below ramps the boost in smoothly.
        if (this.afterburning && velocity.length() >= 0.9 * stats.maxSpeed)
            targetSpeed = this.save.player.throttle * stats.afterburnSpeed;
        if (this.autopilot) {
            // Charge-up hold: the ship stays put (steering only) while the drive spools,
            // then snaps to full cruise the moment the charge completes. This is the fix
            // for the drive accelerating during the load-up instead of after it.
            targetSpeed = this.hyperdriveFx === 'spooling' ? 0 : HYPERDRIVE_CRUISE_SPEED;
            this.save.player.throttle = 1;
        }
        const forwardSpeed = velocity.dot(forward);
        const lateral = velocity.clone().addScaledVector(forward, -forwardSpeed);
        const accelerationResponse = stats.acceleration / Math.max(12, stats.maxSpeed);
        // Hyperdrive engages and drops out at full cruise/approach speed instantly.
        const nextForwardSpeed = this.autopilot ? targetSpeed : damp(forwardSpeed, targetSpeed, accelerationResponse * 2.2, dt);
        if (this.autopilot) {
            // Cruise keeps the ship locked on its vector; lateral drift is a manual-flight term.
            velocity.copy(forward).multiplyScalar(nextForwardSpeed);
        }
        else {
            lateral.multiplyScalar(Math.exp(-(this.save.settings.flightAssist ? 1.45 : 0.16) * dt));
            velocity.copy(forward).multiplyScalar(nextForwardSpeed).add(lateral);
        }
        if (this.afterburning)
            this.save.player.fuel = Math.max(0, this.save.player.fuel - dt * 1.025);
        else if (this.autopilot && targetSpeed > stats.afterburnSpeed)
            this.save.player.fuel = Math.max(0, this.save.player.fuel - dt * 0.34);
        else
            this.save.player.fuel = Math.max(0, this.save.player.fuel - dt * (0.008 + this.save.player.throttle * 0.018));
        if (this.save.player.fuel <= 0) {
            targetSpeed = Math.min(targetSpeed, 8);
            this.afterburning = false;
        }
        if (this.autopilot && this.hyperdriveFx !== 'spooling') {
            // Predictive drop: settle exactly on the arrival sphere this frame instead of
            // overshooting it by up to a full frame step at 50000 u/s cruise.
            const nav = LOCATIONS[this.save.player.navTargetId];
            const arrivalRadius = hyperdriveArrivalRadius(nav);
            const approach = position.distanceTo(vec(nav.position));
            if (approach - arrivalRadius <= velocity.length() * dt) {
                const outward = position.clone().sub(vec(nav.position)).normalize();
                position.copy(vec(nav.position)).addScaledVector(outward, arrivalRadius + 8);
                velocity.set(0, 0, 0);
            }
        }
        position.addScaledVector(velocity, dt);
        this.resolvePlayerCollisions(position, velocity);
        this.save.player.position = tuple(position);
        this.save.player.velocity = tuple(velocity);
        this.save.player.rotation = quatTuple(orientation);
        this.save.player.angularVelocity = tuple(angularVelocity);
        const nav = LOCATIONS[this.save.player.navTargetId];
        const navDistance = position.distanceTo(vec(nav.position));
        const arrivalRadius = hyperdriveArrivalRadius(nav);
        if (this.autopilot && navDistance <= arrivalRadius + 10) {
            this.autopilot = false;
            this.hyperdriveEncounterAt = null;
            this.hyperdriveFx = 'drop';
            this.hyperdriveFxUntil = this.save.world.time + HYPERDRIVE_FX_DURATION;
            this.save.player.throttle = clamp(this.hyperdriveReturnThrottle, 0, 1);
            this.save.player.velocity = tuple(FORWARD.clone().applyQuaternion(orientation).multiplyScalar(10));
            this.ui.showToast(`Hyperdrive arrival: ${nav.name}.`, 'success');
            this.audio.play('success');
        }
    }
    steerAutopilot(position, orientation, angularVelocity, dt) {
        const nav = LOCATIONS[this.save.player.navTargetId];
        const desired = vec(nav.position).sub(position).normalize();
        const avoidance = this.getAvoidanceVector(position, desired, 65);
        desired.add(avoidance.multiplyScalar(0.85)).normalize();
        // Point the ship at the vector without rolling: keep the up axis as close to
        // world-up as possible, and take the full spool to settle rather than snapping.
        const right = new THREE.Vector3().crossVectors(desired, UP);
        if (right.lengthSq() < 1e-6)
            right.set(1, 0, 0);
        right.normalize();
        const up = new THREE.Vector3().crossVectors(right, desired).normalize();
        this.tmpQ2.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, desired.clone().negate()));
        orientation.slerp(this.tmpQ2, 1 - Math.exp(-1.15 * dt));
        angularVelocity.multiplyScalar(Math.exp(-4.8 * dt));
    }
    resolvePlayerCollisions(position, velocity) {
        const collide = (x, y, z, radius, label) => {
            const ox = position.x - x;
            const oy = position.y - y;
            const oz = position.z - z;
            const minimum = radius + PLAYER_RADIUS;
            const distSq = ox * ox + oy * oy + oz * oz;
            if (distSq >= minimum * minimum || distSq < 0.0001)
                return;
            const dist = Math.sqrt(distSq);
            const nx = ox / dist;
            const ny = oy / dist;
            const nz = oz / dist;
            position.x = x + nx * (minimum + 0.08);
            position.y = y + ny * (minimum + 0.08);
            position.z = z + nz * (minimum + 0.08);
            const impactSpeed = Math.max(0, -(velocity.x * nx + velocity.y * ny + velocity.z * nz)) + velocity.length() * 0.16;
            this.tmpCollide.set(nx, ny, nz);
            velocity.reflect(this.tmpCollide).multiplyScalar(0.32);
            if (impactSpeed > 4) {
                this.damagePlayer((impactSpeed - 3) * 1.65, label);
                if (this.collisionMessageCooldown <= 0) {
                    this.collisionMessageCooldown = 1.4;
                    this.ui.showToast(`Collision: ${label}`, 'danger');
                }
            }
            this.autopilot = false;
        };
        // Debris is an oriented box, not a sphere: a flat panel must block its
        // whole face without ballooning into an invisible sphere around its
        // thin axis. Transform the player into the box's local frame, push out
        // along the nearest face, then rotate the normal back to world space.
        const collideBox = (obstacle, label) => {
            const box = obstacle.box;
            this.tmpQ.set(box.qx, box.qy, box.qz, box.qw);
            this.tmpQ2.copy(this.tmpQ).invert();
            this.tmpF.set(position.x - obstacle.x, position.y - obstacle.y, position.z - obstacle.z).applyQuaternion(this.tmpQ2);
            const hx = box.hx;
            const hy = box.hy;
            const hz = box.hz;
            const ex = hx + PLAYER_RADIUS;
            const ey = hy + PLAYER_RADIUS;
            const ez = hz + PLAYER_RADIUS;
            if (this.tmpF.x < -ex || this.tmpF.x > ex || this.tmpF.y < -ey || this.tmpF.y > ey || this.tmpF.z < -ez || this.tmpF.z > ez)
                return;
            const cx = clamp(this.tmpF.x, -hx, hx);
            const cy = clamp(this.tmpF.y, -hy, hy);
            const cz = clamp(this.tmpF.z, -hz, hz);
            let dx = this.tmpF.x - cx;
            let dy = this.tmpF.y - cy;
            let dz = this.tmpF.z - cz;
            const distSq = dx * dx + dy * dy + dz * dz;
            let nx;
            let ny;
            let nz;
            let push;
            if (distSq > 1e-9) {
                const dist = Math.sqrt(distSq);
                if (dist >= PLAYER_RADIUS)
                    return;
                nx = dx / dist;
                ny = dy / dist;
                nz = dz / dist;
                push = PLAYER_RADIUS - dist + 0.08;
            }
            else {
                // The centre is inside the box (a fast jump tunnelled in):
                // exit through the nearest face.
                const px = hx - Math.abs(this.tmpF.x);
                const py = hy - Math.abs(this.tmpF.y);
                const pz = hz - Math.abs(this.tmpF.z);
                if (px <= py && px <= pz) {
                    nx = this.tmpF.x < 0 ? -1 : 1;
                    ny = 0;
                    nz = 0;
                    push = px + PLAYER_RADIUS + 0.08;
                }
                else if (py <= pz) {
                    nx = 0;
                    ny = this.tmpF.y < 0 ? -1 : 1;
                    nz = 0;
                    push = py + PLAYER_RADIUS + 0.08;
                }
                else {
                    nx = 0;
                    ny = 0;
                    nz = this.tmpF.z < 0 ? -1 : 1;
                    push = pz + PLAYER_RADIUS + 0.08;
                }
            }
            this.tmpG.set(nx, ny, nz).applyQuaternion(this.tmpQ);
            position.x += this.tmpG.x * push;
            position.y += this.tmpG.y * push;
            position.z += this.tmpG.z * push;
            const impactSpeed = Math.max(0, -(velocity.x * this.tmpG.x + velocity.y * this.tmpG.y + velocity.z * this.tmpG.z)) + velocity.length() * 0.16;
            velocity.reflect(this.tmpG).multiplyScalar(0.32);
            if (impactSpeed > 4) {
                this.damagePlayer((impactSpeed - 3) * 1.65, label);
                if (this.collisionMessageCooldown <= 0) {
                    this.collisionMessageCooldown = 1.4;
                    this.ui.showToast(`Collision: ${label}`, 'danger');
                }
            }
            this.autopilot = false;
        };
        const dock = this.activeDockObstacle();
        if (dock)
            collide(dock.x, dock.y, dock.z, dock.collisionRadius, LOCATIONS[dock.id].name);
        else {
            const margin = MAX_FIELD_OBSTACLE_RADIUS;
            const label = this.activeInstanceId === 'shardbelt' ? 'asteroid' : 'wreckage';
            this.forEachObstacleInBox(position.x - margin, position.y - margin, position.z - margin, position.x + margin, position.y + margin, position.z + margin, (obstacle) => {
                if (obstacle.box)
                    collideBox(obstacle, label);
                else
                    collide(obstacle.x, obstacle.y, obstacle.z, obstacle.collisionRadius, label);
            });
        }
    }
    updatePlayerWeapons(dt, actions) {
        this.utilityActive = false;
        if (this.save.player.mode === 'combat') {
            this.renderer.setUtilityBeam(false, 'combat', this.save.player.position);
            if (actions.fire && this.gunCooldown <= 0)
                this.firePlayerGuns();
            return;
        }
        this.updateUtilityTool(dt, actions.fire);
    }
    firePlayerGuns() {
        const stats = getEffectiveShipStats(this.save.player);
        const position = vec(this.save.player.position);
        const orientation = quat(this.save.player.rotation);
        let direction = FORWARD.clone().applyQuaternion(orientation).normalize();
        const target = this.getTargetRef();
        if (this.save.settings.aimAssist && target?.kind === 'ship') {
            const ship = this.ships.find((entry) => entry.id === target.id);
            if (ship) {
                const targetPosition = vec(ship.position);
                const distance = position.distanceTo(targetPosition);
                const predicted = targetPosition.addScaledVector(vec(ship.velocity), distance / 205);
                const assistDirection = predicted.sub(position).normalize();
                if (direction.angleTo(assistDirection) < 0.18)
                    direction.lerp(assistDirection, 0.34).normalize();
            }
        }
        const right = RIGHT.clone().applyQuaternion(orientation).normalize();
        const down = UP.clone().applyQuaternion(orientation).multiplyScalar(-0.24);
        for (const side of [-0.58, 0.58]) {
            const muzzle = position.clone().addScaledVector(right, side).add(down).addScaledVector(direction, 1.8);
            const slot = this.projStore.alloc();
            this.projStore.setPos(slot, muzzle.x, muzzle.y, muzzle.z);
            const shotVel = this.tmpP0.copy(direction).multiplyScalar(205).add(vec(this.save.player.velocity));
            this.projStore.setVel(slot, shotVel.x, shotVel.y, shotVel.z);
            this.projectiles.push({
                id: `p-${++this.projectileCounter}`,
                kind: 'laser',
                ownerId: 'player',
                slot,
                damage: stats.gunDamage,
                life: 1.35,
                targetId: target?.kind === 'ship' ? target.id : undefined,
                faction: 'player',
            });
        }
        this.gunCooldown = 0.17;
        this.audio.play('laser', 0.72);
    }
    fireMissile() {
        if (this.save.player.mode !== 'combat') {
            this.ui.showToast('Missile circuit available only in COMBAT mode.', 'warning');
            return;
        }
        if (this.missileCooldown > 0)
            return;
        if (this.save.player.missiles <= 0) {
            this.ui.showToast('Missile rack empty.', 'warning');
            return;
        }
        const target = this.getTargetRef();
        if (!target || target.kind !== 'ship') {
            this.ui.showToast('No ship target locked.', 'warning');
            return;
        }
        const ship = this.ships.find((entry) => entry.id === target.id);
        if (!ship || ship.hull <= 0)
            return;
        const position = vec(this.save.player.position);
        const orientation = quat(this.save.player.rotation);
        const direction = FORWARD.clone().applyQuaternion(orientation).normalize();
        const slot = this.projStore.alloc();
        this.projStore.setPos(slot, position.x + direction.x * 2.2, position.y + direction.y * 2.2, position.z + direction.z * 2.2);
        const missileVel = this.tmpP0.copy(direction).multiplyScalar(72).add(vec(this.save.player.velocity));
        this.projStore.setVel(slot, missileVel.x, missileVel.y, missileVel.z);
        this.projectiles.push({
            id: `p-${++this.projectileCounter}`,
            kind: 'missile',
            ownerId: 'player',
            slot,
            damage: 42,
            life: 8,
            targetId: ship.id,
            faction: 'player',
        });
        this.save.player.missiles -= 1;
        this.missileCooldown = 1.1;
        this.audio.play('missile');
    }
    updateUtilityTool(dt, firing) {
        const target = this.getTargetRef();
        const stats = getEffectiveShipStats(this.save.player);
        const playerPosition = vec(this.save.player.position);
        const mode = this.save.player.mode;
        const range = mode === 'mining' ? stats.miningRange : stats.salvageRange;
        if (!firing || !target || (mode === 'mining' && target.kind !== 'asteroid') || (mode === 'salvage' && target.kind !== 'wreck')) {
            this.renderer.setUtilityBeam(false, mode, this.save.player.position);
            return;
        }
        const distance = this.surfaceDistance(playerPosition, target);
        if (distance > range) {
            this.renderer.setUtilityBeam(false, mode, this.save.player.position);
            if (this.hintCooldown <= 0) {
                this.hintCooldown = 1.2;
                this.ui.showToast(`Utility target out of range (${Math.round(distance)} / ${Math.round(range)}).`, 'warning');
            }
            return;
        }
        if (this.lineBlocked(playerPosition, vec(target.position), target.id)) {
            this.renderer.setUtilityBeam(false, mode, this.save.player.position);
            if (this.hintCooldown <= 0) {
                this.hintCooldown = 1.2;
                this.ui.showToast('Utility beam obstructed.', 'warning');
            }
            return;
        }
        if (mode === 'mining') {
            const node = this.asteroids.find((entry) => entry.id === target.id);
            if (!node || node.remaining <= 0)
                return;
            if (!node.scanned) {
                this.requireScanHint();
                return;
            }
            this.utilityActive = true;
            this.renderer.setUtilityBeam(true, mode, this.save.player.position, node.position);
            this.extractAsteroid(node, dt, stats.miningRate);
            if (this.utilitySoundCooldown <= 0) {
                this.utilitySoundCooldown = 0.16;
                this.audio.play('mining', 0.34);
            }
        }
        else {
            const node = this.wreckNodes.find((entry) => entry.id === target.id);
            if (!node || node.remaining <= 0)
                return;
            if (!node.scanned) {
                this.requireScanHint();
                return;
            }
            this.utilityActive = true;
            this.renderer.setUtilityBeam(true, mode, this.save.player.position, node.position);
            this.extractWreck(node, dt, stats.salvageRate);
            if (node.hazard > 0.45)
                this.damagePlayer(node.hazard * dt * 1.25, 'radiation exposure', false);
            if (this.utilitySoundCooldown <= 0) {
                this.utilitySoundCooldown = 0.18;
                this.audio.play('salvage', 0.32);
            }
            this.triggerSalvageAmbush(node);
        }
    }
    requireScanHint() {
        this.renderer.setUtilityBeam(false, this.save.player.mode, this.save.player.position);
        if (this.hintCooldown <= 0) {
            this.hintCooldown = 1.2;
            this.ui.showToast('Scanner still cycling — hold steady.', 'warning');
        }
    }
    extractAsteroid(node, dt, rate) {
        if (cargoFree(this.save.player) < COMMODITIES.ore.mass + 0.001) {
            if (this.hintCooldown <= 0) {
                this.hintCooldown = 1.4;
                this.ui.showToast('Cargo hold full. Extraction suspended.', 'warning');
            }
            return;
        }
        const current = this.extractionCarry.get(node.id) ?? 0;
        let next = current + dt * 0.58 * rate * node.richness;
        while (next >= 1 && node.remaining > 0) {
            next -= 1;
            node.remaining = Math.max(0, node.remaining - 1);
            this.save.world.depletedAsteroids[node.id] = node.remaining;
            // Ore is tractored straight into the hold — no pickup to chase.
            this.collectExtraction('ore', 'mining', 1, node.richness > 1.75 ? 'uncommon' : 'common');
            this.ui.showToast('Ore recovered to the hold.', 'success', 2400);
            if (node.remaining <= 0) {
                this.ui.showToast('Deposit exhausted.', 'info');
                this.save.player.currentTargetId = undefined;
                break;
            }
        }
        this.extractionCarry.set(node.id, next);
    }
    extractWreck(node, dt, rate) {
        if (cargoFree(this.save.player) < COMMODITIES[node.salvage].mass + 0.001) {
            if (this.hintCooldown <= 0) {
                this.hintCooldown = 1.4;
                this.ui.showToast('Cargo hold full. Extraction suspended.', 'warning');
            }
            return;
        }
        const current = this.extractionCarry.get(node.id) ?? 0;
        let next = current + dt * 0.48 * rate * (node.rarity === 'rare' ? 0.78 : 1);
        while (next >= 1 && node.remaining > 0) {
            next -= 1;
            node.remaining = Math.max(0, node.remaining - 1);
            this.save.world.depletedWrecks[node.id] = node.remaining;
            // Recovered components go straight to the hold — no pickup to chase.
            this.collectExtraction(node.salvage, 'salvage', 1, node.rarity);
            this.ui.showToast(`${COMMODITIES[node.salvage].name} recovered to the hold.`, 'success', 2600);
            if (node.remaining <= 0) {
                if (node.rarity === 'rare')
                    this.recoverRareEquipment(node);
                this.ui.showToast('Wreck section stripped.', 'info');
                this.save.player.currentTargetId = undefined;
                break;
            }
        }
        this.extractionCarry.set(node.id, next);
    }
    collectExtraction(commodity, source, amount, rarity) {
        this.save.player.cargo[commodity] = (this.save.player.cargo[commodity] ?? 0) + amount;
        if (source === 'mining') {
            this.save.player.stats.mined += amount;
            const rankMessage = awardCareerProgress(this.save, 'mining', 1, 'frontier-miners');
            if (rankMessage)
                this.ui.showToast(rankMessage, 'success', 5000);
        }
        else {
            this.save.player.stats.salvaged += amount;
            const rankMessage = awardCareerProgress(this.save, 'salvage', rarity === 'rare' ? 3 : 1, 'salvage-union');
            if (rankMessage)
                this.ui.showToast(rankMessage, 'success', 5000);
        }
    }
    recoverRareEquipment(node) {
        const rng = seededRandom(`${this.save.world.seed}:rare-equipment:${node.id}`);
        if (rng() > 0.38)
            return;
        const candidates = equipmentIds.filter((id) => !this.save.player.equipment.includes(id));
        if (!candidates.length)
            return;
        const equipmentId = pick(rng, candidates);
        this.save.player.equipment.push(equipmentId);
        const stats = getEffectiveShipStats(this.save.player);
        this.save.player.shield = Math.min(stats.shield, this.save.player.shield + 12);
        this.ui.showToast(`Rare recovery: ${EQUIPMENT[equipmentId].name} installed.`, 'success', 6200);
        this.audio.play('success', 1.35);
    }
    triggerSalvageAmbush(node) {
        if (this.salvageAmbushTriggered.has(node.id))
            return;
        const rng = seededRandom(`${this.save.world.seed}:salvage-ambush:${node.id}`);
        if (rng() > 0.34 + node.hazard * 0.18)
            return;
        this.salvageAmbushTriggered.add(node.id);
        const player = vec(this.save.player.position);
        const pirate = this.spawnShip('pirate', tuple(player.clone().add(new THREE.Vector3(90, 20, -75))));
        pirate.targetId = 'player';
        if (node.rarity === 'rare') {
            const escort = this.spawnShip('escort', tuple(player.clone().add(new THREE.Vector3(-75, -15, -95))));
            escort.targetId = 'player';
        }
        this.threatAcquireTarget();
        this.ui.showToast('Salvage claim challenged: hostile drives inbound.', 'danger', 5200);
        this.audio.play('warning');
    }
    spawnPickup(commodity, origin, source, rarity, amount = 1) {
        const rng = seededRandom(`${this.save.world.seed}:pickup:${++this.pickupCounter}:${this.save.world.time}`);
        const drift = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(randomBetween(rng, 0.8, 2.4));
        const offset = drift.clone().normalize().multiplyScalar(2.2 + rng() * 2.5);
        const slot = this.pickupStore.alloc();
        const originPos = this.tmpP0.copy(vec(origin)).add(offset);
        this.pickupStore.setPos(slot, originPos.x, originPos.y, originPos.z);
        this.pickupStore.setVel(slot, drift.x, drift.y, drift.z);
        this.pickups.push({
            id: `pickup-${this.pickupCounter}`,
            commodity,
            slot,
            amount,
            source,
            rarity,
            life: 140,
        });
    }
    updatePickups(dt) {
        const player = vec(this.save.player.position, this.tmpP3);
        const salvageRange = getEffectiveShipStats(this.save.player).salvageRange * 1.5;
        for (const pickup of this.pickups) {
            pickup.life -= dt;
            const position = this.pickupStore.getPos(pickup.slot, this.tmpP0);
            const velocity = this.pickupStore.getVel(pickup.slot, this.tmpP1);
            const distance = position.distanceTo(player);
            const modeMatches = (this.save.player.mode === 'mining' && pickup.source === 'mining') ||
                (this.save.player.mode === 'salvage' && (pickup.source === 'salvage' || pickup.source === 'combat'));
            if ((this.utilityActive && modeMatches && distance < salvageRange) || distance < 7) {
                const pull = this.tmpP2.copy(player).sub(position).normalize().multiplyScalar((28 / Math.max(2, distance)) * dt);
                velocity.add(pull);
            }
            velocity.multiplyScalar(Math.exp(-0.18 * dt));
            position.addScaledVector(velocity, dt);
            this.pickupStore.setPosV(pickup.slot, position);
            this.pickupStore.setVelV(pickup.slot, velocity);
            if (distance < 3.2)
                this.collectPickup(pickup);
        }
    }
    collectPickup(pickup) {
        if (pickup.life <= 0)
            return;
        if (pickup.commodity === 'credits') {
            // A surrendered pilot's transfer: credits, straight to the wallet —
            // no cargo space involved.
            this.save.player.credits += pickup.amount;
            pickup.life = 0;
            this.ui.showToast(`${formatCredits(pickup.amount)} recovered.`, 'success', 2400);
            return;
        }
        const required = COMMODITIES[pickup.commodity].mass * pickup.amount;
        if (cargoFree(this.save.player) + 0.001 < required) {
            if (this.hintCooldown <= 0) {
                this.hintCooldown = 1.4;
                this.ui.showToast('Cargo hold full. Recovery remains outside.', 'warning');
            }
            return;
        }
        this.save.player.cargo[pickup.commodity] = (this.save.player.cargo[pickup.commodity] ?? 0) + pickup.amount;
        pickup.life = 0;
        if (pickup.source === 'mining') {
            this.save.player.stats.mined += pickup.amount;
            const rankMessage = awardCareerProgress(this.save, 'mining', 1, 'frontier-miners');
            if (rankMessage)
                this.ui.showToast(rankMessage, 'success', 5000);
        }
        else {
            this.save.player.stats.salvaged += pickup.amount;
            const rankMessage = awardCareerProgress(this.save, 'salvage', pickup.rarity === 'rare' ? 3 : 1, 'salvage-union');
            if (rankMessage)
                this.ui.showToast(rankMessage, 'success', 5000);
        }
        this.ui.showToast(`Tractor captured ${COMMODITIES[pickup.commodity].name}.`, 'success', 2200);
    }
    // The cockpit has no manual SCAN control anymore: a selected asteroid or
    // wreck is resolved automatically the moment the ship closes to scan range.
    // Out-of-range status is rendered on the target monitor by buildHudModel.
    autoScanDeposit() {
        if (this.scanCooldown > 0)
            return;
        const target = this.getTargetRef();
        if (!target || (target.kind !== 'asteroid' && target.kind !== 'wreck'))
            return;
        const nodes = target.kind === 'asteroid' ? this.asteroids : this.wreckNodes;
        const node = nodes.find((entry) => entry.id === target.id);
        if (!node || node.scanned)
            return;
        if (this.surfaceDistance(vec(this.save.player.position), target) <= getEffectiveShipStats(this.save.player).scanRange)
            this.scanTarget();
    }
    scanTarget() {
        if (this.scanCooldown > 0)
            return;
        const target = this.getTargetRef();
        if (!target) {
            this.ui.showToast('No target selected for scan.', 'warning');
            return;
        }
        if (target.kind === 'location') {
            // Distance for a locked POI now lives on the target monitor heading;
            // the old NAV-database pop-up card is gone.
            this.scanCooldown = 0.35;
            this.audio.play('scan');
            return;
        }
        const stats = getEffectiveShipStats(this.save.player);
        const distance = this.surfaceDistance(vec(this.save.player.position), target);
        if (target.kind === 'asteroid' || target.kind === 'wreck') {
            // Deposits scan automatically once selected and in range; the
            // out-of-range status lives on the target monitor, not a toast.
            if (distance > stats.scanRange)
                return;
        }
        else if (distance > stats.scanRange) {
            this.ui.showToast(`Target outside scan range (${Math.round(distance)} / ${stats.scanRange}).`, 'warning');
            return;
        }
        if (target.kind === 'asteroid') {
            const node = this.asteroids.find((entry) => entry.id === target.id);
            node.scanned = true;
            if (!this.save.world.scannedNodes.includes(node.id))
                this.save.world.scannedNodes.push(node.id);
            const grade = node.richness > 1.8 ? 'RICH' : node.richness > 1.2 ? 'VIABLE' : 'LEAN';
            this.ui.showToast(`Scan: ${grade} metallic deposit · ${Math.ceil(node.remaining)} recoverable units.`, 'success', 4600);
        }
        else if (target.kind === 'wreck') {
            const node = this.wreckNodes.find((entry) => entry.id === target.id);
            node.scanned = true;
            if (!this.save.world.scannedNodes.includes(node.id))
                this.save.world.scannedNodes.push(node.id);
            this.ui.showToast(`Scan: ${node.rarity.toUpperCase()} ${COMMODITIES[node.salvage].name} · hazard ${Math.round(node.hazard * 100)}.`, 'success', 4800);
        }
        else {
            const ship = this.ships.find((entry) => entry.id === target.id);
            if (ship.surrendered) {
                // A surrendered pilot is captured on scan: this pays the bounty
                // and completes the warrant (claimSurrendered toasts) instead of
                // the generic scan toast. A beaten civilian has no bounty and
                // just reads as surrendered.
                if (!this.claimSurrendered(ship))
                    this.ui.showToast(`Scan: ${ship.name} · SURRENDERED · no bounty.`, 'info', 4200);
            }
            else if (this.deferentialPilot(ship)) {
                // A pilot the player spared may pay the debt: the first scan
                // rolls a favor (wreck tip or market contact, see givePilotFavor)
                // instead of the generic scan toast; later scans read as
                // previously spared and never re-roll. Wary pilots (escaped
                // once) get no favor — they never felt spared.
                const favor = !ship.favorGiven && this.givePilotFavor(ship);
                ship.favorGiven = true;
                if (!favor)
                    this.ui.showToast(`Scan: ${SPARED_MARK} ${ship.name} · PREVIOUSLY SPARED.`, 'info', 4200);
            }
            else {
                // The pilot profile rides along with the scan so a name, its tier,
                // and its temperament are all readable before the fight starts.
                // Recognizing ships carry the marker too — a wary pilot who
                // escaped still remembers the player, and the HOSTILE tag
                // explains the disposition.
                const pilot = ship.pilot;
                const profile = pilot ? ` · ${TIER_LABELS[pilot.tier] ?? pilot.tier} ${TEMPERAMENT_LABELS[pilot.temperament] ?? pilot.temperament}` : '';
                const mark = ship.recognizesPlayer ? `${SPARED_MARK} ` : '';
                this.ui.showToast(`Scan: ${mark}${ship.name} · ${ship.role.toUpperCase()} · ${ship.hostile ? 'HOSTILE' : 'NO ACTIVE WARRANT'}${profile}.`, ship.hostile ? 'danger' : 'info', 4200);
            }
        }
        this.scanCooldown = 0.55;
        this.audio.play('scan');
        this.renderer.setTarget(target.kind === 'ship' ? target.id : undefined, target.kind === 'asteroid' ? target.id : undefined, target.kind === 'wreck' ? target.id : undefined);
    }
    cycleTarget() {
        const candidates = this.targetCandidates();
        if (!candidates.length) {
            this.clearTarget();
            this.ui.showToast('No targets in sensor range.', 'info');
            return;
        }
        let currentIndex = candidates.findIndex((entry) => entry.id === this.save.player.currentTargetId);
        // A ship that just surrendered drops out of the hostile tier, so the next
        // press restarts selection at the top of the hierarchy (closest remaining
        // threat) instead of stepping into the non-hostile contact list.
        if (this.ships.some((entry) => entry.id === this.save.player.currentTargetId && entry.surrendered))
            currentIndex = -1;
        const next = candidates[(currentIndex + 1) % candidates.length];
        // Mode follows the selected target so the touch pads and radar filters match.
        if (next.kind === 'ship')
            this.save.player.mode = 'combat';
        else if (next.kind === 'asteroid')
            this.save.player.mode = 'mining';
        else if (next.kind === 'wreck')
            this.save.player.mode = 'salvage';
        // Selecting a POI as a target also sets it as the hyperdrive nav point.
        if (next.kind === 'location') {
            this.save.player.navTargetId = next.id;
            this.autopilot = false;
        }
        this.applyTarget(next);
    }
    targetNearestHostile() {
        const player = vec(this.save.player.position);
        const sensorRange = getEffectiveShipStats(this.save.player).radarRange * 2.4;
        const nearest = this.ships
            .filter((entry) => entry.hostile && entry.hull > 0 && player.distanceTo(vec(entry.position)) <= sensorRange)
            .sort((a, b) => player.distanceToSquared(vec(a.position)) - player.distanceToSquared(vec(b.position)))[0];
        if (!nearest) {
            this.ui.showToast('No hostile contact in sensor range.', 'info');
            return;
        }
        this.save.player.mode = 'combat';
        this.applyTarget({ kind: 'ship', id: nearest.id, position: nearest.position, name: nearest.name });
    }
    // When a fresh hostile spawns in while the pilot already has a lock, restart
    // target selection at the top of the hierarchy: the closest hostile takes
    // the reticle (tier 1 beats mission goals and other contacts). No-op with
    // no current lock or no hostile in sensor range.
    threatAcquireTarget() {
        if (!this.save.player.currentTargetId)
            return;
        const player = vec(this.save.player.position);
        const sensor = getEffectiveShipStats(this.save.player).radarRange * 2.2;
        const nearest = this.ships
            .filter((entry) => entry.hostile && entry.hull > 0 && player.distanceTo(vec(entry.position)) < sensor)
            .sort((a, b) => player.distanceToSquared(vec(a.position)) - player.distanceToSquared(vec(b.position)))[0];
        if (!nearest || nearest.id === this.save.player.currentTargetId)
            return;
        this.save.player.mode = 'combat';
        this.applyTarget({ kind: 'ship', id: nearest.id, position: nearest.position, name: nearest.name });
    }
    targetCandidates() {
        const player = vec(this.save.player.position);
        const orientation = quat(this.save.player.rotation);
        const forward = FORWARD.clone().applyQuaternion(orientation);
        const stats = getEffectiveShipStats(this.save.player);
        const inRange = (position) => player.distanceTo(vec(position)) < stats.radarRange * 2.2;
        const byDistance = (a, b) => player.distanceToSquared(vec(a.position)) - player.distanceToSquared(vec(b.position));
        // Tier 1 — opponents: hostile ships in sensor range, closest first.
        const opponents = this.ships
            .filter((entry) => entry.hostile && entry.hull > 0 && inRange(entry.position))
            .sort(byDistance)
            .map((entry) => ({ kind: 'ship', id: entry.id, position: entry.position, name: entry.name }));
        // Tier 2 — mission goals: the thing each active contract points at (the
        // warrant target ship, or the destination POI to fly to).
        const goals = [];
        for (const mission of this.save.activeMissions) {
            if (mission.kind === 'bounty') {
                const target = this.ships.find((entry) => entry.missionId === mission.id && entry.hull > 0);
                // Warrant ships are still ships: they follow the radar-range
                // target rule. Only POIs stay selectable at any distance.
                if (target && inRange(target.position))
                    goals.push({ kind: 'ship', id: target.id, position: target.position, name: target.name });
                // Before the warrant ship is spawned, the goal is the POI to
                // fly to — so target cycling still points you somewhere.
                else if (mission.targetZone && Object.prototype.hasOwnProperty.call(LOCATIONS, mission.targetZone)) {
                    const location = LOCATIONS[mission.targetZone];
                    goals.push({ kind: 'location', id: mission.targetZone, position: location.position, name: location.name });
                }
            }
            else if (mission.destination && Object.prototype.hasOwnProperty.call(LOCATIONS, mission.destination)) {
                const location = LOCATIONS[mission.destination];
                goals.push({ kind: 'location', id: mission.destination, position: location.position, name: location.name });
            }
        }
        // Tier 3 — everything else: traffic, deposits, wrecks, and POIs, scored
        // by how close they sit to the nose.
        const score = (position) => {
            const direction = vec(position).sub(player);
            const distance = direction.length();
            const angle = forward.angleTo(direction.normalize());
            return angle * 110 + distance * 0.12;
        };
        const others = [];
        for (const entry of this.ships)
            if (!entry.hostile && entry.hull > 0 && inRange(entry.position))
                others.push({ kind: 'ship', id: entry.id, position: entry.position, name: entry.name });
        if (this.activeInstanceId === 'shardbelt') {
            for (const node of this.asteroids)
                if (node.remaining > 0 && player.distanceTo(vec(node.position)) - asteroidCollisionRadius(node) < stats.radarRange)
                    others.push({ kind: 'asteroid', id: node.id, position: node.position, name: node.tunnelPart ? 'Rock Crown Deposit' : 'Asteroid Deposit' });
        }
        if (this.activeInstanceId === 'mourning-line') {
            for (const node of this.wreckNodes)
                if (node.remaining > 0 && player.distanceTo(vec(node.position)) - node.radius < stats.radarRange)
                    others.push({ kind: 'wreck', id: node.id, position: node.position, name: node.name });
        }
        for (const id of NAV_LOCATION_IDS) {
            if (goals.some((goal) => goal.id === id))
                continue;
            const location = LOCATIONS[id];
            others.push({ kind: 'location', id, position: location.position, name: location.name });
        }
        others.sort((a, b) => score(a.position) - score(b.position));
        return [...opponents, ...goals, ...others];
    }
    selectTarget(kind, id) {
        let target;
        if (kind === 'location') {
            if (!Object.prototype.hasOwnProperty.call(LOCATIONS, id))
                return;
            const locationId = id;
            const location = LOCATIONS[locationId];
            this.save.player.navTargetId = locationId;
            this.autopilot = false;
            target = { kind, id: locationId, position: location.position, name: location.name };
        }
        else if (kind === 'ship') {
            const ship = this.ships.find((entry) => entry.id === id && entry.hull > 0);
            if (ship) {
                this.save.player.mode = 'combat';
                target = { kind, id, position: ship.position, name: ship.name };
            }
        }
        else if (kind === 'asteroid') {
            const node = this.asteroids.find((entry) => entry.id === id && entry.remaining > 0);
            if (node && this.activeInstanceId === 'shardbelt') {
                this.save.player.mode = 'mining';
                target = { kind, id, position: node.position, name: node.tunnelPart ? 'Rock Crown Deposit' : 'Asteroid Deposit' };
            }
        }
        else {
            const node = this.wreckNodes.find((entry) => entry.id === id && entry.remaining > 0);
            if (node && this.activeInstanceId === 'mourning-line') {
                this.save.player.mode = 'salvage';
                target = { kind, id, position: node.position, name: node.name };
            }
        }
        if (!target) {
            this.ui.showToast('Target is no longer available.', 'warning');
            return;
        }
        this.applyTarget(target);
        // Deposits resolve automatically on the next sim step via autoScanDeposit,
        // so selection needs no manual scan gate here.
    }
    applyTarget(target) {
        this.save.player.currentTargetId = target.id;
        this.renderer.setTarget(target.kind === 'ship' ? target.id : undefined, target.kind === 'asteroid' ? target.id : undefined, target.kind === 'wreck' ? target.id : undefined, target.kind === 'location' ? target.id : undefined);
        // No selection pop-up: the target monitor already shows the lock, and
        // the distance readout lives in its heading (below the label row).
        this.audio.play('ui');
    }
    clearTarget() {
        this.save.player.currentTargetId = undefined;
        this.renderer.setTarget();
    }
    getTargetRef(clearInvalid = true) {
        const id = this.save.player.currentTargetId;
        if (!id)
            return undefined;
        if (Object.prototype.hasOwnProperty.call(LOCATIONS, id)) {
            const locationId = id;
            const location = LOCATIONS[locationId];
            return { kind: 'location', id: locationId, position: location.position, name: location.name };
        }
        const ship = this.ships.find((entry) => entry.id === id && entry.hull > 0);
        if (ship)
            return { kind: 'ship', id, position: ship.position, name: ship.name };
        const asteroid = this.asteroids.find((entry) => entry.id === id && entry.remaining > 0);
        if (asteroid && (!clearInvalid || this.activeInstanceId === 'shardbelt')) {
            return { kind: 'asteroid', id, position: asteroid.position, name: asteroid.tunnelPart ? 'Rock Crown Deposit' : 'Asteroid Deposit' };
        }
        const wreck = this.wreckNodes.find((entry) => entry.id === id && entry.remaining > 0);
        if (wreck && (!clearInvalid || this.activeInstanceId === 'mourning-line'))
            return { kind: 'wreck', id, position: wreck.position, name: wreck.name };
        if (clearInvalid)
            this.clearTarget();
        return undefined;
    }
    toggleHyperdrive() {
        if (this.autopilot) {
            this.autopilot = false;
            this.hyperdriveEncounterAt = null;
            this.hyperdriveFx = 'drop';
            this.hyperdriveFxUntil = this.save.world.time + HYPERDRIVE_FX_DURATION;
            this.snapToCombatSpeed();
            this.save.player.throttle = clamp(this.hyperdriveReturnThrottle, 0, 1);
            this.ui.showToast('Hyperdrive disengaged.', 'info');
            return;
        }
        const block = this.hyperdriveBlockReason();
        if (block) {
            this.ui.showToast(block.message, block.kind, block.duration);
            if (block.kind !== 'info')
                this.audio.play('warning');
            return;
        }
        const player = vec(this.save.player.position);
        const nav = LOCATIONS[this.save.player.navTargetId];
        this.hyperdriveReturnThrottle = this.save.player.throttle;
        this.autopilot = true;
        this.hyperdriveFx = 'spooling';
        this.hyperdriveSpoolStartedAt = this.save.world.time;
        // Each jump rolls its own encounter chance based on the destination sector's
        // danger. An encounter already in progress nearby keeps the jump clean.
        const hostileInSector = this.ships.some((ship) => ship.hostile && ship.hull > 0 && player.distanceTo(vec(ship.position)) < ENCOUNTER_LOCK_RADIUS);
        const rng = seededRandom(`${this.save.world.seed}:jump:${++this.jumpCounter}:${Math.floor(this.save.world.time)}`);
        if (!hostileInSector && rng() < sectorEncounterChance(nav.id) * this.combatEncounterScale()) {
            const travelSeconds = HYPERDRIVE_SPOOL_SECONDS + player.distanceTo(vec(nav.position)) / HYPERDRIVE_CRUISE_SPEED;
            this.hyperdriveEncounterAt = this.save.world.time + travelSeconds * randomBetween(rng, 0.4, 0.75);
        }
        this.ui.showToast(`Hyperdrive vector set: ${nav.name}.`, 'success');
        this.audio.play('ui');
    }
    // Why a jump cannot start right now (null = clear). Shared by the toggle
    // (toast hints on press) and the HUD model (identity-card ready glow), so
    // the button light and the press feedback can never drift apart.
    hyperdriveBlockReason() {
        const player = vec(this.save.player.position);
        if (this.hostilesNear(player, HYPERDRIVE_THREAT_RADIUS))
            return { message: 'Hyperdrive unavailable while an enemy is close.', kind: 'danger' };
        const nav = LOCATIONS[this.save.player.navTargetId];
        const arrivalRadius = hyperdriveArrivalRadius(nav);
        if (player.distanceTo(vec(nav.position)) < arrivalRadius + 12)
            return { message: 'Already inside the selected nav drop zone.', kind: 'info' };
        const toNav = vec(nav.position).sub(player);
        const forward = FORWARD.clone().applyQuaternion(quat(this.save.player.rotation)).normalize();
        if (forward.dot(toNav.clone().normalize()) < HYPERDRIVE_ALIGNMENT)
            return { message: 'Hyperdrive requires a clear vector: align your ship with the nav point.', kind: 'warning', duration: 3800 };
        if (this.lineBlocked(player, vec(nav.position)))
            return { message: 'Hyperdrive path obstructed.', kind: 'danger' };
        return null;
    }
    hyperdriveFxState() {
        const now = this.save.world.time;
        if (this.hyperdriveFx === 'spooling') {
            if (!this.autopilot) {
                this.hyperdriveFx = 'none';
                return { fx: 'none', progress: 0 };
            }
            const progress = clamp((now - this.hyperdriveSpoolStartedAt) / HYPERDRIVE_SPOOL_SECONDS, 0, 1);
            if (progress >= 1) {
                this.hyperdriveFx = 'active';
                return { fx: 'active', progress: 1 };
            }
            return { fx: 'spooling', progress };
        }
        if (this.hyperdriveFx === 'drop' || this.hyperdriveFx === 'interrupt') {
            const duration = this.hyperdriveFx === 'interrupt' ? HYPERDRIVE_INTERRUPT_DURATION : HYPERDRIVE_FX_DURATION;
            if (now >= this.hyperdriveFxUntil) {
                this.hyperdriveFx = 'none';
                return { fx: 'none', progress: 0 };
            }
            return { fx: this.hyperdriveFx, progress: clamp((this.hyperdriveFxUntil - now) / duration, 0, 1) };
        }
        if (this.hyperdriveFx === 'active' && this.autopilot)
            return { fx: 'active', progress: 1 };
        return { fx: 'none', progress: 0 };
    }
    spawnHyperdriveIntercept() {
        const player = vec(this.save.player.position);
        const rng = seededRandom(`${this.save.world.seed}:intercept:${++this.interceptCounter}`);
        const count = rng() < 0.35 ? 2 : 1;
        for (let index = 0; index < count; index += 1) {
            const offset = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.5, rng() - 0.5).normalize().multiplyScalar(140 + rng() * 160);
            const pirate = this.spawnShip(index === 0 ? 'pirate' : 'escort', tuple(player.clone().add(offset)));
            pirate.targetId = 'player';
        }
        this.threatAcquireTarget();
        this.audio.play('warning');
    }
    snapToCombatSpeed() {
        const velocity = vec(this.save.player.velocity);
        const cap = getEffectiveShipStats(this.save.player).maxSpeed * 1.05;
        if (velocity.length() > cap)
            this.save.player.velocity = tuple(velocity.normalize().multiplyScalar(cap));
    }
    updateShips(dt) {
        const playerPosition = vec(this.save.player.position);
        for (const ship of this.ships) {
            if (ship.hull <= 0)
                continue;
            ship.lifetime += dt;
            ship.fireCooldown -= dt;
            ship.missileCooldown -= dt;
            ship.shieldDelay -= dt;
            if (ship.shieldDelay <= 0)
                ship.shield = Math.min(ship.maxShield, ship.shield + dt * 3.8);
        const target = this.resolveShipTarget(ship);
        const deferring = this.deferentialPilot(ship);
        // A deferential pilot never re-engages: even if an encounter spawner
        // forced a target, clear it and drift off — no combat AI, no "engaged"
        // chatter. Wary pilots (escaped once) stay hostile and fight normally.
        if (target && !deferring)
            this.updateAttackAI(ship, target.position, target.velocity, dt);
        else {
            if (deferring)
                ship.targetId = undefined;
            this.updateTravelAI(ship, dt);
        }
        const position = vec(ship.position);
        // Priority order for the one-voice slot: the one-shot recognition
        // line lands first (a wary re-encounter shouldn't lose it to generic
        // combat chatter), then the proximity mutter, then the timed lines.
        this.maybeRecognitionLine(ship, position, playerPosition);
        this.maybeProximityLine(ship, position, playerPosition);
        this.maybePilotLine(ship, position, playerPosition);
        if (position.distanceTo(playerPosition) > 950 && ship.lifetime > 40 && !ship.missionId)
            ship.hull = -1;
        }
    }
    // The comms surfaces color each line by the speaker's relation to the
    // player: hostiles red, allies blue, neutral white. Hostile is the flag
    // itself; an unhostile patrol with a non-player target is actively
    // fighting on our side (wingman, friendly patrol) and reads as an ally.
    shipRelation(ship) {
        return ship.hostile ? 'hostile' : ship.role === 'patrol' && ship.targetId && ship.targetId !== 'player' ? 'ally' : 'neutral';
    }
    // A pilot who recognizes the player and was captured (not escaped) defers:
    // non-hostile, never re-engages, offers favors. Escaped pilots come back
    // wary instead — hostile and jumpy — so most gates key on this predicate.
    deferentialPilot(ship) {
        return ship.recognizesPlayer && !ship.waryOfPlayer;
    }
    // One voice at a time: a pilot line may only land when no story mute is
    // up and the previous line has had its full read time (CHATTER_GAP).
    // Every chatter emitter gates on this, so a 3v1 streams one readable
    // line at a time instead of a wall of overlapping callsigns.
    chatterOpen() {
        return !this.storyLineActive() && this.save.world.time >= (this.nextChatterAt ?? 0);
    }
    // The single path every pilot line lands through: stamps the global gap,
    // then shows the line with the speaker's relation color and chirp.
    sayPilotLine(ship, line, relation = this.shipRelation(ship)) {
        this.nextChatterAt = this.save.world.time + CHATTER_GAP;
        this.ui.showPilotLine?.(ship.name, line, relation);
        this.audio?.playComms?.(ship.pilot.temperament);
    }
    playerLosing() {
        const stats = getEffectiveShipStats(this.save.player);
        return stats.hull > 0 && this.save.player.hull / stats.hull < 0.35;
    }
    // Whether the player's bounty rank is high enough to earn a name-drop, and
    // the actual title for the line.
    rankAware() {
        return (this.save.player.guildRank?.bounty ?? 0) >= 2;
    }
    rankTitle() {
        return GUILD_RANK_NAMES.bounty[this.save.player.guildRank?.bounty ?? 0];
    }
    // Valuable sealed load worth a callout: 'case' for the diplomatic case,
    // 'cargo' for other labeled contract goods, undefined for an empty or
    // mundane hold.
    cargoFlavor() {
        const labels = (this.save.player.sealedCargo ?? []).map((entry) => entry.label);
        if (labels.includes('sealed diplomatic case'))
            return 'case';
        return labels.some((label) => VALUABLE_CARGO_LABELS.includes(label)) ? 'cargo' : undefined;
    }
    // Pick a line from a pool with the ship's seeded RNG, stepping around the
    // previously used line so chatter rotates instead of repeating, and
    // remembering which one-shot situation lines have been said.
    pickPilotLine(ship, key, lines) {
        let index = Math.floor(ship.aiRng() * lines.length);
        const last = this.pilotLineHistory.get(ship.id);
        if (lines.length > 1 && last?.key === key && last.index === index)
            index = (index + 1) % lines.length;
        const said = new Set(last?.said ?? []);
        if (PILOT_ONESHOT_KEYS.has(key))
            said.add(key);
        this.pilotLineHistory.set(ship.id, { key, index, said });
        return lines[index];
    }
    storyLineActive() {
        return this.save.world.time < (this.storyLineUntil ?? 0);
    }
    // Story-mission entry point: pin a story transmission on the comms bar
    // and mute all chatter until the player dismisses it (or the duration
    // elapses). The mock story content proves the seam end-to-end; real
    // story missions call this with their own lines.
    playStoryLine(name, text, relation = 'neutral', duration = 12000) {
        this.storyLineUntil = this.save.world.time + duration;
        this.ui.showStoryLine?.(name, text, relation);
    }
    // Called every frame: lift the story mute when the player dismissed the
    // bar or the duration elapsed, and unpin the bar.
    refreshStoryLine() {
        if (this.ui.storyDismissed || (this.storyLineUntil !== undefined && this.save.world.time >= this.storyLineUntil)) {
            this.storyLineUntil = undefined;
            this.ui.dismissStory?.();
            this.ui.storyDismissed = false;
        }
    }
    // Combat comms: temperament-driven chatter while engaged with the player.
    // Timid pilots cry for help when hurt or fleeing, aggressive pilots
    // threaten, flamboyant pilots showboat; steady pilots stay silent
    // professionals. Lines roll on a per-ship seeded timer, so the chatter is
    // deterministic like every other pilot roll.
    maybePilotLine(ship, position, playerPosition) {
        if (!this.chatterOpen())
            return;
        const pilot = ship.pilot;
        const pool = pilot ? PILOT_LINES[pilot.temperament] : undefined;
        if (!pool || !ship.hostile || playerPosition.distanceTo(position) > 550)
            return;
        const engaged = ship.targetId === 'player' || ship.fleeing;
        if (!engaged)
            return;
        const hullRatio = ship.maxHull > 0 ? ship.hull / ship.maxHull : 1;
        const said = this.pilotLineHistory.get(ship.id)?.said ?? new Set();
        const cargo = this.cargoFlavor();
        // Situation-aware pick: the pool follows the fight state, evaluated so
        // the most urgent read wins. Timid pilots only speak when things go
        // wrong (hurt, fleeing, or a nervous first line); the others talk
        // through the whole fight — first contact once, then one-shot lines
        // naming the player's bounty rank (when high) or valuable sealed
        // cargo, then threats/taunts, gloating when the player is falling
        // apart, desperate when their own hull is low.
        let key;
        if (pilot.temperament === 'timid') {
            if (ship.fleeing || hullRatio < 0.45)
                key = 'distress';
            else if (hullRatio < 0.7)
                key = 'pressed';
            else if (!said.has('contact') && pool.contact?.length)
                key = 'contact';
            else if (!said.has('rank') && this.rankAware() && pool.rank?.length)
                key = 'rank';
            else if (!said.has(cargo) && cargo && pool[cargo]?.length)
                key = cargo;
        }
        else if (hullRatio < 0.2 && pool.pressed?.length)
            key = 'pressed';
        else if (this.playerLosing() && pool.gloat?.length)
            key = 'gloat';
        else if (!said.has('contact') && pool.contact?.length)
            key = 'contact';
        else if (!said.has('rank') && this.rankAware() && pool.rank?.length)
            key = 'rank';
        else if (!said.has(cargo) && cargo && pool[cargo]?.length)
            key = cargo;
        else if (pool.threat?.length)
            key = 'threat';
        else if (pool.taunt?.length)
            key = 'taunt';
        const lines = key ? pool[key] : undefined;
        if (!lines?.length || this.save.world.time < (ship.nextLineAt ?? 0))
            return;
        ship.nextLineAt = this.save.world.time + 12 + ship.aiRng() * 12;
        const line = this.pickPilotLine(ship, key, lines);
        // Chatter goes to the top-center comms bar, not the toast stack —
        // several hostiles talking should never bury real alerts.
        this.sayPilotLine(ship, key === 'rank' ? line.replace('{rank}', this.rankTitle()) : line);
    }
    // Proximity mutter: a pilot says one thing when the player closes inside
    // PROXIMITY_RANGE — a reaction to being noticed, on top of the timed
    // combat chatter. Edge-triggered (fires when the player crosses into
    // range, not every frame) with a long cooldown, and rolled on its own
    // seeded stream so it never perturbs the combat rolls. Allies don't
    // mutter at you; steady pilots stay silent as always.
    maybeProximityLine(ship, position, playerPosition) {
        if (this.storyLineActive())
            return;
        // A surrendered pilot pleads once more when the player closes in — a
        // single follow-up to the surrender line, then silence. No proximity
        // mutter: a beaten ship has nothing to say but "please". Fires as
        // soon as the player is within range (no edge tracking), so the plea
        // lands even if the player was already beside the ship when it gave up.
        if (ship.surrendered) {
            if (!ship.saidSurrenderPlead && playerPosition.distanceTo(position) <= PROXIMITY_RANGE && this.chatterOpen()) {
                ship.saidSurrenderPlead = true;
                const pool = ship.pilot ? PILOT_LINES[ship.pilot.temperament]?.plead : undefined;
                if (pool?.length) {
                    const line = pool[Math.floor(ship.proxRng() * pool.length)];
                    this.sayPilotLine(ship, line);
                }
            }
            return;
        }
        if (!this.chatterOpen())
            return;
        // The edge is only tracked after a short spawn grace, so a ship that
        // spawns inside range still gets its mutter a beat later instead of
        // the flag eating the approach edge before it may speak.
        const tracking = this.save.world.time >= ship.spawnTime + 2;
        const within = tracking && playerPosition.distanceTo(position) <= PROXIMITY_RANGE;
        const pool = ship.pilot ? PILOT_LINES[ship.pilot.temperament] : undefined;
        if (within && !ship.nearPlayer && !this.deferentialPilot(ship) && pool?.proximity?.length && this.shipRelation(ship) !== 'ally'
            && this.save.world.time >= (ship.nextProximityAt ?? 0)) {
            ship.nextProximityAt = this.save.world.time + 25 + ship.proxRng() * 20;
            const line = pool.proximity[Math.floor(ship.proxRng() * pool.proximity.length)];
            this.sayPilotLine(ship, line);
        }
        ship.nearPlayer = within;
    }
    // A pilot the player has beaten before recognizes them on a later
    // encounter: one line when the player gets close, then silence. A captured
    // pilot defers (deference pool, never re-engages); one who escaped comes
    // back wary (wary pool, hostile and fighty). Fires once per ship, rolled
    // on the seeded aiRng like the rest of the chatter.
    maybeRecognitionLine(ship, position, playerPosition) {
        if (!this.chatterOpen() || ship.saidRecognition || !ship.recognizesPlayer)
            return;
        if (playerPosition.distanceTo(position) > PROXIMITY_RANGE)
            return;
        ship.saidRecognition = true;
        const pool = ship.pilot ? PILOT_LINES[ship.pilot.temperament]?.[this.deferentialPilot(ship) ? 'deference' : 'wary'] : undefined;
        if (!pool?.length)
            return;
        const line = pool[Math.floor(ship.aiRng() * pool.length)];
        this.sayPilotLine(ship, line);
    }
    // A pilot the player spared occasionally pays the debt when scanned: a tip
    // about a valuable wreck (flagged on the scanner, if any remain) or a
    // market contact (supply/demand nudged so the station actually honors the
    // tip). One roll per ship, on its own seeded stream — deterministic and
    // never touching the combat rolls.
    givePilotFavor(ship) {
        const rng = seededRandom(`${this.save.world.seed}:favor:${ship.id}`);
        if (rng() >= PILOT_FAVOR_CHANCE)
            return false;
        // Half the time the favor is a wreck tip; with no wrecks left it falls
        // back to a market contact so the favor always lands.
        const wreckTip = rng() < 0.5 && this.giveWreckTip(rng);
        return wreckTip || this.giveMarketTip(rng);
    }
    // Flag the best unscanned wreck on the scanner: the player learns exactly
    // which wreck off Mourning Line is worth the trip (the map reads the
    // scanned flag live, and the 3D marker pops on the next target sync).
    giveWreckTip(rng) {
        const unseen = (node) => node.remaining > 0 && !node.scanned;
        const rare = this.wreckNodes.filter((node) => unseen(node) && node.rarity === 'rare');
        const pool = rare.length ? rare : this.wreckNodes.filter((node) => unseen(node) && node.rarity === 'uncommon');
        if (!pool.length)
            return false;
        const node = pool[Math.floor(rng() * pool.length)];
        node.scanned = true;
        if (!this.save.world.scannedNodes.includes(node.id))
            this.save.world.scannedNodes.push(node.id);
        this.ui.showToast(`Tip: ${node.name} off Mourning Line is carrying ${COMMODITIES[node.salvage].name}. Flagged on your scanner.`, 'success', 6500);
        return true;
    }
    // A trade contact: nudge one station's supply/demand so the tip is real
    // (they pay more for something, or have something below market). The price
    // drifts back toward the location's baseline over the next few cycles.
    giveMarketTip(rng) {
        const favorites = ['medicine', 'electronics', 'machinery', 'luxuries', 'arms'];
        const locationId = DOCK_LOCATION_IDS[Math.floor(rng() * DOCK_LOCATION_IDS.length)];
        const commodityId = favorites[Math.floor(rng() * favorites.length)];
        const sellTip = rng() < 0.5;
        const item = this.save.world.market[locationId][commodityId];
        if (sellTip)
            item.demand += 15;
        else
            item.supply += 15;
        refreshAllPrices(this.save.world.market, this.save.world.seed, this.save.world.economyClock);
        this.ui.showToast(sellTip
            ? `Tip: my contact at ${LOCATIONS[locationId].name} pays top credit for ${COMMODITIES[commodityId].name}.`
            : `Tip: my contact at ${LOCATIONS[locationId].name} has ${COMMODITIES[commodityId].name} below market.`, 'success', 6500);
        return true;
    }
    // Taunt on a landed hit: ace-tier and flamboyant pilots like to talk while
    // they're winning, so a successful shot at the player feels personal. The
    // chance and cooldown roll on the ship's seeded aiRng (deterministic like
    // every other pilot roll) and the chirp announces the transmission. A
    // temperament with its own taunts (flamboyant) uses those; silent
    // temperaments borrow the ace pool when the tier earns the right to brag.
    maybeHitTaunt(attackerId) {
        if (!this.chatterOpen() || attackerId === 'player' || this.deathTimer > 0)
            return;
        const ship = this.ships.find((entry) => entry.id === attackerId && entry.hull > 0);
        const pilot = ship?.pilot;
        if (!pilot || (pilot.tier !== 'ace' && !pilot.flamboyance && pilot.temperament !== 'aggressive'))
            return;
        if (this.save.world.time < (ship.nextHitTauntAt ?? 0))
            return;
        // Who talks and how often: aces and flamboyants brag on nearly a third
        // of their volleys; aggressive pilots threaten with a smaller chance so
        // their lines land as exclamation points, not static.
        const chance = pilot.tier === 'ace' || pilot.flamboyance ? 0.35 : pilot.temperament === 'aggressive' ? 0.18 : 0;
        if (chance === 0 || ship.aiRng() >= chance)
            return;
        ship.nextHitTauntAt = this.save.world.time + 6 + ship.aiRng() * 8;
        // Talk is backed by action: an aggressive pilot who lands a hit presses
        // the next pass — tighter standoff and a shorter extend while the press
        // window lasts (see updateAttackAI), so the threat is followed by a
        // real closing run, not just words.
        if (pilot.temperament === 'aggressive')
            ship.pressingUntil = this.save.world.time + 5;
        // The line follows the moment: when the player is falling apart a
        // landed hit earns a gloat; otherwise temperament flavor first
        // (flamboyant taunts, aggressive threats), with silent temperaments
        // borrowing the ace pool when the tier earns the right to brag.
        const ownPool = PILOT_LINES[pilot.temperament];
        const gloatPool = this.playerLosing() ? (ownPool?.gloat ?? PILOT_LINES.ace.gloat) : undefined;
        const lines = gloatPool?.length ? gloatPool
            : ownPool?.taunt ?? ((pilot.tier === 'ace' || pilot.temperament === 'aggressive') ? (ownPool?.threat ?? PILOT_LINES.ace.taunt) : undefined);
        if (!lines?.length)
            return;
        const line = this.pickPilotLine(ship, 'hittaunt', lines);
        // Chatter goes to the comms bar like the timer lines — a landed shot is
        // just a sharper moment to speak up.
        this.sayPilotLine(ship, line);
    }
    resolveShipTarget(ship) {
        const playerPosition = vec(this.save.player.position);
        const distSqTo = (from, p) => {
            const dx = p[0] - from[0];
            const dy = p[1] - from[1];
            const dz = p[2] - from[2];
            return dx * dx + dy * dy + dz * dz;
        };
        if (!ship.surrendered && !this.deferentialPilot(ship) && (ship.role === 'pirate' || ship.role === 'bounty' || ship.role === 'escort' || ship.hostile) && !ship.targetId) {
            const victim = this.ships
                .filter((entry) => !entry.hostile && entry.hull > 0 && (entry.role === 'trader' || entry.role === 'miner'))
                .sort((a, b) => distSqTo(ship.position, a.position) - distSqTo(ship.position, b.position))[0];
            ship.targetId = victim && distSqTo(ship.position, victim.position) < 150 * 150 && distSqTo(ship.position, this.save.player.position) > 100 * 100 ? victim.id : 'player';
        }
        if (ship.role === 'patrol') {
            const hostile = this.ships
                .filter((entry) => entry.hostile && entry.hull > 0)
                .sort((a, b) => distSqTo(ship.position, a.position) - distSqTo(ship.position, b.position))[0];
            ship.targetId = hostile?.id;
        }
        if (!ship.targetId)
            return undefined;
        if (ship.targetId === 'player')
            return { position: playerPosition, velocity: vec(this.save.player.velocity) };
        const target = this.ships.find((entry) => entry.id === ship.targetId && entry.hull > 0);
        if (!target) {
            ship.targetId = undefined;
            return undefined;
        }
        return { position: vec(target.position), velocity: vec(target.velocity) };
    }
    updateAttackAI(ship, targetPosition, targetVelocity, dt) {
        const position = this.tmpA.set(ship.position[0], ship.position[1], ship.position[2]);
        const velocity = this.tmpB.set(ship.velocity[0], ship.velocity[1], ship.velocity[2]);
        const orientation = this.tmpQ.set(ship.rotation[0], ship.rotation[1], ship.rotation[2], ship.rotation[3]);
        const toTarget = this.tmpD.subVectors(targetPosition, position);
        const distance = toTarget.length();
        const direct = this.tmpE;
        if (distance > 0.001)
            direct.copy(toTarget).multiplyScalar(1 / distance);
        else
            direct.copy(FORWARD).applyQuaternion(orientation).normalize();
        // Deflection shooting: aim where the target will be when the bolt arrives.
        // Aim quality scales the lead factor: aces read the target's vector and
        // land on the future position, novices undershoot it (their bolts fall
        // behind a crossing target even before the jitter in fireNpcGun).
        const aim = ship.pilot?.aim ?? 0.72;
        // Exact intercept time for a constant-velocity target, solved in the
        // ship's frame: the bolt leaves at 150 relative to the ship, so the bolt
        // meets the target when |r + wt| = 150t (r = target offset, w = target
        // velocity minus the ship's own). The old distance/150 ignored the
        // shooter's motion, so chases and head-on passes whiffed by a wide
        // margin. Aim quality scales how much of that lead the pilot actually
        // applies: novices undershoot the future position, aces land on it.
        const leadFactor = 0.6 + aim * 0.4;
        const r = this.tmpI.copy(targetPosition).sub(position);
        const w = this.tmpJ.set(0, 0, 0);
        if (targetVelocity)
            w.copy(targetVelocity);
        w.sub(velocity);
        const rr = r.lengthSq();
        const rw = r.dot(w);
        const a = w.lengthSq() - 150 * 150;
        let intercept = Infinity;
        if (a !== 0) {
            const disc = rw * rw - a * rr;
            if (disc >= 0) {
                const s = Math.sqrt(disc);
                const candidates = [(-rw - s) / a, (-rw + s) / a].filter((t) => t > 0);
                if (candidates.length)
                    intercept = Math.min(...candidates);
            }
        }
        // No geometric solution (target outruns the bolt): fall back to the
        // closing speed along the sightline so the pilot still aims plausibly.
        if (!isFinite(intercept)) {
            const closing = 150 + velocity.dot(direct) - (targetVelocity ? targetVelocity.dot(direct) : 0);
            intercept = Math.max(0.2, distance / Math.max(60, closing));
        }
        const leadTime = Math.max(0.2, intercept * leadFactor);
        // Aim where the bolt actually goes: it leaves at 150 PLUS the ship's
        // own velocity, so the lead direction must compensate for the shooter's
        // motion — normalize(r + w·t) — not just point at the future position.
        // Pointing at the raw future spot lets lateral velocity drift every bolt
        // wide by v·t, which the intercept time alone cannot correct (the
        // direction is what carries the shooter's drift). Lead factor scales
        // both: aces compensate fully, novices undershoot the correction.
        const predicted = this.tmpF.copy(r).addScaledVector(w, leadTime);
        const lead = this.tmpG.copy(predicted).normalize();
        // Strafing-run state machine (Privateer jousting): approach on a firing line,
        // then blow past at full speed and extend before turning back for the next pass.
        // The pilot never decelerates into a point-blank hug and never circles flat.
        const passRange = ship.passRange ?? ATTACK_PASS_RANGE;
        const resetRange = ship.resetRange ?? ATTACK_RESET_RANGE;
        // Aggressive pilots back their threats with action: while the press
        // window from a landed-hit threat lasts, the next pass commits deeper
        // (tighter standoff, 0.65x pass range) and the extend is abbreviated
        // (0.6x reset range), so the ship turns back and closes again sooner.
        const pressing = ship.pilot?.temperament === 'aggressive' && this.save.world.time < (ship.pressingUntil ?? 0);
        const effectivePassRange = pressing ? passRange * 0.65 : passRange;
        const effectiveResetRange = pressing ? resetRange * 0.6 : resetRange;
        if (!ship.attackPhase)
            ship.attackPhase = 'approach';
        if (ship.attackPhase === 'approach' && distance < effectivePassRange)
            ship.attackPhase = 'extend';
        else if (ship.attackPhase === 'extend' && distance > effectiveResetRange)
            ship.attackPhase = 'approach';
        if (distance < ATTACK_SEPARATION)
            ship.attackPhase = 'extend';
        // A lateral basis for near-miss passes and evasive jinks.
        const lateral = this.tmpH.crossVectors(toTarget, UP);
        if (lateral.lengthSq() < 1e-4)
            lateral.set(1, 0, 0);
        lateral.normalize();
        const hullRatio = ship.maxHull > 0 ? ship.hull / ship.maxHull : 1;
        const shieldFraction = ship.maxShield > 0 ? ship.shield / ship.maxShield : 1;
        // Reflex gates reaction: after taking fire the pilot waits out their
        // latency window (novices flinch late, aces react almost instantly),
        // then stays evasive for a reflex-scaled duration.
        const evasive = this.save.world.time >= (ship.evasiveLatencyUntil ?? 0) && this.save.world.time < (ship.evasiveUntil ?? 0);
        // damageThresholdMul: timid flinches at higher hull damage, aggressive
        // shrugs it off (this also raises/lowers the cover duck point).
        const damaged = hullRatio < pilotMod(ship, 0.45, 'damageThresholdMul');
        // Post-damage evasion comes in bursts: ~1.5-2.5s of hard jinking and
        // spiraling, then a few seconds flying straight to re-engage. A pilot
        // that dodges forever never shoots back, and a crippled ship becomes
        // unfinishable — fights stall with everyone at partial hull. Under
        // active fire (evasive) the pilot stays in the burst the whole time;
        // the cycle only paces the damaged-state dodges.
        const damagedCycle = damaged && !evasive && !ship.fleeing && !ship.covering;
        if (damagedCycle && this.save.world.time >= (ship.evadeCycleUntil ?? 0)) {
            const resting = ship.evadePhase === 'rest';
            ship.evadePhase = resting ? 'burst' : 'rest';
            ship.evadeCycleUntil = this.save.world.time + (resting ? randomBetween(ship.aiRng, 1.2, 2) : randomBetween(ship.aiRng, 4, 6));
        }
        const evading = evasive || (damagedCycle && ship.evadePhase === 'burst');
        const currentSpeed = velocity.length();
        // Cover & recharge: a damaged ship with drained shields ducks behind a big
        // rock or wreck to let shields regenerate, then breaks out for another run.
        const wantsCover = !ship.fleeing && damaged && shieldFraction < pilotMod(ship, COVER_RECHARGE_SHIELD, 'coverShieldMul') && distance > 140;
        if (wantsCover && !ship.covering) {
            const cover = this.findCoverPoint(position, targetPosition);
            if (cover) {
                ship.covering = true;
                ship.coverPoint = [cover.x, cover.y, cover.z];
                ship.coverHoldSince = 0;
            }
        }
        else if (ship.covering && (!wantsCover || (ship.coverHoldSince && this.save.world.time - ship.coverHoldSince > pilotMod(ship, COVER_HOLD_MAX, 'coverHoldMul'))))
            ship.covering = false, ship.coverPoint = undefined, ship.coverHoldSince = 0;
        // While hurt or under fire, commit to brief lateral jinks that spoil the
        // player's lead without collapsing into a wild spiral. Flamboyant pilots
        // also jink while healthy (showboating). The strength is capped so a
        // dodge bends the heading without steering the ship sideways harder
        // than it flies forward. All rolls use the ship's seeded aiRng so
        // headless probes are deterministic.
        let jink = 0;
        const showboating = !evasive && !damaged && (ship.pilot?.flamboyance ?? 0) > 0 && !ship.fleeing && !ship.covering;
        if ((evading || showboating) && !ship.fleeing && !ship.covering) {
            if (this.save.world.time > (ship.jinkUntil ?? 0)) {
                const reflex = ship.pilot?.reflex ?? 0.78;
                const evasion = ship.pilot?.evasion ?? 0.82;
                const jinkMul = pilotMod(ship, 1, 'jinkMul');
                ship.jinkDuration = (0.55 + ship.aiRng() * 0.55) * (0.65 + reflex * 0.7) * jinkMul;
                ship.jinkUntil = this.save.world.time + ship.jinkDuration;
                ship.jinkSign = ship.aiRng() < 0.5 ? 1 : -1;
                ship.jinkStrength = Math.min(0.6, (0.3 + ship.aiRng() * 0.35) * (0.6 + evasion * 0.7) * jinkMul);
            }
            const jinkRemaining = Math.max(0, (ship.jinkUntil ?? 0) - this.save.world.time);
            const jinkDuration = ship.jinkDuration ?? 0.55;
            jink = (ship.jinkSign ?? 1) * (ship.jinkStrength ?? 0.45) * clamp(jinkRemaining / jinkDuration, 0, 1);
        }
        // Spiral evasion: under fire, the pilot sometimes commits to a corkscrew
        // (rotating perpendicular bias + matching roll) so the dodge works in
        // three dimensions. Gate rolls ~45% every few seconds while threatened
        // and then rests on a cooldown, so it reads as a natural combat reflex
        // rather than a permanent spin. The bias rotates slowly enough that the
        // nose can track it, and the roll is folded into the slerp target below
        // so the maneuver is one coordinated barrel roll, not a wobble.
        let spiraling = false;
        // Corkscrew gate: base 0.45, pushed by temperament (flamboyant showboats
        // at ~0.83, timid prefers cover at ~0.29). Reflex scales the cooldowns so
        // slow pilots commit less often; evasion scales duration. Healthy
        // flamboyant pilots roll a reduced showboating gate. Gated on the same
        // burst as jinks, so the corkscrew never outlasts the dodge window.
        if ((evading || showboating) && !ship.fleeing && !ship.covering) {
            if (!(ship.spiralT > 0) && this.save.world.time >= (ship.spiralCooldownUntil ?? 0)) {
                const gate = pilotMod(ship, 0.45, 'spiralMul') * (showboating ? 0.45 : 1);
                const reflex = ship.pilot?.reflex ?? 0.78;
                const evasion = ship.pilot?.evasion ?? 0.82;
                if (ship.aiRng() < gate) {
                    ship.spiralT = (0.9 + ship.aiRng() * 0.9) * (0.7 + evasion * 0.5) * (ship.pilot?.flamboyance ? 1.4 : 1);
                    ship.spiralSign = ship.aiRng() < 0.5 ? 1 : -1;
                    ship.spiralPhase = 0;
                    ship.spiralCooldownUntil = this.save.world.time + (5 + ship.aiRng() * 5) * (1.6 - reflex * 0.7);
                }
                else {
                    ship.spiralCooldownUntil = this.save.world.time + (2 + ship.aiRng() * 3) * (1.6 - reflex * 0.7);
                }
            }
            if (ship.spiralT > 0) {
                ship.spiralT = Math.max(0, ship.spiralT - dt);
                spiraling = true;
            }
        }
        const desired = this.tmpI;
        if (ship.covering && ship.coverPoint) {
            const cover = this.tmpJ.set(ship.coverPoint[0], ship.coverPoint[1], ship.coverPoint[2]);
            const toCover = this.tmpK.subVectors(cover, position);
            if (toCover.lengthSq() > COVER_ARRIVE_DIST * COVER_ARRIVE_DIST) {
                desired.copy(toCover).normalize();
            }
            else {
                if (!ship.coverHoldSince)
                    ship.coverHoldSince = this.save.world.time;
                desired.copy(direct);
            }
        }
        else if (ship.fleeing) {
            // Crippled and running: turn away from the target and burn for open
            // space, weaving lightly so a tail shot has to work for it.
            desired.copy(direct).negate();
            desired.addScaledVector(lateral, (ship.jinkSign ?? 1) * 0.3).normalize();
        }
        else if (ship.attackPhase === 'extend') {
            // Keep flying the current heading (away from the target after the pass)
            // with a gentle pull-away so separation keeps growing.
            if (velocity.lengthSq() > 0.5)
                desired.copy(velocity).normalize();
            else
                desired.copy(direct).negate();
            desired.addScaledVector(direct, -0.22).normalize();
        }
        else {
            // Aim at a point beside the target so the pass is a near-miss rather
            // than a ram. The bias direction is chosen once per approach line so
            // the ship commits to one side and doesn't jitter.
            // Commit to a fixed side. Opposing jousters build their lateral
            // vector from opposite `toTarget` directions, so a constant sign
            // guarantees they always pass on opposite sides instead of grazing.
            if (ship.passBiasSign === undefined)
                ship.passBiasSign = 1;
            const standoff = Math.max(ATTACK_PASS_STANDOFF_FLOOR, Math.min(ATTACK_PASS_STANDOFF, distance * 0.5));
            // `predicted` is the lead vector relative to the ship (target offset +
            // target-relative velocity lead), so the near-miss aim direction is
            // already a direction from the ship — subtracting the ship's world
            // position here aimed the ship at a point far from the arena (in a
            // field arena that point is the system origin, so hostiles broke off
            // toward (0,0,0) and read as fleeing on spawn).
            desired.copy(predicted).addScaledVector(lateral, ship.passBiasSign * standoff).normalize();
        }
        desired.addScaledVector(lateral, jink);
        if (spiraling) {
            ship.spiralPhase = (ship.spiralPhase ?? 0) + dt * 3.2;
            const s = Math.sin(ship.spiralPhase) * 0.55;
            const c = Math.cos(ship.spiralPhase) * 0.45;
            const upV = this.tmpL.crossVectors(lateral, direct);
            if (upV.lengthSq() < 1e-6)
                upV.set(0, 1, 0);
            else
                upV.normalize();
            desired.addScaledVector(lateral, s * (ship.spiralSign ?? 1)).addScaledVector(upV, c * (ship.spiralSign ?? 1));
        }
        desired.add(this.getAvoidanceVector(position, desired, 40, currentSpeed));
        const shipAvoidance = this.getShipAvoidance(position, velocity, ship.id);
        if (shipAvoidance)
            desired.add(shipAvoidance);
        desired.normalize();
        // Smooth, no-roll turn toward the pursuit vector (this kills the old spin).
        const right = this.tmpJ.crossVectors(desired, UP);
        if (right.lengthSq() < 1e-6)
            right.set(1, 0, 0);
        right.normalize();
        const up = this.tmpK.crossVectors(right, desired).normalize();
        // A gentle bank into the horizontal turn: bake it into the target orientation
        // rather than adding an incremental roll each frame (which would accumulate).
        const headingChange = clamp(direct.angleTo(desired), 0, 1.2);
        this.tmpL.crossVectors(desired, direct);
        const turnSign = Math.sign(this.tmpL.y) || 1;
        const bankAngle = turnSign * headingChange * 0.45;
        const cosB = Math.cos(bankAngle);
        const sinB = Math.sin(bankAngle);
        this.tmpL.crossVectors(desired, right);
        const rightBanked = right.multiplyScalar(cosB).addScaledVector(this.tmpL, sinB);
        this.tmpL.crossVectors(desired, up);
        const upBanked = up.multiplyScalar(cosB).addScaledVector(this.tmpL, sinB);
        // Coordinated corkscrew roll: while spiraling, the target attitude rolls
        // around the flight axis at the same rate (and in the same sense) the nose
        // bias circles, so the dodge reads as a smooth barrel roll instead of a
        // wobble. The roll lives inside the slerp target, so the turn slerp below
        // carries it rather than fighting a per-frame post-roll. Guns stay forward.
        if (spiraling) {
            const rollAngle = (ship.spiralPhase ?? 0) * (ship.spiralSign ?? 1);
            const cosR = Math.cos(rollAngle);
            const sinR = Math.sin(rollAngle);
            // Stage the rotated right in tmpF (predicted is dead past the aim
            // point): the banked right/up must both be read pre-rotation.
            this.tmpF.copy(rightBanked).multiplyScalar(cosR).addScaledVector(upBanked, sinR);
            upBanked.multiplyScalar(cosR).addScaledVector(rightBanked, -sinR);
            this.tmpD.copy(desired).negate();
            this.tmpQ2.setFromRotationMatrix(this.tmpM4.makeBasis(this.tmpF, upBanked, this.tmpD));
        }
        else {
            this.tmpD.copy(desired).negate();
            this.tmpQ2.setFromRotationMatrix(this.tmpM4.makeBasis(rightBanked, upBanked, this.tmpD));
        }
        orientation.slerp(this.tmpQ2, 1 - Math.exp(-ship.turnRate * dt));
        orientation.normalize();
        // Fly where the nose points at a controlled speed. A scalar throttle damp
        // (rather than a vector lerp) means the nose can sweep a 180° yo-yo turn
        // without the velocity vector collapsing toward zero mid-turn.
        const forward = this.tmpC.copy(FORWARD).applyQuaternion(orientation).normalize();
        const corner = clamp(0.8 + 0.2 * Math.exp(-headingChange * 1.5), 0.66, 1);
        const fleeing = Boolean(ship.fleeing);
        const holdingCover = Boolean(ship.covering) && ship.coverPoint && this.tmpD.set(ship.coverPoint[0], ship.coverPoint[1], ship.coverPoint[2]).distanceTo(position) <= COVER_ARRIVE_DIST;
        // Afterburn: hostile fighters punch the throttle when the target sits on
        // their tail — a chase, an extension, or a rout — so they can outrun a
        // non-burning player and force a real pursuit instead of a free kill.
        const targetBehind = direct.dot(forward) < -0.25;
        // Aggressive pilots (afterburnMul > 1.2) burn afterburn in pursuit too,
        // not just when running or being chased.
        const burnInPursuit = (ship.pilot?.afterburnMul ?? 1) > 1.2 && ship.attackPhase === 'approach';
        ship.burning = Boolean(ship.afterburnSpeed) && !holdingCover && !ship.covering && (fleeing || targetBehind || burnInPursuit);
        const cruise = ship.burning ? ship.afterburnSpeed : ship.speed;
        // Brake only when a collision is truly imminent (rock dead ahead and close);
        // steering avoidance handles the rest so ships keep their combat speed.
        const aheadClear = this.aheadClearance(position, desired, 70);
        const brake = aheadClear < 30 ? clamp((30 - aheadClear) / 30, 0, 1) * 0.42 : 0;
        let desiredSpeed = cruise * (holdingCover ? 0.12 : ship.attackPhase === 'extend' || fleeing ? 1.02 : corner) * (evasive ? 1.08 : 1) * (fleeing ? 1.06 : 1) * (1 - brake);
        // Never crawl mid-fight: a hard combat-speed floor keeps the strafing-run
        // energy up even while braking to dodge a rock (cover holds are exempt).
        if (!holdingCover)
            desiredSpeed = Math.max(desiredSpeed, ship.speed * 0.52);
        const nextSpeed = damp(currentSpeed, desiredSpeed, evasive || fleeing || ship.burning ? 1.6 : 1.25, dt);
        velocity.copy(forward).multiplyScalar(nextSpeed);
        position.addScaledVector(velocity, dt);
        tupleInto(ship.position, position);
        tupleInto(ship.velocity, velocity);
        quatTupleInto(ship.rotation, orientation);
        const facing = forward.dot(lead);
        // Fire discipline: aces snap shots off as soon as the nose is on the
        // deflection point; novices need a tighter alignment (and still spray,
        // see fireNpcGun). Fire range is temperament-driven: timid only commits
        // at short range, aggressive hoses from way out.
        const fireGate = 0.85 + (1 - aim) * 0.1;
        const fireRange = pilotMod(ship, ATTACK_FIRE_RANGE, 'fireRangeMul');
        if (!fleeing && distance < fireRange && facing > fireGate && ship.fireCooldown <= 0 && !this.lineBlocked(position, predicted, ship.id)) {
            this.fireNpcGun(ship, lead);
        }
    }
    updateTravelAI(ship, dt) {
        ship.burning = false;
        const position = this.tmpA.set(ship.position[0], ship.position[1], ship.position[2]);
        const velocity = this.tmpB.set(ship.velocity[0], ship.velocity[1], ship.velocity[2]);
        if (ship.poweredDown) {
            // Surrendered and dark: bleed off velocity and drift. The ship no
            // longer navigates, attacks, or evades.
            velocity.multiplyScalar(Math.max(0, 1 - dt * 0.6));
            position.addScaledVector(velocity, dt);
            tupleInto(ship.position, position);
            tupleInto(ship.velocity, velocity);
            return;
        }
        const orientation = this.tmpQ.set(ship.rotation[0], ship.rotation[1], ship.rotation[2], ship.rotation[3]);
        let destination = ship.destination ? this.tmpD.set(ship.destination[0], ship.destination[1], ship.destination[2]) : undefined;
        if (!destination || position.distanceTo(destination) < 30) {
            const rng = seededRandom(`${this.save.world.seed}:route:${ship.id}:${Math.floor(ship.lifetime / 20)}`);
            if (ship.role === 'miner') {
                destination = this.tmpD.set(LOCATIONS.shardbelt.position[0] + randomBetween(rng, -110, 110), LOCATIONS.shardbelt.position[1] + randomBetween(rng, -55, 55), LOCATIONS.shardbelt.position[2] + randomBetween(rng, -110, 110));
            }
            else if (ship.role === 'patrol') {
                const angle = rng() * Math.PI * 2;
                destination = this.tmpD.set(LOCATIONS.rook.position[0] + Math.cos(angle) * 95, LOCATIONS.rook.position[1] + randomBetween(rng, -35, 35), LOCATIONS.rook.position[2] + Math.sin(angle) * 95);
            }
            else {
                const dock = pick(rng, DOCK_LOCATION_IDS);
                destination = this.tmpD.set(LOCATIONS[dock].position[0] + randomBetween(rng, -30, 30), LOCATIONS[dock].position[1] + randomBetween(rng, -20, 20), LOCATIONS[dock].position[2] + randomBetween(rng, -30, 30));
            }
            ship.destination = tuple(destination);
        }
        const desired = this.tmpI.subVectors(destination, position).normalize();
        desired.add(this.getAvoidanceVector(position, desired, 28));
        const shipAvoidance = this.getShipAvoidance(position, velocity, ship.id);
        if (shipAvoidance)
            desired.add(shipAvoidance);
        desired.normalize();
        this.tmpQ2.setFromUnitVectors(FORWARD, desired);
        orientation.slerp(this.tmpQ2, 1 - Math.exp(-ship.turnRate * 0.62 * dt));
        velocity.lerp(desired.multiplyScalar(ship.speed * (ship.role === 'trader' ? 0.72 : 0.5)), 1 - Math.exp(-0.55 * dt));
        position.addScaledVector(velocity, dt);
        tupleInto(ship.position, position);
        tupleInto(ship.velocity, velocity);
        quatTupleInto(ship.rotation, orientation);
    }
    fireNpcGun(ship, direction) {
        // Aim quality: the AI's nose already aims at the deflection point, so the
        // only thing keeping novices honest is angular jitter on the shot
        // direction — aces shoot where they aim. Jitter is seeded per ship.
        const aim = ship.pilot?.aim ?? 0.72;
        let aimDir = direction;
        if (aim < 0.99) {
            const spread = (1 - aim) * 0.09;
            const axis = this.tmpP3.crossVectors(direction, UP);
            if (axis.lengthSq() < 1e-6)
                axis.set(1, 0, 0);
            else
                axis.normalize();
            aimDir = this.tmpP4.copy(direction).applyAxisAngle(axis, (ship.aiRng() - 0.5) * 2 * spread).normalize();
        }
        const position = vec(ship.position).addScaledVector(aimDir, 2.4);
        const slot = this.projStore.alloc();
        this.projStore.setPos(slot, position.x, position.y, position.z);
        const shotVel = this.tmpP0.copy(aimDir).multiplyScalar(150).add(vec(ship.velocity));
        this.projStore.setVel(slot, shotVel.x, shotVel.y, shotVel.z);
        this.projectiles.push({
            id: `p-${++this.projectileCounter}`,
            kind: 'laser',
            ownerId: ship.id,
            slot,
            damage: ship.gunDamage,
            life: 1.55,
            targetId: ship.targetId,
            faction: ship.faction,
        });
        // Fire rate scales with aim: aces keep the trigger down, novices wait.
        ship.fireCooldown = (ship.role === 'bounty' ? 0.28 : ship.role === 'pirate' ? 0.38 : 0.46) * (1 + (1 - aim) * 0.7);
    }
    updateProjectiles(dt) {
        const playerPos = vec(this.save.player.position, this.tmpP3);
        for (const projectile of this.projectiles) {
            if (projectile.life <= 0)
                continue;
            projectile.life -= dt;
            const start = this.projStore.getPos(projectile.slot, this.tmpP0);
            const velocity = this.projStore.getVel(projectile.slot, this.tmpP1);
            if (projectile.kind === 'missile' && projectile.targetId) {
                let targetPosition;
                if (projectile.targetId === 'player') {
                    targetPosition = this.tmpP4.copy(playerPos);
                }
                else {
                    const targetShip = this.ships.find((entry) => entry.id === projectile.targetId && entry.hull > 0);
                    if (targetShip)
                        targetPosition = vec(targetShip.position, this.tmpP4);
                }
                if (targetPosition) {
                    const desired = targetPosition.sub(start).normalize().multiplyScalar(92);
                    velocity.lerp(desired, 1 - Math.exp(-2.8 * dt));
                    this.projStore.setVelV(projectile.slot, velocity);
                }
            }
            const end = this.tmpP2.copy(start).addScaledVector(velocity, dt);
            let bestT = 2;
            let hitKind;
            let hitShip;
            const obstacleHit = this.firstObstacleHit(start, end, projectile.ownerId);
            if (obstacleHit !== undefined && obstacleHit < bestT) {
                bestT = obstacleHit;
                hitKind = 'obstacle';
            }
            if (projectile.ownerId !== 'player') {
                const playerT = segmentSphereHit(start, end, playerPos, PLAYER_RADIUS + (projectile.kind === 'missile' ? 0.8 : 0.25));
                if (playerT !== undefined && playerT < bestT) {
                    bestT = playerT;
                    hitKind = 'player';
                }
            }
            for (const ship of this.ships) {
                if (ship.id === projectile.ownerId || ship.hull <= 0)
                    continue;
                if (projectile.ownerId !== 'player' && !this.projectileCanHitShip(projectile, ship))
                    continue;
                const radius = ship.role === 'trader' ? 3.8 : 2.4;
                const hit = segmentSphereHit(start, end, vec(ship.position, this.tmpP4), radius + (projectile.kind === 'missile' ? 0.8 : 0));
                if (hit !== undefined && hit < bestT) {
                    bestT = hit;
                    hitKind = 'ship';
                    hitShip = ship;
                }
            }
            if (hitKind) {
                const hitPosition = this.tmpP4.copy(start).lerp(end, bestT);
                projectile.life = 0;
                this.renderer.spawnImpact(tuple(hitPosition), projectile.kind === 'missile' ? 0xff7a42 : 0xffcb62);
                if (hitKind === 'player') {
                    this.damagePlayer(projectile.damage, projectile.kind === 'missile' ? 'missile strike' : 'weapons fire');
                    // A landed shot is a moment worth talking about: ace and
                    // flamboyant pilots get a seeded chance to rub it in.
                    this.maybeHitTaunt(projectile.ownerId);
                }
                else if (hitKind === 'ship' && hitShip)
                    this.damageShip(hitShip, projectile.damage, projectile.ownerId, tuple(hitPosition));
                if (projectile.kind === 'missile') {
                    this.renderer.spawnExplosion(tuple(hitPosition), projectile.faction === 'red-talons', 0.65);
                    this.audio.play('explosion', 0.7);
                }
                else
                    this.audio.play('impact', 0.35);
            }
            else {
                this.projStore.setPosV(projectile.slot, end);
            }
        }
    }
    projectileCanHitShip(projectile, ship) {
        if (projectile.targetId === ship.id)
            return true;
        if (projectile.faction === 'red-talons')
            return ship.faction !== 'red-talons';
        if (ship.faction === 'red-talons')
            return true;
        return false;
    }
    damageShip(ship, amount, attackerId, position) {
        let remaining = amount;
        if (ship.shield > 0) {
            const absorbed = Math.min(ship.shield, remaining);
            ship.shield -= absorbed;
            remaining -= absorbed;
        }
        if (remaining > 0 && ship.armor > 0) {
            const absorbed = Math.min(ship.armor, remaining * 0.82);
            ship.armor -= absorbed;
            remaining -= absorbed * 0.72;
        }
        if (remaining > 0)
            ship.hull -= remaining;
        const hullDamaged = remaining > 0;
        ship.shieldDelay = 4.5;
        if (attackerId === 'player' && ship.hull > 0 && !ship.poweredDown) {
            // Under fire: the pilot commits to evasion after their reaction
            // latency (reflex — novices flinch late, aces react fast) and stays
            // evasive for a reflex-scaled duration.
            const reflex = ship.pilot?.reflex ?? 0.78;
            ship.evasiveUntil = this.save.world.time + 2.5 * (0.6 + reflex * 0.5);
            ship.evasiveLatencyUntil = this.save.world.time + (1.2 - reflex) * 1.1;
            // Hull damage opens the surrender gate: instead of just running,
            // the pilot picks a surrender action (run, dump cargo or pay and
            // run, or power down). The gate is open from the first hull hit —
            // every hull hit rolls a personality-driven chance that climbs as
            // the hull degrades, so a timid pilot may give up at the first
            // scratch while an aggressive one fights on. fleeMul drives both
            // the starting odds and how fast they rise; a wary pilot who
            // escaped before gives up even sooner.
            const hullRatio = ship.maxHull > 0 ? ship.hull / ship.maxHull : 1;
            const stubborn = pilotMod(ship, 1, 'fleeMul');
            const chance = (0.04 + (1 - hullRatio) * 0.32) * stubborn * (ship.waryOfPlayer ? WARY_FLEE_MULTIPLIER : 1);
            if (hullDamaged && !ship.fleeing && !ship.surrendered && ship.aiRng() < chance)
                this.surrenderShip(ship);
            // Timid pilots call for help when the player lands a hit: a seeded
            // chance with its own cooldown, routed through the comms bar like
            // the rest of the chatter. At close range any hit is worth
            // crying about; out past DISTRESS_CLOSE_RANGE a hit has to actually
            // bite hull (the ship closed in, shields are down, the fight is
            // real) before it earns a MAYDAY — long-range potshots that only
            // graze shields stay quiet.
            const dx = ship.position[0] - this.save.player.position[0];
            const dy = ship.position[1] - this.save.player.position[1];
            const dz = ship.position[2] - this.save.player.position[2];
            const closeRange = dx * dx + dy * dy + dz * dz <= DISTRESS_CLOSE_RANGE * DISTRESS_CLOSE_RANGE;
            if (this.chatterOpen() && ship.pilot?.temperament === 'timid' && (hullDamaged || closeRange) && this.save.world.time >= (ship.nextDistressAt ?? 0) && ship.aiRng() < 0.3) {
                const distressPool = PILOT_LINES.timid.distress;
                if (distressPool?.length) {
                    ship.nextDistressAt = this.save.world.time + 6 + ship.aiRng() * 8;
                    const line = distressPool[Math.floor(ship.aiRng() * distressPool.length)];
                    this.sayPilotLine(ship, line);
                }
            }
        }
        // Accidental fire doesn't end a career: player hits on a non-hostile
        // ship accumulate (playerDamageTaken), and only crossing a real damage
        // threshold counts as a deliberate unauthorized attack — one stray
        // bolt earns a throttled warning, sustained fire escalates to the
        // hostile tag, rep loss, and a patrol alert. A surrendered ship never
        // re-enters the fight (finishing it still pays the bounty via the
        // faction check in destroyShip), and a recognizing pilot defending
        // itself is self-defense, so neither is penalized here.
        if (attackerId === 'player' && !ship.hostile && !ship.surrendered && !ship.recognizesPlayer) {
            ship.playerDamageTaken = (ship.playerDamageTaken ?? 0) + (amount - remaining);
            const threshold = Math.max(25, (ship.maxShield + ship.maxArmor + ship.maxHull) * 0.15);
            if (ship.playerDamageTaken < threshold) {
                if (this.save.world.time >= (ship.fireWarningAt ?? 0)) {
                    ship.fireWarningAt = this.save.world.time + 6;
                    this.ui.showToast(`Watch your fire — ${ship.role === 'patrol' ? 'patrol vessel' : 'civilian vessel'} hit!`, 'warning', 3600);
                }
            }
            else {
                ship.hostile = true;
                ship.targetId = 'player';
                this.save.player.reputation[ship.faction] = clamp(this.save.player.reputation[ship.faction] - (ship.role === 'patrol' ? 16 : 9), -100, 100);
                this.ui.showToast(`Unauthorized attack: ${FACTION_LABEL(ship.faction)} reputation damaged.`, 'danger', 4500);
                this.alertPatrols(ship.position);
            }
        }
        if (ship.hull <= 0)
            this.destroyShip(ship, attackerId, position);
    }
    // A beaten pilot gives up rather than fighting on. Every outcome ends the
    // fight: the ship stops counting as hostile (hyperdrive/landing unlock)
    // and turns orange on the HUD, with a fitting line per action. The action
    // follows the temperament weights, and cargo/credit dumps spawn pickups.
    surrenderShip(ship) {
        ship.surrendered = true;
        ship.hostile = false;
        ship.fleeing = false;
        ship.targetId = undefined;
        const weights = SURRENDER_WEIGHTS[ship.pilot?.temperament] ?? SURRENDER_WEIGHTS.steady;
        const entries = Object.entries(weights);
        const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
        let roll = ship.aiRng() * total;
        let action = entries[0][0];
        for (const [candidate, weight] of entries) {
            roll -= weight;
            if (roll < 0) {
                action = candidate;
                break;
            }
        }
        if (action === 'eject' || action === 'downEject')
            this.ejectCargo(ship);
        if (action === 'pay' || action === 'downPay')
            this.transferCredits(ship);
        if (action.startsWith('down'))
            ship.poweredDown = true;
        else
            ship.fleeing = true;
        // The pilot remembers the encounter: record the callsign and whether
        // they were captured in place (powered down) or got away (fled), so a
        // later spawn of the same name defers or comes back wary (see spawnShip
        // recognition).
        const surrenderedTo = this.save.world.surrenderedTo ?? (this.save.world.surrenderedTo = {});
        surrenderedTo[ship.name] = action.startsWith('down') ? 'captured' : 'fled';
        const pool = PILOT_LINES[ship.pilot?.temperament]?.surrender?.[action];
        if (pool?.length && this.chatterOpen()) {
            const line = pool[Math.floor(ship.aiRng() * pool.length)];
            this.sayPilotLine(ship, line);
        }
    }
    // Jettison the hold: a couple of salvage-grade pickups as the pilot runs,
    // drawn from the role's cargo pool (see SURRENDER_EJECT_POOLS) so the loot
    // reads like what the ship was actually carrying.
    ejectCargo(ship) {
        const rng = seededRandom(`${this.save.world.seed}:surrender-eject:${ship.id}`);
        const pool = SURRENDER_EJECT_POOLS[ship.role] ?? ['electronics', 'scrap'];
        const drops = 1 + Math.floor(rng() * 2);
        for (let index = 0; index < drops; index += 1)
            this.spawnPickup(pool[Math.floor(rng() * pool.length)], ship.position, 'combat', rng() > 0.9 ? 'uncommon' : 'common');
    }
    // Hand over the wallet: a credit pickup worth a slice of the bounty value.
    transferCredits(ship) {
        const amount = ship.bountyValue > 0 ? Math.round(ship.bountyValue * 0.6) : 60;
        this.spawnPickup('credits', ship.position, 'combat', 'common', amount);
    }
    // A surrendered pilot is captured, not exploded: claiming the ship (scan
    // it, or dock while it's still around) pays the defense bounty, completes
    // any active warrant into the registry, and counts the kill — the surrender
    // already ended the fight, so no explosion and no civilian-loss penalty.
    // Only ships worth a bounty are claimable; a civilian the player beat down
    // has no payoff and stays unclaimed.
    claimSurrendered(ship) {
        if (!ship.surrendered || ship.claimed || ship.hull <= 0 || !(ship.bountyValue > 0 || ship.missionId))
            return false;
        ship.claimed = true;
        this.save.player.stats.kills += 1;
        if (ship.bountyValue > 0) {
            const payment = ship.bountyValue;
            this.save.player.credits += payment;
            this.save.player.reputation.concord = clamp(this.save.player.reputation.concord + 1, -100, 100);
            this.ui.showToast(`Surrendered pilot captured. ${formatCredits(payment)} bounty credited.`, 'success', 4200);
        }
        if (ship.missionId) {
            const result = completeBountyMission(this.save, ship.missionId);
            if (result.ok)
                this.ui.showToast(result.message, 'success', 6500);
        }
        if (this.save.player.currentTargetId === ship.id)
            this.save.player.currentTargetId = undefined;
        // The captured ship leaves the scene like a destroyed one (cleanupEntities
        // removes hull 0 ships shortly after) but without the explosion.
        ship.hull = 0;
        return true;
    }
    destroyShip(ship, attackerId, position) {
        ship.hull = 0;
        this.renderer.spawnExplosion(ship.position, ship.hostile, ship.role === 'trader' ? 1.5 : 1);
        this.audio.play('explosion', 1.1);
        if (ship.hostile && attackerId === 'player') {
            // Just fought off a threat: calm the lanes for a while.
            this.lastCombatAt = this.save.world.time;
        }
        if (attackerId === 'player') {
            this.save.player.stats.kills += 1;
            if (ship.hostile || ship.faction === 'red-talons') {
                const payment = ship.bountyValue;
                this.save.player.credits += payment;
                this.save.player.reputation.concord = clamp(this.save.player.reputation.concord + 1, -100, 100);
                this.ui.showToast(`Hostile destroyed. ${formatCredits(payment)} defense bounty credited.`, 'success', 4200);
            }
            else {
                this.save.player.reputation[ship.faction] = clamp(this.save.player.reputation[ship.faction] - 18, -100, 100);
                this.ui.showToast('Civilian loss recorded. Faction standing severely reduced.', 'danger', 5200);
            }
            if (ship.missionId) {
                const result = completeBountyMission(this.save, ship.missionId);
                if (result.ok)
                    this.ui.showToast(result.message, 'success', 6500);
            }
        }
        const rng = seededRandom(`${this.save.world.seed}:combat-drop:${ship.id}`);
        if (rng() < 0.64)
            this.spawnPickup(rng() > 0.8 ? 'electronics' : 'scrap', position, 'combat', rng() > 0.88 ? 'uncommon' : 'common');
        if (this.save.player.currentTargetId === ship.id)
            this.save.player.currentTargetId = undefined;
    }
    damagePlayer(amount, source, feedback = true) {
        if (this.deathTimer > 0 || amount <= 0)
            return;
        let remaining = amount;
        if (this.save.player.shield > 0) {
            const absorbed = Math.min(this.save.player.shield, remaining);
            this.save.player.shield -= absorbed;
            remaining -= absorbed;
        }
        if (remaining > 0 && this.save.player.armor > 0) {
            const absorbed = Math.min(this.save.player.armor, remaining * 0.85);
            this.save.player.armor -= absorbed;
            remaining -= absorbed * 0.72;
        }
        if (remaining > 0)
            this.save.player.hull -= remaining;
        this.playerShieldDelay = 5.2;
        this.autopilot = false;
        this.snapToCombatSpeed();
        if (feedback && amount > 1.5) {
            this.audio.play('impact', clamp(amount / 18, 0.4, 1.4));
            if (navigator.vibrate && this.save.settings.vibration)
                navigator.vibrate(Math.min(90, 18 + amount * 2));
        }
        if (this.save.player.hull <= 0) {
            this.save.player.hull = 0;
            this.deathTimer = 2.1;
            this.renderer.spawnExplosion(this.save.player.position, false, 1.55);
            this.ui.showToast(`SHIP LOST: ${source}. Emergency beacon transmitting.`, 'danger', 6500);
            this.audio.play('explosion', 1.6);
        }
    }
    updateRegeneration(dt) {
        const stats = getEffectiveShipStats(this.save.player);
        if (this.playerShieldDelay <= 0)
            this.save.player.shield = Math.min(stats.shield, this.save.player.shield + dt * 5.3);
    }
    updateDeathDrift(dt) {
        const velocity = vec(this.save.player.velocity).multiplyScalar(Math.exp(-0.6 * dt));
        const position = vec(this.save.player.position).addScaledVector(velocity, dt);
        this.save.player.velocity = tuple(velocity);
        this.save.player.position = tuple(position);
        this.save.player.angularVelocity = [0.3, -0.22, 0.38];
    }
    recoverPlayer() {
        if (this.arena) {
            this.restartArena();
            return;
        }
        const loss = Math.min(this.save.player.credits, Math.max(500, Math.floor(this.save.player.credits * 0.15)));
        this.save.player.credits -= loss;
        for (const id of Object.keys(this.save.player.cargo)) {
            this.save.player.cargo[id] = Math.floor((this.save.player.cargo[id] ?? 0) * 0.35);
        }
        for (const mission of this.save.activeMissions) {
            mission.status = 'failed';
            this.save.world.failedMissionIds.push(mission.id);
        }
        this.save.activeMissions = [];
        this.save.player.sealedCargo = [];
        const dock = this.save.player.lastDockedAt;
        const location = LOCATIONS[dock];
        const stats = getEffectiveShipStats(this.save.player);
        this.save.player.position = [...location.position];
        this.save.player.velocity = [0, 0, 0];
        this.save.player.angularVelocity = [0, 0, 0];
        this.save.player.rotation = [0, 0, 0, 1];
        this.save.player.throttle = 0;
        this.save.player.shield = 0;
        this.save.player.armor = stats.armor * 0.35;
        this.save.player.hull = stats.hull * 0.35;
        this.save.player.fuel = stats.fuel * 0.35;
        this.save.player.missiles = 0;
        this.save.player.dockedAt = dock;
        this.renderer.setCockpitVisible(false);
        this.audio.setStationMode(true);
        this.ui.hideHud();
        this.ui.showDock(this.save, dock);
        this.ui.showToast(`Emergency tow complete. Recovery fee: ${formatCredits(loss)}.`, 'danger', 6500);
        saveGame(this.save);
    }
    updateBountySpawns() {
        const player = vec(this.save.player.position);
        for (const mission of this.save.activeMissions) {
            if (mission.kind !== 'bounty' || !mission.targetZone || !mission.targetName)
                continue;
            if (this.ships.some((entry) => entry.missionId === mission.id && entry.hull > 0))
                continue;
            const zone = LOCATIONS[mission.targetZone];
            // Trigger on the dock approach, not the body radius: for planets the
            // radius ring sits INSIDE the auto-dock zone, so a pilot flying in to
            // dock never crossed it and the warrant target never spawned.
            const approachRadius = zone.dockRadius ?? zone.radius;
            if (player.distanceTo(vec(zone.position)) > approachRadius + 190)
                continue;
            const rng = seededRandom(`${this.save.world.seed}:bounty:${mission.id}:${Math.floor(this.save.world.time / 60)}`);
            const offset = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.45, rng() - 0.5).normalize().multiplyScalar(randomBetween(rng, 128, 218));
            const spawnPosition = player.clone().add(offset);
            this.clearSpawnPosition(spawnPosition, zone);
            // Warrants pin a pilot profile at offer time, so a named ace keeps
            // the same skill and temperament across every spawn of that warrant
            // (and across reloads): the player learns the name, not the roll.
            // Legacy saves without a pinned profile fall back to a name-seeded
            // roll so the callsign is still stable.
            const pinnedPilot = mission.pilot ?? (mission.targetName ? rollPilot(seededRandom(`${mission.targetName}:pilot`), this.spawnThreat(spawnPosition, mission.id), 'red-talons') : undefined);
            const target = this.spawnShip('bounty', tuple(spawnPosition), mission.id, mission.targetName, pinnedPilot);
            target.targetId = 'player';
            if (this.save.player.guildRank.bounty >= 1 || mission.reward > 6500) {
                const escort = this.spawnShip('escort', tuple(vec(target.position).add(new THREE.Vector3(12, 7, -14))));
                escort.targetId = 'player';
            }
            this.threatAcquireTarget();
            this.ui.showToast(`Warrant target detected: ${mission.targetName}`, 'danger', 5600);
            this.audio.play('warning');
        }
    }
    updateDynamicEncounters() {
        // The combat simulator drives its own roster; ambient traffic stays out.
        if (this.arena)
            return;
        if (this.save.world.time < this.nextEncounterAt || this.ships.filter((entry) => entry.hull > 0).length > 13)
            return;
        // Jumps roll their own encounters; the ambient timer only applies to manual flight.
        if (this.autopilot)
            return;
        const player = vec(this.save.player.position);
        // Never stack a second pirate encounter on an active one (safe sectors require
        // this; it keeps every fight small everywhere).
        if (this.ships.some((ship) => ship.hostile && ship.hull > 0 && player.distanceTo(vec(ship.position)) < ENCOUNTER_LOCK_RADIUS)) {
            this.nextEncounterAt = this.save.world.time + 30;
            return;
        }
        if (DOCK_LOCATION_IDS.some((id) => player.distanceTo(vec(LOCATIONS[id].position)) < (LOCATIONS[id].dockRadius ?? 50) + 40)) {
            this.nextEncounterAt = this.save.world.time + 18;
            return;
        }
        const zone = this.getWorldZone(player);
        const rng = seededRandom(`${this.save.world.seed}:encounter:${++this.encounterCounter}:${Math.floor(this.save.world.time)}`);
        const roll = rng();
        // Recently fought off an encounter? Let the lanes cool down before the next event.
        if (roll >= this.combatEncounterScale()) {
            this.nextEncounterAt = this.save.world.time + 26;
            return;
        }
        const bucket = rng();
        if ((zone === 'asteroid-field' && bucket < 0.42) || (zone === 'graveyard' && bucket < 0.28) || (zone === 'open' && bucket < 0.22)) {
            const miner = this.spawnShip('miner', this.encounterPosition(rng, 180));
            miner.destination = tuple(vec(LOCATIONS.shardbelt.position).add(new THREE.Vector3(randomBetween(rng, -70, 70), randomBetween(rng, -35, 35), randomBetween(rng, -70, 70))));
            this.ui.showToast(zone === 'graveyard' ? 'Independent recovery crew on sensors.' : 'Miner traffic crossing the lane.', 'info');
        }
        else if (bucket < (zone === 'graveyard' ? 0.72 : zone === 'asteroid-field' ? 0.68 : 0.5)) {
            const trader = this.spawnShip('trader', this.encounterPosition(rng, 225));
            if (rng() < 0.55) {
                const pirate = this.spawnShip('pirate', this.encounterPosition(rng, 188));
                pirate.targetId = trader.id;
                this.ui.showToast('Distress traffic: pirates attacking a civilian vessel.', 'danger', 5200);
                this.audio.play('warning');
            }
            else {
                this.ui.showToast('Civilian trader entering local space.', 'info');
            }
        }
        else if (bucket < 0.78) {
            this.spawnShip('patrol', this.encounterPosition(rng, 218));
            this.ui.showToast('Concord patrol sweep detected.', 'info');
        }
        else {
            const count = randomInt(rng, 1, zone === 'graveyard' ? 3 : 2);
            for (let i = 0; i < count; i += 1) {
                const pirate = this.spawnShip(i === 0 ? 'pirate' : 'escort', this.encounterPosition(rng, 158 + i * 27));
                pirate.targetId = 'player';
            }
            this.ui.showToast('Pirate intercept. Weapons free.', 'danger', 4800);
            this.audio.play('warning');
        }
        this.threatAcquireTarget();
        this.nextEncounterAt = this.save.world.time + randomBetween(rng, 24, 44);
    }
    encounterPosition(rng, distance) {
        const player = vec(this.save.player.position);
        const orientation = quat(this.save.player.rotation);
        const forward = FORWARD.clone().applyQuaternion(orientation);
        const right = RIGHT.clone().applyQuaternion(orientation);
        const offset = forward.multiplyScalar(-distance * randomBetween(rng, 0.3, 1)).addScaledVector(right, randomBetween(rng, -distance, distance));
        offset.y += randomBetween(rng, -35, 35);
        if (offset.length() < distance * 0.75)
            offset.normalize().multiplyScalar(distance);
        const position = player.clone().add(offset);
        // Keep spawns clear of the huge planetary bodies and their landing zones.
        for (const id of DOCK_LOCATION_IDS)
            this.clearSpawnPosition(position, LOCATIONS[id]);
        return tuple(position);
    }
    clearSpawnPosition(position, location) {
        const clearance = spawnClearance(location);
        const center = vec(location.position);
        const offset = position.clone().sub(center);
        const distance = offset.length();
        if (distance >= clearance)
            return position;
        if (distance < 0.001)
            offset.set(1, 0, 0);
        offset.normalize().multiplyScalar(clearance);
        return position.copy(center).add(offset);
    }
    spawnInitialTraffic() {
        const rng = seededRandom(`${this.save.world.seed}:initial-traffic:${Math.floor(this.save.world.time / 60)}`);
        const dockId = this.save.player.dockedAt ?? this.save.player.lastDockedAt;
        const around = (location) => {
            const direction = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.5, rng() - 0.5).normalize();
            return tuple(vec(location.position).clone().addScaledVector(direction, spawnClearance(location) + randomBetween(rng, 60, 260)));
        };
        const trader = this.spawnShip('trader', around(LOCATIONS[dockId ?? 'helix']));
        trader.destination = LOCATIONS.azure.position;
        const patrol = this.spawnShip('patrol', around(LOCATIONS.rook));
        patrol.destination = LOCATIONS.helix.position;
        const miner = this.spawnShip('miner', around(LOCATIONS.shardbelt));
        miner.destination = LOCATIONS.shardbelt.position;
    }
    // How dangerous the surrounding fight is, 0..1. Feeds the pilot tier roll:
    // contract danger dominates (a fat warrant draws an ace), then the zone.
    spawnThreat(position, missionId) {
        if (missionId) {
            const mission = this.save.activeMissions.find((entry) => entry.id === missionId);
            if (mission?.kind === 'bounty') {
                const danger = mission.danger ?? 1.5;
                return clamp(0.35 + danger * 0.3, 0.2, 1);
            }
        }
        const zone = this.getWorldZone(position);
        if (zone === 'asteroid-field' || zone === 'graveyard')
            return 0.6;
        if (zone === 'near-location')
            return 0.35;
        return 0.45;
    }
    spawnShip(role, position, missionId, nameOverride, pilotOverride) {
        const index = ++this.entityCounter;
        const rng = seededRandom(`${this.save.world.seed}:ship:${index}:${Math.floor(this.save.world.time)}`);
        const faction = role === 'pirate' || role === 'bounty' || role === 'escort' ? 'red-talons' : role === 'patrol' ? 'concord' : role === 'miner' ? 'frontier-miners' : 'free-merchants';
        const hostile = faction === 'red-talons';
        // Every ship rolls a pilot at spawn (seeded, deterministic). The profile
        // is transient per-ship state — no save-schema change.
        const pilot = rollPilot(rng, this.spawnThreat(position, missionId), faction, pilotOverride);
        // Per-ship RNG for in-flight rolls (jinks, spirals, flee checks, shot
        // jitter): seeded like everything else so headless probes are exact.
        const aiRng = seededRandom(`${this.save.world.seed}:ai:${index}:${Math.floor(this.save.world.time)}`);
        // A separate seeded stream for the proximity mutter, so the ambient
        // line never perturbs the combat roll stream (headless probes stay
        // exact on the calibrated scenarios).
        const proxRng = seededRandom(`${this.save.world.seed}:prox:${index}:${Math.floor(this.save.world.time)}`);
        const maxShield = role === 'bounty' ? 105 : role === 'trader' ? 82 : role === 'patrol' ? 75 : role === 'miner' ? 50 : 58;
        const maxArmor = role === 'bounty' ? 105 : role === 'trader' ? 110 : role === 'patrol' ? 72 : role === 'miner' ? 76 : 62;
        const maxHull = role === 'bounty' ? 120 : role === 'trader' ? 145 : role === 'patrol' ? 90 : role === 'miner' ? 95 : 75;
        const direction = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.4, rng() - 0.5).normalize();
        const rotation = new THREE.Quaternion().setFromUnitVectors(FORWARD, direction);
        const shipName = nameOverride ?? (hostile ? proceduralCallsign(rng) : `${role === 'trader' ? 'MV' : role === 'patrol' ? 'CPV' : role === 'miner' ? 'Prospector' : 'Escort'} ${randomInt(rng, 12, 997)}`);
        // A pilot who surrendered to the player before remembers: when the same
        // callsign spawns again (outside an active warrant), it defers instead
        // of re-engaging — non-hostile, no combat target, and a one-shot line
        // when the player gets close (see maybeRecognitionLine). The memory
        // lives in the save (world.surrenderedTo) so it survives instance
        // resets and reloads.
        const prior = (this.save.world.surrenderedTo ?? {})[shipName];
        const recognizesPlayer = hostile && !missionId && prior !== undefined;
        // A pilot who fled after surrendering came back wary, not deferential:
        // hostile again, but they cut and run earlier than usual (see damageShip).
        const waryOfPlayer = recognizesPlayer && prior === 'fled';
        const isHostile = hostile && !(recognizesPlayer && !waryOfPlayer);
        const ship = {
            id: `ship-${index}`,
            name: shipName,
            role,
            faction,
            position: [...position],
            velocity: tuple(direction.multiplyScalar(randomBetween(rng, 4, 12))),
            rotation: quatTuple(rotation),
            shield: maxShield,
            maxShield,
            armor: maxArmor,
            maxArmor,
            hull: maxHull,
            maxHull,
            speed: role === 'bounty' ? 43 : role === 'pirate' || role === 'escort' ? 38 : role === 'patrol' ? 36 : role === 'trader' ? 27 : 24,
            afterburnSpeed: role === 'bounty' ? 64 : role === 'pirate' || role === 'escort' ? 57 : 0,
            turnRate: role === 'bounty' ? 1.55 : role === 'pirate' || role === 'escort' ? 1.35 : role === 'patrol' ? 1.1 : 0.72,
            gunDamage: role === 'bounty' ? 10 : role === 'pirate' ? 7.5 : role === 'escort' ? 6.5 : role === 'patrol' ? 7 : 4,
            hostile: isHostile,
            bountyValue: role === 'bounty' ? 900 : role === 'pirate' || role === 'escort' ? randomInt(rng, 170, 420) : 0,
            aiState: isHostile ? 'attack' : role === 'miner' ? 'mine' : role === 'patrol' ? 'patrol' : 'travel',
            fireCooldown: randomBetween(rng, 0.2, 0.8),
            missileCooldown: randomBetween(rng, 1, 3),
            shieldDelay: 0,
            evasiveUntil: 0,
            fleeing: false,
            jinkUntil: 0,
            jinkSign: 1,
            jinkStrength: 0.45,
            covering: false,
            coverPoint: undefined,
            coverHoldSince: 0,
            spawnTime: this.save.world.time,
            lifetime: 0,
            missionId,
            attackPhase: 'approach',
            // Pass/reset range come from the pilot's temperament (timid keeps
            // distance, aggressive presses in) on top of the per-ship variance.
            passRange: (48 + rng() * 20) * pilot.passRangeMul,
            resetRange: (170 + rng() * 50) * pilot.resetRangeMul,
            passPhase: rng() * Math.PI * 2,
            pilot,
            aiRng,
            proxRng,
            recognizesPlayer,
            waryOfPlayer,
            surrendered: false,
            claimed: false,
            poweredDown: false,
            saidRecognition: false,
            // Whether the pilot has already rolled (and possibly given) the
            // first-scan favor — one roll per ship, so re-scanning can't farm it.
            favorGiven: false,
            // Player-inflicted damage on a non-hostile ship, for the
            // accidental-fire escalation in damageShip.
            playerDamageTaken: 0,
            // Comms cadence: the first line lands a few seconds into a fight,
            // then every ~12-24s while engaged. The initial delay comes off the
            // spawn rng so it never perturbs the in-flight aiRng roll stream.
            nextLineAt: this.save.world.time + 2 + rng() * 5,
        };
        this.ships.push(ship);
        return ship;
    }
    alertPatrols(position) {
        for (const patrol of this.ships.filter((entry) => entry.role === 'patrol' && entry.hull > 0)) {
            if (vec(patrol.position).distanceTo(vec(position)) < 320) {
                patrol.hostile = true;
                patrol.targetId = 'player';
            }
        }
    }
    updateDiscovery() {
        if (this.arena)
            return;
        const player = vec(this.save.player.position);
        for (const id of NAV_LOCATION_IDS) {
            const location = LOCATIONS[id];
            const discoveryRadius = location.radius + (location.kind === 'planet' ? 160 : 120);
            if (player.distanceTo(vec(location.position)) <= discoveryRadius && !this.save.player.discovered.includes(id)) {
                this.save.player.discovered.push(id);
                this.ui.showToast(`NAV DISCOVERY: ${location.name}`, 'success', 4600);
                this.audio.play('success');
            }
        }
    }
    cleanupEntities() {
        for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
            if (this.projectiles[index].life <= 0) {
                this.projStore.free(this.projectiles[index].slot);
                this.projectiles.splice(index, 1);
            }
        }
        for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
            if (this.pickups[index].life <= 0) {
                this.pickupStore.free(this.pickups[index].slot);
                this.pickups.splice(index, 1);
            }
        }
        for (let index = this.ships.length - 1; index >= 0; index -= 1) {
            if (this.ships[index].hull < 0 || (this.ships[index].hull === 0 && this.ships[index].lifetime > 1.3))
                this.ships.splice(index, 1);
        }
    }
    getWorldZone(position = this.save.player.position) {
        // Accept both tuple arrays (ship spawns pass encounterPosition tuples)
        // and THREE.Vector3 (player paths) so spawnThreat never crashes on a
        // bare array when a jump/encounter spawns inside a field.
        const p = Array.isArray(position) ? vec(position) : position;
        if (this.activeInstanceId === 'shardbelt' && p.distanceTo(vec(LOCATIONS.shardbelt.position)) < LOCATIONS.shardbelt.radius)
            return 'asteroid-field';
        if (this.activeInstanceId === 'mourning-line' && p.distanceTo(vec(LOCATIONS['mourning-line'].position)) < LOCATIONS['mourning-line'].radius)
            return 'graveyard';
        const dockLocation = DOCK_LOCATION_IDS.find((id) => id === this.activeInstanceId);
        if (dockLocation && p.distanceTo(vec(LOCATIONS[dockLocation].position)) < (LOCATIONS[dockLocation].dockRadius ?? 60) + 50)
            return 'near-location';
        return 'open';
    }
    hostilesNear(position, radius) {
        return this.ships.some((ship) => ship.hostile && ship.hull > 0 && position.distanceTo(vec(ship.position)) < radius);
    }
    flightLoadScale() {
        const player = this.save.player;
        const capacity = cargoCapacity(player);
        if (capacity <= 0)
            return 1;
        return 1 - 0.24 * clamp(cargoMass(player) / capacity, 0, 1);
    }
    combatCalmFactor() {
        // Ramp from 0 right after a fight back to 1 over COMBAT_CALM_SECONDS.
        return clamp((this.save.world.time - this.lastCombatAt) / COMBAT_CALM_SECONDS, 0, 1);
    }
    combatEncounterScale() {
        return 0.3 + 0.7 * this.combatCalmFactor();
    }
    autoDockCheck() {
        if (this.save.player.dockedAt || this.deathTimer > 0)
            return;
        const candidate = this.dockCandidate();
        if (!candidate)
            return;
        const speed = vec(this.save.player.velocity).length();
        if (speed > AUTO_DOCK_SPEED)
            return;
        if (this.hostilesNear(vec(this.save.player.position), DOCK_SAFE_RADIUS))
            return;
        this.dockAt(candidate);
    }
    activeDockObstacle() {
        const dockLocation = DOCK_LOCATION_IDS.find((id) => id === this.activeInstanceId);
        if (!dockLocation)
            return undefined;
        const location = LOCATIONS[dockLocation];
        return {
            id: dockLocation,
            x: location.position[0],
            y: location.position[1],
            z: location.position[2],
            radius: location.radius,
            losRadius: location.kind === 'planet' ? location.radius + 60 : location.radius * 0.73,
            collisionRadius: this.locationCollisionRadius(location),
        };
    }
    activeFieldObstacles() {
        if (this.activeInstanceId === 'shardbelt')
            return this.asteroids.map((node) => {
                const radius = asteroidCollisionRadius(node);
                // Hard collision and avoidance use the visual bounding sphere, but
                // ray/LOS blocking uses the nominal radius: the bounding sphere is
                // inflated across the narrow axes of an elongated rock, which would
                // wrongly block a clearly-clear mining beam.
                return { id: node.id, x: node.position[0], y: node.position[1], z: node.position[2], radius, losRadius: node.radius * 0.9, collisionRadius: radius };
            });
        if (this.activeInstanceId === 'mourning-line') {
            return this.graveyard.map((piece) => {
                const [hx, hy, hz] = piece.halfExtents;
                const q = this.tmpQ.setFromEuler(this.tmpEuler.set(piece.rotation[0], piece.rotation[1], piece.rotation[2], 'XYZ'));
                // radius is the bounding sphere used for the spatial grid and
                // avoidance; hard collision uses the oriented box so a flat
                // panel blocks its face without an inflated sphere around it.
                return {
                    id: piece.id,
                    x: piece.position[0],
                    y: piece.position[1],
                    z: piece.position[2],
                    radius: Math.hypot(hx, hy, hz),
                    losRadius: piece.collisionRadius,
                    collisionRadius: Math.hypot(hx, hy, hz),
                    box: { hx, hy, hz, qx: q.x, qy: q.y, qz: q.z, qw: q.w },
                };
            });
        }
        return [];
    }
    locationCollisionRadius(location) {
        return location.kind === 'planet' ? location.radius + 55 : location.radius * 0.72;
    }
    // Distance reads for large bodies are measured to the collidable surface,
    // not the center: scanning, mining, salvage, and landing all care how far
    // the hull is from the rock/body, not from an abstract center point.
    targetSurfaceRadius(target) {
        if (!target)
            return 0;
        if (target.kind === 'asteroid') {
            const node = this.asteroids.find((entry) => entry.id === target.id);
            return node ? asteroidCollisionRadius(node) : 0;
        }
        if (target.kind === 'wreck') {
            const node = this.wreckNodes.find((entry) => entry.id === target.id);
            return node ? node.radius : 0;
        }
        if (target.kind === 'location') {
            const location = LOCATIONS[target.id];
            return location ? this.locationCollisionRadius(location) : 0;
        }
        return 0;
    }
    surfaceDistance(position, target) {
        if (!target)
            return 0;
        return Math.max(0, position.distanceTo(vec(target.position)) - this.targetSurfaceRadius(target));
    }
    ensureObstacleGrid() {
        // Drifting rocks and wreckage move slowly, so the grid is rebuilt at most
        // twice a second, or immediately after switching instances.
        if (this.obstacleGrid && this.obstacleGridInstance === this.activeInstanceId && this.save.world.time - this.obstacleGridBuiltAt < 0.5)
            return;
        const grid = new Map();
        const size = this.obstacleCellSize;
        for (const obstacle of this.activeFieldObstacles()) {
            const key = this.cellKey(Math.floor(obstacle.x / size), Math.floor(obstacle.y / size), Math.floor(obstacle.z / size));
            let bucket = grid.get(key);
            if (!bucket) {
                bucket = [];
                grid.set(key, bucket);
            }
            bucket.push(obstacle);
        }
        this.obstacleGrid = grid;
        this.obstacleGridInstance = this.activeInstanceId;
        this.obstacleGridBuiltAt = this.save.world.time;
    }
    cellKey(cx, cy, cz) {
        // Numeric key instead of a "x,y,z" string: the obstacle grid is queried
        // tens of thousands of times a second (every DDA cell checks its 26
        // neighbours), and the string version was the top GC/CPU cost in flight.
        // Cell coords stay within ±4096 (the playable system spans ~±1M units at
        // a 256-unit cell size), so 13 bits per axis pack losslessly into a double.
        return (cx + 4096) * 16777216 + (cy + 4096) * 4096 + (cz + 4096);
    }
    forEachObstacleInBox(minX, minY, minZ, maxX, maxY, maxZ, callback) {
        this.ensureObstacleGrid();
        if (this.obstacleGrid.size === 0)
            return;
        const size = this.obstacleCellSize;
        const cx0 = Math.floor(minX / size);
        const cy0 = Math.floor(minY / size);
        const cz0 = Math.floor(minZ / size);
        const cx1 = Math.floor(maxX / size);
        const cy1 = Math.floor(maxY / size);
        const cz1 = Math.floor(maxZ / size);
        for (let cx = cx0; cx <= cx1; cx += 1) {
            for (let cy = cy0; cy <= cy1; cy += 1) {
                for (let cz = cz0; cz <= cz1; cz += 1) {
                    const bucket = this.obstacleGrid.get(this.cellKey(cx, cy, cz));
                    if (!bucket)
                        continue;
                    for (const obstacle of bucket)
                        callback(obstacle);
                }
            }
        }
    }
    forEachObstacleAlongSegment(start, end, callback) {
        // Walk the grid along the segment instead of iterating its whole bounding
        // box. A hyperdrive vector can span a whole sector (~100k units), so the
        // box version touches tens of millions of cells and freezes the frame;
        // this DDA visits only the cells the ray actually crosses. Each visited
        // cell also checks its 26 neighbours so obstacles whose centre sits in an
        // adjacent cell but whose radius overlaps the ray are still caught.
        this.ensureObstacleGrid();
        if (this.obstacleGrid.size === 0)
            return;
        const size = this.obstacleCellSize;
        let cx = Math.floor(start.x / size);
        let cy = Math.floor(start.y / size);
        let cz = Math.floor(start.z / size);
        const ex = Math.floor(end.x / size);
        const ey = Math.floor(end.y / size);
        const ez = Math.floor(end.z / size);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dz = end.z - start.z;
        const stepX = dx >= 0 ? 1 : -1;
        const stepY = dy >= 0 ? 1 : -1;
        const stepZ = dz >= 0 ? 1 : -1;
        const tDeltaX = dx !== 0 ? Math.abs(size / dx) : Infinity;
        const tDeltaY = dy !== 0 ? Math.abs(size / dy) : Infinity;
        const tDeltaZ = dz !== 0 ? Math.abs(size / dz) : Infinity;
        let tMaxX = dx !== 0 ? ((stepX > 0 ? (cx + 1) * size : cx * size) - start.x) / dx : Infinity;
        let tMaxY = dy !== 0 ? ((stepY > 0 ? (cy + 1) * size : cy * size) - start.y) / dy : Infinity;
        let tMaxZ = dz !== 0 ? ((stepZ > 0 ? (cz + 1) * size : cz * size) - start.z) / dz : Infinity;
        const visit = (x, y, z) => {
            for (let ox = x - 1; ox <= x + 1; ox += 1) {
                for (let oy = y - 1; oy <= y + 1; oy += 1) {
                    for (let oz = z - 1; oz <= z + 1; oz += 1) {
                        const bucket = this.obstacleGrid.get(this.cellKey(ox, oy, oz));
                        if (bucket)
                            for (const obstacle of bucket)
                                callback(obstacle);
                    }
                }
            }
        };
        visit(cx, cy, cz);
        let guard = 0;
        while (cx !== ex || cy !== ey || cz !== ez) {
            if (++guard > 200000)
                break;
            if (tMaxX < tMaxY && tMaxX < tMaxZ) {
                cx += stepX;
                tMaxX += tDeltaX;
            }
            else if (tMaxY < tMaxZ) {
                cy += stepY;
                tMaxY += tDeltaY;
            }
            else {
                cz += stepZ;
                tMaxZ += tDeltaZ;
            }
            visit(cx, cy, cz);
        }
    }
    getShipAvoidance(position, velocity, shipId) {
        // Evasive turn away from any other ship (player included) that is closing
        // on a course whose closest approach is inside SHIP_AVOID_SEPARATION units.
        // Returns a steering vector scaled by urgency, or undefined if the lane is
        // clear. The turn is perpendicular to our heading (a bank, not a brake) and
        // biased away from the threat; dead-ahead threats fall back to the ship's
        // local right so two head-on jousters turn on opposite sides.
        let found = false;
        let bestUrgency = 0;
        const px = position.x;
        const py = position.y;
        const pz = position.z;
        const vx = velocity.x;
        const vy = velocity.y;
        const vz = velocity.z;
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
        const consider = (op, ov) => {
            const rx = op[0] - px;
            const ry = op[1] - py;
            const rz = op[2] - pz;
            const distSq = rx * rx + ry * ry + rz * rz;
            if (distSq >= SHIP_AVOID_RANGE * SHIP_AVOID_RANGE || distSq < 0.0001)
                return;
            const rvx = ov[0] - vx;
            const rvy = ov[1] - vy;
            const rvz = ov[2] - vz;
            const closing = rx * rvx + ry * rvy + rz * rvz;
            if (closing >= 0)
                return;
            const rvSq = rvx * rvx + rvy * rvy + rvz * rvz;
            const t = Math.min(-closing / Math.max(rvSq, 1e-4), SHIP_AVOID_HORIZON);
            const cax = rx + rvx * t;
            const cay = ry + rvy * t;
            const caz = rz + rvz * t;
            const ca = Math.sqrt(cax * cax + cay * cay + caz * caz);
            if (ca >= SHIP_AVOID_SEPARATION)
                return;
            const dist = Math.sqrt(distSq);
            const urgency = (1 - ca / SHIP_AVOID_SEPARATION) * (1 - t / SHIP_AVOID_HORIZON) * clamp(dist / SHIP_AVOID_RANGE, 0.35, 1);
            if (urgency <= bestUrgency)
                return;
            bestUrgency = urgency;
            const invDist = 1 / dist;
            const ax = rx * invDist;
            const ay = ry * invDist;
            const az = rz * invDist;
            const fx = speed > 1e-4 ? vx / speed : 0;
            const fy = speed > 1e-4 ? vy / speed : 0;
            const fz = speed > 1e-4 ? vz / speed : 0;
            const dot = ax * fx + ay * fy + az * fz;
            // Steer away from the threat, perpendicular to our heading.
            let ex = fx * dot - ax;
            let ey = fy * dot - ay;
            let ez = fz * dot - az;
            let len = Math.sqrt(ex * ex + ey * ey + ez * ez);
            if (len < 0.2) {
                // Threat dead ahead: fall back to the local right vector (cross of
                // forward with world-up), which is opposite for opposite facings.
                ex = -fz;
                ey = 0;
                ez = fx;
                len = Math.sqrt(ex * ex + ey * ey + ez * ez);
                if (len < 0.2) {
                    ex = 1;
                    ey = 0;
                    ez = 0;
                    len = 1;
                }
            }
            this.tmpShipAvoid.set(ex / len, ey / len, ez / len).multiplyScalar(urgency * SHIP_AVOID_STEER);
            found = true;
        };
        const player = this.save.player;
        consider(player.position, player.velocity);
        for (const other of this.ships) {
            if (other.id === shipId || other.hull <= 0)
                continue;
            consider(other.position, other.velocity);
        }
        return found ? this.tmpShipAvoid : undefined;
    }
    getAvoidanceVector(position, desired, range, speed = 0) {
        let ax = 0;
        let ay = 0;
        let az = 0;
        const px = position.x;
        const py = position.y;
        const pz = position.z;
        const ddx = desired.x;
        const ddy = desired.y;
        const ddz = desired.z;
        // Fast ships look further ahead so they have room to turn before a rock.
        const lookahead = speed * 1.05;
        const accumulate = (obstacle) => {
            const ox = px - obstacle.x;
            const oy = py - obstacle.y;
            const oz = pz - obstacle.z;
            const distSq = ox * ox + oy * oy + oz * oz;
            const clearance = obstacle.radius + range + lookahead;
            if (distSq >= clearance * clearance || distSq < 0.0001)
                return;
            const dist = Math.sqrt(distSq);
            const inv = 1 / dist;
            const ahead = (obstacle.x - px) * inv * ddx + (obstacle.y - py) * inv * ddy + (obstacle.z - pz) * inv * ddz;
            if (ahead < -0.1)
                return;
            const weight = (clearance - dist) / clearance * inv;
            ax += ox * weight;
            ay += oy * weight;
            az += oz * weight;
        };
        const dock = this.activeDockObstacle();
        if (dock)
            accumulate(dock);
        else {
            const margin = range + lookahead + MAX_FIELD_OBSTACLE_RADIUS;
            this.forEachObstacleInBox(px - margin, py - margin, pz - margin, px + margin, py + margin, pz + margin, accumulate);
        }
        return this.tmpAvoidance.set(ax, ay, az);
    }
    findCoverPoint(position, threatPosition) {
        const obstacles = this.activeFieldObstacles();
        if (!obstacles.length)
            return undefined;
        let best;
        let bestDist = Infinity;
        for (const obstacle of obstacles) {
            if (obstacle.radius < COVER_MIN_RADIUS)
                continue;
            let tx = obstacle.x - threatPosition.x;
            let ty = obstacle.y - threatPosition.y;
            let tz = obstacle.z - threatPosition.z;
            const len = Math.hypot(tx, ty, tz);
            if (len < 1)
                continue;
            tx /= len;
            ty /= len;
            tz /= len;
            const behind = obstacle.radius * 1.35 + 30;
            const cx = obstacle.x + tx * behind;
            const cy = obstacle.y + ty * behind;
            const cz = obstacle.z + tz * behind;
            const d = Math.hypot(cx - position.x, cy - position.y, cz - position.z);
            if (d > COVER_SEEK_RANGE || d >= bestDist)
                continue;
            if (this.lineBlocked({ x: threatPosition.x, y: threatPosition.y, z: threatPosition.z }, { x: cx, y: cy, z: cz }, undefined))
                best = { x: cx, y: cy, z: cz }, bestDist = d;
        }
        return best;
    }
    aheadClearance(position, direction, maxRange = 70) {
        // Distance to the nearest obstacle surface directly ahead, or maxRange if
        // the lane is clear. Used to brake only when a collision is truly imminent.
        const px = position.x;
        const py = position.y;
        const pz = position.z;
        const dx = direction.x;
        const dy = direction.y;
        const dz = direction.z;
        let closest = maxRange;
        const accumulate = (obstacle) => {
            const ox = obstacle.x - px;
            const oy = obstacle.y - py;
            const oz = obstacle.z - pz;
            const distSq = ox * ox + oy * oy + oz * oz;
            // The rock's own radius is part of its reach: a big monolith's surface
            // enters the braking window while its center is still far outside it.
            const reach = maxRange + obstacle.radius;
            if (distSq >= reach * reach || distSq < 0.0001)
                return;
            const dist = Math.sqrt(distSq);
            const inv = 1 / dist;
            const ahead = ox * inv * dx + oy * inv * dy + oz * inv * dz;
            if (ahead < 0.5)
                return;
            const surface = dist - (obstacle.radius + 6);
            if (surface < closest)
                closest = Math.max(0, surface);
        };
        const dock = this.activeDockObstacle();
        if (dock)
            accumulate(dock);
        else
            this.forEachObstacleInBox(px - (maxRange + MAX_FIELD_OBSTACLE_RADIUS), py - (maxRange + MAX_FIELD_OBSTACLE_RADIUS), pz - (maxRange + MAX_FIELD_OBSTACLE_RADIUS), px + (maxRange + MAX_FIELD_OBSTACLE_RADIUS), py + (maxRange + MAX_FIELD_OBSTACLE_RADIUS), pz + (maxRange + MAX_FIELD_OBSTACLE_RADIUS), accumulate);
        return closest;
    }
    lineBlocked(start, end, ignoreId) {
        return this.firstObstacleHit(start, end, ignoreId) !== undefined;
    }
    firstObstacleHit(start, end, ignoreId) {
        let best;
        const test = (obstacle) => {
            if (obstacle.id === ignoreId)
                return;
            const sx = start.x - obstacle.x;
            const sy = start.y - obstacle.y;
            const sz = start.z - obstacle.z;
            const clearance = obstacle.losRadius + 1.5;
            if (sx * sx + sy * sy + sz * sz < clearance * clearance)
                return;
            const hit = segmentSphereHit(start, end, { x: obstacle.x, y: obstacle.y, z: obstacle.z }, obstacle.losRadius);
            if (hit !== undefined && (best === undefined || hit < best))
                best = hit;
        };
        const dock = this.activeDockObstacle();
        if (dock)
            test(dock);
        else
            this.forEachObstacleAlongSegment(start, end, test);
        return best;
    }
    dockCandidate() {
        const locationId = DOCK_LOCATION_IDS.find((id) => id === this.activeInstanceId);
        if (!locationId)
            return undefined;
        const distance = vec(this.save.player.position).distanceTo(vec(LOCATIONS[locationId].position));
        return distance <= (LOCATIONS[locationId].dockRadius ?? 55) ? locationId : undefined;
    }
    dockAt(locationId) {
        // Captured on departure: any surrendered bounty pilot still around is
        // claimed when the player docks, so a surrender never denies the payoff
        // (ships despawn past ~950u, so everything still listed is nearby or
        // an active warrant target).
        for (const ship of this.ships) {
            if (ship.surrendered && !ship.claimed && ship.hull > 0 && (ship.bountyValue > 0 || ship.missionId))
                this.claimSurrendered(ship);
        }
        this.autopilot = false;
        this.afterburning = false;
        this.save.player.dockedAt = locationId;
        this.save.player.lastDockedAt = locationId;
        this.save.player.velocity = [0, 0, 0];
        this.save.player.angularVelocity = [0, 0, 0];
        this.save.player.throttle = 0;
        const stats = getEffectiveShipStats(this.save.player);
        this.save.player.shield = stats.shield;
        completeMissionsAtDock(this.save, locationId).forEach((message) => this.ui.showToast(message, 'success', 6000));
        refreshMissionOffers(this.save);
        this.renderer.setCockpitVisible(false);
        this.renderer.setUtilityBeam(false, this.save.player.mode, this.save.player.position);
        this.audio.setStationMode(true);
        this.audio.play('dock');
        this.ui.hideHud();
        this.ui.showDock(this.save, locationId);
        saveGame(this.save);
    }
    launch() {
        const locationId = this.save.player.dockedAt;
        if (!locationId)
            return;
        const location = LOCATIONS[locationId];
        const center = vec(location.position);
        const launchDistance = (location.dockRadius ?? location.radius * 1.7) + 8;
        // Exit pointing at the cluster of points of interest that leaves the most of
        // them directly reachable, so the body you just left never blocks the first jump.
        const obstacleRadius = location.kind === 'planet' ? location.radius + 60 : location.radius * 0.73;
        const others = NAV_LOCATION_IDS.filter((id) => id !== locationId);
        let direction = center.clone().normalize();
        if (direction.lengthSq() < 0.1)
            direction.set(0, 0, 1);
        let bestCount = -1;
        for (const id of others) {
            const candidate = vec(LOCATIONS[id].position).sub(center).normalize();
            const point = center.clone().addScaledVector(candidate, launchDistance);
            let reachable = 0;
            for (const targetId of others) {
                if (segmentSphereHit(point, vec(LOCATIONS[targetId].position), center, obstacleRadius) === undefined)
                    reachable += 1;
            }
            if (reachable > bestCount) {
                bestCount = reachable;
                direction = candidate;
            }
        }
        const orientation = new THREE.Quaternion().setFromUnitVectors(FORWARD, direction);
        const position = center.clone().addScaledVector(direction, launchDistance);
        this.save.player.position = tuple(position);
        this.save.player.rotation = quatTuple(orientation);
        this.save.player.velocity = tuple(direction.clone().multiplyScalar(6));
        this.save.player.angularVelocity = [0, 0, 0];
        this.save.player.throttle = 0.18;
        this.save.player.dockedAt = undefined;
        // The body you just left is no longer the target: clear the selection so the
        // target monitor doesn't offer to hyperdrive back to the station you're
        // already standing next to. If the nav point was that location, reset it to
        // the default vector instead of keeping a dead "already inside drop zone".
        if (this.save.player.currentTargetId === locationId)
            this.clearTarget();
        if (this.save.player.navTargetId === locationId)
            this.save.player.navTargetId = 'shardbelt';
        this.renderer.setCockpitVisible(true);
        this.audio.setStationMode(false);
        this.ui.hideDock();
        this.ui.showHud();
        this.ui.showToast(`Cleared for departure from ${location.name}.`, 'success');
        this.updateActiveInstance(true);
        saveGame(this.save);
    }
    setNav(locationId) {
        this.save.player.navTargetId = locationId;
        this.autopilot = false;
        this.ui.showToast(`NAV set: ${LOCATIONS[locationId].name}.`, 'info');
        this.audio.play('ui');
    }
    trade(kind, commodityId, quantity) {
        const dock = this.save.player.dockedAt;
        if (!dock)
            return;
        const result = kind === 'buy' ? buyCommodity(this.save, dock, commodityId, quantity) : sellCommodity(this.save, dock, commodityId, quantity);
        this.ui.showToast(result.message + (result.ok ? ` ${formatCredits(result.total)}.` : ''), result.ok ? 'success' : 'warning');
        this.audio.play(result.ok ? 'ui' : 'warning', 0.55);
        this.ui.refreshDock(this.save);
        saveGame(this.save);
    }
    acceptMission(missionId) {
        const dock = this.save.player.dockedAt;
        if (!dock)
            return;
        const result = acceptMission(this.save, dock, missionId);
        this.ui.showToast(result.message, result.ok ? 'success' : 'warning', result.ok ? 4300 : 3200);
        this.audio.play(result.ok ? 'success' : 'warning', 0.7);
        this.ui.refreshDock(this.save);
        saveGame(this.save);
    }
    repair() {
        const cost = repairCost(this.save.player);
        if (cost <= 0)
            return;
        if (this.save.player.credits < cost) {
            this.ui.showToast('Insufficient credits for full repair.', 'warning');
            return;
        }
        const stats = getEffectiveShipStats(this.save.player);
        this.save.player.credits -= cost;
        this.save.player.hull = stats.hull;
        this.save.player.armor = stats.armor;
        this.ui.showToast(`Repair complete. ${formatCredits(cost)} charged.`, 'success');
        this.audio.play('success');
        this.ui.refreshDock(this.save);
        saveGame(this.save);
    }
    refuel() {
        const cost = refillCost(this.save.player);
        if (cost <= 0)
            return;
        if (this.save.player.credits < cost) {
            this.ui.showToast('Insufficient credits for full refill.', 'warning');
            return;
        }
        const stats = getEffectiveShipStats(this.save.player);
        this.save.player.credits -= cost;
        this.save.player.fuel = stats.fuel;
        this.save.player.missiles = stats.missileCapacity;
        this.ui.showToast(`Fuel and ordnance loaded. ${formatCredits(cost)} charged.`, 'success');
        this.audio.play('success');
        this.ui.refreshDock(this.save);
        saveGame(this.save);
    }
    buyEquipment(equipmentId) {
        const item = EQUIPMENT[equipmentId];
        if (this.save.player.equipment.includes(equipmentId))
            return;
        if (!equipmentUnlocked(this.save.player, equipmentId)) {
            this.ui.showToast('Guild rank requirement not met.', 'warning');
            return;
        }
        if (this.save.player.credits < item.price) {
            this.ui.showToast('Insufficient credits.', 'warning');
            return;
        }
        const before = getEffectiveShipStats(this.save.player);
        this.save.player.credits -= item.price;
        this.save.player.equipment.push(equipmentId);
        const after = getEffectiveShipStats(this.save.player);
        this.save.player.shield += after.shield - before.shield;
        this.save.player.armor += after.armor - before.armor;
        this.ui.showToast(`${item.name} installed.`, 'success');
        this.audio.play('success');
        this.ui.refreshDock(this.save);
        saveGame(this.save);
    }
    buyShip(shipId) {
        const dock = this.save.player.dockedAt;
        if (!dock || !(LOCATIONS[dock].shipsForSale ?? []).includes(shipId)) {
            this.ui.showToast('That hull is not for sale at this location.', 'warning');
            return;
        }
        const ship = SHIPS[shipId];
        if (this.save.player.ownedShips.includes(shipId))
            return;
        if (this.save.player.credits < ship.price) {
            this.ui.showToast('Insufficient credits for this hull.', 'warning');
            return;
        }
        if (cargoMass(this.save.player) > ship.cargo + (this.save.player.equipment.includes('cargo-pods') ? 18 : 0)) {
            this.ui.showToast('Current cargo exceeds the new hull capacity.', 'warning');
            return;
        }
        this.save.player.credits -= ship.price;
        this.save.player.ownedShips.push(shipId);
        this.switchShip(shipId, true);
        this.ui.showToast(`${ship.name} purchased and commissioned.`, 'success', 6200);
        this.audio.play('success', 1.4);
    }
    switchShip(shipId, purchased = false) {
        if (!this.save.player.ownedShips.includes(shipId))
            return;
        const previousId = this.save.player.shipId;
        this.save.player.shipId = shipId;
        const capacity = cargoCapacity(this.save.player);
        if (cargoMass(this.save.player) > capacity) {
            this.save.player.shipId = previousId;
            this.ui.showToast('Cargo mass exceeds this hull capacity.', 'warning');
            return;
        }
        const stats = getEffectiveShipStats(this.save.player);
        this.save.player.shield = stats.shield;
        this.save.player.armor = stats.armor;
        this.save.player.hull = stats.hull;
        this.save.player.fuel = stats.fuel;
        this.save.player.missiles = stats.missileCapacity;
        if (!purchased)
            this.ui.showToast(`${SHIPS[shipId].name} moved to active berth.`, 'success');
        this.ui.refreshDock(this.save);
        saveGame(this.save);
    }
    joinGuild(guildId) {
        const result = joinGuild(this.save, guildId);
        this.ui.showToast(result.message, result.ok ? 'success' : 'warning');
        this.audio.play(result.ok ? 'success' : 'warning', 0.7);
        this.ui.refreshDock(this.save);
        saveGame(this.save);
    }
    openMap() {
        if (this.save.player.dockedAt)
            return;
        this.ui.showMap(this.buildNavigationMapModel());
    }
    saveNow() {
        const ok = saveGame(this.save);
        this.ui.showToast(ok ? 'Career state saved locally.' : 'Save failed in this browser context.', ok ? 'success' : 'danger');
    }
    resumeFlight() {
        this.ui.hidePause();
        this.ui.hideMap();
        this.ui.hideShipMenu();
        this.ui.hideChatLog?.();
    }
    openShipMenu() {
        if (this.save.player.dockedAt)
            return;
        this.ui.showShipMenu();
    }
    quitToTitle() {
        saveGame(this.save);
        this.dispose();
        this.onQuit();
    }
    setSetting(key, value) {
        if (key === 'music' || key === 'effects' || key === 'touchScale') {
            this.save.settings[key] = Number(value);
        }
        else if (key === 'tiltSensitivity') {
            this.save.settings.tiltSensitivity = Number(value);
            this.input.configureTilt({ tiltSensitivity: this.save.settings.tiltSensitivity });
        }
        else if (key === 'steering') {
            this.save.settings.steering = value === 'stick' ? 'stick' : 'tilt';
            this.syncTiltSteering(this.save.settings.steering === 'tilt');
        }
        else if (key === 'tiltInvertPitch' || key === 'tiltInvertYaw') {
            this.save.settings[key] = Boolean(value);
            this.input.configureTilt({ [key]: this.save.settings[key] });
        }
        else if (key === 'flightAssist' || key === 'aimAssist' || key === 'vibration') {
            this.save.settings[key] = Boolean(value);
        }
        else if (key === 'quality' && (value === 'auto' || value === 'low' || value === 'high')) {
            this.save.settings.quality = value;
            this.qualityScale = value === 'low' ? 0.72 : 1;
            this.renderer.setQualityScale(this.qualityScale);
        }
        this.audio.setVolumes(this.save.settings.music, this.save.settings.effects);
        this.ui.setTouchScale(this.save.settings.touchScale);
        saveGame(this.save);
    }
    syncTiltSteering(useTilt) {
        if (useTilt) {
            void this.input.enableTilt().then((active) => {
                if (active)
                    this.input.calibrateTilt();
                // If permission was refused (or there is no gyro), fall back to
                // the stick and keep the persisted setting honest instead of
                // leaving the pause menu showing a tilt mode that never engaged.
                const mode = this.input.tiltActive ? 'tilt' : 'stick';
                this.save.settings.steering = mode;
                this.ui.setTouchSteering(mode);
                saveGame(this.save);
            });
        }
        else {
            // Actually switch off tilt input, not just the touch layout — the
            // joystick was appearing while tilt still steered the ship.
            this.input.disableTilt();
            this.save.settings.steering = 'stick';
            this.ui.setTouchSteering('stick');
        }
    }
    enableTilt() {
        return this.input.enableTilt().then((active) => {
            if (active)
                this.input.calibrateTilt();
            this.save.settings.steering = this.input.tiltActive ? 'tilt' : 'stick';
            if (active)
                this.save.settings.tiltNeutral = { beta: this.input.tiltNeutralBeta, gamma: this.input.tiltNeutralGamma };
            this.ui.setTouchSteering(this.input.tiltActive ? 'tilt' : 'stick');
            saveGame(this.save);
            return this.input.tiltActive;
        });
    }
    calibrateTilt() {
        const neutral = this.input.calibrateTilt();
        this.save.settings.tiltNeutral = neutral;
        saveGame(this.save);
        return neutral;
    }
    syncRender(dt, now) {
        const stats = getEffectiveShipStats(this.save.player);
        const speed = vec(this.save.player.velocity).length();
        const fxState = this.hyperdriveFxState();
        // Interpolation fraction: where the next sim step sits between the last
        // completed step (prev*) and the current state. Zero when docked/paused.
        const alpha = clamp(this.simAccumulator / SIM_STEP, 0, 1);
        this.renderer.setHyperdriveFx(fxState.fx, fxState.progress);
        this.renderer.updateCamera(this.save.player.position, this.save.player.prevPosition, this.save.player.rotation, this.save.player.prevRotation, this.save.player.angularVelocity, clamp(speed / Math.max(1, stats.afterburnSpeed), 0, 2), this.afterburning || (this.autopilot && speed > stats.afterburnSpeed), dt, alpha);
        this.renderer.setDamageWarning(1 - this.save.player.hull / stats.hull);
        this.renderer.syncShips(this.ships, alpha);
        this.renderer.syncProjectiles(this.projectiles, this.projStore, alpha);
        this.renderer.syncPickups(this.pickups, this.pickupStore, alpha);
        this.renderer.render();
        if (!this.save.player.dockedAt && now - this.lastHudUpdate > 42) {
            this.lastHudUpdate = now;
            this.ui.updateHud(this.buildHudModel());
        }
        if (this.save.settings.quality === 'auto') {
            this.fpsAccumulator += dt;
            this.fpsFrames += 1;
            if (this.fpsAccumulator > 2.5) {
                const fps = this.fpsFrames / this.fpsAccumulator;
                if (fps < 39)
                    this.qualityScale = Math.max(0.62, this.qualityScale - 0.08);
                else if (fps > 56)
                    this.qualityScale = Math.min(1, this.qualityScale + 0.04);
                this.renderer.setQualityScale(this.qualityScale);
                this.fpsAccumulator = 0;
                this.fpsFrames = 0;
            }
        }
    }
    targetEdge(projection) {
        if (projection.visible && !projection.behind)
            return undefined;
        const width = this.renderer.viewportWidth;
        const height = this.renderer.viewportHeight;
        const cx = width / 2;
        const cy = height / 2;
        let vx = projection.x - cx;
        let vy = projection.y - cy;
        if (projection.behind) {
            vx = -vx;
            vy = -vy;
        }
        const margin = 54;
        const halfW = Math.max(1, width / 2 - margin);
        const halfH = Math.max(1, height / 2 - margin);
        let t = Number.POSITIVE_INFINITY;
        if (vx > 0.0001)
            t = Math.min(t, halfW / vx);
        else if (vx < -0.0001)
            t = Math.min(t, -halfW / vx);
        if (vy > 0.0001)
            t = Math.min(t, halfH / vy);
        else if (vy < -0.0001)
            t = Math.min(t, -halfH / vy);
        if (!Number.isFinite(t))
            t = 1;
        const angle = Math.atan2(vy, vx);
        return { x: cx + vx * t, y: cy + vy * t, angleDeg: (angle * 180) / Math.PI + 90 };
    }
    buildHudModel() {
        const stats = getEffectiveShipStats(this.save.player);
        const player = vec(this.save.player.position);
        const speed = vec(this.save.player.velocity).length();
        const nav = LOCATIONS[this.save.player.navTargetId];
        const target = this.getTargetRef();
        let hudTarget;
        if (target) {
            const projection = this.renderer.projectToScreen(target.position);
            const edge = this.targetEdge(projection);
            const distance = this.surfaceDistance(player, target);
            const screen = { screenX: projection.x, screenY: projection.y, onScreen: projection.visible && !projection.behind, edge };
            if (target.kind === 'ship') {
                const ship = this.ships.find((entry) => entry.id === target.id);
                const targetForward = FORWARD.clone().applyQuaternion(quat(ship.rotation));
                const targetLocal = targetForward.clone().applyQuaternion(quat(this.save.player.rotation).invert());
                const heading = Math.atan2(targetLocal.x, -targetLocal.z);
                hudTarget = {
                    kind: 'ship',
                    name: ship.name,
                    hostile: ship.hostile,
                    surrendered: ship.surrendered,
                    variant: shipVariantForRole(ship.role),
                    heading,
                    subtitle: `${ship.role.toUpperCase()} · ${ship.surrendered ? 'SURRENDERED' : ship.hostile ? 'HOSTILE' : FACTION_LABEL(ship.faction)}`,
                    // The monitor's readout line carries the pilot profile so a
                    // locked target's habits are visible at a glance — prefixed
                    // with the recognition marker when the pilot remembers the
                    // player (spared or escaped).
                    readout: ship.pilot ? `${ship.recognizesPlayer ? `${SPARED_MARK} ` : ''}${TIER_LABELS[ship.pilot.tier] ?? ship.pilot.tier} · ${TEMPERAMENT_LABELS[ship.pilot.temperament] ?? ship.pilot.temperament}` : undefined,
                    distance,
                    shield: ship.shield,
                    maxShield: ship.maxShield,
                    armor: ship.armor,
                    maxArmor: ship.maxArmor,
                    hull: ship.hull,
                    maxHull: ship.maxHull,
                    ...screen,
                };
            }
            else if (target.kind === 'asteroid') {
                const node = this.asteroids.find((entry) => entry.id === target.id);
                const scanStatus = node.scanned
                    ? `ORE ${node.richness.toFixed(2)} · ${Math.ceil(node.remaining)} units`
                    : distance > stats.scanRange
                        ? `OUT OF SCAN RANGE · ${Math.round(distance)}/${stats.scanRange} km`
                        : 'SCANNING…';
                hudTarget = { kind: 'asteroid', name: target.name, subtitle: node.scanned ? `${node.richness > 1.8 ? 'RICH' : node.richness > 1.2 ? 'VIABLE' : 'LEAN'} ORE` : 'MINERAL SIGNATURE', distance, scanned: node.scanned, readout: scanStatus, ...screen };
            }
            else if (target.kind === 'wreck') {
                const node = this.wreckNodes.find((entry) => entry.id === target.id);
                const scanStatus = node.scanned
                    ? `HAZARD ${Math.round(node.hazard * 100)} · ${Math.ceil(node.remaining)} recoveries`
                    : distance > stats.scanRange
                        ? `OUT OF SCAN RANGE · ${Math.round(distance)}/${stats.scanRange} km`
                        : 'SCANNING…';
                hudTarget = { kind: 'wreck', name: node.name, subtitle: node.scanned ? `${node.rarity.toUpperCase()} ${COMMODITIES[node.salvage].name}` : 'UNRESOLVED WRECK', distance, scanned: node.scanned, readout: scanStatus, ...screen };
            }
            else {
                const location = LOCATIONS[target.id];
                hudTarget = {
                    kind: 'location',
                    name: location.name,
                    subtitle: `${location.kind.toUpperCase()} · NAV POINT`,
                    objectKind: location.kind,
                    distance,
                    scanned: this.save.player.discovered.includes(location.id),
                    ...screen,
                };
                // POIs carry no readout card — the target monitor shows name and distance.
            }
        }
        const dock = this.dockCandidate();
        const dockPrompt = dock && vec(this.save.player.velocity).length() > AUTO_DOCK_SPEED
            ? `REDUCE SPEED — ${LOCATIONS[dock].kind === 'planet' ? 'LAND' : 'DOCK'} ${LOCATIONS[dock].shortName}`
            : undefined;
        return {
            speed: this.autopilot ? speed / (HYPERDRIVE_CRUISE_SPEED / HYPERDRIVE_DISPLAY_SPEED) : displaySpeed(speed),
            maxSpeed: this.autopilot ? HYPERDRIVE_DISPLAY_SPEED : displaySpeed(this.afterburning && speed >= 0.9 * stats.maxSpeed ? stats.afterburnSpeed : stats.maxSpeed),
            throttle: this.save.player.throttle,
            afterburner: this.afterburning,
            fuel: this.save.player.fuel,
            maxFuel: stats.fuel,
            shield: this.save.player.shield,
            maxShield: stats.shield,
            armor: this.save.player.armor,
            maxArmor: stats.armor,
            hull: this.save.player.hull,
            maxHull: stats.hull,
            missiles: this.save.player.missiles,
            maxMissiles: stats.missileCapacity,
            cargo: cargoMass(this.save.player),
            cargoCapacity: cargoCapacity(this.save.player),
            credits: this.save.player.credits,
            mode: this.save.player.mode,
            shipName: SHIPS[this.save.player.shipId].name,
            playerVariant: playerShipVariant(this.save.player.shipId),
            navName: nav.shortName,
            navDistance: player.distanceTo(vec(nav.position)),
            autopilot: this.autopilot,
            hyperdrive: this.hyperdriveFxState(),
            hyperdriveReady: !this.autopilot && !this.hyperdriveBlockReason(),
            loadPercent: Math.round((cargoMass(this.save.player) / Math.max(1, cargoCapacity(this.save.player))) * 100),
            // Handling reflects the cargo-load penalty on turn/acceleration.
            handlingPercent: Math.round(this.flightLoadScale() * 100),
            zone: this.zoneLabel(this.getWorldZone(player)),
            target: hudTarget,
            prompt: dockPrompt,
            contacts: this.radarContacts(),
        };
    }
    buildNavigationMapModel() {
        const contacts = [];
        const player = vec(this.save.player.position);
        const inverse = quat(this.save.player.rotation).invert();
        const upgradedRadar = this.save.player.equipment.includes('radar-mk2');
        const shipRange = upgradedRadar ? MAP_CONTACT_RANGE * 1.45 : MAP_CONTACT_RANGE;
        const resourceRange = upgradedRadar ? MAP_RESOURCE_CONTACT_RANGE * 1.4 : MAP_RESOURCE_CONTACT_RANGE;
        const wreckRange = upgradedRadar ? MAP_WRECK_CONTACT_RANGE * 1.35 : MAP_WRECK_CONTACT_RANGE;
        const buildContact = (kind, id, name, subtitle, position, range, hostile = false) => {
            const relative = vec(position).sub(player);
            const distance = relative.length();
            if (distance > range)
                return undefined;
            relative.applyQuaternion(inverse);
            return {
                kind,
                id,
                name,
                subtitle,
                distance,
                x: clamp(relative.x / range, -1, 1),
                y: clamp(relative.z / range, -1, 1),
                hostile,
                selected: id === this.save.player.currentTargetId,
            };
        };
        const prioritize = (a, b) => Number(b.selected) - Number(a.selected) || a.distance - b.distance;
        for (const ship of this.ships) {
            if (ship.hull <= 0)
                continue;
            const contact = buildContact('ship', ship.id, ship.name, `${ship.role.toUpperCase()} · ${ship.hostile ? 'HOSTILE' : FACTION_LABEL(ship.faction)}`, ship.position, shipRange, ship.hostile);
            if (contact)
                contacts.push(contact);
        }
        if (this.activeInstanceId === 'shardbelt') {
            const resources = this.asteroids
                .filter((node) => node.remaining > 0)
                .map((node) => buildContact('asteroid', node.id, node.tunnelPart ? 'Rock Crown Deposit' : 'Asteroid Deposit', node.scanned ? `ORE ${node.richness.toFixed(2)}` : 'UNSCANNED MINERAL', node.position, resourceRange))
                .filter((contact) => Boolean(contact))
                .sort(prioritize)
                .slice(0, upgradedRadar ? MAP_RESOURCE_CONTACT_LIMIT + 16 : MAP_RESOURCE_CONTACT_LIMIT);
            contacts.push(...resources);
        }
        if (this.activeInstanceId === 'mourning-line') {
            const wrecks = this.wreckNodes
                .filter((node) => node.remaining > 0)
                .map((node) => buildContact('wreck', node.id, node.name, node.scanned ? `${node.rarity.toUpperCase()} ${COMMODITIES[node.salvage].name}` : 'UNSCANNED WRECK', node.position, wreckRange))
                .filter((contact) => Boolean(contact))
                .sort(prioritize)
                .slice(0, MAP_WRECK_CONTACT_LIMIT);
            contacts.push(...wrecks);
        }
        contacts.sort((a, b) => Number(b.hostile) - Number(a.hostile) || prioritize(a, b));
        const nearestThreat = contacts.find((contact) => contact.hostile && contact.distance <= HYPERDRIVE_THREAT_RADIUS);
        return {
            playerPosition: [...this.save.player.position],
            navTargetId: this.save.player.navTargetId,
            currentTargetId: this.save.player.currentTargetId,
            contacts,
            autopilotAvailable: !nearestThreat,
            threatLabel: nearestThreat ? `${nearestThreat.name} at ${Math.round(nearestThreat.distance)} units` : undefined,
        };
    }
    radarContacts() {
        const contacts = [];
        const player = vec(this.save.player.position);
        const inverse = quat(this.save.player.rotation).invert();
        const range = this.save.player.equipment.includes('radar-mk2') ? 560 : 380;
        const add = (position, type, selected, surfaceOffset = 0) => {
            const relative = vec(position).sub(player).applyQuaternion(inverse);
            const distance = Math.hypot(relative.x, relative.z) - surfaceOffset;
            if (distance > range * 1.45)
                return;
            const scale = Math.max(range, distance);
            contacts.push({ x: clamp(relative.x / scale, -1, 1), y: clamp(relative.z / scale, -1, 1), type, selected, altitude: relative.y });
        };
        for (const ship of this.ships) {
            if (ship.hull <= 0)
                continue;
            add(ship.position, ship.hostile ? 'hostile' : ship.role === 'patrol' ? 'friendly' : 'neutral', ship.id === this.save.player.currentTargetId);
        }
        for (const id of NAV_LOCATION_IDS)
            add(LOCATIONS[id].position, 'location', id === this.save.player.currentTargetId, LOCATIONS[id].radius);
        if (this.save.player.mode === 'mining') {
            for (const node of this.asteroids)
                if (node.scanned || node.id === this.save.player.currentTargetId)
                    add(node.position, 'resource', node.id === this.save.player.currentTargetId);
        }
        if (this.save.player.mode === 'salvage') {
            for (const node of this.wreckNodes)
                if (node.scanned || node.id === this.save.player.currentTargetId)
                    add(node.position, 'wreck', node.id === this.save.player.currentTargetId);
        }
        for (const pickup of this.pickups)
            if (pickup.life > 0)
                add(this.pickupStore.pos.subarray(pickup.slot * 3, pickup.slot * 3 + 3), 'pickup', false);
        return contacts;
    }
    zoneLabel(zone) {
        if (zone === 'asteroid-field')
            return 'SHARDBELT / COLLISION HAZARD';
        if (zone === 'graveyard')
            return 'MOURNING LINE / RADIATION';
        if (zone === 'near-location')
            return 'CONTROLLED APPROACH';
        return 'OPEN SPACE';
    }
}
const FACTION_LABEL = (faction) => {
    switch (faction) {
        case 'concord':
            return 'CONCORD';
        case 'free-merchants':
            return 'FREE MERCHANTS';
        case 'frontier-miners':
            return 'FRONTIER MINERS';
        case 'salvage-union':
            return 'SALVAGE UNION';
        case 'red-talons':
            return 'RED TALONS';
    }
};
