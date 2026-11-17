// Survey of the dedicated glazing primitive in torsas.glb, native +Z forward.
// All 36 triangles belong to three thick window solids; no shared sensors.
// Proposed eye, not an authored seat. The straight front pane supplies the bow;
// preserve its raked posts rather than rounding this transport cab.
export default {
    eye:[0,.09,.7],look:[0,.09,1.7],fov:64,
    target:[0,.108,.82],kx:1.5,ky:1.2,
    glassMaterials:['VR_Canopy_Glass'],
    windowBounds:{min:[-.128,.064,.708],max:[.128,.153,.9]},
    // Ordered screen-left lower -> roof -> screen-right lower (+Z camera).
    ribs:[[
        [.105725,.0807689,.8993049],
        [.0907902,.1521327,.8347841],
        [-.0907902,.1521327,.8347841],
        [-.105725,.0807689,.8993049],
    ]],
};
