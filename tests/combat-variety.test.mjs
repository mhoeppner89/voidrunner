import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {test} from 'node:test';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three.module.min.js',import.meta.url).href:specifier,context);}});
const THREE=await import('../vendor/three.module.min.js');
const {GameSession}=await import('../src/game/game.js');
const {createNewSave}=await import('../src/game/save.js');
const {EntityStore}=await import('../src/game/entityStore.js');
const {combatProfile,interceptTime}=await import('../src/game/combatTactics.js');
const {createEnemyLoadout}=await import('../src/game/enemyLoadouts.js');
const {regenerateCombatResources}=await import('../src/game/combatResources.js');
const {WEAPONS}=await import('../src/game/weapons.js');
const {rollPilot}=await import('../src/game/pilots.js');
const {SHIPS}=await import('../src/game/data.js');
const {integrateFlightTurn,integrateFlightVelocity,registerHitReaction}=await import('../src/game/flightDynamics.js');
export function fixture(offset=0){
    const s=Object.create(GameSession.prototype);
    s.save=createNewSave(718,{tutorial:false});s.save.player.position=[offset,0,0];s.save.player.velocity=[0,0,0];
    s.ships=[];s.projectiles=[];s.entityCounter=0;s.projectileCounter=0;s.arena={};s.projStore=new EntityStore(1024);
    for(const k of ['A','B','C','D','E','F','G','H','I','J','K','L','ShipAvoid','P0','P1','P2','P3','P4','P5','P6','BlastStart','BlastEnd'])s['tmp'+k]=new THREE.Vector3();
    s.tmpQ=new THREE.Quaternion();s.tmpQ2=new THREE.Quaternion();s.tmpM4=new THREE.Matrix4();
    s.renderer={spawnMuzzleFlash(){},showCombatBeam(){},spawnImpact(){}};s.ui={pushEvent(){}};s.activeDockObstacle=()=>undefined;s.obstacles=[];
    s.activeFieldObstacles=()=>s.obstacles;
    s.forEachObstacleInBox=(...args)=>s.obstacles.forEach(args.at(-1));
    s.forEachObstacleAlongSegment=(a,b,fn)=>s.obstacles.forEach(fn);
    return s;
}
function spawn(s,role='pirate',tier='ace',pos=[0,0,180]){
    const ship=s.spawnShip(role,pos,undefined,undefined,{tier,temperament:'steady'});
    ship.rotation=[0,0,0,1];ship.velocity=[0,0,-ship.speed];ship.targetId='player';ship.fireCooldown=0;return ship;
}
function step(s,ship,dt=1/60){s.save.world.time+=dt;ship.fireCooldown-=dt;regenerateCombatResources(ship,ship.combatFit.resources,dt,100);s.updateAttackAI(ship,new THREE.Vector3().fromArray(s.save.player.position),new THREE.Vector3().fromArray(s.save.player.velocity),dt);}
test('shared flight preserves coasting, bounds thrust, and gives NPCs hull speed and finite afterburn fuel',()=>{
    const forward=new THREE.Vector3(0,0,-1),v=new THREE.Vector3(30,0,-20);
    integrateFlightVelocity(v,forward,0,50,21,false,false,0,1/60);
    assert.deepEqual(v.toArray(),[30,0,-20]);
    integrateFlightVelocity(v,forward,50,50,21,true,false,1,1/60);
    assert.ok(v.x>29 && v.x<30);assert.ok(Math.abs(v.z+20.35)<1e-9);
    const s=fixture(),ship=spawn(s),stats=s.npcFlightStats(ship);
    assert.equal(ship.speed,SHIPS.talon.maxSpeed);assert.equal(ship.afterburnSpeed,SHIPS.talon.afterburnSpeed);
    const p=new THREE.Vector3(),velocity=new THREE.Vector3(0,0,-stats.maxSpeed),q=new THREE.Quaternion(),goal=new THREE.Quaternion();
    const fuel=ship.fuel;
    for(let i=0;i<120;i++)s.integrateNpcFlight(ship,p,velocity,q,goal,stats.afterburnSpeed,true,true,1/60);
    assert.ok(velocity.length()>stats.maxSpeed);assert.ok(velocity.length()<=stats.afterburnSpeed+1e-8);
    assert.ok(Math.abs(ship.fuel-(fuel-2.05))<1e-8);
    ship.fuel=0;s.integrateNpcFlight(ship,p,velocity,q,goal,stats.afterburnSpeed,true,true,1/60);assert.equal(ship.burning,false);
    const baseQ=new THREE.Quaternion(),burnQ=new THREE.Quaternion(),baseW=new THREE.Vector3(),burnW=new THREE.Vector3();
    integrateFlightTurn(baseQ,baseW,1,0,0,stats.angularAcceleration,stats.angularDamping,true,false,1/60);
    integrateFlightTurn(burnQ,burnW,1,0,0,stats.angularAcceleration,stats.angularDamping,true,true,1/60);
    assert.ok(Math.abs(burnW.x-baseW.x*2)<1e-9);
});
test('sustained hits never postpone a pending reaction, and a later attack gets a fresh delay',()=>{
    const ship={pilot:{reflex:0.95}};
    registerHitReaction(ship,0);const first=ship.evasiveLatencyUntil;
    for(let i=1;i<=30;i++)registerHitReaction(ship,i/60);
    assert.equal(ship.evasiveLatencyUntil,first);assert.ok(first<0.5);assert.ok(ship.evasiveUntil>2.5);
    registerHitReaction(ship,10);assert.ok(ship.evasiveLatencyUntil>10);
});
test('aces drift and reverse through flight controls, then recover; veterans use ordinary passes',()=>{
    for(const tier of ['veteran','ace'])for(const move of ['drift-pass','boost-reversal']) {
        const s=fixture(),ship=spawn(s,'pirate',tier,[0,0,120]);ship.combatFit=createEnemyLoadout(ship,3);s.npcFlightStats(ship);ship.combatFit.missiles=0;s.fireNpcGun=()=>{};
        ship.velocity=move==='drift-pass'?[60,0,-45]:[0,0,76];
        if(move==='boost-reversal'){ship.rotation=[0,1,0,0];ship.attackPhase='extend';}
        const before=new THREE.Vector3(...ship.velocity);step(s,ship);
        if(tier==='veteran'){assert.equal(ship.aceMove,undefined);continue;}
        assert.equal(ship.aceMove?.kind,move);
        if(move==='drift-pass')assert.ok(new THREE.Vector3(...ship.velocity).distanceTo(before)<1e-7);
        else assert.equal(ship.burning,true);
        for(let i=0;i<330;i++)step(s,ship);
        assert.equal(ship.aceMove,undefined);assert.ok(ship.aceMoveReadyAt>s.save.world.time);
        assert.ok(ship.position.every(Number.isFinite));assert.ok(ship.rotation.every(Number.isFinite));
    }
});
test('an obstacle on the drift path cancels the ace commitment and starts its recovery interval',()=>{
    const s=fixture(),ship=spawn(s,'pirate','ace',[0,0,120]);ship.combatFit=createEnemyLoadout(ship,3);s.npcFlightStats(ship);ship.combatFit.missiles=0;s.fireNpcGun=()=>{};
    ship.velocity=[60,0,-45];step(s,ship);assert.equal(ship.aceMove?.kind,'drift-pass');
    s.obstacles=[{id:'rock',x:ship.position[0]+30,y:0,z:ship.position[2]-22.5,radius:15,collisionRadius:15,losRadius:15}];
    ship.aceClearanceAt=0;step(s,ship);
    assert.equal(ship.aceMove,undefined);assert.ok(ship.aceMoveReadyAt>s.save.world.time);
});
test('weapon rays are translation invariant, including spiral turns, and stop at real cover',()=>{
    for(const spiral of [false,true]){
        const counts=[];
        for(const offset of [0,42000]){
            const s=fixture(offset),ship=spawn(s,'pirate','ace',[offset,0,180]);
            if(spiral){ship.evasiveUntil=10;ship.spiralT=1;ship.spiralPhase=0;}
            step(s,ship);counts.push(s.projectiles.length);
            assert.ok(s.projectiles.length>0);
            const end=s.tmpNpcShotEnd;assert.ok(Math.abs(end.x-offset)<5 && Math.abs(end.z)<5);
        }
        assert.deepEqual(counts,[1,1]);
    }
    const s=fixture(42000),ship=spawn(s,'pirate','ace',[42000,0,180]);
    s.obstacles=[{id:'rock',x:42000,y:0,z:90,radius:45,collisionRadius:45,losRadius:45}];
    step(s,ship);assert.equal(s.projectiles.length,0);
});
test('intercept handles equal projectile speed and weapon-specific crossing velocities',()=>{
    assert.equal(interceptTime(0,0,100,0,0,-150,150),1/3);
    for(const speed of [185,195,250]){
        const time=interceptTime(100,30,200,20,-5,-30,speed);
        assert.ok(Math.abs(Math.hypot(100+20*time,30-5*time,200-30*time)-speed*time)<1e-8);
    }
});
test('one hull supports distinct equipment roles and each shot uses its equipped weapon',()=>{
    const ranges=[];
    for(let fitIndex=0;fitIndex<3;fitIndex++){
        const s=fixture(),ship=spawn(s);ship.combatFit=createEnemyLoadout(ship,fitIndex);ship.combatFit.missiles=0;
        let distance=0;
        for(let i=0;i<1800;i++){step(s,ship);distance+=Math.hypot(...ship.position);assert.ok(ship.position.every(Number.isFinite));}
        ranges.push(Math.round(distance/1800));assert.ok(s.projectiles.length>0,`fit ${fitIndex} must find a firing opportunity`);
        for(const shot of s.projectiles){const weapon=WEAPONS[shot.weaponId];assert.ok(ship.combatFit.weapons.includes(weapon.id));assert.equal(shot.life,weapon.life);}
    }
    assert.ok(ranges[1]<ranges[0]&&ranges[1]<ranges[2],`close-range fit must close further: ${ranges}`);
    console.log('Same hull, three equipment fits: mean ranges',ranges);
});
test('shield failure prompts a short moving retreat with a cooldown',()=>{
 const s=fixture(),ship=spawn(s);ship.shield=10;
 step(s,ship);assert.ok(ship.fieldNav.rechargeUntil>s.save.world.time);assert.equal(ship.covering,false);
 const first=ship.fieldNav.rechargeReadyAt;
 for(let i=0;i<240;i++)step(s,ship);
 assert.ok(ship.fieldNav.rechargeUntil<s.save.world.time);assert.equal(ship.fieldNav.rechargeReadyAt,first);
 assert.ok(Math.hypot(...ship.velocity)>ship.speed*.4);
});
test('legacy rookie profiles normalize and tutorial/capital weapons retain authored limits',()=>{
    const pilot=rollPilot(()=>0.5,0.5,'red-talons',{tier:'rookie',temperament:'steady'});
    assert.equal(pilot.tier,'novice');assert.equal(pilot.aim,0.42);
    for(const flag of ['tutorialEnemy','tutorialCompanion','capitalClass']){
        const s=fixture(),ship=spawn(s);ship[flag]=true;ship.gunDamage=3;
        assert.equal(combatProfile(ship),undefined);s.fireNpcGun(ship,new THREE.Vector3(0,0,-1));
        assert.equal(s.projectiles[0].damage,3);assert.equal(s.projectiles[0].life,1.55);
    }
});

function incomingProbe(tier, dodge=false) {
    const s=fixture();const ships=['pirate','escort','bounty'].map((role,i)=>spawn(s,role,tier,[Math.sin(i*2.1)*220,0,Math.cos(i*2.1)*220]));
    ships.forEach((ship,i)=>{ship.combatFit=createEnemyLoadout(ship,i);ship.combatFit.missiles=0;});
    let hits=0,damage=0;
    const start=new THREE.Vector3(),end=new THREE.Vector3(),vel=new THREE.Vector3(),to=new THREE.Vector3(),segment=new THREE.Vector3();
    for(let i=0;i<1800;i++){
        const time=i/60;s.save.world.time=time;
        s.save.player.position=dodge?[Math.sin(time*1.8)*28,Math.sin(time*2.5)*14,0]:[0,0,0];
        s.save.player.velocity=dodge?[Math.cos(time*1.8)*50.4,Math.cos(time*2.5)*35,0]:[0,0,0];
        for(const ship of ships){ship.fireCooldown-=1/60;regenerateCombatResources(ship,ship.combatFit.resources,1/60,100);s.updateAttackAI(ship,new THREE.Vector3().fromArray(s.save.player.position),new THREE.Vector3().fromArray(s.save.player.velocity),1/60);}
        for(const shot of s.projectiles){
            if(shot.life<=0)continue;
            s.projStore.getPos(shot.slot,start);s.projStore.getVel(shot.slot,vel);end.copy(start).addScaledVector(vel,1/60);
            segment.subVectors(end,start);to.fromArray(s.save.player.position).sub(start);
            const along=Math.max(0,Math.min(1,to.dot(segment)/segment.lengthSq()));
            if(to.addScaledVector(segment,-along).length()<s.playerCollisionRadius()+0.25){hits++;damage+=shot.damage;shot.life=0;}
            else shot.life-=1/60;
            s.projStore.setPos(shot.slot,end.x,end.y,end.z);
        }
    }
    return {hits,damage};
}
test('three aces punish stationary flight, while evasive flying reduces incoming damage',()=>{
    const novice=incomingProbe('novice'),ace=incomingProbe('ace'),dodging=incomingProbe('ace',true);
    console.log('30-second incoming projectile probe',{novice,ace,dodging});
    assert.ok(ace.damage>novice.damage*1.25);
    assert.ok(ace.damage>250);
    assert.ok(dodging.damage<ace.damage*0.8);
});

test('both three-enemy simulator scenarios stage varied equipment and ace pilots',()=>{
    for(const scenario of ['1v3','2v3']){
        const s=fixture();s.configureArenaImpulseFit=()=>{};s.resetArenaWeaponState=()=>{};
        s.resetPlayerInterpolation=()=>{};s.audio={setStationMode(){}};
        s.setupArena({environment:'open',scenario,difficulty:'ace'},false);
        assert.ok(new Set(s.ships.filter(x=>x.hostile).map(x=>x.combatFit.weapons.join(','))).size>=2);
        assert.ok(s.ships.filter(x=>x.hostile).every(x=>x.pilot.tier==='ace'));
    }
});
