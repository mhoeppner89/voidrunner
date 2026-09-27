import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMissionOfferRefresher, offerCycleFromId } from '../src/game/missionOfferRefresh.js';

function fixture(ids = ['league-yard'], generator) {
    let generated = 0, synced = 0;
    const save = { world: { time: 750, offers: {} } };
    const refresh = createMissionOfferRefresher({ locationIds: ids,
        generateOffers(id, state) {
            generated++;
            return generator ? generator(id, state) : [{ id: `${id}-${Math.floor(state.world.time / 150)}-0-123`, deadline: state.world.time + 300 }];
        },
        syncAuthored(offers) { synced++; return [...offers, { id: 'story-next', authored: true }]; },
    });
    return { save, refresh, get generated() { return generated; }, get synced() { return synced; } };
}

for (const location of ['helix', 'league-yard', 'meridian-prime', 'gatehouse-twelve']) {
    test(`extract cycle after the FULL location prefix: ${location}`, () => {
        assert.equal(offerCycleFromId([{ id: `${location}-7-bounty-42` }], location), 7);
    });
}
test('race and authored IDs cannot accidentally supply a procedural cycle', () => {
    assert.equal(offerCycleFromId([{ id: 'race-5-run' }, { id: 'helix-4-story', authored: true }], 'helix'), undefined);
});
test('invalid cycle tokens are not coerced to zero', () => {
    for (const token of ['', '-1', 'NaN', '5x', '9007199254740992'])
        assert.equal(offerCycleFromId([{ id: `helix-${token}-0-1` }], 'helix'), undefined);
});
test('9000 ticks in one cycle generate a hyphenated board only once', () => {
    const f = fixture();
    for (let frame = 0; frame < 9000; frame++) {
        f.save.world.time = 750 + frame / 60;
        f.refresh(f.save);
    }
    assert.equal(f.generated, 1);
    assert.equal(f.save.world.offers['league-yard'][0].deadline, 1050);
});
test('cycle boundary regenerates once; subsequent ticks preserve identity', () => {
    const f = fixture(); f.refresh(f.save);
    f.save.world.time = 900; f.refresh(f.save);
    const offers = f.save.world.offers['league-yard'];
    for (let n = 0; n < 100; n++) f.refresh(f.save);
    assert.equal(f.generated, 2);
    assert.equal(f.save.world.offers['league-yard'], offers);
});
test('cycle zero works and is not confused with an absent cycle', () => {
    const f = fixture(); f.save.world.time = 0;
    f.refresh(f.save); f.refresh(f.save); assert.equal(f.generated, 1);
});
for (const [name, generator] of [
    ['empty', () => []], ['race-only', () => [{ id: 'race-azure-run' }]],
    ['authored-only', () => [{ id: 'story-first', authored: true }]],
]) test(`${name} generated boards are cached even without procedural IDs`, () => {
    const f = fixture(['league-yard'], generator);
    for (let n = 0; n < 100; n++) f.refresh(f.save);
    assert.equal(f.generated, 1);
});
test('valid legacy offers are adopted without resetting their deadlines', () => {
    const f = fixture();
    const existing = [{ id: 'league-yard-5-0-1', deadline: 800 }];
    f.save.world.offers['league-yard'] = existing;
    f.refresh(f.save);
    assert.equal(f.generated, 0); assert.equal(f.save.world.offers['league-yard'], existing);
});
test('authored dirty updates do not reroll procedural offers', () => {
    const f = fixture(); f.refresh(f.save);
    const offer = f.save.world.offers['league-yard'][0];
    f.save.world.localContractOffersDirty = true;
    f.refresh(f.save); f.refresh(f.save);
    assert.equal(f.generated, 1); assert.equal(f.synced, 1);
    assert.equal(f.save.world.offers['league-yard'][0], offer);
    assert.equal(f.save.world.localContractOffersDirty, undefined);
});
test('force refresh bypasses the cache', () => {
    const f = fixture(); f.refresh(f.save); f.refresh(f.save, true); f.refresh(f.save);
    assert.equal(f.generated, 2);
});
test('board array replacement is revalidated', () => {
    const f = fixture(); f.refresh(f.save);
    f.save.world.offers['league-yard'] = [{ id: 'league-yard-4-0-1' }];
    f.refresh(f.save); assert.equal(f.generated, 2);
});
test('accepting a mission by replacing a nonempty array does not reroll the rest', () => {
    const f = fixture();
    const keep = { id: 'league-yard-5-1-1' };
    f.save.world.offers['league-yard'] = [{ id: 'league-yard-5-0-1' }, keep];
    f.refresh(f.save);
    f.save.world.offers['league-yard'] = [keep];
    f.refresh(f.save); assert.equal(f.generated, 0);
});
test('different worlds never share cached board state', () => {
    const f = fixture(); f.refresh(f.save);
    f.refresh({ world: { time: 750, offers: {} } });
    assert.equal(f.generated, 2);
});
test('a failing generation can be retried without losing the dirty flag', () => {
    let fail = true;
    const f = fixture(['league-yard'], () => { if (fail) throw Error('test'); return []; });
    f.save.world.localContractOffersDirty = true;
    assert.throws(() => f.refresh(f.save), /test/);
    assert.equal(f.save.world.localContractOffersDirty, true);
    fail = false; f.refresh(f.save); f.refresh(f.save);
    assert.equal(f.generated, 2);
});
test('invalid factory configuration is rejected', () => {
    assert.throws(() => createMissionOfferRefresher({ locationIds: [], generateOffers() {}, syncAuthored() {}, cycleSeconds: 0 }), TypeError);
});

test('race dirty event refreshes race records without replacing ordinary offers', () => {
    const ordinary = { id: 'helix-5-0-1', deadline: 800 };
    const save = { world: { time: 750, offers: { helix: [ordinary, { id: 'race-course', kind: 'race', active: false }] } } };
    let raceSyncs = 0, generations = 0;
    const refresh = createMissionOfferRefresher({ locationIds: ['helix'],
        generateOffers() { generations++; return []; },
        syncAuthored: offers => offers,
        syncRaces(offers) { raceSyncs++; return [{ id: 'race-course', kind: 'race', active: true }, ...offers.filter(o => o.kind !== 'race')]; },
    });
    refresh(save); save.world.raceOffersDirty = true; refresh(save); refresh(save);
    assert.equal(generations, 0); assert.equal(raceSyncs, 1);
    assert.equal(save.world.offers.helix[1], ordinary);
    assert.equal(save.world.offers.helix[0].active, true);
    assert.equal(save.world.raceOffersDirty, undefined);
});
test('authored and race dirty events both run on the same stable board', () => {
    const ordinary = { id: 'helix-5-0-1' };
    const save = { world: { time: 750, offers: { helix: [ordinary, { id: 'race-course', kind: 'race' }] }, localContractOffersDirty: true, raceOffersDirty: true } };
    let authored = 0, races = 0;
    const refresh = createMissionOfferRefresher({ locationIds: ['helix'], generateOffers() { throw Error('unnecessary reroll'); },
        syncAuthored(offers) { authored++; return [...offers, { id: 'story', authored: true }]; },
        syncRaces(offers) { races++; return offers; },
    });
    refresh(save); refresh(save);
    assert.equal(authored, 1); assert.equal(races, 1);
    assert.equal(save.world.offers.helix.length, 3);
});
