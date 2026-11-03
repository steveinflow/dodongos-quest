// Registry of character art modules (src/chars/*.js), loaded once at boot.  Missing modules get stand-ins.
import { INK, ART } from './config.js';
import { TAU } from './rig.js';

export const CHARS = {};
export const CHAR_NAMES = ['dodongo', 'ana', 'shadow', 'scarlet', 'kobold', 'brute', 'whelp', 'grimscale', 'salamander', 'magmaw',
  'wyvern', 'tempest', 'guard', 'dragonking',
  // the finale (docs/FINALE.md): Dodongo's dragon form and the Dread King (placeholder rigs until their atlases exist)
  'dodongo_dragon', 'dragonking_dread'];

function stub(name) {
  return {
    stub: true, ANIM: {},
    draw(ctx, pose, o) {
      ctx.save(); ctx.scale((o.facing || 1) * (o.scale || 1), o.scale || 1);
      ctx.fillStyle = '#7a6a8a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, -60, 26, 60, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(name, 0, -60);
      ctx.restore();
    },
  };
}

// ?art3d=1: 3D-rendered sprite art (src/chars/<name>3d.js on src/sprite3d.js; tools/sprite3d, docs/SPRITE3D.md) for
// the characters listed here; everyone else keeps the code rig.
export const ART3D_NAMES = ['dodongo', 'ana', 'scarlet'];
const ART3D = ART.on;                    // (src/config.js ART: ?art3d, or the default art switch)
// ?art3d=<look>&a3d=shadow,kobold: test hook (tools/sprite3d look captures) -- these characters also use their 3D module
// for this session, before they are listed above.
const A3D_EXTRA = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('a3d') || '').split(',').filter(Boolean) : [];
// ?rig2=1: Dodongo's improved 2D painted cut-out rig (src/chars/dodongo2d.js); ?art3d wins if both are given.
const RIG2 = ART.rig2;

// Mystic Mountain's own characters (docs/MYSTIC_MOUNTAIN.md): code rigs (src/chars/<n>.js), each drawn until its painted
// wrapper (<n>3d.js, the painted builder's) is listed in MM_ART3D.  Loaded with the quest (src/main.js), not at boot.
// (Its variants -- the Ice Wyvern, the armour knights, the rock / ice / green-fire imps -- are the wyvern's, the guard's
//  and the kobold's art, washed until their looks land: src/mmfoes.js.)
// (the names are the painted builder's packs: tools/sprite3d/chars/<name>.py; MM_PAINTED_ONLY have no rig of their own --
//  without their pack the game draws the kobold / the wyvern / the guard under a wash instead: src/mmfoes.js, mmbosses.js)
export const MM_CHAR_NAMES = ['shadow_wolf', 'wolf_alpha', 'cliff_bat', 'snowman', 'storm_crow', 'morvath_crow', 'stone_troll', 'morvath', 'morvath_nostaff'];
export const MM_PAINTED_ONLY = ['rock_imp', 'ice_imp', 'fire_imp', 'ice_wyvern', 'armor_knight', 'armor_knight_axe', 'armor_knight_halberd', 'stone_troll_arm', 'morvath_staff'];
export const MM_ART3D = ['rock_imp', 'ice_imp', 'fire_imp', 'ice_wyvern', 'armor_knight', 'armor_knight_axe', 'armor_knight_halberd', 'snowman', 'stone_troll', 'stone_troll_arm', 'shadow_wolf', 'wolf_alpha', 'morvath', 'morvath_nostaff', 'morvath_crow', 'cliff_bat', 'storm_crow', 'morvath_staff'];
let mmLoad = null;
export function loadMMChars() {
  // (each module imported once: two imports of one painted wrapper at once -- its top-level await mid-flight -- hand
  //  WebKit a namespace whose exports aren't initialised yet: 'Cannot access draw before initialization', the rig drawn)
  return mmLoad || (mmLoad = Promise.all([...new Set([...MM_CHAR_NAMES, ...MM_PAINTED_ONLY])].map(async (n) => {
    const in3d = ART3D && MM_ART3D.includes(n), only = MM_PAINTED_ONLY.includes(n);
    if (only && !in3d) return;
    try {
      const m = await import(`./chars/${in3d ? n + '3d' : n}.js`);
      if (only && !m.ATLAS_SCALE) return;   // (its pack isn't in: the stand-in art is the class's)
      CHARS[n] = m && m.draw ? m : stub(n);
    } catch (e) {
      console.warn('character not loaded:', n, e.message);
      if (only) return;
      try { CHARS[n] = in3d ? await import(`./chars/${n}.js`) : stub(n); } catch { CHARS[n] = stub(n); }   // (the painted one failed: its rig)
    }
  })));
}

// Skull Island's own characters (docs/SKULL_ISLAND.md): code rigs (src/chars/<n>.js) until their painted wrappers (<n>3d.js)
// are listed in SI_ART3D (phase 4).  Loaded with the quest's stage (src/main.js startLevel), not at boot.
export const SI_CHAR_NAMES = ['sailor', 'blunderbeard', 'crab', 'collarimp', 'ragewolf', 'swamptree', 'elder', 'slime', 'slothslime', 'malachar', 'malachar_puffer', 'king', 'sadcloud', 'fearshade', 'leviathan', 'leviathan_coil', 'kraken_tentacle', 'firepuppy', 'kraken_head', 'swamp_root', 'kraken_arm', 'storm_bat'];
export const SI_ART3D = ['blunderbeard', 'sailor', 'ragewolf', 'collarimp', 'crab', 'swamptree', 'slothslime', 'malachar', 'malachar_puffer', 'king', 'leviathan', 'leviathan_coil', 'kraken_tentacle', 'elder', 'slime', 'sadcloud', 'fearshade', 'firepuppy', 'kraken_head', 'swamp_root', 'kraken_arm', 'storm_bat'];   // (swamp_root: QA1 A1, the swamp's painted bark roots -- src/chars/swamp_root3d.js drawRoot; the stub ./swamp_root.js leaves the Tentacle tube)   // (the painted builder's toon-3D pack: assets/sprites/blunderbeard/ -- src/chars/blunderbeard3d.js)
let siLoad = null;
export function loadSIChars() {
  return siLoad || (siLoad = Promise.all(SI_CHAR_NAMES.map(async (n) => {
    const in3d = ART3D && SI_ART3D.includes(n);
    try {
      const m = await import(`./chars/${in3d ? n + '3d' : n}.js`);
      CHARS[n] = m && m.draw ? m : stub(n);
    } catch (e) {
      console.warn('character not loaded:', n, e.message);
      try { CHARS[n] = in3d ? await import(`./chars/${n}.js`) : stub(n); } catch { CHARS[n] = stub(n); }
    }
  })));
}

export async function loadChars() {
  await Promise.all(CHAR_NAMES.map(async (n) => {
    try {
      const in3d = ART3D && (ART.all || ART3D_NAMES.includes(n) || A3D_EXTRA.includes(n));   // (the default: everyone)
      const m = await import(`./chars/${in3d ? n + '3d' : RIG2 && n === 'dodongo' ? 'dodongo2d' : n}.js`);
      CHARS[n] = m && (m.draw || m.drawDodongo) ? Object.assign({}, m, { draw: m.draw || m.drawDodongo }) : stub(n);
    } catch (e) {
      console.warn('character not loaded:', n, e.message);
      CHARS[n] = stub(n);
    }
  }));
  // Dragon Dodongo the hero (docs/SECRETS.md): the duel's dragon behind the hero contract (src/chars/dragon_hero.js)
  try { const m = await import('./chars/dragon_hero.js'); CHARS.dragon_hero = m.make(CHARS.dodongo_dragon); } catch (e) { console.warn('dragon hero not built', e.message); CHARS.dragon_hero = stub('dragon'); }
  // the secret forms (src/heroes.js; src/chars/form_art.js): the hero's art from the form's own painted atlas -- a
  // runtime colour wash over the hero's until it lands
  try {
    const { make } = await import('./chars/form_art.js');
    for (const [n, b, wash] of [['ana_archmage', 'ana', 'rgba(255,214,96,0.2)'], ['shadow_legend', 'shadow', 'rgba(28,20,84,0.28)'], ['scarlet_pirate', 'scarlet', 'rgba(255,190,60,0.18)']]) CHARS[n] = await make(CHARS[b], n, wash);
  } catch (e) { console.warn('forms not built', e.message); }
  // the Dragon Queen (docs/SECRETS_SCRIPT.md: the Queen's cutscenes, the Hollow): painted (src/chars/dragonqueen3d.js),
  // her code-drawn stand-in (./chars/dragonqueen.js) for any clip the atlas lacks or while it isn't in
  if (!CHARS.dragonqueen) {
    try { CHARS.dragonqueen = await import('./chars/dragonqueen3d.js'); }
    catch (e) { console.warn('dragon queen (painted) not built', e.message); try { CHARS.dragonqueen = await import('./chars/dragonqueen.js'); } catch (e2) { console.warn('dragon queen not built', e2.message); } }
  }
  // (no painted cut-in of his yet: a TEAM ATTACK's band shows the dragon himself, breathing fire)
  try {
    const { BAND_FIG } = await import('./showcase.js');
    BAND_FIG.dragon = (ctx, x, y, BH, t, mirror) => {
      const D = CHARS.dodongo_dragon, A = D?.ANIM; if (!D?.draw || !A) return;
      const f = A.flame || A.super || A.flyLoop, pose = typeof f === 'function' ? f(A.flame ? t / 60 : Math.min(1, t / 30)) : f || {};
      ctx.save(); ctx.translate(x, y); D.draw(ctx, pose, { facing: mirror ? -1 : 1, t: t / 60, scale: BH / 170, mem: {}, vel: { x: 0, y: 0, z: 0 } }); ctx.restore();
    };
  } catch (e) { /* (a plain band) */ }
  // (a variant whose atlas isn't in for this look -- the crystal Magmaw, the wyvern alpha before their packs land --
  //  is drawn from its base's: the art sets ask for that one instead, src/artsets.js)
  try {
    const [{ atlasMissing }, { setAtlasProbe }] = await Promise.all([import('./sprite3d.js'), import('./artsets.js')]);
    setAtlasProbe((n) => !atlasMissing(n));
  } catch (e) { /* (every name asked for) */ }
}
