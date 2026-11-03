// Skull Island's foe TELEGRAPHS (the AA bar, item 7: "every attack is telegraphed a kid can learn: wind-up pose + a floor marker + a
// sound, ~0.5-1 s ahead").  The bosses draw their own rings and lanes; the crew and the small fry (src/sifoes.js, src/sifoes2.js,
// src/sirage.js) call these from their drawShadow / their wind-up's first frame:
//   strikeZone(ctx, a, near, far, k, opts)  a warm lane on the deck in front of a foe winding up (where its swing / lunge / snip will land):
//                                           it fades in with the wind-up (k 0..1), a smooth pulse in its last moment (flash-safe), ink-rimmed.
//   windSound(a, kind)                      the wind-up's sound, once.
// The colours follow the bosses' language: RED-orange = a hit lands here (step out).  Book 1 / Book 3 never call these.
import { FLOOR_TOP, INK } from './config.js';
import { audio } from './audio-proxy.js';
import { drawWithFlash, setSilhouette } from './render.js';
import { CHARS } from './chars.js';

const pulse = (n) => 0.775 + 0.225 * Math.cos(n * 0.2);   // (flash safety: a smooth ~1.9 Hz pulse, never an on/off blink)

/** a: the foe (x, y, facing, st, game); near / far: px in front of it; k: the wind-up's progress 0..1; opts: { halfH = 14, col, dashed } */
export function strikeZone(ctx, a, near, far, k, opts = {}) {
  const g = a.game, f = a.facing || 1, sx = a.x - g.camX, sy = FLOOR_TOP + a.y, hh = opts.halfH ?? 14;
  const x0 = sx + f * near, x1 = sx + f * far, xa = Math.min(x0, x1), w = Math.abs(x1 - x0);
  const e = Math.min(1, k * 1.4), b = k > 0.6 ? pulse(a.st) : 1, col = opts.col || '255,90,40';
  ctx.save();
  ctx.globalAlpha = (0.18 + 0.34 * e) * (0.7 + 0.3 * b); ctx.fillStyle = `rgb(${col})`;
  ctx.beginPath(); ctx.ellipse(xa + w / 2, sy, w / 2 + hh * 0.5, hh, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = (0.45 + 0.5 * e) * b; ctx.strokeStyle = INK; ctx.lineWidth = 4.5; ctx.stroke();
  ctx.strokeStyle = opts.rim || '#ffe2a0'; ctx.lineWidth = 2.2; if (opts.dashed) ctx.setLineDash([10, 7]); ctx.stroke(); ctx.setLineDash([]);
  // a small chevron pointing the way the hit goes
  ctx.lineWidth = 3.5; ctx.strokeStyle = '#fff2d0'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const cx = xa + w / 2; ctx.beginPath(); ctx.moveTo(cx - 6 * f, sy - 6); ctx.lineTo(cx + 4 * f, sy); ctx.lineTo(cx - 6 * f, sy + 6); ctx.stroke();
  ctx.restore();
}
const HOLD_WORDS = ['GOT YOU!', 'GOT YE!', 'NETTED!', 'FREE!', 'WHEEE!', 'SNAP!'];
/** a hold's word over a hero (GOT YOU! / FREE! ...): the hold words already over them go first -- they stacked ("GOT YOU! FREE! FREE!") */
export function holdWord(g, p, text) {
  g.fx.list = g.fx.list.filter((q) => !(q.type === 'word' && HOLD_WORDS.includes(q.text) && Math.abs((q.x ?? p.x) - p.x) < 120));
  g.fx.word(p.x, p.y, 150, true, text);
}
/** a hero hidden behind a foe drawn in front of them, shown through it: a soft silhouette in their colour (clip it first if only part is covered) */
export function xrayHero(ctx, g, p, alpha = 0.45) {
  if (!p || p.out || p.hidden || !p.art) return;
  const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * alpha; setSilhouette(p.hero?.accent || '#ffe2a0');
  try { drawWithFlash(ctx, p.sx, p.sy, 0, (c) => p.art.draw(c, p.pose(), { facing: p.facing, t: g.time, mem: {} })); } catch (e) { if (!xrayHero.err) { xrayHero.err = 1; console.error('xrayHero', e); } }   // (its art not ready; logged once)
  finally { setSilhouette(g.impact && !g.cutin ? '#fff8ea' : null); ctx.globalAlpha = a0; }
}
/** a danger frame's warm rim: the foe's own sprite as a flat silhouette in `col`, 2.5 px round it, drawn just BEFORE the foe (its draw()) --
 *  the wind-up reads as "danger now" in the picture too, not only in its pose (the critics' ask).  No blink: alpha follows the wind-up. */
export function rimGlow(ctx, a, col, alpha = 0.7, r = 2.5) {
  const mod = CHARS[a.art]; if (!mod || !a.pose || alpha <= 0.02) return;
  const pose = a.pose(), o = { ...(a.drawOpts ? a.drawOpts() : { facing: a.facing }), mem: {} }, g = a.game, a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * Math.min(1, alpha); setSilhouette(col);
  try { for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r]]) drawWithFlash(ctx, a.sx + dx, a.sy + dy, 0, (c) => mod.draw(c, pose, o)); } catch (e) { if (!rimGlow.err) { rimGlow.err = 1; console.error('rimGlow', e); } }   // (its art not ready; logged once)
  finally { setSilhouette(g.impact && !g.cutin ? '#fff8ea' : null); ctx.globalAlpha = a0; }
}
/** the wind-up's sound (once, at its first frame) -- kind: 'swing' | 'lunge' | 'snip' | 'dive' | 'growl' | 'spin' */
export function windSound(a, kind) {
  const name = { swing: 'tele_swing', lunge: 'tele_lunge', snip: 'tele_snip', dive: 'tele_dive', growl: 'tele_growl', spin: 'tele_spin' }[kind] || 'tele_swing';   // (the composer's wind-up sounds, src/audio.js)
  audio.sfx(name, { vol: 1, pitch: a?.small || a?.scale < 0.8 ? 1.15 : 1 });   // (a small one a touch higher)
  void a;
}
