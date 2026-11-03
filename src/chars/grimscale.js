// BOSS: Grimscale, Captain of the Dragon King's Guard.  Art (drawn in code) + pose library.
//
// A towering dragon-knight (~260 px tall at scale 1): slate teal-green scales, black-iron plate with green-glowing
// trim, horned helm with a spiked crest, curled ram horns, long snout, jutting under-bite jaw with tusks, glowing
// green eyes, tattered dark-green cape, small folded leathery wings, thick spiked tail, clawed feet.  He wields ONE
// long halberd in both hands.  Round his neck: the Dragon King's big cursed collar with a large glowing green gem.
// Once beaten the collar cracks and falls away (pose `defeated` -> `freed`): eyes turn warm gold, the trim goes dull.
//
// Local space as for Dodongo: origin on the floor under the hips, +x = facing, y down; limb angles in degrees,
// + = swung forward.  ~265 px to the top of the helm (crest ~300 with the halberd); body hurtbox ~ 90 x 240 at
// x -45..45.  `air: true` = no ground solve, hip at STAND - pose.y: leapAir is the only airborne pose; down, getup,
// defeated and freed use it to set an explicit (grounded, z = 0) hip height.  BREATH_MOUTH = mouth in the breath
// pose (fire stream origin), mouthOf(pose) for any pose, drawCollar() draws the collar alone (falling off).  The
// halberd is posed by its own placement (grip point + angle, or butt planted on the floor) and both arms reach it
// with 2-bone IK; a hand that can't reach its spot slides along the shaft.
// v2: line hierarchy (3-3.4 px silhouette, 1.2-2 px interior in dark local tones), occlusion tones, cool rim light,
// scratches / rivets / scale arcs / woven grip; secondary motion from o.mem + o.vel (cape flow and hem, tabard,
// tail lift + whip, folded wing tips); o.talk flaps the jaw; auto-blink in idle / cutscene poses.  After level 1
// he is a friendly ally (o.cursed = false): kneel, point, walk and fly(t) carry the cutscenes, the heroes ride on
// his flat back at SADDLE.  Faces: mean, roar (= yell), breath, ouch, ko, dazed, freed, neutral, happy, surprised,
// worried.
import { cel, flat, ink, capsule, blob, ellipse, circle, keys, mix, DEG, TAU, legDrop, clamp, lerp, follow } from '../rig.js';
import { INK } from '../config.js';

const C = {
  sc: '#72b3a2', scD: '#4a7a6c', scH: '#b2e4d2', scL: '#578a7c',
  bel: '#bccb9f', belD: '#8c9c73', belL: '#7a8a63',
  iron: '#66708a', ironD: '#3d4454', ironH: '#b6c1d6', ironL: '#8590ab',
  ironF: '#535b70', ironFD: '#323845',
  trim: '#66ff8e', trimDull: '#6f9a8a', trimFar: '#3fcf6a',
  gem: '#62ff8c', gemD: '#13a845', gemC: '#eaffdf', glow: '#5cff7e',
  cape: '#41805c', capeD: '#28523b', capeL: '#5c9c76',
  mem: '#559686', memD: '#376559',
  horn: '#e0d6b2', hornD: '#a99c76', hornL: '#8d815f',
  wood: '#6a4630', woodD: '#3f281a',
  claw: '#ece5cb', clawD: '#b9af8e',
  mouth: '#3c1620', tongue: '#c15766', tooth: '#fffaf0',
  eyeW: '#fffaf0', gold: '#f7bb35', goldD: '#b5740f', pupil: '#2b1406',
  tab: '#3a7254', tabD: '#234834',
  rim: '#dffcf7',                        // cool back/rim light (upper right, away from the key light)
  scO: '#2b4a43', ironO: '#272c38', capeO: '#183526',   // occlusion tones (crevices)
  scratch: 'rgba(214,224,240,0.55)',
};

// ---------------------------------------------------------------- skeleton (px at scale 1)
const THIGH = 44, SHIN = 42, FOOT = 13;
const UPPER = 40, FORE = 40;
const HIP_NEAR = [-8, 2], HIP_FAR = [10, -1];
const SH_NEAR = [-8, -88], SH_FAR = [14, -92];
const NECK = [20, -106];
const HS = 1.22;                        // head scale (big cartoon head; line widths are divided back)
const TAIL_ROOT = [-24, 4];
const STAND = 92;                       // hip height used by `air` poses (pose.y offsets it)

// ---------------------------------------------------------------- poses
// tor: torso lean (+ forward), head: + = chin down.  Halberd: held 'both' = both hands (IK), 'near' / 'far' = one
// hand (that arm by FK au/af or bu/bf), 'drop' = lying on the floor at wx (arms by FK).  wa: shaft angle (0 = blade
// down, 90 = forward, 180 = up), wx/wy: grip centre in the hip frame when held free, plant 0..1 blends to the butt
// planted on the floor at px, wb: butt -> grip centre, wg: hand spacing, eb/ebf: elbow bend side (+1 / -1).  au/af, bu/bf: FK arm angles (near /
// far).  tl: tail lift (deg), tc: tail curl, tsw: tail sway, cape: cape blown back 0..1, wo: wings open 0..1,
// chest: breath swell 0..1, glow: green fire in the throat 0..1, crack: collar cracking 0..1, spin: cut-out
// turn (deg) for the tail swipe, smear: 0..1 with sa0/sa1 (deg, same convention as wa), sr radius, sf vertical
// squash (0.3 = horizontal sweep), scx/scy centre (hip frame).  autoBlink: blink from o.t (cutscene poses).
export const BASE = {
  x: 0, y: 0, rot: 0, tor: 6, head: 0, jaw: 0,
  nt: -12, ns: -16, nf: 0, ft: 14, fs: -18, ff: 0,
  held: 'both', wa: 172, px: 70, wx: 60, wy: -60, wb: 150, wg: 36, plant: 1, eb: 1, ebf: 1,
  au: 40, af: 60, bu: 30, bf: 50,
  tl: 0, tc: 0, tsw: 1, cape: 0, wo: 0, chest: 0, glow: 0, crack: 0,
  sq: 1, spin: 0, smear: 0, sa0: 0, sa1: 0, sr: 170, sf: 1, scx: 0, scy: -80, tailFront: false,
  face: 'mean', air: false, free: false, blink: false, autoBlink: false,
  wr: 0, ws: 1, wf: 0, wfr: 1.2,   // wing root rotation (deg), wing scale, flap amplitude (deg) + rate (Hz) for flight
};
const P = (o) => Object.assign({}, BASE, o);

const IDLE = P({});
const CARRY = { plant: 0, wa: 224, wx: 26, wy: -50, wb: 66 };      // halberd shouldered, blade back over his shoulder
const HOLD = { plant: 0, wa: 206, wx: 10, wy: -42, wb: 112 };   // halberd held at his side, angled back past his head
export const ANIM = {
  // breathing + weight shift, blink, and every ~5.6 s a fidget: rolls his neck, snorts, settles the halberd
  idle(t) {
    const b = Math.sin(t * 2.2), w = Math.sin(t * 0.9);
    const p = P({ x: 1.5 * w, tor: 6 + b * 1.4, head: 2 - b * 2, ns: -16 - b * 3 + 3 * w, fs: -18 - b * 3 - 3 * w, nt: -12 + b, ft: 14 + b,
      chest: 0.25 + 0.25 * b, jaw: 2 + 2 * Math.max(0, b), tl: 2 * b });
    p.blink = (t % 4.3) > 4.18;
    const u = (t % 5.6) / 5.6;
    if (u > 0.8) {
      const v = (u - 0.8) / 0.2, e = Math.sin(v * Math.PI);
      p.head += 12 * Math.sin(v * TAU) * e - 6 * e; p.tor -= 4 * e; p.jaw += 10 * e * (v > 0.5 ? 1 : 0); p.chest += 0.6 * e;
      p.px += 6 * e; p.tl += 10 * e; p.wo = 0.25 * e; p.blink = v > 0.55 && v < 0.7;
    }
    return p;
  },
  walk(ph) {
    const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU);
    // heavy stride: long steps, knees lift high on the pass, the body sinks onto each planted foot
    return P({ ...CARRY, tor: 12 + 2 * Math.abs(s), head: 2 - 3 * Math.abs(s), y: 4 * Math.abs(s), nt: 28 * s, ns: -14 - 50 * Math.max(0, c),
      ft: -28 * s, fs: -14 - 50 * Math.max(0, -c), nf: 6 * s, ff: -6 * s, wy: -50 + 4 * Math.abs(s), tl: 5 * s, tsw: 1.5, cape: 0.2, autoBlink: true });
  },
  // halberd lifted, then hauled back and coiled (0.5 s telegraph)
  sweepWind: (k) => keys(k, [
    [0, IDLE],
    [0.22, P({ x: 2, tor: 12, head: 4, plant: 0, wa: 214, wx: 4, wy: -70, wb: 118, nt: -14, ns: -24, ft: 18, fs: -28, jaw: 4, tl: 4 }), 'out'],
    [0.62, P({ x: -6, tor: -14, head: 8, plant: 0, wa: 242, wx: -34, wy: -78, wb: 120, wg: 40, eb: -1, ebf: -1,
      nt: -20, ns: -30, ft: 30, fs: -40, cape: 0.2, tl: 10, jaw: 6 })],
    [1, P({ x: -10, tor: -22, head: 12, plant: 0, wa: 248, wx: -40, wy: -70, wb: 120, wg: 40, eb: -1, ebf: -1,
      nt: -26, ns: -46, ft: 38, fs: -56, cape: 0.25, tl: 14, jaw: 8 }), 'out'],
  ]),
  // huge horizontal sweep (big flat smear in front): snap, overshoot, settle
  sweep: (k) => keys(k, [
    [0, P({ x: -10, tor: -22, head: 12, plant: 0, wa: 248, wx: -40, wy: -70, wb: 120, wg: 40, eb: -1, ebf: -1,
      nt: -26, ns: -46, ft: 38, fs: -56, cape: 0.25, tl: 14, jaw: 8 })],
    [0.16, P({ x: 14, tor: 26, head: -4, plant: 0, wa: 92, wx: 86, wy: -32, wb: 112, wg: 40, nt: -30, ns: -12, ft: 40, fs: -60,
      cape: 0.6, tl: -10, jaw: 20, face: 'roar', smear: 1, sa0: -95, sa1: 92, sr: 205, sf: 0.32, scx: 10, scy: -48, sq: 0.96 }), 'snap'],
    [0.36, P({ x: 18, tor: 34, head: -8, plant: 0, wa: 124, wx: 82, wy: -18, wb: 112, wg: 40, nt: -34, ns: -14, ft: 44, fs: -66,
      cape: 0.55, tl: -16, jaw: 16, face: 'roar', smear: 0.45, sa0: 10, sa1: 122, sr: 205, sf: 0.32, scx: 10, scy: -48 }), 'out'],
    [0.7, P({ x: 10, tor: 18, head: 0, plant: 0, wa: 150, wx: 66, wy: -40, wb: 120, nt: -20, ns: -18, ft: 28, fs: -36, tl: -2, jaw: 6 })],
    [1, P({ x: 6 })],
  ]),
  // turns his hips, tail coils (0.3 s): settles low, then twists
  tailWind: (k) => keys(k, [
    [0, IDLE],
    [0.4, P({ x: -2, tor: 10, head: 6, ...HOLD, nt: -10, ns: -36, ft: 22, fs: -42, tl: 14, tc: 3, sq: 0.97 }), 'out'],
    [1, P({ x: -4, spin: 34, tor: 14, head: 6, ...HOLD, nt: -6, ns: -40, ft: 26, fs: -48,
      tl: 30, tc: 6, tsw: 0.3, cape: 0.2 }), 'out'],
  ]),
  // spinning tail swipe: a cut-out turn; the tail lashes forward low at k .28 (inside the engine's hit window)
  tail: (k) => keys(k, [
    [0, P({ x: -4, spin: 34, tor: 14, head: 6, ...HOLD, nt: -6, ns: -40, ft: 26, fs: -48, tl: 30, tc: 6, tsw: 0.3, cape: 0.2 })],
    [0.28, P({ x: 4, spin: 180, tor: 20, head: 4, ...HOLD, nt: -10, ns: -40, ft: 30, fs: -50,
      tl: 52, tc: -3, tsw: 0, cape: 0.9, smear: 1, sa0: -40, sa1: 105, sr: 165, sf: 0.3, scx: 0, scy: 30, tailFront: true }), 'in'],
    [0.5, P({ x: 5, spin: 262, tor: 16, head: 2, ...HOLD, nt: -10, ns: -36, ft: 28, fs: -46,
      tl: 34, tc: 1, tsw: 0.3, cape: 0.8, smear: 0.45, sa0: 40, sa1: 112, sr: 165, sf: 0.3, scx: 0, scy: 30 })],
    [0.78, P({ x: 3, spin: 336, tor: 8, head: 0, nt: -12, ns: -26, ft: 18, fs: -32, tl: 12, cape: 0.5, sq: 0.97 }), 'out'],
    [1, P({ x: 2, spin: 360 })],
  ]),
  // chin tucks, he sucks in a breath, then rears back: chest swells, green fire in the throat (0.6 s)
  breathWind: (k) => keys(k, [
    [0, IDLE],
    [0.3, P({ x: 2, tor: 16, head: 18, jaw: 0, chest: 0.5, glow: 0.2, nt: -14, ns: -30, ft: 22, fs: -38, tl: 6, face: 'breath', ...HOLD, sq: 0.97 }), 'out'],
    [0.75, P({ x: -6, tor: -18, head: -30, jaw: 10, chest: 1, glow: 0.8, nt: -16, ns: -26, ft: 24, fs: -34, tl: 14, wo: 0.4, face: 'breath', ...HOLD, wa: 232, wx: -6, wy: -34 }), 'out'],
    [1, P({ x: -7, tor: -20, head: -34, jaw: 12, chest: 1.1, glow: 1, nt: -18, ns: -28, ft: 26, fs: -36, tl: 16, wo: 0.5, face: 'breath', ...HOLD, wa: 236, wx: -8, wy: -32 })],
  ]),
  // head thrust forward, mouth wide (the engine draws the fire stream from BREATH_MOUTH)
  breath: (k) => {
    const p = keys(k, [
      [0, P({ x: -7, tor: -20, head: -34, jaw: 12, chest: 1.1, glow: 1, nt: -18, ns: -28, ft: 26, fs: -36, tl: 16, wo: 0.5, face: 'breath', ...HOLD, wa: 236, wx: -8, wy: -32 })],
      [0.14, P({ x: 8, tor: 16, head: -2, jaw: 34, chest: 0.5, glow: 1, nt: -26, ns: -12, ft: 34, fs: -50, tl: -6, wo: 0.3, cape: 0.3, face: 'breath', ...HOLD }), 'snap'],
      [0.85, P({ x: 8, tor: 14, head: -4, jaw: 32, chest: 0.3, glow: 0.9, nt: -26, ns: -12, ft: 34, fs: -50, tl: -4, wo: 0.2, cape: 0.25, face: 'breath', ...HOLD })],
      [1, P({ x: 4, glow: 0 })],
    ]);
    if (k > 0.14 && k < 0.85) { const w = Math.sin(k * 70); p.head += 1.6 * w; p.tor += 0.8 * w; }   // the jaw shudders with the fire
    return p;
  },
  // jump: dips, raises the halberd, then crouches deep
  leapCrouch: (k) => keys(k, [
    [0, IDLE],
    [0.45, P({ tor: 14, head: 4, plant: 0, wa: 190, wx: 14, wy: -96, wb: 124, eb: -1, ebf: -1, nt: 14, ns: -46, ft: 30, fs: -50, sq: 0.97, tl: 6, jaw: 6 }), 'out'],
    [1, P({ tor: 28, head: 12, plant: 0, wa: 210, wx: -10, wy: -84, wb: 120, eb: -1, ebf: -1, nt: 44, ns: -100, ft: 56, fs: -96,
      sq: 0.9, tl: 14, cape: 0.1, jaw: 10, face: 'roar' }), 'in'],
  ]),
  leapAir: P({ air: true, y: -6, tor: -10, head: -10, plant: 0, wa: 196, wx: 6, wy: -150, wb: 110, wg: 42, eb: -1, ebf: -1,
    nt: 40, ns: -70, ft: 20, fs: -60, nf: 20, ff: 10, tl: -20, tc: 6, cape: 1, wo: 0.8, jaw: 24, face: 'roar' }),
  // lands, halberd smashes the ground (engine adds a shockwave): squash, rebound, settle
  slam: (k) => keys(k, [
    [0, P({ y: -6, tor: -8, head: -8, plant: 0, wa: 196, wx: 6, wy: -150, wb: 110, wg: 42, eb: -1, ebf: -1, nt: 30, ns: -60,
      ft: 30, fs: -60, tl: -10, cape: 1, wo: 0.6, jaw: 24, face: 'roar' })],
    [0.18, P({ tor: 40, head: 18, plant: 0, wa: 64, wx: 74, wy: -6, wb: 100, wg: 42, nt: -30, ns: -64, ft: 60, fs: -96, sq: 0.86,
      tl: 20, cape: 0.5, wo: 0.2, jaw: 26, face: 'roar', smear: 1, sa0: 186, sa1: 70, sr: 215, sf: 1, scx: 6, scy: -90 }), 'in'],
    [0.32, P({ tor: 36, head: 14, plant: 0, wa: 64, wx: 74, wy: -6, wb: 100, wg: 42, nt: -30, ns: -60, ft: 58, fs: -92, sq: 1.03,
      tl: 14, cape: 0.35, jaw: 22, face: 'roar', smear: 0.45, sa0: 130, sa1: 70, sr: 215, sf: 1, scx: 6, scy: -90 }), 'out'],
    [0.62, P({ tor: 34, head: 12, plant: 0, wa: 64, wx: 74, wy: -6, wb: 100, wg: 42, nt: -30, ns: -64, ft: 60, fs: -96, sq: 0.97,
      tl: 12, cape: 0.2, jaw: 16, face: 'roar' })],
    [1, P({ x: 0 })],
  ]),
  // high hit (squash, recoil, overshoot, settle)
  hurt: (k) => keys(k, [
    [0, P({ x: -8, tor: -16, head: -18, jaw: 12, plant: 0, wa: 210, wx: 2, wy: -44, wb: 112, nt: -4, ns: -26, ft: 22, fs: -26,
      tl: 18, tsw: 2, cape: 0.3, face: 'ouch', sq: 0.94 })],
    [0.35, P({ x: -10, tor: -20, head: -22, jaw: 10, plant: 0, wa: 212, wx: 0, wy: -44, wb: 112, nt: -4, ns: -26, ft: 22, fs: -26,
      tl: 20, tsw: 2, cape: 0.35, face: 'ouch', sq: 1.02 }), 'out'],
    [0.7, P({ x: -4, tor: 4, head: 2, face: 'mean' })],
    [1, P({ x: -3, tor: 2, head: 0, face: 'mean' })],
  ]),
  // low hit: the knees buckle, he folds forward over the halberd, squash, then straightens
  hurt2: (k) => keys(k, [
    [0, P({ x: -6, tor: 24, head: 20, jaw: 14, plant: 0, wa: 166, wx: 48, wy: -46, wb: 120, nt: 14, ns: -60, ft: 34, fs: -66,
      tl: 26, tsw: 2, cape: 0.4, face: 'ouch', sq: 0.9 })],
    [0.35, P({ x: -8, tor: 18, head: 14, jaw: 10, plant: 0, wa: 168, wx: 46, wy: -52, wb: 124, nt: 8, ns: -50, ft: 30, fs: -56,
      tl: 20, tsw: 2, cape: 0.3, face: 'ouch', sq: 0.97 }), 'out'],
    [0.75, P({ x: -3, tor: 2, head: -4, face: 'mean', sq: 1.01 })],
    [1, P({ x: -2, face: 'mean' })],
  ]),
  // heavy flinch, one foot back, halberd planted for support
  stagger: (k) => keys(k, [
    [0, P({ x: -14, tor: -26, head: -26, jaw: 16, plant: 0, wa: 214, wx: -2, wy: -42, wb: 112, nt: -30, ns: -30, ft: 30, fs: -40, tl: 24, tsw: 2, cape: 0.5,
      face: 'ouch', sq: 0.95 })],
    [0.35, P({ x: -16, tor: 22, head: 10, jaw: 8, wa: 172, px: 74, wb: 140, nt: -34, ns: -40, ft: 40, fs: -64, tl: 10, cape: 0.2,
      face: 'ouch' }), 'out'],
    [1, P({ x: -6, face: 'mean' })],
  ]),
  // knocked flat on his back; halberd dropped beside him
  down: P({ air: true, rot: 84, y: 40, tor: -4, head: -16, jaw: 14, held: 'drop', wa: 92, wx: -70, au: 150, af: 30, bu: 170, bf: 20,
    nt: 16, ns: -30, ft: 30, fs: -40, nf: 10, ff: 10, tl: -50, tc: -4, tsw: 0.3, cape: 0, face: 'ko' }),
  getup: (k) => keys(k, [
    [0, P({ air: true, rot: 84, y: 40, tor: -4, head: -16, jaw: 14, held: 'drop', wa: 92, wx: -70, au: 150, af: 30, bu: 170, bf: 20,
      nt: 16, ns: -30, ft: 30, fs: -40, nf: 10, ff: 10, tl: -50, tc: -4, tsw: 0.3, face: 'ouch' })],
    [0.3, P({ air: true, rot: 40, y: 62, tor: 40, head: 18, jaw: 10, held: 'drop', wa: 92, wx: -70, au: 70, af: 40, bu: 90, bf: 30,
      nt: 120, ns: -140, ft: 110, fs: -130, nf: 40, ff: 40, tl: 10, face: 'ouch' }), 'out'],
    [0.55, P({ air: true, y: 34, tor: 34, head: 12, jaw: 8, wa: 176, px: 84, wb: 140, nt: 60, ns: -130, ft: 76, fs: -120,
      tl: 14, face: 'mean' })],
    [1, P({ face: 'mean' })],
  ]),
  // intro: arms wide, roaring
  roar(t) {
    const sh = Math.sin(t * 40) * 0.8;
    return P({ tor: -14, head: -28 + sh, jaw: 36, held: 'far', au: 66, af: 24, bu: 204, bf: 8, wa: 200, wb: 96,
      nt: -22, ns: -10, ft: 30, fs: -16, tl: 20 + 4 * Math.sin(t * 3), wo: 1, chest: 1, cape: 0.35 + 0.1 * Math.sin(t * 5),
      face: 'roar' });
  },
  // beaten: drops to one knee; the collar cracks a little, then splits at k .5 (the engine's spark)
  defeated: (k) => {
    const p = keys(k, [
      [0, P({ tor: -10, head: -20, jaw: 14, face: 'ouch', sq: 0.95 })],
      [0.4, P({ air: true, y: 30, tor: 14, head: 18, jaw: 10, wa: 166, px: 92, wb: 128, nt: -4, ns: -84, nf: -160, ft: 70, fs: -100,
        tl: -20, tsw: 0.3, face: 'dazed' }), 'out'],
      [0.5, P({ air: true, y: 30, tor: 6, head: 2, jaw: 12, wa: 166, px: 92, wb: 128, nt: -4, ns: -84, nf: -160, ft: 70, fs: -100,
        tl: -16, tsw: 0.3, face: 'surprised' })],
      [1, P({ air: true, y: 30, tor: 18, head: 22, jaw: 8, wa: 166, px: 92, wb: 128, nt: -4, ns: -84, nf: -160, ft: 70, fs: -100,
        tl: -24, tsw: 0.2, face: 'dazed' })],
    ]);
    p.crack = k < 0.5 ? k * 0.7 : 1;
    return p;
  },
  // freed: kneeling calmly, collar gone, eyes gold, a gentle tired smile
  freed(t) {
    const b = Math.sin(t * 1.6);
    return P({ air: true, free: true, y: 30, tor: 8 + b, head: 4 - b * 1.5, jaw: 0, wa: 170, px: 96, wb: 150, nt: -4, ns: -84, nf: -160,
      ft: 70, fs: -100, tl: -16, tsw: 0.4, chest: 0.2 + 0.2 * b, face: 'freed', autoBlink: true });
  },
  // ---- cutscenes (the friendly ally after level 1; use o.cursed = false, o.talk for speech)
  // on one knee, halberd planted, head up (the heroes climb on / he bows)
  kneel: P({ air: true, y: 30, tor: 6, head: -2, jaw: 0, wa: 172, px: 96, wb: 150, nt: -4, ns: -84, nf: -160, ft: 70, fs: -100,
    tl: -14, tsw: 0.4, chest: 0.3, face: 'neutral', autoBlink: true }),
  // points ahead with the halberd held out in the near hand, the far fist on his hip
  point: P({ x: 4, tor: 8, head: -6, jaw: 4, held: 'near', au: 84, af: 6, wa: 98, wb: 150, bu: -20, bf: 110,
    nt: -18, ns: -12, ft: 22, fs: -18, tl: 6, cape: 0.15, face: 'neutral', autoBlink: true }),
  // guides the heroes (story before_mines): halberd held upright at his side in the far hand (blade over his head), the
  // free near claw pointing ahead at chest height
  guide: P({ x: 4, tor: 4, head: -8, jaw: 4, held: 'far', au: 75, af: 5, bu: 40, bf: 100, wa: 180, wb: 140,
    nt: -18, ns: -12, ft: 22, fs: -18, tl: 6, cape: 0.15, face: 'neutral', autoBlink: true }),
  // flying with the heroes on his back: body level, big wings beating, halberd forward like a lance
  fly(t) {
    const b = Math.sin(t * TAU * 1.2);
    return P({ air: true, y: -18 + 4 * b, rot: -72, tor: 0, head: -72, jaw: 2, held: 'near', au: 150, af: 12, wa: 160, wb: 120,
      bu: 120, bf: 30, nt: -4, ns: -30, ft: 8, fs: -44, nf: -50, ff: -50, tl: -18, tc: -7, tsw: 1.6, cape: 0, wo: 1,
      wr: -84, ws: 1.9, wf: 30, wfr: 1.2, face: 'neutral', autoBlink: true });
  },
};
export { mix };

// ---------------------------------------------------------------- geometry shared with the engine
function hipHeight(p) {
  if (p.air) return -STAND + p.y;
  const dn = HIP_NEAR[1] + legDrop(THIGH, SHIN, FOOT, p.nt, p.ns);
  const df = HIP_FAR[1] + legDrop(THIGH, SHIN, FOOT, p.ft, p.fs);
  return -Math.max(dn, df) + p.y;
}
function rot2(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
const HEAD_MOUTH = [72, -14];
/** Local [x, y] of the mouth for a pose (facing right, scale 1, relative to the floor origin). */
export function mouthOf(p) {
  let [x, y] = rot2(HEAD_MOUTH[0] * HS, (HEAD_MOUTH[1] + p.jaw * 0.3) * HS, p.head * DEG);
  x += NECK[0]; y += NECK[1];
  [x, y] = rot2(x, y, p.tor * DEG);
  if (p.rot) [x, y] = rot2(x, y, -p.rot * DEG);
  if (p.spin) { const c = Math.cos(p.spin * DEG); x *= Math.sign(c || 1) * Math.max(0.55, Math.abs(c)); }
  x += p.x; y += hipHeight(p);
  if (p.sq !== 1) { x /= Math.sqrt(p.sq); y *= p.sq; }
  return [Math.round(x), Math.round(y)];
}
/** Mouth position in the fire-breath pose (start of the green fire stream). */
export const BREATH_MOUTH = mouthOf(ANIM.breath(0.3));
/** A torso-frame point -> local [x, y] (facing right, scale 1, relative to the floor origin, before the engine's z). */
function torsoToLocal(p, tx, ty) {
  let [x, y] = rot2(tx, ty, p.tor * DEG);
  if (p.rot) [x, y] = rot2(x, y, -p.rot * DEG);
  x += p.x; y += hipHeight(p);
  if (p.sq !== 1) { x /= Math.sqrt(p.sq); y *= p.sq; }
  return [Math.round(x), Math.round(y)];
}
/** Where the heroes sit (hips, `sit` pose) on his back in fly(t): the back is flat from about SADDLE - 34 to + 30 px
 *  along x.  Measured at fly(0) (the body bobs +-4 px with the wing beat: add the same bob if you need it exact). */
export const SADDLE = torsoToLocal(ANIM.fly(0), -46, -30);

// ---------------------------------------------------------------- drawing
// Rim light: a thin cool band just inside the ink outline on the upper-right (screen) side, i.e. away from the
// rig's upper-left key light, so the dark armour separates from dark backgrounds.  The outline is stroked shifted
// towards the lower left inside a clip of the shape, then the ink edge is restroked.  s = band size (local px).
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
// the Dragon King's green trim: a soft translucent halo under a bright core (no blur); dull once he is freed
function glowLine(c, w, far) {
  if (CUR) {
    c.globalAlpha = 0.34; c.strokeStyle = C.glow; c.lineWidth = w * 2.9; c.stroke(); c.globalAlpha = 1;
    c.strokeStyle = far ? C.trimFar : C.trim;
  } else c.strokeStyle = C.trimDull;
  c.lineWidth = w; c.stroke();
}
let T = 0, CUR = true;
const NOVEL = { x: 0, y: 0, z: 0 };
const SEC = { cape: 0, hem: 0, tail: 0, whip: 0, tab: 0, wing: 0 };   // this draw's secondary motion
let FLOOR = 92, FS = 0, FC = 1;          // floor y in the hip frame + sin/cos of the body rotation (for floor clamps)
// keep a body-frame point at least m px above the floor: returns the push (px) and moves it along hip-frame up
let CX = 0, CY = 0;
function aboveFloor(x, y, m) {
  const Y = x * FS + y * FC, lim = FLOOR - m;
  CX = x; CY = y;
  if (Y > lim) { const d = Y - lim; CX -= d * FS; CY -= d * FC; }
}
const W = { bx: 0, by: 0, dx: 0, dy: 1, nx: 0, ny: 0, fx: 0, fy: 0 };

/**
 * Draw Grimscale.  ctx is at his feet (screen), unscaled.
 * o: { facing: 1 | -1, t: seconds, scale, cursed: true (collar + green eyes + glowing trim) }
 */
export function draw(ctx, pose, o = {}) {
  let p = pose;
  const f = o.facing || 1, S = o.scale || 1;
  T = o.t || 0;
  CUR = (o.cursed ?? true) && !p.free;
  // secondary motion: springs on the actor's velocity and on in-pose lunges / torso swings (no o.mem = no lag)
  const mem = o.mem, vel = o.vel || NOVEL, vx = (vel.x || 0) * f, vz = vel.z || 0;
  const hipLag = follow(mem, 'gs_hip', p.x, 0.16, 0.74) - p.x;
  const torLag = follow(mem, 'gs_tor', p.tor, 0.14, 0.74) - p.tor;
  SEC.cape = clamp(follow(mem, 'gs_cape', p.cape + clamp(Math.abs(vx) * 0.09 + Math.max(0, -vz) * 0.06, 0, 0.6), 0.09, 0.8), 0, 1.15);
  SEC.hem = follow(mem, 'gs_hem', clamp(-vx * 4 - hipLag * 0.9 + torLag * 0.8, -22, 22), 0.1, 0.78);
  SEC.tail = follow(mem, 'gs_tail', clamp(vx * 2.6 - hipLag * 0.8 + torLag * 0.5, -24, 24), 0.08, 0.82);
  SEC.whip = follow(mem, 'gs_tail2', SEC.tail, 0.1, 0.74) - SEC.tail;
  SEC.tab = follow(mem, 'gs_tab', clamp(-vx * 3 - hipLag * 0.7, -14, 14), 0.14, 0.7);
  SEC.wing = follow(mem, 'gs_wing', clamp(vz * 3 - vx * 1.5 + torLag * 0.8, -16, 16), 0.15, 0.7);
  if (o.talk || (p.autoBlink && !p.blink && (T % 4.3) > 4.18)) {
    p = Object.assign({}, p);
    if (p.autoBlink && (T % 4.3) > 4.18) p.blink = true;
    if (o.talk) p.jaw += (0.5 + 0.5 * Math.sin(T * 15)) * (0.55 + 0.45 * Math.sin(T * 4.3 + 1)) * 16;
  }
  const hipY = hipHeight(p);
  ctx.save();
  ctx.scale(f * S, S);
  if (p.sq !== 1) ctx.scale(1 / Math.sqrt(p.sq), p.sq);
  ctx.translate(p.x, hipY);
  if (p.held === 'drop') { placeWeapon(p, -hipY); halberd(ctx, p); }
  ctx.save();
  if (p.spin) { const c = Math.cos(p.spin * DEG); ctx.scale(Math.sign(c || 1) * Math.max(0.55, Math.abs(c)), 1); }
  if (p.rot) ctx.rotate(-p.rot * DEG);
  if (p.held !== 'drop') placeWeapon(p, -hipY);
  const tor = p.tor * DEG;
  FLOOR = -hipY; FS = Math.sin(-p.rot * DEG); FC = Math.cos(-p.rot * DEG);
  const onBack = p.rot > 50;               // lying on his back on his wings: don't draw them

  if (!onBack) { ctx.save(); ctx.rotate(tor); wingFolded(ctx, p, true); ctx.restore(); }
  cape(ctx, p, tor);
  if (!onBack) { ctx.save(); ctx.rotate(tor); wingFolded(ctx, p, false); ctx.restore(); }
  if (!p.tailFront) tail(ctx, p);
  if (p.held === 'far') halberd(ctx, p);
  arm(ctx, p, tor, false);
  leg(ctx, HIP_FAR, p.ft, p.fs, p.ff, true);
  leg(ctx, HIP_NEAR, p.nt, p.ns, p.nf, false);
  ctx.save(); ctx.rotate(tor);
  torso(ctx, p);
  neckAndHead(ctx, p);
  ctx.restore();
  if (p.tailFront) tail(ctx, p);
  if (p.held === 'near' || p.held === 'both') halberd(ctx, p);
  arm(ctx, p, tor, true);
  ctx.save(); ctx.rotate(tor); pauldron(ctx, SH_NEAR, false); if (CUR) collar(ctx, p); ctx.restore();
  ctx.restore();
  if (p.smear > 0.01) smear(ctx, p);
  ctx.restore();
}

// -------------------------------------------------- halberd placement + arm IK (hip / body frame)
function shoulderPos(s, tor) { return rot2(s[0], s[1], tor); }
function fkArm(p, near, tor) {
  const s = shoulderPos(near ? SH_NEAR : SH_FAR, tor);
  const u = ((near ? p.au : p.bu) * DEG) - tor, fa = u + (near ? p.af : p.bf) * DEG;
  const ex = s[0] + Math.sin(u) * UPPER, ey = s[1] + Math.cos(u) * UPPER;
  return [s[0], s[1], ex, ey, ex + Math.sin(fa) * FORE, ey + Math.cos(fa) * FORE];
}
function placeWeapon(p, floorY) {
  const a = p.wa * DEG, dx = Math.sin(a), dy = Math.cos(a);
  const tor = p.tor * DEG;
  W.dx = dx; W.dy = dy;
  if (p.held === 'drop') {     // lying flat on the floor
    W.dx = Math.sin(a) < 0 ? -1 : 1; W.dy = 0; W.bx = p.wx; W.by = floorY - 12;
    return;
  }
  if (p.held === 'near' || p.held === 'far') {      // one hand holds it, by FK
    const a1 = fkArm(p, p.held === 'near', tor);
    W.nx = W.fx = a1[4]; W.ny = W.fy = a1[5];
    W.bx = W.nx - dx * p.wb; W.by = W.ny - dy * p.wb;
    return;
  }
  let gx, gy;
  const pl = clamp(p.plant, 0, 1);      // blend between held free (wx, wy) and butt planted on the floor at px
  gx = lerp(p.wx, p.px + dx * p.wb, pl); gy = lerp(p.wy, floorY + dy * p.wb, pl);
  W.bx = gx - dx * p.wb; W.by = gy - dy * p.wb;
  const sn = shoulderPos(SH_NEAR, tor), sf = shoulderPos(SH_FAR, tor);
  let tn = slide(sn, gx, gy, dx, dy, p.wg / 2), tf = slide(sf, gx, gy, dx, dy, -p.wg / 2);
  if (tn - tf < 22) { const m = (tn + tf) / 2; tn = m + 11; tf = m - 11; }
  W.nx = gx + dx * tn; W.ny = gy + dy * tn; W.fx = gx + dx * tf; W.fy = gy + dy * tf;
}
// parameter along the shaft (from the grip centre) where a hand can hold, as close as possible to `want`
function slide(s, gx, gy, dx, dy, want) {
  const R = (UPPER + FORE) * 0.96;
  const ox = gx - s[0], oy = gy - s[1];
  const px = ox + dx * want, py = oy + dy * want;
  if (px * px + py * py <= R * R) return want;
  const b = ox * dx + oy * dy, c = ox * ox + oy * oy - R * R, disc = b * b - c;
  if (disc < 0) return -b;
  const r = Math.sqrt(disc), t1 = -b - r, t2 = -b + r;
  return Math.abs(t1 - want) < Math.abs(t2 - want) ? t1 : t2;
}
function ik(sx, sy, hx, hy, bend) {
  const dx = hx - sx, dy = hy - sy, d = clamp(Math.hypot(dx, dy), 4, UPPER + FORE - 0.5);
  const a = Math.acos(clamp((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d), -1, 1));
  const base = Math.atan2(dy, dx) + bend * a;
  return [sx + Math.cos(base) * UPPER, sy + Math.sin(base) * UPPER];
}

// -------------------------------------------------- arms
function arm(ctx, p, tor, near) {
  let sx, sy, ex, ey, hx, hy;
  if (p.held === 'both') {
    [sx, sy] = shoulderPos(near ? SH_NEAR : SH_FAR, tor);
    {
      const tx = near ? W.nx : W.fx, ty = near ? W.ny : W.fy;
      [ex, ey] = ik(sx, sy, tx, ty, near ? p.eb : p.ebf);
      const L = Math.hypot(tx - ex, ty - ey) || 1;
      hx = ex + (tx - ex) / L * FORE; hy = ey + (ty - ey) / L * FORE;
    }
  } else [sx, sy, ex, ey, hx, hy] = fkArm(p, near, tor);
  const ir = near ? C.iron : C.ironF, ird = near ? C.ironD : C.ironFD;
  const sc = near ? C.sc : C.scD, scd = near ? C.scD : '#2b4844';
  if (!near) { ctx.save(); ctx.rotate(tor); pauldron(ctx, SH_FAR, true); ctx.restore(); }
  // upper arm: scaled, iron plate on the outside
  seg(ctx, sx, sy, ex, ey, (c) => capsule(c, UPPER, 23, 20), sc, scd, (c) => {
    c.fillStyle = ird; c.beginPath(); c.moveTo(-11.5, 6); c.lineTo(-4, 6); c.lineTo(-3, 34); c.lineTo(-10.5, 36); c.closePath(); c.fill();
    c.strokeStyle = near ? C.scL : C.scO; c.lineWidth = 1.2; c.beginPath();
    for (let y = 8; y < 36; y += 7) { c.moveTo(3, y); c.arc(5.5, y, 2.6, Math.PI, 0, true); }
    c.stroke();
    c.fillStyle = C.scO; c.globalAlpha = 0.5; c.beginPath(); ellipse(c, 0, 2, 11, 5, 0); c.fill(); c.globalAlpha = 1;   // under the pauldron
  });
  // forearm: iron vambrace with fins on the outer edge
  const gripped = p.held === 'both' || (p.held === 'near' && near) || (p.held === 'far' && !near);
  seg(ctx, ex, ey, hx, hy, (c) => {
    c.moveTo(-10, 0); c.lineTo(-15, -2); c.lineTo(-12, 7); c.lineTo(-18, 8); c.lineTo(-12, 16); c.lineTo(-17, 19); c.lineTo(-10, 26);
    c.lineTo(-8, FORE - 6); c.lineTo(8, FORE - 6); c.quadraticCurveTo(12, 16, 9.5, 0); c.quadraticCurveTo(0, -6, -10, 0); c.closePath();
  }, ir, ird, (c) => {
    c.beginPath(); c.moveTo(-8.5, FORE - 11); c.lineTo(8.5, FORE - 11); glowLine(c, 2.4, !near);
  });
  // elbow cop
  flat(ctx, (c) => { c.moveTo(ex + 7, ey); c.arc(ex, ey, 7, 0, TAU); }, near ? C.ironL : C.ironF, 2.6);
  // hand
  hand(ctx, hx, hy, ex, ey, gripped, near);
}
// a limb segment drawn along (x0,y0)->(x1,y1): shape built along +y
function seg(ctx, x0, y0, x1, y1, path, base, dark, detail) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(Math.atan2(-(x1 - x0), y1 - y0));
  celR(ctx, path, base, dark, { k: 1.8, lw: 3, detail });
  ctx.restore();
}
function hand(ctx, hx, hy, ex, ey, gripped, near) {
  ctx.save();
  ctx.translate(hx, hy);
  if (gripped) {
    // fist round the shaft, knuckles away from the elbow
    ctx.rotate(Math.atan2(W.dy, W.dx) - Math.PI / 2);
    const side = ((ex - hx) * -W.dy + (ey - hy) * W.dx) > 0 ? -1 : 1;     // knuckles on this local-x side
    ctx.scale(side, 1);
    cel(ctx, (c) => { c.moveTo(-9, -9); c.quadraticCurveTo(4, -12, 12, -7); c.quadraticCurveTo(16, 0, 12, 8); c.quadraticCurveTo(2, 12, -9, 9); c.closePath(); },
      near ? C.sc : C.scD, C.scD, { k: 1.2, lw: 2.8, detail: (c) => {
        c.strokeStyle = C.scL; c.lineWidth = 1.4; c.beginPath();
        c.moveTo(6, -6); c.lineTo(10, -5); c.moveTo(7, -1); c.lineTo(12.5, -1); c.moveTo(6, 4); c.lineTo(10.5, 4.5); c.stroke();
      } });
    flat(ctx, (c) => {
      for (const y of [-6, -1, 4]) { c.moveTo(12, y - 2); c.quadraticCurveTo(19, y - 1, 18, y + 4); c.quadraticCurveTo(15, y + 1, 12, y + 2); c.closePath(); }
    }, near ? C.claw : C.clawD, 1.8);
  } else {
    ctx.rotate(Math.atan2(-(hx - ex), hy - ey));
    cel(ctx, (c) => blob(c, [[-9, -4], [0, -7], [9, -3], [10, 6], [5, 13], [-4, 13], [-10, 6]], 0.55), near ? C.sc : C.scD, C.scD, { k: 1.2, lw: 2.8 });
    flat(ctx, (c) => {
      for (const x of [-5, 0, 5]) { c.moveTo(x - 2.4, 11); c.quadraticCurveTo(x, 17, x + 3, 20); c.quadraticCurveTo(x + 1.4, 15, x + 2.4, 11); c.closePath(); }
    }, near ? C.claw : C.clawD, 1.8);
  }
  ctx.restore();
}
function pauldron(ctx, s, far) {
  ctx.save();
  ctx.translate(s[0], s[1]);
  const ir = far ? C.ironF : C.iron, ird = far ? C.ironFD : C.ironD;
  flat(ctx, (c) => { c.moveTo(-16, -12); c.lineTo(-26, -36); c.lineTo(-4, -18); c.closePath(); c.moveTo(-2, -19); c.lineTo(-2, -42); c.lineTo(11, -17); c.closePath(); },
    far ? C.ironFD : C.ironL, 2.8);
  // lower lame, then the dome
  cel(ctx, (c) => { c.moveTo(-23, 8); c.quadraticCurveTo(-25, 20, -16, 24); c.quadraticCurveTo(0, 28, 17, 22); c.quadraticCurveTo(24, 16, 22, 6); c.closePath(); },
    ir, ird, { k: 1.2, lw: 3, detail: (c) => {
      c.beginPath(); c.moveTo(-19, 18); c.quadraticCurveTo(0, 23, 18, 17); glowLine(c, 2.4, far);
    } });
  celR(ctx, (c) => { c.moveTo(-27, 10); c.bezierCurveTo(-30, -14, -12, -24, 2, -24); c.bezierCurveTo(18, -24, 30, -12, 26, 10);
    c.quadraticCurveTo(0, 16, -27, 10); c.closePath(); },
    ir, ird, { k: 1.8, hi: far ? null : C.ironH, hk: 0.4, lw: 3.2, detail: (c) => {
      c.fillStyle = C.ironH; c.beginPath(); circle(c, -14, 2, 2); circle(c, 14, 2, 2); c.fill();
      if (!far) { c.strokeStyle = C.scratch; c.lineWidth = 1.1; c.beginPath(); c.moveTo(4, -16); c.lineTo(10, -11); c.moveTo(-12, -8); c.lineTo(-8, -3); c.stroke(); }
    } }, 2.21);
  ctx.restore();
}

// -------------------------------------------------- halberd (frame: origin at the butt, +y along the shaft)
function halberd(ctx, p) {
  ctx.save();
  ctx.translate(W.bx, W.by);
  const th = Math.atan2(-W.dx, W.dy);
  ctx.rotate(th);
  if (p.held === 'drop' && -Math.sin(th) > 0) ctx.scale(-1, 1);
  // shaft
  cel(ctx, (c) => { c.moveTo(-3.6, 6); c.lineTo(3.6, 6); c.lineTo(3.4, 200); c.lineTo(-3.4, 200); c.closePath(); }, C.wood, C.woodD, { k: 0.8, lw: 2.6 });
  // butt spike + iron bands
  flat(ctx, (c) => { c.moveTo(-4.6, 10); c.lineTo(4.6, 10); c.lineTo(3, 2); c.lineTo(0, -7); c.lineTo(-3, 2); c.closePath(); }, C.ironL, 2.4);
  cel(ctx, (c) => { c.moveTo(-4.4, 72); c.lineTo(4.4, 72); c.lineTo(4.4, 118); c.lineTo(-4.4, 118); c.closePath(); }, '#4c3b2c', '#33271d', { k: 0.6, lw: 2.2, detail: (c) => {
    c.strokeStyle = '#7a6248'; c.lineWidth = 1.1; c.beginPath();
    for (let y = 72; y < 118; y += 5) { c.moveTo(-4.4, y); c.lineTo(4.4, y + 4); c.moveTo(4.4, y + 1.5); c.lineTo(-4.4, y + 5.5); }
    c.stroke();
  } });
  flat(ctx, (c) => { for (const y of [64, 124]) { c.moveTo(-5, y); c.lineTo(5, y); c.lineTo(5, y + 6); c.lineTo(-5, y + 6); c.closePath(); } }, C.ironD, 2.2);
  ctx.beginPath(); ctx.moveTo(-5, 67); ctx.lineTo(5, 67); ctx.moveTo(-5, 127); ctx.lineTo(5, 127); glowLine(ctx, 1.8);
  // top spike
  cel(ctx, (c) => { c.moveTo(-5, 210); c.lineTo(0, 254); c.lineTo(5, 210); c.closePath(); }, C.ironL, C.ironD, { k: 0.7, lw: 2.6 });
  // back spike
  cel(ctx, (c) => { c.moveTo(3, 182); c.quadraticCurveTo(16, 186, 26, 198); c.quadraticCurveTo(14, 196, 3, 204); c.closePath(); }, C.iron, C.ironD, { k: 0.8, lw: 2.6 });
  // axe blade: crescent on the -x side, glowing green edge
  celR(ctx, (c) => {
    c.moveTo(-3, 178); c.lineTo(-16, 172); c.quadraticCurveTo(-26, 168, -36, 158);
    c.quadraticCurveTo(-52, 190, -36, 226); c.quadraticCurveTo(-26, 216, -16, 214); c.lineTo(-3, 208); c.closePath();
  }, C.iron, C.ironD, { k: 1.4, hi: C.ironH, hk: 0.4, lw: 3, detail: (c) => {
    c.beginPath(); c.moveTo(-37, 164); c.quadraticCurveTo(-49, 191, -37, 220); glowLine(c, 2.8);
    c.fillStyle = C.ironD; c.beginPath(); circle(c, -16, 193, 6); c.fill();
  } }, 1.82);
  // socket + gem
  cel(ctx, (c) => { c.moveTo(-6, 176); c.lineTo(6, 176); c.lineTo(6, 212); c.lineTo(-6, 212); c.closePath(); }, C.ironL, C.ironD, { k: 0.8, lw: 2.6 });
  flat(ctx, (c) => circle(c, -16, 193, 4.2), CUR ? C.gem : C.trimDull, 2);
  ctx.restore();
}

// -------------------------------------------------- legs (hip frame)
function leg(ctx, hip, a, s, footAbs, far) {
  const sc = far ? C.scD : C.sc, scd = far ? '#2b4844' : C.scD;
  const ir = far ? C.ironF : C.iron, ird = far ? C.ironFD : C.ironD;
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(-a * DEG);
  // thigh: scales + iron cuisse on the front
  celR(ctx, (c) => capsule(c, THIGH, 30, 24), sc, scd, { k: 1.8, lw: 3, detail: (c) => {
    c.fillStyle = C.scO; c.globalAlpha = far ? 0.7 : 0.45; c.beginPath(); ellipse(c, 0, 4, 16, 10, 0); c.fill(); c.globalAlpha = 1;
    c.strokeStyle = C.scL; c.lineWidth = 1.3; c.beginPath();
    for (let y = 4; y < THIGH; y += 8) { c.moveTo(-12, y); c.quadraticCurveTo(-8, y + 4, -4, y); }
    c.stroke();
  } }, 1.82);
  cel(ctx, (c) => { c.moveTo(-1, 2); c.lineTo(14, 0); c.quadraticCurveTo(17, 20, 13, 36); c.lineTo(0, 38); c.closePath(); }, ir, ird, { k: 1.2, lw: 2.6 });
  ctx.translate(0, THIGH);
  ctx.rotate(-s * DEG);
  // shin: iron greave
  celR(ctx, (c) => { c.moveTo(-11, 0); c.lineTo(11, 0); c.quadraticCurveTo(13, 22, 9, SHIN); c.lineTo(-9, SHIN); c.quadraticCurveTo(-12, 20, -11, 0); c.closePath(); },
    ir, ird, { k: 1.6, hi: far ? null : C.ironH, hk: 0.4, lw: 3, detail: (c) => {
      c.beginPath(); c.moveTo(-9, SHIN - 6); c.lineTo(9, SHIN - 6); glowLine(c, 2.2, far);
    } }, 1.82);
  // knee cop with a forward spike
  ctx.save(); ctx.rotate((s * 0.5) * DEG);
  cel(ctx, (c) => { c.moveTo(-10, -6); c.quadraticCurveTo(0, -14, 11, -6); c.lineTo(22, 0); c.lineTo(11, 6); c.quadraticCurveTo(0, 12, -10, 6); c.closePath(); },
    far ? C.ironF : C.ironL, ird, { k: 1, lw: 2.8 });
  ctx.restore();
  ctx.translate(0, SHIN);
  ctx.rotate((a + s - footAbs) * DEG);
  // clawed dragon foot: heel spur, three toes forward
  cel(ctx, (c) => {
    c.moveTo(-10, -6); c.lineTo(-16, 8); c.lineTo(-10, 6); c.lineTo(-10, FOOT); c.lineTo(28, FOOT);
    c.quadraticCurveTo(32, FOOT - 1, 31, FOOT - 6); c.quadraticCurveTo(24, -2, 10, -7); c.quadraticCurveTo(0, -9, -10, -6); c.closePath();
  }, sc, scd, { k: 1.2, lw: 3, detail: (c) => {
    c.strokeStyle = scd; c.lineWidth = 1.6; c.beginPath();
    c.moveTo(14, FOOT - 1); c.quadraticCurveTo(13, FOOT - 7, 16, FOOT - 10); c.moveTo(22, FOOT - 1); c.quadraticCurveTo(21, FOOT - 6, 24, FOOT - 8); c.stroke();
  } });
  flat(ctx, (c) => {
    for (const x of [18, 26, 33]) { c.moveTo(x - 4, FOOT - 5); c.quadraticCurveTo(x + 3, FOOT - 6, x + 5, FOOT + 1); c.quadraticCurveTo(x + 1, FOOT - 1, x - 3, FOOT); c.closePath(); }
  }, far ? C.clawD : C.claw, 2);
  ctx.restore();
}

// -------------------------------------------------- torso (torso frame: hip at 0,0, up = -y)
const TAB_HEM = [[34, 56], [28, 49], [23, 60], [17, 50], [11, 59], [6, 47], [1, 54]];
const PLATE = [[30, -52], [41, -70], [40, -88], [30, -101], [10, -108], [-14, -106], [-31, -94], [-37, -74], [-33, -56], [-4, -48]];
function torso(ctx, p) {
  const sw = Math.sin(T * 1.9) * 2;
  // back fauld
  celR(ctx, (c) => { c.moveTo(-30, -18); c.lineTo(-6, -18); c.lineTo(-8, 24); c.quadraticCurveTo(-22, 28, -34, 20); c.closePath(); }, C.ironF, C.ironFD, { k: 1.2, lw: 3 }, 1.4);
  ctx.save();
  if (p.chest) { ctx.translate(2, -62); ctx.scale(1 + 0.05 * p.chest, 1 + 0.035 * p.chest); ctx.translate(-2, 62); }
  // scaled body under the plate: belly plates in front
  cel(ctx, (c) => { c.moveTo(-32, -60); c.quadraticCurveTo(-36, -36, -30, -20); c.lineTo(34, -22); c.quadraticCurveTo(42, -44, 36, -62); c.closePath(); },
    C.sc, C.scD, { k: 2, lw: 3, detail: (c) => {
      c.fillStyle = C.bel; c.beginPath(); c.moveTo(4, -60); c.lineTo(36, -62); c.quadraticCurveTo(42, -44, 34, -22); c.lineTo(6, -22); c.closePath(); c.fill();
      c.strokeStyle = p.glow > 0.05 ? C.glow : C.belL; c.lineWidth = 1.6 + p.glow * 2; c.beginPath();
      for (const y of [-52, -43, -34]) { c.moveTo(6, y); c.quadraticCurveTo(22, y + 3, 40, y - 1); }
      c.stroke();
      c.fillStyle = C.belD; c.beginPath(); c.moveTo(30, -62); c.quadraticCurveTo(44, -44, 34, -22); c.lineTo(28, -22); c.quadraticCurveTo(36, -44, 26, -62); c.closePath(); c.fill();
      c.fillStyle = C.scO; c.globalAlpha = 0.6; c.beginPath(); ellipse(c, 4, -52, 40, 5, -0.05); ellipse(c, 4, -28, 40, 4, 0); c.fill(); c.globalAlpha = 1;
    } });
  celR(ctx, (c) => blob(c, PLATE, 0.5), C.iron, C.ironD, { k: 2.4, hi: C.ironH, hk: 0.35, lw: 3.4, detail: (c) => {
    c.strokeStyle = C.ironD; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(16, -106); c.quadraticCurveTo(30, -84, 22, -52); c.stroke();
    c.beginPath(); c.moveTo(-26, -97); c.quadraticCurveTo(4, -112, 33, -98); glowLine(c, 2.6);
    c.beginPath(); c.moveTo(-30, -60); c.quadraticCurveTo(10, -50, 38, -60); glowLine(c, 2.6);
    c.fillStyle = C.ironO; c.globalAlpha = 0.55; c.beginPath(); ellipse(c, -12, -70, 16, 7, 0.2); c.fill(); c.globalAlpha = 1;
    c.strokeStyle = C.scratch; c.lineWidth = 1.1; c.lineCap = 'round'; c.beginPath();
    c.moveTo(4, -92); c.lineTo(12, -86); c.moveTo(26, -76); c.lineTo(31, -69); c.moveTo(-20, -80); c.lineTo(-13, -77); c.moveTo(6, -70); c.lineTo(9, -63); c.stroke();
    c.fillStyle = C.ironH;
    for (const [x, y] of [[-22, -86], [30, -86], [-18, -64]]) { c.beginPath(); circle(c, x, y, 2); c.fill(); }
  } }, 2.21);
  ctx.restore();
  // front faulds
  cel(ctx, (c) => { c.moveTo(-14, -18); c.lineTo(12, -18); c.lineTo(10, 26); c.quadraticCurveTo(-2, 30, -14, 24); c.closePath(); }, C.iron, C.ironD,
    { k: 1.4, lw: 3, detail: (c) => { faulDetail(c, -14, 12); c.beginPath(); c.moveTo(-12, 20); c.quadraticCurveTo(-2, 24, 9, 21); glowLine(c, 2.2); } });
  cel(ctx, (c) => { c.moveTo(14, -18); c.lineTo(34, -20); c.lineTo(36, 20); c.quadraticCurveTo(25, 26, 14, 22); c.closePath(); }, C.iron, C.ironD,
    { k: 1.4, lw: 3, detail: (c) => { faulDetail(c, 14, 35); c.beginPath(); c.moveTo(16, 17); c.quadraticCurveTo(25, 21, 34, 16); glowLine(c, 2.2); } });
  // tabard hanging in front, tattered, with the Dragon King's sigil
  const tor = p.tor * DEG, ct = Math.cos(tor), st = Math.sin(tor);
  cel(ctx, (c) => {
    c.moveTo(2, -20); c.lineTo(32, -20);
    for (const [x, y] of TAB_HEM) {      // hem points, kept above the floor (torso frame -> body frame and back)
      const hx = x + sw + SEC.tab * (y / 56), bx = hx * ct - y * st, by = hx * st + y * ct;
      aboveFloor(bx, by, 2);
      c.lineTo(CX * ct + CY * st, -CX * st + CY * ct);
    }
    c.closePath();
  }, C.tab, C.tabD, { k: 1.4, lw: 2.8 });
  sigil(ctx, 17 + sw * 0.4, 14, 0.95);
  // belt
  cel(ctx, (c) => { c.moveTo(-34, -30); c.quadraticCurveTo(2, -25, 40, -32); c.lineTo(40, -16); c.quadraticCurveTo(2, -10, -33, -15); c.closePath(); },
    C.ironL, C.ironD, { k: 1, lw: 3 });
  cel(ctx, (c) => { c.moveTo(10, -30); c.lineTo(26, -31); c.lineTo(27, -14); c.lineTo(11, -13); c.closePath(); }, C.iron, C.ironD, { k: 0.8, lw: 2.6 });
  flat(ctx, (c) => circle(c, 18.5, -22, 3.6), CUR ? C.gem : C.trimDull, 2);
}
function faulDetail(c, x0, x1) {   // occlusion under the belt, two rivets
  c.fillStyle = C.ironO; c.globalAlpha = 0.6; c.fillRect(x0, -20, x1 - x0, 7); c.globalAlpha = 1;
  c.fillStyle = C.ironH; c.beginPath(); circle(c, x0 + 5, -6, 1.6); circle(c, x1 - 5, -6, 1.6); c.fill();
}
// the Dragon King's sigil: a green flame-crown
function sigil(ctx, x, y, k) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  if (CUR) { ctx.globalAlpha = 0.3; ctx.fillStyle = C.glow; ctx.beginPath(); ellipse(ctx, 0, -5, 19, 16); ctx.fill(); ctx.globalAlpha = 1; }
  flat(ctx, (c) => {
    c.moveTo(-11, 7); c.lineTo(-12, -3); c.quadraticCurveTo(-11, -9, -14, -14); c.quadraticCurveTo(-6, -10, -6, -4);
    c.quadraticCurveTo(-4, -12, 0, -19); c.quadraticCurveTo(4, -12, 6, -4); c.quadraticCurveTo(6, -10, 14, -14);
    c.quadraticCurveTo(11, -9, 12, -3); c.lineTo(11, 7); c.closePath();
  }, CUR ? C.trim : C.trimDull, 2.2 / k);
  ctx.fillStyle = CUR ? C.gemC : '#a9c2b6';
  ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(8, 4); ctx.lineTo(8, 1); ctx.lineTo(-8, 1); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// -------------------------------------------------- cape (hip frame, hangs from the shoulders)
function cape(ctx, p, tor) {
  const [ax, ay] = rot2(-8, -102, tor), [bx, by] = rot2(-36, -88, tor);
  const fl = SEC.cape, s1 = Math.sin(T * 1.7) * 3 + SEC.hem, s2 = Math.sin(T * 2.3 + 1) * 3 + SEC.hem * 0.6;
  const bot = 56 - fl * 46;
  aboveFloor(-60 - fl * 52 + s1, bot - fl * 22, 3);
  const qx = CX, qy = CY;
  celR(ctx, (c) => {
    c.moveTo(ax, ay); c.quadraticCurveTo(bx - 8, by - 6, bx - 6, by + 10);
    c.quadraticCurveTo(bx - 20 - fl * 30, (by + qy) / 2, qx, qy);
    // tattered hem
    const n = 6, rx = -6 + s2 * 0.6, ry = bot + 4;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      aboveFloor(lerp(qx, rx, u), lerp(qy, ry, u) + (i % 2 ? -10 : 2) + Math.sin(T * 2.6 + i) * 2, 2);
      c.lineTo(CX, CY);
    }
    c.lineTo(-8, -40); c.closePath();
  }, C.cape, C.capeD, { k: 2, lw: 3, detail: (c) => {
    // occlusion where it tucks behind the body, then folds that follow the flow (thin, dark local tone)
    c.fillStyle = C.capeO; c.globalAlpha = 0.6; c.beginPath(); ellipse(c, -16, -40, 12, 50, 0.1); c.fill(); c.globalAlpha = 1;
    c.strokeStyle = C.capeO; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath();
    c.moveTo(bx - 4, by + 18); c.quadraticCurveTo(bx - 12 - fl * 20, (by + qy) / 2 + 10, qx + 22, qy - 4);
    c.moveTo(-18, -60); c.quadraticCurveTo(-24 - fl * 16, -10, -30 - fl * 30 + s1, bot - 8 - fl * 14);
    c.moveTo(bx - 10, by + 30); c.quadraticCurveTo(bx - 24 - fl * 26, (by + qy) / 2 + 26, qx + 12 + s1 * 0.4, qy + 6); c.stroke();
    c.strokeStyle = C.capeL; c.lineWidth = 1.4; c.beginPath(); c.moveTo(bx - 2, by + 6); c.quadraticCurveTo(bx - 8, by + 30, bx - 16 - fl * 10, by + 54); c.stroke();
  } }, 2.21);
}

// -------------------------------------------------- wings (torso frame): folded on the back, `wo` spreads them
// points relative to the root: wrist, finger tips 1..3, trailing root; folded / open
const WFO = [-10, -42, -6, -2, -14, 10, -22, 20, -18, 14];
const WOP = [-30, -64, -2, -96, -50, -84, -76, -40, -30, 18];
const WG = new Float64Array(10), WR = [0, 0];
function wingVeins(c) {   // membrane veins + a lighter panel (only reads once the wing is open)
  c.fillStyle = 'rgba(160,220,200,0.18)'; c.beginPath(); c.moveTo(WG[0], WG[1]); c.lineTo(WG[2], WG[3]); c.lineTo(WG[4], WG[5]); c.closePath(); c.fill();
  c.strokeStyle = C.memD; c.lineWidth = 1.4; c.lineCap = 'round'; c.beginPath();
  for (const i of [2, 4]) {
    const mx = (WG[i] + WG[i + 2]) / 2, my = (WG[i + 1] + WG[i + 3]) / 2;
    c.moveTo(lerp(WG[0], mx, 0.2), lerp(WG[1], my, 0.2)); c.lineTo(lerp(WG[0], mx, 0.7), lerp(WG[1], my, 0.7));
  }
  c.stroke();
}
function wingPath(c) {
  c.moveTo(WR[0], WR[1]); c.lineTo(WG[0], WG[1]); c.lineTo(WG[2], WG[3]);
  for (let i = 2; i <= 6; i += 2) {
    const mx = (WG[i] + WG[i + 2]) / 2, my = (WG[i + 1] + WG[i + 3]) / 2;
    c.quadraticCurveTo(lerp(mx, WG[0], 0.3), lerp(my, WG[1], 0.3), WG[i + 2], WG[i + 3]);
  }
  c.closePath();
}
function wingFolded(ctx, p, far) {
  const rx = far ? -4 : -16, ry = far ? -92 : -86, o = clamp(p.wo, 0, 1), k = (far ? 0.9 : 1) * p.ws;
  // root rotation + flight beat (the far wing a touch ahead), finger tips trail on a spring (SEC.wing)
  const beat = p.wf ? p.wf * Math.sin(T * TAU * p.wfr + (far ? 0.25 : 0)) : 0;
  const ra = (p.wr + beat) * DEG, ta = ra + (SEC.wing - beat * 0.25) * DEG;
  for (let i = 0; i < 10; i += 2) {
    const ux = lerp(WFO[i], WOP[i], o) * k, uy = lerp(WFO[i + 1], WOP[i + 1], o) * k, aa = i ? ta : ra;
    const c = Math.cos(aa), s = Math.sin(aa);
    WG[i] = rx + ux * c - uy * s; WG[i + 1] = ry + ux * s + uy * c;
  }
  const mem = far ? C.memD : C.mem, memd = far ? '#244540' : C.memD;
  WR[0] = rx; WR[1] = ry;
  cel(ctx, wingPath, mem, memd, { k: 1.4, lw: 2.8, detail: o > 0.3 ? wingVeins : null });
  rim(ctx, wingPath, 2.8, 2);
  const bone = far ? C.scD : C.sc;
  const fingers = (c) => { for (const i of [2, 4, 6]) { c.moveTo(WG[0], WG[1]); c.lineTo(lerp(WG[0], WG[i], 0.96), lerp(WG[1], WG[i + 1], 0.96)); } };
  ink(ctx, (c) => { c.moveTo(rx, ry); c.lineTo(WG[0], WG[1]); }, 8.5);
  if (o > 0.15) ink(ctx, fingers, 5.4);
  ink(ctx, (c) => { c.moveTo(rx, ry); c.lineTo(WG[0], WG[1]); }, 4.4, bone);
  if (o > 0.15) ink(ctx, fingers, 2.4, bone);
  const wx = WG[0], wy = WG[1];
  flat(ctx, (c) => { c.moveTo(wx - 3, wy + 2); c.quadraticCurveTo(wx - 2, wy - 8, wx + 4, wy - 12); c.quadraticCurveTo(wx + 3, wy - 4, wx + 4, wy + 1); c.closePath(); },
    far ? C.clawD : C.claw, 2);
}

// -------------------------------------------------- tail (hip frame): thick, spiked, swaying
const TN = 10, TSEG = 13;
const SX = new Float64Array(TN + 1), SY = new Float64Array(TN + 1), SA = new Float64Array(TN + 1);
const AX = new Float64Array(TN + 1), AY = new Float64Array(TN + 1), BX = new Float64Array(TN + 1), BY = new Float64Array(TN + 1);
function tailHW(i) { return lerp(17, 4.5, i / TN); }
function tail(ctx, p) {
  let a = Math.PI - (66 - p.tl - SEC.tail) * DEG, x = TAIL_ROOT[0], y = TAIL_ROOT[1];
  for (let i = 0; i <= TN; i++) {
    if (i) {
      a += (9 + p.tc + p.tsw * 4 * Math.sin(T * 1.4 - i * 0.55) + SEC.whip * 0.25) * DEG;
      x += Math.cos(a) * TSEG; y += Math.sin(a) * TSEG;
      aboveFloor(x, y, tailHW(i) + 2);
      if (CX !== x || CY !== y) { x = CX; y = CY; a = Math.atan2(y - SY[i - 1], x - SX[i - 1]); }
    }
    SX[i] = x; SY[i] = y; SA[i] = a;
    const hw = tailHW(i), nx = -Math.sin(a) * hw, ny = Math.cos(a) * hw;
    AX[i] = x + nx; AY[i] = y + ny; BX[i] = x - nx; BY[i] = y - ny;
  }
  // dorsal spikes (A side = top when the tail points back)
  flat(ctx, (c) => {
    for (let i = 1; i < TN; i += 1.5) {
      const j = Math.floor(i), sa = SA[j], hw = tailHW(j), L = 13 - j * 0.6;
      const nx = -Math.sin(sa), ny = Math.cos(sa), ux = Math.cos(sa), uy = Math.sin(sa);
      const bx = SX[j] + nx * hw * 0.75, by = SY[j] + ny * hw * 0.75;
      c.moveTo(bx - ux * 5.5, by - uy * 5.5); c.lineTo(bx + nx * L - ux * 4.5, by + ny * L - uy * 4.5); c.lineTo(bx + ux * 5.5, by + uy * 5.5); c.closePath();
    }
  }, C.horn, 2.6);
  celR(ctx, tailPath, C.sc, C.scD, { k: 2, lw: 3.2, detail: (c) => {
    c.strokeStyle = C.bel; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i < TN; i++) { const xx = lerp(SX[i], BX[i], 0.62), yy = lerp(SY[i], BY[i], 0.62); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.stroke();
    c.strokeStyle = C.scL; c.lineWidth = 1.4; c.beginPath();
    for (let i = 1; i < TN; i++) { c.moveTo(lerp(SX[i], AX[i], 0.8), lerp(SY[i], AY[i], 0.8)); c.lineTo(lerp(SX[i], BX[i], 0.35), lerp(SY[i], BY[i], 0.35)); }
    c.stroke();
  } }, 2.21);
  // spiked tip
  ctx.save(); ctx.translate(SX[TN], SY[TN]); ctx.rotate(SA[TN]);
  flat(ctx, (c) => {
    c.moveTo(-4, -4); c.lineTo(16, 0); c.lineTo(-4, 4); c.closePath();
    c.moveTo(-6, -3); c.lineTo(4, -15); c.lineTo(2, -2); c.closePath();
    c.moveTo(-6, 3); c.lineTo(4, 15); c.lineTo(2, 2); c.closePath();
  }, C.horn, 2.4);
  cel(ctx, (c) => ellipse(c, -2, 0, 7, 6), C.sc, C.scD, { lw: 2.8 });
  ctx.restore();
}
function tailPath(c) {
  c.moveTo(AX[0], AY[0]);
  for (let i = 1; i < TN; i++) c.quadraticCurveTo(AX[i], AY[i], (AX[i] + AX[i + 1]) / 2, (AY[i] + AY[i + 1]) / 2);
  c.lineTo(AX[TN], AY[TN]);
  c.lineTo(BX[TN], BY[TN]);
  for (let i = TN - 1; i > 0; i--) c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[i - 1]) / 2, (BY[i] + BY[i - 1]) / 2);
  c.lineTo(BX[0], BY[0]);
  c.closePath();
}

// -------------------------------------------------- neck, collar, head (torso frame)
const H_UP = [[-14, -14], [-16, -30], [-8, -44], [8, -50], [24, -46], [34, -38], [46, -34], [58, -32], [66, -29], [70, -23], [68, -16],
  [56, -14], [40, -14], [22, -14], [8, -12], [-4, -8]];
const H_JAW = [[0, -12], [20, -12], [40, -12.5], [58, -14], [68, -16], [72, -11], [67, -4], [50, 0], [28, 2], [10, 1], [-2, -4]];
const HINGE = [4, -10];
const HELM = [[-18, -18], [-20, -34], [-11, -50], [6, -57], [22, -53], [34, -45], [41, -37.5], [33, -39], [24, -41.5], [14, -40.5],
  [2, -36], [-8, -27]];
function neckAndHead(ctx, p) {
  // thick neck with throat plates
  celR(ctx, (c) => { c.moveTo(-16, -94); c.quadraticCurveTo(-16, -114, -2, -130); c.lineTo(34, -126); c.quadraticCurveTo(40, -108, 34, -96); c.closePath(); },
    C.sc, C.scD, { k: 2, lw: 3, detail: (c) => {
      c.fillStyle = C.bel; c.beginPath(); c.moveTo(18, -128); c.lineTo(35, -126); c.quadraticCurveTo(41, -108, 35, -96); c.lineTo(20, -98); c.closePath(); c.fill();
      c.strokeStyle = p.glow > 0.05 ? C.glow : C.belL; c.lineWidth = 1.6 + p.glow * 2.2; c.beginPath();
      for (const y of [-118, -110, -102]) { c.moveTo(18, y); c.quadraticCurveTo(26, y + 2, 35, y - 1); }
      c.stroke();
      c.strokeStyle = C.scL; c.lineWidth = 1.3; c.beginPath();
      for (const [x, y] of [[-6, -116], [2, -108], [-8, -102], [6, -120]]) { c.moveTo(x + 3, y); c.arc(x, y, 3, 0, Math.PI); }
      c.stroke();
      c.fillStyle = C.scO; c.globalAlpha = 0.65; c.beginPath(); ellipse(c, 14, -128, 22, 6, -0.08); c.fill(); c.globalAlpha = 1;
    } }, 2.08);
  ctx.save();
  ctx.translate(NECK[0], NECK[1]);
  ctx.rotate(p.head * DEG);
  ctx.scale(HS, HS);
  head(ctx, p);
  ctx.restore();
}

function head(ctx, p) {
  const face = p.face, ja = p.jaw * DEG;
  // curled ram horn (far) peeking behind the helm
  ramHorn(ctx, 8, -46, true);
  // cheek spikes
  flat(ctx, (c) => { c.moveTo(-8, -14); c.lineTo(-26, -6); c.lineTo(-10, -6); c.closePath(); c.moveTo(-6, -6); c.lineTo(-20, 4); c.lineTo(-4, 0); c.closePath(); }, C.scD, 2.6 / HS);
  // mouth interior + jaw
  if (p.jaw > 1) mouthInside(ctx, p, ja);
  ctx.save();
  ctx.translate(HINGE[0], HINGE[1]); ctx.rotate(ja); ctx.translate(-HINGE[0], -HINGE[1]);
  cel(ctx, (c) => blob(c, H_JAW, 0.45), C.sc, C.scD, { k: 1.6, lw: 3 / HS, detail: (c) => {
    c.fillStyle = C.bel; c.beginPath(); ellipse(c, 34, 0.5, 30, 4.5, -0.03); c.fill();
  } });
  if (face === 'ko') flat(ctx, (c) => { c.moveTo(44, -10); c.quadraticCurveTo(60, -8, 58, 10); c.quadraticCurveTo(50, 14, 48, 0); c.closePath(); }, C.tongue, 2.2 / HS);
  ctx.restore();
  // upper fang
  flat(ctx, (c) => { c.moveTo(34, -15); c.lineTo(36, -5); c.lineTo(40, -15); c.closePath(); }, C.tooth, 2 / HS);
  // upper head
  celR(ctx, (c) => blob(c, H_UP, 0.5), C.sc, C.scD, { k: 2, hi: C.scH, hk: 0.35, lw: 3.2 / HS, detail: (c) => {
    c.strokeStyle = C.scL; c.lineWidth = 1.5; c.beginPath();
    for (const [x, y] of [[42, -26], [50, -24], [58, -22], [46, -20], [54, -18]]) { c.moveTo(x + 2.4, y - 1); c.arc(x, y, 2.6, -0.4, Math.PI * 0.6); }
    c.stroke();
    c.fillStyle = C.bel; c.beginPath(); c.moveTo(14, -14); c.quadraticCurveTo(40, -18, 66, -16); c.lineTo(66, -13); c.quadraticCurveTo(40, -13, 14, -11); c.closePath(); c.fill();
  } }, 2 / HS);
  // nostril (+ green smoke when the throat glows)
  ink(ctx, (c) => { c.moveTo(62, -27); c.quadraticCurveTo(66, -29, 67, -25); }, 2.4 / HS);
  if (p.glow > 0.05) {
    ctx.globalAlpha = 0.7 * p.glow; ctx.fillStyle = C.glow;
    for (let i = 0; i < 3; i++) { const u = (T * 1.5 + i / 3) % 1; ctx.beginPath(); circle(ctx, 68 + u * 10, -30 - u * 16, 2 + u * 3.5); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  // under-bite tusks (move with the jaw)
  ctx.save();
  ctx.translate(HINGE[0], HINGE[1]); ctx.rotate(ja); ctx.translate(-HINGE[0], -HINGE[1]);
  flat(ctx, (c) => { c.moveTo(61, -13); c.quadraticCurveTo(62, -22, 66, -27); c.quadraticCurveTo(67, -19, 67, -13); c.closePath();
    c.moveTo(50, -12); c.quadraticCurveTo(51, -18, 54, -21); c.quadraticCurveTo(55, -16, 55, -12); c.closePath(); }, C.tooth, 2.2 / HS);
  ctx.restore();
  // eye under the helm visor
  eye(ctx, p);
  // mouth corner: snarl or (freed) a gentle smile
  if (face === 'freed' || face === 'happy') {   // smile: the mouth line curls up into the cheek
    ink(ctx, (c) => { c.moveTo(36, -13.5); c.quadraticCurveTo(19, -12.6, 12, -20); c.moveTo(9.5, -23.5); c.quadraticCurveTo(10, -21, 13.5, -19.6); }, 3 / HS);
  } else if (face === 'worried') ink(ctx, (c) => { c.moveTo(30, -13); c.quadraticCurveTo(14, -12, 8, -6); }, 2.8 / HS);
  else if (face === 'neutral' || !CUR) ink(ctx, (c) => { c.moveTo(24, -13); c.quadraticCurveTo(12, -12.5, 6, -14); }, 2.6 / HS);
  else ink(ctx, (c) => { c.moveTo(12, -12); c.quadraticCurveTo(5, -11, 2, -7); }, 2.6 / HS);
  // helm with crest spikes + near ram horn
  flat(ctx, (c) => {
    c.moveTo(-10, -48); c.lineTo(-24, -72); c.lineTo(-1, -54); c.closePath();
    c.moveTo(2, -55); c.lineTo(-2, -82); c.lineTo(14, -56); c.closePath();
    c.moveTo(15, -54); c.lineTo(20, -74); c.lineTo(27, -50); c.closePath();
  }, C.ironH, 2.8 / HS);
  celR(ctx, (c) => blob(c, HELM, 0.42), C.iron, C.ironD, { k: 1.8, hi: C.ironH, hk: 0.4, lw: 3.2 / HS, detail: (c) => {
    c.beginPath();
    c.moveTo(-16, -21); c.quadraticCurveTo(-8, -30, 2, -38.5); c.quadraticCurveTo(14, -43, 24, -44); c.quadraticCurveTo(32, -42, 38, -39.5); glowLine(c, 2.6 / HS);
    c.fillStyle = C.ironH; c.beginPath(); circle(c, -8, -40, 1.8); circle(c, 8, -48, 1.8); c.fill();
  } }, 2.1 / HS);
  ramHorn(ctx, 2, -40, false);
}

// ram horn: a tapered spiral curling back and down from (x, y)
const RH = 9, RSEG = 6.4;
const RX = new Float64Array(RH + 1), RY = new Float64Array(RH + 1), RA = new Float64Array(RH + 1);
function ramHorn(ctx, x0, y0, far) {
  let a = Math.PI + 0.55, x = x0, y = y0;
  for (let i = 0; i <= RH; i++) {
    if (i) { a -= 0.5; x += Math.cos(a) * RSEG * (1 - i * 0.04); y += Math.sin(a) * RSEG * (1 - i * 0.04); }
    RX[i] = x; RY[i] = y; RA[i] = a;
  }
  const hw = (i) => lerp(7, 2, i / RH);
  cel(ctx, (c) => {
    for (let i = 0; i <= RH; i++) { const px = RX[i] - Math.sin(RA[i]) * hw(i), py = RY[i] + Math.cos(RA[i]) * hw(i); i ? c.lineTo(px, py) : c.moveTo(px, py); }
    for (let i = RH; i >= 0; i--) c.lineTo(RX[i] + Math.sin(RA[i]) * hw(i), RY[i] - Math.cos(RA[i]) * hw(i));
    c.closePath();
  }, far ? C.hornD : C.horn, C.hornD, { k: 1, lw: 2.8 / HS, detail: (c) => {
    c.strokeStyle = C.hornL; c.lineWidth = 1.4; c.beginPath();
    for (let i = 1; i < RH; i++) {
      c.moveTo(RX[i] - Math.sin(RA[i]) * hw(i), RY[i] + Math.cos(RA[i]) * hw(i)); c.lineTo(RX[i] + Math.sin(RA[i]) * hw(i), RY[i] - Math.cos(RA[i]) * hw(i));
    }
    c.stroke();
  } });
}

function mouthInside(ctx, p, ja) {
  const c0 = Math.cos(ja), s0 = Math.sin(ja);
  const jx = HINGE[0] + (68 - HINGE[0]) * c0 - (-14 - HINGE[1]) * s0, jy = HINGE[1] + (68 - HINGE[0]) * s0 + (-14 - HINGE[1]) * c0;
  const fire = p.face === 'breath' && p.glow > 0.05;
  ctx.beginPath();
  ctx.moveTo(HINGE[0] - 4, HINGE[1] - 2); ctx.lineTo(68, -15); ctx.quadraticCurveTo(jx + 6, (jy - 15) / 2, jx, jy); ctx.closePath();
  ctx.fillStyle = fire ? C.gemD : C.mouth; ctx.fill();
  ctx.lineWidth = 2.6 / HS; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.save(); ctx.clip();
  if (fire) {
    const g = clamp(p.glow, 0, 1), fl = 0.9 + 0.1 * Math.sin(T * 29), my = (jy - 15) / 2 + 2;
    ctx.fillStyle = C.gem; ctx.beginPath(); ellipse(ctx, 40, my, 30 * g * fl, (5 + p.jaw * 0.3) * g, ja * 0.5); ctx.fill();
    ctx.fillStyle = C.gemC; ctx.beginPath(); ellipse(ctx, 46, my, 18 * g * fl, (2 + p.jaw * 0.14) * g, ja * 0.5); ctx.fill();
  } else {
    ctx.fillStyle = C.tongue; ctx.beginPath(); ellipse(ctx, 34 + 6 * s0, -8 + 14 * s0, 20, 5, ja * 0.6); ctx.fill();
    // teeth rows
    ctx.fillStyle = C.tooth; ctx.beginPath();
    for (let x = 22; x < 62; x += 8) { ctx.moveTo(x, -15); ctx.lineTo(x + 3, -9); ctx.lineTo(x + 6, -15); }
    for (let x = 24; x < 60; x += 8) {
      const bx = HINGE[0] + (x - HINGE[0]) * c0 - (-12 - HINGE[1]) * s0, by = HINGE[1] + (x - HINGE[0]) * s0 + (-12 - HINGE[1]) * c0;
      ctx.moveTo(bx, by); ctx.lineTo(bx + 3 * c0 + 6 * s0, by + 3 * s0 - 6 * c0); ctx.lineTo(bx + 6 * c0, by + 6 * s0);
    }
    ctx.fill();
  }
  ctx.restore();
  if (fire) {   // flames licking out of the mouth
    const g = clamp(p.glow, 0, 1), mx = 70, my = (jy - 15) / 2;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ja * 0.5);
    for (let i = 0; i < 3; i++) {
      const ph = T * 13 + i * 2.1, L = (10 + 10 * g) * (0.75 + 0.25 * Math.sin(ph)), off = (i - 1) * 5 * g;
      flat(ctx, (c) => { c.moveTo(-2, off - 4 * g); c.quadraticCurveTo(L * 0.6, off - 5 * g + Math.sin(ph) * 2, L, off + Math.sin(ph * 1.3) * 2);
        c.quadraticCurveTo(L * 0.5, off + 4.5 * g, -2, off + 4 * g); c.closePath(); }, i === 1 ? C.gemC : C.gem, 0 / HS);
    }
    ctx.restore();
  }
}

function eye(ctx, p) {
  const face = p.face, x = 30, y = -33, rx = 6.4, ry = 5.6;
  if (face === 'ouch' || (p.blink && face !== 'ko' && face !== 'dazed')) {
    ink(ctx, (c) => { c.moveTo(x - 6, y - 4); c.lineTo(x + 3, y); c.lineTo(x - 6, y + 4); }, 3 / HS);
    return;
  }
  if (face === 'ko' || face === 'dazed') {
    flat(ctx, (c) => ellipse(c, x, y, rx + 0.5, ry + 1), C.eyeW, 2.6 / HS);
    ink(ctx, (c) => {
      for (let a = 0; a < 4 * Math.PI; a += 0.35) { const r = 5 * a / (4 * Math.PI), aa = a + T * 5; a ? c.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r) : c.moveTo(x, y); }
    }, 1.8 / HS);
    return;
  }
  if (face === 'happy') {   // closed, smiling eye: an arc under the visor with a cheek crease
    ink(ctx, (c) => { c.moveTo(x - 6.5, y + 1.5); c.quadraticCurveTo(x, y - 6, x + 6.5, y + 1.5); }, 3 / HS);
    ink(ctx, (c) => { c.moveTo(x - 3, y + 6); c.quadraticCurveTo(x + 1, y + 7.5, x + 5, y + 6); }, 1.6 / HS);
    return;
  }
  const freed = face === 'freed' || !CUR;
  const wide = face === 'roar' || face === 'breath' || face === 'surprised';
  // lid line: angry slant (low at the front); calm when allied; worried slants the other way; surprised opens wide
  let slant = freed ? -0.05 : 0.45, drop = freed ? 3.6 : (wide ? 0.6 : 2.2);
  if (face === 'neutral' || (face === 'mean' && !CUR)) { slant = 0.12; drop = 1.8; }
  else if (face === 'worried') { slant = -0.42; drop = 1.6; }
  else if (face === 'surprised') { slant = 0; drop = -1.4; }
  const ly0 = y - ry + drop - slant * rx * 1.3, ly1 = y - ry + drop + slant * rx * 1.3;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x - rx - 3, ly0); ctx.lineTo(x + rx + 3, ly1); ctx.lineTo(x + rx + 3, y + ry + 4); ctx.lineTo(x - rx - 3, y + ry + 4); ctx.closePath();
  ctx.clip();
  flat(ctx, (c) => ellipse(c, x, y, rx, ry), freed ? C.eyeW : '#d9ffd0', 0);
  ctx.save(); ctx.beginPath(); ellipse(ctx, x, y, rx, ry); ctx.clip();
  if (freed) {
    const ps = face === 'surprised' ? 0.7 : 1;
    ctx.fillStyle = C.goldD; ctx.beginPath(); circle(ctx, x + 1.4, y + 0.6, 4.4 * ps); ctx.fill();
    ctx.fillStyle = C.gold; ctx.beginPath(); circle(ctx, x + 1.4, y + 1.2, 3.3 * ps); ctx.fill();
    ctx.fillStyle = C.pupil; ctx.beginPath(); ellipse(ctx, x + 1.4, y + 0.6, 1.3 * ps, 3.3 * ps); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, x - 0.2, y - 1.2, 1.2); ctx.fill();
  } else {
    const pl = 0.85 + 0.15 * Math.sin(T * 7);
    ctx.fillStyle = C.gemD; ctx.beginPath(); ellipse(ctx, x + 1, y + 0.5, rx * 0.86, ry * 0.86); ctx.fill();
    ctx.fillStyle = C.gem; ctx.beginPath(); ellipse(ctx, x + 1, y + 0.5, rx * 0.6 * pl, ry * 0.6 * pl); ctx.fill();
    ctx.fillStyle = C.gemC; ctx.beginPath(); ellipse(ctx, x + 1, y + 0.5, rx * 0.28 * pl, ry * 0.3 * pl); ctx.fill();
  }
  ctx.restore();
  ink(ctx, (c) => ellipse(c, x, y, rx, ry), 2.6 / HS);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ellipse(ctx, x, y, rx + 1.4, ry + 1.4); ctx.clip();
  ink(ctx, (c) => { c.moveTo(x - rx - 3, ly0); c.lineTo(x + rx + 3, ly1); }, 2.8 / HS);
  ctx.restore();
}

// -------------------------------------------------- the cursed collar (torso frame, round the neck base)
function collar(ctx, p) {
  ctx.save();
  ctx.translate(16, -106);
  ctx.rotate((-16 + p.head * 0.2) * DEG);
  drawCollarShape(ctx, p.crack);
  ctx.restore();
}
/** The collar on its own (for the engine to drop it when he is freed): drawCollar(ctx, { scale, crack, t, rot }). */
export function drawCollar(ctx, o = {}) {
  T = o.t ?? T;
  ctx.save();
  ctx.scale(o.scale || 1, o.scale || 1);
  if (o.rot) ctx.rotate(o.rot);
  drawCollarShape(ctx, o.crack ?? 1);
  ctx.restore();
}
function drawCollarShape(ctx, crack) {
  const L = 27, H = 8, B = 4;
  flat(ctx, (c) => {
    for (const [x, a, l] of [[-L - 2, Math.PI, 15], [-L * 0.55, -Math.PI / 2 - 0.4, 14], [0, -Math.PI / 2, 15], [L * 0.55, -Math.PI / 2 + 0.4, 13],
      [-L * 0.3, Math.PI / 2 + 0.3, 11], [L * 0.3, Math.PI / 2 - 0.3, 11]]) {
      const bow = B * (1 - (x / L) * (x / L));
      const y = a === Math.PI ? 0 : (Math.sin(a) < 0 ? -H + bow * 0.5 + 1 : H + bow - 1);
      const ux = Math.cos(a), uy = Math.sin(a);
      c.moveTo(x - uy * 5, y + ux * 5); c.lineTo(x + ux * l, y + uy * l); c.lineTo(x + uy * 5, y - ux * 5); c.closePath();
    }
  }, C.ironL, 2.6);
  cel(ctx, (c) => {
    c.moveTo(-L, -H); c.quadraticCurveTo(0, -H + B * 2, L, -H); c.quadraticCurveTo(L + 5, 0, L, H);
    c.quadraticCurveTo(0, H + B * 2, -L, H); c.quadraticCurveTo(-L - 5, 0, -L, -H); c.closePath();
  }, C.iron, C.ironD, { k: 1.2, hi: C.ironH, hk: 0.45, lw: 3, detail: (c) => {
    c.fillStyle = C.ironH; c.beginPath(); circle(c, -L * 0.7, 1, 2); circle(c, -L * 0.25, 2.5, 2); c.fill();
  } });
  const gx = L * 0.5, gy = 2.5, pulse = 0.7 + 0.3 * Math.sin(T * 4.4);
  const live = 1 - 0.75 * clamp(crack, 0, 1);
  const gw = 12, gh = 14.5;
  if (live > 0.5) {   // glow: translucent halo + ring (no blur)
    ctx.globalAlpha = 0.3 * pulse; ctx.fillStyle = C.glow; ctx.beginPath(); circle(ctx, gx, gy, 21); ctx.fill();
    ctx.globalAlpha = 0.55 * pulse; ctx.strokeStyle = C.glow; ctx.lineWidth = 2.5; ctx.beginPath(); circle(ctx, gx, gy, 17 + 2 * pulse); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  flat(ctx, (c) => { c.moveTo(gx - gw, gy); c.lineTo(gx, gy - gh); c.lineTo(gx + gw, gy); c.lineTo(gx, gy + gh); c.closePath(); }, live > 0.5 ? C.gem : '#2f8f4a', 3);
  ctx.globalAlpha = live;
  ctx.fillStyle = C.gemD; ctx.beginPath(); ctx.moveTo(gx + gw - 2.5, gy); ctx.lineTo(gx, gy + gh - 3); ctx.lineTo(gx - 1.5, gy + 1.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.gemC; ctx.beginPath(); ctx.moveTo(gx - gw + 3, gy - 0.6); ctx.lineTo(gx, gy - gh + 3.5); ctx.lineTo(gx + 1.5, gy - 1.5); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  if (live > 0.4) twinkle(ctx, gx + gw * 0.6, gy - gh * 0.6, 3.6 + 3 * pulse);
  if (crack > 0.02) {
    ink(ctx, (c) => {
      c.moveTo(gx - 1, gy - gh + 1); c.lineTo(gx + 2, gy - 4); c.lineTo(gx - 2.5, gy + 1); c.lineTo(gx + 1, gy + gh - 1);
      if (crack > 0.4) { c.moveTo(gx + 2, gy - 4); c.lineTo(gx + gw - 2, gy - 1); c.moveTo(gx - 2.5, gy + 1); c.lineTo(gx - gw + 2, gy + 2.5); }
      if (crack > 0.75) { c.moveTo(-L * 0.15, -H + B); c.lineTo(-L * 0.05, -1); c.lineTo(-L * 0.2, 3); c.lineTo(-L * 0.08, H + B); }
    }, 2);
  }
}
function twinkle(ctx, x, y, r) {
  ctx.fillStyle = C.gemC;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.6); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r * 1.6);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r * 1.6); ctx.closePath();
  ctx.fill();
}

// -------------------------------------------------- motion smear: crescent, optionally squashed into a flat ellipse
function smear(ctx, p) {
  const a0 = p.sa0, a1 = p.sa1, R = p.sr, n = 22;
  ctx.save();
  ctx.translate(p.scx, p.scy);
  ctx.scale(1, p.sf);
  ctx.globalAlpha = clamp(p.smear, 0, 1) * 0.85;
  const pt = (a, r) => [Math.sin(a * DEG) * r, Math.cos(a * DEG) * r];
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const [x, y] = pt(a0 + (a1 - a0) * (i / n), R + 8); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  for (let i = n; i >= 0; i--) {
    const u = i / n, th = (3 + 34 * Math.pow(u, 1.4)) / Math.max(0.3, p.sf * 0.8 + 0.2);
    const [x, y] = pt(a0 + (a1 - a0) * u, R + 8 - th);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = CUR ? '#e9ffe9' : '#fffaf0'; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}
