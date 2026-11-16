// Keep the generated structure intact. Live readouts sit inside its holes;
// the only separate structural part is the small fixed stick mount.
const NS='http://www.w3.org/2000/svg';
const element=(tag,attributes={})=>{const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,value);return node;};
const PIVOT={x:175,y:190};

export async function mountArtwork(host,manifest){
    for(const path of [manifest.shell,manifest.handStrip?.path??manifest.hand,manifest.stickBase.path]){
        const img=new Image();img.src=path;await img.decode();
    }
    const frame=new Image();frame.id='cockpit-frame-sprite';frame.src=manifest.shell;frame.alt='';frame.setAttribute('aria-hidden','true');host.append(frame);
    const mount=element('svg',{id:'stick-mount','aria-hidden':'true',preserveAspectRatio:'none'});host.append(mount);
    const baseImage=element('image',{href:manifest.stickBase.path,preserveAspectRatio:'none'});mount.append(baseImage);
    const rig=host.querySelector('#hand-rig');
    const pose=element('g',{id:'hand-pose'});rig.append(pose);
    const crop=element('svg',{id:'hand-pose-crop',overflow:'hidden',preserveAspectRatio:'none'});pose.append(crop);
    const image=element('image',{id:'painted-pilot-hand',href:manifest.handStrip?.path??manifest.hand,width:320,height:240,preserveAspectRatio:'none'});crop.append(image);
    let visible=true,currentFrame=-1,lastYaw=NaN;
    function layout(){
        const width=host.offsetWidth,height=host.offsetHeight,origin=host.getBoundingClientRect(),scale=origin.width/width||1;
        const hand=host.querySelector('#pilot-hand').getBoundingClientRect();
        const cx=(hand.x-origin.x)/scale+hand.width/scale*PIVOT.x/320,cy=(hand.y-origin.y)/scale+hand.height/scale*PIVOT.y/240;
        const base=manifest.stickBase,s=hand.width/scale/320*base.renderWidth/base.bounds.width;
        mount.setAttribute('viewBox',`0 0 ${width} ${height}`);
        for(const [key,value]of Object.entries({x:cx-base.socket[0]*s,y:cy-base.socket[1]*s,width:base.width*s,height:base.height*s}))baseImage.setAttribute(key,value);
        host.dataset.stickPivot=`${cx},${cy}`;
    }
    function updateStick(yaw=0,pitch=0){
        const poses=manifest.handStrip?.frames;
        const index=poses?(pitch<-.33?0:pitch>.33?2:1):0;
        if(index!==currentFrame){
            currentFrame=index;
            if(poses){
                const f=poses[index],sheet=manifest.handStrip,s=sheet.renderWidth/sheet.frameWidth;
                image.setAttribute('href',sheet.path);image.setAttribute('width',sheet.width);image.setAttribute('height',sheet.height);
                crop.setAttribute('width',sheet.frameWidth);crop.setAttribute('height',sheet.height);crop.setAttribute('viewBox',`${f.x} 0 ${sheet.frameWidth} ${sheet.height}`);
                pose.setAttribute('transform',`translate(${PIVOT.x-f.pivot[0]*s} ${PIVOT.y-f.pivot[1]*s}) scale(${s})`);
            }else{
                crop.setAttribute('width',320);crop.setAttribute('height',240);crop.setAttribute('viewBox','0 0 320 240');
            }
            rig.dataset.pitchPose=String(index);
        }
        const angle=Math.round(Math.max(-1,Math.min(1,yaw))*11*10)/10;
        if(angle!==lastYaw){lastYaw=angle;rig.setAttribute('transform',`rotate(${angle} ${PIVOT.x} ${PIVOT.y})`);}
    }
    function setVisible(value){visible=Boolean(value);host.classList.toggle('has-cockpit-paint',visible);}
    updateStick();layout();setVisible(true);
    return {layout,setVisible,updateStick,get visible(){return visible;},manifest,pivot:PIVOT};
}
