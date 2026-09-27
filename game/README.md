# Plastic Front (3D)

Toy-soldier auto-battler rendered with three.js. Each round every army spends its supply
on soldiers, vehicles and fortifications inside its deployment zone, then the battle plays
out on its own for 40 seconds. Survivors stay on the field, reinforcements follow, and the
last headquarters standing wins.

Features: 2–6 armies on maps that grow with the number of armies, infantry (incl. AA missile
soldiers), vehicles, aircraft (fighters, ground-attack planes, bombers, paratroop transports,
helicopters), defences and fortifications. Soldiers are often wounded rather than killed:
comrades drag them behind the nearest cover, medics heal them on the spot, and cautious
field ambulances carry them home, and everyone saved fights
again next round. Engineer trucks lay belts of tank traps, anti-tank or anti-personnel mines
across the enemy's way in front of the base. Explosions cause friendly fire.

With 3 or more armies the battle is fought on a round table: headquarters sit at the corners of a
regular polygon, so every army is equally far from its neighbours, and random obstacles are
rotationally symmetric. Every round each army gets orders: a main target (or the nearest enemy)
and Attack or Defend. A battle has at most 6 armies.

Scenarios: the setup screen lists 43 historical battles grouped by front (Western Europe, the
Eastern Front, Poland, North Africa and the Mediterranean, the Pacific, the Winter War), each with a
fitting battlefield and options and a short briefing (`src/data/scenarios.js`). The battles stay fair
and symmetric; a scenario sets the scene rather than replaying history. Air and sea battles are left
out (the game is fought on land).

Battlefields (all free and offline):
- **Normandy countryside** (the default): a model-railway style diorama generated from the seed —
  small fields boxed in by bocage hedgerows on earth banks (a Voronoi diagram of fields, copied once
  per army so it is fair; hedges block movement and sight, each has a gate), dirt lanes from every
  base to the middle, stone farmhouses with timber-framed barns, dry-stone walls, hay bales, ponds,
  orchards and shell craters. The countryside carries on beyond the play area into low hills, and
  the board sits on a wooden table (`src/sim/map.js` → `normandy()`, `src/render/diorama.js`);
- **Town in ruins**: old-town blocks between cobbled streets (again a symmetric Voronoi diagram),
  an avenue from every base to the square with its monument, stone town houses with plaster fronts
  and shop fronts, churches, and many houses in ruins: soldiers on foot can get into a ruin and fight
  from it with good cover (vehicles can't), and infantry in a firefight next to one moves in. Rubble,
  barricades and anti-tank hedgehogs block the streets in places. Often a river in stone quays with
  arched bridges runs through the town (straight through the middle with two armies, a ring round
  the old town with more); only amphibians can swim it (`town()` in `src/sim/map.js`);
- **Beach landing**: every army comes ashore on its own beach with the sea behind it (two armies:
  beyond both short edges; more: the board is an island), past beach obstacles (Czech hedgehogs,
  Belgian gates, log stakes with mines), barbed wire and dunes, towards a belt of fortifications
  round a lighthouse in the middle: gun casemates, pillboxes, Tobruk pits and trenches, which
  infantry can get into and fight from like ruins. Landing craft lie on the sand at the water's
  edge (`beach()` in `src/sim/map.js`);
- **Winter forest** (the Ardennes): snowy spruce forests between clearings and lanes, a small village
  of stone farmhouses, foxholes, log piles, fallen trees and frozen ponds. Soldiers on foot can move
  and take cover among the trees; vehicles keep to the lanes and clearings (`winter()`);
- **Desert** (North Africa): sand and gravel with rocky outcrops, escarpment ridges and dunes, a
  desert track, an oasis in the middle with palms, a pool and mud-brick houses (some in ruins),
  stone sangars that infantry fight from, burnt-out tanks, oil drums and minefields behind wire
  (`desert()`);
- **Jungle** (the Pacific): dense jungle that infantry can move and hide in (vehicles keep to the
  muddy trails and clearings), a river with wooden bridges, a village of stilt huts, coconut-log
  bunkers that infantry fight from, giant banyans, bamboo and a crashed fighter (`jungle()`);
- **Mountains and fortress**: rock massifs really rise from the board (they block movement and
  sight), with passes where the lanes run, alpine meadows, fir woods, boulders, scree and stone
  houses; a fortress stands in the middle: battlemented walls you can shoot over, a gatehouse facing
  every army, round towers and a keep (`mountain()`, `fortress()`). Options: `snow` (mountains in
  winter); any diorama can have the fortress (`fortress: true`), the Normandy fields can be open
  steppe (`steppe`) and a beach black volcanic sand or a tropical island with palms (`sand`, `tropic`);
- the classic toy room: random floors with household obstacles, the built-in map library
  (`src/data/maps.js`), map files (`*.pfmap.json`: "Save map" in the top bar, "Load a map file" in
  setup; `src/mapfile.js`) and the map editor (setup → Map editor; `src/editor.js`).

Advanced (hidden in setup): Claude can design a toy-room map from a description using the
player's own Anthropic API key (`src/claude.js`).

- `src/sim/` — deterministic battle simulation (no DOM, no `Math.random`): the same map,
  seed and placement orders always produce the same battle, which is what online play
  will build on.
- `src/render/` — models, the Normandy diorama, household terrain, effects and the three.js view.
- `src/data/catalog.js` — every unit, defence and fortification with its stats.

```
npm install
npm run dev     # local dev server
npm test        # AI-vs-AI games, checks the simulation is deterministic
node test/air.test.mjs   # scripted aircraft / paratrooper / ambulance battle
node test/medic.test.mjs # wounded dragged to cover, medics heal, ambulances avoid fire
node test/engineer.test.mjs # engineers lay tank traps and mines; mines go off under the enemy only
node test/orders.test.mjs # main target steers the army, Defend keeps it home
npm run build   # writes a single self-contained ../plastic-front/index.html
```

## Credits

Nations: every army picks a nation on the setup screen (the rules and numbers are the same for
all). The Americans are built into the game; every other nation's own soldiers, vehicles, aircraft
and headquarters are a file next to the game (`public/nation-<id>.js`, packed by `npm run figures`
from `python tools/blender/army_men.py --nation=<id>` and `tools/blender/vehicles_<id>.py`) that is
downloaded only when that nation takes the field. Germany: Stahlhelms, marching boots, Kar98k,
MG 42, Panzerschreck, Fliegerfaust, stick grenades and officers' caps; Kuebelwagen, Opel Blitz,
Sd.Kfz. 222, Schwimmwagen, Panzer II, Panzer IV, Tiger I, Panzerwerfer 42, Flettner Fl 282, Bf 109,
Ju 87 Stuka, He 111, Ju 52 and a concrete command bunker. Soviet Union: SSh-40 helmets, the
gymnastyorka with the rolled greatcoat over the shoulder and the sidor, kirza boots, Mosin with its
spike bayonet, DP-28, PTRD and PTRS anti-tank rifles, RGD-33 grenades; GAZ-67, ZiS-5, BA-64, T-38,
T-70, T-34, IS-2, BM-13 Katyusha on a ZiS-6, the Kamov A-7 autogyro, Yak-3, Il-2, Pe-2, Li-2 and a
log dugout command post. Great Britain: the Brodie helmet, battledress with '37 webbing and its
big chest pouches, short anklets, beret for the officers, Lee-Enfield, Bren, PIAT, the Boys
anti-tank rifle; Universal (Bren) Carrier, Austin K2 ambulance, Bedford truck, Daimler armoured
car, Terrapin, Tetrarch, Cromwell, Churchill, a Bedford with the Land Mattress launcher, the Cierva
C.30 autogyro, Spitfire, Typhoon, Lancaster, the Bristol Bombay transport and a sandbagged Nissen hut. Japan: the
Type 90 helmet with the star and neck flaps, puttees, the knapsack with its blanket roll, field
cap and sword for officers, Arisaka with the long Type 30 bayonet, Type 96 LMG, Type 97 anti-tank
rifle, Type 89 knee mortar, Type 97 grenades; Kurogane, Isuzu Type 94, Ho-Ha half-track, Ka-Mi
amphibious tank, Ha-Go, Chi-Ha (with its handrail aerial), Chi-To, rocket rails on an Isuzu, the
Kayaba Ka-1 autogyro, Zero, Val, Betty, the Ki-57 'Topsy' transport and a field headquarters house. France:
the Adrian helmet with its crest and badge, puttees, the M1935 pack with its rolled blanket and
mess tin, kepi for officers, MAS-36 with the spike bayonet, FM 24/29 with its top magazine (and
American bazookas, as issued to the Free French); Laffly V15T, Renault lorries, Panhard 178,
R35, Somua S35, Char B1 bis, the LeO C.30 autogyro, Dewoitine D.520, Breguet 693, LeO 451, the
Potez 650 paratroop transport and a stone farmhouse, plus a Laffly amphibian and a Renault with a
rocket rack in the style of the time (France fielded neither).
Italy: the M33 helmet, the bustina side cap for officers, puttees, the M1939 pack with the telo
tenda rolled round it, Carcano with its folding bayonet, Breda 30 with the side magazine,
Solothurn anti-tank rifle, SRCM 'red devil' grenades; Fiat 508 CM, Fiat 626 cab-over lorries,
AB 41 armoured car, the amphibious L3 prototype, L6/40, M13/40, P26/40, D'Ascanio's D'AT3
helicopter with its coaxial rotors, Macchi C.202, Breda Ba.65, the three-engined SM.79 and SM.82
and a farmhouse with its dovecote tower, plus a Fiat 626 with launch rails in the style of the
time (Italy fielded no rocket lorry).
Every army mans its own emplacements (`tools/blender/structures_nations.py`): the Americans a
105 mm M2A1 howitzer, the M45 Quadmount, a water-cooled Browning and a guard tower with a searchlight;
Germany a Pak 40, a Flak 38, an MG 42 on its Lafette and a timber watchtower; the Red Army a
ZiS-3, a 61-K, a Maxim on its Sokolov mount behind logs and a log tower; Britain a 25-pounder on
its firing platform, a Bofors, a Vickers and a scaffold-tube post; Japan a Type 92 battalion gun,
the Type 96 twin 25 mm, the Type 92 'woodpecker' behind logs and a bamboo tower; France the 75 mle
1897, a Hotchkiss 25 mm, the Hotchkiss mle 1914 behind wicker gabions and a Maginot-style concrete
tower; Italy the 47/32, a Breda 20/65, a Breda 37 behind a dry-stone wall and a stone torretta.
Their walls and wire are their own too: Atlantic Wall concrete and a knife rest; a log palisade
or cribbed log wall and a double-apron fence; a corrugated-iron revetment and triple Dannert
concertina; a bamboo palisade and sharpened bamboo stakes; a village stone wall and the réseau
Brun; a tufa-block wall and a cavallo di Frisia (the Americans keep the brick wall and concertina).
So are their sandbags and tank traps: sandbags behind a wattle revetment and dragon's teeth;
sandbags under a log and the rail hedgehog of Moscow; a header-and-stretcher breastwork and a 1940
concrete cube; rice-straw bales and a lashed log obstacle; fascines under sandbags and Maginot
rails in concrete; a stone wall topped with sandbags and a concrete tetrahedron (the Americans keep
their sandbags and the Czech hedgehog). Their fuel stores and mines too: a drum with two jerrycans,
the Tellermine and the S-mine; a wooden barrel, the TM-41 and the PMD-6 box mine; a crate of
flimsies, the Mk V and a shrapnel mine; two drums on chocks, the Type 99 magnetic mine and the Type
93 'tape measure'; a wine barrel on its trestle, the mle 1936 box mine and a stake mine; a drum with
its hand pump, the B2 and the B4 (the Americans: the oil drum, the M1A1 and the M2 bounding mine).
And their paratroopers come down under their own canopies: the Germans' flat RZ 20 with every line
gathered behind the back, the Soviet PD-6 with its wide vent and tapes, the British X-type in 28
gores, the Japanese Type 1 with its scalloped skirt, a French canopy of light and dark panels and
the Italian Salvator with its crown pulled down (the Americans keep the T-5).
Each army is moulded in its nation's colour (`src/data/nations.js`): American green, German field
grey, Soviet red, British khaki tan, Japanese white, French horizon blue and Italian black; a second
army of the same nation, or one whose colour is taken, gets the first free colour.
Every ground vehicle flies its nation's flag in its real colours from a staff at the back
(`src/render/flags.js`, placed on the hull by a ray cast down onto the model): the 48-star flag, the
Balkenkreuz on field grey, the Soviet red with its star and hammer and sickle, the Union Jack, the
Hinomaru, the French tricolour and the Italian one with the shield of Savoy. The headquarters fly the same
flag from their flagpole, and every aircraft carries its national markings on the wings and both
sides of the fuselage (placed by ray casts onto the model too): the star and bars, the Balkenkreuz,
the red star, the RAF roundel, the Hinomaru, the French cocarde and the Italian fasces.
Tanks and armoured cars wear their army's markings on both sides of the hull and of the turret
(found as the narrower part above the hull), lorries on their cab doors (the widest flat side
at door height) and jeeps and amphibians on their sides and bonnet: the white star, the Balkenkreuz, the red star with a
broad white edge, the British white-red-white recognition flash, the Imperial Army's yellow star
(outlined, for the white plastic), the cocarde and an Italian company rectangle. Flags and
markings are placed on the bare model - tracks, fittings and windows included, the crew left out.
The soldiers wear their army's insignia, modelled as painted parts in `tools/blender/army_men.py`
(`insignia_head`, `insignia_sleeve`, `insignia_collar`): the Stars and Stripes on the left sleeve,
as worn in North Africa; the black-white-red shield on the right of the Stahlhelm; the red star on
the Soviet helmet and cap; the Union flag on the British sleeve; the Japanese helmet star in
yellow; the Free French cross of Lorraine on the sleeve; and the Italian stellette on the collar. The
officers' caps carry their badges too: the Reich's cockade and a silver eagle on the German
peaked cap, the red star on the Soviet one, a gold badge on the British beret and the Italian
bustina, the French kepi's gold badge and rank stripes; the American officer, in his helmet,
wears a captain's two silver bars on it.

The army men (18 poses: riflemen standing, kneeling and prone, officer, machine gunner, sniper,
bazooka, AA missile, grenadier, medic, rescuer, sapper, the MG-nest gunner and the tower lookout)
were modelled for the game in the free Blender by `tools/blender/army_men.py`: a soft moulded body
with crisp helmet, weapons and kit, each on its stand (run it with `pip install bpy`, then
`python tools/blender/army_men.py`, then `npm run figures`, which writes `src/data/figures.js`).
The vehicles and aircraft are WW2 machines modelled the same way by `tools/blender/vehicles.py`
(lofted bodies, rounded tyres, airfoil wings, track belts of links): Willys jeep, Dodge WC54
ambulance, GMC engineer truck, M8 Greyhound armoured car, DUKW amphibian, the M5 Stuart, M4 Sherman and M26 Pershing (light, medium and heavy tanks), Studebaker
with a Katyusha launcher, a Sikorsky-style helicopter, P-51 Mustang, P-47 Thunderbolt, B-25
Mitchell and C-47 Dakota; drivers, gunners and commanders ride in them, the headquarters and
fortifications (sandbags, brick walls, barbed wire, oil drum, tank trap) are made by
`tools/blender/structures.py` and the emplacements (MG nest with its gunner, field gun, AA gun,
watchtower with a lookout) and the mines by `tools/blender/structures_nations.py`; all of them are packed into
`src/data/vehicles.js`.
The diorama scenery is Blender-made as well: `tools/blender/scenery.py` (Normandy: hedgerows, oaks,
apple trees, farmhouse, barn, walls, hay, reeds, craters) and `tools/blender/town.py` (town houses,
shop fronts, ruins, church, monument, rubble, barricade, hedgehog, bridge, quay, street lamp) and
`tools/blender/winter.py`, `desert.py`, `jungle.py`, `mountain.py` (spruces, farmhouse, palms,
mud-brick houses, wrecks, rainforest trees, huts, bunkers, firs, the fortress...) and
`tools/blender/beach.py` (casemate, pillbox, Tobruk pit, trench, barbed wire, Belgian gate, stakes,
dune, lighthouse, rocks, landing craft, minefield sign), packed
into `src/data/scenery.js` (buildings also come in a light version for the town beyond the table edge).
The parachute is in `vehicles.py` too.
The scenery of each diorama is a separate file too (`public/scenery-<battlefield>.js`, built by
`npm run figures`), downloaded when a battle on it starts.
Every model has a detailed
close-up version and a light one for distant units; the data is meshopt-compressed.

## Online play

"🌐 Play online" on the setup screen: one player hosts a room (5-letter code or invite link
`...?join=CODE`), friends join, the host starts; armies nobody plays are commanded by the computer.
Browsers connect peer-to-peer over WebRTC ([PeerJS](https://peerjs.com); its free public broker only
introduces the players). Because the simulation is deterministic, players only exchange their
deployment orders: each round everyone deploys, presses **Ready**, the host collects the orders and
sends the full set back, every browser rebuilds the same deployment and plays the same battle.
When a network blocks direct browser-to-browser connections, the messages go through a TURN
relay: by default the free [Open Relay](https://www.metered.ca/tools/openrelay/) by Metered
(static-auth mode, short-lived credentials computed in the browser, no account needed). "Connection
settings" in the online dialog can force or disable the relay, or point to your own TURN server or
Metered account; the lobby shows whether each player is connected directly or through the relay.
A player who leaves (or stays silent for a minute) is replaced by the computer. If the host leaves,
the game goes on: the remaining player with the lowest army number opens a new room
(`<code>-<n>-<army>`), the others reconnect to it automatically and re-send their orders (or the last
round start they got), so every copy stays identical; the old host's army goes to the computer. For testing on one
machine add `?localnet` to the URL: tabs of one browser then talk over a BroadcastChannel.
