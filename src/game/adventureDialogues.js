// Responses lead directly to remaining questions; the transcript retains earlier lines.
const pair = (de,en) => ({de,en});
export const dialogueText = (value,language) => typeof value === 'string' ? value : value[language] ?? value.en;
export const ADVENTURE_DIALOGUES = {
    outfitting:{start:'spare',nodes:{
        spare:{text:pair("Da liegt noch ein Langstreckenradar für dich. Bau es ein, bevor wir starten – das Ausrüstungslager zeigt dir wie.",'There is a spare Long-Baseline Radar for you. Fit it before we launch – the outfitting screen will show you how.'),next:'fit'},
        fit:{text:pair("Vom Markt zur SCHIFFSAUSRÜSTUNG, dort SCHIFFSSYSTEME öffnen, freien Hilfssystemplatz antippen und das Radar mit AUS LAGER EINBAUEN setzen. Es gehört dir bereits.",'From the market, go to SHIP OUTFITTING, open SHIP SYSTEMS, tap a free utility slot and place the radar with INSTALL FROM LOCKER. You already own it.'),choices:[{label:pair("Ich sehe mir die Ausrüstung an.",'I will check the outfitting screen.'),complete:true}]},
    }},
    navigation:{start:'outside',nodes:{
        outside:{text:pair('Hier ist die Second Light. Nimm dir einen Moment zum Orientieren – diesmal setzt du den Kurs selbst.','Second Light here. Take a moment to get your bearings – this time you set the course yourself.'),next:'map'},
        map:{text:pair('Radar antippen, in der Sektorkarte VESPER wählen. Die goldene Missionsmarkierung ist unser Ziel. Danach probieren wir die Steuerung in Ruhe.','Tap the radar and select VESPER on the sector chart. The gold mission marker is our destination. Then we can try the controls at our own pace.'),choices:[{label:pair('Ich setze den Kurs.','I will plot the course.'),complete:true}]},
    }},
    services:{start:'check',nodes:{
        check:{text:pair('Lieferung ist raus. Bevor wir in den Gürtel fliegen, ein kurzer Blick unter SERVICE – das erspart uns manchmal einen langen Rückflug.','Delivery is sold. Before the belt, a quick look under SERVICES – it can save us a long flight home.'),next:'resources'},
        resources:{text:pair('Unter SERVICE füllst du Treibstoff und Raketen nach, und Hüllenschäden werden repariert. Treibstoff braucht nur der Nachbrenner; Schilde laden im Flug selbst nach.','Under SERVICES you refill fuel and missiles, and hull damage gets repaired. Only the afterburner burns fuel; shields recharge on their own in flight.'),choices:[{label:pair('Ich prüfe die Anzeigen.','I will check the desk.'),complete:true}]},
    }},
    weapons:{start:'tools',nodes:{
        tools:{text:pair('Das Erz ist an Bord. Ehe es weitergeht, siehst du dir die Waffen an – die beiden Strahllaser sind ein guter Anfang.','The ore is aboard. Before we go on, a word on your guns – the two beam lasers are a good start.'),next:'energy'},
        energy:{text:pair('Strahllaser feuern kurze Pulse und ziehen Energie aus dem Reaktor. Nach einer Salve den Feuerknopf lösen – das war’s schon.','Your beam lasers fire short pulses and draw on reactor energy. Release the trigger after a burst – that is all there is to it.'),choices:[{label:pair('Ich achte auf den Energiespeicher.','I will watch the energy reserve.'),complete:true}]},
    }},
    cargo:{start:'clear',nodes:{
        clear:{text:pair('Da treibt eine Kiste Erz aus seinem Laderaum. Ich habe sie markiert – nimm sie mit.','A crate of ore is drifting out of his hold. I have marked it – bring it in.'),next:'scoop'},
        scoop:{text:pair('Langsam heranfliegen; kurz davor nimmt das Schiff sie automatisch auf. Dein Laderaum steckt im linken Monitor.','Come in slowly; the ship scoops it automatically at close range. Your hold is in the left monitor.'),choices:[{label:pair('Ich hole sie.','I will get it.'),complete:true}]},
    }},
    galaxy:{start:'route',nodes:{ // still the briefing for the galaxy-map step

        route:{text:pair('Das Register liegt in einem anderen System. Karte öffnen, auf GALAXIS umschalten, MERIDIAN wählen – der Computer setzt das Sprungtor als Wegpunkt.','The ledger is in another system. Open the map, switch to GALAXY and select MERIDIAN – the computer sets the jump gate as your waypoint.'),next:'gate'},
        gate:{text:pair('Hyperdrive bis zum Sprungpunkt, dann unter normalem Schub durch die Toröffnung. Beides kostet keinen Treibstoff.','Hyperdrive to the jump point, then fly through the gate opening under normal thrust. Neither costs fuel.'),choices:[{label:pair('Ich plane die Route.','I will plot the route.'),complete:true}]},
    }},
    mara: {start:'welcome',nodes:{
        welcome:{text:pair('Da bist du ja. Deine Mutter hat zwei Schlüssel für die Wayfarer hinterlassen – Rin nahm einen, den anderen hab ich für dich.','There you are. Your mother left two keys to the Wayfarer – Rin took one, and I kept the other.'),next:'keys'},
        keys:{text:pair('Hier. Sie hätte sich gefreut, euch beide mit dem Schiff zu sehen.','Here. She would have loved to see you both flying that ship.'),choices:[
            {label:pair('Du hast den Schlüssel die ganze Zeit aufgehoben?','You kept the key all this time?'),next:'kept'},
            {label:pair('Hat Rin wenigstens nach dem anderen gefragt?','Did Rin at least ask for the other one?'),next:'rin'},
            {label:pair('Was muss ich vor dem Start erledigen?','What do I need to do before launching?'),next:'work'},
            {label:pair('Ich spreche mit Rin und besorge die Ware. Bis bald, Mara.','I will talk to Rin and get the cargo. See you soon, Mara.'),complete:true,requires:'work'},
        ]},
        kept:{text:pair('Deine Mutter bat mich darum. Ich wollte ihn dir persönlich geben, wenn du bereit bist.','Your mother asked me to. I wanted to give it to you myself, when you were ready.'),next:'memory'},
        memory:{text:pair('Sie wollte, dass ihr beide etwas habt, das euch gehört. Und einen Grund, wieder nach Hause zu kommen. Passt auf das Schiff auf. Und aufeinander.','She wanted you both to have something of your own. And a reason to come home. Look after the ship, and each other.'),returnTo:'keys'},
        rin:{text:pair('Natürlich. Nachdem der Motor lief. In dieser Familie gilt das noch als förmlicher Antrag.','Of course. Once the engine was running. In this family, that still counts as a formal application.'),returnTo:'keys'},
        work:{text:pair("Sprich mit Rin, falls du sie noch nicht hattest, und kauf an der WARENBÖRSE zwei Proteinpakete. Auf Vesper kannst du sie verkaufen – dafür braucht ihr keinen Auftrag.",'Talk to Rin if you have not seen her yet, then buy two Protein Packs at the commodity market. You can sell them on Vesper – no contract needed for that.'),next:'food'},
        food:{text:pair('Rin kennt die Strecke und fliegt mit. Komm danach vorbei und erzähl mir, wie es lief.','Rin knows the route and will fly with you. Come back afterwards and tell me how it went.'),returnTo:'keys'},
    }},
    rin:{start:'welcome',nodes:{
        welcome:{text:pair('Die Wayfarer ist startklar. Sie hat lange gestanden, aber unsere Mutter hat gut auf sie aufgepasst.','The Wayfarer is ready. She sat idle for a while, but our mother took good care of her.'),next:'hub'},
        hub:{text:pair('Du fliegst die Wayfarer, ich die Second Light – und bleibe an deinem Flügel. Wir gehen alles in Ruhe durch.','You fly the Wayfarer, I take the Second Light – and stay on your wing. We can take this at your pace.'),choices:[
            {label:pair('Wie gut kennst du die Wayfarer?','How well do you know the Wayfarer?'),next:'list'},
            {label:pair('Wie läuft die Lieferung genau?','How does this delivery work?'),next:'delivery'},
            {label:pair('Ich besorge die Ware. Wir sehen uns draußen.','I will get the cargo. See you outside.'),complete:true,requires:'delivery'},
        ]},
        list:{text:pair('Ich bin oft mit unserer Mutter geflogen. Sie konnte am Geräusch erkennen, was dem Schiff fehlte. Meistens Treibstoff. Manchmal ihre Geduld.','I flew with our mother often. She could tell what the ship needed just by listening. Usually fuel. Sometimes her patience.'),returnTo:'hub'},
        delivery:{text:pair("Zwei Proteinpakete an der WARENBÖRSE kaufen, nach Vesper fliegen und dort wieder verkaufen. So lernst du die Strecke und verdienst etwas dazu.",'Buy two Protein Packs at the commodity market, fly to Vesper and sell them there. That way you learn the route and earn something.'),next:'ready'},
        ready:{text:pair('Wenn die Ware an Bord ist, gehen wir kurz die Ausrüstung durch. Ich melde mich draußen per Funk.','Once the cargo is aboard, we will check your equipment. I will call you over the radio outside.'),returnTo:'hub'},
    }},
    mining:{start:'reason',nodes:{
        reason:{text:pair('Das Schiff steht. Ich zeige dir, wie man verdient, ohne erst Ware einzukaufen: Cairn kauft Erz aus dem Shardbelt.','The ship is ready. Let me show you how to earn without buying cargo first: Cairn buys ore from the Shardbelt.'),next:'route'},
        route:{text:pair('Im Shardbelt üben wir den Abbau – die Bergung am Wrack nutzt dieselbe Zielsteuerung.','In the Shardbelt we practise extraction – salvage at the wreck uses the same targeting controls.'),next:'lesson'},
        lesson:{text:pair('Ich markiere gleich eine Lagerstätte. Ran, warten bis der Scan sitzt, dann ABBAU antippen. Eine Einheit genügt. Vor dem Abflug die Drohnen mit RÜCKRUF zurückholen.',"I will mark a deposit shortly. Get close, wait for the scan, then tap MINE. One unit is enough. Recall the drones before leaving."),choices:[
            {label:pair('Was hat es mit dem Konvoi auf sich?','What is the convoy about?'),next:'convoy'},
            {label:pair('Dann fliegen wir zum Shardbelt.','Then let us head for the Shardbelt.'),complete:true},
        ]},
        convoy:{text:pair('Unsere Mutter flog bei der Evakuierung mit. Einige Schiffe erreichten das Tor nie – in einem davon könnte noch eine Aufzeichnung stecken. Danach schauen wir dort vorbei.','Our mother flew with the evacuation. Some ships never reached the gate – one of them may still carry a recording. We will visit it after this.'),returnTo:'lesson'},
    }},
    salvage:{start:'aftermath',nodes:{
        aftermath:{text:pair('Die Kiste ist an Bord. Sonst wäre da noch das Wrack, von dem ich dir erzählt habe.','The crate is aboard. There is still that wreck I told you about.'),next:'request'},
        request:{text:pair('Ich habe das REKORDERSIGNAL DES KONVOIS markiert – du findest es auch außerhalb der Sensorreichweite in der Kontaktliste der Karte. Hyperdrive zur Mourning Line, dann dem Marker folgen und in Reichweite BERGEN gedrückt halten.','I have marked CONVOY RECORDER SIGNAL – it stays listed in the map contacts beyond sensor range. Hyperdrive to Mourning Line, follow the marker and hold SALVAGE within range.'),choices:[
            {label:pair('Du hoffst, dort etwas über unsere Mutter zu finden.','You are hoping to find something about our mother.'),next:'reason'},
            {label:pair('Ich sehe nach, was noch da ist.','I will see what is still there.'),complete:true},
        ]},
        reason:{text:pair('Ja. Ich hätte es vor dem Start sagen sollen – ich wollte erst wissen, ob überhaupt etwas übrig ist.','Yes. I should have said so before we launched – I wanted to know if anything was left first.'),returnTo:'request'},
    }},
    recorder:{start:'found',nodes:{
        found:{text:pair('Die Aufnahme ist lesbar. Das ist die Stimme unserer Mutter – der Rekorder hat ihren Funkverkehr mitgeschnitten.','The recording is readable. That is our mother’s voice – the recorder captured her radio traffic.'),next:'cairn'},
        cairn:{text:pair('Ich war bei diesem Konvoi. Was ich Mara danach erzählt habe, war nicht die ganze Wahrheit. Legen wir bei Cairn an.','I was with that convoy. What I told Mara afterwards was not the whole truth. Let us dock at Cairn.'),choices:[
            {label:pair('Gut. Diesmal erzählst du alles.','All right. This time you tell it all.'),complete:true},
        ]},
    }},
    cairn:{start:'account',nodes:{
        account:{text:pair('Meine Maschine fiel kurz vor dem Sprungtor aus. Unsere Mutter verließ mit der Wayfarer die Formation und holte mich an Bord. Der Träger hinter uns schaffte es nicht durch das Tor.','My ship failed just short of the jump gate. Our mother broke formation in the Wayfarer and took me aboard. The carrier behind us never made it through the gate.'),next:'record'},
        record:{text:pair('Im offiziellen Bericht steht, sie sei ohne Freigabe abgedreht. Aber hör hier: Die Konvoileitung bestätigt ihren Rettungsanflug. Genau dieser Funkspruch fehlt im Bericht.','The official report says she turned away without clearance. But listen here: convoy control acknowledges her rescue approach. That transmission is missing from the report.'),next:'confession'},
        confession:{text:pair('Ich habe Mara nie erzählt, dass sie wegen mir abgedreht ist. Ich hatte Angst, sie würde mir die Schuld am Verlust des Trägers geben. Das war unfair gegenüber ihr. Und gegenüber dir.','I never told Mara that she turned back for me. I was afraid she would blame me for the loss of the carrier. That was unfair to her, and to you.'),choices:[
            {label:pair('Beweist die Aufnahme, wer für den Verlust verantwortlich war?','Does the recording prove who was responsible for the loss?'),next:'proof'},
            {label:pair('Warum hast du mir nicht vorher davon erzählt?','Why did you not tell me before?'),next:'silence'},
            {label:pair('Was können wir jetzt tun?','What can we do now?'),next:'plan'},
            {label:pair('Mara muss das erfahren. Schick ihr eine Kopie.','Mara needs to hear this. Send her a copy.'),next:'tell',requires:'plan'},
            {label:pair('Ich vertraue dir. Wir suchen gemeinsam weiter.','I trust you. We will keep looking together.'),next:'trust',requires:'plan'},
            {label:pair("Ich behalte den Rekorder. Ich brauche Zeit, das einzuordnen.",'I am keeping the recorder. I need time to make sense of this.'),next:'keep',requires:'plan'},
        ]},
        proof:{text:pair('Nein. Sie zeigt, dass der Bericht etwas Wesentliches auslässt. Warum der Träger zurückblieb, wissen wir noch nicht. Dafür brauchen wir das vollständige Evakuierungsregister.','No. It shows that the report leaves out something important. We still do not know why the carrier was left behind. For that, we need the full evacuation ledger.'),returnTo:'confession'},
        silence:{text:pair('Solange ich schwieg, musste ich eure Fragen nicht beantworten. Ich habe mir eingeredet, ich würde euch damit schützen. In Wahrheit habe ich mich selbst geschützt.','As long as I stayed quiet, I did not have to answer your questions. I told myself I was protecting you. Really, I was protecting myself.'),returnTo:'confession'},
        plan:{text:pair('Die Register wurden nach Meridian Prime gebracht. Dort könnte das Original noch liegen. Wir können durch das Helios–Meridian-Tor fliegen. Was Mara von dieser Aufnahme erfährt, entscheiden wir vorher.','The ledgers were moved to Meridian Prime. The original may still be there. We can fly through the Helios–Meridian gate. Before we leave, we should decide what to tell Mara about this recording.'),returnTo:'confession'},
        tell:{text:pair('Ich schicke ihr die Aufnahme und meine Erklärung. Sie soll es von mir erfahren. Danke, dass du mich nicht wieder damit davonkommen lässt.','I will send her the recording and my explanation. She should hear it from me. Thank you for not letting me avoid this again.'),choices:[
            {label:pair('Schick sie ab. Dann brechen wir auf.','Send it. Then we can leave.'),complete:true,tutorialChoice:'tell-mara'},
        ]},
        trust:{text:pair("Danke. Ich werde dir sagen, was ich weiß, auch wenn es unangenehm wird. Den Rekorder bewahren wir auf; wir brauchen ihn vielleicht noch.",'Thank you. I will tell you what I know, even when it is uncomfortable. We will keep the recorder safe; we may still need it.'),choices:[
            {label:pair('Gut. Dann sehen wir gemeinsam weiter.','All right. We will take the next step together.'),complete:true,tutorialChoice:'trust-rin'},
        ]},
        keep:{text:pair('Das verstehe ich. Du hast die Aufnahme geborgen, und du entscheidest, wem du sie zeigst. Ich begleite dich nach Meridian, wenn du das möchtest.','I understand. You recovered the recording, and you decide who sees it. I will fly with you to Meridian if you want me there.'),choices:[
            {label:pair('Komm mit. Das hier ist noch nicht geklärt.','Come with me. We have not settled this yet.'),complete:true,tutorialChoice:'keep-recorder'},
        ]},
    }},
    departure:{start:'leaving',nodes:{
        leaving:{text:pair('Ich springe jetzt voraus. Jemand muss am Register sein, bevor ein anderer Rekorder verschwindet – und du verdienst hier noch Geld für die Ausrüstung.','I am jumping ahead now. Someone has to be at the ledger before another recorder disappears – and you still need to earn your refit money here.'),next:'promise'},
        promise:{text:pair('Sobald ich durch das Tor bin, melde ich mich bei Mara. Rüste die Wayfarer richtig aus – Treibstoff, Munition, was das Konto hergibt.','Once I am through the gate, I will call Mara. Fit the Wayfarer properly – fuel, ordnance, whatever the account allows.'),choices:[
            {label:pair('Und wenn du dich nicht meldest?','And if you do not call?'),next:'worry'},
            {label:pair('Gute Reise, Schwester. Ich folge dir.','Safe trip, sister. I will follow you.'),complete:true},
        ]},
        worry:{text:pair('Dann flieg mir hinterher. Aber es wird nicht nötig sein. Ich melde mich.','Then come after me. But it will not be necessary. I will call.'),returnTo:'promise'},
    }},
    handoff:{start:'signal',nodes:{
        signal:{text:pair('Es ist Mara. Rin hat sich nach dem Tor nicht gemeldet. Kein Funk, keine Rückkehr, nichts – und das ist nicht ihre Art.','It is Mara. Rin never called after the gate. No radio, no return, nothing – and that is not like her.'),next:'ledger'},
        ledger:{text:pair('Sie wollte das Register in Meridian Prime sehen. Du fliegst jetzt die einzige Wayfarer, die ihr folgen kann.','She wanted to see the ledger in Meridian Prime. You are now flying the only Wayfarer that can follow her.'),choices:[
            {label:pair('Worum soll ich die Wayfarer noch kümmern?','What else should I do for the Wayfarer?'),next:'ship'},
            {label:pair('Ich nehme das Tor und suche sie.','I will take the gate and look for her.'),complete:true},
        ]},
        ship:{text:pair('Cairn kauft Erz und das Rennbüro zahlt ohne Auftrag – so verdienst du, bevor du startest. Und wenn ein Gegner aufgibt: Feuer einstellen, dann nimmt die blaue Taste die Übergabe an.','Cairn buys ore and the race desks pay without a contract – that is how you earn before you launch. And when an opponent surrenders: hold fire, and the blue button takes the handover.'),returnTo:'ledger'},
    }},
    combat:{start:'contact',nodes:{
        contact:{text:pair('Ein einzelner Plünderer: Ash Moth. Ich habe ihn markiert. Fadenkreuz drauf, roten Feuerknopf halten – zwischen Salven lösen, damit der Reaktor nachlädt.','A single raider: Ash Moth. I have marked him. Crosshair on, hold the red fire button – release between bursts so the reactor keeps up.'),next:'help'},
        help:{text:pair('Raketen kannst du mit der blauen Taste dazugeben, wenn du freie Sicht hast. Bleib in Bewegung – wenn es eng wird, greife ich ein.','Add missiles on the blue button when you have a clear shot. Keep moving – if it gets rough, I am coming in.'),choices:[
            {label:pair('Ich bin bereit.','I am ready.'),complete:true},
        ]},
    }},
    flight:{start:'hello',nodes:{
        hello:{text:pair('Kurs steht. Bevor der Hyperdrive anspringt, probieren wir die Steuerung hier aus.','Course is set. Before the hyperdrive, let us try the controls out here.'),next:'hub'},
        hub:{text:pair('Schub über den Schieber links, steuern mit Joystick oder Kippen. Dann ein kurzer Nachbrennerstoß mit der goldenen Taste – die Monitore gehen wir hinterher per Funk durch.','Thrust on the left slider, steer with the stick or by tilting. Then a short afterburner burst on the gold button – we will cover the monitors over the radio.'),choices:[
            {label:pair('Wie finde ich Vesper?','How do I find Vesper?'),next:'route'},
            {label:pair('Ich bin noch ziemlich unsicher.','I am still rather unsure.'),next:'reassure'},
            {label:pair('Alles klar. Bleib an meinem Flügel.','All right. Stay on my wing.'),complete:true},
        ]},
        route:{text:pair('Vesper ist angewählt. Hyperdrive bringt dich hin, dann langsam ran – die Landung läuft automatisch.','Vesper is selected. Hyperdrive gets you there, then ease in slowly – landing is automatic.'),returnTo:'hub'},
        reassure:{text:pair('Das ging mir beim ersten Flug genauso. Nimm den Schub zurück, wenn du Zeit brauchst.','I felt the same on my first flight. Ease the throttle back if you need time.'),returnTo:'hub'},
    }},
};
