// quests.js — quest-state machine for the main story arc.
//
// Save schema (SAVE_VERSION 5+): save.quests = Array<QuestState>
//   {
//     id: string,            // quest id (e.g. 'first-contact')
//     stepId: string,        // current story step ('intro' → 'fly-to-vesper' → …)
//     flags: Record<string, string|number|boolean|number[]>, // world facts learned/done
//     choices: Record<string, string>,                // player decisions, by beat
//     startedAt: number,     // world time the quest began
//     completedAt?: number,  // world time it ended (present = finished)
//   }
//
// Records are plain JSON so they survive the autosave round-trip untouched.
// This module is the ONLY code that reads or writes them; missions can hang
// flags and choices off quests through these helpers and never touch the
// schema again. Quest *definitions* (steps, briefings, gating) come later on
// top of this machine.
export const getQuest = (save, id) => save.quests.find((quest) => quest.id === id);
export const isQuestActive = (save, id) => {
    const quest = getQuest(save, id);
    return Boolean(quest && quest.completedAt === undefined);
};
export const startQuest = (save, id, startedAt) => {
    if (getQuest(save, id))
        return getQuest(save, id);
    const quest = { id, stepId: 'intro', flags: {}, choices: {}, startedAt, completedAt: undefined };
    save.quests.push(quest);
    return quest;
};
export const setStep = (save, id, stepId) => {
    const quest = getQuest(save, id);
    if (quest)
        quest.stepId = stepId;
    return quest;
};
export const setFlag = (save, id, key, value) => {
    const quest = getQuest(save, id);
    if (quest)
        quest.flags[key] = value;
    return quest;
};
export const recordChoice = (save, id, key, choiceId) => {
    const quest = getQuest(save, id);
    if (quest)
        quest.choices[key] = choiceId;
    return quest;
};
export const completeQuest = (save, id, completedAt) => {
    const quest = getQuest(save, id);
    if (quest && quest.completedAt === undefined)
        quest.completedAt = completedAt;
    return quest;
};

const plainRecord = (candidate, valueType = 'mixed') => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
        return {};
    const result = {};
    for (const [key, value] of Object.entries(candidate).slice(0, 64)) {
        if (typeof key !== 'string' || key.length < 1 || key.length > 64)
            continue;
        if (valueType === 'string') {
            if (typeof value === 'string')
                result[key] = value;
            continue;
        }
        if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
            result[key] = value;
            continue;
        }
        // Finished race quests keep checkpoint splits in a shallow numeric
        // array. Preserve that existing save shape while still rejecting
        // nested or unbounded data at hydration.
        if (Array.isArray(value) && value.length <= 128 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)))
            result[key] = [...value];
    }
    return result;
};

// Save hydration treats quest records as untrusted JSON. Keep racing and
// future story ids intact while removing malformed values that would break a
// step reducer or leak large nested payloads into every autosave.
export const normalizeQuestStates = (candidate) => {
    if (!Array.isArray(candidate))
        return [];
    const unique = new Map();
    for (const entry of candidate.slice(0, 64)) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            continue;
        const id = typeof entry.id === 'string' && /^[a-z0-9-]{1,64}$/.test(entry.id) ? entry.id : undefined;
        if (!id || unique.has(id))
            continue;
        const startedAt = Number(entry.startedAt);
        const completedAt = Number(entry.completedAt);
        unique.set(id, {
            id,
            stepId: typeof entry.stepId === 'string' && /^[a-z0-9-]{1,64}$/.test(entry.stepId) ? entry.stepId : 'intro',
            flags: plainRecord(entry.flags),
            choices: plainRecord(entry.choices, 'string'),
            startedAt: Number.isFinite(startedAt) ? Math.max(0, startedAt) : 0,
            ...(entry.completedAt !== undefined && Number.isFinite(completedAt) ? { completedAt: Math.max(0, completedAt) } : {}),
        });
    }
    return [...unique.values()];
};
