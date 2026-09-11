# Gedownload vliegenbrein

De lokale simulator en connectoomdata staan in `external/fly-brain-minecraft`.
Dit is nu verbonden met de Mineflayer-bot via een headless Java bridge.

Commands in Minecraft/HUD/Discord:

```text
ai flybrain on
ai flybrain off
ai flybrain status
```

Bij `ai flybrain on` gaat de bot naar mode `flybrain`: pathfinder/planner worden losgelaten en de motor-output van het connectoom wordt vertaald naar Mineflayer controls zoals forward, back, left/right, jump en look yaw. Andere normale AI-taken zetten flybrain weer uit, zodat commands zoals gather/craft/follow niet tegelijk tegen het brein vechten.

Bron: https://github.com/blendi-remade/fly-brain-minecraft
Vastgelegde commit: `6cfa30175003ef25da68a237d5eda958f8047b82`.
Code: MIT. Connectoomafgeleide: CC BY 4.0. De oorspronkelijke LICENSE en
PROVENANCE.md staan in de download en moeten behouden blijven.
Data: MaleCNS v1.0 van HHMI Janelia/FlyEM, University of Cambridge/MRC LMB
en Google Research; https://male-cns.janelia.org/.

Het bestand `src/main/resources/connectome/malecns-v1.0.flyb.gz` is
22.964.094 bytes groot en bevat 176.422 neuronen en 6.287.749 verbindingen.
SHA-256: `e33df182bed7a6f3ea279daf4790a82b05706d3d41e819a6a80c0473e8c559f3`.
Dit is een bewerkte dataset: verbindingen met minder dan vijf synapsen en
zelfverbindingen zijn weggelaten. Zie de oorspronkelijke PROVENANCE.md.

Opnieuw downloaden vanuit de projectmap:

```powershell
git clone https://github.com/blendi-remade/fly-brain-minecraft.git external/fly-brain-minecraft
git -C external/fly-brain-minecraft checkout 6cfa30175003ef25da68a237d5eda958f8047b82
```

Testen met een JDK 21 of nieuwer op PATH, zonder Fabric of Minecraft te starten:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-fly-brain.ps1
```

De test controleert de hash, compileert uitsluitend de onafhankelijke Java-breincode
en simuleert 200 ms met suikerprikkels op LB3b/LB3c. Bij de eerste lokale test
reageerde MN9 met 30-50 Hz na de eerste 50 ms; DNp09 en DNa02 bleven stil.
Er waren 3.438 spikes. De rekentijd was 0,98 seconden voor 0,2 seconden simulatie
(geen volledige prestatiebenchmark en geen bewijs van Minecraft-vaardigheid).

Voor de gewenste volledige besturing zijn nog een sensoradapter, een proceskoppeling
en een motoradapter nodig. De bestaande autonome systemen moeten dan exclusief
plaatsmaken voor de breinbesturing. Gebruik geen voedselzoekreflex uit de mod:
die is handgeschreven en komt niet uit het connectoom. Sensorcodering en de
vertaling van motoractiviteit naar Minecraft-acties blijven ontworpen adapters.
Mijnen, craften en bouwen zijn niet aangetoond door deze simulator.

## Fase 2: drang en navigatie

Fase 2 is geactiveerd in `ai flybrain on` mode. De driver berekent naast reflex-motoren nu ook een simpele intentie:

- `pathfind_to_food`: bij lage food-levels probeert Mineflayer eerst te eten uit inventory en anders voedsel te zoeken.
- `retreat_from_entity`: bij schade, lage health of een nabije hostile mob routeert Mineflayer weg van het gevaar.
- `observe_entity`: bij een nabije niet-hostile entity blijft de vlieg vooral kijken/reageren.
- `idle`: geen sterke drang.

De Flybrain-tab toont live de actieve `Urge`, `Urge priority`, reden en dichtstbijzijnde entity. De normale vlieg-motoren blijven actief, maar bij een sterke fase-2 intentie krijgt Mineflayer tijdelijk routecontrole zodat de bot ook echt ergens heen kan lopen in plaats van alleen reflexmatig te sturen.
## Fase 3: interactie en handelingen

Fase 3 voegt eenvoudige "handen" toe aan flybrain mode. De driver kan nu deze intenties doorgeven:

- `collect_item`: een interessante drop dichtbij wordt opgepakt met de bestaande pickup-routine.
- `dig_block`: een nuttig blok dichtbij, zoals hout, steen, coal ore of iron ore, wordt met de bestaande mining-routine gehakt.
- `attack_entity`: een nabije hostile mob kan een aanval/reflex triggeren.
- `equip_item`: bij gevaar of lage health probeert de bot armor, wapen en shield te equippen.

Dit blijft bewust begrensd: de flybrain mag acties triggeren, maar Mineflayer voert de veilige Minecraft-handeling uit. Daardoor kan de bot echte acties doen zonder dat het connectoom zelf recipes, block breaking rules of inventory-details hoeft te begrijpen.
## Fase 4: complex gedrag en crafting

Fase 4 maakt flybrain mode praktischer voor langere sessies. De driver geeft nu extra sensoren door over inventory, vastlopen, beweging en bouwblokken. Daaruit kunnen deze intenties ontstaan:

- `craft_item`: maakt basisitems zoals `crafting_table`, `wooden_pickaxe` of `stone_pickaxe` wanneer de inventory daar aanleiding voor geeft.
- `manage_inventory`: gebruikt de bestaande storage/cleanup-logica zodra de inventory bijna vol is.
- `place_block`: plaatst een eenvoudig support-block als de bot probeert te bewegen maar vast lijkt te zitten.
- `explore_area`: start de bestaande exploratie-routine wanneer de omgeving rustig is en er exploratiedrang is.
- `rest`: stopt beweging wanneer health/food veilig zijn en er geen sterke prikkel is.

Dit betekent niet dat het biologische connectoom zelf Minecraft-recipes begrijpt. De connectoom-output en sensoren leveren reflexen en drang; de Node/Mineflayer-adapter vertaalt die naar veilige Minecraft-acties.

## MOET-checklist implementatie

Deze ronde heeft de flybrain-integratie dichter bij de gewenste architectuur gebracht:

- De bridge staat nu project-eigen in `src/flybrain/FlyBrainBridge.java`; de genegeerde upstream-map blijft alleen bron voor de officiële brain classes en connectoomdata.
- De bridge gebruikt per tick de volgorde `SensoryFrame` vullen -> `SensoryEncoders.apply()` -> `LifNetwork.runMs(50)` -> `MotorDecoder.update()` -> `LifNetwork.endTick(50)`.
- De Node-driver draait op 50 ms en berekent yaw/pitch rates met gemeten delta-tijd.
- Java blijft persistent draaien: het connectoom wordt bij `ai flybrain on` geladen en daarna hergebruikt tot de bridge stopt.
- Retina-input wordt nu gevuld vanuit Mineflayer-raycasts over een grof gezichtsveld. Meerdere objecten worden tegelijk doorgegeven.
- Visuele objecten gebruiken line-of-sight raycasts, expansion op basis van hoekgrootteverschil en angular speed op basis van azimuthverschil.
- Geur komt nu van echte Minecraft-bronnen zoals food drops, dieren en crop-blokken. Honger is geen geur meer.
- Smaak wordt alleen tijdelijk geactiveerd na een echte eetactie via `recordTaste()`.
- Touch gebruikt nu Minecraft-contactsignalen zoals muur voor het hoofd, block onder voeten, water, cobweb, damage en airborne state.
- `flyLike` staat niet meer automatisch aan voor spelers.
- De bridge stuurt extra MotorDecoder-output terug: `flightPower`, `flightYaw`, `landing`, `wingMotor`, `feed`, `groom*`, `courtship`, `song`, `legMotor`, `legMotorAsym`, `wallMs` en `realtimeFactor`.
- De motoradapter gebruikt feed, landing, flight en groom: feed kan echt eten, landing remt springen, escape sprint/jumpt, groom swingt de arm als zichtbare/debugactie.
- De MinecraftExecutive is expliciet gescheiden in `computeMinecraftExecutiveIntent()`. Crafting, inventory, recipes en abstracte Minecraft-taken blijven daar, niet in het biologische connectoom.
- Pathfinder blijft onder het brein beschikbaar voor lange doelen zoals eten zoeken, vluchten, mining en exploratie.
- Mining/crafting/inventory/combat gebruiken de bestaande veilige Mineflayer-skills, terwijl de flybrain-sensoren gevaar, zicht, beweging, damage en contact blijven bijwerken.
- De driver heeft een watchdog voor verdwenen/te trage brainframes, slechte JSON en Java-exit; bij problemen stopt hij controls.
- De HUD toont nu tick/latency/realtime-factor plus feed/flight/landing/groom/motorstatus.
- `tools/verify-fly-brain.ps1`, `tools/flybrain-scenarios.ps1` en `tools/bench-fly-brain.ps1` controleren installatie, scenarioframes en performance.
- `package.json` heeft `npm run flybrain:verify`, `npm run flybrain:test` en `npm run flybrain:bench`.
- De README vermeldt JDK 21+ en de FlyBrain controlescripts.

Nog steeds belangrijk: Minecraft-integratietests met echte werelden blijven afhankelijk van een draaiende Minecraft-server. De scripts controleren nu de bridge en scenarioframes zonder server; echte survivalduurtests moet je draaien met een lokale testwereld.

## Aanbevolen uitbreidingen uit make.md

De resterende adviespunten zijn ook verwerkt:

- Wind/self-motion gebruikt nu verschillende linker- en rechterantenne-signalen op basis van snelheid, kijkrichting en zijwaartse flow.
- Tilt/gravity, airborne, legsOnGround en wingbeat worden naar `SensoryFrame` gestuurd.
- Minecraft-geluiden worden vertaald naar `soundLow`, `soundHigh` en `song` via Mineflayer sound-events.
- De Flybrain-tab toont nu echte sensorinput: retina sample count, zichtbare objecten, geurbron/richting, taste, touch, wind en brain timing.
- `tools/survival-fly-brain.ps1` is toegevoegd als langere survival-monitor. Die gebruikt `/api/status` en schrijft meetresultaten weg met tijdstempel.
- Het npm-pakket is hetzelfde gebleven; er is geen nieuwe package-naam of aparte brain-package gemaakt.
- `FLYBRAIN_STRICT_SENSORIMOTOR=1` schakelt MinecraftExecutive-intenties uit om het einddoel eerlijk te testen: Minecraft-sensoren -> officiële encoders -> MaleCNS -> officiële motor decoder -> Mineflayer controls.
