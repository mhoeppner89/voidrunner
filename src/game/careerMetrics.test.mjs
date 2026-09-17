import assert from 'node:assert/strict';
import test from 'node:test';
import { createNewSave } from './save.js';
import { GameSession } from './game.js';
import {
    beginSortie,
    finishSortie,
    markSortieDocked,
    nextMeaningfulUpgrade,
    recordSortieCredit,
    recordSortieMission,
    sortieSummary,
} from './careerMetrics.js';

test('sortie ledger measures a working 12-minute career loop', () => {
    const save = createNewSave(0x782a, { tutorial: true });
    save.player.credits = 3500;
    beginSortie(save, 'helix');

    save.world.time = 720;
    save.player.credits -= 240;
    recordSortieCredit(save, -240, 'repair');
    recordSortieMission(save, 'accepted', 'delivery');
    save.player.credits -= 80;
    recordSortieCredit(save, -80, 'bonds');
    save.player.credits += 1450;
    recordSortieCredit(save, 1450, 'missions');
    recordSortieMission(save, 'completed', 'delivery');
    save.player.guildRep.merchant += 8;

    markSortieDocked(save, 'rook');
    const summary = sortieSummary(save);
    assert.equal(summary.duration, 720);
    assert.equal(summary.totalEarnings, 1450);
    assert.equal(summary.totalCosts, 320);
    assert.equal(summary.creditDelta, 1130);
    assert.equal(summary.netPerMinute, 94.16666666666667);
    assert.equal(summary.missionsAccepted, 1);
    assert.equal(summary.missionsCompleted, 1);
    assert.equal(summary.guildRepDelta.merchant, 8);
    assert.ok(summary.nextUpgrade?.id, 'the debrief should point at a next upgrade');
});

test('finishing a sortie persists a bounded debrief and preserves negative standing', () => {
    const save = createNewSave(0x17, { tutorial: true });
    save.player.credits = 3500;
    beginSortie(save, 'helix');
    save.world.time = 90;
    save.player.guildRep.merchant -= 3;
    save.player.reputation['red-talons'] -= 4;
    const finished = finishSortie(save, 'helix', 'loss');

    assert.equal(save.world.sortie, null);
    assert.equal(save.world.sortieHistory.length, 1);
    assert.equal(finished.guildRepDelta.merchant, -3);
    assert.equal(finished.reputationDelta['red-talons'], -4);
    assert.equal(finished.completedAt, 90);
});

test('owned locker hardware is the next fit before a later purchase', () => {
    const save = createNewSave(0x44, { tutorial: true });
    save.player.outfitting.locker['radar-mk2'] = 1;
    const next = nextMeaningfulUpgrade(save, 'helix');
    assert.equal(next?.id, 'radar-mk2');
    assert.equal(next?.owned, true);
    assert.equal(next?.affordable, true);
});

test('mission-linked pressure follows claims and keeps dark sealed routes quieter', () => {
    const runtime = Object.create(GameSession.prototype);
    runtime.save = { activeMissions: [], player: { sealedCargo: [], transponder: true } };

    runtime.activeInstanceId = 'shardbelt';
    runtime.save.activeMissions = [{ kind: 'mining', claimNodeId: 'claim-1' }];
    assert.equal(runtime.missionEncounterPressure().kind, 'mining-claim');
    assert.equal(runtime.missionEncounterPressure().level, 1.25);

    runtime.activeInstanceId = 'mourning-line';
    runtime.save.activeMissions = [{ kind: 'salvage', targetNodeId: 'wreck-1' }];
    assert.equal(runtime.missionEncounterPressure().kind, 'salvage-claim');

    runtime.activeInstanceId = 'open';
    runtime.save.activeMissions = [{ kind: 'smuggle' }];
    runtime.save.player.sealedCargo = [{ missionId: 'smuggle-1', smuggled: true }];
    assert.equal(runtime.missionEncounterPressure().kind, 'sealed-route');
    runtime.save.player.transponder = false;
    assert.equal(runtime.missionEncounterPressure().kind, 'sealed-route-dark');
    assert.ok(runtime.missionEncounterPressure().level < 1);
});
