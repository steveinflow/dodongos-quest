// Which sprite atlases (assets/sprites/<name>/) each scene needs.  src/sprite3d.js keeps only these decoded: main.js
// asks for a level's set behind the loading screen and everything else is released.  Pure data + functions (no DOM),
// so tools/memlevels.mjs can import it to measure the decoded memory per level.
//
// Atlas names are the tools/sprite3d character names: one per hero, one per enemy variant (kobold_blue ...), the
// extra layers / forms a module draws (wyvern_rider, grimscale_free, dragonking_tiny).  A name with no atlas costs
// nothing (that character is drawn by its code rig).  'name' = the atlas's GAMEPLAY pack (every clip a level uses,
// the boss intro and freed sequences included), 'name:scene' = its SCENE pack (the clips the cutscenes and the hero
// select use; tools/sprite3d/packsets.json) -- the whole atlas for one built without packs.

import { SHOWCASE } from './config.js';
import { variantFor } from './secrets.js';

export const HERO_IDS = ['dodongo', 'ana', 'shadow', 'scarlet'];

const variant = (base, v, std) => [!v || v === std ? base : `${base}_${v}`];
/** a secret stage's variant: its look's atlas (kobold_frost ...), else its base variant's (washed: src/secrets.js) */
const looked = (kind, v) => { const f = variantFor(kind, v); return f.look || f.v; };
/** atlases an enemy kind needs, per variant */
const KIND_ART = {
  kobold: (v) => variant('kobold', looked('kobold', v), 'green'),
  whelp: (v) => variant('whelp', v, 'ember'),
  brute: (v) => variant('brute', looked('brute', v), 'std'),
  salamander: () => ['salamander'],
  wyvern: () => ['wyvern', 'wyvern_rider'],
  guard: () => ['guard'],
  // Mystic Mountain (src/mmfoes.js): its own (code rigs until their atlases land: a name with no atlas costs nothing),
  // and the kobold's / guard's art under a wash for the imps and the knights until their looks land
  wolf: () => ['shadow_wolf'],
  bat: () => ['cliff_bat'],
  crow: () => ['storm_crow'],
  snowman: () => ['snowman'],
  // (an imp or a knight whose pack isn't in: the kobold's / the guard's, washed -- as src/mmfoes.js draws it)
  imp: (v) => { const n = v === 'ice' ? 'ice_imp' : v === 'greenfire' ? 'fire_imp' : 'rock_imp'; return [atlasIn(n) ? n : v === 'ice' ? 'kobold_blue' : v === 'greenfire' ? 'kobold_bomber' : 'kobold']; },
  knight: (v) => { const n = v === 'axe' ? 'armor_knight_axe' : v === 'halberd' ? 'armor_knight_halberd' : 'armor_knight'; return [atlasIn(n) ? n : 'guard']; },
  // Skull Island (src/sifoes.js): Blunderbeard's crew -- one body, five faces and four kits (a code rig, no atlas, until the
  // painted pack lands: a name with no atlas costs nothing)
  // (the sailor's layered toon-3D packs -- body, hands, the five heads, the kit's prop: src/chars/sailor3d.js; 'sailor' stays the code rig, drawn until they load)
  sailor: (v) => ['sailor', ...sailorLayers(v)],
  crab: () => ['crab'], collarimp: () => ['collarimp', 'collar_imp'], ragebeast: () => ['ragewolf', 'rage_wolf', 'firepuppy', 'fire_puppy'],   // (stage 2's small fry: code rigs until their painted packs land)
  sadcloud: () => ['sadcloud', 'sad_cloud'], fearshade: () => ['fearshade', 'fear_shade'], slothlump: () => ['slime', 'sloth_beast'],   // (the Skull Palace's feelings: the painted builder's packs; the Lump is the Sloth Beast's pack, small)
  swamptree: () => ['swamptree', 'swamp_tree'], sapling: () => ['swamptree', 'swamp_tree'], slime: () => ['slothslime', 'sloth_slime'],   // (the swamp's trees: a code rig, the sapling is the same rig small)
};
/** bosses: their atlases (forms) and the enemies they call in mid-fight (src/enemies*.js g.spawn) */
const BOSS_ART = {
  grimscale: { art: ['grimscale', 'grimscale_free'], calls: [['kobold', 'blue'], ['kobold', 'green']] },
  magmaw: { art: ['magmaw'], calls: [['salamander']] },
  tempest: { art: ['tempest'], calls: [['whelp', 'storm']] },
  dragonking: { art: ['dragonking', 'dragonking_tiny'], calls: [['guard'], ['kobold', 'shaman']] },
  // the secret stages' mini-bosses (src/minibosses.js; boss tier: their packs step down to 0.75x as a boss's do): the
  // frost chief (the frost brute's atlas -- the Frozen Hollow's frost brutes share it), the crystal Magmaw and the wyvern
  // alpha (their own atlases; until one is in, the base it's washed from: fallback), and the Curse Wraith, an FX boss
  // drawn in code (no atlas) who calls in the curse guardians
  chief: { art: ['brute_frost'], calls: [['kobold', 'frost']] },
  magmaw_crystal: { art: ['magmaw_crystal'], fallback: ['magmaw'], calls: [['kobold', 'crystal']] },
  alpha: { art: ['wyvern_alpha'], fallback: ['wyvern'], calls: [['whelp', 'storm']] },
  wraith: { art: [], calls: [['kobold', 'curse'], ['brute', 'curse']] },
  // Mystic Mountain's bosses (src/mmbosses.js): the alpha is the wolf drawn big; the Ice Wyvern the wyvern washed until
  // its own look; the gem calls in the knights; Morvath -- and Dodongo's dragon form, for the transformation mid-fight
  wolfpack: { art: ['wolf_alpha'], calls: [['wolf']] },
  troll: { art: ['stone_troll', 'stone_troll_arm'], calls: [] },
  icewyvern: { art: ['ice_wyvern'], fallback: ['wyvern'], calls: [] },
  gem: { art: [], calls: [['knight', 'sword'], ['knight', 'axe'], ['knight', 'halberd']] },
  morvath: { art: ['morvath', 'morvath_nostaff', 'morvath_crow', 'dodongo_dragon', 'morvath_staff'], calls: [['crow']] },   // (morvath_staff: the stolen staff, src/mmbosses.js StaffTarget)
  // Skull Island's (src/sibosses.js): Captain Blunderbeard calls his crew in with the crew whistle
  blunderbeard: { art: ['blunderbeard', 'kraken_arm'], calls: [['sailor', 'club'], ['sailor', 'bandana']] },   // (kraken_arm: the arm rising at the rail after his conch -- src/stages/sibluegull.js)
  blunderbeard_rematch: { art: ['blunderbeard'], calls: [['sailor', 'club'], ['sailor', 'bandana'], ['sailor', 'rope']] },   // (the Treasure Room's rematch)
  kraken: { art: ['kraken_tentacle', 'kraken_head'], calls: [] },   // (the reworked fight: the eyed tentacles' pack and the head's -- code rigs / the stage's head until they land; no small fry, no dangling captain any more)
  elder: { art: ['elder', 'elder_tree', 'swamptree', 'swamp_tree', 'swamp_root'], calls: [['sapling'], ['swamptree']] },   // (swamp_root: the painted bark roots -- the stage's and the Elder's slams / sweeps / grabs, QA1 A1)
  slothbeast: { art: ['slime', 'sloth_beast'], calls: [['slime']] },   // (the Beast: the code rig 'slime'; its little slimes are the pack's)   // (the Cell's Sloth Beast: the slime rig drawn huge; it spits little ones)   // (the Swamp's Elder Tree: a code rig; it sprouts saplings)
  malachar: { art: ['malachar', 'malachar_puffer', 'king'], calls: [['sailor', 'bandana'], ['collarimp'], ['ragebeast'], ['sadcloud'], ['fearshade'], ['slothlump']] },   // (the Skull Palace's: his painted pack and the pufferfish's; the feelings are code rigs, the wolf is the cave's)
  ragealpha: { art: ['ragewolf', 'rage_wolf', 'firepuppy', 'fire_puppy'], calls: [['ragebeast']] },
  leviathan: { art: ['leviathan', 'leviathan_coil'], calls: [] },   // (Stage 1's mini-boss, an arena foe of boss tier: the neck + head pack and the coil pack -- src/sileviathan.js; code rigs until they land)   // (the Cave of Rage's: the same wolf, big; it calls beasts)   // (the head is drawn by the stage; the dangling captain is Blunderbeard's rig)
};
/** is an atlas in (for the current look)?  The browser asks src/sprite3d.js (src/chars.js setAtlasProbe); elsewhere --
 * tools/memlevels.mjs -- every name is (one with no files costs nothing) */
let atlasIn = () => true;
export function setAtlasProbe(fn) { atlasIn = fn || (() => true); }
/** the key of a level's boss in BOSS_ART (the Crystal Deep's Magmaw: magmaw_crystal) */
const bossKey = (b) => (b && b.crystal ? b.kind + '_crystal' : b && b.kind);
/** enemies that call others in (the kobold shaman's summons) */
const CALLS = { 'kobold:shaman': [['kobold', 'green']] };

export const BOSSES = Object.keys(BOSS_ART);
const BOSS_NAMES = new Set(Object.values(BOSS_ART).flatMap((b) => b.art));
/** a boss pack's FAMILY (src/artplan.js steps a boss's packs together, as a foe family's): its BOSS_ART entry -- the Stone
 *  Troll's body and arm layers; Malachar's pack, the pufferfish's and the crystal King's; Morvath's looks, crow and staff --
 *  and its rank in that entry's art list (the lowest present is the family's MAIN pack, raised before any part).  The first
 *  entry that lists it (Blunderbeard's, not his rematch's).  null: not in BOSS_ART */
export function bossFamily(name) {
  const base = String(name || '').replace(/[:@].*$/, '').replace(/_(painted|ebsynth|wan|showcase|[a-z0-9]+look)$/, '');
  for (const [key, b] of Object.entries(BOSS_ART)) { const rank = b.art.indexOf(base); if (rank >= 0) return { key, rank }; }
  return null;
}

// the finale's forms (docs/FINALE.md): Dodongo's dragon form is a hero, the Dread King a boss
const FORM_TIER = { dodongo_dragon: 'hero', dragonking_dread: 'boss', dragonqueen: 'boss', ana_archmage: 'hero', shadow_legend: 'hero', scarlet_pirate: 'hero',
  pq_parrot: 'hero', legend_dummy: 'hero' };   // (the forms' props -- the Pirate Queen's parrot, Legend Shadow's dummy, src/forms.js: they step with the heroes)
/** the secret forms' atlases (src/heroes.js: the outfit recolours) and the hero each is drawn from until its own lands */
const FORM_ART = { archmage: 'ana_archmage', legend: 'shadow_legend', pirate: 'scarlet_pirate' };
const FORM_BASE = { archmage: 'ana', legend: 'shadow', pirate: 'scarlet' };
/** a form's atlas, or its hero's while the form's isn't in (src/chars/form_art.js washes the hero's drawing) */
const formAtlas = (f) => (atlasIn(FORM_ART[f]) ? FORM_ART[f] : FORM_BASE[f]);

/** 'hero' | 'boss' | 'enemy' for an atlas name (a look atlas, e.g. ana_painted, takes its base's tier); an EXTRA pack --
 * a form's level pack ('dodongo_dragon:level': on screen a moment at a time), a hero's move pack ('ana:move': painter 3's
 * movement clips) -- is 'extra', the memory policy's lowest priority (src/artplan.js: filled last) */
export const EXTRA_TIER = 'extra';
export function tierOf(name) {
  const at = name.indexOf('@');
  if (at >= 0) return name.slice(at + 1);   // (a level's tier tag: 'dodongo_dragon@extra' -- levelArt, L.artTiers)
  if (/:(?!scene$)[a-z]+$/.test(name)) return EXTRA_TIER;   // (any extra pack kind: 'level', 'move')
  const base = name.replace(/:.*$/, '').replace(/_(painted|ebsynth|wan|showcase|[a-z0-9]+look)$/, '');
  if (FORM_TIER[base]) return FORM_TIER[base];
  if (HERO_IDS.includes(base)) return 'hero';
  if (BOSS_NAMES.has(base)) return 'boss';
  return 'enemy';
}

/** THE DRAW SCALES: how big the game draws a pack, over its 1x atlas -- the actor's scale x its module's own (src/artplan.js
 * wants the atlas scale that covers render scale x this, so a foe drawn x1.7 wants its 2x even at DPR 1).  Read off the
 * census (src/sprite3d.js DQ_ART.drawScales over every stage of the three books played through -- tools/drawk_census.mjs, 2026-10-25: the draw
 * the pack spends most of its time at, or a big variant's -- the big wolves, the grown rage wolves): a pack not listed is
 * drawn at about 1.  'name' = its gameplay pack, 'name:scene' its scene pack, 'prefix*' every pack whose name starts so
 * (a sailor's layers).  A module or actor scale that changes moves its row (re-read it with DQ_ART.drawScales()). */
export const DRAW_K = {
  // drawn bigger than their atlas: at a render scale of 1 they want their 2x
  ice_wyvern: 1.7, rage_wolf: 1.55, fire_puppy: 1.5, wyvern_alpha: 1.4, 'dodongo_dragon:level': 1.35,
  malachar_puffer: 1.3, shadow_wolf: 1.28, stone_troll: 1.28, stone_troll_arm: 1.28, kraken_arm: 1.25,
  'sailor_head_burly*': 1.4, 'sailor_head_ginger*': 1.35, 'sailor_head_patch*': 1.3, 'sailor_head_spiky*': 1.25, 'sailor_head_bald*': 1.2, 'sailor_*': 1.25,
  'dragonking_tiny:scene': 1.7,
  // drawn smaller: a render scale of 1 wants their 0.75x where one is built (2 their 1x, where under ~0.58)
  dodongo_dragon: 0.9, morvath: 0.9, morvath_nostaff: 0.9, kraken_head: 0.85, leviathan_coil: 0.8, collar_imp: 0.75, dragonking_dread: 0.72,
  dragonqueen: 0.72, king: 0.55, morvath_staff: 0.5, 'grimscale_free:scene': 0.64, 'tempest:scene': 0.51,
};
const DRAW_PRE = Object.keys(DRAW_K).filter((k) => k.endsWith('*')).map((k) => [k.slice(0, -1), DRAW_K[k]]).sort((a, b) => b[0].length - a[0].length);
/** the draw scale of an atlas' pack ('play' | 'scene' | 'level') */
export function drawK(name, kind = 'play') {
  const base = name.replace(/_(painted|ebsynth|wan|[a-z0-9]+look)$/, ''), key = kind === 'play' ? base : base + ':' + kind;
  if (DRAW_K[key]) return DRAW_K[key];
  if (kind === 'play') { const p = DRAW_PRE.find(([pre]) => base.startsWith(pre)); if (p) return p[1]; }
  return 1;
}

/** the sky duel (src/skyduel.js): Dragon Dodongo, the Dread King, the cursed whelps (whelp's gameplay pack) and the
 * riders, drawn sitting (their scene packs: 'sit') */
export function duelArt(riders) {
  const out = new Set(['dodongo_dragon', 'dragonking_dread', 'whelp']);
  for (const h of riders || []) if (HERO_IDS.includes(h)) out.add(h + ':scene');
  return out;
}

function addKind(out, k, v) {
  if (BOSS_ART[k]) { addBoss(out, k); return; }
  for (const n of (KIND_ART[k] || (() => [k]))(v)) out.add(n);
  for (const [k2, v2] of CALLS[`${k}:${v}`] || []) addKind(out, k2, v2);
}
function addBoss(out, k) {
  const B = BOSS_ART[k];
  if (!B) { out.add(k); return; }
  for (const n of B.art) { if (B.fallback && !atlasIn(n)) for (const f of B.fallback) out.add(f); else out.add(n); }
  for (const [k2, v2] of B.calls) addKind(out, k2, v2);
}

/** the heroes' atlases */
export function heroArt(heroes) {
  // (Dragon Dodongo, the true ending's reward: the duel dragon's gameplay pack -- hero tier, FORM_TIER; the other secret
  //  forms: their own atlas in place of their hero's, the hero's while theirs isn't in)
  return new Set((heroes || []).map((h) => (h === 'dragon' ? 'dodongo_dragon' : FORM_ART[h] ? formAtlas(h) : h))
    .filter((h) => HERO_IDS.includes(h) || h === 'dodongo_dragon' || Object.values(FORM_ART).includes(h)));
}

/** everything a level draws: the heroes in play, its enemies (waves, patrols, boss calls), its boss, the caged /
 * allied whelps every level has, and -- with Dodongo playing -- his dragon form's level pack (his super) */
export function levelArt(L, heroes) {
  const out = heroArt(heroes);
  if (out.has('dodongo')) out.add('dodongo_dragon:level');
  // (each hero's move pack -- painter 3's squat, rise, fall, land, skid, runTurn, dodgeBack, bounce, out of the gameplay pack
  //  to fit the memory: the extra tier, filled last; an atlas without one costs nothing -- Dragon Dodongo's)
  // (and the Dragon Dodongo hero's -- painter 3's bite / claw / tailWhip / rearUp ... -- only while someone plays him: the
  //  summit's mid-fight dragon and the sky duel never decode it)
  for (const h of heroArt(heroes)) out.add(h + ':move');
  // (the forms' painted props, src/forms.js: the Pirate Queen's parrot -- always on screen beside her -- and Legend Shadow's
  //  dodge dummy, only while that form plays)
  if ((heroes || []).includes('pirate')) out.add('pq_parrot');
  if ((heroes || []).includes('legend')) out.add('legend_dummy');
  for (const a of L.arenas || []) {
    for (const w of a.waves || []) for (const s of w) addKind(out, s.k, s.v);
    if (a.boss) addBoss(out, L.boss && a.boss === L.boss.kind ? bossKey(L.boss) : a.boss);
    if (a.tent && !a.tent.root && (a.tent.kinds || []).some((k) => k === 'slam' || k === 'sweep' || k === 'grab')) out.add('kraken_arm');   // (the arena's arms through the deck: src/sikraken.js Tentacle, the painted eyeless pack)
    if (a.tent && (a.tent.kinds || []).includes('slam')) addKind(out, 'collarimp');   // (a slam may carry a purple imp up with it -- the deck's arms and the swamp's roots alike: src/siworld.js stepTentacles t.imp; in game its pack was decoded outside the plan -- SI3B 1P DPR 2: 243.1 MiB)
  }
  for (const p of L.patrols || []) for (const s of p.spawns || []) addKind(out, s.k, s.v);
  if (L.boss) addBoss(out, bossKey(L.boss));
  for (const h of L.guestHeroes || []) for (const n of heroArt([h])) out.add(n);   // (Skull Island's stage 1: Scarlet swings in mid-fight)
  if ((L.things || []).some((t) => t.kind === 'cage')) out.add('whelp');
  if (L.final) out.add('dragonqueen');                 // (the Queen's Hollow: the Queen asleep on her bed -- src/wraith.js QueenSleeper)
  // (L.artTiers: a pack this level steps down at another tier -- 'name@tier', src/sprite3d.js useArt -- unless a player
  //  plays it: the summit's dragon form is 'extra' until someone is the dragon)
  const played = heroArt(heroes);
  for (const [n, t] of Object.entries(L.artTiers || {})) if (out.has(n) && !played.has(n)) { out.delete(n); out.add(`${n}@${t}`); }
  return out;
}

/** Mystic Mountain's anchor-only cast ids (docs/MM_SCRIPT.md: its panels are all plates -- in an mm_* cutscene these only
 * place a balloon and are never drawn, plate or not: src/cutscene.js castArt) */
export const ANCHOR_ONLY = new Set(['morvath', 'granny', 'villageboy', 'troll', 'elder', 'crow', 'villager', 'tree', 'wyvern']);
/** an anchor-only cast entry of this cutscene? (only Mystic Mountain's: Dodongo's Quest's wyvern is a real one) */
export const anchorOnly = (storyId, castId) => (/^mm_/.test(storyId || '') && ANCHOR_ONLY.has(castId)) || (/^si_/.test(storyId || '') && SI_ANCHORS.has(castId));
/** Skull Island's anchor-only cast ids: Malachar is drawn by his mirror's stage (src/stages/simirror.js), his balloon is dark purple */
export const SI_ANCHORS = new Set(['malachar']);
/** Skull Island's cast whose toon-3D pack is gameplay-only (no scene split): a story loads that pack itself (the code rig draws until it is in) */
export const SI_PLAY_ONLY = new Set(['blunderbeard', 'sailor', 'malachar', 'malachar_puffer']);
const SAILOR_FACES = ['ginger', 'bald', 'patch', 'burly', 'spiky'];
/** the layer packs one sailor kit draws: the body, both hands (the burly face takes the dark), every head, and its prop */
export function sailorLayers(v) {
  const bd = v === 'bandana';
  return [bd ? 'sailor_thug_body' : 'sailor_body', bd ? 'sailor_thug_body_stout' : 'sailor_body_stout', 'sailor_hands_light', 'sailor_hands_dark', ...SAILOR_FACES.map((f) => `sailor_head_${f}${bd ? '_thug' : ''}`), bd ? 'sailor_prop_cutlass' : v === 'rope' ? 'sailor_prop_rope' : v === 'net' ? 'sailor_prop_net' : 'sailor_prop_club'];
}

/** the boss form a cutscene cast entry draws: Grimscale cursed / freed (o.cursed), the King big / tiny (his clip) */
const STORY_FORM = {
  grimscale: (c) => (c.o && c.o.cursed === false ? 'grimscale_free' : 'grimscale'),
  dragonking: (c) => (/^tiny/.test(c.a || '') ? 'dragonking_tiny' : 'dragonking'),
  magmaw: () => 'magmaw',
  tempest: () => 'tempest',
};

/** a cutscene's cast (story.js pages: cast c = a character id, or 'P1' / 'P2' = the heroes; o.variant) */
export function storyArt(def, heroes) {
  const out = new Set(), play = new Set();   // (play: gameplay packs a story draws -- Skull Island's toon-3D captain has no scene pack)
  const mmStory = (def?.pages || []).some((pg) => (pg.panels || []).some((pn) => /^mm_/.test(pn.bg?.lvl || '')));
  for (const pg of def?.pages || []) {
    for (const pn of pg.panels || []) {
      for (const c of pn.cast || []) {
        if (!c || !c.c) continue;
        // P1 / P2: the heroes in play -- a 1P run's P2 is the trio's stand-in (src/cutscene.js castId): load that one too
        if (c.c === 'P1' || c.c === 'P2') { out.add(c.c === 'P1' ? heroes?.[0] || 'dodongo' : heroes?.[1] || (heroes?.[0] === 'ana' ? 'dodongo' : 'ana')); continue; }
        if (mmStory && ANCHOR_ONLY.has(c.c)) continue;   // (Mystic Mountain's anchors: never drawn)
        if (SI_ANCHORS.has(c.c) && !c.live) continue;    // (Skull Island's: Malachar, in his mirror -- `live: true`: the palace's stories draw him)
        if (SI_PLAY_ONLY.has(c.c)) { for (const n of c.c === 'sailor' ? sailorLayers(c.o?.kit) : [c.c]) play.add(n); continue; }
        if (HERO_IDS.includes(c.c)) out.add(c.c);
        else if (STORY_FORM[c.c]) out.add(STORY_FORM[c.c](c));
        else for (const n of (KIND_ART[c.c] || (() => [c.c]))(c.o?.variant)) out.add(n);
      }
    }
  }
  for (const h of heroArt(heroes)) out.add(h);         // P1 / P2
  return new Set([...scenePacks(out), ...play]);
}

/** the scene packs of a set of atlases */
export const scenePacks = (set) => new Set([...set].map((n) => n + ':scene'));

/** the hero select (and the co-op join picker): every hero, + the painted select loops (the <hero>_showcase atlases,
 * src/showcase.js; small, decoded only here) */
export function selectArt(forms = [], ids = HERO_IDS) {   // (ids: the quest's heroes -- Mystic Mountain's three)
  const out = scenePacks(ids);
  if (SHOWCASE.select) for (const h of ids) out.add(h + '_showcase');
  if (forms === true) forms = ['dragon'];                // (the old call: Dragon Dodongo)
  for (const f of forms || []) {
    if (f === 'dragon') out.add('dodongo_dragon');   // (Dragon Dodongo's form, once unlocked: his gameplay pack)
    else if (FORM_ART[f]) out.add(formAtlas(f) + ':scene');   // (a form's scene pack: its select loop -- its hero's while it isn't in)
  }
  return out;
}
