# Plastic Front (3D)

Toy-soldier auto-battler rendered with three.js. Each round every army spends its supply
on soldiers, vehicles and fortifications inside its deployment zone, then the battle plays
out on its own for 40 seconds. Survivors stay on the field, reinforcements follow, and the
last headquarters standing wins.

Features: 2–8 armies on maps that grow with the number of armies, infantry (incl. AA missile
soldiers), vehicles, aircraft (fighters, ground-attack planes, bombers, paratroop transports,
helicopters), defences and fortifications. Soldiers are often wounded rather than killed:
comrades drag them to cover and field ambulances carry them home, and everyone saved fights
again next round. Explosions cause friendly fire.

Battlefields (all free and offline):
- random, per floor theme;
- the built-in map library (`src/data/maps.js`);
- map files (`*.pfmap.json`): "Save map" in the top bar, "Load a map file" in setup (`src/mapfile.js`);
- a hand-drawn map: draw with markers on paper (black = walls/books, red = LEGO, blue = spills,
  green = low cover), photograph it, and it is read on the device by colour (`src/drawn.js`);
- the map editor (setup → Map editor; `src/editor.js`).

Advanced (hidden in setup): Claude can design a map from a description or a photo using the
player's own Anthropic API key (`src/claude.js`).

- `src/sim/` — deterministic battle simulation (no DOM, no `Math.random`): the same map,
  seed and placement orders always produce the same battle, which is what online play
  will build on.
- `src/render/` — procedural plastic models, household terrain, effects and the three.js view.
- `src/data/catalog.js` — every unit, defence and fortification with its stats.

```
npm install
npm run dev     # local dev server
npm test        # AI-vs-AI games, checks the simulation is deterministic
node test/air.test.mjs   # scripted aircraft / paratrooper / ambulance battle
npm run build   # writes a single self-contained ../plastic-front/index.html
```
