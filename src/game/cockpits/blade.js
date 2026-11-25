// Model-informed painted Victoria proposal. Approved composition, active in flight.
// Revision 4: a symmetric, folded fighter console; all glass/control geometry stays fixed.
export function createBladeCockpit(base){
    return {...base,id:'blade',name:'Victoria',status:'approved',fixedInstruments:true,shell:new URL('../../../assets/cockpits/blade-paint-v1.png',import.meta.url).href,
        artworkSize:[1850,850],glassUnderlap:14,
        screenInsets:{own:{x:16,y:19},radar:{x:17,y:25},target:{x:18,y:14,bottom:19,container:true}},
        hardware:{xpdr:[680,590,104,30]},
        monitors:{own:{...base.monitors.own},radar:{...base.monitors.radar,y:647},target:{...base.monitors.target}},
        housingTops:{own:584,radar:560,target:584},hyperdriveBottom:633,stickClearanceX:416,handOffsetX:-60,
        structure:{"style":"faceted","rim":15,"edge":17,"corner":22,"near":0.29,"front":255,"bevel":0.022,"depth":0.07},
        continuousBow:false,
    };
}
