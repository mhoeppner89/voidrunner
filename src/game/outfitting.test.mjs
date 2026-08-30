import assert from 'node:assert/strict';
import {
    HULL_HARDPOINTS,
    LEGACY_OUTFIT_ID_MAP,
    OUTFIT_ITEM_IDS,
    OUTFIT_ITEMS,
    RESALE_RATE,
    collapseOutfittingToSingleShip,
    commitOutfitting,
    createOutfittingState,
    defaultLoadoutFor,
    installedCounts,
    itemAvailable,
    itemFitsMount,
    migrateLegacyOutfitting,
    normalizeOutfitting,
    projectLegacyEquipment,
    projectLegacyWeaponId,
    quoteOutfitting,
    validateLoadout,
} from './outfitting.js';
import { hydrateSave, SAVE_VERSION } from './save.js';

const all = (value, predicate, message) => assert.ok(value.every(predicate), message);
const clone = (value) => JSON.parse(JSON.stringify(value));
const capablePlayer = (overrides = {}) => ({
    shipId: 'wayfarer',
    ownedShips: ['wayfarer', 'talon', 'vanguard', 'prospector', 'lancer', 'atlas'],
    credits: 100000,
    dockedAt: 'helix',
    guildRank: { bounty: 5, merchant: 5, mining: 5, salvage: 5 },
    equipment: [],
    outfitting: createOutfittingState(['wayfarer', 'talon', 'vanguard', 'prospector', 'lancer', 'atlas']),
    ...overrides,
});

assert.equal(OUTFIT_ITEM_IDS.length, 18, 'registry has exactly 18 modules');
assert.equal(new Set(OUTFIT_ITEM_IDS).size, 18, 'registry ids are unique');
assert.deepEqual(OUTFIT_ITEM_IDS, [
    'pulse-cannon', 'pulse-mk2', 'gauss-cannon', 'pdc', 'ripper', 'ion-blaster', 'mortar',
    'seeker-launcher', 'swarm-launcher', 'torpedo-launcher',
    'engine-mk2', 'thrusters-mk2', 'shield-mk2', 'armor-mk2',
    'radar-mk2', 'cargo-pods', 'mining-mk2', 'salvage-mk2',
]);
all(OUTFIT_ITEM_IDS, (id) => {
    const item = OUTFIT_ITEMS[id];
    return ['gun', 'launcher', 'drive', 'defense', 'utility'].includes(item.category)
        && ['S', 'M'].includes(item.size)
        && item.sizes.length > 0
        && Number.isFinite(item.price) && item.price >= 0
        && Number.isFinite(item.mass) && item.mass > 0
        && (item.category !== 'gun' || (Number.isFinite(item.energyCost) && item.energyCost > 0))
        && item.power === undefined
        && item.effects && item.availability.length > 0
        && typeof item.description === 'string' && item.description.length > 0
        && typeof item.stat === 'string' && item.stat.length > 0
        && item.art.endsWith('.webp') && item.artPath === item.art;
}, 'every item has fitting, balance, effects, availability, copy, and WebP art metadata');
assert.equal(Object.keys(LEGACY_OUTFIT_ID_MAP).length, 4);

const expectedCounts = {
    wayfarer: { gun: 3, launcher: 1, drive: 1, defense: 1, utility: 2 },
    talon: { gun: 3, launcher: 1, drive: 1, defense: 1, utility: 1 },
    vanguard: { gun: 4, launcher: 1, drive: 1, defense: 1, utility: 2 },
    prospector: { gun: 2, launcher: 1, drive: 1, defense: 1, utility: 3 },
    lancer: { gun: 3, launcher: 2, drive: 1, defense: 1, utility: 1 },
    atlas: { gun: 2, launcher: 1, drive: 1, defense: 1, utility: 4 },
};
for (const [shipId, counts] of Object.entries(expectedCounts)) {
    assert.deepEqual(HULL_HARDPOINTS[shipId].slotCounts, counts, `${shipId} hardpoint matrix`);
    assert.equal(HULL_HARDPOINTS[shipId].guns.filter((slot) => slot.size === 'S').length + HULL_HARDPOINTS[shipId].guns.filter((slot) => slot.size === 'M').length, counts.gun);
    assert.equal(HULL_HARDPOINTS[shipId].drive.length, 1);
    assert.equal(HULL_HARDPOINTS[shipId].defense.length, 1);
    assert.equal(HULL_HARDPOINTS[shipId].utility.length, counts.utility);
    const factory = defaultLoadoutFor(shipId);
    const installedGroups = HULL_HARDPOINTS[shipId].guns
        .map((mount, index) => factory.guns[index] ? factory.fireGroups.assignments[mount.id] : undefined)
        .filter(Boolean);
    if (installedGroups.length > 1)
        assert.deepEqual(new Set(installedGroups), new Set(['A', 'B']), `${shipId} factory guns start in usable A/B groups`);
}

// Fire-group edits are ordinary zero-cost fitting transactions: they persist
// atomically without moving modules or charging the player.
const regroupedPlayer = capablePlayer({ ownedShips: ['wayfarer'], dockedAt: 'helix' });
const regroupedDraft = clone(regroupedPlayer.outfitting.loadouts.wayfarer);
const regroupedMount = HULL_HARDPOINTS.wayfarer.guns[0];
const regroupedBeforeCredits = regroupedPlayer.credits;
regroupedDraft.fireGroups.assignments[regroupedMount.id] = 'B';
const regroupedQuote = quoteOutfitting(regroupedPlayer, 'wayfarer', regroupedDraft);
assert.equal(regroupedQuote.ok, true, 'valid fire-group edit receives a fitting quote');
assert.equal(regroupedQuote.netCost, 0, 'fire-group edit is free');
assert.equal(commitOutfitting(regroupedPlayer, regroupedQuote).ok, true, 'fire-group edit commits');
assert.equal(regroupedPlayer.outfitting.loadouts.wayfarer.fireGroups.assignments[regroupedMount.id], 'B');
assert.equal(regroupedPlayer.credits, regroupedBeforeCredits, 'fire-group edit does not change credits');

// An S module may be fitted to M, but a medium module never fits an S bay.
const mediumGun = HULL_HARDPOINTS.wayfarer.guns[2];
const smallGun = HULL_HARDPOINTS.wayfarer.guns[0];
const mediumLauncher = HULL_HARDPOINTS.vanguard.launchers[0];
const smallLauncher = HULL_HARDPOINTS.wayfarer.launchers[0];
assert.equal(mediumGun.size, 'M');
assert.equal(smallGun.size, 'S');
assert.equal(itemFitsMount('pdc', mediumGun), true);
assert.equal(itemFitsMount('pdc', smallGun), true);
assert.equal(itemFitsMount('ripper', mediumGun), true);
assert.equal(itemFitsMount('pulse-mk2', smallGun), false);
assert.equal(itemFitsMount('seeker-launcher', mediumLauncher), true);
assert.equal(itemFitsMount('torpedo-launcher', smallLauncher), false);
assert.equal(itemFitsMount('pulse-mk2', { category: 'launcher', size: 'M' }), false);

const player = capablePlayer({ ownedShips: ['wayfarer'], dockedAt: 'rook' });
for (const port of ['helix', 'rook', 'vesper', 'azure'])
    assert.ok(OUTFIT_ITEM_IDS.some((id) => !itemAvailable(player, id, port)), `${port} has a specialized stock gap`);
const stockedAtVesper = capablePlayer({
    shipId: 'wayfarer', ownedShips: ['wayfarer'], dockedAt: 'vesper',
    outfitting: { ...createOutfittingState(['wayfarer']), locker: { pdc: 1 } },
});
const vesperDraft = clone(stockedAtVesper.outfitting.loadouts.wayfarer);
vesperDraft.guns[0] = 'pdc';
assert.equal(validateLoadout(stockedAtVesper, 'wayfarer', vesperDraft).ok, true, 'owned unavailable stock still fits');
const vesperQuote = quoteOutfitting(stockedAtVesper, 'wayfarer', vesperDraft);
assert.equal(vesperQuote.ok, true);
assert.deepEqual(vesperQuote.purchases, {}, 'local stock restriction only blocks purchases');
const noOutfittingService = capablePlayer({ shipId: 'wayfarer', ownedShips: ['wayfarer'], dockedAt: 'cairn' });
assert.equal(quoteOutfitting(noOutfittingService, 'wayfarer', noOutfittingService.outfitting.loadouts.wayfarer).code, 'service-unavailable');
assert.equal(quoteOutfitting(player, 'wayfarer', player.outfitting.loadouts.wayfarer, { locationId: 'helix' }).code, 'location-mismatch', 'a location override cannot shop at another dock');

const empty = { guns: [null, null, null], launchers: [null], drive: [null], defense: [null], utility: [null, null] };
const duplicateDraft = {
    guns: ['pdc', 'pdc'],
    launchers: [null],
    drive: [null],
    defense: [null],
    utility: ['cargo-pods', 'cargo-pods', null, null],
};
const atlasPlayer = capablePlayer({ shipId: 'atlas', ownedShips: ['atlas'], outfitting: createOutfittingState(['atlas']) });
assert.equal(validateLoadout(atlasPlayer, 'atlas', duplicateDraft).ok, true, 'duplicate guns and cargo pods are legal');
const uniqueDraft = { guns: [null, null], launchers: [null], drive: [null], defense: [null], utility: ['radar-mk2', 'radar-mk2', null, null] };
assert.equal(validateLoadout(atlasPlayer, 'atlas', uniqueDraft).code, 'duplicate-unique-module');

const energyHungry = {
    ...empty,
    guns: ['pdc', 'pdc', 'mortar'],
    launchers: ['seeker-launcher'],
    drive: ['engine-mk2'],
    defense: ['shield-mk2'],
    utility: ['mining-mk2', 'radar-mk2'],
};
assert.equal(validateLoadout(player, 'wayfarer', energyHungry).ok, true, 'high-drain weapons are legal fits and constrained by the flight capacitor');
const tooMass = {
    ...empty,
    guns: ['pdc', 'pdc', 'mortar'],
    launchers: ['seeker-launcher'],
    drive: ['engine-mk2'],
    defense: ['armor-mk2'],
    utility: ['cargo-pods', 'radar-mk2'],
};
assert.ok(validateLoadout(player, 'wayfarer', tooMass).errors.some((error) => error.code === 'mass-over-budget'));
const cargoInvalid = validateLoadout(player, { shipId: 'wayfarer' }, empty);
assert.equal(cargoInvalid.code, 'unknown-ship');
assert.equal(validateLoadout(player, 'wayfarer', empty, { cargoMass: 33 }).code, 'cargo-over-capacity');
assert.equal(validateLoadout(player, 'wayfarer', { ...empty, utility: ['cargo-pods', null] }, { cargoMass: 49 }).ok, true);
assert.equal(validateLoadout(player, 'wayfarer', { ...empty, utility: ['cargo-pods', null] }, { cargoMass: 51 }).code, 'cargo-over-capacity');

// Quotes are pure: they do not spend credits or mutate the player, and the
// same input produces the same deterministic transaction object.
const before = clone(player);
const fit = {
    ...empty,
    guns: ['pdc', 'pdc', 'gauss-cannon'],
    launchers: ['seeker-launcher'],
};
const quoteA = quoteOutfitting(player, 'wayfarer', fit);
const quoteB = quoteOutfitting(player, 'wayfarer', fit);
assert.equal(quoteA.ok, true);
assert.deepEqual(quoteA, quoteB, 'quote is deterministic');
assert.deepEqual(player, before, 'quote does not mutate player state');
assert.deepEqual(quoteA.purchases, { pdc: 2 }, 'two unowned duplicate guns are staged as two purchases');
assert.equal(quoteA.netCost, OUTFIT_ITEMS.pdc.price * 2);
assert.equal(quoteA.creditsAfter, player.credits - quoteA.netCost);
const committed = commitOutfitting(player, quoteA);
assert.equal(committed.ok, true);
assert.equal(player.credits, before.credits - quoteA.netCost);
assert.deepEqual(installedCounts(player, 'wayfarer').pdc, 2);
assert.equal(player.outfitting.locker.pdc, undefined, 'installed copies are not left in locker');
assert.ok(player.equipment.includes('pdc'), 'canonical compatibility projection includes installed item');
assert.ok(player.equipment.includes('gauss-cannon'), 'projection includes factory gauss copy');

// A paid module can be uninstalled and sold in one Apply. Factory-bound
// starter gear may move to the locker, but it never becomes a credit source.
const removeAndSell = quoteOutfitting(player, 'wayfarer', createOutfittingState(['wayfarer']).loadouts.wayfarer, { sales: { pdc: 2 } });
assert.equal(removeAndSell.ok, true, 'remove + sell is one valid staged transaction');
assert.equal(removeAndSell.sellable.pdc, 2);
assert.equal(removeAndSell.resale, Math.round(OUTFIT_ITEMS.pdc.price * 2 * RESALE_RATE));
assert.equal(quoteOutfitting(player, 'wayfarer', fit, { sales: { 'pulse-cannon': 1 } }).code, 'not-enough-stock-to-sell', 'factory pulse cannot be sold after removal');

// Removing an installed module returns it to the locker; selling that locker
// copy yields exactly 70% of its price and remains atomic.
const remove = quoteOutfitting(player, 'wayfarer', createOutfittingState(['wayfarer']).loadouts.wayfarer);
assert.equal(remove.ok, true);
assert.equal(remove.lockerAfter.pdc, 2);
assert.equal(remove.resale, 0);
const removed = commitOutfitting(player, remove);
assert.equal(removed.ok, true);
assert.equal(quoteOutfitting(player, 'wayfarer', player.outfitting.loadouts.wayfarer, { sales: { 'gauss-cannon': 1 } }).code, 'not-enough-stock-to-sell', 'installed modules cannot be sold without uninstalling');
const sale = quoteOutfitting(player, 'wayfarer', player.outfitting.loadouts.wayfarer, { sales: { pdc: 2 } });
assert.equal(sale.ok, true);
assert.equal(sale.resale, Math.round(OUTFIT_ITEMS.pdc.price * 2 * RESALE_RATE));
assert.equal(sale.netCost, -sale.resale);
assert.equal(commitOutfitting(player, sale).ok, true);
assert.equal(player.outfitting.locker.pdc, undefined);

const poor = capablePlayer({ credits: 1, dockedAt: 'rook', ownedShips: ['wayfarer'], outfitting: createOutfittingState(['wayfarer']) });
assert.equal(quoteOutfitting(poor, 'wayfarer', fit).code, 'insufficient-credits');
const stalePlayer = capablePlayer({ dockedAt: 'rook', ownedShips: ['wayfarer'] });
const staleQuote = quoteOutfitting(stalePlayer, 'wayfarer', fit);
stalePlayer.credits -= 1;
assert.equal(commitOutfitting(stalePlayer, staleQuote).code, 'stale-quote');

// A schema-6 career keeps every known legacy module either fitted on the
// current hull or counted in the locker, seeds factory modules on every owned
// hull, and retains standard gauss access.
const legacyPlayer = {
    shipId: 'wayfarer',
    ownedShips: ['wayfarer', 'talon'],
    equipment: ['shield-mk2', 'pulse-mk2', 'cargo-pods', 'engine-mk2', 'pdc-cluster', 'pdc-cluster'],
    weaponId: 'gauss',
};
const migrated = migrateLegacyOutfitting(legacyPlayer);
assert.equal(migrated.loadouts.wayfarer.guns.includes('gauss-cannon'), true);
assert.equal(migrated.loadouts.talon.guns.includes('gauss-cannon'), true);
assert.equal((migrated.locker.pdc ?? 0) + migrated.loadouts.wayfarer.guns.filter((id) => id === 'pdc').length, 2);
assert.ok(migrated.loadouts.wayfarer.drive.includes('engine-mk2'));
assert.ok(migrated.loadouts.wayfarer.defense.includes('shield-mk2'));
assert.ok(migrated.loadouts.wayfarer.utility.includes('cargo-pods'));
const normalizedMigrated = normalizeOutfitting({ ...legacyPlayer, outfitting: migrated });
assert.deepEqual(normalizedMigrated.loadouts.talon.fireGroups.activeGroup, 'A');
const projection = projectLegacyEquipment({ ...legacyPlayer, outfitting: migrated }, migrated);
assert.ok(projection.includes('pulse-mk2'));
assert.ok(projection.includes('gauss-cannon'));
assert.ok(projection.includes('pdc'));
assert.ok(projection.includes('pdc-cluster'));

const aliasCollision = migrateLegacyOutfitting({
    shipId: 'wayfarer', ownedShips: ['wayfarer'], equipment: ['pdc', 'pdc-cluster'], weaponId: 'pulse',
});
assert.equal(
    (aliasCollision.locker.pdc ?? 0) + aliasCollision.loadouts.wayfarer.guns.filter((id) => id === 'pdc').length,
    1,
    'canonical and historical spellings of one module are not double-counted',
);

const weaponOnlyMigration = migrateLegacyOutfitting({
    shipId: 'wayfarer', ownedShips: ['wayfarer'], equipment: [], weaponId: 'pdc',
});
assert.equal(
    weaponOnlyMigration.loadouts.wayfarer.guns.includes('pdc') || (weaponOnlyMigration.locker.pdc ?? 0) > 0,
    true,
    'legacy active paid weapon is retained even when equipment array omitted it',
);

const hydrated = hydrateSave({
    version: 6,
    player: {
        shipId: 'wayfarer', ownedShips: ['wayfarer', 'talon'], dockedAt: 'helix', position: [0, 0, 0],
        credits: 50000, equipment: ['pdc-cluster', 'engine-mk2'], weaponId: 'gauss',
    },
    world: { seed: 42 },
});
assert.equal(hydrated.version, SAVE_VERSION);
assert.equal(hydrated.player.outfitting.schema, 1);
assert.ok(hydrated.player.outfitting.loadouts.wayfarer.guns.includes('gauss-cannon'));
assert.deepEqual(hydrated.player.ownedShips, ['wayfarer'], 'fleet-era careers retain only their active hull');
assert.equal(hydrated.player.outfitting.loadouts.talon, undefined, 'discarded hull loadout is removed');
assert.equal(hydrated.player.credits, 67000, 'discarded Talon is compensated at half base value');
assert.deepEqual(hydrated.player.equipment, ['pdc-cluster', 'engine-mk2'], 'first legacy load keeps old projection for compatibility');

// Legacy active weapon ids keep Pulse Mk II distinct from the base pulse
// implementation. A mounted Mk II must project back to its old id, including
// when callers explicitly request group A/B rather than the saved active group.
const activeMk2 = migrateLegacyOutfitting({
    shipId: 'wayfarer', ownedShips: ['wayfarer'], equipment: [], weaponId: 'pulse-mk2',
});
assert.equal(activeMk2.locker['pulse-mk2'], 1, 'active-only pulse-mk2 survives migration as owned stock');
const mountedMk2 = capablePlayer({
    outfitting: createOutfittingState(['wayfarer']),
});
mountedMk2.outfitting.loadouts.wayfarer.guns[2] = 'pulse-mk2';
mountedMk2.outfitting.loadouts.wayfarer.fireGroups.activeGroup = 'B';
mountedMk2.outfitting.loadouts.wayfarer.fireGroups.assignments['wayfarer-gun-2'] = 'B';
assert.equal(projectLegacyWeaponId(mountedMk2, 'wayfarer'), 'pulse-mk2');
assert.equal(projectLegacyWeaponId(mountedMk2, 'wayfarer', 'B'), 'pulse-mk2');

// A full legacy gun rack cannot evict factory baseline ownership. Unmounted
// copies are mirrored in the ordinary locker and the factory-only ledger, so
// they remain usable but can never be sold for credits; paid gear stays counted.
const fullLegacy = migrateLegacyOutfitting({
    shipId: 'wayfarer', ownedShips: ['wayfarer'],
    equipment: ['pdc-cluster', 'pdc-cluster', 'pulse-mk2', 'seeker-launcher'],
    weaponId: 'pulse-mk2',
});
assert.ok(fullLegacy.loadouts.wayfarer.guns.includes('gauss-cannon'), 'current hull keeps its expected gauss baseline');
assert.equal(fullLegacy.locker['pulse-cannon'], 1, 'unmounted factory pulse remains usable');
assert.equal(fullLegacy.factoryLocker['pulse-cannon'], 1, 'unmounted factory pulse remains bound');
assert.equal(fullLegacy.locker['pulse-mk2'], 1, 'displaced paid pulse-mk2 remains counted');
assert.equal(fullLegacy.factoryLocker['gauss-cannon'] ?? 0, 0, 'forced current-hull gauss is mounted, not duplicated');

// Unknown sidecar ids are intentionally opaque to fitting, but remain visible
// to the old flat-equipment boundary after normalization/projection.
const unknownSidecar = createOutfittingState(['wayfarer']);
unknownSidecar.legacyEquipment = ['future-module-x'];
const sidecarPlayer = capablePlayer({ outfitting: unknownSidecar });
assert.ok(projectLegacyEquipment(sidecarPlayer, unknownSidecar).includes('future-module-x'));
const migratedUnknown = migrateLegacyOutfitting({
    shipId: 'wayfarer', ownedShips: ['wayfarer'], equipment: ['future-module-x'],
});
assert.ok(projectLegacyEquipment({ ...sidecarPlayer, outfitting: migratedUnknown }, migratedUnknown).includes('future-module-x'));

// Only a schema-1 canonical object with object-shaped lockers/loadouts is
// trusted. Malformed canonical data falls back to the legacy equipment path.
for (const malformed of [
    { schema: 1, locker: [], loadouts: {} },
    { schema: 1, locker: {}, loadouts: [] },
    { schema: 1, locker: {}, loadouts: { wayfarer: [] } },
    { schema: 2, locker: {}, loadouts: {} },
]) {
    const malformedPlayer = capablePlayer({ equipment: ['pdc-cluster'], outfitting: malformed });
    const normalized = normalizeOutfitting(malformedPlayer);
    assert.ok(normalized.loadouts.wayfarer.guns.includes('pdc'), `malformed canonical data migrates (${JSON.stringify(malformed)})`);
}

// Quotes carry a normalized request and a full stale-context snapshot. Commit
// always re-prices/re-validates that request, never mutable derived fields.
const contextDraft = clone(createOutfittingState(['wayfarer']).loadouts.wayfarer);
contextDraft.guns[0] = 'pdc';
const contextPlayer = () => capablePlayer({
    dockedAt: 'rook', cargo: { ore: 2 }, sealedCargo: ['sealed'], cargoMass: 2,
    guildRep: { bounty: 2, merchant: 2, mining: 2, salvage: 2 }, legacyEquipment: [],
});
const contextQuote = quoteOutfitting(contextPlayer(), 'wayfarer', contextDraft, { locationId: 'rook', cargoMass: 2 });
assert.equal(contextQuote.ok, true);
assert.deepEqual(contextQuote.request.loadout, contextQuote.loadout, 'quote stores normalized request');
assert.equal(contextQuote.context.locationId, 'rook');
assert.equal(contextQuote.context.cargoMass, 2);
const tamperedDerivedPlayer = contextPlayer();
const tamperedDerived = quoteOutfitting(tamperedDerivedPlayer, 'wayfarer', contextDraft, { locationId: 'rook', cargoMass: 2 });
tamperedDerived.netCost = -999999;
tamperedDerived.afterState.loadouts.wayfarer.guns[0] = null;
assert.equal(commitOutfitting(tamperedDerivedPlayer, tamperedDerived).ok, true, 'commit ignores mutable derived quote fields');
assert.equal(tamperedDerivedPlayer.credits, 100000 - OUTFIT_ITEMS.pdc.price);
assert.equal(tamperedDerivedPlayer.outfitting.loadouts.wayfarer.guns[0], 'pdc');

const assertContextStale = (mutate, label) => {
    const stale = contextPlayer();
    const quote = quoteOutfitting(stale, 'wayfarer', contextDraft, { locationId: 'rook', cargoMass: 2 });
    mutate(stale);
    assert.equal(commitOutfitting(stale, quote).code, 'stale-quote', label);
};
assertContextStale((p) => { p.credits -= 1; }, 'credits are stale');
assertContextStale((p) => { p.outfitting.locker.pdc = 1; }, 'outfitting is stale');
assertContextStale((p) => { p.shipId = 'talon'; }, 'current ship is stale');
assertContextStale((p) => { p.ownedShips = ['wayfarer', 'talon']; }, 'owned ships are stale');
assertContextStale((p) => { p.guildRank.bounty += 1; }, 'guild rank is stale');
assertContextStale((p) => { p.guildRep.bounty += 1; }, 'guild rep is stale');
assertContextStale((p) => { p.cargo.ore += 1; }, 'raw cargo is stale');
assertContextStale((p) => { p.sealedCargo.push('another'); }, 'sealed cargo is stale');
assertContextStale((p) => { p.cargoMass += 1; }, 'cargo mass is stale');
assertContextStale((p) => { p.equipment.push('future-module-x'); }, 'legacy equipment is stale');
const movedDock = contextPlayer();
const movedDockQuote = quoteOutfitting(movedDock, 'wayfarer', contextDraft, { locationId: 'rook', cargoMass: 2 });
movedDock.dockedAt = 'helix';
assert.equal(commitOutfitting(movedDock, movedDockQuote).code, 'stale-quote');
const undocked = contextPlayer();
const undockedQuote = quoteOutfitting(undocked, 'wayfarer', contextDraft, { locationId: 'rook', cargoMass: 2 });
delete undocked.dockedAt;
assert.equal(commitOutfitting(undocked, undockedQuote).code, 'not-docked');

// Corrupted schema-6 equipment values are normalized at hydration instead of
// reaching array-only compatibility code. An active weapon stored separately
// still migrates into canonical stock.
const malformedEquipmentSave = hydrateSave({
    version: 6,
    player: {
        shipId: 'wayfarer', ownedShips: ['wayfarer'], dockedAt: 'rook', position: [0, 0, 0],
        equipment: { broken: true }, weaponId: 'pulse-mk2',
    },
    world: { seed: 77 },
});
assert.ok(Array.isArray(malformedEquipmentSave.player.equipment));
assert.equal(
    malformedEquipmentSave.player.outfitting.loadouts.wayfarer.guns.includes('pulse-mk2')
        || (malformedEquipmentSave.player.outfitting.locker['pulse-mk2'] ?? 0) > 0,
    true,
    'malformed flat equipment cannot erase an independently saved active weapon',
);

// A complete factory ledger is required before saved flags are trusted. An
// empty/malformed ledger must not turn a paid duplicate starter gun into
// unsellable factory stock.
const duplicatePulseState = createOutfittingState(['wayfarer']);
duplicatePulseState.loadouts.wayfarer.guns = ['pulse-cannon', 'pulse-cannon', 'gauss-cannon'];
duplicatePulseState.factory.wayfarer = {};
const duplicatePulsePlayer = capablePlayer({
    ownedShips: ['wayfarer'],
    dockedAt: 'rook',
    outfitting: duplicatePulseState,
});
normalizeOutfitting(duplicatePulsePlayer);
const sellPaidPulseDraft = clone(duplicatePulsePlayer.outfitting.loadouts.wayfarer);
sellPaidPulseDraft.guns[1] = null;
const sellPaidPulse = quoteOutfitting(duplicatePulsePlayer, 'wayfarer', sellPaidPulseDraft, { sales: { 'pulse-cannon': 1 } });
assert.equal(sellPaidPulse.ok, true, 'a second legacy pulse copy remains paid and sellable');
assert.equal(sellPaidPulse.sellable['pulse-cannon'], 1);

const shortFactoryLedgerState = createOutfittingState(['wayfarer']);
shortFactoryLedgerState.loadouts.wayfarer.guns = ['pulse-cannon', 'pulse-cannon', 'gauss-cannon'];
shortFactoryLedgerState.factory.wayfarer.guns = [true];
const shortFactoryLedgerPlayer = capablePlayer({
    ownedShips: ['wayfarer'], dockedAt: 'rook', outfitting: shortFactoryLedgerState,
});
normalizeOutfitting(shortFactoryLedgerPlayer);
const shortLedgerDraft = clone(shortFactoryLedgerPlayer.outfitting.loadouts.wayfarer);
shortLedgerDraft.guns[1] = null;
assert.equal(
    quoteOutfitting(shortFactoryLedgerPlayer, 'wayfarer', shortLedgerDraft, { sales: { 'pulse-cannon': 1 } }).ok,
    true,
    'short factory flag arrays are not trusted as a complete ownership ledger',
);

// The old factory locker was shared across a fleet and could not attribute
// copies to hulls. Once the fleet collapses, untraceable excess factory gear
// must not become free stock on the retained ship.
const fleetFactoryState = createOutfittingState(['wayfarer', 'talon']);
fleetFactoryState.locker['pulse-cannon'] = 5;
fleetFactoryState.factoryLocker['pulse-cannon'] = 5;
const collapsedFactory = collapseOutfittingToSingleShip({
    shipId: 'wayfarer',
    ownedShips: ['wayfarer', 'talon'],
    equipment: [],
    outfitting: fleetFactoryState,
}, 'wayfarer');
assert.equal(collapsedFactory.factoryLocker['pulse-cannon'] ?? 0, 0, 'active factory pulse already consumes the sole entitlement');
assert.equal(collapsedFactory.locker['pulse-cannon'] ?? 0, 0, 'unattributed fleet factory copies are discarded');

const staleHullState = createOutfittingState(['wayfarer', 'talon']);
staleHullState.loadouts.talon.guns[0] = 'ripper';
staleHullState.factory.talon.guns[0] = false;
const staleHullCollapse = collapseOutfittingToSingleShip({
    shipId: 'wayfarer', ownedShips: ['wayfarer'], equipment: [], outfitting: staleHullState,
}, 'wayfarer');
assert.equal(staleHullCollapse.locker.ripper, undefined, 'an unowned stale hull cannot grant paid modules during fleet collapse');

// Shape-valid canonical data may still contain a damaged empty fit. Preserve
// a known module from the legacy compatibility projection as paid locker stock.
const damagedCanonicalPlayer = capablePlayer({
    ownedShips: ['wayfarer'],
    equipment: ['pdc-cluster'],
    outfitting: {
        schema: 1,
        locker: {},
        factoryLocker: {},
        loadouts: { wayfarer: { guns: [null, null, null], launchers: [null], drive: [null], defense: [null], utility: [null, null] } },
        factory: { wayfarer: { guns: [false, false, false], launchers: [false], drive: [false], defense: [false], utility: [false, false] } },
    },
});
normalizeOutfitting(damagedCanonicalPlayer);
assert.equal(damagedCanonicalPlayer.outfitting.locker.pdc, 1, 'legacy projection repairs semantically damaged canonical equipment');
const activeWeaponDamagedCanonical = capablePlayer({
    ownedShips: ['wayfarer'],
    equipment: [],
    weaponId: 'pdc',
    outfitting: clone(damagedCanonicalPlayer.outfitting),
});
delete activeWeaponDamagedCanonical.outfitting.locker.pdc;
normalizeOutfitting(activeWeaponDamagedCanonical);
assert.equal(activeWeaponDamagedCanonical.outfitting.locker.pdc, 1, 'active paid weapon repairs an otherwise empty canonical projection');

const directActiveSale = capablePlayer({
    shipId: 'wayfarer', ownedShips: ['wayfarer'], dockedAt: 'rook', weaponId: 'pdc',
    outfitting: createOutfittingState(['wayfarer']),
});
directActiveSale.outfitting.loadouts.wayfarer.guns[1] = 'pdc';
directActiveSale.outfitting.factory.wayfarer.guns[1] = false;
directActiveSale.outfitting.loadouts.wayfarer.fireGroups.activeGroup = 'B';
directActiveSale.equipment = projectLegacyEquipment(directActiveSale, directActiveSale.outfitting);
const directActiveSaleDraft = clone(directActiveSale.outfitting.loadouts.wayfarer);
directActiveSaleDraft.guns[1] = null;
const directActiveSaleQuote = quoteOutfitting(directActiveSale, 'wayfarer', directActiveSaleDraft, { sales: { pdc: 1 } });
assert.equal(commitOutfitting(directActiveSale, directActiveSaleQuote).ok, true);
assert.notEqual(directActiveSale.weaponId, 'pdc', 'direct commit refreshes the active weapon projection');
normalizeOutfitting(directActiveSale);
assert.equal(directActiveSale.outfitting.locker.pdc, undefined, 'a sold active weapon cannot be resurrected by normalization');

for (const badCredits of ['bad', NaN, -1]) {
    const corrupt = capablePlayer({ credits: badCredits, ownedShips: ['wayfarer'], dockedAt: 'rook', outfitting: createOutfittingState(['wayfarer']) });
    assert.equal(quoteOutfitting(corrupt, 'wayfarer', corrupt.outfitting.loadouts.wayfarer).code, 'invalid-credits');
}

// Current-schema saves are also normalized defensively: a malformed v9 fleet
// is bought back once, while legacy null durability and nonnumeric versions
// follow the conservative migration path.
const malformedV9Fleet = hydrateSave({
    version: SAVE_VERSION,
    player: {
        shipId: 'wayfarer', ownedShips: ['wayfarer', 'talon'], dockedAt: 'helix', position: [0, 0, 0],
        hull: 185, shield: 90, energy: 72, credits: 50000, outfitting: createOutfittingState(['wayfarer', 'talon']),
    },
    world: { seed: 90 },
});
assert.deepEqual(malformedV9Fleet.player.ownedShips, ['wayfarer']);
assert.equal(malformedV9Fleet.player.credits, 67000, 'malformed v9 fleet receives the same half-value buyback');

const nullDurability = hydrateSave({
    version: 8,
    player: { shipId: 'wayfarer', ownedShips: ['wayfarer'], dockedAt: 'helix', position: [0, 0, 0], hull: null, armor: null },
    world: { seed: 91 },
});
assert.equal(nullDurability.player.hull, 185, 'null legacy durability falls back to the full combined hull');

const badVersion = hydrateSave({
    version: 'bad',
    player: { shipId: 'wayfarer', ownedShips: ['wayfarer', 'talon'], dockedAt: 'helix', position: [0, 0, 0], hull: 100, armor: 85, credits: 50000 },
    world: { seed: 92 },
});
assert.equal(badVersion.player.hull, 185);
assert.equal(badVersion.player.credits, 67000);
assert.deepEqual(badVersion.player.ownedShips, ['wayfarer']);

const freshFromNull = hydrateSave(null);
assert.equal(freshFromNull.version, SAVE_VERSION);
assert.deepEqual(freshFromNull.player.ownedShips, ['wayfarer']);

const malformedResources = hydrateSave({
    version: SAVE_VERSION,
    player: {
        shipId: 'wayfarer', ownedShips: ['wayfarer'], dockedAt: 'helix', position: [0, 0, 0],
        fuel: 'broken', shield: null, hull: 'broken', energy: 'broken', missiles: 'broken',
        outfitting: createOutfittingState(['wayfarer']),
    },
    world: { seed: 93 },
});
for (const key of ['fuel', 'shield', 'hull', 'energy', 'missiles'])
    assert.equal(Number.isFinite(malformedResources.player[key]), true, `${key} is repaired to a finite current resource`);
assert.equal(malformedResources.player.hull, 185);
assert.equal(malformedResources.player.energy, 72);

const malformedTransforms = hydrateSave({
    version: SAVE_VERSION,
    player: {
        shipId: 'wayfarer', ownedShips: ['wayfarer'], dockedAt: 'bogus', lastDockedAt: 'bogus',
        position: [0], velocity: [0], angularVelocity: [0, 0, 0, 0], rotation: null,
        credits: 'Infinity', outfitting: createOutfittingState(['wayfarer']),
    },
    world: { seed: 94 },
});
assert.equal(malformedTransforms.player.position.length, 3);
assert.equal(malformedTransforms.player.velocity.length, 3);
assert.equal(malformedTransforms.player.angularVelocity.length, 3);
assert.deepEqual(malformedTransforms.player.rotation, [0, 0, 0, 1]);
assert.equal(malformedTransforms.player.credits, 0);
assert.equal(malformedTransforms.player.dockedAt, undefined);
assert.equal(malformedTransforms.player.lastDockedAt, 'helix');

const invalidLegacyDock = hydrateSave({
    version: 3,
    player: {
        shipId: 'wayfarer', ownedShips: ['wayfarer'], dockedAt: 'bogus', lastDockedAt: 'bogus',
        position: [5000, 5000, 5000], velocity: [0, 0, 0], angularVelocity: [0, 0, 0], rotation: [0, 0, 0, 1],
    },
    world: { seed: 95 },
});
assert.equal(invalidLegacyDock.player.position.length, 3, 'an invalid pre-v4 dock falls back safely during position migration');

console.log('all outfitting assertions passed');
