// THE DRAGON QUEEN (docs/SECRETS.md, docs/SECRETS_SCRIPT.md): a code-drawn stand-in for the cutscenes until her painted
// scene pack lands (a variant of the Dragon King: pearl and rose-gold, no beard, a slim crown, kind golden eyes).  The
// same look as the sleeping Queen in the Hollow (src/wraith.js QueenSleeper), drawn bigger and able to wake.
// Clips (the script's): sleep (t: a slow breathing loop), wake (k: 0 asleep .. 1 head up, eyes open), idle (t),
// wingSpread (k: wings folded .. spread wide), fly (t).  Drawn facing left (toward the heroes) at facing -1; feet / belly
// at (0, 0).  src/chars.js registers it as CHARS.dragonqueen.
import { TAU } from '../rig.js';

const N = 1.9, NS = 1.45, NF = 1.6;   // her size against the in-level sleeper (asleep / sitting up / flying)
const C = {
  ink: 'rgba(33,20,28,0.9)', pearl: '#fff3ee', pearlD: '#e8c6c8', blush: '#f2d8d6', wing: '#e9b8c6', wingD: '#c98ea4',
  belly: '#fff8f0', gold: '#e8b04a', goldD: '#b07a2a', eye: '#f2b84a', pupil: '#3a1a10', horn: '#f6e6c8',
};
export const META = { height: 330, name: 'dragonqueen' };   // (sitting up, crown and all)
export const ANIM = {
  sleep: (t) => ({ q: 'sleep', t: t || 0 }),
  wake: (k) => ({ q: 'wake', k: Math.max(0, Math.min(1, k ?? 1)) }),
  idle: (t) => ({ q: 'idle', t: t || 0 }),
  wingSpread: (k) => ({ q: 'wings', k: Math.max(0, Math.min(1, k ?? 1)) }),
  fly: (t) => ({ q: 'fly', t: t || 0 }),
};
ANIM.talk = ANIM.idle;

const lerp = (a, b, k) => a + (b - a) * k;
function eye(ctx, x, y, open, t) {
  ctx.save(); ctx.translate(x, y);
  if (open < 0.15) { ctx.strokeStyle = '#21141c'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, -2, 7, 0.3, Math.PI - 0.3); ctx.stroke(); ctx.restore(); return; }
  ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 8 * open, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(-1.5, 0.5, 5.5, 5.5 * open, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = C.pupil; ctx.beginPath(); ctx.ellipse(-2, 0.5, 2.6, 3.4 * open, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-3.4, -2 * open, 1.4, 0, TAU); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.ellipse(0, 0, 8, 8 * open, 0, 0, TAU); ctx.stroke();
  // a kind, curved lash line
  ctx.beginPath(); ctx.moveTo(-9, -6 * open); ctx.quadraticCurveTo(0, -11 * open - 1, 9, -6 * open); ctx.stroke();
  ctx.restore();
  void t;
}
function crown(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-10, -18); ctx.lineTo(-4, -7); ctx.lineTo(0, -22); ctx.lineTo(4, -7); ctx.lineTo(10, -18); ctx.lineTo(14, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffe9f2'; ctx.beginPath(); ctx.arc(0, -10, 2.6, 0, TAU); ctx.fill();
  ctx.restore();
}
/** the head (facing left: the snout at -x), centred at (x, y), tilted a; open: the eyes */
function head(ctx, x, y, a, open, t, smile = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
  // horns, swept back
  ctx.fillStyle = C.horn;
  ctx.beginPath(); ctx.moveTo(14, -16); ctx.quadraticCurveTo(40, -34, 52, -24); ctx.quadraticCurveTo(36, -22, 22, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
  // the head and snout
  ctx.fillStyle = C.pearl;
  ctx.beginPath(); ctx.ellipse(6, -2, 30, 24, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-24, 6, 24, 15, -0.08, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.pearl; ctx.fillRect(-14, -6, 22, 18);   // (the seam between them)
  ctx.fillStyle = C.blush; ctx.beginPath(); ctx.ellipse(-4, 10, 8, 4, 0, 0, TAU); ctx.fill();
  // nostril and a gentle smile
  ctx.fillStyle = '#21141c'; ctx.beginPath(); ctx.ellipse(-40, 2, 2.2, 1.6, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#21141c'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-42, 12); ctx.quadraticCurveTo(-28, 14 + 4 * smile, -14, 10); ctx.stroke();
  eye(ctx, -2, -8, open, t);
  crown(ctx, 12, -22, 1);
  ctx.restore();
}
function wing(ctx, x, y, k, flap, far) {
  // folded (k 0) .. spread up and back (k 1); flap: a beat added to the spread angle
  ctx.save(); ctx.translate(x, y);
  const a = lerp(0.2, -1.15, k) + flap;
  ctx.rotate(a);
  const L = lerp(70, 150, k);
  ctx.fillStyle = far ? C.wingD : C.wing; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -L * 0.55, L, -L * 0.2);
  ctx.quadraticCurveTo(L * 0.82, 0, L * 0.9, L * 0.18); ctx.quadraticCurveTo(L * 0.6, L * 0.05, L * 0.62, L * 0.32);
  ctx.quadraticCurveTo(L * 0.35, L * 0.12, L * 0.3, L * 0.36); ctx.quadraticCurveTo(L * 0.12, L * 0.2, 0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
/** curled up asleep on her bed (the in-level sleeper's drawing); k: how far she's woken (the head lifts, an eye opens) */
function curled(ctx, t, k) {
  const breathe = 1 + 0.02 * Math.sin(t * 1.4);
  ctx.save(); ctx.scale(breathe, 1);
  ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
  const body = ctx.createLinearGradient(0, -90, 0, 0); body.addColorStop(0, C.pearl); body.addColorStop(1, C.pearlD);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, -36, 92, 38, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(80, -20); ctx.quadraticCurveTo(140, -10, 120, -44); ctx.quadraticCurveTo(110, -60, 96, -50); ctx.lineWidth = 10; ctx.strokeStyle = C.blush; ctx.stroke(); ctx.lineWidth = 3;
  ctx.strokeStyle = C.ink;
  wing(ctx, 0, -64, 0.15 * k, 0, false);
  ctx.restore();
  // the head: resting on the forepaws, lifting as she wakes
  head(ctx, lerp(-74, -70, k), lerp(-44, -96, k), lerp(-0.1, -0.05, k), Math.max(0, Math.min(1, (k - 0.12) / 0.3)), t, k);
}
/** sitting up, head high; wk: the wings' spread (drawn at NS of the sleeper's size: she sits tall) */
function sitting(ctx, t, wk, flap = 0) {
  ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
  wing(ctx, 34, -122, wk, -flap - 0.12, true);
  // the tail curling round in front of her
  ctx.beginPath(); ctx.moveTo(70, -14); ctx.quadraticCurveTo(150, -6, 132, -48); ctx.quadraticCurveTo(124, -66, 108, -56);
  ctx.lineWidth = 15; ctx.strokeStyle = C.ink; ctx.stroke(); ctx.lineWidth = 10; ctx.strokeStyle = C.blush; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
  // a round, sitting body (a pear), the hind leg's haunch, a cream belly plate
  const body = ctx.createLinearGradient(0, -150, 0, 0); body.addColorStop(0, C.pearl); body.addColorStop(1, C.pearlD);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(-34, -6); ctx.quadraticCurveTo(-58, -70, -26, -118); ctx.quadraticCurveTo(10, -150, 52, -118);
  ctx.quadraticCurveTo(96, -76, 80, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.pearlD; ctx.beginPath(); ctx.ellipse(54, -30, 30, 26, -0.3, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.belly; ctx.beginPath(); ctx.ellipse(-16, -60, 22, 48, 0.12, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(200,150,150,0.6)'; ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-34 + i * 1.5, -96 + i * 18); ctx.lineTo(0 + i * 1.5, -94 + i * 18); ctx.stroke(); }
  ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
  // a short, strong neck up to the head
  ctx.fillStyle = C.pearl;
  ctx.beginPath(); ctx.moveTo(-28, -104); ctx.quadraticCurveTo(-46, -138, -40, -160); ctx.lineTo(-2, -164); ctx.quadraticCurveTo(-2, -136, 14, -118); ctx.closePath(); ctx.fill(); ctx.stroke();
  // forepaws
  for (const px of [-40, -10]) { ctx.beginPath(); ctx.ellipse(px, -6, 17, 9, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  wing(ctx, 44, -118, wk, flap, false);
  ctx.save(); ctx.translate(-26 + Math.sin(t * 0.8) * 2, -178 + Math.sin(t * 1.3) * 2); ctx.scale(1.3, 1.3);
  head(ctx, 0, 0, -0.04, 1, t);
  ctx.restore();
}
function flying(ctx, t) {
  const flap = Math.sin(t * 4) * 0.5;
  ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
  wing(ctx, 20, -60, 0.9, -flap, true);
  // tail streaming back
  ctx.beginPath(); ctx.moveTo(60, -40); ctx.quadraticCurveTo(130, -30 + Math.sin(t * 2) * 10, 180, -60 + Math.sin(t * 2 + 1) * 12); ctx.lineWidth = 12; ctx.strokeStyle = C.blush; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = C.ink;
  const body = ctx.createLinearGradient(0, -90, 0, -10); body.addColorStop(0, C.pearl); body.addColorStop(1, C.pearlD);
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(10, -48, 80, 34, -0.05, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.belly; ctx.beginPath(); ctx.ellipse(0, -34, 54, 14, -0.05, 0, TAU); ctx.fill();
  ctx.fillStyle = C.pearl; ctx.beginPath(); ctx.moveTo(-50, -60); ctx.quadraticCurveTo(-80, -80, -92, -84); ctx.lineTo(-88, -60); ctx.quadraticCurveTo(-70, -54, -54, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
  wing(ctx, 30, -64, 0.9, flap, false);
  head(ctx, -108, -78 + Math.sin(t * 4) * 3, 0.1, 1, t);
}

/** Draw with the feet at (0, 0).  o: { facing (-1: facing left, her drawn way), scale, t } */
export function draw(ctx, pose, o = {}) {
  const f = o.facing || -1, t = o.t || 0, p = pose || {};
  const S = (o.scale || 1) * (p.q === 'idle' || p.q === 'wings' ? NS : p.q === 'fly' ? NF : N);
  ctx.save(); ctx.scale(-f * S, S); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (p.q === 'fly') flying(ctx, p.t ?? t);
  else if (p.q === 'idle') sitting(ctx, p.t ?? t, 0.1);
  else if (p.q === 'wings') sitting(ctx, t, p.k ?? 1, Math.sin(t * 2.4) * 0.08 * (p.k ?? 1));
  else curled(ctx, p.t ?? t, p.q === 'wake' ? p.k ?? 1 : 0);
  ctx.restore();
  if (p.q === 'sleep' || (p.q === 'wake' && (p.k ?? 1) < 0.3)) {   // Zzz while she sleeps
    ctx.save(); ctx.font = `bold ${Math.round(18 * S)}px "Luckiest Guy", Bangers, sans-serif`; ctx.fillStyle = 'rgba(255,240,250,0.85)';
    const tt = p.t ?? t;
    for (let i = 0; i < 3; i++) { const k = ((tt * 0.5 + i / 3) % 1); ctx.globalAlpha = Math.sin(k * Math.PI); ctx.fillText('z', f * (110 + k * 30) * S, (-80 - k * 60 - i * 4) * S); }
    ctx.restore();
  }
}
