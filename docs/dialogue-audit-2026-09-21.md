# Dialogue, comms and bar text — audit (2026-09-21)

A pass over every player-facing spoken line: the family prologue, the bar
contacts at every port, tutorial briefings and radio, combat comms, mission and
radio copy, and the German catalog underneath all of it.

Starting complaint: the writing reads oddly, "like some humor or the story
setup". This documents what is actually wrong, what was fixed, and what is
deliberately left open.

## Corpus

| source | volume | where the player meets it |
|---|---|---|
| `adventureDialogues.js` | 12 conversations, ~120 nodes, EN+DE inline | prologue briefings, family scenes, Cairn confession |
| `data.js` / `galaxyContent.js` `people[].lines` | 36 contacts × 3 lines | bar at every port |
| `ui.js` `dialogueResponse` | 6 topic templates (work, trade tip, guild, local, advice, greeting) | bar topics |
| `tutorialCampaign.js` | 20 step objectives/details, 5 flight lessons | objective panel, always on screen |
| `tutorialRadio.js` | 15 wingman + 11 regional transmissions | comms bar in flight |
| `game.js` `*_LINES` | ~120 lines | mugs, patrols, rescues, surrenders, hails |
| `pilots.js` `PILOT_LINES` | ~150 lines, 4 temperaments + ace | combat banter |
| `i18n-de.js` `DE_CATALOG` | 2659 keys | every line above, in German |

Combat comms are the strongest writing in the game and needed no work: the
temperament pools have distinct voices, name the action being taken, and stay
short. Nothing below applies to them.

## Fixed

### 1. The story never says what happened to the pilot's mother

The whole prologue mourns her — two keys left behind, "she would have loved to
see you both flying that ship" — and the Cairn confession explained the rescue
("our mother broke formation in the Wayfarer and took me aboard") and then moved
straight on to what the official report leaves out. Her fate was never stated,
so the emotional premise and the mystery were disconnected: the player was
chasing a ledger about a carrier without knowing what it had cost the family.

New node `cairn.loss`, offered as the first question in the confession:

> **DE** Sie brachte mich bis ans Tor und drehte wieder ab – zurück zu dem
> Träger, der noch hinter uns lag. Als ich durch war, hatte ich sie noch auf
> dem Funk. Danach nur die offizielle Meldung, und darin steht sie als die, die
> ohne Freigabe abgedreht ist.
>
> **EN** She carried me to the gate and turned around again – back toward the
> carrier still behind us. I still had her voice on the radio when I went
> through. After that, only the official report, and in it she is the one who
> turned away without clearance.

It also motivates the recorder: her voice *is* the last thing the pilot has.

### 2. The recorder decision contradicted the departure scene

`departure` always plays after the Cairn decision and has Rin jump ahead alone
("someone has to be at the ledger before another recorder disappears"). Two of
the three endings promised the opposite:

| ending | said | now |
|---|---|---|
| tell Mara | "send it, then we can leave" | unchanged, fits |
| trust Rin | "we will keep looking **together**" | "keep looking – I will follow" |
| keep recorder | "**come with me**, this is not settled" | "see you on Meridian" |

Rin's `keep` reply also promised "I will fly with you to Meridian if you want me
there" and now reads "I will fly ahead and keep an eye on the ledger until you
follow".

### 3. Mara's joke did not answer the question

Asking *"Did Rin at least ask for the other key?"* returned

> "Of course. Once the engine was running. In this family, that still counts as
> a formal application."

A non-answer, and the German "förmlicher Antrag" reads as a marriage proposal.
Now:

> **DE** Ja – als ihr klein wart, hat sie ständig danach gefragt. Jetzt hat sie
> einen eigenen Motor und fragt niemanden mehr.

### 4. Rin still stood in the Helix bar after she left

`removeTutorialActors()` cleared her ship, the campaign panel said she had gone
quiet at Meridian, and Mara's line was "no word from Rin since she jumped" — but
`LOCATIONS.helix.people` is static, so she was still standing at the bar with
three generic lines, one of which still taught basic flight controls.

The bar roster is now story-driven (`ui.js` `contactInPort()` / `barPeople()`),
the same shape as her Cairn appearance being conditional on the `family-choice`
step. She is filtered out once the story has sent her ahead: the `rinDeparted`
flag the departure scene sets, **or** the departure step itself, **or** a
finished prologue — so a save that already crossed the gate keeps her away even
if that flag did not survive a migration. A skipped prologue never sent her
anywhere, so she stays there; that is how a skipped career hears the story at
all. `talkToPerson` uses the same roster, so she is not reachable by name either.
Staying is not the same as flying along, though — see §8 for what she and Mara
may say to that career.

### 5. Two contacts gave the same advice word for word

Dr. Soraya Ames: *"Keep medical cargo sealed and avoid unnecessary fights; a
hull hit can cost the fragile-load bonus."* Tessa Rye: *"Keep the cold-chain
cases sealed; taking hull damage can cost the fragile-load bonus."* — the same
sentence with the mechanic restated. Tessa now speaks for herself: *"Medicine
travels at temperature or not at all. Take the long lane rather than risk a warm
case."*

### 6. Clunky German in the prologue briefings

| was | now |
|---|---|
| "Sprich mit Rin, falls du sie noch nicht hattest" | "…falls du das noch nicht getan hast" |
| "Das Schiff steht." | "Die Wayfarer ist bereit." |
| "Ran, warten bis der Scan sitzt" | "Flieg langsam heran und warte, bis der Scan durch ist" |
| "Danach schauen wir dort vorbei." | "Das sehen wir uns nach dem Abbau an." |
| "Sonst wäre da noch das Wrack…" | "Da wäre dann noch das Wrack…" |
| "Danke, dass du mich nicht wieder damit davonkommen lässt." | "Danke, dass du mich diesmal nicht damit durchkommen lässt." |

### 7. A second, contradictory telling of the prologue lived in the catalog

The German catalog still carried ~25 keys from a superseded draft — including
*"They changed the evacuation ledger. I let Mara believe it…"*, a forged-ledger
version of the Cairn confession that the current script deliberately replaced
with an *omitted* rescue transmission. Also old narration ("There you are. Easy
on the throttle. Keep the Second Light on your starboard"), old radio, and old
objective text ("The quote should show no purchase cost." — a QA note shipped as
player text).

Nothing referenced them, but they read as canon to anyone opening the file.
Removed, and a test now asserts they stay out.

### 8. The skipped-prologue retelling promised an escort and a delivery run

The `mara` and `rin` conversations are the prologue's introduction, and they
double as the retelling a skipped career falls back on (§4). Played there, half
of what they said was false: Mara sent the pilot to buy *two Protein Packs* for a
Vesper delivery that was never accepted, promised that *"Rin kennt die Strecke
und fliegt mit"*, and Rin opened with *"und bleibe an deinem Flügel"* and closed
on *"wenn die Ware an Bord ist, gehen wir kurz die Ausrüstung durch"*. Her two
barks on the same screen promised the same things ("I will keep off your firing
line", "Mara calls this a delivery run").

A node may now carry a `noPrologue` variant (plus `noPrologueLabel` on a
choice), applied by `adventureNode()` when `ui.prologueUnplayed()` is true —
that is, when the quest is missing or `flags.skipped` is set. Nothing was
deleted: a career that flew the prologue still hears the original word for word,
including in the replay. What the skipped frame hears instead:

| | prologue career | no prologue |
|---|---|---|
| Mara, "what do I do first" | buy two Protein Packs for Vesper | ore to Cairn, trade the market, work off the bar board |
| Mara, about Rin | "kennt die Strecke und fliegt mit" | "fliegt ihre eigenen Routen; sie hängt sich nicht an deinen Flügel" |
| Rin, opening at the bar | "und bleibe an deinem Flügel" | "jede mit eigener Route. Ich bleibe vorerst hier" |
| Rin, "how does the delivery work" | the two-crate route | "Cairn kauft Erz …, das Rennbüro zahlt ohne Auftrag" |
| Rin, barks (advice / news) | monitor lesson, "this delivery run" | transponder and hold advice; "frag Mara, warum jetzt" |
| completion lines | "Ich besorge die Ware. Wir sehen uns draußen." | "Gut. Ich fliege erst einmal allein." |

Rin's bark set is a second field on the contact (`linesNoPrologue`, same three
slots), chosen by `dialogueResponse()` under the same predicate. The reused
`delivery` node is now `first-steps`, since it carries one text for a delivery
and another for a career that has none.

A test walks both conversations the way a player does — questions once asked
stay asked, which is what unlocks the gated ones — and asserts no prologue-only
sentence survives into the skipped frame, while the same sentences are all still
present for a career that flew it.

## Findings left open

### The bar has one voice, by construction

Every one of the 36 contacts has exactly three lines in exactly three slots —
greeting, advice, local news — and `dialogueResponse` always returns the same
line for the same slot. A bartender, a customs liaison, a clinic director and a
pirate captain all speak the same clipped, wry, second-person register, and the
greeting repeats verbatim on every visit forever. The news lines are the worst
of it: 11 of 36 end in "…again / late / behind schedule", and nearly all are a
two-clause trade rumour ("X is up, while Y is late").

The catalog suggests this was not always so. Whole extra lines per contact
survive in German and were cut from the English data — **177 dead prose entries**
in total, including:

- "A trader who flies predictable lanes is a trader who buys pirates dinner."
- "Armor keeps the shape of a ship. Shields keep its options."
- "Missiles are for commitments. Guns are for questions."
- "Your Wayfarer will forgive one bad decision. The second one goes on my invoice."
- "Rookhaven pays well for medicine, but their inspectors count every seal twice."
- "Guild rank buys information before it buys privilege."

Only the German survives, so restoring them means writing the English again —
which is why this is a proposal rather than a change: give each contact a longer
greeting pool and pick from it by `npcMemory.topics.greeting`, and the
repetition problem dissolves without touching the topic contract.

### Catalog hygiene

`node scripts/audit-dialogue-catalog.mjs` (added with this audit) reports the
current state, and can list the entries underneath each number:

```
catalog keys: 2659
no source reference: 503
live strings with no German: 12
entries only matching after punctuation normalisation: 0
```

So roughly a fifth of the catalog matches no source string, 177 of those full
sentences. The scan is static, so a key assembled at runtime reads as dead —
spot-check before deleting. The superseded prologue block is gone; the rest is
mechanical debt, and it is also the archive of the cut NPC lines above.

### Live English with no German

Only 12 strings: ten observer/arena UI labels (`SELECT`, `PAUSE`, `Teams`,
`Details`, …), `FIRE`, `{seconds}s`, and two HUD readouts (`PDC DRONE EMPTY ·
RETURNING`, `DEPOSIT EXHAUSTED · ORE INBOUND`). No punctuation drift at all.
Dialogue and comms coverage is otherwise complete — worth saying plainly,
because it is easy to assume the opposite from half a thousand dead keys.

## Checks

- `tests/adventure-dialogue.test.mjs`: 14 tests. Four are new and each fails
  against the pre-fix shape (verified by temporarily restoring the old `keep`
  promise and dropping the bar filter — they failed with
  `confession · Ich vertraue dir…` and the bar assertion).
  - the Cairn confession must account for the mother
  - no recorder ending may promise Rin's company
  - Rin must leave the Helix bar once `rinDeparted` is set, and stay for a
    skipped prologue
  - the superseded prologue draft must stay out of the German catalog
- `tests/localization-travel.test.mjs`: German coverage for every contact role
  and line still holds after the Tessa rewrite.
- `probe-station-navigation.mjs`: 162/162, exit 0.
- `npm test`: 507 tests, 491 pass, 16 fail — the identical pre-existing
  combat-sim set (PDC/beam/ion/piloting), unchanged by this pass.
- Live check in the phone harness: the Cairn confession now offers
  "Und danach? Sie kam nicht mit dir zurück." and its answer renders in German;
  with `rinDeparted` set the Helix bar lists Mara, Oskar and Sana instead of
  Mara, Rin, Oskar and Sana.
