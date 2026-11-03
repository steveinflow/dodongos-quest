// FINAL BOSS: THE DRAGON KING (+ his tiny form).  Art (drawn in code) + pose library.
//
// A huge, pompous old dragon (~340 px to the top of the crown at scale 1, standing on two legs): dark purple-black
// scales with a gold belly, a magnificent glowing EMBER CROWN (black-gold band, flame-shaped points tipped with green
// flame-gems, a great green heart-gem -- the source of his power), a crimson-and-ermine royal mantle over his
// shoulders trailing a train, gold rings on his claws, a long smoky beard and whiskers, glowing green eyes under
// theatrical brows, ivory swept-back horns, bat wings folded high like a collar, a long spiked tail.
// When the crown shatters (defeated) he SHRINKS, in puffs of smoke, into a ~45 px furious little dragon
// (`tiny*` poses) that the heroes pop into a golden birdcage (drawBirdcage).
//
// Local space as for the other rigs: origin on the floor between his feet, +x = facing, y down; limb angles in
// degrees, + = swung forward.  `air: true` = no ground solve, hip at AIR_HIP + pose.y (throne, hover, dive).
// Exports: draw, ANIM, BASE, mouthOf(pose) -> [x, y, angle], crownOf(pose), measure(pose), drawThrone(ctx, t, o),
// drawBirdcage(ctx, t, o), THRONE_SEAT_Y, CAGE, HEIGHT, TINY_HEIGHT, HURTBOX, HURTBOX_AIR, TINY_HURTBOX, BREATH_MOUTH,
// CLAW_POINT, STOMP_POINT, CROWN_IDLE, CROWN_SUMMON; for the 3D sprites (dragonking3d.js): drawFx(ctx, pose, o, points) (the
// 2D effects at given landmarks: crown cracks / blaze, jaw fire, stars, dust, speed lines), drawDefeatFx, drawThroneLive.
// Loops take t: throne, idle, hover, dive, roar, tinyIdle,
// tinyCaged, tinyTalk; walk takes ph; the rest take k.  `defeated` draws the shatter + shrink itself (flash, crown
// shards, smoke puffs) and ends on the tiny form standing at the origin.
import { cel, flat, ink, capsule, blob, ellipse, circle, keys, mix, DEG, TAU, legDrop, clamp, lerp, follow, ease } from '../rig.js';
import { INK } from '../config.js';

const C = {
  sc: '#4d356b', scD: '#30204a', scH: '#8466b0', scL: '#3d2a58', scF: '#3a2853', scFD: '#221630',
  bel: '#f2c04c', belD: '#b77c22', belH: '#ffe7a6', belL: '#c98b25',
  gold: '#f5c745', goldD: '#a7701a', goldH: '#fff4b8', goldF: '#c99634',
  blk: '#2d2436', blkD: '#17111e', blkH: '#6a5c80',
  gem: '#62ff8c', gemD: '#12a443', gemC: '#eaffdf', glow: '#5cff7e', fire: '#b6ff9a',
  red: '#c0263a', redD: '#7a1424', redH: '#e75668', redL: '#4e0b18',
  erm: '#fbf7f0', ermD: '#d9cfe3', spot: '#1e1622',
  horn: '#cbb68a', hornD: '#93805a', hornL: '#7a6847',
  mem: '#6b4892', memD: '#432a60', memF: '#4f3570', memFD: '#2f1d45',
  smoke: '#b9acd0', smokeD: '#9384ae', smokeL: '#64557f',
  claw: '#f2ead2', clawD: '#bdae88',
  mouth: '#3a1022', tongue: '#d6577a', tooth: '#fffaf0',
  ruby: '#ff4d6a', rubyD: '#a3122e',
  rim: '#e4d9ff', star: '#ffe45c', puff: '#efe9f6', puffD: '#b9adcc',
};

// ---------------------------------------------------------------- skeleton (px at scale 1)
const THIGH = 46, SHIN = 42, FOOT = 15;
const UPPER = 48, FORE = 44;
const HIP_N = [-12, 4], HIP_F = [14, 0];
const SH_N = [-6, -104], SH_F = [20, -108];
const NECK0 = [30, -110];               // neck base (torso frame)
const NECKL = 50;                       // neck length (base -> head joint)
const HS = 1.3;                        // head scale (line widths divided back)
const TAIL_ROOT = [-30, 4];
const AIR_HIP = -98;                    // hip height of air poses (pose.y offsets it)
const WROOT = [-20, -98];               // wing root (torso frame)
const RIG = 0.88;                       // overall size trim (keeps the tuned pose numbers)

// ---------------------------------------------------------------- poses
// tor: torso lean (+ forward), nk: neck lean (deg from vertical, + forward), head: head tilt (+ chin down), jaw.
// Arms: au/af near (upper, forearm rel), ah hand shape; bu/bf/bh far.  Hands: 'open' | 'fist' | 'point' | 'claw' | 'rest'.
// wo: wings open 0..1, wf: wing flap (deg, + = raised), tl/tc/tsw: tail lift/curl/sway, mf: mantle flare 0..1,
// belly: breath swell, glow: green fire in the throat, blaze: crown blaze 0..1, crack: crown crack 0..1,
// smear (claw crescent: sa0/sa1 deg, sr radius, scx/scy centre in the torso frame, sf vertical squash),
// armFront: draw the near arm over the head, seat: sitting (thighs on the throne), stars: dizzy stars.
export const BASE = {
  x: 0, y: 0, rot: 0, sq: 1, tor: -4, nk: 22, head: -8, jaw: 0,
  nt: -10, ns: -18, nf: 0, ft: 14, fs: -20, ff: 0,
  au: 16, af: 40, ah: 'rest', bu: 24, bf: 36, bh: 'rest',
  wo: 0, wf: 0, tl: 0, tc: 0, tsw: 1, mf: 0, belly: 0, glow: 0, blaze: 0, crack: 0,
  smear: 0, sa0: 0, sa1: 0, sr: 120, scx: 20, scy: -100, sf: 1,
  armFront: false, legFront: false, stars: false, crownOff: false, glint: 0, cslip: 0, nl: 1, fire: 0, gather: 0, sdust: 0, speed: 0, stream: 0,
  face: 'sneer', air: false, blink: false,
};
const P = (o) => Object.assign({}, BASE, o);

const IDLE = P({});
const SEAT = { air: true, y: 38, nt: 84, ns: -84, nf: 0, ft: 92, fs: -98, ff: 0 };
const THRONE = P({ ...SEAT, tor: -16, nk: 18, head: 4, au: 18, af: 124, ah: 'rest', bu: -20, bf: 70, nt: 96, ns: -46, ft: 86, fs: -104,
  tl: -14, tc: 3, tsw: 0.6, wo: 0.1, face: 'smug' });
const STAND_UP = P({ tor: -10, nk: 6, head: -16, au: 70, af: 30, ah: 'open', bu: 80, bf: 20, bh: 'open', mf: 0.7, belly: 1, wo: 0.25, face: 'grin' });
const CROUCH = P({ tor: 22, nk: 30, head: 10, nt: 40, ns: -84, ft: 50, fs: -80, au: -20, af: 50, bu: -10, bf: 40, ah: 'claw', bh: 'claw',
  wo: 0.8, wf: 30, mf: 0.3, tl: 10, face: 'furious' });
const HOVER = P({ air: true, y: 0, tor: 6, nk: 18, head: -4, nt: 30, ns: -66, nf: 56, ft: 42, fs: -78, ff: 62,
  au: 40, af: 60, ah: 'claw', bu: 50, bf: 50, bh: 'claw', wo: 1, tl: -10, tc: 4, mf: 0.5, face: 'grin' });
const CWIND = P({ x: -10, tor: -24, nk: -8, head: -14, nt: -26, ns: -22, ft: 32, fs: -34, au: 218, af: 16, ah: 'open', bu: 4, bf: 40,
  wo: 0.35, wf: 10, mf: 0.25, tl: 16, face: 'furious', armFront: true, glint: 1 });
const CHIT = P({ x: 18, tor: 16, nk: 6, head: -22, jaw: 20, nt: -30, ns: -10, ft: 40, fs: -60, au: 68, af: 4, ah: 'claw', bu: -20, bf: 40,
  wo: 0.2, mf: 0.6, tl: -8, face: 'roar', smear: 1, sa0: 204, sa1: 50, sr: 130, scx: -6, scy: -100, sf: 0.92, armFront: true });
const BWIND = P({ x: -8, tor: -20, nk: -22, head: -30, jaw: 14, belly: 2.4, glow: 1, nt: -18, ns: -24, ft: 26, fs: -36, au: 6, af: 24, ah: 'fist',
  bu: 12, bf: 26, bh: 'fist', wo: 0.5, wf: 20, mf: 0.2, tl: 16, face: 'breath' });
const SWIND = P({ x: -8, tor: -22, nk: 8, head: -10, nt: 104, ns: -112, nf: 16, ft: 12, fs: -14, au: 222, af: -24, ah: 'fist', bu: 150, bf: 36, bh: 'fist',
  wo: 0.6, wf: 26, mf: 0.4, tl: 18, face: 'furious', armFront: true, legFront: true });
// cowering, neck pulled in like a turtle, hands slapped to his cheeks in horror (crownCrack -> defeated)
const CLUTCH = P({ x: -8, tor: 4, nk: 0, nl: 0.5, head: -8, jaw: 22, au: 52, af: 92, ah: 'open', bu: 64, bf: 92, bh: 'open', armFront: true,
  nt: -18, ns: -40, ft: 24, fs: -46, mf: 0.15, tl: 6, tsw: 2.4, wo: 0.15, face: 'aghast' });
const SHIT = P({ x: 6, sq: 0.9, tor: 20, nk: 20, head: 14, jaw: 16, nt: 34, ns: -34, ft: -16, fs: -30, au: -30, af: 40, ah: 'fist', bu: -10, bf: 30, bh: 'fist',
  wo: 0.2, wf: -10, mf: 0.8, tl: -14, face: 'roar' });

export const ANIM = {
  // seated on the throne, lounging; every ~6 s he admires the rings on his claws
  throne(t) {
    const b = Math.sin(t * 1.8), cyc = t % 6.4, adm = cyc > 4.6 ? Math.sin((cyc - 4.6) / 1.8 * Math.PI) : 0;
    const drum = cyc > 1.5 && cyc < 3 && Math.sin(t * 26) > 0;          // drums his claws on the armrest, bored
    const p = P(Object.assign({}, THRONE, { tor: -16 + b * 2, nk: 18 + b, head: 4 - b * 2.5 + adm * 14, belly: 0.4 + 0.5 * b,
      au: 18 + adm * 50, af: 124 + adm * 10 + (drum ? 6 : 0), ah: adm > 0.3 || drum ? 'open' : 'rest',
      tl: -14 + 5 * Math.sin(t * 0.9), tsw: 0.8, face: adm > 0.3 ? 'grin' : 'smug' }));
    p.blink = (t % 4.6) > 4.48;
    return p;
  },
  // stands up from the throne, mantle sweeping (50 f)
  throneRise: (k) => keys(k, [
    [0, THRONE],
    [0.28, P(Object.assign({}, THRONE, { tor: 14, nk: 20, head: 6, au: 10, af: 30, ah: 'open', bu: 20, bf: 30, bh: 'open', face: 'grin', mf: 0.1 })), 'io'],
    [0.5, P({ air: true, y: 14, nt: 40, ns: -60, ft: 50, fs: -66, tor: 16, nk: 20, head: 0, au: 30, af: 20, ah: 'open', bu: 30, bf: 20, bh: 'open',
      mf: 0.9, wo: 0.2, face: 'grin' }), 'out'],
    [0.62, P(Object.assign({}, STAND_UP, { air: true, y: 0 }))],
    [0.6201, STAND_UP],
    [0.8, P(Object.assign({}, STAND_UP, { tor: -12, head: -18, mf: 0.4, au: 84, bu: 90 })), 'out'],
    [1, IDLE],
  ]),
  // pompous stance: chest out, chin up, breathing, tail sway; every ~5 s he strokes his beard smugly
  idle(t) {
    const b = Math.sin(t * 1.9), w = Math.sin(t * 0.8), cyc = t % 5.4, fid = cyc > 4 ? Math.sin((cyc - 4) / 1.4 * Math.PI) : 0;
    const p = P({ tor: -4 + b * 1.2, nk: 14 + w * 2, head: -6 - b * 1.5 + fid * 6, belly: 0.4 + 0.4 * b,
      nt: -10 + w * 2, ns: -18 - b * 2, ft: 14 - w * 2, fs: -20 - b * 2,
      au: 16 + fid * 70, af: 40 + fid * 70, ah: fid > 0.3 ? 'open' : 'rest', bu: 24 - b * 2, bf: 36 + b * 3,
      tl: 3 * b, wf: 2 * b, face: fid > 0.3 ? 'grin' : 'sneer' });
    p.blink = (t % 4.2) > 4.08;
    return p;
  },
  // heavy, pompous stride: chest out, arms swinging grandly, the body rolling side to side
  walk(ph) {
    const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU), a = Math.abs(s);
    // a proud high-stepping march: the swing knee comes up high with the toes pointed, chin up, chest out, the body
    // rising on the passing pose and settling heavily on each contact
    const ln = Math.max(0, c), lf = Math.max(0, -c);
    return P({ tor: -8 + 2 * a, nk: 12 + 3 * a, head: -10 - 5 * a + 3 * (1 - a), y: -7 * (1 - a) + 4 * Math.pow(a, 6), sq: 1 - 0.035 * Math.pow(a, 8),
      nt: -2 + 28 * s + 26 * ln * Math.max(0, s + 0.3), ns: -16 - 64 * ln, nf: 10 * s * ln + 18 * ln,
      ft: 2 - 28 * s + 26 * lf * Math.max(0, -s + 0.3), fs: -16 - 64 * lf, ff: -10 * s * lf + 18 * lf,
      au: 14 - 30 * s, af: 40 + 14 * Math.max(0, s), bu: 20 + 30 * s, bf: 40 + 14 * Math.max(0, -s), ah: 'rest', bh: 'rest',
      tl: 5 * s, tsw: 1.6, mf: 0.15, belly: a * 0.4 });
  },
  // claw telegraph (26 f): rears up, claw raised high behind his head
  clawWind: (k) => {
    const p = keys(k, [
      [0, IDLE],
      [0.4, P({ x: -4, tor: -12, nk: 4, head: -12, au: 150, af: 40, ah: 'open', bu: 20, bf: 40, wo: 0.2, mf: 0.15, face: 'furious', armFront: true }), 'out'],
      [1, CWIND, 'io'],
    ]);
    if (k > 0.75) { p.af += Math.sin(k * 120) * 4; p.x += Math.sin(k * 150) * 1; }
    p.glint = clamp((k - 0.55) / 0.2, 0, 1);
    return p;
  },
  // wide swipe (26 f): contact .35, big smear
  claw: (k) => keys(k, [
    [0, CWIND],
    [0.35, CHIT, 'snap'],
    [0.5, P(Object.assign({}, CHIT, { x: 22, tor: 30, nk: 14, head: -10, au: 16, af: 10, smear: 0.4, sa0: 120, sa1: 20 })), 'out'],
    [0.72, P(Object.assign({}, CHIT, { x: 20, tor: 26, nk: 16, head: -8, jaw: 10, au: 2, af: 16, smear: 0, face: 'furious' }))],
    [1, P({ x: 6 })],
  ]),
  // fire telegraph (40 f): rears his head back, chest swells, green fire glows in his throat
  breathWind: (k) => {
    const p = keys(k, [
      [0, IDLE],
      [0.6, P(Object.assign({}, BWIND, { glow: 0.7, belly: 0.8 })), 'out'],
      [1, BWIND],
    ]);
    p.gather = clamp(k / 0.5, 0, 1);
    return p;
  },
  // sweeping GREEN fire (80 f): head thrust forward, the stream sweeps from far to near and back up
  breath: (k) => {
    const sw = k < 0.12 ? 0 : k > 0.86 ? 1 : (k - 0.12) / 0.74;
    const aim = Math.sin(sw * Math.PI);                    // 0 -> 1 -> 0: far floor, near floor, far
    const p = keys(k, [
      [0, BWIND],
      [0.12, P({ x: 8, tor: 14, nk: 30, head: -18, jaw: 14, glow: 1, nt: -24, ns: -12, ft: 36, fs: -50, au: 30, af: 50, ah: 'claw', bu: 40, bf: 40, bh: 'claw',
        wo: 0.5, wf: -6, mf: 0.4, tl: -8, face: 'breath' }), 'snap'],
      [0.86, P({ x: 8, tor: 14, nk: 30, head: -18, jaw: 14, glow: 1, nt: -24, ns: -12, ft: 36, fs: -50, au: 30, af: 50, ah: 'claw', bu: 40, bf: 40, bh: 'claw',
        wo: 0.5, wf: -6, mf: 0.4, tl: -8, face: 'breath' })],
      [1, P({ x: 4, glow: 0 })],
    ]);
    p.head += aim * 32; p.nk += aim * 8; p.tor += aim * 4;
    p.fire = k < 0.1 ? 0 : k > 0.9 ? 0 : 1; p.gather = k < 0.1 ? 1 : 0;
    return p;
  },
  // stomp telegraph (30 f): knee up high, fists raised
  stompWind: (k) => keys(k, [
    [0, IDLE],
    [0.5, P(Object.assign({}, SWIND, { nt: 60, ns: -84, au: 196, af: -10, bu: 120 })), 'out'],
    [1, SWIND],
  ]),
  // stomp (30 f): contact .4 (the engine adds the shockwave)
  stomp: (k) => keys(k, [
    [0, SWIND],
    [0.4, P(Object.assign({}, SHIT, { sdust: 1 })), 'in'],
    [0.48, P(Object.assign({}, SHIT, { sq: 0.91, mf: 0.9, sdust: 0.85 }))],
    [0.66, P(Object.assign({}, SHIT, { sq: 1.02, tor: 12, mf: 0.3, sdust: 0.4 })), 'out'],
    [1, IDLE],
  ]),
  // takes off (40 f): crouch with wings spreading, a great beat, airborne (ends in the hover pose; raise z from ~.35)
  flyUp: (k) => {
    const p = keys(k, [
      [0, IDLE],
      [0.3, CROUCH, 'out'],
      [0.3001, P(Object.assign({}, CROUCH, { air: true, y: hipOf(CROUCH) - AIR_HIP }))],
      [0.5, P(Object.assign({}, HOVER, { y: -6, nt: -10, ns: -10, ft: 0, fs: -10, nf: 30, ff: 30, wf: -40, face: 'roar', jaw: 18 })), 'out'],
      [1, HOVER],
    ]);
    if (k > 0.5) p.wf = Math.sin((k - 0.5) / 0.5 * TAU * 1.5 + Math.PI / 2) * 34;
    else if (k > 0.3) p.wf = lerp(40, -40, (k - 0.3) / 0.2);
    return p;
  },
  // flying above the floor (the engine lifts by z); wings beating, legs dangling
  hover(t) {
    const fl = Math.sin(t * 7), b = Math.cos(t * 7);
    const p = P(Object.assign({}, HOVER, { y: -4 * b, wf: fl * 34, tor: 6 + b * 2, head: -4 - b * 3, nt: 30 - b * 6, ft: 42 - b * 6,
      ns: -66 + b * 8, fs: -78 + b * 8, tl: -10 + 6 * Math.sin(t * 2), au: 40 + b * 6, bu: 50 + b * 6 }));
    p.blink = (t % 4) > 3.88;
    return p;
  },
  // dive telegraph: rears back in the air, wings high, claws forward
  diveWind: (k) => keys(k, [
    [0, HOVER],
    [1, P(Object.assign({}, HOVER, { y: -10, rot: 16, tor: -14, nk: 0, head: -16, jaw: 22, wf: 50, au: 120, af: 30, bu: 130, bf: 30,
      nt: 40, ns: -80, ft: 50, fs: -90, face: 'roar', mf: 0.4 })), 'out'],
  ]),
  // diving across the screen (loop): body flat out, claws ahead, wings swept back
  dive(t) {
    const fl = Math.sin(t * 40), u = Math.sin(t * 9);
    return P({ air: true, y: 34, rot: -72 + u * 3, tor: u * 4, nk: 30 - u * 4, head: -26 + u * 6, jaw: 18 + 4 * u, nt: -30, ns: -10, nf: -40, ft: -20, fs: -16, ff: -40,
      au: 150 + u * 6, af: 16, ah: 'claw', bu: 160 - u * 6, bf: 16, bh: 'claw', wo: 0.5, wf: -30 + fl * 18, tl: 40 + u * 6, tc: -6, tsw: 2, mf: 0.9 + 0.1 * fl,
      face: 'roar', speed: 1, stream: 1 });
  },
  // raises his claws, the crown blazes, guards appear (50 f)
  summon: (k) => {
    const p = keys(k, [
      [0, IDLE],
      [0.25, P({ x: -2, tor: 8, nk: 18, head: 8, au: 40, af: 80, ah: 'fist', bu: 50, bf: 80, bh: 'fist', wo: 0.3, belly: 0.6, face: 'grin' }), 'io'],
      [0.45, P({ tor: -16, nk: 2, head: -26, jaw: 26, au: 148, af: 6, ah: 'open', bu: 212, bf: 6, bh: 'open', wo: 1, wf: 20, mf: 0.8, belly: 1,
        tl: 16, face: 'roar', armFront: true }), 'back'],
      [0.82, P({ tor: -14, nk: 2, head: -24, jaw: 24, au: 146, af: 10, ah: 'open', bu: 208, bf: 10, bh: 'open', wo: 1, wf: 10, mf: 0.5, belly: 1,
        tl: 12, face: 'roar', armFront: true })],
      [1, P({ face: 'grin' })],
    ]);
    p.blaze = clamp((k - 0.3) / 0.15, 0, 1) * clamp((1 - k) / 0.15, 0, 1);
    if (k > 0.45 && k < 0.82) p.au += Math.sin(k * 80) * 2;
    return p;
  },
  hurt: (k) => keys(k, [
    [0, P({ x: -10, sq: 0.93, tor: -18, nk: -10, head: -24, jaw: 16, au: 50, af: 60, ah: 'open', bu: 60, bf: 50, bh: 'open', nt: -2, ns: -26, ft: 26, fs: -26,
      tl: 18, tsw: 2, wo: 0.3, wf: 20, mf: 0.4, face: 'ouch' })],
    [0.4, P({ x: -8, tor: -8, nk: 4, head: -12, jaw: 8, au: 30, af: 50, bu: 40, bf: 40, ns: -22, fs: -24, tl: 10, mf: 0.2, face: 'ouch' }), 'out'],
    [1, P({ x: -2 })],
  ]),
  // vulnerable, dizzy (50 f): wobbling on the spot, swirl eyes, tongue out, stars round the crown
  stagger: (k) => {
    const w = Math.sin(k * TAU * 2.2), w2 = Math.sin(k * TAU * 2.2 + 1.2), env = clamp(k / 0.1, 0, 1) * clamp((1 - k) / 0.15, 0, 1);
    const p = keys(k, [
      [0, P({ x: -8, tor: -16, nk: -6, head: -20, jaw: 18, nt: -20, ns: -24, ft: 30, fs: -30, au: 60, af: 40, ah: 'open', bu: 70, bf: 30, bh: 'open',
        wo: 0.2, mf: 0.3, tl: 20, tsw: 2, face: 'dizzy' })],
      [0.15, P({ x: -10, tor: 6, nk: 20, head: 16, jaw: 16, nt: -14, ns: -30, ft: 22, fs: -36, au: -6, af: 20, ah: 'rest', bu: 4, bf: 20,
        wo: 0.1, mf: 0.1, tl: 4, tsw: 2.5, face: 'dizzy' }), 'out'],
      [0.85, P({ x: -10, tor: 6, nk: 20, head: 16, jaw: 16, nt: -14, ns: -30, ft: 22, fs: -36, au: -6, af: 20, ah: 'rest', bu: 4, bf: 20,
        wo: 0.1, mf: 0.1, tl: 4, tsw: 2.5, face: 'dizzy' })],
      [1, P({ x: -4, face: 'sneer' })],
    ]);
    p.tor += w * 7 * env; p.nk += w2 * 12 * env; p.head += w * 10 * env; p.x += w2 * 4 * env;
    p.stars = k > 0.06 && k < 0.92;
    return p;
  },
  // intro roar (loop): wings spread, arms wide, crown blazing
  roar(t) {
    const sh = Math.sin(t * 75) * 4, b = Math.sin(t * 2.6);
    return P({ tor: -12, nk: 4, head: -26 + sh, jaw: 34, belly: 1, au: 112 + b * 6, af: -24, ah: 'open', bu: 206 + b * 6, bf: 20, bh: 'open', armFront: true,
      nt: -18, ns: -14, ft: 26, fs: -18, wo: 1, wf: 16 + b * 6, mf: 0.7 + 0.1 * Math.sin(t * 5), tl: 20 + 4 * Math.sin(t * 3),
      blaze: 0.7 + 0.2 * Math.sin(t * 9), face: 'roar' });
  },
  // cracks spread across the crown gem (60 f): a flinch, then he cowers, neck pulled in, hands on his cheeks in
  // horror while the crown slips; "tings" (blaze flicks) at .5 and .8; knees wobbling
  crownCrack: (k) => {
    const p = keys(k, [
      [0, P({ x: -6, tor: -14, nk: 0, head: -22, jaw: 14, au: 60, af: 50, ah: 'open', bu: 70, bf: 40, bh: 'open', mf: 0.3, face: 'surprised' })],
      [0.22, P(Object.assign({}, CLUTCH, { nt: -12, ns: -26, ft: 20, fs: -32 })), 'out'],
      [1, CLUTCH],
    ]);
    p.crack = clamp(k / 0.85, 0, 1);
    const ting = Math.max(0, 1 - Math.abs(k - 0.5) * 25) + Math.max(0, 1 - Math.abs(k - 0.8) * 25);
    p.cslip = 14 * ease.out(clamp((k - 0.2) / 0.8, 0, 1)) + ting * 4;
    p.blaze = ting * 0.6;
    const wob = Math.sin(k * 90) * clamp((k - 0.25) / 0.2, 0, 1);
    p.ns += wob * 6; p.fs -= wob * 6; p.head += Math.sin(k * 140) * 2 * clamp(k / 0.3, 0, 1);
    return p;
  },
  // the crown shatters in a flash and he SHRINKS, in puffs of smoke, into the tiny form (120 f)
  defeated: (k) => {
    const p = keys(k, [
      [0, P(Object.assign({}, CLUTCH, { cslip: 14 }))],
      [0.12, P({ x: -8, tor: -14, nk: 0, head: -24, jaw: 30, au: 120, af: 30, ah: 'open', bu: 130, bf: 30, bh: 'open', wo: 0.7, wf: 20,
        nt: -16, ns: -24, ft: 24, fs: -30, mf: 0.8, tl: 20, face: 'surprised' }), 'snap'],
      [0.5, P({ x: -4, tor: 4, nk: 10, head: 0, jaw: 20, au: 60, af: 60, ah: 'open', bu: 70, bf: 60, bh: 'open', wo: 0.3, mf: 0.3, face: 'aghast' })],
    ]);
    p.crack = 1; p.dk = k;
    return p;
  },
  // ---- tiny form (~45 px): hopping mad, tiny fists shaking, steam from the nostrils
  tinyIdle(t) {
    const hop = Math.abs(Math.sin(t * 6.5)), sh = Math.sin(t * 26);
    return { tiny: true, hop, fist: sh, flap: Math.sin(t * 30), lean: 4 + sh * 2, talk: 0, mood: 'furious', caged: false, t };
  },
  tinyCaged(t) {
    const cyc = t % 4.5, sulk = cyc > 3 ? Math.sin((cyc - 3) / 1.5 * Math.PI) : 0;
    const sh = Math.sin(t * 22);
    return { tiny: true, hop: Math.abs(Math.sin(t * 5)) * 0.25 * (1 - sulk), fist: sh * (1 - sulk), flap: Math.sin(t * 24) * (1 - sulk * 0.7),
      lean: 2 + sh, talk: 0, mood: sulk > 0.4 ? 'sulk' : 'furious', grip: 1 - sulk, caged: true, t };
  },
  tinyTalk(t) {
    const sh = Math.sin(t * 18);
    return { tiny: true, hop: Math.abs(Math.sin(t * 4)) * 0.3, fist: sh, flap: Math.sin(t * 28) * 0.8, lean: 10 + sh * 3, talk: 1, mood: 'rant', caged: false, t };
  },
};
export { mix };

// ---------------------------------------------------------------- geometry shared with the engine
function hipOf(p) {
  if (p.air) return AIR_HIP + p.y;
  const dn = HIP_N[1] + legDrop(THIGH, SHIN, FOOT, p.nt, p.ns);
  const df = HIP_F[1] + legDrop(THIGH, SHIN, FOOT, p.ft, p.fs);
  return -Math.max(dn, df) + p.y;
}
function rot2(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
// head joint (torso frame) for a neck lean
function headJoint(p) { const a = p.nk * DEG, L = NECKL * (p.nl ?? 1); return [NECK0[0] + Math.sin(a) * L, NECK0[1] - Math.cos(a) * L]; }
// head-frame point -> local (origin on the floor, facing right, scale 1)
function headToLocal(p, x, y) {
  let [a, b] = rot2(x * HS, y * HS, p.head * DEG);
  const [hx, hy] = headJoint(p);
  [a, b] = rot2(a + hx, b + hy, p.tor * DEG);
  if (p.rot) [a, b] = rot2(a, b, -p.rot * DEG);
  a += p.x; b += hipOf(p);
  const sq = p.sq || 1;
  return [a / Math.sqrt(sq) * RIG, b * sq * RIG];
}
const FACE_JAW = { sneer: 0, smug: 0, grin: 2, roar: 30, ouch: 14, dizzy: 16, surprised: 16, aghast: 22, furious: 4, breath: 26 };
/** Mouth of a pose: [x, y, angle] in local px (facing right, scale 1, floor origin); angle in radians, 0 = straight
 *  ahead, + = downward (mirror it for facing left: PI - angle). */
export function mouthOf(p) {
  const jaw = (FACE_JAW[p.face] ?? 0) + p.jaw;
  const [x, y] = headToLocal(p, 86, -2 + jaw * 0.22);
  const ang = (p.tor + p.head - (p.rot || 0) + jaw * 0.25) * DEG;
  return [Math.round(x), Math.round(y), +ang.toFixed(3)];
}
/** Crown centre for a pose (local px): for flashes, shards and the engine's "hit the crown" effects. */
export function crownOf(p) { return headToLocal(p, 7, -49).map(Math.round); }
/** { mouth, crown, nearHand, nearFoot, hipY } for a pose (local px, facing right, scale 1). */
export function measure(p) {
  const hipY = hipOf(p), tor = p.tor * DEG, sq = p.sq || 1;
  const loc = (x, y) => { let [a, b] = rot2(x, y, tor); if (p.rot) [a, b] = rot2(a, b, -p.rot * DEG); return [Math.round((a + p.x) / Math.sqrt(sq) * RIG), Math.round((b + hipY) * sq * RIG)]; };
  const u = p.au * DEG, f = (p.au + p.af) * DEG;
  const hx = SH_N[0] + Math.sin(u) * UPPER + Math.sin(f) * (FORE + 26), hy = SH_N[1] + Math.cos(u) * UPPER + Math.cos(f) * (FORE + 26);
  // near foot (hip frame, unrotated by the torso)
  const a1 = p.nt * DEG, a2 = (p.nt + p.ns) * DEG;
  let fx = HIP_N[0] + Math.sin(a1) * THIGH + Math.sin(a2) * SHIN + 16, fy = HIP_N[1] + Math.cos(a1) * THIGH + Math.cos(a2) * SHIN + FOOT;
  if (p.rot) [fx, fy] = rot2(fx, fy, -p.rot * DEG);
  return { mouth: mouthOf(p), crown: crownOf(p), nearHand: loc(hx, hy), nearFoot: [Math.round((fx + p.x) * RIG), Math.round((fy + hipY) * RIG)], hipY: hipY * RIG };
}

// ---------------------------------------------------------------- drawing helpers
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
function celR(ctx, path, base, dark, o, s = 2.2) { cel(ctx, path, base, dark, o); rim(ctx, path, o.lw ?? 3.2, s); }
function scaleTex(c, x0, x1, y0, y1, col, r = 4, lw = 1.3) {
  c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
  let row = 0;
  for (let y = y0; y < y1; y += r * 1.5, row++) {
    for (let x = x0 + (row % 2) * r; x < x1; x += r * 2) {
      c.moveTo(x + r * Math.cos(0.15 * Math.PI), y + r * Math.sin(0.15 * Math.PI));
      c.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI);
    }
  }
  c.stroke();
}
function starPath(c, x, y, R, r, n = 5, rot = -Math.PI / 2) {
  for (let j = 0; j < n * 2; j++) {
    const rr = j % 2 ? r : R, aa = rot + j * Math.PI / n;
    j ? c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr) : c.moveTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
  }
  c.closePath();
}
let T = 0, TALK = false, CRACK = 0, LW = 1, JAWA = 0;
let FLOOR = 106, FS = 0, FC = 1, CX = 0, CY = 0;
function aboveFloor(x, y, m) {
  const Y = x * FS + y * FC, lim = FLOOR - m;
  CX = x; CY = y;
  if (Y > lim) { const d = Y - lim; CX -= d * FS; CY -= d * FC; }
}
const SM = { mant: 0, tail: 0, beard: 0, wing: 0 };

/**
 * Draw the Dragon King (or his tiny form).  ctx is at his feet (screen), unscaled.
 * o: { facing: 1 | -1, t: seconds, scale, mem, vel: {x,y,z}, talk, crack: 0..1 (crown cracks, any pose),
 *      tiny: true (draw the tiny form whatever the pose: tinyTalk if talk, tinyCaged if o.caged, else tinyIdle) }
 */
export function draw(ctx, pose, o = {}) {
  const p = pose;
  T = o.t || 0;
  TALK = !!o.talk;
  if (p.tiny) { drawTiny(ctx, p, o, 1); return; }
  if (o.tiny) { drawTiny(ctx, ANIM[o.talk ? 'tinyTalk' : o.caged ? 'tinyCaged' : 'tinyIdle'](T), o, 1); return; }
  if (p.dk !== undefined) { drawDefeat(ctx, p, o); return; }
  drawBig(ctx, p, o, 1);
}

function drawBig(ctx, p, o, extra) {
  const f = o.facing || 1, S = (o.scale || 1) * extra * RIG;
  CRACK = Math.max(p.crack || 0, o.crack || 0);
  const vx = ((o.vel && o.vel.x) || 0) * f, vz = (o.vel && o.vel.z) || 0;
  SM.mant = follow(o.mem, 'dk_mant', clamp(p.mf + clamp(vx * 0.1, -0.15, 0.6) + clamp(-vz * 0.04, -0.1, 0.4), -0.2, 1.3), 0.07, 0.89);
  SM.tail = follow(o.mem, 'dk_tail', clamp(-vx * 5, -22, 22), 0.06, 0.9);
  SM.beard = follow(o.mem, 'dk_beard', clamp(vx * 6 - vz * 3, -30, 40), 0.09, 0.87);
  SM.wing = follow(o.mem, 'dk_wing', clamp(-vz * 4, -20, 20), 0.12, 0.84);
  const hipY = hipOf(p);
  ctx.save();
  ctx.scale(f * S, S);
  if (p.sq !== 1) ctx.scale(1 / Math.sqrt(p.sq), p.sq);
  ctx.translate(p.x, hipY);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (p.speed > 0.05) speedLines(ctx, p);
  if (p.rot) ctx.rotate(-p.rot * DEG);
  FLOOR = -hipY; FS = Math.sin(-p.rot * DEG); FC = Math.cos(-p.rot * DEG);
  const tor = p.tor * DEG;

  ctx.save(); ctx.rotate(tor); wing(ctx, p, true); ctx.restore();
  tail(ctx, p);
  mantleBack(ctx, p, tor);
  ctx.save(); ctx.rotate(tor); wing(ctx, p, false); arm(ctx, p, false); ctx.restore();
  leg(ctx, HIP_F, p.ft, p.fs, p.ff, true);
  if (!p.legFront) leg(ctx, HIP_N, p.nt, p.ns, p.nf, false);
  ctx.save(); ctx.rotate(tor);
  torso(ctx, p);
  if (p.legFront) { ctx.restore(); leg(ctx, HIP_N, p.nt, p.ns, p.nf, false); ctx.save(); ctx.rotate(tor); }
  neck(ctx, p);
  if (!p.armFront) arm(ctx, p, true);
  collar(ctx, p);
  const [hx, hy] = headJoint(p);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(p.head * DEG); ctx.scale(HS, HS); LW = 1 / HS; head(ctx, p); LW = 1; ctx.restore();
  beard(ctx, p, hx, hy);
  if ((p.fire > 0.05 && p.glow > 0.05) || p.gather > 0.05) {
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(p.head * DEG); ctx.scale(HS, HS); LW = 1 / HS;
    if (p.fire > 0.05) mouthFlames(ctx, p); else gatherSparks(ctx, p);
    LW = 1; ctx.restore();
  }
  if (p.smear > 0.01) smear(ctx, p);
  if (p.armFront) arm(ctx, p, true);
  if (p.stars) dizzyStars(ctx, p, hx, hy);
  ctx.restore();
  if (p.sdust > 0.02) stompDust(ctx, p);
  ctx.restore();
}
// speed lines streaming behind a dive (hip frame, unrotated)
function speedLines(ctx, p) {
  ctx.save(); ctx.globalAlpha = 0.7 * p.speed; ctx.strokeStyle = '#f4efff'; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const y = -90 + i * 30 + Math.sin(i * 2.7) * 8, x0 = -150 - ((T * 900 + i * 137) % 160), L = 60 + 30 * Math.sin(i * 1.3);
    ctx.lineWidth = 3 + (i % 3); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - L, y); ctx.stroke();
  }
  ctx.restore();
}
// dust burst + cracks in the floor round the stomping foot (hip frame)
function stompDust(ctx, p) {
  stompDustAt(ctx, clamp(p.sdust, 0, 1), HIP_N[0] + Math.sin(p.nt * DEG) * THIGH + Math.sin((p.nt + p.ns) * DEG) * SHIN + 12, FLOOR);
}
function stompDustAt(ctx, a, fx, fy) {
  ink(ctx, (c) => { c.moveTo(fx - 30, fy); c.lineTo(fx - 46, fy + 3); c.lineTo(fx - 60, fy + 1); c.moveTo(fx + 40, fy); c.lineTo(fx + 56, fy + 4); c.lineTo(fx + 74, fy + 2); c.moveTo(fx + 10, fy + 1); c.lineTo(fx + 18, fy + 6); }, 3, INK);
  ctx.globalAlpha = a;
  for (const [dx, r, k] of [[-44, 16, 0.9], [-20, 22, 1], [30, 20, 1], [56, 14, 0.8], [6, 12, 0.6]]) {
    const rr = r * (1.5 - a * 0.5), x = fx + dx * (1.4 - a * 0.4), y = fy - rr * 0.55 - (1 - a) * 10 * k;
    flat(ctx, (c) => { circle(c, x, y, rr); circle(c, x + rr * 0.7, y + rr * 0.25, rr * 0.65); }, '#d9cbb4', 0);
    ink(ctx, (c) => { c.moveTo(x - rr, y + rr * 0.3); c.quadraticCurveTo(x, y + rr * 0.9, x + rr * 1.3, y + rr * 0.4); }, 2.2, '#a8987c');
  }
  ctx.globalAlpha = 1;
}

// -------------------------------------------------- wings (torso frame); folded high like a collar, `wo` spreads them
// points relative to the root: wrist, finger tips 1..3, trailing root; folded / open
const WFO = [-16, -122, -44, -80, -60, -28, -52, 22, -18, 40];
const WOP = [-58, -120, -14, -226, -122, -206, -198, -110, -36, 30];
const WOPF = [12, -126, 62, -214, -24, -246, -104, -212, -26, 8];      // far wing opens up and forward, behind the head
const WG = new Float64Array(10), WR = [0, 0];
function wingPath(c) {
  c.moveTo(WR[0], WR[1]); c.lineTo(WG[0], WG[1]); c.lineTo(WG[2], WG[3]);
  for (let i = 2; i <= 6; i += 2) {
    const mx = (WG[i] + WG[i + 2]) / 2, my = (WG[i + 1] + WG[i + 3]) / 2;
    c.quadraticCurveTo(lerp(mx, WG[0], 0.42), lerp(my, WG[1], 0.42), WG[i + 2], WG[i + 3]);
  }
  c.closePath();
}
function wing(ctx, p, far) {
  const rx = WROOT[0] + (far ? 16 : 0), ry = WROOT[1] - (far ? 6 : 0), o = clamp(p.wo, 0, 1), k = far ? 0.9 : 1;
  // flap: + raises the wing (near wing turns clockwise about its root, the far wing the other way)
  const fa = (p.wf + SM.wing) * DEG * o * (far ? -0.85 : 1), cf = Math.cos(fa), sf = Math.sin(fa);
  const OP = far ? WOPF : WOP;
  for (let i = 0; i < 10; i += 2) {
    let x = lerp(WFO[i], OP[i], o) * k, y = lerp(WFO[i + 1], OP[i + 1], o) * k;
    if (i < 8) { const xx = x * cf - y * sf, yy = x * sf + y * cf; x = xx; y = yy; }
    WG[i] = rx + x; WG[i + 1] = ry + y;
  }
  WR[0] = rx; WR[1] = ry;
  const mem = far ? C.memF : C.mem, memd = far ? C.memFD : C.memD;
  cel(ctx, wingPath, mem, memd, { k: 2, lw: 3, detail: o > 0.12 ? (c) => {
    // veins fanning from the wrist between the fingers
    c.strokeStyle = far ? C.memFD : C.memD; c.lineWidth = 1.5; c.beginPath();
    for (const i of [2, 4, 6]) {
      const mx = (WG[i] + WG[i + 2]) / 2, my = (WG[i + 1] + WG[i + 3]) / 2;
      c.moveTo(lerp(WG[0], WG[i], 0.25), lerp(WG[1], WG[i + 1], 0.25)); c.quadraticCurveTo(lerp(WG[0], mx, 0.6), lerp(WG[1], my, 0.6) + 6, lerp(WG[0], mx, 0.62), lerp(WG[1], my, 0.62));
    }
    c.stroke();
  } : null });
  if (!far) rim(ctx, wingPath, 3, 2.2);
  // veins on the membrane, then the bones
  const fingers = (c) => { for (const i of [2, 4, 6]) { c.moveTo(WG[0], WG[1]); c.lineTo(lerp(WG[0], WG[i], 0.97), lerp(WG[1], WG[i + 1], 0.97)); } };
  ink(ctx, (c) => { c.moveTo(rx, ry); c.lineTo(WG[0], WG[1]); }, 11);
  if (o > 0.12) ink(ctx, fingers, 6.4);
  ink(ctx, (c) => { c.moveTo(rx, ry); c.lineTo(WG[0], WG[1]); }, 6, far ? C.scF : C.sc);
  if (o > 0.12) ink(ctx, fingers, 2.8, far ? C.scF : C.sc);
  // gold wrist claw
  const wx = WG[0], wy = WG[1];
  flat(ctx, (c) => { c.moveTo(wx - 4, wy + 3); c.quadraticCurveTo(wx - 3, wy - 10, wx + 5, wy - 16); c.quadraticCurveTo(wx + 4, wy - 5, wx + 5, wy + 2); c.closePath(); },
    far ? C.goldF : C.gold, 2.4);
}

// -------------------------------------------------- tail (hip frame): long, heavy, spiked, gold underside
const TN = 11, TSEG = 17;
const SX = new Float64Array(TN + 1), SY = new Float64Array(TN + 1), SA = new Float64Array(TN + 1);
const AX = new Float64Array(TN + 1), AY = new Float64Array(TN + 1), BX = new Float64Array(TN + 1), BY = new Float64Array(TN + 1);
function tailHW(i) { return lerp(30, 6, Math.pow(i / TN, 0.85)); }
function tail(ctx, p) {
  let a = Math.PI - (62 - p.tl - SM.tail * 0.5) * DEG, x = TAIL_ROOT[0], y = TAIL_ROOT[1];
  for (let i = 0; i <= TN; i++) {
    if (i) {
      a += (6 + p.tc + p.tsw * 3.4 * Math.sin(T * 1.3 - i * 0.5) + SM.tail * 0.2 * (i / TN)) * DEG;
      x += Math.cos(a) * TSEG; y += Math.sin(a) * TSEG;
      aboveFloor(x, y, tailHW(i) + 1.5);
      if (CX !== x || CY !== y) { x = CX; y = CY; a = Math.atan2(y - SY[i - 1], x - SX[i - 1]); }
    }
    SX[i] = x; SY[i] = y; SA[i] = a;
    const hw = tailHW(i), nx = -Math.sin(a) * hw, ny = Math.cos(a) * hw;
    AX[i] = x + nx; AY[i] = y + ny; BX[i] = x - nx; BY[i] = y - ny;
  }
  // dorsal spikes (dark, gold-tipped)
  flat(ctx, (c) => {
    for (let i = 1; i < TN - 1; i += 1.4) {
      const j = Math.floor(i), sa = SA[j], hw = tailHW(j), L = 16 - j * 0.9;
      const nx = -Math.sin(sa), ny = Math.cos(sa), ux = Math.cos(sa), uy = Math.sin(sa);
      const bx = SX[j] + nx * hw * 0.75, by = SY[j] + ny * hw * 0.75;
      c.moveTo(bx - ux * 7, by - uy * 7); c.lineTo(bx + nx * L - ux * 5, by + ny * L - uy * 5); c.lineTo(bx + ux * 7, by + uy * 7); c.closePath();
    }
  }, C.blk, 2.6);
  celR(ctx, tailPath, C.sc, C.scD, { k: 2.2, lw: 3.2, detail: (c) => {
    // gold belly plates along the underside
    c.strokeStyle = C.bel; c.lineWidth = 9; c.beginPath();
    for (let i = 0; i < TN; i++) { const xx = lerp(SX[i], BX[i], 0.62), yy = lerp(SY[i], BY[i], 0.62); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.stroke();
    c.strokeStyle = C.belD; c.lineWidth = 1.5; c.beginPath();
    for (let i = 1; i < TN; i++) { c.moveTo(lerp(SX[i], BX[i], 0.3), lerp(SY[i], BY[i], 0.3)); c.lineTo(BX[i], BY[i]); }
    c.stroke();
    c.strokeStyle = C.scL; c.lineWidth = 1.4; c.beginPath();
    for (let i = 1; i < TN; i += 2) { c.moveTo(lerp(SX[i], AX[i], 0.85), lerp(SY[i], AY[i], 0.85)); c.quadraticCurveTo(SX[i + 1] || SX[i], SY[i + 1] || SY[i], lerp(SX[i], AX[i], 0.2), lerp(SY[i], AY[i], 0.2)); }
    c.stroke();
  } }, 2.4);
  // spade tip with a gold edge
  ctx.save(); ctx.translate(SX[TN], SY[TN]); ctx.rotate(SA[TN]);
  cel(ctx, (c) => { c.moveTo(-6, 0); c.quadraticCurveTo(4, -16, 12, -12); c.quadraticCurveTo(14, -4, 26, 0); c.quadraticCurveTo(14, 4, 12, 12); c.quadraticCurveTo(4, 16, -6, 0); c.closePath(); },
    C.blk, C.blkD, { k: 1, lw: 2.8, hi: C.blkH, hk: 0.4, detail: (c) => { c.strokeStyle = C.gold; c.lineWidth = 2.2; c.beginPath(); c.moveTo(0, 0); c.lineTo(20, 0); c.stroke(); } });
  ctx.restore();
}
function tailPath(c) {
  c.moveTo(AX[0], AY[0]);
  for (let i = 1; i < TN; i++) c.quadraticCurveTo(AX[i], AY[i], (AX[i] + AX[i + 1]) / 2, (AY[i] + AY[i + 1]) / 2);
  c.lineTo(AX[TN], AY[TN]); c.lineTo(BX[TN], BY[TN]);
  for (let i = TN - 1; i > 0; i--) c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[i - 1]) / 2, (BY[i] + BY[i - 1]) / 2);
  c.lineTo(BX[0], BY[0]); c.closePath();
}

// -------------------------------------------------- the royal mantle: back panel + train (hip frame)
function mantleBack(ctx, p, tor) {
  const fl = SM.mant, s1 = Math.sin(T * 1.4) * 4, s2 = Math.sin(T * 1.9 + 1) * 3;
  const [ax, ay] = rot2(-10, -128, tor), [bx, by] = rot2(-40, -104, tor);
  // world "down" and "back" in the (rotated) hip frame: the train hangs to the floor and trails back; flaring blows it
  // back (in the world, so it streams behind him in a dive instead of sticking up)
  const rr = (p.rot || 0) * DEG, dnx = -Math.sin(rr), dny = Math.cos(rr), bkx = -Math.cos(rr), bky = -Math.sin(rr);
  const Lq = (FLOOR - by) * (1 - 0.75 * clamp(fl, 0, 1)), Bq = 78 + fl * 96;
  aboveFloor(bx + dnx * Lq + bkx * Bq + s1, by + dny * Lq + bky * Bq, 3);
  const qx = CX, qy = CY;
  const Lr = (FLOOR + 40) * (1 - 0.3 * clamp(fl, 0, 1)), Br = 16 + fl * 24;
  aboveFloor(-10 + dnx * Lr + bkx * Br + s2 * 0.4, -40 + dny * Lr + bky * Br, 3);
  const rx = CX, ry = CY;
  const path = (c) => {
    c.moveTo(ax, ay); c.quadraticCurveTo(bx - 14, by - 8, bx - 10, by + 14);
    c.quadraticCurveTo(bx - 30 - fl * 40, (by + qy) / 2 + 10, qx, qy);
    const n = 5;
    for (let i = 1; i <= n; i++) {
      const u = i / n, mx = lerp(qx, rx, u - 0.5 / n), my = lerp(qy, ry, u - 0.5 / n) + 4 + Math.sin(T * 2.2 + i) * 1.2 + (i % 2 ? 1 : -1) * 10 * clamp(fl - 0.3, 0, 1);
      c.quadraticCurveTo(mx, my, lerp(qx, rx, u), lerp(qy, ry, u));
    }
    c.lineTo(-10, -40); c.closePath();
  };
  celR(ctx, path, C.red, C.redD, { k: 2.6, lw: 3.4, hi: C.redH, hk: 0.3, detail: (c) => {
    // velvet folds
    c.strokeStyle = C.redD; c.lineWidth = 2.4; c.beginPath();
    c.moveTo(bx - 6, by + 30); c.quadraticCurveTo(bx - 20 - fl * 30, (by + qy) / 2 + 20, lerp(qx, rx, 0.25), lerp(qy, ry, 0.25) - 6);
    c.moveTo(-30, -70); c.quadraticCurveTo(-46 - fl * 26, -10, lerp(qx, rx, 0.6), lerp(qy, ry, 0.6) - 6);
    c.stroke();
    // gold hem band with an ermine border above it
    c.lineWidth = 9; c.strokeStyle = C.erm; c.beginPath();
    c.moveTo(qx, qy - 5); const n = 5;
    for (let i = 1; i <= n; i++) { const u = i / n; c.lineTo(lerp(qx, rx, u), lerp(qy, ry, u) - 5); }
    c.stroke();
    c.lineWidth = 4; c.strokeStyle = C.gold; c.beginPath(); c.moveTo(qx, qy); for (let i = 1; i <= n; i++) { const u = i / n; c.lineTo(lerp(qx, rx, u), lerp(qy, ry, u)); } c.stroke();
    c.fillStyle = C.spot; c.beginPath();
    for (let i = 1; i < 5; i++) { const u = i / 5; ermSpot(c, lerp(qx, rx, u), lerp(qy, ry, u) - 6, 1.4); }
    c.fill();
  } }, 2.4);
}
function ermSpot(c, x, y, s) {
  c.moveTo(x, y - 2.6 * s); c.quadraticCurveTo(x + 1.6 * s, y, x + 0.4 * s, y + 3 * s); c.lineTo(x - 0.4 * s, y + 3 * s); c.quadraticCurveTo(x - 1.6 * s, y, x, y - 2.6 * s); c.closePath();
}
// ermine collar + short shoulder drape (torso frame), drawn over the neck base and the near shoulder
function collar(ctx, p) {
  const fl = SM.mant;
  // crimson shoulder drape: from the collar over the near shoulder down the back
  celR(ctx, (c) => {
    c.moveTo(14, -132); c.quadraticCurveTo(-24, -136, -40, -110); c.quadraticCurveTo(-52 - fl * 10, -80, -46 - fl * 16, -50);
    c.quadraticCurveTo(-30, -56, -18, -78); c.quadraticCurveTo(-6, -98, 14, -108); c.closePath();
  }, C.red, C.redD, { k: 2, lw: 3.2, hi: C.redH, hk: 0.3, detail: (c) => {
    c.strokeStyle = C.redD; c.lineWidth = 2; c.beginPath(); c.moveTo(-14, -120); c.quadraticCurveTo(-34, -100, -38, -62); c.stroke();
  } }, 2);
  // ermine: fluffy white, scalloped lower edge, black ermine-tail spots
  const fur = (c) => {
    c.moveTo(48, -126); c.quadraticCurveTo(30, -146, -2, -144); c.quadraticCurveTo(-34, -140, -46, -116);
    // scalloped bottom edge back to the front
    const pts = [[-48, -104], [-38, -108], [-30, -100], [-20, -106], [-10, -98], [0, -106], [10, -100], [20, -108], [30, -104], [40, -112], [48, -110]];
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (i % 2) c.quadraticCurveTo(x, y + 6, x + 4, y); else c.lineTo(x, y);
    }
    c.quadraticCurveTo(54, -116, 48, -126); c.closePath();
  };
  cel(ctx, fur, C.erm, C.ermD, { k: 1.6, lw: 3.2, detail: (c) => {
    c.fillStyle = C.spot; c.beginPath();
    for (const [x, y] of [[-34, -122], [-14, -128], [6, -130], [26, -124], [-24, -112], [14, -116], [38, -118]]) ermSpot(c, x, y, 1.5);
    c.fill();
    c.strokeStyle = C.ermD; c.lineWidth = 1.4; c.beginPath();
    for (const [x, y] of [[-40, -112], [-6, -120], [30, -114]]) { c.moveTo(x, y); c.quadraticCurveTo(x + 4, y - 4, x + 9, y - 2); }
    c.stroke();
  } });
  // gold clasp with a ruby
  flat(ctx, (c) => { c.moveTo(44, -128); c.lineTo(51, -118); c.lineTo(44, -108); c.lineTo(37, -118); c.closePath(); }, C.gold, 2.6);
  flat(ctx, (c) => { c.moveTo(44, -123); c.lineTo(47.5, -118); c.lineTo(44, -113); c.lineTo(40.5, -118); c.closePath(); }, C.ruby, 1.4);
}

// -------------------------------------------------- legs (hip frame): big thighs, gold anklets, clawed feet
function leg(ctx, hip, a, s, footAbs, far) {
  const sc = far ? C.scF : C.sc, scd = far ? C.scFD : C.scD;
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(-a * DEG);
  celR(ctx, (c) => capsule(c, THIGH, 44, 32), sc, scd, { k: 2.2, lw: 3.2, hi: far ? null : C.scH, hk: 0.3, detail: far ? null : (c) => {
    scaleTex(c, -20, 4, 8, THIGH, C.scL, 4.4);
    c.strokeStyle = C.scD; c.lineWidth = 2; c.beginPath(); c.moveTo(14, 10); c.quadraticCurveTo(20, 26, 12, 40); c.stroke();
  } }, 2.2);
  ctx.translate(0, THIGH);
  ctx.rotate(-s * DEG);
  celR(ctx, (c) => capsule(c, SHIN, 32, 24), sc, scd, { k: 1.8, lw: 3.2, detail: (c) => {
    c.fillStyle = far ? C.belL : C.bel; c.beginPath(); c.moveTo(6, 4); c.quadraticCurveTo(15, SHIN * 0.5, 9, SHIN); c.lineTo(3, SHIN); c.quadraticCurveTo(7, SHIN * 0.5, 2, 6); c.closePath(); c.fill();
  } }, 2);
  // gold anklet with gems
  cel(ctx, (c) => { c.moveTo(-14, SHIN - 12); c.quadraticCurveTo(0, SHIN - 8, 14, SHIN - 12); c.lineTo(14, SHIN - 3); c.quadraticCurveTo(0, SHIN + 1, -14, SHIN - 3); c.closePath(); },
    far ? C.goldF : C.gold, C.goldD, { k: 0.9, lw: 2.6, hi: far ? null : C.goldH, hk: 0.4 });
  flat(ctx, (c) => circle(c, 4, SHIN - 6.5, 2.6), far ? C.gemD : C.gem, 1.4);
  ctx.translate(0, SHIN);
  ctx.rotate((a + s - footAbs) * DEG);
  // claws first (the toes cover their roots), then the foot: heel spur + three toes forward
  flat(ctx, (c) => {
    for (const [x, y] of [[30, FOOT - 9], [36, FOOT - 4], [27, FOOT - 1]]) { c.moveTo(x - 4, y - 3); c.quadraticCurveTo(x + 6, y - 3, x + 9, y + 3); c.quadraticCurveTo(x + 3, y + 1, x - 3, y + 3); c.closePath(); }
  }, far ? C.clawD : C.claw, 2);
  cel(ctx, (c) => {
    c.moveTo(-14, -8); c.lineTo(-22, 6); c.lineTo(-14, 5); c.lineTo(-13, FOOT); c.lineTo(28, FOOT);
    c.quadraticCurveTo(36, FOOT, 37, FOOT - 6); c.quadraticCurveTo(38, FOOT - 12, 32, FOOT - 13); c.quadraticCurveTo(22, -6, 8, -9); c.quadraticCurveTo(-4, -11, -14, -8); c.closePath();
  }, sc, scd, { k: 1.4, lw: 3, detail: (c) => {
    c.strokeStyle = scd; c.lineWidth = 1.8; c.beginPath();
    c.moveTo(18, FOOT - 1); c.quadraticCurveTo(17, FOOT - 8, 21, FOOT - 12); c.moveTo(27, FOOT - 1); c.quadraticCurveTo(26, FOOT - 7, 30, FOOT - 10); c.stroke();
  } });
  ctx.restore();
}

// -------------------------------------------------- torso (torso frame: hip at 0,0, up = -y): pear-shaped, gold belly
const BODY = [[-26, 14], [-34, -16], [-38, -52], [-42, -90], [-32, -116], [-8, -128], [24, -126], [50, -112], [60, -88], [57, -58], [52, -30], [40, -2], [16, 16]];
const BELLY = [[24, -118], [48, -106], [56, -86], [54, -58], [48, -30], [36, -4], [16, 12], [8, -20], [10, -70], [14, -104]];
function torso(ctx, p) {
  const br = 1 + 0.03 * p.belly;
  ctx.save();
  ctx.translate(10, -60); ctx.scale(br, 1 + 0.02 * p.belly); ctx.translate(-10, 60);
  celR(ctx, (c) => blob(c, BODY, 0.5), C.sc, C.scD, { k: 2.8, hi: C.scH, hk: 0.3, lw: 3.4, detail: (c) => scaleTex(c, -44, 10, -116, 0, C.scL, 4.6) }, 2.6);
  const glow = clamp(p.glow, 0, 1);
  cel(ctx, (c) => blob(c, BELLY, 0.5), C.bel, C.belD, { k: 2.2, hi: C.belH, hk: 0.3, lw: 0, detail: (c) => {
    c.strokeStyle = C.belL; c.lineWidth = 2; c.beginPath();
    for (let y = -98; y < 6; y += 14) { c.moveTo(8, y); c.quadraticCurveTo(32, y + 5, 62, y - 2); }
    c.stroke();
    if (glow > 0.05) {   // the fire builds in his chest: a glow behind the top plates
      c.globalAlpha = 0.3 * glow; c.fillStyle = C.glow; c.beginPath(); ellipse(c, 34, -102, 22, 16); c.fill();
      c.globalAlpha = 1; c.strokeStyle = C.glow; c.lineWidth = 2.6; c.beginPath();
      for (const y of [-98, -84]) { c.moveTo(10, y); c.quadraticCurveTo(32, y + 5, 60, y - 2); }
      c.stroke();
    }
  } });
  ink(ctx, (c) => { c.moveTo(14, -104); c.quadraticCurveTo(6, -56, 10, -10); c.quadraticCurveTo(12, 6, 18, 12); }, 2, C.belL);
  // re-ink the body's front edge over the belly
  ctx.save(); ctx.beginPath(); ctx.rect(0, -140, 80, 170); ctx.clip(); ink(ctx, (c) => blob(c, BODY, 0.5), 3.4); ctx.restore();
  ctx.restore();
}

// -------------------------------------------------- neck (torso frame): a tapered curve from the shoulders to the head joint
function neck(ctx, p) {
  const [hx, hy] = headJoint(p), bx = NECK0[0], by = NECK0[1];
  const a = p.nk * DEG, NL = NECKL * (p.nl ?? 1), mx = bx + Math.sin(a) * NL * 0.3 - 8, my = by - Math.cos(a) * NL * 0.6;
  const dx = hx - bx, dy = hy - by, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const w0 = 32, w1 = 24;
  const path = (c) => {
    c.moveTo(bx - nx * w0, by - ny * w0); c.quadraticCurveTo(mx - nx * (w0 + w1) / 2, my - ny * (w0 + w1) / 2, hx - nx * w1, hy - ny * w1);
    c.lineTo(hx + nx * w1, hy + ny * w1); c.quadraticCurveTo(mx + nx * (w0 + w1) / 2, my + ny * (w0 + w1) / 2, bx + nx * w0, by + ny * w0); c.closePath();
  };
  const glow = clamp(p.glow, 0, 1);
  celR(ctx, path, C.sc, C.scD, { k: 2, lw: 3.2, detail: (c) => {
    // gold throat plates on the front (+n side)
    c.strokeStyle = C.bel; c.lineWidth = 16; c.beginPath();
    c.moveTo(bx + nx * w0 * 0.8, by + ny * w0 * 0.8); c.quadraticCurveTo(mx + nx * 22, my + ny * 22, hx + nx * w1 * 0.8, hy + ny * w1 * 0.8); c.stroke();
    c.strokeStyle = glow > 0.05 ? C.glow : C.belD; c.lineWidth = 1.6 + glow * 2; c.beginPath();
    for (let i = 1; i < 5; i++) {
      const u = i / 5, x = lerp(bx, hx, u) + nx * 18, y = lerp(by, hy, u) + ny * 18;
      c.moveTo(x - nx * 8, y - ny * 8); c.lineTo(x + nx * 10, y + ny * 10);
    }
    c.stroke();
  } }, 2.2);
}

// -------------------------------------------------- head (head frame: origin at the head joint, +x = snout)
const SKULL = [[-16, -6], [-20, -22], [-10, -35], [6, -41], [22, -42], [36, -40], [48, -31], [62, -28], [74, -27], [82, -22], [86, -13], [84, -5], [70, -2], [50, -2], [28, -1], [10, 3]];
const JAWP = [[-8, -2], [30, -1], [60, -2], [78, -3], [83, 2], [77, 9], [58, 13], [30, 15], [8, 13], [-8, 6]];
const HINGE = [6, -2];
function head(ctx, p) {
  const face = p.face;
  let jaw = (FACE_JAW[face] ?? 0) + p.jaw;
  if (TALK) jaw += Math.max(0, Math.sin(T * 15)) * 18 + Math.max(0, Math.sin(T * 23)) * 5;
  const ja = jaw * DEG;
  JAWA = ja;
  // far horn, cheek frill
  horn(ctx, -8, -26, true);
  flat(ctx, (c) => {
    c.moveTo(-8, -18); c.lineTo(-34, -24); c.lineTo(-18, -12); c.lineTo(-38, -4); c.lineTo(-16, -2); c.lineTo(-30, 10); c.lineTo(-6, 4); c.closePath();
  }, C.memD, 2.8 * LW);
  // mouth interior
  if (jaw > 2) mouthInside(ctx, p, ja);
  // lower jaw
  ctx.save();
  ctx.translate(HINGE[0], HINGE[1]); ctx.rotate(ja); ctx.translate(-HINGE[0], -HINGE[1]);
  if (jaw > 2) {   // lower teeth
    ctx.fillStyle = C.tooth; ctx.strokeStyle = INK; ctx.lineWidth = 1.4 * LW; ctx.beginPath();
    for (let x = 30; x < 78; x += 9) { ctx.moveTo(x, -1); ctx.lineTo(x + 3, -8); ctx.lineTo(x + 6, -1); }
    ctx.fill(); ctx.stroke();
  }
  celR(ctx, (c) => blob(c, JAWP, 0.45), C.sc, C.scD, { k: 1.8, lw: 3.2 * LW, detail: (c) => {
    c.fillStyle = C.bel; c.beginPath(); c.moveTo(4, 8); c.quadraticCurveTo(40, 13, 80, 6); c.lineTo(82, 20); c.lineTo(0, 20); c.closePath(); c.fill();
    c.strokeStyle = C.belD; c.lineWidth = 1.3 * LW; c.beginPath(); for (const x of [24, 40, 56, 70]) { c.moveTo(x, 9); c.lineTo(x - 2, 16); } c.stroke();
  } }, 2 * LW);
  if (face === 'dizzy') flat(ctx, (c) => { c.moveTo(62, 0); c.quadraticCurveTo(82, 4, 80, 24); c.quadraticCurveTo(70, 28, 68, 8); c.closePath(); }, C.tongue, 2.4 * LW);
  ctx.restore();
  // upper fangs hanging over the lip
  flat(ctx, (c) => { c.moveTo(64, -4); c.lineTo(67, 7); c.lineTo(71, -4); c.closePath(); c.moveTo(48, -3); c.lineTo(50.5, 4); c.lineTo(53, -3); c.closePath(); }, C.tooth, 2 * LW);
  // skull: high brow, nose bump, cheekbone
  celR(ctx, (c) => blob(c, SKULL, 0.5), C.sc, C.scD, { k: 2.2, hi: C.scH, hk: 0.32, lw: 3.4 * LW, detail: (c) => {
    c.strokeStyle = C.scL; c.lineWidth = 1.5 * LW; c.beginPath();
    for (const [x, y] of [[56, -18], [64, -15], [72, -17], [60, -9], [68, -9], [8, -18], [0, -26], [14, -28]]) { c.moveTo(x + 3, y - 1); c.arc(x, y, 3.2, -0.4, Math.PI * 0.6); }
    c.stroke();
    // cheekbone ridge + nose ridge
    c.strokeStyle = C.scD; c.lineWidth = 2 * LW; c.beginPath();
    c.moveTo(20, -8); c.quadraticCurveTo(28, -14, 40, -14); c.moveTo(50, -30); c.quadraticCurveTo(64, -27, 74, -26); c.stroke();
    c.fillStyle = C.bel; c.beginPath(); c.moveTo(18, -2); c.quadraticCurveTo(50, -5, 85, -6); c.lineTo(84, -1); c.quadraticCurveTo(50, 0, 18, 3); c.closePath(); c.fill();
  } }, 2.4 * LW);
  // the mouth: a curled sneer that bares the front fangs, a smug toothy grin, or a plain scowl line
  if (jaw <= 2) {
    if (face === 'grin' || face === 'smug') {
      ctx.fillStyle = C.tooth; ctx.beginPath(); ctx.moveTo(20, -8); ctx.quadraticCurveTo(44, 0, 74, -1); ctx.lineTo(74, 3); ctx.quadraticCurveTo(44, 4.5, 20, -4); ctx.closePath(); ctx.fill();
      ink(ctx, (c) => { c.moveTo(20, -7); c.quadraticCurveTo(44, 3, 74, 1.5); for (const x of [30, 40, 50, 60, 68]) { c.moveTo(x, -1 + (x - 30) * 0.03); c.lineTo(x, 3.5); } }, 1.4 * LW);
      ink(ctx, (c) => { c.moveTo(76, -2); c.quadraticCurveTo(44, -2, 22, -9); c.quadraticCurveTo(18, -12, 16, -16); }, 3 * LW);
    } else {
      // sneer: the front of the upper lip lifts off three fangs
      flat(ctx, (c) => { c.moveTo(54, -2); c.quadraticCurveTo(62, -8, 72, -6); c.lineTo(74, -1); c.closePath(); }, C.mouth, 0);
      flat(ctx, (c) => { for (const x of [57, 63, 69]) { c.moveTo(x, -5.5); c.lineTo(x + 2, 1); c.lineTo(x + 4, -6); c.closePath(); } }, C.tooth, 1.4 * LW);
      ink(ctx, (c) => { c.moveTo(80, -3); c.quadraticCurveTo(76, -6, 72, -6.5); c.quadraticCurveTo(62, -9, 54, -2); c.quadraticCurveTo(32, 0, 20, -5); c.quadraticCurveTo(17, -7, 16, -10); }, 3 * LW);
    }
  }
  // nostril + smoke curls
  ink(ctx, (c) => { c.moveTo(74, -21); c.quadraticCurveTo(80, -25, 83, -19); }, 2.8 * LW);
  if (face === 'furious' || p.glow > 0.05) nostrilSmoke(ctx, p);
  eye(ctx, p);
  horn(ctx, -14, -22, false);
  crown(ctx, p);
}
function mouthInside(ctx, p, ja) {
  const c0 = Math.cos(ja), s0 = Math.sin(ja);
  const jx = HINGE[0] + (82 - HINGE[0]) * c0 - (2 - HINGE[1]) * s0, jy = HINGE[1] + (82 - HINGE[0]) * s0 + (2 - HINGE[1]) * c0;
  const fire = p.face === 'breath' && p.glow > 0.05;   // (green-lit mouth: wind-up glow and the breath itself)
  ctx.beginPath(); ctx.moveTo(HINGE[0] - 6, HINGE[1] - 2); ctx.lineTo(84, -4); ctx.quadraticCurveTo(jx + 8, (jy - 4) / 2, jx, jy); ctx.closePath();
  ctx.fillStyle = fire ? C.gemD : C.mouth; ctx.fill();
  ctx.lineWidth = 3 * LW; ctx.strokeStyle = INK; ctx.stroke();
  ctx.save(); ctx.clip();
  if (fire) {
    const g = clamp(p.glow, 0, 1), fl = 0.9 + 0.1 * Math.sin(T * 31), my = (jy - 3) / 2 + 2;
    ctx.fillStyle = C.gem; ctx.beginPath(); ellipse(ctx, 50, my, 44 * g * fl, (8 + (jy - 3) * 0.3) * g, ja * 0.5); ctx.fill();
    ctx.fillStyle = C.gemC; ctx.beginPath(); ellipse(ctx, 58, my, 26 * g * fl, (3 + (jy - 3) * 0.14) * g, ja * 0.5); ctx.fill();
  } else {
    ctx.fillStyle = C.tongue; ctx.beginPath(); ellipse(ctx, 44 + 8 * s0, 2 + 18 * s0, 28, 7, ja * 0.6); ctx.fill();
    ctx.fillStyle = C.tooth; ctx.beginPath();
    for (let x = 26; x < 80; x += 9) { ctx.moveTo(x, -3); ctx.lineTo(x + 3.5, 5); ctx.lineTo(x + 7, -3); }
    ctx.fill();
  }
  ctx.restore();

}
// green flames licking out of the jaws (head frame) -- drawn after the beard so the fire is on top
function mouthFlames(ctx, p) {
  const ja = JAWA, c0 = Math.cos(ja), s0 = Math.sin(ja);
  const jy = HINGE[1] + (82 - HINGE[0]) * s0 + (2 - HINGE[1]) * c0;
  const g = clamp(p.glow, 0, 1), mx = 84, my = (jy - 4) / 2, fr = Math.floor(T * 30);
  ctx.save(); ctx.translate(mx, my); ctx.rotate(ja * 0.45);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * g; ctx.fillStyle = C.gemD;
  ctx.beginPath(); ellipse(ctx, 26, 0, 46 * g, 24 * g); ctx.fill();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // five licking flame tongues: wavy edges, curling tips, a new shape every frame (hashed from the frame number)
  const h = (i, j) => { const v = Math.sin((fr * 7.13 + i * 3.7 + j * 1.9) * 12.9898) * 43758.5453; return v - Math.floor(v); };
  for (const i of [0, 4, 1, 3, 2]) {
    const mid = i === 2, L = (mid ? 92 : 58 + 22 * h(i, 0)) * g, off = (i - 2) * 7 * g, w = (mid ? 13 : 9 + 3 * h(i, 1)) * g;
    const curl = (h(i, 2) - 0.5) * 18 * g, wob = (h(i, 3) - 0.5) * 6;
    flat(ctx, (c) => {
      c.moveTo(-4, off - w * 0.8);
      c.quadraticCurveTo(L * 0.25, off - w * 1.25 + wob, L * 0.5, off - w * 0.75 - wob);
      c.quadraticCurveTo(L * 0.75, off - w * 0.6 + wob, L, off + curl);
      c.quadraticCurveTo(L * 0.72, off + w * 0.55 - wob, L * 0.5, off + w * 0.8 + wob);
      c.quadraticCurveTo(L * 0.22, off + w * 1.2 - wob, -4, off + w * 0.8);
      c.closePath();
    }, mid ? C.gem : (i % 2 ? C.gemD : '#3fe56e'), 2 * LW);
    if (mid) {   // inner bright tongue
      flat(ctx, (c) => { c.moveTo(-2, off - w * 0.4); c.quadraticCurveTo(L * 0.4, off - w * 0.6, L * 0.75, off + curl * 0.6); c.quadraticCurveTo(L * 0.4, off + w * 0.6, -2, off + w * 0.4); c.closePath(); }, C.fire, 0);
    }
  }
  // white-yellow hot core at the mouth
  flat(ctx, (c) => { c.moveTo(-4, -6 * g); c.quadraticCurveTo(22 * g, -8 * g, 38 * g, 0); c.quadraticCurveTo(22 * g, 8 * g, -4, 6 * g); c.closePath(); }, '#f7ffd0', 0);
  flat(ctx, (c) => { c.moveTo(-2, -3 * g); c.quadraticCurveTo(12 * g, -4 * g, 22 * g, 0); c.quadraticCurveTo(12 * g, 4 * g, -2, 3 * g); c.closePath(); }, '#ffffff', 0);
  // embers
  ctx.fillStyle = C.gemC;
  for (let i = 0; i < 6; i++) { const u = (T * 2.4 + i / 6) % 1; ctx.globalAlpha = 1 - u; ctx.beginPath(); circle(ctx, 30 + u * 70, (h(i, 6) - 0.5) * 40 * u - u * 14, 2.4 * (1 - u) + 0.6); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.restore();
}
// the fire gathering in his jaws during breathWind: sparks drawn INTO the mouth, a glow between the teeth
function gatherSparks(ctx, p) {
  const g = clamp(p.gather, 0, 1), ja = JAWA, mx = 80, my = (HINGE[1] + 80 * Math.sin(ja) + 2) / 2;
  ctx.save(); ctx.translate(mx, my);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * g; ctx.fillStyle = C.gemD; ctx.beginPath(); circle(ctx, -6, 0, 16 + 8 * g); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = C.gemC;
  for (let i = 0; i < 7; i++) {
    const u = (T * 1.6 + i / 7) % 1, a = i * 2.4, r = 70 * (1 - u) + 6;
    ctx.globalAlpha = g * Math.min(1, u * 3); ctx.beginPath(); circle(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.7, 2.6 * u + 0.8); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function nostrilSmoke(ctx, p) {
  const green = p.glow > 0.05;
  ctx.fillStyle = green ? C.glow : C.puff;
  for (let i = 0; i < 3; i++) {
    const u = (T * 1.3 + i / 3) % 1;
    ctx.globalAlpha = (green ? 0.75 * p.glow : 0.85) * (1 - u);
    ctx.beginPath(); circle(ctx, 84 + u * 16, -26 - u * 22, 3 + u * 6); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// big haughty eye: glowing green, heavy lids and a theatrical brow
function eye(ctx, p) {
  const face = p.face, x = 34, y = -24, rx = 10, ry = 8.5;
  let lid = 0.42, slant = 0.12, brow = -3, bTilt = -0.2;   // lid: 0 open .. 1 shut; slant: + = lower at the front
  if (face === 'grin' || face === 'smug') { lid = 0.5; slant = -0.05; brow = -6; bTilt = -0.34; }
  else if (face === 'roar' || face === 'breath') { lid = 0.12; slant = 0.25; brow = 1; bTilt = 0.34; }
  else if (face === 'furious') { lid = 0.3; slant = 0.35; brow = 2; bTilt = 0.44; }
  else if (face === 'surprised' || face === 'aghast') { lid = 0; slant = 0; brow = -13; bTilt = face === 'aghast' ? -0.44 : -0.12; }
  else if (face === 'ouch') { brow = 0; bTilt = 0.1; }
  const shut = face === 'ouch' || (p.blink && face !== 'dizzy' && face !== 'surprised' && face !== 'aghast');
  if (shut) {
    flat(ctx, (c) => ellipse(c, x, y, rx, ry), C.scD, 0);
    ink(ctx, (c) => face === 'ouch' ? (c.moveTo(x - 8, y - 6), c.lineTo(x + 6, y), c.lineTo(x - 8, y + 6)) : (c.moveTo(x - 9, y), c.quadraticCurveTo(x, y + 4.5, x + 9, y)), 3 * LW);
  } else {
    ctx.save();
    ctx.beginPath(); ellipse(ctx, x, y, rx, ry); ctx.clip();
    if (face === 'dizzy') {
      ctx.fillStyle = '#f3fff0'; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
      ctx.restore();
      ink(ctx, (c) => { for (let a = 0; a < 4 * Math.PI; a += 0.3) { const r = 7.5 * a / (4 * Math.PI), aa = a + T * 6; a ? c.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r) : c.moveTo(x, y); } }, 2.2 * LW);
      ctx.save(); ctx.beginPath(); ellipse(ctx, x, y, rx, ry); ctx.clip();
    } else {
      const pl = 0.88 + 0.12 * Math.sin(T * 6), small = face === 'surprised' || face === 'aghast';
      ctx.fillStyle = C.gemD; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
      ctx.fillStyle = C.gem; ctx.beginPath(); ellipse(ctx, x + 1, y + 0.5, rx * 0.74 * pl, ry * 0.74 * pl); ctx.fill();
      ctx.fillStyle = C.gemC; ctx.beginPath(); ellipse(ctx, x + 1.4, y + 0.5, rx * 0.34 * pl, ry * 0.36 * pl); ctx.fill();
      ctx.fillStyle = '#123d22'; ctx.beginPath();
      if (face === 'aghast') circle(ctx, x - 1, y - 4.5, 2.2);           // eyes rolled up at the cracking crown
      else if (small) circle(ctx, x + 2, y + 0.5, 2); else ellipse(ctx, x + 3, y + 0.6, 1.9, ry * 0.64);
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, x - 3.4, y - 3, 2); ctx.fill();
      if (lid > 0.01) {   // heavy upper lid
        const y0 = y - ry + lid * ry * 2 * (1 - slant), y1 = y - ry + lid * ry * 2 * (1 + slant);
        ctx.fillStyle = C.sc; ctx.beginPath(); ctx.moveTo(x - rx - 1, y - ry - 1); ctx.lineTo(x + rx + 1, y - ry - 1); ctx.lineTo(x + rx + 1, y1); ctx.lineTo(x - rx - 1, y0); ctx.closePath(); ctx.fill();
        ink(ctx, (c) => { c.moveTo(x - rx - 1, y0); c.lineTo(x + rx + 1, y1); }, 3 * LW);
      }
    }
    ctx.restore();
    ink(ctx, (c) => ellipse(c, x, y, rx, ry), 2.8 * LW);
  }
  // brow ridge: a thick arched plate that does the acting
  ctx.save(); ctx.translate(x - 1, y - ry + brow); ctx.rotate(bTilt);
  cel(ctx, (c) => { c.moveTo(-18, 4); c.quadraticCurveTo(-14, -8, 2, -8.5); c.quadraticCurveTo(16, -8, 21, 2); c.quadraticCurveTo(2, 1, -18, 4); c.closePath(); },
    C.scD, C.blkD, { k: 0.8, lw: 2.8 * LW });
  ctx.restore();
}
// swept-back ivory horn: tapered, ridged, curving back then up
const HN = 9;
const HX = new Float64Array(HN + 1), HY = new Float64Array(HN + 1), HA = new Float64Array(HN + 1);
function horn(ctx, x0, y0, far) {
  let a = Math.PI + 0.12, x = x0, y = y0;
  for (let i = 0; i <= HN; i++) {
    if (i) { a += 0.07 + i * 0.016; x += Math.cos(a) * 9; y += Math.sin(a) * 9; }
    HX[i] = x; HY[i] = y; HA[i] = a;
  }
  const hw = (i) => lerp(9, 1.8, i / HN);
  cel(ctx, (c) => {
    for (let i = 0; i <= HN; i++) { const px = HX[i] - Math.sin(HA[i]) * hw(i), py = HY[i] + Math.cos(HA[i]) * hw(i); i ? c.lineTo(px, py) : c.moveTo(px, py); }
    for (let i = HN; i >= 0; i--) c.lineTo(HX[i] + Math.sin(HA[i]) * hw(i), HY[i] - Math.cos(HA[i]) * hw(i));
    c.closePath();
  }, far ? C.hornD : C.horn, C.hornD, { k: 1.2, lw: 3 * LW, detail: far ? null : (c) => {
    c.strokeStyle = C.hornL; c.lineWidth = 1.5 * LW; c.beginPath();
    for (let i = 1; i < HN - 1; i++) { c.moveTo(HX[i] - Math.sin(HA[i]) * hw(i), HY[i] + Math.cos(HA[i]) * hw(i)); c.lineTo(HX[i] + Math.sin(HA[i]) * hw(i), HY[i] - Math.cos(HA[i]) * hw(i)); }
    c.stroke();
  } });
}

// -------------------------------------------------- THE EMBER CROWN (head frame): black-gold band, flame points, green flame-gems
function crown(ctx, p) {
  if (p.crownOff) return;
  ctx.save();
  ctx.translate(8, -42); ctx.rotate(-0.24 + (p.cslip || 0) * DEG); ctx.scale(1.2, 1.2);
  const lw0 = LW; LW = lw0 / 1.2;
  drawCrownShape(ctx, clamp(p.blaze, 0, 1), CRACK, 1);
  LW = lw0;
  ctx.restore();
}
const CPTS = [[-26, 0], [-28, -22], [-20, -14], [-14, -36], [-6, -18], [0, -46], [6, -18], [14, -36], [20, -14], [28, -22], [26, 0]];
function drawCrownShape(ctx, blaze, crack, alive) {
  const pulse = 0.8 + 0.2 * Math.sin(T * 5), live = alive * (1 - 0.7 * clamp((crack - 0.6) / 0.4, 0, 1));
  const gemCol = live > 0.3 ? C.gem : '#2f8f4a';
  if (live > 0.05) {
    crownBlaze(ctx, blaze);
    // green ember-flames burning on every prong gem (roaring up when he blazes)
    for (const [i, s] of [[1, 0.6], [3, 0.85], [5, 1.15], [7, 0.85], [9, 0.6]]) {
      const [gx, gy] = CPTS[i], ph = T * 9 + i * 1.7, h = (12 + 36 * blaze) * s * (0.78 + 0.22 * Math.sin(ph)) * live;
      flat(ctx, (c) => { c.moveTo(gx - 4.5 * s, gy - 3); c.quadraticCurveTo(gx - 5.5 * s, gy - h * 0.6, gx + Math.sin(ph) * 2.5, gy - 3 - h);
        c.quadraticCurveTo(gx + 5.5 * s, gy - h * 0.5, gx + 4.5 * s, gy - 3); c.closePath(); }, C.gem, 0);
      ctx.fillStyle = C.gemC; ctx.beginPath(); ellipse(ctx, gx, gy - 3 - h * 0.32, 2 * s, h * 0.26); ctx.fill();
    }
  }
  // gold flame-shaped prongs with a black flame inlay
  cel(ctx, (c) => {
    c.moveTo(CPTS[0][0], CPTS[0][1]);
    for (let i = 1; i < CPTS.length; i++) {
      const [x, y] = CPTS[i], [px, py] = CPTS[i - 1];
      c.quadraticCurveTo((x + px) / 2 + (y < py ? -3 : 3), (y + py) / 2, x, y);
    }
    c.closePath();
  }, C.gold, C.goldD, { k: 1.2, lw: 3 * LW, hi: C.goldH, hk: 0.3, detail: (c) => {
    c.fillStyle = C.blk; c.beginPath();
    for (const i of [3, 5, 7]) { const [x, y] = CPTS[i]; c.moveTo(x * 0.85 - 5, -4); c.quadraticCurveTo(x * 0.85 - 4, y * 0.55, x * 0.85, y * 0.72 + 2); c.quadraticCurveTo(x * 0.85 + 4, y * 0.55, x * 0.85 + 5, -4); c.closePath(); }
    for (const i of [1, 9]) { const [x, y] = CPTS[i]; c.moveTo(x * 0.86 - 3, -4); c.lineTo(x * 0.86, y * 0.7); c.lineTo(x * 0.86 + 3, -4); c.closePath(); }
    c.fill();
  } });
  // flame-shaped (teardrop) gems tipping each prong
  for (const [i, r] of [[1, 3.2], [3, 4], [5, 5], [7, 4], [9, 3.2]]) {
    const [gx, gy] = CPTS[i], y = gy + 1;
    flat(ctx, (c) => { c.moveTo(gx, y - r * 1.7); c.quadraticCurveTo(gx + r * 1.1, y - r * 0.2, gx + r * 0.8, y + r * 0.5); c.quadraticCurveTo(gx, y + r * 1.2, gx - r * 0.8, y + r * 0.5); c.quadraticCurveTo(gx - r * 1.1, y - r * 0.2, gx, y - r * 1.7); c.closePath(); }, gemCol, 2 * LW);
    ctx.fillStyle = C.gemC; ctx.beginPath(); ellipse(ctx, gx - r * 0.3, y - r * 0.5, r * 0.28, r * 0.45, 0.3); ctx.fill();
  }
  // black band with gold rims and studs
  cel(ctx, (c) => { c.moveTo(-29, -9); c.quadraticCurveTo(0, -5, 29, -9); c.lineTo(29, 7); c.quadraticCurveTo(0, 11, -29, 7); c.closePath(); },
    C.blk, C.blkD, { k: 1, hi: C.blkH, hk: 0.3, lw: 3 * LW, detail: (c) => {
      c.strokeStyle = C.gold; c.lineWidth = 3 * LW; c.beginPath();
      c.moveTo(-29, -7.5); c.quadraticCurveTo(0, -3.5, 29, -7.5); c.moveTo(-29, 5.5); c.quadraticCurveTo(0, 9.5, 29, 5.5); c.stroke();
      c.fillStyle = C.gold; c.beginPath(); for (const x of [-21, -13, 13, 21]) circle(c, x, 0 + Math.abs(x) * 0.01, 1.9); c.fill();
    } });
  // the great heart-gem (teardrop) in a gold setting; cracks spread across it with `crack`
  const gx = 0, gy = -5;
  if (live > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 * pulse * live; ctx.fillStyle = C.gemD; ctx.beginPath(); circle(ctx, gx, gy, 17 + 7 * blaze); ctx.fill(); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  flat(ctx, (c) => { c.moveTo(gx, gy - 18); c.quadraticCurveTo(gx + 14, gy - 2, gx + 10.5, gy + 7); c.quadraticCurveTo(gx, gy + 15, gx - 10.5, gy + 7); c.quadraticCurveTo(gx - 14, gy - 2, gx, gy - 18); c.closePath(); }, C.gold, 2.6 * LW);
  const gem = (c) => { c.moveTo(gx, gy - 13.5); c.quadraticCurveTo(gx + 10, gy - 1, gx + 7.6, gy + 5); c.quadraticCurveTo(gx, gy + 10.5, gx - 7.6, gy + 5); c.quadraticCurveTo(gx - 10, gy - 1, gx, gy - 13.5); c.closePath(); };
  flat(ctx, gem, gemCol, 2 * LW);
  ctx.fillStyle = C.gemD; ctx.beginPath(); ctx.moveTo(gx + 7, gy + 1); ctx.quadraticCurveTo(gx + 5, gy + 8, gx - 2, gy + 9); ctx.quadraticCurveTo(gx + 3.5, gy + 4, gx + 7, gy + 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = blaze > 0.5 ? '#ffffff' : C.gemC; ctx.beginPath(); ellipse(ctx, gx - 3, gy - 4, 2.1, 4, 0.3); ctx.fill();
  if (live > 0.3) {   // a twinkle on the heart-gem
    const tw = 2.5 + 2.5 * Math.max(0, Math.sin(T * 3.1)), tx = gx + 5, ty = gy - 9;
    ctx.fillStyle = '#ffffff'; ctx.beginPath();
    ctx.moveTo(tx, ty - tw * 1.6); ctx.quadraticCurveTo(tx, ty, tx + tw, ty); ctx.quadraticCurveTo(tx, ty, tx, ty + tw * 1.6); ctx.quadraticCurveTo(tx, ty, tx - tw, ty); ctx.quadraticCurveTo(tx, ty, tx, ty - tw * 1.6); ctx.closePath(); ctx.fill();
  }
  crownCracks(ctx, crack);
}
// rays of power fanning out of the crown + sparks rising off it (crown frame), when he blazes
function crownBlaze(ctx, blaze) {
  if (blaze > 0.25) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 * (blaze - 0.3) / 0.7 + 0.05; ctx.fillStyle = C.glow; ctx.beginPath();
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.32 + Math.sin(T * 2 + i) * 0.05, L = 90 + 20 * Math.sin(T * 6 + i * 2);
      ctx.moveTo(Math.cos(a - 0.06) * 18, -20 + Math.sin(a - 0.06) * 18); ctx.lineTo(Math.cos(a) * L, -20 + Math.sin(a) * L); ctx.lineTo(Math.cos(a + 0.06) * 18, -20 + Math.sin(a + 0.06) * 18); }
    ctx.fill(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  if (blaze > 0.05) {
    ctx.fillStyle = C.gemC;
    for (let i = 0; i < 6; i++) { const u = (T * 1.1 + i / 6) % 1, x = Math.sin(i * 2.4 + T * 3) * 26 * (0.4 + u); ctx.globalAlpha = blaze * (1 - u); ctx.beginPath(); circle(ctx, x, -44 - u * 70, 2.2 * (1 - u) + 0.8); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}
// glowing fissures (crown frame: the heart-gem at (0, -5)): a dark edge with a bright core, spreading over the gem and then
// the crown as `crack` grows 0..1
function crownCracks(ctx, crack) {
  if (crack <= 0.02) return;
  const gx = 0, gy = -5;
  const cracks = (c) => {
    c.moveTo(gx - 1, gy - 12); c.lineTo(gx + 1.5, gy - 5); c.lineTo(gx - 2, gy + 1); c.lineTo(gx + 0.5, gy + 8);
    if (crack > 0.3) { c.moveTo(gx + 1.5, gy - 5); c.lineTo(gx + 8, gy - 2); c.moveTo(gx - 2, gy + 1); c.lineTo(gx - 8.5, gy + 2); }
    if (crack > 0.55) { c.moveTo(gx + 8, gy - 2); c.lineTo(gx + 13, gy - 7); c.moveTo(gx - 8.5, gy + 2); c.lineTo(gx - 14, gy - 3); c.moveTo(-14, -30); c.lineTo(-11, -16); c.lineTo(-15, -8); }
    if (crack > 0.75) { c.moveTo(14, -32); c.lineTo(11, -20); c.lineTo(15, -9); c.moveTo(-21, -7); c.lineTo(-17, 5); c.moveTo(0, -42); c.lineTo(2, -30); c.lineTo(-2, -22); }
    if (crack > 0.9) { c.moveTo(23, -8); c.lineTo(19, 5); c.moveTo(-24, -16); c.lineTo(-20, -6); }
  };
  ink(ctx, cracks, 6 * LW);
  ink(ctx, cracks, 2.8 * LW, crack > 0.5 && Math.sin(T * 40) > -0.3 ? '#ffffff' : C.gemC);
}

// -------------------------------------------------- smoky beard + whiskers (torso frame; they hang with gravity and lag behind)
// strands: anchor (head frame), length, start angle (deg in the head frame: 0 = along the snout, 90 = down), width, phase,
// kind (0 = far whisker, 1 = beard tuft, 2 = near whisker), back sweep, end curl (deg per step), wave
const STRANDS = [
  [70, -4, 112, 168, 3.2, 1.6, 0, 0.3, -10, 0.7],
  [40, 12, 66, 104, 10, 2.2, 1, 0.1, 6, 0.3],
  [66, 10, 58, 82, 9, 1.1, 1, 0.04, -8, 0.3],
  [53, 14, 94, 93, 12, 0.4, 1, 0.08, 10, 0.35],
  [80, -4, 128, 160, 3.8, 0, 2, 0.26, -12, 0.8],
];
const BP = 8, NS = STRANDS.length;
// authored S-curves for the two whiskers (world px from the lip: x = forward, y = down); they sway and lag on top
const WHISK = [
  [[0, 0], [-6, 7], [-14, 15], [-24, 20], [-34, 26], [-42, 36], [-44, 48], [-38, 56], [-30, 55]],       // far: back under the jaw
  [[0, 0], [10, 6], [16, 18], [12, 32], [3, 44], [-1, 58], [5, 70], [17, 75], [25, 69]],               // near: hangs in an S, curls up
];
const BXs = Array.from({ length: NS }, () => new Float64Array(BP + 1)), BYs = Array.from({ length: NS }, () => new Float64Array(BP + 1));
const EL = new Float64Array(2 * (BP + 1)), ER = new Float64Array(2 * (BP + 1));
function strandPath(c, si) {
  const X = BXs[si], Y = BYs[si], w0 = STRANDS[si][4];
  for (let i = 0; i <= BP; i++) {
    const j0 = Math.max(0, i - 1), j1 = Math.min(BP, i + 1);
    const tx = X[j1] - X[j0], ty = Y[j1] - Y[j0], d = Math.hypot(tx, ty) || 1, w = w0 * (1 - Math.pow(i / BP, 1.2) * 0.85);
    EL[2 * i] = X[i] - ty / d * w; EL[2 * i + 1] = Y[i] + tx / d * w;
    ER[2 * i] = X[i] + ty / d * w; ER[2 * i + 1] = Y[i] - tx / d * w;
  }
  // smooth edges through the midpoints, rounded tip
  c.moveTo(EL[0], EL[1]);
  for (let i = 1; i < BP; i++) c.quadraticCurveTo(EL[2 * i], EL[2 * i + 1], (EL[2 * i] + EL[2 * i + 2]) / 2, (EL[2 * i + 1] + EL[2 * i + 3]) / 2);
  c.lineTo(EL[2 * BP], EL[2 * BP + 1]);
  const ex = X[BP] - X[BP - 1], ey = Y[BP] - Y[BP - 1], el = Math.hypot(ex, ey) || 1;
  c.quadraticCurveTo(X[BP] + ex / el * w0 * 0.6, Y[BP] + ey / el * w0 * 0.6, ER[2 * BP], ER[2 * BP + 1]);
  for (let i = BP - 1; i > 0; i--) c.quadraticCurveTo(ER[2 * i], ER[2 * i + 1], (ER[2 * i] + ER[2 * i - 2]) / 2, (ER[2 * i + 1] + ER[2 * i - 1]) / 2);
  c.lineTo(ER[0], ER[1]);
  c.closePath();
}
function beard(ctx, p, hx, hy) {
  const hr = p.head * DEG, tr = p.tor * DEG, rr = (p.rot || 0) * DEG;
  // world "down" and "back" expressed in the torso frame
  const gx = Math.sin(tr - rr), gy = Math.cos(tr - rr), bx = -Math.cos(tr - rr), by = Math.sin(tr - rr);
  const lag = SM.beard, blow = clamp(p.glow, 0, 1) * 1.6 + (p.face === 'roar' ? 0.35 : 0) + p.stream * 2.5;
  for (let si = 0; si < NS; si++) {
    const [ax0, ay0, len, a0, , ph, kind, sweep, curl, wv] = STRANDS[si];
    let ax = ax0, ay = ay0, ja = 0;
    if (kind === 1) { ja = JAWA; [ax, ay] = rot2(ax0 - HINGE[0], ay0 - HINGE[1], ja); ax += HINGE[0]; ay += HINGE[1]; }   // the beard rides on the jaw
    let [x, y] = rot2(ax * HS, ay * HS, hr); x += hx; y += hy;
    let dx = Math.cos(a0 * DEG + hr + ja), dy = Math.sin(a0 * DEG + hr + ja);
    const L = len / BP, X = BXs[si], Y = BYs[si];
    for (let i = 0; i <= BP; i++) {
      X[i] = x; Y[i] = y;
      const u = i / BP, wave = Math.sin(T * 2.3 + ph - u * 6) * wv * u;
      const back = sweep * (0.3 + u) + lag * 0.012 + blow * (0.2 + 0.6 * u);
      dx = dx * 0.74 + gx * 0.26 + bx * back + (-gy) * wave;
      dy = dy * 0.74 + gy * 0.26 + by * back + gx * wave;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      if (curl && u > 0.55) { const ca = Math.cos(curl * DEG), sa = Math.sin(curl * DEG); const nx = dx * ca - dy * sa; dy = dx * sa + dy * ca; dx = nx; }
      x += dx * L; y += dy * L;
    }
    if (si === 0 || si === 4) {   // whiskers: authored shape in world axes (forward = -back, down = g)
      const W = WHISK[si ? 1 : 0], x0 = X[0], y0 = Y[0];
      for (let i = 0; i <= BP; i++) {
        const u = i / BP, sway = Math.sin(T * 2.1 + ph + i * 0.7) * 3.5 * u, drift = (lag * 0.25 + Math.min(blow, 1.2) * 26 + p.stream * 90) * u;
        const fx = W[i][0] + sway - drift, fy = W[i][1] * (1 - Math.min(0.85, 0.3 * blow) * u);
        X[i] = x0 - bx * fx + gx * fy; Y[i] = y0 - by * fx + gy * fy;
      }
    }
  }
  // far whisker (behind the beard)
  cel(ctx, (c) => strandPath(c, 0), C.smokeD, C.smokeL, { k: 1, lw: 2.2, ink: C.smokeL });
  // the beard: tufts merged into one smoky silhouette (outline pass, then the fills)
  ctx.beginPath(); for (let si = 1; si <= 3; si++) strandPath(ctx, si);
  ctx.lineWidth = 4.4; ctx.lineJoin = 'round'; ctx.strokeStyle = C.smokeL; ctx.stroke();
  for (let si = 1; si <= 3; si++) cel(ctx, (c) => strandPath(c, si), C.smoke, C.smokeD, { k: 1.4, lw: 0 });
  ink(ctx, (c) => { for (let si = 1; si <= 3; si++) { const X = BXs[si], Y = BYs[si]; c.moveTo(X[1], Y[1]); for (let i = 2; i < BP - 1; i++) c.lineTo(X[i], Y[i]); } }, 1.4, C.smokeD);
  // near whisker on top
  cel(ctx, (c) => strandPath(c, 4), C.smoke, C.smokeD, { k: 1, lw: 2.2, ink: C.smokeL });
  // the ends dissolve into soft rising smoke
  for (const si of [0, 3, 4, 1]) {
    const ex = BXs[si][BP], ey = BYs[si][BP], pu = (T * 0.7 + STRANDS[si][5] * 0.3) % 1;
    ctx.globalAlpha = 0.32 * Math.sin(pu * Math.PI);
    ctx.fillStyle = C.smoke; ctx.beginPath();
    const sx = ex - gx * pu * 14 + bx * pu * 8, sy = ey - gy * pu * 14 + by * pu * 8, r = 3 + pu * 6;
    circle(ctx, sx, sy, r); circle(ctx, sx + r * 0.8, sy - r * 0.5, r * 0.7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// -------------------------------------------------- arms (torso frame) with ringed claws
function arm(ctx, p, near) {
  const sh = near ? SH_N : SH_F, u = (near ? p.au : p.bu) * DEG, fa = u + (near ? p.af : p.bf) * DEG, hs = near ? p.ah : p.bh;
  const ex = sh[0] + Math.sin(u) * UPPER, ey = sh[1] + Math.cos(u) * UPPER;
  const hx = ex + Math.sin(fa) * FORE, hy = ey + Math.cos(fa) * FORE;
  const sc = near ? C.sc : C.scF, scd = near ? C.scD : C.scFD;
  ctx.save(); ctx.translate(sh[0], sh[1]); ctx.rotate(-u);
  celR(ctx, (c) => capsule(c, UPPER, 38, 31), sc, scd, { k: 2, lw: 3.2, hi: near ? C.scH : null, hk: 0.3,
    detail: near ? (c) => scaleTex(c, -16, 4, 6, UPPER, C.scL, 4) : null }, 2);
  ctx.restore();
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(-fa);
  celR(ctx, (c) => capsule(c, FORE, 31, 25), sc, scd, { k: 1.8, lw: 3.2, detail: (c) => {
    c.fillStyle = near ? C.bel : C.belL; c.beginPath(); c.moveTo(4, 2); c.quadraticCurveTo(13, FORE * 0.5, 8, FORE - 2); c.lineTo(3, FORE - 2); c.quadraticCurveTo(7, FORE * 0.5, 1, 4); c.closePath(); c.fill();
  } }, 2);
  // gold bangles at the wrist
  cel(ctx, (c) => { c.moveTo(-14, FORE - 13); c.quadraticCurveTo(0, FORE - 10, 14, FORE - 13); c.lineTo(13.5, FORE - 3); c.quadraticCurveTo(0, FORE, -13.5, FORE - 3); c.closePath(); },
    near ? C.gold : C.goldF, C.goldD, { k: 0.8, lw: 2.6, hi: near ? C.goldH : null, hk: 0.45, detail: (c) => { c.strokeStyle = C.goldD; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-12, FORE - 7); c.quadraticCurveTo(0, FORE - 4, 12, FORE - 7); c.stroke(); } });
  ctx.translate(0, FORE - 2); ctx.scale(1.3, 1.3);
  hand(ctx, hs, near);
  if (near && p.glint > 0.05) {   // a wicked green glint on the cocked claws
    const g = p.glint, r = 5 + 6 * g * (0.8 + 0.2 * Math.sin(T * 20));
    ctx.fillStyle = C.gemC; ctx.globalAlpha = g; ctx.beginPath(); starPath(ctx, 4, 34, r, r * 0.22, 4, 0.3); ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.restore();
}
// hand frame: wrist at 0,0, +y along the forearm; knuckles towards +x (the palm faces -x)
function hand(ctx, kind, near) {
  const sc = near ? C.sc : C.scF, scd = near ? C.scD : C.scFD, cl = near ? C.claw : C.clawD;
  const finger = (x0, y0, a, len, w, bend) => {
    // a: direction (rad) from +y; bend curls the tip (rad)
    const dx = Math.sin(a), dy = Math.cos(a);
    const mx = x0 + dx * len * 0.55, my = y0 + dy * len * 0.55;
    const tx = mx + Math.sin(a + bend) * len * 0.5, ty = my + Math.cos(a + bend) * len * 0.5;
    return [mx, my, tx, ty];
  };
  const drawFinger = (x0, y0, a, len, w, bend, ring) => {
    const [mx, my, tx, ty] = finger(x0, y0, a, len, w, bend);
    const ca = a + bend;
    // claw at the tip
    flat(ctx, (c) => { const nx = Math.cos(ca), ny = -Math.sin(ca);
      c.moveTo(tx + nx * w * 0.6, ty + ny * w * 0.6); c.quadraticCurveTo(tx + Math.sin(ca) * 13 + nx * 3, ty + Math.cos(ca) * 13 + ny * 3, tx + Math.sin(ca + 0.55) * 15, ty + Math.cos(ca + 0.55) * 15);
      c.quadraticCurveTo(tx + Math.sin(ca) * 6, ty + Math.cos(ca) * 6, tx - nx * w * 0.6, ty - ny * w * 0.6); c.closePath(); }, cl, 2);
    ink(ctx, (c) => { c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, tx, ty); }, w + 5.4);
    ink(ctx, (c) => { c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, tx, ty); }, w, sc);
    if (ring) {   // a gold band wrapped round the finger, a gem set on top of it
      ctx.save(); ctx.translate(lerp(x0, mx, 0.62), lerp(y0, my, 0.62)); ctx.rotate(-a);
      const hw = w * 0.5 + 1.3;
      flat(ctx, (c) => { c.moveTo(-hw, -2.6); c.quadraticCurveTo(0, -1.4, hw, -2.6); c.lineTo(hw, 2.6); c.quadraticCurveTo(0, 3.8, -hw, 2.6); c.closePath(); }, near ? C.gold : C.goldF, 1.5);
      flat(ctx, (c) => ellipse(c, 0, 0.4, 2.6, 2.3), ring === 2 ? C.ruby : C.gem, 1.2);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); circle(ctx, -0.8, -0.4, 0.8); ctx.fill();
      ctx.restore();
    }
  };
  if (kind === 'fist') {
    cel(ctx, (c) => blob(c, [[-12, -2], [0, -4], [13, 0], [16, 12], [10, 22], [-4, 22], [-13, 12]], 0.6), sc, scd, { k: 1.4, lw: 3 });
    ink(ctx, (c) => { c.moveTo(6, 4); c.quadraticCurveTo(12, 12, 6, 20); c.moveTo(0, 5); c.quadraticCurveTo(5, 13, 0, 20); }, 1.6, scd);
    flat(ctx, (c) => { c.moveTo(11, 4); c.quadraticCurveTo(15, 3.5, 17, 6); c.lineTo(17.5, 11); c.quadraticCurveTo(15, 12, 12, 11); c.closePath(); }, near ? C.gold : C.goldF, 1.5);
    flat(ctx, (c) => ellipse(c, 15, 7.6, 2.4, 2.2), C.ruby, 1.2);
    return;
  }
  // palm
  cel(ctx, (c) => blob(c, [[-11, -2], [0, -4], [11, -1], [13, 10], [8, 17], [-6, 17], [-12, 9]], 0.6), sc, scd, { k: 1.3, lw: 3 });
  if (kind === 'open') {
    drawFinger(-8, 14, -0.55, 22, 7, -0.25, 0);
    drawFinger(-2, 16, -0.15, 25, 7, -0.15, 2);
    drawFinger(5, 16, 0.2, 24, 7, -0.05, 3);
    drawFinger(10, 10, 0.75, 18, 6.5, 0.1, 0);
  } else if (kind === 'point') {
    drawFinger(-6, 15, 0.2, 14, 7, 1.6, 0);
    drawFinger(0, 16, 0.25, 14, 7, 1.7, 2);
    drawFinger(8, 14, 0.05, 30, 7, 0, 3);
    drawFinger(11, 8, 0.9, 12, 6.5, 0.6, 0);
  } else if (kind === 'claw') {
    drawFinger(-8, 14, -0.2, 22, 7, 0.9, 0);
    drawFinger(-1, 16, 0.05, 24, 7, 0.95, 2);
    drawFinger(6, 15, 0.3, 23, 7, 1, 3);
    drawFinger(11, 9, 0.8, 16, 6.5, 0.8, 0);
  } else {   // rest: fingers loosely curled
    drawFinger(-7, 14, 0, 18, 7, 0.6, 0);
    drawFinger(-1, 16, 0.1, 20, 7, 0.55, 2);
    drawFinger(6, 15, 0.2, 19, 7, 0.5, 3);
    drawFinger(10, 9, 0.3, 11, 6.5, 1.1, 0);
  }
}

// -------------------------------------------------- claw smear (torso frame)
function smear(ctx, p) {
  const a0 = p.sa0, a1 = p.sa1, R = p.sr, n = 22;
  ctx.save();
  ctx.translate(p.scx, p.scy); ctx.scale(1, p.sf);
  ctx.globalAlpha = clamp(p.smear, 0, 1) * 0.85;
  const pt = (a, r) => [Math.sin(a * DEG) * r, Math.cos(a * DEG) * r];
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const [x, y] = pt(a0 + (a1 - a0) * (i / n), R + 10); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  for (let i = n; i >= 0; i--) { const u = i / n, th = 4 + 46 * Math.pow(u, 1.3); const [x, y] = pt(a0 + (a1 - a0) * u, R + 10 - th); ctx.lineTo(x, y); }
  ctx.closePath(); ctx.fillStyle = '#ecffe8'; ctx.fill();
  // three claw streaks inside the crescent
  ctx.globalAlpha = clamp(p.smear, 0, 1) * 0.7; ctx.strokeStyle = C.glow; ctx.lineWidth = 3; ctx.beginPath();
  for (const off of [6, 20, 34]) {
    for (let i = 0; i <= 12; i++) { const u = 0.35 + 0.65 * i / 12; const [x, y] = pt(a0 + (a1 - a0) * u, R - off * u); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}
// dizzy: little gold crowns and stars circling the head
function dizzyStars(ctx, p, hx, hy) {
  ctx.save(); ctx.translate(hx + 20, hy - 70); ctx.rotate(-p.tor * DEG + (p.rot || 0) * DEG);
  starRing(ctx);
  ctx.restore();
}
function starRing(ctx) {
  for (let i = 0; i < 4; i++) {
    const a = T * 3.4 + i * TAU / 4, sx = Math.cos(a) * 58, sy = Math.sin(a) * 13;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1.5, 1.5);
    if (i % 2) flat(ctx, (c) => starPath(c, 0, 0, 7.5, 3), C.star, 1.6);
    else flat(ctx, (c) => { c.moveTo(-7, 4); c.lineTo(-8, -5); c.lineTo(-3.5, -1); c.lineTo(0, -7); c.lineTo(3.5, -1); c.lineTo(8, -5); c.lineTo(7, 4); c.closePath(); }, C.gold, 1.6);
    ctx.restore();
  }
}

// ======================================================================= DEFEAT: shatter + shrink
// shard flight directions (unit-ish) + spin, fixed so the effect is deterministic
// kind: 0 = gold prong with a green gem, 1 = black-gold band piece, 2 = the green heart-gem chunk
const SHARDS = [[-1, -1.4, 3, 0], [0.9, -1.6, -4, 1], [1.6, -0.6, 5, 0], [-1.7, -0.4, -3, 1], [0.2, -2, 2, 2], [-0.6, -1.9, -6, 0], [1.3, -1.2, 4, 2]];
const PUFFS = [[-40, -60, 0.14, 26], [36, -110, 0.18, 30], [-10, -170, 0.2, 34], [50, -40, 0.24, 24], [-56, -130, 0.28, 30], [10, -90, 0.33, 40],
  [-30, -30, 0.36, 30], [30, -60, 0.4, 34], [0, -50, 0.43, 46], [-34, -24, 0.47, 30], [30, -30, 0.5, 28]];
function drawDefeat(ctx, p, o) {
  const k = p.dk;
  const crownP = crownOf(p);
  // big form: stands through the flash, then shrinks (squash-wobbling) into the smoke
  const shr = clamp((k - 0.16) / 0.42, 0, 1);
  const sBig = lerp(1, 0.2, ease.in(shr));
  if (k < 0.6) {
    const wob = Math.sin(k * 70) * 0.06 * shr;
    ctx.save(); ctx.scale(1 + wob, 1 - wob);
    drawBig(ctx, Object.assign({}, p, { crownOff: k > 0.12 }), o, sBig);
    ctx.restore();
  }
  // tiny form pops out of the cloud and settles with a bounce
  if (k > 0.56) {
    // pops up out of the cloud (big hop), lands with a squash, then two furious little stomps
    const arc = (k0, k1, h) => (k > k0 && k < k1 ? Math.sin((k - k0) / (k1 - k0) * Math.PI) * h : 0);
    const hop = arc(0.56, 0.72, 2.2) + arc(0.8, 0.86, 0.5) + arc(0.9, 0.96, 0.5);
    const sT = lerp(1.25, 1, ease.out(clamp((k - 0.56) / 0.16, 0, 1)));
    const mood = k < 0.76 ? 'stunned' : 'furious';
    drawTiny(ctx, { tiny: true, hop, fist: k > 0.76 ? Math.sin(T * 26) : 0, flap: Math.sin(T * 30), lean: 4, talk: 0, mood, caged: false }, o, sT);
  }
  drawDefeatFx(ctx, p, o, crownP);
}
/** The defeat's 2D effects (k = p.dk): the flash at the crown, the crown shards tumbling to the floor, the smoke puffs
 *  swallowing the shrinking body.  crownP: the crown (local px, facing right, scale 1), e.g. a 3D sprite's landmark. */
export function drawDefeatFx(ctx, p, o = {}, crownP = crownOf(p)) {
  const k = p.dk, f = o.facing || 1, S = o.scale || 1;
  T = o.t || 0;
  const shr = clamp((k - 0.16) / 0.42, 0, 1);
  ctx.save(); ctx.scale(S * f, S); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // flash: a big white-green starburst at the crown
  const fk = clamp((k - 0.08) / 0.16, 0, 1);
  if (fk > 0 && fk < 1) {
    const a = Math.sin(fk * Math.PI), R = 40 + 170 * fk;
    // expanding green shock ring + white star burst + rays
    ctx.globalAlpha = a * 0.45; ctx.strokeStyle = C.glow; ctx.lineWidth = 34 * (1 - fk) + 6;
    ctx.beginPath(); circle(ctx, crownP[0], crownP[1], R * 0.8); ctx.stroke();
    ctx.globalAlpha = a * 0.8; ctx.strokeStyle = C.gemC; ctx.lineWidth = 6 * (1 - fk) + 2;
    ctx.beginPath(); circle(ctx, crownP[0], crownP[1], R * 0.8); ctx.stroke();
    ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); starPath(ctx, crownP[0], crownP[1], R * 0.75, R * 0.16, 8, fk * 0.6); ctx.fill();
    ctx.fillStyle = C.gemC; ctx.beginPath(); circle(ctx, crownP[0], crownP[1], 14 + 20 * (1 - fk)); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // crown shards: tumble out and fall
  const sk = clamp((k - 0.12) / 0.8, 0, 1);
  if (sk > 0 && sk < 1) {
    ctx.globalAlpha = clamp((1 - sk) * 5, 0, 1);
    for (let i = 0; i < SHARDS.length; i++) {
      const [dx, dy, spin, kind] = SHARDS[i], tt = sk * 1.4, spinT = Math.min(tt, 0.95);
      // ballistic arc that lands on the floor (y = -6), then a little bounce
      const vy = dy * 150, G = 520, tLand = (-vy + Math.sqrt(vy * vy + 4 * G * Math.max(0, -6 - crownP[1]))) / (2 * G);
      const tl = Math.min(tt, tLand);
      let x = crownP[0] + dx * 150 * tl, y = crownP[1] + vy * tl + G * tl * tl;
      if (tt > tLand) { const b = tt - tLand; y = -6 - Math.abs(Math.sin(b * 12)) * 14 * Math.max(0, 1 - b * 3); x += dx * 40 * Math.min(b, 0.3); }
      if (kind === 2 && tt < 0.8) {   // a glowing trail behind the gem chunks
        ctx.strokeStyle = C.glow; ctx.lineWidth = 6; ctx.globalAlpha *= 0.5; ctx.beginPath();
        for (let j = 0; j <= 6; j++) { const t2 = Math.max(0, tt - j * 0.04); const xx = crownP[0] + dx * 150 * t2, yy = Math.min(-6, crownP[1] + dy * 150 * t2 + 520 * t2 * t2); j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke(); ctx.globalAlpha = 1 - Math.pow(sk, 3);
      }
      ctx.save(); ctx.translate(x, y); ctx.rotate(spin * spinT);
      ctx.scale(1.6, 1.6);
      if (kind === 2) {
        flat(ctx, (c) => { c.moveTo(0, -8); c.lineTo(6, -1); c.lineTo(2, 8); c.lineTo(-5, 3); c.lineTo(-4, -4); c.closePath(); }, C.gem, 1.4);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ellipse(ctx, -1.5, -2, 1.2, 2.4, 0.3); ctx.fill();
      } else if (kind === 0) {
        flat(ctx, (c) => { c.moveTo(-6, 6); c.quadraticCurveTo(-5, -4, 0, -12); c.quadraticCurveTo(5, -4, 6, 6); c.lineTo(2, 4); c.lineTo(-1, 7); c.closePath(); }, C.gold, 1.4);
        flat(ctx, (c) => circle(c, 0, -11, 3), C.gem, 1.2);
      } else {
        flat(ctx, (c) => { c.moveTo(-10, -4); c.quadraticCurveTo(0, -2, 10, -4); c.lineTo(8, 4); c.quadraticCurveTo(0, 6, -9, 4); c.closePath(); }, C.gold, 1.4);
        ctx.fillStyle = C.blk; ctx.beginPath(); ctx.moveTo(-8, -1); ctx.quadraticCurveTo(0, 1, 8, -1); ctx.lineTo(7, 2); ctx.quadraticCurveTo(0, 3.5, -7.5, 2); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  // puffing smoke clouds (cartoon puffs) swallowing the shrinking body
  for (const [px, py, k0, r] of PUFFS) {
    const u = (k - k0) / 0.24;
    if (u <= 0 || u >= 1) continue;
    const sc = Math.sin(u * Math.PI) * (u < 0.3 ? 1 : 1), rr = r * (0.5 + 0.8 * u) * (1 - 0.4 * shr * 0) ;
    const yy = py * lerp(1, 0.35, shr) - 20 * u, xx = px * lerp(1, 0.5, shr);
    ctx.globalAlpha = Math.min(1, sc * 1.4);
    flat(ctx, (c) => { circle(c, xx, yy, rr * 0.7); circle(c, xx + rr * 0.55, yy + rr * 0.15, rr * 0.5); circle(c, xx - rr * 0.55, yy + rr * 0.2, rr * 0.48); circle(c, xx + rr * 0.1, yy - rr * 0.45, rr * 0.45); }, C.puff, 0);
    ctx.fillStyle = C.puffD; ctx.beginPath(); ellipse(ctx, xx + rr * 0.15, yy + rr * 0.4, rr * 0.7, rr * 0.2); ctx.fill();
    ink(ctx, (c) => { c.moveTo(xx - rr * 0.9, yy + rr * 0.35); c.quadraticCurveTo(xx, yy + rr * 0.85, xx + rr * 0.95, yy + rr * 0.3); }, 2.4, C.puffD);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ======================================================================= TINY FORM (~45 px tall)
// drawn in design units at 2x (90 units tall) and scaled by TS = 0.5; ink widths are pre-doubled
const TS = 0.5;
function drawTiny(ctx, p, o, extra) {
  const f = o.facing || 1, S0 = (o.scale || 1) * extra, S = S0 * TS, t = p.t ?? T;
  ctx.save();
  ctx.scale(f * S0, S0);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const rattle = p.caged ? Math.max(0, 1 - (p.hop || 0) * 8) * Math.sin(t * 60) * 0.03 * (p.mood === 'sulk' ? 0 : 1) : 0;
  if (p.caged) ctx.rotate(rattle);
  if (p.caged) cage(ctx, t, 'back');
  ctx.save();
  ctx.scale(TS, TS);
  if (p.caged) ctx.translate(-8, CAGE.floorY / TS);
  const hop = p.hop || 0, fist = p.fist || 0, flap = p.flap || 0, mood = p.mood || 'furious';
  ctx.translate(0, -hop * 18);
  // squash on the ground, stretch in the air
  const sq = hop < 0.15 ? 1 - (0.15 - hop) * 0.6 : 1 + hop * 0.06;
  ctx.scale(1 / Math.sqrt(sq), sq);
  ctx.rotate((p.lean || 0) * DEG * 0.4);
  // tiny cape
  cel(ctx, (c) => { c.moveTo(-4, -62); c.quadraticCurveTo(-28, -52, -32 - flap * 2, -14); c.quadraticCurveTo(-18, -8, -6, -18); c.closePath(); }, C.red, C.redD, { k: 1.4, lw: 4.4 });
  // stubby wings, flapping fast
  for (const far of [true, false]) {
    ctx.save(); ctx.translate(far ? -2 : -12, -54); ctx.rotate((far ? -0.35 : -0.75) + flap * 0.5);
    cel(ctx, (c) => { c.moveTo(0, 0); c.lineTo(-4, -24); c.quadraticCurveTo(-12, -15, -24, -18); c.quadraticCurveTo(-18, -9, -21, 0); c.quadraticCurveTo(-10, -2, 0, 5); c.closePath(); },
      far ? C.memF : C.mem, far ? C.memFD : C.memD, { k: 1.2, lw: 4.4 });
    ctx.restore();
  }
  // little tail, lashing
  const tw = Math.sin(t * 9) * 3;
  cel(ctx, (c) => { c.moveTo(-14, -22); c.quadraticCurveTo(-32, -20, -38, -8 + tw); c.lineTo(-48, -12 + tw); c.lineTo(-41, 0 + tw * 0.6); c.quadraticCurveTo(-28, -4, -12, -9); c.closePath(); },
    C.sc, C.scD, { k: 1.2, lw: 4.4 });
  // feet
  for (const [x, far] of [[8, true], [-6, false]]) {
    const lift = far ? Math.max(0, fist) * 2 : 0;
    cel(ctx, (c) => { c.moveTo(x - 7, -7 - lift); c.lineTo(x - 8, -lift); c.lineTo(x + 12, -lift); c.quadraticCurveTo(x + 13, -7 - lift, x + 4, -10 - lift); c.closePath(); }, far ? C.scF : C.sc, C.scD, { k: 1, lw: 4.4 });
  }
  // far arm (behind the body)
  tinyArm(ctx, p, false, fist, mood, t);
  // round puffed body with a gold belly
  cel(ctx, (c) => ellipse(c, 0, -30, 22, 24), C.sc, C.scD, { k: 2, hi: C.scH, hk: 0.3, lw: 4.6, detail: (c) => {
    c.fillStyle = C.bel; c.beginPath(); ellipse(c, 8, -26, 13, 18, 0.1); c.fill();
    c.strokeStyle = C.belD; c.lineWidth = 2.2; c.beginPath(); for (const y of [-34, -26, -18]) { c.moveTo(-2, y); c.quadraticCurveTo(8, y + 3, 19, y - 1); } c.stroke();
  } });
  // a scrap of the royal ermine round his neck + a wisp of the smoky beard: still the King
  cel(ctx, (c) => { c.moveTo(-12, -52); c.quadraticCurveTo(4, -60, 20, -50); c.quadraticCurveTo(16, -44, 10, -46); c.quadraticCurveTo(4, -42, -2, -46); c.quadraticCurveTo(-8, -42, -13, -48); c.closePath(); },
    C.erm, C.ermD, { k: 1, lw: 4, detail: (c) => { c.fillStyle = C.spot; c.beginPath(); ermSpot(c, -2, -52, 1.3); ermSpot(c, 10, -52, 1.3); c.fill(); } });
  tinyHead(ctx, p, t, mood);
  const bw = Math.sin(t * 7) * 2;
  cel(ctx, (c) => { c.moveTo(20, -55); c.quadraticCurveTo(26, -46, 22 + bw, -38); c.quadraticCurveTo(19 + bw, -33, 23 + bw, -30); c.quadraticCurveTo(15 + bw, -31, 17 + bw, -38); c.quadraticCurveTo(20, -46, 15, -54); c.closePath(); }, C.smoke, C.smokeD, { k: 1, lw: 2.6, ink: C.smokeL });
  tinyArm(ctx, p, true, fist, mood, t);
  ctx.restore();
  if (p.caged) cage(ctx, t, 'front');
  ctx.restore();
}
// shaking little fist (furious), raised by the head; held at the sides when sulking
function tinyArm(ctx, p, near, fist, mood, t) {
  const sh = near ? fist : -fist;
  const ax = near ? 6 : 14, ay = -44;
  let hx, hy;
  if (mood === 'sulk') { hx = near ? 18 : 22; hy = -30; }                      // arms folded over the tummy
  else if (mood === 'rant') { hx = ax + (near ? 26 : 18) + sh * 3; hy = ay - 2 - sh * 8; }   // waving a fist as he rants
  else if (near && mood !== 'stunned') { hx = ax + 34 + sh * 3; hy = ay - 14 - Math.abs(sh) * 7; }   // a tiny fist shaken right at you
  else { hx = ax + 16 + sh * 2; hy = ay + 8 - sh * 4; }                          // the other balled up low
  const col = near ? C.sc : C.scF;
  ink(ctx, (c) => { c.moveTo(ax, ay); c.quadraticCurveTo((ax + hx) / 2 - 4, (ay + hy) / 2 + 2, hx, hy); }, 13);
  ink(ctx, (c) => { c.moveTo(ax, ay); c.quadraticCurveTo((ax + hx) / 2 - 4, (ay + hy) / 2 + 2, hx, hy); }, 7.4, col);
  cel(ctx, (c) => ellipse(c, hx, hy, 7, 6.5), col, C.scD, { k: 0.8, lw: 4.2, detail: (c) => {
    c.strokeStyle = C.scD; c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx + 2, hy - 5); c.lineTo(hx + 2, hy + 5); c.stroke();
  } });
  if (near && mood !== 'sulk') {   // knuckle bumps, a gold ring still on his tiny claw, shake lines
    ink(ctx, (c) => { c.moveTo(hx + 5, hy - 5); c.quadraticCurveTo(hx + 8.5, hy - 2.5, hx + 6, hy); c.quadraticCurveTo(hx + 8.5, hy + 2.5, hx + 5, hy + 5); }, 2, C.scD);
    flat(ctx, (c) => { c.moveTo(hx - 1, hy - 7); c.lineTo(hx + 3, hy - 6.5); c.lineTo(hx + 3, hy + 6.5); c.lineTo(hx - 1, hy + 7); c.closePath(); }, C.gold, 2);
    if (mood !== 'stunned') ink(ctx, (c) => { for (const [dx, dy] of [[12, -10], [14, 0], [12, 10]]) { c.moveTo(hx + dx, hy + dy); c.lineTo(hx + dx + 6, hy + dy * 1.3); } }, 2.4, C.puffD);
  }
}
function tinyHead(ctx, p, t, mood) {
  ctx.save(); ctx.translate(6, -64);
  const puff = mood === 'furious' || mood === 'rant' ? 1 + 0.06 * Math.sin(t * 13) : 1;
  // little horns
  for (const [x, far] of [[-14, true], [-8, false]]) {
    cel(ctx, (c) => { c.moveTo(x, -14); c.quadraticCurveTo(x - 12, -18, x - 17, -29); c.quadraticCurveTo(x - 4, -23, x + 4, -16); c.closePath(); }, far ? C.hornD : C.horn, C.hornD, { lw: 4 });
  }
  // a bent little crown fragment, jammed on askew
  ctx.save(); ctx.translate(-2, -24); ctx.rotate(-0.38 + Math.sin(t * 13) * 0.05 * (mood === 'furious' ? 1 : 0));
  cel(ctx, (c) => { c.moveTo(-12, 1); c.lineTo(-13, -11); c.lineTo(-6, -6); c.lineTo(-2, -17); c.lineTo(2, -7); c.lineTo(6, -10); c.lineTo(8, -3); c.lineTo(13, -6); c.lineTo(12, 3); c.quadraticCurveTo(0, 6, -12, 1); c.closePath(); },
    C.gold, C.goldD, { k: 0.8, lw: 3.6, hi: C.goldH, hk: 0.4 });
  flat(ctx, (c) => { c.moveTo(0, -5); c.lineTo(3.5, -1); c.lineTo(0, 3); c.lineTo(-3.5, -1); c.closePath(); }, '#2f8f4a', 2);
  ink(ctx, (c) => { c.moveTo(0, -5); c.lineTo(1, -1.5); c.lineTo(-1, 0.5); c.lineTo(0.5, 3); }, 1.4);
  ctx.restore();
  // head + snout (cheeks puffed when furious)
  cel(ctx, (c) => { c.moveTo(-18, 4); c.bezierCurveTo(-24, -20, -2, -27, 10, -21); c.quadraticCurveTo(27, -16, 31, -8); c.quadraticCurveTo(33, 3, 24, 7); c.quadraticCurveTo(4, 15 * puff, -12, 12); c.closePath(); },
    C.sc, C.scD, { k: 1.6, hi: C.scH, hk: 0.3, lw: 4.6, detail: (c) => {
      c.fillStyle = C.bel; c.beginPath(); ellipse(c, 12, 9, 13, 4, 0.05); c.fill();
      // red with fury: the whole face flushes when he is mad
      // puffed-out cheek (an inked bulge, not a blush)
      if (mood === 'furious' || mood === 'rant') { c.strokeStyle = C.scD; c.lineWidth = 2.4; c.beginPath(); c.arc(-1, 3, 7 * puff, 0.4, 2.6); c.stroke(); }
    } });
  // nostril + angry steam puffs
  ink(ctx, (c) => { c.moveTo(25, -11); c.quadraticCurveTo(28, -13, 29, -10); }, 2.8);
  if (mood !== 'stunned') {
    for (let i = 0; i < 2; i++) {
      const u = (t * 2.2 + i / 2) % 1, x = 34 + u * 14, y = -15 - u * 16, r = 4 + u * 6;
      ctx.globalAlpha = 0.95 * (1 - u * u);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); circle(ctx, x, y, r); circle(ctx, x + r * 0.7, y + r * 0.3, r * 0.7); circle(ctx, x - r * 0.5, y + r * 0.4, r * 0.6); ctx.fill();
      ink(ctx, (c) => { c.arc(x, y, r, 0.3, Math.PI - 0.3); }, 1.6, C.puffD);
    }
    ctx.globalAlpha = 1;
    if (mood === 'furious' || mood === 'rant') {   // cartoon anger mark
      const v = 1 + 0.18 * Math.sin(t * 15), ax = -20, ay = -30;
      ink(ctx, (c) => { for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.moveTo(ax + sx * 6 * v, ay + sy * 1.5); c.quadraticCurveTo(ax + sx * 1.5, ay + sy * 1.5, ax + sx * 1.5, ay + sy * 6 * v); } }, 3, '#e8304c');
    }
  }
  // mouth: gritted zig-zag scowl, or ranting wide open (squeaky)
  const open = mood === 'rant' ? 0.45 + 0.55 * Math.abs(Math.sin(t * 19)) : TALK ? Math.abs(Math.sin(t * 17)) : mood === 'stunned' ? 0.5 : 0;
  if (open > 0.15) {
    flat(ctx, (c) => { c.moveTo(6, 5); c.quadraticCurveTo(17, 3, 26, 4); c.quadraticCurveTo(20, 6 + 11 * open, 8, 7 + 6 * open); c.closePath(); }, C.mouth, 3.4);
    ctx.fillStyle = C.tongue; ctx.beginPath(); ellipse(ctx, 15, 6 + 6 * open, 5, 2); ctx.fill();
    flat(ctx, (c) => { c.moveTo(17, 4); c.lineTo(19, 8); c.lineTo(21, 4); c.closePath(); }, C.tooth, 1.8);
  } else if (mood === 'sulk') {
    ink(ctx, (c) => { c.moveTo(9, 7); c.quadraticCurveTo(16, 3, 23, 6); }, 3.4);
  } else {
    flat(ctx, (c) => { c.moveTo(8, 3); c.lineTo(25, 3); c.lineTo(25, 8); c.lineTo(8, 8); c.closePath(); }, C.tooth, 3);
    ink(ctx, (c) => { c.moveTo(8, 5.5); c.lineTo(11, 3.5); c.lineTo(14, 7.5); c.lineTo(17, 3.5); c.lineTo(20, 7.5); c.lineTo(23, 3.5); c.lineTo(25, 5.5); }, 1.8);
  }
  // furious eye + thick brow
  const ex = 11, ey = -8;
  if (mood === 'stunned') {
    flat(ctx, (c) => ellipse(c, ex, ey, 7, 7), '#f3fff0', 3.4);
    ink(ctx, (c) => { for (let a = 0; a < 4 * Math.PI; a += 0.4) { const r = 5.5 * a / (4 * Math.PI), aa = a + t * 7; a ? c.lineTo(ex + Math.cos(aa) * r, ey + Math.sin(aa) * r) : c.moveTo(ex, ey); } }, 2);
  } else {
    ctx.save(); ctx.beginPath(); ellipse(ctx, ex, ey, 7, 7); ctx.clip();
    ctx.fillStyle = C.gemD; ctx.fillRect(ex - 7, ey - 7, 14, 14);
    ctx.fillStyle = C.gem; ctx.beginPath(); circle(ctx, ex + 1, ey + 1, 4.6); ctx.fill();
    ctx.fillStyle = '#123d22'; ctx.beginPath(); ellipse(ctx, ex + 1.8, ey + 1.4, 1.5, 3.6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, ex - 2, ey - 2, 1.6); ctx.fill();
    ctx.fillStyle = C.sc; ctx.beginPath(); ctx.moveTo(ex - 8, ey - 8); ctx.lineTo(ex + 8, ey - 8); ctx.lineTo(ex + 8, ey + (mood === 'sulk' ? 0 : -1)); ctx.lineTo(ex - 8, ey - (mood === 'sulk' ? 1 : 6)); ctx.closePath(); ctx.fill();
    ctx.restore();
    ink(ctx, (c) => ellipse(c, ex, ey, 7, 7), 3.4);
  }
  ink(ctx, (c) => { c.moveTo(ex - 10, ey - 13); c.quadraticCurveTo(ex, ey - 11, ex + 9, ey - (mood === 'sulk' ? 10 : 5)); }, 6.4);
  ctx.restore();
}

// ======================================================================= the golden birdcage
// origin at the bottom centre of the cage (on the floor); ~90 px tall to the top of the hook ring at scale 1
export const CAGE = { w: 64, h: 102, floorY: -8, hook: [0, -96] };
const CW = 30, CTOP = -68, CBASE = -8;
const barX = (u) => u * CW;
function cage(ctx, t, part) {
  if (part !== 'front') {
    // floor plate + thin back bars
    flat(ctx, (c) => ellipse(c, 0, CBASE + 1, CW + 1, 5), C.goldD, 2.4);
    ctx.strokeStyle = C.goldD; ctx.lineWidth = 1.6; ctx.beginPath();
    for (const u of [-0.66, -0.2, 0.2, 0.66]) { ctx.moveTo(barX(u) * 0.92, CBASE - 2); ctx.lineTo(barX(u) * 0.92, CTOP + 2); }
    ctx.moveTo(-CW * 0.9, CTOP + 4); ctx.quadraticCurveTo(0, CTOP - 26, CW * 0.9, CTOP + 4);
    ctx.stroke();
  }
  if (part !== 'back') {
    const bars = (c) => {
      for (const u of [-1, -0.42, 0.42, 1]) { const x = barX(u), bow = Math.cos(u * Math.PI / 2); c.moveTo(x, CBASE + bow * 2); c.lineTo(x, CTOP + 3 * (1 - bow)); }
      c.moveTo(-CW, CTOP + 3); c.quadraticCurveTo(-CW, CTOP - 22, 0, CTOP - 18); c.quadraticCurveTo(CW, CTOP - 22, CW, CTOP + 3);
      c.moveTo(-CW * 0.5, CTOP + 1); c.quadraticCurveTo(-CW * 0.4, CTOP - 15, 0, CTOP - 18); c.moveTo(CW * 0.5, CTOP + 1); c.quadraticCurveTo(CW * 0.4, CTOP - 15, 0, CTOP - 18);
    };
    ink(ctx, bars, 3.2);
    ink(ctx, bars, 1.5, C.gold);
    // top band
    cel(ctx, (c) => { c.moveTo(-CW - 1.5, CTOP - 1); c.lineTo(CW + 1.5, CTOP - 1); c.lineTo(CW + 1.5, CTOP + 3.5); c.quadraticCurveTo(0, CTOP + 6, -CW - 1.5, CTOP + 3.5); c.closePath(); },
      C.gold, C.goldD, { k: 0.6, hi: C.goldH, hk: 0.45, lw: 2.2 });
    // finial + swinging hook ring
    flat(ctx, (c) => circle(c, 0, CTOP - 20, 3.4), C.gold, 2);
    ink(ctx, (c) => circle(c, 0, CTOP - 28, 5), 3.8);
    ink(ctx, (c) => circle(c, 0, CTOP - 28, 5), 1.8, C.gold);
    // base band with the gem
    cel(ctx, (c) => { c.moveTo(-CW - 2, CBASE - 3); c.lineTo(CW + 2, CBASE - 3); c.lineTo(CW + 2, CBASE + 4); c.quadraticCurveTo(0, CBASE + 8, -CW - 2, CBASE + 4); c.closePath(); },
      C.gold, C.goldD, { k: 0.8, hi: C.goldH, hk: 0.4, lw: 2.4, detail: (c) => { c.fillStyle = C.gemD; c.beginPath(); circle(c, 0, CBASE + 1.5, 1.8); c.fill(); } });
  }
}
/** Draw the golden birdcage on its own (empty, or with the engine's own layering): o: { scale, facing, part: 'all' | 'back' | 'front' }. */
export function drawBirdcage(ctx, t = 0, o = {}) {
  const S = o.scale || 1, f = o.facing || 1;
  ctx.save(); ctx.scale(S * f, S); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const part = o.part || 'all';
  if (part !== 'front') cage(ctx, t, 'back');
  if (part !== 'back') cage(ctx, t, 'front');
  ctx.restore();
}

// ======================================================================= the throne
/**
 * The black-and-gold dragon throne with two green flame bowls; drawn by the engine BEHIND the King, at his origin.
 * Frontal and symmetric (works for either facing).  o: { scale, facing }.  Seat top at local y = THRONE_SEAT_Y.
 */
export const THRONE_SEAT_Y = Math.round(-58 * 0.88);
let THR = null, THR_S = 0;
export function drawThrone(ctx, t = 0, o = {}) {
  const S = (o.scale || 1) * RIG, f = o.facing || 1;
  const m = ctx.getTransform(), ds = (Math.hypot(m.a, m.b) || 1) * S;
  const W = 440, H = 400, OX = 220, OY = 390;   // sprite box (local px): origin at (OX, OY)
  if (!THR || Math.abs(THR_S - ds) > 0.01) {
    THR = THR || (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas'));
    THR.width = Math.ceil(W * ds); THR.height = Math.ceil(H * ds); THR_S = ds;
    const g = THR.getContext('2d');
    g.setTransform(ds, 0, 0, ds, OX * ds, OY * ds);
    g.lineJoin = 'round'; g.lineCap = 'round';
    throneStatic(g);
  }
  ctx.save();
  ctx.translate(-18 * f * S, 0);
  ctx.drawImage(THR, -OX * S, -OY * S, W * S, H * S);
  ctx.restore();
  drawThroneLive(ctx, t, o);
}
/** The throne's live parts, drawn over it at the same origin: the green flames in the bowls, the sigil's glint. */
export function drawThroneLive(ctx, t = 0, o = {}) {
  const S = (o.scale || 1) * RIG, f = o.facing || 1;
  ctx.save();
  ctx.translate(-18 * f * S, 0);
  ctx.scale(S, S);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const sx of [-1, 1]) flameBowl(ctx, sx * 170, -168, t + (sx > 0 ? 0.37 : 0));
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  ctx.globalAlpha = 0.25 + 0.2 * pulse; ctx.fillStyle = C.glow; ctx.beginPath(); circle(ctx, 0, -262, 26 + 4 * pulse); ctx.fill(); ctx.globalAlpha = 1;
  ctx.restore();
}
/** The same live parts at given points, for a throne drawn elsewhere (src/chars/dragonking3d.js: the 3D prop's bowls
 * and sigil, which its 3/4 view puts off the rig's symmetric spots).  ctx at the throne's origin; px at scale 1. */
export function drawThroneLiveAt(ctx, t = 0, scale = 1, bowls = [], sigil = null) {
  ctx.save();
  ctx.scale(scale * RIG, scale * RIG);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // (each flame's base 3 px down into its bowl, cut 1.5 px under the rim: the bowl's front lip hides its foot, so it
  //  sits in the bowl rather than on it; a soft halo -- critic r3)
  bowls.forEach(([x, y], i) => {
    ctx.save(); ctx.beginPath(); ctx.rect(x / RIG - 80, y / RIG - 200, 160, 200 + 1.5 / RIG); ctx.clip();
    flameBowl(ctx, x / RIG, (y + 3) / RIG, t + (i ? 0.37 : 0), true);
    ctx.restore();
  });
  if (sigil) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.globalAlpha = 0.25 + 0.2 * pulse; ctx.fillStyle = C.glow; ctx.beginPath(); circle(ctx, sigil[0] / RIG, sigil[1] / RIG, 26 + 4 * pulse); ctx.fill(); ctx.globalAlpha = 1;
  }
  ctx.restore();
}
function throneStatic(g) {
  // flame bowl pillars
  for (const sx of [-1, 1]) {
    const x = sx * 170;
    cel(g, (c) => { c.moveTo(x - 12, 0); c.lineTo(x - 9, -150); c.lineTo(x + 9, -150); c.lineTo(x + 12, 0); c.closePath(); }, C.blk, C.blkD, { k: 1.6, hi: C.blkH, hk: 0.3, lw: 3,
      detail: (c) => { c.fillStyle = C.gold; for (const y of [-40, -100]) c.fillRect(x - 12, y, 24, 6); } });
    cel(g, (c) => { c.moveTo(x - 22, 0); c.lineTo(x + 22, 0); c.lineTo(x + 16, -16); c.lineTo(x - 16, -16); c.closePath(); }, C.gold, C.goldD, { k: 1, hi: C.goldH, hk: 0.4, lw: 3 });
    // bowl
    cel(g, (c) => { c.moveTo(x - 30, -170); c.quadraticCurveTo(x - 28, -146, x, -144); c.quadraticCurveTo(x + 28, -146, x + 30, -170); c.closePath(); }, C.gold, C.goldD, { k: 1.4, hi: C.goldH, hk: 0.4, lw: 3,
      detail: (c) => { c.strokeStyle = C.goldD; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - 26, -160); c.quadraticCurveTo(x, -154, x + 26, -160); c.stroke(); } });
  }
  // back: tall arched panel, black with gold frame, crimson velvet inset, wings crest on top
  const back = (c) => { c.moveTo(-96, -40); c.lineTo(-100, -250); c.quadraticCurveTo(-96, -316, -44, -326); c.quadraticCurveTo(-10, -332, 0, -350); c.quadraticCurveTo(10, -332, 44, -326);
    c.quadraticCurveTo(96, -316, 100, -250); c.lineTo(96, -40); c.closePath(); };
  // carved spires either side of the back, green gems on the tips
  for (const sx of [-1, 1]) {
    cel(g, (c) => { c.moveTo(sx * 92, -150); c.lineTo(sx * 118, -150); c.lineTo(sx * 112, -296); c.lineTo(sx * 104, -330); c.lineTo(sx * 96, -296); c.closePath(); },
      C.blk, C.blkD, { k: 1.6, hi: C.blkH, hk: 0.3, lw: 3, detail: (c) => { c.fillStyle = C.gold; c.fillRect(sx * 105 - 13, -200, 26, 6); c.fillRect(sx * 105 - 11, -290, 22, 5); } });
    flat(g, (c) => { c.moveTo(sx * 104, -346); c.lineTo(sx * 110, -334); c.lineTo(sx * 104, -322); c.lineTo(sx * 98, -334); c.closePath(); }, C.gem, 2.4);
  }
  cel(g, back, C.blk, C.blkD, { k: 3, hi: C.blkH, hk: 0.2, lw: 3.4, detail: (c) => {
    c.save(); c.beginPath(); back(c); c.lineWidth = 9; c.strokeStyle = C.goldF; c.stroke(); c.restore();
    c.lineWidth = 2; c.strokeStyle = C.goldD; c.beginPath(); c.moveTo(-84, -60); c.lineTo(-86, -246); c.quadraticCurveTo(-82, -300, -40, -310); c.stroke();
    c.beginPath(); c.moveTo(84, -60); c.lineTo(86, -246); c.quadraticCurveTo(82, -300, 40, -310); c.stroke();
    // deep purple-black velvet inset with gold studs (dark behind his head, so the crown pops)
    c.fillStyle = '#1f1426'; c.beginPath(); c.moveTo(-66, -60); c.lineTo(-68, -230); c.quadraticCurveTo(-60, -286, 0, -296); c.quadraticCurveTo(60, -286, 68, -230); c.lineTo(66, -60); c.closePath(); c.fill();
    c.fillStyle = '#2e1d38'; c.beginPath(); c.moveTo(-60, -60); c.lineTo(-62, -228); c.quadraticCurveTo(-54, -278, 0, -288); c.quadraticCurveTo(10, -287, 14, -286); c.quadraticCurveTo(-30, -270, -34, -60); c.closePath(); c.fill();
    c.strokeStyle = C.redD; c.lineWidth = 2; c.beginPath(); for (const x of [-40, -14, 14, 40]) { c.moveTo(x, -70); c.lineTo(x * 1.05, -250 + Math.abs(x) * 0.6); } c.stroke();
    c.fillStyle = C.goldH; c.beginPath(); for (let y = -80; y > -230; y -= 30) { circle(c, -64, y, 2.4); circle(c, 64, y, 2.4); } c.fill();
  } });
  // the King's sigil: a green flame-crown, glowing
  g.save(); g.translate(0, -262); g.scale(2.4, 2.4);
  flat(g, (c) => {
    c.moveTo(-11, 7); c.lineTo(-12, -3); c.quadraticCurveTo(-11, -9, -14, -14); c.quadraticCurveTo(-6, -10, -6, -4);
    c.quadraticCurveTo(-4, -12, 0, -19); c.quadraticCurveTo(4, -12, 6, -4); c.quadraticCurveTo(6, -10, 14, -14);
    c.quadraticCurveTo(11, -9, 12, -3); c.lineTo(11, 7); c.closePath();
  }, C.gem, 1.3);
  g.fillStyle = C.gemD; g.fillRect(-11, 2, 22, 4);
  g.restore();
  // gold flame-crown crest on top of the back
  cel(g, (c) => { c.moveTo(-26, -334); c.lineTo(-30, -356); c.lineTo(-18, -348); c.lineTo(-12, -374); c.lineTo(-4, -352); c.lineTo(0, -384); c.lineTo(4, -352);
    c.lineTo(12, -374); c.lineTo(18, -348); c.lineTo(30, -356); c.lineTo(26, -334); c.quadraticCurveTo(0, -328, -26, -334); c.closePath(); },
    C.gold, C.goldD, { k: 1.4, hi: C.goldH, hk: 0.4, lw: 3 });
  flat(g, (c) => { c.moveTo(0, -352); c.lineTo(6, -342); c.lineTo(0, -333); c.lineTo(-6, -342); c.closePath(); }, C.gem, 2);
  // seat block + armrests with gold dragon-head ends
  cel(g, (c) => { c.moveTo(-108, 0); c.lineTo(-104, -60); c.lineTo(104, -60); c.lineTo(108, 0); c.closePath(); }, C.red, C.redD, { k: 2, hi: C.redH, hk: 0.25, lw: 3.4, detail: (c) => {
    c.fillStyle = C.gold; c.fillRect(-108, -10, 216, 7); c.fillRect(-104, -60, 208, 6);
    c.strokeStyle = C.goldD; c.lineWidth = 2; c.beginPath(); for (const x of [-60, 0, 60]) { c.moveTo(x - 20, -24); c.quadraticCurveTo(x, -40, x + 20, -24); } c.stroke();
  } });
  cel(g, (c) => { c.moveTo(-100, -58); c.quadraticCurveTo(0, -70, 100, -58); c.lineTo(96, -66); c.quadraticCurveTo(0, -80, -96, -66); c.closePath(); }, C.red, C.redD, { k: 1.4, hi: C.redH, hk: 0.3, lw: 3 });
  for (const sx of [-1, 1]) {
    const x = sx * 112;
    cel(g, (c) => { c.moveTo(x - 16, -2); c.lineTo(x - 14, -100); c.lineTo(x + 14, -100); c.lineTo(x + 16, -2); c.closePath(); }, C.blk, C.blkD, { k: 1.6, hi: C.blkH, hk: 0.3, lw: 3.2,
      detail: (c) => { c.fillStyle = C.gold; c.fillRect(x - 16, -40, 32, 5); } });
    // a green orb gripped in a gold dragon claw on the armrest end
    flat(g, (c) => circle(c, x, -116, 13), C.gem, 3);
    g.fillStyle = C.gemD; g.beginPath(); ellipse(g, x + 3, -112, 9, 8); g.fill();
    g.fillStyle = C.gemC; g.beginPath(); ellipse(g, x - 4, -121, 3.5, 4.5, 0.4); g.fill();
    flat(g, (c) => { for (const dx of [-12, 0, 12]) { c.moveTo(x + dx - 4, -100); c.quadraticCurveTo(x + dx * 1.2 - 3, -114, x + dx * 0.7, -127); c.quadraticCurveTo(x + dx * 1.2 + 4, -112, x + dx + 4, -100); c.closePath(); } }, C.gold, 2.4);
    cel(g, (c) => { c.moveTo(x - 18, -94); c.lineTo(x + 18, -94); c.lineTo(x + 14, -104); c.lineTo(x - 14, -104); c.closePath(); }, C.gold, C.goldD, { k: 0.8, lw: 2.6 });
  }
}
function flameBowl(ctx, x, y, t, softHalo = false) {
  const pulse = 0.85 + 0.15 * Math.sin(t * 7);
  if (softHalo) {                          // (a radial falloff instead of the flat disc: drawThroneLiveAt)
    const g = ctx.createRadialGradient(x, y - 30, 0, x, y - 30, 54);
    g.addColorStop(0, 'rgba(92,255,126,0.3)'); g.addColorStop(0.6, 'rgba(92,255,126,0.14)'); g.addColorStop(1, 'rgba(92,255,126,0)');
    ctx.globalAlpha = pulse; ctx.fillStyle = g; ctx.beginPath(); ellipse(ctx, x, y - 30, 54, 62); ctx.fill(); ctx.globalAlpha = 1;
  } else { ctx.globalAlpha = 0.22 * pulse; ctx.fillStyle = C.glow; ctx.beginPath(); ellipse(ctx, x, y - 30, 46, 54); ctx.fill(); ctx.globalAlpha = 1; }
  for (const [dx, s, ph, col] of [[-12, 0.8, 0, C.gemD], [12, 0.85, 1.7, C.gemD], [0, 1.15, 0.8, C.gem], [-4, 0.75, 2.6, C.gem], [2, 0.5, 4.1, C.gemC]]) {
    const h = 64 * s * (0.82 + 0.18 * Math.sin(t * 9 + ph)), sw = Math.sin(t * 6 + ph) * 5;
    flat(ctx, (c) => { c.moveTo(x + dx - 14 * s, y); c.quadraticCurveTo(x + dx - 16 * s, y - h * 0.55, x + dx + sw, y - h); c.quadraticCurveTo(x + dx + 16 * s, y - h * 0.45, x + dx + 14 * s, y); c.closePath(); }, col, col === C.gemC ? 0 : 2.4);
  }
}

// ---------------------------------------------------------------- the 2D effects at given points (3D sprites)
/**
 * Draw a pose's 2D effects at points measured elsewhere (src/chars/dragonking3d.js passes its 3D landmarks), so a
 * pre-rendered drawing gets the same live effects drawBig paints: the crown's cracks (max(p.crack, o.crack)) and blaze,
 * the green fire in his jaws (p.fire, p.glow) or the sparks gathering there (p.gather), green smoke from his nostrils
 * while the fire glows, dizzy stars (p.stars), the stomp's dust (p.sdust), the dive's speed lines (p.speed).
 * ctx at his feet, unscaled; o: { facing, t, scale, crack }.  pts (local px, facing right, scale 1; any may be missing):
 *   mouth [x, y, ang]  the mouth and its direction (rad, + = downward), as mouthOf(); headAng: the skull's axis, if known
 *   crown [x, y], crownUp [x, y]  the heart-gem and a point above it on the crown's axis; crownK = drawn px per crown unit
 *   head [x, y]  over the head (the stars circle it);  foot [x, y]  the stomping foot on the floor;  hip [x, y]
 */
export function drawFx(ctx, p, o = {}, pts = {}) {
  const f = o.facing || 1, S = o.scale || 1;
  T = o.t || 0;
  const crack = Math.max(p.crack || 0, o.crack || 0);
  ctx.save(); ctx.scale(f * S, S); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (p.speed > 0.05 && pts.hip) { ctx.save(); ctx.translate(pts.hip[0], pts.hip[1]); ctx.scale(RIG, RIG); speedLines(ctx, p); ctx.restore(); }
  if (p.sdust > 0.02 && pts.foot) {
    ctx.save(); ctx.translate(pts.foot[0], pts.foot[1]); ctx.scale(RIG, RIG); stompDustAt(ctx, clamp(p.sdust, 0, 1), 0, 0); ctx.restore();
  }
  if (pts.crown && pts.crownUp && !p.crownOff && (crack > 0.02 || p.blaze > 0.05)) {
    const [cx, cy] = pts.crown, ux = pts.crownUp[0] - cx, uy = pts.crownUp[1] - cy;
    const k = pts.crownK || Math.hypot(ux, uy) / 41.7 * 1.03;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(ux, -uy)); ctx.scale(k, k); ctx.translate(0, 5);
    LW = 1 / Math.max(0.5, k);
    crownBlaze(ctx, clamp(p.blaze || 0, 0, 1));
    crownCracks(ctx, crack);
    LW = 1;
    ctx.restore();
  }
  if (pts.mouth) {
    const [mx, my, ang] = pts.mouth, fire = p.fire > 0.05 && p.glow > 0.05, gather = p.gather > 0.05;
    if (fire || gather || p.glow > 0.05) {
      JAWA = ((FACE_JAW[p.face] ?? 0) + (p.jaw || 0)) * DEG;
      ctx.save(); ctx.translate(mx, my); ctx.rotate(pts.headAng ?? (ang - JAWA * 0.25)); ctx.scale(HS * RIG, HS * RIG); ctx.translate(-86, 2);
      LW = 1 / HS;
      if (fire) mouthFlames(ctx, p); else if (gather) gatherSparks(ctx, p);
      if (p.glow > 0.05) nostrilSmoke(ctx, p);
      LW = 1;
      ctx.restore();
    }
  }
  if (p.stars && pts.head) { ctx.save(); ctx.translate(pts.head[0], pts.head[1] - 30); ctx.scale(RIG, RIG); starRing(ctx); ctx.restore(); }
  ctx.restore();
}

// ---------------------------------------------------------------- measurements for the engine
export const HEIGHT = 340;   // to the top of the crown
export const TINY_HEIGHT = 45;
/** Suggested body hurtbox (local px at scale 1): centred x px in front of the origin (times facing), w wide, h tall. */
export const HURTBOX = { x: 16, w: 116, h: 270 };
/** Hurtbox while hovering / diving (h measured up from the origin before the engine's z lift). */
export const HURTBOX_AIR = { x: 10, w: 132, h: 210, y0: -20 };
export const TINY_HURTBOX = { x: 4, w: 40, h: 44 };
/** Mouth (fire stream origin) in the breath pose: [x, y, angle]. */
export const BREATH_MOUTH = mouthOf(ANIM.breath(0.3));
/** Near claw at the swipe's contact key (k = .35). */
export const CLAW_POINT = measure(ANIM.claw(0.35)).nearHand;
/** Near foot at the stomp's contact key (k = .4): centre the shockwave here. */
export const STOMP_POINT = measure(ANIM.stomp(0.4)).nearFoot;
/** Crown centre in the idle pose (crown-hit effects) and at the summon's peak (where the summoning burst starts). */
export const CROWN_IDLE = crownOf(ANIM.idle(0));
export const CROWN_SUMMON = crownOf(ANIM.summon(0.6));
