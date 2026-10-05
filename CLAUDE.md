# Notes for Claude

- The owner writes in Polish; reply in Polish.
- End replies with `🔵 **Możliwe kolejne kroki:**` and the steps as a numbered list (1., 2., 3. …, one per line), so the
  owner can answer with a number; commands to paste (/koncze, /compact …, /clear) each in its own code block; no HTML.
- Workflow: after a fix or feature is implemented, tested and pushed to the working branch,
  create a pull request to `main` and merge it straight away, without asking first.
  Then share the PR link.
- The game lives in `game/` (Vite + three.js); `npm run build` writes the single-file build to
  `plastic-front/index.html`, which is committed and served by GitHub Pages from `main`.
- Tatry Mobile (Szlakownik, `tatry/`): read the handoff note `docs/tatry-mobile.md` first (state, the owner's
  preferences, work in progress, plans, known problems).
- `tatry/` (Vite + three.js) is the Rysy 3D hiking prototype; `npm run build` writes `rysy/index.html`.
  The planner's online part (`tatry/src/planner/online.js`) needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the
  environment at build time, otherwise it is built without it (the build warns).
  Terrain data is prepared by `tatry/tools/prepare.py` into `tatry/src/data/` (committed).
- Handoff: `HANDOFF.md` in the repo root is the session handoff note (committed, so cloud sessions see it;
  a SessionStart hook prints it). When the owner writes "kończę", "koncze przed 400K", "handoff" or uses
  `/koncze`, overwrite it (max 15 lines, Polish: cel, stan, decyzje, zmienione pliki i PR, następny krok,
  komendy), commit and push it to the working branch.

## Compact instructions

When compacting keep: the task and project goal, project conventions and the owner's preferences, decisions
(with a short reason), changed files and PR links, unresolved errors and open questions, the next steps.
Drop: old logs, test output (keep only the verdict), screenshots, exploration of finished tasks.
