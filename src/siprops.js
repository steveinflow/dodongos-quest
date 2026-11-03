// Skull Island's own look for shared props (src/interact.js calls these only in a Book 2 level: L.si).
//   drawSiWaystone(ctx, w, t)   the checkpoint WAYSTONE, painted to sit in each stage instead of the flat light-grey vector plinth (the palace
//                               critics: it was the brightest thing on the corridor wall) -- a darker, textured, shaded pedestal per stage
//                               (ship wood + brass on the Gull / the Kraken's deck / the Treasure Room, basalt in the cave, mossy stone in the
//                               swamp and the cell, violet stone in the palace) with a soft glow round its crystal.  No blink: the glow breathes.
import { INK } from './config.js';
import { TAU } from './rig.js';

const LOOKS = {
  ship: { top: '#7a5434', mid: '#5c3c24', low: '#3e2816', line: '#2a1a0e', hi: '#a07448', band: '#c8a050', bandD: '#7a5a22' },
  basalt: { top: '#4a4c58', mid: '#373944', low: '#24252e', line: '#16171c', hi: '#6a6c7a', glint: '#ff8a3a' },
  moss: { top: '#5f675a', mid: '#4a5146', low: '#323830', line: '#1e221c', hi: '#7c8674', moss: '#5e8a3a', mossD: '#3e6024' },
  violet: { top: '#5a4672', mid: '#45355a', low: '#2e2340', line: '#1c1428', hi: '#7a63a0', rune: '#c89aff' },
};
const LOOK_OF = { sibluegull: 'ship', sikraken: 'ship', sitreasure: 'ship', sicave: 'basalt', siswamp: 'moss', sicell: 'moss', sipalace: 'violet' };

/** a tapering block, shaded top -> bottom, ink-edged; a lit edge on the left */
function block(ctx, x0, x1, y0, x2, x3, y1, P) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x3, y1); ctx.lineTo(x2, y1); ctx.closePath();
  const gr = ctx.createLinearGradient(0, y1, 0, y0); gr.addColorStop(0, P.low); gr.addColorStop(0.55, P.mid); gr.addColorStop(1, P.top);
  ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.save(); ctx.clip(); ctx.strokeStyle = P.hi; ctx.globalAlpha = 0.55; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 + 3, y0 + 2); ctx.lineTo(x2 + 3, y1 - 2); ctx.stroke(); ctx.restore();
}
export function drawSiWaystone(ctx, w, t) {
  const g = w.game, look = LOOK_OF[g.L?.id] || 'moss', P = LOOKS[look], sx = w.sx, sy = w.sy, lit = !!w.lit;
  ctx.save(); ctx.translate(sx, sy);
  // the contact shadow: darker at the foot
  ctx.fillStyle = 'rgba(10,6,14,0.35)'; ctx.beginPath(); ctx.ellipse(0, 1, 34, 7, 0, 0, TAU); ctx.fill();
  // base and shaft
  block(ctx, -24, 24, -34, -30, 30, 0, P);
  block(ctx, -17, 17, -70, -22, 22, -34, P);
  ctx.save(); ctx.strokeStyle = P.line; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.8;
  if (look === 'ship') {   // planks + two brass bands
    ctx.beginPath(); for (const x of [-10, 0, 10]) { ctx.moveTo(x, -66); ctx.lineTo(x * 1.25, -36); ctx.moveTo(x * 1.2, -31); ctx.lineTo(x * 1.35, -3); } ctx.stroke();
    ctx.globalAlpha = 1; for (const [y, hw] of [[-60, 18], [-24, 26]]) { ctx.fillStyle = P.band; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(-hw, y - 3, hw * 2, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = P.bandD; for (const x of [-hw + 4, hw - 4]) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); } }
  } else {   // stone courses + chips
    ctx.beginPath(); ctx.moveTo(-26, -17); ctx.lineTo(26, -17); ctx.moveTo(-19, -52); ctx.lineTo(19, -52); ctx.moveTo(-6, -34); ctx.lineTo(-7, -17); ctx.moveTo(9, -17); ctx.lineTo(10, 0); ctx.moveTo(4, -70); ctx.lineTo(5, -52); ctx.stroke();
    ctx.fillStyle = P.line; ctx.globalAlpha = 0.5; for (const [x, y] of [[-12, -8], [14, -27], [-9, -44], [8, -62], [18, -6]]) { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (look === 'moss') { ctx.fillStyle = P.moss; ctx.strokeStyle = P.mossD; ctx.lineWidth = 1.2; for (const [x, y, r] of [[-22, -3, 7], [-16, -36, 6], [17, -38, 5], [24, -4, 6]]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, Math.PI, TAU); ctx.fill(); ctx.stroke(); } }
    if (look === 'basalt') { ctx.strokeStyle = P.glint; ctx.globalAlpha = 0.45 + 0.15 * Math.sin(t * 1.4); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-8, -12); ctx.lineTo(-11, -20); ctx.moveTo(12, -40); ctx.lineTo(8, -48); ctx.stroke(); ctx.globalAlpha = 1; }
    if (look === 'violet') { ctx.strokeStyle = P.rune; ctx.globalAlpha = lit ? 0.85 : 0.4; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-6, -46); ctx.lineTo(0, -60); ctx.lineTo(6, -46); ctx.moveTo(-9, -22); ctx.lineTo(9, -22); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  ctx.restore();
  // the floating crystal: a soft glow round it (brighter once lit, breathing slowly -- never a blink)
  const bob = Math.sin(t * 2.2) * 4;
  ctx.translate(0, -104 + bob);
  const glow = (lit ? 0.32 : 0.12) + (lit ? 0.08 : 0.04) * Math.sin(t * 2);
  const gr = ctx.createRadialGradient(0, 0, 4, 0, 0, lit ? 46 : 30); gr.addColorStop(0, `rgba(140,215,255,${glow})`); gr.addColorStop(1, 'rgba(140,215,255,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, lit ? 46 : 30, 0, TAU); ctx.fill();
  ctx.rotate(Math.sin(t * 1.3) * 0.08);
  ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(13, -6); ctx.lineTo(9, 20); ctx.lineTo(-9, 20); ctx.lineTo(-13, -6); ctx.closePath();
  const cg = ctx.createLinearGradient(-13, -26, 13, 20); cg.addColorStop(0, lit ? '#c8f2ff' : '#7aa0bc'); cg.addColorStop(0.5, lit ? '#6cc8f4' : '#4c7090'); cg.addColorStop(1, lit ? '#2f7cc0' : '#2c4660');
  ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.8; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.strokeStyle = lit ? 'rgba(240,252,255,0.9)' : 'rgba(170,200,220,0.6)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, 20); ctx.moveTo(-13, -6); ctx.lineTo(13, -6); ctx.stroke();
  ctx.restore();
}
