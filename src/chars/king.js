// THE GOOD KING (Skull Island's finale -- Scarlet's father; the comic's c32_father / c43_catch / e_thanks): a broad, kindly middle-aged king with a full auburn-red beard, a gentle smile, a gold crown, a royal-blue robe with a gold
// sun emblem on the chest and a sea-blue sash.  For most of the quest he is trapped in the giant purple crystal above Malachar's throne (drawn by the stage as a silhouette); the finale's stories cast him.
// A code rig (no painted pack planned).  Local space: origin = the floor under him, +x = facing; ~190 px tall at scale 1.
// Clips: idle(t) talk(t) bow(k) point(t) cheer(t) weak(t) float(t) grave(t) walk(ph)
import { TAU, DEG } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 190;
export const META = { id: 'king', name: 'THE KING', height: 190 };
export const HURTBOX = { x: 0, w: 44, h: 180 };

const STILL = { y: 0, lean: 0, armF: 8, armB: 8, bow: 0, eyes: 'open', mouth: 0, sit: 0, brow: 0, float: 0, joy: 0.7 };   // (joy 0..1: how wide the kind smile is; brow +1 raised / -1 worried -- never a frown)
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ y: 1.2 * Math.sin(t * 1.8), armF: 8 + 3 * Math.sin(t * 1.5), armB: 8 - 3 * Math.sin(t * 1.5) }),
  talk: (t) => P({ y: 1.2 * Math.sin(t * 2), armF: 22 + 14 * Math.sin(t * 3), armB: 8, mouth: Math.max(0, Math.sin(t * 12)) }),
  bow: (k) => P({ bow: Math.sin(Math.min(1, k) * Math.PI) * 26, armF: 6, armB: 6, joy: 0.85 }),
  point: (t) => P({ armF: 84 + 4 * Math.sin(t * 2), armB: 8, mouth: Math.max(0, Math.sin(t * 9)) * 0.7, brow: 0.6, joy: 0.35 }),
  cheer: (t) => P({ y: -3 * Math.abs(Math.sin(t * 6)), armF: 150, armB: 150, mouth: 1, joy: 1, eyes: 'happy' }),
  weak: (t) => P({ lean: 6, y: 5, armF: 20, armB: 10, eyes: 'tired', mouth: 0, joy: 0.45, brow: -0.4, sit: 0.5 + 0.02 * Math.sin(t * 2) }),
  float: (t) => P({ y: -14 + 3 * Math.sin(t * 2), armF: 22, armB: 22, eyes: 'closed', float: 1, joy: 0.9 }),
  grave: (t) => P({ y: 0.8 * Math.sin(t * 1.6), armF: 16, armB: 8, brow: -0.8, mouth: 0, joy: 0.1 }),
  walk: (ph) => P({ y: -2 * Math.abs(Math.sin(ph * TAU)), armF: 8 + 22 * Math.sin(ph * TAU), armB: 8 - 22 * Math.sin(ph * TAU) }),
};

ANIM.sit = ANIM.weak; ANIM.victory = ANIM.cheer; ANIM.hover = ANIM.float;   // (a story's timed clip names: src/cutscene.js TIMED)

function arm(ctx, x, y, ang, sleeve, back) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-ang * DEG);
  ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 46); ctx.stroke();
  ctx.strokeStyle = back ? '#1c3a78' : sleeve; ctx.lineWidth = 12; ctx.stroke();
  ctx.fillStyle = '#e8b890'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(0, 52, 8, 9, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
}
export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  ctx.save(); ctx.scale(f * S, S);
  ctx.translate(0, p.y + p.sit * 14);
  ctx.translate(0, 0); ctx.rotate((p.lean) * DEG);
  const bowRot = p.bow * DEG;
  // legs and robe
  ctx.fillStyle = '#2a2230'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  for (const x of [-14, 14]) { ctx.beginPath(); ctx.rect(x - 7, -34, 14, 30); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#5a3418'; ctx.beginPath(); ctx.moveTo(x - 9, -9); ctx.lineTo(x + 8, -9); ctx.lineTo(x + 13, 0); ctx.lineTo(x - 11, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#2a2230'; }
  arm(ctx, -34, -128, p.armB, '#2a52a8', true);
  ctx.save(); ctx.translate(0, -70); ctx.rotate(bowRot); ctx.translate(0, 70);
  const gr = ctx.createLinearGradient(-48, 0, 48, 0); gr.addColorStop(0, '#1f3f8a'); gr.addColorStop(0.5, '#2a52a8'); gr.addColorStop(1, '#3a6ac8');
  ctx.beginPath(); ctx.moveTo(-34, -136); ctx.quadraticCurveTo(-52, -80, -50, -22); ctx.lineTo(50, -22); ctx.quadraticCurveTo(52, -80, 34, -136); ctx.closePath(); ctx.fillStyle = gr; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.moveTo(-51, -34); ctx.lineTo(51, -34); ctx.lineTo(50, -22); ctx.lineTo(-50, -22); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2.4; ctx.stroke(); ctx.lineWidth = 3;   // (the gold hem)
  ctx.fillStyle = '#4ab0d0'; ctx.beginPath(); ctx.moveTo(-38, -120); ctx.lineTo(-24, -128); ctx.lineTo(44, -34); ctx.lineTo(30, -26); ctx.closePath(); ctx.fill(); ctx.stroke();   // (the sea-blue sash)
  ctx.save(); ctx.translate(2, -104);   // (the gold sun emblem)
  ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 10; i++) { const a = i * TAU / 10; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18); ctx.lineWidth = 3; ctx.stroke(); }
  ctx.restore();
  // the head: a kind round face, the full auburn beard, the gold crown
  ctx.save(); ctx.translate(0, -156);
  ctx.fillStyle = '#e8b890'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 23, 25, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9a4a24'; ctx.beginPath(); ctx.moveTo(-23, 2); ctx.quadraticCurveTo(-30, 30, 0, 40); ctx.quadraticCurveTo(30, 30, 23, 2); ctx.quadraticCurveTo(14, 12, 0, 10); ctx.quadraticCurveTo(-14, 12, -23, 2); ctx.closePath(); ctx.fill(); ctx.stroke();   // (the beard)
  ctx.fillStyle = '#b8602e'; ctx.beginPath(); ctx.ellipse(-8, 18, 6, 9, 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9a4a24'; ctx.beginPath(); ctx.ellipse(0, 6, 14, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();   // (the moustache)
  // rosy cheeks, then the kind eyes, soft raised brows and a real smile (never an angry slant)
  ctx.fillStyle = 'rgba(235,110,90,0.38)'; ctx.beginPath(); ctx.ellipse(-14, 5, 6.5, 4.4, 0, 0, TAU); ctx.ellipse(17, 5, 6.5, 4.4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = INK;
  if (p.eyes === 'closed' || p.eyes === 'happy') { ctx.lineWidth = 2.8; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-14, -2); ctx.quadraticCurveTo(-8, -9, -2, -2); ctx.moveTo(4, -2); ctx.quadraticCurveTo(10, -9, 16, -2); ctx.stroke(); }
  else for (const ex of [-8, 10]) { ctx.beginPath(); ctx.ellipse(ex, -4, 3.4, p.eyes === 'tired' ? 2.2 : 4.2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 1.2, -5.4, 1.2, 0, TAU); ctx.fill(); ctx.fillStyle = INK; }
  { const b = p.brow, lift = 3 * Math.max(0, b), worry = 4 * Math.max(0, -b);   // (raised arches; for worry the inner ends rise -- never inward-down)
    ctx.lineWidth = 3; ctx.strokeStyle = '#7a3a1a'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-16, -10 - lift); ctx.quadraticCurveTo(-10, -16 - lift, -3, -12 - lift - worry); ctx.moveTo(6, -12 - lift - worry); ctx.quadraticCurveTo(12, -16 - lift, 19, -10 - lift); ctx.stroke(); }
  if (p.mouth > 0.3 || p.joy >= 0.95) {   // an open smile: a D of dark red with a strip of teeth
    const o = 5 + 5 * Math.max(p.mouth, 0.5);
    ctx.fillStyle = '#6a1a1a'; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-8, 12); ctx.quadraticCurveTo(1, 12 + o * 1.6, 10, 12); ctx.quadraticCurveTo(1, 14, -8, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-6, 12.6); ctx.quadraticCurveTo(1, 15, 8, 12.6); ctx.lineTo(7, 14.2); ctx.quadraticCurveTo(1, 16.4, -5, 14.2); ctx.closePath(); ctx.fill();
  } else {   // a closed, curved smile (wider with joy)
    const w = 6 + 4 * p.joy, d = 2 + 9 * p.joy;
    ctx.strokeStyle = '#5a1414'; ctx.lineWidth = 2.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(1 - w, 13 - 0.4 * d); ctx.quadraticCurveTo(1, 13 + d, 1 + w, 13 - 0.4 * d); ctx.stroke();
  }
  // the crown
  ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, -16); ctx.lineTo(-24, -38); ctx.lineTo(-12, -28); ctx.lineTo(0, -42); ctx.lineTo(12, -28); ctx.lineTo(24, -38); ctx.lineTo(22, -16); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8401f'; ctx.beginPath(); ctx.arc(0, -27, 3.6, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.restore();
  arm(ctx, 34, -128, p.armF, '#2a52a8', false);
  ctx.restore();
  void t;
}
