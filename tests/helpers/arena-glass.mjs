// Compare the live DOM with the apertures measured on the hull painting.
// This runs in the browser. Reading the boxes must never trigger a kit update.
export function assertArenaGlass() {
    const session = __VOID_PRIVATEER__.getRuntime();
    const kit = session.ui.cockpitArtwork;
    if (!kit.layout || kit.shipId !== session.save.player.shipId) throw Error('Cockpit layout missing for ' + session.save.player.shipId);
    const frame = kit.frame.getBoundingClientRect(), hull = kit.definition;
    const sx = frame.width / hull.width, sy = frame.height / hull.height;
    const bleed = Math.max(1.5, (hull.glassUnderlap ?? 3) * Math.max(sx, sy));
    for (const id of ['own', 'target']) {
        const aperture = hull.monitors[id];
        const screen = document.querySelector('.cockpit-screen-' + id);
        const box = screen.getBoundingClientRect(), style = getComputedStyle(screen);
        const left = frame.left + aperture.x * sx, top = frame.top + aperture.y * sy;
        const right = left + aperture.width * sx, bottom = top + aperture.height * sy;
        // The backing underlaps the bezel. Its content starts inside the glass.
        const underlap = [left - box.left, top - box.top, box.right - right, box.bottom - bottom];
        if (underlap.some(v => Math.abs(v - bleed) > 1) || style.overflow !== 'hidden'
            || box.left + parseFloat(style.paddingLeft) < left - 1 || box.right - parseFloat(style.paddingRight) > right + 1
            || box.top + parseFloat(style.paddingTop) < top - 1 || box.bottom - parseFloat(style.paddingBottom) > bottom + 1) {
            throw Error(`${kit.shipId} ${id} glass misplaced at level ${session.save.arenaRun.wave + 1}: ${underlap}`);
        }
        if (Number(getComputedStyle(kit.frame).zIndex) <= Number(style.zIndex)) throw Error('Bezel must cover the glass underlap');
    }
    return kit.shipId;
}

// Fly each level through the normal preparation UI and animation frame.
// Complete combat immediately after checking its glass so this only tests transitions.
export async function checkArenaTransitions(page) {
    await page.evaluate(async () => {
        const {newArenaRun, writeArenaRun} = await import('/src/game/arenaRun.js');
        writeArenaRun(newArenaRun(false, 718));
        await __VOID_PRIVATEER__.startArenaRun(true);
    });
    const hulls = [];
    for (let level = 1; level <= 25; level++) {
        await page.evaluate(() => {
            const s = __VOID_PRIVATEER__.getRuntime(), r = s.save.arenaRun;
            const click = action => {
                const el = document.querySelector('#arena-panel [data-run-action="' + action + '"]:not(:disabled)');
                if (el) el.click();
                return Boolean(el);
            };
            for (let i = 0; i < 8 && r.phase === 'prepare'; i++) {
                if (click('hull') || click('wingman')) continue;
                if (click('reward')) { click('accept'); continue; }
                document.querySelector('#arena-panel [data-ui-command="run-launch"]')?.click();
            }
            if (r.phase !== 'combat') throw Error('Could not launch level ' + (r.wave + 1));
        });
        await page.evaluate(async () => {
            const s = __VOID_PRIVATEER__.getRuntime();
            await s.ui.cockpitArtwork.ready;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        const id = await page.evaluate(assertArenaGlass);
        if (hulls.at(-1) !== id) hulls.push(id);
        await page.evaluate(() => {
            const s = __VOID_PRIVATEER__.getRuntime();
            s.tickArenaRun(3);
            s.runBattle.outcome = 'success';
            for (const enemy of s.ships) if (enemy.arenaRunEnemy) enemy.hull = 0;
            s.tickArenaRun(.01);
            s.save.world.time += 3;
            s.tickArenaRun(3);
        });
    }
    if (hulls.length !== 3) throw Error('Expected three Arena hull picks, got ' + hulls.join(', '));
    return hulls;
}
