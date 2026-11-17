// Model-informed painted Bellona proposal. Approved composition, active in flight.
export function createVanguardCockpit(base){
    return {...base,id:'vanguard',name:'Bellona',status:'approved',fixedInstruments:true,shell:new URL('../../../assets/cockpits/vanguard-paint-v2.png',import.meta.url).href,
        artworkSize:[1850,850],glassUnderlap:14,
        screenInsets:{own:{x:18,y:21},radar:{x:25,y:25},target:{x:25,y:12,bottom:21,container:true}},
        monitors:{own:{...base.monitors.own},radar:{...base.monitors.radar,y:647},target:{...base.monitors.target}},
        housingTops:{own:529,radar:529,target:529},hyperdriveBottom:633,stickClearanceX:416,handOffsetX:-60,
        structure:{"style":"armored","rim":25,"edge":25,"corner":5,"near":0.3,"front":300,"bevel":0.032,"depth":0.13},
        continuousBow:false,
    };
}
