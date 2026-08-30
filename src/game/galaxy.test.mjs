import test from 'node:test';
import assert from 'node:assert/strict';
import {
    JUMP_ROUTES,
    LOCATIONS,
    SYSTEMS,
    cargoHoldValue,
    directlyConnectedRoutes,
    getLocation,
    getSystem,
    locationIdsForSystem,
    planRoute,
    routeBetweenSystems,
    routesForSystem,
    shortestSystemPath,
    systemById,
    systemHops,
    systemIdForLocation,
    jumpPiracyRisk,
} from './galaxy.js';

test('all systems are visible from the beginning and expose planned locations', () => {
    assert.deepEqual(Object.keys(SYSTEMS), ['helios-verge', 'meridian', 'redwake', 'pale-ring']);
    for (const system of Object.values(SYSTEMS)) {
        assert.equal(system.visible, true);
        assert.equal(system.visibleFromStart, true);
        assert.equal(system.discoveryRequired, false);
        assert.ok(Array.isArray(system.locationIds));
        assert.deepEqual(system.locationIds, system.locations);
    }
    assert.equal(SYSTEMS['helios-verge'].name, 'Helios Verge');
    assert.ok(SYSTEMS['helios-verge'].locationIds.includes('cairn'));
    assert.ok(SYSTEMS.meridian.locationIds.includes('meridian-verge-point'));
    assert.ok(SYSTEMS.meridian.locationIds.includes('verge-pale-point'));
    assert.ok(SYSTEMS.redwake.locationIds.includes('redwake-verge-point'));
    assert.ok(SYSTEMS['pale-ring'].locationIds.includes('pale-verge-point'));
    assert.ok(SYSTEMS['pale-ring'].locationIds.includes('verge-redwake-point'));
    assert.equal(systemById('meridian'), SYSTEMS.meridian);
    assert.equal(systemIdForLocation('cairn'), 'helios-verge');
    assert.equal(getLocation('cairn').name, 'Cairn Yard');
    assert.deepEqual(locationIdsForSystem('redwake'), SYSTEMS.redwake.locationIds);
});

test('jump routes are symmetric and use stable endpoint location IDs', () => {
    assert.equal(JUMP_ROUTES.length, 3);
    const expected = [
        ['helios-verge', 'meridian', 'verge-meridian-point', 'meridian-verge-point'],
        ['meridian', 'pale-ring', 'verge-pale-point', 'pale-verge-point'],
        ['pale-ring', 'redwake', 'verge-redwake-point', 'redwake-verge-point'],
    ];
    for (const [from, to, fromPoint, toPoint] of expected) {
        const route = routeBetweenSystems(from, to);
        assert.ok(route);
        assert.equal(route.fromSystemId, from);
        assert.equal(route.toSystemId, to);
        assert.deepEqual(route.endpointLocationIds, [fromPoint, toPoint]);
        assert.equal(route.endpoints[from], fromPoint);
        assert.equal(route.endpoints[to], toPoint);

        const reverse = routeBetweenSystems(to, from);
        assert.equal(reverse, route, 'the route edge is undirected');
        const reverseView = routesForSystem(to).find((candidate) => candidate.id === route.id);
        assert.ok(reverseView);
        assert.equal(reverseView.fromSystemId, to);
        assert.equal(reverseView.toSystemId, from);
        assert.deepEqual(reverseView.endpointLocationIds, [toPoint, fromPoint]);
        assert.equal(getLocation(fromPoint).routeId, route.id);
        assert.equal(getLocation(toPoint).routeId, route.id);
    }

    assert.deepEqual(directlyConnectedRoutes('helios-verge').map((route) => route.toSystemId), ['meridian']);
    assert.deepEqual(directlyConnectedRoutes('meridian').map((route) => route.toSystemId), ['helios-verge', 'pale-ring']);
    assert.deepEqual(directlyConnectedRoutes('pale-ring').map((route) => route.toSystemId), ['meridian', 'redwake']);
    assert.deepEqual(directlyConnectedRoutes('redwake').map((route) => route.toSystemId), ['pale-ring']);
});

test('shortest paths follow the Helios–Meridian–Pale Ring–Redwake corridor', () => {
    assert.deepEqual(shortestSystemPath('helios-verge', 'pale-ring'), ['helios-verge', 'meridian', 'pale-ring']);
    assert.deepEqual(shortestSystemPath('redwake', 'meridian'), ['redwake', 'pale-ring', 'meridian']);
    assert.deepEqual(shortestSystemPath('pale-ring', 'redwake'), ['pale-ring', 'redwake']);
    assert.deepEqual(shortestSystemPath('meridian', 'pale-ring'), ['meridian', 'pale-ring']);
    assert.deepEqual(shortestSystemPath('helios-verge', 'redwake'), ['helios-verge', 'meridian', 'pale-ring', 'redwake']);
    assert.deepEqual(shortestSystemPath('meridian', 'meridian'), ['meridian']);
    assert.equal(systemHops('redwake', 'meridian'), 2);
    assert.equal(systemHops('meridian', 'redwake'), 2);
    assert.equal(systemHops('meridian', 'pale-ring'), 1);
    assert.equal(systemHops('helios-verge', 'redwake'), 3);
});

test('remote route plans report jump points and zero travel cost', () => {
    const route = routeBetweenSystems('helios-verge', 'meridian');
    assert.equal(route.fuelCost, 0);
    assert.equal(route.creditCost, 0);
    assert.deepEqual(route.cost, { fuel: 0, credits: 0 });
    assert.deepEqual(route.jumpCost, { fuel: 0, credits: 0 });

    const plan = planRoute('helix', 'argent');
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.systemPath, ['helios-verge', 'meridian']);
    assert.deepEqual(plan.routeIds, ['verge-meridian']);
    assert.equal(plan.nextJumpPointId, 'verge-meridian-point');
    assert.equal(plan.jumpArrivalLocationId, 'meridian-verge-point');
    assert.equal(plan.destinationLocationId, 'argent');
    assert.equal(plan.requiresLocalTransfer, true);
    assert.deepEqual(plan.cost, { fuel: 0, credits: 0 });
    assert.equal(plan.fuelCost, 0);
    assert.equal(plan.creditCost, 0);

    const endToEnd = planRoute('helios-verge', 'redwake');
    assert.equal(endToEnd.ok, true);
    assert.deepEqual(endToEnd.systemPath, ['helios-verge', 'meridian', 'pale-ring', 'redwake']);
    assert.deepEqual(endToEnd.routeIds, ['verge-meridian', 'meridian-pale', 'pale-redwake']);
    assert.equal(endToEnd.nextJumpPointId, 'verge-meridian-point');
    assert.deepEqual(endToEnd.cost, { fuel: 0, credits: 0 });

    const local = planRoute('helix', 'cairn');
    assert.equal(local.ok, true);
    assert.equal(local.hops, 0);
    assert.deepEqual(local.systemPath, ['helios-verge']);
    assert.equal(local.arrivalLocationId, 'cairn');
    assert.deepEqual(local.cost, { fuel: 0, credits: 0 });
});

test('jump piracy pressure rises with cargo value and is greater on Redwake', () => {
    const empty = jumpPiracyRisk('verge-meridian', 0);
    const cheap = jumpPiracyRisk('verge-meridian', 100);
    const valuable = jumpPiracyRisk('verge-meridian', 5000);
    const redwake = jumpPiracyRisk('pale-redwake', 5000);
    assert.ok(empty >= 0 && empty < 0.1);
    assert.ok(cheap > empty);
    assert.ok(valuable > cheap);
    assert.ok(redwake > valuable);

    assert.equal(jumpPiracyRisk('verge-meridian', -100), empty, 'negative cargo is treated as empty');
    assert.equal(jumpPiracyRisk('verge-meridian', Number.NaN), empty, 'NaN cargo is treated as empty');
    assert.equal(jumpPiracyRisk('verge-meridian', Number.POSITIVE_INFINITY), empty, 'infinite cargo is clamped safely');
    assert.ok(jumpPiracyRisk('verge-meridian', 1e300) <= 1, 'very large cargo stays within the probability range');
    assert.equal(jumpPiracyRisk('pale-redwake', 1e300), 1, 'high-risk routes clamp to one');
    assert.equal(jumpPiracyRisk('pale-redwake', { cargoValue: 0 }), jumpPiracyRisk('pale-redwake', 0));
    assert.equal(jumpPiracyRisk(5000, 'pale-redwake'), redwake, 'cargo-first form is accepted');
    assert.equal(cargoHoldValue({ cargo: { gold: 2 } }, { unitValues: { gold: 900 } }), 1800);
});

test('invalid system, location, route, and plan inputs fail safely', () => {
    assert.equal(getSystem('not-a-system'), undefined);
    assert.equal(getSystem(null), undefined);
    assert.equal(getLocation('not-a-location'), undefined);
    assert.deepEqual(locationIdsForSystem('not-a-system'), []);
    assert.deepEqual(routesForSystem('not-a-system'), []);
    assert.equal(routeBetweenSystems('not-a-system', 'meridian'), undefined);
    assert.equal(shortestSystemPath('not-a-system', 'meridian'), null);
    assert.equal(systemHops('not-a-system', 'meridian'), null);

    const invalidOrigin = planRoute('not-a-location', 'meridian');
    assert.equal(invalidOrigin.ok, false);
    assert.equal(invalidOrigin.reason, 'invalid-origin');
    const invalidDestination = planRoute('helios-verge', 'not-a-system');
    assert.equal(invalidDestination.ok, false);
    assert.equal(invalidDestination.reason, 'invalid-destination');
    assert.equal(jumpPiracyRisk('not-a-route', 100000), 0);
    assert.equal(jumpPiracyRisk(null, null), 0);
});
