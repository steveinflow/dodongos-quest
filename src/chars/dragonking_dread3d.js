// THE DREAD KING, 3D-rendered painted sprites (the finale: docs/FINALE.md).  Atlas 'dragonking_dread' (its painted
// look: assets/sprites/dragonking_dread_painted/, unhanded, 0.75x / 1x / 2x), built by tools/sprite3d; for any clip it
// lacks (and while a pack decodes) the placeholder rig in ./dragonking_dread.js draws him.  Clips, timings and
// landmarks: see ./dragonking_dread.js.  The curse's light stays 2D, at the atlas' landmarks: the green aura behind him,
// the crown re-forged in green fire (crown -> crownUp), its blaze on the cast (flare), all burning out in the fall
// (curse); green fire in his casting hand (castWind / cast), his mouth blazing in the beam, a glint on the raised
// spade before the tail sweep (tailTip).  The painted model carries his eyes and cracks itself.
import * as RIG from './dragonking_dread.js';
import { spriteArt } from '../sprite3d.js';
import { TAU } from '../rig.js';

export * from './dragonking_dread.js';        // the local exports below take precedence
const A = await spriteArt('dragonking_dread', { fallback: RIG, only: 'painted' });   // (built painted only)
export const { ATLAS_SCALE, point3d } = A;
export const META = A.META || RIG.META;
export const PLACEHOLDER = !A.ATLAS_SCALE;

// the atlas' poses carry the rig's fields too (dclip, flare, curse): the 2D effects over the drawings read them
const one = (f, a) => (typeof f === 'function' ? f(a) : f);
export const ANIM = {};
for (const key of Object.keys(A.ANIM)) {
  const spr = A.ANIM[key], rig = RIG.ANIM[key];
  ANIM[key] = rig === undefined ? spr
    : typeof spr === 'function' || typeof rig === 'function' ? (a) => Object.assign({}, one(rig, a), one(spr, a))
      : Object.assign({}, rig, spr);
}
ANIM.idle = ANIM.fly;                         // (his idle is the wing beat: the atlas' fly)

/** his middle (scale 1, above the origin) for a pose: halfway from the hips up to the crown (the fly drawings' box
 * centre within ~4 px); the rig's body centre without an atlas */
function midOf(pose) {
  const h = A.point3d(pose, 'hips'), c = A.point3d(pose, 'crown');
  return h && c ? [(h[0] + c[0]) / 2, (h[1] + c[1]) / 2] : null;
}
/** body centre above the origin (scale 1): the duel positions him by it */
export const BODY_Y = (midOf(one(ANIM.fly, 0)) || [0, RIG.BODY_Y])[1];
/** [x, y] of his middle for a pose (scale 1, facing right, from the origin): the duel's hit circles follow it */
export function bodyOf(pose) { return midOf(pose) || [0, RIG.BODY_Y]; }

export function mouthOf(pose) {
  const m = A.point3d(pose, 'mouth'), f = A.point3d(pose, 'mouthF');
  return m ? [m[0], m[1], f ? Math.atan2(f[1] - m[1], f[0] - m[0]) : 0] : RIG.mouthOf(pose);
}
export function crownOf(pose) { return A.point3d(pose, 'crown') || RIG.crownOf(pose); }
/** fireball spawn for the cast (scale 1, facing right) */
export function castHandOf(pose) { return A.point3d(pose, 'castHand') || RIG.mouthOf(pose).slice(0, 2); }
export function tailTipOf(pose) { return A.point3d(pose, 'tailTip') || null; }

export function draw(ctx, pose, o = {}) {
  if (!pose || !(pose.s3d >= 0.5)) { A.draw(ctx, pose, o); return; }     // (the rig: its own aura, cracks and crown)
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0, curse = Math.max(0, Math.min(1, pose.curse ?? 1));
  const at = (lm) => { const q = A.point3d(pose, lm); return q ? [q[0] * f * S, q[1] * S] : null; };
  const mid = midOf(pose);
  if (curse > 0.02 && mid) {                  // the aura, behind him
    const x = mid[0] * f * S, y = mid[1] * S, r = 230 * S;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 10, x, y, r);
    g.addColorStop(0, `rgba(90,255,120,${0.22 * curse})`); g.addColorStop(0.5, `rgba(40,200,90,${0.1 * curse})`); g.addColorStop(1, 'rgba(20,160,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  A.draw(ctx, pose, o);
  const c = at('crown'), u = at('crownUp');
  if (curse > 0.02 && c && u) {
    // the crown re-forged in green fire: five tongues rising off its points (crownUp: its front tip; the crown runs
    // ~40 px back from there), along the crown's own up (crown -> crownUp)
    const L = Math.hypot(u[0] - c[0], u[1] - c[1]) || 1, ux = (u[0] - c[0]) / L, uy = (u[1] - c[1]) / L;
    const bx = f * uy, by = -f * ux;          // (back along the crown: its up turned away from his face)
    const k = S * 1.15;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const h = (24 + 9 * Math.sin(t * 9 + i * 1.7)) * k, s = (4 + i * 8) * k;
      const x0 = u[0] + bx * s - ux * 4 * k, y0 = u[1] + by * s - uy * 4 * k;
      const tx = x0 + ux * h + Math.sin(t * 5 + i) * 4 * k, ty = y0 + uy * h;
      const gr = ctx.createLinearGradient(x0, y0, tx, ty);
      gr.addColorStop(0, `rgba(160,255,150,${0.85 * curse})`); gr.addColorStop(1, 'rgba(40,220,80,0)');
      ctx.fillStyle = gr; ctx.beginPath();
      ctx.moveTo(x0 - bx * 6 * k, y0 - by * 6 * k);
      ctx.quadraticCurveTo(x0 + ux * h * 0.6 + Math.sin(t * 7 + i) * 6 * k, y0 + uy * h * 0.6, tx, ty);
      ctx.quadraticCurveTo(x0 + ux * h * 0.4 + bx * 2 * k, y0 + uy * h * 0.4 + by * 2 * k, x0 + bx * 6 * k, y0 + by * 6 * k);
      ctx.closePath(); ctx.fill();
    }
    if (pose.flare > 0.02) {                   // the cast: the crown blazes
      const fx = u[0] + bx * 20 * k, fy = u[1] + by * 20 * k, R = 70 * S * 1.3;
      const fg = ctx.createRadialGradient(fx, fy, 2, fx, fy, R);
      fg.addColorStop(0, `rgba(210,255,200,${0.8 * Math.min(1, pose.flare) * curse})`); fg.addColorStop(1, 'rgba(60,230,90,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx, fy, R, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // the tail's wind-up: a brief glint on the raised spade (tailTip) just before the sweep -- small and dark against the
  // purple clouds otherwise: a white star, a warm bloom, an ink ring
  const wk = pose.dclip === 'tailWind' ? pose.wk ?? 0 : 0;
  const gl = Math.min(1, Math.max(0, (wk - 0.55) / 0.15)) * Math.min(1, Math.max(0, (1 - wk) / 0.15));
  const tip = gl > 0.02 ? at('tailTip') : null;
  if (tip) {
    const r = (7 + 9 * gl * (0.85 + 0.15 * Math.sin(t * 22))) * S * 1.3;
    ctx.save();
    const bl = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], r * 1.6);
    bl.addColorStop(0, `rgba(255,236,170,${0.55 * gl})`); bl.addColorStop(1, 'rgba(255,214,110,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(tip[0], tip[1], r * 1.6, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const star = () => {
      ctx.beginPath();
      for (let j = 0; j < 8; j++) { const rr = j % 2 ? r * 0.22 : r, a = 0.4 + j * Math.PI / 4; const x = tip[0] + Math.cos(a) * rr, y = tip[1] + Math.sin(a) * rr; if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
    };
    ctx.lineJoin = 'round'; ctx.globalAlpha = 0.6 * gl; ctx.strokeStyle = '#21141c'; ctx.lineWidth = 3.5 * S * 1.3; star(); ctx.stroke();
    ctx.globalAlpha = gl; ctx.fillStyle = '#ffffff'; star(); ctx.fill();
    ctx.restore();
  }
  // the cast: green fire gathering in his casting hand (castWind: flare = k; cast: 1 - k, gone as the spread leaves);
  // the beam: his mouth blazing
  const hand = (pose.dclip === 'castWind' || pose.dclip === 'cast') && pose.flare > 0.02 ? at('castHand') : null;
  const mouth = pose.dclip === 'beam' ? at('mouth') : null;
  if (hand || mouth) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, r, a) => {
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, `rgba(235,255,225,${a})`); g.addColorStop(0.3, `rgba(110,255,130,${0.7 * a})`); g.addColorStop(1, 'rgba(40,210,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    };
    if (hand) glow(hand[0], hand[1], (30 + 26 * Math.min(1, pose.flare)) * S, 0.9 * Math.min(1, pose.flare));
    if (mouth) glow(mouth[0], mouth[1], (44 + 6 * Math.sin(t * 20)) * S, 0.8);
    ctx.restore();
  }
}
