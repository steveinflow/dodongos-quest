// Scarlet, 3D-rendered cel sprites (loaded instead of ./scarlet.js with ?art3d=1; see src/chars.js, docs/SPRITE3D.md).
// The atlas is built by tools/sprite3d (chars/scarlet.py; the model is assets-src/scarlet/, built by
// tools/sprite3d/models/scarlet_build.py).  Any ANIM key without a rendered clip, or no atlas at all, falls back to the
// placeholder rig in ./scarlet.js.
// She is rendered in one view (facing right, the cutlass in her near hand) and mirrored when she faces left, like Ana.
import * as RIG from './scarlet.js';
import { spriteArt } from '../sprite3d.js';

export * from './scarlet.js';           // the local exports below take precedence
// (rigArt false: her placeholder rig is Ana's -- with the atlas built, a moment without a drawing (a pack still
//  loading) draws nothing rather than the wrong hero; the rig still supplies the poses)
const A = await spriteArt('scarlet', { fallback: RIG, carryStride: RIG.CARRY_STRIDE, rigArt: false, extraPacks: ['move'] });   // (extraPacks: ['move']: painter 3's movement clips, their own pack)
export const { ANIM, META, SHOOT_ORIGIN, CARRY_POINT, ATLAS_SCALE, point3d, hasNow, EXPORTS } = A;   // (EXPORTS: the atlas' DODGE_BACK_V -- her tuck's own back-dodge, src/player.js dodging; painter 3)
// strides of the rendered gaits (the engine advances the gait phase by distance); the rig's for the ones still drawn by it
export const WALK_STRIDE = A.WALK_STRIDE ?? RIG.WALK_STRIDE;
export const RUN_STRIDE = A.RUN_STRIDE ?? RIG.RUN_STRIDE;
export const CARRY_STRIDE = A.CARRY_STRIDE ?? RIG.CARRY_STRIDE;
export const PLACEHOLDER = !A.ATLAS_SCALE;    // true only while no atlas is built (the placeholder rig draws her)

/** Draw with the feet at (0, 0) (docs/CONTRACTS.md). */
export function draw(ctx, pose, o = {}) {
  A.draw(ctx, pose, o);
}
