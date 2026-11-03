// COLLAR IMP (Skull Island, the Kraken's stage and later Malachar's palace -- docs/SKULL_ISLAND.md): one of Malachar's purple imps -- a
// round violet body, big pointed ears, two stubby horns, glowing yellow eyes, bat wings and a spiked tail, wearing a tiny spiked collar
// like the one on the Kraken.  Cheeky and noisy, never scary; beaten, it tumbles and flaps away squeaking.
// A code rig, the stand-in until its painted pack lands (docs: "fire_imp recoloured purple").  Local space: origin = the point on
// the floor under it (the game lifts it by its hover height), +x = facing, y down; ~92 px tall at scale 1.
// Clips: fly(t) hover(t) diveWind(k) swoop(k) hurt(k) fly_knock(k) down(k) flee(t).
import { TAU, DEG, cel, flat, ink, capsule, ellipse, circle, keys } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 92;
export const META = { id: 'collarimp', name: 'COLLAR IMP', height: 92 };
export const HURTBOX = { x: 0, w: 28, h: 84 };

const STILL = { x: 0, y: 0, tilt: 0, wing: 0.4, arm: 20, tail: 0, face: 'grin', sq: 1, lie: 0, spin: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  fly: (t) => P({ y: 3 * Math.sin(t * 5), wing: 0.5 + 0.5 * Math.sin(t * 22), arm: 24 + 8 * Math.sin(t * 5), tail: Math.sin(t * 6), tilt: 3 * Math.sin(t * 3) }),
  hover: (t) => P({ y: 3 * Math.sin(t * 5), wing: 0.5 + 0.5 * Math.sin(t * 22), arm: 24 + 8 * Math.sin(t * 5), tail: Math.sin(t * 6) }),
  // the wind-up: wings flung high, a crouch, claws out, a nasty little giggle
  diveWind: (k) => P({ y: -4 * k, wing: 1 - 0.3 * k, arm: 70 * k + 20, tilt: -14 * k, tail: -0.8 * k, face: 'giggle', sq: 1 - 0.05 * k }),
  swoop: (k) => keys(k, [[0, P({ wing: 0.9, arm: 90, tilt: -14, face: 'giggle' })], [0.3, P({ wing: 0.2, arm: 100, tilt: 40, tail: 0.6, face: 'giggle', sq: 1.04 }), 'snap'], [0.8, P({ wing: 0.5, arm: 70, tilt: 30, face: 'grin' })], [1, P({}), 'io']]),
  hurt: (k) => P({ tilt: -22 * (1 - k), x: -4 * (1 - k), wing: 0.9, arm: 70, face: 'ouch', sq: 1.05 }),
  fly_knock: (k) => P({ tilt: -60 + 120 * k, spin: k, wing: 1, arm: 90, face: 'ouch', tail: 1 }),
  down: (k) => P({ lie: 1, wing: 0.1 + 0.1 * Math.sin(k * TAU * 2), arm: 30, face: 'ko', tail: 0.3 * Math.sin(k * TAU) }),
  flee: (t) => P({ wing: 0.5 + 0.5 * Math.sin(t * 26), arm: 60, tilt: 18, face: 'ouch', tail: Math.sin(t * 8) }),
};

const SKIN = '#8a46c4', SKIND = '#5a2a8a', SKINH = '#b57ae8', BELLY = '#d8aef2', MEM = '#a82a8a', MEMD = '#6e1a5e', EYE = '#ffe03a', COLLAR = '#3a2050', COLLARH = '#6a4a8a';

function wing(ctx, side, flap) {
  // a bat wing: a bone arm out and up, three fingers and a scalloped membrane; flap 0..1 (1 = high)
  ctx.save(); ctx.scale(1, 1);
  const up = -30 + (flap - 0.5) * 80;   // degrees of elevation
  ctx.rotate(up * DEG * side);
  const L = 34;
  const tips = [[L * 1.2, -L * 0.7], [L * 1.5, -L * 0.05], [L * 1.15, L * 0.55]];
  cel(ctx, (c) => {
    c.moveTo(0, 0); c.lineTo(L * 0.55, -L * 0.55);
    c.lineTo(tips[0][0], tips[0][1]); c.quadraticCurveTo(L * 1.0, -L * 0.2, tips[1][0], tips[1][1]);
    c.quadraticCurveTo(L * 1.0, L * 0.25, tips[2][0], tips[2][1]); c.quadraticCurveTo(L * 0.6, L * 0.35, 0, L * 0.3); c.closePath();
  }, MEM, MEMD, { lw: 2.6 });
  ink(ctx, (c) => { c.moveTo(0, 0); c.lineTo(L * 0.55, -L * 0.55); for (const t of tips) { c.moveTo(L * 0.55, -L * 0.55); c.lineTo(t[0], t[1]); } }, 2.2, SKIND);
  ctx.restore();
}
function ear(ctx, x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a * DEG);
  cel(ctx, (c) => { c.moveTo(-5, 4); c.quadraticCurveTo(-4, -16, 2, -26); c.quadraticCurveTo(10, -14, 8, 6); c.closePath(); }, SKIN, SKIND, { lw: 2.4, hi: SKINH });
  flat(ctx, (c) => { c.moveTo(-1, 2); c.quadraticCurveTo(0, -10, 2, -18); c.quadraticCurveTo(5, -10, 4, 2); c.closePath(); }, '#f0b0d8', 0);
  ctx.restore();
}

export function draw(ctx, pose, o = {}) {
  const p = pose || STILL, f = o.facing || 1, t = o.t || 0;
  ctx.save();
  ctx.scale(f, 1);
  const lie = p.lie || 0;
  ctx.translate(p.x || 0, (p.y || 0) - 46 * (1 - lie) - 10 * lie);
  ctx.rotate(((p.tilt || 0) + lie * 90) * DEG);
  ctx.scale(1, p.sq || 1);
  // the far wing, behind
  ctx.save(); ctx.translate(-6, -2); ctx.scale(-1, 1); wing(ctx, 1, 1 - (p.wing ?? 0.4)); ctx.restore();
  // the tail: a curl ending in an arrow tip
  ctx.save(); ctx.translate(-14, 14); ctx.rotate((20 + (p.tail || 0) * 24) * DEG);
  ink(ctx, (c) => { c.moveTo(0, 0); c.quadraticCurveTo(-20, 8, -26, 26); }, 5, INK);
  ink(ctx, (c) => { c.moveTo(0, 0); c.quadraticCurveTo(-20, 8, -26, 26); }, 2.6, SKIN);
  flat(ctx, (c) => { c.moveTo(-26, 26); c.lineTo(-34, 22); c.lineTo(-28, 36); c.lineTo(-18, 28); c.closePath(); }, '#7a2a9a', 2);
  ctx.restore();
  // the body: a round, plump belly; stubby legs
  for (const lx of [-8, 10]) { ctx.save(); ctx.translate(lx, 22); ctx.rotate((lx < 0 ? 8 : -6) * DEG); cel(ctx, (c) => capsule(c, 16, 4.4, 3.6), SKIN, SKIND, { lw: 2.2 }); flat(ctx, (c) => ellipse(c, 2, 18, 6.4, 3.4), SKIND, 2); ctx.restore(); }
  cel(ctx, (c) => ellipse(c, 0, 6, 20, 24), SKIN, SKIND, { hi: SKINH, lw: 3, detail: (c) => { c.fillStyle = BELLY; c.beginPath(); c.ellipse(5, 12, 11, 15, 0, 0, TAU); c.fill(); } });
  // the near arm
  ctx.save(); ctx.translate(10, -4); ctx.rotate(-(p.arm ?? 20) * DEG); cel(ctx, (c) => capsule(c, 20, 4.4, 3.6), SKIN, SKIND, { lw: 2.2 });
  ctx.translate(0, 20); flat(ctx, (c) => circle(c, 0, 0, 5), SKINH, 2); ctx.restore();
  // the near wing, at the shoulder (under the head)
  ctx.save(); ctx.translate(-2, 2); ctx.scale(-1, 1); wing(ctx, 1, p.wing ?? 0.4); ctx.restore();
  // the head: big, with ears and horns, over the body; the little spiked collar at the neck
  ctx.save(); ctx.translate(2, -26);
  ear(ctx, -17, -8, -28); ear(ctx, 15, -10, 30);
  for (const hx of [-9, 9]) flat(ctx, (c) => { c.moveTo(hx - 4, -14); c.quadraticCurveTo(hx, -26, hx + (hx < 0 ? -2 : 2), -28); c.quadraticCurveTo(hx + 4, -20, hx + 4, -14); c.closePath(); }, '#f2e6c8', 2.2);
  cel(ctx, (c) => ellipse(c, 0, 0, 22, 20), SKIN, SKIND, { hi: SKINH, lw: 3 });
  // the eyes: glowing yellow, slanted
  const face = p.face || 'grin';
  for (const ex of [-9, 9]) {
    if (face === 'ko') { ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ex - 4, -6); ctx.lineTo(ex + 4, 2); ctx.moveTo(ex + 4, -6); ctx.lineTo(ex - 4, 2); ctx.stroke(); continue; }
    flat(ctx, (c) => ellipse(c, ex, -2, 6, face === 'ouch' ? 3 : 7, ex < 0 ? 0.3 : -0.3), EYE, 2.2);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + 1.2, -1.6, face === 'ouch' ? 1.6 : 2.4, 0, TAU); ctx.fill();
    if (face !== 'ouch') { ctx.strokeStyle = INK; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(ex + (ex < 0 ? -7 : 7), -12); ctx.lineTo(ex + (ex < 0 ? 5 : -5), -7); ctx.stroke(); }
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath();
  if (face === 'grin' || face === 'giggle') { ctx.moveTo(-10, 8); ctx.quadraticCurveTo(0, face === 'giggle' ? 20 : 15, 10, 8); ctx.stroke(); ctx.fillStyle = '#f6f0e0'; for (const tx of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(tx - 2, 10); ctx.lineTo(tx, 14); ctx.lineTo(tx + 2, 10); ctx.closePath(); ctx.fill(); } }
  else if (face === 'ouch') { ctx.arc(0, 11, 4, 0, TAU); ctx.stroke(); }
  else { ctx.moveTo(-6, 10); ctx.lineTo(6, 10); ctx.stroke(); }
  // the collar (a ring under the chin with three little spikes)
  flat(ctx, (c) => { c.moveTo(-17, 16); c.quadraticCurveTo(0, 26, 17, 16); c.lineTo(15, 22); c.quadraticCurveTo(0, 32, -15, 22); c.closePath(); }, COLLAR, 2.4);
  for (const sx of [-9, 0, 9]) flat(ctx, (c) => { c.moveTo(sx - 4, 22 + Math.abs(sx) * 0.1); c.lineTo(sx, 31 + Math.abs(sx) * 0.15); c.lineTo(sx + 4, 22 + Math.abs(sx) * 0.1); c.closePath(); }, '#241436', 1.8);
  ctx.restore();
  ctx.restore();
  void t;
}
