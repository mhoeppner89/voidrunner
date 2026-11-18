// Line icons for the station and ship menus. Each is a 24-unit square drawn
// with currentColor, so it takes the colour of the control it sits in; square
// caps and crisp edges keep them in the pixel language of the item sprites.
const icon = (d, size = 20) => `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${d}</svg>`;

const PATHS = Object.freeze({
    back: '<path d="M15 5l-7 7 7 7"/>',
    trade: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
    equipment: '<path d="M3 10h12l6 2-6 2H3z"/><path d="M7 14v5h4v-5M7 10V7h3v3"/>',
    shipyard: '<path d="M12 3l3 7 6 3-6 2-3 6-3-6-6-2 6-3z"/>',
    bar: '<path d="M5 4h14l-7 8z"/><path d="M12 12v8M8 20h8M15 7h3"/>',
    den: '<path d="M4 10h16v10H4zM8 10V7a4 4 0 018 0v3"/><path d="M12 14v2"/>',
    contracts: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h5"/>',
    guilds: '<path d="M12 3l8 4v5c0 5-4 8-8 9-4-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    cargo: '<rect x="3" y="7" width="18" height="13"/><path d="M3 11h18M9 7V4h6v3"/>',
    credits: '<circle cx="12" cy="12" r="8"/><path d="M9 9h5a2 2 0 010 4h-4a2 2 0 000 4h5M12 6v2M12 16v2"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8v.5"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    story: '<path d="M4 5h7a2 2 0 012 2v12a2 2 0 00-2-2H4zM20 5h-7a2 2 0 00-2 2v12a2 2 0 012-2h7z"/>',
    repair: '<path d="M14 6a4 4 0 00-5 5l-5 5 3 3 5-5a4 4 0 005-5l-2 2-3-3z"/>',
    fuel: '<path d="M6 21V5a2 2 0 012-2h6a2 2 0 012 2v16M4 21h14M16 9h2a2 2 0 012 2v6a1 1 0 01-2 0v-4"/><path d="M9 7h4"/>',
    paint: '<path d="M4 20c2 0 4-1 4-4l9-9-3-3-9 9c-1 1-1 3-1 4M14 4l6 6"/>',
    flight: '<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>',
    weapons: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    journal: '<path d="M6 3h11a1 1 0 011 1v17H7a2 2 0 01-2-2V5a2 2 0 011-2zM9 7h6M9 11h6"/>',
    drones: '<circle cx="12" cy="12" r="3"/><path d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4"/><circle cx="4.5" cy="4.5" r="1.5"/><circle cx="19.5" cy="4.5" r="1.5"/><circle cx="4.5" cy="19.5" r="1.5"/><circle cx="19.5" cy="19.5" r="1.5"/>',
    map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    race: '<path d="M4 20V4M4 4h12l-2 4 2 4H4"/>',
    delivery: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4"/>',
    transport: '<path d="M3 12h13M12 6l6 6-6 6M20 5v14"/>',
    bounty: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    salvage: '<path d="M5 19l4-10 6 4 4-8"/><circle cx="5" cy="19" r="1.5"/>',
    mining: '<path d="M14 4l6 6M4 20l9-9M11 6l7 7"/>',
    smuggle: '<path d="M4 10h16v10H4zM8 10V7a4 4 0 018 0v3"/>',
    story_contract: '<path d="M12 3l2.5 6 6.5.5-5 4.3 1.6 6.2L12 17l-5.6 3 1.6-6.2-5-4.3 6.5-.5z"/>',
});

export const uiIcon = (name, size) => icon(PATHS[name] ?? PATHS.info, size);
export const UI_ICON_NAMES = Object.freeze(Object.keys(PATHS));
