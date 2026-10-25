// Recurring distress encounters: authored variants, persistent lifecycle,
// journal copy and the short comms conversations behind them.
//
// The active record lives in `save.world.distress.active` (one at a time).
// Everything here is data + pure helpers: no GameSession methods, so the save
// hydrator can import this module without pulling in the flight runtime.
import {CONVOY_POSITION} from './explorationData.js';
import {cargoFree} from './economy.js';
import {getLanguage} from './i18n.js';
import {seededRandom} from './random.js';

export const distressText = text => Array.isArray(text) ? text[getLanguage() === 'de' ? 0 : 1] : text;

export const DISTRESS_PHASES = Object.freeze(['signal', 'discovered', 'involved', 'resolved', 'abandoned']);
export const DISTRESS_ACTIVE_PHASES = Object.freeze(['signal', 'discovered', 'involved']);
export const DISTRESS_FIRST_MIN = 240;
export const DISTRESS_FIRST_MAX = 420;
export const DISTRESS_GAP_MIN = 360;
export const DISTRESS_GAP_MAX = 600;
export const DISTRESS_SIGNAL_TIMEOUT = 600;
// What a baited call carries. A genuine crew names its own trouble, so only the
// trap needs borrowed words: it picks one of these maydays and never says what
// is actually wrong. Every line has to be plausible enough that a real casualty
// could have sent it, or the bait would read as bait.
export const DISTRESS_INTERCEPTS = Object.freeze([
    ['Mayday, mayday. Wir treiben antriebslos. Ist da jemand auf dieser Frequenz?',
        'Mayday, mayday. We are drifting without power. Is anyone on this frequency?'],
    ['Hier ist ein ziviler Frachter. Unsere Systeme fallen nacheinander aus. Ich wiederhole: Wir brauchen Hilfe.',
        'This is a civilian freighter. Our systems are failing one after another. I repeat: we need help.'],
    ['Notruf auf offener Frequenz. Wir haben unsere Position verloren. Bitte meldet euch.',
        'Distress call on an open frequency. We have lost our position. Please respond.'],
    ['Ist da wer? Der große Sender ist tot — ich weiß nicht, wie weit das hier trägt.',
        'Is anyone there? The main transmitter is dead — I do not know how far this carries.'],
    ['SOS. Zwei von uns sind verletzt, und wir kommen aus eigener Kraft nicht mehr weg.',
        'SOS. Two of us are hurt, and we cannot get out under our own power.'],
    ['An alle Schiffe im Sektor: Wir brauchen einen Schlepper oder ein paar geschickte Hände. Zahle, was ich habe.',
        'To any ship in the sector: we need a tow or a few steady hands. Paying what I have.'],
    ['Mayday … (Rauschen) … wir halten noch, aber nicht mehr lange.',
        'Mayday … (static) … we are holding, but not for much longer.'],
    ['Hier die Restcrew. Antrieb tot, Lebenserhaltung auf Reserve. Bitte, irgendwer.',
        'This is the surviving crew. Drive dead, life support on reserve. Please, anyone.'],
    ['Notruf. Wir sind keine Gefahr — wir sind nur kaputt. Bitte kommt näher.',
        'Distress call. We are no threat — we are just broken. Please come closer.'],
    ['Wir treiben seit Stunden hier draußen. Hat uns jemand auf dem Schirm?',
        'We have been drifting out here for hours. Does anyone have us on scope?'],
    ['Mayday. Die Brücke ist dicht, der Rest ist Schrott. Holt uns hier raus.',
        'Mayday. The bridge is sealed, the rest is scrap. Get us out of here.'],
    ['An jeden in Reichweite: Wir zahlen für Treibstoff, Teile oder einen Schlepp. Alles, was ihr habt.',
        'To anyone in range: we pay for fuel, parts or a tow. Whatever you have.'],
    ['Notruf, zivile Kennung. Unser Reaktor läuft heiß, und wir wissen nicht, wie lange noch.',
        'Distress call, civilian ident. Our reactor is running hot and we do not know for how long.'],
    ['Notruf. Wir haben alles abgeschaltet, was Strom zieht. Bitte, wir brauchen jemanden.',
        'Distress call. We shut down everything that draws power. Please, we need someone.'],
    ['Ich habe noch Luft für ein paar Stunden. Danach ist es egal. Bitte beeilt euch.',
        'I have a few hours of air left. After that it does not matter. Please hurry.'],
]);
export const DISTRESS_INTERCEPT_COUNT = DISTRESS_INTERCEPTS.length;
export const DISTRESS_REWARD_PER_SURVIVOR = 2000;
export const DISTRESS_ANSWER_RANGE = 1400;
export const DISTRESS_DISCOVER_RANGE = 2400;
// New signals are logged beyond normal approach range so responding means
// plotting the journal waypoint and making a local hyperdrive jump.
export const DISTRESS_SIGNAL_MIN_DISTANCE = 3000;
export const DISTRESS_SIGNAL_MAX_DISTANCE = 10000;
export const DISTRESS_TRANSFER_RANGE = 650;
export const DISTRESS_TRANSFER_SPEED = 45;
export const DISTRESS_REPAIR_RANGE = 900;
// A raider that takes fire breaks off its assigned convoy victim for this
// long. Further hits refresh the window; after it expires the raider resumes
// the encounter's normal target assignment.
export const DISTRESS_RETALIATION_TIME = 45;
export const DISTRESS_HISTORY_LIMIT = 8;
// The debris escort is a timed run: the freighter's nav is dead, so the pilot
// projects the beacons and the transport flies the pilot's trail out of the
// pocket before the solar front arrives.
export const DISTRESS_ESCORT_BURST = 210;
export const DISTRESS_ESCORT_SPINUP = 8;
export const DISTRESS_ESCORT_HALF_WIDTH = 110;
export const DISTRESS_ESCORT_LAG = 150;
export const DISTRESS_ESCORT_RANGE = 4000;
export const DISTRESS_BEACON_RANGE = 4000;
export const DISTRESS_BEACON_FAIL_RANGE = 520;
export const DISTRESS_ESCORT_CLEAN_BONUS = 0.25;

const v = (key, name, hullId, role, offset) => ({key, name, hullId, role, offset, faction: 'independents', neutral: true});
const p = (key, name, hullId, offset) => ({key, name, hullId, role: 'pirate', offset, faction: 'pirates', neutral: false});

// Each variant carries two authored setups. A setup varies the caller, hulls,
// names, circumstances and the resource the crew actually needs.
const VARIANTS = [
    {
        id: 'convoy',
        title: ['Konvoi unter Beschuss', 'Convoy under attack'],
        genuine: true,
        weight: 13,
        family: ['Handel', 'Trade'],
        setups: [
            {
                caller: 'Lantern', vessel: ['Prospektorenkonvoi Lantern', 'Lantern prospecting convoy'],
                signal: ['Mayday, hier ist der Konvoi Lantern. Zwei Piraten hängen an uns und schneiden uns den Rückweg ab. Wir sind zwei unbewaffnete Frachter. Die Kompanie zahlt euch zweitausend für jedes Schiff, das hier rauskommt.',
                    'Mayday, this is the Lantern convoy. Two raiders are on us and cutting off our way out. We are two unarmed mules. The company pays two thousand for every ship you get out of here.'],
                context: ['Zwei Prospektoren werden bereits beschossen.', 'Two prospectors are already under fire.'],
                actors: [
                    v('lantern-1', 'Lantern 1', 'mule', 'miner', [-230, 40, 0]),
                    v('lantern-2', 'Lantern 2', 'mule', 'miner', [180, -40, 130]),
                    p('cutlass-1', 'Cutlass 1', 'scrapper', [-850, 120, -850]),
                    p('cutlass-2', 'Cutlass 2', 'scrapper', [800, -90, -950]),
                ],
                victims: 2, raiders: 2, reward: 2000,
            },
            {
                caller: 'Ash Gambit', vessel: ['Ash-Kurier', 'Ash courier'],
                signal: ['Ash Gambit, Notruf. Die Piraten haben unseren Begleiter rausgeschossen — jetzt kommen sie wegen der Fracht zurück. Ich bin allein und komme kaum vom Fleck.',
                    'Ash Gambit, mayday. The pirates burned our escort — now they are coming back for the cargo. I am alone and barely moving.'],
                context: ['Ein einzelner Frachter hält die Stellung.', 'A lone freighter is holding out.'],
                actors: [
                    v('ash-1', 'Ash Gambit', 'mule', 'trader', [140, -30, 60]),
                    p('red-talon', 'Red Talon', 'scrapper', [-720, 90, -640]),
                ],
                victims: 1, raiders: 1, reward: 2000,
            },
        ],
    },
    {
        id: 'wreck',
        title: ['Zerstörter Frachter', 'Destroyed freighter'],
        genuine: true,
        weight: 12,
        family: ['Bergung', 'Salvage'],
        setups: [
            {
                caller: 'MV Cold Harbor', vessel: ['Frachterwrack Cold Harbor', 'freighter wreck Cold Harbor'],
                signal: ['Automatischer Notruf, Frachter Cold Harbor. Antrieb ausgefallen. Lebenserhaltung kritisch. Eine Rettungskapsel treibt neben dem Wrack.',
                    'Automated distress call, freighter Cold Harbor. Drive failed. Life support critical. One escape pod drifting beside the wreck.'],
                context: ['Ein Wrack sendet noch Lebenszeichen.', 'A wreck is still signalling.'],
                actors: [],
                wreck: {name: 'Cold Harbor', derelict: 'atlas-freighter', cargo: [{commodity: 'electronics', quantity: 2}], survivors: 1, attackers: 0},
                recorder: ['Cold Harbor, letzte Aufnahme. Fracht gesichert, Antrieb tot. Wir gehen in die Kapseln. Wer das hört: Die Kiste gehört der Crew, nicht den Haien.',
                    'Cold Harbor, final recording. Cargo secured, drive dead. We are taking the pods. Whoever hears this: the crate belongs to the crew, not the sharks.'],
            },
            {
                caller: 'MV Pale Ledger', vessel: ['Frachterwrack Pale Ledger', 'freighter wreck Pale Ledger'],
                signal: ['Pale Ledger, Notruf … wir hängen ohne Antrieb. Zwei Schiffe drehen gerade wieder auf uns ein. Eine Kapsel ist noch dicht.',
                    'Pale Ledger, mayday … we are dead in space. Two ships are turning back toward us. One pod is still holding.'],
                context: ['Das Wrack flüstert, und jemand kommt zurück.', 'The wreck is whispering, and someone is coming back.'],
                actors: [
                    p('ledger-1', 'Pale Hook', 'scrapper', [-560, 120, -640]),
                    p('ledger-2', 'Wire', 'talon', [640, -80, -520]),
                ],
                wreck: {name: 'Pale Ledger', derelict: 'atlas-freighter', cargo: [{commodity: 'medicine', quantity: 2}], survivors: 1, attackers: 2},
                recorder: ['Pale Ledger, letzte Aufzeichnung. Wir haben die Kennung gelöscht, damit sie nicht auf unser Signal kommen. Der Rest der Crew sitzt in der Kapsel. Falls die Schiffe zurückkommen — sie kommen nicht zum Helfen.',
                    'Pale Ledger, final recording. We wiped the transponder so they would not follow our signal home. The rest of the crew is in the pod. If those ships come back, they are not here to help.'],
            },
        ],
    },
    {
        id: 'trap',
        title: ['Falscher Notruf', 'False distress call'],
        genuine: false,
        weight: 15,
        family: ['Täuschung', 'Deception'],
        setups: [
            {
                caller: 'MV Bright Mercy', vessel: ['Frachter Bright Mercy', 'freighter Bright Mercy'],
                signal: ['Bright Mercy, zivile Fracht. Antrieb beschädigt, wir brauchen Hilfe. Bitte kommt näher — wir haben keine Reserve mehr.',
                    'Bright Mercy, civilian freight. Drive damaged, we need assistance. Please come closer — we have no reserve left.'],
                context: ['Der Ruf klingt sauber. Vielleicht zu sauber.', 'The call sounds clean. Perhaps too clean.'],
                actors: [
                    {key: 'mercy', name: 'Bright Mercy', hullId: 'mule', role: 'trader', offset: [0, 0, 0], faction: 'independents', neutral: true, disguise: true},
                    p('mercy-1', 'Silent Nail', 'scrapper', [-320, 120, -380]),
                    p('mercy-2', 'Pale Hook', 'talon', [340, -90, -300]),
                ],
                hidden: ['mercy-1', 'mercy-2'],
                clue: ['Die Triebwerke sind kalt, und die Signatur passt nicht zur Fracht.',
                    'The engines are cold, and the signature does not match the manifest.'],
            },
            {
                caller: 'Prospektor Vela', vessel: ['Prospektor Vela', 'prospector Vela'],
                signal: ['Prospektor Vela an alle in Reichweite. Mein Abbauantrieb ist hin. Zahle gut, wenn jemand einen Weg kennt.',
                    'Prospector Vela to anyone in range. My mining drive is gone. Pays well if someone knows a way out.'],
                context: ['Ein Prospektor ohne Trümmer neben sich?', 'A prospector with no debris beside it?'],
                actors: [
                    {key: 'vela', name: 'Vela', hullId: 'prospector', role: 'miner', offset: [0, 0, 0], faction: 'independents', neutral: true, disguise: true},
                    p('vela-1', 'Shrike', 'scrapper', [-280, 80, -360]),
                    p('vela-2', 'Wire', 'talon', [300, -60, -320]),
                ],
                hidden: ['vela-1', 'vela-2'],
                clue: ['Der Ruf kommt von einer Position ohne Trümmer — und der Antrieb ist heiß.',
                    'The call comes from a spot with no debris — and the drive is running hot.'],
            },
        ],
    },
    {
        id: 'fuel',
        title: ['Treibstoffnot', 'Fuel shortage'],
        genuine: true,
        weight: 12,
        family: ['Versorgung', 'Supply'],
        setups: [
            {
                caller: 'MV Tallow', vessel: ['Frachter Tallow', 'freighter Tallow'],
                signal: ['Tallow an alle. Uns geht der Sprit aus. Acht Einheiten, sonst treiben wir hier ab. Zahle zwölfhundert.',
                    'Tallow to all. We are dry. Eight units of fuel or we drift. Paying twelve hundred.'],
                context: ['Ein Frachter hat noch Luft, aber keinen Sprit.', 'A freighter still has air, but no fuel.'],
                actors: [v('tallow', 'Tallow', 'mule', 'trader', [0, 0, 0])],
                fuel: 8, payment: 1200,
            },
            {
                caller: 'Prospektor Nettle', vessel: ['Prospektor Nettle', 'prospector Nettle'],
                signal: ['Nettle hier. Sechs Einheiten Sprit, und ich schaffe es zurück nach Rook. Zahle, was ich habe.',
                    'Nettle here. Six units of fuel and I can make it back to Rook. Paying what I have.'],
                context: ['Ein Prospektor ohne Reserve, weit draußen.', 'A prospector with no reserve, far out.'],
                actors: [v('nettle', 'Nettle', 'prospector', 'miner', [0, 0, 0])],
                fuel: 6, payment: 900,
            },
        ],
    },
    {
        id: 'disabled',
        title: ['Manövrierunfähig', 'Disabled ship'],
        genuine: true,
        weight: 12,
        family: ['Reparatur', 'Repair'],
        setups: [
            {
                caller: 'MV Orchard Star', vessel: ['Frachter Orchard Star', 'freighter Orchard Star'],
                signal: ['Orchard Star, Maschinenschaden. Zwei Einheiten Ersatzteile, und die Kühlmittelpumpe läuft wieder. Wir zahlen achtzehnhundert.',
                    'Orchard Star, machinery failure. Two units of spare parts and the coolant pump runs again. We pay eighteen hundred.'],
                context: ['Ein Frachter hängt an einer defekten Pumpe.', 'A freighter is stuck on a broken pump.'],
                actors: [v('orchard', 'Orchard Star', 'mule', 'trader', [0, 0, 0])],
                parts: 2, payment: 1800, repairTarget: 0.62,
            },
            {
                caller: 'Prospektor Calder', vessel: ['Prospektor Calder', 'prospector Calder'],
                signal: ['Calder hier. Riss im Förderarm, mir fehlt eine Einheit Ersatzteile. Zahle zwölfhundert — für die Teile oder für ein Paar geschickte Hände.',
                    'Calder here. Crack in the feed arm, one unit of spare parts short. Paying twelve hundred — for the parts or for a pair of skilled hands.'],
                context: ['Ein Prospektor kann sich nicht mehr bewegen.', 'A prospector cannot move any more.'],
                actors: [v('calder', 'Calder', 'prospector', 'miner', [0, 0, 0])],
                parts: 1, payment: 1200, repairTarget: 0.58,
            },
        ],
    },
    {
        id: 'debris',
        title: ['Eingeschlossen', 'Trapped in debris'],
        genuine: true,
        weight: 12,
        family: ['Bergung', 'Salvage'],
        setups: [
            {
                caller: 'MV Hollow Tide', vessel: ['Frachter Hollow Tide', 'freighter Hollow Tide'],
                signal: ['Hollow Tide. Der Treffer hat unseren Nav-Rechner zerlegt — wir sehen das Feld, aber wir kommen nicht durch. Und die Sonnenfront ist im Anflug. Flieg uns raus, dann zahlt die Reederei.',
                    'Hollow Tide. The hit took out our nav computer — we can see the field, but we cannot get through it. And the solar front is inbound. Fly us out and the company pays.'],
                context: ['Ein Frachter ohne Navigation, und ein Sturm im Anflug.', 'A freighter with no navigation, and a storm on the way.'],
                actors: [v('tide', 'Hollow Tide', 'mule', 'trader', [0, 0, 0])],
                payment: 1600,
            },
            {
                caller: 'Prospektor Sable', vessel: ['Prospektor Sable', 'prospector Sable'],
                signal: ['Sable hier. Mein Nav ist Schrott, zwischen mir und dem offenen Raum dreht sich ein Feld, und draußen baut sich ein Sturm auf. Leg mir Bojen, ich fliege deine Spur.',
                    'Sable here. My nav is scrap, there is a field turning between me and open space, and a storm is building outside. Lay me beacons and I will fly your trail.'],
                context: ['Ein Prospektor ohne Nav, zwischen ihm und dem Sprung ein Trümmerfeld.', 'A prospector with no nav, a debris field between it and the jump.'],
                actors: [v('sable', 'Sable', 'prospector', 'miner', [0, 0, 0])],
                payment: 1300,
            },
        ],
    },
    {
        id: 'jettison',
        title: ['Abgeworfene Fracht', 'Jettisoned cargo'],
        genuine: true,
        weight: 12,
        family: ['Handel', 'Trade'],
        setups: [
            {
                caller: 'MV Copper Wren', vessel: ['Frachter Copper Wren', 'freighter Copper Wren'],
                signal: ['Copper Wren, Notruf. Beim Ausweichmanöver sind uns drei Container abgerissen. Bring sie zurück, dann sind sechzehnhundert deine.',
                    'Copper Wren, mayday. Three containers tore loose in the evasive burn. Bring them back and sixteen hundred is yours.'],
                context: ['Drei Container treiben zwischen den Trümmern.', 'Three containers are drifting among the debris.'],
                actors: [v('wren', 'Copper Wren', 'mule', 'trader', [0, 0, 0])],
                containers: [{commodity: 'electronics', quantity: 3}], returnPayment: 1600,
            },
            {
                caller: 'Prospektor Ember', vessel: ['Prospektor Ember', 'prospector Ember'],
                signal: ['Ember hier. Zwei Kisten Medikamente treiben neben mir. Bring sie mir, und du bekommst vierzehnhundert.',
                    'Ember here. Two medical cases are drifting beside me. Bring them in and you get fourteen hundred.'],
                context: ['Zwei medizinische Behälter, und ein Prospektor ohne Greifer.', 'Two medical cases, and a prospector with no grabber.'],
                actors: [v('ember', 'Ember', 'prospector', 'miner', [0, 0, 0])],
                containers: [{commodity: 'medicine', quantity: 2}], returnPayment: 1400,
            },
        ],
    },
    {
        id: 'dispute',
        title: ['Streit um Bergung', 'Disputed salvage'],
        genuine: true,
        weight: 12,
        family: ['Diplomatie', 'Diplomacy'],
        setups: [
            {
                caller: 'Marrow Salvage', vessel: ['Marrow Salvage', 'Marrow Salvage'],
                signal: ['Marrow Salvage an den Piloten da draußen. Gannet Recovery will uns die Bergung wegschnappen. Die Meridian Spindle ist unser Fund — wir waren zuerst da.',
                    'Marrow Salvage to the pilot out there. Gannet Recovery is trying to take our salvage. The Meridian Spindle is our find — we were here first.'],
                context: ['Zwei Bergungscrews streiten über dasselbe Wrack.', 'Two salvage crews are arguing over the same wreck.'],
                actors: [
                    {key: 'marrow', name: 'Marrow Salvage', hullId: 'mule', role: 'trader', offset: [-260, 30, 0], faction: 'independents', neutral: true},
                    {key: 'gannet', name: 'Gannet Recovery', hullId: 'prospector', role: 'miner', offset: [260, -30, 0], faction: 'independents', neutral: true},
                ],
                rival: 'gannet', wreckName: 'Meridian Spindle',
                negotiate: 1400, support: 2200,
            },
            {
                caller: 'Blue Hour Collective', vessel: ['Blue Hour Collective', 'Blue Hour Collective'],
                signal: ['Blue Hour an alle. Rook Field Services behauptet, die Spindle gehöre ihnen. Wir waren zuerst hier, und wir gehen nicht.',
                    'Blue Hour to all. Rook Field Services claims the Spindle is theirs. We were here first, and we are not leaving.'],
                context: ['Zwei Crews, ein Wrack, kein Schiedsrichter.', 'Two crews, one wreck, no referee.'],
                actors: [
                    {key: 'blue-hour', name: 'Blue Hour', hullId: 'prospector', role: 'miner', offset: [-280, 40, 40], faction: 'independents', neutral: true},
                    {key: 'rook-field', name: 'Rook Field Services', hullId: 'mule', role: 'trader', offset: [280, -40, -40], faction: 'independents', neutral: true},
                ],
                rival: 'rook-field', wreckName: 'Meridian Spindle',
                negotiate: 1500, support: 2300,
            },
        ],
    },
];

export const DISTRESS_VARIANTS = Object.freeze(VARIANTS);
export const DISTRESS_VARIANT_IDS = Object.freeze(VARIANTS.map(entry => entry.id));
const BY_ID = new Map(VARIANTS.map(entry => [entry.id, entry]));

export const distressVariant = id => BY_ID.get(id);
export const distressSetup = (variant, setup = 0) => {
    const def = BY_ID.get(variant);
    if (!def) return undefined;
    return def.setups[Math.max(0, Math.min(def.setups.length - 1, Number(setup) | 0))];
};
export const isDistressVariant = id => BY_ID.has(id);

// Variant -> index of the setup that ran last. Kept beside lastVariants so a
// category alternates its callers instead of drawing the same one twice in a row.
function normalizeLastSetups(raw) {
    const result = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
    for (const [variant, setup] of Object.entries(raw)) {
        const def = BY_ID.get(variant);
        if (!def || !Number.isFinite(Number(setup))) continue;
        result[variant] = Math.max(0, Math.min(def.setups.length - 1, Number(setup) | 0));
    }
    return result;
}

// A roster is derived from the authored setup, never trusted from a save. It
// keeps actor identity stable across reloads and lets a variant be replayed in
// the review environment without extra schema.
export const distressRoster = (variant, setup = 0) => (distressSetup(variant, setup)?.actors ?? []).map(entry => ({...entry, offset: [...entry.offset]}));

const setupFor = active => distressSetup(active?.variant, active?.setup);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const tuple = value => Array.isArray(value) && value.length === 3 && value.every(entry => Number.isFinite(Number(entry)))
    ? value.map(entry => Number(entry))
    : undefined;
const record = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out = {};
    for (const [key, entry] of Object.entries(value).slice(0, 32)) {
        if (typeof key !== 'string' || key.length < 1 || key.length > 40) continue;
        if (typeof entry === 'string' || typeof entry === 'boolean' || Number.isFinite(Number(entry))) out[key] = entry;
    }
    return out;
};
const shortString = (value, max = 80) => typeof value === 'string' ? value.slice(0, max) : '';

export function normalizeDistressActors(candidate) {
    if (!Array.isArray(candidate)) return [];
    const seen = new Set(), out = [];
    for (const raw of candidate.slice(0, 8)) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const key = typeof raw.key === 'string' && /^[a-z0-9-]{1,24}$/.test(raw.key) ? raw.key : undefined;
        if (!key || seen.has(key)) continue;
        const position = tuple(raw.position);
        if (!position) continue;
        seen.add(key);
        out.push({
            key,
            role: shortString(raw.role, 16) || 'trader',
            hullId: shortString(raw.hullId, 32) || undefined,
            name: shortString(raw.name, 48) || key,
            faction: shortString(raw.faction, 16) || 'independents',
            hull: Math.max(0, finite(raw.hull, 0)),
            shield: Math.max(0, finite(raw.shield, 0)),
            maxHull: Math.max(1, finite(raw.maxHull, finite(raw.hull, 1))),
            position,
            rotation: Array.isArray(raw.rotation) && raw.rotation.length === 4 && raw.rotation.every(entry => Number.isFinite(Number(entry)))
                ? raw.rotation.map(entry => Number(entry))
                : undefined,
            velocity: tuple(raw.velocity),
            destroyed: raw.destroyed === true,
            surrendered: raw.surrendered === true,
        });
    }
    return out;
}

function normalizeActive(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const variant = isDistressVariant(raw.variant) ? raw.variant : undefined;
    if (!variant) return null;
    const phase = DISTRESS_ACTIVE_PHASES.includes(raw.phase) ? raw.phase : 'signal';
    const position = tuple(raw.position);
    if (!position) return null;
    const setup = clamp(Number(raw.setup) | 0, 0, distressVariant(variant).setups.length - 1);
    const setupData = distressSetup(variant, setup);
    const now = finite(raw.createdAt, 0);
    return {
        id: /^distress-[a-z0-9-]{1,32}$/.test(String(raw.id ?? '')) ? String(raw.id) : `distress-${Math.floor(finite(raw.createdAt, 0))}`,
        variant, setup,
        seed: finite(raw.seed, 1),
        // Which mayday the drive picked up. Older records have no field, so the
        // index is derived from the seed instead of defaulting every legacy call
        // to the same voice.
        intercept: normalizeIntercept(raw.intercept, raw.seed, raw.createdAt),
        systemId: shortString(raw.systemId, 32) || 'helios-verge',
        instanceId: shortString(raw.instanceId, 32) || undefined,
        position,
        phase,
        caller: shortString(raw.caller, 48) || setupData?.caller || 'Unknown',
        vessel: shortString(raw.vessel, 64) || '',
        createdAt: now,
        discoveredAt: finite(raw.discoveredAt, 0),
        involvedAt: finite(raw.involvedAt, 0),
        deadline: Math.max(0, finite(raw.deadline, 0)),
        actors: normalizeDistressActors(raw.actors),
        objectives: record(raw.objectives),
        progress: {
            ...record(raw.progress),
            scanRevealed: raw.progress?.scanRevealed === true,
            exposed: raw.progress?.exposed === true,
            betrayed: raw.progress?.betrayed === true,
            prefight: raw.progress?.prefight === true,
            repaired: finite(raw.progress?.repaired, 0),
            escapeAt: finite(raw.progress?.escapeAt, 0),
            exit: tuple(raw.progress?.exit),
            route: Array.isArray(raw.progress?.route)
                ? raw.progress.route.map(tuple).filter(Boolean).slice(0, 12)
                : [],
            exitYaw: finite(raw.progress?.exitYaw, 0),
            escortAt: finite(raw.progress?.escortAt, 0),
            joinedAt: finite(raw.progress?.joinedAt, 0),
            burstAt: finite(raw.progress?.burstAt, 0),
            burstStage: clamp(Number(raw.progress?.burstStage) | 0, 0, 3),
            jumpAt: finite(raw.progress?.jumpAt, 0),
            straySince: finite(raw.progress?.straySince, 0),
            strayed: raw.progress?.strayed === true,
            beaconsFailed: raw.progress?.beaconsFailed === true,
            escortHull: clamp(finite(raw.progress?.escortHull, 0), 0, 1),
            outOfRangeAt: finite(raw.progress?.outOfRangeAt, 0),
            // The arrival briefing is shown once per event; a reload must not
            // pop the same card in the pilot's face again.
            briefedAt: finite(raw.progress?.briefedAt, 0),
            // The pilot already read the transmission on the hyperdrive leg, so
            // the card that opens on arrival continues the scene instead of
            // replaying the same mayday word for word.
            pickupFollowed: raw.progress?.pickupFollowed === true,
            lastProgressAt: finite(raw.progress?.lastProgressAt, now),
        },
        survivors: {
            total: clamp(Number(raw.survivors?.total) | 0, 0, 4),
            rescued: clamp(Number(raw.survivors?.rescued) | 0, 0, 4),
            delivered: clamp(Number(raw.survivors?.delivered) | 0, 0, 4),
        },
        cargo: record(raw.cargo),
        choices: record(raw.choices),
        settlement: {
            state: ['pending', 'paid', 'forfeited'].includes(raw.settlement?.state) ? raw.settlement.state : 'pending',
            reward: Math.max(0, Math.min(20000, finite(raw.settlement?.reward, 0))),
            paidAt: Math.max(0, finite(raw.settlement?.paidAt, 0)),
        },
        nextReminderAt: Math.max(0, finite(raw.nextReminderAt, 0)),
        nextMonitorAt: Math.max(0, finite(raw.nextMonitorAt, 0)),
        legacy: raw.legacy === 'lantern' ? 'lantern' : undefined,
    };
}

function normalizeHistory(candidate) {
    if (!Array.isArray(candidate)) return [];
    const out = [];
    for (const raw of candidate.slice(0, 64)) {
        if (out.length >= DISTRESS_HISTORY_LIMIT) break;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        if (!isDistressVariant(raw.variant)) continue;
        out.push({
            id: shortString(raw.id, 40) || `distress-archive-${out.length}`,
            variant: raw.variant,
            setup: clamp(Number(raw.setup) | 0, 0, 1),
            outcome: shortString(raw.outcome, 32) || 'archived',
            at: Math.max(0, finite(raw.at, 0)),
            reward: Math.max(0, Math.min(20000, finite(raw.reward, 0))),
        });
    }
    return out;
}

function archive(result, {id, variant, setup, outcome, at, reward = 0}) {
    result.history.unshift({id, variant, setup, outcome, at, reward});
    result.history = result.history.slice(0, DISTRESS_HISTORY_LIMIT);
}

// Existing careers may carry an active or resolved Lantern convoy in the
// exploration save. Move it into the recurring lifecycle exactly once: a live
// rescue keeps its damaged actors and deadline, a finished one becomes history
// and is never replayed.
function migrateLantern(result, world) {
    const convoy = world.exploration?.convoy;
    if (!['offered', 'active', 'rewarded', 'failed', 'declined'].includes(convoy)) return;
    const now = Math.max(0, finite(world.time, 0));
    if (result.active) return;
    if (convoy === 'rewarded' || convoy === 'failed' || convoy === 'declined') {
        const outcome = convoy === 'rewarded' ? 'rescued' : convoy === 'declined' ? 'declined' : 'failed';
        archive(result, {
            id: 'distress-lantern-legacy', variant: 'convoy', setup: 0, outcome, at: now,
            reward: Math.max(0, Math.min(4000, finite(world.exploration?.convoyReward, 0))),
        });
        result.lastVariants = ['convoy', ...result.lastVariants.filter(entry => entry !== 'convoy')].slice(0, 3);
        return;
    }
    const setup = distressSetup('convoy', 0);
    const active = {
        id: 'distress-lantern',
        variant: 'convoy', setup: 0, seed: finite(world.seed, 1),
        systemId: 'helios-verge', instanceId: 'mourning-line',
        position: [...CONVOY_POSITION],
        phase: convoy === 'active' ? 'involved' : 'discovered',
        caller: setup.caller, vessel: distressText(setup.vessel),
        createdAt: now, discoveredAt: now, involvedAt: convoy === 'active' ? now : 0,
        deadline: Math.max(0, finite(world.exploration?.convoyDeadline, 0)),
        actors: normalizeDistressActors(world.exploration?.actors?.convoy).map(actor => {
            const roster = distressRoster('convoy', 0);
            const pirate = actor.key.startsWith('raider');
            const match = pirate ? roster.find(entry => entry.key === `cutlass-${actor.key.split('-').at(-1)}`) : roster.find(entry => entry.key === actor.key);
            const key = pirate && match ? `cutlass-${actor.key.split('-').at(-1)}` : actor.key;
            return {...actor, key, role: match?.role ?? actor.role, hullId: match?.hullId ?? actor.hullId, name: match?.name ?? actor.name, faction: match?.faction ?? actor.faction};
        }),
        objectives: {}, progress: {lastProgressAt: now},
        survivors: {total: 0, rescued: 0, delivered: 0}, cargo: {}, choices: {help: convoy === 'active' ? 'accepted' : 'offered'},
        settlement: {state: 'pending', reward: 0, paidAt: 0}, nextReminderAt: 0, legacy: 'lantern',
    };
    result.active = active;
    result.lastVariants = ['convoy', ...result.lastVariants.filter(entry => entry !== 'convoy')].slice(0, 3);
}

export function normalizeDistress(world) {
    const raw = world?.distress && typeof world.distress === 'object' && !Array.isArray(world.distress) ? world.distress : {};
    const result = {
        active: normalizeActive(raw.active),
        history: normalizeHistory(raw.history),
        nextAt: Math.max(0, finite(raw.nextAt, 0)),
        counter: Math.max(0, Math.min(9999, Number(raw.counter) | 0)),
        lastVariants: Array.isArray(raw.lastVariants)
            ? [...new Set(raw.lastVariants.filter(isDistressVariant))].slice(0, 3)
            : [],
        // Which setup of a variant ran last, so the second caller of the same
        // category is not followed by the first one again.
        lastSetups: normalizeLastSetups(raw.lastSetups),
        migrated: raw.migrated === true,
    };
    if (!result.migrated) {
        migrateLantern(result, world);
        result.migrated = true;
    }
    if (world) world.distress = result;
    return result;
}

const clampIntercept = value => Math.max(0, Math.min(DISTRESS_INTERCEPT_COUNT - 1, Number(value) | 0));
const normalizeIntercept = (value, seed, createdAt) => Number.isFinite(Number(value))
    ? clampIntercept(value)
    : clampIntercept(Math.floor(seededRandom(`${Number(seed) || 1}:intercept:${Number(createdAt) || 0}`)() * DISTRESS_INTERCEPT_COUNT));
export const distressIntercept = active => distressText(DISTRESS_INTERCEPTS[normalizeIntercept(active?.intercept, active?.seed, active?.createdAt)] ?? DISTRESS_INTERCEPTS[0]);
// Only a trap hides behind the shared mayday pool, because a baited call never
// says what is actually wrong. Every genuine call speaks with its own words: a
// crew that is out of fuel says they are out of fuel.
export const distressPickupLine = active => active?.variant === 'trap'
    ? distressIntercept(active)
    : distressText(distressSetup(active?.variant, active?.setup)?.signal ?? '');

// Only the location reveals what the call really was. A trap stays "a distress
// call" on the monitor, the map and in the journal until the scan or the
// approach exposes it; every other variant is revealed by its briefing card.
export const distressRevealed = active => {
    if (!active) return false;
    if (active.phase === 'involved' || active.phase === 'resolved') return true;
    if (active.variant === 'trap') return active.progress?.exposed === true;
    return Boolean(active.progress?.briefedAt);
};
export const distressLabel = active => distressRevealed(active)
    ? distressVariant(active?.variant)?.title ?? ['Notruf', 'Distress call']
    : ['Notruf', 'Distress call'];

export function createDistressRecord({counter, variant, setup, seed, position, systemId, instanceId, now, caller, vessel, intercept}) {
    const data = distressSetup(variant, setup);
    const number = Math.max(1, Number(counter) | 0);
    return {
        id: `distress-${number}`,
        variant, setup,
        seed: finite(seed, 1),
        systemId: systemId || 'helios-verge',
        instanceId,
        position: [...position],
        phase: 'signal',
        intercept: normalizeIntercept(intercept, seed, now),
        caller: caller || data.caller,
        vessel: vessel || distressText(data.vessel),
        createdAt: now,
        discoveredAt: 0,
        involvedAt: 0,
        deadline: 0,
        actors: [],
        objectives: {},
        progress: {
            scanRevealed: false, exposed: false, betrayed: false, prefight: false, repaired: 0,
            escapeAt: 0, briefedAt: 0, pickupFollowed: false, lastProgressAt: now,
            // Debris escort: the projected route and the storm clock. The trail
            // itself is runtime-only on the ship, never saved.
            route: [], exitYaw: 0, escortAt: 0, joinedAt: 0, burstAt: 0, burstStage: 0,
            jumpAt: 0, straySince: 0, strayed: false, onLine: false, beaconsFailed: false,
            escortHull: 0, outOfRangeAt: 0,
        },
        survivors: {total: data.wreck?.survivors ?? 0, rescued: 0, delivered: 0},
        cargo: {},
        choices: {},
        settlement: {state: 'pending', reward: 0, paidAt: 0},
        nextReminderAt: 0,
        nextMonitorAt: 0,
    };
}

// ---------------------------------------------------------------- objectives

const call = active => active.caller || distressSetup(active.variant, active.setup)?.caller || 'Unknown';
const clock = seconds => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;

export function distressObjective(active, save) {
    if (!active) return ['', ''];
    // Until the pilot is on scene the call is just a bearing; naming the
    // variant here would announce a trap from the cockpit glass.
    if (!distressRevealed(active)) return ['Notruf · Peilung folgen', 'Distress call · follow the bearing'];
    const data = distressSetup(active.variant, active.setup);
    const alive = (active.actors ?? []).filter(actor => !actor.destroyed && actor.hull > 0);
    switch (active.variant) {
        case 'convoy': {
            const total = data.victims ?? 0;
            const safe = alive.filter(actor => actor.role !== 'pirate' && !actor.destroyed).length;
            return active.phase === 'involved'
                ? [`Geleitschutz · ${safe}/${total} intakt`, `Escort · ${safe}/${total} intact`]
                : [`Konvoi unter Beschuss · ${distressText(data.vessel)}`, `Convoy under fire · ${distressText(data.vessel)}`];
        }
        case 'wreck': {
            const wreck = save?.world?.combatWrecks?.[`wreck-distress-${active.id}`];
            // A signal has no wreck record yet; report the authored manifest so
            // the journal does not advertise an empty hold before contact.
            const manifest = (data.wreck?.cargo ?? []).reduce((sum, entry) => sum + (entry.quantity ?? 1), 0);
            const remaining = wreck ? wreck.contents.reduce((sum, entry) => sum + (entry.quantity ?? 1), 0) : manifest;
            const pods = Math.max(0, (active.survivors?.total ?? 0) - (active.survivors?.rescued ?? 0));
            return [`Wrack bergen · ${remaining} Einheiten · ${pods} Kapsel${pods === 1 ? '' : 'n'}`, `Recover the wreck · ${remaining} units · ${pods} pod${pods === 1 ? '' : 's'}`];
        }
        case 'trap':
            return active.progress?.exposed
                ? ['Falle offen · kämpfen oder abdrehen', 'Trap sprung · fight or break off']
                : ['Funk prüfen · Signatur passt nicht zur Fracht', 'Check the call · signature does not match the manifest'];
        case 'fuel': {
            const reserve = Math.floor(Number(save?.player?.fuel) || 0);
            return [`Treibstoff ${data.fuel} · an Bord ${reserve}`, `Fuel ${data.fuel} · aboard ${reserve}`];
        }
        case 'disabled': {
            const target = Math.round((data.repairTarget ?? .6) * 100);
            const ship = active.actors?.[0];
            if (!ship) return [`Reparatur · Ziel ${target}% Hülle`, `Repair · target ${target}% hull`];
            const hull = Math.round(ship.hull / Math.max(1, ship.maxHull) * 100);
            return [`Reparatur · Hülle ${hull}% → ${target}%`, `Repair · hull ${hull}% → ${target}%`];
        }
        case 'debris': {
            const p = active.progress ?? {};
            const now = Number(save?.world?.time) || 0;
            const hull = Math.round(Math.max(0, Math.min(1, Number(p.escortHull) || 0)) * 100);
            if (p.jumpAt) {
                const left = Math.max(0, Math.ceil(p.jumpAt + DISTRESS_ESCORT_SPINUP - now - 1e-6));
                return [`Sprungkurs · ${left} s · Hülle ${hull}%`, `Jump vector · ${left} s · hull ${hull}%`];
            }
            if (p.method === 'escape' || p.escortAt) {
                const left = p.burstAt ? p.burstAt - now : DISTRESS_ESCORT_BURST;
                // Until the handover the transport is still burning toward the
                // pilot; "follow the beacons" would be a lie for that stretch.
                if (!p.joinedAt) return [`Frachter wartet · geh längsseits · dann Sturm ${clock(left)}`, `Transport holding · come alongside · then storm ${clock(left)}`];
                return [`Bojen folgen · Hülle ${hull}% · Sturm ${clock(left)}`, `Follow the beacons · hull ${hull}% · storm ${clock(left)}`];
            }
            return ['Freier Kurs · Bojen legen', 'Clear vector · lay the beacons'];
        }
        case 'jettison': {
            const total = (data.containers ?? []).reduce((sum, entry) => sum + entry.quantity, 0);
            const wreckCount = (save?.world?.combatWrecks ? Object.values(save.world.combatWrecks).filter(entry => entry.distressEventId === active.id && entry.contents.length) : []);
            const remaining = wreckCount.reduce((sum, entry) => sum + entry.contents.reduce((n, item) => n + (item.quantity ?? 1), 0), 0);
            if (active.phase === 'signal') return [`Container bergen · ${total} Einheiten draußen`, `Recover containers · ${total} units adrift`];
            if (remaining === 0) {
                if (active.progress?.keep === true) return ['Fracht behalten · zurück zum Dock', 'Keep the cargo · return to dock'];
                const holds = (data.containers ?? []).every(entry => (save?.player?.cargo?.[entry.commodity] ?? 0) >= entry.quantity);
                if (holds) return ['Fracht zurückgeben · Notruf beantworten', 'Return the cargo · answer the call'];
            }
            return [`Container bergen · ${Math.max(0, remaining)}/${total} übrig`, `Recover containers · ${Math.max(0, remaining)}/${total} left`];
        }
        case 'dispute': {
            const rival = data.actors.find(actor => actor.key === data.rival);
            const claimant = data.actors.find(actor => actor.key !== data.rival);
            if (active.progress?.sided) {
                const backed = active.progress.side === 'side-a' ? claimant : rival;
                const enemy = active.progress.side === 'side-a' ? rival : claimant;
                return [`${enemy?.name ?? 'Gegner'} bekämpfen · ${backed?.name ?? 'Verbündete'} decken`, `Engage ${enemy?.name ?? 'the rival'} · cover ${backed?.name ?? 'the ally'}`];
            }
            return [`Streit um ${data.wreckName} · verhandeln oder Partei ergreifen`, `Dispute over ${data.wreckName} · negotiate or take a side`];
        }
        default:
            return ['Notruf', 'Distress call'];
    }
}

export function distressOpenLine(active) {
    const data = distressSetup(active.variant, active.setup);
    return distressText(active.progress?.pickupFollowed ? arrivalLine(active) : data.signal);
}

// The first card a pilot sees is the transmission itself, picked up on a
// hyperdrive leg. Repeating it verbatim once the ship drops out reads as a bug,
// so the arrival briefing opens with a word from the scene instead: the caller
// noticing the ship, the recording running dry, the standoff getting a witness.
// Nobody announces the state of the fight — a crew under fire shouts, it does
// not narrate its own battle.
//
// Two lines per variant, picked by the setup, so the second caller of a category
// does not open with the first one's sentence. `{caller}` is only in the spoken
// versions; narrator lines (a dead freighter) have no one left to speak them.
const ARRIVAL_LINES = Object.freeze({
    convoy: [
        ['{caller}: „Beeil dich, sie greifen an!“',
            '{caller}: “Hurry, they are attacking!”'],
        ['{caller}: „Sie kommen zurück — und ich bin allein hier draußen.“',
            '{caller}: “They are coming back — and I am out here alone.”'],
    ],
    wreck: [
        ['Kein offener Kanal, nur die Aufzeichnung — und ein Rumpf, der noch warm ist.',
            'No live channel, only the recording — and a hull that is still warm.'],
        ['Ein offener Kanal, ein leeres Cockpit — und draußen kreuzen zwei Signaturen.',
            'An open channel, an empty cockpit — and two signatures crossing outside.'],
    ],
    trap: [
        ['{caller}: „Oh. Du bist schneller hier, als ich dachte.“',
            '{caller}: “Oh. You got here faster than I expected.”'],
        ['{caller}: „Na endlich. Ich dachte schon, ich muss das allein hinbekommen.“',
            '{caller}: “There you are. I was starting to think I would have to manage this alone.”'],
    ],
    fuel: [
        ['{caller}: „Da bist du ja. Ich dachte schon, hier hört uns keiner.“',
            '{caller}: “There you are. I was starting to think no one was listening.”'],
        ['{caller}: „Du hast mich gefunden. Ich zeig dir den Tank, dann kannst du selbst nachzählen.“',
            '{caller}: “You found me. I will show you the tank, then you can count for yourself.”'],
    ],
    disabled: [
        ['{caller}: „Du hast angehalten. Gut. Allein bekommen wir die Maschine nicht mehr an.“',
            '{caller}: “You stopped. Good. We are not getting this engine back on our own.”'],
        ['{caller}: „Vorsicht, der Arm hängt lose. Einer von uns muss raus, wenn das was werden soll.“',
            '{caller}: “Careful, the arm is hanging loose. One of us has to go outside if this is going to work.”'],
    ],
    debris: [
        ['{caller}: „Du bist in Sicht. Sag mir, dass du dich in diesem Feld auskennst.“',
            '{caller}: “We have you in sight. Tell me you know your way through this field.”'],
        ['{caller}: „Ich sehe dich. Mein Nav ist blind — ich brauche deine Spur, nicht deine Meinung.“',
            '{caller}: “I can see you. My nav is blind — I need your trail, not your opinion.”'],
    ],
    jettison: [
        ['{caller}: „Die Container sind deine, wenn du sie kriegst. Keiner von uns kommt noch ran.“',
            '{caller}: “The containers are yours if you can reach them. None of us can anymore.”'],
        ['{caller}: „Die Kisten treiben noch. Ich komm nicht ran — der Arm ist im Eimer.“',
            '{caller}: “The crates are still drifting. I cannot reach them — the arm is gone.”'],
    ],
    dispute: [
        ['{caller}: „Endlich ein Dritter. Vielleicht hört jetzt einer zu.“',
            '{caller}: “Finally a third party. Maybe someone will listen now.”'],
        ['{caller}: „Da kommt jemand. Sag diesen Leuten, dass eine Bake keine Lizenz ist.“',
            '{caller}: “Someone is coming. Tell these people a beacon is not a licence.”'],
    ],
});
function arrivalLine(active) {
    const lines = ARRIVAL_LINES[active.variant];
    if (!lines) return ['Der Notruf ist noch auf dem Kanal.', 'The call is still on the channel.'];
    const index = Math.max(0, Math.min(lines.length - 1, Number(active.setup) | 0));
    const speaker = call(active);
    return lines[index].map(line => line.replace('{caller}', speaker));
}

// What the scene says after the opener. A followed call pairs this with the
// arrival line; a call answered straight from the journal pairs it with the
// transmission, so the same card reads correctly either way. Variants whose
// branch writes its own second paragraph (fuel, disabled) return nothing here.
function sceneTail(active) {
    switch (active.variant) {
        case 'wreck':
            return ['Der Frachtraum ist noch versiegelt.', 'The hold is still sealed.'];
        case 'trap':
            return ['Die Stimme ist ruhig. Zu ruhig für einen Havaristen.',
                'The voice is calm. Too calm for a ship in distress.'];
        case 'debris':
            return ['Komm längsseits, dann wirf deine Bojen — wir hängen uns an deine Spur.',
                'Come alongside, drop your beacons, and we will follow your trail.'];
        case 'jettison':
            return ['Wir wissen, was da drin ist. Bring sie trotzdem zurück.',
                'We know what is inside them. Bring them back anyway.'];
        case 'dispute':
            return ['Sie sind bewaffnet, ich auch. Geschossen hat noch keiner.',
                'They are armed, so am I. No one has fired yet.'];
        default:
            return undefined;
    }
}

export function distressOutcomeText(entry) {
    const title = distressVariant(entry.variant)?.title ?? ['Notruf', 'Distress call'];
    const outcome = entry.outcome;
    const reward = entry.reward > 0 ? ` · ${entry.reward.toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US')} cr` : '';
    if (outcome === 'rescued') return [`${distressText(title)} · gerettet${reward}`, `${distressText(title)} · rescued${reward}`];
    if (outcome === 'salvaged') return [`${distressText(title)} · Wrack geborgen${reward}`, `${distressText(title)} · wreck recovered${reward}`];
    if (outcome === 'repaired') return [`${distressText(title)} · repariert${reward}`, `${distressText(title)} · repaired${reward}`];
    if (outcome === 'escaped') return [`${distressText(title)} · freier Kurs${reward}`, `${distressText(title)} · clear vector${reward}`];
    if (outcome === 'lost') return [`${distressText(title)} · im Sturm verloren`, `${distressText(title)} · lost in the storm`];
    if (outcome === 'supplied') return [`${distressText(title)} · versorgt${reward}`, `${distressText(title)} · supplied${reward}`];
    if (outcome === 'returned') return [`${distressText(title)} · Fracht zurückgegeben${reward}`, `${distressText(title)} · cargo returned${reward}`];
    if (outcome === 'settled') return [`${distressText(title)} · Streit beigelegt${reward}`, `${distressText(title)} · dispute settled${reward}`];
    if (outcome === 'fought-off') return [`${distressText(title)} · Angreifer vertrieben`, `${distressText(title)} · attackers driven off`];
    if (outcome === 'survivors-delivered') return [`${distressText(title)} · Überlebende abgeliefert${reward}`, `${distressText(title)} · survivors delivered${reward}`];
    if (outcome === 'betrayed') return [`${distressText(title)} · Hilfe verweigert, Zahlung entzogen`, `${distressText(title)} · help refused, payment withdrawn`];
    if (outcome === 'declined') return [`${distressText(title)} · abgelehnt`, `${distressText(title)} · declined`];
    if (outcome === 'failed') return [`${distressText(title)} · gescheitert`, `${distressText(title)} · failed`];
    if (outcome === 'withdrawn') return [`${distressText(title)} · abgebrochen`, `${distressText(title)} · withdrawn`];
    return [`${distressText(title)} · unbeantwortet`, `${distressText(title)} · unanswered`];
}

export function distressJournal(save) {
    const data = save?.world?.distress;
    if (!data) return [];
    const rows = [];
    if (data.active) {
        const active = data.active;
        const objective = distressObjective(active, save);
        rows.push({
            title: distressText(distressLabel(active)),
            text: `${active.caller} · ${distressText(objective)}`,
            actions: [
                {id: 'navigate', label: ['Kurs setzen', 'Set course']},
                ...(active.systemId === save?.player?.systemId && active.phase !== 'resolved' && active.phase !== 'abandoned'
                    ? [{id: 'answer', label: ['Notruf beantworten', 'Answer distress call']}]
                    : []),
            ],
        });
    }
    for (const entry of (data.history ?? []).slice(0, 3))
        rows.push({title: distressText(distressVariant(entry.variant)?.title ?? ['Notruf', 'Distress call']), text: distressText(distressOutcomeText(entry)), actions: []});
    return rows;
}

// ---------------------------------------------------------------- dialogue
// Adventure dialogue expects localized strings. Build with [de,en] pairs and
// flatten at the end so every node and choice shares the same language.

const choice = (label, distressChoice, extra) => ({label, distressChoice, ...extra});
const hasRepairDrone = save => Object.values(save?.player?.droneFleet?.unitsById ?? {}).some(unit => unit.type === 'repair' && unit.hull > 0 && unit.state !== 'destroyed');

function baseScript(active) {
    return {start: 'main', nodes: {main: {text: '', choices: []}}};
}

function resourceBlocked(save, active) {
    const p = save?.player;
    if (!p) return ['Keine Verbindung zum Schiff.', 'No link to your ship.'];
    const distance = Math.hypot(p.position[0] - active.position[0], p.position[1] - active.position[1], p.position[2] - active.position[2]);
    if (distance > DISTRESS_ANSWER_RANGE)
        return [`Zu viel Rauschen. Komm auf ${Math.round(DISTRESS_ANSWER_RANGE)} km ran.`, `Too much static. Get within ${Math.round(DISTRESS_ANSWER_RANGE)} km.`];
    return undefined;
}

export function distressDialogue(conversationId, save) {
    const active = save?.world?.distress?.active;
    if (!active || active.id !== conversationId) return undefined;
    const data = distressSetup(active.variant, active.setup);
    const script = baseScript(active);
    const node = script.nodes.main;
    const blocked = resourceBlocked(save, active);

    const player = save.player;
    const fuel = Math.floor(Number(player.fuel) || 0);
    const cargo = player.cargo ?? {};
    // A pilot who followed the bearing on a hyperdrive leg has already read the
    // transmission; every "discovered" card below opens with the arrival beat
    // instead of the same mayday a second time. The comms log uses the same
    // line, so the channel does not show the transmission twice either.
    const opener = distressOpenLine(active);
    const scene = [opener, distressText(sceneTail(active))].filter(Boolean).join('\n\n');
    const distance = Math.hypot(player.position[0] - active.position[0], player.position[1] - active.position[1], player.position[2] - active.position[2]);

    // A call picked up on a hyperdrive leg opens before the ship has dropped
    // out: the pilot hears the transmission on the emergency band and decides
    // whether to leave the leg now. The scenario card still comes on arrival.
    if (active.progress?.pickup) {
        // The call itself: a genuine crew names its trouble, a trap borrows one
        // of the shared maydays. Either way the caller and the bearing are all
        // the pilot has until the ship drops out.
        const source = distressPickupLine(active);
        const km = Math.round(distance).toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US');
        node.text = [
            `${call(active)}: „${source}“\n\nDie Quelle liegt abseits deiner Flugbahn.`,
            `${call(active)}: “${source}”\n\nThe source sits off your flight path.`,
        ];
        node.choices = [
            choice(['Signal verfolgen.','Follow the signal.'], 'follow'),
            choice(['Weiterfliegen.','Keep flying.'], 'pass'),
        ];
        // No situation row and no portrait on an intercepted call: either one
        // would tell the pilot what is waiting at the source — and a trap caller
        // would look exactly like a wounded freighter on the radio.
        node.mission = {
            kicker: ['FUNK · NOTRUF AUFGEFANGEN', 'COMMS · DISTRESS CALL INTERCEPTED'],
            title: active.caller,
            rows: [{label: ['PEILUNG', 'BEARING'], value: `${km} km`}],
        };
        return localize(script);
    }

    if (blocked) {
        node.text = ['Nur noch Rauschen. Komm näher ran, dann können wir reden.', 'Nothing but static. Get closer and we can talk.'];
        // Closing the panel keeps the signal alive; only an explicit decline
        // abandons the rescue.
        node.choices = [choice(['Später.','Later.'], 'close')];
        return localize(script);
    }

    switch (active.variant) {
        case 'convoy': {
            if (active.phase === 'involved') {
                const total = data.victims ?? 0;
                const safe = (active.actors ?? []).filter(actor => actor.role !== 'pirate' && !actor.destroyed && actor.hull > 0).length;
                // A roster that has not been snapshotted yet knows nobody alive;
                // "0 of 2 left" would be a lie spoken by a survivor.
                const headcount = safe > 0 && total > 0 ? (safe === total ? ` Wir sind noch ${safe}.` : ` Wir sind nur noch ${safe} von ${total}.`) : '';
                node.text = [`${call(active)}: „Sie lassen nicht locker. Wir halten die Köpfe unten, aber ewig geht das nicht.${headcount}“`,
                    `${call(active)}: “They are not letting up. We keep our heads down, but this cannot last.${headcount ? (safe === total ? ` We are still ${safe}.` : ` We are down to ${safe} of ${total}.`) : ''}”`];
                node.choices = [
                    choice(['Ich bleibe an ihnen.','I am staying on them.'], 'close'),
                    choice(['Ich muss raus.','I have to break off.'], 'withdraw'),
                ];
            } else {
                node.text = scene;
                node.choices = [
                    choice(['Ich gehe rein.','I am going in.'], 'help'),
                    choice(['Nicht meine Schlacht.','Not my fight.'], 'decline'),
                ];
            }
            break;
        }
        case 'wreck': {
            const wreck = save.world.combatWrecks?.[`wreck-distress-${active.id}`];
            const remaining = wreck ? wreck.contents.reduce((sum, entry) => sum + (entry.quantity ?? 1), 0) : 0;
            const pods = Math.max(0, (active.survivors?.total ?? 0) - (active.survivors?.rescued ?? 0));
            if (active.phase === 'involved') {
                const cargoLine = remaining > 0 ? `Im Frachtraum liegen noch ${remaining} Einheiten.` : 'Der Frachtraum ist leer.';
                const podLine = pods > 0 ? 'Neben dem Rumpf treibt eine Kapsel.' : 'Die Kapsel ist geborgen.';
                node.text = [`${cargoLine} ${podLine}`,
                    `${remaining > 0 ? `There are still ${remaining} units in the hold.` : 'The hold is empty.'} ${pods > 0 ? 'One pod is still drifting beside the hull.' : 'The pod is recovered.'}`];
                node.choices = [choice(['Ich räume das Wrack.','I am stripping the wreck.'], 'close'), choice(['Ich lasse es liegen.','I am leaving it.'], 'withdraw')];
            } else {
                node.text = scene;
                node.choices = [
                    choice(['Ich sehe mir das Wrack an.','I will take a look at the wreck.'], 'accept'),
                    choice(['Nicht mein Wrack.','Not my wreck.'], 'decline'),
                ];
            }
            break;
        }
        case 'trap': {
            if (active.progress?.exposed) {
                node.text = [`${distressText(data.clue)}\n\n${call(active)}: „Überraschung. Hände weg von den Waffen.“`,
                    `${distressText(data.clue)}\n\n${call(active)}: “Surprise. Hands off your guns.”`];
                node.choices = [
                    choice(['Dann eben so.','Fine. Let us do this.'], 'fight'),
                    choice(['Ich bin weg.','I am gone.'], 'withdraw'),
                ];
            } else {
                node.text = scene;
                node.choices = [
                    choice(['Sensorcheck.','Run a sensor check.'], 'scan'),
                    choice(['Ich komme näher.','I am coming closer.'], 'expose'),
                    choice(['Nicht heute.','Not today.'], 'decline'),
                ];
            }
            break;
        }
        case 'fuel': {
            const enough = fuel >= data.fuel;
            const payment = data.payment.toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US');
            // The crew reads the pilot's tank off the transponder; saying it in
            // their own voice keeps the card a conversation instead of a status
            // readout.
            node.text = enough
                ? [`${opener}\n\nDu hast ${fuel} im Tank — ${data.fuel} davon tun dir nicht weh. Gib sie mir, und ich bin hier raus.`,
                    `${opener}\n\nYou are carrying ${fuel} — ${data.fuel} of them will not hurt you. Hand them over and I am out of here.`]
                : [`${opener}\n\nDu hast selbst nur ${fuel}. Behalte sie — ich will nicht, dass du auch hier festsitzt.`,
                    `${opener}\n\nYou are running on ${fuel} yourself. Keep them — I do not want you stuck out here too.`];
            node.choices = enough ? [
                choice([`${data.fuel} Einheiten abgeben · ${payment} cr.`, `Hand over ${data.fuel} units · ${payment} cr.`], 'transfer'),
                choice(['Ohne Bezahlung — schenken.','No payment — make it a gift.'], 'donate'),
                choice(['Ich brauche den Sprit selbst.','I need the fuel myself.'], 'decline'),
            ] : [choice(['Ich kann nicht helfen.','I cannot help.'], 'decline')];
            break;
        }
        case 'disabled': {
            const hasParts = (cargo.machinery ?? 0) >= data.parts;
            const partCount = data.parts === 1 ? 'eine' : data.parts === 2 ? 'zwei' : String(data.parts);
            const partLine = hasParts
                ? (data.parts === 1 ? 'Du hast die eine Einheit an Bord, oder?' : `Du hast die ${partCount} Einheiten an Bord, oder?`)
                : (data.parts === 1 ? 'Ich brauche eine Einheit Ersatzteile, und ich habe keine.' : `Ich brauche ${partCount} Einheiten Ersatzteile, und ich habe keine.`);
            node.text = [`${opener}\n\n${partLine} Eine Reparaturdrohne tut es auch — oder du kommst selbst rüber und hältst die Hände still.`,
                `${opener}\n\n${hasParts ? `You have the ${data.parts === 1 ? 'one unit' : `${data.parts} units`} aboard, right?` : `I need ${data.parts === 1 ? 'one unit' : `${data.parts} units`} of parts, and I have none.`} A repair drone would do it too — or you come aboard and keep your hands steady.`];
            node.choices = [
                ...(hasParts ? [choice([`${data.parts === 1 ? 'Eine Einheit' : `${data.parts} Einheiten`} Ersatzteile abgeben.`, `Hand over ${data.parts === 1 ? 'one unit' : `${data.parts} units`} of parts.`], 'parts')] : []),
                ...(hasRepairDrone(save) ? [choice(['Reparaturdrohne schicken.','Send a repair drone.'], 'drone')] : []),
                choice(['Ich komme selbst rüber.','I will come aboard myself.'], 'crew'),
                choice(['Ich kann nicht bleiben.','I cannot stay.'], 'decline'),
            ];
            if (active.phase === 'involved') node.choices = [
                choice(['Weiterarbeiten.','Keep working.'], 'close'),
                choice(['Ich muss los.','I have to go.'], 'withdraw'),
            ];
            break;
        }
        case 'debris': {
            const p = active.progress ?? {};
            const left = p.burstAt ? Math.max(0, p.burstAt - (Number(save.world.time) || 0)) : DISTRESS_ESCORT_BURST;
            if (active.phase === 'involved') {
                const hull = Math.round(Math.max(0, Math.min(1, Number(p.escortHull) || 0)) * 100);
                node.text = [p.joinedAt
                        ? `${call(active)}: „Wir hängen an deiner Spur. Hülle ${hull}%, Sturm in ${clock(left)}. Wenn du zu weit rausfliegst, sehen wir die Brocken zu spät.“`
                        : `${call(active)}: „Wir halten Position — unser Nav ist tot. Komm längsseits, dann legen wir die Spur zusammen. Hülle ${hull}%, Sturm in ${clock(left)}.“`,
                    p.joinedAt
                        ? `${call(active)}: “We are on your trail. Hull ${hull}%, storm in ${clock(left)}. If you go wide, we see the metal too late.”`
                        : `${call(active)}: “We are holding position — our nav is dead. Come alongside and we do this together. Hull ${hull}%, storm in ${clock(left)}.”`];
                node.mission = {
                    kicker: ['MISSION LÄUFT', 'MISSION RUNNING'],
                    title: ['Geleit durch das Trümmerfeld', 'Escort through the debris'],
                    rows: [
                        {label: ['AUFGABE', 'OBJECTIVE'], value: p.joinedAt
                            ? ['Bojen folgen bis der Frachter draußen springen kann', 'Follow the beacons until the transport can jump clear']
                            : ['Längsseits gehen, dann die Bojen für die Spur legen', 'Come alongside, then lay the beacons for the trail']},
                        {label: ['STURM', 'STORM'], value: p.joinedAt ? [clock(left), clock(left)] : [`${clock(left)} ab Übergabe`, `${clock(left)} after handover`]},
                        {label: ['HÜLLE', 'HULL'], value: [`${hull}%`, `${hull}%`]},
                    ],
                };
                node.choices = [
                    choice(['Weiterfliegen.','Keep flying.'], 'close', {primary: true}),
                    choice(['Ich breche ab.','I am breaking off.'], 'withdraw'),
                ];
            } else {
                const payment = data.payment.toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US');
                const clean = Math.round(data.payment * DISTRESS_ESCORT_CLEAN_BONUS).toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US');
                node.text = scene;
                node.mission = {
                    kicker: ['MISSION · GELEITSCHUTZ', 'MISSION · ESCORT'],
                    title: ['Geleit durch das Trümmerfeld', 'Escort through the debris'],
                    rows: [
                        {label: ['AUFGABE', 'OBJECTIVE'], value: ['Längsseits gehen, dann die Bojen für die Spur legen', 'Come alongside, then lay the beacons for the trail']},
                        {label: ['FENSTER', 'WINDOW'], value: [`Sonnenfront in ${clock(DISTRESS_ESCORT_BURST)} ab Übergabe · Sprung nur draußen`, `Solar front in ${clock(DISTRESS_ESCORT_BURST)} after handover · jump only outside`]},
                        {label: ['RISIKO', 'RISK'], value: ['Vom Kurs abkommen beschädigt dich und den Frachter', 'Straying off the trail damages you and the transport']},
                        {label: ['BEZAHLUNG', 'PAYMENT'], value: [`${payment} cr · sauberer Lauf +${clean} cr`, `${payment} cr · clean run +${clean} cr`]},
                    ],
                };
                node.choices = [
                    choice(['MISSION ANNEHMEN · Bojen legen', 'ACCEPT MISSION · lay the beacons'], 'escape', {primary: true}),
                    choice(['ABLEHNEN · nicht mein Fall', 'DECLINE · not my problem'], 'decline'),
                ];
            }
            break;
        }
        case 'jettison': {
            const wreckCount = Object.values(save.world.combatWrecks ?? {}).filter(entry => entry.distressEventId === active.id && entry.contents.length);
            const remaining = wreckCount.reduce((sum, entry) => sum + entry.contents.reduce((n, item) => n + (item.quantity ?? 1), 0), 0);
            const holds = data.containers.every(entry => (cargo[entry.commodity] ?? 0) >= entry.quantity);
            const free = Math.max(0, Math.floor(cargoFree(save.player)));
            if (active.phase === 'involved') {
                node.text = [`${call(active)}: „${remaining > 0 ? 'Die Container treiben noch da draußen.' : holds ? 'Du hast alles beisammen. Bringst du es zurück?' : 'Da fehlt noch ein Teil. Wir warten.'}“`,
                    `${call(active)}: “${remaining > 0 ? 'The containers are still out there.' : holds ? 'You have all of it. Are you bringing it back?' : 'Some of it is still missing. We are waiting.'}”`];
                node.choices = [
                    ...(holds ? [choice([`Fracht zurückgeben · ${data.returnPayment.toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US')} cr.`, `Hand over cargo · ${data.returnPayment.toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US')} cr.`], 'handover')] : []),
                    ...(remaining === 0 ? [choice(['Behalten.','Keep it.'], 'keep')] : []),
                    choice(['Später.','Later.'], 'close'),
                    choice(['Ich fliege weiter.','I am moving on.'], 'withdraw'),
                ];
            } else {
                const room = free >= 1 ? '' : ['\n\nDein Laderaum ist voll — schaff Platz und komm wieder.', '\n\nYour hold is full — make room and come back.'];
                node.text = `${scene}${distressText(room)}`;
                node.choices = [
                    ...(free >= 1 ? [choice(['Ich bringe sie zurück.','I will bring them back.'], 'recover'),
                        choice(['Ich behalte sie.','I am keeping them.'], 'keep')] : [choice(['Ich schaffe erst Platz.','I will make room first.'], 'close')]),
                    choice(['Nicht mein Problem.','Not my problem.'], 'decline'),
                ];
            }
            break;
        }
        case 'dispute': {
            const rival = data.actors.find(actor => actor.key === data.rival);
            const rivalName = rival?.name ?? 'the other crew';
            const claimant = data.actors.find(actor => actor.key !== data.rival);
            const decisions = [
                choice(['Ich schlage eine Teilung vor.','I propose a split.'], 'negotiate'),
                choice([`Ich stehe zu ${active.caller}.`, `I side with ${active.caller}.`], 'side-a'),
                choice([`Ich stehe zu ${rivalName}.`, `I side with ${rivalName}.`], 'side-b'),
                choice(['Klär das selbst.','Settle it yourselves.'], 'decline'),
            ];
            if (active.phase === 'involved') {
                const backed = active.progress?.side === 'side-b' ? rivalName : active.caller;
                const enemy = active.progress?.side === 'side-b' ? active.caller : rivalName;
                node.text = [`${backed}: „Wir bleiben unten. ${enemy} kommt auf dich zu — Waffen oben.“`,
                    `${backed}: “We are staying down. ${enemy} is coming for you — guns up.”`];
                node.choices = [
                    choice(['Ich nehme sie auseinander.','I will take them apart.'], 'close'),
                    choice(['Ich ziehe mich zurück.','I am pulling out.'], 'withdraw'),
                ];
            } else {
                node.text = scene;
                node.choices = [
                    {label: ['Ich höre mir beide an.','I will hear both sides.'], next: 'accounts'},
                    ...decisions,
                ];
                // Listening to both claims is optional; the decision stays on
                // the main node so a player can skip straight to it.
                script.nodes.accounts = {
                    text: [`${claimant?.name ?? active.caller}: „Unsere Bake steht seit dem Sturm hier. Der Greifer hängt noch im Rumpf — willst du da wirklich ran?“\n${rivalName}: „Eine Bake ist keine Lizenz. Wir haben die Bergung heute Morgen gemeldet, mit zwei Leuten im Feld.“\n\nBeide haben Papiere. Zusammen passen sie nicht.`,
                        `${claimant?.name ?? active.caller}: “Our beacon has been here since the storm. Our grapple is still in the hull — do you really want to touch that?”\n${rivalName}: “A beacon is not a licence. We filed the salvage this morning, with two people in the field.”\n\nBoth have papers. Together they make no sense.`],
                    choices: decisions,
                };
            }
            break;
        }
        default:
            node.text = ['Der Notruf ist verstummt.', 'The distress call has gone quiet.'];
            node.choices = [choice(['Verstanden.','Understood.'], 'close')];
    }
    if (active.progress?.betrayed) {
        // The forfeit has to come out of the crew's mouth; a card that reads
        // "payment withdrawn" is a receipt, not a transmission.
        node.text = [`${call(active)}: „Wir haben alles mitgehört. Kein Geld — und ruf nicht wieder an.“`,
            `${call(active)}: “We heard all of it. No money — and do not call again.”`];
        node.choices = [choice(['Verstanden.','Understood.'], 'close')];
    }
    // Every call opens with the same scenario card: who is transmitting and
    // what the situation looks like before the pilot commits. The variant
    // title stays out of it — a false distress call must not label itself. The
    // escort supplies its own contract card, so it keeps that instead.
    if (!blocked && active.phase !== 'involved' && !node.mission) {
        // Authored vessel names read mid-sentence ("freighter wreck Cold
        // Harbor"); as a card title the first letter is capitalised.
        const vessel = data.vessel ? distressText(data.vessel) : active.caller;
        node.mission = {
            kicker: ['NOTRUF · KONTAKT', 'DISTRESS · CONTACT'],
            title: vessel ? vessel[0].toUpperCase() + vessel.slice(1) : vessel,
            rows: [{label: ['LAGE', 'SITUATION'], value: data.context ?? active.variant}],
        };
    }
    return localize(script);
}

function localize(script) {
    for (const node of Object.values(script.nodes)) {
        node.text = distressText(node.text);
        for (const entry of node.choices ?? []) entry.label = distressText(entry.label);
        if (node.mission) {
            node.mission.kicker = distressText(node.mission.kicker);
            node.mission.title = distressText(node.mission.title);
            for (const row of node.mission.rows) {
                row.label = distressText(row.label);
                row.value = distressText(row.value);
            }
        }
    }
    return script;
}
