// CAPTAIN BLUNDERBEARD (Skull Island, the Blue Gull's boss -- docs/SKULL_ISLAND.md): a very tall, thin, bony sea captain with
// long skinny limbs, a gaunt face with a big hooked nose, one gold tooth and small sly eyes, a long jet-black beard braided
// with gold rings, a blue tricorn, a navy captain's coat with brass buttons, a thick brown belt and boots, a ring with a
// glowing PURPLE stone on his right hand (Malachar's magic is purple), a cutlass -- and, at his belt, the purple conch horn
// carved with a split mask.  Warm on the surface, a villain underneath, and never scary: a pantomime pirate.
// A code rig, the stand-in until his painted pack (blunderbeard) lands.  ~285 px at scale 1 ("about twice the kids' height").
// Local space: origin = the floor under him, +x = facing, y down.
//   SWORD_TIP(pose): where the cutlass's point is (local px, scale 1) -- the lunge's reach.
// Clips: idle(t) walk(ph) laugh(t) lungeWind(k) lunge(k) slashWind(k) slash(k) whistleWind(k) whistle(t) hurt(k) stagger(t)
// clash(t) disarmed(t) conchWind(k) conch(t) flee(ph) down.   o: { sword (default true), glow 0..1, horn (the conch in hand) }.
import { TAU, DEG, cel, flat, ink, capsule, ellipse, circle, blob, keys, follow, legDrop, clamp } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 285;
export const META = { id: 'blunderbeard', name: 'CAPTAIN BLUNDERBEARD', height: 285 };
export const HURTBOX = { x: 0, w: 34, h: 262 };

const STILL = { x: 0, y: 0, tor: 3, head: 0, fa: 12, fe: 34, ba: -10, be: 22, ft: 5, fk: -6, bt: -5, bk: 6, wa: 0, face: 'sly', smear: 0, sq: 1, whistle: 0, horn: 0, lie: 0, brow: 0 };
const P = (o) => Object.assign({}, STILL, o);
const WALK = (ph) => {
  const s = Math.sin(ph * TAU), c = Math.cos(ph * TAU), b = Math.abs(s);
  return P({ tor: 5 + 1.5 * b, head: -2 + 1.5 * s, ft: 26 * s, fk: -8 - 22 * Math.max(0, -c), bt: -26 * s, bk: -8 - 22 * Math.max(0, c), fa: -18 * s + 10, fe: 30, ba: 22 * s - 8, be: 22 });
};
const LWIND = P({ tor: -10, head: -4, fa: -10, fe: 100, wa: 14, ba: 30, be: 40, ft: 20, fk: -34, bt: -26, bk: -14, x: -10, y: 5, face: 'grin', brow: 1 });
const SWIND = P({ tor: -16, head: -6, fa: 140, fe: 40, wa: 50, ba: 40, be: 30, ft: 14, fk: -20, bt: -18, bk: 10, x: -8, face: 'grin', brow: 1 });
export const ANIM = {
  idle: (t) => P({ tor: 3 + 1.2 * Math.sin(t * 1.8), head: 2 * Math.sin(t * 1.1), fa: 22 + 3 * Math.sin(t * 1.8), wa: 26, ba: -8 - 2 * Math.sin(t * 1.8 + 1), y: 1 * Math.sin(t * 1.8) }),
  walk: WALK,
  laugh: (t) => P({ tor: -8 + 3 * Math.sin(t * 14), head: -10, fa: 30, wa: 30, ba: 20, face: 'laugh', y: 2 * Math.abs(Math.sin(t * 14)) }),
  // the long-reach lunge: crouch and draw the blade back, then a huge stride with the point out front
  lungeWind: (k) => keys(k, [[0, P({})], [1, LWIND, 'out']]),
  lunge: (k) => keys(k, [
    [0, LWIND],
    [0.22, P({ tor: 40, head: 12, fa: 84, fe: 6, wa: -2, ba: -56, be: 20, ft: 58, fk: -10, bt: -50, bk: -2, x: 22, y: 2, face: 'grin', smear: 1, brow: 1 }), 'snap'],
    [0.6, P({ tor: 36, head: 10, fa: 82, fe: 8, wa: -2, ba: -50, ft: 56, fk: -10, bt: -48, x: 22, smear: 0.3, face: 'grin' })],
    [1, P({ x: 4 }), 'io'],
  ]),
  // the wide slash: the blade up and back, then round and across at chest height
  slashWind: (k) => keys(k, [[0, P({})], [1, SWIND, 'out']]),
  slash: (k) => keys(k, [
    [0, SWIND],
    [0.25, P({ tor: 26, head: 8, fa: 70, fe: 12, wa: -52, ba: 40, be: 30, ft: 26, fk: -20, bt: -22, bk: 6, x: 10, face: 'grin', smear: 1 }), 'snap'],
    [0.6, P({ tor: 22, head: 6, fa: 50, fe: 16, wa: -64, ba: 30, ft: 24, fk: -18, bt: -20, x: 10, smear: 0.35 })],
    [1, P({ x: 3 }), 'io'],
  ]),
  // the crew whistle: a finger-whistle at the lips, the other fist on the hip
  whistleWind: (k) => P({ tor: -6 * k, head: -8 * k, fa: 110 * k + 12, fe: 80 * k + 20, wa: 0, ba: 40 * k - 10, be: 80 * k + 20, whistle: k, face: 'grin', brow: 1 }),
  whistle: (t) => P({ tor: -8, head: -10 + 2 * Math.sin(t * 16), fa: 118, fe: 96, ba: 30, be: 100, whistle: 1, face: 'blow', y: 1.5 * Math.abs(Math.sin(t * 16)) }),
  hurt: (k) => P({ tor: -16 * (1 - k), head: -12 * (1 - k), fa: -20 * (1 - k) + 12, fe: 40, ba: 40 * (1 - k) - 10, ft: 8, fk: -14, bt: -10, bk: 8, x: -8 * (1 - k), face: 'ouch', sq: 0.98 }),
  stagger: (t) => P({ tor: -10 + 6 * Math.sin(t * 6), head: -8 + 6 * Math.sin(t * 6 + 1), fa: 20, fe: 50, ba: 50, ft: 8 + 6 * Math.sin(t * 6), fk: -12, bt: -8, bk: 8, face: 'ouch', x: -4, brow: -1 }),
  // swords crossed: the blade up and braced
  clash: (t) => P({ tor: 8, head: 4, fa: 96, fe: 30, wa: -22 + 3 * Math.sin(t * 18), ba: 30, be: 30, ft: 24, fk: -16, bt: -22, face: 'grin', smear: 0.4, brow: 1 }),
  // "Oh. You already did.": hands up, empty
  disarmed: (t) => P({ tor: -4, head: -4, fa: 150 + 3 * Math.sin(t * 5), fe: 20, ba: 146 + 3 * Math.sin(t * 5 + 1), be: 22, ft: 8, fk: -8, bt: -8, bk: 6, face: 'shock', brow: -1 }),
  conchWind: (k) => P({ tor: -6 * k, head: -6 * k, fa: 120 * k + 14, fe: 100 * k + 20, wa: 0, ba: 30 * k - 10, whistle: 0, horn: k, face: 'grin', brow: 1 }),
  conch: (t) => P({ tor: -14, head: -16, fa: 124, fe: 108, ba: 30, be: 40, horn: 1, face: 'blow', y: 1.5 * Math.abs(Math.sin(t * 8)) }),
  flee: (ph) => WALK(ph * 2),
  down: () => P({ tor: -84, head: -20, fa: 20, fe: 10, ba: 40, ft: 80, fk: -4, bt: 70, bk: -4, face: 'ouch', lie: 1 }),
};
const SWORD_LEN = 104;
/** the cutlass's point for a pose (local px, facing right, scale 1) */
export function SWORD_TIP(pose) {
  const p = Object.assign({}, STILL, pose || {}), torLen = 82;
  const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const tr = p.tor * DEG, hip = -hipOf(p);
  const S = rot(2, -torLen + 10, tr), sh = [S[0], hip + S[1]];
  const E = rot(0, ARM[0], tr - p.fa * DEG), H = rot(0, ARM[1], tr - (p.fa + p.fe) * DEG);
  const T = rot(0, -SWORD_LEN, tr - (p.fa + p.fe) * DEG + p.wa * DEG);
  return [sh[0] + E[0] + H[0] + T[0], sh[1] + E[1] + H[1] + T[1]];
}

const NAVY = '#26335e', NAVYD = '#172040', NAVYH = '#3d4f8c', GOLD = '#dcb44c', GOLDD = '#a8822e', GREY = '#8a8a96', PANTS = '#6a6e78', PANTSD = '#4a4e58';
const BOOT = '#70472a', BOOTD = '#47291a', BELT = '#5c3a22', BRASS = '#e6bc4a', SKIN = '#e9b48e', SKIND = '#bf8a6a', BEARD = '#16121a', HAT = '#3a5aa8', HATD = '#24366e';
const PURPLE = '#b05aff', LEG = [72, 68], ARM = [58, 56];
function hipOf(p) { return Math.max(legDrop(LEG[0], LEG[1], 12, p.ft, p.fk), legDrop(LEG[0], LEG[1], 12, p.bt, p.bk)); }

function limb(ctx, a1, l1, a2, l2, w, cA, dA, cB, dB, end) {
  ctx.save(); ctx.rotate(-a1 * DEG);
  cel(ctx, (c) => capsule(c, l1, w[0], w[1]), cA, dA, { lw: 3 });
  ctx.translate(0, l1); ctx.rotate(-a2 * DEG);
  cel(ctx, (c) => capsule(c, l2, w[1], w[2]), cB, dB, { lw: 3 });
  ctx.translate(0, l2);
  if (end) end(ctx, a1 + a2);
  ctx.restore();
}
function boot(ctx, rot) {
  ctx.rotate(rot * DEG);
  cel(ctx, (c) => { c.moveTo(-9, -22); c.lineTo(-9, 5); c.lineTo(26, 5); c.quadraticCurveTo(32, 3, 24, -5); c.lineTo(10, -8); c.lineTo(9, -22); c.closePath(); }, BOOT, BOOTD, { lw: 3 });
  flat(ctx, (c) => c.rect(-11, -26, 22, 8), '#8a5a34', 2.4);   // (the cuff)
}
/** a long bony hand */
function hand(ctx, ring, glow, t) {
  cel(ctx, (c) => { c.moveTo(-6, -2); c.quadraticCurveTo(-8, 12, -3, 16); c.lineTo(2, 22); c.lineTo(6, 14); c.quadraticCurveTo(9, 6, 6, -2); c.closePath(); }, SKIN, SKIND, { lw: 2.6 });
  for (const dx of [-3, 0, 3]) ink(ctx, (c) => { c.moveTo(dx, 8); c.lineTo(dx + 1, 15); }, 1.2, SKIND);
  if (ring) {
    flat(ctx, (c) => circle(c, 2, 10, 4.2), '#7a4a9e', 1.6);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.4 * glow + 0.1 * Math.sin(t * 6);
    const g = ctx.createRadialGradient(2, 10, 1, 2, 10, 16); g.addColorStop(0, 'rgba(210,150,255,0.95)'); g.addColorStop(1, 'rgba(160,60,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(2, 10, 16, 0, TAU); ctx.fill(); ctx.restore();
  }
}
function cutlass(ctx) {
  cel(ctx, (c) => { c.moveTo(-5, 8); c.lineTo(-5, -4); c.lineTo(5, -4); c.lineTo(5, 8); c.closePath(); }, '#5c3a22', '#3a2414', { lw: 2.6 });
  flat(ctx, (c) => { c.moveTo(-13, -4); c.lineTo(13, -4); c.lineTo(11, -9); c.lineTo(-11, -9); c.closePath(); }, BRASS, 2.2);
  flat(ctx, (c) => { c.moveTo(-8, -4); c.quadraticCurveTo(-18, 6, -8, 12); c.lineTo(-6, 4); c.closePath(); }, BRASS, 2);   // (the knuckle guard)
  cel(ctx, (c) => { c.moveTo(-6, -9); c.quadraticCurveTo(-10, -SWORD_LEN * 0.6, 14, -SWORD_LEN); c.quadraticCurveTo(6, -SWORD_LEN * 0.55, 6, -9); c.closePath(); }, '#e2e6ee', '#a4abbb', { lw: 2.6 });
  ink(ctx, (c) => { c.moveTo(0, -14); c.quadraticCurveTo(-2, -SWORD_LEN * 0.55, 9, -SWORD_LEN + 8); }, 1.4, 'rgba(255,255,255,0.8)');
}
/** the purple conch: a spiral shell carved with a split mask, glowing */
function conch(ctx, t, glow) {
  const g = 0.55 + 0.35 * glow + 0.1 * Math.sin(t * 7);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = g * 0.7;
  const gr = ctx.createRadialGradient(0, -16, 2, 0, -16, 46); gr.addColorStop(0, 'rgba(210,140,255,0.9)'); gr.addColorStop(1, 'rgba(150,50,255,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, -16, 46, 0, TAU); ctx.fill(); ctx.restore();
  cel(ctx, (c) => { c.moveTo(-6, 6); c.quadraticCurveTo(-26, -6, -18, -30); c.quadraticCurveTo(-4, -48, 12, -34); c.quadraticCurveTo(24, -20, 12, -4); c.quadraticCurveTo(6, 6, -6, 6); c.closePath(); }, '#9a52d8', '#5e2c96', { lw: 2.8, hi: '#cf9cff', hk: 0.4 });
  ink(ctx, (c) => { c.moveTo(-14, -22); c.quadraticCurveTo(-4, -38, 6, -26); c.quadraticCurveTo(10, -16, 0, -14); }, 1.8, '#4a2278');   // (the spiral)
  flat(ctx, (c) => { c.moveTo(-8, -10); c.quadraticCurveTo(-8, -20, 0, -20); c.lineTo(0, -6); c.closePath(); }, '#e8d4ff', 1.4);   // (the split mask: half laughing)
  flat(ctx, (c) => { c.moveTo(0, -20); c.quadraticCurveTo(8, -20, 8, -10); c.lineTo(0, -6); c.closePath(); }, '#b888e8', 1.4);    // (half weeping)
  flat(ctx, (c) => { c.moveTo(-10, 6); c.lineTo(-2, 14); c.lineTo(8, 4); c.lineTo(0, -2); c.closePath(); }, '#7a3cb4', 2);         // (the mouthpiece)
}

/** Draw with the feet at (0, 0).  o: { facing, t, scale, mem, vel, sword, glow, horn } */
export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {});
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0, glow = o.glow ?? 0.5, vx = (o.vel && o.vel.x) || 0;
  const sword = o.sword !== false, horn = (o.horn !== undefined ? o.horn : p.horn) > 0.3;
  // secondary motion: the coat tails and the beard lag behind the body
  const lagC = follow(o.mem, 'coat', -vx * 5 + 6 * Math.sin(t * 2), 0.14, 0.76), lagB = follow(o.mem, 'beard', -vx * 4, 0.16, 0.74);
  ctx.save(); ctx.scale(f * S, S);
  ctx.translate(p.x, p.y);
  const lie = p.lie || 0, la = lie ? 0.9 : 1;
  if (lie) ctx.translate(-14, -18);
  ctx.save(); ctx.scale(1, p.sq);
  const hipY = lie ? -30 : -hipOf(p), torLen = 82;
  const armW = [13, 11, 9], legW = [16, 13.5, 11];
  const torsoSpace = () => { ctx.translate(0, hipY); ctx.rotate(p.tor * DEG * la); };
  // the coat's back tails (behind the legs)
  ctx.save(); ctx.translate(0, hipY);
  cel(ctx, (c) => { c.moveTo(-18, -6); c.lineTo(8, -6); c.quadraticCurveTo(6 + lagC, 40, 12 + lagC * 1.4, 84); c.lineTo(-34 + lagC * 1.4, 88); c.quadraticCurveTo(-30 + lagC, 40, -18, -6); c.closePath(); }, NAVYD, '#0e1428', { lw: 3 });
  ctx.restore();
  // the back arm
  ctx.save(); torsoSpace(); ctx.translate(-7, -torLen + 10);
  limb(ctx, p.ba, ARM[0], p.be, ARM[1], armW, NAVYD, '#0e1428', NAVYD, '#0e1428', (c) => hand(c, false, 0, t));
  ctx.restore();
  const legAt = (xoff, a, k, far) => {
    ctx.save(); ctx.translate(xoff, hipY + 2);
    limb(ctx, a, LEG[0], k, LEG[1], legW, far ? PANTSD : PANTS, '#363a46', far ? PANTSD : PANTS, '#363a46', (c, tot) => boot(c, tot));
    ctx.restore();
  };
  legAt(-6, p.bt, p.bk, true);
  // the torso: a long navy coat, gold trim down the front, brass buttons, the grey shirt, the belt, the conch at the hip
  ctx.save(); torsoSpace();
  cel(ctx, (c) => blob(c, [[-18, 4], [18, 4], [22, -torLen * 0.55], [20, -torLen], [-20, -torLen], [-24, -torLen * 0.55]], 0.5), NAVY, NAVYD, { lw: 3.2, hi: NAVYH, hk: 0.3, detail: (c) => {
    c.fillStyle = GREY; c.beginPath(); c.moveTo(-8, -torLen + 2); c.lineTo(8, -torLen + 2); c.lineTo(2, -torLen * 0.3); c.lineTo(-2, -torLen * 0.3); c.closePath(); c.fill();
    c.strokeStyle = GOLD; c.lineWidth = 3; c.beginPath(); c.moveTo(-9, -torLen + 2); c.lineTo(-3, -torLen * 0.3); c.lineTo(-3, 4); c.moveTo(9, -torLen + 2); c.lineTo(3, -torLen * 0.3); c.lineTo(3, 4); c.stroke();
    c.fillStyle = BRASS; for (const y of [-torLen * 0.62, -torLen * 0.42, -torLen * 0.22]) for (const x of [-10, 10]) { c.beginPath(); c.arc(x, y, 2.4, 0, TAU); c.fill(); }
  } });
  flat(ctx, (c) => { c.moveTo(-20, -torLen); c.lineTo(-6, -torLen + 18); c.lineTo(-3, -torLen + 4); c.lineTo(3, -torLen + 4); c.lineTo(6, -torLen + 18); c.lineTo(20, -torLen); c.lineTo(16, -torLen - 6); c.lineTo(-16, -torLen - 6); c.closePath(); }, '#8a5a34', 2.4);   // the coat's big collar (the brown lining)
  flat(ctx, (c) => c.rect(-21, -12, 42, 11), BELT, 2.6);
  flat(ctx, (c) => c.rect(-6, -13, 13, 13), BRASS, 2.2);
  // the coat's front skirts, over the thighs
  cel(ctx, (c) => { c.moveTo(-20, -4); c.lineTo(20, -4); c.lineTo(26 + lagC * 0.3, 46); c.lineTo(-26 + lagC * 0.3, 50); c.closePath(); }, NAVY, NAVYD, { lw: 3 });
  flat(ctx, (c) => c.rect(-1, -4, 2.4, 50), GOLD, 0);
  if (!o.horn && !horn) {   // the conch hangs at his belt
    ctx.save(); ctx.translate(-14, -4); ctx.rotate(0.3); ctx.scale(0.42, 0.42); conch(ctx, t, glow); ctx.restore();
  }
  ctx.restore();
  legAt(6, p.ft, p.fk, false);
  // the head and its hat, the beard
  ctx.save(); torsoSpace(); ctx.translate(4, -torLen - 22); ctx.rotate(p.head * DEG); ctx.scale(1.22, 1.22);
  head(ctx, p, t, lagB);
  ctx.restore();
  // the front arm: the cutlass (or the conch / the whistling fingers)
  ctx.save(); torsoSpace(); ctx.translate(2, -torLen + 10);
  limb(ctx, p.fa, ARM[0], p.fe, ARM[1], armW, NAVY, NAVYD, NAVY, NAVYD, () => {
    ctx.save(); ctx.rotate(p.wa * DEG);
    if (horn) { ctx.translate(2, 6); ctx.rotate(-1.2); conch(ctx, t, 1); }
    else if (sword && !p.whistle) cutlass(ctx);
    ctx.restore();
    hand(ctx, true, glow, t);
  });
  ctx.restore();
  ctx.restore();
  if (p.smear > 0.05) {
    ctx.save(); ctx.globalAlpha = 0.5 * p.smear; ctx.lineCap = 'round'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(40, -170, 120, -1.1, 0.8); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}

/** the head at its centre (0, 0), facing +x: the hooked nose, the gold-tooth grin, bushy brows, the long braided beard, the tricorn */
function head(ctx, p, t, lagB) {
  const fa = p.face;
  // the beard's two braids behind the face (long: to the belt), gold rings; it sways a little
  const sw = lagB;
  flat(ctx, (c) => { c.moveTo(-16, 8); c.quadraticCurveTo(-23 + sw, 30, -13 + sw * 1.2, 58); c.lineTo(-6 + sw * 1.2, 55); c.quadraticCurveTo(-6, 30, 2, 16); c.closePath(); }, BEARD, 2.6);
  flat(ctx, (c) => { c.moveTo(12, 14); c.quadraticCurveTo(13 + sw, 34, 7 + sw * 1.2, 64); c.lineTo(0 + sw * 1.2, 60); c.quadraticCurveTo(-1, 32, -4, 18); c.closePath(); }, BEARD, 2.6);
  for (const [bx, by] of [[-13, 34], [-11, 47], [4, 40], [4, 53]]) { flat(ctx, (c) => ellipse(c, bx + sw * (by / 70), by, 5, 2.8), GOLD, 1.8); }
  // the face: gaunt, long, with a big hooked nose
  cel(ctx, (c) => { c.moveTo(-14, -2); c.quadraticCurveTo(-16, -22, -2, -26); c.quadraticCurveTo(16, -28, 20, -10); c.quadraticCurveTo(22, 6, 12, 16); c.quadraticCurveTo(-4, 24, -14, 2); c.closePath(); }, SKIN, SKIND, { lw: 3 });
  flat(ctx, (c) => ellipse(c, -9, -4, 3.6, 5), SKIND, 2);   // (the ear)
  // the beard over the chin, a moustache with curled tips
  flat(ctx, (c) => { c.moveTo(-14, 4); c.quadraticCurveTo(-12, 26, 4, 29); c.quadraticCurveTo(19, 26, 20, 8); c.quadraticCurveTo(6, 16, -14, 4); c.closePath(); }, BEARD, 2.6);
  // the eyes: small and sly
  const open = fa === 'shock' ? 4.4 : fa === 'ouch' ? 1.6 : fa === 'laugh' ? 0.8 : 3.2;
  for (const x of [0, 11]) {
    if (fa === 'laugh') { ink(ctx, (c) => { c.moveTo(x - 3.5, -6); c.quadraticCurveTo(x, -9, x + 3.5, -6); }, 2.2); continue; }
    flat(ctx, (c) => ellipse(c, x, -6, 3.8, open), '#fff', 1.4);
    flat(ctx, (c) => circle(c, x + (fa === 'sly' || fa === 'grin' ? 1.4 : 0.4), -6, fa === 'shock' ? 1.3 : 1.8), '#1a1420', 0);
  }
  const bk = p.brow || 0;   // brows: bushy, down toward the nose when he is plotting
  ink(ctx, (c) => { c.moveTo(-6, -13 + bk * 0.6); c.lineTo(5, -10 - bk * 2); c.moveTo(7, -10 - bk * 2); c.lineTo(17, -13 + bk * 0.6); }, fa === 'shock' ? 2.6 : 4.2, BEARD);
  // the nose: long, hooked
  flat(ctx, (c) => { c.moveTo(14, -10); c.quadraticCurveTo(28, -2, 22, 10); c.quadraticCurveTo(18, 12, 15, 8); c.quadraticCurveTo(18, 0, 12, -4); c.closePath(); }, SKIN, 2.6);
  // the mouth: a wide grin with ONE gold tooth, or an O
  if (fa === 'blow') flat(ctx, (c) => ellipse(c, 8, 16, 4, 3.4), '#3a1218', 1.8);
  else if (fa === 'shock') flat(ctx, (c) => ellipse(c, 8, 17, 4.6, 5.4), '#3a1218', 1.8);
  else if (fa === 'ouch') ink(ctx, (c) => { c.moveTo(0, 18); c.quadraticCurveTo(8, 12, 16, 18); }, 2.4, '#f0d8c8');
  else {
    flat(ctx, (c) => { c.moveTo(-3, 15); c.quadraticCurveTo(8, 24, 19, 14); c.quadraticCurveTo(8, 17, -3, 15); c.closePath(); }, '#f6efe6', 1.8);
    flat(ctx, (c) => c.rect(9, 15.5, 3.6, 4.4), '#f2c230', 1);   // the gold tooth
  }
  // the blue tricorn, a gold-trimmed brim
  ctx.save(); ctx.translate(2, -24);
  cel(ctx, (c) => { c.moveTo(-26, 4); c.quadraticCurveTo(-34, -6, -24, -14); c.quadraticCurveTo(0, -30, 28, -14); c.quadraticCurveTo(38, -6, 30, 4); c.quadraticCurveTo(0, -4, -26, 4); c.closePath(); }, HAT, HATD, { lw: 3.2, hi: '#5a7ad0', hk: 0.3 });
  ink(ctx, (c) => { c.moveTo(-26, 4); c.quadraticCurveTo(0, -4, 30, 4); }, 3.4, GOLD);
  cel(ctx, (c) => { c.moveTo(-10, -4); c.quadraticCurveTo(-8, -24, 6, -24); c.quadraticCurveTo(18, -22, 16, -4); c.closePath(); }, HAT, HATD, { lw: 2.8 });
  ctx.restore();
}
void clamp; void INK;
