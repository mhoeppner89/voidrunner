import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
registerHooks({resolve(specifier, context, next) {
    return next(specifier === 'three' ? new URL('../../vendor/three.module.min.js', import.meta.url).href : specifier, context);
}});
const {GameUI} = await import('../../src/game/ui.js');
const {GameSession} = await import('../../src/game/game.js');
const {createNewSave, hydrateSave} = await import('../../src/game/save.js');
const {getTutorialQuest} = await import('../../src/game/tutorialCampaign.js');
const {HARDPOINT_SPECS, OUTFIT_ITEMS, loadoutFor} = await import('../../src/game/outfitting.js');
const {renderEquipmentInventory,bindEquipmentInventory} = await import('../../src/game/equipmentUi.js');
const {normalizeEquipmentInventory,inventoryMounts} = await import('../../src/game/equipmentInventory.js');
const {equipmentBaseId} = await import('../../src/game/equipmentCatalog.js');
const {setLanguage} = await import('../../src/game/i18n.js');

function confirmationFixture(hasSave = true) {
    const ui = Object.create(GameUI.prototype);
    const nodes = new Map();
    globalThis.document = {activeElement:null, fullscreenElement:{id:'fullscreen-game'}, exitFullscreen() {assert.fail('confirmation must not exit fullscreen');}};
    globalThis.window = {confirm() {assert.fail('native dialogs leave fullscreen on phones');}};
    for (const key of ['#title-screen', '#new-career-panel', '[data-ui-command="new"]', '[data-ui-command="cancel-new-career"]', '[data-ui-command="confirm-new-career"]', '[data-ui-command="skip-new-career"]']) {
        const classes = new Set(['is-hidden']);
        const node = {classList:{add:c=>classes.add(c), remove:c=>classes.delete(c), contains:c=>classes.has(c)},
            focus() {document.activeElement = node;}, querySelector:selector=>nodes.get(selector),
            querySelectorAll:()=>[nodes.get('[data-ui-command="cancel-new-career"]'), nodes.get('[data-ui-command="confirm-new-career"]'), nodes.get('[data-ui-command="skip-new-career"]')]};
        nodes.set(key,node);
    }
    ui.root = {querySelector:selector=>nodes.get(selector)};
    ui.hasCareerSave = hasSave;
    ui.save = createNewSave(773,{tutorial:true});
    const choices = [];
    ui.actions = {startNew(tutorial) {choices.push(tutorial);}};
    return {ui,nodes,starts:()=>choices.length,choices};
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

test('confirmation keeps keyboard focus inside, Escape cancels, and first careers still choose the tutorial',()=>{
    const {ui,nodes,starts} = confirmationFixture();
    ui.handleCommand('new');
    const panel = nodes.get('#new-career-panel');
    const event = {key:'Tab',shiftKey:true,preventDefault(){},stopPropagation(){}};
    panel.onkeydown(event);
    assert.equal(document.activeElement,nodes.get('[data-ui-command="skip-new-career"]'));
    panel.onkeydown({...event,shiftKey:false});
    assert.equal(document.activeElement,nodes.get('[data-ui-command="cancel-new-career"]'));
    panel.onkeydown({...event,key:'Escape'});
    assert.equal(starts(),0);
    assert.equal(ui.newCareerConfirm,false);
    ui.hasCareerSave = false;
    ui.handleCommand('new');
    assert.equal(starts(),0);
    assert.equal(ui.newCareerConfirm,true);
    ui.handleCommand('confirm-new-career');
    assert.equal(starts(),1);
    assert.equal(ui.newCareerConfirm,false);
});

test('play and skip are explicit once-only choices before a new career begins',()=>{
 for(const [command,tutorial]of [['confirm-new-career',true],['skip-new-career',false]]){const {ui,choices}=confirmationFixture(false);ui.handleCommand('new');assert.deepEqual(choices,[]);ui.handleCommand(command);ui.handleCommand(command);assert.deepEqual(choices,[tutorial]);}
});

// Exercise the same delegated inventory clicks as the phone UI, including the
// individual equipment IDs used by current career saves.
function inventoryFixture(save, session) {
    const ui = Object.create(GameUI.prototype), handlers = {};
    ui.save=save;ui.dockLocation='helix';
    ui.root={querySelector:()=>null,addEventListener:(name,handler)=>{handlers[name]=handler;}};
    let markup='';
    ui.refreshDock=()=>{markup=renderEquipmentInventory(ui);};
    ui.actions={inventoryCommand:(...args)=>session.inventoryCommand(...args)};
    bindEquipmentInventory(ui);
    const click=dataset=>handlers.click({target:{closest:()=>({dataset})}});
    ui.refreshDock();
    return {ui,click,markup:()=>markup};
}
function inventorySession(save){
    const session=Object.create(GameSession.prototype);session.save=save;
    session.persistSave=()=>{};session.syncWeaponProjection=()=>{};
    session.ui={showToast(){},refreshDock(){}};session.audio={play(){}};
    session.applyTutorialTransition=()=>{};
    return session;
}

test('phone inventory installs the gifted reactor without a charge in both languages',()=>{
    for(const language of ['en','de']){
        setLanguage(language);
        const save=createNewSave(842,{tutorial:true}),quest=getTutorialQuest(save);
        quest.stepId='fit-upgrade';save.player.dockedAt='vesper';const session=inventorySession(save);
        session.ensureTutorialEquipment();normalizeEquipmentInventory(save.player);
        const radar=Object.values(save.player.inventory.items).find(i=>i.baseId==='sustained-reactor');
        assert.ok(radar,'Rin provides one actual equipment item');
        const fit=loadoutFor(save.player),mount=inventoryMounts(save.player.shipId).find(s=>s.key==='utility'&&!fit.utility[s.index]);
        const {ui,click,markup}=inventoryFixture(save,session);
        click({inventoryMount:mount.mount.id});click({inventoryAction:'tab',tab:'storage'});
        assert.match(markup(),new RegExp('data-inventory-id="'+radar.id+'"'));
        click({inventoryId:radar.id});
        assert.match(markup(),/data-inventory-action="install"/);
        assert.doesNotMatch(markup(),/data-inventory-action="buy"/);
        const credits=save.player.credits;
        click({inventoryAction:'install',itemId:radar.id,mountId:mount.mount.id});
        assert.equal(ui.inventoryNotice,undefined);assert.equal(quest.stepId,'mining-contract');
        assert.equal(save.player.credits,credits);
        const restored=hydrateSave(JSON.parse(JSON.stringify(save)));
        assert.ok(loadoutFor(restored.player).utility.some(id=>equipmentBaseId(id)==='sustained-reactor'));
    }
});

test('phone shop disables an unaffordable radar purchase and never treats it as owned stock',()=>{
    for(const language of ['en','de']){
        setLanguage(language);const save=createNewSave(842,{tutorial:true});
        const session=inventorySession(save),{ui,click,markup}=inventoryFixture(save,session);
        ui.inventoryTab='shop';ui.refreshDock();
        click({inventoryId:'shop-radar-mk2-2'});
        const action=markup().match(/<button[^>]*data-inventory-action="buy"[^>]*>/);
        assert.ok(action,'shop item has a purchase action');assert.ok(action[0].includes('disabled'));
        assert.doesNotMatch(markup(),/data-inventory-action="install"/);
        assert.match(markup(),new RegExp(String(OUTFIT_ITEMS['shop-radar-mk2-2'].price)));
        const credits=save.player.credits,items=Object.keys(save.player.inventory.items);
        click({inventoryAction:'buy',baseId:'radar-mk2',tier:'2'});
        assert.equal(save.player.credits,credits);assert.deepEqual(Object.keys(save.player.inventory.items),items);
        assert.equal(ui.inventoryNotice,'Not enough credits.');
    }
});
