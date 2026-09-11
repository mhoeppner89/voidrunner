import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const {GameSession}=await import('../src/game/game.js');
const {startTutorialCampaign,getTutorialQuest,tutorialLaunchBlock,advanceTutorialCampaign,skipTutorialCampaign,TUTORIAL_STEPS}=await import('../src/game/tutorialCampaign.js');
function fixture(step='meet-family'){
    const save={player:{credits:3500,cargo:{},dockedAt:'helix',position:[0,0,0]},world:{time:0},quests:[]};
    startTutorialCampaign(save);getTutorialQuest(save).stepId=step;
    const session=Object.create(GameSession.prototype);session.save=save;
    session.ui={showToast(){}};
    return {save,session,quest:getTutorialQuest(save)};
}
test('all active prologue stages block ambient hostility entry points',()=>{
    for(const step of Object.keys(TUTORIAL_STEPS).filter(step=>step!=='complete')){
        const {session}=fixture(step);
        session.hyperdriveEncounterAt=0;
        assert.equal(session.spawnHyperdriveIntercept(),false);assert.equal(session.hyperdriveEncounterAt,null);
        assert.equal(session.spawnJumpPointPirates({}),false);
        assert.equal(session.beginPatrolInspection({}),false);
        assert.equal(session.updatePatrolArrest({}),false);
        assert.equal(session.updateBountySpawns(),undefined);
        assert.equal(session.combatEncounterScale(),0);
    }
});
test('completing or skipping restores normal encounter scaling',()=>{
    for(const skipped of [true,false]){
        const {save,session,quest}=fixture();session.combatCalmFactor=()=>1;
        if(skipped)skipTutorialCampaign(save);else quest.completedAt=0;
        assert.equal(session.combatEncounterScale(),1);
        assert.equal(tutorialLaunchBlock(save),undefined);
    }
});
test('departure checks preparation without preventing an off-route return',async()=>{
    const {save,session,quest}=fixture();
    assert.match(tutorialLaunchBlock(save),/Mara and Rin/);
    assert.equal(await session.launch(),false);
    assert.equal(session.launchPreparing,undefined);
    quest.stepId='launch-helix';save.player.cargo.food=1;assert.match(tutorialLaunchBlock(save),/two Protein/);
    save.player.cargo.food=2;assert.equal(tutorialLaunchBlock(save),undefined);
    quest.stepId='sell-supplies';save.player.dockedAt='vesper';assert.match(tutorialLaunchBlock(save),/Sell/);
    save.player.dockedAt='helix';assert.equal(tutorialLaunchBlock(save),undefined);
    quest.stepId='family-choice';save.player.dockedAt='cairn';assert.match(tutorialLaunchBlock(save),/recorder/);
});
test('selling supplies before departure returns to the buying lesson',()=>{
    const {save,quest}=fixture('launch-helix');
    const result=advanceTutorialCampaign(save,{type:'traded',locationId:'helix',commodityId:'food',kind:'sell',cargoAfter:1});
    assert.equal(result.changed,true);assert.equal(quest.stepId,'buy-supplies');
    quest.stepId='launch-helix';assert.equal(advanceTutorialCampaign(save,{type:'launched',fromLocationId:'helix',foodCargo:0}).changed,false);
});
test('unrelated topics and wrong-port encounters do not finish the opening',()=>{
    const {save,quest}=fixture();
    for(const event of [{topicId:'work',locationId:'helix'},{topicId:'greeting',locationId:'cairn'}]){
        assert.equal(advanceTutorialCampaign(save,{type:'talked',personId:'mara-vek',...event}).changed,false);
    }
    assert.notEqual(quest.flags.metMara,true);
});
test('tutorial combat briefing pauses even with the scripted hostile nearby',()=>{
    const {session}=fixture('defeat-raider');session.hostilesVisibleNear=()=>true;
    let received;session.ui.showStoryLine=(...args)=>received=args;
    session.playStoryLine('Rin Vek','Controls','ally',15000,'tutorial-combat');
    assert.equal(received[3],'tutorial-combat');assert.equal(session.pendingStoryConversations,undefined);
});
