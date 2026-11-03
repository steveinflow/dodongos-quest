// Snowman (Mystic Mountain, the Icy Cliffs): three grumpy snowballs with coal eyes, a carrot nose and twig arms.  It
// shuffles, ROLLS at the heroes as one big snowball, throws snowballs, and breaks into a puff of snow when beaten.  A
// code rig, the stand-in until its painted atlas (snowman) lands.  (o.big: the Gale's big one, a bucket hat.)
// Local space: origin = the floor under it, +x = facing, y down; ~124 px tall.
// Clips -- the painted pack's names (tools/sprite3d/chars/snowman.py): idle(t) move(t) throwWind(k) throw(k: 16 f, the
// snowball leaves 'hand' at 4) hurt(k) puff(k); the rig also has roll(t), the big rolling snowball (the pack rolls on 'move').
import { TAU, cel, flat, ink, ellipse, circle, keys, clamp } from '../rig.js';
import { INK } from '../config.js';

export const HEIGHT = 124;
export const META = { id: 'snowman', name: 'SNOWMAN', height: 124 };
/** a landmark (local px, scale 1): the throwing hand */
export function point(pose, name) { return name === 'hand' ? HAND.slice() : null; }
export const HURTBOX = { x: 0, w: 70, h: 118 };
/** where a thrown snowball leaves the twig hand (throw k 0.45), scale 1 */
export const HAND = [34, -96];
const STILL = { hop: 0, lean: 0, arm: 0, arm2: 0, roll: 0, spin: 0, squash: 0, brow: 0, mouth: 0, lie: 0, puff: 0 };
const P = (o) => Object.assign({}, STILL, o);
export const ANIM = {
  idle: (t) => P({ squash: 0.03 * Math.sin(t * 3), arm: 0.15 * Math.sin(t * 2), arm2: -0.1 * Math.sin(t * 2.3), brow: 0.6 }),
  move: (t) => { const ph = (t * 1.2) % 1; return P({ hop: Math.abs(Math.sin(ph * TAU)) * 8, lean: 0.06 * Math.sin(ph * TAU), arm: 0.4 * Math.sin(ph * TAU), arm2: -0.4 * Math.sin(ph * TAU), brow: 0.7, squash: -0.04 * Math.abs(Math.sin(ph * TAU)) }); },
  roll: (t) => P({ roll: 1, spin: t * 12, brow: 1, mouth: 0.6 }),
  throwWind: (k) => P({ arm: -2.2 * k, lean: -0.12 * k, brow: 1, mouth: 0.3 * k }),
  throw: (k) => keys(k, [[0, P({ arm: -2.2, lean: -0.12, brow: 1 })], [0.45, P({ arm: 1.3, lean: 0.14, brow: 1, mouth: 0.7 }), 'snap'], [1, P({ arm: 0.3, brow: 0.8 })]]),
  hurt: (k) => P({ lean: -0.2 * (1 - k), squash: 0.08 * (1 - k), mouth: 0.8, brow: -0.6, arm: 1, arm2: 1 }),
  fly: P({ lean: -0.6, mouth: 0.9, brow: -0.8, arm: 1.4, arm2: 1.2 }),
  down: P({ lie: 1, mouth: 0.4, brow: -0.6 }),
  getup: (k) => P({ lie: 1 - k, brow: 0.6 * k }),
  puff: (k) => P({ puff: k, mouth: 0.8, brow: -0.8 }),
};
const SNOW = '#f4f8ff', SNOWD = '#b9c8e6', COAL = '#26222c', CARROT = '#ff8a2a', CARROTD = '#c85a14', TWIG = '#6a4426';

export function draw(ctx, pose, o = {}) {
  const p = Object.assign({}, STILL, pose || {});
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  const pf = clamp(p.puff, 0, 1);
  ctx.save(); ctx.scale(f * S, S);
  if (pf > 0) {   // breaking into a puff: the balls burst outward into flakes
    ctx.globalAlpha = 1 - pf;
    for (let i = 0; i < 16; i++) { const a = i * 2.39, r = 20 + pf * 70, y = -60 + Math.sin(a) * r * 0.8 - pf * 20; flat(ctx, (c) => circle(c, Math.cos(a) * r, y, 12 * (1 - pf * 0.6)), SNOW, 0); }
    ctx.globalAlpha = 1;
    if (pf > 0.5) { ctx.restore(); return; }
  }
  if (p.roll > 0.5) {   // one big rolling snowball, its face going round
    ctx.translate(0, -44);
    cel(ctx, (c) => circle(c, 0, 0, 44), SNOW, SNOWD, { lw: 3 });
    ctx.save(); ctx.rotate(p.spin);
    flat(ctx, (c) => { circle(c, 12, -10, 4); circle(c, 24, -6, 4); }, COAL, 0);
    flat(ctx, (c) => { c.moveTo(26, 2); c.lineTo(46, 6); c.lineTo(26, 9); c.closePath(); }, CARROT, 2);
    ink(ctx, (c) => { c.moveTo(-30, 10); c.lineTo(-10, 30); c.moveTo(-20, -30); c.lineTo(-34, -14); }, 2, 'rgba(120,140,190,0.7)');
    ctx.restore();
    ctx.restore(); return;
  }
  ctx.translate(0, -p.hop); ctx.rotate(p.lean + p.lie * -1.35);
  const sq = 1 + p.squash;
  ctx.scale(1 / sq, sq);
  // the base, the middle, the head
  cel(ctx, (c) => ellipse(c, 0, -32, 36, 32), SNOW, SNOWD, { lw: 3 });
  const arm = (a, x, y, side) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a * side - 0.5 * side);
    ink(ctx, (c) => { c.moveTo(0, 0); c.lineTo(side * 34, -8); c.moveTo(side * 22, -5); c.lineTo(side * 30, -18); c.moveTo(side * 28, -7); c.lineTo(side * 40, -2); }, 4, TWIG);
    ctx.restore();
  };
  arm(p.arm2, -16, -80, -1);
  cel(ctx, (c) => ellipse(c, 0, -82, 27, 24), SNOW, SNOWD, { lw: 3 });
  flat(ctx, (c) => { circle(c, 4, -88, 3.5); circle(c, 6, -76, 3.5); }, COAL, 0);   // (coal buttons)
  arm(p.arm, 14, -86, 1);
  ctx.save(); ctx.translate(0, -120);
  cel(ctx, (c) => ellipse(c, 0, 0, 20, 18), SNOW, SNOWD, { lw: 3 });
  if (o.big) { cel(ctx, (c) => { c.moveTo(-14, -14); c.lineTo(-10, -34); c.lineTo(12, -34); c.lineTo(16, -14); c.closePath(); }, '#8a98b0', '#5a667e', { lw: 2.6 }); }
  // grumpy coal eyes and brows, a carrot nose, a coal mouth
  flat(ctx, (c) => { circle(c, 4, -4, 3.4); circle(c, 13, -4, 3.4); }, COAL, 0);
  const b = p.brow;
  ink(ctx, (c) => { c.moveTo(-1, -10 + b * 2); c.lineTo(8, -8 - b * 2); c.moveTo(10, -8 - b * 2); c.lineTo(18, -10 + b * 2); }, 2.6, COAL);
  cel(ctx, (c) => { c.moveTo(12, 0); c.lineTo(34, 3); c.lineTo(12, 6); c.closePath(); }, CARROT, CARROTD, { lw: 2 });
  if (p.mouth > 0.4) flat(ctx, (c) => ellipse(c, 6, 10, 5, 2 + p.mouth * 3), COAL, 0);
  else for (let i = 0; i < 4; i++) flat(ctx, (c) => circle(c, -2 + i * 4, 10 + Math.abs(i - 1.5) * -0.8, 1.5), COAL, 0);
  ctx.restore();
  // a few flakes drifting round it
  for (let i = 0; i < 4; i++) { const k = (t * 0.5 + i * 0.25) % 1; ctx.globalAlpha = 0.7 * Math.sin(k * Math.PI); flat(ctx, (c) => circle(c, -40 + i * 26 + Math.sin(t + i) * 5, -130 + k * 120, 2), '#ffffff', 0); }
  ctx.globalAlpha = 1;
  void INK;
  ctx.restore();
}
