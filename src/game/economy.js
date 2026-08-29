import { COMMODITIES, DOCK_LOCATION_IDS, LOCATIONS, commodityIds } from './data.js';
import { clamp, randomBetween, seededRandom } from './random.js';
import { getEffectiveShipStats } from './shipStats.js';
import { t } from './i18n.js';
// Selling gold is loud: word reaches the syndicate and pirates watch the
// Shardbelt lanes for this long after the sale (see updateDynamicEncounters).
const GOLD_HEAT_SECONDS = 360;
// Once a dock's underworld ledger crosses this total, the local fixer opens
// the smuggler's den to the pilot who paid for it (see game.js
// paySyndicateBerth / denUnlockedAt).
export const SYNDICATE_DEN_FAVOR = 600;
// The den pays over the counter for restricted goods: untraceable arms move at
// this premium above the station's licensed market price. Legal goods do not
// trade below the radar — the den only moves what the manifest can't show.
const BLACK_MARKET_PREMIUM = 1.25;
export const denPrice = (locationId, commodityId, item, seed, economyClock) => {
    const commodity = COMMODITIES[commodityId];
    if (commodity.legal)
        return undefined;
    const base = marketPrice(locationId, commodityId, item, seed, economyClock);
    return Math.max(3, Math.round(base * BLACK_MARKET_PREMIUM));
};
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
    let mass = (Array.isArray(player?.sealedCargo) ? player.sealedCargo : []).reduce((sum, item) => sum + item.mass * item.units, 0);
    for (const commodityId of commodityIds) {
        mass += (player?.cargo?.[commodityId] ?? 0) * COMMODITIES[commodityId].mass;
    }
    return mass;
};
export const cargoCapacity = (player) => getEffectiveShipStats(player).cargo;
export const cargoFree = (player) => Math.max(0, cargoCapacity(player) - cargoMass(player));

// These codes are intentionally short and data-only. UI callers can map them
// to localized copy without parsing a translated message, and a failed quote
// remains useful to previews as well as to the transaction path.
export const TRADE_FAILURE_REASONS = Object.freeze({
    INVALID_KIND: 'kind',
    INVALID_MARKET: 'market',
    INVALID_QUANTITY: 'quantity',
    STOCK_EXHAUSTED: 'stock',
    INSUFFICIENT_CREDITS: 'credits',
    INSUFFICIENT_CAPACITY: 'capacity',
    NO_CARGO: 'cargo',
});

const worldFor = (source) => source?.world && typeof source.world === 'object' ? source.world : source;
const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const finiteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : undefined;
const clockFor = (world) => {
    const time = finiteNumber(world?.time);
    if (time !== undefined)
        return time;
    const economyClock = finiteNumber(world?.economyClock);
    return economyClock;
};

// Market intel is deliberately sparse: a location appears only after the
// player has visited it. The normalizer also accepts the early numeric/price
// shapes so importing a hand-edited or pre-release save cannot crash the HUD.
export const normalizeMarketIntel = (candidate) => {
    const result = {};
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
        return result;
    for (const locationId of DOCK_LOCATION_IDS) {
        const source = candidate[locationId];
        if (!source || typeof source !== 'object' || Array.isArray(source))
            continue;
        const port = {};
        for (const commodityId of commodityIds) {
            const raw = source[commodityId];
            if (raw === undefined || raw === null)
                continue;
            const record = typeof raw === 'number' ? { price: raw } : raw;
            if (!record || typeof record !== 'object')
                continue;
            const price = finiteNumber(record.price ?? record.quote ?? record.lastPrice);
            if (!finitePositive(price))
                continue;
            const previousPrice = finiteNumber(record.previousPrice ?? record.previousQuote);
            const seenAt = finiteNumber(record.seenAt);
            port[commodityId] = {
                price,
                previousPrice: finitePositive(previousPrice) ? previousPrice : null,
                seenAt: seenAt === undefined ? null : seenAt,
                source: typeof record.source === 'string' && record.source ? record.source : 'visited',
            };
        }
        if (Object.keys(port).length)
            result[locationId] = port;
    }
    return result;
};

const ensureMarketIntel = (world) => {
    if (!world || typeof world !== 'object')
        return {};
    if (!world.marketIntel || typeof world.marketIntel !== 'object' || Array.isArray(world.marketIntel))
        world.marketIntel = {};
    return world.marketIntel;
};
const intelPrice = (record) => {
    const price = finiteNumber(typeof record === 'number' ? record : record?.price ?? record?.quote ?? record?.lastPrice);
    return finitePositive(price) ? price : undefined;
};
const directionFor = (price, previousPrice) => {
    if (!finitePositive(previousPrice))
        return 'new';
    if (price > previousPrice)
        return 'up';
    if (price < previousPrice)
        return 'down';
    return 'flat';
};

// Record the current quotes at a port. `world.time` is the game clock, which
// keeps age deterministic in tests and in offline play; callers may pass an
// explicit seenAt when importing a market observation.
export const recordMarketVisit = (worldOrSave, locationId, seenAt) => {
    const world = worldFor(worldOrSave);
    const market = world?.market?.[locationId];
    if (!market || !LOCATIONS[locationId])
        return {};
    const intel = ensureMarketIntel(world);
    const previous = intel[locationId] && typeof intel[locationId] === 'object' ? intel[locationId] : {};
    const timestamp = finiteNumber(seenAt) ?? clockFor(world) ?? 0;
    const snapshot = {};
    for (const commodityId of commodityIds) {
        const item = market[commodityId];
        if (!item)
            continue;
        const livePrice = intelPrice(item) ?? marketPrice(locationId, commodityId, item, world.seed, world.economyClock);
        if (!finitePositive(livePrice))
            continue;
        const previousPrice = intelPrice(previous[commodityId]);
        snapshot[commodityId] = {
            price: livePrice,
            previousPrice: previousPrice ?? null,
            seenAt: timestamp,
            source: 'visited',
        };
    }
    if (Object.keys(snapshot).length)
        intel[locationId] = snapshot;
    return snapshot;
};

const tradeMessage = (reason) => {
    switch (reason) {
        case TRADE_FAILURE_REASONS.STOCK_EXHAUSTED:
            return t('Market stock exhausted.');
        case TRADE_FAILURE_REASONS.INSUFFICIENT_CREDITS:
            return t('Insufficient credits.');
        case TRADE_FAILURE_REASONS.INSUFFICIENT_CAPACITY:
            return t('Cargo hold has insufficient free mass.');
        case TRADE_FAILURE_REASONS.NO_CARGO:
            return t('No matching cargo in the hold.');
        case TRADE_FAILURE_REASONS.INVALID_QUANTITY:
            return t('Enter a positive quantity.');
        case TRADE_FAILURE_REASONS.INVALID_MARKET:
            return t('Market unavailable.');
        default:
            return t('Trade unavailable.');
    }
};

const emptyTradeQuote = (save, locationId, commodityId, kind, requestedQuantity, unitPrice, reason) => {
    const player = save?.player;
    const postCargoMass = player ? cargoMass(player) : 0;
    const postCargoFreeMass = player ? cargoFree(player) : 0;
    const postCredits = finiteNumber(player?.credits) ?? 0;
    return {
        ok: false,
        reason,
        failureReason: reason,
        locationId,
        commodityId,
        kind,
        requestedQuantity,
        quantity: 0,
        executableQuantity: 0,
        unitPrice: finitePositive(unitPrice) ? Number(unitPrice) : 0,
        total: 0,
        massDelta: 0,
        postCredits,
        postCargoMass,
        postCargoFreeMass,
    };
};

// Quote and execute through the same arithmetic. This function has no writes:
// callers can safely render a preview, clamp a quantity control, or compare a
// route without changing market supply, demand, cargo, or credits.
export const quoteCommodityTrade = (save, locationId, commodityId, kind, requestedQuantity = 1, priceOverride) => {
    const isBuy = kind === 'buy' || kind === 'den-buy';
    const isSell = kind === 'sell' || kind === 'den-sell';
    if (!isBuy && !isSell)
        return emptyTradeQuote(save, locationId, commodityId, kind, requestedQuantity, 0, TRADE_FAILURE_REASONS.INVALID_KIND);
    const item = save?.world?.market?.[locationId]?.[commodityId];
    const commodity = COMMODITIES[commodityId];
    const player = save?.player;
    if (!item || !commodity || !player || !finitePositive(commodity.mass))
        return emptyTradeQuote(save, locationId, commodityId, kind, requestedQuantity, 0, TRADE_FAILURE_REASONS.INVALID_MARKET);
    const priceValue = priceOverride ?? item.lastPrice;
    const price = finiteNumber(priceValue);
    if (!finitePositive(price))
        return emptyTradeQuote(save, locationId, commodityId, kind, requestedQuantity, price, TRADE_FAILURE_REASONS.INVALID_MARKET);
    const requested = finiteNumber(requestedQuantity);
    if (requested === undefined || requested <= 0)
        return emptyTradeQuote(save, locationId, commodityId, kind, requestedQuantity, price, TRADE_FAILURE_REASONS.INVALID_QUANTITY);
    const requestedUnits = Math.floor(requested);
    if (requestedUnits <= 0)
        return emptyTradeQuote(save, locationId, commodityId, kind, requestedQuantity, price, TRADE_FAILURE_REASONS.INVALID_QUANTITY);
    const credits = Math.max(0, finiteNumber(player.credits) ?? 0);
    const currentMass = cargoMass(player);
    const capacity = cargoCapacity(player);
    const currentFree = Math.max(0, capacity - currentMass);
    let quantity;
    let reason;
    if (isBuy) {
        const stock = Math.max(0, Math.floor(finiteNumber(item.supply) ?? 0));
        const affordable = Math.max(0, Math.floor(credits / price));
        const byCapacity = Math.max(0, Math.floor(currentFree / commodity.mass));
        quantity = Math.max(0, Math.min(requestedUnits, stock, affordable, byCapacity));
        if (quantity <= 0) {
            if (stock <= 0)
                reason = TRADE_FAILURE_REASONS.STOCK_EXHAUSTED;
            else if (affordable <= 0)
                reason = TRADE_FAILURE_REASONS.INSUFFICIENT_CREDITS;
            else
                reason = TRADE_FAILURE_REASONS.INSUFFICIENT_CAPACITY;
        }
    }
    else {
        const owned = Math.max(0, Math.floor(finiteNumber(player.cargo?.[commodityId]) ?? 0));
        quantity = Math.max(0, Math.min(requestedUnits, owned));
        if (quantity <= 0)
            reason = TRADE_FAILURE_REASONS.NO_CARGO;
    }
    if (quantity <= 0)
        return emptyTradeQuote(save, locationId, commodityId, kind, requestedQuantity, price, reason);
    const total = price * quantity;
    const massDelta = (isBuy ? 1 : -1) * commodity.mass * quantity;
    const postCredits = credits + (isBuy ? -total : total);
    const postCargoMass = currentMass + massDelta;
    const postCargoFreeMass = Math.max(0, capacity - postCargoMass);
    return {
        ok: true,
        reason: null,
        failureReason: null,
        locationId,
        commodityId,
        kind,
        requestedQuantity,
        quantity,
        executableQuantity: quantity,
        unitPrice: price,
        total,
        massDelta,
        postCredits,
        postCargoMass,
        postCargoFreeMass,
    };
};

const executeTradeQuote = (save, quote) => {
    if (!quote.ok)
        return { ...quote, message: tradeMessage(quote.reason) };
    const item = save.world.market[quote.locationId][quote.commodityId];
    const commodity = COMMODITIES[quote.commodityId];
    const isBuy = quote.kind === 'buy' || quote.kind === 'den-buy';
    if (isBuy) {
        save.player.credits -= quote.total;
        save.player.cargo[quote.commodityId] = (save.player.cargo[quote.commodityId] ?? 0) + quote.quantity;
        item.supply = clamp(item.supply - quote.quantity, 0, 99);
        item.demand = clamp(item.demand + Math.ceil(quote.quantity * 0.3), 0, 99);
    }
    else {
        save.player.credits += quote.total;
        save.player.cargo[quote.commodityId] = (save.player.cargo[quote.commodityId] ?? 0) - quote.quantity;
        item.supply = clamp(item.supply + quote.quantity, 0, 99);
        item.demand = clamp(item.demand - Math.ceil(quote.quantity * 0.35), 0, 99);
    }
    item.lastPrice = marketPrice(quote.locationId, quote.commodityId, item, save.world.seed, save.world.economyClock);
    save.player.stats.trades += quote.quantity;
    if (!isBuy && quote.commodityId === 'gold') {
        // The exchange tips the syndicate: pirates converge on the Shardbelt to
        // hunt the lucky miner while the sale is still fresh.
        save.world.goldHeatUntil = save.world.time + GOLD_HEAT_SECONDS;
    }
    return {
        ...quote,
        message: isBuy
            ? t('Loaded {quantity} {commodity}.', { quantity: quote.quantity, commodity: t(commodity.name) })
            : t('Sold {quantity} {commodity}.', { quantity: quote.quantity, commodity: t(commodity.name) }),
    };
};

export const buyCommodity = (save, locationId, commodityId, requestedQuantity = 1, priceOverride) => executeTradeQuote(save, quoteCommodityTrade(save, locationId, commodityId, 'buy', requestedQuantity, priceOverride));
// A delivered NPC cargo softens the destination market: the inbound stock
// lands on the exchange (supply up, local demand partly met), which eases
// lastPrice exactly like a player sale would. Deterministic — pure supply/
// demand math, no rng. Traders call this when their trade task reaches a port
// (see shipAI.legTick); smugglers deliberately bypass the licensed market.
export const deliverCargo = (market, locationId, cargo, seed, economyClock) => {
    const prices = market?.[locationId];
    if (!prices)
        return;
    for (const [commodityId, qty] of Object.entries(cargo ?? {})) {
        if (qty <= 0)
            continue;
        const item = prices[commodityId];
        if (!item)
            continue;
        item.supply = clamp(item.supply + Math.ceil(qty * 0.8), 0, 99);
        item.demand = clamp(item.demand - Math.ceil(qty * 0.3), 0, 99);
        item.lastPrice = marketPrice(locationId, commodityId, item, seed, economyClock);
    }
};
export const sellCommodity = (save, locationId, commodityId, requestedQuantity = 1, priceOverride) => executeTradeQuote(save, quoteCommodityTrade(save, locationId, commodityId, 'sell', requestedQuantity, priceOverride));

const routeSort = (a, b) => {
    const byMass = b.profitPerMass - a.profitPerMass;
    if (byMass)
        return byMass;
    const byUnit = b.profitPerUnit - a.profitPerUnit;
    if (byUnit)
        return byUnit;
    const destinationA = String(a.destinationId);
    const destinationB = String(b.destinationId);
    if (destinationA < destinationB)
        return -1;
    if (destinationA > destinationB)
        return 1;
    const commodityA = String(a.commodityId);
    const commodityB = String(b.commodityId);
    return commodityA < commodityB ? -1 : commodityA > commodityB ? 1 : 0;
};
const routeCommodityIds = (commodityId) => commodityId === undefined
    ? commodityIds
    : COMMODITIES[commodityId]
        ? [commodityId]
        : [];

// Return the prices the pilot has actually learned, never silently filling
// missing destinations from the live market. This keeps route advice honest:
// a bartender can only repeat a price someone has brought back from that port.
export const knownMarketQuotes = (worldOrSave, commodityId, originId) => {
    const world = worldFor(worldOrSave);
    const intel = world?.marketIntel;
    if (!intel || typeof intel !== 'object' || Array.isArray(intel))
        return [];
    const now = clockFor(world);
    const result = [];
    for (const locationId of DOCK_LOCATION_IDS) {
        if (originId && locationId === originId)
            continue;
        const port = intel[locationId];
        if (!port || typeof port !== 'object' || Array.isArray(port))
            continue;
        for (const id of routeCommodityIds(commodityId)) {
            const entry = port[id];
            const price = intelPrice(entry);
            if (price === undefined)
                continue;
            const previousPrice = finiteNumber(entry?.previousPrice ?? entry?.previousQuote);
            const seenAt = finiteNumber(entry?.seenAt);
            result.push({
                locationId,
                commodityId: id,
                price,
                quote: price,
                seenAt: seenAt ?? null,
                previousPrice: finitePositive(previousPrice) ? previousPrice : null,
                source: typeof entry?.source === 'string' && entry.source ? entry.source : 'visited',
                direction: directionFor(price, previousPrice),
                ageSeconds: seenAt !== undefined && now !== undefined ? Math.max(0, now - seenAt) : null,
            });
        }
    }
    return result;
};

const livePriceFor = (world, locationId, commodityId) => {
    const item = world?.market?.[locationId]?.[commodityId];
    const price = finiteNumber(item?.lastPrice);
    return finitePositive(price) ? price : undefined;
};
const routeRecord = ({ originId, destinationId, commodityId, buyPrice, sellPrice, source, seenAt, previousPrice, includeCreditAliases = false }) => {
    const profitPerUnit = sellPrice - buyPrice;
    const profitPerMass = profitPerUnit / COMMODITIES[commodityId].mass;
    const route = {
        originId,
        destinationId,
        commodityId,
        buyPrice,
        sellPrice,
        profitPerUnit,
        profitPerMass,
    };
    // Known routes are also consumed by copy that labels the margin in
    // credits. Keep these aliases off live route rows so their public shape
    // stays the seven fields used by the bartender route contract.
    if (includeCreditAliases) {
        route.creditsPerUnit = profitPerUnit;
        route.creditsPerMass = profitPerMass;
    }
    if (source)
        route.source = source;
    if (seenAt !== undefined)
        route.seenAt = seenAt;
    if (previousPrice !== undefined)
        route.previousPrice = previousPrice;
    return route;
};

// Find the most attractive positive route using the origin's known/current
// quote and destination intel. If the player has not recorded the origin yet,
// being docked there still makes its live price a truthful buy quote.
export const bestKnownTradeRoute = (worldOrSave, originId, commodityId) => {
    const world = worldFor(worldOrSave);
    if (!world?.market?.[originId] || !LOCATIONS[originId])
        return undefined;
    const originIntel = world.marketIntel?.[originId];
    const routes = [];
    for (const id of routeCommodityIds(commodityId)) {
        const knownOriginPrice = intelPrice(originIntel?.[id]);
        const buyPrice = knownOriginPrice ?? livePriceFor(world, originId, id);
        if (buyPrice === undefined)
            continue;
        for (const quote of knownMarketQuotes(world, id, originId)) {
            if (quote.price <= buyPrice)
                continue;
            routes.push(routeRecord({
                originId,
                destinationId: quote.locationId,
                commodityId: id,
                buyPrice,
                sellPrice: quote.price,
                source: quote.source,
                seenAt: quote.seenAt,
                previousPrice: quote.previousPrice,
                includeCreditAliases: true,
            }));
        }
    }
    routes.sort(routeSort);
    return routes[0];
};

// Bartender route advice is based on the live market at every dock and legal
// cargo only. It intentionally does not use stale intel: the returned route is
// executable now, subject to the player's credits, hold, and stock.
export const currentProfitableRoutes = (worldOrSave, originId, limit = 3) => {
    const world = worldFor(worldOrSave);
    if (!world?.market?.[originId] || !LOCATIONS[originId])
        return [];
    const routes = [];
    for (const id of commodityIds) {
        const commodity = COMMODITIES[id];
        if (!commodity.legal)
            continue;
        const originItem = world.market[originId][id];
        const buyPrice = livePriceFor(world, originId, id);
        if (buyPrice === undefined)
            continue;
        if (finiteNumber(originItem?.supply) !== undefined && originItem.supply <= 0)
            continue;
        for (const destinationId of DOCK_LOCATION_IDS) {
            if (destinationId === originId)
                continue;
            const sellPrice = livePriceFor(world, destinationId, id);
            if (sellPrice === undefined || sellPrice <= buyPrice)
                continue;
            routes.push(routeRecord({ originId, destinationId, commodityId: id, buyPrice, sellPrice }));
        }
    }
    routes.sort(routeSort);
    const count = Math.max(0, Math.floor(finiteNumber(limit) ?? 3));
    return routes.slice(0, count);
};
