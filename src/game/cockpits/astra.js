// Model-informed painted Odin proposal. Approved composition, active in flight.
export function createAstraCockpit(base){
    return {...base,id:'astra',name:'Odin',status:'approved',fixedInstruments:true,shell:new URL('../../../assets/cockpits/astra-paint-v2.png',import.meta.url).href,
        artworkSize:[1850,850],glassUnderlap:14,
        screenInsets:{own:{x:13,y:18,bottom:29},radar:{x:23,y:29},target:{x:13,y:18,bottom:29,container:true}},
        hardware:{xpdr:[535,592,84,24]},hardwareSeat:'top',
        // The dome holds the hyperdrive; the pair sits on the side screen tubes
        // between their hinges, mirrored about the painted (not radar) centre.
        hardwareAxis:920,
        monitors:{own:{...base.monitors.own},radar:{...base.monitors.radar,y:647},target:{...base.monitors.target}},
        housingTops:{own:601,radar:533,target:601},hyperdriveBottom:633,stickClearanceX:416,handOffsetX:-60,
        structure:{"style":"pressure","rim":16,"edge":23,"corner":25,"near":0.31,"front":285,"bevel":0.024,"depth":0.09},
        continuousBow:true,
    };
}
