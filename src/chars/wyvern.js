// Wyvern Rider: a collared young wyvern ridden by a kobold lancer (Level 3, Stormspire; flying enemy, 1-3 at a time).
//
// The wyvern: sleek two-legged dragon whose arms ARE its bat wings, blue-teal scales, pale belly, amber wing membranes
// (they read against the grey-blue storm sky and the dark rider), golden crest fins, swept-back horns.  The rig is
// drawn 1.2x (wing planform ~170 px tip to tip; ~150 px of vertical flap on screen) so the rider reads at game scale.  Cursed (o.cursed, default true): the Dragon King's black-iron
// collar with ONE glowing venom-green gem round the neck base and green glowing eyes; the kobold steers it by reins
// clipped to the collar ring.  Freed: no collar, warm amber eyes, happy face.
// The rider (o.rider, default true; a pose can also set rider: false): a small goofy Scale-Snout lancer in the
// kobold.js style (black-iron pot helmet with the green gem, big yellow eyes, leather jerkin, green sash) sitting on
// the wyvern's neck base on a red cavalry blanket, short lance (red pennant) in the near hand, reins to the collar
// ring in the far hand.  Drawn at ~0.75 of a foot kobold with game-weight ink.
//
// Local space: origin = the point on the FLOOR under the wyvern, +x = facing, y down.  The engine lifts the drawing
// by the flight height z; the body centre sits BODY_Y = -20 px above the origin (scale 1); drawn bounds in `fly`
// x -92 .. +92, y -120 (lance tip) .. +16, so fly at z >= ~40 (70-90 is fine).  `down` is drawn for z = 0.
// boxesOf(pose) -> { body, rider } hurtboxes for any pose (HURTBOX / RIDER_BOX = the `fly` values).
// Time: fly / dive / freed carry their own wing phase from t; keyed poses (k) flap from o.t, so pass the same clock.
// Secondary motion: o.mem + o.vel ({x, y, z} world px / frame) drive the tail, the lance pennant, the rider's bounce
// and the crest through rig.follow(); without o.mem (pose sheets) everything sits at its rest target.
//
// Riderless + rider-alone drawing: when the kobold is knocked off, draw the wyvern with { rider: false } and the
// kobold separately with ANIM.riderFall(k) (pose.solo = 'rider': only the kobold + its spinning lance, hips at
// RIDER_HIP_Y above the origin).  Start it at SEAT_POS (the rider's hips in `fly`, local to the wyvern), let it fall
// with gravity and poof it into smoke; riderFall carries its own tumble (k: 0..1 over ~40 frames, loop k if longer).
import { cel, flat, ink, blob, ellipse, circle, keys, mix, follow, DEG, TAU, clamp, lerp } from '../rig.js';
import { INK } from '../config.js';

const STD = {
  sc: '#3995a8', scD: '#24647a', scH: '#86d0e0', scL: '#2a7689',
  scF: '#2c7a8d', scFD: '#1a4d5e',
  bel: '#eef2cf', belD: '#c4cd99', belL: '#a3ae76',
  mem: '#e8a43c', memD: '#b8701f', memF: '#b97a2c', memFD: '#8a5418', vein: 'rgba(120,58,14,0.55)',
  boneF: '#2a6f80',
  fin: '#f4c64a', finD: '#bd8a25', finL: '#d59f2f',
  horn: '#f4ead0', hornD: '#c9b27f',
  brow: '#183f4c',
  iron: '#3b3d47', ironD: '#1f2128', ironH: '#737885',
  gem: '#46f26c', gemD: '#0f9a3e', gemC: '#eaffdf', glow: '#5cff7e',
  eyeW: '#fffaf0', iris: '#f4a321', irisD: '#b2600d', pupil: '#2b1406',
  mouth: '#5a1826', tongue: '#f27c88', tooth: '#fffaf0',
  rim: '#e2f7ff',
};
// the WYVERN ALPHA (the Eyrie's mini-boss, o.variant 'alpha'; tools/sprite3d chars/wyvern_alpha.py): a storm palette
// for the code-rig fallback -- slate scales, a pale grey belly, electric-blue membranes and fins, storm-blue eyes when
// freed (cursed, its eyes keep the curse's green glow on purpose)
const ALPHA = Object.assign({}, STD, {
  sc: '#66738a', scD: '#454e60', scH: '#9aa8c0', scL: '#56627a', scF: '#454e60', scFD: '#2c3240',
  bel: '#c8d4e4', belD: '#97a6bc', belL: '#7f8ea6',
  mem: '#3fa8ff', memD: '#1f6ad0', memF: '#2f88d8', memFD: '#1a54a8', vein: 'rgba(14,42,106,0.5)',
  boneF: '#454e60',
  fin: '#6fd8ff', finD: '#2f9ae0', finL: '#4fb8f0',
  horn: '#e6eef8', hornD: '#aab8cc',
  brow: '#2a3040',
  iris: '#7fe8ff', irisD: '#2fa8e0',
});
let C = STD;
// the rider (kobold.js 'green' grunt + the faction's iron and venom green)
const K = {
  sc: '#7ab34a', scD: '#4c7b2f', scH: '#acd977', scL: '#5c9338', belly: '#f0e4b4', bellyD: '#c9b37c', stripe: '#3d6427',
  frill: '#c9dc54', frillD: '#86992b',
  iron: '#4b5262', ironD: '#2c303c', ironH: '#808a9e',
  lea: '#6b5847', leaD: '#463a2f', leaH: '#8b7660',
  sash: '#2f9a5e', sashD: '#1c6440', sashH: '#5cc786',
  blanket: '#c2412f', blanketD: '#7f241a', trim: '#f2c14e',
  wood: '#8f7352', woodD: '#5f4a33',
  blade: '#a3acb8', bladeD: '#666f7d', bladeH: '#e4eaf1',
  pen: '#e04a3a', penD: '#8f2a20',
  gem: '#62ff8c', gemC: '#eaffe6',
  eye: '#ffd43c', eyeD: '#e39a14', pupil: '#1b1016',
  mouth: '#6a1d2c', tongue: '#ef7f9b', tooth: '#fffbea', claw: '#2a2027', sweat: '#9fe3ff', star: '#ffe45c',
};

// ---------------------------------------------------------------- skeleton (body frame: origin = body centre)
export const BODY_Y = -20;
const RIG = 1.2;                       // overall size trim (body-frame numbers below are pre-RIG)
const SHOULDER = [15, -8];             // near wing root (the far one sits a touch up/forward)
const NECK0 = [19, -6];                // neck root
const NSEG = 5, NLEN = 7;              // neck chain
const TAIL_ROOT = [-24, 1];
const HIP = [-11, 5];
const SEAT = [4, -14];                // rider's hips on the saddle
const TILT = 20 * DEG;                 // camera tilt used to project the wings
const FLAP_HZ = 3, TAIL_HZ = 1.3;
const RS = 0.63;                       // rider scale (its parts are authored in foot-kobold units)
export const RIDER_HIP_Y = -18;        // riderFall: hips above the draw origin
const SHAFT = 118, BUTT = 30, BLADE = 24;  // rider's lance (rider units): hand at 0, butt at -BUTT, socket at SHAFT - BUTT

// ---------------------------------------------------------------- poses
// Wyvern: pitch (+ nose up), rot (tumble), st (stretch), bob (px with the beat).  na: neck lift (deg up from forward),
// nc: neck curl per segment (+ = bends forward/down), head: absolute head angle (+ nose up), jaw.  wing / flap /
// sweep / fold / ph as in whelp.js.  tb / tc / tsw / tp: tail droop, curl, sway, phase.  hl / hk: leg thigh / knee.
// Rider: rtor lean (+ fwd), rhd head tilt (+ chin down), gx / gy near-hand grip (rider units, hip frame), la lance
// angle (deg, 0 = straight ahead, + = tip up), rf 0 = far hand on the reins .. 1 = flailing, rl / rk thigh / knee,
// rx / ry offset off the saddle (rider units), rrot tumble, rtb tail droop, rface.
export const BASE = {
  x: 0, y: 0, rot: 0, pitch: 6, st: 1, bob: 2.4,
  na: 50, nc: 7, head: -6, jaw: 0, glow: 0,
  wing: 24, flap: 38, sweep: 0, fold: 0, ph: null,
  tb: 24, tc: 4, tsw: 6, tp: null,
  hl: -46, hk: 76,
  face: 'mean', free: false, crack: 0, streak: 0, stars: false, blink: false,
  rider: true, solo: false,
  rtor: 12, rhd: -10, gx: 20, gy: -11, la: 40, rf: 0, rl: 72, rk: -92, rx: 0, ry: 0, rrot: 0, rtb: 46,
  rface: 'mean', smear: 0, glint: 0,
  lfree: false, lx: 0, ly: 0, lrot: 0,
};
const P = (o) => Object.assign({}, BASE, o);

const FLY = P({});
// the coiled rear-up at the end of the dive telegraph
const REAR = P({ x: -6, y: -10, pitch: 42, na: 34, nc: 12, head: -6, jaw: 10, wing: 86, flap: 4, fold: 0, tb: 66, tc: 9, tsw: 2,
  hl: 10, hk: 50, face: 'narrow', bob: 0,
  rtor: 26, rhd: -50, gx: 30, gy: -2, la: -58, rl: 70, rk: -100, rtb: 70, rface: 'yell', glow: 1, glint: 1 });
const DIVE = { pitch: -32, na: -2, nc: 3, head: -14, jaw: 6, wing: 24, flap: 3, sweep: 74, fold: 0.9, tb: -8, tc: 3, tsw: 2,
  hl: -100, hk: 40, st: 1.06, face: 'narrow', streak: 1, bob: 0,
  rtor: 52, rhd: -34, gx: 44, gy: -12, la: -1, rl: 50, rk: -96, rtb: 64, rface: 'yell', smear: 1 };

export const ANIM = {
  // cruising: ~3 beats / s, the body bobs on each downstroke, the rider bounces a beat behind
  fly(t) {
    const s = Math.sin(t * 2.3), s2 = Math.sin(t * 1.1 + 0.7);
    return P({ ph: t * FLAP_HZ, tp: t * TAIL_HZ, x: 1.6 * Math.sin(t * 1.4), pitch: 6 + 3 * s, head: -6 - 4 * s2, na: 54 + 3 * s2,
      tc: 4 + 2 * Math.sin(t * 1.7), hl: -46 + 6 * s, la: 40 + 4 * s2, rhd: -10 + 4 * Math.sin(t * 0.9), blink: (t % 3.4) > 3.27 });
  },
  // 26 f telegraph: rears up, wings hauled high, the kobold couches the lance and yells
  diveWind: (k) => keys(k, [
    [0, P(Object.assign({}, FLY, { glow: 1 }))],
    [0.12, P({ x: -2, y: -2, pitch: 16, na: 44, head: -4, wing: 40, flap: 20, tb: 40, hl: -24, rtor: 20, rhd: -18, gx: 18, gy: -14, la: 40,
      rface: 'yell', glow: 1, face: 'narrow', bob: 0 }), 'out'],
    [0.3, P(Object.assign({}, REAR, { y: -12, pitch: 46, glint: 0.7 })), 'out'],
    [1, P(Object.assign({}, REAR, { y: -10, pitch: 42 }))],
  ]),
  // the dive itself: streamlined diagonal stoop, wings swept, lance levelled along the line of flight (LANCE_TIP)
  dive: (t) => P(Object.assign({}, DIVE, { ph: t * 6, tp: t * 3.5, la: 0 + 1.5 * Math.sin(t * 31), rhd: -8 + Math.sin(t * 23) })),
  // 20 f: pulls out of the dive with a hard downstroke and climbs away
  swoopUp: (k) => keys(k, [
    [0, P(Object.assign({}, DIVE, { ph: 0.1 }))],
    [0.3, P({ ph: 0.42, pitch: 8, y: 6, na: 40, nc: 6, head: -16, wing: 6, flap: 0, sweep: 10, fold: 0, tb: 46, tc: 8, hl: -60, hk: 80,
      st: 0.94, face: 'narrow', bob: 0, rtor: 4, rhd: -4, ry: -5, gx: 24, gy: -6, la: -16, rl: 80, rk: -80, rtb: 70, rface: 'yell', smear: 0.4 }), 'out'],
    [0.62, P({ ph: 0.78, pitch: 26, y: -4, na: 60, head: 4, wing: 30, flap: 30, tb: 30, hl: -30, rtor: 18, rhd: -16, ry: 1, gx: 13, gy: -15,
      la: 48, rtb: 30, face: 'mean', rface: 'mean' }), 'io'],
    [1, P({ ph: 1.1, pitch: 10 })],
  ]),
  // recoil in the air: the wyvern rears, the kobold is jolted up off the saddle
  hurt: (k) => keys(k, [
    [0, P({ x: -10, y: 2, pitch: 6, na: 78, nc: 20, head: 46, jaw: 18, wing: -18, flap: 0, fold: 0.55, sweep: 30, tb: 76, tc: 16, tsw: 2, hl: 30, hk: 40,
      face: 'ouch', st: 0.92, bob: 0, rtor: 46, rhd: 16, ry: -5, rx: 3, gx: 28, gy: 0, la: -20, rf: 0.7, rl: 92, rk: -60, rtb: 80, rface: 'ouch' })],
    [0.32, P({ x: -12, y: 1, pitch: 10, na: 70, nc: 16, head: 30, jaw: 12, wing: -6, flap: 6, fold: 0.4, sweep: 20, tb: 60, tc: 12, tsw: 3, hl: 10, hk: 50,
      face: 'ouch', st: 0.96, bob: 0, rtor: 30, rhd: 8, ry: -2, gx: 26, gy: -4, la: -6, rf: 0.4, rl: 80, rk: -76, rtb: 64, rface: 'ouch' }), 'out'],
    [1, P({ x: -3, pitch: 8 })],
  ]),
  // knocked out of the sky: tumbling, the kobold clinging on and flailing (rot ends upright for `down`)
  fall: (k) => {
    const p = keys(k, [
      [0, P({ pitch: 30, na: 70, head: 24, jaw: 16, wing: 60, flap: 24, fold: 0.3, tb: -10, tc: -6, tsw: 10, hl: -10, hk: 40, face: 'ouch', bob: 0,
        rtor: -26, ry: -16, rx: -6, rrot: 18, gx: 22, gy: -14, la: 40, rf: 1, rl: 110, rk: -30, rtb: 90, rface: 'scared' })],
      [1, P({ pitch: 0, na: 30, nc: 6, head: -10, jaw: 14, wing: 30, flap: 26, fold: 0.5, tb: 10, tc: -2, tsw: 12, hl: -20, hk: 60, face: 'dizzy', bob: 0,
        rtor: -34, ry: -20, rx: -8, rrot: 30, gx: 24, gy: -16, la: 60, rf: 1, rl: 120, rk: -20, rtb: 100, rface: 'scared' })],
    ]);
    p.rot = 40 + 300 * Math.pow(k, 0.8);
    if (k > 0.45) p.face = 'dizzy';
    return p;
  },
  // dazed on the floor (z = 0): rider gone, wings splayed, swirl eyes, the collar cracked
  down: P({ y: 4.5, pitch: -4, st: 1.08, na: 14, nc: 2, head: -2, jaw: 14, wing: 4, flap: 0, sweep: 34, fold: 0.25, tb: -2, tc: 0.5, tsw: 1.2,
    hl: 100, hk: 16, face: "dizzy", bob: 0, stars: true, crack: 1, rider: false }),
  // collar gone, rider gone: a happy wyvern heading home with a barrel-roll of joy every 2.6 s
  freed(t) {
    const u = (t % 2.6) / 2.6;
    const p = P({ ph: t * 3.4, tp: t * 2, free: true, rider: false, face: 'happy', pitch: 12, na: 58, head: 2, jaw: 12, bob: 3, wing: 20,
      flap: 52, tb: 18, tc: 7, tsw: 9, hl: -40 });
    if (u < 0.36) {
      const th = TAU * (1 - Math.pow(1 - u / 0.36, 2.2));
      p.rot = th / DEG; p.x = 14 * Math.sin(th); p.y = -14 * (1 - Math.cos(th)); p.tc = 9; p.flap = 30; p.wing = 30;
    } else p.y = -3 * Math.sin((u - 0.36) / 0.64 * TAU * 2);
    return p;
  },
  // the kobold alone, knocked off and tumbling (draw at its own position; lance spins away)
  riderFall: (k) => {
    const p = P({ solo: 'rider', rider: true, rface: k < 0.15 ? 'ouch' : 'scared', rf: 1, rtor: -10 + 30 * Math.sin(k * 9),
      rhd: 10 * Math.sin(k * 13), gx: 4 + 6 * Math.sin(k * 17), gy: -34 + 6 * Math.cos(k * 17),
      rl: 70 + 40 * Math.sin(k * 15), rk: -40 - 30 * Math.sin(k * 15 + 1), rtb: 60 + 40 * Math.sin(k * 11),
      lfree: true, lx: 40 + 90 * k, ly: -50 - 50 * k + 150 * k * k, lrot: -40 - 900 * k });
    p.rrot = -(30 + 560 * Math.pow(k, 0.85));
    return p;
  },
};
export { mix };

// ---------------------------------------------------------------- measurement (shared transform math)
// A tiny affine stack that mirrors the ctx calls of draw() for the engine-facing measurements.
const M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function mReset() { M.a = 1; M.b = 0; M.c = 0; M.d = 1; M.e = 0; M.f = 0; }
function mT(x, y) { M.e += M.a * x + M.c * y; M.f += M.b * x + M.d * y; }
function mR(r) { const cs = Math.cos(r), sn = Math.sin(r), a = M.a, b = M.b, c = M.c, d = M.d; M.a = a * cs + c * sn; M.b = b * cs + d * sn; M.c = c * cs - a * sn; M.d = d * cs - b * sn; }
function mS(sx, sy) { M.a *= sx; M.b *= sx; M.c *= sy; M.d *= sy; }
function mP(x, y) { return [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f]; }
function bodyXf(p) {     // origin -> body frame (bob excluded: measured poses use bob 0)
  mReset(); mT(0, BODY_Y); mS(RIG, RIG); mT(p.x, p.y);
  if (p.rot) mR(-p.rot * DEG);
  mR(-p.pitch * DEG);
  if (p.st !== 1) mS(p.st, 1 / Math.sqrt(p.st));
}
function riderXf(p) { mT(SEAT[0], SEAT[1]); mS(RS, RS); mT(p.rx, p.ry); if (p.rrot) mR(-p.rrot * DEG); }

/** Local [x, y] of the lance tip for a pose (facing right, scale 1, before z). */
export function lanceTipOf(p) {
  if (p.solo) { mReset(); mT(0, RIDER_HIP_Y); mS(RS * RIG, RS * RIG); mT(p.rx, p.ry); if (p.rrot) mR(-p.rrot * DEG); } else { bodyXf(p); riderXf(p); }
  mT(p.gx, p.gy); mR(-p.la * DEG);
  return mP(SHAFT - BUTT + BLADE, 0).map((v) => Math.round(v));
}
/** Local [x, y] of the wyvern's head for a pose (cameras / close-ups). */
export function headOf(p) {
  bodyXf(p);
  let a = -p.na * DEG, x = NECK0[0], y = NECK0[1];
  for (let i = 1; i <= NSEG; i++) { a += p.nc * DEG; x += Math.cos(a) * NLEN; y += Math.sin(a) * NLEN; }
  mT(x, y); mR(-p.head * DEG);
  return mP(10, -6).map((v) => Math.round(v));
}
/** Lance tip in the dive (the engine's hit point while diving). */
export const LANCE_TIP = lanceTipOf(ANIM.dive(0));
/** Rider's hips in `fly` (where to start riderFall when the kobold is knocked off). */
export const SEAT_POS = (() => { bodyXf(ANIM.fly(0)); riderXf(ANIM.fly(0)); return mP(0, 0).map((v) => Math.round(v)); })();

// ---------------------------------------------------------------- drawing
let T = 0, MEM = null, VX = 0, VZ = 0, CUR = true;
const RIM = { on: true };

/**
 * Draw a wyvern rider.  ctx is at the floor point under it (the engine has already lifted it by z), unscaled.
 * o: { facing, t, scale, cursed = true, rider = true, mem, vel }
 */
export function draw(ctx, pose, o = {}) {
  const p = pose, f = o.facing || 1, S = o.scale || 1;
  T = o.t || 0; MEM = o.mem || null; C = o.variant === 'alpha' ? ALPHA : STD;
  const v = o.vel || null;
  VX = v ? (v.x || 0) * f : 0; VZ = v ? (v.z || 0) : 0;
  CUR = (o.cursed ?? true) && !p.free;
  const riderOn = (o.rider ?? true) && p.rider !== false;

  ctx.save();
  ctx.scale(f * S, S);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (p.solo === 'rider') {
    ctx.translate(0, RIDER_HIP_Y);
    ctx.scale(RS * RIG, RS * RIG);
    if (p.lfree) looseLance(ctx, p);
    rider(ctx, p, 0);
    ctx.restore();
    return;
  }
  const ph = p.ph ?? T * FLAP_HZ;
  const u = ph - Math.floor(ph);
  const w = wave(u);
  const fa = p.wing + p.flap * w;
  const fold = clamp(p.fold + (u > 0.42 ? 0.5 * Math.sin((u - 0.42) / 0.58 * Math.PI) * clamp(p.flap / 30, 0, 1) : 0), 0, 1);
  const bobY = p.bob * wave((u + 0.92) % 1);
  // the rider rides a beat behind the bob (+ lifts off / sinks in when the climb rate changes)
  let rBob = 0;
  if (riderOn) {
    rBob = p.bob * 0.7 * (wave((u + 0.74) % 1) - wave((u + 0.92) % 1));
    rBob += follow(MEM, 'wyr_rz', clamp(VZ * 0.7, -4, 1.5), 0.2, 0.68);
  }
  const tp = p.tp ?? T * TAIL_HZ;

  ctx.translate(0, BODY_Y); ctx.scale(RIG, RIG);
  ctx.translate(p.x, p.y + bobY);
  if (p.rot) ctx.rotate(-p.rot * DEG);
  ctx.rotate(-p.pitch * DEG);
  if (p.st !== 1) ctx.scale(p.st, 1 / Math.sqrt(p.st));

  if (p.streak > 0.01) streaks(ctx, p.streak);
  wing(ctx, p, fa, fold, true);
  leg(ctx, p, true);
  tail(ctx, p, tp);
  body(ctx);
  if (riderOn) saddle(ctx);
  leg(ctx, p, false);
  neckAndHead(ctx, p);
  wing(ctx, p, fa, fold, false);
  if (riderOn) {
    ctx.save();
    ctx.translate(SEAT[0], SEAT[1] + rBob);
    ctx.scale(RS, RS);
    rider(ctx, p, 1);
    ctx.restore();
  }
  if (p.stars) stars(ctx);
  ctx.restore();
}

function wave(u) {   // 1 = wings up, -1 = wings down; the downstroke takes 42 % of the beat
  return u < 0.42 ? Math.cos(u / 0.42 * Math.PI) : -Math.cos((u - 0.42) / 0.58 * Math.PI);
}

// cool rim light just inside the outline on the side away from the key light (upper right on screen)
function rim(ctx, path, lw, s = 1.6) {
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

// -------------------------------------------------- wings (projected planform, see whelp.js)
// planform (u forward along the chord, v out along the span): shoulder, elbow, wrist, thumb, 3 finger tips, trailing root
const WS = [0, 0, 11, 22, 2, 40, 11, 44, -7, 82, -30, 69, -47, 45, -27, 4];
const WF = [0, 0, 8, 16, -3, 31, 6, 33, -30, 53, -37, 46, -40, 32, -22, 4];
const WP = new Float64Array(16);
function wing(ctx, p, fa, fold, far) {
  const s = Math.sin(fa * DEG + (far ? TILT : -TILT));
  const k = far ? 0.95 : 1.06;
  const sw = (p.sweep + (far ? 4 : 0)) * DEG, cs = Math.cos(sw), sn = Math.sin(sw);
  const ox = SHOULDER[0] + (far ? 3.5 : 0), oy = SHOULDER[1] - (far ? 3 : 0);
  for (let i = 0; i < 16; i += 2) {
    const uu = lerp(WS[i], WF[i], fold) * k, vv = lerp(WS[i + 1], WF[i + 1], fold) * k;
    WP[i] = ox + uu * cs - vv * sn;
    WP[i + 1] = oy - (uu * sn + vv * cs) * s;
  }
  if (far) cel(ctx, membrane, C.memF, C.memFD, { k: 1.3, lw: 2.4 });
  else celR(ctx, membrane, C.mem, C.memD, { k: 1.4, lw: 2.6, detail: veins }, 1.5);
  const bc = far ? C.boneF : C.sc;
  ink(ctx, fingerPath, 1.7, far ? C.memFD : C.memD);
  ink(ctx, armPath, 4.6);
  ink(ctx, armPath, 2.2, bc);
  // thumb claw + knuckle
  flat(ctx, (c) => {
    const x = WP[4], y = WP[5], dx = WP[6] - x, dy = WP[7] - y;
    c.moveTo(x - dy * 0.3, y + dx * 0.3); c.quadraticCurveTo(x + dx * 0.7, y + dy * 0.7, x + dx * 1.2, y + dy * 1.2);
    c.lineTo(x + dy * 0.3, y - dx * 0.3); c.closePath();
  }, far ? C.hornD : C.horn, 1.8);
  flat(ctx, (c) => circle(c, WP[4], WP[5], 2.6), bc, 1.8);
}
function membrane(c) {
  c.moveTo(WP[0], WP[1]); c.lineTo(WP[2], WP[3]); c.lineTo(WP[4], WP[5]); c.lineTo(WP[8], WP[9]);
  scallop(c, 8, 10, 0.3); scallop(c, 10, 12, 0.3); scallop(c, 12, 14, 0.24);
  c.lineTo(WP[0], WP[1]);
  c.closePath();
}
function scallop(c, a, b, d) {
  const mx = (WP[a] + WP[b]) / 2, my = (WP[a + 1] + WP[b + 1]) / 2;
  c.quadraticCurveTo(mx + (WP[4] - mx) * d, my + (WP[5] - my) * d, WP[b], WP[b + 1]);
}
function armPath(c) { c.moveTo(WP[0], WP[1]); c.lineTo(WP[2], WP[3]); c.lineTo(WP[4], WP[5]); }
function fingerPath(c) {
  for (const i of [8, 10, 12]) { c.moveTo(WP[4], WP[5]); c.lineTo(lerp(WP[4], WP[i], 0.97), lerp(WP[5], WP[i + 1], 0.97)); }
}
function veins(c) {
  c.strokeStyle = C.vein; c.lineWidth = 1.2;
  c.beginPath();
  for (const i of [8, 10, 12]) {
    const j = i + 2, mx = (WP[i] + WP[j]) / 2, my = (WP[i + 1] + WP[j + 1]) / 2;
    c.moveTo(lerp(WP[4], mx, 0.22), lerp(WP[5], my, 0.22)); c.lineTo(lerp(WP[4], mx, 0.64), lerp(WP[5], my, 0.64));
  }
  c.stroke();
}

// -------------------------------------------------- tail: tapered spine, golden spade fin; follows the flight
const TN = 7, TSEG = 6;
const SX = new Float64Array(TN + 1), SY = new Float64Array(TN + 1), SA = new Float64Array(TN + 1);
const AX = new Float64Array(TN + 1), AY = new Float64Array(TN + 1), BX = new Float64Array(TN + 1), BY = new Float64Array(TN + 1);
function tail(ctx, p, tp) {
  // secondary motion: climbing drags the tail down, speed streams it out straight, stopping lets it swing
  const tb = follow(MEM, 'wy_tb', lerp(p.tb, 0, clamp(Math.abs(VX) / 8, 0, 0.75)) + clamp(VZ * 3.2, -24, 24), 0.11, 0.8);
  const sw = follow(MEM, 'wy_tsw', p.tsw + clamp(Math.abs(VX) * 0.5, 0, 5), 0.1, 0.8);
  let a = Math.PI - tb * DEG, x = TAIL_ROOT[0], y = TAIL_ROOT[1];
  for (let i = 0; i <= TN; i++) {
    if (i) {
      a += (p.tc + sw * Math.sin(tp * TAU - i * 0.7)) * DEG;
      x += Math.cos(a) * TSEG; y += Math.sin(a) * TSEG;
    }
    SX[i] = x; SY[i] = y; SA[i] = a;
    const hw = lerp(7.6, 2.4, i / TN), nx = -Math.sin(a) * hw, ny = Math.cos(a) * hw;
    AX[i] = x + nx; AY[i] = y + ny; BX[i] = x - nx; BY[i] = y - ny;
  }
  cel(ctx, tailPath, C.sc, C.scD, { k: 1.2, lw: 2.5, detail: (c) => {
    c.strokeStyle = C.bel; c.lineWidth = 3; c.beginPath();
    for (let i = 0; i < TN; i++) { const xx = lerp(SX[i], BX[i], 0.55), yy = lerp(SY[i], BY[i], 0.55); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.stroke();
  } });
  // spade fin at the tip
  ctx.save();
  ctx.translate(SX[TN], SY[TN]); ctx.rotate(SA[TN]);
  cel(ctx, (c) => { c.moveTo(-2, 0); c.quadraticCurveTo(0, -6, 4, -5.6); c.quadraticCurveTo(8, -3, 11, 0); c.quadraticCurveTo(8, 3, 4, 5.6);
    c.quadraticCurveTo(0, 6, -2, 0); c.closePath(); }, C.mem, C.memD, { k: 0.9, lw: 2.2, detail: (c) => {
    c.strokeStyle = C.memD; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(9, 0); c.stroke();
  } });
  ctx.restore();
}
function tailPath(c) {
  c.moveTo(AX[0], AY[0]);
  for (let i = 1; i < TN; i++) c.quadraticCurveTo(AX[i], AY[i], (AX[i] + AX[i + 1]) / 2, (AY[i] + AY[i + 1]) / 2);
  c.lineTo(AX[TN], AY[TN]); c.lineTo(BX[TN], BY[TN]);
  for (let i = TN - 1; i > 0; i--) c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[i - 1]) / 2, (BY[i] + BY[i - 1]) / 2);
  c.lineTo(BX[0], BY[0]);
  c.closePath();
}

// -------------------------------------------------- body: sleek torso, pale belly plates, dorsal fins
const BODY = [[24, -3], [17, -11], [5, -14.5], [-9, -13], [-21, -8], [-27, -1], [-22, 7], [-8, 11], [8, 11], [20, 6]];
const bodyPath = (c) => blob(c, BODY, 0.55);
function body(ctx) {
  // small golden dorsal fins on the rump (the saddle covers the middle of the back)
  flat(ctx, (c) => {
    for (const [x, y, a, L] of [[-23, -6, -2.5, 6], [-18, -10, -2.15, 7]]) {
      const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
      c.moveTo(x + px * 3, y + py * 3); c.quadraticCurveTo(x + ux * L * 0.6 + px * 1.4, y + uy * L * 0.6 + py * 1.4, x + ux * L - px * 1.4, y + uy * L - py * 1.4);
      c.lineTo(x - px * 3, y - py * 3); c.closePath();
    }
  }, C.fin, 2);
  celR(ctx, bodyPath, C.sc, C.scD, { k: 1.5, hi: C.scH, hk: 0.4, lw: 2.8, detail: (c) => {
    c.strokeStyle = C.scL; c.lineWidth = 1.1;
    c.beginPath();
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 4; i++) {
        const x = -18 + i * 6 + r * 3, y = -6 + r * 4.4;
        c.moveTo(x + 2.4 * Math.cos(0.15 * Math.PI), y + 2.4 * Math.sin(0.15 * Math.PI));
        c.arc(x, y, 2.4, 0.15 * Math.PI, 0.85 * Math.PI);
      }
    }
    c.stroke();
    // pale belly with plate lines
    cel(c, (cc) => ellipse(cc, 3, 9, 19, 6.5, -0.12), C.bel, C.belD, { k: 1, lw: 1.8, detail: (cc) => {
      cc.strokeStyle = C.belL; cc.lineWidth = 1.1; cc.beginPath();
      for (let i = 0; i < 5; i++) { const x = -11 + i * 6.5; cc.moveTo(x, 3.5 - i * 0.6); cc.quadraticCurveTo(x + 1.6, 9, x + 0.5, 15); }
      cc.stroke();
    } });
  } }, 1.6);
}

// saddle blanket + leather saddle + girth strap (body frame, under the rider)
function saddle(ctx) {
  ctx.save(); ctx.translate(SEAT[0] + 6, SEAT[1] + 13);
  cel(ctx, (c) => { c.moveTo(-19, -10.5); c.quadraticCurveTo(-6, -16, 8, -13.5); c.lineTo(7, 4); c.quadraticCurveTo(-6, 6.5, -18, 3.5); c.closePath(); },
  K.blanket, K.blanketD, { k: 1, lw: 2.3, detail: (c) => {
    c.strokeStyle = K.trim; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-17.5, 0.5); c.quadraticCurveTo(-6, 3, 5.5, 1); c.lineTo(6, -12); c.stroke();
    c.fillStyle = K.trim; c.beginPath(); circle(c, -6, -4.5, 1.6); c.fill();
  } });
  ink(ctx, (c) => { c.moveTo(-1.5, -4); c.quadraticCurveTo(0.5, 4, -0.5, 10.5); }, 3.6);
  ink(ctx, (c) => { c.moveTo(-1.5, -4); c.quadraticCurveTo(0.5, 4, -0.5, 10.5); }, 1.8, K.lea);
  cel(ctx, (c) => { c.moveTo(-15, -12.5); c.quadraticCurveTo(-15, -18, -11, -18); c.quadraticCurveTo(-9, -14, -4, -14.5); c.quadraticCurveTo(0, -15.5, 2, -17.5);
    c.quadraticCurveTo(5, -17, 4, -13); c.quadraticCurveTo(-5, -10, -15, -12.5); c.closePath(); }, K.lea, K.leaD, { k: 0.8, hi: K.leaH, hk: 0.4, lw: 2.1 });
  ctx.restore();
}

// -------------------------------------------------- hind legs (tucked in flight, splayed when down)
function leg(ctx, p, far) {
  const dx = far ? 4 : 0, dy = far ? -2.5 : 0;
  const sc = far ? C.scF : C.sc, scd = far ? C.scFD : C.scD, claw = far ? C.hornD : C.horn;
  ctx.save();
  ctx.translate(HIP[0] + dx, HIP[1] + dy);
  ctx.rotate(-p.hl * DEG);
  // shin + foot first (behind the drumstick)
  ctx.save();
  ctx.translate(0, 10); ctx.rotate(p.hk * DEG);
  cel(ctx, (c) => { c.moveTo(-3, 0); c.lineTo(3, 0); c.lineTo(2.4, 10); c.lineTo(-2.4, 10); c.closePath(); }, sc, scd, { lw: 2.2 });
  ctx.translate(0, 10); ctx.rotate(-0.5 - p.hk * 0.6 * DEG);
  flat(ctx, (c) => {
    for (const [x, a] of [[-2.6, 0.5], [0.4, 0.1], [3.2, -0.3]]) {
      const ux = Math.sin(a), uy = Math.cos(a);
      c.moveTo(x - 1.6, 2); c.quadraticCurveTo(x + ux * 4, 2 + uy * 4, x + ux * 6.5 + 1.5, 2 + uy * 6.5); c.lineTo(x + 1.6, 2); c.closePath();
    }
  }, claw, 1.5);
  cel(ctx, (c) => ellipse(c, 0.3, 0.8, 4.6, 3.4), sc, scd, { lw: 2.1 });
  ctx.restore();
  // muscular thigh: a teardrop from the hip to the knee
  const th = (c) => { c.moveTo(0, -6.5); c.bezierCurveTo(7.5, -6, 6.5, 6, 2.6, 11); c.quadraticCurveTo(0, 13, -2.6, 11); c.bezierCurveTo(-6.5, 6, -7, -6, 0, -6.5); c.closePath(); };
  if (far) cel(ctx, th, sc, scd, { k: 1.1, lw: 2.3 });
  else cel(ctx, th, sc, scd, { k: 1.2, lw: 2.5 });
  ctx.restore();
}

// -------------------------------------------------- neck, head, collar
const NX = new Float64Array(NSEG + 1), NY = new Float64Array(NSEG + 1), NA = new Float64Array(NSEG + 1);
const NAX = new Float64Array(NSEG + 1), NAY = new Float64Array(NSEG + 1), NBX = new Float64Array(NSEG + 1), NBY = new Float64Array(NSEG + 1);
let RING_X = 0, RING_Y = 0;                // collar ring (reins), body frame
function neckPath(c) {
  c.moveTo(NAX[0], NAY[0]);
  for (let i = 1; i <= NSEG; i++) c.lineTo(NAX[i], NAY[i]);
  c.lineTo(NBX[NSEG], NBY[NSEG]);
  for (let i = NSEG - 1; i >= 0; i--) c.lineTo(NBX[i], NBY[i]);
  c.closePath();
}
function neckAndHead(ctx, p) {
  let a = -p.na * DEG, x = NECK0[0], y = NECK0[1];
  for (let i = 0; i <= NSEG; i++) {
    if (i) { a += p.nc * DEG; x += Math.cos(a) * NLEN; y += Math.sin(a) * NLEN; }
    NX[i] = x; NY[i] = y; NA[i] = a;
    const hw = lerp(8.4, 5.4, i / NSEG), nx = -Math.sin(a) * hw, ny = Math.cos(a) * hw;
    NAX[i] = x + nx; NAY[i] = y + ny; NBX[i] = x - nx; NBY[i] = y - ny;
  }
  // golden crest fins down the back of the neck (they flick with the flight)
  const fl = follow(MEM, 'wy_crest', clamp(-VZ * 2 + Math.abs(VX) * 1.2, -6, 10), 0.14, 0.75);
  flat(ctx, (c) => {
    for (let i = 1; i < NSEG; i++) {
      const aa = NA[i], hw = lerp(8.4, 5.4, i / NSEG), L = 6.5 - i * 0.6;
      const nx = Math.sin(aa), ny = -Math.cos(aa), ux = Math.cos(aa), uy = Math.sin(aa);
      const bx = NX[i] + nx * hw * 0.7, by = NY[i] + ny * hw * 0.7, back = 4 + fl * 0.3;
      c.moveTo(bx + ux * 3, by + uy * 3); c.lineTo(bx + nx * L - ux * back, by + ny * L - uy * back); c.lineTo(bx - ux * 3, by - uy * 3); c.closePath();
    }
  }, C.fin, 1.9);
  celR(ctx, neckPath, C.sc, C.scD, { k: 1.2, lw: 2.6, detail: (c) => {
    c.strokeStyle = C.bel; c.lineWidth = 5; c.beginPath();
    for (let i = 0; i <= NSEG; i++) { const xx = lerp(NX[i], NAX[i], 0.6), yy = lerp(NY[i], NAY[i], 0.6); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.stroke();
    c.strokeStyle = C.belL; c.lineWidth = 1; c.beginPath();
    for (let i = 1; i < NSEG; i++) { c.moveTo(lerp(NX[i], NAX[i], 0.3), lerp(NY[i], NAY[i], 0.3)); c.lineTo(lerp(NX[i], NAX[i], 0.92), lerp(NY[i], NAY[i], 0.92)); }
    c.stroke();
  } }, 1.3);
  // collar band round the neck base (u axis across the neck, + = throat)
  if (CUR) {
    const ca = NA[1] + Math.PI / 2, cx = lerp(NX[0], NX[1], 0.7), cy = lerp(NY[0], NY[1], 0.7);
    RING_X = cx - Math.cos(ca) * 10.5; RING_Y = cy - Math.sin(ca) * 10.5;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ca); drawCollarShape(ctx, p.crack); ctx.restore();
  }
  ctx.save();
  ctx.translate(NX[NSEG], NY[NSEG]);
  ctx.rotate(-p.head * DEG);
  head(ctx, p);
  ctx.restore();
}

// head frame: origin at the top of the neck, +x along the snout
const HEAD = [[-7, -2], [-8.5, -10], [-3, -15.5], [6, -17], [14, -14.5], [20, -10], [25, -7], [28.5, -4.5], [28.5, -1], [24, 0.6], [16, 0.9], [8, 1.6],
  [0, 2.4], [-5, 1.5]];
const JAW = [[0, 1], [9, 0.6], [17, 0.4], [24, 0.3], [25.5, 2.2], [21, 5], [12, 6.4], [5, 5.8], [-1, 3.6]];
const HINGE = [2, 1.5];
const headPath = (c) => blob(c, HEAD, 0.5);
function head(ctx, p) {
  const face = p.face;
  const jaw = p.jaw + (face === 'happy' ? 4 : 0), ja = jaw * DEG;
  // far horn, crest fin behind the skull
  horn(ctx, 4.5, -14.5, true);
  cel(ctx, (c) => { c.moveTo(-3, -8); c.lineTo(-15, -14); c.lineTo(-11, -8.5); c.lineTo(-18, -6); c.lineTo(-11, -3.5); c.lineTo(-15, 1); c.lineTo(-4, -1); c.closePath(); },
    C.fin, C.finD, { k: 0.9, lw: 2.2, detail: (c) => {
      c.strokeStyle = C.finL; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-4, -6); c.lineTo(-13, -12); c.moveTo(-4, -4); c.lineTo(-15, -5.5); c.moveTo(-4, -2); c.lineTo(-13, 0); c.stroke();
    } });
  // mouth interior + lower jaw
  if (jaw > 1) {
    const c0 = Math.cos(ja), s0 = Math.sin(ja);
    const jx = HINGE[0] + (25 - HINGE[0]) * c0 - (0.5 - HINGE[1]) * s0, jy = HINGE[1] + (25 - HINGE[0]) * s0 + (0.5 - HINGE[1]) * c0;
    ctx.beginPath(); ctx.moveTo(HINGE[0] - 2, HINGE[1] - 1); ctx.lineTo(27, -0.5); ctx.quadraticCurveTo(jx + 2, (jy - 0.5) / 2, jx, jy); ctx.closePath();
    ctx.fillStyle = C.mouth; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = C.tongue; ctx.beginPath(); ellipse(ctx, 14 + 4 * s0, 2 + 6 * s0, 7, 2, ja * 0.6); ctx.fill();
  }
  ctx.save();
  ctx.translate(HINGE[0], HINGE[1]); ctx.rotate(ja); ctx.translate(-HINGE[0], -HINGE[1]);
  cel(ctx, (c) => blob(c, JAW, 0.45), C.sc, C.scD, { k: 1.1, lw: 2.4, detail: (c) => {
    c.fillStyle = C.bel; c.beginPath(); ellipse(c, 12, 5.6, 11, 2.8, -0.03); c.fill();
  } });
  if (face === 'dizzy') flat(ctx, (c) => { c.moveTo(20, 2); c.quadraticCurveTo(28, 4, 27, 11); c.quadraticCurveTo(22, 12, 22, 5); c.closePath(); }, C.tongue, 1.7);
  ctx.restore();
  // fang
  flat(ctx, (c) => { c.moveTo(17.5, 0.6); c.lineTo(19.1, 4.6); c.lineTo(21.1, 0.5); c.closePath(); }, C.tooth, 1.5);
  celR(ctx, headPath, C.sc, C.scD, { k: 1.5, hi: C.scH, hk: 0.4, lw: 2.7, detail: (c) => {
    c.strokeStyle = C.scL; c.lineWidth = 1.1; c.beginPath();
    c.moveTo(20, -8.5); c.arc(19, -6.5, 2, -1.2, 1.2); c.moveTo(23.5, -6.4); c.arc(22.5, -4.4, 1.8, -1.2, 1.2); c.stroke();
    if (!CUR) { c.fillStyle = 'rgba(255,128,150,0.6)'; c.beginPath(); ellipse(c, 15, -1.5, 4, 2.2, 0); c.fill(); }
  } }, 1.3);
  ink(ctx, (c) => { c.moveTo(25, -6); c.quadraticCurveTo(27, -6.6, 27.6, -4.4); }, 1.8);   // nostril
  if (face === 'happy') ink(ctx, (c) => { c.moveTo(7, 1.4); c.quadraticCurveTo(2, 1.6, 0.5, -3.5); }, 2.1);
  else ink(ctx, (c) => { c.moveTo(5, 1.6); c.quadraticCurveTo(2, 3.6, 0, 3.8); }, 1.9);
  horn(ctx, 0, -12.5, false);
  eyes(ctx, p);
}
function horn(ctx, x, y, far) {
  ctx.save(); ctx.translate(x, y);
  const path = (c) => { c.moveTo(-4, 3.5); c.quadraticCurveTo(-11, -1, -23, -8.5); c.quadraticCurveTo(-8, -8.5, 6, -1); c.closePath(); };
  if (far) flat(ctx, path, C.hornD, 2.1);
  else cel(ctx, path, C.horn, C.hornD, { k: 0.8, lw: 2.2, detail: (c) => {
    c.strokeStyle = C.hornD; c.lineWidth = 1; c.beginPath(); c.moveTo(-6, -4.5); c.lineTo(-7.5, 0.5); c.moveTo(-12, -6); c.lineTo(-13, -2); c.stroke();
  } });
  ctx.restore();
}

// eyes: one big eye on the cheek (the sleek head hides the far one)
const EX = 9, EY = -8.2, ERX = 6, ERY = 6.6;
function lids(face) {   // [slant, drop]
  if (face === 'happy') return [0, -2];
  if (face === 'narrow') return [0.5, 4.2];
  return [CUR ? 0.5 : 0.16, CUR ? 2 : 0.8];
}
function eyes(ctx, p) {
  const face = p.face;
  if (face === 'ouch' || (p.blink && face !== 'dizzy')) {
    if (face === 'ouch') { flat(ctx, (c) => ellipse(c, EX, EY, ERX * 0.9, ERY * 0.9), C.eyeW, 0); ink(ctx, (c) => { c.moveTo(EX - 4.5, EY - 4.5); c.lineTo(EX + 3, EY); c.lineTo(EX - 4.5, EY + 4.5); }, 2.8); }
    else ink(ctx, (c) => { c.moveTo(EX - 4.5, EY + 1); c.quadraticCurveTo(EX, EY + 3.5, EX + 4.5, EY + 1); }, 2.2);
    brow(ctx, face === 'ouch' ? -0.3 : 0.3, face === 'ouch' ? 0 : 1);
    return;
  }
  if (face === 'dizzy') {
    flat(ctx, (c) => ellipse(c, EX, EY, ERX, ERY), C.eyeW, 2.2);
    ink(ctx, (c) => {
      for (let a = 0; a < 4 * Math.PI; a += 0.4) { const rr = 4.2 * a / (4 * Math.PI), aa = a + T * 6; a ? c.lineTo(EX + Math.cos(aa) * rr, EY + Math.sin(aa) * rr * 1.15) : c.moveTo(EX, EY); }
    }, 1.4);
    return;
  }
  const [sl, dr] = lids(face);
  eye(ctx, EX, EY, ERX, ERY, sl, dr, false);
  brow(ctx, face === 'happy' ? -0.2 : sl, face === 'happy' ? 0.2 : dr - 0.5);
  if (face === 'happy') {   // happy eye: lower lid pushed up into a smile arc
    ctx.save(); ctx.beginPath(); ellipse(ctx, EX, EY, ERX + 1.4, ERY + 1.4); ctx.clip();
    ctx.fillStyle = C.sc; ctx.beginPath(); ellipse(ctx, EX, EY + ERY + 2.6, ERX + 2, 4.2); ctx.fill();
    ctx.restore();
    ink(ctx, (c) => { c.moveTo(EX - ERX + 0.4, EY + ERY - 2.8); c.quadraticCurveTo(EX, EY + ERY - 4.8, EX + ERX - 0.4, EY + ERY - 2.8); }, 1.9);
  }
}
function eye(ctx, x, y, rx, ry, slant, drop, far) {
  const ly0 = y - ry + drop - slant * rx * 1.4, ly1 = y - ry + drop + slant * rx * 1.4;
  const x0 = x - rx - 3, x1 = x + rx + 3;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x0, ly0); ctx.lineTo(x1, ly1); ctx.lineTo(x1, y + ry + 4); ctx.lineTo(x0, y + ry + 4); ctx.closePath(); ctx.clip();
  ctx.fillStyle = CUR ? '#d9ffd0' : C.eyeW; ctx.beginPath(); ellipse(ctx, x, y, rx, ry); ctx.fill();
  ctx.save(); ctx.beginPath(); ellipse(ctx, x, y, rx, ry); ctx.clip();
  const ix = x + rx * (far ? 0.1 : 0.25), iy = y + 0.6;
  if (CUR) {
    const pl = 0.85 + 0.15 * Math.sin(T * 7);
    ctx.fillStyle = C.gemD; ctx.beginPath(); ellipse(ctx, ix, iy, rx * 0.86, ry * 0.8); ctx.fill();
    ctx.fillStyle = C.gem; ctx.beginPath(); ellipse(ctx, ix, iy, rx * 0.62 * pl, ry * 0.6 * pl); ctx.fill();
    ctx.fillStyle = C.gemC; ctx.beginPath(); ellipse(ctx, ix, iy, rx * 0.3 * pl, ry * 0.32 * pl); ctx.fill();
  } else {
    ctx.fillStyle = C.irisD; ctx.beginPath(); ellipse(ctx, ix, iy, rx * 0.72, ry * 0.68); ctx.fill();
    ctx.fillStyle = C.iris; ctx.beginPath(); ellipse(ctx, ix, iy + ry * 0.12, rx * 0.56, ry * 0.5); ctx.fill();
    ctx.fillStyle = C.pupil; ctx.beginPath(); ellipse(ctx, ix, iy, rx * 0.32, ry * 0.42); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, ix - rx * 0.3, iy - ry * 0.3, ry * 0.2); ctx.fill();
  }
  ctx.restore();
  ink(ctx, (c) => ellipse(c, x, y, rx, ry), far ? 1.9 : 2.2);
  ctx.restore();
  if (drop > -1) {
    ctx.save(); ctx.beginPath(); ellipse(ctx, x, y, rx + 1.2, ry + 1.2); ctx.clip();
    ink(ctx, (c) => { c.moveTo(x0, ly0); c.lineTo(x1, ly1); }, far ? 1.9 : 2.2);
    ctx.restore();
  }
}
function brow(ctx, ang, dy) {
  ctx.fillStyle = CUR ? C.brow : '#2a6a60';
  ctx.save(); ctx.translate(EX - 0.5, EY - ERY - 0.6 + dy); ctx.rotate(ang);
  const w = 7.4;
  ctx.beginPath(); ctx.moveTo(-w, 0.6); ctx.quadraticCurveTo(0, -3.6, w, -0.4); ctx.quadraticCurveTo(w + 1.4, 2, w - 1, 2.8);
  ctx.quadraticCurveTo(0, 1.4, -w, 3); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// -------------------------------------------------- the cursed collar (band across the neck, + u = throat)
/** The collar on its own (for the engine to drop it when the wyvern is freed): drawCollar(ctx, { scale, crack, t, rot }). */
export function drawCollar(ctx, o = {}) {
  T = o.t ?? T;
  ctx.save(); ctx.scale(o.scale || 1, o.scale || 1); if (o.rot) ctx.rotate(o.rot);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  drawCollarShape(ctx, o.crack ?? 1);
  ctx.restore();
}
function drawCollarShape(ctx, crack) {
  const L = 11, H = 3.8, B = 2;
  flat(ctx, (c) => {
    for (const [x, a, l] of [[-L - 1, Math.PI, 6.5], [-L * 0.45, -Math.PI / 2 - 0.3, 6], [L * 0.15, -Math.PI / 2 + 0.1, 6], [-L * 0.45, Math.PI / 2 + 0.3, 5]]) {
      const bow = B * (1 - (x / L) * (x / L));
      const y = a === Math.PI ? 0 : (Math.sin(a) < 0 ? -H - bow + 1 : H - bow - 1);
      const ux = Math.cos(a), uy = Math.sin(a);
      c.moveTo(x - uy * 2.6, y + ux * 2.6); c.lineTo(x + ux * l, y + uy * l); c.lineTo(x + uy * 2.6, y - ux * 2.6); c.closePath();
    }
  }, C.ironH, 1.8);
  cel(ctx, (c) => {
    c.moveTo(-L, -H); c.quadraticCurveTo(0, -H - B * 2, L, -H); c.quadraticCurveTo(L + 2.4, 0, L, H);
    c.quadraticCurveTo(0, H - B * 2, -L, H); c.quadraticCurveTo(-L - 2.4, 0, -L, -H); c.closePath();
  }, C.iron, C.ironD, { k: 0.8, hi: C.ironH, hk: 0.5, lw: 2.3, detail: (c) => {
    c.fillStyle = C.ironH; c.beginPath(); circle(c, -L * 0.25, -B * 0.9, 1.1); c.fill();
  } });
  // ring for the reins at the back of the neck
  ink(ctx, (c) => circle(c, -L + 0.5, 0, 1.8), 2.8);
  ink(ctx, (c) => circle(c, -L + 0.5, 0, 1.8), 1.1, C.ironH);
  const gx = L * 0.55, gy = -B * 0.5, pulse = 0.7 + 0.3 * Math.sin(T * 5);
  const live = 1 - 0.75 * clamp(crack, 0, 1);
  const gw = 4.8, gh = 5.8;
  if (live > 0.5) {
    ctx.fillStyle = C.glow;
    ctx.globalAlpha = 0.14 * pulse; ctx.beginPath(); circle(ctx, gx, gy, 11); ctx.fill();
    ctx.globalAlpha = 0.18 * pulse; ctx.beginPath(); circle(ctx, gx, gy, 7.5); ctx.fill();
    ctx.globalAlpha = 1;
  }
  flat(ctx, (c) => { c.moveTo(gx - gw, gy); c.lineTo(gx, gy - gh); c.lineTo(gx + gw, gy); c.lineTo(gx, gy + gh); c.closePath(); }, live > 0.5 ? C.gem : '#2f8f4a', 2);
  ctx.globalAlpha = live;
  ctx.fillStyle = C.gemD; ctx.beginPath(); ctx.moveTo(gx + gw - 1.4, gy); ctx.lineTo(gx, gy + gh - 1.6); ctx.lineTo(gx - 0.8, gy + 0.8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.gemC; ctx.beginPath(); ctx.moveTo(gx - gw + 1.6, gy - 0.3); ctx.lineTo(gx, gy - gh + 1.8); ctx.lineTo(gx + 0.8, gy - 0.8); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  if (live > 0.4) twinkle(ctx, gx + gw * 0.55, gy - gh * 0.55, 2.2 + 2 * pulse);
  if (crack > 0.05) {
    ink(ctx, (c) => {
      c.moveTo(gx - 0.5, gy - gh + 0.5); c.lineTo(gx + 1, gy - 1); c.lineTo(gx - 1.2, gy + 0.8); c.lineTo(gx + 0.5, gy + gh - 0.5);
      if (crack > 0.5) { c.moveTo(-L * 0.1, -H - B); c.lineTo(L * 0.05, -0.4); c.lineTo(-L * 0.12, H - B); }
    }, 1.3);
  }
}
function twinkle(ctx, x, y, r) {
  ctx.fillStyle = C.gemC;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.6); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r * 1.6);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r * 1.6); ctx.closePath();
  ctx.fill();
}

// -------------------------------------------------- the rider (rider units: foot-kobold px; frame origin = hips on the saddle)
// line widths are divided by RS so the ink matches the game weight after the 0.58 scale
const LW = 2.3 / RS, LWi = 1 / RS, LWs = 1.9 / RS;
const UPPER = 15, FORE = 14;
const R_SH_N = [2, -29], R_SH_F = [7, -30], R_NECK = [8, -31];
let _ex = 0, _ey = 0;
function ik(sx, sy, tx, ty, l1, l2, down) {
  const dx = tx - sx, dy = ty - sy;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.01);
  const b = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const e1x = sx + Math.cos(b + A) * l1, e1y = sy + Math.sin(b + A) * l1, e2x = sx + Math.cos(b - A) * l1, e2y = sy + Math.sin(b - A) * l1;
  if ((e1y - 0.4 * e1x >= e2y - 0.4 * e2x) === down) { _ex = e1x; _ey = e1y; } else { _ex = e2x; _ey = e2y; }
}
function limb(ctx, x0, y0, x1, y1, w0, w1, base, dark) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(-dx, dy));
  cel(ctx, (c) => { const r0 = w0 / 2, r1 = w1 / 2; c.moveTo(r0, 0); c.arc(0, 0, r0, 0, Math.PI, true); c.lineTo(-r1, L); c.arc(0, L, r1, Math.PI, 0, true); c.closePath(); },
    base, dark, { k: 1.1, lw: LWs });
  ctx.restore();
}
const tor2 = (x, y, tr) => [x * Math.cos(tr) - y * Math.sin(tr), x * Math.sin(tr) + y * Math.cos(tr)];

// mode 1 = in the saddle (reins to the collar ring), 0 = alone (riderFall)
function rider(ctx, p, mode) {
  ctx.save();
  ctx.translate(p.rx, p.ry);
  if (p.rrot) ctx.rotate(-p.rrot * DEG);
  const tr = p.rtor * DEG;
  const [snx, sny] = tor2(R_SH_N[0], R_SH_N[1], tr), [sfx, sfy] = tor2(R_SH_F[0], R_SH_F[1], tr);
  // far arm: on the reins (IK to a hand above the wyvern's neck) or flailing over the head
  let fhx, fhy, fex, fey;
  const fl = clamp(p.rf, 0, 1);
  if (fl < 0.5) {
    fhx = 17; fhy = -17;
    ik(sfx, sfy, fhx, fhy, UPPER, FORE, true); fex = _ex; fey = _ey;
  } else {
    const wv = Math.sin(T * 16) * 0.5;
    const ua = Math.PI + 0.5 + wv, fa = ua - 0.6 - wv;      // pointing up and waving
    fex = sfx - Math.sin(ua) * UPPER; fey = sfy + Math.cos(ua) * UPPER;
    fhx = fex - Math.sin(fa) * FORE; fhy = fey + Math.cos(fa) * FORE;
  }
  // reins: from the far hand to the collar ring (converted into this frame)
  if (mode === 1 && CUR && fl < 0.5) {
    let rx = (RING_X - SEAT[0]) / RS - p.rx, ry = (RING_Y - SEAT[1]) / RS - p.ry;
    if (p.rrot) [rx, ry] = tor2(rx, ry, p.rrot * DEG);
    ink(ctx, (c) => { c.moveTo(fhx, fhy); c.quadraticCurveTo((fhx + rx) / 2, Math.max(fhy, ry) + 7, rx, ry); }, 4.2);
    ink(ctx, (c) => { c.moveTo(fhx, fhy); c.quadraticCurveTo((fhx + rx) / 2, Math.max(fhy, ry) + 7, rx, ry); }, 2, K.lea);
  }
  limb(ctx, sfx, sfy, fex, fey, 7.5, 6.5, K.scD, K.scD);
  limb(ctx, fex, fey, fhx, fhy, 6.5, 6, K.scD, K.scD);
  flat(ctx, (c) => circle(c, fhx, fhy, 4.2), K.scD, LWs);
  riderTail(ctx, p);
  riderLeg(ctx, p);
  ctx.save(); ctx.rotate(tr);
  riderTorso(ctx);
  ctx.save(); ctx.translate(R_NECK[0], R_NECK[1]); ctx.rotate((p.rhd) * DEG); riderHead(ctx, p); ctx.restore();
  ctx.restore();
  // lance (unless it flew off) + near arm gripping it
  const gx = p.gx, gy = p.gy;
  if (!p.lfree) lance(ctx, p, gx, gy);
  ik(snx, sny, gx, gy, UPPER, FORE, true);
  const ex = _ex, ey = _ey;
  limb(ctx, snx, sny, ex, ey, 8, 7, K.sc, K.scD);
  limb(ctx, ex, ey, gx, gy, 7, 6.2, K.sc, K.scD);
  // leather shoulder cap
  ctx.save(); ctx.translate(snx, sny); ctx.rotate(Math.atan2(-(ex - snx), ey - sny));
  cel(ctx, (c) => { c.moveTo(-6.5, 7); c.bezierCurveTo(-8, -3, -4, -6.5, 0, -6.5); c.bezierCurveTo(4, -6.5, 8, -3, 6.5, 7); c.quadraticCurveTo(0, 9.5, -6.5, 7); c.closePath(); },
    K.lea, K.leaD, { lw: LWs, hi: K.leaH, hk: 0.4 });
  ctx.restore();
  // fist round the shaft
  ctx.save(); ctx.translate(gx, gy); ctx.rotate(-p.la * DEG);
  cel(ctx, (c) => blob(c, [[-4.5, -4.2], [1, -5.6], [5, -3.4], [5.4, 2.4], [2, 5.4], [-4, 4.6], [-5.6, 0]], 0.6), K.sc, K.scD, { k: 0.9, lw: LWs });
  ctx.fillStyle = K.claw; ctx.beginPath();
  for (const x of [-3, 0.2, 3.4]) { ctx.moveTo(x - 1.3, 4.6); ctx.lineTo(x + 0.6, 8); ctx.lineTo(x + 1.4, 4.4); }
  ctx.fill();
  ctx.restore();
  if (p.smear > 0.01 && !p.lfree) lanceSmear(ctx, p, gx, gy);
  if (p.glint > 0.02 && !p.lfree) {
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(-p.la * DEG); ctx.translate(SHAFT - BUTT + BLADE - 6, -4);
    const R = 5 + 9 * clamp(p.glint, 0, 1) * (0.8 + 0.2 * Math.sin(T * 30));
    flat(ctx, (c) => { for (let j = 0; j < 8; j++) { const rr = j % 2 ? R * 0.26 : R, aa = j * Math.PI / 4 - Math.PI / 2; j ? c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr) : c.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr); } c.closePath(); }, '#fffbe0', LWi * 1.4);
    ctx.restore();
  }
  ctx.restore();
}

function riderTail(ctx, p) {
  // hangs down the wyvern's flank behind the saddle, swaying
  const tw = Math.sin(T * 3.1) * 6, tb = follow(MEM, 'wyr_tail', p.rtb + clamp(VZ * 3, -20, 20), 0.12, 0.78);
  let x = -8, y = -2, th = Math.PI - tb * DEG;
  ctx.beginPath();
  const pts = [[x, y]];
  for (let i = 0; i < 3; i++) { th += (12 + tw * (i / 3)) * DEG; x += Math.cos(th) * 7; y += Math.sin(th) * 7; pts.push([x, y]); }
  // tapered tail as a fat stroke pair: ink, then scales, then stripes
  const path = (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); };
  ink(ctx, path, 9 + LW);
  ink(ctx, path, 9, K.sc);
  ctx.save();
  ctx.strokeStyle = K.stripe; ctx.lineWidth = 9; ctx.setLineDash([3.5, 6]); ctx.lineCap = 'butt';
  ctx.beginPath(); path(ctx); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}

function riderLeg(ctx, p) {
  // near leg astride the saddle: thigh forward-down along the flank, shin back, 3-toed foot
  ctx.save();
  ctx.translate(-1, 0);
  ctx.rotate(-p.rl * DEG);
  cel(ctx, (c) => { c.moveTo(7, 0); c.arc(0, 0, 7, 0, Math.PI, true); c.lineTo(-4.5, 16); c.arc(0, 16, 4.5, Math.PI, 0, true); c.closePath(); }, K.sc, K.scD,
    { k: 1.1, lw: LWs });
  ctx.translate(0, 16);
  ctx.rotate(-p.rk * DEG);
  cel(ctx, (c) => { c.moveTo(4.2, 0); c.arc(0, 0, 4.2, 0, Math.PI, true); c.lineTo(-3.2, 16); c.arc(0, 16, 3.2, Math.PI, 0, true); c.closePath(); }, K.sc, K.scD,
    { k: 1, lw: LWs });
  ctx.translate(0, 16);
  ctx.rotate((p.rl + p.rk - 10) * DEG);
  ctx.fillStyle = K.claw; ctx.beginPath();
  for (const [x, y] of [[10.5, -0.6], [12, 2.4]]) { ctx.moveTo(x - 1.5, y - 1.6); ctx.quadraticCurveTo(x + 3, y - 1.4, x + 4, y + 1.6); ctx.quadraticCurveTo(x + 1.5, y + 0.8, x - 1, y + 1.6); }
  ctx.fill();
  cel(ctx, (c) => { c.moveTo(-4, -3); c.quadraticCurveTo(4, -4.5, 9, -2.4); c.quadraticCurveTo(13.5, -2.4, 13.6, 0.8); c.quadraticCurveTo(14.5, 4, 11, 4.5);
    c.lineTo(-3, 4.5); c.quadraticCurveTo(-6, 3, -4, -3); c.closePath(); }, K.sc, K.scD, { k: 0.9, lw: LWs });
  ctx.restore();
}

function riderTorso(ctx) {
  flat(ctx, (c) => blob(c, [[3, -33], [11, -31], [13, -24], [8, -22], [3, -26]], 0.5), K.belly, LWs);
  cel(ctx, (c) => {
    c.moveTo(-11, 5); c.bezierCurveTo(-16, -1, -16, -17, -10, -27); c.bezierCurveTo(-6, -33, 0, -35, 5, -33);
    c.quadraticCurveTo(6, -27, 11, -24); c.bezierCurveTo(15, -18, 14, -6, 11, 3); c.quadraticCurveTo(0, 7, -11, 5); c.closePath();
  }, K.lea, K.leaD, { k: 1.4, hi: K.leaH, hk: 0.35, lw: LW, detail: (c) => {
    c.strokeStyle = K.leaD; c.lineWidth = LWi; c.beginPath(); c.moveTo(-3, -32); c.quadraticCurveTo(-7, -18, -4, 2); c.stroke();
  } });
  cel(ctx, (c) => blob(c, [[1, -24], [10, -25], [14, -15], [12, -4], [4, -4], [0, -13]], 0.55), K.iron, K.ironD, { k: 1.3, lw: LWs });
  cel(ctx, (c) => { c.moveTo(-14, -7); c.quadraticCurveTo(0, -4, 14, -8); c.lineTo(13.5, -1); c.quadraticCurveTo(0, 2.5, -14, -1); c.closePath(); },
    K.sash, K.sashD, { lw: LWs, hi: K.sashH, hk: 0.3 });
  // sash knot ends fluttering back
  const fl = Math.sin(T * 11) * 2.5;
  flat(ctx, (c) => { c.moveTo(-12, -5); c.quadraticCurveTo(-18, -4 + fl * 0.5, -24, -1 + fl); c.lineTo(-20, 1.5 + fl); c.quadraticCurveTo(-16, -1, -12, 0); c.closePath(); },
    K.sash, LWs);
}

const FACE_JAW = { mean: 3, yell: 30, ouch: 14, scared: 22 };
function riderHead(ctx, p) {
  const face = p.rface;
  flat(ctx, (c) => blob(c, [[-6, 3], [-7, -9], [-1, -17], [9, -18], [10, -6], [7, 3]], 0.5), K.sc, LWs);
  ctx.translate(6, -19);
  const jaw = FACE_JAW[face] ?? 3, ja = jaw * DEG, jc = Math.cos(ja), js = Math.sin(ja);
  if (jaw > 4) flat(ctx, (c) => { c.moveTo(-3, 3); c.lineTo(33, 2.6); c.lineTo(-4 + 34 * jc + 1.5 * js, 5 + 34 * js - 1.5 * jc); c.closePath(); }, K.mouth, 0);
  ctx.save(); ctx.translate(-4, 5); ctx.rotate(ja);
  cel(ctx, (c) => { c.moveTo(-3, -2); c.lineTo(35, -1.6); c.quadraticCurveTo(38, 2, 33, 3.6); c.quadraticCurveTo(14, 7.8, 0, 6.2); c.quadraticCurveTo(-5, 4, -3, -2); c.closePath(); },
    K.sc, K.scD, { k: 1, lw: LWs, detail: (c) => { c.fillStyle = K.belly; c.beginPath(); c.moveTo(0, 3.6); c.quadraticCurveTo(16, 3.5, 36, 1.5); c.lineTo(36, 9); c.lineTo(-4, 9); c.closePath(); c.fill(); } });
  if (jaw > 4 && face !== 'ouch') flat(ctx, (c) => ellipse(c, 15, -1.6, 9, 2.6), K.tongue, LWi);
  ctx.restore();
  cel(ctx, (c) => {
    c.moveTo(-11, 7); c.bezierCurveTo(-16, 1, -15, -10, -6, -13); c.bezierCurveTo(2, -16, 12, -11.5, 22, -9);
    c.quadraticCurveTo(33, -7, 36.5, -3.5); c.quadraticCurveTo(39.5, 0.5, 35, 3); c.lineTo(3, 4.5); c.quadraticCurveTo(-4, 9, -11, 7); c.closePath();
  }, K.sc, K.scD, { k: 1.3, hi: K.scH, hk: 0.4, lw: LW, detail: (c) => {
    c.strokeStyle = K.scL; c.lineWidth = LWi; c.beginPath(); c.moveTo(18, -8); c.arc(20, -8.4, 2.4, Math.PI, 0); c.moveTo(25, -6.5); c.arc(27, -6.8, 2.2, Math.PI, 0); c.stroke();
  } });
  // a few chunky teeth
  ctx.fillStyle = K.tooth; ctx.strokeStyle = INK; ctx.lineWidth = LWi;
  ctx.beginPath();
  for (const x of [14, 22, 30]) { const y0 = 4.4 - (x - 3) * 1.5 / 32; ctx.moveTo(x - 2.4, y0 - 0.3); ctx.lineTo(x, y0 + 4.6); ctx.lineTo(x + 2.4, y0 - 0.3); }
  ctx.fill(); ctx.stroke();
  ink(ctx, (c) => { c.moveTo(31.5, -4.5); c.quadraticCurveTo(33.5, -5, 34.5, -3.5); }, LWi * 1.4);
  if (face === 'mean') ink(ctx, (c) => { c.moveTo(4, 4.5); c.quadraticCurveTo(0.5, 5.5, -1, 7.5); }, LWi * 1.6);
  if (face === 'ouch') {
    ink(ctx, (c) => { c.moveTo(30, 5); c.quadraticCurveTo(38, 6, 40, 12); c.lineTo(38.5, 15.5); c.moveTo(40, 12); c.lineTo(42.5, 14.8); }, 6.8);
    ink(ctx, (c) => { c.moveTo(30, 5); c.quadraticCurveTo(38, 6, 40, 12); c.lineTo(38.5, 15.5); c.moveTo(40, 12); c.lineTo(42.5, 14.8); }, 3.4, K.tongue);
  }
  // frill behind the jaw
  flat(ctx, (c) => { c.moveTo(-6, -6); c.lineTo(-19, -15); c.quadraticCurveTo(-16, -8, -17, -5); c.lineTo(-25, -2); c.quadraticCurveTo(-18, 0, -17, 3);
    c.lineTo(-22, 11); c.quadraticCurveTo(-13, 7, -6, 6); c.closePath(); }, K.frill, LWs);
  riderHelmet(ctx, p);
  // eyes: far small, near big; lids for the mood
  flat(ctx, (c) => circle(c, 12.5, -14.5, 5.8), face === 'ouch' ? K.scD : K.eyeD, LWs);
  if (face !== 'ouch') { ctx.fillStyle = K.pupil; ctx.beginPath(); ellipse(ctx, 14, -14.5, 1.3, 3.6); ctx.fill(); }
  riderEye(ctx, 5.5, -13, 7.6, face, false);
  if (face === 'scared') flat(ctx, (c) => { c.moveTo(-14, -22); c.quadraticCurveTo(-10, -16, -11.5, -13.5); c.quadraticCurveTo(-14, -11.5, -16.5, -13.5); c.quadraticCurveTo(-17.5, -16, -14, -22); c.closePath(); }, K.sweat, LWi * 1.4);
}
function riderHelmet(ctx, p) {
  ctx.save(); ctx.translate(-4, -11.5); ctx.rotate(0.1);
  flat(ctx, (c) => { c.moveTo(-4, -17); c.quadraticCurveTo(-4, -25, -10, -30); c.quadraticCurveTo(-1, -27, 3, -18); c.closePath(); }, K.iron, LWs);
  cel(ctx, (c) => { c.moveTo(-14, 0); c.bezierCurveTo(-15, -14, -7, -20, 0, -20); c.bezierCurveTo(8, -20, 15, -13, 14, 0); c.closePath(); },
    K.iron, K.ironD, { k: 1.5, hi: K.ironH, hk: 0.35, lw: LW, detail: (c) => {
      c.fillStyle = K.ironD; c.fillRect(-16, -4.5, 32, 4.5);
      c.fillStyle = K.ironH; c.beginPath(); circle(c, -8, -2.2, 1.4); circle(c, 1, -2.2, 1.4); c.fill();
    } });
  flat(ctx, (c) => ellipse(c, 0, 0.5, 17.5, 3.4), K.ironD, LWs);
  flat(ctx, (c) => circle(c, 8, -12, 4.6), K.ironD, LWi * 1.6);
  flat(ctx, (c) => { c.moveTo(8, -16.5); c.lineTo(11.2, -12); c.lineTo(8, -7.5); c.lineTo(4.8, -12); c.closePath(); }, K.gem, LWi * 1.3);
  ctx.fillStyle = (p.glow || 0) > 0.5 ? '#fff' : K.gemC; ctx.beginPath(); ellipse(ctx, 7.2, -13.2, 1.3, 1.9); ctx.fill();
  ctx.restore();
}
function riderEye(ctx, x, y, r, face, far) {
  const closed = face === 'ouch';
  const big = face === 'scared' ? 1.12 : face === 'yell' ? 1.05 : 1;
  r *= big;
  flat(ctx, (c) => circle(c, x, y, r), closed ? K.sc : K.eye, 0);
  ctx.save(); ctx.beginPath(); circle(ctx, x, y, r); ctx.clip();
  if (!closed) {
    ctx.fillStyle = K.eyeD; ctx.beginPath(); circle(ctx, x + r * 0.35, y + r * 0.45, r * 0.8); ctx.fill();
    ctx.fillStyle = K.eye; ctx.beginPath(); circle(ctx, x - r * 0.12, y - r * 0.12, r * 0.86); ctx.fill();
    ctx.fillStyle = K.pupil; ctx.beginPath();
    if (face === 'scared') circle(ctx, x + r * 0.18, y, r * 0.22);
    else ellipse(ctx, x + r * 0.28, y + 0.4, r * (face === 'yell' ? 0.16 : 0.22), r * 0.66);
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, x - r * 0.36, y - r * 0.36, r * 0.22); ctx.fill();
    let l0 = null, l1 = null;
    if (face === 'mean') { l0 = -0.62; l1 = -0.05; } else if (face === 'yell') { l0 = -0.85; l1 = -0.3; }
    if (l0 !== null) {
      ctx.fillStyle = far ? K.scD : K.sc;
      ctx.beginPath(); ctx.moveTo(x - r - 1, y - r - 2); ctx.lineTo(x + r + 1, y - r - 2); ctx.lineTo(x + r + 1, y + r * l1); ctx.lineTo(x - r - 1, y + r * l0); ctx.closePath(); ctx.fill();
      ctx.restore();
      ink(ctx, (c) => { c.moveTo(x - r * 1.05, y + r * l0 - 0.3); c.lineTo(x + r * 1.05, y + r * l1 + 0.3); }, LWs);
      ctx.save();
    }
  }
  ctx.restore();
  ink(ctx, (c) => circle(c, x, y, r), LWs);
  if (closed) ink(ctx, (c) => { c.moveTo(x - r * 0.6, y - r * 0.5); c.lineTo(x + r * 0.35, y); c.lineTo(x - r * 0.6, y + r * 0.5); }, LWs);
}

// lance (rider frame): hand at (gx, gy), shaft along -la; green pennant under the blade streams back with the flight
function lance(ctx, p, gx, gy) {
  ctx.save();
  ctx.translate(gx, gy); ctx.rotate(-p.la * DEG);
  lanceShape(ctx, p);
  ctx.restore();
}
function lanceShape(ctx, p) {
  const u1 = SHAFT - BUTT;
  cel(ctx, (c) => { c.moveTo(-BUTT, -2.6); c.lineTo(u1, -2.3); c.lineTo(u1, 2.3); c.lineTo(-BUTT, 2.6); c.closePath(); }, K.wood, K.woodD, { k: 0.7, lw: LWs });
  flat(ctx, (c) => { c.moveTo(-BUTT - 4, -3.4); c.lineTo(-BUTT + 3, -3.4); c.lineTo(-BUTT + 3, 3.4); c.lineTo(-BUTT - 4, 3.4); c.closePath(); }, K.iron, LWi * 1.6);
  // vamplate (hand guard cone) just ahead of the grip
  flat(ctx, (c) => { c.moveTo(7, -3); c.lineTo(15, -8.5); c.lineTo(15, 8.5); c.lineTo(7, 3); c.closePath(); }, K.iron, LWs);
  // pennant: streams back from the socket, flutters harder with speed; hangs on the screen-down side
  const spd = Math.min(1, Math.abs(VX) / 7 + 0.35);
  const droop = follow(MEM, 'wyr_pen', 8 + 20 * (1 - spd), 0.12, 0.76);
  const tot = -(p.la + (p.rrot || 0) + (p.solo ? 0 : p.pitch + p.rot)) * DEG;
  const side = (Math.cos(tot) + 0.6 * Math.sin(tot)) >= 0 ? 1 : -1;
  const w = Math.sin(T * (10 + 8 * spd)) * (1.5 + 2 * spd), w2 = Math.sin(T * (10 + 8 * spd) - 1.3) * (1.5 + 2 * spd);
  const dr = droop * 0.35;
  ctx.save(); ctx.scale(1, side);
  cel(ctx, (c) => {
    c.moveTo(u1 - 4, 2); c.lineTo(u1 - 18, 2);
    c.quadraticCurveTo(u1 - 26, 6 + w2 + dr * 0.4, u1 - 36, 9 + w + dr);
    c.lineTo(u1 - 26, 8.5 + w2 * 0.6 + dr * 0.6); c.lineTo(u1 - 31, 15 + w + dr);
    c.quadraticCurveTo(u1 - 14, 11 + w2 * 0.5 + dr * 0.3, u1 - 4, 2);
    c.closePath();
  }, K.pen, K.penD, { k: 0.8, lw: LWs });
  ctx.restore();
  flat(ctx, (c) => blob(c, [[u1 - 4, -3.6], [u1 + 2, -3.4], [u1 + 3, 0], [u1 + 2, 3.4], [u1 - 4, 3.6]], 0.3), K.ironD, LWs);
  cel(ctx, (c) => { c.moveTo(u1 + 1, 0); c.quadraticCurveTo(u1 + 6, -6.8, u1 + 12, -4.6); c.quadraticCurveTo(u1 + 17, -2.4, u1 + BLADE, 0);
    c.quadraticCurveTo(u1 + 17, 2.4, u1 + 12, 4.6); c.quadraticCurveTo(u1 + 6, 6.8, u1 + 1, 0); c.closePath(); },
  K.blade, K.bladeD, { k: 1, hi: K.bladeH, hk: 0.5, lw: LWs });
}
function looseLance(ctx, p) {
  ctx.save(); ctx.translate(p.lx, p.ly); ctx.rotate(-p.lrot * DEG);
  lanceShape(ctx, Object.assign({}, p, { la: p.lrot, rrot: 0 }));
  ctx.restore();
}
function lanceSmear(ctx, p, gx, gy) {
  const a = clamp(p.smear, 0, 1), tip = SHAFT - BUTT + BLADE, L = 56;
  ctx.save(); ctx.translate(gx, gy); ctx.rotate(-p.la * DEG);
  ctx.globalAlpha = 0.6 * a; ctx.fillStyle = '#fffbea';
  ctx.beginPath(); ctx.moveTo(tip - 14, -5); ctx.quadraticCurveTo(tip - 30, -9, tip - 14 - L, -1.2); ctx.lineTo(tip - 14 - L, 1.2); ctx.quadraticCurveTo(tip - 30, 9, tip - 14, 5); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// -------------------------------------------------- extras
function streaks(ctx, a) {
  ctx.strokeStyle = '#f4fbff'; ctx.lineCap = 'round';
  ctx.globalAlpha = 0.7 * a;
  for (const [y, x0, L, w] of [[-16, -30, 34, 2.4], [-2, -36, 44, 3], [10, -30, 28, 2.2]]) {
    const off = ((T * 280 + y * 13) % 34 + 34) % 34;
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0 - off, y); ctx.lineTo(x0 - off - L, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function stars(ctx) {
  ctx.save();
  ctx.translate(NX[NSEG] + 8, NY[NSEG] - 26);
  for (let i = 0; i < 3; i++) {
    const a = T * 3 + i * TAU / 3, x = Math.cos(a) * 13, y = Math.sin(a) * 4;
    flat(ctx, (c) => {
      for (let j = 0; j < 10; j++) { const r = j % 2 ? 1.6 : 4, b = -Math.PI / 2 + j * Math.PI / 5; j ? c.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r) : c.moveTo(x + Math.cos(b) * r, y + Math.sin(b) * r); }
      c.closePath();
    }, '#ffe066', 1.6);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- engine-facing boxes (local px, facing right, scale 1, before z)
/** Wyvern body + lower neck hurtbox in `fly`: centre (x, y) + size; y is above the origin (add z), x mirrors with facing. */
export const HURTBOX = { x: 16, y: -26, w: 92, h: 42 };
/** The rider while seated (also hittable): centre + size. */
export const RIDER_BOX = { x: 8, y: -68, w: 36, h: 62 };
/** Boxes for any pose: { body, rider | null } (riderFall: body = a 48 x 48 box round the tumbling kobold). */
export function boxesOf(p, o = {}) {
  if (p.solo) return { body: { x: 0, y: RIDER_HIP_Y - 6, w: 48, h: 48 }, rider: null };
  bodyXf(p);
  const [bx, by] = mP(10, -3).map(Math.round);
  let rider = null;
  if ((o.rider ?? true) && p.rider !== false) { riderXf(p); mR(p.rtor * DEG); const [rx, ry] = mP(6, -40).map(Math.round); rider = { x: rx, y: ry, w: 36, h: 62 }; }
  return { body: { x: bx, y: by, w: 92, h: 42 }, rider };
}
