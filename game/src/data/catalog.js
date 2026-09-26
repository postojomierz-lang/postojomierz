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
  tank: {
    name: 'Tank', group: 'vehicles', cls: 'vehicle', vehicle: true, cost: 160, hp: 170, armor: 3, speed: 2.0, size: [2, 3], radius: 1.3,
    weapon: { kind: 'shell', range: 14, dmg: 28, cd: 2.6, acc: 0.8, splash: 1.2, projSpeed: 20 },
    blurb: 'Heavy armour and a big gun. Crushes barbed wire.',
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
  barrel: {
    name: 'Oil barrel', group: 'forts', cls: 'fort', static: true, cost: 5, hp: 12, size: [1, 1], explodes: { dmg: 30, radius: 2.6 },
    blurb: 'Explodes when shot. Nasty surprise.',
  },

  // ---- headquarters (one per army, free) -----------------------------------
  hq: {
    name: 'Headquarters', group: 'hq', cls: 'hq', static: true, cost: 0, hp: 500, size: [4, 4], radius: 2, blocksLos: true,
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
};
