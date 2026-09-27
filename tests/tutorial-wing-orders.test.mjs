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
const {campaignWingUnlocked,campaignWingOrder,CAMPAIGN_BREAK_CLEARANCE,CAMPAIGN_FIGHT_CLEARANCE} = await import('../src/game/campaignWing.js');
const {WING_ORDERS,WING_ORDER_GATE,WING_ORDER_LABEL,WING_ORDER_HINT,WING_ORDER_SHORT,normalizeWingOrder,nextWingOrder} = await import('../src/game/wingOrders.js');
const {DE_CATALOG} = await import('../src/game/i18n-de.js');
const {setLanguage} = await import('../src/game/i18n.js');
// The runtime language is process-global and the chip copy is asserted below.
setLanguage('en');

// The prologue's live scene: a real session, a real companion spawn, and a
// recorder in place of the combat AI so the doctrine's decisions are readable.
function fixture(step='check-weapons'){
    const save=createNewSave(2468,{tutorial:true});
    const quest=getTutorialQuest(save);quest.stepId=step;
    save.player.dockedAt=undefined;save.player.position=[...LOCATIONS.shardbelt.position];
    save.player.rotation=[0,0,0,1];save.player.velocity=[0,0,0];save.player.currentTargetId=undefined;
    const session=Object.create(GameSession.prototype);session.save=save;
    const events=[],lines=[],chip=[];
    session.ui={isModalOpen:false,showStoryLine(){},clearPilotLine(){},dismissStory(){},showToast(){},pushSensor(){},showHud(){},hideHud(){},refreshDock(){},hideDock(){},
        showPilotLine(...line){lines.push(line);},pushEvent(...event){events.push(event);},setWingTactics(crew,count){chip.push([crew.map(entry=>entry.order),count]);}};
    session.audio={play(){},playComms(){},setStationMode(){}};
    session.renderer={async ensureStationModels(){},ensureGlbShipModel(){},setTarget(){},setUtilityBeam(){},setCockpitVisible(){}};
    session.ships=[];session.entityCounter=0;session.persistSave=()=>{};session.activeInstanceId='shardbelt';
    session.tmpQ2=new THREE.Quaternion();
    for(const key of ['tmpTutorialGoal','tmpTutorialForward','tmpTutorialRight','tmpTutorialUp','tmpP2','tmpP3'])session[key]=new THREE.Vector3();
    session.activeFieldObstacles=()=>[];session.hostilesVisibleNear=()=>false;session.lineBlocked=()=>false;
    session.travel=0;session.updateTravelAI=()=>{session.travel++;};
    session.ai=[];session.updateAttackAI=(ship,position,velocity)=>session.ai.push({ship,position:[position.x,position.y,position.z],velocity:[velocity.x,velocity.y,velocity.z]});
    const wing=session.ensureTutorialCompanion(true);
    const putEnemy=(distance,extra={})=>{
        const enemy={id:'raider',name:'Ash Moth',hull:58,shield:0,hostile:true,velocity:[0,0,0],targetId:'player',spawnTime:save.world.time,
            position:[save.player.position[0],save.player.position[1],save.player.position[2]-distance],...extra};
        session.ships.push(enemy);
        return enemy;
    };
    return {save,quest,session,events,lines,chip,wing,putEnemy};
}

test('the prologue teaches wing orders at the fight, exactly once',()=>{
    const early=fixture('fly-vesper');
    assert.equal(early.save.wingOrder,'aggressive','a fresh career starts aggressive');
    assert.equal(campaignWingUnlocked(early.save),false,'orders are not taught before the fight');
    assert.equal(early.session.campaignWingActive(),false);
    assert.equal(early.session.setCampaignWingOrder('defensive'),false,'no order is taken before the lesson');
    assert.equal(early.save.wingOrder,'aggressive');
    assert.equal(early.session.wingOrderCommand(),false);
    assert.equal(early.chip.length,0,'and no chip is offered');
    // The lesson is delivered by the step handler that opens the fight.
    early.quest.stepId='defeat-raider';
    early.session.applyTutorialTransition({stepId:'defeat-raider',fromStepId:'mine-shardbelt',changed:true});
    assert.equal(campaignWingUnlocked(early.save),true);
    assert.equal(early.quest.flags.wingOrders,true,'the lesson is remembered on the quest');
    assert.match(early.lines.at(-1)[1],/on your wing/);
    assert.match(early.events.at(-1)[0],/WING ORDERS/);
    assert.deepEqual(early.chip.at(-1),[['aggressive'],1],'the wing card appears with the order');
    assert.equal(early.session.campaignWingActive(),true);
    assert.equal(early.session.introduceCampaignWingOrders(),false,'and the lesson never repeats');
    // Skipped and finished prologues keep the mechanic for the rest of the career.
    const finished=createNewSave(7,{tutorial:true});
    getTutorialQuest(finished).completedAt=1;
    assert.equal(campaignWingUnlocked(finished),true);
    assert.equal(campaignWingUnlocked(createNewSave(8)),true,'a career with no prologue record is not locked out');
    assert.equal(campaignWingUnlocked({}),false);
    // A save parked mid-prologue from before this shipped, with no flag at all.
    const legacy=fixture('check-weapons');
    delete legacy.quest.flags.wingOrders;
    assert.equal(campaignWingUnlocked(legacy.save),true,'the legacy combat-prep step counts as taught');
    assert.equal(campaignWingUnlocked(fixture('service-ship').save),false,'the ship check does not');
});

test('a companion flies the same range gates as an arena veteran',()=>{
    const {save,session,wing,putEnemy}=fixture();
    assert.ok(wing?.tutorialCompanion,'the Second Light is on the wing');
    const pilot=save.player;
    const place=(enemy,distance)=>enemy.position=[pilot.position[0],pilot.position[1],pilot.position[2]-distance];
    const enemy=putEnemy(1200);
    const state=()=>session.applyCampaignWingOrder(wing);
    assert.equal(state().target,undefined,'a target beyond the gate is not engaged');
    assert.equal(wing.holdFire,true);assert.equal(wing.targetId,undefined);
    place(enemy,900);assert.equal(state().target,enemy,'aggressive engages inside 1000 km');
    assert.equal(wing.holdFire,false);assert.equal(wing.targetId,enemy.id);
    place(enemy,1400);assert.equal(state().target,enemy,'a held target is kept out to 1500 km');
    place(enemy,1600);assert.equal(state().target,undefined,'and dropped past it');
    assert.equal(wing.holdFire,true);
    // Defensive is the pilot's mark only, inside 600 km.
    assert.equal(session.setCampaignWingOrder('defensive'),true);
    assert.equal(save.wingOrder,'defensive');
    place(enemy,900);pilot.currentTargetId=undefined;
    assert.equal(state().target,undefined,'defensive ignores a hostile the pilot has not marked');
    pilot.currentTargetId=enemy.id;place(enemy,700);
    assert.equal(state().target,undefined,'and the mark beyond 600 km');
    place(enemy,500);assert.equal(state().target,enemy,'engages the mark inside 600 km');
    place(enemy,900);assert.equal(state().target,enemy,'keeps it out to 1000 km');
    place(enemy,1100);assert.equal(state().target,undefined,'then re-forms');
    // Self-defence, without the pilot marking anything.
    place(enemy,800);pilot.currentTargetId=undefined;enemy.targetId=wing.id;
    assert.equal(state().target,enemy,'answers fire inside the band');
    place(enemy,1200);assert.equal(state().target,undefined,'but never chases it out of the band');
    enemy.targetId='player';
    // Aggressive prefers the pilot's own mark over a nearer hostile.
    assert.equal(session.setCampaignWingOrder('aggressive'),true);
    place(enemy,800);const other=putEnemy(500);
    pilot.currentTargetId=enemy.id;
    assert.equal(state().target,enemy,'the pilot mark outranks a nearer hostile');
    // A new order is a fresh decision: no hysteresis carries across it.
    place(enemy,800);pilot.currentTargetId=enemy.id;
    assert.equal(session.setCampaignWingOrder('defensive'),true);
    assert.equal(state().target,undefined,'defensive drops the 800 km mark it inherited');
    assert.equal(WING_ORDER_GATE.defensive.acquire,600);
});

test('break off stations the companion clear of the fight with weapons held',()=>{
    const {save,session,wing,putEnemy}=fixture();
    const pilot=save.player;
    const enemy=putEnemy(300);
    assert.equal(session.setCampaignWingOrder('breakoff'),true);
    const state=session.applyCampaignWingOrder(wing);
    assert.equal(state.target,undefined,'a breaking-off wing engages nothing');
    assert.equal(wing.holdFire,true);assert.equal(wing.targetId,undefined);
    const goal=session.campaignBreakGoal(wing,new THREE.Vector3());
    const away=goal.clone().sub(new THREE.Vector3(...pilot.position));
    const towardEnemy=new THREE.Vector3(...enemy.position).sub(new THREE.Vector3(...pilot.position)).normalize();
    assert.ok(Math.abs(away.length()-CAMPAIGN_BREAK_CLEARANCE)<20,'it stations at the break clearance');
    assert.ok(away.clone().normalize().dot(towardEnemy)<-0.9,'on the far side of the pilot from the fight');
    // The live path flies her there rather than into the fight.
    session.ai.length=0;
    session.updateTutorialCompanion(wing,1/60);
    assert.equal(session.ai.length,0,'a breaking-off companion flies no attack');
    assert.deepEqual(wing.destination.map(Math.round),[Math.round(goal.x),Math.round(goal.y),Math.round(goal.z)]);
    assert.ok(session.travel>0,'and follows the station leg');
});

test('before the lesson the companion keeps her scripted help, order or not',()=>{
    const before=fixture('mine-shardbelt');
    const enemy=before.putEnemy(300,{tutorialEnemy:true});
    before.save.player.hull=1;before.save.wingOrder='breakoff';
    before.session.updateTutorialCompanion(before.wing,1/60);
    assert.equal(before.session.ai.length,1,'the scripted rescue still engages regardless of the stored order');
    assert.deepEqual(before.session.ai[0].position,enemy.position);
    assert.equal(before.wing.targetId,enemy.id);
    // Once the lesson has landed the same order governs: she holds fire.
    before.quest.stepId='defeat-raider';
    assert.equal(campaignWingUnlocked(before.save),true,'the fight itself is the lesson');
    before.quest.flags.wingOrders=true;
    before.session.ai.length=0;
    before.session.updateTutorialCompanion(before.wing,1/60);
    assert.equal(before.session.ai.length,0,'a break-off order now holds her fire');
    assert.equal(before.wing.holdFire,true);assert.equal(before.wing.targetId,undefined);
    // Aggressive, the default, engages the prologue's raider as the rescue did.
    before.save.wingOrder='aggressive';
    before.session.updateTutorialCompanion(before.wing,1/60);
    assert.equal(before.session.ai.length,1,'an in-gate raider is engaged under aggressive');
    assert.deepEqual(before.session.ai[0].position,enemy.position);
});

test('the wing chip covers both scenes and never crosses their orders',()=>{
    const {save,session,wing,chip}=fixture();
    assert.equal(session.wingOrderCommand(),true,'the campaign wing takes the order');
    assert.equal(save.wingOrder,nextWingOrder('aggressive'),'and cycles it');
    assert.deepEqual(chip.at(-1),[['defensive'],1],'the card follows the order at once');
    session.publishCampaignWing();assert.deepEqual(chip.at(-1),[['defensive'],1]);
    wing.hull=0;session.publishCampaignWing();
    assert.deepEqual(chip.at(-1),[[],0],'the card is gone with no wing flying');
    assert.equal(session.wingOrderCommand(),false,'and no order is taken');
    // A run has its own wing and its own order: the career's must not move.
    wing.hull=20;
    save.arenaRun={version:2,phase:'combat',wave:0,cleared:0,elapsed:0,damage:0,missiles:0,totalWaves:10,wingmen:[],wingOrder:'aggressive'};
    session.arena={run:true};
    assert.equal(session.campaignWingActive(),false,'the run scene belongs to the run');
    assert.equal(session.setCampaignWingOrder('breakoff'),false);
    assert.equal(session.wingOrderCommand('breakoff'),true);
    assert.equal(save.arenaRun.wingOrder,'breakoff','the run takes the order');
    assert.equal(save.wingOrder,'defensive','and the career keeps its own');
});

test('the campaign order saves with the career and reads in German',()=>{
    const {save,session}=fixture();
    session.wingOrderCommand('defensive');
    const reloaded=hydrateSave(JSON.parse(JSON.stringify(save)));
    assert.equal(campaignWingOrder(reloaded),'defensive','the order saves with the career');
    const legacy=JSON.parse(JSON.stringify(save));delete legacy.wingOrder;
    assert.equal(campaignWingOrder(hydrateSave(legacy)),'aggressive','an older career default-fills');
    assert.equal(campaignWingOrder({wingOrder:'formation'}),'defensive','legacy names still migrate');
    for(const order of WING_ORDERS){assert.ok(DE_CATALOG[WING_ORDER_LABEL[order]],order);assert.ok(DE_CATALOG[WING_ORDER_HINT[order]],order);}
    assert.ok(DE_CATALOG['I am on your wing now. Aggressive, defensive or break off — press Y or tap my wing card at the top right to change my orders.']);
    assert.ok(DE_CATALOG['WING ORDERS · Y or the wing cards at the top right cycle aggressive, defensive and break off']);
    // The wing cards are built by the real UI from the published crew: one per
    // wingman, stance-only text, shield/hull fills, and the per-wing command.
    const makeNode=()=>({id:'',type:'',className:'',innerHTML:'',dataset:{},children:[],parentNode:null,classList:{toggle(){},add(){},remove(){}},
        setAttribute(name,value){this[name]=value;if(name.startsWith('data-')){const key=name.slice(5).replace(/-([a-z])/g,(match,letter)=>letter.toUpperCase());this.dataset[key]=value;}},
        appendChild(child){child.parentNode=this;this.children.push(child);return child;},
        remove(){const parent=this.parentNode;if(parent){const at=parent.children.indexOf(this);if(at>=0)parent.children.splice(at,1);}}});
    const rail=makeNode();
    const ui=Object.create(GameUI.prototype);
    ui.root={querySelector:selector=>selector==='#hud-wing-tactics'?rail:undefined,createElement:()=>makeNode()};
    ui.setWingTactics([{index:0,order:'breakoff',name:'Rin Vek',hull:36,maxHull:36,shield:110,maxShield:220}],1);
    assert.equal(rail.children.length,1,'one card for the one companion');
    const card=rail.children[0];
    assert.equal(card.dataset.wingIndex,'0');
    assert.equal(card.dataset.wingOrder,'breakoff');
    assert.match(card.innerHTML,new RegExp(WING_ORDER_SHORT.breakoff));
    assert.equal(card['aria-label'],'Wing order · BREAK OFF · Press Y or tap');
    assert.match(card.innerHTML,/width:100%/,'the hull fill reads full');
    assert.match(card.innerHTML,/width:50%/,'the shield fill reads half');
    assert.equal(ui.wingOrderCount,1,'the ship menu reads the live wing count');
    // Repaints are keyed: same state, same card object, no innerHTML churn.
    const before=card.innerHTML;
    ui.setWingTactics([{index:0,order:'breakoff',name:'Rin Vek',hull:36,maxHull:36,shield:110,maxShield:220}],1);
    assert.equal(rail.children[0],card,'the card is reused, not rebuilt');
    assert.equal(card.innerHTML,before);
    ui.setWingTactics([{index:0,order:'defensive',name:'Rin Vek',hull:36,maxHull:36,shield:220,maxShield:220}],1);
    assert.equal(card.dataset.wingOrder,'defensive');
    assert.match(card.innerHTML,/width:100%/,'a full shield refills the fill');
    // A wingman that is gone takes its card with it.
    ui.setWingTactics([],0);
    assert.equal(rail.children.length,0,'no wing, no cards');
    assert.equal(ui.wingOrderCount,0);
    setLanguage('de');
    // The emptied rail grows a fresh card; the state key still repaints it in
    // the language of the moment.
    ui.setWingTactics([{index:0,order:'defensive',name:'Rin Vek',hull:36,maxHull:36,shield:220,maxShield:220}],1);
    const germanCard=rail.children[0];
    assert.equal(germanCard['aria-label'],'Flügelbefehl · DEFENSIV · Y drücken oder tippen');
    ui.setWingTactics([],0);
    setLanguage('en');
});

test('the paused ship menu repeats all three orders and their gate',()=>{
    // The wing cards hang off the HUD rail: the shared command, empty until a
    // wing is published, clear of the status monitors.
    const markup=GameUI.prototype.shellMarkup();
    assert.match(markup,/id="hud-wing-tactics"/,'the HUD carries the wing rail');
    assert.ok(!markup.includes('id="screen-wing-order"'),'the monitors no longer carry a wing plaque');
    assert.ok(!markup.includes('id="target-wing-order"'),'the target monitor no longer carries a wing plaque');
    for(const initial of ['S','E','H'])assert.ok(markup.includes(`<span data-short="${initial}">`),`the ${initial} bar prints one letter`);
    for(const value of ['screen-own-shield-value','screen-own-energy-value','screen-own-hull-value','screen-target-shield-value','screen-target-hull-value'])
        assert.ok(!markup.includes(value),`the ${value} numeric readout is gone from the monitors`);
    assert.ok(markup.includes('id="own-hull-outline"'),'the own-ship schematic is back');
    assert.ok(markup.includes('id="target-hull-outline"'),'the target schematic is back');
    const ui=Object.create(GameUI.prototype);
    ui.save=createNewSave(31);
    ui.wingTacticsCrew=[];
    assert.equal(ui.renderShipWingOrders(),'','with no wing there is no wing section');
    ui.wingTacticsCrew=[{index:0,order:'formation',name:'Rin Vek'},{index:1,order:'aggressive',name:'Dorn Halver'}];
    const html=ui.renderShipWingOrders();
    assert.equal((html.match(/data-ui-command="wing-order"/g)??[]).length,2*WING_ORDERS.length,'one button row per wingman');
    assert.match(html,/data-wing-value="defensive" data-wing-index="0" aria-pressed="true"/,'a legacy order reads as the migrated one');
    assert.match(html,/data-wing-value="aggressive" data-wing-index="1" aria-pressed="true"/,'the second wingman flies its own order');
    for(const order of WING_ORDERS)assert.match(html,new RegExp(`data-wing-value="${order}"`),order);
    assert.match(html,/Rin Vek/);assert.match(html,/Dorn Halver/);
    assert.match(html,/WING ORDERS/);
    setLanguage('de');
    assert.match(ui.renderShipWingOrders(),/FLÜGELBEFEHLE/);
    assert.ok(DE_CATALOG['WING ORDERS']);assert.ok(DE_CATALOG[WING_ORDER_SHORT.aggressive]);
    setLanguage('en');
});

test('the story companion is disabled at one hull and returns when the fight is won',()=>{
    const {save,session,wing,putEnemy,lines,events,chip}=fixture('defeat-raider');
    assert.equal(campaignWingUnlocked(save),true);
    assert.equal(CAMPAIGN_FIGHT_CLEARANCE,1500,'the fight bubble is the aggressive release gate');
    // The hit that would have killed her: the hull floors at one point and the
    // reactor drops instead of the ship exploding.
    session.damageShip(wing,999,'raider',[0,0,0]);
    assert.equal(wing.hull,1,'her hull floors at one point');
    assert.equal(wing.poweredDown,true,'and she powers down instead of dying');
    assert.equal(wing.holdFire,true);assert.equal(wing.targetId,undefined);assert.equal(wing.wingTargetId,undefined);
    assert.match(lines.at(-1)[1],/drifting/);
    assert.match(events.at(-1)[0],/disabled/);
    // A disabled companion takes no orders, so the order control goes with her.
    assert.equal(session.campaignWingActive(),false);
    assert.equal(session.setCampaignWingOrder('breakoff'),false);
    assert.equal(save.wingOrder,'aggressive','and the standing order does not move');
    // While an opponent is in the bubble she stays dark: no attack, no station.
    const enemy=putEnemy(400);session.travel=0;session.ai.length=0;chip.length=0;
    wing.holdFire=false;wing.velocity=[0,-20,0];const positionBefore=[...wing.position];
    session.updateTutorialCompanion(wing,1/60);
    assert.equal(wing.poweredDown,true,'the fight is not over');
    assert.equal(session.ai.length,0,'she fires nothing while dark');
    assert.equal(session.travel,0,'and does not fly a station leg (which would run her turrets)');
    assert.equal(wing.holdFire,true,'her weapons stay held while she is dark');
    assert.ok(Math.abs(wing.velocity[1])<20,'she bleeds off momentum');
    assert.notDeepEqual(wing.position,positionBefore,'and keeps drifting where she was hit');
    // The card stays up while she is dark — dimmed, shield drained — so the
    // pilot can see WHY the wing is short one fighter.
    assert.deepEqual(chip.at(-1),[['aggressive'],1],'and the dimmed card stays with her');
    // Beating the last opponent in the bubble brings her back online.
    enemy.hull=0;
    session.updateTutorialCompanion(wing,1/60);
    assert.equal(wing.poweredDown,false,'the field is clear and she powers up');
    assert.equal(wing.shield,wing.maxShield,'the reactor restart refills her shield');
    assert.equal(wing.hull,1,'on that same point of hull');
    assert.match(lines.at(-1)[1],/Reactors are back/);
    assert.equal(session.campaignWingActive(),true,'and the order control comes back with her');
    // From here her shield is the only thing a fight can spend: a shield hit is
    // absorbed without shutting her down, and the first hull hit puts her out.
    session.damageShip(wing,40,'raider',[0,0,0]);
    assert.equal(wing.poweredDown,false,'shields take the damage');
    assert.equal(wing.hull,1);
    session.damageShip(wing,999,'raider',[0,0,0]);
    assert.equal(wing.poweredDown,true,'the hull hit behind the shields puts her down again');
    // A distant opponent is not "this fight": only the bubble holds her down.
    putEnemy(CAMPAIGN_FIGHT_CLEARANCE+400);
    session.updateTutorialCompanion(wing,1/60);
    assert.equal(wing.poweredDown,false,'an opponent outside the bubble does not keep her dark');
});

test('the target readout names the locked ship\'s manoeuvre in one word',()=>{
    const {save,session,wing,putEnemy}=fixture('defeat-raider');
    // Story states first: a surrendered or captured pilot, or the dark
    // companion herself, read as states — not as combat manoeuvres.
    const foe=putEnemy(500);
    assert.equal(session.shipActionWord(foe),'ATTACKING','a locked hostile firing on someone reads as attacking');
    foe.targetId=undefined;
    assert.equal(session.shipActionWord(foe),'HUNT','a hostile with no lock is hunting');
    foe.surrendered=true;foe.hostile=false;foe.targetId=undefined;
    assert.equal(session.shipActionWord(foe),'YIELDING');
    foe.surrendered=false;foe.captured=true;
    assert.equal(session.shipActionWord(foe),'ADRIFT');
    foe.captured=false;
    // The powered-down companion is OFFLINE, never ATTACKING.
    wing.poweredDown=true;
    assert.equal(session.shipActionWord(wing),'OFFLINE');
    wing.poweredDown=false;
    // Working legs get the one word that matches the task.
    const miner=putEnemy(600);miner.hostile=false;miner.task={kind:'mine'};miner.targetId=undefined;
    assert.equal(session.shipActionWord(miner),'MINING');
    miner.task={kind:'trade',origin:'helix',port:'vesper'};
    assert.equal(session.shipActionWord(miner),'TRADING');
    miner.task=undefined;
    assert.equal(session.shipActionWord(miner),'TRANSIT');
    // A mug stop is a demand, and an evading ship reads as evading even when
    // it still holds a lock.
    const mugger=putEnemy(700);mugger.mug={demand:'toll'};mugger.holdFire=true;mugger.targetId='player';
    assert.equal(session.shipActionWord(mugger),'DEMAND');
    mugger.mug=undefined;mugger.holdFire=false;mugger.evasiveUntil=save.world.time+5;
    assert.equal(session.shipActionWord(mugger),'EVADE');
    // Every word the badge can print is translated.
    const words=new Set(['ATTACKING','HUNT','YIELDING','ADRIFT','OFFLINE','MINING','TRADING','TRANSIT','DEMAND','EVADE','FLEE','DISTRESS','ARREST','SALVAGE','SMUGGLE','PATROL','BREAKING','CHARGING','SALVO']);
    setLanguage('de');
    for(const word of words)assert.ok(DE_CATALOG[word],`${word} has a German catalog entry`);
    setLanguage('en');
});
