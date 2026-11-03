// Mystic Mountain's own rules in a stage (docs/MYSTIC_MOUNTAIN.md), on top of src/game.js's World: LIGHT, the living
// trees' swipes, the bridge's crumbling walls, the cliffs' gusts and narrow ledge (the lane), the ramps (the stone
// troll's stunned arm), the SHIELD LAUNCH (a partner's dodge into Dodongo's shield), the summit's storm -- and the quest's
// in-level lines (src/story.js LINES: each stage's first line, the bosses' intros and their ends).
//   World.begin makes one (mmBegin) for a level with `mm: true` (src/mmlevels.js); World.update calls step() after the
//   actors, World.render drawUnder() / drawOver() / drawHud().  The stage module's hooks (src/stages/mm*.js HOOKS and
//   setters, the stage builder's) drive the backdrop: setTreeSwipe(i, k), setWall(i, s), windGust(k), setGemLight(k),
//   setStorm(k), setTowerFall(k) -- each optional (a stand-in floor has none).
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { audio } from './audio-proxy.js';
import { LINES, CUTSCENES } from './story.js';
import { baseOf } from './heroes.js';
import { Player } from './player.js';
import { clamp, lerp, TAU } from './rig.js';

const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------------------------------------ LIGHT
// (docs/MYSTIC_MOUNTAIN.md: the shadow wolves -- and the alpha -- only stay down to LIGHT.)  A hit is light if it is:
//   a super or a team attack (hd.special / hd.team), a charged strike (hd.cstrike) or a charged spell (hd.spell), or
//   anything flagged (hd.shine: Dodongo's glowing-arm finisher, Anastasia's staff finisher, CRYSTAL NOVA's burst);
//   a shot of Dodongo's (his fire) or Anastasia's (her shots, her beam) -- hd.shot, set by src/projectiles.js HeroShot;
//   any hit at all by Dragon Dodongo or the Archmage (dragon fire, starlight).
// Shadow's sword, shurikens and kicks, and the plain combo hits, are not: they SCATTER a wolf, which re-forms.
const LIGHT_SHOTS = new Set(['dodongo', 'ana', 'dragon', 'archmage']);
const LIGHT_HEROES = new Set(['dragon', 'archmage']);
export function isLight(att, hd) {
  if (!hd) return false;
  if (hd.shine || hd.special || hd.team || hd.cstrike || hd.spell) return true;
  const id = att && att.heroId;
  if (!id) return false;
  if (LIGHT_HEROES.has(id)) return true;
  return !!hd.shot && (LIGHT_SHOTS.has(id) || LIGHT_SHOTS.has(baseOf(id)));
}

// ------------------------------------------------------------------------------------------------ the lines
// (docs/MM_SCRIPT.md "In-level lines": the book's own lettering where it has some -- Shadow says only "...", Dodongo
//  calls her Anastasia, never Ana; nobody is ever hurt for real.  The bosses' intros are the gate stories (src/mmlevels.js
//  gate); the in-level intro lines below only play when a gate story isn't written.  The fights' own lines: FIGHT_LINES,
//  said at the matching moment by src/mmbosses.js through MMWorld.line.)
const H3 = (dodongo, ana, shadow = '...') => ({ dodongo, ana, shadow });
Object.assign(LINES.levelStart, {
  mmforest: ['hero', H3('Stay close...\nI HEARD something.', 'Stay close...\nI HEARD something.')],   // (the wolves' "Did I get one?!": FIGHT_LINES.gotOne, at a scatter)
  mmbridge: ['hero', H3('Watch the walls.\nThey CRUMBLE!', 'Careful! These old\nwalls crumble.')],
  mmcliffs: ['hero', H3("Whoa! Don't get\nblown off the edge!", 'Stay off the edge.\nThe wind is STRONG!')],
  mmhall: ['hero', H3('I TOLD you they were\nlooking at us!', 'Okay, FINE. They\nWERE looking.')],
  mmsummit: ['hero', H3('Watch out for the\nGREEN lightning!', 'Stay together, and\nwatch the sky!')],
  mmvalley: ['hero', H3('Grab the sparkles!\nWOO-HOO!', 'LOOK! The colors are\ncoming back!')],
});
Object.assign(LINES.bossIntro, {   // (only without the gate story)
  mmforest: [['boss', 'AROOOOOO!'], ['hero', H3("That's the BIGGEST\nwolf I've ever seen.", "Normal hits won't hold\nit. It needs LIGHT!")]],
  mmbridge: [['boss', 'WHO WALKS ON\nMY BRIDGE?!'], ['hero', H3('Uh... us?', 'Dodge his fist --\nthen climb his arm!')]],
  mmcliffs: [['boss', 'SKREEEEEE!'], ['hero', H3('An ICE DRAGON?!\nOf course there is.', 'If it grabs someone,\nhit its talons!')]],
  mmhall: [['hero', H3("The gem! It's holding\nall the strings!", 'It is too high...\nDodongo... SHIELD!')]],
  mmsummit: [['boss', 'So. The little heroes\nclimbed MY mountain.'], ['hero', H3('Give the valley its\ncolors back!', "It's over, Morvath!")]],
});
Object.assign(LINES.bossFreed, {   // (short: the stage's outro story tells the rest)
  mmforest: [['hero', H3('Ha! Smoke goes POOF!', 'They were only\nshadows!')]],
  mmbridge: [],
  mmcliffs: [['hero', H3('And STAY off our\nmountain, ice breath!', 'It flew away!')]],
  mmhall: [],
  mmsummit: [],
});
/** the fights' lines (docs/MM_SCRIPT.md): [who, text] -- who as World.speakerFor ('dod', 'ana', 'sha', 'hero', 'boss') */
export const FIGHT_LINES = {
  parry: ['dod', 'Not today, PEBBLE!'],
  ramp: ['hero', H3('His NOSE! Climb up\nand TICKLE it!', 'All that dust...\nTickle his NOSE!')],
  rampNoSha: ['hero', H3('His NOSE! Climb up\nand TICKLE it!', 'All that dust...\nTickle his NOSE!')],
  hateLight: ['ana', 'Shadows hate light!'],
  holdOn: ['ana', 'Everybody... HOLD ON!'],
  sneeze: ['boss', 'AAAH-CHOOOOO!'],
  grabbed: ['hero', H3('Hey! Put me DOWN!', 'Hey! Put me DOWN!')],
  anaGrabbed: ['dod', 'ANASTASIA!'],
  shieldSha: ['dod', 'Shadow! SHIELD!'],
  shield: ['dod', 'Hop on! SHIELD!'],
  anaFreed: ['ana', 'I said... PUT ME DOWN!'],
  gemShield: ['ana', 'Dodongo... SHIELD!'],
  lightsOut: ['ana', 'Lights OUT!'],
  climbDown: ['boss', 'Then you can climb\nright back DOWN!'],
  giveBack: ['boss', 'Hey! GIVE THAT\nBACK!'],
  blastNow: ['ana', 'NOW, Dodongo!'],
  caw: ['boss', 'CAW?!'],
  hurtFriends: ['dod', '...you hurt my\nFRIENDS.'],
  colours: ['ana', 'LOOK! The colors are\ncoming back!'],
  gotOne: ['hero', H3("Did I get one?! I'm\nnot LOOKING!", 'Back to back!')],   // (a shadow wolf's first scatter: src/mmfoes.js)
};

// ------------------------------------------------------------------------------------------------ the rules
/** a stage's Mystic Mountain rules (null for any other stage) */
/** Skull Island's hint queue (QA2 M2): how long a beat must stay up before a forced hint may replace it -- 0.45 s a word, at least 2.5 s --
 * and the hints that may cut in at once (a hold: the hero must MASH now) */
const siReadT = (text) => Math.max(150, Math.round(String(text || '').split(/\s+/).filter(Boolean).length * 27));
const SI_URGENT = new Set(['silasso', 'sinet', 'sitentgrab', 'sinap']);
export function mmBegin(world) { return world.L?.mm ? new MMWorld(world) : null; }

export class MMWorld {
  constructor(world) {
    const g = (this.g = world), H = world.hooks || {}, st = world.stage;
    this.st = st; this.H = H;
    // the narrow ledge (the Icy Cliffs): the depth the heroes and their foes may use (actors.js Actor.clampDepth)
    const ln = world.L.lane || (H.lane && (Array.isArray(H.lane) ? H.lane : [H.lane.y0, H.lane.y1]));
    g.lane = ln ? [ln[0], ln[1]] : null;
    if (g.lane) g.players.forEach((p, i, a) => { p.y = lerp(g.lane[0] + 8, g.lane[1] - 8, a.length > 1 ? i / (a.length - 1) : 0.5); });
    // the living trees (the Shadow Forest): a slow, clearly wound-up swipe from the backdrop
    this.trees = (H.trees || []).map((t, i) => ({ i, x: t.x, band: t.band || [0, 64], reach: Array.isArray(t.reach) ? t.reach : [t.x - (t.reach || 230), t.x + (t.reach || 230)], k: 0, t: -1 }));
    this.treeCool = 240;
    // the crumbling walls (the Troll Bridge): each once, when a hero comes close
    this.walls = (H.walls || []).map((w, i) => {
      const x = w.x0 !== undefined ? (w.x0 + w.x1) / 2 : w.x, front = w.side === 'front';
      return { i, x, r: w.x0 !== undefined ? (w.x1 - w.x0) / 2 + 20 : (w.r || 80), band: front ? [DEPTH - 50, DEPTH] : [0, 50], front, s: 0, t: -1 };
    });
    // the gusts (the Icy Cliffs)
    this.gust = null; this.gustCool = world.L.id === 'mmcliffs' || H.gust ? 240 : -1;
    this.gustZones = H.gust || null;           // (the windy stretches; none given: anywhere on the cliffs)
    this.ramps = [];          // ({ x0, z0, x1, z1, y0, y1 }: walkable slopes -- the troll's arm; set by their owner each frame)
    // (a hero still held by a talon or a chain when the stage restarted: let go -- his pose and draw order his own again)
    for (const p of g.players) if (p.mmHeld || p.cutPose || p.sortY !== undefined) { p.mmHeld = false; p.cutPose = null; p.cutPoseArg = undefined; p.sortY = undefined; p.onRamp = false; }
    // (back into the summit after Dodongo became the dragon -- a restart from the save point, a continue: himself again)
    const run = g.app.run, D = run.mmDragon;
    if (D) {
      const old = g.players[D.slot];
      if (old && old.heroId === 'dragon' && D.from !== 'dragon') {
        const p = new Player(g, D.from, D.slot, old.ctrlId);
        p.x = old.x; p.y = old.y; p.facing = old.facing; p.meter = old.meter; p.score = old.score; p.ctl = old.ctl;
        if (old.lives !== undefined) p.lives = old.lives;
        g.players[D.slot] = p;
      }
      if (run.heroes[D.slot] === 'dragon') run.heroes[D.slot] = D.from;   // (a swap away from the dragon: that hero stays)
      run.mmDragon = null;
    }
    this.launch = new Map();  // (hero -> frame launched off the shield)
    this.smoke = [];          // (the shadow wolves' smoke trails: a pool of puffs, reused -- no canvases)
    // (the hall's suits of armour: all back in their alcoves; each steps out as a knight -- src/mmfoes.js Knight)
    if (H.armour) { g._suitsUsed = new Set(); H.armour.forEach((_, i) => st.setSuit?.(i, 1)); } else g._suitsUsed = null;
    st.setStorm?.(world.L.id === 'mmsummit' ? 1 : 0);
    (H.walls || []).forEach((_, i) => st.setWall?.(i, 0));
    st.setGemLight?.(1); st.setTrollMist?.(0); st.setTowerFall?.(0);
  }
  get frame() { return this.g.frame; }

  /** after the actors' update, every frame */
  step() {
    const g = this.g;
    if (!g.cut && !g.cutin) { this.stepTrees(); this.stepWalls(); this.stepGust(); }
    this.stepRamps();
    this.stepLaunch();
    this.stepSmoke();
  }

  // ---------------------------------------------------------------- smoke trails (comic p011: the wolves billow smoke)
  /** a soft puff of dark smoke shed by `owner` (world x, depth y, height z; radius r): it drifts up and back and fades in
   * ~0.5 s.  Pooled: at most SMOKE_MAX alive, the oldest reused. */
  puff(owner, x, y, z, r, violet = false) {
    let P = this.smoke.find((q) => q.t >= q.life);
    if (!P) { if (this.smoke.length >= 140) P = this.smoke.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b)); else this.smoke.push(P = {}); }
    P.owner = owner; P.x = x; P.y = y; P.z = z; P.r = r; P.t = 0; P.life = 26 + ((Math.random() * 10) | 0);
    P.vx = -owner.facing * (0.4 + Math.random() * 0.5) - (owner.vx || 0) * 0.15; P.vz = 0.5 + Math.random() * 0.5; P.violet = violet;
  }
  stepSmoke() { for (const P of this.smoke) if (P.t < P.life) { P.t++; P.x += P.vx; P.z += P.vz; P.vx *= 0.96; P.r *= 1.015; } }
  /** an owner's puffs (drawn before it: behind it) */
  drawSmoke(ctx, owner) {
    const camX = this.g.camX;
    ctx.save();
    for (const P of this.smoke) {
      if (P.owner !== owner || P.t >= P.life) continue;
      const k = 1 - P.t / P.life, x = P.x - camX, y = FLOOR_TOP + P.y - P.z;
      ctx.globalAlpha = 0.52 * k * Math.min(1, P.t / 4 + 0.3);
      ctx.fillStyle = P.violet ? '#5a4a8a' : '#2a2533';
      ctx.beginPath(); ctx.arc(x, y, P.r, 0, TAU); ctx.fill();
      ctx.globalAlpha *= 0.6; ctx.fillStyle = P.violet ? '#7a68b0' : '#3e3848';
      ctx.beginPath(); ctx.arc(x - P.r * 0.25, y - P.r * 0.3, P.r * 0.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- the living trees
  stepTrees() {
    const g = this.g;
    for (const T of this.trees) {
      if (T.t < 0) continue;
      T.t++; T.k = Math.min(1, T.t / 120);
      this.st.setTreeSwipe?.(T.i, T.k);
      if (T.t === 2) { audio.sfx('charge_hum', { pitch: 0.45, vol: 0.5 }); g.fx.label(T.x, 30, 230, '!', '#ffe066', 44, 40); }
      if (T.k >= 0.40 && T.k <= 0.62) {
        if (T.t === 49) { audio.sfx('swing_heavy', { pitch: 0.55 }); g.shake = Math.max(g.shake, 3); }
        const ax = lerp(T.reach[0], T.reach[1], clamp((T.k - 0.35) / 0.35, 0, 1));   // (where the arm is in its sweep)
        for (const p of g.players) {
          if (!p.hittable || (T.hit && T.hit.has(p))) continue;
          if (p.x < T.reach[0] || p.x > T.reach[1] || Math.abs(p.x - ax) > 90 || p.y < T.band[0] - 6 || p.y > T.band[1] + 6 || p.z > 110) continue;
          (T.hit || (T.hit = new Set())).add(p);
          p.takeHit({ x: p.x - 10, team: 'hazard', facing: 1 }, { dmg: 8, kind: 'knock', push: 5, lift: 5, stop: 5, sfx: 'hit_heavy', spark: 'warm' });
          g.fx.word(p.x, p.y, 120, true, 'WHAP!');
        }
      }
      if (T.k >= 1) { T.t = -1; T.k = 0; T.hit = null; this.st.setTreeSwipe?.(T.i, 0); }
    }
    if (--this.treeCool > 0 || !g.players.length || this.trees.some((T) => T.t >= 0)) return;
    const live = g.players.filter((p) => !p.out && p.alive);
    const near = this.trees.filter((T) => T.x > g.camX + 60 && T.x < g.camX + W - 60 && live.some((p) => p.x > T.reach[0] - 60 && p.x < T.reach[1] + 60));
    if (!near.length) { this.treeCool = 30; return; }
    const T = near[(Math.random() * near.length) | 0];
    T.t = 0; T.hit = null;
    this.treeCool = rnd(300, 460) / (g.fighting ? 1.3 : 1);
    if (!g.flags.hint_mmtree) this.hint('mmtree', 'Watch the trees! When one creaks and leans, step away or ROLL!');
  }

  // ---------------------------------------------------------------- the crumbling walls
  stepWalls() {
    const g = this.g;
    for (const Wl of this.walls) {
      if (Wl.t < 0) {
        if (Wl.done) continue;
        if (g.players.some((p) => !p.out && Math.abs(p.x - Wl.x) < 170)) { Wl.t = 0; audio.sfx('knockdown', { pitch: 0.6, vol: 0.6 }); g.fx.label(Wl.x, (Wl.band[0] + Wl.band[1]) / 2, 170, 'CRACK!', '#ffe9a0', 30, 50); }
        continue;
      }
      Wl.t++;
      Wl.s = Wl.t < 60 ? 0.3 * (Wl.t / 60) : Math.min(1, 0.3 + (Wl.t - 60) / 30 * 0.7);
      this.st.setWall?.(Wl.i, Wl.s);
      const wy = (Wl.band[0] + Wl.band[1]) / 2;
      if (Wl.t < 60 && Wl.t % 8 === 0) g.fx.dust(Wl.x + rnd(-Wl.r, Wl.r), wy, 2, 10);
      if (Wl.t >= 60 && Wl.t < 90 && Wl.t % 4 === 0) {
        g.fx.debris(Wl.x + rnd(-Wl.r, Wl.r), rnd(Wl.band[0], Wl.band[1]), Wl.front ? 50 : 180, ['#c8b89a', '#9a8a6e', '#e2d4b6'], 3);   // (the warm stone of the stage's segments; the front parapet's rocks start low)
        if (Wl.t === 64) { audio.sfx('break', { pitch: 0.7 }); g.shake = Math.max(g.shake, 6); }
        for (const p of g.players) {
          if (!p.hittable || Math.abs(p.x - Wl.x) > Wl.r || p.y < Wl.band[0] - 4 || p.y > Wl.band[1] + 4 || (Wl.hit && Wl.hit.has(p))) continue;
          (Wl.hit || (Wl.hit = new Set())).add(p);
          p.takeHit({ x: Wl.x, team: 'hazard', facing: 1 }, { dmg: 8, kind: 'knock', push: 3, lift: 4, stop: 4, sfx: 'hit_heavy', spark: 'warm' });
        }
      }
      if (Wl.t >= 90) { Wl.t = -1; Wl.done = true; }
    }
    if (this.walls.some((Wl) => Wl.t === 1) && !g.flags.hint_mmwall) this.hint('mmwall', 'That old wall is crumbling! Keep away from the rocks!');
  }

  // ---------------------------------------------------------------- the gusts
  stepGust() {
    const g = this.g;
    if (this.gustCool < 0) return;
    if (!this.gust) {
      if (--this.gustCool > 0) return;
      const mid = g.camX + W / 2;
      if (this.gustZones && !this.gustZones.some(([a, b]) => mid > a - 300 && mid < b + 300)) { this.gustCool = 30; return; }
      this.gust = { t: 0 };
      if (!g.flags.hint_mmgust) this.hint('mmgust', 'A big gust is coming! Hold on -- walk INTO the wind!');
    }
    const G = this.gust;
    G.t++;
    const k = G.t < 40 ? G.t / 40 * 0.4 : G.t < 140 ? 1 : Math.max(0, 1 - (G.t - 140) / 30);
    if (G.t % 30 === 1 || G.t === 40) this.st.windGust?.(k * 1.3);   // (the stage's streaks whip for ~1 s a call)
    if (G.t === 40) audio.sfx('dodge', { pitch: 0.5, vol: 0.8 });
    if (G.t >= 40 && G.t < 150) {
      for (const p of g.players) if (!p.out && p.state !== 'dodge' && p.state !== 'special' && p.state !== 'cutscene') p.x -= 1.5 * (p.state === 'air' ? 1.4 : 1);
      for (const a of g.actors) if (a.team === 'foe' && a.alive && !a.boss && !a.heavy) a.x -= 0.8;
      if (G.t % 3 === 0) g.fx.add({ type: 'star', x: g.camX + W + 20, y: rnd(0, DEPTH), z: rnd(20, 260), vx: -14, vz: 0, life: 40, r: 2, col: '#ffffff' });
    }
    if (G.t >= 170) { this.gust = null; this.gustCool = rnd(360, 540); }
  }

  // ---------------------------------------------------------------- ramps (the troll's arm)
  /** the walkable height under a hero (0: the floor) and the ramp it's on */
  rampAt(p) {
    for (const R of this.ramps) {
      if (p.y < R.y0 || p.y > R.y1) continue;
      const lo = Math.min(R.x0, R.x1), hi = Math.max(R.x0, R.x1);
      if (p.x < lo || p.x > hi) continue;
      return { R, z: lerp(R.z0, R.z1, (p.x - R.x0) / (R.x1 - R.x0 || 1)) };
    }
    return null;
  }
  stepRamps() {
    const g = this.g;
    const GROUND = ['idle', 'walk', 'run', 'land', 'atk', 'shoot', 'charge', 'cstrike', 'hurt', 'squat', 'lift', 'throw', 'auto', 'special'];
    for (const p of g.players) {
      if (p.out) continue;
      let on = this.rampAt(p);
      // (the high end is his shoulder: a hero walks up to it, never on into him)
      if (on && on.R.x1 !== on.R.x0) { const top = on.R.x1 - Math.sign(on.R.x1 - on.R.x0) * 6; if ((p.x - top) * Math.sign(on.R.x1 - on.R.x0) > 0) { p.x = top; on = this.rampAt(p) || on; } }
      if (on && GROUND.includes(p.state)) { p.z = on.z; p.onRamp = true; continue; }
      if (on && p.state === 'air' && p.vz <= 0 && p.z <= on.z + 4 && p.z >= on.z - 26) {   // (landing on it)
        p.z = on.z; p.vz = 0; p.vx *= 0.3; p.vy = 0; p.landT = 7; p.set('land'); p.onRamp = true; audio.sfx('land', { vol: 0.6 }); continue;
      }
      if (p.onRamp && !on && p.z > 0.5 && p.state === 'special') { p.z = Math.max(0, p.z - 5); if (p.z > 0.5) continue; }   // (a super never cut short: he sinks as it plays)
      if (p.onRamp && !on && p.z > 0.5 && GROUND.includes(p.state)) {   // (walked off the end: down to the floor)
        p.set('air'); p.vz = 0; p.airAtkT = -1; p.hitSet = new Set();
      }
      if (!on) p.onRamp = false;
    }
  }

  // ---------------------------------------------------------------- the SHIELD LAUNCH
  // (the comic's beat: Dodongo's shield as a springboard -- any partner rolling into him while he stands goes flying up,
  //  high enough to reach the Ice Wyvern's head and the ruby gem: src/mmbosses.js reads launchedHigh())
  stepLaunch() {
    const g = this.g;
    const dods = g.players.filter((d) => !d.out && d.alive && baseOf(d.heroId) === 'dodongo' && d.heroId !== 'dragon' && ['idle', 'walk', 'run', 'land', 'atk', 'shoot', 'charge'].includes(d.state) && d.z < 4);
    if (!dods.length) return;
    for (const p of g.players) {
      // (a roll into him -- or a jump from right beside him: kid-sized, either works)
      const hopOk = !!(g.boss?.usesLaunch && g.fighting && g.L.arenas[g.arenaIdx]?.boss);   // (the jump: in the wyvern's and the gem's fights only)
      const rolling = p.state === 'dodge' && p.st <= 16, hopping = hopOk && (p.state === 'squat' || (p.state === 'air' && p.st <= 3 && p.z < 30 && !p.launchedAt));
      if (p.out || !(rolling || hopping) || dods.includes(p) || this.launch.get(p) > g.frame - 40) continue;
      const d = dods.find((q) => Math.abs(q.x - p.x) < (rolling ? 44 : 50) && Math.abs(q.y - p.y) < 32 && (!rolling || Math.sign(q.x - p.x) === Math.sign(p.vx || p.facing)));
      if (!d) continue;
      this.launch.set(p, g.frame);
      p.set('air'); p.z = Math.max(1, p.z); p.vz = 16.5; p.vx = (p.vx >= 0 ? 1 : -1) * 3.2; p.vy = 0;
      p.airAtkT = -1; p.hitSet = new Set(); p.launchedAt = g.frame; p.inv = Math.max(p.inv, 20);
      d.set('idle'); d.facing = Math.sign(p.vx) || d.facing;
      g.fx.ring(d.x, d.y, { rx: 70, ry: 24, shock: true, col: '#ffd23a', life: 16 });
      g.fx.label(d.x, d.y, 190, 'SHIELD LAUNCH!', '#ffd23a', 32, 60);
      if (!this.saidShield) {   // ("Shadow! SHIELD!" -- in the gem's hall, Anastasia's "Dodongo... SHIELD!")
        this.saidShield = true;
        if (g.boss?.constructor?.name === 'RubyGem' && g.players.some((q) => !q.out && baseOf(q.heroId) === 'ana')) this.line('gemShield');
        else if (baseOf(p.heroId) === 'shadow') this.line('shieldSha', d); else this.line('shield', d);
      }
      audio.sfx('shield_bash', { pitch: 1.2 }); audio.sfx('jump', { pitch: 0.8 });
      g.shake = Math.max(g.shake, 4);
    }
  }
  /** a hero flying from the shield, still high (above z) -- within `frames` of the launch */
  launchedHigh(p, z = 120, frames = 70) { return p.state === 'air' && p.launchedAt && this.g.frame - p.launchedAt < frames && p.z >= z; }
  /** the heroes who could be launched now: a partner and Dodongo standing (for the boss hints) */
  canLaunch() { const g = this.g; return g.players.some((d) => !d.out && baseOf(d.heroId) === 'dodongo' && d.heroId !== 'dragon') && g.players.filter((p) => !p.out).length > 1; }

  // ---------------------------------------------------------------- stories and lines
  /** a story in the middle of the stage, once a run (src/main.js midStory: the world waits under it); then() after it --
   * or at once, when it isn't written or was seen.  True if it plays. */
  story(id, then) {
    const g = this.g, run = g.app.run, seen = run.mmSeen || (run.mmSeen = {});
    if (!id || seen[id] || !CUTSCENES[id]) { then?.(); return false; }
    seen[id] = true;
    return g.app.midStory(id, then);
  }
  /** the boss gate: its story first (World.startBoss calls this -- and is called again after it); the fight's own intro is
   * then the quick one (its name on a banner) */
  gate() {
    const g = this.g, run = g.app.run, seen = run.mmSeen || (run.mmSeen = {});
    const ids = [g.L.preGate, g.L.gate].filter((id) => id && CUTSCENES[id] && !seen[id]);
    if (!ids.length || !(g.L.gate && ids.includes(g.L.gate))) return false;
    (run.bossSeen || (run.bossSeen = {}))[g.L.id] = true;
    for (const id of ids) seen[id] = true;
    for (const p of g.players) { p.ctl = false; p.vx = p.vy = 0; if (!p.out && ['walk', 'run'].includes(p.state)) p.set('idle'); }
    return g.app.midStory(ids, () => g.startBoss());
  }
  /** one of the fights' lines (FIGHT_LINES), by its speaker -- or `by`, a hero (the one grabbed, the one who parried) */
  line(key, by = null) {
    const g = this.g, L = FIGHT_LINES[key];
    if (!L) return;
    const [who, text] = L;
    // (a named hero's line: only that hero says it -- with them out of the party it's dropped, never handed to whoever's
    //  there ("...you hurt my FRIENDS." from Shadow).  The summit's dragon is the hero who became it)
    const want = { dod: 'dodongo', ana: 'ana', sha: 'shadow' }[who];
    const D = g.app.run?.mmDragon, base = (q) => (q.heroId === 'dragon' && D && D.slot === q.slot ? baseOf(D.from) : baseOf(q.heroId));
    const s = by || (want ? g.players.find((q) => !q.out && base(q) === want) : g.speakerFor(who));
    if (!s) return;
    if (by && want && by.team === 'hero' && base(by) !== want) return;
    const t = g.lineFor(who, text, s);
    if (!t) return;
    // (a hero's fight line: another hero's balloon still up goes first -- "HOLD ON!" never lands on "His NOSE!")
    if (s.team === 'hero') g.fx.list = g.fx.list.filter((q) => !(q.type === 'balloon' && q.actor !== s && q.actor?.team === 'hero'));
    g.say(s, t, undefined, g.balloonStyle(who));
  }

  // ---------------------------------------------------------------- hints
  /** a hint of Mystic Mountain's own, once a run (World.hintOnce's rules: one at a time, after the gap) */
  hint(key, text, life = 330, force = false, opts = null) {   // (opts, Skull Island's queue: { front: jump the queue, ttl: frames it may wait -- QA2)
    const g = this.g;
    if (g.cut) return false;
    if (force && g.L?.si && g.hint && g.hint.key !== key) {   // (Skull Island: QA2 M2)
      const Q = g.hintQ || (g.hintQ = []), cur = g.hint, early = !this.hintNow && cur.t < siReadT(cur.text);
      if (early && !SI_URGENT.has(key)) { const i = Q.findIndex((h) => h.key === key); if (i >= 0) Q.splice(i, 1); const e = { key, text, life, at: g.frame, ttl: opts?.ttl }; if (opts?.front) Q.unshift(e); else Q.push(e); return true; }   // (it waits its turn)
      if (early) Q.unshift({ key: cur.key, text: [cur.text, ...(cur.next || []).map((n) => n.text)].join(' || '), life: cur.life, at: g.frame });   // (danger cuts in: the cut hint again after)
      else if (cur.next?.length) Q.unshift({ key: cur.key, text: cur.next.map((n) => n.text).join(' || '), life: cur.life, at: g.frame });   // (its beats still to come: after this one)
    }
    if (!force && (g.flags['hint_' + key] || g.hint)) return false;
    if (!force && g.hintAt !== undefined && g.frame - g.hintAt < 8 * 60) return false;
    if (force && g.hint && g.hint.key === key) return false;
    const touch = g.app.lastCtrl === 'touch';
    g.flags['hint_' + key] = true;
    // (read at a 6-10 year old's pace: ~0.5 s a word, x1.3; a long hint in beats -- 'first || then' -- one after the other,
    //  World.updateHints)
    const beats = (touch ? text.replace(/\bPress\b/g, 'Tap').replace(/\bpress\b/g, 'tap') : text).split(/\s*\|\|\s*/).filter(Boolean);
    const lifeOf = (s, min) => Math.max(min, Math.round(s.split(/\s+/).length * 0.5 * 60 * 1.3));
    const next = beats.slice(1).map((s) => ({ text: s, life: lifeOf(s, 180) }));
    g.hint = { text: beats[0], t: 0, life: lifeOf(beats[0], next.length ? 180 : life), key, next };
    g.hintAt = g.frame;
    try { document.body.dataset.hint = key; } catch { /* (no DOM) */ }
    return true;
  }

  /** a hint that no longer applies taken down (the one up now, if it's one of `keys`) -- and its button pulse */
  clearHint(...keys) {
    const g = this.g;
    if (g.hintQ) g.hintQ = g.hintQ.filter((h) => !keys.includes(h.key));
    if (g.hint && keys.includes(g.hint.key)) { g.hint = null; try { delete document.body.dataset.hint; } catch { /* (no DOM) */ } }
  }
  /** (Skull Island, QA2 M2) the hint queue's step, from World.updateHints: stale ones (10 s) dropped; the next one up once the live beat has
   * had its read time */
  stepHintQ() {
    const g = this.g, Q = g.hintQ;
    for (let i = Q.length - 1; i >= 0; i--) if (g.frame - Q[i].at > (Q[i].ttl ?? 1200)) Q.splice(i, 1);   // (stale: its ttl, else 20 s in the queue)
    if (!Q.length || g.cut || (g.hint && (g.hint.t < siReadT(g.hint.text) || SI_URGENT.has(g.hint.key)))) return;   // (a hold's hint stays till the hold ends)
    const h = Q.shift();
    this.hintNow = true; try { this.hint(h.key, h.text, h.life, true); } finally { this.hintNow = false; }
  }
  /** a button as a hint says it: '[J]' for a key or a pad button, its name on a touch screen */
  keyName(action, p = null) {
    const app = this.g.app, id = p?.ctrlId && p.ctrlId !== 'any' ? p.ctrlId : app.lastCtrl;
    if (id === 'touch' || (app.lastCtrl === 'touch' && (!p || p.ctrlId === 'any' || p.ctrlId === 'touch'))) {
      // (the touch button's own label: DODGE, or the sky ride's ROLL / FIRE -- what the kid actually sees)
      let el = null; try { el = document.querySelector(`#pads [data-act="${action}"]`); } catch { /* (no DOM) */ }
      const lab = el && el.textContent.trim().toUpperCase();
      return lab || { attack: 'ATTACK', shoot: 'SHOOT', jump: 'JUMP', dodge: 'DODGE', special: 'SUPER' }[action] || action.toUpperCase();
    }
    return `[${app.glyphText(action, id)}]`;
  }
  /** the heroes who could be launched off the shield right now, and the Dodongo they'd roll into */
  launchPair() {
    const g = this.g, d = g.players.find((q) => !q.out && q.alive && baseOf(q.heroId) === 'dodongo' && q.heroId !== 'dragon');
    return d && g.players.some((q) => q !== d && !q.out && q.alive) ? d : null;
  }

  /** the shield launch's invitation (the wyvern's and the gem's fights): a gold ring under Dodongo, "ROLL INTO ME!" at first */
  drawLaunchRing(ctx, boss) {
    const g = this.g, d = this.launchPair();
    if (!d || !boss.alive || !g.fighting || g.cut || d.z > 4 || boss.launchOpen === false) return;   // (the gem shielded: no launch to make)
    const x = d.x - g.camX, y = FLOOR_TOP + d.y, k = 0.5 + 0.5 * Math.sin(g.time * 5);
    ctx.save(); ctx.strokeStyle = `rgba(255,210,58,${0.55 + 0.35 * k})`; ctx.lineWidth = 3; ctx.setLineDash([10, 7]);
    ctx.beginPath(); ctx.ellipse(x, y, 58, 20, 0, 0, TAU); ctx.stroke(); ctx.restore();
    if (this.ringSaid === undefined) this.ringSaid = g.frame;
    if (g.frame - this.ringSaid < 420 && (g.frame >> 4) % 2 === 0) {
      // (over his head, big -- a partner standing in front no longer hides it; the touch screen's button is DODGE)
      const t = g.app.lastCtrl === 'touch' ? `${this.keyName('dodge')} INTO ME!` : 'ROLL INTO ME!', ty = y - (d.h || 130) - 40;
      ctx.save(); ctx.font = 'bold 26px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(t, x, ty); ctx.fillStyle = '#ffd23a'; ctx.fillText(t, x, ty); ctx.restore();
    }
  }

  // ---------------------------------------------------------------- drawing
  drawUnder(ctx) { void ctx; }
  drawOver(ctx) {
    for (const a of this.g.actors) a.drawOverMM?.(ctx);       // (puppet strings, lightning chains: over everyone)
  }
  /** a boss's own meter (the troll's SNEEZE), under the boss bar */
  drawHud(ctx) {
    const b = this.g.boss;
    const g = this.g;
    // (its own fight only -- and not while the boss's name banner is still up: it sits where the meter goes)
    if (b && b.alive && b.meterHud && g.fighting && !g.cut && g.L.arenas[g.arenaIdx]?.boss && !(g.bannerT > 0)) b.meterHud(ctx);
  }
}

/** a little meter with a label: the troll's SNEEZE, the gem's cracks (screen px) */
export function drawMeterBar(ctx, x, y, w, k, label, col) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,12,30,0.7)'; ctx.fillRect(x - 3, y - 3, w + 6, 18);
  ctx.fillStyle = '#3a2a40'; ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(k, 0, 1), 12);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, 12);
  ctx.font = 'bold 15px Bangers, Impact, sans-serif'; ctx.textAlign = 'right'; ctx.lineWidth = 4; ctx.strokeStyle = INK;
  ctx.strokeText(label, x - 8, y + 12); ctx.fillStyle = '#fff1d6'; ctx.fillText(label, x - 8, y + 12);
  ctx.restore();
}
void FLOOR_TOP; void TAU;
