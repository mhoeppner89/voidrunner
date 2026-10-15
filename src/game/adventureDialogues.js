const pair=(de,en)=>({de,en});
export const dialogueText=(value,language)=>typeof value==='string'?value:value?.[language]??value?.en??'';
const end=(de='Alles klar.',en='All right.')=>({label:pair(de,en),complete:true});
export const ADVENTURE_DIALOGUES={
    mara:{start:'welcome',nodes:{
        welcome:{text:pair('Da bist du. Deine Mutter hat zwei Schlüssel zur Wayfarer hinterlassen. Rin nahm einen; den anderen habe ich für dich aufgehoben.','There you are. Your mother left two keys to the Wayfarer. Rin took one; I kept the other for you.'),next:'work'},
        work:{text:pair('Das Schiff gehört dir. Protein bringt auf Vesper mehr ein als auf Helix. Du bezahlst die Ware selbst und behältst den Gewinn. Rin zeigt dir den Einkauf.','The ship is yours. Protein sells for more on Vesper than on Helix. You pay for the cargo and keep the profit. Rin will show you how to buy it.'),noPrologue:{text:pair('Das Schiff gehört dir. An der Warenbörse kannst du günstig einkaufen und dort verkaufen, wo die Ware gebraucht wird. In der Bar findest du Aufträge.','The ship is yours. Buy goods cheaply at the market and sell them where they are needed. The bar has contracts.')},next:'rin'},
        rin:{text:pair('Rin begleitet dich auf dem ersten Flug und zeigt dir die Steuerung. Und bringt euch beide wieder nach Hause.','Rin will accompany your first flight and teach you the controls. Bring both of you home.'),noPrologue:{text:pair('Rin fliegt ihre eigenen Routen. Frag sie, wenn du etwas über die Wayfarer wissen möchtest. Und komm gelegentlich vorbei.','Rin flies her own routes. Ask her if you want to know about the Wayfarer. And come by now and then.')},choices:[end('Wir passen aufeinander auf.','We will look after each other.')]},
    }},
    rin:{start:'ready',nodes:{
        ready:{text:pair('Die Wayfarer ist startklar. Unsere Mutter hat gut auf sie aufgepasst. Du nimmst ihre Maschine, ich die Second Light.','The Wayfarer is ready. Our mother took good care of her. You take her ship; I will fly the Second Light.'),next:'trade'},
        trade:{text:pair('Geh zum MARKTPLATZ und öffne die WARENBÖRSE. Wähle Protein und MAXIMAL KAUFEN. Vor dem Kauf siehst du Menge und Kosten; der Frachtraum begrenzt die Ladung. Ich bleibe auf dem Flug an deinem Flügel.','Go to the MARKET and open the COMMODITY MARKET. Use BUY MAX for Protein. The controls show quantity and cost before you buy; cargo space limits the load. I will stay on your wing for the flight.'),noPrologue:{text:pair('Du kannst handeln, Erz abbauen oder Aufträge aus der Bar übernehmen. Ich fliege meine eigenen Routen; du entscheidest, wohin es geht.','You can trade, mine ore or take contracts from the bar. I fly my own routes; you decide where to go.')},choices:[
            {label:pair('Weißt du etwas Neues über unsere Eltern?','Any news about our parents?'),next:'parents'},{label:pair('Alles klar, ich kaufe die Ladung.','All right, I will buy the cargo.'),next:'legal',noPrologueLabel:pair('Wir sehen uns draußen.','See you outside.')}
        ]},
        legal:{text:pair('Eine Sache noch: Waffen sind rot markiert. Ihr Transport ist illegal. Protein kannst du dagegen legal handeln.','One more thing: weapons are marked red. Transporting them is illegal. Protein is legal to trade.'),noPrologue:{text:pair('Waffen sind an der Börse rot markiert. Ihr Transport ist illegal.','Weapons are marked red at the market. Transporting them is illegal.')},choices:[end('Bis draußen.','See you outside.')]},
        parents:{text:pair('Noch nichts Sicheres. Ich prüfe ein paar alte Evakuierungslisten. Erst sorgen wir dafür, dass du mit der Wayfarer Geld verdienen kannst.','Nothing certain yet. I am checking some old evacuation records. First, let us make sure you can earn a living with the Wayfarer.'),returnTo:'trade'},
    }},
    'cargo-ready':{start:'launch',nodes:{
        launch:{text:pair('Die Ladung ist an Bord. Geh zurück zur DOCKHALLE und wähle dort deine Wayfarer zum Start. Ich treffe dich draußen.','The cargo is aboard. Return to the DOCK HALL and select your Wayfarer to launch. I will meet you outside.'),choices:[end('Ich mache mich startklar.','I will get ready to launch.')]},
    }},
    'reactor-ready':{start:'bar',nodes:{
        bar:{text:pair('Der Reaktor läuft. Komm zu mir in die Bar; ich habe einen Abbauauftrag für uns.','The reactor is running. Meet me in the bar; I have a mining job for us.'),choices:[end('Bis gleich.','See you there.')]},
    }},
    'mining-return':{start:'bar',nodes:{
        bar:{text:pair('Gut geflogen. Der Abbauauftrag ist bezahlt. Triff mich in der Bar, bevor du wieder startest. Ich habe etwas für die Arbeit an Wracks.','Good flying. The mining contract is paid. Meet me in the bar before you launch again. I have something for working around wrecks.'),choices:[end('Ich komme.','On my way.')]},
    }},
    'mara-cairn':{start:'call',nodes:{
        call:{text:pair('Rin ist zurück und hat eine Spur zu euren Eltern. Sie wartet in der Bar auf Cairn. Flieg hin und sprich mit ihr.','Rin is back with a lead on your parents. She is waiting in the bar at Cairn. Fly there and speak with her.'),choices:[end('Ich fliege nach Cairn.','I will head to Cairn.')]},
    }},
    'vesper-arrival':{start:'landing',nodes:{
        landing:{text:pair('Sehr gut. Wie war dein erster Flug? Jetzt lass uns das Protein am Markt verkaufen.','Well done. How was your first flight? Now let’s sell the Protein at the market.'),next:'market'},
        market:{text:pair('Öffne den Marktplatz und dort die WARENBÖRSE. Wähle Protein aus deiner Fracht und tippe auf ALLES VERKAUFEN. Du siehst vorher, wie viel du dafür bekommst.','Open the marketplace and its COMMODITY MARKET. Select Protein from your cargo and choose SELL ALL. You can see what you will earn before confirming.'),choices:[end('Alles klar, zum Markt.','All right, off to the market.')]},
    }},
    'reactor-gift':{start:'gift',nodes:{
        gift:{text:pair('Dein erster Gewinn! Ich schenke dir mein Ersatz-Reaktorupgrade. Es erhöht die Energieregeneration deiner Wayfarer. Das Teil liegt hier im Lager.','Your first profit! My spare Reactor Upgrade is yours. It increases your Wayfarer’s energy regeneration. The part is in storage here.'),next:'fitting'},
        fitting:{text:pair('Öffne die SCHIFFSAUSRÜSTUNG am Marktplatz, dann LAGER. Im Handel erreichst du sie oben über AUSRÜSTUNG. Wähle das Reaktorupgrade und tippe auf EINBAUEN. Ein freier passender Platz wird vorgeschlagen. Der Einbau eines eigenen Teils kostet nichts.','Open SHIP PARTS at the market, then STORAGE. From the trade screen, use EQUIPMENT at the top. Select the Reactor Upgrade and choose INSTALL. A free compatible mount is suggested. Installing a part you own is free.'),choices:[end('Ich baue es ein.','I will install it.')]},
    }},
    mining:{start:'profit',nodes:{
        profit:{text:pair('Mit dem neuen Reaktor bist du gut ausgerüstet. Hast du Lust auf einen Abbauauftrag? Dafür musst du keine Ware einkaufen.','The new reactor has you well equipped. Ready for a mining job? There is no cargo to buy first.'),next:'contract'},
        contract:{text:pair('Öffne das AUFTRAGSBRETT hier in der Bar. Wähle den Abbauauftrag und ANNEHMEN. Er verlangt sechs Einheiten aus der markierten Lagerstätte im Shardbelt, zurück nach Vesper, und bringt 3.000 cr. Gekauftes Erz zählt nicht.','Open the MISSION BOARD here in the bar. Select the mining contract and ACCEPT. It pays 3,000 cr for six units from the marked Shardbelt deposit, returned to Vesper. Bought ore does not count.'),next:'drones'},
        drones:{text:pair('Ich fliege mit. Die Abbaudrohnen sind schon an Bord. Am markierten Felsen startest du sie mit ABBAU, am Computer M. Sie bringen das Erz in deinen Frachtraum. Beim Start des Hyperdrives kehren sie automatisch zurück; der Antrieb wartet auf sie.','I will fly with you. Mining drones are already aboard. At the marked rock, launch them with MINE, or M on desktop. They bring ore to your hold. When you engage hyperdrive, they return automatically; the drive waits for them.'),choices:[end('Ich nehme den Vertrag an.','I will accept the contract.')]},
    }},
    salvage:{start:'payment',nodes:{
        payment:{text:pair('Bergung funktioniert ähnlich wie Abbau: Ein ausgewähltes Wrack wird in Reichweite automatisch gescannt. Dann hältst du BERGEN gedrückt, am Computer M. Du bekommst verwertbare Fracht aus dem Wrack.','Salvage works much like mining: a selected wreck is scanned automatically within range. Then hold SALVAGE, or M on desktop. It recovers usable cargo from the wreck.'),next:'risk'},
        risk:{text:pair('Wracks sind gefährlich: enge Durchgänge, lose Trümmer und Piraten. Ich gebe dir PDC-Drohnen. Sie wehren anfliegende Geschosse automatisch ab.','Wrecks are dangerous: narrow passages, loose debris and pirates. I am giving you PDC drones. They intercept incoming projectiles automatically.'),next:'fitting'},
        fitting:{text:pair('Öffne die SCHIFFSAUSRÜSTUNG und wähle DROHNEN. Stelle Bucht 1 auf PDC. Die Abbaudrohnen bleiben in deiner Fracht; du kannst später wieder umschalten.','Open SHIP PARTS and select DRONES. Set bay 1 to PDC. Your mining drones stay in cargo; you can switch back later.'),next:'survey'},
        survey:{text:pair('Kartiere die großen Wracks in der Mourning Line. Fliege langsam an die markierten Wegpunkte; die Aufzeichnung läuft automatisch. Diesmal fliegst du allein. Danach zu Mara auf Helix. Ich suche Informationen über unsere Eltern.','Chart the major wrecks in Mourning Line. Approach the marked waypoints slowly; the survey records automatically. This time you fly alone. Afterwards, see Mara on Helix. I will look for information about our parents.'),choices:[end('Ich stelle die Drohnen um und fliege los.','I will switch drones and head out.')]},
    }},
    'paul-rescue':{start:'thanks',nodes:{
        thanks:{text:pair('Danke! Ohne dich wäre meine Torsas jetzt ein weiteres Wrack. Paul ist mein Name. Der Frachter heißt Long Memory.','Thank you! Without you, my Torsas would be another wreck. I am Paul. The freighter is Long Memory.'),next:'repairs'},
        repairs:{text:pair('Die grünen Drohnen reparieren meine Hülle mit Energie aus meinem Schiff. Wenn meine Maschine versorgt ist, helfen sie auch dir und anderen Verbündeten in 200 km Umkreis.','The green drones repair my hull using energy from my ship. Once I am patched up, they can also repair you and other friendlies within 200 km.'),next:'support'},
        support:{text:pair('Bleib in meiner Nähe, wenn deine Hülle beschädigt ist. Die Drohnen fliegen selbstständig hin und zurück. Schilde laden sie nicht auf.','Stay near me if your hull is damaged. The drones fly over and return automatically. They do not recharge shields.'),next:'route'},
        route:{text:pair('Du kartierst das Feld? Dann fliegen wir die übrigen Punkte zusammen ab. Den Träger kenne ich noch aus besseren Zeiten. Ich schulde dir ohnehin einen Gefallen.','You are surveying the field? Let us visit the remaining points together. I remember that carrier from better days. I owe you a favour anyway.'),choices:[end('Gut. Bleib an meinem Flügel.','All right. Stay on my wing.')]},
    }},
    'paul-hide':{start:'cover',nodes:{
        cover:{text:pair('Fünf Piraten. Wir verstecken uns im Träger. Ohne Transponder senden wir keine Kennung; die Wrackhülle blockiert ihre Sensoren. Halte das Feuer zurück, damit wir uns nicht verraten.','Five pirates. We will hide inside the carrier. With the transponder off, we broadcast no identity; the wreck’s hull blocks their sensors. Hold fire so we do not give ourselves away.'),choices:[end('Verstanden.','Understood.')]},
    }},
    debrief:{start:'survey',nodes:{
        survey:{text:pair('Gute Arbeit. Die neuen Wrackpositionen helfen den Bergungsteams. Und Paul hat schon erzählt, dass du ihm geholfen hast.','Good work. The updated wreck positions will help the salvage crews. Paul has already told me you helped him.'),next:'freedom'},
        freedom:{text:pair('Rin ist noch unterwegs. Rüste inzwischen dein Schiff auf. Handel, Abbau, Aufträge — im Startsystem entscheidest du jetzt selbst. Das Sprungtor bleibt wegen Reparaturen geschlossen.','Rin is still away. Gear up your ship meanwhile. Trade, mining, contracts — you choose your own work in the starting system now. The jump gate remains closed for repairs.'),next:'call'},
        call:{text:pair('Ich melde mich, sobald Rin zurück ist und deine Maschine für die nächste Sache bereit ist. Pass auf dich auf.','I will call when Rin is back and your ship is ready for the next job. Look after yourself.'),choices:[end('Ich mache mich an die Arbeit.','I will get to work.')]},
    }},
    cairn:{start:'gate',nodes:{
        gate:{text:pair('Da bist du. Das Sprungtor ist wieder offen. Und ich habe endlich eine brauchbare Spur zu unseren Eltern.','There you are. The jump gate is open again. And I finally have a useful lead on our parents.'),next:'box'},
        box:{text:pair('Bei einem Fregattenwrack in der Mourning Line liegt ein Flugrekorder. Er gehörte zu ihrem Evakuierungskonvoi. Die Daten sind verschlüsselt — Mara kann sie vielleicht lesen.','There is a flight recorder beside a frigate wreck in Mourning Line. It belonged to their evacuation convoy. The data is encrypted — Mara may be able to read it.'),next:'company'},
        company:{text:pair('Ich komme mit. Wähle beim Fregattenwrack das BLACKBOX-SIGNAL und halte in Reichweite BERGEN, am Computer M. Paul ist ebenfalls hier in der Bar; wenn du ihn fragst, begleitet er uns vielleicht.','I am coming with you. At the frigate wreck, select BLACK BOX SIGNAL and hold SALVAGE within range, or M on desktop. Paul is here in the bar too; ask him if you want his help.'),choices:[end('Ich bereite den Start vor.','I will prepare to launch.')]},
    }},
    'paul-offer':{start:'debt',nodes:{
        debt:{text:pair('Gut, dich zu sehen. Meine Maschine ist wieder dicht. Du und Rin wollt zum Fregattenwrack? Wenn du Unterstützung brauchst, begleite ich euch. Meine Reparaturdrohnen helfen euch innerhalb von 200 km.','Good to see you. My ship is patched up. You and Rin are heading to the frigate wreck? If you need support, I can come along. My repair drones can help you within 200 km.'),choices:[
            {label:pair('Ja. Komm mit uns.','Yes. Come with us.'),tutorialChoice:'invite-paul'},end('Danke, wir schaffen es zu zweit.','Thanks. We will manage together.')
        ]},
    }},
    delivery:{start:'box',nodes:{
        box:{text:pair('Der Rekorder ist hier sicher. Ich kümmere mich um die Entschlüsselung. Das dauert; ich will keine halben Antworten über eure Eltern liefern.','The recorder is safe here. I will handle the decoding. It will take time; I will not give you half an answer about your parents.'),next:'rin'},
        rin:{text:pair('Rin prüft schon die nächste Spur. Halte ebenfalls die Augen offen, verdiene Geld und komm heil zurück. Das Tor ist offen — wohin du fliegst, entscheidest du.','Rin is already checking the next lead. Keep your eyes open too, earn some money and come back in one piece. The gate is open — where you fly is up to you.'),choices:[end('Melde dich, sobald du etwas weißt.','Call when you know something.')]},
    }},
};
