// MYSTIC MOUNTAIN (Shadow Stories, Book One -- docs/MYSTIC_MOUNTAIN.md): the five stages, by the comic's chapters, and
// the Dawn ride home after them (src/dawn.js).  The same shape as src/levels.js's (arenas, waves, patrols, props, things,
// boss); `mm: true` turns on the quest's own mechanics (src/mmworld.js: the living trees, the crumbling walls, the
// gusts, the narrow ledge's lane, LIGHT and the wolves that re-form; the bosses in src/mmbosses.js).
//   The stage modules (src/stages/mm*.js) come from the stage builder -- LEVEL_LEN, SECTIONS, PROP_INFO, HOOKS; the
//   arena cams and waystones here are its numbers.  Until a module is in, main.js draws a plain floor in L.standIn.
//   Story hooks (src/story.js CUTSCENES -- docs/MM_SCRIPT.md, the story agent's): intro / outro per stage (an array
//   plays in order; one that isn't written yet is skipped), `gate`: the boss gate's story (before the fight; the
//   fight's own intro is then the quick one) -- after `preGate` if that hasn't played yet (mm_wolves: it also plays
//   the first time a wolf re-forms, once a run), `mid`: the Morvath fight's transformation story.  After the summit's outro (mm_summit_end) the Dawn
//   ride (src/main.js startDawn), then mm_dawn, mm_epilogue and the end card (Book 3 next).
// Enemies (src/mmfoes.js, src/spawn.js):
//   wolf (shadow wolf: scatters on a normal KO and re-forms, unless the hit was LIGHT), bat (cliff bat, a swooping
//   flyer), snowman (rolls, throws snowballs, breaks into a puff), crow (storm crow, a diving flyer), knight (living
//   armour v sword|axe|halberd: knocked apart, it floats back together while the gem stands), imp v rock (the rock
//   imps: the kobold's kit in stone) | ice (the ice imps: quick hoppers with frost breath) | greenfire (green fire)
// Bosses (src/mmbosses.js): wolfpack (THE WOLF PACK: the smoke alpha), troll (THE STONE TROLL), icewyvern (THE ICE
// WYVERN), gem (THE RUBY GEM), morvath (MORVATH).

export const MM_LEVELS = [
  // =========================================================================================== 1  (Ch2, pages 8-15)
  {
    id: 'mmforest', num: 1, mm: true, name: 'THE SHADOW FOREST', stage: './stages/mmforest.js', len: 5200, music: 'mines', bossMusic: 'boss',
    standIn: ['#0b1430', '#2a3f6a', '#1c2a2e'],
    sections: [
      { id: 'edge', name: 'The Forest Edge', x0: 0, x1: 1300 },
      { id: 'woods', name: 'The Watching Woods', x0: 1300, x1: 2700 },
      { id: 'camp', name: 'The Campfire Clearing', x0: 2700, x1: 3900 },
      { id: 'den', name: 'The Wolf Den', x0: 3900, x1: 5200 },
    ],
    arenas: [
      { cam: 450, say: [['dod', 'Those wolves are made\nof SMOKE!'], ['ana', 'Then we need LIGHT.\nStay close to me!']],
        waves: [
          [{ k: 'wolf', side: 'R', y: 60 }, { k: 'wolf', side: 'R', y: 115, delay: 50 }],
          [{ k: 'wolf', side: 'L', y: 80 }, { k: 'wolf', side: 'R', y: 40, delay: 40 }, { k: 'wolf', side: 'R', y: 120, delay: 90 }],
        ] },
      { cam: 1650, say: [['dod', "Did that tree just...\nLOOK at me?"]],
        waves: [
          [{ k: 'wolf', side: 'R', y: 50 }, { k: 'wolf', side: 'L', y: 110, delay: 30 }, { k: 'wolf', side: 'R', y: 90, delay: 80 }],
          [{ k: 'wolf', side: 'R', y: 30 }, { k: 'wolf', side: 'L', y: 70, delay: 30 }, { k: 'wolf', side: 'R', y: 120, delay: 60 }],
        ] },
      { cam: 2900,
        waves: [
          [{ k: 'wolf', side: 'R', y: 40 }, { k: 'wolf', side: 'L', y: 120, delay: 30 }, { k: 'wolf', side: 'R', y: 80, delay: 70 }, { k: 'wolf', side: 'L', y: 60, delay: 120 }],
          [{ k: 'wolf', side: 'R', y: 60, v: 'big' }, { k: 'wolf', side: 'L', y: 110, delay: 60 }, { k: 'wolf', side: 'R', y: 120, delay: 120 }],
        ] },
      { cam: 4240, boss: 'wolfpack' },
    ],
    patrols: [
      { x: 1250, spawns: [{ k: 'wolf', side: 'R', y: 70 }] },
      { x: 2500, spawns: [{ k: 'wolf', side: 'R', y: 50 }, { k: 'wolf', side: 'R', y: 110, delay: 50 }] },
      { x: 3800, spawns: [{ k: 'wolf', side: 'R', y: 80 }, { k: 'wolf', side: 'R', y: 30, delay: 40 }] },
    ],
    props: [
      ['crate', 380, 34, 'apple'], ['barrel', 1100, 118, 'coin'], ['urn', 1480, 40, 'gem'], ['crate', 2250, 120, 'drumstick'],
      ['urn', 2640, 30, 'coin'], ['barrel', 3500, 116, 'gem'], ['crate', 3980, 36, 'apple'], ['urn', 4150, 120, 'drumstick'],
    ],
    things: [{ kind: 'waystone', x: 2350, y: 30 }],
    boss: { kind: 'wolfpack', x: 4900, y: 75 },
    intro: ['mm_prologue', 'mm_forest_intro'], preGate: 'mm_wolves', gate: 'mm_wolf_pack', outro: 'mm_forest_end',
  },

  // =========================================================================================== 2  (Ch3, pages 16-21)
  {
    id: 'mmbridge', num: 2, mm: true, name: 'THE TROLL BRIDGE', stage: './stages/mmbridge.js', len: 5600, music: 'stage', bossMusic: 'minesboss',
    standIn: ['#e2a860', '#f6d896', '#8a7c6a'],
    sections: [
      { id: 'path', name: 'The Mountain Path', x0: 0, x1: 1400 },
      { id: 'bridge', name: 'The Ancient Bridge', x0: 1400, x1: 2900 },
      { id: 'span', name: 'The Long Span', x0: 2900, x1: 4300 },
      { id: 'gap', name: "The Troll's Gap", x0: 4300, x1: 5600 },
    ],
    arenas: [
      { cam: 450, say: [['dod', 'Pebbles with LEGS?!'], ['ana', 'Rock imps! Mind the\nloose stones, everyone.']],
        waves: [
          [{ k: 'imp', v: 'rock', side: 'R', y: 50 }, { k: 'imp', v: 'rock', side: 'R', y: 115, delay: 40 }, { k: 'imp', v: 'rock', side: 'L', y: 80, delay: 110 }],
          [{ k: 'bat', side: 'R', y: 70 }, { k: 'imp', v: 'rock', side: 'L', y: 40, delay: 40 }, { k: 'imp', v: 'rock', side: 'R', y: 120, delay: 80 }],
        ] },
      { cam: 1800, say: [['dod', 'This bridge is OLD.\nWalk soft!']],
        waves: [
          [{ k: 'bat', side: 'R', y: 50 }, { k: 'bat', side: 'L', y: 110, delay: 50 }, { k: 'imp', v: 'rock', side: 'R', y: 90, delay: 90 }],
          [{ k: 'imp', v: 'rock', side: 'R', y: 30 }, { k: 'imp', v: 'rock', side: 'L', y: 120, delay: 30 }, { k: 'bat', side: 'R', y: 80, delay: 80 }],
        ] },
      { cam: 3200,
        waves: [
          [{ k: 'imp', v: 'rock', side: 'R', y: 40 }, { k: 'bat', side: 'L', y: 100, delay: 30 }, { k: 'imp', v: 'rock', side: 'R', y: 120, delay: 70 }, { k: 'bat', side: 'R', y: 60, delay: 120 }],
          [{ k: 'imp', v: 'rock', side: 'L', y: 70 }, { k: 'imp', v: 'rock', side: 'R', y: 30, delay: 30 }, { k: 'imp', v: 'rock', side: 'R', y: 110, delay: 60 }, { k: 'bat', side: 'L', y: 40, delay: 110 }],
        ] },
      { cam: 4640, boss: 'troll' },
    ],
    patrols: [
      { x: 1350, spawns: [{ k: 'imp', v: 'rock', side: 'R', y: 60 }] },
      { x: 2700, spawns: [{ k: 'bat', side: 'R', y: 80 }, { k: 'imp', v: 'rock', side: 'R', y: 110, delay: 40 }] },
      { x: 4200, spawns: [{ k: 'imp', v: 'rock', side: 'R', y: 50 }, { k: 'bat', side: 'R', y: 100, delay: 50 }] },
    ],
    props: [
      ['crate', 400, 40, 'apple'], ['barrel', 1150, 116, 'coin'], ['urn', 1550, 36, 'gem'], ['crate', 2300, 118, 'drumstick'],
      ['barrel', 2950, 40, 'coin'], ['urn', 3700, 120, 'gem'], ['crate', 4100, 36, 'apple'], ['barrel', 4450, 118, 'drumstick'],
    ],
    things: [{ kind: 'waystone', x: 2500, y: 30 }],
    boss: { kind: 'troll', x: 5300, y: 70 },
    intro: 'mm_bridge_intro', gate: 'mm_troll', outro: 'mm_bridge_end',
  },

  // =========================================================================================== 3  (Ch4, pages 22-27)
  {
    id: 'mmcliffs', num: 3, mm: true, name: 'THE ICY CLIFFS', stage: './stages/mmcliffs.js', len: 5200, music: 'storm', bossMusic: 'stormboss',
    standIn: ['#4a4a8a', '#aab8ea', '#e6eeff'],
    lane: [14, 100],                  // (the narrow ledge: the depth the heroes and the foes may use -- src/mmworld.js)
    sections: [
      { id: 'ledge', name: 'The Ice Ledge', x0: 0, x1: 1300 },
      { id: 'face', name: 'The Frozen Face', x0: 1300, x1: 2650 },
      { id: 'gale', name: 'The Howling Gale', x0: 2650, x1: 3900 },
      { id: 'perch', name: "The Wyvern's Perch", x0: 3900, x1: 5200 },
    ],
    arenas: [
      { cam: 450, say: [['dod', 'Snowmen. Angry\nsnowmen. Great.'], ['ana', "Keep off the edge,\nand don't look down!"]],
        waves: [
          [{ k: 'snowman', side: 'R', y: 50 }, { k: 'imp', v: 'ice', side: 'R', y: 90, delay: 50 }, { k: 'imp', v: 'ice', side: 'L', y: 30, delay: 110 }],
          [{ k: 'snowman', side: 'L', y: 80 }, { k: 'imp', v: 'ice', side: 'R', y: 40, delay: 40 }, { k: 'snowman', side: 'R', y: 90, delay: 90 }],
        ] },
      { cam: 1700,
        waves: [
          [{ k: 'imp', v: 'ice', side: 'R', y: 30 }, { k: 'imp', v: 'ice', side: 'L', y: 90, delay: 30 }, { k: 'snowman', side: 'R', y: 60, delay: 70 }],
          [{ k: 'snowman', side: 'R', y: 40 }, { k: 'snowman', side: 'L', y: 90, delay: 40 }, { k: 'imp', v: 'ice', side: 'R', y: 70, delay: 100 }],
        ] },
      { cam: 2950, say: [['dod', 'This wind wants us\nOFF this mountain!']],
        waves: [
          [{ k: 'imp', v: 'ice', side: 'R', y: 30 }, { k: 'snowman', side: 'L', y: 80, delay: 30 }, { k: 'imp', v: 'ice', side: 'R', y: 90, delay: 70 }, { k: 'imp', v: 'ice', side: 'L', y: 50, delay: 120 }],
          [{ k: 'snowman', side: 'R', y: 60, v: 'big' }, { k: 'imp', v: 'ice', side: 'L', y: 30, delay: 60 }, { k: 'snowman', side: 'R', y: 95, delay: 120 }],
        ] },
      { cam: 4240, boss: 'icewyvern' },
    ],
    patrols: [
      { x: 1300, spawns: [{ k: 'imp', v: 'ice', side: 'R', y: 60 }] },
      { x: 2600, spawns: [{ k: 'snowman', side: 'R', y: 50 }, { k: 'imp', v: 'ice', side: 'R', y: 90, delay: 50 }] },
      { x: 3850, spawns: [{ k: 'imp', v: 'ice', side: 'R', y: 40 }, { k: 'imp', v: 'ice', side: 'R', y: 90, delay: 40 }] },
    ],
    props: [
      ['crate', 420, 24, 'apple'], ['barrel', 1150, 92, 'coin'], ['urn', 1520, 26, 'gem'], ['crate', 2300, 92, 'drumstick'],
      ['urn', 2700, 24, 'coin'], ['barrel', 3500, 92, 'gem'], ['crate', 4000, 26, 'apple'], ['urn', 4150, 92, 'drumstick'],
    ],
    things: [{ kind: 'waystone', x: 2450, y: 40 }],
    boss: { kind: 'icewyvern', x: 4900, y: 60 },
    intro: 'mm_cliffs_intro', gate: 'mm_wyvern', outro: 'mm_cliffs_end',
  },

  // =========================================================================================== 4  (Ch5, pages 28-34)
  {
    id: 'mmhall', num: 4, mm: true, name: 'THE ARMORED HALL', stage: './stages/mmhall.js', len: 5600, music: 'throne', bossMusic: 'minesboss',
    standIn: ['#2a1418', '#6a2c22', '#4a3a3c'],
    sections: [
      { id: 'door', name: 'The Great Door', x0: 0, x1: 1300 },
      { id: 'hall', name: 'The Hall of Armor', x0: 1300, x1: 2900 },
      { id: 'stair', name: 'The Red Stair', x0: 2900, x1: 4300 },
      { id: 'study', name: "Morvath's Study", x0: 4300, x1: 5600 },
    ],
    arenas: [
      { cam: 450, say: [['dod', 'Empty armor...\nwith RED EYES.'], ['ana', 'Look -- strings!\nSomething is pulling them.']],
        waves: [
          [{ k: 'knight', v: 'sword', side: 'R', y: 60 }, { k: 'knight', v: 'sword', side: 'L', y: 110, delay: 60 }],
          [{ k: 'knight', v: 'axe', side: 'R', y: 40 }, { k: 'knight', v: 'sword', side: 'R', y: 120, delay: 50 }, { k: 'knight', v: 'sword', side: 'L', y: 80, delay: 110 }],
        ] },
      { cam: 1700,
        waves: [
          [{ k: 'knight', v: 'halberd', side: 'R', y: 60 }, { k: 'knight', v: 'sword', side: 'L', y: 100, delay: 40 }],   // (polish: two, not three)
          [{ k: 'knight', v: 'axe', side: 'L', y: 40 }, { k: 'knight', v: 'axe', side: 'R', y: 110, delay: 40 }, { k: 'knight', v: 'sword', side: 'R', y: 70, delay: 100 }],
        ] },
      { cam: 3150, say: [['dod', "They just keep getting\nback UP!"], ['ana', 'Then we find what\nholds the strings.']],
        waves: [
          [{ k: 'knight', v: 'sword', side: 'R', y: 40 }, { k: 'knight', v: 'halberd', side: 'L', y: 110, delay: 30 }],   // (polish: two, not three)
          [{ k: 'knight', v: 'halberd', side: 'R', y: 60 }, { k: 'knight', v: 'sword', side: 'L', y: 30, delay: 40 }, { k: 'knight', v: 'axe', side: 'L', y: 100, delay: 110 }],   // (polish: three, not four)
        ] },
      { cam: 4640, boss: 'gem' },
    ],
    patrols: [
      { x: 1350, spawns: [{ k: 'knight', v: 'sword', side: 'R', y: 70 }] },
      { x: 2850, spawns: [{ k: 'knight', v: 'axe', side: 'R', y: 50 }] },
      { x: 4300, spawns: [{ k: 'knight', v: 'sword', side: 'R', y: 90 }, { k: 'knight', v: 'sword', side: 'R', y: 40, delay: 50 }] },
    ],
    props: [
      ['crate', 380, 36, 'apple'], ['barrel', 1100, 118, 'coin'], ['urn', 1500, 34, 'gem'], ['crate', 2300, 120, 'drumstick'],
      ['urn', 2950, 36, 'coin'], ['barrel', 3650, 118, 'gem'], ['crate', 4100, 40, 'apple'], ['urn', 4450, 120, 'pie'],
    ],
    things: [{ kind: 'waystone', x: 2700, y: 30 }],
    boss: { kind: 'gem', x: 5120, y: 70 },
    intro: 'mm_hall_intro', gate: 'mm_gem_intro', outro: 'mm_gem_cut',
  },

  // =========================================================================================== 5  (Ch6, pages 35-43)
  {
    id: 'mmsummit', num: 5, mm: true, name: 'THE SUMMIT', stage: './stages/mmsummit.js', len: 5400, music: 'storm', bossMusic: 'finalboss',
    standIn: ['#16161c', '#2c3a2a', '#2a2a30'],
    sections: [
      { id: 'climb', name: 'The Last Climb', x0: 0, x1: 1400 },
      { id: 'plateau', name: 'The Black Plateau', x0: 1400, x1: 2800 },
      { id: 'ash', name: 'The Ash Fields', x0: 2800, x1: 4100 },
      { id: 'tower', name: 'The Obsidian Tower', x0: 4100, x1: 5400 },
    ],
    arenas: [
      { cam: 450, say: [['dod', "Green lightning.\nThat's never good."], ['ana', 'Crows! Heads down!']],
        waves: [
          [{ k: 'crow', side: 'R', y: 60 }, { k: 'imp', v: 'greenfire', side: 'R', y: 110, delay: 50 }, { k: 'crow', side: 'L', y: 90, delay: 110 }],
          [{ k: 'imp', v: 'greenfire', side: 'L', y: 40 }, { k: 'imp', v: 'greenfire', side: 'R', y: 120, delay: 40 }, { k: 'crow', side: 'R', y: 70, delay: 90 }],
        ] },
      { cam: 1750,
        waves: [
          [{ k: 'crow', side: 'R', y: 40 }, { k: 'crow', side: 'L', y: 110, delay: 40 }, { k: 'imp', v: 'greenfire', side: 'R', y: 80, delay: 80 }],
          [{ k: 'imp', v: 'greenfire', side: 'R', y: 30 }, { k: 'imp', v: 'greenfire', side: 'L', y: 120, delay: 30 }, { k: 'imp', v: 'greenfire', side: 'R', y: 90, delay: 80 }, { k: 'crow', side: 'L', y: 60, delay: 130 }],
        ] },
      { cam: 3100, say: [['dod', 'Almost there.\nStick together!']],
        waves: [
          [{ k: 'crow', side: 'R', y: 50 }, { k: 'imp', v: 'greenfire', side: 'L', y: 100, delay: 30 }, { k: 'crow', side: 'R', y: 120, delay: 70 }, { k: 'imp', v: 'greenfire', side: 'R', y: 60, delay: 120 }],
          [{ k: 'imp', v: 'greenfire', side: 'L', y: 40 }, { k: 'crow', side: 'R', y: 90, delay: 40 }, { k: 'imp', v: 'greenfire', side: 'R', y: 120, delay: 80 }, { k: 'crow', side: 'L', y: 70, delay: 120 }],
        ] },
      { cam: 4440, boss: 'morvath' },
    ],
    patrols: [
      { x: 1400, spawns: [{ k: 'crow', side: 'R', y: 70 }] },
      { x: 2750, spawns: [{ k: 'imp', v: 'greenfire', side: 'R', y: 50 }, { k: 'crow', side: 'R', y: 100, delay: 50 }] },
      { x: 4000, spawns: [{ k: 'imp', v: 'greenfire', side: 'R', y: 80 }, { k: 'imp', v: 'greenfire', side: 'R', y: 30, delay: 40 }] },
    ],
    props: [
      ['crate', 400, 36, 'apple'], ['barrel', 1150, 118, 'coin'], ['urn', 1550, 36, 'gem'], ['crate', 2350, 120, 'drumstick'],
      ['urn', 2950, 34, 'coin'], ['barrel', 3700, 118, 'gem'], ['crate', 4050, 36, 'drumstick'], ['urn', 4300, 120, 'pie'],
    ],
    things: [{ kind: 'waystone', x: 2600, y: 30 }],
    boss: { kind: 'morvath', x: 5150, y: 70 },
    // (the dragon form -- Morvath's last phase -- is the player's own character once Dodongo (or Shadow, without him)
    //  transforms: the 'form' tier, src/artplan.js -- raised with the heroes, or (all of them at 2x not fitting) right
    //  after them, always before Morvath's 2x; never pulling the heroes down to 1x with it (Dodongo and his dragon are
    //  never on screen together).  It was 'extra', stepped down first, which put the player's dragon at 1x beside a 2x
    //  Morvath (the coordinator, 2026-10-25).  Morvath's own packs are a boss's: to 1x before the heroes, to 0.75x only
    //  once the heroes are at 1x -- they were 'extra', which put him at 0.75x beside two 2x heroes (the model audit,
    //  2026-10-25).  src/artsets.js levelArt: not while someone plays the dragon -- then he's that player's hero)
    artTiers: { dodongo_dragon: 'form' },
    intro: 'mm_summit_intro', gate: 'mm_morvath', mid: 'mm_dragon', outro: 'mm_summit_end',
  },
];
/** (no secret stages in Book One) */
export const MM_SECRET_LEVELS = [];

/** the Dawn ride home (Ch7, pages 44-47: src/dawn.js on the sky-duel engine): its sky (the stage builder's
 * src/stages/mmvalley.js), the stories round it, and its music */
export const MM_DAWN = { id: 'mmvalley', name: 'THE DAWN RIDE', stage: './stages/mmvalley.js', music: 'title', standIn: ['#ffb27a', '#ffe0a8', '#7ab86a'], intro: [], outro: ['mm_dawn', 'mm_epilogue'] };
/** the story's backdrop ids (docs/MM_SCRIPT.md bg.lvl: drawn only if a plate fails) -> the stages */
export const MM_STORY_LVL = { mm_valley: 'mmvalley', mm_dawn: 'mmvalley', mm_forest: 'mmforest', mm_bridge: 'mmbridge', mm_cliffs: 'mmcliffs', mm_hall: 'mmhall', mm_summit: 'mmsummit' };
