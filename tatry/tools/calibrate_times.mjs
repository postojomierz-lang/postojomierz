// Fits the walking-time norms of the planner (src/planner/graph.js NORMS) to the signpost times in
// tools/reference_times.json: ↑ is the time uphill, ↓ downhill (direction from the heights of the ends).
// Run: node tools/calibrate_times.mjs [--fit]   (prints each stretch; --fit searches the norms)
import fs from 'fs';
import { TrailGraph, setNorms, NORMS, fmtTime } from '../src/planner/graph.js';

const data = JSON.parse(fs.readFileSync(new URL('../public/data/region/trails.json', import.meta.url)));
const ref = JSON.parse(fs.readFileSync(new URL('./reference_times.json', import.meta.url)));
const pairs = [];
function evaluate(norms, verbose = false) {
  setNorms(norms);
  const G = new TrailGraph(data);
  let err = 0, n = 0;
  const rows = [];
  for (const [a, b, tUp, tDown] of ref.times) {
    const va = G.snap(...ref.places[a], 250), vb = G.snap(...ref.places[b], 250);
    if (va < 0 || vb < 0) { rows.push(`${a} – ${b}: poza siecią`); continue; }
    const [lo, hi] = G.H[va] <= G.H[vb] ? [va, vb] : [vb, va];
    for (const [s, t, want, dir] of [[lo, hi, tUp, '↑'], [hi, lo, tDown, '↓']]) {
      if (want == null) continue;            // a one-way passage: this direction is not walked
      const p = G.route(s, t);
      if (!p) { rows.push(`${a} – ${b} ${dir}: brak trasy (jednokierunkowy?)`); continue; }
      const got = G.summary(p).time;
      const e = Math.log(got / want);
      err += e * e; n++;
      rows.push(`${(e >= 0 ? '+' : '') + Math.round((got / want - 1) * 100)}%\t${dir} ${a} – ${b}: ${fmtTime(got)} (tablica ${fmtTime(want)})`);
    }
  }
  if (verbose) console.log(rows.join('\n'));
  return Math.sqrt(err / n);
}
if (process.argv.includes('--fit')) {
  let best = { ...NORMS }, bestE = evaluate(best);
  console.log('start', bestE.toFixed(3), JSON.stringify(best));
  // coordinate search, a few rounds
  const steps = { flat: 0.25, up: 0.5, upSteep: 1, down: 0.5, downSteep: 1, steepUp: 0.05, steepDown: 0.05 };
  for (let round = 0; round < 4; round++) {
    for (const k of Object.keys(steps)) {
      for (const dirn of [1, -1]) {
        for (let tries = 0; tries < 8; tries++) {
          const cand = { ...best, [k]: +(best[k] + dirn * steps[k]).toFixed(3) };
          if (cand[k] <= 0) break;
          const e = evaluate(cand);
          if (e < bestE - 1e-4) { best = cand; bestE = e; } else break;
        }
      }
    }
    console.log('round', round, bestE.toFixed(3), JSON.stringify(best));
  }
  evaluate(best, true);
} else {
  console.log('rms log error', evaluate({ ...NORMS }, true).toFixed(3));
}
