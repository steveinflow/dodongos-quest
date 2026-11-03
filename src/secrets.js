// The secrets (docs/SECRETS.md): the Star Shards, the baby dragons' cages, the secret stages found, the Queen and
// Dragon Dodongo -- the progress kept across runs in save.js's meta -- and the stand-in recolours the secret stages'
// enemy variants use until their painted atlases land.
import { loadSharedMeta as loadMeta, writeSharedMeta as writeMeta } from './save.js';   // (shared by both quests: src/quests.js)

export const SHARDS = 3;            // Star Shards: one per secret stage (1..3)
export const CAGES = 8;             // baby dragons: two cages in each main stage
export const PERFECTS = 20;         // PERFECT DODGES in all: counted for fun (they unlocked Legend Shadow until this round)
export const SHADOW_BOSSES = 3;     // bosses beaten with Shadow (or Legend Shadow) in the party, each boss once (Legend Shadow)
export const CHESTS = 12;           // treasure chests opened in all (Pirate Queen Scarlet)
/** the secret forms and what unlocks them (progress() flags) */
export const FORM_UNLOCK = { dragon: 'dragonDodongo', archmage: 'archmage', legend: 'legend', pirate: 'pirate' };
export const FORM_NAMES = { dragon: 'DRAGON DODONGO', archmage: 'ARCHMAGE ANASTASIA', legend: 'LEGEND SHADOW', pirate: 'PIRATE QUEEN SCARLET' };
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');

/** the persistent progress (meta, with the secrets' fields filled in): shards [1..3], dragons [cage ids], secrets [stage
 * ids], queen (the true ending seen), perfects / chests (counters), and the forms unlocked: dragonDodongo, archmage
 * (every shard), legend (SHADOW_BOSSES bosses beaten with Shadow in the party), pirate (CHESTS chests) -- and all four
 * at once once a run reaches any book's final level (allForms: unlockAllForms) -- ?unlock=1 unlocks them all (tests) */
export function progress() {
  const m = loadMeta(), all = Q.get('unlock') === '1' || m.allForms === true || allSession;
  const P = {
    shards: [...new Set((m.shards || []).filter((n) => n >= 1 && n <= SHARDS))].sort(),
    dragons: [...new Set(m.dragons || [])],
    secrets: [...new Set(m.secrets || [])],
    queen: !!m.queen,
    // (chests: each one counted once, by its id -- re-opening one after a restart counted again)
    perfects: m.perfects | 0, chests: new Set(Array.isArray(m.chestIds) ? m.chestIds : []).size,
    shadowBosses: new Set(Array.isArray(m.shadowBosses) ? m.shadowBosses : []).size,   // (each boss once)
    dragonDodongo: !!m.dragonDodongo || all,
  };
  P.archmage = P.shards.length >= SHARDS || all;
  // (an unlock already earned the old way -- 25 perfect dodges before this version: migrateMeta, or its sign seen -- stays)
  P.legend = P.shadowBosses >= SHADOW_BOSSES || all || m.legacyLegend === true || (m.announced || []).includes('legend');
  P.pirate = P.chests >= CHESTS || all || (m.announced || []).includes('pirate');   // (an unlock already earned under the old count stays)
  return P;
}
/** a secret form is unlocked (a base hero: always) */
export function formUnlocked(id, P = progress()) { return !FORM_UNLOCK[id] || !!P[FORM_UNLOCK[id]]; }
/** forms unlocked but not yet announced (src/main.js shows the UNLOCKED sign, then marks them) */
export function newUnlocks(P = progress()) {
  const seen = loadMeta().announced || [];
  return Object.keys(FORM_UNLOCK).filter((f) => P[FORM_UNLOCK[f]] && !seen.includes(f) && !(Q.get('unlock') === '1'));
}
export const markAnnounced = (f) => addTo('announced', f);
/** every super form unlocked at once -- a run has reached a book's final level (src/main.js App.reachFinal), or a save
 *  is already there (at boot): the shared meta's allForms, so every book offers them.  Returns the forms this makes new
 *  to the player (still locked, or unlocked but never announced) and marks all four announced: ONE sign says them all,
 *  never four in a row.  The other ways in (shards, chests, Legend bosses, the true ending) count on as before.
 *  (Storage blocked: held for the session, and given only once) */
let allSession = false;
export function unlockAllForms() {
  if (allSession) return [];
  const m = loadMeta(), seen = m.announced || [], before = progress();
  const fresh = Object.keys(FORM_UNLOCK).filter((f) => !before[FORM_UNLOCK[f]] || !seen.includes(f));
  allSession = true;
  update((x) => { x.allForms = true; x.announced = [...new Set([...(x.announced || []), ...Object.keys(FORM_UNLOCK)])]; });
  return fresh;
}
/** once, at boot: progress kept under an older rule keeps what it earned (Legend Shadow by 25 perfect dodges) */
export function migrateMeta() {
  const m = loadMeta();
  if (m.v3 === true) return;
  if ((m.perfects | 0) >= 25) m.legacyLegend = true;
  m.v3 = true;
  writeMeta(m);
}
function update(fn) { const m = loadMeta(); fn(m); writeMeta(m); }
const addTo = (key, v) => update((m) => { const a = new Set(m[key] || []); a.add(v); m[key] = [...a]; });
export const addShard = (n) => addTo('shards', n);
export const addDragon = (cageId) => addTo('dragons', cageId);
export const addSecret = (id) => addTo('secrets', id);
export const setQueen = () => update((m) => { m.queen = true; m.dragonDodongo = true; m.announced = [...new Set([...(m.announced || []), 'dragon'])]; });   // (the TRUE ENDING card is his announcement)
/** one more PERFECT DODGE / treasure chest opened (the persistent counters) */
export const addPerfect = () => update((m) => { m.perfects = (m.perfects | 0) + 1; });
export const addChest = (id) => { if (id) addTo('chestIds', id); };
/** a boss (or mini-boss, the Wraith, the Dread King) beaten with Shadow in the party: counted once per boss id */
export const addShadowBoss = (id) => { if (id) addTo('shadowBosses', id); };
/** every shard and every baby dragon: the way to the Queen's Hollow opens after the finale */
export function queenReady(P = progress()) { return P.shards.length >= SHARDS && P.dragons.length >= CAGES; }
/** "Shards 2/3 - Dragons 7/8" */
// (each count says what it opens: "... -> ARCHMAGE", a tick once it has)
const to = (n, of, what) => `${n}/${of} ${n >= of ? '✓' : '→'} ${what}`;
export function progressLine(P = progress()) { return `Star Shards ${to(P.shards.length, SHARDS, 'ARCHMAGE')}  -  Baby dragons ${to(P.dragons.length, CAGES, 'THE QUEEN')}`; }
/** "Perfect dodges 7/25  -  Treasure chests 3/12" */
// (chests = false: Mystic Mountain, Book 1 -- no treasure chests there, just the bosses beaten as Shadow)
export function counterLine(P = progress(), chests = true) {
  const s = `Bosses beaten as Shadow ${to(Math.min(P.shadowBosses, SHADOW_BOSSES), SHADOW_BOSSES, 'LEGEND SHADOW')}`;
  return chests ? `${s}  -  Treasure chests ${to(Math.min(P.chests, CHESTS), CHESTS, 'PIRATE QUEEN')}` : s;
}

// ------------------------------------------------------------------------------------------------ the variants
// a secret stage's enemy variant -> the base variant its behaviour (stats, kit) comes from, its painted LOOK -- an atlas
// variant of its own (kobold_frost, brute_jade ...: src/chars/*3d.js VARIANTS; the code rig draws it in that palette
// where the atlas is missing) -- or, for a kind with no look of its own, the colour washed over the base variant's
// atlas (src/render.js drawTinted).  The Crystal Deep's kobolds and brutes wear the jade (green-crystal) look the Queen's
// Hollow's guardians do.
export const TINT_VARIANTS = {
  frost: { kobold: 'green', brute: 'std', look: { kobold: 'frost', brute: 'frost' }, wash: 'rgba(150,215,255,0.42)' },
  crystal: { kobold: 'green', brute: 'std', look: { kobold: 'jade', brute: 'jade' }, wash: 'rgba(110,255,230,0.38)' },
  storm: { kobold: 'blue', brute: 'std', wash: 'rgba(170,150,255,0.36)' },
  curse: { kobold: 'green', brute: 'std', look: { kobold: 'jade', brute: 'jade' }, wash: 'rgba(90,255,120,0.36)' },
};
/** an enemy of kind k in variant v: { v: the variant to build it from, look: its atlas variant (null: v's own), wash:
 * the colour over it (null: none) }.  (A kind the stage variant doesn't recolour -- the Eyrie's storm whelps -- is its
 * own variant, unwashed.) */
export function variantFor(kind, v) {
  const T = TINT_VARIANTS[v];
  if (!T || !T[kind]) return { v, look: null, wash: null };
  const look = (T.look && T.look[kind]) || null;
  return { v: T[kind], look, wash: look ? null : T.wash };
}
