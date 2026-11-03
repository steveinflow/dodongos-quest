// FEAR (Skull Island's Skull Palace: the second beast pair's first -- the comic's c38_fear / c39_light / c39_pop): a tall, spindly, shivering PALE-YELLOW shadow creature with two wide white staring eyes and long thin arms.
// It looms and stares; LIGHT pushes it back and it shrinks, and a brave hit then pops it like a soap bubble.  Kid-friendly: spooked, never scary.
// A code rig (no painted pack planned).  Local space: origin = the floor under it, +x = facing; ~190 px tall at size 1 (the game draws it smaller as light pushes it back: o.size).
// Clips: idle(t) loom(k) stare(t) lunge(k) push(k) hurt(t) pop(k)   Options: o.size, o.shiver (extra tremble), o.glow (the stare's wide-eyed flash).
import { TAU } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 190;
export const META = { id: 'fearshade', name: 'FEAR', height: 190 };
export const HURTBOX = { x: 0, w: 40, h: 170 };

const STILL = { y: 0, lean: 0, arms: 0.3, stretch: 1, shake: 0.4, eyes: 1, cover: 0, pop: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ y: 2 * Math.sin(t * 2.2), lean: 2 * Math.sin(t * 1.3), arms: 0.3 + 0.1 * Math.sin(t * 1.7), shake: 0.5 }),
  loom: (k) => P({ stretch: 1 + 0.18 * Math.sin(Math.min(1, k) * Math.PI / 2), arms: 0.3 + 0.7 * k, lean: 6 * k, shake: 0.6, eyes: 1.1 }),
  stare: (t) => P({ y: 2 * Math.sin(t * 2.2), lean: 8, arms: 0.9 + 0.1 * Math.sin(t * 4), shake: 0.7, eyes: 1.15 }),
  lunge: (k) => P({ stretch: 1.12 + 0.16 * Math.sin(Math.min(1, k) * Math.PI), arms: 1, lean: 14 * Math.sin(Math.min(1, k) * Math.PI), shake: 0.9, eyes: 1.2 }),
  push: (k) => P({ y: -4 * Math.sin(k * Math.PI), lean: -14 * Math.sin(Math.min(1, k) * Math.PI), arms: 0.9, cover: 1, shake: 1, eyes: 0.8 }),
  hurt: (t) => P({ lean: -10, shake: 1.2, cover: 0.7, eyes: 0.8, arms: 0.8 + 0.1 * Math.sin(t * 20) }),
  pop: (k) => P({ stretch: 1 - 0.2 * k, pop: k, shake: 1 }),
};
ANIM.taunt = ANIM.stare; ANIM.hover = ANIM.idle;

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, S = (o.scale || 1) * (o.size ?? 1), t = o.t || 0;
  const sh = (p.shake + (o.shiver || 0)) * 1.6;
  ctx.save(); ctx.scale(f * S, S);
  const jx = sh * Math.sin(t * 47), jy = sh * 0.5 * Math.sin(t * 53 + 1);
  ctx.translate(jx, p.y + jy); ctx.rotate(p.lean * Math.PI / 180);
  if (p.pop > 0) ctx.globalAlpha = Math.max(0, 1 - p.pop);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const H = 170 * p.stretch, hy = -H + 26, ty = -H * 0.72;   // (head centre, shoulder line)
  const col = '#e6d968', colD = '#b9a73a', colL = '#f6efa6';
  const limb = (pts, w) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], pts[i][2], pts[i][3]); ctx.strokeStyle = INK; ctx.lineWidth = w + 5; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
  // (the long thin legs, knock-kneed and trembling)
  const kn = 4 * Math.sin(t * 31);
  limb([[-8, ty + 70], [-14 + kn, -H * 0.3, -6 + kn, -H * 0.16], [-2, -H * 0.1, -12, 0]], 7);
  limb([[8, ty + 70], [14 - kn, -H * 0.3, 6 - kn, -H * 0.16], [2, -H * 0.1, 12, 0]], 7);
  // (the arms: long, thin, trembling; they reach up and forward as it looms)
  for (const side of [-1, 1]) {
    const a = p.arms, x0 = 12 * side, y0 = ty + 6, ex = x0 + (26 + 40 * a) * side * (side > 0 ? 1.15 : 0.7), ey = y0 + 78 - 140 * a + 4 * Math.sin(t * 17 + side);
    limb([[x0, y0], [x0 + 22 * side, y0 + 44 - 46 * a, ex, ey]], 6.4);
    for (let k = -1; k <= 1; k++) limb([[ex, ey], [ex + (6 + 3 * k) * side, ey - 8, ex + (9 + 4 * k) * side, ey - 15 + 5 * k * side]], 3);
  }
  // (the tattered shroud: a shadow-tunic from the shoulders to the knees with a ragged hem that wavers)
  const shroud = () => {
    ctx.beginPath(); ctx.moveTo(-15, ty);
    ctx.bezierCurveTo(-22, ty + 30, -30, -H * 0.36, -30, -H * 0.2);
    for (let i = 0; i <= 5; i++) { const x = -30 + i * 12, y = -H * 0.12 + (i % 2 ? 16 : 0) + 3 * Math.sin(t * 3 + i); ctx.lineTo(x, y); }
    ctx.bezierCurveTo(30, -H * 0.36, 22, ty + 30, 15, ty); ctx.closePath();
  };
  ctx.save(); ctx.lineWidth = 7; ctx.strokeStyle = INK; shroud(); ctx.stroke(); ctx.restore();
  const g = ctx.createLinearGradient(0, ty, 0, -H * 0.1); g.addColorStop(0, col); g.addColorStop(1, colD);
  ctx.fillStyle = g; shroud(); ctx.fill();
  ctx.save(); shroud(); ctx.clip(); ctx.fillStyle = 'rgba(80,70,10,0.2)'; ctx.fillRect(2, -H, 40, H); ctx.restore();
  // (the head: round, with a thin neck)
  ctx.beginPath(); ctx.ellipse(0, hy, 25, 29, 0, 0, TAU); ctx.fillStyle = INK; ctx.save(); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  const gh = ctx.createLinearGradient(0, hy - 29, 0, hy + 29); gh.addColorStop(0, colL); gh.addColorStop(1, col);
  ctx.fillStyle = gh; ctx.beginPath(); ctx.ellipse(0, hy, 25, 29, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = colD; ctx.lineWidth = 2.4; for (const dx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(dx * 0.7, hy - 29); ctx.quadraticCurveTo(dx * 0.4 + 4 * Math.sin(t * 5 + dx), hy - 40, dx * 0.6, hy - 46); ctx.stroke(); }   // (a few wispy hairs standing on end)
  // the face: two huge round white staring eyes with tiny pupils, a small round "o" mouth
  const ey = hy - 2, er = 13 * p.eyes, sx = Math.sin(t * 0.9) * 1.6;
  for (const ex of [-11, 11]) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.ellipse(ex, ey, er, er * 1.1, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + sx + 2, ey + 1, 2.6, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#5a4a10'; ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(0, ey + 22, 4.4, 6 * (0.8 + 0.4 * Math.sin(t * 9)), 0, 0, TAU); ctx.fill(); ctx.stroke();
  // (a hand over its eyes when light pushes it back)
  if (p.cover > 0.3) {
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(-2, ey, 22, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 8 - 2, ey - 7); ctx.lineTo(i * 8 - 2, ey + 7); ctx.stroke(); }
  }
  ctx.restore();
}
