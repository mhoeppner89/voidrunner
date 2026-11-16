import {GameUI} from '/src/game/ui.js';
import {SHIPS} from '/src/game/data.js';

// Reuse the shipping cockpit DOM, typography, control sizes and canvas
// renderers. Only its art plate is replaced by the proposed code-built frame.
export function mountInstruments(host,frame){
    const template=document.createElement('template');
    template.innerHTML=GameUI.prototype.shellMarkup.call({});
    const root=document.createElement('div');root.id='game-shell';root.className='steering-stick';
    const hud=template.content.querySelector('#hud');hud.classList.remove('is-hidden');root.append(hud);host.append(root);
    const ui=Object.create(GameUI.prototype);
    Object.assign(ui,{root,elementCache:new Map(),preloadImageSet:()=>Promise.resolve(),radarContext:root.querySelector('#radar').getContext('2d'),ownHullCanvas:root.querySelector('#own-hull-outline'),targetHullCanvas:root.querySelector('#target-hull-outline'),targetLayout:root.querySelector('.screen-target-layout'),targetScreen:root.querySelector('.cockpit-screen-target'),save:{player:{shipId:'wayfarer'}}});
    ui.setCockpitShip('wayfarer');root.dataset.damageStage='0';
    for(const bezel of root.querySelectorAll('.cockpit-bezel'))bezel.style.setProperty('--bezel-art','url("/assets/remaster/cockpit-wayfarer-sprite.png")');
    const stick=root.querySelector('[data-touch-stick]');stick.dataset.origin='touch';stick.setAttribute('role','slider');stick.tabIndex=0;stick.setAttribute('aria-valuemin','-100');stick.setAttribute('aria-valuemax','100');stick.setAttribute('aria-valuenow','0');
    const throttle=root.querySelector('[data-touch-throttle]');throttle.tabIndex=0;throttle.setAttribute('role','slider');throttle.setAttribute('aria-label','Throttle');
    const rail=document.createElement('div');rail.className='review-throttle-rail';rail.setAttribute('aria-hidden','true');
    rail.append(...throttle.childNodes);throttle.append(rail);
    const cargo=document.createElement('div');cargo.className='review-cargo-page';cargo.hidden=true;cargo.innerHTML='<b>CARGO · 12 / 30</b><p>Scrap <span>8</span></p><p>Ore <span>4</span></p><small>40% CAPACITY</small>';root.querySelector('.cockpit-screen-own').append(cargo);
    const contacts=[{type:'location',x:.1,y:-.85,altitude:.2,color:'yellow',selected:true},{type:'friendly',x:-.5,y:.35,altitude:-.25,color:'blue'},{type:'hostile',x:.35,y:-.25,altitude:.1,color:'red'}];
    let geometry;
    function layout(){
        const W=host.offsetWidth,H=host.offsetHeight,origin=host.getBoundingClientRect(),scale=origin.width/W||1;
        const rect=selector=>{const r=root.querySelector(selector).getBoundingClientRect();return {x:(r.x-origin.x)/scale,y:(r.y-origin.y)/scale,width:r.width/scale,height:r.height/scale,bottom:(r.bottom-origin.y)/scale,right:(r.right-origin.x)/scale};};
        const monitors={};
        // One whole sprite defines the apertures. No independent frame slices
        // or re-created rails: instrument contents fit the actual painted holes.
        for(const [name,r]of Object.entries(frame.monitors)){
            const q={x:r.x/frame.width*W,y:r.y/frame.height*H,width:r.width/frame.width*W,height:r.height/frame.height*H};
            Object.assign(root.querySelector(`.cockpit-screen-${name}`).style,{left:`${q.x}px`,top:`${q.y}px`,width:`${q.width}px`,height:`${q.height}px`,minHeight:'0',minWidth:'0'});
            monitors[name]=q;
        }
        const jump=root.querySelector('#hyperdrive-card'),jumpBox=rect('#hyperdrive-card');
        const hyperWidth=Math.max(104,Math.min(monitors.radar.width*.96,200));
        const hyper={x:monitors.radar.x+(monitors.radar.width-hyperWidth)/2,y:H*frame.housingTop/frame.height-jumpBox.height,width:hyperWidth,height:jumpBox.height};
        Object.assign(jump.style,{left:`${hyper.x}px`,top:`${hyper.y}px`,bottom:'auto',width:`${hyper.width}px`,transform:'none',translate:'none'});
        // Retain the original touch steering area and mobile button bank. The
        // hand itself is much smaller than this hit zone.
        const stick=root.querySelector('[data-touch-stick]');stick.style.removeProperty('width');stick.style.removeProperty('height');stick.style.removeProperty('translate');
        const baseline=rect('[data-touch-stick]'),throttle=rect('[data-touch-throttle]'),corners=rect('.hud-corner-buttons');
        const edge=monitors.own.x-W*0.012;
        const stickSize=Math.max(baseline.width,Math.min(230,edge-24,baseline.width+Math.max(0,throttle.y-corners.bottom-8)));
        Object.assign(stick.style,{width:`${stickSize}px`,height:`${stickSize}px`,translate:`${(edge-stickSize)/2-baseline.x}px 0`});
        // Mobile controls are hidden, rather than removed from layout, on a
        // desktop so input-method changes cannot move the fixed hand pivot.
        const touch=host.dataset.touchPlay==='true';
        for(const el of root.querySelectorAll('.touch-right,[data-touch-throttle]'))el.inert=!touch;
        root.style.setProperty('--review-top',`${corners.y}px`);root.style.setProperty('--review-top-height',`${corners.height}px`);
        const wing=rect('#hud-wing-tactics'),rightLimit=wing.width?wing.x-12:W-84;
        root.style.setProperty('--review-comms-max',`${Math.max(120,2*Math.min(W/2-corners.right-12,rightLimit-W/2))}px`);
        geometry={width:W,height:H,monitors,hyper,stickSize,throttle,frame:{width:frame.width,height:frame.height},touch};
        return geometry;
    }
    function update(state){
        const text=(id,value)=>{const e=root.querySelector(id);if(e.textContent!==String(value))e.textContent=value;};
        text('#screen-own-speed',Math.round(state.speed));text('#screen-own-max-speed','/260');text('#screen-own-fuel','100');
        text('#screen-own-weapon-name',state.weapon?'PULSE ×2':'ALL WEAPONS · BEAM');text('#screen-own-weapon-ammo','ϟ');text('#screen-own-launcher',`SKR ${state.missiles}/4`);
        root.querySelector('#screen-own-weapon').classList.add('is-visible');
        root.querySelector('#screen-own-shield').style.width='100%';root.querySelector('#screen-own-hull').style.width='100%';root.querySelector('#screen-own-energy').style.width=`${state.energy}%`;
        const target=state.scene==='combat'?{kind:'ship',name:state.target?'Valkyrie':'Cutlass',variant:state.target?'talon':'scrapper',shield:68,maxShield:100,hull:90,maxHull:100,hostile:!state.target,heading:state.elapsed*.04}:state.scene==='salvage'?{kind:'wreck',name:'Carrier · Coolant',objectKind:'wreck'}:{kind:'station',name:state.target?'Shattered Crown':'Helix',objectKind:state.target?'asteroid':'station'};
        ui.setTargetScreenValue(target);
        text('#screen-target-distance',state.scene==='combat'?'218 km':state.scene==='salvage'?'298 km':state.target?'16,000 km':'8,420 km');
        text('#screen-target-readout',state.paused?'PREVIEW PAUSED':state.jumping?'HYPERDRIVE WARM-UP':state.scene==='combat'?'ATTACKING · Veteran':state.scene==='salvage'?'FIRE TO RELEASE CARGO':'ACTIVATE HYPERDRIVE');
        const contents=root.querySelector('#screen-target-contents');contents.classList.toggle('is-hidden',state.scene!=='salvage');contents.querySelector('b').textContent='Coolant';contents.querySelector('span').textContent='4 units remaining';
        const bars=root.querySelector('.screen-ship-layout');bars.style.visibility=state.ownPage?'hidden':'';cargo.hidden=!state.ownPage;
        ui.drawRadar(state.scene==='combat'?contacts:contacts.slice(0,2),[.2,.5,1]);
        ui.drawHullOutline(ui.ownHullCanvas,SHIPS.wayfarer.variant,0,'rgba(111,216,236,.9)',false,state.missiles,4);
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
    return {root,ui,update,layout,get geometry(){return geometry;},invalidate(){ui.radarLayoutDirty=true;ui.hullCanvasSizes?.invalidate?.();}};
}
