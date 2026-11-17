// Model-informed painted Atlas Hauler proposal. Approved composition, active in flight.
export function createAtlasCockpit(base){
    return {...base,id:'atlas',name:'Atlas Hauler',status:'approved',fixedInstruments:true,shell:new URL('../../../assets/cockpits/atlas-paint-v1.png',import.meta.url).href,
        artworkSize:[1850,850],glassUnderlap:14,
        screenInsets:{own:{x:20,y:19},radar:{x:18,y:24},target:{x:20,y:12,bottom:19,container:true}},
        monitors:{own:{...base.monitors.own},radar:{...base.monitors.radar,y:647},target:{...base.monitors.target}},
        housingTops:{own:562,radar:562,target:562},hyperdriveBottom:633,stickClearanceX:416,handOffsetX:-60,
        structure:{"style":"industrial","rim":18,"edge":24,"corner":12,"near":0.3,"front":325,"bevel":0.026,"depth":0.11},
        continuousBow:false,
    };
}
