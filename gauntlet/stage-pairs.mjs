// Stage a blind A/B pair for a critic: copies our shot and a bar reference
// into one folder as A.png / B.png in random order, records the key
// (orchestrator-only), and prints the pair folder.
// Usage: node gauntlet/stage-pairs.mjs <piece> <round> <ourShot> <refShot>
import { mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [piece, round, ourShot, refShot] = process.argv.slice(2);
if (!piece || !round || !ourShot || !refShot) {
    console.error('usage: node gauntlet/stage-pairs.mjs <piece> <round> <ourShot> <refShot>');
    process.exit(1);
}
for (const f of [ourShot, refShot]) {
    if (!existsSync(f)) {
        console.error(`missing file: ${f}`);
        process.exit(1);
    }
}
const dir = join('gauntlet/state/pairs', `${piece}-r${round}`);
mkdirSync(dir, { recursive: true });
const oursIsA = Math.random() < 0.5;
copyFileSync(ourShot, join(dir, oursIsA ? 'A.png' : 'B.png'));
copyFileSync(refShot, join(dir, oursIsA ? 'B.png' : 'A.png'));
mkdirSync('gauntlet/state/keys', { recursive: true });
writeFileSync(join('gauntlet/state/keys', `${piece}-r${round}.json`), JSON.stringify({ piece, round, oursIsA, ourShot, refShot }, null, 2) + '\n');
console.log(`${dir} (ours is ${oursIsA ? 'A' : 'B'} — do not tell the critic)`);
