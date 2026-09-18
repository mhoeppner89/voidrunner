// Frontier League hulls and fleet doctrine. Values are shared by NPC and player fitting.
export const LEAGUE_HULLS = {
  "speedster": {
    "id": "speedster",
    "name": "Speedster",
    "variant": "speedster",
    "className": "Courier Interceptor",
    "personality": "Fast courier and scout",
    "description": "Fast courier and scout. Built for the Frontier League; available in Acheron.",
    "price": 31000,
    "maxSpeed": 84,
    "afterburnSpeed": 140,
    "acceleration": 52,
    "angularAcceleration": 4.1,
    "angularDamping": 3.05,
    "shield": 85,
    "hull": 140,
    "reactorOutput": 20,
    "energyCapacity": 65,
    "cargo": 12,
    "fuel": 90,
    "gunDamage": 12,
    "requiredFaction": "frontier-league",
    "requiredReputation": 0
  },
  "legionary": {
    "id": "legionary",
    "name": "Legionary",
    "variant": "legionary",
    "className": "League Line Fighter",
    "personality": "Agile frontline fighter",
    "description": "Agile frontline fighter. Built for the Frontier League; available in Acheron.",
    "price": 57000,
    "maxSpeed": 67,
    "afterburnSpeed": 110,
    "acceleration": 39,
    "angularAcceleration": 4.0,
    "angularDamping": 3.05,
    "shield": 135,
    "hull": 245,
    "reactorOutput": 29,
    "energyCapacity": 95,
    "cargo": 20,
    "fuel": 115,
    "gunDamage": 12,
    "requiredFaction": "frontier-league",
    "requiredReputation": 12
  },
  "andromeda": {
    "id": "andromeda",
    "name": "Andromeda",
    "variant": "andromeda",
    "className": "Heavy Strike Fighter",
    "personality": "Torpedo bomber and heavy striker",
    "description": "Torpedo bomber and heavy striker. Built for the Frontier League; available in Acheron.",
    "price": 66000,
    "maxSpeed": 56,
    "afterburnSpeed": 90,
    "acceleration": 31,
    "angularAcceleration": 2.65,
    "angularDamping": 3.05,
    "shield": 145,
    "hull": 280,
    "reactorOutput": 27,
    "energyCapacity": 110,
    "cargo": 24,
    "fuel": 135,
    "gunDamage": 12,
    "requiredFaction": "frontier-league",
    "requiredReputation": 20
  },
  "torsas": {
    "id": "torsas",
    "name": "Torsas",
    "variant": "torsas",
    "className": "Armed Transport",
    "personality": "Defensible convoy transport",
    "description": "Defensible convoy transport. Built for the Frontier League; available in Acheron.",
    "price": 43000,
    "maxSpeed": 46,
    "afterburnSpeed": 72,
    "acceleration": 20,
    "angularAcceleration": 1.6,
    "angularDamping": 3.05,
    "shield": 115,
    "hull": 260,
    "reactorOutput": 20,
    "energyCapacity": 90,
    "cargo": 80,
    "fuel": 165,
    "gunDamage": 12,
    "requiredFaction": "frontier-league",
    "requiredReputation": 0
  },
  "astra": {
    "id": "astra",
    "name": "Astra",
    "variant": "astra",
    "className": "Expedition Cutter",
    "personality": "Long-range armed explorer",
    "description": "Long-range armed explorer. Built for the Frontier League; available in Acheron.",
    "price": 47000,
    "maxSpeed": 60,
    "afterburnSpeed": 96,
    "acceleration": 29,
    "angularAcceleration": 2.7,
    "angularDamping": 3.05,
    "shield": 110,
    "hull": 210,
    "reactorOutput": 25,
    "energyCapacity": 90,
    "cargo": 48,
    "fuel": 180,
    "gunDamage": 12,
    "requiredFaction": "frontier-league",
    "requiredReputation": 0
  }
};
export const LEAGUE_FITS = {
  "speedster": {
    "guns": [
      "pulse-cannon",
      "pulse-cannon"
    ],
    "launcher": "seeker-launcher",
    "defense": "recovery-shield"
  },
  "legionary": {
    "guns": [
      "pulse-mk2",
      "ripper"
    ],
    "launcher": "seeker-launcher",
    "power": "sustained-reactor"
  },
  "andromeda": {
    "guns": [
      "pulse-mk2",
      "gauss-cannon"
    ],
    "launchers": [
      "torpedo-launcher",
      "swarm-launcher"
    ],
    "turret": "pdc"
  },
  "torsas": {
    "guns": [
      "beam-emitter",
      "beam-emitter"
    ],
    "launcher": "seeker-launcher",
    "turret": "pdc"
  },
  "astra": {
    "guns": [
      "beam-emitter",
      "gauss-cannon"
    ],
    "launcher": "seeker-launcher"
  }
};
export const LEAGUE_ID = "frontier-league";
export const factionsOpposed = (a,b) => Boolean(a && b && a !== b && (a === "red-talons" || b === "red-talons" || a === LEAGUE_ID && b === "concord" || a === "concord" && b === LEAGUE_ID));
// Spillover follows remote locations, never the protected starting docks.
export function leagueTrafficChance(systemId, locationId) {
 if(systemId === "acheron") return 1;
 if(systemId === "pale-ring") return locationId === "nacre" ? .15 : .35;
 return systemId === "helios-verge" && ["cairn","mourning-line"].includes(locationId) ? .15 : 0;
}
