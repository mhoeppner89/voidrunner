import { HARDPOINT_SPECS, OUTFIT_ITEMS, itemAvailable, installedItemIds } from './outfitting.js';

// Career pacing is measured in real game-time seconds. The ledger is deliberately
// small and JSON-safe so it can live in the normal career save without carrying
// runtime ships, renderer objects, or transient combat state.
export const SORTIE_LEDGER_VERSION = 1;
const HISTORY_LIMIT = 8;
const GUILDS = Object.freeze(['merchant', 'bounty', 'mining', 'salvage', 'syndicate']);
const FACTIONS = Object.freeze(['concord', 'free-merchants', 'frontier-miners', 'salvage-union', 'red-talons']);
const UPGRADE_CATEGORIES = new Set(['power', 'drive', 'defense', 'utility']);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const whole = (value, fallback = 0) => Math.max(0, Math.floor(finite(value, fallback)));
const emptyMap = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));

const statSnapshot = (player = {}) => ({
    credits: finite(player.credits),
    guildRep: Object.fromEntries(GUILDS.map((id) => [id, finite(player.guildRep?.[id])])),
    reputation: Object.fromEntries(FACTIONS.map((id) => [id, finite(player.reputation?.[id])])),
    contracts: whole(player.stats?.contracts),
    kills: whole(player.stats?.kills),
    mined: whole(player.stats?.mined),
    salvaged: whole(player.stats?.salvaged),
    trades: whole(player.stats?.trades),
});

const compatibleWithShip = (item, shipId) => {
    const category = item?.category === 'gun' ? 'guns'
        : item?.category === 'launcher' ? 'launchers'
            : item?.category;
    return Boolean(category && (HARDPOINT_SPECS[shipId]?.[category] ?? []).some((mount) => (
        (item.sizes ?? [item.size]).includes(mount.size)
    )));
};

// Find the next upgrade that can materially change a career sortie. Factory
// hardware is excluded; installed modules are excluded; a locker item is
// still surfaced because the meaningful next step may be fitting it, not buying
// it. When the player cannot yet buy anything, the closest guild-locked module
// is returned with its blocker so the path is visible instead of empty.
export const nextMeaningfulUpgrade = (save, locationId = save?.player?.dockedAt ?? save?.player?.lastDockedAt) => {
    const player = save?.player;
    if (!player?.shipId)
        return null;
    const installed = new Set(installedItemIds(player, player.shipId));
    const locker = player.outfitting?.locker ?? {};
    const candidates = Object.values(OUTFIT_ITEMS)
        .filter((item) => UPGRADE_CATEGORIES.has(item.category)
            && !item.factoryFit
            && !installed.has(item.id)
            && compatibleWithShip(item, player.shipId))
        .map((item) => {
            const rank = finite(player.guildRank?.[item.requiredGuild] ?? player.guildRep?.[item.requiredGuild]);
            const requiredRank = finite(item.requiredRank);
            const locked = Boolean(item.requiredGuild && rank < requiredRank);
            const available = !locked && itemAvailable(player, item, locationId);
            const owned = whole(locker[item.id]) > 0;
            const price = whole(item.price);
            return {
                id: item.id,
                name: item.name,
                category: item.category,
                price,
                owned,
                locked,
                available,
                availableAt: item.availability?.[0] ?? null,
                requiredGuild: item.requiredGuild ?? null,
                requiredRank: requiredRank || 0,
                currentRank: rank,
                credits: finite(player.credits),
                affordable: owned || finite(player.credits) >= price,
            };
        });
    const usable = candidates.filter((item) => item.owned || item.available);
    const pool = usable.length ? usable : candidates.filter((item) => item.locked);
    return pool.sort((a, b) => (
        Number(b.owned) - Number(a.owned)
        || Number(a.locked) - Number(b.locked)
        || a.price - b.price
        || a.id.localeCompare(b.id)
    ))[0] ?? null;
};

const normalizeMap = (value, keys) => Object.fromEntries(keys.map((key) => [key, Math.max(0, finite(value?.[key]))]));
const normalizeDeltaMap = (value, keys) => Object.fromEntries(keys.map((key) => [key, finite(value?.[key])]));
const normalizeEvents = (events) => Array.isArray(events)
    ? events.slice(-24).flatMap((entry) => entry && typeof entry === 'object' && typeof entry.kind === 'string'
        ? [{ kind: entry.kind.slice(0, 48), at: Math.max(0, finite(entry.at)), detail: typeof entry.detail === 'string' ? entry.detail.slice(0, 120) : undefined }]
        : [])
    : [];

const normalizeUpgrade = (value) => {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string')
        return null;
    return {
        id: value.id,
        name: typeof value.name === 'string' ? value.name : value.id,
        category: typeof value.category === 'string' ? value.category : 'utility',
        price: whole(value.price),
        owned: value.owned === true,
        locked: value.locked === true,
        available: value.available !== false,
        availableAt: typeof value.availableAt === 'string' ? value.availableAt : null,
        requiredGuild: typeof value.requiredGuild === 'string' ? value.requiredGuild : null,
        requiredRank: whole(value.requiredRank),
        currentRank: whole(value.currentRank),
        credits: finite(value.credits),
        affordable: value.affordable === true,
    };
};

export const normalizeSortieSummary = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || typeof candidate.id !== 'string')
        return null;
    return {
        version: SORTIE_LEDGER_VERSION,
        id: candidate.id.slice(0, 120),
        originId: typeof candidate.originId === 'string' ? candidate.originId : 'unknown',
        destinationId: typeof candidate.destinationId === 'string' ? candidate.destinationId : null,
        launchedAt: Math.max(0, finite(candidate.launchedAt)),
        arrivedAt: candidate.arrivedAt === null || candidate.arrivedAt === undefined ? null : Math.max(0, finite(candidate.arrivedAt)),
        completedAt: candidate.completedAt === null || candidate.completedAt === undefined ? null : Math.max(0, finite(candidate.completedAt)),
        duration: Math.max(0, finite(candidate.duration)),
        startCredits: Math.max(0, finite(candidate.startCredits)),
        endCredits: Math.max(0, finite(candidate.endCredits)),
        creditDelta: finite(candidate.creditDelta),
        totalEarnings: Math.max(0, finite(candidate.totalEarnings)),
        totalCosts: Math.max(0, finite(candidate.totalCosts)),
        netPerMinute: finite(candidate.netPerMinute),
        earnings: normalizeMap(candidate.earnings, ['missions', 'trades', 'bounties', 'rescues', 'pickups', 'races', 'other']),
        costs: normalizeMap(candidate.costs, ['bonds', 'repair', 'refill', 'drones', 'outfitting', 'ship', 'fees', 'losses', 'other']),
        guildRepDelta: normalizeDeltaMap(candidate.guildRepDelta, GUILDS),
        reputationDelta: normalizeDeltaMap(candidate.reputationDelta, FACTIONS),
        missionsAccepted: whole(candidate.missionsAccepted),
        missionsCompleted: whole(candidate.missionsCompleted),
        missionsFailed: whole(candidate.missionsFailed),
        encounters: normalizeMap(candidate.encounters, ['ambient', 'mission', 'patrol', 'distress', 'opportunity', 'beam', 'frigate']),
        kills: whole(candidate.kills),
        upgradesInstalled: whole(candidate.upgradesInstalled),
        startUpgrade: normalizeUpgrade(candidate.startUpgrade),
        nextUpgrade: normalizeUpgrade(candidate.nextUpgrade),
        events: normalizeEvents(candidate.events),
    };
};

export const normalizeSortieHistory = (candidate) => Array.isArray(candidate)
    ? candidate.map(normalizeSortieSummary).filter(Boolean).slice(-HISTORY_LIMIT)
    : [];

export const normalizeActiveSortie = (candidate) => {
    const summary = normalizeSortieSummary(candidate);
    if (!summary)
        return null;
    return {
        ...summary,
        startSnapshot: candidate.startSnapshot && typeof candidate.startSnapshot === 'object'
            ? statSnapshot(candidate.startSnapshot)
            : { credits: summary.startCredits, guildRep: emptyMap(GUILDS), reputation: emptyMap(FACTIONS), contracts: 0, kills: 0, mined: 0, salvaged: 0, trades: 0 },
        dockedAt: typeof candidate.dockedAt === 'string' ? candidate.dockedAt : null,
    };
};

export const createSortieLedger = (save, originId) => {
    const player = save.player;
    const time = Math.max(0, finite(save.world?.time));
    const history = normalizeSortieHistory(save.world?.sortieHistory);
    return {
        version: SORTIE_LEDGER_VERSION,
        id: `${save.world?.seed ?? 'career'}-${Math.floor(time)}-${history.length + 1}`,
        originId: originId ?? player.dockedAt ?? player.lastDockedAt ?? 'unknown',
        destinationId: null,
        launchedAt: time,
        arrivedAt: null,
        completedAt: null,
        duration: 0,
        startCredits: Math.max(0, finite(player.credits)),
        endCredits: Math.max(0, finite(player.credits)),
        creditDelta: 0,
        earnings: emptyMap(['missions', 'trades', 'bounties', 'rescues', 'pickups', 'races', 'other']),
        costs: emptyMap(['bonds', 'repair', 'refill', 'drones', 'outfitting', 'ship', 'fees', 'losses', 'other']),
        guildRepDelta: emptyMap(GUILDS),
        reputationDelta: emptyMap(FACTIONS),
        missionsAccepted: 0,
        missionsCompleted: 0,
        missionsFailed: 0,
        encounters: emptyMap(['ambient', 'mission', 'patrol', 'distress', 'opportunity', 'beam', 'frigate']),
        kills: 0,
        upgradesInstalled: 0,
        startUpgrade: nextMeaningfulUpgrade(save, originId),
        nextUpgrade: nextMeaningfulUpgrade(save, originId),
        events: [],
        startSnapshot: statSnapshot(player),
        dockedAt: null,
    };
};

const active = (save) => save?.world?.sortie;
const add = (map, key, amount) => {
    if (!map || !key || !Number.isFinite(Number(amount)))
        return;
    map[key] = Math.max(0, finite(map[key]) + Number(amount));
};
const event = (ledger, kind, at, detail) => {
    ledger.events ??= [];
    ledger.events.push({ kind, at, ...(detail ? { detail: String(detail).slice(0, 120) } : {}) });
    if (ledger.events.length > 24)
        ledger.events.splice(0, ledger.events.length - 24);
};

export const beginSortie = (save, originId) => {
    if (!save?.world || !save.player)
        return null;
    save.world.sortie = createSortieLedger(save, originId);
    return save.world.sortie;
};

export const recordSortieCredit = (save, amount, category = 'other') => {
    const ledger = active(save);
    const value = Number(amount);
    if (!ledger || !Number.isFinite(value) || value === 0)
        return;
    if (value > 0)
        add(ledger.earnings, category, value);
    else
        add(ledger.costs, category, -value);
    event(ledger, value > 0 ? 'income' : 'cost', finite(save.world.time), `${category}:${Math.round(Math.abs(value))}`);
};

export const recordSortieMission = (save, kind, detail) => {
    const ledger = active(save);
    if (!ledger)
        return;
    if (kind === 'accepted') ledger.missionsAccepted += 1;
    else if (kind === 'completed') ledger.missionsCompleted += 1;
    else if (kind === 'failed') ledger.missionsFailed += 1;
    event(ledger, `mission-${kind}`, finite(save.world.time), detail);
};

export const recordSortieEncounter = (save, kind, detail) => {
    const ledger = active(save);
    if (!ledger)
        return;
    add(ledger.encounters, kind, 1);
    event(ledger, 'encounter', finite(save.world.time), detail ?? kind);
};

export const recordSortieUpgrade = (save, itemId) => {
    const ledger = active(save);
    if (!ledger)
        return;
    ledger.upgradesInstalled += 1;
    event(ledger, 'upgrade', finite(save.world.time), itemId);
};

export const markSortieDocked = (save, destinationId) => {
    const ledger = active(save);
    if (!ledger)
        return;
    ledger.arrivedAt = finite(save.world.time);
    ledger.destinationId = destinationId ?? null;
    ledger.dockedAt = destinationId ?? null;
};

export const sortieSummary = (save, ledger = active(save)) => {
    if (!ledger)
        return null;
    const player = save.player;
    const snapshot = ledger.startSnapshot ?? statSnapshot({ credits: ledger.startCredits });
    const time = Math.max(0, finite(save.world.time));
    const current = statSnapshot(player);
    const guildRepDelta = Object.fromEntries(GUILDS.map((id) => [id, current.guildRep[id] - finite(snapshot.guildRep?.[id])]));
    const reputationDelta = Object.fromEntries(FACTIONS.map((id) => [id, current.reputation[id] - finite(snapshot.reputation?.[id])]));
    const nextUpgrade = nextMeaningfulUpgrade(save, ledger.dockedAt ?? player.dockedAt ?? player.lastDockedAt);
    const earnings = normalizeMap(ledger.earnings, ['missions', 'trades', 'bounties', 'rescues', 'pickups', 'races', 'other']);
    const costs = normalizeMap(ledger.costs, ['bonds', 'repair', 'refill', 'drones', 'outfitting', 'ship', 'fees', 'losses', 'other']);
    const totalEarnings = Object.values(earnings).reduce((sum, value) => sum + value, 0);
    const totalCosts = Object.values(costs).reduce((sum, value) => sum + value, 0);
    return normalizeSortieSummary({
        ...ledger,
        duration: Math.max(0, time - finite(ledger.launchedAt)),
        endCredits: current.credits,
        creditDelta: current.credits - finite(ledger.startCredits),
        earnings,
        costs,
        guildRepDelta,
        reputationDelta,
        kills: Math.max(0, current.kills - finite(snapshot.kills)),
        nextUpgrade,
        // Derived totals make the UI and local pacing reports independent of
        // the order in which service/mission events were recorded.
        totalEarnings,
        totalCosts,
        netPerMinute: (current.credits - finite(ledger.startCredits)) / Math.max(time - finite(ledger.launchedAt), 1) * 60,
    });
};

export const finishSortie = (save, destinationId, reason = 'dock') => {
    const ledger = active(save);
    if (!ledger)
        return null;
    if (destinationId)
        ledger.destinationId = destinationId;
    const summary = sortieSummary(save, ledger);
    if (!summary)
        return null;
    summary.completedAt = Math.max(0, finite(save.world.time));
    summary.events = normalizeEvents([...ledger.events, { kind: `finished-${reason}`, at: summary.completedAt }]);
    save.world.sortieHistory = [...normalizeSortieHistory(save.world.sortieHistory), summary].slice(-HISTORY_LIMIT);
    save.world.sortie = null;
    return summary;
};
