// Everything a player can put on the map.
//
// Sizes are in grid cells (1 cell = 1 world unit; a plastic soldier stands about 1 unit tall).
// Weapon ranges are in cells, cooldowns in seconds, speeds in cells per second.
//
// Weapon kinds:
//   bullet  - instant hit roll, tracer only. Weak against armour and structures.
//   rocket  - direct-fire projectile, strong against armour.
//   shell   - direct-fire projectile with splash (tank cannon).
//   arty    - indirect: flies in an arc over walls, splash, has a minimum range.
//   grenade - short indirect throw with splash.
//   flak    - anti-air only.

export const CATALOG = {
  // ---- infantry -------------------------------------------------------------
  rifleman: {
    name: 'Rifleman', group: 'infantry', cls: 'infantry', cost: 10, hp: 10, speed: 1.7, size: [1, 1], radius: 0.32,
    weapon: { kind: 'bullet', range: 9, dmg: 2, cd: 1.1, acc: 0.72, air: true },
    blurb: 'Cheap and reliable. Can shoot at helicopters.',
  },
  mg: {
    name: 'Machine gunner', group: 'infantry', cls: 'infantry', cost: 22, hp: 12, speed: 1.1, size: [1, 1], radius: 0.4,
    weapon: { kind: 'bullet', range: 11, dmg: 1, cd: 0.16, acc: 0.42, air: true },
    blurb: 'Shreds infantry. Slow to move.',
  },
  lmg: {
    name: 'LMG team', group: 'infantry', cls: 'infantry', team2: true, cost: 45, hp: 20, speed: 1.3, size: [1, 1], radius: 0.45, len: 0.8,
    weapon: { kind: 'bullet', range: 16, dmg: 1, cd: 0.13, acc: 0.55, air: true },
    blurb: 'Gunner and loader. Once the bipod is down it outshoots anything on foot; slower without the loader.',
  },
  bazooka: {
    name: 'Bazooka', group: 'infantry', cls: 'infantry', cost: 25, hp: 10, speed: 1.4, size: [1, 1], radius: 0.32,
    weapon: { kind: 'rocket', range: 9, dmg: 20, cd: 3.4, acc: 0.8, splash: 0.7, projSpeed: 13, prefer: 'armor' },
    blurb: 'Tank hunter. Poor against infantry.',
  },
  sniper: {
    name: 'Sniper', group: 'infantry', cls: 'infantry', cost: 30, hp: 8, speed: 1.4, size: [1, 1], radius: 0.4,
    weapon: { kind: 'bullet', range: 19, dmg: 9, cd: 3.0, acc: 0.9, air: true, prefer: 'infantry' },
    blurb: 'Very long range. Fragile.',
  },
  grenadier: {
    name: 'Grenadier', group: 'infantry', cls: 'infantry', cost: 18, hp: 10, speed: 1.6, size: [1, 1], radius: 0.32,
    weapon: { kind: 'grenade', range: 7, dmg: 9, cd: 2.6, acc: 0.8, splash: 1.6 },
    blurb: 'Lobs grenades over walls and cover.',
  },
  officer: {
    name: 'Officer', group: 'infantry', cls: 'infantry', cost: 30, hp: 14, speed: 1.6, size: [1, 1], radius: 0.32, aura: 5,
    weapon: { kind: 'bullet', range: 8, dmg: 2, cd: 1.0, acc: 0.7, air: true },
    blurb: 'Soldiers within 5 cells fire 30% faster.',
  },
  manpads: {
    name: 'AA missile soldier', group: 'infantry', cls: 'infantry', cost: 35, hp: 10, speed: 1.4, size: [1, 1], radius: 0.32,
    weapon: { kind: 'missile', range: 17, dmg: 40, cd: 6, acc: 0.85, airOnly: true, projSpeed: 18 },
    blurb: 'Shoulder-fired homing missile. Only shoots at aircraft.',
  },
  medic: {
    name: 'Medic', group: 'infantry', cls: 'infantry', cost: 20, hp: 10, speed: 1.9, size: [1, 1], radius: 0.32, healer: true, healTime: 3,
    weapon: { kind: 'bullet', range: 6, dmg: 1, cd: 1.4, acc: 0.6 },
    blurb: 'Runs to wounded soldiers and patches them up on the spot, so they fight on.',
  },
  bearers: {
    name: 'Stretcher bearers', group: 'infantry', cls: 'infantry', medic: true, capacity: 1, cost: 25, hp: 16, speed: 1.3, size: [1, 1], radius: 0.45, len: 1.15,
    blurb: 'Two unarmed men with a stretcher: carry a wounded soldier home from where no ambulance can go.',
  },
  mp: {
    name: 'Military police', group: 'infantry', cls: 'infantry', cost: 25, hp: 12, speed: 1.7, size: [1, 1], radius: 0.32, mp: 8,
    weapon: { kind: 'bullet', range: 7, dmg: 1, cd: 0.8, acc: 0.6 },
    blurb: 'Soldiers right next to him (4 cells) never break under fire; turns back any running for home within 8.',
  },
  para: {
    name: 'Paratrooper', group: 'hidden', cls: 'infantry', cost: 10, hp: 10, speed: 1.7, size: [1, 1], radius: 0.32,
    weapon: { kind: 'bullet', range: 9, dmg: 2, cd: 1.1, acc: 0.72, air: true },
    blurb: 'Dropped behind enemy lines by a transport plane.',
  },

  // ---- vehicles (limited per round) ---------------------------------------
  jeep: {
    name: 'Jeep', group: 'vehicles', cls: 'vehicle', vehicle: true, cost: 60, hp: 45, armor: 1, speed: 4.2, size: [2, 2], radius: 0.9,
    weapon: { kind: 'bullet', range: 10, dmg: 1, cd: 0.2, acc: 0.45, air: true },
    blurb: 'Fast raider with a mounted machine gun.',
  },
  ambulance: {
    name: 'Field ambulance', group: 'vehicles', cls: 'vehicle', vehicle: true, medic: true, capacity: 4, cost: 70, hp: 55, armor: 1, speed: 3.6, size: [2, 2], radius: 0.95,
    blurb: 'Picks up wounded soldiers (4 at a time) and brings them home. Saved soldiers fight again next round.',
  },
  // engineers: an unarmed truck with two sappers drives out in front of the base and lays its load
  // there (a line across the way the enemy will come), then drives home. Restocked every round.
  eng_traps: {
    name: 'Engineers: tank traps', group: 'vehicles', cls: 'vehicle', vehicle: true, engineer: { lay: 'tanktrap', count: 4, gap: 1.6 }, cost: 60, hp: 50, armor: 1, speed: 3.2, size: [2, 2], radius: 0.95,
    blurb: 'Sets up 4 steel hedgehogs in front of the base. Vehicles cannot pass (they must shoot them away); infantry walks through.',
  },
  eng_at: {
    name: 'Engineers: AT mines', group: 'vehicles', cls: 'vehicle', vehicle: true, engineer: { lay: 'at', count: 5, gap: 1.3 }, cost: 75, hp: 50, armor: 1, speed: 3.2, size: [2, 2], radius: 0.95,
    blurb: 'Buries 5 anti-tank mines. Hidden from the enemy; they blow up the first enemy vehicle that drives over them.',
  },
  eng_ap: {
    name: 'Engineers: AP mines', group: 'vehicles', cls: 'vehicle', vehicle: true, engineer: { lay: 'ap', count: 6, gap: 1.1 }, cost: 55, hp: 50, armor: 1, speed: 3.2, size: [2, 2], radius: 0.95,
    blurb: 'Buries 6 anti-personnel mines. Hidden from the enemy; they go off under enemy soldiers.',
  },
  apc: {
    name: 'Armored car', group: 'vehicles', cls: 'vehicle', vehicle: true, cost: 100, hp: 95, armor: 2, speed: 2.9, size: [2, 2], radius: 1.0,
    weapon: { kind: 'bullet', range: 11, dmg: 2, cd: 0.24, acc: 0.5, air: true },
    blurb: 'Tough wheeled gun carrier.',
  },
  amphib: {
    name: 'Amphibian', group: 'vehicles', cls: 'vehicle', vehicle: true, move: 'amphib', cost: 110, hp: 80, armor: 2, speed: 2.6, size: [2, 2], radius: 1.0,
    weapon: { kind: 'bullet', range: 10, dmg: 2, cd: 0.25, acc: 0.5, air: true },
    blurb: 'Drives straight through spills and puddles.',
  },
  // tanks: light (fast, cheap, a small gun), medium (the all-rounder), heavy (slow, very tough, a big gun)
  tank_light: {
    name: 'Light tank', group: 'vehicles', cls: 'vehicle', vehicle: true, tracked: 0.46, cost: 100, hp: 105, armor: 2, speed: 3.0, size: [2, 2], radius: 1.0,
    weapon: { kind: 'shell', range: 12, dmg: 15, cd: 1.5, acc: 0.8, splash: 0.8, projSpeed: 22 },
    blurb: 'M5 Stuart. Fast and cheap, a quick-firing 37 mm gun. Good against infantry and cars, thin armour.',
  },
  tank: {
    name: 'Medium tank', group: 'vehicles', cls: 'vehicle', vehicle: true, tracked: 0.62, cost: 160, hp: 170, armor: 3, speed: 2.0, size: [2, 3], radius: 1.3,
    weapon: { kind: 'shell', range: 14, dmg: 28, cd: 2.6, acc: 0.8, splash: 1.2, projSpeed: 20 },
    blurb: 'M4 Sherman. Solid armour and a 75 mm gun: the all-rounder. Crushes barbed wire.',
  },
  tank_heavy: {
    name: 'Heavy tank', group: 'vehicles', cls: 'vehicle', vehicle: true, tracked: 0.8, cost: 260, hp: 310, armor: 4, speed: 1.4, size: [3, 3], radius: 1.5,
    weapon: { kind: 'shell', range: 17, dmg: 46, cd: 3.4, acc: 0.85, splash: 1.5, projSpeed: 26 },
    blurb: 'M26 Pershing. Slow, very tough, a long 90 mm gun that outranges other tanks. Crushes barbed wire.',
  },
  rockets: {
    name: 'Rocket launcher', group: 'vehicles', cls: 'vehicle', vehicle: true, cost: 180, hp: 60, armor: 1, speed: 2.2, size: [2, 3], radius: 1.2,
    weapon: { kind: 'arty', range: 30, minRange: 7, dmg: 12, cd: 8, salvo: 6, acc: 0.5, splash: 1.7 },
    blurb: 'Rains rocket salvos from far away. Keep it protected.',
  },
  heli: {
    name: 'Helicopter', group: 'air', cls: 'air', aircraft: true, move: 'air', alt: 3.2, cost: 200, hp: 70, armor: 1, speed: 4.5, size: [2, 2], radius: 1.2,
    weapon: { kind: 'rocket', range: 12, dmg: 14, cd: 1.6, acc: 0.7, splash: 1.0, projSpeed: 16 },
    blurb: 'Hovers over the battle. Bullets, flak and AA missiles can hit it.',
  },

  // ---- aircraft (limited per round; they fly passes instead of hovering) ------
  fighter: {
    name: 'Fighter', group: 'air', cls: 'plane', aircraft: true, move: 'plane', alt: 6, cost: 220, hp: 60, armor: 1, speed: 9, turn: 2.4, size: [2, 2], radius: 1.2,
    weapon: { kind: 'bullet', range: 10, dmg: 3, cd: 0.12, acc: 0.6, air: true, prefer: 'air' },
    blurb: 'Hunts helicopters and planes. Strafes infantry when the sky is clear.',
  },
  attacker: {
    name: 'Ground-attack plane', group: 'air', cls: 'plane', aircraft: true, move: 'plane', alt: 5, cost: 240, hp: 75, armor: 1, speed: 7.5, turn: 2.0, size: [2, 2], radius: 1.2,
    weapon: { kind: 'rocket', range: 12, dmg: 18, cd: 0.7, acc: 0.75, splash: 1.0, projSpeed: 24, prefer: 'armor' },
    blurb: 'Makes rocket runs on tanks, guns and bunkers.',
  },
  bomber: {
    name: 'Bomber', group: 'air', cls: 'plane', aircraft: true, move: 'plane', alt: 7, sortie: 'bomb', cost: 260, hp: 110, armor: 1, speed: 6, turn: 1.2, size: [2, 2], radius: 1.4,
    bombs: 10, bomb: { dmg: 24, splash: 2.0 },
    blurb: 'One run: carpets a line near the nearest enemy HQ with bombs, then flies home. Bombs hurt everyone.',
  },
  transport: {
    name: 'Paratroop plane', group: 'air', cls: 'plane', aircraft: true, move: 'plane', alt: 7, sortie: 'drop', cost: 180, hp: 80, armor: 1, speed: 7, turn: 1.4, size: [2, 2], radius: 1.4,
    paras: 6,
    blurb: 'Drops 6 paratroopers behind enemy lines, then flies home.',
  },

  // ---- emplacements (static guns) ----------------------------------------
  mgnest: {
    name: 'MG nest', group: 'defense', cls: 'emplacement', static: true, cost: 60, hp: 90, size: [2, 2], radius: 1.0, cover: true,
    weapon: { kind: 'bullet', range: 13, dmg: 1, cd: 0.14, acc: 0.5, air: true },
    blurb: 'Sandbagged machine gun. Holds a line.',
  },
  fieldgun: {
    name: 'Field gun', group: 'defense', cls: 'emplacement', static: true, cost: 130, hp: 80, size: [2, 2], radius: 1.0,
    weapon: { kind: 'arty', range: 26, minRange: 5, dmg: 24, cd: 4, acc: 0.6, splash: 1.8 },
    blurb: 'Long-range artillery. Fires over walls.',
  },
  aa: {
    name: 'Anti-air gun', group: 'defense', cls: 'emplacement', static: true, cost: 90, hp: 70, size: [2, 2], radius: 1.0,
    weapon: { kind: 'flak', range: 18, dmg: 9, cd: 0.45, acc: 0.8, airOnly: true },
    blurb: 'Swats helicopters out of the sky.',
  },
  tower: {
    name: 'Watchtower', group: 'defense', cls: 'emplacement', static: true, cost: 70, hp: 140, size: [2, 2], radius: 1.0, blocksLos: true,
    weapon: { kind: 'bullet', range: 16, dmg: 4, cd: 1.4, acc: 0.8, air: true },
    blurb: 'Brick tower with a lookout rifleman.',
  },
  hospital: {
    name: 'Field hospital', group: 'defense', cls: 'emplacement', static: true, cost: 90, hp: 150, size: [3, 3], radius: 1.5, beds: 6,
    blurb: 'Ward tent for 6 wounded: they are back the next round instead of missing one.',
  },

  // ---- fortifications ---------------------------------------------------------
  sandbags: {
    name: 'Sandbags', group: 'forts', cls: 'fort', static: true, cost: 8, hp: 60, size: [2, 1], cover: true,
    blurb: 'Soldiers behind sandbags are hit half as often.',
  },
  wire: {
    name: 'Barbed wire', group: 'forts', cls: 'fort', static: true, cost: 6, hp: 25, size: [2, 1], wire: true,
    blurb: 'Stops infantry. Tanks and cars flatten it.',
  },
  wall: {
    name: 'Brick wall', group: 'forts', cls: 'fort', static: true, cost: 25, hp: 180, size: [3, 1], blocksLos: true, cover: true,
    blurb: 'Blocks movement and direct fire.',
  },
  tanktrap: {
    name: 'Tank trap', group: 'hidden', cls: 'fort', static: true, tankTrap: true, cost: 0, hp: 70, size: [1, 1],
    blurb: 'Steel hedgehog set up by engineers. Stops vehicles, not infantry.',
  },
  barrel: {
    name: 'Oil barrel', group: 'forts', cls: 'fort', static: true, cost: 5, hp: 12, size: [1, 1], explodes: { dmg: 30, radius: 2.6 },
    blurb: 'Explodes when shot. Nasty surprise.',
  },

  // ---- headquarters (one per army, free) -----------------------------------
  hq: {
    name: 'Headquarters', group: 'hq', cls: 'hq', static: true, cost: 0, hp: 900, size: [4, 4], radius: 2, blocksLos: true,
    weapon: { kind: 'bullet', range: 10, dmg: 1, cd: 0.25, acc: 0.5, air: true },
    blurb: 'Lose it and your army is out.',
  },
};

export const GROUPS = [
  { id: 'infantry', name: 'Infantry' },
  { id: 'vehicles', name: 'Vehicles' },
  { id: 'air', name: 'Aircraft' },
  { id: 'defense', name: 'Defenses' },
  { id: 'forts', name: 'Fortifications' },
];

export const TEAM_COLORS = [
  { id: 'green', name: 'Green', main: '#4f7f28', dark: '#34561a' },
  { id: 'tan', name: 'Tan', main: '#c9a262', dark: '#9c7a43' },
  { id: 'grey', name: 'Grey', main: '#8f969c', dark: '#5f656a' },
  { id: 'blue', name: 'Blue', main: '#3e6fb8', dark: '#284b80' },
  { id: 'red', name: 'Red', main: '#b8453a', dark: '#7e2c24' },
  { id: 'black', name: 'Black', main: '#3a3a3c', dark: '#222224' },
  { id: 'white', name: 'White', main: '#e8e6df', dark: '#b3b0a6' },
  { id: 'orange', name: 'Orange', main: '#e0842c', dark: '#a85c16' },
];

export const RULES = {
  startBudget: 1000,
  income: 320,
  incomeGrowth: 80,       // extra income per round, so battles escalate
  killBounty: 0.25,        // share of a destroyed enemy's cost paid to the killer's army
  vehiclesPerRound: 3,
  aircraftPerRound: 2,
  bleedSeconds: 18,       // a wounded soldier dies if nobody helps in time
  woundChance: 0.55,      // share of 'killed' infantry that are only wounded
  battleSeconds: 40,
  maxRounds: 10,
  tickRate: 20,
  // experience: a unit earns the value of the damage it does (the share of a target's health
  // times the target's cost); at 1x, 3x and 6x its own cost it becomes a Veteran, Elite, Hero
  // rescued wounded recover in the base: with a hospital bed they are back the next round,
  // without one they miss a round. They return as themselves, rank and experience kept.
  recovery: { rounds: 2, bed: 2, noBed: 1 },
  // badly hurt soldiers may break and run for home for a few seconds - unless an officer
  // (within his aura) or a military policeman (within his reach) is close by
  // the two-man light machine gun team: firing before the bipod is set up, or without the loader
  lmg: { setup: 1.5, hastyAcc: 0.4, hastyRate: 2.2, aloneRate: 1.6 },
  morale: { breakAt: 0.4, chance: 0.35, flee: 5 },
  veteran: {
    names: ['Veteran', 'Elite', 'Hero'],
    at: [1, 3, 6],
    acc: [0.1, 0.2, 0.3],      // hit chance, relative
    rate: [0, 0.2, 0.3],       // rate of fire, relative
    hp: [0.1, 0.15, 0.2],      // toughness, relative
  },
  mines: {               // engineers' mines: trigger radius, blast radius, damage
    at: { trigger: 0.5, radius: 1.1, dmg: 130 },
    ap: { trigger: 0.45, radius: 1.3, dmg: 16 },
    perTeam: 40,         // at most this many live mines per army (the oldest are lifted)
  },
};
