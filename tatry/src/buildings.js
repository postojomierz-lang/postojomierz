// Buildings from OpenStreetMap footprints (tools/prepare_buildings.py). The mountain huts by the trails are
// drawn after the real ones (tables HUTS below: walls of logs, stone or plaster, a stone ground floor, the
// number of floors, roof shape, pitch and colour, from photos of each hut); the other buildings get a look
// from their name and size: hotels, churches, schools and other large buildings plastered with hipped roofs,
// houses of wood in the Zakopane / Liptov style (steep roofs, often half-hipped), small wooden shepherd huts
// (szałas). Roofs of wide buildings are kept low instead of rising to a giant gable. Colours vary from one
// building to the next (vertex colours over the shared textures). Textures: Poly Haven (CC0).
import * as THREE from 'three';
import { patchShading } from './materials.js';

const STYLE = {
  hut: { wall: 'logs', floorH: 2.9, pitch: 52, eave: 1.1, gable: 0.7, plinth: 1.0, windows: 2.5, chimney: 2, base: 1 },
  old_hut: { wall: 'logs', floorH: 2.2, pitch: 55, eave: 0.9, gable: 0.5, plinth: 0.7, windows: 2.6, chimney: 1 },
  house: { wall: 'logs', floorH: 2.7, pitch: 48, eave: 0.8, gable: 0.4, plinth: 0.5, windows: 2.8, chimney: 1 },
  stone_hut: { wall: 'stone', floorH: 2.8, pitch: 35, eave: 0.5, gable: 0.3, plinth: 0.3, windows: 3.2, chimney: 1 },
  szalas: { wall: 'planks', floorH: 2.0, pitch: 50, eave: 0.6, gable: 0.3, plinth: 0.25, windows: 0, chimney: 0 },
  shed: { wall: 'planks', floorH: 2.3, pitch: 40, eave: 0.4, gable: 0.2, plinth: 0.2, windows: 0, chimney: 0 },
  plaster: { wall: 'plaster', floorH: 3.0, pitch: 32, eave: 0.7, gable: 0.7, plinth: 0.6, windows: 2.6, chimney: 2, hip: 1 },
};
// texture size in metres
const TILE = { logs: 2.5, planks: 2.2, stone: 2.0, roof: 2.4, plaster: 3.0 };
// tints (linear, over the material's texture and colour)
const WOOD = [1, 1, 1], DARK = [0.68, 0.62, 0.58], HONEY = [1.6, 1.5, 0.95], GREYWOOD = [0.85, 0.85, 0.86], REDWOOD = [1.3, 0.72, 0.58];
const CREAM = [1, 0.93, 0.8], WHITE = [1, 1, 1], YELLOW = [1, 0.9, 0.62], PALE = [0.86, 0.87, 0.88];
const SHINGLE = [0.86, 0.72, 0.58], GREY_ROOF = [0.82, 0.85, 0.9], DARK_ROOF = [0.5, 0.5, 0.53],
  RED_ROOF = [1.25, 0.62, 0.5], GREEN_ROOF = [0.58, 0.8, 0.6], BROWN_ROOF = [0.8, 0.58, 0.45];

// The huts and other buildings by the trails, after photos: [name, look]. base: floors of stone at the
// bottom; hip: how far the roof's ends are hipped (0 a gable, about 0.3 the half-hip of the Zakopane style,
// 1 a hipped roof).
const HUTS = [
  // Two-storey granite-masonry block with a low fully hipped dark green sheet roof (solar panels), joined to a one-storey dark-brown wooden annex with a low dark green roof standing on a ~2 m high stone p (high)
  [/T[ée]ryho/, { wall: 'stone', floors: 2, floorH: 3, pitch: 18, hip: 1, roofTint: GREEN_ROOF, eave: 0.4, chimney: 2, windows: 2.6, plinth: 0.5, terrace: { side: 1, d: 3, len: 0.45, tables: 4, rail: true, stone: true }, wings: [{ x: -0.24, z: 0, w: 0.52, d: 0.85 }, { x: 0.25, z: 0.05, w: 0.5, d: 0.7, wall: 'planks', wallTint: DARK, floors: 1, pitch: 14, hip: 0.3, plinth: 2 }] }],
  // Long low hut: one storey plus attic under a plain grey sheet gable roof (~28 deg) with a row of roof windows/small dormers; front wall dark-brown wooden boarding with white windows, gable end and corn (medium)
  [/^Zbojn[ií]cka chata/, { wall: 'planks', wallTint: DARK, floors: 1, pitch: 28, hip: 0, roofTint: GREY_ROOF, eave: 0.3, chimney: 2, windows: 2.2, plinth: 0.6, dormers: [{ n: 5, w: 0.9, side: 1 }], terrace: { side: 1, d: 2.5, len: 0.35, tables: 3, rail: true }, wings: [{ x: 0.08, z: 0, w: 0.84, d: 0.65 }, { x: -0.42, z: 0, w: 0.16, d: 0.65, wall: 'stone' }] }],
  // Bright yellow-painted horizontal plank cladding, two storeys plus attic, brown/red-brown sheet roofs with half-hips and hipped corners; composed of several wings (L-shape with a stone-faced ground-flo (medium)
  [/Zelen(om|é) ples/, { wall: 'planks', wallTint: HONEY, floors: 2, floorH: 2.8, pitch: 35, hip: 0.5, roofTint: BROWN_ROOF, eave: 0.8, chimney: 2, windows: 2.6, plinth: 0.8, porch: true, terrace: { side: 1, d: 3, len: 0.45, tables: 5, rail: true }, woodpile: -1, wings: [{ x: 0.12, z: 0.2, w: 0.76, d: 0.55 }, { x: -0.32, z: -0.15, w: 0.36, d: 0.7, across: true, floors: 2, base: 1 }, { x: 0.3, z: -0.3, w: 0.3, d: 0.35, floors: 1, pitch: 30, hip: 1 }] }],
  // Classic chalet with its gable facing the downhill path: dark brown wooden walls, two storeys plus attic, plain gable roof (~40 deg) in grey-green sheet with wide eaves; honey-coloured balcony with flo (high)
  [/^Zamkovského chata/, { wall: 'planks', wallTint: DARK, floors: 2, pitch: 40, hip: 0, roofTint: GREEN_ROOF, eave: 1, chimney: 1, windows: 2.4, plinth: 0.6, balcony: [{ floor: 1, side: 1, len: 0.6, x: 0 }], terrace: { side: 1, d: 3, len: 0.9, tables: 5, rail: true, stone: true }, wings: [{ x: 0, z: 0, w: 1, d: 1, across: true }] }],
  // Small single-storey hut of light-grey granite rubble masonry with a dark-grey wooden-shingle gable roof and a small dark timber porch roof on posts over the door; log benches/tables in the gravel yard (medium)
  [/Rainer/, { wall: 'stone', floors: 1, floorH: 2.6, pitch: 40, hip: 0, roofTint: DARK_ROOF, eave: 0.5, chimney: 1, windows: 3, porch: true, terrace: { side: 1, d: 2, len: 0.5, tables: 3, rail: false } }],
  // Long two-storey log chalet with dark-brown horizontal logs, honey-wood framed windows and honey-boarded gables with lattice railings; steep (~50 deg) red sheet roof with a small half-hip at the gable  (medium)
  [/Bil[ií]kov/, { wall: 'logs', wallTint: DARK, floors: 2, pitch: 50, hip: 0.3, roofTint: RED_ROOF, eave: 0.8, chimney: 2, windows: 2.2, plinth: 0.6, balcony: [{ floor: 2, side: 1, len: 0.3, x: 0 }], terrace: { side: 1, d: 3, len: 0.4, tables: 5, rail: true } }],
  // Single-storey hut clad in near-black vertical wooden boards with yellow window shutters and doors, an almost flat dark roof with green sheet edging, set against a big rock outcrop; open terrace with t (high)
  [/Skalnat[áa] chata/, { wall: 'planks', wallTint: DARK, floors: 1, floorH: 2.8, pitch: 8, hip: 1, roofTint: DARK_ROOF, eave: 0.4, chimney: 1, windows: 2.4, plinth: 0.4, terrace: { side: 1, d: 4, len: 0.6, tables: 4, rail: true } }],
  // Single-storey hut with golden/honey horizontal plank walls and a very low-pitched dark grey hipped roof, standing on a high dark-boarded lower level/platform; a terrace with dark X-pattern wooden rail (medium)
  [/Chata pod Soliskom/, { wall: 'planks', wallTint: HONEY, floors: 1, floorH: 3, pitch: 10, hip: 1, roofTint: DARK_ROOF, eave: 0.4, chimney: 1, windows: 2.2, plinth: 2, terrace: { side: 1, d: 3, len: 1, tables: 5, rail: true } }],
  // Sorea Hrebienok complex: a 3-storey white-plastered hotel block with a stone plinth and a steep dark grey/black mansard-like roof with dormers and long balconies, joined to a long single-storey white  (medium)
  [/^Horská ubytovňa Hrebienok/, { wall: 'plaster', wallTint: WHITE, floors: 3, pitch: 55, hip: 0.7, roofTint: DARK_ROOF, eave: 0.6, chimney: 2, windows: 2.6, plinth: 1, dormers: [{ n: 6, w: 1.6, side: 0 }], balcony: [{ floor: 1, side: 1, len: 0.35, x: -0.3 }, { floor: 2, side: 1, len: 0.35, x: -0.3 }], terrace: { side: 1, d: 4, len: 0.4, tables: 8, rail: true }, wings: [{ x: -0.3, z: -0.1, w: 0.4, d: 0.55 }, { x: 0.22, z: 0.1, w: 0.56, d: 0.6, floors: 1, floorH: 3.4, pitch: 20, hip: 1 }, { x: 0, z: -0.15, w: 0.14, d: 0.55, across: true, floors: 2, pitch: 55, hip: 0, roofTint: BROWN_ROOF }] }],
  // Compact two-storey block of grey granite rubble masonry on the summit, flat/very low roof of light grey sheet with masts and instruments; stone-walled platform around. Looks fortress-like from a dista (medium)
  [/Obserwatorium.*Kasprow/, { wall: 'stone', base: 2, floors: 2, floorH: 3, pitch: 5, hip: 1, roofTint: GREY_ROOF, eave: 0.3, chimney: 1, windows: 3, terrace: { side: 1, d: 3, len: 0.6, rail: true, stone: true } }],
  // Granite rubble-masonry station/restaurant built into the slope below the summit: stepped blocks of 1-3 storeys with low hipped light grey metal roofs and a flat-roofed taller block; big stone-paved te (medium)
  [/G[óo]rna stacja.*Kasprow/, { wall: 'stone', base: 2, floors: 2, floorH: 3.2, pitch: 12, hip: 1, roofTint: GREY_ROOF, eave: 0.5, chimney: 1, windows: 3, wings: [{ x: 0, z: -0.15, w: 0.7, d: 0.7 }, { x: 0.05, z: 0.25, w: 0.9, d: 0.5, floors: 1, pitch: 10 }, { x: 0.4, z: 0, w: 0.2, d: 0.6, across: true, floors: 3, pitch: 5 }], terrace: { side: 1, d: 4, len: 0.8, tables: 8, rail: true, stone: true } }],
  // Three-storey 1930s block with grey-beige rendered walls, small square windows and a granite rubble plinth; very low-pitched roof with a deep overhang and tall dark weathered-wood fascia; the cabin hal (medium)
  [/Po[śs]rednia stacja|My[śs]lenickie/, { wall: 'plaster', wallTint: PALE, plinth: 1.5, floors: 3, floorH: 3, pitch: 8, hip: 1, roofTint: BROWN_ROOF, eave: 1.5, windows: 3, wings: [{ x: 0.1, z: 0, w: 0.8, d: 1 }, { x: -0.42, z: 0.1, w: 0.16, d: 0.6, across: true, wall: 'stone', floors: 2, pitch: 8 }], terrace: { side: 1, d: 5, len: 0.4, rail: true, stone: true } }],
  // Same 1936 style as the middle station but smaller: pale grey plaster walls with granite rubble corners/plinth, a taller stone tower-like cabin hall at the cableway end, low roof with wide overhang. Se (low)
  [/Dolna stacja.*Kasprow|Ku[źz]nice.*kolej/, { wall: 'plaster', wallTint: PALE, plinth: 1.2, floors: 2, floorH: 3.2, pitch: 8, hip: 1, roofTint: BROWN_ROOF, eave: 1.2, windows: 3, wings: [{ x: -0.1, z: 0, w: 0.8, d: 1 }, { x: 0.4, z: 0, w: 0.2, d: 0.7, across: true, wall: 'stone', floors: 3, pitch: 6 }] }],
  // Low dark-wood pavilion dominated by a huge steep roof of weathered grey wooden shingle reaching almost to the ground, clipped/hipped ends; open front under the eaves with tables and white umbrellas, r (medium)
  [/W[łl]osienic/, { wall: 'logs', wallTint: DARK, plinth: 0.4, floors: 1, floorH: 2.5, pitch: 45, hip: 0.5, roofTint: DARK_ROOF, eave: 1.5, windows: 3.5, terrace: { side: 1, d: 5, len: 0.9, tables: 8, rail: true } }],
  // Granite rubble ground floor with red shutters, attic/upper part clad in dark grey sheet with small dormers and solar panels, moderate dark grey roof; a dark wooden steep-gabled annex at one end; built (high)
  [/Chata pod Rysmi/, { wall: 'stone', base: 1, floors: 1, floorH: 3, pitch: 28, roofTint: DARK_ROOF, eave: 0.4, chimney: 1, windows: 2.5, dormers: [{ n: 4, w: 1.2, side: 1 }], wings: [{ x: -0.1, z: 0, w: 0.8, d: 1 }, { x: 0.42, z: 0, w: 0.16, d: 1, wall: 'planks', wallTint: DARK, pitch: 45, floors: 1 }], terrace: { side: 1, d: 3, len: 0.6, tables: 3, stone: true } }],
  // Large hotel with a steep roof (formerly brown shingle, now dark grey) with rows of gabled dormers and a big central front cross-gable decorated with a sunburst; wood-clad walls (dark brown before, hon (high)
  [/Horsk[ýy] hotel Poprad|Chata pri Popradskom/, { wall: 'planks', wallTint: HONEY, plinth: 1, floors: 2, floorH: 3, pitch: 45, hip: 0.3, roofTint: DARK_ROOF, eave: 1, chimney: 2, windows: 2.5, dormers: [{ n: 6, w: 1.5, side: 0 }], balcony: [{ floor: 1, side: 1, len: 0.7, x: 0 }], wings: [{ x: 0, z: -0.15, w: 1, d: 0.7 }, { x: 0, z: 0.15, w: 0.28, d: 0.75, across: true, floors: 3, hip: 0 }], terrace: { side: 1, d: 5, len: 0.5, tables: 8, stone: true } }],
  // Rebuilt (2010) small chalet: white render with dark brown half-timbering, steep dark grey gable roof with dark-boarded gable top, large framed windows; a low glazed veranda/lean-to on one side; stone  (medium)
  [/Majl[áa]th/, { wall: 'plaster', wallTint: WHITE, plinth: 0.6, floors: 1, floorH: 3.2, pitch: 50, roofTint: DARK_ROOF, eave: 0.6, chimney: 1, windows: 2.2, wings: [{ x: 0.1, z: 0, w: 0.8, d: 1 }, { x: -0.4, z: 0.1, w: 0.2, d: 0.6, floors: 1, pitch: 15, wall: 'planks', wallTint: DARK }] }],
  // Large chalet: granite rubble ground floor, two upper storeys of dark brown boards with white-framed windows, steep red sheet roof with gabled ends (small hip at apex), attic windows in the gable; benc (medium)
  [/^Chata Zverovka/, { wall: 'planks', wallTint: DARK, base: 1, floors: 3, floorH: 2.8, pitch: 45, hip: 0.15, roofTint: RED_ROOF, eave: 0.8, chimney: 1, windows: 2.5, dormers: [{ n: 3, w: 1.2, side: 1 }], terrace: { side: 1, d: 3, len: 0.4, tables: 4 } }],
  // Rebuilt hut (2017): orange-honey log walls on a stone plinth, steep dark blue-grey roof with a front cross-gable (two storeys of logs in the gable) and small dormers, granite-walled part at one end; t (high)
  [/[ŤT]atliakova/, { wall: 'logs', wallTint: HONEY, plinth: 0.6, floors: 1, floorH: 3, pitch: 45, roofTint: DARK_ROOF, eave: 0.6, chimney: 1, windows: 2.5, dormers: [{ n: 2, w: 1.2, side: 1 }], wings: [{ x: -0.1, z: 0, w: 0.8, d: 1 }, { x: -0.15, z: 0.2, w: 0.3, d: 0.7, across: true, floors: 2 }, { x: 0.42, z: 0, w: 0.16, d: 0.9, wall: 'stone', pitch: 40 }], terrace: { side: 1, d: 4, len: 0.6, tables: 5 } }],
  // New Žiarska chata: granite rubble ground floor, one storey of orange-honey timber with dark-framed windows, dark grey roof with three large gabled dormers on the front and solar panels; wooden-railed  (medium)
  [/^[ŽZ]iarska chata/, { wall: 'logs', wallTint: HONEY, base: 1, floors: 2, floorH: 2.9, pitch: 40, hip: 0.3, roofTint: DARK_ROOF, eave: 0.7, chimney: 1, windows: 2.5, dormers: [{ n: 3, w: 2.5, side: 1 }], wings: [{ x: 0, z: 0.2, w: 1, d: 0.6 }, { x: 0.25, z: -0.25, w: 0.35, d: 0.5, across: true, floors: 2 }], balcony: [{ floor: 1, side: 1, len: 0.4, x: 0.1 }], terrace: { side: 1, d: 4, len: 0.5, rail: true, stone: true, tables: 4 } }],
  // Long 1938 modernist block: cream plaster walls over a dark stone/brown-panelled ground floor, 3-4 storeys with regular rows of windows, very low-pitch dark gable roof with a deep bracketed overhang (s (high)
  [/Kalatówki/, { wall: 'plaster', wallTint: CREAM, base: 1, plinth: 0.8, floors: 4, floorH: 3, pitch: 14, hip: 0, roofTint: DARK_ROOF, eave: 1.5, chimney: 3, windows: 2.2, terrace: { side: 1, d: 4, len: 0.5, tables: 4, rail: true, stone: true }, woodpile: 1, wings: [{ x: 0, z: 0, w: 1, d: 0.62 }, { x: 0.3, z: 0.36, w: 0.3, d: 0.3, across: true, floors: 1, base: 1, wall: 'plaster', pitch: 10, eave: 0.5 }] }],
  // Massive granite-masonry hut (1925): two storeys of rough grey stone, above them a timber (light honey boards after renovation) top storey and attic in a steep gable roof with green sheet-metal skirt r (high)
  [/Murowaniec/, { wall: 'planks', wallTint: HONEY, base: 2, plinth: 0.5, floors: 3, floorH: 3, pitch: 52, hip: 0, roofTint: GREEN_ROOF, eave: 0.8, chimney: 2, windows: 2.6, dormers: [{ n: 3, w: 2.2, side: 0 }], terrace: { side: 1, d: 4, len: 0.6, tables: 5, rail: false, stone: true }, wings: [{ x: 0, z: 0, w: 1, d: 1 }, { x: 0.44, z: -0.3, w: 0.16, d: 0.32, floors: 4, base: 4, wall: 'stone', pitch: 60, hip: 1 }] }],
  // Large Zakopane-style timber hut (1908): dark-brown log/board walls on a low granite plinth, two storeys plus attic under a steep shingle roof with Zakopane half-hips, a projecting front cross-gable wi (high)
  [/^Schronisko PTTK (nad Morskim Okiem|przy Morskim Oku|Morskie Oko)/, { wall: 'logs', wallTint: HONEY, plinth: 0.6, floors: 2, floorH: 3, pitch: 50, hip: 0.3, roofTint: SHINGLE, eave: 1, chimney: 3, windows: 2.4, dormers: [{ n: 3, w: 2, side: 1 }, { n: 2, w: 2, side: -1 }], balcony: [{ floor: 2, side: 1, len: 0.3, x: 0.15 }], terrace: { side: 1, d: 3, len: 0.7, tables: 6, rail: true, stone: true }, wings: [{ x: 0, z: 0, w: 1, d: 0.8 }, { x: 0.15, z: 0.12, w: 0.3, d: 0.95, across: true, hip: 0.3, pitch: 52 }] }],
  // Former 1891 coach-house: single storey of dark reddish-brown vertical boards on a low stone plinth under a very steep, tall weathered grey shingle gable roof reaching low to the ground; small gabled d (high)
  [/Stare Schronisko/, { wall: 'planks', wallTint: REDWOOD, plinth: 0.4, floors: 1, floorH: 2.8, pitch: 56, hip: 0, roofTint: DARK_ROOF, eave: 0.9, chimney: 1, windows: 3, dormers: [{ n: 1, w: 1.8, side: 1 }], porch: true, terrace: { side: 1, d: 2, len: 0.6, tables: 0, rail: true, stone: false } }],
  // Small steep-roofed wooden hut: reddish-brown plank walls on a granite plinth, one storey plus attic under a tall dark grey shingle gable roof with a brick chimney; low pent-roofed lean-to along the fr (medium)
  [/Betlejemka/, { wall: 'planks', wallTint: REDWOOD, plinth: 0.6, floors: 1, floorH: 2.8, pitch: 55, hip: 0, roofTint: DARK_ROOF, eave: 0.7, chimney: 1, windows: 2.8, porch: true, wings: [{ x: 0, z: 0, w: 1, d: 0.8 }, { x: 0, z: 0.42, w: 0.7, d: 0.25, floors: 1, pitch: 20 }] }],
  // Long low granite-walled hut (1953): one storey of rough stone with stone pillars along the front terrace, under a huge steep wood-shingle roof (silver-grey when weathered, dark brown when new), mostly (high)
  [/Pięciu Stawów/, { wall: 'stone', plinth: 0.5, floors: 1, floorH: 3.2, pitch: 48, hip: 0.75, roofTint: SHINGLE, eave: 0.9, chimney: 2, windows: 2.6, dormers: [{ n: 2, w: 7, side: 1 }, { n: 2, w: 7, side: -1 }], terrace: { side: 1, d: 3.5, len: 0.7, tables: 8, rail: false, stone: true }, wings: [{ x: -0.12, z: 0, w: 0.76, d: 0.75 }, { x: 0.36, z: 0.05, w: 0.28, d: 1, across: true, hip: 0, pitch: 52 }] }],
  // Zakopane-style log hut: one storey of dark-brown logs on a low stone plinth under a steep dark wood-shingle roof with Zakopane half-hips, a row of small gabled dormers and a central decorated cross-ga (high)
  [/Dolinie Roztoki/, { wall: 'logs', wallTint: DARK, plinth: 0.4, floors: 1, floorH: 3, pitch: 50, hip: 0.3, roofTint: DARK_ROOF, eave: 0.9, chimney: 2, windows: 2.4, dormers: [{ n: 4, w: 1.6, side: 1 }, { n: 3, w: 1.6, side: -1 }], porch: true, terrace: { side: 1, d: 4, len: 0.7, tables: 6, rail: false, stone: false }, wings: [{ x: 0, z: -0.12, w: 1, d: 0.75 }, { x: 0, z: 0.3, w: 0.22, d: 0.4, across: true, hip: 0.3, pitch: 55 }, { x: -0.38, z: 0.2, w: 0.24, d: 0.6, across: true, hip: 0.3 }] }],
  // Big 1953 hut: two storeys of rough granite masonry with arched entrances, a dark-wood third storey set back under a dark shingle roof that is hipped with small gablets, a broad facjata dormer with a r (medium)
  [/^Schronisko PTTK na Polanie Chochołowskiej/, { wall: 'planks', wallTint: DARK, base: 2, plinth: 0.6, floors: 3, floorH: 2.9, pitch: 42, hip: 0.65, roofTint: DARK_ROOF, eave: 1, chimney: 3, windows: 2.4, dormers: [{ n: 1, w: 10, side: 1 }], terrace: { side: 1, d: 5, len: 0.6, tables: 8, rail: true, stone: true }, wings: [{ x: -0.15, z: 0, w: 0.7, d: 0.8 }, { x: 0.33, z: 0.1, w: 0.34, d: 1, across: true }] }],
  // T-shaped 1948 hut: a long one-storey log wing under a steep dark shingle roof with small dormers and solar panels, crossed by a taller block with a granite-masonry ground floor and a very steep plank- (high)
  [/Hali Ornak/, { wall: 'logs', wallTint: WOOD, plinth: 0.5, floors: 1, floorH: 3, pitch: 50, hip: 0, roofTint: DARK_ROOF, eave: 0.9, chimney: 2, windows: 2.5, dormers: [{ n: 3, w: 1.6, side: 1 }, { n: 3, w: 1.6, side: -1 }], terrace: { side: 1, d: 4, len: 0.8, tables: 8, rail: false, stone: true }, woodpile: -1, wings: [{ x: -0.1, z: -0.1, w: 0.8, d: 0.6 }, { x: 0.25, z: 0.1, w: 0.32, d: 1, across: true, wall: 'logs', base: 1, floors: 1, pitch: 56, hip: 0, balcony: [{ floor: 1, side: 1, len: 0.6, x: 0 }] }] }],
  // No photos found (hostel at Droga do Walczaków 46, Skibówki; OSM building:levels=3). Spec is a generic Zakopane guesthouse: plastered masonry on a stone ground floor, steep dark roof with half-hips and (low)
  [/Murań/, { wall: 'plaster', wallTint: WHITE, base: 1, plinth: 0.8, floors: 2, pitch: 45, hip: 0.3, roofTint: DARK_ROOF, eave: 0.8, chimney: 2, windows: 2.6, dormers: [{ n: 2, w: 2.2, side: 0 }], balcony: [{ floor: 1, side: 1, len: 0.6, x: 0 }], porch: true }],
  [/Hala Kondratowa/, { wall: 'logs', wallTint: HONEY, base: 0, plinth: 1.2, floors: 1, floorH: 3.0, pitch: 60, gablet: 0.3, roofTint: DARK_ROOF,
    eave: 1.0, chimney: 3, windows: 2.0, dormers: [{ n: 1, w: 7, side: 1 }, { n: 1, w: 5, side: -1 }],
    terrace: { side: 1, d: 4, len: 0.6, tables: 3, rail: true, stone: true } }],
  // Hotel Patria (1970s): two dark pyramids, the steep roofs reaching almost to the ground, rows of balconies up their slopes
  [/^(Hotel )?Patria$/, { wall: 'plaster', wallTint: CREAM, plinth: 0.8, floors: 1, floorH: 3.2, pitch: 10, hip: 1, roofTint: DARK_ROOF, eave: 1.2, windows: 2.6,
    wings: [{ x: 0, z: 0, w: 0.3, d: 0.5, floors: 2 },
      { x: -0.28, z: 0, w: 0.42, d: 1, pitch: 52, hip: 1, eave: 1.5, dormers: [{ n: 10, w: 3, side: 0, rows: 8, rowH: 3.2, pitch: 30, balcony: true }] },
      { x: 0.28, z: 0, w: 0.42, d: 1, pitch: 52, hip: 1, eave: 1.5, dormers: [{ n: 10, w: 3, side: 0, rows: 8, rowH: 3.2, pitch: 30, balcony: true }] }] }],
  // the summit and middle stations of the Lomnica cable cars and their observatories: grey masonry, flat roofs
  [/Stanica Lomnick|Observat[óo]rium Lomnick|Stanica Skalnat|Observat[óo]rium Skalnat/, { wall: 'stone', plinth: 0.5, floorH: 3, pitch: 4, hip: 1, roofTint: GREY_ROOF, eave: 0.4, chimney: 1, windows: 3,
    terrace: { side: 1, d: 3, len: 0.6, rail: true, stone: true } }],
];
// large or public buildings in the villages and towns: plastered, hipped roofs
const PUBLIC = /hotel|kostol|kościół|kaplic|kaplnk|klasztor|plebania|škol|szkoł|úrad|urząd|sanat|kúpe|dom seniorov|centrum|ośrodek|zotavov|ústav|múzeum|muzeum|stanica|observat|resort|residence|grand|apartm|penzi|pensjonat|willa|vila|villa|internat|hala /i;
const pick = (h, list) => list[Math.floor(h * list.length) % list.length];

// the building's look: its style, overridden by its entry in HUTS, or chosen from its name and size
export function lookOf(b) {
  const h = Math.abs(Math.sin(b.x * 12.9898 + b.z * 78.233) * 43758.5453) % 1, h2 = (h * 7.31) % 1;
  let lk = { ...(STYLE[b.style] || STYLE.house), wallTint: WOOD, roofTint: SHINGLE, hip: 0, base: 0, floors: b.floors || 1 };
  const hut = HUTS.find(([re]) => re.test(b.name || ''));
  if (hut) Object.assign(lk, STYLE[hut[1].wall === 'stone' ? 'stone_hut' : 'hut'], { base: 0, hip: 0 }, hut[1]);
  else if (b.style === 'house' && (PUBLIC.test(b.name || '') || b.w * b.d > 450)) {
    Object.assign(lk, STYLE.plaster, { wallTint: pick(h, [CREAM, WHITE, YELLOW, PALE, CREAM]),
      roofTint: pick(h2, [RED_ROOF, BROWN_ROOF, DARK_ROOF, GREY_ROOF, GREEN_ROOF]), hip: h2 < 0.3 ? 0.5 : 1, base: h < 0.25 ? 1 : 0 });
  } else if (b.style === 'house') {
    Object.assign(lk, { wallTint: pick(h, [WOOD, DARK, HONEY, GREYWOOD, WOOD]), roofTint: pick(h2, [SHINGLE, GREY_ROOF, DARK_ROOF, BROWN_ROOF, GREEN_ROOF, RED_ROOF]),
      hip: h2 < 0.45 ? 0.3 : 0, base: h > 0.8 ? 1 : 0 });
  } else if (b.style === 'szalas' || b.style === 'shed') {
    Object.assign(lk, { wallTint: pick(h, [WOOD, DARK, GREYWOOD]), roofTint: pick(h2, [SHINGLE, DARK_ROOF, GREY_ROOF]) });
  } else if (b.style === 'hut' || b.style === 'old_hut') lk.roofTint = SHINGLE;
  else if (b.style === 'stone_hut') lk.roofTint = GREY_ROOF;
  // no giant roofs: wide buildings get a lower pitch (a roof at most ~7-9 m high)
  const maxRise = lk.wall === 'plaster' ? 7 : 9, rise = Math.tan(lk.pitch * Math.PI / 180) * b.d / 2;
  if (rise > maxRise) lk.pitch = Math.atan(maxRise / (b.d / 2)) * 180 / Math.PI;
  hipped(lk);
  return lk;
}
// a hip over one half means a roof hipped from the eaves with a small gable at the top (a gablet); the hipped
// ends overhang like the eaves
function hipped(k) {
  if (k.hip > 0.5 && k.hip < 1) { k.gablet = 1 - k.hip; k.hip = 0; }
  if (k.hip || k.gablet) k.gable = Math.max(k.gable, k.eave * 0.8);
  return k;
}

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e2d0'; g.fillRect(0, 0, 128, 192);            // frame
  g.fillStyle = '#1b2228';
  const px = 14, py = 14, pw = 100, ph = 164;
  g.fillRect(px, py, pw, ph);                                       // glass
  const grad = g.createLinearGradient(0, py, 128, py + ph);         // sky reflection
  grad.addColorStop(0, 'rgba(160,185,210,0.45)'); grad.addColorStop(0.5, 'rgba(60,70,80,0.1)'); grad.addColorStop(1, 'rgba(140,160,180,0.3)');
  g.fillStyle = grad; g.fillRect(px, py, pw, ph);
  g.fillStyle = '#e9e2d0';
  g.fillRect(60, py, 8, ph);                                        // mullion
  for (const y of [py + ph / 3, py + 2 * ph / 3]) g.fillRect(px, y - 3, pw, 6); // transoms: small panes
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function doorTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a2616'; g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#24170d'; g.lineWidth = 4;
  for (let x = 16; x < 128; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.strokeRect(10, 10, 108, 236);
  g.fillStyle = '#b8a070'; g.beginPath(); g.arc(100, 136, 6, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}


// light plaster with a faint grain and stains
function plasterTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const x = i % 256, y = (i / 256) | 0;
    const v = 228 + (Math.random() - 0.5) * 16 + 6 * Math.sin(x * 0.05 + Math.sin(y * 0.07) * 2) - (y > 230 ? (y - 230) * 0.9 : 0);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v - 3; img.data[i * 4 + 2] = v - 8; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// a fence texture: pickets with two rails behind (top half), three rails of round poles (bottom half);
// 2 m of fence across, transparent between the boards
function fenceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5e4129'; g.fillRect(0, 24, 256, 10); g.fillRect(0, 86, 256, 10);
  for (let i = 0; i < 13; i++) {
    const x = i * 256 / 13 + 4, w = 12;
    g.fillStyle = `rgb(${130 + (i * 37) % 20},${96 + (i * 23) % 14},${64 + (i * 11) % 10})`;
    g.beginPath(); g.moveTo(x, 10); g.lineTo(x + w / 2, 2); g.lineTo(x + w, 10); g.lineTo(x + w, 118); g.lineTo(x, 118); g.fill();
    g.fillStyle = 'rgba(40,25,15,0.35)'; g.fillRect(x + w - 3, 10, 3, 108);
  }
  for (const y of [150, 190, 228]) {
    const gr = g.createLinearGradient(0, y, 0, y + 14);
    gr.addColorStop(0, '#9a7650'); gr.addColorStop(0.5, '#7a5a3a'); gr.addColorStop(1, '#4a3322');
    g.fillStyle = gr; g.fillRect(0, y, 256, 14);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
// a notice board: notices and a map of the trails on boards under glass
function boardTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#5a3d26'; g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#d9cfb4'; g.fillRect(6, 6, 116, 84);
  g.fillStyle = '#9fbf8a'; g.fillRect(10, 10, 62, 50);
  g.strokeStyle = '#c0392b'; g.lineWidth = 2; g.beginPath(); g.moveTo(14, 54); g.lineTo(30, 38); g.lineTo(46, 30); g.lineTo(66, 16); g.stroke();
  g.strokeStyle = '#2e6db4'; g.beginPath(); g.moveTo(12, 24); g.lineTo(40, 34); g.lineTo(70, 50); g.stroke();
  g.fillStyle = '#7a8f6a'; g.beginPath(); g.moveTo(40, 12); g.lineTo(52, 26); g.lineTo(28, 26); g.fill();
  const notes = [['#f4f1e6', 78, 10, 38, 22], ['#f6e58d', 80, 36, 30, 20], ['#ffffff', 78, 60, 36, 26], ['#f4f1e6', 12, 64, 28, 22], ['#c7ecee', 44, 66, 26, 20]];
  for (const [col, x, y, w, h] of notes) {
    g.fillStyle = col; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(40,40,40,0.55)';
    for (let l = y + 4; l < y + h - 2; l += 4) g.fillRect(x + 3, l, w - 6 - ((l * 7) % 9), 1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// straw for the haystacks: streaks of yellow and grey-brown, running down the slope of the stack
function hayTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#a68a52'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, l = 6 + Math.random() * 14, v = Math.random();
    g.strokeStyle = v < 0.5 ? `rgba(205,180,110,0.7)` : v < 0.8 ? `rgba(120,98,60,0.6)` : `rgba(90,80,60,0.5)`;
    g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y + l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

class Mesher {
  constructor() { this.parts = {}; this.col = [1, 1, 1]; }
  list(k) { return this.parts[k] || (this.parts[k] = { pos: [], nor: [], uv: [], col: [], idx: [] }); }
  put(L, p, t, nrm) { L.pos.push(p.x, p.y, p.z); L.nor.push(nrm.x, nrm.y, nrm.z); L.uv.push(t[0], t[1]); L.col.push(...this.col); }
  // quad a, b, c, d (counter-clockwise seen from outside) with uv in metres/tile
  quad(k, a, b, c, d, uvs) {
    const L = this.list(k), n = L.pos.length / 3;
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    [a, b, c, d].forEach((p, i) => this.put(L, p, uvs[i], nrm));
    L.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  // a convex polygon, its normal turned towards out (a fan of triangles; points may repeat)
  poly(k, pts, uvs, out) {
    const nrm = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {           // Newell's normal
      const a = pts[i], b = pts[(i + 1) % pts.length];
      nrm.x += (a.y - b.y) * (a.z + b.z); nrm.y += (a.z - b.z) * (a.x + b.x); nrm.z += (a.x - b.x) * (a.y + b.y);
    }
    if (nrm.lengthSq() < 1e-8) return;
    nrm.normalize();
    let order = pts.map((_, i) => i);
    if (nrm.dot(out) < 0) { nrm.negate(); order = order.reverse(); }
    const L = this.list(k), n = L.pos.length / 3;
    for (const i of order) this.put(L, pts[i], uvs[i], nrm);
    for (let i = 1; i < pts.length - 1; i++) L.idx.push(n, n + i, n + i + 1);
  }
  // box between two points along the facade (used for walls, plinth, chimneys)
  box(k, cx, cy, cz, sx, sy, sz, rot, tile) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (x, y, z) => new THREE.Vector3(cx + x * c + z * s, cy + y, cz - x * s + z * c);
    const hx = sx / 2, hz = sz / 2;
    const v = [P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, 0, hz), P(-hx, 0, hz), P(-hx, sy, -hz), P(hx, sy, -hz), P(hx, sy, hz), P(-hx, sy, hz)];
    const u = (a, b) => [[0, 0], [a / tile, 0], [a / tile, b / tile], [0, b / tile]];
    this.quad(k, v[3], v[2], v[6], v[7], u(sx, sy));   // +z
    this.quad(k, v[1], v[0], v[4], v[5], u(sx, sy));   // -z
    this.quad(k, v[2], v[1], v[5], v[6], u(sz, sy));   // +x
    this.quad(k, v[0], v[3], v[7], v[4], u(sz, sy));   // -x
    this.quad(k, v[7], v[6], v[5], v[4], u(sx, sz));   // top
  }
  geometries() {
    const out = {};
    for (const [k, L] of Object.entries(this.parts)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(L.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(L.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(L.col, 3));
      g.setIndex(L.idx);
      g.computeBoundingSphere();
      out[k] = g;
    }
    return out;
  }
}


// Levelled terraces for the buildings: must be set on the terrain before its meshes are built.
export function buildingFlats(meta, terrain) {
  return (meta.buildings || []).map((b) => {
    const st = STYLE[b.style] || STYLE.house, rot = b.a - Math.PI / 2, c = Math.cos(rot), s = Math.sin(rot);
    const hs = [];
    for (let i = -1; i <= 1; i += 0.5) for (let j = -1; j <= 1; j += 0.5) {
      const x = b.x + i * b.w / 2 * c + j * b.d / 2 * s, z = b.z - i * b.w / 2 * s + j * b.d / 2 * c;
      hs.push(terrain.rawHeight(x, z));
    }
    hs.sort((p, q) => p - q);
    // on steep ground a mountain building stands on the upper part of its footprint with a tall stone
    // plinth on the downhill side, instead of being dug into the slope: level from the upper heights
    // (70th percentile), a terrace just under the footprint
    const lvl = hs[Math.floor(hs.length * 0.7)];
    return { x: b.x, z: b.z, c, s, w: b.w + 1, d: b.d + 1, level: lvl, blend: 3 };
  });
}

// free(x, z): no footpath or lake there; yard(x, z): ground a fence may stand on (not a road or paving)
export async function buildBuildings({ scene, meta, terrain, shade, loadTexture, free = () => true, yard = () => true }) {
  const list = meta.buildings || [];
  const tex = async (name, srgb, rep = true) => {
    const t = await loadTexture(`textures/${name}.jpg`, srgb);
    if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const [logD, logN, plD, plN, stD, stN, rfD, rfN] = await Promise.all([
    tex('wood_plank_wall_diff', true), tex('wood_plank_wall_nor', false),
    tex('weathered_brown_planks_diff', true), tex('weathered_brown_planks_nor', false),
    tex('stone_wall_diff', true), tex('stone_wall_nor', false),
    tex('roof_slates_02_diff', true), tex('roof_slates_02_nor', false)]);
  const mat = (map, normalMap, color = 0xffffff, side = THREE.DoubleSide) => {
    const m = new THREE.MeshLambertMaterial({ map, normalMap, color, side, vertexColors: true });
    patchShading(m, shade);
    return m;
  };
  const M = {
    logs: mat(logD, logN, new THREE.Color(2.1, 1.8, 1.5)), planks: mat(plD, plN, new THREE.Color(1.3, 1.2, 1.1)), stone: mat(stD, stN, 0xd0d0d0),
    plaster: mat(plasterTexture(), null, 0xf2efe8),
    roof: mat(rfD, rfN, 0x9a8c80, THREE.DoubleSide), window: mat(windowTexture(), null), door: mat(doorTexture(), null),
    trim: mat(null, null, 0x3b2819),
    fence: mat(fenceTexture(), null, 0xffffff), board: mat(boardTexture(), null), hay: mat(hayTexture(), null),
    bin: mat(null, null, 0x3d5a3a),
  };
  M.fence.alphaTest = 0.5;
  const mesher = new Mesher();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ONE = [1, 1, 1];
  const rects = [];
  let owner = -1;                                     // the building whose blocks are being made

  // one block of a building (the whole of a simple one, a wing, a dormer): walls on a plinth, a stone ground
  // floor, the roof (gable, half-hipped or hipped), gables, fascia, chimneys, windows. f: its frame (centre
  // ox, oz, angle of its ridge rot, length W, depth D, the side of its front fz), k: its look
  function block(f, k, { yP: fixedY = null, door = false, windows = true } = {}) {
    const { W, D } = f, c = Math.cos(f.rot), s = Math.sin(f.rot);
    const L = (x, y, z) => V(f.ox + x * c + z * s, y, f.oz - x * s + z * c);
    const dir = (x, y, z) => V(x * c + z * s, y, -x * s + z * c);
    let yP = fixedY, y0 = fixedY;
    if (fixedY == null) {
      let gMin = Infinity, gMax = -Infinity;
      for (let i = -1; i <= 1; i += 0.5) for (let j = -1; j <= 1; j += 0.5) {
        const p = L(i * W / 2, 0, j * D / 2), h = terrain.height(p.x, p.z);
        gMin = Math.min(gMin, h); gMax = Math.max(gMax, h);
        // just outside the walls (downhill the ground falls away): the plinth reaches down to it
        const q = L(i * (W / 2 + 1.2), 0, j * (D / 2 + 1.2));
        gMin = Math.min(gMin, terrain.height(q.x, q.z) - 0.3);
      }
      y0 = gMin - 0.5; yP = gMax + k.plinth;                       // plinth from below ground to above the high side
    }
    const floors = Math.max(1, k.floors), wallH = k.floorH * floors, yW = yP + wallH;
    const wallKind = k.wall, baseH = Math.min(k.base || 0, floors) * k.floorH;
    rects.push({ x: f.ox, z: f.oz, w: W + 2 * k.eave, d: D + 2 * k.eave, c, s, o: owner });

    mesher.col = ONE;
    if (yP > y0) mesher.box('stone', f.ox, y0, f.oz, W + 0.1, yP - y0, D + 0.1, f.rot, TILE.stone);
    if (baseH > 0) mesher.box('stone', f.ox, yP, f.oz, W + 0.06, baseH, D + 0.06, f.rot, TILE.stone);
    mesher.col = k.wallTint;
    if (baseH < wallH) mesher.box(wallKind, f.ox, yP + baseH, f.oz, W, wallH - baseH, D, f.rot, TILE[wallKind]);

    // roof: two sides from the eaves to the ridge; its ends hipped as far as k.hip (a gable below)
    const tan = Math.tan(k.pitch * Math.PI / 180), rise = tan * D / 2;
    const e = k.eave, g = k.gable, hx = W / 2 + g, hz = D / 2 + e;
    const eY = yW - tan * e, R = yW + rise, Rt = R - eY;
    const t = Math.min(k.hip || 0, hx / hz * 0.98);
    const zk = hz * t, yk = eY + Rt * (1 - t), xr = hx - zk;
    const sinA = Rt / Math.hypot(Rt, hz), TR = TILE.roof;
    const ruv = (u, y) => [u / TR, (y - eY) / sinA / TR];
    mesher.col = k.roofTint;
    const gb = k.gablet ? Math.min(0.9, k.gablet) : 0;
    if (gb) {
      // hipped from the eaves up, a small vertical gable (gablet) at the top: the Polish "dach polski" look
      const xg = Math.max(0.3, hx - hz * (1 - gb)), yg = eY + Rt * (1 - gb), zg = hz * gb;
      for (const sz of [-1, 1]) {
        const P = [[-hx, eY, sz * hz], [hx, eY, sz * hz], [xg, yg, sz * zg], [xg, R, 0], [-xg, R, 0], [-xg, yg, sz * zg]];
        mesher.poly('roof', P.map((p) => L(...p)), P.map((p) => ruv(p[0], p[1])), dir(0, 1, sz));
      }
      for (const sx of [-1, 1]) {
        const P = [[sx * hx, eY, -hz], [sx * hx, eY, hz], [sx * xg, yg, zg], [sx * xg, yg, -zg]];
        mesher.poly('roof', P.map((p) => L(...p)), P.map((p) => ruv(p[2], p[1])), dir(sx, 1, 0));
        mesher.col = k.wallTint;
        const G = [[sx * xg, yg, -zg], [sx * xg, yg, zg], [sx * xg, R, 0]];
        mesher.poly(wallKind, G.map((p) => L(...p)), G.map((p) => [p[2] / TILE[wallKind], (p[1] - yg) / TILE[wallKind]]), dir(sx, 0, 0));
        mesher.col = k.roofTint;
      }
    } else {
      for (const sz of [-1, 1]) {
        const P = [[-hx, eY, sz * hz], [hx, eY, sz * hz], [hx, yk, sz * zk], [xr, R, 0], [-xr, R, 0], [-hx, yk, sz * zk]];
        mesher.poly('roof', P.map((p) => L(...p)), P.map((p) => ruv(p[0], p[1])), dir(0, 1, sz));
      }
      if (zk > 0.05) for (const sx of [-1, 1]) {
        const P = [[sx * hx, yk, -zk], [sx * hx, yk, zk], [sx * xr, R, 0]];
        mesher.poly('roof', P.map((p) => L(...p)), P.map((p) => ruv(p[2], p[1])), dir(sx, 1, 0));
      }
    }
    // the roof's height over a point of the block (for chimneys)
    const roofAt = (x, z) => {
      let y = eY + (hz - Math.abs(z)) * Rt / hz;
      if (gb || t > 0) y = Math.min(y, eY + (hx - Math.abs(x)) * Rt / hz + (gb ? 0 : Rt * (1 - t)));
      return Math.min(R, y);
    };
    // gables up to under the roof, in the wall material (stone where the whole block is)
    const yc = gb ? yW : Math.min(R, yk + g * Rt / hz);
    mesher.col = baseH >= wallH ? ONE : k.wallTint;
    const gk = baseH >= wallH ? 'stone' : wallKind;
    if (yc > yW + 0.05) for (const sx of [-1, 1]) {
      const zc = D / 2 * Math.max(0, 1 - (yc - yW) / rise), T = TILE[gk];
      const P = [[sx * W / 2, yW, -D / 2], [sx * W / 2, yW, D / 2], [sx * W / 2, yc, zc], [sx * W / 2, yc, -zc]];
      mesher.poly(gk, P.map((p) => L(...p)), P.map((p) => [p[2] / T, (p[1] - yW) / T]), dir(sx, 0, 0));
    }
    // fascia along the eaves
    mesher.col = k.wall === 'plaster' ? k.roofTint : ONE;
    for (const sz of [-1, 1]) {
      const m = L(0, eY - 0.18, sz * hz);
      mesher.box('trim', m.x, m.y, m.z, 2 * (zk > 0.05 ? hx - 0.05 : hx), 0.18, 0.08, f.rot, 1);
    }
    // chimneys
    mesher.col = k.wall === 'plaster' ? k.wallTint : ONE;
    for (let n = 0; n < (k.chimney || 0); n++) {
      const cx = (n - (k.chimney - 1) / 2) * W * (k.chimney > 2 ? 0.3 : 0.4), cz = D * 0.12, p = L(cx, 0, cz);
      const top = roofAt(cx, cz) + 1.1;
      mesher.box(k.wall === 'plaster' ? 'plaster' : 'stone', p.x, yW, p.z, 0.8, top - yW, 0.8, f.rot, TILE.stone);
    }
    // windows (and the door, in the middle of the front) on the long facades, and on the gable ends
    mesher.col = ONE;
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const pane = (kind, a, bb, cc, d, out) => { if (out) mesher.quad(kind, a, bb, cc, d, uv); else mesher.quad(kind, bb, a, d, cc, uv); };
    let doorAt = null;
    if (k.windows && windows) {
      for (const sz of [-1, 1]) {
        const n = Math.max(1, Math.floor((W - 1.6) / k.windows));
        for (let fl = 0; fl < floors; fl++) for (let m = 0; m < n; m++) {
          const x = -W / 2 + 0.8 + (m + 0.5) * (W - 1.6) / n;
          const isDoor = door && fl === 0 && sz === f.fz && m === Math.floor(n / 2);
          const ww = isDoor ? 1.2 : 0.9, wh = isDoor ? 2.1 : 1.3, yy = isDoor ? yP + 0.02 : yP + fl * k.floorH + 0.9;
          const o = sz * (D / 2 + 0.05);
          if (isDoor) doorAt = { x, y: yP, z: o };
          pane(isDoor ? 'door' : 'window', L(x - ww / 2, yy, o), L(x + ww / 2, yy, o), L(x + ww / 2, yy + wh, o), L(x - ww / 2, yy + wh, o), sz > 0);
        }
      }
      if (D >= 6) for (const sx of [-1, 1]) for (let fl = 0; fl < floors + 1; fl++) {
        const yb = yP + fl * k.floorH + 0.9, o = sx * (W / 2 + 0.05);
        if (yb + 1.3 > (fl < floors ? yW : yc - 0.4)) continue;     // the attic window only where the gable is tall enough
        const zs = fl < floors && D >= 9 ? [-D / 4, D / 4] : [0];
        for (const z of zs) pane('window', L(o, yb, z + 0.45), L(o, yb, z - 0.45), L(o, yb + 1.3, z - 0.45), L(o, yb + 1.3, z + 0.45), sx > 0);
      }
    } else if (door) {
      // szałas: a low plank door on its front
      const o = f.fz * (D / 2 + 0.05);
      pane('door', L(-0.45, yP, o), L(0.45, yP, o), L(0.45, yP + 1.6, o), L(-0.45, yP + 1.6, o), f.fz > 0);
    }
    return { L, yP, yW, tan, R, doorAt, wallH, fr: f };
  }

  // dormers on a wing's roof (a small block across the ridge, a window in its gable); rows: several rows climbing
  // the slope, rowH apart in height
  function dormersOn(main, k, list) {
    const M = main.fr;
    for (const dm of list ? [].concat(list) : []) {
      const sides = dm.side === 0 ? [-1, 1] : [M.fz * (dm.side || 1)];
      for (const sd of sides) for (let row = 0; row < (dm.rows || 1); row++) {
        // on a hipped roof the slope narrows as it climbs: fewer dormers in the higher rows
        const rh = dm.rowH || 3, span = M.W - 2 * (k.hip || 0) * (row * rh / main.tan + 1.5), nr = Math.round(dm.n * span / M.W);
        for (let n = 0; n < nr; n++) {
        const x = (dm.x || 0) * M.W - span / 2 + (n + 0.5) * span / nr, dw = dm.w || 2.2, dl = Math.max(3.2, dw * 0.7);
        const zf = sd * (M.D / 2 - 0.3 - row * rh / main.tan), p = main.L(x, 0, zf - sd * dl / 2);
        if (row * rh / main.tan > M.D / 2 - dl - 1) continue;               // no room left under the ridge
        // the dormer's ridge points out of the roof (its +x towards this side)
        const sub = { ox: p.x, oz: p.z, rot: M.rot - sd * Math.PI / 2, W: dl, D: dw, fz: 1 };
        const dk = { ...k, floors: 1, floorH: 2.0, base: 0, pitch: dm.pitch || 40, hip: 0, gablet: 0, eave: 0.3, gable: 0.4, chimney: 0, windows: 0 };
        const r = block(sub, dk, { yP: main.yW - 0.1 + row * rh, windows: false });
        mesher.col = ONE;
        const o = r.L(1, 0, 0), q = r.L(0, 0, 0), nw = Math.max(1, Math.floor((dw - 0.6) / 1.15));
        for (let m = 0; m < nw; m++) {
          const z = -dw / 2 + 0.3 + (m + 0.5) * (dw - 0.6) / nw;
          const P = [[z + 0.45, 0.45], [z - 0.45, 0.45], [z - 0.45, 1.65], [z + 0.45, 1.65]].map(([zz, y]) => r.L(dl / 2 + 0.05, r.yP + y, zz));
          mesher.poly('window', P, [[0, 0], [1, 0], [1, 1], [0, 1]], V(o.x - q.x, 0, o.z - q.z));
        }
        // a little balcony in front of it: a floor of planks and a rail
        if (dm.balcony) {
          mesher.col = k.wall === 'plaster' ? ONE : k.wallTint;
          const b0 = r.L(dl / 2 + 0.55, 0, 0), b1 = r.L(dl / 2 + 1.05, 0, 0);
          mesher.box('planks', b0.x, r.yP - 0.12, b0.z, 1.1, 0.12, dw, sub.rot, TILE.planks);
          mesher.box('planks', b1.x, r.yP, b1.z, 0.06, 1.0, dw, sub.rot, TILE.planks);
        }
        }
      }
    }
  }

  // the parts around a hut: dormers, a balcony, a porch over the door, a terrace with tables and benches, a woodpile
  function extras(b, f, k, main) {
    const { W, D, fz } = f, { L } = main;
    // dormers and balconies belong to the main wing (its roof and walls, not the whole building's outline:
    // on a hut of several wings they would hang in the air beside it)
    const M = main.fr;
    dormersOn(main, k, k.dormers);
    // a wooden balcony along the front (or back) at a floor
    for (const bl of k.balcony ? [].concat(k.balcony) : []) {
      const sd = M.fz * (bl.side || 1), len = (bl.len || 0.7) * M.W, y = main.yP + (bl.floor || 1) * k.floorH;
      const p = L(bl.x || 0, 0, sd * (M.D / 2 + 0.6));
      mesher.col = k.wall === 'plaster' ? ONE : k.wallTint;
      mesher.box('planks', p.x, y - 0.12, p.z, len, 0.12, 1.2, M.rot, TILE.planks);
      const q = L(bl.x || 0, 0, sd * (M.D / 2 + 1.17));
      mesher.box('planks', q.x, y, q.z, len, 1.0, 0.06, M.rot, TILE.planks);
      for (const ex of [-1, 1]) {
        const r = L((bl.x || 0) + ex * len / 2, 0, sd * (M.D / 2 + 0.6));
        mesher.box('planks', r.x, y, r.z, 0.06, 1.0, 1.2, M.rot, TILE.planks);
      }
    }
    // a porch over the door: two posts and a small gable roof
    if (k.porch && main.doorAt) {
      const d = main.doorAt, sd = Math.sign(d.z), pd = 1.8, pw = 2.6, y = d.y + 2.6;
      mesher.col = ONE;
      for (const ex of [-1, 1]) {
        const p = L(d.x + ex * (pw / 2 - 0.15), 0, d.z + sd * (pd - 0.15));
        mesher.box('trim', p.x, d.y - 0.6, p.z, 0.16, 3.2, 0.16, f.rot, 1);
      }
      const c = L(d.x, 0, d.z + sd * pd / 2);
      const sub = { ox: c.x, oz: c.z, rot: f.rot + Math.PI / 2, W: pd, D: pw, fz: 1 };
      block(sub, { ...k, floors: 1, floorH: 0.01, base: 0, pitch: 40, hip: 0, gablet: 0, eave: 0.2, gable: 0.15, chimney: 0, windows: 0, plinth: 0 }, { yP: y, windows: false });
    }
    // a terrace in front with tables and benches
    if (k.terrace) {
      const tr = k.terrace, sd = fz * (tr.side || 1), td = tr.d || 5, tl = (tr.len || 0.8) * W;
      const c = L(tr.x || 0, 0, sd * (f.ext(sd) + td / 2 + 0.3));
      let gMax = -Infinity, gMin = Infinity;
      for (const i of [-0.5, 0, 0.5]) for (const j of [-0.5, 0.5]) {
        const p = L((tr.x || 0) + i * tl, 0, sd * (f.ext(sd) + 0.3 + (j + 0.5) * td));
        const h = terrain.height(p.x, p.z); gMax = Math.max(gMax, h); gMin = Math.min(gMin, h);
      }
      const top = Math.max(gMax + 0.15, Math.min(main.yP, gMax + 1.2));
      mesher.col = ONE;
      mesher.box(tr.stone ? 'stone' : 'planks', c.x, gMin - 0.4, c.z, tl, top - gMin + 0.4, td, f.rot, tr.stone ? TILE.stone : TILE.planks);
      if (tr.rail) {                                          // a railing on the open sides
        const r1 = L(tr.x || 0, 0, sd * (f.ext(sd) + 0.3 + td - 0.05));
        mesher.box('planks', r1.x, top, r1.z, tl, 1.0, 0.08, f.rot, TILE.planks);
        for (const ex of [-1, 1]) {
          const r2 = L((tr.x || 0) + ex * (tl / 2 - 0.04), 0, sd * (f.ext(sd) + 0.3 + td / 2));
          mesher.box('planks', r2.x, top, r2.z, 0.08, 1.0, td, f.rot, TILE.planks);
        }
      }
      const n = tr.tables || Math.max(1, Math.floor(tl / 3.2));
      for (let m = 0; m < n; m++) {
        const x = (tr.x || 0) - tl / 2 + (m + 0.5) * tl / n, p = L(x, 0, sd * (f.ext(sd) + 0.3 + td * 0.55));
        furniture(p.x, top, p.z, f.rot + Math.PI / 2);
      }
    }
    // a woodpile against a gable end
    if (k.woodpile) {
      const sx = k.woodpile === -1 ? -1 : 1, p = L(sx * (W / 2 + 0.6), 0, 0);
      mesher.col = [0.9, 0.75, 0.6];
      mesher.box('planks', p.x, terrain.height(p.x, p.z) - 0.2, p.z, 0.9, 1.6, Math.min(D * 0.6, 5), f.rot, 0.5);
    }
  }
  // a picnic table with two benches (x along rot)
  function furniture(x, y, z, rot) {
    const c = Math.cos(rot), s = Math.sin(rot), P = (u, w) => [x + u * c + w * s, z - u * s + w * c];
    mesher.col = [0.95, 0.85, 0.72];
    const put = (u, w, yy, sx, sy, sz) => { const [px, pz] = P(u, w); mesher.box('planks', px, y + yy, pz, sx, sy, sz, rot, 1.5); };
    put(0, 0, 0.72, 1.8, 0.06, 0.8);
    for (const u of [-0.7, 0.7]) put(u, 0, 0, 0.08, 0.72, 0.6);
    for (const w of [-0.65, 0.65]) { put(0, w, 0.42, 1.8, 0.05, 0.3); for (const u of [-0.7, 0.7]) put(u, w, 0, 0.08, 0.42, 0.2); }
  }

  // is (x, z) within m of a building other than `self` (incl. its eaves)?
  function nearOther(x, z, m, self) {
    for (const r of rects) {
      if (r.o === self) continue;
      const dx = x - r.x, dz = z - r.z, u = dx * r.c - dz * r.s, v = dx * r.s + dz * r.c;
      if (Math.abs(u) < r.w / 2 + m && Math.abs(v) < r.d / 2 + m) return true;
    }
    return false;
  }
  // a fence around the rectangle ±hw × ±hd of a frame (L: local to world), in sections of ~2 m that follow
  // the ground; a section is left out over a footpath, a road or paving, near another building, or where the
  // ground drops too steeply; a gate gap on the front (z = gz) at x = gx. type: 0 pickets (sztachety), 1 rails
  function fence(L, rot, hw, hd, type, gz, gx, self, keep) {
    const H = type ? 1.15 : 1.05, v0 = type ? 0 : 0.53, v1 = type ? 0.47 : 1;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (let e = 0; e < 4; e++) {
      const [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2.2));
      const out = V(az === bz ? 0 : Math.sign(ax), 0, az === bz ? Math.sign(az) : 0);
      const ow = L(out.x, 0, out.z), o0 = L(0, 0, 0), on = V(ow.x - o0.x, 0, ow.z - o0.z);
      let prev = false;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        if (gz != null && Math.abs(mz - gz) < 0.01 && Math.abs(mx - gx) < 1.6) { prev = false; continue; }   // the gate
        const p0 = L(x0, 0, z0), p1 = L(x1, 0, z1), pm = L(mx, 0, mz);
        const h0 = terrain.height(p0.x, p0.z), h1 = terrain.height(p1.x, p1.z);
        if (!keep(pm.x, pm.z) || !keep(p0.x, p0.z) || !keep(p1.x, p1.z) || !free(p0.x, p0.z) || !free(p1.x, p1.z) || Math.abs(h1 - h0) > 1.4 || nearOther(pm.x, pm.z, 0.6, self)) { prev = false; continue; }
        mesher.col = [0.95, 0.85, 0.72];
        const u0 = (i * len / n) / 2, u1 = ((i + 1) * len / n) / 2;
        mesher.poly('fence', [V(p0.x, h0 - 0.05, p0.z), V(p1.x, h1 - 0.05, p1.z), V(p1.x, h1 + H, p1.z), V(p0.x, h0 + H, p0.z)],
          [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], on);
        mesher.col = [0.8, 0.72, 0.62];
        if (!prev) mesher.box('planks', p0.x, h0 - 0.3, p0.z, 0.13, H + 0.4, 0.13, rot, 1);
        mesher.box('planks', p1.x, h1 - 0.3, p1.z, 0.13, H + 0.4, 0.13, rot, 1);
        prev = true;
      }
    }
  }
  // a bench of planks with a backrest (along rot; the backrest on the side bs of its local z)
  function bench(x, z, rot, bs) {
    const y = terrain.height(x, z), c = Math.cos(rot), s = Math.sin(rot), P = (u, w) => [x + u * c + w * s, z - u * s + w * c];
    mesher.col = [0.9, 0.78, 0.64];
    const put = (u, w, yy, sx, sy, sz) => { const [px, pz] = P(u, w); mesher.box('planks', px, y + yy, pz, sx, sy, sz, rot, 1.5); };
    put(0, 0, 0.42, 1.7, 0.06, 0.4);
    put(0, bs * 0.2, 0.55, 1.7, 0.32, 0.05);
    for (const u of [-0.7, 0.7]) { put(u, 0, -0.2, 0.08, 0.62, 0.36); put(u, bs * 0.2, 0.4, 0.07, 0.5, 0.06); }
  }
  // a notice board under a little roof on two posts (the hut's news, the map of the trails)
  function board(x, z, rot) {
    const y = terrain.height(x, z), c = Math.cos(rot), s = Math.sin(rot), P = (u, yy, w) => V(x + u * c + w * s, y + yy, z - u * s + w * c);
    mesher.col = [0.8, 0.7, 0.6];
    for (const u of [-0.8, 0.8]) { const p = P(u, 0, 0); mesher.box('planks', p.x, y - 0.4, p.z, 0.14, 2.6, 0.14, rot, 1); }
    mesher.box('planks', x, y + 0.95, z, 1.5, 1.1, 0.06, rot, 1);
    for (const w of [-1, 1]) {
      mesher.col = ONE;
      const Q = [P(-0.7, 1.0, w * 0.035), P(0.7, 1.0, w * 0.035), P(0.7, 2.0, w * 0.035), P(-0.7, 2.0, w * 0.035)];
      mesher.poly('board', Q, [[0, 0], [1, 0], [1, 1], [0, 1]], V(w * s, 0, w * c));
      mesher.col = [0.7, 0.62, 0.55];
      const R = [P(-0.95, 2.2, 0), P(0.95, 2.2, 0), P(0.95, 2.05, w * 0.42), P(-0.95, 2.05, w * 0.42)];
      mesher.poly('planks', R, [[0, 0], [1, 0], [1, 0.3], [0, 0.3]], V(0, 1, 0));
    }
  }
  // the ground of a w × d spot is level enough (and free) for something to stand on
  function flat(x, z, rot, w, d, self) {
    const c = Math.cos(rot), s = Math.sin(rot);
    let lo = Infinity, hi = -Infinity;
    for (const i of [-0.5, 0, 0.5]) for (const j of [-0.5, 0, 0.5]) {
      const px = x + i * w * c + j * d * s, pz = z - i * w * s + j * d * c;
      if (!free(px, pz)) return null;
      const h = terrain.height(px, pz); lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return hi - lo < 0.9 && !nearOther(x, z, Math.max(w, d) / 2 + 1.5, self) ? { lo, hi } : null;
  }
  // a shelter (wiata): four posts, a shingle roof, a table with benches under it
  function shelter(x, z, rot, g, k) {
    const c = Math.cos(rot), s = Math.sin(rot), y = g.hi + 2.2;
    mesher.col = [0.8, 0.7, 0.6];
    for (const [u, w] of [[-1.8, -1.3], [1.8, -1.3], [1.8, 1.3], [-1.8, 1.3]]) {
      mesher.box('planks', x + u * c + w * s, g.lo - 0.4, z - u * s + w * c, 0.18, y - g.lo + 0.45, 0.18, rot, 1);
    }
    const sub = { ox: x, oz: z, rot, W: 4.2, D: 3.2, fz: 1 };
    block(sub, { ...k, wall: 'planks', wallTint: [0.85, 0.75, 0.62], floors: 1, floorH: 0.01, base: 0, pitch: 35, hip: 0, gablet: 0, eave: 0.35, gable: 0.3,
      chimney: 0, windows: 0, plinth: 0 }, { yP: y, windows: false });
    furniture(x, terrain.height(x, z), z, rot);
  }

  // a ring of n sides from (r0 at y0) to (r1 at y1) round (x, z); r1 = 0 closes it to a point
  function ring(kind, x, z, y0, y1, r0, r1, n, tile) {
    for (let i = 0; i < n; i++) {
      const a0 = i / n * 6.2832, a1 = (i + 1) / n * 6.2832, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const u0 = i / n * 6.28 * r0 / tile, u1 = (i + 1) / n * 6.28 * r0 / tile, v = Math.hypot(y1 - y0, r1 - r0) / tile;
      const P = [V(x + c0 * r0, y0, z + s0 * r0), V(x + c1 * r0, y0, z + s1 * r0), V(x + c1 * r1, y1, z + s1 * r1), V(x + c0 * r1, y1, z + s0 * r1)];
      const out = V((c0 + c1) / 2, (r0 - r1) / Math.max(0.1, y1 - y0), (s0 + s1) / 2);
      if (r1 > 0) mesher.poly(kind, P, [[u0, 0], [u1, 0], [u1, v], [u0, v]], out);
      else mesher.poly(kind, [P[0], P[1], P[2]], [[u0, 0], [u1, 0], [(u0 + u1) / 2, v]], out);
    }
  }
  // a haystack on its pole, the Podhale way (a stóg: a fat cone round a pole, the pole's tip out of the top)
  function haystack(x, z, sz) {
    const y = terrain.height(x, z) - 0.15, H = 2.6 * sz, R = 1.3 * sz;
    mesher.col = [1, 0.95, 0.85];
    ring('hay', x, z, y, y + H * 0.3, R * 0.9, R, 9, 1.5);
    ring('hay', x, z, y + H * 0.3, y + H, R, 0, 9, 1.5);
    mesher.col = [0.75, 0.68, 0.6];
    mesher.box('planks', x, y + H - 0.3, z, 0.1, 0.9, 0.1, 0, 1);
  }
  // a wooden well: a log box, two posts, a little shingle roof, the crank's roller
  function well(x, z, rot, k) {
    const y = terrain.height(x, z), c = Math.cos(rot), s = Math.sin(rot);
    mesher.col = [0.85, 0.75, 0.62];
    mesher.box('logs', x, y - 0.3, z, 1.2, 1.1, 1.2, rot, TILE.logs);
    for (const u of [-0.55, 0.55]) mesher.box('planks', x + u * c, y + 0.7, z - u * s, 0.12, 1.5, 0.12, rot, 1);
    mesher.box('trim', x, y + 1.45, z, 1.2, 0.14, 0.14, rot, 1);
    block({ ox: x, oz: z, rot, W: 1.5, D: 1.3, fz: 1 }, { ...k, wall: 'planks', wallTint: [0.85, 0.75, 0.62], floors: 1, floorH: 0.01, base: 0, pitch: 45,
      hip: 0, gablet: 0, eave: 0.25, gable: 0.2, chimney: 0, windows: 0, plinth: 0 }, { yP: y + 2.15, windows: false });
  }
  // a wayside shrine: a whitewashed pillar, a niche under a little roof, a cross on top
  function shrine(x, z, rot, k) {
    const y = terrain.height(x, z);
    mesher.col = ONE;
    mesher.box('stone', x, y - 0.4, z, 0.8, 0.6, 0.8, rot, TILE.stone);
    mesher.box('plaster', x, y + 0.2, z, 0.6, 1.9, 0.6, rot, TILE.plaster);
    const c = Math.cos(rot), s = Math.sin(rot);
    mesher.col = [0.3, 0.45, 0.75];
    mesher.box('trim', x + 0.31 * s, y + 1.45, z + 0.31 * c, 0.34, 0.45, 0.02, rot, 1);       // the niche, blue inside
    block({ ox: x, oz: z, rot, W: 0.9, D: 0.9, fz: 1 }, { ...k, wall: 'plaster', wallTint: WHITE, floors: 1, floorH: 0.01, base: 0, pitch: 45,
      hip: 1, gablet: 0, eave: 0.12, gable: 0.12, chimney: 0, windows: 0, plinth: 0 }, { yP: y + 2.1, windows: false });
    mesher.col = ONE;
    mesher.box('trim', x, y + 2.5, z, 0.05, 0.55, 0.05, rot, 1);
    mesher.box('trim', x, y + 2.84, z, 0.3, 0.05, 0.05, rot, 1);
  }
  // a litter bin on a post
  function bin(x, z, rot) {
    const y = terrain.height(x, z);
    mesher.col = ONE;
    mesher.box('bin', x, y + 0.35, z, 0.45, 0.6, 0.45, rot, 1);
    mesher.box('trim', x, y - 0.2, z, 0.08, 0.6, 0.08, rot, 1);
  }
  // a spot r_min..r_max from the building's centre, level and free (a few tries round it)
  function spotNear(b, bi, r0, r1, w, d, seed) {
    for (let n = 0; n < 12; n++) {
      const a = seed * 6.28 + n * 2.4, r = r0 + ((n * 0.37 + seed) % 1) * (r1 - r0);
      const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
      if (flat(x, z, 0, w, d, bi)) return { x, z };
    }
    return null;
  }

  // what stands around a building: the huts get benches by the door, a notice board and a shelter with a
  // table; the houses of the villages a wooden fence round the garden (pickets or rails) with a gate and often
  // a bench by the door; the shepherds' huts sometimes a pen of rails
  function surroundings({ b, bi, lk, frame, main, hut }) {
    const { W, D, fz, rot } = frame, h = Math.abs(Math.sin(b.x * 3.17 + b.z * 1.71) * 9301.7) % 1;
    const c = Math.cos(rot), s = Math.sin(rot), L = (x, y, z) => V(b.x + x * c + z * s, y, b.z - x * s + z * c);
    // the door is on the main wing (its own frame, maybe turned across the building)
    const ML = main.L, m0 = ML(0, 0, 0), m1 = ML(1, 0, 0), mrot = Math.atan2(m0.z - m1.z, m1.x - m0.x);
    const d = main.doorAt, sd = d ? Math.sign(d.z) || 1 : fz, dx = d ? d.x : 0, wallZ = d ? d.z : fz * D / 2;
    const ok = (p) => free(p.x, p.z) && !nearOther(p.x, p.z, 0.3, bi);
    const trySpot = (u, w) => { const p = L(u, 0, w); return ok(p) ? p : null; };
    const benchBy = (u) => { const p = ML(dx + u, 0, wallZ + sd * 0.45); if (ok(p)) bench(p.x, p.z, mrot, -sd); };
    const big = lk.wall === 'plaster';
    if (hut) {
      const terraceFront = lk.terrace && (lk.terrace.side || 1) === 1;
      if (!terraceFront) { benchBy(-1.7); benchBy(1.7); }
      for (const [u, w] of [[W / 2 + 2.5, sd * (D / 2 + 3)], [-W / 2 - 2.5, sd * (D / 2 + 3)], [W / 2 + 3, 0], [-W / 2 - 3, 0]]) {
        const p = trySpot(u, w);
        if (p && flat(p.x, p.z, rot, 2, 1, bi)) {
          board(p.x, p.z, rot);
          const q = trySpot(u + (u > 0 ? 1.6 : -1.6), w);
          if (q) bin(q.x, q.z, rot);
          break;
        }
      }
      for (let n = 0; n < 16; n++) {
        const a = n * 2.4 + h * 6.28, r = Math.max(W, D) / 2 + 7 + (n % 4) * 2.5;
        const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r, g = flat(x, z, rot, 5, 4, bi);
        if (g) { shelter(x, z, rot, g, lk); break; }
      }
    } else if (b.style === 'szalas') {
      if (h < 0.5) {
        const side = h < 0.25 ? 1 : -1, pw = 4 + h * 6, p = L(side * (W / 2 + pw / 2 + 0.6), 0, 0);
        fence((x, y, z) => V(p.x + x * c + z * s, y, p.z - x * s + z * c), rot, pw / 2, Math.max(2.5, D / 2 + 1), 1, null, 0, bi, () => true);
      }
      // hay for the winter on the meadow beside it
      for (let n = 0; n < (h > 0.6 ? 2 : h > 0.3 ? 1 : 0); n++) {
        const q = spotNear(b, bi, Math.max(W, D) / 2 + 5, Math.max(W, D) / 2 + 16, 3, 3, (h * 5.3 + n * 0.41) % 1);
        if (q) haystack(q.x, q.z, 0.85 + ((h * 11 + n) % 1) * 0.3);
      }
    } else if (b.style === 'house') {
      if (big) { benchBy(-2); if (h > 0.5) benchBy(2); return; }
      if (h < 0.55) benchBy(h < 0.3 ? -1.6 : 1.6);
      if (h > 0.2 && W * D < 220 && (b.floors || 1) <= 2) {                // family houses, not the hotels
        const m = 3 + ((h * 13.7) % 1) * 4;                           // the garden, 3-7 m beyond the walls
        fence(L, rot, W / 2 + m, D / 2 + m, (h * 7.9) % 1 < 0.6 ? 0 : 1, fz * (D / 2 + m), dx, bi, yard);
        // a well in the garden behind the house
        const h3 = (h * 31.7) % 1;
        if (h3 < 0.15 && m > 3.5) {
          const p = L((h3 - 0.075) * W * 5, 0, -fz * (D / 2 + m / 2 + 0.2));
          if (yard(p.x, p.z) && flat(p.x, p.z, rot, 1.4, 1.4, bi)) well(p.x, p.z, rot, lk);
        }
        // a wayside shrine by the gate, now and then
        if (h3 > 0.9) {
          const p = L(dx + 2.6, 0, fz * (D / 2 + m + 1.2));
          if (flat(p.x, p.z, rot, 1, 1, bi)) shrine(p.x, p.z, rot, lk);
        }
      }
      // haystacks on the meadows at the edge of the village
      const h4 = (h * 53.1) % 1;
      if (h4 < 0.12) {
        const q = spotNear(b, bi, Math.max(W, D) / 2 + 12, Math.max(W, D) / 2 + 30, 3, 3, h4 * 8);
        if (q && yard(q.x, q.z)) haystack(q.x, q.z, 0.9 + h4 * 2);
      }
    }
  }

  // the outbuildings of a hut (within 90 m, unnamed, not plastered) take its wall and roof colours
  const huts = list.filter((b) => HUTS.some(([re]) => re.test(b.name || ''))).map((b) => ({ b, lk: lookOf(b) }));
  const todo = [];
  for (const [bi, b] of list.entries()) {
    owner = bi;
    const lk = lookOf(b);
    if (!b.name && lk.wall !== 'plaster') {
      const h = huts.find((u) => Math.hypot(u.b.x - b.x, u.b.z - b.z) < 90);
      if (h) { lk.roofTint = h.lk.roofTint; if (h.lk.wall !== 'plaster' && h.lk.wall !== 'stone') lk.wallTint = h.lk.wallTint; }
    }
    const W = b.w, D = b.d, rot = b.a - Math.PI / 2, c = Math.cos(rot), s = Math.sin(rot);
    const L = (x, y, z) => V(b.x + x * c + z * s, y, b.z - x * s + z * c);
    // its front is the downhill long side (the terraces of the huts face the valley)
    const pf = L(0, 0, D / 2 + 4), pb = L(0, 0, -D / 2 - 4);
    const fz = terrain.height(pf.x, pf.z) <= terrain.height(pb.x, pb.z) ? 1 : -1;
    // how far the main wing reaches out on a side (sd: +1 / -1 in the frame): the terrace stands against it
    const wg0 = (lk.wings || [{}])[0];
    const ext = (sd) => sd * (wg0.z || 0) * D * fz + (wg0.across ? (wg0.w ?? 1) * W : (wg0.d ?? 1) * D) / 2;
    const frame = { ox: b.x, oz: b.z, rot, W, D, fz, ext };
    let main = null;
    for (const [n, wg] of (lk.wings || [{}]).entries()) {
      const k = hipped({ ...lk, ...wg, ...('hip' in wg ? { gablet: wg.gablet || 0 } : {}) });
      const ww = (wg.w ?? 1) * W, dd = (wg.d ?? 1) * D, p = L((wg.x || 0) * W, 0, (wg.z || 0) * D * fz);
      const f = wg.across ? { ox: p.x, oz: p.z, rot: rot + Math.PI / 2, W: dd, D: ww, fz: 1 } : { ox: p.x, oz: p.z, rot, W: ww, D: dd, fz };
      const r = block(f, k, { door: n === 0 });
      if (n === 0) main = r;
      else if (wg.dormers) dormersOn(r, k, wg.dormers);
    }
    extras(b, frame, lk, main);
    todo.push({ b, bi, lk, frame, main, hut: HUTS.some(([re]) => re.test(b.name || '')) });
  }
  owner = -1;
  for (const t of todo) surroundings(t);
  const group = new THREE.Group();
  for (const [k, g] of Object.entries(mesher.geometries())) {
    const m = new THREE.Mesh(g, M[k]);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  scene.add(group);
  // is (x, z) inside a building (incl. its eaves, plus a margin)?
  const inside = (x, z, margin = 0) => {
    for (const r of rects) {
      const dx = x - r.x, dz = z - r.z;
      const u = dx * r.c - dz * r.s, v = dx * r.s + dz * r.c;
      if (Math.abs(u) < r.w / 2 + margin && Math.abs(v) < r.d / 2 + margin) return true;
    }
    return false;
  };
  return { group, inside, count: list.length };
}
