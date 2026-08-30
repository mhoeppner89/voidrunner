// Galaxy data and navigation helpers.
//
// This module deliberately owns no rendering or game-state code.  It is a
// small, JSON-shaped catalogue that can be consumed by the save, map, and
// flight layers without introducing a data.js dependency (and therefore no
// import cycle).

const deepFreeze = (value) => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value))
        return value;
    Object.freeze(value);
    for (const child of Object.values(value))
        deepFreeze(child);
    return value;
};

const SYSTEM_DEFINITIONS = {
    'helios-verge': {
        id: 'helios-verge',
        name: 'Helios Verge',
        displayName: 'Helios Verge',
        shortName: 'HELIOS',
        visible: true,
        visibleFromStart: true,
        discoveryRequired: false,
        character: 'frontier crossroads',
        economicRole: 'raw materials and regional trade',
        locations: [
            'helix',
            'rook',
            'vesper',
            'azure',
            'shardbelt',
            'mourning-line',
            'cairn',
            'verge-meridian-point',
        ],
    },
    meridian: {
        id: 'meridian',
        name: 'Meridian',
        displayName: 'Meridian',
        shortName: 'MERIDIAN',
        visible: true,
        visibleFromStart: true,
        discoveryRequired: false,
        character: 'wealthy and regulated',
        economicRole: 'manufacturing and consumption',
        locations: [
            'meridian-prime',
            'argent',
            'gatehouse-twelve',
            'foundry-lanes',
            'meridian-verge-point',
            'verge-pale-point',
        ],
    },
    redwake: {
        id: 'redwake',
        name: 'Redwake',
        displayName: 'Redwake',
        shortName: 'REDWAKE',
        visible: true,
        visibleFromStart: true,
        discoveryRequired: false,
        character: 'sparse and lawless',
        economicRole: 'contraband and scarce goods',
        locations: [
            'blackglass',
            'cinder',
            'torchwell',
            'redwake-belt',
            'redwake-verge-point',
        ],
    },
    'pale-ring': {
        id: 'pale-ring',
        name: 'Pale Ring',
        displayName: 'Pale Ring',
        shortName: 'PALE RING',
        visible: true,
        visibleFromStart: true,
        discoveryRequired: false,
        character: 'remote and unexplored',
        economicRole: 'science and specialist resources',
        locations: [
            'nacre',
            'boreal',
            'shepherd',
            'pale-rings',
            'pale-verge-point',
            'verge-redwake-point',
        ],
    },
};

// The location catalogue is intentionally independent of data.js.  Existing
// locations are represented by their stable IDs here, while the game can
// continue to use the richer rendering/economy records from data.js until
// the galaxy migration is complete.
const LOCATION_DEFINITIONS = {
    helix: { id: 'helix', name: 'Helix Freeport', kind: 'station', systemId: 'helios-verge', major: true, services: ['market', 'missions', 'repairs', 'fuel', 'ships', 'outfitting'] },
    rook: { id: 'rook', name: 'Rookhaven Bastion', kind: 'station', systemId: 'helios-verge', major: true, services: ['market', 'missions', 'repairs', 'fuel', 'ships', 'bounties'] },
    vesper: { id: 'vesper', name: 'Vesper Colony', kind: 'planet', systemId: 'helios-verge', major: true, services: ['market', 'missions', 'repairs', 'fuel'] },
    azure: { id: 'azure', name: 'Azure Reach', kind: 'planet', systemId: 'helios-verge', major: true, services: ['market', 'missions', 'repairs', 'fuel'] },
    shardbelt: { id: 'shardbelt', name: 'The Shardbelt', kind: 'field', systemId: 'helios-verge', major: false, services: ['mining', 'missions'] },
    'mourning-line': { id: 'mourning-line', name: 'Mourning Line', kind: 'graveyard', systemId: 'helios-verge', major: false, services: ['salvage', 'missions', 'racing'] },
    cairn: { id: 'cairn', name: 'Cairn Yard', kind: 'station', systemId: 'helios-verge', major: false, services: ['fuel', 'repairs', 'racing'] },

    'meridian-prime': { id: 'meridian-prime', name: 'Meridian Prime', kind: 'planet', systemId: 'meridian', major: true, services: ['market', 'missions', 'repairs', 'fuel'] },
    argent: { id: 'argent', name: 'Argent Shipworks', kind: 'station', systemId: 'meridian', major: true, services: ['market', 'missions', 'repairs', 'fuel', 'ships', 'outfitting'] },
    'gatehouse-twelve': { id: 'gatehouse-twelve', name: 'Gatehouse Twelve', kind: 'station', systemId: 'meridian', major: false, services: ['fuel', 'repairs', 'customs'] },
    'foundry-lanes': { id: 'foundry-lanes', name: 'The Foundry Lanes', kind: 'field', systemId: 'meridian', major: false, services: ['missions'] },

    blackglass: { id: 'blackglass', name: 'Blackglass', kind: 'settlement', systemId: 'redwake', major: true, services: ['market', 'missions', 'repairs', 'fuel', 'bounties'] },
    cinder: { id: 'cinder', name: 'Cinder Station', kind: 'station', systemId: 'redwake', major: true, services: ['market', 'missions', 'repairs', 'fuel'] },
    torchwell: { id: 'torchwell', name: 'Torchwell', kind: 'station', systemId: 'redwake', major: false, services: ['fuel', 'repairs'] },
    'redwake-belt': { id: 'redwake-belt', name: 'Redwake Belt', kind: 'field', systemId: 'redwake', major: false, services: ['missions', 'bounties'] },

    nacre: { id: 'nacre', name: 'Nacre Station', kind: 'station', systemId: 'pale-ring', major: true, services: ['market', 'missions', 'repairs', 'fuel', 'research'] },
    boreal: { id: 'boreal', name: 'Boreal', kind: 'planet', systemId: 'pale-ring', major: true, services: ['market', 'missions', 'repairs', 'fuel'] },
    shepherd: { id: 'shepherd', name: 'Shepherd Relay', kind: 'station', systemId: 'pale-ring', major: false, services: ['fuel', 'repairs', 'navigation'] },
    'pale-rings': { id: 'pale-rings', name: 'The Pale Rings', kind: 'field', systemId: 'pale-ring', major: false, services: ['missions', 'research'] },
};

const routeDefinition = (id, fromSystemId, toSystemId, fromLocationId, toLocationId, pirateMultiplier = 1) => ({
    id,
    from: fromSystemId,
    to: toSystemId,
    fromSystemId,
    toSystemId,
    sourceSystemId: fromSystemId,
    destinationSystemId: toSystemId,
    systemIds: [fromSystemId, toSystemId],
    fromLocationId,
    toLocationId,
    endpointLocationIds: [fromLocationId, toLocationId],
    endpoints: {
        [fromSystemId]: fromLocationId,
        [toSystemId]: toLocationId,
    },
    // Inter-system jumps consume no fuel and buy no credits.  These flat
    // fields make the zero-cost rule easy for callers to inspect, while the
    // nested form is convenient when summing a multi-jump plan.
    fuelCost: 0,
    creditCost: 0,
    creditsCost: 0,
    cost: { fuel: 0, credits: 0 },
    jumpCost: { fuel: 0, credits: 0 },
    pirateMultiplier,
});

const ROUTE_DEFINITIONS = [
    routeDefinition('verge-meridian', 'helios-verge', 'meridian', 'verge-meridian-point', 'meridian-verge-point'),
    routeDefinition('meridian-pale', 'meridian', 'pale-ring', 'verge-pale-point', 'pale-verge-point'),
    routeDefinition('pale-redwake', 'pale-ring', 'redwake', 'verge-redwake-point', 'redwake-verge-point', 1.85),
];

const jumpPoint = (id, systemId, routeId, pairedLocationId) => ({
    id,
    name: 'Jump point',
    kind: 'jump-point',
    systemId,
    routeId,
    pairedLocationId,
    major: false,
    services: ['navigation'],
});

Object.assign(LOCATION_DEFINITIONS, {
    'verge-meridian-point': jumpPoint('verge-meridian-point', 'helios-verge', 'verge-meridian', 'meridian-verge-point'),
    'meridian-verge-point': jumpPoint('meridian-verge-point', 'meridian', 'verge-meridian', 'verge-meridian-point'),
    // Keep the six endpoint IDs stable for existing careers. Their system and
    // route metadata now form a four-system chain instead of a Helios hub.
    'verge-pale-point': jumpPoint('verge-pale-point', 'meridian', 'meridian-pale', 'pale-verge-point'),
    'pale-verge-point': jumpPoint('pale-verge-point', 'pale-ring', 'meridian-pale', 'verge-pale-point'),
    'verge-redwake-point': jumpPoint('verge-redwake-point', 'pale-ring', 'pale-redwake', 'redwake-verge-point'),
    'redwake-verge-point': jumpPoint('redwake-verge-point', 'redwake', 'pale-redwake', 'verge-redwake-point'),
});

// `locationIds` is the integration-facing name.  Keep `locations` as a
// readable alias for consumers that treat a system record as a catalogue.
for (const system of Object.values(SYSTEM_DEFINITIONS))
    system.locationIds = system.locations.slice();

// Public definitions are frozen so a caller cannot accidentally alter route
// topology for the rest of a session.  They remain ordinary JSON data.
export const SYSTEMS = deepFreeze(SYSTEM_DEFINITIONS);
export const LOCATIONS = deepFreeze(LOCATION_DEFINITIONS);
export const JUMP_ROUTES = deepFreeze(ROUTE_DEFINITIONS);
export const SYSTEM_IDS = Object.freeze(Object.keys(SYSTEMS));
export const LOCATION_IDS = Object.freeze(Object.keys(LOCATIONS));
export const ROUTE_IDS = Object.freeze(JUMP_ROUTES.map((route) => route.id));

// Descriptive aliases keep the data catalogue pleasant to consume from code
// that uses either "route" or "location" terminology.
export const GALAXY_SYSTEMS = SYSTEMS;
export const GALAXY_LOCATIONS = LOCATIONS;
export const ROUTES = JUMP_ROUTES;
export const JUMP_ROUTE_BY_ID = Object.freeze(Object.fromEntries(JUMP_ROUTES.map((route) => [route.id, route])));
export const JUMP_POINTS = Object.freeze(Object.fromEntries(
    Object.entries(LOCATIONS).filter(([, location]) => location.kind === 'jump-point'),
));

const asString = (value) => typeof value === 'string' && value.length > 0 ? value : undefined;
const numberOrUndefined = (value) => {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string' || value.trim() === '')
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const nonNegativeNumber = (value, fallback = 0) => {
    const parsed = numberOrUndefined(value);
    return parsed === undefined ? fallback : Math.max(0, parsed);
};
const clamp01 = (value) => Math.max(0, Math.min(1, nonNegativeNumber(value)));

const inputId = (input, key) => {
    if (typeof input === 'string')
        return input;
    if (!input || typeof input !== 'object')
        return undefined;
    return asString(input[key]);
};

export const getSystem = (systemId) => {
    const id = inputId(systemId, 'systemId') ?? asString(systemId);
    return id ? SYSTEMS[id] : undefined;
};

export const systemById = getSystem;

export const hasSystem = (systemId) => Boolean(getSystem(systemId));
export const isKnownSystem = hasSystem;
export const isSystemVisible = (systemId) => Boolean(getSystem(systemId)?.visibleFromStart ?? getSystem(systemId)?.visible);

export const getLocation = (locationId) => {
    const id = inputId(locationId, 'locationId') ?? asString(locationId);
    return id ? LOCATIONS[id] : undefined;
};

export const hasLocation = (locationId) => Boolean(getLocation(locationId));

const systemIdFromInput = (input) => {
    const direct = asString(input);
    if (direct && SYSTEMS[direct])
        return direct;
    if (direct && LOCATIONS[direct])
        return LOCATIONS[direct].systemId;
    if (input && typeof input === 'object') {
        const systemId = asString(input.systemId);
        if (systemId && SYSTEMS[systemId])
            return systemId;
        const locationId = asString(input.locationId) ?? asString(input.id);
        if (locationId && LOCATIONS[locationId])
            return LOCATIONS[locationId].systemId;
    }
    return undefined;
};

export const systemIdForLocation = (locationId) => getLocation(locationId)?.systemId;
export const locationSystemId = systemIdForLocation;
export const getSystemForLocation = (locationId) => {
    const systemId = systemIdForLocation(locationId);
    return systemId ? SYSTEMS[systemId] : undefined;
};

export const locationIdsForSystem = (systemId) => {
    const id = systemIdFromInput(systemId);
    return id ? SYSTEMS[id].locations.slice() : [];
};

export const locationsForSystem = (systemId) => locationIdsForSystem(systemId)
    .map((locationId) => LOCATIONS[locationId])
    .filter(Boolean);

export const getLocationsForSystem = locationsForSystem;
export const locationsBySystem = (systemId) => locationsForSystem(systemId);
export const groupLocationsBySystem = () => Object.fromEntries(
    SYSTEM_IDS.map((systemId) => [systemId, locationIdsForSystem(systemId)]),
);

const routeById = (routeId) => JUMP_ROUTES.find((route) => route.id === routeId);
const routeReferenceId = (reference) => {
    if (typeof reference === 'string')
        return reference;
    if (!reference || typeof reference !== 'object')
        return undefined;
    return asString(reference.routeId) ?? asString(reference.id);
};

const routeMatchesSystems = (route, first, second) =>
    (route.fromSystemId === first && route.toSystemId === second) ||
    (route.fromSystemId === second && route.toSystemId === first);

export const routeBetween = (first, second) => {
    const firstSystemId = systemIdFromInput(first);
    const secondSystemId = systemIdFromInput(second);
    if (!firstSystemId || !secondSystemId || firstSystemId === secondSystemId)
        return undefined;
    return JUMP_ROUTES.find((route) => routeMatchesSystems(route, firstSystemId, secondSystemId));
};

export const routeBetweenSystems = routeBetween;

export const getRoute = (reference, second) => {
    const referenceId = routeReferenceId(reference);
    if (referenceId) {
        const exact = routeById(referenceId);
        if (exact)
            return exact;
        const endpointRoute = JUMP_ROUTES.find((route) => route.endpointLocationIds.includes(referenceId));
        if (endpointRoute)
            return endpointRoute;
    }
    if (second !== undefined)
        return routeBetween(reference, second);
    if (reference && typeof reference === 'object')
        return routeBetween(reference.fromSystemId ?? reference.from, reference.toSystemId ?? reference.to);
    return undefined;
};

const orientedRoute = (route, originSystemId) => {
    if (!route || route.fromSystemId === originSystemId)
        return route;
    if (route.toSystemId !== originSystemId)
        return undefined;
    return {
        ...route,
        from: route.toSystemId,
        to: route.fromSystemId,
        fromSystemId: route.toSystemId,
        toSystemId: route.fromSystemId,
        sourceSystemId: route.toSystemId,
        destinationSystemId: route.fromSystemId,
        fromLocationId: route.toLocationId,
        toLocationId: route.fromLocationId,
        systemIds: [route.toSystemId, route.fromSystemId],
        endpointLocationIds: [route.toLocationId, route.fromLocationId],
        endpoints: {
            [route.toSystemId]: route.toLocationId,
            [route.fromSystemId]: route.fromLocationId,
        },
    };
};

export const directlyConnectedRoutes = (systemId) => {
    const id = systemIdFromInput(systemId);
    if (!id)
        return [];
    return JUMP_ROUTES
        .filter((route) => route.fromSystemId === id || route.toSystemId === id)
        .map((route) => orientedRoute(route, id));
};

export const connectedRoutes = directlyConnectedRoutes;
export const routesForSystem = directlyConnectedRoutes;
export const directRoutesFrom = directlyConnectedRoutes;
export const directlyConnectedSystems = (systemId) => directlyConnectedRoutes(systemId)
    .map((route) => route.toSystemId);
export const neighborsOf = directlyConnectedSystems;

const routeBetweenIds = (firstSystemId, secondSystemId) => {
    const route = routeBetween(firstSystemId, secondSystemId);
    return route ? orientedRoute(route, firstSystemId) : undefined;
};

export const shortestSystemPath = (from, to) => {
    const fromSystemId = systemIdFromInput(from);
    const toSystemId = systemIdFromInput(to);
    if (!fromSystemId || !toSystemId)
        return null;
    if (fromSystemId === toSystemId)
        return [fromSystemId];

    const queue = [fromSystemId];
    const previous = new Map([[fromSystemId, null]]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        for (const neighbor of directlyConnectedSystems(current)) {
            if (previous.has(neighbor))
                continue;
            previous.set(neighbor, current);
            queue.push(neighbor);
            if (neighbor === toSystemId)
                break;
        }
        if (previous.has(toSystemId))
            break;
    }
    if (!previous.has(toSystemId))
        return null;

    const path = [];
    for (let current = toSystemId; current !== null; current = previous.get(current))
        path.push(current);
    path.reverse();
    return path;
};

export const shortestPath = shortestSystemPath;
export const findShortestPath = shortestSystemPath;

export const shortestRoutePath = (from, to) => {
    const path = shortestSystemPath(from, to);
    if (!path)
        return null;
    const routes = [];
    for (let index = 1; index < path.length; index += 1)
        routes.push(routeBetweenIds(path[index - 1], path[index]));
    return routes;
};

export const systemHops = (from, to) => {
    const path = shortestSystemPath(from, to);
    return path ? path.length - 1 : null;
};

export const shortestSystemHops = systemHops;
export const hopsBetweenSystems = systemHops;
export const shortestHops = systemHops;

const zeroCost = () => ({ fuel: 0, credits: 0 });

const planFailure = (reason, origin, destination) => ({
    ok: false,
    valid: false,
    reason,
    error: reason,
    origin,
    destination,
    originSystemId: systemIdFromInput(origin) ?? null,
    destinationSystemId: systemIdFromInput(destination) ?? null,
    systemPath: null,
    routes: [],
    hopCount: null,
    hops: null,
    cost: zeroCost(),
    fuelCost: 0,
    creditCost: 0,
});

// Plan a trip from a system or location to another system or location.  The
// final location is optional: when it is a station inside the destination
// system, the plan reports the jump-point arrival separately so the caller can
// follow it with an ordinary local hyperdrive trip.
export const planRemoteDestination = (origin, destination, options = {}) => {
    if (destination === undefined && origin && typeof origin === 'object') {
        destination = origin.destination ?? origin.to ?? origin.destinationId;
        origin = origin.origin ?? origin.from ?? origin.originId;
    }
    const originSystemId = systemIdFromInput(origin);
    const destinationSystemId = systemIdFromInput(destination);
    if (!originSystemId)
        return planFailure('invalid-origin', origin, destination);
    if (!destinationSystemId)
        return planFailure('invalid-destination', origin, destination);

    const originLocationId = getLocation(origin)?.id;
    const destinationLocationId = getLocation(destination)?.id;
    const systemPath = shortestSystemPath(originSystemId, destinationSystemId);
    if (!systemPath)
        return planFailure('unreachable-destination', origin, destination);

    const routes = shortestRoutePath(originSystemId, destinationSystemId) ?? [];
    const firstRoute = routes.length > 0 ? routes[0] : null;
    const lastRoute = routes.length > 0 ? routes[routes.length - 1] : null;
    const jumpArrivalLocationId = lastRoute?.toLocationId ?? null;
    const localDestinationId = destinationLocationId ?? null;
    const useDestinationLocation = options && options.arriveAtDestination === true;
    return {
        ok: true,
        valid: true,
        origin,
        destination,
        originSystemId,
        destinationSystemId,
        originLocationId: originLocationId ?? null,
        destinationLocationId: localDestinationId,
        systemPath,
        systems: systemPath.map((systemId) => SYSTEMS[systemId]),
        routes,
        routeIds: routes.map((route) => route.id),
        hopCount: routes.length,
        hops: routes.length,
        firstRoute,
        nextRoute: firstRoute,
        nextSystemId: systemPath.length > 1 ? systemPath[1] : null,
        nextJumpPointId: firstRoute?.fromLocationId ?? null,
        jumpArrivalLocationId,
        arrivalLocationId: systemPath.length === 1 && localDestinationId
            ? localDestinationId
            : (useDestinationLocation && localDestinationId ? localDestinationId : jumpArrivalLocationId),
        requiresLocalTransfer: Boolean(localDestinationId && localDestinationId !== jumpArrivalLocationId),
        cost: zeroCost(),
        fuelCost: 0,
        creditCost: 0,
    };
};

export const planRemoteTrip = planRemoteDestination;
export const planInterSystemTravel = planRemoteDestination;
export const planJump = planRemoteDestination;
export const planRoute = planRemoteDestination;

const routeFromPressureReference = (reference) => {
    if (reference && typeof reference === 'object' && reference.id && reference.fromSystemId && reference.toSystemId)
        return getRoute(reference);
    const exact = getRoute(reference);
    if (exact)
        return exact;
    const systemId = systemIdFromInput(reference);
    if (!systemId)
        return undefined;
    const routes = directlyConnectedRoutes(systemId);
    return routes.length === 1 ? routes[0] : undefined;
};

const looksLikeRouteReference = (value) => {
    if (typeof value !== 'string')
        return Boolean(value && typeof value === 'object' && (value.routeId || (value.fromSystemId && value.toSystemId)));
    return Boolean(getRoute(value) || SYSTEMS[value] || LOCATIONS[value]);
};

const itemValue = (item, unitValues = {}) => {
    if (typeof item === 'number')
        return Math.max(0, Number.isFinite(item) ? item : 0);
    if (!item || typeof item !== 'object')
        return 0;
    const total = numberOrUndefined(item.totalValue ?? item.total ?? item.value);
    if (total !== undefined && item.units === undefined && item.quantity === undefined)
        return Math.max(0, total);
    const units = nonNegativeNumber(item.units ?? item.quantity ?? item.count, 1);
    const unit = numberOrUndefined(item.unitValue ?? item.unitPrice ?? item.price ?? item.valuePerUnit);
    if (unit !== undefined)
        return units * Math.max(0, unit);
    return units * Math.max(0, numberOrUndefined(unitValues[item.commodityId ?? item.id]) ?? 1);
};

// Read a value from the common player/manifest shapes without importing the
// economy catalogue.  A caller can pass `unitValues` when a cargo quantity
// map needs to be converted to credits.
export const cargoHoldValue = (input, options = {}) => {
    const direct = numberOrUndefined(input);
    if (direct !== undefined)
        return Math.max(0, direct);
    if (!input || typeof input !== 'object')
        return 0;

    for (const key of ['cargoValue', 'holdValue', 'manifestValue', 'cargoCredits', 'totalCargoValue']) {
        const value = numberOrUndefined(input[key]);
        if (value !== undefined)
            return Math.max(0, value);
    }

    const unitValues = options && typeof options.unitValues === 'object' ? options.unitValues : {};
    let total = 0;
    if (Array.isArray(input.sealedCargo))
        for (const item of input.sealedCargo)
            total += itemValue(item, unitValues);
    if (Array.isArray(input.cargo))
        for (const item of input.cargo)
            total += itemValue(item, unitValues);
    else if (input.cargo && typeof input.cargo === 'object') {
        for (const [commodityId, quantity] of Object.entries(input.cargo)) {
            const unitValue = numberOrUndefined(unitValues[commodityId]);
            if (quantity && typeof quantity === 'object')
                total += itemValue({ ...quantity, commodityId }, unitValues);
            else
                total += nonNegativeNumber(quantity) * Math.max(0, unitValue ?? 1);
        }
    }
    return Math.max(0, Number.isFinite(total) ? total : 0);
};

export const cargoValue = cargoHoldValue;

const pressureArgs = (routeReference, cargoInput, options) => {
    // Accept both `(route, cargo)` and the natural-language-shaped
    // `(cargo, route)` form.  The former remains the documented form.
    if (!looksLikeRouteReference(routeReference) && looksLikeRouteReference(cargoInput))
        return { routeReference: cargoInput, cargoInput: routeReference, options: options ?? {} };
    return { routeReference, cargoInput, options: options ?? {} };
};

const pressureDetails = (routeReference, cargoInput, options = {}) => {
    const args = pressureArgs(routeReference, cargoInput, options);
    const route = routeFromPressureReference(args.routeReference);
    const holdValue = cargoHoldValue(args.cargoInput, args.options);
    if (!route) {
        return {
            routeId: null,
            cargoValue: holdValue,
            proximity: 0,
            basePressure: 0,
            routeMultiplier: 0,
            pressure: 0,
            risk: 0,
            interceptChance: 0,
        };
    }

    const configuredScale = numberOrUndefined(args.options.valueScale ?? args.options.cargoValueScale);
    const valueScale = configuredScale !== undefined && configuredScale > 0 ? configuredScale : 5000;
    // A saturating curve keeps normal holds readable while guaranteeing that
    // more valuable cargo never lowers the pressure.
    const cargoFraction = holdValue <= 0 ? 0 : holdValue / (holdValue + valueScale);
    const basePressure = 0.025 + cargoFraction * 0.55;
    const routeMultiplier = nonNegativeNumber(route.pirateMultiplier, 1) || 1;
    let proximity = numberOrUndefined(args.options.proximity ?? args.options.jumpPointProximity);
    if (proximity === undefined)
        proximity = args.options.atJumpPoint === false ? 0.55 : 1;
    proximity = clamp01(proximity);
    const pressure = clamp01(basePressure * routeMultiplier * proximity);
    return {
        routeId: route.id,
        route,
        cargoValue: holdValue,
        cargoFraction,
        proximity,
        basePressure,
        routeMultiplier,
        pressure,
        risk: pressure,
        interceptChance: pressure,
    };
};

export const piratePressureDetails = pressureDetails;
export const cargoPiratePressure = (routeReference, cargoInput, options = {}) => pressureDetails(routeReference, cargoInput, options).pressure;
export const piratePressureAtJumpPoint = cargoPiratePressure;
export const pirateInterceptRisk = cargoPiratePressure;
export const piratePressureForCargo = (cargoInput, routeReference, options = {}) => cargoPiratePressure(routeReference, cargoInput, options);
export const jumpPiracyRisk = cargoPiratePressure;
