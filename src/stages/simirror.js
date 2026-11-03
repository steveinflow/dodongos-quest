// Dodongo's Quest - Skull Island: MALACHAR'S MIRROR ROOM (src/stages/simirror.js), the backdrop of the map's first story (si_map_mirror):
// a dark stone chamber, two candles, a great ornate mirror of swirling purple -- and in it Malachar: a bust in a high spiked collar and a
// pale porcelain MASK (the book's: split by a thin line, one half laughing, one weeping a blue tear, one big laughing mouth), bald, no hood (the hooded stranger is the third wizard, never
// shown).  His magic is purple / magenta.  Story panels pick the look with bg.shot: 'wide' (the room), 'close' (the mirror fills the
// panel) or 'ship' (the mirror shows the island and a little red-sailed ship coming in).  Live drawing, no cache (a story's backdrop).
import { W, H, INK } from '../config.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Malachar's mask, after the book (book2/panels/malachar_sheet.png): ONE pale cream porcelain mask split by a thin line -- the viewer's left
// half laughs (a closed, happy eye), the right half weeps (a sad eye, a blue tear) -- and one big laughing open mouth across both halves.
// (c: a 2D context; drawn about the origin, s: half its height; ink: the outline colour; lw: the outline width)
function bookMask(c, s, ink = '#16121e', lw = Math.max(1.4, s * 0.09)) {
  const face = () => { c.beginPath(); c.moveTo(0, -s); c.bezierCurveTo(s * 0.62, -s, s * 0.8, -s * 0.45, s * 0.76, -s * 0.02); c.bezierCurveTo(s * 0.72, s * 0.5, s * 0.4, s * 0.98, 0, s); c.bezierCurveTo(-s * 0.4, s * 0.98, -s * 0.72, s * 0.5, -s * 0.76, -s * 0.02); c.bezierCurveTo(-s * 0.8, -s * 0.45, -s * 0.62, -s, 0, -s); c.closePath(); };
  face(); c.fillStyle = '#f2ead8'; c.fill();
  c.save(); face(); c.clip();
  c.fillStyle = '#ddd4c6'; c.fillRect(0, -s * 1.1, s, s * 2.2);   // (the weeping half a shade greyer)
  const sh = c.createRadialGradient(-s * 0.25, -s * 0.4, s * 0.1, 0, 0, s * 1.1); sh.addColorStop(0, 'rgba(255,255,250,0.5)'); sh.addColorStop(0.6, 'rgba(255,255,250,0)'); sh.addColorStop(1, 'rgba(90,70,90,0.28)');
  c.fillStyle = sh; c.fillRect(-s, -s * 1.1, s * 2, s * 2.2);   // (porcelain: a soft sheen, shaded to its edges)
  c.restore();
  face(); c.lineWidth = lw; c.strokeStyle = ink; c.stroke();
  c.lineWidth = Math.max(1, lw * 0.5); c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * 0.04, -s * 0.5, -s * 0.02, -s * 0.1); c.quadraticCurveTo(s * 0.03, s * 0.2, 0, s * 0.26); c.moveTo(0, s * 0.86); c.lineTo(0, s); c.stroke();   // (the split)
  c.lineCap = 'round';
  // the laughing half: a raised brow, a closed happy eye (an arch), a round cheek
  c.lineWidth = Math.max(1, lw * 0.7); c.beginPath(); c.arc(-s * 0.36, -s * 0.48, s * 0.17, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  c.lineWidth = Math.max(1.2, lw * 0.85); c.beginPath(); c.arc(-s * 0.35, -s * 0.18, s * 0.16, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.fillStyle = 'rgba(230,150,150,0.28)'; c.beginPath(); c.ellipse(-s * 0.48, s * 0.1, s * 0.14, s * 0.08, 0, 0, Math.PI * 2); c.fill();
  // the weeping half: a brow slanting up to the middle, a sad open eye, a blue tear running down
  c.lineWidth = Math.max(1, lw * 0.7); c.beginPath(); c.moveTo(s * 0.54, -s * 0.38); c.quadraticCurveTo(s * 0.36, -s * 0.44, s * 0.16, -s * 0.56); c.stroke();
  c.fillStyle = '#fbf7ee'; c.beginPath(); c.moveTo(s * 0.18, -s * 0.2); c.quadraticCurveTo(s * 0.34, -s * 0.34, s * 0.52, -s * 0.2); c.quadraticCurveTo(s * 0.36, -s * 0.08, s * 0.18, -s * 0.2); c.closePath(); c.fill(); c.lineWidth = Math.max(1, lw * 0.6); c.stroke();
  c.fillStyle = ink; c.beginPath(); c.arc(s * 0.34, -s * 0.17, s * 0.06, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(80,150,220,0.55)'; c.lineWidth = Math.max(1, s * 0.05); c.beginPath(); c.moveTo(s * 0.4, -s * 0.1); c.quadraticCurveTo(s * 0.44, s * 0.06, s * 0.42, s * 0.18); c.stroke();
  c.fillStyle = '#5aa8e8'; c.beginPath(); c.moveTo(s * 0.42, s * 0.12); c.quadraticCurveTo(s * 0.5, s * 0.26, s * 0.42, s * 0.3); c.quadraticCurveTo(s * 0.34, s * 0.26, s * 0.42, s * 0.12); c.closePath(); c.fill(); c.strokeStyle = ink; c.lineWidth = Math.max(0.8, lw * 0.4); c.stroke();
  // the one big laughing mouth across both halves: dark inside, a row of top teeth, a tongue
  const mouth = () => { c.beginPath(); c.moveTo(-s * 0.46, s * 0.3); c.quadraticCurveTo(0, s * 0.4, s * 0.46, s * 0.3); c.quadraticCurveTo(s * 0.4, s * 0.78, 0, s * 0.8); c.quadraticCurveTo(-s * 0.4, s * 0.78, -s * 0.46, s * 0.3); c.closePath(); };
  mouth(); c.fillStyle = '#4a1624'; c.fill();
  c.save(); mouth(); c.clip();
  c.fillStyle = '#fbf7ee'; c.fillRect(-s * 0.5, s * 0.28, s, s * 0.14);
  c.fillStyle = '#d8606e'; c.beginPath(); c.ellipse(0, s * 0.78, s * 0.26, s * 0.16, 0, 0, Math.PI * 2); c.fill();
  c.restore();
  mouth(); c.strokeStyle = ink; c.lineWidth = Math.max(1, lw * 0.8); c.stroke();
  c.lineCap = 'butt';
}
export function createStage() {
  let shot = 'wide';
  function wall(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#120a20'); g.addColorStop(1, '#241638');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(8,4,16,0.55)'; ctx.lineWidth = 2;
    for (let r = 0; r < 9; r++) { const y = r * 64 + 8; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); for (let c = 0; c < 10; c++) { const x = c * 108 + (r % 2 ? 54 : 0); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke(); } }
    const v = ctx.createRadialGradient(W / 2, 260, 80, W / 2, 260, 560); v.addColorStop(0, 'rgba(150,50,200,0.32)'); v.addColorStop(1, 'rgba(10,4,24,0.5)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    void t;
  }
  function candle(ctx, x, y, t, seed) {
    ctx.fillStyle = '#e8dcc0'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.rect(x - 9, y, 18, 62); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.rect(x - 22, y + 62, 44, 10); ctx.fill(); ctx.stroke();
    const f = 0.8 + 0.2 * Math.sin(t * 9 + seed) * Math.sin(t * 5.3 + seed * 2);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; const gg = ctx.createRadialGradient(x, y - 14, 2, x, y - 14, 90 * f); gg.addColorStop(0, 'rgba(255,200,120,0.55)'); gg.addColorStop(1, 'rgba(255,160,60,0)'); ctx.fillStyle = gg; ctx.fillRect(x - 100, y - 110, 200, 200); ctx.restore();
    ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.moveTo(x, y - 34 * f); ctx.quadraticCurveTo(x + 9, y - 12, x, y); ctx.quadraticCurveTo(x - 9, y - 12, x, y - 34 * f); ctx.fill(); ctx.stroke();
  }
  /** Malachar in the glass: a bust in a high spiked collar, bald, his split porcelain mask (the book's) */
  function malachar(ctx, cx, cy, k, t) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // shoulders and robe
    ctx.fillStyle = '#2a1650'; ctx.strokeStyle = INK; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-190, 200); ctx.quadraticCurveTo(-170, 60, -80, 40); ctx.lineTo(80, 40); ctx.quadraticCurveTo(170, 60, 190, 200); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(180,80,255,0.25)'; ctx.beginPath(); ctx.moveTo(-190, 200); ctx.quadraticCurveTo(-170, 60, -80, 40); ctx.lineTo(-60, 120); ctx.closePath(); ctx.fill();
    // the high spiked collar
    ctx.fillStyle = '#1a0e34'; ctx.beginPath(); ctx.moveTo(-96, 70); ctx.lineTo(-120, -20); ctx.lineTo(-76, 10); ctx.lineTo(-56, -50); ctx.lineTo(-30, 20); ctx.lineTo(0, -64); ctx.lineTo(30, 20); ctx.lineTo(56, -50); ctx.lineTo(76, 10); ctx.lineTo(120, -20); ctx.lineTo(96, 70); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(214,120,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-120, -20); ctx.lineTo(-76, 10); ctx.lineTo(-56, -50); ctx.moveTo(120, -20); ctx.lineTo(76, 10); ctx.lineTo(56, -50); ctx.stroke();
    // the head: bald and pale behind the mask (the book's), the mask over his face, his purple only in the air round it
    ctx.strokeStyle = INK; ctx.lineWidth = 6;
    ctx.fillStyle = '#e6cdb6'; ctx.beginPath(); ctx.ellipse(0, -60, 64, 74, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(120,70,60,0.25)'; ctx.beginPath(); ctx.ellipse(26, -56, 34, 66, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-24, -110, 18, 10, -0.4, 0, TAU); ctx.fill();
    { const g = 0.75 + 0.25 * Math.sin(t * 3); ctx.save(); ctx.globalCompositeOperation = 'screen'; const eg = ctx.createRadialGradient(0, -40, 40, 0, -40, 130); eg.addColorStop(0, `rgba(200,80,255,${0.35 * g})`); eg.addColorStop(1, 'rgba(200,80,255,0)'); ctx.fillStyle = eg; ctx.fillRect(-140, -170, 280, 260); ctx.restore(); }
    ctx.save(); ctx.translate(0, -44); bookMask(ctx, 66, INK, 5); ctx.restore();
    // the gem on the breast (the same split mask as the Kraken's collar) and the magic in his hands
    ctx.fillStyle = '#e060e0'; ctx.beginPath(); ctx.ellipse(0, 112, 18, 24, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
    for (const sx of [-1, 1]) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const og = ctx.createRadialGradient(sx * 130, 170, 2, sx * 130, 170, 60); og.addColorStop(0, 'rgba(255,120,255,0.9)'); og.addColorStop(1, 'rgba(160,40,220,0)'); ctx.fillStyle = og; ctx.fillRect(sx * 130 - 70, 100, 140, 140);
      ctx.strokeStyle = 'rgba(255,200,255,0.8)'; ctx.lineWidth = 3; for (let i = 0; i < 4; i++) { const a = t * 2 + i * 1.6 + sx; ctx.beginPath(); ctx.arc(sx * 130, 170, 24 + i * 6, a, a + 1.3); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
  }
  function glass(ctx, cx, cy, rx, ry, t, inner) {
    // the frame: black and old gold, with purple gems
    ctx.save(); ctx.lineJoin = 'round';
    for (const [d, col, lw] of [[18, '#1a1020', 14], [10, '#b8903a', 12], [3, '#e6c870', 5]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(cx, cy, rx + d, ry + d, 0, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, x = cx + Math.cos(a) * (rx + 18), y = cy + Math.sin(a) * (ry + 18); ctx.fillStyle = '#d070ff'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 12); ctx.lineTo(x - 9, y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    // the glass: a swirl of purple
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.clip();
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(rx, ry)); g.addColorStop(0, '#5a1a8a'); g.addColorStop(0.6, '#2a0a52'); g.addColorStop(1, '#14052e');
    ctx.fillStyle = g; ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    inner?.(ctx, cx, cy, rx, ry);
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(214,120,255,${0.25 - i * 0.05})`; ctx.lineWidth = 10 - i * 3; ctx.beginPath(); for (let k = 0; k <= 40; k++) { const r = 20 + k * 6, a = t * 0.4 + i * 2.1 + k * 0.16; const x = cx + Math.cos(a) * r * rx / 220, y = cy + Math.sin(a) * r * ry / 220; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.ellipse(cx - rx * 0.4, cy - ry * 0.45, rx * 0.12, ry * 0.3, -0.5, 0, TAU); ctx.fill();   // (a glint on the glass)
    ctx.restore();
  }
  function island(ctx, cx, cy, rx, ry, t) {
    // the mirror showing the island: a dark sea, the cone mountain, a red-sailed ship coming in
    const s = ctx.createLinearGradient(0, cy - ry, 0, cy + ry); s.addColorStop(0, '#2a1456'); s.addColorStop(0.55, '#3a2a70'); s.addColorStop(0.56, '#143a5a'); s.addColorStop(1, '#0a1c34');
    ctx.fillStyle = s; ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    ctx.fillStyle = '#1a1226'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 150, cy + 20); ctx.lineTo(cx - 40, cy + 10); ctx.lineTo(cx - 14, cy - 70); ctx.lineTo(cx, cy - 120); ctx.lineTo(cx + 14, cy - 70); ctx.lineTo(cx + 44, cy + 10); ctx.lineTo(cx + 150, cy + 20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d070ff'; ctx.beginPath(); ctx.ellipse(cx, cy - 118, 12, 4, 0, 0, TAU); ctx.fill();
    const bob = Math.sin(t * 2) * 3, sx = cx + 70 - ((t * 3) % 40) * 0.3;
    ctx.fillStyle = '#5a1a2a'; ctx.beginPath(); ctx.moveTo(sx - 26, cy + 70 + bob); ctx.lineTo(sx + 26, cy + 70 + bob); ctx.lineTo(sx + 18, cy + 84 + bob); ctx.lineTo(sx - 18, cy + 84 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c8323c'; ctx.beginPath(); ctx.moveTo(sx - 2, cy + 68 + bob); ctx.lineTo(sx - 2, cy + 30 + bob); ctx.quadraticCurveTo(sx + 24, cy + 46 + bob, sx + 20, cy + 68 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function drawBack(ctx, camX = 0, t = 0) {
    void camX;
    ctx.save();
    wall(ctx, t);
    if (shot === 'close') {
      glass(ctx, 480, 290, 380, 330, t, (c, cx, cy) => malachar(c, cx, cy + 40, 1.25, t));
    } else if (shot === 'ship') {
      candle(ctx, 120, 330, t, 1); candle(ctx, 840, 330, t, 2);
      glass(ctx, 480, 262, 190, 226, t, (c, cx, cy, rx, ry) => island(c, cx, cy, rx, ry, t));
    } else {
      candle(ctx, 120, 330, t, 1); candle(ctx, 840, 330, t, 2);
      glass(ctx, 480, 262, 190, 226, t, (c, cx, cy) => malachar(c, cx, cy + 20, 0.68, t));
    }
    // a low purple mist along the floor
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 7; i++) { const x = ((i * 190 + t * (10 + i * 2)) % (W + 300)) - 150; const g = ctx.createRadialGradient(x, 520, 4, x, 520, 150); g.addColorStop(0, 'rgba(170,70,240,0.28)'); g.addColorStop(1, 'rgba(170,70,240,0)'); ctx.fillStyle = g; ctx.fillRect(x - 160, 400, 320, 140); }
    ctx.restore();
    ctx.restore();
  }
  return {
    setScale() {}, setWarm() {}, drawProp() {}, drawFront() {}, drawBack,
    setStory(bg) { shot = (bg && bg.shot) || 'wide'; },
    info() { return { canvases: 0, megapixels: 0, approxMB: 0 }; }, release() {},
  };
}
export const PROP_INFO = {};
void clamp;
