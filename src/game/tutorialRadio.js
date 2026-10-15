// Route-specific transmissions use the ordinary radio bar and never pause flight.
// IDs are saved with the quest so returning to a route does not repeat a line.
// Kept deliberately sparse: a wingman on comms drops short remarks, not
// lectures — the objective panel carries the step-by-step instructions.
export const TUTORIAL_RADIO = [
    {id:'vesper-food',step:'fly-vesper',destination:'vesper',text:'Vesper needs food. Your own cargo, your own profit.'},
    {id:'belt-route',step:'mine-shardbelt',destination:'shardbelt',text:'Select the deposit and let it scan. Your miners return automatically before hyperdrive.'},
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
