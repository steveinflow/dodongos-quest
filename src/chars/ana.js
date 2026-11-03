// Anastasia ("Ana"): the wizard hero.  Art (drawn in code after the book's character sheet and panels) + her pose
// library.
//
// A 10-year-old girl wizard, Dodongo's height (her floppy hat adds ~25 px): long dark-brown curly hair, brown eyes,
// light-brown skin; a tall floppy indigo pointed hat with a brown band and a brass buckle, the tip flopping over;
// a teal hooded cloak with gold trim, bell sleeves and a gold star clasp, over an indigo tunic (gold hem) with a
// brown belt and brass buckle; dark plum leggings; brown cuffed boots.  ONE gnarled wooden staff, roots twisting
// round the top and cradling a glowing blue crystal.  The planner: clever, brave, a little bossy, warm.
//
// Local space as for the other characters: origin on the floor under the hips, +x = facing, y down; limb angles in
// degrees, + = swung forward.  Facing left is a plain mirror (the staff stays in the near hand, so it never hides
// behind her body).
//
// The staff is posed by its own placement and the arms reach it with 2-bone IK, so hands never come off it:
//   held 'grip': the staff hand grips at (gx, gy) (hip frame) with the shaft at angle sa (0 = crystal up, 90 =
//     forward, 180 = down); sg = grip distance from the butt; sk = projected length (1 = flat to the screen, < 0 =
//     swung round to point away, for horizontal swipes); plant 0..1 plants the butt on the floor at px (pl = butt
//     lift); two 0..1 = the free hand grips too at sg2 along the shaft (it slides along the shaft to reach).  A grip
//     out of reach pulls the staff in; grounded, the crystal and the butt never go through the floor.
//   held 'hand': the staff hand by FK (au, af), the shaft at sa through the fist.
//   held 'back': slung across her back (carrying); both arms by FK.
// FK arm angles (au/af = near/staff arm, bu/bf = far/free arm) are relative to the torso.  bh / nh: free hand shape
// ('open' | 'fist' | 'point' | 'cast').  farLate: draw the free arm in front of her head.
// ah 0..1 blends the ground-solved hip height with the fixed `air` one (AIR_HIP - y), so poses can cross over.
// Secondary motion (o.mem + o.vel, plus the pose's own head motion): hat tip, hair, cloak hem + billow, hood and
// sleeves lag, overshoot and settle; pose fields wind (blown back 0..1), lift (billow up 0..1) and spin (deg, a
// cut-out turn) drive them in pose sheets too.  glow 0..1 = crystal brightness (cached glow sprite + bright
// facets), charge = motes spiralling in, spark = star glints.  Faces: calm grin happy yell focus ouch ko surprised
// worried smug wink; o.talk flaps the mouth; she blinks by herself.
import { cel, flat, ink, capsule, blob, ellipse, keys, mix, DEG, TAU, legDrop, clamp, lerp, follow } from '../rig.js';
import { INK } from '../config.js';

const C = {
  skin: '#d9a17b', skinD: '#b47853', skinH: '#f2c7a3', skinO: '#8f5a3b', blush: '#ec7f6c', skinF: '#c48b66', skinFD: '#9a6545',
  hair: '#5c3622', hairD: '#3d2215', hairH: '#8f5c37', hairL: '#2b170d',
  hat: '#4f52a0', hatD: '#363872', hatH: '#7b7fca', hatL: '#2b2d5e', hatU: '#25264f',
  band: '#7e4b2a', bandD: '#54311b',
  brass: '#e6b74f', brassD: '#a07728', brassH: '#fff3bf',
  cloak: '#3a8b84', cloakD: '#286159', cloakH: '#62b8ad', cloakIn: '#1f4a46', cloakL: '#23564f',
  gold: '#e3b950', goldD: '#a17a2b',
  tunic: '#4d4d9c', tunicD: '#35356f', tunicL: '#29295a',
  belt: '#83522d', beltD: '#57341c',
  leg: '#4d3248', legD: '#33202f', legF: '#3d2739', legFD: '#281826',
  boot: '#905933', bootD: '#5f381d', bootH: '#b67c49', bootF: '#7a4a2a', bootFD: '#4a2b16',
  cuff: '#a56c3d', cuffD: '#6f4423', cuffF: '#8a5732', sole: '#3a2418',
  wood: '#8d5b34', woodD: '#5d3a20', woodH: '#bb8753', woodL: '#47291a',
  crys: '#8ad8ff', crysD: '#3c86d6', crysM: '#5fb4f2', crysH: '#eefcff', crysB: '#c9f3ff',
  eye: '#6c3f1d', eyeD: '#2c1607', eyeL: '#b0773f', brow: '#2f1a10', mouth: '#7c2b33', tongue: '#e3747a', eyeW: '#ece2d6',
  rim: '#d9dcff',
};

// ---------------------------------------------------------------- skeleton (px at scale 1)
const THIGH = 24, SHIN = 22, FOOT = 6;
const UPPER = 16, FORE = 17;                 // FORE = elbow to the centre of the fist
const REACH = UPPER + FORE - 0.6;
const HIP_NEAR = [-2, 0], HIP_FAR = [4, -1];
const SH_NEAR = [-5, -30], SH_FAR = [7, -31];
const NECK = [2, -35];
const HEADC = [3, -20];                       // head centre from the neck joint
const STAFF = 116, CRYS = 23, SL = STAFF + CRYS, CRYC = STAFF + 10;
const AIR_HIP = 51;                           // hip height of `air` poses (pose.y offsets it)
// the whole rig is drawn 9% up so she stands as tall as Dodongo and Shadow (~140 px without the hat); all pose
// numbers below are in rig units, measurements are exported in screen px
export const ART = 1.09;
// px of ground per gait cycle (the engine advances ph by |v| / stride, so the planted foot never slides)
export const WALK_STRIDE = 75, RUN_STRIDE = 120, CARRY_STRIDE = 75;
const WALK_ST = WALK_STRIDE / ART * 0.52 / 2, RUN_ST = RUN_STRIDE / ART * 0.34 / 2, CARRY_ST = CARRY_STRIDE / ART * 0.54 / 2;
const HS = 1.08;                              // head (+ hair + hat) scale round the head centre
// where a carried object's bottom-centre sits (screen px, facing right): clear above her squashed hat; both hands
// are IK'd (with a cartoon arm stretch) to the load's sides
export const CARRY_POINT = [10, -158];

// ---------------------------------------------------------------- poses
export const BASE = {
  x: 0, y: 0, rot: 0, tor: 4, head: 0, sq: 1, air: false, ah: 0, spin: 0,
  nt: -6, ns: -10, nf: 0, ft: 12, fs: -14, ff: 0,
  held: 'grip', sa: 38, gx: 18, gy: -16, sg: 58, sk: 1, plant: 0, px: 5, pl: 0, two: 1, sg2: 36, eb: 1, eb2: 1, sb: 0,
  au: 10, af: 30, bu: 10, bf: 22, nh: 'fist', bh: 'open', farLate: 0,
  glow: 0.35, charge: 0, spark: 0, smear: 0, sa0: 0, sa1: 0, sr: 80, scx: 0, scy: -30, sfl: 1, ln: 0,
  wind: 0, lift: 0, hatTilt: 0, hatLift: 0, hatSq: 1,
  carry: 0, tumble: 0, fid: 0, reach: 1,
  face: 'calm', look: 0, blink: true,
};
/** pose from overrides; ah follows air unless given */
const P = (o) => { const p = Object.assign({}, BASE, o); if (o.ah === undefined) p.ah = p.air ? 1 : 0; return p; };

// ------------------------------------------------- gait helpers (walk / run legs are solved from foot paths)
let LA = 0, LS = 0;
/** thigh angle LA + knee bend LS (deg, knee forward) that put the ankle at (x, y) from the hip joint */
function legIK(x, y) {
  const d = clamp(Math.hypot(x, y), 4, THIGH + SHIN - 0.02);
  const phi = Math.atan2(x, y);
  const a = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const b = Math.acos(clamp((SHIN * SHIN + d * d - THIGH * THIGH) / (2 * SHIN * d), -1, 1));
  LA = (phi + a) / DEG; LS = (phi - b) / DEG - LA;
}
let FX = 0, FL = 0, FA = 0;
/** one foot's path over a cycle: planted from +st to -st for `duty` (moving back at exactly the body's speed), then
 *  a lifted swing forward with toe-off and heel strike */
function footPath(ph, st, lift, duty) {
  ph = ph - Math.floor(ph);
  if (ph < duty) {
    const u = ph / duty;
    FX = st * (1 - 2 * u); FL = 0; FA = u > 0.78 ? -16 * (u - 0.78) / 0.22 : 0;
  } else {
    // Hermite swing: leaves and meets the floor moving back at the ground speed (no skid at toe-off / heel strike)
    const u = (ph - duty) / (1 - duty), u2 = u * u, u3 = u2 * u, m = -2 * st * (1 - duty) / duty;
    FX = (2 * u3 - 3 * u2 + 1) * -st + (u3 - 2 * u2 + u) * m + (-2 * u3 + 3 * u2) * st + (u3 - u2) * m;
    FL = lift * Math.pow(Math.sin(Math.PI * u), 0.8);
    FA = u < 0.3 ? -16 - 12 * Math.sin(u / 0.3 * Math.PI) : u > 0.72 ? 12 * (u - 0.72) / 0.28 : -16 * (0.72 - u) / 0.42;
  }
}
/** solve both legs for a gait cycle at hip height H; returns the near foot's forwardness (-1..1) */
function gait(p, ph, st, lift, duty, H) {
  footPath(ph, st, lift, duty);
  const xn = FX, ln = FL; p.nf = FA;
  legIK(xn, H - FOOT - ln - HIP_NEAR[1]); p.nt = LA; p.ns = LS;   // each stride centred under its own hip
  footPath(ph + 0.5, st, lift, duty);
  const lf = FL; p.ff = FA;
  legIK(FX, H - FOOT - lf - HIP_FAR[1]); p.ft = LA; p.fs = LS;
  p.y = -Math.min(ln, lf);        // both feet up = airborne: lift the body so the hip stays at H
  return xn / st;
}

// ---- idle fidget: twirl the staff once, catch it with a sparkle and a smug look (u 0..1 over FID_LEN s)
const FID_LEN = 1.1;
function fidget(p, u) {
  const s = u < 0.75 ? u / 0.75 : 1, e = s * s * (3 - 2 * s), arc = Math.sin(Math.PI * s);
  p.fid = 0;
  p.two = u < 0.05 || u > 0.86 ? 1 : 0;
  p.sg = 58 + 12 * arc; p.gy = -16 + 4 * arc; p.gx = 18 + 8 * arc;
  p.sa = 40 + 360 * e; p.bu = 34; p.bf = -100; p.bh = 'fist';
  p.face = u > 0.7 ? 'smug' : 'grin';
  p.spark = u > 0.72 ? Math.sin((u - 0.72) / 0.28 * Math.PI) : 0;
  p.glow = 0.35 + p.spark * 0.4;
  return p;
}

// ---- stances
// fighting guard: both hands on the staff, crystal up ahead of her face at brim height
const GUARD = { held: 'grip', gx: 18, gy: -16, sa: 40, sg: 58, sk: 1, two: 1, sg2: 74, plant: 0, sb: 0 };
const IDLE0 = P({ ...GUARD });
// book stance for cutscenes: staff planted at her near side, crystal by the back of her hat, free hand loose
const BOOK = { held: 'grip', plant: 1, px: -8, sa: -3, sg: 56, two: 0, gx: -10, gy: -10, bu: 8, bf: 18, sb: 0 };
// carrying: staff slung on her back, both hands IK'd up to the load's sides (CARRY_POINT), hat squashed under it
const CARRY = { held: 'back', carry: 1, au: 170, af: -10, bu: 166, bf: -10, nh: 'open', bh: 'open', farLate: 0,
  hatSq: 0.55, hatTilt: -10, glow: 0.25 };
// staff raised in the near hand, tipped forward so the arm goes up in front of the brim (victory / cheer / starfall)
const ALOFT = { held: 'grip', gx: -14, gy: -70, sa: 8, sg: 52, two: 0, sb: 1, eb: -1, reach: 1.3 };

export const ANIM = {
  idle(t) {
    const b = Math.sin(t * 2.6), w = Math.sin(t * 0.83);
    const p = P({ ...GUARD, tor: 3 + b * 1.1, head: -b * 1.2 + w * 1.2, nt: -8 + w * 2, ns: -12 - b * 2.4,
      ft: 14 - w * 2, fs: -16 - b * 2.4, gy: -16 + b * 0.9, sa: 40 + b * 1.2 });
    // fidget every ~5.5 s: a showy one-hand twirl of the staff (applied by draw(), and only once o.idleT says she
    // has been standing still for 1.5 s, so it never starts mid-spin straight out of a combo)
    const tt = t % 5.5;
    if (tt > 4.2 && tt < 4.2 + FID_LEN) p.fid = Math.max(1e-4, (tt - 4.2) / FID_LEN);
    return p;
  },
  walk(ph) {
    const p = P({ ...GUARD, tor: 7, two: 0, sg: 50, face: 'calm', bh: 'open' });
    const bob = Math.cos((ph - 0.26) * 2 * TAU);
    const sw = gait(p, ph, WALK_ST, 7, 0.52, 46.6 + 1.0 * bob);
    p.gx = 15 - 3 * sw; p.gy = -12 + 1.5 * bob; p.sa = 50 - 4 * sw;
    p.bu = 8 + 24 * sw; p.bf = 22 + 18 * Math.max(0, sw);
    p.head = 1 - 1.6 * bob;
    return p;
  },
  run(ph) {
    const p = P({ ...GUARD, tor: 17, two: 0, sg: 58, face: 'grin', bh: 'fist', glow: 0.45 });
    const c2 = Math.cos((ph - 0.42) * 2 * TAU);
    const sw = gait(p, ph, RUN_ST, 15, 0.34, 43.2 + 2 * c2);
    p.gx = 15 - 6 * sw; p.gy = -9 - 2 * c2; p.sa = 76 - 7 * sw;
    p.bu = 10 + 50 * sw; p.bf = 72 + 26 * Math.max(0, -sw);
    p.head = -10 + 2 * c2; p.tor = 17 - 1.5 * c2;
    return p;
  },
  squat: P({ ...GUARD, tor: 20, head: 4, nt: 36, ns: -74, ft: 46, fs: -70, sq: 0.92, gx: 20, gy: -2, sa: 56, face: 'focus' }),
  rise: P({ ...GUARD, air: true, y: -2, tor: 4, head: -10, nt: 70, ns: -112, ft: 34, fs: -84, nf: 18, ff: -8,
    gx: 18, gy: -28, sa: 42, sg: 52, two: 0, bu: 140, bf: 26, bh: 'fist', face: 'grin', glow: 0.5, lift: 0.3 }),
  fall: P({ ...GUARD, air: true, y: 0, tor: 2, head: 4, nt: 20, ns: -22, ft: -16, fs: -30, nf: -8, ff: -16,
    gx: 20, gy: -16, sa: 56, sg: 52, two: 0, bu: 84, bf: 18, bh: 'open', face: 'calm', lift: 0.6 }),
  land: P({ ...GUARD, tor: 16, head: 4, nt: 30, ns: -66, ft: 42, fs: -62, sq: 0.88, gx: 20, gy: -4, sa: 54, face: 'focus' }),

  // --- the ground combo -------------------------------------------------------------------------------------------
  // 1 (18f, contact .30): a flat staff swipe -- the staff swings round through depth (sk < 0 = pointing away)
  // 1 (18f, contact .30): a diagonal chop -- from over her back shoulder the crystal comes down through the enemy
  atk1: (k) => keys(k, [
    [0, P({ ...GUARD, tor: -8, head: -4, gx: -10, gy: -42, sa: -20, sk: 1, sg: 48, two: 0, sb: 1, eb: -1, bu: 60, bf: 20,
      nt: -14, ns: -10, ft: 20, fs: -22, face: 'yell', glow: 0.45 })],
    [0.16, P({ ...GUARD, x: -2, tor: -14, head: -6, gx: -14, gy: -44, sa: -34, sk: 1, sg: 48, two: 0, sb: 1, eb: -1, bu: 76, bf: 10,
      nt: -16, ns: -12, ft: 24, fs: -28, face: 'yell', glow: 0.5 })],
    [0.30, P({ ...GUARD, x: 8, tor: 18, head: -2, gx: 22, gy: -20, sa: 120, sk: 1, sg: 48, two: 0, bu: -28, bf: 40, bh: 'fist',
      nt: -28, ns: -6, ft: 36, fs: -40, face: 'yell', glow: 0.75, smear: 1, sa0: -36, sa1: 124, sr: 86, scx: 22, scy: -44, sfl: 1 }), 'snap'],
    [0.50, P({ ...GUARD, x: 8, tor: 20, head: -1, gx: 23, gy: -18, sa: 124, sk: 1, sg: 48, two: 0, bu: -30, bf: 44, bh: 'fist',
      nt: -28, ns: -6, ft: 36, fs: -40, face: 'yell', glow: 0.55, smear: 0.35, sa0: 60, sa1: 128, sr: 86, scx: 22, scy: -44, sfl: 1 })],
    [1, IDLE0],
  ]),
  // 2 (20f, contact .30): the backswing -- from low in front the crystal rips up through the enemy and over her
  // shoulder (behind her head on the follow-through)
  atk2: (k) => keys(k, [
    [0, P({ ...GUARD, x: 7, tor: 20, head: 0, gx: 23, gy: -16, sa: 124, sk: 1, sg: 46, two: 0, bu: -30, bf: 44, bh: 'fist',
      nt: -26, ns: -6, ft: 34, fs: -38, face: 'yell', glow: 0.5 })],
    [0.14, P({ ...GUARD, x: 4, tor: 26, head: 6, gx: 22, gy: -6, sa: 150, sk: 1, sg: 44, two: 1, sg2: 62,
      nt: -22, ns: -26, ft: 36, fs: -48, face: 'yell', glow: 0.55, sq: 0.97 })],
    [0.30, P({ ...GUARD, x: 10, tor: -4, head: -8, gx: 16, gy: -36, sa: 48, sk: 1, sg: 44, two: 1, sg2: 62,
      nt: -18, ns: -4, ft: 22, fs: -14, nf: -8, face: 'yell', glow: 0.8, smear: 1, sa0: 150, sa1: 46, sr: 92, scx: 6, scy: -32 }), 'snap'],
    [0.55, P({ ...GUARD, x: 10, tor: -8, head: -6, gx: -12, gy: -47, sa: -48, sk: 1, sg: 40, two: 0, sb: 1, eb: -1, eb2: -1, bu: 40, bf: 30,
      nt: -18, ns: -4, ft: 22, fs: -14, nf: -8, face: 'grin', glow: 0.6, smear: 0.4, sa0: 60, sa1: -30, sr: 92, scx: 6, scy: -32 })],
    [1, IDLE0],
  ]),
  // 3 (22f, contact .35): a lunging two-hand jab, low and forward -- the crystal drives in at knee-to-hip height
  atk3: (k) => keys(k, [
    [0, P({ ...GUARD, x: 9, tor: -8, head: -6, gx: -12, gy: -47, sa: -48, sg: 40, two: 0, sb: 1, eb: -1, eb2: -1, bu: 40, bf: 30,
      nt: -18, ns: -6, ft: 22, fs: -16, face: 'grin', glow: 0.55 })],
    [0.12, P({ ...GUARD, x: 1, tor: -4, head: -2, gx: 0, gy: -14, sa: 120, sg: 62, two: 1, sg2: 84,
      nt: -16, ns: -18, ft: 24, fs: -32, face: 'focus', glow: 0.7 })],
    [0.24, P({ ...GUARD, x: -4, tor: -8, head: -2, gx: -8, gy: -10, sa: 118, sg: 62, two: 1, sg2: 84,
      nt: -20, ns: -26, ft: 26, fs: -40, sq: 0.97, face: 'focus', glow: 0.9, charge: 0.6 })],
    [0.35, P({ ...GUARD, x: 24, tor: 36, head: -16, gx: 26, gy: -8, sa: 101, sg: 62, two: 1, sg2: 84,
      nt: -46, ns: -14, ft: 58, fs: -90, face: 'yell', glow: 1, ln: 1 }), 'snap'],
    [0.62, P({ ...GUARD, x: 20, tor: 32, head: -13, gx: 25, gy: -9, sa: 102, sg: 62, two: 1, sg2: 84,
      nt: -42, ns: -12, ft: 54, fs: -84, face: 'yell', glow: 0.8, ln: 0.25 })],
    [1, IDLE0],
  ]),
  // 4 (36f, contact .50): spin, hop, overhead slam -- the crystal strikes the floor (engine shockwave)
  atk4: (k) => {
    const p = keys(k, [
      [0, P({ ...GUARD, x: 18, tor: 30, head: -12, gx: 24, gy: -8, sa: 102, sg: 62, two: 1, sg2: 84,
        nt: -40, ns: -12, ft: 52, fs: -82, face: 'yell', glow: 0.7 })],
      [0.10, P({ ...GUARD, x: 4, tor: 10, head: 2, gx: 4, gy: -10, sa: 92, sg: 64, two: 1, sg2: 88,
        nt: -10, ns: -42, ft: 30, fs: -52, sq: 0.96, face: 'yell', glow: 0.7 })],
      [0.18, P({ ...GUARD, x: 4, y: -3, tor: 2, head: -12, spin: 110, gx: 8, gy: -44, sa: 90, sg: 64, two: 1, sg2: 88, eb: -1, eb2: -1,
        nt: -4, ns: -10, ft: 10, fs: -14, nf: -10, face: 'yell', glow: 0.8, lift: 0.9, wind: 0.3,
        smear: 1, sa0: 120, sa1: 300, sr: 66, scx: 0, scy: -46, sfl: 0.26 })],
      [0.26, P({ ...GUARD, x: 4, y: -4, tor: 0, head: -12, spin: 260, gx: 8, gy: -46, sa: 88, sg: 64, two: 1, sg2: 88, eb: -1, eb2: -1,
        nt: -4, ns: -10, ft: 10, fs: -14, nf: -10, face: 'yell', glow: 0.9, lift: 1, wind: 0.3,
        smear: 1, sa0: 280, sa1: 460, sr: 66, scx: 0, scy: -48, sfl: 0.26 })],
      [0.33, P({ ...GUARD, x: 6, y: -7, tor: -12, head: -10, spin: 360, gx: -12, gy: -56, sa: -36, sg: 30, two: 1, sg2: 46, sb: 1, eb: -1, eb2: -1,
        nt: -2, ns: -6, ft: 8, fs: -10, nf: -22, ff: -22, face: 'yell', glow: 0.9, lift: 0.6 })],
      [0.43, P({ ...GUARD, x: 7, y: -9, tor: -17, head: -13, gx: -20, gy: -55, sa: -60, sg: 30, two: 1, sg2: 46, sb: 1, eb: -1, eb2: -1,
        nt: -2, ns: -6, ft: 8, fs: -10, nf: -24, ff: -24, face: 'yell', glow: 1, lift: 0.4, spark: 0.6 })],
      [0.50, P({ ...GUARD, x: 12, tor: 26, head: -8, gx: 22, gy: -2, sa: 132, sg: 58, two: 1, sg2: 76,
        nt: -30, ns: -30, ft: 54, fs: -84, sq: 0.9, face: 'yell', glow: 1,
        smear: 1, sa0: -40, sa1: 122, sr: 84, scx: 4, scy: -30 }), 'in'],
      [0.74, P({ ...GUARD, x: 12, tor: 24, head: -8, gx: 22, gy: -2, sa: 130, sg: 58, two: 1, sg2: 76,
        nt: -30, ns: -30, ft: 54, fs: -84, face: 'yell', glow: 0.9, smear: 0.2, sa0: 40, sa1: 122, sr: 84, scx: 4, scy: -30 })],
      [1, IDLE0],
    ]);
    if (p.spin >= 359.5) p.spin = 0;
    return p;
  },
  // jump attack (16f to contact at k = .78 of the ramp, then held): overhead air smash
  // jump attack (engine k = frames / 16, strike from frame 4): cocked 0-.12, contact snap .28, overshoot .5, held
  airAtk: (k) => keys(k, [
    [0, P({ ...GUARD, air: true, tor: -8, head: -8, gx: -12, gy: -56, sa: -40, sg: 30, two: 1, sg2: 46, sb: 1, eb: -1, eb2: -1,
      nt: 64, ns: -110, ft: 36, fs: -84, nf: 10, face: 'yell', glow: 0.6, lift: 0.7 })],
    [0.12, P({ ...GUARD, air: true, tor: -14, head: -12, gx: -19, gy: -55, sa: -66, sg: 30, two: 1, sg2: 46, sb: 1, eb: -1, eb2: -1,
      nt: 70, ns: -116, ft: 40, fs: -90, nf: 12, face: 'yell', glow: 0.8, lift: 0.8 })],
    [0.28, P({ ...GUARD, air: true, tor: 28, head: -6, gx: 24, gy: -16, sa: 122, sg: 30, two: 1, sg2: 46,
      nt: 44, ns: -70, ft: -4, fs: -50, nf: -10, ff: -24, face: 'yell', glow: 1, lift: 0.9,
      smear: 1, sa0: -60, sa1: 122, sr: 98, scx: 4, scy: -34 }), 'snap'],
    [0.5, P({ ...GUARD, air: true, tor: 32, head: -5, gx: 25, gy: -15, sa: 128, sg: 30, two: 1, sg2: 46,
      nt: 42, ns: -66, ft: -4, fs: -48, nf: -10, ff: -24, face: 'yell', glow: 0.9, lift: 0.9, smear: 0.3, sa0: 60, sa1: 128, sr: 98, scx: 4, scy: -34 })],
    [1, P({ ...GUARD, air: true, tor: 24, head: -4, gx: 24, gy: -16, sa: 115, sg: 30, two: 1, sg2: 46,
      nt: 40, ns: -64, ft: -4, fs: -46, nf: -10, ff: -24, face: 'yell', glow: 0.8, lift: 0.8 })],
  ]),
  // dash attack (30f): a low "broom slide" -- feet first along the floor, leaning back, the staff swept out behind
  // her low like a broom (crystal trailing near the floor); snaps into the slide by .12, rides it to .68
  runAtk: (k) => keys(k, [
    [0, P({ ...GUARD, tor: 24, head: -4, gx: 6, gy: -8, sa: 150, sg: 60, two: 1, sg2: 84,
      nt: -20, ns: -40, ft: 40, fs: -60, face: 'yell', glow: 0.6, wind: 0.6 })],
    [0.12, P({ ...GUARD, y: 4, tor: -26, head: 8, gx: -18, gy: -2, sa: -116, sg: 36, two: 1, sg2: 56, eb: -1,
      nt: 80, ns: -4, nf: 10, ft: 34, fs: -120, ff: -30, face: 'yell', glow: 0.8, wind: 1 }), 'snap'],
    [0.68, P({ ...GUARD, y: 4, tor: -28, head: 9, gx: -19, gy: -1, sa: -114, sg: 36, two: 1, sg2: 56, eb: -1,
      nt: 82, ns: -4, nf: 10, ft: 34, fs: -122, ff: -30, face: 'yell', glow: 0.7, wind: 0.9 })],
    [0.84, P({ ...GUARD, tor: 16, head: 2, gx: 18, gy: -4, sa: 60, sg: 62, two: 1, sg2: 84,
      nt: 24, ns: -66, ft: 40, fs: -74, face: 'focus', glow: 0.5, wind: 0.3 })],
    [1, IDLE0],
  ]),
  // CRYSTAL BEAM (64f): charge 0-.40 (staff levelled, braced, crystal blazing), fire .40-.88 (the engine draws the
  // beam from SHOOT_ORIGIN; the staff stays put while she leans into the recoil), recover .88-1
  shoot: (k) => {
    const p = keys(k, [
      [0, P({ ...GUARD, tor: 2, gx: 18, gy: -16, sa: 70, sg: 62, two: 0, face: 'focus', glow: 0.45 })],
      [0.10, P({ ...GUARD, tor: 18, head: -4, gx: 14, gy: -20, sa: 90, sg: 60, two: 1, sg2: 84,
        nt: -30, ns: -4, ft: 36, fs: -12, face: 'focus', glow: 0.75, charge: 0.6, wind: 0.3, lift: 0.4 })],
      [0.38, P({ ...GUARD, tor: 22, head: -5, gx: 14, gy: -20, sa: 90, sg: 60, two: 1, sg2: 84,
        nt: -34, ns: -4, ft: 40, fs: -14, face: 'focus', glow: 1, charge: 1, wind: 0.5, lift: 0.6, spark: 0.6 })],
      [0.40, P({ ...GUARD, tor: 22, head: -5, gx: 14, gy: -20, sa: 90, sg: 60, two: 1, sg2: 84,
        nt: -34, ns: -4, ft: 40, fs: -14, sq: 0.97, face: 'yell', glow: 1, wind: 1, lift: 0.3 }), 'snap'],
      [0.44, P({ ...GUARD, x: -6, tor: 6, head: -9, gx: 20, gy: -20, sa: 90, sg: 60, two: 1, sg2: 84,
        nt: -34, ns: -4, ft: 40, fs: -14, hatTilt: -12, face: 'yell', glow: 1, wind: 1 }), 'snap'],
      [0.52, P({ ...GUARD, tor: 22, head: -5, gx: 14, gy: -20, sa: 90, sg: 60, two: 1, sg2: 84,
        nt: -34, ns: -4, ft: 40, fs: -14, hatTilt: -3, face: 'yell', glow: 1, wind: 1 })],
      [0.86, P({ ...GUARD, tor: 21, head: -5, gx: 14, gy: -20, sa: 90, sg: 60, two: 1, sg2: 84,
        nt: -34, ns: -4, ft: 40, fs: -14, face: 'yell', glow: 1, wind: 1 })],
      [0.94, P({ ...GUARD, tor: 4, head: 0, gx: 18, gy: -16, sa: 64, sg: 58, two: 1, sg2: 80,
        nt: -14, ns: -14, ft: 20, fs: -24, face: 'calm', glow: 0.5, wind: 0.2 })],
      [1, IDLE0],
    ]);
    if (k > 0.1 && k < 0.4) p.x = Math.sin(k * 260) * 0.6 * (k / 0.4);       // straining tremble
    if (k >= 0.52 && k < 0.88) p.tor += Math.sin(k * 300) * 1.2;             // the beam shudders through her (staff stays put)
    return p;
  },
  // STARFALL (72f): crouch and gather 0-.14, thrust the staff to the sky and float up by .35, hold it aloft
  // blazing .35-.90 (the engine rains the stars), settle
  special: (k) => {
    const p = keys(k, [
      [0, P({ ...GUARD, tor: 4, gx: 18, gy: -14, sa: 46, sg: 58, two: 0, face: 'focus', glow: 0.5 })],
      [0.14, P({ ...GUARD, tor: 14, head: 6, gx: 2, gy: -2, sa: 150, sg: 44, two: 1, sg2: 62,
        nt: -10, ns: -50, ft: 30, fs: -58, sq: 0.94, face: 'focus', glow: 0.8, charge: 0.8 })],
      [0.35, P({ ...GUARD, ...ALOFT, ah: 1, y: -12, tor: -10, head: -16, bu: 150, bf: -10, bh: 'open', farLate: 0,
        nt: 60, ns: -90, nf: -10, ft: -10, fs: -18, ff: -30, face: 'cast', glow: 1, spark: 1, lift: 1, wind: 0.2,
        smear: 1, sa0: 150, sa1: 10, sr: 112, scx: -4, scy: -30 }), 'out'],
      [0.42, P({ ...GUARD, ...ALOFT, ah: 1, y: -12, tor: -10, head: -16, bu: 150, bf: -10, bh: 'open', farLate: 0,
        nt: 60, ns: -90, nf: -10, ft: -10, fs: -18, ff: -30, face: 'cast', glow: 1, spark: 1, lift: 1, wind: 0.2 })],
      [0.90, P({ ...GUARD, ...ALOFT, ah: 1, y: -12, tor: -10, head: -16, bu: 150, bf: -10, bh: 'open', farLate: 0,
        nt: 60, ns: -90, nf: -10, ft: -10, fs: -18, ff: -30, face: 'cast', glow: 1, spark: 1, lift: 1, wind: 0.2 })],
      [1, P({ ...GUARD, ah: 0, tor: 8, head: 2, nt: 24, ns: -50, ft: 34, fs: -50, sq: 0.95, gx: 20, gy: -4, sa: 54, face: 'grin', glow: 0.5 })],
    ]);
    if (k > 0.35 && k < 0.9) {
      const u = (k - 0.35) / 0.55;
      p.y += -2.5 * Math.sin(u * TAU * 2); p.wind = 0.2 + 0.25 * Math.sin(u * TAU * 3);
      p.air = true;
    }
    return p;
  },
  // hit high: head snaps back, hat knocked askew, squash on impact; the staff flies out in front
  hurt: (k) => keys(k, [
    [0, P({ ...GUARD, x: -7, tor: -22, head: -18, sq: 0.93, gx: 16, gy: -8, sa: 70, sg: 60, two: 0, bu: 64, bf: 30,
      nt: -16, ns: -10, ft: 6, fs: -18, hatTilt: -14, face: 'ouch', glow: 0.2 })],
    [0.35, P({ ...GUARD, x: -4, tor: -14, head: -10, gx: 18, gy: -10, sa: 56, sg: 60, two: 0, bu: 40, bf: 30,
      nt: -14, ns: -12, ft: 10, fs: -18, hatTilt: -8, face: 'ouch', glow: 0.25 })],
    [1, IDLE0],
  ]),
  // hit low: doubles over, staff clutched across her middle, hat tips forward
  hurt2: (k) => keys(k, [
    [0, P({ ...GUARD, x: -4, tor: 30, head: 18, sq: 0.92, gx: 12, gy: 0, sa: 100, sg: 64, two: 0, bu: 46, bf: 96, bh: 'open',
      nt: -8, ns: -28, ft: 20, fs: -32, hatTilt: 16, face: 'ouch', glow: 0.2 })],
    [0.4, P({ ...GUARD, x: -2, tor: 22, head: 12, gx: 14, gy: -2, sa: 84, sg: 62, two: 0, bu: 40, bf: 80, bh: 'open',
      nt: -8, ns: -22, ft: 18, fs: -28, hatTilt: 10, face: 'ouch', glow: 0.25 })],
    [1, IDLE0],
  ]),
  // knocked flying, lying on her back (hat tipped over her face), getting up
  fly: P({ air: true, rot: 50, tumble: 1, tor: -8, head: -4, held: 'grip', gx: -4, gy: 4, sa: 170, sg: 30, two: 0, bu: 128, bf: 34, bh: 'cast',
    nt: 50, ns: -40, ft: 80, fs: -30, nf: 10, ff: 20, hatLift: 9, hatTilt: -30, face: 'ouch', lift: 1, wind: 0.6, glow: 0.2 }),
  down: P({ air: true, rot: 86, y: AIR_HIP - 13, tor: -4, head: -6, held: 'grip', gx: -4, gy: 4, sa: 178, sg: 30, two: 0,
    bu: 150, bf: 20, nt: 14, ns: -24, ft: 26, fs: -46, hatTilt: 64, face: 'ko', glow: 0.1 }),
  getup: (k) => keys(k, [
    [0, P({ air: true, rot: 86, y: AIR_HIP - 13, tor: -4, head: -6, held: 'grip', gx: -4, gy: 4, sa: 178, sg: 30, two: 0,
      bu: 150, bf: 20, nt: 14, ns: -24, ft: 26, fs: -46, hatTilt: 64, face: 'ouch', glow: 0.1 })],
    [0.38, P({ ah: 1, rot: 0, y: AIR_HIP - 13, tor: 6, head: 0, held: 'grip', plant: 1, px: 14, sa: 24, sg: 26, two: 0, gx: 26, gy: -12,
      bu: 60, bf: 30, bh: 'open', nt: 106, ns: -56, nf: 10, ft: 88, fs: -160, ff: -30, hatTilt: 18, face: 'worried', glow: 0.2 })],
    [0.68, P({ ...GUARD, tor: 22, head: 4, gx: 20, gy: -2, sa: 56, nt: 36, ns: -76, ft: 46, fs: -70, sq: 0.95,
      hatTilt: 8, face: 'calm', glow: 0.3 })],
    [1, IDLE0],
  ]),
  // carrying a throwable overhead (staff slung on her back); the engine draws it at CARRY_POINT
  carryIdle: (t) => {
    const b = Math.sin(t * 3);
    return P({ ...CARRY, tor: 1 + b, head: 4, nt: -8, ns: -14 - b * 2, ft: 14, fs: -16 - b * 2, face: 'focus' });
  },
  carryWalk(ph) {
    const p = P({ ...CARRY, tor: 3, head: 4, face: 'focus' });
    const bob = Math.cos((ph - 0.26) * 2 * TAU);
    gait(p, ph, CARRY_ST, 6, 0.54, 47.2 + 0.6 * bob);
    p.tor = 3 - bob * 0.8;
    return p;
  },
  // throw (16f, release .40): lean back, heave forward; she pulls the staff off her back on the follow-through
  // throw (16f): wind back under the load 0, overhead .25 (hands still on it: the engine holds it at CARRY_POINT until
  // k .375), snap release .40, then she pulls the staff off her back on the follow-through
  throw: (k) => keys(k, [
    [0, P({ ...CARRY, x: -3, tor: -5, head: 6, nt: -12, ns: -10, ft: 20, fs: -24, face: 'yell' })],
    [0.25, P({ ...CARRY, x: 2, tor: -4, head: 0, nt: -16, ns: -8, ft: 24, fs: -28, face: 'yell' })],
    [0.36, P({ ...CARRY, x: 4, tor: 4, head: 2, nt: -20, ns: -8, ft: 28, fs: -32, face: 'yell' })],
    [0.40, P({ ...CARRY, carry: 0, x: 6, tor: 18, head: 2, au: 112, af: -14, bu: 104, bf: -8, hatSq: 1, hatTilt: 0,
      nt: -24, ns: -8, ft: 30, fs: -36, face: 'yell' }), 'snap'],
    [0.62, P({ ...GUARD, x: 6, tor: 14, head: 0, gx: -12, gy: -46, sa: -36, sg: 46, two: 0, sb: 1, eb: -1, eb2: -1, bu: 60, bf: 20,
      nt: -24, ns: -8, ft: 30, fs: -36, face: 'grin' })],
    [1, IDLE0],
  ]),
  // warp-in (40f): stumbles out of the crystal portal, catches herself on the planted staff, looks round, ready
  portal: (k) => keys(k, [
    [0, P({ ...GUARD, x: -10, tor: 26, head: 6, gx: 24, gy: -10, sa: 70, two: 0, bu: 120, bf: 30,
      nt: 30, ns: -22, nf: 10, ft: -22, fs: -34, ff: -18, hatTilt: 18, face: 'surprised', wind: 0.6, glow: 0.8 })],
    [0.22, P({ ...GUARD, x: -2, tor: 8, head: -8, plant: 1, px: 34, sa: 20, sg: 50, two: 0, bu: 60, bf: 50,
      nt: 26, ns: -40, ft: -6, fs: -22, hatTilt: 10, face: 'worried', wind: 0.2, glow: 0.6 }), 'out'],
    [0.45, P({ ...BOOK, tor: 2, head: -8, nt: -6, ns: -12, ft: 14, fs: -16, hatTilt: 8, look: -1.6, face: 'surprised', glow: 0.5 })],
    [0.64, P({ ...BOOK, tor: 4, head: 2, nt: -6, ns: -12, ft: 14, fs: -16, hatTilt: 6, look: 1, face: 'calm', glow: 0.5 })],
    [0.82, P({ ...GUARD, tor: 4, head: -2, nt: -8, ns: -12, ft: 14, fs: -16, face: 'smug', glow: 0.8, spark: 1 }), 'snap'],
    [1, IDLE0],
  ]),
  victory: (t) => {
    const b = Math.max(0, Math.sin(t * 6)), s = Math.sin(t * 6);
    return P({ ...GUARD, ...ALOFT, y: -b * 7, tor: -4, head: -8, bu: 150 + s * 8, bf: 16, bh: 'fist',
      nt: -4 + b * 18, ns: -10 - b * 30, ft: 10 + b * 10, fs: -12 - b * 26, face: 'happy', glow: 0.9, spark: 1, lift: b * 0.4 });
  },
  // character-select showcase: twirls the staff, catches it and plants it at her side, hand on hip, wink + sparkle
  select: (t) => {
    const tt = t % 3.4;
    if (tt < 1.5) {
      const u = tt / 1.5;
      return P({ ...GUARD, tor: 4, head: -4, gx: 24, gy: -14, sa: 40 + u * 720, sg: 68, two: 0, bu: 40, bf: -112, bh: 'fist',
        nt: -6, ns: -10, ft: 14, fs: -16, face: 'grin', glow: 0.6, spark: 0.4 });
    }
    const u = Math.min(1, (tt - 1.5) / 0.3), e = 1 - (1 - u) * (1 - u);
    const pose = P({ ...BOOK, tor: 2, head: -6, bu: 40, bf: -112, bh: 'fist',
      nt: -4, ns: -8, ft: 16, fs: -12, face: tt > 2.0 && tt < 3.0 ? 'wink' : 'smug', glow: 0.7,
      spark: tt > 1.9 ? Math.max(0, Math.sin((tt - 1.9) / 1.5 * Math.PI)) : 0 });
    pose.plant = e; pose.gx = lerp(24, -10, e); pose.gy = lerp(-14, -10, e); pose.sa = lerp(40, -3, e);
    pose.y = -Math.max(0, Math.sin(u * Math.PI)) * 3;
    return pose;
  },
  // cutscenes ----------------------------------------------------------------------------------------------------
  talk: (t) => {
    const g = Math.sin(t * 2.2), g2 = Math.sin(t * 3.7 + 1);
    return P({ ...BOOK, tor: 3 + g * 1.5, head: -2 + g2 * 2.5, bu: 44 + g * 14, bf: 56 + g2 * 18, bh: 'cast',
      nt: -6, ns: -10, ft: 12, fs: -14, face: 'calm', glow: 0.35 });
  },
  point: P({ ...BOOK, tor: 6, head: -3, bu: 86, bf: 4, bh: 'point', nt: -10, ns: -8, ft: 18, fs: -18, face: 'smug', glow: 0.4 }),
  cheer: (t) => {
    const b = Math.max(0, Math.sin(t * 7));
    return P({ ...GUARD, ...ALOFT, y: -b * 9, tor: -2, head: -6, bu: 164, bf: 8, bh: 'fist',
      nt: -2 + b * 20, ns: -8 - b * 34, ft: 10 + b * 14, fs: -10 - b * 30, face: 'happy', glow: 0.8, spark: 0.7, lift: b * 0.5 });
  },
  surprised: P({ ...GUARD, x: -3, tor: -12, head: -8, gx: 16, gy: -14, sa: 58, sg: 62, two: 0, bu: 120, bf: 40, bh: 'cast',
    nt: -10, ns: -8, ft: 18, fs: -12, hatLift: 5, hatTilt: -6, face: 'surprised', glow: 0.6 }),
  sit: P({ ...GUARD, air: true, y: AIR_HIP, tor: -4, head: 2, gx: 16, gy: -6, sa: 76, sg: 62, two: 1, sg2: 84,
    nt: 84, ns: -80, nf: 6, ft: 78, fs: -72, ff: 4, face: 'calm', glow: 0.35 }),
};
export { mix };

// ---------------------------------------------------------------- module state (no per-frame allocation)
let T = 0, GL = 0, BACK = false, FLOORY = 51, TORA = 0, HEADA = 0, ROT = 0;
const FIDP = {};                              // scratch pose for the idle fidget (no per-frame allocation)
const SM = { cloak: 0, lift: 0, hair: 0, hairY: 0, hat: 0, hood: 0, sleeve: 0 };
/** live spring outputs of the last draw (read-only, for tools) */
export const SPRING_STATE = SM;
const ST = { bx: 0, by: 0, dx: 0, dy: -1, sa: 0, sg: 0, sk: 1, cx: 0, cy: 0 };
const AN = { sx: 0, sy: 0, a1: 0, a2: 0, hx: 0, hy: 0, k: 1 };
const AF = { sx: 0, sy: 0, a1: 0, a2: 0, hx: 0, hy: 0, k: 1, grip: false };
const KN = { x: 0, y: 0 }, KF = { x: 0, y: 0 };
const NOVEL = { x: 0, y: 0, z: 0 };
const H_SPRINGS = ['an_cloak', 'an_hair', 'an_hat', 'an_hood', 'an_sleeve'];

function hipHeight(p) {
  const dn = HIP_NEAR[1] + legDrop(THIGH, SHIN, FOOT, p.nt, p.ns);
  const df = HIP_FAR[1] + legDrop(THIGH, SHIN, FOOT, p.ft, p.fs);
  return lerp(-Math.max(dn, df), -AIR_HIP, clamp(p.ah, 0, 1)) + p.y;
}

// ---------------------------------------------------------------- staff placement + arm IK (hip frame)
function fk(A, u, f) {
  const a1 = u * DEG, a2 = (u + f) * DEG;
  A.a1 = u; A.a2 = f; A.k = 1;
  A.hx = A.sx + Math.sin(a1) * UPPER + Math.sin(a2) * FORE;
  A.hy = A.sy + Math.cos(a1) * UPPER + Math.cos(a2) * FORE;
}
/** 2-bone arm IK to (tx, ty); k stretches both bones (cartoon reach when carrying) */
function ik(A, tx, ty, bend, k = 1) {
  const L1 = UPPER * k, L2 = FORE * k;
  const ex = tx - A.sx, ey = ty - A.sy;
  const d = clamp(Math.hypot(ex, ey), 3, L1 + L2 - 0.02);
  const phi = Math.atan2(ex, ey);
  const al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const a1 = phi - bend * al;
  const elx = A.sx + Math.sin(a1) * L1, ely = A.sy + Math.cos(a1) * L1;
  const a2 = Math.atan2(tx - elx, ty - ely);
  A.a1 = a1 / DEG; A.a2 = (a2 - a1) / DEG; A.k = k;
  A.hx = elx + Math.sin(a2) * L2; A.hy = ely + Math.cos(a2) * L2;
}
/** blend an FK arm (already set) toward IK on (tx, ty), stretching it up to 1.75x if the load is out of reach */
function reachTo(A, tx, ty, bend, c) {
  const u = A.a1, f = A.a2;
  const k = clamp(Math.hypot(tx - A.sx, ty - A.sy) / (UPPER + FORE) * 1.03, 1, 1.75);
  ik(A, tx, ty, bend, k);
  A.a1 = lerp(u, A.a1, c); A.a2 = lerp(f, A.a2, c); A.k = lerp(1, k, c);
  const a1 = A.a1 * DEG, a2 = (A.a1 + A.a2) * DEG;
  A.hx = A.sx + (Math.sin(a1) * UPPER + Math.sin(a2) * FORE) * A.k;
  A.hy = A.sy + (Math.cos(a1) * UPPER + Math.cos(a2) * FORE) * A.k;
}
function setStaff(gx, gy, sa, sg, sk) {
  ST.sa = sa; ST.dx = Math.sin(sa * DEG); ST.dy = -Math.cos(sa * DEG); ST.sg = sg; ST.sk = sk;
  ST.bx = gx - ST.dx * sg * sk; ST.by = gy - ST.dy * sg * sk;
  ST.cx = ST.bx + ST.dx * CRYC * sk; ST.cy = ST.by + ST.dy * CRYC * sk;
}
function place(p, hipY) {
  const tr = p.tor * DEG, ct = Math.cos(tr), st = Math.sin(tr);
  AN.sx = SH_NEAR[0] * ct - SH_NEAR[1] * st; AN.sy = SH_NEAR[0] * st + SH_NEAR[1] * ct;
  AF.sx = SH_FAR[0] * ct - SH_FAR[1] * st; AF.sy = SH_FAR[0] * st + SH_FAR[1] * ct;
  KN.x = HIP_NEAR[0] + Math.sin(p.nt * DEG) * THIGH; KN.y = HIP_NEAR[1] + Math.cos(p.nt * DEG) * THIGH;
  KF.x = HIP_FAR[0] + Math.sin(p.ft * DEG) * THIGH; KF.y = HIP_FAR[1] + Math.cos(p.ft * DEG) * THIGH;
  FLOORY = -hipY;
  AF.grip = false;
  if (p.held === 'grip') {
    let sa = p.sa, dx = Math.sin(sa * DEG), dy = -Math.cos(sa * DEG), sg = p.sg;
    const sk = p.sk;
    let gx = p.gx, gy = p.gy;
    if (p.plant > 0) {
      const by = FLOORY - 1 - p.pl;
      gx = lerp(gx, p.px + dx * sg, p.plant); gy = lerp(gy, by + dy * sg, p.plant);
    }
    // out of reach: pull the staff in, or (reach > 1, raised-staff poses) stretch the arm cartoon-style
    const ex = gx - AN.sx, ey = gy - AN.sy, d = Math.hypot(ex, ey), rmax = REACH * Math.max(1, p.reach);
    if (d > rmax) { gx = AN.sx + ex / d * rmax; gy = AN.sy + ey / d * rmax; }
    const kN = d > REACH ? Math.min(d, rmax) / REACH : 1;
    if (!ROT && sk > 0.5) {
      // grounded: the crystal tip stops on the floor (the swing ends there) and the butt slides up through the hand;
      // in the air the crystal never swings below her soles
      const air = p.ah >= 0.5;
      const lim = air ? Math.max(HIP_NEAR[1] + legDrop(THIGH, SHIN, FOOT, p.nt, p.ns), HIP_FAR[1] + legDrop(THIGH, SHIN, FOOT, p.ft, p.fs)) - 1
        : FLOORY - 1.5, tl = (SL - sg) * sk;
      if (gy + dy * tl > lim && gy < lim) {
        const a = Math.acos(clamp(-(lim - gy) / tl, -1, 1)) / DEG;
        sa = Math.sin(sa * DEG) < 0 ? -a : a;
        dx = Math.sin(sa * DEG); dy = -Math.cos(sa * DEG);
      }
      const lift = p.pl * p.plant;
      if (!air && dy < -0.05 && gy - dy * sg * sk > lim - lift) sg = Math.max(10, (gy - lim + lift) / (dy * sk));
    }
    setStaff(gx, gy, sa, sg, sk);
    ik(AN, gx, gy, p.eb, kN);
    if (p.two >= 0.5) {
      // the free hand on the shaft at sg2, sliding along it to the nearest point it can reach
      const ux = ST.dx * sk, uy = ST.dy * sk, uu = ux * ux + uy * uy || 1e-6;
      const wx = ST.bx - AF.sx, wy = ST.by - AF.sy, wd = (wx * ux + wy * uy) / uu;
      const disc = wd * wd - (wx * wx + wy * wy - (REACH - 0.5) * (REACH - 0.5)) / uu;
      if (disc >= 0) {
        const r = Math.sqrt(disc), s = clamp(p.sg2, -wd - r, -wd + r);
        ik(AF, ST.bx + ux * s, ST.by + uy * s, p.eb2);
        AF.grip = true;
      } else fk(AF, p.bu - p.tor, p.bf);
    } else fk(AF, p.bu - p.tor, p.bf);
  } else if (p.held === 'hand') {
    fk(AN, p.au - p.tor, p.af);
    setStaff(AN.hx, AN.hy, p.sa, p.sg, 1);
    fk(AF, p.bu - p.tor, p.bf);
  } else {
    // slung across her back: butt by the far hip, crystal up behind the near shoulder (torso frame)
    const bx = 12, by = 8;
    setStaff(bx * ct - by * st, bx * st + by * ct, -24 + p.tor, 0, 1);
    const c = clamp(p.carry, 0, 1);
    AN.sy -= 3 * c; AF.sy -= 3 * c;                  // shoulders shrug up under the load
    fk(AN, p.au - p.tor, p.af); fk(AF, p.bu - p.tor, p.bf);
    if (c > 0.001) {
      // hands on the load's sides, a little up from its bottom
      const tx = CARRY_POINT[0] / ART - p.x, ty = CARRY_POINT[1] / ART - hipY;
      reachTo(AN, tx - 11.5, ty + 7, -1, c);
      reachTo(AF, tx + 11.5, ty + 7, 1, c);
    }
  }
}

// ---------------------------------------------------------------- secondary motion
function secondary(p, o, f, hipY) {
  const mem = o.mem, vel = o.vel || NOVEL;
  let vx = (vel.x || 0) * f, vz = vel.z || 0;
  if (mem) {
    const tr = p.tor * DEG - ROT * DEG;
    const hx = p.x + Math.sin(tr) * 52, hy = hipY - Math.cos(tr) * 52;
    if (mem.anFr !== mem.frame) {
      const flip = mem.anF !== undefined && mem.anF !== f;
      // turning round: mirror the springs so the hair and cloak swing through instead of popping
      if (flip) for (let i = 0; i < H_SPRINGS.length; i++) { const s = mem[H_SPRINGS[i]]; if (s) { s.x = -s.x; s.v = -s.v; } }
      if (!flip && mem.anFr === mem.frame - 1) { mem.anDx = hx - mem.anHx; mem.anDy = hy - mem.anHy; } else mem.anDx = mem.anDy = 0;
      mem.anHx = hx; mem.anHy = hy; mem.anFr = mem.frame; mem.anF = f;
    }
    vx += clamp(mem.anDx, -7, 7) * 0.8; vz -= clamp(mem.anDy, -7, 7) * 0.6;
  }
  const w = p.wind, sp = p.spin ? Math.abs(Math.sin(p.spin * DEG)) : 0;
  SM.cloak = follow(mem, 'an_cloak', clamp(vx * 3.2, -10, 24) + w * 16 + sp * 10, 0.11, 0.82);
  SM.lift = follow(mem, 'an_lift', clamp(-vz * 1.5, -6, 12) + p.lift * 12 + sp * 7, 0.14, 0.76);
  SM.hair = follow(mem, 'an_hair', clamp(vx * 2.8, -9, 18) + w * 12 + sp * 7, 0.08, 0.85);
  SM.hairY = follow(mem, 'an_hairY', clamp(-vz * 1.3, -6, 10) + p.lift * 7, 0.1, 0.8);
  SM.hat = follow(mem, 'an_hat', clamp(vx * 8 + vz * 3, -35, 48) + w * 26 + sp * 20 - p.lift * 24, 0.12, 0.8);
  SM.hood = follow(mem, 'an_hood', clamp(vx * 1.4, -3, 7) + w * 3, 0.16, 0.7);
  SM.sleeve = follow(mem, 'an_sleeve', clamp(vx * 1.6, -5, 8) + w * 5, 0.15, 0.74);
}

// ---------------------------------------------------------------- shading helpers
const LX = -2.3, LY = -2.9;
let OX = 0, OY = 0;
function lightOff(ctx, k) {
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c;
  if (!det) { OX = OY = 0; return; }
  const s = Math.sqrt(Math.abs(det)), wx = LX * k * s, wy = LY * k * s;
  OX = (m.d * wx - m.c * wy) / det; OY = (-m.b * wx + m.a * wy) / det;
}
/** rig.cel() for a cached Path2D */
function celP(ctx, path, base, dark, k = 1, lw = 3, hi = null, detail = null) {
  ctx.fillStyle = dark; ctx.fill(path);
  lightOff(ctx, k);
  const sx = OX, sy = OY;
  ctx.save(); ctx.clip(path);
  ctx.save(); ctx.translate(sx, sy); ctx.fillStyle = hi || base; ctx.fill(path);
  if (hi) { ctx.clip(path); const h = 0.45 / k; ctx.translate(-sx * h, -sy * h); ctx.fillStyle = base; ctx.fill(path); }
  ctx.restore();
  if (detail) detail(ctx);
  ctx.restore();
  if (lw) { ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.stroke(path); }
}
/** cool rim light just inside the outline on the side away from the key light (screen upper right), re-inked */
function rim(ctx, path, lw, s = 1.5, col = C.rim) {
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c;
  if (!det) return;
  const k = Math.sqrt(Math.abs(det)), wx = -0.8 * s * k, wy = 0.6 * s * k;
  const isFn = typeof path === 'function';
  ctx.save();
  if (isFn) { ctx.beginPath(); path(ctx); ctx.clip(); } else ctx.clip(path);
  ctx.translate((m.d * wx - m.c * wy) / det, (-m.b * wx + m.a * wy) / det);
  ctx.lineWidth = s * 2 + lw * 0.3; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.globalAlpha = 0.7;
  if (isFn) { ctx.beginPath(); path(ctx); ctx.stroke(); } else ctx.stroke(path);
  ctx.restore();
  ctx.lineWidth = lw; ctx.strokeStyle = INK;
  if (isFn) { ctx.beginPath(); path(ctx); ctx.stroke(); } else ctx.stroke(path);
}
const PATHS = {};
function P2(key, build) { let p = PATHS[key]; if (!p) { p = new Path2D(); build(p); PATHS[key] = p; } return p; }
let GLOW_SPR = null;
function glowSprite() {
  if (GLOW_SPR) return GLOW_SPR;
  const s = 96;
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(s, s);
  c.width = c.height = s;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(235,252,255,1)');
  gr.addColorStop(0.16, 'rgba(150,220,255,0.85)');
  gr.addColorStop(0.45, 'rgba(70,150,255,0.3)');
  gr.addColorStop(1, 'rgba(40,100,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  GLOW_SPR = c;
  return c;
}

// ---------------------------------------------------------------- drawing
/**
 * Draw Anastasia.  ctx is at her feet (screen), unscaled.
 * o: { facing: 1 | -1, t: seconds, scale, mem (per-actor scratch with mem.frame), vel: {x, y, z}, talk }
 */
export function draw(ctx, pose, o = {}) {
  let p = pose;
  const f = o.facing || 1, S = o.scale || 1;
  T = o.t || 0;
  // the idle fidget only plays once she has really settled (o.idleT), never straight out of a combo / throw / beam
  if (p.fid > 0 && !(o.idleT !== undefined && o.idleT - p.fid * FID_LEN < 1.5)) p = fidget(Object.assign(FIDP, pose), pose.fid);
  // knocked flying: she tips further back the faster she falls
  ROT = p.rot + (p.tumble ? p.tumble * clamp(-((o.vel && o.vel.z) || 0) * 4, 0, 30) : 0);
  GL = clamp(p.glow, 0, 1);
  const hipY = hipHeight(p);
  secondary(p, o, f, hipY);
  ctx.save();
  ctx.scale(f * S * ART, S * ART);
  if (p.sq !== 1) ctx.scale(1 / Math.sqrt(p.sq), p.sq);
  ctx.translate(p.x, hipY);
  ctx.save();
  BACK = false;
  if (p.spin) {
    const c = Math.cos(p.spin * DEG);
    BACK = c < 0;
    ctx.scale((c < 0 ? -1 : 1) * Math.max(0.45, Math.abs(c)), 1);
  }
  if (ROT) ctx.rotate(-ROT * DEG);
  place(p, hipY);
  TORA = p.tor * DEG;
  HEADA = (p.tor + p.head - ROT) * DEG;

  const staffBack = p.held === 'back' || p.sb >= 0.5;
  cloakBack(ctx);
  if (staffBack) staff(ctx);
  hood(ctx);
  hairBack(ctx, p);
  // the free arm: behind her body when loose; on the shaft (which is in front of her) it comes round in front of
  // the torso but stays behind her head, the staff and the staff arm
  if (!p.farLate && !AF.grip) arm(ctx, AF, true, p.bh);
  leg(ctx, HIP_FAR, p.ft, p.fs, p.ff, true);
  leg(ctx, HIP_NEAR, p.nt, p.ns, p.nf, false);
  skirt(ctx);
  ctx.save(); ctx.rotate(TORA); tunic(ctx); ctx.restore();
  cloakNear(ctx);
  ctx.save(); ctx.rotate(TORA); clasp(ctx); ctx.restore();
  if (AF.grip && !staffBack) arm(ctx, AF, true, 'grip');
  head(ctx, p, o);
  if (p.farLate && !AF.grip) arm(ctx, AF, true, p.bh);
  if (!staffBack) staff(ctx);
  else if (AF.grip) arm(ctx, AF, true, 'grip');
  arm(ctx, AN, false, p.held === 'back' ? p.nh : 'grip');
  if (p.ln > 0.02) speedLines(ctx, p);
  glow(ctx, p, staffBack);
  ctx.restore();
  // the smear sweeps round her, outside the cut-out spin
  if (p.smear > 0.02) { if (ROT) ctx.rotate(-ROT * DEG); smear(ctx, p); }
  ctx.restore();
}

/** torso-frame point -> hip frame (writes RX, RY) */
let RX = 0, RY = 0;
function rotT(x, y) { const c = Math.cos(TORA), s = Math.sin(TORA); RX = x * c - y * s; RY = x * s + y * c; }

// -------------------------------------------------- cloak
function hemFront() { return Math.min(Math.max(KN.x, KF.x, 4) + 10, 26); }
function hemBack() { return Math.max(Math.min(KN.x, KF.x, -2) - 19, -26) - SM.cloak; }
// the back of the cloak: its teal lining shows between the legs, its far front edge (gold trim) in front of her
function cloakBack(ctx) {
  const hy = 27 - SM.lift * 0.35, fx = hemFront(), bx = hemBack(), by = 29 - SM.lift;
  const edge = (c) => {
    rotT(10, -30); c.moveTo(RX, RY);
    rotT(15, -15); c.quadraticCurveTo(RX, RY, fx - 1, 6);
    c.lineTo(fx, hy);
    c.quadraticCurveTo((fx + bx) / 2, hy + 4, bx, by);
  };
  const path = (c) => {
    edge(c);
    rotT(-15, -14); const mx = RX - SM.cloak * 0.4, my = RY;
    rotT(-11, -29); c.quadraticCurveTo(mx - 6, (my + by) / 2 + 2, RX, RY);
    rotT(-4, -33); c.lineTo(RX, RY);
    c.closePath();
  };
  cel(ctx, path, C.cloakD, C.cloakIn, { k: 1.3, lw: 3, detail: (c) => {
    c.lineWidth = 6.5; c.strokeStyle = C.goldD; c.lineCap = 'round';
    c.beginPath(); edge(c); c.stroke();
  } });
}
// the near half of the cloak, over her near side: a gold band down the front edge from the clasp and round the hem
function cloakNear(ctx) {
  const hy = 27 - SM.lift * 0.35, bx = hemBack() + 4, by = 28.5 - SM.lift;
  const nfx = BACK ? hemFront() : Math.max(Math.min(KN.x + 5, KN.y < 14 ? 8 : 26), 3);
  rotT(5, -31); const cx0 = RX, cy0 = RY;
  rotT(1, -11); const wx = RX, wy = RY;
  const path = (c) => {
    c.moveTo(cx0, cy0);
    rotT(-4, -35); c.lineTo(RX, RY);
    rotT(-12, -34); const ax = RX, ay = RY; rotT(-13, -24); c.quadraticCurveTo(ax, ay, RX, RY);
    c.quadraticCurveTo(bx + 4 - SM.cloak * 0.2, 2, bx, by);
    c.quadraticCurveTo((bx + nfx) / 2, hy + 3, nfx, hy);
    if (BACK) { c.lineTo(nfx - 2, -10); } else c.quadraticCurveTo(wx + 1, 10, wx, wy);
    c.lineTo(cx0, cy0);
    c.closePath();
  };
  cel(ctx, path, C.cloak, C.cloakD, { k: 1.4, hi: C.cloakH, lw: 3, detail: (c) => {
    // folds that swing with the hem
    c.strokeStyle = C.cloakL; c.lineWidth = 1.4; c.lineCap = 'round';
    rotT(-8, -22); c.beginPath(); c.moveTo(RX, RY); c.quadraticCurveTo(RX - 2 - SM.cloak * 0.3, 8, bx + 9 - SM.cloak * 0.1, by - 1); c.stroke();
    rotT(-3, -18); c.beginPath(); c.moveTo(RX, RY); c.quadraticCurveTo(RX - 1, 8, (bx + nfx) / 2 + 2, hy + 2); c.stroke();
    // gold band: hem + front edge
    c.lineWidth = 6; c.strokeStyle = C.gold;
    c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo((bx + nfx) / 2, hy + 3, nfx, hy);
    if (!BACK) { c.quadraticCurveTo(wx + 1, 10, wx, wy); c.lineTo(cx0, cy0); }
    c.stroke();
  } });
  rim(ctx, path, 3, 1.4);
}
// hood bunched at the nape (torso frame), lagging a little
function hood(ctx) {
  ctx.save(); ctx.rotate(TORA);
  const h = SM.hood;
  const path = (c) => {
    c.moveTo(-2, -36);
    c.quadraticCurveTo(-10 - h * 0.4, -44, -16 - h, -38);
    c.quadraticCurveTo(-19 - h, -31, -14 - h * 0.6, -25);
    c.quadraticCurveTo(-8, -26, -4, -30);
    c.closePath();
  };
  cel(ctx, path, C.cloak, C.cloakD, { k: 1.3, lw: 2.8, detail: (c) => {
    c.strokeStyle = C.cloakIn; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(-4, -35); c.quadraticCurveTo(-11 - h * 0.5, -39, -14 - h * 0.8, -33); c.stroke();
  } });
  ctx.restore();
}
// gold star clasp with its two studs (torso frame)
const STUDS = [[1.2, -31.5], [9.6, -30.2]];
function clasp(ctx) {
  if (BACK) return;
  ctx.fillStyle = C.goldD; ctx.lineWidth = 1.2; ctx.strokeStyle = INK;
  for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(STUDS[i][0], STUDS[i][1], 1.7, 0, TAU); ctx.fill(); ctx.stroke(); }
  celP(ctx, P2('star', (c) => {
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 1.7 : 4.1, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(5.5 + Math.cos(a) * r, -30 + Math.sin(a) * r); }
    c.closePath();
  }), C.gold, C.goldD, 0.6, 1.5, C.brassH);
}

// -------------------------------------------------- tunic (torso frame) + skirt (hip frame)
function tunic(ctx) {
  celP(ctx, P2('tunic', (c) => {
    c.moveTo(-10, -9);
    c.bezierCurveTo(-11.5, -18, -11, -28, -5, -33.5);
    c.lineTo(5.5, -33.5);
    c.bezierCurveTo(11, -31, 12.5, -21, 11.5, -9);
    c.closePath();
  }), C.tunic, C.tunicD, 1.3, 2.8, null, (c) => {
    c.strokeStyle = C.tunicL; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(7.5, -31); c.quadraticCurveTo(9.5, -20, 8.5, -10); c.stroke();
  });
  // belt + brass buckle
  celP(ctx, P2('belt', (c) => {
    c.moveTo(-11, -14.5); c.quadraticCurveTo(0, -13.5, 12.2, -15); c.lineTo(12, -9);
    c.quadraticCurveTo(0, -8, -10.6, -9); c.closePath();
  }), C.belt, C.beltD, 1, 2.4, null, (c) => {
    c.strokeStyle = C.beltD; c.lineWidth = 1; c.setLineDash([1.5, 1.6]);
    c.beginPath(); c.moveTo(-9, -13); c.quadraticCurveTo(0, -12.2, 4, -12.6); c.stroke(); c.setLineDash([]);
  });
  if (BACK) return;
  celP(ctx, P2('buckle', (c) => { c.rect(4.6, -15.6, 6.4, 7.4); }), C.brass, C.brassD, 0.6, 1.6, C.brassH);
  ctx.fillStyle = C.beltD; ctx.fillRect(6.3, -13.9, 3, 4);
  ctx.strokeStyle = C.brassD; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(7.8, -13.4); ctx.lineTo(7.8, -10.4); ctx.stroke();
}
function skirt(ctx) {
  let fx = Math.max(KN.x, KF.x) * 0.5 + 12;
  if (KN.y < 12) fx = Math.min(fx, Math.max(KN.x - 4, 10));      // a raised knee pokes out of the tunic
  const bx = Math.min(KN.x, KF.x) * 0.5 - 11, hy = 14;
  rotT(-10.5, -11); const ax = RX, ay = RY; rotT(11.8, -11); const bx0 = RX, by0 = RY;
  const hem = (c) => { c.moveTo(fx, hy); c.quadraticCurveTo((fx + bx) / 2, hy + 3, bx, hy - 1); };
  const path = (c) => {
    c.moveTo(ax, ay); c.lineTo(bx0, by0);
    c.quadraticCurveTo(bx0 + 1, 4, fx, hy);
    c.quadraticCurveTo((fx + bx) / 2, hy + 3, bx, hy - 1);
    c.quadraticCurveTo(ax - 1, 2, ax, ay);
    c.closePath();
  };
  cel(ctx, path, C.tunic, C.tunicD, { k: 1.3, lw: 2.8, detail: (c) => {
    c.strokeStyle = C.tunicL; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(bx0 - 4, by0 + 2); c.quadraticCurveTo(fx - 6, 6, fx - 4, hy); c.stroke();
    c.lineWidth = 6; c.strokeStyle = C.gold; c.beginPath(); hem(c); c.stroke();
  } });
  // little gold hem charms
  for (let i = 0; i < 2; i++) {
    const x = fx - 4.5 - i * 8, y = hy - 3.8 + i * 0.6;
    ctx.fillStyle = C.gold; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y - 2.6); ctx.quadraticCurveTo(x + 2.6, y, x, y + 2.6); ctx.quadraticCurveTo(x - 2.6, y, x, y - 2.6);
    ctx.fill(); ctx.stroke();
  }
}

// -------------------------------------------------- legs
function leg(ctx, hip, a, s, footAbs, far) {
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(-a * DEG);
  celP(ctx, P2('thigh', (c) => capsule(c, THIGH, 10.5, 9.5)), far ? C.legF : C.leg, far ? C.legFD : C.legD, 1.2, 2.8);
  ctx.translate(0, THIGH);
  ctx.rotate(-s * DEG);
  celP(ctx, P2('shin', (c) => capsule(c, SHIN, 9.5, 8.5)), far ? C.legF : C.leg, far ? C.legFD : C.legD, 1.2, 2.6);
  celP(ctx, P2('boot', (c) => {
    c.moveTo(-5.3, 5); c.quadraticCurveTo(-6.6, 13, -4.9, SHIN + 1); c.lineTo(4.9, SHIN + 1); c.quadraticCurveTo(5.6, 12, 5.1, 5); c.closePath();
  }), far ? C.bootF : C.boot, far ? C.bootFD : C.bootD, 1.2, 2.6);
  celP(ctx, P2('cuff', (c) => {
    c.moveTo(-6.3, 2.6); c.quadraticCurveTo(0, 1.2, 6.3, 2.2); c.lineTo(6.8, 9.2); c.quadraticCurveTo(0, 10.8, -6.9, 9.6); c.closePath();
  }), far ? C.cuffF : C.cuff, far ? '#553319' : C.cuffD, 1, 2.4, null, far ? null : cuffDetail);
  ctx.translate(0, SHIN);
  ctx.rotate((a + s - footAbs) * DEG);
  celP(ctx, P2('foot', (c) => {
    c.moveTo(-5.4, -3); c.lineTo(-5.8, 4.5); c.quadraticCurveTo(-5.5, 6.6, -3, 6.6); c.lineTo(11.5, 6.6);
    c.quadraticCurveTo(14.6, 6.6, 13.6, 2.6); c.quadraticCurveTo(11, -2.4, 5, -3); c.closePath();
  }), far ? C.bootF : C.boot, far ? C.bootFD : C.bootD, 1, 2.6, far ? null : C.bootH);
  ctx.fillStyle = C.sole; ctx.fillRect(-5.6, 5, 18, 1.8);
  ctx.restore();
}
function cuffDetail(c) {
  c.strokeStyle = C.cuffD; c.lineWidth = 1; c.setLineDash([1.4, 1.6]);
  c.beginPath(); c.moveTo(-5.5, 7.6); c.quadraticCurveTo(0, 8.9, 5.8, 7.6); c.stroke(); c.setLineDash([]);
  c.fillStyle = C.brass; c.beginPath(); c.arc(-3.6, 5.4, 1.2, 0, TAU); c.fill();
}

// -------------------------------------------------- hair (head frame, origin at the head centre)
// x, y, hang weight (0 = rooted, 1 = free end): the free ends hang plumb and trail on the springs
// the back mass: three big curl lobes down her back (pinched between), so it reads as hair, not a backpack
const HAIR_BACK = [
  [9, -17, 0], [-3, -20, 0], [-14, -17, 0.04], [-22, -7, 0.14], [-26, 3, 0.28], [-22, 9, 0.36],
  [-27, 17, 0.5], [-22, 23, 0.62], [-25, 31, 0.8], [-17, 38, 0.95], [-9, 36, 1], [-3, 28, 0.8], [-3, 18, 0.5],
  [1, 8, 0.25], [8, 0, 0.05],
];
const LOBE_LINES = [[-22, 9, -14, 6, 0.36], [-22, 23, -14, 21, 0.62]];
// two ringlets in front of the ear, falling over the near shoulder (drawn over the cloak)
const HAIR_LOCK = [
  [-6, -12, 0], [-12, -3, 0.08], [-13.5, 8, 0.3], [-12.5, 18, 0.5], [-14, 26, 0.7], [-10, 33, 0.88], [-6, 31, 0.9],
  [-5, 25, 0.75], [-2, 31, 0.9], [2, 29, 0.85], [0, 21, 0.62], [-3, 13, 0.4], [-2.5, 2, 0.14], [-1, -9, 0],
];
const CURLS = [[-16, -5, 0.15], [-21, 7, 0.32], [-13, 9, 0.32], [-21, 20, 0.55], [-13, 21, 0.6], [-17, 31, 0.85], [-8, 31, 0.9], [-7, 13, 0.4]];
const HX = new Float64Array(16), HY = new Float64Array(16);
function hangPt(x0, y0, w, swing) {
  const a = -HEADA * w * 0.85, c = Math.cos(a), s = Math.sin(a), x = x0 + 2, y = y0 + 14;   // pivot at the crown
  RX = x * c - y * s - 2 - SM.hair * swing * w;
  RY = x * s + y * c - 14 - SM.hairY * swing * w;
}
function hang(src, swing) {
  for (let i = 0; i < src.length; i++) { hangPt(src[i][0], src[i][1], src[i][2], swing); HX[i] = RX; HY[i] = RY; }
}
/** closed curly outline: every segment bulges outward a little */
function curlyEdge(c, n, b) {
  c.moveTo(HX[0], HY[0]);
  for (let i = 1; i <= n; i++) {
    const j = i % n, x0 = HX[i - 1], y0 = HY[i - 1], x1 = HX[j], y1 = HY[j];
    const dx = x1 - x0, dy = y1 - y0;
    c.quadraticCurveTo((x0 + x1) / 2 - dy * b * 0.35, (y0 + y1) / 2 + dx * b * 0.35, x1, y1);
  }
  c.closePath();
}
function headFrame(ctx, p) {
  ctx.rotate(TORA); ctx.translate(NECK[0], NECK[1]); ctx.rotate(p.head * DEG); ctx.translate(HEADC[0], HEADC[1]); ctx.scale(HS, HS);
}
function hairBack(ctx, p) {
  ctx.save(); headFrame(ctx, p);
  hang(HAIR_BACK, 1);
  const n = HAIR_BACK.length;
  const path = (c) => curlyEdge(c, n, 1);
  cel(ctx, path, C.hair, C.hairD, { k: 1.5, hi: C.hairH, lw: 2.8, detail: curlStrokes });
  rim(ctx, path, 2.8, 1.6, C.hairH);
  ctx.restore();
}
function curlStrokes(c) {
  c.strokeStyle = C.hairL; c.lineWidth = 1.5; c.lineCap = 'round';
  for (let i = 0; i < LOBE_LINES.length; i++) {
    const L = LOBE_LINES[i];
    hangPt(L[0], L[1], L[4], 1); const x0 = RX, y0 = RY;
    hangPt(L[2], L[3], L[4], 1);
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + RX) / 2, (y0 + RY) / 2 + 2.5, RX, RY); c.stroke();
  }
  c.lineWidth = 1.3;
  for (let i = 0; i < CURLS.length; i++) {
    hangPt(CURLS[i][0], CURLS[i][1], CURLS[i][2], 1);
    c.beginPath(); c.arc(RX, RY, 3.2, 0.2 + i, 3.9 + i); c.stroke();
  }
  c.strokeStyle = C.hairH; c.lineWidth = 1; c.globalAlpha = 0.6;
  for (let i = 1; i < CURLS.length; i += 2) {
    hangPt(CURLS[i][0] + 2, CURLS[i][1] - 2, CURLS[i][2], 1);
    c.beginPath(); c.arc(RX, RY, 2.2, 3.6 + i, 5.4 + i); c.stroke();
  }
  c.globalAlpha = 1;
}

// -------------------------------------------------- head
function head(ctx, p, o) {
  ctx.save();
  ctx.rotate(TORA); ctx.translate(NECK[0], NECK[1]); ctx.rotate(p.head * DEG);
  celP(ctx, P2('neck', (c) => capsule(c, 7, 8, 8.6)), C.skin, C.skinD, 1, 2.2);
  ctx.translate(HEADC[0], HEADC[1]); ctx.scale(HS, HS);
  if (BACK) {
    // seen from behind mid-spin: all hair
    cel(ctx, (c) => ellipse(c, -1, -1, 18, 19.5), C.hair, C.hairD, { k: 1.5, hi: C.hairH, lw: 2.8, detail: curlStrokes });
  } else {
    celP(ctx, P2('face', (c) => {
      c.moveTo(-8, 14);
      c.bezierCurveTo(-15.5, 9, -16.5, -7, -9, -14.5);
      c.bezierCurveTo(0, -20.5, 14.5, -19, 17.5, -7.5);
      c.quadraticCurveTo(19, -1.5, 18.6, 2.2);
      c.quadraticCurveTo(21.2, 4.4, 18.6, 6.6);
      c.quadraticCurveTo(18.2, 12, 13, 16.6);
      c.quadraticCurveTo(6, 20.8, -1, 18.4);
      c.quadraticCurveTo(-5, 16.8, -8, 14);
      c.closePath();
    }), C.skin, C.skinD, 1.4, 2.6, C.skinH, faceShade);
    ctx.fillStyle = C.blush; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.ellipse(6.4, 9.6, 4.2, 2.3, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    features(ctx, p, o);
    // a ringlet in front of the ear, falling over the near shoulder
    hang(HAIR_LOCK, 0.8);
    const n = HAIR_LOCK.length;
    cel(ctx, (c) => curlyEdge(c, n, 0.7), C.hair, C.hairD, { k: 1.3, hi: C.hairH, lw: 2.4, detail: lockDetail });
  }
  hat(ctx, p);
  ctx.restore();
}
function lockDetail(c) {
  c.strokeStyle = C.hairL; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(HX[7], HY[7]); c.quadraticCurveTo(HX[11] - 1, HY[11] + 2, HX[12], HY[12]); c.stroke();
  c.beginPath(); c.arc(HX[3] + 4, HY[3] - 5, 2.5, 0.4, 3.6); c.stroke();
  c.beginPath(); c.arc(HX[10] - 1.5, HY[10] + 2, 2.2, 3.4, 6.2); c.stroke();
  c.strokeStyle = C.hairH; c.globalAlpha = 0.7;
  c.beginPath(); c.arc(HX[4] + 3, HY[4] - 1, 2, 3.6, 5.4); c.stroke();
  c.globalAlpha = 1;
}
// forehead fringe peeking under the brim + the brim's shadow + under-chin occlusion (clipped to the face)
function faceShade(c) {
  c.fillStyle = C.hair;
  c.beginPath(); c.moveTo(-12, -22); c.lineTo(18, -22); c.lineTo(18, -12.6);
  c.quadraticCurveTo(14, -15.2, 10, -12.6); c.quadraticCurveTo(6, -15.6, 2, -13); c.quadraticCurveTo(-3, -15.8, -7, -11.6);
  c.lineTo(-12, -10.5); c.closePath(); c.fill();
  c.fillStyle = C.skinO; c.globalAlpha = 0.38;
  c.beginPath(); c.ellipse(3, -13, 22, 3.2, -0.06, 0, TAU); c.fill();
  c.fillStyle = C.skinD; c.globalAlpha = 0.6;
  c.beginPath(); c.ellipse(3, 21.5, 11, 4.5, 0, 0, TAU); c.fill();
  c.globalAlpha = 1;
}

const KO_EYES = [[7.4, 3.6], [16, 2.6]];
function features(ctx, p, o) {
  const face = p.face;
  const blink = p.blink && (face === 'calm' || face === 'grin' || face === 'smug' || face === 'worried') && (T % 3.9) > 3.76;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const lk = p.look;
  const hard = face === 'focus' || face === 'yell';
  const wide = face === 'surprised' || face === 'cast';
  // eyes
  if (blink || face === 'happy') {
    const up = face === 'happy' ? -1 : 1;
    ink(ctx, (c) => { c.moveTo(3, 2); c.quadraticCurveTo(7.4, 2 + 3.2 * up, 11.6, 2); }, 2.4);
    ink(ctx, (c) => { c.moveTo(14.2, 1.6); c.quadraticCurveTo(16, 1.6 + 2.4 * up, 17.8, 1.6); }, 2.1);
  } else if (face === 'ouch') {
    ink(ctx, (c) => { c.moveTo(3.6, -1.8); c.lineTo(8.6, 1.4); c.lineTo(3.6, 4.4); }, 2.3);
    ink(ctx, (c) => { c.moveTo(18.2, -1.6); c.lineTo(14.6, 1.4); c.lineTo(18.2, 4); }, 2.1);
  } else if (face === 'ko') {
    for (let k = 0; k < 2; k++) {
      const x = KO_EYES[k][0], r = KO_EYES[k][1];
      ink(ctx, (c) => { for (let a = 0; a < 4 * Math.PI; a += 0.35) { const rr = r * a / (4 * Math.PI); c.lineTo(x + Math.cos(a) * rr, 1.5 + Math.sin(a) * rr); } }, 1.4);
    }
  } else if (face === 'wink') {
    eye(ctx, 7.4, 1.8, 4.2, 4.8, -1, 0.5 + lk, 0, 0);
    ink(ctx, (c) => { c.moveTo(14, 2.2); c.quadraticCurveTo(16, -0.4, 18, 2.2); }, 2.1);
  } else {
    const m = hard ? 1 : wide ? 2 : 0, sc = wide ? 1.1 : 1;
    ctx.save(); ctx.clip(PATHS.face);
    eye(ctx, 7.4, 1.8, 4.2, 4.8 * sc, -1, 0.5 + lk, 0, m);
    eye(ctx, 15.6, 1.4, 2.6, 4.4 * sc, 1, 0.4 + lk * 0.8, 0, m);
    ctx.restore();
  }
  // brows: thick and dark like the book, and they do most of the acting
  let bA = 0.06, bY = -9.4, bA2 = 0.06;
  if (hard) { bA = 0.42; bA2 = 0.4; bY = -7.2; }
  else if (face === 'cast') { bA = 0.2; bA2 = 0.16; bY = -10.2; }
  else if (face === 'ouch' || face === 'worried') { bA = -0.3; bA2 = -0.26; bY = -9.2; }
  else if (face === 'surprised') { bA = -0.12; bA2 = -0.1; bY = -10.6; }
  else if (face === 'smug' || face === 'wink') { bA = 0.16; bA2 = -0.3; bY = -9.4; }
  else if (face === 'happy') { bA = -0.15; bA2 = -0.1; bY = -9.6; }
  ctx.strokeStyle = C.brow; ctx.lineWidth = 2.4;
  ctx.save(); ctx.translate(7.2, bY); ctx.rotate(bA);
  ctx.beginPath(); ctx.moveTo(-4.6, 0.9); ctx.quadraticCurveTo(-0.4, -1.5, 4.2, 0); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(16.4, bY - 0.2 + (face === 'smug' || face === 'wink' ? -1.2 : 0)); ctx.rotate(bA2);
  ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(-2.4, 0.5); ctx.quadraticCurveTo(0, -1.1, 2.4, 0.2); ctx.stroke(); ctx.restore();
  // nose
  ctx.strokeStyle = C.skinD; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(17.4, 6.6); ctx.quadraticCurveTo(18.4, 7.3, 19.3, 6.4); ctx.stroke();
  // mouth
  let m = face === 'cast' ? 'yell' : face;
  if (o.talk) m = (Math.sin(T * 15) + Math.sin(T * 23.7) * 0.6) > 0.1 ? 'talkO' : (face === 'yell' ? 'focus' : 'calm');
  if (m === 'yell') {
    // a big open shout (about 9 x 7 px on screen)
    flat(ctx, (c) => { c.moveTo(9.6, 10.6); c.quadraticCurveTo(14, 8.8, 18.2, 10.4); c.quadraticCurveTo(17.6, 17.6, 13.6, 17.4); c.quadraticCurveTo(9.8, 16.8, 9.6, 10.6); c.closePath(); }, C.mouth, 1.8);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(10.5, 11); ctx.quadraticCurveTo(14, 9.8, 17.4, 10.9); ctx.lineTo(17.2, 12.2); ctx.quadraticCurveTo(13.9, 11.5, 10.7, 12.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(13.9, 15.6, 2.8, 1.3, 0, 0, TAU); ctx.fill();
  } else if (m === 'talkO' || m === 'surprised') {
    flat(ctx, (c) => ellipse(c, 13.8, 12.8, m === 'surprised' ? 2.1 : 2.5, m === 'surprised' ? 2.9 : 2.1), C.mouth, 1.7);
    if (m === 'talkO') { ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(13.8, 13.8, 1.5, 0.8, 0, 0, TAU); ctx.fill(); }
  } else if (m === 'ouch') {
    flat(ctx, (c) => { c.moveTo(10.6, 13); c.quadraticCurveTo(12.6, 11.2, 14.6, 13); c.quadraticCurveTo(16, 14.8, 17.6, 13); c.quadraticCurveTo(14, 16.8, 10.6, 13); c.closePath(); }, C.mouth, 1.6);
  } else if (m === 'ko') {
    ink(ctx, (c) => { c.moveTo(10.6, 13.5); c.quadraticCurveTo(12.6, 12, 14.6, 13.5); c.quadraticCurveTo(16.2, 15, 17.6, 13.5); }, 1.6);
  } else if (m === 'worried') {
    ink(ctx, (c) => { c.moveTo(11, 14); c.quadraticCurveTo(14, 12, 17.2, 13.6); }, 1.7);
  } else if (m === 'focus') {
    // set jaw: a short firm line, pulled down at the corner
    ink(ctx, (c) => { c.moveTo(10.8, 12.4); c.quadraticCurveTo(14, 12, 17.4, 13.4); }, 1.9);
  } else if (m === 'grin' || m === 'happy') {
    flat(ctx, (c) => { c.moveTo(9.8, 10.8); c.quadraticCurveTo(13.8, 12.6, 17.9, 10.2); c.quadraticCurveTo(16.6, 16.2, 12.9, 15.9); c.quadraticCurveTo(10.2, 15.2, 9.8, 10.8); c.closePath(); }, m === 'happy' ? C.mouth : '#fff', 1.7);
    if (m === 'happy') { ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(13.4, 14.5, 2.3, 1.05, 0, 0, TAU); ctx.fill(); }
  } else if (m === 'smug' || m === 'wink') {
    ink(ctx, (c) => { c.moveTo(10.4, 12.8); c.quadraticCurveTo(14.2, 14.8, 17.8, 11.2); }, 1.8);
  } else {
    // calm: a small confident smile
    ink(ctx, (c) => { c.moveTo(10.8, 12.6); c.quadraticCurveTo(14, 14.6, 17.4, 12.2); }, 1.8);
  }
}
/**
 * Book-style eye: the iris nearly fills it (white only as small wedges at the corners), and a heavy upper lid
 * clips its top.  mode 0 open, 1 hard (focus / yell: lid down to y - ry*0.55, slanted 1.2 px down toward the nose),
 * 2 wide (surprised / cast: lid up, a smaller iris so white shows round it).  outer = -1 near eye, +1 far eye.
 */
function eye(ctx, x, y, rx, ry, outer, lx, ly, mode) {
  ctx.fillStyle = C.eyeW;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.clip();
  // open: the near eye shows a thin white sliver under the iris; the small far eye stays filled (a white ring
  // round both reads as spectacles at scale 1)
  const near = outer < 0;
  const ir = Math.min(rx * (near ? 0.95 : 1.06), ry * 0.9) * (mode === 2 ? 0.78 : 1);
  const ix = x + lx * 0.7 + (!near && mode === 0 ? 0.4 : 0), iy = y + (mode === 0 && near ? -0.1 : 0.6) + ly;
  ctx.fillStyle = C.eye; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
  ctx.fillStyle = C.eyeL; ctx.beginPath(); ctx.arc(ix, iy + ir * 0.48, ir * 0.55, 0, TAU); ctx.fill();
  ctx.fillStyle = C.eyeD; ctx.beginPath(); ctx.arc(ix, iy - ir * 0.05, ir * 0.46, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(ix - ir * 0.38, iy - ir * 0.3, ir * 0.3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(ix + ir * 0.4, iy + ir * 0.4, ir * 0.13, 0, TAU); ctx.fill();
  // the upper lid (skin above the lash line) clips the iris
  const xo = x + outer * (rx + 0.5), xi = x - outer * (rx + 0.5);
  let lo, li, lm;
  if (mode === 1) { lo = y - ry * 0.55; li = lo + 1.2; lm = (lo + li) / 2 - 0.3; }
  else if (mode === 2) { lo = y - ry * 0.5; li = y - ry * 0.45; lm = y - ry * 1.3; }
  else { lo = y - ry * 0.5; li = y - ry * 0.45; lm = y - ry * 1.12; }   // open: a round lid, barely clipping the iris
  ctx.fillStyle = C.skin;
  ctx.beginPath(); ctx.moveTo(xo, lo); ctx.quadraticCurveTo(x, lm, xi, li); ctx.lineTo(xi, y - ry - 2); ctx.lineTo(xo, y - ry - 2); ctx.closePath(); ctx.fill();
  ctx.restore();
  // heavy lash line along the lid edge, a flick at the near eye's outer corner
  ctx.strokeStyle = INK; ctx.lineWidth = outer < 0 ? 1.7 : 1.5;
  ctx.save(); ctx.beginPath();
  if (outer < 0) ctx.rect(xo - 4, y - ry - 4, (x + rx * 0.45) - (xo - 4), ry * 2); else ctx.rect(x - rx * 0.45, y - ry - 4, rx * 2, ry * 2);
  ctx.clip();
  ctx.beginPath(); ctx.moveTo(xo, lo); ctx.quadraticCurveTo(x, lm, xi, li); ctx.stroke();
  ctx.restore();
  if (outer < 0) {
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(xo + 0.6, lo + 0.2); ctx.lineTo(xo - 1.4, lo - 1.4); ctx.stroke();
  }
}

// -------------------------------------------------- hat (head frame)
const CH = new Float64Array(6), CHY = new Float64Array(6), CW = new Float64Array(6);
const HL = new Float64Array(12), HR = new Float64Array(12);
function hatCone(c) {
  c.moveTo(HL[0], HL[1]);
  for (let i = 1; i < 4; i++) c.quadraticCurveTo(HL[i * 2], HL[i * 2 + 1], (HL[i * 2] + HL[i * 2 + 2]) / 2, (HL[i * 2 + 1] + HL[i * 2 + 3]) / 2);
  c.quadraticCurveTo(HL[8], HL[9], CH[4] + (CH[4] - CH[3]) * 0.15, CHY[4] + (CHY[4] - CHY[3]) * 0.15);
  c.quadraticCurveTo(HR[8], HR[9], (HR[8] + HR[6]) / 2, (HR[9] + HR[7]) / 2);
  for (let i = 3; i > 0; i--) c.quadraticCurveTo(HR[i * 2], HR[i * 2 + 1], (HR[i * 2] + HR[i * 2 - 2]) / 2, (HR[i * 2 + 1] + HR[i * 2 - 1]) / 2);
  c.lineTo(HR[0], HR[1]);
  c.quadraticCurveTo(CH[0], CHY[0] + 2.5, HL[0], HL[1]);
  c.closePath();
}
function hatCreases(c) {
  c.strokeStyle = C.hatL; c.lineWidth = 1.3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-3.5, -21); c.quadraticCurveTo(-3, -30, CH[2] - 1.5, CHY[2] + 1); c.stroke();
  c.beginPath(); c.moveTo(7.5, -22); c.quadraticCurveTo(5, -31, CH[2] + 2, CHY[2] + 4); c.stroke();
  c.beginPath(); c.moveTo(CH[2] - 2.2, CHY[2] + 0.5); c.quadraticCurveTo(CH[3] + 1, CHY[3] + 3, CH[3] + 2.5, CHY[3] + 1); c.stroke();
}
function hat(ctx, p) {
  ctx.save();
  ctx.translate(2, -14); ctx.rotate(p.hatTilt * DEG); ctx.translate(-2, 14 - p.hatLift);
  // brim: top surface lit, the underside dark along the front edge
  celP(ctx, P2('brim', (c) => ellipse(c, 2.5, -14, 26.5, 5.6, -0.07)), C.hat, C.hatD, 1.2, 2.8, C.hatH, brimDetail);
  // cone: a chain base -> bend -> floppy tip (the tip's two joints lag on the spring)
  const h = SM.hat, q = p.hatSq;
  const a0 = -12 * DEG, a1 = (-40 - h * 0.35 - (1 - q) * 25) * DEG, a2 = (-95 - h * 1.1 - (1 - q) * 30) * DEG;
  CH[0] = 2; CHY[0] = -16; CW[0] = 11.2;
  CH[1] = 1; CHY[1] = -16 - 10.5 * q; CW[1] = 7.8;
  CH[2] = CH[1] + Math.sin(a0) * 8.5 * q; CHY[2] = CHY[1] - Math.cos(a0) * 8.5 * q; CW[2] = 5.2;
  CH[3] = CH[2] + Math.sin(a1) * 8; CHY[3] = CHY[2] - Math.cos(a1) * 8; CW[3] = 3.4;
  CH[4] = CH[3] + Math.sin(a2) * 10; CHY[4] = CHY[3] - Math.cos(a2) * 10; CW[4] = 0.7;
  for (let i = 0; i < 5; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(4, i + 1);
    const dx = CH[i1] - CH[i0], dy = CHY[i1] - CHY[i0], L = Math.hypot(dx, dy) || 1;
    const nx = dy / L, ny = -dx / L;
    HL[i * 2] = CH[i] + nx * CW[i]; HL[i * 2 + 1] = CHY[i] + ny * CW[i];
    HR[i * 2] = CH[i] - nx * CW[i]; HR[i * 2 + 1] = CHY[i] - ny * CW[i];
  }
  cel(ctx, hatCone, C.hat, C.hatD, { k: 1.4, hi: C.hatH, lw: 2.8, detail: hatCreases });
  rim(ctx, hatCone, 2.8, 1.4);
  // band + brass buckle
  celP(ctx, P2('band', (c) => {
    c.moveTo(-9.4, -16.4); c.quadraticCurveTo(2, -13.4, 13.4, -16.2); c.lineTo(12.6, -21.6);
    c.quadraticCurveTo(2, -19.4, -8.4, -21.8); c.closePath();
  }), C.band, C.bandD, 1, 2.3, null, (c) => {
    c.strokeStyle = C.bandD; c.lineWidth = 1; c.setLineDash([1.4, 1.6]);
    c.beginPath(); c.moveTo(-8, -17.8); c.quadraticCurveTo(0, -15.6, 4.5, -16); c.stroke(); c.setLineDash([]);
  });
  celP(ctx, P2('hatbuckle', (c) => { c.rect(5.2, -22.4, 6.6, 7.2); }), C.brass, C.brassD, 0.6, 1.6, C.brassH);
  ctx.fillStyle = C.bandD; ctx.fillRect(7, -20.6, 3, 3.6);
  ctx.restore();
}
function brimDetail(c) {
  c.fillStyle = C.hatU; c.beginPath(); c.ellipse(2.5, -12.2, 26.5, 4.4, -0.07, 0.15, Math.PI - 0.1); c.lineTo(-23, -13.5); c.fill();
  c.strokeStyle = C.hatL; c.lineWidth = 1.2; c.beginPath(); c.ellipse(2.5, -14.4, 22, 3.6, -0.07, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
}

// -------------------------------------------------- arms (hip frame)
function arm(ctx, A, far, hand) {
  const base = far ? C.cloakD : C.cloak, dark = far ? C.cloakIn : C.cloakD;
  ctx.save();
  ctx.translate(A.sx, A.sy);
  ctx.rotate(-A.a1 * DEG);
  const k = A.k || 1, UL = UPPER * k, FL = FORE * k;
  if (k === 1) celP(ctx, P2('upper', (c) => capsule(c, UPPER, 10, 11)), base, dark, 1.2, 2.7);
  else cel(ctx, (c) => capsule(c, UL, 10, 11), base, dark, { k: 1.2, lw: 2.7 });
  ctx.translate(0, UL);
  ctx.rotate(-A.a2 * DEG);
  // the bell sleeve hangs plumb: world-down in the forearm frame (+ a little lag)
  const ar = (A.a1 + A.a2) * DEG;
  let dnx = -Math.sin(ar), dny = Math.cos(ar);
  dnx -= SM.sleeve * 0.06 * Math.cos(ar);
  const up = Math.max(0, -dny), h = Math.min(1, Math.abs(dnx));
  const L = FL - 4.5 - up * 4;
  const sg = dnx >= 0 ? 1 : -1;                 // which local side hangs
  const hang = 2 + 7 * h;
  // opening: the up-side lip by the wrist, the down-side lip hanging
  const ux = -sg * 6.2, uy = L, dx0 = sg * 7.6 + dnx * hang, dy0 = L + 1 + dny * hang;
  // wrist (indigo under-sleeve) + hand
  ctx.fillStyle = far ? C.tunicD : C.tunic; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.rect(-3.6, L - 3, 7.2, FL - L - 0.5); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(0, FL);
  handShape(ctx, hand, far, A.a1 + A.a2);
  ctx.restore();
  const sleeve = (c) => {
    c.moveTo(-sg * 5, -1.5);
    c.quadraticCurveTo(-sg * 6.2, L * 0.5, ux, uy);
    c.quadraticCurveTo((ux + dx0) / 2 + 1.5, (uy + dy0) / 2 + 3, dx0, dy0);
    c.quadraticCurveTo(sg * 8 + dnx * hang * 0.4, L * 0.45 + dny * hang * 0.3, sg * 5.4, -1.5);
    c.closePath();
  };
  cel(ctx, sleeve, base, dark, { k: 1.3, hi: far ? null : C.cloakH, lw: 2.7, detail: (c) => {
    c.strokeStyle = far ? C.cloakIn : C.cloakL; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(sg * 1.5, 1); c.quadraticCurveTo(sg * 3 + dnx * hang * 0.3, L * 0.6, (ux * 0.3 + dx0 * 0.7), (uy * 0.3 + dy0 * 0.7) - 1.5); c.stroke();
  } });
  // gold rim round the opening
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ux, uy); ctx.quadraticCurveTo((ux + dx0) / 2 + 1.5, (uy + dy0) / 2 + 3, dx0, dy0);
  ctx.strokeStyle = INK; ctx.lineWidth = 4.6; ctx.stroke();
  ctx.strokeStyle = far ? C.goldD : C.gold; ctx.lineWidth = 2.3; ctx.stroke();
  ctx.restore();
}
function handShape(ctx, kind, far, abs) {
  const sk = far ? C.skinF : C.skin, skd = far ? C.skinFD : C.skinD;
  if (kind === 'grip') {
    // fist round the shaft, knuckles along the staff
    const rel = (180 - ST.sa) - abs;
    ctx.rotate(-rel * DEG);
    celP(ctx, P2('fist', (c) => blob(c, [[-3.8, -4.6], [3, -4.8], [4.6, -1], [4.2, 3.6], [-0.5, 5], [-4.4, 2.8], [-4.8, -1.5]], 0.6)), sk, skd, 0.8, 2.3);
    ctx.strokeStyle = skd; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(1.2, -2.4); ctx.lineTo(4, -2.2); ctx.moveTo(1.2, 0.2); ctx.lineTo(4.3, 0.4); ctx.moveTo(1, 2.8); ctx.lineTo(3.8, 2.8); ctx.stroke();
  } else if (kind === 'fist') {
    celP(ctx, P2('fistFree', (c) => blob(c, [[-4, -3.5], [3.6, -3.6], [5, 0.5], [3.4, 4.4], [-3, 4.4], [-4.8, 0.5]], 0.6)), sk, skd, 0.8, 2.3);
  } else if (kind === 'point') {
    celP(ctx, P2('point', (c) => {
      c.moveTo(-4, -3.5); c.lineTo(3, -3.5); c.lineTo(3.4, 1); c.lineTo(2.4, 9.5); c.quadraticCurveTo(1, 11, -0.4, 9.5);
      c.lineTo(-0.6, 4.5); c.quadraticCurveTo(-4, 5, -4.6, 1.5); c.closePath();
    }), sk, skd, 0.8, 2.2);
  } else if (kind === 'cast') {
    celP(ctx, P2('cast', (c) => {
      c.moveTo(-3.6, -3); c.lineTo(3.6, -3); c.lineTo(6.5, 1.5); c.lineTo(4.4, 2.6); c.lineTo(5, 7.6); c.lineTo(3, 8);
      c.lineTo(1.6, 4.5); c.lineTo(0.6, 9); c.lineTo(-1.6, 8.6); c.lineTo(-1.6, 4.4); c.lineTo(-3.6, 7.6); c.lineTo(-5, 6.4); c.lineTo(-4.4, 1); c.closePath();
    }), sk, skd, 0.8, 2.1);
  } else {
    celP(ctx, P2('open', (c) => {
      c.moveTo(-3.6, -3); c.lineTo(3.4, -3); c.quadraticCurveTo(6, 0, 5.6, 2.6); c.lineTo(3.8, 2.4); c.lineTo(3.6, 6.6);
      c.quadraticCurveTo(0, 9.4, -3.4, 6.8); c.quadraticCurveTo(-4.6, 2, -3.6, -3); c.closePath();
    }), sk, skd, 0.8, 2.2);
  }
}

// -------------------------------------------------- staff (drawn along local -y from the butt)
const SHAFT_L = [[-2.3, 0], [-2.5, -20], [-2.2, -36], [-3.2, -42], [-2.3, -48], [-2.6, -68], [-2.2, -84], [-3.1, -90], [-2.6, -97], [-3.3, -STAFF + 4]];
const SHAFT_R = [[2.3, 0], [2.3, -22], [2.9, -28], [2.3, -34], [2.6, -58], [3.2, -64], [2.5, -70], [2.4, -94], [3.2, -STAFF + 4]];
const Y0 = -STAFF;
// roots: two strands wind round the top of the shaft (back halves behind it, front halves over it)
const ROOT_A = [[2.6, Y0 + 30], [3.6, Y0 + 25], [0.5, Y0 + 20], [-3.4, Y0 + 15], [-2.8, Y0 + 9], [1.5, Y0 + 5], [3.4, Y0 + 1]];
const ROOT_B = [[-2.8, Y0 + 26], [-3.6, Y0 + 21], [-0.4, Y0 + 16], [3.3, Y0 + 12], [3.6, Y0 + 7], [-0.5, Y0 + 3], [-3.2, Y0]];
function rootPath(front) {
  return (c) => {
    for (const R of [ROOT_A, ROOT_B]) {
      for (let i = 1; i < R.length; i++) {
        const goingRight = R[i][0] > R[i - 1][0];
        if (goingRight !== front) continue;
        c.moveTo(R[i - 1][0], R[i - 1][1]);
        c.quadraticCurveTo((R[i - 1][0] + R[i][0]) / 2 + (front ? 0 : 0), (R[i - 1][1] + R[i][1]) / 2, R[i][0], R[i][1]);
      }
    }
    if (front) {
      // a knotty spur and the claws cradling the crystal
      c.moveTo(3.4, Y0 + 18); c.lineTo(6.4, Y0 + 15.5);
      c.moveTo(-2.6, Y0 + 2); c.quadraticCurveTo(-9.4, Y0 - 3, -7.6, Y0 - 11.5); c.quadraticCurveTo(-7.2, Y0 - 14.5, -5, Y0 - 16);
      c.moveTo(2.6, Y0 + 2); c.quadraticCurveTo(9.8, Y0 - 3.5, 7.8, Y0 - 12); c.quadraticCurveTo(7.6, Y0 - 14.6, 5.4, Y0 - 15.6);
      c.moveTo(0.4, Y0 + 2); c.quadraticCurveTo(3.2, Y0 - 3, 1.4, Y0 - 7.5);
    }
  };
}
const CRY = (c) => {
  c.moveTo(0, Y0 + 3); c.lineTo(-6.2, Y0 - 4); c.lineTo(-6.8, Y0 - 14.5); c.lineTo(0.8, Y0 - CRYS);
  c.lineTo(6.6, Y0 - 15); c.lineTo(6.2, Y0 - 4); c.closePath();
};
function staff(ctx) {
  const sk = ST.sk;
  ctx.save();
  ctx.translate(ST.bx, ST.by);
  ctx.rotate(ST.sa * DEG);
  if (sk !== 1) ctx.scale(1, sk);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const back = P2('rootB', rootPath(false)), front = P2('rootF', rootPath(true));
  ctx.strokeStyle = INK; ctx.lineWidth = 3.8; ctx.stroke(back);
  ctx.strokeStyle = C.woodD; ctx.lineWidth = 1.9; ctx.stroke(back);
  celP(ctx, P2('shaft', (c) => {
    c.moveTo(SHAFT_L[0][0], 0);
    for (let i = 1; i < SHAFT_L.length; i++) c.lineTo(SHAFT_L[i][0], SHAFT_L[i][1]);
    c.quadraticCurveTo(0, -STAFF - 1, SHAFT_R[SHAFT_R.length - 1][0], SHAFT_R[SHAFT_R.length - 1][1]);
    for (let i = SHAFT_R.length - 2; i >= 0; i--) c.lineTo(SHAFT_R[i][0], SHAFT_R[i][1]);
    c.quadraticCurveTo(0, 1.5, SHAFT_L[0][0], 0);
    c.closePath();
  }), C.wood, C.woodD, 0.9, 2.4, C.woodH, staffGrain);
  // brass ferrule at the butt
  celP(ctx, P2('ferrule', (c) => { c.rect(-2.9, -7.5, 5.8, 8); }), C.brass, C.brassD, 0.6, 1.8, C.brassH);
  ctx.strokeStyle = C.brassD; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2.6, -3.6); ctx.lineTo(2.6, -3.6); ctx.stroke();
  // crystal (unsquashed even when the staff is foreshortened; turned round when the staff points away)
  ctx.save();
  if (sk !== 1) { ctx.scale(1, 1 / sk); ctx.translate(0, Y0 * sk); if (sk < 0) ctx.rotate(Math.PI); ctx.translate(0, -Y0); }
  const hot = GL > 0.6;
  celP(ctx, P2('crys', CRY), hot ? C.crysB : C.crys, hot ? C.crysM : C.crysD, 0.7, 0, null);
  ctx.fillStyle = hot ? '#ffffff' : C.crysH;
  ctx.fill(P2('facetL', (c) => { c.moveTo(0, Y0 + 3); c.lineTo(-6.2, Y0 - 4); c.lineTo(-6.8, Y0 - 14.5); c.lineTo(0.8, Y0 - CRYS); c.lineTo(-1.6, Y0 - 15); c.lineTo(-1.4, Y0 - 2); c.closePath(); }));
  ctx.fillStyle = hot ? C.crys : C.crysM;
  ctx.fill(P2('facetR', (c) => { c.moveTo(0, Y0 + 3); c.lineTo(2.1, Y0 - 2); c.lineTo(2.3, Y0 - 15.5); c.lineTo(0.8, Y0 - CRYS); c.lineTo(6.6, Y0 - 15); c.lineTo(6.2, Y0 - 4); c.closePath(); }));
  ctx.strokeStyle = hot ? C.crysM : C.crysD; ctx.lineWidth = 0.9;
  ctx.stroke(P2('facets', (c) => { c.moveTo(-1.4, Y0 - 2); c.lineTo(-1.6, Y0 - 15); c.lineTo(0.8, Y0 - CRYS); c.moveTo(2.1, Y0 - 2); c.lineTo(2.3, Y0 - 15.5); c.moveTo(-6.8, Y0 - 14.5); c.lineTo(-1.6, Y0 - 15); c.lineTo(2.3, Y0 - 15.5); c.lineTo(6.6, Y0 - 15); }));
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-4, Y0 - 12); ctx.lineTo(-3.1, Y0 - 9); ctx.lineTo(-4, Y0 - 6); ctx.lineTo(-4.9, Y0 - 9); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(P2('crys', CRY));
  ctx.restore();
  // roots over the shaft and round the crystal
  ctx.strokeStyle = INK; ctx.lineWidth = 3.8; ctx.stroke(front);
  ctx.strokeStyle = C.wood; ctx.lineWidth = 1.9; ctx.stroke(front);
  ctx.restore();
}
function staffGrain(c) {
  c.strokeStyle = C.woodL; c.lineWidth = 1;
  c.beginPath(); c.moveTo(-0.6, -10); c.quadraticCurveTo(0.4, -30, -0.8, -46); c.moveTo(0.8, -52); c.quadraticCurveTo(-0.2, -72, 0.9, -92);
  c.moveTo(-1.4, -40); c.quadraticCurveTo(-0.2, -42, -1.4, -44.5); c.moveTo(1.5, -26); c.quadraticCurveTo(0.3, -28, 1.5, -30.5);
  c.stroke();
}

// -------------------------------------------------- crystal glow, sparkles, charge motes (hip frame)
function glow(ctx, p, dim) {
  const pulse = 0.5 + 0.5 * Math.sin(T * 5.1) * Math.sin(T * 2.3 + 0.7);
  const g = GL * (dim ? 0.45 : 1);
  const r = 14 + 28 * g + 3 * pulse;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(0.2 + 0.62 * g + 0.1 * pulse, 0, 1);
  ctx.drawImage(glowSprite(), ST.cx - r, ST.cy - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prev;
  if (p.charge > 0.02) motes(ctx, p.charge);
  const sp = Math.max(p.spark, GL > 0.85 ? (GL - 0.85) * 6 : 0);
  if (sp > 0.02) {
    const tx = ST.cx + ST.dx * 11 * ST.sk, ty = ST.cy + ST.dy * 11 * ST.sk;
    sparkle(ctx, tx + 1, ty - 1, (5 + 4 * pulse) * Math.min(1, sp), T * 2);
    if (sp > 0.5) sparkle(ctx, ST.cx - 8, ST.cy + 5, 3.2 * (0.5 + 0.5 * Math.sin(T * 7)), -T * 3);
  }
}
function sparkle(ctx, x, y, s, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a * 0.3);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
  ctx.fill();
  ctx.restore();
}
function motes(ctx, k) {
  ctx.fillStyle = '#d8f6ff';
  for (let i = 0; i < 6; i++) {
    const u = (T * 1.7 + i / 6) % 1, a = i * 1.05 + T * 3, r = 28 * (1 - u) + 4;
    ctx.globalAlpha = clamp(k * (0.3 + u), 0, 1);
    const x = ST.cx + Math.cos(a) * r, y = ST.cy + Math.sin(a) * r * 0.8, s = 1.2 + u * 1.6;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// -------------------------------------------------- swing smear (hip frame): a crescent swept by the crystal
// angles as for the staff (0 = up, 90 = forward), radius sr round (scx, scy), squashed vertically by sfl
function smear(ctx, p) {
  const a0 = p.sa0, a1 = p.sa1, R = p.sr, n = 18, fl = p.sfl;
  ctx.save();
  ctx.translate(p.scx, p.scy);
  for (let pass = 0; pass < 2; pass++) {
    const w = pass ? 9 : 22, off = pass ? 2 : 0;
    ctx.globalAlpha = clamp(p.smear, 0, 1) * (pass ? 0.95 : 0.6);
    ctx.fillStyle = pass ? '#ffffff' : '#bfeaff';
    ctx.beginPath();
    const ro = R + 5 - off;
    for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * (i / n)) * DEG; ctx.lineTo(Math.sin(a) * ro, -Math.cos(a) * ro * fl); }
    for (let i = n; i >= 0; i--) {
      const u = i / n, a = (a0 + (a1 - a0) * u) * DEG, th = 1 + w * Math.pow(u, 0.9);
      ctx.lineTo(Math.sin(a) * (ro - th), -Math.cos(a) * (ro * fl - th * Math.max(fl, 0.7)));
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
// thrust speed lines trailing the crystal
function speedLines(ctx, p) {
  ctx.save();
  ctx.translate(ST.cx, ST.cy); ctx.rotate(ST.sa * DEG);
  ctx.strokeStyle = '#e6f8ff'; ctx.lineCap = 'round';
  ctx.globalAlpha = clamp(p.ln, 0, 1) * 0.85;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 8, y0 = 14 + (i % 2) * 6, L = 24 + (i === 1 ? 16 : 0);
    ctx.lineWidth = i === 1 ? 2.6 : 1.8;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + L); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------- measurements (local px, facing right, scale 1)
/** crystal centre (or its tip) for a pose: where the engine puts bursts, the beam and the starfall */
export function crystalOf(pose, tip = false) {
  const hipY = hipHeight(pose);
  TORA = pose.tor * DEG; ROT = pose.rot;
  place(pose, hipY);
  let x = ST.cx, y = ST.cy;
  if (tip) { x = ST.bx + ST.dx * (SL + 1) * ST.sk; y = ST.by + ST.dy * (SL + 1) * ST.sk; }
  if (pose.rot) { const a = -pose.rot * DEG, c = Math.cos(a), s = Math.sin(a); const xx = x * c - y * s; y = x * s + y * c; x = xx; }
  x += pose.x; y += hipY;
  if (pose.sq !== 1) { x /= Math.sqrt(pose.sq); y *= pose.sq; }
  return [Math.round(x * ART), Math.round(y * ART)];
}
/** where the carried object's bottom-centre sits (between her raised hands) */
function carryPoint(pose) {
  const hipY = hipHeight(pose);
  TORA = pose.tor * DEG; ROT = pose.rot;
  place(pose, hipY);
  return [Math.round(((AN.hx + AF.hx) / 2 + pose.x) * ART), Math.round((Math.min(AN.hy, AF.hy) - 5 + hipY) * ART)];
}
/** pose geometry for QA tools (hip frame, before rot): head centre + angle, staff ends, arm joints, floor */
export function rigOf(pose) {
  const hipY = hipHeight(pose);
  TORA = pose.tor * DEG; ROT = pose.rot;
  place(pose, hipY);
  const hr = (pose.tor + pose.head) * DEG;
  rotT(NECK[0], NECK[1]);
  const hx = RX + HEADC[0] * Math.cos(hr) - HEADC[1] * Math.sin(hr), hy = RY + HEADC[0] * Math.sin(hr) + HEADC[1] * Math.cos(hr);
  const el = (A) => [A.sx + Math.sin(A.a1 * DEG) * UPPER, A.sy + Math.cos(A.a1 * DEG) * UPPER];
  return { hipY, hs: HS, head: [hx, hy, hr], staff: [ST.bx, ST.by, ST.bx + ST.dx * SL * ST.sk, ST.by + ST.dy * SL * ST.sk],
    near: [AN.sx, AN.sy, ...el(AN), AN.hx, AN.hy], far: [AF.sx, AF.sy, ...el(AF), AF.hx, AF.hy], farGrip: AF.grip, floor: FLOORY,
    knees: [KN.x, KN.y, KF.x, KF.y] };
}
export const SHOOT_ORIGIN = crystalOf(ANIM.shoot(0.6), true);
/** where her hands actually are in carryIdle (should sit at CARRY_POINT; for QA) */
export const CARRY_HANDS = carryPoint(ANIM.carryIdle(0));
export const ATK3_CRYSTAL = crystalOf(ANIM.atk3(0.35));
export const SLAM_POINT = crystalOf(ANIM.atk4(0.5), true);
export const META = { id: 'ana', name: 'Anastasia', height: 166, hurtW: 21, hurtH: 132 };
