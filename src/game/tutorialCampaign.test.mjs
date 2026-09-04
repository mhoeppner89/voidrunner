import assert from 'node:assert/strict';
import {
    TUTORIAL_QUEST_ID,
    TUTORIAL_STARTING_CREDITS,
    advanceTutorialCampaign,
    getTutorialQuest,
    isTutorialActive,
    skipTutorialCampaign,
    startTutorialCampaign,
    tutorialCampaignSummary,
    tutorialDialogue,
} from './tutorialCampaign.js';

const freshSave = () => ({
    player: { credits: 500000, navTargetId: 'shardbelt', cargo: {} },
    world: { time: 0 },
    quests: [],
});

const advance = (save, type, payload = {}) => advanceTutorialCampaign(save, { type, ...payload });

{
    const save = freshSave();
    const quest = startTutorialCampaign(save);
    assert.equal(quest.id, TUTORIAL_QUEST_ID);
    assert.equal(quest.stepId, 'meet-family');
    assert.equal(save.player.credits, TUTORIAL_STARTING_CREDITS);
    assert.equal(save.player.navTargetId, 'helix');
    assert.equal(isTutorialActive(save), true);
    assert.equal(startTutorialCampaign(save), quest, 'starting twice must reuse the same quest');

    assert.equal(advance(save, 'talked', { personId: 'mara-vek' }).changed, true);
    save.world.npcMemory = { 'mara-vek': { topics: { greeting: 1 } } };
    assert.match(tutorialDialogue(save, 'mara-vek'), /mother left two keys/);
    assert.equal(advance(save, 'talked', { personId: 'mara-vek' }).changed, false, 'repeated dialogue must be idempotent');
    advance(save, 'talked', { personId: 'rin-vek' });
    save.world.npcMemory['rin-vek'] = { topics: { greeting: 1 } };
    assert.match(tutorialDialogue(save, 'rin-vek'), /Second Light/);
    save.world.npcMemory['rin-vek'].topics.greeting = 2;
    assert.match(tutorialDialogue(save, 'rin-vek'), /commodity market/);
    assert.equal(quest.stepId, 'buy-supplies');

    assert.equal(advance(save, 'traded', { locationId: 'helix', kind: 'buy', commodityId: 'food', cargoAfter: 1 }).changed, true);
    assert.equal(advance(save, 'traded', { locationId: 'helix', kind: 'buy', commodityId: 'food', cargoAfter: 1 }).changed, false);
    advance(save, 'traded', { locationId: 'helix', kind: 'buy', commodityId: 'food', cargoAfter: 2 });
    assert.equal(quest.stepId, 'launch-helix');

    advance(save, 'launched', { fromLocationId: 'helix' });
    assert.equal(quest.stepId, 'fly-vesper');
    advance(save, 'docked', { locationId: 'vesper', foodCargo: 2 });
    assert.equal(quest.stepId, 'sell-supplies');
    assert.equal(quest.flags.suppliesAtVesper, 2);

    advance(save, 'traded', { locationId: 'vesper', kind: 'sell', commodityId: 'food', quantity: 1, cargoAfter: 1 });
    assert.equal(quest.flags.suppliesSold, 1);
    assert.equal(advance(save, 'traded', { locationId: 'vesper', kind: 'sell', commodityId: 'food', quantity: 1, cargoAfter: 1 }).changed, false);
    advance(save, 'traded', { locationId: 'vesper', kind: 'sell', commodityId: 'food', quantity: 1, cargoAfter: 0 });
    assert.equal(quest.stepId, 'mine-shardbelt');

    getTutorialQuest(save).flags.oreTargetId = 'ore-1';
    assert.equal(advance(save, 'extracted', { source: 'mining', instanceId: 'shardbelt', nodeId: 'wrong-ore', amount: 1 }).changed, false);
    advance(save, 'extracted', { source: 'mining', instanceId: 'shardbelt', nodeId: 'ore-1', amount: 1 });
    assert.equal(quest.stepId, 'defeat-raider');
    advance(save, 'ship-defeated', { tutorialEnemy: true, shipId: 'ash-moth' });
    assert.equal(quest.stepId, 'salvage-black-box');

    quest.flags.blackBoxTargetId = 'recorder-1';
    assert.equal(advance(save, 'extracted', { source: 'salvage', instanceId: 'mourning-line', nodeId: 'wrong-wreck', amount: 1 }).changed, false);
    advance(save, 'extracted', { source: 'salvage', instanceId: 'mourning-line', nodeId: 'recorder-1', amount: 1 });
    assert.equal(quest.stepId, 'dock-cairn');
    advance(save, 'docked', { locationId: 'cairn' });
    assert.equal(quest.stepId, 'family-choice');

    const choiceSave = structuredClone(save);
    advance(choiceSave, 'choice', { choiceId: 'trust-rin' });
    assert.equal(getTutorialQuest(choiceSave).choices.recorder, 'trust-rin');
    assert.equal(getTutorialQuest(choiceSave).stepId, 'cross-meridian-gate');
    advance(choiceSave, 'system-arrived', { systemId: 'meridian', at: 42 });
    assert.equal(getTutorialQuest(choiceSave).stepId, 'complete');
    assert.equal(getTutorialQuest(choiceSave).completedAt, 42);
    assert.equal(choiceSave.world.campaignUnlocked, true);
    assert.equal(isTutorialActive(choiceSave), false);
    assert.equal(tutorialCampaignSummary(choiceSave).chapter, 5);

    for (const choiceId of ['tell-mara', 'keep-recorder']) {
        const branch = structuredClone(save);
        advance(branch, 'choice', { choiceId });
        assert.equal(getTutorialQuest(branch).choices.recorder, choiceId);
        assert.equal(getTutorialQuest(branch).stepId, 'cross-meridian-gate');
    }
}

{
    const save = freshSave();
    save.player.cargo.food = 2;
    startTutorialCampaign(save);
    advance(save, 'talked', { personId: 'mara-vek' });
    advance(save, 'talked', { personId: 'rin-vek' });
    assert.equal(getTutorialQuest(save).stepId, 'launch-helix', 'food bought before the bar conversations still satisfies the market lesson');
    assert.equal(getTutorialQuest(save).flags.suppliesBought, 2);
}

{
    const save = freshSave();
    startTutorialCampaign(save);
    const result = skipTutorialCampaign(save, 12);
    assert.equal(result.changed, true);
    assert.equal(result.fromStepId, 'meet-family');
    assert.equal(getTutorialQuest(save).flags.skipped, true);
    assert.equal(getTutorialQuest(save).completedAt, 12);
    assert.equal(save.world.campaignUnlocked, true);
    assert.equal(skipTutorialCampaign(save, 13).changed, false);
}

console.log('tutorial campaign tests passed');
