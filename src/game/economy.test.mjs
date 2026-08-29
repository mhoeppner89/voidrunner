import assert from 'node:assert/strict';
import {
    bestKnownTradeRoute,
    buyCommodity,
    currentProfitableRoutes,
    createInitialMarket,
    knownMarketQuotes,
    quoteCommodityTrade,
    recordMarketVisit,
    sellCommodity,
    TRADE_FAILURE_REASONS,
} from './economy.js';
import { DOCK_LOCATION_IDS, commodityIds } from './data.js';
import { createNewSave, hydrateSave } from './save.js';

const fresh = (seed = 0xdecafbad) => createNewSave(seed);
const setPrice = (world, locationId, commodityId, price, supply = 50) => {
    const item = world.market[locationId][commodityId];
    item.lastPrice = price;
    item.supply = supply;
    item.demand = 50;
};

// A quote is a read-only preview, and executing the exact quote produces the
// same quantity, price, total, and post-state values.
{
    const save = fresh(11);
    setPrice(save.world, 'helix', 'food', 100, 7);
    save.player.credits = 1000;
    save.player.cargo = {};
    const before = JSON.stringify({ credits: save.player.credits, cargo: save.player.cargo, item: save.world.market.helix.food });
    const quote = quoteCommodityTrade(save, 'helix', 'food', 'buy', 5);
    assert.equal(quote.ok, true);
    assert.equal(quote.quantity, 5);
    assert.equal(quote.executableQuantity, 5);
    assert.equal(quote.unitPrice, 100);
    assert.equal(quote.total, 500);
    assert.equal(quote.massDelta, 5);
    assert.equal(quote.postCredits, 500);
    assert.equal(quote.postCargoMass, 5);
    assert.equal(quote.postCargoFreeMass, 27);
    assert.equal(quote.failureReason, null);
    assert.equal(JSON.stringify({ credits: save.player.credits, cargo: save.player.cargo, item: save.world.market.helix.food }), before, 'quote does not mutate the save');
    const result = buyCommodity(save, 'helix', 'food', 5);
    for (const key of ['quantity', 'unitPrice', 'total', 'massDelta', 'postCredits', 'postCargoMass', 'postCargoFreeMass'])
        assert.equal(result[key], quote[key], `${key} matches the quote`);
    assert.equal(save.player.credits, quote.postCredits);
    assert.equal(save.player.cargo.food, quote.quantity);
    assert.equal(save.world.market.helix.food.supply, 2);
}

// Both previews and transactions clamp to stock, wallet, and hold capacity,
// while failures expose stable short reason codes.
{
    const stockLimited = fresh(12);
    setPrice(stockLimited.world, 'helix', 'ore', 10, 2);
    stockLimited.player.credits = 1000;
    const stock = quoteCommodityTrade(stockLimited, 'helix', 'ore', 'buy', 5);
    assert.equal(stock.quantity, 2);
    assert.equal(buyCommodity(stockLimited, 'helix', 'ore', 5).quantity, 2);

    const noCredits = fresh(13);
    setPrice(noCredits.world, 'helix', 'food', 100, 20);
    noCredits.player.credits = 99;
    const credits = quoteCommodityTrade(noCredits, 'helix', 'food', 'buy', 1);
    assert.equal(credits.ok, false);
    assert.equal(credits.reason, TRADE_FAILURE_REASONS.INSUFFICIENT_CREDITS);
    assert.equal(buyCommodity(noCredits, 'helix', 'food', 1).reason, TRADE_FAILURE_REASONS.INSUFFICIENT_CREDITS);

    const noCapacity = fresh(14);
    setPrice(noCapacity.world, 'helix', 'water', 10, 20);
    noCapacity.player.credits = 1000;
    noCapacity.player.cargo = { food: 32 };
    const capacity = quoteCommodityTrade(noCapacity, 'helix', 'water', 'buy', 1);
    assert.equal(capacity.ok, false);
    assert.equal(capacity.reason, TRADE_FAILURE_REASONS.INSUFFICIENT_CAPACITY);

    const noStock = fresh(15);
    setPrice(noStock.world, 'helix', 'food', 10, 0);
    const stockEmpty = quoteCommodityTrade(noStock, 'helix', 'food', 'buy', 1);
    assert.equal(stockEmpty.reason, TRADE_FAILURE_REASONS.STOCK_EXHAUSTED);

    const noCargo = fresh(16);
    setPrice(noCargo.world, 'helix', 'food', 10, 20);
    const cargo = quoteCommodityTrade(noCargo, 'helix', 'food', 'sell', 1);
    assert.equal(cargo.reason, TRADE_FAILURE_REASONS.NO_CARGO);
    noCargo.player.cargo = { food: 3 };
    const sellQuote = quoteCommodityTrade(noCargo, 'helix', 'food', 'sell', 2);
    const sellResult = sellCommodity(noCargo, 'helix', 'food', 2);
    assert.equal(sellResult.total, sellQuote.total);
    assert.equal(sellResult.massDelta, -2);
    assert.equal(noCargo.player.cargo.food, 1);
}

// Intel is visit-only, carries the previous quote, and ages against the game
// clock so the UI can show both direction and freshness.
{
    const save = fresh(17);
    const { world } = save;
    world.time = 100;
    setPrice(world, 'helix', 'food', 40);
    const first = recordMarketVisit(world, 'helix');
    assert.equal(first.food.price, 40);
    assert.equal(first.food.previousPrice, null);
    assert.equal(first.food.seenAt, 100);
    assert.deepEqual(knownMarketQuotes(world, 'food', 'helix'), [], 'unvisited remote ports are not revealed');

    world.time = 145;
    setPrice(world, 'helix', 'food', 55);
    recordMarketVisit(world, 'helix');
    assert.equal(world.marketIntel.helix.food.previousPrice, 40);
    assert.equal(world.marketIntel.helix.food.seenAt, 145);
    setPrice(world, 'vesper', 'food', 88);
    world.time = 150;
    recordMarketVisit(world, 'vesper');
    const remote = knownMarketQuotes(world, 'food', 'helix');
    assert.equal(remote.length, 1);
    assert.deepEqual(remote[0], {
        locationId: 'vesper',
        commodityId: 'food',
        price: 88,
        quote: 88,
        seenAt: 150,
        previousPrice: null,
        source: 'visited',
        direction: 'new',
        ageSeconds: 0,
    });
    world.time = 190;
    const allKnown = knownMarketQuotes(world, 'food');
    const helix = allKnown.find((quote) => quote.locationId === 'helix');
    assert.equal(helix.ageSeconds, 45);
    assert.equal(helix.previousPrice, 40);
    assert.equal(helix.direction, 'up');
}

// Known route ranking uses only visited destination prices; the live helper
// ranks current legal-market opportunities and never leaks restricted arms.
{
    const save = fresh(18);
    const { world } = save;
    setPrice(world, 'helix', 'food', 10);
    setPrice(world, 'vesper', 'food', 40);
    setPrice(world, 'azure', 'food', 80);
    recordMarketVisit(world, 'helix');
    recordMarketVisit(world, 'vesper');
    recordMarketVisit(world, 'azure');
    const known = bestKnownTradeRoute(world, 'helix', 'food');
    assert.equal(known.originId, 'helix');
    assert.equal(known.destinationId, 'azure');
    assert.equal(known.buyPrice, 10);
    assert.equal(known.sellPrice, 80);
    assert.equal(known.profitPerUnit, 70);
    assert.equal(known.profitPerMass, 70);
    assert.equal(known.creditsPerUnit, 70);
    assert.equal(known.creditsPerMass, 70);

    for (const locationId of DOCK_LOCATION_IDS)
        for (const commodityId of commodityIds)
            setPrice(world, locationId, commodityId, 100);
    setPrice(world, 'helix', 'gold', 50);
    setPrice(world, 'vesper', 'gold', 200);
    setPrice(world, 'helix', 'arms', 50);
    setPrice(world, 'rook', 'arms', 1000);
    const current = currentProfitableRoutes(world, 'helix', 3);
    assert.equal(current.length, 3);
    assert.equal(current[0].commodityId, 'gold');
    assert.equal(current[0].destinationId, 'vesper');
    assert.equal(current[0].buyPrice, 50);
    assert.equal(current[0].sellPrice, 200);
    assert.equal(current[0].profitPerUnit, 150);
    assert.equal(current[0].profitPerMass, 300);
    assert.equal(current.every((route) => route.commodityId !== 'arms'), true, 'bartender advice remains legal');
    assert.equal(current.every((route) => route.profitPerUnit > 0 && route.profitPerMass > 0), true);
}

// A pre-intel save hydrates to an empty sparse ledger, while older numeric and
// object snapshots survive in the normalized shape.
{
    const legacy = hydrateSave({
        version: 1,
        player: { dockedAt: 'helix', position: [0, 0, 0] },
        world: {
            seed: 19,
            marketIntel: {
                helix: { food: 66 },
                rook: { food: { price: 77, previousPrice: 71, seenAt: 12, source: 'rumor' } },
                unknown: { food: 999 },
            },
        },
    });
    assert.equal(legacy.world.marketIntel.helix.food.price, 66);
    assert.equal(legacy.world.marketIntel.helix.food.previousPrice, null);
    assert.equal(legacy.world.marketIntel.rook.food.price, 77);
    assert.equal(legacy.world.marketIntel.rook.food.previousPrice, 71);
    assert.equal(legacy.world.marketIntel.rook.food.seenAt, 12);
    assert.equal(legacy.world.marketIntel.rook.food.source, 'rumor');
    assert.equal('unknown' in legacy.world.marketIntel, false);
    const noLedger = hydrateSave({ version: 1, player: { dockedAt: 'helix', position: [0, 0, 0] }, world: { seed: 20 } });
    assert.deepEqual(noLedger.world.marketIntel, {});
}

// Keep this test's market fixture intentionally independent from the generated
// market so route tests don't accidentally rely on a seed-specific price.
assert.equal(Object.keys(createInitialMarket(21)).length, DOCK_LOCATION_IDS.length);
console.log('all economy assertions passed');
