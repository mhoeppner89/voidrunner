import '../src/game/offlineImportHooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const saves = await import('../src/game/save.js');
test('denied storage access does not prevent loading defaults or an in-memory game', () => {
    const previous = globalThis.window;
    globalThis.window = Object.defineProperty({}, 'localStorage', { get() { throw new Error('denied'); } });
    try {
        assert.equal(saves.loadGame(), undefined);
        assert.equal(saves.loadSettingsPreferences(), undefined);
        assert.equal(saves.saveGame({}), false);
        assert.equal(saves.saveSettingsPreferences({}), false);
        assert.equal(saves.hasSavedGame(), false);
        assert.doesNotThrow(() => saves.deleteSave());
    } finally { globalThis.window = previous; }
});
test('storage operations failing after access are handled', () => {
    const previous = globalThis.window;
    const warn = console.warn;
    globalThis.window = { localStorage: { getItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } } };
    console.warn = () => {};
    try {
        assert.equal(saves.hasSavedGame(), false);
        assert.doesNotThrow(() => saves.deleteSave());
    } finally { globalThis.window = previous; console.warn = warn; }
});
