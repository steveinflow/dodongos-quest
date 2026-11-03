// SKULL ISLAND's MAP (docs/SKULL_ISLAND.md, "Skull Island map (Ch4)"): after the Kraken, Malachar in his mirror and Scarlet's briefing
// (src/sistory.js si_map_mirror, si_map_brief), then this scene: a painted-style island map (src/stages/simap.js) with three glowing
// spots -- the Cave of Rage, the Swamp of Despair, the Cell of Sloth -- to pick in ANY order.  Each stage won gives one WEDGE of the Sun
// Key (a round gold disc in three pieces): the map shows the wedges won, the save and the level select keep them per wedge
// (meta.wedges = ['cave', ...], the quest's own meta), and once all three are won the palace path opens (stage 4, phase 3).
// This file is the logic (pure: nodes, wedges, the scene's input and its entry points on the app); the picture is the stage module.
import { loadMeta, writeMeta } from './save.js';
import { ALL_LEVELS } from './levels.js';
import { audio } from './audio-proxy.js';
import { treasureOpen } from './sisecrets.js';

/** the three wedge stages: id (the wedge), level (the stage's id in src/silevels.js), where on the 960x540 map, and a line for kids */
export const SI_NODES = [
  { id: 'cave', level: 'sicave', name: 'THE CAVE OF RAGE', x: 236, y: 318, blurb: 'Fire wolves in a lava cave. Stay CALM!' },
  { id: 'swamp', level: 'siswamp', name: 'THE SWAMP OF DESPAIR', x: 452, y: 408, blurb: 'Mist, grumpy trees... and a ring of fire.' },
  { id: 'cell', level: 'sicell', name: 'THE CELL OF SLOTH', x: 738, y: 340, blurb: 'Sticky slimes. Never give up!' },
];
/** the Treasure Room's spot (src/sisecrets.js): a gold chest on a sandbar in the sea, there once all five doubloons are found */
export const SI_TREASURE = { id: 'treasure', level: 'sitreasure', name: 'THE TREASURE ROOM', x: 124, y: 176, blurb: 'Captain Blunderbeard wants a REMATCH!' };
export const SI_PALACE = { id: 'palace', level: 'sipalace', name: 'THE SKULL PALACE', x: 490, y: 252, blurb: 'The Sun Key opens the gate!' };
/** the backdrops the story panels and the scene draw: the map, Malachar's mirror room (src/stages/simap.js, simirror.js) */
export const SI_MAP = { id: 'simap', name: 'SKULL ISLAND', stage: './stages/simap.js', standIn: ['#1b5a78', '#2a8aa0', '#2f6a3a'] };
export const SI_SUNKEY = { id: 'sisunkey', name: 'THE SUN KEY', stage: './stages/sisunkey.js', standIn: ['#1a1030', '#6a4a10', '#d8a820'] };
/** the finale's story-only backdrops: the campfire (si_campfire), the Palace of the Sun (si_epilogue), the three roads at sunset (si_epilogue's last picture, the end card's backdrop) */
export const SI_CAMP = { id: 'sicamp', name: 'THE CAMPFIRE', stage: './stages/sicamp.js', standIn: ['#0a0c26', '#3a2a5a', '#2a2438'] };
export const SI_SUN = { id: 'sisun', name: 'THE PALACE OF THE SUN', stage: './stages/sisun.js', standIn: ['#5ab0ee', '#e8f6fc', '#e8dcc0'] };
export const SI_ROADS = { id: 'siroads', name: 'THE THREE ROADS', stage: './stages/siroads.js', standIn: ['#5a4aa8', '#ffb070', '#4a7a3a'] };
/** the optional bonus ride after the Kraken: its sea (src/stages/sistorm.js, src/stormride.js) */
export const SI_STORM = { id: 'sistorm', name: 'THE STORM SEA', stage: './stages/sistorm.js', standIn: ['#1a0a30', '#6a2670', '#1a2a4a'] };
export const SI_MIRROR = { id: 'simirror', name: "MALACHAR'S MIRROR", stage: './stages/simirror.js', standIn: ['#1a0a2a', '#4a1a6a', '#2a1a3a'] };

const ALL_IDS = SI_NODES.map((n) => n.id);
/** the wedges won so far (the quest's own meta; any junk in it is ignored) */
export function siWedges(meta = loadMeta()) { return Array.isArray(meta.wedges) ? [...new Set(meta.wedges.filter((w) => ALL_IDS.includes(w)))] : []; }
export function addWedge(id) {
  const meta = loadMeta(), w = siWedges(meta);
  if (!ALL_IDS.includes(id) || w.includes(id)) return w;
  meta.wedges = [...w, id]; writeMeta(meta);
  return meta.wedges;
}
/** a node's stage is in the build (its level exists) */
export const nodeBuilt = (n) => ALL_LEVELS.some((L) => L.id === n.level);
/** every wedge is won: the palace path opens */
export const allWedges = (meta = loadMeta()) => siWedges(meta).length >= ALL_IDS.length;
/** the nodes in the order ◀ ▶ walks them (left to right), the palace in its place when it is open */
export function mapOrder(won = siWedges()) { return [...SI_NODES, ...(won.length >= ALL_IDS.length ? [SI_PALACE] : []), ...(treasureOpen() && nodeBuilt(SI_TREASURE) ? [SI_TREASURE] : [])].sort((a, b) => a.x - b.x); }

// ------------------------------------------------------------------------------------------------ the scene (on the app)
/** the scene starts (after the stories, or from CONTINUE / the title): the stage loaded, the first node under the cursor */
export async function openSiMap(app) {
  app.setScene('loading');
  const { stage } = (await app.loadStage(-1, SI_MAP)) || {};
  await Promise.race([stage?.ready?.() ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]);   // (the painted vista loads behind the LOADING card: no pop from the coded art -- at most 1.5 s)
  const won = siWedges(), ord = mapOrder(won), first = ord.findIndex((n) => !won.includes(n.id) && n.id !== 'treasure' && (n.id === 'palace' || nodeBuilt(n)));
  app.simap = { sel: Math.max(0, first), t: 0, won, said: '' };
  app.run.siMap = true;
  app.saveMap?.();
  audio.music('simap');   // (Book 2's island map theme: src/audio.js)
  app.setScene('simap');
}
/** one tick of the scene: ◀ ▶ (or ▲ ▼) move, confirm / attack sails to the node, back returns to the title */
export function stepSiMap(app) {
  const M = app.simap, pr = app._any.pressed;
  if (!M) return;
  M.t++;
  audio.ambience('map', { ttl: 0.6 });   // (surf and gulls under the map theme; it fades by itself when the map is left)
  const ord = mapOrder(M.won);
  const d = (pr.right || pr.down ? 1 : 0) - (pr.left || pr.up ? 1 : 0);
  if (d) { M.sel = (M.sel + d + ord.length) % ord.length; M.said = ''; audio.sfx('menu_move'); }
  if (pr.back && M.t > 20) { app.buildTitleMenu(); app.setScene('title'); audio.music('sititle'); return; }
  if ((pr.confirm || pr.attack || pr.start) && M.t > 20) {
    const n = ord[M.sel];
    if (n.id !== 'palace' && !nodeBuilt(n)) { audio.sfx('block'); M.said = 'That stage is not ready yet!'; M.saidAt = M.t; return; }
    if (n.id !== 'palace' && n.id !== 'treasure' && M.won.includes(n.id)) { audio.sfx('menu_select'); M.said = 'The wedge is yours! Pick another spot.'; M.saidAt = M.t; return; }
    audio.sfx('menu_select');
    app.siMapGo(n);
  }
  if (M.said && M.t - (M.saidAt ?? 0) > 200) M.said = '';
}
/** a tap on the map (src/main.js step): true = it counts as CONFIRM now.  A tap on a spot moves the ship there (the first tap) -- a second tap on the same
 * spot, or a tap on the name plate, sails; a tap anywhere else does nothing. */
export function simapTap(app, at) {
  const M = app.simap;
  if (!M || !at) return false;
  const ord = mapOrder(M.won);
  const hit = ord.findIndex((n) => ((at.x - n.x) / 78) ** 2 + ((at.y - n.y - 4) / 58) ** 2 <= 1);
  if (hit >= 0) { if (hit !== M.sel) { M.sel = hit; M.said = ''; audio.sfx('menu_move'); return false; } return true; }
  return at.x >= 150 && at.x <= 810 && at.y >= 452 && at.y <= 514;   // (the name plate)
}
/** the picture: the stage module draws the map and its overlay from this state */
export function drawSiMap(ctx, app) {
  const M = app.simap, st = app.stageOf(SI_MAP.id);
  if (!M || !st) { ctx.fillStyle = '#103a50'; ctx.fillRect(0, 0, 960, 540); return; }
  st.setMap?.({ sel: mapOrder(M.won)[M.sel]?.id, treasure: mapOrder(M.won).some((n) => n.id === 'treasure'), won: M.won, built: SI_NODES.filter(nodeBuilt).map((n) => n.id), said: M.said, t: M.t, palace: M.won.length >= ALL_IDS.length, done: !SI_NODES.some((n) => nodeBuilt(n) && !M.won.includes(n.id)) && M.won.length < ALL_IDS.length, touch: app.lastCtrl === 'touch', confirmKey: app.glyphText ? app.glyphText('confirm', app.lastCtrl === 'touch' ? 'kb' : app.lastCtrl) : 'ENTER', backKey: app.glyphText ? app.glyphText('back', app.lastCtrl === 'touch' ? 'kb' : app.lastCtrl) : 'ESC' });   // (backKey: the device's own back -- ESC, a pad's circle / B)
  st.drawBack(ctx, 0, app.time);
  st.drawFront?.(ctx, 0, app.time);
}
