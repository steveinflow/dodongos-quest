// SKULL ISLAND (Book Two) -- its own effect library: material hit bursts, the burst / splash / tease emitters the fights
// call, and the ambient life of every stage (dust in the lantern light, spray at the rail, rain splashes, ash, leaves,
// spores, drips, purple motes, fog wisps).  Book 2 only: the engine calls it under `L.si` (src/game.js World.step / render,
// src/player.js Player.landed); Book 1 and Book 3 never run a line of it.
//
// ONE pooled particle list (POOL slots, reused: no allocation in play, no canvases -- plain vector shapes in the game's
// inked look), world space like src/fx.js (x along the stage, y depth on the floor, z height).  Two layers:
//   'back'  -- drawn after the stage's back and BEFORE the floor telegraphs and the actors (src/game.js render): floor
//              decals (slime splats, ripples), rain splashes, spray behind the rail, wisps, the far motes.  A telegraph
//              ring is always on top of anything here.
//   'front' -- drawn over the actors with the fx: the hit bursts, and a few airborne ambient bits (dust, leaves, embers)
//              that are kept up off the floor band so they never sit on a ring.
// Flash safety: nothing here is a screen wash; glows are small additive dots.
//
// API (all world coordinates):
//   impact(g, target, x, y, z, hd, facing)   a hero's hit landed (Player.landed): the target's material burst; heavy
//                                            hits on a boss get +2 frames of hit-stop
//   burst(x, y, z, mat, opts)                a material bursting out (a tentacle through the planks, a lava spout, a root)
//   tease(x, y, mat)                         a few bits ahead of an attack (during its telegraph: call every few frames)
//   splash(x, y, mat, big)                   something hitting / leaving water or goo: a crown of drops + ripples
//   glints(x, y, z, n)  sparkles(x, y, z, n)  motes(x, y, z, n, col)
// Materials: wood, shell, squid, scale, ember, bark, slime, magic, rain, shadow, iron, chest, stone, mud, sea, cloth.
// An actor can name its own with `siMat`; else it comes from its `art` (MAT_ART) or its class (MAT_CLASS).
import { FLOOR_TOP, W, H } from './config.js';
import { CHARS } from './chars.js';   // (the rage wolf's landmarks: flameMane)

const TAU = Math.PI * 2;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const INK = '#21141c';
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

// ------------------------------------------------------------------------------------------------ the pool
const POOL = 560;
// kinds
const CHIP = 1, DROP = 2, EMBER = 3, MOTE = 4, LEAF = 5, PUFF = 6, SPLAT = 7, RIPPLE = 8, GLINT = 9, WISP = 10, STREAK = 11, ASH = 12, GOO = 13, ORB = 14, STAR = 15;
const LIGHTER = new Set([EMBER, GLINT]);   // (ORB: its halo is drawn additive inside drawP)   // (MOTE: per particle -- p.add)
const P = Array.from({ length: POOL }, () => ({ on: false }));
let cur = 0, alive = 0, ambN = 0, SZ = 1, FORCE_L = null, BUDGET = Infinity;   // (FORCE_L: a burst's layer forced (a stage-drawn target: behind the heroes); BUDGET: the particles this burst may still spawn)   // (SZ: a hit burst's size, set by impact() round its burst)
function spawn(o) {
  if (!o.amb) { if (BUDGET <= 0) return DUMMY; BUDGET--; }
  // the next free slot from the cursor; a full pool reuses the oldest-ish (the cursor's)
  let p = null;
  for (let i = 0; i < POOL; i++) { const q = P[(cur + i) % POOL]; if (!q.on) { p = q; cur = (cur + i + 1) % POOL; break; } }
  if (!p) { p = P[cur]; cur = (cur + 1) % POOL; if (p.amb) ambN--; if (p.k === SPLAT) splats--; alive--; }
  p.on = true; alive++;
  p.k = o.k; p.x = o.x; p.y = o.y; p.z = o.z || 0;
  p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0; p.g = o.g ?? 0; p.dr = o.dr ?? 1;
  p.t = 0; p.life = o.life || 30; p.s = (o.s || 4) * (o.amb ? 1 : SZ); p.s2 = o.s2 ? o.s2 * (o.amb ? 1 : SZ) : p.s; p.rot = o.rot ?? rnd(0, TAU); p.vr = o.vr || 0;
  p.c = o.c || '#fff'; p.c2 = o.c2 || null; p.a = o.a ?? 1; p.L = o.L ?? 1; p.b = o.b ?? 1; p.ph = o.ph ?? rnd(0, TAU);
  p.add = !!o.add; p.amb = !!o.amb; p.mat = o.mat || null;
  if (FORCE_L !== null && !o.amb) p.L = FORCE_L;
  if (p.amb) ambN++;
  return p;
}
const DUMMY = { on: false };   // (a spawn over the burst's budget: nothing)
function kill(p) { if (!p.on) return; p.on = false; alive--; if (p.amb) ambN--; if (p.k === SPLAT) splats--; }
/** (tests) CFG.off: the module does nothing -- the perf probe's A/B */
export const CFG = { off: false };
if (typeof window !== 'undefined') window.SIFX = { stats: () => stats(), CFG, burst: (...a) => burst(...a), splash: (...a) => splash(...a), tease: (...a) => tease(...a), rainSheet: (...a) => rainSheet(...a), impact: (...a) => impact(...a), glints: (...a) => glints(...a), sparkles: (...a) => sparkles(...a), flameMane: (...a) => flameMane(...a), flameManeBack: (...a) => flameManeBack(...a), bossBeat: (...a) => bossBeat(...a) };   // (tests: the gallery, the A/B probes)
export function reset() { for (const p of P) p.on = false; alive = 0; ambN = 0; splats = 0; kicks.length = 0; S.key = null; }
/** (tests) how many live, how many of them ambient */
export function stats() { return { alive, ambient: ambN, pool: POOL }; }

// ------------------------------------------------------------------------------------------------ materials
const MAT_ART = {
  sailor: 'cloth', blunderbeard: 'cloth', crab: 'shell', collarimp: 'magic', kraken: 'squid', kraken_tentacle: 'squid', leviathan: 'scale',
  ragewolf: 'ember', swamptree: 'bark', elder: 'bark', slothslime: 'slime', slime: 'slime', sadcloud: 'rain', fearshade: 'shadow', malachar: 'magic',
};
const MAT_CLASS = {
  Tentacle: 'squid', EyeTentacle: 'squid', Root: 'bark', RageBeast: 'ember', RageAlpha: 'ember', ElderTree: 'bark', SwampTree: 'bark', SlothSlime: 'slime', SlothBeast: 'slime',
  SlothLump: 'slime', BarGate: 'iron', DoubloonChest: 'chest', PuffFish: 'scale', LeviHead: 'scale', Leviathan: 'scale', Kraken: 'squid', SadCloud: 'rain', FearShade: 'shadow',
  Malachar: 'magic', CollarImp: 'magic', StormCrab: 'shell', Sailor: 'cloth', Blunderbeard: 'cloth', BlunderbeardRematch: 'cloth',
};
export function matOf(t) { return (t && (t.siMat || MAT_ART[t.art] || MAT_CLASS[t.constructor?.name])) || null; }

const COL = {
  wood: ['#c8945a', '#a8743e', '#e2b77c', '#8a5a2e'], bark: ['#5a3a22', '#7a5230', '#3e2818', '#6a4a2a'], leaf: ['#4a7a2a', '#6a9a3a', '#3a6a2a', '#8aae4a'],
  shell: ['#4f7090', '#86a8c4', '#e88a6a', '#36506a'], scale: ['#2f9a8c', '#6ad0c0', '#1f6a62'], stone: ['#8a8496', '#b4aebc', '#5e5868'], iron: ['#6a6a74', '#9a9aa4'],
  water: ['#bfe6ff', '#e8f8ff', '#8ccaf0'], ink: ['#7a3aa8', '#a85ad0', '#5a2a80'], slime: ['#9ad86a', '#b8f08a', '#74b84e'], mud: ['#4a4239', '#5e564c', '#2f2a25'],   /* (the bog's mud: cool dark grey-browns -- a warm 'potato' brown read as pebbles on the swamp roots) */
  ember: ['#ffd27a', '#ffb03a', '#ff7a2a'], lava: ['#ff8a2a', '#ffc04a', '#ff5a1a'], magic: ['#d070ff', '#f0a8ff', '#a050e8'], gold: ['#ffe27a', '#ffc23a', '#fff4c0'], dust: ['#efe6da', '#d8cfc2'],
};

// ------------------------------------------------------------------------------------------------ emitters
/** a material's bits, each drawn in its own shape (QAF3: no flat-coloured squares) -- o.shape: 'splinter' (wood: tapered, a
 *  broken end and a point, shaded, its grain; the default with o.long), 'stone' (a shaded faceted chip), 'bark' (a flatter shaded
 *  chip with a grain line), 'metal' (a shaded flake with a bright stripe), 'curve' (a scale's curved glint), 'fan' (a shell's ridged
 *  fan fragment), 'coin' */
function chips(x, y, z, n, cols, o = {}) {
  const dir = o.dir || 0, sp = o.sp || 1, long = o.long || 0, shape = o.shape || (long ? 'splinter' : 'stone');
  for (let i = 0; i < n; i++) {
    const a = rnd(-0.9, 0.9) + (dir < 0 ? Math.PI : 0), v = rnd(2.5, 7) * sp;
    const s = long ? rnd(15, 25) : shape === 'curve' ? rnd(9, 13) : shape === 'fan' ? rnd(9, 12) : shape === 'coin' ? rnd(10, 13) : o.big ? rnd(10, 14) : rnd(7, 12);
    const s2 = long ? rnd(3.6, 5.2) : shape === 'bark' ? rnd(4, 6) : o.big ? rnd(8, 11) : rnd(4.8, 8);
    spawn({ k: CHIP, x: x + rnd(-8, 8), y: y + rnd(-4, 4), z: z + rnd(-10, 10), vx: dir ? Math.cos(a) * v : rnd(-1, 1) * v, vy: rnd(-0.6, 0.6), vz: rnd(3, 7) * sp,
      g: 0.42, dr: 0.98, life: shape === 'curve' ? rnd(22, 32) : rnd(36, 54), s, s2, vr: rnd(-0.35, 0.35), c: pick(cols), b: 2, L: 1, mat: shape });   // (scale glints go sooner: a fight's worth lay about the deck like leaves)
  }
}
function drops(x, y, z, n, cols, o = {}) {
  const dir = o.dir || 0, sp = o.sp || 1;
  for (let i = 0; i < n; i++) {
    const v = rnd(2, 5.5) * sp;
    spawn({ k: o.goo ? GOO : DROP, x: x + rnd(-8, 8), y: y + rnd(-3, 3), z: z + rnd(-8, 8), vx: dir ? dir * rnd(0.3, 1) * v : rnd(-1, 1) * v, vy: rnd(-0.4, 0.4), vz: rnd(2.5, 6.5) * sp,
      g: o.goo ? 0.5 : 0.36, dr: 0.985, life: o.goo ? rnd(24, 34) : rnd(32, 48), s: o.goo ? rnd(5, 8.5) / Math.sqrt(SZ) : o.small ? rnd(1.8, 2.8) : rnd(3, 5), c: pick(cols), mat: o.mat || null, L: 1 });   // (goo: grows only sqrt(SZ) -- big blobs read as a pile)
  }
}
/** a fine spray of water: small pale droplets flung up and out, and a soft mist puff */
function spray(x, y, z, n, dir = 0) {
  drops(x, y, z + 6, n * 2, ['#e8f8ff', '#ffffff', '#cfeeff'], { dir, mat: 'water', sp: 1.25, small: 1 });
  puffs(x, y, z + 4, 1, ['#eaf6ff'], { dir, size: 0.9, a: 0.45 });
}
function embers(x, y, z, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), v = rnd(1, 3.6) * (o.sp || 1);
    spawn({ k: EMBER, x: x + rnd(-8, 8), y: y + rnd(-3, 3), z: z + rnd(-8, 8), vx: Math.cos(a) * v, vy: 0, vz: Math.abs(Math.sin(a)) * v + rnd(0.4, 1.4) + (o.hot ? 0.8 : 0), g: o.hot ? -0.05 : -0.02, dr: 0.95,
      life: o.hot ? rnd(16, 30) : rnd(28, 48), s: rnd(2.4, 4.2) * (o.size || 1) * (o.hot ? rnd(0.7, 1.25) : 1), c: pick(COL.ember), L: o.L ?? 1, mat: o.hot ? 'hot' : null });   // (hot: a hit's embers -- they rise, vary in size and fade out still bright: QAF3 critic, red dots cooling on a red wolf read as spots)
  }
}
function puffs(x, y, z, n, cols, o = {}) {
  for (let i = 0; i < n; i++) {
    spawn({ k: PUFF, x: x + rnd(-10, 10), y: y + rnd(-3, 3), z: z + rnd(-6, 10), vx: (o.dir || 0) * rnd(0.4, 1.4) + rnd(-0.6, 0.6), vz: rnd(0.2, 1.1), dr: 0.93,
      life: rnd(22, 34), s: rnd(8, 14) * (o.size || 1), c: pick(cols), a: o.a ?? 0.85, L: o.L ?? 1 });
  }
}
function moteBurst(x, y, z, n, cols, add = true) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), v = rnd(1.4, 4);
    spawn({ k: MOTE, x, y: y + rnd(-3, 3), z: z + rnd(-6, 6), vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.8 + 0.4, dr: 0.92, life: rnd(28, 44), s: rnd(3, 5), c: pick(cols), add, L: 1 });
  }
}
/** inked glowing beads bursting out (magic: violet; shadow: a dark core with a pale rim) */
function orbs(x, y, z, n, c, c2, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), v = rnd(1.6, 4.4);
    spawn({ k: ORB, x: x + Math.cos(a) * 10, y: y + rnd(-3, 3), z: z + Math.sin(a) * 8, vx: Math.cos(a) * v + (o.dir || 0) * 1.2, vz: Math.sin(a) * v * 0.8 + 0.6, dr: 0.92, life: rnd(26, 40), s: rnd(3.2, 5.4) * (o.size || 1), c, c2, L: 1, mat: o.core ? 'core' : null });
  }
}
/** comic stars spinning off a big hit (the sailors, the captain: they see stars) */
function stars(x, y, z, n, dir = 0) {
  for (let i = 0; i < n; i++) spawn({ k: STAR, x: x + rnd(-10, 10), y, z: z + rnd(10, 30), vx: (dir || (Math.random() < 0.5 ? -1 : 1)) * rnd(0.8, 2.2), vz: rnd(2.4, 3.8), g: 0.16, dr: 0.98, life: rnd(30, 40), s: rnd(6, 8.5), vr: rnd(-0.25, 0.25), c: '#ffe066', L: 1 });
}
/** a ring of dust puffs blown out from the hit (a body hit: the sailors' coats, the captain) */
function dustRing(x, y, z, n, size = 1) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd(-0.2, 0.2), v = rnd(2, 3) * size;
    spawn({ k: PUFF, x: x + Math.cos(a) * 9 * size, y, z: z + Math.sin(a) * 7 * size, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.7 + 0.4, dr: 0.88, life: rnd(18, 26), s: rnd(8, 12) * size, c: pick(COL.dust), a: 0.9, L: 1 });   // (already a ring on its first frame: it shows through the hit-stop)
  }
}
function leaves(x, y, z, n, o = {}) {
  for (let i = 0; i < n; i++) {
    spawn({ k: LEAF, x: x + rnd(-10, 10), y, z: z + rnd(0, 20), vx: (o.dir || 0) * rnd(0.5, 2) + rnd(-1, 1), vz: rnd(1, 3.5), g: 0.12, dr: 0.97, life: rnd(50, 80),
      s: rnd(5, 8.5), c: pick(COL.leaf), ph: rnd(0, TAU), L: o.L ?? 1, amb: !!o.amb });
  }
}
function streaks(x, y, z, n, col, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd(-1.1, 1.1) + ((o.dir || 1) < 0 ? Math.PI : 0), v = rnd(4, 8);
    spawn({ k: STREAK, x, y, z, vx: Math.cos(a) * v * 1.2, vz: Math.sin(a) * v * 1.2 + 2.5, g: 0.3, dr: 0.94, life: rnd(12, 20), s: o.fire ? 2.6 : 3.4, c: col, L: 1, mat: o.fire ? 'fire' : null });
  }
}
/** a cartoon's sweat drops flying off a big hit (the sailors, the captain) */
function sweat(x, y, z, n, dir) {
  for (let i = 0; i < n; i++) spawn({ k: DROP, x: x + rnd(-8, 8), y, z: z + rnd(0, 16), vx: (dir || (Math.random() < 0.5 ? -1 : 1)) * rnd(1.2, 2.8), vz: rnd(3.2, 4.8), g: 0.3, dr: 0.99, life: rnd(28, 36), s: rnd(4, 5.5), c: '#a8e2ff', a: 1, L: 1, mat: 'sweat' });
}
function glintAt(x, y, z, o = {}) { spawn({ k: GLINT, x, y, z, life: o.life || rnd(18, 28), s: o.s || rnd(5, 9), c: o.c || '#fff4c0', L: o.L ?? 1, amb: !!o.amb, a: o.a ?? 1, vz: o.vz || 0 }); }
function ripple(x, y, s, o = {}) { spawn({ k: RIPPLE, x, y, z: 0, life: o.life || 22, s, c: o.c || 'rgba(220,240,255,A)', a: o.a ?? 0.7, L: 0, amb: !!o.amb }); }
let splats = 0;   // (live floor splats: a mashed slime never paints the floor green -- at most MAX_SPLAT)
const MAX_SPLAT = 7;
function splat(x, y, s, c) { if (splats >= MAX_SPLAT) return; splats++; spawn({ k: SPLAT, x, y, z: 0, life: 56, s, s2: s * rnd(0.36, 0.48), c, rot: rnd(0, TAU), L: 0 }); }

/** a material bursting out of something (n: scale of the burst, 1 = a hit's worth) */
export function burst(x, y, z, mat, o = {}) {
  const k = o.k ?? 1, dir = o.dir || 0, n = (m) => Math.max(1, Math.round(m * k * (REDUCED ? 0.6 : 1)));
  switch (mat) {
    case 'wood': chips(x, y, z, n(6), COL.wood, { dir, long: 1 }); puffs(x, y, z, n(2), COL.dust, { dir, size: 0.8, a: 0.7 }); break;
    case 'chest': chips(x, y, z, n(3), COL.wood, { dir, long: 1 }); for (let i = 0; i < n(3); i++) glintAt(x + rnd(-18, 18), y, z + rnd(0, 30)); chips(x, y, z, n(4), COL.gold, { dir, shape: 'coin' }); break;   // (gold coins you can see among the splinters: 4, bigger)
    case 'bark': chips(x, y, z, n(5), COL.bark, { dir, shape: 'bark' }); leaves(x, y, z + 10, n(2), { dir }); break;
    case 'shell': chips(x, y, z, n(5), ['#a8c4dc', '#f0a88a', '#d6e6f2'], { dir, shape: 'fan' }); drops(x, y, z, n(5), COL.water, { dir, mat: 'water' }); break;
    case 'squid': drops(x, y, z, n(6), COL.water, { dir, mat: 'water' }); drops(x, y, z, n(2), COL.ink, { dir, goo: true, mat: 'ink' }); break;
    case 'scale': chips(x, y, z, n(2), COL.scale, { dir, shape: 'curve' }); glintAt(x, y, z + 10, { c: '#e8fffa', s: 9, life: 14 }); drops(x, y, z, n(6), COL.water, { dir, mat: 'water' }); spray(x, y, z, n(3), dir); break;   // (curved scale glints, droplets and a little spray -- QAF3: flat teal squares read as confetti)
    case 'sea': drops(x, y, z, n(14), COL.water, { sp: 1.3, mat: 'water' }); puffs(x, y, z, n(3), ['#f4fbff', '#d8eefa'], { size: 1.3, a: 0.6 }); ripple(x, y, 28); ripple(x, y, 16, { life: 30 }); break;
    case 'ember': embers(x, y, z, n(12), { sp: 1.3, size: 1.3, hot: 1 }); streaks(x, y, z, n(5), '#ffb43a', { dir: dir || 1, fire: 1 }); glintAt(x, y, z, { c: '#ffe9a0', s: 10, life: 10 }); puffs(x, y, z, n(2), ['#4a3436', '#5e4440'], { dir, size: 0.8, a: 0.3 }); break;   // (fire: glowing embers, hot sparks and a wisp of soot -- QAF3: the inked orange lava chips read as confetti on a fire wolf; dark ash chips read as rocks on the cave floor)
    case 'slime': drops(x, y, z, n(4), COL.slime, { dir, goo: true, mat: 'slime' }); break;
    case 'mud': drops(x, y, z, n(5), COL.mud, { dir, goo: true, mat: 'mud', sp: 0.7 }); puffs(x, y, z, n(2), ['#8e9a8c', '#a7b0a2'], { size: 1.1, a: 0.45 }); break;   // (low, fewer, a green-grey mist: a bursting root never hides the hero)
    case 'magic': orbs(x, y, z, n(8), '#ff8ae0', '#2a0848', { dir, size: 1.3 }); orbs(x, y, z, n(3), '#fff0a8', '#5a2a08', { dir, size: 0.9 }); break;   // (pale pink beads and a few gold ones, each inked dark: they part from a violet room and robe; no white disc)   // (inked violet beads: bare motes vanished on Malachar's robe)
    case 'rain': drops(x, y, z, n(7), COL.water, { dir, mat: 'water' }); puffs(x, y, z, n(2), ['#cfe2f4', '#b8cfe6'], { dir, a: 0.7 }); break;
    case 'shadow': puffs(x, y, z, n(4), ['#2e2040', '#43345a'], { dir, a: 0.7, size: 1.1 }); orbs(x, y, z, n(4), '#ffe066', '#3a2a10', { dir, size: 0.7 }); break;   // (inky smoke the yellow FEAR leaks out of)   // (dark beads with a pale rim)
    case 'iron': streaks(x, y, z, n(7), '#ffd27a', { dir: dir || 1, fire: 1 }); glintAt(x, y, z, { c: '#f4fbff', s: 11, life: 12 }); chips(x, y, z, n(3), COL.iron, { dir, shape: 'metal' }); break;   // (CLANG: short hot sparks and steel flakes -- white rods read as sticks: QAF3 critic)   // (CLANG: hot sparks off the metal)
    case 'stone': chips(x, y, z, n(5), COL.stone, { dir, shape: 'stone' }); puffs(x, y, z, n(2), ['#cfc8d4', '#b8b0c0'], { dir, a: 0.75 }); break;
    case 'cloth': dustRing(x, y, z, n(3), k >= 2 ? 0.85 : 0.7); sweat(x, y, z + 20, n(k >= 1.2 ? 4 : 2), dir); if (k >= 1.2) stars(x, y, z + 30, n(2), dir); break;   // (a body hit: dust blown off the coat, cartoon sweat, stars on the big ones)
    default: break;
  }
}
/** a few bits ahead of an attack, from under the floor (call every ~6-10 frames during a telegraph): crack dust and
 * splinters for 'wood', bubbles and embers for 'ember', mud for 'mud', goo for 'slime' */
export function tease(x, y, mat) {
  const xx = x + rnd(-26, 26), yy = y + rnd(-6, 6);
  if (mat === 'wood') { chips(xx, yy, 2, 1, COL.wood, { sp: 0.55, long: 1 }); puffs(xx, yy, 0, 1, COL.dust, { size: 0.7, a: 0.55, L: 0 }); }
  else if (mat === 'ember') embers(xx, yy, 2, 2, { sp: 0.6 });
  else if (mat === 'mud' || mat === 'bark') { drops(xx, yy, 2, 1, COL.mud, { sp: 0.5, goo: true, mat: 'mud' }); puffs(xx, yy, 0, 1, ['#6a5a44'], { size: 0.7, a: 0.5, L: 0 }); }
  else if (mat === 'slime') drops(xx, yy, 2, 1, COL.slime, { sp: 0.5, goo: true, mat: 'slime' });
  else if (mat === 'sea' || mat === 'water') ripple(xx, yy, rnd(8, 14), { life: 18 });
  else if (mat === 'magic') moteBurst(xx, yy, 6, 1, COL.magic);
}
/** water or goo: a crown of drops and ripples (big: a leviathan, a beast rising) */
export function splash(x, y, mat = 'sea', big = false) {
  const k = big ? 2 : 1;
  if (mat === 'slime' || mat === 'mud') { drops(x, y, 6, Math.round(8 * k), mat === 'slime' ? COL.slime : COL.mud, { sp: big ? 1.4 : 1, goo: true, mat }); splat(x, y, 26 * k, mat === 'slime' ? COL.slime[2] : COL.mud[0]); return; }
  drops(x, y, 4, Math.round(10 * k), COL.water, { sp: big ? 1.5 : 1, mat: 'water' });
  puffs(x, y, 8, Math.round(2 * k), ['#f4fbff', '#d8eefa'], { size: big ? 1.6 : 1, a: 0.55 });
  ripple(x, y, 22 * k); ripple(x, y, 12 * k, { life: 30 });
}
export function glints(x, y, z, n = 4) { for (let i = 0; i < n; i++) glintAt(x + rnd(-24, 24), y + rnd(-4, 4), z + rnd(-10, 30), { life: rnd(20, 34) }); }
/** rainbow sparkles (the Sad Cloud's rainbow, a kraken pal) */
export function sparkles(x, y, z, n = 6) {
  const R = ['#ff6a6a', '#ffb03a', '#ffe066', '#7ae070', '#6ac8ff', '#b07aff'];
  for (let i = 0; i < n; i++) glintAt(x + rnd(-40, 40), y + rnd(-4, 4), z + rnd(-10, 50), { c: R[i % R.length], s: rnd(5, 8), vz: rnd(0.2, 0.8), life: rnd(24, 40) });
}
export function motes(x, y, z, n = 6, col = 'magic') { moteBurst(x, y, z, n, COL[col] || [col], true); }

// ------------------------------------------------------------------------------------------------ a hero's hit
// a boss's recoil: pushed back along the hit (px by step: snaps out, eases home over 9 steps); stepped with the
// particles, so it holds through the hit-stop -- the classic freeze-frame with the target knocked back
const KICK = [0, 12, 11, 9, 7, 5, 3.4, 2, 0.8];   // (px: a heavy hit's push; a light one is 0.55 of it)
const SQUASH = [0, 0.07, 0.06, 0.045, 0.03, 0.018, 0.008, 0, 0];   // (the hit squashes the boss down and wide for a few steps)
const kicks = [];
function kick(a, dir, amp) {
  const k = kicks.find((q) => q.a === a);
  if (k) { k.n = 1; k.dir = dir; k.amp = Math.max(amp, k.n < 4 ? k.amp : 0); return; }
  if (kicks.length < 8) kicks.push({ a, n: 1, dir, amp });
}
/** World.render (L.si): the x offset to draw this actor at (0: none) */
export function kickOf(a) {
  if (!kicks.length || REDUCED || CFG.off) return 0;
  const k = kicks.find((q) => q.a === a);
  return k ? k.dir * KICK[Math.min(KICK.length - 1, k.n)] * k.amp : 0;
}
/** World.render (L.si): the squash to draw this actor with (0: none) -- y scale 1 - q, x scale 1 + q, from its feet */
export function squashOf(a) {
  if (!kicks.length || REDUCED || CFG.off) return 0;
  const k = kicks.find((q) => q.a === a);
  return k ? SQUASH[Math.min(SQUASH.length - 1, k.n)] * k.amp : 0;
}
const S = { at: {}, key: null, w: null };
/** Player.landed (Book 2 only): the target's material burst at the spark, rate-limited per target (a beam ticks every
 * frame, a super hits many times); a heavy hit on a boss gets +2 frames of hit-stop */
export function impact(g, t, x, y, z, hd, facing = 1) {
  if (CFG.off) return;
  const mat = matOf(t);
  // (a heavy hit on a boss lands harder: +3 frames of hit-stop -- +2 with three or four heroes -- at most one bonus in 20
  //  frames, so a mashing 4P party never stutters)
  if (t?.boss && (hd.kind === 'knock' || hd.crit) && !hd.special && g.frame - (t._sifxStopAt ?? -99) >= 20) {
    t._sifxStopAt = g.frame;
    g.hitstop = Math.max(g.hitstop, Math.min(10, (hd.stop || 4) + (g.players.filter((q) => !q.out).length > 2 ? 2 : 3)));
  }
  if (t?.boss) kick(t, facing || 1, t.art === 'elder' ? 0.3 : hd.kind === 'knock' || hd.crit ? 1 : 0.55);   // (the Elder: a great rooted tree only shudders)   // (the boss recoils from every hit: World.render draws it pushed back, easing home)
  if (!mat) return;
  for (let i = g.fx.list.length - 1, m = 0; i >= 0 && m < 12; i--, m++) { const q = g.fx.list[i]; if (q.type === 'spark' && q.t === 0 && !q._sifx) { q.r *= 0.68; q._sifx = 1; break; } }   // (the engine's white star shrinks under the material -- on every material hit)
  const last = t._sifxAt ?? -99;
  if (g.frame - last < (hd.special || hd.hit === false ? 10 : 5)) return;   // (a super's many hits, a beam's ticks: one burst in 10 frames)
  t._sifxAt = g.frame;
  const heavy = hd.kind === 'knock' || hd.crit, dir = facing || 1;
  // (a boss that shrugged it off -- the Elder's bark: no hurt this frame -- the bits fly back at the hitter: a THUD)
  const shrug = t.art === 'elder' && t.hurtAt !== g.frame;
  // (the material IS the hit: ~1.45x size, ~1.8x count of a plain burst -- 3-4 heroes mashing get 3/4 of it; the pool of
  //  POOL slots reuses the oldest, so a mash can never grow it.  The engine's generic white star shrinks under it.)
  // (a per-TARGET budget shared by every hitter -- a leaky bucket: up to 26 bits at once, refilling 0.7 a frame -- so three
  //  heroes mashing one Kraken head or the Sloth Beast get a first big burst and then a steady trickle, never a pile of blobs)
  const now = g.frame, bud = Math.min(24, (t._sifxBud ?? 24) + (now - (t._sifxBudAt ?? now)) * 0.45);
  if (bud < 3) return;
  const crowd = g.players.filter((q) => !q.out).length > 2 ? 0.75 : 1;
  SZ = hd.special ? 1.15 : 1.45; BUDGET = Math.floor(bud);
  FORCE_L = t.art === 'kraken' ? 0 : null;   // (the Kraken's head is drawn by the stage, behind the rail: its bits go in the back layer, behind the heroes)
  burst(x, y, z, mat, { k: (heavy ? 2.3 : 1.5) * (hd.special ? 0.5 : 1) * (t.boss ? 1.1 : 1) * crowd, dir: shrug ? -dir : dir });
  t._sifxBud = BUDGET; t._sifxBudAt = now;
  SZ = 1; FORCE_L = null; BUDGET = Infinity;
  if (shrug) ripple(t.x + (x > t.x ? 40 : -40), t.y, 30, { c: 'rgba(60,40,30,A)', a: 0.5, life: 16 });
}

// ------------------------------------------------------------------------------------------------ ambient life
// per stage (L.id) and section (the screen's middle, world x): a cap of live ambient bits and what to spawn now.  The
// stages' own live layers stay theirs (the cave's embers and lava falls, the cell's drips, the swamp's fireflies, the
// palace's sparks); these add what the audit found missing (docs/SI_POLISH.md, review/si_aa_fx/audit).
// the stage's own spots (stage.ambientSpots(camX), the stage builder's: [{ kind, x0, x1, y } | { kind, x, y, w }], y in
// screen px) -- refreshed every 10 frames; a stage without it: section-wide placement
let spotsAt = -99, spotsKey = null, spotsL = [];
function spotsOf(w, f) {
  if (f - spotsAt >= 10 || spotsKey !== S.key) { spotsAt = f; spotsKey = S.key; try { spotsL = w.stage?.ambientSpots?.(w.camX) || []; } catch { spotsL = []; } }
  return spotsL;
}
const zOf = (sy, y = 0) => FLOOR_TOP + y - sy;   // (a screen y over the floor's back edge, as a height)
const AMB = {
  sibluegull(w, cx, f) {
    const sp = spotsOf(w, f);
    if (cx < 2450) {   // the cabin and the stairs: dust in the lantern / window light, and now and then the ship creaks and dust sifts down
      if (ambN < 22 && f % 5 === 0) {
        const ts = sp.filter((q) => q.kind === 'torch'), t = ts.length && Math.random() < 0.7 ? pick(ts) : null;
        const ls = (w.L?.lanterns || []).filter((l) => Math.abs(l.x - cx) < 560), l = !t && ls.length && Math.random() < 0.6 ? pick(ls) : null;
        const x = t ? t.x + rnd(-80, 80) : l ? l.x + rnd(-90, 90) : w.camX + rnd(0, W), z = t ? zOf(t.y) + rnd(-70, 60) : l ? rnd(110, 250) : rnd(120, 300);
        spawn({ k: MOTE, x, y: rnd(-10, 30), z, vx: rnd(-0.15, 0.15), vz: rnd(-0.1, 0.12), life: rnd(160, 260), s: rnd(1.8, 3), c: '#ffe6b8', a: 0.8, add: true, L: 0, amb: true });
      }
      if (f % 240 === 120) { const x = w.camX + rnd(120, W - 120); for (let i = 0; i < 10; i++) spawn({ k: ASH, x: x + rnd(-40, 40), y: rnd(0, 20), z: rnd(300, 330), vx: rnd(-0.1, 0.1), vz: rnd(-0.7, -0.35), g: 0.012, life: rnd(110, 150), s: rnd(2.2, 3.2), c: '#f0e2c2', a: 0.9, L: 1, amb: true }); }
    } else if (cx < 4700) {   // the night deck: spray over the rail, glints on the sea (its band: screen y ~244-284)
      seaSpray(w, f, 80, sp);
      if (ambN < 20 && f % 5 === 0) glintAt(w.camX + rnd(0, W), -30, rnd(48, 86), { L: 0, amb: true, s: rnd(4, 7), c: '#eef6ff', life: rnd(26, 44), a: 0.9 });
    } else {   // the dawn fog: wisps drifting across behind the heroes -- kept above the deck's back edge (screen y < ~352: z 70-150), never at leg height in the captain's fight
      wisps(w, f, '#fbeef4', 0.16, 70, 150);
      seaSpray(w, f, 160, sp);
    }
  },
  sikraken(w, cx, f) { const sp = spotsOf(w, f); rainDeck(w, f, sp); seaSpray(w, f, 90, sp); },
  sitreasure(w, cx, f) { const sp = spotsOf(w, f); rainDeck(w, f, sp); seaSpray(w, f, 110, sp); },
  sicave(w, cx, f) {
    if (cx >= 1400) return;   // (the cavern's embers, falls and steam are the stage's own)
    if (ambN < 30 && f % 6 === 0) {   // the mouth: pale ash drifting down out of the cave's breath, each flake rimmed (it reads on the green light and the grey rock)
      spawn({ k: ASH, x: w.camX + rnd(0, W + 160), y: rnd(-10, 40), z: rnd(240, 370), vx: rnd(-0.55, -0.2), vz: rnd(-0.55, -0.25), g: 0, life: rnd(220, 320), s: rnd(2.6, 4.2), c: pick(['#f4ecf0', '#e2d8e4', '#fff4e6']), a: 0.95, vr: rnd(-0.06, 0.06), L: 1, amb: true });
    }
    const dl = spotsOf(w, f).find((q) => q.kind === 'daylight');
    if (dl && ambN < 34 && f % 5 === 0) {   // dust turning in the daylight at the mouth
      spawn({ k: MOTE, x: rnd(Math.max(dl.x0, w.camX - 40), Math.min(dl.x1, w.camX + W + 40)), y: rnd(-10, 40), z: zOf(dl.y) + rnd(-90, 120), vx: rnd(0.05, 0.25), vz: rnd(-0.08, 0.1), life: rnd(160, 240), s: rnd(1.8, 3), c: '#fffbe0', a: 0.85, add: true, L: 0, amb: true });
    }
  },
  siswamp(w, cx, f) {
    if (ambN < 16 && f % 11 === 0) leaves(w.camX + rnd(-40, W + 40), rnd(-10, 40), rnd(300, 360), 1, { amb: true, L: 1, dir: -0.4 });   // (falling leaves: they fade out before the floor band)
    if (ambN < 30 && f % 5 === 0) spawn({ k: MOTE, x: w.camX + rnd(0, W), y: rnd(-20, 30), z: rnd(60, 280), vx: rnd(-0.2, 0.2), vz: rnd(0.05, 0.25), life: rnd(140, 220), s: rnd(1.8, 2.8), c: '#dcffb8', a: 0.7, add: true, L: 0, amb: true });   // spores
  },
  sicell(w, cx, f) {
    if (ambN < 24 && f % 5 === 0) {   // dust in the torch light, near the torches (the pillars: world x every 260 / 340 / ~290 px)
      const tx = torchNear(cx + rnd(-480, 480));
      if (tx !== null) spawn({ k: MOTE, x: tx + rnd(-40, 40), y: rnd(-24, -6), z: rnd(140, 240), vx: rnd(-0.12, 0.12), vz: rnd(0.08, 0.3), life: rnd(120, 200), s: rnd(1.8, 2.8), c: '#ffdca8', a: 0.8, add: true, L: 0, amb: true });
    }
    if (!REDUCED && ambN < 28 && f % 40 === 0) spawn({ k: WISP, x: w.camX + rnd(-100, W + 100), y: rnd(10, 120), z: rnd(-4, 16), vx: rnd(-0.45, -0.25), life: 900, s: rnd(110, 170), s2: rnd(14, 22), c: 'rgba(180,210,170,A)', a: 0.12, L: 0, amb: true });   // the yawn fog's low wisps
  },
  sipalace(w, cx, f) {
    if (ambN < 30 && f % 5 === 0) spawn({ k: MOTE, x: w.camX + rnd(0, W), y: -30, z: rnd(70, 200), vx: rnd(-0.2, 0.2), vz: rnd(0.25, 0.55), life: rnd(160, 240), s: rnd(1.2, 2), c: pick(['#d878ff', '#f4b0ff', '#a868f4']), a: 0.5, add: false, L: 0, amb: true });   // purple motes rising up the back wall (small, half alpha, no glow, above the fighters' lane: bright ones read as pickups -- the palace's stage critic)
    if (cx < 1900) wisps(w, f, '#9a6ac8', 0.14, 200, 300);   // the approach: storm cloud drifting over the skull
  },
};
function torchNear(x) {
  const xs = x < 1700 ? 90 + Math.round((x - 90) / 260) * 260 : x < 3800 ? 1840 + Math.round((x - 1840) / 340) * 340 : [3900, 4180, 4460, 4740, 5060, 5340].reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  return xs >= 0 && xs <= 5400 ? xs : null;
}
/** a wave slapping the hull: drops thrown up over the rail and falling back (fast, small, streaked -- not bubbles) and a
 * puff of spray; at the stage's rail spot when it has one */
function seaSpray(w, f, every, sp = []) {
  if (f % every !== (every >> 1)) return;
  const rails = sp.filter((q) => q.kind === 'rail'), r = rails.length ? pick(rails) : null;
  const x = r ? w.camX + rnd(Math.max(40, r.x0 - w.camX), Math.min(W - 40, r.x1 - w.camX)) : w.camX + rnd(60, W - 60), z0 = r ? zOf(r.y, -36) : 70, n = REDUCED ? 6 : 12;
  if (r && r.x1 - r.x0 < 60) return;
  for (let i = 0; i < n; i++) spawn({ k: DROP, x: x + rnd(-36, 36), y: -36, z: z0 + rnd(-6, 6), vx: rnd(-1, 1), vz: rnd(4, 6.6), g: 0.32, dr: 0.99, life: rnd(26, 36), s: rnd(1.5, 2.6), c: pick(COL.water), a: 0.9, L: 0, amb: true });
}
/** rain splashes on the deck: a ring and a little crown of drops, behind everything (never on the stage's own puddles) */
function rainDeck(w, f, sp = []) {
  // (storm lilac, at most 0.5 alpha, smaller toward the back of the lane: the stage's critics found pure-white splashes the
  //  brightest marks on the deck, read as pearls next to the pickups' glints; the stage's own live rings cover its puddles)
  if (ambN > 40 || f % (REDUCED ? 6 : 3) !== 0) return;
  const x = w.camX + rnd(0, W), y = rnd(4, 146), sy = FLOOR_TOP + y, d = 0.6 + 0.4 * (y / 146);
  if (sp.some((q) => q.kind === 'puddle' && Math.abs(q.x - x) < (q.w || 60) / 2 + 8 && Math.abs(q.y - sy) < 14)) return;
  ripple(x, y, rnd(10, 15) * d, { life: 9, a: 0.5, amb: true, c: 'rgba(200,192,232,A)' });
  for (let i = 0; i < 3; i++) spawn({ k: DROP, x, y, z: 1, vx: rnd(-1, 1) * d, vz: rnd(1.5, 2.5) * d, g: 0.3, life: 8, s: 1.7 * d, c: '#c8c0e8', a: 0.5, L: 0, amb: true, mat: 'rain' });
}
/** the heroes' feet in water: wading through the swamp's pools (p.wading, src/siworld.js) or a puddle on a wet deck
 * (the stage's puddle spots) kicks up drops and rings as they move, and a splash when they land in it */
function wade(w, f) {
  const pud = w.L?.id === 'sikraken' || w.L?.id === 'sitreasure' ? spotsOf(w, f).filter((q) => q.kind === 'puddle') : null;
  if (!w.L?.water && !pud?.length) return;
  for (const p of w.players) {
    if (p.out || p.hidden) continue;
    const air = p.z > 3, sy = FLOOR_TOP + p.y;
    const wet = (p.wading || 0) > 0.3 ? 'pool' : pud && pud.some((q) => Math.abs(q.x - p.x) < (q.w || 60) / 2 && Math.abs(q.y - sy) < 12) ? 'puddle' : null;
    if (wet && p._sifxAir && !air) {   // (a landing: a splash)
      drops(p.x, p.y, 2, wet === 'pool' ? 9 : 5, COL.water, { sp: 1.1, mat: 'water' }); ripple(p.x, p.y, wet === 'pool' ? 30 : 20, { life: 22 }); ripple(p.x, p.y, 16, { life: 30 });
    } else if (wet && !air && (Math.abs(p.vx || 0) + Math.abs(p.vy || 0) > 0.6) && (f + p.slot * 3) % 9 === 0) {   // (a stride: drops kicked up behind, a ring at the feet)
      const back = -(p.facing || 1);
      for (let i = 0; i < (wet === 'pool' ? 3 : 2); i++) spawn({ k: DROP, x: p.x + back * rnd(4, 14), y: p.y + rnd(-2, 2), z: 2, vx: back * rnd(0.4, 1.6), vz: rnd(1.8, 3.2), g: 0.3, life: 16, s: rnd(1.8, 2.6), c: pick(COL.water), a: 0.9, L: 1 });
      ripple(p.x, p.y, wet === 'pool' ? rnd(16, 22) : rnd(10, 14), { life: 18, a: 0.6 });
    }
    p._sifxAir = air;
  }
}
function wisps(w, f, col, a, z0 = 10, z1 = 110) {
  if (REDUCED || ambN > 26 || f % 70 !== 0) return;
  const c = `rgba(${parseInt(col.slice(1, 3), 16)},${parseInt(col.slice(3, 5), 16)},${parseInt(col.slice(5, 7), 16)},A)`;
  spawn({ k: WISP, x: w.camX + rnd(-120, W + 120), y: rnd(-40, 60), z: rnd(z0, z1), vx: rnd(-0.6, -0.3), life: 1100, s: rnd(130, 220), s2: rnd(18, 34), c, a, L: 0, amb: true });
}

// ------------------------------------------------------------------------------------------------ step / draw
/** World.step (L.si): the particles move; the stage's ambient spawns.  A new world / level clears the pool. */
export function step(w) {
  if (w.fx) w.fx.world = w;   // (src/fx.js word(): a boss's words go off its face -- it reads the boss and the heroes)
  if (CFG.off) return;
  const key = w.L?.id + ':' + (w.levelIdx ?? '');
  if (S.w !== w || S.key !== key) { reset(); S.w = w; S.key = key; }
  const f = w.frame | 0, cx = w.camX + W / 2;
  if (!w.cut || w.cut.kind === 'intro') { const A = AMB[w.L?.id]; if (A && !w.app?.paused) A(w, cx, f); }
  if (!w.cut && !w.app?.paused) wade(w, f);
  for (let i = kicks.length - 1; i >= 0; i--) if (++kicks[i].n >= KICK.length || kicks[i].a.gone) kicks.splice(i, 1);
  const x0 = w.camX - 400, x1 = w.camX + W + 400;
  for (const p of P) {
    if (!p.on) continue;
    p.t++;
    if (p.t >= p.life || (p.amb && (p.x < x0 || p.x > x1))) { kill(p); continue; }
    p.vz -= p.g; p.vx *= p.dr; if (p.k !== WISP) p.vz *= p.dr;
    p.x += p.vx; p.y += p.vy; p.z += p.vz; p.rot += p.vr;
    if (p.k === LEAF) { p.x += Math.sin(p.t * 0.07 + p.ph) * 0.9; p.rot = Math.sin(p.t * 0.09 + p.ph) * 0.9; if (p.amb && p.z < 60) p.life = Math.min(p.life, p.t + 10); if (p.vz < -1.1) p.vz = -1.1; }
    else if (p.k === ASH) { p.x += Math.sin(p.t * 0.05 + p.ph) * 0.35; p.rot += 0.03; }
    else if (p.k === MOTE && p.amb) { p.x += Math.sin(p.t * 0.03 + p.ph) * 0.2; }
    else if (p.k === EMBER) { p.vx += Math.sin(p.t * 0.3 + p.ph) * 0.05; }
    if (p.z <= 0 && p.g > 0) {
      if (p.k === CHIP && p.b > 0) { p.z = 0; p.vz *= -0.32; p.vx *= 0.5; p.vr *= 0.5; p.b--; if (p.b === 0) { p.vz = 0; p.g = 0; p.vx = 0; p.vr = 0; p.life = Math.min(p.life, p.t + 18); p.L = 0; } }   // (at rest on the floor: the back layer -- under the telegraph rings and the actors)
      else if (p.k === GOO) { const s = p.s * rnd(2.2, 3.2); kill(p); if (Math.random() < (REDUCED ? 0.25 : 0.45)) splat(p.x, p.y, s, p.c); }
      else if (p.k === DROP) { kill(p); if (p.mat === 'water' && Math.random() < 0.5) ripple(p.x, p.y, rnd(5, 8), { life: 12, a: 0.5 }); }
      else if (p.k === STREAK || p.k === LEAF || p.k === STAR) { p.z = 0; p.vz = 0; p.g = 0; p.vx *= 0.3; p.L = 0; }
    }
  }
}
/** World.render (L.si): 'back' after the stage's back (under the telegraphs and actors), 'front' over the actors */
export function draw(ctx, w, layer) {
  if (!alive || CFG.off) return;
  const Lw = layer === 'back' ? 0 : 1, camX = w.camX;
  let addOn = false;
  ctx.save();
  for (let pass = 0; pass < 2; pass++) {
    for (const p of P) {
      if (!p.on || p.L !== Lw) continue;
      const add = p.add || LIGHTER.has(p.k);
      if ((pass === 1) !== add) continue;
      if (add !== addOn) { ctx.globalCompositeOperation = add ? 'lighter' : 'source-over'; addOn = add; }
      const sx = p.x - camX, sy = FLOOR_TOP + p.y - p.z;
      if (sx < -260 || sx > W + 260 || sy < -40 || sy > 600) continue;
      drawP(ctx, p, sx, sy);
    }
  }
  ctx.restore();
}
function fadeOf(p) { const k = p.t / p.life; return k < 0.12 && p.amb ? k / 0.12 : k > 0.7 ? (1 - k) / 0.3 : 1; }   // (a burst is at full strength from its first frame: it shows through the hit-stop freeze; ambient bits fade in)
function drawP(ctx, p, sx, sy) {
  const k = p.t / p.life;
  switch (p.k) {
    case CHIP: {   // a material's bit in its own shape, shaded and inked (QAF3: the flat rotated squares read as confetti)
      ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
      const sh = p.mat || 'stone';
      if (sh === 'coin') {   // (a spinning coin: an ellipse narrowing and widening, a dark rim, a glint while it faces us)
        const R = p.s / 2, rx = Math.max(1.2, R * Math.abs(Math.cos(p.rot * 1.6)));
        ctx.beginPath(); ctx.ellipse(sx, sy, rx, R, 0, 0, TAU); ctx.fillStyle = p.c; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = '#6a4a12'; ctx.stroke();
        if (rx > R * 0.45) { ctx.fillStyle = 'rgba(255,255,240,0.9)'; ctx.beginPath(); ctx.arc(sx - rx * 0.3, sy - R * 0.35, Math.max(1, R * 0.22), 0, TAU); ctx.fill(); }
        break;
      }
      const L = p.s / 2, T = p.s2 / 2, path = new Path2D();
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot);
      if (sh === 'splinter') {   // (a long tapered sliver: a broken blunt end, a point)
        path.moveTo(-L, -T); path.lineTo(-L * 0.4, -T * 1.05); path.lineTo(L * 0.5, -T * 0.4); path.lineTo(L, 0); path.lineTo(L * 0.45, T * 0.5);
        path.lineTo(-L * 0.55, T); path.lineTo(-L, T * 0.55); path.lineTo(-L * 0.82, 0); path.closePath();
      } else if (sh === 'fan') {   // (a shell fragment: a fan wedge from its hinge, the ridges drawn in the clip below)
        const R = L * 1.5; path.moveTo(0, R * 0.35); path.arc(0, R * 0.35, R, Math.PI * 1.27, Math.PI * 1.73); path.closePath();
      } else if (sh === 'curve') {   // (a crescent: the outer arc and a flatter inner one meeting in two points)
        const R = L * 1.2;
        path.arc(0, R * 0.5, R, Math.PI * 1.05, Math.PI * 1.95); path.arc(0, R * 1.857, R * 1.807, 5.291, 4.134, true); path.closePath();   // (the inner arc through the outer one's ends: 0.55 R thick at the middle)
      } else {   // (an irregular six-sided chip: alternate long / short radii, jittered per bit)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + 0.35, r = (i % 2 ? L : T * 1.15) * (0.82 + 0.18 * Math.sin(p.ph * (i + 2)));
          if (i) path.lineTo(Math.cos(a) * r, Math.sin(a) * r); else path.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        path.closePath();
      }
      ctx.fillStyle = p.c; ctx.fill(path);
      ctx.save(); ctx.clip(path);
      if (sh === 'fan') {   // (ridges from the hinge, a pale rim along the edge)
        const R = L * 1.5; ctx.strokeStyle = 'rgba(60,36,48,0.4)'; ctx.lineWidth = 1;
        for (const a of [1.38, 1.5, 1.62]) { ctx.beginPath(); ctx.moveTo(0, R * 0.35); ctx.lineTo(Math.cos(a * Math.PI) * R, R * 0.35 + Math.sin(a * Math.PI) * R); ctx.stroke(); }
        const rim = new Path2D(); rim.arc(0, R * 0.35, R * 0.9, Math.PI * 1.3, Math.PI * 1.7); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1.2, R * 0.12); ctx.stroke(rim);
      } else if (sh === 'curve') {   // (its inner edge a touch darker; a white glint along the outer edge, flickering as it turns)
        const R = L * 1.2;
        ctx.fillStyle = 'rgba(0,24,36,0.24)'; ctx.fillRect(-R * 1.2, -R * 0.12, R * 2.4, R);
        const hl = new Path2D(); hl.arc(0, R * 0.5, R * 0.86, Math.PI * 1.27, Math.PI * 1.6);
        ctx.strokeStyle = `rgba(255,255,255,${(0.55 + 0.4 * Math.abs(Math.cos(p.rot * 2))).toFixed(2)})`; ctx.lineWidth = Math.max(1.3, R * 0.22); ctx.lineCap = 'round'; ctx.stroke(hl);
      } else {
        ctx.fillStyle = 'rgba(30,14,24,0.34)'; ctx.fillRect(-L * 1.3, 0, L * 2.6, T * 2.6);   // (the lower face in shade)
        ctx.fillStyle = 'rgba(255,248,232,0.4)'; ctx.fillRect(-L * 1.3, -T * 2.6, L * 2.6, T * 1.9);   // (the lit top edge)
        if (sh === 'splinter' || sh === 'bark') { ctx.strokeStyle = 'rgba(52,26,12,0.5)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-L * 0.75, T * 0.12); ctx.lineTo(L * 0.6, -T * 0.02); ctx.stroke(); }   // (the grain)
        if (sh === 'metal') { ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.moveTo(-L * 0.2, -T * 1.4); ctx.lineTo(L * 0.15, -T * 1.4); ctx.lineTo(-L * 0.05, T * 1.4); ctx.lineTo(-L * 0.4, T * 1.4); ctx.closePath(); ctx.fill(); }   // (a bright stripe)
      }
      ctx.restore();
      ctx.lineWidth = sh === 'curve' ? 1.2 : 1.4; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(path);
      ctx.restore();
      break;
    }
    case DROP: case GOO: {   // a drop stretched along its fall, a white glint on water
      const r = p.s, st = Math.min(2.2, 1 + Math.hypot(p.vx, p.vz) * 0.12), an = Math.atan2(-p.vz, p.vx);
      ctx.globalAlpha = p.a * (k > 0.8 ? (1 - k) / 0.2 : 1);
      ctx.beginPath(); ctx.ellipse(sx, sy, r * st, r, an, 0, TAU); ctx.fillStyle = p.c; ctx.fill();
      if (p.k === DROP && r >= 2.4) { ctx.lineWidth = p.mat === 'sweat' ? 1.5 : 1; ctx.strokeStyle = p.mat === 'sweat' ? INK : 'rgba(33,20,28,0.55)'; ctx.stroke(); }   // (a rim: a pale drop on a pale crab or sky still reads)
      if (p.k === GOO) { ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 0.35, r * 0.32, 0, TAU); ctx.fill(); }
      else if (r > 2) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 0.3, r * 0.35, 0, TAU); ctx.fill(); }
      break;
    }
    case EMBER: {   // a hot dot and its glow, cooling from yellow to red
      const f = 1 - k, fl = 0.75 + 0.25 * Math.sin(p.t * 0.9 + p.ph);
      ctx.globalAlpha = 0.28 * f * fl; ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(sx, sy, p.s * 2.6, 0, TAU); ctx.fill();
      ctx.globalAlpha = f * fl; ctx.fillStyle = k < 0.4 || p.mat === 'hot' ? p.c : '#ff6a2a'; ctx.beginPath(); ctx.arc(sx, sy, p.s * (1 - k * 0.4), 0, TAU); ctx.fill();
      break;
    }
    case MOTE: {
      ctx.globalAlpha = p.a * fadeOf(p);
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(sx, sy, p.s, 0, TAU); ctx.fill();
      if (p.add) { ctx.globalAlpha *= 0.3; ctx.beginPath(); ctx.arc(sx, sy, p.s * 2.4, 0, TAU); ctx.fill(); }
      break;
    }
    case ASH: {
      ctx.globalAlpha = p.a * fadeOf(p); ctx.fillStyle = p.c;
      const c = Math.cos(p.rot) * p.s, s = Math.sin(p.rot) * p.s * 0.5;
      ctx.beginPath(); ctx.moveTo(sx + c, sy + s); ctx.lineTo(sx - s, sy + c * 0.5); ctx.lineTo(sx - c, sy - s); ctx.lineTo(sx + s, sy - c * 0.5); ctx.closePath(); ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(33,20,28,0.55)'; ctx.stroke();
      break;
    }
    case LEAF: {   // a little leaf: two curves, a vein, inked
      const c = Math.cos(p.rot), s = Math.sin(p.rot), L = p.s * 1.4, Wd = p.s * 0.6;
      ctx.globalAlpha = fadeOf(p);
      ctx.beginPath(); ctx.moveTo(sx - c * L, sy - s * L);
      ctx.quadraticCurveTo(sx - s * Wd, sy + c * Wd, sx + c * L, sy + s * L); ctx.quadraticCurveTo(sx + s * Wd, sy - c * Wd, sx - c * L, sy - s * L);
      ctx.fillStyle = p.c; ctx.fill(); ctx.lineWidth = 1.1; ctx.strokeStyle = INK; ctx.stroke();
      break;
    }
    case PUFF: {
      const r = p.s * (0.6 + k * 0.9);
      ctx.globalAlpha = p.a * (k > 0.5 ? (1 - k) / 0.5 : 1);
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(33,20,28,0.35)'; ctx.stroke();
      break;
    }
    case SPLAT: {   // goo on the floor: a blob and its drops, fading
      const a = k < 0.05 ? k / 0.05 : k > 0.6 ? (1 - k) / 0.4 : 1, gr = 0.7 + 0.3 * Math.min(1, k * 8);
      ctx.globalAlpha = 0.85 * a; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(sx, sy, p.s * gr, p.s2 * gr, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(33,20,28,0.55)'; ctx.stroke();
      for (let i = 0; i < 3; i++) { const an = p.rot + i * 2.1; ctx.beginPath(); ctx.ellipse(sx + Math.cos(an) * p.s * 1.25, sy + Math.sin(an) * p.s2 * 1.3, p.s * 0.2, p.s2 * 0.24, 0, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 0.4 * a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(sx - p.s * 0.25, sy - p.s2 * 0.25, p.s * 0.3, p.s2 * 0.22, 0, 0, TAU); ctx.fill();
      break;
    }
    case RIPPLE: {
      const r = p.s * (0.3 + k * 0.9);
      ctx.globalAlpha = 1; ctx.strokeStyle = p.c.replace('A', (p.a * (1 - k)).toFixed(3)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.32, 0, 0, TAU); ctx.stroke();
      break;
    }
    case GLINT: {   // a four-point twinkle
      const r = p.s * Math.sin((p.amb ? Math.min(1, k) : 0.25 + 0.75 * Math.min(1, k)) * Math.PI);   // (a hit's glint is lit from its first frame)
      ctx.globalAlpha = p.a; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r * 0.18, sy - r * 0.18); ctx.lineTo(sx + r, sy); ctx.lineTo(sx + r * 0.18, sy + r * 0.18);
      ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r * 0.18, sy + r * 0.18); ctx.lineTo(sx - r, sy); ctx.lineTo(sx - r * 0.18, sy - r * 0.18); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = p.a * 0.35; ctx.beginPath(); ctx.arc(sx, sy, r * 0.6, 0, TAU); ctx.fill();
      break;
    }
    case WISP: {   // a long soft band of fog: three stacked ellipses, thin alpha
      const a = p.a * Math.min(1, p.t / 60, (p.life - p.t) / 60);
      for (let i = 0; i < 5; i++) {   // (five nested soft layers: a feathered edge, no hard bands)
        ctx.globalAlpha = 1; ctx.fillStyle = p.c.replace('A', (a * 0.34).toFixed(3));
        ctx.beginPath(); ctx.ellipse(sx + i * p.s * 0.06, sy - i * 1.5, p.s * (1.15 - i * 0.18), p.s2 * (1.2 - i * 0.17), 0, 0, TAU); ctx.fill();
      }
      break;
    }
    case ORB: {   // an inked bead with a soft halo: c the fill, c2 the rim
      const f = fadeOf(p), r = p.s * (1 - (p.t / p.life) * 0.35);
      ctx.globalAlpha = 0.18 * f; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = p.c2 && p.c2 > '#8' ? p.c2 : p.c;
      ctx.beginPath(); ctx.arc(sx, sy, r * 1.8, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';   // (a faint halo: many overlapping ones summed to a white disc)
      ctx.globalAlpha = f; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fillStyle = p.c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = p.c2 || INK; ctx.stroke();
      if (p.mat === 'core') { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(sx, sy, r * 0.48, 0, TAU); ctx.fill(); }   // (a white-hot core: it reads on the violet palace)
      else { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 0.32, r * 0.3, 0, TAU); ctx.fill(); }
      break;
    }
    case STAR: {   // a five-point comic star, inked, spinning
      const r = p.s, c = Math.cos(p.rot), s = Math.sin(p.rot);
      ctx.globalAlpha = fadeOf(p); ctx.beginPath();
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = (i / 10) * TAU - Math.PI / 2, px = Math.cos(a) * rr, py = Math.sin(a) * rr; ctx.lineTo(sx + px * c - py * s, sy + px * s + py * c); }
      ctx.closePath(); ctx.fillStyle = p.c; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
      break;
    }
    case STREAK: {   // a metal spark: a short bright line along its flight
      ctx.globalAlpha = 1 - k * k; ctx.lineCap = 'round';
      if (p.mat === 'fire') {   // (a fire spark -- QAF3's embers and sparks: an orange glow round a hot yellow line with a white-hot core, short; no dark rim, which made them read as sticks)
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - p.vx * 2.2, sy + p.vz * 2.2);
        ctx.strokeStyle = 'rgba(255,110,30,0.45)'; ctx.lineWidth = p.s + 3.4; ctx.stroke();
        ctx.strokeStyle = p.c; ctx.lineWidth = p.s; ctx.stroke();
        ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = Math.max(1, p.s * 0.4); ctx.stroke();
        break;
      }
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - p.vx * 3, sy + p.vz * 3);
      ctx.strokeStyle = 'rgba(80,30,10,0.75)'; ctx.lineWidth = p.s + 2.4; ctx.stroke();   // (a dark under-stroke: it reads on grey stone)
      ctx.strokeStyle = p.c; ctx.lineWidth = p.s; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, p.s * 0.4); ctx.stroke();
      break;
    }
    default: break;
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ rain sheets (screen space)
/** slanting rain over the whole frame, in two depths (far: thin and faint; near: longer, brighter) -- stateless (hashed
 * from the time: no pool, no canvas), for a scene that isn't the World (the Storm Sea ride: src/stormride.js).  k: 0..1
 * how hard it rains (the storm breaking: 1 - the ride's dawn); wind: the slant (px of x per px of fall) */
export function rainSheet(ctx, t, k = 1, wind = 0.28) {
  if (k <= 0.01 || CFG.off) return;
  const n = Math.round((REDUCED ? 40 : 90) * k);
  ctx.save(); ctx.lineCap = 'round';
  for (let layer = 0; layer < 2; layer++) {
    const near = layer === 1, len = near ? 26 : 14, sp = near ? 17 : 11, m = near ? Math.round(n * 0.45) : n;
    ctx.strokeStyle = near ? `rgba(214,226,255,${0.42 * k})` : `rgba(190,200,240,${0.26 * k})`; ctx.lineWidth = near ? 1.8 : 1.1;
    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const h1 = ((i * 7919 + layer * 104729) % 9973) / 9973, h2 = ((i * 15485863 + layer * 3) % 7919) / 7919;
      const y = ((h2 * (H + 60) + t * 60 * sp) % (H + 60)) - 30, x = ((h1 * (W + 200) + y * wind) % (W + 200)) - 100;
      ctx.moveTo(x, y); ctx.lineTo(x - wind * len, y - len);
    }
    ctx.stroke();
  }
  ctx.restore();
}

const REDUCED_MOTION = REDUCED;
/** a Book 2 boss's FINAL blow (AA item 9: a staged moment): a hit-stop, then ~0.5 s of half-speed slow motion with the camera
 * easing in on the boss (zoom 1.09 about its chest, held, eased back out -- no snap, no flash), its material bursting big.
 * Called once per boss (b._beat): by each boss's own final blow (the runtime builder's SIFX.bossBeat?.(g, this) calls), else
 * by World.onBossDefeated for a boss that has none.
 * Reduced motion: the hit-stop and the burst only. */
export function bossBeat(g, b, opts = {}) {
  if (CFG.off || !g || !b || b._beat) return;
  b._beat = true; b._sifxBeat = g.frame;
  const T = b.head && Number.isFinite(b.head.x) ? b.head : b;   // (the Leviathan: its head on the deck, not the coil in the sea)
  const x = opts.x ?? T.x, y = opts.y ?? T.y, z = opts.z ?? (T === b ? Math.min(170, (b.h || 150) * 0.5) : (T.z || 0) + (T.h || 80) * 0.5);
  g.hitstop = Math.max(g.hitstop, 10);
  // (the stage cleared for the moment: the tip box and a team-up invite go, the hit words fade -- the finale is the boss's)
  g.hint = null; g.hintAt = g.frame; g.teamWin = null;
  try { delete document.body.dataset.hint; } catch { /* (no DOM) */ }
  for (const q of g.fx?.list || []) if (q.type === 'word' && !q.rise) q.life = Math.min(q.life, q.t + 2);   // (gone at once: the hit-stop freezes the fx, a fade would hang over the beat)
  const mat = matOf(b) || 'magic';
  burst(x, y, z, mat, { k: 3.2 }); burst(x, y, z, mat, { k: 1.6, dir: -1 });
  if (mat === 'magic' || mat === 'shadow') { orbs(x, y, z, 8, '#fff0a8', '#5a2a08', { size: 1.4 }); glintAt(x, y, z, { c: '#ffffff', s: 16, life: 24 }); }   // (gold and white over the violet set: a magic boss's finish must not melt into the room)
  // (a gold shock ring rolling out on the floor and a few soft rays at its chest: the moment, not a screen flash)
  g.fx?.ring?.(x, b.y, { rx: 190, ry: 62, shock: true, col: '#ffd45a', life: 34 });
  g.fx?.rays?.(x, b.y, z, '#ffe9a0', 150, 22);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; glintAt(x + Math.cos(a) * rnd(50, 90), y + Math.sin(a) * 16, z + Math.sin(a) * 40 + rnd(-10, 20), { life: rnd(28, 44), s: rnd(6, 9), c: i % 3 ? '#fff4c0' : '#ffd45a', vz: rnd(0.3, 1) }); }
  if (REDUCED_MOTION || g.slow) return;
  const N = opts.n || 34, Z = opts.zoom || 1.14;
  g.slow = { t: 0, n: N, x, y, z, beat: (t, n) => { const e = (u) => 1 - (1 - u) * (1 - u), k = t < 8 ? e(t / 8) : t > n - 10 ? e(Math.max(0, n - t) / 10) : 1; return 1 + (Z - 1) * k; } };
}
/** World.onBossDefeated (L.si): the finishing blow lands big -- the boss's own material bursting, and a ring of gold
 * glints rising round it (the staged moment's sparkle; never a wash: the gated one is the engine's) */
export function bossDown(g, b) {
  if (CFG.off || !b) return;
  const mat = matOf(b) || 'magic', z = Math.min(160, (b.h || 150) * 0.55);
  burst(b.x, b.y, z, mat, { k: 3.2 });
  burst(b.x, b.y, z, mat, { k: 1.6, dir: -1 });
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; glintAt(b.x + Math.cos(a) * rnd(60, 110), b.y + Math.sin(a) * 18, z + Math.sin(a) * 50 + rnd(-10, 30), { life: rnd(30, 50), s: rnd(6, 10), c: i % 3 ? '#fff4c0' : '#ffd45a', vz: rnd(0.4, 1.2) }); }
}

// ------------------------------------------------------------------------------------------------ the rage wolf's flame mane
// The book's rage wolf is a wolf ON FIRE: licks of flame rising off its back from the neck to the hips, a flame at the tail
// tip, a few sparks floating up (the comic's rage sheet).  The painted pack (a recoloured shadow wolf) has the lava cracks
// but no flames, so they are drawn here, over the back, from the pack's landmarks (head / body / hips; facing right, scale
// 1, y up negative -- the wrapper src/chars/ragewolf3d.js draws them x RIG_K 0.72 x the wolf's scale).  Calm: small
// flames; rage: tall ones.  Hurt / scattered: low and dim.  A dark edge keeps them off the cave's orange lava band.  The
// flicker is shape and height only (no brightness strobe: flash-safe).  Call after the wolf's own draw:
//   SIFX.flameMane(ctx, wolf)     (src/sirage.js RageBeast.draw / RageAlpha.draw)
const MANE_K = 0.72;
const LM0 = { head: [62.5, -47.5], body: [4.7, -55.1], hips: [-27.5, -52.0] };   // (the idle drawing's: a rig pose has none)
/** the mane's sheet BEHIND the wolf's body (call before its draw): the back's silhouette hides the sheet's base, so the
 * fire rises off the back -- no flat edge over the fur (the stage's book critic) */
export function flameManeBack(ctx, a, o = {}) { flameMane(ctx, a, { ...o, layer: 'back' }); }
export function flameMane(ctx, a, o = {}) {
  if (CFG.off || !a || !a.alive) return;
  if (!o.layer && a._maneBackAt === a.game?.frame) { maneSparks(a, o); return; }   // (the sheet was drawn behind this frame: the front call only adds sparks)
  if (o.layer === 'back') a._maneBackAt = a.game?.frame;
  const mod = CHARS[a.art], pose = a.pose ? a.pose() : null, op = a.drawOpts ? a.drawOpts() : {};
  const f = op.facing || a.facing || 1, k = (op.scale || a.scale || 1) * (o.k ?? MANE_K);
  if (k < 0.15) return;
  const P = (n) => (mod && mod.point && pose ? mod.point(pose, n) : null) || LM0[n];
  const H = P('head'), B = P('body'), Hp = P('hips');
  const clip = pose && pose.clip || '', down = /hurt|scatter/.test(clip);
  const r = Math.max(0, Math.min(1, a.r ?? 0.5)), g = a.game, t = (g?.frame ?? 0) / 60 * (REDUCED ? 0.5 : 1), ph = (a.x * 0.013) % TAU;
  const big = (down ? 0.55 : 0.5 + 1.0 * r) * (o.size || 1) * (a.boss ? 1 : 1.45), alpha = down ? 0.5 : 1;   // (calm: low licks, rage: a blaze; the pack wolves' flames 1.45x -- at play scale theirs were specks)
  // ONE billowing sheet of fire along the back, from behind the ears to the rump (the book's mane): a crest of swept-back
  // peaks over a base sunk into the fur; three nested layers -- a #D8342A edge, a #FF9A2A middle, a pale #FFE88A core --
  // no black outline (a thin deep-red rim keeps it off the cave's orange lava); the peaks sway and lick per frame
  const lerp = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  const sink = o.layer === 'back' ? 14 : 0;   // (behind the body: the base sunk into the back, hidden by it)
  const E = [H[0] - 14, H[1] - 14 + sink], M = [B[0], B[1] - 16 + sink], R = [Hp[0] - 6, Hp[1] - 10 + sink];
  const base = (u) => (u < 0.5 ? lerp(E, M, u * 2) : lerp(M, R, (u - 0.5) * 2));
  const sx = a.sx, sy = a.sy, X = (q) => sx + f * q[0] * k, Y = (q) => sy + q[1] * k;
  const NP = 7, PK = [0.85, 1.1, 0.95, 1.1, 1.0, 1.0, 0.85];   // (each peak's height, shoulder to rump)
  const sheet = (sc, inset, col) => {
    ctx.beginPath();
    const b0 = base(0.0), b1 = base(1.0);
    ctx.moveTo(X(b0), Y(b0) + 4 * k);
    for (let i = 0; i < NP; i++) {
      const u0 = (i + 0.5) / NP, uv = (i + 1) / NP, q = base(u0), qv = base(Math.min(1, uv));
      const env = 0.55 + 0.45 * Math.sin(Math.PI * (0.12 + 0.88 * u0)), sway = Math.sin(t * 4.6 + i * 1.3 + ph) * 5 + Math.sin(t * 7.9 + i * 2.1) * 2;
      const h = ((20 + 20 * env) * PK[i] * big + sink) * sc * (1 + 0.16 * Math.sin(t * 6.1 + i * 1.7 + ph));
      const tip = [q[0] - (12 * big + sway) * sc, q[1] - h];   // (the tip swept back, toward the tail, curling)
      const val = [qv[0] - 2, qv[1] - h * 0.42 - inset];
      // a billowing tongue: a round belly swelling forward, then the tip flicking back; the back edge falls in an S to the valley
      ctx.bezierCurveTo(X([q[0] + 10 * sc, q[1] - h * 0.35]), Y([q[0] + 10 * sc, q[1] - h * 0.35]), X([q[0] + 4 * sc, q[1] - h * 0.82]), Y([q[0] + 4 * sc, q[1] - h * 0.82]), X(tip), Y(tip));
      ctx.bezierCurveTo(X([tip[0] + 2 * sc, tip[1] + h * 0.3]), Y([tip[0] + 2 * sc, tip[1] + h * 0.3]), X([val[0] + 9 * sc, val[1] - h * 0.12]), Y([val[0] + 9 * sc, val[1] - h * 0.12]), X(val), Y(val));
    }
    ctx.lineTo(X(b1), Y(b1) + 4 * k);
    for (let i = 8; i >= 0; i--) { const q = base(i / 8); ctx.lineTo(X(q), Y(q) + (6 + inset) * k); }   // (the base: sunk into the back)
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  ctx.save(); ctx.globalAlpha *= alpha; ctx.lineJoin = 'round';
  // the tail's flame: anchored on the tail, three tongues licking up and back
  const T0 = [Hp[0] - 34, Hp[1] - 8 + sink * 0.5], T1 = [Hp[0] - 64, Hp[1] + 2 + sink * 0.3];
  const tail = (sc, col) => {
    ctx.beginPath(); ctx.moveTo(X(T0), Y(T0));
    for (let i = 0; i < 3; i++) {
      const u = (i + 0.6) / 3, q = lerp(T0, T1, u), sw = Math.sin(t * 5.3 + i * 2 + ph) * 4;
      const h = (14 + 6 * (i === 1 ? 1 : 0)) * big * sc, tip = [q[0] - (8 + sw) * sc, q[1] - h];
      ctx.quadraticCurveTo(X([q[0] + 3, q[1] - h * 0.5]), Y([q[0] + 3, q[1] - h * 0.5]), X(tip), Y(tip));
      const nx = lerp(T0, T1, Math.min(1, (i + 1) / 3)); ctx.quadraticCurveTo(X([tip[0] + 5, tip[1] + h * 0.5]), Y([tip[0] + 5, tip[1] + h * 0.5]), X([nx[0], nx[1] - h * 0.25]), Y([nx[0], nx[1] - h * 0.25]));
    }
    ctx.lineTo(X(T1), Y(T1) + 5 * k); ctx.lineTo(X(T0), Y(T0) + 6 * k); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  ctx.lineWidth = Math.max(1.2, 1.6 * k); ctx.strokeStyle = 'rgba(110,18,10,0.75)';
  tail(1, '#D8342A'); ctx.stroke(); tail(0.7, '#FF9A2A'); tail(0.42, '#FFE88A');
  sheet(1, 0, '#D8342A'); ctx.stroke();
  sheet(0.74, 2, '#FF9A2A');
  sheet(0.46, 4, '#FFE88A');
  ctx.restore();
  a._manePts = [0.15, 0.35, 0.55, 0.75].map((u) => { const q = base(u); return [q[0], q[1] - 18 * big - sink]; }); a._maneK = k; a._maneF = f;
  if (!o.layer) maneSparks(a, o);
}
/** a few sparks floating up off the mane (3-5 alive per wolf) */
function maneSparks(a) {
  const g = a.game, pts = a._manePts, k = a._maneK || 1, f = a._maneF || 1, clip = (a.pose ? a.pose() : null)?.clip || '', down = /hurt|scatter/.test(clip);
  if (!pts) return;
  // a few sparks floating up off the mane (3-5 alive per wolf)
  if (g && a._maneAt !== g.frame && !down) {
    a._maneAt = g.frame;
    if ((g.frame + ((a.x | 0) % 9)) % 9 === 0) {
      const q = pts[(Math.random() * pts.length) | 0];
      spawn({ k: EMBER, x: a.x + f * q[0] * k, y: a.y, z: (a.z || 0) - q[1] * k + 6, vx: -f * rnd(0.1, 0.5), vz: rnd(0.6, 1.2), g: -0.01, dr: 0.99, life: rnd(32, 44), s: rnd(1.4, 2), c: pick(['#FFB347', '#FFD35A']), L: 1 });
    }
  }
}
