// Scale-Snout kobolds: the Dragon King's foot soldiers.  Art (drawn in code) + pose library.  Style guide v2.
//
// A small scrawny lizard-folk soldier, hunched forward: long goofy snout with a row of tiny triangle teeth, big
// round yellow eyes with slit pupils, little frills behind the jaw, skinny scaly digitigrade legs with 3-toed clawed
// feet and a striped tail.  Patched leather jerkin, iron belly plate, green rag sash (the faction's venom green).
//
// o.variant picks the palette AND the kit:
//   'green' | 'blue' | 'red'  spear soldiers (black-iron pot helmet with ONE green gem; red = captain with a plume)
//   'miner'   (Ember Mines)   soot-smudged, hardhat with a candle stub, pickaxe         -> mineWind / mineHit
//   'bomber'  (Ember Mines)   goggles on a leather cap, satchel of round black bombs     -> throwWind / throw
//   'shaman'  (Ember Throne)  tall bone-and-gold headdress, robe, green-flame staff      -> castWind / cast / summon
// Every variant uses the common idle / walk / hurt / hurt2 / fly / down / getup / taunt / flee.
//
// Item hold: the NEAR hand's grip is pose.gx/gy (hip space).  The item angle (deg, + = tip up) is pose.sa for the
// spear, pose.sa + pose.pk for the pick and pose.ssa for the staff; the far hand grips two-handed items by IK
// (pose.two blends it to a free arm, pose.fu/fe).  The bomber holds a bomb in the near hand while pose.bomb > 0.5.
//
// v2 craft: line hierarchy (~3.1 px silhouettes, 1.1-1.8 px interior lines in dark local colours), occlusion tones,
// a cool rim light on the side away from the key light (as Grimscale), follow() secondary motion on tails, sashes,
// pennants, plumes, flames, robe hems and satchels (o.mem + o.vel), auto-blink, o.talk mouth, idle fidgets.
import { cel, flat, ink, capsule, blob, ellipse, circle, keys, mix, DEG, TAU, clamp, follow } from '../rig.js';
import { INK } from '../config.js';

// shared colours (the faction: black iron + venom green)
const K = {
  iron: '#4b5262', ironD: '#2c303c', ironH: '#808a9e', ironS: '#9aa3b4',
  lea: '#6b5847', leaD: '#463a2f', leaH: '#8b7660', patch: '#9a8663', patchD: '#6c5c41',
  sash: '#2f9a5e', sashD: '#1c6440', sashH: '#5cc786',
  wood: '#8f7352', woodD: '#5f4a33', woodL: '#a88c66',
  blade: '#a3acb8', bladeD: '#666f7d', bladeH: '#e4eaf1',
  pen: '#48d873', penD: '#23894a',
  gem: '#62ff8c', gemD: '#119a48', gemC: '#eaffe6',
  eye: '#ffd43c', eyeD: '#e39a14', pupil: '#1b1016',
  mouth: '#6a1d2c', tongue: '#ef7f9b', tooth: '#fffbea',
  claw: '#2a2027', star: '#ffe45c', sweat: '#9fe3ff',
  rim: '#d6fbf2', occ: 'rgba(26,10,36,0.30)', soot: 'rgba(30,26,32,0.34)',
  // kit colours
  hat: '#cf9f45', hatD: '#8f6a27', hatH: '#f0cf82', wax: '#f1e6c2', waxD: '#c9b98a',
  fl1: '#ffb43a', fl2: '#fff1a6',
  cap: '#7a5a3c', capD: '#523b26', capH: '#9b7754', brass: '#d6ad55', brassD: '#94712a', lens: '#7fe0c0', lensD: '#3a9a85',
  bomb: '#2e2a36', bombD: '#17141c', bombH: '#6f6a7c', fuse: '#c9b07a',
  robe: '#4b3a6b', robeD: '#2f2347', robeH: '#6d5a94', gold: '#e2b84a', goldD: '#9f7a22', goldH: '#fbe39a',
  bone: '#efe6cf', boneD: '#bfae8a', gf0: 'rgba(60,230,110,0.45)', gf1: '#6dff8f', gf2: '#effff0',
};

export const PALETTES = {
  green: { name: 'green', kit: 'spear', hat: 'pot', sc: '#7ab34a', scD: '#4c7b2f', scH: '#acd977', scL: '#5c9338',
    belly: '#f0e4b4', bellyD: '#c9b37c', stripe: '#3d6427', frill: '#c9dc54', frillD: '#86992b', plume: 0, helm: 1 },
  blue: { name: 'blue', kit: 'spear', hat: 'pot', sc: '#3ca2b6', scD: '#226b7e', scH: '#80d3e0', scL: '#2b8597',
    belly: '#e3efdc', bellyD: '#a9c3b4', stripe: '#1c5262', frill: '#8fe6cf', frillD: '#3a9a8a', plume: 0, helm: 1 },
  red: { name: 'red', kit: 'spear', hat: 'pot', sc: '#d0713d', scD: '#93451f', scH: '#f3a46b', scL: '#b0592c',
    belly: '#f4e2bb', bellyD: '#cdb282', stripe: '#77321a', frill: '#f2cb4f', frillD: '#ad8620', plume: 1, helm: 1.08 },
  miner: { name: 'miner', kit: 'pick', hat: 'hard', soot: 1, sc: '#7f9a6c', scD: '#4f6644', scH: '#a9c294', scL: '#64804f',
    belly: '#e2d8b6', bellyD: '#b3a57c', stripe: '#3c5133', frill: '#cbb886', frillD: '#8a7a4f', plume: 0, helm: 1 },
  bomber: { name: 'bomber', kit: 'bomb', hat: 'cap', sc: '#9a80c8', scD: '#644e92', scH: '#c4afe6', scL: '#7d66ad',
    belly: '#f1e7d4', bellyD: '#c4b39a', stripe: '#4a3870', frill: '#f2a3c6', frillD: '#b0618a', plume: 0, helm: 1 },
  shaman: { name: 'shaman', kit: 'staff', hat: 'crown', robe: 1, sc: '#86b8a8', scD: '#4f8070', scH: '#b9e0d2', scL: '#6a9d8c',
    belly: '#efe8cf', bellyD: '#c3b88f', stripe: '#2f5a4d', frill: '#e6c35a', frillD: '#a3822a', plume: 0, helm: 1 },
  // the secret stages (docs/SECRETS.md; tools/sprite3d chars/kobold.py SKIN): the Frozen Hollow's icy kobolds and the
  // green-crystal guardians (the Crystal Deep, the Queen's Hollow) -- the code rig's colours where their atlas is missing
  frost: { name: 'frost', kit: 'spear', hat: 'pot', sc: '#a9d8ec', scD: '#6f9ec0', scH: '#d6f0fa', scL: '#8cbcd8',
    belly: '#f2f8fb', bellyD: '#c2d6e2', stripe: '#4f7fa8', frill: '#e4f6ff', frillD: '#94c4de', plume: 0, helm: 1 },
  jade: { name: 'jade', kit: 'spear', hat: 'pot', sc: '#2ab5a8', scD: '#1a7a72', scH: '#6fe0d4', scL: '#22988e',
    belly: '#e6fff2', bellyD: '#a8dcc4', stripe: '#145a52', frill: '#9ff5d8', frillD: '#4fc8a8', plume: 0, helm: 1 },
};

// skeleton (px at scale 1; ~140 px tall to the top of the helmet horn)
const THIGH = 17, SHIN = 21, META = 14, FOOTH = 4.5;
const UPPER = 15, FORE = 14;
const SHAFT = 72, BUTT = 24, BLADE = 18;             // spear: shaft u = -BUTT .. SHAFT-BUTT from the near hand
const PICK0 = -8, PICK1 = 44;                        // pick haft
const STAFF0 = -40, STAFF1 = 70;                     // staff (taller than the kobold: the flame burns above its head)
const FAR_U = { spear: 21, pick: 17 };
const HIP_N = [-2, 0], HIP_F = [3, -1];
const SH_N = [3, -29], SH_F = [8, -30];
const NECK = [9, -31];
const TAIL0 = [-8, -3];
const AIR_HIP = -45;
const RIG = 1.05;   // overall size trim (keeps the tuned pose numbers)

// ---------------------------------------------------------------- poses
export const BASE = {
  x: 0, y: 0, rot: 0, sq: 1,
  tor: 26, head: -24, jaw: 0,
  nt: 26, ns: -86, nh: 66, nf: 0,         // near leg (back foot): thigh, knee (neg), hock (pos), foot (absolute)
  ft: 56, fs: -80, fh: 46, ff: 0,         // far leg (front foot)
  gx: 15, gy: -7, sa: 12,                 // item: near-hand grip (hip space) + spear angle (deg, + = tip up)
  pk: 108, ssa: 84, bomb: 1,              // pick = sa + pk (on the shoulder), staff absolute angle, bomb in hand
  two: 1, fu: 30, fe: 50,                 // far hand on the shaft (1) or free (0) with upper/elbow angles
  tb: 28, tc: 9, tw: 5, tp: 0,            // tail: droop at the base, curl per segment, wave amount + phase
  smear: 0, sl: 50, a0: 0, a1: 0, ar: 50, // spear streak / pick + throw crescent (deg from down, shoulder frame)
  glow: 0, flame: 0.35, gather: 0, swirl: 0,
  face: 'mean', air: false, blink: false, plant: true,
};
const P = (o) => Object.assign({}, BASE, o);
const ext = (p, o) => P(Object.assign({}, p, o));

// the coiled pose at the end of the wind-up; the stab starts from it
const WIND = P({ x: -5, tor: 2, head: 0, jaw: 5, gx: -17, gy: -16, sa: 12, nt: 12, ns: -90, nh: 72, ft: 70, fs: -66, fh: 26, ff: 14,
  tb: 0, tc: 20, tw: 2, face: 'mean', glow: 1 });
const STAB = P({ x: 10, tor: 46, head: -44, gx: 46, gy: -14, sa: 3, nt: -22, ns: -40, nh: 54, ft: 64, fs: -62, fh: 34,
  tb: 44, tc: -2, face: 'yell', smear: 1, sl: 64, glow: 0.4 });
const CROUCH = P({ tor: 38, head: -36, nt: 70, ns: -130, nh: 96, ft: 80, fs: -128, fh: 88, gx: 14, gy: -4, sa: 8, two: 1, pk: 60,
  ssa: 70, tb: 30, tc: 10, face: 'mean' });
const CROUCH_AIR = P(Object.assign({}, CROUCH, { air: true, y: 12.9 }));   // its ground-solved hip height, as an air pose
const DOWN = P({ air: true, rot: 90, y: 28, tor: -2, head: 10, nt: 118, ns: -84, nh: 66, nf: 40, ft: 142, fs: -98, fh: 70, ff: 60,
  gx: -8, gy: -20, sa: -90, pk: 0, ssa: -90, two: 0, fu: 160, fe: 40, tb: 86, tc: 0, tw: 3, face: 'ko' });
// miner
const MINE_UP = P({ tor: -2, head: -4, sq: 1.03, gx: -3, gy: -52, sa: 152, pk: 0, two: 1, nt: 8, ns: -80, nh: 68, ft: 70, fs: -60, fh: 30, ff: 10,
  tb: 6, tc: 18, face: 'mean', glow: 1 });
const MINE_HIT = P({ x: 8, tor: 52, head: -46, sq: 0.94, gx: 32, gy: -4, sa: -50, pk: 0, two: 1, nt: -22, ns: -44, nh: 56, ft: 68, fs: -72, fh: 40,
  tb: 50, tc: -4, face: 'yell', smear: 1, a0: 196, a1: 62, ar: 50 });
// bomber
const THROW_UP = P({ x: -3, tor: 6, head: -12, gx: -16, gy: -42, two: 0, fu: 82, fe: 16, nt: 10, ns: -88, nh: 70, ft: 74, fs: -62, fh: 28, ff: 16,
  tb: 8, tc: 16, face: 'smug', glow: 1 });
const THROW_REL = P({ x: 9, tor: 38, head: -32, gx: 26, gy: -40, two: 0, fu: -20, fe: 40, nt: -12, ns: -50, nh: 58, ft: 60, fs: -72, fh: 40,
  tb: 46, tc: 0, face: 'yell', smear: 1, a0: 230, a1: 120, ar: 30, bomb: 0 });
// shaman
const CAST_UP = P({ tor: 4, head: -12, gx: 6, gy: -54, ssa: 96, two: 0, fu: 140, fe: 30, nt: 20, ns: -84, nh: 66, ft: 62, fs: -78, fh: 42,
  tb: 14, tc: 14, face: 'yell', flame: 1, gather: 1, glow: 1 });
const CAST_REL = P({ x: 6, tor: 40, head: -38, gx: 30, gy: -30, ssa: 22, two: 0, fu: 60, fe: 20, nt: -8, ns: -56, nh: 60, ft: 62, fs: -74, fh: 40,
  tb: 44, tc: 0, face: 'yell', flame: 1 });

// idle with breathing + weight shift; every ~5.2 s a fidget (glance round, scratch under the hat, tail flick)
function idlePose(t) {
  const b = Math.sin(t * 4.4), b2 = Math.sin(t * 2.2 + 0.6);
  const p = P({ tor: 26 + b * 1.6, head: -24 - b * 2.2, nt: BASE.nt + b * 2.5, ns: BASE.ns - b * 6, ft: BASE.ft + b * 2.5, fs: BASE.fs - b * 6,
    gy: -7 + b * 1.4, gx: 15 - b, sa: 12 + b2 * 4, tp: t * 0.4 });
  const f = t % 5.2;
  if (f > 3.9) {
    const u = (f - 3.9) / 1.3, w = Math.sin(Math.PI * u) ** 2, look = Math.sin(u * TAU * 2);
    p.head += (-14 + look * 10) * w; p.tor -= 6 * w;
    p.two *= 1 - w; p.fu += (150 - p.fu) * w; p.fe += (95 - p.fe) * w;      // far hand scratches under the hat
    p.tw += 10 * w; p.tp += u * 2;
    if (w > 0.4) p.face = 'smug';
  }
  return p;
}

export const ANIM = {
  idle: idlePose,
  // sneaky scurry: contact / passing / up, tiptoe, head bob, spear bob, tail sway
  walk(ph) {
    const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU), s2 = Math.sin(ph * TAU * 2);
    const ln = Math.max(0, c), lf = Math.max(0, -c);
    return P({ tor: 32 + 1.5 * s2, head: -30 + 3 * Math.abs(s) - 2 * s2,
      nt: 24 + 24 * s, ns: -64 - 30 * ln, nh: 50 + 12 * ln, nf: -14 * Math.max(0, c - 0.45),
      ft: 24 - 24 * s, fs: -64 - 30 * lf, fh: 50 + 12 * lf, ff: -14 * Math.max(0, -c - 0.45),
      gx: 17 + 1.5 * s, gy: -6 + 1.5 * Math.abs(c), sa: 6 + 3 * s, ssa: 84 + 4 * s, fu: 30 - 24 * s, fe: 50 + 10 * s,
      tp: ph, tw: 9, tb: 22, tc: 8 });
  },
  // telegraph: a small dip, then draw the spear back and coil (the engine runs it over 16-20 frames)
  windup: (k) => keys(k, [
    [0, P({})],
    [0.35, P({ tor: 32, head: -30, sq: 0.96, nt: 34, ns: -96, nh: 72, ft: 62, fs: -90, fh: 52, gx: 6, gy: -4, sa: 16, tb: 18, tc: 14 }), 'out'],
    [1, WIND, 'io'],
  ]),
  // fast forward thrust with overshoot and settle; tip at SPEAR_TIP for k ~ 0.15 .. 0.5
  stab: (k) => keys(k, [
    [0, WIND],
    [0.08, ext(WIND, { x: -6, gx: -19, tor: 0, sq: 0.97 })],
    [0.18, STAB, 'snap'],
    [0.3, ext(STAB, { x: 12, tor: 49, head: -46, gx: 48, sq: 1.03, smear: 0.6 }), 'out'],
    [0.5, ext(STAB, { x: 11, tor: 44, gx: 44, smear: 0.25 })],
    [0.78, P({ x: 2, tor: 22, head: -20, gx: 12, sa: 16, tb: 34, tc: 4 }), 'io'],
    [1, P({ x: 1 })],
  ]),
  // hopping long thrust: crouch, hop, land in a full stretch, settle (the engine slides the actor ~50 px)
  lunge: (k) => keys(k, [
    [0, P({ tor: 16, head: -14, sq: 0.9, nt: 34, ns: -96, nh: 74, ft: 56, fs: -98, fh: 62, gx: 2, gy: -9, sa: 22,
      tb: 6, tc: 18, face: 'yell', glow: 1 })],
    [0.24, P({ x: 4, y: -24, tor: 30, head: -30, sq: 1.06, nt: 46, ns: -108, nh: 86, nf: 24, ft: -14, fs: -40, fh: 40, ff: -24,
      gx: 18, gy: -12, sa: 12, tb: 2, tc: 22, face: 'yell', glow: 0.6 }), 'out'],
    [0.42, P({ x: 16, tor: 54, head: -52, sq: 0.94, nt: -34, ns: -26, nh: 44, ft: 72, fs: -70, fh: 40, gx: 52, gy: -16, sa: 1,
      tb: 50, tc: -8, face: 'yell', smear: 1, sl: 86 }), 'in'],
    [0.52, P({ x: 17, tor: 56, head: -52, sq: 1.02, nt: -36, ns: -24, nh: 44, ft: 74, fs: -72, fh: 40, gx: 54, gy: -16, sa: 0,
      tb: 54, tc: -8, face: 'yell', smear: 0.6, sl: 86 }), 'out'],
    [0.72, P({ x: 16, tor: 52, head: -50, nt: -32, ns: -28, nh: 44, ft: 70, fs: -70, fh: 40, gx: 50, gy: -16, sa: 1,
      tb: 46, tc: -4, face: 'yell', smear: 0.2, sl: 86 })],
    [1, P({ x: 6 })],
  ]),
  // high hit: head snaps back, squash on impact, settle
  hurt: (k) => keys(k, [
    [0, P({ x: -8, tor: -8, head: -10, sq: 0.9, nt: 36, ns: -76, nh: 54, ft: 66, fs: -66, fh: 30, ff: 16, gx: 14, gy: -12, sa: 36,
      ssa: 66, two: 0, fu: 128, fe: 40, tb: 54, tc: 20, tw: 12, face: 'ouch' })],
    [0.15, P({ x: -9, tor: -10, head: -14, sq: 1.04, nt: 36, ns: -78, nh: 56, ft: 66, fs: -68, fh: 30, ff: 18, gx: 14, gy: -13, sa: 40,
      ssa: 62, two: 0, fu: 136, fe: 36, tb: 58, tc: 22, tw: 12, face: 'ouch' }), 'out'],
    [0.45, P({ x: -6, tor: -2, head: -14, nt: 32, ns: -80, nh: 58, ft: 62, fs: -70, fh: 34, ff: 10, gx: 14, gy: -10, sa: 28,
      ssa: 72, two: 0, fu: 104, fe: 50, tb: 42, tc: 16, face: 'ouch' }), 'io'],
    [1, P({ x: -1, face: 'mean' }), 'io'],
  ]),
  // low hit: doubles over the belly, tail whips up, settle
  hurt2: (k) => keys(k, [
    [0, P({ x: -5, tor: 50, head: -4, sq: 0.9, nt: 34, ns: -100, nh: 78, ft: 66, fs: -96, fh: 60, gx: 10, gy: 2, sa: -6,
      ssa: 60, pk: 90, two: 0, fu: 10, fe: 110, tb: -10, tc: 26, tw: 10, face: 'ouch' })],
    [0.18, P({ x: -7, tor: 54, head: -2, sq: 1.03, nt: 36, ns: -102, nh: 80, ft: 68, fs: -98, fh: 62, gx: 8, gy: 4, sa: -10,
      ssa: 58, pk: 90, two: 0, fu: 6, fe: 118, tb: -16, tc: 28, tw: 10, face: 'ouch' }), 'out'],
    [0.5, P({ x: -5, tor: 44, head: -10, nt: 30, ns: -94, nh: 72, ft: 62, fs: -92, fh: 56, gx: 12, gy: -2, sa: 4,
      ssa: 70, pk: 100, two: 0, fu: 20, fe: 90, tb: 10, tc: 20, face: 'ouch' }), 'io'],
    [1, P({ x: -1, face: 'mean' }), 'io'],
  ]),
  // knocked into the air backwards (air)
  fly: P({ air: true, rot: 64, tor: -4, head: -4, nt: 60, ns: -50, nh: 30, nf: 30, ft: 92, fs: -34, fh: 20, ff: 40,
    gx: 2, gy: -36, sa: 84, pk: 20, ssa: 110, two: 0, fu: 168, fe: 24, tb: -26, tc: 12, tw: 14, face: 'ouch' }),
  // flat on its back, legs in the air, dizzy, item dropped along the floor (air)
  down: DOWN,
  // roll up to sitting, crouch, pop up with a little overshoot
  getup: (k) => keys(k, [
    [0, P(Object.assign({}, DOWN, { face: 'ouch' }))],
    [0.35, P({ air: true, rot: 30, y: 30, tor: 34, head: -40, nt: 102, ns: -140, nh: 97, nf: -30, ft: 96, fs: -128, fh: 85, ff: -30,
      gx: 12, gy: 2, sa: -24, pk: 10, ssa: 20, two: 0, fu: 40, fe: 60, tb: 70, tc: 4, face: 'ouch' })],
    [0.65, CROUCH_AIR],
    [0.6501, CROUCH],     // same pose, now ground-solved: crouch -> stand keeps the feet planted
    [0.85, P({ tor: 18, head: -18, sq: 1.03, nt: 20, ns: -76, nh: 60, ft: 50, fs: -72, fh: 40, gx: 15, gy: -9, sa: 16, tb: 22, tc: 12 }), 'out'],
    [1, P({}), 'io'],
  ]),
  // hops on the spot shaking the item overhead
  taunt(t) {
    const hop = Math.abs(Math.sin(t * 7)), sh = Math.sin(t * 14);
    return P({ y: -hop * 10, tor: 8, head: -18 + sh * 4, jaw: 4, sq: 1 + (hop - 0.5) * 0.04,
      nt: 24 + hop * 18, ns: -66 - hop * 36, nh: 56 + hop * 20, nf: hop * 14,
      ft: 32 + hop * 20, fs: -70 - hop * 34, fh: 52 + hop * 22, ff: hop * 10,
      gx: -6, gy: -50, sa: 100 + sh * 10, pk: -30, ssa: 84 + sh * 8, two: 0, fu: 150 + sh * 20, fe: 30 - sh * 25,
      tb: 10, tc: 18, tw: 16, tp: t * 1.6, face: 'smug' });
  },
  // running away scared (the engine flips facing; this is a forward run)
  flee(ph) {
    const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU);
    const ln = Math.max(0, c), lf = Math.max(0, -c);
    return P({ tor: 40, head: -62 + 4 * s, y: -3 * Math.abs(s),
      nt: 26 + 40 * s, ns: -50 - 70 * ln, nh: 46 + 30 * ln, nf: 16 * s * ln,
      ft: 26 - 40 * s, fs: -50 - 70 * lf, fh: 46 + 30 * lf, ff: -16 * s * lf,
      gx: 2, gy: -36, sa: 148 + 8 * s, pk: -40, ssa: 140 + 8 * s, two: 0, fu: 140 + 40 * s, fe: 30 + 20 * c,
      tb: -6, tc: 6, tw: 16, tp: ph * 2, face: 'scared' });
  },

  // ---------------------------------------------------------------- miner: pickaxe
  // 22 frames: dip, then a big overhead backswing (pick raised up and back, gem-glint tell)
  mineWind: (k) => keys(k, [
    [0, P({})],
    [0.3, P({ tor: 34, head: -30, sq: 0.95, nt: 32, ns: -96, nh: 72, ft: 62, fs: -90, fh: 52, gx: 10, gy: -2, sa: 142, pk: 0, two: 1,
      tb: 18, tc: 12 }), 'out'],
    [1, MINE_UP, 'io'],
  ]),
  // 24 frames: overhead strike, contact at k .35 (PICK_TIP), stuck + overshoot, yank free, shoulder the pick
  mineHit: (k) => keys(k, [
    [0, MINE_UP],
    [0.16, P({ x: 3, tor: 20, head: -20, sq: 1.04, gx: 10, gy: -50, sa: 88, pk: 0, two: 1, nt: 0, ns: -70, nh: 60, ft: 70, fs: -70, fh: 36,
      tb: 24, tc: 8, face: 'yell', smear: 0.7, a0: 196, a1: 130, ar: 50 }), 'in'],
    [0.35, MINE_HIT, 'snap'],
    [0.5, ext(MINE_HIT, { x: 9, tor: 56, head: -50, sq: 0.97, gx: 34, gy: -2, sa: -54, smear: 0.3, a0: 140, a1: 62 }), 'out'],
    [0.7, ext(MINE_HIT, { x: 8, tor: 54, head: -48, sq: 1, gx: 33, gy: -3, sa: -52, smear: 0, face: 'mean' })],
    [0.84, P({ x: 3, tor: 22, head: -18, sq: 1.03, gx: 18, gy: -14, sa: 40, pk: 0, two: 1, tb: 30, tc: 10 }), 'out'],
    [1, P({ x: 1 }), 'io'],
  ]),

  // ---------------------------------------------------------------- bomber: lob a bomb
  // 20 frames: crouch, then rear back with the lit bomb, far arm aiming
  throwWind: (k) => keys(k, [
    [0, P({ two: 0 })],
    [0.35, P({ tor: 34, head: -30, sq: 0.95, gx: 4, gy: -4, two: 0, fu: 60, fe: 80, nt: 32, ns: -96, nh: 72, ft: 62, fs: -90, fh: 52,
      tb: 18, tc: 12 }), 'out'],
    [1, THROW_UP, 'io'],
  ]),
  // 16 frames: overarm lob, release at k .35 (BOMB_HAND), follow-through, fetch a new bomb from the satchel
  throw: (k) => {
    const p = keys(k, [
      [0, THROW_UP],
      [0.35, THROW_REL, 'snap'],
      [0.55, ext(THROW_REL, { x: 10, tor: 46, head: -36, gx: 26, gy: -14, sq: 0.97, smear: 0.3, a0: 160, a1: 60, face: 'smug' }), 'out'],
      [0.8, P({ x: 4, tor: 30, head: -24, gx: -6, gy: 0, two: 0, fu: 30, fe: 60, tb: 34, tc: 8, face: 'smug' }), 'io'],
      [1, P({ x: 1, two: 0 }), 'io'],
    ]);
    p.bomb = k < 0.35 || k > 0.82 ? 1 : 0;
    return p;
  },

  // ---------------------------------------------------------------- shaman: green fire
  // 30 frames: staff dips, then rises overhead while green flame gathers at its claw
  castWind: (k) => keys(k, [
    [0, P({ two: 0 })],
    [0.3, P({ tor: 36, head: -30, sq: 0.95, gx: 12, gy: -2, ssa: 66, two: 0, fu: 20, fe: 60, nt: 32, ns: -96, nh: 72, ft: 62, fs: -90, fh: 52,
      flame: 0.55, gather: 0.4, tb: 18, tc: 12 }), 'out'],
    [1, CAST_UP, 'io'],
  ]),
  // 18 frames: thrust the staff at the target, fireball leaves the claw at k .3 (CAST_POINT), follow-through, settle
  cast: (k) => keys(k, [
    [0, CAST_UP],
    [0.3, CAST_REL, 'snap'],
    [0.5, ext(CAST_REL, { x: 7, tor: 44, gx: 32, gy: -26, ssa: 14, flame: 0.22, sq: 0.98 }), 'out'],
    [0.75, P({ x: 3, tor: 30, head: -26, gx: 20, gy: -14, ssa: 62, two: 0, flame: 0.3, tb: 30 }), 'io'],
    [1, P({ x: 1, two: 0 }), 'io'],
  ]),
  // 40 frames: crouch, then arms up inside a rising green swirl (the engine spawns minions), settle
  summon: (k) => keys(k, [
    [0, P({ two: 0 })],
    [0.18, P({ tor: 38, head: -32, sq: 0.94, gx: 12, gy: 0, ssa: 70, two: 0, fu: 10, fe: 70, nt: 34, ns: -100, nh: 76, ft: 64, fs: -96, fh: 56,
      swirl: 0.2, flame: 0.5, tb: 16, tc: 12, face: 'mean' }), 'out'],
    [0.42, P({ y: -4, tor: -2, head: -18, sq: 1.04, gx: 4, gy: -56, ssa: 92, two: 0, fu: 172, fe: 8, nt: 14, ns: -78, nh: 64, ft: 44, fs: -74, fh: 40,
      swirl: 1, flame: 1, glow: 1, tb: 6, tc: 18, tw: 12, face: 'yell' }), 'out'],
    [0.82, P({ y: -4, tor: 0, head: -16, gx: 5, gy: -55, ssa: 90, two: 0, fu: 168, fe: 12, nt: 14, ns: -78, nh: 64, ft: 44, fs: -74, fh: 40,
      swirl: 0.9, flame: 1, glow: 1, tb: 8, tc: 18, tw: 12, face: 'yell' })],
    [1, P({ two: 0 }), 'io'],
  ]),
};
export { mix };

// ---------------------------------------------------------------- geometry (shared by draw + measure)
let T = 0;
let C = PALETTES.green;
const G = { hipY: 0, nh: 0, fh: 0, ns: 0, fs: 0, nsx: 0, nsy: 0, fsx: 0, fsy: 0, gx: 0, gy: 0, ca: 1, sn: 0, sa: 0,
  nex: 0, ney: 0, fex: 0, fey: 0, fhx: 0, fhy: 0, fgrip: false, fua: 0, ffa: 0, kit: 'spear' };
let _ex = 0, _ey = 0, _knee = null;

function drop3(a, s, h) {
  return Math.cos(a * DEG) * THIGH + Math.cos((a + s) * DEG) * SHIN + Math.cos((a + s + h) * DEG) * META + FOOTH;
}
// hock angle that lowers a nearly-planted sole exactly onto the floor (keeps both feet down in stances)
function plantHock(a, s, h, want) {
  const rest = Math.cos(a * DEG) * THIGH + Math.cos((a + s) * DEG) * SHIN + FOOTH;
  const c = (want - rest) / META;
  if (c < 0.3) return h;
  if (c <= 1) return Math.acos(c) / DEG * (a + s + h < 0 ? -1 : 1) - a - s;
  const c2 = (want - FOOTH - META - Math.cos(a * DEG) * THIGH) / SHIN;
  if (c2 > 1) return h;
  const sh = Math.acos(c2) / DEG * (a + s < 0 ? -1 : 1);
  _knee = sh - a;
  return -sh;
}
function ik(sx, sy, tx, ty, l1, l2) {
  const dx = tx - sx, dy = ty - sy;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.01);
  const b = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const e1x = sx + Math.cos(b + A) * l1, e1y = sy + Math.sin(b + A) * l1;
  const e2x = sx + Math.cos(b - A) * l1, e2y = sy + Math.sin(b - A) * l1;
  if (e1y - 0.4 * e1x >= e2y - 0.4 * e2x) { _ex = e1x; _ey = e1y; } else { _ex = e2x; _ey = e2y; }
}
const rotOf = (dx, dy) => Math.atan2(-dx, dy);   // canvas rotation that points a +y limb along (dx, dy)
function lerpAng(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return a + d * t;
}

function solve(p, kit) {
  G.kit = kit;
  let nh = p.nh, fh = p.fh, ns = p.ns, fs = p.fs;
  if (p.air) G.hipY = AIR_HIP + p.y;
  else {
    const dn = HIP_N[1] + drop3(p.nt, p.ns, nh), df = HIP_F[1] + drop3(p.ft, p.fs, fh);
    const d = Math.max(dn, df);
    G.hipY = -d + p.y;
    if (p.plant) {
      if (d - dn > 0.01 && d - dn < 5) { _knee = null; nh = plantHock(p.nt, p.ns, nh, d - HIP_N[1]); if (_knee !== null) ns = _knee; }
      if (d - df > 0.01 && d - df < 5) { _knee = null; fh = plantHock(p.ft, p.fs, fh, d - HIP_F[1]); if (_knee !== null) fs = _knee; }
    }
  }
  G.nh = nh; G.fh = fh; G.ns = ns; G.fs = fs;
  const tr = p.tor * DEG, ct = Math.cos(tr), st = Math.sin(tr);
  G.nsx = SH_N[0] * ct - SH_N[1] * st; G.nsy = SH_N[0] * st + SH_N[1] * ct;
  G.fsx = SH_F[0] * ct - SH_F[1] * st; G.fsy = SH_F[0] * st + SH_F[1] * ct;
  // grip, pulled into the near arm's reach (a bomber holds its bomb out in front of the body so it reads)
  let gx = p.gx + (kit === 'bomb' ? 7 : 0), gy = p.gy - (kit === 'bomb' ? 4 : 0);
  const R = UPPER + FORE - 0.8;
  const dx = gx - G.nsx, dy = gy - G.nsy, d = Math.hypot(dx, dy);
  if (d > R) { gx = G.nsx + dx * R / d; gy = G.nsy + dy * R / d; }
  G.gx = gx; G.gy = gy;
  G.sa = kit === 'pick' ? p.sa + p.pk : kit === 'staff' ? p.ssa : p.sa;
  const sr = -G.sa * DEG;
  G.ca = Math.cos(sr); G.sn = Math.sin(sr);
  ik(G.nsx, G.nsy, gx, gy, UPPER, FORE); G.nex = _ex; G.ney = _ey;
  // far arm: free (FK) blended towards gripping the shaft (slid along it if out of reach)
  let ua = (p.tor - p.fu) * DEG, fa = ua - p.fe * DEG;
  G.fgrip = false;
  const two = kit === 'spear' || kit === 'pick' ? p.two : 0;
  if (two > 0.01) {
    const u0 = kit === 'pick' ? PICK0 + 6 : -BUTT + 6, u1 = kit === 'pick' ? PICK1 - 8 : SHAFT - BUTT - 4;
    const ox = gx - G.fsx, oy = gy - G.fsy;
    const bq = ox * G.ca + oy * G.sn, cq = ox * ox + oy * oy - R * R;
    const disc = bq * bq - cq;
    if (disc > 0) {
      const sq = Math.sqrt(disc);
      const u = clamp(FAR_U[kit], Math.max(u0, -bq - sq), Math.min(u1, -bq + sq));
      if (u > u0 - 0.1 && u < u1 + 0.1) {
        const hx = gx + G.ca * u, hy = gy + G.sn * u;
        ik(G.fsx, G.fsy, hx, hy, UPPER, FORE);
        ua = lerpAng(ua, rotOf(_ex - G.fsx, _ey - G.fsy), two);
        fa = lerpAng(fa, rotOf(hx - _ex, hy - _ey), two);
        G.fgrip = two > 0.5;
      }
    }
  }
  G.fua = ua; G.ffa = fa;
  G.fex = G.fsx - Math.sin(ua) * UPPER; G.fey = G.fsy + Math.cos(ua) * UPPER;
  G.fhx = G.fex - Math.sin(fa) * FORE; G.fhy = G.fey + Math.cos(fa) * FORE;
}

/**
 * Where things are for a pose, in local px (origin on the floor, facing right, scale 1):
 * { tip: spear point | pick spike | staff flame, hand: near-hand grip (bomb), feet, head (neck), hipY }.
 * Pass the variant for kit-specific points (default 'green').  Multiply x by facing and both by scale.
 */
export function measure(pose, variant = 'green') {
  const kit = (PALETTES[variant] || PALETTES.green).kit;
  solve(pose, kit);
  const r = -pose.rot * DEG, c = Math.cos(r), s = Math.sin(r);
  const sq = pose.sq || 1, isq = 1 / Math.sqrt(sq);
  const loc = (bx, by) => [(pose.x + bx * c - by * s) * isq * RIG, (G.hipY + bx * s + by * c) * sq * RIG];
  const it = (u, v) => loc(G.gx + G.ca * u - G.sn * v, G.gy + G.sn * u + G.ca * v);
  let tip;
  if (kit === 'pick') tip = it(PICK1 + 4, 21);
  else if (kit === 'staff') tip = it(STAFF1 + 9, 0);
  else tip = it(SHAFT - BUTT + BLADE, 0);
  const ball = (hip, a, sh, h) => {
    let x = hip[0], y = hip[1], ang = a;
    for (const [L, d] of [[THIGH, 0], [SHIN, sh], [META, h]]) { ang += d; x += Math.sin(ang * DEG) * L; y += Math.cos(ang * DEG) * L; }
    return loc(x, y + FOOTH);
  };
  const tr = pose.tor * DEG;
  return { tip, hand: loc(G.gx, G.gy), hipY: G.hipY * RIG,
    feet: [ball(HIP_N, pose.nt, G.ns, G.nh), ball(HIP_F, pose.ft, G.fs, G.fh)],
    head: loc(NECK[0] * Math.cos(tr) - NECK[1] * Math.sin(tr), NECK[0] * Math.sin(tr) + NECK[1] * Math.cos(tr)) };
}

// ---------------------------------------------------------------- per-draw state (secondary motion, blink)
const FX = { tb: 0, tc: 0, tw: 0, sash: 0, pen: 0, penA: 1, plume: 0, flame: 0, robe: 0, sat: 0, blink: false, talk: 0 };
const V0 = { x: 0, y: 0, z: 0 };

// ---------------------------------------------------------------- drawing
/**
 * Draw a kobold.  ctx is positioned at its feet (screen), unscaled.
 * o: { facing: 1 | -1, t: seconds, scale, variant, mem, vel: {x, y, z}, talk }
 */
export function draw(ctx, pose, o = {}) {
  const f = o.facing || 1;
  const S = o.scale || 1;
  T = o.t || 0;
  C = PALETTES[o.variant] || PALETTES.green;
  const kit = C.kit;
  solve(pose, kit);
  // secondary motion: follow() lags/overshoots the targets (straight back without o.mem)
  const mem = o.mem, vel = o.vel || V0;
  const vxl = (vel.x || 0) * f, vz = vel.z || 0, spd = Math.min(6, Math.abs(vxl));
  FX.tb = follow(mem, 'k_tb', pose.tb - vxl * 4.5 + vz * 2.6, 0.12, 0.78);
  FX.tc = follow(mem, 'k_tc', pose.tc - vxl * 0.7, 0.1, 0.8);
  FX.tw = pose.tw + spd * 1.6;
  FX.sash = follow(mem, 'k_sash', vxl * 0.1 - vz * 0.05, 0.14, 0.72);
  FX.plume = follow(mem, 'k_plume', -vxl * 0.07 + vz * 0.04 - (pose.tor - 26) * 0.004, 0.15, 0.74);
  FX.flame = follow(mem, 'k_flame', clamp(-vxl * 0.16 + vz * 0.05, -0.9, 0.9), 0.24, 0.62);
  FX.robe = follow(mem, 'k_robe', clamp(-vxl * 0.9, -6, 6), 0.12, 0.76);
  FX.sat = follow(mem, 'k_sat', clamp(-vxl * 0.08 - vz * 0.05, -0.6, 0.6), 0.13, 0.72);
  FX.penA = 1 + spd * 0.5;
  {
    // pennant: trail the spear's screen rotation (unwrapped against the stored value)
    let sw = Math.atan2(G.sn, G.ca) - pose.rot * DEG;
    const st = mem && mem.k_pen;
    if (st) { while (sw - st.x > Math.PI) sw -= TAU; while (sw - st.x < -Math.PI) sw += TAU; }
    FX.pen = follow(mem, 'k_pen', sw, 0.2, 0.68) - sw;
  }
  let bp = 0;
  if (mem) { if (mem.k_bp === undefined) mem.k_bp = Math.random() * 7; bp = mem.k_bp; }
  const bt = (T + bp) % 3.7;
  FX.blink = pose.blink || ((bt > 3.56 || (bp % 1 > 0.55 && bt > 3.3 && bt < 3.38)) && pose.glow < 0.3);
  FX.talk = o.talk ? (Math.sin(T * 15) > -0.25 ? 9 + 5 * Math.sin(T * 7.3) : 1) : 0;

  ctx.save();
  ctx.scale(f * S * RIG, S * RIG);
  if (pose.sq !== 1) ctx.scale(1 / Math.sqrt(pose.sq), pose.sq);
  ctx.translate(pose.x, G.hipY);
  if (pose.rot) ctx.rotate(-pose.rot * DEG);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  if (pose.swirl > 0.02) swirl(ctx, pose, true);
  tail(ctx, pose);
  farArm(ctx);
  leg(ctx, HIP_F, pose.ft, G.fs, G.fh, pose.ff, true);
  leg(ctx, HIP_N, pose.nt, G.ns, G.nh, pose.nf, false);
  if (C.robe) robeSkirt(ctx, pose);

  ctx.save(); ctx.rotate(pose.tor * DEG);
  if (C.robe) robeTorso(ctx, pose); else torso(ctx, pose);
  ctx.save(); ctx.translate(NECK[0], NECK[1]); ctx.rotate(pose.head * DEG); head(ctx, pose); ctx.restore();
  ctx.restore();
  if (kit === 'bomb') satchel(ctx, pose);

  if (kit === 'spear') spear(ctx, pose);
  else if (kit === 'pick') pick(ctx, pose);
  else if (kit === 'staff') staff(ctx, pose);
  if (G.fgrip) { ctx.save(); ctx.translate(G.fhx, G.fhy); ctx.rotate(Math.atan2(G.sn, G.ca)); gripHand(ctx, true); ctx.restore(); }
  if (pose.smear > 0.01 && kit !== 'spear') crescent(ctx, pose);
  nearArm(ctx, pose);
  if (pose.smear > 0.01 && kit === 'spear') streak(ctx, pose);
  if (pose.swirl > 0.02) swirl(ctx, pose, false);
  ctx.restore();
}
export { draw as drawKobold };

// -------------------------------------------------- shading helpers
// Rim light (as Grimscale): a thin cool band just inside the ink outline on the side away from the key light; the
// outline is stroked shifted inside a clip of the shape, then the ink edge is restroked.  s = band size (local px).
function rim(ctx, path, lw, s = 1.5) {
  const m = ctx.getTransform(), det = m.a * m.d - m.b * m.c;
  if (!det) return;
  const k = Math.sqrt(Math.abs(det)), wx = -0.8 * s * k, wy = 0.6 * s * k;
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  ctx.translate((m.d * wx - m.c * wy) / det, (-m.b * wx + m.a * wy) / det);
  ctx.beginPath(); path(ctx);
  ctx.lineWidth = s * 2 + lw * 0.25; ctx.strokeStyle = K.rim; ctx.globalAlpha = 0.85; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); path(ctx); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
}
function celR(ctx, path, base, dark, o, s) { const lw = o.lw ?? 3; o.lw = 0; cel(ctx, path, base, dark, o); rim(ctx, path, lw, s); }
function scaleTex(c, x0, x1, y0, y1, col, r = 2.2) {
  c.strokeStyle = col; c.lineWidth = 1;
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
function sootBlobs(c, pts) {
  if (!C.soot) return;
  c.fillStyle = K.soot; c.beginPath();
  for (const [x, y, r] of pts) ellipse(c, x, y, r * 1.7, r * 0.6, -0.35);     // smeared streaks, not spots
  c.fill();
}
function star(c, x, y, R, r) {
  for (let j = 0; j < 8; j++) {
    const rr = j % 2 ? r : R, aa = j * Math.PI / 4 - Math.PI / 2;
    j ? c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr) : c.moveTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
  }
  c.closePath();
}
// green dragon-fire: three nested flickering teardrops (no gradients, no blur)
function greenFlame(ctx, s, ph, lean) {
  const fl = Math.sin(T * 17 + ph) * 0.08 + Math.sin(T * 9.3 + ph * 2) * 0.06;
  const drop = (c, w, h, l) => {
    c.moveTo(0, 0);
    c.bezierCurveTo(w, -h * 0.1, w * 0.9, -h * 0.55, l * h, -h);
    c.bezierCurveTo(-w * 0.9, -h * 0.55, -w, -h * 0.1, 0, 0);
    c.closePath();
  };
  const h = 14 * s * (1 + fl), w = 7 * s;
  ctx.save(); ctx.translate(0, 4 * s);
  ctx.fillStyle = K.gf0; ctx.beginPath(); drop(ctx, w * 1.35, h * 1.3, lean * 0.6); ctx.fill();
  ctx.fillStyle = K.gf1; ctx.beginPath(); drop(ctx, w, h, lean * 0.5); ctx.fill();
  ctx.lineWidth = 1.4; ctx.strokeStyle = '#1d7a43'; ctx.stroke();
  ctx.fillStyle = K.gf2; ctx.beginPath(); drop(ctx, w * 0.45, h * 0.55, lean * 0.4); ctx.fill();
  ctx.restore();
}

// -------------------------------------------------- tail (hip space)
const TN = 7, TSEG = 7.2;
const tx = new Float64Array(TN + 1), ty = new Float64Array(TN + 1), tnx = new Float64Array(TN + 1), tny = new Float64Array(TN + 1), tww = new Float64Array(TN + 1);
function tail(ctx, p) {
  let x = TAIL0[0], y = TAIL0[1], th = Math.PI - FX.tb * DEG;
  tx[0] = x; ty[0] = y;
  for (let i = 0; i < TN; i++) {
    const wave = FX.tw * Math.sin((p.tp + T * 0.45) * TAU - i * 0.75) * (0.3 + i / TN);
    th += (FX.tc + wave * 0.5) * DEG;
    x += Math.cos(th) * TSEG; y += Math.sin(th) * TSEG;
    tx[i + 1] = x; ty[i + 1] = y;
  }
  // keep the tail on top of the floor whatever the body rotation (it drags / rests instead of sinking)
  {
    const r = -p.rot * DEG, sr = Math.sin(r), cr = Math.cos(r);
    for (let i = 1; i <= TN; i++) {
      const lim = -G.hipY - (1.4 + 6.2 * Math.pow(1 - i / TN, 0.85)) - 1;
      const wy = tx[i] * sr + ty[i] * cr;
      if (wy > lim) { const d = wy - lim; tx[i] -= sr * d; ty[i] -= cr * d; }
    }
  }
  for (let i = 0; i <= TN; i++) {
    const a = Math.max(0, i - 1), b = Math.min(TN, i + 1);
    const dx = tx[b] - tx[a], dy = ty[b] - ty[a], L = Math.hypot(dx, dy) || 1;
    tnx[i] = -dy / L; tny[i] = dx / L;
    tww[i] = 1.4 + 6.2 * Math.pow(1 - i / TN, 0.85);
  }
  const path = (c) => {
    c.moveTo(tx[0] + tnx[0] * tww[0], ty[0] + tny[0] * tww[0]);
    for (let i = 1; i < TN; i++) {
      const x1 = tx[i] + tnx[i] * tww[i], y1 = ty[i] + tny[i] * tww[i];
      const x2 = tx[i + 1] + tnx[i + 1] * tww[i + 1], y2 = ty[i + 1] + tny[i + 1] * tww[i + 1];
      c.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
    }
    const ex = tx[TN] - tx[TN - 1], ey = ty[TN] - ty[TN - 1], L = Math.hypot(ex, ey) || 1;
    c.quadraticCurveTo(tx[TN] + ex / L * 4, ty[TN] + ey / L * 4, tx[TN] - tnx[TN] * tww[TN], ty[TN] - tny[TN] * tww[TN]);
    for (let i = TN - 1; i >= 1; i--) {
      const x1 = tx[i] - tnx[i] * tww[i], y1 = ty[i] - tny[i] * tww[i];
      const x0 = tx[i - 1] - tnx[i - 1] * tww[i - 1], y0 = ty[i - 1] - tny[i - 1] * tww[i - 1];
      c.quadraticCurveTo(x1, y1, i === 1 ? x0 : (x1 + x0) / 2, i === 1 ? y0 : (y1 + y0) / 2);
    }
    c.closePath();
  };
  celR(ctx, path, C.sc, C.scD, { k: 1.2, lw: 2.9, detail: (c) => {
    c.strokeStyle = C.stripe; c.lineWidth = 3.4; c.lineCap = 'butt';
    c.beginPath();
    for (let i = 2; i < TN; i++) {
      const w = tww[i] + 3;
      c.moveTo(tx[i] + tnx[i] * w, ty[i] + tny[i] * w); c.lineTo(tx[i] - tnx[i] * w, ty[i] - tny[i] * w);
    }
    c.stroke();
    c.lineCap = 'round';
    // pale underside + a dark root where it leaves the body
    c.strokeStyle = C.belly; c.lineWidth = 2.2; c.globalAlpha = 0.55;
    c.beginPath(); c.moveTo(tx[0] - tnx[0] * (tww[0] - 1.3), ty[0] - tny[0] * (tww[0] - 1.3));
    for (let i = 1; i < TN - 1; i++) c.lineTo(tx[i] - tnx[i] * (tww[i] - 1.3), ty[i] - tny[i] * (tww[i] - 1.3));
    c.stroke(); c.globalAlpha = 1;
    c.fillStyle = K.occ; c.beginPath(); circle(c, tx[0], ty[0], 7); c.fill();
    sootBlobs(c, [[tx[3], ty[3], 3], [tx[5], ty[5], 2]]);
  } }, 1.3);
}

// -------------------------------------------------- legs (digitigrade: thigh, shin, hock-to-ball, 3 toes)
function leg(ctx, hip, a, s, h, footAbs, far) {
  const base = far ? C.scD : C.sc;
  ctx.save();
  ctx.translate(hip[0], hip[1]);
  ctx.rotate(-a * DEG);
  const thigh = (c) => capsule(c, THIGH, 13.5, 8);
  if (far) cel(ctx, thigh, base, C.scD, { k: 1.2, lw: 2.8, detail: (c) => { c.fillStyle = K.occ; c.fillRect(-8, -6, 16, 9); } });
  else celR(ctx, thigh, base, C.scD, { k: 1.2, lw: 2.9, detail: (c) => {
    scaleTex(c, -7, 7, 3, THIGH, C.scL);
    c.fillStyle = K.occ; c.fillRect(-8, -6, 16, 7.5);           // in the shadow of the jerkin hem
    sootBlobs(c, [[3, 11, 3]]);
  } }, 1.2);
  ctx.translate(0, THIGH);
  ctx.rotate(-s * DEG);
  const shin = (c) => capsule(c, SHIN, 8, 6.2);
  if (far) cel(ctx, shin, base, C.scD, { k: 1.1, lw: 2.7 });
  else celR(ctx, shin, base, C.scD, { k: 1.1, lw: 2.8, detail: (c) => { c.strokeStyle = C.scL; c.lineWidth = 1; c.beginPath(); for (let y = 5; y < SHIN - 2; y += 4) { c.moveTo(-2.6, y); c.lineTo(2.6, y + 1.2); } c.stroke(); } }, 1.1);
  ctx.translate(0, SHIN);
  ctx.rotate(-h * DEG);
  cel(ctx, (c) => capsule(c, META, 6.4, 6), base, C.scD, { k: 1, lw: 2.7 });
  // little heel spur
  flat(ctx, (c) => { c.moveTo(-2.5, -1.5); c.lineTo(-7, -3.5); c.lineTo(-3, 2); c.closePath(); }, K.claw, 1.6);
  ctx.translate(0, META);
  ctx.rotate((a + s + h - footAbs) * DEG);
  // three toes splayed forward, black claws
  ctx.fillStyle = K.claw;
  ctx.beginPath();
  for (const [x, y] of [[13.5, 0.2], [15.2, 3.0], [12.6, 4.6]]) {
    ctx.moveTo(x - 1.5, y - 1.6); ctx.quadraticCurveTo(x + 3.2, y - 1.4, x + 4.2, y + 1.6); ctx.quadraticCurveTo(x + 1.5, y + 0.8, x - 1, y + 1.6);
  }
  ctx.fill();
  cel(ctx, (c) => {
    c.moveTo(-4.5, -3); c.quadraticCurveTo(4, -4.5, 9, -2.2);
    c.quadraticCurveTo(14.5, -2.6, 14.6, 0.6);
    c.quadraticCurveTo(17, 1.4, 16, 3.6);
    c.quadraticCurveTo(15.8, 5.6, 13, FOOTH);
    c.lineTo(-3.5, FOOTH); c.quadraticCurveTo(-6.5, 3.5, -4.5, -3);
    c.closePath();
  }, base, C.scD, { k: 0.9, lw: 2.6 });
  ink(ctx, (c) => { c.moveTo(9.5, -0.6); c.quadraticCurveTo(12, 0.6, 14.2, 1.2); c.moveTo(9, 2.2); c.quadraticCurveTo(11.5, 3, 13.4, 3.6); }, 1.2, C.scD);
  ctx.restore();
}

// -------------------------------------------------- torso (torso frame: hip at 0,0, up = -y)
const HEM = [[12, 3], [9, 7.5], [6, 4], [2, 8.5], [-2, 4.5], [-6, 9], [-9, 4.5], [-12, 7]];
function jerkinPath(c) {
  c.moveTo(-12, 7);
  c.bezierCurveTo(-17, -1, -18, -17, -11, -27);
  c.bezierCurveTo(-7, -33, 0, -35, 5, -33);
  c.quadraticCurveTo(6, -27, 11, -24);
  c.bezierCurveTo(15, -18, 15, -6, 12, 3);
  for (let i = 1; i < HEM.length; i++) c.lineTo(HEM[i][0], HEM[i][1]);
  c.closePath();
}
function torso(ctx, p) {
  // cream chest showing at the open collar (drawn first, the jerkin overlaps it)
  cel(ctx, (c) => blob(c, [[3, -33], [11, -31], [13, -24], [8, -22], [3, -26]], 0.5), C.belly, C.bellyD, { lw: 2.4,
    detail: (c) => { c.fillStyle = K.occ; c.beginPath(); ellipse(c, 8, -32, 6, 3); c.fill(); } });
  const bend = clamp((p.tor - 26) * 0.08, -2, 3);     // belly folds deepen as it hunches
  celR(ctx, jerkinPath, C.kit === 'pick' ? '#5e5045' : K.lea, K.leaD, { k: 1.4, hi: K.leaH, hk: 0.35, lw: 3, detail: (c) => {
    // a stitched patch on the hunched back
    c.save(); c.translate(-9, -17); c.rotate(-0.25);
    c.fillStyle = K.patch; c.fillRect(-4.5, -4.5, 9, 9);
    c.fillStyle = K.patchD; c.fillRect(-4.5, 2.5, 9, 2);
    c.strokeStyle = K.leaD; c.lineWidth = 1.1;
    c.beginPath();
    for (let i = -3; i <= 3; i += 3) { c.moveTo(i - 1, -6); c.lineTo(i + 1, -3.4); c.moveTo(-6, i - 1); c.lineTo(-3.4, i + 1); c.moveTo(i - 1, 6); c.lineTo(i + 1, 3.4); c.moveTo(6, i - 1); c.lineTo(3.4, i + 1); }
    c.stroke();
    c.restore();
    // seam + pose-driven folds + stitching along the hem
    c.strokeStyle = K.leaD; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(-4, -32); c.quadraticCurveTo(-8, -18, -5, 4);
    c.moveTo(-13, -10); c.quadraticCurveTo(-9, -9 + bend, -6, -10.5);
    c.moveTo(-14, -15); c.quadraticCurveTo(-10.5, -14 + bend * 0.7, -7.5, -15.5);
    c.stroke();
    c.setLineDash([1.6, 1.8]); c.lineWidth = 1;
    c.beginPath(); c.moveTo(-11, 4.5); c.lineTo(11, 1); c.stroke(); c.setLineDash([]);
    // occlusion under the collar and under the sash
    c.fillStyle = K.occ;
    c.beginPath(); c.moveTo(-8, -31); c.quadraticCurveTo(0, -27, 8, -29); c.lineTo(8, -35); c.lineTo(-8, -35); c.closePath(); c.fill();
    c.fillRect(-18, 0, 36, 4);
    sootBlobs(c, [[-10, -24, 3.2], [-2, -12, 2.4], [7, -4, 2.2]]);
  } }, 1.6);
  // iron belly plate with scratches
  cel(ctx, (c) => blob(c, [[1, -24], [10, -25], [15, -15], [13, -3], [4, -3], [0, -13]], 0.55), K.iron, K.ironD,
    { k: 1.3, hi: K.ironH, hk: 0.4, lw: 2.6, detail: (c) => {
      c.fillStyle = K.ironD;
      c.beginPath(); circle(c, 3, -21, 1.1); circle(c, 11.5, -21.5, 1.1); circle(c, 4, -6, 1.1); circle(c, 11.5, -6, 1.1); c.fill();
      c.fillStyle = K.ironS; c.beginPath(); circle(c, 2.7, -21.4, 0.5); circle(c, 11.2, -21.9, 0.5); c.fill();
      c.strokeStyle = K.ironD; c.lineWidth = 1.2; c.beginPath(); c.moveTo(1.5, -13.5); c.quadraticCurveTo(8, -12, 14.6, -14); c.stroke();
      c.strokeStyle = K.ironS; c.lineWidth = 0.8; c.beginPath(); c.moveTo(6, -19); c.lineTo(9.5, -16.5); c.moveTo(8, -9); c.lineTo(11, -10.5); c.stroke();
      sootBlobs(c, [[10, -8, 2.6]]);
    } });
  if (C.kit === 'bomb') bandolier(ctx);
  sash(ctx, p);
}
function sash(ctx, p) {
  const fl = Math.sin(T * 9 + 1) * 3 * FX.penA, fl2 = Math.sin(T * 9 + 2.3) * 3 * FX.penA;
  // the ends hang down-and-back on screen whatever the lean/rotation, trail with speed (follow); near the floor
  // (lying, sitting) they swing out to lie along it instead of poking through
  const tot = (p.tor - p.rot) * DEG;
  const room = -(G.hipY + (-12 * Math.sin(tot) - 2 * Math.cos(tot)));
  const ang = 0.5 + FX.sash + 1.2 * clamp(1 - room / 18, 0, 1);
  ctx.save(); ctx.translate(-12, -2); ctx.rotate(ang - tot); ctx.scale(1, clamp(room / 16, 0.55, 1));
  cel(ctx, (c) => { c.moveTo(-1, -2); c.quadraticCurveTo(-5 + fl * 0.4, 6, -9 + fl, 14); c.lineTo(-4 + fl, 14.5); c.lineTo(-6 + fl, 17); c.quadraticCurveTo(0, 7, 3, 0); c.closePath(); },
    K.sash, K.sashD, { lw: 2.3, detail: (c) => { c.strokeStyle = K.sashD; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 2); c.lineTo(-5 + fl * 0.6, 12); c.stroke(); } });
  cel(ctx, (c) => { c.moveTo(1, -1); c.quadraticCurveTo(1 + fl2 * 0.4, 6, 0 + fl2, 12); c.lineTo(4 + fl2, 13); c.quadraticCurveTo(6, 6, 4, 0); c.closePath(); },
    K.sash, K.sashD, { lw: 2.3 });
  ctx.restore();
  cel(ctx, (c) => { c.moveTo(-15, -6); c.quadraticCurveTo(0, -3, 14.5, -7); c.lineTo(14, -1); c.quadraticCurveTo(0, 3, -14.5, 0); c.closePath(); },
    K.sash, K.sashD, { lw: 2.5, hi: K.sashH, hk: 0.3, detail: (c) => {
      // woven rag: little cross-hatched stripes
      c.strokeStyle = K.sashD; c.lineWidth = 1; c.beginPath();
      for (let x = -13; x < 14; x += 3.4) { c.moveTo(x, -5); c.lineTo(x + 1.6, 1); }
      c.stroke();
      c.globalAlpha = 0.5; c.beginPath(); c.moveTo(-14, -2.5); c.quadraticCurveTo(0, 0, 14, -4); c.stroke(); c.globalAlpha = 1;
    } });
  cel(ctx, (c) => ellipse(c, -12.5, -3, 3.6, 3.2), K.sash, K.sashD, { lw: 2.3 });
}
// bomber: a leather bandolier strap across the chest
function bandolier(ctx) {
  cel(ctx, (c) => { c.moveTo(-6, -33); c.lineTo(-1, -33.5); c.lineTo(14, -4); c.lineTo(9, -2); c.closePath(); }, K.leaD, '#33291f',
    { lw: 2.2, detail: (c) => { c.strokeStyle = K.leaH; c.lineWidth = 0.9; c.setLineDash([1.4, 1.6]); c.beginPath(); c.moveTo(-3, -31); c.lineTo(10, -6); c.stroke(); c.setLineDash([]); } });
  cel(ctx, (c) => { c.moveTo(1, -23); c.lineTo(7, -24); c.lineTo(8.5, -19); c.lineTo(2.5, -18); c.closePath(); }, K.brass, K.brassD, { lw: 1.8 });
}

// -------------------------------------------------- shaman robe: skirt (hip space, over the thighs) + bodice (torso frame)
function robeSkirt(ctx, p) {
  // hem tracks the knees so the robe swings with the stride; follow() makes it trail when moving
  const kx = (hip, a) => hip[0] + Math.sin(a * DEG) * THIGH;
  const kb = Math.min(kx(HIP_N, p.nt), kx(HIP_F, p.ft)), kf = Math.max(kx(HIP_N, p.nt), kx(HIP_F, p.ft));
  const sw = FX.robe, hy = 30;
  const path = (c) => {
    c.moveTo(-14, -6);
    c.quadraticCurveTo(-17 + sw * 0.3, 12, kb - 9 + sw, hy - 1);
    c.lineTo(kb - 3 + sw, hy + 3); c.lineTo(kb + 3 + sw * 0.8, hy); c.lineTo((kb + kf) / 2 + sw * 0.6, hy + 4);
    c.lineTo(kf + 2 + sw * 0.4, hy); c.lineTo(kf + 8 + sw * 0.3, hy + 3);
    c.quadraticCurveTo(kf + 6, 12, 14, -6);
    c.closePath();
  };
  celR(ctx, path, K.robe, K.robeD, { k: 1.6, hi: K.robeH, hk: 0.3, lw: 3, detail: (c) => {
    // folds that follow the legs + gold hem trim + occlusion under the sash
    c.strokeStyle = K.robeD; c.lineWidth = 1.5; c.beginPath();
    c.moveTo(-4, -2); c.quadraticCurveTo(kb * 0.4, 14, kb + sw * 0.8, hy);
    c.moveTo(4, -2); c.quadraticCurveTo(kf * 0.5, 14, (kb + kf) / 2 + sw * 0.6, hy + 2);
    c.stroke();
    c.strokeStyle = K.gold; c.lineWidth = 2.4; c.beginPath();
    c.moveTo(kb - 9 + sw, hy - 2.5); c.lineTo(kb - 3 + sw, hy + 1.5); c.lineTo(kb + 3 + sw * 0.8, hy - 1.5); c.lineTo((kb + kf) / 2 + sw * 0.6, hy + 2.5);
    c.lineTo(kf + 2 + sw * 0.4, hy - 1.5); c.lineTo(kf + 8 + sw * 0.3, hy + 1.5); c.stroke();
    c.fillStyle = K.occ; c.fillRect(-20, -8, 40, 6);
  } }, 1.6);
}
function robeTorso(ctx, p) {
  cel(ctx, (c) => blob(c, [[3, -33], [11, -31], [13, -24], [8, -22], [3, -26]], 0.5), C.belly, C.bellyD, { lw: 2.4 });
  const path = (c) => {
    c.moveTo(-13, 4);
    c.bezierCurveTo(-17, -1, -18, -17, -11, -27);
    c.bezierCurveTo(-7, -33, 0, -35, 5, -33);
    c.quadraticCurveTo(6, -27, 11, -24);
    c.bezierCurveTo(15, -18, 15, -6, 13, 4);
    c.closePath();
  };
  celR(ctx, path, K.robe, K.robeD, { k: 1.5, hi: K.robeH, hk: 0.3, lw: 3, detail: (c) => {
    // gold trim down the front opening + collar, a fold or two, occlusion under the collar
    c.strokeStyle = K.gold; c.lineWidth = 2.6; c.beginPath(); c.moveTo(5, -32); c.quadraticCurveTo(8, -26, 11, -24); c.quadraticCurveTo(13, -12, 12, 3); c.stroke();
    c.strokeStyle = K.goldD; c.lineWidth = 0.9; c.beginPath(); c.moveTo(6.2, -31); c.quadraticCurveTo(9, -26, 11.8, -23.4); c.stroke();
    c.strokeStyle = K.robeD; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-6, -30); c.quadraticCurveTo(-10, -16, -7, 2); c.moveTo(-13, -14); c.quadraticCurveTo(-9, -12, -6, -14); c.stroke();
    c.fillStyle = K.occ; c.beginPath(); c.moveTo(-8, -31); c.quadraticCurveTo(0, -27, 8, -29); c.lineTo(8, -35); c.lineTo(-8, -35); c.closePath(); c.fill();
  } }, 1.6);
  // bone-bead necklace with a green gem
  ctx.fillStyle = K.bone; ctx.strokeStyle = INK; ctx.lineWidth = 1;
  ctx.beginPath(); for (const [x, y] of [[-4, -31], [-1, -28.5], [2.5, -27.5], [6, -28]]) circle(ctx, x, y, 1.4); ctx.fill(); ctx.stroke();
  flat(ctx, (c) => { c.moveTo(3, -27); c.lineTo(5.2, -24.4); c.lineTo(3, -21.6); c.lineTo(0.8, -24.4); c.closePath(); }, K.gem, 1.2);
  sash(ctx, p);
}

// -------------------------------------------------- head (head frame: origin at the neck joint)
const FACE_JAW = { mean: 3, yell: 30, ouch: 14, ko: 12, scared: 20, smug: 1, surprised: 16 };
function head(ctx, p) {
  const face = p.face;
  // scaly neck with a cream throat, a couple of dorsal spikes on the back
  flat(ctx, (c) => { c.moveTo(-8, -6); c.lineTo(-12, -8); c.lineTo(-7, -11); c.lineTo(-10, -14); c.lineTo(-4, -15); c.closePath(); }, C.frillD, 2);
  cel(ctx, (c) => blob(c, [[-6, 3], [-7, -9], [-1, -17], [9, -18], [10, -6], [7, 3]], 0.5), C.sc, C.scD, { k: 1.1, lw: 2.7,
    detail: (c) => {
      c.fillStyle = C.belly; c.beginPath(); c.ellipse(9, -6, 4.5, 11, 0.15, 0, TAU); c.fill();
      c.fillStyle = K.occ; c.beginPath(); ellipse(c, 6, -15, 8, 4); c.fill();       // under the jaw
    } });
  ctx.translate(6, -19);
  const jaw = (FACE_JAW[face] ?? 3) + p.jaw + FX.talk;
  const ja = jaw * DEG, jc = Math.cos(ja), js = Math.sin(ja);
  frill(ctx, -6, 1, 0.85, C.frillD, C.frillD);
  if (jaw > 4) {
    flat(ctx, (c) => { c.moveTo(-3, 3); c.lineTo(33, 2.6); c.lineTo(-4 + 34 * jc + 1.5 * js, 5 + 34 * js - 1.5 * jc); c.closePath(); }, K.mouth, 0);
  }
  // lower jaw (hinged below the cheek)
  ctx.save(); ctx.translate(-4, 5); ctx.rotate(ja);
  cel(ctx, (c) => { c.moveTo(-3, -2); c.lineTo(35, -1.6); c.quadraticCurveTo(38, 2, 33, 3.6); c.quadraticCurveTo(14, 7.8, 0, 6.2); c.quadraticCurveTo(-5, 4, -3, -2); c.closePath(); },
    C.sc, C.scD, { k: 1, lw: 2.7, detail: (c) => {
      c.fillStyle = C.belly; c.beginPath(); c.moveTo(0, 3.6); c.quadraticCurveTo(16, 3.5, 36, 1.5); c.lineTo(36, 9); c.lineTo(-4, 9); c.closePath(); c.fill();
      c.strokeStyle = C.bellyD; c.lineWidth = 0.9; c.beginPath(); for (let x = 4; x < 32; x += 4.5) { c.moveTo(x, 4.2); c.lineTo(x + 1, 6.6); } c.stroke();
    } });
  if (jaw > 4) {
    if (face !== 'ouch') flat(ctx, (c) => ellipse(c, 15, -1.6, 9, 2.4), K.tongue, 1.4);
    ctx.fillStyle = K.tooth; ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let x = 12; x <= 32; x += 5) { ctx.moveTo(x - 1.5, -1.4); ctx.lineTo(x, -4.6); ctx.lineTo(x + 1.5, -1.4); }
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  // skull + long snout
  const skull = (c) => {
    c.moveTo(-11, 7);
    c.bezierCurveTo(-16, 1, -15, -10, -6, -13);
    c.bezierCurveTo(2, -16, 12, -11.5, 22, -9);
    c.quadraticCurveTo(33, -7, 36.5, -3.5);
    c.quadraticCurveTo(39.5, 0.5, 35, 3);
    c.lineTo(3, 4.5);
    c.quadraticCurveTo(-4, 9, -11, 7);
    c.closePath();
  };
  celR(ctx, skull, C.sc, C.scD, { k: 1.3, hi: C.scH, hk: 0.4, lw: 3.1, detail: (c) => {
    c.strokeStyle = C.scL; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(16, -7); c.arc(18, -7.5, 2, Math.PI, 0); c.moveTo(22, -6); c.arc(24, -6.4, 2, Math.PI, 0); c.moveTo(28, -4.6); c.arc(30, -5, 1.8, Math.PI, 0); c.stroke();
    scaleTex(c, -12, 4, -6, 6, C.scL, 2);
    c.fillStyle = K.occ; c.beginPath(); ellipse(c, 2, -10, 15, 5.5); c.fill();      // under the hat brim
    sootBlobs(c, [[26, -2, 3.2], [33, 0, 2], [-6, 2, 3]]);
  } }, 1.4);
  ctx.fillStyle = K.tooth; ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let x = 9; x <= 32; x += 3.8) {
    const y0 = 4.5 - (x - 3) * 1.5 / 32;
    ctx.moveTo(x - 1.6, y0 - 0.3); ctx.lineTo(x, y0 + (face === 'yell' ? 3.6 : 3)); ctx.lineTo(x + 1.6, y0 - 0.3);
  }
  ctx.fill(); ctx.stroke();
  if (face === 'smug') ink(ctx, (c) => { c.moveTo(4, 4.5); c.quadraticCurveTo(0, 4, -1.5, 0.5); }, 2);
  else if (face === 'mean') ink(ctx, (c) => { c.moveTo(4, 4.5); c.quadraticCurveTo(0.5, 5.5, -1, 7.5); }, 2);
  ink(ctx, (c) => { c.moveTo(31.5, -4.5); c.quadraticCurveTo(33.5, -5, 34.5, -3.5); }, 1.8);
  if (face === 'ouch') {
    ink(ctx, (c) => { c.moveTo(30, 5); c.quadraticCurveTo(38, 6, 40, 12); c.lineTo(38.5, 15.5); c.moveTo(40, 12); c.lineTo(42.5, 14.8); }, 4.4);
    ink(ctx, (c) => { c.moveTo(30, 5); c.quadraticCurveTo(38, 6, 40, 12); c.lineTo(38.5, 15.5); c.moveTo(40, 12); c.lineTo(42.5, 14.8); }, 2.2, K.tongue);
  }
  frill(ctx, -8, 3, 1, C.frill, C.frillD);
  if (C.hat === 'hard') hardHat(ctx, p);
  else if (C.hat === 'cap') goggleCap(ctx, p);
  else if (C.hat === 'crown') crown(ctx, p);
  else helmet(ctx, p);
  eyes(ctx, p);
  if (face === 'ko') koStars(ctx, p);
  else if (face === 'scared') {
    flat(ctx, (c) => { c.moveTo(-14, -20); c.quadraticCurveTo(-11, -15, -12, -13); c.quadraticCurveTo(-14, -11, -16, -13); c.quadraticCurveTo(-17, -15, -14, -20); c.closePath(); }, K.sweat, 1.6);
  }
}

function frill(ctx, x, y, s, col, colD) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  cel(ctx, (c) => {
    c.moveTo(2, -7);
    c.lineTo(-11, -16);
    c.quadraticCurveTo(-8, -9, -9, -6);
    c.lineTo(-17, -3);
    c.quadraticCurveTo(-10, -1, -9, 2);
    c.lineTo(-14, 10);
    c.quadraticCurveTo(-5, 6, 2, 5);
    c.closePath();
  }, col, colD, { k: 0.9, lw: 2.4, detail: (c) => {
    c.strokeStyle = colD; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(0, -3); c.lineTo(-10, -14); c.moveTo(0, -1); c.lineTo(-15, -3); c.moveTo(0, 1); c.lineTo(-12, 8); c.stroke();
  } });
  ctx.restore();
}

// black-iron pot helmet with a small horn and the ONE green gem (spear soldiers); captain gets a plume
function helmet(ctx, p) {
  const hs = C.helm;
  ctx.save();
  ctx.translate(-4, -11.5); ctx.rotate(0.1); ctx.scale(hs, hs);
  if (C.plume) {
    const w = Math.sin(T * 6) * 1.5;
    ctx.save(); ctx.translate(2, -17); ctx.rotate(FX.plume); ctx.translate(-2, 17);
    cel(ctx, (c) => {
      c.moveTo(4, -17);
      c.quadraticCurveTo(4, -34, -12, -33 + w * 0.3);
      c.quadraticCurveTo(-27, -30, -29 + w, -12);
      c.lineTo(-24 + w, -15); c.lineTo(-23 + w, -9); c.lineTo(-19, -15); c.lineTo(-16, -11); c.lineTo(-13, -18);
      c.quadraticCurveTo(-6, -22, -2, -16);
      c.closePath();
    }, K.sash, K.sashD, { k: 1.3, hi: K.sashH, hk: 0.4, lw: 2.7, detail: (c) => {
      c.strokeStyle = K.sashD; c.lineWidth = 1.1; c.beginPath();
      c.moveTo(0, -26); c.quadraticCurveTo(-12, -30, -20, -18); c.moveTo(-4, -22); c.quadraticCurveTo(-14, -25, -22, -12); c.stroke();
    } });
    ctx.restore();
  }
  cel(ctx, (c) => { c.moveTo(-4, -17); c.quadraticCurveTo(-4, -25, -10, -30); c.quadraticCurveTo(-1, -27, 3, -18); c.closePath(); },
    K.iron, K.ironD, { k: 0.9, hi: K.ironH, hk: 0.5, lw: 2.5 });
  const dome = (c) => { c.moveTo(-14, 0); c.bezierCurveTo(-15, -14, -7, -20, 0, -20); c.bezierCurveTo(8, -20, 15, -13, 14, 0); c.closePath(); };
  celR(ctx, dome, K.iron, K.ironD, { k: 1.5, hi: K.ironH, hk: 0.35, lw: 3, detail: (c) => {
    c.fillStyle = K.ironD; c.fillRect(-16, -4.5, 32, 4.5);
    c.fillStyle = K.ironH; c.beginPath(); circle(c, -9, -2.2, 1); circle(c, -2, -2.2, 1); circle(c, 5, -2.2, 1); c.fill();
    c.strokeStyle = K.ironS; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-8, -14); c.lineTo(-4, -11); c.moveTo(-1, -17); c.lineTo(2, -15.5); c.stroke();   // scratches
  } }, 1.4);
  cel(ctx, (c) => ellipse(c, 0, 0.5, 17.5, 3.4), K.iron, K.ironD, { k: 0.7, hi: K.ironH, hk: 0.5, lw: 2.7 });
  gemOn(ctx, 8, -12, p);
  ctx.restore();
}
function gemOn(ctx, x, y, p, s = 1) {
  const gl = clamp(p.glow, 0, 1);
  flat(ctx, (c) => circle(c, x, y, 4.2 * s), K.ironD, 2);
  flat(ctx, (c) => { c.moveTo(x, y - 4 * s); c.lineTo(x + 2.8 * s, y); c.lineTo(x, y + 4 * s); c.lineTo(x - 2.8 * s, y); c.closePath(); }, K.gem, 1.5);
  ctx.fillStyle = gl > 0.5 ? '#ffffff' : K.gemC; ctx.beginPath(); ellipse(ctx, x - 0.8 * s, y - 1.2 * s, 1.1 * s, 1.6 * s); ctx.fill();
}
// miner: dented ochre hardhat with a lit candle stub (its flame leans with motion via follow)
function hardHat(ctx, p) {
  ctx.save();
  ctx.translate(-4, -11.5); ctx.rotate(0.1);
  // candle stub in a little iron dish on top
  cel(ctx, (c) => { c.moveTo(-3, -20); c.lineTo(3.4, -20); c.lineTo(3, -30); c.quadraticCurveTo(0, -31.5, -2.6, -30); c.closePath(); }, K.wax, K.waxD,
    { lw: 2.2, detail: (c) => { c.fillStyle = K.waxD; c.beginPath(); c.moveTo(1.5, -30); c.quadraticCurveTo(2.4, -27, 1.4, -25); c.quadraticCurveTo(0.8, -27, 1.5, -30); c.fill(); } });
  ink(ctx, (c) => { c.moveTo(0.2, -30.5); c.lineTo(0.2, -33); }, 1.4);
  ctx.save(); ctx.translate(0.2, -33); ctx.rotate(FX.flame * 0.9);
  const fl = 1 + Math.sin(T * 19) * 0.08 + Math.sin(T * 7.7) * 0.06;
  flat(ctx, (c) => { c.moveTo(0, 0); c.bezierCurveTo(3.2, -1, 2.6, -6 * fl, 0, -9 * fl); c.bezierCurveTo(-2.6, -6 * fl, -3.2, -1, 0, 0); c.closePath(); }, K.fl1, 1.5);
  flat(ctx, (c) => { c.moveTo(0, -0.8); c.bezierCurveTo(1.4, -1.4, 1.2, -4 * fl, 0, -5.6 * fl); c.bezierCurveTo(-1.2, -4 * fl, -1.4, -1.4, 0, -0.8); c.closePath(); }, K.fl2, 0);
  ctx.restore();
  cel(ctx, (c) => ellipse(c, 0.2, -20, 5.5, 1.6), K.iron, K.ironD, { lw: 1.8 });
  const dome = (c) => { c.moveTo(-14, 0); c.bezierCurveTo(-15, -15, -6, -21, 1, -21); c.bezierCurveTo(9, -21, 15, -14, 14, 0); c.closePath(); };
  celR(ctx, dome, K.hat, K.hatD, { k: 1.5, hi: K.hatH, hk: 0.35, lw: 3, detail: (c) => {
    c.fillStyle = K.hatD; c.fillRect(-16, -5, 32, 5);
    c.strokeStyle = K.hatD; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-6, -19); c.quadraticCurveTo(-2, -10, -3, -5); c.moveTo(6, -19); c.quadraticCurveTo(9, -10, 8, -5); c.stroke();
    c.strokeStyle = K.hatH; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-10, -12); c.quadraticCurveTo(-8, -10, -9, -8); c.stroke();   // dent
    sootBlobs(c, [[-9, -6, 4], [10, -14, 3]]);
  } }, 1.4);
  cel(ctx, (c) => ellipse(c, 0, 0.6, 18, 3.6), K.hat, K.hatD, { k: 0.7, hi: K.hatH, hk: 0.5, lw: 2.7 });
  gemOn(ctx, 9, -3, p, 0.75);
  ctx.restore();
}
// bomber: padded leather cap with ear flap and big brass goggles pushed up on the forehead
function goggleCap(ctx, p) {
  ctx.save();
  ctx.translate(-4, -11.5); ctx.rotate(0.1);
  // ear flap (behind the frill)
  cel(ctx, (c) => { c.moveTo(-12, -2); c.quadraticCurveTo(-14, 8, -9, 12); c.quadraticCurveTo(-5, 10, -5, -1); c.closePath(); }, K.cap, K.capD, { lw: 2.4 });
  const cap = (c) => { c.moveTo(-14, 1); c.bezierCurveTo(-15, -13, -7, -19, 1, -19); c.bezierCurveTo(8, -19, 14, -13, 13, 0); c.quadraticCurveTo(0, 3, -14, 1); c.closePath(); };
  celR(ctx, cap, K.cap, K.capD, { k: 1.5, hi: K.capH, hk: 0.35, lw: 3, detail: (c) => {
    c.strokeStyle = K.capD; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-1, -19); c.quadraticCurveTo(-3, -9, -2, 1); c.stroke();
    c.setLineDash([1.4, 1.6]); c.lineWidth = 0.9; c.beginPath(); c.moveTo(1, -18.5); c.quadraticCurveTo(-1, -9, 0, 0.5); c.stroke(); c.setLineDash([]);
    c.fillStyle = K.occ; c.fillRect(-16, -2, 32, 4);
  } }, 1.4);
  // strap + goggles (far lens peeks behind the near one)
  ink(ctx, (c) => { c.moveTo(-13, -8); c.quadraticCurveTo(0, -13, 13, -11); }, 3.6, K.capD);
  for (const [x, y, r, far] of [[10.5, -14, 4.2, true], [4, -12.5, 5.4, false]]) {
    flat(ctx, (c) => circle(c, x, y, r + 1.6), far ? K.brassD : K.brass, 2.2);
    flat(ctx, (c) => circle(c, x, y, r - 0.4), far ? K.lensD : K.lens, 1.2);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ellipse(ctx, x - r * 0.35, y - r * 0.35, r * 0.28, r * 0.18, -0.6); ctx.fill();
  }
  ctx.restore();
}
// shaman: tall bone-and-gold headdress (gold circlet, fan of bone prongs, sun disc with the green gem, swaying beads)
function crown(ctx, p) {
  ctx.save();
  ctx.translate(-4, -11.5); ctx.rotate(0.1);
  // bead strings hanging behind (follow sway)
  const sw = FX.plume * 14;
  ink(ctx, (c) => { c.moveTo(-12, -2); c.quadraticCurveTo(-14 + sw * 0.5, 6, -13 + sw, 13); c.moveTo(-9, -1); c.quadraticCurveTo(-10 + sw * 0.5, 7, -8 + sw, 12); }, 1.2, K.goldD);
  ctx.fillStyle = K.bone; ctx.strokeStyle = INK; ctx.lineWidth = 0.9;
  ctx.beginPath(); for (const [x, y] of [[-13.4 + sw * 0.6, 7], [-13 + sw, 13], [-9.6 + sw * 0.6, 7], [-8 + sw, 12]]) circle(ctx, x, y, 1.5); ctx.fill(); ctx.stroke();
  // bone prongs fanning up and back
  const prong = (x, ang, len, w) => {
    ctx.save(); ctx.translate(x, -3); ctx.rotate(ang);
    cel(ctx, (c) => { c.moveTo(-w, 0); c.quadraticCurveTo(-w * 0.9, -len * 0.6, -1.2, -len); c.quadraticCurveTo(0.6, -len * 0.98, 1, -len * 0.92); c.quadraticCurveTo(w * 0.9, -len * 0.55, w, 0); c.closePath(); },
      K.bone, K.boneD, { k: 0.8, lw: 2.3, detail: (c) => { c.strokeStyle = K.boneD; c.lineWidth = 1; c.beginPath(); for (let y = -6; y > -len + 5; y -= 6) { c.moveTo(-w, y); c.lineTo(w, y - 1); } c.stroke(); } });
    ctx.restore();
  };
  prong(-10, -0.75, 24, 3); prong(-5, -0.42, 30, 3.4); prong(1, -0.12, 34, 3.6); prong(7, 0.18, 26, 3.2);
  // gold circlet
  celR(ctx, (c) => { c.moveTo(-15, 1); c.quadraticCurveTo(0, -3, 14, 0); c.lineTo(13.5, -6); c.quadraticCurveTo(0, -9, -14.5, -5); c.closePath(); },
    K.gold, K.goldD, { k: 1, hi: K.goldH, hk: 0.45, lw: 2.8, detail: (c) => {
      c.fillStyle = K.goldD; c.beginPath(); for (const x of [-10, -4, 3]) circle(c, x, -2.8, 1); c.fill();
    } }, 1.2);
  // sun disc at the front with the green gem
  cel(ctx, (c) => { star(c, 9.5, -9, 8, 5.2); }, K.gold, K.goldD, { k: 0.9, hi: K.goldH, hk: 0.45, lw: 2.2 });
  gemOn(ctx, 9.5, -9, p, 0.9);
  ctx.restore();
}

// big round yellow eyes with slit pupils; lids give the expression
function eyes(ctx, p) {
  const face = p.face;
  const big = face === 'scared' || face === 'surprised' ? 1.12 : face === 'yell' ? 1.05 : 1;
  eye(ctx, 12.5, -14.5, 5.8 * big, face, p, true);
  eye(ctx, 5.5, -13, 7.4 * big, face, p, false);
}
function eye(ctx, x, y, r, face, p, far) {
  const closed = face === 'ouch' || (FX.blink && (face === 'mean' || face === 'smug'));
  flat(ctx, (c) => circle(c, x, y, r), closed ? C.sc : K.eye, 0);
  ctx.save();
  ctx.beginPath(); circle(ctx, x, y, r); ctx.clip();
  if (!closed) {
    ctx.fillStyle = K.eyeD; ctx.beginPath(); circle(ctx, x + r * 0.35, y + r * 0.45, r * 0.8); ctx.fill();
    ctx.fillStyle = K.eye; ctx.beginPath(); circle(ctx, x - r * 0.12, y - r * 0.12, r * 0.86); ctx.fill();
    const px = x + r * 0.28;
    ctx.fillStyle = K.pupil;
    if (face === 'ko') {
      ctx.restore();
      ink(ctx, (c) => { for (let a = 0; a < 4 * Math.PI; a += 0.35) { const rr = r * 0.85 * a / (4 * Math.PI); c.lineTo(x + Math.cos(a + T * 6) * rr, y + Math.sin(a + T * 6) * rr); } }, 1.5);
      ctx.save(); ctx.beginPath(); circle(ctx, x, y, r); ctx.clip();
    } else if (face === 'scared' || face === 'surprised') {
      ctx.beginPath(); circle(ctx, px - r * 0.1, y, r * 0.2); ctx.fill();
    } else {
      ctx.beginPath(); ellipse(ctx, px, y + 0.4, r * (face === 'yell' ? 0.14 : 0.2), r * 0.66); ctx.fill();
    }
    ctx.fillStyle = '#fff'; ctx.beginPath(); circle(ctx, x - r * 0.38, y - r * 0.38, r * 0.2); ctx.fill();
    let l0 = null, l1 = null;
    if (face === 'mean') { l0 = -0.62; l1 = -0.05; }
    else if (face === 'yell') { l0 = -0.85; l1 = -0.35; }
    else if (face === 'smug') { l0 = -0.08; l1 = 0.02; }
    if (l0 !== null) {
      ctx.fillStyle = far ? C.scD : C.sc;
      ctx.beginPath(); ctx.moveTo(x - r - 1, y - r - 2); ctx.lineTo(x + r + 1, y - r - 2); ctx.lineTo(x + r + 1, y + r * l1); ctx.lineTo(x - r - 1, y + r * l0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = K.occ; ctx.beginPath(); ctx.moveTo(x - r - 1, y + r * l0); ctx.lineTo(x + r + 1, y + r * l1); ctx.lineTo(x + r + 1, y + r * l1 + 2.2); ctx.lineTo(x - r - 1, y + r * l0 + 2.2); ctx.closePath(); ctx.fill();
      ctx.restore();
      ink(ctx, (c) => { c.moveTo(x - r * 1.05, y + r * l0 - 0.3); c.lineTo(x + r * 1.05, y + r * l1 + 0.3); }, 2.4);
      ctx.save();
    }
  }
  ctx.restore();
  ink(ctx, (c) => circle(c, x, y, r), 2.5);
  if (!far && !closed && p.glow > 0.3) {
    const g = clamp((p.glow - 0.3) / 0.7, 0, 1), R = 2.2 + 3.2 * g;
    flat(ctx, (c) => star(c, x + r * 0.55, y - r * 0.75, R, R * 0.28), '#fffbe0', 1.3);
  }
  if (closed) {
    if (face === 'ouch') ink(ctx, (c) => { c.moveTo(x - r * 0.6, y - r * 0.5); c.lineTo(x + r * 0.35, y); c.lineTo(x - r * 0.6, y + r * 0.5); }, 2);
    else ink(ctx, (c) => { c.moveTo(x - r * 0.8, y + 0.5); c.quadraticCurveTo(x, y + r * 0.45, x + r * 0.8, y + 0.5); }, 1.8);
  }
}

// little dizzy stars circling above the head (always upright on screen)
function koStars(ctx, p) {
  ctx.save();
  ctx.translate(-2, -14);
  ctx.rotate((p.rot - p.tor - p.head) * DEG);
  for (let i = 0; i < 3; i++) {
    const a = T * 4 + i * TAU / 3;
    flat(ctx, (c) => star(c, Math.cos(a) * 15, -22 + Math.sin(a) * 4, 4.2, 1.5), K.star, 1.5);
  }
  ctx.restore();
}

// -------------------------------------------------- arms (hip space; the IK has already placed the joints)
function limb(ctx, x0, y0, x1, y1, w0, w1, base, dark, lw = 2.7, r = false) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(rotOf(dx, dy));
  if (r) celR(ctx, (c) => capsule(c, L, w0, w1), base, dark, { k: 1.1, lw }, 1.1);
  else cel(ctx, (c) => capsule(c, L, w0, w1), base, dark, { k: 1.1, lw });
  ctx.restore();
}
function sleeve(ctx, x0, y0, x1, y1, far) {
  // shaman: wide robe sleeve over the forearm, flaring towards the wrist
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(rotOf(dx, dy));
  cel(ctx, (c) => { c.moveTo(-5, -2); c.lineTo(5, -2); c.lineTo(8.5, L - 2); c.quadraticCurveTo(0, L + 2, -8.5, L - 2); c.closePath(); },
    far ? K.robeD : K.robe, K.robeD, { k: 1.1, lw: 2.6, detail: (c) => { c.strokeStyle = K.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(-8, L - 3.4); c.quadraticCurveTo(0, L - 0.4, 8, L - 3.4); c.stroke(); } });
  ctx.restore();
}
function farArm(ctx) {
  limb(ctx, G.fsx, G.fsy, G.fex, G.fey, 7.5, 6.5, C.scD, C.scD, 2.6);
  if (C.robe) sleeve(ctx, G.fex, G.fey, G.fhx, G.fhy, true);
  else limb(ctx, G.fex, G.fey, G.fhx, G.fhy, 6.5, 6, C.scD, C.scD, 2.6);
  if (!G.fgrip) freeHand(ctx, G.fhx, G.fhy, G.ffa, true);   // a free hand stays behind the body; a gripping one is drawn over the shaft
}
function nearArm(ctx, p) {
  limb(ctx, G.nsx, G.nsy, G.nex, G.ney, 8, 7, C.sc, C.scD, 2.8, true);
  if (C.robe) sleeve(ctx, G.nex, G.ney, G.gx, G.gy, false);
  else limb(ctx, G.nex, G.ney, G.gx, G.gy, 7, 6.2, C.sc, C.scD, 2.8);
  // shoulder cap following the upper arm (leather, or robe for the shaman)
  ctx.save(); ctx.translate(G.nsx, G.nsy); ctx.rotate(rotOf(G.nex - G.nsx, G.ney - G.nsy));
  cel(ctx, (c) => { c.moveTo(-6.5, 7); c.bezierCurveTo(-8, -3, -4, -6.5, 0, -6.5); c.bezierCurveTo(4, -6.5, 8, -3, 6.5, 7); c.quadraticCurveTo(0, 9.5, -6.5, 7); c.closePath(); },
    C.robe ? K.robe : K.lea, C.robe ? K.robeD : K.leaD, { lw: 2.5, hi: C.robe ? K.robeH : K.leaH, hk: 0.4, detail: (c) => {
      c.strokeStyle = C.robe ? K.gold : K.leaD; c.lineWidth = C.robe ? 1.6 : 1; if (!C.robe) c.setLineDash([1.4, 1.6]);
      c.beginPath(); c.moveTo(-5.2, 4.6); c.quadraticCurveTo(0, 6.8, 5.2, 4.6); c.stroke(); c.setLineDash([]);
      c.fillStyle = K.occ; c.beginPath(); ellipse(c, 0, 8, 7, 3); c.fill();
    } });
  ctx.restore();
  ctx.save(); ctx.translate(G.gx, G.gy);
  if (C.kit === 'bomb') {
    // a lit bomb cupped in the claw (it leaves the hand at the throw's release)
    const fa = rotOf(G.gx - G.nex, G.gy - G.ney);
    ctx.rotate(fa);
    if (p.bomb > 0.5) { ctx.save(); ctx.translate(0, 6); ctx.rotate(-fa); drawBomb(ctx, T, 0.9); ctx.restore(); }
    ctx.rotate(-Math.PI / 2);
    gripHand(ctx, false, p.bomb > 0.5);
  } else {
    ctx.rotate(Math.atan2(G.sn, G.ca));
    gripHand(ctx, false);
  }
  ctx.restore();
}
// claw wrapped round a haft (item frame: haft along +x)
function gripHand(ctx, far, cup = false) {
  cel(ctx, (c) => blob(c, [[-4.5, -4.2], [1, -5.6], [5, -3.4], [5.4, 2.4], [2, 5.4], [-4, 4.6], [-5.6, 0]], 0.6),
    far ? C.scD : C.sc, C.scD, { k: 0.9, lw: 2.5 });
  ink(ctx, (c) => { c.moveTo(-1.6, -1); c.lineTo(-1.6, 4.6); c.moveTo(1.6, -1.4); c.lineTo(1.6, 4.4); }, 1.1, C.scD);
  if (cup) return;
  ctx.fillStyle = K.claw;
  ctx.beginPath();
  for (const x of [-3.2, 0, 3.2]) { ctx.moveTo(x - 1.2, 4.6); ctx.lineTo(x + 0.6, 7.6); ctx.lineTo(x + 1.3, 4.4); }
  ctx.fill();
}
// open three-fingered claw at the end of a free forearm (rotation fa, hip space)
function freeHand(ctx, x, y, fa, far) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(fa);
  const base = far ? C.scD : C.sc;
  ctx.fillStyle = K.claw;
  ctx.beginPath();
  for (const a of [-0.5, 0, 0.5]) {
    const cx = -Math.sin(a) * 8.5, cy = Math.cos(a) * 8.5;
    ctx.moveTo(cx - 1.3, cy); ctx.lineTo(cx - Math.sin(a) * 3.5, cy + Math.cos(a) * 3.5); ctx.lineTo(cx + 1.3, cy);
  }
  ctx.fill();
  cel(ctx, (c) => {
    c.moveTo(-3.5, -1);
    c.lineTo(-4.6, 7.8); c.lineTo(-2.4, 8.4); c.lineTo(-1.2, 4.6);
    c.lineTo(-1.2, 9.4); c.lineTo(1.2, 9.4); c.lineTo(1.2, 4.6);
    c.lineTo(2.4, 8.4); c.lineTo(4.6, 7.8); c.lineTo(3.5, -1);
    c.closePath();
  }, base, C.scD, { k: 0.8, lw: 2.3 });
  ctx.restore();
}

// -------------------------------------------------- items (hip space)
function itemFrame(ctx) { ctx.save(); ctx.translate(G.gx, G.gy); ctx.rotate(Math.atan2(G.sn, G.ca)); }
// spear: wood-grain shaft, iron butt cap, cord binding, leaf blade; the pennant lags and flutters (follow)
function spear(ctx, p) {
  itemFrame(ctx);
  const sr = Math.atan2(G.sn, G.ca);
  const u1 = SHAFT - BUTT;
  cel(ctx, (c) => { c.moveTo(-BUTT, -2.3); c.lineTo(u1, -2.1); c.lineTo(u1, 2.1); c.lineTo(-BUTT, 2.3); c.closePath(); },
    K.wood, K.woodD, { k: 0.7, lw: 2.5, detail: (c) => { c.strokeStyle = K.woodD; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-BUTT + 4, -0.6); c.lineTo(-4, -0.9); c.moveTo(8, 0.8); c.lineTo(u1 - 8, 0.5); c.stroke(); } });
  cel(ctx, (c) => { c.moveTo(-BUTT - 3, -2.8); c.lineTo(-BUTT + 3, -2.8); c.lineTo(-BUTT + 3, 2.8); c.lineTo(-BUTT - 3, 2.8); c.closePath(); }, K.iron, K.ironD, { lw: 2.1 });
  // pennant: hangs on whichever side of the shaft is "down" on screen; trails behind spear rotations (follow)
  const tot = sr - p.rot * DEG;
  let side = (Math.cos(tot) + 0.6 * Math.sin(tot)) >= 0 ? 1 : -1;
  {
    const r = -p.rot * DEG, ua = u1 - 12;
    const bx = G.gx + G.ca * ua, by = G.gy + G.sn * ua;
    if (bx * Math.sin(r) + by * Math.cos(r) + 12 > -G.hipY) side = -side;
  }
  const lag = clamp(FX.pen, -0.9, 0.9);
  const A = FX.penA, w = Math.sin(T * (10 + A * 3)) * 2.2 * A, w2 = Math.sin(T * (10 + A * 3) - 1.2) * 2.2 * A;
  ctx.save(); ctx.translate(u1 - 8, 1.5 * side); ctx.rotate(lag * side * -1); ctx.translate(-(u1 - 8), -1.5 * side); ctx.scale(1, side);
  cel(ctx, (c) => {
    c.moveTo(u1 - 3, 1.5); c.lineTo(u1 - 13, 1.5);
    c.quadraticCurveTo(u1 - 18, 6 + w2, u1 - 24, 9 + w);
    c.lineTo(u1 - 16, 8 + w2 * 0.6); c.lineTo(u1 - 19, 13 + w);
    c.quadraticCurveTo(u1 - 9, 9 + w2 * 0.5, u1 - 3, 1.5);
    c.closePath();
  }, K.pen, K.penD, { k: 0.8, lw: 2.1, detail: (c) => { c.strokeStyle = K.penD; c.lineWidth = 0.9; c.beginPath(); c.moveTo(u1 - 6, 3); c.lineTo(u1 - 14, 9 + w2 * 0.6); c.stroke(); } });
  ctx.restore();
  cel(ctx, (c) => blob(c, [[u1 - 4, -3.2], [u1 + 2, -3], [u1 + 3, 0], [u1 + 2, 3], [u1 - 4, 3.2]], 0.3), K.ironD, K.ironD,
    { lw: 2.1, detail: (c) => { c.strokeStyle = K.iron; c.lineWidth = 0.9; c.beginPath(); for (let u = u1 - 3; u < u1 + 2; u += 1.6) { c.moveTo(u, -3); c.lineTo(u + 1, 3); } c.stroke(); } });
  cel(ctx, (c) => {
    c.moveTo(u1 + 1, 0);
    c.quadraticCurveTo(u1 + 6, -6.4, u1 + 11, -4.4);
    c.quadraticCurveTo(u1 + 15, -2.4, u1 + BLADE, 0);
    c.quadraticCurveTo(u1 + 15, 2.4, u1 + 11, 4.4);
    c.quadraticCurveTo(u1 + 6, 6.4, u1 + 1, 0);
    c.closePath();
  }, K.blade, K.bladeD, { k: 1, hi: K.bladeH, hk: 0.5, lw: 2.5 });
  ink(ctx, (c) => { c.moveTo(u1 + 3, 0); c.lineTo(u1 + BLADE - 3, 0); }, 1, K.bladeD);
  ctx.restore();
}
// pickaxe: worn wooden haft with a leather grip, double-ended iron head (spike on the +v side)
function pick(ctx, p) {
  itemFrame(ctx);
  cel(ctx, (c) => { c.moveTo(PICK0, -2.4); c.lineTo(PICK1, -2.2); c.lineTo(PICK1, 2.2); c.lineTo(PICK0, 2.4); c.closePath(); },
    K.wood, K.woodD, { k: 0.7, lw: 2.5, detail: (c) => {
      c.strokeStyle = K.woodD; c.lineWidth = 0.8; c.beginPath(); c.moveTo(PICK0 + 3, -0.6); c.lineTo(12, -0.8); c.moveTo(18, 0.9); c.lineTo(PICK1 - 6, 0.6); c.stroke();
      c.fillStyle = K.leaD; c.fillRect(PICK0, -2.6, 9, 5.2);
      sootBlobs(c, [[PICK1 - 5, 0, 2.5]]);
    } });
  ctx.save(); ctx.translate(PICK1, 0);
  const head = (c) => {
    c.moveTo(-4, -5); c.quadraticCurveTo(-2, -12, -7, -15);       // blunt back end (-v)
    c.lineTo(-2, -13.5); c.quadraticCurveTo(3, -9, 3.5, -4);
    c.quadraticCurveTo(5, 6, 7, 14); c.quadraticCurveTo(6.5, 18, 4, 21);   // curved spike (+v), tip ~ (4, 21)
    c.quadraticCurveTo(1.5, 12, -3.5, 4.5);
    c.closePath();
  };
  celR(ctx, head, K.iron, K.ironD, { k: 1.2, hi: K.ironH, hk: 0.45, lw: 2.7, detail: (c) => {
    c.strokeStyle = K.ironS; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, 2); c.lineTo(2.5, 11); c.moveTo(-1, -6); c.lineTo(-3, -11); c.stroke();
  } }, 1.1);
  cel(ctx, (c) => { c.moveTo(-4.2, -4.2); c.lineTo(4, -4.2); c.lineTo(4, 4.2); c.lineTo(-4.2, 4.2); c.closePath(); }, K.ironD, K.ironD, { lw: 2,
    detail: (c) => { c.fillStyle = K.ironH; c.beginPath(); circle(c, 0, 0, 1.1); c.fill(); } });
  ctx.restore();
  ctx.restore();
}
// shaman staff: gnarled wood, gold bands, a gold claw cradling green dragon-fire (flame stays upright, leans with motion)
function staff(ctx, p) {
  itemFrame(ctx);
  const s0 = STAFF0, s1 = STAFF1;
  const path = (c) => {
    c.moveTo(s0, -2); c.quadraticCurveTo(-20, -3.4, -6, -2.2); c.quadraticCurveTo(14, -1.2, 30, -3); c.quadraticCurveTo(48, -3.6, s1 - 4, -2.6);
    c.lineTo(s1 - 4, 2.6); c.quadraticCurveTo(48, 3.4, 30, 2.4); c.quadraticCurveTo(14, 1.6, -6, 2.6); c.quadraticCurveTo(-20, 3.2, s0, 2);
    c.closePath();
  };
  cel(ctx, path, K.wood, K.woodD, { k: 0.7, lw: 2.6, detail: (c) => {
    c.strokeStyle = K.woodD; c.lineWidth = 0.9; c.beginPath(); c.moveTo(s0 + 4, 0.6); c.quadraticCurveTo(-10, -0.8, 6, 0.4); c.moveTo(26, -0.8); c.lineTo(s1 - 8, -0.2); c.stroke();
    c.fillStyle = K.woodD; c.beginPath(); ellipse(c, 14, 0.3, 1.6, 1); c.fill();
  } });
  for (const u of [-14, 40]) cel(ctx, (c) => { c.moveTo(u - 2.4, -3.4); c.lineTo(u + 2.4, -3.4); c.lineTo(u + 2.4, 3.4); c.lineTo(u - 2.4, 3.4); c.closePath(); }, K.gold, K.goldD, { lw: 1.8, hi: K.goldH, hk: 0.5 });
  // gold claw: three prongs curling round the flame
  ctx.save(); ctx.translate(s1 - 4, 0);
  ink(ctx, (c) => { c.moveTo(0, -2); c.quadraticCurveTo(7, -9, 13, -6); c.moveTo(0, 2); c.quadraticCurveTo(7, 9, 13, 6); c.moveTo(0, 0); c.lineTo(10, 0); }, 4.6);
  ink(ctx, (c) => { c.moveTo(0, -2); c.quadraticCurveTo(7, -9, 13, -6); c.moveTo(0, 2); c.quadraticCurveTo(7, 9, 13, 6); c.moveTo(0, 0); c.lineTo(10, 0); }, 2.4, K.gold);
  // flame ball at the claw, drawn in a world-upright frame
  const sr = Math.atan2(G.sn, G.ca) - p.rot * DEG;
  ctx.translate(9, 0); ctx.rotate(-sr);
  const fs = 0.45 + 0.75 * clamp(p.flame, 0, 1.2);
  greenFlame(ctx, fs, 0, FX.flame * 6 - 0.3);
  if (p.gather > 0.02) {
    // motes of green fire spiralling in
    ctx.fillStyle = K.gf1;
    for (let i = 0; i < 5; i++) {
      const ph = (T * 1.6 + i / 5) % 1, a = i * 1.3 + T * 3, rr = (1 - ph) * 30 * p.gather + 5;
      ctx.globalAlpha = clamp(p.gather, 0, 1) * (0.4 + 0.6 * ph);
      ctx.beginPath(); circle(ctx, Math.cos(a) * rr, -6 + Math.sin(a) * rr * 0.7, 1.4 + ph * 1.6); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.restore();
}
// bomber: satchel of bombs at the near hip (bounces with follow), the faction gem on the flap
function satchel(ctx, p) {
  ctx.save(); ctx.translate(-9, -4); ctx.rotate(FX.sat + (p.tor - 26) * 0.004);
  // bombs peeking out
  for (const [x, y, sp] of [[-6.5, -2, false], [0.5, -4, true]]) { ctx.save(); ctx.translate(x, y); ctx.scale(0.72, 0.72); drawBomb(ctx, T + x, 1, !sp); ctx.restore(); }
  const bag = (c) => { c.moveTo(-10, -1); c.lineTo(6, -2); c.quadraticCurveTo(8, 8, 5, 14); c.quadraticCurveTo(-3, 16, -10, 13); c.quadraticCurveTo(-12, 6, -10, -1); c.closePath(); };
  celR(ctx, bag, K.cap, K.capD, { k: 1.2, hi: K.capH, hk: 0.35, lw: 2.8, detail: (c) => {
    c.strokeStyle = K.capD; c.lineWidth = 0.9; c.setLineDash([1.4, 1.6]); c.beginPath(); c.moveTo(-9, 11.5); c.quadraticCurveTo(-2, 13.6, 4, 12); c.stroke(); c.setLineDash([]);
  } }, 1.2);
  cel(ctx, (c) => { c.moveTo(-11, -2); c.lineTo(7, -3); c.lineTo(6, 5); c.quadraticCurveTo(-2, 7, -10.5, 5); c.closePath(); }, K.capD, '#3a2a1b', { lw: 2.3 });
  gemOn(ctx, -2, 3, p, 0.6);
  ctx.restore();
}

/**
 * A ~16 px round black bomb, centred on the origin.  fuse01 = 1 fresh .. 0 about to blow: the fuse burns down,
 * its spark flickers and the body flashes red faster and faster as it runs out.
 */
export function drawBomb(ctx, t, fuse01 = 1, noSpark = false) {
  const f = clamp(fuse01, 0, 1);
  const rate = 3 + (1 - f) * 22;
  const blink = f < 0.6 && Math.sin(t * rate * TAU * 0.5) > 0.2;
  const lc = ctx.lineCap, lj = ctx.lineJoin;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // fuse (shrinks as it burns)
  const L = 3 + 7 * f;
  ink(ctx, (c) => { c.moveTo(2.5, -7); c.quadraticCurveTo(4.5, -7 - L * 0.6, 3 + L * 0.35, -7 - L); }, 3.2);
  ink(ctx, (c) => { c.moveTo(2.5, -7); c.quadraticCurveTo(4.5, -7 - L * 0.6, 3 + L * 0.35, -7 - L); }, 1.6, K.fuse);
  celR(ctx, (c) => circle(c, 0, 0, 8), blink ? '#d8443a' : K.bomb, blink ? '#8f1f1f' : K.bombD, { k: 1, hi: blink ? '#ff9a7a' : K.bombH, hk: 0.45, lw: 2.7 }, 1.3);
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85; ctx.beginPath(); ellipse(ctx, -3, -3.2, 1.8, 1.1, -0.6); ctx.fill(); ctx.globalAlpha = 1;
  cel(ctx, (c) => { c.moveTo(-0.5, -9.4); c.lineTo(5, -8.6); c.lineTo(4.6, -5.4); c.lineTo(-0.3, -6.4); c.closePath(); }, K.iron, K.ironD, { lw: 1.6 });
  if (!noSpark) {
    const sx = 3 + L * 0.35, sy = -7 - L, sp = 0.75 + 0.35 * Math.sin(t * (30 + (1 - f) * 40)) + 0.2 * Math.sin(t * 53);
    flat(ctx, (c) => star(c, sx, sy, (4.6 + (1 - f) * 1.6) * sp, 1.4), K.fl1, 1);
    ctx.fillStyle = K.fl2; ctx.beginPath(); circle(ctx, sx, sy, 1.4); ctx.fill();
  }
  ctx.lineCap = lc; ctx.lineJoin = lj;
}

// -------------------------------------------------- effects
// spear thrust: a tapered streak trailing the blade + two speed lines (item frame)
function streak(ctx, p) {
  const a = clamp(p.smear, 0, 1);
  const tip = SHAFT - BUTT + BLADE, L = p.sl;
  itemFrame(ctx);
  ctx.globalAlpha = 0.8 * a;
  ctx.fillStyle = '#fffbea';
  ctx.beginPath();
  ctx.moveTo(tip + 2, 0);
  ctx.quadraticCurveTo(tip - 6, -9, tip - L, -1.2);
  ctx.lineTo(tip - L, 1.2);
  ctx.quadraticCurveTo(tip - 6, 9, tip + 2, 0);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.65 * a;
  ctx.strokeStyle = '#fffbea'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tip - 14, -12); ctx.lineTo(tip - 14 - L * 0.6, -12);
  ctx.moveTo(tip - 22, 12); ctx.lineTo(tip - 22 - L * 0.45, 12);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}
// swing crescent (pick strike, bomb lob) swept round the near shoulder; a0 -> a1 in degrees from down, + = forward
function crescent(ctx, p) {
  const a0 = p.a0, a1 = p.a1, R = p.ar, n = 16;
  ctx.save();
  ctx.translate(G.nsx, G.nsy);
  ctx.globalAlpha = clamp(p.smear, 0, 1) * 0.85;
  const pt = (a, r, i) => { const x = Math.sin(a * DEG) * r, y = Math.cos(a * DEG) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); };
  ctx.beginPath();
  for (let i = 0; i <= n; i++) pt(a0 + (a1 - a0) * (i / n), R + 8, i);
  for (let i = n; i >= 0; i--) { const u = i / n; pt(a0 + (a1 - a0) * u, R + 8 - (2 + 15 * Math.pow(u, 1.3)), 1); }
  ctx.closePath();
  ctx.fillStyle = '#fffbea'; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}
// summon: a ring of green flame tongues spiralling up round the shaman (back half before the body, front half after)
function swirl(ctx, p, back) {
  const s = clamp(p.swirl, 0, 1);
  const n = 8, rx = 32, ry = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + T * 4.2;
    const front = Math.sin(a) > 0;
    if (front === back) continue;
    const h = ((i * 0.37 + T * 0.9) % 1);
    const x = Math.cos(a) * rx * (0.8 + 0.3 * h), y = 8 - h * 56 * s + Math.sin(a) * ry;
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = s * (1 - h * 0.7) * (front ? 1 : 0.7);
    greenFlame(ctx, 0.62 + 0.45 * (1 - h), i, Math.cos(a) * -0.5);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- measurements (local px, facing right, scale 1)
const r2 = (v) => v.map((n) => Math.round(n));
/** Spear point in the stab pose at full extension. */
export const SPEAR_TIP = r2(measure(ANIM.stab(0.18)).tip);
/** Miner: pick spike at the strike, mineHit k .35. */
export const PICK_TIP = r2(measure(ANIM.mineHit(0.35), 'miner').tip);
/** Bomber: hand (bomb centre) at the release, throw k .35. */
export const BOMB_HAND = r2(measure(ANIM.throw(0.35), 'bomber').hand);
/** Shaman: green fireball spawn point (the staff's claw) at the release, cast k .3. */
export const CAST_POINT = r2(measure(ANIM.cast(0.3), 'shaman').tip);
export const HEIGHT = 140;
/** Suggested body hurtbox (local px at scale 1): centred x px in front of the origin (times facing), w wide, h tall from the floor. */
export const HURTBOX = { x: 14, w: 56, h: 124 };
