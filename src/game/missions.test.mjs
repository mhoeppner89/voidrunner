import assert from 'node:assert/strict';
import {
    acceptMission,
    awardCareerProgress,
    completeBountyMission,
    completeMissionsAtDock,
    discardMission,
    failExpiredMissions,
    generateMissionOffers,
    guildJoinCost,
    joinGuild,
    refreshMissionOffers,
} from './missions.js';
import { cargoMass, SYNDICATE_DEN_FAVOR } from './economy.js';
import { LOCATIONS } from './data.js';
import { LOCAL_CONTRACT_CATALOG, LOCAL_CONTRACT_CHAIN_IDS } from './localContracts.js';
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

const authoredOffers = (save) => Object.values(save.world.offers)
    .flatMap((offers) => offers.filter((offer) => offer.authored));

const projection = (offers) => offers.map((offer) => ({
    id: offer.id,
    kind: offer.kind,
    origin: offer.origin,
    destination: offer.destination,
    targetZone: offer.targetZone,
    targetNodeId: offer.targetNodeId,
    targetName: offer.targetName,
    targetRemaining: offer.targetRemaining,
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

// Each authored chain posts exactly its next stage at that stage's origin.
// Completing a stage unlocks the following posting; expiry leaves progress
// untouched and re-posts the same stage instead.
{
    const freshBoard = fresh(130);
    const firstStages = LOCAL_CONTRACT_CHAIN_IDS.map((chainId) => LOCAL_CONTRACT_CATALOG
        .find((stage) => stage.chainId === chainId && stage.stageIndex === 1));
    const authored = authoredOffers(freshBoard);
    assert.equal(authored.length, LOCAL_CONTRACT_CHAIN_IDS.length);
    assert.deepEqual(authored.map((offer) => offer.id).sort(), firstStages.map((stage) => stage.id).sort());
    for (const offer of authored) {
        const stage = firstStages.find((entry) => entry.id === offer.id);
        assert.equal(offer.origin, stage.origin);
        assert.equal(offer.stageIndex, 1);
        assert.equal(offer.deadline, freshBoard.world.time + stage.deadlineSeconds);
    }
    const advancedBoard = fresh(1301);
    advancedBoard.world.localContractProgress = Object.fromEntries(LOCAL_CONTRACT_CHAIN_IDS.map((chainId) => [chainId, 1]));
    refreshMissionOffers(advancedBoard, true);
    const secondStages = LOCAL_CONTRACT_CHAIN_IDS.map((chainId) => LOCAL_CONTRACT_CATALOG
        .find((stage) => stage.chainId === chainId && stage.stageIndex === 2));
    const advancedAuthored = authoredOffers(advancedBoard);
    assert.deepEqual(advancedAuthored.map((offer) => offer.id).sort(), secondStages.map((stage) => stage.id).sort());
    for (const offer of advancedAuthored) {
        const stage = secondStages.find((entry) => entry.id === offer.id);
        assert.equal(offer.origin, stage.origin);
        assert.equal(offer.stageIndex, 2);
    }

    const progressed = fresh(131);
    const first = LOCAL_CONTRACT_CATALOG.find((stage) => stage.chainId === 'mourning-ledger' && stage.stageIndex === 1);
    progressed.world.time = 73;
    const offer = progressed.world.offers[first.origin].find((entry) => entry.id === first.id);
    assert.ok(offer);
    assert.equal(acceptMission(progressed, first.origin, first.id).ok, true);
    assert.equal(progressed.activeMissions[0].deadline, progressed.world.time + first.deadlineSeconds, 'authored deadline resets relative to acceptance');
    assert.equal(progressed.player.sealedCargo[0].label, first.cargo, 'authored transport keeps its cargo label');
    assert.equal(progressed.activeMissions[0].cargoLabel, first.cargo);
    assert.equal(completeMissionsAtDock(progressed, first.destination).length, 1);
    assert.equal(progressed.world.localContractProgress[first.chainId], first.stageIndex);
    refreshMissionOffers(progressed);
    const next = LOCAL_CONTRACT_CATALOG.find((stage) => stage.chainId === first.chainId && stage.stageIndex === 2);
    assert.ok(progressed.world.offers[next.origin].some((entry) => entry.id === next.id), 'completion exposes the next authored stage at its origin');
    assert.equal(authoredOffers(progressed).some((entry) => entry.id === first.id), false);

    const failed = fresh(132);
    const failedFirst = LOCAL_CONTRACT_CATALOG.find((stage) => stage.chainId === 'mourning-ledger' && stage.stageIndex === 1);
    const failedOffer = failed.world.offers[failedFirst.origin].find((entry) => entry.id === failedFirst.id);
    assert.equal(acceptMission(failed, failedFirst.origin, failedFirst.id).ok, true);
    failed.world.time = failedOffer.deadline + 1;
    assert.equal(failExpiredMissions(failed).length, 1);
    assert.equal(failed.world.localContractProgress[failedFirst.chainId], undefined, 'failure does not advance authored progress');
    refreshMissionOffers(failed);
    assert.ok(failed.world.offers[failedFirst.origin].some((entry) => entry.id === failedFirst.id), 'failure keeps the same authored stage available');
    assert.equal(authoredOffers(failed).some((entry) => entry.id === `${failedFirst.chainId}-2`), false);
}

// Ordinary active contracts can be discarded, but the action is a real
// failure: the bond stays spent, reserved cargo is removed, and both standing
// ledgers take the normal failure penalty. Authored story contracts are
// protected even if a caller bypasses the UI.
{
    const save = fresh(206);
    const offer = postOffer(save, 'helix', fixture({ id: 'helix-0-0-discard' }));
    save.player.guildRep.merchant = 12;
    save.player.reputation['free-merchants'] = 20;
    const startingCredits = save.player.credits;
    assert.equal(acceptMission(save, 'helix', offer.id).ok, true);
    assert.equal(save.player.sealedCargo.some((cargo) => cargo.missionId === offer.id), true);
    const creditsAfterBond = save.player.credits;
    assert.equal(creditsAfterBond, startingCredits - offer.deposit);

    const result = discardMission(save, offer.id);
    assert.equal(result.ok, true);
    assert.equal(save.activeMissions.some((mission) => mission.id === offer.id), false);
    assert.equal(save.player.sealedCargo.some((cargo) => cargo.missionId === offer.id), false);
    assert.equal(save.player.credits, creditsAfterBond, 'discarding does not return or charge the bond again');
    assert.equal(save.player.guildRep.merchant, 9);
    assert.equal(save.player.reputation['free-merchants'], 17);
    assert.equal(save.world.failedMissionIds.includes(offer.id), true);
    const settlement = save.world.missionSettlements.at(-1);
    assert.equal(settlement.id, offer.id);
    assert.equal(settlement.outcome, 'failed');
    assert.equal(settlement.reason, 'discarded');
    assert.equal(settlement.bond, -offer.deposit);
    assert.equal(settlement.repDelta, -3);
    assert.equal(settlement.factionDelta, -3);
    assert.equal(hydrateSave(JSON.parse(JSON.stringify(save))).world.missionSettlements.at(-1).reason, 'discarded');
    const discardedState = JSON.stringify(save);
    assert.equal(discardMission(save, offer.id).ok, false);
    assert.equal(JSON.stringify(save), discardedState, 'discard is idempotent once the contract is gone');

    const story = fresh(207);
    const storyOffer = authoredOffers(story)[0];
    assert.ok(storyOffer);
    assert.equal(acceptMission(story, storyOffer.origin, storyOffer.id).ok, true);
    const storyState = JSON.stringify(story);
    assert.equal(discardMission(story, storyOffer.id).ok, false);
    assert.equal(JSON.stringify(story), storyState, 'a forged discard cannot remove a story contract');
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
        const settlement = save.world.missionSettlements.at(-1);
        assert.deepEqual({
            id: settlement?.id,
            outcome: settlement?.outcome,
            reward: settlement?.reward,
            bond: settlement?.bond,
            bonus: settlement?.bonus,
            total: settlement?.total,
        }, {
            id: fields.id,
            outcome: 'completed',
            reward: fields.reward,
            bond: fields.deposit,
            bonus: 0,
            total: fields.reward + fields.deposit,
        }, `${fields.kind} queues one settlement docket`);
        assert.deepEqual(completeMissionsAtDock(save, fields.destination), [], `${fields.kind} cannot settle twice`);
        assert.equal(save.world.missionSettlements.length, 1, `${fields.kind} queues only once`);
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
    const missingWarrant = completeBountyMission(save, 'missing-warrant');
    assert.equal(missingWarrant.ok, false);
    assert.equal(typeof missingWarrant.message, 'string');
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
    assert.deepEqual(save.world.missionSettlements.map(({ id, title, issuer, outcome, guild, faction, reward, bond, bonus, total, repDelta, factionDelta, at }) => ({
        id, title, issuer, outcome, guild, faction, reward, bond, bonus, total, repDelta, factionDelta, at,
    })), [{
        id: offer.id,
        title: offer.title,
        issuer: offer.issuer,
        outcome: 'failed',
        guild: offer.guild,
        faction: offer.faction,
        reward: 0,
        bond: -offer.deposit,
        bonus: 0,
        total: 0,
        repDelta: -10,
        factionDelta: -3,
        at: save.world.time,
    }]);
    assert.deepEqual(failExpiredMissions(save), [], 'a failed contract is not failed twice');
    assert.equal(save.world.missionSettlements.length, 1, 'an expired contract queues only once');

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
// public career APIs. Salvage contracts point at real Mourning Line deposits:
// accepting one posts a bond, only depletion of its target node advances it,
// and returning the recovered commodity pays the normal career ledgers.
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

    const unknown = fresh(269);
    const unknownCredits = unknown.player.credits;
    assert.equal(joinGuild(unknown, 'not-a-guild', 'helix').ok, false);
    assert.equal(unknown.player.credits, unknownCredits, 'unknown guild does not charge an entry fee');

    const absent = fresh(2691);
    absent.player.credits = guildJoinCost('bounty');
    assert.equal(joinGuild(absent, 'bounty', 'helix').ok, false, 'a guild without a local representative cannot be joined');
    assert.equal(absent.player.credits, guildJoinCost('bounty'));
    assert.equal(absent.player.guildRep.bounty, 0);

    const represented = fresh(2692);
    represented.player.credits = guildJoinCost('bounty');
    assert.equal(joinGuild(represented, 'bounty', 'rook').ok, true, 'a guild can be joined where it is represented');
    assert.equal(represented.player.credits, 0);
    assert.equal(represented.player.guildRep.bounty, 1);

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
    const generatedSalvage = generateMissionOffers('rook', salvage).find((offer) => offer.kind === 'salvage');
    assert.ok(generatedSalvage, 'Helios mission boards post a salvage recovery job');
    assert.equal(generatedSalvage.guild, 'salvage');
    assert.equal(generatedSalvage.faction, 'salvage-union');
    assert.equal(generatedSalvage.targetZone, 'mourning-line');
    assert.equal(typeof generatedSalvage.targetNodeId, 'string');
    assert.equal(typeof generatedSalvage.targetName, 'string');
    assert.equal(typeof generatedSalvage.targetRemaining, 'number');
    assert.ok(Math.ceil(generatedSalvage.targetRemaining) >= generatedSalvage.quantity);
    assert.ok(generatedSalvage.quantity > 0);
    assert.ok(generatedSalvage.deadline > salvage.world.time, 'salvage jobs have a live deadline');
    assert.ok(generatedSalvage.deposit > 0, 'salvage jobs require a bond');
    assert.ok(generatedSalvage.reward > generatedSalvage.deposit, 'salvage jobs pay more than their bond');

    const salvageOffer = postOffer(salvage, 'rook', generatedSalvage);
    salvage.player.credits = salvageOffer.deposit + 5000;
    const startingCredits = salvage.player.credits;
    assert.equal(acceptMission(salvage, 'rook', salvageOffer.id).ok, true);
    assert.equal(salvage.player.credits, startingCredits - salvageOffer.deposit);
    assert.equal(salvage.player.sealedCargo.length, 0, 'salvage is recovered in the field, not reserved at acceptance');
    const activeSalvage = salvage.activeMissions[0];
    assert.equal(activeSalvage.salvaged, 0);
    assert.notEqual(generateMissionOffers('helix', salvage).find((offer) => offer.kind === 'salvage')?.targetNodeId, activeSalvage.targetNodeId, 'active recovery claims are not reposted');
    const duplicateClaim = postOffer(salvage, 'helix', { ...salvageOffer, id: 'helix-0-salvage-duplicate', status: 'offered' });
    const creditsBeforeDuplicate = salvage.player.credits;
    assert.equal(acceptMission(salvage, 'helix', duplicateClaim.id).ok, false, 'one wreck cannot be claimed twice');
    assert.equal(salvage.player.credits, creditsBeforeDuplicate);
    assert.equal(salvage.activeMissions.length, 1);

    // Cargo without depletion cannot clear the claim, and arriving at another
    // dock never hands in a contract whose destination is Rookhaven.
    salvage.player.cargo[activeSalvage.commodity] = activeSalvage.quantity;
    assert.deepEqual(completeMissionsAtDock(salvage, 'helix'), []);
    assert.deepEqual(completeMissionsAtDock(salvage, 'rook'), []);
    assert.equal(salvage.activeMissions.length, 1);
    assert.equal(salvage.player.cargo[activeSalvage.commodity], activeSalvage.quantity);

    // These are the same persisted writes made by Game.extractWreck: the
    // target node's remaining units fall, while the recovered commodity enters
    // the hold. A partial cut advances progress but still cannot pay out.
    const partial = Math.max(0, activeSalvage.quantity - 1);
    salvage.world.depletedWrecks[activeSalvage.targetNodeId] = Math.max(0, activeSalvage.targetRemaining - partial);
    assert.deepEqual(completeMissionsAtDock(salvage, 'rook'), []);
    assert.equal(activeSalvage.salvaged, partial);
    assert.equal(salvage.activeMissions.length, 1);

    salvage.world.depletedWrecks[activeSalvage.targetNodeId] = Math.max(0, activeSalvage.targetRemaining - activeSalvage.quantity);
    const messages = completeMissionsAtDock(salvage, 'rook');
    assert.equal(messages.length, 1, 'a fully cut target deposit completes at the issuing dock');
    assert.equal(salvage.player.credits, startingCredits + activeSalvage.reward, 'completion returns the bond and pays the reward');
    assert.equal(salvage.player.cargo[activeSalvage.commodity], 0);
    assert.equal(salvage.activeMissions.length, 0);
    assert.deepEqual(salvage.world.completedMissionIds, [activeSalvage.id]);
    assert.equal(salvage.player.stats.contracts, 1);
    assert.equal(salvage.player.guildRep.salvage, 20 + activeSalvage.guildRep);
    assert.equal(salvage.player.reputation['salvage-union'], 4 + Math.max(1, Math.floor(activeSalvage.guildRep / 3)));

    const expired = fresh(273);
    const expiredOffer = postOffer(expired, 'rook', generateMissionOffers('rook', expired).find((offer) => offer.kind === 'salvage'));
    const expiredCredits = expired.player.credits;
    assert.equal(acceptMission(expired, 'rook', expiredOffer.id).ok, true);
    expired.world.time = expiredOffer.deadline + 1;
    assert.equal(failExpiredMissions(expired).length, 1, 'salvage deadlines fail overdue contracts');
    assert.equal(expired.player.credits, expiredCredits - expiredOffer.deposit, 'an expired salvage bond is kept');
    assert.equal(expired.activeMissions.length, 0);
    assert.deepEqual(expired.world.failedMissionIds, [expiredOffer.id]);
    assert.equal(expired.player.reputation['salvage-union'], -3);

    const fractional = fresh(274);
    const fractionalOffer = generateMissionOffers('rook', fractional).find((offer) => offer.kind === 'salvage');
    fractional.world.depletedWrecks[fractionalOffer.targetNodeId] = 0.6;
    fractionalOffer.quantity = 1;
    fractionalOffer.targetRemaining = 0.6;
    postOffer(fractional, 'rook', fractionalOffer);
    assert.equal(acceptMission(fractional, 'rook', fractionalOffer.id).ok, true, 'a fractional final deposit still represents one recovery cycle');
    fractional.player.cargo[fractionalOffer.commodity] = 1;
    fractional.world.depletedWrecks[fractionalOffer.targetNodeId] = 0;
    assert.equal(completeMissionsAtDock(fractional, 'rook').length, 1, 'cutting the fractional final unit completes its recovery contract');
}

// Optional fragile cargo pays its bonus only when the sealed load remains
// intact. Acceptance resets the authored default to intact, while a damaged
// active mission still settles for its base reward and returned bond.
{
    const intact = fresh(275);
    const intactOffer = postOffer(intact, 'helix', fixture({
        id: 'helix-0-0-fragile-intact',
        destination: 'rook',
        reward: 1000,
        deposit: 100,
        complication: { kind: 'fragile', bonus: 333, intact: false },
    }));
    const intactStartingCredits = intact.player.credits;
    assert.equal(acceptMission(intact, 'helix', intactOffer.id).ok, true);
    assert.equal(intact.activeMissions[0].complication.intact, true, 'fragile cargo starts intact after acceptance');
    assert.equal(completeMissionsAtDock(intact, 'rook').length, 1);
    assert.equal(intact.player.credits, intactStartingCredits + intactOffer.reward + 333);
    assert.equal(intact.world.missionSettlements[0].bonus, 333);

    const damaged = fresh(276);
    const damagedOffer = postOffer(damaged, 'helix', fixture({
        id: 'helix-0-0-fragile-damaged',
        destination: 'rook',
        reward: 1000,
        deposit: 100,
        complication: { kind: 'fragile', bonus: 333 },
    }));
    const damagedStartingCredits = damaged.player.credits;
    assert.equal(acceptMission(damaged, 'helix', damagedOffer.id).ok, true);
    damaged.activeMissions[0].complication.intact = false;
    assert.equal(completeMissionsAtDock(damaged, 'rook').length, 1);
    assert.equal(damaged.player.credits, damagedStartingCredits + damagedOffer.reward, 'damaged fragile cargo loses only the optional bonus');
    assert.equal(damaged.world.missionSettlements[0].bonus, 0);
}

// A JSON save/reload round trip keeps an accepted procedural mission, its
// sealed cargo, and completed/failed mission ledgers. `hydrateSave` also
// refreshes prices/offers, so only durable mission state is compared here.
{
    const save = fresh(280);
    const offer = save.world.offers.helix.find((entry) => entry.kind === 'delivery');
    assert.ok(offer);
    assert.equal(acceptMission(save, 'helix', offer.id).ok, true);
    save.activeMissions[0].complication = { kind: 'early', bonus: 444, bonusDeadline: 120 };
    save.world.time = 37;
    save.world.completedMissionIds.push('historic-completion');
    save.world.failedMissionIds.push('historic-failure');
    const restored = hydrateSave(JSON.parse(JSON.stringify(save)));
    assert.deepEqual(restored.activeMissions, save.activeMissions);
    assert.deepEqual(restored.player.sealedCargo, save.player.sealedCargo);
    assert.deepEqual(restored.activeMissions[0].complication, save.activeMissions[0].complication, 'optional complications survive JSON round-trip');
    assert.deepEqual(restored.world.completedMissionIds, ['historic-completion']);
    assert.deepEqual(restored.world.failedMissionIds, ['historic-failure']);
    assert.equal(restored.world.time, 37);
    assert.equal(restored.world.offers.helix.some((entry) => entry.id === offer.id), false, 'accepted offer stays off the board after reload');
}

// Avoid a silent typo in this suite's fixture destinations as the galaxy grows.
for (const locationId of ['helix', 'rook', 'vesper', 'azure', 'cairn'])
    assert.ok(LOCATIONS[locationId], `fixture location ${locationId} exists`);

console.log('all mission assertions passed');
