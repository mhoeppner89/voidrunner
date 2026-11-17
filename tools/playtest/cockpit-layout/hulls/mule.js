// Surveyed from mule.glb's untransformed MuleApprovedHull primitive.
// Native +Z is forward, +Y up. The eye is a proposed seat, not a model marker.
export default {
    eye:[0,.012,.78],look:[0,.012,1.78],fov:64,
    target:[0,.045,.9],kx:1.15,ky:1.9,
    glassMaterials:['VR_Canopy_mule'],
    // Six forward freight-cab panes (12 triangles). The same material also
    // covers three separate aft/upper windows at z=.00690..20525; exclude them.
    windowBounds:{min:[-.169,.008,.84],max:[.169,.080,.974]},
    // Connected left-lower -> roof -> right-lower bow, using real pane corners.
    // Looking +Z puts native +X on the screen's left. Keep the broad low brow;
    // do not curve the cab into Mercury's hoop or add a central sightline post.
    ribs:[[
        [.148317918,.021412157,.922808945],
        [.148317918,.075776689,.922808945],
        [.090899207,.052564863,.967400134],
        [.084985569,.051898196,.969463527],
        [.003133343,.051898196,.973128498],
        [-.003133343,.051898196,.973128498],
        [-.084985569,.051898196,.969463527],
        [-.090899207,.052564863,.967400134],
        [-.148317918,.075776689,.922808945],
        [-.148317918,.021412153,.922808945],
    ]],
};
