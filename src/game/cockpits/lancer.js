// Model-informed painted Artemis proposal. Approved composition, active in flight.
export function createLancerCockpit(base){
    return {...base,id:'lancer',name:'Artemis',status:'approved',fixedInstruments:true,shell:new URL('../../../assets/cockpits/lancer-paint-v1.png',import.meta.url).href,
        artworkSize:[1850,850],glassUnderlap:14,
        screenInsets:{own:{x:18,y:14,bottom:18},radar:{x:27,y:24},target:{x:23,y:14,bottom:18,container:true}},
        monitors:{own:{...base.monitors.own},radar:{...base.monitors.radar,y:647},target:{...base.monitors.target}},
        housingTops:{own:611,radar:582,target:611},hyperdriveBottom:633,stickClearanceX:416,handOffsetX:-60,
        structure:{"style":"skeletal","rim":9,"edge":11,"corner":10,"near":0.32,"front":225,"bevel":0.01,"depth":0.045},
        continuousBow:false,
    };
}
