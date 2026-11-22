// Arena surprises (the 2026-11-22 gameplay refresh): a few of the fights in each book turn one of their waves into
// something new.  An arena opts in with `twist: { wave, kind }` (src/levels.js, mmlevels.js, silevels.js); World.startWave
// hands that wave here instead of queueing it as written, World.spawn applies the spec's `tw`, and when the wave is
// cleared a BONUS shower of treats falls (World.updateLevel).  Kinds:
//   tiny      SHRINK SPELL!   every foe of the wave comes twice, small, weak and squeaky
//   giant     GIANT ALERT!    the wave's first foe is huge and tough; beating it spills a feast
//   golden    GOLDEN <NAME>!  the wave's first foe is gold: every hit knocks a coin loose, and it drops a 1UP
//   sky       LOOK OUT ABOVE! the wave drops in from the sky (flyers just fly in) and lands flat on its back
//   stampede  STAMPEDE!       a crowd of the arena's small foe, one or two hits each, from both sides
import { W, DEPTH } from './config.js';
import { audio } from './audio-proxy.js';
import { clamp } from './rig.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export const TWIST_LINES = {
  tiny: [['hero', { default: "They're so TINY!\n...and so MANY!", shadow: '... *tries not to laugh*' }]],
  giant: [['hero', { default: 'Uh... is it just me,\nor is that one HUGE?', shadow: '...!!' }]],
  golden: [['hero', { default: "That one's made of\nGOLD! Get it!", shadow: '... *eyes sparkle*' }]],
  sky: [['hero', { default: "They're falling from\nthe SKY?!", shadow: '... *looks up*' }]],
  stampede: [['hero', { default: 'STAMPEDE!\nKeep swinging!', shadow: '... *cracks knuckles*' }]],
};
const BANNER = { tiny: 'SHRINK SPELL!', giant: 'GIANT ALERT!', golden: 'GOLDEN SURPRISE!', sky: 'LOOK OUT ABOVE!', stampede: 'STAMPEDE!' };

/** the twisted wave's spawn specs (each carries `tw`), and the banner, line and sound that announce it */
export function twistWave(g, def, waves) {
  const T = def.twist, kind = T.kind, base = waves.map((s) => ({ ...s }));
  let out = [];
  if (kind === 'tiny') {
    for (const s of base) {
      out.push({ ...s, tw: 'tiny' });
      out.push({ ...s, tw: 'tiny', y: clamp((s.y ?? 70) + (s.y > 70 ? -28 : 28), 12, DEPTH - 12), delay: (s.delay || 0) + 22, name: undefined });
    }
  } else if (kind === 'giant' || kind === 'golden') {
    out = base.map((s, i) => (i === 0 ? { ...s, tw: kind } : s));
  } else if (kind === 'sky') {
    out = base.map((s, i) => ({ ...s, tw: 'sky', delay: 30 + i * 34 }));
  } else if (kind === 'stampede') {
    const k = T.foe || base.find((s) => !/brute|guard|wyvern|leviathan/.test(s.k)) || base[0];
    const n = T.count || 8;
    for (let i = 0; i < n; i++) out.push({ k: k.k, v: k.v, face: i % 5, side: i % 2 ? 'L' : 'R', y: 20 + ((i * 37) % 110), delay: 20 + i * 18, tw: 'stampede' });
  } else out = base;
  g.banner = kind === 'golden' && T.name ? T.name : BANNER[kind] || 'SURPRISE!';
  g.bannerT = 150;
  audio.sfx(kind === 'tiny' ? 'tiny_squeak' : kind === 'giant' ? 'roar' : kind === 'golden' ? 'doubloon_glint' : kind === 'sky' ? 'wind_gust' : 'go', kind === 'giant' ? { pitch: 0.7 } : undefined);
  g.queueTalk(TWIST_LINES[kind] || [], 70);
  g.twistOn = { kind };
  return out;
}

/** a twisted foe, just spawned (World.spawn) */
export function applyTwist(g, e, spec) {
  const kind = spec.tw;
  e.tw = kind;
  if (kind === 'tiny') {
    resize(e, 0.6); e.w *= 0.7; e.h *= 0.62;
    e.hp = e.maxHp = Math.max(1, Math.ceil(e.maxHp * 0.4));
    e.score = Math.round((e.score || 500) * 0.5);
    softHits(e, 0.5);
  } else if (kind === 'giant') {
    resize(e, 1.45); e.w *= 1.4; e.h *= 1.4; e.shadowR = (e.shadowR || e.w * 1.1) * 1.4;
    e.hp = e.maxHp = Math.round(e.maxHp * 2.4); e.heavy = true; e.score = (e.score || 500) * 3;
    e.name = 'GIANT ' + (e.name || '');
    e.twLoot = 'feast';
  } else if (kind === 'golden') {
    e.wash = { filter: 'sepia(1) saturate(3.2) hue-rotate(-8deg) brightness(1.18) contrast(1.05)', fill: 'rgba(255,215,90,0.12)', fallback: 'rgba(255,200,40,0.5)' };
    const upd = e.update.bind(e);
    e.update = (...args) => { const r = upd(...args); if (e.alive && g.frame % 14 === 0) g.fx.spark?.(e.x + rnd(-e.w, e.w), e.y, e.z + rnd(20, e.h), false); return r; };
    e.hp = e.maxHp = Math.round(e.maxHp * 1.5); e.score = (e.score || 500) * 4;
    e.twLoot = 'gold';
    const hit = e.takeHit.bind(e);
    let coins = 0;
    e.takeHit = (att, hd) => {
      const ok = hit(att, hd);
      if (ok && coins < 10) { coins++; g.spawnPickup('coin', e.x + rnd(-24, 24), clamp(e.y + rnd(-12, 12), 4, DEPTH - 4)); audio.sfx('pickup_coin', { pitch: 1.4, vol: 0.5 }); }
      return ok;
    };
  } else if (kind === 'sky') {
    if (!e.flying) {
      e.x = g.camX + rnd(140, W - 140); e.entered = true;
      e.set('fly'); e.z = 460; e.vz = 0; e.vx = 0; e.vy = 0; e.bounced = false; e.thrown = false; e.bowled = new Set();
    }
  } else if (kind === 'stampede') {
    e.hp = e.maxHp = Math.max(1, Math.min(e.maxHp, 14));
    e.score = 200;
    softHits(e, 0.6);
  }
}

/** a foe drawn k times its size: its scale -- or, for a foe whose size is its own getter (Skull Island's rage wolves
 *  grow with their rage: src/sirage.js sz), that getter times k */
function resize(e, k) {
  e.scale = (e.scale || 1) * k;
  for (let P = Object.getPrototypeOf(e); P && P !== Object.prototype; P = Object.getPrototypeOf(P)) {
    const D = Object.getOwnPropertyDescriptor(P, 'sz');
    if (D?.get) { Object.defineProperty(e, 'sz', { get() { return D.get.call(e) * k; }, configurable: true }); break; }
  }
}

/** a small foe's hits hurt less (the hits it lands through Enemy.hitHeroes) */
function softHits(e, k) {
  const orig = e.hitHeroes?.bind(e);
  if (!orig) return;
  e.hitHeroes = (box, hd) => orig(box, { ...hd, dmg: Math.max(1, Math.round((hd.dmg || 0) * k)) });
}

/** every frame (World.updateLevel): the loot of twisted foes just beaten */
export function twistLoot(g) {
  for (const a of g.actors) {
    if (!a.twLoot || a.alive || a.twLooted) continue;
    a.twLooted = true; g.twistLootN = (g.twistLootN || 0) + 1;
    const y = clamp(a.y, 6, DEPTH - 6);
    if (a.twLoot === 'feast') {
      g.spawnPickup('pie', a.x, y);
      for (let i = 0; i < 5; i++) g.spawnPickup('coin', a.x + rnd(-60, 60), clamp(y + rnd(-20, 20), 4, DEPTH - 4));
      g.spawnPickup('gem', a.x + 40, y);
      g.fx.label(a.x, a.y, 220, 'FEAST!', '#ffe066', 40, 90);
    } else {
      g.spawnPickup('oneup', a.x, y);
      g.spawnPickup('gem', a.x + 40, y);
      g.fx.label(a.x, a.y, 220, 'JACKPOT!', '#ffd84a', 40, 90);
    }
    audio.sfx('chest_open');
  }
}

/** the twisted wave cleared: a shower of treats over the screen */
export function twistBonus(g) {
  g.twistOn = null;
  const drops = ['coin', 'coin', 'coin', 'coin', 'coin', 'apple', 'drumstick', 'gem'];
  drops.forEach((k, i) => {
    const pk = g.spawnPickup(k, g.camX + 120 + ((i * 97) % (W - 240)), 20 + ((i * 41) % (DEPTH - 40)));
    if (pk) { pk.z = 260 + i * 30; pk.vz = 0; }
  });
  g.fx.label(g.camX + W / 2, 60, 260, 'BONUS!', '#ffe066', 46, 100);
  audio.sfx('starfall');
}
