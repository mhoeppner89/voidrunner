import { COMMODITIES, DOCK_LOCATION_IDS, EQUIPMENT, FACTION_NAMES, GUILD_NAMES, GUILD_RANK_NAMES, LOCATIONS, SHIPS, SUN_POSITION, commodityIds, displaySpeed, equipmentIds } from './data.js';
import { cargoCapacity, cargoMass, denPrice, SYNDICATE_DEN_FAVOR } from './economy.js';
import { formatCredits, formatDuration } from './random.js';
import { equipmentUnlocked, getEffectiveShipStats, refillCost, repairCost } from './shipStats.js';
import { AMMO_CAPACITY, WEAPON_ORDER, WEAPONS, weaponOwned } from './weapons.js';
import { TIER_LABELS, TEMPERAMENT_LABELS } from './pilots.js';
import { shipTopDownProfile } from './voxelModels.js';
import { defaultSettings } from './save.js';
import { getLanguage, t } from './i18n.js';
import { ShipPreview } from './shipPreview.js';
const escapeHtml = (value) => value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const percent = (value, max) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100)));
// The rendered star sits far outside the playable system. Use its real
// position for radial distance, then use the canonical system X/Z plane for
// the POI angles. Using the far-shell sun for both would collapse every
// destination into one narrow sunward wedge instead of centering the system
// map around the star.
const SYSTEM_MAP_RADIAL_MIN = 16;
const SYSTEM_MAP_RADIAL_MAX = 42;
// Helix and Mourning Line are intentionally only 20,000 units apart, which
// is less than one map-card width at this system scale. Give the graveyard a
// schematic bearing offset so both POIs remain readable; its radial distance
// (and therefore its closer-to-the-sun relationship) is unchanged.
const SYSTEM_MAP_ANGLE_OFFSETS = Object.freeze({ 'mourning-line': 1.0 });
const systemMapDistance = (position) => Math.hypot(position[0] - SUN_POSITION[0], position[1] - SUN_POSITION[1], position[2] - SUN_POSITION[2]);
const SYSTEM_MAP_DISTANCE_RANGE = (() => {
    const distances = Object.values(LOCATIONS).map((location) => systemMapDistance(location.position));
    const min = Math.min(...distances);
    const max = Math.max(...distances);
    return { min, span: Math.max(1, max - min) };
})();
const systemMapPoint = (position, locationId) => {
    const distance = systemMapDistance(position);
    const radial = Math.max(SYSTEM_MAP_RADIAL_MIN, Math.min(SYSTEM_MAP_RADIAL_MAX, SYSTEM_MAP_RADIAL_MIN + ((distance - SYSTEM_MAP_DISTANCE_RANGE.min) / SYSTEM_MAP_DISTANCE_RANGE.span) * (SYSTEM_MAP_RADIAL_MAX - SYSTEM_MAP_RADIAL_MIN)));
    const angle = Math.atan2(position[2], position[0]) + (SYSTEM_MAP_ANGLE_OFFSETS[locationId] ?? 0);
    return {
        left: 50 + Math.cos(angle) * radial,
        top: 50 + Math.sin(angle) * radial,
    };
};
// Talker identity for the comms surfaces: the color follows the speaker's
// relation to the player — hostiles red, allies blue, neutral white — so the
// strip reads at a glance without a per-ship legend. The text shows the
// callsign itself: the quoted combat handle when there is one, the plain name
// otherwise.
const RELATION_COLORS = { hostile: '#ff6b5e', ally: '#6fb5ff', neutral: '#e9e6dc' };
export const relationColor = (relation) => RELATION_COLORS[relation] ?? RELATION_COLORS.neutral;
export const callsignHandle = (callsign) => {
    const quoted = callsign.match(/“[^”]+”/);
    return quoted ? quoted[0].slice(1, -1) : callsign;
};
// Radar altitude tick geometry. The caller picks the direction sign (-1 = up
// the screen, +1 = down), and the tick grows toward ~80% of the ring for a
// full-range climb while being normalised to the room left before the rim so a
// contact near the edge never spills off the readable disc. Returns undefined
// when there is no room for a legible tick.
export const radarAltitudeTick = ({ x, y, radius, ratio = 1, direction, magnitude, size = 3.2 }) => {
    const gap = (size + 1.5) * ratio;
    const startY = y + direction * gap;
    const half = Math.sqrt(Math.max(0, radius * radius - x * x));
    const room = direction < 0 ? startY + half : half - startY;
    // Ticks stay short: a full-range climb reads as a stub, not a spike —
    // capped at half the ring so above/below never dominates the blip.
    const desired = Math.max(3, magnitude * radius * 0.4) * ratio;
    const length = Math.max(0, Math.min(desired, room - 2 * ratio));
    return length >= 1.5 * ratio ? { startY, length } : undefined;
};
// Radar radial warp: almost all combat happens inside ~200 km (the guns' real
// range sits around 140 km), a thin sliver of the 1000 km horizon — so the
// inner zone is expanded on a steeper scale and a dogfight reads on the disc.
// Piecewise-linear through fixed anchors, monotone so no blip can ever
// overshoot the rim:
//   (0,0) → (combat, combatDisplay) → (scan, 0.7) → (1,1)
// The 200 km combat mark renders at combatDisplay (0.45) of the disc on every
// radar fit — combat is physical, so it owns the same glass regardless of the
// horizon — and the scan-range ring (500 km) renders at 0.7, so the near/scan
// zone owns most of the disc and the far band (scan → horizon) compresses
// into the outer rim.
const radarWarpFraction = (fraction, combat, scan, scanDisplay = 0.7, combatDisplay = 0.45) => {
    if (fraction <= combat)
        return fraction * (combatDisplay / combat);
    if (fraction <= scan)
        return combatDisplay + (fraction - combat) * ((scanDisplay - combatDisplay) / (scan - combat));
    return scanDisplay + (fraction - scan) * ((1 - scanDisplay) / (1 - scan));
};
const GAME_VERSION = '0.7.3';
// Local art review flags. `dev-dock` opens any concourse directly and
// `dev-ship` selects the initial hull, so visual checks do not require a
// flight, a jump, or a saved-game detour. (Guarded for headless imports.)
const QUERY_PARAMS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const VESPER_HOVER_PREVIEW = QUERY_PARAMS.get('vesper-hover') === '1';
const VESPER_HOVER_SHIP_ID = VESPER_HOVER_PREVIEW ? QUERY_PARAMS.get('vesper-ship') : undefined;
const DEV_PREVIEW_LOCATION_PARAM = QUERY_PARAMS.get('dev-dock');
const DEV_PREVIEW_LOCATION = DOCK_LOCATION_IDS.includes(DEV_PREVIEW_LOCATION_PARAM) ? DEV_PREVIEW_LOCATION_PARAM : undefined;
const DEV_PREVIEW_SHIP_ID = QUERY_PARAMS.get('dev-ship');
const PREVIEW_LOCATION = DEV_PREVIEW_LOCATION ?? (VESPER_HOVER_PREVIEW ? 'vesper' : undefined);
const PREVIEW_MODE = Boolean(PREVIEW_LOCATION);
const VESPER_ART_WIDTH = 1672;
const VESPER_ART_HEIGHT = 941;
// These are background-space anchors, not viewport percentages. Each profile
// compensates for the sprite's actual visible silhouette and visual angle so
// transparent canvas padding does not decide how high the ship appears to
// hover above a concourse pad.
const VESPER_SHIP_PROFILES = Object.freeze({
    wayfarer: Object.freeze({
        name: 'Wayfarer',
        art: './assets/remaster/ship-isometric-wayfarer-vesper-lit-v3.png',
        anchorX: 848,
        anchorY: 498,
        width: 245,
        angle: -1,
        bob: 8,
        shadowX: 790,
        shadowY: 625,
        shadowWidth: 301,
    }),
    talon: Object.freeze({
        name: 'Talon',
        art: './assets/remaster/ship-isometric-talon-vesper-lit-v1.png',
        anchorX: 848,
        anchorY: 492,
        width: 228.2,
        angle: 4,
        bob: 8,
        shadowX: 790,
        shadowY: 625,
        shadowWidth: 287,
    }),
    vanguard: Object.freeze({
        name: 'Vanguard',
        art: './assets/remaster/ship-isometric-vanguard-vesper-lit-v1.png',
        anchorX: 848,
        anchorY: 497,
        width: 225.4,
        angle: 7,
        bob: 7,
        shadowX: 790,
        shadowY: 625,
        shadowWidth: 294,
    }),
    prospector: Object.freeze({
        name: 'Prospector',
        art: './assets/remaster/ship-isometric-prospector-vesper-lit-v1.png',
        anchorX: 848,
        anchorY: 512,
        width: 222.6,
        angle: -3,
        bob: 5,
        shadowX: 790,
        shadowY: 633,
        shadowWidth: 301,
    }),
    lancer: Object.freeze({
        name: 'Lancer',
        art: './assets/remaster/ship-isometric-lancer-vesper-lit-v1.png',
        anchorX: 848,
        anchorY: 497,
        width: 228.2,
        angle: 13,
        bob: 8,
        shadowX: 790,
        shadowY: 625,
        shadowWidth: 297.5,
    }),
    atlas: Object.freeze({
        name: 'Atlas Hauler',
        art: './assets/remaster/ship-isometric-atlas-vesper-lit-v1.png',
        anchorX: 848,
        anchorY: 505,
        width: 420,
        angle: -1,
        bob: 4,
        shadowX: 790,
        shadowY: 640,
        shadowWidth: 520,
    }),
});
const DEFAULT_VESPER_SHIP_PROFILE = VESPER_SHIP_PROFILES.wayfarer;
const VESPER_LAUNCH_DURATION = 960;
const VESPER_POINTER_ANCHORS = Object.freeze({
    services: Object.freeze({ x: 496, y: 617 }),
    market: Object.freeze({ x: 450, y: 405 }),
    bar: Object.freeze({ x: 1154, y: 473 }),
});
// Source-image anchors for the local all-location preview tool. They are
// deliberately background-space coordinates, so cover-cropping the same
// 1672×941 plate at another viewport keeps the hull on its landing area.
const CONCOURSE_PREVIEW_ANCHORS = Object.freeze({
    vesper: Object.freeze({ shipX: 848, shipY: 498, shadowX: 790, shadowY: 625, services: VESPER_POINTER_ANCHORS.services, market: VESPER_POINTER_ANCHORS.market, bar: VESPER_POINTER_ANCHORS.bar }),
    helix: Object.freeze({ shipX: 1280, shipY: 520, smallShipY: 560, shadowX: 1280, shadowY: 680, services: { x: 1010, y: 520 }, market: { x: 320, y: 500 }, bar: { x: 280, y: 320 } }),
    rook: Object.freeze({ shipX: 836, shipY: 560, smallShipY: 568, shadowX: 836, shadowY: 690, services: { x: 1240, y: 470 }, market: { x: 380, y: 470 }, bar: { x: 340, y: 280 } }),
    azure: Object.freeze({ shipX: 680, shipY: 430, shadowX: 500, shadowY: 580, smallShipX: 540, smallShipY: 500, smallShadowX: 450, smallShadowY: 590, atlasShipX: 650, atlasShadowX: 470, services: { x: 1190, y: 650 }, market: { x: 1290, y: 350 }, bar: { x: 250, y: 320 } }),
});
const INITIAL_PREVIEW_SHIP_ID = VESPER_SHIP_PROFILES[DEV_PREVIEW_SHIP_ID]
    ? DEV_PREVIEW_SHIP_ID
    : VESPER_SHIP_PROFILES[VESPER_HOVER_SHIP_ID]
        ? VESPER_HOVER_SHIP_ID
        : undefined;
const COCKPIT_ART_BY_SHIP = Object.freeze({
    wayfarer: './assets/remaster/cockpit-frame.webp',
    vanguard: './assets/remaster/cockpit-vanguard.webp',
    talon: './assets/remaster/cockpit-talon.webp',
    prospector: './assets/remaster/cockpit-prospector.webp',
    lancer: './assets/remaster/cockpit-lancer.webp',
    atlas: './assets/remaster/cockpit-atlas.webp',
});
export class GameUI {
    root;
    viewport;
    actions;
    save;
    dockLocation;
    dockTab = 'concourse';
    dockTerminal = 'concourse';
    marketPoint = '';
    shipDetailId;
    barPanel = 'people';
    barPersonId;
    titleVisible = true;
    arenaEnv = 'open';
    arenaScenario = '1v1';
    arenaDifficulty = 'veteran';
    radarContext;
    // DOM cache: the cockpit HUD is built once and never re-rendered, so the
    // per-frame updateHud path reads nodes from this map instead of re-querying
    // the document dozens of times per frame.
    elementCache = new Map();
    shipPreviews = [];
    toastId = 0;
    // Monitor surfaces replace the in-flight toast stack: recentEvents feeds
    // the own-ship flight-recorder ticker + the ship-menu history, sensorLog
    // feeds the radar's local-space line. Both ring-buffer so a busy fight
    // never grows the DOM, and entries carry their own expiry for the ticker.
    recentEvents = [];
    sensorLog = [];
    mapPointer;
    lastMapPointerSelection;
    lastHud;
    npcLineIndex = new Map();
    cockpitShipId = 'wayfarer';
    vesperPreviewShipId = INITIAL_PREVIEW_SHIP_ID;
    vesperLaunchTransition = false;
    vesperLaunchTimer;
    constructor(host) {
        host.innerHTML = this.shellMarkup();
        this.root = host.querySelector('#game-shell');
        this.viewport = host.querySelector('#viewport');
        const radar = host.querySelector('#radar');
        this.radarContext = radar.getContext('2d');
        this.ownHullCanvas = host.querySelector('#own-hull-outline');
        this.targetHullCanvas = host.querySelector('#target-hull-outline');
        this.targetLayout = host.querySelector('.screen-target-layout');
        this.bindStaticEvents();
        this.syncFullscreenButton();
        document.addEventListener('fullscreenchange', this.syncFullscreenButton);
        // React instantly to a physical rotation (phones/tablets) so the forced
        // landscape overlay clears the moment the device is flipped.
        if (typeof matchMedia === 'function') {
            const portraitQuery = matchMedia('(orientation: portrait)');
            this.portraitQuery = portraitQuery;
            portraitQuery.addEventListener?.('change', this.updateOrientationNotice);
        }
        this.updateOrientationNotice();
        window.addEventListener('resize', () => {
            this.updateOrientationNotice();
            this.syncConcourseOverlay();
        });
    }
    setActions(actions) {
        this.actions = actions;
    }
    el(selector) {
        let node = this.elementCache.get(selector);
        if (node === undefined) {
            node = this.root.querySelector(selector);
            this.elementCache.set(selector, node);
        }
        return node;
    }
    attachSave(save) {
        this.save = save;
        this.setCockpitShip(save?.player?.shipId);
    }
    setCockpitShip(shipId = 'wayfarer') {
        const nextId = COCKPIT_ART_BY_SHIP[shipId] ? shipId : 'wayfarer';
        if (this.cockpitShipId === nextId && this.root.dataset.cockpitShip === nextId)
            return;
        this.cockpitShipId = nextId;
        this.root.dataset.cockpitShip = nextId;
        const art = this.el('.cockpit-art');
        if (art)
            art.style.backgroundImage = `url("${COCKPIT_ART_BY_SHIP[nextId]}")`;
    }
    getVesperShipId(shipId = this.save?.player?.shipId) {
        if (PREVIEW_MODE && VESPER_SHIP_PROFILES[this.vesperPreviewShipId])
            return this.vesperPreviewShipId;
        return VESPER_SHIP_PROFILES[shipId] ? shipId : 'wayfarer';
    }
    getVesperShipProfile(shipId = this.save?.player?.shipId) {
        return VESPER_SHIP_PROFILES[this.getVesperShipId(shipId)] ?? DEFAULT_VESPER_SHIP_PROFILE;
    }
    selectVesperPreviewShip(shipId) {
        if (!PREVIEW_MODE || !VESPER_SHIP_PROFILES[shipId] || this.vesperLaunchTransition)
            return;
        this.vesperPreviewShipId = shipId;
        const profile = this.getVesperShipProfile();
        const layer = this.root.querySelector('.concourse-hover-preview');
        const image = layer?.querySelector('.concourse-hover-ship');
        if (!layer || !image)
            return;
        const launchLabel = t('Launch the docked {name}', { name: profile.name });
        image.src = profile.art;
        image.alt = launchLabel;
        image.setAttribute('aria-label', launchLabel);
        this.syncConcourseOverlay();
        const toolbar = this.root.querySelector('.vesper-preview-toolbar');
        const heading = toolbar?.querySelector('.vesper-preview-heading b');
        if (heading)
            heading.textContent = profile.name;
        this.root.querySelectorAll('[data-vesper-preview-ship]').forEach((button) => {
            const selected = button.dataset.vesperPreviewShip === shipId;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        const takeoff = toolbar?.querySelector('[data-vesper-preview-launch]');
        if (takeoff)
            takeoff.innerHTML = `${t('TAKE OFF')} <span>${escapeHtml(profile.name)}</span>`;
    }
    shellMarkup() {
        return `
      <main id="game-shell" class="steering-tilt">
        <div id="viewport"></div>
        <div class="global-crt-overlay" aria-hidden="true"></div>
        <section id="hud" class="hud is-hidden" aria-label="${t('Cockpit heads-up display')}">
          <div class="cockpit-vignette" aria-hidden="true"></div>
          <div class="cockpit-art" aria-hidden="true"></div>
          <div class="cockpit-glass" aria-hidden="true"></div>
          <div class="hyperdrive-fx" aria-hidden="true">
            <i class="hyperdrive-fx-vignette"></i>
            <i class="hyperdrive-fx-ring"></i>
            <i class="hyperdrive-fx-streaks"></i>
            <i class="hyperdrive-fx-flash"></i>
          </div>
          <div class="cockpit-screen cockpit-screen-own" role="button" tabindex="0" aria-label="${t('Own ship status display; tap to open ship menu')}">
            <div class="screen-heading"><span>${t('STATUS')}</span><b id="own-ship-name">WAYFARER</b></div>
            <div class="screen-standoff" id="screen-standoff" data-tone="danger"><span>${t('STANDOFF')}</span><b id="screen-standoff-demand"></b><em id="screen-standoff-timer">9</em></div>
            <div class="screen-race-strip" id="screen-race-strip"><span id="screen-race-label"></span><b id="screen-race-value"></b></div>
            <div class="screen-ship-layout"><div class="screen-flight"><div><span>${t('SPD')}</span><b id="screen-own-speed">0</b><small id="screen-own-max-speed">/100</small></div><div><span>${t('FUEL')}</span><b id="screen-own-fuel">100</b><small>%</small></div><div><span>${t('HOLD')}</span><b id="screen-own-cargo">0.0</b><small id="screen-own-cargo-cap">/32</small></div></div><div class="screen-own-weapon" id="screen-own-weapon" data-touch-action="weaponCycle" data-venting="false" role="button" tabindex="0" title="${t('Weapon — press X')}"><span id="screen-own-weapon-name"></span><em id="screen-own-weapon-ammo">∞</em></div><canvas class="hull-outline" id="own-hull-outline" aria-hidden="true"></canvas><div class="screen-bars"><div><span>${t('SHIELDS')}</span><i><b id="screen-own-shield"></b></i><em id="screen-own-shield-value">90</em></div><div><span>${t('ARMOR')}</span><i><b id="screen-own-armor"></b></i><em id="screen-own-armor-value">100</em></div><div><span>${t('HULL')}</span><i><b id="screen-own-hull"></b></i><em id="screen-own-hull-value">100</em></div></div><div class="screen-ticker screen-event-ticker" id="screen-event-ticker" data-tone="info"></div></div>
          </div>
          <div class="cockpit-screen cockpit-screen-radar" aria-label="${t('Radar display; tap to open navigation map')}">
            <div class="screen-heading radar-heading" id="screen-radar-transponder" data-touch-action="transponder" role="button" tabindex="0" title="${t('Transponder — press B')}">${t('TRANSPONDER ON')}</div>
            <div class="radar-screen-wrap"><canvas id="radar" width="220" height="220" role="button" tabindex="0" aria-label="${t('Open navigation map')}"></canvas></div>
          </div>
          <div class="cockpit-screen cockpit-screen-target" data-touch-action="targetNext" aria-label="${t('Target status display; tap to cycle targets')}">
            <div class="screen-heading"><span>${t('TARGET STATUS')}</span><b id="screen-target-name">${t('NO LOCK')}</b></div>
            <div id="screen-target-distance" class="screen-target-distance">—</div>
            <div id="screen-target-readout" class="screen-target-readout">—</div>
            <div class="screen-target-layout"><canvas class="hull-outline" id="target-hull-outline" aria-hidden="true"></canvas><div class="screen-bars"><div><span>SHIELDS</span><i><b id="screen-target-shield"></b></i><em id="screen-target-shield-value">—</em></div><div><span>ARMOR</span><i><b id="screen-target-armor"></b></i><em id="screen-target-armor-value">—</em></div><div><span>HULL</span><i><b id="screen-target-hull"></b></i><em id="screen-target-hull-value">—</em></div></div></div>
          </div>
          <button type="button" id="hyperdrive-card" class="cockpit-identity" data-touch-action="autopilot" aria-label="${t('Hyperdrive: engage jump to nav point')}"><b>${t('HYPERDRIVE')}</b><em id="hyperdrive-card-status" class="is-hidden"></em></button>

          <div id="target-bracket" class="target-bracket is-hidden" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div id="target-edge-pointer" class="target-edge-pointer is-hidden" aria-hidden="true"><i></i><span></span></div>
          <div class="reticle" aria-hidden="true"><span></span><span></span><span></span><span></span><b></b></div>
          <button type="button" id="comms-bar" class="comms-bar" data-ui-command="open-chat" role="button" tabindex="0" aria-label="${t('Open comms log')}"></button>
          <button type="button" id="patrol-reply-chip" class="patrol-reply-chip is-hidden" data-ui-command="patrol-reply" role="button" tabindex="0" aria-label="${t('Reply to the patrol greeting')}">${t('REPLY')} <em id="patrol-reply-timer"></em></button>
          <div class="touch-controls" aria-label="${t('Touch flight controls')}">
            <div class="touch-left">
              <div class="touch-throttle" data-touch-throttle>
                <div class="touch-throttle-fill"></div>
                <div class="touch-throttle-thumb" data-touch-throttle-thumb></div>
                <span class="touch-throttle-label" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 2.5v19"/><path d="M5.5 8.5H12"/><circle cx="16.8" cy="8.5" r="2.4"/></svg></span>
              </div>
              <div class="touch-stick" data-touch-stick aria-label="${t('Steering stick')}"><div class="touch-stick-rings" aria-hidden="true"></div><div class="touch-stick-knob" data-touch-stick-knob></div></div>
              <button class="touch-boost touch-boost-left" data-touch-action="afterburner" aria-label="${t('Afterburner — hold')}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" fill-rule="evenodd"><path d="M12 2.2C7.9 7.5 5.4 10.3 5.4 14a6.6 6.6 0 0 0 13.2 0c0-3.7-2.5-6.5-6.6-11.8Zm0 7c-2 2.6-2.8 3.8-2.8 5.3a2.8 2.8 0 0 0 5.6 0c0-1.5-.8-2.7-2.8-5.3Z"/></svg></button>
            </div>
            <div class="touch-right">
              <button class="touch-boost touch-boost-right" data-touch-action="afterburner" aria-label="${t('Afterburner — hold')}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" fill-rule="evenodd"><path d="M12 2.2C7.9 7.5 5.4 10.3 5.4 14a6.6 6.6 0 0 0 13.2 0c0-3.7-2.5-6.5-6.6-11.8Zm0 7c-2 2.6-2.8 3.8-2.8 5.3a2.8 2.8 0 0 0 5.6 0c0-1.5-.8-2.7-2.8-5.3Z"/></svg></button>
              <button id="touch-fire" class="touch-fire" data-touch-action="fire" aria-label="${t('Fire — hold')}"><svg data-icon="fire" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4.6"/><path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21"/></svg><svg data-icon="mine" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="is-hidden"><path d="M20.9 3.4 17.3 7.4 13.8 11.9"/><path d="M13.8 11.9 5.6 20.4"/></svg><svg data-icon="salvage" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="is-hidden"><path d="M17.4 3.2a5 5 0 0 1 0 10"/><path d="M17.4 3.2l-2.7 2.7"/><path d="M17.4 13.2l-2.7-2.7"/><path d="M14.7 10.5 6.2 19"/></svg></button>
              <button id="touch-missile" class="touch-missile" data-touch-action="missile" aria-label="${t('Missile')}"><svg data-icon="missile" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2.4 9.3 8.8h5.4Z"/><path d="M9.3 8.8h5.4v6.4H9.3Z"/><path d="M9.3 15.2 6.8 21M14.7 15.2l2.5 5.8"/></svg><svg data-icon="scan" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="is-hidden"><circle cx="12" cy="12" r="6.2"/><path d="M12 5.8V12l4.2 2.4"/><path d="M4.8 4.8 3.4 3.4M19.2 4.8l1.4-1.4M4.8 19.2l-1.4 1.4M19.2 19.2l1.4 1.4"/></svg><svg data-icon="mine" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="is-hidden"><path d="M20.9 3.4 17.3 7.4 13.8 11.9"/><path d="M13.8 11.9 5.6 20.4"/></svg><svg data-icon="salvage" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="is-hidden"><path d="M17.4 3.2a5 5 0 0 1 0 10"/><path d="M17.4 3.2l-2.7 2.7"/><path d="M17.4 13.2l-2.7-2.7"/><path d="M14.7 10.5 6.2 19"/></svg><svg data-icon="capture" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="is-hidden"><path d="M8 3.6h8l1.8 3H6.2Z"/><path d="M9.2 6.6v2.1M14.8 6.6v2.1"/><path d="M7 11.5h10M8.1 14.5h7.8M9.3 17.5h5.4M10.6 20.5h2.8"/></svg></button>
            </div>
          </div>
          <div class="hud-corner-buttons">
            <button class="pause-button" data-ui-command="pause" aria-label="${t('Pause')}">Ⅱ</button>
            <button class="fullscreen-button" data-ui-command="toggle-fullscreen" aria-label="${t('Toggle fullscreen')}">⛶</button>
          </div>
        </section>

        <section id="title-screen" class="title-screen">
          <div class="title-stars"></div>
          <div class="title-cockpit-frame" aria-hidden="true"></div>
          <div class="title-card">
            <button class="title-fullscreen-button" data-ui-command="toggle-fullscreen" aria-label="${t('Toggle fullscreen')}">⛶</button>
            <button class="title-lang-button" data-ui-command="toggle-language" aria-label="${t('Switch language')}" title="${getLanguage() === 'de' ? 'English' : 'Deutsch'}">${getLanguage() === 'de' ? '🇬🇧' : '🇩🇪'}</button>
            <span class="title-version">BUILD ${GAME_VERSION}</span>
            <h1>VOID<br><b>RUNNER</b></h1>
            <p>${t('Make your name.')}</p>
            <div class="title-actions">
              <button class="primary" data-ui-command="resume">${t('RESUME FLIGHT')}</button>
              <button data-ui-command="new">${t('NEW CAREER')}</button>
              <button data-ui-command="arena">${t('COMBAT SIM')}</button>
              <button data-ui-command="options">${t('OPTIONS')}</button>
            </div>
            <div class="title-controls">
              <span>${t('TOUCH: tilt to steer · THRUST · AFTERBURN · FIRE · SECONDARY TOOL')}</span>
              <span>${t('KEYBOARD: WASD · Q/E · R/F · Space · T · J')}</span>
            </div>
            <div class="title-tilt">
              <button data-ui-command="enable-tilt">${t('ENABLE TILT STEER')}</button>
              <button data-ui-command="calibrate-tilt">${t('SET NEUTRAL')}</button>
            </div>
          </div>
          <div class="copyright-note">${t('LOCAL AUTOSAVE · TOUCH / PAD / KEYBOARD')}</div>
        </section>

        <section id="dock-screen" class="dock-screen is-hidden" aria-label="${t('Docked location')}"></section>
        <section id="map-panel" class="modal-panel is-hidden" aria-label="${t('Navigation map')}"></section>
        <section id="ship-panel" class="modal-panel is-hidden" aria-label="${t('Ship status')}"></section>
        <section id="pause-panel" class="modal-panel is-hidden" aria-label="${t('Pause and settings')}"></section>
        <section id="arena-panel" class="modal-panel is-hidden" aria-label="${t('Combat simulator')}"></section>
        <section id="chat-panel" class="modal-panel is-hidden" aria-label="${t('Comms log')}"></section>
        <div id="toast-stack" class="toast-stack global-toasts" aria-live="polite"></div>
        <div id="rotate-notice" class="rotate-notice is-hidden" role="alertdialog" aria-label="${t('Rotate your screen to landscape')}">
          <div class="rotate-phone" aria-hidden="true"></div>
          <strong>${t('FLIP TO LANDSCAPE')}</strong>
          <span>${t('Voidrunner is built for horizontal play.')}<br>${t('Rotate your device — or widen the window — to continue.')}</span>
          <button type="button" data-ui-command="fullscreen">${t('GO FULLSCREEN')}</button>
        </div>
      </main>
    `;
    }
    bindStaticEvents() {
        const mapTargetFromEvent = (event) => event.target.closest('[data-map-target-kind][data-map-target-id]');
        const mapTargetKey = (target) => `${target.dataset.mapTargetKind}:${target.dataset.mapTargetId}`;
        const selectMapTarget = (target) => {
            this.actions?.selectTarget(target.dataset.mapTargetKind, target.dataset.mapTargetId);
            this.hideMap();
        };
        this.root.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse')
                return;
            const target = mapTargetFromEvent(event);
            if (!target)
                return;
            this.mapPointer = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                key: mapTargetKey(target),
            };
        }, { passive: true });
        this.root.addEventListener('pointerup', (event) => {
            const start = this.mapPointer;
            this.mapPointer = undefined;
            if (!start || start.pointerId !== event.pointerId || event.pointerType === 'mouse')
                return;
            const target = mapTargetFromEvent(event);
            if (!target || mapTargetKey(target) !== start.key || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 14)
                return;
            event.preventDefault();
            event.stopPropagation();
            this.lastMapPointerSelection = { key: start.key, at: performance.now() };
            selectMapTarget(target);
        });
        this.root.addEventListener('pointercancel', (event) => {
            if (this.mapPointer?.pointerId === event.pointerId)
                this.mapPointer = undefined;
        });
        this.root.addEventListener('click', (event) => {
            const previewShip = event.target.closest('[data-vesper-preview-ship]');
            if (previewShip) {
                this.selectVesperPreviewShip(previewShip.dataset.vesperPreviewShip);
                return;
            }
            const previewLaunch = event.target.closest('[data-vesper-preview-launch]');
            if (previewLaunch) {
                this.startVesperLaunchTransition();
                return;
            }
            const target = event.target.closest('[data-ui-command], [data-dock-tab], [data-dock-terminal], [data-dock-hotspot], [data-market-point], [data-bar-panel], [data-nav-id], [data-trade], [data-jettison], [data-mission-id], [data-equipment-id], [data-ship-id], [data-switch-ship], [data-ship-detail], [data-ship-detail-back], [data-guild-id], [data-person-id], [data-map-target-kind], [data-arena-env], [data-arena-scenario], [data-arena-difficulty], [data-pay-mug]');
            if (!target)
                return;
            if (target.dataset.uiCommand)
                this.handleCommand(target.dataset.uiCommand, target);
            else if (target.dataset.arenaEnv) {
                this.arenaEnv = target.dataset.arenaEnv;
                this.root.querySelectorAll('[data-arena-env]').forEach((button) => button.classList.toggle('selected', button === target));
            }
            else if (target.dataset.arenaScenario) {
                this.arenaScenario = target.dataset.arenaScenario;
                this.root.querySelectorAll('[data-arena-scenario]').forEach((button) => button.classList.toggle('selected', button === target));
            }
            else if (target.dataset.arenaDifficulty) {
                this.arenaDifficulty = target.dataset.arenaDifficulty;
                this.root.querySelectorAll('[data-arena-difficulty]').forEach((button) => button.classList.toggle('selected', button === target));
            }
            else if (target.dataset.mapTargetKind && target.dataset.mapTargetId) {
                const key = mapTargetKey(target);
                const duplicatePointerClick = this.lastMapPointerSelection?.key === key && performance.now() - this.lastMapPointerSelection.at < 700;
                this.lastMapPointerSelection = undefined;
                if (!duplicatePointerClick)
                    selectMapTarget(target);
            }
            else if (target.dataset.barPanel) {
                const panel = target.dataset.barPanel;
                if (panel === 'people' || panel === 'missions' || panel === 'guilds')
                    this.switchToTerminal('bar', panel);
            }
            else if (target.dataset.dockTab) {
                const tab = target.dataset.dockTab;
                if (tab === 'concourse' || tab === 'bar' || tab === 'market')
                    this.switchToTerminal(tab);
            }
            else if (target.dataset.dockTerminal) {
                const terminal = target.dataset.dockTerminal;
                if (terminal === 'concourse' || terminal === 'bar' || terminal === 'market')
                    this.switchToTerminal(terminal);
            }
            else if (target.dataset.dockHotspot) {
                const hotspot = target.dataset.dockHotspot;
                if (hotspot === 'bar' || hotspot === 'market')
                    this.switchToTerminal(hotspot);
                else if (hotspot === 'services') {
                    this.dockTab = 'concourse';
                    this.dockTerminal = 'services';
                    this.renderDock();
                }
            }
            else if (target.dataset.marketPoint) {
                this.openMarketPoint(target.dataset.marketPoint);
            }
            else if (target.dataset.navId) {
                this.actions?.setNav(target.dataset.navId);
                this.hideMap();
            }
            else if (target.dataset.trade) {
                const [kind, commodityId, quantity] = target.dataset.trade.split(':');
                this.actions?.trade(kind, commodityId, Number(quantity));
            }
            else if (target.dataset.jettison) {
                this.actions?.jettison(target.dataset.jettison);
                this.showShipMenu();
            }
            else if (target.dataset.payMug) {
                this.actions?.payOffMug();
                this.showShipMenu();
            }
            else if (target.dataset.missionId) {
                this.actions?.acceptMission(target.dataset.missionId);
            }
            else if (target.dataset.equipmentId) {
                this.actions?.buyEquipment(target.dataset.equipmentId);
            }
            else if (target.dataset.shipId) {
                this.actions?.buyShip(target.dataset.shipId);
            }
            else if (target.dataset.switchShip) {
                this.actions?.switchShip(target.dataset.switchShip);
            }
            else if (target.dataset.shipDetail) {
                this.shipDetailId = target.dataset.shipDetail;
                this.renderMarketPoint('shipyard');
            }
            else if (target.dataset.shipDetailBack) {
                this.shipDetailId = undefined;
                this.renderMarketPoint('shipyard');
            }
            else if (target.dataset.guildId) {
                this.actions?.joinGuild(target.dataset.guildId);
            }
            else if (target.dataset.personId) {
                this.talkToPerson(target.dataset.personId);
            }
        });
        const radar = this.root.querySelector('#radar');
        radar?.addEventListener('pointerup', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.actions?.openMap();
        });
        radar?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            event.preventDefault();
            this.actions?.openMap();
        });
        // The radar heading is the transponder toggle (tap toggles on touch;
        // B toggles on keyboard). Enter/Space activate it as a proper button
        // for keyboard-only players.
        const transponderToggle = this.root.querySelector('#screen-radar-transponder');
        transponderToggle?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            event.preventDefault();
            this.actions?.toggleTransponder();
        });
        // Tapping the OWN SHIP STATUS monitor opens the paused ship menu
        // (active contracts, cargo hold, account) — the radar's nav-map twin.
        const ownScreen = this.root.querySelector('.cockpit-screen-own');
        ownScreen?.addEventListener('pointerup', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.actions?.openShipMenu();
        });
        // The weapon readout line is the exception: tapping it cycles guns
        // instead of opening the menu (same pattern as the transponder chip).
        const weaponReadout = this.root.querySelector('#screen-own-weapon');
        weaponReadout?.addEventListener('pointerup', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.actions?.weaponCycle?.();
        });
        weaponReadout?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            event.preventDefault();
            event.stopPropagation();
            this.actions?.weaponCycle?.();
        });
        ownScreen?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            event.preventDefault();
            this.actions?.openShipMenu();
        });
        this.root.addEventListener('input', (event) => {
            const element = event.target;
            const setting = element.dataset.setting;
            if (!setting)
                return;
            const value = element instanceof HTMLInputElement && element.type === 'checkbox' ? element.checked : element.type === 'range' ? Number(element.value) : element.value;
            this.actions?.setSetting(setting, value);
        });
        this.root.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            const target = event.target.closest('[data-ui-command], [data-dock-hotspot], [data-market-point], [data-bar-panel], [data-person-id], [data-ship-detail], [data-ship-detail-back]');
            if (!target)
                return;
            event.preventDefault();
            target.click();
        });
    }
    handleCommand(command, element) {
        switch (command) {
            case 'resume':
                this.actions?.resume();
                break;
            case 'new':
                if (!this.save || window.confirm('Start a new career and overwrite the local autosave?'))
                    this.actions?.startNew();
                break;
            case 'fullscreen':
                this.actions?.requestFullscreen();
                break;
            case 'arena':
                this.showArena();
                break;
            case 'close-arena':
                this.hideArena();
                break;
            case 'launch-arena':
                this.hideArena();
                this.actions?.startArena(this.arenaEnv, this.arenaScenario, this.arenaDifficulty);
                break;
            case 'launch':
                if (DOCK_LOCATION_IDS.includes(this.dockLocation) && this.dockTerminal === 'concourse' && element?.classList.contains('concourse-hover-ship'))
                    this.startVesperLaunchTransition();
                else
                    this.actions?.launch();
                break;
            case 'pause':
                this.showPause();
                break;
            case 'options':
                this.showOptions();
                break;
            case 'close-options':
                this.hideOptions();
                break;
            case 'toggle-fullscreen':
                this.actions?.toggleFullscreen();
                break;
            case 'toggle-language':
                // Flip between German (default) and English. setSetting persists
                // the choice and reloads the page in the new language.
                this.actions?.setSetting('language', getLanguage() === 'de' ? 'en' : 'de');
                break;
            case 'enable-tilt':
                void this.actions?.enableTilt().then((active) => this.showToast(active ? 'Tilt steering engaged. Set neutral if the ship drifts.' : 'Tilt steering unavailable (no gyroscope, or permission denied).', active ? 'success' : 'warning', 4200));
                break;
            case 'calibrate-tilt':
                if (this.actions?.calibrateTilt())
                    this.showToast('Tilt neutral set: hold the phone level and fly.', 'success', 3200);
                break;
            case 'resume-flight':
                this.hidePause();
                this.actions?.resumeFlight();
                break;
            case 'map':
                this.actions?.openMap();
                break;
            case 'close-map':
                this.hideMap();
                break;
            case 'open-chat':
                this.openChatLog();
                break;
            case 'patrol-reply':
                this.actions?.patrolReply?.();
                break;
            case 'syndicate-pay':
                this.actions?.paySyndicateBerth?.();
                break;
            case 'dismiss-story':
                this.dismissStory();
                break;
            case 'close-chat':
                this.closeChatLog();
                break;
            case 'close-ship':
                this.hideShipMenu();
                break;
            case 'save':
                this.actions?.saveNow();
                break;
            case 'quit-title':
                this.hidePause();
                this.actions?.quitToTitle();
                break;
            case 'repair':
                this.actions?.repair();
                break;
            case 'refuel':
                this.actions?.refuel();
                break;
            case 'dock-concourse':
                this.dockTab = 'concourse';
                this.dockTerminal = 'concourse';
                this.marketPoint = '';
                this.barPanel = 'people';
                this.barPersonId = undefined;
                this.renderDock();
                break;
            case 'bar-scene':
                this.dockTab = 'bar';
                this.dockTerminal = 'bar';
                this.barPanel = 'people';
                this.barPersonId = undefined;
                this.renderDock();
                break;
            case 'market-overview':
                this.dockTab = 'market';
                this.dockTerminal = 'market';
                this.marketPoint = '';
                this.renderDock();
                break;
            default:
                console.debug('Unhandled UI command', command, element);
        }
    }
    showTitle(hasSave, save) {
        this.save = save;
        this.titleVisible = true;
        this.root.querySelector('#title-screen')?.classList.remove('is-hidden');
        this.root.querySelector('#hud')?.classList.add('is-hidden');
        this.root.querySelector('#dock-screen')?.classList.add('is-hidden');
        this.hideArena();
        const resume = this.root.querySelector('[data-ui-command="resume"]');
        if (resume) {
            resume.disabled = !hasSave;
            resume.textContent = hasSave ? t('RESUME CAREER') : t('NO AUTOSAVE FOUND');
        }
        this.updateOrientationNotice();
    }
    hideTitle() {
        this.titleVisible = false;
        this.root.querySelector('#title-screen')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    showHud() {
        this.root.querySelector('#hud')?.classList.remove('is-hidden');
        this.updateOrientationNotice();
    }
    hideHud() {
        this.root.querySelector('#hud')?.classList.add('is-hidden');
    }
    showDock(save, locationId) {
        this.cancelVesperLaunchTransition();
        this.save = save;
        this.dockLocation = locationId;
        this.dockTab = 'concourse';
        this.dockTerminal = 'concourse';
        this.marketPoint = '';
        this.barPanel = 'people';
        this.barPersonId = undefined;
        this.hideTitle();
        this.hideHud();
        this.root.querySelector('#dock-screen')?.classList.remove('is-hidden');
        this.renderDock();
        this.updateOrientationNotice();
    }
    refreshDock(save) {
        this.save = save;
        if (this.dockLocation)
            this.renderDock();
    }
    hideDock() {
        this.cancelVesperLaunchTransition();
        this.disposeShipPreviews();
        this.root.querySelector('#dock-screen')?.classList.add('is-hidden');
        this.dockLocation = undefined;
    }
    cancelVesperLaunchTransition() {
        this.vesperLaunchTransition = false;
        if (this.vesperLaunchTimer !== undefined) {
            window.clearTimeout(this.vesperLaunchTimer);
            this.vesperLaunchTimer = undefined;
        }
    }
    startVesperLaunchTransition() {
        if (this.vesperLaunchTransition)
            return;
        const dock = this.root.querySelector('#dock-screen');
        const scene = dock?.querySelector('.station-scene');
        const ship = dock?.querySelector('.concourse-hover-ship');
        const flight = dock?.querySelector('.concourse-hover-ship-flight');
        if (!scene || !ship || !flight) {
            this.actions?.launch();
            return;
        }
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            this.actions?.launch();
            return;
        }
        this.vesperLaunchTransition = true;
        scene.classList.add('is-launching');
        ship.closest('.concourse-hover-preview')?.classList.add('is-departing');
        scene.querySelector('.scene-pointers')?.setAttribute('aria-hidden', 'true');
        ship.setAttribute('aria-disabled', 'true');
        ship.removeAttribute('tabindex');
        let finished = false;
        const finish = () => {
            if (finished)
                return;
            finished = true;
            flight.removeEventListener('animationend', onAnimationEnd);
            this.vesperLaunchTransition = false;
            if (this.vesperLaunchTimer !== undefined) {
                window.clearTimeout(this.vesperLaunchTimer);
                this.vesperLaunchTimer = undefined;
            }
            this.actions?.launch();
        };
        const onAnimationEnd = (event) => {
            if (event.animationName === 'vesper-launch-ship' || event.animationName === 'rook-launch-ship')
                finish();
        };
        flight.addEventListener('animationend', onAnimationEnd);
        this.vesperLaunchTimer = window.setTimeout(finish, VESPER_LAUNCH_DURATION + 120);
    }
    renderDock() {
        if (!this.save || !this.dockLocation)
            return;
        this.disposeShipPreviews();
        const dock = this.root.querySelector('#dock-screen');
        const location = LOCATIONS[this.dockLocation];
        // Refreshes of the same dock screen (e.g. a market trade) must keep the
        // scroll position; only actual navigation resets it to the top.
        const prevTab = dock.dataset.tab;
        const prevTerminal = dock.dataset.terminal;
        const prevScroll = dock.querySelector('.dock-content')?.scrollTop ?? 0;
        dock.style.setProperty('--dock-accent', location.accent);
        dock.style.setProperty('--dock-secondary', location.secondary);
        dock.dataset.location = this.dockLocation;
        dock.dataset.tab = this.dockTab;
        dock.dataset.terminal = this.dockTerminal;
        const illustrationScreen = this.dockTerminal === 'bar'
            ? 'bar'
            : this.dockTerminal === 'market'
                ? 'market'
                : 'concourse';
        const terminal = this.dockTerminal ? this.renderDockTab(this.dockTerminal) : '';
        dock.innerHTML = `
      <div class="dock-backdrop">${this.locationIllustration(this.dockLocation, illustrationScreen)}</div>
      <div class="dock-scanlines" aria-hidden="true"></div>        <header class="dock-header">
        <div><span>${t(location.kind.toUpperCase())} / ${t(FACTION_NAMES[location.faction])}</span><h2>${escapeHtml(location.name)}</h2></div>
        ${this.dockTerminal !== 'concourse' ? `<div class="dock-back-button dock-pointer" data-ui-command="dock-concourse" role="button" tabindex="0" aria-label="${t('Return to the concourse')}">${t('◀ CONCOURSE')}</div>` : ''}
        <div class="dock-wallet-unit"><div class="dock-wallet"><span>${t('AVAILABLE CREDIT')}</span><strong>${formatCredits(this.save.player.credits)}</strong><small>${SHIPS[this.save.player.shipId].name} · ${cargoMass(this.save.player).toFixed(1)}/${cargoCapacity(this.save.player)} mass</small></div><button class="dock-options-button dock-pointer" data-ui-command="options" role="button" tabindex="0" aria-label="${t('Options')}">⚙</button></div>
      </header>
      ${this.renderDockNotice()}
      <div class="dock-content">${terminal}</div>
      ${this.renderSyndicateCard()}
    `;
        const content = dock.querySelector('.dock-content');
        const preserveScroll = prevTab === this.dockTab && prevTerminal === this.dockTerminal;
        if (content)
            content.scrollTop = preserveScroll ? prevScroll : 0;
        const illustration = dock.querySelector('.dock-backdrop img');
        illustration?.addEventListener('load', () => this.syncConcourseOverlay(), { once: true });
        this.syncConcourseOverlay();
        requestAnimationFrame(() => this.syncConcourseOverlay());
        if (this.dockTerminal === 'market' && this.marketPoint) {
            this.renderMarketPoint(this.marketPoint);
            if (content && preserveScroll)
                content.scrollTop = prevScroll;
        }
    }
    // The syndicate berth's receipt: while the current visit arrived below the
    // radar, the dock screen keeps a saved notice showing what the berth cost
    // and what this dock's ledger remembers — plus how close the ledger is to
    // opening the smuggler's den.
    renderDockNotice() {
        const arrival = this.save?.world?.syndicateArrival;
        if (!arrival || arrival.locationId !== this.dockLocation)
            return '';
        const paidHere = this.save.world.underworld?.[this.dockLocation] ?? 0;
        const denReady = paidHere >= SYNDICATE_DEN_FAVOR;
        return `
      <div class="dock-notice syndicate-notice">
        <b>${t('SYNDICATE BERTH · {credits} PAID', { credits: formatCredits(arrival.fee) })}</b>
        <span>${t('This dock did not report your arrival. Ledger: {credits} paid to date', { credits: formatCredits(paidHere) })}${denReady ? t(' — the smuggler\'s den is open to you.') : t(' — {credits} more buys the den.', { credits: formatCredits(SYNDICATE_DEN_FAVOR - paidHere) })}</span>
      </div>`;
    }
    // The local syndicate's ledger at this dock has crossed the favor line:
    // the fixer opens the smuggler's den (black-market prices for restricted
    // goods) to the pilot who paid for it.
    denUnlockedAt(locationId) {
        return (this.save?.world?.underworld?.[locationId] ?? 0) >= SYNDICATE_DEN_FAVOR;
    }
    // The starting payment card for an unlicensed arrival: the dark pilot lands
    // like anyone else, and the concourse opens on the syndicate's demand — pay
    // the berth fee or launch back into space. Modal on purpose: there is no
    // third way out, so the fee can't be sidestepped by wandering the concourse.
    renderSyndicateCard() {
        const pending = this.save?.world?.syndicatePending;
        if (!pending || pending.locationId !== this.dockLocation)
            return '';
        const affordable = this.save.player.credits >= pending.fee;
        return `
      <div class="syndicate-card" role="dialog" aria-modal="true" aria-label="${t('Syndicate berth payment')}">
        <div class="syndicate-card-panel">
          <span class="syndicate-card-eyebrow">${t('UNLICENSED ARRIVAL · THIS DOCK DID NOT REPORT YOU')}</span>
          <h3>${t('Syndicate berth')}</h3>
          <p>${t('The station took your landing, but the ledger has no manifest for you. Pay the berth fee — or launch back into space.')}</p>
          <div class="syndicate-card-fee"><span>${t('BERTH FEE')}</span><b>${formatCredits(pending.fee)}</b><small>${affordable ? t('Covers this arrival · ledger credit toward the den') : t('You have {credits} — not enough. Launch to leave.', { credits: formatCredits(this.save.player.credits) })}</small></div>
          <div class="syndicate-card-actions">
            <button type="button" data-ui-command="syndicate-pay" ${affordable ? '' : 'disabled'} aria-label="${t('Pay the syndicate berth fee')}">${t('PAY')} ${formatCredits(pending.fee)}</button>
            <button type="button" data-ui-command="launch" aria-label="${t('Launch back into space without paying')}">${t('LAUNCH BACK')}</button>
          </div>
        </div>
      </div>`;
    }
    syncConcourseOverlay() {
        const dock = this.root.querySelector('#dock-screen');
        const layer = dock?.querySelector('.concourse-hover-preview');
        const scene = dock?.querySelector('.station-scene');
        const illustration = dock?.querySelector('.dock-backdrop img');
        if (!layer || !scene || !illustration)
            return;
        const imageRect = illustration.getBoundingClientRect();
        const sceneRect = scene.getBoundingClientRect();
        const naturalWidth = illustration.naturalWidth || VESPER_ART_WIDTH;
        const naturalHeight = illustration.naturalHeight || VESPER_ART_HEIGHT;
        const scale = Math.max(imageRect.width / naturalWidth, imageRect.height / naturalHeight);
        const renderedWidth = naturalWidth * scale;
        const renderedHeight = naturalHeight * scale;
        const contentLeft = imageRect.left + (imageRect.width - renderedWidth) / 2;
        const contentTop = imageRect.top + (imageRect.height - renderedHeight) / 2;
        const anchorX = (sourceX) => `${(contentLeft + sourceX * scale - sceneRect.left).toFixed(2)}px`;
        const anchorY = (sourceY) => `${(contentTop + sourceY * scale - sceneRect.top).toFixed(2)}px`;
        const profile = this.getVesperShipProfile();
        const anchors = CONCOURSE_PREVIEW_ANCHORS[this.dockLocation] ?? CONCOURSE_PREVIEW_ANCHORS.vesper;
        const isAtlas = profile === VESPER_SHIP_PROFILES.atlas;
        const shipBaseX = isAtlas ? (anchors.atlasShipX ?? anchors.shipX) : (anchors.smallShipX ?? anchors.shipX);
        const shipBaseY = isAtlas ? (anchors.atlasShipY ?? anchors.shipY) : (anchors.smallShipY ?? anchors.shipY);
        const shadowBaseX = isAtlas ? (anchors.atlasShadowX ?? anchors.shadowX) : (anchors.smallShadowX ?? anchors.shadowX);
        const shadowBaseY = isAtlas ? (anchors.atlasShadowY ?? anchors.shadowY) : (anchors.smallShadowY ?? anchors.shadowY);
        const shipAnchorX = shipBaseX + (profile.anchorX - DEFAULT_VESPER_SHIP_PROFILE.anchorX);
        const shipAnchorY = shipBaseY + (profile.anchorY - DEFAULT_VESPER_SHIP_PROFILE.anchorY);
        const shadowAnchorX = shadowBaseX + (profile.shadowX - DEFAULT_VESPER_SHIP_PROFILE.shadowX);
        const shadowAnchorY = shadowBaseY + (profile.shadowY - DEFAULT_VESPER_SHIP_PROFILE.shadowY);
        const concourseShipScale = this.dockLocation === 'rook' ? 0.86 : 1;
        const concourseShadowScale = this.dockLocation === 'rook' ? 0.9 : 1;
        layer.style.setProperty('--vesper-ship-left', anchorX(shipAnchorX));
        layer.style.setProperty('--vesper-ship-top', anchorY(shipAnchorY));
        layer.style.setProperty('--vesper-ship-width', `${(profile.width * scale * concourseShipScale).toFixed(2)}px`);
        layer.style.setProperty('--vesper-ship-angle', `${profile.angle}deg`);
        layer.style.setProperty('--vesper-ship-bob', `${(profile.bob * scale * concourseShipScale).toFixed(2)}px`);
        layer.style.setProperty('--vesper-shadow-left', anchorX(shadowAnchorX));
        layer.style.setProperty('--vesper-shadow-top', anchorY(shadowAnchorY));
        layer.style.setProperty('--vesper-shadow-width', `${(profile.shadowWidth * scale * concourseShadowScale).toFixed(2)}px`);
        layer.style.setProperty('--vesper-shadow-height', `${(58 * scale * concourseShadowScale).toFixed(2)}px`);
        scene.style.setProperty('--concourse-services-left', anchorX(anchors.services.x));
        scene.style.setProperty('--concourse-services-top', anchorY(anchors.services.y));
        scene.style.setProperty('--concourse-market-left', anchorX(anchors.market.x));
        scene.style.setProperty('--concourse-market-top', anchorY(anchors.market.y));
        scene.style.setProperty('--concourse-bar-left', anchorX(anchors.bar.x));
        scene.style.setProperty('--concourse-bar-top', anchorY(anchors.bar.y));
    }
    renderLandingScene() {
        return this.renderConcourse();
    }
    renderDockTab(tab) {
        if (!this.save || !this.dockLocation)
            return '';
        if (tab === 'services')
            return this.renderServices();
        switch (tab) {
            case 'bar':
                return this.renderBar();
            case 'market':
                return this.renderMarket();
            case 'missions':
                return this.renderMissions();
            case 'guilds':
                return this.renderGuilds();
            case 'equipment':
                return this.renderEquipment();
            case 'shipyard':
                return this.renderShipyard();
            case 'concourse':
            default:
                return this.renderConcourse();
        }
    }
    renderConcourse() {
        const showShipPreview = DOCK_LOCATION_IDS.includes(this.dockLocation);
        const livePreview = PREVIEW_MODE && PREVIEW_LOCATION === this.dockLocation;
        const profile = this.getVesperShipProfile();
        const selectedShipId = this.getVesperShipId();
        const launchLabel = t('Launch the docked {ship}', { ship: profile.name });
        const previewToolbar = livePreview ? `
        <div class="vesper-preview-toolbar" aria-label="${t('Live concourse ship preview')}">
          <div class="vesper-preview-heading"><span>${t('LIVE CONCOURSE PREVIEW')}</span><b>${escapeHtml(profile.name)}</b></div>
          <div class="vesper-preview-ship-list" role="group" aria-label="${t('Select a Vesper ship')}">
            ${Object.entries(VESPER_SHIP_PROFILES).map(([id, candidate]) => `<button type="button" class="${id === selectedShipId ? 'is-selected' : ''}" data-vesper-preview-ship="${id}" aria-pressed="${id === selectedShipId}">${escapeHtml(candidate.name.replace(/ Hauler$/, ''))}</button>`).join('')}
          </div>
          <button type="button" class="vesper-preview-takeoff" data-vesper-preview-launch>${t('TAKE OFF')} <span>${escapeHtml(profile.name)}</span></button>
        </div>` : '';
        return `
      <div class="concourse-screen station-scene" aria-label="${t('Concourse points of interest')}">
        ${previewToolbar}
        ${showShipPreview ? `<div class="concourse-hover-preview" aria-label="${t('Your docked ship')}">
          <div class="concourse-hover-shadow" aria-hidden="true"></div>
          <div class="concourse-hover-ship-flight">
            <img class="concourse-hover-ship" src="${profile.art}" alt="${escapeHtml(launchLabel)}" data-ui-command="launch" role="button" tabindex="0" aria-label="${escapeHtml(launchLabel)}" draggable="false">
          </div>
        </div>` : ''}
        <div class="scene-pointers" aria-label="${t('Concourse actions')}">
          ${showShipPreview ? '' : `<div class="scene-pointer concourse-pointer-ship" data-ui-command="launch" role="button" tabindex="0" aria-label="${t('Launch the docked ship')}"><i>↗</i><b>${t('YOUR SHIP')}</b><small>${t('Launch')}</small></div>`}
          <div class="scene-pointer concourse-pointer-services" data-dock-hotspot="services" role="button" tabindex="0" aria-label="${t('Open services')}"><i>⚙</i><b>${t('SERVICES')}</b><small>${t('Repair and refuel')}</small></div>
          <div class="scene-pointer concourse-pointer-market" data-dock-hotspot="market" role="button" tabindex="0" aria-label="${t('Enter the market')}"><i>▣</i><b>${t('MARKET')}</b><small>${t('Trade and fit out')}</small></div>
          <div class="scene-pointer concourse-pointer-bar" data-dock-hotspot="bar" role="button" tabindex="0" aria-label="${t('Enter the bar')}"><i>✦</i><b>${t('BAR')}</b><small>${t('Guilds and missions')}</small></div>
          ${this.denUnlockedAt(this.dockLocation) ? `<div class="scene-pointer concourse-pointer-den" data-market-point="den" role="button" tabindex="0" aria-label="${t('Enter the smuggler\'s den')}"><i>☣</i><b>${t('SMUGGLER\'S DEN')}</b><small>${t('Black-market prices')}</small></div>` : ''}
        </div>
      </div>
    `;
    }
    switchToTerminal(tab, panel = 'people') {
        this.dockTab = tab;
        this.dockTerminal = tab;
        if (tab === 'bar') {
            this.barPanel = panel;
            this.barPersonId = undefined;
        }
        else if (tab === 'market') {
            this.marketPoint = '';
        }
        else {
            this.marketPoint = '';
        }
        this.renderDock();
    }
    renderBar() {
        const people = LOCATIONS[this.dockLocation].people ?? [];
        if (this.barPanel === 'missions')
            return this.renderMissions();
        if (this.barPanel === 'guilds')
            return this.renderGuilds();
        if (this.barPersonId)
            return this.renderBarDialogue(this.barPersonId);
        return `
      <div class="bar-scene station-scene" aria-label="${t('Bar points of interest')}">
        <div class="scene-pointers" aria-label="${t('Bar actions')}">
          <div class="scene-pointer bar-pointer-missions" data-bar-panel="missions" role="button" tabindex="0" aria-label="${t('Open the mission board')}"><i>✦</i><b>${t('MISSION BOARD')}</b><small>${t('Find work')}</small></div>
          <div class="scene-pointer bar-pointer-guilds" data-bar-panel="guilds" role="button" tabindex="0" aria-label="${t('Open guilds')}"><i>◇</i><b>${t('GUILDS')}</b><small>${t('Find allies')}</small></div>
          ${people.map((person, index) => `
            <div class="scene-pointer bar-person-pointer bar-person-${index}" data-person-id="${person.id}" role="button" tabindex="0" aria-label="${t('Talk to {name}', { name: person.name })}"><i>●</i><b>${escapeHtml(person.name)}</b><small>${escapeHtml(t(person.role))}</small></div>
          `).join('')}
        </div>
      </div>
    `;
    }
    talkToPerson(personId) {
        const person = LOCATIONS[this.dockLocation].people?.find((entry) => entry.id === personId);
        if (!person)
            return;
        const index = this.npcLineIndex.get(personId) ?? 0;
        this.npcLineIndex.set(personId, index + 1);
        this.barPanel = 'people';
        this.barPersonId = personId;
        this.renderDock();
    }
    renderBarDialogue(personId) {
        const person = LOCATIONS[this.dockLocation].people?.find((entry) => entry.id === personId);
        if (!person)
            return this.renderBar();
        const lineIndex = Math.max(0, (this.npcLineIndex.get(personId) ?? 1) - 1);
        const line = person.lines[lineIndex % person.lines.length];
        return `
      <div class="bar-dialogue-screen station-scene" aria-label="${t('Conversation with {name}', { name: person.name })}">
        <div class="scene-pointer scene-return-pointer" data-ui-command="bar-scene" role="button" tabindex="0" aria-label="${t('Return to the bar')}"><i>◀</i><b>${t('BAR FLOOR')}</b><small>${t('Back to the room')}</small></div>
        <section class="bar-dialogue-card" data-person-id="${person.id}" role="button" tabindex="0" aria-label="${t('Continue talking to {name}', { name: person.name })}">
          ${this.portraitImage(person.id, person.name)}
          <div><span class="eyebrow">${escapeHtml(person.name)} / ${escapeHtml(t(person.affiliation))}</span><h3>${escapeHtml(t(person.role))}</h3><p>“${escapeHtml(t(line))}”</p></div>
        </section>
      </div>
    `;
    }
    renderMarket() {
        if (!this.marketPoint) {
            return `
        <div class="market-scene station-scene" aria-label="${t('Market points of interest')}">
          <div class="scene-pointers" aria-label="${t('Market actions')}">
            <div class="scene-pointer market-pointer-commodities" data-market-point="commodities" role="button" tabindex="0" aria-label="${t('Open commodity market')}"><i>▦</i><b>${t('COMMODITY MARKET')}</b><small>${t('Buy and sell cargo')}</small></div>
            <div class="scene-pointer market-pointer-equipment" data-market-point="equipment" role="button" tabindex="0" aria-label="${t('Open ship parts')}"><i>⚙</i><b>${t('SHIP PARTS')}</b><small>${t('Fit out your ship')}</small></div>
            <div class="scene-pointer market-pointer-shipyard" data-market-point="shipyard" role="button" tabindex="0" aria-label="${t('Open the ship dealer')}"><i>↗</i><b>${t('NEW SHIP')}</b><small>${t('Hulls for sale')}</small></div>
            ${this.denUnlockedAt(this.dockLocation) ? `<div class="scene-pointer market-pointer-den" data-market-point="den" role="button" tabindex="0" aria-label="${t('Enter the smuggler\'s den')}"><i>☣</i><b>${t('SMUGGLER\'S DEN')}</b><small>${t('Black-market prices')}</small></div>` : ''}
          </div>
        </div>
      `;
        }
        return `
      <div class="market-screen market-menu-screen">
        <div class="scene-pointer scene-return-pointer" data-ui-command="market-overview" role="button" tabindex="0" aria-label="${t('Return to the market floor')}"><i>◀</i><b>${t('MARKET FLOOR')}</b><small>${t('Back to the scene')}</small></div>
        <nav class="market-points" aria-label="${t('Market points')}"><button class="${this.marketPoint === 'commodities' ? 'active' : ''}" data-market-point="commodities">${t('COMMODITY MARKET')}</button><button class="${this.marketPoint === 'equipment' ? 'active' : ''}" data-market-point="equipment">${t('SHIP PARTS')}</button><button class="${this.marketPoint === 'shipyard' ? 'active' : ''}" data-market-point="shipyard">${t('NEW SHIP')}</button>${this.denUnlockedAt(this.dockLocation) ? `<button class="${this.marketPoint === 'den' ? 'active' : ''}" data-market-point="den">${t('SMUGGLER\'S DEN')}</button>` : ''}</nav>
        <div id="market-point-content"></div>
      </div>
    `;
    }
    openMarketPoint(point) {
        this.marketPoint = point;
        this.dockTab = 'market';
        this.dockTerminal = 'market';
        this.renderDock();
    }
    renderMarketPoint(point) {
        const content = this.root.querySelector('#market-point-content');
        const marketScreen = this.root.querySelector('.market-screen');
        if (!content || !marketScreen || !this.save || !this.dockLocation)
            return;
        this.marketPoint = point;
        if (point !== 'shipyard')
            this.shipDetailId = undefined;
        this.disposeShipPreviews();
        marketScreen.querySelectorAll('[data-market-point]').forEach((button) => button.classList.toggle('active', button.dataset.marketPoint === point));
        if (point === 'equipment')
            content.innerHTML = this.renderEquipment();
        else if (point === 'shipyard') {
            content.innerHTML = this.renderShipyard();
            this.mountShipPreviews();
        }
        else if (point === 'den') {
            const market = this.save.world.market[this.dockLocation];
            const rows = commodityIds.filter((id) => !COMMODITIES[id].legal).map((id) => {
                const item = market[id];
                const commodity = COMMODITIES[id];
                const owned = this.save.player.cargo[id] ?? 0;
                const price = denPrice(this.dockLocation, id, item, this.save.world.seed, this.save.world.economyClock) ?? 0;
                return `<div class="market-row restricted">
              <span><b>${escapeHtml(t(commodity.name))}</b><small>${escapeHtml(t(commodity.description))}</small></span>
              <span><b>${formatCredits(price)}</b><small>${t('DEN PRICE')}</small></span>
              <span><b>${item.supply} / ${item.demand}</b><small>${t('UNDER THE COUNTER')}</small></span>
              <span><b>${owned}</b><small>${t('UNITS')}</small></span>
              <span class="market-actions"><button data-trade="den-buy:${id}:1">${t('BUY 1')}</button><button data-trade="den-buy:${id}:5">${t('BUY 5')}</button><button data-trade="den-sell:${id}:1" ${owned <= 0 ? 'disabled' : ''}>${t('SELL 1')}</button><button data-trade="den-sell:${id}:999" ${owned <= 0 ? 'disabled' : ''}>${t('SELL ALL')}</button></span>
            </div>`;
            }).join('');
            const paidHere = this.save.world.underworld?.[this.dockLocation] ?? 0;
            content.innerHTML = `
        <div class="market-layout">
          <div class="table-title"><div><span class="eyebrow">${t('UNLICENSED EXCHANGE')}</span><h3>${t('Smuggler\'s den')}</h3></div><div><span>${t('YOUR LEDGER HERE')}</span><b>${formatCredits(paidHere)} cr</b></div></div>
          <div class="market-table">
          <div class="market-row market-head"><span>${t('COMMODITY')}</span><span>${t('PRICE')}</span><span>${t('SUP / DEM')}</span><span>${t('HOLD')}</span><span>${t('ACTIONS')}</span></div>
          ${rows}
          </div>
          <p class="den-footnote">${t('The den only moves restricted goods. Untraceable arms fetch {percent}% of the counter price — and no manifest entry ever gets written.', { percent: Math.round((denPrice(this.dockLocation, 'arms', market.arms, this.save.world.seed, this.save.world.economyClock) / Math.max(1, market.arms.lastPrice)) * 100) })}</p>
        </div>`;
        }
        else {
            const market = this.save.world.market[this.dockLocation];
            content.innerHTML = `
        <div class="market-layout">
          <div class="table-title"><div><span class="eyebrow">${t('COMMODITY EXCHANGE')}</span><h3>${t('Spot market')}</h3></div><div><span>${t('HOLD')}</span><b>${cargoMass(this.save.player).toFixed(1)} / ${cargoCapacity(this.save.player)} mass</b></div></div>
          <div class="market-table">
          <div class="market-row market-head"><span>${t('COMMODITY')}</span><span>${t('PRICE')}</span><span>${t('SUP / DEM')}</span><span>${t('HOLD')}</span><span>${t('ACTIONS')}</span></div>
          ${commodityIds.map((id) => {
                const item = market[id];
                const commodity = COMMODITIES[id];
                const owned = this.save.player.cargo[id] ?? 0;
                return `<div class="market-row ${commodity.legal ? '' : 'restricted'}">
              <span><b>${escapeHtml(t(commodity.name))}</b><small>${escapeHtml(t(commodity.category))} · ${commodity.mass} mass</small></span>
              <span><b>${formatCredits(item.lastPrice)}</b><small>${item.lastPrice < commodity.basePrice * 0.9 ? t('LOW') : item.lastPrice > commodity.basePrice * 1.15 ? t('HIGH') : t('NOMINAL')}</small></span>
              <span><b>${item.supply} / ${item.demand}</b><small>${item.supply > item.demand ? t('SURPLUS') : t('DEMAND')}</small></span>
              <span><b>${owned}</b><small>${t('UNITS')}</small></span>
              <span class="market-actions"><button data-trade="buy:${id}:1">${t('BUY 1')}</button><button data-trade="buy:${id}:5">${t('BUY 5')}</button><button data-trade="sell:${id}:1" ${owned <= 0 ? 'disabled' : ''}>${t('SELL 1')}</button><button data-trade="sell:${id}:999" ${owned <= 0 ? 'disabled' : ''}>${t('SELL ALL')}</button></span>
            </div>`;
            }).join('')}
          </div>
        </div>`;
        }
    }
    missionBadge(mission) {
        return mission.kind === 'bounty' ? t('WARRANT') : mission.kind === 'transport' ? t('EXPRESS') : mission.kind === 'smuggle' ? t('DARK RUN') : t(mission.kind.toUpperCase());
    }
    deadlineLabel(mission) {
        return Number.isFinite(mission.deadline) ? formatDuration(mission.deadline - this.save.world.time) : t('NO DEADLINE');
    }
    renderMissions() {
        const offers = this.save.world.offers[this.dockLocation] ?? [];
        const active = this.save.activeMissions;
        return `
      <div class="mission-layout">
        <section>
          <div class="table-title"><div><span class="eyebrow">${t('CONTRACT TERMINAL')}</span><h3>${t('Available work')}</h3></div><small>${t('Maximum 6 active')}</small></div>
          <div class="mission-grid">
            ${offers.length ? offers.map((mission) => `<article class="mission-card ${mission.kind}">
              <header><span>${this.missionBadge(mission)}</span><b>${formatCredits(mission.reward)}</b></header>
              <h4>${escapeHtml(t(mission.title))}</h4>
              <p>${escapeHtml(t(mission.briefing))}</p>
              <dl><div><dt>${t('ISSUER')}</dt><dd>${escapeHtml(t(mission.issuer))}</dd></div><div><dt>${t('DEADLINE')}</dt><dd>${this.deadlineLabel(mission)}</dd></div><div><dt>${t('BOND')}</dt><dd>${formatCredits(mission.deposit)}</dd></div><div><dt>${t('GUILD REP')}</dt><dd>+${mission.guildRep}</dd></div></dl>
              <button class="primary compact" data-mission-id="${mission.id}">${t('ACCEPT CONTRACT')}</button>
            </article>`).join('') : `<p>${t('No fresh contracts. Launch, trade, or return after the board cycles.')}</p>`}
          </div>
        </section>
        <aside class="active-list"><span class="eyebrow">${t('ACTIVE')}</span>${active.length ? active.map((mission) => `<article><b>${escapeHtml(t(mission.title))}</b><small>${this.deadlineLabel(mission)} · ${formatCredits(mission.reward)}</small></article>`).join('') : `<p>${t('None.')}</p>`}</aside>
      </div>
    `;
    }
    renderServices() {
        const stats = getEffectiveShipStats(this.save.player);
        const repairs = repairCost(this.save.player);
        const refill = refillCost(this.save.player);
        return `
      <div class="service-grid">
        <article class="service-card"><span class="eyebrow">${t('HULL / ARMOR')}</span><h3>${t('Repair bay')}</h3><div class="service-bars"><label>${t('HULL')} <i><b style="width:${percent(this.save.player.hull, stats.hull)}%"></b></i><em>${Math.ceil(this.save.player.hull)}/${stats.hull}</em></label><label>${t('ARMOR')} <i><b style="width:${percent(this.save.player.armor, stats.armor)}%"></b></i><em>${Math.ceil(this.save.player.armor)}/${stats.armor}</em></label></div><p>${t('Replace ablative plate, patch pressure structure, and clear combat faults.')}</p><button class="primary" data-ui-command="repair" ${repairs <= 0 ? 'disabled' : ''}>${t('REPAIR')} · ${formatCredits(repairs)}</button></article>
        <article class="service-card"><span class="eyebrow">${t('CONSUMABLES')}</span><h3>${t('Fuel and ordnance')}</h3><div class="service-bars"><label>${t('FUEL')} <i><b style="width:${percent(this.save.player.fuel, stats.fuel)}%"></b></i><em>${Math.ceil(this.save.player.fuel)}/${stats.fuel}</em></label><label>${t('MISSILES')} <i><b style="width:${percent(this.save.player.missiles, stats.missileCapacity)}%"></b></i><em>${this.save.player.missiles}/${stats.missileCapacity}</em></label></div><p>${t('Refill afterburner propellant and standard seeker missiles.')}</p><button class="primary" data-ui-command="refuel" ${refill <= 0 ? 'disabled' : ''}>${t('REFILL')} · ${formatCredits(refill)}</button></article>
        <article class="service-card danger-service"><span class="eyebrow">${t('INSURANCE NOTE')}</span><h3>${t('Emergency recovery')}</h3><p>${t('A destroyed ship is towed to the last safe dock. The service retains cargo, mission bonds, and a percentage of liquid credit.')}</p><b>${t('FLY WITH A RESERVE.')}</b></article>
      </div>
    `;
    }
    renderEquipment() {
        return `
      <div class="equipment-grid">
        ${equipmentIds.map((id) => {
            const item = EQUIPMENT[id];
            const owned = this.save.player.equipment.includes(id);
            const unlocked = equipmentUnlocked(this.save.player, id);
            return `<article class="equipment-card ${owned ? 'owned' : ''} ${unlocked ? '' : 'locked'}">
            <header><span>${t(item.category.toUpperCase())}</span><b>${owned ? t('INSTALLED') : formatCredits(item.price)}</b></header>
            <h3>${escapeHtml(t(item.name))}</h3><p>${escapeHtml(t(item.description))}</p><strong>${escapeHtml(t(item.stat))}</strong>
            ${item.requiredGuild ? `<small>${t('Requires {guild} rank {rank}', { guild: t(GUILD_NAMES[item.requiredGuild]), rank: item.requiredRank })}</small>` : `<small>${t('Open market equipment')}</small>`}
            <button data-equipment-id="${id}" ${owned || !unlocked ? 'disabled' : ''}>${owned ? t('INSTALLED') : unlocked ? t('PURCHASE / INSTALL') : t('GUILD LOCKED')}</button>
          </article>`;
        }).join('')}
      </div>
    `;
    }
    renderShipyard() {
        const stockIds = LOCATIONS[this.dockLocation].shipsForSale ?? [];
        if (this.shipDetailId && stockIds.includes(this.shipDetailId))
            return this.renderShipDetail(this.shipDetailId);
        this.shipDetailId = undefined;
        if (!stockIds.length)
            return `<div class="shipyard-grid"><p class="market-empty">${t('No hulls for sale at this port.')}</p></div>`;
        return `<div class="shipyard-grid">${stockIds.map((shipId) => this.renderShipOverview(shipId)).join('')}</div>`;
    }
    renderShipOverview(saleId) {
        const ship = SHIPS[saleId];
        const owned = this.save.player.ownedShips.includes(saleId);
        const active = this.save.player.shipId === saleId;
        return `
      <article class="ship-card ship-overview ${active ? 'active' : ''}" data-ship-detail="${saleId}" role="button" tabindex="0" aria-label="${t('View {name} details', { name: ship.name })}">
        <div class="ship-silhouette ${saleId}" data-variant="${ship.variant}"></div>
        <header><span>${escapeHtml(t(ship.className))}</span><b>${formatCredits(ship.price)}</b></header>
        <h3>${escapeHtml(ship.name)}</h3>
        <p class="ship-personality">${escapeHtml(t(ship.personality ?? ''))}</p>
        <div class="ship-overview-meta"><span>${active ? t('ACTIVE SHIP') : owned ? t('IN YOUR FLEET') : t('FOR SALE')}</span><b>${t('DETAILS')} ▸</b></div>
      </article>
    `;
    }
    renderShipDetail(saleId) {
        return `
      <div class="shipyard-detail">
        <button class="ship-detail-back" data-ship-detail-back="1">◀ ${t('ALL HULLS')}</button>
        ${this.renderShipCard(saleId)}
      </div>
    `;
    }
    renderShipCard(saleId) {
        const ship = SHIPS[saleId];
        const current = SHIPS[this.save.player.shipId] ?? SHIPS.wayfarer;
        const owned = this.save.player.ownedShips.includes(saleId);
        const active = this.save.player.shipId === saleId;
        const speedDelta = displaySpeed(ship.maxSpeed) - displaySpeed(current.maxSpeed);
        const turnDelta = ship.angularAcceleration - current.angularAcceleration;
        return `
      <article class="ship-card ship-detail ${active ? 'active' : ''}">
        <div class="ship-silhouette ship-silhouette-large ${saleId}" data-variant="${ship.variant}" aria-label="${t('Rotating 3D preview of the {name}', { name: ship.name })}"></div>
        <header><span>${escapeHtml(t(ship.className))}</span><b>${formatCredits(ship.price)}</b></header>
        <h3>${escapeHtml(ship.name)}</h3>
        <p class="ship-personality">${escapeHtml(t(ship.personality ?? ''))}</p>
        <p>${escapeHtml(t(ship.description))}</p>
        <dl><div><dt>${t('SPEED')}</dt><dd>${displaySpeed(ship.maxSpeed)} ${this.statDelta(speedDelta)}</dd></div><div><dt>${t('SHIELD')}</dt><dd>${ship.shield} ${this.statDelta(ship.shield - current.shield)}</dd></div><div><dt>${t('ARMOR')}</dt><dd>${ship.armor} ${this.statDelta(ship.armor - current.armor)}</dd></div><div><dt>${t('CARGO')}</dt><dd>${ship.cargo} ${this.statDelta(ship.cargo - current.cargo)}</dd></div><div><dt>${t('MISSILES')}</dt><dd>${ship.missileCapacity} ${this.statDelta(ship.missileCapacity - current.missileCapacity)}</dd></div><div><dt>${t('GUN')}</dt><dd>${ship.gunDamage} ${this.statDelta(ship.gunDamage - current.gunDamage)}</dd></div><div><dt>${t('TURN')}</dt><dd>${ship.angularAcceleration.toFixed(2)} ${this.statDelta(turnDelta, 2)}</dd></div><div><dt>${t('ACCL')}</dt><dd>${ship.acceleration} ${this.statDelta(ship.acceleration - current.acceleration)}</dd></div></dl>
        <p class="ship-handling-note">${t('Handling falls up to 24% as the cargo hold fills.')}</p>
        ${active ? `<button disabled>${t('ACTIVE SHIP')}</button>` : owned ? `<button data-switch-ship="${saleId}">${t('SWITCH TO SHIP')}</button>` : `<button class="primary" data-ship-id="${saleId}">${t('PURCHASE HULL')}</button>`}
      </article>
    `;
    }
    statDelta(delta, digits = 0) {
        const rounded = Number(delta.toFixed(digits));
        const cls = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'even';
        const label = rounded > 0 ? `+${rounded}` : rounded < 0 ? `−${Math.abs(rounded)}` : '0';
        return `<b class="stat-delta ${cls}">${label}</b>`;
    }
    mountShipPreviews() {
        this.root.querySelectorAll('.ship-silhouette[data-variant]').forEach((container) => {
            if (container.querySelector('.ship-preview-canvas'))
                return;
            const variant = container.dataset.variant;
            this.shipPreviews.push(new ShipPreview(container, variant));
        });
    }
    disposeShipPreviews() {
        this.shipPreviews.forEach((preview) => preview.dispose());
        this.shipPreviews.length = 0;
    }
    renderGuilds() {
        return `
      <div class="guild-grid">
        ${Object.keys(GUILD_NAMES).map((id) => {
            const rep = this.save.player.guildRep[id];
            const rank = this.save.player.guildRank[id];
            const joined = rep > 0;
            const nextThreshold = [20, 65, 145, 145][rank];
            return `<article class="guild-card guild-${id}">
            <span class="eyebrow">${escapeHtml(t(GUILD_NAMES[id]))}</span>
            <h3>${t(GUILD_RANK_NAMES[id][rank])}</h3>
            <div class="guild-meter"><i><b style="width:${rank >= 3 ? 100 : Math.min(100, (rep / nextThreshold) * 100)}%"></b></i><em>${rep} REP</em></div>
            <p>${id === 'merchant' ? t('Better route intelligence, cargo contracts, and external hold equipment.') : id === 'bounty' ? t('Higher-value warrants, combat equipment, and recognized kill authentication.') : id === 'mining' ? t('Survey claims, rich deposit data, and advanced extraction lances.') : id === 'syndicate' ? t('Dark-goods contracts, untraceable den prices, and the local fixer\'s favor.') : t('Protected recovery claims, rare wreck data, and long-range tractor systems.')}</p>
            <button data-guild-id="${id}" ${joined ? 'disabled' : ''}>${joined ? t('MEMBERSHIP ACTIVE') : t('REGISTER')}</button>
            ${id === 'bounty' ? this.renderBountyRegistry() : ''}
          </article>`;
        }).join('')}
      </div>
    `;
    }
    renderBountyRegistry() {
        // The cleared-warrant registry: every callsign the player has taken down,
        // newest first, with the pinned profile so the board remembers what each
        // name meant to fight. Ace warrants paid bonus rep when they fell.
        const entries = Object.entries(this.save.world.registry ?? {})
            .sort((a, b) => (b[1].clearedAt ?? 0) - (a[1].clearedAt ?? 0))
            .slice(0, 6);
        return `
      <div class="registry-list">
        <span class="eyebrow">${t('CONFIRMED CALLSIGNS')}</span>
        ${entries.length ? entries.map(([callsign, entry]) => `
          <div class="registry-row"><b>${escapeHtml(callsign)}</b><small>${entry.tier ? `${t(TIER_LABELS[entry.tier] ?? entry.tier)} ${t(TEMPERAMENT_LABELS[entry.temperament] ?? entry.temperament)}` : t('Unnamed target')}${entry.count > 1 ? ` ×${entry.count}` : ''}</small></div>`).join('')
        : `<p class="registry-empty">${t('No confirmed kills. The board remembers the names you clear.')}</p>`}
      </div>
    `;
    }
    portraitImage(personId, personName) {
        return `<img class="avatar" src="./art/portraits/${escapeHtml(personId)}.webp" alt="${t('Pixel portrait of {name}', { name: personName })}" draggable="false">`;
    }

    locationIllustration(locationId, screen = 'concourse') {
        const location = LOCATIONS[locationId];
        const file = screen === 'bar'
            ? `bar-${locationId}`
            : screen === 'market'
                ? `market-${locationId}`
                : locationId;
        const illustrationFile = locationId === 'vesper' && screen === 'bar'
            ? 'bar-vesper-hd-v1'
            : locationId === 'vesper' && screen === 'market'
                ? 'market-vesper-hd-v1'
                : locationId === 'azure' && screen === 'concourse'
                    ? 'azure-hd-v1'
                : locationId === 'azure' && screen === 'bar'
                    ? 'bar-azure-hd-v1'
                : locationId === 'azure' && screen === 'market'
                    ? 'market-azure-hd-v1'
                : locationId === 'helix' && screen === 'concourse'
                    ? 'helix-hd-v1'
                : locationId === 'helix' && screen === 'bar'
                    ? 'bar-helix-hd-v1'
                : locationId === 'helix' && screen === 'market'
                    ? 'market-helix-hd-v1'
                : locationId === 'rook' && screen === 'concourse'
                    ? 'rook-hd-v1'
                : locationId === 'rook' && screen === 'bar'
                    ? 'bar-rook-hd-v1'
                : locationId === 'rook' && screen === 'market'
                    ? 'market-rook-hd-v1'
                : VESPER_HOVER_PREVIEW && locationId === 'vesper' && screen === 'concourse'
                    ? 'vesper-preview'
                    : file;
        const label = screen === 'bar'
            ? t('{name} bar', { name: location.name })
            : screen === 'market'
                ? t('{name} market', { name: location.name })
                : location.name;
        const artDescription = illustrationFile.endsWith('-hd-v1') || illustrationFile === 'vesper-preview'
            ? t('HD view')
            : t('Pixel-art view');
        return `<img src="./art/locations/v3/${illustrationFile}.png" alt="${artDescription} of ${escapeHtml(label)}" draggable="false">`;
    }
    updateHud(model) {
        this.lastHud = model;
        this.setCockpitShip(model.shipId);
        const setText = (selector, value) => {
            const element = this.el(selector);
            if (element)
                element.textContent = value;
        };
        const setBar = (selector, value) => {
            const element = this.el(selector);
            if (element)
                element.style.width = `${Math.max(0, Math.min(100, value))}%`;
        };
        // The VOIDRUNNER identity card doubles as the hyperdrive control: it
        // glows when a jump is clear, and carries the charge/cruise/interrupt
        // status while the drive is live.
        const card = this.el('#hyperdrive-card');
        const cardStatus = this.el('#hyperdrive-card-status');
        if (card && cardStatus) {
            const state = model.hyperdrive?.fx ?? 'none';
            const progress = Math.max(0, Math.min(1, model.hyperdrive?.progress ?? 0));
            let status = '';
            if (state === 'spooling')
                status = t('CHARGING {percent}%', { percent: Math.round(progress * 100) });
            else if (state === 'active')
                status = t('ENGAGED');
            else if (state === 'interrupt')
                status = t('INTERRUPTED');
            else if (model.hyperdriveStatus)
                status = t(model.hyperdriveStatus);
            // No COOLDOWN state: the post-intercept calm window only suppresses
            // new ambushes, never the drive, so the card has nothing to count.
            cardStatus.textContent = status;
            cardStatus.classList.toggle('is-hidden', !status);
            card.dataset.hyperdriveReady = model.hyperdriveReady ? 'true' : 'false';
        }
        // Monitor tickers: the own-ship flight recorder and the radar sensor
        // log replace the in-flight toast stack. Each shows the newest entry
        // whose display window is still open, colored by its tone.
        const renderTicker = (selector, entry) => {
            const ticker = this.el(selector);
            if (!ticker)
                return;
            // The message rides an inner span so ellipsis truncation works:
            // text-overflow only applies to block-level inline content, not
            // to flex items — a bare text node in the flex ticker would just
            // hard-clip at the row edge. The full text lives in the ship
            // menu's RECENT EVENTS.
            let line = ticker.querySelector('.ticker-line');
            if (!line) {
                line = document.createElement('span');
                line.className = 'ticker-line';
                ticker.appendChild(line);
            }
            line.textContent = entry?.message ?? '';
            ticker.dataset.tone = entry?.tone ?? 'info';
            ticker.classList.toggle('is-visible', Boolean(entry));
        };
        renderTicker('#screen-event-ticker', this.currentEntry(this.recentEvents));
        // The patrol reply chip: visible while a cordon pilot is still waiting
        // for the courtesy, with the window ticking down.
        const patrolReply = this.el('#patrol-reply-chip');
        if (patrolReply) {
            patrolReply.classList.toggle('is-hidden', !model.patrolReply);
            if (model.patrolReply) {
                const timer = this.el('#patrol-reply-timer');
                if (timer)
                    timer.textContent = String(model.patrolReply.seconds);
            }
        }
        // Weapon readout on the own-ship monitor: mounted gun name plus its
        // ammo pool (∞ for energy/heat weapons), amber while the PDC vents.
        const weaponReadout = this.el('#screen-own-weapon');
        if (weaponReadout) {
            const weapon = model.weapon;
            weaponReadout.classList.toggle('is-visible', Boolean(weapon));
            weaponReadout.dataset.venting = weapon?.venting ? 'true' : 'false';
            if (weapon) {
                setText('#screen-own-weapon-name', weapon.name);
                setText('#screen-own-weapon-ammo', weapon.ammo
                    ? `${weapon.ammo.current}/${weapon.ammo.capacity}`
                    : weapon.venting ? t('VENTING') : '∞');
            }
        }
        // Race strip: compact circuit telemetry on the own-ship monitor while
        // an entry is live — travel leg, grid countdown, or gate/rank/clock.
        const raceStrip = this.el('#screen-race-strip');
        if (raceStrip) {
            const race = model.race;
            raceStrip.classList.toggle('is-visible', Boolean(race));
            raceStrip.dataset.phase = race?.phase ?? '';
            if (race) {
                const label = this.el('#screen-race-label');
                const value = this.el('#screen-race-value');
                const clock = (seconds) => {
                    const total = Math.max(0, Math.floor(seconds));
                    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
                };
                if (label && value) {
                    if (race.phase === 'travel') {
                        label.textContent = t('{course} · TO GATE 1', { course: race.title.toUpperCase() });
                        value.textContent = `${Math.round(race.distance).toLocaleString('en-US')} km`;
                    }
                    else if (race.phase === 'countdown') {
                        label.textContent = t('{course} · GRID', { course: race.title.toUpperCase() });
                        value.textContent = t('T-{seconds}', { seconds: race.seconds });
                    }
                    else {
                        label.textContent = t('{course} · GATE {current}/{total}', { course: race.title.toUpperCase(), current: race.gate, total: race.gateCount });
                        value.textContent = `${race.rankLabel} · ${clock(race.time)}`;
                    }
                }
            }
        }
        setText('#hud-zone', model.zone.toUpperCase());
        setText('#hud-mode', model.mode.toUpperCase());
        setText('#screen-own-speed', Math.round(model.speed).toString());
        setText('#screen-own-max-speed', `/${Math.round(model.maxSpeed)}`);
        setText('#screen-own-fuel', Math.round((model.fuel / model.maxFuel) * 100).toString());
        const cargoValue = this.el('#screen-own-cargo');
        const cargoCap = this.el('#screen-own-cargo-cap');
        if (cargoValue && cargoCap) {
            if (model.ownMonitorStatus) {
                // A transient HOLD message (e.g. CARGO FULL on a pickup attempt)
                // flashes in place of the mass readout for the status duration.
                cargoValue.textContent = model.ownMonitorStatus;
                cargoValue.classList.add('is-alert');
                cargoCap.textContent = '';
            }
            else {
                cargoValue.textContent = (model.cargo ?? 0).toFixed(1);
                cargoValue.classList.toggle('is-full', (model.loadPercent ?? 0) >= 100);
                cargoValue.classList.remove('is-alert');
                cargoCap.textContent = `/${model.cargoCapacity ?? 0}`;
            }
        }
        setText('#own-ship-name', model.shipName.toUpperCase());
        const standoff = this.el('#screen-standoff');
        if (standoff) {
            standoff.classList.toggle('is-visible', Boolean(model.standoff));
            if (model.standoff) {
                const demand = this.el('#screen-standoff-demand');
                const timer = this.el('#screen-standoff-timer');
                if (demand)
                    demand.textContent = model.standoff.kind === 'credits' ? t('PAY {label}', { label: model.standoff.label }) : t('DROP {label}', { label: model.standoff.label });
                if (timer)
                    timer.textContent = String(model.standoff.seconds);
            }
        }
        this.drawRadar(model.contacts, model.radarRings, model.searchRings, model.radarWarp);
        const transponderChip = this.el('#screen-radar-transponder');
        if (transponderChip) {
            // The radar heading is the transponder toggle: it reads its own
            // state — broadcasting (transponder ON, or a dark ship lit up by
            // its own extraction beam) vs dark — and is the mobile tap target.
            transponderChip.textContent = model.broadcasting ? t('TRANSPONDER ON') : t('TRANSPONDER OFF');
            transponderChip.classList.toggle('is-dark', !model.broadcasting);
            transponderChip.title = model.broadcasting
                ? t('Visible to sensors at full range{note}', { note: model.transponder ? t(' · press B to go dark') : t(' · the extraction beam is broadcasting') })
                : t('Dark to sensors beyond 200 km · press B to transmit');
        }
        setText('#screen-own-shield-value', Math.ceil(model.shield).toString());
        setText('#screen-own-armor-value', Math.ceil(model.armor).toString());
        setText('#screen-own-hull-value', Math.ceil(model.hull).toString());
        setBar('#screen-own-shield', percent(model.shield, model.maxShield));
        setBar('#screen-own-armor', percent(model.armor, model.maxArmor));
        setBar('#screen-own-hull', percent(model.hull, model.maxHull));
        this.updateTarget(model.target, model.mode);
        const targetReadout = this.el('#screen-target-readout');
        if (targetReadout) {
            // Transient monitor alerts win, then the slow-down call for an
            // approach — the landing/docking prompt lives on the target
            // monitor's readout, not the radar zone line.
            targetReadout.classList.toggle('is-alert', Boolean(model.monitorStatus));
            targetReadout.classList.toggle('is-dock-prompt', Boolean(model.dockPrompt && !model.monitorStatus));
            if (model.monitorStatus)
                targetReadout.textContent = model.monitorStatus;
            else if (model.dockPrompt)
                targetReadout.textContent = model.dockPrompt;
        }
        this.drawHullOutline(this.ownHullCanvas, model.playerVariant ?? 'kestrel', 0, 'rgba(111, 216, 236, 0.9)', false, model.missiles, model.maxMissiles);
        const throttleThumb = this.el('[data-touch-throttle-thumb]');
        const throttleFill = this.el('.touch-throttle-fill');
        if (throttleThumb)
            throttleThumb.style.bottom = `${model.throttle * 100}%`;
        if (throttleFill)
            throttleFill.style.height = `${model.throttle * 100}%`;
    }
    updateTarget(target, mode = this.lastHud?.mode ?? 'combat') {
        const bracket = this.el('#target-bracket');
        const edgePointer = this.el('#target-edge-pointer');
        // The target monitor carries the lock (name, bars, distance) — the old
        // top-right target panel was redundant with it and is gone.
        if (!target) {
            this.el('#screen-target-distance').textContent = '—';
            this.el('#screen-target-readout').textContent = '—';
            this.setTargetScreenValue(undefined);
            this.updateWeaponButtons(undefined, mode);
            this.targetLayout?.classList.remove('is-clip-flash');
            bracket?.classList.add('is-hidden');
            bracket?.classList.remove('is-hostile', 'is-surrendered');
            edgePointer?.classList.add('is-hidden');
            edgePointer?.classList.remove('is-hostile', 'is-surrendered');
            return;
        }
        const hostile = target.kind === 'ship' && target.hostile;
        const surrendered = target.kind === 'ship' && target.surrendered;
        bracket?.classList.toggle('is-hostile', hostile);
        bracket?.classList.toggle('is-surrendered', surrendered && !hostile);
        edgePointer?.classList.toggle('is-hostile', hostile);
        edgePointer?.classList.toggle('is-surrendered', surrendered && !hostile);
        this.el('#screen-target-distance').textContent = `${Math.round(target.distance).toLocaleString('en-US')} km`;
        this.el('#screen-target-readout').textContent = target.readout ?? '—';
        this.setTargetScreenValue(target);
        this.updateWeaponButtons(target, mode);
        // A clipped NPC flashes its outline on the target monitor for a beat.
        this.targetLayout?.classList.toggle('is-clip-flash', Boolean(target.clipFlash));
        if (bracket && target.onScreen && target.screenX !== undefined && target.screenY !== undefined) {
            bracket.style.transform = `translate(${target.screenX}px, ${target.screenY}px)`;
            bracket.classList.remove('is-hidden');
        }
        else {
            bracket?.classList.add('is-hidden');
        }
        if (target.edge && edgePointer) {
            edgePointer.style.transform = `translate(${target.edge.x}px, ${target.edge.y}px)`;
            const arm = edgePointer.querySelector('i');
            if (arm)
                arm.style.transform = `rotate(${target.edge.angleDeg}deg)`;
            const label = edgePointer.querySelector('span');
            if (label)
                label.textContent = `${Math.round(target.distance)} km`;
            edgePointer.classList.remove('is-hidden');
        }
        else {
            edgePointer?.classList.add('is-hidden');
        }
    }
    updateWeaponButtons(target, mode = this.lastHud?.mode ?? 'combat') {
        const fire = this.el('#touch-fire');
        const missile = this.el('#touch-missile');
        if (!fire || !missile)
            return;
        // Keep the old kind-string shorthand working for debug probes and
        // lightweight callers; normal HUD updates pass the full target model.
        const kindString = typeof target === 'string';
        const kind = kindString ? target : target?.kind;
        const contextualMode = kindString
            ? kind === 'asteroid' ? 'mining' : kind === 'wreck' ? 'salvage' : mode
            : mode;
        const mining = kind === 'asteroid' && contextualMode === 'mining';
        const salvage = kind === 'wreck' && contextualMode === 'salvage';
        const utility = mining || salvage;
        const surrendered = kind === 'ship' && Boolean(target.surrendered) && !target.captured;
        const capture = surrendered && Boolean(target.captureAvailable);
        fire.classList.toggle('is-mining', mining);
        fire.classList.toggle('is-salvage', salvage);
        fire.classList.toggle('is-surrendered', surrendered);
        missile.classList.toggle('is-scan', utility);
        missile.classList.toggle('is-capture', surrendered);
        fire.dataset.touchAction = utility ? 'utility' : 'fire';
        missile.dataset.touchAction = utility ? 'scan' : surrendered ? 'capture' : 'missile';
        // FIRE becomes the held mining/salvage beam for resource contacts. The
        // smaller pad scans deposits with a tap, or handles missiles/capture
        // against ordinary and surrendered ships.
        missile.disabled = surrendered && !capture;
        const showIcon = (button, name) => {
            for (const icon of button.querySelectorAll('svg'))
                icon.classList.toggle('is-hidden', icon.dataset.icon !== name);
        };
        showIcon(fire, mining ? 'mine' : salvage ? 'salvage' : 'fire');
        showIcon(missile, utility ? 'scan' : capture || surrendered ? 'capture' : 'missile');
        fire.setAttribute('aria-label', mining ? t('Mine — hold') : salvage ? t('Salvage — hold') : t('Fire — hold'));
        missile.setAttribute('aria-label', utility
            ? t('Scan — tap')
                : capture
                    ? t('Capture surrendered pilot')
                    : surrendered
                    ? target.captureClaimable === false ? t('Capture unavailable — no claim') : t('Capture unavailable — approach target')
                    : t('Missile'));
    }
    setTargetScreenValue(target) {
        const setText = (selector, value) => {
            const element = this.el(selector);
            if (element)
                element.textContent = value;
        };
        const setBar = (selector, value) => {
            const element = this.el(selector);
            if (element)
                element.style.width = `${Math.max(0, Math.min(100, value))}%`;
        };
        const clearHull = () => {
            const canvas = this.targetHullCanvas;
            if (canvas)
                canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        };
        const isShip = Boolean(target && target.kind === 'ship');
        // Ships show shield/armor/hull bars; stations, planets, asteroids and wrecks
        // are invulnerable, so the target monitor shows only their outline.
        this.targetLayout?.classList.toggle('no-bars', !isShip);
        if (!target) {
            setText('#screen-target-name', t('NO LOCK'));
            setText('#screen-target-shield-value', '—');
            setText('#screen-target-armor-value', '—');
            setText('#screen-target-hull-value', '—');
            setBar('#screen-target-shield', 0);
            setBar('#screen-target-armor', 0);
            setBar('#screen-target-hull', 0);
            clearHull();
            return;
        }
        setText('#screen-target-name', target.name.toUpperCase());
        setText('#screen-target-shield-value', isShip ? Math.ceil(target.shield ?? 0).toString() : '—');
        setText('#screen-target-armor-value', isShip ? Math.ceil(target.armor ?? 0).toString() : '—');
        setText('#screen-target-hull-value', isShip ? Math.ceil(target.hull ?? 0).toString() : '—');
        setBar('#screen-target-shield', percent(target.shield ?? 0, target.maxShield ?? 0));
        setBar('#screen-target-armor', percent(target.armor ?? 0, target.maxArmor ?? 0));
        setBar('#screen-target-hull', percent(target.hull ?? 0, target.maxHull ?? 0));
        if (isShip) {
            this.drawHullOutline(this.targetHullCanvas, target.variant ?? 'kestrel', target.heading ?? 0, 'rgba(255, 192, 70, 0.92)', Boolean(target.hostile));
        }
        else {
            this.drawObjectOutline(this.targetHullCanvas, target.objectKind ?? target.kind);
        }
    }
    drawObjectOutline(canvas, kind, accent = 'rgba(255, 192, 70, 0.92)') {
        if (!canvas)
            return;
        const ctx = canvas.getContext('2d');
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const cssW = canvas.clientWidth || 150;
        const cssH = canvas.clientHeight || 110;
        const width = Math.max(60, Math.floor(cssW * ratio));
        const height = Math.max(60, Math.floor(cssH * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        ctx.clearRect(0, 0, width, height);
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.min(width, height) * 0.32;
        ctx.strokeStyle = accent;
        ctx.fillStyle = accent;
        ctx.lineWidth = Math.max(1, ratio);
        if (kind === 'planet') {
            ctx.fillStyle = 'rgba(255, 192, 70, 0.14)';
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - r, cy);
            ctx.lineTo(cx + r, cy);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(cx, cy, r * 1.55, r * 0.42, -0.4, 0, Math.PI * 2);
            ctx.stroke();
        }
        else if (kind === 'station') {
            const n = 6;
            ctx.beginPath();
            for (let i = 0; i < n; i += 1) {
                const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                const x = cx + Math.cos(a) * r;
                const y = cy + Math.sin(a) * r;
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 3; i += 1) {
                const a = (i / 3) * Math.PI - Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
            ctx.fill();
        }
        else if (kind === 'asteroid') {
            const factors = [1.0, 0.66, 0.9, 0.72, 1.02, 0.8, 0.62, 0.94];
            const points = factors.map((f, i) => {
                const a = (i / factors.length) * Math.PI * 2;
                return [cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f];
            });
            ctx.fillStyle = 'rgba(255, 192, 70, 0.14)';
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i += 1)
                ctx.lineTo(points[i][0], points[i][1]);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i += 1)
                ctx.lineTo(points[i][0], points[i][1]);
            ctx.closePath();
            ctx.stroke();
            for (const [dx, dy, cr] of [[-0.3, -0.15, 0.14], [0.2, 0.25, 0.1], [0.05, -0.32, 0.08]]) {
                ctx.beginPath();
                ctx.arc(cx + r * dx, cy + r * dy, r * cr, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        else {
            for (const [dx, dy, w, h, rot] of [[-0.4, 0.12, 0.5, 0.16, 0.5], [0.26, -0.26, 0.34, 0.12, -0.4], [0.05, 0.34, 0.2, 0.2, 0.1]]) {
                ctx.save();
                ctx.translate(cx + r * dx, cy + r * dy);
                ctx.rotate(rot);
                ctx.fillStyle = 'rgba(255, 192, 70, 0.14)';
                ctx.fillRect((-r * w) / 2, (-r * h) / 2, r * w, r * h);
                ctx.fillStyle = accent;
                ctx.strokeRect((-r * w) / 2, (-r * h) / 2, r * w, r * h);
                ctx.restore();
            }
        }
    }
    drawHullOutline(canvas, variant, heading = 0, accent = 'rgba(111, 216, 236, 0.9)', hostile = false, missiles = 0, missileCapacity = 0) {
        if (!canvas)
            return;
        const ctx = canvas.getContext('2d');
        const profile = shipTopDownProfile(variant ?? 'kestrel');
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const cssW = canvas.clientWidth || 150;
        const cssH = canvas.clientHeight || 110;
        const width = Math.max(60, Math.floor(cssW * ratio));
        const height = Math.max(60, Math.floor(cssH * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        ctx.clearRect(0, 0, width, height);
        const cx = width / 2;
        const cy = height / 2;
        const centerX = (profile.minX + profile.maxX) / 2;
        const centerZ = (profile.minZ + profile.maxZ) / 2;
        const gridW = profile.maxX - profile.minX + 1;
        const gridH = profile.maxZ - profile.minZ + 1;
        const scale = Math.min((width * 0.8) / gridW, (height * 0.8) / gridH);
        ctx.save();
        ctx.translate(cx, cy);
        // Guard against NaN/Inf from a transiently bad target orientation so the
        // transform can never corrupt the whole canvas.
        ctx.rotate(Number.isFinite(heading) ? heading : 0);
        const mapX = (x) => (x - centerX) * scale;
        const mapZ = (z) => (z - centerZ) * scale;
        ctx.fillStyle = hostile ? 'rgba(255, 86, 78, 0.18)' : 'rgba(111, 216, 236, 0.15)';
        for (const [x, z] of profile.cells)
            ctx.fillRect(mapX(x), mapZ(z), scale * 0.96, scale * 0.96);
        ctx.strokeStyle = hostile ? 'rgba(255, 92, 84, 0.95)' : accent;
        ctx.lineWidth = Math.max(1, ratio);
        ctx.beginPath();
        for (const [x1, z1, x2, z2] of profile.edges) {
            ctx.moveTo(mapX(x1), mapZ(z1));
            ctx.lineTo(mapX(x2), mapZ(z2));
        }
        ctx.stroke();
        // Nose chevron marking the ship's forward (-Z) direction.
        const frontCells = profile.cells.filter((cell) => cell[1] === profile.minZ);
        const noseX = frontCells.length ? frontCells.reduce((sum, cell) => sum + cell[0], 0) / frontCells.length : 0;
        const noseY = mapZ(profile.minZ) - scale * 0.6;
        ctx.fillStyle = hostile ? 'rgba(255, 92, 84, 0.95)' : accent;
        ctx.beginPath();
        ctx.moveTo(mapX(noseX), noseY - scale * 1.6);
        ctx.lineTo(mapX(noseX) - scale * 0.9, noseY);
        ctx.lineTo(mapX(noseX) + scale * 0.9, noseY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // Missile rack: one missile dart per ordnance slot, flanking the hull
        // like hardpoints — two up the port side, two up the starboard, nose
        // toward the bow (the hull points up). Filled gold for rounds on
        // board, a dim empty outline for spent slots. Replaces the old MSL
        // text cell (and the earlier diamond pips).
        if (missileCapacity > 0) {
            // Sized off the canvas, not the hull-cell scale: narrow long hulls
            // (29x44 cells) would shrink the darts to sub-pixel dots.
            const ms = Math.max(4, Math.min(width, height) * 0.055);
            const halfW = ms * 0.55;
            const finW = ms * 0.35;
            const tip = -ms * 1.2;
            const noseBase = -ms * 0.45;
            const bodyBottom = ms * 0.55;
            const finY = ms * 1.15;
            const drawMissile = (x, y, aboard) => {
                ctx.beginPath();
                ctx.moveTo(x, y + tip);
                ctx.lineTo(x + halfW, y + noseBase);
                ctx.lineTo(x + halfW, y + bodyBottom);
                ctx.lineTo(x + halfW + finW, y + finY);
                ctx.lineTo(x + halfW * 0.45, y + bodyBottom);
                ctx.lineTo(x - halfW * 0.45, y + bodyBottom);
                ctx.lineTo(x - halfW - finW, y + finY);
                ctx.lineTo(x - halfW, y + bodyBottom);
                ctx.lineTo(x - halfW, y + noseBase);
                ctx.closePath();
                if (aboard) {
                    ctx.fillStyle = 'rgba(255, 192, 70, 0.92)';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 210, 110, 0.9)';
                }
                else {
                    ctx.fillStyle = 'rgba(2, 8, 24, 0.9)';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(125, 150, 170, 0.45)';
                }
                ctx.stroke();
            };
            const hullHalf = (gridW / 2) * scale;
            const sideOffset = Math.min(Math.max(hullHalf + ms * 0.9 + 3, ms * 1.4), width / 2 - halfW - finW - 2);
            const leftCount = Math.ceil(missileCapacity / 2);
            const step = ms * 2.35 + ms * 0.8;
            const stackTop = (count) => cy - (count * step - ms * 0.8) / 2;
            ctx.lineWidth = Math.max(1, ratio * 0.9);
            for (let i = 0; i < missileCapacity; i += 1) {
                const left = i < leftCount;
                const index = left ? i : i - leftCount;
                const count = left ? leftCount : missileCapacity - leftCount;
                drawMissile(left ? cx - sideOffset : cx + sideOffset, stackTop(count) + index * step + ms * 1.175, i < missiles);
            }
        }
    }
    drawRadar(contacts, rings, searchRings = [], warpCombat = 0.2) {
        const canvas = this.radarContext.canvas;
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(150, Math.floor(rect.width * ratio));
        const height = Math.max(150, Math.floor(rect.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        const ctx = this.radarContext;
        const cx = width / 2;
        const cy = height / 2;
        const radius = Math.min(width, height) * 0.44;
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = Math.max(1, ratio);
        // Calibrated range rings as fractions of the outer ring (radarRange):
        // the mid ring marks scan range and the warm inner ring marks the
        // dark-detection line — the "invisible past here" threshold. The scan
        // ring renders at 0.7 of the disc (see radarWarpFraction) so the
        // near/scan band owns most of the glass.
        const ringFractions = rings && rings.length === 3 ? rings : [0.2, 0.5, 1];
        const scanFraction = ringFractions[1] ?? 0.5;
        const combat = Math.min(0.35, Math.max(0.05, warpCombat));
        const warp = (fraction) => radarWarpFraction(fraction, combat, scanFraction);
        const warpPoint = (x, y) => {
            const r = Math.hypot(x, y);
            if (r <= 0)
                return [x, y];
            const scale = warp(r) / r;
            return [x * scale, y * scale];
        };
        for (let index = 0; index < ringFractions.length; index += 1) {
            // When the pilot broadcasts, the dark-visibility ring merges with
            // the horizon (full signature) — skip it so only the scan ring and
            // the outer ring (plus the cross-hair) remain.
            if (ringFractions[index] >= 0.98)
                continue;
            ctx.strokeStyle = index === 0 ? 'rgba(224, 186, 104, .3)' : 'rgba(115, 203, 185, .35)';
            ctx.beginPath();
            ctx.arc(0, 0, radius * warp(ringFractions[index]), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(115, 203, 185, .35)';
        ctx.beginPath();
        ctx.moveTo(-radius, 0);
        ctx.lineTo(radius, 0);
        ctx.moveTo(0, -radius);
        ctx.lineTo(0, radius);
        ctx.stroke();
        ctx.fillStyle = '#e0ba68';
        ctx.beginPath();
        ctx.moveTo(0, -7 * ratio);
        ctx.lineTo(-5 * ratio, 5 * ratio);
        ctx.lineTo(5 * ratio, 5 * ratio);
        ctx.closePath();
        ctx.fill();
        const now = performance.now();
        // Active searches: a dashed ring at the last-known-position anchor,
        // scaled to the sweep radius — blue for a Concord patrol, red for a
        // hostile — so a hunt near the pilot shows on the disc, not just as a
        // sensor-log note. The ring pulses slowly so it reads as a live sweep,
        // and a small cross marks the anchor. Drawn before the contact blips so
        // they stay on top.
        const sweepPulse = 0.65 + 0.35 * Math.sin(now / 260);
        for (const ring of searchRings) {
            const [wx, wy] = warpPoint(ring.x, ring.y);
            const x = wx * radius;
            const y = wy * radius;
            const r = Math.max(3 * ratio, warp(ring.fraction) * radius);
            const stroke = ring.color === 'red' ? 'rgba(255, 90, 67, 0.9)' : 'rgba(108, 200, 228, 0.9)';
            ctx.globalAlpha = sweepPulse;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = Math.max(1.6, 1.8 * ratio);
            ctx.setLineDash([7 * ratio, 5 * ratio]);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = ring.color === 'red' ? 'rgba(255, 90, 67, 0.65)' : 'rgba(108, 200, 228, 0.65)';
            ctx.lineWidth = Math.max(1, ratio);
            const cross = Math.max(3 * ratio, r * 0.12);
            ctx.beginPath();
            ctx.moveTo(x - cross, y);
            ctx.lineTo(x + cross, y);
            ctx.moveTo(x, y - cross);
            ctx.lineTo(x, y + cross);
            ctx.stroke();
            // A search clamped in from past the horizon carries its distance,
            // tucked just inside the ring toward the disc center.
            if (ring.beyond) {
                ctx.fillStyle = ring.color === 'red' ? '#ff9a7a' : '#a8e2f2';
                ctx.font = `${Math.max(8, Math.floor(8.5 * ratio))}px ui-monospace, monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${ring.distance}`, x * 0.8, y * 0.8);
            }
            ctx.globalAlpha = 1;
        }
        for (const contact of contacts) {
            const [wx, wy] = warpPoint(contact.x, contact.y);
            const x = wx * radius;
            const y = wy * radius;
            const size = (contact.selected ? 5.5 : 3.2) * ratio;
            const color = contact.type === 'hostile' ? '#ff5a43' : contact.type === 'friendly' ? '#6cc8e4' : contact.type === 'location' ? '#e6b95f' : contact.type === 'resource' ? '#b8c97b' : contact.type === 'wreck' ? '#87b5aa' : contact.type === 'pickup' ? '#f2df91' : contact.type === 'distress' ? '#ff9442' : '#c9cbc6';
            // A distress beacon from beyond the horizon (see radarContacts): a
            // pulsing diamond at the disc rim aimed at the source, with a
            // distance readout tucked just inside it.
            if (contact.distress) {
                const pulse = 0.7 + 0.3 * Math.sin(now / 150);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.PI / 4);
                ctx.globalAlpha = pulse;
                ctx.fillStyle = color;
                const s = size * 1.6;
                ctx.fillRect(-s, -s, s * 2, s * 2);
                ctx.restore();
                ctx.globalAlpha = 1;
                ctx.strokeStyle = 'rgba(255, 148, 66, 0.75)';
                ctx.lineWidth = Math.max(1, ratio);
                ctx.beginPath();
                ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = '#ffab6b';
                ctx.font = `${Math.max(8, Math.floor(8.5 * ratio))}px ui-monospace, monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${contact.distance}`, x * 0.82, y * 0.82);
                continue;
            }
            // A lost contact: the last-known position of a signal the dish just
            // stopped resolving — a cross, not a dashed circle. Solid for the
            // hold window, then fading out over the fade window (the alpha is
            // precomputed in game.js radarContacts).
            if (contact.ghost) {
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1.4, 1.7 * ratio);
                ctx.globalAlpha = contact.lostAlpha ?? 0.9;
                const cross = size * 2.2;
                ctx.beginPath();
                ctx.moveTo(x - cross, y);
                ctx.lineTo(x + cross, y);
                ctx.moveTo(x, y - cross);
                ctx.lineTo(x, y + cross);
                ctx.stroke();
                ctx.globalAlpha = 1;
                continue;
            }
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.globalAlpha = contact.altitude > 0 ? 1 : 0.62;
            if (contact.type === 'location') {
                ctx.strokeRect(x - size, y - size, size * 2, size * 2);
            }
            else {
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
            if (contact.selected) {
                ctx.globalAlpha = 0.85;
                ctx.strokeRect(x - size * 2, y - size * 2, size * 4, size * 4);
            }
            ctx.globalAlpha = 0.35;
            const altitudeRatio = Math.max(-1, Math.min(1, contact.altitude || 0));
            const altitudeMagnitude = Math.abs(altitudeRatio);
            if (altitudeMagnitude > 0.02) {
                // Cockpit intuition: above the plane points up, below points down.
                const direction = altitudeRatio > 0 ? -1 : 1;
                const tick = radarAltitudeTick({ x, y, radius, ratio, direction, magnitude: altitudeMagnitude, size });
                if (tick) {
                    ctx.beginPath();
                    ctx.moveTo(x, tick.startY);
                    ctx.lineTo(x, tick.startY + direction * tick.length);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }
    showToast(message, tone = 'info', duration = 3400) {
        const stack = this.root.querySelector('#toast-stack');
        if (!stack)
            return;
        const id = ++this.toastId;
        const toast = document.createElement('div');
        toast.className = `toast ${tone}`;
        toast.dataset.toastId = String(id);
        toast.textContent = message;
        stack.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        window.setTimeout(() => {
            toast.classList.remove('visible');
            window.setTimeout(() => toast.remove(), 320);
        }, duration);
    }
    // Own-ship flight recorder: combat/career events land on the own monitor's
    // ticker and persist in the ship menu's RECENT EVENTS (like the comms log).
    pushEvent(message, tone = 'info', duration = 5600) {
        const now = this.save?.world.time ?? 0;
        this.recentEvents.push({ message, tone, at: now, until: now + duration / 1000 });
        if (this.recentEvents.length > 24)
            this.recentEvents.shift();
    }
    // Radar sensor log: local-space traffic/encounter chatter lives on the nav
    // monitor's ticker rather than the toast stack.
    pushSensor(message, tone = 'info', duration = 5600) {
        const now = this.save?.world.time ?? 0;
        this.sensorLog.push({ message, tone, at: now, until: now + duration / 1000 });
        if (this.sensorLog.length > 12)
            this.sensorLog.shift();
    }
    // The newest entry whose display window is still open; undefined when the
    // line has expired (the ticker then fades back to its idle state).
    currentEntry(log) {
        const now = this.save?.world.time ?? 0;
        for (let index = log.length - 1; index >= 0; index -= 1) {
            if (log[index].until > now)
                return log[index];
        }
        return undefined;
    }
    // Pilot chatter: a top-center comms bar showing the latest transmission
    // as just "callsign: message", colored by the speaker's relation (hostiles
    // red, allies blue, neutral white). No badges, no timestamps, no log tag —
    // the transmission is the whole bar. Last speaker wins; the full
    // transcript lives in the chat log, which opens when the bar is tapped.
    commsLog = [];
    commsBarTimer;
    storyDismissed = false;
    // story marks story-mission transmissions on the log entries; rendering
    // them distinctly (pinned bar, log tag) is later work — the flag is the
    // seam so the log already knows which lines are story.
    showPilotLine(callsign, line, relation = 'neutral', duration = 6000, story = false) {
        // Append to the comms log (capped) so the chat panel can review the
        // whole conversation — nobody misses a line that faded off the bar.
        this.commsLog.push({ callsign, line, relation, story });
        if (this.commsLog.length > 40)
            this.commsLog.shift();
        const bar = this.el('#comms-bar');
        if (!bar)
            return;
        const color = relationColor(relation);
        const text = document.createElement('span');
        text.className = 'talker-text';
        text.textContent = `${callsignHandle(callsign)}: ${line}`;
        bar.textContent = '';
        bar.style.color = color;
        bar.style.borderColor = color;
        bar.classList.add('active');
        bar.append(text);
        window.clearTimeout(this.commsBarTimer);
        this.commsBarTimer = window.setTimeout(() => {
            bar.classList.remove('active');
            bar.textContent = '';
            bar.style.color = '';
            bar.style.borderColor = '';
        }, duration);
    }
    // A group transmission (a mugging crew that folds together): the bar shows
    // all of their callsigns, comma-joined, ahead of the line.
    showGroupLine(callsigns, line, relation = 'neutral', duration = 6000) {
        const names = callsigns.map((callsign) => callsignHandle(callsign)).join(', ');
        this.showPilotLine(names, line, relation, duration);
    }
    // Story-mission display: a pinned amber transmission on the comms bar.
    // Unlike normal chatter it doesn't fade — it stays until dismissed (tap
    // the CONTINUE bar, or the game times it out) — and it's flagged story in
    // the log. The game holds the chatter mute (storyLineUntil) while it's up.
    showStoryLine(name, text, relation = 'neutral') {
        this.commsLog.push({ callsign: name, line: text, relation, story: true });
        const bar = this.el('#comms-bar');
        if (!bar)
            return;
        bar.textContent = '';
        bar.style.color = '#e8c87a';
        bar.style.borderColor = 'rgba(232, 200, 122, 0.6)';
        bar.classList.add('active', 'story');
        bar.setAttribute('data-ui-command', 'dismiss-story');
        const textNode = document.createElement('span');
        textNode.className = 'talker-text';
        textNode.textContent = `${name}: ${text}`;
        bar.append(textNode);
        window.clearTimeout(this.commsBarTimer);
        this.storyDismissed = false;
    }
    dismissStory() {
        const bar = this.el('#comms-bar');
        if (bar) {
            bar.classList.remove('active', 'story');
            bar.setAttribute('data-ui-command', 'open-chat');
            bar.textContent = '';
            bar.style.color = '';
            bar.style.borderColor = '';
        }
        window.clearTimeout(this.commsBarTimer);
        this.storyDismissed = true;
    }
    openChatLog() {
        const panel = this.root.querySelector('#chat-panel');
        if (!panel)
            return;
        // Screen-aware transcript: show only as many of the newest lines as the
        // viewport can hold comfortably (~52px of height per line), so a short
        // landscape phone isn't handed a wall of cramped rows. The list still
        // scrolls for the rest when a line wraps.
        const heightBudget = Math.floor((window.innerHeight || 800) / 52);
        const maxRows = Math.min(this.commsLog.length, Math.max(5, heightBudget));
        const visible = this.commsLog.slice(-maxRows);
        const rows = [...visible].reverse().map((entry) => {
            const color = relationColor(entry.relation);
            return `<div class="comms-row" style="border-left-color:${color};"><b style="color:${color};">${escapeHtml(callsignHandle(entry.callsign))}</b><p>${escapeHtml(entry.line)}</p></div>`;
        }).join('');
        const countLabel = visible.length < this.commsLog.length
            ? t('Showing {shown} of {total} transmissions', { shown: visible.length, total: this.commsLog.length })
            : this.commsLog.length === 1
                ? t('{count} transmission recorded', { count: this.commsLog.length })
                : t('{count} transmissions recorded', { count: this.commsLog.length });
        panel.innerHTML = `
      <div class="modal-card comms-card">
        <header><div><span class="eyebrow">${t('COMMS LOG / PAUSED')}</span><h2>${t('Incoming transmissions')}</h2></div><button data-ui-command="close-chat">${t('CLOSE')}</button></header>
        <div class="comms-log-list">${rows.length ? rows : `<p class="comms-log-empty">${t('No transmissions received.')}</p>`}</div>
        <footer><span>${countLabel}</span></footer>
      </div>`;
        this.hidePause();
        this.hideShipMenu();
        panel.classList.remove('is-hidden');
        this.updateOrientationNotice();
    }
    closeChatLog() {
        this.root.querySelector('#chat-panel')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    showMap(model) {
        if (!this.save)
            return;
        const panel = this.root.querySelector('#map-panel');
        const playerPoint = systemMapPoint(model.playerPosition);
        const contactTone = (contact) => contact.claim ? 'claim' : contact.hostile ? 'hostile' : contact.kind === 'asteroid' || contact.kind === 'pickup' ? 'resource' : contact.kind === 'wreck' ? 'wreck' : 'ship';
        panel.innerHTML = `
      <div class="modal-card map-card">
        <header><div><span class="eyebrow">${t('NAVIGATION COMPUTER / PAUSED')}</span><h2>${t('Helios Verge System')}</h2></div><button data-ui-command="close-map">${t('CLOSE')}</button></header>
        <div class="navigation-map-layout">
          <section class="map-section system-map-section">
            <div class="map-section-heading"><span>${t('SYSTEM POINTS')}</span><b>${escapeHtml(LOCATIONS[model.navTargetId].shortName)} ${t('VECTOR')}</b></div>
            <div class="system-map map-stage">
              <div class="map-orbit orbit-a"></div><div class="map-orbit orbit-b"></div><div class="map-star" aria-label="${t('Helios star')}"></div>
              <div class="map-player-marker" style="left:${playerPoint.left.toFixed(2)}%;top:${playerPoint.top.toFixed(2)}%" aria-label="${t('Current position')}"><i></i><span>${t('YOU')}</span></div>
              ${Object.keys(LOCATIONS).map((id) => {
            const location = LOCATIONS[id];
            const point = systemMapPoint(location.position, id);
            const selected = model.navTargetId === id || model.currentTargetId === id;
            return `<button class="map-node kind-${location.kind} ${selected ? 'selected' : ''}" style="left:${point.left.toFixed(2)}%;top:${point.top.toFixed(2)}%" data-map-target-kind="location" data-map-target-id="${id}"><i></i><b>${escapeHtml(location.shortName)}</b><span>${this.save.player.discovered.includes(id) ? escapeHtml(t(location.kind)) : t('UNSURVEYED')}</span></button>`;
        }).join('')}
            </div>
          </section>
          <section class="map-section local-map-section">
            <div class="map-section-heading"><span>${t('LOCAL CONTACTS')}</span><b>${model.contacts.length} ${t('TRACKED')}</b></div>              <div class="tactical-map map-stage">
              <div class="tactical-rings"></div><div class="tactical-player"></div>
              ${(model.searchRings ?? []).map((ring) => `<span class="tactical-search-ring ${ring.color}" style="left:${(50 + ring.x * 42).toFixed(2)}%;top:${(50 + ring.y * 42).toFixed(2)}%;width:${Math.max(6, ring.fraction * 84).toFixed(1)}%;height:${Math.max(6, ring.fraction * 84).toFixed(1)}%"></span>`).join('')}
              ${model.contacts.map((contact) => `<button class="tactical-contact ${contactTone(contact)} ${contact.ghost ? 'ghost' : ''} ${contact.distress ? 'distress' : ''} ${contact.selected ? 'selected' : ''}" style="left:${(50 + contact.x * 42).toFixed(2)}%;top:${(50 + contact.y * 42).toFixed(2)}%;opacity:${contact.ghost ? (contact.lostAlpha ?? 0.9) : 1}" data-map-target-kind="${contact.kind}" data-map-target-id="${escapeHtml(contact.id)}" aria-label="${escapeHtml(contact.name)}"><i></i></button>`).join('')}
            </div>
            <div class="contact-list">
              ${model.contacts.length ? model.contacts.map((contact) => `<button class="contact-row ${contactTone(contact)} ${contact.selected ? 'selected' : ''}" data-map-target-kind="${contact.kind}" data-map-target-id="${escapeHtml(contact.id)}"><i></i><span><b>${escapeHtml(contact.name)}</b><small>${escapeHtml(t(contact.subtitle))}</small></span><em>${Math.round(contact.distance)}u</em></button>`).join('') : `<div class="contact-empty"><b>${t('NO LOCAL CONTACTS')}</b><span>${t('Only contacts inside sensor range appear here.')}</span></div>`}
            </div>
          </section>
        </div>
        <footer><span>${model.autopilotAvailable ? t('HYPERDRIVE READY — plot a jump vector.') : t('HYPERDRIVE LOCKED — {threat}.', { threat: model.threatLabel ?? t('hostile proximity') })}</span></footer>
      </div>`;
        this.hidePause();
        this.hideShipMenu();
        panel.classList.remove('is-hidden');
        this.updateOrientationNotice();
    }
    hideMap() {
        this.root.querySelector('#map-panel')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    showShipMenu() {
        if (!this.save)
            return;
        const panel = this.root.querySelector('#ship-panel');
        const player = this.save.player;
        const ship = SHIPS[player.shipId];
        const mass = cargoMass(player);
        const capacity = cargoCapacity(player);
        const loadPercent = capacity > 0 ? Math.min(100, Math.round((mass / capacity) * 100)) : 0;
        const mug = this.mugDemand?.();
        const cargoEntries = Object.entries(player.cargo)
            .filter(([, qty]) => qty > 0)
            .map(([id, qty]) => {
                const commodity = COMMODITIES[id];
                return { id, name: commodity?.name ?? id, qty, mass: (commodity?.mass ?? 0) * qty };
            });
        const sealed = (player.sealedCargo ?? []).map((entry) => ({ name: entry.label, qty: entry.units, mass: entry.mass }));
        const allCargo = [...cargoEntries, ...sealed];
        const cargoRows = allCargo.length
            ? allCargo.map((entry) => `<div class="cargo-row"><span><b>${escapeHtml(t(entry.name))}</b><small>${entry.qty} ${t('UNITS')}</small></span>${entry.id === 'gold' || (mug?.kind === 'cargo' && mug.commodity === entry.id) ? `<button data-jettison="${entry.id}">${t('JETTISON')}</button>` : ''}<em>${entry.mass.toFixed(1)} ${t('MASS')}</em></div>`).join('')
            : `<p class="ship-menu-empty">${t('Hold empty. The market is one jump away.')}</p>`;
        const missions = this.save.activeMissions;
        const missionRows = missions.length
            ? missions.map((mission) => {
                const destinationId = mission.kind === 'bounty' ? mission.targetZone : mission.destination;
                const destination = destinationId && Object.prototype.hasOwnProperty.call(LOCATIONS, destinationId) ? LOCATIONS[destinationId] : undefined;
                const where = mission.kind === 'bounty'
                    ? (destination ? t('HUNT NEAR {name}', { name: destination.name.toUpperCase() }) : t('HUNT TARGET UNKNOWN'))
                    : mission.kind === 'mining'
                        ? ((mission.mined ?? 0) >= mission.quantity
                            ? t('RETURN TO {name}', { name: (LOCATIONS[mission.destination]?.name ?? 'DOCK').toUpperCase() })
                            : t('MINE {name}', { name: (mission.claimName ?? 'SHARDBELT CLAIM').toUpperCase() }))
                        : (destination ? t('FLY TO {name}', { name: destination.name.toUpperCase() }) : '—');
                const progress = mission.kind === 'mining' && mission.claimNodeId
                    ? `<div><dt>${t('PROGRESS')}</dt><dd>${mission.mined ?? 0}/${mission.quantity} ${t('MINED')}</dd></div>`
                    : '';
                return `<article class="mission-card ${mission.kind} ship-mission-card">
                <header><span>${this.missionBadge(mission)}</span><b>${formatCredits(mission.reward)}</b></header>
                <h4>${escapeHtml(mission.title)}</h4>
                <dl><div><dt>VECTOR</dt><dd>${escapeHtml(where)}</dd></div>${progress}<div><dt>DEADLINE</dt><dd>${this.deadlineLabel(mission)}</dd></div></dl>
              </article>`;
            }).join('')
            : `<p class="ship-menu-empty">${t('No active contracts. The bar posts new work at every station.')}</p>`;
        const eventRows = this.recentEvents.length
            ? [...this.recentEvents].reverse().map((entry) => `<div class="event-row" data-tone="${escapeHtml(entry.tone)}"><span>${escapeHtml(entry.message)}</span></div>`).join('')
            : `<p class="ship-menu-empty">${t('No flight events recorded. The recorder logs combat, salvage, and pickups.')}</p>`;
        // Weapon systems card: every gun with its engagement envelope (derived
        // from the registry — speed × life — so the promise cannot drift from
        // sim truth) and its ammo pool. The active mount is marked; unowned
        // guns show their station price — gained, not granted.
        const weaponRows = WEAPON_ORDER.map((id) => {
            const weapon = WEAPONS[id];
            const active = player.weaponId === id;
            const owned = weaponOwned(player, id);
            const ammo = weapon.ammoId ? `${player.ammo?.[weapon.ammoId] ?? 0}/${AMMO_CAPACITY[weapon.ammoId]}` : '∞';
            const envelope = t(weapon.envelopeKey, { range: Math.round(weapon.speed * weapon.life) });
            const price = weapon.equipmentId ? EQUIPMENT[weapon.equipmentId]?.price : undefined;
            const state = owned ? ammo : `${t('NOT INSTALLED')} · ${formatCredits(price ?? 0)}`;
            return `<div class="weapon-row${active ? ' is-active' : ''}${owned ? '' : ' is-locked'}"><span>${active ? '▸ ' : ''}${escapeHtml(t(weapon.nameKey))}</span><small>${escapeHtml(envelope)}</small><em>${state}</em></div>`;
        }).join('');
        panel.innerHTML = `
      <div class="modal-card ship-card">
        <header><div><span class="eyebrow">${t('SHIP STATUS / PAUSED')}</span><h2>${escapeHtml(ship?.name ?? 'VOIDRUNNER')}</h2></div><button data-ui-command="close-ship">${t('CLOSE')}</button></header>
        <div class="pause-grid ship-menu-grid">
          <section class="ship-menu-missions"><h3>${t('ACTIVE CONTRACTS · {count}/6', { count: missions.length })}</h3>${missionRows}</section>
          <section class="ship-menu-cargo"><h3>${t('CARGO HOLD · {mass}/{capacity} MASS ({percent}%)', { mass: mass.toFixed(1), capacity, percent: loadPercent })}</h3>${cargoRows}</section>
          <section class="ship-menu-weapons"><h3>${t('WEAPON SYSTEMS')}</h3>${weaponRows}</section>
          <section class="ship-menu-account"><h3>${t('ACCOUNT')}</h3>
            <div class="ship-account-row"><span>${t('AVAILABLE CREDIT')}</span><b>${formatCredits(player.credits)}</b></div>
            ${mug?.kind === 'credits' ? `<div class="ship-account-row"><span>${t('STANDOFF TOLL')}</span><button data-pay-mug="1">${t('PAY')} ${formatCredits(mug.amount)}</button></div>` : ''}
            <div class="ship-account-row"><span>${t('CARGO LOAD')}</span><b>${loadPercent}%</b></div>
            <div class="ship-account-row"><span>${t('HULL')}</span><b>${Math.ceil(player.hull)}/${Math.ceil(getEffectiveShipStats(player).hull)}</b></div>
          </section>
          <section class="ship-menu-events"><h3>${t('RECENT EVENTS · {count}', { count: this.recentEvents.length })}</h3>${eventRows}</section>
        </div>
        <footer><span>${t('Contracts carry a destination vector.')}</span><button data-ui-command="map">${t('NAV MAP')}</button></footer>
      </div>`;
        this.hidePause();
        this.hideMap();
        panel.classList.remove('is-hidden');
        this.updateOrientationNotice();
    }
    hideShipMenu() {
        this.root.querySelector('#ship-panel')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    // The settings sections (FLIGHT / TILT STEER / AUDIO / controls) shared by
    // the in-flight pause panel and the options panel on the title and dock
    // screens — one source of truth for the toggles and sliders.
    settingsSections(settings) {
        return `
        <div class="pause-grid">
          <section><h3>${t('FLIGHT')}</h3><label><span>${t('Flight assist')}</span><input type="checkbox" data-setting="flightAssist" ${settings.flightAssist ? 'checked' : ''}></label><label><span>${t('Aim assistance')}</span><input type="checkbox" data-setting="aimAssist" ${settings.aimAssist ? 'checked' : ''}></label><label><span>${t('Quality')}</span><select data-setting="quality"><option value="auto" ${settings.quality === 'auto' ? 'selected' : ''}>${t('Auto')}</option><option value="low" ${settings.quality === 'low' ? 'selected' : ''}>${t('Low')}</option><option value="high" ${settings.quality === 'high' ? 'selected' : ''}>${t('High')}</option></select></label><label><span>${t('Touch scale')}</span><input type="range" min="0.8" max="1.3" step="0.05" value="${settings.touchScale}" data-setting="touchScale"></label></section>
          <section><h3>${t('TILT STEER')}</h3><label><span>${t('Steering')}</span><select data-setting="steering"><option value="tilt" ${settings.steering !== 'stick' ? 'selected' : ''}>${t('Tilt')}</option><option value="stick" ${settings.steering === 'stick' ? 'selected' : ''}>${t('Stick')}</option></select></label><label><span>${t('Sensitivity')}</span><input type="range" min="0.4" max="1.8" step="0.05" value="${settings.tiltSensitivity}" data-setting="tiltSensitivity"></label><label><span>${t('Invert pitch')}</span><input type="checkbox" data-setting="tiltInvertPitch" ${settings.tiltInvertPitch ? 'checked' : ''}></label><label><span>${t('Invert yaw')}</span><input type="checkbox" data-setting="tiltInvertYaw" ${settings.tiltInvertYaw ? 'checked' : ''}></label><div class="tilt-actions"><button data-ui-command="enable-tilt">${t('ENABLE')}</button><button data-ui-command="calibrate-tilt">${t('SET NEUTRAL')}</button></div></section>
          <section><h3>${t('AUDIO')}</h3><label><span>${t('Music')}</span><input type="range" min="0" max="1" step="0.05" value="${settings.music}" data-setting="music"></label><label><span>${t('Effects')}</span><input type="range" min="0" max="1" step="0.05" value="${settings.effects}" data-setting="effects"></label><label><span>${t('Haptics')}</span><input type="checkbox" data-setting="vibration" ${settings.vibration ? 'checked' : ''}></label></section>
          <section><h3>${t('DISPLAY')}</h3><label><span>${t('Fullscreen')}</span><button type="button" class="fullscreen-switch" data-ui-command="toggle-fullscreen" role="switch" aria-label="${t('Toggle fullscreen')}" aria-checked="false">⛶</button></label></section>
          <section><h3>${t('LANGUAGE')}</h3><label><span>${t('Language')}</span><select data-setting="language"><option value="de" ${settings.language !== 'en' ? 'selected' : ''}>Deutsch</option><option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option></select></label></section>
          <section class="controls-reference"><h3>${t('KEYBOARD / CONTROLLER')}</h3><p>${t('W/S pitch · A/D yaw · Q/E roll · R/F throttle · Shift afterburn · Space fire · hold M secondary tool / tap missile or capture · T target · C mode · N nav · J hyperdrive · K map · B transponder')}</p><p>${t('Gamepad: left stick steer · right stick roll/throttle · RT fire · hold RB secondary tool / tap missile or capture · LB afterburn · face buttons target/mode/hyperdrive · left stick click transponder · D-pad capture/hostile/nav.')}</p></section>
        </div>`;
    }
    showPause() {
        if (!this.save)
            return;
        const panel = this.root.querySelector('#pause-panel');
        const settings = this.save.settings;
        panel.innerHTML = `
      <div class="modal-card pause-card">
        <header><div><span class="eyebrow">${t('SHIP COMPUTER')}</span><h2>${t('Paused')}</h2></div><button data-ui-command="resume-flight">${t('RESUME')}</button></header>
        ${this.settingsSections(settings)}
        <footer><button data-ui-command="map">${t('NAV MAP')}</button><button data-ui-command="save">${t('SAVE NOW')}</button><button data-ui-command="quit-title">${t('QUIT TO TITLE')}</button></footer>
      </div>`;
        this.hideShipMenu();
        panel.classList.remove('is-hidden');
        this.syncFullscreenButton();
        this.updateOrientationNotice();
    }
    // Options panel on the title and dock screens: the same settings grid as
    // the pause panel (sound lives here — Music / Effects default to the
    // designed listening levels and double as the mute switch), without the
    // in-flight footer. Works
    // before a career exists: settings fall back to the factory defaults and
    // changes persist via the no-session setSetting path.
    showOptions() {
        const panel = this.root.querySelector('#pause-panel');
        const settings = this.save?.settings ?? defaultSettings();
        panel.innerHTML = `
      <div class="modal-card pause-card">
        <header><div><span class="eyebrow">${t('SHIP COMPUTER')}</span><h2>${t('Options')}</h2></div><button data-ui-command="close-options">${t('CLOSE')}</button></header>
        ${this.settingsSections(settings)}
      </div>`;
        panel.classList.remove('is-hidden');
        this.syncFullscreenButton();
        this.updateOrientationNotice();
    }
    hideOptions() {
        this.root.querySelector('#pause-panel')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    hidePause() {
        this.root.querySelector('#pause-panel')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    showArena() {
        const panel = this.root.querySelector('#arena-panel');
        const envOptions = [['open', 'OPEN SPACE'], ['asteroid-field', 'ASTEROID FIELD'], ['debris-field', 'DEBRIS FIELD']];
        const scenarioOptions = [['1v1', '1V1'], ['1v2', '1V2'], ['1v3', '1V3'], ['2v3', '2V3']];
        const difficultyOptions = [['novice', 'ROOKIE'], ['veteran', 'VETERAN'], ['ace', 'ACE']];
        const option = (key, value, label, selected) => `<button data-arena-${key}="${value}" class="${selected ? 'selected' : ''}">${t(label)}</button>`;
        panel.innerHTML = `
      <div class="modal-card arena-card">
        <header><div><span class="eyebrow">${t('TRAINING SIMULATION')}</span><h2>${t('Dogfight Arena')}</h2></div><button data-ui-command="close-arena">${t('CLOSE')}</button></header>
        <div class="arena-grid">
          <section>
            <h3>${t('ARENA')}</h3>
            <div class="arena-options">${envOptions.map(([value, label]) => option('env', value, label, this.arenaEnv === value)).join('')}</div>
          </section>
          <section>
            <h3>${t('SCENARIO')}</h3>
            <div class="arena-options">${scenarioOptions.map(([value, label]) => option('scenario', value, label, this.arenaScenario === value)).join('')}</div>
          </section>
          <section>
            <h3>${t('PILOTS')}</h3>
            <div class="arena-options">${difficultyOptions.map(([value, label]) => option('difficulty', value, label, this.arenaDifficulty === value)).join('')}</div>
          </section>
        </div>
        <footer><span>${t('Simulated sortie — nothing here follows you back out.')}</span><button class="primary" data-ui-command="launch-arena">${t('LAUNCH')}</button></footer>
      </div>`;
        panel.classList.remove('is-hidden');
        this.updateOrientationNotice();
    }
    hideArena() {
        this.root.querySelector('#arena-panel')?.classList.add('is-hidden');
        this.updateOrientationNotice();
    }
    setTouchScale(scale) {
        this.root.style.setProperty('--touch-scale', String(scale));
    }
    setTouchSteering(mode) {
        this.root.classList.toggle('steering-tilt', mode === 'tilt');
        this.root.classList.toggle('steering-stick', mode !== 'tilt');
    }
    // Every fullscreen control — the HUD corner button, the title-screen
    // switch, and the options/pause switch — mirrors the live fullscreen state
    // (icon flips between enter ⛶ and exit ⤡, active state glows gold).
    syncFullscreenButton = () => {
        // Standard plus the webkit-prefixed element (older Safari/Edge), so the
        // switch mirrors fullscreen state on every engine.
        const full = Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
        const icon = full ? '⤡' : '⛶';
        this.root.querySelectorAll('.fullscreen-button, .title-fullscreen-button, .fullscreen-switch').forEach((button) => {
            button.textContent = icon;
            button.classList.toggle('is-fullscreen', full);
            if (button.getAttribute('role') === 'switch')
                button.setAttribute('aria-checked', String(full));
            else
                button.setAttribute('aria-pressed', String(full));
        });
    };
    get isModalOpen() {
        return !this.root.querySelector('#map-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#ship-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#pause-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#arena-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#chat-panel')?.classList.contains('is-hidden');
    }
    get isTitleVisible() {
        return this.titleVisible;
    }
    // Forced landscape prompt: whenever the viewport is taller than it is wide
    // (phone, pad, or a portrait window on desktop) the overlay blocks play —
    // on the title screen, in the dock, and in flight — until the device is
    // flipped or the window widened. No dismiss: the game is built for
    // horizontal play.
    updateOrientationNotice = () => {
        const notice = this.root.querySelector('#rotate-notice');
        if (!notice)
            return;
        const portrait = window.innerHeight > window.innerWidth;
        notice.classList.toggle('is-hidden', !portrait);
    };
}
