// Kobold, 3D-rendered sprites (loaded instead of ./kobold.js with ?art3d=1 once 'kobold' is in ART3D_NAMES; see
// src/chars.js, docs/SPRITE3D.md).  One model (assets-src/kobold/, built by tools/sprite3d/models/kobold_build.py on the
// shared lizard-folk rig) and one atlas per variant, rendered by tools/sprite3d chars/kobold.py (green) and
// chars/kobold_<variant>.py: assets/sprites/kobold/, kobold_blue/, kobold_red/, kobold_miner/, kobold_bomber/,
// kobold_shaman/.  The variants differ by materials and kit (hat, weapon), not by motion.
//
// The engine asks for poses without a variant (Enemy.anim(key, arg)), so ANIM is shared: the common clips (idle, walk,
// flee, taunt, hurt, hurt2, fly, down, getup) have the same drawings and timing in every variant, and each kit clip
// (stab / lunge, mineWind / mineHit, throwWind / throw, castWind / cast / summon) exists in its own variants only.
// A pose carries both the drawing index and the code rig's pose, and draw() picks the atlas by o.variant: a variant
// without that clip (or without an atlas yet) draws the code rig from the same pose.
// Rendered facing right and mirrored (unhanded, like the rig).
import * as RIG from './kobold.js';
import { spriteArt, rigOnly } from '../sprite3d.js';

export * from './kobold.js';            // PALETTES, BASE, drawBomb, measure, HEIGHT, HURTBOX ... (local exports win)

const VARIANTS = ['green', 'blue', 'red', 'miner', 'bomber', 'shaman', 'frost', 'jade'];   // (frost, jade: the secret stages)
const ARTS = {};
await Promise.all(VARIANTS.map(async (v) => {
  ARTS[v] = await spriteArt(v === 'green' ? 'kobold' : 'kobold_' + v, { fallback: RIG });
}));

const isSprite = (f) => {
  const p = typeof f === 'function' ? f(0) : f;
  return !!(p && p.s3d >= 0.5);
};
/** the first variant whose atlas renders this clip (the drawing index is the same in every variant that has it) */
const source = (key) => VARIANTS.find((v) => isSprite(ARTS[v].ANIM[key]));

export const ANIM = {};
for (const key of new Set([...Object.keys(RIG.ANIM), ...VARIANTS.flatMap((v) => Object.keys(ARTS[v].ANIM))])) {
  const v = source(key);
  const rig = RIG.ANIM[key];
  if (!v) { if (rig !== undefined) ANIM[key] = rigOnly(key, rig, Object.values(ARTS).some((a) => a.ATLAS_SCALE)); continue; }
  const spr = ARTS[v].ANIM[key];
  const one = (f, a) => (typeof f === 'function' ? f(a) : f);
  ANIM[key] = typeof spr === 'function' || typeof rig === 'function'
    ? (a) => Object.assign({}, rig !== undefined ? one(rig, a) : {}, one(spr, a))
    : Object.assign({}, rig || {}, spr);
}

/** Draw with the feet at (0, 0).  o: { facing, t, scale, variant, mem, vel, talk } as ./kobold.js. */
export function draw(ctx, pose, o = {}) {
  (ARTS[o.variant] || ARTS.green).draw(ctx, pose, o);
}
export { draw as drawKobold };

// engine landmarks (src/enemies.js), measured on each kit's 3D drawings at the frame the engine uses them; the rig's
// until that variant's atlas exists
const at = (v, key, k, lm) => {
  const A = ARTS[v], f = A.ANIM[key];
  return typeof f === 'function' ? A.point3d(f(k), lm) : null;
};
const r2 = (p) => (p ? p.map((c) => Math.round(c)) : null);
export const META = ARTS.green.META;                   // the atlas META (id, name, height, hurtbox), if built
export const SPEAR_TIP = r2(at('green', 'stab', 3 / 22, 'tip')) || RIG.SPEAR_TIP;        // stab contact (hit st 3..11)
export const PICK_TIP = r2(at('miner', 'mineHit', 7 / 24, 'tip')) || RIG.PICK_TIP;       // pick strike (hit st 7..12)
export const BOMB_HAND = r2(at('bomber', 'throw', 6 / 16, 'hand')) || RIG.BOMB_HAND;     // the bomb leaves the hand at st 6
export const CAST_POINT = r2(at('shaman', 'cast', 5 / 18, 'tip')) || RIG.CAST_POINT;     // the fireball leaves at st 5
export const ATLAS_SCALE = ARTS.green.ATLAS_SCALE;
