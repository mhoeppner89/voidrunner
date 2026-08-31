import { COMMODITIES, DOCK_LOCATION_IDS, EQUIPMENT, FACTION_NAMES, GUILD_NAMES, GUILD_RANK_NAMES, LOCATIONS, SHIPS, SYSTEM_MAP_EXTENT, commodityIds, displaySpeed } from './data.js';
import { JUMP_ROUTES, SYSTEMS } from './galaxy.js';
import { bestKnownTradeRoute, cargoCapacity, cargoMass, currentProfitableRoutes, denPrice, knownMarketQuotes, quoteCommodityTrade, SYNDICATE_DEN_FAVOR } from './economy.js';
import { formatCredits, formatDuration, formatNumber } from './random.js';
import { equipmentUnlocked, getEffectiveShipStats, refillCost, repairCost } from './shipStats.js';
import { AMMO_CAPACITY, WEAPON_ORDER, WEAPONS, weaponOwned } from './weapons.js';
import { TIER_LABELS, TEMPERAMENT_LABELS } from './pilots.js';
import { shipTopDownProfile } from './voxelModels.js';
import { defaultSettings } from './save.js';
import { getLanguage, t } from './i18n.js';
import { ShipPreview } from './shipPreview.js';
import { HULL_TRADE_IN_RATE } from './shipTrade.js';
import { HARDPOINT_SPECS, OUTFIT_ITEMS, OUTFIT_ITEM_IDS, RESALE_RATE, itemAvailable, itemFitsMount, loadoutFor, outfittingUsage, quoteOutfitting } from './outfitting.js';
const escapeHtml = (value) => value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const percent = (value, max) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100)));
// Every dock screen resolves through one explicit art record. This keeps minor
// ports on their dedicated mission terminals and prevents a missing plate from
// silently falling back to an unrelated concourse image.
const DOCK_ART_BY_LOCATION = Object.freeze({
    helix: Object.freeze({
        concourse: './art/locations/v3/helix-hd-v1.png',
        bar: './art/locations/v3/bar-helix-hd-v1.png',
        market: './art/locations/v3/market-helix-hd-v1.png',
    }),
    rook: Object.freeze({
        concourse: './art/locations/v3/rook-hd-v1.png',
        bar: './art/locations/v3/bar-rook-hd-v1.png',
        market: './art/locations/v3/market-rook-hd-v1.png',
    }),
    vesper: Object.freeze({
        concourse: './art/locations/v3/vesper.png',
        bar: './art/locations/v3/bar-vesper-hd-v1.png',
        market: './art/locations/v3/market-vesper-hd-v1.png',
    }),
    azure: Object.freeze({
        concourse: './art/locations/v3/azure-hd-v1.png',
        bar: './art/locations/v3/bar-azure-hd-v1.png',
        market: './art/locations/v3/market-azure-hd-v1.png',
    }),
    cairn: Object.freeze({
        concourse: './art/locations/v6/concourse-cairn-hd-v2.png',
        bar: './art/locations/v6/mission-cairn-hd-v1.png',
    }),
    'meridian-prime': Object.freeze({
        concourse: './art/locations/v6/concourse-meridian-prime-hd-v2.png',
        bar: './art/locations/v5/bar-meridian-prime-hd-v1.png',
        market: './art/locations/v5/market-meridian-prime-hd-v1.png',
    }),
    argent: Object.freeze({
        concourse: './art/locations/v6/concourse-argent-hd-v2.png',
        bar: './art/locations/v6/bar-argent-hd-v2.png',
        market: './art/locations/v6/market-argent-hd-v2.png',
    }),
    'gatehouse-twelve': Object.freeze({
        concourse: './art/locations/v6/concourse-gatehouse-twelve-hd-v2.png',
        bar: './art/locations/v6/mission-gatehouse-twelve-hd-v1.png',
    }),
    blackglass: Object.freeze({
        concourse: './art/locations/v6/concourse-blackglass-hd-v2.png',
        bar: './art/locations/v6/bar-blackglass-hd-v2.png',
        market: './art/locations/v6/market-blackglass-hd-v2.png',
    }),
    cinder: Object.freeze({
        concourse: './art/locations/v6/concourse-cinder-hd-v2.png',
        bar: './art/locations/v6/bar-cinder-hd-v2.png',
        market: './art/locations/v6/market-cinder-hd-v2.png',
    }),
    torchwell: Object.freeze({
        concourse: './art/locations/v6/concourse-torchwell-hd-v2.png',
        bar: './art/locations/v6/mission-torchwell-hd-v1.png',
    }),
    nacre: Object.freeze({
        concourse: './art/locations/v6/concourse-nacre-hd-v2.png',
        bar: './art/locations/v5/bar-nacre-hd-v1.png',
        market: './art/locations/v5/market-nacre-hd-v1.png',
    }),
    boreal: Object.freeze({
        concourse: './art/locations/v6/concourse-boreal-hd-v2.png',
        bar: './art/locations/v6/bar-boreal-hd-v2.png',
        market: './art/locations/v5/market-boreal-hd-v1.png',
    }),
    shepherd: Object.freeze({
        concourse: './art/locations/v6/concourse-shepherd-hd-v2.png',
        bar: './art/locations/v6/mission-shepherd-hd-v1.png',
    }),
});
const NPC_PORTRAIT_BY_ID = Object.freeze({
    'captain-dorne': './art/portraits/v2/captain-dorne-hd-v2.webp',
    'devi-castor': './art/portraits/v2/devi-castor-hd-v2.webp',
    'doctor-ames': './art/portraits/v2/doctor-ames-hd-v2.webp',
    'ivo-senn': './art/portraits/v2/ivo-senn-hd-v2.webp',
    'kes-ali': './art/portraits/v2/kes-ali-hd-v2.webp',
    'linh-sorel': './art/portraits/v2/linh-sorel-hd-v2.webp',
    'mara-vek': './art/portraits/v2/mara-vek-hd-v2.webp',
    'oskar-brill': './art/portraits/v2/oskar-brill-hd-v2.webp',
    'ren-iverson': './art/portraits/v2/ren-iverson-hd-v2.webp',
    'sana-kell': './art/portraits/v2/sana-kell-hd-v2.webp',
    'tovik': './art/portraits/v2/tovik-hd-v2.webp',
    'yara-tan': './art/portraits/v2/yara-tan-hd-v2.webp',
    'juno-rell': './art/portraits/v3/juno-rell-hd-v1.webp',
    'merrit-voss': './art/portraits/v3/merrit-voss-hd-v1.webp',
    'leon-vale': './art/portraits/v3/leon-vale-hd-v1.webp',
    'sela-orrin': './art/portraits/v3/sela-orrin-hd-v1.webp',
    'tomas-quin': './art/portraits/v3/tomas-quin-hd-v1.webp',
    'arden-kai': './art/portraits/v3/arden-kai-hd-v1.webp',
    'mira-kest': './art/portraits/v3/mira-kest-hd-v1.webp',
    'bram-tel': './art/portraits/v3/bram-tel-hd-v1.webp',
    'vesh-orr': './art/portraits/v3/vesh-orr-hd-v1.webp',
    'nara-quill': './art/portraits/v3/nara-quill-hd-v1.webp',
    'kellan-rusk': './art/portraits/v3/kellan-rusk-hd-v1.webp',
    'mara-jen': './art/portraits/v3/mara-jen-hd-v1.webp',
    'dax-hollis': './art/portraits/v3/dax-hollis-hd-v1.webp',
    'rhea-sol': './art/portraits/v3/rhea-sol-hd-v1.webp',
    'dr-elin-saye': './art/portraits/v3/dr-elin-saye-hd-v1.webp',
    'pavel-orn': './art/portraits/v3/pavel-orn-hd-v1.webp',
    'tessa-rye': './art/portraits/v3/tessa-rye-hd-v1.webp',
    'soren-vek': './art/portraits/v3/soren-vek-hd-v1.webp',
    'aya-north': './art/portraits/v3/aya-north-hd-v1.webp',
    'halden-ree': './art/portraits/v3/halden-ree-hd-v1.webp',
});
const FULL_DOCK_SERVICES = Object.freeze({ fuel: true, repair: true, market: true, bar: true, shipyard: true, outfitting: true, missions: true });
const locationServices = (locationId) => LOCATIONS[locationId]?.services ?? FULL_DOCK_SERVICES;
const hasLocationService = (locationId, service) => Boolean(locationServices(locationId)?.[service]);
const hasAnyLocationService = (locationId, services) => services.some((service) => hasLocationService(locationId, service));
// The regional chart follows the real four-system corridor, but bends it into
// a broad zig-zag so the route has rhythm and room for full labels.
const REGIONAL_SYSTEM_LAYOUT = Object.freeze({
    'helios-verge': Object.freeze({ left: 14, top: 69 }),
    meridian: Object.freeze({ left: 38, top: 29 }),
    'pale-ring': Object.freeze({ left: 64, top: 68 }),
    redwake: Object.freeze({ left: 87, top: 27 }),
});
const REGIONAL_SYSTEM_ORDER = Object.freeze(['helios-verge', 'meridian', 'pale-ring', 'redwake']);
const SYSTEM_STAR_TYPES = Object.freeze({
    'helios-verge': 'YELLOW STAR',
    meridian: 'WHITE STAR',
    redwake: 'RED DWARF',
    'pale-ring': 'BLUE GIANT',
});
// Local charts use the real X/Z coordinates again. Tiny label nudges separate
// genuinely close neighbours (Helix/Shardbelt, Cairn/Mourning Line, and the
// Meridian yard cluster) without turning the whole system into a matrix.
const SYSTEM_MAP_NUDGES = Object.freeze({
    'helios-verge': Object.freeze({
        helix: { left: 0, top: -4 },
        'mourning-line': { left: 0, top: 8 },
        cairn: { left: 0, top: -7 },
    }),
    meridian: Object.freeze({
        argent: { left: 0, top: -5 },
        'foundry-lanes': { left: 2, top: 4 },
        'gatehouse-twelve': { left: -4, top: 3 },
        'verge-pale-point': { left: 1, top: 2 },
    }),
    redwake: Object.freeze({
        torchwell: { left: -3, top: -3 },
        'redwake-verge-point': { left: 3, top: 4 },
    }),
    'pale-ring': Object.freeze({
        shepherd: { left: 3, top: -5 },
        'pale-verge-point': { left: -3, top: 4 },
        'verge-redwake-point': { left: 2, top: 1 },
    }),
});
const systemMapPoint = (position, locationId, systemId = 'helios-verge') => {
    const x = Number(position?.[0]) || 0;
    const z = Number(position?.[2]) || 0;
    const nudge = SYSTEM_MAP_NUDGES[systemId]?.[locationId] ?? { left: 0, top: 0 };
    return {
        left: Math.max(14, Math.min(86, 50 + (x / SYSTEM_MAP_EXTENT) * 36 + nudge.left)),
        top: Math.max(14, Math.min(86, 50 + (z / SYSTEM_MAP_EXTENT) * 36 + nudge.top)),
    };
};
const layoutSystemMapPoints = (locationIds, systemId) => {
    const points = locationIds.map((id) => ({ id, ...systemMapPoint(LOCATIONS[id].position, id, systemId) }));
    // The star is a real visual anchor again. Keep the centre clear enough for
    // its disc on both desktop and compact landscape screens before resolving
    // point-to-point label collisions.
    for (const point of points) {
        const dx = point.left - 50;
        const dy = point.top - 50;
        if (Math.abs(dx) >= 18 || Math.abs(dy) >= 14)
            continue;
        if (Math.abs(dx) / 18 >= Math.abs(dy) / 14)
            point.left = 50 + (dx < 0 ? -18 : 18);
        else
            point.top = 50 + (dy < 0 ? -14 : 14);
    }
    // Preserve the physical projection, then only repel labels that would
    // overlap. The spacing is sized for the compact landscape-phone map; on a
    // desktop it leaves a little extra breathing room. This is a label-layout
    // pass, not a grid: isolated points never move.
    const minimumX = 23;
    const minimumY = 18;
    for (let iteration = 0; iteration < 48; iteration += 1) {
        let moved = false;
        for (let first = 0; first < points.length; first += 1) {
            for (let second = first + 1; second < points.length; second += 1) {
                const a = points[first];
                const b = points[second];
                const dx = b.left - a.left;
                const dy = b.top - a.top;
                const overlapX = minimumX - Math.abs(dx);
                const overlapY = minimumY - Math.abs(dy);
                if (overlapX <= 0 || overlapY <= 0)
                    continue;
                moved = true;
                if (overlapX <= overlapY) {
                    const direction = Math.abs(dx) > 0.01 ? Math.sign(dx) : ((first + second) % 2 ? 1 : -1);
                    const push = overlapX / 2 + 0.08;
                    a.left -= direction * push;
                    b.left += direction * push;
                }
                else {
                    const direction = Math.abs(dy) > 0.01 ? Math.sign(dy) : ((first + second) % 2 ? 1 : -1);
                    const push = overlapY / 2 + 0.08;
                    a.top -= direction * push;
                    b.top += direction * push;
                }
                a.left = Math.max(13, Math.min(87, a.left));
                b.left = Math.max(13, Math.min(87, b.left));
                a.top = Math.max(11, Math.min(89, a.top));
                b.top = Math.max(11, Math.min(89, b.top));
            }
        }
        if (!moved)
            break;
    }
    return new Map(points.map(({ id, left, top }) => [id, { left, top }]));
};
const mapLocationLabel = (location) => location?.kind === 'jump-point' && location.destinationSystemId
    ? t('TO {system}', { system: SYSTEMS[location.destinationSystemId]?.shortName ?? location.shortName })
    : location?.shortName ?? '';
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
// the screen, +1 = down); magnitude is the contact's elevation ratio (sin of
// the angle, distance-aware — see radarContacts), and the tick grows toward
// 40% of the ring for an overhead target while being normalised to the room
// left before the rim so a contact near the edge never spills off the
// readable disc. A rim-pinned
// contact (the race gathering beyond the horizon) has no in-disc room on its
// outward side; the tick then keeps its direction and extends past the rim
// toward the canvas edge instead of vanishing — the disc is inset from the
// canvas, so the above/below cue still reads. Returns undefined only when no
// legible tick fits anywhere on the glass.
export const radarAltitudeTick = ({ x, y, radius, ratio = 1, direction, magnitude, size = 3.2, canvasHeight }) => {
    const gap = (size + 1.5) * ratio;
    const startY = y + direction * gap;
    const half = Math.sqrt(Math.max(0, radius * radius - x * x));
    const room = direction < 0 ? startY + half : half - startY;
    // Ticks stay short: a full-range climb reads as a stub, not a spike —
    // capped at half the ring so above/below never dominates the blip.
    const desired = Math.max(3, magnitude * radius * 0.4) * ratio;
    const inward = room - 2 * ratio;
    let length;
    if (inward >= 1.5 * ratio) {
        length = Math.min(desired, inward);
    }
    else {
        const limit = direction < 0 ? -(canvasHeight ?? radius * 2) * 0.5 : (canvasHeight ?? radius * 2) * 0.5;
        const outward = direction < 0 ? startY - limit : limit - startY;
        length = Math.min(desired, Math.max(0, outward - ratio));
    }
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
const GAME_VERSION = '0.7.31';
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
    cairn: Object.freeze({ shipX: 820, shipY: 600, shadowX: 770, shadowY: 720, shipScale: 1.15, shadowScale: 1.15, services: { x: 240, y: 480 }, market: { x: 1000, y: 450 }, bar: { x: 1350, y: 440 } }),
    'meridian-prime': Object.freeze({ shipX: 500, shipY: 620, shadowX: 450, shadowY: 735, shipScale: 1.18, shadowScale: 1.18, services: { x: 1320, y: 620 }, market: { x: 1380, y: 360 }, bar: { x: 1050, y: 480 } }),
    argent: Object.freeze({ shipX: 840, shipY: 600, shadowX: 790, shadowY: 705, shipScale: 1.18, shadowScale: 1.18, services: { x: 440, y: 500 }, market: { x: 1320, y: 500 }, bar: { x: 650, y: 300 } }),
    'gatehouse-twelve': Object.freeze({ shipX: 560, shipY: 600, shadowX: 510, shadowY: 710, shipScale: 1.08, shadowScale: 1.08, services: { x: 260, y: 420 }, market: { x: 1100, y: 400 }, bar: { x: 1300, y: 300 } }),
    blackglass: Object.freeze({ shipX: 420, shipY: 620, shadowX: 370, shadowY: 730, shipScale: 1.05, shadowScale: 1.05, services: { x: 1320, y: 700 }, market: { x: 1260, y: 480 }, bar: { x: 1250, y: 250 } }),
    cinder: Object.freeze({ shipX: 1130, shipY: 610, shadowX: 1070, shadowY: 725, shipScale: 1.15, shadowScale: 1.15, services: { x: 1280, y: 520 }, market: { x: 250, y: 680 }, bar: { x: 300, y: 350 } }),
    torchwell: Object.freeze({ shipX: 840, shipY: 600, shadowX: 790, shadowY: 710, shipScale: 1.05, shadowScale: 1.05, services: { x: 420, y: 540 }, market: { x: 700, y: 480 }, bar: { x: 900, y: 470 } }),
    nacre: Object.freeze({ shipX: 390, shipY: 610, shadowX: 340, shadowY: 720, shipScale: 1.1, shadowScale: 1.1, services: { x: 40, y: 650 }, market: { x: 900, y: 410 }, bar: { x: 340, y: 390 } }),
    boreal: Object.freeze({ shipX: 1230, shipY: 640, shadowX: 1175, shadowY: 750, shipScale: 1.15, shadowScale: 1.15, services: { x: 300, y: 620 }, market: { x: 650, y: 540 }, bar: { x: 960, y: 330 } }),
    shepherd: Object.freeze({ shipX: 450, shipY: 610, shadowX: 400, shadowY: 710, shipScale: 1.05, shadowScale: 1.05, services: { x: 690, y: 560 }, market: { x: 900, y: 450 }, bar: { x: 370, y: 360 } }),
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
const OUTFIT_CATEGORY_KEYS = Object.freeze({ guns: 'GUNS', launchers: 'LAUNCHER', drive: 'DRIVE', defense: 'DEFENSE', utility: 'UTILITY' });
const OUTFIT_CATEGORY_TO_KEY = Object.freeze({ gun: 'guns', launcher: 'launchers', drive: 'drive', defense: 'defense', utility: 'utility' });
const OUTFIT_DEALER_CATEGORIES = Object.freeze({
    guns: Object.freeze({ label: 'GUNS', accepts: ['gun'] }),
    launchers: Object.freeze({ label: 'MISSILES', accepts: ['launcher'] }),
    systems: Object.freeze({ label: 'SYSTEMS', accepts: ['drive', 'defense', 'utility'] }),
    locker: Object.freeze({ label: 'LOCKER', accepts: ['gun', 'launcher', 'drive', 'defense', 'utility'] }),
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
    marketCommodityId = commodityIds[0];
    marketQuantity = 1;
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
    mapView = 'sector';
    lastHud;
    npcLineIndex = new Map();
    cockpitShipId = 'wayfarer';
    vesperPreviewShipId = INITIAL_PREVIEW_SHIP_ID;
    vesperLaunchTransition = false;
    vesperLaunchTimer;
    // The dealer is item-first: select hardware, then one compatible bay, and
    // confirm that single transaction. No fleet tabs or multi-step draft live
    // behind the screen.
    outfittingItemId;
    outfittingMountId;
    outfittingCategory = 'guns';
    outfittingNotice;
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
          <div class="cockpit-screen cockpit-screen-own" role="button" tabindex="0" aria-label="${t('Own ship status display; tap to open ship menu')}">
            <div class="screen-standoff" id="screen-standoff" data-tone="danger"><span>${t('STANDOFF')}</span><b id="screen-standoff-demand"></b><em id="screen-standoff-timer">9</em></div>
            <div class="screen-race-strip" id="screen-race-strip"><span id="screen-race-label"></span><b id="screen-race-value"></b></div>
            <div class="screen-ship-layout"><div class="screen-flight"><div><span>${t('SPD')}</span><b id="screen-own-speed">0</b><small id="screen-own-max-speed">/100</small></div><div><span>${t('FUEL')}</span><b id="screen-own-fuel">100</b><small>%</small></div><div><span>${t('HOLD')}</span><b id="screen-own-cargo">0.0</b><small id="screen-own-cargo-cap">/32</small></div></div><div class="screen-own-weapon" id="screen-own-weapon" data-touch-action="weaponCycle" data-venting="false" role="button" tabindex="0" title="${t('Switch fire group — press X or tap')}"><span id="screen-own-weapon-name"></span><em id="screen-own-weapon-ammo">∞</em></div><canvas class="hull-outline" id="own-hull-outline" aria-hidden="true"></canvas><div class="screen-bars"><div><span>${t('SHIELDS')}</span><i><b id="screen-own-shield"></b></i><em id="screen-own-shield-value">90</em></div><div><span>${t('ENERGY')}</span><i><b id="screen-own-energy"></b></i><em id="screen-own-energy-value">72</em></div><div><span>${t('HULL')}</span><i><b id="screen-own-hull"></b></i><em id="screen-own-hull-value">185</em></div></div><div class="screen-ticker screen-event-ticker" id="screen-event-ticker" data-tone="info"></div></div>
          </div>
          <div class="cockpit-screen cockpit-screen-radar" aria-label="${t('Radar display; tap to open navigation map')}">
            <div class="screen-heading radar-heading" id="screen-radar-transponder" data-touch-action="transponder" role="button" tabindex="0" title="${t('Transponder — press B')}">${t('TRANSPONDER ON')}</div>
            <div class="radar-screen-wrap"><canvas id="radar" width="220" height="220" role="button" tabindex="0" aria-label="${t('Open navigation map')}"></canvas></div>
          </div>
          <div class="cockpit-screen cockpit-screen-target" data-touch-action="targetNext" aria-label="${t('Target status display; tap to cycle targets')}">
            <div class="screen-heading"><span>${t('TARGET STATUS')}</span><b id="screen-target-name">${t('NO LOCK')}</b></div>
            <div id="screen-target-distance" class="screen-target-distance">—</div>
            <div id="screen-target-readout" class="screen-target-readout">—</div>
            <div class="screen-target-layout"><canvas class="hull-outline" id="target-hull-outline" aria-hidden="true"></canvas><div class="screen-bars"><div><span>${t('SHIELDS')}</span><i><b id="screen-target-shield"></b></i><em id="screen-target-shield-value">—</em></div><div><span>${t('HULL')}</span><i><b id="screen-target-hull"></b></i><em id="screen-target-hull-value">—</em></div></div></div>
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
            const target = event.target.closest('[data-ui-command], [data-map-view], [data-dock-tab], [data-dock-terminal], [data-dock-hotspot], [data-market-point], [data-commodity-id], [data-market-qty], [data-bar-panel], [data-nav-id], [data-trade], [data-jettison], [data-mission-id], [data-outfit-slot], [data-outfit-item], [data-outfit-view], [data-outfit-group], [data-outfit-action], [data-equipment-id], [data-ship-id], [data-ship-detail], [data-ship-detail-back], [data-guild-id], [data-person-id], [data-map-target-kind], [data-arena-env], [data-arena-scenario], [data-arena-difficulty], [data-pay-mug]');
            if (!target)
                return;
            if (target.dataset.uiCommand)
                this.handleCommand(target.dataset.uiCommand, target);
            else if (target.dataset.mapView)
                this.setMapView(target.dataset.mapView);
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
            else if (target.dataset.outfitSlot) {
                this.selectOutfittingMount(target.dataset.outfitSlot);
            }
            else if (target.dataset.outfitView) {
                this.setOutfittingView(target.dataset.outfitView);
            }
            else if (target.dataset.outfitItem) {
                this.installOutfittingItem(target.dataset.outfitItem);
            }
            else if (target.dataset.outfitGroup) {
                this.setOutfittingFireGroup(target.dataset.outfitGroup);
            }
            else if (target.dataset.outfitAction) {
                this.handleOutfittingAction(target.dataset.outfitAction);
            }
            else if (target.dataset.commodityId) {
                this.selectMarketCommodity(target.dataset.commodityId);
            }
            else if (target.dataset.marketQty) {
                this.setMarketQuantity(target.dataset.marketQty);
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
        this.root.addEventListener('error', (event) => {
            const image = event.target;
            if (!(image instanceof HTMLImageElement))
                return;
            if (image.matches('.commodity-art img'))
                image.closest('.commodity-art')?.classList.add('is-missing');
            else if (image.matches('.outfit-item-art'))
                image.closest('.outfit-item-art-wrap')?.classList.add('is-missing');
        }, true);
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
        this.root.addEventListener('change', (event) => {
            const element = event.target;
            if (!(element instanceof HTMLSelectElement) || !element.matches('[data-outfit-select]'))
                return;
            this.installOutfittingItem(element.value);
        });
        this.root.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            const target = event.target.closest('[data-ui-command], [data-dock-hotspot], [data-market-point], [data-bar-panel], [data-person-id], [data-ship-detail], [data-ship-detail-back], [data-outfit-slot], [data-outfit-item], [data-outfit-view], [data-outfit-group], [data-outfit-action]');
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
        this.resetOutfittingDrafts();
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
        this.resetOutfittingDrafts();
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
        const prevMarketPoint = dock.dataset.marketPoint ?? '';
        const prevBarPanel = dock.dataset.barPanel ?? '';
        const prevBarPerson = dock.dataset.barPerson ?? '';
        const prevScroll = dock.querySelector('.dock-content')?.scrollTop ?? 0;
        dock.style.setProperty('--dock-accent', location.accent);
        dock.style.setProperty('--dock-secondary', location.secondary);
        dock.dataset.location = this.dockLocation;
        dock.dataset.tab = this.dockTab;
        dock.dataset.terminal = this.dockTerminal;
        dock.dataset.marketPoint = this.marketPoint ?? '';
        dock.dataset.barPanel = this.barPanel ?? '';
        dock.dataset.barPerson = this.barPersonId ?? '';
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
        const preserveScroll = prevTab === this.dockTab
            && prevTerminal === this.dockTerminal
            && prevMarketPoint === (this.marketPoint ?? '')
            && prevBarPanel === (this.barPanel ?? '')
            && prevBarPerson === (this.barPersonId ?? '');
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
        const concourseShipScale = anchors.shipScale ?? (this.dockLocation === 'rook' ? 0.86 : 1);
        const concourseShadowScale = anchors.shadowScale ?? (this.dockLocation === 'rook' ? 0.9 : 1);
        layer.style.setProperty('--vesper-ship-left', anchorX(shipAnchorX));
        layer.style.setProperty('--vesper-ship-top', anchorY(shipAnchorY));
        layer.style.setProperty('--vesper-ship-width', `${(profile.width * scale * concourseShipScale).toFixed(2)}px`);
        layer.style.setProperty('--vesper-ship-angle', `${profile.angle + (anchors.angleOffset ?? 0)}deg`);
        layer.style.setProperty('--vesper-ship-bob', `${(profile.bob * scale * concourseShipScale).toFixed(2)}px`);
        layer.style.setProperty('--vesper-shadow-left', anchorX(shadowAnchorX));
        layer.style.setProperty('--vesper-shadow-top', anchorY(shadowAnchorY));
        layer.style.setProperty('--vesper-shadow-width', `${(profile.shadowWidth * scale * concourseShadowScale).toFixed(2)}px`);
        layer.style.setProperty('--vesper-shadow-height', `${(58 * scale * concourseShadowScale).toFixed(2)}px`);
        layer.style.setProperty('--vesper-shadow-angle', `${anchors.shadowAngle ?? 3}deg`);
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
        if (tab === 'services' && hasAnyLocationService(this.dockLocation, ['repair', 'fuel']))
            return this.renderServices();
        switch (tab) {
            case 'bar':
                if (!hasAnyLocationService(this.dockLocation, ['bar', 'missions', 'race']))
                    return this.renderConcourse();
                return this.renderBar();
            case 'market':
                if (!hasAnyLocationService(this.dockLocation, ['market', 'outfitting', 'shipyard']))
                    return this.renderConcourse();
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
        const serviceDesk = hasAnyLocationService(this.dockLocation, ['repair', 'fuel']);
        const market = hasAnyLocationService(this.dockLocation, ['market', 'outfitting', 'shipyard']);
        const bar = hasAnyLocationService(this.dockLocation, ['bar', 'missions', 'race']);
        const raceOnly = hasLocationService(this.dockLocation, 'race') && !hasLocationService(this.dockLocation, 'missions');
        const contractsOnly = hasLocationService(this.dockLocation, 'missions') && !hasLocationService(this.dockLocation, 'bar');
        const deskLabel = raceOnly ? t('RACE DESK') : contractsOnly ? t('CONTRACTS') : t('BAR');
        const deskDetail = raceOnly ? t('Pilots and race entries') : contractsOnly ? t('Local contract terminal') : t('Guilds and missions');
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
          ${serviceDesk ? `<div class="scene-pointer concourse-pointer-services" data-dock-hotspot="services" role="button" tabindex="0" aria-label="${t('Open services')}"><i>⚙</i><b>${t('SERVICES')}</b><small>${hasLocationService(this.dockLocation, 'repair') && hasLocationService(this.dockLocation, 'fuel') ? t('Repair and refuel') : hasLocationService(this.dockLocation, 'repair') ? t('Repair bay') : t('Fuel and ordnance')}</small></div>` : ''}
          ${market ? `<div class="scene-pointer concourse-pointer-market" data-dock-hotspot="market" role="button" tabindex="0" aria-label="${t('Enter the market')}"><i>▣</i><b>${t('MARKET')}</b><small>${hasLocationService(this.dockLocation, 'market') ? t('Trade and fit out') : t('Ship services')}</small></div>` : ''}
          ${bar ? `<div class="scene-pointer concourse-pointer-bar" data-dock-hotspot="bar" role="button" tabindex="0" aria-label="${escapeHtml(deskLabel)}"><i>✦</i><b>${deskLabel}</b><small>${deskDetail}</small></div>` : ''}
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
        const missionDesk = hasAnyLocationService(this.dockLocation, ['missions', 'race']);
        const guildDesk = hasLocationService(this.dockLocation, 'missions');
        if (this.barPanel === 'missions')
            return this.renderMissions();
        if (this.barPanel === 'guilds')
            return this.renderGuilds();
        if (this.barPersonId)
            return this.renderBarDialogue(this.barPersonId);
        return `
      <div class="bar-scene station-scene" aria-label="${t('Bar points of interest')}">
        <div class="scene-pointers" aria-label="${t('Bar actions')}">
          ${missionDesk ? `<div class="scene-pointer bar-pointer-missions" data-bar-panel="missions" role="button" tabindex="0" aria-label="${t('Open the mission board')}"><i>✦</i><b>${hasLocationService(this.dockLocation, 'race') && !hasLocationService(this.dockLocation, 'missions') ? t('RACE BOARD') : t('MISSION BOARD')}</b><small>${hasLocationService(this.dockLocation, 'race') ? t('Enter a course') : t('Find work')}</small></div>` : ''}
          ${guildDesk ? `<div class="scene-pointer bar-pointer-guilds" data-bar-panel="guilds" role="button" tabindex="0" aria-label="${t('Open guilds')}"><i>◇</i><b>${t('GUILDS')}</b><small>${t('Find allies')}</small></div>` : ''}
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
        const routes = person.marketTipster ? currentProfitableRoutes(this.save.world, this.dockLocation, 3) : [];
        const route = routes.length ? routes[lineIndex % routes.length] : undefined;
        const marketTip = route
            ? t('Load {commodity} here at {buyPrice}. {destination} is paying {sellPrice} — about {profit} per unit if the board holds.', {
                commodity: t(COMMODITIES[route.commodityId].name),
                buyPrice: formatCredits(route.buyPrice),
                destination: LOCATIONS[route.destinationId].name,
                sellPrice: formatCredits(route.sellPrice),
                profit: formatCredits(route.profitPerUnit),
            })
            : undefined;
        // The first line from each port's market-connected regular is always a
        // live, truthful outbound route. Their authored conversation follows,
        // then the current board tip cycles back in on the next round.
        const lines = marketTip ? [marketTip, ...person.lines] : person.lines;
        const activeLine = lineIndex % lines.length;
        const line = lines[activeLine];
        const liveTip = Boolean(marketTip) && activeLine === 0;
        return `
      <div class="bar-dialogue-screen station-scene" aria-label="${t('Conversation with {name}', { name: person.name })}">
        <div class="scene-pointer scene-return-pointer" data-ui-command="bar-scene" role="button" tabindex="0" aria-label="${t('Return to the bar')}"><i>◀</i><b>${t('BAR FLOOR')}</b><small>${t('Back to the room')}</small></div>
        <section class="bar-dialogue-card" data-person-id="${person.id}" role="button" tabindex="0" aria-label="${t('Continue talking to {name}', { name: person.name })}">
          ${this.portraitImage(person.id, person.name)}
          <div><span class="eyebrow">${escapeHtml(person.name)} / ${escapeHtml(t(person.affiliation))}</span><h3>${escapeHtml(t(person.role))}</h3>${liveTip ? `<b class="live-route-tip">${t('LIVE ROUTE TIP · CURRENT BOARD')}</b>` : ''}<p>“${escapeHtml(t(line))}”</p></div>
        </section>
      </div>
    `;
    }
    renderMarket() {
        const commodityMarket = hasLocationService(this.dockLocation, 'market');
        const outfitting = hasLocationService(this.dockLocation, 'outfitting');
        const shipyard = hasLocationService(this.dockLocation, 'shipyard');
        if (!this.marketPoint) {
            return `
        <div class="market-scene station-scene" aria-label="${t('Market points of interest')}">
          <div class="scene-pointers" aria-label="${t('Market actions')}">
            ${commodityMarket ? `<div class="scene-pointer market-pointer-commodities" data-market-point="commodities" role="button" tabindex="0" aria-label="${t('Open commodity market')}"><i>▦</i><b>${t('COMMODITY MARKET')}</b><small>${t('Buy and sell cargo')}</small></div>` : ''}
            ${outfitting ? `<div class="scene-pointer market-pointer-equipment" data-market-point="equipment" role="button" tabindex="0" aria-label="${t('Open ship parts')}"><i>⚙</i><b>${t('SHIP PARTS')}</b><small>${t('Fit out your ship')}</small></div>` : ''}
            ${shipyard ? `<div class="scene-pointer market-pointer-shipyard" data-market-point="shipyard" role="button" tabindex="0" aria-label="${t('Open the ship dealer')}"><i>↗</i><b>${t('NEW SHIP')}</b><small>${t('Hulls for sale')}</small></div>` : ''}
            ${this.denUnlockedAt(this.dockLocation) ? `<div class="scene-pointer market-pointer-den" data-market-point="den" role="button" tabindex="0" aria-label="${t('Enter the smuggler\'s den')}"><i>☣</i><b>${t('SMUGGLER\'S DEN')}</b><small>${t('Black-market prices')}</small></div>` : ''}
          </div>
        </div>
      `;
        }
        return `
      <div class="market-screen market-menu-screen">
        <div class="scene-pointer scene-return-pointer" data-ui-command="market-overview" role="button" tabindex="0" aria-label="${t('Return to the market floor')}"><i>◀</i><b>${t('MARKET FLOOR')}</b><small>${t('Back to the scene')}</small></div>
        <nav class="market-points" aria-label="${t('Market points')}">${commodityMarket ? `<button class="${this.marketPoint === 'commodities' ? 'active' : ''}" data-market-point="commodities">${t('COMMODITY MARKET')}</button>` : ''}${outfitting ? `<button class="${this.marketPoint === 'equipment' ? 'active' : ''}" data-market-point="equipment">${t('SHIP PARTS')}</button>` : ''}${shipyard ? `<button class="${this.marketPoint === 'shipyard' ? 'active' : ''}" data-market-point="shipyard">${t('NEW SHIP')}</button>` : ''}${this.denUnlockedAt(this.dockLocation) ? `<button class="${this.marketPoint === 'den' ? 'active' : ''}" data-market-point="den">${t('SMUGGLER\'S DEN')}</button>` : ''}</nav>
        <div id="market-point-content"></div>
      </div>
    `;
    }
    openMarketPoint(point) {
        const allowed = point === 'commodities' ? hasLocationService(this.dockLocation, 'market')
            : point === 'equipment' ? hasLocationService(this.dockLocation, 'outfitting')
                : point === 'shipyard' ? hasLocationService(this.dockLocation, 'shipyard')
                    : point === 'den' ? this.denUnlockedAt(this.dockLocation)
                        : false;
        if (!allowed)
            return;
        this.marketPoint = point;
        this.dockTab = 'market';
        this.dockTerminal = 'market';
        if (point === 'commodities' && !COMMODITIES[this.marketCommodityId])
            this.marketCommodityId = commodityIds[0];
        if (point === 'den')
            this.marketCommodityId = commodityIds.find((id) => !COMMODITIES[id].legal) ?? commodityIds[0];
        this.renderDock();
    }
    selectMarketCommodity(commodityId) {
        if (!COMMODITIES[commodityId])
            return;
        if (this.marketPoint === 'den' && COMMODITIES[commodityId].legal)
            return;
        this.marketCommodityId = commodityId;
        this.marketQuantity = 1;
        this.renderMarketPoint(this.marketPoint || 'commodities');
    }
    setMarketQuantity(command) {
        const current = Math.max(1, Math.floor(this.marketQuantity || 1));
        if (command === 'minus')
            this.marketQuantity = Math.max(1, current - 1);
        else if (command === 'plus')
            this.marketQuantity = Math.min(999, current + 1);
        else if (command === 'one')
            this.marketQuantity = 1;
        else if (command === 'five')
            this.marketQuantity = 5;
        this.renderMarketPoint(this.marketPoint || 'commodities');
    }
    commodityArt(commodity, size = 'thumb') {
        return `<figure class="commodity-art commodity-art-${size}" style="--commodity-accent:${commodity.accent}" aria-hidden="true"><span>${escapeHtml(commodity.name.slice(0, 2).toUpperCase())}</span><img src="${commodity.image}" alt="" decoding="async"></figure>`;
    }
    marketCondition(item) {
        const spread = item.supply - item.demand;
        if (spread >= 16)
            return { label: t('SURPLUS'), className: 'surplus' };
        if (spread <= -16)
            return { label: t('SHORTAGE'), className: 'shortage' };
        return { label: t('BALANCED'), className: 'balanced' };
    }
    marketPriceBand(price, commodity) {
        if (price < commodity.basePrice * 0.9)
            return { label: t('LOW'), className: 'low' };
        if (price > commodity.basePrice * 1.15)
            return { label: t('HIGH'), className: 'high' };
        return { label: t('NOMINAL'), className: 'nominal' };
    }
    marketIntelEntry(locationId, commodityId) {
        const location = this.save.world.marketIntel?.[locationId];
        return location?.[commodityId] ?? location?.prices?.[commodityId];
    }
    marketTrend(price, intel) {
        const previous = intel?.previousPrice;
        if (!Number.isFinite(previous) || previous === price)
            return { label: t('STEADY'), symbol: '—', className: 'steady' };
        return price > previous
            ? { label: t('RISING'), symbol: '▲', className: 'rising' }
            : { label: t('FALLING'), symbol: '▼', className: 'falling' };
    }
    marketAge(seenAt) {
        if (!Number.isFinite(seenAt))
            return t('UNKNOWN AGE');
        const age = Math.max(0, this.save.world.time - seenAt);
        return age < 10 ? t('JUST NOW') : t('{time} AGO', { time: formatDuration(age) });
    }
    tradeFailureLabel(reason) {
        if (reason === 'stock' || reason === 'out-of-stock')
            return t('Market stock exhausted.');
        if (reason === 'credits' || reason === 'insufficient-credits')
            return t('Insufficient credits.');
        if (reason === 'capacity' || reason === 'insufficient-capacity')
            return t('Cargo hold has insufficient free mass.');
        if (reason === 'cargo' || reason === 'owned' || reason === 'no-cargo')
            return t('No matching cargo in the hold.');
        return t('Trade unavailable.');
    }
    renderCommodityExchange(den = false) {
        const market = this.save.world.market[this.dockLocation];
        const ids = commodityIds.filter((id) => den ? !COMMODITIES[id].legal : true);
        if (!ids.includes(this.marketCommodityId))
            this.marketCommodityId = ids[0];
        const commodityId = this.marketCommodityId;
        const commodity = COMMODITIES[commodityId];
        const item = market[commodityId];
        const owned = this.save.player.cargo[commodityId] ?? 0;
        const price = den ? denPrice(this.dockLocation, commodityId, item, this.save.world.seed, this.save.world.economyClock) ?? 0 : item.lastPrice;
        const quantity = Math.max(1, Math.min(999, Math.floor(this.marketQuantity || 1)));
        const buyQuote = quoteCommodityTrade(this.save, this.dockLocation, commodityId, 'buy', quantity, price);
        const sellQuote = quoteCommodityTrade(this.save, this.dockLocation, commodityId, 'sell', quantity, price);
        const maxBuy = quoteCommodityTrade(this.save, this.dockLocation, commodityId, 'buy', 999, price);
        const sellAll = quoteCommodityTrade(this.save, this.dockLocation, commodityId, 'sell', 999, price);
        const condition = this.marketCondition(item);
        const band = this.marketPriceBand(price, commodity);
        const intel = this.marketIntelEntry(this.dockLocation, commodityId);
        const trend = this.marketTrend(price, intel);
        const remoteQuotes = den ? [] : knownMarketQuotes(this.save.world, commodityId, this.dockLocation);
        const bestRoute = den ? undefined : bestKnownTradeRoute(this.save.world, this.dockLocation, commodityId);
        const localLegal = commodityIds.filter((id) => COMMODITIES[id].legal);
        const bestLocalBuy = [...localLegal].sort((a, b) => market[a].lastPrice / COMMODITIES[a].basePrice - market[b].lastPrice / COMMODITIES[b].basePrice)[0];
        const strongestDemand = [...localLegal].sort((a, b) => (market[b].demand - market[b].supply) - (market[a].demand - market[a].supply))[0];
        const quoteLine = (quote) => quote.quantity > 0
            ? t('{quantity} units · {total} · {mass} mass', { quantity: quote.quantity, total: formatCredits(quote.total), mass: Math.abs(quote.massDelta ?? commodity.mass * quote.quantity).toFixed(1) })
            : this.tradeFailureLabel(quote.reason);
        const catalog = ids.map((id) => {
            const entry = COMMODITIES[id];
            const stock = market[id];
            const entryPrice = den ? denPrice(this.dockLocation, id, stock, this.save.world.seed, this.save.world.economyClock) ?? 0 : stock.lastPrice;
            const entryBand = this.marketPriceBand(entryPrice, entry);
            const entryCondition = this.marketCondition(stock);
            const entryOwned = this.save.player.cargo[id] ?? 0;
            return `<button type="button" class="commodity-card ${id === commodityId ? 'selected' : ''} ${entry.legal ? '' : 'restricted'}" data-commodity-id="${id}" role="option" aria-selected="${id === commodityId}" style="--commodity-accent:${entry.accent}">
              ${this.commodityArt(entry)}
              <span class="commodity-card-copy"><b>${escapeHtml(t(entry.name))}</b><small>${escapeHtml(t(entry.packaging))} · ${entry.mass} ${t('MASS')}</small><em class="market-condition ${entryCondition.className}">${entryCondition.label}</em></span>
              <span class="commodity-card-price"><b>${formatCredits(entryPrice)}</b><small class="price-${entryBand.className}">${entryBand.label}</small><em>${t('HOLD')} ${entryOwned}</em></span>
            </button>`;
        }).join('');
        const quoteRows = remoteQuotes.length ? remoteQuotes.slice(0, 4).map((quote) => {
            const margin = quote.price - price;
            return `<li class="${margin > 0 ? 'profitable' : margin < 0 ? 'loss' : ''}"><span><b>${escapeHtml(LOCATIONS[quote.locationId]?.shortName ?? quote.locationId)}</b><small>${this.marketAge(quote.seenAt)}</small></span><strong>${formatCredits(quote.price)}</strong><em>${margin > 0 ? '+' : margin < 0 ? '−' : ''}${formatCredits(Math.abs(margin))}/${t('UNIT')}</em></li>`;
        }).join('') : `<li class="market-intel-empty">${t('Visit another port to record a comparison price.')}</li>`;
        const routeCallout = bestRoute?.profitPerUnit > 0
            ? `<div class="best-known-route"><span>${t('BEST KNOWN ROUTE')}</span><b>${escapeHtml(LOCATIONS[bestRoute.destinationId]?.shortName ?? bestRoute.destinationId)} · +${formatCredits(bestRoute.profitPerUnit)}/${t('UNIT')}</b><small>${t('Estimate from your last observed destination price.')}</small></div>`
            : `<div class="best-known-route muted"><span>${t('BEST KNOWN ROUTE')}</span><b>${t('NO PROFITABLE QUOTE RECORDED')}</b><small>${t('Visit ports or ask around at the bar.')}</small></div>`;
        return `
        <div class="market-layout commodity-exchange ${den ? 'is-den' : ''}">
          <div class="table-title commodity-market-title"><div><span class="eyebrow">${den ? t('UNLICENSED EXCHANGE') : t('COMMODITY EXCHANGE')}</span><h3>${den ? t('Smuggler\'s den') : t('Cargo catalog')}</h3></div><div><span>${t('HOLD')}</span><b>${cargoMass(this.save.player).toFixed(1)} / ${cargoCapacity(this.save.player)} ${t('MASS')}</b></div></div>
          ${den ? '' : `<div class="market-opportunity-strip"><span><small>${t('BEST LOCAL BUY')}</small><b>${escapeHtml(t(COMMODITIES[bestLocalBuy].name))} · ${formatCredits(market[bestLocalBuy].lastPrice)}</b></span><span><small>${t('STRONGEST LOCAL DEMAND')}</small><b>${escapeHtml(t(COMMODITIES[strongestDemand].name))}</b></span><em>${t('Remote quotes are last-known, not live.')}</em></div>`}
          <div class="commodity-market-shell">
            <div class="commodity-catalog" role="listbox" aria-label="${t('Commodities')}">${catalog}</div>
            <section class="trade-ticket ${commodity.legal ? '' : 'restricted'}" style="--commodity-accent:${commodity.accent}">
              <div class="trade-ticket-hero">${this.commodityArt(commodity, 'hero')}<div><span class="eyebrow">${escapeHtml(t(commodity.category))} · ${escapeHtml(t(commodity.packaging))}</span><h3>${escapeHtml(t(commodity.name))}</h3><p>${escapeHtml(t(commodity.description))}</p><blockquote>${escapeHtml(t(commodity.flavor))}</blockquote></div></div>
              <div class="trade-market-readout">
                <div><span>${t('UNIT PRICE')}</span><b>${formatCredits(price)}</b><small class="price-${band.className}">${band.label}</small></div>
                <div><span>${t('MARKET')}</span><b>${condition.label}</b><small>${item.supply} ${t('SUPPLY')} / ${item.demand} ${t('DEMAND')}</small></div>
                <div><span>${t('DIRECTION')}</span><b class="price-${trend.className}">${trend.symbol} ${trend.label}</b><small>${intel?.previousPrice ? t('SINCE LAST VISIT') : t('FIRST RECORDED QUOTE')}</small></div>
                <div><span>${t('YOUR HOLD')}</span><b>${owned} ${t('UNITS')}</b><small>${(owned * commodity.mass).toFixed(1)} ${t('MASS')}</small></div>
              </div>
              <div class="trade-quantity"><span>${t('QUANTITY')}</span><div><button type="button" data-market-qty="minus" aria-label="${t('Decrease quantity')}">−</button><output>${quantity}</output><button type="button" data-market-qty="plus" aria-label="${t('Increase quantity')}">+</button><button type="button" data-market-qty="one">1</button><button type="button" data-market-qty="five">5</button></div></div>
              <div class="trade-actions-ticket">
                <button type="button" class="trade-buy" data-trade="${den ? 'den-buy' : 'buy'}:${commodityId}:${quantity}" ${buyQuote.quantity > 0 ? '' : 'disabled'}><span>${t('BUY')} ${buyQuote.quantity || quantity}</span><small>${escapeHtml(quoteLine(buyQuote))}</small></button>
                <button type="button" class="trade-sell" data-trade="${den ? 'den-sell' : 'sell'}:${commodityId}:${quantity}" ${sellQuote.quantity > 0 ? '' : 'disabled'}><span>${t('SELL')} ${sellQuote.quantity || quantity}</span><small>${escapeHtml(quoteLine(sellQuote))}</small></button>
                <button type="button" data-trade="${den ? 'den-buy' : 'buy'}:${commodityId}:999" ${maxBuy.quantity > 0 ? '' : 'disabled'}>${t('BUY MAX')} · ${maxBuy.quantity}</button>
                <button type="button" data-trade="${den ? 'den-sell' : 'sell'}:${commodityId}:999" ${sellAll.quantity > 0 ? '' : 'disabled'}>${t('SELL ALL')} · ${sellAll.quantity}</button>
              </div>
              ${den ? `<p class="den-footnote">${t('Untraceable cargo. The den pays off-manifest and never writes the transaction to a licensed manifest.')}</p>` : `<div class="route-intelligence">${routeCallout}<ol>${quoteRows}</ol></div>`}
            </section>
          </div>
        </div>`;
    }
    renderMarketPoint(point) {
        const content = this.root.querySelector('#market-point-content');
        const marketScreen = this.root.querySelector('.market-screen');
        if (!content || !marketScreen || !this.save || !this.dockLocation)
            return;
        const changedPoint = this.marketPoint !== point;
        const prevItemScroll = content.querySelector('.dealer-item-list')?.scrollTop ?? 0;
        const prevFitScroll = content.querySelector('.dealer-fit-summary')?.scrollTop ?? 0;
        this.marketPoint = point;
        if (point !== 'shipyard')
            this.shipDetailId = undefined;
        this.disposeShipPreviews();
        marketScreen.querySelectorAll('[data-market-point]').forEach((button) => button.classList.toggle('active', button.dataset.marketPoint === point));
        // A commodity selection refreshes the same exchange panel; keep the
        // catalog's scroll anchor instead of bouncing back to the top.
        const prevCatalogScroll = content.querySelector('.commodity-catalog')?.scrollTop ?? 0;
        if (point === 'equipment') {
            content.innerHTML = this.renderOutfitting();
            if (!changedPoint) {
                const itemList = content.querySelector('.dealer-item-list');
                const fitSummary = content.querySelector('.dealer-fit-summary');
                if (itemList)
                    itemList.scrollTop = prevItemScroll;
                if (fitSummary)
                    fitSummary.scrollTop = prevFitScroll;
            }
        }
        else if (point === 'shipyard') {
            content.innerHTML = this.renderShipyard();
            this.mountShipPreviews();
        }
        else {
            content.innerHTML = this.renderCommodityExchange(point === 'den');
            const catalog = content.querySelector('.commodity-catalog');
            if (catalog && prevCatalogScroll > 0)
                catalog.scrollTop = prevCatalogScroll;
        }
        if (changedPoint) {
            marketScreen.scrollTop = 0;
            content.scrollTop = 0;
            const dockContent = marketScreen.closest('.dock-content');
            if (dockContent)
                dockContent.scrollTop = 0;
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
        const raceClock = (seconds) => {
            if (!Number.isFinite(seconds))
                return t('NO TIME');
            const whole = Math.max(0, Math.floor(seconds));
            const tenths = Math.floor((seconds - whole) * 10);
            return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}.${tenths}`;
        };
        const missionCard = (mission) => {
            const locked = Boolean(mission.locked);
            const bestTime = mission.bestTime ?? mission.record?.bestTime;
            const bestRank = mission.bestRank ?? mission.record?.bestRank;
            const bestRankLabel = Number.isFinite(bestRank) ? t(['1ST', '2ND', '3RD', '4TH'][bestRank - 1] ?? `${bestRank}TH`) : '—';
            const recommended = mission.recommendedShipText ?? mission.recommendedShip ?? mission.recommendedShipId;
            const raceMeta = mission.kind === 'race'
                ? `<div class="race-course-meta"><span>${t('TIER {tier}', { tier: mission.tier ?? 1 })}</span><span>${recommended ? t('RECOMMENDED: {ship}', { ship: t(recommended).toUpperCase() }) : t('FIXED TRACK PACE')}</span><span>${Number.isFinite(bestTime) ? t('PERSONAL BEST: {time} · {rank}', { time: raceClock(bestTime), rank: bestRankLabel }) : t('PERSONAL BEST: —')}</span></div>`
                : '';
            const buttonLabel = locked ? t('COURSE LOCKED') : mission.active ? t('ENTRY ACTIVE') : t('ACCEPT CONTRACT');
            return `<article class="mission-card ${mission.kind}${locked ? ' is-locked' : ''}">
              <header><span>${this.missionBadge(mission)}</span><b>${formatCredits(mission.reward)}</b></header>
              <h4>${escapeHtml(t(mission.title))}</h4>
              <p>${escapeHtml(t(mission.briefing))}</p>
              ${raceMeta}
              <dl><div><dt>${t('ISSUER')}</dt><dd>${escapeHtml(t(mission.issuer))}</dd></div><div><dt>${t('DEADLINE')}</dt><dd>${this.deadlineLabel(mission)}</dd></div><div><dt>${t('BOND')}</dt><dd>${formatCredits(mission.deposit)}</dd></div><div><dt>${t('GUILD REP')}</dt><dd>+${mission.guildRep}</dd></div></dl>
              ${locked && mission.unlockLabel ? `<small class="race-unlock-note">${escapeHtml(t(mission.unlockLabel))}</small>` : ''}
              <button class="primary compact" data-mission-id="${mission.id}" ${locked || mission.active ? 'disabled' : ''}>${buttonLabel}</button>
            </article>`;
        };
        return `
      <div class="mission-layout">
        <section>
          <div class="table-title"><div><span class="eyebrow">${t('CONTRACT TERMINAL')}</span><h3>${t('Available work')}</h3></div><small>${t('Maximum 6 active')}</small></div>
          <div class="mission-grid">
            ${offers.length ? offers.map(missionCard).join('') : `<p>${t('No fresh contracts. Launch, trade, or return after the board cycles.')}</p>`}
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
        const repairBay = hasLocationService(this.dockLocation, 'repair');
        const fuelDepot = hasLocationService(this.dockLocation, 'fuel');
        return `
      <div class="service-grid">
        ${repairBay ? `<article class="service-card"><span class="eyebrow">${t('HULL INTEGRITY')}</span><h3>${t('Repair bay')}</h3><div class="service-bars"><label>${t('HULL INTEGRITY')} <i><b style="width:${percent(this.save.player.hull, stats.hull)}%"></b></i><em>${Math.ceil(this.save.player.hull)}/${stats.hull}</em></label></div><p>${t('Replace ablative plate, patch pressure structure, and clear combat faults.')}</p><button class="primary" data-ui-command="repair" ${repairs <= 0 ? 'disabled' : ''}>${t('REPAIR')} · ${formatCredits(repairs)}</button></article>` : ''}
        ${fuelDepot ? `<article class="service-card"><span class="eyebrow">${t('CONSUMABLES')}</span><h3>${t('Fuel and ordnance')}</h3><div class="service-bars"><label>${t('FUEL')} <i><b style="width:${percent(this.save.player.fuel, stats.fuel)}%"></b></i><em>${Math.ceil(this.save.player.fuel)}/${stats.fuel}</em></label><label>${t('MISSILES')} <i><b style="width:${percent(this.save.player.missiles, stats.missileCapacity)}%"></b></i><em>${this.save.player.missiles}/${stats.missileCapacity}</em></label></div><p>${t('Refill afterburner propellant, mounted-rack ordnance, and installed gun magazines.')}</p><button class="primary" data-ui-command="refuel" ${refill <= 0 ? 'disabled' : ''}>${t('REFILL')} · ${formatCredits(refill)}</button></article>` : ''}
        <article class="service-card danger-service"><span class="eyebrow">${t('INSURANCE NOTE')}</span><h3>${t('Emergency recovery')}</h3><p>${t('A destroyed ship is towed to the last safe dock. The service retains cargo, mission bonds, and a percentage of liquid credit.')}</p><b>${t('FLY WITH A RESERVE.')}</b></article>
      </div>
    `;
    }
    resetOutfittingDrafts() {
        this.outfittingItemId = undefined;
        this.outfittingMountId = undefined;
        this.outfittingCategory = 'guns';
        this.outfittingNotice = undefined;
    }
    outfittingMountInfo(mountId, shipId = this.save?.player?.shipId) {
        const spec = HARDPOINT_SPECS[shipId];
        if (!spec)
            return undefined;
        for (const key of ['guns', 'launchers', 'drive', 'defense', 'utility']) {
            const index = spec[key].findIndex((mountPoint) => mountPoint.id === mountId);
            if (index >= 0)
                return { key, category: key === 'guns' ? 'gun' : key === 'launchers' ? 'launcher' : key, index, mount: spec[key][index] };
        }
        return undefined;
    }
    outfittingMounts(shipId = this.save?.player?.shipId) {
        const spec = HARDPOINT_SPECS[shipId];
        if (!spec)
            return [];
        return ['guns', 'launchers', 'drive', 'defense', 'utility'].flatMap((key) => spec[key].map((mount, index) => ({
            key,
            category: key === 'guns' ? 'gun' : key === 'launchers' ? 'launcher' : key,
            index,
            mount,
        })));
    }
    outfittingSelectedMount(item = OUTFIT_ITEMS[this.outfittingItemId], loadout = loadoutFor(this.save.player, this.save.player.shipId)) {
        const mounts = this.outfittingMounts();
        const selected = mounts.find((entry) => entry.mount.id === this.outfittingMountId);
        if (selected && (!item || itemFitsMount(item, selected.mount)))
            return selected;
        const compatible = item ? mounts.filter((entry) => itemFitsMount(item, entry.mount)) : mounts;
        // If the chosen module is already mounted, lead with that bay. This
        // makes its remove and fire-group controls visible immediately; an
        // empty compatible bay remains the next choice for a second copy.
        const next = (item ? compatible.find((entry) => loadout?.[entry.key]?.[entry.index] === item.id) : undefined)
            ?? compatible.find((entry) => !loadout?.[entry.key]?.[entry.index])
            ?? compatible[0];
        this.outfittingMountId = next?.mount.id;
        return next;
    }
    outfittingStatsFor(shipId, loadout) {
        const player = this.save?.player;
        if (!player)
            return {};
        const savedOutfitting = player.outfitting && typeof player.outfitting === 'object'
            ? JSON.parse(JSON.stringify(player.outfitting))
            : { schema: 1, locker: {}, loadouts: {} };
        savedOutfitting.loadouts = { ...(savedOutfitting.loadouts ?? {}), [shipId]: loadout };
        return getEffectiveShipStats({ ...player, shipId, outfitting: savedOutfitting });
    }
    outfittingInstalledCount(loadout, itemId) {
        return ['guns', 'launchers', 'drive', 'defense', 'utility'].reduce((count, key) => count + (loadout?.[key] ?? []).filter((id) => id === itemId).length, 0);
    }
    outfittingQuote(draft, options = {}) {
        return quoteOutfitting(this.save.player, this.save.player.shipId, draft, {
            ...options,
            locationId: this.dockLocation,
            cargoMass: cargoMass(this.save.player),
        });
    }
    outfittingErrorLabel(code) {
        const labels = {
            'unknown-ship': t('Unknown hull.'),
            'ship-not-owned': t('This is not your current hull.'),
            'unknown-item': t('Unknown module.'),
            'invalid-item': t('Invalid module assignment.'),
            'incompatible-mount': t('That module does not fit this mount.'),
            'too-many-items': t('Too many modules in this group.'),
            'mass-over-budget': t('Fitting mass exceeded.'),
            'cargo-over-capacity': t('Current cargo would exceed the new capacity.'),
            'duplicate-unique-module': t('This utility can only be fitted once.'),
            'item-unavailable': t('That module is not available at this dock.'),
            'not-enough-stock-to-sell': t('Not enough locker stock to sell.'),
            'insufficient-credits': t('Insufficient credits.'),
            'invalid-credits': t('Credit balance is invalid. Reload the save.'),
            'stale-quote': t('The fitting changed; review and apply again.'),
            'invalid-quote': t('This fitting is no longer valid.'),
        };
        return labels[code] ?? t('Fitting could not be applied.');
    }
    setOutfittingNotice(message, tone = 'info') {
        this.outfittingNotice = { message, tone };
        this.renderMarketPoint('equipment');
    }
    selectOutfittingShip(shipId) {
        if (shipId === this.save?.player?.shipId)
            this.renderMarketPoint('equipment');
    }
    selectOutfittingMount(mountId) {
        const selected = this.outfittingMountInfo(mountId);
        if (!selected)
            return;
        this.outfittingMountId = mountId;
        const item = OUTFIT_ITEMS[this.outfittingItemId];
        const fittedId = loadoutFor(this.save.player, this.save.player.shipId)?.[selected.key]?.[selected.index];
        if (item && !itemFitsMount(item, selected.mount) && fittedId)
            this.outfittingItemId = fittedId;
        this.outfittingNotice = undefined;
        this.renderMarketPoint('equipment');
    }
    setOutfittingView(category) {
        if (!OUTFIT_DEALER_CATEGORIES[category])
            return;
        this.outfittingCategory = category;
        this.outfittingItemId = undefined;
        this.outfittingMountId = undefined;
        this.outfittingNotice = undefined;
        this.renderMarketPoint('equipment');
    }
    installOutfittingItem(itemId) {
        const item = OUTFIT_ITEMS[itemId];
        if (!item)
            return;
        this.outfittingItemId = item.id;
        const loadout = loadoutFor(this.save.player, this.save.player.shipId);
        const selected = this.outfittingMountInfo(this.outfittingMountId);
        if (!selected || !itemFitsMount(item, selected.mount))
            this.outfittingMountId = undefined;
        this.outfittingSelectedMount(item, loadout);
        this.outfittingNotice = undefined;
        this.renderMarketPoint('equipment');
    }
    handleOutfittingAction(action) {
        if (action === 'install')
            this.installSelectedOutfittingItem();
        else if (action === 'remove')
            this.removeSelectedOutfittingItem();
        else if (action === 'sell')
            this.sellSelectedOutfittingItem();
    }
    runOutfittingTransaction(draft, options, successMessage) {
        if (!draft || !this.actions?.applyOutfitting) {
            this.setOutfittingNotice(t('Outfitting is unavailable.'), 'warning');
            return;
        }
        let result;
        try {
            result = this.actions.applyOutfitting(this.save.player.shipId, draft, {
                ...options,
                locationId: this.dockLocation,
                cargoMass: cargoMass(this.save.player),
            });
        }
        catch (error) {
            this.setOutfittingNotice(this.outfittingErrorLabel(error?.code), 'warning');
            return;
        }
        const finish = (outcome) => {
            if (!outcome?.ok) {
                this.setOutfittingNotice(this.outfittingErrorLabel(outcome?.code), 'warning');
                return;
            }
            this.outfittingNotice = { message: successMessage, tone: 'success' };
            this.renderMarketPoint('equipment');
        };
        if (result && typeof result.then === 'function')
            void result.then(finish).catch((error) => this.setOutfittingNotice(this.outfittingErrorLabel(error?.code), 'warning'));
        else
            finish(result);
    }
    installSelectedOutfittingItem() {
        const item = OUTFIT_ITEMS[this.outfittingItemId];
        const actual = loadoutFor(this.save.player, this.save.player.shipId);
        const selected = this.outfittingSelectedMount(item, actual);
        if (!item || !selected)
            return this.setOutfittingNotice(t('Choose an item and a compatible mount.'), 'warning');
        const draft = JSON.parse(JSON.stringify(actual));
        if (draft[selected.key]?.[selected.index] === item.id)
            return;
        draft[selected.key][selected.index] = item.id;
        const quote = this.outfittingQuote(draft);
        if (!quote.ok)
            return this.setOutfittingNotice(this.outfittingErrorLabel(quote.code), 'warning');
        this.runOutfittingTransaction(draft, {}, t('{name} installed. Removed hardware was returned to your locker.', { name: t(item.name) }));
    }
    removeSelectedOutfittingItem() {
        const actual = loadoutFor(this.save.player, this.save.player.shipId);
        const selected = this.outfittingMountInfo(this.outfittingMountId);
        const itemId = selected ? actual[selected.key]?.[selected.index] : undefined;
        if (!selected || !itemId)
            return;
        const draft = JSON.parse(JSON.stringify(actual));
        draft[selected.key][selected.index] = null;
        const quote = this.outfittingQuote(draft);
        if (!quote.ok)
            return this.setOutfittingNotice(this.outfittingErrorLabel(quote.code), 'warning');
        this.runOutfittingTransaction(draft, {}, t('{name} moved to your locker.', { name: t(OUTFIT_ITEMS[itemId]?.name ?? itemId) }));
    }
    sellSelectedOutfittingItem() {
        const item = OUTFIT_ITEMS[this.outfittingItemId];
        if (!item)
            return;
        const actual = loadoutFor(this.save.player, this.save.player.shipId);
        const quote = this.outfittingQuote(actual, { sales: { [item.id]: 1 } });
        if (!quote.ok)
            return this.setOutfittingNotice(this.outfittingErrorLabel(quote.code), 'warning');
        this.runOutfittingTransaction(actual, { sales: { [item.id]: 1 } }, t('{name} sold for {credits}.', { name: t(item.name), credits: formatCredits(quote.resale) }));
    }
    setOutfittingFireGroup(group) {
        if (group !== 'A' && group !== 'B')
            return;
        const shipId = this.save.player.shipId;
        const actual = loadoutFor(this.save.player, shipId);
        const selected = this.outfittingMountInfo(this.outfittingMountId, shipId);
        if (selected?.key !== 'guns')
            return;
        const current = actual.fireGroups?.assignments?.[selected.mount.id] === 'B' ? 'B' : 'A';
        if (current === group)
            return;
        const draft = JSON.parse(JSON.stringify(actual));
        draft.fireGroups ??= { activeGroup: 'A', assignments: {} };
        draft.fireGroups.assignments ??= {};
        draft.fireGroups.assignments[selected.mount.id] = group;
        const active = draft.fireGroups.activeGroup === 'B' ? 'B' : 'A';
        const activeStillHasGun = (HARDPOINT_SPECS[shipId]?.guns ?? []).some((mount, index) => draft.guns?.[index]
            && (draft.fireGroups.assignments[mount.id] === 'B' ? 'B' : 'A') === active);
        if (!activeStillHasGun)
            draft.fireGroups.activeGroup = group;
        const quote = this.outfittingQuote(draft);
        if (!quote.ok)
            return this.setOutfittingNotice(this.outfittingErrorLabel(quote.code), 'warning');
        this.runOutfittingTransaction(draft, {}, t('Bay assigned to fire group {group}.', { group }));
    }
    outfittingStatValue(value, digits = 0) {
        return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
    }
    outfittingItemsForCategory(category = this.outfittingCategory) {
        const config = OUTFIT_DEALER_CATEGORIES[category] ?? OUTFIT_DEALER_CATEGORIES.guns;
        const locker = this.save.player.outfitting?.locker ?? {};
        return OUTFIT_ITEM_IDS.map((id) => OUTFIT_ITEMS[id]).filter((item) => config.accepts.includes(item.category)
            && (category !== 'locker' || Number(locker[item.id] ?? 0) > 0));
    }
    renderOutfittingMountRack(loadout, selectedItem, selectedMount) {
        const shipId = this.save.player.shipId;
        if (!selectedItem)
            return `<p class="dealer-empty">${t('Pick an item to see where it fits.')}</p>`;
        const mounts = ['guns', 'launchers', 'drive', 'defense', 'utility'].flatMap((key) => (HARDPOINT_SPECS[shipId]?.[key] ?? [])
            .map((mount, index) => ({ key, mount, index }))
            .filter(({ mount }) => itemFitsMount(selectedItem, mount)));
        if (!mounts.length)
            return `<p class="dealer-empty">${t('NO COMPATIBLE MOUNT')}</p>`;
        const rows = mounts.map(({ key, mount, index }) => {
            const fitted = OUTFIT_ITEMS[loadout[key]?.[index]];
            const active = selectedMount?.mount.id === mount.id;
            const group = key === 'guns' ? (loadout.fireGroups?.assignments?.[mount.id] === 'B' ? 'B' : 'A') : undefined;
            const mountKind = key === 'guns' ? t('GUN') : t(OUTFIT_CATEGORY_KEYS[key]);
            const label = `${mountKind} ${index + 1} · ${mount.size} · ${fitted ? t(fitted.name) : t('EMPTY')}${group ? ` · ${t('FIRE GROUP')} ${group}` : ''}`;
            return `<button type="button" class="dealer-mount is-compatible ${active ? 'is-selected' : ''} ${fitted ? 'is-filled' : 'is-empty'}" data-outfit-slot="${mount.id}" aria-label="${escapeHtml(label)}" aria-pressed="${active}">
              <span>${mountKind} ${index + 1} <em>${mount.size}${group ? ` · ${group}` : ''}</em></span>
              <b>${fitted ? escapeHtml(t(fitted.name)) : t('EMPTY')}</b>
              <small>${active ? t('SELECTED BAY') : t('CHOOSE THIS BAY')}</small>
            </button>`;
        }).join('');
        return `<div class="dealer-mount-rack" aria-label="${t('Compatible ship mounts')}">${rows}</div>`;
    }
    renderOutfittingItemTile(item, loadout) {
        const selected = item.id === this.outfittingItemId;
        const locker = Number(this.save.player.outfitting?.locker?.[item.id] ?? 0);
        const installed = this.outfittingInstalledCount(loadout, item.id);
        const available = itemAvailable(this.save.player, item, this.dockLocation);
        const ownership = locker > 0 ? t('LOCKER ×{count}', { count: locker }) : installed > 0 ? t('INSTALLED') : formatCredits(item.price);
        return `<button type="button" class="dealer-item-tile ${selected ? 'is-selected' : ''} ${available || locker || installed ? '' : 'is-locked'}" data-outfit-item="${item.id}" aria-pressed="${selected}">
          <figure class="outfit-item-art-wrap"><span>${escapeHtml(t(item.name).slice(0, 2).toUpperCase())}</span><img class="outfit-item-art" src="${escapeHtml(item.artPath ?? item.art)}" alt="" loading="lazy" decoding="async"></figure>
          <span><b>${escapeHtml(t(item.name))}</b><small>${escapeHtml(ownership)}</small></span>
        </button>`;
    }
    renderOutfitting() {
        if (!this.save?.player)
            return '';
        const shipId = this.save.player.shipId;
        if (!OUTFIT_DEALER_CATEGORIES[this.outfittingCategory])
            this.outfittingCategory = 'guns';
        const actualLoadout = loadoutFor(this.save.player, shipId);
        const items = this.outfittingItemsForCategory();
        if (!items.some((item) => item.id === this.outfittingItemId))
            this.outfittingItemId = items[0]?.id;
        const item = OUTFIT_ITEMS[this.outfittingItemId];
        const selected = item ? this.outfittingSelectedMount(item, actualLoadout) : this.outfittingMountInfo(this.outfittingMountId);
        const fitted = selected ? OUTFIT_ITEMS[actualLoadout[selected.key]?.[selected.index]] : undefined;
        const draft = JSON.parse(JSON.stringify(actualLoadout));
        if (item && selected)
            draft[selected.key][selected.index] = item.id;
        const quote = item && selected ? this.outfittingQuote(draft) : { ok: false, code: 'incompatible-mount' };
        const beforeStats = this.outfittingStatsFor(shipId, actualLoadout);
        const afterStats = this.outfittingStatsFor(shipId, draft);
        const usage = outfittingUsage(this.save.player, shipId, draft);
        const locker = this.save.player.outfitting?.locker ?? {};
        const baseQuote = this.outfittingQuote(actualLoadout);
        const lockerCount = item ? Number(locker[item.id] ?? 0) : 0;
        const sellable = item ? Number(baseQuote.sellable?.[item.id] ?? 0) : 0;
        const installedHere = Boolean(item && fitted?.id === item.id);
        const purchaseCount = item ? Number(quote.purchases?.[item.id] ?? 0) : 0;
        const actionLabel = purchaseCount > 0 ? t('BUY & INSTALL') : t('INSTALL FROM LOCKER');
        const actionDetail = quote.ok ? (quote.netCost > 0 ? formatCredits(quote.netCost) : t('NO CHARGE')) : this.outfittingErrorLabel(quote.code);
        const notice = this.outfittingNotice;
        const impactRows = [
            ['HULL INTEGRITY', beforeStats.hull, afterStats.hull, 0],
            ['SHIELD', beforeStats.shield, afterStats.shield, 0],
            ['REACTOR', beforeStats.reactorOutput, afterStats.reactorOutput, 0],
            ['CAPACITOR', beforeStats.energyCapacity, afterStats.energyCapacity, 0],
        ].filter(([, before, after]) => Number(after) !== Number(before)).map(([label, before, after, digits]) => {
            const changed = Number((after - before).toFixed(digits));
            return `<div class="dealer-impact"><span>${t(label)}</span><b>${this.outfittingStatValue(before, digits)} → ${this.outfittingStatValue(after, digits)}</b><em class="${changed > 0 ? 'up' : 'down'}">${changed > 0 ? '+' : ''}${changed.toFixed(digits)}</em></div>`;
        }).join('');
        const categories = Object.entries(OUTFIT_DEALER_CATEGORIES).map(([id, config]) => `<button type="button" class="${id === this.outfittingCategory ? 'is-active' : ''}" data-outfit-view="${id}" aria-pressed="${id === this.outfittingCategory}">${t(config.label)}</button>`).join('');
        const selectedCopy = item ? `<div class="dealer-selected-item">
          <figure class="outfit-item-art-wrap"><span>${escapeHtml(t(item.name).slice(0, 2).toUpperCase())}</span><img class="outfit-item-art" src="${escapeHtml(item.artPath ?? item.art)}" alt="${escapeHtml(t('{name} module art', { name: t(item.name) }))}" decoding="async"></figure>
          <div><span>${t(OUTFIT_CATEGORY_KEYS[OUTFIT_CATEGORY_TO_KEY[item.category]])} · ${item.size}</span><h4>${escapeHtml(t(item.name))}</h4><strong>${escapeHtml(t(item.stat))}</strong><p>${escapeHtml(t(item.description))}</p>${item.category === 'gun' ? `<small>${t('ENERGY PER SHOT')}: ${item.energyCost}</small>` : ''}</div>
        </div>` : `<p class="dealer-empty">${t('Your locker is empty.')}</p>`;
        const selectedFireGroup = selected?.key === 'guns'
            ? (actualLoadout.fireGroups?.assignments?.[selected.mount.id] === 'B' ? 'B' : 'A')
            : undefined;
        const otherFireGroup = selectedFireGroup === 'A' ? 'B' : 'A';
        const actionButtons = [
            fitted ? `<button type="button" data-outfit-action="remove"><span>${t('REMOVE')}</span><small>${t('TO LOCKER')}</small></button>` : '',
            this.outfittingCategory === 'locker' && item ? `<button type="button" data-outfit-action="sell" ${sellable > 0 ? '' : 'disabled'}><span>${t('SELL ONE')}</span>${sellable > 0 ? `<small>+${formatCredits(Math.round(item.price * RESALE_RATE))}</small>` : ''}</button>` : '',
            selectedFireGroup ? `<button type="button" class="dealer-group-toggle" data-outfit-group="${otherFireGroup}" aria-label="${escapeHtml(t('Fire group {group}; change to {other}.', { group: selectedFireGroup, other: otherFireGroup }))}"><span>${t('GROUP')} ${selectedFireGroup} → ${otherFireGroup}</span><small>${t('CHANGE TO {group}', { group: otherFireGroup })}</small></button>` : '',
            item && selected && !installedHere ? `<button type="button" class="primary" data-outfit-action="install" ${quote.ok ? '' : 'disabled'}><span>${actionLabel}</span><small>${escapeHtml(actionDetail)}</small></button>` : '',
        ].filter(Boolean);
        return `<div class="outfit-dealer" data-outfitting-ship="${shipId}" style="--dealer-backdrop:url('../art/outfitting/v2/dealer-workshop-backdrop-v2.png')">
          <header class="dealer-header"><img class="dealer-mechanic-portrait" src="./art/outfitting/v2/dealer-mechanic-portrait-v2.png" alt=""><div><span class="eyebrow">${t('DOCKYARD OUTFITTER')}</span><h3>${escapeHtml(SHIPS[shipId].name)}</h3><p>${t('Choose a part, choose a compatible bay, then install.')}</p></div></header>
          ${notice ? `<div class="dealer-notice is-${notice.tone}" role="status" aria-live="polite">${escapeHtml(notice.message)}</div>` : ''}
          <div class="dealer-workbench">
            <section class="dealer-catalog"><div class="dealer-step-heading"><b>1</b><span>${t('PICK EQUIPMENT')}</span></div><nav class="dealer-categories" aria-label="${t('Equipment categories')}">${categories}</nav>${selectedCopy}<div class="dealer-item-list" role="list">${items.length ? items.map((entry) => this.renderOutfittingItemTile(entry, actualLoadout)).join('') : `<p class="dealer-empty">${t('Your locker is empty.')}</p>`}</div></section>
            <section class="dealer-fit-panel">
              <div class="dealer-fit-heading"><div class="dealer-step-heading"><b>2</b><span>${t('CHOOSE A BAY')}</span></div><strong>${escapeHtml(SHIPS[shipId].className)}</strong></div>
              ${this.renderOutfittingMountRack(actualLoadout, item, selected)}
              <div class="dealer-fit-summary">
                <div class="dealer-current-fit"><span>${t('CURRENTLY FITTED')}</span><b>${fitted ? escapeHtml(t(fitted.name)) : t('EMPTY MOUNT')}</b><small>${fitted && item && fitted.id !== item.id ? t('{name} returns to your locker.', { name: t(fitted.name) }) : item ? (lockerCount ? t('Owned copies in locker: {count}', { count: lockerCount }) : itemAvailable(this.save.player, item, this.dockLocation) ? t('Available at this dock.') : t('Locked or not stocked here.')) : ''}</small></div>
                <div class="dealer-fit-metrics"><div><span>${t('FITTING MASS')}</span><b>${usage.mass} / ${usage.massLimit}</b></div>${item?.category === 'gun' ? `<div><span>${t('ENERGY PER SHOT')}</span><b>${item.energyCost}</b></div>` : ''}</div>
                ${impactRows ? `<div class="dealer-impact-list"><h5>${t('EFFECT ON SHIP')}</h5>${impactRows}</div>` : ''}
              </div>
              <div class="dealer-fit-actions"><div class="dealer-step-heading"><b>3</b><span>${t('CONFIRM')}</span></div><div class="dealer-actions action-count-${actionButtons.length}">${actionButtons.join('')}</div></div>
            </section>
          </div>
        </div>`;
    }
    renderEquipment() {
        return this.renderOutfitting();
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
        const active = this.save.player.shipId === saleId;
        const current = SHIPS[this.save.player.shipId] ?? SHIPS.wayfarer;
        const tradeIn = Math.round(current.price * HULL_TRADE_IN_RATE);
        const due = ship.price - tradeIn;
        return `
      <article class="ship-card ship-overview ${active ? 'active' : ''}" data-ship-detail="${saleId}" role="button" tabindex="0" aria-label="${t('View {name} details', { name: ship.name })}">
        <div class="ship-silhouette ${saleId}" data-variant="${ship.variant}"></div>
        <header><span>${escapeHtml(t(ship.className))}</span><b>${active ? t('CURRENT HULL') : due >= 0 ? formatCredits(due) : `+${formatCredits(Math.abs(due))}`}</b></header>
        <h3>${escapeHtml(ship.name)}</h3>
        <p class="ship-personality">${escapeHtml(t(ship.personality ?? ''))}</p>
        <div class="ship-overview-meta"><span>${active ? t('YOUR ONLY SHIP') : t('AFTER 50% TRADE-IN')}</span><b>${t('DETAILS')} ▸</b></div>
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
        const active = this.save.player.shipId === saleId;
        const speedDelta = displaySpeed(ship.maxSpeed) - displaySpeed(current.maxSpeed);
        const turnDelta = ship.angularAcceleration - current.angularAcceleration;
        const tradeIn = Math.round(current.price * HULL_TRADE_IN_RATE);
        const amountDue = ship.price - tradeIn;
        return `
      <article class="ship-card ship-detail ${active ? 'active' : ''}">
        <div class="ship-silhouette ship-silhouette-large ${saleId}" data-variant="${ship.variant}" aria-label="${t('Rotating 3D preview of the {name}', { name: ship.name })}"></div>
        <header><span>${escapeHtml(t(ship.className))}</span><b>${formatCredits(ship.price)}</b></header>
        <h3>${escapeHtml(ship.name)}</h3>
        <p class="ship-personality">${escapeHtml(t(ship.personality ?? ''))}</p>
        <p>${escapeHtml(t(ship.description))}</p>
        <dl><div><dt>${t('SPEED')}</dt><dd>${displaySpeed(ship.maxSpeed)} ${this.statDelta(speedDelta)}</dd></div><div><dt>${t('SHIELD')}</dt><dd>${ship.shield} ${this.statDelta(ship.shield - current.shield)}</dd></div><div><dt>${t('HULL INTEGRITY')}</dt><dd>${ship.hull} ${this.statDelta(ship.hull - current.hull)}</dd></div><div><dt>${t('REACTOR')}</dt><dd>${ship.reactorOutput} ${this.statDelta(ship.reactorOutput - current.reactorOutput)}</dd></div><div><dt>${t('CAPACITOR')}</dt><dd>${ship.energyCapacity} ${this.statDelta(ship.energyCapacity - current.energyCapacity)}</dd></div><div><dt>${t('CARGO')}</dt><dd>${ship.cargo} ${this.statDelta(ship.cargo - current.cargo)}</dd></div><div><dt>${t('TURN')}</dt><dd>${ship.angularAcceleration.toFixed(2)} ${this.statDelta(turnDelta, 2)}</dd></div><div><dt>${t('ACCL')}</dt><dd>${ship.acceleration} ${this.statDelta(ship.acceleration - current.acceleration)}</dd></div></dl>
        <p class="ship-handling-note">${t('Handling falls up to 24% as the cargo hold fills.')}</p>
        ${active ? `<button disabled>${t('THIS IS YOUR CURRENT SHIP')}</button>` : `<div class="ship-trade-quote"><span>${t('NEW HULL')} <b>${formatCredits(ship.price)}</b></span><span>${t('YOUR 50% TRADE-IN')} <b>−${formatCredits(tradeIn)}</b></span><strong>${amountDue >= 0 ? t('YOU PAY') : t('YARD PAYS YOU')} <b>${formatCredits(Math.abs(amountDue))}</b></strong><small>${t('Purchased modules move to your locker. Factory equipment leaves with the old hull.')}</small></div><button class="primary" data-ship-id="${saleId}" ${amountDue > this.save.player.credits ? 'disabled' : ''}>${amountDue >= 0 ? t('TRADE SHIP') : t('TRADE AND COLLECT')} · ${formatCredits(Math.abs(amountDue))}</button>`}
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
        const source = NPC_PORTRAIT_BY_ID[personId];
        if (!source) {
            const initials = personName.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
            return `<span class="avatar generated-avatar" aria-label="${t('Portrait of {name}', { name: escapeHtml(personName) })}">${escapeHtml(initials)}</span>`;
        }
        return `<img class="avatar" src="${source}" alt="${t('Portrait of {name}', { name: personName })}" draggable="false">`;
    }

    locationIllustration(locationId, screen = 'concourse') {
        const location = LOCATIONS[locationId];
        const label = screen === 'bar'
            ? t('{name} bar', { name: location.name })
            : screen === 'market'
                ? t('{name} market', { name: location.name })
                : location.name;
        const art = DOCK_ART_BY_LOCATION[locationId];
        if (art) {
            const source = VESPER_HOVER_PREVIEW && locationId === 'vesper' && screen === 'concourse'
                ? './art/locations/v3/vesper-preview.png'
                : art[screen] ?? art.concourse;
            return `<img src="${source}" alt="${t('HD view')} of ${escapeHtml(label)}" draggable="false">`;
        }
        const screenLabel = screen === 'bar' ? t('BAR') : screen === 'market' ? t('MARKET') : t('CONCOURSE');
        return `<div class="procedural-location-plate system-${escapeHtml(location.systemId ?? 'helios-verge')}" style="--plate-accent:${escapeHtml(location.accent ?? '#80b7c8')};--plate-secondary:${escapeHtml(location.secondary ?? '#182b36')}" role="img" aria-label="${escapeHtml(location.name)} · ${escapeHtml(screenLabel)}"><span>${escapeHtml(location.shortName)}</span><b>${escapeHtml(screenLabel)}</b><i aria-hidden="true"></i></div>`;
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
            else if (state === 'gate')
                status = t('IN TRANSIT');
            else if (state === 'interrupt')
                status = t('INTERRUPTED');
            else if (model.gateArmed)
                status = t('GATE LIVE · FLY THROUGH');
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
            line.title = entry?.message ?? '';
            ticker.dataset.tone = entry?.tone ?? 'info';
            ticker.classList.toggle('is-visible', Boolean(entry));
        };
        // Short-lived own-ship notices used to replace the cargo value inside
        // one third of the telemetry row. Messages such as CAPACITOR LOW or a
        // full weapon name were reduced to a few unreadable letters there.
        // The full-width event line is the cockpit's dedicated message lane.
        const ownStatus = model.ownMonitorStatus
            ? {
                message: model.ownMonitorStatus,
                tone: String(model.ownMonitorStatus).startsWith('+') ? 'success' : 'warning',
            }
            : this.currentEntry(this.recentEvents);
        renderTicker('#screen-event-ticker', ownStatus);
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
                const groupPrefix = weapon.group ? `${weapon.group} · ` : '';
                const additionalMounts = Math.max(0, Number(weapon.mountCount ?? 1) - 1);
                const displayName = `${groupPrefix}${weapon.name}${additionalMounts ? ` +${additionalMounts}` : ''}`;
                setText('#screen-own-weapon-name', displayName);
                setText('#screen-own-weapon-ammo', weapon.ammo
                    ? `${weapon.ammo.current}/${weapon.ammo.capacity}`
                    : weapon.venting ? t('VENTING') : '∞');
                weaponReadout.title = `${t('Switch fire group — press X or tap')} · ${weapon.fullName ?? weapon.name}`;
            }
            else
                weaponReadout.title = t('Switch fire group — press X or tap');
        }
        // Race strip: compact circuit telemetry on the own-ship monitor while
        // an entry is on the grid or running. The travel leg hides the strip —
        // its boxed row read as a stray overlay card (user report), and the
        // approach is now carried by the world gate marker, the radar blip,
        // and the lockable nav-map contact. The strip rides a band the own
        // monitor reserves permanently at its foot, so it can never print
        // over the hull outline or the bars — and its appearance never
        // shifts the layout (stable positions).
        const raceStrip = this.el('#screen-race-strip');
        if (raceStrip) {
            const race = model.race;
            const stripLive = Boolean(race) && race.phase !== 'travel';
            raceStrip.classList.toggle('is-visible', stripLive);
            raceStrip.dataset.phase = race?.phase ?? '';
            if (stripLive) {
                const label = this.el('#screen-race-label');
                const value = this.el('#screen-race-value');
                const clock = (seconds) => {
                    const total = Math.max(0, Math.floor(seconds));
                    const tenths = Math.floor((Math.max(0, seconds) - total) * 10);
                    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}.${tenths}`;
                };
                if (label && value) {
                    if (race.phase === 'countdown') {
                        label.textContent = t('{course} · GRID', { course: race.title.toUpperCase() });
                        value.textContent = t('T-{seconds}', { seconds: race.seconds });
                    }
                    else if (race.phase === 'finished') {
                        label.textContent = t('FINISH · {rank}', { rank: race.rankLabel });
                        value.textContent = race.personalBest ? t('NEW PB · {time}', { time: clock(race.time) }) : clock(race.time);
                    }
                    else {
                        // Running label drops the course title — mid-race the
                        // pilot knows the course; "TOR 3/13" + rank + clock is
                        // the information that must never clip (BUG-21).
                        const shortcut = race.shortcut
                            ? t('CUT {n}/{total}', { n: race.shortcut.gate, total: race.shortcut.gateCount })
                            : t('GATE {n}/{total}', { n: race.gate, total: race.gateCount });
                        label.textContent = race.draft > 0.15 ? `${shortcut} · ${t('DRAFT')}` : shortcut;
                        value.textContent = Number.isFinite(race.splitDelta) && (race.splitAge ?? 99) < 2.2
                            ? `${race.rankLabel} · ${t('PB {delta}', { delta: `${race.splitDelta <= 0 ? '−' : '+'}${Math.abs(race.splitDelta).toFixed(1)}` })}`
                            : `${race.rankLabel} · ${clock(race.time)}`;
                    }
                    raceStrip.title = `${label.textContent} · ${value.textContent}`;
                }
            }
            else
                raceStrip.title = '';
        }
        setText('#hud-zone', model.zone.toUpperCase());
        setText('#hud-mode', model.mode.toUpperCase());
        const speed = Math.round(model.speed);
        const maxSpeed = Math.round(model.maxSpeed);
        const speedValue = this.el('#screen-own-speed');
        const speedLimit = this.el('#screen-own-max-speed');
        if (speedValue && speedLimit) {
            speedValue.textContent = String(speed);
            speedLimit.textContent = `/${maxSpeed}`;
            const speedCell = speedValue.parentElement;
            // Four-digit hyperdrive values do not fit beside another
            // four-digit maximum in the narrow physical phone monitor. Keep
            // the live speed full-size there; the equal limit is redundant.
            speedCell?.classList.toggle('is-wide-speed', Math.max(Math.abs(speed), Math.abs(maxSpeed)) >= 1000);
            speedCell?.setAttribute('aria-label', `${t('SPEED')} ${speed} / ${maxSpeed}`);
            speedCell?.setAttribute('title', `${t('SPEED')} ${speed} / ${maxSpeed}`);
        }
        setText('#screen-own-fuel', Math.round((model.fuel / model.maxFuel) * 100).toString());
        const cargoValue = this.el('#screen-own-cargo');
        const cargoCap = this.el('#screen-own-cargo-cap');
        if (cargoValue && cargoCap) {
            cargoValue.textContent = (model.cargo ?? 0).toFixed(1);
            cargoValue.classList.toggle('is-full', (model.loadPercent ?? 0) >= 100);
            cargoValue.classList.remove('is-alert');
            cargoCap.textContent = `/${model.cargoCapacity ?? 0}`;
        }
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
                standoff.title = `${demand?.textContent ?? ''} · ${timer?.textContent ?? ''}`;
            }
            else
                standoff.title = '';
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
        setText('#screen-own-energy-value', Math.ceil(model.energy).toString());
        setText('#screen-own-hull-value', Math.ceil(model.hull).toString());
        setBar('#screen-own-shield', percent(model.shield, model.maxShield));
        setBar('#screen-own-energy', percent(model.energy, model.maxEnergy));
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
            targetReadout.title = targetReadout.textContent === '—' ? '' : targetReadout.textContent;
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
        this.el('#screen-target-distance').textContent = `${formatNumber(target.distance)} km`;
        this.el('#screen-target-readout').textContent = target.readout ?? '—';
        this.el('#screen-target-readout').title = target.readout ?? '';
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
        // Ships show shield/hull bars; stations, planets, asteroids and wrecks
        // are invulnerable, so the target monitor shows only their outline.
        this.targetLayout?.classList.toggle('no-bars', !isShip);
        if (!target) {
            setText('#screen-target-name', t('NO LOCK'));
            this.el('#screen-target-name').title = '';
            setText('#screen-target-shield-value', '—');
            setText('#screen-target-hull-value', '—');
            setBar('#screen-target-shield', 0);
            setBar('#screen-target-hull', 0);
            clearHull();
            return;
        }
        setText('#screen-target-name', target.name.toUpperCase());
        this.el('#screen-target-name').title = target.name;
        setText('#screen-target-shield-value', isShip ? Math.ceil(target.shield ?? 0).toString() : '—');
        setText('#screen-target-hull-value', isShip ? Math.ceil(target.hull ?? 0).toString() : '—');
        setBar('#screen-target-shield', percent(target.shield ?? 0, target.maxShield ?? 0));
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
        else if (kind === 'gate') {
            // Race checkpoint: a ring with course tick marks, so the target
            // monitor reads "gate" at a glance (matches the teal world rings).
            ctx.strokeStyle = 'rgba(83, 230, 200, 0.95)';
            ctx.lineWidth = Math.max(1.5, ratio * 1.5);
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(83, 230, 200, 0.5)';
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 4; i += 1) {
                const a = (i / 4) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
                ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
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
        // Distance labels are sparse but important. Keep them at a true 10px
        // CSS floor rather than the old 8px bitmap text, including on 1x
        // landscape-phone captures; DPR still scales the backing-store glyphs.
        const radarTextFont = `${Math.max(10, Math.floor(10.5 * ratio))}px ui-monospace, monospace`;
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
                ctx.font = radarTextFont;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${ring.distance}`, x * 0.8, y * 0.8);
            }
            ctx.globalAlpha = 1;
        }
        for (const contact of contacts) {
            // Race checkpoints on the disc match the in-world ring colors: the
            // next gate GREEN with a slow pulse, the one after it YELLOW, an
            // available shortcut PURPLE, and the travel gathering marker TEAL.
            // Beyond-horizon gates clamp to the rim and carry their distance.
            if (contact.type === 'racegate' && contact.raceGate) {
                const [wx, wy] = warpPoint(contact.x, contact.y);
                const x = wx * radius;
                const y = wy * radius;
                const state = contact.raceGate.state;
                const color = contact.raceGathering ? '#5be4d0' : state === 'next' ? '#3dff6e' : state === 'upcoming' ? '#ffd24a' : state === 'shortcut' ? '#c894ff' : '#9fb0bd';
                const gateSize = 4.2 * ratio;
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1.2, 1.5 * ratio);
                ctx.globalAlpha = 1;
                ctx.beginPath();
                ctx.arc(x, y, gateSize, 0, Math.PI * 2);
                ctx.stroke();
                if (state === 'next') {
                    const pulse = 0.45 + 0.35 * Math.sin(now / 300);
                    ctx.globalAlpha = pulse;
                    ctx.beginPath();
                    ctx.arc(x, y, gateSize + 3.2 * ratio, 0, Math.PI * 2);
                    ctx.stroke();
                }
                if (contact.selected) {
                    ctx.globalAlpha = 0.85;
                    ctx.strokeRect(x - gateSize * 2, y - gateSize * 2, gateSize * 4, gateSize * 4);
                }
                // Out-of-plane tick, same language as the other contacts: a stub
                // pointing up when the gate rides above the ecliptic, down when
                // below — at race speed the climb/dive cue matters. Drawn before
                // the distance label so a rim-pinned gate's tick never runs
                // through its own readout.
                ctx.globalAlpha = 0.8;
                const gateAltitudeRatio = Math.max(-1, Math.min(1, contact.altitude || 0));
                const gateAltitudeMagnitude = Math.abs(gateAltitudeRatio);
                if (gateAltitudeMagnitude > 0.02) {
                    const gateDirection = gateAltitudeRatio > 0 ? -1 : 1;
                    const gateTick = radarAltitudeTick({ x, y, radius, ratio, direction: gateDirection, magnitude: gateAltitudeMagnitude, size: gateSize, canvasHeight: height });
                    if (gateTick) {
                        ctx.beginPath();
                        ctx.moveTo(x, gateTick.startY);
                        ctx.lineTo(x, gateTick.startY + gateDirection * gateTick.length);
                        ctx.stroke();
                    }
                }
                if (contact.raceGate.beyond) {
                    ctx.globalAlpha = 0.9;
                    ctx.fillStyle = color;
                    ctx.font = radarTextFont;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`${contact.raceGate.distance}`, x * 0.8, y * 0.8);
                }
                ctx.globalAlpha = 1;
                continue;
            }
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
                ctx.font = radarTextFont;
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
                const tick = radarAltitudeTick({ x, y, radius, ratio, direction, magnitude: altitudeMagnitude, size, canvasHeight: height });
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
        // `until` rides the sim clock (the ship-menu history ordering); the
        // ticker window itself expires on the REAL clock — sim time stalls
        // (throttled tab, frame drops, menu pauses), and a world-time-only
        // expiry left the last line stuck on the monitor forever (user
        // report: the bounty message never disappeared).
        this.recentEvents.push({ message, tone, at: now, until: now + duration / 1000, expiresAt: performance.now() + duration });
        if (this.recentEvents.length > 24)
            this.recentEvents.shift();
    }
    // Radar sensor log: local-space traffic/encounter chatter lives on the nav
    // monitor's ticker rather than the toast stack.
    pushSensor(message, tone = 'info', duration = 5600) {
        const now = this.save?.world.time ?? 0;
        this.sensorLog.push({ message, tone, at: now, until: now + duration / 1000, expiresAt: performance.now() + duration });
        if (this.sensorLog.length > 12)
            this.sensorLog.shift();
    }
    // The newest entry whose display window is still open; undefined when the
    // line has expired (the ticker then fades back to its idle state).
    currentEntry(log) {
        const nowReal = performance.now();
        const nowSim = this.save?.world.time ?? 0;
        for (let index = log.length - 1; index >= 0; index -= 1) {
            const entry = log[index];
            // Prefer the real-clock window; fall back to the sim clock for
            // entries pushed before the real-clock field existed.
            if (entry.expiresAt !== undefined ? entry.expiresAt > nowReal : entry.until > nowSim)
                return entry;
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
    setMapView(view) {
        if (view !== 'sector' && view !== 'galaxy')
            return;
        this.mapView = view;
        const card = this.root.querySelector('#map-panel .map-card');
        if (!card)
            return;
        card.dataset.activeView = view;
        card.querySelectorAll('[data-map-view]').forEach((button) => {
            const selected = button.dataset.mapView === view;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
        card.querySelectorAll('[data-map-view-panel]').forEach((section) => {
            section.hidden = section.dataset.mapViewPanel !== view;
        });
    }
    showMap(model) {
        if (!this.save)
            return;
        const panel = this.root.querySelector('#map-panel');
        const system = SYSTEMS[model.systemId] ?? SYSTEMS['helios-verge'];
        const localIds = model.navLocationIds ?? Object.keys(LOCATIONS).filter((id) => LOCATIONS[id].systemId === system.id);
        const localMapPoints = layoutSystemMapPoints(localIds, system.id);
        const playerPoint = systemMapPoint(model.playerPosition, undefined, system.id);
        const contactTone = (contact) => contact.gate ? 'gate' : contact.claim ? 'claim' : contact.hostile ? 'hostile' : contact.kind === 'asteroid' || contact.kind === 'pickup' ? 'resource' : contact.kind === 'wreck' ? 'wreck' : 'ship';
        const systemRank = new Map(REGIONAL_SYSTEM_ORDER.map((id, index) => [id, index]));
        const visibleSystems = [...(model.systems ?? Object.values(SYSTEMS))]
            .sort((first, second) => (systemRank.get(first.id) ?? 99) - (systemRank.get(second.id) ?? 99));
        panel.innerHTML = `
      <div class="modal-card map-card" data-active-view="${this.mapView}">
        <header>
          <div class="map-title"><span class="eyebrow">${t('NAVIGATION COMPUTER / PAUSED')}</span><h2>${escapeHtml(system.name)} ${t('System')}</h2></div>
          <div class="map-header-controls">
            <div class="map-view-toggle" role="tablist" aria-label="${t('Switch navigation view')}">
              <button id="map-sector-tab" type="button" role="tab" data-map-view="sector" aria-controls="map-sector-view">${t('SECTOR')}</button>
              <button id="map-galaxy-tab" type="button" role="tab" data-map-view="galaxy" aria-controls="map-galaxy-view">${t('GALAXY')}</button>
            </div>
            <button type="button" data-ui-command="close-map">${t('CLOSE')}</button>
          </div>
        </header>
        <div id="map-sector-view" class="map-view map-view-sector" role="tabpanel" aria-labelledby="map-sector-tab" data-map-view-panel="sector">
          <div class="navigation-map-layout sector-map-layout">
            <section class="map-section system-map-section">
              <div class="map-section-heading"><span>${t('SYSTEM POINTS')} <em class="system-star-key star-${escapeHtml(system.id)}"><i aria-hidden="true"></i>${t(SYSTEM_STAR_TYPES[system.id] ?? 'STAR')}</em></span><b>${escapeHtml(mapLocationLabel(LOCATIONS[model.navTargetId]))} ${t('VECTOR')}</b></div>
              <div class="system-map sector-system-map map-stage" aria-label="${escapeHtml(system.name)} ${t('Sector chart')}">
                <div class="map-orbit orbit-a" aria-hidden="true"></div><div class="map-orbit orbit-b" aria-hidden="true"></div><div class="map-orbit orbit-c" aria-hidden="true"></div>
                <div class="map-star star-${escapeHtml(system.id)}" aria-hidden="true"></div>
                <div class="map-player-marker" style="left:${playerPoint.left.toFixed(2)}%;top:${playerPoint.top.toFixed(2)}%" aria-label="${t('Current position')}"><i></i><span>${t('YOU')}</span></div>
                ${localIds.map((id) => {
            const location = LOCATIONS[id];
            const point = localMapPoints.get(id) ?? systemMapPoint(location.position, id, system.id);
            const selected = model.navTargetId === id || model.currentTargetId === id;
            const kind = this.save.player.discovered.includes(id) ? t(location.kind) : t('UNSURVEYED');
            return `<button class="map-node kind-${location.kind} ${selected ? 'selected' : ''}" style="left:${point.left.toFixed(2)}%;top:${point.top.toFixed(2)}%" data-map-layout="spatial" data-map-target-kind="location" data-map-target-id="${id}" aria-label="${escapeHtml(mapLocationLabel(location))} · ${escapeHtml(kind)}"><i aria-hidden="true"></i><b>${escapeHtml(mapLocationLabel(location))}</b></button>`;
        }).join('')}
              </div>
            </section>
            <section class="map-section local-map-section">
              <div class="map-section-heading"><span>${t('LOCAL CONTACTS')}</span><b>${model.contacts.length} ${t('TRACKED')}</b></div>
              <div class="tactical-map map-stage">
                <div class="tactical-rings"></div><div class="tactical-player"></div>
                ${(model.searchRings ?? []).map((ring) => `<span class="tactical-search-ring ${ring.color}" style="left:${(50 + ring.x * 42).toFixed(2)}%;top:${(50 + ring.y * 42).toFixed(2)}%;width:${Math.max(6, ring.fraction * 84).toFixed(1)}%;height:${Math.max(6, ring.fraction * 84).toFixed(1)}%"></span>`).join('')}
                ${model.contacts.map((contact) => `<button class="tactical-contact ${contactTone(contact)} ${contact.ghost ? 'ghost' : ''} ${contact.distress ? 'distress' : ''} ${contact.selected ? 'selected' : ''}" style="left:${(50 + contact.x * 42).toFixed(2)}%;top:${(50 + contact.y * 42).toFixed(2)}%;opacity:${contact.ghost ? (contact.lostAlpha ?? 0.9) : 1}" data-map-target-kind="${contact.kind}" data-map-target-id="${escapeHtml(contact.id)}" aria-label="${escapeHtml(contact.name)}"><i></i>${contact.gate && Math.abs(contact.altitude ?? 0) > 0.02 ? `<b class="tactical-alt ${(contact.altitude ?? 0) > 0 ? 'up' : 'down'}" style="--alt:${Math.min(1, Math.abs(contact.altitude ?? 0)).toFixed(2)}"></b>` : ''}</button>`).join('')}
              </div>
              <div class="contact-list">
                ${model.contacts.length ? model.contacts.map((contact) => `<button class="contact-row ${contactTone(contact)} ${contact.selected ? 'selected' : ''}" data-map-target-kind="${contact.kind}" data-map-target-id="${escapeHtml(contact.id)}"><i></i><span><b>${escapeHtml(contact.name)}</b><small>${escapeHtml(t(contact.subtitle))}</small></span><em>${Math.round(contact.distance)}u</em></button>`).join('') : `<div class="contact-empty"><b>${t('NO LOCAL CONTACTS')}</b><span>${t('Only contacts inside sensor range appear here.')}</span></div>`}
              </div>
            </section>
          </div>
        </div>
        <div id="map-galaxy-view" class="map-view map-view-galaxy" role="tabpanel" aria-labelledby="map-galaxy-tab" data-map-view-panel="galaxy" hidden>
          <section class="map-section galaxy-map-section">
            <div class="map-section-heading"><span>${t('ROUTE NETWORK')}</span><b>${t('4 SYSTEMS · 3 JUMPS')}</b></div>
            <nav class="regional-galaxy-map galaxy-map-stage" aria-label="${t('Regional systems')}">
              <svg class="regional-route-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                ${JUMP_ROUTES.map((route) => {
            const from = REGIONAL_SYSTEM_LAYOUT[route.fromSystemId];
            const to = REGIONAL_SYSTEM_LAYOUT[route.toSystemId];
            return from && to ? `<line data-route-id="${escapeHtml(route.id)}" data-from-system="${escapeHtml(route.fromSystemId)}" data-to-system="${escapeHtml(route.toSystemId)}" x1="${from.left}" y1="${from.top}" x2="${to.left}" y2="${to.top}"></line>` : '';
        }).join('')}
              </svg>
              ${visibleSystems.map((entry) => {
            const current = entry.id === model.systemId;
            const planned = entry.id === model.plannedSystemId;
            const point = REGIONAL_SYSTEM_LAYOUT[entry.id] ?? REGIONAL_SYSTEM_LAYOUT['helios-verge'];
            const state = current ? t('CURRENT') : planned ? t('ROUTE SET') : t('VISIBLE');
            const order = (systemRank.get(entry.id) ?? 0) + 1;
            return `<button class="regional-system system-${escapeHtml(entry.id)} ${current ? 'current' : ''} ${planned ? 'planned' : ''}" style="left:${point.left}%;top:${point.top}%" data-system-order="${order}" data-map-target-kind="system" data-map-target-id="${escapeHtml(entry.id)}" aria-label="${escapeHtml(entry.name)} · ${escapeHtml(state)}"><em>${String(order).padStart(2, '0')}</em><i aria-hidden="true"></i><span>${escapeHtml(state)}</span><b>${escapeHtml(entry.name)}</b></button>`;
        }).join('')}
            </nav>
          </section>
        </div>
        <footer><span>${model.autopilotAvailable ? t('HYPERDRIVE READY — plot a jump vector.') : t('HYPERDRIVE LOCKED — {threat}.', { threat: model.threatLabel ?? t('hostile proximity') })}</span><span>${t('FLY THROUGH JUMP GATES · NO ACTIVATION REQUIRED · valuable cargo raises pirate activity around jump points.')}</span></footer>
      </div>`;
        this.hidePause();
        this.hideShipMenu();
        panel.classList.remove('is-hidden');
        this.setMapView(this.mapView);
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
                        : mission.kind === 'salvage'
                            ? ((mission.salvaged ?? 0) >= mission.quantity
                                ? t('RETURN TO {name}', { name: (LOCATIONS[mission.destination]?.name ?? 'DOCK').toUpperCase() })
                                : t('SALVAGE {name}', { name: (mission.targetName ?? 'MOURNING LINE CLAIM').toUpperCase() }))
                        : (destination ? t('FLY TO {name}', { name: destination.name.toUpperCase() }) : '—');
                const progress = mission.kind === 'mining' && mission.claimNodeId
                    ? `<div><dt>${t('PROGRESS')}</dt><dd>${mission.mined ?? 0}/${mission.quantity} ${t('MINED')}</dd></div>`
                    : mission.kind === 'salvage' && mission.targetNodeId
                        ? `<div><dt>${t('PROGRESS')}</dt><dd>${mission.salvaged ?? 0}/${mission.quantity} ${t('RECOVERED')}</dd></div>`
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
          <section class="controls-reference"><h3>${t('KEYBOARD / CONTROLLER')}</h3><p>${t('W/S pitch · A/D yaw · Q/E roll · R/F throttle · Shift afterburn · Space fire · X fire group · hold M secondary tool / tap missile or capture · T target · C mode · N nav · J hyperdrive · K map · B transponder')}</p><p>${t('Gamepad: left stick steer · right stick roll/throttle · RT fire · hold RB secondary tool / tap missile or capture · LB afterburn · face buttons target/mode/fire group/hyperdrive · left stick click transponder · D-pad capture/hostile/nav.')}</p></section>
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
        // The forced-landscape overlay is a modal too: while it blocks play the
        // sim must freeze (the frame loop drops the accumulator for any open
        // modal), so a pilot can't drift into a wall or a pirate's guns while
        // the game is waiting for the phone to be flipped.
        return !this.root.querySelector('#map-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#ship-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#pause-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#arena-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#chat-panel')?.classList.contains('is-hidden') || !this.root.querySelector('#rotate-notice')?.classList.contains('is-hidden');
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
