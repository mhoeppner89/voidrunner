import assert from 'node:assert/strict';
import { COMMODITIES, SHIPS } from './data.js';
import {
    DRONE_BAY_CAPACITY,
    DRONE_RULES,
    DRONE_TYPES,
    createDroneFleet,
    createDroneUnit,
    droneBayLayoutFor,
    normalizeDroneBays,
} from './droneData.js';
import {
    advanceMiningCut,
    completeMiningCut,
    deliverMiningPayload,
    destroyMiningUnit,
    finishMiningRecall,
    miningCargoAvailable,
    miningRecallEligibility,
    miningReservedMass,
    miningReservedUnits,
    recallMining,
    reserveMiningJob,
    startMining,
    transitionMinerUnit,
} from './droneMining.js';
import { createPdcDroneController, destroyPdcDrone, PDC_DRONE_STEP } from './dronePdc.js';
import { commitDroneService, quoteDroneService } from './droneService.js';
import { createMiningDroneSystem, DRONE_SYSTEM_STEP } from './droneSystem.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const addUnit = (fleet, id, type = 'mining', changes = {}) => {
    const unit = { ...createDroneUnit(id, type), ...changes };
    fleet.unitsById[id] = unit;
    return unit;
};

const fleetWith = (units = []) => {
    const fleet = createDroneFleet();
    for (const [id, type, changes] of units) addUnit(fleet, id, type, changes);
    return fleet;
};

const miningContext = (overrides = {}) => ({
    unitIds: ['miner-1'],
    targetNodeKey: 'shardbelt:node-1',
    deposit: { remaining: 2 },
    scanned: true,
    distance: 50,
    commodityId: 'ore',
    unitMass: COMMODITIES.ore.mass,
    cargoMass: 5,
    cargoCapacity: 6,
    cargo: {},
    ...overrides,
});

const point = (position = [0, 0, 0], velocity = [0, 0, 0]) => ({ position, velocity });

const pdcContext = ({ unitIds, threats = [], inFlight = true, now = 0, assignments = new Map() }) => ({
    unitIds,
    ownerId: 'ship-1',
    shipPosition: [0, 0, 0],
    shipVelocity: [0, 0, 0],
    ownerRadius: 2,
    inFlight,
    now,
    threats,
    assignments,
    bayAnchors: Object.fromEntries(unitIds.map((id) => [id, {
        launch: point(),
        dock: point(),
    }])),
    escortAnchors: Object.fromEntries(unitIds.map((id) => [id, point()])),
});

const servicePlayer = ({ credits = 10000, bays, units = [], lockerIds = [], nextUnitId = 1 } = {}) => {
    const fleet = createDroneFleet();
    fleet.nextUnitId = nextUnitId;
    for (const [id, type, changes] of units) addUnit(fleet, id, type, changes);
    fleet.lockerIds = [...lockerIds];
    return {
        shipId: 'prospector',
        credits,
        droneFleet: fleet,
        outfitting: { loadouts: { prospector: { droneBays: bays } } },
    };
};

// Bay identity is fixed by hull. All non-drone hulls deliberately have no bays.
assert.equal(droneBayLayoutFor('wayfarer').length, 1, 'Wayfarer has one drone bay');
assert.equal(droneBayLayoutFor('prospector').length, 3, 'Prospector has three drone bays');
for (const shipId of ['talon', 'vanguard', 'lancer', 'atlas'])
    assert.equal(droneBayLayoutFor(shipId).length, 0, `${shipId} has no drone bays`);
assert.deepEqual(droneBayLayoutFor('wayfarer').map((bay) => bay.bayId), ['drone-1']);
assert.deepEqual(droneBayLayoutFor('prospector').map((bay) => bay.bayId), ['drone-1', 'drone-2', 'drone-3']);
assert.equal(DRONE_BAY_CAPACITY.mining, 2, 'a mining bay has two slots');
assert.equal(DRONE_BAY_CAPACITY.pdc, 1, 'a PDC bay has one slot');

const normalizedMixed = normalizeDroneBays('prospector', [
    { bayId: 'drone-1', mode: 'mining', unitIds: ['miner-a', 'miner-a', 'ignored'] },
    { bayId: 'drone-2', mode: 'pdc', unitIds: ['pdc-a', 'ignored'] },
    { bayId: 'wrong-bay', mode: 'invalid', unitIds: ['wrong-mode'] },
]);
assert.deepEqual(normalizedMixed, [
    { bayId: 'drone-1', mode: 'mining', unitIds: ['miner-a', null] },
    { bayId: 'drone-2', mode: 'pdc', unitIds: ['pdc-a'] },
    { bayId: 'drone-3', mode: 'mining', unitIds: [null, null] },
], 'normalization enforces mode capacities, bay identity and duplicate filtering');

const miningFleet = fleetWith([
    ['miner-1', 'mining'],
    ['miner-2', 'mining'],
]);
const exactContext = miningContext({ unitIds: ['miner-1', 'miner-2'] });
assert.equal(startMining(miningFleet, exactContext).code, 'started');
assert.equal(reserveMiningJob(miningFleet, 'miner-1', exactContext).code, 'job-reserved');
assert.equal(miningReservedMass(miningFleet), COMMODITIES.ore.mass, 'a job reserves one unit of cargo mass');
assert.equal(miningReservedUnits(miningFleet, exactContext.targetNodeKey), 1, 'a job reserves one deposit unit');
assert.equal(miningCargoAvailable(miningFleet, exactContext), 0, 'the exact cargo reservation leaves no free mass');
assert.equal(reserveMiningJob(miningFleet, 'miner-2', exactContext).code, 'cargo-full', 'another miner cannot overbook an exact hold');

assert.equal(transitionMinerUnit(miningFleet, 'miner-1', 'outbound').code, 'state-changed');
assert.equal(transitionMinerUnit(miningFleet, 'miner-1', 'mining').code, 'state-changed');
const minerOne = miningFleet.unitsById['miner-1'];
assert.equal(advanceMiningCut(miningFleet, 'miner-1', DRONE_TYPES.mining.cutSecondsPerUnit - 1, exactContext), null);
assert.equal(minerOne.job.cutTime, DRONE_TYPES.mining.cutSecondsPerUnit - 1, 'incomplete cutting only advances its timer');
const cut = advanceMiningCut(miningFleet, 'miner-1', 1, exactContext);
assert.equal(cut.code, 'cut-completed');
assert.equal(exactContext.deposit.remaining, 1, 'completed cutting decrements the live deposit exactly once');
assert.equal(minerOne.job, null);
assert.equal(minerOne.payload.packetId, 'drone-packet-1', 'completed cutting allocates a packet identity');
assert.equal(minerOne.state, 'returning');
assert.equal(miningReservedMass(miningFleet), COMMODITIES.ore.mass, 'the carried payload keeps its cargo reservation');

assert.equal(transitionMinerUnit(miningFleet, 'miner-1', 'docking').code, 'state-changed');
const delivered = deliverMiningPayload(miningFleet, 'miner-1', exactContext);
assert.equal(delivered.code, 'payload-delivered');
assert.equal(exactContext.cargo.ore, 1, 'payload delivery adds one commodity unit');
assert.equal(minerOne.payload, null, 'delivery clears the payload');
assert.equal(miningReservedMass(miningFleet), 0, 'delivery releases the exact cargo reservation');
assert.equal(transitionMinerUnit(miningFleet, 'miner-1', 'stowed').code, 'state-changed');

const recallFleet = fleetWith([['miner-recall', 'mining']]);
const recallContext = miningContext({ unitIds: ['miner-recall'], cargoMass: 0, cargoCapacity: 4 });
assert.equal(startMining(recallFleet, recallContext).code, 'started');
assert.equal(reserveMiningJob(recallFleet, 'miner-recall', recallContext).code, 'job-reserved');
assert.equal(miningRecallEligibility(recallFleet).code, 'can-recall');
const recall = recallMining(recallFleet, 'target-changed');
assert.equal(recall.code, 'recalling');
assert.equal(recall.cancelledJobs, 1, 'recall cancels uncut work');
assert.equal(recallFleet.unitsById['miner-recall'].job, null);
assert.equal(recallFleet.unitsById['miner-recall'].state, 'returning');
assert.equal(miningReservedMass(recallFleet), 0, 'recall releases uncut cargo reservation');
assert.equal(finishMiningRecall(recallFleet), null, 'recall waits for the unit to dock');
assert.equal(transitionMinerUnit(recallFleet, 'miner-recall', 'docking').code, 'state-changed');
assert.equal(transitionMinerUnit(recallFleet, 'miner-recall', 'stowed').code, 'state-changed');
assert.equal(finishMiningRecall(recallFleet).code, 'recall-completed');

const lossFleet = fleetWith([['miner-loss', 'mining']]);
const lossContext = miningContext({ unitIds: ['miner-loss'], cargoMass: 0, cargoCapacity: 2 });
assert.equal(startMining(lossFleet, lossContext).code, 'started');
assert.equal(reserveMiningJob(lossFleet, 'miner-loss', lossContext).code, 'job-reserved');
assert.equal(transitionMinerUnit(lossFleet, 'miner-loss', 'outbound').code, 'state-changed');
assert.equal(transitionMinerUnit(lossFleet, 'miner-loss', 'mining').code, 'state-changed');
lossFleet.unitsById['miner-loss'].job.cutTime = DRONE_TYPES.mining.cutSecondsPerUnit;
assert.equal(completeMiningCut(lossFleet, 'miner-loss', lossContext).code, 'cut-completed');
assert.equal(recallMining(lossFleet, 'miner-destroyed').code, 'recalling');
const minerLoss = destroyMiningUnit(lossFleet, 'miner-loss', 'collision');
assert.equal(minerLoss.code, 'miner-destroyed');
assert.equal(minerLoss.lostUnits, 1, 'destroying a loaded miner loses its carried unit');
assert.equal(minerLoss.releasedMass, COMMODITIES.ore.mass);
assert.equal(lossFleet.unitsById['miner-loss'].payload, null);
assert.equal(lossFleet.unitsById['miner-loss'].state, 'destroyed');
assert.equal(finishMiningRecall(lossFleet).code, 'recall-completed');

// The system advances a complete renderer-free cycle using only numeric anchors.
const systemFleet = fleetWith([['miner-system', 'mining']]);
const systemContext = miningContext({
    unitIds: ['miner-system'],
    deposit: { remaining: 1 },
    distance: 0,
    cargoMass: 0,
    cargoCapacity: COMMODITIES.ore.mass,
    shipPosition: [0, 0, 0],
    shipVelocity: [0, 0, 0],
});
systemContext.bayAnchors = { 'miner-system': { launch: point(), dock: point() } };
systemContext.workPoint = point();
assert.equal(startMining(systemFleet, systemContext).code, 'started');
const system = createMiningDroneSystem({ launchSeconds: 0, dockSeconds: 0 });
const systemEvents = [];
system.update(systemFleet, DRONE_SYSTEM_STEP, systemContext, systemEvents);
system.update(systemFleet, DRONE_SYSTEM_STEP, systemContext, systemEvents);
system.update(systemFleet, DRONE_SYSTEM_STEP, systemContext, systemEvents);
assert.equal(systemFleet.unitsById['miner-system'].state, 'mining');
systemFleet.unitsById['miner-system'].job.cutTime = DRONE_TYPES.mining.cutSecondsPerUnit - DRONE_SYSTEM_STEP;
system.update(systemFleet, DRONE_SYSTEM_STEP, systemContext, systemEvents);
assert.equal(systemFleet.unitsById['miner-system'].state, 'returning');
system.update(systemFleet, DRONE_SYSTEM_STEP, systemContext, systemEvents);
system.update(systemFleet, DRONE_SYSTEM_STEP, systemContext, systemEvents);
assert.equal(systemFleet.controller.phase, 'idle', 'the numeric-anchor cycle settles without renderer objects');
assert.equal(systemFleet.unitsById['miner-system'].state, 'stowed');
assert.equal(systemContext.cargo.ore, 1);
assert.equal(systemContext.deposit.remaining, 0);
assert.ok(systemEvents.some((event) => event.code === 'cut-completed'));
assert.ok(systemEvents.some((event) => event.code === 'payload-delivered'));
assert.ok(systemEvents.some((event) => event.code === 'recall-completed'));

const threat = (id, distance) => ({
    id,
    kind: 'missile',
    hostile: true,
    ownerId: 'enemy-1',
    targetId: 'ship-1',
    position: [distance, 0, 0],
    velocity: [-100, 0, 0],
});

const pdcFleet = fleetWith([
    ['pdc-b', 'pdc'],
    ['pdc-a', 'pdc'],
]);
const assignments = new Map();
const pdc = createPdcDroneController();
const pdcEvents = pdc.update(pdcFleet, PDC_DRONE_STEP, pdcContext({
    unitIds: ['pdc-b', 'pdc-a'],
    threats: [threat('z-threat', 80), threat('a-threat', 40)],
    assignments,
}), []);
const fires = pdcEvents.filter((event) => event.type === 'fire');
assert.deepEqual(fires.map((event) => [event.unitId, event.threatId]), [
    ['pdc-a', 'a-threat'],
    ['pdc-b', 'z-threat'],
], 'PDCs assign earliest impacts in stable unit order through one ledger');
assert.equal(pdcFleet.unitsById['pdc-a'].ammo, DRONE_TYPES.pdc.magazineCapacity - 1);
assert.equal(pdcFleet.unitsById['pdc-b'].ammo, DRONE_TYPES.pdc.magazineCapacity - 1);
assert.equal(assignments.get('a-threat').defenderId, 'pdc-a');
assert.equal(assignments.get('z-threat').defenderId, 'pdc-b');
assert.ok(fires.every((event) => Number.isFinite(event.flightTime) && Number.isFinite(event.assignedUntil)));

const finiteAmmoFleet = fleetWith([['pdc-ammo', 'pdc']]);
finiteAmmoFleet.unitsById['pdc-ammo'].ammo = 1;
const finitePdc = createPdcDroneController();
const finiteAssignments = new Map();
const finiteContext = pdcContext({
    unitIds: ['pdc-ammo'],
    threats: [threat('finite-threat', 40)],
    assignments: finiteAssignments,
});
const finiteFirst = finitePdc.update(finiteAmmoFleet, PDC_DRONE_STEP, finiteContext, []);
assert.equal(finiteAmmoFleet.unitsById['pdc-ammo'].ammo, 0, 'PDC ammo is finite');
assert.equal(finiteAmmoFleet.unitsById['pdc-ammo'].state, 'returning', 'empty PDC recalls');
assert.equal(finiteFirst.filter((event) => event.type === 'fire').length, 1);
assert.equal(finiteFirst.filter((event) => event.type === 'empty').length, 1);
const finiteSecond = finitePdc.update(finiteAmmoFleet, PDC_DRONE_STEP, {
    ...finiteContext,
    now: PDC_DRONE_STEP,
    threats: [],
}, []);
assert.equal(finiteAmmoFleet.unitsById['pdc-ammo'].portStage, 'enter');
finitePdc.update(finiteAmmoFleet, PDC_DRONE_STEP, {...finiteContext, threats: []}, []);
assert.equal(finiteAmmoFleet.unitsById['pdc-ammo'].state, 'stowed');
assert.equal(finiteSecond.filter((event) => event.type === 'empty').length, 0, 'empty notification is latched');

const recallPdcFleet = fleetWith([['pdc-recall', 'pdc']]);
const recallPdc = createPdcDroneController();
const recallPdcContext = pdcContext({ unitIds: ['pdc-recall'], threats: [] });
recallPdc.update(recallPdcFleet, PDC_DRONE_STEP, recallPdcContext, []);
const recallPdcEvents = recallPdc.update(recallPdcFleet, PDC_DRONE_STEP, {
    ...recallPdcContext,
    inFlight: false,
    now: PDC_DRONE_STEP,
}, []);
recallPdc.update(recallPdcFleet, PDC_DRONE_STEP, {...recallPdcContext,inFlight:false}, recallPdcEvents);
assert.equal(recallPdcFleet.unitsById['pdc-recall'].state, 'stowed');
assert.deepEqual(recallPdcEvents.filter((event) => event.type === 'recall').map((event) => event.stage), ['begin', 'stowed']);
const destroyedPdc = destroyPdcDrone(recallPdcFleet, 'pdc-recall', 'missile');
assert.equal(destroyedPdc.type, 'destroyed');
assert.equal(destroyedPdc.reason, 'missile');
assert.equal(recallPdcFleet.unitsById['pdc-recall'].hull, 0);
assert.equal(destroyPdcDrone(recallPdcFleet, 'pdc-recall'), null, 'PDC destruction is emitted only once');

const serviceBays = [
    { bayId: 'drone-1', mode: 'mining', unitIds: ['miner-service', null] },
    { bayId: 'drone-2', mode: 'pdc', unitIds: ['pdc-service'] },
    { bayId: 'drone-3', mode: 'pdc', unitIds: [null] },
];
const service = servicePlayer({
    bays: serviceBays,
    units: [
        ['miner-service', 'mining', { hull: 17 }],
        ['pdc-service', 'pdc', { hull: 30, ammo: 100 }],
        ['miner-locker', 'mining'],
        ['pdc-locker', 'pdc'],
    ],
    lockerIds: ['miner-locker', 'pdc-locker'],
});
const serviceQuote = quoteDroneService(service);
assert.equal(serviceQuote.ok, true);
assert.deepEqual(serviceQuote.lines.filter((line) => line.kind === 'replacement').map((line) => [
    line.bayId, line.position, line.type, line.source, line.unitId, line.cost,
]), [
    ['drone-1', 1, 'mining', 'locker', 'miner-locker', 0],
    ['drone-3', 0, 'pdc', 'locker', 'pdc-locker', 0],
], 'service uses compatible locker stock before purchasing replacements');
assert.deepEqual(serviceQuote.lines.filter((line) => line.kind === 'repair').map((line) => [line.unitId, line.quantity, line.cost]), [
    ['miner-service', 3, 15],
    ['pdc-service', 10, 50],
]);
assert.deepEqual(serviceQuote.lines.filter((line) => line.kind === 'rounds').map((line) => [line.unitId, line.quantity, line.cost]), [
    ['pdc-service', 20, 40],
]);
assert.equal(serviceQuote.total, 105, 'quote totals repairs and rearming atomically');
const serviceBefore = clone(service);
const serviceCommit = commitDroneService(service, { authorized: true, expected: serviceQuote });
assert.equal(serviceCommit.code, 'serviced');
assert.equal(service.credits, serviceBefore.credits - serviceQuote.total);
assert.deepEqual(service.droneFleet.lockerIds, []);
assert.deepEqual(service.outfitting.loadouts.prospector.droneBays, [
    { bayId: 'drone-1', mode: 'mining', unitIds: ['miner-service', 'miner-locker'] },
    { bayId: 'drone-2', mode: 'pdc', unitIds: ['pdc-service'] },
    { bayId: 'drone-3', mode: 'pdc', unitIds: ['pdc-locker'] },
]);
assert.equal(service.droneFleet.unitsById['miner-service'].hull, DRONE_TYPES.mining.maxHull);
assert.equal(service.droneFleet.unitsById['pdc-service'].hull, DRONE_TYPES.pdc.maxHull);
assert.equal(service.droneFleet.unitsById['pdc-service'].ammo, DRONE_TYPES.pdc.magazineCapacity);

const purchaseBays = [
    { bayId: 'drone-1', mode: 'mining', unitIds: [null, null] },
    { bayId: 'drone-2', mode: 'mining', unitIds: [null, null] },
    { bayId: 'drone-3', mode: 'mining', unitIds: [null, null] },
];
const poorService = servicePlayer({ credits: 1499, bays: purchaseBays });
const purchaseQuote = quoteDroneService(poorService);
assert.equal(purchaseQuote.lines.filter((line) => line.kind === 'replacement').length, 6);
assert.equal(purchaseQuote.total, 6 * DRONE_TYPES.mining.replacementPrice);
const poorBefore = clone(poorService);
assert.equal(commitDroneService(poorService, { authorized: true, expected: purchaseQuote }).code, 'insufficient-credits');
assert.deepEqual(poorService, poorBefore, 'insufficient credits do not partially create units or charge the player');

const staleService = servicePlayer({ credits: 5000, bays: purchaseBays });
const staleQuote = quoteDroneService(staleService);
staleService.droneFleet.nextUnitId++;
const staleBeforeCommit = clone(staleService);
assert.equal(commitDroneService(staleService, { authorized: true, expected: staleQuote }).code, 'stale-quote');
assert.deepEqual(staleService, staleBeforeCommit, 'a stale quote leaves ownership, loadout and credits unchanged');

// Ore calibration is intentionally pinned to the 0.8.2 benchmark: 32 one-mass
// Wayfarer units and a 315-credit base price.
assert.equal(COMMODITIES.ore.mass, 1.0, 'ore mass benchmark');
assert.equal(COMMODITIES.ore.basePrice, 315, 'ore base-price benchmark');
assert.equal(SHIPS.wayfarer.cargo / COMMODITIES.ore.mass, 32, 'a stock Wayfarer holds 32 ore units');
assert.equal(SHIPS.wayfarer.cargo * COMMODITIES.ore.basePrice, 10080, 'base-price haul benchmark');

console.log('all drone assertions passed');
