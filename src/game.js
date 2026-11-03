// The world while a level is running: players, actors, camera, fights, save points, bosses, in-level cutscenes.
import { W, H, FLOOR_TOP, DEPTH, INK, PLAYER_COLS } from './config.js';
import { FX } from './fx.js';
import { Player, PERFECT } from './player.js';
import { makeEnemy } from './spawn.js';
import { Prop, Pickup, PICKUPS } from './actors.js';
import { makeThing, ShardPickup, Portal } from './interact.js';
import { QueenSleeper } from './wraith.js';
import { audio } from './audio-proxy.js';
import { LEVELS, levelAt } from './levels.js';
import { variantFor, addDragon, addShard, progress, SHARDS, addPerfect } from './secrets.js';
import { LINES, heroLine } from './story.js';
import { HEROES, storyHero, baseOf } from './heroes.js';
import { writeSave, loadMeta, writeMeta } from './save.js';
import * as HUD from './hud.js';
import { clamp } from './rig.js';
import { cutinReady, drawCutin, drawTeamCutin, drawCutinTail, preloadCutins, CUTIN_FRAMES, CUTIN_FLASH, CUTIN_SKIP, TEAM_FRAMES } from './showcase.js';
import { setSilhouette } from './render.js';
import { drawHeartstone, heartNotches } from './heartstone.js';
import { mmBegin } from './mmworld.js';
import { siBegin } from './siworld.js';
import * as SIFX from './sifx.js';   // (Skull Island's effects and ambient life: L.si only)

const Q = new URLSearchParams(location.search);
export const DEBUG = Q.has('debug');

export function readFrames(text) { return 90 + 25 * String(text).split(/\s+/).filter(Boolean).length; }
export function minFrames(text) { return Math.max(55, Math.round(readFrames(text) * 0.45)); }

// TEAM ATTACK (2 players): one hero's super, then the partner's SUPER while it plays (or within TEAM_WINDOW frames of
// the press), standing within TEAM_RANGE with a bar to spend.  (Either may go first: the one who supers first is `a`;
// the other's press inside the window upgrades it -- so B-then-A is the same rule mirrored.)  A two-hero cut-in, both supers' shows at once (Player
// .teamFx: no damage of their own) and one shared blast TEAM_BLAST frames in that brings every foe on screen to TEAM_DMG
// (a boss: at most 2x one super's, and never the last hit), no meter back.  Levels only (not the duel).
const TEAM_WINDOW = 100, TEAM_RANGE = 340, TEAM_BLAST = 30;
// co-op: foes are tougher with more heroes in play (index = heroes): 2P x1.35, 3P x1.6, 4P x1.85; bosses x1.4 / 2.2 / 2.6
// (3P / 4P bosses ~25% up from 1.75 / 2.1: a 4P Magmaw went down in 15 s) (the attack tokens scale too: World.maxTokens)
export const COOP_HP = [1, 1, 1.35, 1.6, 1.85], COOP_BOSS = [1, 1, 1.4, 2.2, 2.6];
// the hints: at least this long apart (frames, from one's start to the next's)
const HINT_GAP = 25 * 60;
/** (RC) Book 3's boss tips -- what each one's fight asks of you, in beats (World.updateHints: the boss's own, once a run, never the
 *  stage-1 tutorial's "Press [J] to attack!" -- it started in a boss fight whenever the fight was where a run began, or the boss
 *  called guards; Books 1 / 2 have their bosses' own tips).  Keyed by the level's boss kind (crystal: Crystal Magmaw) */
/** (RC3) a TEAM UP! card's candidate offsets from its spot over its hero [dx, dy], nearest first -- up costs less than down (down
 *  covers the hero); round 260 px either way, 192 up or down */
const CARD13 = (() => { const A = []; for (const dx of [0, -50, 50, -100, 100, -150, 150, -200, 200, -260, 260]) for (let dy = -192; dy <= 192; dy += 24) A.push([dx, dy, Math.abs(dx) + Math.abs(dy) * (dy > 0 ? 1.6 : 1.1)]); return A.sort((a, b) => a[2] - b[2]).map(([dx, dy]) => [dx, dy]); })();
const B3_TIPS = {
  grimscale: ['See the "!"? Step back from his big axe!', 'He leaps? JUMP over the green shockwave!'],
  magmaw: ['Keep out of the lava pools. They burn!', 'After his big slam, his head lies flat: HIT IT!'],
  magmaw_crystal: ['He bites in a straight line: step up or down!', 'Hit him while he is out of the water!'],
  tempest: ['Glowing marks on the floor = lightning! Step off them!', 'When she lands, hit her as hard as you can!'],
  dragonking: ['See the "!"? Step away from his claws!', 'He stomps? JUMP over the green ring!'],
  chief: ['See the "!"? Back off! A big punch is coming!', 'Dust at his feet? He will CHARGE: step up or down!'],
  alpha: ['It dives at you in a straight line: step up or down!', 'When it swoops low, hit it!'],
  wraith: ['See the "!"? Step back from its flame swipe!', 'It gets tired after each attack: hit it then!'],
};
const coopK = (n, boss) => (boss ? COOP_BOSS : COOP_HP)[Math.max(1, Math.min(4, n))];   // (more forgiving: were 45 frames / 220 px)
// a super's opening punch-in: SLOW_N frames at half speed while the camera eases in to SLOW_ZOOM on the hero, then a snap
// back; a big hit's impact frames (IMPACT_N frames of white silhouettes on dark)
const SLOW_N = 10, SLOW_ZOOM = 1.1, IMPACT_N = 2;   // (1.1, eased in and out: from 1.13 on an ease-out, the zoom's first frames moved the whole picture
                                                    //  ~12 px a frame -- with the dim lifting, 30-35 % of the screen 'lit' in 3 frames at a team super's start)
const SLOW_OUT = 6;                      // the punch-in eases back out over this many frames (its one-frame snap from 1.13 lit 25-30 % of the
                                         //  screen in 3 frames and darkened up to 21 % in one, at every super's start: the all-books flash pass)
const CARD_RISE = 0.9;                   // a rising boss's card waits till it is this far up (World.bossRise)
const IMPACT_SOFT = [0.17, 0.32, 0.9, 0.9, 0.32, 0.17];
// (EVERY book's impact wash since 2026-10-25 -- flash safety: IMPACT_SOFT's 0.32 -> 0.9 step, and Book 3's hard 0.9 frames, darkened half the screen
//  and more in one frame -- the FX agent's probe, Book 1 L2; Book 3's bright L1 road ~74 %.  One rule, the coordinator: gentle, gated, the silhouettes kept.
//  As the gate's other washes: from the frame after the hit (the shake's first frame alone), in over 6 frames (gentlest while the shake is strongest) to a 0.2 peak -- the 2 stylised silhouette frames there -- out over 14; the tint ramps with it)
const IMPACT_MM = [0, 0.02, 0.05, 0.09, 0.13, 0.17, 0.2, 0.2, 0.186, 0.171, 0.157, 0.143, 0.129, 0.114, 0.1, 0.086, 0.071, 0.057, 0.043, 0.029, 0.014];
const rampOf = (I) => I.ramp || IMPACT_SOFT, peakOf = (R) => Math.max(...R) - 1e-6;   // (Books 1 / 2: the impact wash's alpha per frame -- in over 3, the 2 stylised frames at 0.9, out over 3; the steps even in seen light: ~2/3 and ~1/2 of it)
// prefers-reduced-motion: no slow-mo punch-in, no impact frames
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// Book 2 (Skull Island) flash safety, the Storm Sea ride's rule (src/stormride.js triggerFlash): in a Skull Island level every
// whole-screen wash -- flashScreen, a team-up's flash, a later super's flash -- is at most one per SI_FLASH_GAP frames, ramped in
// over 3 frames, never above SI_FLASH_A, and none under prefers-reduced-motion; a team-up's impact frames are skipped there.
// (L.si, Book 1's L.mm too since QA3, and Book 3's since the all-books flash pass, 2026-10-25 -- washGated)
const SI_FLASH_GAP = 96, SI_FLASH_A = 0.2, SI_FLASH_UP = 8, SI_FLASH_DOWN = 14;   // (in over 8 since the all-books pass: over 3, a team blast's wash
                                         //  with its rings and name lit 28 % of Book 3's dimmed road in 3 frames)
// the supers' screen dim (World.dim, set by each super) as drawn: it follows at most DIM_V_IN / DIM_V_OUT of seen depth a frame
// (depth v = 1 - (1 - alpha)^2.2: the share of a cell's light it takes) -- one snapped on at 0.3 in a frame, and one snapped off
// at a super's end lit 45 % of Book 3's road in 3 frames (the all-books flash pass, 2026-10-25; src/showcase.js's veil, the same rates)
const DIM_V_IN = 0.075, DIM_V_OUT = 0.04;
const SUPER_DMG = 40;                     // one super's damage per target (player.js: flare 40, stars 13+13+14, strike / cyclone 3 x 13)
const TEAM_DMG = 90;                      // per foe: the same two bars as two supers (~80), plus a little for teaming up
const TEAM_NAMES = { 'ana+dodongo': 'STARFIRE STORM', 'dodongo+shadow': 'SMOKE AND FLAME', 'dodongo+scarlet': 'CRIMSON INFERNO',
  'ana+shadow': 'MOONLIT STAR STRIKE', 'ana+scarlet': 'STARLIGHT CYCLONE', 'scarlet+shadow': 'SHADOW CYCLONE' };
// (two players on the same hero -- any of its forms -- team up: the twins' own names)
const TWIN_NAMES = { dodongo: 'DOUBLE DRAGON FLARE', ana: 'TWIN STARFALL', shadow: 'SHADOW TWIN STRIKE', scarlet: 'DOUBLE CUTLASS CYCLONE' };
export const teamName = (a, b) => TEAM_NAMES[[a, b].sort().join('+')] || (baseOf(a) === baseOf(b) && TWIN_NAMES[baseOf(a)]) || 'TEAM ATTACK';
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

export class World {
  constructor(app) {
    this.app = app;
    this.fx = new FX();
    this.actors = [];
    this.players = [];
    this.camX = 0;
    this.reset();
  }
  get input() { return this.app.input; }
  get frame() { return this.app.frame; }
  get time() { return this.app.time; }
  get touch() { return this.app.touch; }
  get img() { return this.app.img; }

  reset() {
    this.hitstop = 0; this.shake = 0; this.flashScreen = 0; this.flashAt = null; this.dim = 0; this.dimShown = 0; this.warm = 0;
    this.tokens = 0;
    this.engaged = null; this.engagedT = 0;
    this.goT = 0; this.bannerT = 0; this.banner = '';
    this.hint = null; this.holdUntil = 0;
    this.talk = []; this.hazards = [];
    this.cut = null;
    this.cutin = null;                    // a super-move cut-in playing (src/showcase.js): the world waits for it
    this.cutinQ = []; this.cutinAt = {}; this.cutinSfx = [];   // (cut-ins waiting their turn; the frame each hero's last one
                                          // started; the deferred super sounds)
    this.teamWin = null; this.team = null; this.teamBlast = null;   // (a super a partner could join; a team attack on; its blast)
    this.slow = null; this.impact = null;   // (a super's slow-mo punch-in; impact frames)
    this.siWash = null;                     // (Skull Island: the one gated screen wash playing -- siWashStep)
    this.perfect = null;                    // (a PERFECT DODGE's slow time: { by, t, n, acc, key } -- Player.perfectDodge)
    this.flags = this.flags || {};
    this.hintAt = undefined;              // (the last hint's frame: HINT_GAP)
    this.hint = null; try { delete document.body.dataset.hint; } catch { /* (no DOM) */ }
  }
  get maxTokens() { return 1 + this.livePlayers.length; }
  get livePlayers() { return this.players.filter((p) => !p.out && !p.unplugged); }   // (an unplugged co-op hero doesn't count)
  get score() { return this.app.run.score; }
  set score(v) { this.app.run.score = v; }

  ctrl(id) { return this.app.ctrl(id); }

  // ================================================================================================ level setup
  /** stage = an already created stage object for this level */
  begin(levelIdx, stage, stageMod, checkpoint = -1, opts = {}) {
    const L = levelAt(levelIdx);   // (a main stage 0..3, or a secret stage 4..7: src/levels.js)
    this.L = L; this.levelIdx = levelIdx;
    this.stage = stage;
    this.len = stageMod?.LEVEL_LEN || L.len;
    this.sections = stageMod?.SECTIONS || L.sections || [{ id: 'all', name: L.name, x0: 0, x1: this.len }];
    this.propInfo = stageMod?.PROP_INFO || stage.PROP_INFO;
    this.hooks = stageMod?.HOOKS || null;
    this.lane = null; this.mm = null; this.mmGem = null;   // (Mystic Mountain's narrow ledge, its rules, its ruby gem: mmBegin below)
    this.reset();
    this.fx.clear();
    this.actors = [];
    this.arenaIdx = 0; this.fighting = false; this.waveIdx = 0; this.pending = []; this.patrolIdx = 0;
    this.section = -1; this.checkpoint = checkpoint;
    this.retPoint = opts.ret || null;   // (a secret stage's return point as the save point: src/main.js leaveSecret)
    this.freedHere = 0;
    for (const [kind, x, y, drop] of L.props) this.actors.push(new Prop(this, kind, x, y, drop));
    this.things = [];
    (L.things || []).forEach((t, i) => {
      const th = makeThing(this, t, i);
      if (th) { this.actors.push(th); this.things.push(th); }
    });
    // the cages: an id each (the persistent baby-dragon count, src/secrets.js); one freed earlier in this run -- the stage
    // re-entered from a secret stage -- stays open.  Stormspire's gongs already rung in this run (the cloud bridge up)
    const run = this.app.run;
    this.things.filter((t) => t.kind === 'cage').forEach((c, k) => { c.cageId = `${L.id}:${k}`; if ((run.cagesFreed || []).includes(c.cageId)) c.open(); });
    this.things.filter((t) => t.kind === 'chest').forEach((c, k) => { c.chestId = `${L.id}:${k}`; });   // (the chest count: each chest once)
    this.gongsRung = new Set((run.gongsRung || {})[L.id] || []);
    const gongs = this.things.filter((t) => t.kind === 'gong').length;
    if (gongs && this.gongsRung.size >= gongs) this.things.find((t) => t.kind === 'cloudbridge')?.reveal(true);
    this.boss = makeEnemy(this, L.boss.kind, L.boss.x, L.boss.y, L.boss);
    // (the Crystal Deep's mini-boss: Magmaw lighter, in his crystal look -- src/enemies2.js Magmaw def.crystal)
    this.boss.baseHp = this.boss.maxHp;   // (a hero dropping in before the fight scales it again: addPlayer)
    if (this.players.length > 1) this.boss.hp = this.boss.maxHp = Math.round(this.boss.maxHp * coopK(this.players.length, true));
    this.actors.push(this.boss);
    // where do we start?
    let startX = 70;
    if (checkpoint >= 0) {
      const ws = this.things.filter((t) => t.kind === 'waystone')[checkpoint];
      if (ws) { startX = ws.x + 60; ws.lit = true; }
      while (this.arenaIdx < L.arenas.length - 1 && L.arenas[this.arenaIdx].cam + W * 0.5 < startX) this.arenaIdx++;
      while (this.patrolIdx < L.patrols.length && L.patrols[this.patrolIdx].x < startX + W) this.patrolIdx++;
      this.actors = this.actors.filter((a) => !(a instanceof Prop) || a.x > startX);
    }
    if (opts.atX) {
      startX = opts.atX;
      while (this.arenaIdx < L.arenas.length - 1 && L.arenas[this.arenaIdx].cam + W * 0.5 < startX) this.arenaIdx++;
      while (this.patrolIdx < L.patrols.length && L.patrols[this.patrolIdx].x < startX + W) this.patrolIdx++;
    }
    if (opts.arenaFrom != null) this.arenaIdx = Math.max(this.arenaIdx, opts.arenaFrom);   // (back from a secret stage: past the fights already won)
    this.camX = clamp(startX - 300, 0, this.len - W);
    // players
    this.players.forEach((p, i) => {
      p.actorsReset?.();
      p.x = checkpoint >= 0 || opts.atX ? startX - i * 50 : this.camX + 30 - i * 60;
      p.y = 60 + i * 50; p.z = 0; p.vx = p.vy = p.vz = 0;
      p.facing = 1; p.alive = true; p.out = false; p.carry = null;
      p.hp = p.maxHp; p.set('idle'); p.ctl = true; p.inv = 0; p.cool = 0;
      const k = opts.keep && opts.keep[i];   // (into / back from a secret stage: the run's health and meter go along)
      if (k) { p.hp = Math.max(1, Math.min(p.maxHp, Math.round(k.hp))); p.meter = k.meter; }
    });
    this.curse = L.final ? 1 : 0; this.queenBeat = null;
    if (L.final) {   // (the Queen's Hollow: the curse full until the Wraith is beaten; the Queen asleep on her bed)
      stage.setCurse?.(1);
      const q = this.hooks?.queen || { x: 2720, y: -40 };
      this.queen = new QueenSleeper(this, q.x, q.y > 100 ? q.y - FLOOR_TOP : q.y);   // (a screen-y hook: as a depth)
      this.actors.push(this.queen);
    }
    this.mm = mmBegin(this) || siBegin(this);
    this.fx.stagger = !!this.L?.si;   // (Skull Island: fx words step aside instead of stacking -- src/fx.js; Book 1 / Book 3 as before)   // (Mystic Mountain's / Skull Island's stage rules -- src/mmworld.js, src/siworld.js (an MMWorld too); null elsewhere)
    this.intro = checkpoint < 0 && !opts.atX;
    if (this.intro) {
      for (const p of this.players) p.ctl = false;
      this.cut = { kind: 'intro', t: 0 };
      audio.jingle(L.si ? 'si_start' : 'start', { then: L.music });   // (Book 2: its own shanty fanfare)
    } else {
      audio.music(L.music);
      // (a save point: they warp in -- but not walking home out of a secret stage: the iris is the way in)
      if ((checkpoint >= 0 || opts.ret) && !opts.home) for (const p of this.players) p.warpIn(p.x, p.y);
    }
  }

  // ================================================================================================ people
  /** the hero an enemy goes after: nearest, re-picked every ~1.5 s */
  targetFor(e) {
    const live = this.players.filter((p) => !p.out && !p.unplugged);   // (an unplugged co-op hero isn't hunted)
    if (!live.length) return this.players[0];
    if (e._tgt && !e._tgt.out && !e._tgt.unplugged && this.frame < (e._tgtUntil || 0)) return e._tgt;
    let best = live[0], bd = 1e9;
    for (const p of live) {
      const d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y) * 2 + (p.down ? 400 : 0);
      if (d < bd) { bd = d; best = p; }
    }
    e._tgt = best; e._tgtUntil = this.frame + 90 + ((Math.random() * 60) | 0);
    return best;
  }
  onScreenFoes() {
    return this.actors.filter((t) => t.team === 'foe' && t.hittable && t.x > this.camX - 20 && t.x < this.camX + W + 20);
  }
  liftableNear(p) {
    // pick something up only when no enemy is right in front
    const near = this.actors.some((t) => t.team === 'foe' && t.alive && !t.down && !t.noBlockLift && Math.abs(t.x - p.x) < 70 && Math.abs(t.y - p.y) < 22);
    if (near) return null;
    for (const t of this.actors) if (t.liftable && !t.carrier && Math.abs(t.x - p.x) < 34 && Math.abs(t.y - p.y) < 18) return t;
    return null;
  }
  rumble(p, kind) { this.app.rumble(p, kind); }

  spawn(spec) {
    const x = spec.side === 'L' ? this.camX - 70 : this.camX + W + 70;
    const vf = variantFor(spec.k, spec.v);   // (frost / crystal / storm / curse: a base variant in its look or washed, src/secrets.js)
    const e = makeEnemy(this, spec.k, x, spec.y ?? 70, { variant: vf.v, look: vf.look, name: spec.name, face: spec.face });   // (face: Skull Island's sailors' five faces, src/sifoes.js)
    if (vf.wash) e.wash = vf.wash;
    e.facing = spec.side === 'L' ? 1 : -1;
    // co-op: enemies are tougher with more heroes (COOP_HP / COOP_BOSS)
    if (this.livePlayers.length > 1) { e.hp = e.maxHp = Math.round(e.maxHp * coopK(this.livePlayers.length, e.boss)); }
    this.actors.push(e);
    return e;
  }
  spawnPickup(kind, x, y) { this.actors.push(new Pickup(this, kind, x, y)); }
  collect(pk, p) {
    const P = PICKUPS[pk.kind];
    pk.gone = true;
    if (P.heal) p.hp = Math.min(p.maxHp, p.hp + P.heal);
    if (P.score) p.addScore(P.score);
    if (P.ember) p.addMeter(P.ember);
    if (P.life) p.lives++;
    this.fx.label(pk.x, pk.y, 90, P.label, P.heal ? '#9dff8a' : P.ember ? '#ffb02e' : '#ffe066', 28, 50);
    audio.sfx(P.heal ? 'pickup_food' : P.ember ? 'pickup_ember' : P.life ? 'pickup_life' : 'pickup_coin');
    if (P.heal && !this.flags.snack) { this.flags.snack = true; this.say(p, heroLine(LINES.firstSnack, storyHero(p.heroId)), 100); }
  }
  engage(t) { if (t.team === 'foe') { this.engaged = t; this.engagedT = 200; } }
  onFoeGone() { if (!this.flags.firstKO) { this.flags.firstKO = true; this.flareHintAt = this.frame + 200; } }
  /** a cage broken open: its baby dragon counts toward the Queen for good (src/secrets.js), and stays free this run */
  onCageFreed(cage) {
    if (!cage.cageId) return;
    addDragon(cage.cageId);
    const r = this.app.run;
    r.cagesFreed = [...new Set([...(r.cagesFreed || []), cage.cageId])];
  }
  /** a gong rung (Stormspire): a rising note for each new one; all of them -- the cloud bridge to the Eyrie */
  onGong(g) {
    const gongs = this.things.filter((t) => t.kind === 'gong'), i = gongs.indexOf(g);
    if (i < 0) return;
    const before = this.gongsRung.size;
    this.gongsRung.add(i);
    const run = this.app.run;
    (run.gongsRung = run.gongsRung || {})[this.L.id] = [...this.gongsRung];
    if (this.gongsRung.size > before) {
      audio.sfx('charge_full', { pitch: 0.7 + 0.22 * (this.gongsRung.size - 1), vol: 0.6 });
      const n = this.gongsRung.size, all = n >= gongs.length;   // (the count, seen as well as heard: 1/3, 2/3, 3/3!)
      this.fx.label(g.x, g.y, 168, `${n}/${gongs.length}${all ? '!' : ''}`, all ? '#9dff8a' : '#ffd23a', all ? 40 : 34, 80);
    }
    if (this.gongsRung.size >= gongs.length) this.things.find((t) => t.kind === 'cloudbridge')?.reveal();
  }
  /** a hidden exit taken: the party warps into its secret stage (main.js) */
  enterSecret(id) { this.app.enterSecret(id); }
  /** a secret stage's mini-boss beaten: no level clear -- the Star Shard drops where it fell (the Queen's Hollow: its end) */
  secretBossDown(b) {
    this.hitstop = 20; this.shake = 14; this.flashScreen = 0.5; this.flashAt = { x: b.x, y: b.y, z: 150 };
    audio.music(null); audio.sfx('hit_finisher', { pitch: 0.7 });
    this.fx.word(b.x, b.y, 200, true, 'KA-BOOM!');
    for (const a of this.actors) if (a.team === 'foe' && a !== b && a.alive) { a.alive = false; a.gone = true; this.fx.poof(a.x, a.y, a.z); a.releaseToken?.(); }
    this.pending = []; this.fighting = false; this.arenaIdx = this.L.arenas.length;   // (no arena after it)
    if (this.L.final) {   // the Wraith beaten: the curse fades, the three Star Shards fly to the Queen, then her story
      for (const p of this.players) { p.ctl = false; p.dropCarry?.(); }
      this.queenBeat = { t: 0, x: this.queen ? this.queen.x : b.x, y: this.queen ? this.queen.y : b.y };
      audio.jingle('freed_big');
      return;
    }
    audio.jingle('levelclear');
    this.actors.push(new ShardPickup(this, clamp(b.x, this.camX + 140, this.camX + W - 260), clamp(b.y, 20, DEPTH - 20), this.L.shard));
  }
  /** the Queen's Hollow after the Wraith: the curse fades (2 s), the three shards fly in from the corners to her (2-4 s),
   * the Heartstone mends in a gold flash, and her story begins (main.js queenWon) */
  stepQueenBeat() {
    const Q = this.queenBeat;
    Q.t++;
    this.curse = Math.max(0, 1 - Q.t / 120);
    this.warm = 1 - this.curse;
    this.stage.setCurse?.(this.curse);
    for (const p of this.players) if (!p.out && ['idle', 'walk', 'run', 'land'].includes(p.state)) { p.set('cutscene'); p.facing = Q.x > p.x ? 1 : -1; }
    if (Q.t === 120) { audio.sfx('charge_full', { pitch: 0.8 }); Q.shards = [0, 1, 2].map((i) => ({ x0: this.camX + [80, W / 2, W - 80][i], z0: 420 })); }
    if (Q.t === 240) {                                   // (the Heartstone whole: the flash from it, hearts round the Queen)
      const N = this.hooks?.niche, hz = N ? FLOOR_TOP + Q.y - this.heartAt().y : 170;
      this.flashScreen = 0.7; this.flashAt = { x: N ? N.x : Q.x, y: Q.y, z: hz }; this.shake = 10; audio.jingle('freed_big');
      this.fx.rays?.(N ? N.x : Q.x, Q.y, hz, '#fff2a8', 260, 40); this.fx.hearts(Q.x, Q.y, 40, 14);   // (hearts round her, under the stone)
    }
    if (Q.t === 330) { this.queenBeat = null; this.app.queenWon?.(); }
  }
  /** the Heartstone in its niche over the Queen (the stage's HOOKS.niche; else over her), and the shards flying home into
   * it: its star notches fill with light as they land, then it glows gold (src/heartstone.js) */
  /** where the Heartstone sits: in its niche in the wall behind the Queen (the stage's HOOKS.niche), screen px */
  heartAt() {
    const Q = this.queenBeat, N = this.hooks?.niche;
    return N ? { x: N.x - this.camX, y: N.y - N.r * 0.12, r: N.r * 0.5 } : { x: Q.x - this.camX, y: FLOOR_TOP + Q.y - 190, r: 48 };
  }
  /** the Heartstone itself, behind her (drawn before the actors): it shows as the curse lifts, its notches fill as the
   * shards land (src/heartstone.js) */
  drawQueenGem(ctx) {
    const Q = this.queenBeat; if (!Q) return;
    const G = this.heartAt();
    ctx.save(); ctx.globalAlpha = Math.min(1, Q.t / 30); drawHeartstone(ctx, G.x, G.y, G.r, Math.max(0, Math.min(1, (Q.t - 196) / 44)), this.time); ctx.restore();
  }
  drawQueenBeat(ctx) {
    const Q = this.queenBeat;
    if (!Q) return;
    const { x: gx, y: gy, r: gr } = this.heartAt();
    if (!Q.shards || Q.t > 240) return;
    const k = Math.min(1, (Q.t - 120) / 110), e = 1 - Math.pow(1 - k, 3), N = heartNotches(gx, gy, gr);
    for (const [i, s] of Q.shards.entries()) {
      // (each to its notch: the gem's two lobes and its tip)
      const [tx, ty] = N[i % 3], sx = s.x0 - this.camX, sy = FLOOR_TOP + Q.y - s.z0;
      const x = sx + (tx - sx) * e, y = sy + (ty - sy) * e - 90 * Math.sin(Math.PI * e);
      if (k >= 1) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Q.t * 0.1);
      ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 40); g.addColorStop(0, 'rgba(255,250,210,0.9)'); g.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 17; const a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath();
      ctx.fillStyle = '#fff2a8'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
      ctx.restore();
    }
  }
  /** the Star Shard picked up: it's the party's for good; the portal home opens */
  collectShard(pk) {
    addShard(this.L.shard);
    const got = progress().shards.length;
    this.fx.label(pk.x, pk.y, 200, `STAR SHARD ${got}/${SHARDS}!`, '#fff2a8', 40, 140);
    this.fx.rays?.(pk.x, pk.y, 100, '#fff2a8', 200, 30);
    audio.jingle('freed_big'); this.flashScreen = 0.4; this.flashAt = { x: pk.x, y: pk.y, z: 100 };
    this.shardGot = true;
    const portal = new Portal(this, this.camX + W - 180, 70);
    portal.delay = 90;
    this.actors.push(portal);
  }
  /** the portal home stepped into: back to the main stage, just past the exit (main.js) */
  enterPortal() { this.app.leaveSecret(); }
  onWhelpFreed(w) {
    this.app.run.freed++; this.freedHere++;
    if (!this.flags.freed) {
      this.flags.freed = true;
      const p = this.targetFor(w);
      // don't cut off a line the hero is still saying: wait for it to finish
      const busy = this.fx.list.find((q) => q.type === 'balloon' && q.actor === p);
      if (busy) this.talk.push({ who: { dodongo: 'dod', ana: 'ana', shadow: 'sha', scarlet: 'sca' }[baseOf(p.heroId)], text: LINES.firstFreed, at: this.frame + Math.max(0, (busy.life || 0) - (busy.t || 0)) + 6, waited: 0 });
      else this.say(p, heroLine(LINES.firstFreed, storyHero(p.heroId)), 120);
    }
  }
  /** a super fired.  -> true when a painted cut-in plays first (src/showcase.js, SHOWCASE.cutin in config.js): the
   * world waits ~0.6 s (the same hero again within 8 s: a short one), and the super's sound plays when it ends */
  onUltimate(p) {
    let deferred = false;
    {   // (the painted cut-in the first time each hero supers in a stage; after that -- or with no painting, Dragon
        //  Dodongo's -- a flash and the super's name: CUTIN_FLASH frames' freeze, the name popping on after it)
      const first = this.cutinAt[p.heroId] === undefined, full = first && cutinReady(p.heroId);
      this.cutinAt[p.heroId] = this.frame;
      const c = { id: p.heroId, t: 0, T: full ? CUTIN_FRAMES : CUTIN_FLASH, quick: !full, p, accent: p.hero.accent, name: this.mm?.superName?.(p) || p.hero.special.name,
        ctrl: p.ctrlId, sfx: p.hero.special.sfx };
      if (this.cutin) this.cutinQ.push(c); else this.startCutin(c);
      deferred = true;
    }
    if (this.players.length > 1 && !this.team) {   // (a partner may join: tryTeam) -- a chime and a buzz tell them
      this.teamWin = { a: p, ult: p.ult, age: 0, x0: p.x, bossHp: this.boss?.hp };   // (the boss's hp then: the cap counts what it has lost since)
      const b = this.teamClose(p);
      if (b) { audio.sfx('cooldown_ready', { vol: 0.9 }); this.rumble(b, 'light'); }
    }
    const key = 'ult_' + p.heroId;
    // (raised clear of the hero's raised staff / sword during the super)
    if (!this.flags[key]) { this.flags[key] = true; const l = LINES.firstUlt[p.heroId === 'dragon' ? 'dragon' : baseOf(p.heroId)]; if (l) this.say(p, l, 150, { dz: 72 }); }
    return deferred;
  }
  startCutin(c) {
    if (this.L?.si || this.L?.mm) c.si = true;   // (a Skull Island or Mystic Mountain level: the team cut-in's burst is ramped and capped; reduced motion: fades -- src/showcase.js)
    if (c.quick) c.soft = true;   // (a later super's flash: no wash at all since the gentle cut-ins, src/showcase.js -- it no longer takes the flash gate)
    this.cutin = c; audio.sfx('swing_heavy', { vol: 0.55 });
  }
  /** the books whose whole-screen washes go through the flash gate: every book since the all-books flash pass (2026-10-25) --
   *  Skull Island's, Mystic Mountain's (QA3: its boss beats' 0.6-0.9 washes, a team-up's impact frames), and now Dodongo's Quest's:
   *  its team blast's flash lit 44 % of the road in a frame, its boss-defeat / freed washes came on at 0.5-0.7 */
  get washGated() { return true; }
  /** the supers' dim as drawn: toward this.dim at the flash-safe rates (DIM_V_IN / DIM_V_OUT), each frame */
  stepDim() {
    const vOf = (a) => 1 - Math.pow(1 - Math.min(0.95, Math.max(0, a || 0)), 2.2), v = vOf(this.dimShown), t = vOf(this.dim);
    const n = t > v ? Math.min(t, v + DIM_V_IN) : Math.max(t, v - DIM_V_OUT);
    this.dimShown = n <= 0.0005 ? 0 : 1 - Math.pow(1 - n, 1 / 2.2);
  }
  /** a Book 2 boss whose entrance is a rise -- the Kraken, up out of the sea in its intro: how far up it is (0..1; 1 for any other).
   *  Its card waits for it to be up (CARD_RISE): over the rise the card hid its dome coming up (painter 1's critic).  (The Elder
   *  Tree's 'rise' is an awakening in plain view, under its card; the Leviathan draws its own card: src/sileviathan.js) */
  bossRise(b = this.boss) {
    if (!b || !this.L?.si) return 1;
    return b.K && b.state === 'intro' ? (b.introT < 0 ? 0 : b.K.rise ?? 1) : 1;
  }
  /** Skull Island's flash gate: true (and the gap starts) when a wash may play now -- at most one per SI_FLASH_GAP frames, none with reduced motion */
  siFlashTry() {
    if (REDUCED || this.frame - (this.siFlashAt ?? -1e9) < SI_FLASH_GAP) return false;
    this.siFlashAt = this.frame; return true;
  }
  /** (L.si) flashScreen is a request: a wash starts when the gate allows (peak <= SI_FLASH_A, ramped in), the rest are dropped */
  siWashStep() {
    if (this.siWash && ++this.siWash.t > SI_FLASH_UP + SI_FLASH_DOWN) this.siWash = null;
    const req = this.flashScreen;
    this.flashScreen = 0;
    if (req > 0.01 && this.siFlashTry()) this.siWash = { t: 0, peak: Math.min(SI_FLASH_A, req), at: this.flashAt };   // (drawn from t 0: 1/3, 2/3, full)
  }
  drawSiWash(ctx) {
    const S = this.siWash;
    if (!S) return;
    const a = S.peak * (S.t < SI_FLASH_UP ? (S.t + 1) / SI_FLASH_UP : 1 - (S.t - SI_FLASH_UP) / SI_FLASH_DOWN);
    if (a <= 0.005) return;
    const f = S.at || { x: this.camX + W / 2, y: DEPTH / 2, z: 80 };
    const fx = f.x - this.camX, fy = FLOOR_TOP + f.y - f.z;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(fx, fy, 10, fx, fy, 520);
    gr.addColorStop(0, `rgba(255,220,150,${a})`); gr.addColorStop(0.5, `rgba(255,170,80,${a * 0.4})`); gr.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  /** a PERFECT DODGE by p: the world slows (PERFECT.k for PERFECT.n frames), p's next hit to land is a CRITICAL COUNTER */
  startPerfect(p) {
    this.perfect = { by: p, t: 0, n: PERFECT.n, acc: 0, key: undefined };
    this.perfectN = (this.perfectN || 0) + 1;
    addPerfect();                                      // (the persistent count, for fun: src/secrets.js)
  }
  endPerfect() { this.perfect = null; }
  /** the slow window's rim: a blue-white tint at the screen edges only (fading in and out), never a full-screen flash */
  drawPerfectRim(ctx) {
    const P = this.perfect, a = 0.5 * Math.min(1, P.t / 6, (P.n - P.t) / 14);
    if (a <= 0) return;
    const e = 84;
    ctx.save();
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, e, 0, 0, W, e], [0, H, 0, H - e, 0, H - e, W, e], [0, 0, e, 0, 0, 0, e, H], [W, 0, W - e, 0, W - e, 0, e, H]]) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(200,240,255,${a})`); g.addColorStop(1, 'rgba(200,240,255,0)');
      ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.restore();
  }
  /** a super's opening beat: SLOW_N frames at half speed with the camera punching in on (x, y, z), then a snap back */
  punch(x, y, z = 90) { if (!this.slow && !REDUCED) this.slow = { t: 0, n: SLOW_N, x, y, z }; }   // (reduced motion: none)
  /** the impact's accent tint at alpha a (a team's: its two colours) -- Mystic Mountain's ramp frames */
  impactTint(ctx, imp, a) {
    if (imp.col2) { const gr = ctx.createLinearGradient(0, 0, W, H); gr.addColorStop(0.35, rgba(imp.col, a * 0.3 / 0.28)); gr.addColorStop(0.65, rgba(imp.col2, a * 0.3 / 0.28)); ctx.fillStyle = gr; }
    else ctx.fillStyle = rgba(imp.col, a);
    ctx.fillRect(-60, -60, W + 120, H + 120);
  }
  /** a big hit: IMPACT_N frames of high-contrast silhouettes (white on a dark wash of col) */
  impactFrames(col, col2) {
    if (REDUCED) return;
    this.impact = { n: IMPACT_MM.length, at: this.frame, col, col2, soft: true, ramp: IMPACT_MM, wash: this.siFlashTry() };   // (every book: ramped and gated -- flash safety; the frames counted on the wall clock)
  }
  /** the impact frame now: Book 3's for its 2 frames; Books 1 / 2 only at the soft one's peak (the stylised frames -- silhouettes); its ramp
   *  frames are a wash alone, so the silhouette restores in player.js / sitele.js / sileviathan.js read null there */
  get impact() { const I = this._impact; if (!I || !I.soft) return I || null; const R = rampOf(I), t = this.frame - (I.t0 ?? this.frame); return t >= 0 && t < R.length && R[t] >= peakOf(R) ? I : null; }
  set impact(v) { this._impact = v; }   // (set in a tick's update: drawn by that tick's render and the next; a team's: two colours)
  get zoomK() {
    const S = this.slow; if (!S) return 1; if (S.beat) return S.beat(S.t, S.n);
    if (S.t >= S.n) { const u = Math.min(1, (S.t - S.n + 1) / SLOW_OUT); return 1 + (SLOW_ZOOM - 1) * (1 - u * u * (3 - 2 * u)); }   // (easing back: SLOW_OUT)
    const u = Math.min(1, S.t / S.n); return 1 + (SLOW_ZOOM - 1) * u * u * (3 - 2 * u);   // (in: eased both ends)
  }   // (S.beat: Skull Island's boss-defeat beat's own ease -- src/sifx.js bossBeat)

  // ------------------------------------------------------------------------------------------------ team attack
  /** the other hero, when they could join a's super: in play, close (to a, or to where a's super started), a bar to
   * spend (busy: maybe mid-move) */
  teamCand(a, b) {   // (b could join a's super: in play, a bar to spend, close to a or to where a's super started)
    const T = this.teamWin;
    if (!b || b === a || b.out || !b.alive || !b.ctl || b.state === 'special' || b.meter < 100) return false;
    return Math.abs(b.x - a.x) <= TEAM_RANGE || !!(T && T.a === a && Math.abs(b.x - T.x0) <= TEAM_RANGE);
  }
  teamClose(a) {   // (the closest such partner: up to four heroes, any two make a pair)
    const d = (b) => Math.abs(b.x - a.x);
    return this.players.filter((b) => this.teamCand(a, b)).sort((p, q) => d(p) - d(q))[0] || null;
  }
  /** ... and free to act right now (a throw or a beam is dropped to join; a jump or a knock-down is waited out) */
  teamMate(a, b = this.teamClose(a)) {
    return b && this.teamCand(a, b) && ['idle', 'walk', 'run', 'land', 'atk', 'hurt', 'runAtk', 'shoot', 'squat', 'auto'].includes(b.state) ? b : null;
  }
  /** a partner's SUPER press while the window is open: joins now, or as soon as they're free (mid-jump / mid-throw) */
  teamPress() {
    const T = this.teamWin;
    for (const b of this.players) {
      if (!this.teamCand(T.a, b) || !this.app.ctrl(b.ctrlId).pressed.special) continue;
      if (this.tryTeam(b)) return true;
      T.req = b;
    }
    return false;
  }
  teamOpen() {
    const T = this.teamWin;
    return !!T && !this.team && (T.age <= TEAM_WINDOW || (T.a.state === 'special' && T.a.ult === T.ult));
  }
  /** b pressed SUPER (Player.trySpecial, or the cut-in branch of update): true when that made a team attack */
  tryTeam(b) {
    const T = this.teamWin;
    if (this.team && this.teamJoin(b)) return true;   // (a team attack gathering: a third / fourth hero joins it)
    if (!T || T.a === b || !this.teamOpen() || this.teamMate(T.a, b) !== b) return false;
    this.startTeam(T.a, b);
    return true;
  }
  startTeam(a, b) {
    const bossHp = this.teamWin?.bossHp;
    this.teamWin = null;
    b.meter -= 100;                       // (a paid for the super it started)
    const dealt = a.ult?.dealt || new Map();   // what a's own super already did (a late join): the blast only tops it up
    for (const p of [a, b]) this.teamShow(p);   // both start their super's show together once the cut-in is over
    this.team = { a, b, t: 0, dealt, bossHp, name: teamName(a.heroId, b.heroId), extra: [] };
    for (const q of this.fx.list) if (q.type === 'balloon' && (q.actor === a || q.actor === b)) q.t = Math.max(q.t, q.life - 12);
    // the team cut-in takes the place of a's own (or plays now, a's being over); both supers' sounds when it ends
    this.cutinQ = this.cutinQ.filter((c) => c.id !== a.heroId);
    this.startCutin({ team: true, handoff: !!this.cutin, ids: [a.heroId, b.heroId], accents: [a.hero.accent, b.hero.accent], t: 0, T: TEAM_FRAMES,
      name: this.team.name, ctrl: a.ctrlId, ctrl2: b.ctrlId, sfx: [a.hero.special.sfx, b.hero.special.sfx] });
    audio.sfx('freed', { vol: 0.9 });     // (the team fanfare: a rising sparkle over the whoosh)
    this.rumble(a, 'special'); this.rumble(b, 'special');
    this.teamN = (this.teamN || 0) + 1;
  }
  /** a hero's part in a team attack: their super's show (teamFx: no damage of its own) */
  teamShow(p) {
    if (p.carry) p.dropCarry();
    if (p.shot?.beam) { p.shot.beam.gone = true; p.shot.beam = null; }
    p.stopCharge?.();
    p.vx = p.vy = 0; p.bufS = 0;
    p.reset('special'); p.hitSet = new Set(); p.cyc = null; p.teamFx = true;
    p.ult = { hits: new Map(), next: 0, targets: [], dealt: new Map() };
    p.dragon = p.dragonReady?.() ? p.newDragon() : null;   // (Dodongo's half: the dragon's flight, the show only)
  }
  /** a third / fourth hero's SUPER while a team attack gathers (before its blast), close to the pair with a bar: they
   * join it -- their super's show, their name on the cut-in and the banner.  The blast is the same (TEAM_DMG per foe, the
   * boss cap unchanged). */
  teamJoin(p) {
    const T = this.team;
    if (!T || T.t >= TEAM_BLAST || p === T.a || p === T.b || T.extra.includes(p)) return false;
    if (p.out || !p.alive || !p.ctl || p.meter < 100 || p.state === 'special') return false;
    if (Math.min(Math.abs(p.x - T.a.x), Math.abs(p.x - T.b.x)) > TEAM_RANGE) return false;
    p.meter -= 100;
    this.teamShow(p);
    T.extra.push(p);
    if (this.cutin?.team) this.cutin.extra = T.extra.map((q) => ({ id: q.heroId, name: q.hero.name, accent: q.hero.accent }));
    audio.sfx('freed', { vol: 0.8 }); this.rumble(p, 'special');
    this.teamN3 = (this.teamN3 || 0) + 1;
    return true;
  }
  updateTeam() {
    const T = this.team, { a, b } = T;
    T.t++;
    if (T.t === 1) this.punch((a.x + b.x) / 2, (a.y + b.y) / 2, 90);   // (the punch-in: on the pair)
    const all = [a, b, ...T.extra];
    for (const p of all) if (!p.out) p.inv = Math.max(p.inv, 2);   // all of them untouchable until it's over
    if (T.t === TEAM_BLAST) this.teamHit(T);
    const busy = (p) => p.state === 'special' && p.teamFx;
    if ((T.t > TEAM_BLAST && !all.some(busy)) || T.t > 240) { for (const p of all) p.teamFx = false; this.team = null; }
  }
  /** the shared blast: every foe on screen up to TEAM_DMG (less what a's own super already did) -- foes
   * knocked over too; a boss at most 2x and never down to its last sliver of hp (it isn't the finishing blow); foes on a
   * hook / carried / freed and friends left alone; no meter back (ember 0) */
  teamHit(T) {
    const { a, b } = T, ca = a.hero.accent, cb = b.hero.accent;
    this.mm?.onTeamBlast?.(T);   // (Skull Island: a team-up launches the closer hero at the Kraken's collar)
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    const n = 2 + (T.extra?.length || 0), name = n > 2 ? (n > 3 ? 'QUAD TEAM ATTACK' : 'TRIPLE TEAM ATTACK') : T.name;
    this.teamBlast = { t: 0, life: 44, x, y, ca, cb, name: name + '!' };   // (its name: a banner over the play, clear of speech balloons)
    this.shake = Math.max(this.shake, 14); this.hitstop = Math.max(this.hitstop, 6);
    if (this.washGated) { this.flashScreen = Math.max(this.flashScreen, 0.3); this.flashAt = { x, y, z: 80 }; }   // (Skull Island, Mystic Mountain: no impact frames -- one gated soft wash)
    else this.impactFrames(ca, cb);
    audio.sfx('explosion', { vol: 0.8 });
    const held = new Set(this.actors.flatMap((s) => [s.grab, ...(s.grabs || [])]).filter(Boolean));
    const onScreen = (t) => t.x > this.camX - 20 && t.x < this.camX + W + 20;
    const DOWN = ['fly', 'down', 'getup', 'rise'];
    for (const t of this.actors) {
      if (t.team !== 'foe' || !onScreen(t) || held.has(t) || t.carrier || t.state === 'freed') continue;
      const downed = !t.hittable && t.alive && t.hp > 0 && DOWN.includes(t.state) && (!t.boss || (this.fighting && !this.cut));
      if (!t.hittable && !downed) continue;
      const by = [a, b, ...(T.extra || [])].reduce((m, q) => (Math.abs(t.x - q.x) < Math.abs(t.x - m.x) ? q : m));
      const got = T.dealt.get(t) || 0;
      let dmg = TEAM_DMG - got;
      if (t.boss) {
        const k = t.state === 'stagger' || t.state === 'grounded' ? 1.4 : 1;   // (Boss.bossTakeHit's bonus on a dazed boss)
        const lost = t === this.boss && T.bossHp != null ? Math.max(got, T.bossHp - t.hp) : got;   // (a's own hits as they landed: x1.4 on a dazed boss)
        dmg = Math.floor(Math.min(dmg, (SUPER_DMG * 2 - lost) / k, (t.hp - t.maxHp * 0.04) / k));
      }
      if (dmg < 1) continue;
      const hd = { dmg, kind: 'knock', push: 6, lift: 6.5, stop: 6, hit: 'hit_finisher', special: true, ember: 0 };   // (not thrown: no bowling into foes it left alone)
      if (downed) {                       // (already knocked over: the hp only; out of hp, it stays down -- the down state ends it)
        t.hp -= dmg; t.flash = 6;
        if (t.hp <= 0 && t.state === 'getup') t.set('down');
        if (t.hp <= 0 && t.state === 'rise') { t.vz = 0; t.set('fly'); }   // (a flyer rising back up: falls, then is freed)
        by.landed(t, hd);
      } else if (t.takeHit(by, hd)) by.landed(t, hd);
    }
  }
  /** the blast, part 1 (on the floor, under the actors): two rings, one in each hero's colour, racing out from between them */
  drawTeamRings(ctx) {
    const B = this.teamBlast, k = B.t / B.life;
    const sx = B.x - this.camX, sy = FLOOR_TOP + B.y;
    const e = 1 - Math.pow(1 - Math.min(1, k * 1.4), 3);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    for (const [col, f] of [[B.ca, 1], [B.cb, 0.8]]) {
      const rx = (60 + 400 * e) * f, ry = rx * 0.3;            // (kept within the screen)
      ctx.lineWidth = 18 * (1 - k) + 3; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  /** the blast, part 2 (over the play): a short warm-white flash round the blast point */
  drawTeamFlash(ctx) {
    const B = this.teamBlast, k = B.t / 20;
    if (k >= 1) return;
    const sx = B.x - this.camX, sy = FLOOR_TOP + B.y - 80, a = 0.3 * (1 - k) * (1 - k);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(sx, sy, 20, sx, sy, 560);
    gr.addColorStop(0, `rgba(255,242,200,${a})`); gr.addColorStop(0.55, `rgba(255,242,200,${a * 0.45})`); gr.addColorStop(1, 'rgba(255,242,200,0)');
    ctx.fillStyle = gr; ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.restore();
  }
  /** the team attack's name, popped in over the play (screen space) with the blast, in the pair's two colours */
  drawTeamBanner(ctx) {
    const B = this.teamBlast, t = B.t, T = 70;
    if (t >= T) return;
    const s = t < 6 ? 1.4 - 0.4 * (t / 6) : 1, a = t > T - 14 ? (T - t) / 14 : 1;
    const { cx, yb } = this.teamBannerAt(ctx);   // (RC2: clear of the boss's block -- teamBannerAt)
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, yb); ctx.rotate(-0.08); ctx.scale(s, s);   // (3-4P: under the foe bars)
    ctx.font = '52px "Luckiest Guy", Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    const hw = ctx.measureText(B.name).width / 2, gr = ctx.createLinearGradient(-hw, 0, hw, 0);
    gr.addColorStop(0, B.ca); gr.addColorStop(0.5, '#fff6d8'); gr.addColorStop(1, B.cb);
    ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.strokeText(B.name, 0, 0);
    ctx.fillStyle = gr; ctx.fillText(B.name, 0, 0);
    ctx.restore();
    if (this.L?.si) { const hx = hw * s + 14, tilt = hw * 0.08 + 6; this.fx.keepOut?.([cx - hx, yb - 46 * s - tilt, cx + hx, yb + 16 * s + tilt], 3, false, 'banner'); }
    else this.teamBannerKeep(ctx);   // (RC2: tagged -- a balloon under it waits, src/fx.js)   // (RC: Books 1 / 3 -- DRAGON FLARE! printed inside TRIPLE TEAM ATTACK!)   // (Book 2: the banner is a keep-out zone for the status labels -- a super's name pop and BRAVE! piled on it, QAF capture)
  }
  /** (RC2) where the team attack's banner goes, set on its first frame (it never moves): its usual spot -- the middle, 172 (3-4P: 214)
   *  -- unless that (at its first frame's 1.4x pop, with its tilt) touches the boss's block in the HUD (its name, bar and meter:
   *  QUAD TEAM ATTACK! covered the Kraken's ROUND n/3, its pips and ONE MORE!) or the hero panels; then the nearest spot that
   *  doesn't -- along the row first (inside a TV's safe area, x 48..912), then lower, down to 0.6 of the screen */
  teamBannerAt(ctx) {
    const B = this.teamBlast;
    if (B.cx !== undefined) return { cx: B.cx, yb: B.yb };
    ctx.save(); ctx.font = '52px "Luckiest Guy", Bangers, Impact, sans-serif'; const hw = ctx.measureText(B.name).width / 2; ctx.restore();
    const y0 = this.players.length > 2 ? 214 : 172, hx = hw * 1.4 + 14, up = 46 * 1.4 + hw * 0.08 + 6, dn = 16 * 1.4 + hw * 0.08 + 6;
    const obst = [this._bossBlock, this._bossBlock13, ...((this.app._hudBoxes || []).filter((b) => /panel|score/.test(b.name)).map((b) => [b.x0, b.y0, b.x1, b.y1]))].filter(Boolean);
    const hit = (cx, yb) => obst.some((r) => cx + hx > r[0] && cx - hx < r[2] && yb + dn > r[1] && yb - up < r[3]);
    let best = null;
    for (let dy = 0; dy <= H * 0.6 - y0 && !best; dy += 12) {
      for (let d = 0; d <= W / 2; d += 20) {
        for (const cx of d ? [W / 2 - d, W / 2 + d] : [W / 2]) if (cx - hw - 14 >= 48 && cx + hw + 14 <= 912 && !hit(cx, y0 + dy)) { best = [cx, y0 + dy]; break; }
        if (best) break;
      }
    }
    if (!best) best = [W / 2, Math.min(H * 0.6, Math.max(y0, (this._hudBottom || 0) + up + 6))];
    B.cx = best[0]; B.yb = best[1]; B.hw = hw;
    return { cx: B.cx, yb: B.yb };
  }
  /** (RC2) Books 1 / 3: the banner's keep-out for the floating words and the balloons (tagged 'banner': a balloon under it waits) --
   *  set before the words and balloons are drawn, from its first frame (drawn after them, it lagged a frame: TRIPLE TEAM ATTACK!
   *  over "...f you can!") */
  teamBannerKeep(ctx) {
    const B = this.teamBlast; if (!B || B.t >= 70) return;
    const { cx, yb } = this.teamBannerAt(ctx), t = B.t, s = t < 6 ? 1.4 - 0.4 * (t / 6) : 1, hx = B.hw * s + 14, tilt = B.hw * 0.08 + 6;
    this.fx.keep13?.([cx - hx, yb - 46 * s - tilt - 6, cx + hx, yb + 16 * s + tilt + 6], 2, false, 'banner');   // (RC3: 6 px more room -- QUAD TEAM ATTACK! sat 5 px over SHIELD LAUNCH!)
  }
  /** "TEAM UP!" over the partner who could join the super that just started, with their own SUPER button */
  drawTeamInvite(ctx) {
    const a = this.teamWin.a;
    if (!this.teamOpen()) return;
    const cands = this.players.filter((b) => this.teamCand(a, b));
    if (this.L?.si) { if (cands.length) this.drawTeamChip(ctx, cands); return; }   // (Book Two: one chip in the HUD band)
    this._inv = [];   // (RC: the cards placed this frame -- drawInvite1 keeps each off the ones before it)
    cands.forEach((b, k) => this.drawInvite1(ctx, b, k));   // (each who could join)
  }
  /** Book Two's team-up invite: ONE chip under the HUD band -- "TEAM UP!" then each player who can join as their P-tag colour
   *  and their SUPER glyph, then "SUPER!" (QAF AF3: a card per player, stacked, covered a third of the arena and the boss).
   *  It sits under the HUD's bottom and raises that bottom, so the words and balloons stay under it. */
  drawTeamChip(ctx, cands) {
    const app = this.app, F = 'Bangers, Impact, sans-serif', g = 28, gap = 6;
    // (each player's own controller: a 1P slot's 'any' on a tablet / phone (pointer: coarse) is that player's touch screen -- not
    //  whatever was pressed last: an iPad player's invite drew a keyboard key when a pad friend had started the super (RC))
    const cid = (b) => (b.ctrlId === 'any' ? (app.coarse ? 'touch' : app.lastCtrl) : b.ctrlId);
    const ids = cands.map(cid), touch = ids.every((id) => id === 'touch');
    let scr = null; try { scr = this._gctx = this._gctx || document.createElement('canvas').getContext('2d'); } catch { /* (no DOM) */ }
    ctx.save();
    ctx.font = `30px ${F}`; const wT = ctx.measureText('TEAM UP!').width;
    ctx.font = `24px ${F}`; const wS = ctx.measureText(touch ? 'TAP SUPER!' : 'SUPER!').width;
    // (a keyboard key on Book Two's own keycap, 16 px label -- P3's "'" SUPER drew as a speck on the shared glyph: QAF3 critic; hud.js siKeycap)
    const parts = cands.map((b, i) => { const tag = `P${b.slot + 1}`; ctx.font = `24px ${F}`; const wt = ctx.measureText(tag).width; let gw = 0; const id = cid(b), key = touch ? null : HUD.siKeyLabel(app, 'special', id); if (key) gw = HUD.siKeyW(ctx, key, 26, 16); else if (!touch && scr) { try { gw = app.input?.drawGlyph?.(scr, 'special', id, -999, -999, g) || g; } catch { gw = g; } } return { b, tag, wt, gw, key, id }; });
    const wP = parts.reduce((s, q) => s + q.wt + (q.gw ? gap + q.gw : 0), 0) + (parts.length - 1) * 14;
    const pw = 18 + wT + 16 + wP + 14 + wS + 18, ph = 40;
    // (a hero's own cut-in is up: the chip under its band, over nobody's face.  A quick super has no band -- its 12-frame flash
    //  stamps the name across the top third (showcase.js drawFlash): the chip waits those frames out and then shows in the HUD
    //  band; under the "cut-in band" rule it dropped to the heroes' feet for the flash, then jumped back up -- QAF3)
    if (this.cutin && this.cutin.quick && !this.cutin.team) { this._chipFrom = null; ctx.restore(); return; }
    // (a chip that wasn't up a moment ago -- a new invite, or the first frame after a quick flash -- fades in over 6 frames: no pop)
    if (this._chipFrom == null || this.frame - (this._chipLast ?? -99) > 2) this._chipFrom = this.frame;
    this._chipLast = this.frame; ctx.globalAlpha *= Math.min(1, (this.frame - this._chipFrom + 1) / 6);
    const inCut = this.cutin && !this.cutin.team;
    let y0 = inCut ? 418 : Math.max(this._hudBottom || 90, 90) - 2;
    let x0 = clamp(W / 2 - pw / 2, 48, 912 - pw);
    // (the palace: a spot inside the HUD band beside the boss block, clear of the King's crystal and Malachar's head -- under the
    //  FEELINGS row the chip covered the Sad Cloud's top and touched the P-tags: QAF3; hud.js siChipSpot.  None clear: as below)
    const spot = !inCut && this.L?.si ? HUD.siChipSpot?.(this, app, pw, ph) : null;
    if (spot) { x0 = spot[0]; y0 = spot[1]; if (spot[2] !== 1) { ctx.translate(x0, y0); ctx.scale(spot[2], spot[2]); ctx.translate(-x0, -y0); } }
    const B = this.boss;   // (off the boss's head -- the palace chip lay across Malachar's mask: slid to the side with more room)
    if (!spot && !inCut && B && B.alive && !B.gone) { const bx = B.x - this.camX, hw = Math.max(60, (B.w || 60) * 0.9) + 16, bt = FLOOR_TOP + B.y - (B.z || 0) - (B.h || 0) - 10; if (y0 + ph > bt && x0 < bx + hw && x0 + pw > bx - hw) x0 = bx - hw - 48 >= pw ? clamp(bx - hw - pw, 48, 912 - pw) : clamp(bx + hw, 48, 912 - pw); }
    const s = 1 + 0.03 * Math.sin(this.frame * 0.2);
    ctx.translate(x0 + pw / 2, y0 + ph / 2); ctx.scale(s, s); ctx.translate(-(x0 + pw / 2), -(y0 + ph / 2));
    ctx.fillStyle = 'rgba(15,26,51,0.9)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y0, pw, ph, 12) : ctx.rect(x0, y0, pw, ph); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#f2c14a'; ctx.stroke();
    let x = x0 + 18; const by = y0 + 30;
    HUD.outlined(ctx, 'TEAM UP!', x, by + 1, 30, '#ffe066', F, 0.22, 'left'); x += wT + 16;
    parts.forEach((q, i) => {
      HUD.outlined(ctx, q.tag, x, by, 24, PLAYER_COLS[q.b.slot] || '#fff', F, 0.24, 'left'); x += q.wt;
      if (q.gw) { if (q.key) HUD.siKeycap(ctx, q.key, x + gap + q.gw / 2, y0 + ph / 2, q.gw, 26, 16); else app.drawGlyph(ctx, 'special', q.id, x + gap + q.gw / 2, y0 + ph / 2, g); x += gap + q.gw; }
      if (i < parts.length - 1) x += 14;
    });
    HUD.outlined(ctx, touch ? 'TAP SUPER!' : 'SUPER!', x + 14, by, 24, '#fff6e0', F, 0.24, 'left');
    ctx.restore();
    if (!inCut && !spot) this._hudBottom = Math.max(this._hudBottom || 0, y0 + ph + 4);   // (next frame's words and balloons stay under the chip; beside the boss block it is inside the band already)
  }
  drawInvite1(ctx, b, k) {
    const app = this.app, id = b.ctrlId === 'any' ? app.lastCtrl : b.ctrlId;
    const inCut = this.cutin && !this.cutin.team;
    let x = inCut ? 650 : clamp(b.x - this.camX, 120, W - 120), y = inCut ? 145 + k * 104 : clamp(FLOOR_TOP + b.y - b.z - 210, 64, H - 70);
    const s = 1 + 0.06 * Math.sin(this.frame * 0.2);
    const who = `P${b.slot + 1}:`, F = 'Bangers, Impact, sans-serif', g = 32, gap = 7, touch = id === 'touch';
    ctx.save();
    ctx.font = `28px ${F}`;
    const w1 = ctx.measureText(touch ? `${who} TAP SUPER!` : who).width, w2 = ctx.measureText('SUPER!').width;
    let gw = g;                           // (a keycap with a long label is wider than it is tall: measured on a scratch canvas)
    if (!touch) try { this._gctx = this._gctx || document.createElement('canvas').getContext('2d'); gw = app.input?.drawGlyph?.(this._gctx, 'special', b.ctrlId, 0, 0, g) || g; } catch { /* the plain size */ }
    const lw = touch ? w1 : w1 + gap + gw + gap + w2;
    ctx.font = `38px ${F}`;
    const pw = Math.max(lw, ctx.measureText('TEAM UP!').width) + 30, px = -pw / 2, py = -40, ph = 92, r = 16;
    // (RC: under the HUD band -- a card over a jumping hero sat on the boss's name and the score (crowds/mm4_4P) -- and off the cards
    //  already up: two TEAM UP! cards overlapped.  Kept on screen; the words step round them -- fx keep13)
    if (!inCut) {
      // (RC3: the speech balloons, the hero callouts (ROLL INTO ME!, HIT IT NOW!), the super names and the title card win -- fx.prio13,
      //  this frame's: the card goes the nearest free spot round them and the other cards, kept there while it stays free (a slide,
      //  eased), and waits -- not drawn -- while there is none.  mm4 / mm3 4P: a card over "Stars, hear me!", STARFALL!, THE RUBY GEM)
      const S = 1.06, hw = (pw / 2) * S, up = 40 * S, dn = 52 * S, top = Math.max(64, (this._hudBottom || 0) + 6 + up), bot = H - 70;
      const R = this._inv || (this._inv = []);
      const obst = [...(this.fx.prio13 || []).map((q) => [q[0] - 8, q[1] - 8, q[2] + 8, q[3] + 8]), ...R.map((q) => [q.x - q.hw - 6, q.y - up - 6, q.x + q.hw + 6, q.y + dn + 6])];
      const free = (cx, cy) => cx - hw >= 8 && cx + hw <= W - 8 && cy >= top && cy <= bot && !obst.some((q) => cx + hw > q[0] && cx - hw < q[2] && cy + dn > q[1] && cy - up < q[3]);
      const x0 = clamp(x, hw + 8, W - hw - 8), y0 = clamp(y, top, bot), C = b._card13;
      let spot = C && Math.abs(C[0] - x0) < 260 && Math.abs(C[1] - y0) < 220 && free(C[0], C[1]) ? C : null;
      if (!spot) for (const [dx, dy] of CARD13) if (free(x0 + dx, y0 + dy)) { spot = [x0 + dx, y0 + dy]; break; }
      if (!spot) { b._card13 = null; b._cardAt = null; ctx.restore(); return; }
      b._card13 = spot;
      const P0 = b._cardAt, e = P0 ? [P0[0] + (spot[0] - P0[0]) * 0.3, P0[1] + (spot[1] - P0[1]) * 0.3] : spot;
      [x, y] = free(e[0], e[1]) ? e : spot; b._cardAt = [x, y];
      R.push({ x, y, hw });
      this.fx.keep13?.([x - hw, y - up, x + hw, y + dn], 3, false, 'card');
    }
    // (RC4: drawn over a hero's cut-in, a card on its super's name -- the label sliding in, or the quick flash's slam -- hides while it
    //  would be on it: the P3 card read STARFALL as "ARFALL", the P2 card cut DRAGON FLARE! to "DRAGON FL".  showcase.js c._lab)
    { const L = inCut && this.cutin._lab, hw = (pw / 2) * 1.06; if (L && x + hw > L[0] && x - hw < L[2] && y + 52 * 1.06 > L[1] && y - 40 * 1.06 < L[3]) { ctx.restore(); return; } }
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath();                      // (a dark plate: readable over any band colour)
    ctx.moveTo(px + r, py); ctx.arcTo(px + pw, py, px + pw, py + ph, r); ctx.arcTo(px + pw, py + ph, px, py + ph, r);
    ctx.arcTo(px, py + ph, px, py, r); ctx.arcTo(px, py, px + pw, py, r); ctx.closePath();
    ctx.fillStyle = 'rgba(14,8,22,0.72)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ffe066'; ctx.stroke();
    HUD.outlined(ctx, 'TEAM UP!', 0, 0, 38, '#ffe066', F, 0.24, 'center');
    if (touch) HUD.outlined(ctx, `${who} TAP SUPER!`, 0, 36, 28, '#fff6e0', F, 0.24, 'center');
    else {
      const x0 = -lw / 2;
      HUD.outlined(ctx, who, x0, 36, 28, '#fff6e0', F, 0.24, 'left');
      app.drawGlyph(ctx, 'special', b.ctrlId, x0 + w1 + gap + gw / 2, 27, g);
      HUD.outlined(ctx, 'SUPER!', x0 + w1 + gap + gw + gap, 36, 28, '#fff6e0', F, 0.24, 'left');
    }
    ctx.restore();
  }
  addHazard(h) { this.hazards.push({ ...h, t: 0 }); }

  /** lives are infinite: a hero who goes down always gets back up where he fell (full health, a moment of
   * invulnerability, a ring that knocks the bad guys back).  The 'over' scene and continuePlayer are left in place but
   * no longer reached. */
  playerDied(p) {
    p.respawn();
  }
  /** a player out of lives presses START: back in through a portal */
  continuePlayer(p) {
    const anchor = this.livePlayers[0];
    p.lives = 3;
    const x = anchor ? anchor.x - 60 * (anchor.facing || 1) : this.camX + 200;
    p.warpIn(clamp(x, this.camX + 60, this.camX + W - 60), anchor ? clamp(anchor.y + 20, 10, DEPTH - 10) : 80);
    audio.jingle('join');
  }
  /** CHANGE HERO: the player in `slot` becomes `heroId`, warping in on the spot; super meter, score and health share kept */
  swapHero(slot, heroId, quiet = false) {   // (quiet: no join jingle or line -- Mystic Mountain's transformation)
    const old = this.players[slot];
    if (!old) return null;
    if (old.carry) old.dropCarry();
    if (old.state === 'special') { this.dim = 0; old.dragon = null; }   // (swapped mid-super: its dimming goes with it)
    preloadCutins([heroId]);
    const p = new Player(this, heroId, slot, old.ctrlId);
    p.warpIn(old.x, old.y);
    p.facing = old.facing;
    p.meter = old.meter; p.score = old.score;
    p.hp = Math.max(1, Math.round(p.maxHp * (old.alive && !old.out ? Math.max(old.hp, 1) / old.maxHp : 1)));
    p.ctl = !this.cut;
    this.players[slot] = p;
    for (const a of this.actors) if (a._tgt === old) a._tgt = null;   // (foes re-pick their target)
    // (a team window or a team attack that had the old hero in it: closed -- never a ghost partner)
    if (this.teamWin && (this.teamWin.a === old || this.teamWin.b === old)) this.teamWin = null;
    if (this.team && [this.team.a, this.team.b, ...(this.team.extra || [])].includes(old)) this.team = null;
    if (!quiet) { audio.jingle('join'); this.say(p, heroLine(LINES.joinIn, storyHero(heroId)), 110); }
    return p;
  }
  addPlayer(heroId, ctrlId) {
    preloadCutins([heroId]);
    const slot = this.players.length;
    const p = new Player(this, heroId, slot, ctrlId);
    this.players.push(p);
    const anchor = this.players[0];
    const x = clamp(anchor.x + ([0, 70, -70, 130][slot] ?? 70), this.camX + 60, this.camX + W - 60);
    p.warpIn(x, clamp(anchor.y + (slot === 2 ? -24 : 30), 10, DEPTH - 10));
    const B = this.boss;   // (the boss not fought yet: its health for the new party size)
    if (B && B.alive && B.baseHp && B.hp === B.maxHp) B.hp = B.maxHp = Math.round(B.baseHp * coopK(this.players.length, true));
    p.ctl = !this.cut;
    audio.jingle('join');
    this.say(p, heroLine(LINES.joinIn, storyHero(heroId)), 110);
    return p;
  }

  // ================================================================================================ update
  update() {
    if (this.cutin) {                     // a super cut-in: everything waits; its owner's START (or the pause tap) skips to the close
      const c = this.cutin;
      c.t++;
      if (c.t > CUTIN_SKIP && c.t < c.T - 7 && (this.app.ctrl(c.ctrl).pressed.start || (c.ctrl2 && this.app.ctrl(c.ctrl2).pressed.start))) { c.t = c.T - 7; this.swallowInput(); }
      if (c.team && this.team) for (const p of this.players) if (this.app.ctrl(p.ctrlId).pressed.special) this.teamJoin(p);   // (a 3rd / 4th joins)
      if (this.teamWin && !c.team) {      // (the world is frozen -- no Player.latch -- so the partner's SUPER is read here)
        this.teamWin.age++;
        if (this.teamPress()) return;
      }
      if (c.t >= c.T) {
        if (c.quick && c.p && c.name) this.fx.label(c.p.x, c.p.y, 236, c.name + '!', c.accent || '#ffe066', 38, 24);   // (the name pop)
        this.cutinSfx.push(...[].concat(c.sfx));
        this.cutin = this.cutinQ.shift() || null;
        if (this.cutin) this.startCutin(this.cutin);
        else { for (const s of this.cutinSfx) audio.sfx(s); this.cutinSfx = []; }   // (each super's sound when play resumes)
      }
      return;
    }
    if (this._impact && (this._impact.soft ? this.frame - (this._impact.t0 ?? this._impact.at) >= this._impact.n : --this._impact.n <= 0)) this._impact = null;
    let slowSkip = false;
    if (this.slow) {
      const S = this.slow;
      ++S.t;
      if (S.beat) { if (S.t >= S.n) this.slow = null; else slowSkip = S.t % 2 === 1; }   // (a boss-defeat beat eases out itself)
      else if (S.t < S.n) slowSkip = S.t % 2 === 1;
      else { if (S.t === S.n) this.shake = Math.max(this.shake, 5); if (S.t >= S.n + SLOW_OUT) this.slow = null; }   // (back to speed with a jolt; the zoom eases back -- zoomK)
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.8);
    if (this.washGated) this.siWashStep();   // (every book: the gated wash)
    else if (this.flashScreen > 0) this.flashScreen = Math.max(0, this.flashScreen - 0.07);
    this.stepDim();   // (the supers' dim, as drawn: rate-limited)
    if (this.teamBlast && ++this.teamBlast.t >= 70) this.teamBlast = null;   // (the flash and rings: life; the banner: 70)
    if (this.L?.si) this.siHitstopBudget();   // (Book 2's co-op hit-stop budget and press count: QA2 M1)
    for (const p of this.players) { p.latch(this.hitstop > 0 || slowSkip); if (p.flash > 0) p.flash--; }
    for (const a of this.actors) if (a.flash > 0) a.flash--;
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (slowSkip) return;

    this.runCutscene();
    // (each actor on its own: one that throws is reported and the rest of the world keeps running -- see actorError)
    for (const p of this.players) { try { p.update(); } catch (e) { this.actorError(p, e); } }
    if (this.teamWin) {
      const T = this.teamWin;
      T.age++;
      if (!this.teamOpen()) this.teamWin = null;
      else if (!this.teamPress() && T.req && this.teamMate(T.a, T.req) === T.req) this.startTeam(T.a, T.req);
    }
    if (this.team) this.updateTeam();
    // a PERFECT DODGE's slow time: foes, their shots and the hazards run at PERFECT.k (whole ticks: about every third),
    // the heroes and their shots at full speed
    let foeTick = true;
    if (this.perfect) { const P = this.perfect; P.acc += PERFECT.k; foeTick = P.acc >= 1; if (foeTick) P.acc -= 1; if (++P.t >= P.n) this.endPerfect(); }
    const frozen = this.cut && (this.cut.kind === 'boss' || this.cut.kind === 'ending');
    for (const a of this.actors) {
      if ((frozen && a !== this.boss && a.team === 'foe' && !a.ended) || (!foeTick && (a.team === 'foe' || a.team === 'shot'))) continue;   // (a.ended: falling to pieces -- Mystic Mountain's knights -- plays out)
      try { a.update(); } catch (e) { this.actorError(a, e); }
    }
    this.actors = this.actors.filter((a) => !a.gone);
    if (foeTick) this.updateHazards();
    if (this.mm) this.mm.step();
    this.fx.update();
    if (this.L?.si) SIFX.step(this);   // (Skull Island: its particles and each stage's ambient life -- src/sifx.js)
    if (this.engagedT > 0) this.engagedT--;
    if (this.engaged && this.engaged.gone && !this.engaged.boss) this.engaged = null;
    if (this.goT > 0) { this.goT--; if (this.goT % 32 === 31) audio.sfx('go'); }
    if (this.bannerT > 0) this.bannerT--;
    this.updateHints();
    if (this.cut?.kind === 'ending' && this.boss.freedNow) this.warm = Math.min(1, (this.warm || 0) + 0.01);
    if (this.queenBeat) this.stepQueenBeat();
    this.updateCamera();
    this.updateLevel();
    this.updateTalk();
  }

  /** the hit-pause (frames the world holds still).  Skull Island co-op (QA2 M1): a new small pause (< 15 f) is refused -- and one running is
   * cut (siHitstopBudget) -- once the last 24 frames already hold 6 frozen ones with 3-4 heroes (1 in 4) or 8 with 2 (1 in 3): a mashing
   * party froze the world 55% of the time, starving its MASH counts and hold timers.  A boss beat (>= 15 f) always plays.  No L.si: as ever. */
  get hitstop() { return this._hs || 0; }
  set hitstop(v) {
    if (v > 0 && v < 15 && this.L?.si && this.siStopCap && this.siStopCap.f === this.frame) v = Math.min(v, this.siStopCap.v);   // (a Book 2 boss's cap on the hit it just took: the solo Elder's bark thud, 2 f -- QAF N9)
    if (v > (this._hs || 0) && v < 15 && this.L?.si && this.siHsOver()) return;
    this._hs = v;
  }
  siHsOver() {
    const q = this.siHsQ, n = this.players ? this.players.filter((p) => !p.out && p.alive).length : 1;
    if (!q || n < 2) return false;
    let c = 0; for (const b of q) c += b;
    return c >= (n >= 3 ? 5 : 6);   // (3-4 heroes: 5 in 24 -- the measured share stays under 25%, QA2 round 2; 2 heroes: 6 -- 8 let a 2P Sloth fight freeze 30%, QAF N9)
  }
  /** (Skull Island) the budget's 24-frame window, a running small pause cut when it is over; and every hero's presses counted here every
   * frame, frozen ones too: p.siPress (src/siworld.js's MASH holds) */
  siHitstopBudget() {
    if (this._hs > 0 && this._hs < 15 && this.siHsOver()) this._hs = 0;
    const q = this.siHsQ || (this.siHsQ = []);
    q.push(this._hs > 0 ? 1 : 0); if (q.length > 24) q.shift();
    for (const p of this.players) {
      if (p.out || !p.ctl) continue;
      const pr = p.ctrl.pressed;
      if (pr.attack || pr.jump || pr.shoot || pr.dodge) p.siPress = (p.siPress || 0) + 1;
    }
  }
  updateHazards() {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t++;
      if (h.t % 6 === 0) this.fx.flames(h.x + (Math.random() - 0.5) * h.r, h.y + (Math.random() - 0.5) * 10, 0, 1, { scale: 0.6, green: h.green });
      if (h.t % 20 === 0) for (const p of this.players) {
        if (p.hittable && p.z < 20 && Math.abs(p.x - h.x) < h.r && Math.abs(p.y - h.y) < 16) p.takeHit({ x: h.x, team: 'hazard', facing: 1 }, { dmg: h.dmg || 5, kind: 'light', push: 2, stun: 12, stop: 2, sfx: 'hit_light', spark: 'warm' });
      }
      if (h.t >= h.life) this.hazards.splice(i, 1);
    }
  }

  /** an actor's update threw: report it (app.reportError: logged once, kept for the pause menu); on a repeat a player
   * goes back to idle, any other actor but the boss is removed -- one bad actor can never freeze the game */
  actorError(a, e) {
    this.app?.reportError?.(e, `update ${a.heroId || a.art || a.kind || a.team || 'actor'}`);
    a._updErr = (a._updErr || 0) + 1;
    if (a._updErr < 2) return;
    a._updErr = 0;
    if (this.players.includes(a)) { try { a.vx = a.vy = 0; a.set('idle'); } catch { /* keep going */ } }
    else if (a !== this.boss) a.gone = true;
  }
  updateHints() {
    if (this.L?.si && this.hintQ?.length && this.mm?.stepHintQ) this.mm.stepHintQ();   // (Book 2's forced-hint queue: QA2 M2)
    if (this.hint && ++this.hint.t >= this.hint.life) {
      const nx = this.hint.next;   // (a hint in beats -- src/mmworld.js hint: the next one, as the same hint)
      if (nx && nx.length) this.hint = { ...this.hint, text: nx[0].text, life: nx[0].life, t: 0, next: nx.slice(1) };
      else { this.hint = null; delete document.body.dataset.hint; }
    }
    if (this.cut || this.hint) return;
    if (this.L?.si && (this.L.arenas?.[this.arenaIdx]?.boss || this.actors.some((a) => a.miniBoss && a.alive))) return;   // (Book 2: no basic tutorial ever starts in a boss fight -- QA2 round 2)
    if (!this.L?.si && !this.L?.mm && this.L?.arenas?.[this.arenaIdx]?.boss) { this.bossTipB3(); return; }   // (RC, Book 3: likewise -- the boss's own tip instead)
    // (HINT_GAP between hints -- five in the first half-minute was too many; the two charge hints wait for the stage's later
    //  arenas; the low-health one never in a boss fight; in co-op a hint about one player goes to them, with their keys)
    if (this.hintAt !== undefined && this.frame - this.hintAt < HINT_GAP) return;
    const p = this.players[0], live = this.players.filter((q) => !q.out && q.alive), who = (f) => live.find(f);
    const later = this.levelIdx > 0 || this.arenaIdx >= 2, bossArena = !!this.L.arenas[this.arenaIdx]?.boss || this.actors.some((a) => a.miniBoss && a.alive);   // (miniBoss: Skull Island's Leviathan -- no 'smash crates' tip in its arena)
    const ready = this.players.filter((q) => !q.out && q.alive && q.meter >= 100);
    let q;
    if (!this.flags.hint_team && this.flags.hint_attack && this.players.length > 1 && !this.cutin && !this.team &&
      ready.some((a, i) => ready.some((r, j) => j > i && Math.abs(a.x - r.x) <= TEAM_RANGE)) && this.onScreenFoes().length >= 2) { this.hintOnce('team', readFrames(this.app.hintText('team', p))); return; }
    if (!this.flags.hint_attack && this.actors.some((a) => a.team === 'foe' && a.alive && a.entered && !a.boss && !a.noAttackHint)) this.hintOnce('attack');   // (noAttackHint: Morvath's hanging staff -- its own hint says what to do)
    else if (this.flags.hint_attack && !this.flags.hint_shoot && this.flags.firstKO) this.hintOnce('shoot');
    else if (!this.flags.hint_special && this.flareHintAt && this.frame >= this.flareHintAt && (this.L?.si || this.onScreenFoes().length >= 2)) this.hintOnce('special');   // (RC, Books 1 / 3: "Lots of enemies?" waits for some -- it came up over a freed boss with none left: dqs3_wyvern_alpha_08_freed, the Frost Chief's)
    else if (!this.flags.hint_charge && this.flags.hint_shoot && later && (q = who((a) => (a.shotsFired || 0) >= 4))) this.hintOnce('charge', 330, q);
    else if (!this.flags.hint_dodge && this.flags.hint_attack && (q = who((a) => (a.hitsTaken || 0) >= 3))) this.hintOnce('dodge', 330, q);
    else if (!this.flags.hint_cmelee && this.flags.hint_attack && later && (q = who((a) => (a.swings || 0) >= 16 && !a.strikes))) this.hintOnce('cmelee', 330, q);
    else if (!this.flags.hint_snack && !bossArena && (q = who((a) => a.hp < 40))) this.hintOnce('snack', 330, q);
    else if (this.players.length === 1 && this.levelIdx === 0 && this.camX > 1200 && !this.flags.hint_join) this.hintOnce('join');
  }
  /** (RC) Book 3: the boss's own tip (B3_TIPS), once a run, half a second into the fight (after its intro) -- its beats one after the other */
  bossTipB3() {
    const B = this.boss, k = this.L.boss ? this.L.boss.kind + (this.L.boss.crystal ? '_crystal' : '') : null, T = k && B3_TIPS[k];
    if (!T || !B || !B.alive || !this.fighting || this.flags['hint_b3_' + k]) { this._tipFrom = undefined; return; }
    if (this._tipFrom === undefined) this._tipFrom = this.frame;
    if (this.frame - this._tipFrom < 30) return;   // (RC2: half a second into play -- the long wait the critic saw was the boss's intro cut, ~13 s with its card)
    this.flags['hint_b3_' + k] = true;
    this.hint = { text: T[0], t: 0, life: 300, key: 'b3_' + k, next: T.slice(1).map((text) => ({ text, life: 300 })) };
    this.hintAt = this.frame;
    try { document.body.dataset.hint = 'b3_' + k; } catch { /* (no DOM) */ }
  }
  /** a hint, once a run; `p`: the player it's about (co-op: "P2: Hold [.] ...", in their keys) */
  hintOnce(key, life = 330, p = null) {
    if (this.flags['hint_' + key]) return;
    let text = this.app.hintText(key, p || this.players[0]);
    if (!text) return;                    // (nothing to say yet -- 'join' with no controller connected: it waits for one)
    if (p && this.players.length > 1) text = `P${p.slot + 1}: ${text}`;
    this.flags['hint_' + key] = true;
    this.hint = { text, t: 0, life, key };
    this.hintAt = this.frame;
    document.body.dataset.hint = key;
  }

  updateCamera() {
    const live = this.players.filter((p) => !p.out);
    if (!live.length) return;
    const xs = live.map((p) => p.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const def = this.L.arenas[this.arenaIdx];
    const limit = def ? def.cam : this.len - W;
    // follow the leader; the left edge of the screen herds a lagging hero along (Streets of Rage style)
    const target = Math.min(maxX - 520, limit);
    if (target > this.camX) this.camX = Math.min(target, this.camX + 7);
    this.camX = clamp(this.camX, 0, this.len - W);
    const mid = this.camX + W / 2;
    const si = this.sections.findIndex((s) => mid >= s.x0 && mid < s.x1);
    if (si !== this.section && si >= 0) {
      this.section = si;
      if (si > 0 || !this.intro) { this.banner = this.sections[si].name.toUpperCase(); this.bannerT = 180; }
    }
  }

  updateLevel() {
    const L = this.L, def = L.arenas[this.arenaIdx];
    if (!this.fighting && this.patrolIdx < L.patrols.length && this.camX + W > L.patrols[this.patrolIdx].x) {
      for (const s of L.patrols[this.patrolIdx].spawns) this.pending.push({ spec: s, at: this.frame + (s.delay || 0) });
      this.patrolIdx++;
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.frame >= this.pending[i].at) { this.spawn(this.pending[i].spec); this.pending.splice(i, 1); }
    }
    if (!def) return;
    if (!this.fighting && this.camX >= def.cam - 0.5) {
      this.fighting = true; this.waveIdx = 0; this.goT = 0;
      if (def.boss) this.startBoss();
      else { this.startWave(); if (def.say) this.queueTalk(def.say, 50); }
    }
    if (this.fighting && !def.boss) {
      const foes = this.actors.filter((a) => a.team === 'foe' && a.alive && !a.boss).length;
      if (def.brute && !this.flags['brute' + this.levelIdx + '_' + this.arenaIdx]) {
        const b = this.actors.find((a) => a.art === 'brute' && a.entered && a.alive);
        if (b) { this.flags['brute' + this.levelIdx + '_' + this.arenaIdx] = true; b.set('roar'); audio.sfx('roar', { pitch: 1.3 }); this.queueTalk(LINES.bruteIntro[L.id] || LINES.bruteIntro.road, 10); }
      }
      if (foes === 0 && this.pending.length === 0) {
        if (this.waveGap === undefined) this.waveGap = 40;
        if (--this.waveGap <= 0) {
          this.waveGap = undefined;
          if (this.waveIdx < def.waves.length - 1) { this.waveIdx++; this.startWave(); }
          else { this.fighting = false; this.arenaIdx++; this.goT = 200; this.tokens = 0; }
        }
      }
    }
  }
  startWave() {
    const def = this.L.arenas[this.arenaIdx];
    for (const s of def.waves[this.waveIdx]) this.pending.push({ spec: s, at: this.frame + (s.delay || 0) });
  }

  /** a waystone was touched: checkpoint + save */
  checkpointAt(ws) {
    const idx = this.things.filter((t) => t.kind === 'waystone').indexOf(ws);
    if (idx > this.checkpoint) this.checkpoint = idx;
    for (const p of this.players) { if (!p.out) { p.hp = Math.min(p.maxHp, p.hp + 30); p.addMeter(50); } }
    // (a waystone behind a secret stage's return point: the save point stays where he came back; one past it takes over)
    if (this.retPoint && ws.x > this.retPoint.x) this.retPoint = null;
    if (this.retPoint) this.app.saveProgress(this.levelIdx, this.checkpoint, this.retPoint);
    else this.app.saveProgress(this.levelIdx, idx);
    this.fx.label(ws.x, ws.y, 190, 'GAME SAVED', '#9fe7ff', 30, 90);
    audio.jingle(this.L.si ? 'si_save' : 'save');   // (Book 2: a ship's bell)
  }

  // ================================================================================================ talk
  heroSpeaker() { return this.players.find((p) => !p.out) || this.players[0]; }
  speakerFor(who) {
    if (who === 'hero') return this.heroSpeaker();
    if (who === 'dod' || who === 'ana' || who === 'sha' || who === 'sca') {
      const id = { dod: 'dodongo', ana: 'ana', sha: 'shadow', sca: 'scarlet' }[who];
      return this.players.find((p) => baseOf(p.heroId) === id && !p.out) || this.heroSpeaker();   // (a secret form says its hero's lines)
    }
    if (who === 'boss' || who === 'boss2' || who === 'king' || who === 'king2') return this.boss;
    if (who === 'kob') return this.actors.find((a) => a.art === 'kobold' && a.alive && a.entered && !a.down);
    if (who === 'brute') return this.actors.find((a) => a.art === 'brute' && a.alive);
    if (who === 'guard') return this.actors.find((a) => a.art === 'guard' && a.alive && a.entered);
    return null;
  }
  /** the line as this speaker says it: Shadow only ever says "..." */
  lineFor(who, text, s) {
    if (s && s.team === 'hero') {
      const id = storyHero(s.heroId);   // (Dragon Dodongo: Dodongo's lines)
      const want = { dod: 'dodongo', ana: 'ana', sha: 'shadow', sca: 'scarlet' }[who];
      if (want && want !== id) return heroLine(LINES.swap[who] || text, id, text);
      return heroLine(text, id);
    }
    return typeof text === 'string' ? text : text.default || '';
  }
  balloonStyle(who) { return who === 'king' ? { king: true } : { villain: !['hero', 'dod', 'ana', 'sha', 'sca', 'boss2', 'ally'].includes(who) }; }
  say(actor, text, life, style = {}) {
    if (!actor || !text) return;
    if (this.frame < (this.sayAfter ?? -1)) { (this.sayHeld || (this.sayHeld = [])).push({ actor, text, life, style }); return; }   // (a boss intro's name banner still fading: the line waits for it -- bossIntroDone)
    this.fx.balloon(actor, text, life || readFrames(text), style);
  }
  queueTalk(lines, delay = 0) {
    let at = this.frame + delay;
    for (const [who, text] of lines) { this.talk.push({ who, text, at, waited: 0 }); at += readFrames(typeof text === 'string' ? text : (text.default || 'x x x x')) + 10; }
    this.holdUntil = Math.max(this.holdUntil || 0, Math.min(at, this.frame + delay + 300));
  }
  updateTalk() {
    if (this.sayHeld && this.frame >= (this.sayAfter ?? -1)) { const H = this.sayHeld; this.sayHeld = null; for (const q of H) if (!q.actor.gone && !q.actor.out) this.say(q.actor, q.text, q.life, q.style); }   // (the held opening lines, the banner gone)
    for (let i = 0; i < this.talk.length; i++) {
      const l = this.talk[i];
      if (this.frame < l.at) continue;
      const s = this.speakerFor(l.who);
      if (!s) {
        if (++l.waited > 400) { this.talk.splice(i--, 1); continue; }
        for (const m of this.talk) if (m.at >= l.at) m.at++;
        this.holdUntil++;
        continue;
      }
      const text = this.lineFor(l.who, l.text, s);
      this.say(s, text, readFrames(text), this.balloonStyle(l.who));
      this.talk.splice(i--, 1);
    }
  }

  // ================================================================================================ boss + in-level cutscenes
  startBoss() {
    if (this.mm && this.mm.gate()) return;   // (Mystic Mountain: the boss gate's story first; it calls this again after)
    for (const a of this.actors) if (a.team === 'foe' && a !== this.boss && a.alive) { a.alive = false; a.gone = true; this.fx.poof(a.x, a.y, a.z); a.releaseToken?.(); }
    for (const a of this.actors) if (a.formFx) { a.gone = true; a.out = true; }   // (the secret forms' shots and decoys: not over the boss's card)
    this.pending = []; this.talk = []; this.tokens = 0;
    for (const p of this.players) p.ctl = false;
    // (met before in this run -- a RESTART or a CONTINUE back to it: a short intro, its name on a banner)
    const seen = this.app.run.bossSeen || (this.app.run.bossSeen = {});
    this.cut = { kind: 'boss', t: 0, quick: !!seen[this.L.id] };
    seen[this.L.id] = true;
    audio.music(null);
  }
  /** the boss intro over: the fight */
  bossIntroDone() {
    this.fx.list = this.fx.list.filter((q) => q.type !== 'balloon');
    // (a hero knocked out just before the gate comes back up -- never at 0 HP with control)
    for (const p of this.players) { if (!p.out && p.hp <= 0) p.respawn(); else p.set('idle'); p.ctl = true; p.autoDx = 0; p.talking = false; }
    if (this.boss) this.boss.talking = false;
    this.cut = null; this.swallowInput();
    // (a quick intro's name banner -- 'MORVATH!', up 120 frames from the cut's 2nd -- stood ~60 frames into the fight, on the boss's opening line:
    //  it fades now, over its own 20-frame fade-out, and the fight's first balloons wait for it -- every book, sign fix)
    if (this.bannerT > 20) this.bannerT = 20;
    if (this.bannerT > 0) this.sayAfter = this.frame + this.bannerT;
    // (the fight's own opening -- its line, its first hint -- after the cut is gone and the intro's balloons cleared)
    this.boss.bossFight?.();
    this.engage(this.boss); audio.music(this.L.bossMusic || 'boss');
  }
  onBossDefeated(b) {
    // (Shadow -- or Legend Shadow -- among the heroes in play: this boss counts toward LEGEND SHADOW, once)
    // (the summit's dragon is the hero who became it -- Shadow, in a party without Dodongo: his credit)
    const D = this.app.run?.mmDragon;
    this.app.noteBossBeaten?.(this.L.id, this.players.filter((p) => !p.out).map((p) => (p.heroId === 'dragon' && D && D.slot === p.slot ? D.from : p.heroId)));
    if (this.L.secret) { this.secretBossDown(b); return; }
    this.hitstop = 20; this.shake = 16; this.flashScreen = 0.6; this.flashAt = { x: b.x, y: b.y, z: 150 };
    audio.music(null);
    audio.sfx('hit_finisher', { pitch: 0.7 });
    if (!b.ownFinish) this.fx.word(b.x, b.y, 200, true, b.collared === false ? 'KA-BOOOM!' : 'KRAK!');   // (a boss that shouts its own finish: just that)
    if (this.L?.si && !b._beat) SIFX.bossBeat(this, b);   // (Skull Island: the staged final-blow beat -- slow motion, the camera easing in, its material bursting -- unless its own finish already played it: src/sifx.js)
    for (const a of this.actors) if (a.team === 'foe' && a !== b && a.alive) { a.alive = false; a.gone = true; this.fx.poof(a.x, a.y, a.z); }
    for (const p of this.players) { p.ctl = false; p.dropCarry?.(); }
    this.cut = { kind: 'ending', t: 0 };
  }
  swallowInput() { this.app.swallowInput(); for (const p of this.players) p.bufA = p.bufJ = p.bufS = p.bufP = p.bufD = 0; }

  /** step a cutscene conversation (press to page after a good look); true when every line has been read */
  dialog(c, lines, skip) {
    if (c.idx === undefined) { c.idx = -1; c.lineT = 0; }
    c.lineT++;
    const cur = c.cur;
    const ready = c.idx < 0 || c.lineT >= readFrames(cur) || (skip && c.lineT >= minFrames(cur));
    if (cur) { const b = this.fx.list.find((q) => q.type === 'balloon'); if (b) b.cue = c.lineT >= minFrames(cur); }
    for (const p of this.players) p.talking = false;
    if (this.boss) this.boss.talking = false;
    if (!ready) { if (c.speaker) c.speaker.talking = c.lineT < readFrames(cur) * 0.7; return false; }
    this.fx.list = this.fx.list.filter((q) => q.type !== 'balloon');
    c.idx++; c.lineT = 0;
    if (c.idx >= lines.length) return true;
    const [who, text] = lines[c.idx];
    const s = this.speakerFor(who);
    c.cur = this.lineFor(who, text, s); c.speaker = s;
    this.say(s, c.cur, 99999, this.balloonStyle(who));
    return false;
  }

  /** a standing spot that isn't in one of the boss's lava pools */
  clearOfPools(tx, from) {
    for (const q of this.boss?.pools || []) {
      if (Math.abs(tx - q.x) < 100) tx = q.x + (from < q.x ? -110 : 110);
    }
    return tx;
  }

  runCutscene() {
    const c = this.cut;
    if (!c) return;
    c.t++;
    const skip = this.app.anySkip();
    const freeze = (p) => { if (['idle', 'walk', 'run', 'land', 'atk', 'hurt', 'shoot'].includes(p.state)) { p.set('cutscene'); p.vx = p.vy = 0; } };
    if (c.kind === 'intro') {
      for (const p of this.players) p.autoDx = c.t < 70 ? 1 : 0;
      if (c.t >= 200) {
        const p = this.players[0];
        const l = LINES.levelStart[this.L.id];
        if (l) this.say(this.speakerFor(l[0]), this.lineFor(l[0], l[1], this.speakerFor(l[0])));
        for (const p2 of this.players) { p2.ctl = true; p2.autoDx = 0; }
        this.cut = null; this.swallowInput();
        void p;
      }
      return;
    }
    if (c.kind === 'boss') {
      // nobody gets lost behind the boss while it talks: heroes step back to the left of it
      const gap = (this.boss.talkGap || 230);
      const liveP = this.players.filter((p) => !p.out), BX = this.boss.x, minR = BX + (this.boss.w || 60) + 70, maxR = this.camX + W - 110;
      // (Skull Island: each side packs its own heroes -- the ones right of the boss step to the right when there is room, at
      //  60 px spacing from the boss outward, squeezed toward it (never onto the body) when the screen edge is near; the rest to
      //  the left the same way.  4P with i * 70 offsets sent the 3rd / 4th hero onto the boss's legs.  Books 1 / 3: as ever.)
      //  (only as many on the right as fit there 18 px apart -- a huddle beats a walk across the boss; the furthest right first;
      //  any rest go left, drawn behind the boss as they cross)
      const SI = !!this.L?.si, capR = SI && maxR >= minR ? Math.floor((maxR - minR) / 18) + 1 : 0;
      const rightSet = liveP.filter((p) => p.x > BX).sort((a, b) => b.x - a.x).slice(0, capR), leftSet = liveP.filter((p) => !rightSet.includes(p));
      liveP.forEach((p, i) => {
        const j = rightSet.indexOf(p), right = j >= 0, k = SI ? leftSet.indexOf(p) : i;
        const tx = right ? this.clearOfPools(Math.min(maxR, Math.max(minR + j * 18, BX + gap + j * 60 - Math.max(0, BX + gap + (rightSet.length - 1) * 60 - maxR))), p.x)
          : this.clearOfPools(Math.max(this.camX + 70, BX - gap - k * (SI ? 60 : 70)), p.x);
        if (c.t < 110 && (right ? Math.abs(p.x - tx) > 6 : p.x > tx + 6) && !p.down) {   // (Book Two's right side: to the mark either way -- one past it stood at the screen's edge)
          if (p.state === 'cutscene') p.set('idle');
          p.autoDx = right ? Math.sign(tx - p.x) : -1;
        } else { p.autoDx = 0; freeze(p); }
        if (p.state === 'cutscene') p.facing = this.boss.x > p.x ? 1 : -1;
      });
      // (the card from t 20 -- a rising boss's once it is up (bossRise), at the latest from 140; the rest of the intro keys off it)
      if (c.cardAt === undefined && c.t >= 20 && (this.bossRise() >= CARD_RISE || c.t >= 140)) c.cardAt = c.t;
      if (c.quick) {                         // (met before: its roar and its name, then the fight)
        if (c.t === 2) { this.boss.bossIntro?.(); audio.jingle(this.L.si ? 'si_bossintro' : 'bossintro'); this.banner = (this.boss.name || 'BOSS') + '!'; this.bannerT = 120; }
        if (c.t >= (c.cardAt ?? 1e9) + 40) this.bossIntroDone();   // (t 60 -- a rising boss's: 40 frames of its card once it is up)
        return;
      }
      // (a held BACK -- Esc, a pad's circle -- or the corner button skips it, as a story's)
      c.skipHold = (this.app._any.held.back || this.app._cornerHeld) && c.t > 20 ? (c.skipHold || 0) + 1 : 0;
      if (c.skipHold >= 45) { if (c.t < 20) this.boss.bossIntro?.(); this.bossIntroDone(); return; }
      if (c.t === 20) { this.boss.bossIntro?.(); audio.jingle(this.L.si ? 'si_bossintro' : 'bossintro'); }
      if (c.t >= (c.cardAt ?? 1e9) + 110 && this.dialog(c, LINES.bossIntro[this.L.id] || [], skip)) this.bossIntroDone();   // (t 130 -- later for a rising boss)
      return;
    }
    if (c.kind === 'ending') {
      const b = this.boss;
      const live = this.players.filter((p) => !p.out);
      const WALK = this.L?.si ? 30 : 150, HOLD = this.L?.si ? 120 : 150;   // (Book 2: a shorter walk-up and hold -- its bosses' own finishes already played the beat; Books 1 / 3 unchanged)
      live.forEach((p, i) => {
        if (c.t < WALK && !p.down) {
          let side = p.x < b.x ? -1 : 1;
          const off = (b.talkGap || 230) + i * 70;
          if (b.x + side * off < this.camX + 60 || b.x + side * off > this.camX + W - 60) side = -side;
          const tx = clamp(this.clearOfPools(b.x + side * off, p.x), this.camX + 60, this.camX + W - 60);
          if (p.state === 'cutscene' || p.state === 'victory') p.set('idle');
          p.autoDx = Math.abs(p.x - tx) > 6 ? Math.sign(tx - p.x) : 0;
          p.autoDy = Math.abs(p.y - (b.y + i * 30)) > 4 ? Math.sign(b.y + i * 30 - p.y) : 0;
        } else { p.autoDx = p.autoDy = 0; }
        if (c.t >= WALK) freeze(p);
        if (p.state === 'cutscene') p.facing = b.x > p.x ? 1 : -1;
      });
      if (live[0] && Math.abs(live[0].x - b.x) > 20) b.facing = live[0].x < b.x ? -1 : 1;
      if (c.t >= WALK + 10 && !c.won && this.dialog(c, LINES.bossFreed[this.L.id] || [], skip)) {
        c.won = c.t;
        for (const p of live) p.set('victory');
        audio.jingle(this.L.si ? 'si_clear' : 'levelclear');   // (Book 2: heave-ho)
      }
      if (c.won && c.t - c.won > HOLD) { this.cut = null; this.app.levelCleared(); }
    }
  }

  // ================================================================================================ render
  /** P1 / P2 tags over the heroes in co-op */
  /** two players on the same hero (the same form: the same look) -- src/player.js drawShadow's ring and these tags tell them apart */
  isTwin(p) { return this.players.some((q) => q !== p && !q.out && q.heroId === p.heroId); }
  drawTags(ctx, twinsOnly = false) {
    const placed = [], S = this.L?.si ? 1.2 : 1, step = 30 * S;   // (Book Two: 18 px tags -- a TV at 3 m; Books 1 / 3: 15 px)
    for (const p of this.players) {
      if (p.out || p.hidden) continue;
      const twin = this.isTwin(p);
      if (twinsOnly && !twin) continue;   // (a stage rule's scripted beat hides the tags: a twin's stays)
      if (this.L?.si && !twin && this.fx.list.some((q) => q.type === 'balloon' && q.actor === p)) continue;   // (Skull Island: a hero talking needs no tag -- the balloon's tail points at them, and it landed on the tag)
      let x = p.sx;
      let y = p.sy - (p.art?.META?.height || 145) - 14;
      if (twin && this.L?.si && this.fx.list.some((q) => q.type === 'balloon' && q.actor === p)) { x += 38; y += 12; }   // (a twin talking: the tag beside the balloon's tail, not under it)
      if (this.L?.si) {                      // (Skull Island: side by side over the bunch -- a column of P2 / P3 tags read as one tall label)
        for (let k = 0; k < 4; k++) { const q = placed.find((r) => Math.abs(r.x - x) < step && Math.abs(r.y - y) < 19 * S); if (!q) break; x = q.x + (x >= q.x ? step : -step); }
        placed.push({ x, y });
      } else if (this.players.length > 2) {         // (three / four heroes bunch up: a tag on another one is raised clear of it)
        for (let k = 0; k < 4 && placed.some((q) => Math.abs(q.x - x) < 30 && Math.abs(q.y - y) < 19); k++) y -= 19;
        placed.push({ x, y });
      }
      const col = PLAYER_COLS[p.slot] || '#fff';
      if (!this.L?.si) {   // (RC3, Books 1 / 3: a tag on a speech balloon, a callout or a super name hides while it would be -- they win: the P3 tag inside Ana's line, P1 on ROLL INTO ME!)
        const r = [x - 17, y - 17, x + 17, y + 13], on = (this.fx.prio13 || []).some((q) => r[2] > q[0] && r[0] < q[2] && r[3] > q[1] && r[1] < q[3]);
        p._tagA = on ? 0 : Math.min(1, (p._tagA ?? 1) + 0.12);   // (hidden at once while it would be on one; back over 8 frames after)
        if (p._tagA <= 0.02) continue;
      }
      ctx.save();
      if (!this.L?.si && (p._tagA ?? 1) < 1) ctx.globalAlpha *= p._tagA;
      ctx.font = `bold ${15 * S}px "Luckiest Guy", "Comic Neue", sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 4 * S; ctx.strokeStyle = '#1a1020'; ctx.strokeText('P' + (p.slot + 1), x, y);
      ctx.fillStyle = col; ctx.fillText('P' + (p.slot + 1), x, y);
      if (!this.L?.si) this.fx.keep13?.([x - 17, y - 17, x + 17, y + 13], 2, true, 'tag');   // (RC: Books 1 / 3 -- the floating words step over the P-tags, not onto them)
      ctx.beginPath(); ctx.moveTo(x - 6 * S, y + 4 * S); ctx.lineTo(x + 6 * S, y + 4 * S); ctx.lineTo(x, y + 11 * S); ctx.closePath();
      ctx.lineWidth = 2.5 * S; ctx.stroke(); ctx.fill();
      ctx.restore();
    }
  }

  render(ctx) {
    if (!this.L?.si) this.fx.prio13 = [];   // (RC3, Books 1 / 3: this frame's balloons, callouts, super names and title card -- the TEAM UP! cards and the P-tags give way to them)
    const sh = this.cutin || (REDUCED && this.L?.si) ? 0 : this.shake;   // (Skull Island with reduced motion: no screen shake -- Books 1 / 3 as ever)
    ctx.save();
    if (sh > 0) ctx.translate((Math.random() - 0.5) * sh * 1.2, (Math.random() - 0.5) * sh * 0.9);
    const Z = this.zoomK;                                // (a super's punch-in: the world only, never the HUD; held through a cut-in -- the
                                                         //  world waits -- a snap to 1 when one began mid-punch darkened 27 % of the screen in a frame)
    if (Z > 1.001) { const S = this.slow, fx = S.x - this.camX, fy = FLOOR_TOP + S.y - S.z; ctx.translate(fx, fy); ctx.scale(Z, Z); ctx.translate(-fx, -fy); }
    this.stage.setWarm?.(this.warm || 0);
    try { this.stage.drawBack(ctx, this.camX, this.time); } catch (e) { if (!this._stageErr) { this._stageErr = 1; console.error('stage drawBack', e); } ctx.fillStyle = '#4a4058'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#6a6078'; ctx.fillRect(0, 340, W, H); }
    if (this.dimShown > 0.01) { ctx.fillStyle = `rgba(18,8,26,${this.dimShown})`; ctx.fillRect(-20, -20, W + 40, H + 40); }   // (rate-limited: stepDim)
    if (this.L?.si) SIFX.draw(ctx, this, 'back');   // (Skull Island: floor decals, spray, wisps -- under the telegraphs and the actors)
    let imp = this._impact && !this.cutin ? this._impact : null;   // (an impact frame: white silhouettes on a dark wash)
    let impA = 0.9;
    if (imp && imp.soft) {   // (Books 1 / 2: the wash ramped and gated; the stylised frame only at its peak)
      if (imp.t0 === undefined) imp.t0 = this.frame;   // (its first drawn frame)
      const R = rampOf(imp), t = this.frame - imp.t0, e = t >= 0 && t < R.length ? R[t] : 0;
      impA = imp.wash ? e : 0;
      if (!(e >= peakOf(R))) {
        if (impA > 0.005) { ctx.fillStyle = `rgba(12,6,20,${impA})`; ctx.fillRect(-60, -60, W + 120, H + 120); }
        if (imp.ramp && impA > 0.005) this.impactTint(ctx, imp, 0.28 * impA / peakOf(R));   // (Mystic Mountain: the tint ramps in and out with the wash -- never on in one frame)
        imp = null;
      }
    }
    if (imp) {
      if (imp.soft && !imp.wash) {   // (gated off: a soft vignette under the silhouettes -- the hit still reads; Mystic Mountain: the silhouettes alone, its vignette came in at 0.35 in a frame)
        if (!imp.ramp) { const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62); vg.addColorStop(0, 'rgba(12,6,20,0)'); vg.addColorStop(1, 'rgba(12,6,20,0.35)'); ctx.fillStyle = vg; ctx.fillRect(-60, -60, W + 120, H + 120); }
        setSilhouette('#fff8ea');
      } else {
      ctx.fillStyle = `rgba(12,6,20,${impA})`; ctx.fillRect(-60, -60, W + 120, H + 120);
      if (imp.col2) { const gr = ctx.createLinearGradient(0, 0, W, H); gr.addColorStop(0.35, rgba(imp.col, 0.3)); gr.addColorStop(0.65, rgba(imp.col2, 0.3)); ctx.fillStyle = gr; }
      else ctx.fillStyle = rgba(imp.col, 0.28);
      ctx.fillRect(-60, -60, W + 120, H + 120); setSilhouette('#fff8ea');
      }
    }
    for (const t of this.things) t.drawFloor?.(ctx);
    this.boss?.drawFloor?.(ctx);
    this.fx.drawUnder(ctx, this.camX, this.time);
    if (this.teamBlast && this.teamBlast.t < this.teamBlast.life) this.drawTeamRings(ctx);
    if (this.queenBeat) this.drawQueenGem(ctx);       // (the Heartstone in its niche: behind everyone)
    const list = [...this.players.filter((p) => !p.out), ...this.actors];
    for (const a of list) if (!a.gone && a.drawShadow && a.team !== 'shot' && a.team !== 'heroShot') a.drawShadow(ctx);
    list.sort((a, b) => ((a.sortY ?? a.y) - (b.sortY ?? b.y)) || (a.z - b.z));
    // (Skull Island's boss card: a hero still crossing the boss's body is drawn faded (55 %) while it crosses -- behind its legs it vanished,
    //  over them it covered him; the card shows the boss)
    const cardFade = this.L?.si && this.cut?.kind === 'boss' && this.boss && (this.boss.h || 0) < 300 ? new Set(this.players.filter((p) => Math.abs(p.x - this.boss.x) < (this.boss.w || 60) * 1.1 + 30)) : null;
    const seeOver = this.L?.si && !this.cut ? this.players.filter((p) => !p.out).map((p) => ({ s: p.sortY ?? p.y, x0: p.x - Math.max(18, (p.w || 20) * 0.8), x1: p.x + Math.max(18, (p.w || 20) * 0.8), y0: p.y - p.z - (p.h || 60) * 1.05, y1: p.y - p.z, hip: p.y - p.z - (p.h || 60) * 0.55 })) : null;   // (Skull Island: a prop, a torch or a thing drawn over a hero it overlaps fades to 40 % while the hero is behind it -- QAF3)
    const seeA = (a) => { if (!seeOver || a.team === 'hero' || !(a.team === 'prop' || a.team === 'thing' || (a.team === 'fx' && a.w > 0 && a.h >= 40))) return 1; const s = a.sortY ?? a.y, hw = Math.max(10, (a.w || 20) * 0.6), y1 = a.y - a.z, y0 = y1 - (a.team === 'prop' ? (this.propInfo?.[a.kind]?.h ?? a.h ?? 60) : (a.h || 60)); const hit = seeOver.some((b) => s > b.s && a.x + hw > b.x0 && a.x - hw < b.x1 && y1 > b.y0 && y0 < b.hip); const thin = (a.team === 'prop' ? (this.propInfo?.[a.kind]?.w ?? a.w ?? 20) : (a.w || 20)) < (y1 - y0) * 0.5; a._seeA = (a._seeA ?? 1) + ((hit ? (thin ? 0.62 : 0.4) : 1) - (a._seeA ?? 1)) * 0.25; return a._seeA; };
    try { for (const a of list) { try { if (cardFade && cardFade.has(a)) { ctx.save(); ctx.globalAlpha = 0.55; try { a.draw(ctx); } finally { ctx.restore(); } continue; } const fa = seeA(a); if (fa < 0.99) { ctx.save(); ctx.globalAlpha *= fa; try { a.draw(ctx); } finally { ctx.restore(); } continue; } const kx = this.L?.si ? SIFX.kickOf(a) : 0; if (kx) { const q = SIFX.squashOf(a), fy = FLOOR_TOP + a.y - a.z; ctx.save(); ctx.translate(a.x - this.camX + kx, fy); ctx.scale(1 + q, 1 - q); ctx.translate(-(a.x - this.camX), -fy); try { a.draw(ctx); } finally { ctx.restore(); } } else a.draw(ctx); } catch (e) { if (!a._drawErr) { a._drawErr = 1; console.error('draw', a.art || a.kind || a.heroId, e); } } }
      for (const p of this.players) { try { p.drawDragon?.(ctx); } catch (e) { if (!p._dragonErr) { p._dragonErr = 1; console.error('draw dragon', e); } } }
      for (const t of this.things) { try { t.drawOver?.(ctx); } catch (e) { if (!t._overErr) { t._overErr = 1; console.error('draw over', t.kind, e); } } }   // (the hidden exits' prompts)
      if (this.L?.si && this.players.filter((p) => !p.out).length > 1 && !this.cut) this.drawTags(ctx, !!this.mm?.hideTags?.());   // (Skull Island: the P-tags under the stage rules' labels and meters, the words and the balloons -- never printed over a line)
      if (this.mm) { try { this.mm.drawOver(ctx); } catch (e) { if (!this._mmErr) { this._mmErr = 1; console.error('mm draw over', e); } } }   // (puppet strings, chains)
    } finally { setSilhouette(null); }
    if (DEBUG) this.drawDebug(ctx);
    this.fx.hudTop = Math.max(this._hudBottom || 0, (this.app.unlockToast && this._signBottom) || 0);   // (the HUD band's bottom, last frame's -- or an unlock sign's under it, src/hud.js drawUnlock: words and balloons stay under it)
    if (this.L?.si && Z > 1.001 && this.fx.hudTop) { const fy = FLOOR_TOP + this.slow.y - this.slow.z; this.fx.hudTop = fy + (this.fx.hudTop - fy) / Z; }   // (Skull Island: under a punch-in the words are drawn zoomed -- the clamp in world terms, so they still land below the HUD band, never on the boss's name and bar)
    if (this.L?.si) SIFX.draw(ctx, this, 'front');   // (Skull Island: the hit bursts and the airborne ambient bits -- under the fx's sparks, words and balloons)
    if (!this.L?.si) { const B = this.boss; if (B && B.alive && !B.gone && B.faceBox) { const r = B.faceBox(); if (r) this.fx.keep13?.(r, 1); } }   // (RC2, Books 1 / 3: a boss with a face box -- the Curse Wraith -- keeps the words off its face)
    if (!this.L?.si && this.teamBlast) this.teamBannerKeep(ctx);   // (RC2: the team banner's keep-out, before the words and balloons)
    this.fx.draw(ctx, this.camX, this.time);
    if (this.teamBlast && !this.washGated) this.drawTeamFlash(ctx);   // (Skull Island: the blast's wash is the gated one)
    // (the foreground pieces fade where a hero, a pickup or a chest is behind one: opts.see, screen boxes)
    const see = [...this.players.filter((p) => !p.out), ...this.actors.filter((a) => a.team === 'item' || a.kind === 'chest')]
      .map((a) => ({ x: a.x - this.camX, y0: FLOOR_TOP + a.y - a.z - (a.h || 60) * 1.1, y1: FLOOR_TOP + a.y - a.z, w: Math.max(24, a.w || 20) }));
    if (!imp) { try { this.stage.drawFront(ctx, this.camX, this.time, { see }); } catch (e) { if (!this._stageErr2) { this._stageErr2 = 1; console.error('stage drawFront', e); } } }
    if (!this.L?.si && this.players.filter((p) => !p.out).length > 1 && !this.cut) this.drawTags(ctx, !!this.mm?.hideTags?.());   // (Skull Island's boss beats hide them; Skull Island draws them under the fx, above)
    if (this.cut?.kind === 'boss' && !this.cut.quick && this.cut.t > 20) {   // (hold to skip, as in a story)
      const app = this.app, hold = (this.cut.skipHold || 0) / 45;
      ctx.save(); ctx.font = 'bold 15px "Comic Neue", sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,240,210,0.85)';
      const txt = `hold ${app.lastCtrl === 'touch' ? '❚❚' : app.glyphText('back')} to skip`;
      // (above the letterbox bar -- at H - 10 it was drawn under it, invisible in every book -- and inside a TV's action-safe area)
      const sx = W - 56, sy = H - 36 - 12;
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText(txt, sx, sy); ctx.fillText(txt, sx, sy);
      if (hold > 0) { const tw = ctx.measureText(txt).width; ctx.fillStyle = '#ffe066'; ctx.fillRect(sx - tw, sy + 4, tw * hold, 3); }
      ctx.restore();
    }
    ctx.restore();
    if (this.warm > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const gr = ctx.createRadialGradient(W / 2, -60, 40, W / 2, -60, 720);
      gr.addColorStop(0, `rgba(255,214,130,${0.55 * this.warm})`); gr.addColorStop(0.6, `rgba(255,180,90,${0.22 * this.warm})`); gr.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (this.washGated) this.drawSiWash(ctx);
    else if (this.flashScreen > 0) {
      const f = this.flashAt || { x: this.camX + W / 2, y: DEPTH / 2, z: 80 };
      const fx = f.x - this.camX, fy = FLOOR_TOP + f.y - f.z;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(fx, fy, 10, fx, fy, 520);
      gr.addColorStop(0, `rgba(255,220,150,${this.flashScreen})`); gr.addColorStop(0.5, `rgba(255,170,80,${this.flashScreen * 0.4})`); gr.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    {   // (the bars slide in over the cut's first 20 frames and out over 10 after it -- they vanished in one frame: flash safety)
      const inCut = this.cut?.kind === 'boss' || this.cut?.kind === 'ending', B = this._bars;
      const k = inCut ? Math.min(1, this.cut.t / 20) * 36 : B ? Math.max(0, B.k - 3.6 * (this.frame - B.f)) : 0;
      if (inCut) this._bars = { k, f: this.frame }; else if (B && k <= 0) this._bars = null;
      if (k > 0.5) { ctx.fillStyle = '#0d0a14'; ctx.fillRect(0, 0, W, k); ctx.fillRect(0, H - k, W, k); }
    }
    if (this.perfect) this.drawPerfectRim(ctx);
    if (this.queenBeat) this.drawQueenBeat(ctx);
    if (!(this.cut && this.cut.kind !== 'intro')) { HUD.drawHud(ctx, this, this.app.scene === 'play' && !this.app.paused); this.mm?.drawHud(ctx); }
    if (this.teamBlast) this.drawTeamBanner(ctx);
    if (this.cut?.kind === 'intro' && this.cut.t < 200) HUD.drawStageCard(ctx, this, this.cut.t / 200);
    const ca = this.cut?.kind === 'boss' ? this.cut.cardAt : undefined;   // (the boss card: from t 20, or once a rising boss is up -- bossRise)
    if (ca !== undefined && this.cut.t >= ca && this.cut.t < ca + 120) { const k = (this.cut.t - ca) / 120; HUD.drawBossCard(ctx, this, k); this._card = { k, f: this.frame }; if (!this.L?.si) this.fx.prio13?.push([0, 116, W, 220]); }   // (RC3: the title card -- a TEAM UP! card was stamped on THE RUBY GEM's)
    else if (this._card) {   // (cut short -- its intro skipped: the card fades out over 10 frames from where it was, its dark band went in one frame -- flash safety)
      const C = this._card, si = !!this.L?.si, c = si ? 0.14 : 0.15, a0 = clamp(C.k / (si ? 0.08 : 0.1), 0, 1) * clamp((1 - C.k) / c, 0, 1), u = (this.frame - C.f) / 10;
      if (u >= 1 || a0 <= 0.01 || !this.boss) this._card = null; else { HUD.drawBossCard(ctx, this, 1 - c * a0 * (1 - u)); if (!this.L?.si) this.fx.prio13?.push([0, 116, W, 220]); }
    }
    if (this.cutin) (this.cutin.team ? drawTeamCutin : drawCutin)(ctx, this.cutin, this); else drawCutinTail(ctx, this);   // (a gentle cut-in's veil fades after it, as play resumes: src/showcase.js)
    if (this.teamWin && !this.team) this.drawTeamInvite(ctx);
  }

  drawDebug(ctx) {
    ctx.lineWidth = 1;
    for (const a of [...this.players, ...this.actors]) {
      if (!a.w) continue;
      const sx = a.x - this.camX, sy = FLOOR_TOP + a.y - a.z - (a.hz0 || 0);
      ctx.strokeStyle = a.hittable ? 'lime' : 'grey';
      ctx.strokeRect(sx - a.w, sy - a.h, a.w * 2, a.h);
      ctx.fillStyle = '#000'; ctx.font = '10px monospace'; ctx.fillText(`${a.state}`, sx - a.w, sy - a.h - 3);
    }
    ctx.fillStyle = '#000'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`L${this.levelIdx + 1} cam ${this.camX | 0} arena ${this.arenaIdx} wave ${this.waveIdx} fight ${this.fighting} tok ${this.tokens}/${this.maxTokens}`, 10, 530);
  }
}

export { HEROES, LEVELS, writeSave, loadMeta, writeMeta, INK };
