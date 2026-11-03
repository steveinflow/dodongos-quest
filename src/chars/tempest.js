// BOSS: TEMPEST, the Storm Dragon (Level 3, Stormspire).  Art (drawn in code) + pose library.
//
// A big, elegant storm dragon (~360 px nose to bolt tip, ~430 px wingspan at scale 1): slate-silver-blue scales with a
// silver belly, white cloud-lock mane streaming from the crown down an S-curved neck (+ a cloud frill on the cheek),
// two pairs of swept-back pearl horns that crackle with lightning, huge storm-indigo bat wings, a tail ending in a
// golden LIGHTNING-BOLT tip.  Cursed (o.cursed, default true): the
// Dragon King's big black-iron collar with a large glowing green gem, glowing green eyes, a hard scowl.  Freed: no
// collar, storm-blue eyes, a proud, kind face (she has lashes and a soft smile).  She speaks in cutscenes: o.talk.
//
// Local space: origin = the point on the FLOOR under her body, +x = facing, y down.  The engine lifts her by z (60-200)
// in the air; her body centre sits at BODY_Y = -40 (scale 1).  Ground poses (landing from k .35, grounded, takeoff to
// k .35, defeated from k .3, freed) are ground-solved for z = 0: the lowest foot stands on the origin's floor line.
// Drawn bounds (scale 1, before z): x -240 .. +190 (gust wind FX to +350), y -275 .. +85 (hover -256 .. +4), so
// render.js's white-flash buffer (560 x 460, feet at 280, 420 -> y -420 .. +40) clips her lowest wingtip / tail in
// boltWind, landing, hurt: use feet at y 360 (covers -360 .. +100) when flashing her.
// Time: hover / swoop / roar / grounded / freed / glide take t (seconds); keyed moves (k 0..1) flap from o.t.
// Secondary motion: o.mem + o.vel ({x, y, z} world px / frame) drive the mane, tail and wing lag via
// rig.follow(); without o.mem the targets come straight back (pose sheets read fine).
// Measurements: boxesOf(pose) -> { body, head } hurtboxes for any pose (HURTBOX / HURTBOX_GROUND / HEADBOX = the
// hover / grounded values), HORNS (bolt-call spark point, boltWind k = 1), MOUTH (roar), headOf(pose) (cameras,
// speech bubbles), SADDLE + SEATS (glide: hero hips, three seats along the flat back), saddleOf(pose, seat) for any
// pose (the hero sit pose has its hips at local y = 0).  drawCollar() draws the collar alone (falling off).
import { cel, flat, ink, blob, ellipse, circle, keys, mix, follow, DEG, TAU, clamp, lerp } from '../rig.js';
import { INK } from '../config.js';

const C = {
  sc: '#7393c6', scD: '#4d6898', scH: '#c2d6f2', scL: '#5d7aab',
  scF: '#5b77a6', scFD: '#3c537d',
  bel: '#e2e8f1', belD: '#aab7cc', belL: '#8a99b2',
  mane: '#ffffff', maneD: '#c5d1e3', maneL: '#a5b5cd',
  mem: '#2f3f7a', memD: '#1f2a58', memL: '#4d62a8', memF: '#283766', memFD: '#1a2449', vein: 'rgba(14,20,52,0.55)',
  boneF: '#465e8a',
  horn: '#eef2f8', hornD: '#a7b4c8', hornL: '#8b99b0',
  bolt: '#ffe45a', boltD: '#d9a018', boltC: '#fffbe0',
  spark: '#fffbe0', sparkY: '#ffe14d', halo: '#fff1a0',
  iron: '#3b3d47', ironD: '#1f2128', ironH: '#737885', ironL: '#5a5e6c',
  gem: '#4cf571', gemD: '#11a043', gemC: '#eaffdf', glow: '#5cff7e',
  eyeW: '#fbfdff', iris: '#4b9fe6', irisD: '#21599a', pupil: '#0f1a33',
  mouth: '#3a1530', tongue: '#e0708e', tooth: '#fffaf0',
  claw: '#eef2f8', clawD: '#9aa7bc',
  brow: '#25365a', lash: '#21141c',
  rim: '#e6f4ff',
};

// ---------------------------------------------------------------- skeleton (body frame: origin = body centre)
export const BODY_Y = -40;
const NECK0 = [42, -14], NSEG = 7, NLEN = 11;
const TAIL_ROOT = [-60, -6], TN = 10, TSEG = 8.8;
const HS = 1.32;                                          // head scale (line widths inside the head are divided back)
const SH_N = [26, -24], SH_F = [32, -29];                 // wing roots
const HIP_N = [-44, -2], HIP_F = [-38, -6];
const ARM_N = [34, 10], ARM_F = [39, 6];
const THIGH = 30, SHIN = 26, FOOTL = 24, FOOTH = 8;
const UARM = 22, FARM = 20;
const TILT = 20 * DEG;
const FLAP_HZ = 1.1, TAIL_HZ = 0.7;
const SEATS_BODY = [[8, -33], [-20, -32.5], [-46, -29.5]]; // hero hips on the back (glide)

// ---------------------------------------------------------------- poses
// pitch (+ nose up), rot, bob (px, with the beat).  na: neck lift (deg up from forward), nc: curl per segment,
// head: absolute head angle in the body frame (+ nose up), jaw.  wing: mid flap angle, flap: amplitude, sweep (+ back,
// - forward), fold 0..1, ph: wing phase (cycles) or null = o.t.  tb / tc / tsw / tp: tail droop, curl, sway, phase.
// hl / hk: hind thigh (+ fwd) and knee (+ shin swings back), fl / fk fore leg.  ground: ground-solve (z = 0 poses).
// glow: horn crackle 0..1, gust: wind streaks 0..1, streak: speed lines, crack / shatter: collar, stream: extra
// mane streaming 0..1, face: mean | fierce | roar | ouch | dazed | pant | kind | happy | proud.
export const BASE = {
  x: 0, y: 0, rot: 0, pitch: 4, bob: 5,
  na: 52, n0: -7, nc: 12, head: -2, jaw: 0,
  wing: 42, wf: 14, flap: 34, sweep: 0, fold: 0, ph: null,
  tb: 22, tc: 3, tsw: 5, tp: null,
  hl: 40, hk: 128, fl: 52, fk: 138,
  ground: false, glow: 0, gust: 0, streak: 0, crack: 0, shatter: 0, stream: 0, mn: 3,
  face: 'mean', free: false, blink: false, sq: 1,
};
const P = (o) => Object.assign({}, BASE, o);

const HOVER = P({});
// on the ground: belly low, wings half folded, legs folded under, head low (vulnerable)
const GROUND = { ground: true, bob: 0, pitch: 2, na: 30, nc: 6, head: -16, wing: 36, flap: 0, fold: 0.9, sweep: 66,
  tb: 34, tc: 4, tsw: 1.5, hl: 64, hk: 142, fl: -14, fk: -44 };
const FLARE = { y: -8, pitch: 22, na: 58, nc: 9, head: 2, wing: 44, flap: 0, sweep: -14, fold: 0, tb: 56, tc: 4,
  hl: 18, hk: 46, fl: 10, fk: 16, bob: 0, ph: 0.42 };
const REAR_UP = { y: -14, pitch: 28, na: 64, n0: -4, nc: 6, head: 10, jaw: 30, wing: 80, flap: 8, sweep: 12, tb: 60, tc: 6,
  hl: -10, hk: 30, fl: 30, fk: 70, bob: 0 };

export const ANIM = {
  // slow, powerful wing beats; the body rides each downstroke, mane / tail flow in the storm wind
  hover(t) {
    const s = Math.sin(t * 1.3), s2 = Math.sin(t * 0.8 + 1);
    return P({ ph: t * FLAP_HZ, tp: t * TAIL_HZ, x: 3 * Math.sin(t * 0.9), pitch: 4 + 2 * s, na: 52 + 4 * s2, head: -2 - 4 * s2,
      tc: 3 + 2 * Math.sin(t * 1.1), hl: 40 + 6 * s, fl: 52 - 5 * s, blink: (t % 4.1) > 3.98 });
  },
  // 30 f: climbs back and up, wings hauled high, head lowered at the target
  swoopWind: (k) => keys(k, [
    [0, HOVER],
    [0.55, P({ x: -12, y: -16, pitch: 16, na: 40, nc: 10, head: -26, jaw: 6, wing: 76, flap: 6, sweep: 10, tb: 40, tc: 8, hl: -30, hk: -20,
      fl: -10, fk: 80, face: 'fierce', bob: 0, ph: 0.85 }), 'out'],
    [1, P({ x: -16, y: -20, pitch: 8, na: 34, nc: 8, head: -24, jaw: 8, wing: 82, flap: 3, sweep: 18, tb: 30, tc: 9, hl: -40, hk: -30,
      fl: -20, fk: 90, face: 'fierce', bob: 0, ph: 0.9 })],
  ]),
  // low fast pass across the floor: streamlined, wings swept back, neck outstretched, jaws open
  swoop: (t) => P({ ph: t * 2.4, tp: t * 2, pitch: -6, na: 8, nc: 2, head: -6, jaw: 14, wing: 10, flap: 8, sweep: 52, fold: 0.38,
    tb: 2, tc: -0.5, tsw: 3, hl: -96, hk: -20, fl: -70, fk: 40, face: 'fierce', streak: 1, stream: 1, bob: 0 }),
  // 40 f: gathers, then rears up calling the storm: horns crackle more and more (the engine marks the strike spots)
  boltWind: (k) => {
    const p = keys(k, [
      [0, HOVER],
      [0.28, P({ x: 4, y: 6, pitch: -6, na: 30, nc: 10, head: -30, jaw: 0, wing: 6, flap: 4, fold: 0.35, sweep: 20, tb: 30, tc: 10, hl: -40, hk: -10,
        fl: -10, fk: 100, face: 'fierce', bob: 0, ph: 0.3 }), 'out'],
      [0.72, P(Object.assign({}, REAR_UP, { face: 'roar' })), 'back'],
      [1, P(Object.assign({}, REAR_UP, { y: -16, head: 12, jaw: 34, face: 'roar' }))],
    ]);
    p.glow = clamp((k - 0.12) / 0.6, 0, 1);
    if (k > 0.72) p.x += Math.sin(k * 300) * 1.2;
    return p;
  },
  // 30 f: wings cocked high and back, chest out, leaning back
  gustWind: (k) => keys(k, [
    [0, HOVER],
    [0.6, P({ x: -8, y: -8, pitch: 14, na: 56, head: 8, jaw: 4, wing: 84, flap: 3, sweep: 44, tb: 40, tc: 6, hl: -30, fl: 0, fk: 60,
      face: 'fierce', bob: 0, ph: 0.92 }), 'out'],
    [1, P({ x: -10, y: -9, pitch: 18, na: 58, head: 12, jaw: 6, wing: 88, flap: 2, sweep: 52, tb: 44, tc: 7, hl: -24, fl: 6, fk: 56,
      face: 'fierce', bob: 0, ph: 0.95 })],
  ]),
  // 50 f: two huge forward wing claps (contact at k .14 and .52); the engine pushes the heroes back during it
  gust: (k) => {
    const up = { x: -10, y: -9, pitch: 18, na: 58, head: 12, jaw: 6, wing: 88, flap: 0, sweep: 52, tb: 44, tc: 7, hl: -24, fl: 6, fk: 56, face: 'fierce', bob: 0 };
    const down = { x: 10, y: 4, pitch: -8, na: 44, head: -8, jaw: 20, wing: -4, wf: 22, flap: 0, sweep: -64, fold: 0, tb: 10, tc: 2, hl: -70, fl: -40, fk: 90, face: 'roar', bob: 0 };
    const p = keys(k, [
      [0, P(up)],
      [0.14, P(Object.assign({}, down, { gust: 1 })), 'snap'],
      [0.26, P(Object.assign({}, down, { x: 8, wing: -10, sweep: -48, gust: 0.7 }))],
      [0.4, P(Object.assign({}, up, { x: -6, wing: 80, sweep: 44, gust: 0.25 })), 'io'],
      [0.52, P(Object.assign({}, down, { x: 12, gust: 1 })), 'snap'],
      [0.66, P(Object.assign({}, down, { x: 8, wing: -10, sweep: -46, gust: 0.6 }))],
      [1, P({ ph: 0.42 })],
    ]);
    if (k > 0.86) p.ph = null;
    return p;
  },
  // 30 f: flares (wings braking), legs reach down, touches down at k .35 (bring z to 0 over k 0 .. .35), heavy squash
  landing: (k) => keys(k, [
    [0, HOVER],
    [0.3, P(Object.assign({}, FLARE, { face: 'mean' })), 'out'],
    [0.35, P(Object.assign({}, FLARE, { ground: true, y: 0, pitch: 12, hl: 30, hk: 70, fl: 6, fk: 10, face: 'mean' }))],
    [0.5, P(Object.assign({}, GROUND, { y: 6, pitch: -2, na: 18, head: -24, jaw: 10, wing: 6, fold: 0.3, sweep: 10, tb: 70, hk: 126, fk: -40, face: 'ouch', sq: 0.92 })), 'snap'],
    [1, P(Object.assign({}, GROUND, { face: 'pant' }))],
  ]),
  // vulnerable phase: down on the floor, wings half folded, panting hard
  grounded(t) {
    const b = Math.sin(t * 7.5), b2 = Math.sin(t * 1.4);
    return P(Object.assign({}, GROUND, { y: 1.5 * b, na: 26 + 2 * b, head: -16 - 3 * b + 3 * b2, jaw: 14 + 8 * b, tc: -4 + 1.5 * b2,
      wing: 34 + 2 * b, face: 'pant', tp: t * 0.4, blink: (t % 2.9) > 2.75 }));
  },
  // 30 f: crouch, then a huge downstroke throws her up (the engine lifts z from k .35)
  takeoff: (k) => keys(k, [
    [0, P(Object.assign({}, GROUND, { face: 'mean' }))],
    [0.3, P(Object.assign({}, GROUND, { y: 10, pitch: 4, na: 22, head: -22, wing: 88, fold: 0, sweep: 30, hl: 66, hk: 150, fl: -30, fk: -60, sq: 0.9, face: 'fierce' })), 'out'],
    [0.35, P({ ground: true, y: 0, pitch: 24, na: 56, head: 6, wing: 40, flap: 0, fold: 0, sweep: -6, tb: 50, hl: 0, hk: 10, fl: -40, fk: 0, bob: 0, face: 'fierce' }), 'snap'],
    [0.5, P({ y: -10, pitch: 20, na: 60, head: 6, wing: -8, flap: 0, sweep: -12, tb: 46, hl: -30, hk: 0, fl: -30, fk: 30, bob: 0, face: 'fierce' }), 'out'],
    [0.75, P({ y: -4, pitch: 12, na: 54, wing: 60, flap: 0, sweep: 10, tb: 34, hl: -50, hk: -30, bob: 0 })],
    [1, P({ ph: 0.42 })],
  ]),
  // hit in the air: head snaps back, wings jolt
  hurt: (k) => keys(k, [
    [0, P({ x: -10, y: -4, pitch: 18, na: 62, nc: 14, head: 30, jaw: 22, wing: 64, flap: 0, fold: 0.15, tb: 6, tc: -4, tsw: 3, hl: -20, fl: 10, fk: 30,
      face: 'ouch', bob: 0, ph: 0.9, sq: 0.95 })],
    [0.3, P({ x: -13, y: -2, pitch: 14, na: 58, nc: 12, head: 22, jaw: 16, wing: 54, flap: 8, fold: 0.1, tb: 12, tc: -2, hl: -30, fl: 0, fk: 40,
      face: 'ouch', bob: 0, ph: 0.95 }), 'out'],
    [1, P({ x: -3, ph: 1.4 })],
  ]),
  // heavy hit: knocked sideways and down, wings flail, dazed, then recovers
  stagger: (k) => keys(k, [
    [0, P({ x: -16, y: 10, rot: -16, pitch: 10, na: 40, nc: 16, head: 30, jaw: 26, wing: -20, flap: 0, fold: 0.3, sweep: 30, tb: -10, tc: -6, tsw: 6,
      hl: 20, hk: 40, fl: 40, fk: 20, face: 'ouch', bob: 0, ph: 0.4 })],
    [0.3, P({ x: -20, y: 18, rot: 10, pitch: -8, na: 24, nc: 12, head: -20, jaw: 18, wing: 60, flap: 10, fold: 0.2, sweep: 10, tb: 40, tc: 4, tsw: 8,
      hl: 10, hk: 60, fl: 30, fk: 40, face: 'dazed', bob: 0, ph: 0.8 }), 'out'],
    [0.62, P({ x: -12, y: 8, rot: -4, pitch: 2, na: 40, head: -10, jaw: 10, wing: -10, flap: 0, tb: 30, face: 'dazed', bob: 0, ph: 1.3 })],
    [1, P({ x: -4, ph: 1.6, face: 'mean' })],
  ]),
  // intro / phase change: rears up hovering, roaring, mane flaring
  roar(t) {
    const sh = Math.sin(t * 46) * 1.1;
    return P(Object.assign({}, REAR_UP, { ph: t * 0.9, wing: 40, flap: 26, head: 30 + sh, jaw: 40, x: sh * 0.6, face: 'roar', stream: 0.6,
      glow: 0.35 + 0.25 * Math.sin(t * 9), tp: t * 1.2 }));
  },
  // 100 f: crashes down (bring z to 0 over k 0 .. .3), slumps, the collar cracks, then SHATTERS at k .78; she lifts her
  // head with storm-blue eyes (free from k .8, ends on freed(0))
  defeated: (k) => {
    const g = Object.assign({}, GROUND);
    const p = keys(k, [
      [0, P({ y: -6, pitch: 20, na: 64, head: 26, jaw: 24, wing: 60, flap: 0, fold: 0.2, tb: 30, hl: 10, hk: 40, fl: 20, fk: 30, face: 'ouch', bob: 0, ph: 0.9 })],
      [0.3, P(Object.assign({}, g, { y: 4, pitch: -4, na: 4, nc: 4, head: -26, jaw: 16, wing: -4, fold: 0.25, sweep: 16, tb: 86, hk: 128, face: 'ouch', sq: 0.9 })), 'in'],
      [0.42, P(Object.assign({}, g, { y: 2, pitch: -4, na: 2, nc: 3, head: -28, jaw: 10, wing: 2, fold: 0.35, sweep: 16, face: 'dazed' }))],
      [0.76, P(Object.assign({}, g, { y: 2, pitch: -2, na: 10, nc: 4, head: -22, jaw: 6, wing: 8, fold: 0.45, sweep: 18, face: 'dazed' }))],
      [0.8, P(Object.assign({}, g, { y: 0, pitch: 0, na: 20, nc: 4, head: -10, jaw: 12, wing: 30, fold: 0.3, sweep: 10, face: 'ouch' })), 'snap'],
      [1, P(Object.assign({}, g, { pitch: 6, na: 60, nc: 9, head: 2, jaw: 0, wing: 40, fold: 0.95, sweep: 70, tb: 30, tc: 6, hl: 40, hk: 100, fl: -6, fk: -26, face: 'kind' })), 'io'],
    ]);
    p.crack = clamp((k - 0.44) / 0.32, 0, 1);
    p.shatter = k < 0.78 ? 0 : clamp((k - 0.78) / 0.22, 0, 1);
    p.free = k >= 0.8;
    if (k > 0.78 && k < 0.82) p.face = 'ouch';
    else if (k >= 0.82 && k < 0.9) { p.face = 'happy'; p.jaw = 6; }
    return p;
  },
  // freed: standing proud and gentle on the summit, wings folded, mane drifting, a soft smile (o.talk to speak)
  freed(t) {
    const b = Math.sin(t * 1.5), b2 = Math.sin(t * 0.7 + 1);
    return P(Object.assign({}, GROUND, { free: true, y: 0.8 * b, pitch: 6, na: 60 + 2 * b2, nc: 9, head: 2 + 2 * b2, wing: 40 + 1.5 * b, fold: 0.95, sweep: 70,
      tb: 30, tc: 6, tsw: 2, tp: t * 0.5, hl: 40, hk: 100, fl: -6, fk: -26, face: 'kind', blink: (t % 4.6) > 4.46 }));
  },
  // cutscene: gliding with the heroes on her back (SADDLE / SEATS); wings spread level, flat back, happy
  glide(t) {
    const s = Math.sin(t * 1.1), s2 = Math.sin(t * 0.6 + 0.5);
    return P({ free: true, ph: 0.38 + 0.02 * s, tp: t * 1.1, y: 4 * s, pitch: 0.6 * s2, bob: 0, na: 36 + 3 * s2, nc: 6, head: -4 + 3 * s2, jaw: 3,
      wing: 4 + 3 * s, wf: 6, flap: 0, sweep: 4, fold: 0, tb: 8, tc: 1, tsw: 4, stream: 0.2, mn: 5,
      face: 'happy', blink: (t % 3.7) > 3.58 });
  },
  // the same glide while still cursed: the King's collar on, a scowl (story before_storm, far off in the sky)
  glideCursed(t) {
    return Object.assign(ANIM.glide(t), { free: false, face: 'mean' });
  },
};
export { mix };

// ---------------------------------------------------------------- geometry (FK, ground solve, measurements)
const G = { dy: 0, hk: 0, fk: 0, bob: 0 };
// affine helper mirroring the ctx calls for measurements
const M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function mReset() { M.a = 1; M.b = 0; M.c = 0; M.d = 1; M.e = 0; M.f = 0; }
function mT(x, y) { M.e += M.a * x + M.c * y; M.f += M.b * x + M.d * y; }
function mR(r) { const cs = Math.cos(r), sn = Math.sin(r), a = M.a, b = M.b, c = M.c, d = M.d; M.a = a * cs + c * sn; M.b = b * cs + d * sn; M.c = c * cs - a * sn; M.d = d * cs - b * sn; }
function mS(sx, sy) { M.a *= sx; M.b *= sx; M.c *= sy; M.d *= sy; }
function mP(x, y) { return [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f]; }
function bodyXf(p, dy, bob) {
  mReset(); mT(0, BODY_Y);
  if (p.sq !== 1) mS(1 / Math.sqrt(p.sq), p.sq);
  mT(p.x, p.y + dy + bob);
  if (p.rot) mR(-p.rot * DEG);
  mR(-p.pitch * DEG);
}
// leg FK in the body frame: joint 1 at angle a (deg, + = forward, 0 = straight down), joint 2 at a - k
function legEnd(h, a, k, l1, l2) {
  const a1 = a * DEG, a2 = (a - k) * DEG;
  return [h[0] + Math.sin(a1) * l1 + Math.sin(a2) * l2, h[1] + Math.cos(a1) * l1 + Math.cos(a2) * l2];
}
function soleY(h, a, k, l1, l2, foot) {   // local y of the lowest sole point (feet are drawn level on the floor)
  const e = legEnd(h, a, k, l1, l2);
  return mP(e[0], e[1])[1] + foot;
}
// lower a foot to the floor line by opening / closing its knee (secant steps)
function plantKnee(h, a, k, l1, l2, foot, want) {
  let k0 = k, y0 = soleY(h, a, k0, l1, l2, foot) - want;
  let k1 = k + (y0 < 0 ? -6 : 6), y1 = soleY(h, a, k1, l1, l2, foot) - want;
  for (let i = 0; i < 6 && Math.abs(y1) > 0.2; i++) {
    const d = y1 - y0;
    if (Math.abs(d) < 1e-4) break;
    const k2 = clamp(k1 - y1 * (k1 - k0) / d, k - 60, k + 60);
    k0 = k1; y0 = y1; k1 = k2; y1 = soleY(h, a, k1, l1, l2, foot) - want;
  }
  return Math.abs(y1) < 3 ? k1 : k;
}
function solve(p, bob) {
  G.hk = p.hk; G.fk = p.fk; G.dy = 0; G.bob = p.ground ? 0 : bob;
  if (!p.ground) return;
  bodyXf(p, 0, 0);
  const yh = soleY(HIP_N, p.hl, p.hk, THIGH, SHIN, FOOTH), yf = soleY(ARM_N, p.fl, p.fk, UARM, FARM, 6);
  const low = Math.max(yh, yf);
  G.dy = -low;
  if (low - yh > 0.3 && low - yh < 24) G.hk = plantKnee(HIP_N, p.hl, p.hk, THIGH, SHIN, FOOTH, low);
  if (low - yf > 0.3 && low - yf < 24) G.fk = plantKnee(ARM_N, p.fl, p.fk, UARM, FARM, 6, low);
}
/** Hips of hero `seat` (0 front, 1 middle, 2 back) on her back for a pose: local [x, y], facing right, scale 1, before z. */
export function saddleOf(p, seat = 0) {
  solve(p, 0);
  bodyXf(p, G.dy, 0);
  const s = SEATS_BODY[seat] || SEATS_BODY[0];
  return mP(s[0], s[1]).map((v) => Math.round(v));
}

// ---------------------------------------------------------------- drawing
let T = 0, MEM = null, VX = 0, VZ = 0, CUR = true, TALK = false;

/**
 * Draw Tempest.  ctx is at the floor point under her (already lifted by z), unscaled.
 * o: { facing, t, scale, cursed = true, mem, vel, talk }
 */
export function draw(ctx, pose, o = {}) {
  const p = pose, f = o.facing || 1, S = o.scale || 1;
  T = o.t || 0; MEM = o.mem || null; TALK = !!o.talk;
  const v = o.vel || null;
  VX = v ? (v.x || 0) * f : 0; VZ = v ? (v.z || 0) : 0;
  CUR = (o.cursed ?? true) && !p.free;
  const ph = p.ph ?? T * FLAP_HZ;
  const u = ph - Math.floor(ph);
  // big wings lag a touch behind sudden climbs / drops
  const lagW = follow(MEM, 'tm_wing', clamp(-VZ * 3, -18, 18), 0.1, 0.78);
  const fa = p.wing + p.flap * wave(u) + lagW;
  const fold = clamp(p.fold + (u > 0.42 ? 0.35 * Math.sin((u - 0.42) / 0.58 * Math.PI) * clamp(p.flap / 30, 0, 1) : 0), 0, 1);
  const bob = p.bob * wave((u + 0.9) % 1);
  solve(p, bob);
  const tp = p.tp ?? T * TAIL_HZ;

  ctx.save();
  ctx.scale(f * S, S);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.translate(0, BODY_Y);
  if (p.sq !== 1) ctx.scale(1 / Math.sqrt(p.sq), p.sq);
  ctx.translate(p.x, p.y + G.dy + G.bob);
  if (p.rot) ctx.rotate(-p.rot * DEG);
  ctx.rotate(-p.pitch * DEG);

  if (p.streak > 0.01) streaks(ctx, p.streak);
  wing(ctx, p, fa, fold, true);
  hindLeg(ctx, p, true);
  foreLeg(ctx, p, true);
  tail(ctx, p, tp);
  body(ctx);
  hindLeg(ctx, p, false);
  wing(ctx, p, fa, fold, false);
  foreLeg(ctx, p, false);
  neckAndHead(ctx, p);
  if (p.glow > 0.02) crackle(ctx, p);
  if (p.shatter > 0) shards(ctx, p);
  if (p.gust > 0.02) gustFx(ctx, p);
  ctx.restore();
}

function wave(u) {   // 1 = wings up, -1 = wings down; the downstroke takes 42 % of the beat
  return u < 0.42 ? Math.cos(u / 0.42 * Math.PI) : -Math.cos((u - 0.42) / 0.58 * Math.PI);
}

// cool rim light just inside the outline on the side away from the key light (see grimscale.js)
function rim(ctx, path, lw, s = 2) {
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c;
  if (!det) return;
  const k = Math.sqrt(Math.abs(det)), wx = -0.8 * s * k, wy = 0.6 * s * k;
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  ctx.translate((m.d * wx - m.c * wy) / det, (-m.b * wx + m.a * wy) / det);
  ctx.beginPath(); path(ctx);
  ctx.lineWidth = s * 2 + lw * 0.25; ctx.strokeStyle = C.rim; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); path(ctx); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
}
function celR(ctx, path, base, dark, o, s) { cel(ctx, path, base, dark, o); rim(ctx, path, o.lw ?? 3, s); }

// cloud puffs: a union of circles with one clean ink outline (fat ink circles first), cel-shaded, little curls
const PUFF = new Float64Array(3 * 40);
let NP = 0;
function puff(x, y, r) { if (NP < 40) { PUFF[NP * 3] = x; PUFF[NP * 3 + 1] = y; PUFF[NP * 3 + 2] = r; NP++; } }
// a streaming cloud lock: n puffs trailing back from (x, y), shrinking, waving in the wind (dir: droop, rad)
function lock(x, y, r, dir, n, stream, ph) {
  let cx = x, cy = y, rr = r;
  const ca = Math.cos(Math.PI + dir), sa = Math.sin(Math.PI + dir);
  for (let i = 0; i < n; i++) {
    puff(cx, cy, rr);
    const step = rr * 0.78, w = Math.sin(T * 3.6 - ph - i * 1.1) * (1 + 0.5 * stream) * (i + 1) * 0.5;
    const bend = clamp(stream, 0, 1.4) * 0.22 * (i + 1);
    cx += Math.cos(Math.PI + dir - bend) * step - sa * w * 0.3; cy += Math.sin(Math.PI + dir - bend) * step + w * 0.5;
    rr *= 0.8;
  }
}
function puffPath(c) { for (let i = 0; i < NP; i++) circle(c, PUFF[i * 3], PUFF[i * 3 + 1], PUFF[i * 3 + 2]); }
function cloud(ctx, lw = 3) {
  if (!NP) return;
  ctx.fillStyle = INK;
  ctx.beginPath(); for (let i = 0; i < NP; i++) circle(ctx, PUFF[i * 3], PUFF[i * 3 + 1], PUFF[i * 3 + 2] + lw / 2); ctx.fill();
  cel(ctx, puffPath, C.mane, C.maneD, { k: 1.5, lw: 0, detail: (c) => {
    c.strokeStyle = C.maneL; c.lineWidth = 1.4; c.beginPath();
    for (let i = 0; i < NP; i++) { const R = PUFF[i * 3 + 2]; if (R < 9.5) continue; const x = PUFF[i * 3], y = PUFF[i * 3 + 1], r = R * 0.45; c.moveTo(x - r * 1.2, y + r * 0.4); c.arc(x - r * 0.4, y + r * 0.4, r * 0.8, Math.PI, 1.85 * Math.PI); }
    c.stroke();
  } });
  NP = 0;
}

// -------------------------------------------------- wings (projected planform: see whelp.js)
// shoulder, elbow, wrist, thumb, 4 finger tips, trailing root (u forward along the chord, v out along the span)
const WS = [0, 0, 17, 50, 4, 98, 17, 104, -6, 200, -60, 180, -102, 136, -120, 82, -74, 6];
const WF = [0, 0, 10, 34, -4, 62, 6, 66, -50, 92, -66, 84, -80, 68, -84, 46, -56, 6];
const WN = 18, WP = new Float64Array(WN);
let TIPX = 0, TIPY0 = 0, TIPY1 = 0;
function wing(ctx, p, fa, fold, far) {
  const s = Math.sin((fa + (far ? p.wf : 0)) * DEG + (far ? TILT : -TILT));
  const k = far ? 0.98 : 1.04;
  const sw = (p.sweep + (far ? 4 : 0)) * DEG, cs = Math.cos(sw), sn = Math.sin(sw);
  const ox = far ? SH_F[0] : SH_N[0], oy = far ? SH_F[1] : SH_N[1];
  for (let i = 0; i < WN; i += 2) {
    const uu = lerp(WS[i], WF[i], fold) * k, vv = lerp(WS[i + 1], WF[i + 1], fold) * k;
    WP[i] = ox + uu * cs - vv * sn;
    WP[i + 1] = oy - (uu * sn + vv * cs) * s;
  }
  if (!far) { TIPX = Math.max(WP[8], WP[10]); TIPY0 = Math.min(WP[9], WP[11], WP[1]); TIPY1 = Math.max(WP[9], WP[11], WP[1]); }
  if (far) cel(ctx, membrane, C.memF, C.memFD, { k: 2, lw: 3 });
  else celR(ctx, membrane, C.mem, C.memD, { k: 2.4, lw: 3.2, detail: veins }, 2.2);
  const bc = far ? C.boneF : C.sc;
  ink(ctx, armPath, 9);
  ink(ctx, fingerPath, 5.6);
  ink(ctx, armPath, 4.8, bc);
  ink(ctx, fingerPath, 2.2, bc);
  // silver highlight along the arm bone
  if (!far) ink(ctx, armPath, 1.4, C.scH);
  // thumb claw + knuckle, a cloud tuft at the wrist
  flat(ctx, (c) => {
    const x = WP[4], y = WP[5], dx = WP[6] - x, dy = WP[7] - y;
    c.moveTo(x - dy * 0.35, y + dx * 0.35); c.quadraticCurveTo(x + dx * 0.8, y + dy * 0.8, x + dx * 1.5, y + dy * 1.5);
    c.lineTo(x + dy * 0.35, y - dx * 0.35); c.closePath();
  }, far ? C.hornD : C.claw, 2.4);
  flat(ctx, (c) => circle(c, WP[4], WP[5], 4.4), bc, 2.6);
}
function membrane(c) {
  c.moveTo(WP[0], WP[1]); c.lineTo(WP[2], WP[3]); c.lineTo(WP[4], WP[5]); c.lineTo(WP[8], WP[9]);
  scallop(c, 8, 10, 0.28); scallop(c, 10, 12, 0.28); scallop(c, 12, 14, 0.26); scallop(c, 14, 16, 0.2);
  c.lineTo(WP[0], WP[1]);
  c.closePath();
}
function scallop(c, a, b, d) {
  const mx = (WP[a] + WP[b]) / 2, my = (WP[a + 1] + WP[b + 1]) / 2;
  c.quadraticCurveTo(mx + (WP[4] - mx) * d, my + (WP[5] - my) * d, WP[b], WP[b + 1]);
}
function armPath(c) { c.moveTo(WP[0], WP[1]); c.lineTo(WP[2], WP[3]); c.lineTo(WP[4], WP[5]); }
function fingerPath(c) {
  for (const i of [8, 10, 12, 14]) { c.moveTo(WP[4], WP[5]); c.lineTo(lerp(WP[4], WP[i], 0.97), lerp(WP[5], WP[i + 1], 0.97)); }
}
function veins(c) {
  // a lighter storm band near the bones + thin veins
  c.fillStyle = C.memL; c.globalAlpha = 0.55;
  c.beginPath(); c.moveTo(WP[0], WP[1]); c.lineTo(WP[2], WP[3]); c.lineTo(WP[4], WP[5]);
  c.lineTo(lerp(WP[4], WP[10], 0.45), lerp(WP[5], WP[11], 0.45)); c.lineTo(lerp(WP[4], WP[14], 0.4), lerp(WP[5], WP[15], 0.4));
  c.lineTo(lerp(WP[0], WP[16], 0.5), lerp(WP[1], WP[17], 0.5)); c.closePath(); c.fill();
  c.globalAlpha = 1;
  c.strokeStyle = C.vein; c.lineWidth = 1.5;
  c.beginPath();
  for (const i of [8, 10, 12, 14]) {
    const j = i + 2, mx = (WP[i] + WP[j]) / 2, my = (WP[i + 1] + WP[j + 1]) / 2;
    c.moveTo(lerp(WP[4], mx, 0.2), lerp(WP[5], my, 0.2)); c.quadraticCurveTo(lerp(WP[4], mx, 0.45) + 3, lerp(WP[5], my, 0.45), lerp(WP[4], mx, 0.7), lerp(WP[5], my, 0.7));
  }
  c.stroke();
}

// -------------------------------------------------- tail: long, tapering, silver underside, golden lightning-bolt tip
const SX = new Float64Array(TN + 1), SY = new Float64Array(TN + 1), SA = new Float64Array(TN + 1);
const AX = new Float64Array(TN + 1), AY = new Float64Array(TN + 1), BX = new Float64Array(TN + 1), BY = new Float64Array(TN + 1);
const tailHW = (i) => lerp(21, 3.8, Math.pow(i / TN, 0.8));
function tail(ctx, p, tp) {
  const tb = follow(MEM, 'tm_tb', lerp(p.tb, 0, p.ground ? 0 : clamp(Math.abs(VX) / 9, 0, 0.75)) + clamp(VZ * 2.5, -20, 20), 0.08, 0.82);
  const sw = follow(MEM, 'tm_tsw', p.tsw + clamp(Math.abs(VX) * 0.4, 0, 4), 0.08, 0.82);
  const floorY = -(BODY_Y + p.y + G.dy);       // floor in the body frame (approx., ignores pitch) for ground poses
  let a = Math.PI - tb * DEG, x = TAIL_ROOT[0], y = TAIL_ROOT[1];
  for (let i = 0; i <= TN; i++) {
    if (i) {
      a += (p.tc + sw * Math.sin(tp * TAU - i * 0.55)) * DEG;
      let nx = x + Math.cos(a) * TSEG, ny = y + Math.sin(a) * TSEG;
      if (p.ground) {   // lie along the floor instead of sinking into it
        const lim = floorY - (i >= TN - 1 ? 13 : tailHW(i)) - 1 + p.pitch * DEG * nx;
        if (ny > lim) { ny = lim; a = Math.atan2(ny - y, nx - x); nx = x + Math.cos(a) * TSEG; ny = y + Math.sin(a) * TSEG; }
      }
      x = nx; y = ny;
    }
    SX[i] = x; SY[i] = y; SA[i] = a;
    const hw = tailHW(i), nx = -Math.sin(a) * hw, ny = Math.cos(a) * hw;
    AX[i] = x + nx; AY[i] = y + ny; BX[i] = x - nx; BY[i] = y - ny;
  }
  // small silver dorsal fins along the first half
  flat(ctx, (c) => {
    for (let i = 3; i <= 8; i += 2) {
      const sa = SA[i], hw = tailHW(i), L = 12 - i * 0.8;
      const nx = -Math.sin(sa), ny = Math.cos(sa), ux = Math.cos(sa), uy = Math.sin(sa);
      const bx = SX[i] + nx * hw * 0.75, by = SY[i] + ny * hw * 0.75;
      c.moveTo(bx - ux * 5, by - uy * 5); c.quadraticCurveTo(bx + nx * L * 0.6, by + ny * L * 0.6, bx + nx * L - ux * 6, by + ny * L - uy * 6); c.lineTo(bx + ux * 5, by + uy * 5); c.closePath();
    }
  }, C.horn, 2.4);
  celR(ctx, tailPath, C.sc, C.scD, { k: 2, hi: C.scH, hk: 0.3, lw: 3.1, detail: (c) => {
    c.strokeStyle = C.bel; c.lineWidth = 6; c.beginPath();
    for (let i = 0; i < TN; i++) { const xx = lerp(SX[i], BX[i], 0.6), yy = lerp(SY[i], BY[i], 0.6); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.stroke();
    c.strokeStyle = C.scL; c.lineWidth = 1.4; c.beginPath();
    for (let i = 1; i < TN; i++) { c.moveTo(lerp(SX[i], AX[i], 0.85), lerp(SY[i], AY[i], 0.85)); c.lineTo(lerp(SX[i], BX[i], 0.3), lerp(SY[i], BY[i], 0.3)); }
    c.stroke();
  } }, 1.8);
  // the lightning bolt
  ctx.save();
  ctx.translate(SX[TN], SY[TN]); ctx.rotate(SA[TN]);
  const zap = p.glow > 0.3 && Math.sin(T * 40) > -0.3;
  ctx.scale(1.15, 1.15);
  cel(ctx, boltPath, zap ? C.boltC : C.bolt, C.boltD, { k: 1, hi: C.boltC, hk: 0.5, lw: 2.9 / 1.15 });
  ink(ctx, (c) => { c.moveTo(2, 0); c.lineTo(15, -6); c.lineTo(13, -1.5); c.lineTo(30, -5.5); }, 1.4, C.boltC);
  ctx.restore();
}
function boltPath(c) {   // classic zig-zag bolt along +x, sharp point at the end
  c.moveTo(-3, -5.5); c.lineTo(17, -11); c.lineTo(14, -3.5); c.lineTo(33, -9); c.lineTo(46, 7);
  c.lineTo(24, 1.5); c.lineTo(27, 7.5); c.lineTo(-3, 5.5); c.closePath();
}
function tailPath(c) {
  c.moveTo(AX[0], AY[0]);
  for (let i = 1; i < TN; i++) c.quadraticCurveTo(AX[i], AY[i], (AX[i] + AX[i + 1]) / 2, (AY[i] + AY[i + 1]) / 2);
  c.lineTo(AX[TN], AY[TN]); c.lineTo(BX[TN], BY[TN]);
  for (let i = TN - 1; i > 0; i--) c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[i - 1]) / 2, (BY[i] + BY[i - 1]) / 2);
  c.lineTo(BX[0], BY[0]);
  c.closePath();
}

// -------------------------------------------------- body: long elegant torso, flat back (riders), silver belly
const BODY = [[56, -6], [48, -24], [30, -33], [4, -33.5], [-22, -32.5], [-46, -29], [-61, -19], [-68, -4], [-62, 9], [-46, 15], [-28, 18], [-6, 27], [16, 36], [38, 31], [53, 14]];
const bodyPath = (c) => blob(c, BODY, 0.5);
function body(ctx) {
  celR(ctx, bodyPath, C.sc, C.scD, { k: 2.6, hi: C.scH, hk: 0.3, lw: 3.4, detail: (c) => {
    // flank scales
    c.strokeStyle = C.scL; c.lineWidth = 1.5; c.beginPath();
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 6 - r; i++) {
        const x = -46 + i * 15 + r * 7.5, y = -14 + r * 9, R = 4.4;
        c.moveTo(x + R * Math.cos(0.15 * Math.PI), y + R * Math.sin(0.15 * Math.PI)); c.arc(x, y, R, 0.15 * Math.PI, 0.85 * Math.PI);
      }
    }
    c.stroke();
    // silver belly with plates
    cel(c, (cc) => { cc.moveTo(-58, 11); cc.quadraticCurveTo(-30, 9, -6, 16); cc.quadraticCurveTo(22, 22, 54, 5); cc.lineTo(54, 46); cc.lineTo(-58, 46); cc.closePath(); },
      C.bel, C.belD, { k: 1.4, lw: 2.2, detail: (cc) => {
        cc.strokeStyle = C.belL; cc.lineWidth = 1.4; cc.beginPath();
        for (let i = 0; i < 7; i++) { const x = -44 + i * 14, y0 = 9 + Math.abs(x + 10) * -0.02 + (x > -10 ? (x + 10) * 0.08 : 0); cc.moveTo(x, y0 + 2); cc.quadraticCurveTo(x + 2.5, y0 + 10, x + 1, y0 + 22); }
        cc.stroke();
      } });
    // occlusion under the wing root and behind the haunch
    c.fillStyle = C.scD; c.globalAlpha = 0.45;
    c.beginPath(); ellipse(c, 28, -12, 16, 10, 0.3); ellipse(c, -56, 2, 12, 16, 0); c.fill();
    c.globalAlpha = 1;
  } }, 2.4);
}

// -------------------------------------------------- legs
function hindLeg(ctx, p, far) {
  const h = far ? HIP_F : HIP_N, k = G.hk;
  const sc = far ? C.scF : C.sc, scd = far ? C.scFD : C.scD, claw = far ? C.clawD : C.claw;
  const a1 = p.hl, a2 = p.hl - k;
  const kx = h[0] + Math.sin(a1 * DEG) * THIGH, ky = h[1] + Math.cos(a1 * DEG) * THIGH;
  const ax = kx + Math.sin(a2 * DEG) * SHIN, ay = ky + Math.cos(a2 * DEG) * SHIN;
  // foot: level on the floor when grounded, trailing in flight
  const fAbs = p.ground ? 90 + p.pitch + p.rot : a2 + 18;
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(-(fAbs - 90) * DEG);
  foot(ctx, sc, scd, claw, FOOTL, FOOTH, far);
  ctx.restore();
  seg(ctx, kx, ky, ax, ay, (c) => { c.moveTo(-7, 0); c.quadraticCurveTo(0, -6, 7, 0); c.bezierCurveTo(9, SHIN * 0.35, 5, SHIN * 0.7, 4.2, SHIN + 1); c.lineTo(-4.2, SHIN + 1); c.bezierCurveTo(-5, SHIN * 0.6, -8, SHIN * 0.3, -7, 0); c.closePath(); }, sc, scd, !far);
  // haunch: big muscular teardrop from the hip to the knee
  ctx.save(); ctx.translate(h[0], h[1]); ctx.rotate(-a1 * DEG);
  const th = (c) => { c.moveTo(0, -16); c.bezierCurveTo(22, -15, 18, 16, 7, THIGH + 2); c.quadraticCurveTo(0, THIGH + 6, -7, THIGH + 2); c.bezierCurveTo(-17, 16, -21, -15, 0, -16); c.closePath(); };
  if (far) cel(ctx, th, sc, scd, { k: 1.6, lw: 3 });
  else celR(ctx, th, sc, scd, { k: 1.8, hi: C.scH, hk: 0.3, lw: 3.2, detail: (c) => {
    c.strokeStyle = C.scL; c.lineWidth = 1.4; c.beginPath();
    for (const [x, y] of [[-6, -4], [4, -2], [-2, 6]]) { c.moveTo(x + 4, y + 1); c.arc(x, y + 1, 4, 0, Math.PI); }
    c.stroke();
  } }, 2);
  ctx.restore();
}
function foreLeg(ctx, p, far) {
  const h = far ? ARM_F : ARM_N, k = G.fk;
  const sc = far ? C.scF : C.sc, scd = far ? C.scFD : C.scD, claw = far ? C.clawD : C.claw;
  const a1 = p.fl, a2 = p.fl - k;
  const ex = h[0] + Math.sin(a1 * DEG) * UARM, ey = h[1] + Math.cos(a1 * DEG) * UARM;
  const hx = ex + Math.sin(a2 * DEG) * FARM, hy = ey + Math.cos(a2 * DEG) * FARM;
  const fAbs = p.ground ? 90 + p.pitch + p.rot : a2 + 40;
  seg(ctx, ex, ey, hx, hy, (c) => { c.moveTo(-5, 0); c.quadraticCurveTo(0, -4, 5, 0); c.bezierCurveTo(6.5, 7, 4, 14, 3.6, FARM); c.lineTo(-3.6, FARM); c.bezierCurveTo(-4, 12, -6.5, 6, -5, 0); c.closePath(); }, sc, scd, false);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-(fAbs - 90) * DEG);
  foot(ctx, sc, scd, claw, 15, 6, far);
  ctx.restore();
  seg(ctx, h[0], h[1], ex, ey, (c) => { c.moveTo(-11, -4); c.quadraticCurveTo(0, -14, 11, -4); c.bezierCurveTo(10, 8, 6, 12, 4.5, UARM + 1); c.quadraticCurveTo(0, UARM + 3, -4.5, UARM + 1); c.bezierCurveTo(-6, 12, -12, 8, -11, -4); c.closePath(); },
    sc, scd, !far);
}
function seg(ctx, x0, y0, x1, y1, path, base, dark, rimOn) {
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(-(x1 - x0), y1 - y0));
  if (rimOn) celR(ctx, path, base, dark, { k: 1.4, lw: 3 }, 1.6); else cel(ctx, path, base, dark, { k: 1.4, lw: 2.8 });
  ctx.restore();
}
// foot frame: ankle at the origin, sole at y = fh, toes forward (+x)
function foot(ctx, sc, scd, claw, L, fh, far) {
  flat(ctx, (c) => {
    for (const [x, y] of [[L * 0.78, fh - 4], [L * 0.98, fh - 2.2], [L * 0.6, fh - 1.4]]) {
      c.moveTo(x - 2, y - 3); c.quadraticCurveTo(x + 5, y - 3, x + 7, y + 2); c.quadraticCurveTo(x + 3, y + 0.6, x - 1.6, y + 2); c.closePath();
    }
  }, claw, 2);
  cel(ctx, (c) => { c.moveTo(-7, -5); c.quadraticCurveTo(L * 0.4, -8, L * 0.85, -2); c.quadraticCurveTo(L + 3, 0, L, fh - 0.5); c.lineTo(-5, fh);
    c.quadraticCurveTo(-10, fh - 3, -7, -5); c.closePath(); }, sc, scd, { k: 1.2, lw: far ? 2.6 : 2.9 });
}

// -------------------------------------------------- neck + mane, collar, head
const NX = new Float64Array(NSEG + 1), NY = new Float64Array(NSEG + 1), NA = new Float64Array(NSEG + 1);
const NAX = new Float64Array(NSEG + 1), NAY = new Float64Array(NSEG + 1), NBX = new Float64Array(NSEG + 1), NBY = new Float64Array(NSEG + 1);
const neckHW = (i) => lerp(20, 12.5, i / NSEG);
function neckPath(c) {
  c.moveTo(NAX[0], NAY[0]);
  for (let i = 1; i < NSEG; i++) c.quadraticCurveTo(NAX[i], NAY[i], (NAX[i] + NAX[i + 1]) / 2, (NAY[i] + NAY[i + 1]) / 2);
  c.lineTo(NAX[NSEG], NAY[NSEG]); c.lineTo(NBX[NSEG], NBY[NSEG]);
  for (let i = NSEG - 1; i > 0; i--) c.quadraticCurveTo(NBX[i], NBY[i], (NBX[i] + NBX[i - 1]) / 2, (NBY[i] + NBY[i - 1]) / 2);
  c.lineTo(NBX[0], NBY[0]);
  c.closePath();
}
function neckChain(p) {
  let a = -p.na * DEG, x = NECK0[0], y = NECK0[1];
  for (let i = 0; i <= NSEG; i++) {
    if (i) { a += (i <= 2 ? p.n0 : p.nc) * DEG; x += Math.cos(a) * NLEN; y += Math.sin(a) * NLEN; }
    NX[i] = x; NY[i] = y; NA[i] = a;
    const hw = neckHW(i), nx = -Math.sin(a) * hw, ny = Math.cos(a) * hw;
    NAX[i] = x + nx; NAY[i] = y + ny; NBX[i] = x - nx; NBY[i] = y - ny;
  }
}
let STREAM = 0, FLUT = 0;
function neckAndHead(ctx, p) {
  neckChain(p);
  // mane streaming: the storm wind + her own speed; it swings forward and settles when she stops
  STREAM = follow(MEM, 'tm_mane', clamp(0.35 + 0.65 * p.stream + Math.abs(VX) * 0.08 - VZ * 0.04, 0, 1.4), 0.07, 0.84);
  FLUT = 2 + 3 * STREAM;
  celR(ctx, neckPath, C.sc, C.scD, { k: 2.2, hi: C.scH, hk: 0.3, lw: 3.3, detail: (c) => {
    c.strokeStyle = C.bel; c.lineWidth = 15; c.beginPath();
    for (let i = 0; i <= NSEG; i++) { const xx = lerp(NX[i], NAX[i], 0.55), yy = lerp(NY[i], NAY[i], 0.55); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.stroke();
    c.strokeStyle = C.belL; c.lineWidth = 1.5; c.beginPath();
    for (let i = 1; i < NSEG; i++) { c.moveTo(lerp(NX[i], NAX[i], 0.14), lerp(NY[i], NAY[i], 0.14)); c.lineTo(lerp(NX[i], NAX[i], 0.95), lerp(NY[i], NAY[i], 0.95)); }
    c.stroke();
  } }, 2);
  // cloud mane down the back of the neck (dorsal side = -normal), streaming back and fluttering
  for (let i = 0; i <= NSEG; i++) {
    const aa = NA[i], hw = neckHW(i), dx = Math.sin(aa), dy = -Math.cos(aa);
    if (i % 2 === 0 || i < p.mn) continue;
    const r = lerp(10, 13.5, i / NSEG), wv = Math.sin(T * 4.2 - i * 0.9) * FLUT * 0.5;
    lock(NX[i] + dx * (hw * 0.8 + wv), NY[i] + dy * (hw * 0.8 + wv), r, 0.2 + i * 0.03, 4, STREAM * (2 + i * 0.9), i * 0.8);
  }
  cloud(ctx, 3.2);
  // collar band round the neck base (u across the neck, + = throat)
  if (CUR && !p.shatter) {
    const ca = NA[1] + Math.PI / 2, cx = lerp(NX[0], NX[1], 0.8), cy = lerp(NY[0], NY[1], 0.8);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ca); drawCollarShape(ctx, p.crack); ctx.restore();
  }
  ctx.save();
  ctx.translate(NX[NSEG], NY[NSEG]);
  ctx.rotate(-p.head * DEG);
  ctx.scale(HS, HS);
  if (p.glow > 0.02) {   // storm glow gathering behind the horns (soft, no outline)
    const g = clamp(p.glow, 0, 1);
    ctx.fillStyle = C.halo;
    ctx.globalAlpha = 0.16 * g; ctx.beginPath(); circle(ctx, -30, -50, 26 + 16 * g); ctx.fill();
    ctx.globalAlpha = 0.2 * g; ctx.beginPath(); circle(ctx, -32, -54, 15 + 10 * g); ctx.fill();
    ctx.globalAlpha = 1;
  }
  head(ctx, p);
  ctx.restore();
}

// head frame (before HS): origin at the top of the neck, +x along the snout.  A tall rounded skull with a smooth
// brow, a refined tapering snout and a soft chin.
const HEAD = [[-15, -4], [-17, -18], [-9, -30], [4, -35], [17, -34], [27, -28], [34, -21], [41, -16.5], [47, -12.5], [51, -8], [51.5, -3],
  [48, 0.8], [38, 1.8], [26, 2.6], [13, 3.8], [2, 5.2], [-8, 4.4]];
const JAW = [[-1, 1], [14, 0.8], [27, 0.6], [39, 0.4], [44, 2.8], [39, 8], [27, 11.5], [14, 11.5], [3, 8.6], [-4, 4.4]];
const HINGE = [2, 2.5];
const headPath = (c) => blob(c, HEAD, 0.5);
const FACE_JAW = { roar: 10, ouch: 12, pant: 0, fierce: 4, happy: 3 };
const L1 = 1 / HS;   // line-width compensation inside the scaled head
function head(ctx, p) {
  const face = p.face;
  let jaw = p.jaw + (FACE_JAW[face] || 0);
  if (TALK) jaw = Math.max(jaw, (0.5 + 0.5 * Math.sin(T * 13)) * (8 + 7 * Math.abs(Math.sin(T * 3.7))));
  const ja = jaw * DEG;
  // far horns, crown mane behind the skull
  horns(ctx, true);
  const s = STREAM * 7;
  lock(-6, -26, 13.5, -0.12, 4, s, 0); lock(-14, -8, 12.5, 0.22, 4, s, 1.6);
  cloud(ctx, 3.2 * L1);
  // mouth interior + lower jaw
  if (jaw > 1.5) mouthInside(ctx, jaw, ja);
  ctx.save();
  ctx.translate(HINGE[0], HINGE[1]); ctx.rotate(ja); ctx.translate(-HINGE[0], -HINGE[1]);
  cel(ctx, (c) => blob(c, JAW, 0.45), C.sc, C.scD, { k: 1.4, lw: 3 * L1, detail: (c) => {
    c.fillStyle = C.bel; c.beginPath(); ellipse(c, 21, 10.5, 20, 3.8, -0.03); c.fill();
  } });
  if (face === 'pant' || face === 'dazed') flat(ctx, (c) => { c.moveTo(30, 3); c.quadraticCurveTo(43, 5, 42, 16); c.quadraticCurveTo(36, 18, 35, 7); c.closePath(); }, C.tongue, 2.2 * L1);
  ctx.restore();
  // fang
  flat(ctx, (c) => { c.moveTo(35, 2); c.lineTo(37.2, 7.6 + (jaw > 6 ? 1 : 0)); c.lineTo(40, 1.8); c.closePath(); }, C.tooth, 2 * L1);
  // upper head
  celR(ctx, headPath, C.sc, C.scD, { k: 1.8, hi: C.scH, hk: 0.35, lw: 3.3 * L1, detail: (c) => {
    c.strokeStyle = C.scL; c.lineWidth = 1.3; c.beginPath();
    for (const [x, y] of [[34, -14], [39.5, -12], [44.5, -10]]) { c.moveTo(x + 2.4, y - 1); c.arc(x, y, 2.4, -0.4, Math.PI * 0.6); }
    c.stroke();
    // silver lip + jaw line
    c.fillStyle = C.bel; c.beginPath(); c.moveTo(10, 3.8); c.quadraticCurveTo(30, -0.4, 49, -0.4); c.lineTo(49, 3); c.quadraticCurveTo(30, 3.6, 10, 6.2); c.closePath(); c.fill();
    // smooth brow ridge shading
    c.fillStyle = C.scD; c.globalAlpha = 0.45; c.beginPath(); c.moveTo(4, -25); c.quadraticCurveTo(18, -30, 32, -19); c.quadraticCurveTo(18, -24, 4, -21); c.closePath(); c.fill(); c.globalAlpha = 1;
    if (!CUR || face === 'happy' || face === 'kind') { c.fillStyle = 'rgba(255,150,195,0.45)'; c.beginPath(); ellipse(c, 22, -3, 6, 3, 0); c.fill(); }
  } }, 2 * L1);
  // nostril
  ink(ctx, (c) => { c.moveTo(45.5, -11); c.quadraticCurveTo(49, -12, 50, -8.5); }, 2.4 * L1);
  // mouth corner: scowl or soft smile
  const kind = face === 'kind' || face === 'happy' || face === 'proud';
  if (kind) ink(ctx, (c) => { c.moveTo(15, 3.6); c.quadraticCurveTo(7, 3.8, 4.5, -1.8); }, 2.6 * L1);
  else if (jaw < 3) ink(ctx, (c) => { c.moveTo(13, 3.6); c.quadraticCurveTo(7, 5.6, 3, 6.4); }, 2.4 * L1);
  // cheek cloud frill over the jaw hinge, streaming back
  lock(-8, 7, 8.5, 0.45, 2, s, 3.1);
  cloud(ctx, 3 * L1);
  horns(ctx, false);
  eye(ctx, p);
}
function horns(ctx, far) {
  ctx.save();
  if (far) ctx.translate(8, -4);
  const col = far ? C.hornD : C.horn, dk = far ? C.hornL : C.hornD;
  // long upper horn sweeping back, ridged
  cel(ctx, (c) => { c.moveTo(-9, -24); c.quadraticCurveTo(-24, -40, -48, -64); c.quadraticCurveTo(-16, -52, 6, -33); c.closePath(); }, col, dk, { k: 1.2, lw: 2.9 * L1, detail: (c) => {
    c.strokeStyle = dk; c.lineWidth = 1.3; c.beginPath();
    for (const t of [0.2, 0.4, 0.6]) { const ax = lerp(-9, -50, t), ay = lerp(-24, -62, t), bx = lerp(6, -50, t), by = lerp(-33, -62, t); c.moveTo(lerp(ax, bx, 0.1), lerp(ay, by, 0.1) - 3 * t); c.lineTo(lerp(ax, bx, 0.85), lerp(ay, by, 0.85) + 2); }
    c.stroke();
  } });
  // lower horn, swept straight back
  cel(ctx, (c) => { c.moveTo(-13, -12); c.quadraticCurveTo(-28, -20, -46, -26); c.quadraticCurveTo(-26, -12, -11, -3); c.closePath(); }, col, dk, { k: 1, lw: 2.7 * L1 });
  ctx.restore();
}
function mouthInside(ctx, jaw, ja) {
  const c0 = Math.cos(ja), s0 = Math.sin(ja);
  const jx = HINGE[0] + (43 - HINGE[0]) * c0 - (1.6 - HINGE[1]) * s0, jy = HINGE[1] + (43 - HINGE[0]) * s0 + (1.6 - HINGE[1]) * c0;
  ctx.beginPath(); ctx.moveTo(HINGE[0] - 3, HINGE[1] - 1); ctx.lineTo(48, 1); ctx.quadraticCurveTo(jx + 5, (jy + 1) / 2, jx, jy); ctx.closePath();
  ctx.fillStyle = C.mouth; ctx.fill(); ctx.lineWidth = 2.6 * L1; ctx.strokeStyle = INK; ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.fillStyle = C.tongue; ctx.beginPath(); ellipse(ctx, 24 + 8 * s0, 4 + 12 * s0, 16, 4, ja * 0.6); ctx.fill();
  if (jaw > 10) {
    ctx.fillStyle = C.tooth; ctx.beginPath();
    for (let x = 16; x < 42; x += 7) { ctx.moveTo(x, 1.4); ctx.lineTo(x + 2.5, 6.2); ctx.lineTo(x + 5, 1.2); }
    for (let x = 18; x < 38; x += 7) {
      const bx = HINGE[0] + (x - HINGE[0]) * c0 - (1 - HINGE[1]) * s0, by = HINGE[1] + (x - HINGE[0]) * s0 + (1 - HINGE[1]) * c0;
      ctx.moveTo(bx, by); ctx.lineTo(bx + 2.5 * c0 + 5 * s0, by + 2.5 * s0 - 5 * c0); ctx.lineTo(bx + 5 * c0, by + 5 * s0);
    }
    ctx.fill();
  }
  ctx.restore();
}

// eye: big almond under a smooth brow; lashes at the back corner; the lids carry the mood
const EX = 20, EY = -15, ERX = 9, ERY = 7.8;
function eye(ctx, p) {
  const face = p.face;
  if (face === 'ouch' || (p.blink && face !== 'dazed')) {
    if (face === 'ouch') ink(ctx, (c) => { c.moveTo(EX - 7, EY - 5); c.lineTo(EX + 3, EY); c.lineTo(EX - 7, EY + 4); }, 3 * L1);
    else ink(ctx, (c) => { c.moveTo(EX - 7.5, EY + 1); c.quadraticCurveTo(EX, EY + 5, EX + 7.5, EY + 1); }, 2.8 * L1);
    lashes(ctx, EY + 1);
    brow(ctx, face === 'ouch' ? -0.3 : 0.1, face === 'ouch' ? 3.5 : 2);
    return;
  }
  if (face === 'dazed') {
    flat(ctx, (c) => ellipse(c, EX, EY, ERX, ERY), C.eyeW, 2.8 * L1);
    ink(ctx, (c) => { for (let a = 0; a < 4 * Math.PI; a += 0.35) { const r = 6 * a / (4 * Math.PI), aa = a + T * 5; a ? c.lineTo(EX + Math.cos(aa) * r, EY + Math.sin(aa) * r) : c.moveTo(EX, EY); } }, 1.8 * L1);
    lashes(ctx, EY - ERY + 1);
    return;
  }
  const kind = face === 'kind' || face === 'proud', happy = face === 'happy';
  // lid line: slant (+ = low at the front = angry) and drop
  let sl = 0.42, dr = 2.4;
  if (face === 'fierce') { sl = 0.55; dr = 3.6; } else if (face === 'roar') { sl = 0.5; dr = 1.4; } else if (face === 'pant') { sl = -0.15; dr = 5; }
  else if (kind) { sl = -0.1; dr = 1.6; } else if (happy) { sl = -0.06; dr = 0.8; }
  const ly0 = EY - ERY + dr - sl * ERX * 1.3, ly1 = EY - ERY + dr + sl * ERX * 1.3;
  const x0 = EX - ERX - 3, x1 = EX + ERX + 3;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x0, ly0); ctx.lineTo(x1, ly1); ctx.lineTo(x1, EY + ERY + 4); ctx.lineTo(x0, EY + ERY + 4); ctx.closePath(); ctx.clip();
  ctx.fillStyle = CUR ? '#d9ffd0' : C.eyeW; ctx.beginPath(); ellipse(ctx, EX, EY, ERX, ERY); ctx.fill();
  ctx.save(); ctx.beginPath(); ellipse(ctx, EX, EY, ERX, ERY); ctx.clip();
  const ix = EX + 1.8, iy = EY + 0.6;
  if (CUR) {
    const pl = 0.85 + 0.15 * Math.sin(T * 6);
    ctx.fillStyle = C.gemD; ctx.beginPath(); ellipse(ctx, ix, iy, ERX * 0.82, ERY * 0.86); ctx.fill();
    ctx.fillStyle = C.gem; ctx.beginPath(); ellipse(ctx, ix, iy, ERX * 0.58 * pl, ERY * 0.6 * pl); ctx.fill();
    ctx.fillStyle = C.gemC; ctx.beginPath(); ellipse(ctx, ix, iy, ERX * 0.26 * pl, ERY * 0.3 * pl); ctx.fill();
  } else {
    ctx.fillStyle = C.irisD; ctx.beginPath(); circle(ctx, ix, iy, 6); ctx.fill();
    ctx.fillStyle = C.iris; ctx.beginPath(); circle(ctx, ix, iy + 0.9, 4.6); ctx.fill();
    ctx.fillStyle = C.pupil; ctx.beginPath(); ellipse(ctx, ix + 0.4, iy, 2, 4.4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, ix - 2.1, iy - 2.3, 1.8); circle(ctx, ix + 2.3, iy + 2.5, 0.9); ctx.fill();
  }
  ctx.restore();
  ink(ctx, (c) => ellipse(c, EX, EY, ERX, ERY), 2.8 * L1);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ellipse(ctx, EX, EY, ERX + 1.6, ERY + 1.6); ctx.clip();
  ink(ctx, (c) => { c.moveTo(x0, ly0); c.lineTo(x1, ly1); }, 3.2 * L1);
  ctx.restore();
  if (happy || kind) {   // smiling cheek pushes the lower lid up (a little for the gentle look, a lot for happy)
    const u = happy ? 1 : 0.55;
    ctx.fillStyle = C.sc; ctx.beginPath(); ellipse(ctx, EX + 0.5, EY + ERY + 3 + (1 - u) * 2.5, ERX + 2.4, 5); ctx.fill();
    ink(ctx, (c) => { c.moveTo(EX - ERX + 0.5, EY + ERY - 3.2 * u); c.quadraticCurveTo(EX, EY + ERY - 6.6 * u, EX + ERX - 0.5, EY + ERY - 3.2 * u); }, 2.4 * L1);
  }
  lashes(ctx, ly0 + 0.4);
  brow(ctx, kind || happy ? -0.18 : sl * 0.8, kind || happy ? -3 : dr - 1.8);
}
function lashes(ctx, y) {
  ink(ctx, (c) => {
    c.moveTo(EX - ERX + 1, y + 1); c.quadraticCurveTo(EX - ERX - 3, y - 1, EX - ERX - 6.5, y - 5.5);
    c.moveTo(EX - ERX + 3.5, y); c.quadraticCurveTo(EX - ERX, y - 3.4, EX - ERX - 2, y - 7.6);
  }, 2.1 * L1, C.lash);
}
function brow(ctx, ang, dy) {
  ctx.fillStyle = CUR ? C.brow : '#36507e';
  ctx.save(); ctx.translate(EX + 1, EY - ERY - 1.5 + dy); ctx.rotate(ang);
  const w = 11;
  ctx.beginPath(); ctx.moveTo(-w, 1.5); ctx.quadraticCurveTo(0, -4.4, w, -0.8); ctx.quadraticCurveTo(w + 1.6, 2.4, w - 1.4, 3.4);
  ctx.quadraticCurveTo(0, 1.2, -w, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// -------------------------------------------------- the cursed collar (band across the neck, + u = throat)
/** The collar on its own (for the engine to drop it): drawCollar(ctx, { scale, crack, t, rot }). */
export function drawCollar(ctx, o = {}) {
  T = o.t ?? T;
  ctx.save(); ctx.scale(o.scale || 1, o.scale || 1); if (o.rot) ctx.rotate(o.rot);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  drawCollarShape(ctx, o.crack ?? 1);
  ctx.restore();
}
const CL = 25, CH = 7.5, CB = 7;
function drawCollarShape(ctx, crack) {
  const L = CL, H = CH, B = CB;
  flat(ctx, (c) => {
    for (const [x, a, l] of [[-L - 2, Math.PI, 12], [-L * 0.45, -Math.PI / 2 - 0.3, 10], [L * 0.15, -Math.PI / 2 + 0.1, 10]]) {
      const bow = B * (1 - (x / L) * (x / L));
      const y = a === Math.PI ? 0 : (Math.sin(a) < 0 ? -H - bow + 1 : H - bow - 1);
      const ux = Math.cos(a), uy = Math.sin(a);
      c.moveTo(x - uy * 4.5, y + ux * 4.5); c.lineTo(x + ux * l, y + uy * l); c.lineTo(x + uy * 4.5, y - ux * 4.5); c.closePath();
    }
  }, C.ironH, 2.6);
  cel(ctx, (c) => {
    c.moveTo(-L, -H); c.quadraticCurveTo(0, -H - B * 2, L, -H); c.quadraticCurveTo(L + 5, 0, L, H);
    c.quadraticCurveTo(0, H - B * 2, -L, H); c.quadraticCurveTo(-L - 5, 0, -L, -H); c.closePath();
  }, C.iron, C.ironD, { k: 1.2, hi: C.ironH, hk: 0.45, lw: 3, detail: (c) => {
    c.fillStyle = C.ironH; c.beginPath(); circle(c, -L * 0.7, -B * 0.4, 2); circle(c, -L * 0.25, -B * 0.9, 2); c.fill();
  } });
  const gx = L * 0.5, gy = -B * 0.6, pulse = 0.7 + 0.3 * Math.sin(T * 4.4);
  const live = 1 - 0.75 * clamp(crack, 0, 1), gw = 11, gh = 13.5;
  if (live > 0.5) {
    ctx.globalAlpha = 0.3 * pulse; ctx.fillStyle = C.glow; ctx.beginPath(); circle(ctx, gx, gy, 20); ctx.fill();
    ctx.globalAlpha = 0.55 * pulse; ctx.strokeStyle = C.glow; ctx.lineWidth = 2.4; ctx.beginPath(); circle(ctx, gx, gy, 16 + 2 * pulse); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  flat(ctx, (c) => { c.moveTo(gx - gw, gy); c.lineTo(gx, gy - gh); c.lineTo(gx + gw, gy); c.lineTo(gx, gy + gh); c.closePath(); }, live > 0.5 ? C.gem : '#2f8f4a', 3);
  ctx.globalAlpha = live;
  ctx.fillStyle = C.gemD; ctx.beginPath(); ctx.moveTo(gx + gw - 2.5, gy); ctx.lineTo(gx, gy + gh - 3); ctx.lineTo(gx - 1.5, gy + 1.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.gemC; ctx.beginPath(); ctx.moveTo(gx - gw + 3, gy - 0.6); ctx.lineTo(gx, gy - gh + 3.5); ctx.lineTo(gx + 1.5, gy - 1.5); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  if (live > 0.4) twinkle(ctx, gx + gw * 0.6, gy - gh * 0.6, 3.4 + 3 * pulse);
  if (crack > 0.02) {
    ink(ctx, (c) => {
      c.moveTo(gx - 1, gy - gh + 1); c.lineTo(gx + 2, gy - 4); c.lineTo(gx - 2.5, gy + 1); c.lineTo(gx + 1, gy + gh - 1);
      if (crack > 0.4) { c.moveTo(gx + 2, gy - 4); c.lineTo(gx + gw - 2, gy - 1); c.moveTo(gx - 2.5, gy + 1); c.lineTo(gx - gw + 2, gy + 2.5); }
      if (crack > 0.7) { c.moveTo(-L * 0.15, -H - B); c.lineTo(-L * 0.05, -1); c.lineTo(-L * 0.2, 3); c.lineTo(-L * 0.08, H - B); }
    }, 2.2);
    if (crack > 0.85) {   // sparks spitting out of the cracks
      ctx.fillStyle = C.gemC;
      for (let i = 0; i < 3; i++) { const a = T * 9 + i * 2.1, r = 14 + 4 * Math.sin(T * 13 + i); ctx.beginPath(); circle(ctx, gx + Math.cos(a) * r, gy + Math.sin(a) * r, 1.6); ctx.fill(); }
    }
  }
}
function twinkle(ctx, x, y, r) {
  ctx.fillStyle = C.gemC;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.6); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r * 1.6);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r * 1.6); ctx.closePath();
  ctx.fill();
}
// the collar bursting apart: iron shards + gem splinters fly outward from the neck base, a green flash ring
const SHARDS = [[-1, -0.6, 0.3, 1], [-0.7, -1, -0.5, 0], [0.2, -1.1, 0.8, 1], [0.9, -0.5, -0.2, 0], [1, 0.4, 0.6, 2], [-0.9, 0.5, -0.9, 2], [0.4, 0.9, 0.4, 1]];
function shards(ctx, p) {
  const k = clamp(p.shatter, 0, 1), cx = lerp(NX[0], NX[1], 0.75), cy = lerp(NY[0], NY[1], 0.75);
  ctx.save(); ctx.translate(cx, cy);
  if (k < 0.45) {   // white star burst
    const u = k / 0.45, R = 30 + 60 * u;
    ctx.fillStyle = C.glow; ctx.globalAlpha = 0.35 * (1 - u); ctx.beginPath(); circle(ctx, 0, 0, R * 0.7); ctx.fill();
    ctx.globalAlpha = Math.min(1, 1.6 * (1 - u));
    flat(ctx, (c) => { for (let j = 0; j < 16; j++) { const rr = j % 2 ? R * 0.3 : R * (j % 4 ? 0.75 : 1.1), aa = j * Math.PI / 8; j ? c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr) : c.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr); } c.closePath(); }, '#ffffff', 0);
    ctx.globalAlpha = 1;
  }
  const d = 20 + 100 * Math.pow(k, 0.55), gdrop = 70 * k * k;
  ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
  for (const [dx, dy, spin, kind] of SHARDS) {
    ctx.save();
    ctx.translate(dx * d, dy * d + gdrop); ctx.rotate(spin * k * 8); ctx.scale(1.7, 1.7);
    if (kind === 1) flat(ctx, (c) => { c.moveTo(-5, -4); c.lineTo(5, -6); c.lineTo(3, 5); c.closePath(); }, C.gem, 1.6);
    else flat(ctx, (c) => { c.moveTo(-8, -4); c.lineTo(7, -5); c.lineTo(9, 3); c.lineTo(-4, 5); c.closePath(); }, kind === 2 ? C.ironH : C.iron, 1.6);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// -------------------------------------------------- storm effects
// pseudo-random jitter that changes ~18 times a second (lightning flicker), deterministic from T
function jit(i) { const n = Math.sin((Math.floor(T * 18) + 1) * 12.9898 + i * 78.233) * 43758.5453; return n - Math.floor(n) - 0.5; }
function boltLine(c, x0, y0, x1, y1, n, amp, seed) {
  c.moveTo(x0, y0);
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 1; i < n; i++) { const t = i / n, j = jit(seed + i) * amp; c.lineTo(x0 + dx * t + nx * j, y0 + dy * t + ny * j); }
  c.lineTo(x1, y1);
}
// horns crackling: arcs between and above the horn tips (head frame -> drawn in the body frame via the neck tip)
function crackle(ctx, p) {
  const g = clamp(p.glow, 0, 1);
  ctx.save();
  ctx.translate(NX[NSEG], NY[NSEG]); ctx.rotate(-p.head * DEG); ctx.scale(HS, HS);
  const hx = -50, hy = -62, h2x = -42, h2y = -66;

  const arcs = (c) => {
    boltLine(c, hx, hy, h2x + 8, h2y, 4, 5, 1);
    boltLine(c, -46, -26, hx + 2, hy + 4, 5, 6, 10);
    if (g > 0.3) boltLine(c, hx, hy, hx - 6 - 10 * g, hy - 20 - 26 * g, 5, 8, 20);
    if (g > 0.55) boltLine(c, h2x + 8, h2y, h2x + 14, h2y - 22 - 26 * g, 5, 8, 30);
    if (g > 0.8) boltLine(c, -30, -46, -40, -74 - 22 * g, 4, 7, 40);
  };
  ink(ctx, arcs, 5 + 2 * g, C.sparkY);
  ink(ctx, arcs, 2, C.spark);
  // sparks
  ctx.fillStyle = C.spark;
  for (let i = 0; i < 4; i++) { if (jit(50 + i) + 0.5 > g + 0.2) continue; ctx.beginPath(); circle(ctx, hx + jit(60 + i) * 40, hy + jit(70 + i) * 30, 2); ctx.fill(); }
  ctx.restore();
}
// wind streaks blasting forward from the wings during the gust
function gustFx(ctx, p) {
  const g = clamp(p.gust, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.8 * g; ctx.strokeStyle = '#f4faff'; ctx.lineCap = 'round';
  const tx = Math.max(TIPX, 60);
  // burst where the wingtips meet
  ctx.lineWidth = 3; ctx.beginPath();
  for (let j = 0; j < 6; j++) { const a = -0.9 + j * 0.36, r0 = 10 + 16 * g, r1 = 22 + 26 * g; ctx.moveTo(tx + Math.cos(a) * r0, (TIPY0 + TIPY1) / 2 + Math.sin(a) * r0); ctx.lineTo(tx + Math.cos(a) * r1, (TIPY0 + TIPY1) / 2 + Math.sin(a) * r1); }
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const y = lerp(TIPY0, TIPY1, i / 4) + 6, x0 = tx + 8 + (i % 2) * 14 + (1 - g) * 40, L = 70 + 30 * g;
    ctx.lineWidth = 4 - (i % 2) * 1.4;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(x0 + L * 0.5, y - 8, x0 + L, y + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + L * 0.75, y + 2); ctx.arc(x0 + L + 4, y + 10, 7, Math.PI * 1.2, Math.PI * 2.4); ctx.stroke();
  }
  ctx.restore();
}
function streaks(ctx, a) {
  ctx.strokeStyle = '#f4fbff'; ctx.lineCap = 'round';
  ctx.globalAlpha = 0.7 * a;
  for (const [y, x0, L, w] of [[-40, -70, 70, 3], [-10, -90, 90, 4], [16, -76, 60, 3]]) {
    const off = ((T * 420 + y * 13) % 60 + 60) % 60;
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0 - off, y); ctx.lineTo(x0 - off - L, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- engine-facing measurements (local px, facing right, scale 1, before z)
/**
 * Hurtboxes for any pose (local px, facing right, scale 1, before z; x is mirrored by facing): { body, head }, each
 * { x, y, w, h } = centre + size.  The body box follows the torso (incl. ground poses), the head box the head + upper neck.
 */
export function boxesOf(p) {
  solve(p, 0); bodyXf(p, G.dy, 0);
  const [bx, by] = mP(-4, 0).map(Math.round);
  const [hx, hy] = headOf(p);
  return { body: { x: bx, y: by, w: 136, h: 66 }, head: { x: hx - 4, y: hy + 4, w: 74, h: 62 } };
}
/** Body hurtbox in hover (flying) and on the ground (grounded / landing / takeoff before lift-off / defeated); see boxesOf. */
export const HURTBOX = { x: -4, y: -40, w: 136, h: 66 };
export const HURTBOX_GROUND = { x: -4, y: -52, w: 136, h: 66 };
/** Head + upper-neck hurtbox in hover (she is hittable there too). */
export const HEADBOX = { x: 110, y: -122, w: 74, h: 62 };
/** Hero hips on her back in glide(0) (front seat) and all three seats. */
export const SADDLE = saddleOf(ANIM.glide(0), 0);
export const SEATS = [0, 1, 2].map((i) => saddleOf(ANIM.glide(0), i));
/** Local [x, y] of the head (skull centre) for a pose: for cameras / speech bubbles in cutscenes. */
export function headOf(p) {
  solve(p, 0); bodyXf(p, G.dy, 0);
  neckChain(p);
  mT(NX[NSEG], NY[NSEG]); mR(-p.head * DEG); mS(HS, HS);
  return mP(18, -12).map((v) => Math.round(v));
}
/** Head-tip region where the horns crackle at the end of boltWind (spawn the sky-bolt / flash from here). */
export const HORNS = (() => {
  const p = ANIM.boltWind(1);
  solve(p, 0); bodyXf(p, G.dy, 0);
  neckChain(p);
  mT(NX[NSEG], NY[NSEG]); mR(-p.head * DEG); mS(HS, HS);
  return mP(-48, -64).map((v) => Math.round(v));
})();
/** Mouth (front of the jaws) in roar(0). */
export const MOUTH = (() => {
  const p = ANIM.roar(0);
  solve(p, 0); bodyXf(p, G.dy, 0);
  neckChain(p);
  mT(NX[NSEG], NY[NSEG]); mR(-p.head * DEG); mS(HS, HS);
  return mP(52, 3).map((v) => Math.round(v));
})();
