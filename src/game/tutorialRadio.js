// Route-specific transmissions use the ordinary radio bar and never pause flight.
// IDs are saved with the quest so returning to a route does not repeat a line.
// Kept deliberately sparse: a wingman on comms drops short remarks, not
// lectures — the objective panel carries the step-by-step instructions.
export const TUTORIAL_RADIO = [
    {"id":"vesper-food","step":"fly-vesper","destination":"vesper","text":"Vesper keeps growing faster than its farms can follow. That is why Mara sends protein out here."},
    {"after":"vesper-food","destination":"vesper","id":"vesper-home","step":"fly-vesper","text":"Our mother always brought us sweets back from this run. Mara still found every one of them."},
    {"after":"vesper-home","destination":"vesper","id":"vesper-price","step":"fly-vesper","text":"Vesper has ore to spare and food to spare for nobody. A good trade starts with listening."},
    {"after":"vesper-price","destination":"vesper","id":"vesper-docks","step":"fly-vesper","text":"The first habitats stood right beside the landing pads. That is why the market is still at the port."},
    {"id":"vesper-drive", step:'fly-vesper', destination:'vesper', cue:'hyperdrive',
        text:'You are lined up with Vesper. Engage HYPERDRIVE when you are ready.'},
    {"id":"vesper-approach", step:'fly-vesper', destination:'vesper', cue:'arrival',
        text:'Vesper dead ahead. Keep it selected and ease in slowly – the ship handles the landing.'},
    {"after":"belt-living","destination":"shardbelt","id":"belt-mother","step":"mine-shardbelt","text":"Our mother never threw anything away. A broken pump became a flowerpot – Mara still keeps it behind the bar."},
    {"after":"belt-route","destination":"shardbelt","id":"belt-living","step":"mine-shardbelt","text":"Cairn buys ore from small crews like ours. It pays for fuel when a trade is not worth taking."},
    {"id":"belt-route", step:'mine-shardbelt', destination:'shardbelt',
        text:'Our mother taught me this belt. The gaps drift with the rocks.'},
    {"after":"wreck-names","destination":"mourning-line","id":"wreck-radio","step":"salvage-black-box","text":"The carrier recorded the shared radio channel. If the recorder is still readable, we may hear more than the final words."},
    {"id":"wreck-names", step:'salvage-black-box', destination:'mourning-line',
        text:'People still come to Mourning Line looking for a name or a flight record.'},
    {"after":"cairn-berth","destination":"cairn","id":"cairn-record","step":"dock-cairn","text":"Leave the recording as it is for now. I need to be sure of what I actually heard."},
    {"id":"cairn-berth", step:'dock-cairn', destination:'cairn',
        text:'Mara found me this berth at Cairn after the evacuation. I never gave her an honest word for it.'},
    {"id":"gate-depart", step:'galaxy-map', destination:'cairn', speaker:'Rin Vek',
        text:'The Second Light just cleared the traffic lane. Her drive signature is already fading – good travel, sister.'},
    {"id":"helios-gate-worry", step:'cross-meridian-gate', destination:'verge-meridian-point', speaker:'Mara Vek',
        text:'No word from Rin since the gate. Fly safe out there – and call me the moment you hear from her.'},
];

// Public regional traffic continues world-building after the prologue.
// Every transmission is heard once per career and remains in the transcript.
// Kept short and idiomatic — traffic control talks in clipped routines, not
// essays.
export const TRAVEL_RADIO = [
    {
        "id": "helios-harvest",
        "speaker": "Helix traffic control",
        "system": "helios-verge",
        "text": "Refrigerated containers on the approach. Outer docks are handling the Azure Reach freighters — keep the lane clear."
    },
    {
        "id": "helios-tags",
        "speaker": "Salvage Union radio",
        "system": "helios-verge",
        "text": "Personal effects found in the field: log the location. Families are still looking for traces."
    },
    {
        "id": "helios-trade",
        "speaker": "Merchant radio",
        "system": "helios-verge",
        "text": "Note for new traders: strong demand is not a profit. Compare the buy price with what the destination pays before you load."
    },
    {
        "id": "helios-names",
        "speaker": "Cairn local radio",
        "system": "helios-verge",
        "text": "The book of remembrance stays open. Adding a name goes through the port office."
    },
    {
        "id": "meridian-yard",
        "speaker": "Argent traffic control",
        "system": "meridian",
        "text": "Yard traffic has priority in the test corridor. Frigates are braking today — give them room."
    },
    {
        "id": "meridian-customs",
        "speaker": "Concord traffic control",
        "system": "meridian",
        "text": "Transponders on during approach. No identity, no fast inspection."
    },
    {
        "id": "meridian-city",
        "speaker": "Meridian local radio",
        "system": "meridian",
        "text": "Outer rings are waiting on freight. Water and medical shipments first, please."
    },
    {
        "id": "redwake-pump",
        "speaker": "Cinder local radio",
        "system": "redwake",
        "text": "Replacement pump is inbound; refinery is on reduced output. Set usable seals aside from scrap."
    },
    {
        "id": "redwake-cost",
        "speaker": "Merchant radio",
        "system": "redwake",
        "text": "A cheap Blackglass offer may want an expensive escort. Price the whole route before you take it."
    },
    {
        "id": "pale-survey",
        "speaker": "Nacre survey radio",
        "system": "pale-ring",
        "text": "Passages through the ring bands keep shifting. Old coordinates are a guide, not a promise."
    },
    {
        "id": "pale-clinic",
        "speaker": "Boreal local radio",
        "system": "pale-ring",
        "text": "Clinic needs refrigerated containers. Medical shipments accepted only with transport seals intact."
    },
];
