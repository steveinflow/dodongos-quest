// Whelp: a young Dragon Clan dragon under the Dragon King's curse (flying enemy, 2-3 at a time), and, once freed,
// a little ally.  Style guide v2: line hierarchy, occlusion tones, cool rim light, secondary motion.
//
// Cute-but-fierce baby dragon: chunky round body, big head with stubby horns and a short snout, big eyes,
// bat wings with finger bones, stubby tucked legs, long tail with an arrow tip.  Cursed: a spiked black-iron collar
// with ONE glowing green gem, eyes glowing green with no pupils, angry brows.  Freed: no collar, amber eyes, happy.
// Variants (o.variant): 'ember' (default, orange-red, kin to Dodongo's dragon arm) and 'storm' (level 3,
// Stormspire: storm-blue and white scales, lightning crackling in the eyes and along the wing edges; its spit is a
// ball of lightning: drawSpark()).
//
// Local space: origin = the point on the FLOOR under the whelp, +x = facing, y down.  The engine lifts the
// drawing by the flight height (z) itself; the body centre sits BODY_Y = -20 px above the origin (scale 1), so
// with z = 0 the belly just clears the floor (`down` and `cage` are drawn for z = 0).  While flying the tail tip
// hangs to y ~ +24, so keep z >= ~30 when hovering.  Body ~70 px nose to rump, ~110 px tip to tip with the wings
// spread; body hurtbox ~ 56 x 40 centred at (8, -26) + z.
// Time: hover / swoop / freed / allyHover take their own wing + tail phase from t; keyed poses (k) flap from o.t, so
// pass the same clock to both.  o.mem + o.vel drive the secondary motion (tail whip, ear frill, wing sweep, lean).
// Exports: MOUTH (spit, fireball spawn), ALLY_MOUTH (allyBreath, fire stream origin), mouthOf(pose), drawCollar(),
// drawSpark(ctx, t) (storm projectile), drawCage(ctx, t, broken01[, layer]).
//
// Wings are projected, not just rotated: each wing is a flat planform swung up/down about the shoulder (flap
// angle, 0 = level) and seen by a camera tilted 20 deg down, so the near wing swings low in front of the body and
// the far wing high behind it, and the bones keep a constant line weight (points are projected by hand).  The
// finger tips run a little behind the arm in the beat (overlapping action).
import { cel, flat, ink, blob, ellipse, circle, keys, mix, DEG, TAU, clamp, lerp, follow } from '../rig.js';
import { INK } from '../config.js';

const PAL = {
  ember: {
    sc: '#e65b2e', scD: '#a9361f', scH: '#ff9d5c', scL: '#b23f1d', scO: '#7a2114',
    scF: '#c4472a', scFD: '#86281a',
    bel: '#fde6b4', belD: '#e5b878', belL: '#c99a5c',
    mem: '#b3303c', memD: '#7e1c2b', memL: '#c94650', memF: '#8c2333', memFD: '#5e1422', vein: '#64121f',
    boneF: '#b8432a', horn: '#f7e5ba', hornD: '#cfa86b', brow: '#6e1f12', browFree: '#8a2a16',
    rim: '#e4ebff', blush: 'rgba(255,120,130,0.55)',
  },
  storm: {
    sc: '#4f7fd2', scD: '#2d4c97', scH: '#a9cbff', scL: '#3a62b4', scO: '#1c2f66',
    scF: '#4069b8', scFD: '#24397a',
    bel: '#f4f8ff', belD: '#c6d4f0', belL: '#9fb3db',
    mem: '#34479c', memD: '#1e2b6b', memL: '#4a5fb8', memF: '#2a3a84', memFD: '#18225a', vein: '#141d52',
    boneF: '#3c5fae', horn: '#f2f6ff', hornD: '#b8c6e6', brow: '#141f55', browFree: '#22327a',
    rim: '#f4f8ff', blush: 'rgba(255,150,190,0.5)',
  },
};
// shared
const K = {
  iron: '#3b3d47', ironD: '#1f2128', ironH: '#737885',
  gem: '#46f26c', gemD: '#0f9a3e', gemC: '#eaffdf', glow: '#5cff7e',
  bolt: '#9fe8ff', boltC: '#ffffff', boltD: '#2f7fe0',
  fire: '#ff9a2a', fireD: '#d9461a', fireC: '#fff1a6',
  eyeW: '#fffaf0', iris: '#f4a321', irisD: '#b2600d', pupil: '#2b1406',
  mouth: '#6a1826', tongue: '#f27c88', tooth: '#fffaf0', tear: '#bfe9ff',
};
let C = PAL.ember;

// ---------------------------------------------------------------- skeleton (body frame: origin = body centre)
export const BODY_Y = -20;               // body centre above the draw origin (scale 1, before the engine's z)
const NECK = [14, -10];                  // head joint
const SHOULDER = [-1, -13.5];            // wing root (near); the far wing sits a touch up/back
const TAIL_ROOT = [-14, 4];
const HIP = [-7, 7], ARM = [8, 6];
const TILT = 20 * DEG;                   // camera tilt used to project the wings
const FLAP_HZ = 4;                       // wing beats per second when the pose leaves the phase to o.t
const TAIL_HZ = 1.5;

// ---------------------------------------------------------------- poses
// pitch/head: degrees, + = nose up.  wing: mid flap angle (0 = level, + = up), flap: stroke amplitude (deg),
// sweep: wings swept back (deg), fold: 0..1 wing folding.  tb: tail droop (deg, + = down), tc: tail curl per
// segment (+ = up), tsw: tail sway.  hl / fl: hind / front leg swing (+ = forward).  ph / tp: explicit wing / tail
// phase (cycles) or null = follow o.t.  st: stretch along the body (< 1 squashes).  bob: body bob with the wing
// beat (px).  glow: fire in the mouth, fire: true = orange ally fire.  face: mean | narrow | yell | ouch | dizzy |
// happy | sad | surprised.  ear: ear-frill angle (deg, + = up).  sad: slow sad breathing (cage).
export const BASE = {
  x: 0, y: 0, rot: 0, pitch: 8, st: 1, bob: 2,
  head: -6, jaw: 0, glow: 0, fire: false,
  wing: 18, flap: 46, sweep: 0, fold: 0, ph: null,
  tb: 40, tc: 6, tsw: 5, tp: null,
  hl: 20, fl: 40, ear: 0,
  face: 'mean', free: false, crack: 0, streak: 0, stars: false, blink: false, sad: false, tear: false,
  ground: false, tailFront: false, tuck: 0,
};
const P = (o) => Object.assign({}, BASE, o);

const HOV = P({ pitch: 16, head: -14 });
// idle life shared by hover / allyHover: breathing bob, weight drift, blink, and a fidget every ~5.2 s
function hoverLife(t, p) {
  const s = Math.sin(t * 2.1);
  p.x = 1.5 * Math.sin(t * 1.3); p.pitch += 3 * s; p.head -= 3 * s;
  p.tc += 2 * Math.sin(t * 1.7); p.hl += 6 * s; p.fl -= 6 * s;
  p.blink = (t % 3.1) > 2.98;
  const u = (t % 5.2) / 5.2;
  if (u > 0.82) {   // fidget: a snorty head shake, the tail flicks, a hind foot scratches
    const v = (u - 0.82) / 0.18, e = Math.sin(v * Math.PI);
    p.head += 9 * e * Math.sin(v * TAU * 3); p.jaw += 6 * e; p.ear += 18 * e;
    p.tc += 7 * e * Math.sin(v * TAU * 2); p.hl += 40 * e; p.blink = v > 0.3 && v < 0.5;
  }
  return p;
}
export const ANIM = {
  hover(t) {
    return hoverLife(t, P({ ph: t * FLAP_HZ, tp: t * TAIL_HZ, bob: 2.6, pitch: 16, head: -14, tc: 6, hl: 18, fl: 40 }));
  },
  // a FREED whelp helping the heroes: happy hover (cursed: false)
  allyHover(t) {
    return hoverLife(t, P({ ph: t * 4.6, tp: t * 1.8, free: true, face: 'happy', bob: 3, pitch: 12, head: -6, jaw: 6, tb: 30, tc: 7,
      tsw: 6, hl: 14, fl: 50 }));
  },
  // 24 f: tucks down, then rears back with the fire gathering in the mouth (eyes on the target the whole time)
  spitWind: (k) => keys(k, [
    [0, HOV],
    [0.28, P({ x: 2, y: 2, pitch: 6, head: -24, jaw: 0, glow: 0.15, wing: 40, flap: 30, tb: 30, tc: 9, hl: 10, fl: 30, st: 1.04, ear: -10 }), 'io'],
    [0.72, P({ x: -6, y: -3, pitch: 27, head: 34, jaw: 12, glow: 0.8, wing: 34, flap: 34, tb: 36, tc: 8, hl: 32, fl: 64, st: 0.93, ear: 20 }), 'out'],
    [1, P({ x: -7, y: -4, pitch: 29, head: 37, jaw: 14, glow: 1, wing: 34, flap: 30, tb: 37, tc: 9, hl: 33, fl: 66, st: 0.92, ear: 24 })],
  ]),
  // 20 f: head SNAPS forward on frame 1 (the engine spawns the shot at MOUTH on spit k = 0), recoil, settle
  spit: (k) => keys(k, [
    [0, P({ x: -7, y: -4, pitch: 29, head: 37, jaw: 14, glow: 1, wing: 34, flap: 30, tb: 37, tc: 9, hl: 33, fl: 66, st: 0.92, ear: 24, face: 'yell' })],
    [0.08, P({ x: 5, y: 0, pitch: -10, head: -20, jaw: 50, glow: 1, wing: 12, flap: 40, tb: 4, tc: 1, hl: -4, fl: 16, st: 1.1, bob: 0, ear: -24, face: 'yell' }), 'snap'],
    [0.32, P({ x: -2, y: -1, pitch: 0, head: -10, jaw: 36, glow: 0.4, wing: 22, flap: 46, tb: 18, tc: 4, hl: 14, fl: 30, st: 0.97, bob: 0, ear: 12, face: 'yell' }), 'out'],
    [0.62, P({ x: 0, pitch: 12, head: -16, jaw: 10, glow: 0, wing: 18, flap: 46, tb: 34, tc: 6, hl: 18, fl: 40, ear: -6 })],
    [1, HOV],
  ]),
  // 26 f: pulls back and up, wings hauled high, tail coils, eyes narrow
  swoopWind: (k) => keys(k, [
    [0, HOV],
    [0.3, P({ x: -3, y: -3, pitch: 26, head: 8, wing: 60, flap: 18, tb: 20, tc: 8, tsw: 3, hl: 14, fl: 34, face: 'narrow', st: 0.95, bob: 0, ear: 16 }), 'io'],
    [0.7, P({ x: -8, y: -9, pitch: 16, head: -2, wing: 84, flap: 4, fold: 0, tb: 0, tc: 11, tsw: 1, hl: 2, fl: 22, face: 'narrow', st: 0.93, bob: 0, ear: 26 }), 'out'],
    [1, P({ x: -9, y: -10, pitch: 10, head: -8, wing: 88, flap: 3, fold: 0, tb: -4, tc: 12, tsw: 1, hl: 0, fl: 18, face: 'narrow', st: 0.92, bob: 0, ear: 28 })],
  ]),
  // the dive: wings swept back, body tilted down-forward, streamlined and stretched
  swoop: (t) => P({ ph: t * 9, tp: t * 3, pitch: -30, head: 2, wing: 16, flap: 5, sweep: 64, fold: 0.3, tb: -26, tc: -1, tsw: 3,
    hl: -50, fl: -20, st: 1.12, face: 'narrow', streak: 1, bob: 0, ear: -30 }),
  // high hit: squash on impact, flung back nose-up, wings flare, settles with an overshoot
  hurt: (k) => keys(k, [
    [0, P({ x: -6, y: 1, pitch: 22, head: 30, jaw: 14, wing: 70, flap: 6, fold: 0.1, tb: -18, tc: -8, tsw: 2, hl: 50, fl: 84,
      face: 'ouch', st: 0.84, bob: 0, ear: 40 })],
    [0.22, P({ x: -12, y: -2, pitch: 36, head: 18, jaw: 10, wing: 58, flap: 14, fold: 0.1, tb: -8, tc: -5, tsw: 3, hl: 44, fl: 70,
      face: 'ouch', st: 1.04, bob: 0, ear: -16 }), 'out'],
    [0.6, P({ x: -6, pitch: 8, head: -12, jaw: 4, wing: 26, flap: 40, tb: 42, tc: 7, face: 'mean', st: 0.98, ear: 8 })],
    [1, P({ x: -3, pitch: 14, head: -12, face: 'mean' })],
  ]),
  // low hit: knocked up from below, nose pitches down, tail whips up, wings snap down
  hurt2: (k) => keys(k, [
    [0, P({ x: -3, y: -6, pitch: -26, head: -24, jaw: 12, wing: -20, flap: 6, fold: 0.2, sweep: 20, tb: -30, tc: 8, tsw: 2, hl: -30, fl: 20,
      face: 'surprised', st: 1.12, bob: 0, ear: -36 })],
    [0.24, P({ x: -8, y: -9, pitch: -14, head: -6, jaw: 10, wing: 56, flap: 10, fold: 0.1, tb: 0, tc: 4, tsw: 3, hl: 10, fl: 50,
      face: 'ouch', st: 0.9, bob: 0, ear: 30 }), 'out'],
    [0.6, P({ x: -5, y: -2, pitch: 18, head: -10, jaw: 4, wing: 24, flap: 40, tb: 40, tc: 7, face: 'mean', st: 1.02, ear: -4 })],
    [1, P({ x: -2, pitch: 14, head: -12, face: 'mean' })],
  ]),
  // knocked out of the sky, tumbling (rot about the body centre ends upright for `down`)
  fall: (k) => {
    const p = keys(k, [
      [0, P({ pitch: 30, head: 24, jaw: 14, wing: 60, flap: 22, fold: 0.3, tb: -10, tc: -6, tsw: 10, hl: 60, fl: 90, face: 'ouch', bob: 0, ear: 40 })],
      [1, P({ pitch: 0, head: -4, jaw: 12, wing: 30, flap: 26, fold: 0.5, tb: 10, tc: -2, tsw: 12, hl: -30, fl: 80, face: 'dizzy', bob: 0, ear: -20 })],
    ]);
    p.rot = 40 + 320 * Math.pow(k, 0.8);
    return p;
  },
  // lying dazed on the ground (z = 0): wings splayed, dizzy swirl eyes
  down: P({ y: 5, pitch: -6, st: 1.12, head: -26, jaw: 16, wing: -6, flap: 0, sweep: 26, fold: 0.1, tb: -6, tc: 0.5, tsw: 1.2,
    hl: -90, fl: 95, face: 'dizzy', bob: 0, stars: true, crack: 1, ear: -30, ground: true }),
  // collar gone: happy flying with a little loop-de-loop every 2.4 s (the engine adds hearts / sparkles)
  freed(t) {
    const u = (t % 2.4) / 2.4;
    const p = P({ ph: t * 5, tp: t * 2.2, free: true, face: 'happy', pitch: 14, head: -4, jaw: 9, bob: 3, wing: 22, flap: 50,
      tb: 14, tc: 7, tsw: 8, hl: 10, fl: 50 });
    if (u < 0.4) {
      const th = TAU * (1 - Math.pow(1 - u / 0.4, 2.2));        // ease-out loop
      p.rot = th / DEG;
      p.x = 15 * Math.sin(th); p.y = -15 * (1 - Math.cos(th));
      p.tc = 9; p.flap = 30; p.wing = 30; p.ear = -30;
    } else { p.y = -3 * Math.sin((u - 0.4) / 0.6 * TAU * 2); p.blink = u > 0.9 && u < 0.93; }
    return p;
  },
  // 60 f, FREED ally: inhale, then a stream of orange fire forward for k .20-.85 (engine draws it from ALLY_MOUTH)
  allyBreath: (k) => {
    const p = keys(k, [
      [0, P({ free: true, face: 'happy', pitch: 12, head: -6, jaw: 6, tb: 30, tc: 7, hl: 14, fl: 50 })],
      [0.1, P({ free: true, face: 'happy', x: -4, y: -2, pitch: 24, head: 26, jaw: 0, wing: 40, flap: 36, tb: 40, tc: 9, hl: 30, fl: 64, st: 0.92, ear: 20 }), 'out'],
      [0.18, P({ free: true, face: 'yell', x: -5, y: -3, pitch: 26, head: 30, jaw: 4, glow: 0.4, fire: true, wing: 40, flap: 30, tb: 42, tc: 9, hl: 32, fl: 66, st: 0.9, ear: 26 })],
      [0.22, P({ free: true, face: 'yell', x: 3, pitch: -4, head: -10, jaw: 42, glow: 1, fire: true, wing: 20, flap: 50, tb: 10, tc: 3, hl: 0, fl: 24, st: 1.08, bob: 0, ear: -26 }), 'snap'],
      [0.85, P({ free: true, face: 'yell', x: 1, pitch: -2, head: -8, jaw: 40, glow: 1, fire: true, wing: 22, flap: 50, tb: 14, tc: 4, hl: 4, fl: 26, st: 1.04, bob: 0, ear: -20 })],
      [0.93, P({ free: true, face: 'happy', x: -1, pitch: 10, head: -10, jaw: 8, glow: 0.2, fire: true, tb: 30, tc: 6, ear: 10 }), 'out'],
      [1, P({ free: true, face: 'happy', pitch: 12, head: -6, jaw: 6, tb: 30, tc: 7, hl: 14, fl: 50 })],
    ]);
    if (k > 0.22 && k < 0.85) { const w = Math.sin(k * 60); p.head += 2.5 * w; p.y += 0.8 * w; }   // jaw shudders with the stream
    return p;
  },
  // curled up sad on the floor of a cage (z = 0); the engine draws drawCage() over it
  cage: P({ y: 7, pitch: -6, st: 1.04, head: -34, jaw: 0, wing: 52, flap: 0, sweep: 50, fold: 1, tuck: 1, tb: 112, tc: -9, tsw: 0.8,
    hl: 84, fl: 104, face: 'sad', bob: 0, sad: true, tear: true, ear: -40, ground: true, tailFront: true }),
};
export { mix };

// ---------------------------------------------------------------- geometry helpers for the engine
const HEAD_MOUTH = [34, -1];             // front of the mouth in the head frame (jaw-independent enough)
/** Local [x, y] of the mouth for a pose (facing right, scale 1, relative to the floor origin, before z). */
export function mouthOf(p) {
  let x = HEAD_MOUTH[0], y = HEAD_MOUTH[1] + p.jaw * 0.12;
  [x, y] = rot2(x, y, -p.head);
  x += NECK[0]; y += NECK[1];
  x *= p.st; y /= Math.sqrt(p.st);
  [x, y] = rot2(x, y, -p.pitch - p.rot);
  return [Math.round(x + p.x), Math.round(y + BODY_Y + p.y)];
}
function rot2(x, y, a) { const c = Math.cos(a * DEG), s = Math.sin(a * DEG); return [x * c - y * s, x * s + y * c]; }
/** Mouth position in the spit pose (when the fireball / ball lightning spawns, spit k = 0 .. 0.1). */
export const MOUTH = mouthOf(ANIM.spit(0.08));
/** Mouth of a freed ally in allyBreath while the fire stream runs (k .20 - .85). */
export const ALLY_MOUTH = mouthOf(ANIM.allyBreath(0.5));

// ---------------------------------------------------------------- drawing
let T = 0, STORM = false, FLOOR = 1e9, FR = 0;
const NOVEL = { x: 0, y: 0, z: 0 };

/**
 * Draw a whelp.  ctx is at the floor point under it (the engine has already lifted it by z), unscaled.
 * o: { facing: 1 | -1, t: seconds, scale, cursed: true (collar + green eyes), variant: 'ember' | 'storm', mem, vel }
 */
export function draw(ctx, pose, o = {}) {
  const f = o.facing || 1, S = o.scale || 1;
  T = o.t || 0;
  STORM = o.variant === 'storm';
  C = STORM ? PAL.storm : PAL.ember;
  const cursed = (o.cursed ?? true) && !pose.free;
  // secondary motion: forward / up speed in local terms drive lag springs (no mem = no lag)
  const mem = o.mem, vel = o.vel || NOVEL;
  const vx = (vel.x || 0) * f, vz = vel.z || 0;
  const tLag = follow(mem, 'wh_tail', clamp(vz * 6 - vx * 2.6, -34, 34), 0.1, 0.8);
  const tWhip = follow(mem, 'wh_tail2', tLag, 0.13, 0.72);
  const ear = follow(mem, 'wh_ear', pose.ear + clamp(-vx * 5 - vz * 4, -30, 30), 0.16, 0.66);
  const swAdd = follow(mem, 'wh_sweep', clamp(vx * 3.2, -8, 26), 0.14, 0.76);
  const lean = follow(mem, 'wh_lean', clamp(-vx * 2.4 + vz * 1.5, -16, 16), 0.12, 0.8);
  // wing beat: fast downstroke (first 42 %), the wing half-folds on the way up, the tips trail the arm
  const ph = pose.ph ?? T * FLAP_HZ;
  const u = ph - Math.floor(ph);
  const w = wave(u), w2 = wave((u + 0.93) % 1);
  const fa = pose.wing + pose.flap * w, fa2 = pose.wing + pose.flap * w2;
  const fold = clamp(pose.fold + (u > 0.42 ? 0.5 * Math.sin((u - 0.42) / 0.58 * Math.PI) * clamp(pose.flap / 30, 0, 1) : 0), 0, 1);
  const bobY = pose.bob * wave((u + 0.92) % 1) + (pose.sad ? Math.sin(T * 2.2) * 0.8 : 0);
  const tp = pose.tp ?? T * TAIL_HZ;
  const sadSq = pose.sad ? 1 + Math.sin(T * 2.2) * 0.02 : 1;

  ctx.save();
  ctx.scale(f * S, S);
  ctx.translate(pose.x, BODY_Y + pose.y + bobY);
  if (pose.rot) ctx.rotate(-pose.rot * DEG);
  ctx.rotate(-(pose.pitch + lean) * DEG);
  const st = pose.st * sadSq;
  if (st !== 1) ctx.scale(st, 1 / Math.sqrt(st));

  if (pose.streak > 0.01) streaks(ctx, pose.streak);
  WING.sweep = pose.sweep + swAdd; WING.tuck = pose.tuck;
  wing(ctx, fa, fa2, fold, true);
  // grounded poses keep the tail on the floor: floor distance + rotation of the body frame
  FLOOR = pose.ground ? -(BODY_Y + pose.y + bobY) : 1e9;
  FR = -(pose.pitch + lean + pose.rot) * DEG;
  if (!pose.tailFront) tail(ctx, pose, tp, tLag, tWhip);
  leg(ctx, pose, true);
  body(ctx, cursed);
  leg(ctx, pose, false);
  if (pose.tailFront) tail(ctx, pose, tp, tLag, tWhip);
  headAndNeck(ctx, pose, cursed, ear);
  wing(ctx, fa, fa2, fold, false);
  if (pose.stars) stars(ctx);
  ctx.restore();
}

function wave(u) {   // 1 = wings up, -1 = wings down; downstroke takes 42 % of the beat
  return u < 0.42 ? Math.cos(u / 0.42 * Math.PI) : -Math.cos((u - 0.42) / 0.58 * Math.PI);
}

// rim light (same recipe as Grimscale): a thin cool band just inside the ink on the upper-right (screen) side,
// away from the key light.  The outline is stroked shifted towards the lower left inside a clip, then re-inked.
function rim(ctx, path, lw, s = 1.2) {
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c;
  if (!det) return;
  const k = Math.sqrt(Math.abs(det)), wx = -0.8 * s * k, wy = 0.6 * s * k;
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  ctx.translate((m.d * wx - m.c * wy) / det, (-m.b * wx + m.a * wy) / det);
  ctx.beginPath(); path(ctx);
  ctx.lineWidth = s * 2 + lw * 0.25; ctx.lineJoin = 'round'; ctx.strokeStyle = C.rim; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); path(ctx); ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
}
function celR(ctx, path, base, dark, o, s) { cel(ctx, path, base, dark, o); rim(ctx, path, o.lw ?? 3, s); }

// cheap repeatable noise for the lightning crackle
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
// a jagged bolt from (x0,y0) to (x1,y1) added to the current path
function bolt(c, x0, y0, x1, y1, seed, amp, n = 5) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  c.moveTo(x0, y0);
  for (let i = 1; i < n; i++) { const u = i / n, o = (hash(seed + i * 7.3) - 0.5) * 2 * amp; c.lineTo(x0 + dx * u + nx * o, y0 + dy * u + ny * o); }
  c.lineTo(x1, y1);
}
function boltStroke(ctx, path, w) {   // electric line: cyan glow + white core
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.55; ctx.strokeStyle = K.bolt; ctx.lineWidth = w * 2.6; ctx.beginPath(); path(ctx); ctx.stroke();
  ctx.globalAlpha = 1; ctx.strokeStyle = K.boltC; ctx.lineWidth = w; ctx.beginPath(); path(ctx); ctx.stroke();
}

// -------------------------------------------------- wings
// planform points (u = forward along the chord, v = out along the span): shoulder, elbow, wrist, thumb, 3 finger
// tips, trailing root.  Spread and folded sets are blended by `fold`.
const WS = [0, 0, 8, 15, 1, 29, 8, 31, -3, 58, -20, 51, -33, 35, -18, 4];
const WF = [0, 0, 6, 12, -2, 23, 4, 25, -18, 41, -25, 35, -28, 24, -15, 4];
const WP = new Float64Array(16);
const WING = { sweep: 0, tuck: 0 };

function wing(ctx, fa, fa2, fold, far) {
  const s = Math.sin(fa * DEG + (far ? TILT : -TILT));           // projected span direction (+ = up on screen)
  const s2 = Math.sin(fa2 * DEG + (far ? TILT : -TILT));         // finger tips trail the arm
  const k = (far ? 0.98 : 1.1) * (1 - 0.42 * WING.tuck);           // a hint of perspective; tucked = folded tight
  const sw = (WING.sweep + (far ? 4 : 0)) * DEG, cs = Math.cos(sw), sn = Math.sin(sw);
  const ox = SHOULDER[0] + (far ? 3 : 0), oy = SHOULDER[1] - (far ? 2.5 : 0);
  for (let i = 0; i < 16; i += 2) {
    const uu = lerp(WS[i], WF[i], fold) * k, vv = lerp(WS[i + 1], WF[i + 1], fold) * k;
    const tip = i >= 8 && i <= 12;
    WP[i] = ox + uu * cs - vv * sn;
    WP[i + 1] = oy - (uu * sn + vv * cs) * (tip ? s2 : s);
  }
  if (far) cel(ctx, membrane, C.memF, C.memFD, { k: 1.3, lw: 2.6 });
  else celR(ctx, membrane, C.mem, C.memD, { k: 1.3, lw: 2.6, detail: memDetail }, 1.1);
  if (STORM) wingCrackle(ctx, far);
  // bones over the membrane: arm along the leading edge, then the three fingers (thinner: line hierarchy)
  const bc = far ? C.boneF : C.sc;
  ink(ctx, armPath, 5.4);
  ink(ctx, fingerPath, 3.2);
  ink(ctx, armPath, 2.8, bc);
  ink(ctx, fingerPath, 1.3, bc);
  // knuckle + thumb claw
  flat(ctx, (c) => {
    const x = WP[4], y = WP[5], dx = WP[6] - x, dy = WP[7] - y;
    c.moveTo(x - dy * 0.25, y + dx * 0.25); c.quadraticCurveTo(x + dx * 0.7, y + dy * 0.7, x + dx * 1.15, y + dy * 1.15);
    c.lineTo(x + dy * 0.25, y - dx * 0.25); c.closePath();
  }, far ? C.hornD : C.horn, 1.8);
  flat(ctx, (c) => circle(c, WP[4], WP[5], 2.4), bc, 1.8);
}
function membrane(c) {
  c.moveTo(WP[0], WP[1]); c.lineTo(WP[2], WP[3]); c.lineTo(WP[4], WP[5]); c.lineTo(WP[8], WP[9]);
  scallop(c, 8, 10, 0.3); scallop(c, 10, 12, 0.3); scallop(c, 12, 14, 0.22);
  c.lineTo(WP[0], WP[1]);
  c.closePath();
}
function scallop(c, a, b, d) {
  const mx = (WP[a] + WP[b]) / 2, my = (WP[a + 1] + WP[b + 1]) / 2;
  c.quadraticCurveTo(mx + (WP[4] - mx) * d, my + (WP[5] - my) * d, WP[b], WP[b + 1]);
}
function armPath(c) { c.moveTo(WP[0], WP[1]); c.lineTo(WP[2], WP[3]); c.lineTo(WP[4], WP[5]); }
function fingerPath(c) {
  for (const i of [8, 10, 12]) {
    c.moveTo(WP[4], WP[5]);
    c.lineTo(lerp(WP[4], WP[i], 0.97), lerp(WP[5], WP[i + 1], 0.97));
  }
}
// membrane: a lighter, thinner panel between the first two fingers, branching veins, a darker scallop hem
function memDetail(c) {
  c.fillStyle = C.memL; c.globalAlpha = 0.75;
  c.beginPath(); c.moveTo(WP[4], WP[5]); c.lineTo(lerp(WP[4], WP[8], 0.94), lerp(WP[5], WP[9], 0.94));
  scallop(c, 8, 10, 0.34); c.closePath(); c.fill();
  c.globalAlpha = 1;
  c.strokeStyle = C.vein; c.lineWidth = 1.1; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  for (const i of [8, 10, 12]) {
    const j = i + 2;
    const mx = (WP[i] + WP[j]) / 2, my = (WP[i + 1] + WP[j + 1]) / 2;
    const ax = lerp(WP[4], mx, 0.22), ay = lerp(WP[5], my, 0.22), bx = lerp(WP[4], mx, 0.6), by = lerp(WP[5], my, 0.6);
    c.moveTo(ax, ay); c.lineTo(bx, by);
    c.lineTo(lerp(bx, WP[i], 0.32), lerp(by, WP[i + 1], 0.32));       // fork towards each finger
    c.moveTo(bx, by); c.lineTo(lerp(bx, WP[j], 0.28), lerp(by, WP[j + 1], 0.28));
  }
  c.stroke();
  c.strokeStyle = C.memD; c.lineWidth = 2.2; c.globalAlpha = 0.6;
  c.beginPath(); c.moveTo(WP[8], WP[9]); scallop(c, 8, 10, 0.3); scallop(c, 10, 12, 0.3); c.stroke();
  c.globalAlpha = 1;
}
// storm whelp: lightning crackling along the trailing edge (flickers, 2 of 3 scallops lit at a time)
function wingCrackle(ctx, far) {
  const fr = Math.floor(T * 18), skip = fr % 3;
  boltStroke(ctx, (c) => {
    for (let n = 0; n < 3; n++) {
      if (n === skip) continue;
      const a = 8 + n * 2, b = a + 2;
      bolt(c, WP[a], WP[a + 1], WP[b], WP[b + 1], fr * 3.1 + n + (far ? 50 : 0), 2.6, 4);
    }
  }, far ? 0.8 : 1.1);
}

// -------------------------------------------------- tail (spine of segments, tapered, arrow tip)
const TN = 8, TSEG = 5.9;
const SX = new Float64Array(TN + 1), SY = new Float64Array(TN + 1), SA = new Float64Array(TN + 1);
const AX = new Float64Array(TN + 1), AY = new Float64Array(TN + 1), BX = new Float64Array(TN + 1), BY = new Float64Array(TN + 1);

function tail(ctx, p, tp, lag, whip) {
  let a = Math.PI - (p.tb + lag) * DEG, x = TAIL_ROOT[0], y = TAIL_ROOT[1];
  for (let i = 0; i <= TN; i++) {
    const hw = lerp(7, 2.1, i / TN);
    if (i) {
      a += (p.tc + p.tsw * Math.sin(tp * TAU - i * 0.75) + (whip - lag) * 0.22) * DEG;
      x += Math.cos(a) * TSEG; y += Math.sin(a) * TSEG;
      if (FLOOR < 1e8) {   // slide along the floor instead of through it
        const sR = Math.sin(FR), cR = Math.cos(FR), Y = x * sR + y * cR, lim = FLOOR - hw - 0.5;
        if (Y > lim) { x -= (Y - lim) * sR; y -= (Y - lim) * cR; a = Math.atan2(y - SY[i - 1], x - SX[i - 1]); }
      }
    }
    SX[i] = x; SY[i] = y; SA[i] = a;
    const nx = -Math.sin(a) * hw, ny = Math.cos(a) * hw;
    AX[i] = x + nx; AY[i] = y + ny; BX[i] = x - nx; BY[i] = y - ny;
  }
  // dorsal spikes on the upper side (A side when the tail points back)
  flat(ctx, (c) => {
    for (let i = 1; i <= 5; i++) {
      const sa = SA[i], hw = lerp(7, 2.1, i / TN), L = 5.8 - i * 0.6, up = Math.cos(sa) > 0.2 ? -1 : 1;
      const nx = -Math.sin(sa) * up, ny = Math.cos(sa) * up, ux = Math.cos(sa), uy = Math.sin(sa);
      const bx = SX[i] + nx * hw * 0.7, by = SY[i] + ny * hw * 0.7;
      c.moveTo(bx - ux * 2.6, by - uy * 2.6);
      c.lineTo(bx + nx * L - ux * 2.2, by + ny * L - uy * 2.2);
      c.lineTo(bx + ux * 2.6, by + uy * 2.6);
      c.closePath();
    }
  }, C.horn, 1.8);
  celR(ctx, tailPath, C.sc, C.scD, { k: 1.2, lw: 2.8, detail: tailDetail }, 1);
  // arrow tip
  ctx.save();
  ctx.translate(SX[TN], SY[TN]); ctx.rotate(SA[TN]);
  cel(ctx, arrowPath, C.mem, C.memD, { k: 0.9, lw: 2.5 });
  if (STORM && (Math.floor(T * 18) % 4) !== 0) boltStroke(ctx, (c) => bolt(c, 1, -6, 12, 0, Math.floor(T * 18) + 9, 1.6, 3), 0.9);
  ctx.restore();
}
function arrowPath(c) { c.moveTo(-3, 0); c.lineTo(1, -6.5); c.quadraticCurveTo(6, -4, 12, 0); c.quadraticCurveTo(6, 4, 1, 6.5); c.closePath(); }
function tailPath(c) {
  c.moveTo(AX[0], AY[0]);
  for (let i = 1; i < TN; i++) c.quadraticCurveTo(AX[i], AY[i], (AX[i] + AX[i + 1]) / 2, (AY[i] + AY[i + 1]) / 2);
  c.lineTo(AX[TN], AY[TN]);
  c.lineTo(BX[TN], BY[TN]);
  for (let i = TN - 1; i > 0; i--) c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[i - 1]) / 2, (BY[i] + BY[i - 1]) / 2);
  c.lineTo(BX[0], BY[0]);
  c.closePath();
}
function tailDetail(c) {   // cream underside stripe + scale bands
  c.strokeStyle = C.bel; c.lineWidth = 3.2; c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i < TN; i++) {
    const t = 0.55, fw = Math.cos(SA[i]) > 0.2, x = lerp(SX[i], fw ? AX[i] : BX[i], t), y = lerp(SY[i], fw ? AY[i] : BY[i], t);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.stroke();
  c.strokeStyle = C.scL; c.lineWidth = 1.1; c.beginPath();
  for (let i = 1; i < TN - 1; i++) { c.moveTo(lerp(SX[i], AX[i], 0.85), lerp(SY[i], AY[i], 0.85)); c.lineTo(lerp(SX[i], BX[i], 0.2), lerp(SY[i], BY[i], 0.2)); }
  c.stroke();
}

// -------------------------------------------------- body
const BODY = [[17, -3], [11, -12], [0, -16], [-11, -13.5], [-18, -5], [-17.5, 5], [-10, 12], [2, 14.5], [13, 9.5]];
function bodyPath(c) { blob(c, BODY, 0.55); }
function body(ctx, cursed) {
  // back spikes (behind the body outline)
  flat(ctx, (c) => {
    for (const [x, y, a, L] of [[-13, -11, -2.3, 6.5], [-5, -14.8, -1.9, 7.5], [3, -15.2, -1.55, 6.5]]) {
      const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
      c.moveTo(x + px * 3.4, y + py * 3.4); c.quadraticCurveTo(x + ux * L * 0.6 + px * 1.5, y + uy * L * 0.6 + py * 1.5,
        x + ux * L - px * 1.6, y + uy * L - py * 1.6); c.lineTo(x - px * 3.2, y - py * 3.2); c.closePath();
    }
  }, C.horn, 2);
  celR(ctx, bodyPath, C.sc, C.scD, { k: 1.5, hi: C.scH, hk: 0.4, lw: 3, detail: (c) => {
    // occlusion: under the wing root and behind the haunch, under the collar
    c.fillStyle = C.scO; c.globalAlpha = 0.55;
    c.beginPath(); ellipse(c, -2, -10.5, 9, 3.6, -0.15); ellipse(c, -9, 9, 7, 5, 0.5); c.fill();
    if (cursed) { c.beginPath(); ellipse(c, 11, -4, 6, 3.4, 0.9); c.fill(); }
    c.globalAlpha = 1;
    // scale texture on the back (thin, local dark tone)
    c.strokeStyle = C.scL; c.lineWidth = 1.1; c.lineCap = 'round';
    c.beginPath();
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 5 - r; i++) {
        const x = -13 + i * 5.2 + r * 2.6, y = -9 + r * 4;
        c.moveTo(x + 2.3 * Math.cos(0.15 * Math.PI), y + 2.3 * Math.sin(0.15 * Math.PI));
        c.arc(x, y, 2.3, 0.15 * Math.PI, 0.85 * Math.PI);
      }
    }
    c.stroke();
    // cream belly with plate lines
    cel(c, (cc) => ellipse(cc, 7, 6, 12.5, 10.5, -0.45), C.bel, C.belD, { k: 1.1, lw: 1.6, detail: (cc) => {
      cc.strokeStyle = C.belL; cc.lineWidth = 1.2; cc.beginPath();
      for (let i = 0; i < 4; i++) { const y = -1 + i * 4.2; cc.moveTo(-2 + i * 1.6, y + 6); cc.quadraticCurveTo(6 + i, y + 8.5, 16, y + 1); }
      cc.stroke();
    } });
  } }, 1.2);
}

// -------------------------------------------------- legs (stubby, tucked)
function leg(ctx, p, far) {
  const dx = far ? 4 : 0, dy = far ? -2 : 0;
  const sc = far ? C.scF : C.sc, scd = far ? C.scFD : C.scD;
  const claw = far ? C.hornD : C.horn;
  // hind leg: round haunch with the foot tucked right under it
  ctx.save();
  ctx.translate(HIP[0] + dx, HIP[1] + dy);
  ctx.rotate(-p.hl * DEG);
  ctx.save(); ctx.translate(0, 9); ctx.rotate(0.35 + p.hl * 0.35 * DEG); foot(ctx, claw, sc, scd, 1); ctx.restore();
  if (!far) cel(ctx, (c) => ellipse(c, 0, 1.5, 7.6, 8.6), sc, scd, { k: 1.2, lw: 2.6, detail: (c) => {
    c.strokeStyle = C.scL; c.lineWidth = 1.1; c.beginPath(); c.arc(1, 2, 4.6, 0.4, 2.2); c.stroke();
  } });
  ctx.restore();
  // front leg: little arm tucked to the chest
  ctx.save();
  ctx.translate(ARM[0] + dx, ARM[1] + dy);
  ctx.rotate(-p.fl * DEG);
  cel(ctx, (c) => { c.moveTo(-3.6, -2); c.quadraticCurveTo(0, -4.5, 3.6, -2); c.lineTo(3, 8); c.lineTo(-3, 8); c.closePath(); }, sc, scd, { lw: 2.4 });
  ctx.translate(0, 8);
  ctx.rotate(-0.9);
  foot(ctx, claw, sc, scd, 0.8);
  ctx.restore();
}
function foot(ctx, claw, sc, scd, k) {
  flat(ctx, (c) => {
    for (const [x, a] of [[-2.8 * k, 0.45], [0.4 * k, 0.1], [3.4 * k, -0.3]]) {
      const ux = Math.sin(a), uy = Math.cos(a);
      c.moveTo(x - 1.7, 2.5 * k); c.lineTo(x + ux * 6 * k, 2.5 * k + uy * 6 * k); c.lineTo(x + 1.7, 2.5 * k); c.closePath();
    }
  }, claw, 1.5);
  cel(ctx, (c) => ellipse(c, 0.4, 1, 5.2 * k, 4 * k), sc, scd, { lw: 2.3 });
}

// -------------------------------------------------- head
const HEAD = [[-8, -6], [-10.5, -17], [-4.5, -27.5], [7, -31], [16.5, -27.5], [21.5, -20.5], [27, -17.5], [32, -13.5], [34, -8],
  [31.5, -3], [22, -1.6], [12, -1], [3, 0.5], [-4, -0.5]];
const JAW = [[1, -2], [10, -1.4], [20, -1.4], [29.5, -2.4], [30.5, 0.8], [25, 4.8], [13, 6.8], [4, 6.2], [-1, 2]];
const HINGE = [5, -2];
function headPath(c) { blob(c, HEAD, 0.5); }
function neckPath(c) { c.moveTo(4, -12); c.quadraticCurveTo(9, -19, 15, -15); c.lineTo(19, -3); c.quadraticCurveTo(12, 2, 7, -1); c.closePath(); }

function headAndNeck(ctx, p, cursed, ear) {
  // neck: thick and short, cream throat, occlusion under the jaw
  celR(ctx, neckPath, C.sc, C.scD, { k: 1.2, lw: 2.8, detail: (c) => {
    c.fillStyle = C.bel; c.beginPath(); ellipse(c, 16, -5, 4.5, 7, -0.3); c.fill();
    c.fillStyle = C.scO; c.globalAlpha = 0.6; c.beginPath(); ellipse(c, 14, -11.5, 7, 3, -0.6); c.fill(); c.globalAlpha = 1;
  } }, 1);
  ctx.save();
  ctx.translate(NECK[0], NECK[1]);
  ctx.rotate(-p.head * DEG);
  const happy = p.face === 'happy';
  // far horn + ear frill (behind the skull); the frill is on a spring (o.mem) and flutters with the face
  horn(ctx, 10, -28.5, 0.2, true);
  ctx.save();
  ctx.translate(-4, -15); ctx.rotate(-ear * DEG * 0.7);
  cel(ctx, frillPath, C.mem, C.memD, { lw: 2.4, detail: (c) => {
    c.strokeStyle = C.vein; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -1); c.lineTo(-11, -7); c.moveTo(0, 1); c.lineTo(-12, 1.5); c.stroke();
  } });
  ctx.restore();
  // mouth interior + lower jaw (behind the upper head)
  const ja = p.jaw * DEG;
  if (p.jaw > 0.5) mouthInside(ctx, p, ja);
  ctx.save();
  ctx.translate(HINGE[0], HINGE[1]); ctx.rotate(ja); ctx.translate(-HINGE[0], -HINGE[1]);
  cel(ctx, (c) => blob(c, JAW, 0.45), C.sc, C.scD, { k: 1.1, lw: 2.6, detail: (c) => {
    c.fillStyle = C.bel; c.beginPath(); ellipse(c, 14, 5.5, 13, 3.2, -0.04); c.fill();
  } });
  if (p.face === 'dizzy') flat(ctx, (c) => { c.moveTo(20, 0); c.quadraticCurveTo(29, 2, 28, 10); c.quadraticCurveTo(23, 12, 22, 4); c.closePath(); }, K.tongue, 1.8);
  ctx.restore();
  // fang poking down over the jaw
  flat(ctx, (c) => { c.moveTo(22, -2); c.lineTo(23.6, 3 + (p.jaw > 8 ? 0.6 : 0)); c.lineTo(25.8, -2); c.closePath(); }, K.tooth, 1.5);
  farEye(ctx, p, cursed);
  // upper head
  celR(ctx, headPath, C.sc, C.scD, { k: 1.5, hi: C.scH, hk: 0.4, lw: 3, detail: (c) => {
    // brow-ridge occlusion, snout scales, a few crown scales
    c.fillStyle = C.scO; c.globalAlpha = 0.45; c.beginPath(); ellipse(c, 12, -24.5, 9, 2.6, 0.12); c.fill(); c.globalAlpha = 1;
    c.strokeStyle = C.scL; c.lineWidth = 1.1; c.lineCap = 'round';
    c.beginPath(); c.moveTo(24.6, -10.5); c.arc(24, -8.5, 2.1, -1.2, 1.2); c.moveTo(28.6, -7.5); c.arc(28, -5.5, 2.1, -1.2, 1.2);
    for (const [x, y] of [[-2, -22], [3, -26.5], [-5.5, -14]]) { c.moveTo(x + 2.2 * Math.cos(0.45), y + 2.2 * Math.sin(0.45)); c.arc(x, y, 2.2, 0.45, 2.7); }
    c.stroke();
    if (happy || !cursed) { c.fillStyle = C.blush; c.beginPath(); ellipse(c, 16, -5, 4.8, 2.7, 0); c.fill(); }
  } }, 1.1);
  // nostril
  ink(ctx, (c) => { c.moveTo(30.4, -12); c.quadraticCurveTo(32.6, -12.6, 33, -10.2); }, 1.8);
  // mouth corner
  if (happy) ink(ctx, (c) => { c.moveTo(6, -1.2); c.quadraticCurveTo(1, -1, 0, -6); }, 2);
  else if (p.face === 'sad') ink(ctx, (c) => { c.moveTo(6, -1); c.quadraticCurveTo(1.5, -0.5, 0, 3); }, 2);
  else ink(ctx, (c) => { c.moveTo(4, -1); c.quadraticCurveTo(1.5, 1.5, -0.5, 2); }, 1.8);
  // near horn
  horn(ctx, 2, -26.5, -0.15, false);
  eyes(ctx, p, cursed);
  if (p.glow > 0.02) mouthGlow(ctx, p, ja);
  ctx.restore();
  if (cursed) collar(ctx, p);
}
function frillPath(c) { c.moveTo(0, -4); c.lineTo(-12, -9); c.lineTo(-8.5, -3.5); c.lineTo(-14, 0); c.lineTo(-8, 1.5); c.lineTo(-11, 6); c.lineTo(0, 4); c.closePath(); }

function horn(ctx, x, y, a, far) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  cel(ctx, (c) => { c.moveTo(-4, 1.5); c.quadraticCurveTo(-3.5, -6, -9.5, -11); c.quadraticCurveTo(-1, -10, 4.2, 1.5); c.closePath(); },
    far ? C.hornD : C.horn, C.hornD, { k: 0.9, lw: 2.4, detail: far ? null : (c) => {
      c.strokeStyle = C.hornD; c.lineWidth = 1; c.beginPath(); c.moveTo(-3.6, -3); c.lineTo(1.8, -2.4); c.moveTo(-5.5, -6.5); c.lineTo(-1.2, -6.2); c.stroke();
    } });
  ctx.restore();
}

// mouth fire colours: cursed = green, storm = electric, ally = orange
function fireCols(p) { return p.fire ? [K.fireD, K.fire, K.fireC] : STORM ? [K.boltD, K.bolt, K.boltC] : [K.gemD, K.gem, K.gemC]; }
function mouthInside(ctx, p, ja) {
  const c0 = Math.cos(ja), s0 = Math.sin(ja);
  const jx = HINGE[0] + (30.5 - HINGE[0]) * c0 - (-0.5 - HINGE[1]) * s0, jy = HINGE[1] + (30.5 - HINGE[0]) * s0 + (-0.5 - HINGE[1]) * c0;
  ctx.beginPath();
  ctx.moveTo(HINGE[0] - 2, HINGE[1]); ctx.lineTo(32.5, -3); ctx.quadraticCurveTo(jx + 3, (jy - 3) / 2, jx, jy); ctx.closePath();
  const g = clamp(p.glow, 0, 1), [d, m, hot] = fireCols(p);
  ctx.fillStyle = g > 0.3 ? d : K.mouth; ctx.fill();
  ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  if (g > 0.3) {
    ctx.save(); ctx.clip();
    const my = (jy - 2) / 2, fl = 0.9 + 0.1 * Math.sin(T * 29);
    ctx.fillStyle = m; ctx.beginPath(); ellipse(ctx, 20, my, 13 * g * fl, (3 + p.jaw * 0.14) * g, ja * 0.5); ctx.fill();
    ctx.fillStyle = hot; ctx.beginPath(); ellipse(ctx, 23, my, 7 * g * fl, (1.4 + p.jaw * 0.07) * g, ja * 0.5); ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = K.tongue; ctx.beginPath(); ellipse(ctx, 14 + 4 * s0, 1 + 6 * s0, 7, 2.4, ja * 0.6); ctx.fill();
  }
}
function mouthGlow(ctx, p, ja) {   // fire licking out of the mouth (opaque flames, no muddy wash)
  const g = clamp(p.glow, 0, 1), [, m, hot] = fireCols(p);
  const mx = 32.5, my = -2 + p.jaw * 0.16;
  ctx.save();
  ctx.translate(mx, my); ctx.rotate(ja * 0.45);
  if (STORM && !p.fire) {   // a crackling ball of lightning forms in the mouth
    const r = 2.5 + 3.5 * g, fr = Math.floor(T * 20);
    ctx.globalAlpha = 0.5; ctx.fillStyle = m; ctx.beginPath(); circle(ctx, 2, 0, r + 2.5); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = hot; ctx.beginPath(); circle(ctx, 2, 0, r * 0.6); ctx.fill();
    boltStroke(ctx, (c) => { for (let i = 0; i < 3; i++) { const a = hash(fr + i) * TAU; bolt(c, 2, 0, 2 + Math.cos(a) * (r + 5), Math.sin(a) * (r + 5), fr * 5 + i, 1.4, 3); } }, 0.8);
  } else {
    for (let i = 0; i < 3; i++) {
      const ph = T * 13 + i * 2.1, L = (5 + 4 * g) * (0.75 + 0.25 * Math.sin(ph)), off = (i - 1) * 2.6 * g;
      flat(ctx, (c) => { c.moveTo(-1, off - 2.2 * g); c.quadraticCurveTo(L * 0.6, off - 2.6 * g + Math.sin(ph) * 1.5, L, off + Math.sin(ph * 1.3) * 1.2);
        c.quadraticCurveTo(L * 0.5, off + 2.4 * g, -1, off + 2.2 * g); c.closePath(); }, i === 1 ? hot : m, 0);
    }
  }
  ctx.restore();
  // sparks
  ctx.fillStyle = hot; ctx.globalAlpha = g;
  for (let i = 0; i < 2; i++) {
    const a = T * 7 + i * 2.6, r = 7 + 3 * Math.sin(T * 11 + i);
    ctx.beginPath(); circle(ctx, mx + 2 + Math.cos(a) * r, my + Math.sin(a) * r * 0.7, 1.2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// -------------------------------------------------- eyes
// near eye big on the side of the head; the far eye bulges over the snout bridge (drawn before the head so the
// head covers its lower half)
const EX = 11.5, EY = -15, ERX = 7, ERY = 8.2;
const FX = 24.6, FY = -20.2, FRX = 3.3, FRY = 5.2;
// lid slant (+ = angry, low at the front; - = sad / worried) and drop from the top of the eye
function eyeLook(p, cursed) {
  switch (p.face) {
    case 'happy': return [0, -2];
    case 'sad': return [-0.48, 4.4];
    case 'surprised': return [0, -3];
    case 'narrow': return [0.5, 5.8];
    case 'yell': return [cursed ? 0.55 : 0.3, cursed ? 2.6 : 1.2];
    default: return cursed ? [0.5, 2.2] : [0.18, 0.8];
  }
}
function farEye(ctx, p, cursed) {
  const face = p.face;
  if (face === 'ouch' || face === 'dizzy' || p.blink) {
    flat(ctx, (c) => ellipse(c, FX, FY + 1, FRX, FRY - 1), C.sc, 2.2);
    return;
  }
  const [slant, drop] = eyeLook(p, cursed);
  eye(ctx, FX, FY, FRX, FRY, slant * 1.1, drop * 0.8, cursed, true, face);
}
function eyes(ctx, p, cursed) {
  const face = p.face;
  if (face === 'ouch' || (p.blink && face !== 'dizzy')) {
    if (face === 'ouch') {
      ink(ctx, (c) => { c.moveTo(EX - 5, EY - 4.5); c.lineTo(EX + 3, EY); c.lineTo(EX - 5, EY + 4.5); }, 2.5);
      ink(ctx, (c) => { c.moveTo(FX + 2.5, FY - 1); c.lineTo(FX - 1, FY + 1.5); }, 2.2);
    } else {
      ink(ctx, (c) => { c.moveTo(EX - 5.5, EY + 1); c.quadraticCurveTo(EX, EY + 4, EX + 5.5, EY + 1); }, 2.4);
    }
    brows(ctx, face === 'ouch' ? -0.22 : 0.3, face === 'ouch' ? 0.5 : 1, cursed, false);
    return;
  }
  if (face === 'dizzy') {
    flat(ctx, (c) => ellipse(c, EX, EY, ERX, ERY), K.eyeW, 2.3);
    ink(ctx, (c) => {
      for (let a = 0; a < 4 * Math.PI; a += 0.35) {
        const rr = 5.2 * a / (4 * Math.PI), aa = a + T * 6;
        a ? c.lineTo(EX + Math.cos(aa) * rr, EY + Math.sin(aa) * rr * 1.15) : c.moveTo(EX, EY);
      }
    }, 1.5);
    brows(ctx, -0.3, -2, cursed, false);
    return;
  }
  const [slant, drop] = eyeLook(p, cursed);
  eye(ctx, EX, EY, ERX, ERY, slant, drop, cursed, false, face);
  const bAng = face === 'happy' ? -0.2 : face === 'surprised' ? -0.1 : slant;
  const bDy = face === 'happy' ? -2 : face === 'surprised' ? -4 : face === 'sad' ? drop - 2.6 : drop - 0.4;
  brows(ctx, bAng, bDy, cursed, true);
  if (face === 'happy') {   // smiling cheek pushes the lower lid up
    ctx.fillStyle = C.sc;
    ctx.beginPath(); ellipse(ctx, EX + 0.5, EY + ERY + 2.6, ERX + 2, 4.4); ctx.fill();
    ink(ctx, (c) => { c.moveTo(EX - ERX + 0.4, EY + ERY - 3.4); c.quadraticCurveTo(EX, EY + ERY - 5.8, EX + ERX - 0.4, EY + ERY - 3.4); }, 1.8);
  }
  if (p.tear) {   // a single big tear (sad, caged)
    const v = (T * 0.6) % 1;
    flat(ctx, (c) => { const x = EX + ERX - 0.5 + v * 3, y = EY + 3 + v * 6; c.moveTo(x, y - 3.2); c.quadraticCurveTo(x + 2.6, y + 0.5, x, y + 2.2); c.quadraticCurveTo(x - 2.6, y + 0.5, x, y - 3.2); c.closePath(); }, K.tear, 1.4);
  }
  if (STORM && cursed) {   // lightning crackles round the glowing eye
    const fr = Math.floor(T * 16);
    if (fr % 3 !== 1) boltStroke(ctx, (c) => {
      bolt(c, EX - ERX + 1, EY - 4, EX - ERX - 7, EY - 9 + hash(fr) * 4, fr * 2.3, 1.6, 3);
      bolt(c, EX + ERX - 1, EY + 3, EX + ERX + 5, EY + 7 + hash(fr + 3) * 3, fr * 3.7, 1.4, 3);
    }, 0.8);
  }
}
function eye(ctx, x, y, rx, ry, slant, drop, glowE, far, face) {
  // lid line through (x, y - ry + drop) slanting down towards +x
  const ly0 = y - ry + drop - slant * rx * 1.4, ly1 = y - ry + drop + slant * rx * 1.4;
  const x0 = x - rx - 3, x1 = x + rx + 3;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x0, ly0); ctx.lineTo(x1, ly1); ctx.lineTo(x1, y + ry + 4); ctx.lineTo(x0, y + ry + 4); ctx.closePath();
  ctx.clip();
  flat(ctx, (c) => ellipse(c, x, y, rx, ry), glowE ? (STORM ? '#dff6ff' : '#d9ffd0') : K.eyeW, 0);
  ctx.save();
  ctx.beginPath(); ellipse(ctx, x, y, rx, ry); ctx.clip();
  const ix = x + rx * (far ? 0.1 : 0.25), iy = y + 0.8;
  if (glowE) {   // cursed: no pupil, just a green glow
    const pl = 0.85 + 0.15 * Math.sin(T * 7);
    ctx.fillStyle = K.gemD; ctx.beginPath(); ellipse(ctx, ix, iy, rx * 0.86, ry * 0.8); ctx.fill();
    ctx.fillStyle = K.gem; ctx.beginPath(); ellipse(ctx, ix, iy, rx * 0.62 * pl, ry * 0.6 * pl); ctx.fill();
    ctx.fillStyle = K.gemC; ctx.beginPath(); ellipse(ctx, ix, iy, rx * 0.3 * pl, ry * 0.32 * pl); ctx.fill();
  } else {
    const ps = face === 'surprised' ? 0.62 : 1;
    ctx.fillStyle = K.irisD; ctx.beginPath(); ellipse(ctx, ix, iy, rx * 0.72 * ps, ry * 0.68 * ps); ctx.fill();
    ctx.fillStyle = K.iris; ctx.beginPath(); ellipse(ctx, ix, iy + ry * 0.12 * ps, rx * 0.56 * ps, ry * 0.5 * ps); ctx.fill();
    ctx.fillStyle = K.pupil; ctx.beginPath(); ellipse(ctx, ix, iy, rx * 0.34 * ps, ry * 0.42 * ps); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, ix - rx * 0.28, iy - ry * 0.3, ry * 0.19);
    circle(ctx, ix + rx * 0.22, iy + ry * 0.22, ry * 0.09); ctx.fill();
  }
  ctx.restore();
  ink(ctx, (c) => ellipse(c, x, y, rx, ry), far ? 2 : 2.3);
  ctx.restore();
  // lid edge
  if (drop > -1) {
    ctx.save();
    ctx.beginPath(); ellipse(ctx, x, y, rx + 1.2, ry + 1.2); ctx.clip();
    ink(ctx, (c) => { c.moveTo(x0, ly0); c.lineTo(x1, ly1); }, far ? 2 : 2.3);
    ctx.restore();
  }
}
function brows(ctx, ang, dy, cursed, both) {
  ctx.fillStyle = cursed ? C.brow : C.browFree;
  for (const [x, y, w0, k] of [[EX - 0.5, EY - ERY - 0.6, 8.2, 1], [FX, FY - FRY - 0.6, 4.2, 0.9]]) {
    if (k < 1 && !both) continue;
    const w = ang < 0 ? w0 * 0.8 : w0;
    ctx.save(); ctx.translate(x, y + dy * (k < 1 ? 0.35 : 1)); ctx.rotate(ang * k);
    ctx.beginPath(); ctx.moveTo(-w, 0.6); ctx.quadraticCurveTo(0, -3.2, w, -0.2); ctx.quadraticCurveTo(w + 1, 1.8, w - 1, 2.2);
    ctx.quadraticCurveTo(0, 0.8, -w, 2.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// -------------------------------------------------- the cursed collar (body frame, round the neck)
function collar(ctx, p) {
  ctx.save();
  ctx.translate(13.5, -6.5);
  ctx.rotate((52 - p.head * 0.45) * DEG);
  drawCollarShape(ctx, p.crack, 1);
  ctx.restore();
}

/**
 * The cursed collar on its own, centred on the band (u across the neck: -u = back of the neck, +u = throat).
 * Also used by the engine for the collar dropping off: drawCollar(ctx, { scale, crack, t, rot }).
 */
export function drawCollar(ctx, o = {}) {
  T = o.t ?? T;
  ctx.save();
  ctx.scale(o.scale || 1, o.scale || 1);
  if (o.rot) ctx.rotate(o.rot);
  drawCollarShape(ctx, o.crack ?? 1, 1);
  ctx.restore();
}

function drawCollarShape(ctx, crack, k) {
  const L = 13 * k, H = 4.4 * k, B = 2.4 * k;     // half length across the neck, half thickness, bow
  // spikes (behind the band): back end, the top rim and the bottom rim
  flat(ctx, (c) => {
    for (const [x, a, l] of [[-L - 1, Math.PI, 8], [-L * 0.5, -Math.PI / 2 - 0.35, 7.5], [L * 0.05, -Math.PI / 2 + 0.05, 7.5],
      [L * 0.55, -Math.PI / 2 + 0.4, 6.5], [-L * 0.5, Math.PI / 2 + 0.35, 6]]) {
      const bow = B * (1 - (x / L) * (x / L));
      const y = a === Math.PI ? 0 : (Math.sin(a) < 0 ? -H - bow + 1 : H - bow - 1);
      const ux = Math.cos(a), uy = Math.sin(a);
      c.moveTo(x - uy * 3, y + ux * 3); c.lineTo(x + ux * l * k, y + uy * l * k); c.lineTo(x + uy * 3, y - ux * 3); c.closePath();
    }
  }, K.ironH, 1.9);
  cel(ctx, (c) => {
    c.moveTo(-L, -H); c.quadraticCurveTo(0, -H - B * 2, L, -H); c.quadraticCurveTo(L + 2.6, 0, L, H);
    c.quadraticCurveTo(0, H - B * 2, -L, H); c.quadraticCurveTo(-L - 2.6, 0, -L, -H); c.closePath();
  }, K.iron, K.ironD, { k: 0.8, hi: K.ironH, hk: 0.5, lw: 2.4, detail: (c) => {
    c.fillStyle = K.ironH; c.beginPath(); circle(c, -L * 0.72, -B * 0.4, 1.3); circle(c, -L * 0.2, -B * 0.9, 1.3); c.fill();
  } });
  // the gem near the throat
  const gx = L * 0.58, gy = -B * 0.6, pulse = 0.7 + 0.3 * Math.sin(T * 5);
  const live = 1 - 0.75 * clamp(crack, 0, 1);
  const gw = 5.4 * k, gh = 6.4 * k;
  flat(ctx, (c) => { c.moveTo(gx - gw, gy); c.lineTo(gx, gy - gh); c.lineTo(gx + gw, gy); c.lineTo(gx, gy + gh); c.closePath(); },
    live > 0.5 ? K.gem : '#2f8f4a', 2.2);
  ctx.globalAlpha = live;
  ctx.fillStyle = K.gemD;
  ctx.beginPath(); ctx.moveTo(gx + gw - 1.6, gy); ctx.lineTo(gx, gy + gh - 1.8); ctx.lineTo(gx - 1, gy + 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = K.gemC;
  ctx.beginPath(); ctx.moveTo(gx - gw + 1.8, gy - 0.4); ctx.lineTo(gx, gy - gh + 2); ctx.lineTo(gx + 1, gy - 1); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  if (live > 0.4) twinkle(ctx, gx + gw * 0.55, gy - gh * 0.55, (2.4 + 2.2 * pulse) * k);
  if (crack > 0.05) {
    ink(ctx, (c) => {
      c.moveTo(gx - 0.5, gy - gh + 0.5); c.lineTo(gx + 1, gy - 1.2); c.lineTo(gx - 1.4, gy + 0.8); c.lineTo(gx + 0.6, gy + gh - 0.5);
      if (crack > 0.5) { c.moveTo(gx + 1, gy - 1.2); c.lineTo(gx + gw - 1, gy - 0.4); c.moveTo(-L * 0.1, -H - B); c.lineTo(L * 0.05, -0.4); c.lineTo(-L * 0.12, H - B); }
    }, 1.4);
  }
}

function twinkle(ctx, x, y, r, col = K.gemC) {   // 4-point sparkle that sells the glow
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.6); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r * 1.6);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r * 1.6); ctx.closePath();
  ctx.fill();
}

// -------------------------------------------------- the storm whelp's ball lightning (projectile)
/** ~20 px crackling ball of lightning, centred on the ctx origin (the engine positions + moves it). */
export function drawSpark(ctx, t = 0) {
  const fr = Math.floor(t * 24), pulse = 0.88 + 0.12 * Math.sin(t * 37);
  ctx.save();
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(70,140,255,0.22)'; ctx.beginPath(); circle(ctx, 0, 0, 16 * pulse); ctx.fill();
  ctx.fillStyle = 'rgba(110,190,255,0.22)'; ctx.beginPath(); circle(ctx, 0, 0, 11.5 * pulse); ctx.fill();
  ctx.globalCompositeOperation = prev;
  // crackling arcs leaping off the ball
  boltStroke(ctx, (c) => {
    for (let i = 0; i < 4; i++) {
      const a = hash(fr * 1.7 + i) * TAU, r = 13 + hash(fr + i * 3) * 6;
      bolt(c, Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * r, Math.sin(a) * r, fr * 4 + i, 2.2, 3);
    }
  }, 1.1);
  // the ball: a jagged, flickering crackle edge in electric blue, inked, white-hot core
  flat(ctx, (c) => {
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU, r = (i % 2 ? 7.6 : 9.2 + hash(fr * 2 + i) * 2.2) * pulse;
      i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(r, 0);
    }
    c.closePath();
  }, '#58b4ff', 2);
  ctx.fillStyle = '#c9f4ff'; ctx.beginPath(); circle(ctx, -0.5, -0.5, 5.6 * pulse); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); circle(ctx, -1, -1, 3.2 * pulse); ctx.fill();
  ctx.strokeStyle = '#2f7fe0'; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath();
  bolt(ctx, -5, 2, 5, -2, fr * 9 + 2, 2.2, 4); bolt(ctx, -2, -5, 2, 5, fr * 5 + 7, 1.8, 3); ctx.stroke();
  ctx.restore();
}

// -------------------------------------------------- the cage (freed-whelp rescue prop)
/**
 * A ~90 px tall black-iron bird cage standing on the floor (origin = floor centre), green cursed padlock in front.
 * broken01 0 -> 1: the bars rattle, bend apart and the lock bursts off.  Draw the whelp's `cage` pose first, then
 * this on top.  layer: 'back' | 'front' (draw back before the whelp, front after) or omitted = both, with the back
 * bars kept above the curled whelp so they don't cross it.
 */
const CAGE_N = 10, CAGE_R = 44, CAGE_RY = 11, CAGE_TOP = -80;
export function drawCage(ctx, t = 0, broken01 = 0, layer) {
  const b = clamp(broken01, 0, 1);
  const rattle = b > 0 && b < 1 ? Math.sin(t * 70) * 1.6 * (1 - b) : 0;
  ctx.save();
  ctx.translate(rattle, 0);
  const back = layer !== 'front', front = layer !== 'back';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (back) {
    // floor plate (top face) and the back bars
    cel(ctx, (c) => ellipse(c, 0, -3, CAGE_R + 4, CAGE_RY + 2), K.iron, K.ironD, { k: 1, lw: 3 });
    ctx.save();
    if (!layer) { ctx.beginPath(); ctx.rect(-70, CAGE_TOP - 30, 140, 30 + 26); ctx.clip(); }
    for (let i = 0; i < CAGE_N; i++) {
      const a = (i + 0.5) / CAGE_N * TAU, s = Math.sin(a);
      if (s >= 0) continue;
      cageBar(ctx, a, 0, true);
    }
    ctx.restore();
  }
  if (front) {
    for (let i = 0; i < CAGE_N; i++) {
      const a = (i + 0.5) / CAGE_N * TAU, s = Math.sin(a);
      if (s < 0) continue;
      // the bars nearest the front bow apart as the cage breaks
      const bend = b * (Math.cos(a) > 0 ? 1 : -1) * (1 - Math.abs(Math.cos(a))) * 26;
      cageBar(ctx, a, bend, false);
    }
    // base rim (front edge) and the top hoop with its dome and hanging ring
    cel(ctx, (c) => { c.moveTo(-CAGE_R - 4, -3); c.ellipse(0, -3, CAGE_R + 4, CAGE_RY + 2, 0, Math.PI, 0, true); c.lineTo(CAGE_R + 4, 3);
      c.ellipse(0, 3, CAGE_R + 4, CAGE_RY + 2, 0, 0, Math.PI, false); c.closePath(); }, K.iron, K.ironD, { k: 0.8, lw: 3, detail: (c) => {
      c.fillStyle = K.ironH; for (let i = -3; i <= 3; i++) { c.beginPath(); circle(c, i * 13, 6 + Math.cos(i * 0.4) * 2.4, 1.4); c.fill(); }
    } });
    ink(ctx, (c) => ellipse(c, 0, CAGE_TOP, CAGE_R - 2, CAGE_RY - 2), 5.6);
    ink(ctx, (c) => ellipse(c, 0, CAGE_TOP, CAGE_R - 2, CAGE_RY - 2), 2.6, K.iron);
    cel(ctx, (c) => { c.moveTo(-CAGE_R + 3, CAGE_TOP); c.quadraticCurveTo(-CAGE_R + 6, CAGE_TOP - 16, 0, CAGE_TOP - 16); c.quadraticCurveTo(CAGE_R - 6, CAGE_TOP - 16, CAGE_R - 3, CAGE_TOP);
      c.quadraticCurveTo(0, CAGE_TOP + 7, -CAGE_R + 3, CAGE_TOP); c.closePath(); }, K.iron, K.ironD, { k: 1, hi: K.ironH, hk: 0.45, lw: 3 });
    ink(ctx, (c) => { c.arc(0, CAGE_TOP - 21, 5, 0, TAU); }, 4.6);
    ink(ctx, (c) => { c.arc(0, CAGE_TOP - 21, 5, 0, TAU); }, 2, K.ironH);
    // the padlock: green cursed glow; bursts off and drops as the cage breaks
    const lx = 0, drop = Math.max(0, b - 0.35) / 0.65;
    ctx.save();
    ctx.translate(lx + drop * 18, -38 + drop * drop * 30);
    ctx.rotate(drop * 1.9);
    const open = b > 0.35;
    ink(ctx, (c) => { c.moveTo(-4.5, -4); c.lineTo(-4.5, -9); c.arc(0, -9, 4.5, Math.PI, 0); c.lineTo(4.5, open ? -12 : -4); }, 5);
    ink(ctx, (c) => { c.moveTo(-4.5, -4); c.lineTo(-4.5, -9); c.arc(0, -9, 4.5, Math.PI, 0); c.lineTo(4.5, open ? -12 : -4); }, 2.2, K.ironH);
    if (!open) { ctx.globalAlpha = 0.3 + 0.15 * Math.sin(t * 5); ctx.fillStyle = K.glow; ctx.beginPath(); circle(ctx, 0, 3, 12); ctx.fill(); ctx.globalAlpha = 1; }
    cel(ctx, (c) => { c.moveTo(-7, -5); c.lineTo(7, -5); c.quadraticCurveTo(8.5, 4, 7, 9); c.quadraticCurveTo(0, 11, -7, 9); c.quadraticCurveTo(-8.5, 4, -7, -5); c.closePath(); },
      open ? '#2f8f4a' : K.gem, K.gemD, { k: 0.8, lw: 2.6, detail: (c) => {
        c.fillStyle = K.ironD; c.beginPath(); circle(c, 0, 1, 1.8); c.moveTo(-0.8, 1.5); c.lineTo(0.8, 1.5); c.lineTo(1.1, 5.5); c.lineTo(-1.1, 5.5); c.closePath(); c.fill();
      } });
    if (!open) twinkle(ctx, 5, -3, 2.6 + Math.sin(t * 6), K.gemC);
    ctx.restore();
  }
  ctx.restore();
}
// one bar from the floor ring to the top hoop at angle a (3/4 view), bowed sideways by `bend` px at mid-height
function cageBar(ctx, a, bend, isBack) {
  const x0 = Math.cos(a) * (CAGE_R + 1), y0 = Math.sin(a) * CAGE_RY - 3;
  const x1 = Math.cos(a) * (CAGE_R - 3), y1 = CAGE_TOP + Math.sin(a) * (CAGE_RY - 2);
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2 + Math.abs(bend) * 0.15;
  const path = (c) => { c.moveTo(x0, y0); c.quadraticCurveTo(mx * 2 - (x0 + x1) / 2, my * 2 - (y0 + y1) / 2, x1, y1); };
  ink(ctx, path, isBack ? 3.6 : 5.2);
  ink(ctx, path, isBack ? 1.6 : 2.6, isBack ? K.ironD : K.iron);
  if (!isBack) ink(ctx, (c) => { c.moveTo(x0 - 0.8, y0 - 6); c.quadraticCurveTo(mx * 2 - (x0 + x1) / 2 - 0.8, my * 2 - (y0 + y1) / 2, x1 - 0.8, y1 + 6); }, 0.9, K.ironH);
}

// -------------------------------------------------- extras
function streaks(ctx, a) {
  ctx.strokeStyle = '#fffaf0'; ctx.lineCap = 'round';
  ctx.globalAlpha = 0.7 * a;
  for (const [y, x0, L, w] of [[-8, -26, 30, 2.4], [2, -30, 38, 3], [11, -24, 24, 2]]) {
    const off = ((T * 260 + y * 13) % 30);
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0 - off, y); ctx.lineTo(x0 - off - L, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function stars(ctx) {
  ctx.save();
  ctx.translate(NECK[0] + 8, NECK[1] - 26);
  for (let i = 0; i < 3; i++) {
    const a = T * 3 + i * TAU / 3;
    const x = Math.cos(a) * 13, y = Math.sin(a) * 4;
    flat(ctx, (c) => {
      for (let j = 0; j < 10; j++) {
        const r = j % 2 ? 1.6 : 4, b = -Math.PI / 2 + j * Math.PI / 5;
        j ? c.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r) : c.moveTo(x + Math.cos(b) * r, y + Math.sin(b) * r);
      }
      c.closePath();
    }, '#ffe066', 1.6);
  }
  ctx.restore();
}
