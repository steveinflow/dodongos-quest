// SADNESS, the Sad Cloud (Skull Island's Skull Palace: a feeling), toon-3D: the painted builder's 'sad_cloud' pack (assets/sprites/sad_cloud/, 0.75x / 1x):
// idle rain sob drift shrink happy, origin = the middle of the cloud's UNDERSIDE (as the code rig: the actor floats it up by z), ~150 px tall.
// The happy little cloud is its own lighter body in 'happy' (the game keeps o.size 0.36 for it); 'shrink' (k) goes sad -> "oh!" -> happy.
// o.size scales a painted pose (the code rig reads it itself).  Landmarks: eyes mouth top handN handF.  The code rig (./sadcloud.js) draws
// wherever the pack is not resident.  Drawn once 'sadcloud' is listed in src/chars.js SI_ART3D.
import * as RIG from './sadcloud.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('sad_cloud', RIG);
export const { ANIM, META, ATLAS_SCALE, point, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
export const HEIGHT = RIG.HEIGHT;
const painted = (p) => !!p && p.s3d >= 0.5;
/** the drizzle under a painted cloud (the code rig's own, o.rain 0..1; a rainbow trickle once it is happy): the rain is the cloud's attack, it must show */
function drizzle(ctx, o) {
  const f = o.facing || 1, S = (o.scale || 1) * (o.size ?? 1), t = o.t || 0, mood = o.mood || 0, rain = o.rain ?? 1;
  if (rain <= 0.02) return;
  ctx.save(); ctx.scale(f * S, S); ctx.lineCap = 'round'; ctx.lineWidth = 2.6;
  for (let i = 0; i < 9; i++) {
    const u = ((t * 1.5 + i * 0.113) % 1), x = -52 + i * 13 + 5 * Math.sin(i * 2.1), y = 22 + u * 130 * (1 - 0.3 * mood);
    ctx.strokeStyle = mood > 0.5 ? ['#ff7a7a', '#ffc44a', '#8ee07a', '#6ab8ff', '#c08aff'][i % 5] : `rgba(150,205,255,${0.9 * (1 - u * 0.5)})`;
    ctx.globalAlpha = rain * (1 - u * 0.4); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 1.6, y + 9); ctx.stroke();
  }
  ctx.restore();
}
export function draw(ctx, pose, o = {}) {
  if (!painted(pose)) { M.draw(ctx, pose, o); return; }
  drizzle(ctx, o);
  M.draw(ctx, pose, { ...o, scale: (o.scale || 1) * (o.size ?? 1) });
}
