// Save points: progress is kept in this browser (localStorage).  Every access is wrapped: private windows and
// blocked storage simply mean "no save", never a crash.
// (per quest -- src/quests.js: Dodongo's Quest keeps the keys it always had; Mystic Mountain has its own pair.  The
//  secrets' progress -- the forms unlocked -- is Dodongo's Quest's meta whichever quest is on: loadSharedMeta)
const KEYS = { dq: ['dq.save.v2', 'dq.meta.v2'], mm: ['dq.mm.save.v1', 'dq.mm.meta.v1'], si: ['dq.si.save.v1', 'dq.si.meta.v1'] };
let KEY = KEYS.dq[0], META = KEYS.dq[1];
export function setSaveQuest(q) { [KEY, META] = KEYS[q] || KEYS.dq; }

/** the save's check (main.js setSaveCheck: the levels and heroes it may name) -- a bad field mended or the save dropped */
let CHECK = null;
export function setSaveCheck(fn) { CHECK = fn; }
const num = (v, lo, hi, d) => (Number.isFinite(v) && v >= lo && v <= hi ? v : d);
/** { level: 0..3, checkpoint: -1 | waystone index, heroes: [id, id?], score, freed, lives: [n, n?] } -- or null: none, or
 * one too broken to CONTINUE (a level that doesn't exist, a finale phase out of range ...) */
export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s || typeof s !== 'object' || s.v !== 2 || !Number.isInteger(s.level) || s.level < 0) return null;
    s.checkpoint = Number.isInteger(s.checkpoint) && s.checkpoint >= -1 && s.checkpoint < 16 ? s.checkpoint : -1;
    if (s.finale !== undefined && s.finale !== null && !(Number.isInteger(s.finale) && s.finale >= 0 && s.finale <= 2)) return null;
    s.score = Math.round(num(s.score, 0, 1e9, 0)); s.freed = Math.round(num(s.freed, 0, 1e6, 0));
    s.ret = s.ret && typeof s.ret === 'object' && Number.isFinite(s.ret.x) && s.ret.x > 0 ? { x: s.ret.x, arenaFrom: Number.isInteger(s.ret.arenaFrom) && s.ret.arenaFrom >= 0 ? s.ret.arenaFrom : 0 } : null;
    s.bossSeen = s.bossSeen && typeof s.bossSeen === 'object' && !Array.isArray(s.bossSeen) ? s.bossSeen : {};
    return CHECK ? CHECK(s) : s;
  } catch { return null; }
}
export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 2, ...data, at: Date.now() })); return true; } catch { return false; }
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/** levels unlocked for "level select", best score, and the secrets' progress (src/secrets.js) -- every field's type
 * checked: a broken one (shards as a number, dragons as a string) is mended, never a game that can't start */
export function loadMeta(key = META) {
  let m;
  try { m = JSON.parse(localStorage.getItem(key) || '{}'); } catch { m = {}; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) m = {};
  const arr = (v, ok) => (Array.isArray(v) ? v.filter(ok) : []);
  const str = (x) => typeof x === 'string' && x.length < 64, int = (x) => Number.isInteger(x);
  return Object.assign({}, m, {
    unlocked: Number.isFinite(m.unlocked) ? Math.max(1, Math.min(16, Math.round(m.unlocked))) : 1,   // (out of range: clamped, not reset)
    best: Math.round(num(m.best, 0, 1e9, 0)), cleared: m.cleared === true,   // (they sat in the comment above: best was stored as NaN -> null -- QA3)
    shards: arr(m.shards, int), dragons: arr(m.dragons, str), secrets: arr(m.secrets, str), announced: arr(m.announced, str), chestIds: arr(m.chestIds, str), shadowBosses: arr(m.shadowBosses, str),
    perfects: Math.round(num(m.perfects, 0, 1e6, 0)), chests: Math.round(num(m.chests, 0, 1e6, 0)), queen: m.queen === true, dragonDodongo: m.dragonDodongo === true,
  });
}
export function writeMeta(m, key = META) { try { localStorage.setItem(key, JSON.stringify(m)); } catch { /* ignore */ } }
/** the meta the secrets live in (src/secrets.js): Dodongo's Quest's, whichever quest is being played -- the forms
 * unlocked are the same in both books */
export const loadSharedMeta = () => loadMeta(KEYS.dq[1]);
/** each book's meta key (src/main.js: a save already at a book's final level grants the super forms at boot) */
export const META_KEYS = { dq: KEYS.dq[1], mm: KEYS.mm[1], si: KEYS.si[1] };
export const writeSharedMeta = (m) => writeMeta(m, KEYS.dq[1]);
