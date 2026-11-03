// THE HEARTSTONE (docs/SECRETS_SCRIPT.md): the Dragon Clan's heart -- a faceted golden crystal gem, heart-shaped with a
// pointed tip, three small star-shaped notches where the Star Shards belong.  Broken (mend 0): dull and cracked, the
// notches dark.  As the shards come home the notches fill with light one by one, the cracks fade and the gem warms to
// gold; mended (1) it glows and twinkles.  Drawn by the cutscenes' `heartstone` fx (src/cutscene.js) and the Hollow's
// Queen beat (src/game.js drawQueenBeat), so the paintings and the play show the same stone.
import { INK } from './config.js';

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const mixRGB = (a, b, k) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`;
// (broken -> mended) facet shades, darkest to lightest
const DULL = [[74, 64, 82], [108, 96, 112], [142, 130, 142], [178, 166, 172]];   // (dull slate-violet: dimmed, not black)
const GOLD = [[176, 108, 26], [226, 160, 52], [246, 200, 92], [255, 236, 170]];

// the outline (unit: r; the gem's centre at 0, the tip at +1): two faceted upper lobes, a dip between them, a long
// pointed tip -- and the inner "table", a smaller copy pulled up; facets join each outline edge to the table's
const OUT = [[0, -0.5], [0.24, -0.86], [0.62, -0.88], [0.94, -0.52], [0.88, -0.06], [0.5, 0.48], [0, 1.0],
  [-0.5, 0.48], [-0.88, -0.06], [-0.94, -0.52], [-0.62, -0.88], [-0.24, -0.86]];
const TAB = OUT.map(([x, y]) => [x * 0.46, -0.26 + (y + 0.26) * 0.46]);
// the three star notches: the two lobes and the tip's middle
const NOTCH = [[-0.5, -0.5], [0.5, -0.5], [0, 0.34]];
/** where the three Star Shards go home: the notches of a Heartstone drawn at (x, y), size r */
export function heartNotches(x, y, r) { return NOTCH.map(([nx, ny]) => [x + nx * r, y + ny * r]); }

function star(ctx, x, y, ro, ri) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? ri : ro, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath();
}
function glow(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

/** the Heartstone at (x, y) (its centre), size r (half its height), mend 0..1, t seconds */
export function drawHeartstone(ctx, x, y, r, mend = 0, t = 0) {
  const k = Math.max(0, Math.min(1, mend)), lw = Math.max(2, r / 16);
  ctx.save();
  ctx.translate(x, y);
  // the warm glow behind it, growing as it mends
  if (k > 0.03) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, r * (2.3 + 0.15 * Math.sin(t * 2.2)), '255,200,100', 0.42 * k); ctx.restore(); }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const P = (p) => [p[0] * r, p[1] * r];
  const shade = (i) => mixRGB(DULL[i], GOLD[i], k);
  // the facets round the table, lit from the upper left
  for (let i = 0; i < OUT.length; i++) {
    const j = (i + 1) % OUT.length, a = P(OUT[i]), b = P(OUT[j]), c = P(TAB[j]), d = P(TAB[i]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, lit = (-mx - my * 1.2) / r;   // (facing the light: up and left)
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d); ctx.closePath();
    ctx.fillStyle = shade(lit > 0.5 ? 3 : lit > 0 ? 2 : lit > -0.6 ? 1 : 0); ctx.fill();
  }
  // the table: the brightest face, a sheen across it
  ctx.beginPath(); TAB.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.closePath();
  const tg = ctx.createLinearGradient(-r * 0.4, -r * 0.6, r * 0.4, r * 0.2);
  tg.addColorStop(0, mixRGB([164, 150, 150], [255, 246, 210], k)); tg.addColorStop(1, shade(2));
  ctx.fillStyle = tg; ctx.fill();
  // the facet edges, thin and pale; the outline, inked
  ctx.strokeStyle = k > 0.5 ? 'rgba(255,248,220,0.55)' : 'rgba(30,22,30,0.45)'; ctx.lineWidth = lw * 0.45;
  ctx.beginPath();
  for (let i = 0; i < OUT.length; i++) { ctx.moveTo(...P(OUT[i])); ctx.lineTo(...P(TAB[i])); }
  TAB.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.closePath();
  ctx.stroke();
  ctx.beginPath(); OUT.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.closePath();
  ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
  // the three star notches: dark, each filling with light as its shard comes home (one after another over mend)
  NOTCH.forEach(([nx, ny], i) => {
    const f = Math.max(0, Math.min(1, k * 3 - i)), sx = nx * r, sy = ny * r, ro = r * 0.17, ri = r * 0.075;
    star(ctx, sx, sy, ro, ri); ctx.fillStyle = '#241a22'; ctx.fill();
    if (f > 0) {
      ctx.save(); ctx.globalAlpha = f; star(ctx, sx, sy, ro, ri); ctx.fillStyle = '#fff3c4'; ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, sx, sy, ro * 2.2, '255,236,170', 0.6 * f); ctx.restore();
    }
    star(ctx, sx, sy, ro, ri); ctx.lineWidth = lw * 0.55; ctx.strokeStyle = INK; ctx.stroke();
  });
  // the cracks of the broken stone, fading as it mends
  if (k < 0.97) {
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#1a1218'; ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    ctx.moveTo(-0.06 * r, -0.5 * r); ctx.lineTo(0.08 * r, -0.2 * r); ctx.lineTo(-0.1 * r, 0.08 * r); ctx.lineTo(0.06 * r, 0.42 * r); ctx.lineTo(-0.02 * r, 0.8 * r);
    ctx.moveTo(-0.1 * r, 0.08 * r); ctx.lineTo(-0.52 * r, 0.06 * r); ctx.lineTo(-0.7 * r, 0.22 * r);
    ctx.moveTo(0.08 * r, -0.2 * r); ctx.lineTo(0.44 * r, -0.16 * r);
    ctx.stroke(); ctx.restore();
  }
  // mended: a gentle pulse and twinkles on the facets
  if (k > 0.9) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -0.1 * r, r * 0.8, '255,244,200', (0.18 + 0.12 * Math.sin(t * 2.2)) * (k - 0.9) * 10);
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.7 + i / 3) % 1, a = Math.sin(u * Math.PI), px = [-0.55, 0.3, 0.1][i] * r, py = [-0.7, -0.62, 0.55][i] * r, s = r * 0.12 * a;
      ctx.fillStyle = `rgba(255,252,236,${0.9 * a})`;
      ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s * 0.22, py); ctx.lineTo(px, py + s); ctx.lineTo(px - s * 0.22, py); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px - s, py); ctx.lineTo(px, py + s * 0.22); ctx.lineTo(px + s, py); ctx.lineTo(px, py - s * 0.22); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
