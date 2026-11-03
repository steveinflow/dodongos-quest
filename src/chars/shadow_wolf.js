// Shadow wolf (Mystic Mountain, the Shadow Forest -- docs/MYSTIC_MOUNTAIN.md): a wolf of black smoke with red eyes.  A
// code rig, the stand-in until its painted atlas (shadowwolf) lands; the wolf ALPHA is the same rig drawn big (o.alpha:
// a taller ruff, a brighter rim, ember-red eyes; src/mmbosses.js WolfAlpha draws it at ~2.3x).
//   Normal hits SCATTER it (clip 'scatter': the smoke flies apart) and it RE-FORMS ('reform') unless the last hit was
//   LIGHT (src/mmworld.js isLight) -- then it fades for good ('poof').  Kid-friendly: no blood, no teeth close-ups; a
//   puff of smoke with two red eyes and a snout.
// Local space: origin = the floor under it, +x = facing, y down; ~120 px nose to rump, ~86 px to the ear tips.
// Clips -- the painted pack's names (tools/sprite3d/chars/shadow_wolf.py): idle(t) prowl(t) lungeWind(k) lunge(k)
// hurt(k) scatter(k: the re-form plays it backward); the alpha's pack (wolf_alpha) adds howl(k).  (No knock-down
// clips: a wolf staggers or scatters, it never lies down.)
import { TAU, keys, mix, clamp, lerp } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 86;
export const META = { id: 'shadow_wolf', name: 'SHADOW WOLF', height: 86 };
export const HURTBOX = { x: 4, w: 96, h: 76 };
/** the jaws (a lunge's bite), at scale 1 */
export const MOUTH = [62, -48];

const STILL = { ph: 0, stride: 0, crouch: 0.06, lean: 0, jaw: 0, head: 0, tail: 0, sx: 1, lie: 0, scatter: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ crouch: 0.06 + 0.03 * Math.sin(t * 3), head: 0.06 * Math.sin(t * 1.7), tail: Math.sin(t * 2.2), jaw: 0.08 + 0.08 * Math.sin(t * 2.9) }),
  taunt: (t) => P({ crouch: 0.22, head: -0.18, jaw: 0.35 + 0.25 * Math.abs(Math.sin(t * 5)), tail: Math.sin(t * 6) }),
  prowl: (t) => { const ph = (t * 1.6) % 1; return P({ ph, stride: 0.85, crouch: 0.14, lean: 0.03, head: -0.06, tail: Math.sin(ph * TAU) * 0.6 }); },
  lungeWind: (k) => P({ crouch: 0.42 * k, lean: -0.12 * k, head: -0.22 * k, jaw: 0.35 * k, tail: 0.8 * k }),
  lunge: (k) => keys(k, [
    [0, P({ crouch: 0.42, lean: -0.12, head: -0.22, jaw: 0.35, tail: 0.8 })],
    [0.3, P({ crouch: 0, lean: 0.22, head: 0.05, jaw: 1, sx: 1.25, stride: 1, ph: 0.25, tail: 1 }), 'snap'],
    [0.6, P({ crouch: 0.1, lean: 0.08, head: 0, jaw: 0.1, sx: 1.05, stride: 0.6, ph: 0.6, tail: 0.6 })],
    [1, P({ crouch: 0.08, jaw: 0.05 })],
  ]),
  hurt: (k) => P({ lean: -0.24 * (1 - k), crouch: 0.2, jaw: 0.6 * (1 - k), head: 0.2 * (1 - k), sx: 0.92 }),
  scatter: (k) => P({ scatter: k, crouch: 0.3, jaw: 0.4 }),
  howl: (k) => P({ head: 0.85 * Math.min(1, k * 3), jaw: 0.8 * Math.min(1, k * 3), crouch: -0.05, tail: 0.6 }),
};
export { mix };

const SMOKE = ['#0f0c18', '#1d1830', '#2e2748'];
/** one smoky lump: a soft dark blob with a violet rim on top */
function puff(ctx, x, y, r, a, rim) {
  ctx.globalAlpha = a;
  ctx.fillStyle = SMOKE[1]; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(x - r * 0.18, y - r * 0.22, r * 0.72, Math.PI * 1.05, Math.PI * 1.85); ctx.lineTo(x - r * 0.18, y - r * 0.1); ctx.fill();
  ctx.fillStyle = SMOKE[0]; ctx.beginPath(); ctx.arc(x + r * 0.1, y + r * 0.15, r * 0.7, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}

/** Draw with the feet at (0, 0).  o: { facing, t, scale, alpha (the alpha wolf), fade 0..1 } */
export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {});
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0, big = !!o.alpha;
  const sc = clamp(p.scatter, 0, 1), fade = clamp(1 - (o.fade || 0), 0, 1);
  if (fade <= 0.01) return;
  const rim = big ? 'rgba(170,120,255,0.55)' : 'rgba(130,110,200,0.45)';
  ctx.save(); ctx.scale(f * S, S);
  const by = -56 + p.crouch * 20 + p.lie * 28;            // the body's centre line
  const lieK = p.lie;
  ctx.translate(0, by); ctx.rotate(-p.lean); ctx.scale(p.sx, 1); ctx.translate(0, -by);
  const spread = sc * 46, a0 = fade * (1 - sc * 0.75);
  const off = (i) => [Math.cos(i * 2.4 + 0.3) * spread, Math.sin(i * 1.7 + 0.9) * spread * 0.7 - sc * 12];
  // a soft dark shadow-glow round it (it's smoke)
  ctx.globalAlpha = 0.35 * fade;
  const gl = ctx.createRadialGradient(0, by, 10, 0, by, 110); gl.addColorStop(0, 'rgba(40,20,70,0.6)'); gl.addColorStop(1, 'rgba(20,10,40,0)');
  ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(0, by, 110, 70, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // legs: four smoky strokes swinging with the gait (the far pair darker, behind)
  const leg = (hx, phase, far) => {
    const sw = Math.sin((p.ph + phase) * TAU) * 22 * p.stride, lift = Math.max(0, Math.cos((p.ph + phase) * TAU)) * 10 * p.stride;
    const [ox, oy] = off(hx > 0 ? 7 : 8);
    const hip = [hx + ox, by + 10 + oy], foot = [hx + sw * (1 - lieK) + ox + lieK * (hx > 0 ? 30 : -30), -lift * (1 - lieK) + oy - lieK * 14];
    ctx.globalAlpha = a0 * (far ? 0.75 : 1);
    ctx.strokeStyle = far ? SMOKE[0] : SMOKE[1]; ctx.lineCap = 'round';
    ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.quadraticCurveTo((hip[0] + foot[0]) / 2 - 6, (hip[1] + foot[1]) / 2, foot[0], foot[1] - 4); ctx.stroke();
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(foot[0] - 2, foot[1] - 4); ctx.lineTo(foot[0] + 8, foot[1] - 2); ctx.stroke();
    ctx.globalAlpha = 1;
  };
  leg(28, 0.5, true); leg(-34, 0, true);
  // the tail: a plume of smoke streaming back and up
  {
    const [ox, oy] = off(3), w = p.tail;
    ctx.globalAlpha = a0;
    for (let i = 0; i < 5; i++) {
      const k = i / 4, x = -52 - k * 34 + ox, y = by - 8 - k * (16 + 10 * w) + Math.sin(t * 5 + i) * 3 + oy;
      puff(ctx, x, y, 13 - k * 5, a0 * (1 - k * 0.4), rim);
    }
    ctx.globalAlpha = 1;
  }
  // the body: overlapping smoke lumps, a ruff at the shoulders (bigger on the alpha)
  const lumps = [[-38, 2, 24], [-14, -2, 28], [12, -4, 28], [32, -8, big ? 30 : 25], [20, 8, 22], [-20, 10, 20]];
  lumps.forEach(([x, y, r], i) => { const [ox, oy] = off(i); puff(ctx, x + ox + Math.sin(t * 3 + i) * 1.5, by + y + oy, r, a0, rim); });
  if (big) for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.35; puff(ctx, 30 + Math.cos(a) * 26, by - 18 + Math.sin(a) * 18, 12, a0, rim); }
  leg(38, 0, false); leg(-26, 0.5, false);
  // the head: a wedge of smoke with pointed ears, a snout and a jaw that opens
  {
    const [ox, oy] = off(5);
    const hx = 54 + ox, hy = by - 24 + oy + p.lie * 10;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-p.head);
    ctx.globalAlpha = a0;
    ctx.fillStyle = SMOKE[1];
    // ears
    for (const [ex, ew] of [[-14, 1], [-2, 0.9]]) { ctx.beginPath(); ctx.moveTo(ex - 7, -10); ctx.lineTo(ex - 2 + Math.sin(t * 4 + ex) * 1.5, -34 * ew); ctx.lineTo(ex + 7, -10); ctx.closePath(); ctx.fill(); }
    // skull + upper snout
    ctx.beginPath(); ctx.ellipse(-4, -2, 22, 17, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, -12); ctx.quadraticCurveTo(30, -12, 36, -3); ctx.lineTo(34, 3); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill();
    // lower jaw (opens)
    ctx.save(); ctx.translate(6, 4); ctx.rotate(p.jaw * 0.55);
    ctx.fillStyle = SMOKE[0]; ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(22, 0, 27, 3); ctx.lineTo(24, 8); ctx.quadraticCurveTo(10, 9, 0, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (p.jaw > 0.3) { ctx.fillStyle = 'rgba(255,70,60,0.35)'; ctx.beginPath(); ctx.ellipse(16, 5, 8 * p.jaw, 3 * p.jaw, 0.2, 0, TAU); ctx.fill(); }   // (a red glow inside)
    // rim on the brow and the nose tip
    ctx.fillStyle = rim; ctx.beginPath(); ctx.ellipse(-8, -12, 14, 4, -0.15, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#05040a'; ctx.beginPath(); ctx.arc(35, -2, 3.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // the eyes: two glowing red slits (they stay brightest while the smoke flies apart)
    const ea = fade * (1 - sc * 0.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ea;
    const glow = ctx.createRadialGradient(10, -6, 1, 10, -6, 16); glow.addColorStop(0, 'rgba(255,90,70,0.9)'); glow.addColorStop(1, 'rgba(255,40,40,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(10, -6, 16, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = ea;
    ctx.fillStyle = big ? '#ffb43a' : '#ff3a2e';
    ctx.beginPath(); ctx.moveTo(3, -8); ctx.quadraticCurveTo(10, -12, 17, -7); ctx.quadraticCurveTo(10, -5, 3, -8); ctx.fill();
    ctx.fillStyle = '#fff3d8'; ctx.beginPath(); ctx.arc(12, -8, 1.3, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // loose wisps drifting off the top (and many more while it scatters)
  const nW = 5 + Math.round(sc * 10);
  for (let i = 0; i < nW; i++) {
    const k = ((t * 0.6 + i * 0.137) % 1), x = lerp(-60, 60, (i * 0.618) % 1) + Math.sin(t * 2 + i) * 6 + Math.cos(i) * spread;
    const y = by - 20 - k * (40 + sc * 40) + Math.sin(i * 1.3) * spread * 0.5;
    ctx.globalAlpha = fade * 0.5 * Math.sin(k * Math.PI);
    ctx.fillStyle = SMOKE[2]; ctx.beginPath(); ctx.arc(x, y, 5 + 4 * (1 - k), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  void INK;
  ctx.restore();
}
