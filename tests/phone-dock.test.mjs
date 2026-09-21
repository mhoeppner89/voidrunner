import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
registerHooks({resolve(specifier, context, next) {
    return next(specifier === 'three' ? new URL('../vendor/three.module.min.js', import.meta.url).href : specifier, context);
}});
const {GameUI} = await import('../src/game/ui.js');
const {GameSession} = await import('../src/game/game.js');
const {createNewSave, hydrateSave} = await import('../src/game/save.js');
const {getTutorialQuest} = await import('../src/game/tutorialCampaign.js');
const {HARDPOINT_SPECS, OUTFIT_ITEMS, loadoutFor} = await import('../src/game/outfitting.js');
const {formatCredits} = await import('../src/game/random.js');
const {setLanguage} = await import('../src/game/i18n.js');

function confirmationFixture(hasSave = true) {
    const ui = Object.create(GameUI.prototype);
    const nodes = new Map();
    globalThis.document = {activeElement:null, fullscreenElement:{id:'fullscreen-game'}, exitFullscreen() {assert.fail('confirmation must not exit fullscreen');}};
    globalThis.window = {confirm() {assert.fail('native dialogs leave fullscreen on phones');}};
    for (const key of ['#title-screen', '#new-career-panel', '[data-ui-command="new"]', '[data-ui-command="cancel-new-career"]', '[data-ui-command="confirm-new-career"]']) {
        const classes = new Set(['is-hidden']);
        const node = {classList:{add:c=>classes.add(c), remove:c=>classes.delete(c), contains:c=>classes.has(c)},
            focus() {document.activeElement = node;}, querySelector:selector=>nodes.get(selector),
            querySelectorAll:()=>[nodes.get('[data-ui-command="cancel-new-career"]'), nodes.get('[data-ui-command="confirm-new-career"]')]};
        nodes.set(key,node);
    }
    ui.root = {querySelector:selector=>nodes.get(selector)};
    ui.hasCareerSave = hasSave;
    ui.save = createNewSave(773,{tutorial:true});
    let starts = 0;
    ui.actions = {startNew() {starts++;}};
    return {ui,nodes,starts:()=>starts};
}

test('new-career cancellation preserves the save and fullscreen; explicit confirmation starts once',()=>{
    const {ui,nodes,starts} = confirmationFixture();
    const save = JSON.stringify(ui.save), fullscreen = document.fullscreenElement;
    ui.handleCommand('new');
    assert.equal(starts(),0);
    assert.equal(ui.isModalOpen,true);
    assert.equal(nodes.get('#title-screen').inert,true);
    assert.equal(document.activeElement,nodes.get('[data-ui-command="cancel-new-career"]'));
    ui.handleCommand('cancel-new-career');
    assert.equal(ui.newCareerConfirm,false);
    assert.equal(nodes.get('#title-screen').inert,false);
    assert.equal(document.activeElement,nodes.get('[data-ui-command="new"]'));
    assert.equal(JSON.stringify(ui.save),save);
    assert.equal(document.fullscreenElement,fullscreen);
    ui.handleCommand('confirm-new-career');
    assert.equal(starts(),0,'a closed confirmation must not authorize overwriting');
    ui.handleCommand('new');
    ui.handleCommand('confirm-new-career');
    ui.handleCommand('confirm-new-career');
    assert.equal(starts(),1);
    assert.equal(ui.newCareerConfirm,false);
    assert.equal(document.fullscreenElement,fullscreen);
});

test('confirmation keeps keyboard focus inside, Escape cancels, and first careers need no overwrite prompt',()=>{
    const {ui,nodes,starts} = confirmationFixture();
    ui.handleCommand('new');
    const panel = nodes.get('#new-career-panel');
    const event = {key:'Tab',shiftKey:true,preventDefault(){},stopPropagation(){}};
    panel.onkeydown(event);
    assert.equal(document.activeElement,nodes.get('[data-ui-command="confirm-new-career"]'));
    panel.onkeydown({...event,shiftKey:false});
    assert.equal(document.activeElement,nodes.get('[data-ui-command="cancel-new-career"]'));
    panel.onkeydown({...event,key:'Escape'});
    assert.equal(starts(),0);
    assert.equal(ui.newCareerConfirm,false);
    ui.hasCareerSave = false;
    ui.handleCommand('new');
    assert.equal(starts(),1);
    assert.equal(ui.newCareerConfirm,false);
});

test('slot-first phone fitting installs the owned radar in three selections in both languages',()=>{
    for (const language of ['en','de']) {
        setLanguage(language);
        const save = createNewSave(842,{tutorial:true});
        const quest = getTutorialQuest(save);
        quest.stepId = 'fit-upgrade';
        const session = Object.create(GameSession.prototype);
        session.save = save;
        session.persistSave = ()=>{};
        session.audio = {play(){}};
        session.ui = {showToast(){},refreshDock(){}};
        session.ensureTutorialEquipment();
        const ui = Object.create(GameUI.prototype);
        ui.save = save;
        ui.dockLocation = 'helix';
        ui.root = {querySelector:()=>null};
        ui.resetOutfittingDrafts();
        let markup;
        ui.renderMarketPoint = ()=>{markup=ui.renderOutfitting();};
        ui.actions = {applyOutfitting:(...args)=>session.applyOutfitting(...args)};
        ui.setOutfittingView('systems');
        assert.match(markup,/simple-fit-scroll/);
        const loadout=loadoutFor(save.player);
        const mount=HARDPOINT_SPECS[save.player.shipId].utility[loadout.utility.indexOf(null)];
        ui.selectOutfittingMount(mount.id);
        assert.match(markup,/data-outfit-item="radar-mk2"/);
        assert.doesNotMatch(markup,/data-outfit-item="gauss-cannon"/);
        ui.installOutfittingItem('radar-mk2');
        assert.equal(ui.outfittingStage,'fit');
        assert.match(markup,/data-outfit-action="install"\s*>/);
        ui.handleCommand('outfit-stage',{dataset:{outfitStage:'equipment'}});
        ui.handleCommand('outfit-stage',{dataset:{outfitStage:'fit'}});
        assert.equal(ui.outfittingItemId,'radar-mk2');
        assert.equal(ui.outfittingMountId,mount.id);
        const credits = save.player.credits;
        ui.handleOutfittingAction('install');
        assert.equal(ui.outfittingNotice.tone,'success');
        assert.equal(quest.stepId,'launch-helix');
        assert.equal(save.player.credits,credits);
        const restored = hydrateSave(JSON.parse(JSON.stringify(save)));
        assert.ok(loadoutFor(restored.player).utility.includes('radar-mk2'));
    }
});

// Rin's spare radar is a prologue gift. A pilot who never received it (skipped
// prologue, or still early in chapter one) has to buy the 5.400 cr module on
// 3.500 starting credits: the fit stage must quote that price and the shortfall
// instead of advertising a free install from an empty locker with a disabled
// button that contradicts the status line.
test('an unowned, unaffordable module is quoted at its price instead of a free locker fit',()=>{
    for (const language of ['en','de']) {
        setLanguage(language);
        const save = createNewSave(842,{tutorial:true});
        const price = OUTFIT_ITEMS['radar-mk2'].price;
        assert.ok(save.player.credits < price,'fit the fixture: starting credits cannot cover the radar');
        assert.ok(!(save.player.outfitting.locker?.['radar-mk2'] > 0),'fit the fixture: the locker holds no spare radar');
        let commits = 0;
        const ui = Object.create(GameUI.prototype);
        ui.save = save;
        ui.dockLocation = 'helix';
        ui.root = {querySelector:()=>null};
        ui.resetOutfittingDrafts();
        let markup;
        ui.renderMarketPoint = ()=>{markup=ui.renderOutfitting();};
        ui.actions = {applyOutfitting(){commits++;}};
        ui.setOutfittingView('systems');
        const loadout=loadoutFor(save.player);
        const mount=HARDPOINT_SPECS[save.player.shipId].utility[loadout.utility.indexOf(null)];
        ui.selectOutfittingMount(mount.id);
        ui.installOutfittingItem('radar-mk2');
        assert.equal(ui.outfittingStage,'fit');
        const action = markup.match(/<button[^>]*data-outfit-action="install"[^>]*>([^<]*)<\/button>/);
        assert.ok(action,`${language}: the fit stage renders an install action`);
        assert.ok(action[0].includes('disabled'),`${language}: an unaffordable fit disables the action`);
        assert.ok(action[1].includes(formatCredits(price)),`${language}: the action names the purchase price, got "${action[1]}"`);
        assert.ok(!action[1].includes('NO CHARGE') && !action[1].includes('KOSTENLOS'),`${language}: a purchase is never advertised as free, got "${action[1]}"`);
        assert.match(markup,/You need|Dir fehlen noch/,`${language}: the status names the shortfall`);
        ui.handleOutfittingAction('install');
        assert.equal(commits,0,`${language}: an unaffordable fitting cannot commit`);
        assert.equal(ui.outfittingNotice?.tone,'warning',`${language}: the pilot is told why`);
    }
});
