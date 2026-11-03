// Skull Island's STORM SEA offer (docs/SKULL_ISLAND.md "Phase 4"): after the Kraken's last story, before Malachar's mirror and the island map, a small
// card over the stormy sea -- "SAIL THROUGH THE STORM?" -- the optional bonus ride (src/stormride.js), or straight on.  Pure logic + drawing; the scene is
// 'sioffer' in src/main.js (step -> stepStormOffer, draw -> drawStormOffer, a tap on a row picks it).
import { SI_STORM } from './simap.js';
import { audio } from './audio-proxy.js';
import * as HUD from './hud.js';
import { W, H, INK } from './config.js';
import { drawOfferShip, drawOfferPlate, drawOfferRow } from './stages/sistorm.js';

const FONT = 'Bangers, Impact, sans-serif', TITLE = '"Luckiest Guy", Bangers, sans-serif';

/** open the card; then(true) = sail the ride, then(false) = on to the map */
export async function openStormOffer(app, then) {
  app.setScene('loading');
  try { await app.loadStage(-1, SI_STORM); } catch (e) { console.warn('storm offer stage', e); }
  try { const st = app.stageOf?.(SI_STORM.id), c = app.ctx, sc = app.scale || 1; if (st && c) { c.save(); c.setTransform(sc, 0, 0, sc, 0, 0); st.setStorm?.(0.1); st.setIsland?.(0.12); st.drawBack(c, 0, 0); drawOfferShip(c, 0); st.drawFront?.(c, 0, 0); c.restore(); } } catch (e) { console.warn('storm offer prewarm', e); }   // (its caches -- cloud sheets, sea plates, veils, island, ship -- made now, under the loading screen (redrawn over it next frame): no hitch on the card's first frame)
  const go = (sail) => { app.menu = null; app._menuRows = null; app.siOffer = null; audio.sfx('menu_select'); if (!sail) { try { app.stageOf?.(SI_STORM.id)?.release?.(); } catch (e) { console.warn(e); } } then?.(sail); };   // (SKIP: the card drew the storm stage -- its cloud sheets go back)
  app.siOffer = { t: 0, go };
  app.menu = { items: [{ label: 'SAIL THROUGH THE STORM!', act: () => go(true) }, { label: 'SKIP TO THE ISLAND MAP', act: () => go(false) }], sel: 0 };
  audio.music('sikraken');   // (still on the Scarlet Dawn in the storm: the Kraken stage's storm shanty)
  app.setScene('sioffer');
  app.swallowInput?.();
}
/** one tick: the shared menu (up / down / confirm); BACK skips */
export function stepStormOffer(app) {
  const M = app.siOffer;
  if (!M) return;
  M.t++;
  if (M.t < 24) return;
  if (app._any.pressed.back) { M.go(false); return; }
  app.menuNav();
}
export function drawStormOffer(ctx, app) {
  const M = app.siOffer, st = app.stageOf(SI_STORM.id), t = app.time;
  if (st) { st.setStorm?.(0.1); st.setIsland?.(0.12); st.setFlash?.(Math.max(0, Math.sin(t * 0.9) * 2 - 1.6)); st.setBolt?.(300 + 200 * Math.sin(t)); st.drawBack(ctx, 0, t); drawOfferShip(ctx, t); st.drawFront?.(ctx, 0, t); }   // (the Scarlet Dawn hove-to at the lower left, painted, the near waves lapping her)
  else { ctx.fillStyle = '#1a0a30'; ctx.fillRect(0, 0, W, H); }
  ctx.fillStyle = 'rgba(14,6,30,0.28)'; ctx.fillRect(0, 0, W, H);   // (a light dim: the painted plate carries the words)
  const a = Math.min(1, (M?.t || 0) / 20);
  ctx.save(); ctx.globalAlpha = a;
  drawOfferPlate(ctx, t);   // (the card's painted navy-and-gilt plate: src/stages/sistorm.js)
  HUD.outlined(ctx, 'THE STORM SEA', W / 2, 120, 58, '#ffe066', TITLE, 0.15, 'center');
  HUD.outlined(ctx, "Malachar's storm blocks the way!", W / 2, 166, 28, '#f4e8ff', FONT, 0.24, 'center');
  HUD.outlined(ctx, "Man the Scarlet Dawn's cannons and pop the storm-bats!", W / 2, 204, 22, '#fff1d6', FONT, 0.24, 'center');
  HUD.outlined(ctx, 'The friendly kraken smashes the big waves.', W / 2, 232, 22, '#fff1d6', FONT, 0.24, 'center');
  HUD.outlined(ctx, 'A short bonus ride, about 90 seconds. Nobody can lose!', W / 2, 260, 22, '#ffe066', FONT, 0.24, 'center');
  const m = app.menu;
  const rows = [];
  if (m) m.items.forEach((it, i) => {
    const on = m.sel === i, y = 360 + i * 56, x0 = W / 2 - 230, x1 = W / 2 + 230;
    drawOfferRow(ctx, x0, y - 34, x1 - x0, 46, on, t);   // (a rounded gilt plaque; the chosen one lit, a small sun at its left: src/stages/sistorm.js)
    HUD.outlined(ctx, it.label, W / 2, y, 30, on ? '#ffe066' : '#fff1d6', FONT, 0.24, 'center');
    rows.push({ i, x0, x1, y0: y - 34, y1: y + 12 });
  });
  app._menuRows = rows;
  ctx.restore();
}
