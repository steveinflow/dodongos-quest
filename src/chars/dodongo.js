// Dodongo: the hero.  v2 art + animation, drawn in code from the book's character sheet.
//
// Design: tousled light-brown curly faux-hawk (a crest of curls swept forward, a darker close crop on the back and
// sides), steel breastplate with crossed stitched leather straps and a faceted brass diamond, a wide stitched belt with
// a brass star buckle, a steel fauld between two leather tassets, a grey fur mantle on the shoulders BEHIND the head
// with a steel gorget, olive sleeves and trousers, steel knee pads, fur-cuffed boots with steel toe caps.  ONLY his
// RIGHT arm is the crimson-scaled dragon arm (pulsing ember cracks, forearm spines, black claws) gripping ONE spiked
// club; his LEFT arm is an ordinary boy's arm in a laced leather bracer carrying a round wooden shield with a red
// dragon emblem.
//
// Handedness is true in both facings: facing right his right (dragon) side is the near side; facing left the drawing
// is mirrored and the arms AND legs swap draw slots, so the dragon arm is still his right.  Pose fields nt/ns/nf are
// his RIGHT leg, ft/fs/ff his LEFT leg (so arm swing always opposes the leg on the same side).
//
// Style guide v2: line hierarchy (silhouette LW, attached pieces LM, interior detail LF in dark local colours),
// cel shading + occlusion tones + a cool rim light on the side away from the key light, materials that read at
// scale 1, secondary motion via rig.follow(o.mem, ...) for hair curls, fur tufts, tassets and the shield strap.
// Grounded poses are solved with leg IK from foot targets (fR/fL), so feet stay planted inside every move.
import { cel, flat, ink, capsule, blob, ellipse, circle, keys as rigKeys, mix, ease, DEG, TAU, clamp, lerp, follow } from '../rig.js';
import { INK } from '../config.js';

const C = {
  skin: '#f6c7a6', skinD: '#dc977a', skinH: '#ffe3cf', skinO: '#c47c66',
  hair: '#b07a40', hairD: '#7a4d26', hairH: '#dcaa6a', crop: '#6d4524', cropD: '#4e2f16',
  steel: '#a9b1bb', steelD: '#737c89', steelH: '#e6ecf2', steelL: '#5a6270',
  lea: '#8b552f', leaD: '#5b361d', leaH: '#b58050', leaL: '#43260f',
  strap: '#9b6034', strapD: '#673d1f',
  olive: '#6f7a3c', oliveD: '#4b5428', oliveL: '#363d1a',
  fur: '#a09489', furD: '#6f645b', furH: '#d4c8bb', furL: '#544a43',
  brass: '#dcab45', brassD: '#9a7124', brassH: '#ffe7a6',
  drag: '#c8362e', dragD: '#7c1a1d', dragL: '#7e1a1e', dragS: '#9c2424', dragH: '#e8604e',
  ember: '#ffb43a', emberC: '#fff3b0', glow: '#ff7a1e',
  claw: '#2b1e24', clawH: '#7b6a72',
  wood: '#a76c3b', woodD: '#73451f', woodL: '#5a3518',
  iron: '#646a75', ironD: '#3c3f48', ironH: '#aab1bc',
  shW: '#b47c46', shWD: '#83552c', shWL: '#6b4120', shRim: '#7b818b', shRimD: '#4a4e57', shRimH: '#bcc3cb',
  emblem: '#c8352c', emblemD: '#7d1a1a',
  boot: '#7c4a2a', bootD: '#52301a', bootL: '#3d2210', sole: '#3a2418',
  eye: '#6e4220', eyeL: '#b0773d', eyeD: '#2a170a', brow: '#6a411f',
  mouth: '#7a2a2a', mouthD: '#4a1418', tongue: '#e0706a', teeth: '#fffaf2',
};
const RIM = '#cfeef6', RIM_D = '#c4a8ee';   // RIM_D: the softer lilac rim on the crimson dragon arm                    // cool rim light (upper right on screen, away from the key light)
const OCC = 'rgba(46,14,36,0.38)';        // occlusion tone in crevices (under belts, mantle, chin, armpits)
const LW = 3.1, LM = 2.3, LF = 1.25;      // line hierarchy: silhouette, attached pieces, interior detail

// skeleton (px at scale 1; Dodongo stands ~150 px tall with his crest)
const THIGH = 24, SHIN = 22;
const UPPER = 17, FORE = 15, CLUB = 31, FA = FORE + 2.5;   // FA: shoulder->fist centre on the forearm
const NECK = [1, -34];
const SLOT_NEAR = [-9, -30], SLOT_FAR = [6, -31];   // 3/4 view: the near shoulder sits at the back edge of the chest
const HIP_NEAR = [-2, 0], HIP_FAR = [4, 0];
const HEAD_OFF = [3, -19], HEAD_S = 1.05;

// ---------------------------------------------------------------- poses
export const BASE = {
  x: 0, y: 0, rot: 0, tor: 6, head: -2,
  cu: -5, cf: 28, cw: 87,           // club (dragon) arm: upper, forearm (rel), club (rel)
  su: 12, sf: 40, st: 0.35,          // shield arm: upper, forearm, shield turn (0 = faces viewer, 1 = faces forward)
  nt: -8, ns: -14, nf: 0,            // RIGHT leg: thigh, knee bend (negative), foot (absolute, + = toe up)
  ft: 16, fs: -16, ff: 0,            // LEFT leg
  sq: 1, glow: 0, smear: 0, sa0: 0, sa1: 0, sr: 58, sx: 0, sy: 0,
  // v2
  ik: 0, h: 49.6, fR: -13, fL: 12, lR: 0, lL: 0,   // leg IK: hip height, foot x targets (local), foot lifts
  br: 0, sh: 0,                      // chest swell (breath) 0..1, shoulder shrug px
  puff: 0, mg: 0, inh: 0,            // cheeks puffed, ember glow in the mouth, inhale streaks
  look: 0, lookY: 0,                 // eye glance (-1 back .. 1 ahead), (-1 up .. 1 down)
  hsq: 1, hl: 0, hx: 0,              // hair squash (carrying), hair lift (surprise), hair swept back (run)
  claw: 0, carry: 0,                 // open dragon claw; carry = hands IK'd to CARRY_POINT (0..1)
  sb: 0, bsm: 0, tw: 0,              // shield tucked back when it is the near arm (keeps the chest readable); bash / twirl smears
  sp: 0, hd: 0, shBack: false,       // shield pushed out along the arm (bash); head sunk between the shoulders; shield slung on the back
  flail: false, down: false,         // knocked flying: limbs flail from o.t; lying down: impact bounce (needs o.mem)
  noBlink: false, armGlow: false,    // eyes kept open (watching the club); glow on the dragon arm only, not the club
  cfree: 0, cox: 0, coy: 0, cr: 0,   // club tossed: offset from the fist (torso frame) + rotation
  face: 'grin', air: false, clubFront: false, blink: false, wink: false, clubBelt: false, clubBack: false,
};
const P = (o) => Object.assign({}, BASE, o);
/** rig.keys(), except that at k >= the last key time the last key is returned whole (flags included). */
const keys = (k, list) => (k >= list[list.length - 1][0] ? list[list.length - 1][1] : rigKeys(k, list));
const STANCE = { ik: 1, h: 49.6, fR: -13, fL: 12 };
const S = (o) => Object.assign({}, BASE, STANCE, o);

/** Where the carried object's bottom-centre sits (local px, facing right, scale 1). Hands hold its lower corners. */
export const CARRY_POINT = [8, -138];

// ---- leg solving
function footDrop(f) {          // ankle -> lowest point of the boot sole for absolute foot angle f (deg, + = toe up)
  const s = Math.sin(f * DEG), c = Math.cos(f * DEG);
  return Math.max(6 * s + 7.5 * c, -16 * s + 7.5 * c) - 0.5;
}
function legY(a, s, f) { return Math.cos(a * DEG) * THIGH + Math.cos((a + s) * DEG) * SHIN + footDrop(f); }
function hipOf(p) { return p.air ? -49 + p.y : -Math.max(legY(p.nt, p.ns, p.nf), legY(p.ft, p.fs, p.ff)) + p.y; }
function legIK(tx, ty) {        // ankle target from the hip root (x forward, y down) -> [thigh, knee] (knee forward)
  let d = Math.hypot(tx, ty);
  if (d > THIGH + SHIN - 0.02) d = THIGH + SHIN - 0.02;
  if (d < 6) d = 6;
  const phi = Math.atan2(tx, ty);
  const a = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const b = Math.acos(clamp((SHIN * SHIN + d * d - THIGH * THIGH) / (2 * SHIN * d), -1, 1));
  return [(phi + a) / DEG, -(a + b) / DEG];
}
/** Solve the legs of an IK pose (feet at fR/fL on the floor, lifted by lR/lL, hip at height h). */
function plant(p) {
  if (!(p.ik > 0.5)) return p;
  let r = legIK(p.fR - p.x - HIP_NEAR[0], p.h - p.lR - footDrop(p.nf));
  p.nt = r[0]; p.ns = r[1];
  r = legIK(p.fL - p.x - HIP_FAR[0], p.h - p.lL - footDrop(p.ff));
  p.ft = r[0]; p.fs = r[1];
  p.y = Math.max(legY(p.nt, p.ns, p.nf), legY(p.ft, p.fs, p.ff)) - p.h;
  return p;
}
/** keys() + automatic foot lift while a foot target moves between keys + IK. Always returns a fresh pose. */
function kf(k, list) {
  const p = Object.assign({}, keys(k, list));
  for (let i = 1; i < list.length; i++) {
    if (k <= list[i][0]) {
      const a = list[i - 1][1], b = list[i][1];
      const u = clamp((k - list[i - 1][0]) / Math.max(1e-6, list[i][0] - list[i - 1][0]), 0, 1), s = Math.sin(Math.PI * u);
      p.lR += Math.min(7, Math.abs(b.fR - a.fR) * 0.5) * s;
      p.lL += Math.min(7, Math.abs(b.fL - a.fL) * 0.5) * s;
      break;
    }
  }
  return plant(p);
}
function asAir(p) { p = plant(p); p.air = true; p.y = 49 - p.h; return p; }
const rd = (a, L) => [Math.sin(a * DEG) * L, Math.cos(a * DEG) * L];   // limb-frame vector (0,L) rotated by -a

// ---- gaits (feet planted: stance foot moves back at exactly the travel speed)
function spline(ts, vs, s) {     // 1-D Catmull-Rom through (ts[i], vs[i])
  let i = 1;
  while (i < ts.length - 1 && s > ts[i]) i++;
  const t0 = ts[i - 1], t1 = ts[i], u = (s - t0) / (t1 - t0);
  const m0 = i > 1 ? (vs[i] - vs[i - 2]) / (t1 - ts[i - 2]) * (t1 - t0) : vs[i] - vs[i - 1];
  const m1 = i < ts.length - 1 ? (vs[i + 1] - vs[i - 1]) / (ts[i + 1] - t0) * (t1 - t0) : vs[i] - vs[i - 1];
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vs[i - 1] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * vs[i] + (u3 - u2) * m1;
}
const RUN_T = [0, 0.3, 0.62, 0.86, 1];
function gaitLeg(u, ST, D, H, run, lift) {
  let x, y = 0, f;
  if (u < ST) {
    const s = u / ST;
    x = D - 2 * D * s;
    f = s < 0.22 ? lerp(run ? 6 : 12, 0, s / 0.22) : s > 0.68 ? -(run ? 32 : 18) * (s - 0.68) / 0.32 : 0;
  } else {
    const s = (u - ST) / (1 - ST);
    if (run) {
      x = spline(RUN_T, [-D, -D - 4, 3, D + 6, D], s);
      y = spline(RUN_T, [0, 19, 21, 8, 0], s);
      f = spline(RUN_T, [-32, -48, -22, 6, 6], s);
    } else {
      x = -D + 2 * D * ease.io(s);
      y = lift * Math.sin(Math.PI * Math.min(1, s * 1.12));
      f = s < 0.5 ? lerp(-18, -4, s / 0.5) : lerp(-4, 12, (s - 0.5) / 0.5);
    }
  }
  const r = legIK(x, H - y - footDrop(f));
  return [r[0], r[1], f, x / D];
}
function gait(ph, run, carry) {
  ph = ((ph % 1) + 1) % 1;
  const p = P({});
  const ST = run ? 0.34 : 0.58, D = (run ? 120 : 75) * ST / 2;
  let H;
  if (run) {
    const q = (ph * 2) % 1;
    H = q < 0.68 ? 46.4 - 2.2 * Math.sin(Math.PI * q / 0.68) : 46.4 + 5.5 * Math.sin(Math.PI * (q - 0.68) / 0.32);
  } else H = (carry ? 48.4 : 48.8) + (carry ? 0.7 : 1.4) * Math.cos(TAU * 2 * (ph - ST / 2));
  const r = gaitLeg(ph, ST, D, H, run, carry ? 7 : 9), l = gaitLeg((ph + 0.5) % 1, ST, D, H, run, carry ? 7 : 9);
  p.nt = r[0]; p.ns = r[1]; p.nf = r[2]; p.ft = l[0]; p.fs = l[1]; p.ff = l[2];
  p.y = Math.max(legY(p.nt, p.ns, p.nf), legY(p.ft, p.fs, p.ff)) - H;
  const b2 = Math.cos(TAU * 2 * (ph - ST / 2));          // 1 at passing (high), -1 just after contact (low)
  const sw = Math.cos(TAU * ph - 0.55);                   // right leg forward at ph 0 -> right arm back (lagged)
  if (run) {
    // the club trails behind him like a tail (always visible), the shield arm pumps
    Object.assign(p, { tor: 24 - 2 * b2, head: -16 + 2 * b2, cu: -18 - 34 * sw, cf: 34 + 18 * sw, cw: 246,
      su: 16 + 40 * sw, sf: 82 - 26 * sw, st: 0.55, face: 'det', hx: 1.6, sb: 0.6 });
  } else {
    Object.assign(p, { tor: 8 - 1.2 * b2, head: -3 + 1.4 * b2, cu: -6 - 26 * sw, cf: 30 + 10 * Math.cos(TAU * ph - 1.4),
      cw: 87 - 14 * Math.cos(TAU * ph - 1.1), su: 12 + 22 * sw, sf: 42 - 8 * Math.cos(TAU * ph - 1.4), face: 'grin', sb: 1 });
  }
  return p;
}

// ---- idle fidgets (every ~5.4 s): club toss, checking the dragon claw, a snack-sniff
const TOSS_HAND = { cu: 64, cf: 36, cw: 28 };
/**
 * Club toss: a dip, a flick, the club flies on a real parabola (apex H px, k0..k1 of k) spinning about its centre,
 * caught with a dip.  His eyes and head follow it.
 */
function toss(p, k, H, spins, k0, k1) {
  const o = Object.assign({}, p);
  const dip = { cu: 18, cf: 44, cw: 74 }, catchDip = { cu: 44, cf: 46, cw: 40 };
  const seg = [[0, p], [k0 - 0.12, dip], [k0, TOSS_HAND], [k1, TOSS_HAND], [k1 + 0.1, catchDip], [1, p]];
  let i = 1;
  while (i < seg.length - 1 && k > seg[i][0]) i++;
  const u = ease.io(clamp((k - seg[i - 1][0]) / (seg[i][0] - seg[i - 1][0]), 0, 1));
  for (const f of ['cu', 'cf', 'cw']) o[f] = lerp(seg[i - 1][1][f], seg[i][1][f], u);
  if (k > k0 && k < k1) {
    const v = (k - k0) / (k1 - k0), arc = 4 * v * (1 - v);
    const cr0 = TOSS_HAND.cu + TOSS_HAND.cf + TOSS_HAND.cw;
    o.cfree = 1; o.claw = 1; o.cr = cr0 + 360 * spins * v;
    const a = rd(cr0, 16), b = rd(o.cr, 16);          // spins about its centre of mass
    o.cox = a[0] - b[0] + 17 * Math.sin(Math.PI * Math.min(1, v * 1.15)); o.coy = a[1] - b[1] - H * arc;
    o.lookY = -0.4 - arc * 0.8; o.look = 0.5; o.head = p.head - 11 * arc; o.face = 'grin'; o.noBlink = true;
  } else if (k >= k1 && k < k1 + 0.16) { o.face = 'happy'; o.sh = p.sh + 1.5; }
  return o;
}
function fidget(p, t) {
  const n = Math.floor(t / 5.4), u = t - n * 5.4 - 3.3;
  if (u < 0 || u > 2) return p;
  const k = u / 2, kind = ((n % 3) + 3) % 3;
  if (kind === 0) return toss(p, k, 58, 1, 0.28, 0.58);
  const q = (o) => Object.assign({}, p, o);
  if (kind === 1) {   // checks his dragon claw: raises it, turns it in the light, embers flare
    const w = Math.sin(k * 26) * Math.sin(Math.PI * clamp((k - 0.2) / 0.55, 0, 1));
    return keys(k, [[0, q({ armGlow: true })], [0.18, q({ cu: 68, cf: 10, cw: 230, head: 12, look: 0.7, lookY: 1, face: 'det', glow: 0.3, armGlow: true })],
      [0.4, q({ cu: 72, cf: 6 + w * 12, cw: 226, head: 14, look: 0.7, lookY: 1, face: 'det', glow: 0.85, br: 0.4, armGlow: true })],
      [0.72, q({ cu: 70, cf: 4 - w * 10, cw: 232, head: 11, look: 0.6, lookY: 0.8, face: 'grin', glow: 0.7, armGlow: true })],
      [1, p]]);
  }
  // kind 2: sniffs the air (snack somewhere!), then a happy shrug
  const sn = Math.sin(k * 60) * (k > 0.12 && k < 0.5 ? 1 : 0);
  return keys(k, [[0, p], [0.12, q({ head: -13, tor: 3, face: 'sniff', sh: 1 })],
    [0.5, q({ head: -15 + sn * 2, tor: 2, face: 'sniff', sh: 1.5 })],
    [0.66, q({ head: -6, face: 'happy', sh: 3, br: 0.6, su: 20, sf: 50 })],
    [0.85, q({ head: -4, face: 'happy', sh: 1 })], [1, p]]);
}

function carryPose(t) {
  const b = Math.sin(t * 2.3);
  return S({ carry: 1, clubBelt: true, claw: 1, shBack: true, tor: 1 + b * 0.8, head: 4, sh: 11 + b * 0.6, hd: 6.5, hsq: 0.72,
    h: 49.4 + b * 0.35, face: 'det', br: 0.3 + 0.2 * b, fR: -14, fL: 13 });
}
function clubOnShoulder(o) { return Object.assign({ cu: -30, cf: 230, cw: 10, clubBack: true }, o); }   // fist behind the shoulder, club up-back
// reaching down to the club hooked on the belt (arm IK to the belt loop; the club angle matches the hung club)
const GRAB = (() => { const [cu, cf] = armIK(SLOT_NEAR[0], SLOT_NEAR[1], -11, -12.5, true); return { cu, cf, cw: -30 - cu - cf }; })();

export const ANIM = {
  idle(t) {
    const b = Math.sin(t * 2.5), w = Math.sin(t * 0.79 + 0.6);
    const p = S({ x: w * 1.6, h: 49.5 + b * 0.8 - Math.abs(w) * 0.3, tor: 6 + b * 1.6 - w * 1.2, head: -2 - b * 1.8 + w * 1.1,
      br: 0.3 + 0.35 * b, sh: 0.8 + 1.1 * b, cu: -5 + b * 2.4 + w * 1.4, cf: 28 - b * 3, cw: 87 + b * 2.5,
      su: 12 + b * 2 - w, sf: 40 - b * 2, sb: 1 });
    return plant(fidget(p, t));
  },
  walk: (ph) => gait(ph, false, false),
  run: (ph) => gait(ph, true, false),
  squat: plant(S({ h: 41.5, tor: 20, head: -4, sq: 0.92, cu: -60, cf: 30, cw: -90, su: 22, sf: 64, face: 'det', br: 0.5, sb: 1 })),
  // the engine blends rise -> fall by vertical speed: push-off stretch going up, legs reaching down coming down
  rise: P({ air: true, y: -4, tor: 2, head: -8, nt: 12, ns: -8, ft: -8, fs: -16, nf: -30, ff: -36, sq: 1.08,
    cu: 210, cf: -30, cw: 40, su: 30, sf: 96, st: 0.3, face: 'grin', hx: 0.3 }),
  fall: P({ air: true, y: 0, tor: 6, head: 2, nt: 34, ns: -52, ft: -8, fs: -34, nf: -4, ff: -14, cu: 200, cf: -24, cw: 30,
    su: 50, sf: 34, st: 0.4, face: 'det', hl: 0.4 }),
  land: plant(S({ h: 42, fR: -14, fL: 14, tor: 18, head: 4, sq: 0.87, cu: -12, cf: 56, cw: 40, su: 24, sf: 68, face: 'det', sb: 1 })),

  // --- the ground combo: anticipation (2 keys), snap contact + smear, overshoot, settle ---------------------------
  // 1: quick club swipe, forward and flat (the arm stays below his chin)
  atk1: (k) => kf(k, [
    [0, S({ tor: 2, head: -3, cu: -8, cf: 40, cw: 104, su: 16, sf: 46, face: 'yell' })],
    [0.14, S({ x: -2, h: 48, tor: -10, head: -8, cu: -52, cf: 100, cw: 206, su: 24, sf: 58, st: 0.45, sq: 0.97, fL: 14, face: 'yell' }), 'out'],
    [0.28, S({ x: 6, h: 46.8, fR: -14, fL: 20, tor: 22, head: 2, cu: 70, cf: 14, cw: 22, su: -4, sf: 34, st: 0.5, face: 'yell',
      clubFront: true, smear: 1, sa0: -25, sa1: 100, sr: 60 }), 'snap'],
    [0.4, S({ x: 7, h: 46.3, fR: -14, fL: 20, tor: 27, head: 4, cu: 84, cf: 6, cw: 10, su: -8, sf: 30, st: 0.5, face: 'yell',
      clubFront: true, smear: 0.5, sa0: 40, sa1: 108, sr: 60 }), 'out'],
    [0.62, S({ x: 5, h: 47.5, fR: -14, fL: 20, tor: 16, head: 2, cu: 68, cf: 16, cw: 26, su: 4, sf: 38, face: 'det', clubFront: true })],
    [0.82, S({ x: 2, h: 48.8, fR: -13.5, fL: 15, tor: 9, head: 0, cu: 22, cf: 30, cw: 60, face: 'grin' })],
    [1, S({ face: 'grin' })],
  ]),
  // 2: rising backhand: the club head sweeps up in front of him (contact at chin height), follow-through high
  atk2: (k) => kf(k, [
    [0, S({ x: 5, h: 47.5, fR: -14, fL: 20, tor: 16, head: 2, cu: 68, cf: 16, cw: 26, su: 4, sf: 38, face: 'yell', clubFront: true })],
    [0.15, S({ x: 7, h: 45.5, fR: -14, fL: 20, tor: 28, head: 8, cu: 30, cf: 20, cw: -40, su: 10, sf: 50, sq: 0.96, face: 'yell', clubFront: true }), 'out'],
    [0.3, S({ x: 9, h: 49.5, fR: -14, fL: 20, nf: -6, tor: -4, head: -8, cu: 82, cf: 4, cw: 34, su: 26, sf: 56, face: 'yell', clubFront: true,
      smear: 1, sa0: 15, sa1: 135, sr: 60, hl: 0.3 }), 'snap'],
    [0.45, S({ x: 9, h: 50.3, fR: -14, fL: 20, nf: -8, tor: -9, head: -11, cu: 90, cf: -2, cw: 50, su: 30, sf: 58, face: 'yell', clubFront: true,
      smear: 0.45, sa0: 80, sa1: 150, sr: 60, hl: 0.2 }), 'out'],
    [0.7, S({ x: 6, h: 49, fR: -14, fL: 17, tor: -2, head: -5, cu: 72, cf: 12, cw: 40, su: 22, sf: 52, face: 'det', clubFront: true })],
    [1, S({ face: 'grin' })],
  ]),
  // 3: shield bash with a skip-step: impact crescent + speed lines, held 2 frames, the chin tucked behind the rim
  atk3: (k) => kf(k, [
    [0, S({ x: 6, h: 48.5, fR: -14, fL: 19, tor: -2, head: -5, cu: 72, cf: 12, cw: 40, su: 20, sf: 100, st: 0.6, face: 'yell' })],
    [0.15, S({ x: 1, h: 46.5, fR: -14, fL: 19, tor: -14, head: -8, cu: 10, cf: 30, cw: -50, su: 4, sf: 120, st: 0.7, sq: 0.96, face: 'yell' }), 'out'],
    [0.3, S({ x: 15, h: 45.5, fR: -12, fL: 28, tor: 18, head: -12, cu: -36, cf: 40, cw: -50, su: 86, sf: 0, st: 0.55, sp: 11, face: 'yell', bsm: 1 }), 'snap'],
    [0.4, S({ x: 17, h: 45, fR: -12, fL: 28, tor: 21, head: -11, cu: -42, cf: 44, cw: -50, su: 90, sf: -2, st: 0.55, sp: 12, face: 'yell', bsm: 0.6 }), 'out'],
    [0.5, S({ x: 17, h: 45, fR: -12, fL: 28, tor: 21, head: -10, cu: -42, cf: 44, cw: -50, su: 89, sf: -1, st: 0.55, sp: 11, face: 'yell', bsm: 0.15 })],
    [0.68, S({ x: 13, h: 46.6, fR: -12, fL: 28, tor: 18, head: 1, cu: -30, cf: 40, cw: -40, su: 70, sf: 16, st: 0.7, face: 'det' })],
    [1, S({ face: 'grin' })],
  ]),
  // 4: big overhead smash (finisher): wind-up goes UP THE BACK of his head (angles unwrapped), slam over the top
  atk4: (k) => kf(k, [
    [0, S({ x: 8, h: 47.5, fR: -12, fL: 26, tor: 18, head: 1, cu: -30, cf: 40, cw: -40, su: 70, sf: 16, st: 0.7, face: 'yell' })],
    [0.14, S({ x: 1, h: 49.5, fR: -13, fL: 18, tor: -12, head: -14, cu: -166, cf: 24, cw: 36, su: 46, sf: 64, st: 0.4, face: 'yell', clubFront: true }), 'out'],
    [0.32, S({ x: -2, h: 52.5, fR: -13, fL: 18, nf: -14, ff: -16, tor: -20, head: -18, cu: -148, cf: 40, cw: 52, su: 62, sf: 52, face: 'yell',
      clubFront: true, hl: 0.4, br: 0.6 }), 'io'],
    [0.45, S({ x: 18, h: 43, fR: -16, fL: 32, tor: 38, head: 12, cu: -298, cf: 6, cw: -14, su: 8, sf: 84, sq: 0.92, face: 'yell', clubFront: true,
      smear: 1, sa0: 196, sa1: 52, sr: 62 }), 'in'],
    [0.55, S({ x: 19, h: 42, fR: -16, fL: 32, tor: 43, head: 14, cu: -308, cf: 2, cw: -20, su: 4, sf: 86, sq: 0.89, face: 'yell', clubFront: true,
      smear: 0.45, sa0: 120, sa1: 50, sr: 62 }), 'out'],
    [0.7, S({ x: 16, h: 43.6, fR: -16, fL: 32, tor: 34, head: 10, cu: -298, cf: 8, cw: -14, su: 12, sf: 80, sq: 0.97, face: 'det', clubFront: true })],
    [0.88, S({ x: 3, h: 50.2, fR: -14, fL: 15, tor: 1, head: -5, cu: -352, cf: 30, cw: 80, su: 14, sf: 44, face: 'grin' }), 'io'],
    [1, S({ face: 'grin', cu: -365 })],
  ]),
  // jump attack: overhead air smash (16 frames to contact, then held at k = 1)
  airAtk: (k) => keys(k, [
    [0, P({ air: true, tor: -6, head: -8, cu: 205, cf: 30, cw: 40, nt: 50, ns: -90, ft: 26, fs: -60, su: 52, sf: 50, face: 'yell', clubFront: true })],
    [0.2, P({ air: true, y: -2, tor: -16, head: -14, cu: 210, cf: 40, cw: 50, nt: 62, ns: -112, ft: 34, fs: -78, su: 58, sf: 54, face: 'yell',
      clubFront: true, hl: 0.3 }), 'out'],
    [0.4, P({ air: true, tor: 36, head: 12, cu: 66, cf: 4, cw: -14, nt: 44, ns: -64, ft: -12, fs: -40, nf: -20, ff: -30, su: 36, sf: 72,
      face: 'yell', clubFront: true, smear: 1, sa0: 200, sa1: 56, sr: 62 }), 'snap'],
    [0.56, P({ air: true, tor: 40, head: 14, cu: 56, cf: 0, cw: -20, nt: 40, ns: -58, ft: -14, fs: -38, nf: -20, ff: -30, su: 32, sf: 74,
      face: 'yell', clubFront: true, smear: 0.45, sa0: 130, sa1: 52, sr: 62 })],
    [1, P({ air: true, tor: 31, head: 9, cu: 64, cf: 6, cw: -12, nt: 36, ns: -56, ft: -8, fs: -40, nf: -20, ff: -30, su: 40, sf: 70,
      face: 'yell', clubFront: true, smear: 0.12, sa0: 100, sa1: 56, sr: 62 })],
  ]),
  // running shield charge (30 frames): duck in, legs keep driving, recover
  runAtk(k) {
    const up = keys(k, [
      [0, P({ tor: 22, head: 0, su: 40, sf: 40, st: 0.6, cu: -20, cf: 50, cw: -40, face: 'yell', sq: 0.96 })],
      [0.1, P({ tor: 30, head: -15, su: 74, sf: 6, st: 0.55, sp: 12, cu: -34, cf: 50, cw: -60, face: 'yell', hx: 1.4, bsm: 0.7 }), 'snap'],
      [0.68, P({ tor: 31, head: -14, su: 76, sf: 4, st: 0.55, sp: 12, cu: -36, cf: 48, cw: -60, face: 'yell', hx: 1.4, bsm: 0.5 })],
      [1, P({ tor: 8, head: -2, face: 'grin' })],
    ]);
    const run = gait(0.18 + k * 1.5, true, false), stand = plant(S({}));
    const m = ease.io(clamp((k - 0.7) / 0.3, 0, 1));
    const p = Object.assign({}, up);
    for (const f of ['nt', 'ns', 'nf', 'ft', 'fs', 'ff', 'y']) p[f] = lerp(run[f], stand[f], m);
    return p;
  },
  // FIREBALL BREATH (26 frames, release .42 from the mouth): inhale lean-back, cheeks puffed, chest swelling, then
  // the head thrusts forward, chin up, mouth wide with fire
  shoot: (k) => kf(k, [
    [0, S({ tor: 4, head: 0, face: 'det' })],
    [0.1, S({ h: 48.6, fR: -16, fL: 15, tor: -6, head: -10, br: 0.5, puff: 0.45, sh: 1.5, cu: -26, cf: 36, cw: -30, su: 20, sf: 56, face: 'puff', inh: 1 }), 'out'],
    [0.32, S({ h: 49.6, fR: -16, fL: 15, nf: -4, tor: -15, head: -17, br: 1, puff: 1, sh: 3.5, cu: -36, cf: 40, cw: -40, su: 28, sf: 66, face: 'puff',
      inh: 0.5, mg: 0.35, hl: 0.25 })],
    [0.4, S({ x: 7, h: 47.6, fR: -16, fL: 18, tor: 15, head: -2, br: 0.2, sh: 0, cu: -40, cf: 40, cw: -36, su: -6, sf: 40, st: 0.5, sq: 0.96,
      face: 'breathe', mg: 1 }), 'snap'],
    [0.62, S({ x: 7.5, h: 47.2, fR: -16, fL: 18, tor: 16, head: 0, cu: -38, cf: 42, cw: -36, su: -4, sf: 42, st: 0.5, face: 'breathe', mg: 0.75 })],
    [0.74, S({ x: 4, h: 48.2, fR: -15, fL: 16, tor: 10, head: 1, cu: -20, cf: 40, cw: 60, face: 'grin', mg: 0.1 })],
    [1, S({ face: 'grin' })],
  ]),
  // DRAGON FLARE (56 frames): gather, a real hop with the club up the back (trembling with power), slam at .52, rebound
  special(k) {
    const p = kf(k, [
      [0, S({ h: 47, tor: 8, head: 2, cu: 360, cf: 50, cw: 60, su: 26, sf: 60, face: 'dragon', glow: 0.3 })],
      [0.14, S({ h: 43.5, sq: 0.95, tor: 18, head: 8, cu: 318, cf: 40, cw: 10, su: 20, sf: 70, face: 'dragon', glow: 0.65, br: 0.8 }), 'out'],
      [0.3, S({ h: 62, nf: -24, ff: -26, tor: -16, head: -20, cu: 196, cf: -14, cw: 8, su: 44, sf: 92, face: 'dragon', glow: 1, clubFront: true,
        hl: 0.8, sq: 1.05 }), 'out'],
      [0.42, S({ h: 64, nf: -18, ff: -20, tor: -20, head: -22, cu: 206, cf: -20, cw: 6, su: 48, sf: 94, face: 'dragon', glow: 1, clubFront: true, hl: 1 })],
      [0.49, S({ h: 60, nf: -14, ff: -16, tor: -14, head: -16, cu: 218, cf: -40, cw: 20, su: 44, sf: 90, face: 'dragon', glow: 1, clubFront: true, hl: 0.8 }), 'in'],
      [0.52, S({ x: 10, h: 42, fR: -16, fL: 28, tor: 30, head: 8, cu: 68, cf: 4, cw: -24, su: 18, sf: 80, st: 0.6, sq: 0.88, face: 'dragon', glow: 1,
        clubFront: true, smear: 1, sa0: 192, sa1: 50, sr: 64 }), 'in'],
      [0.56, S({ x: 10.5, h: 44, fR: -16, fL: 28, tor: 28, head: 6, cu: 76, cf: 2, cw: -20, su: 18, sf: 80, st: 0.6, sq: 0.96, face: 'dragon', glow: 1,
        clubFront: true, smear: 0.5, sa0: 120, sa1: 50, sr: 64 }), 'out'],
      [0.62, S({ x: 11, h: 41.5, fR: -16, fL: 28, tor: 33, head: 9, cu: 62, cf: 2, cw: -28, su: 16, sf: 82, sq: 0.92, face: 'dragon', glow: 1, clubFront: true })],
      [0.8, S({ x: 10, h: 43, fR: -16, fL: 28, tor: 27, head: 5, cu: 66, cf: 6, cw: -26, su: 22, sf: 80, st: 0.6, face: 'dragon', glow: 0.85, clubFront: true })],
      [0.92, S({ x: 2, h: 50.2, fR: -14, fL: 15, tor: 1, head: -6, cu: 24, cf: 34, cw: 70, su: 14, sf: 44, face: 'grin', glow: 0.4 }), 'io'],
      [1, S({ face: 'grin', glow: 0.2 })],
    ]);
    if (k > 0.28 && k < 0.5) { const s = Math.sin(k * 260); p.x += s * 0.7; p.head += Math.sin(k * 330) * 1.4; p.glow = 0.85 + 0.15 * s; }
    return p;
  },
  // hit reactions (18 frames): high (head snaps back, arms flung) and low (doubled over, clutching his belly)
  hurt: (k) => kf(k, [
    [0, S({ x: -7, h: 48, tor: -22, head: -26, sq: 0.93, cu: -58, cf: 40, cw: 30, su: 46, sf: 22, st: 0.6, face: 'ouch', hl: 0.6 })],
    [0.16, S({ x: -8, h: 48.6, tor: -25, head: -20, sq: 1.02, cu: -68, cf: 46, cw: 24, su: 54, sf: 26, st: 0.6, face: 'ouch', hl: 0.4 }), 'out'],
    [0.55, S({ x: -4, h: 48.6, tor: -10, head: -8, cu: -24, cf: 40, cw: 60, su: 30, sf: 40, face: 'ouch' })],
    [1, S({ x: -1, tor: 2, head: -3, cu: -4, cf: 32, su: 14, sf: 42, face: 'det' })],
  ]),
  hurt2: (k) => kf(k, [
    [0, S({ x: -3, h: 43.5, tor: 33, head: 22, sq: 0.9, cu: -20, cf: 92, cw: -64, su: 24, sf: 100, st: 0.2, face: 'ouch', hx: -0.6 })],
    [0.18, S({ x: -5, h: 43, tor: 37, head: 25, sq: 0.95, cu: -18, cf: 96, cw: -66, su: 26, sf: 104, st: 0.2, face: 'ouch' }), 'out'],
    [0.6, S({ x: -2, h: 46.5, tor: 18, head: 10, cu: -12, cf: 70, cw: -30, su: 18, sf: 70, face: 'worried' })],
    [1, S({ x: -1, tor: 6, head: -2, face: 'det' })],
  ]),
  // knocked flying (air), lying on the back, getting up (pushing up on the club like a crutch)
  fly: P({ air: true, flail: true, rot: 58, tor: -12, head: -22, cu: 214, cf: -20, cw: 30, su: -64, sf: 24, nt: 44, ns: -56, ft: 74, fs: -30, nf: 10, ff: 20,
    face: 'ouch', hl: 1 }),
  down: P({ air: true, down: true, rot: 86, y: 30, tor: -4, head: -10, cu: 20, cf: 30, cw: -64, su: 12, sf: 16, nt: 10, ns: -20, ft: 24, fs: -40, face: 'ko' }),
  getup: (k) => keys(k, [
    [0, P({ air: true, rot: 86, y: 30, tor: -4, head: -10, cu: 20, cf: 30, cw: -64, su: 12, sf: 16, nt: 10, ns: -20, ft: 24, fs: -40, face: 'ko' })],
    [0.22, P({ air: true, rot: 62, y: 29, tor: 6, head: 6, cu: 10, cf: 12, cw: 66, su: 40, sf: 60, nt: 52, ns: -96, ft: 40, fs: -70, face: 'ouch' })],
    [0.5, P({ air: true, rot: 20, y: 22, tor: 30, head: 12, cu: -10, cf: 0, cw: 92, su: 36, sf: 50, nt: 92, ns: -150, ft: 80, fs: -138, face: 'det' })],
    [0.78, asAir(S({ h: 44, fR: -14, fL: 14, tor: 16, head: 2, cu: 2, cf: 50, cw: 30, sq: 0.97, face: 'det' }))],
    [1, plant(S({ face: 'grin' }))],
  ]),

  // --- carrying (club hooked on his belt, both hands up under the object at CARRY_POINT) -----------------------
  carryIdle: (t) => plant(carryPose(t)),
  carryWalk(ph) {
    const p = gait(ph, false, true), c = carryPose(ph * 1.6);
    for (const f of ['carry', 'claw', 'head', 'sh', 'hd', 'hsq', 'st', 'face', 'br', 'clubBelt', 'shBack', 'su', 'sf', 'cu', 'cf', 'sb']) p[f] = c[f];
    p.tor = 3 - 0.8 * Math.cos(TAU * 2 * (ph - 0.29));
    return p;
  },
  // throw (16 frames, release .4): crouch with the load, heave it forward, then grab the club back off the belt
  throw: (k) => kf(k, [
    [0, carryPose(0)],
    [0.24, Object.assign(carryPose(0), { h: 46, tor: -4, head: 3, fR: -15, fL: 15, sq: 0.96, face: 'yell', br: 0.8, sh: 8 }), 'out'],
    [0.4, S({ carry: 0, x: 6, h: 48.5, fR: -15, fL: 20, tor: 16, head: 2, cu: 196, cf: -6, cw: 60, su: 192, sf: -8, st: 1, claw: 1, clubBelt: true,
      shBack: true, face: 'yell' }), 'snap'],
    [0.5, S({ carry: 0, x: 7, h: 46.8, fR: -15, fL: 20, tor: 25, head: 8, cu: 58, cf: 10, cw: 60, su: 44, sf: 22, st: 0.8, claw: 1, clubBelt: true, face: 'yell' }), 'snap'],
    [0.62, S({ carry: 0, x: 7, h: 46.5, fR: -15, fL: 20, tor: 27, head: 9, cu: 48, cf: 10, cw: 60, su: 34, sf: 24, st: 0.8, claw: 1, clubBelt: true, face: 'yell' }), 'out'],
    [0.8, S({ x: 2, h: 48.4, fR: -14, fL: 15, tor: 10, head: 4, cu: GRAB.cu, cf: GRAB.cf, cw: GRAB.cw, su: 14, sf: 40, claw: 1, clubBelt: true, face: 'grin',
      lookY: 0.6 })],
    [0.9, S({ x: 1, h: 49, fR: -13.5, fL: 13, tor: 8, head: 1, cu: GRAB.cu, cf: GRAB.cf, cw: GRAB.cw, su: 13, sf: 41, face: 'grin' })],
    [1, S({ face: 'grin' })],
  ]),

  // --- warp-in (40 frames): stumbles out of the crystal portal, looks around, club twirl into the ready stance -----
  portal: (k) => kf(k, [
    [0, S({ x: -12, h: 48, fR: -26, fL: -4, lL: 6, tor: 26, head: 12, cu: 206, cf: 20, cw: 30, su: -46, sf: 40, st: 0.3, face: 'surprised', hl: 0.9, sh: 2 })],
    [0.14, S({ x: -5, h: 45, fR: -22, fL: 12, tor: 30, head: 14, cu: 250, cf: 30, cw: 40, su: -40, sf: 50, sq: 0.93, face: 'surprised', hl: 0.6 }), 'in'],
    [0.28, S({ x: -2, h: 48.5, fR: -13, fL: 12, tor: 2, head: -8, cu: 300, cf: 40, cw: 40, su: 40, sf: 60, st: 0.2, face: 'worried', hl: 0.2 }), 'out'],
    [0.42, S({ x: -2, tor: -4, head: -12, cu: 358, cf: 34, cw: 96, su: 26, sf: 50, face: 'worried', look: -1 })],
    [0.56, S({ x: 1, tor: 8, head: 10, cu: 354, cf: 30, cw: 90, su: 18, sf: 46, face: 'surprised', look: 1 })],
    [0.66, S({ x: 0, tor: 2, head: -13, cu: 356, cf: 40, cw: 90, su: 16, sf: 44, face: 'det', look: 0.6, lookY: -1 })],
    [0.82, S({ x: 1, h: 48, tor: 8, head: 0, cu: 340, cf: 10, cw: 87 + 360, su: 20, sf: 50, face: 'grin', sq: 0.97, tw: 1 }), 'io'],
    [1, S({ face: 'grin', cu: 355, cw: 87 + 360 })],
  ]),
  victory(t) {
    const c = (t * 1.2) % 1, air = c < 0.62;
    const hop = air ? Math.sin(Math.PI * c / 0.62) : 0, land = air ? 0 : Math.sin(Math.PI * (c - 0.62) / 0.38);
    return plant(S({ h: 49 + hop * 9 - land * 4.5, sq: 1 + hop * 0.03 - land * 0.07, tor: -4 + land * 7, head: -10 + land * 5, cu: 242 + hop * 4,
      cf: -20 - hop * 6, cw: -22, su: 30 + hop * 34, sf: 62 - hop * 22, st: 0.2, face: 'happy', clubFront: true,
      nf: -16 * hop, ff: -18 * hop, fR: -12, fL: 11, hl: hop * 0.4 }));
  },
  // character-select showcase: club toss with a double flip, dragon-arm flare, a wink
  select(t) {
    const c = ((t % 3.6) + 3.6) % 3.6;
    const base = S({ h: 49, fR: -15, fL: 15, tor: 5, head: -3, br: 0.3 + 0.2 * Math.sin(t * 2.5) });
    let p;
    if (c < 1.35) p = toss(base, c / 1.35, 64, 2, 0.24, 0.66);
    else if (c < 2.45) {
      const k = (c - 1.35) / 1.1, q = (o) => Object.assign({}, base, o);
      p = keys(k, [[0, base], [0.18, q({ cu: 50, cf: 34, cw: 40, tor: 12, head: 2, face: 'det', glow: 0.4, look: 0.6, lookY: 0.5, sh: 1 })],
        [0.36, q({ cu: 64, cf: 18, cw: 58, tor: 17, head: 3, face: 'dragon', glow: 1, br: 0.9, sh: 2 }), 'snap'],
        [0.72, q({ cu: 60, cf: 22, cw: 60, tor: 16, head: 2, face: 'dragon', glow: 0.9, br: 0.7, sh: 2 })],
        [1, base]]);
    } else {
      const k = (c - 2.45) / 1.15, q = (o) => Object.assign({}, base, o);
      const sh = clubOnShoulder({ tor: 2, head: -6, face: 'smug', wink: true, su: 20, sf: 56, br: 0.5 });
      p = keys(k, [[0, q({ clubBack: true })], [0.25, q(sh)], [0.8, q(sh)], [1, base]]);
    }
    return plant(p);
  },
  // --- cutscene poses (o.talk animates the mouth) ---------------------------------------------------------------
  talk(t) {
    const k = (((t / 3.6) % 1) + 1) % 1, n = Math.sin(t * 5.5) * 1.5;
    return kf(k, [
      [0, S({ head: -2, face: 'grin', sb: 1 })],
      [0.18, S({ tor: 8, head: -6 + n, cu: 52, cf: 26, cw: 56, su: 20, sf: 56, face: 'grin', look: 0.4, sb: 1 })],
      [0.4, S({ tor: 2, head: 2 + n, cu: -10, cf: 60, cw: 60, su: 52, sf: 12, st: 0.25, face: 'grin', sh: 2.5 })],
      [0.62, S({ tor: 12, head: 4 + n, cu: 66, cf: 30, cw: 24, su: 14, sf: 48, face: 'det', sb: 1 })],
      [0.82, S({ tor: 5, head: -4 + n, cu: -2, cf: 36, cw: 96, su: 8, sf: 36, face: 'grin', lookY: -0.4, sb: 1 })],
      [1, S({ head: -2, face: 'grin', sb: 1 })],
    ]);
  },
  point: plant(S({ x: 2, h: 48, fR: -15, fL: 18, tor: 10, head: -2, cu: 84, cf: 2, cw: -4, su: 2, sf: 40, st: 0.4, face: 'det', look: 1, clubFront: true, sb: 1 })),
  cheer(t) {
    const c = ((t * 1.7) % 1 + 1) % 1, air = c < 0.55;
    const hop = air ? Math.sin(Math.PI * c / 0.55) : 0, land = air ? 0 : Math.sin(Math.PI * (c - 0.55) / 0.45);
    const pump = Math.sin(TAU * c);
    return plant(S(clubOnShoulder({ h: 49 + hop * 7 - land * 4, sq: 1 + hop * 0.02 - land * 0.06, tor: 2 + land * 5, head: -8 + land * 4,
      su: 20 + 140 * hop, sf: 100 - 90 * hop, st: 0.5, face: 'happy', nf: -14 * hop, ff: -14 * hop, fR: -12, fL: 11 })));
  },
  surprised: plant(S({ x: -3, h: 50.5, fR: -16, fL: 9, tor: -12, head: -8, cu: -84, cf: 26, cw: 40, su: 34, sf: -26, st: 0.3, face: 'surprised',
    hl: 1, sh: 3, br: 0.6 })),
  // sitting on the ground or riding a dragon's back: hips at local y = 0
  sit: P(clubOnShoulder({ air: true, y: 49, tor: -3, head: -3, nt: 74, ns: -86, ft: 88, fs: -98, su: 54, sf: 24, st: 0.4, face: 'grin' })),
  // title-screen taunt
  pose: plant(S({ x: 2, h: 47.5, fR: -16, fL: 19, tor: 12, head: -2, cu: 62, cf: 22, cw: 8, su: 26, sf: 88, st: 0.25, face: 'smug', clubFront: true, sb: 1 })),
};
export { mix };

// ---------------------------------------------------------------- measurements (local px, facing right, scale 1)
function torsoToLocal(p, x, y) {
  const t = p.tor * DEG;
  let X = x * Math.cos(t) - y * Math.sin(t), Y = x * Math.sin(t) + y * Math.cos(t);
  if (p.rot) { const r = -p.rot * DEG, c = Math.cos(r), s = Math.sin(r); const x2 = X * c - Y * s; Y = X * s + Y * c; X = x2; }
  X += p.x; Y += hipOf(p);
  if (p.sq !== 1) { X /= Math.sqrt(p.sq); Y *= p.sq; }
  return [X, Y];
}
const neckUp = (p) => p.br * 1.2 + p.sh * 0.45 - p.hd;
/** A point given in the head's drawing frame -> local px. */
export function headPoint(p, hx, hy) {
  const h = p.head * DEG, X0 = HEAD_OFF[0] + hx * HEAD_S, Y0 = HEAD_OFF[1] + hy * HEAD_S;
  return torsoToLocal(p, X0 * Math.cos(h) - Y0 * Math.sin(h) + NECK[0], X0 * Math.sin(h) + Y0 * Math.cos(h) + NECK[1] - neckUp(p));
}
const round2 = (v) => [Math.round(v[0]), Math.round(v[1])];
/** Fireball breath leaves his mouth at shoot k = .42. */
export const SHOOT_ORIGIN = round2(headPoint(ANIM.shoot(0.42), 20, 13.5));
export const META = { id: 'dodongo', name: 'Dodongo', height: 144, hurtW: 22, hurtH: 128 };   // height: idle, top of the crest
/**
 * Key points of a pose in local px (x along the facing, scale 1) for the given facing: face centre, mouth, the
 * dragon fist, the club head and the shield centre.  Handy for FX (club-head sparks) and for the art checks.
 */
export function landmarks(p, facing = 1) {
  const R = facing > 0, up = p.sh + p.br * 1.2;
  const sN = [SLOT_NEAR[0], SLOT_NEAR[1] - up], sF = [SLOT_FAR[0], SLOT_FAR[1] - up];
  const slotC = R ? sN : sF, slotS = R ? sF : sN;
  const A = p.carry > 0.001 ? carryArms(p, hipOf(p), slotC, slotS, R) : p;
  const k = A.astC || 1, ks = A.astS || 1, u = rd(A.cu, UPPER * k), f = rd(A.cu + A.cf, FA * k), c = rd(A.cu + A.cf + A.cw, CLUB);
  const fist = [slotC[0] + u[0] + f[0], slotC[1] + u[1] + f[1]];
  const su = rd(A.su, UPPER * ks), sf = rd(A.su + A.sf, (9 + (A.sp || p.sp || 0)) * ks);
  return { face: headPoint(p, 4, 0), mouth: headPoint(p, 20, 13.5), fist: torsoToLocal(p, fist[0], fist[1]),
    club: torsoToLocal(p, fist[0] + c[0], fist[1] + c[1]), shield: torsoToLocal(p, slotS[0] + su[0] + sf[0], slotS[1] + su[1] + sf[1]) };
}

// ---------------------------------------------------------------- drawing
let T = 0, F = 1, PULSE = 0.5;
const V0 = { x: 0, y: 0, z: 0 };
const M = { hx: 0, hy: 0, fx: 0, fy: 0, tF: 0, tM: 0, tB: 0, strap: 0 };   // this draw's secondary motion
let PT = null;                                                                // cached Path2D details (lazy)

function secondary(o, p, f, hipY, aN, aF) {
  const mem = o.mem, v = o.vel || V0;
  const vx = clamp((v.x || 0) * f, -9, 9), vz = clamp(v.z || 0, -12, 12);
  const A = p.tor + p.head * 0.6 - p.rot;
  const dA = clamp(follow(mem, 'dA', A, 0.2, 0.68) - A, -30, 30);          // body-angle lag (deg)
  const dH = clamp(follow(mem, 'dH', hipY, 0.24, 0.66) - hipY, -12, 12);   // hip-height lag (px, < 0 = lags above)
  const sv = follow(mem, 'sv', -vx * 1.6, 0.1, 0.86);                       // drag; swings forward when he stops
  const sz = follow(mem, 'sz', vz * 0.42, 0.2, 0.7);
  M.hx = clamp(sv + dA * 0.22 - p.hx * 3.2, -9, 9);
  M.hy = clamp(dH * 0.75 + sz - p.hl * 2, -8, 8);
  M.fx = clamp(sv * 0.32 + dA * 0.12, -5, 5);
  M.fy = clamp(dH * 0.4 + sz * 0.5, -4, 4);
  // tassets (deg, + = bottom swings forward in the torso frame): hang partly plumb, drag, pushed by the thighs
  const tv = follow(mem, 'tv', -vx * 2.4, 0.14, 0.78) + dA * 0.5;
  const hang = p.tor * 0.55;
  M.tF = clamp(Math.max(hang + tv, aN - 10 + p.tor), -45, 70);
  M.tM = clamp(Math.max(hang * 0.7 + tv * 0.6, Math.max(aN, aF) - 14 + p.tor), -30, 60);
  M.tB = clamp(Math.min(hang + tv, Math.min(aN, aF) + 14 + p.tor), -60, 40);
  M.strap = clamp(follow(mem, 'st', vx * 4 - dA * 0.8, 0.1, 0.84), -50, 50);
}

/**
 * Draw Dodongo.  ctx is positioned at his feet (screen), unscaled.
 * o: { facing: 1 | -1, t: seconds, scale, mem, vel: {x,y,z}, talk }
 */
export function drawDodongo(ctx, pose, o = {}) {
  if (!PT) PT = makePaths();
  let p = pose;
  if (p.flail || p.down) p = reactive(p, o);
  const f = o.facing || 1;
  F = f; T = o.t || 0;
  PULSE = 0.5 + 0.32 * Math.sin(T * 3.4) + 0.18 * Math.sin(T * 9.7 + 1);
  const Sc = o.scale || 1;
  ctx.save();
  ctx.scale(f * Sc, Sc);
  if (p.sq !== 1) ctx.scale(1 / Math.sqrt(p.sq), p.sq);
  const R = f > 0;                                   // his right (club) side is the near side
  const hipY = hipOf(p);
  const aN = R ? p.nt : p.ft, aF = R ? p.ft : p.nt;
  secondary(o, p, f, hipY, aN, aF);
  ctx.translate(p.x, hipY);
  if (p.rot) ctx.rotate(-p.rot * DEG);

  const up = p.sh + p.br * 1.2;
  const sN = [SLOT_NEAR[0], SLOT_NEAR[1] - up], sF = [SLOT_FAR[0], SLOT_FAR[1] - up];
  const slotC = R ? sN : sF, slotS = R ? sF : sN;
  let A = p.carry > 0.001 ? carryArms(p, hipY, slotC, slotS, R) : p;
  if (!R && p.sb > 0.01) A = Object.assign({}, A, { su: A.su - 30 * p.sb, sf: A.sf - 4 * p.sb, st: Math.min(1, p.st + 0.35 * p.sb) });
  const clubLate = (R || p.clubFront) && !p.clubBack;
  const cuN = ((A.cu % 360) + 360) % 360, suN = ((A.su % 360) + 360) % 360;
  // raised up the back / on the shoulder: behind the head.  A NEAR arm sweeping past the face (1-2 frames of a swing)
  // also passes behind the head so the face always reads.
  const passing = R && cuN > 100 && cuN < 178;
  const smearFrame = passing && p.smear > 0.2;
  const behindHead = p.clubBack || (!R && cuN > 100 && cuN < 290) || passing;
  const shieldBehind = !R && suN > 100 && suN < 178;
  const tor = p.tor * DEG;
  const talk = !!o.talk;

  // far arm (behind everything)
  ctx.save(); ctx.rotate(tor);
  if (p.shBack) backShield(ctx);
  if (R) shieldArm(ctx, p, A, slotS);
  else {
    if (p.clubBelt) beltClub(ctx, p, false);
    if (!behindHead) clubArm(ctx, p, A, slotC, clubLate ? 'upper' : 'all');   // the far shoulder stays behind the body
  }
  ctx.restore();

  if (R) { leg(ctx, HIP_FAR, p.ft, p.fs, p.ff, true); leg(ctx, HIP_NEAR, p.nt, p.ns, p.nf, false); }
  else { leg(ctx, HIP_FAR, p.nt, p.ns, p.nf, true); leg(ctx, HIP_NEAR, p.ft, p.fs, p.ff, false); }

  ctx.save(); ctx.rotate(tor);
  torso(ctx, p);
  if (R && p.clubBelt) beltClub(ctx, p, true);
  if (p.rot < 70) mantle(ctx, p);
  neckGorget(ctx, p, up);
  if (behindHead) clubArm(ctx, p, A, slotC, smearFrame ? 'upper' : 'all');
  if (shieldBehind) shieldArm(ctx, p, A, slotS);
  ctx.save(); ctx.translate(NECK[0], NECK[1] - neckUp(p)); ctx.rotate(p.head * DEG); head(ctx, p, talk); ctx.restore();
  if (!R) { if (!shieldBehind) shieldArm(ctx, p, A, slotS); if (p.rot < 70) furLobe(ctx, up); }
  if (clubLate && !behindHead) clubArm(ctx, p, A, slotC, R ? 'all' : 'lower');
  if (R && p.rot < 70) furLobe(ctx, up);
  if (p.cfree > 0.5) freeClub(ctx, p, A, slotC);
  if (p.smear > 0.01) smear(ctx, p, slotC);
  if (p.bsm > 0.02) bashFx(ctx, p, A, slotS);
  ctx.restore();

  ctx.restore();
}
export const draw = drawDodongo;

/** Live variations that need the clock or per-actor memory: flailing limbs in flight, the bounce on hitting the floor. */
function reactive(p, o) {
  const q = Object.assign({}, p), t = o.t || 0;
  if (p.flail) {
    q.cu += 26 * Math.sin(t * 13); q.cf += 20 * Math.sin(t * 17 + 1); q.su += 30 * Math.sin(t * 12 + 2); q.sf += 20 * Math.sin(t * 15);
    q.nt += 18 * Math.sin(t * 11 + 0.5); q.ft += 18 * Math.sin(t * 10 + 2.2); q.ns -= 14 * Math.max(0, Math.sin(t * 11)); q.head += 7 * Math.sin(t * 9);
    q.rot += 8 * Math.sin(t * 6);
  }
  const mem = o.mem;
  if (p.down && mem) {       // first frames on the floor: slam squash, a small bounce, settle
    if (mem.dkF !== mem.frame - 1 && mem.dkF !== mem.frame) mem.dk0 = mem.frame;
    mem.dkF = mem.frame;
    const e = mem.frame - mem.dk0;
    if (e < 10) {
      const u = e / 10;
      q.y = p.y - 7 * Math.sin(Math.PI * clamp((u - 0.2) / 0.6, 0, 1)) * (1 - u);
      q.sq = e < 2 ? 0.82 : 1 + 0.04 * Math.sin(Math.PI * u) * (1 - u);
      q.head = p.head - 12 * Math.sin(Math.PI * u) * (1 - u);
      q.face = e < 6 ? 'ouch' : p.face;
    }
  }
  return q;
}

// both hands up under the carried object: the near arm takes the back corner, the far arm the front corner
function armIK(sx, sy, tx, ty, back, k = 1) {
  const U = UPPER * k, Fa = FA * k, dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  if (d > U + Fa - 0.05) d = U + Fa - 0.05;
  let phi = Math.atan2(dx, dy);
  if (phi < -Math.PI / 2) phi += TAU;
  const a = Math.acos(clamp((U * U + d * d - Fa * Fa) / (2 * U * d), -1, 1));
  const b = Math.acos(clamp((Fa * Fa + d * d - U * U) / (2 * Fa * d), -1, 1));
  return back ? [(phi + a) / DEG, -(a + b) / DEG] : [(phi - a) / DEG, (a + b) / DEG];
}
function toTorso(p, lx, ly, hipY) {
  let x = lx * Math.sqrt(p.sq) - p.x, y = ly / p.sq - hipY;
  if (p.rot) { const r = p.rot * DEG, c = Math.cos(r), s = Math.sin(r); const x2 = x * c - y * s; y = x * s + y * c; x = x2; }
  const t = -p.tor * DEG, c = Math.cos(t), s = Math.sin(t);
  return [x * c - y * s, x * s + y * c];
}
function carryArms(p, hipY, slotC, slotS, R) {
  const back = toTorso(p, CARRY_POINT[0] - 17, CARRY_POINT[1] + 3, hipY), front = toTorso(p, CARRY_POINT[0] + 17, CARRY_POINT[1] + 3, hipY);
  const near = R ? slotC : slotS, far = R ? slotS : slotC;
  const c = clamp(p.carry, 0, 1);
  // cartoon arm stretch (per arm) so the palms reach the load's lower corners above his crest
  const need = (a, t) => lerp(1, clamp(Math.hypot(t[0] - a[0], t[1] - a[1]) / (UPPER + FA) * 1.03, 1, 1.6), c);
  const kn = need(near, back), kf_ = need(far, front);
  const n = armIK(near[0], near[1], back[0], back[1], true, kn), fa = armIK(far[0], far[1], front[0], front[1], false, kf_);
  const club = R ? n : fa, sh = R ? fa : n;
  return { cu: lerp(p.cu, club[0], c), cf: lerp(p.cf, club[1], c), cw: p.cw, su: lerp(p.su, sh[0], c), sf: lerp(p.sf, sh[1], c),
    astC: R ? kn : kf_, astS: R ? kf_ : kn };
}

// -------------------------------------------------- shading helpers
/** cel() + a cool rim band on the side away from the key light, then the ink outline last. */
function part(ctx, path, base, dark, o, rs) {
  const lw = o.lw;
  if (!rs) { cel(ctx, path, base, dark, o); return; }
  o.lw = 0; cel(ctx, path, base, dark, o);
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c;
  if (det) {
    const k = Math.sqrt(Math.abs(det)), wx = -0.8 * rs * k, wy = 0.6 * rs * k;
    ctx.save();
    ctx.beginPath(); path(ctx); ctx.clip();
    ctx.translate((m.d * wx - m.c * wy) / det, (-m.b * wx + m.a * wy) / det);
    ctx.beginPath(); path(ctx);
    ctx.globalAlpha = o.ra ?? 0.95; ctx.lineWidth = rs * 2 + lw * 0.25; ctx.lineJoin = 'round'; ctx.strokeStyle = o.rc || RIM; ctx.stroke();
    ctx.restore();
  }
  if (o.noInk) return;
  ctx.beginPath(); path(ctx);
  ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke();
}
/** Silhouette ink: a double-width stroke whose inner half the fills drawn afterwards cover (no seam between parts). */
function silhouette(ctx, path, lw = LW) {
  ctx.beginPath(); path(ctx);
  ctx.lineWidth = lw * 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke();
}

// -------------------------------------------------- cached details (Path2D, built once)
function scalePath(x0, x1, y0, y1, dx, dy, r) {
  const q = new Path2D();
  let row = 0;
  for (let y = y0; y <= y1; y += dy, row++) {
    for (let x = x0 + (row % 2) * dx / 2; x <= x1; x += dx) {
      q.moveTo(x + r * Math.cos(0.1 * Math.PI), y + r * Math.sin(0.1 * Math.PI));
      q.arc(x, y, r, 0.1 * Math.PI, 0.9 * Math.PI);
    }
  }
  return q;
}
function poly(list) {   // list of polylines
  const q = new Path2D();
  for (const pts of list) { q.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) q.lineTo(pts[i], pts[i + 1]); }
  return q;
}
function dots(list, r) { const q = new Path2D(); for (const [x, y] of list) { q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU); } return q; }
function makePaths() {
  const P2 = {};
  P2.scU = scalePath(-7, 7, -3, 21, 3.7, 3.2, 1.9);
  P2.scF = scalePath(-8, 8, -1, 16, 3.7, 3.2, 1.9);
  P2.scH = scalePath(-6, 6, 0, 6, 3.4, 3, 1.6);
  // ember cracks: jagged, irregular, thin forks (lava seams between the scales)
  P2.crU = poly([[3.4, 0.6, 2.2, 2.4, 2.8, 4, 0.9, 6.1, 1.6, 7.6, 0.2, 9.8, -0.4, 12.4, 0.9, 14.2, 0.1, 16.4],
    [0.9, 6.1, -1.2, 6.9, -2.1, 8.8], [-0.4, 12.4, -2.6, 13.4], [1.6, 7.6, 3.4, 8.7]]);
  P2.crF = poly([[4.4, -0.6, 3.1, 1.6, 3.6, 3.2, 1.8, 4.9, 2.4, 6.6, 0.6, 8.6, 1.2, 10.4, -0.4, 12.6],
    [1.8, 4.9, -0.6, 5.6, -1.4, 7.4, -3.4, 8.2], [0.6, 8.6, 2.6, 9.6, 4.2, 9.2], [-1.4, 7.4, -0.8, 9.4]]);
  P2.crH = poly([[-3.2, 0.4, -1.4, 1.2, -0.6, 3.2, -1.6, 5.2], [-0.6, 3.2, 1.6, 3.6]]);
  // breastplate scratches (dark + light pairs) and the centre ridge
  P2.scrD = poly([[-9, -26.5, -5.6, -24.2], [9.5, -30.5, 12, -28.8], [-5, -14.8, -1.6, -16.2], [8.8, -18, 11.2, -19.6]]);
  P2.scrL = poly([[-8.8, -25.6, -5.4, -23.3], [9.6, -29.6, 12.1, -27.9], [-4.9, -14, -1.5, -15.4]]);
  P2.ridge = new Path2D(); P2.ridge.moveTo(4.6, -37); P2.ridge.quadraticCurveTo(7.2, -24, 6.1, -11);
  P2.ridgeH = new Path2D(); P2.ridgeH.moveTo(3.4, -36.5); P2.ridgeH.quadraticCurveTo(6, -24, 4.9, -11.5);
  // fur drape: long strands flowing down into the locks, a sheen along the top
  const ds = new Path2D();
  for (const [x0, y0, cx, cy, x1, y1] of [[-7.4, -37.6, -9.2, -35, -8.4, -31.8], [-10, -36.4, -11.4, -33, -10.4, -29.6], [-15, -38.8, -17, -35.6, -16.2, -31.8],
    [-17.8, -36.6, -19.6, -33.4, -19, -30.4], [-22.4, -37.2, -24.4, -34.4, -23.2, -30.6], [-12.6, -41.6, -13.6, -40, -13.2, -38.4], [-20.4, -41, -21.6, -39.4, -21.2, -37.8]]) {
    ds.moveTo(x0, y0); ds.quadraticCurveTo(cx, cy, x1, y1);
  }
  P2.drapeS = ds;
  P2.drapeH = poly([[-26.4, -37.4, -23.6, -40.4], [-19.8, -42.2, -15.6, -42.8], [-11.6, -42.6, -8.8, -41.6]]);
  // hair: curl strands (dark) + highlight strands, crop texture
  // thin strands sweeping forward into each lock, ending in a curl; highlights along the lit back edges
  const hs = new Path2D(), hh = new Path2D();
  for (const [x0, y0, cx, cy, x1, y1] of [[-8, -16.4, -8.4, -22.6, -4.6, -26.4], [-2.4, -15, -1.6, -24, 2.8, -29.4], [3.6, -13.8, 6, -22.6, 11, -28.6],
    [9.4, -13.2, 13.2, -20.4, 18.6, -25.2], [14.8, -13, 19.2, -16.6, 24.6, -18.6]]) {
    hs.moveTo(x0, y0); hs.quadraticCurveTo(cx, cy, x1, y1); hs.quadraticCurveTo(x1 + 2.2, y1 + 0.4, x1 + 1.2, y1 + 2.6);
  }
  for (const [x0, y0, x1, y1] of [[-9.6, -19, -6.6, -24.6], [-3.6, -21.8, 0.6, -28], [3, -22.6, 8.2, -28.4], [10.4, -20.6, 15.4, -25]]) {
    hh.moveTo(x0, y0); hh.quadraticCurveTo(x0 + 0.6, (y0 + y1) / 2 - 1.6, x1, y1);
  }
  P2.hairS = hs; P2.hairH = hh;
  P2.crop = poly([[-15.5, -12, -13.8, -11], [-16.8, -6, -15, -5.4], [-16.6, 0, -14.8, 0.2], [-13, -15.5, -11.4, -14], [-11.5, 3, -10, 2.4], [-14.5, 5, -13, 4.2]]);
  // club: wood grain, grip wrap, ball rivets + scratches
  P2.grain = poly([[-1, -3, -0.6, 8], [1.2, 12, 1.5, 22], [-1.2, 16, -0.8, 23]]);
  P2.wrap = poly([[-2.8, 3, 2.8, 5.2], [-2.8, 6.2, 2.8, 8.4], [-2.8, 9.4, 2.8, 11.6], [-2.8, 12.6, 2.8, 14.8]]);
  P2.ballRiv = dots([[-4.2, -3.6], [4.4, -2.6], [0.3, 4.8]], 1.05);
  P2.ballScr = poly([[-5.5, 1.5, -2.8, 3.2], [2, -6, 4.2, -4.6]]);
  // shield: planks, grain, rivets round the rim, scratches
  P2.planks = poly([[-12, -19, -12, 19], [-6, -19, -6, 19], [0, -19, 0, 19], [6, -19, 6, 19], [12, -19, 12, 19]]);
  const sg = new Path2D();
  for (const [x, y] of [[-9, -8], [3, 6], [-3, 11], [9, -3], [-9, 7]]) { sg.moveTo(x - 1.4, y - 2.5); sg.quadraticCurveTo(x + 1.2, y, x - 1, y + 2.6); }
  P2.sgrain = sg;
  const rv = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + 0.3; rv.push([Math.cos(a) * 17.7, Math.sin(a) * 17.7]); }
  P2.shRiv = dots(rv, 0.95);
  P2.shScr = poly([[-14, -4, -9.5, -1], [6, 10.5, 10.8, 12.8]]);
  // leather stitching on tassets / bracer, belt studs, rivets
  P2.beltStud = dots([[-11.2, -13.2], [-6.4, -13.2], [-1.8, -13.1], [14.2, -13.4]], 1.25);
  return P2;
}

// -------------------------------------------------- legs
const THIGH_P = (c) => capsule(c, THIGH, 14, 12);
const SHIN_P = (c) => capsule(c, SHIN, 12, 11);
const CUFF_P = (c) => {
  c.moveTo(-7.5, 3.5); c.lineTo(7.5, 3.5); c.lineTo(8.2, 8.5);
  for (let i = 0; i <= 6; i++) c.lineTo(8.2 - i * 16.4 / 6, 8.5 + (i % 2 ? 4.2 : 0));
  c.closePath();
};
const KNEE_P = (c) => blob(c, [[-6, -6], [5, -7], [8, -1], [6, 6], [-4, 6], [-7, 0]]);
const BAND_P = (c) => { c.moveTo(-6.4, 15.5); c.lineTo(6.2, 15.5); c.lineTo(6.1, 18.6); c.lineTo(-6.2, 18.6); c.closePath(); };
const BOOT_P = (c) => {
  c.moveTo(-6, -3); c.lineTo(-6.5, 5); c.quadraticCurveTo(-6, 7.5, -3, 7.5); c.lineTo(15, 7.5);
  c.quadraticCurveTo(18.5, 7.5, 17, 3); c.quadraticCurveTo(14, -2, 7, -3); c.closePath();
};
const TOE_P = (c) => { c.moveTo(8, -2.5); c.quadraticCurveTo(15, -1.5, 17, 3); c.quadraticCurveTo(18.5, 7.5, 15, 7.5); c.lineTo(8, 7.5); c.closePath(); };
function leg(ctx, hip, a, s, footAbs, far) {
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(-a * DEG);
  const fold = s < -26;
  if (far) flat(ctx, THIGH_P, C.oliveD, LW);
  else cel(ctx, THIGH_P, C.olive, C.oliveD, { k: 1.2, lw: LW, detail: (c) => {
    c.fillStyle = OCC; c.fillRect(-8, -8, 16, 8);
    c.strokeStyle = C.oliveL; c.lineWidth = LF; c.beginPath();
    c.moveTo(4.2, 3); c.quadraticCurveTo(5.4, 11, 3.6, 18);                       // seam
    if (fold) { c.moveTo(-6.5, THIGH - 7.5); c.quadraticCurveTo(-2.6, THIGH - 4.6, 0.8, THIGH - 7.8); c.moveTo(-6.8, THIGH - 3.4); c.quadraticCurveTo(-3.6, THIGH - 1.4, -0.8, THIGH - 3.6); }
    c.stroke();
  } });
  ctx.translate(0, THIGH);
  ctx.rotate(-s * DEG);
  // boot shaft with front stitching, steel ankle band, fur cuff, steel knee pad
  if (far) flat(ctx, SHIN_P, C.bootD, LW);
  else {
    part(ctx, SHIN_P, C.boot, C.bootD, { k: 1.2, lw: LW }, 0.9);
    ctx.strokeStyle = C.leaH; ctx.lineWidth = 0.9; ctx.setLineDash([1.5, 1.6]);
    ctx.beginPath(); ctx.moveTo(3.4, 9); ctx.lineTo(3.2, 14.5); ctx.stroke(); ctx.setLineDash([]);
  }
  flat(ctx, BAND_P, far ? C.steelD : C.steel, 1.8);
  flat(ctx, CUFF_P, far ? C.furD : C.fur, LM);
  ctx.strokeStyle = far ? C.furL : C.furD; ctx.lineWidth = 0.9; ctx.beginPath();
  for (let x = -5; x <= 6; x += 2.7) { ctx.moveTo(x, 5); ctx.lineTo(x + 0.6, 10); }
  ctx.stroke();
  if (far) flat(ctx, KNEE_P, C.steelD, LM);
  else cel(ctx, KNEE_P, C.steel, C.steelD, { hi: C.steelH, lw: LM, detail: (c) => {
    c.fillStyle = C.steelL; c.beginPath(); c.arc(0.6, -0.4, 1.1, 0, TAU); c.fill();
    c.strokeStyle = C.steelH; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-3.8, 2.6); c.lineTo(-1.4, 3.8); c.stroke();
  } });
  ctx.translate(0, SHIN);
  ctx.rotate((a + s - footAbs) * DEG);
  if (far) { flat(ctx, BOOT_P, C.bootD, LW); flat(ctx, TOE_P, C.steelD, LM); }
  else { cel(ctx, BOOT_P, C.boot, C.bootD, { lw: LW }); cel(ctx, TOE_P, C.steel, C.steelD, { hi: C.steelH, lw: LM }); }
  ctx.fillStyle = C.sole; ctx.fillRect(-6, 5.6, 22.2, 2.2);
  ctx.restore();
}

// -------------------------------------------------- torso (torso frame: hip at 0,0, up = -y)
const BACK_TAS = (c) => { c.moveTo(-14, -11); c.lineTo(-3, -11); c.lineTo(-2, 8); c.quadraticCurveTo(-8, 10.5, -15, 7); c.closePath(); };
const FRONT_TAS = (c) => { c.moveTo(-5, -11); c.lineTo(3.5, -11); c.lineTo(4.2, 7); c.quadraticCurveTo(-0.6, 9, -6, 7); c.closePath(); };
const FAULD = (c) => { c.moveTo(3, -11); c.lineTo(14, -11); c.lineTo(13.2, 5.5); c.lineTo(8.4, 11); c.lineTo(3.6, 5.5); c.closePath(); };
const BELT = (c) => { c.moveTo(-14.5, -17); c.quadraticCurveTo(0, -16, 15.5, -17.5); c.lineTo(15, -9.5); c.quadraticCurveTo(0, -8.5, -14, -9.5); c.closePath(); };
const BUCKLE = (c) => circle(c, 9, -13.3, 5.7);
let SW = 0;   // chest swell this draw
function plate(c) {
  const s = SW;
  c.moveTo(-13, -10);
  c.bezierCurveTo(-15.5, -20, -14.5 - s * 0.6, -31, -8, -37 - s * 1.1);
  c.lineTo(7, -38 - s * 1.1);
  c.bezierCurveTo(16 + s * 1.6, -35 - s, 18 + s * 2.6, -23, 14, -10);
  c.closePath();
}
function swing(ctx, px, py, ang, fn) { ctx.save(); ctx.translate(px, py); ctx.rotate(-ang * DEG); ctx.translate(-px, -py); fn(); ctx.restore(); }
function torso(ctx, p) {
  SW = p.br;
  // back tasset (sways)
  swing(ctx, -8.5, -11, M.tB, () => cel(ctx, BACK_TAS, C.lea, C.leaD, { lw: LM, detail: (c) => {
    c.fillStyle = OCC; c.fillRect(-16, -12, 16, 6);
    c.strokeStyle = C.leaL; c.lineWidth = 0.9; c.setLineDash([1.5, 1.5]);
    c.beginPath(); c.moveTo(-12.5, -5); c.lineTo(-12.8, 5.2); c.quadraticCurveTo(-8, 7.6, -3.6, 6); c.stroke();
  } }));
  // breastplate: ridge, scratches, crossed stitched straps, rivets; occlusion under the mantle and the near arm
  part(ctx, plate, C.steel, C.steelD, { k: 1.4, hi: C.steelH, lw: LW, detail: (c) => {
    c.fillStyle = OCC; c.fillRect(-17, -42, 36, 7.5);
    c.beginPath(); c.ellipse(-12.5, -26, 3.6, 7, 0.1, 0, TAU); c.fill();
    c.lineWidth = 1.1; c.strokeStyle = C.steelD; c.stroke(PT.ridge); c.strokeStyle = C.steelH; c.lineWidth = 0.9; c.stroke(PT.ridgeH);
    c.lineWidth = 0.9; c.strokeStyle = C.steelL; c.stroke(PT.scrD); c.strokeStyle = C.steelH; c.stroke(PT.scrL);
    c.lineCap = 'butt';
    for (const [x0, y0, x1, y1] of STRAPS) {
      c.strokeStyle = INK; c.lineWidth = 7.4; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = C.strap; c.lineWidth = 4.6; c.stroke();
      c.strokeStyle = C.strapD; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x0, y0 + 1.6); c.lineTo(x1, y1 + 1.6); c.stroke();
      c.strokeStyle = C.leaH; c.lineWidth = 0.75; c.setLineDash([1.4, 1.5]); c.beginPath(); c.moveTo(x0, y0 - 0.3); c.lineTo(x1, y1 - 0.3); c.stroke(); c.setLineDash([]);
    }
    c.fillStyle = C.brass; c.beginPath(); c.arc(-11.6, -31.5, 1.6, 0, TAU); c.arc(12.4, -32.4, 1.6, 0, TAU); c.fill();
    c.fillStyle = C.brassD; c.beginPath(); c.arc(-11.2, -31.1, 0.7, 0, TAU); c.arc(12.8, -32, 0.7, 0, TAU); c.fill();
  } }, 1.3);
  // faceted brass diamond where the straps cross
  diamond(ctx, 1, -22.2);
  // steel fauld + near tasset (sway with the legs)
  swing(ctx, 8.5, -11, M.tM, () => cel(ctx, FAULD, C.steel, C.steelD, { k: 1.2, hi: C.steelH, lw: LM, detail: (c) => {
    c.fillStyle = OCC; c.fillRect(2, -12, 13, 5);
    c.strokeStyle = C.steelD; c.lineWidth = 1; c.beginPath(); c.moveTo(8.6, -7); c.lineTo(8.4, 9); c.stroke();
    c.fillStyle = C.steelL; c.beginPath(); c.arc(5.4, -6.4, 0.9, 0, TAU); c.arc(11.8, -6.4, 0.9, 0, TAU); c.fill();
  } }));
  swing(ctx, -0.8, -11, M.tF, () => cel(ctx, FRONT_TAS, C.lea, C.leaD, { lw: LM, hi: C.leaH, hk: 0.3, detail: (c) => {
    c.fillStyle = OCC; c.fillRect(-7, -12, 12, 5.5);
    c.strokeStyle = C.leaL; c.lineWidth = 0.9; c.setLineDash([1.5, 1.5]);
    c.beginPath(); c.moveTo(-3.6, -5); c.lineTo(-4.2, 5.2); c.quadraticCurveTo(-0.6, 6.8, 2.8, 5.4); c.lineTo(2.3, -5); c.stroke();
    c.setLineDash([]); c.fillStyle = C.brass; c.beginPath(); c.arc(-0.6, -4.4, 1.15, 0, TAU); c.fill();
  } }));
  // belt: stitched edges, studs, star buckle
  cel(ctx, BELT, C.lea, C.leaD, { lw: LM, hi: C.leaH, hk: 0.3, detail: (c) => {
    c.strokeStyle = C.leaL; c.lineWidth = 0.85; c.setLineDash([1.5, 1.5]);
    c.beginPath(); c.moveTo(-13.5, -15.4); c.quadraticCurveTo(0, -14.5, 14.5, -15.9); c.moveTo(-13.2, -11); c.quadraticCurveTo(0, -10.1, 14.2, -11.1); c.stroke();
    c.setLineDash([]); c.fillStyle = C.brass; c.fill(PT.beltStud);
    c.fillStyle = C.brassH; c.beginPath(); c.arc(-11.6, -13.6, 0.45, 0, TAU); c.arc(-6.8, -13.6, 0.45, 0, TAU); c.fill();
  } });
  flat(ctx, BUCKLE, C.brass, LM);
  { const c = ctx;
    c.fillStyle = '#7d5a1a'; c.beginPath(); c.arc(9, -13.3, 3.9, 0, TAU); c.fill();
    c.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 1.25 : 3.7, a = -Math.PI / 2 + i * Math.PI / 4; c.lineTo(9 + Math.cos(a) * r, -13.3 + Math.sin(a) * r); }
    c.closePath(); c.fillStyle = C.brass; c.fill();
    c.fillStyle = C.brassH; c.beginPath(); c.moveTo(9, -17); c.lineTo(8.1, -13.8); c.lineTo(5.3, -13.3); c.lineTo(8.6, -12.9); c.closePath(); c.fill();
    c.strokeStyle = C.brassH; c.lineWidth = 0.9; c.beginPath(); c.arc(9, -13.3, 4.8, 3.6, 4.9); c.stroke();
  }
}
const STRAPS = [[-12, -33, 15, -11], [13, -34, -14, -12]];
function diamond(ctx, x, y) {
  const t = [x, y - 4.9], r = [x + 3.8, y], b = [x, y + 4.6], l = [x - 3.8, y], a = [x + 0.4, y - 0.4];
  const tri = (p1, p2, col) => { ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(a[0], a[1]); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
  tri(l, t, C.brassH); tri(t, r, C.brass); tri(r, b, C.brassD); tri(b, l, C.brass);
  ink(ctx, (c) => { c.moveTo(t[0], t[1]); c.lineTo(r[0], r[1]); c.lineTo(b[0], b[1]); c.lineTo(l[0], l[1]); c.closePath(); }, 1.6);
}

// fur mantle: a smooth band of pelt behind the nape (drawn before the head) and a drape over the NEAR shoulder:
// wider than tall, a smooth top edge hugging the shoulder line, 5 locks hanging from the lower edge that swing with
// the secondary motion, long strand strokes inside.
const FURBAND_P = (c) => {
  c.moveTo(-25.6, -30); c.quadraticCurveTo(-27, -40, -19, -45.4); c.quadraticCurveTo(-9, -50.6, 2, -47.6);
  c.quadraticCurveTo(8.6, -45, 9.4, -38.6); c.lineTo(5, -35); c.quadraticCurveTo(-8, -36, -18, -31); c.closePath();
};
const DRAPE_TOP = [[-29.4, -30.4], [-29.2, -36], [-26, -40.8], [-20.6, -43.6], [-14.6, -44.8], [-8.6, -43.8], [-4.4, -40.8], [-2.8, -37.2]];
const DRAPE_LOCKS = [[-3.6, -30.6, 0.9], [-6.6, -33.6, 0], [-9.8, -26.4, 1.15], [-12.2, -32.8, 0], [-15.8, -27.8, 1.1], [-18.2, -31.6, 0],
  [-21.4, -25.6, 1.3], [-24.8, -31.8, 0], [-27.2, -27.4, 1.2], [-28.8, -29.8, 0]];
function drapePath(c) {
  const T0 = DRAPE_TOP;
  c.moveTo(T0[0][0], T0[0][1]);
  for (let i = 1; i < T0.length; i++) {   // soft outward bumps between the points (fluffy, never spiky)
    const [x0, y0] = T0[i - 1], [x1, y1] = T0[i], L = Math.hypot(x1 - x0, y1 - y0) || 1;
    c.quadraticCurveTo((x0 + x1) / 2 + (y1 - y0) / L * 2.6, (y0 + y1) / 2 - (x1 - x0) / L * 2.6, x1, y1);
  }
  let px = T0[T0.length - 1][0], py = T0[T0.length - 1][1];
  for (const [x, y, w] of DRAPE_LOCKS) {
    const X = x + M.fx * w, Y = y + M.fy * w * 0.6;
    if (w) c.quadraticCurveTo(px + 0.9, (py + Y) / 2 + 1, X, Y);      // down the front of a lock to its tip
    else c.quadraticCurveTo(px - 0.2, (py + Y) / 2, X, Y);            // back up to the notch
    px = X; py = Y;
  }
  c.closePath();
}
function mantle(ctx) { flat(ctx, FURBAND_P, C.furD, LM); }
function furLobe(ctx, up) {
  ctx.save(); ctx.translate(0, -up);
  part(ctx, drapePath, C.fur, C.furD, { k: 1.25, hi: C.furH, hk: 0.5, lw: LM, detail: (c) => {
    c.fillStyle = OCC; c.fillRect(-30, -32.5, 30, 8);
    c.save(); c.translate(M.fx * 0.35, M.fy * 0.25);
    c.lineCap = 'round';
    c.strokeStyle = C.furL; c.lineWidth = 1.1; c.stroke(PT.drapeS);
    c.strokeStyle = C.furH; c.lineWidth = 1.2; c.stroke(PT.drapeH);
    c.restore();
  } }, 0.8);
  ctx.restore();
}
const NECK_P = (c) => { c.moveTo(-4.2, -10); c.lineTo(5.6, -10); c.lineTo(6, 1); c.lineTo(-4.6, 1); c.closePath(); };
const GORGET = (c) => { c.moveTo(-8, -38.6); c.quadraticCurveTo(1.6, -34.4, 11, -38.8); c.lineTo(10.4, -34.4); c.quadraticCurveTo(1.6, -30.2, -7.4, -34.4); c.closePath(); };
function neckGorget(ctx, p, up) {
  ctx.save(); ctx.translate(NECK[0], NECK[1] - neckUp(p));
  flat(ctx, NECK_P, C.skinO, LM);
  ctx.restore();
  ctx.save(); ctx.translate(0, -up * 0.5);
  part(ctx, GORGET, C.steel, C.steelD, { k: 1.1, hi: C.steelH, hk: 0.5, lw: LM, detail: (c) => {
    c.strokeStyle = C.steelD; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-6.6, -35.6); c.quadraticCurveTo(1.6, -31.8, 9.8, -35.8); c.stroke();
    c.fillStyle = C.steelL; c.beginPath(); c.arc(1.8, -34.2, 0.9, 0, TAU); c.fill();
  } }, 0);
  ctx.restore();
}

// -------------------------------------------------- head (head frame: origin at the neck joint)
let PUFF = 0;
function facePath(c) {
  const q = PUFF;
  c.moveTo(-9, 15);
  c.bezierCurveTo(-16, 10, -17, -6, -9, -14);
  c.bezierCurveTo(1, -20, 15, -19, 18, -7);
  c.quadraticCurveTo(19.5, -1, 19.2, 2);
  c.quadraticCurveTo(22.6, 4.8, 19.4, 7.3);                                   // nose
  c.quadraticCurveTo(19 + q * 4.2, 12.6 + q * 1.6, 13.5 + q * 1.8, 18 + q * 1.6);  // cheek + jaw (puffs out)
  c.quadraticCurveTo(6, 22 + q * 1.6, -1, 19.5 + q * 0.8);
  c.quadraticCurveTo(-5, 18, -9, 15);
  c.closePath();
}
const CROP = (c) => blob(c, [[-12, 8], [-17.5, 2], [-19.8, -7], [-17, -15.5], [-10, -20.5], [0, -22], [8, -19], [9, -12],
  [2, -11.5], [-4.5, -8.5], [-8.8, -3.5], [-10.5, 2.5]], 0.5);
const EAR = (c) => { c.moveTo(-4.2, -0.6); c.bezierCurveTo(-8, -3.4, -10.6, 1.8, -9, 5.8); c.bezierCurveTo(-8, 8.2, -5.6, 8.6, -4, 6.8); c.closePath(); };
function head(ctx, p, talk) {
  ctx.translate(HEAD_OFF[0], HEAD_OFF[1]);
  ctx.scale(HEAD_S, HEAD_S);
  PUFF = p.puff;
  // close-cropped back and sides (darker), behind everything on the head
  cel(ctx, CROP, C.crop, C.cropD, { k: 1.3, lw: LW, detail: (c) => { c.strokeStyle = C.cropD; c.lineWidth = 1; c.stroke(PT.crop); } });
  // skull + face: hairline shadow under the crest, jaw shading
  part(ctx, facePath, C.skin, C.skinD, { k: 1.4, hi: C.skinH, lw: LW, detail: (c) => {
    c.fillStyle = 'rgba(190,100,80,0.22)'; c.beginPath(); c.ellipse(8, -14.8, 13, 2.6, -0.1, 0, TAU); c.fill();
  } }, 0.8);
  // ear, set back and small, with a shaded inner fold
  cel(ctx, EAR, C.skin, C.skinD, { lw: 2, k: 0.8, detail: (c) => {
    c.strokeStyle = C.skinO; c.lineWidth = 1.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-5.4, 1); c.bezierCurveTo(-8, 0, -8.6, 3.6, -7, 5.4); c.quadraticCurveTo(-6, 4.2, -6.2, 3.2); c.stroke();
  } });
  // cheek blush (stronger when puffing)
  ctx.globalAlpha = 0.22 + p.puff * 0.25; ctx.fillStyle = '#f07064';
  ctx.beginPath(); ctx.ellipse(8.2 + p.puff * 1.5, 9.2, 4 + p.puff * 1.5, 2.3 + p.puff, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  features(ctx, p, talk);
  hair(ctx, p);
}

// --- hair: the faux-hawk crest of curls swept up and forward, with lag/bounce on the curl tips
// crest outline: forward-swept locks (notch -> tip pairs), each lock's long back edge bulging up, a short front edge
const LOCKS = [[-12.5, -15.5], [-13.4, -22], [-9.8, -21.2], [-5, -28.4], [-3.4, -25.2], [3, -31.4], [4.6, -27.6], [11.6, -31], [12.4, -26.8],
  [19.4, -27.4], [19.4, -23], [25.4, -20], [23.8, -16.8], [27.6, -12.4]];   // even = notch, odd = tip
const HAIR_U = [[24.2, -10.2], [20.8, -12.4], [17.8, -9.2], [14.6, -12.4], [10.4, -11.4], [6, -13.4], [2.2, -12.6], [-1.8, -15.4], [-5.4, -14.2], [-9, -17]];
let HXd = 0, HYd = 0, HSQ = 1, HL = 0, qx = 0, qy = 0;
function hp(x, y) {
  const w = clamp((-y - 12) / 22, 0, 1);
  let yy = y;
  if (y < -14) yy = -14 + (y + 14) * HSQ * (1 + HL * 0.3 * w);
  qx = x + HXd * w; qy = yy + HYd * w;
}
function hairPath(c) {
  hp(LOCKS[0][0], LOCKS[0][1]); c.moveTo(qx, qy);
  let x0 = qx, y0 = qy;
  for (let i = 1; i < LOCKS.length; i++) {
    hp(LOCKS[i][0], LOCKS[i][1]);
    if (i % 2) c.quadraticCurveTo(x0 + (qx - x0) * 0.12 - 0.8, qy + (y0 - qy) * 0.3, qx, qy);      // up the back edge to a tip
    else c.bezierCurveTo(x0 + 2.4, y0 + 0.6, x0 + 1.6, y0 + 3.2, qx, qy);                           // curl over, down to the notch
    x0 = qx; y0 = qy;
  }
  for (let i = 0; i < HAIR_U.length; i++) {
    hp(HAIR_U[i][0], HAIR_U[i][1]);
    c.quadraticCurveTo((x0 + qx) / 2, (y0 + qy) / 2 + 2.7, qx, qy);
    x0 = qx; y0 = qy;
  }
  c.closePath();
}
function hair(ctx, p) {
  HXd = M.hx; HYd = M.hy; HSQ = p.hsq; HL = p.hl;
  part(ctx, hairPath, C.hair, C.hairD, { k: 1.5, hi: C.hairH, hk: 0.5, lw: LW, detail: (c) => {
    c.save(); c.translate(HXd * 0.6, HYd * 0.6 + (1 - HSQ) * 6 - HL * 1.5);
    c.lineCap = 'round';
    c.strokeStyle = C.hairD; c.lineWidth = 1.15; c.stroke(PT.hairS);
    c.strokeStyle = C.hairH; c.lineWidth = 1.5; c.stroke(PT.hairH);
    c.restore();
  } }, 1);
}

// --- faces: grin det happy yell ouch ko surprised worried dragon puff breathe sniff smug (+ blink, + o.talk)
const BLINKY = { grin: 1, det: 1, worried: 1, surprised: 1, smug: 1, dragon: 1, puff: 0 };
function features(ctx, p, talk) {
  const fc = p.face;
  const tb = T % 4.1, n = Math.floor(T / 4.1);
  const blink = p.blink || (!p.noBlink && BLINKY[fc] && (tb > 3.96 || (n % 3 === 1 && tb > 3.62 && tb < 3.74)));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // eyes
  if (fc === 'ouch') {
    ink(ctx, (c) => { c.moveTo(4, -3); c.lineTo(9.6, 0.4); c.lineTo(4, 3.4); }, 2.3);
    ink(ctx, (c) => { c.moveTo(18.4, -3); c.lineTo(14.6, 0.2); c.lineTo(18.4, 3.2); }, 2.3);
  } else if (fc === 'happy') {
    ink(ctx, (c) => { c.moveTo(3.4, 1.6); c.quadraticCurveTo(7.6, -3.6, 11.4, 1.4); }, 2.4);
    ink(ctx, (c) => { c.moveTo(14.2, 1.1); c.quadraticCurveTo(16.6, -2.8, 18.8, 0.9); }, 2.4);
  } else if (fc === 'ko') {
    for (const [x, r] of [[7.3, 3.6], [16.4, 2.6]]) {
      ink(ctx, (c) => { for (let a = 0; a < 4 * Math.PI; a += 0.3) { const rr = r * a / (4 * Math.PI); c.lineTo(x + Math.cos(a + T * 6) * rr, Math.sin(a + T * 6) * rr); } }, 1.5);
    }
  } else if (blink || fc === 'sniff') {
    closedEye(ctx, 7.8, 0.5, 4.3, 4.6); closedEye(ctx, 16.8, 0, 2.8, 4.2);
  } else {
    const dragon = fc === 'dragon';
    const lid = fc === 'det' ? 0.3 : fc === 'puff' ? 0.5 : fc === 'yell' || dragon || fc === 'breathe' ? 0.24 : fc === 'smug' ? 0.18 : 0;
    const iris = fc === 'surprised' ? 0.74 : 0.86;
    const lk = fc === 'worried' ? -0.6 : p.look, lky = p.lookY;
    if (dragon) {
      ctx.globalAlpha = 0.35 + 0.25 * PULSE; ctx.fillStyle = C.glow;
      ctx.beginPath(); ctx.ellipse(7.8, 0.5, 6.4, 6, 0, 0, TAU); ctx.ellipse(16.8, 0, 4.4, 5.4, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    const big = fc === 'surprised' ? 1.12 : 1;
    eye(ctx, 7.6, 0.4, 4.7 * big, 5 * big, lid, iris, dragon, lk, lky);
    if (p.wink) closedEye(ctx, 16.8, 0, 3, 4.5, true);
    else eye(ctx, 16.9, 0, 3.05 * big, 4.6 * big, lid, iris, dragon, lk, lky);
  }
  // brows: thick, hair-coloured, skin showing between them and the crest
  let ang = 0.12, lift = 0;
  if (fc === 'yell' || fc === 'dragon' || fc === 'breathe') { ang = 0.36; lift = 1; }
  else if (fc === 'det' || fc === 'puff') { ang = 0.26; lift = 0.6; }
  else if (fc === 'ouch') { ang = -0.3; }
  else if (fc === 'happy' || fc === 'sniff') { ang = -0.12; lift = -0.8; }
  else if (fc === 'surprised') { ang = -0.08; lift = -2.2; }
  else if (fc === 'worried') { ang = -0.34; lift = -0.6; }
  else if (fc === 'smug') { ang = 0.18; }
  ctx.strokeStyle = C.brow; ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const x = i ? 16.9 : 7.8, w = i ? 2.1 : 4.5;
    ctx.save(); ctx.translate(x, -7.6 + lift - (fc === 'smug' && i ? 1.4 : 0)); ctx.rotate(i ? -ang * 0.8 : ang);
    ctx.fillStyle = C.brow;
    ctx.beginPath(); ctx.moveTo(-w, 0.9); ctx.quadraticCurveTo(-w * 0.2, -2, w + 0.3, -0.2); ctx.quadraticCurveTo(0, -0.1, -w, 0.9); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1.3; ctx.stroke();
    ctx.restore();
  }
  // nostril
  ink(ctx, (c) => { c.moveTo(18.6, 6.6); c.quadraticCurveTo(17.4, 7.2, 17.9, 5.8); }, 1.1, C.skinO);
  mouth(ctx, p, talk);
}
function eye(ctx, x, y, rx, ry, lid, iris, dragon, lx, ly) {
  const L = lid * ry * 1.25;
  const shape = (c) => {
    c.moveTo(x - rx, y + ry * 0.2);
    c.bezierCurveTo(x - rx * 0.55, y - ry * 1.2, x + rx * 0.55, y - ry * 1.18, x + rx, y - ry * 0.1);
    c.bezierCurveTo(x + rx * 0.62, y + ry * 1.02, x - rx * 0.5, y + ry * 1.04, x - rx, y + ry * 0.2);
    c.closePath();
  };
  ctx.save();
  ctx.beginPath(); shape(ctx); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
  const ir = ry * iris, ix = x + rx * 0.08 + lx * rx * 0.32, iy = y + 0.6 + ly * ry * 0.26;
  ctx.fillStyle = dragon ? '#ff9a1a' : C.eye; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
  ctx.fillStyle = dragon ? '#ffe36a' : C.eyeL; ctx.beginPath(); ctx.ellipse(ix + ir * 0.05, iy + ir * 0.45, ir * 0.66, ir * 0.42, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = C.eyeD; ctx.beginPath();
  if (dragon) ctx.ellipse(ix, iy, ir * 0.2, ir * 0.78, 0, 0, TAU); else ctx.arc(ix, iy, ir * 0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ix - ir * 0.34, iy - ir * 0.38, ir * 0.3, 0, TAU); ctx.arc(ix + ir * 0.34, iy + ir * 0.34, ir * 0.12, 0, TAU); ctx.fill();
  // upper lid: shadow band, lowered lid skin
  ctx.fillStyle = 'rgba(110,50,40,0.2)';
  ctx.beginPath(); ctx.moveTo(x - rx - 1, y - ry * 2); ctx.lineTo(x + rx + 1, y - ry * 2); ctx.lineTo(x + rx + 1, y - ry * 0.1 + Math.max(0, L) + 1.4);
  ctx.bezierCurveTo(x + rx * 0.55, y - ry * 1.18 + L + 1.4, x - rx * 0.55, y - ry * 1.2 + L + 1.4, x - rx - 1, y + ry * 0.2 + 1.4); ctx.closePath(); ctx.fill();
  if (L > 0.05) {
    ctx.fillStyle = C.skin;
    ctx.beginPath(); ctx.moveTo(x - rx - 1, y - ry * 2); ctx.lineTo(x + rx + 1, y - ry * 2); ctx.lineTo(x + rx + 1, y - ry * 0.1);
    ctx.bezierCurveTo(x + rx * 0.55, y - ry * 1.18 + L, x - rx * 0.55, y - ry * 1.2 + L, x - rx - 1, y + ry * 0.2); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // tapered upper-lid ink (thick in the middle, thin at the corners) with a flick past the outer corner
  const Lp = Math.max(0, L), ax = x - rx - 0.4, ay = y + ry * 0.26, bx = x + rx + 0.4, by = y - ry * 0.12;
  ctx.beginPath(); ctx.moveTo(ax, ay);
  ctx.bezierCurveTo(x - rx * 0.55, y - ry * 1.2 + Lp - 2, x + rx * 0.55, y - ry * 1.18 + Lp - 2.2, bx + 0.5, by - 1.1);
  ctx.lineTo(x + rx + 1.9, y - ry * 0.5);
  ctx.lineTo(bx, by);
  ctx.bezierCurveTo(x + rx * 0.55, y - ry * 1.18 + Lp, x - rx * 0.55, y - ry * 1.2 + Lp, ax, ay);
  ctx.closePath(); ctx.fillStyle = INK; ctx.fill();
  ctx.lineWidth = 0.7; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - rx * 0.15, y + ry * 0.98); ctx.quadraticCurveTo(x + rx * 0.5, y + ry * 0.9, x + rx * 0.85, y + ry * 0.4);
  ctx.lineWidth = 1; ctx.strokeStyle = C.skinO; ctx.stroke();
}
function closedEye(ctx, x, y, rx, ry, wink) {
  ink(ctx, (c) => { c.moveTo(x - rx, y + ry * 0.15); c.quadraticCurveTo(x, y + ry * (wink ? -0.6 : 0.85), x + rx + 0.8, y + ry * 0.05); c.lineTo(x + rx + 1.6, y - ry * 0.25); }, 2.2);
}
function mouth(ctx, p, talk) {
  const fc = p.face;
  const loud = fc === 'yell' || fc === 'dragon' || fc === 'ouch' || fc === 'ko' || fc === 'breathe' || fc === 'puff';
  if (talk && !loud) {
    const m = Math.max(0, Math.abs(Math.sin(T * 11.3)) * (0.65 + 0.35 * Math.sin(T * 3.1)) - 0.08);
    if (m < 0.1) { ink(ctx, (c) => { c.moveTo(9.6, 12.2); c.quadraticCurveTo(13.6, 13.6, 17.6, 11.4); }, 1.9); return; }
    flat(ctx, (c) => { c.moveTo(9.4, 11.6); c.quadraticCurveTo(13.5, 12.6 - m, 17.8, 11); c.quadraticCurveTo(17, 12 + m * 5.6, 13.2, 12.4 + m * 6);
      c.quadraticCurveTo(9.8, 12 + m * 4.6, 9.4, 11.6); c.closePath(); }, C.mouth, 1.8);
    ctx.fillStyle = C.teeth; ctx.beginPath(); ctx.moveTo(10.2, 12); ctx.quadraticCurveTo(13.5, 12.9, 17, 11.6); ctx.lineTo(16.8, 12.8); ctx.quadraticCurveTo(13.5, 14, 10.6, 13); ctx.closePath(); ctx.fill();
    if (m > 0.45) { ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(13.4, 12 + m * 5, 2.4, 1.1, 0, 0, TAU); ctx.fill(); }
    return;
  }
  switch (fc) {
    case 'yell': case 'dragon': {
      flat(ctx, (c) => { c.moveTo(9.2, 10.2); c.quadraticCurveTo(14, 8.8, 18, 10.4); c.quadraticCurveTo(17.2, 18.4, 12.8, 18); c.quadraticCurveTo(9.6, 16.6, 9.2, 10.2); c.closePath(); }, C.mouthD, 2);
      ctx.fillStyle = C.teeth; ctx.beginPath(); ctx.moveTo(10, 10.7); ctx.quadraticCurveTo(14, 9.8, 17.3, 11); ctx.lineTo(17, 12.5); ctx.quadraticCurveTo(13.6, 11.7, 10.3, 12.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(13.4, 16.3, 2.7, 1.4, 0, 0, TAU); ctx.fill();
      if (fc === 'dragon') { ctx.globalAlpha = 0.5 + 0.3 * PULSE; ctx.fillStyle = C.glow; ctx.beginPath(); ctx.ellipse(13.6, 14.4, 3, 2.2, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      break;
    }
    case 'happy': {
      flat(ctx, (c) => { c.moveTo(8.8, 10.8); c.quadraticCurveTo(13.5, 12.6, 18.2, 9.8); c.quadraticCurveTo(17.4, 17.4, 12.8, 17.2); c.quadraticCurveTo(9.4, 16.2, 8.8, 10.8); c.closePath(); }, C.mouth, 1.9);
      ctx.fillStyle = C.teeth; ctx.beginPath(); ctx.moveTo(9.7, 11.3); ctx.quadraticCurveTo(13.5, 12.9, 17.4, 10.5); ctx.lineTo(17.1, 11.9); ctx.quadraticCurveTo(13.5, 14.2, 10, 12.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(13.3, 15.4, 2.6, 1.3, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'ouch': {
      flat(ctx, (c) => { c.moveTo(9.4, 12); c.quadraticCurveTo(13.6, 10.6, 18, 11.4); c.lineTo(17.4, 15.4); c.quadraticCurveTo(13.6, 16.6, 9.8, 15.6); c.closePath(); }, C.teeth, 1.9);
      ink(ctx, (c) => { c.moveTo(9.8, 13.7); c.quadraticCurveTo(13.6, 13.2, 17.6, 13.4); c.moveTo(12.4, 11.4); c.lineTo(12.4, 15.8); c.moveTo(15.2, 11.2); c.lineTo(15.2, 15.6); }, 0.9);
      break;
    }
    case 'ko': {
      ink(ctx, (c) => { c.moveTo(9.6, 13.4); c.quadraticCurveTo(11.4, 11.8, 13.2, 13.4); c.quadraticCurveTo(15, 15, 17.4, 13.2); }, 1.8);
      ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(15.4, 15.2, 1.5, 1.8, 0.3, 0, TAU); ctx.fill();
      break;
    }
    case 'surprised': {
      flat(ctx, (c) => ellipse(c, 14, 14.2, 2.7, 3.4), C.mouthD, 1.8);
      ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(14, 16.2, 1.6, 0.9, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'worried': ink(ctx, (c) => { c.moveTo(10, 14); c.quadraticCurveTo(11.6, 12.4, 13.2, 13.8); c.quadraticCurveTo(14.8, 15.2, 16.8, 13.2); }, 1.8); break;
    case 'puff': {
      flat(ctx, (c) => ellipse(c, 16.2, 13.6, 1.8, 1.6), C.mouth, 1.7);
      if (p.mg > 0.05) {
        ctx.globalAlpha = p.mg * (0.6 + 0.4 * PULSE); ctx.fillStyle = C.ember;
        ctx.beginPath(); ctx.arc(14.2, 13.2, 1, 0, TAU); ctx.arc(18.2, 13.8, 0.9, 0, TAU); ctx.fill();
        // smoke puffs from the nostril
        ctx.fillStyle = '#c9c3c6'; ctx.globalAlpha = p.mg * 0.8;
        const s = (T * 2) % 1;
        ctx.beginPath(); ctx.arc(22 + s * 4, 5 - s * 5, 1.2 + s * 1.4, 0, TAU); ctx.arc(24 + s * 3, 8 - s * 3, 0.9 + s, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (p.inh > 0.05) {   // air rushing in
        ctx.globalAlpha = p.inh * 0.8;
        const s = (T * 3) % 1;
        ink(ctx, (c) => { for (const [y, l] of [[9, 7], [13.6, 9], [18, 6.5]]) { const x0 = 33 - s * 7; c.moveTo(x0, y + (y - 13.6) * 0.5); c.quadraticCurveTo(x0 - l * 0.5, y, x0 - l, y + (13.6 - y) * 0.2); } }, 1.2, '#ffffff');
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'breathe': {
      const g = p.mg;
      flat(ctx, (c) => { c.moveTo(8.6, 9.2); c.quadraticCurveTo(15, 6.4, 21.6, 9.6); c.quadraticCurveTo(22.4, 21.6, 15, 21.8); c.quadraticCurveTo(8, 20.6, 8.6, 9.2); c.closePath(); }, C.mouth, 2.1);
      ctx.fillStyle = C.mouthD; ctx.beginPath(); ctx.ellipse(15.2, 16.8, 5, 3.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = C.teeth; ctx.beginPath(); ctx.moveTo(9.6, 9.8); ctx.quadraticCurveTo(15, 7.6, 20.8, 10.2); ctx.lineTo(20.6, 11.6); ctx.quadraticCurveTo(15, 9.6, 9.8, 11.4); ctx.closePath(); ctx.fill();
      if (g > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = g * 0.9; ctx.fillStyle = C.glow; ctx.beginPath(); ctx.ellipse(16, 15.6, 5.4, 4.6, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = g; ctx.fillStyle = C.emberC; ctx.beginPath(); ctx.ellipse(17, 15.2, 3 + PULSE, 2.4, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = g * 0.3; ctx.fillStyle = C.glow; ctx.beginPath(); ctx.ellipse(16, 15, 11, 9, 0, 0, TAU); ctx.fill();   // warm light on the chin
        if (g > 0.85) {   // muzzle flash at the mouth front
          ctx.globalAlpha = (g - 0.85) * 6; ctx.fillStyle = '#fff2b8';
          ctx.beginPath();
          for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? 3.4 : 8.5; ctx.lineTo(25 + Math.cos(a) * r, 15 + Math.sin(a) * r); }
          ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = g; ctx.fillStyle = C.ember;
        for (let i = 0; i < 3; i++) { const s = (T * 2.4 + i * 0.37) % 1; ctx.beginPath(); ctx.arc(23 + s * 9, 13 - s * 7 + i * 3, 1.1 * (1 - s) + 0.3, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'sniff': {
      flat(ctx, (c) => ellipse(c, 14.6, 13.8, 1.5, 1.3), C.mouth, 1.6);
      ctx.globalAlpha = 0.75;
      const s = (T * 1.6) % 1;
      ink(ctx, (c) => { for (let i = 0; i < 2; i++) { const x = 26 + i * 4 + s * 3, y = 2 - i * 4 - s * 3; c.moveTo(x, y + 4); c.quadraticCurveTo(x + 2.4, y + 2, x, y); c.quadraticCurveTo(x - 2.4, y - 2, x, y - 4); } }, 1.1, '#ffffff');
      ctx.globalAlpha = 1;
      break;
    }
    case 'det': {
      ink(ctx, (c) => { c.moveTo(9.4, 13.4); c.quadraticCurveTo(13.4, 14.4, 17.6, 11.6); }, 1.9);
      ink(ctx, (c) => { c.moveTo(17.2, 10.6); c.quadraticCurveTo(17.9, 11.4, 18.2, 12.6); }, 1.1, C.skinO);
      break;
    }
    default: {   // grin / smug: confident grin with teeth + a dimple
      flat(ctx, (c) => { c.moveTo(9, 11); c.quadraticCurveTo(13.5, 12.8, 18, 10.2); c.quadraticCurveTo(16.6, 15.8, 12.8, 15.6); c.quadraticCurveTo(9.8, 15, 9, 11); c.closePath(); }, C.teeth, 1.9);
      ctx.fillStyle = C.mouth; ctx.beginPath(); ctx.moveTo(10.6, 13.9); ctx.quadraticCurveTo(13.4, 14.4, 16.6, 13); ctx.quadraticCurveTo(15.6, 15.3, 12.8, 15.2); ctx.quadraticCurveTo(11.2, 14.9, 10.6, 13.9); ctx.fill();
      ink(ctx, (c) => { c.moveTo(8.1, 10.2); c.quadraticCurveTo(8.3, 11.2, 9, 11.9); }, 1.1, C.skinO);
    }
  }
}

// -------------------------------------------------- the dragon arm (torso frame)
const SLEEVE_P = (c) => { c.moveTo(-6, -1); c.arc(0, 0, 6, Math.PI, 0); c.lineTo(6, 6.5); c.quadraticCurveTo(0, 8.6, -6, 6.5); c.closePath(); };
const UPPER_D = (c) => capsule(c, UPPER, 10.2, 11.6);
const FORE_D = (c) => { c.moveTo(-6, 0.6); c.quadraticCurveTo(-8, 8, -7.4, 15.5); c.lineTo(7.4, 15.5); c.quadraticCurveTo(8.8, 7, 6, 0.6); c.quadraticCurveTo(0, -3.6, -6, 0.6); c.closePath(); };
const SPINES = (c) => { c.moveTo(-6, 0.6); c.quadraticCurveTo(-11, -1.6, -14.2, -2.6); c.quadraticCurveTo(-10.6, 1.6, -7.4, 4.6); c.quadraticCurveTo(-12, 4, -14.6, 4.2); c.quadraticCurveTo(-11, 7.4, -7.6, 10); c.quadraticCurveTo(-11, 10.4, -12.8, 11.2); c.quadraticCurveTo(-10, 13, -7, 13.6); c.closePath(); };
const SPINE_TIPS = (c) => { c.moveTo(-11.6, -1.6); c.lineTo(-14.2, -2.6); c.lineTo(-12.2, -0.2); c.closePath(); c.moveTo(-12, 4); c.lineTo(-14.6, 4.2); c.lineTo(-12.2, 5.8); c.closePath(); c.moveTo(-10.8, 10.6); c.lineTo(-12.8, 11.2); c.lineTo(-10.8, 12); c.closePath(); };
const WRIST_P = (c) => { c.moveTo(-7.8, 13); c.lineTo(7.8, 13); c.lineTo(8, 17.4); c.lineTo(-8, 17.4); c.closePath(); };
const PAUL_P = (c) => blob(c, [[-8.4, -3.2], [-2, -8], [7.4, -5.8], [9, 2], [3, 7], [-7.4, 5.2]], 0.6);
const FIST_P = (c) => blob(c, [[-6.5, -2], [0, -4], [6.5, -1.5], [7.6, 4], [4, 8.2], [-3, 8.2], [-7, 4]], 0.55);
/** part: 'all' | 'upper' (sleeve, upper arm, pauldron) | 'lower' (forearm, fist, club) */
function clubArm(ctx, p, A, slot, part_ = 'all') {
  const g = clamp(p.glow, 0, 1), ast = A.astC || 1;
  const UP = part_ !== 'lower', LO = part_ !== 'upper';
  ctx.save();
  ctx.translate(slot[0], slot[1]);
  ctx.rotate(-A.cu * DEG);
  if (UP) flat(ctx, SLEEVE_P, C.oliveD, LM);
  // 1) one continuous silhouette for upper arm + forearm (ink first; the fills below cover the elbow seam)
  if (ast !== 1) { ctx.save(); ctx.scale(1, ast); }
  if (UP) silhouette(ctx, UPPER_D);
  if (ast !== 1) ctx.restore();
  ctx.save();
  ctx.translate(0, UPPER * ast);
  ctx.rotate(-A.cf * DEG);
  if (ast !== 1) { ctx.save(); ctx.scale(1, ast); }
  if (LO) {
    cel(ctx, SPINES, C.drag, C.dragD, { lw: LM, k: 0.8 });
    ctx.fillStyle = C.claw; ctx.beginPath(); SPINE_TIPS(ctx); ctx.fill();
    silhouette(ctx, FORE_D);
  }
  if (ast !== 1) ctx.restore();
  ctx.restore();
  // 2) fills: upper arm, then forearm
  if (UP) {
    if (ast !== 1) { ctx.save(); ctx.scale(1, ast); }
    part(ctx, UPPER_D, C.drag, C.dragD, { k: 1.3, hi: C.dragH, hk: 0.35, lw: LW, noInk: true, rc: RIM_D, ra: 0.42, detail: (c) => {
      c.fillStyle = OCC; c.fillRect(-7, -6, 14, 9);
      c.strokeStyle = C.dragS; c.lineWidth = 0.95; c.stroke(PT.scU);
      if (g > 0.02) { c.globalAlpha = g * 0.35; c.fillStyle = C.glow; c.fillRect(-7, -6, 14, 30); c.globalAlpha = 1; }
    } }, 1.1);
    ember(ctx, PT.crU, g);
    if (ast !== 1) ctx.restore();
  }
  if (LO) {
    ctx.save();
    ctx.translate(0, UPPER * ast);
    ctx.rotate(-A.cf * DEG);
    if (ast !== 1) { ctx.save(); ctx.scale(1, ast); }
    part(ctx, FORE_D, C.drag, C.dragD, { k: 1.4, hi: C.dragH, hk: 0.35, lw: LW, noInk: !UP ? false : true, rc: RIM_D, ra: 0.42, detail: (c) => {
      c.strokeStyle = C.dragS; c.lineWidth = 0.95; c.stroke(PT.scF);
      c.strokeStyle = C.dragL; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-5.6, -0.6); c.quadraticCurveTo(-1, 1.6, 4.6, -0.4); c.stroke();   // elbow crease
      if (g > 0.02) { c.globalAlpha = g * 0.35; c.fillStyle = C.glow; c.fillRect(-9, -4, 18, 22); c.globalAlpha = 1; }
    } }, 1.1);
    ember(ctx, PT.crF, g);
    cel(ctx, WRIST_P, C.steel, C.steelD, { k: 0.8, hi: C.steelH, hk: 0.5, lw: 2 });
    ctx.fillStyle = C.steelL; ctx.beginPath(); ctx.arc(-4.4, 15.3, 0.85, 0, TAU); ctx.arc(4.2, 15.3, 0.85, 0, TAU); ctx.fill();
    if (ast !== 1) ctx.restore();
    ctx.translate(0, (FORE + 2.5) * ast);
    const open = p.claw > 0.5 || p.cfree > 0.5 || p.clubBelt;
    if (open) openClaw(ctx, g);
    else {
      if (p.tw > 0.02) {   // twirl: a trailing arc behind the spinning club head
        const ph = Math.PI / 2 - A.cw * DEG, al = clamp(p.tw, 0, 1);
        ctx.lineCap = 'round'; ctx.strokeStyle = '#fffdf6';
        ctx.globalAlpha = al * 0.35; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, CLUB, ph + 0.25, ph + 2.6); ctx.stroke();
        ctx.globalAlpha = al * 0.7; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, CLUB, ph + 0.2, ph + 1.3); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.save(); ctx.rotate(-A.cw * DEG); club(ctx, p.armGlow ? 0 : g); ctx.restore();
      fist(ctx, g);
    }
    ctx.restore();
  }
  // steel pauldron over the shoulder
  if (UP) part(ctx, PAUL_P, C.steel, C.steelD, { k: 1.3, hi: C.steelH, lw: LM, detail: (c) => {
    c.strokeStyle = C.steelD; c.lineWidth = 1; c.beginPath(); c.moveTo(-6.8, 1.6); c.quadraticCurveTo(0, 4.6, 7.6, 1.2); c.stroke();
    c.fillStyle = C.steelL; c.beginPath(); c.arc(1, -1.6, 1.15, 0, TAU); c.arc(-4.6, -1.2, 0.85, 0, TAU); c.arc(5.6, -1.6, 0.85, 0, TAU); c.fill();
    c.strokeStyle = C.steelH; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-3.6, -4.6); c.lineTo(-0.6, -5.6); c.stroke();
  } }, 0);
  ctx.restore();
}
function ember(ctx, path, g) {
  const a = clamp(0.5 + 0.5 * PULSE + 0.5 * g, 0, 1);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = a * 0.3; ctx.strokeStyle = C.glow; ctx.lineWidth = 2.3 + 2.8 * g; ctx.stroke(path);
  ctx.globalAlpha = a; ctx.strokeStyle = g > 0.5 || PULSE > 0.85 ? C.emberC : C.ember; ctx.lineWidth = 0.8 + 0.5 * g; ctx.stroke(path);
  ctx.globalAlpha = 1;
}
function fist(ctx, g) {
  ctx.save(); ctx.scale(1.28, 1.28);
  part(ctx, FIST_P, C.drag, C.dragD, { k: 1.2, hi: C.dragH, hk: 0.35, lw: LW, detail: (c) => {
    c.strokeStyle = C.dragS; c.lineWidth = 0.95; c.stroke(PT.scH);
    c.beginPath(); c.moveTo(2.4, -2.8); c.quadraticCurveTo(4.2, 2, 2.2, 7.6); c.stroke();
  } }, 0);
  ember(ctx, PT.crH, g);
  // black claws curled over the handle
  ctx.fillStyle = C.claw;
  for (const [x, y, a] of CLAWS) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(-1.8, -2.3); ctx.quadraticCurveTo(5.8, -1.6, 6.6, 3.4); ctx.quadraticCurveTo(2.8, 0.9, -1.6, 2.3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.strokeStyle = C.clawH; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -1.1); ctx.quadraticCurveTo(3.6, -0.8, 4.9, 1.2); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
const CLAWS = [[6.4, -0.6, -0.42], [7.6, 3.4, 0.08], [5.8, 7.4, 0.58]];
function openClaw(ctx, g) {
  // palm with four splayed taloned fingers (used while carrying or catching the club)
  ctx.save(); ctx.scale(1.2, 1.2);
  ctx.lineCap = 'round';
  for (const [x, a, L] of [[-4.6, 0.36, 8.5], [-1.6, 0.12, 10], [1.6, -0.1, 10], [4.6, -0.34, 8.5]]) {
    ctx.save(); ctx.translate(x, 4); ctx.rotate(a);
    ctx.strokeStyle = INK; ctx.lineWidth = 5.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, L - 2); ctx.stroke();
    ctx.strokeStyle = C.drag; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.fillStyle = C.claw; ctx.beginPath(); ctx.moveTo(-1.8, L - 2.6); ctx.quadraticCurveTo(-0.6, L + 3.6, 2.2, L + 4.4); ctx.quadraticCurveTo(1.4, L + 0.6, 1.8, L - 2.6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  part(ctx, (c) => blob(c, [[-6.4, -2], [0, -3.6], [6.4, -2], [6.8, 4.6], [0, 7], [-6.8, 4.6]], 0.55), C.drag, C.dragD, { k: 1.2, hi: C.dragH, hk: 0.35, lw: LW }, 0);
  ember(ctx, PT.crH, g);
  ctx.restore();
}
// the club: wood handle with grain and a leather grip wrap, iron collar, spiked iron ball
const HANDLE_P = (c) => { c.moveTo(-2.6, -5); c.lineTo(2.6, -5); c.lineTo(3.2, CLUB - 6); c.lineTo(-3.2, CLUB - 6); c.closePath(); };
const COLLAR_P = (c) => { c.moveTo(-4.4, CLUB - 10); c.lineTo(4.4, CLUB - 10); c.lineTo(4.8, CLUB - 6.5); c.lineTo(-4.8, CLUB - 6.5); c.closePath(); };
const BALL_R = 8.6;
const BALL_P = (c) => {
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU + 0.2, a1 = a0 + TAU / 16, a2 = a0 + TAU / 8;
    c.lineTo(Math.cos(a0) * BALL_R, Math.sin(a0) * BALL_R);
    c.lineTo(Math.cos(a1) * (BALL_R + 6), Math.sin(a1) * (BALL_R + 6));
    c.lineTo(Math.cos(a2) * BALL_R, Math.sin(a2) * BALL_R);
  }
  c.closePath();
};
function club(ctx, g) {
  flat(ctx, HANDLE_P, C.wood, LM);
  ctx.strokeStyle = C.woodL; ctx.lineWidth = 0.8; ctx.stroke(PT.grain);
  ctx.strokeStyle = C.leaL; ctx.lineWidth = 1.5; ctx.lineCap = 'butt'; ctx.stroke(PT.wrap);
  flat(ctx, COLLAR_P, C.iron, 1.9);
  ctx.save(); ctx.translate(0, CLUB);
  part(ctx, BALL_P, C.iron, C.ironD, { k: 1.4, hi: C.ironH, lw: LW, detail: (c) => {
    c.strokeStyle = C.ironD; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, BALL_R - 2.6, 0.2, 2.6); c.stroke();
    c.fillStyle = C.ironD; c.fill(PT.ballRiv);
    c.strokeStyle = C.ironH; c.lineWidth = 0.8; c.stroke(PT.ballScr);
    c.fillStyle = '#d6dce4'; c.beginPath(); c.arc(-3.2, -3.4, 1.5, 0, TAU); c.fill();
  } }, 1.2);
  if (g > 0.55) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = g * (0.5 + 0.3 * PULSE);
    ctx.fillStyle = C.glow; ctx.beginPath(); ctx.arc(0, 0, BALL_R + 3 + 3 * PULSE, 0, TAU); ctx.fill();
    ctx.globalAlpha = g * 0.9; ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(0, 0, BALL_R * 0.75, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
function freeClub(ctx, p, A, slot) {
  const u = rd(A.cu, UPPER), f = rd(A.cu + A.cf, FA);
  ctx.save();
  ctx.translate(slot[0] + u[0] + f[0] + p.cox, slot[1] + u[1] + f[1] + p.coy);
  ctx.rotate(-p.cr * DEG);
  club(ctx, clamp(p.glow, 0, 1));
  ctx.restore();
}
function beltClub(ctx, p, near) {
  ctx.save();
  ctx.translate(near ? -11 : 8, -13);
  ctx.rotate(30 * DEG);
  club(ctx, 0);
  ctx.restore();
  // the leather loop on the belt that holds it
  ctx.save(); ctx.translate(near ? -11 : 8, -13);
  ctx.lineWidth = 4.4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.ellipse(0, 1.5, 3.6, 2.6, 0.5, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2.2; ctx.strokeStyle = C.lea; ctx.stroke();
  ctx.restore();
}

// -------------------------------------------------- the shield arm (torso frame)
const UPPER_S = (c) => capsule(c, UPPER, 10.5, 9.5);
const FORE_S = (c) => capsule(c, FORE, 9.5, 8.5);
const BRACER = (c) => { c.moveTo(-5.9, 2.6); c.lineTo(5.9, 1.8); c.lineTo(5.7, 14.2); c.lineTo(-5.7, 14.2); c.closePath(); };
const HAND_S = (c) => blob(c, [[-4.5, 14], [4.5, 14], [5.6, 19], [1, 22.4], [-4.2, 20.2]], 0.6);
const HAND_OPEN = (c) => blob(c, [[-4.6, 13.6], [4.6, 13.6], [6.6, 19.4], [4.8, 24.4], [1.4, 25.6], [-1.8, 25.4], [-5, 23.6], [-6.4, 19]], 0.5);
const PAUL_S = (c) => blob(c, [[-7, -2.6], [-1.6, -6.6], [6.2, -4.8], [7.4, 1.6], [2.4, 5.6], [-6.2, 4.2]], 0.6);
function shieldArm(ctx, p, A, slot) {
  ctx.save();
  ctx.translate(slot[0], slot[1]);
  ctx.rotate(-A.su * DEG);
  const ast = A.astS || 1;
  if (ast !== 1) { ctx.save(); ctx.scale(1, ast); }
  part(ctx, UPPER_S, C.skin, C.skinD, { k: 1.3, lw: LW, detail: (c) => { c.fillStyle = OCC; c.fillRect(-6, -6, 12, 9); } }, 0);
  if (ast !== 1) ctx.restore();
  flat(ctx, SLEEVE_P, C.olive, LM);
  cel(ctx, PAUL_S, C.steel, C.steelD, { k: 1.2, hi: C.steelH, lw: LM });
  ctx.translate(0, UPPER * ast);
  ctx.rotate(-A.sf * DEG);
  if (ast !== 1) { ctx.save(); ctx.scale(1, ast); }
  part(ctx, FORE_S, C.skin, C.skinD, { k: 1.3, lw: LW }, 0);
  // laced leather bracer with stitched edges
  cel(ctx, BRACER, C.lea, C.leaD, { lw: LM, hi: C.leaH, hk: 0.35, detail: (c) => {
    c.strokeStyle = C.leaL; c.lineWidth = 0.9; c.setLineDash([1.4, 1.6]);
    c.beginPath(); c.moveTo(-4.2, 4.2); c.lineTo(-4.1, 12.8); c.moveTo(4.2, 3.4); c.lineTo(4.1, 12.8); c.stroke(); c.setLineDash([]);
    c.strokeStyle = C.brass; c.lineWidth = 0.9; c.beginPath();
    c.moveTo(-1.6, 4.6); c.lineTo(1.6, 7.4); c.moveTo(1.6, 4.4); c.lineTo(-1.6, 7.4); c.moveTo(-1.6, 8.6); c.lineTo(1.6, 11.4); c.moveTo(1.6, 8.6); c.lineTo(-1.6, 11.4); c.stroke();
  } });
  if (ast !== 1) { ctx.restore(); ctx.translate(0, (FORE + 3) * (ast - 1)); }
  if (p.carry > 0.5) part(ctx, HAND_OPEN, C.skin, C.skinD, { lw: LW, detail: (c) => {   // open palm pushing up under the load
    c.strokeStyle = C.skinO; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-2.4, 21); c.lineTo(-2.2, 24.6); c.moveTo(0.4, 21.4); c.lineTo(0.6, 25); c.moveTo(3, 20.8); c.lineTo(3.4, 24); c.stroke();
  } }, 0);
  else part(ctx, HAND_S, C.skin, C.skinD, { lw: LW, detail: (c) => {
    c.strokeStyle = C.skinO; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-1.6, 16.6); c.lineTo(-1.4, 20); c.moveTo(1.4, 16.4); c.lineTo(1.8, 19.6); c.stroke();
  } }, 0);
  // the round shield strapped to the forearm, kept roughly upright (slung on his back while carrying)
  if (!p.shBack) {
    const absA = A.su + A.sf + p.tor;
    ctx.translate(0, 9 + p.sp);
    ctx.rotate(absA * 0.75 * DEG);
    if (F < 0 && A.su > 28) ctx.translate(0, Math.min(1, (A.su - 28) / 30) * 8);   // facing left: keep the rim under his mouth
    shield(ctx, A.st ?? p.st);
  }
  ctx.restore();
}
function backShield(ctx) { ctx.save(); ctx.translate(-21, -27); ctx.rotate(-10 * DEG); shield(ctx, 0.58); ctx.restore(); }
function shield(ctx, turn) {
  const R = 19.5, tn = clamp(turn, 0, 1), sx = 1 - 0.72 * tn;
  ctx.save();
  ctx.translate(4 + 3 * tn, 0);
  if (tn > 0.2) cel(ctx, (c) => ellipse(c, -2.5 * tn, 0, R * sx + 1, R), C.shRimD, C.shRimD, { lw: LM });
  ctx.save();
  ctx.scale(sx, 1);
  const lw = LW / Math.max(0.45, sx) * 0.8;
  part(ctx, (c) => circle(c, 0, 0, R), C.shRim, C.shRimD, { k: 1.3, hi: C.shRimH, lw, detail: (c) => { c.fillStyle = C.ironD; c.fill(PT.shRiv); } }, 1.2);
  cel(ctx, (c) => circle(c, 0, 0, R - 3.6), C.shW, C.shWD, { k: 1.6, lw: 0, detail: (c) => {
    c.strokeStyle = C.shWD; c.lineWidth = 1.1; c.stroke(PT.planks);
    c.strokeStyle = C.shWL; c.lineWidth = 0.7; c.stroke(PT.sgrain);
    // red dragon emblem: a horned dragon head over a coiled neck
    c.fillStyle = C.emblem; c.strokeStyle = C.emblemD; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-8, 7); c.quadraticCurveTo(-10, -4, -2, -8); c.lineTo(1, -12.4); c.lineTo(2, -7.5); c.lineTo(8.2, -8.6);
    c.lineTo(5, -4.5); c.lineTo(9.8, -1); c.lineTo(3.5, -0.5); c.quadraticCurveTo(-2, 0, -2.5, 5); c.quadraticCurveTo(0, 9, 6, 7);
    c.quadraticCurveTo(1, 12, -8, 7); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffd36a'; c.beginPath(); c.arc(2.5, -5, 1, 0, TAU); c.fill();
    c.strokeStyle = '#d7a46c'; c.lineWidth = 0.9; c.stroke(PT.shScr);
    c.fillStyle = OCC; c.beginPath(); c.arc(0, 0, R - 3.6, 0.1, 1.9); c.arc(0, 0, R - 6, 1.9, 0.1, true); c.fill();
  } });
  ctx.lineWidth = 1.5 / Math.max(0.45, sx); ctx.strokeStyle = C.shWL;
  ctx.beginPath(); ctx.arc(0, 0, R - 3.6, 0, TAU); ctx.stroke();
  ctx.restore();
  strapTail(ctx, -R * 0.42 * sx, R * 0.5);
  ctx.restore();
}
// a loose leather strap end hanging from the shield's lower edge: plumb on screen, swinging with the motion
function strapTail(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c;
  if (det) {
    const sw = M.strap * DEG, sx = -Math.sin(sw) * F, sy = Math.cos(sw);
    let lx = (m.d * sx - m.c * sy) / det, ly = (-m.b * sx + m.a * sy) / det;
    const L = Math.hypot(lx, ly) || 1; lx /= L; ly /= L;
    const len = 6, ex = lx * len, ey = ly * len, cx = lx * len * 0.5 - ly * 1.4, cy = ly * len * 0.5 + lx * 1.4;
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.strokeStyle = INK; ctx.lineWidth = 4.6; ctx.stroke();
    ctx.strokeStyle = C.leaD; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.strokeStyle = C.lea; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}

// shield bash: an impact crescent ahead of the shield and speed lines trailing it
function bashFx(ctx, p, A, slot) {
  const k = A.astS || 1, a = rd(A.su, UPPER * k), b = rd(A.su + A.sf, (9 + p.sp) * k);
  const al = clamp(p.bsm, 0, 1);
  ctx.save();
  ctx.translate(slot[0] + a[0] + b[0] + 16, slot[1] + a[1] + b[1]);
  ctx.globalAlpha = al * 0.85; ctx.fillStyle = '#fffdf6';
  ctx.beginPath(); ctx.arc(-6, 0, 25, -1.05, 1.05); ctx.arc(-13, 0, 21, 1.0, -1.0, true); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = al * 0.55; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const dy of [-15, -3, 9, 19]) { ctx.moveTo(-36, dy); ctx.lineTo(-58 + Math.abs(dy) * 0.6, dy); }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// motion smear: a crescent swept by the club head (in the club arm's shoulder frame); no gradients
function smear(ctx, p, slot) {
  const a0 = p.sa0, a1 = p.sa1, R = p.sr + 6, n = 16, al = clamp(p.smear, 0, 1), hot = p.glow > 0.3;
  ctx.save();
  ctx.translate(slot[0], slot[1]);
  const band = (w0, w1, pw) => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * (i / n)) * DEG; i ? ctx.lineTo(Math.sin(a) * R, Math.cos(a) * R) : ctx.moveTo(Math.sin(a) * R, Math.cos(a) * R); }
    for (let i = n; i >= 0; i--) { const u = i / n, a = (a0 + (a1 - a0) * u) * DEG, r = R - (w0 + w1 * Math.pow(u, pw)); ctx.lineTo(Math.sin(a) * r, Math.cos(a) * r); }
    ctx.closePath();
  };
  band(1.5, 17, 1.3); ctx.globalAlpha = al * 0.42; ctx.fillStyle = hot ? '#ffb347' : '#ffffff'; ctx.fill();
  band(0.8, 8, 2.2); ctx.globalAlpha = al * 0.9; ctx.fillStyle = hot ? '#fff0b0' : '#fffdf6'; ctx.fill();
  ctx.globalAlpha = al * 0.6; ctx.strokeStyle = hot ? '#ff9a3a' : '#e8eef5'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const rr of [R - 21, R - 25]) {
    const s0 = a0 + (a1 - a0) * 0.45, s1 = a1 - (a1 - a0) * 0.04;
    for (let i = 0; i <= 8; i++) { const a = (s0 + (s1 - s0) * i / 8) * DEG; i ? ctx.lineTo(Math.sin(a) * rr, Math.cos(a) * rr) : ctx.moveTo(Math.sin(a) * rr, Math.cos(a) * rr); }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}
