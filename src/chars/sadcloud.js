// SADNESS (Skull Island's Skull Palace: the first beast pair's second -- the comic's c38_sad / c39_rainbow): a droopy BLUE storm-cloud creature with big sad eyes, a wobbly frown and two long dangling arms, rain
// drizzling under it.  Shielded and comforted it SHRINKS into a tiny friendly little cloud with happy eyes that rains a little rainbow and floats away.  Kid-friendly: gloomy, never scary.
// A code rig (no painted pack planned).  Local space: origin = the middle of the cloud's UNDERSIDE (the actor floats it up by z); the cloud puffs above (y < 0), the arms and the rain hang below (y > 0, ~100 px at size 1).
// Clips: idle(t) rain(t) sob(t) drift(t) shrink(k) happy(t)   Options: o.size (the cloud's scale as it shrinks), o.rain (0..1 how hard), o.mood 0 sad .. 1 happy.
import { TAU } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 150;
export const META = { id: 'sadcloud', name: 'SADNESS', height: 150 };
export const HURTBOX = { x: 0, w: 70, h: 120 };

const STILL = { y: 0, sag: 0.5, arms: 0, sob: 0, mood: 0, look: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ y: 5 * Math.sin(t * 1.6), sag: 0.5 + 0.1 * Math.sin(t * 1.1), arms: Math.sin(t * 1.4), look: Math.sin(t * 0.7) }),
  rain: (t) => P({ y: 3 * Math.sin(t * 2), sag: 0.8, arms: Math.sin(t * 2.2) * 1.2, sob: 0.5 + 0.5 * Math.sin(t * 7) }),
  sob: (t) => P({ y: 2 * Math.sin(t * 9), sag: 0.95, arms: Math.sin(t * 3), sob: 1, look: 0 }),
  drift: (t) => P({ y: 6 * Math.sin(t * 1.9), sag: 0.6, arms: Math.sin(t * 1.8) * 1.4, look: 0.6 * Math.sin(t * 0.9) }),
  shrink: (k) => P({ y: 0, sag: 0.5 * (1 - k), arms: Math.sin(k * 8), mood: Math.min(1, k * 1.4), sob: 0 }),
  happy: (t) => P({ y: 6 * Math.sin(t * 3), sag: 0, arms: Math.sin(t * 4), mood: 1, look: 0.5 * Math.sin(t * 2) }),
};
ANIM.taunt = ANIM.rain; ANIM.hover = ANIM.idle;

const PUFFS = [[-58, -6, 28], [-34, -26, 34], [4, -36, 40], [42, -26, 34], [62, -4, 28], [0, -8, 44]];
export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, S = (o.scale || 1) * (o.size ?? 1), t = o.t || 0;
  const mood = Math.max(p.mood, o.mood || 0), rain = o.rain ?? 1;
  ctx.save(); ctx.scale(f * S, S); ctx.translate(0, p.y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // the rain: drizzle falling from the underside (a rainbow trickle once it is happy)
  if (rain > 0.02) {
    for (let i = 0; i < 9; i++) {
      const u = ((t * 1.5 + i * 0.113) % 1), x = -52 + i * 13 + 5 * Math.sin(i * 2.1), y = 22 + u * 130 * (1 - 0.3 * mood);
      ctx.strokeStyle = mood > 0.5 ? ['#ff7a7a', '#ffc44a', '#8ee07a', '#6ab8ff', '#c08aff'][i % 5] : `rgba(150,205,255,${0.9 * (1 - u * 0.5)})`;
      ctx.globalAlpha = rain * (1 - u * 0.4); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 1.6, y + 9); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // the long dangling arms: droopy noodles that sway, a round blue hand at the end
  for (const side of [-1, 1]) {
    const sw = p.arms * 9 * side, x0 = 56 * side, len = 82 - 18 * mood + 12 * p.sag;
    ctx.beginPath(); ctx.moveTo(x0, 4); ctx.bezierCurveTo(x0 + 14 * side + sw, 30, x0 - 8 * side + sw, 52, x0 + 6 * side + sw * 1.4, len);
    ctx.strokeStyle = INK; ctx.lineWidth = 15; ctx.stroke(); ctx.strokeStyle = '#8fb0dc'; ctx.lineWidth = 9; ctx.stroke();
    ctx.fillStyle = '#8fb0dc'; ctx.strokeStyle = INK; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.arc(x0 + 6 * side + sw * 1.4, len + 4, 9, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // the cloud: a lumpy body, a darker belly that sags
  const dark = 0.32 + 0.4 * (1 - mood);
  const body = () => { ctx.beginPath(); for (const [x, y, r] of PUFFS) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } };
  const g = ctx.createLinearGradient(0, -80, 0, 36); g.addColorStop(0, mood > 0.5 ? '#e0f0ff' : '#a9c4ea'); g.addColorStop(1, mood > 0.5 ? '#b0d0f0' : '#5a78a8');
  ctx.save(); ctx.lineWidth = 8; ctx.strokeStyle = INK; body(); ctx.stroke(); ctx.restore();
  ctx.fillStyle = g; body(); ctx.fill();
  ctx.fillStyle = `rgba(40,60,110,${dark * (0.5 + 0.5 * p.sag)})`; ctx.beginPath(); ctx.ellipse(0, 22 + 4 * p.sag, 62, 14 + 4 * p.sag, 0, 0, TAU); ctx.fill();   // (the sagging underside)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-24, -52, 18, 7, -0.5, 0, TAU); ctx.fill();
  // the face
  const fx = p.look * 6;
  for (const ex of [-20, 20]) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(ex + fx, -8, 10, mood > 0.5 ? 10 : 12, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + fx + p.look * 2, mood > 0.5 ? -8 : -3, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + fx + p.look * 2 + 2, mood > 0.5 ? -10 : -5, 1.8, 0, TAU); ctx.fill();
    // a tear (while sad)
    if (mood < 0.5) { const u = ((t * 1.2 + (ex > 0 ? 0.5 : 0)) % 1); ctx.fillStyle = `rgba(170,220,255,${0.9 * (1 - u)})`; ctx.beginPath(); ctx.ellipse(ex + fx, 6 + u * 26, 3, 5, 0, 0, TAU); ctx.fill(); }
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 3.4;
  if (mood > 0.5) {   // happy brows and a smile, pink cheeks
    ctx.beginPath(); ctx.moveTo(-31 + fx, -24); ctx.quadraticCurveTo(-20 + fx, -29, -9 + fx, -24); ctx.moveTo(9 + fx, -24); ctx.quadraticCurveTo(20 + fx, -29, 31 + fx, -24); ctx.stroke();
    ctx.beginPath(); ctx.arc(fx, 6, 12, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,150,170,0.6)'; for (const ex of [-34, 34]) { ctx.beginPath(); ctx.ellipse(ex + fx, 6, 7, 4.4, 0, 0, TAU); ctx.fill(); }
  } else {   // sad brows (the inner ends up) and a wobbly frown
    ctx.beginPath(); ctx.moveTo(-32 + fx, -22); ctx.lineTo(-10 + fx, -30); ctx.moveTo(10 + fx, -30); ctx.lineTo(32 + fx, -22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12 + fx, 14 + 2 * p.sob); ctx.quadraticCurveTo(-6 + fx, 6 + 3 * Math.sin(t * 9) * p.sob, fx, 9); ctx.quadraticCurveTo(6 + fx, 12 - 3 * Math.sin(t * 9) * p.sob, 12 + fx, 14 + 2 * p.sob); ctx.stroke();
  }
  ctx.restore();
}
