# Notes for Claude

- The owner writes in Polish; reply in Polish.
- Workflow: after a fix or feature is implemented, tested and pushed to the working branch,
  create a pull request to `main` and merge it straight away, without asking first.
  Then share the PR link.
- The game lives in `game/` (Vite + three.js); `npm run build` writes the single-file build to
  `plastic-front/index.html`, which is committed and served by GitHub Pages from `main`.
- `tatry/` (Vite + three.js) is the Rysy 3D hiking prototype; `npm run build` writes `rysy/index.html`.
  The planner's online part (`tatry/src/planner/online.js`) needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the
  environment at build time, otherwise it is built without it (the build warns).
  Terrain data is prepared by `tatry/tools/prepare.py` into `tatry/src/data/` (committed).
