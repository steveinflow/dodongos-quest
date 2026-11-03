// The playable heroes: stats, frame data (60 fps), projectiles and ultimates.
// Hit boxes are in front of the hero (x along facing, z height above his feet).  Each attack entry:
//   dur (frames), a0..a1 (active frames), next (earliest frame to chain the next combo hit), box, dmg,
//   kind 'light' | 'knock', push, lift, stun, stop (hitstop), sfx (swing), hit (impact sound), word, step, ember (meter gain)

export const HEROES = {
  dodongo: {
    id: 'dodongo', name: 'DODONGO', art: 'dodongo', portrait: 'assets/art/portrait_dod.png', accent: '#ff8a2a',
    blurb: 'Brave, funny, secretly a dragon. A spiked club, a sturdy shield and a fiery breath.',
    hp: 100, walk: [2.7, 1.9], run: [5.6, 1.5], jumpV: 10.8, hurtW: 22, hurtH: 128, balloonH: 182,
    atk: {
      atk1: { dur: 16, a0: 4, a1: 8, next: 8, box: { x0: 6, x1: 86, z0: 34, z1: 128 }, dmg: 6, kind: 'light', push: 1.4, stun: 17, stop: 4, sfx: 'swing_light', hit: 'hit_light', ember: 8 },
      atk2: { dur: 18, a0: 6, a1: 10, next: 10, box: { x0: -4, x1: 88, z0: 46, z1: 168 }, dmg: 7, kind: 'light', push: 1.6, stun: 18, stop: 4, sfx: 'swing_light', hit: 'hit_light', ember: 8 },
      atk3: { dur: 20, a0: 6, a1: 11, next: 11, box: { x0: 6, x1: 80, z0: 14, z1: 122 }, dmg: 9, kind: 'light', push: 5, stun: 22, stop: 6, sfx: 'swing_heavy', hit: 'shield_bash', word: 'light', step: 1.6, ember: 10 },
      atk4: { dur: 34, a0: 14, a1: 19, next: 99, box: { x0: -6, x1: 96, z0: -10, z1: 132 }, dmg: 14, kind: 'knock', push: 6.5, lift: 6.5, stop: 9, sfx: 'swing_heavy', hit: 'hit_finisher', word: 'heavy', shake: 7, step: 1.3, thrown: true, ember: 14, shine: true },   // (shine: LIGHT, his glowing arm -- src/mmworld.js isLight)
      airAtk: { unblockable: true, box: { x0: -6, x1: 78, z0: -46, z1: 100 }, dmg: 12, kind: 'knock', push: 5, lift: 5, stop: 7, sfx: 'swing_heavy', hit: 'hit_heavy', word: 'heavy', shake: 4, ember: 12 },
      runAtk: { unblockable: true, dur: 30, a0: 2, a1: 18, dash: 7.2, box: { x0: -4, x1: 58, z0: 8, z1: 126 }, dmg: 12, kind: 'knock', push: 6, lift: 5.5, stop: 7, sfx: 'shield_bash', hit: 'hit_heavy', word: 'heavy', shake: 5, thrown: true, ember: 12 },
    },
    // (no cooldown: the shoot state's dur is the fire rate.  dmg: what ONE target takes ~0.8 of the melee combo's DPS, no
    //  hit above the atk4 finisher; ember (+ splashEmber / lastEmber): one target's meter ~0.8 of melee's -- tools/tune_proj.mjs)
    shoot: { kind: 'fireball', name: 'FIREBALL', dur: 26, release: 0.42, cooldown: 0, sfx: 'fireball_breath',
      dmg: 9, splash: 4, speed: 7.6, ember: 9, splashEmber: 4 },   // (the splash only hits the others round the target)
    special: { kind: 'flare', name: 'DRAGON FLARE', dur: 56, key: 0.52, sfx: 'special' },
  },

  ana: {
    id: 'ana', name: 'ANASTASIA', art: 'ana', portrait: 'assets/art/portrait_ana.png', accent: '#5ad0ff',
    blurb: 'The planner. A crystal staff, clever magic and a beam that hits everything in a line.',
    hp: 90, walk: [2.55, 1.8], run: [5.3, 1.45], jumpV: 10.6, hurtW: 21, hurtH: 132, balloonH: 204,
    atk: {
      atk1: { dur: 18, a0: 5, a1: 9, next: 9, box: { x0: 8, x1: 98, z0: 40, z1: 140 }, dmg: 7, kind: 'light', push: 1.4, stun: 17, stop: 4, sfx: 'staff_swing', hit: 'hit_light', ember: 8 },
      atk2: { dur: 20, a0: 6, a1: 10, next: 10, box: { x0: 0, x1: 96, z0: 30, z1: 150 }, dmg: 7, kind: 'light', push: 1.6, stun: 18, stop: 4, sfx: 'staff_swing', hit: 'hit_light', ember: 8 },
      atk3: { dur: 22, a0: 7, a1: 12, next: 12, box: { x0: 10, x1: 128, z0: 8, z1: 110 }, dmg: 8, kind: 'light', push: 4, stun: 22, stop: 6, sfx: 'swing_heavy', hit: 'hit_heavy', word: 'light', spark: 'cool', burst: true, ember: 10 },
      atk4: { dur: 36, a0: 19, a1: 24, next: 99, box: { x0: -24, x1: 110, z0: -10, z1: 130 }, dmg: 15, kind: 'knock', push: 6.5, lift: 6.5, stop: 9, sfx: 'swing_heavy', hit: 'hit_finisher', word: 'heavy', shake: 7, thrown: true, spark: 'cool', shock: true, ember: 14, shine: true },   // (shine: LIGHT, her crystal's burst)
      airAtk: { unblockable: true, box: { x0: -6, x1: 84, z0: -50, z1: 90 }, dmg: 11, kind: 'knock', push: 5, lift: 5, stop: 7, sfx: 'staff_swing', hit: 'hit_heavy', word: 'heavy', shake: 4, spark: 'cool', ember: 12 },
      runAtk: { unblockable: true, dur: 30, a0: 3, a1: 18, dash: 7, box: { x0: 0, x1: 72, z0: 0, z1: 100 }, dmg: 11, kind: 'knock', push: 6, lift: 5, stop: 7, sfx: 'swing_heavy', hit: 'hit_heavy', word: 'heavy', shake: 5, thrown: true, ember: 12 },
    },
    // (one sound a beam: crystal_beam from the wind-up, held 0.55 s past its chime -- to the beam's end -- then fading; the
    //  last tick: crystal_ting, src/projectiles.js Beam)
    shoot: { kind: 'beam', name: 'CRYSTAL BEAM', dur: 64, release: 0.40, end: 0.88, cooldown: 0, sfx: 'crystal_beam', sfxHold: 0.55, fire: null,
      dmg: 5, tick: 10, width: 28, ember: 6, lastEmber: 9 },   // (ticks 5, 5, then 10: it knocks the target out)
    special: { kind: 'starfall', name: 'STARFALL', dur: 72, key: 0.35, until: 0.9, sfx: 'starfall' },
  },

  shadow: {
    id: 'shadow', name: 'SHADOW', art: 'shadow', portrait: 'assets/art/portrait_sha.png', accent: '#c04ad8',
    blurb: 'Silent and lightning fast. A short sword, flying kicks and a fan of shurikens.',
    hp: 85, walk: [3.0, 2.1], run: [6.2, 1.7], jumpV: 11.6, hurtW: 21, hurtH: 126, balloonH: 180,
    atk: {
      atk1: { dur: 12, a0: 3, a1: 6, next: 6, box: { x0: 6, x1: 84, z0: 40, z1: 130 }, dmg: 4, kind: 'light', push: 1.0, stun: 15, stop: 3, sfx: 'sword_slash', hit: 'hit_light', ember: 7 },
      atk2: { dur: 13, a0: 3, a1: 6, next: 6, box: { x0: 0, x1: 84, z0: 30, z1: 140 }, dmg: 4, kind: 'light', push: 1.0, stun: 15, stop: 3, sfx: 'sword_slash', hit: 'hit_light', ember: 7 },
      atk3: { dur: 14, a0: 4, a1: 7, next: 7, box: { x0: 6, x1: 86, z0: 30, z1: 130 }, dmg: 5, kind: 'light', push: 2, stun: 17, stop: 4, sfx: 'sword_slash', hit: 'hit_light', word: 'light', ember: 8 },
      atk4: { dur: 26, a0: 10, a1: 15, next: 99, box: { x0: -34, x1: 92, z0: 10, z1: 140 }, dmg: 12, kind: 'knock', push: 6.5, lift: 6, stop: 8, sfx: 'swing_heavy', hit: 'hit_finisher', word: 'heavy', shake: 6, thrown: true, ember: 14 },
      airAtk: { unblockable: true, box: { x0: 0, x1: 72, z0: -54, z1: 70 }, dmg: 10, kind: 'knock', push: 5, lift: 5, stop: 6, sfx: 'swing_heavy', hit: 'hit_heavy', word: 'heavy', shake: 4, dive: true, ember: 12 },
      runAtk: { unblockable: true, dur: 24, a0: 2, a1: 14, dash: 9.5, box: { x0: -10, x1: 72, z0: 10, z1: 120 }, dmg: 10, kind: 'knock', push: 6, lift: 5, stop: 6, sfx: 'sword_slash', hit: 'hit_heavy', word: 'heavy', shake: 4, thrown: true, pass: true, ember: 12 },
    },
    // (one shuriken per target per volley: the fan is a crowd tool, never 3x on one -- src/projectiles.js Shuriken)
    shoot: { kind: 'shuriken', name: 'SHURIKENS', dur: 20, release: 0.35, cooldown: 0, sfx: 'shuriken', dmg: 6, speed: 11, count: 3, ember: 9 },
    special: { kind: 'strike', name: 'SHADOW STRIKE', dur: 64, key: 0.15, until: 0.8, sfx: 'shadow_strike' },
  },
};

// Scarlet: book two's teen pirate captain (she has a crystal shard from Ana too).
HEROES.scarlet = {
  id: 'scarlet', name: 'SCARLET', art: 'scarlet', portrait: 'assets/art/portrait_sca.png', accent: '#e8333f',
  blurb: 'Pirate captain! A flashing cutlass and a hook that reels bad guys in.',
  hp: 95, walk: [2.8, 2.0], run: [5.8, 1.6], jumpV: 11.0, hurtW: 22, hurtH: 150, balloonH: 214,
  atk: {
    // cutlass: quick forehand, backhand, a lunging thrust, then a rising spin slash that launches
    atk1: { dur: 14, a0: 4, a1: 7, next: 7, box: { x0: 6, x1: 100, z0: 50, z1: 160 }, dmg: 5, kind: 'light', push: 1.2, stun: 16, stop: 3, sfx: 'sword_slash', hit: 'hit_light', ember: 7 },
    atk2: { dur: 15, a0: 4, a1: 7, next: 7, box: { x0: 0, x1: 100, z0: 40, z1: 160 }, dmg: 5, kind: 'light', push: 1.2, stun: 16, stop: 3, sfx: 'sword_slash', hit: 'hit_light', ember: 7 },
    atk3: { dur: 18, a0: 6, a1: 10, next: 10, box: { x0: 10, x1: 124, z0: 50, z1: 130 }, dmg: 6, kind: 'light', push: 2.4, stun: 18, stop: 4, sfx: 'sword_slash', hit: 'hit_light', word: 'light', step: 1.2, ember: 8 },
    atk4: { dur: 28, a0: 11, a1: 16, next: 99, box: { x0: -30, x1: 104, z0: 10, z1: 170 }, dmg: 13, kind: 'knock', push: 6.5, lift: 7, stop: 8, sfx: 'swing_heavy', hit: 'hit_finisher', word: 'heavy', shake: 6, thrown: true, ember: 14 },
    airAtk: { unblockable: true, box: { x0: -4, x1: 86, z0: -50, z1: 110 }, dmg: 11, kind: 'knock', push: 5, lift: 5, stop: 7, sfx: 'swing_heavy', hit: 'hit_heavy', word: 'heavy', shake: 4, ember: 12 },
    runAtk: { unblockable: true, dur: 26, a0: 3, a1: 15, dash: 8, box: { x0: -6, x1: 80, z0: 10, z1: 150 }, dmg: 11, kind: 'knock', push: 6, lift: 5, stop: 7, sfx: 'swing_heavy', hit: 'hit_heavy', word: 'heavy', shake: 5, thrown: true, ember: 12 },
  },
  // the hook flies out, snags the first bad guy and reels him in (bosses and heavies just take the hit)
  shoot: { kind: 'hook', name: 'GRAPPLING HOOK', dur: 28, release: 0.3, cooldown: 0, sfx: 'throw', dmg: 9, speed: 14, range: 380, ember: 11 },
  special: { kind: 'cyclone', name: 'CRIMSON CYCLONE', dur: 76, key: 0.18, until: 0.84, sfx: 'swing_heavy' },
};

// DRAGON DODONGO (docs/SECRETS.md): the true ending's reward -- the dragon in Dodongo's heart, a fifth hero once
// unlocked (src/secrets.js progress().dragonDodongo; ?unlock=1).  The duel's dragon art (src/chars/dragon_hero.js maps
// its play pack onto the hero poses): he hovers and never jumps (dragon: true), bites with puffs of fire, breathes
// fireballs, his charged shot is a flame stream (src/flamestream.js), his roll is his dodge.  He IS Dodongo: picking one
// locks the other (sameBoy).
HEROES.dragon = {
  id: 'dragon', name: 'DRAGON DODONGO', art: 'dragon_hero', portrait: null, accent: '#ff7a2a', dragon: true, boy: 'dodongo', base: 'dodongo',
  blurb: 'The dragon in his heart! Flies, bites with fire and breathes fireballs. No jumping: he hovers.',
  hp: 120, walk: [2.9, 2.0], run: [5.4, 1.7], jumpV: 0, hurtW: 34, hurtH: 118, balloonH: 216,   // (balloonH: over his drawing at src/chars/dragon_hero.js SCALE 0.85, its top 188 px up; the boxes as at 0.6)
  atk: {
    atk1: { dur: 18, a0: 5, a1: 9, next: 9, box: { x0: 10, x1: 104, z0: 30, z1: 130 }, dmg: 7, kind: 'light', push: 1.6, stun: 17, stop: 4, sfx: 'swing_light', hit: 'hit_light', ember: 8, puff: 1 },
    atk2: { dur: 18, a0: 5, a1: 9, next: 9, box: { x0: 10, x1: 104, z0: 30, z1: 130 }, dmg: 7, kind: 'light', push: 1.6, stun: 18, stop: 4, sfx: 'swing_light', hit: 'hit_light', ember: 8, puff: 1 },
    atk3: { dur: 20, a0: 6, a1: 11, next: 11, box: { x0: 6, x1: 112, z0: 20, z1: 130 }, dmg: 9, kind: 'light', push: 4.5, stun: 22, stop: 6, sfx: 'fireball_breath', hit: 'hit_heavy', word: 'light', ember: 10, puff: 2 },
    atk4: { dur: 32, a0: 12, a1: 18, next: 99, box: { x0: 0, x1: 128, z0: 10, z1: 140 }, dmg: 14, kind: 'knock', push: 6.5, lift: 6.5, stop: 9, sfx: 'fire_breath', hit: 'hit_finisher', word: 'heavy', shake: 7, thrown: true, ember: 14, puff: 3 },
    airAtk: { unblockable: true, box: { x0: 0, x1: 100, z0: -20, z1: 120 }, dmg: 10, kind: 'knock', push: 5, lift: 5, stop: 7, sfx: 'swing_heavy', hit: 'hit_heavy', word: 'heavy', ember: 10 },
    runAtk: { unblockable: true, dur: 26, a0: 2, a1: 16, dash: 7.6, box: { x0: -10, x1: 70, z0: 10, z1: 120 }, dmg: 12, kind: 'knock', push: 6, lift: 5.5, stop: 7, sfx: 'dodge', hit: 'hit_heavy', word: 'heavy', shake: 5, thrown: true, ember: 12 },
  },
  shoot: { kind: 'fireball', name: 'FIREBALL', dur: 26, release: 0.42, cooldown: 0, sfx: 'fireball_breath', dmg: 9, splash: 4, speed: 7.6, ember: 9, splashEmber: 4 },
  special: { kind: 'flare', name: 'DRAGON INFERNO', dur: 56, key: 0.52, sfx: 'special' },
};

// ------------------------------------------------------------------------------------------------ the secret FORMS
// Each hero's card holds forms (the select screen's ▲▼ FORM, src/main.js): the hero, and once unlocked (src/secrets.js
// progress()) a secret form -- the same person (sameBoy: one form of a card in play takes the whole card), drawn as
// that hero in the story.  The forms' own mechanics and auras: src/forms.js (hero.form).
const clone = (o) => JSON.parse(JSON.stringify(o));
/** the frame data of a swing sped up k x (Legend Shadow) */
const quick = (A, k) => ({ ...A, dur: Math.max(4, Math.round(A.dur / k)), a0: Math.max(1, Math.round(A.a0 / k)), a1: Math.max(2, Math.round(A.a1 / k)), next: A.next >= 99 ? 99 : Math.max(2, Math.round(A.next / k)) });

// ARCHMAGE ANASTASIA (unlock: all three Star Shards): her crystal powered up -- every swing of the combo also fires a
// magic blast ahead (atk1-3 a star bolt that pierces one foe, atk4 a big crystal burst; ~1.5x the swing's damage), a
// wider, stronger beam (1.6x), GRAND CRYSTAL NOVA (two rings) and STARFALL+ (more stars).  A golden-white aura.
HEROES.archmage = (() => {
  const A = clone(HEROES.ana);
  return {
    ...A, id: 'archmage', base: 'ana', form: 'archmage', name: 'ARCHMAGE ANASTASIA', art: 'ana_archmage', accent: '#ffd86a',
    blurb: 'Her crystal powered up! Every swing fires a magic blast. A huge beam and a GRAND nova.',
    hp: 100,
    atk: {
      ...A.atk,
      atk1: { ...A.atk.atk1, blast: { kind: 'bolt', dmg: 10, pierce: 1 } },
      atk2: { ...A.atk.atk2, blast: { kind: 'bolt', dmg: 10, pierce: 1 } },
      atk3: { ...A.atk.atk3, blast: { kind: 'bolt', dmg: 12, pierce: 1 } },
      atk4: { ...A.atk.atk4, blast: { kind: 'burst', dmg: 22 } },
    },
    shoot: { ...A.shoot, name: 'GRAND BEAM', dmg: 8, bossDmg: 5, width: 44, ember: 6, lastEmber: 9, grand: true },
    special: { ...A.special, name: 'STARFALL+', plus: true },
    charged: { name: 'GRAND CRYSTAL NOVA', rings: 2 },
  };
})();

// LEGEND SHADOW (unlock: 3 different bosses beaten with Shadow in the party): super speed (1.6x moves, 1.35x quicker swings), every melee hit
// also sends a slash wave the width of the screen down his lane, SHOOT held fires single shurikens every 8 frames (a tap
// still throws the fan; no charge for him), and a dodge leaves an exploding straw DUMMY behind.  Midnight-and-gold
// speed trails.
HEROES.legend = (() => {
  const S = clone(HEROES.shadow), k = 1.35;
  const atk = {};
  for (const [n, a] of Object.entries(S.atk)) atk[n] = a.dur ? quick(a, k) : { ...a };
  atk.runAtk.dash = +(atk.runAtk.dash * k).toFixed(2);   // (the quicker dash goes as far)
  for (const n of ['atk1', 'atk2', 'atk3', 'atk4']) atk[n].wave = true;
  return {
    ...S, id: 'legend', base: 'shadow', form: 'legend', name: 'LEGEND SHADOW', art: 'shadow_legend', accent: '#ffcf4a',
    blurb: 'Super speed! Slashes that cross the whole screen, rapid shurikens and an exploding decoy.',
    walk: S.walk.map((v) => +(v * 1.6).toFixed(2)), run: S.run.map((v) => +(v * 1.6).toFixed(2)),
    atk,
    shoot: { ...S.shoot, name: 'RAPID SHURIKENS', auto: { every: 12, dmg: 4, bossDmg: 2, speed: 12 } },
    special: { ...S.special, name: 'LEGEND STRIKE' },
    decoy: { life: 60, r: 300, boom: { rx: 130, ry: 50, dmg: 24 } },
  };
})();

// PIRATE QUEEN SCARLET (unlock: 12 treasure chests opened in all): her finisher also fires a flintlock blast, the
// GOLDEN HOOK (1.5x range, reels in up to three), CANNON VOLLEY (her charged spell), BROADSIDE (her super: a ship
// across the background firing on every foe on screen), a parrot that pecks, and a smoke puff on her roll.
HEROES.pirate = (() => {
  const S = clone(HEROES.scarlet);
  return {
    ...S, id: 'pirate', base: 'scarlet', form: 'pirate', name: 'PIRATE QUEEN SCARLET', art: 'scarlet_pirate', accent: '#ffc23a',
    blurb: 'Captain of the seven seas! A flintlock, a golden hook, cannon volleys and a parrot.',
    hp: 105,
    atk: { ...S.atk, atk4: { ...S.atk.atk4, flintlock: { dmg: 21, len: 190 } } },
    shoot: { ...S.shoot, name: 'GOLDEN HOOK', range: Math.round(S.shoot.range * 1.5), golden: true, reel: 3 },
    special: { kind: 'broadside', name: 'BROADSIDE', dur: 92, key: 0.22, until: 0.8, sfx: 'swing_heavy' },
    charged: { name: 'CANNON VOLLEY' },
    parrot: { every: 120, r: 220, dmg: 3 }, smoke: { r: 90, stun: 30 },
  };
})();

export const HERO_IDS = ['dodongo', 'ana', 'shadow', 'scarlet'];
/** each hero's card: the hero, then the secret forms (src/secrets.js unlocks them) */
export const FORMS = { dodongo: ['dodongo', 'dragon'], ana: ['ana', 'archmage'], shadow: ['shadow', 'legend'], scarlet: ['scarlet', 'pirate'] };
/** the hero a form is a form of (a base hero: itself) */
export const baseOf = (id) => HEROES[id]?.base || id;
/** the same person (a hero and her forms): either one in play takes the whole card */
export const sameBoy = (a, b) => baseOf(a) === baseOf(b);
/** the heroes these take out of the pickers (a hero in play, and every form of its card) */
export function blockedBy(ids) { const s = new Set(); for (const id of ids) for (const f of FORMS[baseOf(id)] || [id]) s.add(f); return [...s]; }
/** the hero a cutscene draws for a form (story pages show the base hero) */
export const storyHero = (id) => baseOf(id);
export const COMBO = ['atk1', 'atk2', 'atk3', 'atk4'];
