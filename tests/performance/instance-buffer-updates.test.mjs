import assert from 'node:assert/strict';
import { test } from 'node:test';
function span(pieces) {
    let start = Infinity, end = 0;
    for (let i = 0; i < pieces.length; i++) if (pieces[i].moving) {
        start = Math.min(start, i * 16); end = (i + 1) * 16;
    }
    return end > start ? end - start : 0;
}
test('packing moving instances into the tail reduces a 99-matrix span to 50', () => {
    const mixed = Array.from({ length: 100 }, (_, index) => ({ index, moving: index % 2 === 1 }));
    const packed = [...mixed].sort((a, b) => Number(Boolean(a.moving)) - Number(Boolean(b.moving)));
    assert.equal(span(mixed), 99 * 16);
    assert.equal(span(packed), 50 * 16);
    assert.equal(packed.length, mixed.length);
    assert.deepEqual(new Set(packed), new Set(mixed));
    assert.deepEqual(mixed.map(p => p.index), Array.from({ length: 100 }, (_, n) => n));
});
test('nodeIndices follow sorted asteroid entries, not their old positions', () => {
    const entries = [true, false, true, false].map((moving, index) => ({ index, node: { moving } }));
    entries.sort((a, b) => Number(Boolean(a.node.moving)) - Number(Boolean(b.node.moving)));
    assert.deepEqual(entries.map(e => e.index), [1, 3, 0, 2]);
    assert.equal(entries[2].index, 0);
});
