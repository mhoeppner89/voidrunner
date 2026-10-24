import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DE_CATALOG } from '../../src/game/i18n-de.js';

// German is the default language and an untranslated key falls back to the
// English source string (i18n.js). That fallback keeps the game playable, but
// it also hides whole labels in a German build: "FIRE", "PAUSE", "SELECT" and
// "MISSION CARGO" rendered English for months because nothing looked for them.
// This test collects every literal key handed to t()/translate() in src/ and
// fails when the catalog has no entry for it.
const SRC = new URL('../../src/', import.meta.url);
const files = [];
const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
            walk(full);
        else if (entry.name.endsWith('.js'))
            files.push(full);
    }
};
walk(SRC.pathname);

// Source escapes inside the literal ('it\'s') are not part of the key.
const unescape = (text) => text.replace(/\\(['"`\\])/g, '$1');

const callSites = /\b(?:t|translate)\(\s*(['"`])((?:\\.|(?!\1).)*?)\1/g;
const scanned = new Set();
const missing = new Map();
for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(callSites)) {
        const lineStart = text.lastIndexOf('\n', match.index) + 1;
        if (/^\s*(\/\/|\*|\/\*)/.test(text.slice(lineStart, match.index)))
            continue; // commented-out call
        const key = unescape(match[2]);
        if (key.length < 2)
            continue; // template fragments such as t(`${prefix}`) are dynamic
        scanned.add(key);
        if (DE_CATALOG[key] === undefined) {
            const where = path.relative(new URL('../../', import.meta.url).pathname, file);
            missing.set(key, [...(missing.get(key) ?? []), where]);
        }
    }
}

assert.ok(scanned.size > 300, `expected the source tree to hand many keys to t(), scanned ${scanned.size}`);
if (missing.size) {
    const report = [...missing].map(([key, where]) => `  "${key}" — ${[...new Set(where)].join(', ')}`);
    assert.fail(`German falls back to English for ${missing.size} key(s):\n${report.join('\n')}`);
}

console.log(`German catalog covers all ${scanned.size} literal t() keys in src/ — nothing falls back to English.`);
