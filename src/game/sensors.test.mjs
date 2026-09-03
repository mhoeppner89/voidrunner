import assert from 'node:assert/strict';
import {
    SENSOR_CONTACT_THRESHOLD,
    SENSOR_TRACK_THRESHOLD,
    addEmissionHeat,
    awarenessState,
    baseSignatureForVariant,
    npcPhysicalSignatureRange,
    physicalSignatureRange,
    signatureBand,
    stepDriveHeat,
    stepEmissionHeat,
    stepSensorAwareness,
} from './sensors.js';

assert.ok(baseSignatureForVariant('atlas-freighter') > baseSignatureForVariant('talon'));

let driveHeat = 0;
for (let i = 0; i < 60; i += 1)
    driveHeat = stepDriveHeat(driveHeat, 1, true, 1 / 60);
assert.ok(driveHeat > 350, 'afterburn should quickly make the drive conspicuous');
const hot = driveHeat;
for (let i = 0; i < 120; i += 1)
    driveHeat = stepDriveHeat(driveHeat, 0, false, 1 / 60);
assert.ok(driveHeat < hot && driveHeat > 0, 'cutting thrust should cool gradually while coasting');

let emission = addEmissionHeat(0, 220);
emission = stepEmissionHeat(emission, 1);
assert.equal(emission, 142);

const quiet = physicalSignatureRange({ variant: 'talon' });
const working = physicalSignatureRange({ variant: 'talon', utilityActive: true });
assert.ok(working > quiet);
assert.ok(npcPhysicalSignatureRange({ variant: 'talon', speed: 30, maxSpeed: 40, burning: true })
    > npcPhysicalSignatureRange({ variant: 'talon', speed: 30, maxSpeed: 40 }), 'NPC afterburn should enlarge its physical signature');
assert.equal(signatureBand(quiet), 'low');
assert.equal(signatureBand(850), 'high');

let awareness = 0;
for (let i = 0; i < 300; i += 1)
    awareness = stepSensorAwareness(awareness, quiet * 0.72, quiet, false, false, 1 / 60);
assert.ok(awareness >= SENSOR_TRACK_THRESHOLD, 'a sustained dark contact should become trackable');
assert.equal(awarenessState(awareness) === 'tracked' || awarenessState(awareness) === 'identified', true);

const lit = stepSensorAwareness(0, 800, 1000, false, true, 1 / 60);
assert.equal(lit, 1, 'a clear transponder signal should resolve identity immediately');

let hidden = Math.max(SENSOR_CONTACT_THRESHOLD, awareness);
for (let i = 0; i < 300; i += 1)
    hidden = stepSensorAwareness(hidden, 100, quiet, true, false, 1 / 60);
assert.ok(hidden < SENSOR_CONTACT_THRESHOLD, 'cover should eventually break the contact');

console.log('sensor model: 13 checks passed');
