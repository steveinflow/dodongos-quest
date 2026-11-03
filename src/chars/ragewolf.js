// RAGE WOLF (Skull Island, the Cave of Rage -- docs/SKULL_ISLAND.md): a fire wolf with lava-crack fur -- charcoal-dark, glowing orange cracks
// along its flanks, a mane and tail of living flame, and eyes that tell its mood.  It GROWS and glows when it is angry (button-mashing
// feeds it) and shrinks and cools when it is calm; at its calmest it pops into a PUPPY (o.puppy): round, orange-brown, huge blue eyes, a
// wagging tail with a tiny flame.  o.alpha: the RAGE ALPHA, the same wolf bigger, with horns of rock and a heavier brow.
//   o.rage 0..1.5   0 = calm (blue eyes, dim cracks, a small flame) .. 1 = angry (amber eyes, bright cracks) .. 1.5 = raging (white-hot)
// A code rig, the stand-in until a painted pack lands ("shadow_wolf recoloured" was not cheap: its smoke wolf has no cracks).  Local
// space: origin = the floor under the body, +x = facing, y down; ~78 px tall at scale 1 (an alpha / a rage-grown beast: the game scales it).
// Clips: idle(t) run(ph) growl(t) windup(k) lunge(k) hurt(k) fly down(t) getup(k) pop(k) sit(t) wag(t) hop(ph).
import { TAU, DEG, cel, flat, ink, capsule, ellipse, circle, blob, keys, clamp } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 78;
export const META = { id: 'ragewolf', name: 'RAGE WOLF', height: 78 };
export const HURTBOX = { x: 0, w: 44, h: 64 };

const STILL = { x: 0, y: 0, tilt: 0, ph: 0, jaw: 0, crouch: 0, lie: 0, tail: 0, sq: 1, face: 'grim', spin: 0, run: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ y: 0.8 * Math.sin(t * 3), tail: Math.sin(t * 2.6), jaw: 0.05 + 0.05 * Math.sin(t * 2) }),
  run: (ph) => P({ ph, run: 1, y: -Math.abs(Math.sin(ph * TAU)) * 3, tilt: 4 * Math.sin(ph * TAU), tail: Math.sin(ph * TAU * 2) }),
  growl: (t) => P({ y: 1.2 * Math.sin(t * 9), crouch: 0.35, jaw: 0.35 + 0.15 * Math.sin(t * 9), tilt: -3, tail: Math.sin(t * 6), face: 'snarl' }),
  windup: (k) => P({ crouch: 0.2 + 0.8 * k, x: -6 * k, tilt: -8 * k, jaw: 0.5 * k, face: 'snarl', tail: 1 }),
  lunge: (k) => keys(k, [
    [0, P({ crouch: 1, x: -6, tilt: -8, jaw: 0.5, face: 'snarl' })],
    [0.3, P({ crouch: 0, x: 12, y: -10, tilt: 14, jaw: 1, run: 1, ph: 0.15, face: 'snarl', tail: -1 }), 'snap'],
    [0.7, P({ x: 14, y: -4, tilt: 8, jaw: 0.6, run: 1, ph: 0.4, face: 'snarl' })],
    [1, P({}), 'io'],
  ]),
  hurt: (k) => P({ x: -6 * (1 - k), tilt: -14 * (1 - k), jaw: 0.6 * (1 - k), face: 'ouch', crouch: 0.2 * (1 - k) }),
  fly: () => P({ tilt: -50, y: -10, jaw: 0.7, run: 1, ph: 0.3, face: 'ouch' }),
  down: (t) => P({ lie: 1, face: 'ko', tail: 0.3 * Math.sin(t * 4), y: 0 }),
  getup: (k) => keys(k, [[0, P({ lie: 1, face: 'ko' })], [0.6, P({ lie: 0.3, crouch: 0.6, face: 'ouch' })], [1, P({})]]),
  pop: (k) => P({ crouch: k * 0.5, tilt: k * 20, face: 'ouch', sq: 1 - 0.2 * k }),
  // the puppy
  sit: (t) => P({ y: 0.6 * Math.sin(t * 3), tail: Math.sin(t * 9), jaw: 0.25 + 0.2 * Math.max(0, Math.sin(t * 4)), face: 'happy' }),
  wag: (t) => P({ y: -1 * Math.abs(Math.sin(t * 8)), tail: Math.sin(t * 16), jaw: 0.5, face: 'happy', crouch: 0.15 }),
  hop: (ph) => P({ ph, run: 1, y: -Math.abs(Math.sin(ph * TAU)) * 7, tilt: 6 * Math.sin(ph * TAU), tail: Math.sin(ph * TAU * 3), jaw: 0.4, face: 'happy' }),
};

const mixc = (a, b, t) => {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)], pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + h(pa[0] + (pb[0] - pa[0]) * t) + h(pa[1] + (pb[1] - pa[1]) * t) + h(pa[2] + (pb[2] - pa[2]) * t);
};
const FUR = '#2e2428', FURD = '#171012', FURH = '#52414a';
// the colour of the heat at rage r (0 calm .. 1 angry .. 1.5 raging): a crack / eye colour
const heat = (r) => (r < 1 ? mixc('#e8501a', '#ffb02e', clamp(r, 0, 1)) : mixc('#ffb02e', '#fff6d0', clamp((r - 1) / 0.5, 0, 1)));
const eyeCol = (r, puppy) => (puppy ? '#6ad0ff' : r < 0.35 ? '#7ad0ff' : r < 0.8 ? mixc('#7ad0ff', '#ffc040', (r - 0.35) / 0.45) : mixc('#ffc040', '#ffffff', clamp((r - 0.8) / 0.7, 0, 1)));

function flameTuft(ctx, x, y, h, w, t, ph, col, col2) {
  const f = 0.8 + 0.25 * Math.sin(t * 11 + ph) + 0.12 * Math.sin(t * 17 + ph * 2), hh = h * f;
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.9, y - hh * 0.55, x + Math.sin(t * 9 + ph) * w * 0.5, y - hh); ctx.quadraticCurveTo(x + w * 0.9, y - hh * 0.5, x + w, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col2; ctx.beginPath(); ctx.moveTo(x - w * 0.5, y); ctx.quadraticCurveTo(x - w * 0.4, y - hh * 0.4, x, y - hh * 0.62); ctx.quadraticCurveTo(x + w * 0.4, y - hh * 0.35, x + w * 0.5, y); ctx.closePath(); ctx.fill();
}
function leg(ctx, ox, oy, a1, a2, len, col, colD) {
  ctx.save(); ctx.translate(ox, oy); ctx.rotate(a1 * DEG);
  cel(ctx, (c) => capsule(c, len, 11, 8), col, colD, { lw: 2.8 });
  ctx.translate(0, len); ctx.rotate(a2 * DEG);
  cel(ctx, (c) => capsule(c, len * 0.95, 8, 6.4), col, colD, { lw: 2.6 });
  flat(ctx, (c) => ellipse(c, 4, len * 0.95 + 2, 8.4, 4.4), colD, 2.2);
  ctx.restore();
}

const rk0 = (r) => clamp(r, 0, 1.4);
export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, S = o.scale || 1, t = o.t || 0, r = o.rage ?? 0.4, puppy = !!o.puppy, alpha = !!o.alpha;
  const lie = p.lie || 0;
  ctx.save(); ctx.scale(f * S, S);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const K = puppy ? 0.62 : 1;            // (a puppy is the same wolf, small and round)
  ctx.translate(p.x || 0, p.y || 0);
  if (lie) { ctx.translate(0, -8); ctx.rotate(-lie * 0.18); }
  ctx.rotate((p.tilt || 0) * DEG);
  ctx.scale(K * (puppy ? 0.86 : 1), K * (p.sq || 1));
  if (!puppy && rk0(r) > 0.6) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.12 * (rk0(r) - 0.6); ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.ellipse(0, -44, 70, 44, 0, 0, TAU); ctx.fill(); ctx.restore(); }   // (an aura round a raging wolf)
  const crouch = (p.crouch || 0) * 12, run = p.run ? 1 : 0, g = Math.sin((p.ph || 0) * TAU), gc = Math.cos((p.ph || 0) * TAU);
  const hc = heat(r), rk = clamp(r, 0, 1.4);
  const fur = puppy ? (o.pale ? '#d8a068' : '#b07040') : rk < 0.65 ? mixc('#46506a', '#7a3a34', rk / 0.65) : rk < 1.0 ? mixc('#7a3a34', '#c8641e', (rk - 0.65) / 0.35) : mixc('#c8641e', '#f6d890', clamp((rk - 1) / 0.4, 0, 1));
  const furD = puppy ? (o.pale ? '#9a6a3a' : '#7a4a28') : mixc(fur, '#120a0c', 0.55), furH = puppy ? '#e0a468' : mixc(fur, '#ffffff', 0.3);
  // the flame tail
  ctx.save(); ctx.translate(-44, -52 + crouch * 0.6); ctx.rotate((-18 + (p.tail || 0) * 22) * DEG);
  cel(ctx, (c) => { c.moveTo(0, 0); c.quadraticCurveTo(-24, -6, -40, -26); c.quadraticCurveTo(-26, 0, -4, 8); c.closePath(); }, fur, furD, { lw: 2.6 });
  flameTuft(ctx, -40, -24, (puppy ? 16 : 26) * (0.6 + r * 0.6), puppy ? 6 : 9, t, 1.3, mixc('#e8501a', '#ffb02e', clamp(r, 0, 1)), '#fff0a0');
  ctx.restore();
  // the far legs
  const lgf = lie ? 70 : 0;
  leg(ctx, 26, -34 + crouch, (run ? 30 * g : 8) + lgf, run ? -40 - 20 * gc : -14, 18, furD, '#0a0607');
  leg(ctx, -26, -34 + crouch, (run ? -30 * g : -10) + lgf * 0.6, run ? -36 + 20 * gc : 14, 18, furD, '#0a0607');
  // the body: a long barrel, cracks of lava along the flank
  const body = (c) => { c.moveTo(-44, -46 + crouch); c.quadraticCurveTo(-48, -76 + crouch, -10, -76 + crouch); c.quadraticCurveTo(34, -78 + crouch * 0.5, 46, -62 + crouch * 0.5); c.quadraticCurveTo(54, -42, 38, -32 + crouch); c.quadraticCurveTo(0, -24 + crouch, -34, -30 + crouch); c.quadraticCurveTo(-52, -34, -44, -46 + crouch); c.closePath(); };
  cel(ctx, body, fur, furD, { lw: 3.2, hi: furH, hk: 0.5, detail: (c) => {
    if (puppy) { c.fillStyle = '#f0d0a0'; c.beginPath(); c.ellipse(4, -34 + crouch, 40, 10, 0, 0, TAU); c.fill(); return; }
    const gl = clamp(0.35 + r * 0.7, 0.25, 1);
    c.strokeStyle = hc; c.lineWidth = 2.6; c.globalAlpha = gl;
    for (const k of [[-30, -58, -18, -50, -26, -40], [-8, -70, 2, -58, -6, -46], [16, -72, 26, -62, 20, -50], [32, -64, 40, -52, 34, -42], [-40, -44, -30, -38, -36, -32]]) { c.beginPath(); c.moveTo(k[0], k[1] + crouch); c.lineTo(k[2], k[3] + crouch); c.lineTo(k[4], k[5] + crouch); c.stroke(); }
    c.globalAlpha = 1;
  } });
  // the mane of flame along the back (more, taller, hotter with rage)
  if (!puppy) {
    const n = 7, big = 0.55 + r * 0.75;
    for (let i = 0; i < n; i++) flameTuft(ctx, -34 + i * 11, -74 + crouch - (i === 3 ? 0 : Math.abs(i - 3)), (14 + (3 - Math.abs(i - 3)) * 6) * big * (alpha ? 1.3 : 1), 6.4, t, i * 0.9, mixc('#e8501a', '#ffb02e', clamp(r, 0, 1)), '#fff0a0');
  }
  // the near legs
  leg(ctx, 28, -34 + crouch, (run ? -30 * g : -6) + lgf, run ? -36 + 20 * gc : -10, 18, fur, furD);
  leg(ctx, -24, -34 + crouch, (run ? 30 * g : 10) + lgf * 0.6, run ? -40 - 20 * gc : 16, 18, fur, furD);
  // the head: snout and jaw, ears, the eye
  ctx.save(); ctx.translate(50, -62 + crouch * 0.5); ctx.rotate((lie ? 10 : -4 + (p.jaw || 0) * -4) * DEG);
  const hsz = puppy ? 1.25 : 1;
  ctx.scale(hsz, hsz);
  // the ears (behind the head)
  for (const [ex, ey, ea] of [[-10, -16, -14], [2, -18, 10]]) { ctx.save(); ctx.translate(ex, ey); ctx.rotate((puppy ? ea * 3 : ea) * DEG); cel(ctx, (c) => { c.moveTo(-6, 4); c.lineTo(-2, puppy ? -12 : -20); c.lineTo(8, 4); c.closePath(); }, fur, furD, { lw: 2.4 }); flat(ctx, (c) => { c.moveTo(-2, 2); c.lineTo(0, puppy ? -8 : -14); c.lineTo(5, 2); c.closePath(); }, puppy ? '#f0b8a0' : hc, 0); ctx.restore(); }
  cel(ctx, (c) => ellipse(c, 0, 0, 19, 17), fur, furD, { lw: 3, hi: furH });
  const jaw = (p.jaw || 0) * 16;
  ctx.save(); ctx.translate(12, 6 + 2); ctx.rotate(jaw * DEG);   // (the lower jaw)
  cel(ctx, (c) => { c.moveTo(-6, 0); c.quadraticCurveTo(14, 6, 24, 2); c.quadraticCurveTo(14, 12, -6, 10); c.closePath(); }, furD, '#0a0607', { lw: 2.4 });
  if (jaw > 3 && !puppy) { ctx.fillStyle = '#f6f0e0'; for (const tx of [6, 14]) { ctx.beginPath(); ctx.moveTo(tx - 2, 1); ctx.lineTo(tx, -5); ctx.lineTo(tx + 2, 1); ctx.fill(); } }
  ctx.restore();
  cel(ctx, (c) => { c.moveTo(6, -8); c.quadraticCurveTo(28, -10, 34, 0); c.quadraticCurveTo(30, 8, 8, 8); c.closePath(); }, fur, furD, { lw: 2.8, hi: furH });   // (the snout)
  flat(ctx, (c) => ellipse(c, 33, -3, 3.8, 3), '#0a0607', 1.6);
  if (alpha) for (const hx of [-4, 8]) flat(ctx, (c) => { c.moveTo(hx - 3, -14); c.quadraticCurveTo(hx - 8, -34, hx + 8, -42); c.quadraticCurveTo(hx + 4, -28, hx + 5, -14); c.closePath(); }, '#5a4a52', 2.4);
  // the eye: calm blue .. amber .. white-hot; the brow slants down when angry
  const ec = eyeCol(r, puppy), face = p.face || 'grim';
  ctx.save(); ctx.translate(14, -5);
  if (face === 'ko') { ctx.strokeStyle = ec; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 4); ctx.stroke(); }
  else {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = puppy ? 0.2 : 0.3 + 0.3 * clamp(r, 0, 1); ctx.fillStyle = ec; ctx.beginPath(); ctx.arc(0, 0, puppy ? 12 : 10, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    flat(ctx, (c) => ellipse(c, 0, 0, puppy ? 7 : 7.6, puppy ? 7 : (face === 'ouch' ? 4 : 6.4), puppy ? 0 : -0.3), '#fffdf0', 2.2);
    flat(ctx, (c) => ellipse(c, 0.6, 0.4, puppy ? 5.2 : 5.6, puppy ? 5.2 : (face === 'ouch' ? 3 : 5), puppy ? 0 : -0.3), ec, 0);
    ctx.fillStyle = '#0a0607'; ctx.beginPath(); ctx.arc(1.8, 0.4, puppy ? 3 : 2.6, 0, TAU); ctx.fill();
    if (puppy) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(-1, -2, 1.8, 0, TAU); ctx.fill(); }
    if (!puppy && face !== 'ouch') { ctx.strokeStyle = INK; ctx.lineWidth = 3.2; const a = (alpha ? 9 : 6) + r * 6; ctx.beginPath(); ctx.moveTo(-8, -6 - a * 0.3); ctx.lineTo(8, -2 + a * 0.3); ctx.stroke(); }
  }
  ctx.restore();
  if (puppy) { ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(26, 2, 6, 0.2, Math.PI - 0.5); ctx.stroke(); if (p.jaw > 0.3) { flat(ctx, (c) => ellipse(c, 24, 9, 3.6, 5), '#f08a98', 1.6); } }   // (a smile, a tongue)
  ctx.restore();
  ctx.restore();
}
