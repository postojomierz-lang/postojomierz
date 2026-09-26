# Plastic Front (3D)

Toy-soldier auto-battler rendered with three.js. Each round every army spends its supply
on soldiers, vehicles and fortifications inside its deployment zone, then the battle plays
out on its own for 40 seconds. Survivors stay on the field, reinforcements follow, and the
last headquarters standing wins.

- `src/sim/` — deterministic battle simulation (no DOM, no `Math.random`): the same map,
  seed and placement orders always produce the same battle, which is what online play
  will build on.
- `src/render/` — procedural plastic models, household terrain, effects and the three.js view.
- `src/data/catalog.js` — every unit, defence and fortification with its stats.

```
npm install
npm run dev     # local dev server
npm test        # AI-vs-AI games, checks the simulation is deterministic
npm run build   # writes a single self-contained ../plastic-front/index.html
```
