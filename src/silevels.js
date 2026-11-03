// SKULL ISLAND (Shadow Stories, Book Two -- docs/SKULL_ISLAND.md): the quest's stages, by the comic's chapters.  The same
// shape as src/mmlevels.js (arenas, waves, patrols, props, things, boss); `si: true` turns on the quest's own rules
// (src/siworld.js: the swinging lanterns, the rolling barrels, Scarlet's swing-in; the foes in src/sifoes.js, the boss in
// src/sibosses.js).  PHASE 1 (the spine): stage 1 only -- "THE BLUE GULL" (Ch2).  Stages 2-4 (the Kraken, the island and
// its three caves, the Skull Palace) are phase 2 / 3: until they exist the quest's end card says "To be continued".
//   noScarlet: the hero select (and the picker) offers the trio only -- she joins in this stage's boss fight, as an AI
//   helper (1-3 players) or, with a free pad, in her own seat ("P4: SCARLET swings in! Press START")
//   guestHeroes: heroes whose packs the stage loads though nobody picked them (src/artsets.js levelArt)
// Enemies (src/sifoes.js): sailor v club | rope | net | bandana (Blunderbeard's crew: navy uniforms, five faces).
// Bosses (src/sibosses.js): blunderbeard (CAPTAIN BLUNDERBEARD).
// Story hooks (src/sistory.js, merged into src/story.js CUTSCENES): intro (an array plays in order), `midLetter`: a story
// once a hero passes x (Shadow's letter), `gate`: the boss's story, `outro`: after the fight.

export const SI_LEVELS = [
  // =========================================================================================== 1  (Ch2: the Blue Gull)
  {
    id: 'sibluegull', num: 1, si: true, noScarlet: true, guestHeroes: ['scarlet'],
    name: 'THE BLUE GULL', stage: './stages/sibluegull.js', len: 6200, music: 'sigull', bossMusic: 'siboss',
    standIn: ['#0e1a3a', '#32508a', '#6a4a30'],
    sections: [
      { id: 'cabin', name: 'The Lantern Cabin', x0: 0, x1: 1350 },
      { id: 'stairs', name: 'The Stairs Up', x0: 1350, x1: 2450 },
      { id: 'deck', name: 'The Night Deck', x0: 2450, x1: 4700 },
      { id: 'fog', name: 'The Dawn Fog', x0: 4700, x1: 6200 },
    ],
    arenas: [
      { cam: 450, say: [['dod', 'They just keep\ncoming!'], ['ana', 'Sailors! Watch for\nthe swinging lantern.']],
        waves: [
          [{ k: 'sailor', v: 'club', side: 'R', y: 60, face: 0 }, { k: 'sailor', v: 'club', side: 'R', y: 115, delay: 45, face: 1 }],
          [{ k: 'sailor', v: 'club', side: 'L', y: 85, face: 2 }, { k: 'sailor', v: 'club', side: 'R', y: 40, delay: 40, face: 3 }, { k: 'sailor', v: 'club', side: 'R', y: 120, delay: 95, face: 4 }],
        ] },
      { cam: 1600, say: [['dod', 'A LASSO?! Hey, I\nam not a calf!']],
        waves: [
          [{ k: 'sailor', v: 'rope', side: 'R', y: 70, face: 1 }, { k: 'sailor', v: 'club', side: 'L', y: 110, delay: 50, face: 0 }],
          [{ k: 'sailor', v: 'net', side: 'R', y: 90, face: 2 }, { k: 'sailor', v: 'club', side: 'L', y: 45, delay: 40, face: 3 }, { k: 'sailor', v: 'club', side: 'R', y: 120, delay: 90, face: 4 }],
        ] },
      { cam: 2950, say: [['ana', 'They are pushing us\nagainst the rail!'], ['dod', 'Quick! Does anyone\nhave a PLAN?!']],
        waves: [
          [{ k: 'sailor', v: 'bandana', side: 'L', y: 60, face: 2 }, { k: 'sailor', v: 'club', side: 'L', y: 115, delay: 35, face: 3 }, { k: 'sailor', v: 'bandana', side: 'L', y: 90, delay: 80, face: 0 }],
          [{ k: 'sailor', v: 'rope', side: 'L', y: 50, face: 4 }, { k: 'sailor', v: 'net', side: 'L', y: 100, delay: 40, face: 1 }, { k: 'sailor', v: 'bandana', side: 'L', y: 75, delay: 90, face: 2 }, { k: 'sailor', v: 'club', side: 'L', y: 125, delay: 130, face: 3 }],
        ] },
      // THE LEVIATHAN (the night deck's mini-boss, src/sileviathan.js): its coil in the sea beyond the rail, its head strikes onto the deck
      { cam: 3700,   // (its own intro times the lines: src/sileviathan.js 'rise')
        waves: [[{ k: 'leviathan', side: 'R', y: 78 }]] },
      { cam: 5240, boss: 'blunderbeard' },
    ],
    patrols: [
      { x: 1250, spawns: [{ k: 'sailor', v: 'club', side: 'R', y: 70, face: 0 }] },
      { x: 1950, spawns: [{ k: 'sailor', v: 'club', side: 'R', y: 85, face: 2 }, { k: 'sailor', v: 'bandana', side: 'R', y: 45, delay: 45, face: 0 }] },
      { x: 2350, spawns: [{ k: 'sailor', v: 'club', side: 'R', y: 60, face: 3 }, { k: 'sailor', v: 'bandana', side: 'R', y: 105, delay: 50, face: 4 }] },
      { x: 4720, spawns: [{ k: 'sailor', v: 'club', side: 'R', y: 80, face: 1 }, { k: 'sailor', v: 'rope', side: 'R', y: 40, delay: 40, face: 2 }] },   // (past the Leviathan's screen: never in its fight)
      { x: 5000, spawns: [{ k: 'sailor', v: 'bandana', side: 'R', y: 70, face: 3 }, { k: 'sailor', v: 'club', side: 'R', y: 110, delay: 50, face: 1 }] },
    ],
    props: [
      ['crate', 380, 34, 'apple'], ['barrel', 1050, 118, 'coin'], ['crate', 1500, 40, 'gem'], ['barrel', 2250, 120, 'drumstick'],
      ['crate', 2700, 36, 'coin'], ['barrel', 3500, 116, 'gem'], ['crate', 4850, 38, 'apple'], ['barrel', 5050, 120, 'drumstick'],
    ],
    things: [{ kind: 'waystone', x: 2500, y: 30 }, { kind: 'waystone', x: 4790, y: 30 }],   // (4790: past the Leviathan -- out of reach in its fight)
    doubloon: { x: 1180, y: 100 },   // (the island treasure, src/sisecrets.js: one hidden doubloon chest in each of the five stages before the palace)
    boss: { kind: 'blunderbeard', x: 5950, y: 92 },
    lanterns: [{ x: 760, y: 70 }, { x: 1130, y: 100 }],   // (the cabin's swinging lanterns: src/siworld.js Lantern; chains from the ceiling beam)
    barrels: { x0: 2500, x1: 3650 },                      // (the deck's rolling barrels roll while a hero is in this stretch)
    intro: ['si_prologue', 'si_gull_night'], midLetter: { x: 860, id: 'si_letter' }, gate: 'si_blunderbeard', outro: 'si_gull_end',
  },
  // =========================================================================================== 2  (Ch3: the Kraken)
  {
    id: 'sikraken', num: 2, si: true, toMap: true, storm: 0.7,   // (no 'launch': the reworked Kraken has no collar launch -- the story breaks the collar)
    name: 'THE KRAKEN', stage: './stages/sikraken.js', len: 4600, music: 'sikraken', bossMusic: 'sikrakenboss',
    standIn: ['#1a1838', '#4a3a66', '#5a4a44'],
    sections: [
      { id: 'gull', name: 'The Sinking Gull', x0: 0, x1: 1580 },
      { id: 'leap', name: 'The Leap', x0: 1580, x1: 1880 },
      { id: 'dawn', name: 'The Scarlet Dawn', x0: 1880, x1: 4600 },
    ],
    arenas: [
      { cam: 350, say: [['dod', 'The Gull is sinking!'], ['ana', 'And those are... crabs?']],
        waves: [
          [{ k: 'crab', side: 'R', y: 60 }, { k: 'crab', side: 'R', y: 112, delay: 40 }],
          [{ k: 'crab', side: 'L', y: 85 }, { k: 'crab', side: 'R', y: 45, delay: 35 }, { k: 'crab', side: 'R', y: 120, delay: 90 }],
        ] },
      { cam: 1000, say: [['ana', 'Watch the floor!\nSomething is under\nthe deck!']], tent: { kinds: ['slam'], every: [210, 290], max: 1 },
        waves: [
          [{ k: 'crab', side: 'R', y: 70 }, { k: 'collarimp', side: 'R', y: 100, delay: 60 }, { k: 'crab', side: 'L', y: 40, delay: 100 }],
          [{ k: 'crab', side: 'L', y: 90 }, { k: 'crab', side: 'R', y: 55, delay: 40 }, { k: 'collarimp', side: 'R', y: 85, delay: 90 }],
        ] },
      { cam: 2400, say: [['dod', 'Scarlet\'s ship!\n...with a tentacle on it!']], tent: { kinds: ['slam', 'sweep'], every: [200, 280], max: 1 },
        waves: [
          [{ k: 'collarimp', side: 'R', y: 60 }, { k: 'collarimp', side: 'L', y: 105, delay: 50 }, { k: 'crab', side: 'R', y: 85, delay: 90 }],
          [{ k: 'crab', side: 'L', y: 50 }, { k: 'crab', side: 'R', y: 100, delay: 40 }, { k: 'collarimp', side: 'R', y: 70, delay: 80 }, { k: 'crab', side: 'L', y: 120, delay: 120 }],
        ] },
      { cam: 3000, say: [['ana', 'There are more of them!\nKeep moving!']], tent: { kinds: ['slam', 'sweep', 'grab'], every: [190, 260], max: 1 },
        waves: [
          [{ k: 'collarimp', side: 'L', y: 60 }, { k: 'crab', side: 'R', y: 90, delay: 40 }, { k: 'crab', side: 'R', y: 45, delay: 80 }],
          [{ k: 'collarimp', side: 'R', y: 100 }, { k: 'collarimp', side: 'L', y: 55, delay: 45 }, { k: 'crab', side: 'L', y: 120, delay: 85 }, { k: 'crab', side: 'R', y: 75, delay: 130 }],
        ] },
      { cam: 3640, boss: 'kraken' },
    ],
    patrols: [
      { x: 700, spawns: [{ k: 'crab', side: 'R', y: 80 }] },
      { x: 1350, spawns: [{ k: 'crab', side: 'R', y: 60 }, { k: 'crab', side: 'R', y: 110, delay: 40 }] },
      { x: 2150, spawns: [{ k: 'crab', side: 'R', y: 70 }, { k: 'collarimp', side: 'R', y: 100, delay: 50 }] },
      { x: 2750, spawns: [{ k: 'crab', side: 'R', y: 90 }, { k: 'crab', side: 'R', y: 50, delay: 45 }] },
    ],
    props: [
      ['crate', 300, 36, 'apple'], ['barrel', 860, 118, 'coin'], ['crate', 1400, 40, 'drumstick'], ['barrel', 2050, 118, 'apple'],
      ['crate', 2650, 36, 'coin'], ['barrel', 3250, 118, 'gem'], ['crate', 3450, 40, 'drumstick'],
    ],
    things: [{ kind: 'waystone', x: 2100, y: 30 }],
    doubloon: { x: 3560, y: 18 },
    boss: { kind: 'kraken', x: 4120, y: 36 },
    artTiers: { kraken_head: 'enemy' },   // (QA A10: the head's 2x tier is the storm ride's -- 110 MB can never fit here at DPR 2; held at 1x as before, the other packs' rungs untouched)
    leap: { x: 1500, wallX: 1546, minX: 1912, toX: 1990, after: 2 },   // (src/siworld.js stepLeap: the scripted jump to the Scarlet Dawn)
    intro: ['si_kraken_a'], gate: 'si_kraken_gate', outro: 'si_kraken_end',
  },
  // =========================================================================================== 3a  (Ch5: the Cave of Rage)
  {
    id: 'sicave', num: '3A', si: true, calm: true, wedge: 'cave',
    name: 'THE CAVE OF RAGE', stage: './stages/sicave.js', len: 5400, music: 'sicave', bossMusic: 'sirageboss',
    standIn: ['#241418', '#5a2a22', '#3a2c32'],
    sections: [
      { id: 'mouth', name: 'The Mouth', x0: 0, x1: 1400 },
      { id: 'cavern', name: 'The Lava Cavern', x0: 1400, x1: 3800 },
      { id: 'bridge', name: 'The Rope Bridge', x0: 3800, x1: 5400 },
    ],
    arenas: [
      { cam: 450, say: [['dod', 'Fire wolves!'], ['ana', 'Look how they GLOW...']],
        waves: [
          [{ k: 'ragebeast', side: 'R', y: 60 }, { k: 'ragebeast', side: 'R', y: 112, delay: 70 }],
          [{ k: 'ragebeast', side: 'L', y: 85 }, { k: 'ragebeast', side: 'R', y: 45, delay: 60 }, { k: 'ragebeast', side: 'R', y: 120, delay: 130 }],
        ] },
      { cam: 1500, say: [['ana', 'Lava! Watch the floor!']], tent: { kinds: ['spout'], every: [200, 280], max: 1 },
        waves: [
          [{ k: 'ragebeast', side: 'R', y: 70 }, { k: 'ragebeast', side: 'L', y: 105, delay: 60 }],
          [{ k: 'ragebeast', side: 'L', y: 55 }, { k: 'ragebeast', side: 'R', y: 100, delay: 50 }, { k: 'ragebeast', side: 'R', y: 75, delay: 120 }],
        ] },
      { cam: 2500, say: [['dod', 'There are SO many\nof them!']], tent: { kinds: ['spout'], every: [170, 250], max: 1 },
        waves: [
          [{ k: 'ragebeast', side: 'L', y: 60 }, { k: 'ragebeast', side: 'R', y: 90, delay: 50 }, { k: 'ragebeast', side: 'R', y: 45, delay: 100 }],
          [{ k: 'ragebeast', side: 'R', y: 110 }, { k: 'ragebeast', side: 'L', y: 55, delay: 45 }, { k: 'ragebeast', side: 'L', y: 120, delay: 90 }, { k: 'ragebeast', side: 'R', y: 75, delay: 140 }],
        ] },
      { cam: 3400, say: [['ana', 'The bridge is just\nahead. Stay CALM.']], tent: { kinds: ['spout'], every: [170, 240], max: 1 },
        waves: [
          [{ k: 'ragebeast', side: 'R', y: 60 }, { k: 'ragebeast', side: 'R', y: 105, delay: 50 }, { k: 'ragebeast', side: 'L', y: 85, delay: 100 }],
          [{ k: 'ragebeast', side: 'L', y: 50 }, { k: 'ragebeast', side: 'R', y: 115, delay: 40 }, { k: 'ragebeast', side: 'L', y: 100, delay: 90 }, { k: 'ragebeast', side: 'R', y: 70, delay: 130 }],
        ] },
      { cam: 4440, boss: 'ragealpha' },
    ],
    patrols: [
      { x: 800, spawns: [{ k: 'ragebeast', side: 'R', y: 80 }] },
      { x: 1950, spawns: [{ k: 'ragebeast', side: 'R', y: 60 }, { k: 'ragebeast', side: 'R', y: 110, delay: 70 }] },
      { x: 2950, spawns: [{ k: 'ragebeast', side: 'R', y: 90 }, { k: 'ragebeast', side: 'R', y: 50, delay: 70 }] },
    ],
    props: [
      ['boulder', 380, 36, 'apple'], ['rocks', 1050, 118, 'coin'], ['boulder', 1700, 40, 'drumstick'], ['rocks', 2250, 118, 'apple'],
      ['shards', 2800, 36, 'coin'], ['rocks', 3250, 118, 'gem'], ['shards', 3600, 40, 'drumstick'],
    ],
    things: [{ kind: 'waystone', x: 1600, y: 30 }],
    doubloon: { x: 3050, y: 100 },
    boss: { kind: 'ragealpha', x: 4950, y: 80 },
    intro: ['si_cave_a'], gate: 'si_cave_gate', outro: 'si_cave_end',
  },
  // =========================================================================================== 3b  (Ch6: the Swamp of Despair)
  {
    id: 'siswamp', num: '3B', si: true, swamp: true, water: true, wedge: 'swamp',
    name: 'THE SWAMP OF DESPAIR', stage: './stages/siswamp.js', len: 5400, music: 'siswamp', bossMusic: 'sielderboss',
    standIn: ['#12181c', '#2a4038', '#34301f'],
    sections: [
      { id: 'bog', name: 'The Black Bog', x0: 0, x1: 1500 },
      { id: 'gloom', name: 'The Gloom', x0: 1500, x1: 3600 },
      { id: 'elder', name: "The Elder's Clearing", x0: 3600, x1: 5400 },
    ],
    arenas: [
      { cam: 450, say: [['dod', 'Is that tree...\nLOOKING at us?'], ['ana', 'Normal hits only make it\ngrumpy. FIRE makes it RUN!']],
        waves: [
          [{ k: 'swamptree', side: 'R', y: 70 }],
          [{ k: 'swamptree', side: 'R', y: 45 }, { k: 'sapling', side: 'L', y: 100, delay: 70 }],
        ] },
      { cam: 1500, mist: { every: [420, 560], max: 1 }, say: [['ana', 'That little cloud...\nit makes me feel so SAD.']],
        waves: [
          [{ k: 'swamptree', side: 'R', y: 60 }, { k: 'sapling', side: 'R', y: 110, delay: 60 }],
          [{ k: 'swamptree', side: 'L', y: 80 }, { k: 'swamptree', side: 'R', y: 45, delay: 80 }, { k: 'sapling', side: 'R', y: 120, delay: 130 }],
        ] },
      { cam: 2500, mist: { every: [380, 520], max: 1 }, tent: { kinds: ['slam'], root: true, every: [260, 340], max: 1 }, say: [['dod', 'These trees are SO\ngrumpy.']],
        waves: [
          [{ k: 'swamptree', side: 'L', y: 60 }, { k: 'sapling', side: 'R', y: 90, delay: 50 }, { k: 'sapling', side: 'R', y: 45, delay: 100 }],
          [{ k: 'swamptree', side: 'R', y: 110 }, { k: 'swamptree', side: 'L', y: 55, delay: 70 }, { k: 'sapling', side: 'R', y: 75, delay: 140 }],
        ] },
      { cam: 3400, mist: { every: [340, 480], max: 2 }, tent: { kinds: ['slam', 'sweep', 'grab'], root: true, every: [220, 300], max: 1 }, say: [['ana', 'The Elder is close.\nStay TOGETHER.']],
        waves: [
          [{ k: 'swamptree', side: 'R', y: 60 }, { k: 'swamptree', side: 'L', y: 105, delay: 60 }, { k: 'sapling', side: 'R', y: 85, delay: 120 }],
          [{ k: 'swamptree', side: 'L', y: 50 }, { k: 'swamptree', side: 'R', y: 115, delay: 50 }, { k: 'sapling', side: 'L', y: 90, delay: 100 }, { k: 'sapling', side: 'R', y: 65, delay: 150 }],
        ] },
      { cam: 4440, boss: 'elder' },
    ],
    patrols: [
      { x: 800, spawns: [{ k: 'swamptree', side: 'R', y: 80 }] },
      { x: 1950, spawns: [{ k: 'swamptree', side: 'R', y: 60 }, { k: 'sapling', side: 'R', y: 110, delay: 70 }] },
      { x: 2950, spawns: [{ k: 'swamptree', side: 'R', y: 90 }, { k: 'sapling', side: 'R', y: 50, delay: 70 }] },
    ],
    props: [
      ['log', 380, 36, 'apple'], ['pod', 1050, 118, 'coin'], ['toadstool', 1700, 40, 'drumstick'], ['log', 2250, 118, 'apple'],
      ['pod', 2800, 36, 'coin'], ['toadstool', 3250, 118, 'gem'], ['pod', 3650, 40, 'drumstick'],
    ],
    torches: [{ x: 330, y: 70 }, { x: 600, y: 74 }, { x: 1320, y: 70 }, { x: 1640, y: 74 }, { x: 2360, y: 70 }, { x: 2640, y: 74 }, { x: 3380, y: 70 }, { x: 3600, y: 74 }, { x: 4320, y: 70 }, { x: 4580, y: 74 }],
    things: [{ kind: 'waystone', x: 1700, y: 30 }],
    doubloon: { x: 2950, y: 100 },
    boss: { kind: 'elder', x: 5060, y: 12 },
    intro: ['si_swamp_a'], gate: 'si_swamp_gate', outro: 'si_swamp_end',
  },
  // =========================================================================================== 3c  (Ch7: the Cell of Sloth)
  {
    id: 'sicell', num: '3C', si: true, cell: true, wedge: 'cell',
    artTiers: { sloth_slime: 'extra' },   // (QA A10: the little slimes' 2x pack -- stepped down first where the scene needs the room)
    name: 'THE CELL OF SLOTH', stage: './stages/sicell.js', len: 5400, music: 'sicell', bossMusic: 'sislothboss',
    standIn: ['#10181a', '#3a4844', '#26302e'],
    sections: [
      { id: 'corridor', name: 'The Barred Corridor', x0: 0, x1: 1700 },
      { id: 'hall', name: 'The Fog Hall', x0: 1700, x1: 3800 },
      { id: 'pit', name: 'The Sloth Pit', x0: 3800, x1: 5400 },
    ],
    arenas: [
      { cam: 450, say: [['ana', 'A prison... so quiet.\nI feel so sleepy.'], ['dod', 'Do not stand still!\nKeep MOVING!']],
        waves: [
          [{ k: 'slime', side: 'R', y: 70 }],
          [{ k: 'slime', side: 'R', y: 45 }, { k: 'slime', side: 'L', y: 100, delay: 70 }],
        ] },
      { cam: 1500, say: [['dod', 'Eww. Everything is\nSTICKY.']],
        waves: [
          [{ k: 'slime', side: 'R', y: 60 }, { k: 'slime', side: 'L', y: 105, delay: 60 }],
          [{ k: 'slime', side: 'L', y: 55 }, { k: 'slime', side: 'R', y: 100, delay: 50 }, { k: 'slime', side: 'R', y: 75, delay: 120 }],
        ] },
      { cam: 2500, say: [['ana', 'The fog is thicker here.\nDo not stop!']],
        waves: [
          [{ k: 'slime', side: 'L', y: 60 }, { k: 'slime', side: 'R', y: 90, delay: 50 }, { k: 'slime', side: 'R', y: 45, delay: 100 }],
          [{ k: 'slime', side: 'R', y: 110 }, { k: 'slime', side: 'L', y: 55, delay: 45 }, { k: 'slime', side: 'L', y: 120, delay: 90 }, { k: 'slime', side: 'R', y: 75, delay: 140 }],
        ] },
      { cam: 3400, say: [['dod', 'That drain is GLUGGING.\nStay close, everybody.']],
        waves: [
          [{ k: 'slime', side: 'R', y: 60 }, { k: 'slime', side: 'R', y: 105, delay: 50 }, { k: 'slime', side: 'L', y: 85, delay: 100 }],
          [{ k: 'slime', side: 'L', y: 50 }, { k: 'slime', side: 'R', y: 115, delay: 40 }, { k: 'slime', side: 'L', y: 100, delay: 90 }, { k: 'slime', side: 'R', y: 70, delay: 130 }],
        ] },
      { cam: 4440, boss: 'slothbeast' },
    ],
    patrols: [
      { x: 800, spawns: [{ k: 'slime', side: 'R', y: 80 }] },
      { x: 1950, spawns: [{ k: 'slime', side: 'R', y: 60 }, { k: 'slime', side: 'R', y: 110, delay: 70 }] },
      { x: 2950, spawns: [{ k: 'slime', side: 'R', y: 90 }, { k: 'slime', side: 'R', y: 50, delay: 70 }] },
    ],
    props: [
      ['jar', 380, 36, 'apple'], ['bucket', 1050, 118, 'coin'], ['pillow', 1700, 40, 'drumstick'], ['jar', 2250, 118, 'apple'],
      ['pillow', 2800, 36, 'coin'], ['bucket', 3250, 118, 'gem'], ['jar', 3650, 40, 'drumstick'],
    ],
    things: [{ kind: 'waystone', x: 1700, y: 30 }],
    doubloon: { x: 2350, y: 16 },
    boss: { kind: 'slothbeast', x: 4900, y: 66 },
    intro: ['si_cell_a'], gate: 'si_cell_gate', outro: 'si_cell_end',
  },
  // =========================================================================================== 4  (Ch8: the Skull Palace)
  {
    id: 'sipalace', num: 4, si: true, palace: true, guestHeroes: ['scarlet'],   // (Scarlet's finisher: her pack is in even when nobody plays her)
    artTiers: { sad_cloud: 'extra', fear_shade: 'extra' },   // (QA A10: the feelings' 2x packs -- stepped down first where the scene needs the room)
    name: 'THE SKULL PALACE', stage: './stages/sipalace.js', len: 5400, music: 'sipalace', bossMusic: 'simalachar',
    standIn: ['#1a0a2a', '#4a1a6a', '#2a1a3a'],
    sections: [
      { id: 'gate', name: 'The Skull Gate', x0: 0, x1: 1900 },
      { id: 'corridor', name: 'The Purple Corridor', x0: 1900, x1: 3800 },
      { id: 'hall', name: 'The Throne Hall', x0: 3800, x1: 5400 },
    ],
    arenas: [
      { cam: 450, say: [['dod', 'Palace guards!'], ['ana', 'Masks... and no faces.\nStay together.']],
        waves: [
          [{ k: 'sailor', v: 'bandana', side: 'R', y: 60, face: 0 }, { k: 'sailor', v: 'bandana', side: 'R', y: 112, delay: 50, face: 2 }, { k: 'collarimp', side: 'R', y: 85, delay: 100 }],
          [{ k: 'sailor', v: 'club', side: 'L', y: 85, face: 3 }, { k: 'sailor', v: 'bandana', side: 'R', y: 45, delay: 40, face: 1 }, { k: 'collarimp', side: 'R', y: 120, delay: 90 }, { k: 'collarimp', side: 'L', y: 60, delay: 130 }],
        ] },
      { cam: 880, say: [['ana', 'The gate! The Sun Key\nmust go in that round SUN.']],
        waves: [
          [{ k: 'sailor', v: 'bandana', side: 'R', y: 70, face: 4 }, { k: 'collarimp', side: 'L', y: 105, delay: 50 }, { k: 'sailor', v: 'club', side: 'R', y: 45, delay: 90, face: 0 }],
          [{ k: 'sailor', v: 'rope', side: 'R', y: 60, face: 2 }, { k: 'sailor', v: 'bandana', side: 'L', y: 100, delay: 45, face: 1 }, { k: 'collarimp', side: 'R', y: 85, delay: 90 }, { k: 'collarimp', side: 'R', y: 120, delay: 130 }],
        ] },
      { cam: 2250, say: [['dod', 'A purple CARPET.\nVery fancy.']],
        waves: [
          [{ k: 'collarimp', side: 'R', y: 60 }, { k: 'collarimp', side: 'L', y: 105, delay: 45 }, { k: 'sailor', v: 'bandana', side: 'R', y: 85, delay: 90, face: 3 }],
          [{ k: 'sailor', v: 'net', side: 'R', y: 50, face: 2 }, { k: 'sailor', v: 'bandana', side: 'L', y: 100, delay: 45, face: 0 }, { k: 'sailor', v: 'club', side: 'R', y: 120, delay: 90, face: 4 }, { k: 'collarimp', side: 'R', y: 75, delay: 130 }],
        ] },
      { cam: 3200, say: [['ana', 'The throne hall is\njust ahead.']],
        waves: [
          [{ k: 'sailor', v: 'bandana', side: 'R', y: 60, face: 1 }, { k: 'sailor', v: 'bandana', side: 'R', y: 105, delay: 45, face: 4 }, { k: 'collarimp', side: 'L', y: 85, delay: 90 }],
          [{ k: 'sailor', v: 'rope', side: 'L', y: 50, face: 3 }, { k: 'sailor', v: 'net', side: 'R', y: 115, delay: 40, face: 0 }, { k: 'collarimp', side: 'L', y: 100, delay: 90 }, { k: 'collarimp', side: 'R', y: 70, delay: 130 }],
        ] },
      { cam: 4440, boss: 'malachar' },
    ],
    patrols: [
      { x: 700, spawns: [{ k: 'sailor', v: 'bandana', side: 'R', y: 80, face: 2 }] },
      { x: 2600, spawns: [{ k: 'collarimp', side: 'R', y: 60 }, { k: 'sailor', v: 'bandana', side: 'R', y: 110, delay: 50, face: 1 }] },
      { x: 2900, spawns: [{ k: 'sailor', v: 'club', side: 'R', y: 90, face: 3 }, { k: 'collarimp', side: 'R', y: 50, delay: 70 }] },
    ],
    props: [
      ['crate', 330, 36, 'apple'], ['vase', 880, 118, 'coin'], ['candle', 2450, 40, 'drumstick'], ['vase', 2750, 118, 'apple'],
      ['crate', 3000, 36, 'coin'], ['candle', 3500, 118, 'gem'], ['vase', 3650, 40, 'drumstick'],
    ],
    things: [{ kind: 'waystone', x: 2150, y: 30 }],
    boss: { kind: 'malachar', x: 5120, y: 84 },
    door: { x: 1370, wallX: 1450, after: 2, id: 'si_palace_door' },   // (src/siworld.js stepDoor: the Sun Key into the door's sun slot; nobody passes it before)
    intro: ['si_campfire'], gate: 'si_palace_gate', outro: ['si_palace_end', 'si_epilogue'],
  },
];
/** the secrets' stages (src/sisecrets.js): THE TREASURE ROOM -- a rematch with Captain Blunderbeard on the Gull's wreck (the Kraken stage's first section, a calm dusk), opened by finding
 * the five hidden doubloons.  `bonus: true`: no portal back -- from the island map's gold chest or the level select; it ends on the title (src/main.js afterClear) */
export const SI_SECRET_LEVELS = [
  {
    id: 'sitreasure', num: 'T', si: true, bonus: true, storm: 0.1,
    name: 'THE TREASURE ROOM', stage: './stages/sikraken.js', len: 1580, music: 'sigull', bossMusic: 'siboss',
    standIn: ['#2a2a50', '#8a5a6a', '#5a4a44'],
    sections: [{ id: 'wreck', name: "The Gull's Wreck", x0: 0, x1: 1580 }],
    arenas: [
      { cam: 140, say: [['dod', 'The old Blue Gull!\nHer treasure is all\nover the deck!'], ['ana', 'And the crew came back\nto guard it...']],
        waves: [
          [{ k: 'sailor', v: 'club', side: 'R', y: 60, face: 0 }, { k: 'sailor', v: 'bandana', side: 'R', y: 115, delay: 45, face: 3 }, { k: 'sailor', v: 'rope', side: 'L', y: 85, delay: 90, face: 2 }],
          [{ k: 'sailor', v: 'net', side: 'R', y: 90, face: 1 }, { k: 'sailor', v: 'club', side: 'L', y: 45, delay: 40, face: 4 }, { k: 'sailor', v: 'bandana', side: 'R', y: 125, delay: 90, face: 0 }],
        ] },
      { cam: 620, boss: 'blunderbeard_rematch' },
    ],
    patrols: [],
    props: [['crate', 380, 36, 'apple'], ['barrel', 720, 118, 'coin'], ['crate', 980, 40, 'gem'], ['barrel', 1130, 120, 'drumstick'], ['crate', 1420, 36, 'coin']],
    things: [],   // (a bonus: no waystone -- nothing is saved)
    hoards: [{ x: 260, y: 14 }, { x: 700, y: 16 }, { x: 900, y: 14 }, { x: 1160, y: 16 }, { x: 1480, y: 14 }],   // (the five doubloons' chests, open and full along the rail: src/sisecrets.js)
    boss: { kind: 'blunderbeard_rematch', x: 1250, y: 92 },
    intro: [],
  },
];

/** the backdrops the cutscenes draw that are not a stage of the list (src/main.js playStory loads them like Book One's Dawn
 * valley): the harbor town at sunset (the prologue) -- src/stages/siharbor.js */
export const SI_HARBOR = { id: 'siharbor', name: 'THE HARBOR', stage: './stages/siharbor.js', standIn: ['#f2a65e', '#ffd9a0', '#7a5a3a'] };
/** the story's backdrop ids -> the stages (a plate that fails to load draws the stage instead) */
export const SI_STORY_LVL = { si_harbor: 'siharbor', si_gull: 'sibluegull', si_kraken: 'sikraken' };
