// Canonical control-label keys. Instructions reference {ui.term} so both
// languages use the same translated labels as the actual controls.
export const UI_TERMS=Object.freeze({
 market:'MARKET',trade:'Trade',equipment:'Equipment',shipyard:'Shipyard',
 storage:'STORAGE',cargo:'CARGO',services:'SERVICES',refill:'REFILL',fuel:'Fuel and ordnance',
 missionBoard:'MISSION BOARD',raceBoard:'RACE BOARD',raceDesk:'RACE DESK',contracts:'CONTRACTS',bar:'BAR',
 buyMax:'BUY MAX',sellAll:'SELL ALL',install:'INSTALL',accept:'ACCEPT',
 flight:'Flight',transponderOn:'TRANSPONDER ON',transponderOff:'TRANSPONDER OFF',
 droneBay:'Drone bay',mine:'MINE',salvage:'SALVAGE',blackbox:'BLACK BOX SIGNAL',
});
export function socialVenueKey(location){
 const s=location?.services??{};
 return s.race&&!s.missions?UI_TERMS.raceDesk:s.missions&&!s.bar?UI_TERMS.contracts:UI_TERMS.bar;
}
export const missionBoardKey=location=>location?.services?.race&&!location.services.missions?UI_TERMS.raceBoard:UI_TERMS.missionBoard;
