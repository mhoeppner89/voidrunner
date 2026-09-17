import { completeQuest, getQuest, recordChoice, setFlag, setStep, startQuest } from './quests.js';

export const TUTORIAL_QUEST_ID = 'the-spare-key';
export const TUTORIAL_STARTING_CREDITS = 3500;
export const TUTORIAL_REQUIRED_SUPPLIES = 2;
export const TUTORIAL_CHAPTER_COUNT = 4;
export const TUTORIAL_MARA_CALL_MIN_COMBAT_VALUE = 50000;

const STEP_DEFINITIONS = {
    'meet-family': {
        chapter: 1,
        chapterTitle: 'The Spare Key',
        objective: 'Meet Mara and Rin in the Helix bar.',
        detail: 'Talk to Mara and Rin in the Helix bar, in either order.',
        destinationId: 'helix',
    },
    'buy-supplies': {
        chapter: 1,
        chapterTitle: 'The Spare Key',
        objective: 'Buy 2 Protein Packs at the Helix commodity market.',
        detail: 'Open the Helix commodity market and buy two Protein Packs. If the hold is full, sell other cargo first.',
        destinationId: 'helix',
    },
    'launch-helix': {
        chapter: 1,
        chapterTitle: 'The Spare Key',
        objective: 'Launch the Wayfarer from Helix.',
        detail: 'Rin is waiting outside in the Second Light. Launch when you are ready.',
        destinationId: 'vesper',
    },
    'fit-upgrade': {
        chapter: 1, chapterTitle: 'The Spare Key',
        objective: 'Fit Rin’s spare radar at the Helix outfitter.',
        detail: 'Enter Ship Outfitting at the market, open Ship Systems and install the owned Long-Baseline Radar in a free utility slot.',
        destinationId: 'helix',
    },
    'plot-vesper': {
        chapter: 2, chapterTitle: 'Family Business',
        objective: 'Select Vesper on the navigation map.',
        detail: 'Tap the centre radar and select VESPER on the sector chart. The gold mission marker marks the destination.',
        destinationId: 'vesper',
    },
    'flight-checks': {
        chapter: 2, chapterTitle: 'Family Business',
        objective: 'Try the flight controls with Rin.',
        detail: 'Practise thrust, steering, a short afterburner burst and both cockpit monitors before engaging hyperdrive.',
        destinationId: 'vesper',
    },
    'fly-vesper': {
        chapter: 2,
        chapterTitle: 'Family Business',
        objective: 'Fly to Vesper Colony and land.',
        detail: 'Vesper is plotted. Engage HYPERDRIVE, then approach slowly with Vesper selected for automatic landing.',
        destinationId: 'vesper',
    },
    'sell-supplies': {
        chapter: 2,
        chapterTitle: 'Family Business',
        objective: 'Sell the 2 Protein Packs at Vesper.',
        detail: 'Sell two Protein Packs at the Vesper commodity market.',
        destinationId: 'vesper',
    },
    'mine-shardbelt': {
        chapter: 3,
        chapterTitle: 'Blood in the Belt',
        objective: 'Recover 1 unit of ore from the Shardbelt.',
        detail: 'Hyperdrive to the Shardbelt. Approach the marked deposit until the automatic scan completes, then tap MINE to deploy your drones. Tap RECALL before leaving; hyperdrive waits for their return.',
        destinationId: 'shardbelt',
    },
    'service-ship': {
        chapter: 2, chapterTitle: 'Family Business',
        objective: 'Check the Wayfarer at Vesper’s service desk.',
        detail: 'Open SERVICES and refill fuel and ordnance; repair the hull if needed. Shields recharge in flight, hull does not.',
        destinationId: 'vesper',
    },
    'check-weapons': {
        chapter: 3, chapterTitle: 'Blood in the Belt',
        objective: 'Prepare for combat.',
        detail: 'Your beam lasers draw on regenerating energy. Release fire briefly if the capacitor runs low. Only missiles need ammunition.',
        destinationId: 'shardbelt',
    },
    'collect-cargo': {
        chapter: 3, chapterTitle: 'Blood in the Belt',
        objective: 'Collect the marked cargo crate.',
        detail: 'Approach the marked crate slowly; it is collected automatically at close range. The left monitor opens your hold.',
        destinationId: 'shardbelt',
    },
    'defeat-raider': {
        chapter: 3,
        chapterTitle: 'Blood in the Belt',
        objective: 'Defeat Ash Moth.',
        detail: 'Ash Moth is selected and combat mode is active. Hold FIRE with a clear line of sight. Rin helps if the fight drags on.',
        destinationId: 'shardbelt',
    },
    'salvage-black-box': {
        chapter: 4,
        chapterTitle: 'What the Wreck Kept',
        objective: 'Recover the marked salvage in Mourning Line.',
        detail: 'Select CONVOY RECORDER SIGNAL in the map contacts, hyperdrive to Mourning Line, then hold SALVAGE within range of the marker.',
        destinationId: 'mourning-line',
    },
    'dock-cairn': {
        chapter: 4,
        chapterTitle: 'What the Wreck Kept',
        objective: 'Dock at Cairn Yard and confront Rin.',
        detail: 'The carrier recorder holds your mother’s radio transmissions. Select Cairn Yard and approach slowly to dock.',
        destinationId: 'cairn',
    },
    'family-choice': {
        chapter: 4,
        chapterTitle: 'What the Wreck Kept',
        objective: 'Decide what to do with the recorder.',
        detail: 'Talk to Rin at the Cairn berth. You can leave the conversation and return before deciding.',
        destinationId: 'cairn',
    },
    'galaxy-map': {
        chapter: 4, chapterTitle: 'What the Wreck Kept',
        objective: 'Plot the Meridian gate on the galaxy map.',
        detail: 'Launch, open the GALAXY map and select MERIDIAN once, then close it. The gate route stays saved for later.',
        destinationId: 'cairn',
    },
    'cross-meridian-gate': {
        chapter: 4,
        chapterTitle: 'What the Wreck Kept',
        objective: 'Cross the Helios–Meridian jump gate to look for Rin.',
        detail: 'Rin went ahead and has gone quiet. When you are ready, plot Meridian and cross the gate.',
        destinationId: 'verge-meridian-point',
    },
    complete: {
        chapter: 4,
        chapterTitle: 'What the Wreck Kept',
        objective: 'The prologue is complete.',
        detail: 'Mara is waiting for word from Rin. Find her, keep the Wayfarer flying, and explore, trade, race and take contracts on your own terms.',
        destinationId: 'meridian-prime',
    },
};

export const TUTORIAL_STEPS = Object.freeze(Object.fromEntries(
    Object.entries(STEP_DEFINITIONS).map(([id, value]) => [id, Object.freeze({ id, ...value })]),
));

export const TUTORIAL_FLIGHT_LESSONS = [
    {id:'thrust', objective:'Raise the thrust slider and get moving.', detail:'The slider on the left sets your speed.'},
    {id:'steering', objective:'Turn the Wayfarer using the joystick or tilt controls.', detail:'The marker at the canopy edge points toward a selected target outside your view.'},
    {id:'boost', objective:'Hold the gold afterburner button for a short burst.', detail:'Full thrust, then hold the gold button for two seconds. Afterburner consumes fuel; ordinary thrust does not.'},
    {id:'target-monitor', objective:'Tap the right target monitor to cycle contacts.', detail:'The right monitor cycles targets and shows distance, scan results and enemy shields and hull.'},
    {id:'ship-monitor', objective:'Open the left ship monitor and review your ship.', detail:'Hull, energy, cargo and the mission objective are on the left monitor.'},
];

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
// Keep preparation at its teaching port. Off-route saves can still launch home.
export const tutorialLaunchBlock = (save) => {
    if (!isTutorialActive(save)) return undefined;
    const step = getTutorialQuest(save).stepId, dock = save.player.dockedAt;
    if (dock === 'helix' && step === 'meet-family') return 'Finish your conversations with Mara and Rin before launching.';
    if (dock === 'helix' && step === 'fit-upgrade') return 'Fit the spare radar at the outfitter before launching.';
    if (dock === 'helix' && (step === 'buy-supplies' || step === 'launch-helix') && positiveInteger(save.player.cargo?.food) < 2)
        return 'Buy two Protein Packs at the Helix commodity market before launching.';
    if (dock === 'vesper' && step === 'sell-supplies') return 'Sell the family delivery at the Vesper commodity market before launching.';
    if (dock === 'vesper' && step === 'service-ship') return 'Visit SERVICES and finish the ship check before launching.';
    if (dock === 'cairn' && step === 'family-choice') return 'Decide what to do with the recorder before launching.';
    return undefined;
};
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
        if ((event.topicId && event.topicId !== 'greeting') || (event.locationId && event.locationId !== 'helix'))
            return {changed:false,quest};
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
            return transition(save, quest, loaded >= TUTORIAL_REQUIRED_SUPPLIES ? 'fit-upgrade' : 'buy-supplies');
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
            return transition(save, quest, 'fit-upgrade');
        return { changed: loaded !== previous, quest, fromStepId: stepId, stepId };
    }
    if (stepId === 'launch-helix' && type === 'traded' && event.locationId === 'helix' && event.commodityId === 'food'
        && positiveInteger(event.cargoAfter) < TUTORIAL_REQUIRED_SUPPLIES) {
        setFlag(save,TUTORIAL_QUEST_ID,'suppliesBought',positiveInteger(event.cargoAfter));
        return transition(save,quest,'buy-supplies');
    }
    if (stepId === 'launch-helix' && type === 'launched' && event.fromLocationId === 'helix'
        && (event.foodCargo === undefined || positiveInteger(event.foodCargo) >= TUTORIAL_REQUIRED_SUPPLIES))
        return transition(save, quest, 'plot-vesper');
    if (stepId === 'fit-upgrade' && type === 'outfitted' && event.radarInstalled && event.locationId === 'helix')
        return transition(save, quest, 'launch-helix');
    if (stepId === 'plot-vesper' && type === 'map-selected' && event.kind === 'location' && event.id === 'vesper')
        return transition(save, quest, 'flight-checks');
    if (stepId === 'flight-checks' && type === 'flight-lesson' && TUTORIAL_FLIGHT_LESSONS.some(lesson => lesson.id === event.id)) {
        const key = 'learned-' + event.id;
        if (quest.flags[key]) return {changed:false,quest};
        setFlag(save,TUTORIAL_QUEST_ID,key,true);
        if (TUTORIAL_FLIGHT_LESSONS.every(lesson => quest.flags['learned-' + lesson.id]))
            return transition(save,quest,'fly-vesper');
        return {changed:true,quest,fromStepId:stepId,stepId};
    }
    if (stepId === 'fly-vesper' && type === 'docked' && event.locationId === 'vesper') {
        setFlag(save, TUTORIAL_QUEST_ID, 'suppliesAtVesper', Math.max(TUTORIAL_REQUIRED_SUPPLIES, positiveInteger(event.foodCargo)));
        return transition(save, quest, 'sell-supplies');
    }
    if (stepId === 'sell-supplies' && type === 'traded' && event.locationId === 'vesper'
        && event.kind === 'buy' && event.commodityId === 'food') {
        // Count units sold even if the player buys more stock between sales.
        setFlag(save, TUTORIAL_QUEST_ID, 'suppliesAtVesper', positiveInteger(quest.flags.suppliesSold) + positiveInteger(event.cargoAfter));
        return {changed:true,quest,fromStepId:stepId,stepId};
    }
    if (stepId === 'sell-supplies' && type === 'traded'
        && event.locationId === 'vesper' && event.kind === 'sell' && event.commodityId === 'food') {
        const baseline = quest.flags.suppliesAtVesper === undefined ? TUTORIAL_REQUIRED_SUPPLIES : positiveInteger(quest.flags.suppliesAtVesper);
        const sold = Math.min(TUTORIAL_REQUIRED_SUPPLIES, Math.max(positiveInteger(quest.flags.suppliesSold), baseline - positiveInteger(event.cargoAfter)));
        const changed = sold !== positiveInteger(quest.flags.suppliesSold);
        if (changed)
            setFlag(save, TUTORIAL_QUEST_ID, 'suppliesSold', sold);
        if (sold >= TUTORIAL_REQUIRED_SUPPLIES)
            return transition(save, quest, 'service-ship');
        return { changed, quest, fromStepId: stepId, stepId };
    }
    if (stepId === 'service-ship' && type === 'serviced' && event.locationId === 'vesper' && event.ready)
        return transition(save,quest,'mine-shardbelt');
    if (stepId === 'mine-shardbelt' && type === 'extracted' && event.source === 'mining'
        && event.instanceId === 'shardbelt' && positiveInteger(event.amount) > 0
        && (!quest.flags?.oreTargetId || event.nodeId === quest.flags.oreTargetId)) {
        setFlag(save, TUTORIAL_QUEST_ID, 'oreRecovered', true);
        return transition(save, quest, 'defeat-raider');
    }
    if (stepId === 'check-weapons') return transition(save,quest,'defeat-raider');
    if (stepId === 'defeat-raider' && type === 'ship-defeated' && event.tutorialEnemy === true) {
        setFlag(save, TUTORIAL_QUEST_ID, 'tutorialEnemyDefeated', true);
        return transition(save, quest, 'collect-cargo');
    }
    if (stepId === 'collect-cargo' && type === 'cargo-collected' && event.tutorialCargo)
        return transition(save,quest,'salvage-black-box');
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
        return transition(save, quest, 'galaxy-map');
    }
    if (stepId === 'galaxy-map' && type === 'map-selected' && event.kind === 'system' && event.id === 'meridian')
        return transition(save,quest,'cross-meridian-gate');
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
    const lesson = quest.stepId === 'flight-checks' ? TUTORIAL_FLIGHT_LESSONS.find(entry => !quest.flags['learned-' + entry.id]) : undefined;
    if (lesson) progress = `${TUTORIAL_FLIGHT_LESSONS.filter(entry => quest.flags['learned-' + entry.id]).length}/${TUTORIAL_FLIGHT_LESSONS.length}`;
    if (quest.stepId === 'check-weapons') progress = `${Number(Boolean(quest.flags['weapon-A'])) + Number(Boolean(quest.flags['weapon-B']))}/2`;
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
        objective: lesson?.objective ?? step.objective,
        detail: lesson?.detail ?? step.detail,
        lessonId: lesson?.id,
        destinationId: step.destinationId,
        progress,
        choice: quest.choices?.recorder,
        choiceLabel: {
            'tell-mara':'You asked Rin to send Mara the recording.',
            'trust-rin':'You chose to trust Rin and keep investigating together.',
            'keep-recorder':'You kept the recorder and reserved your judgment.',
        }[quest.choices?.recorder],
    };
};

export const tutorialDialogue = (save, personId) => {
    const quest = getTutorialQuest(save);
    if (!quest) return undefined;
    if (personId === 'mara-vek' && quest.choices?.recorder === 'tell-mara')
        return 'Rin sent me the recording. I wish I had heard this years ago. Thank you for making sure I heard it now. We have a great deal to talk about.';
    if (quest.completedAt !== undefined) {
        if (personId === 'rin-vek' && quest.choices?.recorder)
            return 'I have no new lead on the ledger yet. Keep the recording safe. Whatever you decide to do next, I am glad we talked at Cairn.';
        return undefined;
    }
    // talkToNpc records the conversation before the dialogue panel renders.
    // Use the durable greeting count so each family member's first line still
    // appears after that same click advances the objective flags.
    const greetingCount = positiveInteger(save.world?.npcMemory?.[personId]?.topics?.greeting);
    const firstGreeting = greetingCount <= 1;
    if (personId === 'mara-vek') {
        if (firstGreeting)
            return 'There you are. Your mother left two keys to that Wayfarer. Rin took one; I kept the spare above this bar until you were ready.';
        if (!quest.flags?.metRin)
            return 'The ship is yours, but Rin is still pretending this is only a delivery run. Talk to your sister before either of you leaves.';
        if (quest.stepId === 'buy-supplies' || quest.stepId === 'launch-helix')
            return 'Two Protein Packs for Vesper. Small work, honest work. That is how this family keeps a ship flying.';
        if (['galaxy-map','cross-meridian-gate'].includes(quest.stepId))
            return 'No word from Rin since she jumped. Go find her when the Wayfarer is ready.';
        return 'Bring each other home. Whatever else the Vek name means, it has to mean that.';
    }
    if (personId === 'rin-vek') {
        if (firstGreeting)
            return 'I checked the Wayfarer twice. Buy two Protein Packs for Vesper, then launch. I will take the Second Light and stay on your wing.';
        if (quest.stepId === 'buy-supplies')
            return 'Use the commodity market, not the contract board. We own this cargo, and Vesper pays us when it arrives.';
        if (quest.stepId === 'launch-helix')
            return 'I will be outside the dock. You fly the Wayfarer; I will follow your lead.';
        return 'We can take our time. Check the route when you are ready; I will stay close.';
    }
    // Rin is ahead through the gate: Mara's block above carries the worrying
    // lines so the silence reads as the story while the player prepares.
    return undefined;
};
