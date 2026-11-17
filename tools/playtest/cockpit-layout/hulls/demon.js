// Native GLB survey: the central glazed pod, not the gaps between the two
// armored prongs. The hull points along +Z (the exhausts are at negative Z).
// All 18 triangles in this dedicated material are the nine real canopy panes.
export default {
    eye:[0,-.015,.18],look:[0,-.015,1.18],fov:64,
    target:[0,-.015,.28],kx:.9,ky:.65,
    glassMaterials:['VR_Canopy_demon'],
    windowBounds:{min:[-.082371,-.155718,.114629],max:[.082371,.047061,.545881]},
    // Rear edge of the middle glazing station. Ordered screen-left lower,
    // chamfered roof, screen-right lower; +X appears left when looking +Z.
    // The short steps between side/top panes preserve the measured frame gaps.
    ribs:[[
        [.082370,-.011542,.244202],
        [.056613,.029779,.244202],
        [.049998,.032074,.244202],
        [-.049998,.032074,.244202],
        [-.056613,.029779,.244202],
        [-.082370,-.011542,.244202],
    ]],
};
