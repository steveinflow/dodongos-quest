// Magma Salamander: one of the Dragon King's beasts in the Ember Mines (regular enemy, 2-3 on screen).
//
// A low, fast cartoon lava lizard: a blobby charcoal-black body split by glowing orange-yellow lava cracks, a
// molten belly, four stubby sprawled legs with three-toed feet, a big goofy-grumpy head (bulging eyes on top,
// a wide under-bite mouth with two snaggle fangs, two small horns) and a long tail that drags on the floor and carries a
// flame on its curled-up tip.  It wears no collar: it is not a clan dragon, and when beaten it poofs into smoke.
//
// Local space: origin on the floor under the middle of the body, +x = facing, y down.  ~60 px tall to the horn
// tips, ~140 px from the snout to the flame (scale 1).  The legs are 2-bone IK chains: in grounded poses each
// ankle is pinned to the floor (feet never slide), in `air` poses (fly, down) they hang from the body.  The body
// is posed explicitly (x, y, pitch), so `air` only tells the engine the height is fixed.
//
// Engine notes:
//  - crawl(ph): one cycle covers CRAWL_STRIDE px of ground; advance ph by |speed| / CRAWL_STRIDE per frame.
//  - spit(k) 16 f: the glob leaves the mouth at k = SPIT_RELEASE (0.3) from MOUTH; draw it with drawGlob().
//  - lunge(k) 20 f: the jaws snap shut at k = BITE_CONTACT (0.35) on BITE.  The lunge is self-contained (the body
//    shoots forward ~20 px inside the pose and steps back); the engine may add a small slide of its own.
//  - o.mem / o.vel drive the tail drag + overshoot, the flame lean and a little head jiggle.
//  - mouthOf(pose) / biteOf(pose) give the mouth / jaw tip for any pose (local px, facing right, scale 1).
//  - FRAMES = the frame count each keyed move is timed for.  HURTBOX = { x, w, h } (centre x in front of the origin).
//  - drawGlob(ctx, t, vx, vy, scale): the ~22 px lava glob projectile with its trail, centred on ctx.
import { cel, flat, ink, capsule, blob, ellipse, circle, keys, mix, ease, DEG, TAU, clamp, lerp, follow } from '../rig.js';
import { INK } from '../config.js';

const C = {
  sk: '#423b49', skD: '#221d27', skH: '#655c71', skL: '#2d2834',          // charcoal hide
  skF: '#322d39', skFD: '#211d27',                                         // far-side limbs
  rim: '#d8cdff',                                                          // cool lilac rim light
  lava: '#ff8a1c', lavaD: '#d24d16', lavaH: '#ffd23e', lavaC: '#fff4b8',
  bel: '#ffaa30', belD: '#e5651b', belL: '#c4501a', belH: '#ffe07a',
  horn: '#ecdfc4', hornD: '#b49d7a',
  eyeW: '#fff5de', eyeD: '#e7cfae', iris: '#ff9a1c', irisD: '#c45a10', pupil: '#1d1418',
  mouth: '#4e1216', throat: '#ff6a1a', tongue: '#ff7d69', tongueD: '#c94a3c', tooth: '#fff5de',
  claw: '#ecdfc4', clawD: '#b49d7a', smoke: '#8d8292', smokeL: '#b9b0bd', star: '#ffe45c', sweat: '#9fe3ff',
};

// ---------------------------------------------------------------- skeleton (px at scale 1)
const BODY_Y = -22;                       // body centre above the floor at rest
const BODY = [[28, -6], [21, -13], [10, -17], [-3, -18], [-16, -15.5], [-25, -10], [-29, -2], [-26, 6], [-15, 11],
  [1, 13], [16, 12], [26, 6]];
// leg sockets in the body frame: front near / front far / hind near / hind far
const JOINT = [[15, 6], [19, 3], [-17, 6], [-13, 3]];
const REST_X = [17, 21, -15, -11];        // planted ankle x at rest (local)
const FRONT = [true, true, false, false], FAR = [false, true, false, true];
const FK = ['fN', 'fF', 'hN', 'hF'];      // pose field prefixes (x = foot shift, y = lift)
const UP = 10, LO = 10.5, ANK = 4, HANG = 15;
const NECK = [22, -5];
const TAIL0 = [-25, -1];
/** Ground covered by one crawl cycle (px): advance ph by |speed| / CRAWL_STRIDE per frame. */
export const CRAWL_STRIDE = 40;
export const SPIT_RELEASE = 0.3;
export const BITE_CONTACT = 0.35;
/** Frame counts the poses are keyed for (60 fps); fly / down are static, idle / taunt take t, crawl takes ph. */
export const FRAMES = { spitWind: 24, spit: 16, lungeWind: 18, lunge: 20, hurt: 18, hurt2: 18, getup: 26 };

// ---------------------------------------------------------------- poses
// x/y: body offset (y + = down), pitch: + = nose up, rot: extra roll for knockdowns, fl: -1..1 belly-up flip
// (cut-out roll through edge-on), st: stretch along the body, sq: root squash (1 = none), und/uph: travelling
// spine wave (px / phase rad), breathe: -1..1 body swell.  head: + = chin up; jaw: deg open; cheek: 0..1 puffed
// cheeks; tongue: 0..1 tongue out; gl: lava glob held in the mouth.  Feet: fNx/fNy, fFx/fFy, hNx/hNy, hFx/hFy =
// shift from the rest spot / lift (px), plant: 1 = ankles pinned to the floor, 0 = hanging from the body.  Tail:
// tb droop (deg, + = down), tc curl per segment (+ = down), tsw sway (deg), tp phase (cycles).  heat: extra crack
// glow, smear: bite smear 0..1, puff: smoke puff progress 0..1 (0 = none), stars: dizzy stars.
export const BASE = {
  x: 0, y: 0, pitch: 0, rot: 0, fl: 1, st: 1, sq: 1, und: 0, uph: 0, breathe: 0,
  head: 0, jaw: 0, cheek: 0, tongue: 0, gl: 0,
  fNx: 0, fNy: 0, fFx: 0, fFy: 0, hNx: 0, hNy: 0, hFx: 0, hFy: 0, plant: 1,
  tb: 12, tc: -1.5, tsw: 4, tp: 0,
  heat: 0, smear: 0, puff: 0, chomp: 0, flare: 0, glint: 0, dust: 0,
  face: 'mean', blink: false, air: false, stars: false, hflip: false, tfloor: true,
};
const P = (o) => Object.assign({}, BASE, o);

function footCycle(p, k, ph) {
  const u = ph - Math.floor(ph), D = 0.56, half = CRAWL_STRIDE * D / 2;
  if (u < D) { p[k + 'x'] = half - (u / D) * 2 * half; p[k + 'y'] = 0; }
  else { const v = (u - D) / (1 - D); p[k + 'x'] = -half + ease.io(v) * 2 * half; p[k + 'y'] = 6.5 * Math.sin(Math.PI * v); }
}

const IDLE = P({});
const SPIT_UP = P({ x: -4, y: -7, pitch: 20, head: 10, cheek: 1, heat: 1, gl: 1, fNy: 3, fFy: 3, fNx: 2, fFx: 2,
  tb: 2, tc: -3, tsw: 2, face: 'puff' });
const LUNGE_COIL = P({ x: -13, y: 7, pitch: -8, head: -2, jaw: 20, st: 0.84, sq: 0.92, hNx: 4, hFx: 4, fNx: 6, fFx: 6, tb: -2, tc: -5, tsw: 1,
  face: 'yell', heat: 0.7 });
const DOWN = P({ air: true, plant: 0, fl: -1, y: -5, hflip: true, head: 20, jaw: 18, tongue: 1, fNx: -5, fNy: -5, fFx: 10, fFy: -2,
  hNx: 6, hNy: -5, hFx: -10, hFy: -2, tb: -4, tc: 1, tsw: 2, face: 'ko', stars: true });

export const ANIM = {
  idle(t) {
    const b = Math.sin(t * 2.6);
    const p = P({ y: b * 0.6, breathe: b, head: -1 - b * 1.6, pitch: b * 0.5, tp: t * 0.3, tsw: 4 + b });
    p.blink = (t % 3.6) > 3.47;
    // fidget every 5.4 s: cheeks swell... and a lava burp with a smoke ring
    const u = t % 5.4;
    if (u > 4.2) {
      const a = clamp((u - 4.2) / 0.55, 0, 1), r = clamp((u - 4.75) / 0.65, 0, 1);
      p.cheek = a * (1 - r); p.face = a < 1 ? 'puff' : 'mean';
      p.head += 6 * a - 8 * Math.sin(r * Math.PI);
      p.jaw = 22 * Math.sin(Math.min(1, r * 1.6) * Math.PI);
      p.puff = r > 0 ? 0.05 + r * 0.95 : 0;
      p.heat = a * (1 - r) * 0.8;
      p.blink = false;
    }
    return p;
  },
  // fast scuttle: diagonal pairs (trot), the spine wave runs back into the tail
  crawl(ph) {
    const s = Math.sin(ph * TAU), c2 = Math.cos(ph * TAU * 2);
    const p = P({ y: 1.6 + 2 * c2, pitch: 2.5 * s, head: -3 - 2.5 * s + 2 * c2, und: 2.4, uph: -ph * TAU, tp: ph, tsw: 12, tb: 9, tc: -2 });
    footCycle(p, 'fN', ph); footCycle(p, 'hF', ph); footCycle(p, 'fF', ph + 0.5); footCycle(p, 'hN', ph + 0.5);
    return p;
  },
  // 24 f telegraph: dips, then rears up with its cheeks swelling and glowing
  spitWind: (k) => keys(k, [
    [0, IDLE],
    [0.3, P({ x: 1, y: 3, pitch: -5, head: -8, cheek: 0.3, heat: 0.3, gl: 1, sq: 0.94, tb: 16, face: 'puff' })],
    [0.8, P({ ...SPIT_UP, cheek: 1.08 }), 'out'],
    [1, SPIT_UP],
  ]),
  // 16 f: the head snaps up and forward and lobs the glob (it sits at the lips until the release at k .3), then
  // dips through and settles
  spit: (k) => {
    const p = keys(k, [
      [0, SPIT_UP],
      [0.18, P({ x: 5, y: -3, pitch: 8, head: 20, jaw: 44, cheek: 0, heat: 0.7, fNy: 2, fFy: 1, tb: 6, tc: -2, face: 'yell' }), 'snap'],
      [0.3, P({ x: 6, y: -2, pitch: 6, head: 18, jaw: 40, cheek: 0, heat: 0.5, fNy: 1, tb: 8, face: 'yell' })],
      [0.6, P({ x: 3, y: 2, pitch: -4, head: -6, jaw: 14, sq: 0.95, tb: 16, face: 'mean' }), 'out'],
      [1, IDLE],
    ]);
    p.gl = k < SPIT_RELEASE ? 1 : 0;
    return p;
  },
  // 18 f telegraph: drops low, butt up, hind legs coiled, a cat-like butt wiggle
  lungeWind: (k) => {
    const p = keys(k, [
      [0, IDLE],
      [0.3, P({ x: -3, y: 2, pitch: -4, head: -4, jaw: 4, tb: 8, face: 'mean' })],
      [1, LUNGE_COIL, 'out'],
    ]);
    const w = Math.sin(k * TAU * 2.5) * Math.sin(k * Math.PI);
    p.tsw += 6 * w; p.tp = k * 1.2; p.uph = w * 1.5; p.und = 2 * Math.abs(w); p.pitch += 1.5 * w;
    p.glint = clamp((k - 0.78) / 0.12, 0, 1);
    return p;
  },
  // 20 f: shoots forward, jaws wide, SNAP at k .35 (held two frames, chomp star), overshoots, steps back
  lunge: (k) => {
    const p = keys(k, [
      [0, LUNGE_COIL],
      [0.2, P({ x: 18, y: -4, pitch: 5, st: 1.22, sq: 0.94, head: 10, jaw: 50, fNx: 16, fNy: 8, fFx: 16, fFy: 6, tb: -6, tc: -1, tsw: 1,
        face: 'yell', heat: 0.6, smear: 0.6 }), 'snap'],
      [0.35, P({ x: 21, y: 0, pitch: -2, st: 1.15, head: -6, jaw: 0, fNx: 17, fFx: 17, tb: 4, tc: -1, tsw: 1,
        face: 'yell', smear: 1 }), 'in'],
      [0.45, P({ x: 21, y: 0, pitch: -2, st: 1.13, head: -7, jaw: 0, fNx: 17, fFx: 17, tb: 6, tc: -1, tsw: 1, face: 'yell', smear: 0.5 })],
      [0.58, P({ x: 19, y: 1, pitch: -4, st: 1.04, head: -12, jaw: 3, fNx: 17, fFx: 17, tb: -10, tc: -3, face: 'mean', smear: 0 }), 'out'],
      [0.8, P({ x: 7, y: -1, pitch: 1, head: -2, jaw: 2, fNx: 6, fNy: 5, fFx: 6, fFy: 3, tb: 12, face: 'mean' })],
      [1, IDLE],
    ]);
    p.chomp = k >= BITE_CONTACT && k < 0.55 ? 1 - (k - BITE_CONTACT) / 0.2 : 0;
    p.glint = k < 0.12 ? 1 - k / 0.12 : 0;
    return p;
  },
  // high hit: the head snaps back, the front lifts
  hurt: (k) => keys(k, [
    [0, P({ x: -7, y: -3, pitch: 12, head: 24, jaw: 20, sq: 0.92, fNy: 4, fFy: 3, tb: 26, tc: -5, tsw: 2, face: 'ouch' })],
    [0.35, P({ x: -5, y: -1, pitch: 6, head: 10, jaw: 14, fNy: 1, tb: 18, face: 'ouch' }), 'out'],
    [1, P({ face: 'mean' })],
  ]),
  // low hit: squashed flat, the tail whips up
  hurt2: (k) => keys(k, [
    [0, P({ x: -5, y: 4, sq: 0.8, pitch: -7, head: -16, jaw: 16, st: 1.08, tb: -32, tc: -6, tsw: 2, face: 'ouch' })],
    [0.35, P({ x: -4, y: 2, sq: 0.92, pitch: -3, head: -8, jaw: 10, tb: -12, tc: -4, face: 'ouch' }), 'out'],
    [1, P({ face: 'mean' })],
  ]),
  // knocked into the air backwards (air)
  fly: P({ air: true, plant: 0, y: -6, rot: 24, head: 30, jaw: 26, st: 1.04, fNx: 15, fNy: 8, fFx: 19, fFy: 4, hNx: -19,
    hNy: 15, hFx: -14, hFy: 16, tb: 4, tc: -4, tsw: 6, face: 'ouch', tfloor: false }),
  // flat on its back, legs in the air, dizzy (air, lies on the floor at z = 0)
  down: DOWN,
  // 26 f: rolls over (cut-out flip: a side-on beat with the legs flailing), lands squashed, shakes its head
  getup: (k) => {
    const p = keys(k, [
      [0, P({ ...DOWN, face: 'ko', stars: false })],
      [0.16, P({ ...DOWN, y: 0, rot: -10, head: 30, face: 'ouch', stars: false, fNy: 2, hNy: 2 })],
      [0.4, P({ air: true, plant: 0, fl: 0.02, y: -2, rot: 4, head: 0, jaw: 14, fNx: 6, fNy: -4, fFx: 10, fFy: 2, hNx: -6, hNy: -4, hFx: -9, hFy: 2,
        tb: 0, face: 'ouch' })],
      [0.52, P({ air: true, plant: 0.5, fl: 1, y: 2, rot: 4, head: -6, jaw: 10, sq: 0.86, fNy: 4, fFy: 3, hNy: 4, hFy: 3, tb: 6, face: 'ouch' }), 'in'],
      [0.66, P({ y: 3, sq: 0.88, head: -14, jaw: 8, tb: 10, face: 'mean' })],
      [1, IDLE],
    ]);
    if (k > 0.16 && k < 0.52) { const w = Math.sin(k * 90); p.fNx += 4 * w; p.hNx -= 4 * w; p.fFy += 3 * w; p.hFy -= 3 * w; }
    p.dust = k > 0.14 && k < 0.62 ? (k - 0.14) / 0.48 : 0;
    if (k > 0.66) { const u = (k - 0.66) / 0.34; p.head += 10 * Math.sin(u * TAU * 2) * (1 - u); }
    return p;
  },
  // mocking: hops on the spot blowing a long wiggly raspberry, head cocked, tail waving, the tail flame flaring
  taunt(t) {
    const w = Math.sin(t * 9), h = Math.abs(Math.sin(t * 5)), c = Math.sin(t * 5);
    return P({ x: w * 1.2, y: -5 * h, pitch: 4 + 3 * c, head: 18 + 4 * c, jaw: 16, tongue: 1.8, uph: t * 9, und: 1.4,
      fNy: 5 * h, fFy: 4 * h, hNy: 2 * h, hFy: 1.5 * h, tsw: 14, tp: t * 1.6, tb: 2, tc: -4, face: 'smug', flare: 0.6 + 0.4 * h });
  },
};
export { mix };

// ---------------------------------------------------------------- body transform + measurements
// local = (MX, MY) + [MA MC; MB MD] * body
let MA = 1, MB = 0, MC = 0, MD = 1, MX = 0, MY = 0, FS = 1, PX = 0, PY = 0;
function setBody(p) {
  const th = -(p.pitch + p.rot) * DEG, cs = Math.cos(th), sn = Math.sin(th);
  FS = p.fl < 0 ? -1 : 1;
  const sx = p.st, sy = FS * Math.max(0.3, Math.abs(p.fl)) / Math.sqrt(p.st);
  MA = cs * sx; MB = sn * sx; MC = -sn * sy; MD = cs * sy;
  MX = p.x; MY = BODY_Y + p.y;
}
function wave(p, x) { return p.und ? p.und * Math.sin(x * 0.11 + p.uph) : 0; }
function toLocal(bx, by) { PX = MX + MA * bx + MC * by; PY = MY + MB * bx + MD * by; }
function headAngle(p) { return -(p.pitch + p.rot + p.head) * DEG; }
function rotAbout(x, y, cx, cy, a) { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; }
const HINGE = [-1, 2];
function headPt(p, hx, hy, raw) {
  setBody(p);
  toLocal(NECK[0], NECK[1] + wave(p, NECK[0]));
  const a = headAngle(p), c = Math.cos(a), s = Math.sin(a);
  let x = PX + hx * c - hy * s, y = PY + hx * s + hy * c;
  if (raw) return [x, y];
  if (p.sq !== 1) { x /= Math.sqrt(p.sq); y *= p.sq; }
  return [Math.round(x), Math.round(y)];
}
/** Mouth centre (between the lips) for any pose: local [x, y], facing right, scale 1, origin on the floor. */
export function mouthOf(p, raw) {
  const [x, y] = rotAbout(36, 3, HINGE[0], HINGE[1], p.jaw * DEG * 0.5);
  return headPt(p, x, y, raw);
}
/** Front of the jaws for any pose (the bite point). */
export function biteOf(p, raw) {
  const [x, y] = rotAbout(39, 3, HINGE[0], HINGE[1], p.jaw * DEG);
  return headPt(p, (x + 41) / 2, (y + 0) / 2, raw);
}
/** Where the lava glob leaves the mouth (spit at k = SPIT_RELEASE). */
export const MOUTH = mouthOf(ANIM.spit(SPIT_RELEASE));
/** The jaws at the snap of the lunge (k = BITE_CONTACT). */
export const BITE = biteOf(ANIM.lunge(BITE_CONTACT));
export const HEIGHT = 60;
/** Suggested body hurtbox (local px, scale 1): centred x px in front of the origin (times facing), w wide, h tall. */
export const HURTBOX = { x: 16, w: 92, h: 50 };

// ---------------------------------------------------------------- drawing
let T = 0;
const BP = BODY.map((q) => [q[0], q[1]]);
const LJ = new Float64Array(8), LE = new Float64Array(8), LF = new Float64Array(8), LA = new Float64Array(4);

// rim light: a cool band just inside the outline on the side away from the key light (as Grimscale)
function rim(ctx, path, lw, s = 1.6) {
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
// glowing lava cracks: a soft translucent halo under a hot core (no blur).  path(c) adds the polylines.
function glow(c, path, w, a) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); path(c);
  c.globalAlpha = 0.45 * a; c.strokeStyle = C.lava; c.lineWidth = w * 2.6; c.stroke();
  c.globalAlpha = 1; c.strokeStyle = C.lavaH; c.lineWidth = w; c.stroke();
  if (a > 0.95) { c.strokeStyle = C.lavaC; c.lineWidth = w * 0.45; c.stroke(); }
}

/**
 * Draw a Magma Salamander.  ctx is at its floor point (screen), unscaled.
 * o: { facing: 1 | -1, t: seconds, scale, mem, vel: {x, y, z} }
 */
export function draw(ctx, pose, o = {}) {
  const p = pose, f = o.facing || 1, S = o.scale || 1;
  T = o.t || 0;
  const mem = o.mem, vf = o.vel ? (o.vel.x || 0) * f : 0, vz = o.vel ? (o.vel.z || 0) : 0;
  // secondary motion (no lag without o.mem)
  const tb = follow(mem, 'tb', p.tb + clamp(vf, -6, 6) * 1.2 + clamp(vz, -8, 8) * 1.5, 0.13, 0.76);
  const tc = follow(mem, 'tc', p.tc, 0.1, 0.8);
  const drag = follow(mem, 'drag', clamp(vf * 1.6, -10, 10), 0.09, 0.82);
  const flame = follow(mem, 'flame', clamp(-vf * 0.16, -0.7, 0.7), 0.16, 0.72);
  const hj = follow(mem, 'head', p.head, 0.32, 0.6) - p.head;
  setBody(p);
  for (let i = 0; i < BP.length; i++) BP[i][1] = BODY[i][1] + wave(p, BODY[i][0]);

  ctx.save();
  ctx.scale(f * S, S);
  if (p.sq !== 1) ctx.scale(1 / Math.sqrt(p.sq), p.sq);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  solveLegs(p);
  leg(ctx, 3, p); leg(ctx, 1, p);
  tail(ctx, p, tb, tc, drag, flame);
  ctx.save();
  ctx.transform(MA, MB, MC, MD, MX, MY);
  body(ctx, p);
  ctx.restore();
  leg(ctx, 2, p); leg(ctx, 0, p);
  head(ctx, p, hj);
  if (p.smear > 0.01) smear(ctx, p);
  if (p.chomp > 0) chomp(ctx, p);
  if (p.glint > 0.3 && p.jaw > 6) fangGlint(ctx, p);
  if (p.dust > 0) rollDust(ctx, p.dust);
  if (p.puff > 0) smoke(ctx, p);
  ctx.restore();
}

// -------------------------------------------------- legs (local space; 2-bone IK)
function solveLegs(p) {
  const pl = clamp(p.plant, 0, 1);
  for (let i = 0; i < 4; i++) {
    const j = JOINT[i], fx = p[FK[i] + 'x'], fy = p[FK[i] + 'y'];
    toLocal(j[0], j[1] + wave(p, j[0]));
    const jx = PX, jy = PY;
    LJ[i * 2] = jx; LJ[i * 2 + 1] = jy;
    // hanging from the body (body frame) vs pinned to the floor (local)
    toLocal(j[0] + fx * 0.8, j[1] + HANG - fy);
    const tx = lerp(PX, REST_X[i] + fx, pl), ty = lerp(PY, -ANK - fy, pl);
    // IK: knee/elbow on the anatomical side (front elbows point back, hind knees forward), mirrored with the flip
    const dx = tx - jx, dy = ty - jy, d = Math.hypot(dx, dy) || 1, R = UP + LO - 0.2;
    let fx2 = tx, fy2 = ty;
    if (d > R) { fx2 = jx + dx / d * R; fy2 = jy + dy / d * R; }
    const dd = Math.min(d, R), a = Math.acos(clamp((UP * UP + dd * dd - LO * LO) / (2 * UP * dd), -1, 1));
    const base = Math.atan2(dy, dx), side = (FRONT[i] ? 1 : -1) * FS;
    LE[i * 2] = jx + Math.cos(base + side * a) * UP; LE[i * 2 + 1] = jy + Math.sin(base + side * a) * UP;
    LF[i * 2] = fx2; LF[i * 2 + 1] = fy2;
    // foot angle: flat on the floor when planted, otherwise following the shin
    const shin = Math.atan2(fy2 - LE[i * 2 + 1], fx2 - LE[i * 2]) - Math.PI / 2;
    LA[i] = (1 - pl) * shin + pl * clamp(-fy * 0.04, -0.3, 0.3);
  }
}
function seg(ctx, x0, y0, x1, y1, w0, w1, base, dark, lw, lit) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(-dx, dy));
  const path = (c) => capsule(c, L, w0, w1);
  cel(ctx, path, base, dark, { k: 1.4, hi: lit ? C.skH : null, hk: 0.35, lw });
  if (lit) rim(ctx, path, lw, 1.2);
  ctx.restore();
}
function leg(ctx, i, p) {
  const far = FAR[i], front = FRONT[i];
  const base = far ? C.skF : C.sk, dark = far ? C.skFD : C.skD;
  const jx = LJ[i * 2], jy = LJ[i * 2 + 1], ex = LE[i * 2], ey = LE[i * 2 + 1], fx = LF[i * 2], fy = LF[i * 2 + 1];
  seg(ctx, ex, ey, fx, fy, front ? 8.6 : 9.2, 7.4, base, dark, 2.3, !far);
  seg(ctx, jx, jy, ex, ey, front ? 11 : 12.5, front ? 9 : 10, base, dark, 2.4, !far);
  // a glowing crack on the near thigh / upper arm
  if (!far) {
    const mx = (jx + ex) / 2, my = (jy + ey) / 2;
    glow(ctx, (c) => { c.moveTo(mx - 1.5, my - 3); c.lineTo(mx + 0.5, my + 2.5); }, 1.1, 0.8 + 0.2 * Math.sin(T * 3 + i));
  }
  // foot: three stubby toes forward, pale claws
  ctx.save(); ctx.translate(fx, fy); ctx.rotate(LA[i]);
  ctx.fillStyle = far ? C.clawD : C.claw;
  ctx.beginPath();
  for (const [x, y] of [[8.5, 1.4], [10.4, 3.2], [7.6, 4.2]]) { ctx.moveTo(x, y - 1.3); ctx.quadraticCurveTo(x + 3, y - 0.6, x + 3.4, y + 0.9); ctx.lineTo(x, y + 1.1); }
  ctx.fill();
  cel(ctx, (c) => {
    c.moveTo(-5, 0); c.quadraticCurveTo(-4, -4.5, 1, -4.5); c.quadraticCurveTo(6, -4, 8.5, -0.5);
    c.quadraticCurveTo(10.8, 0, 10.4, 2); c.quadraticCurveTo(10.6, 3.4, 9.2, ANK); c.lineTo(-4.4, ANK);
    c.quadraticCurveTo(-6, 2.6, -5, 0); c.closePath();
  }, base, dark, { k: 0.9, lw: 2.3 });
  ink(ctx, (c) => { c.moveTo(5, -0.6); c.quadraticCurveTo(7, 0.4, 8.6, 0.8); c.moveTo(4.6, 2); c.quadraticCurveTo(6.6, 2.8, 8.4, 3); }, 1.1, far ? '#16131a' : C.skL);
  ctx.restore();
}

// -------------------------------------------------- body (body frame)
// a crust of cooled rock split by one wandering flank crack, with forks up to the spine and down to the belly
const CRACK_MAIN = [[-27, -2], [-20, -5], [-12, -3], [-5, -6.5], [3, -4], [11, -7], [19, -5], [26, -7.5]];
const CRACK_FORKS = [[[-20, -5], [-17.5, -10.5]], [[-5, -6.5], [-7.5, -11.5]], [[11, -7], [10, -12]], [[3, -4], [4.5, 1]]];
const HOT = [[-15, -14, 2.2], [6, -16.5, 2.6]];
const NUBS = [[-21, -12.5, 4.2], [-9, -16.6, 4.8], [4, -17.6, 4.8], [16, -15, 4]];
function bodyPath(c) { blob(c, BP, 0.55); }
function body(ctx, p) {
  const heat = clamp(p.heat, 0, 1.2);
  // rocky nubs along the spine (behind the outline)
  cel(ctx, (c) => {
    for (const [x, y, r] of NUBS) { const yy = y + wave(p, x); c.moveTo(x - r, yy + 2); c.quadraticCurveTo(x - r * 0.8, yy - r * 1.1, x + r * 0.2, yy - r * 1.05); c.quadraticCurveTo(x + r, yy - r * 0.6, x + r, yy + 2); c.closePath(); }
  }, C.skH, C.sk, { k: 0.7, lw: 2.2 });
  cel(ctx, bodyPath, C.sk, C.skD, { k: 2.8, hi: C.skH, hk: 0.25, lw: 3.1, detail: (c) => {
    // molten belly with a crusty upper edge and plate lines
    const w0 = (x) => wave(p, x);
    c.fillStyle = C.bel; c.beginPath();
    c.moveTo(-31, 4 + w0(-31));
    // belly up (rolled over) we see more of it
    const bs = FS < 0 ? 8 * clamp(Math.abs(p.fl), 0, 1) : 0;
    const crust = [[-26, 4.6], [-22, 7], [-17, 6], [-12, 8.6], [-6, 7.4], [0, 9.4], [6, 8], [12, 9.6], [18, 7.6], [24, 7], [30, 2]];
    c.lineTo(-31, 4 + w0(-31) - bs);
    for (const [x, y] of crust) c.lineTo(x, y + w0(x) - bs);
    c.lineTo(32, 18); c.lineTo(-32, 18); c.closePath(); c.fill();
    c.fillStyle = C.belH; c.beginPath();
    c.moveTo(-20, 10.5 + w0(-20)); c.quadraticCurveTo(0, 12.5 + w0(0), 22, 9.5 + w0(22)); c.lineTo(22, 11.5 + w0(22)); c.quadraticCurveTo(0, 14.5 + w0(0), -20, 12.5 + w0(-20)); c.closePath(); c.fill();
    c.strokeStyle = C.belL; c.lineWidth = 1.2; c.beginPath();
    for (let x = -20; x <= 20; x += 7.5) { const y = 9 + w0(x) - bs; c.moveTo(x - 1, y); c.quadraticCurveTo(x + 0.5, y + 2.4 + bs * 0.5, x - 0.5, y + 5 + bs); }
    c.stroke();
    c.strokeStyle = C.belD; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-31, 4 + w0(-31) - bs);
    for (const [x, y] of crust) c.lineTo(x, y + w0(x) - bs);
    c.stroke();
    // lava cracks across the back and flanks (they pulse, and blaze with heat)
    const a = Math.min(1, 0.72 + 0.18 * Math.sin(T * 3.1) + heat * 0.35);
    // tapered fissures: filled wedges, wide at the root, sharp at the open end
    const taper = (cc, L, w0x, w1x) => {
      const n = L.length, X = (i) => L[i][0], Y = (i) => L[i][1] + w0(L[i][0]);
      const side = (sg) => { for (let i = 0; i < n; i++) {
        const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1), dx = X(j1) - X(j0), dy = Y(j1) - Y(j0), dl = Math.hypot(dx, dy) || 1;
        const w = lerp(w0x, w1x, i / (n - 1)) * sg, px = X(i) - dy / dl * w, py = Y(i) + dx / dl * w;
        if (sg > 0) { i ? cc.lineTo(px, py) : cc.moveTo(px, py); } else cc.lineTo(px, py);
      } };
      side(1);
      for (let i = n - 1; i >= 0; i--) {
        const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1), dx = X(j1) - X(j0), dy = Y(j1) - Y(j0), dl = Math.hypot(dx, dy) || 1;
        const w = -lerp(w0x, w1x, i / (n - 1));
        cc.lineTo(X(i) - dy / dl * w, Y(i) + dx / dl * w);
      }
      cc.closePath();
    };
    const fiss = (k) => (cc) => {
      taper(cc, CRACK_MAIN.slice(0, 5).reverse(), 1.3 * k, 0.15);       // the main crack is hottest in the middle
      taper(cc, CRACK_MAIN.slice(4), 1.3 * k, 0.15);
      for (const L of CRACK_FORKS) taper(cc, L, 0.9 * k, 0.05);
    };
    c.globalAlpha = 0.5 * a; c.fillStyle = C.lava; c.beginPath(); fiss(2.3 + heat)(c); c.fill();
    c.globalAlpha = 1; c.fillStyle = C.lavaH; c.beginPath(); fiss(1 + heat * 0.3)(c); c.fill();
    // hot spots along the spine
    for (const [x, y, r] of HOT) { const yy = y + w0(x); c.fillStyle = C.lava; c.beginPath(); ellipse(c, x, yy, r * 1.5, r); c.fill(); c.fillStyle = C.lavaH; c.beginPath(); ellipse(c, x, yy, r * 0.8, r * 0.5); c.fill(); }
    // pale speckles (cooled rock) on the back
    c.fillStyle = C.skH; c.beginPath();
    for (const [x, y] of [[-18, -9], [-6, -12], [7, -12.5], [17, -9], [-26, -3]]) { const yy = y + w0(x); c.moveTo(x + 1, yy); c.arc(x, yy, 1, 0, TAU); }
    c.fill();
  } });
  rim(ctx, bodyPath, 3.1, 1.6);
}

// -------------------------------------------------- tail (local space): drags on the floor, flame on the tip
const TN = 9, TSEG = 5.8;
const TX = new Float64Array(TN + 1), TY = new Float64Array(TN + 1), TA = new Float64Array(TN + 1), TW = new Float64Array(TN + 1);
const AX = new Float64Array(TN + 1), AY = new Float64Array(TN + 1), BX = new Float64Array(TN + 1), BY = new Float64Array(TN + 1);
function tail(ctx, p, tb, tc, drag, flame) {
  toLocal(TAIL0[0], TAIL0[1] + wave(p, TAIL0[0]));
  let x = PX, y = PY;
  // base direction: back and drooping by tb, through the body transform
  const bx = -Math.cos(tb * DEG), by = Math.sin(tb * DEG);
  let a = Math.atan2(MB * bx + MD * by, MA * bx + MC * by);
  for (let i = 0; i <= TN; i++) {
    const hw = lerp(8.8, 2.4, Math.pow(i / TN, 0.9));
    if (i) {
      const u = i / TN;
      // curl (+ = down) mirrored with the body flip; the travelling sway; drag bends it when moving
      a -= FS * (tc + p.tsw * Math.sin((p.tp + T * 0.35) * TAU - i * 0.75) * (0.3 + u) - drag * u * 0.5 + (i > TN - 3 ? -9 : 0)) * DEG;
      x += Math.cos(a) * TSEG; y += Math.sin(a) * TSEG;
      const lim = -hw - 0.6;
      if (p.tfloor && y > lim) { y = lim; a = Math.atan2(y - TY[i - 1], x - TX[i - 1]); }
    }
    TX[i] = x; TY[i] = y; TA[i] = a; TW[i] = hw;
    const nx = -Math.sin(a) * hw, ny = Math.cos(a) * hw;
    AX[i] = x + nx; AY[i] = y + ny; BX[i] = x - nx; BY[i] = y - ny;
  }
  cel(ctx, tailPath, C.sk, C.skD, { k: 1.4, hi: C.skH, hk: 0.3, lw: 2.8, detail: (c) => {
    // molten underside stripe (whichever side faces the floor) + glowing bands
    const under = Math.cos(TA[2]) < 0 ? 1 : -1;
    c.strokeStyle = C.bel; c.lineWidth = 3.4; c.beginPath();
    for (let i = 0; i < TN; i++) {
      const xx = TX[i] + -Math.sin(TA[i]) * TW[i] * 0.7 * under, yy = TY[i] + Math.cos(TA[i]) * TW[i] * 0.7 * under;
      i ? c.lineTo(xx, yy) : c.moveTo(xx, yy);
    }
    c.stroke();
    // the flank crack runs on down the tail, forking now and then, and fades out before the tip
    const a = 0.75 + 0.2 * Math.sin(T * 3.4 + 1);
    glow(c, (cc) => {
      const off = (i) => -0.15 * under * (i % 2 ? 1 : -0.6);
      cc.moveTo(TX[0] - Math.sin(TA[0]) * TW[0] * off(0), TY[0] + Math.cos(TA[0]) * TW[0] * off(0));
      for (let i = 1; i < TN - 2; i++) cc.lineTo(TX[i] - Math.sin(TA[i]) * TW[i] * off(i), TY[i] + Math.cos(TA[i]) * TW[i] * off(i));
      for (const i of [2, 5]) {
        const nx = -Math.sin(TA[i]) * -under, ny = Math.cos(TA[i]) * -under, ux = Math.cos(TA[i]), uy = Math.sin(TA[i]);
        cc.moveTo(TX[i] - nx * TW[i] * off(i), TY[i] - ny * TW[i] * off(i));
        cc.lineTo(TX[i] + nx * TW[i] * 0.8 - ux * 2.5, TY[i] + ny * TW[i] * 0.8 - uy * 2.5);
      }
    }, 1.15, a);
  } });
  rim(ctx, tailPath, 2.8, 1.3);
  flameTip(ctx, TX[TN], TY[TN], flame, 1 + 0.5 * clamp(p.flare, 0, 1));
}
function tailPath(c) {
  c.moveTo(AX[0], AY[0]);
  for (let i = 1; i < TN; i++) c.quadraticCurveTo(AX[i], AY[i], (AX[i] + AX[i + 1]) / 2, (AY[i] + AY[i + 1]) / 2);
  c.lineTo(AX[TN], AY[TN]);
  c.quadraticCurveTo(TX[TN] + Math.cos(TA[TN]) * 4, TY[TN] + Math.sin(TA[TN]) * 4, BX[TN], BY[TN]);
  for (let i = TN - 1; i > 0; i--) c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[i - 1]) / 2, (BY[i] + BY[i - 1]) / 2);
  c.lineTo(BX[0], BY[0]);
  c.closePath();
}
// flickering flame on the tail tip: always points up (screen), leaning against the motion
function flameTip(ctx, x, y, lean, size = 1) {
  ctx.save();
  ctx.translate(x, y - 1); ctx.rotate(lean + 0.12 * Math.sin(T * 7.3));
  if (size !== 1) ctx.scale(size, size);
  const f1 = Math.sin(T * 17), f2 = Math.sin(T * 23 + 1.3), f3 = Math.sin(T * 13 + 2.1);
  const H = 17 + 2.5 * f1;
  const tongue = (c, w, h, sw) => {
    c.moveTo(-w, 0);
    c.bezierCurveTo(-w * 1.1, -h * 0.35, -w * 0.3 + sw, -h * 0.55, -w * 0.5 + sw * 1.5, -h * 0.72);
    c.quadraticCurveTo(-w * 0.05, -h * 0.6, sw * 1.4, -h);
    c.quadraticCurveTo(w * 0.35 + sw, -h * 0.62, w * 0.75 + sw * 0.6, -h * 0.66);
    c.bezierCurveTo(w * 0.5, -h * 0.4, w * 1.15, -h * 0.25, w, 0);
    c.quadraticCurveTo(0, w * 0.9, -w, 0);
    c.closePath();
  };
  flat(ctx, (c) => tongue(c, 6.8, H, 1.6 * f2), C.lava, 2.2);
  flat(ctx, (c) => tongue(c, 4.4, H * 0.7, 1.2 * f3), C.lavaH, 0);
  flat(ctx, (c) => tongue(c, 2.2, H * 0.4, 0.6 * f1), C.lavaC, 0);
  // a spark drifting up
  const u = (T * 1.7) % 1;
  ctx.globalAlpha = 1 - u; ctx.fillStyle = C.lavaH;
  ctx.beginPath(); circle(ctx, 3 * Math.sin(T * 5 + u * 4), -H - u * 14, 1.6 * (1 - u * 0.5)); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// -------------------------------------------------- head (head frame: origin at the neck joint, +x forward)
const HEAD = [[-7, 1], [-10.5, -8], [-6.5, -16], [3, -20.5], [16, -21], [28, -17], [36.5, -11], [41.5, -4.5], [39.5, 0.5], [26, 2],
  [12, 2.6], [0, 3]];
const JAW = [[-4, 0.5], [12, 1.6], [26, 1], [38.5, 0.4], [40.5, 4], [35, 9.5], [22, 13], [8, 13], [-2, 9.5], [-6.5, 4]];
const EYE_N = [11, -21.5, 9.4], EYE_F = [25.5, -15.5, 5.2];
function head(ctx, p, hj) {
  toLocal(NECK[0], NECK[1] + wave(p, NECK[0]));
  ctx.save();
  ctx.translate(PX, PY);
  const hr = headAngle(p) - hj * DEG * 0.7;
  ctx.rotate(hr);
  const HF = FS < 0 && p.hflip ? -1 : 1;
  if (HF < 0) ctx.scale(1, -1);        // belly-up head (rolls over with the body)
  const face = p.face, ja = clamp(p.jaw, -2, 60) * DEG;
  // thick neck under the head (cream-hot throat)
  cel(ctx, (c) => { c.moveTo(-17, -9); c.quadraticCurveTo(-10, -17, 4, -14); c.lineTo(9, 8); c.quadraticCurveTo(-2, 14, -12, 9); c.quadraticCurveTo(-20, 3, -17, -9); c.closePath(); },
    C.sk, C.skD, { k: 1.6, lw: 2.4, detail: (c) => { c.fillStyle = C.bel; c.beginPath(); ellipse(c, 2, 7, 8, 6, 0.2); c.fill(); } });
  // far horn + far eye (the skull hides their lower half)
  horn(ctx, -2, -16, -0.25, true);
  // mouth interior: dark, with a molten throat
  if (p.jaw > 1) {
    const [jx, jy] = rotAbout(39.5, 2, HINGE[0], HINGE[1], ja);
    flat(ctx, (c) => { c.moveTo(HINGE[0] - 3, HINGE[1] - 1); c.lineTo(40, 0.5); c.quadraticCurveTo(jx + 3, (jy + 0.5) / 2 + 1, jx, jy); c.closePath(); }, C.mouth, 2.3);
    ctx.save(); ctx.beginPath(); ctx.moveTo(HINGE[0] - 3, HINGE[1] - 1); ctx.lineTo(40, 0.5); ctx.quadraticCurveTo(jx + 3, (jy + 0.5) / 2 + 1, jx, jy); ctx.closePath(); ctx.clip();
    const g = 0.8 + 0.2 * Math.sin(T * 9);
    ctx.fillStyle = C.throat; ctx.beginPath(); ellipse(ctx, 6, 2 + jy * 0.25, 9 * g, 4 + p.jaw * 0.12, ja * 0.4); ctx.fill();
    ctx.fillStyle = C.lavaH; ctx.beginPath(); ellipse(ctx, 3, 2 + jy * 0.22, 4.5 * g, 2 + p.jaw * 0.05, ja * 0.4); ctx.fill();
    ctx.fillStyle = C.tongue; ctx.beginPath(); ellipse(ctx, 18 + 4 * Math.sin(ja), 4 + 8 * Math.sin(ja), 10, 2.8, ja * 0.6); ctx.fill();
    ctx.restore();
    if (p.jaw > 10) flat(ctx, (c) => { for (const x of [14, 21, 28, 35]) { const y = 1.6 - x * 0.03; c.moveTo(x - 2.6, y - 0.5); c.lineTo(x, y + 4.4); c.lineTo(x + 2.6, y - 0.5); c.closePath(); } }, C.tooth, 1.4);
  }
  // lava glob held at the lips until it is spat (spit k < .3)
  if (p.gl > 0.5 && p.jaw > 6) {
    const [gx, gy] = rotAbout(37, 2, HINGE[0], HINGE[1], ja * 0.5);
    flat(ctx, (c) => circle(c, gx, gy, 7), C.lava, 2);
    ctx.fillStyle = C.lavaH; ctx.beginPath(); circle(ctx, gx - 1, gy - 1, 4.2); ctx.fill();
    ctx.fillStyle = C.lavaC; ctx.beginPath(); circle(ctx, gx - 2, gy - 2.5, 2); ctx.fill();
  }
  // lower jaw: molten chin
  ctx.save();
  ctx.translate(HINGE[0], HINGE[1]); ctx.rotate(ja); ctx.translate(-HINGE[0], -HINGE[1]);
  cel(ctx, (c) => blob(c, JAW, 0.45), C.sk, C.skD, { k: 1.2, lw: 2.6, detail: (c) => {
    c.fillStyle = C.bel; c.beginPath(); c.moveTo(-6, 7); c.quadraticCurveTo(14, 9, 36, 6.5); c.lineTo(36, 16); c.lineTo(-6, 16); c.closePath(); c.fill();
    c.strokeStyle = C.belL; c.lineWidth = 1.1; c.beginPath();
    for (const x of [6, 14, 22, 30]) { c.moveTo(x, 8.4); c.quadraticCurveTo(x + 1.4, 10.5, x, 12.6); }
    c.stroke();
  } });
  if (p.jaw > 10) flat(ctx, (c) => { for (const x of [11, 16.5]) { c.moveTo(x - 2.4, 1.5); c.lineTo(x, -2.6); c.lineTo(x + 2.4, 1.5); c.closePath(); } }, C.tooth, 1.4);
  if (p.tongue > 0.05 || face === 'ko') tongue(ctx, p);
  ctx.restore();
  // puffed cheek (bulges behind the upper head)
  const ch = clamp(p.cheek, 0, 1.2);
  if (ch > 0.02) {
    cel(ctx, (c) => ellipse(c, 9, 2, 10 + 6 * ch, 6 + 6.5 * ch), C.sk, C.skD, { k: 1.2, lw: 2.6, detail: (c) => {
      // the swollen cheek glows through, pulsing (2-3 beats over the wind-up)
      const g = clamp(ch * (0.8 + 0.2 * Math.sin(T * 22)), 0, 1);
      c.globalAlpha = g; c.fillStyle = C.lavaD; c.beginPath(); ellipse(c, 9, 2, 10 + 6 * ch, 6 + 6.5 * ch); c.fill();
      c.fillStyle = C.lava; c.beginPath(); ellipse(c, 10, 4, 8.5 + 5.5 * ch, 5 + 5 * ch); c.fill();
      c.fillStyle = C.lavaH; c.beginPath(); ellipse(c, 10.5, 4.5, 6 + 4 * ch, 3.4 + 3.5 * ch); c.fill();
      c.fillStyle = C.lavaC; c.beginPath(); ellipse(c, 11, 4, 3 + 2.8 * ch, 2 + 2 * ch); c.fill(); c.globalAlpha = 1;
      glow(c, (cc) => { cc.moveTo(4, -2 - 3 * ch); cc.lineTo(8, 2); cc.lineTo(5, 6 + 3 * ch); cc.moveTo(8, 2); cc.lineTo(14 + 4 * ch, 1); cc.moveTo(12, 5); cc.lineTo(15, 9 + 3 * ch); }, 1.4, g);
    } });
  }
  // upper head
  cel(ctx, (c) => blob(c, HEAD, 0.5), C.sk, C.skD, { k: 1.4, hi: C.skH, hk: 0.3, lw: 2.9, detail: (c) => {
    // lip edge + head cracks
    c.fillStyle = C.skL; c.beginPath(); c.moveTo(-2, 1); c.quadraticCurveTo(20, 0, 40, -1.5); c.lineTo(40, 2); c.lineTo(-2, 4); c.closePath(); c.fill();
    const a = Math.min(1, 0.75 + 0.15 * Math.sin(T * 3.1 + 2) + clamp(p.heat, 0, 1) * 0.3);
    glow(c, (cc) => { cc.moveTo(22, -16); cc.lineTo(25.5, -10.5); cc.lineTo(22.5, -6.5); cc.lineTo(24.5, -2.5); cc.moveTo(25.5, -10.5); cc.lineTo(31, -9); }, 1.2, a);
  } });
  rim(ctx, (c) => blob(c, HEAD, 0.5), 2.9, 1.5);
  // two snaggle fangs poke up from the jaw over the upper lip (an under-bite: drawn over the head)
  ctx.save();
  ctx.translate(HINGE[0], HINGE[1]); ctx.rotate(ja); ctx.translate(-HINGE[0], -HINGE[1]);
  flat(ctx, (c) => { c.moveTo(21.5, 2.4); c.lineTo(23.4, -3); c.lineTo(25.4, 2.3); c.closePath(); c.moveTo(29.2, 2.1); c.lineTo(31.2, -4); c.lineTo(33.2, 1.9); c.closePath(); }, C.tooth, 1.6);
  ctx.restore();
  // nostril + mouth corner
  ink(ctx, (c) => { c.moveTo(35.5, -10); c.quadraticCurveTo(37.6, -11, 38.6, -8.8); }, 1.8);
  if (ch > 0.3) ink(ctx, (c) => { c.moveTo(22, 1.6); c.quadraticCurveTo(26, 0, 30, 1.4); c.quadraticCurveTo(34, 2.6, 38, 0.8); }, 1.6);   // lips pressed shut
  if (face === 'smug') ink(ctx, (c) => { c.moveTo(3, 2); c.quadraticCurveTo(-1.5, 1, -3, -2.5); }, 2.2);
  else if (p.jaw < 6) ink(ctx, (c) => { c.moveTo(3, 2.4); c.quadraticCurveTo(-0.5, 3.4, -2.5, 6.5); }, 2.2);    // grumpy frown
  horn(ctx, -6.5, -12.5, 0.05, false);
  eye(ctx, EYE_F[0], EYE_F[1], EYE_F[2], p, true);     // far eye sits on the snout bridge (no bump on the skull)
  eye(ctx, EYE_N[0], EYE_N[1], EYE_N[2], p, false);
  if (face === 'ko' || p.stars) stars(ctx, hr, HF);
  ctx.restore();
}
function horn(ctx, x, y, a, far) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  cel(ctx, (c) => { c.moveTo(-3.6, 2); c.quadraticCurveTo(-5, -4, -11, -8.5); c.quadraticCurveTo(-1.5, -8, 4, 1.5); c.closePath(); },
    far ? C.hornD : C.horn, C.hornD, { k: 0.8, lw: 2.2 });
  ctx.restore();
}
function tongue(ctx, p) {
  const w = Math.sin(T * 11) * (p.face === 'smug' ? 3 : 0.6);
  const L = p.face === 'ko' ? 1 : clamp(p.tongue, 0, 2);
  flat(ctx, (c) => {
    c.moveTo(28, 4); c.quadraticCurveTo(38 + 4 * L, 4 + w, 41 + 4 * L, 9 + 4 * L + w);
    c.quadraticCurveTo(40 + 4 * L, 14 + 4 * L, 35 + 2 * L, 12 + 2 * L); c.quadraticCurveTo(33, 9, 26, 8); c.closePath();
  }, C.tongue, 2);
  ink(ctx, (c) => { c.moveTo(31, 7); c.quadraticCurveTo(36 + 2 * L, 8 + w * 0.5, 38 + 3 * L, 11 + 3 * L); }, 1.1, C.tongueD);
}
function eye(ctx, x, y, r, p, far) {
  const face = p.face;
  const shut = face === 'ouch' || (p.blink && face !== 'ko');
  const lw = far ? 2.2 : 2.6;
  if (shut) {
    // the lids squeeze the bulge flat: a ">" squint (ouch) or a sleepy curve (blink)
    const yy = y + r * 0.3;
    flat(ctx, (c) => ellipse(c, x, yy, r * 0.95, r * 0.62), far ? C.skF : C.sk, lw);
    if (face === 'ouch') {
      // squeezed shut: a cream wedge with a hard ">" crease, so the hurt face reads on a dark body
      flat(ctx, (c) => { c.moveTo(x - r * 0.75, yy - r * 0.5); c.lineTo(x + r * 0.55, yy); c.lineTo(x - r * 0.75, yy + r * 0.5); c.quadraticCurveTo(x - r * 0.45, yy, x - r * 0.75, yy - r * 0.5); c.closePath(); }, C.eyeW, far ? 1.6 : 2);
      ink(ctx, (c) => { c.moveTo(x - r * 0.62, yy - r * 0.34); c.lineTo(x + r * 0.35, yy); c.lineTo(x - r * 0.62, yy + r * 0.34); }, far ? 1.4 : 1.8);
      if (!far) {
        ink(ctx, (c) => { c.moveTo(x - r * 1.1, yy - r * 0.95); c.quadraticCurveTo(x, yy - r * 0.62, x + r * 0.95, yy - r * 1.05); }, 3);
        // sweat drops flying off (not while the head is upside down)
        if (!(p.hflip && FS < 0)) flat(ctx, (c) => { for (const [dx, dy, k] of [[-r * 1.5, -r * 1.3, 1], [-r * 2, -r * 0.4, 0.75]]) { const sx = x + dx, sy = yy + dy; c.moveTo(sx, sy - 4 * k); c.quadraticCurveTo(sx + 3 * k, sy, sx, sy + 2.6 * k); c.quadraticCurveTo(sx - 3 * k, sy, sx, sy - 4 * k); c.closePath(); } }, C.sweat, 1.4);
      }
    } else ink(ctx, (c) => { c.moveTo(x - r * 0.75, yy - 0.5); c.quadraticCurveTo(x, yy + r * 0.32, x + r * 0.75, yy - 0.5); }, 2);
    return;
  }
  flat(ctx, (c) => circle(c, x, y, r), C.eyeW, 0);
  ctx.save();
  ctx.beginPath(); circle(ctx, x, y, r); ctx.clip();
  ctx.fillStyle = C.eyeD; ctx.beginPath(); circle(ctx, x + r * 0.3, y + r * 0.45, r * 0.85); ctx.fill();
  ctx.fillStyle = C.eyeW; ctx.beginPath(); circle(ctx, x - r * 0.1, y - r * 0.1, r * 0.86); ctx.fill();
  if (face === 'ko') {
    ctx.restore();
    ink(ctx, (c) => { for (let a = 0; a < 4 * Math.PI; a += 0.35) { const rr = r * 0.8 * a / (4 * Math.PI), aa = a + T * 6; a ? c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr) : c.moveTo(x, y); } }, 1.5);
    ctx.save(); ctx.beginPath(); circle(ctx, x, y, r); ctx.clip();
  } else {
    const wide = face === 'yell' || face === 'puff';
    const ix = x + r * (face === 'smug' ? 0.05 : 0.32), iy = y + r * (face === 'puff' ? -0.05 : 0.12), ir = r * (wide ? 0.42 : 0.55);
    const red = p.glint > 0.3;
    ctx.fillStyle = red ? '#b3170f' : C.irisD; ctx.beginPath(); circle(ctx, ix, iy, ir); ctx.fill();
    ctx.fillStyle = red ? '#ff3a1c' : C.iris; ctx.beginPath(); circle(ctx, ix - ir * 0.12, iy - ir * 0.12, ir * 0.72); ctx.fill();
    ctx.fillStyle = C.pupil; ctx.beginPath(); circle(ctx, ix, iy, ir * 0.48); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, ix - ir * 0.4, iy - ir * 0.45, ir * 0.3); ctx.fill();
  }
  // lids: grumpy (low at the snout), yelling (raised, still angry), smug (flat, half shut + lower lid up)
  let l0 = null, l1 = null, low = null;
  if (face === 'mean') { l0 = -0.82; l1 = 0.16; }
  else if (face === 'yell') { l0 = -0.78; l1 = -0.36; }
  else if (face === 'puff') { l0 = -0.72; l1 = -0.22; }
  else if (face === 'smug') { l0 = -0.12; l1 = -0.04; low = 0.48; }
  if (l0 !== null) {
    ctx.fillStyle = far ? C.skF : C.sk;
    ctx.beginPath(); ctx.moveTo(x - r - 1, y - r - 2); ctx.lineTo(x + r + 1, y - r - 2); ctx.lineTo(x + r + 1, y + r * l1); ctx.lineTo(x - r - 1, y + r * l0); ctx.closePath(); ctx.fill();
  }
  if (low !== null) { ctx.fillStyle = far ? C.skF : C.sk; ctx.beginPath(); ctx.moveTo(x - r - 1, y + r + 2); ctx.lineTo(x + r + 1, y + r + 2); ctx.lineTo(x + r + 1, y + r * low); ctx.lineTo(x - r - 1, y + r * (low + 0.1)); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ink(ctx, (c) => circle(c, x, y, r), lw);
  // heavy brow along the lid edge, running past the eye (the grump)
  if (l0 !== null) {
    // the lid edge; on the near eye a heavy brow wedge, thickest over the snout end, pushing down into the eye
    const ax = x - r * 1.1, ay = y + r * l0, bx = x + r * 1.08, by = y + r * l1;
    if (far) ink(ctx, (c) => { c.moveTo(ax, ay); c.lineTo(bx, by); }, 2.4);
    else {
      const ux = bx - ax, uy = by - ay, L = Math.hypot(ux, uy) || 1, nx = uy / L, ny = -ux / L;
      const wedge = (c) => { c.moveTo(ax + ux * 0.04, ay + uy * 0.04); c.lineTo(bx + ux * 0.06, by + uy * 0.06 + 1); c.lineTo(bx + nx * 4.2, by + ny * 4.2);
        c.quadraticCurveTo(x + nx * 2.6, y + r * (l0 + l1) / 2 + ny * 2.6, ax + ux * 0.04 + nx * 0.8, ay + uy * 0.04 + ny * 0.8); c.closePath(); };
      flat(ctx, wedge, INK, 1.4);
    }
  }
  if (low !== null) ink(ctx, (c) => { c.moveTo(x - r * 0.95, y + r * (low + 0.1)); c.lineTo(x + r * 0.95, y + r * low); }, 2);
}
function stars(ctx, hr, HF) {
  ctx.save();
  ctx.translate(12, -32 * HF);
  ctx.scale(1, HF);
  ctx.rotate(-hr);
  for (let i = 0; i < 3; i++) {
    const a = T * 4 + i * TAU / 3, sx = Math.cos(a) * 14, sy = Math.sin(a) * 4;
    flat(ctx, (c) => {
      for (let j = 0; j < 8; j++) { const rr = j % 2 ? 1.5 : 4, aa = j * Math.PI / 4 - Math.PI / 2; j ? c.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr) : c.moveTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr); }
      c.closePath();
    }, C.star, 1.5);
  }
  ctx.restore();
}

// -------------------------------------------------- fx: bite smear, smoke puff
function smear(ctx, p) {
  const a = clamp(p.smear, 0, 1), [mx, my] = mouthOf(p, true);
  ctx.save();
  ctx.globalAlpha = 0.8 * a; ctx.fillStyle = '#fff3d6';
  // chomp crescent sweeping down in front of the jaws
  ctx.translate(mx, my);
  ctx.beginPath();
  ctx.moveTo(-4, -18); ctx.quadraticCurveTo(22, -12, 15, 10); ctx.quadraticCurveTo(9, 19, -5, 17);
  ctx.quadraticCurveTo(9, 6, 7, -3); ctx.quadraticCurveTo(5, -11, -4, -18); ctx.closePath(); ctx.fill();
  // speed lines trailing back over the spine and under the belly
  ctx.strokeStyle = '#fff3d6'; ctx.lineCap = 'round'; ctx.lineWidth = 2.4; ctx.beginPath();
  ctx.moveTo(-46, -my - 66); ctx.lineTo(-90, -my - 66); ctx.moveTo(-62, -my - 6); ctx.lineTo(-92, -my - 6); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}
// a little white glint on the fang (lunge tell)
function fangGlint(ctx, p) {
  const [mx, my] = mouthOf(p, true), r = 3 + 3 * clamp(p.glint, 0, 1);
  ctx.save(); ctx.translate(mx - 4, my - 6);
  ctx.fillStyle = '#fffbe8'; ctx.beginPath();
  ctx.moveTo(0, -r * 1.6); ctx.quadraticCurveTo(0, 0, r, 0); ctx.quadraticCurveTo(0, 0, 0, r * 1.6); ctx.quadraticCurveTo(0, 0, -r, 0); ctx.quadraticCurveTo(0, 0, 0, -r * 1.6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
// a puff of dust and smoke while it scrabbles over onto its feet
const PUFF = [];
function rollDust(ctx, u) {
  const a = Math.sin(Math.PI * clamp(u, 0, 1));
  ctx.save();
  for (const [dx, dy, r, ph] of [[-22, -10, 11, 0], [-6, -18, 13, 0.6], [12, -12, 12, 1.3], [26, -6, 9, 2], [2, -4, 10, 2.7]]) {
    const R = r * (0.55 + 0.6 * a) * (1 + 0.06 * Math.sin(T * 9 + ph)), x = MX + dx * (0.8 + 0.4 * u), y = dy * (0.9 + 0.3 * u) - 2;
    ctx.globalAlpha = Math.min(1, a * 1.6);
    PUFF.push(x, y, R);
  }
  // one cloud: all the outlines first, then all the fills over them (no ink between the puffs)
  const cloud = (c, k) => { for (let i = 0; i < PUFF.length; i += 3) circle(c, PUFF[i], PUFF[i + 1], PUFF[i + 2] + k); };
  ctx.beginPath(); cloud(ctx, 1.3); ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath(); cloud(ctx, 0); ctx.fillStyle = C.smokeL; ctx.fill();
  ctx.fillStyle = '#ddd5da'; ctx.beginPath();
  for (let i = 0; i < PUFF.length; i += 3) circle(ctx, PUFF[i] - PUFF[i + 2] * 0.3, PUFF[i + 1] - PUFF[i + 2] * 0.35, PUFF[i + 2] * 0.4);
  ctx.fill();
  PUFF.length = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}
// yellow impact star where the jaws snap shut
function chomp(ctx, p) {
  const [mx, my] = biteOf(p, true), u = clamp(p.chomp, 0, 1), R = 9 + 7 * (1 - u);
  ctx.save(); ctx.translate(mx + 4, my - 2); ctx.rotate(0.3);
  ctx.globalAlpha = Math.min(1, u * 1.5);
  flat(ctx, (c) => { for (let j = 0; j < 12; j++) { const rr = j % 2 ? R * 0.42 : R, a = j * Math.PI / 6; j ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); }, C.lavaH, 2);
  ctx.fillStyle = C.lavaC; ctx.beginPath(); circle(ctx, 0, 0, R * 0.32); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}
function smoke(ctx, p) {
  const [mx, my] = mouthOf(p, true), u = clamp(p.puff, 0, 1);
  ctx.save();
  ctx.translate(mx + 4 + u * 10, my - 4 - u * 20);
  ctx.globalAlpha = 1 - u * u;
  for (const [dx, dy, r] of [[0, 0, 4.5], [5, -3, 3.6], [-3, -5, 3.2]]) {
    const R = r * (0.6 + u * 1.2);
    flat(ctx, (c) => circle(c, dx * (0.6 + u), dy * (0.6 + u), R), C.smoke, 1.6);
    ctx.fillStyle = C.smokeL; ctx.beginPath(); circle(ctx, dx * (0.6 + u) - R * 0.3, dy * (0.6 + u) - R * 0.3, R * 0.4); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// -------------------------------------------------- the projectile
const GLOB = [[11, 0], [7.5, -7.8], [0, -10.6], [-7.5, -8], [-11, -0.5], [-7.6, 7.8], [0, 10.4], [7.8, 7.5]];
const GP = GLOB.map((q) => [q[0], q[1]]);
/**
 * A lava glob (~22 px) with a little trail, centred on ctx (screen), unscaled.  (vx, vy): direction of travel
 * on screen (the trail points the other way; default = moving right).  scale = the game scale.
 */
export function drawGlob(ctx, t, vx = 1, vy = 0, scale = 1) {
  T = t;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.rotate(Math.atan2(vy, vx));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // trail: shrinking drips + a heat streak
  ctx.globalAlpha = 0.35; ctx.fillStyle = C.lava;
  ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(-26, -6, -40, 0); ctx.quadraticCurveTo(-26, 6, -4, 8); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 3; i++) {
    const x = -15 - i * 9 + Math.sin(t * 20 + i) * 1, y = Math.sin(t * 13 + i * 2) * 2, r = 5.2 - i * 1.4;
    flat(ctx, (c) => circle(c, x, y, r), i ? C.lava : C.lavaH, 1.6);
  }
  // wobbling blob: hot core, crusty dark flecks
  for (let i = 0; i < GLOB.length; i++) {
    const w = 1 + 0.06 * Math.sin(t * 16 + i * 1.9);
    GP[i][0] = GLOB[i][0] * w * (i === 0 ? 1.06 : 1); GP[i][1] = GLOB[i][1] * w;
  }
  cel(ctx, (c) => blob(c, GP, 0.55), C.lava, C.lavaD, { k: 1.3, hi: C.lavaH, hk: 0.5, lw: 2.5, detail: (c) => {
    c.fillStyle = C.lavaC; c.beginPath(); ellipse(c, -1.5, -2.5, 5, 3.8, -0.4); c.fill();
    c.fillStyle = '#5a2414'; c.beginPath();
    circle(c, 4, 4.5, 1.8); circle(c, -5, 5, 1.3); circle(c, 6.5, -3, 1.1); c.fill();
  } });
  // a spark flying off
  const u = (t * 3) % 1;
  ctx.globalAlpha = 1 - u; ctx.fillStyle = C.lavaH;
  ctx.beginPath(); circle(ctx, -6 - u * 16, -9 - u * 6, 1.5); circle(ctx, -10 - u * 12, 8 + u * 5, 1.2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}
