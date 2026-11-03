// Every word in the game: in-level lines (with per-hero variants: Shadow only ever says "...") and the
// motion-comic cutscenes between levels.
//
// A hero line is either a string or { dodongo, ana, shadow, default }; heroLine() picks the speaker's version.
import { SI_CUTSCENES } from './sistory.js';
import { SI_ENABLED } from './sienabled.js';   // (Skull Island's si_* cutscenes, merged into CUTSCENES below -- docs/SKULL_ISLAND.md)
export function heroLine(text, heroId, fallback) {
  if (text == null) return fallback || '';
  // Shadow only ever says "..." (lines that are "..." with only punctuation or an *action* keep it -- "...!",
  // "... *bows*"); any words at all only when SHADOW_SPEAKS names the line ("...Too easy.", mm_dawn)
  if (typeof text === 'string') return heroId === 'shadow' && !shadowSays(text) ? '...' : text;
  // Scarlet borrows Anastasia's line when she has none of her own
  if (heroId === 'scarlet' && text.scarlet == null) return text.default ?? text.ana ?? text.dodongo ?? fallback ?? '';
  return text[heroId] ?? (heroId === 'shadow' ? '...' : text.default ?? fallback ?? '');
}
/** the lines with words that Shadow may say (the explicit exceptions to his "...") */
export const SHADOW_SPEAKS = new Set(['...Too easy.']);
const shadowSays = (t) => SHADOW_SPEAKS.has(t) || /^\.\.\.[\s!?.]*(\*[^*]*\*[\s!?.]*)*$/.test(t);

const H = (dodongo, ana, shadow = '...', scarlet) => ({ dodongo, ana, shadow, scarlet });

export const LINES = {
  firstSnack: H('SNACK TIME!', 'Mmm! Brain food!', '...*munch*', 'Beats ship biscuits!'),
  firstFreed: H('Fly home, little buddy!', "Go on, you're free!", '...', 'Fly free, little one!'),
  firstUlt: { dodongo: 'Not TOO mad...\njust mad ENOUGH!', ana: 'Stars, hear me!', shadow: '...', scarlet: 'Batten down\nthe hatches!' },
  joinIn: H('Did somebody ring\nthe doorbell?', 'You rang?', '...', 'Captain Scarlet,\nreporting for duty!'),
  swap: {},

  levelStart: {
    road: ['hero', H('Dragon Clan,\nhere we come!', 'Stay close. The Dragon\nClan is up there.', '...', "Snow? I'm a SEA\npirate, you know.")],
    mines: ['hero', H('It smells like\nburnt toast in here.', 'Keep an eye out\nfor the forge.', '...', 'Smells like the\nship\'s galley.')],
    storm: ['hero', H('Whoa. We are\nREALLY high up.', 'Hold onto your hats.\n...Well, MY hat.', '...', 'Now THIS is\nsailing weather!')],
    throne: ['hero', H("Nice palace.\nLet's go knock.", 'This is it.\nThe Ember Throne.', '...', "Fancy. Let's go\nbreak a crown.")],
    // the secret stages (docs/SECRETS_SCRIPT.md)
    frozen: ['hero', H('Brrr! Even my DRAGON\nARM is cold.', "It's freezing down here.\nStay close, everyone.", '... *shiver*', 'Ice caves? Give me\na warm deck any day!')],
    crystal: ['hero', H("It's like walking\ninside a DISCO ball!", "So many crystals...\nmine won't stop humming.", '...', "A lake underground?\nWhere's my rowboat?")],
    eyrie: ['hero', H("We're ABOVE the clouds.\nDon't look down.\n...I looked down.", 'Giant nests... and\nsomething shiny up top!', '...', 'Finally! A crow\'s nest\nworthy of a captain!')],
    hollow: ['hero', H("Shh! Tiptoe! There's\na sleeping QUEEN.", 'The last of the green\nfire is here. Careful.', '...', 'Quiet as a ship\nat midnight, crew.')],
  },

  bruteIntro: {
    road: [['brute', 'GRONK SMASH\nTINY HEROES!'], ['hero', H('Tiny?! I have a\nDRAGON ARM, pal!', 'Tiny, but SMART.', '...', "Pal, I've fought\na KRAKEN.")]],
    mines: [['brute', 'SLAG MELT\nYOU DOWN!'], ['hero', H("Hot head, huh?\nI'm hotter!", "He's all steam\nand no brains.", '...', "I've met hotter\nheads at sea.")]],
    storm: [['brute', 'THUNDERGUT BLOW\nYOU OFF MOUNTAIN!'], ['hero', H("Please don't.", 'Is that a threat\nor a burp?', '...', "I've sailed through\nworse wind than YOU.")]],
    throne: [['brute', "NOBODY TOUCH\nKING'S GOLD!"], ['hero', H("It's the CLAN'S gold,\nyou big lunk!", 'That gold belongs\nto the Clan!', '...', "A pirate knows\nstolen gold!")]],
  },

  // 'king' lines come out of the boss's collar gem: dark balloon with a DRAGON KING name tag
  bossIntro: {
    road: [
      ['king', 'Grimscale! Do not let\nthose children pass!'],
      ['boss', 'Yes, my King.\nNo one passes the Dragon Gate!'],
      ['hero', H("No one? Pfft.\nI'm DODONGO!", 'Want to bet?', '...', 'Not a chance,\nscales!')],
      ['boss', 'Then the Dragon King\nwill have a SNACK.'],
      ['hero', H("Hey! I'M the one\nwho gets snacks!", 'Rude!', '...', "I'm NOBODY'S\nsnack!")],
    ],
    mines: [
      ['boss', 'WHO... DISTURBS...\nTHE FORGE...'],
      ['king', 'Magmaw! MELT them!'],
      ['hero', H("He talks really slow.\nThat's good, right?", "He's wearing a collar!\nKnock it off him!")],
      ['boss', 'MUST... OBEY...'],
    ],
    storm: [
      ['boss', 'Turn back, little ones.\nThe storm obeys the KING.'],
      ['king', 'Tempest! Blow them\noff my mountain!'],
      ['hero', H("We're not scared\nof a little wind!", 'Tempest! That collar\nis bossing you around!')],
    ],
    throne: [
      ['boss', 'So. The little heroes\ncome to BOW before\ntheir KING.'],
      ['hero', H('Bow? I came here\nto take that CROWN.', "Your collars are broken.\nIt's over!", '...', "Pirates don't BOW.")],
      ['boss', 'Over? HA! I am the\nDRAGON KING! Behold\nthe EMBER CROWN!'],
      ['hero', H("Okay, it's shiny.\nBut it's going DOWN.", 'Everyone, together!\nAim for the crown!', '...', 'All hands!\nAim for the crown!')],
    ],
    // LINES.bossIntro.hollow (the Curse Wraith: a wide-eyed, wobbly green flame -- silly, never scary)
    hollow: [
      ['boss', 'Ooooo! I am the CURSE\nWRAITH! The Queen will\nsleep FOREVERRR!'],
      ['hero', H("You're a CANDLE with\nEYEBROWS. Let's go!", "You're just the leftover\ngreen fire. Out you go!", '...', "I've blown out scarier\nlanterns than YOU!")],
      ['boss', "W-wait! I'm VERY\nspooky! Ooooo...?"],
    ],

    // LINES.bossIntro for the three secret mini-bosses (like the main stages' bruteIntro banter)
    frozen: [
      ['boss', 'FROSTBITE GUARD\nSHINY ROCK!'],
      ['hero', H('Guarding it? I was\ngonna say PLEASE.', "That shiny rock isn't\nyours to keep!", '...', 'Finders keepers,\nfrosty!')],
    ],
    crystal: [
      ['boss', 'MINE... ALL...\nSHINY...'],
      ['hero', H("A ROCK collector!\nSame, buddy. Same.", 'Easy there! We just\nneed one crystal.', '...', 'A dragon with a\ntreasure hoard?\nRespect.')],
    ],
    eyrie: [
      ['boss', 'SKREEE! MY NEST!\nMY SHINY!'],
      ['hero', H("Okay, okay! I'll\ntrade you a SNACK!", 'Sorry! We need that\nshiny thing!', '...', "Sorry, birdie.\nCaptain's orders!")],
    ],
  },

  bossFreed: {
    road: [
      ['boss2', 'The collar is broken!\nI am free!'],
      ['boss2', 'Thank you, young heroes.\nAnd you, young dragon...\nI can smell the fire in you.'],
      ['hero', H('You can SMELL it?!\n...Is that a good smell?', 'Are you all right,\nSir Knight?', '...', 'Easy there,\nbig fella.')],
      ['boss2', 'The King put collars\non the whole Clan.\nHe makes them in\nthe Ember Mines.'],
      ['hero', H("Then let's go\nbreak his forge!", 'Then we stop the forge.\nLead the way!', '...', "Then let's sink\nhis forge!")],
    ],
    mines: [
      ['boss2', 'The forge... is cold.\nMy mind... is my own.'],
      ['boss2', 'Thank you...\nlittle heroes.'],
      ['hero', H('You are VERY\nwelcome, big guy.', 'You were never the\nbad guy, Magmaw.')],
      ['boss2', "Tempest... the storm dragon...\nguards the sky road\nto the King's throne."],
      ['hero', H('Then we free\nher too!', 'Then Stormspire\nis next.')],
    ],
    storm: [
      ['boss2', 'The storm in my head...\nit is gone.'],
      ['boss2', "You freed me.\nNow I will fly you\nto the King's throne."],
      ['hero', H('We get to RIDE\na DRAGON?!', 'Thank you, Tempest.', '...!', 'Finally! Something\nfaster than my ship!')],
    ],
    throne: [
      ['king2', 'My CROWN! My\nbeautiful CROWN!'],
      ['hero', H("Whoa. You're...\nkind of tiny now.", "Without that crown,\nhe's just... small.", '...', 'Ha! Not so\nscary now.')],
      ['king2', 'Do you know who I AM?!\nI am the DRAGON KING!'],
      ['hero', H("Somebody's going\nin the... BIRDCAGE.", "Somebody's going\nin a birdcage.", '...', 'Into the brig\nwith you!')],
      ['hero', H("Where'd you even\nGET that crown?", 'Where did you get\nthat crown?', '...?')],
      ['king2', 'A stranger in a hood!\nHe said I would rule\nALL the dragons!'],
      ['hero', H('A hooded stranger...\nuh oh.', 'A stranger in a hood...\nthe third wizard.', '...', "A stranger in a hood...\nI don't like it.")],
    ],
  },
};

// ================================================================================================ comic cutscenes
// A cutscene is pages of panels, drawn live with the game's own art (a "motion comic").
// panel: r = [x, y, w, h] on the 960x540 page
//        bg = { lvl: 'road'|'mines'|'storm'|'throne', cam, ox, oy, zoom, tint, night, warm }
//            the stage is drawn at camX = cam; (ox, oy) is the point of that 960x540 frame shown at the panel's
//            top-left; zoom scales it (left out: the panel frames its cast automatically)
//        cast = [{ c: art module, a: anim key, arg, x, y (feet, in the stage frame), f: facing, s: scale, z: lift,
//                  h: height override, o: draw options, mount: index }]
//        cap = caption text (top of panel)
//        say = [[castIndex, text]]  (balloons in order; castIndex -1 = the King through a gem: dark balloon;
//               -2 = big title text)
//        fx = 'portal' | 'shards' | 'moon' | 'stranger', or a list of names / { k, at, from, to, ... } (the finale's:
//             greenbolt cagemelt debris armglow dragonfire crystalglow transform clash smoke roar; src/cutscene.js)
//        bg.lvl 'sky': the finale's storm sky (src/stages/sky.js).  A page's pk: its painted plates' page key.
// Hero-dependent text uses H(); cast entries with c: 'P1'/'P2' use the players' heroes (falling back to the trio).
const FREE = { cursed: false };
export const CUTSCENES = {
  prologue: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 600, 300], bg: { lvl: 'road', cam: 120, warm: 0.6 },
          cast: [{ c: 'ana', a: 'talk', x: 300, y: 480, f: 1, s: 1.15 }, { c: 'dodongo', a: 'idle', x: 420, y: 486, f: -1, s: 1.15 }, { c: 'shadow', a: 'idle', x: 520, y: 482, f: -1, s: 1.15 }],
          cap: 'The three friends promised to meet again, right here, on the night of the full moon.',
          say: [[0, 'A piece of my magic\ncrystal for each of us!']] },
        { r: [640, 24, 296, 300], bg: { lvl: 'road', cam: 120, warm: 0.6 },
          cast: [{ c: 'ana', a: 'cheer', x: 520, y: 470, f: -1, s: 1.4 }], fx: 'shards',
          say: [[0, 'Squeeze it, and your\nfriends can step RIGHT\nthrough to help!']] },
        { r: [24, 340, 440, 176], bg: { lvl: 'road', cam: 560, warm: 0.6 },
          cast: [{ c: 'dodongo', a: 'cheer', x: 420, y: 520, f: 1, s: 1.2 }],
          say: [[0, 'A magic DOORBELL!\nCOOL.']] },
        // (framed with the pair on the left, so Ana's two-line balloon fits beside her on the right)
        { r: [480, 340, 456, 176], bg: { lvl: 'road', cam: 120, warm: 0.6, zoom: 0.55, ox: 131, oy: 219 },
          cast: [{ c: 'shadow', a: 'bow', x: 300, y: 520, f: 1, s: 1.2 }, { c: 'ana', a: 'talk', x: 460, y: 520, f: -1, s: 1.2 }],
          say: [[0, '... *bows*'], [1, "Shadow means 'thank you.'\nScarlet has hers, too!"]] },
      ] },
      { panels: [
        { r: [24, 24, 912, 220], bg: { lvl: 'road', cam: 700 },
          cast: [{ c: 'dodongo', a: 'walk', arg: 0.3, x: 240, y: 470, f: 1, s: 1 }],
          cap: 'Dodongo set off up the snowy mountain road to find the Dragon Clan.' },
        { r: [24, 260, 440, 256], bg: { lvl: 'road', cam: 1300 },
          cast: [{ c: 'kobold', a: 'taunt', x: 520, y: 470, f: -1, s: 1, o: { variant: 'green' } }, { c: 'whelp', a: 'hover', x: 620, y: 470, z: 90, f: -1, s: 1 },
            { c: 'kobold', a: 'idle', x: 690, y: 490, f: -1, s: 1, o: { variant: 'blue' } }],
          cap: 'But a mean DRAGON KING had taken over the Clan. His magic collars made every dragon obey him!' },
        { r: [480, 260, 456, 256], bg: { lvl: 'road', cam: 1300 }, fx: 'portal',
          cast: [{ c: 'dodongo', a: 'cheer', x: 330, y: 490, f: -1, s: 1.1 }, { c: 'ana', a: 'portal', arg: 0.7, x: 230, y: 480, f: 1, s: 1.1 }, { c: 'shadow', a: 'portal', arg: 0.8, x: 160, y: 470, f: 1, s: 1.1 }],
          say: [[0, 'Lizard soldiers?!\nTime to ring the\nDOORBELL!'], [1, 'You rang?']] },
      ] },
    ],
  },

  before_mines: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mines', cam: 80 },
          cast: [{ c: 'grimscale', a: 'guide', x: 570, y: 470, f: 1, s: 0.8, o: FREE }, { c: 'P1', a: 'idle', x: 770, y: 480, f: -1, s: 1 }, { c: 'P2', a: 'idle', x: 860, y: 470, f: -1, s: 1 }],
          cap: 'Grimscale led the heroes into the heart of the mountain.',
          say: [[0, 'The Ember Mines. Down there,\nthe King makes my Clan\nforge his collars.']] },
        { r: [24, 290, 450, 226], bg: { lvl: 'mines', cam: 80 },
          cast: [{ c: 'dodongo', a: 'talk', x: 420, y: 500, f: 1, s: 1.15 }],
          say: [[0, 'Forging COLLARS?!\nWorst. Job. EVER.']] },
        { r: [490, 290, 446, 226], bg: { lvl: 'mines', cam: 80 },
          cast: [{ c: 'ana', a: 'point', x: 560, y: 500, f: 1, s: 1.15 }, { c: 'shadow', a: 'fistPump', x: 700, y: 500, f: -1, s: 1.15 }],
          say: [[0, "We'll smash the forge.\nNo more collars!"], [1, '...!']] },
      ] },
    ],
  },

  before_storm: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 260], bg: { lvl: 'storm', cam: 60 },
          cast: [{ c: 'P1', a: 'point', x: 300, y: 480, f: 1, s: 1 }, { c: 'P2', a: 'idle', x: 200, y: 470, f: 1, s: 1 },
            { c: 'tempest', a: 'glideCursed', x: 690, y: 470, z: 10, f: -1, s: 1.15 }],
          cap: 'Next stop: STORMSPIRE, home of Tempest the storm dragon.' },
        { r: [24, 300, 450, 216], bg: { lvl: 'storm', cam: 60 },
          cast: [{ c: 'dodongo', a: 'cheer', x: 420, y: 500, f: 1, s: 1.15 }],
          say: [[0, "She's HUGE.\n...COOL."]] },
        { r: [490, 300, 446, 216], bg: { lvl: 'storm', cam: 60 },
          cast: [{ c: 'ana', a: 'talk', x: 560, y: 500, f: 1, s: 1.15 }, { c: 'shadow', a: 'idle', x: 690, y: 500, f: -1, s: 1.15 }],
          say: [[0, "She's wearing a collar too.\nFree her, and we can\ncross the sky road."]] },
      ] },
    ],
  },

  before_throne: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 290], bg: { lvl: 'throne', cam: 0, warm: 0.2 },
          cast: [{ c: 'tempest', a: 'glide', x: 470, y: 420, z: 30, f: 1, s: 0.75, o: FREE },
            { c: 'dodongo', a: 'sit', mount: 0, seat: 0, f: 1, s: 0.7 }, { c: 'ana', a: 'sit', mount: 0, seat: 1, f: 1, s: 0.7 }, { c: 'shadow', a: 'sit', mount: 0, seat: 2, f: 1, s: 0.7 }],
          cap: 'Tempest carried them through the storm to the volcano of the Ember Throne.',
          say: [[0, 'This is as close as I dare.\nGood luck, little ones.']] },
        { r: [24, 330, 450, 186], bg: { lvl: 'throne', cam: 6240 },
          cast: [{ c: 'dragonking', a: 'throne', x: 710, y: 390, f: -1, s: 0.6 }],
          say: [[0, 'Come then, little dragon.\nCome and BOW before\nyour KING!']] },
        { r: [490, 330, 446, 186], bg: { lvl: 'throne', cam: 0 },
          cast: [{ c: 'dodongo', a: 'talk', x: 420, y: 500, f: 1, s: 1.15 }, { c: 'ana', a: 'idle', x: 300, y: 500, f: 1, s: 1.15 }],
          say: [[0, 'Bow?\n...Nah.']] },
      ] },
    ],
  },

  // ------------------------------------------------------------------------------------------------ the finale
  // (docs/FINALE.md) After the throne-room boss: finale_a, finale_b, the sky duel (src/skyduel.js), finale_c,
  // finale_d, then the ending's last two pages.  Lore: the third wizard is never named (the Master, the third wizard);
  // Dodongo calls her Anastasia, never Ana.  dodongo_dragon / dragonking_dread: their painted atlases (scene packs).
  finale_a: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'throne', cam: 6240, warm: 1 },
          cast: [{ c: 'dodongo', a: 'point', x: 400, y: 500, f: 1, s: 1.1 }, { c: 'dragonking', a: 'tinyCaged', x: 600, y: 500, f: -1, s: 2 },
            { c: 'ana', a: 'idle', x: 280, y: 505, f: 1, s: 1 }, { c: 'shadow', a: 'idle', x: 190, y: 500, f: 1, s: 1 }],
          cap: 'The Dragon King was beaten, and the Dragon Clan was free!',
          say: [[1, 'Let me OUT! I am\nthe DRAGON KING!'], [0, 'Told you.\nBIRDCAGE.']] },
        { r: [24, 290, 450, 226], bg: { lvl: 'throne', cam: 6240, warm: 0.3 }, fx: [{ k: 'greenbolt', at: 1 }, { k: 'cagemelt', at: 1 }],
          cast: [{ c: 'dodongo', a: 'surprised', x: 380, y: 500, f: 1, s: 1.1 }, { c: 'dragonking', a: 'tinyCaged', x: 580, y: 500, f: -1, s: 2 }],
          cap: 'Then green lightning struck from far, far away...',
          say: [[0, 'Uh... is the cage\nsupposed to MELT?']] },
        { r: [490, 290, 446, 226], bg: { lvl: 'throne', cam: 6240, warm: 0 }, fx: [{ k: 'greenbolt', at: 0, x0: 960, y0: 20 }],
          cast: [{ c: 'dragonking_dread', a: 'roar', x: 640, y: 505, f: -1, s: 0.6 }],
          say: [[0, 'The MASTER has not\nforgotten me!']] },
      ] },
      { panels: [
        { r: [24, 24, 912, 300], bg: { lvl: 'sky', cam: 0, zoom: 1, ox: 24, oy: 160 }, fx: [{ k: 'debris', x: 520, y: 330 }],
          cast: [{ c: 'dragonking_dread', a: 'fly', x: 500, y: 455, f: 1, s: 0.62 }],
          cap: "Now he was the DREAD KING! He burst up through the volcano's roof into the storm!",
          say: [[0, "Catch me if you can,\nlittle dragon! Oh, wait...\nYOU CAN'T FLY!"]] },
        { r: [24, 340, 912, 176], bg: { lvl: 'throne', cam: 6240, warm: 0.3 },
          cast: [{ c: 'dodongo', a: 'surprised', x: 530, y: 500, f: -1, s: 1 }, { c: 'ana', a: 'point', x: 400, y: 505, f: 1, s: 1 },
            { c: 'shadow', a: 'idle', x: 630, y: 500, f: -1, s: 1 }],
          say: [[1, "He's getting away!"], [0, 'And he took the\nROOF with him!'], [2, '...!']] },
      ] },
    ],
  },

  finale_b: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 266], bg: { lvl: 'throne', cam: 6240, warm: 1 },
          cast: [{ c: 'grimscale', a: 'guide', x: 230, y: 480, f: 1, s: 0.75, o: FREE }, { c: 'tempest', a: 'glide', x: 790, y: 470, z: 60, f: -1, s: 0.6, o: FREE },
            { c: 'whelp', a: 'freed', x: 650, y: 470, z: 70, f: -1, s: 0.9, o: FREE }, { c: 'dodongo', a: 'idle', x: 470, y: 500, f: 1, s: 1 }],
          say: [[0, 'Only a dragon can catch\na dragon in the sky.'], [1, 'His green fire is too\nstrong for us alone...'], [3, "Then who's gonna\ncatch him?"]] },
        { r: [24, 306, 450, 210], bg: { lvl: 'throne', cam: 6240, warm: 1 }, fx: [{ k: 'armglow', at: 0 }],
          cast: [{ c: 'dodongo', a: 'surprised', x: 420, y: 500, f: 1, s: 1.15 }],
          say: [[0, 'Uh, guys? My dragon arm\nis doing a THING.']] },
        { r: [490, 306, 446, 210], bg: { lvl: 'throne', cam: 6240, warm: 1 },
          cast: [{ c: 'grimscale', a: 'kneel', x: 600, y: 480, f: -1, s: 0.8, o: FREE }],
          say: [[0, 'The fire in you,\nyoung dragon...\nLet it OUT!']] },
      ] },
      { panels: [
        { r: [24, 24, 912, 260], bg: { lvl: 'throne', cam: 6240, warm: 1 },
          fx: [{ k: 'dragonfire', from: [0, 1, 2], to: 3 }, { k: 'crystalglow', at: 4 }],
          cast: [{ c: 'grimscale', a: 'guide', x: 190, y: 480, f: 1, s: 0.7, o: FREE }, { c: 'tempest', a: 'glide', x: 800, y: 470, z: 80, f: -1, s: 0.55, o: FREE },
            { c: 'whelp', a: 'freed', x: 640, y: 470, z: 120, f: -1, s: 0.9, o: FREE }, { c: 'dodongo', a: 'cheer', x: 450, y: 500, f: 1, s: 1 },
            { c: 'ana', a: 'point', x: 330, y: 505, f: 1, s: 1 }],
          cap: "Every freed dragon roared its fire into him. Anastasia's crystal glowed too!",
          say: [[4, "Dodongo! Take the\ncrystal's power!"]] },
        { r: [24, 300, 450, 216], bg: { lvl: 'sky', cam: 0 }, fx: [{ k: 'transform', at: 0 }],
          cast: [{ c: 'dodongo_dragon', a: 'transform', arg: 0.5, x: 230, y: 470, z: 70, f: 1, s: 0.9 }],
          say: [[0, 'Whoa. I have WINGS!\n...And a TAIL!'], [-2, 'DRAGON DODONGO!']] },
        { r: [490, 300, 446, 216], bg: { lvl: 'sky', cam: 0 },
          cast: [{ c: 'dodongo_dragon', a: 'flyLoop', x: 700, y: 470, z: 90, f: 1, s: 0.8 }, { c: 'ana', a: 'sit', mount: 0, seat: 0, f: 1, s: 0.42 },
            { c: 'shadow', a: 'sit', mount: 0, seat: 1, f: 1, s: 0.42 }],
          say: [[0, 'Hey, KING! Guess\nwho can fly NOW?!'], [1, 'Hold on tight,\neveryone!'], [2, '... *holds on tight*']] },
      ] },
    ],
  },

  finale_c: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 270], bg: { lvl: 'sky', cam: 2400, zoom: 1, ox: 24, oy: 170 }, fx: [{ k: 'clash', from: 0, to: 1, meet: 0.62 }],
          cast: [{ c: 'dodongo_dragon', a: 'flame', x: 250, y: 400, f: 1, s: 0.8 }, { c: 'dragonking_dread', a: 'beam', x: 730, y: 440, f: -1, s: 0.55 }],
          cap: 'Dragon fire met green fire... and the green fire SHATTERED!',
          say: [[0, 'This is for the whole\nDragon Clan!']] },
        { r: [24, 310, 450, 206], bg: { lvl: 'sky', cam: 2400, zoom: 1, ox: 60, oy: 170 }, fx: [{ k: 'smoke', at: 0 }],
          cast: [{ c: 'dragonking', a: 'tinyIdle', x: 230, y: 340, f: -1, s: 2 }, { c: 'tempest', a: 'glide', x: 370, y: 330, f: -1, s: 0.45, o: FREE }],
          cap: 'The green smoke fled far, far away... and the King shrank back down!',
          say: [[0, 'Nooo! My POWER!'], [1, 'Got you, little king.']] },
        { r: [490, 310, 446, 206], bg: { lvl: 'throne', cam: 6240, warm: 1 },
          cast: [{ c: 'dragonking', a: 'tinyCaged', x: 600, y: 500, f: -1, s: 2 }],
          say: [[0, '...Not the BIRDCAGE\nagain!']] },
      ] },
      { panels: [
        { r: [24, 24, 912, 492], bg: { lvl: 'throne', cam: 6240, warm: 1 }, fx: [{ k: 'transform', at: 0 }],
          cast: [{ c: 'dodongo', a: 'cheer', x: 470, y: 500, f: 1, s: 1.2 }, { c: 'ana', a: 'cheer', x: 330, y: 505, f: 1, s: 1.1 },
            { c: 'shadow', a: 'fistPump', x: 620, y: 500, f: -1, s: 1.1 }],
          cap: 'Dodongo landed, and the fire faded until he was a boy again.',
          say: [[1, 'You were AMAZING,\nDodongo!'], [0, 'Thanks, Anastasia!\n...Aw. I liked\nhaving wings.'], [2, '... *thumbs up*']] },
      ] },
    ],
  },

  finale_d: {
    music: 'ending', pages: [
      { panels: [
        { r: [24, 24, 450, 260], bg: { lvl: 'throne', cam: 6240, warm: 1 },
          cast: [{ c: 'dragonking', a: 'tinyCaged', x: 560, y: 500, f: -1, s: 2 }],
          say: [[0, 'Fine! FINE! The MASTER\ngave me the green fire!']] },
        { r: [490, 24, 446, 260], bg: { lvl: 'throne', cam: 6240, warm: 1 },
          cast: [{ c: 'ana', a: 'talk', x: 420, y: 500, f: 1, s: 1.15 }],
          say: [[0, 'Green magic, just like\nMorvath and Malachar!'], [0, 'Your Master is the\nthird wizard!']] },
        { r: [24, 300, 912, 216], bg: { lvl: 'throne', cam: 6240, warm: 1 },
          cast: [{ c: 'dodongo', a: 'surprised', x: 420, y: 500, f: 1, s: 1.1 }, { c: 'shadow', a: 'idle', x: 560, y: 500, f: -1, s: 1.1 }],
          say: [[0, 'Wait. The BOSS of\nBOTH bad wizards?\n...Gulp.'], [1, '... *cracks knuckles*']] },
      ] },
      { panels: [
        { r: [24, 24, 912, 492], bg: { lvl: 'throne', cam: 6240, warm: 1 }, fx: [{ k: 'roar', from: [0, 1, 2, 3] }],
          cast: [{ c: 'grimscale', a: 'guide', x: 250, y: 480, f: 1, s: 0.75, o: FREE }, { c: 'tempest', a: 'glide', x: 780, y: 470, z: 70, f: -1, s: 0.6, o: FREE },
            { c: 'whelp', a: 'freed', x: 610, y: 460, z: 150, f: -1, s: 0.8, o: FREE }, { c: 'whelp', a: 'freed', x: 690, y: 450, z: 60, f: 1, s: 0.8, o: FREE },
            { c: 'dodongo', a: 'cheer', x: 460, y: 500, f: 1, s: 1 }, { c: 'ana', a: 'cheer', x: 380, y: 505, f: 1, s: 1 }, { c: 'shadow', a: 'cheer', x: 540, y: 500, f: -1, s: 1 }],
          cap: 'Then the whole Dragon Clan made a promise.',
          say: [[0, 'When the third wizard\ncomes, the Dragon Clan\nwill fly with you!'], [1, 'Every wing. Every flame.\nWe promise.'], [4, 'Dragons AND us? That\nwizard is TOAST!']] },
      ] },
    ],
  },

  ending: {
    music: 'ending', pages: [
      // (its first page, the freed Clan and the birdcage, moved into the finale: finale_a / finale_d; pk keeps each
      //  page's painted plate)
      { pk: 1, panels: [
        { r: [24, 24, 912, 492], bg: { lvl: 'road', cam: 140, night: true }, fx: 'moon',
          cast: [{ c: 'grimscale', a: 'fly', x: 560, y: 360, z: 60, f: -1, s: 0.75, o: FREE },
            { c: 'dodongo', a: 'sit', mount: 0, dx: 0, f: -1, s: 0.9 },
            { c: 'whelp', a: 'freed', x: 760, y: 300, z: 100, f: -1, s: 0.8, o: FREE }, { c: 'whelp', a: 'freed', x: 840, y: 340, z: 80, f: -1, s: 0.7, o: FREE },
            { c: 'ana', a: 'cheer', x: 250, y: 500, f: 1, s: 1 }, { c: 'shadow', a: 'wave', x: 160, y: 500, f: 1, s: 1 }],
          cap: 'Anastasia and Shadow warped home. Then, on the night of the full moon, back where they said goodbye...',
          say: [[1, 'I brought DRAGONS!\n...and SNACKS!'], [4, 'Right on time.'], [5, '... *waves*']] },
      ] },
      { pk: 2, panels: [
        { r: [120, 60, 720, 420], bg: { lvl: 'road', cam: 1000, night: 0.72, zoom: 0.78, ox: 20, oy: 0 }, fx: 'stranger',
          cast: [],
          cap: 'But far, far away, the third wizard was watching...',
          say: [[-2, 'TO BE CONTINUED...']] },
      ] },
    ],
  },

  // ------------------------------------------------------------------------------------------------ the secrets
  // (docs/SECRETS.md, docs/SECRETS_SCRIPT.md; heartstone's k -> mend, the fx's name is k) The three Star Shard finds (any order, any party: P1/P2 and H()), then,
  // after finale_d with all 3 shards and all 8 baby dragons: queen_a (the way opens), the Queen's Hollow stage,
  // queen_b (the Heartstone mends, the Queen wakes), queen_c (the party and the blessing: Dragon Dodongo unlocks),
  // true_end.  Lore: Dodongo says "Anastasia"; the hooded one is never named or seen up close.
  secret_frozen: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 262], bg: { lvl: 'frozen', cam: 3000 }, fx: [{ k: 'shard', x: 660, y: 360 }, { k: 'crystalglow', at: 0 }],
          cast: [{ c: 'P1', a: 'point', x: 380, y: 490, f: 1, s: 1.05 }, { c: 'P2', a: 'idle', x: 270, y: 480, f: 1, s: 1.05 }],
          cap: 'At the very bottom of the Frozen Hollow, something twinkled inside the ice...',
          say: [[0, H('A GLOWING rock?!\nI LOVE glowing rocks!', 'My crystal is humming!\nThat must be a\nSTAR SHARD!', '... *points*',
            'Treasure! I KNEW\nthis cave had treasure!')]] },
        { r: [24, 302, 450, 214], bg: { lvl: 'frozen', cam: 3000 }, fx: [{ k: 'shard', x: 250, y: 400 }],
          cast: [{ c: 'whelp', a: 'freed', x: 330, y: 470, z: 70, f: -1, s: 1.1, o: FREE }],
          say: [[0, "A piece of the Clan's\nHEARTSTONE! Find all\nthree, and Mama Queen\nwakes up!"]] },
        { r: [490, 302, 446, 214], bg: { lvl: 'frozen', cam: 3000 }, fx: [{ k: 'shard', x: 700, y: 380 }],
          cast: [{ c: 'P1', a: 'idle', x: 600, y: 500, f: 1, s: 1.1 }],
          say: [[0, H('Into my SNACK pocket\nyou go, little shard!', 'One step closer\nto waking her!', '... *nods*',
            'A treasure hunt?\nNow you speak PIRATE!')], [-2, 'STAR SHARD {n}/3!']] },
      ] },
    ],
  },

  secret_crystal: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 262], bg: { lvl: 'crystal', cam: 3200 }, fx: [{ k: 'shard', x: 600, y: 330 }],
          cast: [{ c: 'P1', a: 'point', x: 330, y: 490, f: 1, s: 1.05 }, { c: 'P2', a: 'idle', x: 220, y: 480, f: 1, s: 1.05 }],
          cap: 'Across the underground lake, one crystal shone brighter than all the rest.',
          say: [[0, H('The shiny one! The\nSHINIEST one! Mine!', "That's no ordinary\ncrystal... it's a\nSTAR SHARD!", '... *points*',
            'Now THAT is what I\ncall buried treasure!')]] },
        { r: [24, 302, 450, 214], bg: { lvl: 'crystal', cam: 3200 }, fx: [{ k: 'shard', x: 240, y: 400, big: true }],
          cast: [],
          cap: 'Deep inside the shard, a great dragon Queen slept. Three Star Shards could wake her!' },
        { r: [490, 302, 446, 214], bg: { lvl: 'crystal', cam: 3200 }, fx: [{ k: 'shard', x: 720, y: 380 }],
          cast: [{ c: 'P1', a: 'idle', x: 600, y: 500, f: 1, s: 1.1 }],
          say: [[0, H("She looks SO sleepy.\nDon't worry, Queen!\nWe'll wake you!", "Sleep tight, Your\nMajesty. We're\ncoming!", '... *bows to the shard*',
            "Hold on, Your\nMajesty! Captain\nScarlet's coming!")], [-2, 'STAR SHARD {n}/3!']] },
      ] },
    ],
  },

  secret_eyrie: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 262], bg: { lvl: 'eyrie', cam: 3000 }, fx: [{ k: 'shard', x: 640, y: 330 }],
          cast: [{ c: 'P1', a: 'point', x: 360, y: 490, f: 1, s: 1.05 }, { c: 'P2', a: 'idle', x: 250, y: 480, f: 1, s: 1.05 }],
          cap: 'High above the clouds, in the biggest nest of all, sat something that was NOT an egg.',
          say: [[0, H("Don't be an egg...\nDon't be an egg...\nIT'S A SHARD!", "It's a STAR SHARD!\nAnd my crystal\nagrees!", '... *points*',
            "Ahoy! That's no egg,\nthat's TREASURE!")]] },
        { r: [24, 302, 450, 214], bg: { lvl: 'eyrie', cam: 3000 }, fx: [{ k: 'shard', x: 260, y: 380 }],
          cast: [{ c: 'whelp', a: 'hover', x: 330, y: 470, z: 80, f: -1, s: 1.1, o: FREE }],
          say: [[0, "Mama Queen's shard!\nI can feel her\ndreaming! Three will\nwake her up!"]] },
        { r: [490, 302, 446, 214], bg: { lvl: 'eyrie', cam: 3000 }, fx: [{ k: 'shard', x: 700, y: 380 }],
          cast: [{ c: 'P1', a: 'idle', x: 600, y: 500, f: 1, s: 1.1 }],
          say: [[0, H("Nap time's almost\nover, Queen!\nWe're on it!", 'Every shard brings\nher closer to\nwaking up.', '... *thumbs up*',
            'A queen to wake?\nCount me in, mateys!')], [-2, 'STAR SHARD {n}/3!']] },
      ] },
    ],
  },

  // ---- the Queen's arc: plays after finale_d (instead of the ending) when meta.shards has 3 and meta.dragons has 8
  queen_a: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 262], bg: { lvl: 'throne', cam: 6240, warm: 1 }, fx: [{ k: 'shardsfly', from: [3, 4, 5], to: [480, 120], hover: true }],
          cast: [{ c: 'grimscale', a: 'guide', x: 220, y: 480, f: 1, s: 0.75, o: FREE }, { c: 'whelp', a: 'freed', x: 640, y: 450, z: 120, f: -1, s: 0.85, o: FREE },
            { c: 'whelp', a: 'freed', x: 720, y: 460, z: 70, f: -1, s: 0.8, o: FREE }, { c: 'dodongo', a: 'surprised', x: 470, y: 500, f: 1, s: 1 },
            { c: 'ana', a: 'point', x: 360, y: 505, f: 1, s: 1 }, { c: 'shadow', a: 'idle', x: 560, y: 500, f: -1, s: 1 }],
          cap: 'Then the three Star Shards floated out of the heroes\' pockets, glowing like little stars... and pointed the way.',
          say: [[1, 'The shards want to go\nto MAMA QUEEN!'], [3, 'Hey! Those were in\nmy SNACK pocket!']] },
        { r: [24, 302, 450, 214], bg: { lvl: 'throne', cam: 6240, warm: 1 },
          cast: [{ c: 'grimscale', a: 'kneel', x: 300, y: 480, f: 1, s: 0.8, o: FREE }],
          say: [[0, "One dark night, the\nMaster's green fire\nbroke our HEARTSTONE..."], [0, '...and our Queen fell\ninto a sleep no dragon\ncould wake her from.']] },
        { r: [490, 302, 446, 214], bg: { lvl: 'throne', cam: 6240, warm: 1 },
          cast: [{ c: 'ana', a: 'talk', x: 560, y: 500, f: 1, s: 1.1 }, { c: 'dodongo', a: 'cheer', x: 690, y: 500, f: -1, s: 1.1 }],
          say: [[0, "And now the shards are\nshowing us the way!"], [1, 'Hang on, Queen!\nWe are COMING!']] },
      ] },
      { panels: [
        { r: [24, 24, 912, 492], bg: { lvl: 'hollow', cam: 2600, warm: 0.2 }, fx: [{ k: 'heartstone', x: 500, y: 436, mend: 0 }, { k: 'curseflame', at: 0 }],
          cast: [{ c: 'dragonqueen', a: 'sleep', x: 640, y: 440, f: -1, s: 0.7 }, { c: 'dodongo', a: 'surprised', x: 260, y: 500, f: 1, s: 1 },
            { c: 'ana', a: 'point', x: 160, y: 505, f: 1, s: 1 }, { c: 'shadow', a: 'idle', x: 350, y: 500, f: 1, s: 1 }],
          cap: 'Deep under the Dragon Gate, in the Queen\'s Hollow, the Dragon Queen slept, wrapped in the last of the green fire.',
          say: [[1, "She's ENORMOUS.\n...And she's SNORING."], [2, 'That green fire is\nstill holding her!\nWe have to put it out!'], [3, '... *draws his sword*']] },
      ] },
    ],
  },

  queen_b: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'hollow', cam: 2600, warm: 0.4 }, fx: [{ k: 'smoke', at: 0 }],
          cast: [{ c: 'dragonqueen', a: 'sleep', x: 660, y: 440, f: -1, s: 0.62 }, { c: 'dodongo', a: 'cheer', x: 330, y: 500, f: 1, s: 1 },
            { c: 'ana', a: 'idle', x: 220, y: 505, f: 1, s: 1 }, { c: 'shadow', a: 'fistPump', x: 430, y: 500, f: 1, s: 1 }],
          cap: 'The Curse Wraith wobbled, squeaked... and puffed away like a blown-out birthday candle.',
          say: [[1, 'Quick, everybody!\nMake a WISH!'], [3, '... *fist pump*']] },
        { r: [24, 290, 450, 226], bg: { lvl: 'hollow', cam: 2600, warm: 0.6 }, fx: [{ k: 'shardsfly', from: [0, 1, 2], to: [330, 420], into: 'heartstone' }, { k: 'heartstone', x: 330, y: 440, mend: 0.5 }],
          cast: [{ c: 'dodongo', a: 'surprised', x: 140, y: 500, f: 1, s: 1 }, { c: 'ana', a: 'point', x: 60, y: 505, f: 1, s: 1 }, { c: 'shadow', a: 'idle', x: 210, y: 500, f: 1, s: 1 }],
          cap: 'Then the three Star Shards flew home...',
          say: [[1, "The Heartstone!\nIt's fixing itself!"]] },
        { r: [490, 290, 446, 226], bg: { lvl: 'hollow', cam: 2600, warm: 1 }, fx: [{ k: 'heartstone', x: 560, y: 450, mend: 1 }],
          // (0.55: her head up, her eyes open -- "one big golden eye opened")
          cast: [{ c: 'dragonqueen', a: 'wake', arg: 0.55, x: 760, y: 440, f: -1, s: 0.55 }],
          cap: '...and one big golden eye opened.' },
      ] },
      { pk: 1, panels: [
        { r: [24, 24, 912, 492], bg: { lvl: 'hollow', cam: 2600, warm: 1 }, fx: [{ k: 'heartstone', x: 500, y: 436, mend: 1 }],
          cast: [{ c: 'dragonqueen', a: 'wingSpread', arg: 1, x: 600, y: 440, f: -1, s: 0.7 }, { c: 'whelp', a: 'freed', x: 760, y: 360, z: 120, f: -1, s: 0.8, o: FREE },
            { c: 'dodongo', a: 'talk', x: 300, y: 500, f: 1, s: 1 }, { c: 'ana', a: 'idle', x: 190, y: 505, f: 1, s: 1 }, { c: 'shadow', a: 'bow', x: 400, y: 500, f: 1, s: 1 }],
          cap: 'The Dragon Queen was awake at last.',
          say: [[0, 'What a long nap...\nWho woke me with such\nbrave, warm fire?'], [2, "Uh, hi! I'm Dodongo!\nThis is Anastasia,\nand that's Shadow!"], [4, '... *bows*'], [1, 'MAMA QUEEN!!']] },
      ] },
    ],
  },

  queen_c: {
    music: 'ending', pages: [
      { pk: 0, panels: [
        { r: [24, 24, 912, 492], bg: { lvl: 'hollow', cam: 2600, warm: 1 }, fx: [{ k: 'heartstone', x: 500, y: 436, mend: 1 }],
          cast: [{ c: 'grimscale', a: 'fly', x: 200, y: 420, z: 120, f: 1, s: 0.6, o: FREE }, { c: 'tempest', a: 'glide', x: 790, y: 400, z: 130, f: -1, s: 0.5, o: FREE },
            { c: 'whelp', a: 'freed', x: 560, y: 330, z: 150, f: 1, s: 0.8, o: FREE }, { c: 'dragonqueen', a: 'idle', x: 620, y: 450, f: -1, s: 0.62 },
            { c: 'dodongo', a: 'cheer', x: 360, y: 500, f: 1, s: 1 }, { c: 'ana', a: 'cheer', x: 260, y: 505, f: 1, s: 1 }, { c: 'shadow', a: 'cheer', x: 450, y: 500, f: 1, s: 1 }],
          cap: 'That night, the whole Dragon Clan threw the biggest party the mountain had ever seen.',
          say: [[3, 'My little ones...\nall FREE, and all\nHOME!'], [4, 'Best. Party. EVER.\n...Is there cake? Please\ntell me there\'s cake.'], [5, "They're a family\nagain, Dodongo."], [6, '... *happy dance*']] },
      ] },
      // (the warning BEFORE the blessing, so the unlock is the last high point; true_end only teases the far figure)
      { panels: [
        { r: [24, 24, 912, 492], bg: { lvl: 'hollow', cam: 2600, warm: 0.8 },
          cast: [{ c: 'dragonqueen', a: 'idle', x: 600, y: 450, f: -1, s: 0.66 }, { c: 'ana', a: 'idle', x: 300, y: 505, f: 1, s: 1 },
            { c: 'dodongo', a: 'idle', x: 400, y: 500, f: 1, s: 1 }, { c: 'shadow', a: 'idle', x: 200, y: 500, f: 1, s: 1 }],
          say: [[0, 'Little heroes, listen.\nThe hooded one who\nbroke our Heartstone...'], [0, "...is still out there.\nBut you won't face\nhim alone."],
            [2, "We'll be READY.\n...Right after cake."], [3, '... *nods*']] },
      ] },
      { pk: 2, panels: [
        { r: [24, 24, 912, 300], bg: { lvl: 'hollow', cam: 2600, warm: 1 }, fx: [{ k: 'armglow', at: 1 }, { k: 'transform', at: 1, soft: true }],
          // (the blessing: her wings wide, her palm cupped)
          cast: [{ c: 'dragonqueen', a: 'wingSpread', arg: 1, x: 640, y: 450, f: -1, s: 0.66 }, { c: 'dodongo', a: 'surprised', x: 420, y: 500, f: 1, s: 1.1 }],
          cap: 'Then the Queen smiled down at Dodongo.',
          say: [[0, 'Young dragon, you\ncarry our fire in\nyour heart.'], [0, 'The dragon in your heart\nis yours to call,\nany time you need it.']] },
        { r: [24, 340, 450, 176], bg: { lvl: 'hollow', cam: 2600, warm: 1 },
          cast: [{ c: 'dodongo', a: 'talk', x: 400, y: 500, f: 1, s: 1.15 }],
          say: [[0, 'Wait. ANY time?\nLike... RIGHT NOW?']] },
        { r: [490, 340, 446, 176], bg: { lvl: 'hollow', cam: 2600, warm: 1 }, fx: [{ k: 'transform', at: 0 }],
          cast: [{ c: 'dodongo_dragon', a: 'flyLoop', x: 690, y: 450, z: 60, f: 1, s: 0.62 }, { c: 'whelp', a: 'freed', x: 820, y: 420, z: 90, f: -1, s: 0.7, o: FREE }],
          say: [[0, 'WOO-HOO! My WINGS\nare BACK!'], [-3, 'DRAGON DODONGO\nUNLOCKED!']] },
      ] },
    ],
  },

  true_end: {
    music: 'ending', pages: [
      { pk: 0, panels: [
        { r: [24, 24, 912, 330], bg: { lvl: 'road', cam: 140, warm: 1 },
          // (the Queen's painted flight: lower, clear of the caption)
          cast: [{ c: 'dragonqueen', a: 'fly', x: 640, y: 330, z: 40, f: -1, s: 0.48 }, { c: 'dodongo_dragon', a: 'flyLoop', x: 380, y: 320, z: 110, f: -1, s: 0.55 },
            { c: 'ana', a: 'sit', mount: 1, seat: 0, f: -1, s: 0.3 }, { c: 'shadow', a: 'sit', mount: 1, seat: 1, f: -1, s: 0.3 },
            { c: 'whelp', a: 'freed', x: 820, y: 330, z: 140, f: -1, s: 0.6, o: FREE }, { c: 'whelp', a: 'freed', x: 210, y: 300, z: 160, f: -1, s: 0.55, o: FREE }],
          cap: 'And so the Dragon Clan had its Queen again... and Dodongo could fly whenever he needed to.',
          say: [[-2, 'THE TRUE ENDING']] },
        { r: [24, 370, 912, 146], bg: { lvl: 'road', cam: 1000, night: 0.72, zoom: 0.95, ox: 0, oy: 290 }, fx: 'stranger',
          cast: [],
          cap: 'But far, far away, a hooded figure watched the dragons fly... and frowned.',
          say: [[-2, 'THE END... FOR NOW!']] },
      ] },
    ],
  },


// ------------------------------------------------------------------------------------------------ MYSTIC MOUNTAIN
// (docs/MYSTIC_MOUNTAIN.md, docs/MM_SCRIPT.md) Book one's story, on the book's own painted panels (assets/story/mm_*):
// every panel is a plate; the cast entries only anchor the balloons (bg zoom 1: x / y are the panel's own pixels).
// Lore: Dodongo says "Anastasia"; Shadow says "..." until "...Too easy." (mm_dawn); nobody is killed.
  mm_prologue: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 440, 492], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_open',
          cast: [],
          cap: 'Far beyond the green valleys rose a mountain that no one dared to climb.',
          say: [[-2, 'KRA-KOOM!']]
        },
        { r: [480, 24, 456, 238], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_eyes',
          cast: [{ c: 'morvath', a: 'idle', x: 274, y: 724, h: 720 }],
          cap: 'At its top lived the wicked wizard Morvath.',
          say: [[0, 'All that laughing down\nthere. All that\nSINGING. Ugh.']]
        },
        { r: [480, 278, 456, 238], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_laugh',
          cast: [{ c: 'morvath', a: 'idle', x: 237, y: 603, h: 591 }],
          say: [[0, 'HA HA HA HA!'], [0, 'Soon the whole valley\nwill be gray and QUIET!']]
        },
      ] },
      { panels: [
        { r: [24, 24, 912, 236], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_village',
          cast: [],
          cap: 'Every night, the storm crept closer. Whatever it touched turned gray.'
        },
        { r: [24, 276, 450, 240], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_granny',
          cast: [{ c: 'villageboy', a: 'idle', x: 338, y: 279, h: 166 }, { c: 'granny', a: 'idle', x: 162, y: 196, h: 116 }, { c: 'villageboy', a: 'idle', x: 306, y: 186, h: 50 }],
          say: [[0, 'It\'s at the old mill,\nGranny! Isn\'t ANYBODY\ngoing to stop it?']]
        },
        { r: [490, 276, 446, 240], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_silhouettes',
          cast: [{ c: 'granny', a: 'idle', x: 513, y: 154, h: 144 }, { c: 'ana', a: 'idle', x: 57, y: 245, h: 192 }, { c: 'dodongo', a: 'idle', x: 137, y: 168, h: 84 }, { c: 'shadow', a: 'idle', x: 211, y: 163, h: 72 }],
          say: [[0, 'Somebody is.']]
        },
      ] },
      { panels: [
        { r: [24, 24, 296, 492], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_heroes',
          cast: [{ c: 'ana', a: 'idle', x: 179, y: 960, h: 775 }],
          cap: 'ANASTASIA: young wizard. Always has a plan.',
          say: [[0, 'Everybody says\nNOBODY can climb\nMystic Mountain.']]
        },
        { r: [332, 24, 296, 492], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_heroes',
          cast: [{ c: 'dodongo', a: 'idle', x: 100, y: 499, h: 288 }],
          cap: 'DODONGO: warrior. A little bit dragon. (Long story.)',
          say: [[0, 'Everybody hasn\'t\nmet US!']]
        },
        { r: [640, 24, 296, 492], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_heroes',
          cast: [{ c: 'shadow', a: 'idle', x: 107, y: 312, h: 167 }],
          cap: 'SHADOW: ninja. Has never said a single word.'
        },
      ] },
      { panels: [
        { r: [24, 24, 912, 300], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_g1',
          cast: [{ c: 'ana', a: 'idle', x: 319, y: 474, h: 457 }, { c: 'dodongo', a: 'idle', x: 648, y: 249, h: 248 }],
          say: [[0, 'Map. Water. Snacks...\nWhy are there FOUR\nbags of snacks?'], [1, 'Planning!']]
        },
        { r: [24, 340, 296, 176], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_g2',
          cast: [{ c: 'dodongo', a: 'idle', x: 214, y: 276, h: 257 }, { c: 'shadow', a: 'idle', x: 80, y: 185, h: 123 }, { c: 'dodongo', a: 'idle', x: 198, y: 110, h: 50 }],
          say: [[0, 'Hey...\nwhere\'s\nShadow?']]
        },
        { r: [332, 340, 296, 176], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_g4',
          cast: [{ c: 'dodongo', a: 'idle', x: 160, y: 177, h: 151 }],
          say: [[0, 'YAAAH!']]
        },
        { r: [640, 340, 296, 176], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_g5',
          cast: [{ c: 'shadow', a: 'idle', x: 65, y: 303, h: 202 }, { c: 'shadow', a: 'idle', x: 139, y: 269, h: 168 }],
          say: [[0, '...']]
        },
      ] },
      { panels: [
        { r: [24, 24, 296, 492], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_r1',
          cast: [{ c: 'dodongo', a: 'idle', x: 148, y: 378, h: 231 }],
          say: [[0, 'Race you to\nthe top!']]
        },
        { r: [332, 24, 296, 492], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_r2',
          cast: [{ c: 'ana', a: 'idle', x: 148, y: 664, h: 531 }],
          say: [[0, 'It\'s a TWO-DAY climb,\nDodongo. Pace\nyourself.']]
        },
        { r: [640, 24, 296, 492], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'c1_r3',
          cast: [{ c: 'dodongo', a: 'idle', x: 243, y: 257, h: 50 }, { c: 'ana', a: 'idle', x: 92, y: 453, h: 247 }, { c: 'shadow', a: 'idle', x: 231, y: 241, h: 99 }, { c: 'dodongo', a: 'idle', x: 222, y: 276, h: 50 }],
          say: [[0, 'How does\nhe DO\nthat?!']]
        },
      ] },
    ],
  },
  mm_forest_intro: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_open',
          cast: [],
          cap: 'By nightfall, they reached the Shadow Forest...'
        },
        { r: [24, 290, 450, 226], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_o2',
          cast: [{ c: 'dodongo', a: 'idle', x: 148, y: 213, h: 200 }, { c: 'ana', a: 'idle', x: 284, y: 419, h: 372 }, { c: 'tree', a: 'idle', x: 396, y: 285, h: 215 }],
          say: [[0, 'Is it just me, or did\nthat tree just MOVE?']]
        },
        { r: [490, 290, 446, 226], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_o3',
          cast: [{ c: 'ana', a: 'idle', x: 223, y: 528, h: 558 }, { c: 'tree', a: 'idle', x: 357, y: 243, h: 201 }],
          say: [[0, 'It\'s just you.']]
        },
      ] },
      { panels: [
        { r: [24, 24, 296, 492], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_hear',
          cast: [{ c: 'ana', a: 'idle', x: 148, y: 1171, h: 1132 }],
          say: [[0, 'Shh! Did you\nhear that?']]
        },
        { r: [332, 24, 604, 236], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_eyes1',
          cast: [],
          say: [[-4, 'grrr...']]
        },
        { r: [332, 276, 604, 240], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_ember',
          cast: [{ c: 'dodongo', a: 'idle', x: 169, y: 239, h: 229 }],
          say: [[0, '...Wolves.']]
        },
      ] },
    ],
  },
  mm_wolves: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 600, 280], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_too_many',
          cast: [{ c: 'dodongo', a: 'idle', x: 204, y: 306, h: 294 }, { c: 'shadow', a: 'idle', x: 378, y: 263, h: 255 }],
          say: [[0, 'They just keep\ncoming BACK!']]
        },
        { r: [640, 24, 296, 280], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_idea',
          cast: [{ c: 'ana', a: 'idle', x: 184, y: 671, h: 659 }],
          say: [[0, 'Wait... they backed\naway from your\nGLOWING arm...']]
        },
        { r: [24, 320, 440, 196], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_charge',
          cast: [{ c: 'dodongo', a: 'idle', x: 304, y: 103, h: 78 }],
          say: [[0, 'Uh, Anastasia? Why\nis your stick\nHUMMING?']]
        },
        { r: [480, 320, 456, 196], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_blast',
          cast: [{ c: 'ana', a: 'idle', x: 219, y: 237, h: 193 }, { c: 'dodongo', a: 'idle', x: 492, y: 271, h: 52 }],
          say: [[0, 'Shadows hate light... so\nlet\'s give them LOTS!'], [1, 'EEEEEK!']]
        },
      ] },
    ],
  },
  mm_wolf_pack: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_eyes_all',
          cast: [],
          say: [[-2, 'GRRRRRRR...']]
        },
        { r: [24, 290, 912, 226], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_leap',
          cast: [],
          say: [[-2, 'SNARL!']]
        },
      ] },
    ],
  },
  mm_forest_end: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_after',
          cast: [{ c: 'dodongo', a: 'idle', x: 201, y: 145, h: 123 }, { c: 'ana', a: 'idle', x: 456, y: 316, h: 270 }, { c: 'shadow', a: 'idle', x: 702, y: 169, h: 123 }],
          say: [[0, 'Too easy!'], [1, 'You SCREAMED.']]
        },
        { r: [24, 290, 450, 226], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_strat',
          cast: [{ c: 'dodongo', a: 'idle', x: 230, y: 304, h: 292 }],
          say: [[0, 'That was a\nBATTLE CRY.']]
        },
        { r: [490, 290, 446, 226], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_dots',
          cast: [{ c: 'shadow', a: 'idle', x: 227, y: 366, h: 364 }],
          say: [[0, '...']]
        },
      ] },
      { panels: [
        { r: [24, 24, 596, 236], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_map',
          cast: [{ c: 'ana', a: 'idle', x: 280, y: 381, h: 367 }],
          cap: 'That night, they camped above the trees.',
          say: [[0, 'The map stops at the\nIcy Cliffs. Nobody\'s\never been higher.']]
        },
        { r: [636, 24, 300, 236], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_toast',
          cast: [{ c: 'ana', a: 'idle', x: 90, y: 288, h: 255 }, { c: 'dodongo', a: 'idle', x: 306, y: 189, h: 102 }],
          say: [[1, 'Toast?'], [0, '...Okay, that\'s\nhandy.']]
        },
        { r: [24, 276, 560, 240], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_arm',
          cast: [{ c: 'ana', a: 'idle', x: 147, y: 340, h: 307 }, { c: 'dodongo', a: 'idle', x: 397, y: 182, h: 162 }, { c: 'ana', a: 'idle', x: 179, y: 134, h: 50 }, { c: 'dodongo', a: 'idle', x: 381, y: 92, h: 50 }],
          say: [[0, 'What IS your arm,\nanyway?'], [1, 'Family thing.\nGranny says\nwe\'re part\ndragon.']]
        },
        { r: [600, 276, 336, 240], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_rule',
          cast: [{ c: 'ana', a: 'idle', x: 88, y: 250, h: 204 }, { c: 'dodongo', a: 'idle', x: 244, y: 235, h: 216 }],
          say: [[1, 'Rule number one:\nnever get TOO mad.'], [0, 'Or what?'], [1, 'No idea!']]
        },
      ] },
      { panels: [
        { r: [24, 24, 912, 236], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_ball',
          cast: [{ c: 'morvath', a: 'idle', x: 750, y: 253, h: 250 }, { c: 'morvath', a: 'idle', x: 611, y: 93, h: 50 }],
          cap: 'Meanwhile, high in the tower...',
          say: [[0, 'Children.\nClimbing MY\nmountain.']]
        },
        { r: [24, 276, 296, 240], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_pfft',
          cast: [{ c: 'morvath', a: 'idle', x: 155, y: 238, h: 196 }, { c: 'morvath', a: 'idle', x: 139, y: 121, h: 50 }],
          say: [[0, 'They got past my wolves?\nPfft. Beginner\'s luck.']]
        },
        { r: [336, 276, 300, 240], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_window',
          cast: [{ c: 'morvath', a: 'idle', x: 60, y: 186, h: 92 }],
          say: [[0, 'By tomorrow night\nmy storm reaches\nthe village...'], [0, '...and the whole\nvalley goes gray. And\nQUIET. Forever!']]
        },
        { r: [652, 276, 284, 240], bg: { lvl: 'mm_forest', zoom: 1, ox: 0, oy: 0 }, book: 'c2_teeth',
          cast: [{ c: 'morvath', a: 'idle', x: 137, y: 391, h: 372 }, { c: 'morvath', a: 'idle', x: 121, y: 133, h: 50 }],
          say: [[0, 'Let them\nclimb. My\nmountain\nhas TEETH.']]
        },
      ] },
    ],
  },
  mm_bridge_intro: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_open',
          cast: [],
          cap: 'The next afternoon...'
        },
        { r: [24, 290, 450, 226], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_o2',
          cast: [{ c: 'dodongo', a: 'idle', x: 225, y: 182, h: 181 }],
          say: [[0, 'Don\'t look down.\nDon\'t look down.\nDon\'t look-']]
        },
        { r: [490, 290, 446, 226], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_o3',
          cast: [{ c: 'ana', a: 'idle', x: 223, y: 304, h: 291 }],
          say: [[0, 'Then stop\nSAYING it!']]
        },
      ] },
    ],
  },
  mm_troll: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 236], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_uhoh',
          cast: [{ c: 'ana', a: 'idle', x: 429, y: 383, h: 346 }, { c: 'dodongo', a: 'idle', x: 237, y: 352, h: 307 }, { c: 'shadow', a: 'idle', x: 730, y: 268, h: 211 }],
          say: [[0, 'Uh... guys?']]
        },
        { r: [24, 276, 450, 240], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_troll',
          cast: [],
          say: [[-2, 'ROOOOAAAAR!']]
        },
        { r: [490, 276, 446, 240], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_pebble',
          cast: [{ c: 'dodongo', a: 'idle', x: 290, y: 219, h: 192 }],
          say: [[0, 'That\'s... a BIG\npebble.']]
        },
      ] },
      { panels: [
        { r: [24, 24, 296, 492], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_block',
          cast: [{ c: 'dodongo', a: 'idle', x: 189, y: 330, h: 197 }, { c: 'dodongo', a: 'idle', x: 141, y: 212, h: 50 }],
          say: [[0, 'Not today,\nPEBBLE!']]
        },
        { r: [332, 24, 604, 492], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_idea',
          cast: [{ c: 'ana', a: 'idle', x: 312, y: 1220, h: 1205 }],
          say: [[0, 'All that dust...\nShadow! Tickle his\nNOSE!']]
        },
      ] },
    ],
  },
  mm_bridge_end: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_topple',
          cast: [],
          say: [[-2, 'AAAH-CHOOOOO!']]
        },
        { r: [24, 290, 450, 226], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_peer',
          cast: [{ c: 'ana', a: 'idle', x: 135, y: 336, h: 349 }, { c: 'dodongo', a: 'idle', x: 297, y: 309, h: 316 }],
          say: [[-4, '...crash.']]
        },
        { r: [490, 290, 446, 226], bg: { lvl: 'mm_bridge', zoom: 1, ox: 0, oy: 0 }, book: 'c3_bless',
          cast: [{ c: 'dodongo', a: 'idle', x: 357, y: 121, h: 48 }, { c: 'troll', a: 'idle', x: 401, y: 515, h: 198 }, { c: 'ana', a: 'idle', x: 134, y: 381, h: 366 }, { c: 'dodongo', a: 'idle', x: 277, y: 123, h: 50 }],
          say: [[0, 'BLESS YOU!'], [1, '...thank you.']]
        },
      ] },
    ],
  },
  mm_cliffs_intro: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 296, 492], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_open',
          cast: [],
          cap: 'Higher and higher they climbed, into the Icy Cliffs...'
        },
        { r: [332, 24, 296, 492], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_cold',
          cast: [{ c: 'dodongo', a: 'idle', x: 148, y: 487, h: 418 }],
          say: [[0, 'At least my arm is warm!']]
        },
        { r: [640, 24, 296, 492], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_sha_snow',
          cast: [{ c: 'shadow', a: 'idle', x: 145, y: 211, h: 172 }],
          say: [[0, '...']]
        },
      ] },
    ],
  },
  mm_wyvern: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 270], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_shadow_over',
          cast: [{ c: 'dodongo', a: 'idle', x: 264, y: 282, h: 245 }, { c: 'ana', a: 'idle', x: 456, y: 331, h: 245 }, { c: 'shadow', a: 'idle', x: 684, y: 335, h: 222 }],
          say: [[0, 'Uh... is that\na cloud?'], [1, 'Clouds don\'t\nhave WINGS!']]
        },
        { r: [24, 310, 912, 206], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_wyvern',
          cast: [],
          say: [[-2, 'SKREEEEE!']]
        },
      ] },
      { panels: [
        { r: [24, 24, 296, 492], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_grab',
          cast: [{ c: 'ana', a: 'idle', x: 124, y: 453, h: 197 }, { c: 'wyvern', a: 'idle', x: 213, y: 285, h: 246 }],
          say: [[0, 'Hey! Put me\nDOWN!']]
        },
        { r: [332, 24, 296, 492], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_shout',
          cast: [{ c: 'dodongo', a: 'idle', x: 148, y: 329, h: 221 }],
          say: [[0, 'ANASTASIA!']]
        },
        { r: [640, 24, 296, 492], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_launch',
          cast: [{ c: 'dodongo', a: 'idle', x: 68, y: 298, h: 22 }, { c: 'shadow', a: 'idle', x: 148, y: 178, h: 148 }, { c: 'dodongo', a: 'idle', x: 148, y: 320, h: 50 }],
          say: [[0, 'Shadow!\nSHIELD!']]
        },
      ] },
    ],
  },
  mm_cliffs_end: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 296, 492], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_zap',
          cast: [{ c: 'ana', a: 'idle', x: 182, y: 473, h: 271 }, { c: 'wyvern', a: 'idle', x: 73, y: 217, h: 197 }],
          say: [[0, 'Dodongo... get ready\nto CATCH!'], [0, 'I said... PUT ME\nDOWN!']]
        },
        { r: [332, 24, 296, 492], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_catch',
          cast: [{ c: 'dodongo', a: 'idle', x: 114, y: 173, h: 148 }, { c: 'ana', a: 'idle', x: 223, y: 482, h: 246 }],
          say: [[0, 'GOTCHA!']]
        },
        { r: [640, 24, 296, 492], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_flop',
          cast: [{ c: 'ana', a: 'idle', x: 62, y: 384, h: 295 }, { c: 'dodongo', a: 'idle', x: 245, y: 305, h: 197 }],
          say: [[0, 'I KNEW you\'d\ncatch me.'], [1, 'Me too!'], [1, '...Pretty sure.']]
        },
      ] },
      { panels: [
        { r: [24, 24, 450, 238], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_how',
          cast: [{ c: 'ana', a: 'idle', x: 99, y: 322, h: 266 }, { c: 'shadow', a: 'idle', x: 346, y: 162, h: 133 }, { c: 'dodongo', a: 'idle', x: 234, y: 185, h: 116 }],
          say: [[0, 'How did you even-'], [1, '...']]
        },
        { r: [490, 24, 446, 238], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_dontask',
          cast: [{ c: 'dodongo', a: 'idle', x: 190, y: 466, h: 452 }, { c: 'dodongo', a: 'idle', x: 250, y: 100, h: 50 }],
          say: [[0, 'Don\'t ask.\nHe never says.']]
        },
        { r: [24, 278, 450, 238], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_upthere',
          cast: [{ c: 'ana', a: 'idle', x: 155, y: 540, h: 601 }, { c: 'ana', a: 'idle', x: 262, y: 70, h: 50 }],
          say: [[0, 'Look...\nwe\'re off\nthe map.']]
        },
        { r: [490, 278, 446, 238], bg: { lvl: 'mm_cliffs', zoom: 1, ox: 0, oy: 0 }, book: 'c4_mansion_tease',
          cast: [],
          cap: 'High in the cliffs stood a gloomy old house. The path led straight to its door.'
        },
      ] },
    ],
  },
  mm_hall_intro: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_open',
          cast: [{ c: 'dodongo', a: 'idle', x: 456, y: 425, h: 316 }, { c: 'ana', a: 'idle', x: 292, y: 473, h: 395 }, { c: 'shadow', a: 'idle', x: 657, y: 425, h: 316 }],
          say: [[0, 'Whose house\nis THIS?'], [1, 'Guess.']]
        },
        { r: [24, 290, 560, 226], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_o2',
          cast: [{ c: 'dodongo', a: 'idle', x: 135, y: 323, h: 303 }, { c: 'ana', a: 'idle', x: 380, y: 323, h: 267 }, { c: 'dodongo', a: 'idle', x: 151, y: 121, h: 50 }, { c: 'ana', a: 'idle', x: 364, y: 149, h: 50 }],
          say: [[0, 'HELLO?\nANYBODY\nHOME?'], [1, 'We\'re\nSNEAKING,\nDodongo!']]
        },
        { r: [600, 290, 336, 226], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_o3',
          cast: [{ c: 'dodongo', a: 'idle', x: 118, y: 242, h: 202 }, { c: 'shadow', a: 'idle', x: 262, y: 215, h: 134 }],
          say: [[0, 'hello? anybody\nhome?']]
        },
      ] },
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_hall',
          cast: [{ c: 'dodongo', a: 'idle', x: 255, y: 230, h: 176 }, { c: 'ana', a: 'idle', x: 474, y: 436, h: 382 }, { c: 'shadow', a: 'idle', x: 611, y: 283, h: 176 }],
          say: [[0, 'I don\'t like how\nthey\'re looking at us.'], [1, 'They\'re just empty\narmor, Dodongo.']]
        },
        { r: [24, 290, 450, 226], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_gem',
          cast: [{ c: 'ana', a: 'idle', x: 122, y: 236, h: 138 }, { c: 'dodongo', a: 'idle', x: 202, y: 208, h: 123 }, { c: 'shadow', a: 'idle', x: 279, y: 184, h: 77 }],
          say: [[0, 'Whoa... Okay. Nobody\ntouch ANYTHING.']]
        },
        { r: [490, 290, 215, 226], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_reach',
          cast: [{ c: 'dodongo', a: 'idle', x: 99, y: 159, h: 115 }],
          say: [[0, 'Ooh.\nSHINY.']]
        },
        { r: [721, 290, 215, 226], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_notice',
          cast: [{ c: 'ana', a: 'idle', x: 108, y: 351, h: 298 }],
          say: [[0, 'Dodongo,\nDON\'T-']]
        },
      ] },
      { panels: [
        { r: [24, 24, 450, 492], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_touch',
          cast: [],
          say: [[-2, 'ZZZING!']]
        },
        { r: [490, 24, 446, 238], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_wake',
          cast: [],
          say: [[-2, 'CLICK! CLICK!']]
        },
        { r: [490, 278, 446, 238], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_freeze',
          cast: [{ c: 'dodongo', a: 'idle', x: 98, y: 210, h: 203 }, { c: 'ana', a: 'idle', x: 232, y: 169, h: 135 }, { c: 'shadow', a: 'idle', x: 366, y: 146, h: 118 }],
          say: [[0, 'Uh-oh.']]
        },
      ] },
    ],
  },
  mm_gem_intro: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 296, 492], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_b5',
          cast: [{ c: 'dodongo', a: 'idle', x: 178, y: 383, h: 344 }],
          say: [[0, 'They keep getting\nback UP!'], [0, 'This is all\nMY fault!']]
        },
        { r: [332, 24, 296, 492], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_b6',
          cast: [{ c: 'ana', a: 'idle', x: 131, y: 841, h: 738 }],
          say: [[0, 'Then help me fix it!\nLook... strings!\nThey all go to the GEM!']]
        },
        { r: [640, 24, 296, 492], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_launch',
          cast: [{ c: 'ana', a: 'idle', x: 181, y: 176, h: 148 }, { c: 'dodongo', a: 'idle', x: 89, y: 513, h: 198 }],
          say: [[0, 'Dodongo...\nSHIELD!']]
        },
      ] },
    ],
  },
  mm_gem_cut: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 300, 250], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_shatter',
          cast: [{ c: 'ana', a: 'idle', x: 108, y: 384, h: 324 }],
          say: [[0, 'Lights OUT!']]
        },
        { r: [340, 24, 596, 250], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_collapse',
          cast: [],
          say: [[-2, 'CLATTER!']]
        },
        { r: [24, 290, 450, 226], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_bestidea',
          cast: [{ c: 'dodongo', a: 'idle', x: 122, y: 116, h: 47 }, { c: 'ana', a: 'idle', x: 324, y: 209, h: 160 }],
          say: [[0, 'Too easy!'], [1, 'You WOKE THEM UP!'], [0, '...and\nTHEN it\nwas too\neasy.']]
        },
        { r: [490, 290, 446, 226], bg: { lvl: 'mm_hall', zoom: 1, ox: 0, oy: 0 }, book: 'c5_mor_cut',
          cast: [{ c: 'morvath', a: 'idle', x: 119, y: 206, h: 181 }],
          cap: 'Meanwhile, in the tower...',
          say: [[0, 'Somebody broke my GEM?!']]
        },
      ] },
    ],
  },
  mm_summit_intro: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_open',
          cast: [],
          cap: 'At last... the summit of Mystic Mountain.'
        },
        { r: [24, 290, 296, 226], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_noplan',
          cast: [{ c: 'ana', a: 'idle', x: 142, y: 226, h: 50 }, { c: 'ana', a: 'idle', x: 154, y: 163, h: 50 }, { c: 'ana', a: 'idle', x: 230, y: 180, h: 50 }],
          say: [[0, 'I don\'t\nhave a\nplan for\nthis one.']]
        },
        { r: [332, 290, 296, 226], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_together',
          cast: [{ c: 'dodongo', a: 'idle', x: 172, y: 300, h: 265 }],
          say: [[0, 'Then we\nmake one up.\nTOGETHER.']]
        },
        { r: [640, 290, 296, 226], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_hands',
          cast: []
        },
      ] },
    ],
  },
  mm_morvath: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 131], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_hook',
          cast: [{ c: 'morvath', a: 'idle', x: 930, y: 252, h: 286 }, { c: 'ana', a: 'idle', x: 310, y: 241, h: 191 }, { c: 'dodongo', a: 'idle', x: 465, y: 199, h: 191 }, { c: 'shadow', a: 'idle', x: 638, y: 196, h: 172 }],
          say: [[0, 'THERE you are.']]
        },
        { r: [24, 171, 912, 345], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_mor',
          cast: [{ c: 'morvath', a: 'idle', x: 666, y: 412, h: 412 }, { c: 'ana', a: 'idle', x: 119, y: 476, h: 235 }, { c: 'dodongo', a: 'idle', x: 223, y: 459, h: 206 }, { c: 'shadow', a: 'idle', x: 328, y: 429, h: 147 }],
          say: [[0, 'So YOU\'RE the pests\nwho broke my gem.'], [0, 'Who said you could\nclimb MY mountain?'], [1, 'Nobody. We just\nCLIMBED it.'], [0, 'HA! Then you can\nclimb right back DOWN!']]
        },
      ] },
    ],
  },
  mm_dragon: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 260, 492], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_chains',
          cast: [{ c: 'dodongo', a: 'idle', x: 133, y: 370, h: 280 }, { c: 'ana', a: 'idle', x: -26, y: 710, h: 218 }],
          say: [[0, 'Leave my friends\nALONE!'], [1, 'DODONGO!']]
        },
        { r: [300, 24, 636, 236], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_t1',
          cast: [{ c: 'dodongo', a: 'idle', x: 260, y: 450, h: 452 }],
          say: [[0, 'Granny said never\nget TOO mad...']]
        },
        { r: [300, 276, 316, 240], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_t2',
          cast: [{ c: 'dodongo', a: 'idle', x: 158, y: 314, h: 276 }],
          say: [[0, '...but you hurt\nmy FRIENDS.']]
        },
        { r: [632, 276, 304, 240], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_t3',
          cast: [{ c: 'morvath', a: 'idle', x: 161, y: 267, h: 233 }],
          say: [[0, 'What...?']]
        },
      ] },
      { panels: [
        { r: [24, 24, 300, 492], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_t4',
          cast: [],
          say: [[-2, 'RRRAAAAHH!']]
        },
        { r: [340, 24, 596, 300], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_dragon',
          cast: [],
          say: [[-2, 'ROOOOAAARR!']]
        },
        { r: [340, 340, 200, 176], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_uhoh',
          cast: [{ c: 'morvath', a: 'idle', x: 98, y: 246, h: 207 }],
          say: [[0, '...Uh-oh.']]
        },
        { r: [556, 340, 380, 176], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_plan',
          cast: [{ c: 'ana', a: 'idle', x: 103, y: 237, h: 214 }],
          say: [[0, 'The storm comes out\nof his STAFF!'], [0, 'Break the staff...\nbreak the storm!']]
        },
      ] },
    ],
  },
  mm_summit_end: {
    music: 'story', pages: [
      { panels: [
        { r: [24, 24, 912, 236], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_steal',
          cast: [{ c: 'morvath', a: 'idle', x: 365, y: 301, h: 229 }, { c: 'morvath', a: 'idle', x: 155, y: 282, h: 286 }, { c: 'shadow', a: 'idle', x: 657, y: 225, h: 191 }],
          say: [[0, 'Hey! GIVE THAT\nBACK!']]
        },
        { r: [24, 276, 450, 240], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_fire',
          cast: [{ c: 'ana', a: 'idle', x: 108, y: 499, h: 394 }, { c: 'dodongo_dragon', a: 'idle', x: 324, y: 201, h: 176 }],
          say: [[0, 'NOW, Dodongo!']]
        },
        { r: [490, 276, 446, 240], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_shrink',
          cast: [{ c: 'crow', a: 'idle', x: 214, y: 268, h: 234 }],
          cap: 'Without his staff, Morvath was just a very GRUMPY little crow.',
          say: [[0, 'CAW?!']]
        },
      ] },
      { panels: [
        { r: [24, 24, 450, 492], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_collapse',
          cast: [],
          say: [[-2, 'RUMMMBLE...']]
        },
        { r: [490, 24, 446, 492], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c6_relief',
          cast: [{ c: 'ana', a: 'idle', x: 144, y: 576, h: 492 }, { c: 'dodongo_dragon', a: 'idle', x: 349, y: 349, h: 246 }, { c: 'shadow', a: 'idle', x: 515, y: 383, h: 221 }],
          say: [[0, 'You\'re a DRAGON?!'], [1, 'A little bit!'], [1, '...Okay, a LOT.']]
        },
      ] },
      { panels: [
        { r: [24, 24, 912, 492], bg: { lvl: 'mm_summit', zoom: 1, ox: 0, oy: 0 }, book: 'c7_ride',
          cast: [{ c: 'ana', a: 'idle', x: 198, y: 433, h: 295 }, { c: 'dodongo_dragon', a: 'idle', x: 358, y: 542, h: 395 }, { c: 'shadow', a: 'idle', x: 594, y: 246, h: 172 }, { c: 'dodongo_dragon', a: 'idle', x: 438, y: 266, h: 50 }],
          say: [[0, 'Can you change\nback?'], [1, 'Probably! ...Want a\nride first?']]
        },
      ] },
    ],
  },
  mm_dawn: {
    music: 'ending', pages: [
      { panels: [
        { r: [24, 24, 450, 492], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_land',
          cast: [{ c: 'dodongo_dragon', a: 'idle', x: 171, y: 413, h: 369 }, { c: 'villager', a: 'idle', x: -4, y: 602, h: 248 }],
          say: [[1, 'DRAGON!']]
        },
        { r: [490, 24, 446, 238], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_poof',
          cast: [],
          say: [[-2, 'POOF!']]
        },
        { r: [490, 278, 446, 238], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_granny',
          cast: [{ c: 'ana', a: 'idle', x: 100, y: 325, h: 295 }, { c: 'dodongo', a: 'idle', x: 312, y: 211, h: 166 }, { c: 'ana', a: 'idle', x: 116, y: 129, h: 50 }],
          say: [[0, 'So... you got\nREALLY mad up\nthere.'], [1, 'Rule is...\nnever get\nTOO mad.']]
        },
      ] },
      { panels: [
        { r: [24, 24, 450, 492], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_hug',
          cast: [{ c: 'dodongo', a: 'idle', x: 214, y: 433, h: 295 }, { c: 'ana', a: 'idle', x: 57, y: 433, h: 295 }, { c: 'shadow', a: 'idle', x: 393, y: 369, h: 246 }],
          say: [[0, '...Unless it\'s for\nyour FRIENDS.']]
        },
        { r: [490, 24, 446, 238], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_ask',
          cast: [{ c: 'villageboy', a: 'idle', x: 199, y: 236, h: 131 }, { c: 'dodongo', a: 'idle', x: 291, y: 209, h: 145 }, { c: 'shadow', a: 'idle', x: 100, y: 140, h: 119 }, { c: 'ana', a: 'idle', x: 494, y: 145, h: 107 }, { c: 'villageboy', a: 'idle', x: 183, y: 171, h: 50 }],
          say: [[0, 'Was it\nscary?'], [1, 'Don\'t bother. He\nnever talks.']]
        },
        { r: [490, 278, 446, 238], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_line',
          cast: [{ c: 'shadow', a: 'idle', x: 155, y: 138, h: 107 }, { c: 'villageboy', a: 'idle', x: 306, y: 190, h: 119 }],
          say: [[0, '...Too easy.']]
        },
      ] },
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_gasp',
          cast: [{ c: 'ana', a: 'idle', x: 237, y: 317, h: 307 }, { c: 'dodongo', a: 'idle', x: 465, y: 244, h: 192 }, { c: 'villager', a: 'idle', x: 730, y: 221, h: 192 }],
          say: [[1, 'HE TALKS?!']]
        },
        { r: [24, 290, 296, 226], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_dots',
          cast: [{ c: 'shadow', a: 'idle', x: 148, y: 264, h: 202 }],
          say: [[0, '...']]
        },
        { r: [336, 290, 600, 226], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_party',
          cast: [],
          cap: 'That evening...'
        },
      ] },
      { panels: [
        { r: [24, 24, 450, 492], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_end',
          cast: [],
          cap: 'The whole valley was loud and bright and happy again.'
        },
        { r: [490, 24, 446, 492], bg: { lvl: 'mm_dawn', zoom: 1, ox: 0, oy: 0 }, book: 'c7_tease',
          cast: [],
          cap: 'Well... ALMOST everyone.'
        },
      ] },
    ],
  },
  mm_epilogue: {
    music: 'ending', pages: [
      { panels: [
        { r: [24, 24, 912, 250], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'e_morning',
          cast: [],
          cap: 'One of Three'
        },
        { r: [24, 290, 450, 226], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'e_elder',
          cast: [{ c: 'elder', a: 'idle', x: 225, y: 281, h: 205 }],
          say: [[0, 'Young heroes... the\nwhole valley thanks\nyou.']]
        },
        { r: [490, 290, 446, 226], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'e_kids',
          cast: [{ c: 'dodongo', a: 'idle', x: 138, y: 270, h: 216 }, { c: 'ana', a: 'idle', x: 294, y: 349, h: 216 }, { c: 'shadow', a: 'idle', x: 330, y: 133, h: 138 }],
          say: [[0, 'Aw, it was\nnothing!']]
        },
      ] },
      { panels: [
        { r: [24, 24, 450, 238], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'e_serious',
          cast: [{ c: 'elder', a: 'idle', x: 291, y: 386, h: 300 }, { c: 'elder', a: 'idle', x: 248, y: 160, h: 50 }],
          say: [[0, 'But Morvath\nwas only\nONE...\nof three.']]
        },
        { r: [490, 24, 446, 238], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'e_shock',
          cast: [{ c: 'dodongo', a: 'idle', x: 219, y: 276, h: 218 }, { c: 'ana', a: 'idle', x: 80, y: 293, h: 218 }, { c: 'shadow', a: 'idle', x: 366, y: 221, h: 160 }],
          say: [[0, 'THREE?!']]
        },
        { r: [24, 278, 912, 238], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'e_chart',
          cast: [{ c: 'elder', a: 'idle', x: 137, y: 169, h: 250 }, { c: 'ana', a: 'idle', x: 410, y: 202, h: 208 }, { c: 'dodongo', a: 'idle', x: 565, y: 190, h: 208 }, { c: 'shadow', a: 'idle', x: 748, y: 157, h: 167 }],
          say: [[0, 'The second is gathering\npower... on SKULL\nISLAND.']]
        },
      ] },
      { panels: [
        { r: [24, 24, 912, 492], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'e_island',
          cast: [{ c: 'ana', a: 'idle', x: 155, y: 642, h: 540 }, { c: 'dodongo', a: 'idle', x: 420, y: 419, h: 288 }, { c: 'shadow', a: 'idle', x: 565, y: 412, h: 288 }],
          say: [[0, 'Then that\'s where\nwe\'re going NEXT.'], [1, 'I\'m packing FIVE\nbags of snacks.'], [-2, 'TO BE CONTINUED...']]
        },
      ] },
      { panels: [
        { r: [24, 24, 912, 492], bg: { lvl: 'mm_valley', zoom: 1, ox: 0, oy: 0 }, book: 'back',
          cast: [{ c: 'ana', a: 'idle', x: 383, y: 647, h: 590 }, { c: 'shadow', a: 'idle', x: 465, y: 576, h: 472 }, { c: 'dodongo_dragon', a: 'idle', x: 602, y: 671, h: 472 }],
          cap: SI_ENABLED ? 'More adventures await... Play SKULL ISLAND (Book 2)!' : 'More adventures await... Play DODONGO\'S QUEST (Book 3)!'   // (Book Two's name only once it ships: src/sienabled.js)
        },
      ] },
    ],
  },
};

// Book Two's cutscenes (src/sistory.js): the same shape, the same rules
Object.assign(CUTSCENES, SI_CUTSCENES);

// (docs/SECRETS_SCRIPT.md) shown under the ending's last page when meta.shards.size < 3 or meta.dragons.size < 8
export const QUEEN_TEASER = {
  line: 'Star Shards {s}/3 - Baby dragons {d}/8: the Queen still sleeps...',
  // a second, smaller line, by what's missing
  shards: 'Psst! See a twinkle somewhere odd? Give it a WHACK!',
  dragons: 'Some baby dragons are still waiting to be set free...',
  both: 'Find every shard and free every baby dragon... and someone special might wake up.',
};
