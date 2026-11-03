// THE STONE TROLL (Mystic Mountain, the Troll Bridge): colossal, standing in the chasm at the bridge's far end, his
// head and shoulders over the deck and his fists coming down on it.  Grumpy, mossy, a big round nose -- a giant to
// out-think, never to hurt: he sneezes himself off the bridge and says "...thank you."  A code rig, the stand-in until
// his painted atlas (stonetroll) lands.
// Local space: origin = the floor point under his middle (the deck's level), +x = facing (toward the heroes: he faces
// -1 at the right of the screen), y down.  ~330 px from the deck to the top of his head at scale 1 -- the parts below the
// deck are hidden by the stage's bridge (src/stages/mmbridge.js setBehind draws him behind the deck when it has it).
//   armOf(pose): the reaching arm's shoulder and fist (local, scale 1) -- the fist on the deck is the ARM RAMP the
//   heroes climb (src/mmbosses.js StoneTroll); NOSE: the nose (the tickle spot).
// o.part: 'body' | 'arm' (src/mmbosses.js: his body behind the bridge's back wall, the reaching arm over the deck);
// o.rise 0..1: up out of the chasm.
// Clips -- the painted pack's names (tools/sprite3d/chars/stone_troll.py): idle(t) fistWind(k) smash(k) press(k: its
// first third is the wind-up) stunned(t) tickle(k) sneezeWind(k) sneeze(k) topple(k).
//   point(pose, name): a landmark, local px at scale 1 -- nose, fist, mouth, rampLow / rampHigh (the arm's walkable top
//   at the fist / the shoulder: the ramp in 'stunned').
import { TAU, cel, flat, ink, ellipse, circle, keys, clamp, lerp } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 330;
export const META = { id: 'stone_troll', name: 'STONE TROLL', height: 330 };
export const NOSE = [58, -232];
/** the arm's shoulder (fixed) and where the fist is for a pose: k 0 = resting by the deck's edge, 1 = raised high, and
 * `slam` 1 = down on the deck far out in front (the ramp) */
const SHOULDER = [52, -196];
/** a landmark (local px, scale 1; the painted pack's names): nose, mouth, fist, rampLow / rampHigh (the arm's walkable
 * top at the fist end / the shoulder end) */
export function point(p0, name) {
  const p = Object.assign({}, STILL, p0 || {}), A = armOf(p);
  switch (name) {
    case 'nose': return [NOSE[0], NOSE[1] + 4 * (p.breathe || 0)];
    case 'mouth': return [50, -198];
    case 'fist': return A.fist;
    case 'rampLow': return [A.fist[0] - 10, A.fist[1] - 40];
    case 'rampHigh': return [A.shoulder[0] + 20, A.shoulder[1] + 30];   // (the shoulder's top, under the nose: a hero there tickles it)
    case 'tickle': { const lo = point(p, 'rampLow'), hi = point(p, 'rampHigh'); return [lerp(lo[0], hi[0], 0.85), lerp(lo[1], hi[1], 0.85)]; }   // (where a hero stands to reach the nose)
    default: return null;
  }
}
export function armOf(p) {
  const rest = [120, -40], up = [150, -330], slam = [p.reach || 250, -4 + (p.fdy || 0)];   // (reach: how far out it lands; fdy: its depth off his, as screen px)
  const r = clamp(p.raise || 0, 0, 1), s = clamp(p.slam || 0, 0, 1);
  const a = [lerp(rest[0], up[0], r), lerp(rest[1], up[1], r)];
  return { shoulder: SHOULDER.slice(), fist: [lerp(a[0], slam[0], s), lerp(a[1], slam[1], s)] };
}
const STILL = { reach: 250, fdy: 0, breathe: 0, raise: 0, slam: 0, press: 0, lean: 0, head: 0, brow: 0, eyes: 1, mouth: 0, nose: 0, sneeze: 0, fall: 0, smile: 0, dizzy: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ breathe: Math.sin(t * 1.6), brow: 0.7, head: 0.03 * Math.sin(t * 0.9) }),
  roar: (k) => P({ mouth: Math.sin(Math.min(1, k * 1.5) * Math.PI) * 0.9 + 0.1, brow: 1, head: -0.08, raise: 0.4 * Math.sin(k * Math.PI), lean: 0.05 }),
  fistWind: (k) => P({ raise: k, lean: -0.08 * k, brow: 1, mouth: 0.3 * k }),
  smash: (k) => keys(k, [[0, P({ raise: 1, lean: -0.08, brow: 1, mouth: 0.3 })], [0.3, P({ raise: 0, slam: 1, lean: 0.1, brow: 1, mouth: 0.8 }), 'in'], [1, P({ slam: 1, lean: 0.08, brow: 0.8, mouth: 0.2 })]]),
  press: (k) => k < 0.35 ? P({ raise: 0.6 * k / 0.35, press: 0, lean: -0.05 * k / 0.35, brow: 1 })
    : P({ raise: 0, slam: 0.85, press: Math.sin(Math.min(1, (k - 0.35) / 0.65 * 1.2) * Math.PI), lean: 0.12, brow: 1, mouth: 0.5 }),
  stunned: (t) => P({ slam: 1, lean: 0.06, eyes: 0, dizzy: 1, mouth: 0.25, head: 0.1 * Math.sin(t * 2), brow: -0.4 }),
  tickle: (k) => P({ slam: 1, lean: 0.06, eyes: 0, nose: Math.sin(k * Math.PI * 4) * 0.6, mouth: 0.2, brow: -0.6, head: -0.05 }),
  sneezeWind: (k) => P({ slam: 1 - k, raise: 0.3 * k, lean: -0.2 * k, head: -0.35 * k, eyes: 0, nose: k, mouth: 0.4 + 0.4 * k, brow: -1 }),
  sneeze: (k) => keys(k, [[0, P({ raise: 0.3, lean: -0.2, head: -0.35, eyes: 0, nose: 1, mouth: 0.8, brow: -1 })], [0.15, P({ raise: 0.2, lean: 0.25, head: 0.35, eyes: 0, nose: 0.2, mouth: 1, sneeze: 1, brow: -1 }), 'snap'], [1, P({ raise: 0.2, lean: 0.2, head: 0.25, eyes: 0, mouth: 0.6, sneeze: 0, brow: -0.6 })]]),
  topple: (k) => P({ fall: k, raise: 0.6, eyes: 0, mouth: 0.7, brow: -0.6 }),

};
const ROCK = '#8a8478', ROCKD = '#5e594f', ROCKH = '#aaa394', MOSS = '#5e8a3a', MOSSD = '#3f6326';

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {});
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  ctx.save(); ctx.scale(f * S, S);
  if (o.rise !== undefined) ctx.translate(0, (1 - clamp(o.rise, 0, 1)) * 330);   // (rising out of the chasm: the intro)
  // toppling: he tips back and sinks out of sight below the deck
  if (p.fall > 0) { ctx.translate(-80 * p.fall, 260 * p.fall * p.fall); ctx.rotate(-0.9 * p.fall); }
  ctx.translate(0, 4 * p.breathe); ctx.rotate(p.lean * 0.6);
  const A = armOf(p);
  const part = o.part;                    // ('body': all but the near arm -- drawn behind the bridge's wall; 'arm': only it)
  if (part !== 'arm') {
  // the far arm (resting on the deck edge, or pressing down too)
  {
    const fist = [lerp(-30, 180, p.press), lerp(-30, -6, p.press)];
    limb(ctx, [-60, -190], fist, 44, ROCKD, ROCKD);
    rockFist(ctx, fist[0], fist[1], 40, ROCKD);
  }
  // the body: a mossy boulder of a torso
  cel(ctx, (c) => ellipse(c, -10, -140, 128, 118), ROCK, ROCKD, { lw: 4, hi: ROCKH, hk: 0.35, detail: (c) => {
    c.fillStyle = MOSS; c.beginPath(); c.ellipse(-30, -246, 90, 26, 0.1, 0, TAU); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(-70 + i * 30, -120 + (i % 2) * 40, 14, 9, i, 0, TAU); c.fill(); }
  } });
  // the head
  ctx.save(); ctx.translate(18, -238); ctx.rotate(p.head);
  cel(ctx, (c) => ellipse(c, 0, 0, 74, 62), ROCK, ROCKD, { lw: 4, hi: ROCKH, hk: 0.3, detail: (c) => {
    c.fillStyle = MOSS; c.beginPath(); c.ellipse(-8, -52, 62, 20, 0, 0, TAU); c.fill();
    c.fillStyle = MOSSD; for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(-50 + i * 16, -40 + Math.sin(i) * 4, 6, 0, TAU); c.fill(); }
  } });
  // brows: a heavy ledge of rock
  const b = p.brow;
  cel(ctx, (c) => { c.moveTo(-6, -24 - b * 4); c.quadraticCurveTo(26, -34 - b * 6, 62, -18 + b * 6); c.lineTo(58, -8 + b * 4); c.quadraticCurveTo(28, -18, -2, -12); c.closePath(); }, ROCKD, ROCKD, { lw: 3 });
  // eyes: small and grumpy (closed / dizzy when stunned)
  if (p.eyes > 0.5) {
    for (const ex of [16, 44]) { flat(ctx, (c) => ellipse(c, ex, -4, 7, 6), '#fff4c8', 2.2); flat(ctx, (c) => circle(c, ex + 2, -3, 3), '#2a1a10', 0); }
  } else if (p.dizzy > 0.5) {
    for (const ex of [16, 44]) ink(ctx, (c) => { for (let i = 0; i <= 12; i++) { const a = i * 0.9 + t * 6, r = 1 + i * 0.5; i ? c.lineTo(ex + Math.cos(a) * r, -4 + Math.sin(a) * r) : c.moveTo(ex + Math.cos(a) * r, -4 + Math.sin(a) * r); } }, 2);
  } else for (const ex of [16, 44]) ink(ctx, (c) => { c.moveTo(ex - 7, -4); c.quadraticCurveTo(ex, -8 + p.nose * 4, ex + 7, -4); }, 3);
  // the NOSE: big, round and ticklish
  const nw = 1 + 0.12 * Math.abs(p.nose);
  ctx.save(); ctx.translate(40, 12); ctx.rotate(p.nose * 0.12); ctx.scale(nw, 1 / nw);
  cel(ctx, (c) => ellipse(c, 0, 0, 24, 20), '#a7907a', '#7c6654', { lw: 3.2, hi: '#c4ab92', hk: 0.4 });
  flat(ctx, (c) => { circle(c, -6, 8, 4); circle(c, 8, 8, 4); }, '#3a2a20', 0);
  ctx.restore();
  // mouth: a wide grumpy line, a big O roaring or sneezing, a sheepish smile at the end
  if (p.smile > 0.5) ink(ctx, (c) => { c.moveTo(4, 38); c.quadraticCurveTo(34, 52, 62, 36); }, 3.4);
  else if (p.mouth > 0.35) {
    flat(ctx, (c) => ellipse(c, 32, 40, 22, 6 + p.mouth * 14), '#3a2420', 3);
    flat(ctx, (c) => { c.moveTo(14, 34); c.lineTo(18, 42); c.lineTo(22, 34); c.closePath(); c.moveTo(42, 34); c.lineTo(46, 42); c.lineTo(50, 34); c.closePath(); }, '#efe6cc', 1.6);
  } else ink(ctx, (c) => { c.moveTo(8, 40); c.quadraticCurveTo(34, 34, 60, 42); }, 3.4);
  // the sneeze: a great cloud blast out of the nose
  if (p.sneeze > 0.1) {
    ctx.save(); ctx.globalAlpha = p.sneeze;
    for (let i = 0; i < 9; i++) flat(ctx, (c) => circle(c, 70 + i * 28, 14 + Math.sin(i * 1.7) * 18, 18 + i * 3), 'rgba(240,240,232,0.85)', 0);
    ctx.restore();
  }
  if (p.dizzy > 0.5) for (let i = 0; i < 4; i++) { const a = t * 3 + i * 1.57; flat(ctx, (c) => { const x = 28 + Math.cos(a) * 70, y = -70 + Math.sin(a) * 12; for (let j = 0; j < 10; j++) { const r = j % 2 ? 3 : 8, bb = j / 10 * TAU; j ? c.lineTo(x + Math.cos(bb) * r, y + Math.sin(bb) * r) : c.moveTo(x + Math.cos(bb) * r, y + Math.sin(bb) * r); } c.closePath(); }, '#ffe066', 1.6); }
  ctx.restore();
  }
  // the near arm: the one that smashes -- and lies on the deck as the ramp when he's stunned
  if (part !== 'body') {
  limb(ctx, A.shoulder, A.fist, 52, ROCK, ROCKD);
  rockFist(ctx, A.fist[0], A.fist[1], 46, ROCK);
  if (p.slam > 0.9 && p.dizzy > 0.5) {   // (a mossy, walkable top along the stunned arm)
    ink(ctx, (c) => { c.moveTo(A.fist[0] - 10, A.fist[1] - 40); c.lineTo(A.shoulder[0] + 20, A.shoulder[1] - 22); }, 7, 'rgba(110,160,70,0.85)');
  }
  }
  void INK;
  ctx.restore();
}
function limb(ctx, a, b, w, base, dark) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2;
  cel(ctx, (c) => { c.moveTo(a[0] + nx * 1.2, a[1] + ny * 1.2); c.quadraticCurveTo((a[0] + b[0]) / 2 + nx * 1.4, (a[1] + b[1]) / 2 + ny * 1.4, b[0] + nx * 0.8, b[1] + ny * 0.8); c.lineTo(b[0] - nx * 0.8, b[1] - ny * 0.8); c.quadraticCurveTo((a[0] + b[0]) / 2 - nx, (a[1] + b[1]) / 2 - ny, a[0] - nx * 1.2, a[1] - ny * 1.2); c.closePath(); }, base, dark, { lw: 3.5 });
}
function rockFist(ctx, x, y, r, base) {
  cel(ctx, (c) => { ellipse(c, x, y - r * 0.55, r, r * 0.7); }, base, ROCKD, { lw: 3.5, hi: ROCKH, hk: 0.3 });
  ink(ctx, (c) => { for (let i = -1; i <= 1; i++) { c.moveTo(x + i * r * 0.4, y - r * 1.1); c.lineTo(x + i * r * 0.42, y - r * 0.75); } }, 2.4);
}
