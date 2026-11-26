import {GameUI} from '/src/game/ui.js';
import {PaintedCockpit} from '/src/game/cockpitArtwork.js';
import {SHIPS} from '/src/game/data.js';

// Reuse the shipping cockpit DOM, typography, control sizes and canvas
// renderers. Only its art plate is replaced by the proposed code-built frame.
export function mountInstruments(host,definition,shell,toggleTransponder){
    const template=document.createElement('template');
    template.innerHTML=GameUI.prototype.shellMarkup.call({});
    const root=document.createElement('div');root.id='game-shell';root.className='steering-stick';
    const hud=template.content.querySelector('#hud');hud.classList.remove('is-hidden');root.append(hud);host.append(root);
    const ui=Object.create(GameUI.prototype);
    Object.assign(ui,{root,elementCache:new Map(),preloadImageSet:()=>Promise.resolve(),radarContext:root.querySelector('#radar').getContext('2d'),ownHullCanvas:root.querySelector('#own-hull-outline'),targetHullCanvas:root.querySelector('#target-hull-outline'),targetLayout:root.querySelector('.screen-target-layout'),targetScreen:root.querySelector('.cockpit-screen-target'),save:{player:{shipId:definition.id}}});
    const artwork=new PaintedCockpit(root,{touch:()=>host.dataset.touchPlay==='true',toggleTransponder});
    root.dataset.damageStage='0';
    // Use the same hull selection path, with an explicit authoring-only opt-in.
    ui.cockpitArtwork=artwork;ui.setCockpitShip(definition.id,{review:true,shell});
    const stick=root.querySelector('[data-touch-stick]');stick.dataset.origin='touch';stick.setAttribute('role','slider');stick.tabIndex=0;stick.setAttribute('aria-valuemin','-100');stick.setAttribute('aria-valuemax','100');stick.setAttribute('aria-valuenow','0');
    const throttle=root.querySelector('[data-touch-throttle]');throttle.tabIndex=0;throttle.setAttribute('role','slider');throttle.setAttribute('aria-label','Throttle');
    const cargo=document.createElement('div');cargo.className='review-cargo-page';cargo.hidden=true;cargo.innerHTML='<b>CARGO · 12 / 30</b><p>Scrap <span>8</span></p><p>Ore <span>4</span></p><small>40% CAPACITY</small>';root.querySelector('.cockpit-screen-own').append(cargo);
    const contacts=[{type:'location',x:.1,y:-.85,altitude:.2,color:'yellow',selected:true},{type:'friendly',x:-.5,y:.35,altitude:-.25,color:'blue'},{type:'hostile',x:.35,y:-.25,altitude:.1,color:'red'}];
    function layout(){artwork.invalidate();artwork.relayout();return artwork.layout;}
    function update(state){
        artwork.setHardware('off',state.transponder,true,!state.paused);
        const text=(id,value)=>{const e=root.querySelector(id);if(e.textContent!==String(value))e.textContent=value;};
        text('#screen-own-speed',Math.round(state.speed));text('#screen-own-max-speed','/260');text('#screen-own-drive','100');
        text('#screen-own-weapon-name',state.weapon?'PULSE ×2':'ALL WEAPONS · BEAM');text('#screen-own-weapon-ammo','ϟ');text('#screen-own-launcher',`SKR ${state.missiles}/4`);
        root.querySelector('#screen-own-weapon').classList.add('is-visible');
        root.querySelector('#screen-own-shield').style.width='100%';root.querySelector('#screen-own-hull').style.width='100%';root.querySelector('#screen-own-energy').style.width=`${state.energy}%`;
        const target=state.scene==='combat'?{kind:'ship',name:state.target?'Valkyrie':'Cutlass',variant:state.target?'talon':'scrapper',shield:68,maxShield:100,hull:90,maxHull:100,hostile:!state.target,heading:state.elapsed*.04}:state.scene==='salvage'?{kind:'wreck',name:'Carrier · Coolant',objectKind:'wreck'}:{kind:'station',name:state.target?'Shattered Crown':'Helix',objectKind:state.target?'asteroid':'station'};
        ui.setTargetScreenValue(target);
        text('#screen-target-distance',state.scene==='combat'?'218 km':state.scene==='salvage'?'298 km':state.target?'16,000 km':'8,420 km');
        const readout=root.querySelector('#screen-target-readout');
        readout.classList.toggle('is-hyperdrive-status',state.jumping||state.scene==='navigation');
        text('#screen-target-readout',state.paused?'PREVIEW PAUSED':state.jumping?'HYPERDRIVE WARM-UP':state.scene==='combat'?'ATTACKING · Veteran':state.scene==='salvage'?'FIRE TO RELEASE CARGO':'ACTIVATE HYPERDRIVE');
        const contents=root.querySelector('#screen-target-contents');contents.classList.toggle('is-hidden',state.scene!=='salvage');contents.querySelector('b').textContent='Coolant';contents.querySelector('span').textContent='4 units remaining';
        const bars=root.querySelector('.screen-ship-layout');bars.style.visibility=state.ownPage?'hidden':'';cargo.hidden=!state.ownPage;
        ui.drawRadar(state.scene==='combat'?contacts:contacts.slice(0,2),[.2,.5,1]);
        ui.drawHullOutline(ui.ownHullCanvas,SHIPS[definition.id].variant,0,'rgba(111,216,236,.9)',false,state.missiles,4);
        ui.setWingTactics([{index:0,name:'Rin',order:['defensive','aggressive','breakoff'][state.wing],shield:100,maxShield:100,hull:100,maxHull:100}],1);
        root.querySelector('[data-touch-throttle-thumb]').style.bottom=`${state.throttle*100}%`;root.querySelector('.touch-throttle-fill').style.height=`${state.throttle*100}%`;
        root.querySelector('#touch-missile-count').textContent=state.missiles;
        root.querySelector('#touch-drone-label').classList.remove('is-hidden');root.querySelector('#touch-drone-label').textContent='FIRE';
        root.querySelector('#touch-fire').classList.toggle('is-active',state.firing);
        for(const b of root.querySelectorAll('.touch-boost'))b.classList.toggle('is-active',Boolean(state.boost));
        root.querySelector('#hyperdrive-card').dataset.hyperdriveReady=String(!state.jumping);
        const secondary=root.querySelector('#touch-missile');secondary.dataset.touchAction=state.scene==='salvage'?'scan':'missile';
        for(const icon of secondary.querySelectorAll('svg'))icon.classList.toggle('is-hidden',icon.dataset.icon!==(state.scene==='salvage'?'scan':'missile'));
        root.querySelector('#touch-launcher-cycle').disabled=false;
    }
    return {root,ui,artwork,update,layout,get geometry(){return artwork.layout;},invalidate(){ui.radarLayoutDirty=true;ui.hullCanvasSizes?.invalidate?.();}};
}
