// Skull Island's own rules in a stage (docs/SKULL_ISLAND.md), on top of src/game.js's World -- and on top of Mystic Mountain's
// MMWorld, whose stories / hints / lines / shield launch it keeps (a stage with `si: true` in src/silevels.js gets one:
// World.begin -> siBegin; game.js reaches it as `world.mm`):
//   * the swinging LANTERNS of the cabin (a pendulum: bonks whoever is under it -- the sailors too: lure them!);
//   * the rolling BARRELS of the deck (a lane, a "!" at the edge first; jump it, roll through it, or smash it for a snack);
//   * the HOLDS: a hero caught by a sailor's lasso or a net is held, can't act, and gets free by MASHING attack, by a friend
//     hitting the sailor (the lasso) or the net, by a super, or (Shadow) by cutting the net at once; nobody is hurt for it;
//   * SCARLET: at half the captain's health she swings in on a rope (the drop-in moment) -- an AI helper for 1-3 players,
//     or her own seat when a free pad presses START ("P4: SCARLET swings in! Press START") -- and in the fight's last beat
//     she flicks the captain's cutlass away ("Drop your sword, Blunderbeard! ...Oh. You already did.");
//   * the mid-stage story hooks (the letter) and the stage's own hints and lines.
// The stage module's hooks (src/stages/sibluegull.js HOOKS and setters): setKraken(k) -- the tentacle rising at the rail after
// the conch --, setConch(k) -- the purple pulse --, each optional (a stand-in floor has none).
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { audio } from './audio-proxy.js';
import { LINES } from './story.js';
import { DoubloonChest } from './sisecrets.js';
import { baseOf, HEROES } from './heroes.js';
import { Actor, boxOf, overlaps } from './actors.js';
import { CHARS } from './chars.js';
import { MMWorld } from './mmworld.js';
import { Tentacle, StormLantern } from './sikraken.js';
import { LavaSpout, CalmCloud } from './sirage.js';
import { Root, GloomMist, Torch } from './siswamp.js';
import { clamp, lerp, TAU } from './rig.js';
import { holdWord } from './sitele.js';
import * as SIFX from './sifx.js';   // (Book 2's material particles: the FX agent's src/sifx.js)

const rnd = (a, b) => a + Math.random() * (b - a);
/** a centre x kept inside x 48..912 in SCREEN px through the transform (the world's punch-in zooms it) for something hw wide each side */
const safeCX = (ctx, x, hw) => { const m = ctx.getTransform(), k0 = (ctx.canvas?.width || 960) / 960, zs = Math.abs(m.a) / k0 || 1, ox = m.e / k0; return (Math.min(Math.max(ox + zs * x, 48 + hw * zs), Math.max(48 + hw * zs, 912 - hw * zs)) - ox) / zs; };
const H3 = (dodongo, ana, shadow = '...', scarlet) => ({ dodongo, ana, shadow, scarlet });
// (QAF: Book 2's hint rules -- SIWorld.hint / stepHintQ; src/mmworld.js's stay Book 1's)
const SI_HOLDK = new Set(['silasso', 'sinet', 'sitentgrab', 'sinap']);   // (a hold's own tip: at once, and it stays till the hold ends -- mmworld's SI_URGENT)
const SI_CUT = [[/^silevistuck/, 120, 90], [/^sikrakenstun/, 240, 90], [/^sigroggy/, 240, 90], [/^sirescue/, 300, 90], [/^sifirering$/, 300, 90], [/^sipalrope/, 300, 90], [/^sipalclash/, 240, 90], [/^sicrew$/, 240, 90], [/^sipat$/, 600, 90], [/^sikrakenpal$/, 600, 90],   // ("do it NOW": [key, ttl ~ the window, the live tip's frames before it cuts in])
  [/^sikrakenAtk_/, 210, 45], [/^sir?(slam|sweep|grab)$/, 210, 45], [/^sialpha2$/, 240, 45], [/^sicalm2$/, 240, 45], [/^sipal(calm|sad|fear|sloth)$/, 300, 45]];   // (QAF re-check R1: the first-encounter floor-marker tips, at that attack's first wind-up)
const cutOf = (key) => { for (const e of SI_CUT) if (e[0].test(key)) return e; return null; };
const SI_TTL = [[/^sikrakenR\d/, 300], [/_again$/, 300]];   // (round tips and nags: fresh for 5 s at most, else dropped -- R4)
const ttlOf = (key) => { for (const [re, t] of SI_TTL) if (re.test(key)) return t; return undefined; };
const SI_AFTER = (key) => key === 'sipat' || key === 'sikrakenpal' || /^sidoubloon/.test(key);   // (the only tips once the boss is calmed or beaten)
const SI_GAP = 150;   // (2.5 s with no box between two tips: QAF N10)

// ------------------------------------------------------------------------------------------------ the lines
// (Shadow only ever says "..."; Dodongo says "Anastasia", never "Ana"; Scarlet calls Dodongo "Snacks", Anastasia "wizard" and
//  Shadow "ninja"; nobody is hurt for real.  The captain's intro is the gate story, src/silevels.js gate / src/sistory.js.)
Object.assign(LINES.levelStart, {
  sikraken: ['hero', H3('The Gull is going DOWN!\nAnd there is something\nin the water...', 'Stay together. Whatever\nthat is, it is BIG.', '...', 'Landlubbers! This way!\nTo my ship!')],
  sibluegull: ['hero', H3('Okay. Lanterns, hammocks,\nand a LOT of sailors.', 'Stay close. This is\ntheir ship... for now.', '...', 'Hmph. A ship full of\nlandlubbers.')],
  sitreasure: ['hero', H3('The old Blue Gull!\nLook at ALL that gold!', 'The wreck... and the\ncrew came back for it.', '...', 'My old ship... Blunderbeard\nhid his treasure here?')],
  sipalace: ['hero', H3('The SKULL PALACE.\nIt is... really big.', 'Stay together.\nWhatever is inside.', '...', 'This is it, crew.\nMy father is in there.')],
});
Object.assign(LINES.bossIntro, {   // (only without the gate story)
  sitreasure: [['boss', 'Those are MY doubloons!\nA rematch, little heroes!'], ['hero', H3('Anastasia... he wants\nhis treasure back!', 'Then we will have to\nwin it. Again.', '...', 'Hmph. Round two,\nlandlubber!')]],
  sibluegull: [['boss', 'Nowhere left to run,\nlittle heroes!'], ['hero', H3('Anastasia... tell me\nyou have a plan.', "...I'm thinking!")]],
});
Object.assign(LINES.bossFreed, {
  sitreasure: [['hero', H3('We WON the treasure!\nCan we keep some?', 'The whole crew can\nshare it.', '...', 'Finders keepers,\nSnacks. Pirate rule.')]],
  sipalace: [['hero', H3('Is that... a FISH?!', 'A pufferfish?!\nOf all things.', '...', 'Well. That is one way\nto shrink a sorcerer.')]],
  sibluegull: [['hero', H3("Uh-oh. That did NOT\nsound like a seagull.", 'Everybody hold on...\nsomething is coming up!', '...')]],
});
/** the fights' lines: [who, text] -- who as World.speakerFor, or 'sca' = Scarlet (her player or her helper) */
export const SI_LINES = {
  scarIn: ['sca', 'Let them GO,\nBlunderbeard!'],
  rescue: ['dod', 'The scary pirate is...\nRESCUING us?!'],
  notBad: ['sca', 'Not bad, landlubbers!'],
  disarm: ['sca', 'Drop your sword,\nBlunderbeard!\n...Oh. You already did.'],
  conchLine: ['boss', "Oh, I don't think so.\nMy master gave me a\nlittle PRESENT!"],
  scarBehind: ['ana', 'Scarlet, behind you!'],
  lassoed: ['hero', H3('Hey! I am NOT a cow!', 'Let go of me!', '...', 'Oh, you did NOT.')],
  netted: ['ana', 'A NET?! Shadow!'],
  leap: ['hero', H3('Everybody JUMP!\nThe Gull is going DOWN!', 'Jump! Before she\nsinks!', '...', 'Jump, you landlubbers!\nMy ship is RIGHT there!')],
  eyesDone: ['hero', H3('Its eyes are dark!\nNow... that COLLAR!', 'It cannot see us!\nNow the COLLAR!', '...', 'Now the collar,\nlandlubbers!')],
  crack: ['hero', H3('It is CRACKING!', 'One more!\nThe gem is cracking!', '...', 'Again, ninja!\nAgain!')],
  singed: ['dod', '...Remind me never to\nmake you mad.'],
  palGone: ['dod', 'Your monsters are\ngone, Malachar!'],
  palKraken: ['hero', H3('KRAKEN! My friendly\nnoodle came!', 'The kraken!\nIt came to help!', '...', 'Ha! The big noodle\ncame! Nice!')],   // (the Cave's full calm: src/sisecrets.js)
  palEnough: ['boss', "I'll finish you\nMYSELF!"],
  palBlock: ['dod', 'Somebody needs to be a\ncalm little CLOUD.'],
  // the Leviathan (Stage 1's mini-boss, src/sileviathan.js): Dodongo and Anastasia only (Scarlet has not come yet; Shadow: "...")
  leviStuck: ['hero', H3('Ha! Its fangs are\nSTUCK! Get its HEAD!', 'Its fangs are STUCK!\nHit its HEAD!', '...')],
  leviWhirl: ['hero', H3('Whoa! The sea is\nPULLING us!', 'It wants us in\nthe SEA! Nope!', '...')],   // (Anastasia's line: not the hint's words)
  // the reworked Kraken (src/sikraken.js): a new round, the first stun, the collapse (the story then breaks the collar)
  krakenRound: ['hero', H3('MORE noodles?!', 'Here come more!\nBeat them ALL!', '...', 'Here come more,\nlandlubbers!')],
  krakenDizzy: ['hero', H3("It's DIZZY! Get\nits HEAD!", 'Now! Hit its head!', '...', 'Now, crew!\nHit it!')],
  krakenDownNoSha: ['hero', H3("It's DOWN!\nNow the COLLAR!", 'It is DOWN!\nThe COLLAR!', '...')],   // (no Shadow in the party: QA2)
  krakenDown: ['hero', H3("It's DOWN! Shadow...\nthe COLLAR!", 'Shadow! The\nCOLLAR!', '...', "Now's our chance,\ncrew!")],   // (the story that follows: Shadow breaks it)
  leviDone: ['hero', H3('BLUB yourself,\nbig noodle!', 'It is swimming away.\nGo HOME, big snake!', '...')],   // (the Swamp's fire ring, a moment after: Dodongo, a little singed)
};

// ------------------------------------------------------------------------------------------------ the rules
/** a Skull Island stage's rules (null for any other stage) */
export function siBegin(world) { return world.L?.si ? new SIWorld(world) : null; }

const MASH = { rope: 7, net: 6, tentacle: 8, nap: 5, swallow: 1e9, sad: 10, frozen: 6 }, HOLD_MAX = { rope: 190, net: 240, tentacle: 270, nap: 150, swallow: 1e9, sad: 270, frozen: 230 };   // (sad / frozen: the Skull Palace's Sadness and Fear -- src/sipalace.js: their own hints and rescues)   // (nap: the yawn fog's; swallow: the Sloth Beast's -- its rescue meter frees, src/sicell.js)

export class SIWorld extends MMWorld {
  constructor(world) {
    super(world);
    const g = world, L = g.L;
    this.holds = new Map();            // hero -> { by, kind: 'rope' | 'net', t, mash }
    this.scar = null; this.scarActor = null; this.scarletOpen = false;
    this.barrelT = 300; this.barrelN = 0;
    this.letterDone = !!L.midLetter && g.camX + 300 > L.midLetter.x + 100;   // (a stage entered past the letter -- a save point -- never plays it)
    (L.lanterns || []).forEach((l, i) => g.actors.push(new Lantern(g, l.x, l.y, i * 1.7)));
    g.siFury = false;   // (the Cave's full calm: src/sirage.js)
    if (L.doubloon) g.actors.push(new DoubloonChest(g, L.doubloon));   // (the island treasure: src/sisecrets.js)
    for (const h of L.hoards || []) g.actors.push(new DoubloonChest(g, { ...h, hoard: true }));   // (the Treasure Room's loot)
    if (L.id === 'sicave') { g.flags.hint_attack = true; g.flags.hint_special = true; }
    if (L.num && L.num !== 1) for (const k of ['attack', 'shoot', 'dodge', 'charge', 'cmelee', 'special']) g.flags['hint_' + k] = true;   // (QA2 round 2: SHOOT / DODGE tutorials 45 s into Malachar)   // (a stage after the first never opens with the attack tutorial -- the level-6 test link at the final boss: QA2)   // (the Cave teaches the CALM way in its own hints: no generic 'tap it 4 times for a combo' over them)
    this.stage()?.setKraken?.(0); this.stage()?.setConch?.(0); this.stage()?.setBehindRail?.(null);   // (setBehindRail: a mini-boss's art behind the rail -- the Leviathan sets its own)
    this.leapDone = !L.leap || g.camX + 500 > L.leap.x + 100;   // (entered past the leap -- a save point -- never plays it)
    this.doorDone = !L.door || g.camX + 500 > L.door.x + 100; this.doorGo = null;   // (the palace's gate: entered past the door -- a save point -- it is open)
    this.stage()?.setDoor?.(this.doorDone ? 1 : 0);
    this.leapGo = null; this.tentT = 200; this.lanternsOn = false; this.lanternT = 60; this.tentaSaid = new Set();
    this.stage()?.setStorm?.(L.storm ?? 0.6); this.stage()?.setShake?.(0);
    // the Swamp of Despair (stage 3b): torches to light your hits with, a drifting gloom, knee-deep water
    (L.torches || []).forEach((t) => g.actors.push(new Torch(g, t.x, t.y)));
    this.mistT = 240; this.stage()?.setGloom?.(0);
    for (const p of g.players) { p.slowK = 1; p.torchT = 0; p.gloomT = 0; p.gloomImmune = 0; p.wading = 0; p.gooT = 0; p.sleepy = 0; }
    this.stage()?.setFog?.(0);
  }
  stage() { return this.g.stage; }
  /** the shield launch (a partner rolling into Dodongo) is Mystic Mountain's boss mechanic: a Skull Island stage turns it on with `launch: true` (the Kraken, phase 2) */
  /** the stage's ambient bed (the composer's src/audio.js ambience: de-duplicated, so a call a frame costs nothing; its ttl fades it out by itself
   *  whenever the world stops stepping -- a story, the clear card, the title, the pause menu).  The Gull: the cabin + stairs, then the deck + fog */
  stepAmbience() {
    const g = this.g, L = g.L || {}, id = L.id;
    let bed = { sikraken: 'storm_deck', sitreasure: 'gull_deck', sicave: 'cave', siswamp: 'swamp', sicell: 'cell', sipalace: 'palace' }[id] || null;
    if (id === 'sibluegull') { const cx = g.camX + W / 2, sec = (L.sections || []).find((s) => cx >= s.x0 && cx < s.x1); bed = sec && (sec.id === 'cabin' || sec.id === 'stairs') ? 'gull_cabin' : 'gull_deck'; }
    audio.ambience?.(bed, { ttl: 0.6 });
  }
  stepLaunch() { if (!this.g.L.launch) return; const B = this.g.boss; if (B && B.usesLaunch && B.state !== 'collar') return; super.stepLaunch(); }

  /** (QAF) Book 2's hint: once the boss is calmed / beaten only the pat's and the doubloons' tips (M-B); a hold's tip at once; a "do it NOW"
   *  tip cuts in once the live one has been up 1.5 s (N3); any other forced tip waits in the queue while one is up or for the 1.5 s breath
   *  after it (N10).  Popped from the queue (hintNow): MMWorld's as ever. */
  hint(key, text, life = 330, force = false, opts = null) {
    const g = this.g;
    if (!g.L?.si) return super.hint(key, text, life, force, opts);
    if (this.doneBoss && this.doneBoss === g.boss && !SI_AFTER(key)) return false;
    if (!force && !this.hintNow && !g.hint && g.frame - (this.hintLastF ?? -1e9) < SI_GAP) return false;   // (an unforced tip waits for the breath too)
    if (force && !this.hintNow && !g.cut && !SI_HOLDK.has(key)) {
      const cur = g.hint, ce = cutOf(key), ttl = ce ? ce[1] : 0, minUp = ce ? ce[2] : 90, cut = !!ce || !!opts?.cut;
      if (cur && cur.key === key) return false;
      const wait = cur ? (SI_HOLDK.has(cur.key) || !cut || cur.t < minUp) : (!cut && g.frame - (this.hintLastF ?? -1e9) < SI_GAP);
      if (wait) {
        const Q = g.hintQ || (g.hintQ = []), i = Q.findIndex((h) => h.key === key); if (i >= 0) Q.splice(i, 1);
        const e = { key, text, life, at: g.frame, ttl: opts?.ttl ?? (ttl || ttlOf(key)), cut, minUp };
        if (cut || opts?.front) { const j = Q.findIndex((h) => !h.cut); Q.splice(j < 0 ? Q.length : j, 0, e); } else Q.push(e);
        return true;
      }
      if (cur && cut) {   // (cuts in: the live tip's beats left come after it -- for 6 s at most)
        let ok; this.hintNow = true; try { ok = super.hint(key, text, life, true, opts); } finally { this.hintNow = false; }
        const Q = g.hintQ; if (Q && Q[0] && Q[0].key === cur.key) Q[0].ttl = 360;
        return ok;
      }
    }
    if (force && !this.hintNow && SI_HOLDK.has(key) && g.hint && g.hint.key !== key) {   // (a hold's tip at once: the tip it cuts comes back for 6 s at most -- never if it had 1.5 s up)
      const was = g.hint, ok = super.hint(key, text, life, force, opts), Q = g.hintQ;
      if (Q && Q[0] && Q[0].key === was.key) { if (was.t >= 90 && !was.next?.length) Q.shift(); else Q[0].ttl = 360; }
      return ok;
    }
    return super.hint(key, text, life, force, opts);
  }
  /** (QAF) Book 2's queue step: stale ones dropped; the next one once the live tip and all its beats are done and the box has had its
   *  breath (N2, N10) -- a "do it NOW" one as soon as the live tip has been up 1.5 s (N3); never over a hold's tip */
  stepHintQ() {
    const g = this.g, Q = g.hintQ;
    if (!g.L?.si) return super.stepHintQ();
    for (let i = Q.length - 1; i >= 0; i--) if (g.frame - Q[i].at > (Q[i].ttl ?? 1200)) Q.splice(i, 1);
    if (!Q.length || g.cut) return;
    const cur = g.hint;
    let k = 0;
    if (cur) { if (SI_HOLDK.has(cur.key)) return; k = Q.findIndex((e) => e.cut && e.key !== cur.key && cur.t >= (e.minUp ?? 90)); if (k < 0) return; }
    else if (!Q[0].cut && g.frame - (this.hintLastF ?? -1e9) < SI_GAP) { k = Q.findIndex((e) => e.cut); if (k < 0) return; }
    const h = Q.splice(k, 1)[0];
    this.hintNow = true; try { super.hint(h.key, h.text, h.life, true); } finally { this.hintNow = false; }
  }
  /** (QAF re-check R3) Book 2: a tip cleared within its first second stays that second (no 1-68 f flash), then goes with its beats and
   *  queued copies; a hold's tip goes at once */
  clearHint(...keys) {
    const g = this.g, h = g.hint;
    if (g.L?.si && h && keys.includes(h.key) && h.t < 60 && !SI_HOLDK.has(h.key)) {
      if (g.hintQ) g.hintQ = g.hintQ.filter((q) => !keys.includes(q.key));
      h.next = []; h.life = Math.min(h.life, 60); return;
    }
    return super.clearHint(...keys);
  }
  /** after the actors' update, every frame */
  step() {
    super.step();
    const g = this.g;
    this.stepAmbience();
    if (!g.cut && !g.cutin) { this.stepLetter(); this.stepBarrels(); this.stepHints(); this.stepTentacles(); this.stepLanterns(); this.stepMist(); }
    this.stepSwamp(); this.stepCell();
    this.stepLeap();
    this.stepDoor();
    this.stepHolds();
    this.safeArea();
    const B = g.boss;
    if (g.hint) this.hintLastF = g.frame;
    if (B && B !== this.doneBoss && (B.siDone ?? (!B.alive || B.hp <= 0))) {   // (QAF M-B: calmed or beaten -- its queued and live tips go)
      this.doneBoss = B;
      if (g.hintQ) g.hintQ.length = 0;
      if (g.hint && !SI_AFTER(g.hint.key)) { g.hint = null; try { delete document.body.dataset.hint; } catch { /* (no DOM) */ } }
    }
    if (B && ((B.disarmSeq && !B.rematch) || B.state === 'shock' || B.state === 'clash')) { g.hint = null; g.hintAt = g.frame; try { delete document.body.dataset.hint; } catch { /* (no DOM) */ } }   // (the beats' own show: no tip over them, nor right after)
    if (this.scarDelay > 0 && !g.cut && --this.scarDelay === 0) { g.boss?.onScarletLanded?.(); this.line('scarIn'); }
    if (this.scarActor && this.scarActor.gone && !this.scarPlayer) this.scarActor = null;
  }

  // ---------------------------------------------------------------- the letter (a story in the middle of the stage)
  stepLetter() {
    const g = this.g, L = g.L.midLetter;
    if (!L || this.letterDone || g.fighting) return;
    const lead = g.players.filter((p) => !p.out).reduce((m, p) => Math.max(m, p.x), 0);
    if (lead >= L.x) { this.letterDone = true; this.story(L.id); }
  }

  // ---------------------------------------------------------------- the holds (a lasso, a net)
  /** the hero `by` (a sailor) holds, if any */
  heldBy(by) { for (const [p, H] of this.holds) if (H.by === by) return p; return null; }
  /** a hold starts on hero p (false: not now -- already held, down, rolling through it) */
  hold(p, { by, kind }) {
    const g = this.g;
    if (this.holds.has(p) || !p.hittable || p.out || g.cut || g.cutin) return false;
    p.dropCarry?.(); p.stopCharge?.();
    if (p.shot?.beam) { p.shot.beam.gone = true; p.shot.beam = null; }
    p.reset('hurt'); p.stun = 99999; p.vx = p.vy = p.vz = 0; p.z = 0; p.hurtAlt = false; p.bufA = p.bufJ = p.bufS = p.bufP = p.bufD = 0;
    this.holds.set(p, { by, kind, t: 0, mash: 0, t0: g.frame, press0: p.siPress || 0 });   // (t: wall frames since it began; press0: src/game.js siHitstopBudget's count -- QA2 M1)
    const solo = !g.players.some((q) => q !== p && !q.out && q.alive);   // (alone: the hints never send a kid looking for a friend who is not there)
    if (kind === 'rope') this.hint('silasso', `MASH ${this.keyName('attack', p)} to break free!${solo ? '' : ' || A friend can bonk the sailor!'}`, 300, true);
    else if (kind === 'tentacle') this.hint('sitentgrab', by && by.holdText ? by.holdText(this.keyName('attack', p), solo) : `A tentacle has you! MASH ${this.keyName('attack', p)}!${solo ? '' : ' || Or a friend bonks the tentacle!'}`, 300, true);
    else if (kind === 'nap') this.hint('sinap', `ZZZ... asleep! MASH ${this.keyName('attack', p)} to wake up! || Keep MOVING to stay awake!`, 300, true);
    else if (kind === 'swallow' || kind === 'sad' || kind === 'frozen') { /* (src/sicell.js, src/sipalace.js: their own hints) */ }
    else this.hint('sinet', `MASH ${this.keyName('attack', p)} to get out! || Or hit the net to cut it!`, 300, true);
    return true;
  }
  /** (TV safe area, the FX agent's final critic) while an arena holds the camera, a free hero stays 64 px in from each edge -- its body
   *  inside x 48..912; held heroes, scripted beats and cut-ins are left alone */
  safeArea() {
    const g = this.g;
    if (!g.fighting || g.cut || g.cutin || this.leapGo || this.doorGo) return;
    for (const p of g.players) {
      if (p.out || !p.alive || this.holds.has(p) || ['cutscene', 'portal', 'special'].includes(p.state)) continue;
      p.x = clamp(p.x, g.camX + 64, g.camX + W - 64);
    }
  }
  /** a hold ended: the hero is free (a moment of grace) */
  release(p) {
    const H = this.holds.get(p);
    if (!H) return;
    this.holds.delete(p);
    if (H.by && H.by.onHoldEnd) H.by.onHoldEnd(p, H);   // (Skull Palace: the Sadness cloud counts a comfort)
    if (H.kind === 'nap') p.sleepy = 0.22;
    if (p.state === 'hurt' && p.stun >= 90000) { p.stun = 0; p.set('idle'); }
    p.inv = Math.max(p.inv, 45);
    this.clearHint('silasso', 'sinet', 'sitentgrab');
  }
  stepHolds() {
    const g = this.g;
    for (const [p, H] of [...this.holds]) {
      H.t = g.frame - (H.t0 ?? g.frame);   // (wall time: a co-op hit-pause no longer stretches a hold -- QA2 M1)
      const by = H.by;
      let free = g.cut || g.cutin || p.out || !p.alive || p.state !== 'hurt' || p.stun < 90000;   // (hit again, a super, a knock-down: the hold ends by itself)
      if (H.kind === 'rope') {   // a friend's hit on his sailor (or any knock-over): the rope goes slack
        if (!by || by.gone || !by.alive || ['hurt', 'fly', 'down', 'dying', 'getup'].includes(by.state)) { free = true; if (by && !by.gone) holdWord(g, p, 'FREE!'); }
        else if (!free) {   // (reeled in, a step a frame, until he is within arm's reach)
          const dx = by.x - p.x;
          if (Math.abs(dx) > 70) p.x += Math.sign(dx) * 1.3;
          p.y += clamp(by.y - p.y, -0.7, 0.7);
        }
      } else if (H.kind === 'tentacle') {   // (a friend's bonk makes it let go; it lets go by itself, too)
        if (!by || by.gone || !by.alive || by.phase === 'sink' || by.phase === 'gone') free = true;
      } else if (H.kind === 'net') {
        if (!by || by.gone || !by.alive || by.phase === 'cut') free = true;
        else if (baseOf(p.heroId) === 'shadow' && H.t >= 14) { by.cut(p); free = true; }   // (his short sword: SNIP)
      }
      if (!free) {
        const np = (p.siPress || 0) - (H.press0 ?? (p.siPress || 0)); H.press0 = p.siPress || 0;   // (every press counts, those made during a hit-pause too -- QA2 M1)
        if (np > 0) { H.mash += np; g.fx.spark(p.x, p.y, 70 + (H.mash % 3) * 20, false); audio.sfx('hit_light', { pitch: 1.2 + H.mash * 0.05, vol: 0.4 }); }
        if (H.mash >= MASH[H.kind] || H.t > HOLD_MAX[H.kind]) {
          free = true;
          if (H.kind === 'net') by?.cut?.(p);
          else if (H.kind === 'tentacle') { by?.retreat?.(false); if (by && !by.gone) holdWord(g, p, 'FREE!'); p.z = 0; }
          else if (H.kind === 'rope' && by && !by.gone) { by.reset('hurt'); by.stun = 30; g.fx.word(p.x, p.y, 150, true, 'SNAP!'); }
        }
      }
      if (free) this.release(p);
    }
  }

  // ---------------------------------------------------------------- the Skull Palace's gate (docs/SKULL_ISLAND.md, stage 4)
  /** the Sun Key into the DOOR's round sun slot (L.door: { x, wallX, after, id }) -- once the guards of the gate are beaten and a hero reaches `x`, everyone steps up, the story plays
   * (the key goes in, KA-CHUNK), the slot shines and the great door swings open; until then nobody walks past `wallX` */
  stepDoor() {
    const g = this.g, D = g.L.door;
    if (!D) return;
    const ps = g.players.filter((p) => !p.out);
    if (this.doorGo) { this.doorStep(); return; }
    if (this.doorDone) { this.stage()?.setDoor?.(1); return; }
    for (const p of ps) p.x = Math.min(p.x, D.wallX);
    this.herdFoes(D.wallX);
    this.stage()?.setDoor?.(0); this.stage()?.setSlot?.(0, 0, 0);
    if (!g.fighting && !g.cut && !g.cutin && g.arenaIdx >= (D.after ?? 0) && ps.some((p) => p.x >= D.x)) this.startDoor();
  }
  /** (QA2 B4) while a wall stands, a foe on screen past it drifts back to within 40 px of it: no sailor lassoes from where no sword reaches */
  herdFoes(wallX) {
    const g = this.g;
    for (const a of g.actors) if (a.team === 'foe' && a.alive && !a.boss && a.x > wallX + 40 && a.x < g.camX + W) a.x = Math.max(wallX + 40, a.x - 2.5);
  }
  startDoor() {
    const g = this.g, D = g.L.door, ps = g.players.filter((p) => !p.out);
    this.doorGo = { t: 0, phase: 'walk', from: new Map(), to: new Map() };
    ps.forEach((p, i) => {
      this.doorGo.from.set(p, { x: p.x, y: p.y });
      this.doorGo.to.set(p, { x: D.wallX - 30 - (i % 2) * 60 - Math.floor(i / 2) * 34, y: clamp(30 + i * 30, 14, DEPTH - 14) });
      p.ctl = false; p.autoDx = p.autoDy = 0; p.dropCarry?.(); p.stopCharge?.(); p.reset('cutscene'); p.vx = p.vy = p.vz = 0;
    });
    g.hint = null; g.hintAt = g.frame;
  }
  doorStep() {
    const g = this.g, S = this.doorGo, D = g.L.door, st = this.stage();
    S.t++;
    if (S.phase === 'walk') {   // the heroes step up to the door
      const u = Math.min(1, S.t / 46), e = u * u * (3 - 2 * u);
      for (const [p, a] of S.from) { if (p.out) continue; const b = S.to.get(p); p.x = a.x + (b.x - a.x) * e; p.y = a.y + (b.y - a.y) * e; p.z = 0; if (p.state !== 'cutscene') p.reset('cutscene'); p.cutPose = u < 1 ? 'walk' : 'idle'; p.cutPoseArg = u < 1 ? (S.t / 22) % 1 : undefined; p.facing = 1; p.inv = Math.max(p.inv, 3); }
      if (S.t >= 54) { S.phase = 'story'; S.t = 0; this.story(D.id, () => { S.phase = 'key'; S.t = 0; }); }
    } else if (S.phase === 'story') {
      // (the story runs over the stage: when it was seen -- a restart -- its callback has already moved on)
    } else if (S.phase === 'key') {   // the key sits in its slot, turns, shines
      for (const p of g.players) if (!p.out) { p.inv = Math.max(p.inv, 3); if (p.state !== 'cutscene') p.reset('cutscene'); p.cutPose = 'idle'; p.cutPoseArg = undefined; }
      if (S.t === 2) { audio.sfx('break', { pitch: 0.5, vol: 0.8 }); g.shake = Math.max(g.shake, 5); g.fx.word(D.wallX + 40, 40, 190, true, 'KA-CHUNK!'); }
      st?.setSlot?.(1, Math.min(1, S.t / 40), Math.min(1, S.t / 40));
      if (S.t >= 46) { S.phase = 'open'; S.t = 0; audio.sfx('knockdown', { pitch: 0.5, vol: 0.8 }); }
    } else if (S.phase === 'open') {   // the great door swings open
      const u = Math.min(1, S.t / 110), e = u * u * (3 - 2 * u);
      st?.setDoor?.(e); st?.setSlot?.(1, Math.max(0, 1 - S.t / 60), 1); g.shake = Math.max(g.shake, 3);
      if (S.t % 18 === 4) g.fx.dust?.(D.wallX + 60, 30, 3, 40);
      for (const p of g.players) if (!p.out) { p.inv = Math.max(p.inv, 3); if (p.state !== 'cutscene') p.reset('cutscene'); p.cutPose = 'idle'; p.cutPoseArg = undefined; }
      if (S.t >= 126) {
        for (const p of g.players) if (!p.out) { p.cutPose = null; p.cutPoseArg = undefined; p.set('idle'); p.ctl = true; p.inv = Math.max(p.inv, 40); }
        this.doorGo = null; this.doorDone = true; st?.setDoor?.(1); st?.setSlot?.(1, 0, 1);
        g.fx.label(g.camX + W / 2, 60, 150, 'THE GATE IS OPEN!', '#ffe066', 34, 90); g.goT = Math.max(g.goT || 0, 240);
      }
    }
  }

  // ---------------------------------------------------------------- the Kraken's stage (docs/SKULL_ISLAND.md, stage 2)
  /** the scripted LEAP from the sinking Gull to the Scarlet Dawn (L.leap: { x, wallX, minX, toX, after }) -- once the Gull's arenas are won and a
   * hero reaches `x`, everyone jumps together across the gap; until then nobody may walk off the stern, after it nobody goes back */
  stepLeap() {
    const g = this.g, LP = g.L.leap;
    if (!LP) return;
    const ps = g.players.filter((p) => !p.out);
    if (this.leapGo) { this.leapStep(); return; }
    if (!this.leapDone) {
      for (const p of ps) p.x = Math.min(p.x, LP.wallX);
      this.herdFoes(LP.wallX);
      if (!g.fighting && !g.cut && !g.cutin && g.arenaIdx >= (LP.after ?? 0) && ps.some((p) => p.x >= LP.x)) this.startLeap();
    } else for (const p of ps) p.x = Math.max(p.x, LP.minX);
    const lead = ps.reduce((m, p) => Math.max(m, p.x), 0);
    this.stage()?.setSink?.(clamp(lead / LP.x, 0, 1));
  }
  startLeap() {
    const g = this.g, LP = g.L.leap, ps = g.players.filter((p) => !p.out);
    this.leapGo = { t: 0, T: 74, from: new Map(), to: new Map() };
    ps.forEach((p, i) => {
      this.leapGo.from.set(p, { x: p.x, y: p.y });
      this.leapGo.to.set(p, { x: LP.toX + (i % 2) * 44 + Math.floor(i / 2) * 30, y: clamp(30 + i * 28, 14, DEPTH - 14) });
      p.ctl = false; p.autoDx = p.autoDy = 0; p.dropCarry?.(); p.stopCharge?.(); p.reset?.('cutscene'); p.vx = p.vy = p.vz = 0; p.facing = 1;
    });
    g.hint = null; g.hintAt = g.frame;
    this.line('leap'); audio.sfx('jump', { pitch: 0.9 }); g.shake = Math.max(g.shake, 5);
  }
  leapStep() {
    const g = this.g, S = this.leapGo, u = Math.min(1, ++S.t / S.T), e = u * u * (3 - 2 * u);
    for (const [p, a] of S.from) {
      if (p.out) continue;
      const b = S.to.get(p);
      p.x = a.x + (b.x - a.x) * e; p.y = a.y + (b.y - a.y) * e; p.z = 150 * Math.sin(Math.PI * u) * (0.9 + 0.1 * Math.sin(p.slot));
      if (p.state !== 'cutscene') p.set('cutscene');
      p.cutPose = u < 0.5 ? 'rise' : 'fall'; p.cutPoseArg = 0; p.vx = p.vy = 0; p.inv = Math.max(p.inv, 40); p.facing = 1;
    }
    if (S.t % 6 === 1) g.fx.dust(g.players[0].x, g.players[0].y, 2, 20);
    if (S.t >= S.T) {
      for (const [p] of S.from) { if (p.out) continue; p.z = 0; p.cutPose = null; p.cutPoseArg = undefined; p.landT = 7; p.set('land'); p.ctl = true;   // (landT: a hero who never jumped had none -- 'land' for ever, a NaN pose: QA3 T1)
 p.inv = Math.max(p.inv, 50); g.fx.dust(p.x, p.y, 5, 30); }
      this.leapGo = null; this.leapDone = true;
      g.shake = Math.max(g.shake, 8); audio.sfx('land', { vol: 1 });
      g.fx.label(g.camX + W / 2, 60, 150, 'WELCOME ABOARD!', '#ffe066', 34, 80);
    }
  }
  /** a stage's own tentacles in an arena with `tent: { kinds, every: [min, max], max }` (the boss's are the Kraken's) */
  stepTentacles() {
    const g = this.g, def = g.L.arenas[g.arenaIdx];
    if (!def?.tent || !g.fighting || def.boss) { this.tentT = Math.max(this.tentT, 150); return; }
    if (--this.tentT > 0) return;
    const ps = g.players.filter((p) => !p.out && p.alive);
    if (!ps.length) return;
    if (g.actors.filter((a) => (a instanceof Tentacle || a instanceof LavaSpout) && a.alive).length >= (def.tent.max || 1)) { this.tentT = 50; return; }
    const target = ps[(Math.random() * ps.length) | 0];
    let kind = def.tent.kinds[(Math.random() * def.tent.kinds.length) | 0];
    if (kind === 'grab' && this.holds.size) kind = 'slam';
    let t;
    if (kind === 'spout') t = new LavaSpout(g, clamp(target.x + target.vx * 14, g.camX + 70, g.camX + W - 70), clamp(target.y + target.vy * 8, 16, DEPTH - 16));
    else if (kind === 'sweep') t = new (def.tent.root ? Root : Tentacle)(g, 'sweep', 0, clamp(target.y + rnd(-14, 14), 14, DEPTH - 14), null, Math.random() < 0.5 ? 1 : -1);
    else { t = new (def.tent.root ? Root : Tentacle)(g, kind, clamp(target.x + target.vx * 14, g.camX + 70, g.camX + W - 70), clamp(target.y + target.vy * 8, 16, DEPTH - 16), null); if (kind === 'grab') t.target = target; if (kind === 'slam' && Math.random() < 0.4) t.imp = true; }
    g.actors.push(t);
    audio.sfx('wind_gust', { pitch: 0.55, vol: 0.5 });
    this.tentT = rnd(...(def.tent.every || [220, 320]));
  }
  /** the first time each kind of tentacle shows its warning: what it means */
  tentaHint(kind) {
    if (this.tentaSaid.has(kind)) return;
    if (this.g.hint && /^sikeyes|^sieyes/.test(this.g.hint.key || '')) return;   // (the eyes hint is first: a later tentacle of the kind says its piece)
    this.tentaSaid.add(kind);
    const T = { root_slam: ['sirslam', 'RED ring in the mud = a ROOT! Step away!'], root_sweep: ['sirsweep', 'PINK lane = a branch SWEEP! JUMP or ROLL!'], root_grab: ['sirgrab', 'PURPLE ring = a GRAB! || Friends: bonk the root!'], slam: ['sislam', 'RED ring on the deck = a TENTACLE! Step away!'], sweep: ['sisweep', 'PINK lane = an arm SWEEP! JUMP or ROLL!'], grab: ['sigrab', 'PURPLE ring = a GRAB! || Friends: hit the tentacle!'], spout: ['sispout', 'ORANGE ring = LAVA! Step away!'] }[kind];
    if (T) this.hint(T[0], T[1], 300, true, { ttl: 300 });   // (fresh for 5 s: QA2)
  }
  /** the Kraken fight asks for lanterns on the deck (the light, for a party with no Anastasia) */
  krakenLanterns(on) { this.lanternsOn = !!on; if (on) this.lanternT = 20; }
  stepLanterns() {
    const g = this.g;
    if (!this.lanternsOn || !g.fighting || g.cut || g.cutin) return;
    if (--this.lanternT > 0) return;
    if (g.actors.filter((a) => a instanceof StormLantern && !a.gone).length >= 2) { this.lanternT = 120; return; }
    const l = new StormLantern(g, g.camX + rnd(160, W - 160), rnd(26, DEPTH - 26)); l.z = 260;
    g.actors.push(l); g.fx.label(l.x, l.y, 90, 'LANTERN!', '#ffe066', 26, 60);
    this.lanternT = 380;
  }
  // ---------------------------------------------------------------- the Swamp of Despair (stage 3b): friends and fire
  /** every frame: the water slows, the gloom droops, a torch burns; Player.slowK (read by Player.update) is the product */
  stepSwamp() {
    const g = this.g, L = g.L, st = this.stage(), ps = g.players.filter((p) => !p.out && p.alive);
    for (const p of g.players) {
      if (p.out) { p.slowK = 1; continue; }
      let k = 1;
      const wade = L.water && st && st.waterAt && !g.cut ? st.waterAt(p.x) : 0;
      p.wading = wade > 0.04 && p.z < 8 ? wade : 0;
      if (p.wading) k *= 1 - (1 - (st.wadeK || 0.66)) * wade;
      if (p.gloomT > 0 && !g.cut) {
        p.gloomT--; k *= 0.72;
        const fr = ps.find((q) => q !== p && Math.abs(q.x - p.x) < 100 && Math.abs(q.y - p.y) < 34);
        if (fr) { p.gloomFriend = (p.gloomFriend || 0) + 1; if (p.gloomFriend >= 42) this.cheer(p, fr); } else p.gloomFriend = Math.max(0, (p.gloomFriend || 0) - 2);
        if (p.gloomT === 0) { g.fx.label(p.x, p.y, 170, 'PHEW!', '#bff0ff', 26, 50); p.gloomImmune = 300; }
      } else if (p.gloomT > 0) k *= 0.72;
      if (p.gloomImmune > 0) p.gloomImmune--;
      if (p.torchT > 0 && !g.cut) {
        p.torchT--;
        if (p.torchT % 5 === 0) g.fx.flames?.(p.x + p.facing * 26, p.y, 64, 1, { scale: 0.5 });
        if (p.torchT === 0) g.fx.label(p.x, p.y, 170, 'TORCH OUT!', '#ffcf8a', 24, 50);
      }
      p.slowK = k;
    }
    if (L.swamp) st?.setGloom?.(Math.min(1, g.players.filter((p) => !p.out && p.gloomT > 0).length / 2));
  }
  /** a friend beside a gloomy hero: "I believe in you!" -- the gloom lifts */
  cheer(p, friend) {
    const g = this.g;
    p.gloomT = 0; p.gloomFriend = 0; p.gloomImmune = 600;
    g.say(friend, baseOf(friend.heroId) === 'shadow' ? '...' : 'I believe in you!', 120, { villain: false });
    g.fx.label(p.x, p.y, 180, 'CHEERED UP!', '#ffd0e0', 26, 60); g.fx.hearts?.(p.x, p.y); g.fx.spark?.(p.x, p.y, 90, false, 'gold'); audio.sfx('gloom_cheer');
  }
  /** a gloom cloud's rain on hero p (false: already gloomy, or just cheered up) */
  gloomify(p) {
    const g = this.g;
    if (p.gloomT > 0 || p.gloomImmune > 0 || p.out || g.cut) return false;
    p.gloomT = g.players.filter((q) => !q.out && q.alive).length > 1 ? 900 : 360; p.gloomFriend = 0;
    g.fx.label(p.x, p.y, 180, 'GLOOMY...', '#9fb4c0', 26, 60); audio.sfx('gloom_sad');
    return true;
  }
  gloomHint() {
    const solo = this.g.players.filter((q) => !q.out).length < 2;
    this.hint('sigloom', solo ? 'A GLOOM cloud! Its rain makes you DROOPY. || Keep going: it soon wears off!' : 'A GLOOM cloud! Its rain makes heroes DROOPY. || Stand close to a droopy friend: cheer them up!', 420, true);
  }
  torchHint() { this.hint('sitorch', 'TORCH! Your hits are FIRE for a while! || Swamp trees RUN from fire!', 300); }
  /** the arenas' own gloom clouds (`mist: { every: [min, max], max }`) */
  stepMist() {
    const g = this.g, def = g.L.arenas[g.arenaIdx];
    if (!def?.mist || !g.fighting || def.boss) { this.mistT = Math.max(this.mistT || 0, 200); return; }
    if (--this.mistT > 0) return;
    if (g.actors.filter((a) => a instanceof GloomMist && !a.gone).length >= (def.mist.max || 1)) { this.mistT = 90; return; }
    const side = Math.random() < 0.5 ? -1 : 1;
    g.actors.push(new GloomMist(g, side < 0 ? g.camX + W + 60 : g.camX - 60, rnd(40, 110), -side));
    this.mistT = rnd(...(def.mist.every || [420, 560]));
  }
  /** the water round a wading hero's legs, a droopy cloud over a gloomy one, a torch's glow */
  drawSwampOver(ctx) {
    const g = this.g;
    for (const p of g.players) {
      if (p.out) continue;
      if (p.wading > 0.04 && p.z < 8) {
        const sx = p.sx, sy = p.sy, k = p.wading, t = g.time;
        ctx.save(); ctx.globalAlpha = 0.9 * k;
        for (let i = 0; i < 2; i++) { const u = ((t * 0.8 + i * 0.5 + p.slot * 0.2) % 1); ctx.strokeStyle = `rgba(170,220,200,${0.55 * (1 - u)})`; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(sx, sy + 1, 18 + u * 22, 5 + u * 7, 0, 0, TAU); ctx.stroke(); }
        // the water round the legs: a soft murky ellipse at knee height (no straight sides), a pale rim that ripples, a darker ring at the feet
        const ky = sy - 17, wob = Math.sin(t * 5 + p.slot) * 1.2;
        const gr = ctx.createRadialGradient(sx, ky, 4, sx, ky, 40); gr.addColorStop(0, 'rgba(22,70,66,0.85)'); gr.addColorStop(0.7, 'rgba(24,70,66,0.72)'); gr.addColorStop(1, 'rgba(22,56,52,0)');
        ctx.save(); ctx.translate(sx, ky); ctx.scale(1, 0.42); ctx.translate(-sx, -ky); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, ky, 40, 0, TAU); ctx.fill(); ctx.restore();
        ctx.strokeStyle = 'rgba(200,240,222,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, ky + wob * 0.3, 27 + wob, 8, 0, 0.15, Math.PI - 0.15); ctx.stroke();
        ctx.strokeStyle = 'rgba(200,240,222,0.35)'; ctx.beginPath(); ctx.ellipse(sx, ky + 3, 33, 10, 0, Math.PI + 0.3, TAU - 0.3); ctx.stroke();
        ctx.restore();
      }
      if (p.gloomT > 0) {   // a small dark cloud over the head, rain, and the cure's hearts while a friend is near
        const sx = p.sx, sy = p.sy - 150 + Math.sin(g.time * 3 + p.slot) * 3;
        ctx.save(); ctx.translate(sx, sy);
        for (let i = 0; i < 5; i++) { const u = ((g.time * 1.3 + i * 0.2) % 1); ctx.strokeStyle = 'rgba(150,185,200,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14 + i * 7, 12 + u * 60); ctx.lineTo(-14.8 + i * 7, 18 + u * 60); ctx.stroke(); }
        ctx.fillStyle = '#6c7e82'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath(); for (const [x, y, r] of [[-16, 2, 11], [0, -5, 15], [16, 0, 12], [0, 5, 14]]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#6c7e82'; ctx.beginPath(); for (const [x, y, r] of [[-16, 2, 10], [0, -5, 14], [16, 0, 11], [0, 5, 13]]) { ctx.moveTo(x + r - 1, y); ctx.arc(x, y, r - 1, 0, TAU); } ctx.fill();
        ctx.fillStyle = INK; for (const ex of [-6, 6]) { ctx.beginPath(); ctx.ellipse(ex, 2, 1.8, 2.8, 0, 0, TAU); ctx.fill(); } ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 11, 4, Math.PI + 0.3, TAU - 0.3); ctx.stroke();
        const f = Math.min(1, (p.gloomFriend || 0) / 42);
        if (f > 0.05) { ctx.fillStyle = INK; ctx.fillRect(-26, -30, 52, 9); ctx.fillStyle = '#ffd0e0'; ctx.fillRect(-24, -28, 48 * f, 5); }
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------- the Cell of Sloth (stage 3c): sleepy and sticky
  /** every frame (after stepSwamp: it multiplies Player.slowK): the yawn fog makes a STILL hero sleepy (slower, then a nap), goo slows, a roll shakes it off */
  stepCell() {
    const g = this.g, L = g.L, st = this.stage();
    if (!L.cell) return;
    let sum = 0, n = 0;
    for (const p of g.players) {
      if (p.out || !p.alive) continue;
      if (p.gooT > 0 && !g.cut) {
        p.gooT--; p.slowK *= 0.55;
        if (p.state === 'dodge') { p.gooT = 0; g.fx.label(p.x, p.y, 170, 'SHOOK IT OFF!', '#cfeaa8', 24, 50); }
        else if (g.app.ctrl(p.ctrlId).pressed.attack) p.gooT = Math.max(0, p.gooT - 16);
      }
      const held = this.holds.has(p), dens = st && st.fogAt ? st.fogAt(p.x) : 0.7;
      if (!held && !g.cut && !g.cutin && p.state === 'idle') p.sleepy = Math.min(1, (p.sleepy || 0) + dens / 330);
      else if (!held) p.sleepy = Math.max(0, (p.sleepy || 0) - 1 / 70);
      if ((p.sleepy || 0) > 0.55) p.slowK *= 0.8;
      if ((p.sleepy || 0) > 0.4) this.yawnHint();
      if ((p.sleepy || 0) >= 1 && !held && !g.cut && !g.cutin && p.hittable && this.hold(p, { by: null, kind: 'nap' })) { g.fx.word(p.x, p.y, 150, true, 'ZZZ...'); audio.sfx('snore'); }
      sum += p.sleepy || 0; n++;
    }
    st?.setFog?.(n ? sum / n : 0);
  }
  /** a hero is drowsed by a yawn (the Beast's): +k sleepy */
  drowse(p, k) { p.sleepy = Math.min(1, (p.sleepy || 0) + k); this.g.fx.label(p.x, p.y, 180, 'YAWN...', '#bfe8ff', 24, 50); this.yawnHint(); }
  /** a slime's landing: goo on the hero (slow; roll to shake it off) */
  goo(p) {
    if (p.gooT > 0 || p.out) return false;
    p.gooT = 260; this.g.fx.label(p.x, p.y, 180, 'STICKY!', '#b4f090', 26, 60); audio.sfx('slime_goo');
    this.hint('sigoo', 'GOO! You are slow and sticky. || ROLL to shake it off!', 330, true);
    return true;
  }
  slimeHint(now = false) { this.hint('sislime', 'SLOTH SLIME! A GREEN ring = where it leaps. || Step out of it, then SPLAT it!', 360, now, now ? { cut: true } : null); }   // (now: the Sloth Beast winding up its spit -- cuts in, src/sicell.js)
  yawnHint() { this.hint('siyawn', 'YAWN FOG! Standing still makes you SLEEPY. || Keep MOVING to stay awake!', 360); }
  /** goo on a hero's feet, sleepy Zs and a drowsy bar over a yawning one */
  drawCellOver(ctx) {
    const g = this.g;
    if (!g.L.cell) return;
    for (const p of g.players) {
      if (p.out) continue;
      if (p.gooT > 0) {
        const sx = p.sx, sy = p.sy, a = Math.min(1, p.gooT / 40);
        ctx.save(); ctx.globalAlpha = 0.9 * a; ctx.fillStyle = '#86c880'; ctx.strokeStyle = 'rgba(20,50,20,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(sx, sy + 1, 30, 9, 0, 0, TAU); ctx.fill(); ctx.stroke();
        for (const dx of [-14, 2, 16]) { ctx.beginPath(); ctx.moveTo(sx + dx - 4, sy - 2); ctx.quadraticCurveTo(sx + dx, sy - 22 - 5 * Math.sin(g.time * 4 + dx), sx + dx + 4, sy - 2); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = 'rgba(230,255,220,0.6)'; ctx.beginPath(); ctx.ellipse(sx - 8, sy - 1, 8, 2, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      const z = p.sleepy || 0;
      if (z > 0.3 && !this.holds.has(p)) {
        const sx = clamp(p.sx, 105, 862), sy = clamp(p.sy - 140, 89, 489);   // (the moon icon 57 px left / 24 under, the z's ~50 px right / 61 over: inside x 48..912, y 27..513, QAF_tech N4)
        ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4.4; ctx.strokeStyle = INK;
        for (let i = 0; i < 3; i++) { const u = ((g.time * 0.7 + i / 3) % 1), s = 16 + 10 * z + i * 4; ctx.globalAlpha = Math.min(1, (z - 0.25) * 2.4) * (1 - u); ctx.font = `bold ${s | 0}px Bangers, Impact, sans-serif`; const zx = sx + 16 + i * 9 + Math.sin(u * 5) * 4, zy = sy - u * 34; ctx.strokeText('z', zx, zy); ctx.fillStyle = '#d6ecff'; ctx.fillText('z', zx, zy); }
        ctx.globalAlpha = 1; const w = 74; ctx.fillStyle = INK; ctx.fillRect(sx - w / 2 - 2, sy + 10, w + 4, 13); ctx.fillStyle = '#26324a'; ctx.fillRect(sx - w / 2, sy + 12, w, 9); ctx.fillStyle = '#eaf2ff'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx - w / 2 - 12, sy + 16, 8, 0.6, TAU - 0.6); ctx.arc(sx - w / 2 - 8, sy + 16, 6, TAU - 0.9, 0.9, true); ctx.fill(); ctx.stroke(); ctx.fillStyle = z > 0.75 ? '#ff7a6a' : z > 0.55 ? '#ffd24a' : '#8ad0ff'; ctx.fillRect(sx - w / 2, sy + 12, w * z, 9);
        ctx.restore();
      }
      if (this.holds.get(p)?.kind === 'nap') {   // a big ZZZ while asleep
        ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.font = 'bold 34px Bangers, Impact, sans-serif';
        for (let i = 0; i < 3; i++) { const u = ((g.time * 0.6 + i / 3) % 1); ctx.globalAlpha = 1 - u * 0.7; const zx = clamp(p.sx, 43, 865) + 14 + i * 12, zy = clamp(p.sy - 120, 94, 504) - u * 40; ctx.strokeText('Z', zx, zy); ctx.fillStyle = '#d6ecff'; ctx.fillText('Z', zx, zy); }
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------- the Cave of Rage (stage 3a): stay calm
  /** the Cave of Rage swaps Dodongo's dragon super for CALM LITTLE CLOUD (Player.dragonReady / special read this; the bridge would break) */
  get calmSuper() { return !!this.g.L.calm; }
  superName(p) { return this.calmSuper && p.heroId === 'dodongo' ? 'CALM LITTLE CLOUD' : null; }
  /** Player.special, every frame of Dodongo's super here: the cloud comes at the start (src/sirage.js CalmCloud) */
  calmCloud(p) {
    const g = this.g;
    p.inv = Math.max(p.inv, 4);
    if (p.st === 1) { g.actors.push(new CalmCloud(g, p)); g.fx.label(p.x, p.y, 210, 'CALM LITTLE CLOUD!', '#9fe7ff', 36, 90); audio.sfx('swing_heavy', { pitch: 1.3, vol: 0.5 }); }
  }

  /** the collar's launch is always on offer (the shield, a team-up, or Scarlet's): the gem pulses */
  collarOpen() { return true; }
  /** a hero flies up at the Kraken's collar: from the shield, a team-up -- or, alone, Scarlet's */
  launchHero(p, why) {
    const g = this.g, B = g.boss;
    if (!B || B.collarX === undefined || p.out) return;
    p.reset('air'); p.z = Math.max(1, p.z); p.vz = 17; p.vx = clamp((B.collarX - p.x) / 38, -8, 8); p.vy = 0; p.facing = Math.sign(p.vx) || p.facing;
    p.airAtkT = -1; p.hitSet = new Set(); p.launchedAt = g.frame; p.inv = Math.max(p.inv, 36); p.teamFx = false; p.ctl = true;
    this.launch.set(p, g.frame);
    g.fx.ring(p.x, p.y, { rx: 80, ry: 28, shock: true, col: '#ffd23a', life: 18 }); g.fx.label(p.x, p.y, 200, why, '#ffd23a', 30, 70);
    audio.sfx('jump', { pitch: 0.8 }); audio.sfx('shield_bash', { pitch: 1.2 }); g.shake = Math.max(g.shake, 5);
  }
  /** game.js teamHit: a team-up's blast against the Kraken's collar phase launches the hero nearest the gem */
  onTeamBlast(T) {
    const g = this.g, B = g.boss;
    if (!B || B.state !== 'collar' || B.collarX === undefined) return;
    const all = [T.a, T.b, ...(T.extra || [])].filter((p) => !p.out && p.alive).sort((a, b) => Math.abs(a.x - B.collarX) - Math.abs(b.x - B.collarX));
    if (all[0]) this.launchHero(all[0], 'TEAM-UP LAUNCH!');
  }
  /** Player.trySpecial: alone against the collar, SUPER is Scarlet's team-up (true: handled) */
  collarSuper(p) {
    const g = this.g, B = g.boss;
    if (!B || B.state !== 'collar' || B.collarX === undefined || g.cut || !g.fighting) return false;
    if (g.players.some((q) => q !== p && !q.out && q.alive)) return false;   // (with a friend: the usual team attack, whose blast launches -- onTeamBlast)
    if (p.meter < 100) return false;
    p.meter -= 100; this.launchHero(p, "SCARLET'S TEAM-UP!");
    return true;
  }

  // ---------------------------------------------------------------- the rolling barrels
  stepBarrels() {
    const g = this.g, B = g.L.barrels;
    if (!B) return;
    const lead = g.players.filter((p) => !p.out).reduce((m, p) => Math.max(m, p.x), 0);
    const bossArena = !!g.L.arenas[g.arenaIdx]?.boss;
    if (lead < B.x0 || lead > B.x1 || bossArena || (this.scar && this.scar.phase !== 'none')) { this.barrelT = Math.max(this.barrelT, 200); return; }
    if (--this.barrelT > 0) return;
    const live = g.actors.filter((a) => a instanceof RollBarrel && a.alive).length;
    if (live >= 2) { this.barrelT = 60; return; }
    this.barrelT = (g.fighting ? rnd(300, 420) : rnd(420, 560));
    const dir = Math.random() < 0.5 ? 1 : -1, y = rnd(26, DEPTH - 26);
    const x = dir > 0 ? g.camX - 50 : g.camX + W + 50;
    g.fx.label(clamp(x, g.camX + 56, g.camX + W - 56), y, 100, '!', '#ffe03a', 84, 56);   // (the warning at the edge it comes from: big, warm yellow)
    audio.sfx('boulder_roll', { pitch: 0.8, vol: 0.4 });
    const b = new RollBarrel(g, x, y, dir); b.delay = 56; g.actors.push(b);
    if (++this.barrelN === 1) this.hint('sibarrel', 'A rolling barrel! JUMP it, ROLL through, or smash it!', 330, true);
  }

  // ---------------------------------------------------------------- hints
  stepHints() {
    const g = this.g;
    if (g.flags.hint_silantern === undefined && g.L.lanterns?.some((l) => l.x > g.camX && l.x < g.camX + W && g.players.some((p) => !p.out && Math.abs(p.x - l.x) < 380))) {
      this.hint('silantern', 'A swinging lantern! Stay out from under it! || Or lure a sailor into it!', 330);
    }
    if (g.L.calm && g.flags.hint_sicalm === undefined && g.actors.some((a) => a.art === 'ragewolf' && a.entered && !a.boss)) {
      this.hint('sicalm', `Wolves GROW when you mash! || HOLD ${this.keyName('attack')}, then let go: a calm strong strike! || Or poke once, then step back. || Calm one all the way: a PUPPY!`, 330);
    }
  }

  // ---------------------------------------------------------------- Scarlet
  /** Scarlet speaks (her helper's, or her player's, balloon) */
  scarSay(text, life) {
    const g = this.g, s = g.players.find((q) => baseOf(q.heroId) === 'scarlet' && !q.out) || this.scarActor;
    if (!s || !text) return;
    g.fx.list = g.fx.list.filter((q) => !(q.type === 'balloon' && q.actor?.team === 'hero' && q.actor !== s));
    g.say(s, text, life || 150, { villain: false });
  }
  /** one of SI_LINES by its speaker: 'sca' is Scarlet (helper or player), the rest as World.speakerFor */
  line(key, by = null) {
    const L = SI_LINES[key];
    if (!L) return super.line(key, by);
    const g = this.g, [who, text] = L;
    if (who === 'sca') { this.scarSay(text); return; }
    const want = { dod: 'dodongo', ana: 'ana', sha: 'shadow' }[who];
    let s = by || (want ? g.players.find((q) => !q.out && baseOf(q.heroId) === want) : g.speakerFor(who));
    // (a fight line that tells the kids something -- KRAKEN PAL, the leap, the dizzy kraken: a hero who talks says it; Shadow's "..." only when he is the only one there)
    if (!by && who === 'hero' && s && baseOf(s.heroId) === 'shadow') { const o = g.players.find((q) => !q.out && q.alive !== false && baseOf(q.heroId) !== 'shadow'); if (o) s = o; }
    if (!s) return;
    const t = g.lineFor(who, text, s);
    if (!t) return;
    if (s.team === 'hero') g.fx.list = g.fx.list.filter((q) => !(q.type === 'balloon' && q.actor !== s && q.actor?.team === 'hero'));
    g.say(s, t, undefined, g.balloonStyle(who));
  }
  /** the boss at half health: SCARLET SWINGS IN (the drop-in moment) -- once */
  scarletSwingIn() {
    if (this.scar) return;
    const g = this.g, b = g.boss;
    // (a party that already has Scarlet -- a test's, a later book's: no helper; she steps in where she is, and the captain's beat goes on)
    if (g.players.some((q) => baseOf(q.heroId) === 'scarlet' && !q.out)) {
      this.scar = { phase: 'player', t: 0 }; this.scarDelay = 70;
      g.fx.label(g.camX + W - 150, 40, 260, 'SCARLET!', '#e8333f', 44, 70);
      return;
    }
    this.scar = { phase: 'swing', t: 0 };
    this.scarActor = new SIScarlet(g, b);
    g.actors.push(this.scarActor);
    // (the free seat opens when she lands -- SIScarlet 'land' -- never mid-swing: the captain waits for her touchdown)
    // (nobody on a pad free to take her seat: she stays the helper -- the prompt only shows when a pad could)
  }
  /** a free pad's START while she is open: her own seat (src/main.js tryDropIn) -- the helper becomes a player in place */
  scarletSeat(ctrlId) {
    const g = this.g, app = g.app;
    if (!this.scarletOpen || !this.scarActor || this.scarActor.state === 'swing' || g.players.length >= 4 || g.players.some((p) => baseOf(p.heroId) === 'scarlet')) return false;
    const A = this.scarActor, p1 = g.players[0], slot = g.players.length;
    if (p1 && p1.ctrlId === 'any') {   // (now P1 has a device of its own -- the run's too; a touch P1 stays on touch: src/main.js p1Home)
      p1.ctrlId = app.p1dev && app.p1dev !== ctrlId ? app.p1dev : (app.p1Home?.() || 'kb');
      if (app.run.ctrls) app.run.ctrls[0] = p1.ctrlId;
      if (p1.ctrlId === 'touch' && app.padHidTouch) { app.padHidTouch = false; try { document.body.classList.add('touch'); } catch { /* (no DOM) */ } }
    }
    app.run.heroes[slot] = 'scarlet'; app.run.ctrls[slot] = ctrlId; app.run.players = slot + 1;
    const p = g.addPlayer('scarlet', ctrlId);
    p.x = A.x; p.y = A.y; p.z = 0; p.vx = p.vy = p.vz = 0; p.facing = A.facing; p.reset('idle'); p.inv = 90;
    this.scarPlayer = p; A.joined = p; A.gone = true; this.scarActor = A;
    this.scarletOpen = false;
    g.fx.ring(p.x, p.y, { rx: 130, ry: 44, shock: true, col: '#e8333f', life: 22 });
    g.fx.label(p.x, p.y, 200, 'SCARLET JOINS!', '#e8333f', 34, 90);
    return true;
  }

  /** the disarm beat, every frame (t = frames since it began; src/sibosses.js 'disarm'): Scarlet -- her helper, or the player who took
   * her seat -- steps out in FRONT of the captain (so a child sees who is talking), then flicks his cutlass (t 40..68; the sword leaves
   * at t 52).  Her balloon is hers: scarSay. */
  flickBeat(t, boss) {
    const g = this.g, P = g.players.find((q) => baseOf(q.heroId) === 'scarlet' && !q.out), A = this.scarActor && !this.scarActor.gone ? this.scarActor : null;
    const S = P || A;
    if (!S) return;
    const tx = clamp(boss.x + boss.facing * 150, g.camX + 80, g.camX + W - 80), ty = clamp(boss.y + 40, 10, DEPTH - 10);
    if (t < 40) {
      S.x += clamp(tx - S.x, -6, 6); S.y += clamp(ty - S.y, -3.2, 3.2); S.facing = boss.x > S.x ? 1 : -1;
      if (P) { if (P.state !== 'cutscene') P.set('cutscene'); P.cutPose = 'walk'; P.cutPoseArg = (t / 22) % 1; P.vx = P.vy = 0; }
      else if (A.state !== 'goflick') { A.state = 'goflick'; A.st = 0; }
    } else if (t === 40) {
      if (P) { P.cutPose = 'atk4'; P.cutPoseArg = 0; P.facing = boss.x > P.x ? 1 : -1; audio.sfx('sword_slash', { pitch: 1.3 }); } else A.flick();
    } else if (t > 40 && t <= 70 && P) { P.cutPose = 'atk4'; P.cutPoseArg = Math.min(1, (t - 40) / SCA.atk.atk4.dur); }
    else if (t === 71 && P) { P.cutPose = null; P.cutPoseArg = undefined; P.set('idle'); }
  }

  // ---------------------------------------------------------------- drawing
  drawOver(ctx) {
    super.drawOver(ctx);
    const g = this.g;
    this.drawSwampOver(ctx); this.drawCellOver(ctx);
    for (const [p, H] of this.holds) {   // "MASH [J]!" over a held hero, with its progress (after the "NETTED!" / "GOT YE!" word has cleared)
      if (p.out || H.t < 36) continue;
      let mx = p.sx;   // (the word's and the bar's centre: inside the TV safe area -- near the right edge it ran 46 px past it, the tech gate)
      {   // (a smooth ~1.9 Hz pulse, never an on/off blink: flash safety)
        const k = this.keyName('attack', p);
        ctx.save(); ctx.globalAlpha = 0.775 + 0.225 * Math.cos(g.frame * 0.2); ctx.font = 'bold 32px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        mx = safeCX(ctx, p.sx, Math.max(ctx.measureText(`MASH ${k}!`).width / 2 + 4, H.kind === 'swallow' ? 0 : 53));
        ctx.lineWidth = 7; ctx.strokeStyle = INK; const up = H.kind === 'tentacle' ? 40 : 0, my = H.kind === 'swallow' ? p.sy - 60 : Math.max(104, p.sy - 170 - up); ctx.strokeText(`MASH ${k}!`, mx, my);   // (a tentacle / root hold: over its painted curl)
        ctx.fillStyle = '#ffe066'; ctx.fillText(`MASH ${k}!`, mx, my); ctx.restore();
      }
      if (H.kind === 'swallow') continue;   // (the Beast's own rescue meter is the bar: src/sicell.js)
      const need = MASH[H.kind], f = Math.min(1, H.mash / need);
      const by = Math.max(113, p.sy - 161 - (H.kind === 'tentacle' ? 40 : 0));   // (under the word, wherever it went)
      ctx.save(); ctx.fillStyle = INK; ctx.fillRect(mx - 53, by, 106, 18);
      ctx.fillStyle = '#efe3c2'; ctx.fillRect(mx - 50, by + 3, 100, 12);   // (the empty track: pale, so 0% still shows a bar)
      ctx.fillStyle = '#ff8a1a'; ctx.fillRect(mx - 50, by + 3, 100 * f, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(mx - 50, by + 3, 100 * f, 3); ctx.restore();
    }
  }
  /** game.js drawTags asks: no P1 / P2 tags over the captain's scripted beats (their balloons are the show) */
  hideTags() { const B = this.g.boss; return !!(B && (B.disarmSeq || B.state === 'shock' || B.state === 'clash' || B.state === 'finish' || B.state === 'beamClash')); }
  /** the free seat's prompt (while Scarlet is open and a pad could take it) -- under the HUD, top right */
  drawHud(ctx) {
    super.drawHud(ctx);
    const g = this.g, app = g.app;
    for (const a of g.actors) if (a.drawCard && !a.gone) a.drawCard(ctx);   // (a mini-boss's name card: the Leviathan)
    if (!this.scarletOpen || g.cut || !(app.freeSeatPad ? app.freeSeatPad() : app.canDropIn())) return;
    if (g.frame - this.scarOpenAt > 1100) return;   // (pulses for ~18 s after she lands; the seat stays hers to take)
    const n = g.players.length, txt = `P${n + 1}: Play as SCARLET! Press ${app.startText ? app.startText() : 'START'}`;
    ctx.save(); ctx.globalAlpha = 0.68 + 0.32 * Math.sin(g.frame * 0.105);   // (a smooth ~1 Hz pulse, never an on/off blink: QA3)
    ctx.font = 'bold 22px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    const y = 444;   // (low and central: clear of the boss's face and the HUD; the hint box sits under it)
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(txt, W / 2, y);
    ctx.fillStyle = '#ff7a8a'; ctx.fillText(txt, W / 2, y); ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ SCARLET, the helper
const SCA = HEROES.scarlet;
/** Scarlet swinging in on a rope and fighting beside the heroes until the captain's cutlass is gone: an actor of the heroes' side
 * (team 'ally': the foes never hunt her, she can't be hurt), drawn with her own art.  The captain's fight calls her (src/sibosses.js).
 * A free pad's START turns her into a real hero in her place (SIWorld.scarletSeat). */
export class SIScarlet extends Actor {
  constructor(game, boss) {
    super(game, boss.x + 150, boss.y);
    this.team = 'ally'; this.solid = false; this.helper = true; this.heroId = 'scarlet';
    this.w = 22; this.h = 150; this.balloonH = 214; this.shadowR = 32; this.mem = { frame: 0 };
    this.boss = boss; this.state = 'swing'; this.st = 0; this.facing = -1;
    this.sx0 = game.camX + W + 60; this.land = { x: clamp(boss.x - 130, game.camX + 120, game.camX + W - 150), y: clamp(boss.y + 8, 20, DEPTH - 20) };
    this.x = this.sx0; this.z = 330; this.y = this.land.y; this.combo = 0; this.cool = 30; this.ph = 0; this.hitSet = new Set(); this.atkN = 0;
    audio.sfx('swing_heavy', { pitch: 0.6, vol: 0.8 });
  }
  get hittable() { return false; }
  update() {
    const g = this.game;
    this.tick(); this.mem.frame = g.frame;
    if (this.joined) { this.gone = true; return; }
    switch (this.state) {
      case 'swing': {
        const T = 74, u = Math.min(1, this.st / T);
        const e = 1 - (1 - u) * (1 - u);
        this.x = lerp(this.sx0, this.land.x, e);
        this.z = 330 * Math.pow(1 - u, 1.6) + 6 * Math.sin(u * Math.PI);
        this.facing = -1;
        if (this.st === 1) { g.fx.label(g.camX + W - 150, 40, 260, 'SCARLET!', '#e8333f', 44, 70); audio.sfx('whelp_chirp', { pitch: 0.8, vol: 0.6 }); }
        if (this.st >= T) { this.z = 0; this.state = 'land'; this.st = 0; this.boss.onScarletLanded?.(this); g.mm.scarletOpen = true; g.mm.scarOpenAt = g.frame; g.shake = Math.max(g.shake, 6); g.fx.dust(this.x, this.y, 5, 30); audio.sfx('land', { vol: 0.9 }); }
        break;
      }
      case 'land':   // the clang
        this.facing = this.boss.x > this.x ? 1 : -1;
        if (this.st === 6) { audio.sfx('sword_slash', { pitch: 0.9 }); g.fx.word(this.x + 60, this.y, 150, true, 'CLANG!'); g.fx.spark(this.x + this.facing * 70, this.y, 130, true); g.shake = Math.max(g.shake, 8); }
        if (this.st === 14) g.mm.line('scarIn');
        if (this.st === 95) g.mm.line('rescue');
        if (this.st >= 70 && this.boss.state !== 'clash') { this.state = 'fight'; this.st = 0; }
        break;
      case 'fight': this.fight(); break;
      case 'atk': this.attack(); break;
      case 'goflick': this.facing = this.boss.x > this.x ? 1 : -1; this.vx = this.vy = 0; this.ph = (this.ph + 0.045) % 1; break;   // (SIWorld.flickBeat moves her)
      case 'flick': this.facing = this.boss.x > this.x ? 1 : -1; this.vx = 0; if (this.st >= 40) { this.state = 'cheer'; this.st = 0; } break;
      case 'cheer': this.vx = this.vy = 0; break;
    }
    this.x += this.vx || 0; this.y = clamp(this.y + (this.vy || 0), 4, DEPTH - 4);
  }
  /** the nearest foe on screen: the crew first, the captain after */
  target() {
    const g = this.game;
    const foes = g.actors.filter((a) => a.team === 'foe' && a.alive && a.hittable && a.x > g.camX - 10 && a.x < g.camX + W + 10 && !a.carrier);
    const crew = foes.filter((a) => !a.boss);
    const pool = crew.length ? crew : foes;
    return pool.sort((a, b) => Math.abs(a.x - this.x) + 2 * Math.abs(a.y - this.y) - (Math.abs(b.x - this.x) + 2 * Math.abs(b.y - this.y)))[0] || null;
  }
  fight() {
    const g = this.game, t = this.target();
    if (this.boss.disarmed || !this.boss.alive) { this.vx = this.vy = 0; return; }
    if (!t) {   // nobody to fight: stand with the heroes
      const lead = g.players.find((p) => !p.out);
      const gx = lead ? lead.x - 90 * (lead.facing || 1) : this.x;
      this.vx = Math.abs(gx - this.x) > 50 ? Math.sign(gx - this.x) * 2.4 : 0; this.vy = 0; this.ph = (this.ph + Math.abs(this.vx) * 0.013) % 1;
      return;
    }
    const want = 62, dir = t.x > this.x ? -1 : 1, gx = t.x + dir * want, dx = gx - this.x, dy = t.y - this.y;
    this.facing = t.x > this.x ? 1 : -1;
    if (Math.abs(dx) > 14 || Math.abs(dy) > 9) {
      this.vx = Math.abs(dx) > 14 ? Math.sign(dx) * 3.2 : 0; this.vy = Math.abs(dy) > 9 ? Math.sign(dy) * 2.1 : 0; this.ph = (this.ph + 0.045) % 1;
      return;
    }
    this.vx = this.vy = 0;
    if (--this.cool > 0) return;
    this.atkN = (this.combo % 3) + 1; this.combo++; this.state = 'atk'; this.st = 0; this.hitSet = new Set();
  }
  attack() {
    const g = this.game, A = SCA.atk['atk' + this.atkN], k = this.st;
    this.vx = this.vy = 0;
    if (k >= A.a0 && k <= A.a1) {
      if (k === A.a0) audio.sfx(A.sfx, { pitch: 1.05 });
      const box = boxOf(this, A.box);
      for (const t of g.actors) {
        if (t.team !== 'foe' || this.hitSet.has(t) || !t.hittable || !overlaps(box, t)) continue;
        this.hitSet.add(t);
        const hd = { ...A, dmg: Math.round(A.dmg * 0.9), kind: this.atkN === 3 && !t.boss ? 'knock' : A.kind, lift: 5, ember: 0 };
        if (t.takeHit(this, hd)) { g.fx.spark(t.x, t.y, t.z + t.h * 0.55, false); audio.sfx(A.hit || 'hit_light', { pitch: 1.1 }); }
      }
    }
    if (k >= A.dur) { this.state = 'fight'; this.st = 0; this.cool = this.atkN === 3 ? 50 : 8; }
  }
  /** the flick that sends the captain's cutlass away (the fight's last beat) */
  flick() { this.state = 'flick'; this.st = 0; this.facing = this.boss.x > this.x ? 1 : -1; audio.sfx('sword_slash', { pitch: 1.3 }); }
  pose() {
    const A = CHARS.scarlet?.ANIM || {}, g = this.game;
    const get = (key, arg, fb = 'idle') => { let f = A[key]; if (f === undefined) f = A[fb]; return f === undefined ? {} : typeof f === 'function' ? f(arg) : f; };
    switch (this.state) {
      case 'swing': return get('fall', 0, 'idle');
      case 'land': return get(this.st < 12 ? 'atk3' : 'idle', Math.min(1, (this.st + 6) / SCA.atk.atk3.dur), 'idle');
      case 'atk': return get('atk' + this.atkN, Math.min(1, this.st / SCA.atk['atk' + this.atkN].dur));
      case 'goflick': return get('walk', this.ph);
      case 'flick': return get('atk4', Math.min(1, this.st / SCA.atk.atk4.dur), 'atk3');
      case 'cheer': return get('cheer', g.time, 'victory');
      default: return Math.abs(this.vx) + Math.abs(this.vy) > 0.4 ? get('walk', this.ph) : get('idle', g.time + 1.3);
    }
  }
  draw(ctx) {
    const art = CHARS.scarlet, g = this.game;
    if (!art || this.gone) return;
    // the rope she swings on: from above the screen to her raised hand
    if (this.state === 'swing') {
      const hx = this.sx + 8, hy = this.sy - 150;   // (sy already lifts with z)
      ctx.save(); ctx.lineCap = 'round';
      const ax = hx + 60 * (1 - Math.min(1, this.st / 74)) + 24, ay = -30;
      for (const [lw, col] of [[7, INK], [3.6, '#d8c590']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); ctx.stroke(); }
      ctx.restore();
    }
    ctx.save(); ctx.translate(this.sx, this.sy);
    art.draw(ctx, this.pose(), { facing: this.facing, t: g.time, mem: this.mem, vel: { x: this.vx || 0, y: this.vy || 0, z: 0 }, talk: false });
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ the swinging lantern
const LAN = { anchorY: 72, len: 272, period: 3.7 * 60, amp: 0.42 };
/** a ship's lantern on a long chain from the ceiling beam: a pendulum.  Whoever is under it takes a bonk (hero: a small
 * hit; sailor: knocked over -- lure them!).  Telegraphed by its own swing and a moving shadow on the floor. */
export class Lantern extends Actor {
  constructor(game, x, y, phase) {
    super(game, x, y);
    this.team = 'hazard'; this.x0 = x; this.ph = phase; this.age = 0; this.solid = false; this.w = 0; this.h = 0; this.hitAt = new Map();
    this.sortY = y; this.bx = x; this.bz = 100; this.va = 0;
  }
  get hittable() { return false; }
  angle(age = this.age) { return LAN.amp * Math.sin(age / LAN.period * TAU + this.ph); }
  update() {
    const g = this.game;
    this.tick();
    if (!g.cut && !g.cutin) this.age++;
    const a = this.angle(), a1 = this.angle(this.age + 1);
    this.va = (a1 - a) * LAN.len;   // (px / frame along x)
    this.bx = this.x0 + Math.sin(a) * LAN.len;
    this.bz = (FLOOR_TOP + this.y) - (LAN.anchorY + Math.cos(a) * LAN.len);
    if (g.cut || g.cutin || this.x0 < g.camX - 200 || this.x0 > g.camX + W + 200) return;
    for (const p of g.players) {
      if (!p.hittable || p.out || Math.abs(p.x - this.bx) > p.w + 18 || Math.abs(p.y - this.y) > 22 || this.bz - 24 > p.z + p.h || this.bz + 24 < p.z) continue;
      if (g.frame - (this.hitAt.get(p) ?? -999) < 90) continue;
      this.hitAt.set(p, g.frame);
      p.takeHit({ x: this.bx - Math.sign(this.va || 1) * 10, team: 'hazard', facing: 1 }, { dmg: 6, kind: 'light', push: 2.5, stun: 16, stop: 3, sfx: 'hit_light', spark: 'warm' });
      g.fx.word(p.x, p.y, 150, true, 'CLANG!');
    }
    for (const t of g.actors) {
      if (t.team !== 'foe' || t.boss || !t.hittable || Math.abs(t.x - this.bx) > t.w + 16 || Math.abs(t.y - this.y) > 22 || this.bz - 24 > t.z + t.h || this.bz + 24 < t.z) continue;
      if (g.frame - (this.hitAt.get(t) ?? -999) < 90) continue;
      this.hitAt.set(t, g.frame);
      t.takeHit({ x: this.bx - Math.sign(this.va || 1) * 10, team: 'hazard', facing: 1 }, { dmg: 12, kind: 'knock', push: 4.5, lift: 4.5, stop: 4, sfx: 'hit_heavy', spark: 'warm' });
      g.fx.word(t.x, t.y, t.h, true, 'BONK!'); g.score += 100;
    }
  }
  drawShadow(ctx) {   // (the pendulum's shadow on the floor, moving with it: the telegraph)
    const x = this.bx - this.game.camX, y = FLOOR_TOP + this.y;
    ctx.fillStyle = 'rgba(30,18,10,0.32)'; ctx.beginPath(); ctx.ellipse(x, y, 26, 8, 0, 0, TAU); ctx.fill();
  }
  draw(ctx) {
    const g = this.game, ax = this.x0 - g.camX, ay = LAN.anchorY, x = this.bx - g.camX, y = FLOOR_TOP + this.y - this.bz;
    if (x < -80 || x > W + 80) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the chain (inked), the lantern: a brass cage round a flame, glowing warm
    for (const [lw, col] of [[5, INK], [2.4, '#8a7440']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(col === INK ? [] : [7, 4]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(x, y - 30); ctx.stroke(); }
    ctx.setLineDash([]);
    const f = 0.85 + 0.15 * Math.sin(g.time * 13 + this.ph * 3);
    ctx.globalCompositeOperation = 'lighter';
    for (const [r, a] of [[78, 0.1], [52, 0.16], [30, 0.3]]) { ctx.fillStyle = `rgba(255,190,90,${a * f})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y); ctx.rotate(-this.angle() * 0.5);
    ctx.fillStyle = '#5a4020'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-10, -26); ctx.lineTo(10, -26); ctx.lineTo(6, -34); ctx.lineTo(-6, -34); ctx.closePath(); ctx.fill(); ctx.stroke();   // (the cap)
    ctx.fillStyle = '#ffd86a'; ctx.beginPath(); ctx.moveTo(-9, -26); ctx.lineTo(9, -26); ctx.lineTo(11, 14); ctx.lineTo(-11, 14); ctx.closePath(); ctx.fill(); ctx.stroke();   // (the glass)
    ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.ellipse(0, -4, 5, 9 * f, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, 14); ctx.moveTo(-10, -6); ctx.lineTo(10, -6); ctx.stroke();
    ctx.fillStyle = '#5a4020'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.rect(-13, 14, 26, 6); ctx.fill(); ctx.stroke();   // (the base)
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ the rolling barrel
/** a barrel rolling across the deck (the ship rolls with the swell): a "!" at its edge first.  A hero it hits is knocked flying
 * (8); a hero who jumps it or rolls through it is fine; the sailors are bowled over; a swing smashes it (and maybe a snack). */
/** the lane a barrel is about to roll along, lit red on the floor with chevrons pointing the way (RollBarrel's warning).  A 'hazard' actor
 * (like Lantern): game.js draws the shadow pass of every actor but the 'shot' ones, under everyone, which is where a floor mark belongs. */
class BarrelLane extends Actor {
  constructor(game, barrel) {
    super(game, barrel.x, barrel.y);
    this.team = 'hazard'; this.barrel = barrel; this.solid = false; this.w = 0; this.h = 0; this.sortY = -999; this.shadowR = 0;
  }
  get hittable() { return false; }
  update() { this.tick(); if (this.barrel.gone || this.barrel.delay <= 0) { this.alive = false; this.gone = true; } }
  drawShadow(ctx) {
    const b = this.barrel, t = b.delay;
    if (t <= 0) return;
    const y = FLOOR_TOP + b.y, a = 0.3 + 0.16 * Math.sin(t * 0.55), d = b.dir;
    ctx.save();
    ctx.fillStyle = `rgba(255,60,36,${a})`; ctx.fillRect(0, y - 25, W, 50);
    ctx.fillStyle = 'rgba(255,236,120,0.9)'; ctx.fillRect(0, y - 27, W, 3); ctx.fillRect(0, y + 24, W, 3);
    ctx.strokeStyle = 'rgba(255,244,180,0.95)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const span = W + 80;
    for (let i = 0; i < 13; i++) {   // chevrons drifting the way it will roll
      const x = ((i * 80 + (56 - t) * 7 * d) % span + span) % span - 40;
      ctx.beginPath(); ctx.moveTo(x - 9 * d, y - 12); ctx.lineTo(x + 7 * d, y); ctx.lineTo(x - 9 * d, y + 12); ctx.stroke();
    }
    ctx.restore();
  }
  draw() {}
}
export class RollBarrel extends Actor {
  constructor(game, x, y, dir) {
    super(game, x, y);
    this.team = 'shot'; this.vx = 0; this.dir = dir; this.facing = dir; this.w = 28; this.h = 58; this.hz0 = 0; this.solid = false;
    this.rot = 0; this.delay = 56; this.hit = new Set(); this.shadowR = 24;
  }
  get hittable() { return this.alive && this.delay <= 0; }
  takeHit(att) {   // smashed by a swing
    if (!this.hittable) return false;
    const g = this.game;
    this.alive = false; this.gone = true;
    g.fx.debris(this.x, this.y, 20, ['#8a5a30', '#5a3a1c', '#c9a070', '#4f5466'], 12); g.fx.dust(this.x, this.y, 5, 26); SIFX.burst(this.x, this.y, 20, 'wood', { k: 1.4 });
    audio.sfx('break'); g.score += 100;
    if (Math.random() < 0.35) g.spawnPickup('apple', this.x, this.y);
    void att;
    return true;
  }
  update() {
    const g = this.game;
    this.tick();
    if (!this.lane && this.delay > 0) { this.lane = new BarrelLane(g, this); g.actors.push(this.lane); }   // (the warning on the floor)
    if (this.delay > 0) { this.delay--; return; }
    if (g.cut || g.cutin) return;
    this.vx = this.dir * 4.9; this.x += this.vx; this.rot += this.dir * 0.11;
    if (this.st % 22 === 0) audio.sfx('boulder_roll', { pitch: 0.9, vol: 0.18 });
    for (const p of g.players) {
      if (!p.hittable || p.out || this.hit.has(p) || Math.abs(p.y - this.y) > 22 || Math.abs(p.x - this.x) > p.w + this.w || p.z > 36) continue;
      this.hit.add(p);
      p.takeHit({ x: this.x, team: 'hazard', facing: this.dir }, { dmg: 8, kind: 'knock', push: 5.5, lift: 5, stop: 5, sfx: 'hit_heavy', spark: 'warm' });
      g.fx.word(p.x, p.y, 150, true, 'WHAM!');
    }
    for (const t of g.actors) {
      if (t.team !== 'foe' || t.boss || this.hit.has(t) || !t.hittable || Math.abs(t.y - this.y) > 22 || Math.abs(t.x - this.x) > t.w + this.w || t.z > 36) continue;
      this.hit.add(t);
      t.takeHit({ x: this.x, team: 'hazard', facing: this.dir }, { dmg: 10, kind: 'knock', push: 5, lift: 5, stop: 4, sfx: 'hit_heavy', spark: 'warm' });
      g.fx.word(t.x, t.y, t.h, true, 'BONK!'); g.score += 100;
    }
    if ((this.dir > 0 && this.x > g.camX + W + 90) || (this.dir < 0 && this.x < g.camX - 90) || this.st > 700) this.gone = true;
  }
  drawShadow(ctx) {
    if (this.delay > 0) return;   // (the lane it will roll along is lit by its BarrelLane)
    ctx.fillStyle = 'rgba(30,18,10,0.35)'; ctx.beginPath(); ctx.ellipse(this.sx, FLOOR_TOP + this.y, 28, 8, 0, 0, TAU); ctx.fill();
  }
  draw(ctx) {
    if (this.delay > 0) return;
    const x = this.sx, y = this.sy - 30, r = 31;
    ctx.save(); ctx.translate(x, y); ctx.rotate(this.rot); ctx.lineJoin = 'round';
    // a barrel seen end-on as it rolls: a disk of planks with iron hoops
    ctx.fillStyle = '#8a5a30'; ctx.strokeStyle = INK; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1.8;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.9, i * 8); ctx.lineTo(r * 0.9, i * 8); ctx.stroke(); }
    ctx.strokeStyle = '#4f5466'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r - 4, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#8e94a8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, r - 5.5, 0.2, 1.6); ctx.stroke();
    ctx.restore();
  }
}
