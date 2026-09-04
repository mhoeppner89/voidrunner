import { completeQuest, getQuest, recordChoice, setFlag, setStep, startQuest } from './quests.js';

export const TUTORIAL_QUEST_ID = 'the-spare-key';
export const TUTORIAL_STARTING_CREDITS = 3500;
export const TUTORIAL_REQUIRED_SUPPLIES = 2;
export const TUTORIAL_CHAPTER_COUNT = 5;

const STEP_DEFINITIONS = {
    'meet-family': {
        chapter: 1,
        chapterTitle: 'The Spare Key',
        objective: 'Meet Mara and Rin in the Helix bar.',
        detail: 'Open the bar from the concourse and speak to both members of your family.',
        destinationId: 'helix',
    },
    'buy-supplies': {
        chapter: 1,
        chapterTitle: 'The Spare Key',
        objective: 'Buy 2 Protein Packs at the Helix commodity market.',
        detail: 'Open the market, choose Protein Packs, and load two units for Vesper.',
        destinationId: 'helix',
    },
    'launch-helix': {
        chapter: 1,
        chapterTitle: 'The Spare Key',
        objective: 'Launch the Wayfarer from Helix.',
        detail: 'Rin is waiting outside in the Second Light. Launch when you are ready.',
        destinationId: 'vesper',
    },
    'fly-vesper': {
        chapter: 2,
        chapterTitle: 'Family Business',
        objective: 'Fly to Vesper Colony and land.',
        detail: 'Use the navigation map or target monitor, engage the local hyperdrive, then approach slowly for automatic landing.',
        destinationId: 'vesper',
    },
    'sell-supplies': {
        chapter: 2,
        chapterTitle: 'Family Business',
        objective: 'Sell the 2 Protein Packs at Vesper.',
        detail: 'The cargo-first market manifest shows what is already in your hold. Sell the family delivery there.',
        destinationId: 'vesper',
    },
    'mine-shardbelt': {
        chapter: 3,
        chapterTitle: 'Blood in the Belt',
        objective: 'Recover 1 unit of ore from the Shardbelt.',
        detail: 'Fly to the field, lock the marked deposit, wait for the automatic scan, then hold MINE in range.',
        destinationId: 'shardbelt',
    },
    'defeat-raider': {
        chapter: 3,
        chapterTitle: 'Blood in the Belt',
        objective: 'Drive off the raider.',
        detail: 'The hostile is already locked. Use your guns, and try the selected missile launcher when you have a clear line.',
        destinationId: 'shardbelt',
    },
    'salvage-black-box': {
        chapter: 4,
        chapterTitle: 'What the Wreck Kept',
        objective: 'Recover the marked recorder in Mourning Line.',
        detail: 'Enter the wreck field, lock the marked salvage point, wait for its scan, and hold SALVAGE in range.',
        destinationId: 'mourning-line',
    },
    'dock-cairn': {
        chapter: 4,
        chapterTitle: 'What the Wreck Kept',
        objective: 'Dock at Cairn Yard and confront Rin.',
        detail: 'The recorder belonged to your mother. Cairn Yard is beside the wreck field; approach slowly for automatic docking.',
        destinationId: 'cairn',
    },
    'family-choice': {
        chapter: 4,
        chapterTitle: 'What the Wreck Kept',
        objective: 'Decide what to do with the recorder.',
        detail: 'Rin is waiting at the berth. Hear their account, then decide where your trust lies.',
        destinationId: 'cairn',
    },
    'cross-meridian-gate': {
        chapter: 5,
        chapterTitle: 'The Other Version',
        objective: 'Cross the Helios–Meridian jump gate.',
        detail: 'Set a course for Meridian Prime, approach the physical jump point, then fly through its open aperture.',
        destinationId: 'meridian-prime',
    },
    complete: {
        chapter: 5,
        chapterTitle: 'The Other Version',
        objective: 'The prologue is complete.',
        detail: 'The original evacuation ledger is somewhere on Meridian Prime. Rin has gone ahead.',
        destinationId: 'meridian-prime',
    },
};

export const TUTORIAL_STEPS = Object.freeze(Object.fromEntries(
    Object.entries(STEP_DEFINITIONS).map(([id, value]) => [id, Object.freeze({ id, ...value })]),
));

const choices = new Set(['tell-mara', 'trust-rin', 'keep-recorder']);
const transition = (save, quest, nextStepId) => {
    const fromStepId = quest.stepId;
    if (!TUTORIAL_STEPS[nextStepId] || fromStepId === nextStepId)
        return { changed: false, quest, fromStepId, stepId: fromStepId };
    setStep(save, TUTORIAL_QUEST_ID, nextStepId);
    return { changed: true, quest, fromStepId, stepId: nextStepId };
};
const positiveInteger = (value) => Math.max(0, Math.floor(Number(value) || 0));

export const getTutorialQuest = (save) => Array.isArray(save?.quests) ? getQuest(save, TUTORIAL_QUEST_ID) : undefined;
export const isTutorialActive = (save) => {
    const quest = getTutorialQuest(save);
    return Boolean(quest && quest.completedAt === undefined && quest.flags?.skipped !== true);
};
export const tutorialContentUnlocked = (save) => !isTutorialActive(save);
export const tutorialStep = (save) => {
    const quest = getTutorialQuest(save);
    return quest ? TUTORIAL_STEPS[quest.stepId] ?? TUTORIAL_STEPS['meet-family'] : undefined;
};

export const startTutorialCampaign = (save, startedAt = save?.world?.time ?? 0) => {
    if (!save || !Array.isArray(save.quests))
        return undefined;
    const existing = getTutorialQuest(save);
    const quest = startQuest(save, TUTORIAL_QUEST_ID, startedAt);
    if (existing)
        return quest;
    quest.stepId = 'meet-family';
    quest.flags = {
        story: true,
        metMara: false,
        metRin: false,
        suppliesBought: 0,
        suppliesSold: 0,
        tutorialEnemyDefeated: false,
        blackBoxRecovered: false,
    };
    quest.choices = {};
    save.player.credits = TUTORIAL_STARTING_CREDITS;
    save.player.navTargetId = 'helix';
    save.world.campaignUnlocked = false;
    return quest;
};

export const skipTutorialCampaign = (save, completedAt = save?.world?.time ?? 0) => {
    const quest = getTutorialQuest(save);
    if (!quest || quest.completedAt !== undefined)
        return { changed: false, quest };
    const fromStepId = quest.stepId;
    setFlag(save, TUTORIAL_QUEST_ID, 'skipped', true);
    setStep(save, TUTORIAL_QUEST_ID, 'complete');
    completeQuest(save, TUTORIAL_QUEST_ID, completedAt);
    save.world.campaignUnlocked = true;
    return { changed: true, quest, fromStepId, stepId: 'complete', skipped: true, completed: true };
};

export const advanceTutorialCampaign = (save, event = {}) => {
    const quest = getTutorialQuest(save);
    if (!quest || quest.completedAt !== undefined || quest.flags?.skipped)
        return { changed: false, quest };
    const type = String(event.type ?? '');
    const stepId = quest.stepId;

    if (stepId === 'meet-family' && type === 'talked') {
        const key = event.personId === 'mara-vek' ? 'metMara' : event.personId === 'rin-vek' ? 'metRin' : undefined;
        const changed = Boolean(key && quest.flags[key] !== true);
        if (event.personId === 'mara-vek')
            setFlag(save, TUTORIAL_QUEST_ID, 'metMara', true);
        if (event.personId === 'rin-vek')
            setFlag(save, TUTORIAL_QUEST_ID, 'metRin', true);
        if (quest.flags.metMara && quest.flags.metRin) {
            // A curious player may visit the market before finishing both bar
            // conversations. Count cargo already aboard so the tutorial never
            // asks them to buy the same delivery twice or leaves them stuck.
            const loaded = positiveInteger(save.player?.cargo?.food);
            if (loaded > 0)
                setFlag(save, TUTORIAL_QUEST_ID, 'suppliesBought', loaded);
            return transition(save, quest, loaded >= TUTORIAL_REQUIRED_SUPPLIES ? 'launch-helix' : 'buy-supplies');
        }
        return { changed, quest, fromStepId: stepId, stepId };
    }
    if (stepId === 'buy-supplies' && type === 'traded'
        && event.locationId === 'helix' && event.kind === 'buy' && event.commodityId === 'food') {
        const loaded = positiveInteger(event.cargoAfter);
        const previous = positiveInteger(quest.flags.suppliesBought);
        if (loaded !== previous)
            setFlag(save, TUTORIAL_QUEST_ID, 'suppliesBought', loaded);
        if (loaded >= TUTORIAL_REQUIRED_SUPPLIES)
            return transition(save, quest, 'launch-helix');
        return { changed: loaded !== previous, quest, fromStepId: stepId, stepId };
    }
    if (stepId === 'launch-helix' && type === 'launched' && event.fromLocationId === 'helix')
        return transition(save, quest, 'fly-vesper');
    if (stepId === 'fly-vesper' && type === 'docked' && event.locationId === 'vesper') {
        setFlag(save, TUTORIAL_QUEST_ID, 'suppliesAtVesper', Math.max(TUTORIAL_REQUIRED_SUPPLIES, positiveInteger(event.foodCargo)));
        return transition(save, quest, 'sell-supplies');
    }
    if (stepId === 'sell-supplies' && type === 'traded'
        && event.locationId === 'vesper' && event.kind === 'sell' && event.commodityId === 'food') {
        const baseline = Math.max(TUTORIAL_REQUIRED_SUPPLIES, positiveInteger(quest.flags.suppliesAtVesper));
        const sold = Math.min(TUTORIAL_REQUIRED_SUPPLIES, Math.max(positiveInteger(quest.flags.suppliesSold), baseline - positiveInteger(event.cargoAfter)));
        const changed = sold !== positiveInteger(quest.flags.suppliesSold);
        if (changed)
            setFlag(save, TUTORIAL_QUEST_ID, 'suppliesSold', sold);
        if (sold >= TUTORIAL_REQUIRED_SUPPLIES)
            return transition(save, quest, 'mine-shardbelt');
        return { changed, quest, fromStepId: stepId, stepId };
    }
    if (stepId === 'mine-shardbelt' && type === 'extracted' && event.source === 'mining'
        && event.instanceId === 'shardbelt' && positiveInteger(event.amount) > 0
        && (!quest.flags?.oreTargetId || event.nodeId === quest.flags.oreTargetId)) {
        setFlag(save, TUTORIAL_QUEST_ID, 'oreRecovered', true);
        return transition(save, quest, 'defeat-raider');
    }
    if (stepId === 'defeat-raider' && type === 'ship-defeated' && event.tutorialEnemy === true) {
        setFlag(save, TUTORIAL_QUEST_ID, 'tutorialEnemyDefeated', true);
        return transition(save, quest, 'salvage-black-box');
    }
    if (stepId === 'salvage-black-box' && type === 'extracted' && event.source === 'salvage'
        && event.instanceId === 'mourning-line' && positiveInteger(event.amount) > 0
        && (!quest.flags?.blackBoxTargetId || event.nodeId === quest.flags.blackBoxTargetId)) {
        setFlag(save, TUTORIAL_QUEST_ID, 'blackBoxRecovered', true);
        setFlag(save, TUTORIAL_QUEST_ID, 'blackBoxNodeId', String(event.nodeId ?? 'unknown'));
        return transition(save, quest, 'dock-cairn');
    }
    if (stepId === 'dock-cairn' && type === 'docked' && event.locationId === 'cairn')
        return transition(save, quest, 'family-choice');
    if (stepId === 'family-choice' && type === 'choice' && choices.has(event.choiceId)) {
        recordChoice(save, TUTORIAL_QUEST_ID, 'recorder', event.choiceId);
        return transition(save, quest, 'cross-meridian-gate');
    }
    if (stepId === 'cross-meridian-gate' && type === 'system-arrived' && event.systemId === 'meridian') {
        const result = transition(save, quest, 'complete');
        completeQuest(save, TUTORIAL_QUEST_ID, Number(event.at) || save.world.time);
        save.world.campaignUnlocked = true;
        return { ...result, completed: true };
    }
    return { changed: false, quest, fromStepId: stepId, stepId };
};

export const tutorialCampaignSummary = (save) => {
    const quest = getTutorialQuest(save);
    if (!quest)
        return undefined;
    const step = TUTORIAL_STEPS[quest.stepId] ?? TUTORIAL_STEPS['meet-family'];
    const metCount = Number(Boolean(quest.flags?.metMara)) + Number(Boolean(quest.flags?.metRin));
    let progress;
    if (quest.stepId === 'meet-family')
        progress = `${metCount}/2`;
    else if (quest.stepId === 'buy-supplies')
        progress = `${Math.min(TUTORIAL_REQUIRED_SUPPLIES, positiveInteger(quest.flags?.suppliesBought))}/${TUTORIAL_REQUIRED_SUPPLIES}`;
    else if (quest.stepId === 'sell-supplies')
        progress = `${Math.min(TUTORIAL_REQUIRED_SUPPLIES, positiveInteger(quest.flags?.suppliesSold))}/${TUTORIAL_REQUIRED_SUPPLIES}`;
    return {
        id: TUTORIAL_QUEST_ID,
        title: 'The Spare Key',
        label: 'FAMILY PROLOGUE',
        active: isTutorialActive(save),
        completed: quest.completedAt !== undefined,
        skipped: quest.flags?.skipped === true,
        stepId: quest.stepId,
        chapter: step.chapter,
        chapterCount: TUTORIAL_CHAPTER_COUNT,
        chapterTitle: step.chapterTitle,
        objective: step.objective,
        detail: step.detail,
        destinationId: step.destinationId,
        progress,
        choice: quest.choices?.recorder,
    };
};

export const tutorialDialogue = (save, personId) => {
    const quest = getTutorialQuest(save);
    if (!quest || quest.completedAt !== undefined)
        return undefined;
    // talkToNpc records the conversation before the dialogue panel renders.
    // Use the durable greeting count so each family member's first line still
    // appears after that same click advances the objective flags.
    const greetingCount = positiveInteger(save.world?.npcMemory?.[personId]?.topics?.greeting);
    const firstGreeting = greetingCount <= 1;
    if (personId === 'mara-vek') {
        if (firstGreeting)
            return 'There you are. Your mother left two keys to that Wayfarer. Rin took one; I kept the spare above this bar until you were ready.';
        if (!quest.flags?.metRin)
            return 'The ship is yours, but Rin is still pretending this is only a delivery run. Talk to your sibling before either of you leaves.';
        if (quest.stepId === 'buy-supplies' || quest.stepId === 'launch-helix')
            return 'Two Protein Packs for Vesper. Small work, honest work. That is how this family keeps a ship flying.';
        return 'Bring each other home. Whatever else the Vek name means, it has to mean that.';
    }
    if (personId === 'rin-vek') {
        if (firstGreeting)
            return 'I checked the Wayfarer twice. Buy two Protein Packs for Vesper, then launch. I will take the Second Light and stay on your wing.';
        if (quest.stepId === 'buy-supplies')
            return 'Use the commodity market, not the contract board. We own this cargo, and Vesper pays us when it arrives.';
        if (quest.stepId === 'launch-helix')
            return 'I will be outside the dock. You fly the Wayfarer; I will follow your lead.';
        return 'We can argue in flight. We usually do.';
    }
    return undefined;
};
