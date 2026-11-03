// The Dragon King (final boss), 3D-rendered sprites (loaded instead of ./dragonking.js with ?art3d=1 once 'dragonking' is
// in ART3D_NAMES; see src/chars.js, docs/SPRITE3D.md).  One model (assets-src/dragonking/, built by
// tools/sprite3d/models/dragonking_build.py on the lizard-folk rig) and two atlases:
//   assets/sprites/dragonking/       the King -- throne (with a talk variant), throneRise, idle, walk, roar, hurt, clawWind /
//                                    claw, breathWind / breath, stompWind / stomp, summon, flyUp, hover (talk variant),
//                                    diveWind, dive, stagger, crownCrack, defeated (his big drawings, k < .6) -- and
//                                    throneProp (the throne alone)
//   assets/sprites/dragonking_tiny/  the tiny form -- tinyIdle, tinyTalk, tinyCaged (in the golden birdcage; talk
//                                    variant), tinyStunned (popping out of the smoke in the defeat)
// The drawings convert the rig's own poses (tools/sprite3d/chars/dragonking.py), so ANIM merges the rig's pose (its effect
// keys: crack, fire, glow, gather, blaze, stars, sdust, speed, dk, tiny ...) with the sprite pose (the drawing).
// draw(): tiny poses and o.tiny -> the tiny atlas; defeated (p.dk) -> the composite (the big drawing shrinking with a wobble,
// the tiny one popping out of the cloud, the rig's flash, crown shards and smoke: drawDefeatFx); the rest -> the big atlas
// + the rig's 2D effects at the 3D landmarks (drawFx): the crown's cracks for max(o.crack, p.crack) -- one set of
// drawings serves every crack level -- its blaze, the green fire in his jaws, dizzy stars, stomp dust, dive speed lines.
// drawThrone(): the 3D throne (throneProp) + the rig's live green flames (drawThroneLive).
// Engine points, measured on the 3D drawings (the rig's until the atlases exist): mouthOf(pose) -> [x, y, ang] per frame
// (the breath sweep), crownOf(pose), HURTBOX / HURTBOX_AIR / TINY_HURTBOX, BREATH_MOUTH, CLAW_POINT, STOMP_POINT,
// CROWN_IDLE, CROWN_SUMMON.  Rendered facing right and mirrored (unhanded, like the rig).
import * as RIG from './dragonking.js';
import { spriteArt, rigOnly, rigDrawn } from '../sprite3d.js';
import { clamp, lerp, ease, DEG } from '../rig.js';

export * from './dragonking.js';          // BASE, CAGE, THRONE_SEAT_Y, HEIGHT, drawBirdcage, measure ... (local exports win)

const [BIG, TINY] = await Promise.all([spriteArt('dragonking', { fallback: RIG }), spriteArt('dragonking_tiny', { fallback: RIG })]);

const isSprite = (A, key) => {
  const f = A.ANIM[key];
  const p = typeof f === 'function' ? f(0) : f;
  return !!(p && p.s3d >= 0.5);
};
const TINY_KEYS = new Set();
export const ANIM = {};
for (const key of new Set([...Object.keys(RIG.ANIM), ...Object.keys(BIG.ANIM), ...Object.keys(TINY.ANIM)])) {
  const A = isSprite(BIG, key) ? BIG : isSprite(TINY, key) ? TINY : null;
  const rig = RIG.ANIM[key];
  if (!A) { if (rig !== undefined) ANIM[key] = rigOnly(key, rig, !!(BIG.ATLAS_SCALE || TINY.ATLAS_SCALE)); continue; }
  if (A === TINY) TINY_KEYS.add(key);
  const spr = A.ANIM[key];
  const one = (f, a) => (typeof f === 'function' ? f(a) : f);
  ANIM[key] = typeof spr === 'function' || typeof rig === 'function'
    ? (a) => Object.assign({}, rig !== undefined ? one(rig, a) : {}, one(spr, a))
    : Object.assign({}, rig || {}, spr);
}
// the stomp's tell (no rig value: the 3D module times it): 0..1 from k .3 to .7 of the wind-up, then held through the
// stomp, fading out by its k .4 -- the shockwave (readtech r3: it vanished 12 frames before the foot landed)
if (typeof ANIM.stompWind === 'function') {
  const sw = ANIM.stompWind;
  ANIM.stompWind = (k) => Object.assign(sw(k), { stell: Math.min(1, Math.max(0, ((k || 0) - 0.3) / 0.4)) });
}
if (typeof ANIM.stomp === 'function') {
  const st = ANIM.stomp;
  ANIM.stomp = (k) => { const fade = Math.max(0, 1 - (k || 0) / 0.4); return Object.assign(st(k), { stell: fade > 0.02 ? 1 : 0, stellFade: fade }); };
}
// the claw's progress (the crescent fades out after the contact window, off his jaw)
if (typeof ANIM.claw === 'function') {
  const cl = ANIM.claw;
  ANIM.claw = (k) => Object.assign(cl(k), { ck: k || 0 });
}
const isTinySprite = (p) => !!(p && p.s3d >= 0.5 && TINY_KEYS.has(p.clip));
const isBigSprite = (p) => !!(p && p.s3d >= 0.5 && !TINY_KEYS.has(p.clip));

/** the 3D landmarks drawFx needs, for a big sprite pose (local px, facing right, scale 1) */
function pointsOf(p) {
  const L = (n) => BIG.point3d(p, n);
  const m = L('mouth'), mb = L('mouthBack'), cr = L('crown'), cu = L('crownUp');
  // (foot: the stomp dust's point -- on the floor under the near foot, as the rig draws it (at FLOOR); at the raised
  //  foot it floated mid-air before the contact, critic r3)
  const ft = L('footR');
  const pts = { head: L('head'), foot: ft ? [ft[0], 0] : null, hip: L('hip') };
  if (m && mb) { pts.headAng = Math.atan2(m[1] - mb[1], m[0] - mb[0]); pts.mouth = [m[0], m[1], pts.headAng]; }
  if (cr && cu) { pts.crown = cr; pts.crownUp = cu; }
  return pts;
}

function drawTinyForm(ctx, p, o) {
  if (isTinySprite(p)) TINY.draw(ctx, p, o);
  else { rigDrawn('dragonking_tiny', p); RIG.draw(ctx, p, o); }
}

const TINY_HOP = 9;          // drawTiny: a hop lifts 18 design units at TS .5 (px at scale 1)
/** the defeat (120 f): the big drawing stands through the flash, then shrinks (squash-wobbling) into the smoke; the tiny
 *  form pops out of the cloud (a big hop, a squash, two furious little stomps); the rig's flash, shards and puffs on top */
function drawDefeat(ctx, p, o) {
  const k = p.dk, S = o.scale || 1, t = o.t || 0;
  const shr = clamp((k - 0.16) / 0.42, 0, 1);
  if (k < 0.6) {
    const wob = Math.sin(k * 70) * 0.06 * shr;
    ctx.save(); ctx.scale(1 + wob, 1 - wob);
    BIG.draw(ctx, p, Object.assign({}, o, { scale: S * lerp(1, 0.2, ease.in(shr)) }));
    ctx.restore();
  }
  if (k > 0.56) {
    const arc = (k0, k1, h) => (k > k0 && k < k1 ? Math.sin((k - k0) / (k1 - k0) * Math.PI) * h : 0);
    const hop = arc(0.56, 0.72, 2.2) + arc(0.8, 0.86, 0.5) + arc(0.9, 0.96, 0.5);
    const sT = lerp(1.25, 1, ease.out(clamp((k - 0.56) / 0.16, 0, 1)));
    const stunned = k < 0.76;
    const q = stunned
      ? (ANIM.tinyStunned ? ANIM.tinyStunned(t) : { tiny: true, hop: 0, fist: 0, flap: Math.sin(t * 30), lean: 4, talk: 0, mood: 'stunned', caged: false })
      : ANIM.tinyIdle(t);
    ctx.save(); ctx.translate(0, -hop * TINY_HOP * S * sT);
    drawTinyForm(ctx, isTinySprite(q) ? q : Object.assign({}, q, { hop: 0 }), Object.assign({}, o, { scale: S * sT, tiny: false }));
    ctx.restore();
  }
  const c0 = ANIM.defeated ? ANIM.defeated(0.1) : null;          // the crown as it shatters (still on at k .1)
  const cr = c0 && isBigSprite(c0) ? BIG.point3d(c0, 'crown') : null;
  RIG.drawDefeatFx(ctx, p, o, cr ? [cr[0], cr[1]] : RIG.crownOf(p));
}

/** Draw with the feet at (0, 0).  o: { facing, t, scale, mem, vel, talk, crack, tiny, caged } as ./dragonking.js. */
export function draw(ctx, pose, o = {}) {
  const p = pose || {};
  if (p.tiny) { drawTinyForm(ctx, p, o); return; }
  if (o.tiny) { drawTinyForm(ctx, ANIM[o.talk ? 'tinyTalk' : o.caged ? 'tinyCaged' : 'tinyIdle'](o.t || 0), o); return; }
  if (!isBigSprite(p)) { rigDrawn('dragonking', p); RIG.draw(ctx, p, o); return; }
  if (p.dk !== undefined) { drawDefeat(ctx, p, o); return; }
  if (p.stell > 0.02) kingTells(ctx, p, o, false);          // the stomp's shadow + back cracks, behind him
  BIG.draw(ctx, p, o);
  RIG.drawFx(ctx, p, o, pointsOf(p));
  if (p.glint > 0.05 || p.stell > 0.02 || (p.smear > 0.05 && p.clip === 'claw')) kingTells(ctx, p, o, true);
}

// The tells the drawings can't carry, at the 3D landmarks: the claw glinting before the swipe (the rig's glint, timed
// like the guard's spear tip), the swipe's crescent over his body, and for the stomp the floor cracking with dust and a
// warm glint on the raised foot -- earth and dust, unlike the summon's green magic.
function star(ctx, x, y, r, ang, stroke = false) {
  ctx.beginPath();
  for (let j = 0; j < 8; j++) {
    const rr = j % 2 ? r * 0.22 : r, a = ang + j * Math.PI / 4;
    if (j) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  if (stroke) ctx.stroke(); else ctx.fill();
}
function kingTells(ctx, p, o, front) {
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  const at = (lm) => { const q = BIG.point3d(p, lm); return q ? [q[0] * f * S, q[1] * S] : null; };
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (front && p.glint > 0.05) {                     // the claw glints before the swipe: white, a gem-green halo behind
    const c = at('clawTip') || at('claw');           // (the middle claw's tip, where the atlas has it; the swipe keeps 'claw')
    if (c) {
      const g = Math.min(1, p.glint), r = (7 + 10 * g * (0.8 + 0.2 * Math.sin(t * 22))) * S;
      // (critic: a star 2 px bigger left only green specks at its points -- a soft gem-green bloom and a solid 2 px green
      //  ring round the white star, so it reads unlike the stomp's warm foot star)
      const bl = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r * 0.5 + 8 * S);
      bl.addColorStop(0, 'rgba(98,255,140,0.4)'); bl.addColorStop(1, 'rgba(98,255,140,0)');
      ctx.globalAlpha = g; ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(c[0], c[1], r * 0.5 + 8 * S, 0, Math.PI * 2); ctx.fill();
      // (readtech M3: on the arena the green halo merged with a green wall torch -- a 1.5 px ink ring outside the green
      //  one, in the sprites' ink, keeps the star apart from green flames)
      ctx.globalAlpha = g * 0.6; ctx.strokeStyle = '#21141c'; ctx.lineWidth = 7 * S; star(ctx, c[0], c[1], r, 0.4, true);
      ctx.globalAlpha = g; ctx.strokeStyle = '#62ff8c'; ctx.lineWidth = 4 * S; star(ctx, c[0], c[1], r, 0.4, true);
      ctx.globalAlpha = g; ctx.fillStyle = '#ffffff'; star(ctx, c[0], c[1], r, 0.4);
    }
  }
  if (front && p.smear > 0.05 && p.clip === 'claw') clawSwipe(ctx, p, at, f, S);
  if (p.stell > 0.02) stompCue(ctx, p, at, f, S, t, front);
  ctx.restore();
}

// the swipe's crescent (dragonking.js smear(): the rig's own arc, centre, radius and timing -- p.smear peaks on the
// contact), centred like the rig's in his torso frame (the hips landmark + the rig's scx / scy), drawn over the body (the
// atlas' baked smear sits behind it): lavender tail -> gold at the leading end, a pale core along the outer edge
function clawSwipe(ctx, p, at, f, S) {
  const h = at('hips') || at('hip');
  if (!h) return;
  const a0 = p.sa0 ?? 204, a1 = p.sa1 ?? 50, R = (p.sr || 130) * S, sq = p.sf || 1, n = 22, D = Math.PI / 180;
  const pt = (a, r) => [Math.sin(a * D) * r * f, Math.cos(a * D) * r * sq];
  // (the rig's centre, 20 px forward and 15 px lower -- critics: the tail started above the crown, the inner edge and
  //  the fading tail veiled the snout and jaw)
  const cx = h[0] + ((p.scx ?? -6) + 20) * f * S, cy = h[1] + ((p.scy ?? -100) + 15) * S;
  const c = (() => { const q = pt(a1, R); return [cx + q[0], cy + q[1]]; })();
  const P = (a, r) => { const q = pt(a, r); return [cx + q[0], cy + q[1]]; };
  // (full alpha: at 0.85 the gold went muddy tan over his purple; gone by st 14, two frames after the hit window, so
  //  its fade doesn't veil his jaw -- art r3 N5)
  const st = (p.ck || 0) * 26, out = st > 12 ? Math.max(0, 1 - (st - 12) / 2) : 1;
  if (out <= 0) return;
  ctx.globalAlpha = Math.min(1, p.smear) * out;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const [x, y] = P(a0 + (a1 - a0) * (i / n), R + 10 * S); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  for (let i = n; i >= 0; i--) { const u = i / n, th = (4 + 46 * Math.pow(u, 1.3)) * S; const [x, y] = P(a0 + (a1 - a0) * u, R + 10 * S - th); ctx.lineTo(x, y); }
  ctx.closePath();
  const [tx, ty] = P(a0, R);
  const gr = ctx.createLinearGradient(tx, ty, c[0], c[1]);
  gr.addColorStop(0, 'rgba(132,102,176,0.35)'); gr.addColorStop(0.55, '#8466b0'); gr.addColorStop(1, '#f5c745');
  ctx.fillStyle = gr; ctx.fill();
  ctx.globalAlpha = Math.min(1, p.smear) * 0.9 * out; ctx.strokeStyle = '#fff4b8'; ctx.lineWidth = 3 * S;
  ctx.beginPath();
  for (let i = 0; i <= 14; i++) { const u = 0.35 + 0.65 * i / 14; const [x, y] = P(a0 + (a1 - a0) * u, R + 4 * S); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke();
}

// the stomp's tell (p.stell 0..1 over the wind-up, held and fading through the stomp: p.stellFade), at the raised foot
// over the floor: a soft contact shadow, the floor cracking (tapering, branching cracks with an ember lip) and a mound of
// soft dust (the rig's stompDustAt tones: a beige lobe with a light top lobe) drifting up and out; the raised foot
// glints.  What lies behind him -- cracks pointing back, the shadow, the puffs on his heel side -- goes in the back pass
// (his drawing covers it), the rest in front, the front puffs kept clear of his toes (readtech r3: 36-41 % of the dust
// sat on his toes and hem).
const CRACKS = [[0.3, 1.0], [1.15, 0.8], [2.2, 0.95], [3.5, 0.85], [5.2, 0.9]];       // [floor angle, length]
// [side (1 = ahead of his toes, -1 = behind his heel), offset out from there (game px), radius, rise]: on each side an
// overlapping mound -- the biggest puff nearest the foot, one riding on top, smaller ones trailing out low
const PUFFS = [[1, 5, 16, 1.0], [1, 13, 14, 0.8], [1, 25, 12, 0.55], [1, 36, 9, 0.35], [1, 14, 11, 1.5],
  [-1, 0, 15, 1.0], [-1, 14, 12, 0.7], [-1, 26, 9, 0.4], [-1, 8, 10, 1.7]];
// (readtech M2: the first front puff 6 px further off his toes (off 0 -> 5, x 0.8-1.3); each puff's radius +-20 % and
//  rise +-30 %, fixed by index, so the mound is uneven -- at 2x the front puffs read as a row of even balls)
const PUFF_JIT = PUFFS.map((_, i) => {
  const h = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; };
  return [1 + 0.2 * h(i + 1), 1 + 0.3 * h(i + 31)];
});
// the planted foot round its ankle landmark (facing R, scale 1; measured on the painted wind-up drawings: heel ~14 px
// behind the ankle, toe tip ~44 px ahead, sole ~10 px under the floor point) as an ellipse ~12 px past the toe tip and
// ~3 px under the sole: the front cracks start outside it, as if they ran out from under his foot (readtech M2a: they
// crossed his toes)
const TOE_ZONE = { cx: 20, cy: -1, rx: 36, ry: 13 };
function puff(ctx, x, y, r, S) {                               // one soft dust puff: beige lobe + light top lobe
  const g1 = ctx.createRadialGradient(x, y, 0, x, y, r);
  g1.addColorStop(0, 'rgba(217,203,180,0.8)'); g1.addColorStop(0.6, 'rgba(217,203,180,0.55)'); g1.addColorStop(1, 'rgba(217,203,180,0)');
  ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  const tx = x + r * 0.3, ty = y - r * 0.45, tr = r * 0.62;
  const g2 = ctx.createRadialGradient(tx, ty, 0, tx, ty, tr);
  g2.addColorStop(0, 'rgba(239,233,246,0.85)'); g2.addColorStop(0.65, 'rgba(239,233,246,0.5)'); g2.addColorStop(1, 'rgba(239,233,246,0)');
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI * 2); ctx.fill();
}
function stompCue(ctx, p, at, f, S, t, front) {
  const s = Math.min(1, p.stell), fade = p.stellFade ?? 1, ft = at('footR');
  const x = ft ? ft[0] : 30 * f * S;
  if (!front) {
    ctx.globalAlpha = 0.24 * Math.min(1, s * 2) * fade; ctx.fillStyle = '#21141c';
    ctx.beginPath(); ctx.ellipse(x, 1 * S, 30 * S, 8 * S, 0, 0, Math.PI * 2); ctx.fill();
  }
  const g = 0.4 + 0.6 * s;
  // (the cracks in his own frame, facing R, mirrored by f -- 'cos(a0 * f)' never mirrored them, cos being even)
  const xl = x * f, al = at('ankleL');
  const zc = al ? [al[0] * f + TOE_ZONE.cx * S, TOE_ZONE.cy * S] : null;
  const inToes = (px, py) => zc && ((px - zc[0]) / (TOE_ZONE.rx * S)) ** 2 + ((py - zc[1]) / (TOE_ZONE.ry * S)) ** 2 < 1;
  ctx.save(); ctx.scale(f, 1);
  for (const [a0, len] of CRACKS) {
    if ((Math.sin(a0) >= 0) !== front) continue;
    const L = (30 + 22 * s + (len >= 0.95 ? 18 * s : 0)) * len * g * S, dx = Math.cos(a0), dy = Math.sin(a0) * 0.3;   // (two run out past the dust)
    let r0 = 8 * S;                                             // (in front: from clear of the planted foot's toes)
    if (front) while (r0 < 90 * S && inToes(xl + dx * r0, dy * r0)) r0 += 2 * S;
    const pts = [[xl + dx * r0, dy * r0]], tin = r0 > 8 * S;     // (tin: a trimmed crack tapers in from a fine tip)
    if (tin) pts.push([xl + dx * (r0 + 6 * S), dy * (r0 + 6 * S)]);
    for (let k = 1; k <= 4; k++) {
      const j = Math.sin(a0 * 7.3 + k * 2.1) * 5 * S;
      pts.push([xl + dx * (r0 + L * k / 4) - dy * j, dy * (r0 + L * k / 4) + dx * j * 0.3]);
    }
    // (lip: the ember glow on the crack's lower edge, >= 1.5 px and just below the dark split at every width)
    const seg = (q, w0, w1, col, lip, tip = false) => {
      for (let k = 0; k + 1 < q.length; k++) {
        const w = (w0 + (w1 - w0) * (k / (q.length - 1))) * S * (tip && k === 0 ? 0.4 : 1), off = lip ? 0.5 * (6 + (1.5 - 6) * (k / (q.length - 1))) * S + w * 0.35 : 0;
        ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(q[k][0], q[k][1] + off); ctx.lineTo(q[k + 1][0], q[k + 1][1] + off); ctx.stroke();
      }
    };
    const A = Math.min(1, 1.4 * s) * fade;
    ctx.globalAlpha = A * 0.8; seg(pts, 2.6, 1.5, '#ff7a1e', true, tin);   // the ember lip (readtech r3: dL 17-19 read as twigs)
    ctx.globalAlpha = A;
    seg(pts, 6, 1.5, '#21141c', false, tin);
    const m = pts[pts.length - 3], br = [m, [m[0] + (dx * 0.6 - dy) * L * 0.35, m[1] + (dy * 0.6 + dx * 0.25) * L * 0.35 * 0.5]];   // a branch
    seg(br, 2.6, 1, '#21141c', false);
  }
  ctx.restore();
  PUFFS.forEach(([side, off, r, k0], i) => {                   // the dust mounds
    if ((side > 0) !== front) return;                           // (heel side: behind him, his drawing covers it)
    const rr = r * PUFF_JIT[i][0] * (0.7 + 0.3 * s) * S, k = k0 * PUFF_JIT[i][1];
    // (ahead: from just clear of his toes; behind: from under his heel, ~24 px back)
    const d = side > 0 ? rr * 0.8 + 13 * S + off * (0.8 + 0.5 * s) * S : -(24 * S + off * (0.8 + 0.5 * s) * S);   // (critic r3: +7 px off the claws)
    const px = x + d * f, py = -rr * 0.55 - (2 + 12 * s) * k * S;
    ctx.globalAlpha = Math.min(1, 0.3 + s * 1.6) * fade;
    puff(ctx, px, py, rr, S);
  });
  if (front) {
    if (ft && s > 0.2) {                                        // the raised foot glints: the stomp is coming
      ctx.globalAlpha = Math.min(1, (s - 0.2) * 1.6) * fade; ctx.fillStyle = '#ffe6a8';
      star(ctx, ft[0], ft[1], (6 + 8 * s * (0.85 + 0.15 * Math.sin(t * 20))) * S, 0.2);
    }
  }
}
export { draw as drawDragonKing };

const THRONE_DX = -18 * 0.88;          // the rig draws the throne 18 units (x RIG) behind his origin
// the 3D prop's bowl rims (the flames' base, 3 px into the bowl) and green crown sigil, from its origin (px, facing
// right, scale 1): measured on the painted throneProp drawing (1x and 2x agree) -- its 3/4 view puts them off the rig's
// symmetric (+-150, -148) spots (readtech r3 N6: one flame floated 10 px over its rim, the other sank into its bowl)
const THRONE_BOWLS = [[-134, -135], [134, -160]], THRONE_SIGIL = [-13, -242];
/** The throne, drawn by the engine behind the King at his origin: the 3D throne + the rig's live flames. */
export function drawThrone(ctx, t = 0, o = {}) {
  const tp = BIG.ANIM.throneProp;
  if (!isBigSprite(tp)) { RIG.drawThrone(ctx, t, o); return; }
  const S = o.scale || 1, f = o.facing || 1;
  ctx.save(); ctx.translate(THRONE_DX * f * S, 0);
  BIG.draw(ctx, tp, { facing: 1, scale: S });
  RIG.drawThroneLiveAt(ctx, t, S, THRONE_BOWLS, THRONE_SIGIL);
  ctx.restore();
}

/** Mouth of a pose: [x, y, ang] local px (facing right, scale 1); ang in rad, + = downward (as the rig's mouthOf). */
export function mouthOf(p) {
  if (isBigSprite(p)) {
    const m = BIG.point3d(p, 'mouth'), mb = BIG.point3d(p, 'mouthBack');
    if (m && mb && p.tor !== undefined) {
      const jawTerm = RIG.mouthOf(p)[2] - (p.tor + p.head - (p.rot || 0)) * DEG;      // the rig's jaw-opening tilt
      return [Math.round(m[0]), Math.round(m[1]), +(Math.atan2(m[1] - mb[1], m[0] - mb[0]) + jawTerm).toFixed(3)];
    }
  }
  return RIG.mouthOf(p);
}
/** Crown centre (the heart-gem) for a pose, local px. */
export function crownOf(p) {
  const c = isBigSprite(p) ? BIG.point3d(p, 'crown') : null;
  return c ? c.map(Math.round) : RIG.crownOf(p);
}

const X = BIG.EXPORTS || {}, XT = TINY.EXPORTS || {};
export const META = X.META;                                            // the atlas META (id, name, height, hurtbox), if built
export const HURTBOX = X.HURTBOX || RIG.HURTBOX;
export const HURTBOX_AIR = X.HURTBOX_AIR || RIG.HURTBOX_AIR;
export const TINY_HURTBOX = XT.TINY_HURTBOX || RIG.TINY_HURTBOX;
export const CLAW_POINT = X.CLAW_POINT || RIG.CLAW_POINT;
export const STOMP_POINT = X.STOMP_POINT ? [X.STOMP_POINT[0], 0] : RIG.STOMP_POINT;      // the shockwave's centre, on the floor
export const CROWN_IDLE = X.CROWN_IDLE || RIG.CROWN_IDLE;
export const CROWN_SUMMON = X.CROWN_SUMMON || RIG.CROWN_SUMMON;
export const BREATH_MOUTH = mouthOf(ANIM.breath(0.3));
export const ATLAS_SCALE = BIG.ATLAS_SCALE || TINY.ATLAS_SCALE;
