// Dodongo's Quest - Skull Island: THE SUN KEY (src/stages/sisunkey.js), the backdrop of the fuse story (si_fuse) -- when all three wedges are won (the cave's, the
// swamp's, the cell's) they are held up by FOUR hands (Dodongo's, Anastasia's, Shadow's, Scarlet's), slide together and go KLIK: one round gold sun disc, no shaft.
// Story panels pick the look with bg: hands (0..1: how far the four hands reach in), join (0 = the pieces apart .. 1 = together), klik (0..1: the burst and the word),
// shine (0..1: the finished disc glowing).  Live drawing, no cache (a story's backdrop).
import { W, H, INK } from '../config.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const CX = 480, CY = 278, R = 105;
// the three pieces: 120 degrees each, each with its own engraving (a flame, a leaf, a moon with a Z)
const PIECES = [{ a0: -90 - 60, col: ['#ffd23a', '#f0a81e'], mark: 'flame' }, { a0: -90 + 60, col: ['#ffd84a', '#e8a020'], mark: 'leaf' }, { a0: -90 + 180, col: ['#ffe066', '#f0b02a'], mark: 'moon' }];
const HANDS = [{ name: 'dodongo', skin: '#e8b890', sleeve: '#c8602a', ang: -150 }, { name: 'ana', skin: '#d8a074', sleeve: '#2a8a8a', ang: -30 }, { name: 'shadow', skin: '#2a2230', sleeve: '#1a1620', ang: 90 }, { name: 'scarlet', skin: '#f0c4a0', sleeve: '#b82a3a', ang: -90 }];

export function createStage() {
  let hands = 1, join = 0, klik = 0, shine = 0, view = 1, vdy = 0;
  function bgfill(ctx, t) {
    const g = ctx.createRadialGradient(CX, CY, 20, CX, CY, 560); g.addColorStop(0, '#2c2448'); g.addColorStop(0.55, '#16122c'); g.addColorStop(1, '#08060f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // slow rays
    ctx.save(); ctx.translate(CX, CY); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 14; i++) { const a = i * TAU / 14 + t * 0.05, w = 0.09; ctx.fillStyle = `rgba(255,210,90,${0.05 + 0.1 * shine + 0.1 * klik})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 900, a - w, a + w); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function mark(ctx, kind, r) {
    ctx.save(); ctx.strokeStyle = 'rgba(120,64,10,0.85)'; ctx.fillStyle = 'rgba(120,64,10,0.55)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'flame') { ctx.beginPath(); ctx.moveTo(0, r * 0.2); ctx.quadraticCurveTo(-r * 0.2, -r * 0.1, 0, -r * 0.4); ctx.quadraticCurveTo(r * 0.04, -r * 0.1, r * 0.1, -r * 0.2); ctx.quadraticCurveTo(r * 0.24, 0, 0, r * 0.2); ctx.fill(); ctx.stroke(); }
    else if (kind === 'leaf') { ctx.beginPath(); ctx.moveTo(-r * 0.16, r * 0.2); ctx.quadraticCurveTo(-r * 0.2, -r * 0.3, r * 0.18, -r * 0.34); ctx.quadraticCurveTo(r * 0.2, r * 0.1, -r * 0.16, r * 0.2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-r * 0.16, r * 0.2); ctx.lineTo(r * 0.1, -r * 0.2); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0.5, TAU - 0.5); ctx.stroke(); ctx.font = `bold ${(r * 0.3) | 0}px Bangers, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('z', r * 0.18, -r * 0.02); }
    ctx.restore();
  }
  function piece(ctx, P, off, t) {
    const a0 = P.a0 * Math.PI / 180, a1 = a0 + TAU / 3, mid = (a0 + a1) / 2;
    ctx.save(); ctx.translate(CX + Math.cos(mid) * off, CY + Math.sin(mid) * off); ctx.rotate((1 - join) * 0.08 * Math.sin(mid * 3));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath();
    const g = ctx.createLinearGradient(Math.cos(mid) * -R * 0.6, Math.sin(mid) * -R * 0.6, Math.cos(mid) * R * 0.8, Math.sin(mid) * R * 0.8); g.addColorStop(0, P.col[0]); g.addColorStop(1, P.col[1]);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
    // a lit rim along the arc, a few rays engraved, the mark
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(255,248,200,0.7)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, R - 6, a0 + 0.05, a1 - 0.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,84,10,0.55)'; ctx.lineWidth = 3; for (let k = 1; k < 5; k++) { const a = lerp(a0, a1, k / 5); ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42); ctx.lineTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.translate(Math.cos(mid) * R * 0.58, Math.sin(mid) * R * 0.58); mark(ctx, P.mark, R * 0.7); ctx.restore();
    ctx.restore();
    void t;
  }
  /** a cartoon hand reaching in from the angle `ang` (degrees from the centre): a sleeve, a palm, four fingers and a thumb gripping the piece's rim */
  function hand(ctx, H0, d) {
    const a = H0.ang * Math.PI / 180, x = CX + Math.cos(a) * d, y = CY + Math.sin(a) * d;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the arm / sleeve going back off the panel
    ctx.fillStyle = H0.sleeve; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-18, -17); ctx.lineTo(-300, -24); ctx.lineTo(-300, 24); ctx.lineTo(-18, 17); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(-296, -22, 276, 9);
    ctx.fillStyle = H0.name === 'scarlet' ? '#f0c34a' : H0.name === 'shadow' ? '#b82a3a' : '#f4ead0'; ctx.beginPath(); ctx.rect(-34, -20, 14, 40); ctx.fill(); ctx.stroke();   // the cuff
    // the palm and fingers
    ctx.fillStyle = H0.skin; ctx.beginPath(); ctx.ellipse(0, 0, 22, 19, 0, 0, TAU); ctx.fill(); ctx.stroke();
    for (const [fy, l] of [[-13, 17], [-4, 20], [5, 20], [13, 16]]) { ctx.beginPath(); ctx.moveTo(10, fy - 4); ctx.lineTo(10 + l, fy - 3); ctx.quadraticCurveTo(10 + l + 7, fy, 10 + l, fy + 3); ctx.lineTo(10, fy + 4); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-4, 14); ctx.quadraticCurveTo(10, 30, 26, 18); ctx.quadraticCurveTo(28, 12, 20, 12); ctx.quadraticCurveTo(8, 18, 2, 8); ctx.closePath(); ctx.fill(); ctx.stroke();   // the thumb
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.ellipse(-4, -8, 12, 5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawBack(ctx, camX, t = 0) {
    void camX;
    ctx.save();
    bgfill(ctx, t);
    if (view !== 1 || vdy) { ctx.translate(CX, CY + vdy); ctx.scale(view, view); ctx.translate(-CX, -CY); }   // (the composition smaller / lower: the caption strip stays clear of the four hands)
    // the disc's glow
    ctx.save(); ctx.globalCompositeOperation = 'screen'; const gg = ctx.createRadialGradient(CX, CY, 20, CX, CY, 360); gg.addColorStop(0, `rgba(255,224,120,${0.18 + 0.4 * join * (0.4 + shine) + 0.4 * klik})`); gg.addColorStop(1, 'rgba(255,170,40,0)'); ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H); ctx.restore();
    if (klik > 0.01) {   // KLIK!: a starburst behind the disc, the word over it
      ctx.save(); ctx.translate(CX, CY); ctx.globalAlpha = Math.min(1, klik * 1.4);
      ctx.fillStyle = '#fff6b0'; ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath();
      for (let i = 0; i < 24; i++) { const a = i * TAU / 24, rr = i % 2 ? 150 : 214 + 12 * Math.sin(t * 20 + i); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const off = (1 - join) * 72 + 3 * (1 - klik);
    const bob = Math.sin(t * 2) * 3 * (1 - join);
    ctx.save(); ctx.translate(0, bob);
    for (const P of PIECES) piece(ctx, P, off, t);
    ctx.restore();
    // the four hands: far out while the pieces are apart, pressed in as they join
    const reach = lerp(R + 100, R + 30, join) + (1 - hands) * 360;
    if (hands > 0.01) for (const Hd of HANDS) hand(ctx, Hd, reach);
    // the hub: a small sun-boss in the middle once whole
    if (join > 0.95) { ctx.save(); ctx.translate(CX, CY); ctx.fillStyle = '#fff2a0'; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.restore(); }
    if (klik > 0.01) {
      ctx.save(); ctx.translate(CX, CY - R - 34); ctx.globalAlpha = Math.min(1, klik * 1.4); ctx.rotate(-0.08);
      ctx.font = 'bold 92px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.strokeText('KLIK!', 0, 0); ctx.fillStyle = '#e8401f'; ctx.fillText('KLIK!', 0, 0);
      ctx.restore();
    }
    // sparkles
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffe9a0';
    for (let i = 0; i < 26; i++) { const a = (i * 2.4 + t * 0.3) % TAU, d = 120 + ((i * 53 + t * 40) % 260), s = (0.4 + 0.6 * Math.sin(t * 3 + i)) * (0.3 + shine + klik); if (s <= 0.05) continue; ctx.globalAlpha = Math.min(1, s); ctx.beginPath(); ctx.arc(CX + Math.cos(a) * d, CY + Math.sin(a) * d * 0.7, 2.6 * s + 0.6, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.restore();
  }
  return {
    setScale() {}, setWarm() {}, drawProp() {}, drawFront() {}, drawBack,
    setStory(bg) { hands = bg && bg.hands !== undefined ? clamp(bg.hands, 0, 1) : 1; join = bg && bg.join !== undefined ? clamp(bg.join, 0, 1) : 0; klik = bg && bg.klik ? clamp(bg.klik, 0, 1) : 0; shine = bg && bg.shine ? clamp(bg.shine, 0, 1) : 0; view = bg && bg.k ? clamp(bg.k, 0.3, 1.5) : 1; vdy = bg && bg.dy ? bg.dy : 0; },
    info() { return { canvases: 0, megapixels: 0, approxMB: 0 }; }, release() {},
  };
}
export const PROP_INFO = {};
