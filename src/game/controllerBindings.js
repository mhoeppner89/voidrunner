// The user-approved default. Stick movement is fixed independently in input.js.
// null leaves an action deliberately unbound; it must never fall back to button 0.
export const FLIGHT_CONTROLLER_BINDINGS = Object.freeze({
    "fire": 0,
    "secondary": 2,
    "afterburner": 7,
    "targetNext": 1,
    "targetNearestHostile": 13,
    "weaponCycle": 6,
    "launcherCycle": 4,
    "autopilot": 3,
    "shipMenu": 12,
    "map": 8,
    "pause": 9,
    "navNext": 15,
    "wingOrder": 5,
    "transponder": 14,
    "rollLeft": null,
    "rollRight": null,
    "jettison": null
});
export const MENU_CONTROLLER_BINDINGS = Object.freeze({
    "confirm": 0,
    "back": 1,
    "nextControl": 2,
    "previousTab": 4,
    "nextTab": 5,
    "up": 12,
    "down": 13,
    "left": 14,
    "right": 15,
    "scrollUp": 6,
    "scrollDown": 7,
    "pauseBack": 9
});

export const CONTROLLER_ACTIONS = Object.freeze({
    flight: [
        ['fire','Primary fire'],['secondary','Missile / mining drones'],['afterburner','Boost / afterburner'],
        ['targetNext','Cycle target'],['targetNearestHostile','Nearest hostile'],['weaponCycle','Cycle fire group'],
        ['launcherCycle','Cycle launcher'],['autopilot','Hyperdrive'],['shipMenu','Ship / cargo menu'],
        ['map','Navigation map'],['pause','Pause'],['navNext','Cycle navigation destination'],['wingOrder','Cycle wing order'],
        ['transponder','Toggle transponder'],['rollLeft','Roll left'],['rollRight','Roll right'],['jettison','Drop cargo'],
    ],
    menus: [
        ['confirm','Confirm / select'],['back','Back / close'],['nextControl','Next control'],['previousTab','Previous tab'],
        ['nextTab','Next tab'],['up','Navigate up'],['down','Navigate down'],['left','Navigate left / decrease'],
        ['right','Navigate right / increase'],['scrollUp','Scroll up'],['scrollDown','Scroll down'],['pauseBack','Pause / resume / close'],
    ],
});
export const CONTROLLER_BUTTON_LABELS = Object.freeze(['A / ✕','B / ○','X / □','Y / △','LB / L1','RB / R1','LT / L2','RT / R2','View / Share','Menu / Options','L3','R3','D-pad ↑','D-pad ↓','D-pad ←','D-pad →','Home / PS']);
export const defaultControllerBindings = () => ({flight:{...FLIGHT_CONTROLLER_BINDINGS},menus:{...MENU_CONTROLLER_BINDINGS}});
export const requiredMenuBinding = (context, action) => context === 'menus' && (action === 'confirm' || action === 'back');
const validButton = value => Number.isInteger(value) && value >= 0 && value < 64;

export function normalizeControllerBindings(value) {
    const result=defaultControllerBindings();
    for (const context of ['flight','menus']) {
        const map=result[context], source=value?.[context];
        for (const action of Object.keys(map)) {
            if (source && Object.hasOwn(source,action) && (validButton(source[action]) || source[action] === null && !requiredMenuBinding(context,action))) map[action]=source[action];
        }
        const used=new Set();
        for (const action of Object.keys(map)) {
            if (map[action] === null) continue;
            if (used.has(map[action])) {
                if (requiredMenuBinding(context,action)) {
                    let free=0;while(used.has(free))free++;
                    map[action]=free;
                } else map[action]=null;
            }
            if (map[action] !== null) used.add(map[action]);
        }
    }
    return result;
}

// Reassigning an occupied button swaps the two actions. Never silently remove
// Confirm or Back: the controller must remain usable to finish setup.
export function rebindController(value, context, action, button) {
    if (!CONTROLLER_ACTIONS[context]?.some(entry=>entry[0]===action) || button !== null && !validButton(button)) throw new Error('invalid-binding');
    const result=normalizeControllerBindings(value), map=result[context];
    const previous=map[action];
    const other=button === null ? undefined : Object.keys(map).find(id=>id!==action && map[id]===button);
    if (button === null && requiredMenuBinding(context,action) || other && previous === null && requiredMenuBinding(context,other)) throw new Error('required-menu-binding');
    if (other) map[other]=previous;
    map[action]=button;
    return {bindings:result,swapped:other??null};
}
