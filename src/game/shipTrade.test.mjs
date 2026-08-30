import assert from 'node:assert/strict';
import { SHIPS } from './data.js';
import { createOutfittingState } from './outfitting.js';
import { HULL_TRADE_IN_RATE, commitShipTrade, quoteShipTrade } from './shipTrade.js';

const makePlayer = (shipId = 'wayfarer') => ({
    shipId,
    ownedShips: [shipId],
    credits: 100000,
    dockedAt: 'helix',
    cargo: {},
    sealedCargo: [],
    equipment: [],
    outfitting: createOutfittingState([shipId]),
});

const buyer = makePlayer('vanguard');
buyer.outfitting.locker.pdc = 1;
buyer.outfitting.loadouts.vanguard.guns[0] = 'ripper';
buyer.outfitting.factory.vanguard.guns[0] = false;
const quoted = quoteShipTrade(buyer, 'atlas', { cargoMass: 20 });
assert.equal(quoted.ok, true);
assert.equal(quoted.tradeIn, Math.round(SHIPS.vanguard.price * HULL_TRADE_IN_RATE));
assert.equal(quoted.amountDue, SHIPS.atlas.price - quoted.tradeIn);
assert.equal(quoted.outfitting.locker.pdc, 1, 'paid locker stock survives');
assert.equal(quoted.outfitting.locker.ripper, 1, 'paid installed module moves to locker');
assert.equal(quoted.outfitting.loadouts.atlas.guns.includes('pulse-cannon'), true, 'new hull receives factory fit');
assert.equal(quoted.outfitting.loadouts.vanguard, undefined, 'old loadout leaves with hull');
const before = JSON.parse(JSON.stringify(buyer));
assert.equal(commitShipTrade(buyer, quoted, { cargoMass: 20 }).ok, true);
assert.equal(buyer.shipId, 'atlas');
assert.deepEqual(buyer.ownedShips, ['atlas']);
assert.equal(buyer.credits, before.credits - quoted.amountDue);
assert.equal(buyer.shipStates, undefined);

const downgrade = makePlayer('atlas');
const downgradeQuote = quoteShipTrade(downgrade, 'talon', { cargoMass: 0 });
assert.equal(downgradeQuote.ok, true);
assert.ok(downgradeQuote.amountDue < 0, 'cheaper hull produces a yard credit');
assert.equal(downgradeQuote.creditsAfter, downgrade.credits - downgradeQuote.amountDue);

const poor = makePlayer('wayfarer');
poor.credits = 1;
assert.equal(quoteShipTrade(poor, 'atlas', { cargoMass: 0 }).code, 'insufficient-credits');
assert.deepEqual(poor.ownedShips, ['wayfarer'], 'failed quote is pure');

const overloaded = makePlayer('atlas');
const overloadBefore = JSON.parse(JSON.stringify(overloaded));
assert.equal(quoteShipTrade(overloaded, 'talon', { cargoMass: 30 }).code, 'cargo-over-capacity');
assert.deepEqual(overloaded, overloadBefore, 'cargo rejection is atomic');

const hiddenCargo = makePlayer('atlas');
hiddenCargo.cargoMass = 30;
assert.equal(quoteShipTrade(hiddenCargo, 'talon').code, 'cargo-over-capacity', 'omitting options cannot bypass real cargo mass');

const undocked = makePlayer('wayfarer');
delete undocked.dockedAt;
assert.equal(quoteShipTrade(undocked, 'talon').code, 'not-docked');

const noYard = makePlayer('wayfarer');
noYard.dockedAt = 'cairn';
assert.equal(quoteShipTrade(noYard, 'talon').code, 'service-unavailable');

for (const badCredits of ['bad', NaN, -1]) {
    const corrupt = makePlayer('atlas');
    corrupt.credits = badCredits;
    assert.equal(quoteShipTrade(corrupt, 'talon').code, 'invalid-credits', `invalid credit balance ${String(badCredits)} cannot mint a downgrade refund`);
}

const stale = makePlayer('wayfarer');
const staleQuote = quoteShipTrade(stale, 'talon', { cargoMass: 0 });
stale.credits -= 1;
assert.equal(commitShipTrade(stale, staleQuote, { cargoMass: 0 }).code, 'stale-quote');

const unavailable = makePlayer('wayfarer');
assert.equal(quoteShipTrade(unavailable, 'vanguard').code, 'not-for-sale', 'direct calls obey local shipyard stock');

const mutableTarget = makePlayer('wayfarer');
const mutableTargetQuote = quoteShipTrade(mutableTarget, 'atlas');
mutableTargetQuote.targetShipId = 'talon';
assert.equal(commitShipTrade(mutableTarget, mutableTargetQuote).code, 'stale-quote', 'changing the quoted target hull invalidates the quote');
assert.equal(mutableTarget.shipId, 'wayfarer');

const staleLoadoutPlayer = makePlayer('wayfarer');
staleLoadoutPlayer.outfitting = createOutfittingState(['wayfarer', 'talon']);
staleLoadoutPlayer.outfitting.loadouts.talon.guns[0] = 'ripper';
staleLoadoutPlayer.outfitting.factory.talon.guns[0] = false;
const staleLoadoutTrade = quoteShipTrade(staleLoadoutPlayer, 'atlas');
assert.equal(staleLoadoutTrade.ok, true);
assert.equal(staleLoadoutTrade.outfitting.locker.ripper, undefined, 'unowned stale loadouts cannot duplicate paid modules');

console.log('all ship trade assertions passed');
