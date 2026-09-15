import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const THREE = await import('../vendor/three.module.min.js');
const {GameSession} = await import('../src/game/game.js');
const {createNewSave,hydrateSave} = await import('../src/game/save.js');
const {EntityStore} = await import('../src/game/entityStore.js');
const {getTutorialQuest} = await import('../src/game/tutorialCampaign.js');
const {LOCATIONS,COMMODITIES} = await import('../src/game/data.js');
const {generateAsteroidField,generateWreckNodes} = await import('../src/game/worldData.js');
const {loadoutFor,quoteOutfitting} = await import('../src/game/outfitting.js');
const {cargoCapacity} = await import('../src/game/economy.js');
const {repairCost,refillCost} = await import('../src/game/shipStats.js');

function fixture(step, saved) {
    const save=saved ?? createNewSave(73201,{tutorial:true});
    const quest=getTutorialQuest(save);quest.stepId=step;
    const session=Object.create(GameSession.prototype);session.save=save;
    session.ships=[];session.pickups=[];session.pickupStore=new EntityStore();session.pickupCounter=0;
    session.asteroids=generateAsteroidField(save.world.seed,save.world.depletedAsteroids,save.world.scannedNodes);
    session.wreckNodes=generateWreckNodes(save.world.seed,save.world.depletedWrecks,save.world.scannedNodes);
    for(const key of ['tmpP0','tmpP1','tmpP2','tmpP3','tmpRadarPlayer','tmpRadarRel','tmpRadarPos','tmpTutorialGoal','tmpTutorialForward','tmpTutorialRight','tmpTutorialUp'])session[key]=new THREE.Vector3();
    session.tmpRadarInv=new THREE.Quaternion();session.tmpQ2=new THREE.Quaternion();
    session.renderer={setTarget(){},setUtilityBeam(){},setActiveInstance(){}};
    session.ui={showToast(){},pushEvent(){},pushSensor(){},refreshDock(){},showShipMenu(){},showPilotLine(){}};
    session.audio={play(){}};session.persistSave=()=>{};session.updateAssetWarmup=()=>{};
    session.playTutorialBriefing=()=>{};session.ensureTutorialCompanion=()=>{};
    session.activeFieldObstacles=()=>[];session.gunCooldown=0;
    return {session,save,quest};
}

test('Mourning Line beacon survives distance, other local instances and reload without duplicate map or radar contacts',()=>{
    const {session,save,quest}=fixture('salvage-black-box');
    save.player.dockedAt=undefined;session.activeInstanceId='mourning-line';
    save.player.position=[...LOCATIONS.cairn.position];
    const node=session.ensureTutorialFieldTarget();
    assert.ok(node && node.position.every(Number.isFinite));
    assert.ok(new THREE.Vector3().fromArray(node.position).distanceTo(new THREE.Vector3().fromArray(save.player.position))>session.playerStats().radarRange);
    assert.equal(save.player.currentTargetId,node.id);
    session.maintainTargetLock();assert.equal(session.getTargetRef().id,node.id);
    for(const instance of ['mourning-line','cairn']) {
        session.activeInstanceId=instance;
        const contacts=session.buildNavigationMapModel().contacts.filter(c=>c.id===node.id);
        assert.equal(contacts.length,1);assert.equal(contacts[0].tutorial,true);
        assert.equal(session.radarContacts().filter(c=>c.type==='objective').length,1);
        session.clearTarget();session.selectTarget('wreck',node.id,'map');
        assert.equal(save.player.currentTargetId,node.id);assert.equal(save.player.navTargetId,'mourning-line');
    }
    save.player.position=node.position.map((v,i)=>v+(i===0?10:0));session.activeInstanceId='mourning-line';
    node.scanned=true;
    assert.equal(session.buildNavigationMapModel().contacts.filter(c=>c.id===node.id).length,1);
    assert.equal(session.radarContacts().filter(c=>c.selected).length,1);
    const restored=fixture('salvage-black-box',hydrateSave(JSON.parse(JSON.stringify(save))));
    restored.session.ensureTutorialFieldTarget();
    assert.equal(restored.save.player.currentTargetId,node.id);
    assert.equal(restored.quest.flags.blackBoxTargetId,quest.flags.blackBoxTargetId);
    // Ordinary wrecks still obey normal sensor range; completion removes the special beacon.
    const ordinary=session.wreckNodes.find(n=>n.id!==node.id && n.remaining>0);
    save.player.position=[...LOCATIONS.cairn.position];save.player.currentTargetId=ordinary.id;
    session.maintainTargetLock();assert.equal(save.player.currentTargetId,undefined);
    session.selectTarget('location','cairn','map');
    session.updateActiveInstance(true);assert.equal(save.player.navTargetId,'cairn','taking a repair detour must not be overwritten');
    quest.stepId='dock-cairn';assert.equal(session.tutorialFieldTarget(),undefined);
});

test('Rin supplies one radar and the actual locker fitting costs nothing and advances the lesson',()=>{
    const {session,save,quest}=fixture('fit-upgrade');
    session.ensureTutorialEquipment();session.ensureTutorialEquipment();
    assert.equal(save.player.outfitting.locker['radar-mk2'],1);
    const draft=loadoutFor(save.player,save.player.shipId);
    const freeMount=draft.utility.indexOf(null);assert.ok(freeMount>=0);
    draft.utility[freeMount]='radar-mk2';
    const quote=session.previewOutfitting(save.player.shipId,draft);
    assert.equal(quote.ok,true,quote.code);const credits=save.player.credits;
    assert.equal(session.applyOutfitting(quote).ok,true);
    assert.equal(save.player.credits,credits);assert.equal(quest.stepId,'launch-helix');
    assert.ok(loadoutFor(save.player).utility.includes('radar-mk2'));
    const restored=fixture('launch-helix',hydrateSave(JSON.parse(JSON.stringify(save))));
    restored.session.ensureTutorialEquipment();assert.equal(restored.save.player.outfitting.locker['radar-mk2']??0,0);
});

test('the fitting lesson protects its radar while allowing a single weapon group',()=>{
    const {session,save}=fixture('fit-upgrade');session.ensureTutorialEquipment();
    const draft=loadoutFor(save.player);
    const quote=quoteOutfitting(save.player,save.player.shipId,draft,{locationId:'helix',sales:{'radar-mk2':1}});
    assert.equal(quote.ok,true,quote.code);
    assert.equal(session.applyOutfitting(quote).code,'tutorial-radar-reserved');
    const stripped=loadoutFor(save.player);stripped.guns[1]=null;
    assert.equal(session.applyOutfitting(save.player.shipId,stripped).ok,true);
});

test('service review requires completed repairs and refill, persists help and charges only the quoted bill',()=>{
    const {session,save,quest}=fixture('service-ship');save.player.dockedAt='vesper';
    save.player.credits=0;save.player.hull-=10;save.player.fuel=0;
    const bill=repairCost(save.player)+refillCost(save.player);assert.ok(bill>0);
    let persisted;session.persistSave=()=>{persisted=JSON.stringify(save);};
    session.checkTutorialServices(true);
    assert.equal(quest.stepId,'service-ship');assert.equal(save.player.credits,bill);
    assert.equal(getTutorialQuest(hydrateSave(JSON.parse(persisted))).flags.servicesReviewed,true);
    session.repair();assert.equal(quest.stepId,'service-ship');
    session.refuel();assert.equal(quest.stepId,'mine-shardbelt');assert.equal(save.player.credits,0);
    assert.equal(repairCost(save.player)+refillCost(save.player),0);
    quest.stepId='service-ship';session.checkTutorialServices(true);
    assert.equal(quest.stepId,'mine-shardbelt');assert.equal(save.player.credits,0);
});

test('map selection, actual flight inputs and cockpit monitor actions complete their own lessons',()=>{
    const {session,save,quest}=fixture('plot-vesper');save.player.dockedAt=undefined;
    session.selectTarget('location','vesper');assert.equal(quest.stepId,'plot-vesper');
    session.selectTarget('location','vesper','map');assert.equal(quest.stepId,'flight-checks');
    session.toggleHyperdrive();assert.equal(Boolean(session.autopilot),false);
    session.updateTutorialFlightChecks(1,{yaw:0});assert.equal(quest.flags['learned-steering'],undefined);
    save.player.throttle=.5;save.player.velocity=[0,0,-20];
    session.updateTutorialFlightChecks(1,{yaw:.3});
    assert.equal(quest.flags['learned-thrust'],true);assert.equal(quest.flags['learned-steering'],true);
    session.afterburning=true;session.updateTutorialFlightChecks(2,{});
    assert.equal(quest.flags['learned-boost'],undefined,'holding boost below cruise speed is not the acceleration lesson');
    save.player.velocity=[0,0,-session.playerStats().maxSpeed];
    session.updateTutorialFlightChecks(1,{});
    assert.equal(quest.flags['learned-boost'],undefined);
    session.updateTutorialFlightChecks(1,{});assert.equal(quest.flags['learned-boost'],true);
    session.cycleTarget();assert.equal(quest.flags['learned-target-monitor'],true);
    session.openShipMenu();assert.equal(quest.flags['learned-ship-monitor'],true);
    assert.equal(quest.stepId,'fly-vesper');assert.equal(save.player.navTargetId,'vesper');
});

test('existing saves at the former group lesson recover directly to combat',()=>{
    const {session,save,quest}=fixture('check-weapons');save.player.dockedAt=undefined;session.activeInstanceId='helix';
    session.handleTutorialEvent('resume');assert.equal(quest.stepId,'defeat-raider');
});

test('tutorial cargo remains recoverable after reload and cannot advance with a full hold',()=>{
    const {session,save,quest}=fixture('collect-cargo');save.player.dockedAt=undefined;
    session.ensureTutorialCargo();session.ensureTutorialCargo();assert.equal(session.pickups.length,1);
    const pickup=session.pickups[0];const position=session.tutorialFieldTarget().position;
    const restored=fixture('collect-cargo',hydrateSave(JSON.parse(JSON.stringify(save))));
    restored.session.ensureTutorialCargo();assert.deepEqual(restored.session.tutorialFieldTarget().position,position);
    save.player.cargo={ore:Math.floor(cargoCapacity(save.player)/COMMODITIES.ore.mass)};
    session.collectPickup(pickup);assert.equal(quest.stepId,'collect-cargo');assert.equal(pickup.life,Infinity);
    save.player.cargo={};session.collectPickup(pickup);
    assert.equal(quest.stepId,'salvage-black-box');assert.equal(save.player.cargo.ore,1);
    assert.equal(save.player.currentTargetId,quest.flags.blackBoxTargetId);
    session.collectPickup(pickup);assert.equal(save.player.cargo.ore,1);
});

test('jettisoning ordinary goods makes room without immediately scooping the same crate again',()=>{
    const {session,save}=fixture('collect-cargo');save.player.dockedAt=undefined;
    save.player.cargo.ore=3;
    assert.equal(session.jettisonCargo('ore'),true);assert.equal(save.player.cargo.ore,0);
    const pickup=session.pickups[0];
    session.pickupStore.setPos(pickup.slot,...save.player.position);session.pickupStore.setVel(pickup.slot,0,0,0);
    session.updatePickups(.1);assert.equal(save.player.cargo.ore,0);assert.ok(pickup.life>0);
    save.world.time+=8;session.updatePickups(.1);assert.equal(save.player.cargo.ore,3);
});

test('selecting Meridian in the galaxy map creates the actual gate route and completes the plotting lesson',()=>{
    const {session,save,quest}=fixture('galaxy-map');save.player.dockedAt=undefined;
    save.player.position=[...LOCATIONS.cairn.position];
    session.selectTarget('system','meridian');assert.equal(quest.stepId,'galaxy-map');
    session.selectTarget('system','meridian','map');assert.equal(quest.stepId,'cross-meridian-gate');
    assert.equal(save.world.plannedSystemId,'meridian');
    assert.equal(save.player.navTargetId,'verge-meridian-point');
    assert.equal(session.getTargetRef().kind,'location');
    assert.equal(session.getTargetRef().id,'verge-meridian-point');
    // Rin has jumped ahead: the companion stays out of the sky for the whole
    // earn-and-equip stretch, and the saved gate route survives a reload.
    const restored=hydrateSave(JSON.parse(JSON.stringify(save)));
    assert.equal(getTutorialQuest(restored).stepId,'cross-meridian-gate');
    assert.equal(restored.world.plannedSystemId,'meridian');
});
test('after Rin departs, the Wayfarer flies solo and the galaxy plot still lands',()=>{
    const {session,save,quest}=fixture('family-choice');
    save.player.dockedAt='cairn';
    session.handleTutorialEvent('choice',{choiceId:'trust-rin'});
    assert.equal(quest.stepId,'galaxy-map');assert.equal(quest.flags.rinDeparted,true);
    assert.equal(session.ensureTutorialCompanion(),undefined);
    // The player keeps flying their own routes while Rin is away.
    assert.equal(session.tutorialSummary().destinationId,'cairn');
    session.selectTarget('system','meridian','map');
    assert.equal(quest.stepId,'cross-meridian-gate');
});
