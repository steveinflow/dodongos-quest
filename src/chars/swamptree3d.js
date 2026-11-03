// The SWAMP TREE (Skull Island's Swamp of Despair), toon-3D: tools/sprite3d/chars/swamp_tree.py -> assets/sprites/swamp_tree/ (1x only: enemies always use 1x): idle walk (stride 40 px) taunt windup swipe hurt
// flee (stride 41 px; the roots plant at ~2.28 px/frame at scale 1).  Landmarks (point(pose, name)): crown (the flames), branch, branchF, head, eyes, mouth, ankleL/R, hips.  Export SWIPE [100, -66].  Saplings are the
// same pack at draw scale 0.62.  Not in the pack, so they stay on the code rig (./swamptree.js): burn (the Elder's), grow (the sprout), fly / down / getup.
// The pack has no fire baked: a fleeing tree gets flames drawn on its crown landmark here.
import * as RIG from './swamptree.js';
import { mmArt } from './mm3d.js';
import { INK } from '../config.js';

const M = await mmArt('swamp_tree', RIG);
export const { META, ATLAS_SCALE, point, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
export const ANIM = M.ANIM;
function flame(ctx, x, y, s, t, seed) {
  const sw = Math.sin(t * 11 + seed) * 3 * s, h = (24 + 8 * Math.sin(t * 13 + seed * 2)) * s;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(-7 * s, 0); ctx.quadraticCurveTo(-9 * s, -h * 0.5, sw, -h); ctx.quadraticCurveTo(9 * s, -h * 0.5, 7 * s, 0); ctx.closePath();
  ctx.fillStyle = '#ff7a1e'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4 * s, 0); ctx.quadraticCurveTo(-5 * s, -h * 0.35, sw * 0.6, -h * 0.65); ctx.quadraticCurveTo(5 * s, -h * 0.35, 4 * s, 0); ctx.closePath(); ctx.fillStyle = '#ffd84a'; ctx.fill();
  ctx.restore();
}
export const draw = (ctx, pose, o = {}) => {
  M.draw(ctx, pose, o);
  if (pose && pose.s3d >= 0.5 && pose.clip === 'flee') {   // (it is on fire: a glow and small flames round the crown)
    const c = point(pose, 'crown');
    if (!c) return;
    const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
    ctx.save(); ctx.scale(f * S, S);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3; ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.ellipse(c[0], c[1] + 10, 54, 40, 0, 0, Math.PI * 2); ctx.restore();
    for (const [dx, dy, s] of [[-26, 6, 1.0], [0, -10, 1.3], [26, 4, 1.0], [-10, 18, 0.8], [14, 20, 0.8]]) flame(ctx, c[0] + dx, c[1] + dy, s, t, dx);
    ctx.restore();
  }
};
