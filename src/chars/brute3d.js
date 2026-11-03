// Drake Brute, 3D-rendered sprites (loaded instead of ./brute.js with ?art3d=1 once 'brute' is in ART3D_NAMES; see
// src/chars.js, docs/SPRITE3D.md).  One model (assets-src/brute/, built by tools/sprite3d/models/brute_build.py on the
// shared lizard-folk rig) and one atlas per variant, rendered by tools/sprite3d chars/brute.py (std) and
// chars/brute_magma.py: assets/sprites/brute/, brute_magma/.  The variants differ by materials and kit (spiked
// gauntlets + loincloth / riveted mitts + forge-apron), not by motion.
//
// The engine asks for poses without a variant (Enemy.anim(key, arg)), so ANIM is shared: both variants have the same
// clips (idle, walk, charge, roar, punchWind, punch, chargeWind, stagger, hurt, hurt2, fly, down, getup) with the same
// drawings and timing.  A pose carries both the drawing index and the code rig's pose, and draw() picks the atlas by
// o.variant (Brute.drawOpts): a variant without an atlas yet draws the code rig from the same pose.
// Rendered facing right and mirrored (unhanded, like the rig).
import * as RIG from './brute.js';
import { spriteArt, rigOnly } from '../sprite3d.js';

export * from './brute.js';             // PALETTES, BASE, measure, HEIGHT, HURTBOX ... (local exports win)

const VARIANTS = ['std', 'magma', 'frost', 'jade'];   // (frost, jade: the secret stages -- the std kit)
const ARTS = {};
await Promise.all(VARIANTS.map(async (v) => {
  ARTS[v] = await spriteArt(v === 'std' ? 'brute' : 'brute_' + v, { fallback: RIG });
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

/** Draw with the feet at (0, 0).  o: { facing, t, scale, variant, mem, vel, talk } as ./brute.js. */
export function draw(ctx, pose, o = {}) {
  (ARTS[o.variant] || ARTS.std).draw(ctx, pose, o);
}
export { draw as drawBrute };

// landmarks (local px, facing right, scale 1), measured on the 3D drawings at the frame the rig's exports use; the
// rig's until the std atlas exists
const at = (v, key, k, lm) => {
  const A = ARTS[v], f = A.ANIM[key];
  return typeof f === 'function' ? A.point3d(f(k), lm) : null;
};
const r2 = (p) => (p ? p.map((c) => Math.round(c)) : null);
export const META = ARTS.std.META;                     // the atlas META (id, name, height, hurtbox), if built
export const PUNCH_FIST = r2(at('std', 'punch', 6 / 30, 'fist')) || RIG.PUNCH_FIST;     // the haymaker lands (hit st 6..15)
export const CHARGE_HEAD = r2(at('std', 'charge', 0, 'head')) || RIG.CHARGE_HEAD;       // head (horns) in the charge run
export const ATLAS_SCALE = ARTS.std.ATLAS_SCALE;
