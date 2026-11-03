// BOSS: MAGMAW, the Lava Wyrm.  Art (drawn in code) + pose library + the lava pool he swims through.
//
// An old clan elder wyrm under the Dragon King's curse: a huge serpentine fire-wyrm that rises out of a lava pool
// in an S-curve.  Big armoured head (~135 px long) with a jutting under-bite jaw and tusks, long swept-back
// curling horns, a heavy rock brow, two long whisker-barbels (he is old and wise), a molten glowing throat and
// GREEN glowing eyes while cursed.  A long thick segmented body: brick-red hide, overlapping basalt rock plates
// with spikes down the back, a molten underside of glowing belly scutes; small finned forelimbs.  The Dragon
// King's black-iron collar with a big green gem clamps the neck just below the head.  Beaten (`defeated`) the
// collar cracks and shatters, and `freed` shows him gentle and sleepy with warm amber eyes and a grateful smile.
//
// Local space: origin = the CENTRE of the lava pool he is using (on the floor), +x = facing, y down.  Whatever
// sinks below the lava surface (y > -1 inside the pool, |x| < POOL.rx) is clipped away, so `sink` slides him in
// and out.  Spine: 12 segments driven by 4 control angles (a0..a3, deg in canvas terms: -90 = straight up,
// 0 = forward, 90 = down) + a travelling sway; outside the pool the body lies on the floor instead of sinking.
// The head angle hd is absolute (0 = level, + = nose down).  ~250 px from the floor to the horns in idle.
// o.mem: each spine segment, the head and the whiskers chase their targets with rig.follow() (lag + overshoot).
// o.talk: the mouth flaps from o.t (cutscene).  o.cursed (default true): collar, green eyes.
//
// Engine notes (all measurements: local px, facing right, scale 1, relative to the pool centre; mirror x for -1):
//  - drawPool(ctx, t, bubbling01, scale) under everything (3 pools); POOL = { rx, ry } of the lava ellipse.
//  - FRAMES = the frame count each keyed move is timed for.  submerged is static; idle / freed / roar take t
//    (roar from t = 0: a 0.35 s dip, then the roar).  `submerged` shows his spikes cutting the surface.
//  - breath(k) 70 f: the stream comes from mouthOf(pose) = [x, y, angle] every frame (the head sweeps from
//    ~51 deg down to ~28 deg); MOUTH / BREATH_MOUTH = its value at k = BREATH_K (0.1, the snap).
//  - bite(k) 30 f: contact k = BITE_K (0.35) at BITE; BITE_REACH = BITE[0] (~267 px in front of the pool centre).
//  - slam(k) 34 f: contact k = SLAM_K (0.4); SLAM_BOX = { x0, x1, y0, y1 } covered by the body on the floor;
//    spineOf(pose) gives [x, y, halfWidth] down the body for precise boxes at any k.
//  - headOf(pose) = { x, y, r }: the head's hurt circle (in stagger it rests at ~[231, -36] on the floor).
//  - defeated(k) 100 f: the collar cracks from k .4 and bursts at k .88 (shards + flash drawn here); his eyes open
//    warm amber after it.  drawCollar(ctx, { scale, crack, t, rot }) draws a loose collar if the engine wants one.
//  - drawFx(ctx, pose, o, 'back' | 'front', rings): the effects alone, around a sprite body (./magmaw3d.js).
import { cel, flat, ink, blob, ellipse, circle, keys, mix, DEG, TAU, clamp, lerp, follow } from '../rig.js';
import { INK } from '../config.js';

const LAVA = {
  name: 'lava',
  hide: '#93402f', hideD: '#5f2420', hideH: '#c4664c', hideL: '#6f2b25',
  hideF: '#6d2b24', hideFD: '#45181a',
  rock: '#4f4550', rockD: '#302830', rockH: '#8a7b88', rockL: '#3b3240', rockF: '#3e3540', rockFD: '#251f26',
  mol: '#ff9b2e', molD: '#e0581c', molH: '#ffe066', molC: '#fff6c4', molL: '#b9441a',
  horn: '#ecdcb8', hornD: '#ad9672', hornL: '#94805e',
  iron: '#3d404b', ironD: '#1f2128', ironH: '#7b8191', ironL: '#575b69',
  gem: '#62ff8c', gemD: '#13a845', gemC: '#eaffdf', glow: '#5cff7e',
  eyeW: '#fffaf0', gold: '#ffbe3c', goldD: '#c27512', pupil: '#2b1406',
  mouth: '#3e0f12', tongue: '#d4555a', tongueD: '#9e3640', tooth: '#fff6e2',
  mem: '#7c2a28', memD: '#521a1c',
  rim: '#ddd4ff',
  smoke: '#574b55', smokeL: '#857884', star: '#ffe45c', dark: '#5a1a10',
  // (lava-only colours, by name for the crystal palette: the heat haze over the pool, the far fin's line, the fire-lit
  //  mouth, a cold ember, the pool's gradient / drifting skins / swirls / far-rim shade / edge)
  heat: ['rgba(255,140,40,0)', 'rgba(255,120,36,0.5)', 'rgba(255,214,90,0.95)'], finFarD: '#8a3214', mouthFire: '#6e1a10',
  ember: '#9c8f99', plateD: '#3d3442',
  pool: ['#fff3b0', '#ffcf45', '#ff9226', '#d9481a'], poolSkin: 'rgba(150,40,14,0.55)', poolSwirl: 'rgba(255,246,196,0.75)',
  poolShade: 'rgba(120,30,10,0.45)', poolEdge: '#7a2a12',
};
// CRYSTAL MAGMAW (the Crystal Deep's mini-boss, docs/SECRETS.md; tools/sprite3d chars/magmaw_crystal.py PALETTE): an
// indigo hide, violet crystal plates, teal glowing belly / fins -- and a pool of glowing crystal water (teal #5ff0e0,
// violet #9a6ce0) where the lava was.  o.variant 'crystal' (drawPool: its 5th argument).  The curse's green stays.
const CRYSTAL = Object.assign({}, LAVA, {
  name: 'crystal',
  hide: '#5a3f8a', hideD: '#3a2862', hideH: '#8f74c4', hideL: '#46306e', hideF: '#4a3478', hideFD: '#30205a',
  rock: '#9a6ce0', rockD: '#6a40b0', rockH: '#e0ccff', rockL: '#7a50c0', rockF: '#7a50c0', rockFD: '#4a2a80',
  mol: '#5ff0e0', molD: '#22b8b0', molH: '#a8fff4', molC: '#e8fffc', molL: '#1a8a88',
  horn: '#e8dcff', hornD: '#b4a0e0', hornL: '#9a86c8',
  mem: '#4a3478', memD: '#30205a',
  smoke: '#6a7a9a', smokeL: '#a0b0d0', dark: '#1a2a5a',
  heat: ['rgba(95,240,224,0)', 'rgba(95,240,224,0.35)', 'rgba(232,255,252,0.8)'], finFarD: '#1a5a68', mouthFire: '#2a1a4a',
  ember: '#8a9ab8', plateD: '#4a2a80',
  pool: ['#e8fffc', '#a8fff4', '#5ff0e0', '#3a7ab0'], poolSkin: 'rgba(154,108,224,0.55)', poolSwirl: 'rgba(232,255,252,0.8)',
  poolShade: 'rgba(40,30,100,0.4)', poolEdge: '#3a2a6a',
});
const PAL = (v) => (v === 'crystal' ? CRYSTAL : LAVA);
let C = LAVA;

// ---------------------------------------------------------------- skeleton (px at scale 1)
export const POOL = { rx: 75, ry: 23 };
const N = 12, SEG = 19;                  // body segments from the lava surface to the head joint
const HS = 0.9;                          // head scale (head numbers are drawn at 1/HS)
const halfW = (u) => 37 - 14 * u;        // body half-width along the spine (u = 0 at the lava)
const ARM_AT = 1.9, COLLAR_AT = N - 3.3;
const KA = Array.from({ length: N }, (_, i) => 'mw' + i);

// ---------------------------------------------------------------- poses
// x: base shift inside the pool, sink: px the whole body is pushed down (into the lava), a0..a3: spine control
// angles, len: spine stretch, sw: sway (deg), sp: sway phase, fat: body thickness (squash), swell: chest swell
// (fire breath) 0..1.  hd: head angle (deg, + = nose down), jaw: deg open, glow: fire rising up the belly into the
// throat 0..1, tongue: 0..1.  arm/armE: forelimb (deg from the belly normal / elbow bend); grip: 0..1 the claws
// hold the pool's rim instead.  hump: the coil of body arching out of the lava behind him 0..1.  splash: splash
// progress 0..1 (spA amount, spX centre), dome: lava swelling before he bursts out, fins: dorsal spikes cutting
// the surface (submerged tell).  dust: slam impact progress.  crack: collar cracking 0..1, shatter: collar
// bursting 0..1.  smear: 0..1 bite smear.  vis: 0 = submerged.  free: no curse (amber eyes, no collar).
export const BASE = {
  x: 0, sink: 0, a0: -50, a1: -132, a2: -104, a3: -14, len: 1, sw: 2.5, sp: 0, fat: 1, swell: 0,
  hd: 28, jaw: 4, glow: 0, tongue: 0,
  arm: 76, armE: 40, grip: 1, hump: 1,
  splash: 0, spA: 0, spX: null, dome: 0, fins: 0, dust: 0, crack: 0, shatter: 0, smear: 0, sm: 'bite', spk: 0, ef: 0,
  face: 'mean', blink: false, free: false, vis: 1, bub: 0, stars: false,
};
const P = (o) => Object.assign({}, BASE, o);

const IDLE = P({});
// the three wind-ups have different shapes so they can be learned: breath = rear back with a swollen glowing
// chest; bite = coil down low like a spring, jaws wide; slam = rise to full height leaning back, glaring down
const BR_WIND = P({ sink: -10, a0: -70, a1: -134, a2: -126, a3: -94, hd: -36, jaw: 12, glow: 1, swell: 1, arm: 40, armE: 70, grip: 0.4, face: 'breath' });
const B_WIND = P({ sink: 22, a0: -36, a1: -156, a2: -98, a3: -34, hd: 24, jaw: 40, fat: 1.08, arm: 60, armE: 60, grip: 0.7, face: 'roar' });
const BITE_HIT = P({ a0: -82, a1: -66, a2: -24, a3: 24, hd: 20, jaw: 0, len: 0.98, arm: 90, armE: 30, grip: 0, sw: 0.5, hump: 0.7, face: 'mean', smear: 1, sm: 'bite' });
const S_WIND = P({ sink: -16, a0: -104, a1: -110, a2: -118, a3: -108, hd: 30, jaw: 0, arm: 70, grip: 1, sw: 0.5, spk: 1, face: 'mean' });
const SLAMMED = P({ a0: -26, a1: 2, a2: 3, a3: 4, hd: 4, jaw: 12, len: 1.06, arm: 100, armE: 10, grip: 0, sw: 0, hump: 0.6, face: 'mean' });
const DAZE = P({ sink: 36, a0: -75, a1: -50, a2: 15, a3: 25, hd: 2, jaw: 16, tongue: 1, arm: 70, armE: 40, grip: 1, sw: 1, face: 'dazed', stars: true });
const HURT0 = P({ sink: 6, a0: -56, a1: -138, a2: -124, a3: -78, hd: -30, jaw: 26, sw: 0, grip: 0.5, face: 'ouch' });

export const ANIM = {
  // body hidden under the lava: his dorsal spikes cut the surface like a shark's fin, bubbles, a dark shape below
  submerged: P({ vis: 0, bub: 1, fins: 1 }),
  // 40 f: spikes rise, the pool swells, he bursts up through a crown of lava (splash arcs), roars, settles
  emerge: (k) => {
    const UNDER = { a0: -90, a1: -90, a2: -92, a3: -84, hd: -66, jaw: 0, arm: -10, armE: 20, grip: 0, hump: 0 };
    const p = keys(k, [
      [0, P({ ...UNDER, sink: 430 })],
      [0.16, P({ ...UNDER, sink: 330 })],
      [0.4, P({ sink: -16, a0: -76, a1: -112, a2: -104, a3: -72, hd: -40, jaw: 36, arm: -30, armE: 20, grip: 0, hump: 0, face: 'roar' }), 'out'],
      [0.62, P({ sink: 4, a0: -62, a1: -124, a2: -100, a3: -40, hd: 0, jaw: 28, arm: 30, armE: 50, grip: 0.5, hump: 0.7, face: 'roar' })],
      [1, IDLE],
    ]);
    p.dome = k < 0.22 ? Math.sin(clamp(k / 0.2, 0, 1) * Math.PI * 0.5) * (k < 0.18 ? 1 : 1 - (k - 0.18) / 0.04) : 0;
    p.fins = k < 0.2 ? 1 + k * 3 : 0;
    p.splash = clamp((k - 0.16) / 0.66, 0, 1); p.spA = 1.3;
    return p;
  },
  idle(t) {
    const w = t * 2.6;
    const p = P({ sink: 3 * Math.sin(w - 0.4), a1: -132 + 7 * Math.sin(w), a2: -104 + 8 * Math.sin(w - 0.7), a3: -14 + 11 * Math.sin(w - 1.4),
      hd: 28 + 7 * Math.sin(w - 2), jaw: 4 + 3 * Math.max(0, Math.sin(t * 0.8)), hump: 1 + 0.12 * Math.sin(w * 0.5 + 1) });
    p.blink = (t % 4.6) > 4.46;
    // fidget every 5.6 s: a slow head shake and a snort of smoke
    const u = t % 5.6;
    if (u > 4.4) { const v = (u - 4.4) / 1.2; p.hd += 8 * Math.sin(v * TAU * 1.5) * Math.sin(v * Math.PI); p.jaw += 8 * Math.sin(v * Math.PI); p.snort = v; }
    return p;
  },
  // 36 f: rears back, the chest swells and fire climbs up the belly into the throat
  breathWind: (k) => keys(k, [
    [0, IDLE],
    [0.4, P({ sink: -4, a0: -62, a1: -128, a2: -118, a3: -76, hd: -18, jaw: 6, glow: 0.4, swell: 0.55, arm: 56, armE: 60, grip: 0.7, face: 'breath' }), 'out'],
    [1, BR_WIND],
  ]),
  // 70 f: the head snaps down and sweeps a fire stream across the floor (engine: mouthOf(pose) -> [x, y, angle])
  breath: (k) => keys(k, [
    [0, BR_WIND],
    [0.1, P({ a0: -58, a1: -124, a2: -82, a3: -10, hd: 34, jaw: 34, glow: 1, swell: 0.4, arm: 64, armE: 50, grip: 0.5, sw: 1, face: 'breath' }), 'snap'],
    [0.86, P({ a0: -52, a1: -114, a2: -62, a3: 6, hd: 12, jaw: 32, glow: 1, swell: 0.2, len: 1.04, arm: 64, armE: 50, grip: 0.5, sw: 1, face: 'breath' })],
    [1, P({ jaw: 10, glow: 0.2 })],
  ]),
  // 24 f: coils down like a spring, head pulled back low, jaws wide, a shiver of tension at the end
  biteWind: (k) => {
    const p = keys(k, [
      [0, IDLE],
      [0.45, P({ sink: 12, a0: -42, a1: -146, a2: -100, a3: -40, hd: 20, jaw: 22, fat: 1.04, arm: 66, grip: 0.8, face: 'roar' }), 'out'],
      [1, B_WIND],
    ]);
    if (k > 0.65) { p.hd += 2.5 * Math.sin(k * 130); p.a2 += 2 * Math.sin(k * 150); p.ef = clamp((k - 0.65) / 0.2, 0, 1); }
    return p;
  },
  // 30 f: uncoils far out of the pool, jaws SNAP shut at k .35, holds, recoils
  bite: (k) => keys(k, [
    [0, B_WIND],
    [0.2, P({ ...BITE_HIT, a0: -84, a1: -68, a2: -26, a3: 18, hd: 8, jaw: 46, len: 0.96, face: 'roar', smear: 0.5 }), 'snap'],
    [0.35, BITE_HIT, 'in'],
    [0.62, P({ ...BITE_HIT, a0: -84, a1: -70, a2: -28, a3: 18, hd: 22, jaw: 6, len: 0.95, smear: 0.25 })],
    [1, IDLE],
  ]),
  // 30 f: rises to his full height, leaning back, glaring down at the floor, arms spread
  slamWind: (k) => keys(k, [
    [0, IDLE],
    [0.5, P({ sink: -10, a0: -98, a1: -114, a2: -112, a3: -86, hd: 26, jaw: 2, arm: 70, grip: 1, sw: 0.8, spk: 0.5, face: 'mean' }), 'out'],
    [1, S_WIND],
  ]),
  // 34 f: the whole body crashes down across the floor (contact k .4: a long hitbox, see SLAM_BOX / spineOf)
  slam: (k) => {
    const p = keys(k, [
      [0, S_WIND],
      [0.4, P({ ...SLAMMED, fat: 1.16, jaw: 20, face: 'roar' }), 'in'],
      [0.5, P({ ...SLAMMED, fat: 1.04, a0: -34, a1: -8, a2: -6, a3: -6, hd: -10, jaw: 16 }), 'out'],
      [0.62, P({ ...SLAMMED, fat: 1.08 }), 'in'],
      [0.82, P({ ...SLAMMED, a0: -34, a1: -10, a2: -2, a3: 0, hd: 6, jaw: 6 })],
      [1, IDLE],
    ]);
    p.dust = k >= 0.4 ? clamp((k - 0.4) / 0.5, 0, 1) : 0;
    if (p.dust > 0) { p.splash = clamp((k - 0.4) / 0.45, 0, 1); p.spA = 0.55; p.spX = 30; }
    return p;
  },
  // 30 f: arcs over and dives head first back into the pool
  dive: (k) => {
    const OVER = { x: -30, a0: -100, a1: -110, a2: -20, a3: 80, hd: 95, jaw: 4, arm: 110, armE: 20, grip: 0, sw: 0 };
    const p = keys(k, [
      [0, IDLE],
      [0.25, P({ sink: -8, a0: -70, a1: -122, a2: -110, a3: -64, hd: -14, jaw: 6, arm: 20, armE: 30, grip: 0 }), 'out'],
      [0.5, P({ ...OVER, sink: -10 })],
      [1, P({ ...OVER, sink: 330 }), 'in'],
    ]);
    p.hump = 1 - clamp(k * 2.2, 0, 1);
    p.splash = clamp((k - 0.48) / 0.52, 0, 1); p.spA = 0.75; p.spX = 30;
    return p;
  },
  hurt: (k) => keys(k, [
    [0, HURT0],
    [0.35, P({ sink: 2, a0: -52, a1: -136, a2: -112, a3: -44, hd: -6, jaw: 14, grip: 0.8, face: 'ouch' }), 'out'],
    [1, IDLE],
  ]),
  // 40 f: dazed, the head drops onto the pool's rim with a bounce and lolls there under circling stars (the
  // vulnerable window: hold k = 1, the stars and the flickering gem keep moving with o.t)
  stagger: (k) => {
    const p = keys(k, [
      [0, P({ ...HURT0, a3: -84, hd: -36 })],
      [0.3, P({ ...DAZE, hd: 8, jaw: 22 }), 'in'],
      [0.42, P({ ...DAZE, sink: 28, a3: 18, hd: -10 }), 'out'],
      [0.56, DAZE, 'in'],
      [1, DAZE],
    ]);
    if (k > 0.56) p.hd += 2.5 * Math.sin((k - 0.56) * TAU * 2.2);
    return p;
  },
  // 100 f: a last roar, collapses onto the rim with his eyes squeezed shut; the collar cracks with light leaking
  // out (k .4 .. .85) and bursts in a flash (k .88); his eyes open warm amber (k ~ .9)
  defeated: (k) => {
    const p = keys(k, [
      [0, P({ ...HURT0, a3: -86, hd: -40, jaw: 38, face: 'roar' })],
      [0.16, P({ ...HURT0, sink: 8, a3: -88, hd: -44, jaw: 34 })],
      [0.36, P({ ...DAZE, hd: 8, jaw: 20, stars: false, face: 'ouch' }), 'in'],
      [0.46, P({ ...DAZE, sink: 28, a3: 18, hd: -10, stars: false, face: 'tired' })],
      [0.58, P({ ...DAZE, stars: false, tongue: 0.3, jaw: 8, face: 'tired' }), 'in'],
      [0.9, P({ ...DAZE, stars: false, jaw: 6, tongue: 0, face: 'tired' })],
      [1, P({ ...DAZE, stars: false, jaw: 3, tongue: 0, hd: -4, face: 'freed' })],
    ]);
    p.crack = clamp((k - 0.4) / 0.45, 0, 1);
    p.shatter = clamp((k - 0.88) / 0.12, 0, 1);
    if (p.shatter > 0.15) { p.free = true; p.face = 'freed'; }
    return p;
  },
  // freed: risen calmly, head tipped kindly towards the children, sleepy grateful smile (talk with o.talk)
  freed(t) {
    const b = Math.sin(t * 1.1);
    const p = P({ free: true, sink: 54, a0: -78, a1: -104, a2: -82, a3: -14 + 3 * b, hd: 18 + 3 * Math.sin(t * 1.1 - 1), jaw: 2,
      sw: 1.5, arm: 84 + 4 * b, armE: 46, face: 'freed' });
    p.blink = (t % 3.2) > 3.05;
    return p;
  },
  // intro (t from 0): dips with his jaws shut, then snaps up to full height and roars, head shaking
  roar(t) {
    if (t < 0.35) {
      const u = t / 0.35;
      return P({ sink: 10 + 10 * u, a0: -60, a1: -130, a2: -112, a3: -60, hd: 20 + 14 * u, jaw: 0, arm: 60, grip: 0.6, face: 'mean' });
    }
    const v = clamp((t - 0.35) / 0.15, 0, 1), e = 1 - (1 - v) * (1 - v), sh = Math.sin(t * 44) * 3 * v;
    return P({ sink: lerp(20, -8, e), a0: -72, a1: -128, a2: -114, a3: -96, hd: lerp(34, -46, e) + sh, jaw: 40 * e + sh * 0.5,
      arm: -30 + 6 * Math.sin(t * 3), armE: 30, grip: 0, sw: 1, face: 'roar' });
  },
};
export { mix };

// ---------------------------------------------------------------- spine solve (shared by draw + measurements)
const SX = new Float64Array(N + 1), SY = new Float64Array(N + 1), SA = new Float64Array(N + 1), SW = new Float64Array(N + 1);
const GA = new Float64Array(N);
let HX = 0, HY = 0, HA = 0, T = 0;
function ctrl(p, u) {
  const s = u * 3, i = Math.min(2, Math.floor(s)), f = s - i;
  const A = i === 0 ? p.a0 : i === 1 ? p.a1 : p.a2, B = i === 0 ? p.a1 : i === 1 ? p.a2 : p.a3;
  return A + (B - A) * f;
}
function angAvg(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d / 2; }
function solve(p, mem) {
  const L = SEG * p.len;
  let x = p.x, y = p.sink;
  SX[0] = x; SY[0] = y;
  for (let j = 0; j < N; j++) {
    const u = (j + 0.5) / N;
    let a = ctrl(p, u) + p.sw * Math.sin(T * 1.25 + p.sp - u * 2.4) * (0.2 + u);
    a = follow(mem, KA[j], a, lerp(0.5, 0.26, u), 0.64);
    x += Math.cos(a * DEG) * L; y += Math.sin(a * DEG) * L;
    // outside the pool he lies ON the floor rather than sinking through it
    const hw = halfW((j + 1) / N);
    if (Math.abs(x) > POOL.rx - 8 && y > -hw + 3) y = -hw + 3;
    SX[j + 1] = x; SY[j + 1] = y;
  }
  for (let j = 0; j < N; j++) GA[j] = Math.atan2(SY[j + 1] - SY[j], SX[j + 1] - SX[j]);
  for (let i = 0; i <= N; i++) {
    SA[i] = i === 0 ? GA[0] : i === N ? GA[N - 1] : angAvg(GA[i - 1], GA[i]);
    const u = i / N;
    SW[i] = halfW(u) * p.fat * (1 + 0.16 * p.swell * Math.sin(Math.PI * clamp((u - 0.05) / 0.7, 0, 1)));
  }
  HX = SX[N]; HY = SY[N];
  HA = follow(mem, 'mwhd', p.hd, 0.36, 0.62) * DEG;
}
// fractional spine sample -> (QX, QY, QA, QW)
let QX = 0, QY = 0, QA = 0, QW = 0;
function sample(t) {
  t = clamp(t, 0, N);
  const i = Math.min(N - 1, Math.floor(t)), f = t - i;
  QX = lerp(SX[i], SX[i + 1], f); QY = lerp(SY[i], SY[i + 1], f);
  let d = SA[i + 1] - SA[i]; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
  QA = SA[i] + d * f;
  QW = lerp(SW[i], SW[i + 1], f);
}
// head frame -> local
let PX = 0, PY = 0;
function headLocal(hx, hy) {
  const c = Math.cos(HA), s = Math.sin(HA);
  PX = HX + (hx * c - hy * s) * HS; PY = HY + (hx * s + hy * c) * HS;
}
function rotAbout(x, y, cx, cy, a) { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; }
const HINGE = [8, 2];

/** Mouth for any pose: [x, y, angle] (local px, facing right, scale 1; angle in radians, canvas convention, the
 *  direction the fire stream leaves along — mirror it as PI - angle when facing left). */
export function mouthOf(p) {
  T = 0; solve(p, null);
  const ja = p.jaw * DEG;
  const [mx, my] = rotAbout(132, -4, HINGE[0], HINGE[1], ja * 0.5);
  headLocal(mx, my);
  return [Math.round(PX), Math.round(PY), +(HA + ja * 0.5).toFixed(3)];
}
/** Front of the lower jaw (the bite point) for any pose. */
export function biteOf(p) {
  T = 0; solve(p, null);
  const [bx, by] = rotAbout(144, -4, HINGE[0], HINGE[1], p.jaw * DEG);
  headLocal(bx, by);
  return [Math.round(PX), Math.round(PY)];
}
/** Head hurt circle for any pose: { x, y, r } (local px, facing right, scale 1): the skull + jaw, not the horns. */
export function headOf(p) {
  T = 0; solve(p, null);
  headLocal(62, -10);
  return { x: Math.round(PX), y: Math.round(PY), r: 50 };
}
/** Spine points for body hitboxes: [[x, y, halfWidth], ...] from the lava surface to the head joint. */
export function spineOf(p) {
  T = 0; solve(p, null);
  const out = [];
  for (let i = 0; i <= N; i++) out.push([Math.round(SX[i]), Math.round(SY[i]), Math.round(SW[i])]);
  return out;
}
export const BREATH_K = 0.1, BITE_K = 0.35, SLAM_K = 0.4;
/** Frame counts the poses are keyed for (60 fps).  idle / freed / roar take t; submerged is static. */
export const FRAMES = { emerge: 40, breathWind: 36, breath: 70, biteWind: 24, bite: 30, slamWind: 30, slam: 34, dive: 30, hurt: 20, stagger: 40, defeated: 100 };
/** Mouth (fire stream origin) + angle at the start of the breath sweep (breath(BREATH_K)). */
export const MOUTH = mouthOf(ANIM.breath(BREATH_K));
export const BREATH_MOUTH = MOUTH;
/** The bite at contact (bite(BITE_K)): jaw tip and its reach in front of the pool centre. */
export const BITE = biteOf(ANIM.bite(BITE_K));
export const BITE_REACH = BITE[0];
/** Box covered by the body + head at the slam contact (slam(SLAM_K)), local px. */
export const SLAM_BOX = (() => {
  const s = spineOf(ANIM.slam(SLAM_K)), b = biteOf(ANIM.slam(SLAM_K));
  let x0 = 1e9, x1 = -1e9, y0 = 1e9;
  for (const [x, y, w] of s) { if (x > POOL.rx * 0.5) { x0 = Math.min(x0, x - w); y0 = Math.min(y0, y - w); } x1 = Math.max(x1, x + w); }
  return { x0: Math.round(Math.max(x0, POOL.rx * 0.6)), x1: Math.max(Math.round(x1), b[0]), y0: Math.round(y0), y1: 0 };
})();

// ---------------------------------------------------------------- drawing helpers
function rim(ctx, path, lw, s = 2) {
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
// molten crack: translucent halo + hot core (no blur)
function molten(c, path, w, a = 1) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); path(c);
  c.globalAlpha = 0.45 * a; c.strokeStyle = C.mol; c.lineWidth = w * 2.6; c.stroke();
  c.globalAlpha = 1; c.strokeStyle = C.molH; c.lineWidth = w; c.stroke();
}
// the Dragon King's green: translucent halo + bright core
function greenLine(c, w) {
  c.globalAlpha = 0.34; c.strokeStyle = C.glow; c.lineWidth = w * 2.9; c.stroke(); c.globalAlpha = 1;
  c.strokeStyle = C.gem; c.lineWidth = w; c.stroke();
}

let CUR = true;
/**
 * Draw Magmaw.  ctx is at the centre of his lava pool on the floor (screen), unscaled.  The engine draws the
 * pool itself (drawPool) under everything first.
 * o: { facing: 1 | -1, t: seconds, scale, mem, vel, talk, cursed: true }
 */
export function draw(ctx, pose, o = {}) {
  const p = pose, f = o.facing || 1, S = o.scale || 1;
  T = o.t || 0; C = PAL(o.variant);
  CUR = (o.cursed ?? true) && !p.free;
  ctx.save();
  ctx.scale(f * S, S);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (!p.vis) { submerged(ctx, p); ctx.restore(); return; }
  const mem = o.mem;
  let jaw = p.jaw;
  if (o.talk) jaw += 3 + 11 * Math.abs(Math.sin(T * 9)) * (0.6 + 0.4 * Math.sin(T * 2.3));
  solve(p, mem);
  const crossings = surfaceCrossings();
  if (p.fins > 0) fins(ctx, p.fins, p.x);
  if (p.dome > 0.01) dome(ctx, p.dome);
  for (let i = 0; i < crossings; i++) ring(ctx, CRX[i], CRW[i], true);
  const hmp = p.hump > 0.05 ? humpSolve(p) : 0;
  if (hmp) ring(ctx, HUX[0], 16, true);
  // everything below the lava surface is clipped away (the crusted rim stays visible for the claws)
  ctx.save();
  ctx.beginPath();
  ctx.rect(-4000, -4000, 8000, 8000);
  hiddenPath(ctx);
  ctx.clip('evenodd');
  if (hmp) hump(ctx);
  arm(ctx, p, true);
  whisker(ctx, p, mem, true);
  bodyTube(ctx, p);
  plates(ctx, p);
  arm(ctx, p, false);
  if (CUR && p.shatter <= 0) collar(ctx, p);
  ctx.save();
  ctx.translate(HX, HY); ctx.rotate(HA); ctx.scale(HS, HS);
  head(ctx, p, jaw);
  ctx.restore();
  whisker(ctx, p, mem, false);
  ctx.restore();
  for (let i = 0; i < crossings; i++) ring(ctx, CRX[i], CRW[i], false);
  if (hmp) ring(ctx, HUX[0], 16, false);
  if (p.dust > 0 && p.dust < 1) impact(ctx, p);
  drips(ctx, p);
  if (p.splash > 0 && p.splash < 1 && p.spA > 0) splash(ctx, p);
  if (p.smear > 0.01) smear(ctx, p, jaw);
  if (p.shatter > 0 && p.shatter < 1) shards(ctx, p);
  nostrilSmoke(ctx, p);
  if (p.stars) stars(ctx);
  ctx.restore();
}
/**
 * The rig's effects without the body, for a sprite (3D) Magmaw (./magmaw3d.js draws the sprite between the layers):
 * layer 'back' (dorsal fins, the lava dome, the back halves of the surface rings) goes under the body, 'front' (the
 * front ring halves, slam dust, drips, splash, bite smear, collar shards, nostril smoke, stars) over it.  rings:
 * [[x, halfExtent], ...] where the drawn body pierces the lava (default: this rig's own solve).  Same ctx / o as draw().
 */
export function drawFx(ctx, pose, o = {}, layer = 'front', rings = null) {
  const p = pose, f = o.facing || 1, S = o.scale || 1;
  if (!p || !p.vis) return;
  T = o.t || 0; C = PAL(o.variant);
  CUR = (o.cursed ?? true) && !p.free;
  ctx.save();
  ctx.scale(f * S, S);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  let jaw = p.jaw;
  if (o.talk) jaw += 3 + 11 * Math.abs(Math.sin(T * 9)) * (0.6 + 0.4 * Math.sin(T * 2.3));
  solve(p, null);
  let n = surfaceCrossings();
  if (rings) { n = Math.min(4, rings.length); for (let i = 0; i < n; i++) { CRX[i] = rings[i][0]; CRW[i] = rings[i][1]; } }
  const hmp = p.hump > 0.05 ? humpSolve(p) : 0;
  if (layer === 'back') {
    if (p.fins > 0) fins(ctx, p.fins, p.x);
    if (p.dome > 0.01) dome(ctx, p.dome);
    for (let i = 0; i < n; i++) ring(ctx, CRX[i], CRW[i], true);
    if (hmp) ring(ctx, HUX[0], 16, true);
  } else {
    for (let i = 0; i < n; i++) ring(ctx, CRX[i], CRW[i], false);
    if (hmp) ring(ctx, HUX[0], 16, false);
    if (p.dust > 0 && p.dust < 1) impact(ctx, p);
    drips(ctx, p);
    if (p.splash > 0 && p.splash < 1 && p.spA > 0) splash(ctx, p);
    if (p.smear > 0.01) smear(ctx, p, jaw);
    if (p.shatter > 0 && p.shatter < 1) shards(ctx, p);
    nostrilSmoke(ctx, p);
    if (p.stars) stars(ctx);
  }
  ctx.restore();
}
// the lava's interior below its surface: the lower half of the pool ellipse, plus a column under it
function hiddenPath(c) {
  const rx = POOL.rx, ry = POOL.ry + 1, a1 = Math.acos(0.8);
  c.moveTo(rx, -1);
  c.ellipse(0, -1, rx, ry, 0, 0, a1);
  c.lineTo(rx * 0.8, 3000); c.lineTo(-rx * 0.8, 3000);
  c.ellipse(0, -1, rx, ry, 0, Math.PI - a1, Math.PI);
  c.closePath();
}
// a coil of his body arching out of the lava behind him (sells the length hidden below)
const HN2 = 8;
const HUX = new Float64Array(HN2 + 1), HUY = new Float64Array(HN2 + 1), HUA = new Float64Array(HN2 + 1);
const HOX = new Float64Array(HN2 + 1), HOY = new Float64Array(HN2 + 1), HIX = new Float64Array(HN2 + 1), HIY = new Float64Array(HN2 + 1);
function humpSolve(p) {
  const H = 46 * clamp(p.hump, 0, 1.3) + 2 * Math.sin(T * 2.1), R = 19, cx = p.x - 40 + 1.5 * Math.sin(T * 1.3);
  for (let i = 0; i <= HN2; i++) {
    const th = Math.PI - (i / HN2) * Math.PI;
    HUX[i] = cx + R * Math.cos(th); HUY[i] = 8 - (H + 8) * Math.sin(th);
  }
  for (let i = 0; i <= HN2; i++) {
    const a = Math.atan2(HUY[Math.min(HN2, i + 1)] - HUY[Math.max(0, i - 1)], HUX[Math.min(HN2, i + 1)] - HUX[Math.max(0, i - 1)]);
    HUA[i] = a;
    const nx = -Math.sin(a), ny = Math.cos(a), w = 16;
    HIX[i] = HUX[i] + nx * w; HIY[i] = HUY[i] + ny * w; HOX[i] = HUX[i] - nx * w; HOY[i] = HUY[i] - ny * w;
  }
  return 1;
}
function humpPath(c) {
  c.moveTo(HOX[0], 10);
  for (let i = 0; i <= HN2; i++) c.lineTo(HOX[i], HOY[i]);
  c.lineTo(HOX[HN2], 10);
  c.closePath();
}
function hump(ctx) {
  // rock spikes along the outside of the coil, like the back
  cel(ctx, (c) => {
    for (const i of [1, 2.5, 4, 5.5, 7]) {
      const j = Math.round(i), nx = -Math.sin(HUA[j]), ny = Math.cos(HUA[j]), ux = Math.cos(HUA[j]), uy = Math.sin(HUA[j]);
      const bx = HOX[j] + nx * 4, by = HOY[j] + ny * 4, L = j === 4 ? 22 : 17;
      c.moveTo(bx - ux * 10, by - uy * 10); c.lineTo(bx - nx * L - ux * 12, by - ny * L - uy * 12); c.lineTo(bx + ux * 9, by + uy * 9); c.closePath();
    }
  }, C.rockF, C.rockFD, { k: 1, lw: 2.6 });
  celR(ctx, humpPath, C.hideF, C.hideFD, { k: 2.4, lw: 3, detail: (c) => {
    c.strokeStyle = C.hideFD; c.lineWidth = 1.5; c.beginPath();
    for (let i = 1; i < HN2; i += 2) { const x = lerp(HOX[i], HUX[i], 0.4), y = lerp(HOY[i], HUY[i], 0.4); c.moveTo(x + 3, y); c.arc(x, y, 3, 0, Math.PI); }
    c.stroke();
    if (HEATG[C.name]) { c.fillStyle = HEATG[C.name]; c.fillRect(-POOL.rx, -64, POOL.rx * 2, 68); }
  } }, 1.8);
}
// dorsal spikes cutting through the surface while he swims below (submerged / start of emerge)
function fins(ctx, f, x0) {
  const sx = (x0 || 0) + Math.sin(T * 0.9) * 18, dir = Math.cos(T * 0.9) >= 0 ? 1 : -1;
  for (let i = 0; i < 3; i++) {
    const x = sx + (i - 1) * 17 * dir, h = (16 - Math.abs(i - 1) * 5) * f, bob = Math.sin(T * 3 + i) * 1.5;
    ctx.beginPath(); ctx.ellipse(x, -1, 9, 3, 0, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = C.molC; ctx.stroke();
    cel(ctx, (c) => { c.moveTo(x - 7, 0); c.lineTo(x - dir * 4, -h + bob); c.quadraticCurveTo(x + dir * 2, -h * 0.4, x + 7, 0); c.closePath(); },
      C.rock, C.rockD, { k: 1, hi: C.rockH, hk: 0.4, lw: 2.4 });
  }
}
// slam impact (engine: shake the screen at SLAM_K): a hot shockwave line along the floor under the whole body,
// rings where the head lands, a row of dust puffs and cracks in the floor
function impact(ctx, p) {
  const u = p.dust;
  ctx.save();
  let x0 = 1e9, x1 = -1e9;
  for (let i = 0; i <= N; i++) if (SX[i] > POOL.rx - 4) { x0 = Math.min(x0, SX[i]); x1 = Math.max(x1, SX[i]); }
  if (x1 > x0 && u < 0.5) {
    const v = u / 0.5;
    ctx.globalAlpha = 1 - v;
    ctx.fillStyle = C.molC; ctx.beginPath(); ellipse(ctx, (x0 + x1) / 2, -1, (x1 - x0) / 2 + 20 + 50 * v, 5 * (1 - v) + 1.5); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = C.molH; ctx.beginPath(); ellipse(ctx, x1 + 10, -2, 20 + 70 * v, 6 + 16 * v); ctx.stroke();
  }
  for (let i = 3; i <= N; i += 2) {
    if (SX[i] < POOL.rx + 6) continue;
    for (const s of [-1, 1]) {
      const x = SX[i] + s * (10 + 34 * u), y = -6 - 22 * u + (i % 4) * 2, r = (9 + 15 * u) * (i % 4 ? 1 : 0.8);
      ctx.globalAlpha = (1 - u) * 0.9;
      flat(ctx, (c) => circle(c, x, y, r), '#a08a7e', 1.6);
      ctx.fillStyle = '#cdbdae'; ctx.beginPath(); circle(ctx, x - r * 0.3, y - r * 0.35, r * 0.45); ctx.fill();
    }
  }
  ctx.globalAlpha = 1 - u;
  ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.beginPath();
  for (let i = 5; i <= N; i += 2) {
    const x = SX[i];
    if (x < POOL.rx + 10) continue;
    ctx.moveTo(x - 16, 1); ctx.lineTo(x - 5, 7); ctx.lineTo(x + 3, 3); ctx.lineTo(x + 17, 10);
    ctx.moveTo(x - 5, 7); ctx.lineTo(x - 8, 13);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// -------------------------------------------------- where the body pierces the lava surface
const CRX = new Float64Array(4), CRW = new Float64Array(4);
function surfaceCrossings() {
  let n = 0;
  for (let i = 0; i < N && n < 4; i++) {
    const y0 = SY[i] + 1, y1 = SY[i + 1] + 1;
    if ((y0 > 0) !== (y1 > 0)) {
      const f = y0 / (y0 - y1), x = lerp(SX[i], SX[i + 1], f);
      if (Math.abs(x) < POOL.rx - 10) {
        // horizontal extent of the body cut by the surface
        const a = Math.abs(Math.sin(GA[i])) || 0.2;
        CRX[n] = x; CRW[n] = Math.min(70, lerp(SW[i], SW[i + 1], f) / a); n++;
      }
    }
  }
  return n;
}
// lava pushed up around the body where it enters the pool (back half behind, front half over the body)
function ring(ctx, x, w, back) {
  const rx = w + 9 + 2 * Math.sin(T * 5), ry = 7.5;
  const a0 = back ? Math.PI : 0, a1 = back ? TAU : Math.PI;
  ctx.beginPath(); ctx.ellipse(x, -2, rx, ry, 0, a0, a1);
  if (back) { ctx.lineWidth = 5; ctx.strokeStyle = C.molD; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = C.molH; ctx.stroke(); return; }
  ctx.ellipse(x, -3, rx - 7, ry - 4, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fillStyle = C.mol; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C.molL; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, -1.5, rx - 3.5, ry - 2.6, 0, 0.35, Math.PI - 0.35);
  ctx.lineWidth = 2.2; ctx.strokeStyle = C.molC; ctx.stroke();
}

// -------------------------------------------------- body tube (local space)
const BX = new Float64Array(N + 1), BY = new Float64Array(N + 1), KX = new Float64Array(N + 1), KY = new Float64Array(N + 1);
function edges() {
  for (let i = 0; i <= N; i++) {
    const nx = -Math.sin(SA[i]), ny = Math.cos(SA[i]), w = SW[i];
    BX[i] = SX[i] + nx * w; BY[i] = SY[i] + ny * w; KX[i] = SX[i] - nx * w; KY[i] = SY[i] - ny * w;
  }
}
function tubePath(c) {
  c.moveTo(BX[0], BY[0]);
  for (let i = 1; i < N; i++) c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[i + 1]) / 2, (BY[i] + BY[i + 1]) / 2);
  c.lineTo(BX[N], BY[N]);
  c.quadraticCurveTo(SX[N] + Math.cos(SA[N]) * 14, SY[N] + Math.sin(SA[N]) * 14, KX[N], KY[N]);
  for (let i = N - 1; i > 0; i--) c.quadraticCurveTo(KX[i], KY[i], (KX[i] + KX[i - 1]) / 2, (KY[i] + KY[i - 1]) / 2);
  c.lineTo(KX[0], KY[0]);
  c.closePath();
}
const HEATG = {};   // (the heat haze gradient, per palette)
function bodyTube(ctx, p) {
  edges();
  const hot = clamp(p.glow, 0, 1);
  celR(ctx, tubePath, C.hide, C.hideD, { k: 4.5, hi: C.hideH, hk: 0.25, lw: 3.4, detail: (c) => {
    // ember glow along the back edge: it shows in the gaps between the rock plates
    c.beginPath();
    for (let i = 0; i <= N; i++) { const nx = -Math.sin(SA[i]), ny = Math.cos(SA[i]), w = SW[i] * 0.8; i ? c.lineTo(SX[i] - nx * w, SY[i] - ny * w) : c.moveTo(SX[i] - nx * w, SY[i] - ny * w); }
    c.globalAlpha = 0.7; c.strokeStyle = C.molD; c.lineWidth = 9; c.stroke(); c.globalAlpha = 1;
    c.strokeStyle = C.mol; c.lineWidth = 3; c.stroke();
    // molten underside: a band of glowing belly scutes
    c.fillStyle = C.mol; c.beginPath();
    for (let i = 0; i <= N; i++) { i ? c.lineTo(BX[i], BY[i]) : c.moveTo(BX[i], BY[i]); }
    c.lineTo(BX[N] + Math.cos(SA[N]) * 20, BY[N] + Math.sin(SA[N]) * 20);
    for (let i = N; i >= 0; i--) { const nx = -Math.sin(SA[i]), ny = Math.cos(SA[i]), w = SW[i] * 0.18; c.lineTo(SX[i] + nx * w, SY[i] + ny * w); }
    c.closePath(); c.fill();
    c.beginPath();
    for (let i = 0; i <= N; i++) { const nx = -Math.sin(SA[i]), ny = Math.cos(SA[i]), w = SW[i] * 0.62; i ? c.lineTo(SX[i] + nx * w, SY[i] + ny * w) : c.moveTo(SX[i] + nx * w, SY[i] + ny * w); }
    c.strokeStyle = C.molH; c.lineWidth = 6 + hot * 3; c.stroke();
    if (hot > 0.05) {   // fire climbing the belly from the lava up into the throat
      const top = hot * N;
      c.beginPath();
      for (let i = 0; i <= N && i <= top + 1; i++) {
        const t = Math.min(i, top), nx = -Math.sin(SA[Math.floor(t)]), ny = Math.cos(SA[Math.floor(t)]);
        sample(t); const w = QW * 0.6;
        i ? c.lineTo(QX + nx * w, QY + ny * w) : c.moveTo(QX + nx * w, QY + ny * w);
      }
      c.strokeStyle = C.molC; c.lineWidth = 7 + hot * 6 * (0.85 + 0.15 * Math.sin(T * 14)); c.stroke();
    }
    // scute ridges across the band + the crusty edge where hide meets belly
    c.strokeStyle = C.molD; c.lineWidth = 2; c.beginPath();
    for (let t = 0.5; t < N; t += 0.62) {
      sample(t);
      const nx = -Math.sin(QA), ny = Math.cos(QA), ux = Math.cos(QA), uy = Math.sin(QA);
      c.moveTo(QX + nx * QW * 0.22, QY + ny * QW * 0.22); c.quadraticCurveTo(QX + nx * QW * 0.6 - ux * 3, QY + ny * QW * 0.6 - uy * 3, QX + nx * QW * 1.05, QY + ny * QW * 1.05);
    }
    c.stroke();
    c.strokeStyle = C.hideD; c.lineWidth = 2.4; c.beginPath();
    for (let i = 0; i <= N; i++) { const nx = -Math.sin(SA[i]), ny = Math.cos(SA[i]), w = SW[i] * (0.18 + (i % 2) * 0.05); i ? c.lineTo(SX[i] + nx * w, SY[i] + ny * w) : c.moveTo(SX[i] + nx * w, SY[i] + ny * w); }
    c.stroke();
    // hide texture: little scale arcs on the flank
    c.strokeStyle = C.hideL; c.lineWidth = 1.5; c.beginPath();
    for (let t = 1; t < N - 0.5; t += 0.9) {
      sample(t);
      const nx = -Math.sin(QA), ny = Math.cos(QA);
      for (const k of [-0.45, -0.05]) { const x = QX + nx * QW * k, y = QY + ny * QW * k; c.moveTo(x + 3.2 * Math.cos(QA + 0.5), y + 3.2 * Math.sin(QA + 0.5)); c.arc(x, y, 3.2, QA + 0.5, QA + 2.6); }
    }
    c.stroke();
    // heat where the body leaves the lava (only over the pool)
    if (!HEATG[C.name]) { const hg = (HEATG[C.name] = c.createLinearGradient(0, -64, 0, 0)); hg.addColorStop(0, C.heat[0]); hg.addColorStop(0.55, C.heat[1]); hg.addColorStop(1, C.heat[2]); }
    c.fillStyle = HEATG[C.name]; c.fillRect(-POOL.rx, -64, POOL.rx * 2, 68);
  } }, 2.2);
}

// -------------------------------------------------- rock plates + dorsal spikes down the back
function platePath(c) {
  for (let j = 2; j < N; j++) {
    // where the back is the inside of a bend the plates would fan into each other: shrink them there
    let d = GA[Math.min(N - 1, j)] - GA[j - 1]; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    const bend = clamp(1 + d / DEG / 22, 0.15, 1);
    if (bend < 0.3) continue;
    const u = j / N, big = (j % 2 ? 1 : 0.78) * bend, th = lerp(13, 7, u) * big, sp = lerp(24, 9, u) * big;
    sample(j - 0.7); const ax = QX, ay = QY, aa = QA, aw = QW;
    sample(j + 0.45); const bx = QX, by = QY, ba = QA, bw = QW;
    sample(j - 0.3); const mx = QX, my = QY, ma = QA, mw = QW;
    sample(j - 0.05); const cx = QX, cy = QY, ca = QA, cw = QW;
    const anx = -Math.sin(aa), any = Math.cos(aa), bnx = -Math.sin(ba), bny = Math.cos(ba);
    const mnx = -Math.sin(ma), mny = Math.cos(ma), cnx = -Math.sin(ca), cny = Math.cos(ca);
    // inner edge buried in the body; a rounded shoulder; a spike swept back towards the tail; down the far side
    c.moveTo(ax - anx * (aw - 8), ay - any * (aw - 8));
    c.quadraticCurveTo(ax - anx * (aw + th), ay - any * (aw + th), mx - mnx * (mw + th), my - mny * (mw + th));
    c.lineTo(cx - cnx * (cw + th + sp) - Math.cos(ca) * 14, cy - cny * (cw + th + sp) - Math.sin(ca) * 14);
    c.lineTo(cx - cnx * (cw + th * 0.9) + Math.cos(ca) * 4, cy - cny * (cw + th * 0.9) + Math.sin(ca) * 4);
    c.quadraticCurveTo(bx - bnx * (bw + th * 0.5), by - bny * (bw + th * 0.5), bx - bnx * (bw - 9), by - bny * (bw - 9));
    if (!PL_OPEN) c.closePath();
  }
}
let PL_OPEN = false;
function plateOutline(c) { PL_OPEN = true; platePath(c); PL_OPEN = false; }
function plates(ctx, p) {
  cel(ctx, platePath, C.rock, C.plateD, { k: 1.1, hi: C.rockH, hk: 0.35, lw: 0, detail: (c) => {
    c.strokeStyle = C.rockL; c.lineWidth = 1.6; c.beginPath();
    for (let j = 2; j < N; j++) {
      sample(j); const nx = -Math.sin(QA), ny = Math.cos(QA), w = QW + 2;
      c.moveTo(QX - nx * w - Math.cos(QA) * 4, QY - ny * w - Math.sin(QA) * 4); c.lineTo(QX - nx * (w + 5), QY - ny * (w + 5));
    }
    c.stroke();
  } });
  // rim light inside the plates, then ink only on their exposed edges
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c, k = Math.sqrt(Math.abs(det)), sx = -0.8 * 1.8 * k, sy = 0.6 * 1.8 * k;
  ctx.save();
  ctx.beginPath(); platePath(ctx); ctx.clip();
  ctx.translate((m.d * sx - m.c * sy) / det, (-m.b * sx + m.a * sy) / det);
  ctx.beginPath(); plateOutline(ctx); ctx.lineWidth = 4.4; ctx.strokeStyle = C.rim; ctx.stroke();
  ctx.restore();
  ink(ctx, plateOutline, 3);
  if (p.spk > 0.02) {   // slam wind-up: the back spikes heat up red-hot
    const g = clamp(p.spk, 0, 1) * (0.85 + 0.15 * Math.sin(T * 16));
    ctx.globalAlpha = g; ctx.fillStyle = C.molD; ctx.beginPath(); platePath(ctx); ctx.fill();
    ctx.fillStyle = C.mol; ctx.save(); ctx.beginPath(); platePath(ctx); ctx.clip(); ctx.translate(-1.5, 2); ctx.beginPath(); platePath(ctx); ctx.fill(); ctx.restore();
    ctx.globalAlpha = 0.9 * g; ctx.strokeStyle = C.molH; ctx.lineWidth = 2; ctx.beginPath(); plateOutline(ctx); ctx.stroke();
    ctx.globalAlpha = 1;
    ink(ctx, plateOutline, 1.4);
  }
}

// -------------------------------------------------- forelimbs: short flippers with a spined fin and three claws
function arm(ctx, p, far) {
  sample(ARM_AT + (far ? 0.5 : 0));
  const nx = -Math.sin(QA), ny = Math.cos(QA);
  // shoulder low on the flank towards the belly (near) / peeking past the belly (far)
  const sx = QX + nx * QW * (far ? 0.85 : 0.55) - (far ? 4 : 0), sy = QY + ny * QW * (far ? 0.85 : 0.55) - (far ? 6 : 0);
  const base = Math.atan2(ny, nx);
  let ua = base + (p.arm + (far ? -16 : 0)) * DEG, fa = ua - p.armE * DEG;
  const U = 27, F = 24;
  let ex = sx + Math.cos(ua) * U, ey = sy + Math.sin(ua) * U, hx = ex + Math.cos(fa) * F, hy = ey + Math.sin(fa) * F;
  const g = clamp(p.grip, 0, 1);
  if (g > 0.01) {
    // claws hooked over the pool's crusted rim (near: the right edge, far: the back rim), 2-bone IK, elbow up
    const tx = lerp(hx, far ? POOL.rx - 10 : POOL.rx + 3, g), ty = lerp(hy, far ? -POOL.ry + 2 : 0, g);
    const dx0 = tx - sx, dy0 = ty - sy, d = clamp(Math.hypot(dx0, dy0), 10, U + F - 0.5);
    const b = Math.atan2(dy0, dx0), A = Math.acos(clamp((U * U + d * d - F * F) / (2 * U * d), -1, 1));
    const e1 = b - A, e2 = b + A;
    ua = Math.sin(e1) < Math.sin(e2) ? e1 : e2;
    ex = sx + Math.cos(ua) * U; ey = sy + Math.sin(ua) * U;
    fa = Math.atan2(sy + Math.sin(b) * d - ey, sx + Math.cos(b) * d - ex);
    hx = ex + Math.cos(fa) * F; hy = ey + Math.sin(fa) * F;
  }
  const hc = far ? C.hideF : C.hide, hd = far ? C.hideFD : C.hideD;
  // the fin hangs off the arm's lower edge: three spines fanned back towards the body, scalloped membrane
  let px = -Math.sin(fa), py = Math.cos(fa);
  if (py < 0) { px = -px; py = -py; }
  const dx = Math.cos(fa), dy = Math.sin(fa), wv = Math.sin(T * 3.2 + (far ? 1.2 : 0)) * 2.5;
  const tip = (i) => { const [t, l, b] = FINSP[i], w = wv * (0.5 + t * 0.6); return [ex + dx * F * t + px * l + dx * b + w * dx, ey + dy * F * t + py * l + dy * b + w * dy]; };
  const finPath = (c) => {
    c.moveTo(ex - dx * 5, ey - dy * 5);
    let [x0, y0] = tip(0); c.lineTo(x0, y0);
    for (let i = 1; i < 3; i++) {
      const [x1, y1] = tip(i), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      c.quadraticCurveTo(lerp(mx, ex + dx * F * (FINSP[i][0] - 0.25), 0.45), lerp(my, ey + dy * F * (FINSP[i][0] - 0.25), 0.45), x1, y1);
      x0 = x1; y0 = y1;
    }
    c.lineTo(hx, hy); c.closePath();
  };
  const spines = (c) => { for (let i = 0; i < 3; i++) { const [x, y] = tip(i), t = FINSP[i][0]; c.moveTo(ex + dx * F * t, ey + dy * F * t); c.lineTo(x, y); } };
  cel(ctx, finPath, far ? C.molL : C.molD, far ? C.finFarD : C.molL, { k: 1.1, lw: 2.4, detail: (c) => molten(c, spines, 1.2, far ? 0.5 : 0.9) });
  ink(ctx, spines, 2.4);
  // one smooth limb from the shoulder through the elbow to the wrist (no segment seams)
  const n1x = -Math.sin(ua), n1y = Math.cos(ua), n2x = -Math.sin(fa), n2y = Math.cos(fa);
  let mx = n1x + n2x, my = n1y + n2y; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
  const W0 = 12, W1 = 9.5, W2 = 7;
  const limbPath = (c) => {
    c.moveTo(sx + n1x * W0, sy + n1y * W0);
    c.quadraticCurveTo(ex + mx * W1 * 1.15, ey + my * W1 * 1.15, hx + n2x * W2, hy + n2y * W2);
    c.quadraticCurveTo(hx + Math.cos(fa) * W2 * 1.4, hy + Math.sin(fa) * W2 * 1.4, hx - n2x * W2, hy - n2y * W2);
    c.quadraticCurveTo(ex - mx * W1 * 1.15, ey - my * W1 * 1.15, sx - n1x * W0, sy - n1y * W0);
    c.quadraticCurveTo(sx - Math.cos(ua) * W0 * 1.3, sy - Math.sin(ua) * W0 * 1.3, sx + n1x * W0, sy + n1y * W0);
    c.closePath();
  };
  (far ? cel : celR)(ctx, limbPath, hc, hd, { k: 1.8, hi: far ? null : C.hideH, hk: 0.3, lw: 2.8, detail: (c) => {
    c.strokeStyle = far ? C.hideFD : C.hideL; c.lineWidth = 1.4; c.beginPath();
    c.moveTo(ex + mx * 4 - Math.cos(ua) * 4, ey + my * 4 - Math.sin(ua) * 4); c.quadraticCurveTo(ex, ey, ex + mx * 4 + Math.cos(fa) * 4, ey + my * 4 + Math.sin(fa) * 4);
    c.stroke();
  } }, 1.4);
  // paw with three fat hooked talons (over the rim when gripping)
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(fa - Math.PI / 2);
  cel(ctx, (c) => {
    for (const a of [-0.55, 0, 0.55]) {
      const cx = Math.sin(-a) * 6, cy = 5, ox = Math.sin(-a);
      c.moveTo(cx - 4, cy); c.quadraticCurveTo(cx + ox * 9 - 1.5, cy + 12, cx + ox * 7 + 5, cy + 17); c.quadraticCurveTo(cx + 2, cy + 9, cx + 4, cy); c.closePath();
    }
  }, far ? C.hornD : C.horn, C.hornD, { k: 0.8, lw: 2.4 });
  cel(ctx, (c) => ellipse(c, 0, 3, 10.5, 8.5), hc, hd, { k: 1.2, lw: 2.6 });
  ctx.restore();
}
const FINSP = [[-0.1, 20, -12], [0.4, 25, -11], [0.9, 18, -7]];

// -------------------------------------------------- whisker-barbels (local space: they hang, trail and sway)
const WN = 6, WSEG = 8.5;
const WX = new Float64Array(WN + 1), WY = new Float64Array(WN + 1), WA = new Float64Array(WN + 1);
function whiskerPath(c) {
  const hw = (i) => lerp(3.6, 1, i / WN);
  for (let i = 0; i <= WN; i++) { const x = WX[i] - Math.sin(WA[i]) * hw(i), y = WY[i] + Math.cos(WA[i]) * hw(i); i ? c.lineTo(x, y) : c.moveTo(x, y); }
  for (let i = WN; i >= 0; i--) c.lineTo(WX[i] + Math.sin(WA[i]) * hw(i), WY[i] - Math.cos(WA[i]) * hw(i));
  c.closePath();
}
function whisker(ctx, p, mem, far) {
  // barbels hang from the corner of the mouth (behind the jaws, so they never cross the open mouth)
  headLocal(far ? 46 : 38, far ? -9 : -4);
  let x = PX, y = PY;
  const lag = follow(mem, far ? 'mwwf' : 'mwwn', HA, 0.1, 0.8) - HA;
  let a = HA + 1.5 - lag * 0.8 + (far ? -0.15 : 0);
  for (let i = 0; i <= WN; i++) {
    if (i) {
      let d = Math.PI / 2 - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      a += clamp(d, -1, 1) * 0.3 - (i > WN - 3 ? 0.32 : 0.04) + 0.12 * Math.sin(T * 2.1 - i * 0.9 + (far ? 1.4 : 0)) * (i / WN) - lag * 0.1;
      x += Math.cos(a) * WSEG; y += Math.sin(a) * WSEG;
    }
    WX[i] = x; WY[i] = y; WA[i] = a;
  }
  flat(ctx, whiskerPath, far ? C.hornD : C.horn, far ? 2 : 2.4);
}

// -------------------------------------------------- head (head frame: origin at the neck joint, +x forward)
const SKULL = [[-26, 4], [-30, -14], [-22, -34], [-6, -46], [16, -52], [38, -50], [58, -44], [76, -38], [98, -34], [116, -30],
  [130, -24], [136, -15], [132, -8], [116, -6], [90, -6], [60, -5], [32, -3], [12, 2], [-8, 8]];
const JAW = [[2, 0], [30, -3], [60, -5], [92, -6], [120, -8], [136, -12], [146, -9], [146, 0], [138, 10], [116, 16], [86, 20],
  [56, 24], [26, 26], [4, 22], [-8, 12]];
const BROW = [[22, -49], [44, -57], [68, -51], [88, -41], [94, -33], [82, -32], [66, -37], [46, -40], [30, -41]];
const FIN = [[-14, -28], [-50, -46], [-42, -30], [-62, -22], [-44, -12], [-56, 2], [-14, -4]];
const skullPath = (c) => blob(c, SKULL, 0.42);
function head(ctx, p, jawDeg) {
  const ja = jawDeg * DEG, lw = 3.3 / HS, face = p.face;
  horn(ctx, 8, -44, true);
  // ear fin (behind the cheek), a slow ripple
  const r = Math.sin(T * 2.4) * 3;
  cel(ctx, (c) => { c.moveTo(FIN[0][0], FIN[0][1]); for (let i = 1; i < FIN.length; i++) c.lineTo(FIN[i][0], FIN[i][1] + (i % 2 ? r : r * 0.5)); c.closePath(); },
    C.mem, C.memD, { k: 1.4, lw: 2.8 / HS, detail: (c) => {
      molten(c, (cc) => { cc.moveTo(-16, -16); cc.lineTo(-44, -36); cc.moveTo(-16, -14); cc.lineTo(-56, -20); cc.moveTo(-16, -10); cc.lineTo(-48, -2); }, 1.3 / HS, 0.7);
    } });
  if (jawDeg > 1.5) mouthInside(ctx, p, ja);
  // lower jaw: rock beard spikes under the chin, molten throat seam, tusks
  ctx.save();
  ctx.translate(HINGE[0], HINGE[1]); ctx.rotate(ja); ctx.translate(-HINGE[0], -HINGE[1]);
  flat(ctx, (c) => {
    for (const [x, y, l] of [[44, 22, 15], [64, 19, 17], [84, 16, 14], [102, 13, 11]]) { c.moveTo(x - 7, y); c.lineTo(x - 9, y + l); c.lineTo(x + 5, y - 1); c.closePath(); }
  }, C.rockF, 2.6 / HS);
  cel(ctx, (c) => blob(c, JAW, 0.42), C.hide, C.hideD, { k: 3.2, lw, detail: (c) => {
    const g = clamp(p.glow, 0, 1);
    c.fillStyle = g > 0.3 ? C.molH : C.mol; c.beginPath(); c.moveTo(-10, 14); c.quadraticCurveTo(60, 14, 136, 4); c.lineTo(150, 30); c.lineTo(-10, 40); c.closePath(); c.fill();
    c.strokeStyle = g > 0.3 ? C.mol : C.molD; c.lineWidth = 2 / HS; c.beginPath();
    for (let x = 16; x < 128; x += 16) { const y = 14 - x * 0.07; c.moveTo(x, y); c.quadraticCurveTo(x + 2, y + 6, x - 1, y + 12); }
    c.stroke();
    c.fillStyle = C.rockF; c.beginPath(); c.moveTo(96, -6); c.lineTo(140, -12); c.lineTo(146, -6); c.lineTo(140, 2); c.lineTo(100, 4); c.closePath(); c.fill();
  } });
  // tusks pushed up in front of the snout (the under-bite; tucked away when he is freed and smiling)
  if (face !== 'freed' && face !== 'tired') flat(ctx, (c) => {
    c.moveTo(127, -7); c.quadraticCurveTo(127, -18, 132, -28); c.quadraticCurveTo(136, -18, 135, -8); c.closePath();
    c.moveTo(138, -9); c.quadraticCurveTo(139, -18, 144, -24); c.quadraticCurveTo(146, -16, 145, -8); c.closePath();
  }, C.tooth, 2.6 / HS);
  if (p.tongue > 0.05) tongue(ctx, p);
  ctx.restore();
  // skull
  celR(ctx, skullPath, C.hide, C.hideD, { k: 3.6, hi: C.hideH, hk: 0.25, lw, detail: (c) => {
    c.strokeStyle = C.hideL; c.lineWidth = 1.6 / HS; c.beginPath();
    for (const [x, y] of [[96, -24], [108, -22], [102, -16], [114, -16], [84, -18]]) { c.moveTo(x + 3, y); c.arc(x, y, 3, 0, Math.PI * 0.9); }
    c.stroke();
    c.fillStyle = C.hideL; c.beginPath(); c.moveTo(14, 0); c.quadraticCurveTo(70, -8, 132, -9); c.lineTo(132, -5); c.quadraticCurveTo(70, -3, 14, 4); c.closePath(); c.fill();
  } }, 2.2 / HS);
  // upper fangs over the jaw (tucked away when he is freed and smiling)
  const kind = face === 'freed' || face === 'tired';
  if (!kind) flat(ctx, (c) => {
    for (const [x, l] of [[44, 9], [70, 11], [94, 10], [114, 8]]) { c.moveTo(x - 4, -6); c.quadraticCurveTo(x - 2, -6 + l * 0.6, x + 1, -6 + l); c.quadraticCurveTo(x + 2, -6 + l * 0.4, x + 4, -6.5); c.closePath(); }
  }, C.tooth, 2.2 / HS);
  // a glowing seam on the cheek
  molten(ctx, (c) => { c.moveTo(-4, -26); c.lineTo(0, -14); c.lineTo(-5, -6); }, 1.4 / HS, 0.8);
  // mouth corner: a snarl, or (freed) a gentle smile curling up into the cheek
  if (kind) {
    // a soft smile: the mouth line curls up into a round cheek
    cel(ctx, (c) => { c.moveTo(26, -10); c.quadraticCurveTo(30, -24, 42, -22); c.quadraticCurveTo(50, -19, 48, -10); c.quadraticCurveTo(38, -6, 26, -10); c.closePath(); },
      C.hide, C.hideD, { k: 1.2, hi: C.hideH, hk: 0.5, lw: 0 });
    ink(ctx, (c) => { c.moveTo(70, -5); c.quadraticCurveTo(46, -3, 37, -12); c.quadraticCurveTo(34, -15, 35, -19); c.moveTo(28, -21); c.quadraticCurveTo(36, -27, 46, -22); }, 3.4 / HS);
  }
  else if (jawDeg < 8) ink(ctx, (c) => { c.moveTo(40, -4); c.quadraticCurveTo(31, -3, 26, 4); }, 3 / HS);
  eye(ctx, p);
  // heavy rock brow over the eye (it lifts when he is freed / roaring)
  const lift = face === 'freed' || face === 'tired' ? -6 : face === 'roar' ? -1.5 : 0;
  ctx.save(); ctx.translate(0, lift);
  if (kind) { ctx.translate(30, -41); ctx.rotate(-0.16); ctx.translate(-30, 41); }
  flat(ctx, (c) => { c.moveTo(30, -46); c.lineTo(16, -66); c.lineTo(44, -54); c.closePath(); }, C.rockF, 2.6 / HS);
  celR(ctx, (c) => blob(c, BROW, 0.4), C.rock, C.rockD, { k: 1.6, hi: C.rockH, hk: 0.35, lw: 3 / HS, detail: (c) => {
    c.strokeStyle = C.rockL; c.lineWidth = 1.5 / HS; c.beginPath(); c.moveTo(40, -50); c.lineTo(50, -44); c.moveTo(62, -48); c.lineTo(68, -42); c.stroke();
  } }, 1.8 / HS);
  ctx.restore();
  // nose horn + nostril
  cel(ctx, (c) => { c.moveTo(94, -33); c.quadraticCurveTo(98, -46, 106, -54); c.quadraticCurveTo(108, -42, 112, -31); c.closePath(); }, C.rock, C.rockD, { k: 1, lw: 2.8 / HS });
  ink(ctx, (c) => { c.moveTo(118, -22); c.quadraticCurveTo(124, -26, 127, -20); }, 3 / HS);
  if (p.glow > 0.05) { ctx.globalAlpha = p.glow; flat(ctx, (c) => ellipse(c, 122.5, -21.5, 3.5, 2), C.molH, 0); ctx.globalAlpha = 1; }
  horn(ctx, -2, -38, false);
}
// long swept-back horn curling down at the tip
const HN = 12, HSEG = 9;
const RX = new Float64Array(HN + 1), RY = new Float64Array(HN + 1), RA = new Float64Array(HN + 1);
const hornW = (i) => lerp(10.5, 2.4, Math.pow(i / HN, 0.9));
function hornPath(c) {
  for (let i = 0; i <= HN; i++) { const px = RX[i] - Math.sin(RA[i]) * hornW(i), py = RY[i] + Math.cos(RA[i]) * hornW(i); i ? c.lineTo(px, py) : c.moveTo(px, py); }
  for (let i = HN; i >= 0; i--) c.lineTo(RX[i] + Math.sin(RA[i]) * hornW(i), RY[i] - Math.cos(RA[i]) * hornW(i));
  c.closePath();
}
// long elder's horn: sweeps up and back off the skull and curls round and down at the tip
function horn(ctx, x0, y0, far) {
  let a = Math.PI + 0.62, x = x0, y = y0;
  for (let i = 0; i <= HN; i++) {
    if (i) { a -= i < 5 ? 0.08 : 0.27; x += Math.cos(a) * HSEG * (1 - i * 0.04); y += Math.sin(a) * HSEG * (1 - i * 0.04); }
    RX[i] = x; RY[i] = y; RA[i] = a;
  }
  (far ? cel : celR)(ctx, hornPath, far ? C.hornD : C.horn, C.hornD, { k: 1.2, lw: 2.9 / HS, detail: (c) => {
    c.strokeStyle = C.hornL; c.lineWidth = 1.5 / HS; c.beginPath();
    for (let i = 1; i < HN; i += 1) { c.moveTo(RX[i] - Math.sin(RA[i]) * hornW(i), RY[i] + Math.cos(RA[i]) * hornW(i)); c.lineTo(RX[i] + Math.sin(RA[i]) * hornW(i) * 0.5, RY[i] - Math.cos(RA[i]) * hornW(i) * 0.5); }
    c.stroke();
  } }, 1.6 / HS);
}
function mouthInside(ctx, p, ja) {
  const [jx, jy] = rotAbout(140, -6, HINGE[0], HINGE[1], ja);
  const fire = p.glow > 0.05;
  const path = (c) => { c.moveTo(HINGE[0] - 6, HINGE[1] - 4); c.lineTo(132, -8); c.quadraticCurveTo(jx + 10, (jy - 8) / 2, jx, jy); c.closePath(); };
  flat(ctx, path, fire ? C.mouthFire : C.mouth, 2.8 / HS);
  ctx.save(); ctx.beginPath(); path(ctx); ctx.clip();
  const my = (jy - 6) / 2 + 2, g = clamp(p.glow, 0, 1), fl = 0.9 + 0.1 * Math.sin(T * 29);
  // molten throat at the back of the mouth
  ctx.fillStyle = C.mol; ctx.beginPath(); ellipse(ctx, 26, my * 0.6, 30, 10 + p.jaw * 0.3, ja * 0.4); ctx.fill();
  ctx.fillStyle = C.molH; ctx.beginPath(); ellipse(ctx, 18, my * 0.55, 16, 5 + p.jaw * 0.15, ja * 0.4); ctx.fill();
  if (fire) {
    // fire welling up from the throat and pouring out of the front of the jaws (the engine draws the stream)
    ctx.fillStyle = C.mol; ctx.beginPath(); ellipse(ctx, 104, my + 2, 40 * g * fl, (4 + p.jaw * 0.3) * g, ja * 0.5); ctx.fill();
    ctx.fillStyle = C.molH; ctx.beginPath(); ellipse(ctx, 116, my + 2, 26 * g * fl, (2.5 + p.jaw * 0.18) * g, ja * 0.5); ctx.fill();
  } else {
    ctx.fillStyle = C.tongue; ctx.beginPath(); ellipse(ctx, 70 + 8 * Math.sin(ja), 4 + 30 * Math.sin(ja), 40, 7, ja * 0.6); ctx.fill();
    ctx.fillStyle = C.tooth; ctx.beginPath();
    for (let x = 58; x < 128; x += 15) {
      const [bx, by] = rotAbout(x, -5, HINGE[0], HINGE[1], ja), c0 = Math.cos(ja), s0 = Math.sin(ja);
      ctx.moveTo(bx, by); ctx.lineTo(bx + 3.5 * c0 + 8 * s0, by + 3.5 * s0 - 8 * c0); ctx.lineTo(bx + 7 * c0, by + 7 * s0);
    }
    ctx.fill();
  }
  ctx.restore();
  if (fire && p.jaw > 8) {   // flames licking out of the jaws
    const mx = 134, mmy = (jy - 8) / 2;
    ctx.save(); ctx.translate(mx, mmy); ctx.rotate(ja * 0.5);
    for (let i = 0; i < 3; i++) {
      const ph = T * 13 + i * 2.1, L = (16 + 14 * g) * (0.75 + 0.25 * Math.sin(ph)), off = (i - 1) * 7 * g;
      flat(ctx, (c) => { c.moveTo(-4, off - 6 * g); c.quadraticCurveTo(L * 0.6, off - 7 * g + Math.sin(ph) * 3, L, off + Math.sin(ph * 1.3) * 3);
        c.quadraticCurveTo(L * 0.5, off + 6 * g, -4, off + 6 * g); c.closePath(); }, i === 1 ? C.molC : C.molH, 0);
    }
    ctx.restore();
  }
}
function tongue(ctx, p) {
  const L = clamp(p.tongue, 0, 1), w = Math.sin(T * 3) * 2;
  flat(ctx, (c) => {
    c.moveTo(108, -2); c.quadraticCurveTo(138 + 4 * L, 0 + w, 146 + 6 * L, 14 + 14 * L + w);
    c.quadraticCurveTo(144 + 6 * L, 26 + 16 * L, 134 + 4 * L, 22 + 10 * L); c.quadraticCurveTo(128, 10, 106, 6); c.closePath();
  }, C.tongue, 2.6 / HS);
  ink(ctx, (c) => { c.moveTo(118, 3); c.quadraticCurveTo(134 + 3 * L, 6 + w * 0.5, 140 + 5 * L, 18 + 12 * L); }, 1.5 / HS, C.tongueD);
}
function eye(ctx, p) {
  const face = p.face, x = 64, y = -27, rx = 12, ry = face === 'freed' || p.free ? 10.5 : 9;
  const lw = 2.8 / HS;
  if (face === 'ouch' || face === 'tired' || (p.blink && face !== 'dazed')) {
    flat(ctx, (c) => ellipse(c, x, y + 1, rx, ry * 0.75), C.hideD, 0);
    if (face === 'ouch') ink(ctx, (c) => { c.moveTo(x - 8, y - 5); c.lineTo(x + 5, y); c.lineTo(x - 8, y + 5); }, 3.4 / HS);
    else ink(ctx, (c) => { c.moveTo(x - 9, y - 1); c.quadraticCurveTo(x, y + 6, x + 9, y - 1); }, 3.2 / HS);
    return;
  }
  if (face === 'dazed') {
    flat(ctx, (c) => ellipse(c, x, y, rx, ry + 1), CUR ? '#d9ffd0' : C.eyeW, lw);
    ink(ctx, (c) => { for (let a = 0; a < 4 * Math.PI; a += 0.35) { const r = 7 * a / (4 * Math.PI), aa = a + T * 5; a ? c.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r * 0.85) : c.moveTo(x, y); } }, 2 / HS);
    return;
  }
  const freed = face === 'freed' || !CUR;
  const wide = face === 'roar';
  // lid: an angry slant (low at the snout), half-closed and calm when freed
  const slant = freed ? -0.12 : wide ? 0.32 : 0.45, drop = freed ? 1.2 : wide ? 1 : 3;
  const ly0 = y - ry + drop - slant * rx * 1.3, ly1 = y - ry + drop + slant * rx * 1.3;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x - rx - 3, ly0); ctx.lineTo(x + rx + 3, ly1); ctx.lineTo(x + rx + 3, y + ry + 4); ctx.lineTo(x - rx - 3, y + ry + 4); ctx.closePath();
  ctx.clip();
  flat(ctx, (c) => ellipse(c, x, y, rx, ry), freed ? C.eyeW : '#d9ffd0', 0);
  ctx.save(); ctx.beginPath(); ellipse(ctx, x, y, rx, ry); ctx.clip();
  if (freed) {
    ctx.fillStyle = C.goldD; ctx.beginPath(); circle(ctx, x + 1.5, y + 0.5, 8); ctx.fill();
    ctx.fillStyle = C.gold; ctx.beginPath(); circle(ctx, x + 1.5, y + 1.4, 6.4); ctx.fill();
    ctx.fillStyle = C.pupil; ctx.beginPath(); circle(ctx, x + 2, y + 1, 3.8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, x - 1.5, y - 2.2, 3); circle(ctx, x + 5, y + 3.4, 1.3); ctx.fill();
  } else {
    const pl = 0.85 + 0.15 * Math.sin(T * 7);
    ctx.fillStyle = C.gemD; ctx.beginPath(); ellipse(ctx, x + 1.5, y + 0.5, rx * 0.88, ry * 0.88); ctx.fill();
    ctx.fillStyle = C.gem; ctx.beginPath(); ellipse(ctx, x + 1.5, y + 0.5, rx * 0.6 * pl, ry * 0.6 * pl); ctx.fill();
    ctx.fillStyle = C.gemC; ctx.beginPath(); ellipse(ctx, x + 1.5, y + 0.5, rx * 0.28 * pl, ry * 0.3 * pl); ctx.fill();
  }
  ctx.restore();
  ink(ctx, (c) => ellipse(c, x, y, rx, ry), lw);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ellipse(ctx, x, y, rx + 1.5, ry + 1.5); ctx.clip();
  ink(ctx, (c) => { c.moveTo(x - rx - 3, ly0); c.lineTo(x + rx + 3, ly1); }, 3 / HS);
  ctx.restore();
  if (face === 'freed') {   // a contented squint: the cheek pushes the lower lid up into a smile curve
    ctx.fillStyle = C.hide; ctx.beginPath(); ctx.moveTo(x - rx - 3, y + ry + 3); ctx.lineTo(x - rx - 2, y + 9.5); ctx.quadraticCurveTo(x, y + 5, x + rx + 2, y + 9.5); ctx.lineTo(x + rx + 3, y + ry + 3); ctx.closePath(); ctx.fill();
    ink(ctx, (c) => { c.moveTo(x - rx + 1.5, y + 9); c.quadraticCurveTo(x, y + 5.5, x + rx - 1.5, y + 9); }, 2.6 / HS);
  }
  // the curse's glow spilling round the eye
  if (!freed) { ctx.globalAlpha = 0.28 + 0.1 * Math.sin(T * 7); ctx.fillStyle = C.glow; ctx.beginPath(); ellipse(ctx, x + 1, y, rx + 7, ry + 5); ctx.fill(); ctx.globalAlpha = 1; }
  if (!freed && p.ef > 0.02) { ctx.globalAlpha = p.ef; twinkle(ctx, x + rx * 0.6, y - ry * 0.6, 4 + 5 * p.ef); ctx.globalAlpha = 1; }
}

// -------------------------------------------------- the cursed collar (across the neck below the head)
function collarFrame(ctx) {
  sample(COLLAR_AT);
  ctx.translate(QX, QY); ctx.rotate(QA + Math.PI / 2);
  return QW;
}
function collar(ctx, p) {
  ctx.save();
  const w = collarFrame(ctx);
  drawCollarShape(ctx, p.crack, w + 5, p.stars);
  ctx.restore();
}
/** The collar on its own (e.g. for the engine to drop pieces): drawCollar(ctx, { scale, crack, t, rot }). */
export function drawCollar(ctx, o = {}) {
  T = o.t ?? T;
  ctx.save();
  ctx.scale(o.scale || 1, o.scale || 1);
  if (o.rot) ctx.rotate(o.rot);
  drawCollarShape(ctx, o.crack ?? 1, 30);
  ctx.restore();
}
// band frame: x across the neck (+x = throat side), y along the neck (+y = towards the body).  It is drawn as a ring
// round a cylinder seen from the side: both edges bow the same way, rounded ends, the gem on the face towards us.
function drawCollarShape(ctx, crack, L, flick = false) {
  const H = 10, B = 7;
  const band = (c) => {
    c.moveTo(-L, -H + B * 0.3); c.quadraticCurveTo(0, -H - B, L, -H + B * 0.3);
    c.quadraticCurveTo(L + 7, B * 0.3, L, H + B * 0.3);
    c.quadraticCurveTo(0, H - B, -L, H + B * 0.3);
    c.quadraticCurveTo(-L - 7, B * 0.3, -L, -H + B * 0.3); c.closePath();
  };
  // spikes standing off both edges
  flat(ctx, (c) => {
    for (const [f, s] of [[-0.62, -1], [-0.05, -1], [0.55, -1], [-0.35, 1], [0.3, 1]]) {
      const x = f * L, bow = B * (1 - f * f), y = s < 0 ? -H - bow + B * 0.3 + 1 : H - bow + B * 0.3 - 1;
      c.moveTo(x - 6, y); c.lineTo(x + s * 0 + 1.5, y + s * 16); c.lineTo(x + 6, y); c.closePath();
    }
  }, C.ironL, 2.6);
  cel(ctx, band, C.iron, C.ironD, { k: 1.4, hi: C.ironH, hk: 0.45, lw: 3.2, detail: (c) => {
    c.fillStyle = C.ironH; c.beginPath();
    for (const f of [-0.78, -0.45, 0.62]) { const bow = B * (1 - f * f); circle(c, f * L, -5 - bow * 0.7 + B * 0.3, 2); circle(c, f * L, 5 - bow * 0.7 + B * 0.3, 2); }
    c.fill();
    c.beginPath(); c.moveTo(-L + 3, -H + 4 + B * 0.3); c.quadraticCurveTo(0, -H - B + 4, L - 3, -H + 4 + B * 0.3); greenLine(c, 1.8);
  } });
  // the big gem, set on the face of the band towards the throat
  const gx = L * 0.25, gy = -B * 0.55, pulse = flick ? 0.5 + 0.5 * Math.abs(Math.sin(T * 13)) : 0.7 + 0.3 * Math.sin(T * 4.4);
  const live = 1 - 0.75 * clamp(crack, 0, 1), gw = 12, gh = 15;
  if (live > 0.5) {
    ctx.globalAlpha = 0.3 * pulse; ctx.fillStyle = C.glow; ctx.beginPath(); circle(ctx, gx, gy, 25); ctx.fill();
    ctx.globalAlpha = 0.55 * pulse; ctx.strokeStyle = C.glow; ctx.lineWidth = 2.5; ctx.beginPath(); circle(ctx, gx, gy, 19 + 2 * pulse); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  flat(ctx, (c) => { c.moveTo(gx - gw - 3, gy - 2); c.lineTo(gx, gy - gh - 3); c.lineTo(gx + gw + 3, gy - 2); c.lineTo(gx, gy + gh + 1); c.closePath(); }, C.ironD, 2.4);
  flat(ctx, (c) => { c.moveTo(gx - gw, gy); c.lineTo(gx, gy - gh); c.lineTo(gx + gw, gy); c.lineTo(gx, gy + gh); c.closePath(); }, live > 0.5 ? C.gem : '#2f8f4a', 2.6);
  ctx.globalAlpha = live;
  ctx.fillStyle = C.gemD; ctx.beginPath(); ctx.moveTo(gx + gw - 2.5, gy); ctx.lineTo(gx, gy + gh - 3); ctx.lineTo(gx - 1.5, gy + 1.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.gemC; ctx.beginPath(); ctx.moveTo(gx - gw + 3, gy - 0.6); ctx.lineTo(gx, gy - gh + 3.5); ctx.lineTo(gx + 1.5, gy - 1.5); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  if (live > 0.4) twinkle(ctx, gx + gw * 0.6, gy - gh * 0.6, 3.6 + 3 * pulse);
  if (crack > 0.02) {
    const cracks = (c) => {
      c.moveTo(gx - 1, gy - gh + 1); c.lineTo(gx + 2.5, gy - 4); c.lineTo(gx - 3, gy + 1); c.lineTo(gx + 1, gy + gh - 1);
      if (crack > 0.3) { c.moveTo(gx + 2.5, gy - 4); c.lineTo(gx + gw - 2, gy - 1); c.moveTo(gx - 3, gy + 1); c.lineTo(gx - gw + 2, gy + 2.5); }
      if (crack > 0.55) { c.moveTo(-L * 0.25, -H - B * 0.7); c.lineTo(-L * 0.12, -3); c.lineTo(-L * 0.3, 2); c.lineTo(-L * 0.16, H + 1); }
      if (crack > 0.8) { c.moveTo(-L * 0.72, -H); c.lineTo(-L * 0.6, 0); c.lineTo(-L * 0.76, H + 2); c.moveTo(L * 0.7, -H + 2); c.lineTo(L * 0.62, 2); c.lineTo(L * 0.8, H + 2); }
    };
    // light leaking out through the cracks (stronger as it breaks), then the ink of the cracks
    const lk = 0.5 + 0.5 * Math.abs(Math.sin(T * (8 + crack * 14)));
    ctx.globalAlpha = 0.55 * lk; ink(ctx, cracks, 6 + crack * 4, C.glow);
    ctx.globalAlpha = 1; ink(ctx, cracks, 2.6, C.gemC);
    ink(ctx, cracks, 1, INK);
  }
}
function twinkle(ctx, x, y, r) {
  ctx.fillStyle = C.gemC;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.6); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r * 1.6);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r * 1.6); ctx.closePath();
  ctx.fill();
}
// collar pieces flying apart (local space)
const SHARDS = [[-0.9, -1.5, 3, 0], [0.8, -1.8, -4, 1], [1.6, -0.9, 5, 0], [-1.7, -0.7, -3, 1], [0.15, -2.2, 6, 2], [-0.4, -1.1, -5, 0]];
function shards(ctx, p) {
  ctx.save();
  const w = collarFrame(ctx);
  ctx.restore();
  const cx = QX, cy = QY, u = p.shatter;
  // the curse breaks: a white-green starburst that blooms and fades
  if (u < 0.55) {
    const v = u / 0.55, R = 20 + 70 * Math.sqrt(v);
    ctx.globalAlpha = 1 - v;
    flat(ctx, (c) => {
      for (let j = 0; j < 16; j++) { const a = j * Math.PI / 8 + 0.2, r = j % 2 ? R * 0.38 : R; j ? c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      c.closePath();
    }, C.gemC, 0);
    ctx.fillStyle = C.glow; ctx.beginPath(); circle(ctx, cx, cy, R * 0.32); ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const [vx, vy, spin, kind] of SHARDS) {
    const x = cx + vx * 130 * u, y = cy + vy * 120 * u + 190 * u * u;
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin * u);
    ctx.globalAlpha = clamp(1.4 - u * 1.4, 0, 1);
    if (kind === 2) flat(ctx, (c) => { c.moveTo(-10, 0); c.lineTo(0, -13); c.lineTo(10, 0); c.lineTo(0, 13); c.closePath(); }, u < 0.3 ? C.gem : '#2f8f4a', 2.6);
    else cel(ctx, (c) => { c.moveTo(-w * 0.42, -11); c.lineTo(w * 0.3, -12); c.lineTo(w * 0.42, 10); c.lineTo(-w * 0.1, 7); c.lineTo(-w * 0.3, 12); c.closePath(); }, C.iron, C.ironD, { k: 1, hi: C.ironH, hk: 0.45, lw: 2.8 });
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // sparkles drifting up where it was
  ctx.fillStyle = C.gemC;
  for (let i = 0; i < 5; i++) { const a = i * 1.3, r = 18 + 50 * u; ctx.globalAlpha = 1 - u; ctx.beginPath(); circle(ctx, cx + Math.cos(a) * r, cy - 30 * u + Math.sin(a) * r * 0.6, 2.4); ctx.fill(); }
  ctx.globalAlpha = 1;
}

// -------------------------------------------------- fx
function nostrilSmoke(ctx, p) {
  const k = p.glow > 0.1 ? 1.6 : p.snort ? 1 + 1.5 * Math.sin(p.snort * Math.PI) : 0.8;
  headLocal(122, -24);
  const x0 = PX, y0 = PY;
  if (y0 > -4 && Math.abs(x0) < POOL.rx) return;     // nostrils under the lava
  for (let i = 0; i < 3; i++) {
    const u = (T * 0.7 + i / 3) % 1, r = (4 + u * 9) * k;
    ctx.globalAlpha = (1 - u) * 0.8;
    flat(ctx, (c) => circle(c, x0 + 5 * u + Math.sin(T * 2 + i) * 3, y0 - 4 - u * 40 * k, r), p.glow > 0.3 ? C.mol : C.ember, 0);
  }
  ctx.globalAlpha = 1;
}
function drips(ctx, p) {
  if (p.sink > 200) return;
  for (let i = 0; i < 3; i++) {
    const u = (T * 0.55 + i * 0.37) % 1, t = 0.8 + i * 0.5;
    sample(t);
    const side = i === 1 ? -1 : 1, nx = -Math.sin(QA) * side, ny = Math.cos(QA) * side;
    const x = QX + nx * (QW + 1), y = lerp(QY + ny * QW - 34, -2, u);
    if (y > -2) continue;
    flat(ctx, (c) => { c.moveTo(x, y - 7); c.quadraticCurveTo(x + 4, y, x, y + 3.5); c.quadraticCurveTo(x - 4, y, x, y - 7); c.closePath(); }, C.mol, 1.6);
  }
}
// the lava swelling just before he bursts out
function dome(ctx, d) {
  const rx = 46 * d, ry = 30 * d;
  cel(ctx, (c) => { c.moveTo(-rx - 8, 0); c.quadraticCurveTo(-rx * 0.8, -ry, 0, -ry); c.quadraticCurveTo(rx * 0.8, -ry, rx + 8, 0); c.quadraticCurveTo(0, 8, -rx - 8, 0); c.closePath(); },
    C.mol, C.molD, { k: 1.6, hi: C.molH, hk: 0.5, lw: 2.4 });
  ctx.fillStyle = C.molC; ctx.beginPath(); ellipse(ctx, -rx * 0.2, -ry * 0.62, rx * 0.3, ry * 0.18); ctx.fill();
}
// lava droplets flung in arcs + a crown sheet around the body (emerge / dive)
const DROPS = [];
{ let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) DROPS.push([-1 + 2 * (i / 13) + (r() - 0.5) * 0.2, 0.7 + r() * 0.6, 2.6 + r() * 3, r()]); }
function splash(ctx, p) {
  const u = p.splash, a = p.spA, cx = p.spX ?? SX[0];
  // crown: a jagged sheet of lava thrown up round the body, rising then falling back
  const h = 58 * a * Math.sin(Math.PI * Math.min(1, u * 1.7)), w = 54;
  if (h > 2) {
    cel(ctx, (c) => {
      c.moveTo(cx - w - 10, 0);
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const f = i / n, x = cx - w + f * 2 * w, hh = h * (0.55 + 0.45 * Math.sin(f * Math.PI)) * (i % 2 ? 1 : 0.62);
        c.lineTo(x - 4, -hh * 0.55); c.quadraticCurveTo(x, -hh - 4, x + 4, -hh * 0.55);
      }
      c.lineTo(cx + w + 10, 0); c.quadraticCurveTo(cx, 12, cx - w - 10, 0); c.closePath();
    }, C.mol, C.molD, { k: 2, hi: C.molH, hk: 0.5, lw: 2.6 });
  }
  // droplets on ballistic arcs with short streaks
  for (const [dx, sp, r, ph] of DROPS) {
    const tt = clamp(u * 1.25 - ph * 0.25, 0, 1);
    if (tt <= 0 || tt >= 1) continue;
    const vx = dx * 5.2 * sp * a, vy = -9.5 * sp * a;
    const x = cx + dx * 30 + vx * tt * 22, y = vy * tt * 22 + 260 * tt * tt;
    if (y > 4) continue;
    const ex = vx, ey = vy + 520 * tt / 22;
    const L = Math.hypot(ex, ey) || 1;
    ctx.strokeStyle = C.mol; ctx.lineWidth = r * 1.2; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ex / L * r * 3.5, y - ey / L * r * 3.5); ctx.stroke(); ctx.globalAlpha = 1;
    flat(ctx, (c) => circle(c, x, y, r), C.molH, 1.8);
  }
}
function smear(ctx, p, jaw) {
  const a = clamp(p.smear, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.75 * a; ctx.fillStyle = '#fff3d6'; ctx.strokeStyle = '#fff3d6'; ctx.lineCap = 'round';
  if (p.sm !== 'slam') {
    const [mx, my] = rotAbout(140, 0, HINGE[0], HINGE[1], jaw * DEG * 0.5);
    headLocal(mx, my);
    ctx.translate(PX, PY); ctx.rotate(HA);
    ctx.beginPath();
    ctx.moveTo(-6, -40); ctx.quadraticCurveTo(40, -24, 28, 18); ctx.quadraticCurveTo(18, 36, -8, 38);
    ctx.quadraticCurveTo(16, 16, 12, -6); ctx.quadraticCurveTo(8, -24, -6, -40); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-60, -48); ctx.lineTo(-140, -48); ctx.moveTo(-70, 46); ctx.lineTo(-130, 46); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function stars(ctx) {
  headLocal(46, -72);
  ctx.save(); ctx.translate(PX, PY);
  for (let i = 0; i < 5; i++) {
    const a = T * 3.4 + i * TAU / 5, sx = Math.cos(a) * 42, sy = Math.sin(a) * 12, front = Math.sin(a) > 0;
    const R = front ? 9 : 7;
    flat(ctx, (c) => {
      for (let j = 0; j < 10; j++) { const rr = j % 2 ? R * 0.42 : R, aa = j * Math.PI / 5 - Math.PI / 2; j ? c.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr) : c.moveTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr); }
      c.closePath();
    }, C.star, 2.2);
  }
  ctx.restore();
}
// submerged: a dark shape gliding under the surface, bubbles and rings
function submerged(ctx, p) {
  ctx.save();
  ctx.beginPath(); ellipse(ctx, 0, 0, POOL.rx - 6, POOL.ry - 3); ctx.clip();
  const sx = Math.sin(T * 0.9) * 18;
  ctx.globalAlpha = 0.32; ctx.fillStyle = C.dark;
  ctx.beginPath(); ellipse(ctx, sx, 2, 46, 9, Math.sin(T * 0.9 + 1) * 0.08); ctx.fill();
  ctx.beginPath(); ellipse(ctx, sx + 34 * Math.cos(T * 0.9), 0, 16, 7); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  if (p.fins > 0) fins(ctx, p.fins, p.x);
  const n = 2 + Math.round(3 * clamp(p.bub, 0, 1));
  for (let i = 0; i < n; i++) {
    const u = (T * 0.8 + i * 0.31) % 1, x = sx + Math.sin(i * 2.3) * 26, y = Math.cos(i * 1.7) * 7;
    if (u < 0.75) {
      const r = 2 + u * 8;
      flat(ctx, (c) => ellipse(c, x, y - r * 0.4, r, r * 0.75), C.mol, 1.8);
      ctx.fillStyle = C.molC; ctx.beginPath(); circle(ctx, x - r * 0.35, y - r * 0.7, r * 0.28); ctx.fill();
    } else {
      const v = (u - 0.75) / 0.25;
      ctx.globalAlpha = 1 - v; ctx.strokeStyle = C.molH; ctx.lineWidth = 2;
      ctx.beginPath(); ellipse(ctx, x, y, 8 + v * 14, 3 + v * 5); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
}

// -------------------------------------------------- the lava pool (drawn by the engine under everything)
const POOLS = {};   // (per palette)
let POOLC = null;
function buildPool(ctx) {
  const g = ctx.createRadialGradient(0, 8, 4, 0, 0, POOL.rx);
  g.addColorStop(0, C.pool[0]); g.addColorStop(0.3, C.pool[1]); g.addColorStop(0.65, C.pool[2]); g.addColorStop(1, C.pool[3]);
  // crusty basalt rim: an irregular ring (seeded)
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const crust = new Path2D(), lip = new Path2D();
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, j = i === n ? 0 : r();
    const x = Math.cos(a) * (POOL.rx + 9 + j * 6), y = Math.sin(a) * (POOL.ry + 6 + j * 3) + (Math.sin(a) > 0 ? 2 : 0);
    i ? crust.lineTo(x, y) : crust.moveTo(x, y);
  }
  crust.closePath();
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const x = Math.cos(a) * (POOL.rx + 2), y = Math.sin(a) * (POOL.ry + 1) + 1;
    i ? lip.lineTo(x, y) : lip.moveTo(x, y);
  }
  POOLC = POOLS[C.name] = { g, crust, lip };
}
/**
 * The lava pool (an ellipse POOL.rx x POOL.ry with a crusted rim), centred on ctx (its floor point, screen).
 * bubbling01: 0 = calm .. 1 = boiling (e.g. he is about to burst out of this one).  scale = game scale.
 */
export function drawPool(ctx, t, bubbling01 = 0, scale = 1, variant = null) {
  C = PAL(variant);
  POOLC = POOLS[C.name];
  if (!POOLC) buildPool(ctx);
  const b = clamp(bubbling01, 0, 1);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // warm light thrown on the floor
  ctx.globalAlpha = 0.2 + 0.08 * b; ctx.fillStyle = C.mol; ctx.beginPath(); ellipse(ctx, 0, 2, POOL.rx + 40, POOL.ry + 16); ctx.fill();
  ctx.globalAlpha = 1;
  // crust rim
  ctx.fillStyle = C.rockD; ctx.fill(POOLC.crust);
  ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke(POOLC.crust);
  // lava
  ctx.save();
  ctx.scale(1, POOL.ry / POOL.rx);
  ctx.fillStyle = POOLC.g; ctx.beginPath(); circle(ctx, 0, 0, POOL.rx); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ellipse(ctx, 0, 0, POOL.rx, POOL.ry); ctx.clip();
  // crust skins drifting on the surface
  ctx.fillStyle = C.poolSkin;
  for (let i = 0; i < 4; i++) {
    const a = t * 0.12 + i * 1.7, x = Math.cos(a) * POOL.rx * 0.62, y = Math.sin(a) * POOL.ry * 0.55;
    ctx.beginPath(); ellipse(ctx, x, y, 11 + (i % 2) * 5, 3.4, 0.1 * i); ctx.fill();
  }
  // bright swirls
  ctx.strokeStyle = C.poolSwirl; ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { const a = -t * 0.3 + i * 2.1, r = 28 + i * 12; ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.3); ctx.ellipse(0, 0, r, r * 0.3, 0, a, a + 0.9); }
  ctx.stroke();
  // the far rim's shadow on the lava
  ctx.fillStyle = C.poolShade; ctx.beginPath(); ellipse(ctx, 0, -POOL.ry * 0.9, POOL.rx * 0.95, POOL.ry * 0.38); ctx.fill();
  ctx.restore();
  // bubbles: more and bigger as it boils
  const n = 3 + Math.round(7 * b);
  for (let i = 0; i < n; i++) {
    const sp = 0.6 + (i % 3) * 0.25 + b * 0.6, u = (t * sp + i * 0.37) % 1;
    const x = Math.sin(i * 2.71 + 0.5) * POOL.rx * 0.7, y = Math.cos(i * 1.93) * POOL.ry * 0.55;
    const R = (3 + (i % 3) * 1.5) * (1 + b * 0.6);
    if (u < 0.75) {
      const rr = R * (u / 0.75);
      ctx.fillStyle = C.molH; ctx.beginPath(); ellipse(ctx, x, y - rr * 0.35, rr, rr * 0.75); ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = C.molD; ctx.stroke();
      ctx.fillStyle = C.molC; ctx.beginPath(); circle(ctx, x - rr * 0.35, y - rr * 0.7, rr * 0.3); ctx.fill();
    } else {
      const v = (u - 0.75) / 0.25;
      ctx.globalAlpha = 1 - v; ctx.strokeStyle = C.molC; ctx.lineWidth = 1.5;
      ctx.beginPath(); ellipse(ctx, x, y, R + v * 7, (R + v * 7) * 0.35); ctx.stroke();
      if (b > 0.3) { ctx.fillStyle = C.mol; ctx.beginPath(); circle(ctx, x + v * 6, y - 4 - v * 14 + v * v * 10, 1.6); circle(ctx, x - v * 5, y - 3 - v * 10 + v * v * 8, 1.3); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }
  // lit inner lip of the crust (near side) + thin dark edge round the lava
  ctx.lineWidth = 1.8; ctx.strokeStyle = C.poolEdge; ctx.beginPath(); ellipse(ctx, 0, 0, POOL.rx, POOL.ry); ctx.stroke();
  ctx.lineWidth = 2.4; ctx.strokeStyle = C.rockH; ctx.stroke(POOLC.lip);
  ctx.restore();
}
