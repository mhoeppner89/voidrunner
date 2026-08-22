// Headless i18n coverage probe: walks every t('literal') call in the source
// plus every data-driven string the UI localizes at display time, and reports
// keys that lack a German catalog entry. Missing entries fall back to English
// at runtime, so this is a coverage report, not a failure gate — but the
// goal is zero misses.
import { readFileSync } from 'node:fs';
import { DE_CATALOG } from './src/game/i18n-de.js';
import { COMMODITIES, EQUIPMENT, FACTION_NAMES, GUILD_NAMES, GUILD_RANK_NAMES, LOCATIONS, SHIPS } from './src/game/data.js';
import { PILOT_LINES, TIER_LABELS, TEMPERAMENT_LABELS } from './src/game/pilots.js';

const missing = [];
const check = (key, where) => {
    if (!key || typeof key !== 'string')
        return;
    if (DE_CATALOG[key] === undefined)
        missing.push(`${where}: ${key}`);
};

// 1. Every literal t('...') key in the source.
const sourceFiles = ['src/game/ui.js', 'src/game/game.js', 'src/game/missions.js', 'src/game/economy.js', 'src/game/worldData.js', 'src/main.js'];
// Negative lookbehind keeps identifiers ending in `t(` (split, closest, get,
// setText, buildContact, renderMarketPoint...) from matching; escaped quotes
// in the source are unescaped to match the catalog's real-apostrophe keys.
// Both single- and double-quoted t() calls are scanned.
const literalKey = /(?<![A-Za-z0-9_$])t\('((?:[^'\\]|\\.)*)'|(?<![A-Za-z0-9_$])t\x22((?:[^"\\]|\\.)*)\x22/g;
for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    let match;
    while ((match = literalKey.exec(source)) !== null) {
        const raw = match[1] ?? match[2];
        check(raw.replace(/\\'/g, "'").replace(/\\"/g, '"'), file);
    }
}

// 2. Data-driven strings localized at display time (t(entry.name) etc.).
for (const [id, entry] of Object.entries(COMMODITIES)) {
    check(entry.name, `commodity:${id}`);
    check(entry.description, `commodity:${id}`);
    check(entry.category, `commodity:${id}`);
}
for (const [id, entry] of Object.entries(EQUIPMENT)) {
    check(entry.name, `equipment:${id}`);
    check(entry.description, `equipment:${id}`);
    check(entry.stat, `equipment:${id}`);
    check(entry.category.toUpperCase(), `equipment:${id}`);
}
for (const [id, name] of Object.entries(FACTION_NAMES))
    check(name, `faction:${id}`);
for (const [id, name] of Object.entries(GUILD_NAMES))
    check(name, `guild:${id}`);
for (const [id, ranks] of Object.entries(GUILD_RANK_NAMES))
    ranks.forEach((rank) => check(rank, `guild-rank:${id}`));
for (const [id, ship] of Object.entries(SHIPS)) {
    check(ship.className, `ship:${id}`);
    check(ship.personality, `ship:${id}`);
    check(ship.description, `ship:${id}`);
}
for (const [id, location] of Object.entries(LOCATIONS)) {
    check(location.kind, `location:${id}`);
    check(location.kind.toUpperCase(), `location:${id}`);
    for (const person of location.people ?? []) {
        check(person.role, `person:${person.id}`);
        check(person.affiliation, `person:${person.id}`);
        person.lines.forEach((line) => check(line, `person:${person.id}`));
    }
}
for (const [tier, label] of Object.entries(TIER_LABELS))
    check(label, `tier:${tier}`);
for (const [temp, label] of Object.entries(TEMPERAMENT_LABELS))
    check(label, `temperament:${temp}`);
const walkPilotLines = (node, path) => {
    if (typeof node === 'string')
        check(node, `pilot-lines:${path}`);
    else if (Array.isArray(node))
        node.forEach((entry, index) => walkPilotLines(entry, `${path}[${index}]`));
    else if (node && typeof node === 'object')
        Object.entries(node).forEach(([key, value]) => walkPilotLines(value, `${path}.${key}`));
};
walkPilotLines(PILOT_LINES, 'PILOT_LINES');

const uniq = [...new Set(missing)];
if (uniq.length === 0) {
    console.log(`i18n coverage OK — no missing German entries (${Object.keys(DE_CATALOG).length} catalog entries).`);
}
else {
    console.log(`Missing German entries (${uniq.length}):`);
    for (const entry of uniq)
        console.log(`  - ${entry}`);
}
