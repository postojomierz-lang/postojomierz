// Hand corrections of walking time for difficult passages, where the norms (distance and height only)
// fall well short of the signpost times: chains, ladders and queues. Each stretch is found along the
// trails from `a` to `b` (lon, lat); its time is multiplied by `factor`. `oneway` stretches may be walked
// from a to b only (as marked on the ground), so the planner never routes them backwards.
// Factors: fitted to the signpost times (tools/calibrate_times.mjs); Orla Perć from its 6-8 h for Zawrat - Krzyżne.
export const CORRECTIONS = [
  { name: 'Priečne sedlo (Zbojnícka chata → Téryho chata)', a: [20.167602, 49.176634], b: [20.198974, 49.190216], factor: 1.33, oneway: true },
  { name: 'Orla Perć: Zawrat → Kozi Wierch', a: [20.01639, 49.219091], b: [20.028705, 49.218317], factor: 2.1, oneway: true },
  { name: 'Orla Perć: Kozi Wierch → Skrajny Granat', a: [20.028705, 49.218317], b: [20.033293, 49.226945], factor: 2.1 },
  { name: 'Orla Perć: Skrajny Granat → Krzyżne', a: [20.033293, 49.226945], b: [20.047278, 49.228652], factor: 2.1 },
];
