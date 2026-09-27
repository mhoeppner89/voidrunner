// The campaign half of the wing system. Rin Vek flies the Second Light on the
// player's wing through the family prologue, and from the combat lesson on she
// takes standing orders exactly like a hired arena veteran. The vocabulary, the
// range gates and the target doctrine are shared (see wingOrders.js); this
// module is only the story side of it: who is on the wing, how a story
// companion flies an order, and where the order is remembered.
import {normalizeWingOrder,nextWingOrder,WING_ORDERS,WING_ORDER_LABEL,WING_ORDER_GATE,wingOrderTarget,wingOrderPilotDistance,nearestWingThreat} from './wingOrders.js';
import {getTutorialQuest,isTutorialActive} from './tutorialCampaign.js';
import {setFlag} from './quests.js';
import {t} from './i18n.js';

// The teaching beat. Wing command arrives with the prologue's fight, where the
// difference between covering fire and a stray burst into the pilot's own line
// of fire is the whole point of the lesson — and where the wing's engagement
// range starts to matter. check-weapons is the older combat-prep step that some
// saves are still parked on; its only exit is that same fight, so it counts as
// taught for unlocking while the line itself is delivered in the fight.
export const CAMPAIGN_WING_UNLOCK_STEP='defeat-raider';
const WING_ORDER_STEPS=new Set(['check-weapons','defeat-raider','collect-cargo','salvage-black-box','dock-cairn','family-choice','galaxy-map','cross-meridian-gate','complete']);
// How far off the fight a breaking-off companion stations, measured from the
// pilot along the line away from the nearest hostile.
export const CAMPAIGN_BREAK_CLEARANCE=260;
// The bubble that counts as "this fight", measured from the pilot. It is the
// reach at which the aggressive order lets a target go, so a companion who has
// powered down comes back online exactly when the wing would have stopped
// chasing — not the moment the last hostile anywhere in the system dies.
export const CAMPAIGN_FIGHT_CLEARANCE=WING_ORDER_GATE.aggressive.release;
// The prologue's opponents: ordinary hostiles, plus the scripted raider, which
// is spawned as story traffic rather than rolled from the faction tables.
const campaignOpponent=entry=>entry.hostile===true||entry.tutorialEnemy===true;

// Learned once, and remembered for the rest of the career: a save that reached
// the combat step, skipped the prologue, or finished it has the mechanic.
export const campaignWingUnlocked=save=>{
    if(!save)return false;
    const quest=getTutorialQuest(save);
    if(quest?.flags?.wingOrders===true)return true;
    if(quest?.completedAt!==undefined)return true;
    // A career saved mid-prologue when this shipped carries no flag: the step it
    // is standing on says whether the lesson has been had.
    if(quest&&WING_ORDER_STEPS.has(quest.stepId))return true;
    // No recorded prologue at all (a debug scene, an empty stand-in): stay
    // locked rather than guessing that the lesson has been had.
    return Array.isArray(save.quests)&&!isTutorialActive(save);
};
export const campaignWingOrder=save=>normalizeWingOrder(save?.wingOrder);

export const CampaignWingMethods={
    // The wing the story currently has flying with the pilot, if any.
    campaignWingCompanion(){return this.ships?.find(ship=>ship.tutorialCompanion&&ship.hull>0);},
    campaignWingUnlocked(){return campaignWingUnlocked(this.save);},
    // True when the player's orders actually steer a wing in this scene. An arena
    // run has its own wing and its own order, so it never comes up here.
    campaignWingActive(){const companion=this.campaignWingCompanion();return !this.arena?.run&&Boolean(companion)&&!companion.poweredDown&&campaignWingUnlocked(this.save);},
    // The teaching line: once, on reaching the combat step, tell the player that
    // the wing takes orders and which ones exist. Deliberately a comms line and
    // an event notice rather than a modal, so it cannot collide with the step's
    // own weapons briefing.
    introduceCampaignWingOrders(){
        const quest=getTutorialQuest(this.save);
        if(!quest||quest.completedAt!==undefined||quest.flags?.wingOrders===true)return false;
        setFlag(this.save,quest.id,'wingOrders',true);
        this.ui.showPilotLine?.('Rin Vek',t('I am on your wing now. Aggressive, defensive or break off — press Y or tap my wing card at the top right to change my orders.'),'ally',11000,true);
        this.ui.pushEvent(t('WING ORDERS · Y or the wing cards at the top right cycle aggressive, defensive and break off'),'info',9000);
        // The wing card arrives with the lesson rather than on the next frame.
        this.publishCampaignWing();
        return true;
    },
    // A standing order, not a one-shot command: it is remembered on the save, so
    // a reload keeps the wing's discipline, and re-applied every frame.
    setCampaignWingOrder(order){
        if(!this.campaignWingActive())return false;
        const current=normalizeWingOrder(this.save.wingOrder);
        const next=WING_ORDERS.includes(order)?order:nextWingOrder(current);
        // A new order is a fresh commit decision: the old lock's hysteresis must
        // not carry across, or a defensive order could inherit a fight the
        // aggressive order started.
        if(next!==current)for(const ship of this.ships??[])if(ship.tutorialCompanion){ship.wingTargetId=undefined;ship.wingOrder=undefined;}
        this.save.wingOrder=next;
        this.ui.pushEvent(t('Rin Vek to {order}',{order:t(WING_ORDER_LABEL[next])}),'info',3200);
        this.publishCampaignWing();
        return true;
    },
    cycleCampaignWingOrder(){return this.setCampaignWingOrder(undefined);},
    // One control for both scenes: Y, the stick click and the cockpit chip all
    // land here and route to whichever wing is flying.
    wingOrderCommand(order,wing){return this.arena?.run?this.setWingOrder(order,wing):this.setCampaignWingOrder(order);},
    // The companion's per-frame decision, consumed by updateTutorialCompanion.
    applyCampaignWingOrder(ship){
        const order=normalizeWingOrder(this.save.wingOrder);
        const target=WING_ORDER_GATE[order]?wingOrderTarget(this,ship,order,ship.wingTargetId,{isOpponent:campaignOpponent}):undefined;
        ship.wingOrder=order;
        ship.wingTargetId=target?.id;
        ship.targetId=target?.id;
        ship.holdFire=!target;ship.pursuitHoldFire=!target;
        return {order,target};
    },
    // Where a breaking-off companion flies. The prologue still needs her on
    // screen and in the story, so she leaves the fight rather than the scene: she
    // stations on the far side of the pilot from the nearest hostile.
    campaignBreakGoal(ship,out){
        const threat=nearestWingThreat(this,ship),player=this.save.player;
        if(!threat)return out.set(player.position[0],player.position[1],player.position[2]);
        const dx=player.position[0]-threat.position[0],dy=player.position[1]-threat.position[1],dz=player.position[2]-threat.position[2];
        const length=Math.hypot(dx,dy,dz)||1;
        return out.set(
            player.position[0]+dx/length*CAMPAIGN_BREAK_CLEARANCE,
            player.position[1]+dy/length*CAMPAIGN_BREAK_CLEARANCE+8,
            player.position[2]+dz/length*CAMPAIGN_BREAK_CLEARANCE);
    },
    // ── The story companion cannot die ────────────────────────────────────
    // Rin carries the prologue, so her hull floors at one point (damageShip).
    // Reaching that point is treated as being disabled rather than as a scratch:
    // she powers down — dark, unarmed, and no longer a legal target, so no
    // opponent can keep shooting a wreck — and she stays out of the fight until
    // the last opponent in the pilot's bubble is beaten. She then comes back
    // online with her reactor restarted (shields full) on that same one point of
    // hull, so for the rest of the mission her shield is the only thing a fight
    // can spend and the first hull hit puts her back down.
    campaignOpponentsInFight(range=CAMPAIGN_FIGHT_CLEARANCE){
        const pilot=this.save?.player?.position;
        if(!pilot)return [];
        return (this.ships??[]).filter(ship=>ship.hull>0&&campaignOpponent(ship)&&wingOrderPilotDistance(ship,pilot)<=range);
    },
    powerDownEssentialCompanion(ship){
        if(!ship||ship.poweredDown)return false;
        ship.poweredDown=true;
        ship.holdFire=true;ship.pursuitHoldFire=true;
        ship.targetId=undefined;ship.wingTargetId=undefined;
        ship.combatThreatId=undefined;ship.combatThreatUntil=0;
        ship.destination=[...ship.position];
        this.ui.showPilotLine?.('Rin Vek',t('Hull breach — I am dark and drifting. Finish them and I will bring the Second Light back up.'),'ally',9000);
        this.ui.pushEvent(t('{name} is disabled. She is out of the fight until the last opponent is beaten.',{name:ship.name}),'danger',7000);
        return true;
    },
    powerUpEssentialCompanion(ship){
        if(!ship||!ship.poweredDown)return false;
        ship.poweredDown=false;
        ship.holdFire=false;ship.pursuitHoldFire=false;
        ship.hull=Math.max(1,ship.hull);
        ship.shield=ship.maxShield;
        ship.shieldDelay=0;
        ship.destination=[...ship.position];
        this.ui.showPilotLine?.('Rin Vek',t('Reactors are back. That one hull weld is all I have left — my shielding has to cover us both.'),'ally',8000);
        return true;
    },
    // The HUD wing rail is published every frame from the companion's live
    // state: her current order, her shield and hull fill, dimmed while she is
    // powered down (a disabled companion takes no orders, so her card dims and
    // drains rather than disappearing with her). No companion — before the
    // lesson or after the story — means no card at all.
    publishCampaignWing(){
        const companion=this.campaignWingCompanion();
        if(!companion||!campaignWingUnlocked(this.save)||this.arena?.run)return this.ui.setWingTactics?.([],0);
        this.ui.setWingTactics?.([{
            index:0,
            order:normalizeWingOrder(this.save.wingOrder),
            name:companion.name,
            hullId:companion.hullId,
            hull:Math.max(0,companion.hull),
            maxHull:companion.maxHull??1,
            shield:Math.max(0,companion.poweredDown?0:companion.shield),
            maxShield:companion.maxShield??1,
            poweredDown:Boolean(companion.poweredDown),
        }],1);
    },
};
