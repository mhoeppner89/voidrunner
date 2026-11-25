// Balor's angular raider canopy is surveyed from the shipped scrapper.glb.
// Layout and painted composition approved on 2026-11-16 for live flight.
export function createScrapperCockpit(base){
    return {
        ...base,
        id:'scrapper',name:'Balor',status:'approved',
        shell:new URL('../../../assets/cockpits/scrapper-paint-v2.png',import.meta.url).href,
        artworkSize:[1850,850],
        // Center the unchanged live display sizes on the original painting's
        // measured holes. Internal margins protect its layered seals/bezels.
        // Never stencil or regenerate this detailed frame to fit the readouts.
        hardware:{xpdr:[672,582,104,30]},
        monitors:{
            own:{...base.monitors.own,x:418,y:616},
            radar:{...base.monitors.radar,x:792,y:641.5},
            target:{...base.monitors.target,x:1124,y:616},
        },
        screenInsets:{own:{x:18,y:14},radar:{x:14,y:14},target:{x:11,y:14}},
        housingTops:{radar:560},hyperdriveBottom:633,
        stickClearanceX:416,
        // Move the complete fixed socket/hand rig onto the projected deck.
        // Touch geometry, source poses, scale and base sprite remain inherited.
        handOffsetX:-60,
    };
}
