// THE DREAD KING (the finale: docs/FINALE.md), PLACEHOLDER rig until the painted atlas assets/sprites/dragonking_dread/
// exists (src/chars/dragonking_dread3d.js draws the atlas and falls back to this).  The Dragon King's rig scaled up and
// darkened, cursed green: glowing cracks, burning green eyes, his crown re-forged in green fire, a green aura.
//
// Local space (as the King's): origin = the point under him, +x = facing, y down.  The sky duel positions him by his
// body centre (BODY_Y above the origin).
// Clips the art agent builds to (atlas 'dragonking_dread', see docs/FINALE.md "Art hooks"):
//   fly (t, a 0.9 s wing beat)   castWind (k, 40 f: rears, the crown flares)   cast (k, 24 f: flings the fireball spread
//   at k .3)   tailWind (k, 50 f: coils, tail raised)   tail (k, 30 f: the sweep, the tail low across the lane by k .35)
//   chargeWind (k, 50 f: draws back)   charge (t, a held lunge pose)   beam (t, mouth open: the breath clash)
//   hurt (k, 20 f)   fall (k, 120 f: the green burns out of him and he shrinks back to the tiny King)
// Landmarks: mouth / mouthF (beam origin and angle), crown, tailTip, castHand (fireball spawn).
import * as DK from './dragonking.js';
import { TAU, clamp } from '../rig.js';

const SC = 1.3;                               // the King's rig at this scale is the placeholder's size
export const BODY_Y = -190;                   // body centre above the origin (scale 1)
export const META = { height: 330, name: 'THE DREAD KING' };
const TAG = (p, extra) => Object.assign({}, p, extra);
export const ANIM = {
  fly: (t) => TAG(DK.ANIM.hover(t), { dclip: 'fly' }),
  castWind: (k) => TAG(DK.ANIM.summon(clamp(k, 0, 1) * 0.45), { dclip: 'castWind', flare: k }),
  cast: (k) => TAG(DK.ANIM.roar((k || 0) * 0.5), { dclip: 'cast', flare: 1 - (k || 0) }),
  tailWind: (k) => TAG(DK.ANIM.clawWind(k), { dclip: 'tailWind', wk: clamp(k || 0, 0, 1) }),   // (wk: the spade's glint)
  tail: (k) => TAG(DK.ANIM.claw(k), { dclip: 'tail' }),
  chargeWind: (k) => TAG(DK.ANIM.diveWind(k), { dclip: 'chargeWind' }),
  charge: (t) => TAG(DK.ANIM.dive(t), { dclip: 'charge' }),
  beam: (t) => TAG(DK.ANIM.breath(0.55 + 0.05 * Math.sin((t || 0) * 18)), { dclip: 'beam' }),
  hurt: (k) => TAG(DK.ANIM.hurt(k), { dclip: 'hurt' }),
  fall: (k) => TAG(DK.ANIM.defeated(clamp(k, 0, 1)), { dclip: 'fall', curse: clamp(1 - (k || 0) * 1.6, 0, 1) }),
};
ANIM.idle = ANIM.fly;
ANIM.roar = (t) => TAG(DK.ANIM.roar(t), { dclip: 'cast', flare: 0.7 });

/** [x, y, angle] of the mouth (scale 1, facing right, relative to the origin) */
export function mouthOf(p) { const [x, y, a] = DK.mouthOf(p); return [x * SC, y * SC, a]; }
export function crownOf(p) { const [x, y] = DK.crownOf(p); return [x * SC, y * SC]; }
/** fireball spawn for the cast; the tail tip (no tail landmark in the placeholder) */
export function castHandOf(p) { return mouthOf(p).slice(0, 2); }
export function tailTipOf() { return null; }

// the cracks: fixed strokes over the torso (body-local, scale 1), drawn glowing
const CRACKS = [[[-30, -150], [-18, -130], [-24, -112], [-10, -96]], [[18, -170], [10, -150], [22, -128]], [[-6, -210], [4, -190], [-4, -174]],
  [[-44, -100], [-30, -90], [-36, -72]]];

export function draw(ctx, pose, o = {}) {
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  const p = pose || ANIM.fly(t);
  const curse = p.curse ?? 1;
  ctx.save();
  if (curse > 0.02) {                           // the aura
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = 230 * S, cy = BODY_Y * S;
    const g = ctx.createRadialGradient(0, cy, 10, 0, cy, r);
    g.addColorStop(0, `rgba(90,255,120,${0.28 * curse})`); g.addColorStop(0.5, `rgba(40,200,90,${0.12 * curse})`); g.addColorStop(1, 'rgba(20,160,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, cy, r, 0, TAU); ctx.fill(); ctx.restore();
  }
  const prevF = ctx.filter;
  if (curse > 0.02 && typeof ctx.filter === 'string') ctx.filter = `saturate(${1 - 0.35 * curse}) brightness(${1 - 0.22 * curse})`;
  DK.draw(ctx, p, { ...o, scale: S * SC });
  ctx.filter = prevF || 'none';
  if (curse > 0.02) {
    const k = S * SC;
    ctx.save(); ctx.scale(f, 1); ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pulse = 0.75 + 0.25 * Math.sin(t * 6);
    for (const pass of [[7, `rgba(80,255,110,${0.35 * curse * pulse})`], [2.4, `rgba(200,255,190,${0.9 * curse})`]]) {
      ctx.lineWidth = pass[0] * k; ctx.strokeStyle = pass[1];
      for (const cr of CRACKS) { ctx.beginPath(); cr.forEach(([x, y], i) => (i ? ctx.lineTo(x * k * 0.75 + (p.x || 0) * k, y * k * 0.75) : ctx.moveTo(x * k * 0.75 + (p.x || 0) * k, y * k * 0.75))); ctx.stroke(); }
    }
    // the crown re-forged in green fire
    const [cx, cy] = DK.crownOf(p);
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.32, h = (26 + 10 * Math.sin(t * 9 + i * 1.7)) * k;
      const x0 = cx * k + Math.sin(a) * 18 * k, y0 = cy * k - 6 * k;
      const gr = ctx.createLinearGradient(x0, y0, x0, y0 - h);
      gr.addColorStop(0, `rgba(160,255,150,${0.9 * curse})`); gr.addColorStop(1, 'rgba(40,220,80,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x0 - 6 * k, y0); ctx.quadraticCurveTo(x0 + Math.sin(t * 7 + i) * 6 * k, y0 - h * 0.6, x0 + Math.sin(t * 5 + i) * 4 * k, y0 - h);
      ctx.quadraticCurveTo(x0 + 2 * k, y0 - h * 0.4, x0 + 6 * k, y0); ctx.closePath(); ctx.fill();
    }
    // burning eyes
    const [mx, my] = DK.mouthOf(p);
    const ex = (cx * 0.55 + mx * 0.45) * k, ey = (cy * 0.35 + my * 0.65) * k - 10 * k;
    const eg = ctx.createRadialGradient(ex, ey, 1, ex, ey, 18 * k);
    eg.addColorStop(0, `rgba(220,255,210,${0.95 * curse})`); eg.addColorStop(0.3, `rgba(90,255,120,${0.6 * curse})`); eg.addColorStop(1, 'rgba(40,200,80,0)');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, 18 * k, 0, TAU); ctx.fill();
    if (p.flare) {                              // the cast: the crown blazes
      const fg = ctx.createRadialGradient(cx * k, cy * k, 2, cx * k, cy * k, 70 * k);
      fg.addColorStop(0, `rgba(210,255,200,${0.8 * p.flare})`); fg.addColorStop(1, 'rgba(60,230,90,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx * k, cy * k, 70 * k, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
