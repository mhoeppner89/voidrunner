// Route-specific transmissions use the ordinary radio bar and never pause flight.
// IDs are saved with the quest so returning to a route does not repeat a line.
export const TUTORIAL_RADIO = [
    {"after":"vesper-home","destination":"vesper","id":"vesper-docks","step":"fly-vesper","text":"The first habitats stood beside the landing pads. Cargo arrived before there were roads. That is why the commodity market is still by the port."},
    {"after":"vesper-docks","destination":"vesper","id":"vesper-price","step":"fly-vesper","text":"We do not have to carry the same cargo back. Vesper has plenty of ore and too little food. A good trade starts with listening to people."},
    {"after":"vesper-price","destination":"vesper","id":"vesper-mara","step":"fly-vesper","text":"Mara knew our mother when they were children. When she tells those stories, it sometimes takes me a while to work out who started the trouble."},
    {"after":"belt-living","destination":"shardbelt","id":"belt-work","step":"mine-shardbelt","text":"The big companies want continuous deposits. Small leftover seams can still pay for us. We do not have a whole fleet to support."},
    {"after":"belt-work","destination":"shardbelt","id":"belt-markers","step":"mine-shardbelt","text":"The belt's markers were left by different crews. Some mark clear passages, others mining sites. That is why we check what the target monitor has actually identified."},
    {"after":"belt-markers","destination":"shardbelt","id":"belt-mother","step":"mine-shardbelt","text":"Our mother hated throwing things away. A broken pump housing became a flowerpot at home. Mara still keeps it behind the bar."},
    {"after":"wreck-search","destination":"mourning-line","id":"wreck-registry","step":"salvage-black-box","text":"The Salvage Union records where each piece was found. Without those records, it would be almost impossible to tell which ship it came from."},
    {"after":"wreck-registry","destination":"mourning-line","id":"wreck-radio","step":"salvage-black-box","text":"The carrier recorded the shared radio channel. If its recorder is still readable, we may hear more than its own crew's final words."},
    {"after":"wreck-radio","destination":"mourning-line","id":"wreck-care","step":"salvage-black-box","text":"We only take what we can recover safely. Another accident would help nobody here."},
    {"after":"cairn-berth","destination":"cairn","id":"cairn-crews","step":"dock-cairn","text":"Cairn lives off its salvage crews. Many of the mechanics also work out among the wrecks. They notice fairly quickly when someone leaves part of a story out."},
    {"after":"cairn-crews","destination":"cairn","id":"cairn-record","step":"dock-cairn","text":"Leave the recording as it is for now. I have filled in so many gaps in my head that I need to be careful about what I actually heard."},
    {"after":"gate-convoy","destination":"verge-meridian-point","id":"gate-records","step":"cross-meridian-gate","text":"Clearance does not prove a ship arrived. We will need to compare the departure lists with the arrival records."},
    {"after":"gate-records","destination":"verge-meridian-point","id":"gate-trade","step":"cross-meridian-gate","text":"Meridian processes much of what is mined here. Machinery and electronics come back the other way. The gates connect more than star systems."},
    {"after":"gate-trade","destination":"verge-meridian-point","id":"gate-family","step":"cross-meridian-gate","text":"I am glad you are here today. On my own, I would probably have found another reason not to look."},
    {id:'vesper-drive', step:'fly-vesper', destination:'vesper', cue:'hyperdrive',
        text:'You are lined up with Vesper. Engage HYPERDRIVE when you are ready; I will stay with you.'},
    {id:'vesper-approach', step:'fly-vesper', destination:'vesper', cue:'arrival',
        text:'That is Vesper ahead. Keep it selected and ease the throttle forward. The landing system takes over as you approach.'},
    {id:'vesper-food', step:'fly-vesper', destination:'vesper',
        text:'Vesper keeps adding new habitats, but its farms cannot feed everyone yet. That is why Mara sends protein out here.'},
    {id:'vesper-home', step:'fly-vesper', destination:'vesper', after:'vesper-food',
        text:'Our mother used to bring us back sweets from these runs. Mara always knew. Apparently, hiding cargo from your aunt takes more skill than flying it.'},
    {id:'belt-route', step:'mine-shardbelt', destination:'shardbelt',
        text:'Our mother taught me to read this belt. Watch the rocks turning as we approach; the gaps move with them.'},
    {id:'belt-living', step:'mine-shardbelt', destination:'shardbelt', after:'belt-route',
        text:'Cairn buys ore from small crews like ours. Learning to work the belt gives you a way to pay for fuel when the trade prices are poor.'},
    {id:'wreck-names', step:'salvage-black-box', destination:'mourning-line',
        text:'People still come to Mourning Line looking for a name or a flight record. Not everyone who lost someone had a ship to search from.'},
    {id:'wreck-search', step:'salvage-black-box', destination:'mourning-line', after:'wreck-names',
        text:'A salvage crew sent me the carrier’s markings last week. I recognised them. That is why I wanted us to take this route together.'},
    {id:'cairn-berth', step:'dock-cairn', destination:'cairn',
        text:'Mara found me a berth at Cairn after the evacuation. She never asked me to pay her back. I should have given her an honest account, at least.'},
    {id:'gate-convoy', step:'cross-meridian-gate', destination:'verge-meridian-point',
        text:'The evacuation ships all had to pass through this gate. The traffic ledger should say who was cleared to cross, and who was still waiting.'},

];

// Public regional traffic continues world-building after the prologue.
// Every transmission is heard once per career and remains in the transcript.
export const TRAVEL_RADIO = [
    {
        "id": "helios-harvest",
        "speaker": "Helix traffic control",
        "system": "helios-verge",
        "text": "Freighters from Azure Reach are being handled at the outer docks. The new harvest has arrived. Please keep the approach clear for refrigerated containers."
    },
    {
        "id": "helios-shifts",
        "speaker": "Vesper local radio",
        "system": "helios-verge",
        "text": "The late shift at the smelters will start an hour later. The port asks arriving crews to report repair needs before unloading."
    },
    {
        "id": "helios-tags",
        "speaker": "Salvage Union radio",
        "system": "helios-verge",
        "text": "Anyone finding personal belongings in the wreck field should record the location. Families are still searching for traces of missing crew members."
    },
    {
        "id": "helios-repairs",
        "speaker": "Cairn local radio",
        "system": "helios-verge",
        "text": "Our workshop asks for patience. Two salvage ships have reported damaged coolant lines. Parts recovered from old wrecks are checked individually before fitting."
    },
    {
        "id": "helios-trade",
        "speaker": "Merchant radio",
        "system": "helios-verge",
        "text": "A note for new traders: strong demand does not guarantee a profit. Compare your purchase price with the destination's offer before filling the hold."
    },
    {
        "id": "helios-names",
        "speaker": "Salvage Union radio",
        "system": "helios-verge",
        "text": "Cairn's book of remembrance remains open to visitors. Anyone wishing to add a name can contact the port office."
    },
    {
        "id": "meridian-yard",
        "speaker": "Argent traffic control",
        "system": "meridian",
        "text": "Yard traffic has priority in the test corridor. The new frigates are testing braking manoeuvres today. Even a ship that looks slow can need plenty of room."
    },
    {
        "id": "meridian-cargo",
        "speaker": "Merchant radio",
        "system": "meridian",
        "text": "Argent does not only process fresh ore. Sorted scrap from the outer colonies goes straight back into production. Some ships are older than their build dates suggest."
    },
    {
        "id": "meridian-customs",
        "speaker": "Concord traffic control",
        "system": "meridian",
        "text": "Please keep your transponder on during approach. Customs matches your identity with your cargo. A missing identity does not shorten the inspection."
    },
    {
        "id": "meridian-city",
        "speaker": "Meridian local radio",
        "system": "meridian",
        "text": "The outer residential rings remain dependent on freight deliveries. The administration asks for water and medical shipments to be handled first."
    },
    {
        "id": "redwake-pump",
        "speaker": "Cinder local radio",
        "system": "redwake",
        "text": "The replacement pump is on its way. Until it is fitted, the refinery is running at reduced output. The workshop asks crews to set usable seals aside from other scrap."
    },
    {
        "id": "redwake-cost",
        "speaker": "Merchant radio",
        "system": "redwake",
        "text": "A cheap offer at Blackglass may need an expensive escort. Work out the cost of the whole route before accepting."
    },
    {
        "id": "redwake-parts",
        "speaker": "Cinder local radio",
        "system": "redwake",
        "text": "Water filters and replacement valves are still needed. The new residential sections are finished, but their doors stay closed until supplies arrive."
    },
    {
        "id": "pale-survey",
        "speaker": "Nacre survey radio",
        "system": "pale-ring",
        "text": "Survey ships report changing passages through the dense ring bands. Older coordinates are only a guide. Leave room around drifting ice on approach."
    },
    {
        "id": "pale-clinic",
        "speaker": "Boreal local radio",
        "system": "pale-ring",
        "text": "The clinic has requested more refrigerated containers. Medical shipments can only be accepted with their transport seals intact."
    },
    {
        "id": "pale-water",
        "speaker": "Merchant radio",
        "system": "pale-ring",
        "text": "Boreal has water in abundance. The difficult part is processing and shipping it. Every full tank represents weeks of work beneath the ice."
    }
];
