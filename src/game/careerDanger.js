// Career geography controls frequency and fleet strength, never a hull's equipment.
const SYSTEM_DANGER = Object.freeze({
    'helios-verge': .18, meridian: .26, acheron: .48, 'pale-ring': .65, redwake: .88,
});
const LOCATION_DANGER = Object.freeze({
    helix: .08, rook: .05, azure: .12, vesper: .18, shardbelt: .32,
    'mourning-line': .42, cairn: .35,
    'meridian-prime': .08, argent: .16, 'gatehouse-twelve': .10, 'foundry-lanes': .38,
    haven: .24, 'league-yard': .28, cinderfall: .40, 'acheron-belt': .60,
    nacre: .36, boreal: .58, shepherd: .46, 'pale-rings': .76,
    blackglass: .92, cinder: .72, torchwell: .80, 'redwake-belt': .98,
});
export const dangerLabel = danger => danger < .25 ? 'LOW' : danger < .5 ? 'MODERATE' : danger < .75 ? 'HIGH' : 'EXTREME';
const profile = danger => Object.freeze({
    danger, label: dangerLabel(danger),
    piratePressure: .06 + 1.25 * danger ** 1.4,
    encounterMin: 60 - 42 * danger, encounterMax: 88 - 50 * danger,
    jumpChance: .02 + .76 * danger,
    demonChance: .03 + .65 * danger,
});
export const SYSTEM_SECURITY = Object.freeze(Object.fromEntries(Object.entries(SYSTEM_DANGER).map(([id, danger]) => [id, profile(danger)])));
export const LOCATION_SECURITY = Object.freeze(Object.fromEntries(Object.entries(LOCATION_DANGER).map(([id, danger]) => [id, profile(danger)])));
export const careerRegion = (systemId, locationId) => LOCATION_SECURITY[locationId] ?? SYSTEM_SECURITY[systemId] ?? SYSTEM_SECURITY['helios-verge'];
export const encounterDelay = (region, rng) => region.encounterMin + rng() * (region.encounterMax - region.encounterMin);
export function careerGroupSize(region, rng) {
    if (region.danger < .3) return 1;
    const roll = rng();
    if (region.danger < .65) return roll < region.danger * .65 ? 2 : 1;
    return roll < .25 ? 1 : roll < .70 ? 2 : 3;
}
export function careerPilotTier(region, rng) {
    const roll = rng(), danger = region.danger;
    const novice = .86 - .76 * danger, ace = .01 + .34 * danger ** 2;
    return roll < novice ? 'novice' : roll < 1 - ace ? 'veteran' : 'ace';
}
export function careerCombatHull(faction, role, region, rng) {
    const roll = rng(), danger = region.danger;
    if (faction === 'pirates') return roll < region.demonChance ? 'demon' : 'scrapper';
    if (role === 'bounty' || faction === 'independents' && role === 'patrol')
        return roll < .65 - .4 * danger ? 'demon' : roll < .9 - .25 * danger ? 'legionary' : 'lancer';
    if (role !== 'patrol') return undefined;
    if (faction === 'concord') return roll < .8 - .5 * danger ? 'talon' : roll < .98 - .18 * danger ? 'blade' : 'vanguard';
    if (faction === 'alliance') return roll < .7 - .6 * danger ? 'speedster' : roll < .9 - .25 * danger ? 'legionary' : roll < .99 - .2 * danger ? 'lancer' : 'andromeda';
    return undefined;
}
export function portPoliceStrength(location) {
    if (location.faction === 'pirates') return 0;
    const region = careerRegion(location.systemId, location.id);
    return location.faction === 'concord' ? 1 : location.faction === 'alliance' ? .95 : .85 - .55 * region.danger;
}
// A route's most exposed system sets transit risk; arrival jurisdiction can
// reduce it. Existing route multipliers still distinguish the Redwake corridor.
export function routePiratePressure(route, arrivalSystemId) {
    if (arrivalSystemId) return careerRegion(arrivalSystemId).piratePressure;
    return Math.max(...route.systemIds.map(id => careerRegion(id).piratePressure));
}
