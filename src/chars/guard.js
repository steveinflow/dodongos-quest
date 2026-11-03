// Royal Drake Guard: the Dragon King's elite palace guard (heavy regular enemy, 1-2 at a time).
//
// A tall drake-knight (~205 px to the top of the fin crest at scale 1): slate-indigo scales, gunmetal-and-gold
// plate with green gems, a helm with a black dragon-fin crest (gold spines, crimson tassel) and a black-gold
// dragon-snout visor over the upper snout (his fierce yellow eye, lower jaw and fangs show), a crimson cape, a short
// armoured tail.  A chin-to-shin TOWER SHIELD (gold rim, the King's glowing green crown sigil) on his far arm, held
// in front; a long gold-banded spear in his near hand, held UPRIGHT except when attacking (a level spear = thrust
// coming, with a tip glint).  Not collared: he serves the King gladly (poofs when beaten).
// Exports: draw, ANIM, BASE, measure(pose) -> { tip, shield, hipY }, HEIGHT, HURTBOX, SPEAR_TIP, BASH_POINT,
// GUARD_SHIELD.  Loops take t: idle, guard, taunt; walk takes ph; the rest take k.
//
// Local space as for the other rigs: origin on the floor under the hips, +x = facing, y down; limb angles in degrees,
// + = swung forward.  `air: true` = no ground solve, hip at AIR_HIP + pose.y.
// Shield: centre (shx, shy) in the TORSO frame, sht tilt (deg, + = top tipped forward), shw width (3/4 turn,
// 1 = full face), shBack draws it behind the body (knocked wide).  The far arm reaches its grip by IK.
// Spear: plant 1 = butt on the floor at px (hip frame), else free grip (gx, gy) in the hip frame; wa = shaft angle
// (0 = level forward, 90 = straight up, negative = tip down), wb = butt -> grip distance; the near hand slides along
// the shaft when it can't reach.  held 'drop' = lying on the floor at gx (near arm then by FK au/af).
import { cel, flat, ink, capsule, blob, ellipse, circle, keys, mix, DEG, TAU, legDrop, clamp, lerp, follow } from '../rig.js';
import { INK } from '../config.js';

const C = {
  sc: '#4f5c9e', scD: '#333e78', scH: '#8796d8', scL: '#414d8a', scF: '#394480', scFD: '#252d5c',
  bel: '#e6d9ae', belD: '#b5a77b',
  iron: '#4b5574', ironD: '#283048', ironH: '#b0bde2', ironL: '#606c90', ironF: '#38405c', ironFD: '#1f2438',
  gold: '#f2c14a', goldD: '#a8741c', goldH: '#fff3b4', goldF: '#c89634',
  gem: '#62ff8c', gemD: '#13a845', gemC: '#eaffdf', glow: '#5cff7e',
  cape: '#b8283c', capeD: '#741628', capeH: '#de4a5c', capeL: '#4e0f1c',
  shaft: '#3b2a2a', shaftD: '#211617',
  blade: '#bcc5d2', bladeD: '#6d7686', bladeH: '#f2f6fb',
  claw: '#efe6cc', clawD: '#b9ae8d',
  eye: '#ffd23c', eyeD: '#e08a12', pupil: '#24100a',
  mouth: '#3a1420', tongue: '#d4607a', tooth: '#fffaf0',
  rim: '#d4dcff', spark: '#fff6b8', sparkD: '#ffb52e', star: '#ffe45c',
};

// ---------------------------------------------------------------- skeleton (px at scale 1)
const THIGH = 32, SHIN = 31, FOOT = 11;
const UPPER = 29, FORE = 27;
const HIP_N = [-6, 2], HIP_F = [8, -1];
const SH_N = [-12, -70], SH_F = [6, -74];
const NECK = [14, -88];
const HS = 1.22;                        // head scale (line widths divided back)
const TAIL0 = [-20, -4];
const AIR_HIP = -70;
const RIG = 0.92;                        // overall size trim (keeps the tuned pose numbers)
const SHAFT = 204, BLADE = 30;         // spear: butt (u = 0) .. socket (u = SHAFT) .. tip (u = SHAFT + BLADE)

// ---------------------------------------------------------------- poses
export const BASE = {
  x: 0, y: 0, rot: 0, sq: 1, tor: 4, head: 2, jaw: 0,
  nt: -10, ns: -14, nf: 0, ft: 14, fs: -18, ff: 0,
  shx: 44, shy: -26, sht: -2, shw: 0.8, shBack: false,
  held: 'hand', plant: 1, px: -16, gx: -14, gy: -30, wa: 90, wb: 50, au: 20, af: 30,
  fu: 30, fe: 40,                         // far arm FK (only when the shield is dropped -- never in this set)
  cape: 0, tl: 0, tc: 0, tsw: 1,
  spark: 0, smear: 0, sk: 'thrust', sl: 90, glint: 0, sflash: 0, dust: 0,
  face: 'mean', air: false, blink: false, stars: false,
};
const P = (o) => Object.assign({}, BASE, o);

const IDLE = P({});
// braced behind the shield: low wide stance, head ducked so only the eyes clear the rim, the spear held upright
// behind it (a LEVEL spear always means an attack is coming -- the thrust wind-up must read differently)
const GUARD = P({ tor: 14, head: 14, nt: -26, ns: -34, ft: 30, fs: -50, shx: 50, shy: -33, sht: 4, shw: 0.84,
  plant: 1, px: -22, wa: 97, wb: 66, tl: 6, cape: 0.05 });
// spear levelled and drawn far back over the shield, elbow up, leaning back onto the sunk back leg; the tip glints
const TWIND = P({ x: -8, tor: -14, head: -6, nt: -38, ns: -46, ft: 28, fs: -40, shx: 46, shy: -34, sht: 4,
  plant: 0, gx: -62, gy: -86, wa: 2, wb: 92, tl: 14, cape: 0.12, face: 'mean', glint: 1 });
const TSTAB = P({ x: 16, tor: 14, head: -26, jaw: 0, nt: -40, ns: -8, ft: 38, fs: -52, shx: 48, shy: -10, sht: 8, shw: 0.84,
  plant: 0, gx: 46, gy: -56, wa: -6, wb: 90, tl: -6, cape: 0.5, face: 'grit', smear: 1, sk: 'thrust', sl: 120 });
// end of the bash wind-up: a low crouch, shield cocked against the shoulder, the sigil flaring
const BWIND = P({ x: -10, tor: 22, head: 16, nt: -36, ns: -44, ft: 34, fs: -64, shx: 32, shy: -42, sht: -10, shw: 0.72,
  plant: 0, gx: -16, gy: -40, wa: 98, wb: 60, tl: 14, cape: 0.15, face: 'mean', sflash: 1 });
const BHIT = P({ x: 24, tor: 30, head: 10, jaw: 18, nt: -44, ns: -6, ft: 44, fs: -56, shx: 66, shy: -42, sht: 8, shw: 0.86,
  plant: 0, gx: -4, gy: -46, wa: 64, wb: 60, tl: -10, cape: 0.7, face: 'yell', smear: 1, sk: 'bash' });
// on his back, the shield fallen on his chest like a turtle's lid, spear dropped beside him
const DOWN = P({ air: true, rot: 86, y: 52, tor: -2, head: -18, jaw: 12, nt: 30, ns: -40, nf: 20, ft: 50, fs: -50, ff: 30,
  shx: 30, shy: 30, sht: 4, shw: 0.9, held: 'drop', gx: 30, au: 150, af: 30, tl: -40, tc: -4, tsw: 0.3, face: 'ko', stars: true });
// kneeling, levering the spear up off the floor (butt planted, tip still lagging low)
const CROUCH = P({ tor: 26, head: 8, nt: 50, ns: -110, ft: 70, fs: -104, shx: 40, shy: -38, sht: -30, plant: 1, px: -40, wa: 50, wb: 104,
  tl: 4, face: 'mean' });

export const ANIM = {
  // shield up, spear planted; breathing, weight shift, blink, and every ~5 s he taps the spear on the floor
  idle(t) {
    const b = Math.sin(t * 2.4), w = Math.sin(t * 0.9);
    const cyc = t % 5.2, fid = cyc > 4.3 ? Math.sin((cyc - 4.3) / 0.9 * Math.PI) : 0;
    const tap = cyc > 4.3 ? Math.max(0, Math.sin((cyc - 4.3) / 0.9 * TAU * 2)) : 0;
    const p = P({ tor: 4 + b * 2 + w * 1.2, head: 2 - b * 2.6 - fid * 8, ns: -14 - b * 4 + w * 2, fs: -18 - b * 4 - w * 2,
      nt: -10 + b * 1.5 + w * 2, ft: 14 + b * 1.5 - w * 2, shy: -26 + b * 2, shx: 44 - w * 1.5, wa: 90 + fid * 4, px: -16 + fid * 2,
      wb: 50 + tap * 12, tl: 3 * b, face: fid > 0.4 ? 'smug' : 'mean' });
    p.blink = (t % 3.9) > 3.78;
    return p;
  },
  // shield-forward advance: measured heavy steps, the shield stays square to the front, spear carried upright
  walk(ph) {
    const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU), a = Math.abs(s);
    return P({ tor: 8 + 1.5 * a, head: 4 - 3 * a, y: -3 * (1 - a),
      nt: -4 + 26 * s, ns: -14 - 40 * Math.max(0, c), nf: 6 * s * Math.max(0, c),
      ft: 8 - 26 * s, fs: -14 - 40 * Math.max(0, -c), ff: -6 * s * Math.max(0, -c),
      shx: 46, shy: -28 + 2 * a, sht: 2 * s, plant: 0, gx: -12 - 4 * s, gy: -26 + 2 * a, wa: 88 + 3 * s, wb: 60,
      tl: 6 * s, tsw: 2, cape: 0.12 });
  },
  // braced behind the shield (loop)
  guard(t) {
    const b = Math.sin(t * 3);
    const p = P(Object.assign({}, GUARD, { tor: 14 + b * 1.5, head: 14 - b * 2, shy: -33 + b * 1.5, ns: -34 - b * 3, fs: -50 - b * 3, tl: 6 + 3 * b }));
    p.blink = (t % 3.5) > 3.4;
    return p;
  },
  // the shield takes a hit (12 f): shoved back and tilted, he squashes and skids, sparks fly, then braces with overshoot
  block: (k) => {
    const p = keys(k, [
      [0, P(Object.assign({}, GUARD, { x: -8, sq: 0.94, tor: 0, head: 4, jaw: 6, shx: 38, sht: -14, shw: 0.8, ns: -30, fs: -44, face: 'grit' }))],
      [0.25, P(Object.assign({}, GUARD, { x: -11, sq: 0.97, tor: 4, head: 8, shx: 40, sht: -9, face: 'grit' })), 'out'],
      [0.6, P(Object.assign({}, GUARD, { x: -9, tor: 18, head: 16, shx: 53, sht: 7 })), 'io'],
      [1, GUARD],
    ]);
    p.spark = clamp(1 - k * 1.6, 0, 1);
    p.dust = clamp(1 - k * 1.8, 0, 1);
    return p;
  },
  // bash telegraph (20 f): pulls the shield in edge-on and coils back onto the back foot, then drops into a crouch
  // with the shield cocked against his shoulder -- the sigil flares
  bashWind: (k) => {
    const p = keys(k, [
      [0, IDLE],
      [0.3, P({ x: -8, tor: -12, head: -10, nt: -24, ns: -26, ft: 30, fs: -40, shx: 26, shy: -36, sht: -16, shw: 0.58, plant: 0, gx: -22, gy: -40, wa: 106, wb: 60,
        tl: 10, face: 'mean' }), 'out'],
      [0.62, P({ x: -9, tor: -14, head: -12, nt: -26, ns: -30, ft: 32, fs: -44, shx: 24, shy: -36, sht: -18, shw: 0.56, plant: 0, gx: -24, gy: -40, wa: 108, wb: 60,
        tl: 12, face: 'mean' })],
      [1, BWIND, 'io'],
    ]);
    p.sflash = clamp((k - 0.62) / 0.3, 0, 1);
    return p;
  },
  // shield bash (22 f): contact at .35, starts recovering at .55, steps back with an overshoot, settles
  bash: (k) => keys(k, [
    [0, BWIND],
    [0.35, BHIT, 'snap'],
    [0.55, P(Object.assign({}, BHIT, { x: 22, tor: 24, shx: 60, sht: 6, smear: 0.3 })), 'out'],
    [0.8, P({ x: 10, tor: 6, head: 6, nt: -14, ns: -22, ft: 12, fs: -18, shx: 46, shy: -42, sht: 0, plant: 0, gx: -12, gy: -34, wa: 84, wb: 56,
      tl: 4, cape: 0.3 }), 'io'],
    [0.9, P({ x: 5, tor: -3, head: -2, plant: 0, gx: -14, gy: -32, wa: 88, wb: 54, cape: 0.15 })],
    [1, IDLE],
  ]),
  // thrust telegraph (26 f): levels the spear over the rim, then hauls it far back, elbow up, leaning back; the tip
  // glints and the arm trembles on the hold
  thrustWind: (k) => {
    const p = keys(k, [
      [0, IDLE],
      [0.35, P({ x: -2, tor: 2, head: 0, nt: -20, ns: -22, ft: 22, fs: -30, shy: -36, plant: 0, gx: -4, gy: -80, wa: 4, wb: 84, tl: 6 }), 'out'],
      [1, TWIND, 'io'],
    ]);
    if (k > 0.75) { p.gx += Math.sin(k * 90) * 1.5; p.gy += Math.sin(k * 130) * 1.5; }
    p.glint = clamp((k - 0.55) / 0.15, 0, 1);
    return p;
  },
  // long spear thrust over the shield (24 f): contact at .35, overshoot, settle
  thrust: (k) => keys(k, [
    [0, TWIND],
    [0.35, TSTAB, 'snap'],
    [0.55, P(Object.assign({}, TSTAB, { x: 18, tor: 16, gx: 52, smear: 0.35 }))],
    [0.78, P({ x: 10, tor: 8, head: 0, nt: -24, ns: -18, ft: 24, fs: -34, shy: -36, plant: 0, gx: 6, gy: -50, wa: 60, wb: 60, tl: 2, cape: 0.2 }), 'out'],
    [1, P({ x: 4 })],
  ]),
  // shield knocked wide (40 f): the arm flies out behind him, he stumbles back dazed and wide open, then fumbles the
  // shield back round to the front
  guardBreak: (k) => keys(k, [
    [0, P({ x: -10, tor: -20, head: -22, jaw: 20, nt: -12, ns: -20, ft: 30, fs: -24, shBack: true, shx: -40, shy: -112, sht: -38, shw: 0.62,
      plant: 0, gx: 30, gy: -70, wa: 128, wb: 60, tl: 20, tsw: 2, cape: 0.45, face: 'surprised' })],
    [0.22, P({ x: -18, tor: -16, head: -14, jaw: 16, nt: -34, ns: -16, ft: 34, fs: -50, ff: 16, shBack: true, shx: -50, shy: -96, sht: -50, shw: 0.55,
      plant: 0, gx: 34, gy: -60, wa: 110, wb: 60, tl: 14, tsw: 2, cape: 0.3, face: 'surprised' }), 'out'],
    [0.42, P({ x: -20, tor: -6, head: 6, jaw: 8, nt: -26, ns: -24, ft: 20, fs: -30, shBack: true, shx: -46, shy: -70, sht: -40, shw: 0.55,
      plant: 0, gx: 26, gy: -44, wa: 100, wb: 60, tl: 6, cape: 0.1, face: 'dazed', stars: true })],
    [0.64, P({ x: -19, tor: -12, head: -8, jaw: 10, nt: -20, ns: -22, ft: 24, fs: -28, shBack: true, shx: -44, shy: -64, sht: -34, shw: 0.56,
      plant: 0, gx: 28, gy: -40, wa: 96, wb: 60, tl: 8, cape: 0.15, face: 'dazed', stars: true })],
    [0.76, P({ x: -17, tor: -4, head: -10, jaw: 12, nt: -18, ns: -22, ft: 22, fs: -28, shBack: true, shx: -10, shy: -100, sht: -60, shw: 0.5,
      plant: 0, gx: 24, gy: -42, wa: 94, wb: 58, tl: 6, face: 'worried', stars: true }), 'io'],
    [0.86, P({ x: -15, tor: 10, head: 8, jaw: 6, nt: -18, ns: -26, ft: 24, fs: -34, shx: 52, shy: -54, sht: 18, shw: 0.74,
      plant: 0, gx: 20, gy: -40, wa: 92, wb: 56, tl: 4, face: 'grit' }), 'in'],
    [1, P({ x: -10, face: 'mean' })],
  ]),
  // high hit: head snaps back, the shield swings off-line (squash on the hit frame)
  hurt: (k) => keys(k, [
    [0, P({ x: -8, sq: 0.94, tor: -12, head: -20, jaw: 16, nt: -4, ns: -22, ft: 26, fs: -26, shx: 40, shy: -34, sht: -16, shw: 0.7,
      plant: 0, gx: 6, gy: -40, wa: 104, wb: 52, tl: 14, tsw: 2, cape: 0.25, face: 'ouch' })],
    [0.4, P({ x: -6, tor: -4, head: -8, jaw: 8, shx: 42, shy: -38, sht: -8, plant: 0, gx: 4, gy: -36, wa: 96, wb: 52, tl: 8, face: 'ouch' }), 'out'],
    [1, P({ x: -2, face: 'mean' })],
  ]),
  // low hit: doubles over the shield
  hurt2: (k) => keys(k, [
    [0, P({ x: -6, sq: 0.94, tor: 28, head: 22, jaw: 18, nt: -16, ns: -30, ft: 30, fs: -40, shx: 40, shy: -26, sht: 14, shw: 0.76,
      plant: 0, gx: -6, gy: -26, wa: 76, wb: 54, tl: 18, tsw: 2, cape: 0.3, face: 'ouch' })],
    [0.4, P({ x: -5, tor: 18, head: 14, jaw: 10, nt: -12, ns: -24, ft: 24, fs: -32, shx: 42, shy: -32, sht: 8,
      plant: 0, gx: -2, gy: -30, wa: 84, wb: 54, tl: 10, face: 'ouch' }), 'out'],
    [1, P({ x: -1, face: 'mean' })],
  ]),
  // knocked into the air (air): arms flung up, spear still clutched
  fly: P({ air: true, rot: 46, tor: -6, head: -20, jaw: 18, nt: 40, ns: -36, nf: 20, ft: 66, fs: -30, ff: 30,
    shx: 30, shy: -80, sht: -40, shw: 0.6, plant: 0, gx: 20, gy: -120, wa: 150, wb: 70, tl: -16, tc: 6, tsw: 2, cape: 0.8, face: 'ouch' }),
  down: DOWN,
  // rolls onto his shield elbow, sits up and reaches for the shaft, kneels levering the spear up off the floor (its
  // tip lagging), stands (32 f)
  getup: (k) => keys(k, [
    [0, P(Object.assign({}, DOWN, { face: 'ouch', stars: false }))],
    [0.25, P({ air: true, rot: 58, y: 50, tor: 6, head: -6, jaw: 8, nt: 70, ns: -92, nf: 10, ft: 58, fs: -78, ff: 10,
      shx: 44, shy: -12, sht: 2, shw: 0.72, held: 'drop', gx: 30, au: 96, af: 40, tl: -8, tc: -2, face: 'ouch' })],
    [0.45, P({ air: true, rot: 18, y: 54, tor: 40, head: 10, jaw: 4, nt: 96, ns: -126, nf: -30, ft: 80, fs: -104, ff: -30,
      shx: 46, shy: -46, sht: -42, shw: 0.8, held: 'drop', gx: 30, au: 26, af: 12, tl: 10, face: 'mean' }), 'out'],
    [0.4501, P({ air: true, rot: 18, y: 54, tor: 40, head: 10, jaw: 4, nt: 96, ns: -126, nf: -30, ft: 80, fs: -104, ff: -30,
      shx: 46, shy: -46, sht: -42, shw: 0.8, plant: 1, px: -82, wa: 5, wb: 132, tl: 10, face: 'mean' })],
    [0.75, P(Object.assign({}, CROUCH, { air: true, y: hipOf(CROUCH) - AIR_HIP })), 'io'],
    [0.7501, CROUCH],
    [1, IDLE, 'io'],
  ]),
  // "FOR THE KING!": bangs the spear shaft on the shield rim (sparks), chin up, proud bounce
  taunt(t) {
    const ph = (t * 2.2) % 1, hit = Math.pow(Math.max(0, 1 - ph * 3), 2), up = Math.sin(ph * Math.PI);
    return P({ y: -5 * up, tor: -2 + 8 * hit, head: -14 + 10 * hit, jaw: 14 + 12 * up, nt: -12, ns: -16 - 10 * up, ft: 16, fs: -20 - 10 * up,
      shx: 44, shy: -42 + 3 * hit, sht: -6 + 6 * hit, plant: 0, gx: 10, gy: -80 - 18 * up, wa: 54 + 42 * up, wb: 100, tl: 10 * up, tsw: 1.8,
      cape: 0.1 + 0.15 * up, spark: hit > 0.5 ? (hit - 0.5) * 2 : 0, face: 'smug' });
  },
};
export { mix };

// ---------------------------------------------------------------- geometry
let T = 0;
const G = { hipY: 0, gx: 0, gy: 0, dx: 0, dy: -1, bx: 0, by: 0, hx: 0, hy: 0, ex: 0, ey: 0, nsx: 0, nsy: 0,
  fsx: 0, fsy: 0, fex: 0, fey: 0, fhx: 0, fhy: 0 };
function hipOf(p) {
  if (p.air) return AIR_HIP + p.y;
  const dn = HIP_N[1] + legDrop(THIGH, SHIN, FOOT, p.nt, p.ns);
  const df = HIP_F[1] + legDrop(THIGH, SHIN, FOOT, p.ft, p.fs);
  return -Math.max(dn, df) + p.y;
}
function rot2(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
// 2-bone IK; picks the elbow that hangs lower / further back
function ik(sx, sy, tx, ty, l1, l2) {
  const dx = tx - sx, dy = ty - sy;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.01);
  const b = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const e1x = sx + Math.cos(b + A) * l1, e1y = sy + Math.sin(b + A) * l1;
  const e2x = sx + Math.cos(b - A) * l1, e2y = sy + Math.sin(b - A) * l1;
  return (e1y - 0.5 * e1x >= e2y - 0.5 * e2x) ? [e1x, e1y] : [e2x, e2y];
}
// parameter along a line (from g, direction d) nearest `want` that a shoulder s can reach (radius R)
function slide(sx, sy, gx, gy, dx, dy, want, R) {
  const ox = gx - sx, oy = gy - sy;
  const qx = ox + dx * want, qy = oy + dy * want;
  if (qx * qx + qy * qy <= R * R) return want;
  const b = ox * dx + oy * dy, c = ox * ox + oy * oy - R * R, disc = b * b - c;
  if (disc < 0) return -b;
  const r = Math.sqrt(disc), t1 = -b - r, t2 = -b + r;
  return Math.abs(t1 - want) < Math.abs(t2 - want) ? t1 : t2;
}

function solve(p) {
  G.hipY = hipOf(p);
  const tor = p.tor * DEG;
  [G.nsx, G.nsy] = rot2(SH_N[0], SH_N[1], tor);
  [G.fsx, G.fsy] = rot2(SH_F[0], SH_F[1], tor);
  // spear
  const a = p.wa * DEG;
  G.dx = Math.cos(a); G.dy = -Math.sin(a);
  if (p.held === 'drop') {
    G.dx = 1; G.dy = 0; G.bx = p.gx - SHAFT * 0.55; G.by = -G.hipY - 4;
  } else {
    // blend between a free grip (gx, gy) and the butt planted on the floor at px
    const pl = clamp(p.plant, 0, 1), fy = -G.hipY - 6;
    const gx = lerp(p.gx, p.px + G.dx * p.wb, pl), gy = lerp(p.gy, fy + G.dy * p.wb, pl);
    G.bx = gx - G.dx * p.wb; G.by = gy - G.dy * p.wb;
    const R = (UPPER + FORE) * 0.97;
    const u = slide(G.nsx, G.nsy, gx, gy, G.dx, G.dy, 0, R);
    G.gx = gx + G.dx * u; G.gy = gy + G.dy * u;
    [G.ex, G.ey] = ik(G.nsx, G.nsy, G.gx, G.gy, UPPER, FORE);
  }
  if (p.held === 'drop') {
    const u = (p.au - p.tor) * DEG, fa = u + p.af * DEG;
    G.ex = G.nsx + Math.sin(u) * UPPER; G.ey = G.nsy + Math.cos(u) * UPPER;
    G.gx = G.ex + Math.sin(fa) * FORE; G.gy = G.ey + Math.cos(fa) * FORE;
  }
  // far arm -> the shield grip (torso frame)
  const sa = p.sht * DEG;
  const [ox, oy] = rot2(-4, 4, sa);
  let gx = p.shx + ox, gy = p.shy + oy;
  const R = (UPPER + FORE) * 0.98, ddx = gx - SH_F[0], ddy = gy - SH_F[1], d = Math.hypot(ddx, ddy);
  if (d > R) { gx = SH_F[0] + ddx * R / d; gy = SH_F[1] + ddy * R / d; }
  G.fhx = gx; G.fhy = gy;
  [G.fex, G.fey] = ik(SH_F[0], SH_F[1], gx, gy, UPPER, FORE);
}

/**
 * Where things are for a pose, in local px (origin on the floor, facing right, scale 1):
 * { tip: spear point, shield: shield centre, hipY }.
 */
export function measure(p) {
  solve(p);
  const r = -p.rot * DEG, sq = p.sq || 1, isq = 1 / Math.sqrt(sq);
  const loc = (x, y) => { const [a, b] = rot2(x, y, r); return [(p.x + a) * isq * RIG, (G.hipY + b) * sq * RIG]; };
  const L = SHAFT + BLADE;
  const tip = loc(G.bx + G.dx * L, G.by + G.dy * L);
  const [sx, sy] = rot2(p.shx, p.shy, p.tor * DEG);
  return { tip, shield: loc(sx, sy), hipY: G.hipY * RIG };
}

// ---------------------------------------------------------------- drawing helpers
// cool rim light just inside the outline on the side away from the key light (as Grimscale)
function rim(ctx, path, lw, s = 2, col = C.rim) {
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c;
  if (!det) return;
  const k = Math.sqrt(Math.abs(det)), wx = -0.8 * s * k, wy = 0.6 * s * k;
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  ctx.translate((m.d * wx - m.c * wy) / det, (-m.b * wx + m.a * wy) / det);
  ctx.beginPath(); path(ctx);
  ctx.lineWidth = s * 2 + lw * 0.25; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); path(ctx); ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
}
function celR(ctx, path, base, dark, o, s = 2) { cel(ctx, path, base, dark, o); rim(ctx, path, o.lw ?? 3, s); }
function glowStroke(c, w, a = 0.32) {
  c.globalAlpha = a; c.strokeStyle = C.glow; c.lineWidth = w * 2.8; c.stroke(); c.globalAlpha = 1;
  c.strokeStyle = C.gem; c.lineWidth = w; c.stroke();
}
function gem(ctx, x, y, r, lw = 1.6) {
  ctx.globalAlpha = 0.3; ctx.fillStyle = C.glow; ctx.beginPath(); circle(ctx, x, y, r * 2); ctx.fill(); ctx.globalAlpha = 1;
  flat(ctx, (c) => { c.moveTo(x, y - r * 1.25); c.lineTo(x + r, y); c.lineTo(x, y + r * 1.25); c.lineTo(x - r, y); c.closePath(); }, C.gem, lw);
  ctx.fillStyle = C.gemC; ctx.beginPath(); ellipse(ctx, x - r * 0.25, y - r * 0.35, r * 0.25, r * 0.4); ctx.fill();
}
let FLOOR = 72, FS = 0, FC = 1, CX = 0, CY = 0;
function aboveFloor(x, y, m) {
  const Y = x * FS + y * FC, lim = FLOOR - m;
  CX = x; CY = y;
  if (Y > lim) { const d = Y - lim; CX -= d * FS; CY -= d * FC; }
}

// secondary-motion state for this draw
const SM = { cape: 0, tail: 0, plume: 0, tassel: 0 };

/**
 * Draw a Royal Drake Guard.  ctx is at his feet (screen), unscaled.
 * o: { facing: 1 | -1, t: seconds, scale, mem, vel: {x, y, z} }
 */
export function draw(ctx, pose, o = {}) {
  const p = pose, f = o.facing || 1, S = o.scale || 1;
  T = o.t || 0;
  TALK = !!o.talk;
  solve(p);
  // secondary motion: cape, tail, plume and the spear tassel lag behind the body's movement
  const vx = ((o.vel && o.vel.x) || 0) * f, vz = (o.vel && o.vel.z) || 0;
  SM.cape = follow(o.mem, 'gd_cape', clamp(p.cape + clamp(vx * 0.16, -0.2, 0.6) + clamp(-vz * 0.05, 0, 0.3), -0.3, 1.2), 0.09, 0.88);
  SM.tail = follow(o.mem, 'gd_tail', clamp(-vx * 7, -24, 24), 0.07, 0.9);
  SM.plume = follow(o.mem, 'gd_plume', clamp(-vx * 16 + vz * 5, -40, 40), 0.11, 0.87);
  SM.tassel = follow(o.mem, 'gd_tassel', clamp(-vx * 14, -45, 45), 0.12, 0.86);

  ctx.save();
  ctx.scale(f * S * RIG, S * RIG);
  if (p.sq !== 1) ctx.scale(1 / Math.sqrt(p.sq), p.sq);
  ctx.translate(p.x, G.hipY);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (p.held === 'drop') spear(ctx, p);
  if (p.rot) ctx.rotate(-p.rot * DEG);
  FLOOR = -G.hipY; FS = Math.sin(-p.rot * DEG); FC = Math.cos(-p.rot * DEG);
  const tor = p.tor * DEG;

  cape(ctx, p, tor);
  tail(ctx, p);
  ctx.save(); ctx.rotate(tor);
  if (p.shBack) shield(ctx, p);
  farArm(ctx, p);
  ctx.restore();
  leg(ctx, HIP_F, p.ft, p.fs, p.ff, true);
  leg(ctx, HIP_N, p.nt, p.ns, p.nf, false);
  ctx.save(); ctx.rotate(tor);
  torso(ctx, p);
  ctx.save(); ctx.translate(NECK[0], NECK[1]); ctx.rotate(p.head * DEG); ctx.scale(HS, HS); head(ctx, p); ctx.restore();
  if (!p.shBack) shield(ctx, p);
  if (p.smear > 0.01 && p.sk === 'bash') bashSmear(ctx, p);
  ctx.restore();
  if (p.held !== 'drop') {
    if (p.smear > 0.01 && p.sk === 'thrust') thrustSmear(ctx, p);
    spear(ctx, p);
  }
  ctx.save(); ctx.rotate(tor); capeDrape(ctx, p); ctx.restore();
  nearArm(ctx, p, tor);
  if (p.stars) koStars(ctx, p);
  if (p.dust > 0.02) dust(ctx, p);
  ctx.restore();
}
export { draw as drawGuard };

// -------------------------------------------------- cape (hip frame, hangs from the shoulders, crimson + gold hem)
function cape(ctx, p, tor) {
  const fl = SM.cape, s1 = Math.sin(T * 1.8) * 2.5, s2 = Math.sin(T * 2.4 + 1) * 2.5;
  const [ax, ay] = rot2(2, -86, tor), [bx, by] = rot2(-22, -80, tor);
  // world "down" / "back" in the (rotated) hip frame, so a flaring cape always streams away from the motion
  const rr = (p.rot || 0) * DEG, dnx = -Math.sin(rr), dny = Math.cos(rr), bkx = -Math.cos(rr), bky = -Math.sin(rr);
  const Lq = (FLOOR + 54) * (1 - 0.47 * clamp(fl, 0, 1.2)), Bq = 54 + 46 * fl;
  aboveFloor(dnx * Lq + bkx * Bq + s1, -80 + dny * Lq + bky * Bq, 3);
  const qx = CX, qy = CY;
  const Lr = (FLOOR + 12) * (1 - 0.45 * clamp(fl, 0, 1.2)), Br = 20 * fl;
  aboveFloor(-4 + dnx * Lr + bkx * Br + s2 * 0.5, -30 + dny * Lr + bky * Br, 3);
  const rx = CX, ry = CY;
  const path = (c) => {
    c.moveTo(ax, ay); c.quadraticCurveTo(bx - 6, by - 6, bx - 6, by + 8);
    c.quadraticCurveTo(bx - 14 - fl * 26, (by + qy) / 2, qx, qy);
    // wavy hem with folds
    const n = 4;
    for (let i = 1; i <= n; i++) {
      const u = i / n, mx = lerp(qx, rx, u - 0.5 / n), my = lerp(qy, ry, u - 0.5 / n) + 5 + Math.sin(T * 2.6 + i) * 1.5;
      c.quadraticCurveTo(mx, my, lerp(qx, rx, u), lerp(qy, ry, u));
    }
    c.lineTo(-4, -30); c.closePath();
  };
  celR(ctx, path, C.cape, C.capeD, { k: 2, lw: 3, hi: C.capeH, hk: 0.3, detail: (c) => {
    // inner lining shows when the cape flares + fold lines + the gold hem band
    c.strokeStyle = C.capeD; c.lineWidth = 2; c.beginPath();
    c.moveTo(bx - 4, by + 16); c.quadraticCurveTo(bx - 10 - fl * 20, (by + qy) / 2 + 8, qx + 16, qy - 6);
    c.moveTo(-14, -56); c.quadraticCurveTo(-18 - fl * 14, -14, lerp(qx, rx, 0.5), lerp(qy, ry, 0.5) - 2);
    c.stroke();
    c.strokeStyle = C.gold; c.lineWidth = 4; c.beginPath();
    c.moveTo(qx, qy); const n = 4;
    for (let i = 1; i <= n; i++) {
      const u = i / n, mx = lerp(qx, rx, u - 0.5 / n), my = lerp(qy, ry, u - 0.5 / n) + 5 + Math.sin(T * 2.6 + i) * 1.5;
      c.quadraticCurveTo(mx, my, lerp(qx, rx, u), lerp(qy, ry, u));
    }
    c.stroke();
  } }, 1.8);
}

// the cape's near edge falling from behind the near pauldron (torso frame): the crimson + gold hem read in every pose
function capeDrape(ctx, p) {
  const fl = SM.cape;
  const path = (c) => {
    c.moveTo(-2, -88); c.quadraticCurveTo(-24, -92, -32, -74); c.quadraticCurveTo(-40 - fl * 10, -50, -36 - fl * 16, -24);
    c.lineTo(-24 - fl * 10, -30); c.quadraticCurveTo(-22, -56, -8, -70); c.closePath();
  };
  cel(ctx, path, C.cape, C.capeD, { k: 1.4, lw: 2.8, hi: C.capeH, hk: 0.3, detail: (c) => {
    c.strokeStyle = C.gold; c.lineWidth = 3.2; c.beginPath(); c.moveTo(-37 - fl * 16, -26); c.lineTo(-24 - fl * 10, -31); c.stroke();
  } });
}
// little dust puffs kicked up at the feet (block skid)
function dust(ctx, p) {
  const a = p.dust, fy = -G.hipY;
  ctx.globalAlpha = 0.8 * a; ctx.fillStyle = '#d8ccbb';
  for (const [x, r] of [[-26, 7], [-12, 9], [26, 6]]) { const rr = r * (1.4 - a * 0.6); ctx.beginPath(); circle(ctx, x - (1 - a) * 10, fy - rr * 0.6, rr); ctx.fill(); }
  ctx.globalAlpha = 1;
}

// -------------------------------------------------- tail (hip frame): armoured rings, cream underside
const TN = 6, TSEG = 11.5;
const SX = new Float64Array(TN + 1), SY = new Float64Array(TN + 1), SA = new Float64Array(TN + 1);
const AX = new Float64Array(TN + 1), AY = new Float64Array(TN + 1), BX = new Float64Array(TN + 1), BY = new Float64Array(TN + 1);
function tailHW(i) { return lerp(15, 4.5, i / TN); }
function tail(ctx, p) {
  let a = Math.PI - (58 - p.tl - SM.tail * 0.6) * DEG, x = TAIL0[0], y = TAIL0[1];
  for (let i = 0; i <= TN; i++) {
    if (i) {
      a += (8 + p.tc + (i >= TN - 2 ? -22 : 0) + p.tsw * 4 * Math.sin(T * 1.6 - i * 0.6) + SM.tail * 0.3 * (i / TN)) * DEG;
      x += Math.cos(a) * TSEG; y += Math.sin(a) * TSEG;
      aboveFloor(x, y, tailHW(i) + 1.5);
      if (CX !== x || CY !== y) { x = CX; y = CY; a = Math.atan2(y - SY[i - 1], x - SX[i - 1]); }
    }
    SX[i] = x; SY[i] = y; SA[i] = a;
    const hw = tailHW(i), nx = -Math.sin(a) * hw, ny = Math.cos(a) * hw;
    AX[i] = x + nx; AY[i] = y + ny; BX[i] = x - nx; BY[i] = y - ny;
  }
  celR(ctx, tailPath, C.sc, C.scD, { k: 1.8, lw: 3, detail: (c) => {
    c.strokeStyle = C.belD; c.lineWidth = 3.4; c.beginPath();
    for (let i = 0; i < TN; i++) { const xx = lerp(SX[i], BX[i], 0.6), yy = lerp(SY[i], BY[i], 0.6); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.stroke();
  } }, 1.6);
  // black armour rings with gold rims
  for (const i of [1, 3]) {
    const hw = tailHW(i) + 2, sa = SA[i], ux = Math.cos(sa) * 5, uy = Math.sin(sa) * 5, nx = -Math.sin(sa) * hw, ny = Math.cos(sa) * hw;
    const path = (c) => { c.moveTo(SX[i] - ux + nx, SY[i] - uy + ny); c.lineTo(SX[i] + ux + nx, SY[i] + uy + ny);
      c.lineTo(SX[i] + ux - nx, SY[i] + uy - ny); c.lineTo(SX[i] - ux - nx, SY[i] - uy - ny); c.closePath(); };
    cel(ctx, path, C.iron, C.ironD, { k: 0.8, lw: 2.2, detail: (c) => {
      c.strokeStyle = C.gold; c.lineWidth = 1.8; c.beginPath(); c.moveTo(SX[i] + ux * 0.6 + nx, SY[i] + uy * 0.6 + ny); c.lineTo(SX[i] + ux * 0.6 - nx, SY[i] + uy * 0.6 - ny); c.stroke();
    } });
  }
  // spade tip
  ctx.save(); ctx.translate(SX[TN], SY[TN]); ctx.rotate(SA[TN]);
  cel(ctx, (c) => { c.moveTo(-4, -4.5); c.lineTo(4, -5); c.quadraticCurveTo(10, -3, 17, 0); c.quadraticCurveTo(10, 3, 4, 5); c.lineTo(-4, 4.5); c.closePath(); }, C.iron, C.ironD,
    { k: 0.8, lw: 2.4, hi: C.ironH, hk: 0.4, detail: (c) => { c.strokeStyle = C.gold; c.lineWidth = 1.8; c.beginPath(); c.moveTo(3, -5); c.lineTo(3, 5); c.stroke(); } });
  ctx.restore();
}
function tailPath(c) {
  c.moveTo(AX[0], AY[0]);
  for (let i = 1; i < TN; i++) c.quadraticCurveTo(AX[i], AY[i], (AX[i] + AX[i + 1]) / 2, (AY[i] + AY[i + 1]) / 2);
  c.lineTo(AX[TN], AY[TN]); c.lineTo(BX[TN], BY[TN]);
  for (let i = TN - 1; i > 0; i--) c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[i - 1]) / 2, (BY[i] + BY[i - 1]) / 2);
  c.lineTo(BX[0], BY[0]); c.closePath();
}

// -------------------------------------------------- legs (hip frame)
function leg(ctx, hip, a, s, footAbs, far) {
  const sc = far ? C.scF : C.sc, scd = far ? C.scFD : C.scD;
  const ir = far ? C.ironF : C.iron, ird = far ? C.ironFD : C.ironD, gd = far ? C.goldF : C.gold;
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(-a * DEG);
  // thigh: scales under a black cuisse with a gold edge
  cel(ctx, (c) => capsule(c, THIGH, 26, 20), sc, scd, { k: 1.6, lw: 3 });
  cel(ctx, (c) => { c.moveTo(-4, 0); c.lineTo(12, -2); c.quadraticCurveTo(15, 16, 11, THIGH - 4); c.lineTo(-2, THIGH - 2); c.closePath(); }, ir, ird,
    { k: 1.2, lw: 2.6, hi: far ? null : C.ironH, hk: 0.4, detail: (c) => { c.strokeStyle = gd; c.lineWidth = 2; c.beginPath(); c.moveTo(11, 0); c.quadraticCurveTo(14, 16, 10.5, THIGH - 5); c.stroke(); } });
  ctx.translate(0, THIGH);
  ctx.rotate(-s * DEG);
  // greave
  celR(ctx, (c) => { c.moveTo(-10, 0); c.lineTo(10, 0); c.quadraticCurveTo(12, 16, 8, SHIN); c.lineTo(-8, SHIN); c.quadraticCurveTo(-11, 14, -10, 0); c.closePath(); },
    ir, ird, { k: 1.5, hi: far ? null : C.ironH, hk: 0.4, lw: 3, detail: (c) => {
      c.strokeStyle = gd; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-8.5, SHIN - 5); c.lineTo(8.5, SHIN - 5); c.stroke();
      c.strokeStyle = ird; c.lineWidth = 1.4; c.beginPath(); c.moveTo(3, 4); c.quadraticCurveTo(6, 14, 4, SHIN - 8); c.stroke();
    } }, 1.6);
  // gold-rimmed knee cop
  ctx.save(); ctx.rotate(s * 0.5 * DEG);
  cel(ctx, (c) => { c.moveTo(-9, -5); c.quadraticCurveTo(0, -13, 10, -5); c.lineTo(17, 0); c.lineTo(10, 5); c.quadraticCurveTo(0, 11, -9, 5); c.closePath(); },
    far ? C.ironL : C.ironL, ird, { k: 1, lw: 2.6, detail: (c) => { c.strokeStyle = gd; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-7, 3); c.quadraticCurveTo(2, 8, 12, 2.5); c.stroke(); } });
  ctx.restore();
  ctx.translate(0, SHIN);
  ctx.rotate((a + s - footAbs) * DEG);
  // armoured clawed foot: black sabaton over the toes, ivory claws
  flat(ctx, (c) => {
    for (const x of [17, 24]) { c.moveTo(x - 3, FOOT - 5); c.quadraticCurveTo(x + 4, FOOT - 6, x + 6, FOOT + 0.5); c.quadraticCurveTo(x + 1, FOOT - 1, x - 3, FOOT); c.closePath(); }
  }, far ? C.clawD : C.claw, 1.8);
  cel(ctx, (c) => {
    c.moveTo(-9, -5); c.lineTo(-13, 6); c.lineTo(-9, 5); c.lineTo(-9, FOOT); c.lineTo(22, FOOT);
    c.quadraticCurveTo(26, FOOT - 1, 25, FOOT - 5); c.quadraticCurveTo(18, -2, 8, -6); c.quadraticCurveTo(0, -8, -9, -5); c.closePath();
  }, ir, ird, { k: 1.1, lw: 2.8, hi: far ? null : C.ironH, hk: 0.35, detail: (c) => {
    c.strokeStyle = gd; c.lineWidth = 1.8; c.beginPath(); c.moveTo(4, -5); c.quadraticCurveTo(14, -2, 22, FOOT - 5); c.stroke();
  } });
  ctx.restore();
}

// -------------------------------------------------- torso (torso frame: hip at 0,0, up = -y)
const PLATE = [[27, -28], [35, -48], [34, -68], [24, -83], [5, -90], [-13, -88], [-24, -78], [-28, -58], [-26, -36], [0, -24]];
function torso(ctx, p) {
  // back fauld under the cape
  cel(ctx, (c) => { c.moveTo(-24, -20); c.lineTo(-4, -20); c.lineTo(-6, 18); c.quadraticCurveTo(-16, 22, -26, 16); c.closePath(); }, C.ironF, C.ironFD, { k: 1, lw: 2.8 });
  // breastplate: black, gold edging, gold rib chevrons, gem at the sternum
  celR(ctx, (c) => blob(c, PLATE, 0.5), C.iron, C.ironD, { k: 2.2, hi: C.ironH, hk: 0.35, lw: 3.2, detail: (c) => {
    c.strokeStyle = C.gold; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(-19, -78); c.quadraticCurveTo(4, -94, 27, -76); c.stroke();
    c.strokeStyle = C.goldD; c.lineWidth = 1.6; c.beginPath();
    for (const y of [-66, -55, -44]) { c.moveTo(-18, y - 2); c.quadraticCurveTo(-6, y + 4, 8, y); }
    c.moveTo(12, -84); c.quadraticCurveTo(24, -62, 18, -30);
    c.stroke();
    c.fillStyle = C.goldH; c.beginPath(); circle(c, -16, -74, 1.6); circle(c, -20, -38, 1.6); c.fill();
  } }, 2);
  gem(ctx, 16, -60, 4.6, 1.8);
  // faulds: black lames with gold hems
  for (const [x0, x1, lo] of [[-14, 8, 22], [8, 28, 18]]) {
    cel(ctx, (c) => { c.moveTo(x0, -20); c.lineTo(x1, -21); c.lineTo(x1 + 1, lo); c.quadraticCurveTo((x0 + x1) / 2, lo + 4, x0 - 1, lo + 2); c.closePath(); },
      C.iron, C.ironD, { k: 1.2, lw: 2.8, hi: C.ironH, hk: 0.4, detail: (c) => {
        c.strokeStyle = C.gold; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x0, lo - 3); c.quadraticCurveTo((x0 + x1) / 2, lo + 1, x1 + 1, lo - 5); c.stroke();
        c.strokeStyle = C.ironD; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x0, 0); c.quadraticCurveTo((x0 + x1) / 2, 3, x1 + 0.5, -1); c.stroke();
      } });
  }
  // crimson tasset cloth hanging between the faulds
  cel(ctx, (c) => { c.moveTo(2, -16); c.lineTo(16, -16); c.lineTo(17, 26); c.lineTo(12, 22); c.lineTo(9, 28); c.lineTo(5, 22); c.lineTo(1, 26); c.closePath(); },
    C.cape, C.capeD, { k: 1, lw: 2.4 });
  // belt with a gold buckle
  cel(ctx, (c) => { c.moveTo(-24, -28); c.quadraticCurveTo(2, -24, 28, -30); c.lineTo(28, -16); c.quadraticCurveTo(2, -10, -24, -15); c.closePath(); },
    C.ironL, C.ironD, { k: 1, lw: 2.8 });
  flat(ctx, (c) => { c.moveTo(6, -28); c.lineTo(18, -29); c.lineTo(19, -15); c.lineTo(7, -14); c.closePath(); }, C.gold, 2.2);
  flat(ctx, (c) => circle(c, 12.6, -21.6, 2.6), C.gem, 1.4);
  // gorget round the neck base
  cel(ctx, (c) => { c.moveTo(-4, -90); c.quadraticCurveTo(12, -98, 28, -88); c.lineTo(27, -80); c.quadraticCurveTo(12, -86, -3, -82); c.closePath(); },
    C.ironL, C.ironD, { k: 1, lw: 2.6, detail: (c) => { c.strokeStyle = C.gold; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-3, -84); c.quadraticCurveTo(12, -90, 27, -82); c.stroke(); } });
}

// -------------------------------------------------- head (head frame, scaled by HS: origin at the neck joint)
const L = 1 / HS;
const SKULL = [[-16, -6], [-18, -20], [-10, -32], [6, -35], [20, -31], [32, -25], [43, -20], [49, -15], [47, -8.5], [36, -6.5], [18, -5.5], [2, -3]];
const DOME = [[-20, -6], [-22, -22], [-15, -37], [-1, -44], [14, -42], [23, -34], [27, -27.5], [18, -27], [8, -25], [0, -14], [-8, -4]];
const JAW_HINGE = [0, -5];
const FACE_JAW = { mean: 0, yell: 26, ouch: 12, ko: 14, surprised: 18, worried: 6, smug: 3, grit: 3, dazed: 10 };
function head(ctx, p) {
  const face = p.face;
  // thick neck under the helm
  cel(ctx, (c) => blob(c, [[-12, 14], [-14, -2], [-4, -12], [12, -10], [16, 2], [12, 14]], 0.5), C.sc, C.scD, { k: 1.2, lw: 3 * L,
    detail: (c) => { c.fillStyle = C.bel; c.beginPath(); ellipse(c, 12, 4, 5, 10, 0.2); c.fill(); } });
  const jaw = (FACE_JAW[face] ?? 0) + p.jaw + (TALK ? Math.max(0, Math.sin(T * 17)) * 14 : 0);
  const ja = jaw * DEG, c0 = Math.cos(ja), s0 = Math.sin(ja);
  // mouth interior (behind the skull and jaw)
  if (jaw > 2) {
    const jx = JAW_HINGE[0] + 40 * c0 + 2 * s0, jy = JAW_HINGE[1] + 40 * s0 - 2 * c0;
    flat(ctx, (c) => { c.moveTo(JAW_HINGE[0] - 2, JAW_HINGE[1]); c.lineTo(44, -8); c.quadraticCurveTo(jx + 4, (jy - 8) / 2 + 2, jx, jy); c.closePath(); }, C.mouth, 2.4 * L);
    if (face !== 'grit') { ctx.fillStyle = C.tongue; ctx.beginPath(); ellipse(ctx, 20 + 4 * s0, -4 + 10 * s0, 12, 3.2, ja * 0.6); ctx.fill(); }
  }
  // the drake's head: indigo scales, long snout
  celR(ctx, (c) => blob(c, SKULL, 0.45), C.sc, C.scD, { k: 1.6, hi: C.scH, hk: 0.35, lw: 3 * L, detail: (c) => {
    c.strokeStyle = C.scL; c.lineWidth = 1.3 * L; c.beginPath();
    for (const [x, y] of [[10, -14], [16, -10], [24, -12], [30, -10]]) { c.moveTo(x + 2.4, y - 1); c.arc(x, y, 2.6, -0.4, Math.PI * 0.6); }
    c.stroke();
    c.fillStyle = C.bel; c.beginPath(); c.moveTo(12, -6.5); c.quadraticCurveTo(30, -9, 47, -9); c.lineTo(47, -6); c.quadraticCurveTo(30, -5, 12, -4); c.closePath(); c.fill();
  } }, 1.8 * L);
  // upper fang hanging over the lip
  flat(ctx, (c) => { c.moveTo(38, -8); c.lineTo(40, -1.5); c.lineTo(42.5, -8); c.closePath(); }, C.tooth, 1.8 * L);
  // lower jaw (hinged), fangs pointing up
  ctx.save();
  ctx.translate(JAW_HINGE[0], JAW_HINGE[1]); ctx.rotate(ja); ctx.translate(-JAW_HINGE[0], -JAW_HINGE[1]);
  flat(ctx, (c) => { c.moveTo(31, -5); c.quadraticCurveTo(32, -11, 35, -14); c.quadraticCurveTo(36, -9, 36, -5); c.closePath();
    c.moveTo(22, -4); c.quadraticCurveTo(23, -8, 25, -10); c.quadraticCurveTo(26, -7, 26, -4); c.closePath(); }, C.tooth, 2 * L);
  cel(ctx, (c) => { c.moveTo(-4, -7); c.lineTo(41, -6); c.quadraticCurveTo(45, -5, 43, 0); c.quadraticCurveTo(37, 7, 20, 7.5); c.quadraticCurveTo(4, 7.5, -4, 2); c.closePath(); },
    C.sc, C.scD, { k: 1.2, lw: 2.8 * L, detail: (c) => {
      c.fillStyle = C.bel; c.beginPath(); c.moveTo(0, 3.5); c.quadraticCurveTo(20, 6.5, 43, 0); c.lineTo(43, 10); c.lineTo(-4, 10); c.closePath(); c.fill();
      c.strokeStyle = C.scL; c.lineWidth = 1.2 * L; c.beginPath(); c.moveTo(6, -2); c.quadraticCurveTo(18, 1, 32, -2); c.stroke();
    } });
  if (face === 'ko') flat(ctx, (c) => { c.moveTo(34, -2); c.quadraticCurveTo(46, 2, 44, 12); c.quadraticCurveTo(38, 14, 36, 4); c.closePath(); }, C.tongue, 2 * L);
  ctx.restore();
  // helm dome (open face), gold brim
  celR(ctx, (c) => blob(c, DOME, 0.4), C.iron, C.ironD, { k: 1.8, hi: C.ironH, hk: 0.38, lw: 3.2 * L, detail: (c) => {
    c.strokeStyle = C.gold; c.lineWidth = 3 * L; c.beginPath();
    c.moveTo(27, -28); c.quadraticCurveTo(14, -28.5, 7, -23); c.quadraticCurveTo(1, -15, -8, -5); c.stroke();
    c.strokeStyle = C.ironD; c.lineWidth = 1.5 * L; c.beginPath(); c.moveTo(-14, -14); c.quadraticCurveTo(0, -30, 20, -32); c.stroke();
    c.fillStyle = C.goldH; c.beginPath(); circle(c, -10, -22, 1.7); circle(c, 8, -36, 1.6); c.fill();
  } }, 2 * L);
  crest(ctx, p);
  // cheek guard over the jaw hinge
  cel(ctx, (c) => { c.moveTo(-12, -18); c.lineTo(2, -21); c.quadraticCurveTo(6, -10, 3, -1); c.quadraticCurveTo(-5, 2, -11, -2); c.quadraticCurveTo(-15, -10, -12, -18); c.closePath(); },
    C.ironL, C.ironD, { k: 1, hi: C.ironH, hk: 0.4, lw: 2.8 * L, detail: (c) => {
      c.strokeStyle = C.gold; c.lineWidth = 2 * L; c.beginPath(); c.moveTo(2, -20); c.quadraticCurveTo(5.5, -10, 2.5, -1.5); c.stroke();
      c.strokeStyle = C.ironD; c.lineWidth = 1.3 * L; c.beginPath(); c.moveTo(-11, -11); c.quadraticCurveTo(-4, -9, 1, -11); c.stroke();
    } });
  // dragon-snout visor plate along the top of the snout, gold-edged, with a little nose horn
  flat(ctx, (c) => { c.moveTo(40, -24); c.lineTo(42, -35); c.lineTo(46, -22); c.closePath(); }, C.gold, 2 * L);
  const visor = (c) => {
    c.moveTo(24, -33); c.quadraticCurveTo(36, -30, 45, -23); c.quadraticCurveTo(50.5, -18, 50, -12); c.quadraticCurveTo(49, -7.5, 44, -7.5);
    c.lineTo(28, -7.5); c.quadraticCurveTo(26, -12, 26, -16); c.quadraticCurveTo(26, -22, 23, -26); c.closePath();
  };
  celR(ctx, visor, C.iron, C.ironD, { k: 1.2, hi: C.ironH, hk: 0.4, lw: 3 * L, detail: (c) => {
    c.strokeStyle = C.gold; c.lineWidth = 2.6 * L; c.beginPath();
    c.moveTo(23.5, -31); c.quadraticCurveTo(36, -28, 45, -21); c.quadraticCurveTo(49.5, -17, 49, -11.5);
    c.moveTo(28, -9); c.lineTo(46, -9); c.stroke();
    c.strokeStyle = C.goldD; c.lineWidth = 1.5 * L; c.beginPath(); c.moveTo(31, -26); c.quadraticCurveTo(38, -21, 40, -12); c.stroke();
    c.fillStyle = C.goldH; c.beginPath(); circle(c, 33, -14, 1.6); c.fill();
  } }, 1.6 * L);
  // flared nostril slot + little gold nose horn
  c2(ctx);
  eye(ctx, p);
}
// crimson brush crest over the helm (Roman style); its tail flicks behind (secondary motion)
function c2(ctx) {
  ctx.fillStyle = INK; ctx.beginPath(); ellipse(ctx, 45.5, -14.5, 2.4, 1.3, 0.5); ctx.fill();
  flat(ctx, (c) => { c.moveTo(39, -26); c.lineTo(41, -36); c.lineTo(45.5, -23.5); c.closePath(); }, C.gold, 2 * L);
}
function crest(ctx, p) {
  const sw = SM.plume * 0.6 + Math.sin(T * 3.1) * 2;
  // crimson horsehair tassel hanging from the back of the fin
  const tp = (c) => {
    c.moveTo(-18, -40); c.quadraticCurveTo(-30 + sw * 0.3, -40, -36 + sw, -26 + Math.abs(sw) * 0.25);
    c.lineTo(-31 + sw, -27); c.lineTo(-33 + sw * 0.8, -20); c.quadraticCurveTo(-24, -28, -15, -33); c.closePath();
  };
  cel(ctx, tp, C.cape, C.capeD, { k: 1, lw: 2.6 * L, hi: C.capeH, hk: 0.35 });
  // the fin: three swept dragon spines joined by webbing
  const fin = (c) => {
    c.moveTo(14, -40); c.quadraticCurveTo(12, -50, 8, -58); c.quadraticCurveTo(4, -50, -1, -47);
    c.quadraticCurveTo(-4, -56, -10, -63); c.quadraticCurveTo(-12, -52, -17, -48);
    c.quadraticCurveTo(-22, -54, -30, -56); c.quadraticCurveTo(-26, -46, -22, -38); c.quadraticCurveTo(-4, -46, 14, -40); c.closePath();
  };
  cel(ctx, fin, C.iron, C.ironD, { k: 1.2, lw: 2.8 * L, hi: C.ironH, hk: 0.35, detail: (c) => {
    c.strokeStyle = C.gold; c.lineWidth = 2.2 * L; c.beginPath();
    c.moveTo(10, -43); c.quadraticCurveTo(9, -50, 8, -56); c.moveTo(-4, -45); c.quadraticCurveTo(-7, -54, -10, -61); c.moveTo(-19, -42); c.quadraticCurveTo(-24, -50, -29, -55);
    c.stroke();
  } });
  ink(ctx, (c) => { c.moveTo(15, -41); c.quadraticCurveTo(-2, -47, -22, -38); }, 3.4 * L, C.gold);
}
// fierce yellow eye with scaled lids that carry the expression
function eye(ctx, p) {
  const face = p.face, x = 16, y = -19;
  const r = face === 'surprised' ? 6.2 : 5.6;
  const closed = face === 'ouch' || (p.blink && face !== 'ko' && face !== 'dazed' && face !== 'surprised');
  if (closed) {
    flat(ctx, (c) => ellipse(c, x, y, r, r * 0.95), C.scD, 0);
    ink(ctx, (c) => face === 'ouch' ? (c.moveTo(x - 4.5, y - 4), c.lineTo(x + 3.5, y), c.lineTo(x - 4.5, y + 4)) : (c.moveTo(x - 5, y), c.quadraticCurveTo(x, y + 3, x + 5, y)), 2.6 * L);
    return;
  }
  ctx.save();
  ctx.beginPath(); ellipse(ctx, x, y, r, r * 0.95); ctx.clip();
  if (face === 'ko' || face === 'dazed') {
    ctx.fillStyle = '#fff6d8'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = C.eyeD; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = C.eye; ctx.beginPath(); circle(ctx, x - 0.8, y - 0.8, r * 0.88); ctx.fill();
    ctx.fillStyle = C.pupil; ctx.beginPath();
    if (face === 'surprised') circle(ctx, x + 1.6, y, 1.6); else ellipse(ctx, x + 1.8, y + 0.3, 1.5, r * 0.72);
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, x - 2, y - 2.2, 1.4); ctx.fill();
    // lids: [back, front] depth from the top (fraction of the eye height); front = towards the snout
    let l0 = null, l1 = null, lo = null;
    if (face === 'mean') { l0 = 0.2; l1 = 0.62; }
    else if (face === 'yell') { l0 = 0.1; l1 = 0.55; }
    else if (face === 'grit') { l0 = 0.3; l1 = 0.7; lo = 0.3; }
    else if (face === 'smug') { l0 = 0.5; l1 = 0.55; }
    else if (face === 'worried') { l0 = 0.55; l1 = 0.12; }
    if (lo !== null) { ctx.fillStyle = C.sc; ctx.fillRect(x - r - 1, y + r - lo * r * 2, r * 2 + 2, r * 2); }
    if (l0 !== null) {
      const y0 = y - r + l0 * r * 2, y1 = y - r + l1 * r * 2;
      ctx.fillStyle = C.sc;
      ctx.beginPath(); ctx.moveTo(x - r - 1, y - r - 1); ctx.lineTo(x + r + 1, y - r - 1); ctx.lineTo(x + r + 1, y1); ctx.lineTo(x - r - 1, y0); ctx.closePath(); ctx.fill();
      ink(ctx, (c) => { c.moveTo(x - r - 1, y0); c.lineTo(x + r + 1, y1); }, 2.6 * L);
    }
  }
  ctx.restore();
  ink(ctx, (c) => ellipse(c, x, y, r, r * 0.95), 2.4 * L);
  if (face === 'ko' || face === 'dazed') {
    ink(ctx, (c) => {
      for (let a = 0; a < 4 * Math.PI; a += 0.35) { const rr = (r - 1) * a / (4 * Math.PI), aa = a + T * 6; a ? c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr) : c.moveTo(x, y); }
    }, 1.5 * L);
  }
}
let TALK = false;

// -------------------------------------------------- arms
// far arm: (torso frame) shoulder -> shield grip by IK; mostly hidden behind the shield
function farArm(ctx, p) {
  limb(ctx, SH_F[0], SH_F[1], G.fex, G.fey, (c, len) => capsule(c, len, 20, 17), C.scF, C.scFD);
  limb(ctx, G.fex, G.fey, G.fhx, G.fhy, (c, len) => { c.moveTo(-9, 0); c.lineTo(9, 0); c.quadraticCurveTo(11, len * 0.5, 8, len); c.lineTo(-8, len); c.quadraticCurveTo(-11, len * 0.5, -9, 0); c.closePath(); }, C.ironF, C.ironFD);
  flat(ctx, (c) => circle(c, G.fhx, G.fhy, 8), C.ironF, 2.6);
  // far pauldron
  pauldron(ctx, SH_F[0], SH_F[1], true);
}
function limb(ctx, x0, y0, x1, y1, path, base, dark, hi) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(-(x1 - x0), y1 - y0));
  cel(ctx, (c) => path(c, len), base, dark, { k: 1.5, lw: 3, hi, hk: 0.4 });
  ctx.restore();
}
// near arm (hip frame): shoulder -> elbow -> spear grip
function nearArm(ctx, p, tor) {
  const sx = G.nsx, sy = G.nsy, ex = G.ex, ey = G.ey, hx = G.gx, hy = G.gy;
  limb(ctx, sx, sy, ex, ey, (c, len) => capsule(c, len, 21, 18), C.sc, C.scD);
  // vambrace with a gold band
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(-(hx - ex), hy - ey));
  const len = Math.hypot(hx - ex, hy - ey);
  celR(ctx, (c) => { c.moveTo(-9, -2); c.lineTo(9, -2); c.quadraticCurveTo(12, len * 0.5, 9, len - 4); c.lineTo(-9, len - 4); c.quadraticCurveTo(-12, len * 0.5, -9, -2); c.closePath(); },
    C.iron, C.ironD, { k: 1.4, hi: C.ironH, hk: 0.4, lw: 3, detail: (c) => {
      c.strokeStyle = C.gold; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-9.5, len - 9); c.lineTo(9.5, len - 9); c.stroke();
    } }, 1.6);
  ctx.restore();
  flat(ctx, (c) => circle(c, ex, ey, 7), C.ironL, 2.6);
  // gauntlet round the shaft (or an open claw when the spear is dropped)
  ctx.save(); ctx.translate(hx, hy);
  if (p.held === 'drop') {
    ctx.rotate(Math.atan2(-(hx - ex), hy - ey));
    cel(ctx, (c) => blob(c, [[-8, -3], [0, -6], [8, -3], [9, 5], [4, 11], [-4, 11], [-9, 5]], 0.55), C.iron, C.ironD, { k: 1, lw: 2.6 });
    flat(ctx, (c) => { for (const x of [-4, 0, 4]) { c.moveTo(x - 2, 10); c.quadraticCurveTo(x, 15, x + 2.5, 17); c.quadraticCurveTo(x + 1.2, 13, x + 2, 10); c.closePath(); } }, C.claw, 1.6);
  } else {
    ctx.rotate(Math.atan2(G.dy, G.dx));
    const side = ((ex - hx) * -G.dy + (ey - hy) * G.dx) > 0 ? -1 : 1;
    ctx.scale(1, side);
    cel(ctx, (c) => { c.moveTo(-8, -9); c.quadraticCurveTo(4, -11, 9, -7); c.quadraticCurveTo(12, 0, 9, 8); c.quadraticCurveTo(0, 11, -8, 8); c.closePath(); },
      C.iron, C.ironD, { k: 1, hi: C.ironH, hk: 0.4, lw: 2.8, detail: (c) => {
        c.strokeStyle = C.ironD; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-3, -9); c.lineTo(-3, 9); c.moveTo(2, -9.5); c.lineTo(2, 9.5); c.stroke();
      } });
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.rect(-8, -2, 3.5, 4); ctx.fill();
  }
  ctx.restore();
  // near pauldron on top
  ctx.save(); ctx.rotate(tor); pauldron(ctx, SH_N[0], SH_N[1], false); ctx.restore();
}
function pauldron(ctx, x, y, far) {
  ctx.save(); ctx.translate(x, y);
  const ir = far ? C.ironF : C.iron, ird = far ? C.ironFD : C.ironD, gd = far ? C.goldF : C.gold;
  flat(ctx, (c) => { c.moveTo(-6, -10); c.lineTo(-16, -27); c.lineTo(6, -13); c.closePath(); }, gd, 2.4);
  // lames from the bottom (widest, drawn first) up to the cap
  for (const [y0, w, h] of [[14, 29, 11], [5, 26, 11], [-5, 22, 11]]) {
    const lame = (c) => { c.moveTo(-w, y0 + 2); c.quadraticCurveTo(-w * 0.9, y0 - h + 1, 0, y0 - h); c.quadraticCurveTo(w * 0.9, y0 - h + 1, w, y0 + 2);
      c.quadraticCurveTo(0, y0 + 9, -w, y0 + 2); c.closePath(); };
    celR(ctx, lame, ir, ird, { k: 1.2, hi: far ? null : C.ironH, hk: 0.4, lw: 2.8, detail: (c) => {
      c.strokeStyle = gd; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-w + 1, y0 + 2); c.quadraticCurveTo(0, y0 + 8, w - 1, y0 + 2); c.stroke();
    } }, 1.4);
  }
  ctx.fillStyle = far ? C.goldF : C.goldH; ctx.beginPath(); circle(ctx, -14, -6, 1.6); circle(ctx, 14, -6, 1.6); ctx.fill();
  ctx.restore();
}

// -------------------------------------------------- tower shield (torso frame): black field, gold rim, green crown sigil
const SHW = 34, SHT = -62, SHM = 58, SHB = 72;
function shieldPath(c, w, i = 0) {
  const W = (SHW - i) * w, t = SHT + i, m = SHM, bt = SHB - i;
  c.moveTo(-W, t + 9); c.quadraticCurveTo(-W, t - 1, -W + 9 * w, t - 2); c.quadraticCurveTo(0, t - 9, W - 9 * w, t - 2); c.quadraticCurveTo(W, t - 1, W, t + 9);
  c.lineTo(W, m); c.quadraticCurveTo(W * 0.96, bt - 5, 0, bt); c.quadraticCurveTo(-W * 0.96, bt - 5, -W, m); c.closePath();
}
function shield(ctx, p) {
  const w = p.shw;
  ctx.save();
  ctx.translate(p.shx, p.shy); ctx.rotate(p.sht * DEG);
  // thickness: the gold edge on the forward side
  ctx.save(); ctx.translate(5 + 4 * (1 - w), 1);
  cel(ctx, (c) => shieldPath(c, w), C.goldD, C.goldD, { lw: 3 });
  ctx.restore();
  const path = (c) => shieldPath(c, w);
  celR(ctx, path, C.ironL, C.iron, { k: 2.4, hi: C.ironH, hk: 0.25, lw: 3.4, detail: (c) => {
    // gold rim band + inner border
    c.save(); c.beginPath(); shieldPath(c, w); c.lineWidth = 10; c.strokeStyle = C.gold; c.stroke(); c.restore();
    c.lineWidth = 1.6; c.strokeStyle = C.goldD; c.beginPath(); shieldPath(c, w, 6.5); c.stroke();
    // a cool shine band down the face
    c.fillStyle = C.ironH; c.globalAlpha = 0.35; c.beginPath();
    c.moveTo(-(SHW - 12) * w, SHT + 8); c.lineTo(-(SHW - 19) * w, SHT + 8); c.lineTo(-(SHW - 19) * w, SHM - 6); c.lineTo(-(SHW - 12) * w, SHM - 2); c.closePath(); c.fill();
    c.globalAlpha = 1;
    // gold cross-band below the sigil with rivets
    c.fillStyle = C.gold; c.fillRect(-SHW * w, 22, SHW * 2 * w, 7);
    c.fillStyle = C.goldD; c.fillRect(-SHW * w, 27, SHW * 2 * w, 1.8);
    c.fillStyle = C.goldH; c.beginPath();
    for (const u of [-0.7, 0, 0.7]) circle(c, u * SHW * w, 25.5, 1.6);
    for (const [u, y] of [[-0.76, SHT + 10], [0.76, SHT + 10], [-0.76, SHM - 2], [0.76, SHM - 2]]) circle(c, u * SHW * w, y, 1.7);
    c.fill();
  } }, 2.2);
  sigil(ctx, 0, -16, w, p.sflash);
  // block sparks: a star flash on the face + flying streaks
  if (p.spark > 0.01) sparks(ctx, p.spark, w);
  ctx.restore();
}
// the King's green flame-crown, glowing (flares when he is about to bash)
function sigil(ctx, x, y, w, fl = 0) {
  ctx.save(); ctx.translate(x, y);
  const pulse = 0.85 + 0.15 * Math.sin(T * 4);
  ctx.globalAlpha = 0.24 * pulse + 0.3 * fl; ctx.fillStyle = C.glow; ctx.beginPath(); ellipse(ctx, 0, -2, (22 + 10 * fl) * w, 22 + 10 * fl); ctx.fill(); ctx.globalAlpha = 1;
  const X = (v) => v * w * 1.5, Y = (v) => v * 1.5;
  flat(ctx, (c) => {
    c.moveTo(X(-11), Y(8)); c.lineTo(X(-12), Y(-3)); c.quadraticCurveTo(X(-11), Y(-9), X(-15), Y(-15)); c.quadraticCurveTo(X(-6), Y(-11), X(-6), Y(-4));
    c.quadraticCurveTo(X(-4), Y(-13), X(0), Y(-21)); c.quadraticCurveTo(X(4), Y(-13), X(6), Y(-4)); c.quadraticCurveTo(X(6), Y(-11), X(15), Y(-15));
    c.quadraticCurveTo(X(11), Y(-9), X(12), Y(-3)); c.lineTo(X(11), Y(8)); c.closePath();
  }, fl > 0.5 ? C.gemC : C.gem, 2.4);
  ctx.fillStyle = C.gemD; ctx.beginPath(); ctx.moveTo(X(-11), Y(3)); ctx.lineTo(X(11), Y(3)); ctx.lineTo(X(11), Y(7)); ctx.lineTo(X(-11), Y(7)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ellipse(ctx, X(-1.5), Y(-9), X(1.4), Y(3.4)); ctx.fill();
  ctx.restore();
}
function sparks(ctx, a, w) {
  const x = 8 * w, y = -26, R = 10 + 10 * (1 - a);
  ctx.globalAlpha = Math.min(1, a * 1.4);
  flat(ctx, (c) => {
    for (let j = 0; j < 8; j++) {
      const rr = j % 2 ? R * 0.35 : R * (j % 4 ? 0.8 : 1.25), aa = j * Math.PI / 4 - Math.PI / 2 + 0.2;
      j ? c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr) : c.moveTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
    }
    c.closePath();
  }, C.spark, 2);
  ctx.strokeStyle = C.sparkD; ctx.lineWidth = 2.4; ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const aa = -1.3 + i * 0.5, r0 = 14 + (1 - a) * 18, r1 = r0 + 10 * a;
    ctx.moveTo(x + Math.cos(aa) * r0 + 8, y + Math.sin(aa) * r0); ctx.lineTo(x + Math.cos(aa) * r1 + 8, y + Math.sin(aa) * r1);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// -------------------------------------------------- spear (hip frame; shaft along +u from the butt)
function spear(ctx, p) {
  ctx.save();
  ctx.translate(G.bx, G.by);
  ctx.rotate(Math.atan2(G.dy, G.dx));
  // butt cap
  flat(ctx, (c) => { c.moveTo(-6, -3.4); c.lineTo(6, -3.6); c.lineTo(6, 3.6); c.lineTo(-6, 3.4); c.quadraticCurveTo(-9, 0, -6, -3.4); c.closePath(); }, C.gold, 2.2);
  // black lacquered shaft with gold bands
  cel(ctx, (c) => { c.moveTo(4, -3); c.lineTo(SHAFT, -2.6); c.lineTo(SHAFT, 2.6); c.lineTo(4, 3); c.closePath(); }, C.shaft, C.shaftD, { k: 0.7, lw: 2.4 });
  flat(ctx, (c) => { for (const u of [70, 130]) { c.moveTo(u, -3.8); c.lineTo(u + 6, -3.8); c.lineTo(u + 6, 3.8); c.lineTo(u, 3.8); c.closePath(); } }, C.gold, 2);
  // crimson tassel under the blade (lags behind the swing)
  const tw = SM.tassel + Math.sin(T * 5) * 4;
  const down = G.dx >= 0 ? 1 : -1;
  ctx.save(); ctx.translate(SHAFT - 6, 3 * down);
  const ang = (Math.atan2(G.dx, -G.dy) * 0 + (-Math.atan2(G.dy, G.dx)) + Math.PI / 2 * down) + tw * DEG * 0.6;
  ctx.rotate(ang * 0.5);
  cel(ctx, (c) => { c.moveTo(-3, 0); c.quadraticCurveTo(-6 + tw * 0.15, 10 * down, -4 + tw * 0.3, 20 * down); c.lineTo(0 + tw * 0.3, 16 * down); c.lineTo(3 + tw * 0.3, 21 * down);
    c.quadraticCurveTo(5, 10 * down, 3, 0); c.closePath(); }, C.cape, C.capeD, { k: 0.8, lw: 2 });
  ctx.restore();
  // gold socket with a gem, then the long steel blade with fluted edges
  cel(ctx, (c) => { c.moveTo(SHAFT - 10, -4.5); c.lineTo(SHAFT + 4, -5.5); c.quadraticCurveTo(SHAFT + 8, 0, SHAFT + 4, 5.5); c.lineTo(SHAFT - 10, 4.5); c.closePath(); },
    C.gold, C.goldD, { k: 0.8, lw: 2.2 });
  flat(ctx, (c) => { c.moveTo(SHAFT - 3, -2.6); c.lineTo(SHAFT + 0.5, 0); c.lineTo(SHAFT - 3, 2.6); c.lineTo(SHAFT - 6.5, 0); c.closePath(); }, C.gem, 1.2);
  // side spurs (winged spear)
  flat(ctx, (c) => { c.moveTo(SHAFT + 3, -4); c.lineTo(SHAFT - 2, -12); c.lineTo(SHAFT + 9, -5); c.closePath(); c.moveTo(SHAFT + 3, 4); c.lineTo(SHAFT - 2, 12); c.lineTo(SHAFT + 9, 5); c.closePath(); }, C.goldD, 2);
  cel(ctx, (c) => {
    c.moveTo(SHAFT + 6, 0); c.quadraticCurveTo(SHAFT + 10, -7.5, SHAFT + 18, -6); c.quadraticCurveTo(SHAFT + 26, -3, SHAFT + BLADE, 0);
    c.quadraticCurveTo(SHAFT + 26, 3, SHAFT + 18, 6); c.quadraticCurveTo(SHAFT + 10, 7.5, SHAFT + 6, 0); c.closePath();
  }, C.blade, C.bladeD, { k: 1, hi: C.bladeH, hk: 0.5, lw: 2.4 });
  ink(ctx, (c) => { c.moveTo(SHAFT + 9, 0); c.lineTo(SHAFT + BLADE - 4, 0); }, 1.2, C.bladeD);
  if (p.glint > 0.05) {   // the tip glints: the thrust is coming
    const g = p.glint, r = 6 + 8 * g * (0.8 + 0.2 * Math.sin(T * 22));
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = g; ctx.beginPath();
    for (let j = 0; j < 8; j++) { const rr = j % 2 ? r * 0.22 : r, aa = j * Math.PI / 4 + 0.4; const x = SHAFT + BLADE - 4 + Math.cos(aa) * rr, y = Math.sin(aa) * rr; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// -------------------------------------------------- smears
function thrustSmear(ctx, p) {
  const a = clamp(p.smear, 0, 1), tip = SHAFT + BLADE, Ls = p.sl;
  ctx.save();
  ctx.translate(G.bx, G.by); ctx.rotate(Math.atan2(G.dy, G.dx));
  ctx.globalAlpha = 0.8 * a; ctx.fillStyle = '#fffbea';
  ctx.beginPath(); ctx.moveTo(tip + 4, 0); ctx.quadraticCurveTo(tip - 8, -12, tip - Ls, -1.5); ctx.lineTo(tip - Ls, 1.5); ctx.quadraticCurveTo(tip - 8, 12, tip + 4, 0); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = '#fffbea'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tip - 18, -16); ctx.lineTo(tip - 18 - Ls * 0.55, -16); ctx.moveTo(tip - 26, 16); ctx.lineTo(tip - 26 - Ls * 0.45, 16); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}
// shield bash: an impact crescent in front of the shield + speed lines streaming back
function bashSmear(ctx, p) {
  const a = clamp(p.smear, 0, 1);
  ctx.save(); ctx.translate(p.shx, p.shy); ctx.rotate(p.sht * DEG);
  ctx.globalAlpha = 0.85 * a; ctx.fillStyle = '#fffbea';
  ctx.beginPath(); ctx.moveTo(30, -62); ctx.quadraticCurveTo(62, -2, 30, 66); ctx.quadraticCurveTo(46, -2, 30, -62); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.6 * a; ctx.strokeStyle = '#fffbea'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
  for (const [y, l] of [[-40, 50], [-10, 70], [20, 56], [46, 40]]) { ctx.moveTo(-34, y); ctx.lineTo(-34 - l * a, y); }
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.restore();
}

// little dizzy stars over the helm (always upright on screen)
function koStars(ctx, p) {
  const [hx, hy] = rot2(NECK[0], NECK[1] - 50, p.tor * DEG);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(p.rot * DEG);
  for (let i = 0; i < 3; i++) {
    const a = T * 3.6 + i * TAU / 3, sx = Math.cos(a) * 22, sy = -6 + Math.sin(a) * 5;
    flat(ctx, (c) => {
      for (let j = 0; j < 10; j++) {
        const rr = j % 2 ? 2.8 : 7.4, aa = j * Math.PI / 5 - Math.PI / 2;
        j ? c.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr) : c.moveTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
      }
      c.closePath();
    }, C.star, 1.6);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- measurements for the engine
export const HEIGHT = 200;
/** Suggested body hurtbox (local px at scale 1): centred x px in front of the origin (times facing), w wide, h tall from the floor. */
export const HURTBOX = { x: 12, w: 78, h: 186 };
/** Spear point at the thrust's contact key (k = .35), local px facing right, scale 1, origin on the floor. */
export const SPEAR_TIP = measure(ANIM.thrust(0.35)).tip.map((v) => Math.round(v));
/** Shield-face centre at the bash's contact key (k = .35): put the bash hitbox here. */
export const BASH_POINT = (() => { const m = measure(ANIM.bash(0.35)); return [Math.round(m.shield[0] + 30), Math.round(m.shield[1])]; })();
/** Shield centre while guarding (for spark effects / the block test: hits from the front are blocked). */
export const GUARD_SHIELD = measure(ANIM.guard(0)).shield.map((v) => Math.round(v));
