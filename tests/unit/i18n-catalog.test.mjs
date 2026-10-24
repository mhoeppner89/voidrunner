import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DE_CATALOG } from '../../src/game/i18n-de.js';

// The catalog is ONE object literal. It used to be a literal plus ~35
// Object.assign(DE_CATALOG, …) blocks, so a key could be defined twice and the
// later definition silently won — which is how "+50% target range" once read
// 25 % and the prologue objective read "Das Prolog". Tests below fail on both
// the structure and any conflicting re-definition.
const source = fs.readFileSync(new URL('../../src/game/i18n-de.js', import.meta.url), 'utf8');

assert.equal(source.match(/export const DE_CATALOG\b/g)?.length, 1, 'the catalog must be declared once');
assert.ok(!/Object\.assign\(DE_CATALOG/.test(source),
    'the catalog must stay a single table; assign blocks hide duplicate keys and let the last definition win');

// In a single table a duplicate key is only redundant text — but it is also the
// exact shape the old stacked blocks took, so treat any duplicate as a failure.
const pattern = /(['"])((?:\\.|(?!\1).){1,400}?)\1\s*:\s*(['"])((?:\\.|(?!\3).)*?)\3\s*,?/g;
const seen = new Map();
let keys = 0;
for (const match of source.matchAll(pattern)) {
    const [, , key, , value] = match;
    keys++;
    assert.ok(!seen.has(key), seen.get(key) === value
        ? `German catalog lists "${key}" twice with the same text`
        : `German catalog defines "${key}" twice with different text ("${seen.get(key)}" / "${value}")`);
    seen.set(key, value);
}
assert.ok(keys > 3000, `expected the full catalog, parsed ${keys} entries`);

// A translation must keep every {placeholder} of its key, or the value renders
// with a hole in it.
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',');
for (const [key, value] of Object.entries(DE_CATALOG)) {
    if (typeof value !== 'string')
        continue;
    assert.ok(value.trim().length > 0, `German catalog has an empty value for "${key}"`);
    assert.equal(placeholders(value), placeholders(key), `German value for "${key}" loses or renames a placeholder`);
}

// Proper nouns stay English: ship classes, mode names and course names are
// names, not descriptions.
assert.equal(DE_CATALOG['Vanguard pair'], 'Vanguard-Paar');
assert.match(DE_CATALOG['A veteran twin-hull enters first. Its novice wing arrives after twenty seconds. Use wrecks against their seekers.'], /Doppelrumpf/);
assert.equal(DE_CATALOG['Hard Run'], 'Hard Run');
assert.equal(DE_CATALOG['Shard Gauntlet'], 'Shard Gauntlet');
assert.equal(DE_CATALOG['MISSION BEACON · {location}'], 'MISSIONSMARKER · {location}');

// Meaning survives translation: no shifted numbers, no singular/plural slips.
assert.equal(DE_CATALOG['The prologue is complete.'], 'Der Prolog ist abgeschlossen.');
assert.equal(DE_CATALOG['+50% target range · +50% scan range'], '+50 % Zielreichweite · +50 % Scanreichweite');
assert.equal(DE_CATALOG['{count} SHIPS HOLDING FIRE'], '{count} SCHIFFE HALTEN FEUER');
assert.match(DE_CATALOG['Precision shots bypass 15% of shields. Slow firing and high energy cost.'], /15 %/);

console.log('German catalog: one table, no conflicting duplicates, placeholders intact, proper names and numbers unchanged.');
