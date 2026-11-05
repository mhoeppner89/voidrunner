// Phones can recover detail between whole-number resolution steps without
// rendering the 3D scene at the full hardware pixel ratio.
export function pixelRenderSize(width,height,desiredWidth,recoverDetail=false){
    const scale=Math.max(1,Math.ceil(width/Math.max(1,desiredWidth)));
    const baseWidth=Math.ceil(width/scale);
    if(recoverDetail && scale>1){
        // Limit extra fill to 40% per axis. Round down in blocks so small
        // governor adjustments don't continuously reallocate render targets.
        const budget=Math.min(desiredWidth,baseWidth*1.4);
        const renderWidth=Math.floor(budget/16)*16;
        if(renderWidth>baseWidth){
            return {width:renderWidth,height:Math.max(1,Math.round(height*renderWidth/width)),scale:width/renderWidth};
        }
    }
    return {width:baseWidth,height:Math.ceil(height/scale),scale};
}
// The small radar and hull schematics can resolve fine strokes separately
// from the much larger 3D framebuffer on high-density touch displays.
export function monitorRasterRatio(){
    if (!globalThis.matchMedia?.('(pointer: coarse)').matches) return 1;
    return Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
}
export function installRetroDisplay(root){
    if(!root?.style)return;
    root.style.removeProperty('filter');
    root.dataset.pixelFinish='native';
}
