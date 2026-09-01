import { getLanguage } from './i18n.js';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const hashString = (text) => {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};
export const mulberry32 = (seed) => {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let r = t;
        r = Math.imul(r ^ (r >>> 15), r | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};
export const seededRandom = (seed) => mulberry32(typeof seed === 'number' ? seed : hashString(seed));
export const randomBetween = (rng, min, max) => min + (max - min) * rng();
export const randomInt = (rng, min, maxInclusive) => Math.floor(randomBetween(rng, min, maxInclusive + 1));
export const pick = (rng, values) => values[Math.min(values.length - 1, Math.floor(rng() * values.length))];
const GIVEN_NAMES = [
    'Asha', 'Bram', 'Cass', 'Dara', 'Eli', 'Fenn', 'Gita', 'Hale', 'Iris', 'Juno', 'Kade', 'Lio', 'Mara', 'Niko', 'Orra',
    'Pax', 'Quill', 'Rhea', 'Soren', 'Tala', 'Uri', 'Venn', 'Wren', 'Xara', 'Yori', 'Zev',
];
const SURNAMES = [
    'Ames', 'Brann', 'Castor', 'Dorne', 'Eska', 'Fallow', 'Grail', 'Harker', 'Ives', 'Jex', 'Kell', 'Lorne', 'Morrow',
    'Nash', 'Ortega', 'Pryce', 'Quade', 'Rook', 'Sato', 'Tan', 'Ulan', 'Vek', 'Warde', 'Xu', 'Yarrow', 'Zane',
];
const CALLSIGNS = [
    'Ashfall', 'Bad Penny', 'Black Kite', 'Cinder', 'Deadlight', 'Fathom', 'Glass Jackal', 'Grinder', 'Hollowpoint',
    'Iron Choir', 'Long Knife', 'Moth', 'Night Tax', 'Old Smoke', 'Pale Wolf', 'Quarry', 'Razorwind', 'Shiver', 'Tin Saint',
];
export const proceduralPersonName = (rng) => `${pick(rng, GIVEN_NAMES)} ${pick(rng, SURNAMES)}`;
export const proceduralCallsign = (rng) => `${proceduralPersonName(rng)} “${pick(rng, CALLSIGNS)}”`;
// Locale-aware grouping: the German UI reads "3.200 cr", English "3,200 cr".
// Non-finite values (corrupted save, upstream NaN) render as 0 instead of
// "NaN cr"; negatives clamp to 0 so a bookkeeping bug can't show phantom debt.
// Keep the two formatters alive: Number#toLocaleString repeatedly resolves the
// locale and was the hottest JavaScript function in a live debris-field CPU
// profile because changing target distances redraw several times per second.
const integerFormatters = Object.freeze({
    de: new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }),
    en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
});
const integerFormatter = () => integerFormatters[getLanguage() === 'de' ? 'de' : 'en'];
export const formatNumber = (value) => {
    if (!Number.isFinite(value))
        return '0';
    return integerFormatter().format(Math.round(value));
};
export const formatCredits = (value) => `${Number.isFinite(value) ? integerFormatter().format(Math.max(0, Math.floor(value))) : '0'} cr`;
export const formatDuration = (seconds) => {
    const clamped = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(clamped / 60);
    const remainder = clamped % 60;
    return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};
