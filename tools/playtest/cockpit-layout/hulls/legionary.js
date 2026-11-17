// Native +Z is forward (muzzles +Z, all four engine markers -Z).
// Six closed panes, thickened .003 along Y, use this material: 72 triangles.
// The ordered bow follows their transverse seam at native z ~= .312.
// Looking +Z makes native +X screen-left; keep that ordering for the renderer.
export default {
    eye:[0,.035,.19],look:[0,.035,1.19],fov:64,target:[0,.06,.32],
    glassMaterials:['VR_Canopy_Glass'],
    windowBounds:{min:[-.078,.018,.187],max:[.078,.106,.478]},
    // Deliberate interior adaptation: widen the narrow fighter canopy 1.75x;
    // compress height to .9x so the roof clears phone comms. Keep straight ribs.
    kx:1.75,ky:.9,
    ribs:[[
        [.073152,.031362,.312324],
        [.028363,.099627,.312057],
        [-.028363,.099627,.312057],
        [-.073152,.031362,.312324],
    ]],
};
