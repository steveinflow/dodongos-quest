// Mystic Mountain's painted packs (tools/sprite3d/chars/<name>.py, the painted builder's): one wrapper shape for all of
// them -- the sprite where its atlas has the clip, the code rig (fallback) where it doesn't -- and its landmarks
// (point(pose, name): local px, facing right, scale 1; null where the pose is the rig's or the landmark is unknown).
// The <name>3d.js modules are this with their rig; src/chars.js loads them for the names in MM_ART3D.
import { spriteArt, rigOnly } from '../sprite3d.js';

export async function mmArt(name, RIG, rigOpts = {}) {
  const A = await spriteArt(name, { fallback: RIG || null });
  const has = !!A.ATLAS_SCALE;
  const ANIM = {};
  for (const key of new Set([...Object.keys((RIG && RIG.ANIM) || {}), ...Object.keys(A.ANIM)])) {
    const spr = A.ANIM[key], rig = RIG && RIG.ANIM ? RIG.ANIM[key] : undefined;
    const isSpr = spr !== undefined && ((typeof spr === 'function' ? spr(0) : spr) || {}).s3d >= 0.5;
    if (!isSpr) { if (rig !== undefined) ANIM[key] = rigOnly(key, rig, has); continue; }
    ANIM[key] = spr;
  }
  const point = (pose, lm) => {
    if (pose && pose.s3d >= 0.5) { const q = A.point3d(pose, lm); return q ? [q[0], q[1]] : null; }
    return RIG && RIG.point ? RIG.point(pose, lm) : null;
  };
  // (EXPORTS: the pack's measured points -- the stone troll's RAMP_LOW / RAMP_HIGH / TICKLE / NOSE / SMASH_FIST, game px
  //  from his origin, y negative up -- {} without an atlas)
  return { ANIM, META: A.META || (RIG && RIG.META), ATLAS_SCALE: A.ATLAS_SCALE, HURTBOX: RIG && RIG.HURTBOX, point, EXPORTS: A.EXPORTS || {},
    draw: (ctx, pose, o = {}) => A.draw(ctx, pose, Object.keys(rigOpts).length ? { ...rigOpts, ...o } : o) };
}
