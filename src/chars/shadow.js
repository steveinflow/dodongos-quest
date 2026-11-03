// Shadow: the silent kid ninja, playable hero.  Art (drawn in code from the book's character sheet) + his poses.
//
// Design: a 10-year-old ninja, ~140 px like Dodongo, fully masked in charcoal-black and deep purple.  A rounded
// hood-mask with a centre seam and ONE horizontal eye slit (calm dark eyes + brows: that slit is his whole face),
// a long CRIMSON scarf wrapped round the neck with two long swallow-tailed tails, a short-sleeved black top with a
// purple crossover collar, purple-wrapped bracers, a purple sash with a silver buckle, a black tabard with purple
// trim, baggy purple-black trousers wrapped at the shins, black tabi boots, and ONE short sword (black-wrapped
// hilt, small gold guard) in a black scabbard slung across his back, hilt up over his right shoulder.
// He never speaks: all his acting is body language and the eye slit (calm, focus, happy ^ ^, surprised, ouch,
// worried, ko, closed, wink).
//
// Local space as for every hero: origin on the floor under the hips, +x = the way he faces, y down; limb angles in
// degrees, + = swung forward (applied as rotate(-a)).  Facing left mirrors the whole drawing (the sword arm stays
// the near arm, which reads best for a sword fighter).
//
// Pose fields (BASE below): x/y offsets, rot (+ = lean back) about rc px above the hips, sq squash, spin (deg, a
// cut-out turn about x = spx for the spinning kick), tor (+ = lean forward), head (+ = chin down), yaw (-1..1 face
// turned back/forward), lx/ly eye look.  Near (sword) arm au/af/ah + hand shape ahs, far arm bu/bf/bh + bhs,
// as/bs arm stretch.  Legs nt/ns/nf, ft/fs/ff (thigh, knee bend (-), absolute foot angle (+ = toe up)).
// Sword: sw 'back' (in the scabbard, slid out by sp 0..0.45) | 'hand' (near hand, blade angle swa rel. to the
// hand; al 0..1 aligns it with the scabbard for sheathing); grab 0..1 = near hand IK'd onto the hilt on his back.
// stars = shurikens fanned in the near hand, glint = eye sparkle, tw = sword-twirl blur, smear/sa0/sa1/sr/scx/scy/
// sfy/sth = slash crescent (torso frame, angles like limbs), kick = streak along the near leg, dash = speed lines,
// wind = extra breeze on the scarf, tab = extra tabard swing, auto = may auto-sheathe (idle/walk/run...),
// armL 'front' | 'mid' (near arm behind the head) | 'back' (behind the torso), farFront (far arm over the torso),
// air = fixed hip height AIRH - y, hide = not drawn (Shadow Strike vanish; o.ghost draws it anyway).
//
// Secondary motion (o.mem + o.vel): scarf tails, sash ends, tabard and back flap lag, whip and settle; the tails
// swing round when he turns, wrap in spins and lie on the floor when he is down.  After a sword move ends in a pose
// with `auto`, the draw plays a quick sheathe flourish from o.mem (none without mem).
import { cel, flat, ink, capsule, blob, ellipse, circle, keys, mix, DEG, TAU, clamp, lerp, follow } from '../rig.js';
import { INK } from '../config.js';

const C = {
  cl: '#3e3848', clD: '#29242f', clH: '#5b5369', clF: '#35303e', clFD: '#25212b', clL: '#1b1720',
  sl: '#524a62', slD: '#383145', slF: '#463f54', slFD: '#2f2a3a',
  hood: '#3b3545', hoodD: '#25212c', hoodH: '#5f566f',
  pu: '#7c58ae', puD: '#553a7e', puH: '#a585d8', puL: '#3b2858', puF: '#67499a', puFD: '#47316c',
  tr: '#4d3d66', trD: '#33294b', trH: '#6a588f', trL: '#241b34', trF: '#413459', trFD: '#2d2442',
  boot: '#36323e', bootD: '#24202a', bootF: '#2e2a35', bootFD: '#1f1c24', sole: '#16131a',
  sc: '#bb303b', scD: '#7e1a25', scH: '#e45e60', scL: '#5c111a', scF: '#9a2632', scFD: '#66141f',
  skin: '#f6c7a6', skinD: '#dc977a', skinH: '#ffe3cf', skinF: '#e8b394', skinFD: '#c98468',
  iris: '#3e2b25', irisL: '#80604f', pupil: '#120a0c', white: '#f3eee5', brow: '#2a1b1b',
  gold: '#e3b24b', goldD: '#9b7121', goldH: '#fbe6a0',
  steel: '#d6dfea', steelD: '#9aa6b7', steelH: '#ffffff', spine: '#6b778a',
  silver: '#c3c9d2', silverD: '#7b838f',
  wrap: '#2a2531', wrapL: '#776b8c',
  scab: '#302a38', scabD: '#1f1b26', scabH: '#574e68',
  rim: '#b6a7e4', rimHood: '#9b8dc9', hoodLit: '#4a4357', seamL: '#71688a', seamD: '#141018',
  smO: '#a9daff', smI: '#ffffff', smE: '#5f9cef',
};

// ---------------------------------------------------------------- skeleton (px at scale 1)
const THIGH = 26, SHIN = 25, FOOT_H = 7.5, HEEL_X = -6, TOE_X = 14.5;
const UPPER = 17, FORE = 16, HANDC = 5;          // hand centre sits HANDC past the wrist
const HIP_NEAR = [-2, 0], HIP_FAR = [4, -1];
const SLOT_NEAR = [-8.5, -32], SLOT_FAR = [6, -33];
const NECK = [2, -37], HC = [3, -24];            // neck joint (torso frame), skull centre (head frame)
const AIRH = 55;                                  // hip height of `air` poses (pose.y offsets it)
const SCAB_M = [-20, -46], SCAB_A = 47, SCAB_L = 62;   // scabbard mouth (torso frame), axis (deg, towards the tip)
const SA_S = Math.sin(SCAB_A * DEG), SA_C = Math.cos(SCAB_A * DEG);
const BLADE = 37, GUARD = 5.5;                    // sword frame: fist centre at 0, guard at +GUARD, pommel at -16
const KNOT = [-11, -37];
const SASH_END = [-13.5, -11];
const OUT = 3.1;

// ---------------------------------------------------------------- tiny FK / IK helpers
class Mat {
  constructor() { this.reset(); }
  reset() { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; return this; }
  translate(x, y) { this.e += this.a * x + this.c * y; this.f += this.b * x + this.d * y; }
  rotate(r) {
    const cs = Math.cos(r), sn = Math.sin(r), a = this.a, b = this.b, c = this.c, d = this.d;
    this.a = a * cs + c * sn; this.b = b * cs + d * sn; this.c = c * cs - a * sn; this.d = d * cs - b * sn;
  }
  scale(x, y) { this.a *= x; this.b *= x; this.c *= y; this.d *= y; }
  px(x, y) { return this.a * x + this.c * y + this.e; }
  py(x, y) { return this.b * x + this.d * y + this.f; }
}
const MT = new Mat();

// 2-bone IK in the rig convention (0 = down, + = forward).  bend +1: the lower bone swings forward (elbows),
// -1: the joint points forward (knees).  Result in IKR = [upper, lower rel, stretch].
const IKR = [0, 0, 1];
function ik2(dx, dy, L1, L2, bend, maxStretch = 1) {
  let D = Math.hypot(dx, dy) || 0.001;
  let st = 1;
  if (D > (L1 + L2) * 0.999) {
    st = Math.min(maxStretch, D / ((L1 + L2) * 0.999));
    L1 *= st; L2 *= st;
    D = Math.min(D, (L1 + L2) * 0.999);
  }
  D = Math.max(D, Math.abs(L1 - L2) + 0.01);
  const phi = Math.atan2(dx, dy);
  const a = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const b = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
  IKR[0] = (phi - bend * a) / DEG;
  IKR[1] = bend * (Math.PI - b) / DEG;
  IKR[2] = st;
  return IKR;
}

function footDrop(fa) {          // lowest sole point below the ankle for an absolute foot angle (deg, + = toe up)
  const r = fa * DEG, s = Math.sin(r), c = Math.cos(r);
  return Math.max(-HEEL_X * s + FOOT_H * c, -TOE_X * s + FOOT_H * c);
}
function legDrop(a, s, fa) { return Math.cos(a * DEG) * THIGH + Math.cos((a + s) * DEG) * SHIN + footDrop(fa); }

/** Hip height above the floor: air poses are fixed, grounded poses plant the lowest point of either foot. */
export function hipHeight(p) {
  if (p.air) return AIRH - p.y;
  return Math.max(HIP_NEAR[1] + legDrop(p.nt, p.ns, p.nf), HIP_FAR[1] + legDrop(p.ft, p.fs, p.ff)) - p.y;
}
function spinScale(spin) {
  const c = Math.cos(spin * DEG);
  return Math.abs(c) < 0.5 ? (c < 0 ? -0.5 : 0.5) : c;
}
/** root (feet) frame -> hip frame; T is a canvas context or a Mat */
function bodyXf(T, p, H) {
  T.translate(p.x, -H);
  if (p.rot) { T.translate(0, -p.rc); T.rotate(-p.rot * DEG); T.translate(0, p.rc); }
  if (p.spin) { T.translate(p.spx, 0); T.scale(spinScale(p.spin), 1); T.translate(-p.spx, 0); }
}
/** grip centre of the sheathed sword slid out by sp (torso frame) */
function hiltX(sp) { return SCAB_M[0] - SA_S * (GUARD + sp * BLADE); }
function hiltY(sp) { return SCAB_M[1] - SA_C * (GUARD + sp * BLADE); }

// near-arm angles actually drawn (grab IK applied): module scratch
let AU = 0, AF = 0, AH = 0, AST = 1;
function nearArm(p) {
  AU = p.au; AF = p.af; AH = p.ah; AST = p.as;
  if (p.grab > 0.001) {
    const sp = p.sp;
    ik2(hiltX(sp) - SLOT_NEAR[0], hiltY(sp) - SLOT_NEAR[1] + p.shr, UPPER, FORE + HANDC, 1);
    const g = clamp(p.grab, 0, 1);
    AU = lerp(AU, IKR[0], g); AF = lerp(AF, IKR[1], g); AH = lerp(AH, 0, g); AST = lerp(AST, 1, g);
  }
}

// ---------------------------------------------------------------- poses
export const BASE = {
  x: 0, y: 0, rot: 0, rc: 0, sq: 1, spin: 0, spx: 0,
  tor: 8, head: -2, yaw: 0, lx: 0, ly: 0,
  au: 14, af: 30, ah: 0, ahs: 'fist', as: 1, shr: 0,
  bu: 10, bf: 34, bh: 0, bhs: 'fist', bs: 1,
  nt: -10, ns: -14, nf: 0, ft: 14, fs: -18, ff: 0,
  sw: 'back', swa: 90, al: 0, grab: 0, sp: 0,
  stars: 0, glint: 0, tw: 0,
  face: 'calm', blink: false,
  smear: 0, sa0: 0, sa1: 0, sr: 50, scx: -8.5, scy: -32, sfy: 1, sth: 14, sm: 1,
  kick: 0, dash: 0, thr: 0, wind: 0, tab: 0,
  air: false, auto: false, hide: false, armL: 'front', farFront: false, farHand: false, flip: 0, lie: 0, tum: 0,
};
const P = (o) => Object.assign({}, BASE, o);
const e3 = (u) => u * u * (3 - 2 * u);

/** A grounded pose as an `air` pose with the same hip height (lets keys blend lying/rolling into standing). */
function asAir(p) { const H = hipHeight(p); p.air = true; p.y = AIRH - H; return p; }
/** Seat a lying / rolling pose: lowest of hood, back, butt, knees and feet rests on the floor (+ lift px). */
function groundAir(p, lift = 0) {
  const m = MT.reset();
  bodyXf(m, p, 0);
  let low = -1e9;
  for (let n = 0; n < 2; n++) {
    const hip = n ? HIP_FAR : HIP_NEAR, a = (n ? p.ft : p.nt) * DEG, b = a + (n ? p.fs : p.ns) * DEG;
    const kx = hip[0] + Math.sin(a) * THIGH, ky = hip[1] + Math.cos(a) * THIGH;
    low = Math.max(low, m.py(kx, ky) + 7, m.py(kx + Math.sin(b) * SHIN, ky + Math.cos(b) * SHIN) + 7);
  }
  m.rotate(p.tor * DEG);
  low = Math.max(low, m.py(-14.5, -30), m.py(-13.5, -12), m.py(-9, 6), m.py(14, -10), m.py(13, -34));
  for (let n = 0; n < 2; n++) {
    const sl = n ? SLOT_FAR : SLOT_NEAR, a = (n ? p.bu : p.au) * DEG, b = a + (n ? p.bf : p.af) * DEG;
    const ex = sl[0] + Math.sin(a) * UPPER, ey = sl[1] + Math.cos(a) * UPPER;
    low = Math.max(low, m.py(ex + Math.sin(b) * (FORE + 9), ey + Math.cos(b) * (FORE + 9)) + 2);
  }
  const hr = p.head * DEG;
  const hx = NECK[0] + Math.cos(hr) * HC[0] - Math.sin(hr) * HC[1], hy = NECK[1] + Math.sin(hr) * HC[0] + Math.cos(hr) * HC[1];
  low = Math.max(low, m.py(hx, hy) + 21);
  p.air = true; p.y = AIRH - (low + lift);
  return p;
}

// ready stance (the book's: fists up, weight low, calm eyes)
const STANCE = { tor: 11, head: -3, nt: -16, ns: -20, ft: 21, fs: -30, au: 22, af: 104, ah: -10, bu: 40, bf: 92, bh: -6 };
// sword-ready guard (spin-kick wind-up): blade low and forward
const GUARD_P = { sw: 'hand', ahs: 'grip', tor: 14, head: -2, nt: -18, ns: -22, ft: 24, fs: -34, au: 34, af: 40, ah: -10,
  swa: 64, bu: 30, bf: 88, face: 'focus', auto: true };
// each slash finishes in its own silhouette: atk1 low diagonal cut-through, atk2 blade high overhead, atk3 a held
// full-length thrust, runAtk blade trailing behind after passing through
const END1 = { sw: 'hand', ahs: 'grip', tor: 22, head: 2, nt: -24, ns: -14, ft: 34, fs: -42, au: 30, af: 6, ah: 0, swa: 34,
  bu: -26, bf: 54, face: 'focus', auto: true };
const END2 = { sw: 'hand', ahs: 'grip', tor: -2, head: -8, nt: -14, ns: -10, ft: 26, fs: -24, au: 178, af: 12, ah: -6, swa: 64,
  bu: -30, bf: 56, face: 'focus', auto: true };
const END3 = { sw: 'hand', ahs: 'grip', tor: 20, head: 2, nt: -28, ns: -8, ft: 42, fs: -42, au: 102, af: 8, ah: 0, swa: 0,
  bu: -40, bf: 30, bhs: 'open', face: 'focus', auto: true };
const ENDR = { sw: 'hand', ahs: 'grip', tor: 14, head: 0, nt: -16, ns: -20, ft: 21, fs: -30, au: -52, af: -6, ah: 0, swa: -4,
  bu: 46, bf: 74, face: 'calm', auto: true };

// --- gait: feet planted by IK while the engine moves the actor (one cycle = L px)
function gaitFoot(p, near, u, L, H, stance, lift, cx) {
  const hip = near ? HIP_NEAR : HIP_FAR;
  const span = L * stance;
  let ax, ay, fa;
  if (u < stance) {
    const s = u / stance;
    const tx = cx + span / 2 - s * span + TOE_X;       // toe contact, sliding back with the floor
    fa = s > 0.7 ? -26 * e3((s - 0.7) / 0.3) : 0;       // heel peels off late in the stance, toe stays put
    const r = -fa * DEG, cs = Math.cos(r), sn = Math.sin(r);
    ax = tx - (TOE_X * cs - FOOT_H * sn);
    ay = H - (TOE_X * sn + FOOT_H * cs);
  } else {
    // swing: from the toe-off ankle (foot at -26 deg pivoting on the toe) to a flat landing one span ahead
    const s = (u - stance) / (1 - stance), e = e3(s);
    const r = 26 * DEG, x0 = cx - span / 2 + TOE_X - (TOE_X * Math.cos(r) - FOOT_H * Math.sin(r));
    const y0 = H - (TOE_X * Math.sin(r) + FOOT_H * Math.cos(r));
    ax = lerp(x0, cx + span / 2, e) + 4 * Math.sin(Math.PI * s);
    ay = lerp(y0, H - FOOT_H, e) - lift * Math.pow(Math.sin(Math.PI * s), 0.8);
    fa = -26 * (1 - e3(Math.min(1, s * 2.2))) + 12 * Math.sin(Math.PI * s);
  }
  ik2(ax - hip[0], ay - hip[1], THIGH, SHIN, -1);
  if (near) { p.nt = IKR[0]; p.ns = IKR[1]; p.nf = fa; } else { p.ft = IKR[0]; p.fs = IKR[1]; p.ff = fa; }
}

// --- carrying: both hands under the object's bottom corners, fixed in the feet frame
export const CARRY_POINT = [5, -142];
function carryArms(p) {
  p.farHand = true;
  const H = hipHeight(p), r = p.tor * DEG, cs = Math.cos(r), sn = Math.sin(r);
  for (const near of [true, false]) {
    const slot = near ? SLOT_NEAR : SLOT_FAR;
    const hx = CARRY_POINT[0] + (near ? -12 : 15), hy = CARRY_POINT[1] + 2.5;
    // feet frame -> torso frame (inverse of translate(x,-H) . rotate(tor))
    const dx = hx - p.x, dy = hy + H;
    const tx = dx * cs + dy * sn, ty = -dx * sn + dy * cs;
    ik2(tx - slot[0], ty - slot[1] + p.shr, UPPER, FORE + HANDC, 1, 1.46);
    // palms up under the load: fingers point across, towards the other hand
    if (near) { p.au = IKR[0]; p.af = IKR[1]; p.as = IKR[2]; p.ah = 96 - IKR[0] - IKR[1] + p.tor; }
    else { p.bu = IKR[0]; p.bf = IKR[1]; p.bs = IKR[2]; p.bh = -96 - IKR[0] - IKR[1] + p.tor; }
  }
  return p;
}

const IDLE0 = P(STANCE);
// lying on his back: near knee drawn up, far leg out, back a little arched, head rolled to the side
const DOWN = { air: true, lie: 1, rot: 90, y: AIRH - 15, tor: 6, head: -16, au: 168, af: 40, ahs: 'open', bu: 120, bf: 30,
  bhs: 'open', nt: 64, ns: -122, nf: 0, ft: 8, fs: -12, ff: 10 };
// one knee down (Shadow Strike landing)
const KNEEL = { nt: -4, ns: -100, nf: -60, ft: 84, fs: -96, ff: 0 };
// arms crossed (book model sheet): near forearm under, far forearm on top, hands tucked at the elbows
const CROSSED = { nt: -16, ns: -6, ft: 22, fs: -8, nf: 0, ff: 0, au: 30, af: 78, ah: -10, ahs: 'fist', armL: 'mid',
  bu: 34, bf: -118, bh: 10, bhs: 'flat', farFront: true };
export const ANIM = {
  idle(t) {
    const b = Math.sin(t * 2.5), w = Math.sin(t * 0.83);
    const p = P(Object.assign({}, STANCE, {
      tor: STANCE.tor + b * 1.3 + w * 1.2, head: STANCE.head - b * 1.4, x: w * 1.2,
      nt: STANCE.nt + w * 2.5, ns: STANCE.ns - b * 2.5 - w * 2, ft: STANCE.ft + w * 2.5, fs: STANCE.fs - b * 2.5 + w * 2,
      au: STANCE.au + b * 2, af: STANCE.af - b * 3, bu: STANCE.bu + b * 2.5, bf: STANCE.bf - b * 2, auto: true,
    }));
    // fidget every ~5.4 s, alternating: check the hilt over the shoulder / glance back over the shoulder
    const n = Math.floor(t / 5.4), u = t - n * 5.4;
    if (u > 3.7 && u < 5.0) {
      const v = (u - 3.7) / 1.3, env = v < 0.25 ? e3(v / 0.25) : v > 0.75 ? e3((1 - v) / 0.25) : 1;
      if (n % 2 === 0) {
        p.grab = env; p.armL = env > 0.15 ? 'mid' : 'front'; p.head += 4 * env; p.lx = -0.6 * env; p.tor -= 2 * env;
        if (v > 0.4 && v < 0.62) p.face = 'closed';
      } else {
        p.head -= 7 * env; p.yaw = -0.9 * env; p.lx = -1 * env; p.tor -= 3 * env;
        p.bu += 10 * env;
      }
    } else p.blink = (t % 3.3) > 3.18;
    return p;
  },
  walk(ph) {
    const s = Math.sin(ph * TAU), c2 = Math.cos(ph * 2 * TAU);
    const H = 53 - 1.6 * c2;
    const p = P({ tor: 9 + 1.2 * c2, head: -3 - 1.5 * c2, au: 6 - 26 * s, af: 30 + 12 * Math.max(0, -s), bu: 8 + 24 * s,
      bf: 34 + 12 * Math.max(0, s), lx: 0.3, auto: true });
    gaitFoot(p, true, ph % 1, 75, H, 0.56, 9, -1);
    gaitFoot(p, false, (ph + 0.5) % 1, 75, H, 0.56, 9, 5);
    return p;
  },
  run(ph) {
    const s = Math.sin(ph * TAU), hph = (ph * 2) % 1;
    const H = 50.5 - 3.5 * Math.cos(TAU * (hph - 0.17));
    const p = P({ air: true, y: AIRH - H, tor: 27 + 2 * Math.cos(TAU * hph), head: -18, lx: 0.6,
      au: 18 - 58 * s, af: 92 + 18 * s, bu: 18 + 58 * s, bf: 92 - 18 * s, ahs: 'open', bhs: 'open', ah: 8, bh: 8,
      wind: 0.5, auto: true, face: 'focus' });
    gaitFoot(p, true, ph % 1, 120, H, 0.34, 21, 2);
    gaitFoot(p, false, (ph + 0.5) % 1, 120, H, 0.34, 21, 8);
    return p;
  },
  squat: P({ tor: 26, head: -10, nt: 30, ns: -84, ft: 46, fs: -88, nf: 0, ff: 0, sq: 0.9, au: -30, af: 40, bu: -20,
    bf: 50, ahs: 'open', bhs: 'open', face: 'focus', auto: true }),
  // jump: rise -> fall is blended by the engine; rot 0 -> -360 makes the blend a front flip about the belly, and
  // `flip` tucks him tight while he is upside down (draw time, from the blended rot)
  rise: P({ air: true, flip: 1, y: -2, rc: 26, rot: 0, tor: 10, head: -6, nt: 96, ns: -128, ft: 62, fs: -118, nf: 10, ff: 0,
    au: -50, af: 30, bu: -30, bf: 40, ahs: 'open', bhs: 'open', sq: 1.03, face: 'focus', auto: true }),
  fall: P({ air: true, flip: 1, y: 0, rc: 26, rot: -360, tor: 6, head: -2, nt: 20, ns: -34, ft: -8, fs: -40, nf: -6, ff: -18,
    au: 70, af: 40, bu: 100, bf: 30, ahs: 'open', bhs: 'open', face: 'calm', auto: true }),
  land: P({ tor: 30, head: -8, nt: 36, ns: -96, ft: 50, fs: -92, sq: 0.88, au: 52, af: 30, ah: 10, ahs: 'open',
    bu: -40, bf: 30, bhs: 'open', face: 'focus', auto: true }),

  // --- the ground combo: three fast sword slashes and a spinning kick --------------------------------------
  // 1: iai draw-slash from the back: wind-up twisted away, hand reaching over the shoulder for the hilt, blade
  // whipped up and back, a diagonal cut down through the target, finishing low
  atk1: (k) => keys(k, [
    [0, P({ x: -2, tor: -2, head: 4, grab: 1, armL: 'front', sw: 'back', nt: -8, ns: -40, ft: 28, fs: -52, bu: 72, bf: 26,
      bh: -6, bhs: 'open', face: 'focus', lx: 0.8 })],
    [0.08, P({ sw: 'hand', ahs: 'grip', tor: -8, head: -6, au: 168, af: 30, ah: -10, swa: 90, nt: -10, ns: -32, ft: 26, fs: -48,
      bu: 64, bf: 50, face: 'focus' })],
    [0.3, P({ sw: 'hand', ahs: 'grip', x: 8, tor: 26, head: 4, au: 92, af: 6, ah: -8, swa: 22, nt: -24, ns: -10, ft: 36, fs: -38,
      bu: -20, bf: 40, face: 'focus', wind: 3, smear: 1, sa0: 200, sa1: 70, sr: 52, sth: 16 }), 'snap'],
    [0.5, P({ ...END1, x: 9, tor: 30, au: 34, af: 4, swa: 30, wind: 2, smear: 0.4, sa0: 120, sa1: 40, sr: 52, sth: 14 })],
    [1, P({ ...END1, x: 6 })],
  ]),
  // 2: rising backhand from the low finish: blade sweeps up through the target and ends high overhead
  atk2: (k) => keys(k, [
    [0, P({ ...END1, x: 6, tor: 24, au: 10, af: 10, swa: 30, nt: -22, ns: -30, ft: 32, fs: -46 })],
    [0.12, P({ ...END1, x: 6, tor: 28, head: 6, au: -30, af: 20, swa: 40, nt: -24, ns: -36, ft: 34, fs: -52 })],
    [0.3, P({ ...END2, x: 11, tor: -6, au: 108, af: 4, ah: 4, swa: 44, wind: 3, smear: 1, sa0: -10, sa1: 150, sr: 52,
      sth: 16 }), 'snap'],
    [0.52, P({ ...END2, x: 12, tor: -10, au: 186, af: 14, ah: -10, swa: 70, wind: 2, smear: 0.35, sa0: 80, sa1: 178, sr: 52,
      sth: 13 })],
    [1, P({ ...END2, x: 10 })],
  ]),
  // 3: chambered at the chest (blade level, below the eye slit), then a fully extended lunging thrust, held
  atk3: (k) => keys(k, [
    [0, P({ ...END3, x: 10, tor: 4, head: -2, nt: -14, ns: -28, ft: 24, fs: -38, au: -78, af: 148, ah: 0, swa: 30, bu: 50, bf: 60 })],
    [0.14, P({ ...END3, x: 8, tor: -2, head: -4, nt: -12, ns: -30, ft: 22, fs: -40, au: -86, af: 156, ah: 0, swa: 30, bu: 60,
      bf: 50 })],
    [0.3, P({ ...END3, x: 20, tor: 24, head: 4, au: 108, af: 6, swa: 0, thr: 1, wind: 3 }), 'snap'],
    [0.55, P({ ...END3, x: 21, tor: 22, au: 104, af: 6, thr: 0.45, wind: 2 })],
    [1, P({ ...END3, x: 16 })],
  ]),
  // 4: spinning kick finisher (one full turn, the near leg sweeps round at head height), sword held back
  atk4: (k) => keys(k, [
    [0, P({ ...GUARD_P, x: 14, tor: 4, head: -6, au: -50, af: 30, swa: 150, bu: 70, bf: 70, nt: -26, ns: -30, ft: 22, fs: -40 })],
    [0.12, P({ ...GUARD_P, x: 16, y: -2, tor: -2, head: -8, spin: 80, spx: 5, au: -70, af: 20, swa: 160, bu: 90, bf: 60,
      nt: 40, ns: -110, ft: 12, fs: -16, ff: -10 }), 'in'],
    [0.26, P({ ...GUARD_P, x: 18, y: -8, tor: -10, head: -10, spin: 200, spx: 5, au: -80, af: 10, swa: 170, bu: 100, bf: 40,
      nt: 70, ns: -90, ft: 6, fs: -10, ff: -14, smear: 0.6, sa0: -80, sa1: 20, sr: 40, sfy: 0.4, scx: 0, scy: -6, sth: 12, sm: 0 }), 'lin'],
    [0.4, P({ ...GUARD_P, x: 22, y: -8, tor: -26, head: -12, spin: 360, spx: 5, au: -70, af: 6, swa: 150, bu: 120, bf: 30,
      bhs: 'open', nt: 104, ns: -4, nf: 20, ft: 2, fs: -8, ff: -18, kick: 1, wind: 3,
      smear: 1, sa0: -60, sa1: 112, sr: 48, sfy: 0.42, scx: 0, scy: -6, sth: 16, sm: 0 }), 'out'],
    [0.56, P({ ...GUARD_P, x: 22, y: -6, tor: -22, head: -10, spin: 360, au: -60, af: 10, swa: 140, bu: 110, bf: 30,
      bhs: 'open', nt: 92, ns: -30, nf: 10, ft: 2, fs: -10, ff: -14, kick: 0.4,
      smear: 0.35, sa0: 40, sa1: 118, sr: 48, sfy: 0.42, scx: 0, scy: -6, sth: 13, sm: 0 })],
    [0.78, P({ ...GUARD_P, x: 22, spin: 360, tor: 22, head: -2, nt: 30, ns: -70, ft: 30, fs: -60, au: 20, af: 60, swa: 90 })],
    [1, P({ ...GUARD_P, x: 22, spin: 360 })],
  ]),
  // jump attack: a diving kick, angled down-forward (held at k = 1)
  airAtk: (k) => keys(k, [
    [0, P({ air: true, rc: 22, rot: 10, tor: 4, head: -4, nt: 100, ns: -130, ft: 60, fs: -110, au: 120, af: 50, bu: 140,
      bf: 40, ahs: 'open', bhs: 'open', face: 'focus' })],
    [0.3, P({ air: true, rc: 22, rot: 16, tor: 0, head: -6, nt: 110, ns: -140, ft: 40, fs: -100, au: 150, af: 30, bu: 170,
      bf: 30, ahs: 'open', bhs: 'open', face: 'focus' })],
    [0.5, P({ air: true, rc: 22, rot: -28, tor: 6, head: -16, nt: 78, ns: -2, nf: 12, ft: 20, fs: -115, ff: -20, au: -60,
      af: 20, bu: -40, bf: 30, ahs: 'open', bhs: 'open', face: 'focus', kick: 1, dash: 0.6 }), 'snap'],
    [1, P({ air: true, rc: 22, rot: -28, tor: 6, head: -16, nt: 78, ns: -2, nf: 12, ft: 20, fs: -115, ff: -20, au: -64,
      af: 20, bu: -44, bf: 30, ahs: 'open', bhs: 'open', face: 'focus', kick: 0.85, dash: 0.8 })],
  ]),
  // dash slash: drawn on the run, a low lunge straight through the enemy, blade trailing a long cut
  runAtk: (k) => keys(k, [
    [0, P({ tor: 34, head: -14, grab: 1, armL: 'mid', nt: 40, ns: -70, ft: -20, fs: -60, ff: -20, bu: -40, bf: 40,
      bhs: 'open', face: 'focus', dash: 0.5 })],
    [0.08, P({ sw: 'hand', ahs: 'grip', tor: 36, head: -14, au: 150, af: 10, swa: 110, nt: 50, ns: -76, ft: -30, fs: -30,
      ff: -20, bu: -50, bf: 30, bhs: 'open', face: 'focus', dash: 0.8 })],
    [0.22, P({ sw: 'hand', ahs: 'grip', x: 6, tor: 40, head: -18, au: 76, af: -4, ah: -6, swa: 86, nt: 76, ns: -84, nf: 0,
      ft: -52, fs: -4, ff: -30, bu: -70, bf: 20, bhs: 'open', face: 'focus', dash: 1, wind: 3,
      smear: 1, sa0: -60, sa1: 92, sr: 52, sfy: 0.36, scy: -26, sth: 15 }), 'snap'],
    [0.6, P({ sw: 'hand', ahs: 'grip', x: 8, tor: 40, head: -18, au: 72, af: -4, ah: -6, swa: 84, nt: 78, ns: -86, nf: 0,
      ft: -54, fs: -4, ff: -30, bu: -72, bf: 20, bhs: 'open', face: 'focus', dash: 0.7,
      smear: 0.45, sa0: 30, sa1: 96, sr: 52, sfy: 0.36, scy: -26, sth: 13 })],
    [0.82, P({ ...ENDR, x: 6, tor: 24, nt: 30, ns: -60, ft: 0, fs: -30, au: -60, af: -8, swa: -10 })],
    [1, P({ ...ENDR, x: 4 })],
  ]),
  // SHURIKEN FAN: pull three stars from the sash, cock back, whip the arm through: release at .35
  shoot: (k) => keys(k, [
    [0, P({ ...STANCE, tor: 8, au: 20, af: 120, ah: 20, ahs: 'stars', stars: 3, bu: 40, bf: 80, face: 'focus' })],
    [0.18, P({ tor: -12, head: -6, au: 40, af: 150, ah: 30, ahs: 'stars', stars: 3, nt: -8, ns: -30, ft: 30, fs: -44,
      bu: 30, bf: 40, bhs: 'open', face: 'focus', lx: 0.6 })],
    [0.34, P({ x: 6, tor: 20, head: 0, au: 92, af: 4, ah: -10, ahs: 'open', stars: 3, nt: -26, ns: -10, ft: 36, fs: -40,
      bu: -30, bf: 50, face: 'focus', wind: 2, smear: 0.9, sa0: 150, sa1: 90, sr: 34, sth: 9, sfy: 0.6 }), 'snap'],
    [0.6, P({ x: 7, tor: 26, head: 2, au: 62, af: 30, ah: -10, ahs: 'open', stars: 3, nt: -26, ns: -12, ft: 36, fs: -40, bu: -34,
      bf: 50, face: 'focus', smear: 0.2, sa0: 120, sa1: 90, sr: 34, sth: 6, sfy: 0.6 })],
    [1, P({ ...STANCE, x: 4 })],
  ]),
  // SHADOW STRIKE: gather (0-.15), vanish (engine hides him .15-.80), crouch-land + sheathe (.80-1)
  special: (k) => keys(k, [
    [0, P({ ...STANCE, face: 'focus' })],
    [0.08, P({ tor: 30, head: -6, grab: 1, armL: 'mid', nt: 46, ns: -100, ft: 70, fs: -96, bu: 50, bf: 100, bh: -20,
      bhs: 'point', face: 'focus', glint: 1, sq: 0.95, wind: 1.5 })],
    [0.14, P({ x: 10, tor: 46, head: -20, grab: 1, armL: 'mid', nt: 60, ns: -70, ft: -30, fs: -20, ff: -30, bu: -40, bf: 20,
      bhs: 'open', face: 'focus', glint: 1, dash: 1, wind: 2 })],
    [0.15, P({ hide: true, x: 30, tor: 46, sw: 'hand', ahs: 'grip', face: 'focus' })],
    [0.8, P({ ...KNEEL, sw: 'hand', ahs: 'grip', tor: 26, head: 4, au: -78, af: -6, ah: 0, swa: -8, bu: 40, bf: 70,
      face: 'closed', wind: 2.5, smear: 0.8, sa0: 100, sa1: -80, sr: 50, sfy: 0.4, scy: -26, sth: 14 })],
    [0.86, P({ ...KNEEL, sw: 'hand', ahs: 'grip', tor: 24, head: 6, au: -74, af: -4, ah: 0, swa: -10, bu: 40, bf: 70,
      face: 'closed', wind: 2.5 })],
    [0.9, P({ ...KNEEL, sw: 'hand', ahs: 'grip', tor: 20, head: 6, grab: 1, sp: 0.35, al: 1, armL: 'mid', bu: 40, bf: 70,
      face: 'closed', wind: 2 })],
    [0.91, P({ ...KNEEL, sw: 'back', sp: 0.35, grab: 1, armL: 'mid', tor: 20, head: 6, bu: 40, bf: 70, face: 'closed', wind: 2 })],
    [0.97, P({ ...mix(P(KNEEL), P(STANCE), 0.45), sw: 'back', sp: 0, grab: 1, armL: 'mid', bu: 40, bf: 80, face: 'calm',
      wind: 1.5 })],
    [1, P({ ...STANCE, grab: 0.3, armL: 'mid', face: 'calm' })],
  ]),
  // two hit reactions: high (head snaps back) and low (doubles over)
  hurt: (k) => keys(k, [
    [0, P({ x: -5, tor: -18, head: -20, sq: 0.9, au: 46, af: 100, ah: -10, bu: 30, bf: 120, nt: -4, ns: -24, ft: 26, fs: -36,
      face: 'ouch', wind: 1 })],
    [0.3, P({ x: -9, tor: -12, head: 12, sq: 1.02, au: 88, af: 64, ah: -20, bu: 40, bf: 128, nt: -6, ns: -34, ft: 24,
      fs: -46, face: 'ouch' }), 'out'],
    [0.7, P({ x: -7, tor: 0, head: 8, au: 84, af: 66, ah: -16, bu: 36, bf: 122, nt: -10, ns: -30, ft: 22, fs: -40,
      face: 'worried' })],
    [1, P({ ...STANCE, x: -4, face: 'focus' })],
  ]),
  hurt2: (k) => keys(k, [
    [0, P({ x: -4, tor: 38, head: 20, sq: 0.9, au: 20, af: 110, bu: 34, bf: 110, nt: 8, ns: -46, ft: 30, fs: -50,
      face: 'ouch', wind: 1 })],
    [0.3, P({ x: -8, tor: 30, head: 14, sq: 1, au: 16, af: 100, bu: 30, bf: 100, nt: 6, ns: -42, ft: 28, fs: -48,
      face: 'ouch' }), 'out'],
    [1, P({ ...STANCE, x: -4, face: 'focus' })],
  ]),
  // knocked flying (air), lying on his back, ninja kip-up
  fly: P({ air: true, tum: 1, rot: 58, rc: 20, tor: -12, head: -20, au: 140, af: 40, ahs: 'open', bu: 120, bf: 30, bhs: 'open',
    nt: 46, ns: -60, ft: 76, fs: -34, nf: 10, ff: 20, face: 'ouch' }),
  down: groundAir(P({ ...DOWN, face: 'ko' })),
  // ninja kip-up: roll back onto the shoulders with the knees tucked, spring forward, land crouched, rise
  getup: (k) => keys(k, [
    [0, groundAir(P({ ...DOWN, face: 'ouch' }))],
    [0.22, groundAir(P({ air: true, lie: 0.6, rot: 128, tor: 10, head: 28, au: 196, af: 70, ah: -60, ahs: 'open', bu: 186,
      bf: 70, bh: -60, bhs: 'open', nt: 146, ns: -150, ft: 136, fs: -146, nf: 20, ff: 20, face: 'focus' }))],
    [0.42, groundAir(P({ air: true, rot: 66, tor: -6, head: 6, au: 172, af: 30, ah: -70, ahs: 'open', bu: 168, bf: 30, bh: -70,
      bhs: 'open', nt: 72, ns: -24, ft: 54, fs: -42, nf: 10, face: 'focus', wind: 1 }), 8), 'out'],
    [0.6, asAir(P({ tor: 30, head: -8, nt: 36, ns: -96, ft: 50, fs: -92, au: 52, af: 30, ahs: 'open', bu: -40, bf: 30,
      bhs: 'open', face: 'focus' }))],
    [0.8, asAir(P({ ...STANCE, tor: 18, head: 0, nt: -4, ns: -44, ft: 30, fs: -54, face: 'calm' }))],
    [1, asAir(P({ ...STANCE, face: 'calm' }))],
  ]),

  // --- carrying (the engine draws the object's bottom-centre at CARRY_POINT) -------------------------------
  carryIdle(t) {
    const b = Math.sin(t * 2.5);
    return carryArms(P({ tor: 2 + b * 0.6, head: 6, shr: 6, nt: -12, ns: -46 - b * 3, ft: 20, fs: -52 - b * 3, ahs: 'open',
      bhs: 'open', face: 'focus', lx: 0.4, ly: -0.5 }));
  },
  carryWalk(ph) {
    const c2 = Math.cos(ph * 2 * TAU);
    const p = P({ tor: 3 + c2, head: 6, shr: 6, ahs: 'open', bhs: 'open', face: 'focus', lx: 0.6 });
    gaitFoot(p, true, ph % 1, 75, 48.5 - 1.2 * c2, 0.58, 7, -1);
    gaitFoot(p, false, (ph + 0.5) % 1, 75, 48.5 - 1.2 * c2, 0.58, 7, 5);
    return carryArms(p);
  },
  throw: (k) => keys(k, [
    [0, carryArms(P({ tor: 2, head: 6, shr: 6, nt: -12, ns: -46, ft: 20, fs: -52, ahs: 'open', bhs: 'open', face: 'focus' }))],
    [0.22, P({ tor: -18, head: -10, shr: 3, nt: -16, ns: -18, ft: 30, fs: -40, au: 200, af: 50, ah: -20, bu: 196, bf: 56, bh: -20,
      ahs: 'open', bhs: 'open', armL: 'mid', face: 'focus' })],
    [0.4, P({ x: 6, tor: 24, head: 4, nt: -24, ns: -10, ft: 36, fs: -40, au: 104, af: 4, bu: 112, bf: 4, ahs: 'open',
      bhs: 'open', face: 'focus' }), 'snap'],
    [0.65, P({ x: 7, tor: 28, head: 4, nt: -24, ns: -12, ft: 36, fs: -42, au: 70, af: 20, bu: 80, bf: 20, ahs: 'open',
      bhs: 'open', face: 'calm' })],
    [1, P({ ...STANCE, x: 4 })],
  ]),

  // --- arrival, wins, showcase -------------------------------------------------------------------------
  // steps out of the crystal portal off-balance, catches himself low, looks back, looks ahead, rises ready
  portal: (k) => keys(k, [
    [0, P({ x: -16, tor: -16, head: -10, nt: 40, ns: -40, nf: 10, ft: -6, fs: -10, au: 100, af: 20, ahs: 'open', bu: 130,
      bf: 20, bhs: 'open', face: 'surprised', wind: 1 })],
    [0.2, P({ x: -4, tor: 24, head: -4, nt: 20, ns: -50, ft: -26, fs: -50, ff: -10, au: -30, af: 40, ahs: 'open', bu: 80,
      bf: 30, bhs: 'open', face: 'surprised' })],
    [0.36, P({ tor: 30, head: -8, nt: 36, ns: -96, ft: 50, fs: -92, au: 56, af: 26, ah: 10, ahs: 'open', bu: -40, bf: 30,
      bhs: 'open', face: 'focus' })],
    [0.54, P({ tor: 26, head: -14, yaw: -1, lx: -1, nt: 34, ns: -90, ft: 48, fs: -88, au: 56, af: 26, ah: 10, ahs: 'open',
      bu: -30, bf: 40, bhs: 'open', face: 'focus' })],
    [0.72, P({ tor: 24, head: -4, yaw: 0.6, lx: 1, nt: 30, ns: -84, ft: 46, fs: -84, au: 56, af: 26, ah: 10, ahs: 'open',
      bu: -30, bf: 40, bhs: 'open', face: 'calm' })],
    [0.88, P({ ...STANCE, tor: 16, head: 2, face: 'calm' })],
    [1, P({ ...STANCE, face: 'calm' })],
  ]),
  // arms crossed, chin up, scarf blowing (the book's model sheet)
  victory(t) {
    const b = Math.sin(t * 2.2), n = t % 3.6;
    return P({ ...CROSSED, tor: 2 + b * 0.8, head: -6 - b * 1.2, au: CROSSED.au + b, bu: CROSSED.bu + b, wind: 1,
      face: n > 2.7 && n < 3.4 ? 'happy' : 'calm' });
  },
  // character select: hand to the hilt, draw, twirl, slash, sheathe with a click, arms crossed (4 s loop)
  select(t) {
    const u = (t % 4) / 4;
    const base = { ...STANCE, wind: 0.8 };
    const p = keys(u, [
      [0, P({ ...base, face: 'calm' })],
      [0.1, P({ ...base, face: 'calm' })],
      [0.16, P({ ...base, grab: 1, armL: 'mid', tor: 6, face: 'focus', glint: 0.6 })],
      [0.2, P({ ...base, sw: 'hand', ahs: 'grip', au: 170, af: 26, swa: 90, tor: -4, head: -8, face: 'focus',
        smear: 0.8, sa0: 250, sa1: 180, sr: 52, sth: 12 })],
      [0.25, P({ ...base, sw: 'hand', ahs: 'grip', au: 56, af: 0, ah: 10, swa: 0, tor: 8, face: 'calm', tw: 1, lx: 0.6, ly: 0.5 })],
      [0.45, P({ ...base, sw: 'hand', ahs: 'grip', au: 58, af: 2, ah: 10, swa: 1080, tor: 8, face: 'happy', tw: 1 })],
      [0.5, P({ ...base, sw: 'hand', ahs: 'grip', au: 168, af: 24, swa: 1170, tor: -6, head: -8, face: 'focus' })],
      [0.56, P({ ...base, sw: 'hand', ahs: 'grip', x: 6, au: 70, af: 6, swa: 1100, tor: 26, head: 4, nt: -26, ns: -8, ft: 36,
        fs: -40, face: 'focus', smear: 1, sa0: 200, sa1: 60, sr: 52, sth: 16, wind: 3 }), 'snap'],
      [0.62, P({ ...base, sw: 'hand', ahs: 'grip', x: 6, au: 60, af: 6, swa: 1100, tor: 26, head: 4, nt: -26, ns: -8, ft: 36,
        fs: -40, face: 'focus', wind: 2 })],
      [0.68, P({ ...base, sw: 'hand', ahs: 'grip', x: 3, grab: 1, sp: 0.35, swa: 1080, al: 1, armL: 'mid', face: 'closed' })],
      [0.69, P({ ...base, sw: 'back', sp: 0.35, grab: 1, armL: 'mid', x: 3, face: 'closed' })],
      [0.76, P({ ...base, sw: 'back', sp: 0, grab: 1, armL: 'mid', x: 2, face: 'closed' })],
      [0.8, P({ ...base, sw: 'back', sp: 0, grab: 0.6, armL: 'mid', x: 2, face: 'closed' })],
      [0.86, P({ ...CROSSED, tor: 2, head: -6, wind: 1, face: 'calm' })],
      [0.95, P({ ...CROSSED, tor: 2, head: -7, wind: 1, face: 'wink' })],
      [1, P({ ...base, face: 'calm' })],
    ]);
    if (u < 0.1 || u > 0.97) p.blink = (t % 3.3) > 3.18;
    return p;
  },

  // --- cutscene poses (he never talks: `talk` is a silent thumbs-up + nod) -------------------------------
  talk(t) {
    // silent: a thumbs-up held out, a slow nod, a ^ ^ smile on the nod; every other beat a small shrug
    const n = t % 4.8, nod = n < 0.6 ? Math.sin((n / 0.6) * Math.PI) : 0;
    const sh = n > 2.6 && n < 3.8 ? Math.sin(((n - 2.6) / 1.2) * Math.PI) : 0;
    const b = Math.sin(t * 2.4);
    return P({ tor: 6 + b * 0.8, head: -2 + nod * 12 - sh * 4, nt: -14, ns: -14, ft: 18, fs: -20, shr: sh * 3,
      au: 62 - sh * 30, af: 54 + sh * 50, ah: -20 - sh * 24, ahs: sh > 0.3 ? 'open' : 'thumb', bu: -18 + sh * 40,
      bf: 60 + sh * 40, bh: sh * -40, bhs: sh > 0.3 ? 'open' : 'fist',
      face: nod > 0.3 ? 'happy' : sh > 0.3 ? 'worried' : 'calm', lx: 0.3 });
  },
  point: P({ tor: 10, head: -6, nt: -14, ns: -16, ft: 22, fs: -26, au: 88, af: 2, ah: 0, ahs: 'point', bu: -10, bf: 60,
    face: 'focus', lx: 1 }),
  // a polite bow from the waist, eyes closed, one hand flat on his belly (story prologue: '... *bows*')
  bow: P({ tor: 40, head: 16, nt: -6, ns: -10, ft: 10, fs: -14, au: 24, af: 96, ah: 0, ahs: 'flat', bu: -8, bf: 14,
    face: 'closed', wind: 0.6 }),
  // one fist punched up beside his head: a silent "...!" (story before_mines); the far arm, so it never covers the face
  fistPump(t) {
    const b = Math.sin(t * 6);
    return P({ tor: -6, head: -10, nt: -12, ns: -14, ft: 18, fs: -20, au: -10, af: 30, ahs: 'fist', bu: 150 + b * 4, bf: -20,
      bhs: 'fist', face: 'happy', wind: 1.5 });
  },
  // waving hello with the far hand held up open, a happy squint (story ending: '... *waves*')
  wave(t) {
    const w = Math.sin(t * 7);
    return P({ tor: -2, head: -8, nt: -12, ns: -14, ft: 18, fs: -20, au: -10, af: 30, ahs: 'fist', bu: 150 + w * 12, bf: -10 - w * 14,
      bhs: 'open', face: 'happy', wind: 1.2 });
  },
  cheer(t) {
    // a quiet kid's "yes!": a hop with both fists pumped at chin height, ^ ^ eyes
    const b = Math.abs(Math.sin(t * 5)), up = Math.sin(t * 10);
    return P({ air: true, y: AIRH - 53 - b * 7, tor: -4, head: -8 + b * 2, nt: -8, ns: -14 - b * 8, ft: 16, fs: -18 - b * 8,
      ff: -8 * b, nf: -8 * b, au: 44 + up * 6, af: 118 + up * 8, ah: -10, ahs: 'fist', bu: 52 + up * 6, bf: 110 + up * 8,
      bh: -10, face: 'happy', wind: 1.5 });
  },
  surprised: P({ x: -5, tor: -14, head: -10, nt: -4, ns: -16, ft: 26, fs: -24, au: 70, af: 40, ah: -70, ahs: 'open', bu: 84,
    bf: 30, bh: -70, bhs: 'open', face: 'surprised', wind: 1 }),
  // sitting on the ground (or a dragon's back): hips at y = 0, knees up, forearms resting on the knees
  sit: P({ air: true, y: AIRH, tor: 14, head: -2, nt: 128, ns: -74, nf: 0, ft: 116, fs: -50, ff: 0, au: 50, af: 64, ah: -20,
    ahs: 'fist', bu: 66, bf: 50, face: 'calm' }),
};
export { mix };

// ---------------------------------------------------------------- exports for the engine
function handOf(p) {
  const m = MT.reset();
  if (p.sq !== 1) m.scale(1 / Math.sqrt(p.sq), p.sq);
  bodyXf(m, p, hipHeight(p));
  m.rotate(p.tor * DEG);
  nearArm(p);
  m.translate(SLOT_NEAR[0], SLOT_NEAR[1] - p.shr); m.rotate(-AU * DEG); m.translate(0, UPPER * AST); m.rotate(-AF * DEG);
  m.translate(0, FORE * AST + 1); m.rotate(-AH * DEG);
  return [Math.round(m.px(0, 4) * 10) / 10, Math.round(m.py(0, 4) * 10) / 10];
}
/** where the shurikens leave: the throwing hand at the release key (k = .35), facing right, scale 1 */
export const SHOOT_ORIGIN = handOf(ANIM.shoot(0.35));
export const META = { id: 'shadow', name: 'SHADOW', height: 140, hurtW: 20, hurtH: 128 };

// ---------------------------------------------------------------- drawing
let T = 0, FAC = 1;
const ZERO = { x: 0, y: 0, z: 0 };
const SP = Object.assign({}, BASE);      // scratch pose for the auto-sheathe flourish (no per-frame allocation)
const SHEATHE_DUR = 0.42;
let SHEA_AU = 0, SHEA_AF = 0;
{ ik2(hiltX(0.35) - SLOT_NEAR[0], hiltY(0.35) - SLOT_NEAR[1], UPPER, FORE + HANDC, 1); SHEA_AU = IKR[0]; SHEA_AF = IKR[1]; }

const SP3 = Object.assign({}, BASE);
function tumble(p, mem, vel, t) {
  Object.assign(SP3, p);
  const vz = vel.z || 0, w = Math.sin(t * 16), w2 = Math.sin(t * 16 + 1.3);
  SP3.rot = p.rot + clamp(-vz * 3, -20, 20);              // nose up while rising, flattening out as he drops
  SP3.au = p.au + 25 * w; SP3.bu = p.bu - 25 * w;         // flailing
  SP3.nt = p.nt + 15 * w2; SP3.ft = p.ft - 15 * w2;
  if (mem) {
    if (mem._shTf !== mem.frame) {
      if (mem._shBnc > 0) mem._shBnc--;
      if (mem._shTvz < 0 && vz > 0) mem._shBnc = 3;      // bounced off the floor: squash for 3 frames
      mem._shTvz = vz; mem._shTf = mem.frame;
    }
    if (mem._shBnc > 0) SP3.sq = 0.85;
  }
  return SP3;
}
const SP2 = Object.assign({}, BASE);
function tuck(p) {
  const k = Math.sin(Math.PI * clamp(-p.rot / 360, 0, 1));
  if (SP2 !== p) Object.assign(SP2, p);
  SP2.nt = lerp(p.nt, 128, k); SP2.ns = lerp(p.ns, -140, k); SP2.ft = lerp(p.ft, 112, k); SP2.fs = lerp(p.fs, -136, k);
  SP2.nf = lerp(p.nf, 20, k); SP2.ff = lerp(p.ff, 10, k);
  SP2.au = lerp(p.au, 70, k); SP2.af = lerp(p.af, 80, k); SP2.bu = lerp(p.bu, 80, k); SP2.bf = lerp(p.bf, 70, k);
  SP2.tor = lerp(p.tor, 26, k); SP2.head = lerp(p.head, 12, k); SP2.ahs = 'fist'; SP2.bhs = 'fist';
  return SP2;
}
function sheatheOverlay(p, mem, t) {
  if (p.sw === 'hand' || p.grab > 0.5) {
    mem.shOut = p.sw === 'hand' ? 1 : 0;
    // remember where the attack left the sword arm: the flourish continues from there
    mem.shA = p.au; mem.shB = p.af; mem.shC = p.ah; mem.shS = p.swa;
    return p;
  }
  if (!mem.shOut) return p;
  if (!p.auto) { mem.shOut = 0; return p; }
  if (mem.shOut === 1) { mem.shOut = 2; mem.shT0 = t; }
  const u = (t - mem.shT0) / SHEATHE_DUR;
  if (!(u >= 0 && u < 1)) { mem.shOut = 0; return p; }
  Object.assign(SP, p);
  SP.armL = 'mid';
  if (u < 0.3) {
    const e = e3(u / 0.3);
    SP.sw = 'hand'; SP.ahs = 'grip'; SP.al = Math.min(1, e * 2.5);   // blade swings in line with the scabbard early: never across the slit
    SP.au = lerp(mem.shA, SHEA_AU, e); SP.af = lerp(mem.shB, SHEA_AF, e); SP.ah = lerp(mem.shC, 0, e); SP.swa = mem.shS;
    if (e < 0.15) SP.armL = 'front';
  } else if (u < 0.85) {
    SP.sw = 'back'; SP.grab = 1; SP.sp = 0.35 * (1 - e3((u - 0.3) / 0.55));
    if (u > 0.6) SP.face = 'closed';
  } else {
    SP.sw = 'back'; SP.grab = 1 - e3((u - 0.85) / 0.15); SP.sp = 0;
  }
  return SP;
}

/**
 * Draw Shadow.  ctx is at his feet (screen), unscaled.
 * o: { facing: 1 | -1, t: seconds, scale, mem (per-actor scratch, mem.frame advanced by the engine), vel: {x,y,z}
 *      world px/frame, ghost: draw even while the pose says hide }
 */
export function draw(ctx, pose, o = {}) {
  let p = pose;
  if (p.hide && !o.ghost) return;
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  FAC = f;
  // a scratch mem whose frame never advances (cutscenes) would freeze the springs: treat it as no mem
  let mem = o.mem || null;
  if (mem) {
    if (mem.frame === mem._shFr && t !== mem._shT) mem = null;
    else { mem._shFr = o.mem.frame; mem._shT = t; }
  }
  if (mem) p = sheatheOverlay(p, mem, t);
  if (p.flip && p.rot < -1 && p.rot > -359) p = tuck(p);
  if (p.tum) p = tumble(p, mem, o.vel || ZERO, t);
  T = t;
  ctx.save();
  ctx.scale(f * S, S);
  if (p.sq !== 1) ctx.scale(1 / Math.sqrt(p.sq), p.sq);
  const H = hipHeight(p);
  nearArm(p);
  secondary(p, mem, o.vel || ZERO, f, t, H);

  // scarf tails and sash ends: behind everything (feet frame) unless he is lying on the ground
  const lying = p.lie > 0.5;
  if (!lying) { ribbon(ctx, 1, 6, C.scF, C.scFD, 1); ribbon(ctx, 0, 6, C.sc, C.scD, 1); }
  ribbon(ctx, 3, 3, C.puF, C.puFD, 0);
  ribbon(ctx, 2, 3, C.pu, C.puD, 0);

  ctx.save();
  bodyXf(ctx, p, H);
  const tor = p.tor * DEG;
  ctx.save(); ctx.rotate(tor);
  scabbard(ctx, p);
  backFlap(ctx);
  if (!p.farFront) arm(ctx, SLOT_FAR, p.bu, p.bf, p.bh, p.bhs, p.bs, true, p);
  ctx.restore();

  leg(ctx, HIP_FAR, p.ft, p.fs, p.ff, true);
  leg(ctx, HIP_NEAR, p.nt, p.ns, p.nf, false);
  if (p.kick > 0.01) kickStreak(ctx, p);

  ctx.save(); ctx.rotate(tor);
  if (p.armL === 'back') arm(ctx, SLOT_NEAR, AU, AF, AH, p.ahs, AST, false, p);
  torso(ctx, p);
  tabard(ctx);
  scarfWrap(ctx);
  if (p.armL === 'mid') arm(ctx, SLOT_NEAR, AU, AF, AH, p.ahs, AST, false, p);
  ctx.save(); ctx.translate(NECK[0], NECK[1]);
  // a round hood looks the same from every side: undo the spin squash in the hip frame (no shear)
  if (p.spin) { ctx.rotate(-tor); ctx.scale(1 / Math.abs(spinScale(p.spin)), 1); ctx.rotate(tor); }
  ctx.rotate(p.head * DEG);
  head(ctx, p); ctx.restore();
  knot(ctx);
  if (p.farHand) arm(ctx, SLOT_FAR, p.bu, p.bf, p.bh, p.bhs, p.bs, true, p, true);
  if (p.farFront) arm(ctx, SLOT_FAR, p.bu, p.bf, p.bh, p.bhs, p.bs, true, p);
  if (p.armL === 'front') arm(ctx, SLOT_NEAR, AU, AF, AH, p.ahs, AST, false, p);
  if (p.smear > 0.01) smear(ctx, p);
  ctx.restore();
  if (p.dash > 0.01) dashLines(ctx, p);
  ctx.restore();
  if (p.spin > 1 && p.spin < 359) spinSmear(ctx, p, H);
  if (lying) { ribbon(ctx, 1, 6, C.scF, C.scFD, 1); ribbon(ctx, 0, 6, C.sc, C.scD, 1); }
  ctx.restore();
}

// full-body spin smear: bright bands wrapping round the front of the body while he turns (feet frame)
function spinSmear(ctx, p, H) {
  const a = Math.sin(Math.PI * clamp(p.spin / 360, 0, 1));
  if (a < 0.05) return;
  ctx.save();
  ctx.translate(p.x + p.spx, -H);
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const cy = -82 + i * 30, rx = i === 0 ? 24 : 31 - i, ry = 6.5;
    const a0 = 0.12 * Math.PI + i * 0.06, a1 = 0.92 * Math.PI;
    ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = C.smO; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, a0, a1); ctx.stroke();
    ctx.globalAlpha = 0.9 * a; ctx.strokeStyle = C.smI; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, cy, rx + 1, ry + 0.5, 0, a0 + 0.35, a1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------- rim light (cool lilac, away from the key light)
const DASH_HOOD = [9, 4, 3, 6], NODASH = [];
function rim(ctx, path, lw, s, col = C.rim, dash = null) {
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c;
  if (det) {
    const k = Math.sqrt(Math.abs(det)), wx = -0.8 * s * k, wy = 0.6 * s * k;
    ctx.save();
    ctx.beginPath(); path(ctx); ctx.clip();
    ctx.translate((m.d * wx - m.c * wy) / det, (-m.b * wx + m.a * wy) / det);
    ctx.beginPath(); path(ctx);
    if (dash) ctx.setLineDash(dash);
    ctx.lineWidth = s * 2 + lw * 0.25; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.stroke();
    if (dash) ctx.setLineDash(NODASH);
    ctx.restore();
  }
  ctx.beginPath(); path(ctx); ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke();
}
/** cel + rim + outline in one go (o must have lw: 0) */
function celR(ctx, path, base, dark, o, lw, s) { cel(ctx, path, base, dark, o); rim(ctx, path, lw, s); }

// shared option objects (no allocation per draw)
const O0 = { lw: 0 }, O0K = { k: 1.3, lw: 0 };
const OL = { k: 1.2, lw: OUT }, OM = { lw: 2.5 }, OS = { lw: 2 }, OXS = { lw: 1.6 };

// ---------------------------------------------------------------- secondary motion
const RMAX = 7, RS = RMAX + 1;
const RX = new Float32Array(4 * RS), RY = new Float32Array(4 * RS), RW = new Float32Array(4 * RS);
const RKEYS = [0, 1, 2, 3].map((c) => Array.from({ length: RMAX }, (_, i) => `_sh${c}_${i}`));
let TAB = 0, FLAP = 0;

// One cloth chain: each segment angle (from straight down, + = towards the back) springs towards the
// direction of gravity + relative wind (plus `splay`), lagging its parent.  The drawn points also get a sine
// ripple across the cloth (rip px, travelling down the tail with a per-segment phase lag) that is purely visual.
let LIE = 0;
function chain(mem, c, n, ax, ay, len, w0, w1, wx, wy, g, flut, freq, ph, stiff, damp, t, splay, rip) {
  const o = c * RS, seg = len / n;
  RX[o] = ax; RY[o] = ay; RW[o] = w0;
  let x = ax, y = ay, prev = 0;
  for (let i = 0; i < n; i++) {
    const u = (i + 1) / n;
    let tgt = Math.atan2(-wx, g * (0.8 + 0.5 * u) + wy) + splay;
    tgt += flut * u * Math.sin(t * freq - i * 0.95 + ph);
    if (i > 0) tgt = tgt * 0.7 + prev * 0.3;
    const ang = follow(mem, RKEYS[c][i], tgt, stiff * (1 - 0.4 * u), damp + 0.08 * u);
    prev = ang;
    x -= Math.sin(ang) * seg; y += Math.cos(ang) * seg;
    const fl = -1.4 + LIE * (2 + 1.6 * i);       // lie on the floor (spread on the ground in front when he is down)
    if (y > fl) y = fl;
    const r = rip * Math.pow(u, 0.7) * Math.sin(t * freq * 1.3 - i * 1.15 + ph);
    let rx = x + Math.cos(ang) * r, ry = y + Math.sin(ang) * r;
    if (ry > fl) ry = fl;
    RX[o + i + 1] = rx; RY[o + i + 1] = ry;
    RW[o + i + 1] = lerp(w0, w1, Math.pow(u, 1.2)) * (0.86 + 0.14 * Math.cos(t * freq * 0.62 + i * 0.85 + ph));
  }
}
function mirrorChains(mem) {
  for (let c = 0; c < 4; c++) for (let i = 0; i < RMAX; i++) {
    const s = mem[RKEYS[c][i]];
    if (s) { s.x = -s.x; s.v = -s.v; }
  }
}
function secondary(p, mem, vel, f, t, H) {
  const m = MT.reset();
  bodyXf(m, p, H);
  m.rotate(p.tor * DEG);
  const ax = m.px(KNOT[0], KNOT[1]), ay = m.py(KNOT[0], KNOT[1]);
  const bx = m.px(SASH_END[0], SASH_END[1]), by = m.py(SASH_END[0], SASH_END[1]);
  let vx = (vel.x || 0) * f, vy = (vel.y || 0) * 0.4 - (vel.z || 0);
  if (mem) {
    if (mem._shF !== undefined && mem._shF !== f) mirrorChains(mem);
    if (mem._shAf === mem.frame - 1) { vx += clamp(ax - mem._shAx, -9, 9); vy += clamp(ay - mem._shAy, -9, 9); }
    mem._shAx = ax; mem._shAy = ay; mem._shF = f; mem._shAf = mem.frame;
  }
  const sp = p.spin ? Math.cos(p.spin * DEG) : 1, ss = p.spin ? Math.abs(Math.sin(p.spin * DEG)) : 0;
  // relative wind on the cloth: a light breeze (rests ~45 deg below horizontal) + the knot's own motion, so the
  // tails only stream flat when he moves or attacks (pose.wind adds a gust: attacks, victory, select)
  const breeze = 1.35 + p.wind * 0.4;
  const wx = -vx - breeze * sp - ss * 2.5, wy = Math.max(-vy * 0.8, -1.5);
  const speed = Math.min(9, Math.hypot(vx, vy) + p.wind * 0.5);
  const flut = 0.07 + 0.035 * speed;
  const rip = 2.2 + 0.18 * speed;
  // body rotation (flips, lying down) does not turn the cloth: gravity and wind stay in the feet frame
  const g = 1.2 * (1 - 0.6 * ss);
  LIE = clamp(p.lie, 0, 1);
  chain(mem, 0, 6, ax, ay - 1.5, 62, 11.5, 5.5, wx, wy, g, flut, 8.2, 0, 0.3, 0.6, t, 0.131, rip);
  chain(mem, 1, 6, ax + 1, ay + 2.5, 46.5, 10.5, 5.2, wx, wy, g, flut * 1.1, 9.1, 2.2, 0.3, 0.6, t, -0.131, rip * 0.9);
  chain(mem, 2, 3, bx, by, 19, 5.4, 4.2, wx * 0.45, wy * 0.6, 2.6, flut * 0.7, 7.3, 1.1, 0.34, 0.58, t, 0, 0.8);
  chain(mem, 3, 3, bx + 1.5, by + 0.5, 15, 5, 4, wx * 0.4, wy * 0.6, 2.8, flut * 0.7, 8.1, 3.3, 0.34, 0.58, t, 0, 0.7);
  // tabard (front) and back flap: lifted by the thighs, blown by the run
  const thMax = Math.max(p.nt, p.ft), thMin = Math.min(p.nt, p.ft);
  const push = clamp(thMax * 0.8 - 14, 0, 58);
  const tabT = push - clamp(vx * 2.4, -14, 26) * (1 - push / 70) + p.tab;
  TAB = follow(mem, '_shTab', tabT, 0.26, 0.6);
  const flapT = clamp(-thMin * 0.7 - 8, 0, 50) + clamp(vx * 3.2, -10, 28);
  FLAP = follow(mem, '_shFlap', flapT, 0.22, 0.64);
}

// ribbons: scarf tails (notched) and sash ends, built once per draw into edge arrays
const ELX = new Float32Array(RS), ELY = new Float32Array(RS), ERX = new Float32Array(RS), ERY = new Float32Array(RS);
let RN = 6, RO = 0, RNOTCH = 1, NTX = 0, NTY = 1;
function ribbonEdges(c, n) {
  const o = c * RS;
  let tx = 0, ty = 1;
  for (let i = 0; i <= n; i++) {
    const i0 = i > 0 ? i - 1 : 0, i1 = i < n ? i + 1 : n;
    tx = RX[o + i1] - RX[o + i0]; ty = RY[o + i1] - RY[o + i0];
    const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    const hw = RW[o + i] / 2;
    ELX[i] = RX[o + i] - ty * hw; ELY[i] = RY[o + i] + tx * hw;
    ERX[i] = RX[o + i] + ty * hw; ERY[i] = RY[o + i] - tx * hw;
  }
  NTX = tx; NTY = ty;
}
function ribbonP(c) {
  const n = RN, o = RO;
  c.moveTo(ELX[0], ELY[0]);
  for (let i = 1; i < n; i++) c.quadraticCurveTo(ELX[i], ELY[i], (ELX[i] + ELX[i + 1]) / 2, (ELY[i] + ELY[i + 1]) / 2);
  c.lineTo(ELX[n], ELY[n]);
  if (RNOTCH) c.lineTo(RX[o + n] - NTX * 7.5, RY[o + n] - NTY * 7.5);
  c.lineTo(ERX[n], ERY[n]);
  for (let i = n - 1; i >= 1; i--) c.quadraticCurveTo(ERX[i], ERY[i], (ERX[i] + ERX[i - 1]) / 2, (ERY[i] + ERY[i - 1]) / 2);
  c.lineTo(ERX[0], ERY[0]);
  c.closePath();
}
function ribbonD(c) {          // a fold running down the middle of the cloth
  const n = RN, o = RO;
  c.strokeStyle = RNOTCH ? C.scL : C.puL; c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo((RX[o + 1] + ELX[1]) / 2, (RY[o + 1] + ELY[1]) / 2);
  for (let i = 2; i < n; i++) c.lineTo(RX[o + i] * 0.6 + ELX[i] * 0.4, RY[o + i] * 0.6 + ELY[i] * 0.4);
  c.stroke();
}
const O_RIB = { k: 1.1, hi: C.scH, hk: 0.32, lw: 2.6, detail: ribbonD }, O_RIBF = { k: 1.1, lw: 2.6, detail: ribbonD };
const O_RIBS = { k: 1, lw: 2.2 };
function ribbon(ctx, c, n, base, dark, notch) {
  RN = n; RO = c * RS; RNOTCH = notch;
  ribbonEdges(c, n);
  cel(ctx, ribbonP, base, dark, notch ? (c === 0 ? O_RIB : O_RIBF) : O_RIBS);
}

// ---------------------------------------------------------------- scabbard + sheathed sword (torso frame)
function scabP(c) {
  c.moveTo(-3.1, 0); c.lineTo(3.1, 0); c.lineTo(2.7, SCAB_L - 2); c.quadraticCurveTo(0, SCAB_L + 2, -2.7, SCAB_L - 2);
  c.closePath();
}
function scabD(c) {
  c.fillStyle = C.gold;                                  // mouth fitting + tip chape
  c.fillRect(-3.4, 0, 6.8, 2.6);
  c.fillRect(-3.4, SCAB_L - 6, 6.8, 9);
  c.strokeStyle = C.goldD; c.lineWidth = 1; c.beginPath(); c.moveTo(-3.4, SCAB_L - 6); c.lineTo(3.4, SCAB_L - 6); c.stroke();
  c.strokeStyle = C.scabH; c.lineWidth = 1.1;
  c.beginPath(); c.moveTo(-1.2, 4); c.lineTo(-1, SCAB_L - 8); c.stroke();
}
const O_SCAB = { lw: 2.6, detail: scabD };
function scabbard(ctx, p) {
  ctx.save();
  ctx.translate(SCAB_M[0], SCAB_M[1]);
  ctx.rotate(-(p.lie ? lerp(SCAB_A, 5, clamp(p.lie, 0, 1)) : SCAB_A) * DEG);
  cel(ctx, scabP, C.scab, C.scabD, O_SCAB);
  if (p.sw === 'back') {
    // the sword sits in it, slid out by sp (sword frame: blade towards +y = into the scabbard)
    ctx.translate(0, -(GUARD + p.sp * BLADE));
    sword(ctx, p.sp > 0.02 ? p.sp * BLADE + 1 : 0);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- sword (sword frame: fist centre at 0, blade +y)
function bladeP(c) {
  const B = GUARD + 1 + BLADE;
  c.moveTo(-2, GUARD + 1);
  c.quadraticCurveTo(-2.6, GUARD + BLADE * 0.55, -1.6, B - 5);
  c.lineTo(0.3, B + 0.5);
  c.quadraticCurveTo(2.5, B - 4, 2.3, B - 8);
  c.lineTo(2.2, GUARD + 1);
  c.closePath();
}
function bladeD(c) {
  const B = GUARD + 1 + BLADE;
  c.strokeStyle = C.spine; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-0.6, GUARD + 3); c.quadraticCurveTo(-1.1, GUARD + BLADE * 0.55, -0.6, B - 7); c.stroke();
  c.strokeStyle = '#ffffff'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(1.5, GUARD + 4); c.lineTo(1.6, B - 7); c.stroke();
}
const O_BLADE = { k: 1.2, hi: C.steelH, hk: 0.5, lw: 2.2, detail: bladeD };
function gripP(c) { c.moveTo(-2.7, -16); c.lineTo(2.7, -16); c.lineTo(2.9, GUARD); c.lineTo(-2.9, GUARD); c.closePath(); }
function gripD(c) {           // black cord wrap: light diamonds
  c.fillStyle = C.wrapL;
  for (let y = -13.4; y < GUARD - 1.5; y += 3.8) { c.beginPath(); c.moveTo(0, y - 1.6); c.lineTo(1.6, y); c.lineTo(0, y + 1.6); c.lineTo(-1.6, y); c.closePath(); c.fill(); }
}
const O_GRIP = { lw: 2, detail: gripD };
function guardP(c) { ellipse(c, 0, GUARD, 6.4, 2.2); }
function pommelP(c) { c.moveTo(-3.1, -16.4); c.lineTo(3.1, -16.4); c.lineTo(2.8, -19.4); c.quadraticCurveTo(0, -20.8, -2.8, -19.4); c.closePath(); }
const O_GUARD = { hi: C.goldH, lw: 2 };
/** bladeVis: how much blade shows (0 = sheathed, else the full blade is drawn) */
function sword(ctx, bladeVis) {
  if (bladeVis !== 0) {
    if (bladeVis > 0 && bladeVis < BLADE) {
      ctx.save(); ctx.beginPath(); ctx.rect(-6, GUARD - 1, 12, bladeVis + 2); ctx.clip();
      cel(ctx, bladeP, C.steel, C.steelD, O_BLADE);
      ctx.restore();
    } else cel(ctx, bladeP, C.steel, C.steelD, O_BLADE);
  }
  cel(ctx, gripP, C.wrap, C.wrap, O_GRIP);
  cel(ctx, pommelP, C.gold, C.goldD, OXS);
  cel(ctx, guardP, C.gold, C.goldD, O_GUARD);
}

// ---------------------------------------------------------------- legs
let LK = 0;
function thighP(c) {
  c.moveTo(-7.5, -3);
  c.quadraticCurveTo(0, -7, 7.5, -3);
  c.bezierCurveTo(9.4, 6, 9.8, 17, 8, THIGH + 2.5);
  c.quadraticCurveTo(0, THIGH + 6, -8, THIGH + 2);
  c.bezierCurveTo(-9.4, 16, -9, 6, -7.5, -3);
  c.closePath();
}
function thighD(c) {          // trouser creases that deepen as the knee bends
  const b = clamp(-LK / 90, 0, 1.4);
  c.strokeStyle = C.trL; c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(-5, 8); c.quadraticCurveTo(-1, 12 + b * 3, 3.5, 11 + b * 5);
  c.moveTo(-6, THIGH - 4 - b * 2); c.quadraticCurveTo(0, THIGH - 2 + b * 2, 6, THIGH - 6 + b * 3);
  c.stroke();
}
const O_THIGH = { k: 1.3, lw: 0, detail: thighD };
function puffP(c) {           // trouser leg ballooning below the knee, gathered into the wraps
  c.moveTo(-8, -3);
  c.bezierCurveTo(-10.2, 2.5, -8.8, 8.5, -5.6, 11.5);
  c.lineTo(5.6, 11.5);
  c.bezierCurveTo(9, 8, 10.2, 1.5, 8, -3.5);
  c.quadraticCurveTo(0, -6.5, -8, -3);
  c.closePath();
}
function puffD(c) {
  c.strokeStyle = C.trL; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-6, 6); c.quadraticCurveTo(-2, 9.5, 2, 10.5); c.moveTo(1, 2); c.quadraticCurveTo(4, 6, 6.5, 6.5); c.stroke();
}
const O_PUFF = { k: 1.2, lw: OUT, detail: puffD }, O_PUFFF = { k: 1.2, lw: OUT };
function wrapsP(c) { c.moveTo(-6.3, 9); c.lineTo(6.3, 9); c.lineTo(5.8, 16.5); c.lineTo(-5.8, 16.5); c.closePath(); }
function wrapsD(c) {
  c.strokeStyle = C.puL; c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(-6.5, 12.6); c.lineTo(6.5, 11.4);
  c.moveTo(-6.5, 10.5); c.lineTo(6.5, 14.6);
  c.moveTo(-6.5, 15.3); c.lineTo(6.5, 13.8);
  c.stroke();
}
const O_WRAPS = { lw: 2, detail: wrapsD };
function bootP(c) { c.moveTo(-5.2, 14); c.lineTo(5.2, 14); c.lineTo(5.1, SHIN + 1); c.lineTo(-5.1, SHIN + 1); c.closePath(); }
function strapP(c) { c.moveTo(-5.6, SHIN - 4); c.lineTo(5.6, SHIN - 4); c.lineTo(5.6, SHIN - 0.6); c.lineTo(-5.6, SHIN - 0.6); c.closePath(); }
function footP(c) {           // tabi boot: rounded split toe
  c.moveTo(-5.4, -3);
  c.lineTo(-6, 4.5); c.quadraticCurveTo(-6.2, 7.5, -3, 7.5);
  c.lineTo(12.5, 7.5); c.quadraticCurveTo(16.6, 7.5, 16, 3.6);
  c.quadraticCurveTo(15.2, -0.2, 10, -0.8);
  c.quadraticCurveTo(6, -1.4, 5, -3.2);
  c.closePath();
}
function footD(c) {
  c.strokeStyle = C.clL; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(15.4, 1.8); c.quadraticCurveTo(12.6, 2.4, 12.2, 5.4); c.stroke();   // tabi split toe
  c.fillStyle = C.sole; c.fillRect(-6.5, 5.8, 23, 2.2);
}
const O_FOOT = { lw: 2.8, detail: footD };
function leg(ctx, hip, a, s, fa, far) {
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(-a * DEG);
  LK = s;
  if (far) cel(ctx, thighP, C.trF, C.trFD, OL);
  else celR(ctx, thighP, C.tr, C.trD, O_THIGH, OUT, 1.3);
  ctx.translate(0, THIGH);
  ctx.rotate(-s * DEG);
  cel(ctx, bootP, far ? C.bootF : C.boot, far ? C.bootFD : C.bootD, OM);
  cel(ctx, strapP, far ? C.puF : C.pu, far ? C.puFD : C.puD, OXS);
  cel(ctx, wrapsP, far ? C.puF : C.pu, far ? C.puFD : C.puD, O_WRAPS);
  cel(ctx, puffP, far ? C.trF : C.tr, far ? C.trFD : C.trD, far ? O_PUFFF : O_PUFF);
  ctx.translate(0, SHIN);
  ctx.rotate((a + s - fa) * DEG);
  cel(ctx, footP, far ? C.bootF : C.boot, far ? C.bootFD : C.bootD, O_FOOT);
  ctx.restore();
}

// kick streak: speed lines trailing the near (kicking) leg
function kickStreak(ctx, p) {
  ctx.save();
  ctx.translate(HIP_NEAR[0], HIP_NEAR[1]);
  ctx.rotate(-p.nt * DEG);
  ctx.globalAlpha = clamp(p.kick, 0, 1) * 0.8;
  ctx.strokeStyle = C.smO; ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-14, 30); ctx.lineTo(-24, 6);
  ctx.moveTo(-9, 48); ctx.lineTo(-20, 22);
  ctx.moveTo(-4, 60); ctx.lineTo(-12, 40);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------- torso (torso frame: hip 0,0, up = -y)
function torsoP(c) {
  c.moveTo(-12.5, -7);
  c.bezierCurveTo(-15, -18, -15.5, -30, -10, -36.5);
  c.quadraticCurveTo(-2, -40, 8, -38.5);
  c.bezierCurveTo(15.5, -35.5, 17, -24, 13.5, -7);
  c.closePath();
}
let TFOLD = 0;
function torsoD(c) {
  // crossover collar: far lapel under, near lapel over (ink edge under a purple band)
  c.lineCap = 'butt';
  c.strokeStyle = INK; c.lineWidth = 8.2;
  c.beginPath(); c.moveTo(11.5, -40); c.quadraticCurveTo(9.5, -30, 4, -22); c.stroke();
  c.strokeStyle = C.puD; c.lineWidth = 5.6;
  c.beginPath(); c.moveTo(11.5, -40); c.quadraticCurveTo(9.5, -30, 4, -22); c.stroke();
  c.strokeStyle = INK; c.lineWidth = 9;
  c.beginPath(); c.moveTo(-3.5, -41); c.quadraticCurveTo(2.6, -27, 13.4, -14.5); c.stroke();
  c.strokeStyle = C.pu; c.lineWidth = 6.4;
  c.beginPath(); c.moveTo(-3.5, -41); c.quadraticCurveTo(2.6, -27, 13.4, -14.5); c.stroke();
  c.strokeStyle = C.puH; c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(-3.6, -38); c.quadraticCurveTo(2, -27.5, 11.2, -17); c.stroke();
  // shirt creases (they bunch up as he leans in)
  c.lineCap = 'round';
  c.strokeStyle = C.clL; c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(-10, -26); c.quadraticCurveTo(-6, -22 + TFOLD, -2, -19.5);
  c.moveTo(-11.5, -20); c.quadraticCurveTo(-8, -18 + TFOLD * 0.5, -5, -17.5);
  c.moveTo(8, -21); c.quadraticCurveTo(10.5, -19, 13.6, -19.5);
  c.stroke();
}
const O_TORSO = { k: 1.3, lw: 0, detail: torsoD };
function sashP(c) {
  c.moveTo(-13.6, -17.5); c.quadraticCurveTo(0, -15.8, 15, -18);
  c.lineTo(14.4, -8.4); c.quadraticCurveTo(0, -6.8, -13.2, -8.8);
  c.closePath();
}
function sashD(c) {
  c.strokeStyle = C.puL; c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(-14, -14.4); c.quadraticCurveTo(0, -12.8, 15, -14.8);
  c.moveTo(-14, -11.5); c.quadraticCurveTo(0, -10, 15, -11.8);
  c.stroke();
  c.fillStyle = C.puH; c.globalAlpha = 0.5;
  c.fillRect(-12, -17, 10, 1.3);
  c.globalAlpha = 1;
}
const O_SASH = { k: 1.2, hi: C.puH, hk: 0.35, lw: 2.6, detail: sashD };
function buckleP(c) { c.rect(4, -16.4, 7.6, 6.6); }
function buckleD(c) {
  c.fillStyle = C.pu; c.fillRect(5.9, -14.6, 3.8, 3);
  c.strokeStyle = C.silverD; c.lineWidth = 1; c.strokeRect(5.9, -14.6, 3.8, 3);
}
const O_BUCKLE = { hi: '#eef2f6', lw: 1.8, detail: buckleD };
function knobP(c) { circle(c, 13.2, -12.8, 1.9); }
function torso(ctx, p) {
  TFOLD = clamp(p.tor / 12, -2, 3);
  celR(ctx, torsoP, C.cl, C.clD, O_TORSO, OUT, 1.4);
  cel(ctx, sashP, C.pu, C.puD, O_SASH);
  cel(ctx, buckleP, C.silver, C.silverD, O_BUCKLE);
  flat(ctx, knobP, C.puL, 1.4);
}

// tabard: front panel hanging from the sash (pivot under the buckle), swung by the thighs; the hem swings
// further than the top so it bends like cloth instead of flipping like a board
const TB = new Float32Array(16);      // outer (0..7) and trim (8..15): ML, MR, BL, BR as x,y pairs
function tabPts(o, w, h) {
  const a1 = TAB * 0.45 * DEG, a2 = TAB * DEG, s1 = Math.sin(a1), c1 = Math.cos(a1), s2 = Math.sin(a2), c2 = Math.cos(a2);
  const hm = h * 0.5, hb = h - hm;
  const mx = hm * s1, my = hm * c1;
  TB[o] = -w * c1 + mx; TB[o + 1] = w * s1 + my;
  TB[o + 2] = w * c1 + mx; TB[o + 3] = -w * s1 + my;
  TB[o + 4] = mx - w * c2 + hb * s2; TB[o + 5] = my + w * s2 + hb * c2;
  TB[o + 6] = mx + w * c2 + hb * s2; TB[o + 7] = my - w * s2 + hb * c2;
}
function tabP(c) {
  c.moveTo(-7.5, 0); c.lineTo(7.5, 0);
  c.quadraticCurveTo(TB[2], TB[3], TB[6], TB[7]);
  c.quadraticCurveTo((TB[4] + TB[6]) / 2, (TB[5] + TB[7]) / 2 + 1.5, TB[4], TB[5]);
  c.quadraticCurveTo(TB[0], TB[1], -7.5, 0);
  c.closePath();
}
function tabD(c) {
  c.fillStyle = C.clL; c.fillRect(-9, 0, 18, 2.6);                  // occlusion under the sash
  c.strokeStyle = C.pu; c.lineWidth = 1.9;
  c.beginPath();
  c.moveTo(-5, 2.6); c.quadraticCurveTo(TB[8], TB[9], TB[12], TB[13]);
  c.quadraticCurveTo((TB[12] + TB[14]) / 2, (TB[13] + TB[15]) / 2 + 1, TB[14], TB[15]);
  c.quadraticCurveTo(TB[10], TB[11], 4.8, 2.6);
  c.stroke();
  c.strokeStyle = C.clL; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-1, 6);
  c.quadraticCurveTo((TB[0] + TB[2]) / 2 + 0.5, (TB[1] + TB[3]) / 2, (TB[4] + TB[6]) / 2 - 1.5, (TB[5] + TB[7]) / 2 - 5);
  c.stroke();
}
const O_TAB = { k: 1.2, lw: 2.8, detail: tabD };
function tabard(ctx) {
  tabPts(0, 7.4, 29.5); tabPts(8, 5, 26.6);
  ctx.save(); ctx.translate(7, -8.6);
  cel(ctx, tabP, C.cl, C.clD, O_TAB);
  ctx.restore();
}
function flapP(c) { c.moveTo(-6, 0); c.lineTo(5.5, 0); c.lineTo(6, 22); c.quadraticCurveTo(-0.5, 23.5, -6.6, 21); c.closePath(); }
function flapD(c) { c.strokeStyle = C.puF; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-4, 2); c.lineTo(-4.4, 19.5); c.quadraticCurveTo(0, 20.6, 4, 19.6); c.stroke(); }
const O_FLAP = { k: 1.2, lw: 2.6, detail: flapD };
function backFlap(ctx) {
  ctx.save(); ctx.translate(-8.5, -9); ctx.rotate(FLAP * DEG);
  cel(ctx, flapP, C.clF, C.clFD, O_FLAP);
  ctx.restore();
}

// ---------------------------------------------------------------- scarf wrap + knot (torso frame)
function wrapP(c) {
  c.moveTo(-18.5, -42);
  c.bezierCurveTo(-11, -52.5, 9, -54, 21, -47);           // under the chin
  c.quadraticCurveTo(27.6, -42.6, 25.4, -35.6);           // bunched over the far shoulder
  c.quadraticCurveTo(24.4, -28.6, 17.4, -27.6);
  c.quadraticCurveTo(14.6, -19.4, 7.4, -19.6);            // the cowl's drape on the chest
  c.quadraticCurveTo(3, -22.4, 0.4, -26.4);
  c.quadraticCurveTo(-8.6, -26.2, -15.6, -29.6);          // bunched over the near shoulder
  c.quadraticCurveTo(-23, -34, -18.5, -42);
  c.closePath();
}
function wrapD(c) {           // three wraps of cloth
  c.strokeStyle = C.scL; c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(-16, -38.6); c.quadraticCurveTo(2, -33.2, 23.6, -38.4);
  c.moveTo(-14.2, -32.4); c.quadraticCurveTo(2.6, -28, 19.4, -31.2);
  c.moveTo(11, -26.8); c.quadraticCurveTo(12.4, -23.2, 9, -20.8);
  c.moveTo(5.4, -26); c.quadraticCurveTo(6.4, -23.6, 5.4, -21.6);
  c.stroke();
  c.strokeStyle = C.scH; c.lineWidth = 1.2; c.globalAlpha = 0.7;
  c.beginPath(); c.moveTo(-12, -44.4); c.quadraticCurveTo(0, -46.6, 10, -45.2); c.stroke();
  c.globalAlpha = 1;
}
const O_WRAP = { k: 1.3, hi: C.scH, hk: 0.4, lw: 3, detail: wrapD };
function scarfWrap(ctx) { cel(ctx, wrapP, C.sc, C.scD, O_WRAP); }
function knotP(c) {
  c.moveTo(KNOT[0] + 4.5, KNOT[1] - 3);
  c.quadraticCurveTo(KNOT[0] - 1, KNOT[1] - 6.5, KNOT[0] - 5, KNOT[1] - 2);
  c.quadraticCurveTo(KNOT[0] - 6.5, KNOT[1] + 3, KNOT[0] - 1.5, KNOT[1] + 4.5);
  c.quadraticCurveTo(KNOT[0] + 4, KNOT[1] + 4.6, KNOT[0] + 4.5, KNOT[1] - 3);
  c.closePath();
}
function knotD(c) { c.strokeStyle = C.scL; c.lineWidth = 1.2; c.beginPath(); c.moveTo(KNOT[0] - 3, KNOT[1] - 1); c.quadraticCurveTo(KNOT[0], KNOT[1] + 0.5, KNOT[0] + 2, KNOT[1] + 3); c.stroke(); }
const O_KNOT = { k: 1.2, lw: 2.4, detail: knotD };
function knot(ctx) { cel(ctx, knotP, C.sc, C.scD, O_KNOT); }

// ---------------------------------------------------------------- head: hood-mask + eye slit (head frame)
function hoodP(c) {
  c.moveTo(-5, 21);
  c.bezierCurveTo(-15.5, 16.5, -20.5, 4, -19, -6.5);
  c.bezierCurveTo(-17.5, -18, -7, -24, 3, -23.6);
  c.bezierCurveTo(13.5, -23.2, 19.8, -14, 20, -5.5);
  c.quadraticCurveTo(20.2, 0, 21.4, 5.2);
  c.quadraticCurveTo(21.8, 8.6, 19.4, 10);
  c.bezierCurveTo(19, 16, 12.5, 21.5, 5, 21.5);
  c.quadraticCurveTo(0, 22, -5, 21);
  c.closePath();
}
let YAW = 0;
function hoodD(c) {
  const y = YAW * 2.5;
  // broad matte lit area on the upper-left (cloth, not a helmet gloss)
  c.fillStyle = C.hoodLit;
  c.beginPath(); c.ellipse(1.5 - 4 * FAC, -13.5, 12, 7.6, -0.35 * FAC, 0, TAU); c.fill();
  c.globalAlpha = 0.5; c.fillStyle = C.hoodH;
  c.beginPath(); c.ellipse(1 - 7 * FAC, -15.5, 5.6, 3.2, -0.5 * FAC, 0, TAU); c.fill();
  c.globalAlpha = 1;
  // the book's centre seam, crown to slit and slit to chin: a dark seam with a lit stitch edge
  c.lineCap = 'round';
  c.strokeStyle = C.seamD; c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(-2 + y * 0.4, -23.4); c.bezierCurveTo(4 + y, -21.4, 8.6 + y, -16, 9.6 + y, -11.4);
  c.moveTo(10.6 + y, 6.6); c.quadraticCurveTo(11.6 + y, 13.5, 10 + y, 21);
  c.stroke();
  c.strokeStyle = C.seamL; c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(-0.6 + y * 0.4, -23.6); c.bezierCurveTo(5.4 + y, -21.4, 10 + y, -16, 11 + y, -11.6);
  c.moveTo(12 + y, 6.8); c.quadraticCurveTo(13 + y, 13.5, 11.4 + y, 20.6);
  c.stroke();
  // cloth folds at the nape and where the hood gathers into the cowl
  c.strokeStyle = C.clL; c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(-14.5, 6); c.quadraticCurveTo(-12, 13, -7.5, 17);
  c.moveTo(-17.2, -2); c.quadraticCurveTo(-15, 4, -12.6, 6.6);
  c.moveTo(-3, 17.6); c.quadraticCurveTo(1, 15.6, 4.5, 18.4);
  c.stroke();
}
const O_HOOD = { k: 1.45, hi: C.hoodH, hk: 0.3, lw: 0, detail: hoodD };

// faces: lid = upper-lid drop (0..1), sl = lid slant (+ inner corner lower), by/ba = brow height/angle (+ = angry),
// st/sb = slit top/bottom, sbc = cheeks pushing the lower edge up (smiling), iris size, big = eye scale
const FACES = {
  calm: { lid: 0.14, sl: 0, by: -8.4, ba: 0, st: -10.6, sb: 5.8, sbc: 0.2, iris: 0.64, big: 1 },
  focus: { lid: 0.4, sl: 0.34, by: -7.2, ba: 0.44, st: -10.2, sb: 5.4, sbc: 0, iris: 0.68, big: 1 },
  happy: { shut: 1, by: -9.4, ba: -0.1, st: -10.8, sb: 5.2, sbc: 2 },
  surprised: { lid: 0, sl: 0, by: -11.4, ba: -0.2, st: -12.4, sb: 6.6, sbc: -0.6, iris: 0.5, big: 1.08 },
  ouch: { shut: 2, by: -7.6, ba: -0.4, st: -10, sb: 5.2, sbc: 1 },
  worried: { lid: 0.1, sl: -0.3, by: -9.4, ba: -0.44, st: -11, sb: 5.8, sbc: 0, iris: 0.58, big: 1.02 },
  ko: { shut: 3, by: -8.8, ba: -0.1, st: -10.6, sb: 5.8, sbc: 0 },
  closed: { shut: 4, by: -8.6, ba: 0, st: -10.6, sb: 5.8, sbc: 0.6 },
  wink: { lid: 0.16, sl: 0.04, by: -8.8, ba: 0.04, st: -10.6, sb: 5.8, sbc: 1, iris: 0.64, big: 1, wink: 1 },
};
let ST = -7, SB = 3.8, SBC = 0;
const SX = -3;                  // the slit sits 3 px back from the face edge
function slitP(c) {
  const mid = (ST + SB) / 2, x0 = SX + YAW * 2;
  c.moveTo(x0 - 1.8, mid);
  c.quadraticCurveTo(x0 - 1, ST + 0.4, x0 + 4, ST);
  c.quadraticCurveTo(x0 + 14, ST - 1.3, 25, ST - 0.6);
  c.lineTo(25, SB);
  c.quadraticCurveTo(x0 + 13, SB + 0.8 - SBC, x0 + 4, SB);
  c.quadraticCurveTo(x0 - 1, SB, x0 - 1.8, mid);
  c.closePath();
}
function neckP(c) { c.moveTo(-6, -6); c.lineTo(8, -6); c.lineTo(7, 4); c.lineTo(-6, 4); c.closePath(); }
function head(ctx, p) {
  // dark neck filler (hood fabric) so a tilted head never shows a gap above the scarf
  flat(ctx, neckP, C.hoodD, 0);
  ctx.translate(HC[0], HC[1]);
  YAW = clamp(p.yaw, -1, 1);
  cel(ctx, hoodP, C.hood, C.hoodD, O_HOOD);
  rim(ctx, hoodP, OUT, 1.1, C.rimHood, DASH_HOOD);
  const F = FACES[p.face] || FACES.calm;
  ST = F.st; SB = F.sb; SBC = F.sbc;
  // the slit: skin + brows + eyes, all clipped to the hood
  ctx.save();
  ctx.beginPath(); hoodP(ctx); ctx.clip();
  ctx.beginPath(); slitP(ctx);
  ctx.fillStyle = C.skin; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = C.skinD; ctx.fillRect(-8, ST - 2, 34, 3);                 // hood brim occlusion
  ctx.fillStyle = C.skinH; ctx.globalAlpha = 0.55; ctx.fillRect(SX - 1 + YAW * 2, SB - 2.6, 9, 1.6); ctx.globalAlpha = 1;
  eyes(ctx, p, F);
  ctx.restore();
  const x0 = SX + YAW * 2;
  ctx.beginPath();
  ctx.moveTo(x0 - 1.8, (ST + SB) / 2);
  ctx.quadraticCurveTo(x0 - 1, ST + 0.4, x0 + 4, ST); ctx.quadraticCurveTo(x0 + 14, ST - 1.3, 25, ST - 0.6);
  ctx.moveTo(x0 - 1.8, (ST + SB) / 2);
  ctx.quadraticCurveTo(x0 - 1, SB, x0 + 4, SB); ctx.quadraticCurveTo(x0 + 13, SB + 0.8 - SBC, 25, SB);
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
  ink(ctx, hoodP, OUT);
}

function eyes(ctx, p, F) {
  const yw = YAW * 2.6;
  const x1 = 5.4 + yw, x2 = 15 + yw * 0.6, ey = (ST + SB) / 2 + 0.6 + (p.ly || 0) * 0.6;
  const sh = F.shut || (p.blink && !F.shut ? 4 : 0);
  if (sh) {
    ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const x = i ? x2 : x1, w = i ? 2.9 : 4.4;
      ctx.lineWidth = i ? 1.8 : 2.2;
      ctx.beginPath();
      if (sh === 1) { ctx.moveTo(x - w, ey + 1.4); ctx.quadraticCurveTo(x, ey - 3.2, x + w, ey + 1.4); }       // ^ ^
      else if (sh === 2) {                                                                                     // > <
        const d = i ? -1 : 1;
        ctx.moveTo(x - w * d, ey - 2.4); ctx.lineTo(x + w * 0.8 * d, ey); ctx.lineTo(x - w * d, ey + 2.4);
      } else if (sh === 3) {                                                                                   // dizzy
        const r = i ? 3.2 : 4.2;
        ctx.lineWidth = i ? 1.2 : 1.4;
        for (let a = 0; a < 4 * Math.PI; a += 0.45) { const rr = r * a / (4 * Math.PI); ctx.lineTo(x + Math.cos(a + T * 6) * rr, ey + Math.sin(a + T * 6) * rr); }
      } else { ctx.moveTo(x - w, ey + 0.6); ctx.quadraticCurveTo(x, ey + 2.6, x + w, ey + 0.6); }            // closed, calm
      ctx.stroke();
    }
  } else {
    eye(ctx, x1, ey, 4.6 * F.big, 5.3 * F.big, F, p, -1, F.wink ? 1 : 0);
    eye(ctx, x2, ey - 0.2, 3 * F.big, 4.9 * F.big, F, p, 1, 0);
  }
  // brows (inner ends point at the bridge of the nose)
  ctx.strokeStyle = C.brow; ctx.lineCap = 'round'; ctx.lineWidth = 2.7;
  const ba = F.ba + (F.wink ? 0.1 : 0);
  ctx.save(); ctx.translate(x1 - 0.4, F.by + (F.wink ? 1 : 0)); ctx.rotate(ba);
  ctx.beginPath(); ctx.moveTo(-5, 0.6); ctx.quadraticCurveTo(-0.6, -1.3, 4.4, 0); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(x2 + 0.6, F.by - 0.2 - (F.wink ? 0.6 : 0)); ctx.rotate(-ba * 0.9);
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(-2.2, 0); ctx.quadraticCurveTo(0.6, -1.2, 2.6, 0.5); ctx.stroke(); ctx.restore();
  if (p.glint > 0.01) glint(ctx, x1 + 2.4, ey - 2.6, p.glint);
}

function eye(ctx, x, y, rx, ry, F, p, side, wink) {
  if (wink) {
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - rx, y + 1); ctx.quadraticCurveTo(x, y - 2.8, x + rx, y + 1); ctx.stroke();
    return;
  }
  ctx.fillStyle = C.white; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.clip();
  const ix = x + rx * 0.16 + clamp(p.lx, -1, 1) * rx * 0.45, iy = y + 0.5 + (p.ly || 0) * ry * 0.25;
  const ir = ry * F.iris;
  ctx.fillStyle = C.iris; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
  ctx.fillStyle = C.irisL; ctx.beginPath(); ctx.arc(ix, iy + ir * 0.45, ir * 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = C.pupil; ctx.beginPath(); ctx.arc(ix, iy, ir * 0.48, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ix - ir * 0.36, iy - ir * 0.4, 0.95, 0, TAU); ctx.fill();   // 1 px catchlight
  // upper lid: skin drops over the top of the eye, slanted (inner corner = towards +x for the near eye)
  const lid = F.lid;
  if (lid > 0.01) {
    const yl = y - ry + 2 * ry * lid, sl = F.sl * ry * -side;
    ctx.fillStyle = C.skin;
    ctx.beginPath(); ctx.moveTo(x - rx - 1, y - ry - 1); ctx.lineTo(x + rx + 1, y - ry - 1);
    ctx.lineTo(x + rx + 1, yl + sl); ctx.lineTo(x - rx - 1, yl - sl); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // lash line along the lid
  ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineWidth = side < 0 ? 2.3 : 2;
  ctx.beginPath();
  if (lid > 0.01) {
    const yl = y - ry + 2 * ry * lid, sl = F.sl * ry * -side;
    ctx.moveTo(x - rx - 0.4, yl - sl + 0.3); ctx.lineTo(x + rx + 0.4, yl + sl + 0.3);
  } else ctx.ellipse(x, y, rx + 0.2, ry + 0.2, 0, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
}

function glint(ctx, x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = clamp(a, 0, 1);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -5); ctx.quadraticCurveTo(0.5, -0.5, 5, 0); ctx.quadraticCurveTo(0.5, 0.5, 0, 5);
  ctx.quadraticCurveTo(-0.5, 0.5, -5, 0); ctx.quadraticCurveTo(-0.5, -0.5, 0, -5);
  ctx.fill();
  ctx.globalAlpha = 1; ctx.restore();
}

// ---------------------------------------------------------------- arms (torso frame)
let UL = UPPER, FL = FORE;
function upperP(c) { capsule(c, UL, 9.2, 8.3); }
function sleeveP(c) {
  c.moveTo(-6.5, 1); c.bezierCurveTo(-6.8, -6, 6.8, -6, 6.5, 1);
  c.lineTo(7, 9.8); c.quadraticCurveTo(0, 12, -7, 9.8); c.closePath();
}
function sleeveD(c) { c.strokeStyle = C.clL; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-3.2, 2.5); c.quadraticCurveTo(-0.6, 6, -2, 9.5); c.stroke(); }
function foreP(c) { capsule(c, FL + 1, 8.4, 7.4); }
function bracerP(c) { c.moveTo(-4.9, 3.6); c.lineTo(4.9, 3.6); c.lineTo(4.5, FL + 1.8); c.lineTo(-4.5, FL + 1.8); c.closePath(); }
function bracerD(c) {         // criss-cross wrapping
  c.strokeStyle = C.puL; c.lineWidth = 1.1;
  c.beginPath();
  for (let y = 4.2; y < FL; y += 4.2) { c.moveTo(-5, y); c.lineTo(5, y + 3.4); c.moveTo(5, y); c.lineTo(-5, y + 3.4); }
  c.stroke();
}
const O_UP = { k: 1.2, lw: 2.7 }, O_SLEEVE = { k: 1.3, lw: 2.7, detail: sleeveD }, O_SLEEVEF = { k: 1.3, lw: 2.7 };
const O_BR = { k: 1.2, lw: 2.4, detail: bracerD }, O_BRF = { k: 1.2, lw: 2.4 };
let FAR_ARM = false;
/** handOnly: walk the arm's transforms but draw just the hand (a palm that must show in front of the hood) */
function arm(ctx, slot, u, f, h, shape, st, far, p, handOnly = false) {
  UL = UPPER * st; FL = FORE * st; FAR_ARM = far;
  ctx.save();
  ctx.translate(slot[0], slot[1] - p.shr);
  ctx.rotate(-u * DEG);
  if (!handOnly) {
    cel(ctx, upperP, far ? C.skinF : C.skin, far ? C.skinFD : C.skinD, O_UP);
    cel(ctx, sleeveP, far ? C.slF : C.sl, far ? C.slFD : C.slD, far ? O_SLEEVEF : O_SLEEVE);
  }
  ctx.save();
  ctx.translate(0, UL);
  ctx.rotate(-f * DEG);
  if (!handOnly) {
    cel(ctx, foreP, far ? C.skinF : C.skin, far ? C.skinFD : C.skinD, O_UP);
    cel(ctx, bracerP, far ? C.puF : C.pu, far ? C.puFD : C.puD, far ? O_BRF : O_BR);
  }
  ctx.translate(0, FL + 1);
  ctx.rotate(-h * DEG);
  if (!far && p.sw === 'hand') {
    ctx.save(); ctx.translate(0, 4);
    let swa = p.swa;
    if (p.al > 0.001) swa = lerp(swa, SCAB_A - (AU + AF + AH), p.al);
    ctx.rotate(-swa * DEG);
    if (p.tw > 0.01) twirl(ctx, p.tw);
    if (p.thr > 0.01) thrust(ctx, p.thr);
    sword(ctx, -1);
    ctx.restore();
  }
  hand(ctx, far ? (shape === 'grip' ? 'fist' : shape) : shape, far, p);
  ctx.restore();
  ctx.restore();
}

function thrust(ctx, a) {    // thrust: speed lines streaming back along the blade + a flash at the point
  const B = GUARD + 1 + BLADE;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = C.smO; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, B - 4); ctx.lineTo(-6, B - 34);
  ctx.moveTo(6.5, B - 8); ctx.lineTo(6.5, B - 40);
  ctx.moveTo(-11, B - 14); ctx.lineTo(-11, B - 30);
  ctx.stroke();
  ctx.globalAlpha = 0.95 * a; ctx.strokeStyle = C.smI; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-6, B - 6); ctx.lineTo(-6, B - 24); ctx.stroke();
  ctx.translate(0.3, B + 2);
  ctx.fillStyle = C.smI;
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.quadraticCurveTo(0.8, -0.8, 7, 0); ctx.quadraticCurveTo(0.8, 0.8, 0, 7);
  ctx.quadraticCurveTo(-0.8, 0.8, -7, 0); ctx.quadraticCurveTo(-0.8, -0.8, 0, -7);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}
function twirl(ctx, a) {      // sword twirl: a thin ring blurred by the blade tip + two bright streaks
  ctx.save();
  const R = GUARD + BLADE - 4;
  ctx.globalAlpha = 0.2 * a; ctx.strokeStyle = C.smO; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = C.smI; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  const a0 = -T * 26;
  ctx.beginPath(); ctx.arc(0, 0, R + 3, a0, a0 + 1.3); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R + 3, a0 + Math.PI, a0 + Math.PI + 1.3); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// hands (hand frame: wrist at 0, fingers towards +y, thumb on the +x side)
function fistP(c) { blob(c, FIST, 0.55); }
const FIST = [[-4.3, -0.6], [4, -1], [5.4, 4], [3.6, 8.8], [-2.6, 9], [-5, 4.6]];
function fistD(c) { c.strokeStyle = FAR_ARM ? C.skinFD : C.skinD; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-3, 6.8); c.quadraticCurveTo(0, 7.8, 3, 6.4); c.stroke(); }
const O_FIST = { k: 1.1, lw: 2.5, detail: fistD };
function openP(c) {
  c.moveTo(-4, -0.6); c.lineTo(3.8, -0.8);
  c.quadraticCurveTo(8.6, 2.6, 8.4, 5.6); c.quadraticCurveTo(6.4, 5.4, 4.6, 4.6);     // thumb
  c.lineTo(4.6, 11.6); c.quadraticCurveTo(3, 14, 0, 13.6); c.quadraticCurveTo(-3.6, 12.8, -4.4, 8.6);
  c.closePath();
}
function openD(c) { c.strokeStyle = FAR_ARM ? C.skinFD : C.skinD; c.lineWidth = 1; c.beginPath(); c.moveTo(-1.6, 8); c.lineTo(-1.4, 13); c.moveTo(1.4, 8.2); c.lineTo(1.6, 13.4); c.stroke(); }
const O_OPEN = { k: 1.1, lw: 2.4, detail: openD };
function flatP(c) {            // hand tucked flat (under the crossed arm)
  c.moveTo(-4, -0.6); c.lineTo(4, -0.8); c.lineTo(4.6, 9); c.quadraticCurveTo(0, 11.4, -4.2, 9); c.closePath();
}
function thumbP(c) { c.moveTo(2.6, 1); c.quadraticCurveTo(5, -2.4, 11.6, -1.4); c.quadraticCurveTo(13.8, 1.4, 11.4, 3.8); c.lineTo(4.2, 5); c.closePath(); }
function fingerP(c) { capsule(c, 8, 3.4, 3); }
function hand(ctx, shape, far, p) {
  const sk = far ? C.skinF : C.skin, skd = far ? C.skinFD : C.skinD;
  if (shape === 'open') { cel(ctx, openP, sk, skd, O_OPEN); return; }
  if (shape === 'flat') { cel(ctx, flatP, sk, skd, OM); return; }
  if (shape === 'stars' && p.stars > 0) {
    for (let i = 0; i < p.stars; i++) {
      ctx.save(); ctx.translate(-3 + i * 5.6, 11 + (i === 1 ? 2.2 : 0)); ctx.rotate(0.4 + i * 0.5);
      star(ctx, 5.6);
      ctx.restore();
    }
  }
  if (shape === 'point') {
    ctx.save(); ctx.translate(1.5, 6.5); cel(ctx, fingerP, sk, skd, OS); ctx.restore();
  }
  cel(ctx, fistP, sk, skd, O_FIST);
  if (shape === 'thumb') cel(ctx, thumbP, sk, skd, OS);
}

// ---------------------------------------------------------------- shuriken
let SR = 9;
function starP(c) {
  const r = SR, ri = r * 0.3;
  c.moveTo(r, 0);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, b = a + Math.PI / 4, n = a + Math.PI / 2;
    // curved blade: tip, swept back edge to the notch, then out to the next tip
    c.quadraticCurveTo(Math.cos(a + 0.45) * r * 0.55, Math.sin(a + 0.45) * r * 0.55, Math.cos(b) * ri, Math.sin(b) * ri);
    c.quadraticCurveTo(Math.cos(n - 0.2) * r * 0.42, Math.sin(n - 0.2) * r * 0.42, Math.cos(n) * r, Math.sin(n) * r);
  }
  c.closePath();
}
function starD(c) {
  const r = SR;
  c.fillStyle = C.spine; c.beginPath(); c.arc(0, 0, r * 0.24, 0, TAU); c.fill();
  c.fillStyle = INK; c.beginPath(); c.arc(0, 0, r * 0.12, 0, TAU); c.fill();
}
const O_STAR = { k: 0.8, hi: C.steelH, hk: 0.5, lw: 1.8, detail: starD };
function star(ctx, r) { SR = r; O_STAR.lw = r > 6 ? 1.9 : 1.4; cel(ctx, starP, C.steel, C.steelD, O_STAR); }

/** A 4-point throwing star (~18 px across) centred on the ctx origin, spinning with t (seconds). */
export function drawShuriken(ctx, t = 0) {
  ctx.save();
  ctx.rotate((t * 24) % TAU);
  ctx.globalAlpha = 0.28; ctx.strokeStyle = '#e6eef8'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(0, 0, 9.6, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  star(ctx, 9);
  ctx.restore();
}

// ---------------------------------------------------------------- slash smear (torso frame, crisp white-blue)
let SM_A0 = 0, SM_A1 = 0, SM_R = 0, SM_TH = 0, SM_U0 = 0;
function smearP(c) {
  const n = 18, a0 = SM_A0, a1 = SM_A1, R = SM_R;
  for (let i = 0; i <= n; i++) {
    const u = SM_U0 + (1 - SM_U0) * (i / n), a = a0 + (a1 - a0) * u;
    const x = Math.sin(a) * R, y = Math.cos(a) * R;
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const u = SM_U0 + (1 - SM_U0) * (i / n), a = a0 + (a1 - a0) * u;
    const r = R - (1.5 + SM_TH * Math.pow(u, 1.5));
    c.lineTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  c.closePath();
}
function smear(ctx, p) {
  const A = clamp(p.smear, 0, 1);
  let a0 = p.sa0 * DEG, a1 = p.sa1 * DEG, R = p.sr;
  if (p.sm) {
    // attach the leading edge to the blade tip (or the throwing hand), keeping the authored sweep
    const m = MT.reset();
    m.translate(SLOT_NEAR[0], SLOT_NEAR[1] - p.shr); m.rotate(-AU * DEG); m.translate(0, UPPER * AST);
    m.rotate(-AF * DEG); m.translate(0, FORE * AST + 1); m.rotate(-AH * DEG); m.translate(0, 4);
    let tx = m.px(0, 0), ty = m.py(0, 0);
    if (p.sw === 'hand') {
      let swa = p.swa;
      if (p.al > 0.001) swa = lerp(swa, SCAB_A - (AU + AF + AH), p.al);
      m.rotate(-swa * DEG);
      tx = m.px(0.3, GUARD + BLADE); ty = m.py(0.3, GUARD + BLADE);
    }
    const dx = tx - p.scx, dy = (ty - p.scy) / p.sfy;
    let d = Math.atan2(dx, dy) - a1;
    d -= Math.round(d / TAU) * TAU;
    a0 += d; a1 += d; R = Math.hypot(dx, dy) - 5;
  }
  ctx.save();
  ctx.translate(p.scx, p.scy);
  if (p.sfy !== 1) ctx.scale(1, p.sfy);
  const thk = p.sth / Math.sqrt(p.sfy);
  SM_A0 = a0; SM_A1 = a1; SM_R = R + 6; SM_TH = thk; SM_U0 = 0;
  ctx.globalAlpha = A * 0.8; ctx.fillStyle = C.smO;
  ctx.beginPath(); smearP(ctx); ctx.fill();
  SM_U0 = 0.35; SM_TH = thk * 0.5; SM_R = R + 5;
  ctx.globalAlpha = A; ctx.fillStyle = C.smI;
  ctx.beginPath(); smearP(ctx); ctx.fill();
  // crisp leading edge
  ctx.globalAlpha = A * 0.9; ctx.strokeStyle = C.smE; ctx.lineWidth = 1.4 / Math.max(0.5, p.sfy);
  ctx.beginPath();
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = SM_A0 + (SM_A1 - SM_A0) * (0.45 + 0.55 * i / n);
    const x = Math.sin(a) * (R + 6), y = Math.cos(a) * (R + 6);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// speed lines behind him (dash slash, strike, dive kick); hip frame
function dashLines(ctx, p) {
  ctx.save();
  ctx.globalAlpha = clamp(p.dash, 0, 1) * 0.75;
  ctx.strokeStyle = C.smO; ctx.lineCap = 'round';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-26, -58); ctx.lineTo(-70, -58);
  ctx.moveTo(-22, -30); ctx.lineTo(-84, -30);
  ctx.moveTo(-30, -8); ctx.lineTo(-64, -8);
  ctx.stroke();
  ctx.strokeStyle = C.smI; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-24, -44); ctx.lineTo(-58, -44); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}
