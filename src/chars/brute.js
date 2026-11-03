// Drake Brute: the Dragon King's heavy (1-2 per fight).  Art (drawn in code) + pose library.  Style guide v2.
//
// A big hulking horned lizard-man (~210 px tall at scale 1): huge hunched shoulders and gorilla arms, a smallish
// head (drawn 1.25x so the face reads at game scale) set low in front with two big curved horns, an underbite with
// two tusks, mean yellow-green eyes under a heavy brow, slate/olive-grey scales with a pale ridged belly, blunt back
// spikes and a thick dragging tail.  Spiked black-iron gauntlets (big fists, no weapon) -- the near cuff carries the
// faction's glowing green gem in a diamond setting (nothing round on the body, so nothing reads as a second face) --
// ONE plain black-iron pauldron (near shoulder), a heavy belt with a goofy skull buckle, a ragged dark-green loincloth.
// Slow and heavy: squash on footfalls, breathing, rolling shoulders.
//
// o.variant = 'magma' (the Ember Mines): charred black-red scales split by glowing lava cracks, obsidian horns,
// fiery eyes, a leather forge-apron instead of the loincloth front, and big riveted iron mitts with hot seams
// instead of the spiked gauntlets.  Same ANIM keys.
//
// v2 craft: line hierarchy, occlusion tones, a cool rim light away from the key light, follow() secondary motion
// on the tail and the loincloth / apron (o.mem + o.vel), auto-blink, o.talk mouth, an idle fidget, hurt / hurt2.
import { cel, flat, ink, capsule, blob, ellipse, circle, keys, mix, DEG, TAU, clamp, legDrop, follow } from '../rig.js';
import { INK } from '../config.js';

const STD = {
  name: 'std',
  sc: '#7f8b70', scD: '#58624c', scH: '#a8b496', scL: '#68735b',
  belly: '#dcd8b0', bellyD: '#b1ac84', bellyL: '#9f9a73',
  horn: '#efe2c0', hornD: '#c1ae80', spike: '#5a5348', spikeD: '#3c3731',
  iron: '#4b5262', ironD: '#2c303c', ironH: '#808a9e', ironS: '#a4adbd',
  gem: '#62ff8c', gemC: '#eaffe6',
  cloth: '#33603f', clothD: '#1f3f29', clothH: '#4c8058',
  lea: '#5d4c3d', leaD: '#3d3229', leaH: '#7c6754',
  bone: '#ece4c8', boneD: '#b8ad8a',
  eye: '#d8f24a', eyeD: '#93b21c', pupil: '#1b1016',
  mouth: '#5e1a26', tongue: '#e0708c', tooth: '#fffbea',
  claw: '#2a2027', star: '#ffe45c', steam: '#ffffff',
  rim: '#d6fbf2', occ: 'rgba(26,12,30,0.32)',
  lava: null, apron: false, mitts: false,
};
const MAGMA = Object.assign({}, STD, {
  name: 'magma',
  sc: '#433130', scD: '#271c1d', scH: '#6a4b45', scL: '#2f2222',
  belly: '#8f7466', bellyD: '#634d43', bellyL: '#4f3b33',
  horn: '#4c4452', hornD: '#2c2632', spike: '#2a2024', spikeD: '#160f12',
  eye: '#ffb02e', eyeD: '#c45a12',
  cloth: '#3a2a22', clothD: '#22170f', clothH: '#54402f',
  iron: '#575d69', ironD: '#30343e', ironH: '#8d95a3',
  rim: '#ddd4ff',
  lava: '#ff7a1a', lavaC: '#ffd770', lavaG: 'rgba(255,100,20,0.45)',
  apron: true, mitts: true,
  apr: '#6e4a30', aprD: '#47301e', aprH: '#8c6444',
});
// the secret stages (docs/SECRETS.md; tools/sprite3d chars/brute.py COLS): the Frozen Hollow's frost chief (icy scales,
// rimed horns, icicle spikes) and the green-crystal guardian -- the std kit; the code rig's colours where their atlas is
// missing
const FROST = Object.assign({}, STD, {
  name: 'frost',
  sc: '#6a9fcc', scD: '#44729e', scH: '#9cc4e6', scL: '#5688b4',
  belly: '#eef6fa', bellyD: '#c0d4e0', bellyL: '#c8dce8',
  horn: '#cfe6f5', hornD: '#93b4cc', spike: '#bfe8ff', spikeD: '#7ab4d8',
  eye: '#7fe8ff', eyeD: '#2fa8d0', gem: '#8fe8ff', gemC: '#f0fcff',
  cloth: '#2e3f5c', clothD: '#1c2840', clothH: '#43587c',
  iron: '#5f7590', ironD: '#3e4e62', ironH: '#9aaec4', ironS: '#e6f2ff',
});
const JADE = Object.assign({}, STD, {
  name: 'jade',
  sc: '#4fb88f', scD: '#2f7f63', scH: '#86dcb8', scL: '#3f9c78',
  belly: '#dcf8e8', bellyD: '#a8d4bc', bellyL: '#a8d8c0',
  horn: '#d8fff0', hornD: '#7fd4b0', spike: '#9fffd8', spikeD: '#2fbf88',
  eye: '#c8ff6a', eyeD: '#7ab81c',
  cloth: '#1f4a44', clothD: '#123230', clothH: '#2f6a62',
  iron: '#5f8f86', ironD: '#3a5e58', ironH: '#8fbcb2', ironS: '#c8fff0',
});
export const PALETTES = { std: STD, magma: MAGMA, frost: FROST, jade: JADE };

// skeleton (px at scale 1)
const THIGH = 30, SHIN = 27, FOOT = 11;
const UPPER = 42, FORE = 40;
const HIP_N = [-4, -2], HIP_F = [8, -4];
const SH_N = [2, -106], SH_F = [14, -110];
const NECK = [44, -90];
const TAIL0 = [-22, -12];
const AIR_HIP = -63;
const RIG = 1.1;   // overall size (ink widths below are pre-divided so they render ~3.2 px like the heroes')

// ---------------------------------------------------------------- poses
export const BASE = {
  x: 0, y: 0, rot: 0, sq: 1,
  tor: 16, head: -14, jaw: 0, breath: 0,
  nt: -8, ns: -18, nf: 0,          // near leg (back): thigh, knee bend (neg), foot (absolute)
  ft: 16, fs: -20, ff: 0,          // far leg (front)
  nu: 26, ne: 26,                  // near arm: upper (+ = forward; continuous, may wind past +-180), elbow bend
  fu: 30, fe: 30,                  // far arm
  tb: 52, tc: 6, tw: 3, tp: 0,     // tail: droop, curl per segment, wave amount + phase
  smear: 0, sa0: 0, sa1: 0, sr: 90,
  glow: 0, steam: 0,
  face: 'mean', air: false, blink: false,
};
const P = (o) => Object.assign({}, BASE, o);
const ext = (p, o) => P(Object.assign({}, p, o));

// fist cocked back over the shoulder (nu -138 = up-and-behind); the haymaker then winds on over the top
const PWIND = P({ x: -6, tor: 2, head: -8, nu: -138, ne: 78, fu: 40, fe: 46, nt: -22, ns: -34, ft: 22, fs: -10, ff: 6,
  tb: 34, tc: 14, face: 'mean', glow: 1 });
const PHIT = P({ x: 12, tor: 34, head: -22, nu: -284, ne: 8, fu: -20, fe: 40, nt: -30, ns: -10, ft: 34, fs: -34, ff: 0,
  tb: 60, tc: -2, face: 'yell', smear: 1, sa0: 250, sa1: 84, sr: 86 });
const CWIND = P({ x: -4, tor: 34, head: 26, nu: -18, ne: 40, fu: -10, fe: 40, nt: -18, ns: -40, ft: 26, fs: -42,
  tb: 30, tc: 12, face: 'snort', steam: 1, glow: 0.6 });
const CROUCH = P({ tor: 40, head: -16, nt: 54, ns: -98, ft: 66, fs: -96, nu: 40, ne: 30, fu: 30, fe: 30, tb: 50, tc: 6, face: 'mean' });
const CROUCH_AIR = P(Object.assign({}, CROUCH, { air: true, y: 16.9 }));   // its ground-solved hip height, as an air pose
// flat on his back (the hump on the floor), legs up, fists resting on his tummy
const DOWN = P({ air: true, rot: 90, y: 18, tor: 0, head: -40, nt: 70, ns: -60, nf: 30, ft: 92, fs: -70, ff: 40,
  nu: 6, ne: 40, fu: 24, fe: 50, tb: 86, tc: 0, tw: 1, face: 'ko' });

export const ANIM = {
  // heavy breathing, rolling shoulders; every ~5.6 s he rolls his neck and cracks his knuckles (fists meet + a snort)
  idle(t) {
    const b = Math.sin(t * 2.6), r = Math.sin(t * 1.3);
    const p = P({ breath: b, tor: 16 + b * 1.4 + r * 1.2, head: -14 - b * 2, ns: -18 - b * 3, fs: -20 - b * 3,
      nu: 26 - b * 3 + r * 3, ne: 26 + b * 4, fu: 30 - b * 3 - r * 3, fe: 30 + b * 4, tp: t * 0.25 });
    const f = t % 5.6;
    if (f > 4.1) {
      const u = (f - 4.1) / 1.5, w = Math.sin(Math.PI * u) ** 2, sh = Math.sin(u * TAU * 3) * w;
      p.head += Math.sin(u * TAU * 1.5) * 12 * w;
      p.nu += (46 - p.nu) * w; p.ne += (66 + sh * 6 - p.ne) * w;
      p.fu += (52 - p.fu) * w; p.fe += (72 - sh * 6 - p.fe) * w;
      p.tor -= 4 * w;
      if (w > 0.55) { p.face = 'snort'; p.steam = w; }
    }
    return p;
  },
  // stompy: big slow steps, body drops + squashes on each footfall, arms swing opposite, head nods on the stomp
  walk(ph) {
    const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU);
    const stomp = Math.pow(Math.abs(s), 6);
    return P({ tor: 18 + 2 * Math.abs(s), head: -14 + 5 * stomp, sq: 1 - 0.045 * stomp,
      nt: 4 + 20 * s, ns: -18 - 36 * Math.max(0, c), nf: 8 * s * Math.max(0, c),
      ft: 4 - 20 * s, fs: -18 - 36 * Math.max(0, -c), ff: -8 * s * Math.max(0, -c),
      nu: 26 - 22 * s, ne: 30 + 10 * Math.max(0, -s), fu: 30 + 22 * s, fe: 30 + 10 * Math.max(0, s),
      tp: ph, tw: 6, breath: s * 0.5 });
  },
  // telegraph (~0.5 s): sinks and pulls the fist back low, then rears it up behind the shoulder, gem flares
  punchWind: (k) => keys(k, [
    [0, P({})],
    [0.3, P({ x: -2, tor: 24, head: -20, sq: 0.95, nu: -32, ne: 64, fu: 52, fe: 42, nt: -14, ns: -32, ft: 22, fs: -30, tb: 44, tc: 10 }), 'out'],
    [1, PWIND, 'io'],
  ]),
  // big overhand haymaker: tiny extra cock, contact at k ~ 0.2 (PUNCH_FIST), overshoot, hold, settle
  punch: (k) => keys(k, [
    [0, PWIND],
    [0.08, ext(PWIND, { x: -7, nu: -150, ne: 74, tor: -2, sq: 1.03 })],
    [0.2, PHIT, 'snap'],
    [0.3, ext(PHIT, { x: 14, tor: 38, head: -24, nu: -290, ne: 4, sq: 0.95, smear: 0.6, sa0: 180 }), 'out'],
    [0.5, ext(PHIT, { x: 12, tor: 32, head: -20, nu: -286, ne: 10, smear: 0.2, sa0: 140 })],
    [0.8, P({ x: 5, tor: 22, head: -16, nu: -322, ne: 30, fu: 20, fe: 36, tb: 50 }), 'io'],
    [1, P({ x: 4, nu: -334 }), 'io'],
  ]),
  // telegraph (~0.7 s): lowers the head, paws the ground twice (squash on each scrape), steam snorts
  chargeWind: (k) => {
    const p = keys(k, [[0, P({})], [0.3, CWIND, 'out'], [1, CWIND]]);
    const paw = k > 0.25 ? Math.sin((k - 0.25) / 0.75 * TAU * 2) : 0;
    p.nt += paw * 16; p.ns -= Math.max(0, paw) * 30; p.nf = paw * 10;
    p.sq = 1 - 0.03 * Math.max(0, -paw);
    return p;
  },
  // head-down horn charge run cycle
  charge(ph) {
    const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU);
    return P({ tor: 40, head: 28 + 3 * s, y: -5 * Math.abs(c), sq: 1 + 0.03 * Math.abs(c),
      nt: 6 + 40 * s, ns: -24 - 70 * Math.max(0, c), nf: 14 * s,
      ft: 6 - 40 * s, fs: -24 - 70 * Math.max(0, -c), ff: -14 * s,
      nu: -24 - 30 * s, ne: 70, fu: -24 + 30 * s, fe: 70,
      tb: 20, tc: 6, tw: 10, tp: ph * 2, face: 'snort', steam: 1 });
  },
  // armoured flinch: absorbs a light hit without falling (squash, tiny overshoot, settle)
  stagger: (k) => keys(k, [
    [0, P({ x: -4, tor: 8, head: -24, sq: 0.95, nu: 18, ne: 40, fu: 22, fe: 44, ns: -22, fs: -24, face: 'ouch', tw: 8 })],
    [0.25, P({ x: -4, tor: 18, head: -12, sq: 1.02, nu: 28, ne: 30, fu: 32, fe: 32, ns: -18, fs: -20, face: 'mean' }), 'out'],
    [0.55, P({ x: -2, tor: 14, head: -16, nu: 24, ne: 28, face: 'mean' }), 'io'],
    [1, P({ face: 'mean' }), 'io'],
  ]),
  // high hit: head and chest knocked back, squash, settle
  hurt: (k) => keys(k, [
    [0, P({ x: -10, tor: -6, head: -36, sq: 0.93, nu: -34, ne: 50, fu: -20, fe: 40, nt: 4, ns: -24, ft: 30, fs: -24, ff: 14,
      tb: 66, tc: 14, tw: 10, face: 'ouch' })],
    [0.15, P({ x: -11, tor: -9, head: -40, sq: 1.03, nu: -40, ne: 54, fu: -26, fe: 44, nt: 4, ns: -24, ft: 32, fs: -24, ff: 16,
      tb: 70, tc: 16, tw: 10, face: 'ouch' }), 'out'],
    [0.45, P({ x: -8, tor: 2, head: -28, nu: -10, ne: 46, fu: 4, fe: 44, nt: 0, ns: -24, ft: 26, fs: -26, ff: 6,
      tb: 60, tc: 10, face: 'ouch' }), 'io'],
    [1, P({ x: -2, face: 'mean' }), 'io'],
  ]),
  // low hit: doubles over clutching his belly, squash, settle
  hurt2: (k) => keys(k, [
    [0, P({ x: -6, tor: 44, head: 10, sq: 0.92, nu: 44, ne: 96, fu: 50, fe: 96, nt: 6, ns: -40, ft: 30, fs: -42,
      tb: 30, tc: 18, tw: 10, face: 'ouch' })],
    [0.18, P({ x: -8, tor: 48, head: 14, sq: 1.02, nu: 46, ne: 100, fu: 52, fe: 100, nt: 8, ns: -44, ft: 32, fs: -46,
      tb: 26, tc: 20, tw: 10, face: 'ouch' }), 'out'],
    [0.5, P({ x: -5, tor: 32, head: -2, nu: 36, ne: 70, fu: 42, fe: 70, nt: 0, ns: -30, ft: 24, fs: -32, tb: 40, tc: 10, face: 'ouch' }), 'io'],
    [1, P({ x: -2, face: 'mean' }), 'io'],
  ]),
  // knocked into the air (air)
  fly: P({ air: true, rot: 48, tor: -6, head: -24, nt: 40, ns: -40, nf: 20, ft: 70, fs: -30, ff: 30,
    nu: 108, ne: 40, fu: 132, fe: 30, tb: -10, tc: 10, tw: 10, face: 'ouch' }),
  // flat on its back, dizzy (air)
  down: DOWN,
  // sits up pushing off a fist, crouches, pops up
  getup: (k) => keys(k, [
    [0, P(Object.assign({}, DOWN, { face: 'ouch' }))],
    [0.4, P({ air: true, rot: 34, y: 45, tor: 30, head: -20, nt: 96, ns: -128, nf: -30, ft: 76, fs: -100, ff: -30,
      nu: -12, ne: 8, fu: -30, fe: 30, tb: 80, tc: 2, face: 'ouch' })],
    [0.7, CROUCH_AIR],
    [0.7001, CROUCH],     // same pose, now ground-solved: crouch -> stand keeps the feet planted
    [0.87, P({ tor: 8, head: -20, sq: 1.03, nu: 30, ne: 20, fu: 34, fe: 24, tb: 46 }), 'out'],
    [1, P({}), 'io'],
  ]),
  // intro roar: chest out, head up, mouth wide, arms spread
  roar(t) {
    const sh = Math.sin(t * 30) * 1.5, b = Math.sin(t * 3);
    return P({ tor: -8 + sh * 0.5, head: -46 + sh, breath: 1, jaw: 8, nt: -16, ns: -14, ft: 24, fs: -16,
      nu: 22 + sh * 2, ne: 26 + b * 6, fu: -78 + sh * 2, fe: 44 + b * 6,
      tb: 44, tc: 12, tw: 8, tp: t, face: 'yell', glow: 0.8 });
  },
};
export { mix };

// ---------------------------------------------------------------- geometry
let T = 0;
let C = STD;
let _hipY = 0;
const FX = { tb: 0, tc: 0, tw: 0, flap: 0, blink: false, talk: 0 };
const V0 = { x: 0, y: 0, z: 0 };
function hipOf(p) {
  if (p.air) return AIR_HIP + p.y;
  const dn = HIP_N[1] + legDrop(THIGH, SHIN, FOOT, p.nt, p.ns);
  const df = HIP_F[1] + legDrop(THIGH, SHIN, FOOT, p.ft, p.fs);
  return -Math.max(dn, df) + p.y;
}

/**
 * Where things are for a pose, in local px (origin on the floor, facing right, scale 1):
 * { fist: [x, y] near (punching) fist centre, head: [x, y] head centre (horn charge hitbox), hipY, feet }.
 */
export function measure(p) {
  const hipY = hipOf(p);
  const r = -p.rot * DEG, rc = Math.cos(r), rs = Math.sin(r);
  const sq = p.sq || 1, isq = 1 / Math.sqrt(sq);
  const t = p.tor * DEG, tc = Math.cos(t), ts = Math.sin(t);
  const toLocal = (x, y) => { const bx = x * tc - y * ts, by = x * ts + y * tc; return [(p.x + bx * rc - by * rs) * isq * RIG, (hipY + bx * rs + by * rc) * sq * RIG]; };
  const a1 = p.nu * DEG, a2 = (p.nu + p.ne) * DEG;
  const fx = SH_N[0] + Math.sin(a1) * UPPER + Math.sin(a2) * (FORE + 8), fy = SH_N[1] + Math.cos(a1) * UPPER + Math.cos(a2) * (FORE + 8);
  const h = p.head * DEG;
  const hx = NECK[0] + 25 * Math.cos(h) + 11 * Math.sin(h), hy = NECK[1] + 25 * Math.sin(h) - 11 * Math.cos(h);
  const foot = (hip, a, b) => {
    const x = hip[0] + Math.sin(a * DEG) * THIGH + Math.sin((a + b) * DEG) * SHIN, y = hip[1] + Math.cos(a * DEG) * THIGH + Math.cos((a + b) * DEG) * SHIN + FOOT;
    return [(p.x + x * rc - y * rs) * isq * RIG, (hipY + x * rs + y * rc) * sq * RIG];
  };
  return { fist: toLocal(fx, fy), head: toLocal(hx, hy), hipY: hipY * RIG, feet: [foot(HIP_N, p.nt, p.ns), foot(HIP_F, p.ft, p.fs)] };
}

// ---------------------------------------------------------------- drawing
/**
 * Draw a Drake Brute.  ctx is positioned at its feet (screen), unscaled.
 * o: { facing: 1 | -1, t: seconds, scale, variant: undefined | 'magma', mem, vel: {x, y, z}, talk }
 */
export function draw(ctx, pose, o = {}) {
  const f = o.facing || 1;
  const S = o.scale || 1;
  T = o.t || 0;
  C = PALETTES[o.variant] || STD;
  _hipY = hipOf(pose);
  // secondary motion (follow returns the target straight back without o.mem)
  const mem = o.mem, vel = o.vel || V0;
  const vxl = (vel.x || 0) * f, vz = vel.z || 0;
  FX.tb = follow(mem, 'b_tb', pose.tb - vxl * 2.4 + vz * 2, 0.1, 0.8);
  FX.tc = follow(mem, 'b_tc', pose.tc - vxl * 0.5, 0.09, 0.82);
  FX.tw = pose.tw + Math.min(5, Math.abs(vxl)) * 1.2;
  FX.flap = follow(mem, 'b_flap', clamp(-vxl * 0.05 - vz * 0.02, -0.4, 0.4) + (pose.tor - 16) * 0.004, 0.12, 0.75);
  let bp = 0;
  if (mem) { if (mem.b_bp === undefined) mem.b_bp = Math.random() * 7; bp = mem.b_bp; }
  const bt = (T + bp) % 4.3;
  FX.blink = pose.blink || (bt > 4.17 && pose.glow < 0.3);
  FX.talk = o.talk ? (Math.sin(T * 13) > -0.25 ? 12 + 6 * Math.sin(T * 6.1) : 1) : 0;

  ctx.save();
  ctx.scale(f * S * RIG, S * RIG);
  if (pose.sq !== 1) ctx.scale(1 / Math.sqrt(pose.sq), pose.sq);
  ctx.translate(pose.x, _hipY);
  if (pose.rot) ctx.rotate(-pose.rot * DEG);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const tor = pose.tor * DEG;

  tail(ctx, pose);
  ctx.save(); ctx.rotate(tor); arm(ctx, pose, SH_F, pose.fu, pose.fe, true); ctx.restore();
  leg(ctx, HIP_F, pose.ft, pose.fs, pose.ff, true);
  leg(ctx, HIP_N, pose.nt, pose.ns, pose.nf, false);
  ctx.save(); ctx.rotate(tor);
  torso(ctx, pose);
  ctx.save(); ctx.translate(NECK[0], NECK[1]); ctx.rotate(pose.head * DEG); head(ctx, pose); ctx.restore();
  if (pose.smear > 0.01) smear(ctx, pose);   // under the arm: the fist stays readable on top of its streak
  arm(ctx, pose, SH_N, pose.nu, pose.ne, false);
  ctx.restore();
  ctx.restore();
}
export { draw as drawBrute };

// -------------------------------------------------- helpers
// Rim light (as Grimscale): a cool band just inside the outline on the side away from the key light.
function rim(ctx, path, lw, s = 1.4) {
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c;
  if (!det) return;
  const k = Math.sqrt(Math.abs(det)), wx = -0.8 * s * k, wy = 0.6 * s * k;
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  ctx.translate((m.d * wx - m.c * wy) / det, (-m.b * wx + m.a * wy) / det);
  ctx.beginPath(); path(ctx);
  ctx.lineWidth = s * 2 + lw * 0.25; ctx.strokeStyle = C.rim; ctx.globalAlpha = 0.8; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); path(ctx); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
}
function celR(ctx, path, base, dark, o, s) { const lw = o.lw ?? 3; o.lw = 0; cel(ctx, path, base, dark, o); rim(ctx, path, lw, s); }
function scaleTex(c, x0, x1, y0, y1, col, r = 3) {
  c.strokeStyle = col; c.lineWidth = 1.1;
  c.beginPath();
  let row = 0;
  for (let y = y0; y < y1; y += r * 1.5, row++) {
    for (let x = x0 + (row % 2) * r; x < x1; x += r * 2) {
      c.moveTo(x + r * Math.cos(0.15 * Math.PI), y + r * Math.sin(0.15 * Math.PI));
      c.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI);
    }
  }
  c.stroke();
}
// magma: glowing lava cracks (a soft hot halo under a bright core, pulsing; no blur)
function lava(c, lines, w = 1) {
  if (!C.lava) return;
  const pulse = 0.75 + 0.25 * Math.sin(T * 3.1);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath();
  for (const L of lines) { c.moveTo(L[0], L[1]); for (let i = 2; i < L.length; i += 2) c.lineTo(L[i], L[i + 1]); }
  c.globalAlpha = pulse; c.strokeStyle = C.lavaG; c.lineWidth = 4.2 * w; c.stroke();
  c.strokeStyle = C.lava; c.lineWidth = 2 * w; c.stroke();
  c.globalAlpha = 1; c.strokeStyle = C.lavaC; c.lineWidth = 0.9 * w; c.stroke();
}
const CR_BODY = [[-31, -58, -25, -64, -19, -60, -13, -68, -8, -66], [-27, -102, -20, -96, -15, -104, -8, -100], [-22, -32, -15, -38, -8, -33],
  [-2, -122, 5, -114, 13, -118], [-34, -84, -28, -80, -24, -86]];
const CR_ARM = [[-9, 8, -3, 15, -7, 22, -1, 31], [7, 10, 11, 18, 6, 26]];
const CR_THIGH = [[-9, 7, -3, 13, -7, 21, -2, 27]], CR_SHIN = [[5, 3, -1, 11, 4, 19]];
const CR_HEAD = [[-9, -9, -4, -14, 1, -12, 6, -16]], CR_JAW = [[6, 7, 13, 9, 20, 6]];
// tapered tube along a polyline (centre points + widths in module scratch arrays)
const MAXP = 10;
const px = new Float64Array(MAXP), py = new Float64Array(MAXP), pnx = new Float64Array(MAXP), pny = new Float64Array(MAXP), pw = new Float64Array(MAXP);
function tubeNormals(n) {
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = px[b] - px[a], dy = py[b] - py[a], L = Math.hypot(dx, dy) || 1;
    pnx[i] = -dy / L; pny[i] = dx / L;
  }
}
function tubePath(c, n, tipR) {
  c.moveTo(px[0] + pnx[0] * pw[0], py[0] + pny[0] * pw[0]);
  for (let i = 1; i < n - 1; i++) {
    const x1 = px[i] + pnx[i] * pw[i], y1 = py[i] + pny[i] * pw[i];
    const x2 = px[i + 1] + pnx[i + 1] * pw[i + 1], y2 = py[i + 1] + pny[i + 1] * pw[i + 1];
    c.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
  }
  const L = n - 1, ex = px[L] - px[L - 1], ey = py[L] - py[L - 1], el = Math.hypot(ex, ey) || 1;
  c.lineTo(px[L] + pnx[L] * pw[L], py[L] + pny[L] * pw[L]);
  c.quadraticCurveTo(px[L] + ex / el * tipR, py[L] + ey / el * tipR, px[L] - pnx[L] * pw[L], py[L] - pny[L] * pw[L]);
  for (let i = n - 2; i >= 1; i--) {
    const x1 = px[i] - pnx[i] * pw[i], y1 = py[i] - pny[i] * pw[i];
    const x0 = px[i - 1] - pnx[i - 1] * pw[i - 1], y0 = py[i - 1] - pny[i - 1] * pw[i - 1];
    c.quadraticCurveTo(x1, y1, i === 1 ? x0 : (x1 + x0) / 2, i === 1 ? y0 : (y1 + y0) / 2);
  }
  c.closePath();
}

// -------------------------------------------------- tail (hip space): thick, drooping to drag on the floor (follow)
const TN = 6, TSEG = 11;
function tail(ctx, p) {
  let x = TAIL0[0], y = TAIL0[1], th = Math.PI - FX.tb * DEG;
  px[0] = x; py[0] = y;
  for (let i = 0; i < TN; i++) {
    const wave = FX.tw * Math.sin((p.tp + T * 0.3) * TAU - i * 0.7) * (0.3 + i / TN);
    th += (FX.tc + wave * 0.5) * DEG;
    x += Math.cos(th) * TSEG; y += Math.sin(th) * TSEG;
    px[i + 1] = x; py[i + 1] = y;
  }
  // a tail can't sink through the floor (it drags along it), whatever the body rotation
  {
    const r = -p.rot * DEG, sr = Math.sin(r), cr = Math.cos(r);
    for (let i = 1; i <= TN; i++) {
      const lim = -_hipY - (2.5 + 12 * Math.pow(1 - i / TN, 0.8)) - 1;
      const wy = px[i] * sr + py[i] * cr;
      if (wy > lim) { const d = wy - lim; px[i] -= sr * d; py[i] -= cr * d; }
    }
  }
  const n = TN + 1;
  for (let i = 0; i < n; i++) pw[i] = 2.5 + 12 * Math.pow(1 - i / TN, 0.8);
  tubeNormals(n);
  // dorsal plates along the top of the tail
  for (let i = 1; i < TN - 1; i++) {
    const w = pw[i], nx = -pnx[i], ny = -pny[i];
    const bx = px[i] + nx * (w - 2), by = py[i] + ny * (w - 2);
    const ax = (px[i + 1] - px[i - 1]) * 0.18, ay = (py[i + 1] - py[i - 1]) * 0.18;
    flat(ctx, (c) => { c.moveTo(bx - ax, by - ay); c.lineTo(bx + nx * 7 - ax * 0.6, by + ny * 7 - ay * 0.6); c.lineTo(bx + ax, by + ay); c.closePath(); }, C.spike, 2.4);
  }
  celR(ctx, (c) => tubePath(c, n, 5), C.sc, C.scD, { k: 1.5, lw: 2.85, detail: (c) => {
    c.strokeStyle = C.scL; c.lineWidth = 2.5; c.lineCap = 'butt';
    c.beginPath();
    for (let i = 1; i < TN; i++) {
      const w = pw[i] + 3;
      c.moveTo(px[i] + pnx[i] * w, py[i] + pny[i] * w); c.lineTo(px[i] - pnx[i] * w, py[i] - pny[i] * w);
    }
    c.stroke(); c.lineCap = 'round';
    c.strokeStyle = C.belly; c.lineWidth = 4; c.globalAlpha = 0.6;
    c.beginPath(); c.moveTo(px[0] - pnx[0] * (pw[0] - 2.5), py[0] - pny[0] * (pw[0] - 2.5));
    for (let i = 1; i < TN; i++) c.lineTo(px[i] - pnx[i] * (pw[i] - 2.5), py[i] - pny[i] * (pw[i] - 2.5));
    c.stroke(); c.globalAlpha = 1;
    c.fillStyle = C.occ; c.beginPath(); circle(c, px[0], py[0], 13); c.fill();
    if (C.lava) {
      const L = [];
      for (let i = 1; i < TN; i++) L.push(px[i] + pnx[i] * (i % 2 ? 3 : -3), py[i] + pny[i] * (i % 2 ? 3 : -3));
      lava(c, [L], 0.9);
    }
  } }, 1.4);
}

// -------------------------------------------------- legs: short, thick, big 3-toed feet
function leg(ctx, hip, a, s, footAbs, far) {
  const base = far ? C.scD : C.sc;
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(-a * DEG);
  const thigh = (c) => capsule(c, THIGH, 32, 25);
  if (far) cel(ctx, thigh, base, C.scD, { k: 1.6, lw: 2.8, detail: (c) => { c.fillStyle = C.occ; c.fillRect(-18, -10, 36, 22); } });
  else celR(ctx, thigh, base, C.scD, { k: 1.6, lw: 2.9, detail: (c) => {
    scaleTex(c, -16, 16, 6, THIGH + 6, C.scL);
    c.fillStyle = C.occ; c.fillRect(-18, -10, 36, 16);           // in the shadow of the belt + loincloth
    lava(c, CR_THIGH);
  } }, 1.5);
  ctx.translate(0, THIGH);
  ctx.rotate(-s * DEG);
  const shin = (c) => capsule(c, SHIN, 25, 21);
  if (far) cel(ctx, shin, base, C.scD, { k: 1.4, lw: 2.8 });
  else celR(ctx, shin, base, C.scD, { k: 1.4, lw: 2.9, detail: (c) => lava(c, CR_SHIN) }, 1.4);
  if (!far) ink(ctx, (c) => { c.moveTo(4, -6); c.quadraticCurveTo(10, 0, 5, 6); }, 1.6, C.scD);
  // ragged wrap round the ankle (woven)
  cel(ctx, (c) => { c.moveTo(-11, SHIN - 9); c.lineTo(11, SHIN - 10); c.lineTo(11.5, SHIN - 3); for (let i = 0; i <= 5; i++) c.lineTo(11.5 - i * 23 / 5, SHIN - 2 + (i % 2 ? 3 : 0)); c.closePath(); },
    far ? C.clothD : C.cloth, C.clothD, { lw: 2.4, detail: (c) => {
      c.strokeStyle = C.clothD; c.lineWidth = 1; c.beginPath();
      for (let x = -10; x < 11; x += 3.2) { c.moveTo(x, SHIN - 9.5); c.lineTo(x + 1.6, SHIN - 2.5); }
      c.stroke();
    } });
  ctx.translate(0, SHIN);
  ctx.rotate((a + s - footAbs) * DEG);
  ctx.fillStyle = C.claw;
  ctx.beginPath();
  for (const [x, y] of [[27, 1], [30, 6], [25, 10]]) {
    ctx.moveTo(x - 2, y - 2.5); ctx.quadraticCurveTo(x + 5, y - 2.4, x + 6.5, y + 2.2); ctx.quadraticCurveTo(x + 2, y + 1.4, x - 1.5, y + 2.4);
  }
  ctx.fill();
  cel(ctx, (c) => {
    c.moveTo(-10, -5); c.quadraticCurveTo(6, -9, 18, -4);
    c.quadraticCurveTo(27, -5, 28, 1.5);
    c.quadraticCurveTo(32, 3, 31, 7);
    c.quadraticCurveTo(30.5, FOOT, 26, FOOT);
    c.lineTo(-9, FOOT); c.quadraticCurveTo(-14, 4, -10, -5);
    c.closePath();
  }, base, C.scD, { k: 1, lw: 2.8 });
  ink(ctx, (c) => { c.moveTo(18, -1); c.quadraticCurveTo(23, 0.5, 27, 2.5); c.moveTo(17, 4); c.quadraticCurveTo(22, 5.5, 26, 7); }, 1.5, C.scD);
  ctx.restore();
}

// -------------------------------------------------- torso (torso frame: hip at 0,0, up = -y)
const BODY = [[-22, 6], [-29, -16], [-29, -42], [-37, -76], [-34, -106], [-20, -126], [0, -133], [20, -122], [36, -104],
  [54, -84], [50, -58], [40, -36], [35, -12], [22, 6]];
const BELLY = [[20, -104], [40, -96], [52, -80], [48, -58], [38, -36], [33, -14], [16, -12], [11, -44], [12, -80]];
const SPIKES = [[-28, -116, -0.7], [-36, -96, -1.15], [-38, -74, -1.5], [-32, -50, -1.8]];
const bodyPath = (c) => blob(c, BODY, 0.55), bellyPath = (c) => blob(c, BELLY, 0.55);
function torso(ctx, p) {
  const br = 1 + 0.025 * p.breath;
  for (const [x, y, a] of SPIKES) {
    const dx = Math.cos(a + Math.PI), dy = Math.sin(a + Math.PI);
    flat(ctx, (c) => { c.moveTo(x - dy * 7 + dx * 2, y + dx * 7 + dy * 2); c.quadraticCurveTo(x + dx * 10, y + dy * 10, x + dx * 15 - dy * 3, y + dy * 15 + dx * 3); c.lineTo(x + dy * 7 + dx * 2, y - dx * 7 + dy * 2); c.closePath(); }, C.spike, 2.6);
  }
  // cloth flaps get shorter (bunch up) when sitting/lying would push them through the floor; they swing (follow)
  const tot = (p.tor - p.rot) * DEG, st = Math.sin(tot), ct = Math.cos(tot);
  const flapK = (x, y) => clamp((y + 16 - Math.max(0, _hipY + x * st + y * ct + 2)) / (y + 16), 0.35, 1);
  ctx.save(); ctx.translate(-18, -16); ctx.rotate(FX.flap * 0.8); ctx.scale(1, flapK(-15, 18)); ctx.translate(18, 16);
  cel(ctx, (c) => { c.moveTo(-32, -16); c.lineTo(-6, -14); c.lineTo(-4, 14); c.lineTo(-10, 10); c.lineTo(-15, 18); c.lineTo(-21, 11); c.lineTo(-27, 16); c.lineTo(-30, 6); c.closePath(); },
    C.clothD, C.clothD, { lw: 2.6 });
  ctx.restore();
  ctx.save(); ctx.scale(br, br);
  celR(ctx, bodyPath, C.sc, C.scD, { k: 2.4, hi: C.scH, hk: 0.3, lw: 2.95, detail: (c) => {
    scaleTex(c, -40, 10, -126, -40, C.scL, 3.4);
    c.fillStyle = C.occ;
    c.beginPath(); ellipse(c, 36, -98, 16, 9, 0.4); c.fill();          // under the jaw
    c.beginPath(); ellipse(c, 6, -84, 12, 18, 0.2); c.fill();          // the armpit, behind the near arm
    c.fillRect(-40, -16, 100, 10);                                       // under the belt
    lava(c, CR_BODY);
  } }, 1.6);
  if (C.apron) apron(ctx, p, flapK);
  else {
    celR(ctx, bellyPath, C.belly, C.bellyD, { k: 1.8, lw: 2.7, detail: (c) => {
      c.strokeStyle = C.bellyL; c.lineWidth = 1.6;
      c.beginPath();
      for (const y of [-66, -52, -40, -28]) { c.moveTo(10, y + 3); c.quadraticCurveTo(30, y - 2, 54, y + 2); }
      c.stroke();
      c.fillStyle = C.occ; c.beginPath(); ellipse(c, 34, -100, 18, 7); c.fill();
    } }, 1.4);
    ink(ctx, (c) => { c.moveTo(14, -80); c.quadraticCurveTo(34, -72, 52, -80); }, 2.2, C.bellyL);
  }
  ctx.restore();
  // heavy belt (stitched) with a goofy skull buckle
  cel(ctx, (c) => { c.moveTo(-37, -34); c.quadraticCurveTo(6, -28, 49, -36); c.lineTo(47, -18); c.quadraticCurveTo(6, -10, -35, -16); c.closePath(); },
    C.lea, C.leaD, { k: 1.2, hi: C.leaH, hk: 0.3, lw: 2.7, detail: (c) => {
      c.fillStyle = C.ironH;
      c.beginPath(); for (const x of [-26, -14, -2, 10]) circle(c, x, -23 + x * 0.02, 1.6); c.fill();
      c.strokeStyle = C.leaH; c.lineWidth = 1; c.setLineDash([2, 2.2]);
      c.beginPath(); c.moveTo(-34, -31); c.quadraticCurveTo(6, -25, 46, -32.5); c.moveTo(-33, -19); c.quadraticCurveTo(6, -13, 45, -21); c.stroke();
      c.setLineDash([]);
    } });
  // front loincloth (ragged, dark green, woven), swings with follow
  if (!C.apron) {
    const sw = Math.sin(T * 3) * 1.5;
    ctx.save(); ctx.translate(29, -19); ctx.rotate(FX.flap); ctx.scale(1, flapK(31, 22)); ctx.translate(-29, 19);
    cel(ctx, (c) => {
      c.moveTo(14, -18); c.lineTo(44, -20); c.lineTo(42 + sw, 18); c.lineTo(36 + sw, 12); c.lineTo(31 + sw, 22); c.lineTo(25 + sw, 13);
      c.lineTo(20 + sw, 20); c.lineTo(16 + sw, 10); c.closePath();
    }, C.cloth, C.clothD, { k: 1.2, hi: C.clothH, hk: 0.3, lw: 2.7, detail: (c) => {
      c.strokeStyle = C.clothD; c.lineWidth = 1.2; c.beginPath(); c.moveTo(24, -14); c.lineTo(25 + sw, 8); c.moveTo(34, -15); c.lineTo(35 + sw, 6); c.stroke();
      c.globalAlpha = 0.55; c.lineWidth = 0.9; c.beginPath(); for (let y = -12; y < 14; y += 4) { c.moveTo(15, y); c.lineTo(43, y - 1.5); } c.stroke(); c.globalAlpha = 1;
      c.fillStyle = C.occ; c.fillRect(10, -20, 40, 5);
    } });
    ctx.restore();
  }
  cel(ctx, (c) => { c.moveTo(29, -22); c.bezierCurveTo(29, -34, 49, -34, 49, -22); c.quadraticCurveTo(49, -16, 45, -15); c.lineTo(45, -11); c.lineTo(33, -11); c.lineTo(33, -15); c.quadraticCurveTo(29, -16, 29, -22); c.closePath(); },
    C.bone, C.boneD, { k: 0.9, lw: 2.5 });
  ctx.fillStyle = INK;
  ctx.beginPath(); ellipse(ctx, 35, -22, 3, 3.4); ellipse(ctx, 43, -22, 3, 3.4); ctx.fill();
  ink(ctx, (c) => { c.moveTo(37, -17); c.lineTo(39, -18.8); c.lineTo(41, -17); c.moveTo(35, -13); c.lineTo(35, -11.5); c.moveTo(39, -13); c.lineTo(39, -11.5); c.moveTo(43, -13); c.lineTo(43, -11.5); }, 1.3);
}
// magma: a leather forge-apron hung from a neck strap over the belly, its skirt swinging below the belt (follow)
function apron(ctx, p, flapK) {
  ink(ctx, (c) => { c.moveTo(18, -82); c.quadraticCurveTo(24, -100, 34, -104); }, 4.4);
  ink(ctx, (c) => { c.moveTo(18, -82); c.quadraticCurveTo(24, -100, 34, -104); }, 2.4, C.aprD);
  const bib = (c) => { c.moveTo(14, -84); c.quadraticCurveTo(34, -90, 50, -82); c.quadraticCurveTo(54, -60, 48, -30); c.lineTo(14, -26); c.quadraticCurveTo(10, -56, 14, -84); c.closePath(); };
  celR(ctx, bib, C.apr, C.aprD, { k: 1.6, hi: C.aprH, hk: 0.3, lw: 2.8, detail: (c) => {
    c.fillStyle = C.aprD; c.globalAlpha = 0.7; c.beginPath(); ellipse(c, 36, -50, 7, 5, 0.4); ellipse(c, 24, -66, 4, 3); c.fill(); c.globalAlpha = 1;   // scorch marks
    c.strokeStyle = C.aprD; c.lineWidth = 1.2; c.beginPath(); c.moveTo(20, -44); c.quadraticCurveTo(32, -40, 44, -44); c.stroke();      // pocket
    c.setLineDash([1.6, 1.8]); c.lineWidth = 0.9; c.strokeStyle = C.aprH; c.beginPath(); c.moveTo(17, -80); c.quadraticCurveTo(34, -86, 48, -79); c.stroke(); c.setLineDash([]);
    c.fillStyle = C.ironH; c.beginPath(); circle(c, 18, -80, 1.6); circle(c, 46, -79, 1.6); c.fill();
  } }, 1.4);
  ctx.save(); ctx.translate(31, -26); ctx.rotate(FX.flap); ctx.scale(1, flapK(31, 26)); ctx.translate(-31, 26);
  celR(ctx, (c) => { c.moveTo(14, -30); c.lineTo(48, -32); c.quadraticCurveTo(50, 2, 46, 26); c.lineTo(17, 26); c.quadraticCurveTo(12, 0, 14, -30); c.closePath(); },
    C.apr, C.aprD, { k: 1.4, hi: C.aprH, hk: 0.3, lw: 2.8, detail: (c) => {
      c.strokeStyle = C.aprD; c.lineWidth = 1.2; c.beginPath(); c.moveTo(24, -26); c.quadraticCurveTo(22, 0, 24, 24); c.moveTo(38, -27); c.quadraticCurveTo(40, 0, 38, 24); c.stroke();
      c.fillStyle = C.aprD; c.globalAlpha = 0.7; c.beginPath(); ellipse(c, 30, 12, 6, 4); c.fill(); c.globalAlpha = 1;
      c.fillStyle = C.occ; c.fillRect(10, -32, 42, 6);
    } }, 1.4);
  ctx.restore();
}

// -------------------------------------------------- head (head frame: origin at the neck joint)
const FACE_JAW = { mean: 0, yell: 26, ouch: 8, ko: 12, snort: 2 };
const HS = 1.25, HL = 1 / HS;   // head scale (reads at game scale) + ink compensation so its outlines match the body
function head(ctx, p) {
  const face = p.face;
  cel(ctx, (c) => blob(c, [[-14, 14], [-12, -8], [4, -14], [16, -6], [14, 14]], 0.6), C.sc, C.scD, { k: 1.2, lw: 2.8,
    detail: (c) => { c.fillStyle = C.occ; c.beginPath(); ellipse(c, 6, 10, 14, 7); c.fill(); } });
  ctx.translate(12, -3);
  ctx.scale(HS, HS);
  const jaw = (FACE_JAW[face] ?? 0) + p.jaw + FX.talk;
  const ja = jaw * DEG, jc = Math.cos(ja), js = Math.sin(ja);
  ctx.save(); ctx.translate(11, -21); ctx.rotate(0.22); horn(ctx, 0, 0, true); ctx.restore();
  if (jaw > 3) {
    flat(ctx, (c) => { c.moveTo(-6, 2); c.lineTo(30, 1.5); c.lineTo(-6 + 40 * jc + 3 * js, 2 + 40 * js - 3 * jc); c.closePath(); }, C.mouth, 0);
    ctx.fillStyle = C.tooth; ctx.strokeStyle = INK; ctx.lineWidth = 1.2 * HL;
    ctx.beginPath(); for (let x = 10; x <= 26; x += 5) { ctx.moveTo(x - 2, 2.6); ctx.lineTo(x, 7); ctx.lineTo(x + 2, 2.4); } ctx.fill(); ctx.stroke();
  }
  // upper skull: blocky with a heavy brow and a short snout
  celR(ctx, (c) => {
    c.moveTo(-12, 5);
    c.bezierCurveTo(-16, -6, -12, -19, -2, -21);
    c.bezierCurveTo(6, -23, 14, -21, 18, -18);
    c.quadraticCurveTo(24, -17, 24, -12.5);
    c.quadraticCurveTo(22.5, -10.5, 24, -9.5);
    c.quadraticCurveTo(31, -8.5, 32.5, -3);
    c.quadraticCurveTo(33, 2, 28, 2.5);
    c.lineTo(6, 3);
    c.quadraticCurveTo(-4, 10, -12, 5);
    c.closePath();
  }, C.sc, C.scD, { k: 1.4, hi: C.scH, hk: 0.35, lw: 2.95 * HL, detail: (c) => {
    scaleTex(c, -14, 10, -18, 4, C.scL, 2.6);
    c.fillStyle = C.occ; c.beginPath(); ellipse(c, 17, -11, 7, 5); c.fill();      // deep-set eye socket under the brow
    c.strokeStyle = C.scD; c.lineWidth = 1.2 * HL; c.beginPath(); c.moveTo(25, -8); c.quadraticCurveTo(28, -6, 30, -6.5); c.stroke();   // snout wrinkle
    lava(c, CR_HEAD, HL);
  } }, 1.4 * HL);
  flat(ctx, (c) => ellipse(c, 28.5, -5, face === 'snort' ? 2.4 : 1.6, face === 'snort' ? 1.8 : 1.2, -0.3), INK, 0);
  eye(ctx, p);
  // underbite lower jaw (in FRONT of the upper lip) with two tusks
  ctx.save(); ctx.translate(-6, 2); ctx.rotate(ja);
  if (jaw > 3 && face !== 'ouch') flat(ctx, (c) => ellipse(c, 22, -3, 11, 2.6), C.tongue, 1.5 * HL);
  tusk(ctx, 39, -4.8, 1.0, true);
  celR(ctx, (c) => { c.moveTo(-5, -4); c.lineTo(37, -5.5); c.quadraticCurveTo(43, -5.5, 42.5, 2); c.quadraticCurveTo(42, 12, 32, 15); c.quadraticCurveTo(14, 18, 2, 13); c.quadraticCurveTo(-6, 9, -5, -4); c.closePath(); },
    C.sc, C.scD, { k: 1.4, hi: C.scH, hk: 0.3, lw: 2.95 * HL, detail: (c) => {
      c.strokeStyle = C.scL; c.lineWidth = 1.2 * HL; c.beginPath(); c.moveTo(6, 4); c.quadraticCurveTo(20, 7, 36, 3); c.stroke();
      c.fillStyle = C.belly; c.beginPath(); c.moveTo(4, 14); c.quadraticCurveTo(22, 15.5, 40, 9); c.lineTo(44, 20); c.lineTo(-4, 20); c.closePath(); c.fill();
      lava(c, CR_JAW, HL);
    } }, 1.3 * HL);
  tusk(ctx, 33.5, -5.2, 1.3, false);
  if (face === 'ko') ink(ctx, (c) => { c.moveTo(34, -3); c.quadraticCurveTo(40, 4, 38, 10); }, 4.6 * HL), ink(ctx, (c) => { c.moveTo(34, -3); c.quadraticCurveTo(40, 4, 38, 10); }, 2.6 * HL, C.tongue);
  ctx.restore();
  horn(ctx, 1, -17, false);
  if (face === 'snort' || p.steam > 0) steam(ctx, p);
  if (face === 'ko') koStars(ctx, p);
}

// big horn curving up then forward (built as a tapered tube); magma horns are obsidian with an ember tip
const HORN = [[0, 0], [-5, -9], [-4, -20], [3, -28], [13, -31], [21, -29]];
function horn(ctx, x, y, far) {
  const n = HORN.length;
  for (let i = 0; i < n; i++) { px[i] = x + HORN[i][0]; py[i] = y + HORN[i][1]; pw[i] = 6.5 * Math.pow(1 - i / (n - 1), 0.9) + 0.6; }
  tubeNormals(n);
  const path = (c) => tubePath(c, n, 2);
  const o = { k: 1, lw: 2.8 * HL, detail: (c) => {
    c.strokeStyle = C.hornD; c.lineWidth = 1.4 * HL;
    c.beginPath();
    for (let i = 1; i < n - 2; i++) { const w = pw[i] + 2; c.moveTo(px[i] + pnx[i] * w, py[i] + pny[i] * w); c.lineTo(px[i] - pnx[i] * w, py[i] - pny[i] * w); }
    c.stroke();
    if (C.lava) { c.fillStyle = C.lava; c.globalAlpha = 0.85; c.beginPath(); circle(c, px[n - 1] - 2, py[n - 1], 4.5); c.fill(); c.globalAlpha = 1; }
  } };
  if (far) cel(ctx, path, C.hornD, C.hornD, o); else celR(ctx, path, C.horn, C.hornD, o, 1.1 * HL);
}
function tusk(ctx, x, y, s, far) {
  flat(ctx, (c) => { c.moveTo(x - 2.6 * s, y + 1); c.quadraticCurveTo(x - 3 * s, y - 6 * s, x - 0.5 * s, y - 10.5 * s); c.quadraticCurveTo(x + 2 * s, y - 5 * s, x + 2.6 * s, y + 1); c.closePath(); },
    far ? C.hornD : C.tooth, 2.1 * HL);
}

function eye(ctx, p) {
  const face = p.face;
  const ex = 17.5, ey = -11.5;
  const blink = FX.blink && (face === 'mean' || face === 'snort');
  if (face === 'ouch' || blink) {
    ink(ctx, (c) => face === 'ouch' ? (c.moveTo(14, -14), c.lineTo(19, -11), c.lineTo(14, -8.5)) : (c.moveTo(14.5, -11), c.quadraticCurveTo(17.5, -9, 20.5, -11)), 2.2 * HL);
  } else if (face === 'ko') {
    flat(ctx, (c) => circle(c, ex, ey, 5), '#fff', 2 * HL);
    ink(ctx, (c) => { for (let a = 0; a < 4 * Math.PI; a += 0.4) { const rr = 3.6 * a / (4 * Math.PI); c.lineTo(ex + Math.cos(a + T * 6) * rr, ey + Math.sin(a + T * 6) * rr); } }, 1.3 * HL);
  } else {
    const r = face === 'yell' ? 5 : 4.5;
    flat(ctx, (c) => ellipse(c, ex, ey, r, r * 1.05), C.eye, 2.2 * HL);
    ctx.fillStyle = C.eyeD; ctx.beginPath(); ellipse(ctx, ex + 0.8, ey + 1.6, r * 0.75, r * 0.5); ctx.fill();
    ctx.fillStyle = C.pupil; ctx.beginPath(); ellipse(ctx, ex + 1.4, ey + 0.3, 1.5, 2.9); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, ex - 1.4, ey - 1.6, 1.1); ctx.fill();
  }
  const tilt = face === 'ouch' ? -0.25 : face === 'ko' ? -0.1 : face === 'yell' ? 0.42 : 0.32;
  ctx.save(); ctx.translate(16, -18.6); ctx.rotate(tilt);
  cel(ctx, (c) => { c.moveTo(-8, 1.5); c.quadraticCurveTo(-6, -4, 2, -4); c.quadraticCurveTo(9, -3.5, 10, 2); c.quadraticCurveTo(1, 3.8, -8, 1.5); c.closePath(); },
    C.scD, C.scD, { lw: 2.5 * HL });
  ctx.restore();
}

// steam puffs from the nostrils (charging / snorting)
function steam(ctx, p) {
  const amt = Math.max(p.steam, p.face === 'snort' ? 1 : 0);
  for (let i = 0; i < 3; i++) {
    const ph = (T * 1.7 + i / 3) % 1;
    const sx = 33 + 16 * ph, sy = -2 + 9 * ph, r = 2.5 + 4.5 * ph;
    ctx.globalAlpha = amt * (1 - ph) * 0.95;
    flat(ctx, (c) => { circle(c, sx, sy, r); circle(c, sx + r * 0.8, sy - r * 0.4, r * 0.75); circle(c, sx - r * 0.6, sy - r * 0.5, r * 0.6); }, C.steam, 0);
    ink(ctx, (c) => { c.arc(sx, sy, r, 0.2, Math.PI - 0.2); }, 1.4 * HL, '#9aa6b4');
  }
  ctx.globalAlpha = 1;
}

function koStars(ctx, p) {
  ctx.save();
  ctx.translate(8, -20);
  ctx.rotate((p.rot - p.tor - p.head) * DEG);
  for (let i = 0; i < 3; i++) {
    const a = T * 3.5 + i * TAU / 3;
    const sx = Math.cos(a) * 20, sy = -24 + Math.sin(a) * 5;
    flat(ctx, (c) => {
      for (let j = 0; j < 8; j++) {
        const rr = j % 2 ? 1.8 : 5, aa = j * Math.PI / 4 - Math.PI / 2;
        j ? c.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr) : c.moveTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
      }
      c.closePath();
    }, C.star, 1.6 * HL);
  }
  ctx.restore();
}

// -------------------------------------------------- arms (torso frame): huge, spiked iron gauntlets (or magma mitts), giant fists
function arm(ctx, p, slot, u, e, far) {
  const base = far ? C.scD : C.sc;
  ctx.save();
  ctx.translate(slot[0], slot[1]);
  ctx.rotate(-u * DEG);
  const upper = (c) => capsule(c, UPPER, 34, 26);
  if (far) cel(ctx, upper, base, C.scD, { k: 1.8, lw: 2.8 });
  else celR(ctx, upper, base, C.scD, { k: 1.8, hi: C.scH, hk: 0.3, lw: 2.9, detail: (c) => {
    scaleTex(c, -18, 18, 4, UPPER + 8, C.scL, 3.2);
    c.fillStyle = C.occ; c.beginPath(); ellipse(c, -10, 30, 7, 14); c.fill();     // inner arm in shadow
    lava(c, CR_ARM);
  } }, 1.5);
  if (!far) ink(ctx, (c) => { c.moveTo(9, 20); c.quadraticCurveTo(14, 28, 9, 36); }, 1.8, C.scD);
  ctx.save();
  ctx.translate(0, UPPER);
  ctx.rotate(-e * DEG);
  cel(ctx, (c) => capsule(c, 14, 25, 24), base, C.scD, { k: 1.2, lw: 2.7 });
  const iron = far ? C.ironD : C.iron;
  if (!C.mitts) for (const y of [14, 23, 32]) flat(ctx, (c) => { c.moveTo(-12.5, y - 4.5); c.lineTo(-22, y + 1); c.lineTo(-13, y + 3.5); c.closePath(); }, far ? C.ironD : C.ironH, 2.3);
  const bracer = (c) => { c.moveTo(-12.5, 6); c.quadraticCurveTo(0, 2, 12.5, 6); c.lineTo(16, FORE - 4); c.quadraticCurveTo(0, FORE + 1, -16, FORE - 4); c.closePath(); };
  const bo = { k: 1.4, hi: far ? null : C.ironH, hk: 0.4, lw: 2.8, detail: (c) => {
    c.strokeStyle = C.ironD; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-13.5, 17); c.quadraticCurveTo(0, 20, 14, 17); c.moveTo(-14.5, 27); c.quadraticCurveTo(0, 30, 15, 27); c.stroke();
    c.fillStyle = C.ironH; c.beginPath(); circle(c, -7, 10, 1.4); circle(c, 7, 10, 1.4); c.fill();
    if (!far) { c.strokeStyle = C.ironS; c.lineWidth = 0.8; c.beginPath(); c.moveTo(4, 12); c.lineTo(9, 15); c.moveTo(-6, 31); c.lineTo(-1, 33); c.stroke(); }   // scratches
    if (C.mitts) { c.strokeStyle = C.lava; c.lineWidth = 1.6; c.globalAlpha = 0.8; c.beginPath(); c.moveTo(-15, FORE - 6); c.quadraticCurveTo(0, FORE - 2, 15, FORE - 6); c.stroke(); c.globalAlpha = 1; }
  } };
  if (far) cel(ctx, bracer, iron, C.ironD, bo); else celR(ctx, bracer, iron, C.ironD, bo, 1.3);
  if (!far) cuffGem(ctx, p);
  ctx.translate(0, FORE + 4);
  if (C.mitts) {
    // big riveted iron mitt with a hot seam over the knuckles
    const mitt = (c) => blob(c, [[-16, -9], [0, -13], [16, -9], [20, 3], [14, 17], [-2, 20], [-16, 14], [-19, 2]], 0.6);
    const mo = { k: 1.6, hi: far ? null : C.ironH, hk: 0.35, lw: 2.9, detail: (c) => {
      c.strokeStyle = C.ironD; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-16, 4); c.quadraticCurveTo(0, 8, 18, 3); c.stroke();
      c.fillStyle = C.ironH; c.beginPath(); circle(c, -10, -4, 1.4); circle(c, 10, -4, 1.4); circle(c, 0, 13, 1.4); c.fill();
      c.globalAlpha = 0.85; c.strokeStyle = C.lava; c.lineWidth = 2; c.beginPath(); c.moveTo(12, -8); c.quadraticCurveTo(19, 3, 13, 15); c.stroke(); c.globalAlpha = 1;
      c.strokeStyle = C.lavaC; c.lineWidth = 0.8; c.beginPath(); c.moveTo(12, -8); c.quadraticCurveTo(19, 3, 13, 15); c.stroke();
    } };
    if (far) cel(ctx, mitt, iron, C.ironD, mo); else celR(ctx, mitt, iron, C.ironD, mo, 1.4);
  } else {
    for (const [x, y] of [[13, -6], [15.5, 2], [13, 10]]) flat(ctx, (c) => { c.moveTo(x - 1, y - 4); c.lineTo(x + 8, y); c.lineTo(x - 1, y + 4); c.closePath(); }, far ? C.ironD : C.ironH, 2.3);
    const fist = (c) => blob(c, [[-14, -8], [0, -12], [14, -8], [17, 3], [12, 14], [-2, 17], [-14, 12], [-17, 1]], 0.6);
    const fo = { k: 1.6, hi: far ? null : C.ironH, hk: 0.35, lw: 2.9, detail: (c) => {
      c.strokeStyle = C.ironD; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(6, -9); c.quadraticCurveTo(11, 3, 6, 14); c.moveTo(-2, -10); c.quadraticCurveTo(2, 3, -2, 15); c.stroke();
      if (!far) { c.strokeStyle = C.ironS; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-10, -2); c.lineTo(-6, 2); c.stroke(); }
    } };
    if (far) cel(ctx, fist, iron, C.ironD, fo); else celR(ctx, fist, iron, C.ironD, fo, 1.4);
  }
  ctx.restore();
  // the ONE pauldron (near shoulder only)
  if (!far) { ctx.save(); ctx.translate(1, 2); ctx.scale(0.82, 0.82); pauldron(ctx, p); ctx.restore(); }
  ctx.restore();
}

// the faction's glowing green gem, set in a diamond plate on the near gauntlet cuff (flares on the wind-ups)
function cuffGem(ctx, p) {
  const pulse = 0.5 + 0.5 * Math.sin(T * 4.5), gl = clamp(p.glow, 0, 1);
  const dia = (c, r) => { c.moveTo(0, 21 - r * 1.25); c.lineTo(r, 21); c.lineTo(0, 21 + r * 1.25); c.lineTo(-r, 21); c.closePath(); };
  if (gl > 0.05) { ctx.globalAlpha = 0.35 * gl + 0.15 * pulse * gl; ctx.fillStyle = C.gem; ctx.beginPath(); dia(ctx, 9 + 3 * pulse); ctx.fill(); ctx.globalAlpha = 1; }
  flat(ctx, (c) => dia(c, 6.2), C.ironD, 2.3);
  flat(ctx, (c) => dia(c, 3.8), C.gem, 1.4);
  ctx.fillStyle = gl > 0.5 ? '#ffffff' : C.gemC; ctx.beginPath(); ellipse(ctx, -0.9, 19.6, 0.9, 1.5); ctx.fill();
}

function pauldron(ctx, p) {
  cel(ctx, (c) => { c.moveTo(-21, 14); c.quadraticCurveTo(0, 20, 21, 14); c.lineTo(20, 24); c.quadraticCurveTo(0, 30, -19, 24); c.closePath(); },
    C.iron, C.ironD, { k: 1, hi: C.ironH, hk: 0.4, lw: 2.9 });
  celR(ctx, (c) => { c.moveTo(-23, 15); c.bezierCurveTo(-27, -6, -16, -17, 0, -17); c.bezierCurveTo(16, -17, 27, -6, 23, 15); c.quadraticCurveTo(0, 23, -23, 15); c.closePath(); },
    C.iron, C.ironD, { k: 1.8, hi: C.ironH, hk: 0.35, lw: 3.2, detail: (c) => {
      c.strokeStyle = C.ironD; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-21, 8); c.quadraticCurveTo(0, 15, 21, 8); c.stroke();
      c.fillStyle = C.ironH; c.beginPath(); circle(c, -15, 7, 1.6); circle(c, 15, 7, 1.6); circle(c, -12, -7, 1.4); circle(c, 12, -7, 1.4); c.fill();
      c.strokeStyle = C.ironS; c.lineWidth = 1; c.beginPath(); c.moveTo(-6, -10); c.lineTo(-1, -6); c.moveTo(8, -2); c.lineTo(13, 1); c.stroke();     // scratches
    } }, 1.6);
  flat(ctx, (c) => { c.moveTo(-9, -14); c.lineTo(-13, -29); c.lineTo(3, -16.5); c.closePath(); }, C.ironH, 2.6);
  ctx.fillStyle = C.ironD;
  ctx.beginPath(); for (const x of [-12, -4, 4, 12]) circle(ctx, x, 1.5 + Math.abs(x) * 0.08, 1.7); ctx.fill();
}

// motion smear: a crescent swept by the fist, in the near shoulder's frame
function smear(ctx, p) {
  const a0 = p.sa0, a1 = p.sa1, R = p.sr;
  const n = 16;
  ctx.save();
  ctx.translate(SH_N[0], SH_N[1]);
  ctx.globalAlpha = clamp(p.smear, 0, 1) * 0.8;
  const ptx = (a, r) => Math.sin(a * DEG) * r, pty = (a, r) => Math.cos(a * DEG) * r;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); i ? ctx.lineTo(ptx(a, R + 14), pty(a, R + 14)) : ctx.moveTo(ptx(a, R + 14), pty(a, R + 14)); }
  for (let i = n; i >= 0; i--) {
    const u = i / n, a = a0 + (a1 - a0) * u, th = 2 + 26 * Math.pow(u, 1.4);
    ctx.lineTo(ptx(a, R + 14 - th), pty(a, R + 14 - th));
  }
  ctx.closePath();
  ctx.fillStyle = C.lava ? '#ffe2b8' : '#fffbea'; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

export const HEIGHT = 210;
/** Suggested body hurtbox (local px at scale 1): centred x px in front of the origin (times facing), w wide, h tall from the floor. */
export const HURTBOX = { x: 22, w: 104, h: 200 };
/** Near-fist centre at the moment the haymaker lands (local px, facing right, scale 1). */
export const PUNCH_FIST = measure(ANIM.punch(0.2)).fist.map((v) => Math.round(v));
/** Head centre (horns) during the charge run (local px). */
export const CHARGE_HEAD = measure(ANIM.charge(0)).head.map((v) => Math.round(v));
