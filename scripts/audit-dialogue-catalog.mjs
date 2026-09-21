// German catalog hygiene: which live strings are untranslated, which catalog
// keys nothing references any more, and which entries only fail to match the
// source on punctuation (the drift that silently ships English to a German
// player).
//
//   node scripts/audit-dialogue-catalog.mjs            # summary
//   node scripts/audit-dialogue-catalog.mjs --dead     # list dead prose keys
//   node scripts/audit-dialogue-catalog.mjs --missing  # list untranslated strings
//   node scripts/audit-dialogue-catalog.mjs --drift    # list punctuation drift
//
// The scan is static: it matches t('…') literals and the shipped string data,
// so a key assembled at runtime can be reported as dead — check before deleting.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = ['src', 'tests'];
const SKIP = new Set(['node_modules', '.git', 'art', 'vendor', 'docs']);
const unescapeJs = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
const normalize = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

const sources = [];
const walk = (dir) => {
    if (!fs.existsSync(dir))
        return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP.has(entry.name) && !entry.name.startsWith('.')) walk(p);
        }
        else if (/\.(js|mjs|html)$/.test(entry.name) && !p.includes('i18n-de') && !entry.name.startsWith('probe-') && !entry.name.startsWith('tmp-')) {
            sources.push(p);
        }
    }
};
ROOT.forEach(walk);
// Source literals spell an apostrophe \'; the catalog spells it plain, and a
// key containing one only ever matches after the escape is resolved.
const corpus = [...new Set(sources)].map((f) => unescapeJs(fs.readFileSync(f, 'utf8'))).join('\n');

const catalogFile = fs.readFileSync('src/game/i18n-de.js', 'utf8');
const catalog = catalogFile.slice(catalogFile.indexOf('DE_CATALOG'));
// Keys live in two shapes: one entry per line, and Object.assign(DE_CATALOG,
// {…}) blocks whose pairs share a line.
const pairRe = /(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
const keyOf = (pair) => unescapeJs(pair.split(/:(?=\s*['"])/)[0].replace(/^\s*['"]|['"]\s*$/g, ''));
const keys = new Set();
let match;
while ((match = pairRe.exec(catalog)))
    keys.add(keyOf(match[0]));

const callRe = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const live = new Set();
for (const file of new Set(sources)) {
    const text = fs.readFileSync(file, 'utf8');
    let call;
    while ((call = callRe.exec(text))) {
        const string = unescapeJs(call[1] ?? call[2]);
        if (string.length >= 4)
            live.add(string);
    }
}

const dead = [...keys].filter((key) => !corpus.includes(key));
const missing = [...live].filter((string) => !keys.has(string));
const normalized = new Map([...keys].map((key) => [normalize(key), key]));
const drift = [...live]
    .filter((string) => !keys.has(string) && normalized.has(normalize(string)))
    .map((string) => ({ live: string, catalog: normalized.get(normalize(string)) }));

const args = process.argv.slice(2);
if (args.includes('--dead')) {
    for (const key of dead.filter((k) => k.length > 44 && !/[{}]/.test(k) && k !== k.toUpperCase()))
        console.log('• ' + key);
    process.exit(0);
}
if (args.includes('--missing')) {
    for (const string of missing) console.log('• ' + string);
    process.exit(0);
}
if (args.includes('--drift')) {
    for (const entry of drift) console.log(`• live    ${JSON.stringify(entry.live)}\n  catalog ${JSON.stringify(entry.catalog)}`);
    process.exit(0);
}

console.log(`catalog keys: ${keys.size}`);
console.log(`no source reference: ${dead.length}`);
console.log(`live strings with no German: ${missing.length}`);
console.log(`entries only matching after punctuation normalisation: ${drift.length}`);
