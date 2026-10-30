import test from 'node:test';
import assert from 'node:assert/strict';
import {SHIPS, CONCORD_CAPITAL_CLASSES} from '../../src/game/data.js';
import {RACE_HULLS} from '../../src/game/raceHulls.js';
import {ADVENTURE_DIALOGUES, dialogueText} from '../../src/game/adventureDialogues.js';
import {TUTORIAL_STEPS} from '../../src/game/tutorialCampaign.js';
import {paintPatternsForHull} from '../../src/game/paintDesign.js';
import {setLanguage, t} from '../../src/game/i18n.js';
import {createNewSave, hydrateSave} from '../../src/game/save.js';
import {commitShipTrade, quoteShipTrade} from '../../src/game/shipTrade.js';
import {fixture} from '../helpers/session.mjs';
import {tutorialFixture} from '../helpers/tutorial.mjs';
import {LOCATIONS} from '../../src/game/data.js';

test('renamed models preserve saved hull IDs and race frames use their base model name', () => {
    const names = Object.values(SHIPS).map(ship => ship.name);
    assert.equal(new Set(names).size, names.length, 'each model can be identified by name');
    for (const [id, frame] of Object.entries(RACE_HULLS))
        assert.equal(frame.name, `${SHIPS[id].name} R`, id);
    const save = createNewSave(431, {tutorial:false});
    save.player.credits = 500000;
    assert.ok(commitShipTrade(save.player, quoteShipTrade(save.player, 'talon', {keepCurrent:true})).ok);
    const restored = hydrateSave(JSON.parse(JSON.stringify(save)));
    assert.equal(restored.player.shipId, 'talon');
    assert.deepEqual(new Set(restored.player.ownedShips), new Set(['wayfarer', 'talon']));
    assert.equal(SHIPS[restored.player.shipId].name, 'Mercury');
    assert.equal(CONCORD_CAPITAL_CLASSES.frigate, 'Janus');
});

test('story, model names and paint labels agree in German and English', () => {
    for (const lang of ['de', 'en']) {
        setLanguage(lang);
        const opening = dialogueText(ADVENTURE_DIALOGUES.mara.nodes.welcome.text, lang);
        assert.match(opening, /Wanderer/);
        assert.ok(opening.includes(SHIPS.wayfarer.name), 'family vessel and model are both identified');
        assert.match(dialogueText(ADVENTURE_DIALOGUES.rin.nodes.ready.text, lang), /Valkyrie/);
        const paul = dialogueText(ADVENTURE_DIALOGUES['paul-rescue'].nodes.thanks.text, lang);
        assert.ok(paul.includes(SHIPS.torsas.name), 'Paul identifies his transport model');
        const objective = t(TUTORIAL_STEPS['rescue-paul'].objective);
        assert.ok(objective.includes(SHIPS.scrapper.name), 'objective names the actual pirate model');
        for (const id of ['talon', 'torsas', 'scrapper']) {
            const namedPattern = paintPatternsForHull(id).find(pattern => pattern.name.startsWith(SHIPS[id].name));
            assert.ok(namedPattern, id);
            if (lang === 'de') assert.notEqual(t(namedPattern.name), namedPattern.name, `${id} paint translation`);
        }
    }
    setLanguage('de');
});

test('tutorial companion spawns use the new vessel names', () => {
    for (const [step, person, name] of [['defeat-raider', 'rin', 'Rin Vek · Valkyrie'], ['rescue-paul', 'paul', 'Paul · Memento']]) {
        const {session, save} = tutorialFixture(step);
        save.player.dockedAt = undefined;
        save.player.position = [...LOCATIONS['mourning-line'].position];
        session.activeInstanceId = 'mourning-line';
        session.ensureTutorialCompanion(true);
        assert.equal(session.ships.find(ship => ship.storyPersonId === person)?.name, name);
    }
});

test('traffic has distinct deterministic vessel names while authored names and pirate callsigns survive', () => {
    const sequence = session => [
        session.spawnShip('trader', [0,0,0], undefined, undefined, undefined, {faction:'independents'}),
        session.spawnShip('miner', [0,0,0], undefined, undefined, undefined, {faction:'independents'}),
        session.spawnShip('patrol', [0,0,0], undefined, undefined, undefined, {faction:'concord'}),
        session.spawnShip('patrol', [0,0,0], undefined, undefined, undefined, {faction:'alliance'}),
        session.spawnShip('pirate', [0,0,0], undefined, undefined, undefined, {faction:'pirates'}),
        session.spawnShip('trader', [0,0,0], undefined, 'Memento', undefined, {faction:'independents'}),
    ];
    const a = sequence(fixture()), b = sequence(fixture());
    assert.deepEqual(a.map(ship => [ship.name, ship.hullId, ship.portraitIndex, ship.velocity]),
        b.map(ship => [ship.name, ship.hullId, ship.portraitIndex, ship.velocity]));
    assert.equal(new Set(a.map(ship => ship.name)).size, a.length);
    assert.match(a[0].name, /^MV [A-Za-z]/);
    assert.match(a[1].name, /^MV [A-Za-z]/);
    assert.match(a[2].name, /^CPV [A-Za-z]/);
    assert.match(a[3].name, /^ALV [A-Za-z]/);
    assert.match(a[4].name, /“[^”]+”/, 'pirate pilots retain their callsigns');
    assert.equal(a[5].name, 'Memento');
});

test('a reusable vessel name cannot be mistaken for a remembered hostile pilot', () => {
    const first = fixture();
    first.save.player.reputation.alliance = -50;
    first.resolveHyperdriveIntercept = () => {};
    first.ejectCargo = () => {};
    first.transferCredits = () => {};
    first.chatterOpen = () => false;
    const pilot = first.spawnShip('patrol', [0,0,0], undefined, undefined, undefined, {faction:'alliance'});
    pilot.aiRng = () => 0;
    first.surrenderShip(pilot);
    assert.ok(first.save.world.surrenderedTo[pilot.recognitionName]);
    assert.equal(first.save.world.surrenderedTo[pilot.name], undefined);

    const returning = fixture();
    returning.save.player.reputation.alliance = -50;
    returning.save.world.surrenderedTo = {...first.save.world.surrenderedTo};
    assert.equal(returning.spawnShip('patrol', [0,0,0], undefined, undefined, undefined, {faction:'alliance'}).recognizesPlayer, true);

    const unrelated = fixture();
    unrelated.save.player.reputation.alliance = -50;
    unrelated.save.world.surrenderedTo = {[pilot.name]:'captured'};
    assert.equal(unrelated.spawnShip('patrol', [0,0,0], undefined, undefined, undefined, {faction:'alliance'}).recognizesPlayer, false);
});
