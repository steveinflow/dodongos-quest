// Shared constants: the contract between the engine, the stage art and the HUD.
//
// The game renders into a fixed LOGICAL 960 x 540 frame; main.js scales it to the real canvas
// (devicePixelRatio aware) with ctx.setTransform(scale, 0, 0, scale, ox, oy) before any draw call.
//
// World space:  x = distance along the stage (0 .. STAGE_LEN), y = depth on the floor (0 = back edge,
// DEPTH = front edge), z = height above the floor (jumping).  An actor's feet land on the screen at
//   sx = x - camX,   sy = FLOOR_TOP + y - z
export const W = 960;
export const H = 540;
export const FLOOR_TOP = 362;          // screen y of the back edge of the walkable band (depth y = 0)
export const FLOOR_BOTTOM = 512;       // screen y of the front edge (depth y = DEPTH)
export const DEPTH = FLOOR_BOTTOM - FLOOR_TOP;
export const STAGE_LEN = 6400;         // world px; the camera runs 0 .. STAGE_LEN - W
export const FPS = 60;

// Stage sections (world x).  stage.js dresses them; level.js spawns the fights inside them.
export const SECTIONS = [
  { id: 'trail',   name: 'The Pine Trail',      x0: 0,    x1: 1600 },
  { id: 'bridge',  name: 'The Old Stone Bridge', x0: 1600, x1: 2900 },
  { id: 'village', name: 'The Clan Village',     x0: 2900, x1: 4600 },
  { id: 'gate',    name: 'The Dragon Gate',      x0: 4600, x1: 6400 },
];
// Camera locks (left edge of the locked screen).  The boss arena is the last screen.
export const ARENAS = [600, 1900, 3150, 4250, STAGE_LEN - W];

export const INK = '#21141c';          // outline colour for every drawn character / prop
// each player's colour (P1..P4): their HUD panel, the tag over their head, their select badge
export const PLAYER_COLS = ['#ffd23a', '#5ad0ff', '#8be86a', '#ff8ad0'];

// THE DEFAULT ART: false = the code rigs (3D sprites only with ?art3d=...); 'painted' = the painted 3D sprites for every
// character, no query needed (the shipped game).  Either way the query still picks for tests: ?art3d=painted (or any
// look), ?art3d=toon / ?art3d=1 = the toon atlases, ?art3d=0 = the code rigs, ?rig2=1 = Dodongo's 2D cut-out rig.
// ?artdefault=painted|0 overrides this switch for one session (soaks of the switch ON / OFF).
const DEFAULT_ART_SWITCH = 'painted';                         // <- the switch (final integration: 'painted')
export const DEFAULT_ART = (() => {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('artdefault') : null;
  if (q === null) return DEFAULT_ART_SWITCH;
  return q && q !== '0' && q !== 'false' ? q : false;
})();
/** the art this session uses: { on: 3D sprites at all, look: '' (toon) | 'painted' ..., all: every character (the
 * default) rather than the ?art3d test list, rig2: Dodongo's 2D rig } */
export const ART = (() => {
  const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
  const v = Q.get('art3d'), rig2 = Q.has('rig2');
  if (v !== null) {                                          // (an explicit ?art3d wins, as before)
    const on = v !== '0';
    const look = on && v !== '1' && v !== 'toon' && /^[a-z0-9_]+$/.test(v) ? v : '';
    return { on, look, all: false, rig2: rig2 && !on };
  }
  if (DEFAULT_ART && !rig2) return { on: true, look: DEFAULT_ART === true || DEFAULT_ART === 'toon' ? '' : DEFAULT_ART, all: true, rig2: false };
  return { on: false, look: '', all: false, rig2 };
})();

// SHOWCASE art (book-style painted, only where drift matters less; tools/sprite3d/wan/showcase.py + cutin.py,
// src/showcase.js): `select` = the painted hero-select loops, `cutin` = the super-move cut-ins.  false = off (the
// select cards draw the live sprite / code rig, the super fires without a cut-in).  ?showcase=0 turns both off.
const SHOWCASE_ON = { select: true, cutin: true };            // <- the switches
export const SHOWCASE = (() => {
  const off = typeof location !== 'undefined' && new URLSearchParams(location.search).get('showcase') === '0';
  return off ? { select: false, cutin: false } : SHOWCASE_ON;
})();
