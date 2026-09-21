import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const THREE=await import('three');
const {GameSession}=await import('../src/game/game.js');
const {createNewSave,hydrateSave}=await import('../src/game/save.js');
const {getTutorialQuest,skipTutorialCampaign}=await import('../src/game/tutorialCampaign.js');
const {generateWreckNodes,generateGraveyardPieces}=await import('../src/game/worldData.js');
const {DE_CATALOG}=await import('../src/game/i18n-de.js');
const {ADVENTURE_DIALOGUES}=await import('../src/game/adventureDialogues.js');
const {TUTORIAL_RADIO,TRAVEL_RADIO}=await import('../src/game/tutorialRadio.js');
const {SYSTEMS}=await import('../src/game/galaxy.js');
const {LOCATIONS}=await import('../src/game/data.js');
const {t,setLanguage}=await import('../src/game/i18n.js');

test('German variables, radio entries and the labels used in lessons remain consistent',()=>{
    const fields=text=>[...text.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
    for(const [en,de] of Object.entries(DE_CATALOG)) assert.deepEqual(fields(en),fields(de),en);
    for(const line of [...TUTORIAL_RADIO,...TRAVEL_RADIO]) {
        assert.ok(DE_CATALOG[line.text],line.id);
        if(line.system) {assert.ok(SYSTEMS[line.system]);assert.ok(DE_CATALOG[line.speaker]);}
        else assert.ok(LOCATIONS[line.destination]);
    }
    assert.equal(new Set([...TUTORIAL_RADIO,...TRAVEL_RADIO].map(l=>l.id)).size,TUTORIAL_RADIO.length+TRAVEL_RADIO.length);
    setLanguage('de');
    assert.equal(t('Dogfight Arena').toUpperCase(),t('COMBAT SIM'));
    assert.equal(t('Gauss Cannon').toUpperCase(),t('MAGRAIL'));
    assert.equal(t('Pulse Cannon').toUpperCase(),t('PULSE LASER'));
    assert.equal(t('DOCKYARD OUTFITTER'),t('SHIP OUTFITTING'));
    assert.ok(ADVENTURE_DIALOGUES.outfitting.nodes.fit.text.de.includes(t('INSTALL FROM LOCKER')));
    assert.ok(ADVENTURE_DIALOGUES.services.nodes.resources.text.de.includes(t('SERVICES')));
    assert.ok(ADVENTURE_DIALOGUES.salvage.nodes.request.text.de.includes(t('SALVAGE')+' gedrückt'));
    assert.doesNotMatch(JSON.stringify(ADVENTURE_DIALOGUES),/Hundekampfarena|Langbasis-Radar|BERGUNG gedrückt|Impulswaffe/);
});

// Bar contacts are prose, not proper nouns: an untranslated key renders the
// English sentence inside a German conversation. Location names stay as they
// are on purpose, so only the person-voiced fields are audited here.
test('every bar contact has German prose for roles and spoken lines',()=>{
    const missing=[];
    for(const [locationId,location] of Object.entries(LOCATIONS))
        for(const person of location.people??[]){
            for(const field of ['role','relationship','affiliation','title'])
                if(person[field] && !DE_CATALOG[person[field]]) missing.push(`${locationId}/${person.id}.${field}: ${person[field]}`);
            for(const field of ['lines','linesNoPrologue'])
                for(const [index,line] of (person[field]??[]).entries())
                    if(!DE_CATALOG[line]) missing.push(`${locationId}/${person.id}.${field}[${index}]: ${line}`);
        }
    assert.deepEqual(missing,[]);
});

function salvageSession(seed,oldSave){
    const save=oldSave??createNewSave(seed,{tutorial:true});
    const quest=getTutorialQuest(save);quest.stepId='salvage-black-box';
    save.player.dockedAt=undefined;
    const s=Object.create(GameSession.prototype);s.save=save;s.renderer={};
    s.graveyard=generateGraveyardPieces(save.world.seed);
    s.wreckNodes=generateWreckNodes(save.world.seed,save.world.depletedWrecks,save.world.scannedNodes);
    for(const key of ['tmpEntryPreferredDirection','tmpEntryAnchor','tmpEntryCandidate','tmpEntryDirection']) s[key]=new THREE.Vector3();
    s.tmpQ=new THREE.Quaternion();s.tmpEuler=new THREE.Euler();
    s.selectTarget=(kind,id)=>{save.player.currentTargetId=id;save.player.navTargetId='mourning-line';};
    return {s,save,quest};
}
test('real generated wrecks provide a short and collision-clear tutorial arrival across seeds and approach directions',()=>{
    for(const seed of [7,42,73199,73201,184093]){
        const {s,save,quest}=salvageSession(seed);
        for(const direction of [[1,0,0],[0,0,1],[-1,-0.4,-1],[0,1,0]]){
            const arrival=new THREE.Vector3();
            assert.equal(s.setFieldEntryPosition(arrival,'mourning-line',new THREE.Vector3(...direction)),true);
            const node=s.wreckNodes.find(n=>n.id===quest.flags.blackBoxTargetId);
            const target=new THREE.Vector3().fromArray(node.position),distance=arrival.distanceTo(target);
            assert.ok(distance>=180 && distance<=301,`${seed}: ${distance}`);
            assert.equal(save.player.currentTargetId,node.id);
            const obstacles=s.activeFieldObstacles('mourning-line');
            assert.ok(s.entryPositionClear(arrival,obstacles,20));
            const approach=arrival.clone().sub(target).normalize();
            for(let d=65;d<=distance;d+=2)
                assert.ok(s.entryPositionClear(target.clone().addScaledVector(approach,d),obstacles,s.playerSpawnClearance()+3),`${seed}: approach obstructed at ${d}`);
        }
        const restored=salvageSession(seed,hydrateSave(JSON.parse(JSON.stringify(save))));
        assert.equal(restored.s.ensureTutorialFieldTarget().id,quest.flags.blackBoxTargetId);
        const arrival=new THREE.Vector3();
        assert.ok(restored.s.setTutorialSalvageEntryPosition(arrival,new THREE.Vector3(1,0,0)));
    }
});
test('an old interior target recovers to an accessible fragment, and free flight keeps ordinary arrivals',()=>{
    const {s,save,quest}=salvageSession(42);
    quest.flags.blackBoxTargetId=s.wreckNodes.find(n=>n.insideWreckId)?.id;
    const arrival=new THREE.Vector3();
    assert.ok(s.setTutorialSalvageEntryPosition(arrival,new THREE.Vector3(0,0,1)));
    const node=s.wreckNodes.find(n=>n.id===quest.flags.blackBoxTargetId);
    assert.ok(arrival.distanceTo(new THREE.Vector3().fromArray(node.position))<=301);
    skipTutorialCampaign(save);
    assert.equal(s.setTutorialSalvageEntryPosition(arrival,new THREE.Vector3(0,0,1)),false);
});

test('regional radio waits for safe travel and quiet gaps, never pauses, and remembers lines after reload',()=>{
    const save=createNewSave(42,{tutorial:true});skipTutorialCampaign(save);
    save.player.dockedAt=undefined;save.player.navTargetId='vesper';save.player.velocity=[0,0,40];save.world.time=100;
    const s=Object.create(GameSession.prototype);s.save=save;s.autopilot=true;s.pendingStoryConversations=[];
    const heard=[];let danger=false;
    let cleared=0;
    s.ui={isModalOpen:false,showPilotLine(...args){heard.push(args);},clearPilotLine(){cleared++;}};
    s.storyLineActive=()=>false;s.hostilesVisibleNear=()=>danger;s.persistSave=()=>{};
    s.updateTutorialRadio();assert.equal(heard.length,1);assert.equal(s.ui.isModalOpen,false);
    save.world.time+=2;s.updateTutorialRadio();assert.equal(heard.length,1);
    danger=true;save.world.time+=2;s.updateTutorialRadio();assert.equal(cleared,1,'danger interrupts a broadcast already on screen');
    save.world.time+=60;danger=true;s.updateTutorialRadio();assert.equal(heard.length,1);
    danger=false;s.ui.isModalOpen=true;save.world.time+=2;s.updateTutorialRadio();assert.equal(heard.length,1);
    s.ui.isModalOpen=false;save.player.dockedAt='helix';save.world.time+=2;s.updateTutorialRadio();assert.equal(heard.length,1);
    save.player.dockedAt=undefined;
    s.save=hydrateSave(JSON.parse(JSON.stringify(save)));s.save.world.time+=60;s.updateTutorialRadio();
    assert.equal(heard.length,2);assert.notEqual(heard[0][1],heard[1][1]);
    assert.equal(s.save.world.travelRadioHeard.length,2);
    assert.ok(heard.every(line=>line[4]===true),'transmissions are retained in the transcript');
});
