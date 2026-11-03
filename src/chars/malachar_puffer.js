// POOF, the pufferfish Malachar shrinks into (Skull Island's finale -- the comic's c42_puff / c42_bowl): a small, round, furious PURPLE pufferfish with big eyes and angry brows, a pouty mouth, little fins and a tiny split-mask
// patch round the eyes (white / black halves); its spikes stand up when puffed.  Kid-friendly: grumpy, never scary.  Dodongo bowls it up into a fishbowl: "Somebody's going in the aquarium."
// A code-drawn stand-in built to the painted builder's clip contract (assets/sprites/malachar_puffer, src/chars/malachar_puffer3d.js).  Local space: origin = the floor under it, +x = facing; ~44 px deflated, ~64 px puffed.
// Clips: puff(k) idle(t) bounce(t) bowl(t); o.bowl draws a round glass fishbowl of water round it (Dodongo holds it up).
import { TAU, keys } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 64;
export const META = { id: 'malachar_puffer', name: 'POOF', height: 64 };
export const HURTBOX = { x: 0, w: 28, h: 50 };

const STILL = { y: 0, puff: 1, sx: 1, sy: 1, tilt: 0, fin: 0, mouth: 0, grump: 1, spin: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  puff: (k) => P({ puff: 0.35 + 0.65 * Math.min(1, k * 1.2), y: -8 * Math.sin(k * Math.PI), sx: 1 + 0.12 * Math.sin(k * Math.PI * 3), fin: Math.sin(k * 14) }),
  idle: (t) => P({ y: -22 + 4 * Math.sin(t * 3), tilt: 4 * Math.sin(t * 2), fin: Math.sin(t * 9), sx: 1 + 0.03 * Math.sin(t * 4) }),
  bounce: (t) => { const u = (t * 2.4) % 1, h = Math.abs(Math.sin(u * Math.PI)), s = u < 0.12 || u > 0.88 ? 1 : 0; return P({ y: -34 * h, sy: s ? 0.78 : 1.08 - 0.06 * h, sx: s ? 1.2 : 0.96, tilt: 12 * Math.sin(u * TAU), fin: Math.sin(t * 14), mouth: h }); },
  bowl: (t) => P({ puff: 0.3, y: -14 + 3 * Math.sin(t * 2), tilt: 6 * Math.sin(t * 1.6), fin: Math.sin(t * 6) * 1.4, grump: 1 }),
};

ANIM.hover = ANIM.idle; ANIM.taunt = ANIM.bounce;   // (a story's timed clip names: src/cutscene.js TIMED)

function spikes(ctx, r, puff) {
  const n = 14, len = 4 + 10 * puff;
  ctx.fillStyle = '#d6b0ff'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n + 0.2; if (Math.sin(a) > 0.55 && Math.cos(a) > -0.2 && Math.cos(a) < 0.9 && false) continue;
    const bx = Math.cos(a) * r, by = Math.sin(a) * r;
    ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r); ctx.lineTo(Math.cos(a) * (r + len), Math.sin(a) * (r + len)); ctx.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r); ctx.closePath(); ctx.fill(); ctx.stroke();
    void bx; void by;
  }
}

/** the fishbowl of a story's / the finale's bowl beat, in two layers round the fish drawn between them: 'back' = the water, 'front' = the glass, its gloss and rim (the painted pack's wrapper uses this too: ./malachar_puffer3d.js).  Local space as draw. */
export function drawBowl(ctx, o = {}, layer = 'back') {
  const f = o.facing || 1, S = o.scale || 1, br = 40, bcy = -br - 2;
  ctx.save(); ctx.scale(f * S, S);
  if (layer === 'back') {
    ctx.fillStyle = 'rgba(150,215,255,0.28)'; ctx.beginPath(); ctx.arc(0, bcy, br, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(110,190,240,0.34)'; ctx.beginPath(); ctx.arc(0, bcy, br, 0.1, Math.PI - 0.1); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(0, bcy, br, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, bcy, br - 7, Math.PI * 1.15, Math.PI * 1.42); ctx.stroke();
    ctx.fillStyle = '#e8dcc0'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, bcy - br + 1, br * 0.56, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  if (o.bowl) drawBowl(ctx, o, 'back');
  ctx.save(); ctx.scale(f * S, S);
  const r = 17 + 11 * p.puff, cy = -(r + 1) + p.y;
  if (o.bowl) ctx.translate(0, -7);
  ctx.translate(0, cy); ctx.rotate(p.tilt * Math.PI / 180); ctx.scale(p.sx, p.sy);
  // the tail and fins
  ctx.fillStyle = '#7a3ab0'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-r + 4, 0); ctx.lineTo(-r - 14, -9 + 3 * p.fin); ctx.lineTo(-r - 10, 0); ctx.lineTo(-r - 14, 10 - 3 * p.fin); ctx.closePath(); ctx.fill(); ctx.stroke();
  spikes(ctx, r, p.puff);
  // the body: round and purple, a pale belly
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 2, 0, 0, r * 1.1); g.addColorStop(0, '#c07ae8'); g.addColorStop(1, '#6a2aa0');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip(); ctx.fillStyle = '#e0c4f4'; ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.75, r * 0.9, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  // the little side fin
  ctx.fillStyle = '#9a52cc'; ctx.beginPath(); ctx.moveTo(-r * 0.1, r * 0.1); ctx.quadraticCurveTo(-r * 0.8, r * 0.3 + 6 * p.fin, -r * 0.5, r * 0.6); ctx.quadraticCurveTo(-r * 0.2, r * 0.4, -r * 0.1, r * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
  // the face: a split-mask patch round the eyes (white left, black right), big angry eyes, a pout
  const ex = r * 0.42, ey = -r * 0.22, er = r * 0.3;
  ctx.save(); ctx.beginPath(); ctx.ellipse(r * 0.34, ey, r * 0.62, r * 0.34, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = '#f2ecf6'; ctx.fillRect(-r, -r, r * 1.34, 2 * r); ctx.fillStyle = '#18101e'; ctx.fillRect(r * 0.34, -r, r, 2 * r); ctx.restore();
  ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(r * 0.34, ey, r * 0.62, r * 0.34, 0, 0, TAU); ctx.stroke();
  for (const dx of [-0.1, 0.8]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + (dx - 0.4) * r * 0.5, ey, er, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + (dx - 0.4) * r * 0.5 + 2, ey + 1, er * 0.46, 0, TAU); ctx.fill();
  }
  ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ex - r * 0.52, ey - er - 4); ctx.lineTo(ex - r * 0.04, ey - er + 2); ctx.moveTo(ex + r * 0.5, ey - er + 2); ctx.lineTo(ex + r * 0.96, ey - er - 4); ctx.stroke();   // angry brows
  ctx.lineWidth = 2.6; ctx.beginPath();
  if (p.mouth > 0.4) ctx.ellipse(ex + r * 0.3, r * 0.34, 5, 4, 0, 0, TAU); else { ctx.moveTo(ex + r * 0.05, r * 0.4); ctx.quadraticCurveTo(ex + r * 0.3, r * 0.26, ex + r * 0.6, r * 0.4); }
  ctx.stroke();
  ctx.restore();
  if (o.bowl) drawBowl(ctx, o, 'front');
  void t;
}
