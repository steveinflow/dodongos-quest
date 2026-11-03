// THE LEVIATHAN's coil (Skull Island Stage 1's mini-boss), toon-3D: the painted builder's 'leviathan_coil' pack (assets/sprites/leviathan_coil/):
// two drawings, 'idle' and 'flash' (its spikes lit: the whirlpool's warning), anchored at the coil's centre, export NECKBASE (where the neck
// pack attaches).  o.lit (0..1) cross-fades the 'flash' drawing over 'idle' (eased by the fight: never a pop -- flash safety); o.spin is the
// code rig's (the pack's coil stays still: the whirl is the foam, the arrows and the glow).  Drawn once 'leviathan_coil' is in SI_ART3D.
import * as RIG from './leviathan_coil.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('leviathan_coil', RIG);
export const { ANIM, META, ATLAS_SCALE, point, EXPORTS } = M;
export const NECKBASE = (EXPORTS && EXPORTS.NECKBASE) || RIG.NECKBASE;
export function draw(ctx, pose, o = {}) {
  const A = ANIM, idle = typeof A.idle === 'function' ? A.idle(0) : A.idle;
  if (!idle || !(idle.s3d >= 0.5)) { M.draw(ctx, pose, o); return; }   // (no pack: the rig, with its own spin / lit)
  M.draw(ctx, idle, o);
  const lit = Math.max(0, Math.min(1, o.lit || 0)), fl = typeof A.flash === 'function' ? A.flash(0) : A.flash;
  if (lit > 0.01 && fl) { ctx.save(); ctx.globalAlpha *= lit; M.draw(ctx, fl, o); ctx.restore(); }
}
