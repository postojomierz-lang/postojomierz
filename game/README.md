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

The army men (18 poses: riflemen standing, kneeling and prone, officer, machine gunner, sniper,
bazooka, AA missile, grenadier, medic, rescuer, sapper, the MG-nest gunner and the tower lookout)
were modelled for the game in the free Blender by `tools/blender/army_men.py`: a soft moulded body
with crisp helmet, weapons and kit, each on its stand (run it with `pip install bpy`, then
`python tools/blender/army_men.py`, then `npm run figures`, which writes `src/data/figures.js`).
The vehicles and aircraft (jeep, ambulance, engineer truck, armored car, amphibian, tank, rocket truck, helicopter,
fighter, ground-attack plane, bomber, transport) are modelled the same way by
`tools/blender/vehicles.py`, and the headquarters, emplacements (MG nest with its gunner, field gun,
AA gun, watchtower with a lookout) and fortifications (sandbags, brick walls, barbed wire, oil drums, tank traps, mines)
by `tools/blender/structures.py`; all of them are packed into `src/data/vehicles.js`.
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
