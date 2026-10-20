import { completeQuest, getQuest, recordChoice, setStep, startQuest } from './quests.js';

export const TUTORIAL_QUEST_ID = 'the-spare-key';
export const TUTORIAL_STARTING_CREDITS = 3500;
export const TUTORIAL_REQUIRED_SUPPLIES = 16;
export const TUTORIAL_CHAPTER_COUNT = 6;
export const TUTORIAL_MARA_CALL_MIN_COMBAT_VALUE = 50000;
export const TUTORIAL_MINING_CONTRACT_ID = 'tutorial-vesper-mining';
export const TUTORIAL_MINING_QUANTITY = 6;
export const TUTORIAL_MINING_REWARD = 3000;
export const tutorialMiningQuantity = save => save?.activeMissions?.find(m=>m.id===TUTORIAL_MINING_CONTRACT_ID)?.quantity ?? getTutorialQuest(save)?.flags?.miningQuantity ?? TUTORIAL_MINING_QUANTITY;
// Story progress is separate from the restrictions used during guided lessons.
const definitions = [
    ['meet-family',1,'The Spare Key','Meet Mara and Rin in the Helix bar.','Talk to both of them before buying your first cargo.','helix'],
    ['buy-supplies',1,'The Spare Key','Buy the maximum Protein at Helix.','Select Protein in TRADE, then choose BUY MAX.','helix'],
    ['launch-helix',1,'The Spare Key','Launch from Helix.','The cargo is aboard. Rin will meet you outside.','vesper'],
    ['plot-vesper',2,'First Flight','Select Vesper on the navigation map.','Open the centre radar, select VESPER and close the map.','vesper'],
    ['flight-checks',2,'First Flight','Try the flight controls with Rin.','Follow Rin’s instructions on the comms display.','vesper'],
    ['fly-vesper',2,'First Flight','Fly to Vesper and land.','Follow Rin’s approach instructions after hyperdrive ends at Vesper.','vesper'],
    ['sell-supplies',2,'First Flight','Sell all Protein at Vesper.','Open TRADE and sell the cargo you bought at Helix.','vesper'],
    ['fit-upgrade',2,'First Flight','Install the gifted reactor.','Open EQUIPMENT. Fit the owned Reactor Upgrade in a free utility mount.','vesper'],
    ['mining-contract',3,'Blood in the Belt','Talk to Rin, then accept the mining contract.','Talk to Rin, then accept the marked mining contract on the bar’s mission board.','vesper'],
    ['mine-shardbelt',3,'Blood in the Belt','Mine 6 units of ore from the marked deposit.','Fly to the Shardbelt. Select the marked deposit, wait for its scan, then deploy your miners.','shardbelt'],
    ['return-mining',3,'Blood in the Belt','Return to Vesper with the ore.','Select Vesper and engage HYPERDRIVE. Your drones return automatically.','vesper'],
    ['raider-standoff',3,'Blood in the Belt','Face the pirate intercept.','Keep moving. Rin is checking the pirate’s ship.','vesper'],
    ['defeat-raider',3,'Blood in the Belt','Defeat Ash Moth.','Keep moving and fire when the pirate crosses your sights. Release the trigger when energy is low.','vesper'],
    ['land-mining',3,'Blood in the Belt','Land at Vesper and collect your contract payment.','Select Vesper and approach slowly. Your mining contract settles on landing.','vesper'],
    ['salvage-briefing',4,'The Wrecks Remember','Talk to Rin in Vesper’s bar.','Rin has a survey job for you before she leaves to gather information.','vesper'],
    ['fit-pdc',4,'The Wrecks Remember','Switch your drone bay to PDC drones.','Open EQUIPMENT, select the PDC drone in cargo and install it in Drone bay 1.','vesper'],
    ['survey-graveyard',4,'The Wrecks Remember','Chart the major wrecks in Mourning Line.','Fly alone to Mourning Line. Fly within 100 km of each survey star to chart it.','mourning-line'],
    ['rescue-paul',4,'The Wrecks Remember','Help Paul defeat the two Scrappers.','Paul’s Torsas is under attack beside the cruiser. Destroy both pirate ships.','mourning-line'],
    ['talk-paul',4,'The Wrecks Remember','Answer Paul’s transmission.','Paul wants to thank you. Open his comms message.','mourning-line'],
    ['survey-carrier',4,'The Wrecks Remember','Chart the remaining wrecks with Paul.','Follow the survey markers to the carrier. Paul is on your wing.','mourning-line'],
    ['carrier-wait',4,'The Wrecks Remember','Stay near the carrier with Paul.','Keep close to the carrier while Paul checks the old flight deck.','mourning-line'],
    ['hide-patrol',4,'The Wrecks Remember','Switch off your transponder and hide inside the carrier.','Open the left ship monitor, choose Flight and switch the transponder OFF. Enter the marked carrier hangar, lower thrust and hold fire. Five pirates are passing through.','mourning-line'],
    ['return-helix',4,'The Wrecks Remember','Return to Helix and dock.','Switch your transponder ON, select Helix and slow down near the station.','helix'],
    ['mara-debrief',4,'The Wrecks Remember','Talk to Mara at Helix.','Mara is waiting in the bar.','helix'],
    ['earn-standing',5,'Your Own Course','Earn and equip your ship.','Trade, mine and take contracts in the starting system. Mara will call when your ship and equipment are ready. The jump gate is closed for repairs.','helix'],
    ['meet-cairn',5,'Your Own Course','Meet Rin at Cairn Yard.','Mara has news from Rin. Fly to Cairn and land.','cairn'],
    ['rin-cairn',5,'Your Own Course','Talk to Rin at Cairn.','Rin has a lead on your parents. Paul is also here; you can ask him to join you.','cairn'],
    ['launch-black-box',6,'The Black Box','Launch from Cairn.','Rin will join you. Talk to Paul before launching if you want his help.','mourning-line'],
    ['salvage-black-box',6,'The Black Box','Salvage the black box beside the frigate wreck.','Fly to Mourning Line and follow BLACK BOX SIGNAL. Within range, hold SALVAGE.','mourning-line'],
    ['black-box-fight',6,'The Black Box','Defeat the four pirate ships.','Three Scrappers and a Demon are closing in. Protect the black box. Rin will help; Paul joins if you asked him.','mourning-line'],
    ['deliver-black-box',6,'The Black Box','Bring the black box to Mara at Helix.','Fly to Helix, dock and take the black box to the bar.','helix'],
    ['decode-black-box',6,'The Black Box','Give Mara the black box.','Talk to Mara in the Helix bar. She will decode the recorder.','helix'],
    ['complete',6,'The Black Box','Explore on your own terms.','Mara is decoding the black box. Rin is following the next lead. Trade, explore and take contracts across the open jump gate.','helix'],
];
export const TUTORIAL_STEPS = Object.freeze(Object.fromEntries(definitions.map(([id,chapter,chapterTitle,objective,detail,destinationId])=>[id,Object.freeze({id,chapter,chapterTitle,objective,detail,destinationId})])));
export const TUTORIAL_FLIGHT_LESSONS = [
    {id:'thrust',objective:'Raise thrust and get moving.',detail:'Drag the thrust slider on the left upward.'},
    {id:'steering',objective:'Turn the ship.',detail:'Desktop: WASD or arrow keys. Phone: tilt to steer. The edge marker points to your selected target.'},
    {id:'target-monitor',objective:'Try the target monitor.',detail:'Tap the right monitor to cycle contacts. It shows your target and its distance.'},
    {id:'ship-monitor',objective:'Open your ship monitor.',detail:'Tap the left monitor to see your equipment, cargo and mission. Close it to return to flight.'},
];
const integer=value=>Math.max(0,Math.floor(Number(value)||0));
export const getTutorialQuest = save => Array.isArray(save?.quests) ? getQuest(save,TUTORIAL_QUEST_ID) : undefined;
export const isTutorialActive = save => {const q=getTutorialQuest(save);return Boolean(q&&q.completedAt===undefined&&!q.flags?.skipped);};
export const tutorialContentUnlocked = save => !isTutorialActive(save)||Boolean(getTutorialQuest(save)?.flags?.openWorld);
export const isTutorialGuided = save => isTutorialActive(save)&&getTutorialQuest(save)?.stepId!=='earn-standing';
export const tutorialGateOpen = save => !isTutorialActive(save)||Boolean(getTutorialQuest(save)?.flags?.gateOpen);
export const tutorialStep = save => TUTORIAL_STEPS[getTutorialQuest(save)?.stepId];
export const tutorialPeople = (save,locationId) => {
    const q=getTutorialQuest(save);if(!q||q.flags?.skipped||q.completedAt!==undefined)return [];
    const rin = {id:'rin-vek',name:'Rin Vek',role:'Your sister',portrait:'rin-vek'};
    const paul = {id:'paul',name:'Paul',role:'Salvage pilot',portrait:'pilot-veteran'};
    if(locationId==='vesper'&&['mining-contract','salvage-briefing','fit-pdc'].includes(q.stepId))return [rin];
    if(locationId==='cairn'&&['rin-cairn','launch-black-box'].includes(q.stepId))return [rin,paul];
    return [];
};
export const tutorialConversation = (save,personId,locationId) => {
    const q=getTutorialQuest(save);if(!q||q.flags?.skipped||q.completedAt!==undefined)return undefined;
    if(locationId==='helix'&&q.stepId==='meet-family')return {'mara-vek':'mara','rin-vek':'rin'}[personId];
    if(locationId==='vesper'&&personId==='rin-vek')return { 'mining-contract':q.flags.miningExplained?undefined:'mining','salvage-briefing':'salvage' }[q.stepId];
    if(locationId==='helix'&&personId==='mara-vek')return {'mara-debrief':'debrief','decode-black-box':'delivery'}[q.stepId];
    if(locationId==='cairn')return personId==='rin-vek'&&q.stepId==='rin-cairn'?'cairn':personId==='paul'&&!q.flags.paulInvited&&['rin-cairn','launch-black-box'].includes(q.stepId)?'paul-offer':undefined;
};
export const tutorialLaunchBlock = save => {
    if(!isTutorialActive(save))return;
    const q=getTutorialQuest(save),dock=save.player.dockedAt;
    if(dock==='helix'&&q.stepId==='meet-family')return 'You do not have the keys to this ship yet.';
    const prep={helix:['meet-family','buy-supplies','mara-debrief','decode-black-box'],vesper:['sell-supplies','fit-upgrade','mining-contract','salvage-briefing','fit-pdc'],cairn:['rin-cairn']};
    if(prep[dock]?.includes(q.stepId))return TUTORIAL_STEPS[q.stepId].objective;
    if(dock==='helix'&&q.stepId==='launch-helix'&&integer(save.player.cargo?.food)<(q.flags.deliveryRequired??TUTORIAL_REQUIRED_SUPPLIES))return TUTORIAL_STEPS['buy-supplies'].objective;
};
const transition=(save,q,next)=>{const fromStepId=q.stepId;setStep(save,TUTORIAL_QUEST_ID,next);return {changed:true,quest:q,fromStepId,stepId:next};};
export const migrateTutorialCampaign = save => {
    const q=getTutorialQuest(save);if(!q||q.flags?.campaignVersion===2)return;
    q.flags??={};
    // Completed and deliberately skipped careers keep their open-world status.
    if(q.completedAt!==undefined||q.flags.skipped){q.flags.campaignVersion=2;q.flags.openWorld=true;q.flags.gateOpen=true;return;}
    const old=q.stepId;
    q.stepId=({'fit-upgrade':'launch-helix','service-ship':'fit-upgrade','check-weapons':'mine-shardbelt','collect-cargo':'land-mining','salvage-black-box':'salvage-briefing','dock-cairn':'salvage-briefing','family-choice':'salvage-briefing','galaxy-map':'earn-standing','cross-meridian-gate':'earn-standing'})[old]??(TUTORIAL_STEPS[old]?old:'meet-family');
    // Earlier careers bought only two packs. Never require another purchase halfway through a delivery.
    q.flags.deliveryRequired=Math.max(2,integer(q.flags.suppliesBought)||2);
    delete q.flags.blackBoxTargetId;delete q.flags.blackBoxNodeId;delete q.flags.blackBoxRecovered;
    q.flags.campaignVersion=2;q.flags.openWorld=q.stepId==='earn-standing';q.flags.gateOpen=false;
    save.world.campaignUnlocked=Boolean(q.flags.openWorld);
};
export const startTutorialCampaign=(save,startedAt=save?.world?.time??0)=>{
    if(!save||!Array.isArray(save.quests))return;
    const existing=getTutorialQuest(save);if(existing){migrateTutorialCampaign(save);return existing;}
    const q=startQuest(save,TUTORIAL_QUEST_ID,startedAt);q.stepId='meet-family';q.flags={story:true,campaignVersion:2,deliveryRequired:TUTORIAL_REQUIRED_SUPPLIES,suppliesBought:0,suppliesSold:0};q.choices={};
    save.player.credits=TUTORIAL_STARTING_CREDITS;save.player.navTargetId='helix';save.world.campaignUnlocked=false;return q;
};
export const skipTutorialCampaign=(save,at=save?.world?.time??0)=>{const q=getTutorialQuest(save);if(!isTutorialActive(save))return {changed:false,quest:q};q.flags.skipped=true;q.flags.gateOpen=true;q.flags.openWorld=true;const r=transition(save,q,'complete');completeQuest(save,TUTORIAL_QUEST_ID,at);save.world.campaignUnlocked=true;return {...r,completed:true,skipped:true};};
export const advanceTutorialCampaign=(save,event={})=>{
    migrateTutorialCampaign(save);const q=getTutorialQuest(save);if(!isTutorialActive(save))return {changed:false,quest:q};
    const s=q.stepId,f=q.flags,type=event.type;
    const next=id=>transition(save,q,id);
    const talked=(person,port)=>type==='talked'&&event.personId===person&&event.locationId===port&&(!event.topicId||event.topicId==='greeting');
    const dock=port=>type==='docked'&&event.locationId===port;
    const required=f.deliveryRequired??TUTORIAL_REQUIRED_SUPPLIES;
    if(s==='meet-family'&&type==='talked'&&event.locationId==='helix'&&(!event.topicId||event.topicId==='greeting')){
        const key={'mara-vek':'metMara','rin-vek':'metRin'}[event.personId];if(!key)return {changed:false,quest:q};f[key]=true;
        if(f.metMara&&f.metRin){f.suppliesBought=integer(save.player.cargo?.food);return next(f.suppliesBought>=required?'launch-helix':'buy-supplies');}
        return {changed:true,quest:q,fromStepId:s,stepId:s};
    }
    if(s==='buy-supplies'&&type==='traded'&&event.locationId==='helix'&&event.kind==='buy'&&event.commodityId==='food'){f.suppliesBought=integer(event.cargoAfter);if(f.suppliesBought>=required){f.deliveryRequired=f.suppliesBought;return next('launch-helix');}return {changed:true,quest:q,fromStepId:s,stepId:s};}
    if(s==='launch-helix'&&type==='traded'&&event.locationId==='helix'&&event.kind==='buy'&&event.commodityId==='food'){f.suppliesBought=integer(event.cargoAfter);f.deliveryRequired=Math.max(required,f.suppliesBought);return {changed:true,quest:q,fromStepId:s,stepId:s};}
    if(s==='launch-helix'&&type==='traded'&&event.locationId==='helix'&&event.commodityId==='food'&&integer(event.cargoAfter)<required)return next('buy-supplies');
    if(s==='launch-helix'&&type==='launched'&&event.fromLocationId==='helix'&&integer(event.foodCargo)>=required)return next('plot-vesper');
    if(s==='plot-vesper'&&type==='map-selected'&&event.kind==='location'&&event.id==='vesper')return next('flight-checks');
    if(s==='flight-checks'&&type==='flight-lesson'&&TUTORIAL_FLIGHT_LESSONS.some(l=>l.id===event.id)){f['learned-'+event.id]=true;if(TUTORIAL_FLIGHT_LESSONS.every(l=>f['learned-'+l.id]))return next('fly-vesper');return {changed:true,quest:q,fromStepId:s,stepId:s};}
    if(s==='fly-vesper'&&type==='flight-lesson'&&event.id==='boost'){f['learned-boost']=true;return {changed:true,quest:q,fromStepId:s,stepId:s};}
    if(s==='fly-vesper'&&dock('vesper'))return next('sell-supplies');
    if(s==='sell-supplies'&&type==='traded'&&event.locationId==='vesper'&&event.kind==='sell'&&event.commodityId==='food'){f.suppliesSold=integer(f.suppliesSold)+integer(event.quantity);if(f.suppliesSold>=required)return next('fit-upgrade');return {changed:true,quest:q,fromStepId:s,stepId:s};}
    if(s==='fit-upgrade'&&type==='outfitted'&&event.reactorInstalled&&event.locationId==='vesper')return next('mining-contract');
    if(s==='mining-contract'&&type==='mission-accepted'&&event.missionId===TUTORIAL_MINING_CONTRACT_ID&&f.miningExplained){f.miningQuantity=tutorialMiningQuantity(save);return next('mine-shardbelt');}
    if(s==='mining-contract'&&talked('rin-vek','vesper'))f.miningExplained=true;
    if(s==='mine-shardbelt'&&type==='extracted'&&event.source==='mining'&&event.instanceId==='shardbelt'&&event.nodeId===f.oreTargetId){f.oreRecovered=integer(f.oreRecovered)+integer(event.amount);if(f.oreRecovered>=tutorialMiningQuantity(save))return next('return-mining');return {changed:true,quest:q,fromStepId:s,stepId:s};}
    if(s==='return-mining'&&type==='hyperdrive-intercept')return next('raider-standoff');
    if(s==='raider-standoff'&&type==='standoff-ended')return next('defeat-raider');
    if(['raider-standoff','defeat-raider'].includes(s)&&type==='ship-defeated'&&event.tutorialEncounter==='mining'){f.tutorialEnemyDefeated=true;if(event.wreckId)f.tutorialLootWreckId=event.wreckId;return next('land-mining');}
    if(s==='land-mining'&&dock('vesper'))return next('salvage-briefing');
    if(s==='salvage-briefing'&&talked('rin-vek','vesper'))return next('fit-pdc');
    if(s==='fit-pdc'&&type==='drone-configured'&&event.mode==='pdc'&&event.loaded&&event.locationId==='vesper'){f.rinDeparted=true;return next('survey-graveyard');}
    if(s==='survey-graveyard'&&type==='waypoint-reached'){f.surveyIndex=integer(f.surveyIndex)+1;if(event.rescue)return next('rescue-paul');}
    if(s==='rescue-paul'&&type==='encounter-cleared'&&event.encounter==='rescue'){f.paulRescued=true;return next('talk-paul');}
    if(s==='talk-paul'&&type==='conversation-completed'&&event.id==='paul-rescue')return next('survey-carrier');
    if(s==='survey-carrier'&&type==='waypoint-reached'){f.surveyIndex=integer(f.surveyIndex)+1;if(event.last)return next('carrier-wait');}
    if(s==='carrier-wait'&&type==='patrol-arrived')return next('hide-patrol');
    if(s==='hide-patrol'&&type==='patrol-passed')return next('return-helix');
    if(s==='return-helix'&&dock('helix'))return next('mara-debrief');
    if(s==='mara-debrief'&&talked('mara-vek','helix')){f.openWorld=true;save.world.campaignUnlocked=true;return next('earn-standing');}
    if(s==='earn-standing'&&type==='mara-call'){f.maraCallMade=true;return next('meet-cairn');}
    if(s==='meet-cairn'&&dock('cairn'))return next('rin-cairn');
    if(s==='rin-cairn'&&talked('rin-vek','cairn')){f.gateOpen=true;return next('launch-black-box');}
    if(['rin-cairn','launch-black-box'].includes(s)&&type==='choice'&&event.choiceId==='invite-paul'){recordChoice(save,q.id,'paul','joined');f.paulInvited=true;return {changed:true,quest:q,fromStepId:s,stepId:s};}
    if(s==='launch-black-box'&&type==='launched'&&event.fromLocationId==='cairn')return next('salvage-black-box');
    if(s==='salvage-black-box'&&type==='extracted'&&event.source==='salvage'&&event.instanceId==='mourning-line'&&event.nodeId===f.blackBoxTargetId&&integer(event.amount)>0){f.blackBoxRecovered=true;return next('black-box-fight');}
    if(s==='black-box-fight'&&type==='encounter-cleared'&&event.encounter==='black-box')return next('deliver-black-box');
    if(s==='deliver-black-box'&&dock('helix'))return next('decode-black-box');
    if(s==='decode-black-box'&&talked('mara-vek','helix')){f.blackBoxDelivered=true;f.openWorld=true;save.world.campaignUnlocked=true;const r=next('complete');completeQuest(save,q.id,save.world.time);return {...r,completed:true};}
    return {changed:false,quest:q,fromStepId:s,stepId:s};
};
export const tutorialCampaignSummary=save=>{
    const q=getTutorialQuest(save);if(!q)return;const step=TUTORIAL_STEPS[q.stepId]??TUTORIAL_STEPS['meet-family'];
    const lesson=q.stepId==='flight-checks'?TUTORIAL_FLIGHT_LESSONS.find(l=>!q.flags['learned-'+l.id]):undefined;
    let progress;if(q.stepId==='sell-supplies')progress=`${Math.min(q.flags.suppliesSold??0,q.flags.deliveryRequired??16)}/${q.flags.deliveryRequired??16}`;if(q.stepId==='mine-shardbelt')progress=`${q.flags.oreRecovered??0}/${tutorialMiningQuantity(save)}`;
    return {...step,id:q.id,title:'The Spare Key',label:'FAMILY PROLOGUE',active:isTutorialActive(save),guided:isTutorialGuided(save),completed:q.completedAt!==undefined,skipped:Boolean(q.flags.skipped),stepId:q.stepId,chapterCount:TUTORIAL_CHAPTER_COUNT,objective:lesson?.objective??(q.stepId==='mine-shardbelt'?`Mine ${tutorialMiningQuantity(save)} units of ore from the marked deposit.`:step.objective),detail:lesson?.detail??step.detail,lessonId:lesson?.id,progress};
};
export const tutorialDialogue=(save,personId)=>{
    const q=getTutorialQuest(save);if(!q||q.flags?.skipped)return;
    if(personId==='mara-vek'&&q.flags.blackBoxDelivered)return 'The black box is safe. Decoding it takes time. I will call when I have something you can use.';
    if(personId==='mara-vek'&&q.stepId==='earn-standing')return 'Rin is following a lead. Take contracts and invest in your ship. I will call when she is back.';
    if(personId==='rin-vek'&&q.stepId==='mining-contract')return 'Open the mission board and accept the marked mining contract.';
    if(personId==='rin-vek'&&q.stepId==='fit-pdc')return TUTORIAL_STEPS['fit-pdc'].detail;
    if(personId==='rin-vek'&&q.stepId==='launch-black-box')return 'I am ready. Launch when you have prepared your ship.';
    if(personId==='paul'&&q.flags.paulInvited&&['rin-cairn','launch-black-box'].includes(q.stepId))return 'I will meet you outside. My repair drones are ready.';
};

export const tutorialTradePrice=(save,locationId,commodityId)=>{const q=getTutorialQuest(save);if(commodityId!=='food'||!isTutorialActive(save)||q.flags.campaignVersion!==2)return;return locationId==='helix'&&['meet-family','buy-supplies','launch-helix'].includes(q.stepId)?80:locationId==='vesper'&&q.stepId==='sell-supplies'?175:undefined;};

// On-demand cards contain only the present task and an actionable hint.
const CARD_COPY = Object.freeze({
    "meet-family": ["Meet Mara and Rin in the bar.", "Select Story to see these hints."],
    "buy-supplies": ["Buy Protein on Helix.", "TRADE → Protein → BUY MAX."],
    "launch-helix": ["Launch from Helix.", "Select your ship in the hangar."],
    "plot-vesper": ["Select Vesper on the map.", "Open the centre radar."],
    "flight-checks": ["Follow Rin’s flight instructions.", ""],
    "fly-vesper": ["Fly to Vesper.", "Follow the instructions on the comms display."],
    "sell-supplies": ["Sell your Protein at Vesper.", "TRADE → Protein → SELL ALL."],
    "fit-upgrade": ["Install the gifted reactor.", "EQUIPMENT → STORAGE → Reactor Upgrade → Install."],
    "mining-contract": ["Talk to Rin in the bar.", ""],
    "mine-shardbelt": ["Mine 6 units of ore at the marked deposit.", "Scan the rock, then tap MINE."],
    "return-mining": ["Return to Vesper.", ""],
    "raider-standoff": ["Read the pirate’s message.", ""],
    "defeat-raider": ["Defeat Ash Moth.", ""],
    "land-mining": ["Land at Vesper.", "Approach slowly; landing is automatic."],
    "salvage-briefing": ["Talk to Rin in the bar.", ""],
    "fit-pdc": ["Switch your drone bay to PDC.", "EQUIPMENT → CARGO → PDC Drone."],
    "survey-graveyard": ["Chart the marked wrecks in Mourning Line.", "Fly within 100 km of each survey star."],
    "rescue-paul": ["Help Paul defeat the two Scrappers.", ""],
    "talk-paul": ["Open Paul’s comms message.", ""],
    "survey-carrier": ["Chart the remaining wrecks with Paul.", "Fly within 100 km of each survey star."],
    "carrier-wait": ["Stay with Paul near the carrier.", ""],
    "hide-patrol": ["Switch your transponder OFF.", "Open the left ship monitor."],
    "return-helix": ["Return to Helix.", ""],
    "mara-debrief": ["Talk to Mara in the bar.", ""],
    "earn-standing": ["Earn money and upgrade your ship.", ""],
    "meet-cairn": ["Meet Rin at Cairn.", ""],
    "rin-cairn": ["Talk to Rin in the bar.", ""],
    "launch-black-box": ["Launch from Cairn.", "Ask Paul in the bar if you want his company."],
    "salvage-black-box": ["Salvage the black box beside the frigate wreck.", "Hold SALVAGE within range."],
    "black-box-fight": ["Defeat the four pirate ships.", ""],
    "deliver-black-box": ["Return to Helix.", ""],
    "decode-black-box": ["Give Mara the black box.", "She is in the bar."],
    "complete": ["Explore on your own terms.", ""],
});
export const tutorialCardContent = save => {
    const campaign = tutorialCampaignSummary(save);
    if (!campaign || campaign.skipped) return;
    let [objective, instruction] = CARD_COPY[campaign.stepId] ?? [campaign.objective, ''];
    const quest = getTutorialQuest(save);
    if (campaign.stepId === 'mine-shardbelt') objective = `Mine ${tutorialMiningQuantity(save)} units of ore at the marked deposit.`;
    if (campaign.stepId === 'mining-contract' && quest.flags.miningExplained) objective = 'Accept the marked mining contract on the mission board.';
    if (campaign.stepId === 'hide-patrol' && save.player.transponder === false) {
        objective = 'Hide inside the marked carrier hangar.';
        instruction = 'Lower thrust and hold fire.';
    }
    return {objective, instruction, progress: campaign.progress, stepId: campaign.stepId};
};
