// Particles and comic effects, all in world space (x along the stage, y depth, z height).
import { FLOOR_TOP, INK, PLAYER_COLS, W, H } from './config.js';
import { TAU, DEG, clamp } from './rig.js';
import { PAL } from './sipalace_layout.js';   // (Skull Island's palace: the King in his crystal -- status words keep off him)

const WORDS_HEAVY = ['BONK!', 'WHAM!', 'POW!', 'THWACK!', 'SMASH!', 'KA-BONK!', 'BOOM!'];
const WORDS_LIGHT = ['BIFF!', 'BOP!', 'WHAP!'];
const WORDS13_MAX = 5;   // (RC: Books 1 / 3 -- the most floating words up at once: FX.layout13)
/** (RC2) layout13's candidate offsets [dx, dy] from a word's own spot, nearest first: vertical steps cost 1 a px (the other way
 *  1.25), sideways ones 1.6 -- a word moves up / down before it moves aside */
const C13 = {};
function cands13(up) {
  const key = up ? 'up' : 'down';
  if (C13[key]) return C13[key];
  const A = [];
  for (const dx of [0, -40, 40, -80, 80, -120, 120, -170, 170, -230, 230]) for (let dy = -360; dy <= 360; dy += 6) { if (!dx && !dy) continue; A.push([dx, dy, Math.abs(dy) * ((up ? dy < 0 : dy > 0) ? 1 : 1.25) + Math.abs(dx) * 1.6]); }
  A.sort((a, b) => a[2] - b[2]);
  return (C13[key] = A.map(([dx, dy]) => [dx, dy]));
}
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
/** Skull Island's debris: what a bit is, from the colour its caller gave (QAF3) -- 'nugget' (gold), 'slat' (a warm brown: wood), 'shard' */
function debrisKind(col) {
  const m = /^#([0-9a-f]{6})$/i.exec(col || ''); if (!m) return 'shard';
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, s = mx ? d / mx : 0;
  const h = !d ? 0 : mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (s >= 0.3 && h >= 38 && h <= 62 && mx >= 0.45) return 'nugget';   // (gold, from its dark edge to its pale shine)
  if (s >= 0.3 && h >= 10 && h < 38) return 'slat';                   // (wood: the planks, the barrel)
  return 'shard';                                                      // (rock, crystal, iron, mud)
}

// soft glow sprites (made once)
const glowCache = {};
function glowSprite(col) {
  if (glowCache[col]) return glowCache[col];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col.replace('A', '1')); gr.addColorStop(0.35, col.replace('A', '0.55')); gr.addColorStop(1, col.replace('A', '0'));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (glowCache[col] = c);
}
/** Skull Island's painted flame tongue (one cached 48x80 drawing per colour): a soft gradient tongue -- deep red at the root
 *  through orange to a pale gold tip that melts away -- with a hot core and no ink line, so it sits with the painted art
 *  instead of reading as a flat sticker (the blind critic on the Elder fight's fire) */
const softCache = {};
function softFlame(green) {
  if (softCache[green ? 1 : 0]) return softCache[green ? 1 : 0];
  const c = document.createElement('canvas'); c.width = 48; c.height = 80;
  const g = c.getContext('2d'), tongue = (k, dy) => { g.beginPath(); g.moveTo(24, 76 - dy); g.bezierCurveTo(24 - 22 * k, 66 - dy, 24 - 15 * k, 34, 25, 4 + (1 - k) * 30); g.bezierCurveTo(24 + 15 * k, 34, 24 + 22 * k, 66 - dy, 24, 76 - dy); };
  const lg = g.createLinearGradient(0, 78, 0, 4);
  if (green) { lg.addColorStop(0, 'rgba(30,140,60,0.95)'); lg.addColorStop(0.45, 'rgba(110,235,100,0.8)'); lg.addColorStop(1, 'rgba(225,255,205,0)'); }
  else { lg.addColorStop(0, 'rgba(190,46,20,0.95)'); lg.addColorStop(0.42, 'rgba(250,128,34,0.85)'); lg.addColorStop(0.8, 'rgba(255,212,110,0.45)'); lg.addColorStop(1, 'rgba(255,240,180,0)'); }
  g.fillStyle = lg; tongue(1, 0); g.fill();
  const cg = g.createRadialGradient(24, 58, 0, 24, 58, 18);
  cg.addColorStop(0, green ? 'rgba(235,255,220,0.9)' : 'rgba(255,248,210,0.9)'); cg.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = cg; g.fillRect(0, 30, 48, 50);
  return (softCache[green ? 1 : 0] = c);
}
const GLOW_FIRE = 'rgba(255,150,40,A)', GLOW_GREEN = 'rgba(90,255,120,A)', GLOW_GOLD = 'rgba(255,230,140,A)', GLOW_BLUE = 'rgba(110,200,255,A)';
const GLOW_FROST = 'rgba(240,252,255,A)', GLOW_ICE = 'rgba(60,170,230,A)';   // (the frost breath: src/mmbosses.js IceWyvern)
const glowCol = (p) => (p.color === 'blue' ? GLOW_BLUE : p.color === 'gold' ? GLOW_GOLD : p.green ? GLOW_GREEN : GLOW_FIRE);
/** '#rrggbb' -> 'rgba(r,g,b,a)' */
export const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

export class FX {
  constructor() { this.list = []; this.under = []; }
  clear() { this.list.length = 0; this.under.length = 0; this.lq = null; }
  add(p) { p.t = 0; (p.under ? this.under : this.list).push(p); return p; }

  // ------------------------------------------------------------ emitters
  spark(x, y, z, big = false, col = 'warm') {
    this.add({ type: 'spark', x, y, z, life: big ? 14 : 10, r: big ? 46 : 30, rot: rnd(0, TAU), col });
    for (let i = 0; i < (big ? 7 : 4); i++) {
      const a = rnd(0, TAU), s = rnd(2, big ? 7 : 5);
      this.add({ type: 'bit', x, y, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s + 2, life: rnd(10, 18), col: col === 'green' ? '#b6ff9a' : '#fff3b0' });
    }
  }
  word(x, y, z, heavy = true, w) {
    // (Skull Island -- this.stagger: ONE comic word per spot.  A hit word landing where another one is still young (under
    //  ~0.4 s) refreshes it -- the stronger of the two words, a small re-pop -- instead of piling a second one on top)
    if (this.stagger) {
      // (one big word near an actor at a time: while a big status word is young there -- FULL CALM!, FEAR POPPED!, RAGE TAMED!
      //  -- a plain hit word is not added on top of it; the sparks and the hit-stop still say the hit landed.  Named words stay.)
      //  (QAF: any status word -- PROTECTED... at 24 px too -- and named hit words alike (SWEEP!, SLAM!): one big word per spot,
      //  the hero's side as the boss's: SWEEP! + CRITICAL! + PERFECT! stacked over two Shadows at the Kraken)
      if (this.list.some((o) => o.type === 'word' && o.rise && !(o.cutN <= 0) && o.size >= 24 && o.t < o.life * 0.6 && Math.abs(o.x - x) < 160 && Math.abs(o.y - y) < 80)) return null;
      let str = heavy ? 2 : 1, z2 = z + 20;
      // (on a boss: off its face -- the groggy / dizzy tell -- to the side of the nearest hero, at shoulder height; this.world:
      //  set by src/sifx.js step)
      const B = this.world?.boss;
      if (B && B.alive && Math.abs(x - B.x) < (B.w || 60) + 70 && Math.abs(y - B.y) < 60) {
        let near = null; for (const p of this.world.players) if (!p.out && (!near || Math.abs(p.x - B.x) < Math.abs(near.x - B.x))) near = p;
        const side = near ? Math.sign(near.x - B.x) || -1 : -1;
        x = B.x + side * ((B.w || 60) + 34); z2 = Math.min(z2, (B.z || 0) + (B.h || 120) * 0.5 + 6);
      }
      // a word still young close by (under ~0.6 s): refreshed with the stronger word; an older one fading there is cleared
      // at once (5 frames), so a mash never shows one word fading under the next
      for (const o of this.list) if (o.type === 'word' && !o.rise && o.t >= 36 && Math.abs(o.x - x) < 140 && Math.abs(o.y - y) < 60 && Math.abs(o.z - z2) < 130) o.life = Math.min(o.life, o.t + 5);
      const q = this.list.find((o) => o.type === 'word' && !o.rise && o.t < 36 && Math.abs(o.x - x) < 140 && Math.abs(o.y - y) < 60 && Math.abs(o.z - z2) < 130);
      if (q) {
        if (str >= (q._str || 1)) { q.text = w || pick(heavy ? WORDS_HEAVY : WORDS_LIGHT); q.size = heavy ? 40 : 26; q.life = heavy ? 34 : 24; q._str = str; q.x = x; q.y = y; q.z = z2; q._wy = undefined; }
        q.t = Math.min(q.t, 5);
        return q;
      }
      return this.add({ type: 'word', x, y, z: z2, life: heavy ? 34 : 24, text: w || pick(heavy ? WORDS_HEAVY : WORDS_LIGHT), _str: str,
        rot: rnd(-14, 14) * DEG, size: heavy ? 40 : 26, col: pick(['#ffd23a', '#ff9a2a', '#fff07a', '#ff6f4a']) });
    }
    // (RC, Books 1 / 3: a hit word landing where a young one still is -- a combo's SMASH! + BONK! read "SMA BONK!" -- refreshes it, the
    //  stronger word, a small re-pop; a named one (CLATTER!, POOF!) the same way only over its own name)
    const q = this.list.find((o) => o.type === 'word' && !o.rise && !(o.cutN <= 0) && o.t < 20 && Math.abs(o.x - x) < 110 && Math.abs(o.y - y) < 60 && Math.abs(o.z - (z + 20)) < 110 && (!w || !o._named || o.text === w));
    if (q) {
      const str = heavy ? 2 : 1;
      if (str >= (q._str || 1) && (w || !q._named)) { q.text = w || pick(heavy ? WORDS_HEAVY : WORDS_LIGHT); q.size = heavy ? 40 : 26; q.life = heavy ? 34 : 24; q._str = str; q._named = !!w; q._tw = undefined; }   // (a named word -- CRACK!, CLATTER! -- is never swapped for a random one: it re-pops)
      q.t = Math.min(q.t, 4);
      return q;
    }
    return this.add({ type: 'word', x, y, z: z + 20, life: heavy ? 34 : 24, text: w || pick(heavy ? WORDS_HEAVY : WORDS_LIGHT), _str: heavy ? 2 : 1, _named: !!w,
      rot: rnd(-14, 14) * DEG, size: heavy ? 40 : 26, col: pick(['#ffd23a', '#ff9a2a', '#fff07a', '#ff6f4a']) });
  }
  label(x, y, z, text, col = '#ffe066', size = 30, life = 46) {
    if (this.stagger) {   // (Skull Island: the same status word already up close by -- CALM! from two wolves, DIZZY! again -- is refreshed, not stacked)
      const q = this.list.find((o) => o.type === 'word' && o.rise && o.text === text && o.t < o.life * 0.7 && Math.abs(o.x - x) < 130 && Math.abs(o.y - y) < 60);
      if (q) { q.t = Math.min(q.t, 6); return q; }
      return this.slotLabel({ x, y, z, text, col, size, life });
    }
    // (RC, Books 1 / 3: the same word already up and young near by -- two Shadows' SHADOW STRIKE!, CLATTER! from two knights side by side --
    //  is refreshed, not stacked)
    const q = this.list.find((o) => o.type === 'word' && o.rise && !(o.cutN <= 0) && o.text === text && o.t < o.life * 0.7 && Math.abs(o.x - x) < 320 && Math.abs(o.y - y) < 90);
    if (q) { q.t = Math.min(q.t, 6); return q; }
    return this.add({ type: 'word', x, y, z, life, text, rot: rnd(-6, 6) * DEG, size, col, rise: 0.8 });
  }
  /** (RC) Books 1 / 3: a screen rect the floating words keep out of while it is up -- the team attack's banner, the TEAM UP! cards
   *  (src/game.js), the speech balloons (draw1); frames: drawn frames it stays */
  keep13(r, frames = 2, up = false, tag = '') {   // (up: a word meeting it steps over it -- the P-tags over the heroes' heads; tag 'banner': the team banner -- a balloon under it waits)
    const n = this.dn || 0, K = (this.k13 || (this.k13 = [])).filter((k) => k.until >= n);
    const same = K.find((k) => k.r[0] === r[0] && k.r[1] === r[1] && k.r[2] === r[2] && k.r[3] === r[3]);
    if (same) same.until = n + frames; else K.push({ r, until: n + frames, up, tag });
    this.k13 = K.slice(-32);
  }
  /** (RC) Books 1 / 3's word layout, once a drawn frame: the words never print on one another nor on a banner, a TEAM UP! card or a
   *  balloon -- the status words and super names placed first (oldest first: they keep their spots), each stepping UP over what is
   *  there (down when there's no room under the HUD band), the hit words after, stepping DOWN; eased, so nothing jumps; kept on
   *  screen (a super's name at the edge was cut off); never in the HUD band (the boss's name and bar: hudTop).  At most
   *  WORDS13_MAX at once: the oldest hit words beyond that fade out over 6 frames (the wolf pack's KRAK! over DRAGON SLAM!, LIGHT IT!
   *  + BONK! + HIT IT NOW! on the gem, SHADOW STRIKE! under a TEAM UP! card) */
  layout13(ctx, camX) {
    const n = this.dn = (this.dn || 0) + 1;
    this.k13 = (this.k13 || []).filter((k) => k.until >= n - 1);
    const placed = this.k13.map((k) => ({ x0: k.r[0], y0: k.r[1], x1: k.r[2], y1: k.r[3], up: k.up, tag: k.tag }));
    for (const p of this.list) if (p.type === 'alert' && p.actor && !p.actor.gone) {   // (a wind-up's "!" -- drawn after the words: kept clear, as draw1 places it)
      const a = p.actor, big = a.boss ? 1.8 : 1, x = a.x - camX + (a.boss ? -(a.facing || 1) * 90 : 0), y = FLOOR_TOP + a.y - a.z - (a.balloonH || 160) + 22 + (a.hz0 || 0) + (a.boss ? 60 : 0), R = 23 * big;
      placed.push({ x0: x - R, y0: y - R, x1: x + R, y1: y + R, up: true });
    }
    const live = this.list.filter((p) => p.type === 'word' && !(p.cutN <= 0) && p.t < p.life);
    const st = live.filter((p) => p.rise).sort((a, b) => b.t - a.t), hits = live.filter((p) => !p.rise).sort((a, b) => b.t - a.t);
    let over = st.length + hits.length - WORDS13_MAX;
    for (const p of [...hits, ...st]) { if (over <= 0) break; if (p.cutN === undefined) { p.cutN = 6; p.life = Math.min(p.life, p.t + 6); } over--; }
    // (each word's half extents as drawn this frame: its width and size, its tilt, its pop -- up to 1.2x as it appears)
    const ext = (p) => {
      if (p._tw === undefined) { ctx.save(); ctx.font = `${p.size}px Bangers, Impact, sans-serif`; p._tw = ctx.measureText(p.text).width; ctx.restore(); }
      const k = p.t / p.life, pop = Math.max(1, k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : k < 0.25 ? 1.2 - (k - 0.15) * 2 : 1);
      const sn = Math.abs(Math.sin(p.rot || 0)), cs = Math.abs(Math.cos(p.rot || 0));
      return [((p._tw / 2) * cs + p.size * 0.5 * sn) * pop + p.size * 0.14 + 5, (p.size * 0.5 * cs + (p._tw / 2) * sn) * pop + 5];   // (RC3: 2 px more each way -- CLATTER! sat edge to edge on BOP!)
    };
    for (const p of live) if (p.cutN !== undefined && p._l13) { const [hw, hh] = ext(p); placed.push({ x0: p._lx - hw, y0: p._ly - hh, x1: p._lx + hw, y1: p._ly + hh }); }   // (fading out where it is: still kept clear)
    // (RC3: a status word -- a super's name, a callout, HIT IT NOW! -- wins over the TEAM UP! cards and the P-tags: they give way to it
    //  (src/game.js drawInvite1 / drawTags, fx.prio13), so it doesn't step round them; a hit word still does)
    let rise = false;
    const hitAt = (x, y, hw, hh) => placed.find((q) => !(rise && (q.tag === 'card' || q.tag === 'tag')) && x + hw > q.x0 && x - hw < q.x1 && y + hh > q.y0 && y - hh < q.y1);
    for (const p of [...st, ...hits]) {
      if (p.cutN !== undefined) { if (!p._l13) { p._l13 = true; p._lx = p.x - camX; p._ly = FLOOR_TOP + p.y - p.z - 30; } continue; }
      const k = p.t / p.life, sx = p.x - camX, sy = FLOOR_TOP + p.y - p.z, [hw, hh] = ext(p);
      const top = (this.hudTop || 0) + hh + 2, bot = Math.max(top, H - hh - 4);
      const x0 = Math.min(Math.max(sx, hw + 6), W - hw - 6);
      const y0 = Math.min(Math.max(sy - 30 - k * 14, top), bot);
      // (the nearest free spot: up or down first -- a status word, or any word under a P-tag or a "!", tries up first, a hit word
      //  down first -- then a step to either side (RC2: in a 4P pile-up the whole column could be taken -- two TEAM UP! cards, the
      //  tags, the section's name -- and THWACK! stayed wedged between and behind the cards).  None anywhere: a hit word is dropped
      //  (its spark and sound still say the hit landed); a status word stays where it was meant to be)
      rise = !!p.rise;
      const first = hitAt(x0, y0, hw, hh), upFirst = !!p.rise || !!first?.up;
      let wx = x0, wy = y0;
      if (first) {
        let found = null;
        for (const [dx, dy] of cands13(upFirst)) {
          const cx = x0 + dx, cy = y0 + dy;
          if (cx < hw + 6 || cx > W - hw - 6 || cy < top || cy > bot) continue;
          if (!hitAt(cx, cy, hw, hh)) { found = [cx, cy]; break; }
        }
        if (found) [wx, wy] = found;
        else if (!p.rise) { p.cutN = 0; p.life = p.t; continue; }
      }
      // (eased from where it was, so nothing jumps -- unless the eased spot sits on something: then straight to its place)
      let lx = p._l13 && p._lx !== undefined ? p._lx + (wx - p._lx) * 0.35 : wx, ly = p._l13 && p._ly !== undefined ? p._ly + (wy - p._ly) * 0.35 : wy;
      if ((Math.abs(ly - wy) > 0.5 || Math.abs(lx - wx) > 0.5) && hitAt(lx, ly, hw, hh)) { lx = wx; ly = wy; }
      p._ly = ly; p._lx = lx; p._l13 = true;
      placed.push({ x0: lx - hw, y0: ly - hh, x1: lx + hw, y1: ly + hh });
      if (p.rise && this.prio13) this.prio13.push([lx - hw, ly - hh, lx + hw, ly + hh]);   // (RC3: a status word is a priority rect for the cards and tags)
    }
  }
  // (Skull Island's label SLOTS: one status word per spot (~220 px) at a time -- COILS! + PROTECTED BY HIS FEELINGS! + FEAR
  //  POPPED! piled up on Malachar's mask.  The same word with new news (DIZZY! 1/3 -> 2/3) replaces it in place; a bigger word
  //  takes the slot (the one up there goes in 6 frames); a smaller or equal one waits its turn in a queue -- a smaller one
  //  up to a second (PROTECTED... held back under FEAR POPPED! follows it), an equal one a second and a half; past that it is dropped)
  slotLabel(L) {
    if (this.inKeep(L)) { const Q = this.lq || (this.lq = []); if (!Q.some((e) => e.text === L.text)) Q.push({ ...L, until: (this.n || 0) + 240 }); return L; }   // (a keep-out zone over its spot: it waits -- QAF capture)
    const o = this.labelAt(L);
    if (o) {
      if (o.text.split(' ')[0] === L.text.split(' ')[0]) { o.text = L.text; o.col = L.col; o.size = L.size; o.life = L.life; o.t = Math.min(o.t, 6); return o; }
      if (L.size <= o.size) {
        const Q = this.lq || (this.lq = []);
        if (!Q.some((e) => e.text === L.text)) Q.push({ ...L, until: (this.n || 0) + (L.size < o.size ? 60 : 90) });   // (held back, not lost: a big pop word frees the slot at 60 % of its life -- PROTECTED... follows FEAR POPPED!)
        return L;
      }
    }
    return this.putLabel(L);
  }
  /** (Book 2) a screen rect the status labels keep out of while it is up -- the QUAD TEAM ATTACK! banner (game.js drawTeamBanner) and the
   *  speech balloons (drawBalloon) register theirs each drawn frame; a label that would land in one waits in the queue (slotLabel).
   *  avoid: a zone up for long -- the palace's COURAGE meter (src/sipalace.js FearShade.drawCard): no label waits for it (a super's name would
   *  be dropped); every word steps round it in its lane instead (draw: the zone seeds _placed) */
  keepOut(r, frames = 2, avoid = false, tag = '') {   // (tag 'banner': the team banner -- a balloon under it waits)
    const f = this.world?.frame ?? 0, K = (this.keep || (this.keep = [])).filter((k) => k.until >= f), fresh = !avoid && !K.some((k) => Math.abs(k.r[0] - r[0]) < 40 && Math.abs(k.r[1] - r[1]) < 40);
    const same = K.find((k) => !!k.avoid === avoid && k.r[0] === r[0] && k.r[1] === r[1] && k.r[2] === r[2] && k.r[3] === r[3]);
    if (same) same.until = f + frames; else K.push({ r, until: f + frames, avoid, tag }); this.keep = K.slice(-24);
    if (fresh) for (const o of this.list) if (o.type === 'word' && o.rise && o.cutN === undefined && o.t < o.life - 6 && this.inKeep(o, [r])) { o.cutN = 6; o.life = Math.min(o.life, o.t + 6); }   // (one already there makes way)
  }
  /** a label (world x, y, z) whose drawn box falls in a keep-out rect */
  inKeep(L, rs = null) {
    if (!rs) { const f = this.world?.frame ?? 0; if (!this.keep?.length) return false; this.keep = this.keep.filter((k) => k.until >= f); rs = this.keep.filter((k) => !k.avoid).map((k) => k.r); if (!rs.length) return false; }   // (an 'avoid' zone: stepped round at draw time, never waited for)
    const cx = (L.x ?? 0) - (this.world?.camX ?? 0), cy = Math.max(FLOOR_TOP + (L.y ?? 0) - (L.z ?? 0) - 36, this.hudTop ? this.hudTop + (L.size || 30) * 0.66 + 6 : -1e9), hw = String(L.text || '').length * (L.size || 30) * 0.3 + 10, hh = (L.size || 30) * 0.7;
    return rs.some((r) => cx + hw > r[0] && cx - hw < r[2] && cy + hh > r[1] && cy - hh < r[3]);
  }
  /** the young label holding the slot at L's spot (in its first 60%: the rest is its fade, a new one may take over) */
  labelAt(L) { return this.list.find((o) => o.type === 'word' && o.rise && o.t < o.life * 0.6 && Math.abs(o.x - L.x) < 220 && Math.abs(o.y - L.y) < 90); }
  putLabel(L) {
    // (Skull Island: a young hit word at the spot -- SWEEP!, SMASH! -- makes way too, faded over its drawn frames)
    for (const o of this.list) if (o.type === 'word' && !o.rise && o.cutN === undefined && o.t < o.life - 4 && Math.abs(o.x - L.x) < 160 && Math.abs(o.y - L.y) < 80) { o.cutN = 4; o.life = Math.min(o.life, o.t + 4); }
    // (the word up there makes way.  Its 6-frame fade-out runs on DRAWN frames (cutN, src/fx.js draw1): a hit-stop, a slow-mo
    //  or a team blast holds fx.update, and a fade counted there left two words up together for the whole hold -- the QUAD
    //  TEAM ATTACK pile.  One put this same frame (a blast's several hits at once) is not flashed: it goes back in the queue.)
    let back = null;
    for (const o of this.list) if (o.type === 'word' && o.rise && o.t < o.life - 6 && Math.abs(o.x - L.x) < 220 && Math.abs(o.y - L.y) < 90) {
      if (o.t <= 1 && !o.cutN) (back || (back = [])).push(o);
      else { o.life = Math.min(o.life, o.t + 6); if (o.cutN === undefined) o.cutN = 6; }
    }
    if (back) {
      this.list = this.list.filter((o) => !back.includes(o));
      const Q = this.lq || (this.lq = []);
      for (const o of back) if (!Q.some((e) => e.text === o.text)) Q.push({ x: o.x, y: o.y, z: o.z, text: o.text, col: o.col, size: o.size, life: o.life, until: (this.n || 0) + 60 });
    }
    return this.add({ type: 'word', x: L.x, y: L.y, z: L.z, life: L.life, text: L.text, rot: rnd(-6, 6) * DEG, size: L.size, col: L.col, rise: 0.8 });
  }
  dust(x, y, n = 4, spread = 18, dir = 0) {
    for (let i = 0; i < n; i++) {
      this.add({ type: 'dust', x: x + rnd(-spread, spread), y: y + rnd(-3, 3), z: rnd(0, 6), vx: dir * rnd(0.5, 2) + rnd(-0.6, 0.6),
        vz: rnd(0.3, 1.2), r: rnd(6, 11), life: rnd(18, 30) });
    }
  }
  poof(x, y, z, big = false) {
    const n = big ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.2, 0.2), s = rnd(1.2, big ? 3.6 : 2.6);
      this.add({ type: 'smoke', x, y, z: z + 30, vx: Math.cos(a) * s, vz: Math.sin(a) * s * 0.8 + 0.6, r: rnd(12, big ? 26 : 20), life: rnd(26, 40) });
    }
    for (let i = 0; i < 5; i++) this.add({ type: 'star', x: x + rnd(-30, 30), y, z: z + rnd(20, 70), vz: rnd(0.5, 1.5), life: rnd(24, 36), r: rnd(5, 9), col: '#fff6c0' });
  }
  hearts(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) this.add({ type: 'heart', x: x + rnd(-30, 30), y, z: z + rnd(10, 50), vx: rnd(-0.5, 0.5), vz: rnd(0.8, 1.8), life: rnd(40, 60), r: rnd(6, 10) });
    for (let i = 0; i < n; i++) this.add({ type: 'star', x: x + rnd(-40, 40), y, z: z + rnd(10, 80), vz: rnd(0.4, 1.4), life: rnd(30, 50), r: rnd(4, 8), col: '#ffe9a0' });
  }
  debris(x, y, z, cols, n = 8) {
    for (let i = 0; i < n; i++) {
      this.add({ type: 'debris', x, y: y + rnd(-6, 6), z: z + rnd(10, 40), vx: rnd(-4, 4), vz: rnd(3, 8), w: rnd(5, 12), h: rnd(4, 8),
        rot: rnd(0, TAU), vr: rnd(-0.3, 0.3), col: pick(cols), life: rnd(40, 60), si: !!this.stagger, ph: this.stagger ? Math.random() : 0 });   // (si: Skull Island draws a shaded shard -- QAF3; Books 1 / 3 draw no extra random number)
    }
  }
  flames(x, y, z, n, opts = {}) {
    // (Skull Island: fewer, smaller tongues that climb less -- a burst or a fireball's trail in the middle of the party covered
    //  the heroes' bodies and faces; drawn as soft painted tongues, see draw1 'flame')
    const si = !!this.stagger, nn = si ? Math.max(1, Math.round(n * 0.6)) : n, sc = (opts.scale || 1) * (si ? 0.8 : 1);
    for (let i = 0; i < nn; i++) {
      this.add({ type: 'flame', x: x + rnd(-8, 8), y: y + rnd(-4, 4), z: z + rnd(0, 10), vx: (opts.vx || 0) + rnd(-1, 1),
        vz: (rnd(1, 3) + (opts.vz || 0)) * (si ? 0.6 : 1), r: rnd(8, 16) * sc, life: rnd(18, 30), green: !!opts.green, si });
    }
  }
  ring(x, y, opts = {}) {   // floor ring of flame tongues (Dragon Flare) or a shockwave
    this.add({ type: 'ring', x, y, z: 0, life: opts.life || 34, rx: opts.rx || 170, ry: opts.ry || 62, green: !!opts.green, blue: !!opts.blue, gold: !!opts.gold, under: true, shock: !!opts.shock, col: opts.col || null });
  }
  /** a soft coloured light (additive) at a point: the supers' and the charged spells' flashes -- never a full-screen white */
  flare(x, y, z, r, life, col) { this.add({ type: 'flare', x, y, z, r, life, col }); }
  /** a sparkle rising off a charging hero */
  rise(x, y, z, col) { this.add({ type: 'rise', x, y, z, vz: rnd(1.2, 2.4), vx: rnd(-0.4, 0.4), life: rnd(20, 30), r: rnd(3, 5.5), col }); }
  /** radial light rays out of a point (a super's last beat, a big hit) */
  rays(x, y, z, col, r = 160, life = 16) { this.add({ type: 'rays', x, y, z, r, life, col, rot: rnd(0, TAU) }); }
  fireDragon(x, y, facing) {
    this.add({ type: 'dragon', x, y, z: 40, life: 40, facing, under: true });
  }
  glow(x, y, z, r, life, green = false, color) {
    this.add({ type: 'glow', x, y, z, r, life, green, color });
  }
  portal(x, y) { this.add({ type: 'portal', x, y, z: 0, life: 80 }); for (let i = 0; i < 10; i++) this.add({ type: 'star', x: x + (Math.random() - 0.5) * 70, y, z: 20 + Math.random() * 140, vz: 0.6 + Math.random(), life: 40 + Math.random() * 30, r: 3 + Math.random() * 4, col: '#bff0ff' }); }
  slash(x, y, z) { this.add({ type: 'slash', x, y, z, life: 12, rot: (Math.random() - 0.5) * 1.6 }); }
  explosion(x, y) {
    this.add({ type: 'boom', x, y, z: 20, life: 26 });
    this.flames(x, y, 10, 14, { vz: 3, scale: 1.4 });
    this.poof(x, y, 0, true);
    for (let i = 0; i < 8; i++) { const a = Math.random() * TAU; this.add({ type: 'bit', x, y, z: 30, vx: Math.cos(a) * 6, vz: Math.sin(a) * 6 + 3, life: 22, col: '#ffcf6a' }); }
  }
  alert(actor) { this.add({ type: 'alert', actor, life: 22 }); }
  balloon(actor, text, life = 120, opts = {}) {
    // one balloon per speaker
    this.list = this.list.filter((p) => !(p.type === 'balloon' && p.actor === actor));
    this.add({ type: 'balloon', actor, text, life, villain: !!opts.villain, king: !!opts.king, dz: opts.dz || 0, ui: this.uiScale || 1, si: !!this.stagger });   // (si: Book Two's balloons pop in from 60%, not from a dot)
  }

  // ------------------------------------------------------------ update / draw
  update() {
    if (this.lq) {   // (Skull Island's queued labels: each in turn as its slot frees, dropped past its wait)
      this.n = (this.n || 0) + 1;
      if (this.lq.length) this.lq = this.lq.filter((L) => { if (this.n > L.until) return false; if (this.labelAt(L) || this.inKeep(L)) return true; this.putLabel(L); return false; });
    }
    for (const L of [this.list, this.under]) {
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        if (!(p.type === 'balloon' && p.held)) p.t++;   // (Book 2: a balloon under the team banner waits, hidden, its line not lost)
        if (p.vx) p.x += p.vx;
        if (p.vz !== undefined) {
          p.z += p.vz;
          if (p.type === 'debris') {
            p.vz -= 0.45; p.rot += p.vr;
            if (p.z < 0) { p.z = 0; p.vz *= -0.35; p.vx *= 0.6; p.vr *= 0.5; }
          } else if (p.type === 'bit') { p.vz -= 0.3; }
          else if (p.type === 'smoke' || p.type === 'dust') { p.vx *= 0.92; p.vz *= 0.93; }
        }
        if (p.rise) p.z += p.rise;
        if (p.t >= p.life || (p.actor && p.actor.gone)) L.splice(i, 1);
      }
    }
  }

  drawUnder(ctx, camX, time) { for (const p of this.under) this.draw1(ctx, p, camX, time); }
  draw(ctx, camX, time) {
    for (const p of this.list) if (p.type !== 'word' && p.type !== 'balloon' && p.type !== 'alert') this.draw1(ctx, p, camX, time);
    this._placed = this.stagger ? (this.keep || []).filter((k) => k.until >= (this.world?.frame ?? 0)).map((k) => ({ x: (k.r[0] + k.r[2]) / 2, y: (k.r[1] + k.r[3]) / 2, hw: (k.r[2] - k.r[0]) / 2, hh: (k.r[3] - k.r[1]) / 2, rot: 0 })) : null;   // (the 'avoid' keep-outs first: the words step round them as round a word -- QAF3, the COURAGE meter)   // (Skull Island: words that would land on one another -- a combo's THWACKs, BEAM BROKEN! and DIZZY! -- step down below the one already there)
    if (this._placed) {   // (Skull Island: the hit words first; then the status words -- CALM!, DIZZY!, STUCK!, labels -- in their own lane ABOVE them)
      for (const p of this.list) if (p.type === 'word' && !p.rise) this.draw1(ctx, p, camX, time);
      for (const p of this.list) if (p.type === 'word' && p.rise) this.draw1(ctx, p, camX, time);
    } else { this.layout13(ctx, camX); for (const p of this.list) if (p.type === 'word') this.draw1(ctx, p, camX, time); }   // (RC: Books 1 / 3 -- layout13)
    this._placed = null;
    if (!this.stagger) {   // (RC3, Books 1 / 3: two balloons on each other -- Ana's new line over Dodongo's fading one -- the older one goes at once)
      const B = this.list.filter((p) => p.type === 'balloon' && !p.king && !p.held && p._br && p.t < p.life);
      for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i]._br, c = B[j]._br; if (a[2] > c[0] && a[0] < c[2] && a[3] > c[1] && a[1] < c[3]) { B[i].life = B[i].t; B[i]._gone = true; } }
    }
    for (const p of this.list) if ((p.type === 'balloon' && !p._gone) || p.type === 'alert') this.draw1(ctx, p, camX, time);
  }

  draw1(ctx, p, camX, time) {
    const sx = p.x - camX, sy = FLOOR_TOP + p.y - p.z;
    const k = p.t / p.life;
    switch (p.type) {
      case 'spark': {
        const r = p.r * (0.6 + 0.6 * Math.min(1, k * 3)), a = 1 - k;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot);
        ctx.globalAlpha = a;
        const n = 8;
        ctx.beginPath();
        for (let i = 0; i < n * 2; i++) {
          const rr = i % 2 ? r * 0.32 : r * (i % 4 ? 0.75 : 1);
          ctx.lineTo(Math.cos(i / (n * 2) * TAU) * rr, Math.sin(i / (n * 2) * TAU) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = p.col === 'green' ? '#7dff6a' : p.col === 'cool' ? '#9fe7ff' : p.col === 'gold' ? '#ffe27a' : p.col === 'purple' ? '#d070ff' : '#ffb02e'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
        ctx.scale(0.55, 0.55); ctx.fillStyle = '#fffbe0'; ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'bit': {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        break;
      }
      case 'word': {
        if (p.cutN !== undefined && p.cutN <= 0) break;   // (Skull Island: a status word that made way -- faded out over its drawn frames)
        const p0 = this.stagger && p.rise ? 0.75 : 0.4, pop = k < 0.15 ? p0 + (k / 0.15) * (1.2 - p0) : k < 0.25 ? 1.2 - (k - 0.15) * 2 : 1;   // (Skull Island: a status word pops in from 75 %, never a 10 px sliver)
        // (never up in the HUD band -- over the boss's name and bar, behind the hero panels: held under its bottom)
        let wy = this.hudTop ? Math.max(sy - 30 - k * 14, this.hudTop + p.size * 0.6) : sy - 30 - k * 14;
        let wx = sx;
        if (!this.stagger && p._l13) { wx = p._lx; wy = p._ly; }   // (RC: Books 1 / 3 -- where layout13 put it)
        if (this._placed) {   // (eased, so a word does not jump when the one above it goes)
          const hw = p.text.length * p.size * 0.26 + 6, hh = p.size * 0.5;
          if (p._tw === undefined) { ctx.font = `${p.size}px Bangers, Impact, sans-serif`; p._tw = ctx.measureText(p.text).width; }   // (its real width, once)
          { const m = ctx.getTransform(), k0 = (ctx.canvas?.width || 960) / 960, zs = Math.abs(m.a) / k0 || 1, ox = m.e / k0, hx = Math.max(hw * 1.15, p._tw * 0.6 + p.size * 0.16) * zs;   // (the transform's zoom and offset, game px)
            wx = (Math.min(Math.max(ox + zs * sx, 48 + hx), 912 - hx) - ox) / zs; }   // (Skull Island: kept inside a TV's action-safe area, x 48..912 -- a super's name at the edge was cut off)
          const top = this.hudTop ? this.hudTop + p.size * 0.66 + 6 + Math.abs(Math.sin(p.rot || 0)) * p._tw * 0.5 : hh;   // (its pop and tilt clear of the HUD band: PROTECTED... touched the FEELINGS row -- final art pass)
          if (wy < top) wy = top;
          // (a status word on a tall, slim boss's face -- Malachar, Blunderbeard -- never.  Every step below checks the face box F: below it, on
          //  the chest, if that stays clear; else beside the face, toward the middle of the screen, for the rest of the word's life.  QAF3: at
          //  4P the HUD clamp, the step over the heroes' heads and the lane steps put PROTECTED BY HIS FEELINGS! back on the mask)
          const B = p.rise && this.world?.boss;
          const F = B && B.alive !== false && !B.gone && (B.h || 0) > 170 && (B.w || 99) < 70 ? { x: B.x - camX, y0: FLOOR_TOP + B.y - (B.z || 0) - B.h - 14, y1: FLOOR_TOP + B.y - (B.z || 0) - B.h * 0.68 } : null;
          const onFace = (x, y) => !!F && Math.abs(x - F.x) < hw + 40 && y + hh > F.y0 && y - hh < F.y1;
          const place = (wx, wy) => {   // -> [x, y, ends on the face (or was kept on a hero's head by it)]
            let up = !!p.rise, bad = false;   // (a status word steps UP over what is there, a hit word down -- each in its own lane; no room above the HUD clamp: down)
            if (onFace(wx, wy)) { wy = F.y1 + hh + 4; up = false; }
            if (p.rise && this.world?.L?.palace) {   // (the King's head in the palace crystal: a status word steps aside -- the nearer side that fits and is off a face; right first it was, and A LITTLE BRIGHTER... landed on the mask)
              const kx = PAL.CRYSTAL_X - camX, ky0 = PAL.CRYSTAL_Y - 84, ky1 = PAL.CRYSTAL_Y + 12;
              const hw2 = Math.min(hw * 1.15, p._tw * 0.6 + p.size * 0.16);   // (its real half-width, as the safe-area clamp's: the estimate was 40 % wide -- no side fitted at 4P)
              if (Math.abs(wx - kx) < hw2 + 58 && wy + hh > ky0 && wy - hh < ky1) {
                const xr = kx + 58 + hw2, xl = kx - 58 - hw2, okR = xr + hw2 <= 912 && !onFace(xr, wy), okL = xl - hw2 >= 48 && !onFace(xl, wy);
                if (okR || okL) wx = okR && (!okL || Math.abs(xr - wx) <= Math.abs(xl - wx)) ? xr : xl;
                else if (!onFace(wx, ky1 + hh + 2)) wy = ky1 + hh + 2;   // (no side free -- the screen's edge one way, a face the other: under the King)
                else wx = xr + hw2 <= 912 ? xr : Math.max(48 + hw2, xl);
              }
            }
            const hs = (this.world?.players || []).filter((q) => !q.out && !q.hidden).map((q) => [q.x - camX, FLOOR_TOP + q.y - (q.z || 0) - (q.art?.META?.height || 140)]), tx = hs.length > 1 ? 18 : 0;   // (2P+: the tags stand side by side, a step apart)
            const onTag = (x, y) => hs.filter(([qx, qt]) => Math.abs(x - qx) < hw + 26 + tx && y + hh > qt - 50 && y - hh < qt + 34);
            const offTags = (force = false) => {   // (Skull Island: a word -- status or hit -- never on the heroes' heads / P-tags: DRAGON FLARE! and BOOM! sat on a 4P party's faces; up over them while there is room, till clear -- TORCH OUT! among the P-tags, final art pass)
              for (let n = 0; n < 4; n++) {
                const on = onTag(wx, wy); if (!on.length) break;
                const upY = Math.min(...on.map(([, qt]) => qt)) - 50 - hh - 2;
                if (!force && upY - hh >= top && !onFace(wx, upY)) { wy = upY; continue; }
                if (!force && upY - hh >= top) bad = true;
                if (p.rise && hs.length > 1) {   // (no room above the bunch: beside it, the nearer side that fits)
                  const w2 = Math.max(hw * 1.15, p._tw * 0.6 + p.size * 0.16), x0 = Math.min(...on.map(([qx]) => qx)) - 26 - tx - w2 - 4, x1 = Math.max(...on.map(([qx]) => qx)) + 26 + tx + w2 + 4;
                  const xs = [x0, x1].filter((x) => x - w2 >= 48 && x + w2 <= 912 && !onFace(x, wy) && !onTag(x, wy).length).sort((a, b) => Math.abs(a - wx) - Math.abs(b - wx));
                  if (xs.length) wx = xs[0];
                }
                break;
              }
            };
            offTags();
            const gap = (r) => p.rise ? (Math.abs(Math.sin(p.rot || 0)) * hw + Math.abs(Math.sin(r.rot || 0)) * r.hw) * 0.5 : 0;   // (two tilted status words stacked 2 px apart touched at their ends: room for the tilt)
            const lanes = () => { for (let i = 0; i < 5; i++) {
              const hit = this._placed.find((r) => Math.abs(r.x - wx) < r.hw + hw && Math.abs(r.y - wy) < r.hh + hh + gap(r)); if (!hit) break;
              const g2 = gap(hit) + (p.rise ? 6 : 0), uy = hit.y - hit.hh - hh - 2 - g2;   // (status words: 6 px more between them -- PROTECTED... sat tight on A LITTLE BRIGHTER...)
              if (up && uy >= top && !onFace(wx, uy)) wy = uy; else { up = false; wy = hit.y + hit.hh + hh + 2 + g2; }
            } };
            lanes();
            if (onTag(wx, wy).length) { up = !!p.rise; offTags(); lanes(); if (onTag(wx, wy).length) { offTags(true); lanes(); } }   // (a lane step can put it back on a tag: once more -- and then beside the bunch)
            return [wx, wy, bad || onFace(wx, wy)];
          };
          let P = p._side && F ? null : place(wx, wy);
          if (F && (!P || P[2])) { p._side = p._side || (F.x > 480 ? -1 : 1); const hx = Math.max(hw * 1.15, p._tw * 0.6 + p.size * 0.16); P = place(Math.min(Math.max(F.x + p._side * (hx + 52), 48 + hx), 912 - hx), wy); }   // (beside the face, toward the middle)
          wx = P[0]; wy = P[1];
          p._wy = p._wy === undefined || onFace(wx, p._wy) ? wy : p._wy + (wy - p._wy) * 0.35; wy = p._wy;   // (eased -- but never eased across the face)
          this._placed.push({ x: wx, y: wy, hw, hh, rot: p.rot });
        }
        ctx.save(); ctx.translate(wx, wy); ctx.rotate(p.rot); ctx.scale(pop, pop);
        ctx.globalAlpha = (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1) * (p.cutN !== undefined ? p.cutN-- / 6 : 1);
        ctx.font = `${p.size}px Bangers, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = p.size * 0.26; ctx.strokeStyle = INK; ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.col; ctx.fillText(p.text, 0, 0);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(p.text, -1.2, -1.6);
        ctx.fillStyle = p.col; ctx.fillText(p.text, 0, 0.4);
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'dust': {
        const r = p.r * (0.6 + k * 0.9);
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.fillStyle = '#efe9e2'; ctx.strokeStyle = 'rgba(33,20,28,0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'smoke': {
        const r = p.r * (0.5 + k * 0.9);
        ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
        ctx.fillStyle = p.col || '#f4f0f6'; ctx.strokeStyle = INK; ctx.lineWidth = 2.2;   // (col: a grey gun-smoke, the cannonballs')
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = p.col2 || '#cfc8d8'; ctx.beginPath(); ctx.arc(sx + r * 0.25, sy + r * 0.25, r * 0.6, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'frost': {   // (an ice breath's puff: soft, no ink -- white at the mouth, going ice-cyan as it spreads)
        const r = p.r * (1 + k * 1.5), a = (k < 0.12 ? k / 0.12 : 1) * (1 - k);
        ctx.save();
        ctx.globalAlpha = a * 0.45; ctx.drawImage(glowSprite(GLOW_ICE), sx - r * 2, sy - r * 2, r * 4, r * 4);   // (a cyan haze: it reads on the snow too)
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * (1 - k) * 0.9; ctx.drawImage(glowSprite(GLOW_FROST), sx - r * 1.3, sy - r * 1.3, r * 2.6, r * 2.6);
        ctx.globalAlpha = a * k * 0.8; ctx.drawImage(glowSprite(GLOW_BLUE), sx - r * 1.5, sy - r * 1.5, r * 3, r * 3);
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'star': case 'heart': {
        ctx.save(); ctx.translate(sx, sy); ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        const r = p.r * (k < 0.2 ? k / 0.2 : 1);
        ctx.beginPath();
        if (p.type === 'star') {
          for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.4 : r; ctx.lineTo(Math.cos(i * Math.PI / 4 + time * 3) * rr, Math.sin(i * Math.PI / 4 + time * 3) * rr); }
          ctx.closePath(); ctx.fillStyle = p.col;
        } else {
          ctx.moveTo(0, r * 0.9); ctx.bezierCurveTo(-r * 1.6, -r * 0.2, -r * 0.6, -r * 1.3, 0, -r * 0.45);
          ctx.bezierCurveTo(r * 0.6, -r * 1.3, r * 1.6, -r * 0.2, 0, r * 0.9); ctx.fillStyle = '#ff6f8f';
        }
        ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'debris': {
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot);
        ctx.globalAlpha = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
        ctx.fillStyle = p.col; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
        if (p.si) {   // (Skull Island: a tapered shard -- a broken edge, a point -- shaded below, lit above, inked: the flat squares read as confetti, QAF3; Books 1 / 3 as before)
          // (its kind read off its colour, as the callers pass only colours: gold -> a nugget with a glint, a warm brown -> a long
          //  splinter / slat, anything else -> a shard; the QAF3 critics: plank chunks read as rocks, pale gold as cheese)
          const kind = p.kind || (p.kind = debrisKind(p.col)), j = (p.ph - 0.5) * 0.4, path = new Path2D();
          const L = kind === 'slat' ? p.w * 0.9 + 4 : p.w * 0.62 + 2, T = kind === 'slat' ? p.h * 0.38 + 1 : p.h * 0.62 + 1;
          if (kind === 'nugget') { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, r = (i % 2 ? L : T) * (0.85 + 0.15 * Math.sin(p.ph * 9 + i * 2)) * 0.9; if (i) path.lineTo(Math.cos(a) * r, Math.sin(a) * r); else path.moveTo(Math.cos(a) * r, Math.sin(a) * r); } path.closePath(); }
          else if (kind === 'slat') { path.moveTo(-L, -T); path.lineTo(L * 0.55, -T * 0.7); path.lineTo(L, 0); path.lineTo(L * 0.5, T * 0.8); path.lineTo(-L, T); path.lineTo(-L * 0.88, 0); path.closePath(); }
          else { path.moveTo(-L, -T * (0.8 + j)); path.lineTo(L * 0.2, -T); path.lineTo(L, -T * 0.1); path.lineTo(L * 0.3, T * (0.9 - j)); path.lineTo(-L * 0.7, T); path.closePath(); }
          ctx.fill(path);
          ctx.save(); ctx.clip(path);
          ctx.fillStyle = 'rgba(30,14,24,0.34)'; ctx.fillRect(-L * 1.2, T * 0.05, L * 2.4, T * 2);
          if (kind === 'nugget') { ctx.fillStyle = 'rgba(255,250,220,0.9)'; ctx.beginPath(); ctx.arc(-L * 0.25, -T * 0.35, Math.max(1.2, T * 0.32), 0, TAU); ctx.fill(); }   // (a glint, the gold itself left saturated)
          else { ctx.fillStyle = 'rgba(255,248,232,0.3)'; ctx.fillRect(-L * 1.2, -T * 2, L * 2.4, T * 1.3); }
          if (kind === 'slat') { ctx.strokeStyle = 'rgba(52,26,12,0.5)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-L * 0.8, T * 0.1); ctx.lineTo(L * 0.6, 0); ctx.stroke(); }   // (the grain)
          ctx.restore();
          ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke(path);
        } else { ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'flame': {
        if (p.si) {   // (Skull Island: a soft painted tongue and a small glow; over a hero's body it thins to 40 %, so the hero reads through it)
          const r = p.r * (1 - k * 0.6), W0 = this.world;
          let over = 1;
          if (W0) for (const q of W0.players) { if (q.out) continue; const qx = q.x - camX, qf = FLOOR_TOP + q.y - (q.z || 0), qh = (q.art?.META?.height || 140); if (Math.abs(sx - qx) < 34 + r * 0.5 && sy < qf - 10 && sy > qf - qh - 10) { over = k < 0.2 ? 1 : 0.4; break; } }   // (the first 0.1 s at full strength -- the hit lands -- then thin)
          const prev = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (1 - k) * 0.6 * over;
          const gr0 = r * (k < 0.2 ? 1.7 - 3 * k : 1.1), gl = glowSprite(p.green ? GLOW_GREEN : GLOW_FIRE); ctx.drawImage(gl, sx - gr0, sy - gr0, gr0 * 2, gr0 * 2);   // (a bigger flash of glow as it bursts)
          ctx.globalCompositeOperation = prev;
          ctx.globalAlpha = (1 - k * k) * over;
          const fl = softFlame(p.green), w = r * 1.05 * (1 + 0.12 * Math.sin(p.x * 0.7 + k * 18)), h = r * 1.9;
          ctx.drawImage(fl, sx - w / 2, sy - h * 0.72, w, h);
          ctx.globalAlpha = 1;
          break;
        }
        const r = p.r * (1 - k * 0.7);
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - k;
        const g = glowSprite(p.green ? GLOW_GREEN : GLOW_FIRE);
        ctx.drawImage(g, sx - r * 1.6, sy - r * 1.6, r * 3.2, r * 3.2);
        ctx.globalCompositeOperation = prev;
        flameTongue(ctx, sx, sy, r * 0.9, p.green, k, p.x);
        ctx.globalAlpha = 1;
        break;
      }
      case 'glow': {
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - k) * 0.9;
        const r = p.r * (0.7 + 0.5 * k);
        ctx.drawImage(glowSprite(glowCol(p)), sx - r, sy - r, r * 2, r * 2);
        ctx.globalCompositeOperation = prev; ctx.globalAlpha = 1;
        break;
      }
      case 'ring': {
        const e = 1 - Math.pow(1 - Math.min(1, k * 1.6), 3);
        const rx = p.rx * e, ry = p.ry * e;
        ctx.save();
        if (p.shock) {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.col ? rgba(p.col, 0.14) : p.green ? 'rgba(120,255,120,0.12)' : p.blue ? 'rgba(130,210,255,0.14)' : p.gold ? 'rgba(255,220,120,0.1)' : 'rgba(255,240,200,0.12)';
          ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU); ctx.fill();
          ctx.lineWidth = 22 * (1 - k) + 4; ctx.strokeStyle = p.col ? rgba(p.col, 0.9) : p.green ? 'rgba(141,255,122,0.85)' : p.blue ? 'rgba(150,220,255,0.9)' : p.gold ? 'rgba(255,214,90,0.8)' : 'rgba(255,241,196,0.9)';
          ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU); ctx.stroke();
          ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.beginPath(); ctx.ellipse(sx, sy, rx + 6, ry + 3, 0, 0, TAU); ctx.stroke();
        } else {
          // scorched glow on the floor + flame tongues standing on the ring
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (1 - k) * 0.7;
          const g = glowSprite(GLOW_FIRE);
          ctx.drawImage(g, sx - rx * 1.2, sy - ry * 1.2, rx * 2.4, ry * 2.4);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          const n = 22;
          const tongues = [];
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + k * 0.6;
            tongues.push([sx + Math.cos(a) * rx, sy + Math.sin(a) * ry, Math.sin(a)]);
          }
          tongues.sort((a, b) => a[1] - b[1]);
          const h = 46 * (1 - k) * (0.5 + e);
          tongues.forEach(([x, y], i) => {
            const v = 0.45 + 0.35 * ((i * 7919) % 11) / 10 + 0.2 * Math.sin(x * 0.7 + time * 20 + i);
            flameTongue(ctx, x, y - h * 0.35 * v, h * v, false, k, x);
          });
        }
        ctx.restore();
        break;
      }
      case 'dragon': drawFireDragon(ctx, sx, sy, p, k, time); break;
      case 'flare': {
        const r = p.r * (0.75 + 0.35 * k), a = (1 - k) * (1 - k);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(sx, sy, 2, sx, sy, r);
        gr.addColorStop(0, rgba('#fff4d8', 0.8 * a)); gr.addColorStop(0.25, rgba(p.col, 0.6 * a)); gr.addColorStop(1, rgba(p.col, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'rise': {
        const r = p.r * (1 - k * 0.5);
        ctx.save(); ctx.translate(sx, sy); ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glowSprite(rgba(p.col, 'A')), -r * 3, -r * 3, r * 6, r * 6);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.moveTo(0, -r * 1.6); ctx.lineTo(r * 0.6, 0); ctx.lineTo(0, r * 1.6); ctx.lineTo(-r * 0.6, 0); ctx.closePath(); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'rays': {
        const a = 1 - k, R = p.r * (0.6 + 0.6 * Math.min(1, k * 2.5)), n = 14;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot + k * 0.4); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n; i++) {
          const an = (i / n) * TAU, w = 0.07 + 0.05 * (i % 2);
          ctx.fillStyle = rgba(i % 2 ? '#fff4d8' : p.col, 0.5 * a);
          ctx.beginPath(); ctx.moveTo(Math.cos(an - w) * R * 0.2, Math.sin(an - w) * R * 0.2);
          ctx.lineTo(Math.cos(an) * R * (i % 2 ? 0.8 : 1), Math.sin(an) * R * (i % 2 ? 0.8 : 1)); ctx.lineTo(Math.cos(an + w) * R * 0.2, Math.sin(an + w) * R * 0.2); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'portal': {
        // a blue crystal portal: opens, holds, closes
        const open = k < 0.2 ? k / 0.2 : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        ctx.save(); ctx.translate(sx, sy - 80);
        const prev = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glowSprite(GLOW_BLUE), -90 * open, -120 * open, 180 * open, 240 * open);
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = `rgba(110,200,255,${(0.6 - i * 0.15) * open})`; ctx.lineWidth = 9 - i * 2.5;
          ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1, (46 + i * 8 + Math.sin(time * 7 + i) * 3) * open), Math.max(1, (84 + i * 8) * open), 0, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = `rgba(150,220,255,${0.35 * open})`; ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1, 44 * open), Math.max(1, 82 * open), 0, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = prev;
        ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(33,20,28,${0.6 * open})`;
        ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1, 52 * open), Math.max(1, 90 * open), 0, 0, TAU); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'slash': {
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot);
        const a = 1 - k, L = 70 + 40 * Math.min(1, k * 3);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#7a3aa8'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-L, 0); ctx.quadraticCurveTo(0, -10, L, 0); ctx.quadraticCurveTo(0, 4, -L, 0); ctx.fill(); ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'boom': {
        const r = 30 + 70 * Math.min(1, k * 2.2);
        ctx.save(); ctx.globalAlpha = 1 - k;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glowSprite(GLOW_FIRE), sx - r * 1.6, sy - r * 1.6, r * 3.2, r * 3.2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        for (let i = 0; i < 18; i++) { const rr = i % 2 ? r * 0.6 : r; const a = (i / 18) * TAU; ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.8); }
        ctx.closePath(); ctx.fillStyle = '#ffb02e'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'bolt': {
        // lightning from the top of the screen down to the floor point
        ctx.save(); ctx.globalAlpha = 1 - k;
        let x = sx + (Math.random() - 0.5) * 30, y = -10;
        ctx.beginPath(); ctx.moveTo(x, y);
        while (y < sy) { y += 28 + Math.random() * 20; x += (Math.random() - 0.5) * 34; ctx.lineTo(Math.min(Math.max(x, sx - 40), sx + 40), Math.min(y, sy)); }
        ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(150,210,255,0.5)'; ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'wind': {
        ctx.save(); ctx.globalAlpha = 0.5 * (1 - k);
        ctx.strokeStyle = '#f4f8ff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx - Math.sign(p.vx) * p.len * 0.5, sy - 6, sx - Math.sign(p.vx) * p.len, sy); ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
      case 'balloon': { const r = drawBalloon(ctx, p, camX, k, this.hudTop || 0, p.si ? (this.keep || []).filter((q) => q.tag === 'banner' && q.until >= (this.world?.frame ?? 0)).map((q) => q.r) : (this.k13 || []).filter((q) => q.tag === 'banner' && q.until >= (this.dn || 0)).map((q) => q.r)); if (p.si && r) this.keepOut(r, 2); else if (r && !this.stagger) { this.keep13(r, 2); p._br = r; this.prio13?.push(r); } break; }   // (RC2, Books 1 / 3: a balloon under the team banner waits too, as Book 2's -- TRIPLE TEAM ATTACK! hid "...f you can!")   // (Book 2: a balloon is a keep-out zone for the status labels)
      case 'alert': {
        // comic "!" over the head: the enemy is about to attack
        const a = p.actor; if (!a || a.gone) break;
        const big = a.boss ? 1.8 : 1;
        let x = a.x - camX + (a.boss ? -(a.facing || 1) * 90 : 0), y = FLOOR_TOP + a.y - a.z - (a.balloonH || 160) + 22 + (a.hz0 || 0) + (a.boss ? 60 : 0);
        if (this.stagger) { x = clamp(x, 48 + 20 * big, 912 - 20 * big); y = Math.max(y, 27 + 40 * big); }   // (Skull Island: inside a TV's action-safe area)
        const s = (p.t < 5 ? 0.5 + p.t * 0.12 : 1) * big * (a.boss ? 1 + 0.12 * Math.max(0, Math.sin(p.t * 0.6)) : 1);
        ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const r = i % 2 ? 11 : 19; const an = i / 16 * TAU; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
        ctx.closePath(); ctx.fillStyle = '#ffe23a'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
        ctx.font = '26px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#d8231a'; ctx.fillText('!', 0, 1);
        ctx.restore(); ctx.globalAlpha = 1;
        break;
      }
    }
  }
}

// cartoon flame: a teardrop with a hot core, ink-outlined
function flameTongue(ctx, x, y, r, green, k, seed) {
  if (r < 2) return;
  const w = Math.sin(seed * 1.7 + k * 20) * r * 0.25;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.7);
  ctx.bezierCurveTo(-r * 0.9, r * 0.5, -r * 0.7, -r * 0.4, w, -r * 1.4);
  ctx.bezierCurveTo(r * 0.7, -r * 0.4, r * 0.9, r * 0.5, 0, r * 0.7);
  ctx.fillStyle = green ? '#2fbf4f' : '#e8401f'; ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.12); ctx.strokeStyle = INK; ctx.stroke();
  ctx.scale(0.66, 0.66); ctx.translate(0, r * 0.25);
  ctx.beginPath(); ctx.moveTo(0, r * 0.7);
  ctx.bezierCurveTo(-r * 0.9, r * 0.5, -r * 0.7, -r * 0.4, w, -r * 1.4);
  ctx.bezierCurveTo(r * 0.7, -r * 0.4, r * 0.9, r * 0.5, 0, r * 0.7);
  ctx.fillStyle = green ? '#8dff6a' : '#ffa526'; ctx.fill();
  ctx.scale(0.55, 0.55); ctx.translate(0, r * 0.3);
  ctx.beginPath(); ctx.moveTo(0, r * 0.7);
  ctx.bezierCurveTo(-r * 0.9, r * 0.5, -r * 0.7, -r * 0.4, w, -r * 1.4);
  ctx.bezierCurveTo(r * 0.7, -r * 0.4, r * 0.9, r * 0.5, 0, r * 0.7);
  ctx.fillStyle = green ? '#e6ffd0' : '#fff2a0'; ctx.fill();
  ctx.restore();
}

// the spirit of Dodongo's inner dragon: a huge head of cartoon flame that rises behind him and roars
function dragonHead(c, j, w) {
  c.moveTo(-58, 112);
  c.lineTo(-76, 64); c.lineTo(-114 + w, 52); c.lineTo(-74, 30);
  c.lineTo(-108 - w, 2); c.lineTo(-64, -4);
  c.lineTo(-96 + w, -42); c.lineTo(-48, -34);
  c.lineTo(-86, -108 - w); c.lineTo(-20, -60);           // back horn
  c.lineTo(-42, -130 + w); c.lineTo(4, -58);             // front horn
  c.quadraticCurveTo(34, -54, 70, -38);
  c.quadraticCurveTo(84, -42, 94, -34);                   // nostril bump
  c.quadraticCurveTo(108, -26, 104, -12);
  c.lineTo(94, -8); c.lineTo(88, 2); c.lineTo(80, -8); c.lineTo(72, 2); c.lineTo(64, -8);   // upper teeth
  c.lineTo(32, 4 + 4 * j);
  c.lineTo(56, 16 + 22 * j); c.lineTo(62, 6 + 22 * j); c.lineTo(68, 18 + 24 * j); c.lineTo(76, 8 + 25 * j);   // lower teeth
  c.lineTo(88, 22 + 27 * j);
  c.quadraticCurveTo(84, 40 + 30 * j, 70, 42 + 30 * j);
  c.quadraticCurveTo(40, 52 + 20 * j, 4, 66);
  c.quadraticCurveTo(-18, 80, -22, 112);
  c.closePath();
}
function drawFireDragon(ctx, sx, sy, p, k, time) {
  // a trailing body of flame along its path
  const travel = (u) => 230 * (1 - Math.pow(1 - u, 2));
  for (let i = 4; i >= 1; i--) {
    const u = Math.max(0, k - i * 0.07);
    const bx = sx + p.facing * (travel(u) - 30), by = sy - 70 - Math.min(1, u * 2.4) * 50 + i * 12;
    flameTongue(ctx, bx, by, (46 - i * 7) * (1 - k * 0.6), false, k, i * 13 + p.x);
  }
  sx += p.facing * travel(k);
  const rise = Math.min(1, k * 2.4);
  const a = k < 0.1 ? k / 0.1 : k > 0.55 ? Math.max(0, 1 - (k - 0.55) / 0.45) : 1;
  const S = 0.7 + 0.42 * rise;
  const j = 0.35 + 0.65 * Math.max(0, Math.sin(Math.min(1, k * 1.8) * Math.PI));
  const w = Math.sin(time * 18) * 6;
  ctx.save();
  ctx.translate(sx + p.facing * 6, sy - 96 - rise * 62);
  ctx.scale(p.facing * S, S);
  ctx.rotate(-0.12 + 0.1 * Math.sin(k * 8));
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * 0.8;
  ctx.drawImage(glowSprite(GLOW_FIRE), -190, -180, 380, 360);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a * 0.92;
  ctx.lineJoin = 'round';
  ctx.beginPath(); dragonHead(ctx, j, w);
  ctx.fillStyle = '#e8401f'; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  // inner layers of the flame (orange, then a hot yellow core around the eye and jaw)
  ctx.save(); ctx.translate(14, 10); ctx.scale(0.8, 0.8);
  ctx.beginPath(); dragonHead(ctx, j, -w); ctx.fillStyle = '#ffa526'; ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(34, 4); ctx.scale(0.52, 0.52);
  ctx.beginPath(); dragonHead(ctx, j, w); ctx.fillStyle = '#fff2a0'; ctx.fill();
  ctx.restore();
  // brow ridge + glowing eye
  ctx.fillStyle = '#fffdf0';
  ctx.beginPath(); ctx.moveTo(18, -36); ctx.quadraticCurveTo(38, -46, 54, -32); ctx.quadraticCurveTo(36, -26, 18, -36); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(38, -35, 2.2, 5, 0, 0, TAU); ctx.fill();
  ctx.restore(); ctx.globalAlpha = 1;
}

function drawBalloon(ctx, p, camX, k, hudTop = 0, banners = null) {
  const a = p.actor;
  const sx = a.x - camX, sy = FLOOR_TOP + a.y - a.z - (a.balloonH || 170) - p.dz;
  const pop = k * p.life < 6 ? (p.si ? 0.6 + 0.4 * (k * p.life) / 6 : (k * p.life) / 6) : 1;
  const fade = p.life - k * p.life < 10 ? (p.life - k * p.life) / 10 : 1;
  ctx.save();
  const fs = Math.round(17 * p.ui), lh = Math.round(20 * p.ui);
  ctx.font = `bold ${fs}px "Comic Neue", "Comic Sans MS", sans-serif`;
  const lines = p.text.split('\n');
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 26;
  const h = lines.length * lh + 16 + (p.cue ? 6 : 0);
  let bx = p.si ? clamp(sx - w / 2, 48, 912 - w) : clamp(sx - w / 2, 8, 960 - w - 8), by = Math.max(92, hudTop + 8, sy - h);
  if (p.si && !p.king) {   // (Book 2 -- final art pass / tech gate)
    const B = a.game?.boss;   // (never over a tall slim boss's face: Malachar's "I'll finish you MYSELF!" sat on his mask at 4P -- beside it, the speaker's side, his own toward the middle)
    if (B && B.alive !== false && !B.gone && (B.h || 0) > 170 && (B.w || 99) < 70) {
      const fx = B.x - camX, fy0 = FLOOR_TOP + B.y - (B.z || 0) - B.h - 14, fy1 = FLOOR_TOP + B.y - (B.z || 0) - B.h * 0.68, onF = (x, y) => x < fx + 36 && x + w > fx - 36 && y < fy1 && y + h + 16 > fy0;
      if (onF(bx, by)) { const sd = a === B ? (fx > 480 ? -1 : 1) : sx < fx ? -1 : 1, xs = [sd, -sd].map((s) => (s < 0 ? fx - 44 - w : fx + 44)).filter((x) => x >= 48 && x + w <= 912 && !onF(x, by)); if (xs.length) bx = xs[0]; else by = Math.max(by, fy1 + 6); }
    }
    { const m = ctx.getTransform(), k0 = (ctx.canvas?.width || 960) / 960, zs = Math.abs(m.a) / k0 || 1, ox = m.e / k0, lo = (50 - ox) / zs, hi = (910 - ox) / zs - w; bx = Math.min(Math.max(bx, lo), Math.max(lo, hi)); }   // (inside x 48..912 in screen px: a super's punch-in pushed edge balloons out)
    const rr = [bx - 8, by - 26, bx + w + 8, by + h + 16];
    p.held = !!(banners && banners.some((q) => rr[0] < q[2] && rr[2] > q[0] && rr[1] < q[3] && rr[3] > q[1]));   // (under the team banner: it waits -- QUAD TEAM ATTACK! covered a hero's balloon)
    if (p.held) { ctx.restore(); return null; }
  }   // (below the HUD band -- its panels, the boss bar and meter: a raised first-super line rose into it)
  if (!p.si && !p.king) {   // (Books 1 / 3: a boss whose face sits where balloons go -- Morvath's 1.25x head under the HUD band -- keeps them beside it: B.balloonFace)
    const B = a.game?.boss, F = B && B.alive !== false && !B.gone ? B.balloonFace : null;
    if (F) {
      const fx = F.x - camX, base = FLOOR_TOP + B.y - (B.z || 0), fy0 = base - F.top, fy1 = base - F.bottom, onF = (x, y) => x < fx + F.hw && x + w > fx - F.hw && y < fy1 && y + h + 16 > fy0;
      if (onF(bx, by)) {
        const hs = (a.game?.players || []).filter((q) => !q.out), near = hs.length ? hs.reduce((m, q) => (Math.abs(q.x - B.x) < Math.abs(m.x - B.x) ? q : m)) : null;
        const sd = a === B ? (near ? (near.x < B.x ? -1 : 1) : fx > 480 ? -1 : 1) : sx < fx ? -1 : 1;
        const xs = [sd, -sd].map((s) => (s < 0 ? fx - F.hw - 10 - w : fx + F.hw + 10)).filter((x) => x >= 8 && x + w <= 952 && !onF(x, by));
        if (xs.length) bx = xs[0]; else by = Math.max(by, fy1 + 6);   // (beside the face, the speaker's side; no room either side: under it)
      }
    }
    // (RC2, Books 1 / 3: under the team attack's banner it waits, its line not lost -- as Book 2's: TRIPLE TEAM ATTACK! covered "...f you can!")
    if (!p.king) { const rr = [bx - 8, by - 26, bx + w + 8, by + h + 16]; p.held = !!(banners && banners.some((q) => rr[0] < q[2] && rr[2] > q[0] && rr[1] < q[3] && rr[3] > q[1])); if (p.held) { ctx.restore(); return null; } }
  }
  const gx = a.x + (a.facing || 1) * (a.gemDx ?? 22) - camX, gy = FLOOR_TOP + a.y - a.z - (a.gemZ ?? 186);
  if (p.king) { bx = clamp(gx - (a.facing || 1) * 170 - w / 2, 8, 960 - w - 8); by = Math.max(76, gy - 150 - h); }
  ctx.globalAlpha = fade;
  ctx.translate(bx + w / 2, by + h); ctx.scale(pop, pop); ctx.translate(-(bx + w / 2), -(by + h));
  const tx = clamp(p.king ? gx : sx, bx + 16, bx + w - 16);
  if (p.king) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 110);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprite(GLOW_GREEN), gx - 26 - 10 * pulse, gy - 26 - 10 * pulse, 52 + 20 * pulse, 52 + 20 * pulse);
    ctx.restore();
    const x0 = tx, y0 = by + h - 2, n = 5;
    ctx.beginPath(); ctx.moveTo(x0 - 7, y0);
    for (let i = 1; i < n; i++) { const u = i / n; ctx.lineTo(x0 + (gx - x0) * u + (i % 2 ? 8 : -8), y0 + (gy - y0) * u); }
    ctx.lineTo(gx, gy);
    for (let i = n - 1; i >= 1; i--) { const u = i / n; ctx.lineTo(x0 + (gx - x0) * u + (i % 2 ? 15 : -1), y0 + (gy - y0) * u); }
    ctx.lineTo(x0 + 7, y0); ctx.closePath();
    ctx.fillStyle = '#17251b'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#5ad35f'; ctx.stroke();
  }
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(bx, by, w, h, 14) : ctx.rect(bx, by, w, h);
  if (!p.king) { ctx.moveTo(tx - 8, by + h - 1); ctx.lineTo(tx + (sx > tx ? 12 : -2), by + h + 16); ctx.lineTo(tx + 9, by + h - 1); }
  const fill = p.king ? '#17251b' : p.villain ? '#e3f5d6' : '#fffef8';
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = p.king ? 4 : 3; ctx.strokeStyle = p.king ? '#5ad35f' : p.villain ? '#1d4a24' : INK; ctx.stroke();
  // cover the tail join
  if (!p.king) { ctx.fillStyle = fill; ctx.fillRect(tx - 7, by + h - 4, 15, 5); }
  ctx.fillStyle = p.king ? '#9dff8a' : p.villain ? '#14361b' : INK; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + 9 + i * lh));
  if (p.king) {
    // name tag: the voice in the gem is the Dragon King
    ctx.font = `${Math.round(14 * p.ui)}px "Luckiest Guy", Bangers, Impact, sans-serif`;
    const tw = ctx.measureText('THE DRAGON KING').width + 14, th = Math.round(18 * p.ui);
    ctx.fillStyle = '#5ad35f'; ctx.fillRect(bx + 10, by - th + 6, tw, th);
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(bx + 10, by - th + 6, tw, th);
    ctx.fillStyle = '#10200f'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('THE DRAGON KING', bx + 17, by - th / 2 + 6);
    ctx.fillStyle = '#9dff8a'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  }
  if (p.si && a.slot !== undefined && a.game?.isTwin?.(a)) {   // (Book Two, a twin talking: a chip in their colour on the balloon's corner says which one -- the two sprites are the same)
    ctx.save();
    const lb = 'P' + (a.slot + 1), th = Math.round(22 * p.ui);
    ctx.font = `${Math.round(17 * p.ui)}px "Luckiest Guy", Bangers, Impact, sans-serif`;
    const tw = ctx.measureText(lb).width + 16, cx = bx + 10, cy = by - th + 7;
    ctx.fillStyle = PLAYER_COLS[a.slot] || '#fff'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx, cy, tw, th, 7) : ctx.rect(cx, cy, tw, th); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText(lb, cx + tw / 2, cy + th / 2 + 1); ctx.fillStyle = '#fff'; ctx.fillText(lb, cx + tw / 2, cy + th / 2 + 1);
    ctx.restore();
  }
  if (p.cue && (performance.now() / 300 | 0) % 2 === 0) {
    // "next" cue: a little triangle in the corner
    ctx.beginPath(); ctx.moveTo(bx + w - 18, by + h - 13); ctx.lineTo(bx + w - 8, by + h - 13); ctx.lineTo(bx + w - 13, by + h - 6); ctx.closePath(); ctx.fill();
  }
  ctx.restore(); ctx.globalAlpha = 1;
  return [bx - 8, by - 26, bx + w + 8, by + h + 16];   // (its box with the P-chip and the tail: Book 2's keep-out zone)
}
