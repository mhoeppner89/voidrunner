// Native GLB coordinates: +Z is forward, +Y up, X spans the wings.
// Proposed pilot eye, not an authored seat. All rib points are actual vertices
// of the z=.382 canopy section; the roof remains flat and the jambs faceted.
export default {
    eye:[0,0,.255],look:[0,0,1.255],fov:64,
    target:[0,.025,.38],kx:1.2,ky:.9,
    // This optimized hull has ONE packed armor/glass material. Its top-right
    // atlas tile is exclusively the six glazing panels (72 native triangles).
    // Filtering by material alone would incorrectly highlight the entire hull.
    glassMaterials:['Scrapper · Chipped brick red / charcoal armor.011'],
    glassUvBounds:[.75,0,1,.25],
    ribs:[[
        [.122,-.029,.382],
        [.07492,.078,.382],
        [.07092,.084,.382],
        [-.07092,.084,.382],
        [-.07492,.078,.382],
        [-.122,-.029,.382],
    ]],
};
