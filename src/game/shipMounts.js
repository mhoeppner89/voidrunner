// Shared model-space attachment points. Guns and launchers are also the live
// projectile origins; the outfitting preview uses the same coordinates so a
// module shown on the dealer's ship is the module that fires in space.
export const SHIP_MOUNT_ANCHORS = Object.freeze({
    speedster: {"guns": [[-0.55, -0.3, -3.5], [0.55, -0.3, -3.5]], "launchers": [[0, -0.3, -2.5]], "drive": [[0, 0, 4.4]], "defense": [[0, 1, 0]], "utility": [[0, -1, 1]]},
    legionary: {"guns": [[-2.7, -0.2, -2.7], [2.7, -0.2, -2.7]], "launchers": [[0, -0.5, -2.2]], "drive": [[0, 0, 4.960000000000001]], "defense": [[0, 1, 0]], "utility": [[0, -1, 1]]},
    andromeda: {"guns": [[-3, -0.3, -3], [3, -0.3, -3]], "launchers": [[-1, -0.7, -3], [1, -0.7, -3]], "drive": [[0, 0, 6.24]], "defense": [[0, 1, 0]], "utility": [[0, -1, 1]]},
    torsas: {"guns": [[-1.3, -0.4, -4], [1.3, -0.4, -4]], "launchers": [[0, -0.7, -4]], "drive": [[0, 0, 6.4]], "defense": [[0, 1, 0]], "utility": [[-1, -1, 1], [1, -1, 1]]},
    astra: {"guns": [[-2.5, -0.1, -2.5], [2.5, -0.1, -2.5]], "launchers": [[0, -0.6, -3]], "drive": [[0, 0, 5.120000000000001]], "defense": [[0, 1, 0]], "utility": [[-1, -1, 1], [1, -1, 1]]},

    wayfarer: Object.freeze({
        guns: [[-0.75, -0.55, -2.5], [0.75, -0.55, -2.5]],
        launchers: [[0, -0.4, -1.7]],
        drive: [[0, 0, 3.6]], defense: [[0, 0.7, 0.2]],
        utility: [[-1.05, 0.05, 0.8], [1.05, 0.05, 0.8]],
    }),
    talon: Object.freeze({
        // The Talon is a broad, flat hull.  Spread the paired S guns over
        // its shoulders so they sit on the visible outriggers instead of
        // collapsing into one centerline bundle.
        guns: [[-2.8, 0.12, -3.15], [2.8, 0.12, -3.15], [0, -0.08, -4.0]],
        launchers: [[0, 0.02, -2.25]],
        drive: [[0, 0.05, 3.45]], defense: [[0, 0.5, 0.2]], utility: [[0, 0.28, 1.35]],
    }),
    vanguard: Object.freeze({
        guns: [[-1.05, -0.28, -4.0], [1.05, -0.28, -4.0]],
        launchers: [[0, -0.4, -2.55]],
        drive: [[0, 0.02, 4.15]], defense: [[0, 0.78, 0.25]],
        utility: [[-2.1, 0.14, 1.2], [2.1, 0.14, 1.2]],
    }),
    prospector: Object.freeze({
        guns: [[0, -0.18, -3.3]],
        launchers: [[0, -0.35, -2.2]],
        drive: [[0, 0.02, 4.4]], defense: [[0, 0.78, 0.4]],
        utility: [[-1.8, 0.2, 1.1], [0, 0.26, 2.0], [1.8, 0.2, 1.1]],
    }),
    lancer: Object.freeze({
        guns: [[-3.2, -0.1, -3.5], [3.2, -0.1, -3.5]],
        launchers: [[-2.0, -0.18, -2.45], [2.0, -0.18, -2.45]],
        drive: [[0, 0.02, 4.4]], defense: [[0, 0.68, 0.2]], utility: [[0, 0.18, 1.5]],
    }),
    atlas: Object.freeze({
        // Atlas is almost twice the hull length of the fighters.  Its bow
        // guns and launcher must move forward with that silhouette or every
        // module appears in one tiny central cluster.
        guns: [[0, 1.1, -7.2]],
        launchers: [[0, 1.0, -4.8]],
        drive: [[0, 0.05, 8.7]], defense: [[0, 1.8, 0.5]],
        utility: [[-2.6, 1.0, 2.0], [-0.9, 1.18, 3.45], [0.9, 1.18, 3.45], [2.6, 1.0, 2.0]],
    }),
});
