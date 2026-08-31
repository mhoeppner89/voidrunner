import assert from 'node:assert/strict';
import {
    acceptMission,
    awardCareerProgress,
    completeBountyMission,
    completeMissionsAtDock,
    failExpiredMissions,
    generateMissionOffers,
    guildJoinCost,
    joinGuild,
    refreshMissionOffers,
} from './missions.js';
import { cargoMass, SYNDICATE_DEN_FAVOR } from './economy.js';
import { LOCATIONS } from './data.js';
import { createNewSave, hydrateSave } from './save.js';

const fresh = (seed = 0x51a7e) => createNewSave(seed);

// Keep lifecycle fixtures shaped like generated offers. The mission module
// intentionally has no factory for hand-authored contracts, so these fixtures
// exercise the same public accept/complete/fail APIs without coupling tests to
// one particular procedural roll.
const fixture = (overrides = {}) => ({
    id: 'helix-0-0-fixture',
    kind: 'delivery',
    title: 'Fixture contract',
    issuer: 'Test desk',
    origin: 'helix',
    destination: 'rook',
    commodity: 'food',
    quantity: 2,
    reward: 1200,
    deposit: 100,
    deadline: 100,
    status: 'offered',
    guild: 'merchant',
    guildRep: 6,
    faction: 'free-merchants',
    ...overrides,
});

const postOffer = (save, locationId, offer) => {
    save.world.offers[locationId] = [offer];
    return offer;
};

const projection = (offers) => offers.map((offer) => ({
    id: offer.id,
    kind: offer.kind,
    origin: offer.origin,
    destination: offer.destination,
    targetZone: offer.targetZone,
    commodity: offer.commodity,
    quantity: offer.quantity,
    claimNodeId: offer.claimNodeId,
    reward: offer.reward,
    deposit: offer.deposit,
    deadline: offer.deadline,
    guild: offer.guild,
    guildRep: offer.guildRep,
}));

// Procedural boards are deterministic, mining claims carry a concrete node,
// and restricted runs remain hidden until the den ledger reaches its favor
// threshold. This also protects the offer refresh cycle from silently changing
// the available contract mix.
{
    const first = fresh(123);
    const second = fresh(123);
    assert.deepEqual(projection(first.world.offers.helix), projection(second.world.offers.helix));
    assert.ok(first.world.offers.helix.some((offer) => offer.kind === 'delivery'));
    assert.ok(first.world.offers.helix.some((offer) => offer.kind === 'transport'));
    assert.ok(first.world.offers.helix.some((offer) => offer.kind === 'bounty'));

    const mining = first.world.offers.rook.find((offer) => offer.kind === 'mining');
    assert.ok(mining, 'an ore-rich board posts a mining claim');
    assert.equal(typeof mining.claimNodeId, 'string');
    assert.equal(mining.destination, 'rook');
    assert.equal(mining.deadline, null, 'claim contracts do not expire');

    assert.equal(first.world.offers.helix.some((offer) => offer.kind === 'smuggle'), false);
    const denSave = fresh(123);
    denSave.world.underworld = { helix: SYNDICATE_DEN_FAVOR };
    const denOffers = generateMissionOffers('helix', denSave);
    const smuggle = denOffers.find((offer) => offer.kind === 'smuggle');
    assert.ok(smuggle, 'the den board opens restricted runs at the favor threshold');
    assert.equal(smuggle.guild, 'syndicate');
    assert.equal(smuggle.faction, 'red-talons');
    assert.equal(smuggle.destination === 'rook', false, 'dark runs avoid the patrol bastion');

    const unchanged = JSON.stringify(first.world.offers.helix);
    refreshMissionOffers(first);
    assert.equal(JSON.stringify(first.world.offers.helix), unchanged, 'refresh inside a cycle preserves offers');
    first.world.time = 150;
    refreshMissionOffers(first);
    assert.ok(first.world.offers.helix.some((offer) => offer.id.includes('-1-')), 'a new cycle replaces ordinary offers');
}

// Acceptance rejects stale/missing offers, an active-contract overflow, an
// insufficient bond, and a hold that cannot fit the sealed cargo. Each path
// is atomic: credits, offers, cargo, and active contracts stay untouched.
{
    const missing = fresh(201);
    const missingBefore = JSON.stringify(missing);
    assert.equal(acceptMission(missing, 'helix', 'not-on-the-board').ok, false);
    assert.equal(JSON.stringify(missing), missingBefore);

    const stale = fresh(202);
    postOffer(stale, 'helix', fixture({ id: 'helix-0-0-stale', status: 'active' }));
    assert.equal(acceptMission(stale, 'helix', 'helix-0-0-stale').ok, false);

    const poor = fresh(203);
    postOffer(poor, 'helix', fixture({ id: 'helix-0-0-poor', deposit: 500 }));
    poor.player.credits = 499;
    const poorBefore = { credits: poor.player.credits, sealed: poor.player.sealedCargo.length, active: poor.activeMissions.length };
    assert.equal(acceptMission(poor, 'helix', 'helix-0-0-poor').ok, false);
    assert.deepEqual({ credits: poor.player.credits, sealed: poor.player.sealedCargo.length, active: poor.activeMissions.length }, poorBefore);
    assert.equal(poor.world.offers.helix[0].status, 'offered');

    const overloaded = fresh(204);
    postOffer(overloaded, 'helix', fixture({ id: 'helix-0-0-overloaded', commodity: 'ore', quantity: 20 }));
    const cargoBefore = cargoMass(overloaded.player);
    assert.equal(acceptMission(overloaded, 'helix', 'helix-0-0-overloaded').ok, false);
    assert.equal(cargoMass(overloaded.player), cargoBefore);
    assert.equal(overloaded.player.credits, 500000);
    assert.equal(overloaded.activeMissions.length, 0);

    const full = fresh(205);
    full.activeMissions = Array.from({ length: 6 }, (_, index) => fixture({
        id: `active-${index}`,
        status: 'active',
    }));
    postOffer(full, 'helix', fixture({ id: 'helix-0-0-full' }));
    assert.equal(acceptMission(full, 'helix', 'helix-0-0-full').ok, false);
    assert.equal(full.activeMissions.length, 6);
    assert.equal(full.world.offers.helix[0].status, 'offered');
}

// Delivery, transport, and smuggling all reserve sealed cargo on acceptance,
// return the bond on hand-in, remove the cargo, update the career ledgers, and
// refuse to complete at the wrong dock.
{
    const cases = [
        {
            kind: 'delivery',
            id: 'helix-0-0-delivery',
            destination: 'rook',
            commodity: 'medicine',
            quantity: 2,
            guild: 'merchant',
            faction: 'free-merchants',
            guildRep: 20,
            reward: 1200,
            deposit: 150,
        },
        {
            kind: 'transport',
            id: 'helix-0-1-transport',
            destination: 'vesper',
            commodity: undefined,
            quantity: 3,
            guild: 'merchant',
            faction: 'free-merchants',
            guildRep: 6,
            reward: 1800,
            deposit: 210,
        },
    ];
    for (const [index, fields] of cases.entries()) {
        const save = fresh(210 + index);
        const offer = postOffer(save, 'helix', fixture(fields));
        const startingCredits = save.player.credits;
        const accepted = acceptMission(save, 'helix', offer.id);
        assert.equal(accepted.ok, true, `${fields.kind} accepts`);
        assert.equal(save.player.credits, startingCredits - fields.deposit);
        assert.equal(save.world.offers.helix.some((entry) => entry.id === fields.id), false);
        assert.equal(save.activeMissions.length, 1);
        assert.equal(save.activeMissions[0].status, 'active');
        assert.equal(save.player.sealedCargo.length, 1);
        assert.equal(save.player.sealedCargo[0].missionId, fields.id);
        assert.equal(save.player.sealedCargo[0].units, fields.quantity);
        assert.equal(save.player.sealedCargo[0].mass, fields.kind === 'transport' ? 1.2 : 0.5);
        assert.equal(Boolean(save.player.sealedCargo[0].smuggled), false);
        assert.equal(cargoMass(save.player), fields.quantity * (fields.kind === 'transport' ? 1.2 : 0.5));

        assert.deepEqual(completeMissionsAtDock(save, 'helix'), []);
        assert.equal(save.activeMissions.length, 1);
        assert.equal(save.player.sealedCargo.length, 1);
        assert.equal(save.player.credits, startingCredits - fields.deposit);

        const messages = completeMissionsAtDock(save, fields.destination);
        assert.equal(messages.length, 1, `${fields.kind} completes at destination`);
        assert.equal(save.player.credits, startingCredits + fields.reward, `${fields.kind} returns deposit and pays reward`);
        assert.equal(save.player.sealedCargo.length, 0);
        assert.equal(save.activeMissions.length, 0);
        assert.deepEqual(save.world.completedMissionIds, [fields.id]);
        assert.equal(save.player.stats.contracts, 1);
        assert.equal(save.player.guildRep.merchant, fields.guildRep);
        assert.equal(save.player.reputation['free-merchants'], 4 + Math.max(1, Math.floor(fields.guildRep / 3)));
        if (fields.kind === 'delivery')
            assert.equal(save.player.guildRank.merchant, 1, '20 merchant rep reaches Factor');
    }
}

// Dark-run completion uses the same sealed-cargo path but keeps a smuggled
// marker and pays the syndicate ledger/reputation instead of the merchant one.
{
    const save = fresh(220);
    save.world.underworld = { helix: SYNDICATE_DEN_FAVOR };
    const offer = generateMissionOffers('helix', save).find((entry) => entry.kind === 'smuggle');
    assert.ok(offer);
    postOffer(save, 'helix', offer);
    const startingCredits = save.player.credits;
    assert.equal(acceptMission(save, 'helix', offer.id).ok, true);
    assert.equal(save.player.sealedCargo.length, 1);
    assert.equal(save.player.sealedCargo[0].smuggled, true);
    assert.equal(save.player.sealedCargo[0].missionId, offer.id);
    const messages = completeMissionsAtDock(save, offer.destination);
    assert.equal(messages.length, 1);
    assert.equal(save.player.credits, startingCredits + offer.reward);
    assert.equal(save.player.sealedCargo.length, 0);
    assert.equal(save.activeMissions.length, 0);
    assert.deepEqual(save.world.completedMissionIds, [offer.id]);
    assert.equal(save.player.guildRep.syndicate, offer.guildRep);
    assert.equal(save.player.reputation['red-talons'], -12 + Math.max(1, Math.floor(offer.guildRep / 3)));
}

// Procurement is retained only as a legacy completion branch. Acceptance does
// not reserve cargo; the player supplies the commodity before arriving.
{
    const save = fresh(230);
    const offer = postOffer(save, 'helix', fixture({
        id: 'helix-0-0-procurement',
        kind: 'procurement',
        destination: 'rook',
        commodity: 'electronics',
        quantity: 2,
        reward: 1450,
        deposit: 80,
        guildRep: 7,
    }));
    const startingCredits = save.player.credits;
    assert.equal(acceptMission(save, 'helix', offer.id).ok, true);
    assert.equal(save.player.credits, startingCredits - offer.deposit);
    assert.equal(save.player.sealedCargo.length, 0);
    save.player.cargo.electronics = offer.quantity;
    assert.deepEqual(completeMissionsAtDock(save, 'helix'), []);
    assert.equal(save.activeMissions.length, 1);
    const messages = completeMissionsAtDock(save, offer.destination);
    assert.equal(messages.length, 1);
    assert.equal(save.player.cargo.electronics, 0);
    assert.equal(save.player.credits, startingCredits + offer.reward);
    assert.equal(save.player.stats.contracts, 1);
    assert.deepEqual(save.world.completedMissionIds, [offer.id]);
}

// Mining claims have a real objective: purchased ore alone cannot clear a
// claim. Once the active mission records enough mined units, the delivered ore
// is consumed and the normal completion ledgers are awarded.
{
    const save = fresh(240);
    const generated = save.world.offers.rook.find((offer) => offer.kind === 'mining');
    assert.ok(generated);
    const offer = postOffer(save, 'rook', generated);
    const startingCredits = save.player.credits;
    assert.equal(acceptMission(save, 'rook', offer.id).ok, true);
    assert.equal(save.player.credits, startingCredits, 'claim contracts have no bond');
    assert.equal(save.player.sealedCargo.length, 0);
    const active = save.activeMissions[0];
    save.player.cargo.ore = active.quantity;
    active.mined = active.quantity - 1;
    assert.deepEqual(completeMissionsAtDock(save, 'rook'), [], 'bought ore cannot satisfy an unfinished claim');
    assert.equal(save.activeMissions.length, 1);
    assert.equal(save.player.cargo.ore, active.quantity);
    active.mined = active.quantity;
    const messages = completeMissionsAtDock(save, 'rook');
    assert.equal(messages.length, 1);
    assert.equal(save.player.cargo.ore, 0);
    assert.equal(save.player.credits, startingCredits + active.reward);
    assert.equal(save.player.stats.contracts, 1);
    assert.deepEqual(save.world.completedMissionIds, [active.id]);
    assert.equal(save.player.guildRep.mining, active.guildRep);
    assert.equal(save.player.reputation['frontier-miners'], Math.max(1, Math.floor(active.guildRep / 3)));
}

// Bounty completion records the named kill and pinned pilot profile, awards
// the ace bonus before rank calculation, and applies the Red Talon reputation
// penalty after the contract reward.
{
    const save = fresh(250);
    save.world.time = 42;
    const offer = postOffer(save, 'helix', fixture({
        id: 'helix-0-0-bounty',
        kind: 'bounty',
        destination: undefined,
        commodity: undefined,
        quantity: undefined,
        targetZone: 'rook',
        targetName: 'Ace Target',
        danger: 2.4,
        pilot: { tier: 'ace', temperament: 'aggressive' },
        reward: 2600,
        deposit: 130,
        guild: 'bounty',
        guildRep: 8,
        faction: 'red-talons',
    }));
    const startingCredits = save.player.credits;
    assert.equal(acceptMission(save, 'helix', offer.id).ok, true);
    assert.equal(save.player.credits, startingCredits - offer.deposit);
    assert.deepEqual(completeBountyMission(save, 'missing-warrant'), { ok: false, message: 'No matching active warrant.' });
    const result = completeBountyMission(save, offer.id);
    assert.equal(result.ok, true);
    assert.equal(save.player.credits, startingCredits + offer.reward);
    assert.equal(save.activeMissions.length, 0);
    assert.equal(save.player.stats.contracts, 1);
    assert.deepEqual(save.world.completedMissionIds, [offer.id]);
    assert.deepEqual(save.world.bountyKills, ['Ace Target']);
    assert.deepEqual(save.world.registry['Ace Target'], {
        tier: 'ace',
        temperament: 'aggressive',
        danger: 2.4,
        count: 1,
        clearedAt: 42,
    });
    assert.equal(save.player.guildRep.bounty, 20, 'ace bonus + kill rep + contract rep reaches Deputy');
    assert.equal(save.player.guildRank.bounty, 1);
    assert.equal(save.player.reputation['red-talons'], -14, 'award rep is followed by the kill penalty');
}

// Expiry removes active contracts and their sealed cargo, records only the ID,
// keeps the bond, penalizes standing, and is idempotent. Null deadlines (mining)
// and future deadlines remain active.
{
    const save = fresh(260);
    const offer = postOffer(save, 'helix', fixture({
        id: 'helix-0-0-expired',
        deadline: 10,
        guildRep: 20,
        faction: 'free-merchants',
    }));
    const startingCredits = save.player.credits;
    assert.equal(acceptMission(save, 'helix', offer.id).ok, true);
    const active = save.activeMissions[0];
    save.world.time = active.deadline + 1;
    const messages = failExpiredMissions(save);
    assert.equal(messages.length, 1);
    assert.equal(save.player.credits, startingCredits - offer.deposit, 'expired bonds are not refunded');
    assert.equal(save.activeMissions.length, 0);
    assert.equal(save.player.sealedCargo.length, 0);
    assert.deepEqual(save.world.failedMissionIds, [offer.id]);
    assert.equal(save.player.guildRep.merchant, 0, 'failure standing is clamped at zero');
    assert.equal(save.player.reputation['free-merchants'], 1);
    assert.equal(save.player.stats.contracts, 0);
    assert.deepEqual(failExpiredMissions(save), [], 'a failed contract is not failed twice');

    const retained = fresh(261);
    retained.activeMissions = [
        fixture({ id: 'keep-no-deadline', kind: 'mining', deadline: null, destination: 'rook', commodity: 'ore', quantity: 2 }),
        fixture({ id: 'keep-future', deadline: 100, destination: 'rook' }),
    ];
    retained.world.time = 50;
    assert.deepEqual(failExpiredMissions(retained), []);
    assert.deepEqual(retained.activeMissions.map((mission) => mission.id), ['keep-no-deadline', 'keep-future']);
    retained.world.time = 101;
    assert.equal(failExpiredMissions(retained).length, 1);
    assert.deepEqual(retained.activeMissions.map((mission) => mission.id), ['keep-no-deadline']);
}

// Guild entry costs, duplicate membership, and rank/reputation progression are
// public career APIs. Salvage has a guild but no generated/completable salvage
// contract yet; the final assertions make that missing gameplay path explicit
// instead of pretending a salvage objective exists.
{
    assert.equal(guildJoinCost('merchant'), 500);
    assert.equal(guildJoinCost('bounty'), 900);
    assert.equal(guildJoinCost('mining'), 650);
    assert.equal(guildJoinCost('salvage'), 650);
    assert.equal(guildJoinCost('syndicate'), 650);

    const poor = fresh(270);
    poor.player.credits = guildJoinCost('bounty') - 1;
    assert.equal(joinGuild(poor, 'bounty').ok, false);
    assert.equal(poor.player.guildRep.bounty, 0);
    assert.equal(poor.player.credits, 899);

    const member = fresh(271);
    member.player.credits = guildJoinCost('merchant');
    assert.equal(joinGuild(member, 'merchant').ok, true);
    assert.equal(member.player.credits, 0);
    assert.equal(member.player.guildRep.merchant, 1);
    assert.equal(joinGuild(member, 'merchant').ok, false);
    assert.equal(member.player.credits, 0);

    const salvage = fresh(272);
    salvage.player.credits = guildJoinCost('salvage');
    assert.equal(joinGuild(salvage, 'salvage').ok, true);
    assert.equal(awardCareerProgress(salvage, 'salvage', 19, 'salvage-union') !== undefined, true);
    assert.equal(salvage.player.guildRep.salvage, 20);
    assert.equal(salvage.player.guildRank.salvage, 1);
    assert.equal(salvage.player.reputation['salvage-union'], 4);
    assert.equal(generateMissionOffers('rook', salvage).some((offer) => offer.kind === 'salvage'), false);
    salvage.player.credits = 100;

    const noSalvageCompletion = postOffer(salvage, 'helix', fixture({
        id: 'helix-0-0-salvage',
        kind: 'salvage',
        destination: 'rook',
        commodity: undefined,
        quantity: undefined,
        guild: 'salvage',
        faction: 'salvage-union',
    }));
    assert.equal(acceptMission(salvage, 'helix', noSalvageCompletion.id).ok, true);
    assert.deepEqual(completeMissionsAtDock(salvage, 'rook'), [], 'there is currently no salvage completion branch');
    assert.deepEqual(salvage.activeMissions.map((mission) => mission.id), ['helix-0-0-salvage']);
}

// A JSON save/reload round trip keeps an accepted procedural mission, its
// sealed cargo, and completed/failed mission ledgers. `hydrateSave` also
// refreshes prices/offers, so only durable mission state is compared here.
{
    const save = fresh(280);
    const offer = save.world.offers.helix.find((entry) => entry.kind === 'delivery');
    assert.ok(offer);
    assert.equal(acceptMission(save, 'helix', offer.id).ok, true);
    save.world.time = 37;
    save.world.completedMissionIds.push('historic-completion');
    save.world.failedMissionIds.push('historic-failure');
    const restored = hydrateSave(JSON.parse(JSON.stringify(save)));
    assert.deepEqual(restored.activeMissions, save.activeMissions);
    assert.deepEqual(restored.player.sealedCargo, save.player.sealedCargo);
    assert.deepEqual(restored.world.completedMissionIds, ['historic-completion']);
    assert.deepEqual(restored.world.failedMissionIds, ['historic-failure']);
    assert.equal(restored.world.time, 37);
    assert.equal(restored.world.offers.helix.some((entry) => entry.id === offer.id), false, 'accepted offer stays off the board after reload');
}

// Avoid a silent typo in this suite's fixture destinations as the galaxy grows.
for (const locationId of ['helix', 'rook', 'vesper', 'azure', 'cairn'])
    assert.ok(LOCATIONS[locationId], `fixture location ${locationId} exists`);

console.log('all mission assertions passed');
