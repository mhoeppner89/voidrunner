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
const {HARDPOINT_SPECS, loadoutFor} = await import('../src/game/outfitting.js');
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
