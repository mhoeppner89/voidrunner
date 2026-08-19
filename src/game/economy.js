import { COMMODITIES, DOCK_LOCATION_IDS, LOCATIONS, commodityIds } from './data.js';
import { clamp, randomBetween, seededRandom } from './random.js';
import { getEffectiveShipStats } from './shipStats.js';
// Selling gold is loud: word reaches the syndicate and pirates watch the
// Shardbelt lanes for this long after the sale (see updateDynamicEncounters).
const GOLD_HEAT_SECONDS = 360;
export const createInitialMarket = (seed) => {
    const market = {};
    for (const locationId of DOCK_LOCATION_IDS) {
        market[locationId] = {};
        for (const commodityId of commodityIds) {
            const rng = seededRandom(`${seed}:${locationId}:${commodityId}`);
            const bias = LOCATIONS[locationId].marketBias?.[commodityId] ?? 0;
            const supply = clamp(Math.round(45 + bias + randomBetween(rng, -14, 14)), 4, 95);
            const demand = clamp(Math.round(48 - bias * 0.45 + randomBetween(rng, -12, 12)), 5, 95);
            market[locationId][commodityId] = {
                supply,
                demand,
                lastPrice: 0,
            };
        }
    }
    refreshAllPrices(market, seed, 0);
    return market;
};
export const marketPrice = (locationId, commodityId, item, seed, economyClock) => {
    const commodity = COMMODITIES[commodityId];
    const locationModifier = LOCATIONS[locationId].economy?.[commodityId] ?? 1;
    const pressure = clamp((item.demand - item.supply) / 85, -0.45, 0.8);
    const cycleRng = seededRandom(`${seed}:${locationId}:${commodityId}:${Math.floor(economyClock / 180)}`);
    const cycle = randomBetween(cycleRng, -0.08, 0.08);
    const restrictedPremium = !commodity.legal && locationId !== 'rook' ? 1.1 : 1;
    return Math.max(3, Math.round(commodity.basePrice * locationModifier * (1 + pressure + cycle) * restrictedPremium));
};
export const refreshAllPrices = (market, seed, economyClock) => {
    for (const locationId of DOCK_LOCATION_IDS) {
        for (const commodityId of commodityIds) {
            const item = market[locationId][commodityId];
            item.lastPrice = marketPrice(locationId, commodityId, item, seed, economyClock);
        }
    }
};
export const tickEconomy = (world, seconds) => {
    const previousCycle = Math.floor(world.economyClock / 45);
    world.economyClock += seconds;
    const currentCycle = Math.floor(world.economyClock / 45);
    if (currentCycle === previousCycle)
        return;
    for (const locationId of DOCK_LOCATION_IDS) {
        for (const commodityId of commodityIds) {
            const item = world.market[locationId][commodityId];
            const rng = seededRandom(`${world.seed}:economy:${currentCycle}:${locationId}:${commodityId}`);
            const bias = LOCATIONS[locationId].marketBias?.[commodityId] ?? 0;
            const supplyTarget = clamp(48 + bias, 10, 90);
            const demandTarget = clamp(48 - bias * 0.45, 10, 90);
            item.supply = clamp(Math.round(item.supply + (supplyTarget - item.supply) * 0.08 + randomBetween(rng, -3, 3)), 2, 99);
            item.demand = clamp(Math.round(item.demand + (demandTarget - item.demand) * 0.08 + randomBetween(rng, -3, 3)), 2, 99);
        }
    }
    refreshAllPrices(world.market, world.seed, world.economyClock);
};
export const cargoMass = (player) => {
    let mass = player.sealedCargo.reduce((sum, item) => sum + item.mass * item.units, 0);
    for (const commodityId of commodityIds) {
        mass += (player.cargo[commodityId] ?? 0) * COMMODITIES[commodityId].mass;
    }
    return mass;
};
export const cargoCapacity = (player) => getEffectiveShipStats(player).cargo;
export const cargoFree = (player) => Math.max(0, cargoCapacity(player) - cargoMass(player));
export const buyCommodity = (save, locationId, commodityId, requestedQuantity = 1) => {
    const item = save.world.market[locationId][commodityId];
    const commodity = COMMODITIES[commodityId];
    const price = item.lastPrice;
    const affordable = Math.floor(save.player.credits / price);
    const byCapacity = Math.floor(cargoFree(save.player) / commodity.mass);
    const quantity = Math.max(0, Math.min(requestedQuantity, item.supply, affordable, byCapacity));
    if (quantity <= 0) {
        if (item.supply <= 0)
            return { ok: false, message: 'Market stock exhausted.', quantity: 0, total: 0 };
        if (affordable <= 0)
            return { ok: false, message: 'Insufficient credits.', quantity: 0, total: 0 };
        return { ok: false, message: 'Cargo hold has insufficient free mass.', quantity: 0, total: 0 };
    }
    const total = price * quantity;
    save.player.credits -= total;
    save.player.cargo[commodityId] = (save.player.cargo[commodityId] ?? 0) + quantity;
    item.supply = clamp(item.supply - quantity, 0, 99);
    item.demand = clamp(item.demand + Math.ceil(quantity * 0.3), 0, 99);
    item.lastPrice = marketPrice(locationId, commodityId, item, save.world.seed, save.world.economyClock);
    save.player.stats.trades += quantity;
    return { ok: true, message: `Loaded ${quantity} ${commodity.name}.`, quantity, total };
};
export const sellCommodity = (save, locationId, commodityId, requestedQuantity = 1) => {
    const owned = save.player.cargo[commodityId] ?? 0;
    const quantity = Math.max(0, Math.min(requestedQuantity, owned));
    if (quantity <= 0)
        return { ok: false, message: 'No matching cargo in the hold.', quantity: 0, total: 0 };
    const item = save.world.market[locationId][commodityId];
    const total = item.lastPrice * quantity;
    save.player.credits += total;
    save.player.cargo[commodityId] = owned - quantity;
    item.supply = clamp(item.supply + quantity, 0, 99);
    item.demand = clamp(item.demand - Math.ceil(quantity * 0.35), 0, 99);
    item.lastPrice = marketPrice(locationId, commodityId, item, save.world.seed, save.world.economyClock);
    save.player.stats.trades += quantity;
    if (commodityId === 'gold') {
        // The exchange tips the syndicate: pirates converge on the Shardbelt to
        // hunt the lucky miner while the sale is still fresh.
        save.world.goldHeatUntil = save.world.time + GOLD_HEAT_SECONDS;
    }
    return { ok: true, message: `Sold ${quantity} ${COMMODITIES[commodityId].name}.`, quantity, total };
};
