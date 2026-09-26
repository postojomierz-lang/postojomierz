// Hand-made battlefields that ship with the game (no API key or network needed).
// Designed on the 2-army grid (64 x 40; army zones are columns 0-15 and 48-63);
// makeMap stretches them for bigger games.
const T = (style, x, y, w, h) => ({ kind: 'tall', style, x, y, w, h });
const L = (style, x, y, w, h) => ({ kind: 'low', style, x, y, w, h });
const S = (style, x, y, w, h) => ({ kind: 'water', style, x, y, w, h });
const D = (kind, x, y) => ({ kind, x, y });

export const LIBRARY = [
  {
    id: 'breakfast', title: 'Battle of the Breakfast Table', theme: 'kitchen', floorColor: '',
    briefing: 'The milk has spilled and the cereal fortress looms over the tiles. Take the spoon bridges before the toast pops.',
    objects: [
      T('cereal', 27, 3, 6, 3), T('mug', 36, 9, 3, 3), T('bottle', 21, 9, 2, 2), T('box', 38, 29, 5, 4),
      T('mug', 20, 30, 3, 3), T('bottle', 31, 33, 2, 2),
      S('milk', 26, 15, 10, 7), S('juice', 40, 18, 5, 4),
      L('spoons', 19, 20, 6, 1), L('spoons', 37, 25, 1, 6), L('spoons', 25, 26, 7, 1),
    ],
    decor: [],
  },
  {
    id: 'desk', title: 'Homework Desk Offensive', theme: 'wood', floorColor: '',
    briefing: 'Between the maths books and the ink spill lies the only road to victory. Pencils make fine trenches.',
    objects: [
      T('books', 21, 4, 6, 4), T('books', 36, 28, 6, 4), T('mug', 31, 19, 3, 3), T('lego', 42, 6, 3, 2),
      T('blocks', 27, 31, 4, 4), T('box', 40, 14, 4, 3),
      S('ink', 22, 24, 7, 5),
      L('pencils', 18, 17, 7, 1), L('crayons', 38, 20, 1, 6), L('remote', 30, 10, 6, 1), L('cable', 19, 35, 9, 1),
    ],
    decor: [],
  },
  {
    id: 'bedroom', title: 'Siege of the Toy Chest', theme: 'carpet', floorColor: '',
    briefing: 'The toy chest has become a fortress. Crawl past the slippers and hold the rug before bedtime.',
    objects: [
      T('toybox', 26, 3, 7, 4), T('lego', 19, 12, 3, 2), T('lego', 41, 12, 2, 3), T('blocks', 30, 16, 4, 4),
      T('lego', 23, 26, 4, 2), T('books', 37, 30, 5, 4), T('blocks', 19, 33, 3, 3),
      S('juice', 38, 5, 5, 4),
      L('shoe', 18, 21, 5, 1), L('shoe', 40, 22, 5, 1), L('crayons', 29, 26, 1, 5), L('crayons', 33, 34, 1, 5),
    ],
    decor: [D('palm', 24, 19), D('palm', 39, 18)],
  },
  {
    id: 'sandbox', title: 'Sandbox Siege', theme: 'sand', floorColor: '',
    briefing: 'Three sandcastles guard the moat. The bucket brigade is dug in. Storm the beach!',
    objects: [
      T('castle', 29, 6, 5, 4), T('castle', 20, 24, 4, 4), T('castle', 39, 24, 4, 4), T('bucket', 36, 12, 3, 3),
      T('bucket', 22, 12, 3, 3), T('rock', 31, 32, 3, 3),
      S('moat', 26, 15, 12, 7),
      L('shells', 18, 5, 6, 1), L('shells', 40, 34, 6, 1), L('shells', 30, 25, 1, 5),
    ],
    decor: [D('palm', 18, 34), D('palm', 45, 6), D('palm', 34, 36)],
  },
  {
    id: 'garden', title: 'Garden Ambush', theme: 'grass', floorColor: '',
    briefing: 'Flowerpots, puddles and a lost bucket. Perfect ambush country. Watch the hedges.',
    objects: [
      T('flowerpot', 21, 6, 3, 3), T('flowerpot', 40, 8, 3, 3), T('rock', 30, 13, 4, 3), T('bucket', 33, 28, 3, 3),
      T('flowerpot', 22, 30, 3, 3), T('rock', 42, 30, 3, 2),
      S('puddle', 24, 18, 7, 5), S('puddle', 37, 17, 6, 4),
      L('twigs', 18, 13, 1, 6), L('twigs', 45, 20, 1, 6), L('twigs', 28, 35, 7, 1), L('twigs', 31, 4, 7, 1),
    ],
    decor: [D('bush', 26, 26), D('bush', 36, 24), D('bush', 19, 24), D('bush', 44, 14), D('bush', 29, 9), D('bush', 38, 36)],
  },
  {
    id: 'snow', title: 'Snow Day Showdown', theme: 'snow', floorColor: '',
    briefing: 'School is cancelled and the snowmen have picked sides. Beware the frozen puddles.',
    objects: [
      T('snowman', 25, 5, 3, 3), T('snowman', 37, 30, 3, 3), T('rock', 31, 17, 3, 3), T('bucket', 41, 9, 3, 3),
      T('snowman', 20, 27, 3, 3), T('rock', 35, 5, 3, 2),
      S('ice', 22, 14, 6, 5), S('ice', 37, 19, 6, 5),
      L('twigs', 27, 25, 7, 1), L('twigs', 44, 26, 1, 6), L('twigs', 18, 21, 1, 5),
    ],
    decor: [D('pine', 19, 5), D('pine', 45, 36), D('pine', 30, 36), D('pine', 34, 2), D('pine', 44, 17)],
  },
  {
    id: 'livingroom', title: 'Living Room Blitz', theme: 'wood', floorColor: '#c89a62',
    briefing: 'Somebody knocked over the cola by the sofa. Tanks will not cross it. Plan your flanks.',
    objects: [
      T('shoebox', 20, 5, 6, 4), T('books', 37, 6, 6, 4), T('mug', 31, 13, 3, 3), T('box', 22, 29, 5, 5),
      T('bottle', 40, 30, 2, 2), T('lego', 35, 34, 3, 2),
      S('cola', 27, 21, 9, 6),
      L('remote', 19, 17, 6, 1), L('shoe', 39, 17, 6, 1), L('cable', 29, 3, 7, 1), L('cable', 44, 22, 1, 6),
    ],
    decor: [],
  },
  {
    id: 'kitchenfloor', title: 'Kitchen Floor Chaos', theme: 'kitchen', floorColor: '#e6e1d4',
    briefing: 'Pots, pans and two spills. Whoever holds the dry tiles in the middle holds the kitchen.',
    objects: [
      T('pot', 21, 5, 4, 4), T('pot', 39, 29, 4, 4), T('bottle', 33, 7, 2, 2), T('box', 38, 5, 5, 4),
      T('cereal', 20, 30, 6, 3), T('mug', 30, 19, 3, 3),
      S('milk', 23, 14, 6, 5), S('juice', 36, 18, 6, 5),
      L('spoons', 27, 28, 6, 1), L('spoons', 31, 34, 7, 1), L('spoons', 45, 12, 1, 6),
    ],
    decor: [],
  },
].map(m => ({ ...m, format: 'plastic-front-map', version: 1, W: 64, H: 40 }));
