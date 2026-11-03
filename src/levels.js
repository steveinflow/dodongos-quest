// The four levels of Dodongo's Quest: fights, roads, breakables, interactables, save points, bosses, lines.
// (Mystic Mountain's five: src/mmlevels.js.  LEVELS / SECRET_LEVELS / ALL_LEVELS below are the QUEST's -- src/quests.js
//  setQuest swaps them (useQuestLevels); every importer sees the swap, ES module exports being live bindings)
import { MM_LEVELS, MM_SECRET_LEVELS } from './mmlevels.js';
import { SI_LEVELS, SI_SECRET_LEVELS } from './silevels.js';
// Arena `cam` = the camera's left edge while the screen is locked.  Spawn specs:
//   { k: kind, side: 'L' | 'R', y, v: variant, delay: frames after the wave starts, name }
// kinds: kobold (v green|blue|red|miner|bomber|shaman), whelp (v storm), brute (v magma), salamander, wyvern, guard
// things: { kind, x, y, ... } — waystone, cage, snowball, pine, boulder, cart, vent, keg, gong, ballista, statue, chandelier, chest

export const DQ_LEVELS = [
  // =========================================================================================== 1
  {
    id: 'road', num: 1, name: 'THE DRAGON ROAD', stage: './stage.js', len: 6400, music: 'stage', bossMusic: 'boss',
    sections: [
      { id: 'trail', name: 'The Pine Trail', x0: 0, x1: 1600 },
      { id: 'bridge', name: 'The Old Stone Bridge', x0: 1600, x1: 2900 },
      { id: 'village', name: 'The Clan Village', x0: 2900, x1: 4600 },
      { id: 'gate', name: 'The Dragon Gate', x0: 4600, x1: 6400 },
    ],
    arenas: [
      { cam: 600, say: [['kob', 'HALT! The Dragon King says\nNO VISITORS!'], ['hero', "We're not visitors.\nWe're HEROES!"]],
        waves: [
          [{ k: 'kobold', side: 'R', y: 50 }, { k: 'kobold', side: 'R', y: 115, delay: 40 }, { k: 'kobold', side: 'L', y: 80, delay: 110 }],
          [{ k: 'kobold', side: 'R', y: 70 }, { k: 'kobold', side: 'L', y: 30, delay: 30, v: 'blue' }, { k: 'kobold', side: 'R', y: 125, delay: 90 }],
        ] },
      { cam: 1900, say: [['hero', { dodongo: "A baby dragon in a COLLAR?!\nHold still, little guy!\nWe'll knock it off!", ana: "A baby dragon in a collar!\nHold still, little one!\nWe'll knock it off!", shadow: '...!' }]],
        waves: [
          [{ k: 'whelp', side: 'R', y: 70 }, { k: 'kobold', side: 'L', y: 40, delay: 30 }, { k: 'kobold', side: 'R', y: 120, delay: 60 }],
          [{ k: 'whelp', side: 'L', y: 110 }, { k: 'whelp', side: 'R', y: 40, delay: 50 }, { k: 'kobold', side: 'R', y: 80, delay: 120, v: 'blue' }],
        ] },
      { cam: 3150, brute: true,
        waves: [
          [{ k: 'brute', side: 'R', y: 80, name: 'BIG GRONK' }, { k: 'kobold', side: 'L', y: 40, delay: 90 }],
          [{ k: 'kobold', side: 'R', y: 40, v: 'blue' }, { k: 'kobold', side: 'L', y: 120, v: 'blue', delay: 30 }, { k: 'kobold', side: 'R', y: 90, v: 'red', delay: 80 }],
        ] },
      { cam: 4250,
        waves: [
          [{ k: 'whelp', side: 'R', y: 40 }, { k: 'whelp', side: 'L', y: 110, delay: 40 }, { k: 'kobold', side: 'R', y: 120, delay: 70 }, { k: 'kobold', side: 'L', y: 60, delay: 120 }],
          [{ k: 'brute', side: 'R', y: 70, name: 'LUMPJAW' }, { k: 'kobold', side: 'L', y: 30, v: 'blue', delay: 60 }, { k: 'whelp', side: 'R', y: 120, delay: 140 }],
        ] },
      { cam: 5440, boss: 'grimscale' },
    ],
    patrols: [
      { x: 2210, spawns: [{ k: 'kobold', side: 'R', y: 60 }, { k: 'kobold', side: 'R', y: 120, delay: 50 }] },
      { x: 3485, spawns: [{ k: 'whelp', side: 'R', y: 80 }] },
      { x: 4660, spawns: [{ k: 'kobold', side: 'R', y: 40, v: 'blue' }, { k: 'kobold', side: 'R', y: 110, delay: 40 }] },
      { x: 5805, spawns: [{ k: 'kobold', side: 'R', y: 80, v: 'red' }, { k: 'whelp', side: 'R', y: 40, delay: 60 }] },
    ],
    props: [
      ['crate', 430, 30, 'apple'], ['barrel', 1080, 118, 'coin'], ['crate', 1420, 46, 'gem'], ['urn', 2260, 26, 'apple'],
      ['crate', 2580, 120, 'coin'], ['barrel', 3080, 40, 'drumstick'], ['crate', 3560, 118, 'gem'], ['urn', 3720, 30, 'coin'],
      ['barrel', 4120, 70, 'apple'], ['crate', 4720, 36, 'drumstick'], ['urn', 4950, 122, 'gem'], ['barrel', 5250, 70, 'gem'],
    ],
    things: [
      { kind: 'snowball', x: 760, y: 120 }, { kind: 'pine', x: 1250, y: 6 }, { kind: 'snowball', x: 1500, y: 40 },
      { kind: 'cage', x: 2420, y: 70 }, { kind: 'waystone', x: 2800, y: 30 }, { kind: 'boulder', x: 3300, y: 100 },
      { kind: 'snowball', x: 3900, y: 60 }, { kind: 'cage', x: 4500, y: 110 }, { kind: 'waystone', x: 5150, y: 40 },
      { kind: 'pine', x: 4380, y: 4 },
      // (treasure chests, off the path: the PIRATE QUEEN's unlock counts them -- 12 in the four stages)
      { kind: 'chest', x: 1900, y: 12 }, { kind: 'chest', x: 3650, y: 132 }, { kind: 'chest', x: 5000, y: 14 },
      { kind: 'pillar', x: 2560, y: 4, secret: 's1' },      // (a cracked pillar under the bridge: the way to the Frozen Hollow)
    ],
    boss: { kind: 'grimscale', x: 6140, y: 75 },
    intro: 'prologue',
  },

  // =========================================================================================== 2
  {
    id: 'mines', num: 2, name: 'THE EMBER MINES', stage: './stages/mines.js', len: 7200, music: 'mines', bossMusic: 'minesboss',
    arenas: [
      { cam: 700, say: [['kob', 'Back to work, you lazy--\n...oh. It\'s THEM.'], ['hero', 'Pickaxes down!\nThe mine is closed!']],
        waves: [
          [{ k: 'kobold', side: 'R', y: 50, v: 'miner' }, { k: 'kobold', side: 'R', y: 120, v: 'miner', delay: 40 }, { k: 'kobold', side: 'L', y: 85, v: 'miner', delay: 100 }],
          [{ k: 'kobold', side: 'R', y: 40, v: 'bomber' }, { k: 'kobold', side: 'L', y: 110, v: 'miner', delay: 30 }, { k: 'kobold', side: 'R', y: 90, v: 'miner', delay: 90 }],
        ] },
      { cam: 2000, say: [['dod', 'Lava lizards!\nThey look... spicy.']],
        waves: [
          [{ k: 'salamander', side: 'R', y: 60 }, { k: 'salamander', side: 'L', y: 110, delay: 50 }, { k: 'kobold', side: 'R', y: 90, v: 'miner', delay: 90 }],
          [{ k: 'kobold', side: 'R', y: 30, v: 'bomber' }, { k: 'kobold', side: 'L', y: 120, v: 'bomber', delay: 40 }, { k: 'salamander', side: 'R', y: 80, delay: 90 }],
        ] },
      { cam: 3300, brute: true,
        waves: [
          [{ k: 'brute', side: 'R', y: 80, v: 'magma', name: 'SLAG' }, { k: 'kobold', side: 'L', y: 40, v: 'miner', delay: 80 }],
          [{ k: 'salamander', side: 'R', y: 40 }, { k: 'salamander', side: 'L', y: 120, delay: 30 }, { k: 'salamander', side: 'R', y: 90, delay: 70 }, { k: 'kobold', side: 'L', y: 70, v: 'bomber', delay: 110 }],
        ] },
      { cam: 4700,
        waves: [
          [{ k: 'whelp', side: 'R', y: 50 }, { k: 'kobold', side: 'L', y: 110, v: 'bomber', delay: 40 }, { k: 'kobold', side: 'R', y: 100, v: 'miner', delay: 80 }, { k: 'salamander', side: 'L', y: 40, delay: 130 }],
          [{ k: 'brute', side: 'R', y: 70, v: 'magma', name: 'CINDERS' }, { k: 'kobold', side: 'L', y: 30, v: 'red', delay: 60 }, { k: 'kobold', side: 'R', y: 120, v: 'bomber', delay: 120 }],
        ] },
      { cam: 6240, boss: 'magmaw' },
    ],
    patrols: [
      { x: 2350, spawns: [{ k: 'kobold', side: 'R', y: 60, v: 'miner' }, { k: 'salamander', side: 'R', y: 110, delay: 40 }] },
      { x: 3650, spawns: [{ k: 'kobold', side: 'R', y: 90, v: 'bomber' }] },
      { x: 5100, spawns: [{ k: 'salamander', side: 'R', y: 50 }, { k: 'kobold', side: 'R', y: 110, v: 'miner', delay: 40 }] },
      { x: 6400, spawns: [{ k: 'kobold', side: 'R', y: 80, v: 'red' }] },
    ],
    props: [
      ['crate', 420, 40, 'apple'], ['barrel', 1180, 115, 'coin'], ['urn', 1500, 40, 'gem'], ['crate', 2350, 30, 'drumstick'],
      ['barrel', 2900, 118, 'coin'], ['urn', 3550, 30, 'apple'], ['crate', 4100, 116, 'gem'], ['barrel', 4500, 40, 'coin'],
      ['crate', 5200, 36, 'drumstick'], ['urn', 5600, 120, 'gem'], ['barrel', 6050, 40, 'gem'],
      // (the ore crate at 5200 stood mid-lane, y 70, where the arena's fighters walk: its coal heap hid their legs --
      //  painted review; at the back edge, like the level's other back props, it only covers someone right behind it)
    ],
    things: [
      { kind: 'cart', x: 900, y: 20 }, { kind: 'keg', x: 1350, y: 90 }, { kind: 'cage', x: 1700, y: 60 },
      { kind: 'cart', x: 2250, y: 125 }, { kind: 'waystone', x: 2700, y: 30 }, { kind: 'keg', x: 3150, y: 60 },
      { kind: 'vent', x: 3600, y: 70 }, { kind: 'vent', x: 3900, y: 30 }, { kind: 'vent', x: 4200, y: 110 }, { kind: 'cage', x: 4400, y: 90 },
      { kind: 'keg', x: 4950, y: 40 }, { kind: 'waystone', x: 5300, y: 30 }, { kind: 'cart', x: 5550, y: 20 }, { kind: 'vent', x: 5850, y: 100 },
      { kind: 'chest', x: 1100, y: 132 }, { kind: 'chest', x: 2550, y: 12 }, { kind: 'chest', x: 4700, y: 130 },
      { kind: 'switch', x: 3010, y: 4, secret: 's2' },      // (a rusty switch by a side track: the runaway cart to the Crystal Deep)
    ],
    boss: { kind: 'magmaw', x: 6720, y: 110, pools: [[6450, 50], [6720, 110], [7000, 45]] },
    intro: 'before_mines',
  },

  // =========================================================================================== 3
  {
    id: 'storm', num: 3, name: 'STORMSPIRE', stage: './stages/stormspire.js', len: 7200, music: 'storm', bossMusic: 'stormboss',
    arenas: [
      { cam: 700, say: [['kob', 'Nobody climbs\nSTORMSPIRE!'], ['hero', 'We just DID.']],
        waves: [
          [{ k: 'kobold', side: 'R', y: 50, v: 'blue' }, { k: 'whelp', side: 'R', y: 100, v: 'storm', delay: 40 }, { k: 'kobold', side: 'L', y: 85, v: 'blue', delay: 90 }],
          [{ k: 'whelp', side: 'L', y: 40, v: 'storm' }, { k: 'kobold', side: 'R', y: 110, v: 'red', delay: 40 }, { k: 'kobold', side: 'R', y: 60, delay: 90 }],
        ] },
      { cam: 2100, say: [['dod', "Don't look down.\nDON'T LOOK DOWN."]],
        waves: [
          [{ k: 'wyvern', side: 'R', y: 60 }, { k: 'kobold', side: 'L', y: 110, v: 'blue', delay: 40 }, { k: 'kobold', side: 'R', y: 100, delay: 90 }],
          [{ k: 'wyvern', side: 'L', y: 40 }, { k: 'wyvern', side: 'R', y: 110, delay: 60 }, { k: 'kobold', side: 'R', y: 80, v: 'bomber', delay: 120 }],
        ] },
      { cam: 3400, brute: true,
        waves: [
          [{ k: 'brute', side: 'R', y: 80, name: 'THUNDERGUT' }, { k: 'whelp', side: 'L', y: 40, v: 'storm', delay: 80 }],
          [{ k: 'wyvern', side: 'R', y: 50 }, { k: 'whelp', side: 'L', y: 110, v: 'storm', delay: 40 }, { k: 'kobold', side: 'R', y: 120, v: 'red', delay: 100 }],
        ] },
      { cam: 4700,
        waves: [
          [{ k: 'kobold', side: 'R', y: 40, v: 'red' }, { k: 'kobold', side: 'L', y: 120, v: 'blue', delay: 30 }, { k: 'wyvern', side: 'R', y: 90, delay: 70 }, { k: 'whelp', side: 'L', y: 60, v: 'storm', delay: 120 }],
          [{ k: 'brute', side: 'R', y: 70, name: 'GALEBELLY' }, { k: 'wyvern', side: 'L', y: 30, delay: 60 }, { k: 'kobold', side: 'R', y: 120, v: 'bomber', delay: 120 }],
        ] },
      { cam: 6240, boss: 'tempest' },
    ],
    patrols: [
      { x: 2500, spawns: [{ k: 'whelp', side: 'R', y: 60, v: 'storm' }, { k: 'kobold', side: 'R', y: 110, v: 'blue', delay: 40 }] },
      { x: 3800, spawns: [{ k: 'wyvern', side: 'R', y: 80 }] },
      { x: 5100, spawns: [{ k: 'kobold', side: 'R', y: 50, v: 'red' }, { k: 'whelp', side: 'R', y: 110, v: 'storm', delay: 40 }] },
      { x: 6400, spawns: [{ k: 'wyvern', side: 'R', y: 70 }] },
    ],
    props: [
      ['crate', 450, 40, 'apple'], ['barrel', 1150, 115, 'coin'], ['urn', 1550, 40, 'gem'], ['crate', 2400, 30, 'drumstick'],
      ['barrel', 3000, 118, 'coin'], ['urn', 3600, 30, 'apple'], ['crate', 4150, 116, 'gem'], ['barrel', 4550, 40, 'coin'],
      ['crate', 5250, 70, 'drumstick'], ['urn', 5650, 120, 'gem'], ['barrel', 6080, 40, 'gem'],
    ],
    things: [
      { kind: 'gong', x: 1000, y: 8 }, { kind: 'boulder', x: 1400, y: 90 }, { kind: 'cage', x: 1750, y: 60 },
      { kind: 'gust', x: 1800, x1: 3600 }, { kind: 'ballista', x: 2350, y: 20 }, { kind: 'waystone', x: 2900, y: 30 },
      { kind: 'gong', x: 3500, y: 6 }, { kind: 'cage', x: 4300, y: 100 }, { kind: 'ballista', x: 4800, y: 20 },
      { kind: 'boulder', x: 4100, y: 50 }, { kind: 'waystone', x: 5400, y: 30 }, { kind: 'gong', x: 5900, y: 8 },
      { kind: 'chest', x: 2100, y: 130 }, { kind: 'chest', x: 3800, y: 14 }, { kind: 'chest', x: 5200, y: 130 },
      { kind: 'cloudbridge', x: 6090, y: 4, secret: 's3' },   // (all three gongs rung: a cloud bridge up to the Eyrie)
    ],
    boss: { kind: 'tempest', x: 6900, y: 75 },
    intro: 'before_storm',
  },

  // =========================================================================================== 4
  {
    id: 'throne', num: 4, name: 'THE EMBER THRONE', stage: './stages/throne.js', len: 7200, music: 'throne', bossMusic: 'finalboss',
    arenas: [
      { cam: 600, say: [['guard', 'The KING sees all.\nTurn back, children.'], ['hero', 'Tell the King\nwe said HI!']],
        waves: [
          [{ k: 'guard', side: 'R', y: 70 }, { k: 'kobold', side: 'L', y: 120, v: 'red', delay: 40 }, { k: 'kobold', side: 'R', y: 40, delay: 90 }],
          [{ k: 'kobold', side: 'R', y: 50, v: 'shaman' }, { k: 'kobold', side: 'L', y: 110, v: 'blue', delay: 30 }, { k: 'kobold', side: 'R', y: 100, v: 'red', delay: 90 }],
        ] },
      { cam: 1900,
        waves: [
          [{ k: 'kobold', side: 'R', y: 40, v: 'shaman' }, { k: 'guard', side: 'L', y: 100, delay: 40 }, { k: 'kobold', side: 'R', y: 120, v: 'red', delay: 90 }],
          [{ k: 'whelp', side: 'R', y: 60 }, { k: 'whelp', side: 'L', y: 110, delay: 30 }, { k: 'kobold', side: 'R', y: 90, v: 'shaman', delay: 90 }],
        ] },
      { cam: 3200, brute: true,
        waves: [
          [{ k: 'brute', side: 'R', y: 80, name: 'GOLDTOOTH' }, { k: 'brute', side: 'L', y: 40, v: 'magma', name: 'EMBERJAW', delay: 120 }],
          [{ k: 'kobold', side: 'R', y: 40, v: 'shaman' }, { k: 'guard', side: 'L', y: 120, delay: 30 }, { k: 'kobold', side: 'R', y: 100, v: 'bomber', delay: 90 }],
        ] },
      { cam: 4500,
        waves: [
          [{ k: 'guard', side: 'R', y: 50 }, { k: 'guard', side: 'L', y: 110, delay: 60 }, { k: 'kobold', side: 'R', y: 90, v: 'shaman', delay: 120 }],
          [{ k: 'wyvern', side: 'R', y: 60 }, { k: 'kobold', side: 'L', y: 30, v: 'red', delay: 40 }, { k: 'brute', side: 'R', y: 110, v: 'magma', name: 'SOOTSNOUT', delay: 100 }],
        ] },
      { cam: 6240, boss: 'dragonking' },
    ],
    patrols: [
      { x: 2200, spawns: [{ k: 'kobold', side: 'R', y: 60, v: 'red' }, { k: 'kobold', side: 'R', y: 110, v: 'shaman', delay: 40 }] },
      { x: 3550, spawns: [{ k: 'guard', side: 'R', y: 80 }] },
      { x: 4900, spawns: [{ k: 'kobold', side: 'R', y: 50, v: 'bomber' }, { k: 'whelp', side: 'R', y: 110, delay: 40 }] },
      { x: 6300, spawns: [{ k: 'kobold', side: 'R', y: 70, v: 'red' }, { k: 'kobold', side: 'R', y: 120, v: 'blue', delay: 30 }] },
    ],
    props: [
      ['crate', 400, 40, 'apple'], ['barrel', 1100, 115, 'coin'], ['urn', 1450, 40, 'gem'], ['crate', 2300, 30, 'drumstick'],
      ['barrel', 2900, 118, 'coin'], ['urn', 3500, 30, 'apple'], ['crate', 4050, 116, 'gem'], ['barrel', 4450, 40, 'coin'],
      ['crate', 5150, 70, 'drumstick'], ['urn', 5600, 120, 'pie'], ['barrel', 6050, 40, 'gem'],
    ],
    things: [
      { kind: 'chest', x: 950, y: 30 }, { kind: 'statue', x: 2040, y: 4 }, { kind: 'statue', x: 2440, y: 4 },
      { kind: 'cage', x: 2250, y: 100 }, { kind: 'waystone', x: 2700, y: 30 }, { kind: 'statue', x: 2840, y: 4 },
      { kind: 'chandelier', x: 3500, y: 75 }, { kind: 'chest', x: 3800, y: 120 }, { kind: 'chandelier', x: 4300, y: 75 },
      { kind: 'cage', x: 4800, y: 100 }, { kind: 'chandelier', x: 4750, y: 75 }, { kind: 'waystone', x: 5300, y: 30 }, { kind: 'chest', x: 5800, y: 40 },
    ],
    boss: { kind: 'dragonking', x: 6950, y: 70 },
    intro: 'before_throne', outro: 'finale',      // (the finale: main.js startFinale, docs/FINALE.md)
  },
];

// =========================================================================================== the secret stages
// (docs/SECRETS.md) reached through the hidden exits above, each looping back to its main stage just past the exit
// (returnTo: the main stage's index, the x to come back at, the arena to resume from), with its Star Shard (shard) after
// the mini-boss; the Queen's Hollow only after the finale with every shard and baby dragon.  Indexed after LEVELS
// (levelAt: 4..7), so the main stages' indices -- and every 'last stage' rule -- stay as they were.  The stage modules
// (src/stages/frozen.js ...) come from the stage builder; until one exists main.js draws a plain stand-in floor.
// Enemy variants frost / crystal / storm / curse: the painted recolours when they land; until then the base atlas with a
// colour wash (src/secrets.js TINTS).
export const DQ_SECRET_LEVELS = [
  {
    id: 'frozen', num: 'S1', secret: true, shard: 1, returnTo: { level: 0, x: 2620, arenaFrom: 2 },
    name: 'THE FROZEN HOLLOW', stage: './stages/frozen.js', len: 3600, music: 'stage', bossMusic: 'boss', standIn: ['#3b4a6a', '#9fc4e0', '#d8ecf8'],
    sections: [
      { id: 'frost', name: 'The Frost Hole', x0: 0, x1: 1000 },
      { id: 'icicles', name: 'The Icicle Gallery', x0: 1000, x1: 2300 },
      { id: 'falls', name: 'The Frozen Falls', x0: 2300, x1: 3600 },
    ],
    arenas: [
      { cam: 450, waves: [
        [{ k: 'kobold', v: 'frost', side: 'R', y: 50 }, { k: 'kobold', v: 'frost', side: 'R', y: 115, delay: 40 }, { k: 'kobold', v: 'frost', side: 'L', y: 80, delay: 100 }],
        [{ k: 'whelp', side: 'R', y: 70 }, { k: 'kobold', v: 'frost', side: 'L', y: 40, delay: 40 }, { k: 'kobold', v: 'frost', side: 'R', y: 120, delay: 80 }],
      ] },
      { cam: 1500, waves: [
        [{ k: 'kobold', v: 'frost', side: 'R', y: 40 }, { k: 'kobold', v: 'frost', side: 'L', y: 120, delay: 30 }, { k: 'kobold', v: 'blue', side: 'R', y: 90, delay: 80 }],
        [{ k: 'brute', v: 'frost', side: 'R', y: 80, name: 'ICEBACK' }, { k: 'kobold', v: 'frost', side: 'L', y: 50, delay: 90 }],
      ] },
      { cam: 2640, boss: 'chief' },
    ],
    patrols: [{ x: 1150, spawns: [{ k: 'kobold', v: 'frost', side: 'R', y: 60 }, { k: 'kobold', v: 'frost', side: 'R', y: 110, delay: 50 }] }],
    props: [['crate', 380, 40, 'apple'], ['barrel', 1050, 110, 'coin'], ['urn', 1980, 36, 'gem'], ['crate', 2260, 118, 'drumstick']],
    things: [{ kind: 'snowball', x: 760, y: 100 }, { kind: 'waystone', x: 1350, y: 30 }, { kind: 'snowball', x: 2050, y: 50 }, { kind: 'chest', x: 1700, y: 132 }],
    boss: { kind: 'chief', x: 3330, y: 80 },
  },
  {
    id: 'crystal', num: 'S2', secret: true, shard: 2, returnTo: { level: 1, x: 3090, arenaFrom: 2 },
    name: 'THE CRYSTAL DEEP', stage: './stages/crystal.js', len: 3600, music: 'mines', bossMusic: 'minesboss', standIn: ['#1c2a44', '#3fb8c8', '#8ff0e8'],
    sections: [
      { id: 'rails', name: 'The Runaway Rails', x0: 0, x1: 1200 },
      { id: 'glimmer', name: 'The Glimmer Caves', x0: 1200, x1: 2300 },
      { id: 'lake', name: 'The Glow Lake', x0: 2300, x1: 3600 },
    ],
    arenas: [
      { cam: 500, waves: [
        [{ k: 'kobold', v: 'crystal', side: 'R', y: 60 }, { k: 'kobold', v: 'crystal', side: 'L', y: 110, delay: 40 }, { k: 'salamander', side: 'R', y: 40, delay: 90 }],
        [{ k: 'kobold', v: 'miner', side: 'R', y: 90 }, { k: 'kobold', v: 'crystal', side: 'L', y: 40, delay: 50 }, { k: 'kobold', v: 'crystal', side: 'R', y: 120, delay: 100 }],
      ] },
      { cam: 1600, waves: [
        [{ k: 'salamander', side: 'L', y: 100 }, { k: 'kobold', v: 'crystal', side: 'R', y: 50, delay: 40 }, { k: 'kobold', v: 'bomber', side: 'R', y: 120, delay: 90 }],
        [{ k: 'brute', v: 'crystal', side: 'R', y: 80, name: 'SHARDBACK' }, { k: 'kobold', v: 'crystal', side: 'L', y: 60, delay: 80 }],
      ] },
      { cam: 2640, boss: 'magmaw' },
    ],
    patrols: [{ x: 1250, spawns: [{ k: 'kobold', v: 'crystal', side: 'R', y: 70 }, { k: 'salamander', side: 'R', y: 120, delay: 60 }] }],
    props: [['crate', 420, 40, 'apple'], ['barrel', 1150, 110, 'gem'], ['urn', 2050, 40, 'coin'], ['crate', 2420, 116, 'drumstick']],
    things: [{ kind: 'keg', x: 900, y: 80 }, { kind: 'waystone', x: 1420, y: 30 }, { kind: 'keg', x: 2200, y: 60 }, { kind: 'chest', x: 1800, y: 130 }],
    boss: { kind: 'magmaw', x: 3150, y: 110, crystal: true, pools: [[2930, 50], [3150, 110], [3380, 45]] },
  },
  {
    id: 'eyrie', num: 'S3', secret: true, shard: 3, returnTo: { level: 2, x: 6130, arenaFrom: 4 },
    name: 'THE EYRIE', stage: './stages/eyrie.js', len: 3600, music: 'storm', bossMusic: 'stormboss', standIn: ['#5a6aa8', '#c8d0f0', '#f4f2ff'],
    sections: [
      { id: 'steps', name: 'The Cloud Steps', x0: 0, x1: 1200 },
      { id: 'roost', name: 'The Feather Roost', x0: 1200, x1: 2400 },
      { id: 'nest', name: 'The Great Nest', x0: 2400, x1: 3600 },
    ],
    arenas: [
      { cam: 500, waves: [
        [{ k: 'whelp', v: 'storm', side: 'R', y: 60 }, { k: 'whelp', v: 'storm', side: 'L', y: 110, delay: 50 }, { k: 'kobold', v: 'storm', side: 'R', y: 90, delay: 90 }],
        [{ k: 'wyvern', side: 'R', y: 70 }, { k: 'kobold', v: 'storm', side: 'L', y: 40, delay: 40 }, { k: 'whelp', v: 'storm', side: 'R', y: 120, delay: 100 }],
      ] },
      { cam: 1600, waves: [
        [{ k: 'wyvern', side: 'L', y: 60 }, { k: 'wyvern', side: 'R', y: 110, delay: 60 }, { k: 'kobold', v: 'storm', side: 'R', y: 90, delay: 120 }],
        [{ k: 'whelp', v: 'storm', side: 'R', y: 40 }, { k: 'whelp', v: 'storm', side: 'L', y: 120, delay: 40 }, { k: 'brute', v: 'storm', side: 'R', y: 80, delay: 80, name: 'GALEBACK' }],
      ] },
      { cam: 2640, boss: 'alpha' },
    ],
    patrols: [{ x: 1250, spawns: [{ k: 'whelp', v: 'storm', side: 'R', y: 60 }, { k: 'kobold', v: 'storm', side: 'R', y: 110, delay: 60 }] }],
    props: [['crate', 420, 40, 'apple'], ['urn', 1100, 110, 'gem'], ['barrel', 2000, 40, 'coin'], ['crate', 2380, 116, 'drumstick']],
    things: [{ kind: 'waystone', x: 1420, y: 30 }, { kind: 'boulder', x: 2150, y: 80, look: 'bale' }, { kind: 'chest', x: 1900, y: 14 }],
    boss: { kind: 'alpha', x: 3300, y: 75 },
  },
  {
    id: 'hollow', num: 'S4', secret: true, shard: 0, final: true,
    name: "THE QUEEN'S HOLLOW", stage: './stages/hollow.js', len: 3200, music: 'throne', bossMusic: 'finalboss', standIn: ['#16202a', '#2f6a4a', '#8fe8a8'],
    sections: [
      { id: 'stair', name: 'The Dragon Stair', x0: 0, x1: 1100 },
      { id: 'banners', name: 'The Banner Hall', x0: 1100, x1: 2100 },
      { id: 'chamber', name: "The Queen's Chamber", x0: 2100, x1: 3200 },
    ],
    arenas: [
      { cam: 450, waves: [
        [{ k: 'kobold', v: 'curse', side: 'R', y: 50 }, { k: 'kobold', v: 'curse', side: 'L', y: 115, delay: 40 }, { k: 'kobold', v: 'curse', side: 'R', y: 85, delay: 100 }],
        [{ k: 'brute', v: 'curse', side: 'R', y: 80, name: 'GREENGUARD' }, { k: 'kobold', v: 'curse', side: 'L', y: 40, delay: 70 }],
      ] },
      { cam: 1350, waves: [
        [{ k: 'kobold', v: 'curse', side: 'R', y: 40 }, { k: 'kobold', v: 'curse', side: 'L', y: 120, delay: 30 }, { k: 'kobold', v: 'curse', side: 'R', y: 90, delay: 80 }],
        [{ k: 'brute', v: 'curse', side: 'L', y: 70, name: 'MOSSJAW' }, { k: 'brute', v: 'curse', side: 'R', y: 110, delay: 60, name: 'GLOOMFIST' }],
      ] },
      { cam: 2240, boss: 'wraith' },
    ],
    patrols: [],
    props: [['crate', 400, 40, 'apple'], ['urn', 1200, 110, 'gem'], ['barrel', 1900, 40, 'drumstick']],
    things: [{ kind: 'waystone', x: 1250, y: 30 }],
    boss: { kind: 'wraith', x: 2720, y: 75 },
  },
];
/** the quest's main stages, its secret ones after them (Dodongo's Quest: index 4..7), and the whole list (a stage by its
 * index) -- Dodongo's Quest's until src/quests.js setQuest says otherwise */
export let LEVELS = DQ_LEVELS;
export let SECRET_LEVELS = DQ_SECRET_LEVELS;
export let ALL_LEVELS = [...LEVELS, ...SECRET_LEVELS];
const BY_QUEST = { dq: [DQ_LEVELS, DQ_SECRET_LEVELS], mm: [MM_LEVELS, MM_SECRET_LEVELS], si: [SI_LEVELS, SI_SECRET_LEVELS] };
/** the quest's stages in place of the others (src/quests.js setQuest) */
export function useQuestLevels(q) {
  [LEVELS, SECRET_LEVELS] = BY_QUEST[q] || BY_QUEST.dq;
  ALL_LEVELS = [...LEVELS, ...SECRET_LEVELS];
}
/** every quest's stages, each quest's main ones then its secret ones (tools/memlevels.mjs: a row each) */
export const EVERY_LEVEL = Object.values(BY_QUEST).flatMap(([a, b]) => [...a, ...b]);
export const levelAt = (i) => ALL_LEVELS[i];
/** a secret stage's index by its id ('s1'..'s4', or the stage id: 'frozen' ...) */
export const secretIdx = (id) => {
  const k = /^s(\d)$/.exec(id || '');
  const i = k ? +k[1] - 1 : SECRET_LEVELS.findIndex((L) => L.id === id);
  return i >= 0 && i < SECRET_LEVELS.length ? LEVELS.length + i : -1;
};
