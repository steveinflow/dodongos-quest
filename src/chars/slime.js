// SLOTH SLIME and THE SLOTH BEAST (Skull Island, the Cell of Sloth -- docs/SKULL_ISLAND.md): a grey-green jelly blob with sleepy half-lidded eyes, a drooly little
// mouth and a wobbly drippy bottom.  The small ones crawl, squash and leap; hit hard they SPLAT into a puddle.  The Beast is the same blob drawn huge (o.beast):
// bubbles inside its body, a great yawning maw, drool -- it rises out of the pit's drain, swallows a hero (you can see them inside, through its jelly) and, in the
// end, splatters into puddles.  Kid-friendly: sleepy and sticky, never scary.
// A code rig, the stand-in until its painted pack lands.  Local space: origin = the floor under it, +x = facing, y down; ~56 px tall at scale 1.
// Clips: idle(t) crawl(ph) windup(k) leap(k) land(k) hurt(k) fly down(t) getup(k) splat(k)  -- the Beast: rise(k) gulpWind(k) gulp(k) chew(t) yawnWind(k) yawn(k) slamWind(k) slam(k)
// groggy(t) spitWind(k) spit(k) burp(k) defeat(k).
import { TAU, cel, flat, ellipse, circle, keys } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 56;
export const META = { id: 'slime', name: 'SLOTH SLIME', height: 56 };
export const HURTBOX = { x: 0, w: 38, h: 48 };

const STILL = { x: 0, y: 0, sq: 1, sx: 1, tilt: 0, lid: 0.5, mouth: 0, face: 'sleepy', splat: 0, sink: 0, belly: 0, alpha: 1, lean: 0, drool: 0.5, glow: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ sq: 1 + 0.045 * Math.sin(t * 2.2), sx: 1 - 0.03 * Math.sin(t * 2.2), lid: 0.5 + 0.14 * Math.sin(t * 0.9), drool: 0.5 + 0.3 * Math.sin(t * 1.3) }),
  crawl: (ph) => P({ sq: 1 - 0.12 * Math.sin(ph * TAU), sx: 1 + 0.09 * Math.sin(ph * TAU), lid: 0.42, lean: 4 * Math.sin(ph * TAU) }),
  windup: (k) => P({ sq: 1 - 0.4 * k, sx: 1 + 0.3 * k, lid: 0.5 * (1 - k), face: 'wide', mouth: 0.25 * k, tilt: -4 * k }),
  leap: (k) => P({ sq: 1 + 0.42 * Math.sin(k * Math.PI), sx: 1 - 0.22 * Math.sin(k * Math.PI), lid: 0, face: 'wide', mouth: 0.7, tilt: 8 * Math.sin(k * Math.PI) }),
  land: (k) => P({ sq: 0.66 + 0.34 * k, sx: 1.3 - 0.3 * k, lid: 0.3 * k, face: 'wide', mouth: 0.4 * (1 - k) }),
  hurt: (k) => P({ sq: 0.78 + 0.22 * k, sx: 1.22 - 0.22 * k, face: 'ouch', lid: 0, tilt: -8 * (1 - k) }),
  fly: () => P({ sq: 1.22, sx: 0.84, face: 'ouch', lid: 0, tilt: -22 }),
  down: (t) => P({ sq: 0.5 + 0.03 * Math.sin(t * 6), sx: 1.4, face: 'dizzy', lid: 0.2, splat: 0.2 }),
  getup: (k) => P({ sq: 0.5 + 0.5 * k, sx: 1.4 - 0.4 * k, face: 'ouch', lid: 0.4, splat: 0.2 * (1 - k) }),
  splat: (k) => P({ sq: 1 - 0.92 * k, sx: 1 + 1.1 * k, splat: k, face: 'ouch', lid: 0.2, alpha: 1 - 0.4 * k }),
  // ---- the Beast
  rise: (k) => P({ sink: (1 - k) * 280, sq: 0.8 + 0.2 * k, sx: 1.1 - 0.1 * k, lid: 1 - 0.5 * k, face: 'sleepy', glow: 1 - k }),
  gulpWind: (k) => P({ sq: 1 + 0.12 * k, sx: 1 - 0.06 * k, lid: 0.5 * (1 - k), face: 'wide', mouth: 0.3 + 0.5 * k, lean: -14 * k }),
  gulp: (k) => keys(k, [[0, P({ sq: 1.12, sx: 0.94, mouth: 0.8, lean: -14, lid: 0, face: 'wide' })], [0.3, P({ sq: 0.84, sx: 1.18, mouth: 1, lean: 22, lid: 0, face: 'wide' }), 'snap'], [0.7, P({ sq: 1.02, sx: 1.02, mouth: 0.2, lean: 6, lid: 0.35 })], [1, P({ mouth: 0.1 }), 'io']]),
  chew: (t) => P({ sq: 1 + 0.07 * Math.sin(t * 7), sx: 1 - 0.05 * Math.sin(t * 7), lid: 0.62, face: 'content', mouth: 0.12 + 0.1 * Math.sin(t * 7), belly: 1, drool: 0.8 }),
  yawnWind: (k) => P({ sq: 1 + 0.1 * k, sx: 1 - 0.05 * k, lid: 0.6 - 0.2 * k, mouth: 0.9 * k, face: 'yawn', lean: -6 * k }),
  yawn: (k) => P({ sq: 1.1 + 0.06 * Math.sin(k * 6), sx: 0.96, lid: 0.9, mouth: 1, face: 'yawn', lean: -8 }),
  slamWind: (k) => P({ sq: 1 + 0.3 * k, sx: 1 - 0.14 * k, lid: 0, face: 'wide', mouth: 0.3, lean: -10 * k }),
  slam: (k) => keys(k, [[0, P({ sq: 1.3, sx: 0.86, lid: 0, face: 'wide', lean: -10 })], [0.25, P({ sq: 0.66, sx: 1.34, lid: 0, face: 'wide', mouth: 0.8, lean: 14 }), 'snap'], [0.7, P({ sq: 0.9, sx: 1.1, lid: 0.3, lean: 6 })], [1, P({}), 'io']]),
  groggy: (t) => P({ sq: 0.88 + 0.03 * Math.sin(t * 5), sx: 1.14, lid: 0.9, face: 'dizzy', mouth: 0.2, lean: 4 * Math.sin(t * 3), drool: 1 }),
  spitWind: (k) => P({ sq: 1 + 0.18 * k, sx: 1 - 0.08 * k, lid: 0.2, mouth: 0.8 * k, face: 'wide', lean: -8 * k }),
  spit: (k) => P({ sq: 0.95, sx: 1.04, lid: 0.3, mouth: 1 - k, face: 'wide', lean: 8 * (1 - k) }),
  burp: (k) => P({ sq: 1 + 0.12 * Math.sin(k * Math.PI), sx: 1, lid: 0.7, mouth: 0.9 * Math.sin(k * Math.PI), face: 'content' }),
  defeat: (k) => P({ sq: 1 - 0.95 * k, sx: 1 + 1.4 * k, splat: k, face: 'ouch', lid: 0.3, alpha: 1 - 0.3 * k }),
};

const BODY = '#8fb394', BODYD = '#58796a', BODYH = '#d2e8d0', OOZE = '#b8e4a4';   // (the Beast: matches the small slimes' pack)

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {}), f = o.facing || 1, S = o.scale || 1, t = o.t || 0, beast = !!o.beast;
  ctx.save();
  ctx.scale(f * S, S);
  ctx.translate(p.x || 0, (p.y || 0) + (p.sink || 0));
  const sq = Math.max(0.06, p.sq), sx = p.sx;
  const lw = beast ? 3 : 3.4;
  // a puddle under it (grows as it splats)
  const pw = (30 + 52 * p.splat) * sx, ph = 6 + 5 * p.splat;
  ctx.globalAlpha = 0.55 * p.alpha; ctx.fillStyle = '#6a9a72'; ctx.beginPath(); ctx.ellipse(0, 1, pw, ph, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.5 * p.alpha; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalAlpha = (p.belly > 0.5 ? 0.5 : 1) * p.alpha;   // (the swallowed hero shows through the jelly)
  ctx.translate(0, 0);
  ctx.rotate((p.tilt || 0) * Math.PI / 180);
  if (p.lean) ctx.transform(1, 0, p.lean * 0.012, 1, 0, 0);
  // the glow of the drain (the Beast rising)
  if (p.glow > 0.02) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * p.glow; ctx.fillStyle = '#8af08a'; ctx.beginPath(); ctx.ellipse(0, -20, 60, 40, 0, 0, TAU); ctx.fill(); ctx.restore(); ctx.globalAlpha = p.alpha; }
  // the body: a blob with a flat, wobbly, dripping bottom
  const wob = Math.sin(t * 3) * 1.6;
  cel(ctx, (c) => {
    c.moveTo(-37 * sx, 0);
    c.bezierCurveTo(-45 * sx, -24 * sq, -26 * sx, -54 * sq, 0, -54 * sq);
    c.bezierCurveTo(26 * sx, -54 * sq, 45 * sx, -24 * sq, 37 * sx, 0);
    c.quadraticCurveTo(28 * sx, 7 + wob, 17 * sx, 1); c.quadraticCurveTo(7 * sx, 10, -4 * sx, 1); c.quadraticCurveTo(-18 * sx, 8 - wob, -37 * sx, 0);
    c.closePath();
  }, BODY, BODYD, { hi: BODYH, hk: 0.55, lw, detail: (c) => {
    // bubbles inside the jelly, a glossy streak
    c.fillStyle = 'rgba(255,255,255,0.28)';
    for (const [x, y, r] of [[-20, -18, 5], [-6, -34, 3.4], [18, -22, 4.4], [8, -10, 3], [26, -36, 2.6]]) { c.beginPath(); c.arc(x * sx, y * sq, r, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.34)'; c.beginPath(); c.ellipse(-18 * sx, -40 * sq, 12 * sx, 4 * sq, -0.5, 0, TAU); c.fill();
    if (beast) { c.fillStyle = 'rgba(40,90,60,0.18)'; for (const [x, y, r] of [[-26, -30, 8], [22, -12, 9], [0, -22, 6]]) { c.beginPath(); c.arc(x * sx, y * sq, r, 0, TAU); c.fill(); } }
    if (p.belly > 0.5) { c.fillStyle = 'rgba(190,255,190,0.18)'; c.beginPath(); c.ellipse(0, -22 * sq, 28 * sx, 24 * sq, 0, 0, TAU); c.fill(); }
  } });
  ctx.globalAlpha = p.alpha;
  // the back's lumps (the Beast)
  if (beast) for (const [x, y, r] of [[-22, -52, 8], [4, -58, 9], [28, -48, 7]]) { cel(ctx, (c) => circle(c, x * sx, y * sq, r), BODY, BODYD, { hi: BODYH, lw: 2.6 }); }
  // the face
  const fy = -32 * sq;
  if (sq > 0.3) {
    const kind = p.face, lid = Math.min(1, p.lid);
    for (const ex of [-13, 13]) {
      ctx.save(); ctx.translate(ex * sx, fy);
      const r = (beast ? 8.6 : 8) * (kind === 'wide' ? 1.15 : 1);
      flat(ctx, (c) => circle(c, 0, 0, r), '#f4f8ee', 2.4);
      ctx.fillStyle = INK;
      if (kind === 'ouch') { ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(3, 0); ctx.lineTo(-5, 4); ctx.stroke(); }
      else if (kind === 'dizzy') { ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.beginPath(); for (let a = 0; a < 12; a += 0.5) { const rr = a * 0.42; ctx.lineTo(Math.cos(a + t * 6) * rr, Math.sin(a + t * 6) * rr); } ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(1 + (kind === 'wide' ? 1 : 0), 2, kind === 'wide' ? 2.2 : 3, 0, TAU); ctx.fill(); }
      // the lid: jelly-coloured, drooping over the eye from the top
      if (lid > 0.02 && kind !== 'ouch') { ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r + 1.2, 0, TAU); ctx.clip(); ctx.fillStyle = BODY; ctx.beginPath(); ctx.rect(-r - 1.4, -r - 1.4, 2 * r + 2.8, (2 * r + 2.8) * lid * 0.9); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-r - 1.4, -r - 1.4 + (2 * r + 2.8) * lid * 0.9); ctx.lineTo(r + 1.4, -r - 1.4 + (2 * r + 2.8) * lid * 0.9); ctx.stroke();
      ctx.restore(); }
      ctx.restore();
    }
    // droopy brows (sleepy) / worried
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-22 * sx, fy - 11); ctx.lineTo(-6 * sx, fy - 13 + (kind === 'wide' ? -4 : 3)); ctx.moveTo(22 * sx, fy - 11); ctx.lineTo(6 * sx, fy - 13 + (kind === 'wide' ? -4 : 3)); ctx.stroke();
    // the mouth
    const my = fy + 17, mo = p.mouth;
    ctx.fillStyle = '#2a1a22'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
    if (mo > 0.18) {
      ctx.beginPath(); ctx.ellipse(0, my, (7 + 15 * mo) * sx, 3 + 17 * mo, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c0607a'; ctx.beginPath(); ctx.ellipse(0, my + 4 + 6 * mo, (5 + 8 * mo) * sx, 2 + 6 * mo, 0, 0, TAU); ctx.fill();
      if (beast && mo > 0.5) { ctx.fillStyle = '#f0f4e8'; for (const x of [-12, -4, 4, 12]) { ctx.beginPath(); ctx.moveTo((x - 2.4) * sx, my - 3 - 17 * mo * 0.7); ctx.lineTo((x + 2.4) * sx, my - 3 - 17 * mo * 0.7); ctx.lineTo(x * sx, my - 3 - 17 * mo * 0.7 + 7); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
    } else if (kind === 'content') { ctx.beginPath(); ctx.moveTo(-9 * sx, my); ctx.quadraticCurveTo(0, my + 7, 9 * sx, my); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-8 * sx, my); ctx.quadraticCurveTo(0, my + 2.4, 8 * sx, my + (kind === 'ouch' ? 3 : 0)); ctx.stroke(); }
    // drool: a drip from the corner of the mouth
    ctx.strokeStyle = 'rgba(210,250,200,0.9)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(8 * sx, my + 1); ctx.quadraticCurveTo(10 * sx, my + 6 + 6 * p.drool, 8 * sx, my + 8 + 12 * p.drool); ctx.stroke();
    ctx.fillStyle = OOZE; ctx.beginPath(); ctx.arc(8 * sx, my + 9 + 12 * p.drool, 2.4, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
