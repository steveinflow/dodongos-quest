// BROADSIDE's galleon (Pirate Queen Scarlet's super): drawn at the origin -- the waterline at y 0, the bow toward +x, about
// 400 x 230 -- with the caller's transform and alpha.  src/forms.js BroadsideShip sails it across a level's background on
// the sea; the sky duel (src/duelsupers.js) sails it through the clouds (opts.sky: a cloud bank under the hull, no sea).
import { INK } from './config.js';
import { TAU } from './rig.js';

export function drawGalleon(ctx, time, opts = {}) {
  ctx.lineJoin = 'round';
  if (opts.bare) { /* (the Storm Sea ride, src/stormride.js: the caller's own sea) */ } else if (!opts.sky) {
    // sea spray at the waterline
    ctx.fillStyle = 'rgba(200,235,255,0.6)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-150 + i * 60 + Math.sin(time * 6 + i) * 6, 6, 10 + (i % 2) * 5, 0, TAU); ctx.fill(); }
  } else {
    // a cloud bank under the hull, drifting
    ctx.fillStyle = 'rgba(236,232,255,0.85)';
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-170 + i * 58 + Math.sin(time * 1.6 + i) * 5, 10 + (i % 2) * 6, 26 + (i % 3) * 6, 0, TAU); ctx.fill(); }
  }
  // hull
  const hullG = ctx.createLinearGradient(0, -44, 0, 4); hullG.addColorStop(0, '#6a4228'); hullG.addColorStop(0.5, '#4a2c1c'); hullG.addColorStop(1, '#2a180e');   // (lit along the top)
  ctx.fillStyle = hullG; ctx.strokeStyle = INK; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-170, -40); ctx.lineTo(160, -40); ctx.quadraticCurveTo(190, -50, 200, -70); ctx.lineTo(150, 4); ctx.lineTo(-140, 4); ctx.quadraticCurveTo(-170, -10, -170, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(20,10,6,0.45)'; ctx.lineWidth = 1.6;   // (its planks)
  for (const py of [-16, -6]) { ctx.beginPath(); ctx.moveTo(-162 + (py + 16) * 0.8, py); ctx.lineTo(166 - (py + 16) * 0.6, py); ctx.stroke(); }
  ctx.strokeStyle = INK; ctx.lineWidth = 4;
  ctx.fillStyle = '#c9902a'; ctx.fillRect(-160, -32, 300, 5);
  // gun ports
  for (let i = 0; i < 6; i++) { ctx.fillStyle = '#120a08'; ctx.fillRect(-120 + i * 46, -24, 14, 11); }
  // masts and sails
  ctx.fillStyle = '#5a3a24'; ctx.lineWidth = 2.4;
  for (const mx of [-70, 40]) { ctx.fillRect(mx - 3, -190, 6, 152); ctx.strokeRect(mx - 3, -190, 6, 152); }   // (the masts, inked)
  ctx.lineWidth = 4;
  const gust = Math.sin(time * 3) * 5;   // (the wind fills them: the bellies swell and ease)
  for (const [mx, w] of [[-70, 84], [40, 96]]) {   // (billowed sails: bellied out with the wind, shaded across the curve)
  const sail = () => { ctx.moveTo(mx - w / 2, -172); ctx.quadraticCurveTo(mx, -160 + gust * 0.3, mx + w / 2, -172);
    ctx.quadraticCurveTo(mx + w / 2 + 18 + gust, -116, mx + w / 2 - 4, -62); ctx.quadraticCurveTo(mx, -76 - gust, mx - w / 2 + 4, -62); ctx.quadraticCurveTo(mx - w / 2 + 14 + gust * 0.5, -116, mx - w / 2, -172); ctx.closePath(); };
  const sg = ctx.createLinearGradient(mx - w / 2, 0, mx + w / 2 + 18, 0);
  if (opts.dawn) { sg.addColorStop(0, '#9a2a20'); sg.addColorStop(0.55, '#e0503a'); sg.addColorStop(1, '#b8382a'); }   // (the Scarlet Dawn: crimson sails)
  else { sg.addColorStop(0, '#cbb58a'); sg.addColorStop(0.55, '#fbf3dc'); sg.addColorStop(1, '#dcc89c'); }
  ctx.fillStyle = sg; ctx.beginPath(); sail(); ctx.fill();
  ctx.save(); ctx.beginPath(); sail(); ctx.clip();   // (the shadow under its belly)
  ctx.fillStyle = opts.dawn ? 'rgba(60,10,10,0.35)' : 'rgba(150,120,80,0.35)'; ctx.beginPath(); ctx.ellipse(mx + w * 0.18, -70, w * 0.6, 22, 0, 0, TAU); ctx.fill();
  if (opts.dawn) { ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(mx + 4, -112, 15, 0, TAU); ctx.fill(); ctx.stroke(); for (let i = 0; i < 10; i++) { const a = i * TAU / 10; ctx.beginPath(); ctx.moveTo(mx + 4 + Math.cos(a) * 17, -112 + Math.sin(a) * 17); ctx.lineTo(mx + 4 + Math.cos(a) * 25, -112 + Math.sin(a) * 25); ctx.lineWidth = 3.4; ctx.stroke(); } ctx.lineWidth = 4; }   // (a gold sun on each sail)
  ctx.restore();
  ctx.beginPath(); sail(); ctx.stroke();
  ctx.strokeStyle = 'rgba(150,120,80,0.7)'; ctx.lineWidth = 2; ctx.beginPath();   // (seams, curved with the belly)
  ctx.moveTo(mx - w / 2 + 8, -140); ctx.quadraticCurveTo(mx + 6, -128 - gust * 0.4, mx + w / 2 + 4, -140);
  ctx.moveTo(mx - w / 2 + 10, -104); ctx.quadraticCurveTo(mx + 8, -92 - gust * 0.4, mx + w / 2 + 8, -104);
  ctx.moveTo(mx, -166); ctx.quadraticCurveTo(mx + 10 + gust, -116, mx + 2, -70); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 4;
  }
  // the flag: a friendly skull with Scarlet's crown
  if (opts.dawn) {   // (the Scarlet Dawn: a gold sun-face figurehead at the bow, a crimson pennant with a gold sun at the masthead)
    ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(206, -66, 19, 0, TAU); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.5 + (i - 4) * 0.36; ctx.beginPath(); ctx.moveTo(206 + Math.cos(a) * 20, -66 + Math.sin(a) * 20); ctx.lineTo(206 + Math.cos(a) * 31, -66 + Math.sin(a) * 31); ctx.lineWidth = 4; ctx.stroke(); }
    ctx.fillStyle = '#ff9a2a'; ctx.beginPath(); ctx.arc(206, -66, 14, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffe58a'; ctx.beginPath(); ctx.arc(203, -70, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(201, -68, 2, 0, TAU); ctx.arc(211, -68, 2, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(206, -63, 6, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = '#c8301f'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(40, -216); ctx.lineTo(96, -208 + Math.sin(time * 5) * 3); ctx.lineTo(40, -192); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(54, -205, 5, 0, TAU); ctx.fill();
    ctx.lineWidth = 4;
  } else {
  ctx.fillStyle = '#16121a'; ctx.fillRect(40, -216, 50, 32); ctx.strokeRect(40, -216, 50, 32);
  ctx.fillStyle = '#f2e6c8'; ctx.beginPath(); ctx.arc(65, -198, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#16121a'; ctx.beginPath(); ctx.arc(62, -199, 2, 0, TAU); ctx.arc(68, -199, 2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#16121a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(65, -196, 3.4, 0.3, Math.PI - 0.3); ctx.stroke();
  ctx.fillStyle = '#ffc23a'; ctx.beginPath(); ctx.moveTo(57, -205); ctx.lineTo(59, -212); ctx.lineTo(62, -207); ctx.lineTo(65, -213); ctx.lineTo(68, -207); ctx.lineTo(71, -212); ctx.lineTo(73, -205); ctx.closePath(); ctx.fill();
  }
  if (opts.bare) { /* (the caller's own sea) */ } else if (!opts.sky) {
    // a strip of waves along the waterline
    ctx.fillStyle = '#3a8ab8'; ctx.beginPath(); ctx.moveTo(-200, 0);
    for (let i = 0; i <= 16; i++) ctx.quadraticCurveTo(-200 + i * 26 - 13, -10 + Math.sin(time * 4 + i) * 3, -200 + i * 26, 0);
    ctx.lineTo(220, 14); ctx.lineTo(-200, 14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d8f4ff'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(250,248,255,0.92)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-150 + i * 62 + Math.sin(time * 2 + i * 1.7) * 4, 4 + (i % 2) * 4, 18 + (i % 2) * 6, 0, TAU); ctx.fill(); }
  }
}
