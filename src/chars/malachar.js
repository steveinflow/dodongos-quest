// MALACHAR (Skull Island's Skull Palace boss -- docs/SKULL_ISLAND.md; the comic's chapter 8), the BOOK's look (the painted pack's r6): a very tall, thin
// sorcerer with a BALD head (ears showing) behind ONE pale cream full-face mask, split by a thin line -- his right half laughing (a closed happy eye, a
// rosy cheek), his left half weeping (a sad eye, a big blue tear), ONE big open mouth across both halves.  A black feather ruff, a plum robe with
// glowing pink flowing lines and figure-8 loops, a wide purple sash, pale hands; a brown gnarled staff (a darker collar under the orb) held out at his
// side, topped with a purple storm-cloud orb with white lightning.  No crown, no gold, no gem (NO hood: the hooded stranger is the third wizard,
// never shown here).  He floats a hand's breadth above the floor.  His magic is purple / magenta.
// A code-drawn stand-in built to the painted builder's clip contract (assets/sprites/malachar, src/chars/malachar3d.js wraps the pack when it lands).  Local space: origin = the floor under him, +x = the way he
// faces (the staff side), y down; ~230 px tall at scale 1.
// Clips (the pack's names): idle(t) drift(ph) clap(k) summon(k) lightningWind(k) lightning(k) beamWind(k) beamHold(t) hurt(k) stagger(t) maskCrack(k) shrink(k)  + talk(t) laugh(t) rise(k) point(t) for the stories.
// Landmarks (point(pose, name)): orb, handL, fistR, mask, head, mouth, hem, chest.   Exports: BOLT and BEAM = 'orb' at the lightning hit drawing / at beamHold.
import { TAU, DEG, keys } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 250;
export const META = { id: 'malachar', name: 'MALACHAR', height: 275, hurtW: 64, hurtH: 232 };   // (the painted pack's r4 contract)
export const HURTBOX = { x: 0, w: 64, h: 232 };

const STILL = { y: 0, lean: 0, st: 0, hd: 0, orb: 0.4, crack: 0, shrink: 0, sway: 0, face: 'sneer', jaw: 0, mask: 0, drop: 0, flash: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ y: -4 * Math.sin(t * 1.7), lean: 1.2 * Math.sin(t * 1.1), sway: Math.sin(t * 1.4), orb: 0.45 + 0.2 * Math.sin(t * 3), st: 4 * Math.sin(t * 1.3), hd: 6 * Math.sin(t * 1.6) }),
  talk: (t) => P({ y: -4 * Math.sin(t * 1.7), lean: 1.5 * Math.sin(t * 2.3), sway: Math.sin(t * 1.4), orb: 0.5 + 0.2 * Math.sin(t * 3), st: 6 * Math.sin(t * 2), hd: 20 + 14 * Math.sin(t * 4), jaw: Math.max(0, Math.sin(t * 13)) }),
  laugh: (t) => P({ y: -6 - 3 * Math.sin(t * 9), lean: -4 + 3 * Math.sin(t * 9), sway: Math.sin(t * 2), orb: 0.7, st: -8, hd: 30 + 10 * Math.sin(t * 9), face: 'laugh', jaw: 0.8 }),
  point: (t) => P({ y: -4 * Math.sin(t * 1.7), lean: 4, st: 50, hd: 10, orb: 0.8, face: 'angry', jaw: 0.3 }),
  rise: (k) => P({ y: 40 * (1 - k), lean: -6 * (1 - k), st: 90 * (1 - k) - 8, hd: 40 * (1 - k), orb: 0.3 + 0.7 * k, drop: 1 - k }),
  drift: (ph) => P({ y: -5 * Math.sin(ph * TAU), lean: 11, sway: -1.2 + Math.sin(ph * TAU) * 0.5, st: 14, hd: -20, orb: 0.5 + 0.1 * Math.sin(ph * TAU * 2) }),
  // "Bravo. Bravo.": the free hand pats the staff hand twice
  clap: (k) => { const c = Math.max(0, Math.sin(k * TAU * 2)); return P({ y: -3 * Math.sin(k * TAU), lean: 2, st: -2, hd: 70 - 62 * c, orb: 0.5, face: 'laugh', jaw: 0.4 * c, flash: c > 0.9 ? 1 : 0 }); },
  // the four feeling-streams pour from the orb: staff and free hand wide and high
  summon: (k) => P({ y: -8 * Math.sin(k * Math.PI), lean: -6 * Math.sin(k * Math.PI), st: 40 + 50 * Math.min(1, k * 3), hd: 100 + 20 * Math.sin(k * 8), orb: 1, flash: 1, face: 'laugh', jaw: 0.6 }),
  lightningWind: (k) => P({ lean: -8 * k, st: -60 * k, hd: 40 * k, orb: 0.5 + 0.5 * k, flash: k, face: 'angry' }),
  lightning: (k) => keys(k, [[0, P({ lean: -8, st: -60, hd: 40, orb: 1, face: 'angry' })], [0.17, P({ lean: 12, st: 74, hd: -20, orb: 1, flash: 1, face: 'angry', jaw: 0.5 }), 'snap'], [0.6, P({ lean: 8, st: 70, orb: 0.8, face: 'angry' })], [1, P({ st: 6, orb: 0.5 }), 'io']]),
  beamWind: (k) => P({ lean: 4 * k, st: 78 * k, hd: 70 * k, orb: 0.5 + 0.5 * k, face: 'angry' }),
  beamHold: (t) => P({ lean: 14 + 2 * Math.sin(t * 40), st: 80, hd: 75, orb: 1, flash: 0.75 + 0.25 * Math.sin(t * 10), sway: -2.5, face: 'angry', jaw: 0.7, y: -3 + 1.5 * Math.sin(t * 36) }),
  hurt: (k) => P({ lean: -16 * (1 - k), st: -20 * (1 - k), hd: 50 * (1 - k), face: 'shock', orb: 0.2, y: -6 * (1 - k) }),
  stagger: (t) => P({ lean: -6 + 4 * Math.sin(t * 5), y: 4 * Math.sin(t * 3), st: 14 + 6 * Math.sin(t * 4), hd: 10, orb: 0.25, face: 'shock', sway: 2 * Math.sin(t * 4) }),
  // Scarlet's finisher: a recoil, both hands to the mask; the crack appears at k ~ .35 and spreads across both halves
  maskCrack: (k) => P({ lean: -14 * Math.min(1, k * 4), st: -10, hd: 130 * Math.min(1, k * 4), orb: Math.max(0, 0.9 - k * 2), crack: Math.max(0, Math.min(1, (k - 0.3) / 0.5)), face: 'shock', jaw: 0.8, mask: 1, flash: k > 0.3 && k < 0.45 ? 1 : 0 }),
  shrink: (k) => P({ lean: -8, st: -10, hd: 130, orb: 0, crack: 1, shrink: k, face: 'shock', mask: 1, y: 14 * k }),
};

// beamEnd(k): the beam back to idle (18 frames in the pack: without it the orb pops when beamHold ends)
ANIM.beamEnd = (k) => { const a = ANIM.beamHold(0), b = ANIM.idle(0), u = Math.max(0, Math.min(1, k)), o = {}; for (const key of Object.keys(a)) o[key] = typeof a[key] === 'number' ? a[key] + (b[key] - a[key]) * u : (u < 0.5 ? a[key] : b[key]); return o; };
ANIM.taunt = ANIM.laugh;   // (a story's timed clip names: src/cutscene.js TIMED)
ANIM.throne = ANIM.talk;

const ROBE = '#5e2356', ROBED = '#36112f', ROBEH = '#86407a', MAG = '#ff3cd8', MAGD = '#b01c98', COLLAR = '#14091e', STAFFC = '#6b4a2e', STAFFD = '#3a2416', ORB = '#7a4ab8', ORBD = '#4e2a86';
const PINK = '#ff8ae0', SASH = '#7a3cc8', SASHD = '#4e2290', SKIN = '#e9dccb', MASKC = '#f4ead6';   // (the book's plum robe, glowing pink lines, the purple sash; the bald head; the cream mask)
const STAFF_LEN = 120;   // (the hand to the orb: r6's bigger storm orb sits further up the staff)

/** the joint positions (local px at scale 1, facing right) for a pose: used by the drawing and by point() */
function layout(p) {
  const k = 1 - 0.85 * p.shrink, hover = -15 + p.y * (1 - p.shrink);
  const lean = p.lean * DEG, cx = Math.sin(lean) * 120;
  const T = (x, y) => { const rx = x * Math.cos(lean) - (y - hover) * Math.sin(lean), ry = x * Math.sin(lean) + (y - hover) * Math.cos(lean) + hover; return [rx * k, ry * k + 0]; };
  const hand = [40, -110], sa = p.st * DEG;
  // the staff swings about the hand: its top (the orb) is STAFF_LEN px above it (at rest), tilted forward by st
  const ox = hand[0] + Math.sin(sa) * STAFF_LEN, oy = hand[1] - Math.cos(sa) * STAFF_LEN;
  const ha = p.hd * DEG, hl = [-32 + Math.sin(ha) * 40, -112 - Math.cos(ha) * 34 + 14];
  return { k, T, hover, hand: T(...hand), fistR: T(...hand), chest: T(0, -140), orb: T(ox, oy - 12), handL: T(...hl), mask: T(0, -202), head: T(0, -244), mouth: T(0, -184), hem: T(0, -15), sa, ha, lean, cx };   // (mouth: the one big open mouth, low on the mask)
}
export function point(pose, name) {
  const p = Object.assign({}, STILL, pose || {}), L = layout(p);
  const q = L[name];
  return Array.isArray(q) ? [q[0], q[1]] : null;
}
export const BOLT = 'orb', BEAM = 'orb';

function spikeCollar(ctx, cx, cy, mag, t) {
  // the black feather RUFF: a short, full ring of black feathers round the neck and shoulders (the book's -- no tall fan, no coloured tips)
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = COLLAR; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  const feathers = [[-196, 26], [-178, 32], [-160, 36], [-142, 38], [-124, 36], [-106, 34], [-90, 32], [-74, 34], [-56, 36], [-38, 38], [-20, 36], [-2, 32], [16, 26]];
  for (const [deg, len] of feathers) {
    const a = deg * DEG, w = 0.24, r0 = 24, nx = Math.cos(a), ny = Math.sin(a);
    const tip = [nx * (r0 + len) * 0.95, ny * (r0 + len) * 0.8 + 12], bl = [Math.cos(a - w) * r0, Math.sin(a - w) * r0 * 0.8 + 14], br = [Math.cos(a + w) * r0, Math.sin(a + w) * r0 * 0.8 + 14];
    ctx.beginPath(); ctx.moveTo(bl[0], bl[1]); ctx.quadraticCurveTo(tip[0] - 7 * ny, tip[1] + 7 * nx, tip[0], tip[1]); ctx.quadraticCurveTo(tip[0] + 7 * ny, tip[1] - 7 * nx, br[0], br[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.strokeStyle = '#3a2a48'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo((bl[0] + br[0]) / 2, (bl[1] + br[1]) / 2); ctx.lineTo(tip[0] * 0.92, tip[1] * 0.92); ctx.stroke(); ctx.restore();   // (a feather's quill)
  }
  // the shoulder band
  ctx.beginPath(); ctx.moveTo(-34, 8); ctx.quadraticCurveTo(0, -4, 34, 8); ctx.lineTo(30, 28); ctx.quadraticCurveTo(0, 38, -30, 28); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore(); void mag; void t;
}
function mask(ctx, p, t) {
  // the BALD head (ears showing) behind ONE pale cream full-face mask -- local origin at the mask's centre (the book's look: no crown)
  ctx.save();
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = SKIN;
  for (const ex of [-27, 27]) { ctx.beginPath(); ctx.ellipse(ex, -2, 6, 10, 0, 0, TAU); ctx.fill(); ctx.stroke(); }   // (the ears)
  ctx.beginPath(); ctx.ellipse(0, -10, 27, 34, 0, 0, TAU); ctx.fill(); ctx.stroke();   // (the bald skull)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-9, -32, 9, 5, -0.4, 0, TAU); ctx.fill();   // (its shine)
  // the mask: one cream plate over the face, split by a thin line
  ctx.fillStyle = MASKC; ctx.beginPath(); ctx.ellipse(0, 4, 23, 29, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(-12, -12, 4, 9, 0.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(70,45,55,0.6)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(1, -6); ctx.lineTo(-1, 10); ctx.lineTo(0, 32); ctx.stroke();
  // his right half (x < 0) LAUGHS: a closed happy eye, an upturned brow, a rosy cheek
  ctx.strokeStyle = INK; ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.arc(-11, -1, 6, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
  ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-17, -13); ctx.quadraticCurveTo(-11, -17, -5, -13); ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,140,0.55)'; ctx.beginPath(); ctx.ellipse(-14, 7, 6, 4, 0, 0, TAU); ctx.fill();
  // his left half (x > 0) WEEPS: a sad eye under a sloped brow, a big blue tear
  ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(5, -10); ctx.lineTo(17, -14); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(11, -3, 5, 4.2, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 1.8; ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(11, -2, 2.4, 0, TAU); ctx.fill();
  ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(11, -3, 5.4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();   // (the droopy lid)
  ctx.fillStyle = '#5ab4ff'; ctx.beginPath(); ctx.moveTo(15, 2); ctx.quadraticCurveTo(21, 11, 16.5, 15); ctx.quadraticCurveTo(11, 13, 15, 2); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(15, 10, 1.3, 0, TAU); ctx.fill();
  // ONE big open mouth across both halves: it grins up on the laughing side and sags on the weeping side (wider as he talks / laughs)
  const jw = 4 * Math.max(0, p.jaw);
  ctx.fillStyle = '#3a0f2a'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(-16, 10); ctx.quadraticCurveTo(-2, 14, 15, 17); ctx.quadraticCurveTo(4, 30 + jw, -16, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e0607a'; ctx.beginPath(); ctx.ellipse(0, 21 + jw * 0.6, 5, 2.4, 0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff6e8'; ctx.beginPath(); ctx.moveTo(-12, 11.4); ctx.lineTo(10, 15.6); ctx.lineTo(9, 18); ctx.lineTo(-11, 13.6); ctx.closePath(); ctx.fill();   // (a row of teeth)
  void t;
  // the crack: a jagged line across both halves, glowing
  if (p.crack > 0.02) {
    const c = p.crack;
    ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 3.4; ctx.lineJoin = 'round'; ctx.beginPath();
    const pts = [[2, -31], [-4, -20], [5, -9], [-3, 2], [6, 13], [-2, 24], [3, 33]];
    const n = Math.max(2, Math.ceil(pts.length * c));
    ctx.moveTo(...pts[0]); for (let i = 1; i < n; i++) ctx.lineTo(...pts[i]);
    ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    if (c > 0.6) { ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-3, 2); ctx.lineTo(-17, 9); ctx.moveTo(5, -9); ctx.lineTo(18, -16); ctx.stroke(); }
  }
  ctx.restore();
}

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, S = o.scale || 1, t = o.t || 0, L = layout(p);
  ctx.save(); ctx.scale(f * S, S);
  const k = L.k;
  // the floor glow under a floating sorcerer (the stage's shadow is the engine's)
  ctx.save(); ctx.translate(0, 0); ctx.scale(k, k);
  ctx.translate(0, L.hover); ctx.rotate(L.lean); ctx.translate(0, -L.hover);
  const sw = p.sway * 8;
  // the robe: a long tapering shape with a ragged, swirling hem trailing behind
  ctx.save(); ctx.scale(0.8, 1);
  ctx.beginPath();
  ctx.moveTo(-36, -182);
  ctx.quadraticCurveTo(-46, -110, -52 + sw, -40);
  for (let i = 0; i < 6; i++) { const x = -52 + i * 17 + sw * (0.4 + i * 0.1), y = L.hover + 6 + (i % 2 ? 0 : 12) + 2 * Math.sin(t * 3 + i); ctx.lineTo(x, y); }
  ctx.lineTo(52 + sw * 1.2, L.hover + 4);
  ctx.quadraticCurveTo(48, -110, 36, -182);
  ctx.closePath();
  const gr = ctx.createLinearGradient(-50, 0, 50, 0); gr.addColorStop(0, ROBED); gr.addColorStop(0.45, ROBE); gr.addColorStop(1, ROBEH);
  ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
  // glowing pink lines flowing down the robe, with figure-8 loops (the book's)
  ctx.save(); ctx.clip(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const flow = (a) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.bezierCurveTo(a[2], a[3], a[4], a[5], a[6], a[7]); ctx.stroke(); };
  const eight = (x, y, s) => { ctx.beginPath(); for (let i = 0; i <= 28; i++) { const u = (i / 28) * TAU; const px = x + s * Math.sin(u), py = y + s * 0.9 * Math.sin(u) * Math.cos(u); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); };
  for (const [w, col, al] of [[5.2, MAG, 0.35], [2.2, PINK, 0.95]]) {   // (a soft glow under a bright line: no blur)
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = al;
    flow([-22, -176, -34, -130, -10, -96, -30, -40]); flow([20, -170, 34, -120, 8, -80, 30, -24]); flow([-4, -120, 10, -90, -14, -60, 4, -18]);
    eight(-24, -118, 10); eight(20, -72, 9); eight(-20, -46, 8);
  }
  ctx.restore();
  // the wide purple sash round his waist, a tail hanging at his side
  ctx.fillStyle = SASH; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-44, -116); ctx.quadraticCurveTo(0, -106, 44, -116); ctx.lineTo(42, -98); ctx.quadraticCurveTo(0, -88, -44, -98); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = SASHD; ctx.beginPath(); ctx.moveTo(-30, -100); ctx.quadraticCurveTo(-38 + sw * 0.4, -78, -32 + sw * 0.6, -56); ctx.lineTo(-22 + sw * 0.6, -58); ctx.quadraticCurveTo(-26 + sw * 0.4, -78, -20, -98); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // the free hand (behind the robe's front): a long pale hand in a violet sleeve, a magenta glow
  const hl = [-32 + Math.sin(L.ha) * 40, -112 - Math.cos(L.ha) * 34 + 14];
  ctx.strokeStyle = INK; ctx.lineWidth = 15; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-30, -150); ctx.quadraticCurveTo(hl[0] - 14, (hl[1] - 150) / 2 - 150 + 30, hl[0], hl[1]); ctx.stroke();
  ctx.strokeStyle = ROBE; ctx.lineWidth = 10; ctx.stroke();
  ctx.fillStyle = '#e8dff0'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(hl[0], hl[1], 7, 9, 0, 0, TAU); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(hl[0] - 5 + i * 3.4, hl[1] + 6); ctx.lineTo(hl[0] - 5 + i * 3.4 + (i - 1.5) * 0.8, hl[1] + 20); ctx.stroke(); }
  if (p.flash > 0.05) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,60,216,${0.5 * p.flash})`; ctx.beginPath(); ctx.arc(hl[0], hl[1], 18 + 8 * p.flash, 0, TAU); ctx.fill(); ctx.restore(); }
  // the collar and the head
  spikeCollar(ctx, 0, -190, MAG, t);
  ctx.save(); ctx.translate(0, -202); ctx.rotate(-p.lean * 0.01); mask(ctx, p, t); ctx.restore();
  // the staff arm and the staff, held out at his side: a brown gnarled staff with a darker collar under a purple storm-cloud orb
  const hand = [40, -110], sa = L.sa, ox = hand[0] + Math.sin(sa) * STAFF_LEN, oy = hand[1] - Math.cos(sa) * STAFF_LEN;
  ctx.strokeStyle = INK; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(30, -150); ctx.quadraticCurveTo(48, -128, hand[0], hand[1]); ctx.stroke();
  ctx.strokeStyle = ROBE; ctx.lineWidth = 10; ctx.stroke();
  ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(sa);
  const top = -STAFF_LEN + 18;
  ctx.strokeStyle = INK; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(0, 70); ctx.bezierCurveTo(-6, 30, 6, -30, -2, top); ctx.stroke();
  ctx.strokeStyle = STAFFC; ctx.lineWidth = 6; ctx.stroke();
  ctx.strokeStyle = '#8a6440'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-1, 50); ctx.bezierCurveTo(-4, 20, 3, -20, -1, top + 10); ctx.stroke();   // (the grain)
  ctx.fillStyle = STAFFC; ctx.strokeStyle = INK; ctx.lineWidth = 2.4; for (const [kx, ky] of [[3, 20], [-3, -24], [3, -60]]) { ctx.beginPath(); ctx.ellipse(kx, ky, 4, 3, 0, 0, TAU); ctx.fill(); ctx.stroke(); }   // (knots)
  ctx.fillStyle = STAFFD; ctx.beginPath(); ctx.ellipse(-2, top + 8, 7, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();   // (the darker collar under the orb)
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2, top + 4); ctx.lineTo(-14, top - 12); ctx.moveTo(0, top + 2); ctx.lineTo(13, top - 14); ctx.stroke();   // (the gnarled claws that cradle it)
  ctx.restore();
  ctx.fillStyle = '#e8dff0'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(hand[0], hand[1], 8, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // the orb: a purple STORM CLOUD with white lightning in it
  const og = 0.55 + 0.45 * p.orb, R = 24;
  ctx.save(); ctx.translate(ox, oy - 12);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gg = ctx.createRadialGradient(0, 0, 6, 0, 0, 52 + 26 * p.orb); gg.addColorStop(0, `rgba(190,120,255,${0.6 * og})`); gg.addColorStop(1, 'rgba(140,60,255,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 52 + 26 * p.orb, 0, TAU); ctx.fill(); ctx.restore();
  const puffs = [[-12, 4, 12], [0, -4, 15], [13, 3, 12], [6, 10, 10], [-5, 10, 10]];
  const cloud = () => { ctx.beginPath(); for (const [x, y, r] of puffs) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } };
  ctx.strokeStyle = INK; ctx.lineWidth = 6; cloud(); ctx.stroke();
  ctx.fillStyle = ORB; cloud(); ctx.fill();
  ctx.fillStyle = ORBD; ctx.beginPath(); ctx.ellipse(0, 12, R * 0.8, 6, 0, 0, TAU); ctx.fill();   // (the cloud's dark underside)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-4, -12, 7, 3.5, -0.3, 0, TAU); ctx.fill();
  if (p.orb >= 0.1) {   // white lightning inside it, crackling (a slow flicker of its shape, never a flash)
    const z = Math.floor(t * 4) % 3, j = [[-6, -8], [2, -2], [-3, 2], [6, 10]].map(([x, y], i) => [x + (z === i % 3 ? 2 : -1), y]);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.6; ctx.lineJoin = 'miter'; ctx.globalAlpha = 0.6 + 0.4 * p.orb;
    ctx.beginPath(); ctx.moveTo(...j[0]); for (let i = 1; i < j.length; i++) ctx.lineTo(...j[i]); ctx.stroke(); ctx.globalAlpha = 1;
  } else { ctx.fillStyle = 'rgba(20,10,30,0.6)'; cloud(); ctx.fill(); }
  ctx.restore();
  ctx.restore();
  ctx.restore();
}
