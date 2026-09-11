import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const THREE = await import('../vendor/three.module.min.js');
const {GameSession} = await import('../src/game/game.js');
const {GameUI} = await import('../src/game/ui.js');
const {createNewSave,hydrateSave} = await import('../src/game/save.js');
const {LOCATIONS} = await import('../src/game/data.js');
const {getTutorialQuest} = await import('../src/game/tutorialCampaign.js');
const {TUTORIAL_RADIO} = await import('../src/game/tutorialRadio.js');
const {DE_CATALOG} = await import('../src/game/i18n-de.js');

function fixture(step='fly-vesper') {
    const save=createNewSave(73199,{tutorial:true});
    const quest=getTutorialQuest(save);quest.stepId=step;
    save.player.dockedAt=undefined;save.player.position=[...LOCATIONS.helix.position];
    save.player.rotation=[0,0,0,1];save.player.velocity=[0,0,0];save.player.navTargetId='vesper';
    const session=Object.create(GameSession.prototype);session.save=save;
    const stories=[],radio=[];
    session.ui={isModalOpen:false,storyDismissed:false,
        showStoryLine(...line){stories.push(line);this.isModalOpen=Boolean(line[3]);this.storyDismissed=false;},
        showPilotLine(...line){radio.push(line);},clearPilotLine(){this.cleared=true;},dismissStory(){},
        showToast(){},pushEvent(){},pushSensor(){},refreshDock(){},hideDock(){},showHud(){}};
    session.audio={play(){},playComms(){},setStationMode(){}};
    session.renderer={setTarget(){},setUtilityBeam(){},setCockpitVisible(){}};
    session.ships=[];session.entityCounter=0;session.persistSave=()=>{};
    session.tmpQ2=new THREE.Quaternion();
    for(const key of ['tmpTutorialGoal','tmpTutorialForward','tmpTutorialRight','tmpTutorialUp','tmpP2','tmpP3'])session[key]=new THREE.Vector3();
    session.activeFieldObstacles=()=>[];session.hostilesVisibleNear=()=>false;session.lineBlocked=()=>false;
    return {save,quest,session,stories,radio};
}

test('a freshly spawned tutorial raider has finite transforms and projects inside the landscape canopy',()=>{
    for(const yaw of [0,Math.PI/2,Math.PI]) {
        const {save,session,stories}=fixture('defeat-raider');
        session.activeInstanceId='shardbelt';save.player.position=[...LOCATIONS.shardbelt.position];
        const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
        save.player.rotation=rotation.toArray();
        const enemy=session.ensureTutorialEnemy();
        for(const tuple of [enemy.position,enemy.velocity,enemy.rotation])assert.ok(tuple.every(Number.isFinite));
        assert.equal(save.player.currentTargetId,enemy.id);assert.equal(save.player.mode,'combat');
        assert.deepEqual(enemy.task.anchor,enemy.position);
        const camera=new THREE.PerspectiveCamera(60,960/432,0.1,10000);
        camera.position.fromArray(save.player.position);camera.quaternion.copy(rotation);camera.updateMatrixWorld();
        const projected=new THREE.Vector3().fromArray(enemy.position).project(camera);
        assert.ok(Math.abs(projected.x)<1 && Math.abs(projected.y)<1 && Math.abs(projected.z)<1);
        assert.equal(stories[0][3],'tutorial-combat');
        assert.equal(session.ensureTutorialEnemy(),enemy);assert.equal(session.ships.length,1);
    }
});

test('a blocked initial raider position uses the real clear-space search without corrupting the tuple',()=>{
    const {save,session}=fixture('defeat-raider');session.activeInstanceId='shardbelt';
    save.player.position=[...LOCATIONS.shardbelt.position];
    const [x,y,z]=save.player.position;
    const obstacles=[{x:x+72,y:y+12,z:z-165,collisionRadius:45}];
    session.activeFieldObstacles=()=>obstacles;
    const enemy=session.ensureTutorialEnemy();
    assert.ok(enemy.position.every(Number.isFinite));
    assert.ok(session.entryPositionClear(new THREE.Vector3().fromArray(enemy.position),obstacles,26));
    assert.equal(save.player.currentTargetId,enemy.id);
});

test('real launch leaves three seconds of flight before the first portrait conversation',async()=>{
    const {save,session,stories}=fixture('launch-helix');
    save.player.dockedAt='helix';save.player.cargo.food=2;session.flightPrepared=true;
    for(const key of ['resetPlayerInterpolation','updateActiveInstance','updateAssetWarmup','ensureInitialTraffic','ensureTutorialCompanion'])session[key]=()=>{};
    const departureTime=save.world.time;
    assert.equal(await session.launch(),true);
    assert.equal(save.player.dockedAt,undefined);assert.equal(session.ui.isModalOpen,false);
    assert.equal(session.pendingStoryConversations.length,1);
    save.world.time=departureTime+2.99;session.refreshStoryLine();assert.equal(stories.length,0);
    save.world.time=departureTime+3;session.refreshStoryLine();
    assert.equal(stories.length,1);assert.equal(stories[0][3],'tutorial-navigation');
    assert.equal(session.ui.isModalOpen,true);assert.equal(session.storyLineUntil,Infinity);
});

test('a queued launch conversation is discarded when landing or advancing its objective',()=>{
    for(const change of ['dock','step']) {
        const {save,quest,session,stories}=fixture();session.flightDialogueAfter=3;
        session.playTutorialBriefing('flight');
        if(change==='dock')save.player.dockedAt='vesper';else quest.stepId='sell-supplies';
        save.world.time=3;session.refreshStoryLine();
        assert.equal(stories.length,0);assert.equal(session.pendingStoryConversations.length,0);
        assert.equal(session.pendingTutorialBriefings.has('flight'),false);
    }
});

test('interrupted briefings can return, and only a final reply marks one as read across reload',()=>{
    globalThis.document??={activeElement:null};
    const {save,quest,session}=fixture('mine-shardbelt');save.player.dockedAt='vesper';
    // Migrate an old save whose previous implementation marked the briefing before reading it.
    quest.flags['briefing-mining']=true;
    const ui=Object.create(GameUI.prototype);ui.save=save;ui.dockLocation='vesper';ui.commsLog=[];
    ui.root={querySelector:()=>({classList:{add(){},remove(){}}})};ui.renderAdventure=()=>{};ui.renderDock=()=>{};
    ui.actions={finishTutorialBriefing:(...args)=>session.finishTutorialBriefing(...args)};
    session.ui=ui;
    session.playTutorialBriefing('mining');assert.ok(ui.adventure);
    ui.closeAdventure();assert.notEqual(quest.flags['briefingRead-mining'],true);
    session.playTutorialBriefing('mining');
    ui.advanceAdventure(0);ui.advanceAdventure(0);ui.advanceAdventure(1);
    assert.equal(quest.flags['briefingRead-mining'],true);assert.equal(ui.adventure,undefined);
    session.save=hydrateSave(JSON.parse(JSON.stringify(save)));
    session.playTutorialBriefing('mining');assert.equal(ui.adventure,undefined);
});

test('the hyperdrive prompt requires a clear aligned route and is delivered without a modal only once',()=>{
    const {save,quest,session,stories,radio}=fixture();save.world.time=4;
    session.flightDialogueAfter=3;session.tutorialAmbientAfter=12;
    const toVesper=new THREE.Vector3().fromArray(LOCATIONS.vesper.position).sub(new THREE.Vector3().fromArray(save.player.position)).normalize();
    save.player.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),toVesper.clone().negate()).toArray();
    session.updateTutorialRadio();assert.equal(radio.length,0);
    save.world.time=5;save.player.rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),toVesper).toArray();
    session.lineBlocked=()=>true;session.updateTutorialRadio();assert.equal(radio.length,0);
    save.world.time=6;session.lineBlocked=()=>false;session.updateTutorialRadio();
    assert.equal(quest.flags['radio-vesper-drive'],true);assert.equal(radio.length,1);
    assert.equal(stories.length,0);assert.equal(session.ui.isModalOpen,false);
    session.save=hydrateSave(JSON.parse(JSON.stringify(save)));session.save.world.time=100;
    session.updateTutorialRadio();assert.equal(radio.length,1);
});

test('travel lore has quiet gaps, persists once, yields to arrival instructions and stops for danger',()=>{
    const {save,quest,session,radio}=fixture();session.autopilot=true;save.world.time=20;
    session.updateTutorialRadio();assert.equal(quest.flags['radio-vesper-food'],true);
    save.world.time=22;session.updateTutorialRadio();assert.equal(radio.length,1);
    // Drop out near Vesper during the lore: the approach instruction takes priority.
    session.autopilot=false;save.player.position=[...LOCATIONS.vesper.position];save.player.position[0]+=500;
    save.world.time=23;session.updateTutorialRadio();
    assert.equal(quest.flags['radio-vesper-approach'],true);assert.equal(radio.length,2);
    save.world.time=24;session.hostilesVisibleNear=()=>true;session.updateTutorialRadio();
    assert.equal(session.ui.cleared,true);assert.equal(radio.length,2);
    assert.equal(session.ui.isModalOpen,false);
});

test('worldbuilding respects the current route, pauses and flight grace, with translations for every line',()=>{
    const {save,quest,session,radio}=fixture('mine-shardbelt');session.autopilot=true;
    save.world.time=30;save.player.navTargetId='azure';session.updateTutorialRadio();assert.equal(radio.length,0);
    save.player.navTargetId='shardbelt';session.ui.isModalOpen=true;save.world.time=31;session.updateTutorialRadio();assert.equal(radio.length,0);
    session.ui.isModalOpen=false;session.flightDialogueAfter=34;save.world.time=32;session.updateTutorialRadio();assert.equal(radio.length,0);
    save.world.time=34;session.updateTutorialRadio();assert.equal(quest.flags['radio-belt-route'],true);
    for(const line of TUTORIAL_RADIO) {assert.ok(DE_CATALOG[line.text]);assert.ok(LOCATIONS[line.destination]);}
});

test('location objectives contain no destination shortcuts, and Rin is available through the Cairn scene',()=>{
    const {save,quest}=fixture();
    const ui=Object.create(GameUI.prototype);ui.save=save;ui.portraitImage=()=>'';
    for(const [step,dock] of [['meet-family','helix'],['buy-supplies','helix'],['sell-supplies','vesper'],['family-choice','cairn']]) {
        quest.stepId=step;ui.dockLocation=dock;
        assert.doesNotMatch(ui.renderTutorialNotice(),/data-dock-hotspot|data-market-point|data-ui-command="launch"|talk-rin/);
    }
    assert.match(ui.renderConcourse(),/data-tutorial-action="talk-rin"/);
    assert.equal(LOCATIONS.helix.people.find(person=>person.id==='rin-vek').relationship,'Your sister');
});
