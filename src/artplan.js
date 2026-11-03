// THE ATLAS SCALE PLAN: which scale each decoded sprite pack of a scene gets.  src/sprite3d.js useArt() and
// tools/memlevels.mjs both run this one function, so the memory model and the game can't drift.  Pure: no DOM, no I/O.
//
// 1. WANT.  A pack wants the scale whose texels cover what the screen draws: the render scale (device px per game px --
//    src/main.js resize: the canvas backing store / 960; DPR 2 at 960 css px is 2, an iPad's 2.46, a 1080p TV at DPR 1 is
//    2) times the sprite's own draw scale (src/artsets.js drawK: the Ice Wyvern is drawn x1.7, Morvath x0.9).  That is
//    the smallest scale built with s * TOL >= render x draw, else the largest built.  So the Ice Wyvern wants his 2x even
//    at DPR 1, Morvath his 1x at DPR 1 and his 2x at DPR 2, every foe its 2x at DPR 2 (the old policy kept the foes at 1x
//    always and chose by the DPR alone -- the model audit, 2026-10-25, #1 / #5).
// 2. FILL.  Every pack starts at its floor -- a boss or a form's level pack at its 0.75x where built, a hero or a foe at its
//    1x (never above its want) -- and the budget (less the headroom) is handed out in order, each step only where the
//    whole step fits:
//      the bosses to 1x                        a FAMILY at a time (a boss's packs, src/artsets.js bossFamily: the
//                                              troll's body and arm layers, Malachar's parts), the cheapest first:
//                                              the whole family together, else its MAIN pack alone; every main has
//                                              its turn before any part, then the parts one at a time, the cheapest
//                                              first -- a part rises only where its main couldn't (the coordinator,
//                                              2026-10-25: the troll's arm raised first, cheapest, had left the troll
//                                              at 1x and 78 MB of the budget unused)
//      the HEROES to their want                all together (never a crisp hero beside a soft one) -- with the
//                                              level's FORMS (tier 'form': a hero's alternate form here, the summit's
//                                              dragon, the player's own character once he transforms) if all of them
//                                              fit; else the heroes, then the forms if the heroes made their want --
//                                              before any boss's 2x, never pulling the heroes down with them (a hero
//                                              and his form aren't on screen together), never crisper than them
//      the bosses to their want                a family at a time, as above
//      the FOES to their want                  a family at a time -- every pack whose name starts the same (kobold,
//                                              kobold_blue, kobold_red; a sailor's body, hands, heads and prop) -- the
//                                              cheapest first (never a crisp kobold beside a soft one)
//      a form's level pack ('extra': on screen a moment at a time) to 1x, then to its want; a hero's MOVE pack (optional:
//                                              its floor is NOT DECODED -- the jump draws the gameplay pack's kept drawing,
//                                              the movement hooks fall back) to its lowest scale, then 1x, then its want,
//                                              only with the room left: it never costs a hero its tier (painter 3)
//    A foe or a level pack never ends up CRISPER than the heroes: its coverage -- min(1, scale / need), 1 = a texel per
//    device px or better -- stays at or under theirs (heroes at 1x on a DPR 2 screen, half covered: the foes stay at 1x
//    too, never crisp wyverns beside a soft Dodongo; at DPR 1 a hero's 1x covers, so a rage wolf drawn x1.55 may have its 2x).
//    = the step-down the coordinator set out (the level pack and the foes give way first, then a boss's 2x, then the
//    heroes -- together -- then a boss's 1x), without its blind spot: stepping down stops as soon as the set fits, so a
//    foe could keep a 2x the player's own hero had given up (Book 3 L3 1P: Dodongo at 1x beside 2x wyverns).
//
// items: [{ key, name, tier: 'hero' | 'form' | 'boss' | 'enemy' | 'extra', B: { 0.75, 1, 2 } bytes (0 = not built), want, need,
//          optional (a move pack: its floor is 0 = not decoded), fam (a boss pack's src/artsets.js bossFamily: { key,
//          rank }; none: a family of its own) }]
//   (need: render scale x draw scale, as wantScale takes it)
// -> { S: Map(item -> scale), total }

/** a drawing magnified up to this much over its texels still counts as covered (a red kobold drawn x1.08 keeps its 1x at
 *  DPR 1; the Stone Troll's x1.28 doesn't) */
export const TOL = 1.15;
export const SCALES = [0.75, 1, 2];

/** the scale a pack wants: built = the scales it was built at, need = render scale x draw scale (device px per 1x texel) */
export function wantScale(built, need) {
  const b = SCALES.filter((s) => built.includes(s));
  if (!b.length) return 1;
  return b.find((s) => s * TOL >= need) ?? b[b.length - 1];
}

/** a pack's family: its name up to the first '_' (kobold_blue -> kobold, sailor_head_bald -> sailor) */
export const family = (name) => String(name || '').replace(/:.*$/, '').split('_')[0];

/** THE GPU RESERVE: what the GPU path holds besides its textures, taken off the budget whenever a scene's set has a
 *  KTX2 page planned on the GPU (src/sprite3d.js useArt; tools/memlevels.mjs --gpu): the WebGL layer's drawing buffer
 *  (src/gl2d.js: up to the game canvas -- 2361 x 1328 x 4 on an iPad Pro, 12 MiB -- and a little for its second buffer).
 *  The transcode worker's WebAssembly heap (src/ktx2worker.js: 39 MiB after an 8 Mpx page) is NOT in it: a scene's KTX2
 *  packs load first and the worker is ended before its WebP pages decode (src/sprite3d.js useArt), so that heap only
 *  ever sits beside the KTX2 textures, never a full set */
export const GPU_RESERVE = 16 * 1048576;

/** the lowest scale a tier steps down to */
const FLOOR = { boss: 0.75, extra: 0.75, hero: 1, form: 1, enemy: 1 };

export function planScales(items, fitTo) {
  const built = (x) => SCALES.filter((s) => x.B[s]);
  const S = new Map();
  for (const x of items) {
    const b = built(x);
    // (the floor: the tier's lowest built scale, never above the want; a pack with no json at all costs nothing)
    const f = b.find((s) => s >= (FLOOR[x.tier] ?? 1)) ?? b[b.length - 1];
    S.set(x, x.optional ? 0 : b.length ? Math.min(f, x.want) : x.want);
  }
  const cost = (x, s) => x.B[s] || 0;
  let total = items.reduce((t, x) => t + cost(x, S.get(x)), 0);
  /** raise a group of packs to scale(x) each, if the whole step fits -> did it */
  const raise = (xs, to) => {
    const up = xs.filter((x) => { const s = to(x); return s > S.get(x) && s <= x.want && x.B[s]; });
    if (!up.length) return false;
    const d = up.reduce((t, x) => t + cost(x, to(x)) - cost(x, S.get(x)), 0);
    if (d > 0 && total + d > fitTo) return false;   // (a step that costs nothing always goes: a KTX2 2x, 1 byte a pixel, under its 1x WebP)
    total += d;
    for (const x of up) S.set(x, to(x));
    return true;
  };
  const one = (tier, to) => {   // (one pack at a time, the cheapest step first)
    const c = items.filter((x) => x.tier === tier).map((x) => [x, cost(x, to(x)) - cost(x, S.get(x))]).sort((p, q) => p[1] - q[1]);
    for (const [x] of c) raise([x], to);
  };
  const toWant = (x) => x.want;
  // (the bosses: a family at a time, the cheapest whole step first -- the whole family; else its main pack alone (the
  //  lowest rank present); then, every main served, the parts left, the cheapest first.  Not "a main that can't rise
  //  keeps its parts down": that left Morvath's crow and staffless look -- another phase, not a layer -- at 1x and
  //  33 MB unused at MM5 3P, the troll's 78 again)
  const bfams = new Map();
  for (const x of items) if (x.tier === 'boss') { const k = x.fam ? x.fam.key : x.name; if (!bfams.has(k)) bfams.set(k, []); bfams.get(k).push(x); }
  const rank = (x) => (x.fam ? x.fam.rank : 0);
  const bossStep = (to) => {
    const step = (xs) => xs.reduce((t, x) => { const s = to(x); return t + (s > S.get(x) && s <= x.want && x.B[s] ? cost(x, s) - cost(x, S.get(x)) : 0); }, 0);
    const parts = [];
    for (const [xs] of [...bfams.values()].map((xs) => [xs, step(xs)]).sort((p, q) => p[1] - q[1])) {
      if (raise(xs, to)) continue;
      const [main, ...rest] = [...xs].sort((p, q) => rank(p) - rank(q));
      raise([main], to);
      parts.push(...rest);
    }
    for (const x of parts.sort((p, q) => step([p]) - step([q]))) raise([x], to);
  };
  bossStep(() => 1);
  const heroes = items.filter((x) => x.tier === 'hero' && x.B[S.get(x)]), forms = items.filter((x) => x.tier === 'form' && x.B[S.get(x)]);
  // (the forms: with the heroes if all fit; else after them -- and alone only beside heroes at their want: never a crisp
  //  dragon beside a soft hero)
  if (!raise([...heroes, ...forms], toWant) && (raise(heroes, toWant) || heroes.every((x) => S.get(x) >= x.want))) raise(forms, toWant);
  bossStep(toWant);
  // (the heroes' coverage: a foe's or a level pack's scale is held to it)
  const cov = (x, s) => Math.min(1, s / (x.need || 1));
  const heroCov = heroes.length ? Math.min(...heroes.map((x) => cov(x, S.get(x)))) : 1;
  const capped = (x) => { let s = S.get(x); for (const t of SCALES) if (t > s && t <= x.want && x.B[t] && cov(x, t) <= heroCov + 0.01) s = t; return s; };
  const fams = new Map();
  for (const x of items) if (x.tier === 'enemy') { const f = family(x.name); if (!fams.has(f)) fams.set(f, []); fams.get(f).push(x); }
  const fc = [...fams.values()].map((xs) => [xs, xs.reduce((t, x) => t + cost(x, capped(x)) - cost(x, S.get(x)), 0)]).sort((p, q) => p[1] - q[1]);
  for (const [xs] of fc) raise(xs, capped);
  one('extra', (x) => (x.optional && !S.get(x) ? (SCALES.find((t) => x.B[t] && t <= x.want) ?? 0) : S.get(x)));   // (an optional pack in at all)
  one('extra', (x) => Math.min(1, capped(x)));
  one('extra', capped);
  return { S, total };
}
