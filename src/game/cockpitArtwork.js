// Shared, static cockpit frame and anchored three-pose pilot rig.
import {getCockpitDefinition,cockpitLayout,cockpitApertureClip} from './cockpitDefinitions.js';
export {STARTER_COCKPIT,hasPaintedCockpit,paintedCockpitAssets} from './cockpitDefinitions.js';
const NS='http://www.w3.org/2000/svg';
let clipSequence=0;
const svg=(tag,attrs={})=>{const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
const SCREENS={own:'.cockpit-screen-own',radar:'.cockpit-screen-radar',target:'.cockpit-screen-target'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class PaintedCockpit {
    active=false;dirty=true;placed=new Map();pose={x:0,y:0};engaged={};frameIndex=-1;angle=NaN;
    constructor(root,{touch}={}){this.root=root;this.touchOverride=touch;this.alphaResources=new Map();}
    remember(el,properties){
        if(!el)return;
        let previous=this.placed.get(el);if(!previous){previous=new Map();this.placed.set(el,previous);}
        for(const key of properties)if(!previous.has(key))previous.set(key,[el.style.getPropertyValue(key),el.style.getPropertyPriority(key)]);
    }
    style(el,values){this.remember(el,Object.keys(values));for(const [key,value]of Object.entries(values))el.style.setProperty(key,value);}
    ensureDom(){
        if(this.frame?.isConnected)return;
        const instruments=this.root.querySelector('.cockpit-instruments');
        this.frame=new Image();this.frame.className='painted-cockpit-frame';this.frame.alt='';this.frame.setAttribute('aria-hidden','true');
        instruments.prepend(this.frame);
        this.clipId=`painted-apertures-${++clipSequence}`;
        const definitions=svg('svg',{'aria-hidden':'true',width:0,height:0});
        definitions.style.position='absolute';definitions.style.pointerEvents='none';
        const clip=svg('clipPath',{id:this.clipId,clipPathUnits:'objectBoundingBox'});
        this.aperturePath=svg('path',{'clip-rule':'evenodd','fill-rule':'evenodd'});
        clip.append(this.aperturePath);definitions.append(clip);instruments.prepend(definitions);
        this.handLayer=document.createElement('div');this.handLayer.className='painted-hand-layer';instruments.append(this.handLayer);
        this.mount=svg('svg',{class:'painted-stick-mount','aria-hidden':'true',preserveAspectRatio:'none'});this.handLayer.append(this.mount);
        this.mountImage=svg('image',{href:this.definition.stickBase.path,preserveAspectRatio:'none'});this.mount.append(this.mountImage);
        this.hand=svg('svg',{class:'painted-pilot-hand',viewBox:'0 0 320 240','aria-hidden':'true'});this.handLayer.append(this.hand);
        this.rig=svg('g',{class:'painted-hand-rig'});this.hand.append(this.rig);
        this.poseLayer=svg('g',{class:'painted-hand-pose'});this.rig.append(this.poseLayer);
        this.crop=svg('svg',{overflow:'hidden',preserveAspectRatio:'none',width:724,height:724});this.poseLayer.append(this.crop);
        this.handImage=svg('image',{preserveAspectRatio:'none'});this.crop.append(this.handImage);
        const throttle=this.root.querySelector('[data-touch-throttle]');
        this.rail=document.createElement('div');this.rail.className='painted-throttle-rail';this.rail.setAttribute('aria-hidden','true');this.rail.append(...throttle.childNodes);throttle.append(this.rail);
    }
    loadAssets(shell){
        this.frame.src=shell;
        this.mountImage.setAttribute('href',this.definition.stickBase.path);
        for(const [key,value]of Object.entries({href:this.definition.hand,width:this.definition.strip.width,height:this.definition.strip.height}))this.handImage.setAttribute(key,value);
        const generation=++this.assetGeneration;
        const definition=this.definition;
        this.ready=Promise.all([
            this.frame.decode(),this.alphaResource(shell,371,170),
            this.alphaResource(definition.hand,543,181),
            this.alphaResource(definition.stickBase.path,543,181),
        ]).then(([,frameAlpha,handAlpha,baseAlpha])=>{
            if(generation!==this.assetGeneration)return;
            this.alpha=frameAlpha;this.handAlpha=handAlpha;this.baseAlpha=baseAlpha;this.dirty=true;
        }).catch(error=>{if(generation!==this.assetGeneration)return;this.loadError=String(error);console.error('Cockpit artwork could not load',error);});
    }
    alphaResource(path,width,height){
        const key=`${path}:${width}:${height}`;
        if(this.alphaResources.has(key))return this.alphaResources.get(key);
        const source=new Image();source.src=path;
        // Shared hand/base maps survive hull switches. All decoding/readback
        // happens once per resource, never while animating a pose.
        const pending=source.decode().then(()=>{
            const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
            const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,width,height);
            const pixels=ctx.getImageData(0,0,width,height).data,alpha=new Uint8Array(width*height);
            for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];return alpha;
        }).catch(error=>{this.alphaResources.delete(key);throw error;});
        this.alphaResources.set(key,pending);return pending;
    }
    activate(shipId,{review=false,shell}={}){
        if(this.active&&this.shipId===shipId)return;
        const definition=getCockpitDefinition(shipId,{review});
        if(!definition||!(shell??definition.shell))throw new Error(`Cockpit is not approved for flight: ${shipId}`);
        if(this.active)this.deactivate();
        this.definition=definition;this.shipId=shipId;this.active=true;this.root.dataset.cockpitPaint=shipId;
        this.ensureDom();this.assetGeneration??=0;this.loadError=undefined;this.alpha=this.handAlpha=this.baseAlpha=undefined;
        this.aperturePath.setAttribute('d',cockpitApertureClip(definition));
        this.frame.style.clipPath=definition.apertureClip?`url(#${this.clipId})`:'none';
        this.loadAssets(shell??definition.shell);
        this.style(this.root,{'--cockpit-shift-x':'0px','--cockpit-shift-y':'0px','--cockpit-roll':'0deg','--cockpit-zoom':'1'});
        this.root.querySelector('.canopy-aperture')?.setAttribute('points','0,0 1000,0 1000,1000 0,1000');
        this.root.querySelector('.canopy-art-mask')?.setAttribute('href',shell??definition.shell);
        const stick=this.root.querySelector('[data-touch-stick]');this.oldOrigin=stick.dataset.origin;stick.dataset.origin='touch';
        this.frameIndex=-1;this.angle=NaN;this.pose.x=this.pose.y=0;this.invalidate();
    }
    deactivate(){
        if(!this.active)return;this.active=false;delete this.root.dataset.cockpitPaint;delete this.root.dataset.cockpitTouch;
        for(const [el,values]of this.placed)for(const [key,[value,priority]]of values){if(value)el.style.setProperty(key,value,priority);else el.style.removeProperty(key);}this.placed.clear();
        const stick=this.root.querySelector('[data-touch-stick]');if(this.oldOrigin===undefined)delete stick.dataset.origin;else stick.dataset.origin=this.oldOrigin;
        for(const el of this.root.querySelectorAll('.touch-right,[data-touch-throttle]'))el.inert=false;
        for(const key of Object.keys(this.engaged))this.root.querySelector(key)?.classList.remove('is-engaged');this.engaged={};
        this.layout=undefined;this.dirty=true;
    }
    invalidate(){this.dirty=true;}
    relayout(){
        if(!this.active)return false;
        const hud=this.root.querySelector('#hud'),origin=hud.getBoundingClientRect();if(origin.width<2||origin.height<2)return false;
        const W=hud.clientWidth,H=hud.clientHeight,sx=origin.width/W,sy=origin.height/H;
        const rect=selector=>{const r=this.root.querySelector(selector).getBoundingClientRect();return {x:(r.x-origin.x)/sx,y:(r.y-origin.y)/sy,width:r.width/sx,height:r.height/sy,bottom:(r.bottom-origin.y)/sy,right:(r.right-origin.x)/sx};};
        const stick=this.root.querySelector('[data-touch-stick]');this.remember(stick,['width','height','translate']);
        for(const k of ['width','height','translate'])stick.style.removeProperty(k);
        const baseline=rect('[data-touch-stick]'),throttle=rect('[data-touch-throttle]'),corners=rect('.hud-corner-buttons');
        const {monitors,hyper,stickSize,stickTranslate,bleed}=cockpitLayout(this.definition,W,H,{jumpHeight:rect('#hyperdrive-card').height,baseline,throttle,corners});
        for(const [id,q]of Object.entries(monitors)){
            this.style(this.root.querySelector(SCREENS[id]),{left:`${q.x-bleed}px`,top:`${q.y-bleed}px`,width:`${q.width+bleed*2}px`,height:`${q.height+bleed*2}px`,padding:`${bleed}px`,'min-height':'0','min-width':'0'});
        }
        this.style(this.root.querySelector('#hyperdrive-card'),{left:`${hyper.x}px`,top:`${hyper.y}px`,bottom:'auto',width:`${hyper.width}px`,transform:'none',translate:'none'});
        this.style(stick,{width:`${stickSize}px`,height:`${stickSize}px`,translate:`${stickTranslate}px 0`});
        const touch=this.touchOverride?.()??(navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches);this.root.dataset.cockpitTouch=String(touch);
        for(const el of this.root.querySelectorAll('.touch-right,[data-touch-throttle]'))el.inert=!touch;
        this.style(this.root,{'--painted-top':`${corners.y}px`,'--painted-top-height':`${corners.height}px`});
        const wing=rect('#hud-wing-tactics'),rightLimit=wing.width?wing.x-12:W-84;
        this.style(this.root,{'--painted-comms-max':`${Math.max(120,2*Math.min(W/2-corners.right-12,rightLimit-W/2))}px`});
        const area=rect('[data-touch-stick]'),vw=area.width*.92,vh=vw*.75;
        const hand={x:area.x+area.width*.5-vw*.5+(this.definition.handOffsetX??0)/this.definition.width*W,y:H-vh*.96,width:vw,height:vh};
        const handTop=Math.max(0,Math.floor(hand.y-6)),handWidth=Math.ceil(monitors.own.x),handHeight=H-handTop;
        Object.assign(this.handLayer.style,{left:'0px',top:`${handTop}px`,width:`${handWidth}px`,height:`${handHeight}px`});
        Object.assign(this.hand.style,{left:`${hand.x}px`,top:`${hand.y-handTop}px`,width:`${vw}px`,height:`${vh}px`});
        const cx=hand.x+vw*175/320,cy=hand.y+vh*190/240,base=this.definition.stickBase;
        const baseScale=vw/320*base.renderWidth/base.bounds.width;
        const mount={x:cx-(base.socket[0]-base.bounds.x)*baseScale,y:cy-(base.socket[1]-base.bounds.y)*baseScale,width:base.bounds.width*baseScale,height:base.bounds.height*baseScale,scale:baseScale};
        this.mount.setAttribute('viewBox',`0 ${handTop} ${handWidth} ${handHeight}`);
        for(const [key,value]of Object.entries({x:cx-base.socket[0]*baseScale,y:cy-base.socket[1]*baseScale,width:base.width*baseScale,height:base.height*baseScale}))this.mountImage.setAttribute(key,value);
        const blockers=[...Object.values(monitors).map(q=>({x:q.x-bleed,y:q.y-bleed,width:q.width+bleed*2,height:q.height+bleed*2})),hyper];
        if(touch)for(const sel of ['#touch-fire','#touch-missile','#touch-launcher-cycle','.touch-boost-right'])blockers.push(rect(sel));
        this.layout={width:W,height:H,left:origin.left,top:origin.top,monitors,hyper,hand,mount,stick:area,touch,blockers};
        this.dirty=false;return true;
    }
    showPose(yaw,pitch){
        const index=pitch<-.33?0:pitch>.33?2:1;
        if(index!==this.frameIndex){this.frameIndex=index;const f=this.definition.strip.frames[index],s=this.definition.strip.renderWidth/this.definition.strip.frameWidth;
            this.crop.setAttribute('width',this.definition.strip.frameWidth);this.crop.setAttribute('height',this.definition.strip.height);this.crop.setAttribute('viewBox',`${f.x} 0 ${this.definition.strip.frameWidth} ${this.definition.strip.height}`);this.poseLayer.setAttribute('transform',`translate(${175-f.pivot[0]*s} ${190-f.pivot[1]*s}) scale(${s})`);this.rig.dataset.pitchPose=String(index);}
        const angle=Math.round(clamp(yaw,-1,1)*22)/2;if(angle!==this.angle){this.angle=angle;this.cos=Math.cos(angle*Math.PI/180);this.sin=Math.sin(angle*Math.PI/180);this.rig.setAttribute('transform',`rotate(${angle} 175 190)`);}
    }
    update(dt,actions={}){
        if(!this.active)return;if(this.dirty&&!this.relayout())return;
        const a=1-Math.exp(-16*clamp(dt||0,0,.1));this.pose.x+=((actions.yaw||0)-this.pose.x)*a;this.pose.y+=((actions.pitch||0)-this.pose.y)*a;
        this.showPose(this.pose.x,this.pose.y);
        this.setEngaged('#touch-fire',Boolean(actions.fire));this.setEngaged('.touch-boost-right',Boolean(actions.afterburner));
    }
    setEngaged(selector,on){if(this.engaged[selector]===on)return;this.engaged[selector]=on;this.root.querySelector(selector)?.classList.toggle('is-engaged',on);}
    pointVisible(x,y){
        const L=this.layout;if(!L)return true;x-=L.left;y-=L.top;
        if(x<0||y<0||x>=L.width||y>=L.height)return true;
        for(const b of L.blockers)if(x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height)return false;
        const m=L.mount;
        if(this.baseAlpha&&x>=m.x&&x<m.x+m.width&&y>=m.y&&y<m.y+m.height){
            const b=this.definition.stickBase.bounds,bx=(x-m.x)/m.scale+b.x,by=(y-m.y)/m.scale+b.y;
            if(this.baseAlpha[Math.floor(by/4)*543+Math.floor(bx/4)]>=40)return false;
        }
        if(this.handAlpha&&this.frameIndex>=0&&x<L.monitors.own.x&&y>L.height*.55){
            const dx=(x-L.hand.x)/L.hand.width*320-175,dy=(y-L.hand.y)/L.hand.height*240-190;
            const f=this.definition.strip.frames[this.frameIndex],s=this.definition.strip.renderWidth/this.definition.strip.frameWidth;
            const hx=(dx*this.cos+dy*this.sin)/s+f.pivot[0],hy=(-dx*this.sin+dy*this.cos)/s+f.pivot[1];
            if(hx>=0&&hx<this.definition.strip.frameWidth&&hy>=0&&hy<this.definition.strip.height&&this.handAlpha[Math.floor(hy/4)*543+f.x/4+Math.floor(hx/4)]>=40)return false;
        }
        if(!this.alpha)return true;
        return this.alpha[Math.floor(y/L.height*170)*371+Math.floor(x/L.width*371)]<40;
    }
}
