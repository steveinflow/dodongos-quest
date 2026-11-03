// THE LEVIATHAN (Skull Island Stage 1 "The Blue Gull", the night deck's mini-boss arena at cam 3700 -- the user's request and drawing,
// docs/refs/leviathan_drawing.png, docs/SKULL_ISLAND.md "The Leviathan"): a giant spiral-coiled sea serpent in the sea beyond the rail.
// Its COIL rises from the waves behind the bulwark (drawn behind the rail: the stage's setBehindRail hook), its spiked NECK arches over
// the rail and its one-eyed HEAD strikes onto the deck.  Three moves, every one telegraphed (6-10 year olds):
//   FANG SLAM   a RED ring on the deck (it creeps after a hero, then locks), the head rears and slams its two fangs into the planks
//               -- step out.  The fangs get STUCK for ~2.5 s: its HEAD can be hit (the only time it can).
//   SNAP        a lane on the deck in front of it: the head lunges along it and snaps -- JUMP it or step out of the lane.
//   WHIRLPOOL   the coil's teeth glow and it spins: the sea pulls everyone toward the rail -- walk AWAY; at the rail a spray bump
//               (a little knock back onto the deck: never overboard, never a big hurt).
// It never gets a hero for good: every move is a bump.  At zero it goes DIZZY ("BLUB?"), the neck sinks back into the coil and the
// coil swims off into the dark: nobody is hurt.  A kid who never hits the head still wins: from ~35 s on (with its rise), each time it yanks its
// fangs out of the deck it hurts itself a little ("OUCH!").  HP scales with the party (LEVI.coop) and each stuck window can take at most
// a share of it (LEVI.winCap): ~40-60 s alone, ~25-40 s in co-op.
// Art: the neck + head is CHARS.leviathan (the code rig ./chars/leviathan.js, or the painted pack: src/chars/leviathan3d.js), anchored
// at NECKBASE; the coil CHARS.leviathan_coil (anchored at its centre, export NECKBASE).  The neck is drawn in two layers: the column over
// neckBase behind the bulwark (with the coil), the rest -- the arch over the rail, the head on the deck -- with the actors.
import { Enemy, CHARS } from './enemies.js';
import { Actor } from './actors.js';
import { audio } from './audio-proxy.js';
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, TAU } from './rig.js';
import { baseOf } from './heroes.js';
import { drawBossCard } from './hud.js';
import { drawWithFlash, setSilhouette } from './render.js';
import * as SIFX from './sifx.js';   // (Book 2's material particles: the FX agent's src/sifx.js)

const rnd = (a, b) => a + Math.random() * (b - a);
const live = (g) => g.players.filter((p) => !p.out && p.alive);
const pulse = (n) => 0.775 + 0.225 * Math.cos(n * 0.2);   // (flash safety: a telegraph's urgency is a smooth pulse, never a blink)

export const LEVI = {
  hp: 200, coop: [1, 1, 1.45, 1.85, 2.2], winCap: [0.34, 0.45], chip: 0.6, chipCap: 0.1, snapRest: 110,   // (QA2 M6: bigger windows, a chip after each snap)   // (winCap: a stuck window takes at most this share of its health, alone / in co-op: a good player needs 5 windows, a good party 3)
  tips: [242, 134], slamHit: 6, slamLen: 14, slamR: 70, slamTele: 58, slamDmg: 9,
  stuck: 180, stuckCoop: 150, head: [226, 64], tail: [60, 56],   // (tail: the whirl's target, px ahead of neckBase / its depth -- QA2 round 2)
           // (the head while stuck: px from neckBase, its centre; hit box below)
  snapLane: [196, 366], snapTele: 68, snapCreep: 14, snapLen: 16, snapReach: 3, snapDmg: 7, laneH: 26, jumpZ: 40,
  whirlTele: 54, whirl: 130,   // (190: a long stretch with nothing to hit -- QA2 M6)
  pull: 1.15, sprayDmg: 4,
  coilK: 0.78, hitCap: 24, tireAt: 1200, tire: 0.2, card: 100, flipPast: 120, mercyHp: 35,
};
/** the slam's fang tips from neckBase (px): the art's own export (the painted pack's SLAM_TIPS, else the code rig's) */
const tipPts = () => { const T = CHARS.leviathan?.SLAM_TIPS; if (Array.isArray(T?.[0])) return T; const m = T || LEVI.tips; return [[m[0] + 11, m[1]], [m[0] - 11, m[1]]]; };   // (its TWO fang tips: the pack's pair, or one point -> 11 px either side)
const tips = () => { const P = tipPts(); return [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2]; };   // (the slam's centre: between the two fangs)
const BULW_TOP = 316, RAIL_TOP = 304, COIL_WL = 262;   // (COIL_WL: the sea's surface where the coil sits -- 12 px under the horizon, over the rail's balusters: QAF art)
const OVER_RAIL = ['slam', 'stuck', 'unstick', 'snap'];
/** sea foam spilling over the rail cap where the neck comes over it (x: the root column's edge, screen px): a crest of foam blobs and a few drips */
function seamFoam(ctx, x, frame) {
  const y = RAIL_TOP + 4, w = Math.sin(frame * 0.09);
  ctx.save(); ctx.lineJoin = 'round';
  const blobs = [[-20, 6, 14, 10], [-5, -4, 17, 13], [13, 3, 15, 11], [3, 18, 14, 11], [-15, 26, 11, 9], [17, 24, 10, 9], [0, 36, 12, 9]];   // (tall enough to cover the neck's cut down to the planks)
  ctx.fillStyle = '#e6f3ff'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
  ctx.beginPath(); for (const [dx, dy, rx, ry] of blobs) { ctx.moveTo(x + dx + rx, y + dy); ctx.ellipse(x + dx + w * 1.5, y + dy, rx, ry, 0, 0, TAU); } ctx.stroke();
  ctx.beginPath(); for (const [dx, dy, rx, ry] of blobs) { ctx.moveTo(x + dx + rx, y + dy); ctx.ellipse(x + dx + w * 1.5, y + dy, rx, ry, 0, 0, TAU); } ctx.fill();
  ctx.fillStyle = '#b8dcff'; ctx.beginPath(); ctx.ellipse(x + 2, y + 10, 12, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#cfe8ff'; for (let i = 0; i < 3; i++) { const u = ((frame * 0.025 + i * 0.33) % 1), dx = -12 + i * 12; ctx.globalAlpha = 1 - u; ctx.beginPath(); ctx.ellipse(x + dx, y + 44 + u * 22, 2.6, 4, 0, 0, TAU); ctx.fill(); }   // (drips down the bulwark)
  ctx.restore();
}   // (the poses whose neck reaches over the rail onto the deck: drawn in front, but for the root)   // (src/stages/sibluegull.js: the bulwark's cap rail and planks, screen y -- the coil's lower part and the neck's root are behind them)

/** the head while its fangs are stuck: the one target (forwards every hit to the serpent) */
class LeviHead extends Actor {
  constructor(game, owner) {
    super(game, owner.x, owner.y);
    this.team = 'foe'; this.owner = owner; this.solid = false; this.noBar = true; this.name = 'THE LEVIATHAN';
    this.w = 74; this.h = 126; this.hz0 = 0; this.depthR = 22; this.shadowR = 0; this.hp = this.maxHp = 1; this.levihead = true;
  }
  get hittable() { const o = this.owner; return o.alive && (o.state === 'stuck' || (o.state === 'snap' && o.st > LEVI.snapReach + 2) || (o.state === 'snapWind' && o.st > 12) || (o.state === 'whirl' && o.st > 20 && o.st < LEVI.whirl - 8)) && !this.game.cut; }   // (and its tail in a whirlpool: QA2 round 2)   // (and resting after a snap: a chip -- QA2 M6)
  get boss() { return false; }
  knock() {}
  daze() {}
  takeHit(att, hd) { return this.hittable ? this.owner.hitHead(att, hd) : false; }
  update() { this.tick(); const o = this.owner, f = o.facing, wh = o.state === 'whirl'; this.x = o.x + f * (wh ? LEVI.tail[0] : LEVI.head[0]); this.y = wh ? LEVI.tail[1] : o.y; this.z = 0; if (o.gone) { this.alive = false; this.gone = true; } }
  tick() { this.st++; }
  /** (QA2 round 2) in a whirlpool its TAIL flops over the rail onto the deck: the target -- a spiked blue tail, swaying */
  draw(ctx) {
    const o = this.owner; if (o.state !== 'whirl' || !o.alive) return;
    const g = this.game, f = o.facing, k = Math.min(1, o.st / 20) * Math.min(1, (LEVI.whirl - o.st) / 14), x0 = o.x - g.camX, y0 = 304, x1 = this.x - g.camX + Math.sin(g.time * 3) * 6, y1 = FLOOR_TOP + this.y;
    if (k <= 0.02) return;
    const yk = y0 + (y1 - y0) * k, cx = (x0 + x1) / 2 + f * 30, cy = y0 - 40;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [lw, col] of [[34, INK], [27, '#2f5fb8'], [12, '#4f86d8']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0 + 6); ctx.quadraticCurveTo(cx, cy, x1, yk); ctx.stroke(); }
    ctx.fillStyle = '#f2ead8'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) { const u = i / 6, bx = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * cx + u * u * x1, by = (1 - u) * (1 - u) * (y0 + 6) + 2 * u * (1 - u) * cy + u * u * yk; ctx.beginPath(); ctx.moveTo(bx - 6, by - 10); ctx.lineTo(bx, by - 24); ctx.lineTo(bx + 6, by - 10); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#2f5fb8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x1 - 22, yk); ctx.lineTo(x1 + f * 30, yk + 4); ctx.lineTo(x1 - 22, yk + 14); ctx.closePath(); ctx.fill(); ctx.stroke();   // (the tail's fluke)
    ctx.restore();
  }
  drawShadow() {}
}

export class Leviathan extends Enemy {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { ...opt, name: 'THE LEVIATHAN' });
    this.art = 'leviathan'; this.solid = false; this.w = 40; this.h = 60; this.shadowR = 0; this.score = 6000; this.entered = true;
    this.baseHp = LEVI.hp; this.hp = this.maxHp = LEVI.hp; this.scaled = false;
    this.state = 'rise'; this.st = 0; this.rise = 0; this.lit = 0; this.spin = 0; this.seq = 0; this.cool = 0;
    this.facing = -1; this.hitWin = 0; this.fightT = 0; this.stuckN = 0; this.missN = 0; this.sprayAt = new Map(); this.cardT = 0;
    this.head = null; this.ring = null; this.lane = null; this.swimTo = null; this.mem = {};
    this.miniBoss = true; this.noAttackHint = true; this.ouch = 0; this.lift = 0; this.sinceFlip = 9; this.mercy = 0; this.mercyAt = -9999;   // (noAttackHint: its own hints teach it, not the generic 'tap it 4 times')
  }
  get hittable() { return false; }          // (the head, LeviHead, is the target)
  knock() {}                                 // (a respawning hero's burst knocks the foes near him: never this one -- src/player.js respawn)
  daze() {}
  get sortY() { return this.y + (['slam', 'stuck', 'unstick'].includes(this.state) ? 20 : -3); }   // (on the deck its head draws in front of a hero at its own depth -- he is behind it -- and behind one clearly nearer)
  set sortY(v) { /* (fixed: see the getter) */ }
  get boss() { return false; }
  get busy() { return true; }
  /** the neckBase's screen y for this depth: the slam's fang tips land at depth y */
  nbY() { return FLOOR_TOP + this.y - tips()[1]; }

  // ---------------------------------------------------------------- the fight
  begin() {
    const g = this.game, n = live(g).length;
    this.hp = this.maxHp = Math.round(this.baseHp * LEVI.coop[Math.max(1, Math.min(4, n))]); this.scaled = true;
    const ps = live(g), p = ps.length ? ps[0] : null; this.facing = p && p.x > g.camX + W / 2 ? 1 : -1;   // (it comes up on the far side from the heroes, facing them: no turn first)
    this.x = clamp((p ? p.x : g.camX + W / 2) - this.facing * (185 + 300), g.camX - 60, g.camX + W + 60); this.y = 78;   // (its head comes up ~300 px from the heroes: their first lines never sit on it)
    this.head = new LeviHead(g, this); g.actors.push(this.head);
    g.stage?.setBehindRail?.((ctx, camX, t) => this.drawBehind(ctx, camX, t));
    this.cardT = 1; audio.sfx('levi_roar'); audio.jingle?.('si_bossintro', { then: 'silevi' }); g.shake = Math.max(g.shake, 6);   // (its own fight music: src/audio.js)
  }
  update() {
    const g = this.game, M = g.mm;
    this.tick(); this.mem.frame = g.frame;
    if (!this.scaled) this.begin();
    if (this.cardT > 0 && ++this.cardT > LEVI.card) this.cardT = 0;
    if (g.cut || g.cutin) return;
    if (this.alive && !['dizzy', 'sink', 'gone'].includes(this.state)) { g.engage(this); this.fightT++; }
    if (this.cool > 0) this.cool--;
    if (this.ouch > 0) this.ouch--;
    this.stepMercy();
    { const st = this.state, low = ['slam', 'stuck', 'snapWind', 'snap'].includes(st), want = st === 'slamWind' || st === 'unstick' ? 50 : low ? 0 : live(g).length >= 3 ? 40 : 14;   // (slamWind / unstick rear the head up under the boss bar: 50 px lower)
      this.lift = st === 'slam' || st === 'stuck' || st === 'snap' ? 0 : (this.lift || 0) + clamp(want - (this.lift || 0), -1.2, 1.2); }   // (the slam lands where its ring is: no lift left)
    // the whirlpool's glow eases in and out (never a pop)
    this.lit += ((this.state === 'whirlWind' || this.state === 'whirl' ? 1 : 0) - this.lit) * 0.06;
    if (this.state === 'whirl') this.spin += 0.045 * Math.min(1, this.st / 30);
    else this.spin *= 0.92;
    switch (this.state) {
      case 'rise': {   // (the card first; then the coil rises, the head comes up over the rail; Dodongo, then Anastasia; then the hint and the first ring)
        const u = this.st - 40;   // (QA2 round 2: 30 f sooner)
        this.rise = Math.min(1, Math.max(0, u) / 80);   // (QA2 M6: 330 f of rise was 8 s with nothing to hit)
        if (u === 0) audio.sfx('wave_rise', { pitch: 0.7 });
        if (u === 20) this.say2(['dodongo', 'ana'], 'Uh... is the SEA\nlooking at us?!', 'Something BIG is\nin the water...');
        if (u === 80) this.say2(['ana', 'dodongo'], 'A sea SERPENT!\nWatch its FANGS!', 'A sea SERPENT!\nWatch its FANGS!');
        if (u >= 120) { this.set('swim'); this.pick(); M?.hint?.('silevi', 'A RED ring = its FANGS! Step OUT. || Fangs STUCK in the deck? Hit its HEAD!', 420, true); }
        break;
      }
      case 'dive': this.stepDive(); break;
      case 'swim': this.stepSwim(); break;
      case 'slamWind': this.stepSlamWind(); break;
      case 'slam': this.stepSlam(); break;
      case 'stuck': this.stepStuck(); break;
      case 'unstick': if (this.st >= 18) { this.set('swim'); this.pick(); } break;
      case 'snapWind': this.stepSnapWind(); break;
      case 'snap': this.stepSnap(); break;
      case 'whirlWind': if (this.st >= LEVI.whirlTele) { this.set('whirl'); audio.sfx('whirlpool', { hold: 0.8 }); } break;
      case 'whirl': this.stepWhirl(); break;
      case 'dizzy': this.stepDizzy(); break;
      case 'sink': this.stepSink(); break;
      default: break;
    }
  }
  /** the next move: slam first (it teaches the stuck window), then snap / slam / whirl */
  pick() {
    const n = this.seq++, solo = live(this.game).length < 2;
    this.next = ['slam', 'snap', 'slam', 'snap', 'slam', 'whirl'][n % 6]; void solo;   // (a whirl every 6th move, alone or not -- QA2 round 2)   // (a slam every other move: the stuck window, the one chance to hit it, comes often; alone, a whirl only every 6th -- QA2 M6)
    this.swimTo = null; this.cool = n === 0 ? 8 : 24; this.sinceFlip++;   // (the first slam at once: QA2 M6)
  }
  /** the hero it goes for (the nearest, so a lone kid always knows it is him) */
  target() { const g = this.game, ps = live(g); if (!ps.length) return null; return ps.reduce((a, b) => (Math.abs(b.x - this.x - this.facing * 240) < Math.abs(a.x - this.x - this.facing * 240) ? b : a)); }
  /** swim the coil along the rail (behind it) to a spot for the next move */
  stepSwim() {
    const g = this.game, p = this.target();
    if (!p) return;
    if (!this.swimTo) {
      const reach = this.next === 'snap' ? 300 : this.next === 'whirl' ? 0 : tips()[0];
      const mid = g.camX + W / 2, side = p.x > mid + LEVI.flipPast ? 1 : p.x < mid - LEVI.flipPast ? -1 : this.facing;   // (it strikes from the side the hero is on, its coil on the other -- a hero near the middle keeps its side)
      const face = this.next === 'whirl' || this.sinceFlip < 2 ? this.facing : side;   // (and at most one dive round every two moves)
      const x = this.next === 'whirl' ? g.camX + W / 2 + rnd(-140, 140) - face * 120 : this.strikeX(p.x) - face * reach;
      this.swimTo = { x: clamp(x, g.camX - 40, g.camX + W + 40), y: clamp(this.next === 'whirl' ? 78 : p.y, 44, 92) };   // (its depth at most 92: the slam ring stays above the hint box)
      if (face !== this.facing) { this.sinceFlip = 0; this.dive = { face, x: this.swimTo.x }; this.set('dive'); audio.sfx('splash', { vol: 0.6 }); return; }   // (a turn: down into the sea, round, and up again -- never a flip)
    }
    const T = this.swimTo;
    this.x += clamp(T.x - this.x, -8, 8); this.y += clamp(T.y - this.y, -2.2, 2.2);   // (8: less swimming with nothing to hit -- QA2 round 2)
    if (this.cool <= 0 && Math.abs(T.x - this.x) < 8 && Math.abs(T.y - this.y) < 4) {
      if (this.next === 'slam') this.beginSlam(p);
      else if (this.next === 'snap') this.beginSnap(p);
      else this.beginWhirl();
    }
  }
  /** a line by the first of `ids` in the party (Dodongo / Anastasia: Scarlet is not here yet); else any hero who talks; Shadow alone: "..." */
  say2(ids, text, alt, life = 150) {
    const g = this.game, ps = live(g), b = (q) => baseOf(q.heroId);
    let s = ps.find((q) => b(q) === ids[0]), t = text;
    if (!s) { s = ps.find((q) => b(q) === ids[1]); t = alt; }
    if (!s) { s = ps.find((q) => b(q) !== 'shadow') || ps[0]; t = s && b(s) === 'shadow' ? '...' : alt; }
    if (s) g.say(s, t, life, { villain: false });
  }
  /** a hero low on health (a young kid who keeps getting bumped) finds a drumstick near the front of the deck: twice a fight at most */
  stepMercy() {
    const g = this.game;
    if (this.mercy >= 2 || g.frame - this.mercyAt < 1200 || !['swim', 'snap', 'whirl', 'stuck'].includes(this.state)) return;
    const q = live(g).find((p) => p.hp < LEVI.mercyHp);
    if (!q) return;
    this.mercy++; this.mercyAt = g.frame;
    g.spawnPickup('drumstick', clamp(q.x + (q.x < g.camX + W / 2 ? 90 : -90), g.camX + 80, g.camX + W - 80), DEPTH - 24);
    g.fx.label(q.x, DEPTH - 24, 90, 'SNACK!', '#ffe9a0', 26, 50);
  }
  /** a strike point kept well inside the screen: the head (its only target) never hides behind an edge */
  strikeX(x) { const g = this.game; return clamp(x, g.camX + 140, g.camX + W - 140); }
  stepDive() {
    const D = this.dive, g = this.game;
    if (this.st < 40) this.rise = 1 - this.st / 40;
    else { if (this.st === 40) { this.facing = D.face; this.x = D.x; } this.rise = Math.min(1, (this.st - 40) / 50); }
    if (this.st % 12 === 0) g.fx.dust?.(this.x - this.facing * 80, 0, 3, 50);
    if (this.st >= 90) { this.rise = 1; this.dive = null; this.set('swim'); }
  }
  /** a new move: the heroes' old balloons (older than a second) are cut short -- no stale line over the warning */
  freshMove() { for (const q of this.game.fx.list) if (q.type === 'balloon' && q.actor?.team === 'hero' && (q.t || 0) > 60) q.life = Math.min(q.life || 0, (q.t || 0) + 16); }
  beginSlam(p) {
    const g = this.game; this.freshMove();
    this.set('slamWind'); this.ring = { x: this.x + this.facing * tips()[0], y: this.y, lock: false, tgt: p };
    audio.sfx('levi_rear'); g.fx.alert?.(this);
  }
  stepSlamWind() {
    const R = this.ring, p = R.tgt, tele = LEVI.slamTele;
    if (this.st < 26 && p && p.alive && !p.out) {   // (the ring creeps after its hero, then locks: the coil follows)
      this.x += clamp(this.strikeX(p.x) - this.facing * tips()[0] - this.x, -2.4, 2.4); this.y += clamp(clamp(p.y, 44, 92) - this.y, -1.6, 1.6);
    }
    R.x = this.x + this.facing * tips()[0]; R.y = this.y;
    if (this.st >= tele) { this.set('slam'); audio.sfx('swing_heavy', { pitch: 0.5, vol: 0.9 }); }
  }
  stepSlam() {
    const g = this.game, R = this.ring;
    if (this.st === LEVI.slamHit) {   // the fangs hit the planks
      audio.sfx('fang_slam'); g.shake = Math.max(g.shake, 9);
      g.fx.dust(R.x, R.y, 10, 60); g.fx.debris(R.x, R.y, 10, ['#7a6a62', '#5a4c48', '#9a8a80'], 14); SIFX.burst(R.x, R.y, 2, 'wood', { k: 1.8 });
      for (const q of g.players) {
        if (!q.hittable || q.out || q.z > 40) continue;
        const ex = (q.x - R.x) / LEVI.slamR, ey = (q.y - R.y) / (LEVI.slamR * 0.34);
        if (ex * ex + ey * ey > 1) continue;
        q.takeHit({ x: R.x + (q.x < R.x ? 30 : -30), team: 'foe', facing: q.x < R.x ? -1 : 1 }, { dmg: LEVI.slamDmg, kind: 'knock', push: 5, lift: 6, stop: 6, sfx: 'hit_heavy', spark: 'warm' });
      }
    }
    if (this.st >= LEVI.slamLen) { this.ring = null; this.beginStuck(); }
  }
  beginStuck() {
    const g = this.game, M = g.mm;
    this.set('stuck'); this.hitWin = 0; this.capT = undefined; this.stuckN++;
    g.fx.label(this.x + this.facing * LEVI.head[0], this.y, 236, 'STUCK!', '#fff2a8', 34, 56);
    if (this.stuckN === 1) M?.hint?.('silevistuck', 'Its fangs are STUCK! Hit its HEAD!', 180, true);
    else if (this.stuckN <= 3 || this.missN >= 2) M?.hint?.('silevistuck' + this.stuckN, this.missN >= 2 ? 'STUCK! Run to its HEAD and hit it!' : 'STUCK! Hit its HEAD!', 150, true);
  }
  get stuckLen() {   // (a kid who misses gets a longer window next time; a window whose share is used up ends a little early)
    const base = (live(this.game).length > 1 ? LEVI.stuckCoop : LEVI.stuck) + Math.min(60, this.missN * 20), cap = this.maxHp * LEVI.winCap[live(this.game).length > 1 ? 1 : 0];
    return this.hitWin >= cap - 0.5 ? Math.min(base, (this.capT ?? this.st) + 30) : base;
  }   // (a kid who misses gets a longer window next time)
  stepStuck() {
    const g = this.game;
    if (this.st % 26 === 6) audio.sfx('fang_stuck', { vol: 0.8 });   // (it tugs: creak)
    if (this.st >= this.stuckLen) {
      if (this.hitWin <= 0) this.missN++; else this.missN = 0;
      // (a long fight: yanking its fangs out hurts it a little -- the fight always ends)
      if (this.fightT > LEVI.tireAt && this.hp > 0) { this.dent(Math.round(this.maxHp * LEVI.tire)); g.fx.label(this.x + this.facing * LEVI.head[0], this.y, 220, 'OUCH!', '#ffb07a', 32, 60); }
      if (this.hp <= 0) { this.beginDizzy(); return; }
      this.set('unstick'); audio.sfx('fang_free'); g.mm?.clearHint?.('silevistuck', 'silevistuck' + this.stuckN, 'silevi');
      g.fx.debris(this.x + this.facing * tips()[0], this.y, 6, ['#7a6a62', '#9a8a80'], 8);
    }
  }
  /** a hit on its head while the fangs are stuck */
  hitHead(att, hd) {
    const g = this.game;
    let d = Math.min(Math.max(3, hd.dmg || 1), LEVI.hitCap);
    if (att && att.helper) d *= 0.6;
    if (this.state === 'snap' || this.state === 'snapWind' || this.state === 'whirl') {   // (a chip -- the tail in a whirlpool, too -- on the resting head after a snap: half, at most chipCap of its health a snap -- QA2 M6)
      d = Math.max(0, Math.min(d * LEVI.chip, this.maxHp * LEVI.chipCap - (this.chipWin || 0))); this.chipWin = (this.chipWin || 0) + d;
      this.dent(Math.round(d)); this.ouch = 8; audio.sfx(d > 0 ? 'hit_wet' : 'block', { vol: 0.6 }); g.fx.spark(this.x + this.facing * LEVI.head[0], this.y, 60, false); g.engage(this);
      if (this.hp <= 0) this.beginDizzy();
      return true;
    }
    const cap = this.maxHp * LEVI.winCap[live(g).length > 1 ? 1 : 0] - this.hitWin;   // (this window's share is used up: the hit still lands -- spark, thud -- but the bar holds)
    d = Math.max(0, Math.min(d, cap));
    this.dent(Math.round(d)); this.hitWin += d;
    if (this.hitWin >= this.maxHp * LEVI.winCap[live(g).length > 1 ? 1 : 0] - 0.5 && this.capT === undefined) this.capT = this.st;
    this.ouch = 10;
    audio.sfx(d > 0 ? 'hit_wet' : 'block', d > 0 ? { vol: 0.8 } : { pitch: 1.2, vol: 0.7 });   // (hit_wet: the composer's sea-creature thwack)
    g.fx.spark(this.x + this.facing * LEVI.head[0], this.y, 80, true);
    if (d <= 0 && g.frame - (this.capSaid ?? -999) > 50) { this.capSaid = g.frame; g.fx.label(this.x + this.facing * (LEVI.head[0] - 40), this.y, 170, 'IT PULLS FREE!', '#cfefff', 28, 44); }   // (at its head on the deck: never up in the HUD band)
    g.engage(this);
    if (this.hp <= 0) this.beginDizzy();
    return true;
  }
  dent(d) { this.hp = Math.max(0, this.hp - d); }
  beginSnap(p) {
    const g = this.game; this.freshMove();
    this.set('snapWind'); this.lane = { y: clamp(p.y, 30, DEPTH - 30), lock: false, tgt: p }; this.chipWin = 0;
    audio.sfx('levi_rear', { pitch: 1.4, vol: 0.7 });
    if (!g.flags.hint_silevisnap) g.mm?.hint?.('silevisnap', `A lane = a SNAP! JUMP ${g.mm.keyName('jump')} or step out!`, 200, true);
  }
  stepSnapWind() {
    const L = this.lane, p = L.tgt;
    if (this.st < LEVI.snapCreep && p && p.alive && !p.out) { L.y += clamp(clamp(p.y, 30, DEPTH - 30) - L.y, -2.2, 2.2); this.y += clamp(L.y - this.y, -2, 2); }
    if (this.st >= LEVI.snapTele) { this.set('snap'); this.snapHit = new Set(); audio.sfx('sword_slash', { pitch: 0.5, vol: 0.8 }); }
  }
  stepSnap() {
    const g = this.game, L = this.lane, f = this.facing;
    if (this.st >= LEVI.snapReach - 1 && this.st <= LEVI.snapReach + 2) {
      for (const q of g.players) {
        const dx = (q.x - this.x) * f;
        if (!q.hittable || q.out || this.snapHit.has(q) || q.z > LEVI.jumpZ || Math.abs(q.y - L.y) > LEVI.laneH || dx < LEVI.snapLane[0] - 20 || dx > LEVI.snapLane[1] + 10) continue;
        this.snapHit.add(q);
        q.takeHit({ x: this.x + f * 200, team: 'foe', facing: f }, { dmg: LEVI.snapDmg, kind: 'knock', push: 5.5, lift: 4.5, stop: 5, sfx: 'hit_heavy' });
        g.fx.word(q.x, q.y, 140, true, 'SNAP!');
      }
      if (this.st === LEVI.snapReach) { audio.sfx('levi_snap'); g.shake = Math.max(g.shake, 4); }
    }
    if (this.st >= LEVI.snapLen + 10 + LEVI.snapRest) { this.lane = null; this.set('swim'); this.pick(); g.mm?.clearHint?.('silevisnap'); }
  }
  beginWhirl() {
    const g = this.game; this.freshMove();
    this.set('whirlWind'); audio.sfx('levi_rear', { pitch: 0.8 }); this.chipWin = 0;
    g.mm?.hint?.('sileviwhirl', 'WHIRLPOOL! Walk AWAY from the rail!', 150, !g.flags.hint_sileviwhirl);   // (150 f: off the green safe band at the front before the pull is over)
    if (!this.whirlSaid) { this.whirlSaid = true; this.say2(['dodongo', 'ana'], 'Whoa! The sea is\nPULLING us!', 'Walk AWAY from\nthe rail!', 110); }   // (a short line: it must not sit over the neck the whole whirl)
  }
  stepWhirl() {
    const g = this.game, k = Math.min(1, this.st / 24) * (this.st > LEVI.whirl - 24 ? (LEVI.whirl - this.st) / 24 : 1);
    for (const p of live(g)) {
      if (g.mm?.holds?.has(p)) continue;
      p.y = Math.max(2, p.y - LEVI.pull * k); p.x += clamp((this.x - p.x) * 0.004, -0.6, 0.6) * k;
      if (p.y < 10 && p.hittable && g.frame - (this.sprayAt.get(p) ?? -999) > 70) {   // the spray at the rail: a bump back onto the deck
        this.sprayAt.set(p, g.frame);
        p.takeHit({ x: p.x, team: 'foe', facing: 1 }, { dmg: LEVI.sprayDmg, kind: 'light', push: 0, stun: 16, stop: 3, sfx: 'hit_light' });
        p.y = 26; g.fx.word(p.x, p.y, 120, true, 'SPLASH!'); audio.sfx('splash');
      }
    }
    if (this.st >= LEVI.whirl) { this.set('swim'); this.pick(); g.mm?.clearHint?.('sileviwhirl'); }
  }
  beginDizzy() {
    const g = this.game;
    this.hp = 0; this.ring = null; this.lane = null; this.set('dizzy'); this.dizzyUntil = g.frame + 150;
    { const h = CHARS.leviathan?.point?.(this.pose(), 'head'), hy = this.neckY() + (h ? h[1] : -100);   // (the beat on its drawn head, not on the deck)
      SIFX.bossBeat?.(g, this, { x: this.x + this.facing * (h ? h[0] : 200), y: this.y, z: Math.max(0, FLOOR_TOP + this.y - hy) }); }   // (the final blow: slow-mo + a camera nudge + its material burst, src/sifx.js)
    audio.sfx('hit_finisher', { pitch: 0.7 }); g.shake = Math.max(g.shake, 8);
    g.mm?.clearHint?.('silevi', 'silevistuck', 'silevisnap', 'sileviwhirl');
    g.engagedT = 0;
  }
  stepDizzy() {
    const g = this.game;
    if (this.st === 40) { g.fx.label(this.x + this.facing * 200, this.y, 260, 'BLUB?', '#bfe6ff', 44, 90); audio.sfx('levi_blub'); }
    if (this.st === 70) g.mm?.line?.('leviDone');
    if (this.st >= 150) { this.set('sink'); audio.sfx('sink_gurgle'); }
  }
  stepSink() {
    const g = this.game;
    this.rise = Math.max(0, 1 - Math.max(0, this.st - 40) / 90);   // (the neck sinks into the coil, then the coil sinks as it swims off)
    if (this.st > 40) this.x += this.facing * -2.2;
    if (this.st >= 136) {
      this.alive = false; this.gone = true; this.releaseToken();
      if (this.head) { this.head.alive = false; this.head.gone = true; }
      g.stage?.setBehindRail?.(null);
      if (g.L?.music) audio.music(g.L.music);   // (the stage's shanty back)
      g.score += this.score; g.onFoeGone?.(this);
    }
  }

  // ---------------------------------------------------------------- the art
  pose() {
    const A = CHARS.leviathan?.ANIM || {}, t = this.game.frame / 60, st = this.st;
    const k = (n) => Math.min(1, st / n);
    switch (this.state) {
      case 'rise': case 'dive': return A.idle(t);   // (awake: it comes up out of the sea / turns round in it -- nbScreen's rise offset moves it; the 'sink' clip is the dizzy swim-off, its eyes swirl)
      case 'slamWind': return A.slamWind(k(20));
      case 'slam': return A.slam(k(LEVI.slamLen));
      case 'stuck': return A.stuck(t);
      case 'unstick': return A.hurt(k(18));
      case 'snapWind': return A.snapWind(k(16));
      case 'snap': return A.snap(k(LEVI.snapLen));
      case 'whirlWind': case 'whirl': return A.whirl(t);
      case 'dizzy': return A.dizzy(t);
      case 'sink': return A.sink(k(40));
      default: return A.idle(t);
    }
  }
  /** neckBase on the screen, and the rise's sink offset (the serpent comes up out of the sea and goes back into it) */
  nbScreen() { const g = this.game, j = this.ouch > 0 ? (this.ouch % 2 ? 2 : -2) : 0; return [this.x - g.camX + j, this.nbY() + (1 - this.rise) * 230]; }   // (j: the flinch of a hit; the coil's: it rises out of the sea)
  /** rising out of the sea or diving round: the whole serpent is behind the rail */
  get inSea() { return this.state === 'rise' || this.state === 'dive' || (this.state === 'sink' && this.st > 30); }
  /** wholly behind the bulwark: in the sea, or a pose that stays on the sea side (its head up over the rail, or lolling on it) -- only the
   *  slam, the stuck fangs, the pull free and the snap reach over the rail onto the deck (the bulwark hides everything below its cap) */
  get behind() { return this.inSea || !OVER_RAIL.includes(this.state); }
  /** the neck's base on the screen: no sink offset (its pose does the sinking), lowered a little in the high poses so the head clears the HUD */
  neckY() { return this.nbY() + (this.lift || 0); }
  /** the column over neckBase (behind the bulwark): screen x range */
  column(sx) { const f = this.facing, r = this.state === 'snap' ? 22 : 58; return f > 0 ? [sx - 120, sx + r] : [sx - r, sx + 120]; }   // (the snap's flat neck: only its lead-in, x -50..+21, is hidden -- the painted builder's numbers)   // (only the rising root: the neck lying over the rail onto the deck draws in front)
  /** the coil (and the neck's root column), in the sea behind the rail -- the stage calls this between the sea and the bulwark */
  drawBehind(ctx, camX, t) {
    if (this.gone) { this.game.stage?.setBehindRail?.(null); return; }
    const C = CHARS.leviathan_coil, N = CHARS.leviathan, [sx, sy] = this.nbScreen(), f = this.facing, cs = LEVI.coilK;
    if (sx < -500 || sx > W + 500) return;
    if (C) {
      const NB = C.NECKBASE || C.EXPORTS?.NECKBASE || [107, 139], cx = sx - f * NB[0] * cs;
      const lit = clamp(this.lit, 0, 1);
      // (QAF art: the sea's own surface, below the horizon -- it sat at 234-250, on the horizon line, the coil on top "like a cloud"; the coil
      //  sunk ~30% under it, rising out of the sea with the neck)
      const wy = COIL_WL, cy = wy + 38 - 52 * cs + (1 - this.rise) * 230 + Math.sin(t * 1.3) * 3;
      ctx.save(); ctx.beginPath(); ctx.rect(cx - 400, cy - 400, 800, wy + 8 - (cy - 400)); ctx.clip(); ctx.translate(cx, cy);
      try { C.draw(ctx, (C.ANIM && C.ANIM.idle) || {}, { facing: f, scale: cs, spin: this.spin, lit }); } catch (e) { if (!this._coilErr) { this._coilErr = 1; console.error('leviCoil', e); } }   // (the coil missing: the neck alone; logged once)
      ctx.restore();
      if (this.rise > 0.05) this.drawWaterline(ctx, cx, wy, 150 * cs, t, Math.min(1, this.rise * 1.5));
      // the sea round it: a ring of foam where the coil meets the water, and the whirlpool's swirl
      this.drawFoam(ctx, cx, Math.min(BULW_TOP - 6, wy + 24), t);
    }
    if (N && this.behind) { this.drawNeck(ctx, sx, this.neckY()); }   // (rising / diving / head up: all of it behind the rail)
    else if (N && this.rise > 0.02) {
      const [x0, x1] = this.column(sx);
      ctx.save(); ctx.beginPath(); ctx.rect(x0, RAIL_TOP + 2, x1 - x0, 400); ctx.clip();   // (the root: the column below the rail top)
      this.drawNeck(ctx, sx, this.neckY());
      ctx.restore();
    }
  }
  /** where the coil goes into the sea (QAF art): darker water in front under the line, then an irregular, broken crest -- seeded clumps of
   *  mixed sizes with gaps, tapering to the ends, a thin froth line tying them, a slight wobble, and spray flicking off.  a: its fade-in */
  drawWaterline(ctx, cx, y, hw, t, a = 1) {
    const hh = (n) => { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; return (n >>> 0) / 4294967296; };
    ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const gr = ctx.createLinearGradient(0, y - 3, 0, y + 22);   // (the water in front: the sunk coil dim under it)
    gr.addColorStop(0, 'rgba(12,26,54,0.92)'); gr.addColorStop(0.45, 'rgba(14,30,60,0.6)'); gr.addColorStop(1, 'rgba(16,34,66,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(cx - hw * 1.18, y + 2);
    for (let i = 1; i < 16; i++) { const k = i / 16, x = cx - hw * 1.18 + k * hw * 2.36; ctx.lineTo(x, y - 1 + Math.sin(t * 1.7 + i * 1.3) * 1.2); }
    for (let i = 16; i >= 0; i--) { const k = i / 16, x = cx - hw * 1.18 + k * hw * 2.36, e = 2 * k - 1; ctx.lineTo(x, y + 2 + 20 * Math.sqrt(Math.max(0, 1 - e * e))); }   // (a lens: its ends taper)
    ctx.closePath(); ctx.fill();
    // the froth line: a thin, uneven pale line the clumps sit on (broken where the crest breaks)
    const pts = []; let x = -hw * 1.1, i = 0;
    while (x < hw * 1.1 && i < 60) { const e = Math.abs(x) / (hw * 1.1), r = (3.5 + 9 * hh(i * 7 + 1) * hh(i * 3 + 2) * 1.6) * (1 - 0.65 * e * e) * (1 + 0.14 * Math.sin(t * 3.1 + i * 2.3)); pts.push({ x: cx + x, y: y + Math.sin(t * 2.3 + i * 1.9) * 1.6 + e * 2.5, r, gap: hh(i * 13 + 5) < 0.14, i }); x += 6 + 11 * hh(i * 5 + 3); i++; }
    ctx.strokeStyle = 'rgba(226,240,255,0.75)'; ctx.lineWidth = 2.2; ctx.beginPath();
    let pen = false; for (const p of pts) { if (p.gap) { pen = false; continue; } if (!pen) { ctx.moveTo(p.x, p.y + 1); pen = true; } else ctx.lineTo(p.x, p.y + 1 + Math.sin(p.i * 2.7) * 1.2); }
    ctx.stroke();
    // the clumps: mixed sizes, the bigger ones inked (thin), the small ones bare froth
    for (const p of pts) {
      if (p.gap) continue;
      ctx.fillStyle = p.r > 7 ? '#e8f4ff' : 'rgba(224,238,255,0.85)'; ctx.beginPath(); ctx.ellipse(p.x, p.y - p.r * 0.25, p.r, p.r * (0.48 + 0.2 * hh(p.i * 17)), 0, 0, TAU); ctx.fill();
      if (p.r > 7) { ctx.strokeStyle = 'rgba(16,22,40,0.75)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(p.x, p.y - p.r * 0.25, p.r, p.r * (0.48 + 0.2 * hh(p.i * 17)), 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); }
    }
    // spray flicking off the crest
    for (let j = 0; j < 12; j++) {
      const ph = (t * (0.7 + 0.5 * hh(j * 3 + 1)) + hh(j * 7 + 2)) % 1, sx = cx + (hh(j * 11 + 4) - 0.5) * 2 * hw, sy = y - 4 - ph * (10 + 16 * hh(j * 5 + 6)) + ph * ph * 10;
      ctx.globalAlpha = a * (1 - ph) * 0.85; ctx.fillStyle = '#eef7ff'; ctx.beginPath(); ctx.arc(sx + ph * (hh(j * 19) - 0.5) * 14, sy, 1.2 + 1.6 * hh(j * 23), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  drawFoam(ctx, cx, y, t) {
    const w = this.state === 'whirl' ? 230 : 170;
    ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = '#d8ecff'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(cx, y + i * 4, w - i * 30 + 6 * Math.sin(t * 2 + i), 10 - i * 2, 0, (this.spin + i) % TAU, (this.spin + i) % TAU + 4.4); ctx.stroke(); }
    ctx.restore();
  }
  drawNeck(ctx, sx, sy) {
    const N = CHARS.leviathan;
    ctx.save(); ctx.translate(sx, sy);
    try { N.draw(ctx, this.pose(), { facing: this.facing, scale: 1, t: this.game.frame / 60, mem: this.mem }); } catch (e) { if (!this._drawErr) { this._drawErr = 1; console.error('leviathan draw', e); } }
    ctx.restore();
  }
  /** the actor layer: the arch over the rail and the head on the deck (everything outside the root column) */
  draw(ctx) {
    if (this.gone || this.rise <= 0.02 || !CHARS.leviathan || this.inSea) return;
    const [sx] = this.nbScreen(), sy = this.neckY(), [x0, x1] = this.column(sx), g = this.game;
    if (!this.behind) {
      ctx.save(); ctx.beginPath(); ctx.rect(-50, -50, W + 100, 700); ctx.rect(x1, RAIL_TOP + 2, x0 - x1, 400); ctx.clip('evenodd');   // (all but the root: the seam lies along the rail cap)
      this.drawNeck(ctx, sx, sy);   // (no white hit flash on a sprite this big -- flash safety: a hit is the spark, the thud and the flinch)
      ctx.restore();
      if (this.state === 'snap') seamFoam(ctx, this.facing > 0 ? x1 : x0, g.frame);   // (where the neck comes low over the rail out of the sea: foam at the root column's edge hides the cut)
      this.xrayHeroes(ctx);
    }
    // the target: a bobbing arrow over its head while the fangs are stuck
    if (this.state === 'stuck') {
      const h = CHARS.leviathan.point?.(this.pose(), 'head'), ax = sx + this.facing * (h ? h[0] : 226), ay = sy + (h ? h[1] : 40) - 70 - 8 * Math.abs(Math.sin(g.frame * 0.12));
      ctx.save(); ctx.fillStyle = '#ffe066'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(ax - 12, ay - 26); ctx.lineTo(ax + 12, ay - 26); ctx.lineTo(ax + 12, ay - 10); ctx.lineTo(ax + 22, ay - 10); ctx.lineTo(ax, ay + 10); ctx.lineTo(ax - 22, ay - 10); ctx.lineTo(ax - 12, ay - 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // dizzy stars round its crown
    if (this.state === 'dizzy' || this.state === 'sink' && this.st < 30) {
      const h = CHARS.leviathan.point?.(this.pose(), 'head'), hx = sx + this.facing * (h ? h[0] : 200), hy = sy + (h ? h[1] : -100) - 44, t = g.frame / 60;   // (sy: the neck's base, neckY)
      ctx.save(); ctx.fillStyle = '#ffe066'; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
      for (let i = 0; i < 4; i++) { const a = t * 3 + i * TAU / 4, x = hx + Math.cos(a) * 42, y = hy + Math.sin(a) * 12; star(ctx, x, y, 8); }
      ctx.restore();
    }
  }
  /** on the deck its head draws in front of the heroes at its own depth (sortY y+20: the target stays visible) -- so a hero it covers shows
   *  through it as a soft silhouette in their colour (a kid never loses their own hero behind the stuck head) */
  /** (the FX agent's QAF ask) the raised head's and upper neck's box on the screen, [x0, y0, x1, y1] -- null while it is in the sea: hud.js keeps
   *  the boss bar off it (in 4P the engaged bar crossed its raised head) */
  get hudKeep() {
    if (this.gone || this.inSea || this.rise < 0.3 || !CHARS.leviathan) return null;
    const [sx] = this.nbScreen(), sy = this.neckY(), h = CHARS.leviathan.point?.(this.pose(), 'head') || [LEVI.head[0], 40];
    const hx = sx + this.facing * h[0], hy = sy + h[1] + 22, mx = (sx + hx) / 2;   // (the head's middle, as xrayHeroes; the neck's midpoint)
    return [Math.min(hx - 125, mx), hy - 110, Math.max(hx + 125, mx), hy + 95];
  }
  xrayHeroes(ctx) {
    if (!['slam', 'stuck', 'unstick'].includes(this.state)) return;
    const g = this.game, [sx] = this.nbScreen(), sy = this.neckY(), h = CHARS.leviathan?.point?.(this.pose(), 'head') || [LEVI.head[0], 40];
    const hx = sx + this.facing * h[0], hy = sy + h[1] + 22, rx = 112, ry = 92, a0 = ctx.globalAlpha;   // (the head + its fangs: the part that covers a hero)
    for (const p of g.players) {
      if (p.out || p.hidden || !p.art || p.y > this.y + 20 || p.y < this.y - 46) continue;   // (only heroes drawn before it: at its depth or behind)
      if (Math.abs(p.sx - hx) > rx + 30 || p.sy - 130 > hy + ry || p.sy < hy - ry) continue;   // (and only where the head really covers them)
      ctx.save(); ctx.beginPath(); ctx.ellipse(hx, hy, rx, ry, 0, 0, TAU); ctx.clip();
      ctx.globalAlpha = a0 * 0.42;
      setSilhouette(p.hero?.accent || '#ffe2a0');
      try { drawWithFlash(ctx, p.sx, p.sy, 0, (c) => p.art.draw(c, p.pose(), { facing: p.facing, t: g.time, mem: {} })); } catch (e) { if (!this._xrayErr) { this._xrayErr = 1; console.error('leviXray', e); } }   // (a hero's art not ready: no x-ray; logged once)
      finally { setSilhouette(g.impact && !g.cutin ? '#fff8ea' : null); ctx.restore(); }
    }
  }
  /** the warnings on the deck (under everyone): the slam's ring, the snap's lane, the whirlpool's pull */
  drawShadow(ctx) {
    const g = this.game, f = this.facing;
    if (this.state === 'slamWind' && this.ring) {
      const R = this.ring, sx = R.x - g.camX, sy = FLOOR_TOP + R.y, k = Math.min(1, this.st / 30), b = this.st > LEVI.slamTele - 24 ? pulse(this.st) : 1, r = LEVI.slamR;
      ctx.save();
      ctx.globalAlpha = 0.36 + 0.36 * k; ctx.fillStyle = 'rgb(255,46,34)'; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.34, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = b; ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(sx, sy, r * (1.14 - 0.14 * k), r * 0.34 * (1.14 - 0.14 * k), 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffe03a'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]);
      // two fang marks inside: where the fangs will go
      ctx.globalAlpha = 0.95 * k; ctx.fillStyle = '#fff6c8'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      const T = tips(); for (const [tx] of tipPts()) { const dx = tx - T[0], x = sx + dx * f; ctx.beginPath(); ctx.moveTo(x - 6, sy - 14); ctx.lineTo(x + 6, sy - 14); ctx.lineTo(x, sy + 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }   // (two fangs: where they will go)
      ctx.restore();
    }
    if (this.state === 'stuck' || this.state === 'unstick' && this.st < 6) {   // the fangs' holes in the planks
      const sx = this.x + f * tips()[0] - g.camX, sy = FLOOR_TOP + this.y;
      ctx.fillStyle = 'rgba(20,12,8,0.55)'; const T = tips(); for (const [tx] of tipPts()) { ctx.beginPath(); ctx.ellipse(sx + (tx - T[0]) * f, sy, 8, 3.4, 0, 0, TAU); ctx.fill(); }
    }
    if ((this.state === 'snapWind' || this.state === 'snap' && this.st < 8) && this.lane) {
      const L = this.lane, y = FLOOR_TOP + L.y, a = this.x - g.camX + f * LEVI.snapLane[0], b = this.x - g.camX + f * LEVI.snapLane[1], x0 = Math.min(a, b), x1 = Math.max(a, b);
      const k = Math.min(1, this.st / 20), locked = this.state === 'snap' || this.st >= LEVI.snapCreep, bl = this.state === 'snapWind' && this.st > LEVI.snapTele - 24 ? pulse(this.st) : 1;
      ctx.save();
      ctx.globalAlpha = (0.4 + 0.4 * k) * (0.6 + 0.4 * bl); ctx.fillStyle = '#ff7a10'; ctx.fillRect(x0, y - LEVI.laneH, x1 - x0, LEVI.laneH * 2);
      if (locked) { ctx.globalAlpha = 0.25 * bl; ctx.fillStyle = '#fff2a0'; ctx.fillRect(x0, y - LEVI.laneH, x1 - x0, LEVI.laneH * 2); }   // (LOCKED: it stops following -- the lane lights up)
      ctx.globalAlpha = bl; ctx.strokeStyle = INK; ctx.lineWidth = locked ? 8 : 6; ctx.setLineDash(locked ? [] : [14, 9]); ctx.strokeRect(x0, y - LEVI.laneH, x1 - x0, LEVI.laneH * 2); ctx.strokeStyle = locked ? '#fff6a0' : '#fff0c8'; ctx.lineWidth = locked ? 4 : 3; ctx.strokeRect(x0, y - LEVI.laneH, x1 - x0, LEVI.laneH * 2); ctx.setLineDash([]);
      ctx.strokeStyle = '#fff6e0'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < 4; i++) { const x = a + f * (24 + i * 40 + (locked ? 20 : (this.st * 2) % 40)); ctx.beginPath(); ctx.moveTo(x - 9 * f, y - 12); ctx.lineTo(x + 8 * f, y); ctx.lineTo(x - 9 * f, y + 12); ctx.stroke(); }
      ctx.restore();
    }
    if (this.state === 'whirlWind' || this.state === 'whirl') {   // the pull: arrows on the deck flowing to the rail
      const k = this.state === 'whirl' ? 1 : Math.min(1, this.st / LEVI.whirlTele);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.28 * k; ctx.fillStyle = '#7aff9a'; ctx.fillRect(0, FLOOR_TOP + DEPTH - 34, W, 34);   // (the safe band: the front of the deck)
      for (let i = 0; i < 8; i++) {   // big bright arrows flowing DOWN the deck: walk this way
        const x = 70 + i * 118, ph = ((g.frame * 1.2 + i * 29) % 110) / 110, y = FLOOR_TOP + 18 + ph * 104, a = 0.95 * k * Math.min(1, ph * 4, (1 - ph) * 4);
        ctx.globalAlpha = a; ctx.strokeStyle = INK; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(x - 22, y - 16); ctx.lineTo(x, y); ctx.lineTo(x + 22, y - 16); ctx.stroke();
        ctx.strokeStyle = '#b8ff7a'; ctx.lineWidth = 6; ctx.stroke();
      }
      ctx.restore();
    }
  }
  /** the name card (the HUD layer: SIWorld.drawHud).  Its head is up from the fight's first frame -- only the coil rises, under the
   *  band -- so the card keeps to the side away from the head (full width over its face hid the eyes it names: the boss-card rule,
   *  painter 1's Kraken critic); full width only when neither side has room.  Fixed at its first frame: it never slides. */
  drawCard(ctx) {
    if (!this.cardT || this.game.cut) return;
    if (!this.cardSpan) {
      const hx = (this.head ? this.head.x : this.x) - this.game.camX, f = this.facing, o0 = hx - (f > 0 ? 170 : 120), o1 = hx + (f > 0 ? 120 : 170);
      this.cardSpan = W - o1 >= 520 ? [Math.max(0, Math.round(o1)), W] : o0 >= 520 ? [0, Math.min(W, Math.round(o0))] : [0, W];
    }
    ctx.save(); ctx.translate(0, -24); drawBossCard(ctx, { boss: { name: 'THE LEVIATHAN', title: 'The Serpent of the Night Sea' }, cardSpan: this.cardSpan }, this.cardT / LEVI.card); ctx.restore();
  }
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
