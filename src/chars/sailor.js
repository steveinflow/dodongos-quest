// SAILOR (Skull Island, the Blue Gull -- docs/SKULL_ISLAND.md): one of Blunderbeard's crew.  A grown man in the crew's navy
// uniform (double-breasted jacket with gold piping and two rows of brass buttons over a grey shirt, a wide brown belt with a
// brass buckle, grey trousers, brown boots, a navy bandana), in FIVE FACES from the crew sheet (assets-src/si/refs/crew_sheet.png):
//   0 a tall skinny ginger young man | 1 a stout bald man with a black handlebar moustache | 2 an old grey-bearded man with
//   an eyepatch | 3 a big burly dark-skinned man with a short black beard | 4 a wiry spiky-blond man.
// FOUR KITS (o.kit): 'club' (a belaying-pin club) | 'rope' (a lasso) | 'net' (hoists a net from the rigging: both hands up a
// rope) | 'bandana' (the purple-bandana thug: striped shirt, a short cutlass, a quick lunge).  Kid-friendly: stern, never gory.
// A code rig, the stand-in until its painted pack lands.  Local space: origin = the floor under him, +x = facing, y down;
// ~172 px at scale 1 (adults: a head taller than the kids).
// Clips: idle(t) walk(ph) taunt(t) windup(k) swing(k) lungeWind(k) lunge(k) throwWind(k) throw(k) pullWind(k) pull(t)
// hurt(k) fly down getup(k) flee(ph).
import { TAU, DEG, cel, flat, ink, capsule, ellipse, circle, blob, keys, legDrop } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 172;
export const META = { id: 'sailor', name: 'SAILOR', height: 172 };
export const HURTBOX = { x: 0, w: 26, h: 158 };
export const FACE_NAMES = ['GINGER', 'BALD', 'PATCH', 'BURLY', 'SPIKY'];

const STILL = { x: 0, y: 0, tor: 4, head: 0, fa: 10, fe: 28, ba: -8, be: 18, ft: 6, fk: -8, bt: -6, bk: 8, wa: 0, face: 'neutral', smear: 0, sq: 1, up: 0, lie: 0, club: 0 };
const P = (o) => Object.assign({}, STILL, o);
const WALK = (ph) => {
  const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU), b = Math.abs(s);
  return P({ tor: 6 + 1.5 * b, head: -2 + 1.5 * s, ft: 30 * s, fk: -8 - 26 * Math.max(0, -c), bt: -30 * s, bk: -8 - 26 * Math.max(0, c), fa: -26 * s + 8, fe: 24, ba: 26 * s - 6, be: 20 });
};
const WIND = P({ tor: -8, head: -4, fa: 150, fe: 20, wa: 40, ba: 20, be: 40, ft: 14, fk: -20, bt: -16, bk: 10, x: -4, face: 'yell', club: 1 });
const COIL = P({ tor: 14, head: 4, y: 6, fa: -18, fe: 80, wa: 20, ba: 30, be: 40, ft: 22, fk: -40, bt: -34, bk: -20, x: -6, sq: 0.94, face: 'yell' });
export const ANIM = {
  idle: (t) => P({ tor: 4 + 1.2 * Math.sin(t * 2.2), head: 1.5 * Math.sin(t * 1.3), fa: 22 + 2 * Math.sin(t * 2.2), wa: 24, ba: -8 - 2 * Math.sin(t * 2.2 + 1), y: 0.8 * Math.sin(t * 2.2) }),
  walk: WALK,
  taunt: (t) => P({ tor: 8, head: -6, fa: 40 + 12 * Math.sin(t * 6), fe: 70, wa: 14 * Math.sin(t * 6), face: 'yell', ba: -20 }),
  // the club: up over the shoulder, then a hard overhead chop
  windup: (k) => keys(k, [[0, P({})], [1, WIND, 'out']]),
  swing: (k) => keys(k, [
    [0, WIND],
    [0.22, P({ tor: 24, head: 6, fa: 58, fe: 16, wa: -30, ba: 30, be: 40, ft: 24, fk: -22, bt: -22, bk: 6, x: 8, face: 'yell', smear: 1, club: 1 }), 'snap'],
    [0.55, P({ tor: 20, head: 4, fa: 44, fe: 20, wa: -42, ba: 22, ft: 22, fk: -18, bt: -20, bk: 4, x: 8, smear: 0.3, club: 1 })],
    [1, P({ x: 2 }), 'io'],
  ]),
  // the bandana thug: crouch and coil, then a long low lunge with the short cutlass
  lungeWind: (k) => keys(k, [[0, P({})], [1, COIL, 'out']]),
  lunge: (k) => keys(k, [
    [0, COIL],
    [0.25, P({ tor: 36, head: 10, y: 2, fa: 84, fe: 8, wa: -4, ba: -46, be: 20, ft: 52, fk: -14, bt: -46, bk: -4, x: 10, face: 'yell', smear: 1 }), 'snap'],
    [0.6, P({ tor: 32, head: 8, fa: 80, fe: 10, wa: -4, ba: -40, ft: 50, fk: -12, bt: -44, x: 10, smear: 0.3 })],
    [1, P({ x: 3 }), 'io'],
  ]),
  // the lasso: swing the loop over the head ... and fling it
  throwWind: (k) => P({ tor: 2 - 6 * k, head: -4 * k, fa: 120 + 40 * k, fe: 30, wa: 0, ba: -10, ft: 8, fk: -10, bt: -8, bk: 8, up: Math.min(1, k * 3), face: 'yell' }),
  throw: (k) => keys(k, [
    [0, P({ tor: -4, head: -4, fa: 160, fe: 30, ba: -10, up: 1, face: 'yell' })],
    [0.3, P({ tor: 22, head: 6, fa: 88, fe: 8, ba: 20, ft: 24, fk: -16, bt: -22, x: 8, up: 0, face: 'yell', smear: 0.6 }), 'snap'],
    [1, P({ tor: 12, fa: 40, fe: 20, ft: 12, bt: -10, x: 4, up: 0 }), 'io'],
  ]),
  // the net: both hands up the rope, a hard haul
  pullWind: (k) => P({ tor: 2 + 6 * k, fa: 120 * k + 10, fe: 20, ba: 100 * k - 8, be: 20, ft: 10 + 8 * k, fk: -10 - 8 * k, bt: -8 - 8 * k, face: 'yell', up: Math.min(1, k * 3) }),
  pull: (t) => { const h = Math.sin(t * 9); return P({ tor: 10 + 6 * h, head: -6, fa: 128 + 14 * h, fe: 10, ba: 112 + 14 * h, be: 12, ft: 14 + 3 * h, fk: -18, bt: -14, bk: -10, y: 2 * (1 - h), face: 'yell', up: 1 }); },
  hurt: (k) => P({ tor: -14 * (1 - k), head: -10 * (1 - k), fa: -30 * (1 - k) + 10, fe: 40, ba: 40 * (1 - k) - 8, ft: 10, fk: -16, bt: -12, bk: 10, x: -6 * (1 - k), face: 'ouch', sq: 0.97 }),
  fly: () => P({ tor: -34, head: -18, fa: 130, fe: 30, ba: 110, be: 20, ft: 40, fk: -30, bt: 20, bk: -20, y: -26, face: 'ouch' }),
  down: () => P({ tor: -84, head: -20, fa: 20, fe: 10, ba: 40, ft: 80, fk: -4, bt: 70, bk: -4, face: 'ko', lie: 1 }),
  getup: (k) => keys(k, [[0, P({ tor: -84, head: -20, ft: 80, fk: -4, bt: 70, bk: -4, face: 'ko', lie: 1 })], [0.6, P({ tor: 44, head: 10, fa: 30, ba: 30, ft: 60, fk: -80, bt: -20, bk: -60, y: 6, face: 'ouch' })], [1, P({})]]),
  flee: (ph) => WALK(ph * 2),
};

ANIM.roping = () => ANIM.throw(1);   // (the code rig's: the pack has its own 'roping' tug)
// ------------------------------------------------------------------------------------------------ the five faces and builds
const FACES = [
  { skin: '#f0c6a0', skinD: '#c89a78', hair: '#c9772e', build: [1.1, 0.84] },    // tall skinny ginger
  { skin: '#f0b496', skinD: '#c98a72', hair: null, build: [0.94, 1.32] },        // stout bald, handlebar moustache
  { skin: '#e6bf9e', skinD: '#bf9878', hair: '#b4b4b8', build: [1.0, 1.08] },    // old, grey beard, eyepatch
  { skin: '#7a5238', skinD: '#563622', hair: '#16121a', build: [1.07, 1.36] },   // big burly, short black beard
  { skin: '#f2cdac', skinD: '#c9a07e', hair: '#e8c04a', build: [0.99, 0.88] },   // wiry spiky blond
];
const NAVY = '#344a8c', NAVYD = '#1e2c5c', NAVYH = '#5670bc', GOLD = '#d6b04c', GREY = '#8e8e98', PANTS = '#666a74', PANTSD = '#474b55';
const BOOT = '#6e4528', BOOTD = '#47291a', BELT = '#5c3a22', BRASS = '#e0b84a', PURPLE = '#8a46c4', PURPLED = '#5e2c8e', WOOD = '#9a6a3c', WOODD = '#6a4524';
const LEG = [38, 36], ARM = [34, 32];
const hipOf = (p) => Math.max(legDrop(LEG[0], LEG[1], 9, p.ft, p.fk), legDrop(LEG[0], LEG[1], 9, p.bt, p.bk));

function limb(ctx, a1, l1, a2, l2, w, cA, dA, cB, dB, end) {
  ctx.save(); ctx.rotate(-a1 * DEG);
  cel(ctx, (c) => capsule(c, l1, w[0], w[1]), cA, dA, { lw: 2.6 });
  ctx.translate(0, l1); ctx.rotate(-a2 * DEG);
  cel(ctx, (c) => capsule(c, l2, w[1], w[2]), cB, dB, { lw: 2.6 });
  ctx.translate(0, l2);
  if (end) end(ctx, a1 + a2);
  ctx.restore();
}
function boot(ctx, rot) {
  ctx.rotate(rot * DEG);   // flat: undo the leg's own turn
  cel(ctx, (c) => { c.moveTo(-7, -6); c.lineTo(-7, 4); c.lineTo(20, 4); c.quadraticCurveTo(25, 2, 18, -4); c.lineTo(8, -6); c.closePath(); }, BOOT, BOOTD, { lw: 2.6 });
}

/** the face and its hair at the head's centre (0, 0), facing +x: skin, brows, eyes, mouth, hair, headgear */
function drawHead(ctx, F, face, kit, p, t) {
  const bd = kit === 'bandana';
  flat(ctx, (c) => c.rect(-6, 10, 12, 14), F.skinD, 0);   // the neck
  cel(ctx, (c) => { c.moveTo(-14, 2); c.quadraticCurveTo(-17, -14, -4, -19); c.quadraticCurveTo(14, -22, 18, -6); c.quadraticCurveTo(21, 8, 10, 15); c.quadraticCurveTo(-6, 19, -14, 2); c.closePath(); }, F.skin, F.skinD, { lw: 2.8 });
  flat(ctx, (c) => ellipse(c, -8, 1, 4, 5.5), F.skinD, 2);   // the ear
  const hair = F.hair;
  if (face === 0) flat(ctx, (c) => { c.moveTo(-14, -8); c.quadraticCurveTo(-26, 4, -20, 24); c.lineTo(-10, 12); c.quadraticCurveTo(-10, -2, -6, -10); c.closePath(); }, hair, 2.2);   // ginger: long hair at the back
  if (face === 4) flat(ctx, (c) => { c.moveTo(-15, -10); c.lineTo(-26, -20); c.lineTo(-13, -19); c.lineTo(-17, -32); c.lineTo(-5, -22); c.lineTo(-4, -36); c.lineTo(4, -23); c.lineTo(10, -33); c.lineTo(12, -19); c.lineTo(20, -22); c.lineTo(17, -9); c.closePath(); }, hair, 2.2);   // spiky tufts
  if (face === 2) flat(ctx, (c) => { c.moveTo(-12, 4); c.quadraticCurveTo(-14, 26, 2, 30); c.quadraticCurveTo(16, 28, 16, 8); c.quadraticCurveTo(6, 16, -12, 4); c.closePath(); }, '#cfcfd4', 2.4);   // the grey beard
  if (face === 3) flat(ctx, (c) => { c.moveTo(-12, 2); c.quadraticCurveTo(-14, 22, 2, 25); c.quadraticCurveTo(18, 24, 18, 6); c.quadraticCurveTo(6, 14, -12, 2); c.closePath(); }, hair, 2.4);   // the short black beard
  const ex = [-2, 9], ouch = p.face === 'ouch', ko = p.face === 'ko', yell = p.face === 'yell';
  for (const x of ex) {
    if (ko) { ink(ctx, (c) => { c.moveTo(x - 3, -3); c.lineTo(x + 3, 3); c.moveTo(x + 3, -3); c.lineTo(x - 3, 3); }, 2); continue; }
    if (face === 2 && x === ex[1]) {   // the eyepatch and its strap
      flat(ctx, (c) => ellipse(c, x, -1, 5.5, 4.6), '#15121a', 1.6);
      ink(ctx, (c) => { c.moveTo(x - 5, -3); c.lineTo(-12, -9); c.moveTo(x + 5, -3); c.lineTo(17, -8); }, 1.8, '#15121a');
      continue;
    }
    flat(ctx, (c) => ellipse(c, x, -1, 3.6, ouch ? 2 : yell ? 3.6 : 3), '#fff', 1.4);
    flat(ctx, (c) => circle(c, x + 0.9, -1, 1.7), '#1a1420', 0);
  }
  const bl = yell ? -4 : ouch ? 3 : -2.2;   // brows: angry for the crew
  ink(ctx, (c) => { c.moveTo(-6, -7 + bl * 0.4); c.lineTo(3, -6 - bl); c.moveTo(6, -6 - bl); c.lineTo(14, -8 + bl * 0.4 + 1); }, 2.8, face === 2 ? '#b4b4b8' : face === 1 ? '#2a2020' : hair || '#2a2020');
  flat(ctx, (c) => { c.moveTo(15, -2); c.quadraticCurveTo(24, 4, 21, 8); c.quadraticCurveTo(17, 10, 14, 7); c.closePath(); }, F.skin, 2.2);   // the nose
  if (yell) flat(ctx, (c) => ellipse(c, 6, 11.5, 5.2, 3.4), '#3a1218', 1.8);
  else if (ouch) flat(ctx, (c) => ellipse(c, 6, 12, 3, 2.4), '#3a1218', 1.6);
  else ink(ctx, (c) => { c.moveTo(0, 12); c.quadraticCurveTo(6, 10, 12, 13); }, 2, '#5a2a24');
  if (face === 1) {   // the handlebar moustache, and the bald head's shine
    flat(ctx, (c) => { c.moveTo(-3, 9); c.quadraticCurveTo(6, 6, 15, 9); c.quadraticCurveTo(24, 6, 22, 14); c.quadraticCurveTo(14, 12, 6, 14); c.quadraticCurveTo(-2, 13, -8, 17); c.quadraticCurveTo(-8, 10, -3, 9); c.closePath(); }, '#16121a', 1.8);
    ink(ctx, (c) => { c.moveTo(-4, -14); c.quadraticCurveTo(3, -18, 8, -15); }, 2.2, 'rgba(255,255,255,0.65)');
  }
  // headgear: the crew's navy bandana (the thugs: purple, Malachar's colour)
  const cloth = bd ? PURPLE : NAVY, clothD = bd ? PURPLED : NAVYD;
  if (face === 2 || face === 4) flat(ctx, (c) => { c.moveTo(-15, -11); c.quadraticCurveTo(2, -19, 19, -11); c.lineTo(19, -5); c.quadraticCurveTo(2, -12, -15, -4); c.closePath(); }, cloth, 2.2);   // a headband
  else {              // a bandana over the head, its knot trailing behind
    flat(ctx, (c) => { c.moveTo(-16, -6); c.quadraticCurveTo(-14, -26, 4, -25); c.quadraticCurveTo(20, -22, 20, -9); c.quadraticCurveTo(2, -14, -16, -4); c.closePath(); }, cloth, 2.4);
    if (face === 1) ink(ctx, (c) => { c.moveTo(-13, -9); c.quadraticCurveTo(2, -15, 17, -10); }, 1.6, clothD);
  }
  const wag = Math.sin(t * 4) * 2;   // the knot's tails
  flat(ctx, (c) => { c.moveTo(-14, -9); c.quadraticCurveTo(-24, -6 + wag, -30, 2 + wag); c.lineTo(-22, 0 + wag); c.lineTo(-24, 8 + wag); c.quadraticCurveTo(-16, 2, -12, -4); c.closePath(); }, cloth, 2.2);
}

/** the kit in the hand (local: the hand's centre, the forearm's direction down): club / cutlass / lasso / the net's rope */
function drawKit(ctx, kit, p, t) {
  if (kit === 'net' && p.up > 0.05) {   // gripping the hauling rope: it runs straight up out of the picture, whatever the arm's angle
    ctx.save(); ctx.rotate((p.fa + p.fe - p.tor) * DEG);
    ink(ctx, (c) => { c.moveTo(0, 6); c.lineTo(0, -300); }, 6, INK);
    ink(ctx, (c) => { c.moveTo(0, 6); c.lineTo(0, -300); }, 3.4, '#d8c590');
    ctx.restore();
    return;
  }
  ctx.save(); ctx.rotate(p.wa * DEG);
  if (kit === 'club' || (kit === 'rope' && p.club && p.up < 0.05)) {   // a belaying-pin club: grip, a fat head
    cel(ctx, (c) => { c.moveTo(-4, 8); c.lineTo(-4, -30); c.quadraticCurveTo(-13, -40, -11, -62); c.quadraticCurveTo(0, -70, 11, -62); c.quadraticCurveTo(13, -40, 4, -30); c.lineTo(4, 8); c.closePath(); }, WOOD, WOODD, { lw: 2.8 });
    ink(ctx, (c) => { c.moveTo(-9, -52); c.lineTo(9, -52); }, 1.4, WOODD);
  } else if (kit === 'bandana') {   // a short curved cutlass
    cel(ctx, (c) => { c.moveTo(-6, 6); c.lineTo(-6, -4); c.lineTo(6, -4); c.lineTo(6, 6); c.closePath(); }, '#5c3a22', '#3a2414', { lw: 2.4 });
    flat(ctx, (c) => { c.moveTo(-9, -4); c.lineTo(9, -4); c.lineTo(9, -8); c.lineTo(-9, -8); c.closePath(); }, BRASS, 2);
    cel(ctx, (c) => { c.moveTo(-5, -8); c.quadraticCurveTo(-8, -44, 12, -62); c.quadraticCurveTo(4, -40, 5, -8); c.closePath(); }, '#d8dce4', '#9aa0ae', { lw: 2.4 });
  } else if (kit === 'rope' && p.up > 0.05) {   // the lasso loop, spinning over the head
    const sp = t * 14;
    ctx.save(); ctx.translate(0, -34); ctx.rotate(sp * 0.25);
    ink(ctx, (c) => { ellipse(c, 0, 0, 26, 10 + 6 * Math.sin(sp)); }, 5, INK);
    ink(ctx, (c) => { ellipse(c, 0, 0, 26, 10 + 6 * Math.sin(sp)); }, 2.8, '#d8c590');
    ctx.restore();
    ink(ctx, (c) => { c.moveTo(0, 0); c.lineTo(0, -34); }, 3.2, '#d8c590');
  } else if (kit === 'rope') {   // the coil hanging from the fist
    ink(ctx, (c) => { c.moveTo(0, 2); c.quadraticCurveTo(-14, 16, -10, 34); }, 4.6, INK);
    ink(ctx, (c) => { c.moveTo(0, 2); c.quadraticCurveTo(-14, 16, -10, 34); }, 2.6, '#d8c590');
  }
  ctx.restore();
}

/** a landmark, facing right, scale 1, the feet at (0, 0): 'hand' -- the front fist (the lasso's, the rope's), through the same chain draw()
 *  builds (the hip, the torso's turn, the shoulder, the two arm segments, the fist's centre); o.face: the builds.  src/sifoes.js Sailor.hand() */
export function point(pose, lm, o = {}) {
  if (lm !== 'hand') return null;
  const p = Object.assign({}, STILL, pose || {}), F = FACES[(((o.face ?? 0) | 0) % FACES.length + FACES.length) % FACES.length], bh = F.build[0];
  const lie = p.lie || 0, la = lie ? 0.9 : 1, hipY = lie ? -26 : -hipOf(p) * bh, torLen = 58 * bh;
  const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  let [x, y] = rot(0, ARM[1] * bh + 3, -p.fe * DEG); y += ARM[0] * bh;
  [x, y] = rot(x, y, -p.fa * DEG); y += -torLen + 8;
  [x, y] = rot(x, y, p.tor * DEG * la); y += hipY;
  y *= p.sq;
  if (lie) { x -= 8; y -= 12; }
  return [x + p.x, y + p.y];
}
/** a hand: a fist */
function hand(ctx, F) { cel(ctx, (c) => circle(c, 0, 3, 6.5), F.skin, F.skinD, { lw: 2.4 }); }

/** Draw with the feet at (0, 0).  o: { facing, t, scale, face 0..4, kit } */
export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {});
  const fi = ((o.face ?? 0) | 0) % FACES.length, F = FACES[fi], kit = o.kit || 'club';
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  const [bh, bw] = F.build, bd = kit === 'bandana';
  ctx.save(); ctx.scale(f * S, S);
  ctx.translate(p.x, p.y);
  const lie = p.lie || 0, la = lie ? 0.9 : 1;
  if (lie) ctx.translate(-8, -12);
  ctx.save();
  ctx.scale(1, p.sq);
  const hipY = lie ? -26 : -hipOf(p) * bh;
  const armW = [12 * bw, 10.5 * bw, 8.5 * bw], legW = [15 * bw, 13 * bw, 11 * bw], torLen = 58 * bh;
  const hw0 = 17 * bw, hw1 = 21 * bw;
  const torsoSpace = () => { ctx.translate(0, hipY); ctx.rotate(p.tor * DEG * la); };
  // the back arm
  ctx.save(); torsoSpace(); ctx.translate(-6, -torLen + 8);
  limb(ctx, p.ba, ARM[0] * bh, p.be, ARM[1] * bh, armW, NAVYD, '#10162c', NAVYD, '#10162c', (c) => hand(c, F));
  ctx.restore();
  // the legs
  const legAt = (xoff, a, k, far) => {
    ctx.save(); ctx.translate(xoff, hipY + 2);
    limb(ctx, a, LEG[0] * bh, k, LEG[1] * bh, legW, far ? PANTSD : PANTS, '#363a44', far ? PANTSD : PANTS, '#363a44', (c, tot) => boot(c, tot));
    ctx.restore();
  };
  legAt(-5, p.bt, p.bk, true);
  // the torso: the jacket (the thugs: a striped shirt), the belt, buttons, collar
  ctx.save(); torsoSpace();
  const torso = (c) => blob(c, [[-hw0, 2], [hw0, 2], [hw1 + 1, -torLen * 0.6], [hw1 - 3, -torLen], [-hw1 + 3, -torLen], [-hw1 - 1, -torLen * 0.6]], 0.5);
  cel(ctx, torso, bd ? '#d8d0bc' : NAVY, bd ? '#8c8470' : NAVYD, { lw: 3, hi: bd ? '#efe8d4' : NAVYH, hk: 0.3, detail: bd ? (c) => { c.fillStyle = '#2f3a68'; for (let y = -torLen; y < 4; y += 11) c.fillRect(-hw1 - 4, y, hw1 * 2 + 8, 5.5); } : (c) => {
    c.fillStyle = GREY; c.beginPath(); c.moveTo(-6 * bw, -torLen + 2); c.lineTo(6 * bw, -torLen + 2); c.lineTo(0, -torLen * 0.55); c.closePath(); c.fill();   // (the grey shirt's V)
    c.strokeStyle = GOLD; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-7 * bw, -torLen + 2); c.lineTo(-1, -torLen * 0.55); c.lineTo(-1, 2); c.moveTo(7 * bw, -torLen + 2); c.lineTo(1, -torLen * 0.55); c.lineTo(1, 2); c.stroke();
    c.fillStyle = BRASS; for (const y of [-torLen * 0.42, -torLen * 0.2]) for (const x of [-6 * bw, 6 * bw]) { c.beginPath(); c.arc(x, y, 1.9, 0, TAU); c.fill(); }
  } });
  if (!bd) flat(ctx, (c) => { c.moveTo(-hw1 + 3, -torLen); c.lineTo(-4, -torLen + 14); c.lineTo(0, -torLen + 2); c.lineTo(4, -torLen + 14); c.lineTo(hw1 - 3, -torLen); c.lineTo(hw1 - 6, -torLen - 4); c.lineTo(-hw1 + 6, -torLen - 4); c.closePath(); }, NAVYH, 2);   // the sailor collar
  else flat(ctx, (c) => { c.moveTo(-9, -torLen); c.lineTo(9, -torLen); c.lineTo(0, -torLen + 14); c.closePath(); }, PURPLE, 2);                                                                                                                  // the thug's neckerchief
  flat(ctx, (c) => c.rect(-hw0 - 2, -9, hw0 * 2 + 4, 9), BELT, 2.4);   // the belt and its brass buckle
  flat(ctx, (c) => c.rect(-5, -10, 11, 11), BRASS, 2);
  if (!bd) cel(ctx, (c) => { c.moveTo(-hw0 - 2, -4); c.lineTo(hw0 + 2, -4); c.lineTo(hw0 + 5, 12); c.lineTo(-hw0 - 5, 12); c.closePath(); }, NAVY, NAVYD, { lw: 2.6 });   // the jacket's skirt
  ctx.restore();
  legAt(5, p.ft, p.fk, false);
  // the head
  ctx.save(); torsoSpace(); ctx.translate(3, -torLen - 16 * bh); ctx.rotate(p.head * DEG);
  ctx.scale((bw > 1.2 ? 1.12 : bw < 0.9 ? 0.94 : 1) * 1.18, 1.18);   // (a cartoon head)
  drawHead(ctx, F, fi, kit, p, t);
  ctx.restore();
  // the front arm and the kit
  ctx.save(); torsoSpace(); ctx.translate(0, -torLen + 8);
  limb(ctx, p.fa, ARM[0] * bh, p.fe, ARM[1] * bh, armW, NAVY, NAVYD, NAVY, NAVYD, () => { drawKit(ctx, kit, p, t); hand(ctx, F); });
  ctx.restore();
  ctx.restore();
  if (p.smear > 0.05) {   // a swing's smear
    ctx.save(); ctx.globalAlpha = 0.5 * p.smear; ctx.lineCap = 'round';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(28, -96, 62, -1.2, 0.9); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
