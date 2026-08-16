// quests.js — quest-state machine for the main story arc.
//
// Save schema (SAVE_VERSION 5+): save.quests = Array<QuestState>
//   {
//     id: string,            // quest id (e.g. 'first-contact')
//     stepId: string,        // current story step ('intro' → 'fly-to-vesper' → …)
//     flags: Record<string, string|number|boolean>,   // world facts learned/done
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
