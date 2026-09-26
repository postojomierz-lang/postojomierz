# Notes for Claude

- The owner writes in Polish; reply in Polish.
- Workflow: after a fix or feature is implemented, tested and pushed to the working branch,
  create a pull request to `main` and merge it straight away, without asking first.
  Then share the PR link.
- The game lives in `game/` (Vite + three.js); `npm run build` writes the single-file build to
  `plastic-front/index.html`, which is committed and served by GitHub Pages from `main`.
