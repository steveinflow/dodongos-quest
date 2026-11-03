// PLACEHOLDER for Scarlet's art (gameplay testing only; never published).  It borrows Anastasia's rig so the
// engine has every ANIM key; the real Scarlet art replaces this whole file.
import * as A from './ana.js';

export const PLACEHOLDER = true;
export const ANIM = A.ANIM;
export const META = { id: 'scarlet', name: 'SCARLET', height: 176, hurtW: 22, hurtH: 150 };
export const SHOOT_ORIGIN = A.SHOOT_ORIGIN;
export const CARRY_POINT = A.CARRY_POINT;
export const WALK_STRIDE = A.WALK_STRIDE, RUN_STRIDE = A.RUN_STRIDE, CARRY_STRIDE = A.CARRY_STRIDE;
export function draw(ctx, pose, o) {
  ctx.save(); ctx.scale(1.06, 1.06);
  A.draw(ctx, pose, o);
  ctx.restore();
  ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff5a5a'; ctx.fillText('SCARLET (placeholder)', 0, -190); ctx.restore();
}
