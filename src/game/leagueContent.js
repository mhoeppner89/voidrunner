// Shared career and NPC hull definitions.
export const LEAGUE_HULLS = {
  "speedster": {
    "id": "speedster",
    "name": "Loki",
    "variant": "speedster",
    "className": "Courier Interceptor",
    "personality": "Fast courier and scout",
    "description": "Fast courier and scout. Built for the Alliance; available in Acheron.",
    "price": 40000,
    "maxSpeed": 70,
    "afterburnSpeed": 110,
    "acceleration": 50,
    "angularAcceleration": 4.1,
    "angularDamping": 3.0,
    "shield": 190,
    "hull": 160,
    "reactorOutput": 15,
    "energyCapacity": 60,
    "shieldRegen": 5,
    "cargo": 10,
    "gunDamage": 12,
    "requiredFaction": "alliance",
    "requiredReputation": 0,
    "tier": 1,
    "role": "interceptor",
    "progressesTo": [
      "talon"
    ]
  },
  "legionary": {
    "id": "legionary",
    "name": "Tyr",
    "variant": "legionary",
    "className": "Alliance Line Fighter",
    "personality": "Agile frontline fighter",
    "description": "Agile frontline fighter. Built for the Alliance; available in Acheron.",
    "price": 100000,
    "maxSpeed": 70,
    "afterburnSpeed": 110,
    "acceleration": 40,
    "angularAcceleration": 3.8,
    "angularDamping": 3.0,
    "shield": 300,
    "hull": 300,
    "reactorOutput": 25,
    "energyCapacity": 100,
    "shieldRegen": 6,
    "cargo": 20,
    "gunDamage": 12,
    "requiredFaction": "alliance",
    "requiredReputation": 0,
    "tier": 2,
    "role": "fighter",
    "progressesTo": [
      "blade"
    ]
  },
  "andromeda": {
    "id": "andromeda",
    "name": "Thor",
    "variant": "andromeda",
    "className": "Heavy Strike Fighter",
    "personality": "Torpedo bomber and heavy striker",
    "description": "Torpedo bomber and heavy striker. Built for the Alliance; available in Acheron.",
    "price": 110000,
    "maxSpeed": 55,
    "afterburnSpeed": 90,
    "acceleration": 30,
    "angularAcceleration": 2.7,
    "angularDamping": 3.0,
    "shield": 300,
    "hull": 350,
    "reactorOutput": 25,
    "energyCapacity": 100,
    "shieldRegen": 6,
    "cargo": 25,
    "gunDamage": 12,
    "requiredFaction": "alliance",
    "requiredReputation": 0,
    "tier": 2,
    "role": "bomber",
    "progressesTo": [
      "vanguard"
    ]
  },
  "torsas": {
    "id": "torsas",
    "name": "Freya",
    "variant": "torsas",
    "className": "Armed Transport",
    "personality": "Defensible convoy transport",
    "description": "A versatile armed transport with two drone bays, mining capability and a defensive turret. Larger hold and better protection than the Hestia.",
    "price": 90000,
    "maxSpeed": 45,
    "afterburnSpeed": 70,
    "acceleration": 20,
    "angularAcceleration": 1.6,
    "angularDamping": 3.0,
    "shield": 230,
    "hull": 270,
    "reactorOutput": 20,
    "energyCapacity": 80,
    "shieldRegen": 5,
    "cargo": 65,
    "gunDamage": 12,
    "requiredFaction": "alliance",
    "requiredReputation": 0,
    "tier": 2,
    "role": "allrounder",
    "progressesTo": [
      "astra"
    ]
  },
  "astra": {
    "id": "astra",
    "name": "Odin",
    "variant": "astra",
    "className": "Expedition Cutter",
    "personality": "Long-range armed explorer",
    "description": "An elite expedition cutter with two drone bays, mining capability and three forward guns. Faster and more versatile than a freighter, with less industrial capacity.",
    "price": 180000,
    "maxSpeed": 60,
    "afterburnSpeed": 95,
    "acceleration": 30,
    "angularAcceleration": 2.7,
    "angularDamping": 3.1,
    "shield": 330,
    "hull": 320,
    "reactorOutput": 30,
    "energyCapacity": 110,
    "shieldRegen": 7,
    "cargo": 90,
    "gunDamage": 12,
    "requiredFaction": "alliance",
    "requiredReputation": 0,
    "tier": 3,
    "role": "allrounder"
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
      "pulse-cannon-t2",
      "pulse-cannon-t2",
      "ripper",
      "ripper"
    ],
    "launcher": "seeker-launcher",
    "power": "sustained-reactor"
  },
  "andromeda": {
    "guns": [
      "pulse-cannon-t2",
      "gauss-cannon"
    ],
    "launchers": [
      "torpedo-launcher",
      "swarm-launcher",
      "torpedo-launcher"
    ],
    "turret": "pdc"
  },
  "torsas": {
    "guns": [
      "beam-emitter",
      "beam-emitter",
      "beam-emitter"
    ],
    "launcher": "seeker-launcher",
    "turret": "pdc"
  },
  "astra": {
    "guns": [
      "beam-emitter",
      "beam-emitter",
      "gauss-cannon"
    ],
    "launcher": "seeker-launcher"
  }
};
export const LEAGUE_ID = "alliance";
export {factionsOpposed} from './factions.js';
// Spillover follows remote locations, never the protected starting docks.
export function leagueTrafficChance(systemId, locationId) {
 if(systemId === "acheron") return 1;
 if(systemId === "pale-ring") return locationId === "nacre" ? .15 : .35;
 return systemId === "helios-verge" && ["cairn","mourning-line"].includes(locationId) ? .03 : 0;
}
