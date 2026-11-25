// These campaign probes pause the animation loop between actions. Drive the
// cockpit control, then consume its input once, as the next frame would.
export async function selectTutorialRaider(page, device, encounter) {
    const candidates = await page.evaluate(encounter => {
        const r = __VOID_PRIVATEER__.getRuntime();
        const targets = r.targetCandidates();
        if (!targets.some(target => r.ships.some(ship => ship.id === target.id && ship.tutorialEncounter === encounter && ship.hostile))) {
            throw Error('No selectable raider in '+encounter);
        }
        return targets.length;
    }, encounter);
    for (let i = 0; i < candidates; i++) {
        if (device.hasTouch) await page.locator('.cockpit-screen-target').tap();
        else await page.keyboard.press('t');
        const selected = await page.evaluate(encounter => {
            const r = __VOID_PRIVATEER__.getRuntime();
            r.handleActions(r.input.getActions());
            return r.ships.some(ship => ship.id === r.save.player.currentTargetId && ship.tutorialEncounter === encounter && ship.hostile);
        }, encounter);
        if (selected) return;
    }
    throw Error('Cycling did not select a raider in '+encounter);
}
