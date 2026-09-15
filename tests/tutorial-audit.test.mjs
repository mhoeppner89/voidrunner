import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const {GameSession}=await import('../src/game/game.js');
const {GameUI}=await import('../src/game/ui.js');
const {createNewSave,hydrateSave}=await import('../src/game/save.js');
const {getTutorialQuest,advanceTutorialCampaign,tutorialCampaignSummary,tutorialDialogue,TUTORIAL_STEPS,TUTORIAL_FLIGHT_LESSONS}=await import('../src/game/tutorialCampaign.js');
const {ADVENTURE_DIALOGUES}=await import('../src/game/adventureDialogues.js');
const {DE_CATALOG}=await import('../src/game/i18n-de.js');
function fixture(step){
    const save=createNewSave(73189,{tutorial:true});
    const quest=getTutorialQuest(save);quest.stepId=step;
    const session=Object.create(GameSession.prototype);session.save=save;
    const briefings=[];
    session.ui={showToast(){},pushEvent(){},pushSensor(){},refreshDock(){}};
    session.renderer={setUtilityBeam(){},syncShips(){}};
    session.ships=[];
    session.persistSave=()=>{};
    session.setTutorialDestination=id=>{save.player.navTargetId=id;save.player.currentTargetId=id;};
    session.playStoryLine=(...args)=>briefings.push(args);
    return {save,session,quest,briefings};
}
test('selling separately does not replace sold cargo or repeat the next briefing',()=>{
    const {save,session,quest,briefings}=fixture('fly-vesper');
    save.player.dockedAt='vesper';save.player.cargo.food=2;
    session.handleTutorialEvent('docked',{locationId:'vesper',foodCargo:2});
    save.player.cargo.food=1;
    session.handleTutorialEvent('traded',{locationId:'vesper',kind:'sell',commodityId:'food',quantity:1,cargoAfter:1});
    assert.equal(quest.flags.suppliesSold,1);assert.equal(save.player.cargo.food,1);
    save.player.cargo.food=0;
    session.handleTutorialEvent('traded',{locationId:'vesper',kind:'sell',commodityId:'food',quantity:1,cargoAfter:0});
    assert.equal(quest.stepId,'service-ship');assert.equal(briefings.length,1);
    session.playTutorialBriefing('services');assert.equal(briefings.length,1);
});
test('buying additional packs between sales does not erase delivery progress',()=>{
    const {save,quest}=fixture('sell-supplies');quest.flags.suppliesAtVesper=2;
    const trade=(kind,cargoAfter)=>advanceTutorialCampaign(save,{type:'traded',locationId:'vesper',kind,commodityId:'food',quantity:1,cargoAfter});
    trade('sell',1);trade('buy',2);trade('sell',1);
    assert.equal(quest.flags.suppliesSold,2);assert.equal(quest.stepId,'service-ship');
});
test('last-unit extraction preserves the next tutorial lock and combat controls',()=>{
    for(const source of ['mining','salvage']){
        const {save,session,quest}=fixture(source==='mining'?'mine-shardbelt':'salvage-black-box');
        save.player.dockedAt=undefined;save.player.mode=source;save.player.currentTargetId='last-node';
        session.activeInstanceId=source==='mining'?'shardbelt':'mourning-line';
        quest.flags[source==='mining'?'oreTargetId':'blackBoxTargetId']='last-node';
        session.ships=[{id:'raider',tutorialEnemy:true,hull:58,position:[0,0,0],name:'Ash Moth'}];
        session.applyTarget=target=>{save.player.currentTargetId=target.id;};
        session.clearTarget=()=>{save.player.currentTargetId=undefined;};
        session.extractionCarry=new Map();
        session.collectExtraction=()=>{};session.recordClaimMining=()=>{};session.recordClaimSalvage=()=>{};
        session.strikeGoldPocket=()=>{};session.recoverWreckEquipment=()=>{};session.setMonitorStatus=()=>{};
        const node={id:'last-node',remaining:1,salvage:'electronics'};
        if(source==='mining'){
            node.remaining=0; // The drone transaction commits the final cut before this callback.
            const targetNodeKey=`${save.world.seed}:${save.player.systemId}:asteroid:last-node`;
            session.miningDroneContext={node,targetNodeKey};session.recordExtractionProgress=()=>{};
            session.processMiningDroneEvent({ok:true,code:'cut-completed',targetNodeKey,remaining:0,units:1});
            session.processMiningDroneEvent({ok:true,code:'payload-delivered',targetNodeKey,commodityId:'ore',units:1});
            assert.equal(save.player.currentTargetId,'raider');assert.equal(save.player.mode,'combat');
            assert.equal(quest.stepId,'defeat-raider');
            session.handleTutorialEvent('weapon-switched',{group:'B'});
            session.handleTutorialEvent('weapon-switched',{group:'A'});
            assert.equal(quest.stepId,'defeat-raider');assert.equal(save.player.currentTargetId,'raider');
        }else{
            session.extractWreck(node,3,1);
            assert.equal(save.player.currentTargetId,'cairn');assert.equal(quest.stepId,'dock-cairn');
        }
        assert.equal(node.remaining,0);
    }
});
test('a field explored before its lesson still supplies a target after save reload',()=>{
    for(const [step,instance,field,ledger] of [['mine-shardbelt','shardbelt','asteroids','depletedAsteroids'],['salvage-black-box','mourning-line','wreckNodes','depletedWrecks']]){
        const {save,session}=fixture(step);
        session[field]=[{id:'depleted',remaining:0,position:save.player.position.slice(),salvage:'electronics'}];
        session.selectTarget=(_,id)=>{save.player.currentTargetId=id;};
        session.ensureTutorialFieldTarget(instance);
        assert.equal(session[field][0].remaining,1);assert.equal(save.world[ledger].depleted,1);
        const loaded=hydrateSave(JSON.parse(JSON.stringify(save)));
        assert.equal(loaded.world[ledger].depleted,1);
    }
});
test('each Cairn decision follows the account, survives reload and has a journal entry',()=>{
    globalThis.document??={activeElement:null};
    for(const [branch,decision] of [['tell','tell-mara'],['trust','trust-rin'],['keep','keep-recorder']]){
        const {save,session,quest}=fixture('family-choice');save.player.dockedAt='cairn';
        const ui=Object.create(GameUI.prototype);ui.save=save;ui.dockLocation='cairn';
        ui.root={querySelector:()=>({classList:{add(){},remove(){}}})};
        ui.renderAdventure=()=>{};ui.renderDock=()=>{};
        ui.actions={chooseTutorial:id=>session.chooseTutorial(id)};
        ui.openTutorialDecision();
        const choose=id=>ui.advanceAdventure(ui.adventureNode().choices.findIndex(c=>c.next===id));
        ui.advanceAdventure(0);ui.advanceAdventure(0);
        assert.equal(ui.adventure.nodeId,'confession');
        assert.ok(!ui.adventureNode().choices.some(c=>c.next===branch));
        choose('proof');assert.equal(ui.adventure.nodeId,'proof');
        choose('plan');choose(branch);
        assert.equal(quest.stepId,'family-choice');
        ui.advanceAdventure(0);
        assert.equal(quest.stepId,'galaxy-map');assert.equal(quest.choices.recorder,decision);
        assert.ok(tutorialCampaignSummary(hydrateSave(JSON.parse(JSON.stringify(save)))).choiceLabel);
        if(decision==='tell-mara')assert.match(tutorialDialogue(save,'mara-vek'),/sent me the recording/);
    }
});
test('an interrupted Cairn conversation remains available without recording a decision',()=>{
    const {save,session,quest}=fixture('family-choice');
    assert.equal(session.chooseTutorial('trust-rin').changed,false);
    save.player.dockedAt='cairn';
    const ui=Object.create(GameUI.prototype);ui.save=save;ui.dockLocation='cairn';
    ui.root={querySelector:()=>({classList:{add(){},remove(){}}})};ui.renderAdventure=()=>{};ui.renderDock=()=>{};
    ui.openTutorialDecision();ui.advanceAdventure(0);ui.closeAdventure();
    assert.equal(quest.stepId,'family-choice');assert.deepEqual(quest.choices,{});
    ui.openTutorialDecision();assert.equal(ui.adventure.script,ADVENTURE_DIALOGUES.cairn);
});
test('tutorial text and decision summaries have German translations',()=>{
    for(const step of Object.values(TUTORIAL_STEPS))for(const key of ['objective','detail','chapterTitle'])
        assert.ok(DE_CATALOG[step[key]],step[key]);
    for(const lesson of TUTORIAL_FLIGHT_LESSONS) for(const key of ['objective','detail']) assert.ok(DE_CATALOG[lesson[key]],lesson[key]);
    const {save,quest}=fixture('family-choice');
    for(const choice of ['tell-mara','trust-rin','keep-recorder']){
        quest.choices.recorder=choice;assert.ok(DE_CATALOG[tutorialCampaignSummary(save).choiceLabel]);
    }
});
test('completed conversations remain readable after reload without sharing history between careers',()=>{
    globalThis.document??={activeElement:null};
    const {save}=fixture('mine-shardbelt');
    const ui=Object.create(GameUI.prototype);ui.save=save;
    ui.root={querySelector:()=>({classList:{add(){},remove(){}}})};ui.renderAdventure=()=>{};ui.renderDock=()=>{};
    ui.startAdventure({id:'rin-vek',name:'Rin Vek'},ADVENTURE_DIALOGUES.mining,true);
    ui.adventure.transcript=[{speaker:'Rin Vek',text:'The convoy recording may have survived.'}];ui.closeAdventure();
    const loaded=hydrateSave(JSON.parse(JSON.stringify(save)));
    assert.equal(loaded.world.dialogueHistory[0].text,'The convoy recording may have survived.');
    ui.save=createNewSave(28,{tutorial:true});ui.startAdventure({id:'rin-vek',name:'Rin Vek'},ADVENTURE_DIALOGUES.rin);
    assert.deepEqual(ui.adventureHistory,[]);
});
test('replacement delivery respects capacity and only replaces units still owed',async()=>{
    const {cargoCapacity,cargoMass}=await import('../src/game/economy.js');
    const {COMMODITIES}=await import('../src/game/data.js');
    const {save,session,quest}=fixture('sell-supplies');save.player.dockedAt='vesper';
    save.player.cargo.ore=Math.floor(cargoCapacity(save.player)/COMMODITIES.ore.mass);
    session.ensureTutorialDelivery();
    assert.ok(cargoMass(save.player)<=cargoCapacity(save.player));
    save.player.cargo={};quest.flags.suppliesSold=1;
    session.ensureTutorialDelivery();assert.equal(save.player.cargo.food,1);
    session.ensureTutorialDelivery();assert.equal(save.player.cargo.food,1);
    save.player.cargo.food=0;
    session.handleTutorialEvent('traded',{locationId:'vesper',kind:'sell',commodityId:'food',quantity:1,cargoAfter:0});
    assert.equal(quest.stepId,'service-ship');
});
test('a dock story closes without recording a bar greeting or leaving radio muted',()=>{
    const {save}=fixture('mine-shardbelt');save.player.dockedAt='vesper';
    const ui=Object.create(GameUI.prototype);ui.save=save;ui.dockLocation='vesper';ui.commsLog=[];
    ui.root={querySelector:()=>({classList:{add(){},remove(){}}})};ui.renderAdventure=()=>{};ui.renderDock=()=>{};
    ui.actions={talkToNpc:()=>assert.fail('Story cannot count as a bar greeting')};
    ui.openStoryAdventure('Rin Vek','New route','ally','tutorial-mining');
    assert.equal(ui.adventure.space,false);assert.equal(ui.adventure.script,ADVENTURE_DIALOGUES.mining);
    ui.advanceAdventure(0);ui.advanceAdventure(0);ui.advanceAdventure(1);
    assert.equal(ui.adventure,undefined);assert.equal(ui.storyDismissed,true);
});
test('finishing each branch pays once and skipping never pays the completion reward',()=>{
    for(const choice of ['tell-mara','trust-rin','keep-recorder']){
        const {save,session,quest}=fixture('cross-meridian-gate');quest.choices.recorder=choice;
        save.player.systemId='meridian';save.player.dockedAt=undefined;
        const before=save.player.credits;
        session.handleTutorialEvent('system-arrived',{systemId:'meridian',at:100});
        assert.equal(save.player.credits,before+2500);assert.equal(quest.completedAt,100);
        session.handleTutorialEvent('system-arrived',{systemId:'meridian',at:101});
        assert.equal(save.player.credits,before+2500);
        const loaded=hydrateSave(JSON.parse(JSON.stringify(save)));
        assert.equal(getTutorialQuest(loaded).flags.rewardGranted,true);
    }
    const {save,session}=fixture('mine-shardbelt');const before=save.player.credits;
    session.skipTutorial();assert.equal(save.player.credits,before);
});
test('Rin departs in person and Mara calls when the earn-and-equip stretch runs long',()=>{
    globalThis.document??={activeElement:null};
    const {save,session,quest,briefings}=fixture('galaxy-map');
    save.player.dockedAt='cairn';
    session.handleTutorialEvent('map-selected',{kind:'system',id:'meridian'});
    assert.equal(quest.stepId,'cross-meridian-gate');
    session.tutorialMaraCallDue=save.world.time+1000;
    const during=briefings.length;
    session.queueTutorialMaraCall();
    assert.equal(briefings.length,during,'Mara stays quiet while the player is still earning');
    session.tutorialMaraCallDue=save.world.time;
    session.queueTutorialMaraCall();
    assert.equal(briefings.length,during+1);
    assert.equal(briefings[during][0],'Mara Vek');assert.equal(briefings[during][4],'tutorial-handoff');
    const ui=Object.create(GameUI.prototype);ui.save=save;ui.dockLocation=undefined;ui.commsLog=[];
    ui.root={querySelector:()=>({classList:{add(){},remove(){}}})};ui.renderAdventure=()=>{};ui.renderDock=()=>{};
    ui.actions={talkToNpc:()=>assert.fail('Story cannot count as a bar greeting'),finishTutorialBriefing:(...args)=>session.finishTutorialBriefing(...args)};
    ui.openStoryAdventure(briefings[during][0],briefings[during][1],briefings[during][2],briefings[during][4]);
    assert.equal(ui.adventure.story,true);
    assert.match(ui.adventureNode().text.en,/never called after the gate/);
    ui.advanceAdventure(0);ui.advanceAdventure(0);ui.advanceAdventure(0);ui.advanceAdventure(0);
    assert.equal(ui.adventure,undefined,'the call closes with the crossing task accepted');
    const loaded=hydrateSave(JSON.parse(JSON.stringify(save)));
    assert.equal(getTutorialQuest(loaded).flags.maraCallMade,true);
});

test('legacy map-step saves retain progress and all chapters fit the counter',()=>{
 const {save,quest}=fixture('plot-meridian');const loaded=hydrateSave(JSON.parse(JSON.stringify(save)));
 assert.equal(getTutorialQuest(loaded).stepId,'galaxy-map');assert.equal(quest.stepId,'plot-meridian','hydration does not mutate the source');
 assert.equal(advanceTutorialCampaign(loaded,{type:'map-selected',kind:'system',id:'meridian'}).changed,true);
 for(const step of Object.keys(TUTORIAL_STEPS)){getTutorialQuest(loaded).stepId=step;const s=tutorialCampaignSummary(loaded);assert.ok(s.chapter<=s.chapterCount,step);}
});
test('Mara call survives combat deferral, crossing and reload until acknowledged',()=>{
 const {save,session,quest}=fixture('cross-meridian-gate');save.player.dockedAt=undefined;
 session.ui={isModalOpen:true};session.hostilesVisibleNear=()=>true;session.playStoryLine=GameSession.prototype.playStoryLine;
 session.queueTutorialMaraCall();assert.equal(session.pendingStoryConversations?.length??0,0,'do not interrupt an open menu');session.ui.isModalOpen=false;
 session.queueTutorialMaraCall();assert.equal(session.pendingStoryConversations.length,1);assert.notEqual(quest.flags.maraCallMade,true);
 quest.stepId='complete';session.refreshStoryLine();assert.equal(session.pendingStoryConversations.length,1);
 session.queueTutorialMaraCall();assert.equal(session.pendingStoryConversations.length,1,'no duplicate pending calls');
 const reloaded=fixture('complete');reloaded.session.save=hydrateSave(JSON.parse(JSON.stringify(save)));
 reloaded.session.queueTutorialMaraCall();assert.equal(reloaded.briefings.length,1,'an undelivered call survives reload');
 session.hostilesVisibleNear=()=>false;let shown=0;session.ui.showStoryLine=()=>shown++;session.refreshStoryLine();assert.equal(shown,1);
 session.finishTutorialBriefing('tutorial-handoff',false);session.ui.storyDismissed=true;session.refreshStoryLine();save.world.time+=12;session.queueTutorialMaraCall();assert.equal(shown,2,'closing early permits retry');
 session.finishTutorialBriefing('tutorial-handoff',true);session.queueTutorialMaraCall();assert.equal(shown,2);assert.equal(quest.flags.maraCallMade,true);
});
