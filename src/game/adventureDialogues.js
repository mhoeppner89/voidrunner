import {interfaceText} from './i18n.js';
const pair=(de,en)=>({de,en});
export const dialogueText=(value,language)=>interfaceText(typeof value==='string'?value:value?.[language]??value?.en??'',language);
const end=(de='Alles klar.',en='All right.')=>({label:pair(de,en),complete:true});
export const ADVENTURE_DIALOGUES={
    mara:{start:'welcome',nodes:{
        welcome:{text:pair("Da bist du. Deine Mutter ist die \"Wanderer\" geflogen, eine Hestia. Ich habe den Schlüssel für dich aufgehoben.","There you are. Your mother flew the \"Wanderer\", a Hestia. I kept the key for you."),next:'work'},
        work:{text:pair("Das Schiff gehört dir. Für deinen ersten Flug hätte ich eine Idee, um etwas Geld zu verdienen: Protein ist hier auf Helix günstig und wird auf Vesper gebraucht. Die Ladung macht dein Schiff etwas träger als sonst, aber der Gewinn ist es definitv wert.","The ship is yours. I have an idea for earning some money on your first flight: Protein is cheap here on Helix, and Vesper needs it. The cargo will make your ship a little more sluggish than usual, but the profit is definitely worth it."),noPrologue:{text:pair("Das Schiff gehört dir. Unter {ui.trade} kannst du günstig einkaufen und dort verkaufen, wo die Ware gebraucht wird. In der Bar kannst du Aufträge annehmen, um Geld zu verdienen.","The ship is yours. Under {ui.trade}, you can buy goods cheaply and sell them where they are needed. You can take contracts in the bar to earn money.")},next:'rin'},
        rin:{text:pair('Passt auf euch auf!','Take care of yourselves!'),noPrologue:{text:pair("Rin fliegt ihre eigenen Routen. Frag sie, wenn du etwas über die \"Wanderer\" wissen möchtest.","Rin flies her own routes. Ask her if you want to know anything about the \"Wanderer\".")},choices:[end("Machen wir, keine Sorge.","We will, do not worry.")]},
    }},
    rin:{start:'ready',nodes:{
        ready:{text:pair("Die \"Wanderer\" ist startklar. Unsere Mutter hat gut auf sie aufgepasst. Du nimmst ihre Maschine, ich die \"Valkyrie\".","The \"Wanderer\" is ready. Our mother took good care of her. You take her ship; I will fly the \"Valkyrie\"."),next:'trade'},
        trade:{text:pair("Um mit Handel Geld zu verdienen, geh zum {ui.market} und wähle {ui.trade}. Wähle Protein und {ui.buyMax}. Vor dem Kauf siehst du Menge und Kosten. Ich fliege mit dir, damit auch nichts schief geht.","To earn money trading, go to {ui.market} and choose {ui.trade}. Select Protein and {ui.buyMax}. You can see the quantity and cost before you buy. I will fly with you to make sure nothing goes wrong."),noPrologue:{text:pair("Du kannst handeln, Erz abbauen oder Aufträge aus der Bar übernehmen. Viel Spaß!","You can trade, mine ore or take contracts from the bar. Have fun!")},choices:[
            {label:pair("Hast du etwas Neues über unsere Eltern herausgefunden?","Have you found out anything new about our parents?"),next:'parents'},{label:pair('Alles klar, ich kaufe die Ladung.','All right, I will buy the cargo.'),next:'legal',noPrologueLabel:pair('Wir sehen uns draußen.','See you outside.')}
        ]},
        legal:{text:pair("Bleib für den Anfang beim Protein. Die rot markierte Waffenfracht unter {ui.trade} ist Schmuggelware — damit riskierst du Ärger bei einer Kontrolle durch die Concord-Patrouillen.","Stick to Protein for now. Weapons cargo marked red under {ui.trade} is contraband — carrying it could get you into trouble if a Concord patrol inspects you."),noPrologue:{text:pair("Waffen sind als Fracht ist unter {ui.trade} rot markiert, weil ihr Transport illegal ist.","Weapons carried as cargo are marked red under {ui.trade} because transporting them is illegal.")},choices:[end("Bis gleich.","See you in a bit.")]},
        parents:{text:pair("Noch nichts Sicheres. Ich prüfe ein paar alte Vermisstenlisten. Erst sorgen wir dafür, dass du mit der Wanderer fliegen und Geld verdienen kannst. Wird Zeit, dass du selbstständig wirst!","Nothing certain yet. I am checking some old missing-person records. First, let us make sure you can fly and earn a living with the Wanderer. Time you learned to stand on your own!"),returnTo:'trade'},
    }},
    'cargo-ready':{start:'launch',nodes:{
        launch:{text:pair('Die Ladung ist an Bord. Geh zurück zur DOCKHALLE und wähle dort dein Schiff zum Start. Ich treffe dich draußen.','The cargo is aboard. Return to the DOCK HALL and select your ship to launch. I will meet you outside.'),choices:[end("Okay, ich mache mich startklar.","Okay, I will get ready to launch.")]},
    }},
    'reactor-ready':{start:'bar',nodes:{
        bar:{text:pair("Der Reaktor läuft, gut gemacht. Komm zu mir in die Bar; ich habe einen Auftrag für uns.","The reactor is running. Well done. Come meet me in the bar; I have a job for us."),choices:[end('Bis gleich.','See you there.')]},
    }},
    'mining-return':{start:'bar',nodes:{
        bar:{text:pair("Gut geflogen. Der Abbauauftrag ist ausbezahlt. Füll vor dem nächsten Start deinen Tank: Öffne {ui.services} und wähle bei „{ui.fuel}“ {ui.refill}. Danach komm zu mir in die Bar; ich habe noch etwas für dich.","Good flying. The mining contract has paid out. Fill your tank before the next flight: open {ui.services} and choose {ui.refill} under {ui.fuel}. Then come meet me in the bar; I have something else for you."),choices:[end("Alles klar, bis gleich.","All right, see you in a bit.")]},
    }},
    'mara-cairn':{start:'call',nodes:{
        call:{text:pair('Rin ist zurück und hat eine Spur zu euren Eltern. Sie wartet im {ui.raceDesk} auf Cairn Yard. Flieg hin und sprich mit ihr.','Rin is back with a lead on your parents. She is waiting at the {ui.raceDesk} on Cairn Yard. Fly there and speak with her.'),choices:[end('Ich fliege nach Cairn.','I will head to Cairn.')]},
    }},
    'vesper-arrival':{start:'landing',nodes:{
        landing:{text:pair('Da wären wir. Wie war dein erster Flug?','Here we are. How was your first flight?'),choices:[
            {label:pair('Lief ganz gut.','It went pretty well.'),next:'smooth'},
            {label:pair("Das war gewöhnungsbedürftig.","That took some getting used to."),next:'rough'}
        ]},
        smooth:{text:pair('Hat auch so ausgesehen. Jetzt machen wir aus deiner Ladung den ersten Gewinn.','It looked that way too. Now let us turn your cargo into your first profit.'),next:'market'},
        rough:{text:pair("Das kommt mit der Übung. Du bist heil angekommen, und die Ladung auch - also alles gut. Jetzt lass uns das Protein verkaufen.","That comes with practice. You made it here safely, and so did the cargo — so all is well. Now let us sell the Protein."),next:'market'},
        market:{text:pair('Öffne den {ui.market} und wähle {ui.trade}. Wähle Protein aus deiner Fracht und tippe auf {ui.sellAll}. Du siehst vorher, wie viel du dafür bekommst.','Open {ui.market}, then {ui.trade}. Select Protein from your cargo and choose {ui.sellAll}. You can see what you will earn before confirming.'),choices:[end("Alles klar, ab zum Markt.","All right, off to the market.")]},
    }},
    'reactor-gift':{start:'gift',nodes:{
        gift:{text:pair("Dein erster Gewinn! Ich habe noch einen Ersatz-Reaktor hier im Lager. In deinem Schiff bringt der sicher mehr als wenn er hier einstaubt — du kannst ihn haben. Damit lädt sich deine Energiereserve schneller auf.","Your first profit! I still have a spare reactor in storage here. It will surely do more good in your ship than gathering dust here — you can have it. It will recharge your energy reserves faster."),next:'fitting'},
        fitting:{text:pair("Öffne {ui.equipment} am {ui.market}, dann {ui.storage}. Unter {ui.trade} erreichst du sie oben über {ui.equipment}. Wähle das Reaktorupgrade und tippe auf {ui.install}. Ein freier passender Platz wird vorgeschlagen. Der Ein- oder Ausbau eines eigenen Teils kostet nichts.","Open {ui.equipment} at {ui.market}, then {ui.storage}. From {ui.trade}, use {ui.equipment} at the top. Select the reactor upgrade and choose {ui.install}. A free compatible mount is suggested. Installing or removing a part you own is free."),choices:[end("Ich baue es gleich ein.","I will install it right away.")]},
    }},
    mining:{start:'profit',nodes:{
        profit:{text:pair("Mit dem neuen Reaktor bist du gut ausgerüstet. Hast du Lust auf einen Auftrag? Dafür musst du keine Ware einkaufen.","The new reactor has you well equipped. Interested in a job? There is no cargo to buy first."),next:'contract'},
        contract:{text:pair("Öffne die {ui.missionBoard} hier in der Bar. Wähle den Abbauauftrag und {ui.accept}. Er verlangt sechs Einheiten aus der markierten Lagerstätte in der Shattered Crown. Bring sie zurück nach Vesper, dann bringt dir das 3.000 cr. Das ist schonmal nicht schlecht und wenn du noch mehr abbaust, kannst du das am Markt verkaufen.","Open the {ui.missionBoard} here in the bar. Select the mining contract and {ui.accept}. It requires six units from the marked Shattered Crown deposit. Bring them back to Vesper and you will get 3,000 cr. That is a decent start, and if you mine more, you can sell the extra at the market."),next:'drones'},
        drones:{text:pair("Ich komme wieder mit. Deine Abbaudrohne ist schon an Bord. Am markierten Felsen startest du sie mit {ui.mine}, am Computer M. Sie bringt das Erz in deinen Frachtraum. Beim Start des Hyperdrives kehren sie automatisch zurück, also keine Sorge.","I will come along again. Your mining drone is already aboard. At the marked rock, launch it with {ui.mine}, or M on desktop. It brings ore into your hold. When you engage hyperdrive, they return automatically, so do not worry."),choices:[end('Ich nehme den Vertrag an.','I will accept the contract.')]},
    }},
    combat:{start:'scrapper',nodes:{
        scrapper:{text:pair("Nur eine Balor - davon lassen wir uns nicht einschüchtern. Die schaffst du. Bleib in Bewegung und richte dein Visier auf sie. Ihre Schilde fangen einige Treffer ab; danach wird die Hülle beschädigt. Viele Piraten ergeben sich dann oft oder versuchen abzuhauen.","Just one Balor — we will not let it intimidate us. You can take it. Keep moving and bring it into your sights. Its shields absorb a few hits; after that, the hull takes damage. Many pirates will surrender or try to run once that happens."),next:'weapons'},
        weapons:{text:pair('Feuere am Computer mit der Leertaste, am Smartphone mit der Feuertaste. Lass den Abzug los, wenn deine Energie knapp wird.','Fire with Space on desktop, or the fire pad on your phone. Release the trigger when your energy runs low.'),next:'wing'},
        wing:{text:pair("Du führst den Angriff, ich geb dir Deckung und bleibe in der Nähe. Mit Y oder meiner Flügelkarte oben rechts wechselst du meine Befehle.","You lead the attack. I will cover you and stay close. Press Y or tap my wing card at the top right to change my orders."),choices:[end('Los geht’s.','Let’s do this.')]},
    }},
    surrender:{start:'stop',nodes:{
        stop:{text:pair('Er hat aufgegeben. Hör auf zu feuern.','He has surrendered. Stop firing.'),next:'capture'},
        capture:{text:pair('Lass ihn als Ziel ausgewählt und flieg näher heran, bis die Übernahme am Zielmonitor bereit ist. Drück dann M am Computer oder tippe auf die Übernahmetaste am Handy.','Keep him targeted and move closer until the target monitor says capture is ready. Then press M on desktop or tap the capture button on your phone.'),choices:[end('Verstanden.','Understood.')]},
    }},
    loot:{start:'find',nodes:{
        find:{text:pair('Gut gemacht! Ein grüner Raketenwerfer der Stufe I ist übrig. Grün heißt ungewöhnlich: Er hat einen Zusatzbonus. Die I ist seine Technikstufe.','Well done! A green tier I missile launcher survived. Green means uncommon: it has one bonus modifier. I is its technology tier.'),choices:[
            {label:pair('Was bedeuten die anderen Farben und Stufen?','What do the other colours and tiers mean?'),next:'rarity'},
            {label:pair('Wie sammle ich ihn ein?','How do I collect it?'),next:'recover'}
        ]},
        rarity:{text:pair('Weiß ist gewöhnlich, grün ungewöhnlich, blau selten. Grüne Teile haben einen Zusatzbonus, blaue zwei. Die Technikstufen I, II und III sind davon unabhängig: Höhere Stufen bieten mehr Leistung, brauchen aber meist mehr Energie.','White is common, green uncommon, blue rare. Green parts have one bonus modifier, blue parts two. Technology tiers I, II and III are separate: higher tiers offer more performance, but usually need more energy.'),returnTo:'find'},
        recover:{text:pair("Flieg direkt über die Beute, dann landet sie in deinem Frachtraum, sofern Platz ist. Ein Traktorstrahl-Upgrade könnte sie später automatisch aus der Entfernung einbeamen. Den Raketenwerfer kannst du nach der Landung in der Ausrüstung einbauen.","Fly directly over the loot and it will go into your hold, provided you have room. A tractor-beam upgrade could later beam it aboard automatically from a distance. You can install the launcher in Equipment after landing."),choices:[end('Ich sehe mir die Beute an.','I will take a look at the loot.')]},
    }},
    salvage:{start:'risk',nodes:{
        risk:{text:pair("Ich habe eine Aufgabe für dich in der Mourning Line. Kartiere bitte die Wracks, das könnte uns auf die Spur unserer Eltern bringen. Aber Achtung! Zwischen den Wracks sind auch Piraten unterwegs. Hier, nimm eine meiner PDC-Drohnen: Sie wehren anfliegende Geschosse automatisch ab.","I have a task for you in Mourning Line. Please chart the wrecks; it might help us find a lead on our parents. But be careful! Pirates roam among the wrecks too. Here, take one of my PDC drones: they automatically intercept incoming projectiles."),next:'fitting'},
        fitting:{text:pair("Öffne {ui.equipment} und wähle die PDC-Drohne in deiner Fracht. Baue sie in {ui.droneBay} 1 ein. Die Abbaudrohne bleibt in deinem Frachtraum; du kannst die Drohnen auch im Flug tauschen. Danach besprechen wir die Kartierung.","Open {ui.equipment} and select the PDC drone in your cargo. Install it in {ui.droneBay} 1. The mining drone stays in your hold; you can swap drones in flight too. Then we will go over the survey."),choices:[end("Gib mir einen Moment.","Give me a moment.")]},
    }},
    'survey-ready':{start:'survey',nodes:{
        survey:{text:pair("Alles eingebaut? Gut. Jetzt zur Kartierung: Flieg zur Mourning Line und nähere dich jedem markierten Wegpunkt auf unter 100 km an. Der Scan läuft dann automatisch. Wenn die Wracks weit auseinander sind, kannst du bei mehr als 2000 km Abstand auch deinen Hyperdrive nutzen.","Everything fitted? Good. Now for the survey: fly to Mourning Line and approach each marked waypoint within 100 km. The scan will run automatically. If the wrecks are far apart, you can also use your hyperdrive when they are more than 2,000 km away."),next:'farewell'},
        farewell:{text:pair("Die Wracks stammen von der verlorenen Concord-Flotte. Unsere Eltern verschwanden damals, aber ich gebe nicht auf und suche weiter nach ihnen. Diesmal fliegst du allein, also sei vorsichtig. Bring danach die Scans zu Mara auf Helix.","The wrecks are from the lost Concord fleet. Our parents disappeared back then, but I am not giving up; I will keep looking for them. This time you fly alone, so be careful. Take the scans to Mara on Helix afterwards."),choices:[
            {label:pair('Und wenn ich etwas aus einem Wrack bergen will?','What if I want to salvage something from a wreck?'),next:'salvage'},
            end('Alles klar. Bis bald, Rin.','All right. See you soon, Rin.')
        ]},
        salvage:{text:pair("Wähle ein Wrackteil aus und flieg nah genug heran; dann wird es automatisch gescannt und du siehst, was darin steckt. Beschieße es, um Fracht oder Schrott freizulegen, und flieg zum Einsammeln darüber. Für die Kartierung brauchst du das nicht. Aber pass auf: Mancher Schrott wurde bereits von anderen beansprucht.","Select a piece of wreckage and approach until it is scanned automatically; the scan shows what it contains. Shoot it to release cargo or scrap, then fly over the drops to collect them. You do not need to salvage anything for the survey. Be careful: some scrap has already been claimed by others."),returnTo:'farewell'},
    }},
    'paul-rescue':{start:'thanks',nodes:{
        thanks:{text:pair("Danke! Ohne dich wäre meine Freya jetzt ein weiteres Wrack. Paul ist mein Name, schön dich kennenzulernen.","Thank you! Without you, my Freya would be another wreck. I am Paul; nice to meet you."),next:'repairs'},
        repairs:{text:pair("Das sind Reperaturdrohnen. Die flicken meine und auch deine Hülle. Bleib dafür einfach innerhalb von 200 km von mir.","Those are repair drones. They patch my hull and yours too. Just stay within 200 km of me."),choices:[
            {label:pair("Was hast du da für Drohnen?","What kind of drones are those?"),next:'support'},
            {label:pair('Ich kartiere die Wracks hier.','I am charting the wrecks here.'),next:'route'}
        ]},
        support:{text:pair("Sie nutzen die Energie meiner Freya und versorgen zuerst mein Schiff, dann Verbündete in der Nähe.","They use my Freya’s energy and repair my ship first, then nearby allies."),returnTo:'repairs'},
        route:{text:pair('Du kartierst das Feld? Dann fliegen wir die übrigen Punkte zusammen ab. Den Träger kenne ich noch aus besseren Zeiten. Ich schulde dir ohnehin einen Gefallen.','You are surveying the field? Let us visit the remaining points together. I remember that carrier from better days. I owe you a favour anyway.'),choices:[end("Gut. Bleib an meiner Seite.","Good. Stay by my side.")]},
    }},
    'paul-hide':{start:'transponder',nodes:{
        transponder:{text:pair("Mist! Fünf Piraten, da haben wir keine Chance. Zeit abzutauchen. Falls dein Transponder noch an ist: Öffne den Schiffsmonitor links, wähle {ui.flight} und tippe auf die Taste, die gerade {ui.transponderOn} zeigt. Am Computer geht auch B. Ohne Transponder senden wir keine Identität und tauchen aus weiter Entfernung nicht auf ihrem Radar auf.","Damn! Five pirates; we do not stand a chance. Time to disappear. If your transponder is still on: open the left ship monitor, choose {ui.flight} and tap the button that currently reads {ui.transponderOn}. On desktop you can also press B. Without a transponder we send no identity signal and will not show up on their radar from far away."),next:'cover'},
        cover:{text:pair("Flieg dann in den markierten Trägerhangar. Nimm den Schub ganz zurück und nicht schießen. Die Wrackhülle blockiert ihre Sensoren; ohne Antrieb und Waffen bleiben wir unauffällig.","Then fly into the marked carrier hangar. Set thrust to zero and do not fire. The wreck blocks their sensors; without engines or weapons, we stay inconspicuous."),choices:[end('Verstanden.','Understood.')]},
    }},
    'paul-clear':{start:'identity',nodes:{
        identity:{text:pair("Puh, sie sind weg. Schalte deinen Transponder wieder an, falls er noch aus ist: B am Computer oder Schiffsmonitor → {ui.flight} → Taste mit {ui.transponderOff} antippen. Ohne Kennung halten Patrouillen dich eher an und scannen deine Fracht. Natürlich sehen sie dich auch erst später, solltest du mal etwas zu verbergen haben...","Phew, they are gone. If your transponder is still off, switch it back on: B on desktop, or ship monitor → {ui.flight} → tap the button that reads {ui.transponderOff}. Without an identity signal, patrols are more likely to stop you and scan your cargo. Of course, it also takes them longer to spot you if you ever have something to hide..."),next:'ports'},
        ports:{text:pair("Landen kannst du an Stationen mit oder ohne Transponder. Manche verlangen ohne Kennung ein Schmierge... äh, eine zusätzliche Liegegebühr. Du musst auch nach Helix? Das passt ja.","You can land at stations with or without your transponder. Some ask for a bri... uh, an extra berth fee if you arrive without an identity signal. You need to go to Helix too? That works out."),choices:[end("Danke für die Tipps.","Thanks for the advice.")]},
    }},
    debrief:{start:'survey',nodes:{
        survey:{text:pair("Gute Arbeit. Die neuen Scans helfen sicher den Bergungsteams. Ich hab gesehen, wie du mit einem anderen Schiff zusammen hier angekommen bist? Pass lieber auf, wem du vertraust.","Good work. Those new scans will surely help the salvage crews. I saw you arrive with another ship? Be careful who you trust."),next:'freedom'},
        freedom:{text:pair("Rin ist noch unterwegs. Rüste inzwischen dein Schiff auf. Handel, Abbau, Aufträge — jetzt entscheidest du selbst. Nur das Sprungtor ist noch defekt.","Rin is still away. Gear up your ship meanwhile. Trade, mining, contracts — now you decide for yourself. Only the jump gate is still broken."),next:'call'},
        call:{text:pair("Ich melde mich, sobald Rin zurück ist. Pass auf dich auf.","I will call when Rin is back. Look after yourself."),choices:[end('Ich mache mich an die Arbeit.','I will get to work.')]},
    }},
    cairn:{start:'gate',nodes:{
        gate:{text:pair("Da bist du. Während ich hier im {ui.raceDesk} auf dich gewartet habe, hat dieser Typ hier ohne Pause geredet. Aber jetzt zu unseren Eltern: Ich habe endlich eine brauchbare Spur.","There you are. While I was waiting for you here at the {ui.raceDesk}, this guy would not stop talking. But about our parents: I finally have a useful lead."),next:'box'},
        box:{text:pair("Ein alter Flottenbericht erwähnt diese Fregatte nahe der letzten bekannten Position unserer Eltern. In ihrem Wrack liegt wohl noch ein Flugrekorder. Vielleicht erfahren wir daraus mehr. Die Daten sind verschlüsselt — aber Mara kann sie vielleicht entschlüsseln.","An old fleet report puts this frigate near our parents’ last known position. There may still be a flight recorder inside its wreck. It might tell us more. The data is encrypted — but Mara may be able to decode it."),next:'company'},
        company:{text:pair("Ich begleite dich wieder - Mara hat erzählt, das letzte Mal wurde es etwas brenzlig? Wähle beim Fregattenwrack das {ui.blackbox}, nähere dich für den Scan und beschieße dann das markierte Wrackteil. Sammle den freigelegten Rekorder ein.","I will come with you again — Mara said things got a little dangerous last time? At the frigate wreck, select {ui.blackbox}, approach for the scan, then shoot the marked wreckage. Collect the released recorder."),choices:[
            {label:pair('Gibt es Neuigkeiten zum Sprungtor?','Any news about the jump gate?'),next:'gate-status'},
            end('Ich bereite den Start vor.','I will prepare to launch.')
        ]},
        'gate-status':{text:pair("Die Reparaturen sind wohl fertig, das Tor ist wieder offen. Nach der Bergung können wir also unsere Suche auch in den Nachbarsystemen fortsetzen.","Apparently the repairs are done and the gate is open again. After the salvage, we can continue our search in the neighbouring systems too."),returnTo:'company'},
    }},
    'paul-reunion':{start:'hello',nodes:{
        hello:{text:pair("Gut, dich zu sehen. Seit unserem letzten Ausflug ist es hier nochmal gefährlicher geworden.","Good to see you. It has grown even more dangerous around here since our last trip."),choices:[end("Ebenso! Ich muss eben mit meiner Schwester sprechen.","Good to see you too! I need a word with my sister.")]},
    }},
    'paul-offer':{start:'debt',nodes:{
        debt:{text:pair("Sorry, ich habe etwas gelauscht. Du und Rin wollt zum Fregattenwrack? Wenn du Unterstützung willst, begleite ich euch gerne.","Sorry, I overheard a little. You and Rin are heading to the frigate wreck? If you want support, I would be happy to join you."),choices:[
            {label:pair('Ja. Komm mit uns.','Yes. Come with us.'),tutorialChoice:'invite-paul'},end('Danke, wir schaffen es zu zweit.','Thanks. We will manage together.')
        ]},
    }},
    delivery:{start:'box',nodes:{
        box:{text:pair("Der Rekorder ist hier sicher. Ich kümmere mich um die Entschlüsselung, aber das wird dauern.","The recorder is safe here. I will handle the decoding, but it will take time."),next:'rin'},
        rin:{text:pair("Rin prüft schon die nächste Spur. Halte ebenfalls die Augen offen, verdiene Geld und pass auf dich auf. Das Sprungtor ist wieder offen — wohin du fliegst, entscheidest du.","Rin is already checking the next lead. Keep your eyes open too, earn some money and take care of yourself. The jump gate is open again — where you fly is up to you."),choices:[end('Melde dich, sobald du etwas weißt.','Call when you know something.')]},
    }},
};

// The loot lesson remains the same after an execution, but Rin does not
// congratulate the player for killing a pilot who had already surrendered.
ADVENTURE_DIALOGUES['loot-surrender-killed']={start:'reproach',nodes:{
    ...ADVENTURE_DIALOGUES.loot.nodes,
    reproach:{text:pair('Das war etwas extrem, findest du nicht? Er hatte aufgegeben!','That was a little extreme, don’t you think? He had surrendered!'),next:'find'},
    find:{...ADVENTURE_DIALOGUES.loot.nodes.find,text:pair('Ein grüner Raketenwerfer der Stufe I ist übrig. Grün heißt ungewöhnlich: Er hat einen Zusatzbonus. Die I ist seine Technikstufe.','A green tier I missile launcher survived. Green means uncommon: it has one bonus modifier. I is its technology tier.')},
}};
