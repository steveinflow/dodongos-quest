// THE ELDER TREE (Skull Island's Swamp of Despair boss), toon-3D: the painted builder's 'elder_tree' pack (assets/sprites/elder_tree/, 0.75x / 1x):
// sleep rise idle roar windup swipe slam scared burn, origin = the floor under the trunk, ~340 px tall at scale 1 (the code rig's size).
// A pack without 'flee' (r2's memory trim): the flee is the 'burn' drawing (a t-loop: flee's k * 2 s) sinking into the bog by k * 340 px,
// as the code rig's flee does.  Landmarks: crown crownT crownL crownR eyes mouth head handN handF (+ ankleL/R hips).  The code rig (./elder.js)
// draws wherever the pack is not resident.  Drawn once 'elder' is listed in src/chars.js SI_ART3D.
import * as RIG from './elder.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('elder_tree', RIG);
export const { META, ATLAS_SCALE, point, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
const burn = M.ANIM.burn, painted = (p) => !!p && p.s3d >= 0.5;
const burnAt = (t) => (typeof burn === 'function' ? burn(t) : burn);
export const ANIM = { ...M.ANIM };
// (anim audit #8, 2026-10-25: the pack has its own painted root-walk 'flee' now -- the burn alias only for a pack without one)
const ownFlee = typeof M.ANIM.flee === 'function' ? M.ANIM.flee(0) : M.ANIM.flee;
if (M.ATLAS_SCALE && burn && painted(burnAt(0)) && !painted(ownFlee)) ANIM.flee = (k) => ({ ...burnAt(Math.max(0, k) * 2), _sink: Math.max(0, Math.min(1, k)) * 340 });
export function draw(ctx, pose, o = {}) {
  if (pose && pose._sink) { ctx.save(); ctx.translate(0, pose._sink * (o.scale || 1)); try { M.draw(ctx, pose, o); } finally { ctx.restore(); } return; }
  M.draw(ctx, pose, o);
}
