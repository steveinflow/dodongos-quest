// Stage 1, THE DRAGON ROAD: where the fights happen, what breaks open, who says what.
// Arena `cam` = the camera's left edge while the screen is locked (see config.ARENAS).
import { ARENAS, STAGE_LEN, W } from './config.js';

// spawn: { k: kind, side: 'L' | 'R', y: depth, v: variant, delay: frames after the wave starts, name }
export const ARENA_DEFS = [
  {
    cam: ARENAS[0],
    say: [['kob', 'HALT! The Dragon King says\nNO VISITORS!'], ['dod', "I'm not a visitor.\nI'm a HERO!"]],
    waves: [
      [{ k: 'kobold', side: 'R', y: 50 }, { k: 'kobold', side: 'R', y: 115, delay: 40 }, { k: 'kobold', side: 'L', y: 80, delay: 110 }],
      [{ k: 'kobold', side: 'R', y: 70 }, { k: 'kobold', side: 'L', y: 30, delay: 30, v: 'blue' }, { k: 'kobold', side: 'R', y: 125, delay: 90 }],
    ],
  },
  {
    cam: ARENAS[1],
    say: [['dod', 'A baby dragon... in a COLLAR?!\nJust like the kraken!'], ['dod', "Hold still, little guy!\nI'll knock that thing off!"]],
    waves: [
      [{ k: 'whelp', side: 'R', y: 70 }, { k: 'kobold', side: 'L', y: 40, delay: 30 }, { k: 'kobold', side: 'R', y: 120, delay: 60 }],
      [{ k: 'whelp', side: 'L', y: 110 }, { k: 'whelp', side: 'R', y: 40, delay: 50 }, { k: 'kobold', side: 'R', y: 80, delay: 120, v: 'blue' }],
    ],
  },
  {
    cam: ARENAS[2],
    brute: true,
    waves: [
      [{ k: 'brute', side: 'R', y: 80, name: 'BIG GRONK' }, { k: 'kobold', side: 'L', y: 40, delay: 90 }],
      [{ k: 'kobold', side: 'R', y: 40, v: 'blue' }, { k: 'kobold', side: 'L', y: 120, v: 'blue', delay: 30 }, { k: 'kobold', side: 'R', y: 90, v: 'red', delay: 80 }],
    ],
  },
  {
    cam: ARENAS[3],
    waves: [
      [{ k: 'whelp', side: 'R', y: 40 }, { k: 'whelp', side: 'L', y: 110, delay: 40 }, { k: 'kobold', side: 'R', y: 120, delay: 70 }, { k: 'kobold', side: 'L', y: 60, delay: 120 }],
      [{ k: 'brute', side: 'R', y: 70, name: 'LUMPJAW' }, { k: 'kobold', side: 'L', y: 30, v: 'blue', delay: 60 }, { k: 'whelp', side: 'R', y: 120, delay: 140 }],
    ],
  },
  { cam: ARENAS[4], boss: true, waves: [] },
];

// enemies met on the road between the locked fights (they walk in; the camera keeps going)
export const PATROLS = [
  { x: 2210, spawns: [{ k: 'kobold', side: 'R', y: 60 }, { k: 'kobold', side: 'R', y: 120, delay: 50 }] },
  { x: 3485, spawns: [{ k: 'whelp', side: 'R', y: 80 }] },
  { x: 4660, spawns: [{ k: 'kobold', side: 'R', y: 40, v: 'blue' }, { k: 'kobold', side: 'R', y: 110, delay: 40 }] },
  { x: 5805, spawns: [{ k: 'kobold', side: 'R', y: 80, v: 'red' }, { k: 'whelp', side: 'R', y: 40, delay: 60 }] },
];

// breakables: [kind, x, depth y, drop]
export const PROPS = [
  ['crate', 430, 30, 'apple'],
  ['barrel', 1080, 118, 'coin'],
  ['crate', 1420, 46, 'gem'],
  ['urn', 2260, 26, 'apple'],
  ['crate', 2580, 120, 'coin'],
  ['barrel', 3080, 40, 'drumstick'],
  ['crate', 3560, 118, 'gem'],
  ['urn', 3720, 30, 'coin'],
  ['barrel', 4120, 70, 'apple'],
  ['crate', 4720, 36, 'drumstick'],
  ['urn', 4950, 122, 'oneup'],
  ['barrel', 5250, 70, 'gem'],
];

export const BOSS_X = STAGE_LEN - 260;
export const BOSS_Y = 75;
export const END_X = STAGE_LEN;
export { W };

export const LINES = {
  start: "Dragon Clan,\nhere I come!",
  firstSnack: 'SNACK TIME!',
  firstFreed: 'Fly home, little buddy!',
  bruteIntro: [['brute', 'GRONK SMASH\nTINY KNIGHT!'], ['dod', 'Tiny?! I have a\nDRAGON ARM, pal!']],
  bossIntro: [
    ['king', 'A VOICE FROM THE GEM:\nGrimscale! Do not let\nthat dragon boy pass!'],
    ['boss', 'Yes, my King.\nNo one passes the Dragon Gate!'],
    ['dod', "No one? Pfft.\nI'm DODONGO!"],
    ['boss', 'Then the Dragon King\nwill have a SNACK.'],
    ['dod', "Hey! I'M the one\nwho gets snacks!"],
  ],
  bossFreed: [
    ['boss2', 'The collar is broken!\nI am free!'],
    ['boss2', 'Thank you, young dragon.\nI can smell the fire in you.'],
    ['dod', "You can SMELL it?!\n...Is that a good smell?"],
    ['boss2', 'The best kind. But the Dragon King\nput collars on the whole Clan.'],
    ['boss2', 'Come. I will take you\nto his Ember Throne.'],
    ['dod', "Let's go free everybody!\n...Right after a snack."],
  ],
};
