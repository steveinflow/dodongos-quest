// DRAGON DODONGO as a playable hero (docs/SECRETS.md): the sky duel's dragon (CHARS.dodongo_dragon -- its play pack:
// flyLoop, fireTap, flame, roll, super, hurt) behind the hero contract.  Every pose key a hero asks for (src/player.js
// Player.pose) maps onto one of his clips; he hovers, drawn HOVER px over his shadow, at SCALE of the duel's size: his
// horns at the kids' heads, a dragon beside them (0.6 read as a pet whelp next to the kid heroes -- the model audit #11,
// 2026-10-25; drawn down from his 1x / 2x pack, so he stays sharp).  His hit and hurt boxes (src/heroes.js) are as they
// were at 0.6: play stays as fair as before.  Built at boot by src/chars.js (make(CHARS.dodongo_dragon)).
import { fxOf, worldOf, DRAGON_FX_REDUCED as RM } from '../dragonfx.js';   // (his swing FX: the FX/UI agent's src/dragonfx.js)

export const HOVER = 30, SCALE = 0.85;

export function make(D) {
  const A = (D && D.ANIM) || {};
  const one = (f, a) => (typeof f === 'function' ? f(a) : f || {});
  const fly = (t) => one(A.flyLoop || A.idle, t || 0);
  const keyed = (clip, k0 = 0, k1 = 1) => (k) => one(A[clip] || A.flyLoop, k0 + (k1 - k0) * Math.max(0, Math.min(1, k || 0)));
  // (painter 3's hero clips -- his move pack, src/chars/dodongo_dragon3d.js: drawn while that pack is decoded (D.hasNow), else
  //  the duel clip as before -- never a stand-in)
  //  (the argument as the hero pose gives it: k for a 'drawings' clip, seconds for a 't' loop -- roar -- and a static, knock,
  //  animates itself from the draw's o.t: time_fps)
  const own = (clip, fb, at) => (k) => (A[clip] && D?.hasNow?.(clip) ? one(A[clip], at === undefined ? k || 0 : at) : fb(k));
  const ANIM = {
    idle: fly, select: fly, victory: own('roar', fly), portal: fly, cutscene: fly,
    walk: (ph) => fly((ph || 0) * 0.6), run: (ph) => fly((ph || 0) * 0.45),
    carryIdle: fly, carryWalk: (ph) => fly((ph || 0) * 0.6),
    squat: (t) => fly(t), land: (t) => fly(t), rise: (t) => fly(t), fall: (t) => fly(t), getup: own('recover', (k) => fly(k)),
    atk1: own('bite', keyed('fireTap')), atk2: own('claw', keyed('fireTap')), atk3: own('tailWhip', keyed('fireTap')), atk4: own('rearUp', keyed('fireTap')), airAtk: keyed('fireTap'),
    runAtk: keyed('roll'), shoot: keyed('fireTap'), throw: keyed('fireTap'), special: keyed('super'), dodge: keyed('roll'),
    hurt: keyed('hurt'), hurt2: keyed('hurt'), fly: own('knock', keyed('hurt', 0.4, 0.6)), down: own('recover', () => one(A.hurt, 1), 0),
  };
  const mouth = D?.mouthOf ? D.mouthOf(fly(0)) : [60, -100, 0];
  const META = { ...(D?.META || {}), height: Math.round((D?.META?.height || 150) * SCALE + HOVER) };
  return {
    ANIM, META, ATLAS_SCALE: D?.ATLAS_SCALE || 0, dragonHero: true,
    // (fireballs and the flame stream come out of his mouth: game-local, feet at 0, facing right)
    SHOOT_ORIGIN: [mouth[0] * SCALE, mouth[1] * SCALE - HOVER],
    CARRY_POINT: [0, -120], WALK_STRIDE: undefined, RUN_STRIDE: undefined, CARRY_STRIDE: undefined,
    point3d(pose, which = 'mouth', facing = 1) { const p = D?.point3d?.(pose, which, facing); return p ? [p[0] * SCALE, p[1] * SCALE - HOVER] : null; },
    // (his swing FX -- src/dragonfx.js; src/player.js calls atkFx each frame of a swing and of the charged strike, hitFx on
    //  contact.  Keyed to the drawing that is showing (pose.clip / f_<clip>) and its landmarks: painter 3's move pack when it
    //  is decoded (own() above), else the duel's clip -- then only the old puff, from that drawing's mouth)
    atkFx(P, A, which) {
      const pose = P.pose(); if (!pose) return;
      const clip = pose.s3d >= 0.5 ? pose.clip : null, i = clip ? (pose['f_' + clip] | 0) : -1, g = P.game, f = P.facing;
      const key = which === 'cstrike' ? 'c' + (g.frame - P.st) : 's' + P.swings;
      const M = P._dfxM && P._dfxM.key === key ? P._dfxM : (P._dfxM = { key, done: {} });
      const lm = (p, w) => this.point3d(p, w, 1), at = (p, w) => worldOf(P, lm(p, w));
      const angAt = (p) => { const m = lm(p, 'mouth'), mf = lm(p, 'mouthF'); return m && mf ? Math.atan2(mf[1] - m[1], f * (mf[0] - m[0])) : (f > 0 ? 0 : Math.PI); };   // (screen angle, y down)
      const snoutAt = (p) => { const q = at(p, 'mouthF'); return q ? [q[0] + f * 6 * (P.bigV || 1), q[1], q[2]] : null; };   // (just past the snout tip)
      const F = () => fxOf(P), K = P.bigV || 1, A0 = A.a0 ?? 0;
      // (the bite's fire rides the drawing that is showing -- its anchors on the mouth and just past the snout tip (mouthF), moved
      //  each frame; a combo that cancels the clip (or a new swing) ends them: painter 3's critic pass 3 -- it hung on his cheek)
      const B = P._dfxBite;
      if (B && (clip !== 'bite' || B.key !== key)) { B.m.dead = true; B.f.dead = true; P._dfxBite = null; }
      else if (B) { const m = at(pose, 'mouth'), mf = snoutAt(pose); if (m) Object.assign(B.m, { x: m[0], y: m[1], z: m[2] }); if (mf) Object.assign(B.f, { x: mf[0], y: mf[1], z: mf[2] }); }
      if (clip === 'bite') {
        // (the jaws opening on drawing 1: a puff of fire out of the mouth, drawn in front of the foe -- the chomp is on contact, hitFx)
        if (i >= 1 && !M.done.puff) {
          M.done.puff = 1; const m = at(pose, 'mouth'), mf = snoutAt(pose) || m;
          if (m) { const Fx = F(), b = { key, m: Fx.anchor(m[0], m[1], m[2]), f: Fx.anchor(mf[0], mf[1], mf[2]) }; b.f.keep = 60; P._dfxBite = b; Fx.puff(m[0], m[1], m[2], angAt(pose), 1.05 * K, b.m); }
        }
      } else if (clip === 'claw') {
        if (i >= 1 && !M.done.arc) {   // (the swipe: from in front of his chest -- half way from drawing 1's raised claw to drawing 2's rake, not across his wing -- through 2 and 3)
          M.done.arc = 1;
          const d1 = at(this.ANIM.atk2(3.5 / (A.dur || 18)), 'clawR'), d2 = at(this.ANIM.atk2(5.5 / (A.dur || 18)), 'clawR'), d3 = at(this.ANIM.atk2(7.5 / (A.dur || 18)), 'clawR');
          const pts = d1 && d2 && d3 ? [d1.map((v, j) => (v + d2[j]) / 2), d2, d3] : [d2, d3].filter(Boolean);
          // (20 px ahead, toward the foe -- it lay over his own chest medallion -- and clipped at the ground: painter 3's critic pass 3)
          const fw = pts.map((q) => [q[0] + f * 20 * K, q[1], q[2]]);
          if (fw.length >= 2) F().arcs.push({ pts: fw, gy: P.y, t: 0, grow: Math.max(3, (A.a1 ?? 9) - A0 + 1), life: Math.max(3, (A.a1 ?? 9) - A0 + 1) + 8, claw: true, col: 'rgba(255,160,60,1)' });
        }
      } else if (clip === 'tailWhip') {
        if (i >= 2 && !M.done.arc) {   // (the whip: a curved whoosh round his body along the tail tip's sweep, trailing it -- no fire.  From
          //  drawing 2, the swing itself, not the back-view wind-up; 22 px up, at the tail's height -- it ran under his feet: critic pass 3)
          M.done.arc = 1;
          const up = (q) => (q ? [q[0], q[1], q[2] + 22 * K] : null);
          const b = up(at(this.ANIM.atk3(6.5 / (A.dur || 20)), 'body')), pts = [3.5, 6.5, 8.5].map((fr) => up(at(this.ANIM.atk3(fr / (A.dur || 20)), 'tail'))).filter(Boolean);
          if (b && pts.length >= 2) F().whoosh(b, pts[0], pts[pts.length - 1], f);
        }
      } else if (clip === 'rearUp') {
        if (i >= 4 && !M.done.cone) {   // (the lunge drawing -- painter 3's burst at f12: the fire cone out of the mouth)
          M.done.cone = 1;
          // (from just past the snout tip, aimed mouth -> mouthF of the drawing showing, both following the head as it lifts out of
          //  the lunge -- it started at his chin and kept drawing 4's downward aim: painter 3's critic pass 3)
          const m0 = snoutAt(pose), ang = angAt(pose); let last = m0, lastA = ang;
          if (m0) {
            const cur = () => { const p = P.pose(); return p && p.s3d >= 0.5 && p.clip === 'rearUp' ? p : null; };
            const cone = { t: 0, hold: 7, life: 17, len: 100 * K, ang, at: () => { const p = cur(), m = p ? snoutAt(p) : null; if (m) last = m; return last; },
              dir: () => { const p = cur(); if (p) lastA = angAt(p); return lastA; } };
            const Fx = F(); Fx.cones.push(cone);
            const ex = m0[0] + Math.cos(ang) * 30 * K, ez = m0[2] - Math.sin(ang) * 30 * K;
            Fx.sparks(ex, m0[1], ez, 6, f); Fx.embers(ex, m0[1], ez, 10, f, 1.3); Fx.soot(m0[0] - f * 10 * K, m0[1], m0[2] + 18 * K, 2, f);   // (the soot off his nostrils, above the cone's root: on it, it greyed the root out)
          }
        }
      } else if (which !== 'cstrike' && A.puff && P.st === A0) {   // (the duel's clip -- the move pack is not in: the old puff, from this drawing's mouth)
        const m = at(pose, 'mouth') || [P.x + f * (this.SHOOT_ORIGIN[0] * K + 24), P.y, P.z - this.SHOOT_ORIGIN[1] * K];
        F().puff(m[0], m[1], m[2], angAt(pose), (0.5 + 0.2 * A.puff) * K);
      }
    },
    hitFx(P, t, A, hx, hy, hz) {
      // (a bite landed: the CHOMP on contact -- as the hit-stop starts, so the jaws close on the target during the freeze (the critic:
      //  on drawing 3's snap it came after the freeze and read as a second hit) -- between his mouth and the contact point)
      const pose = P.pose(), clip = pose && pose.s3d >= 0.5 ? pose.clip : null, K = P.bigV || 1;
      if (clip !== 'bite') return;
      const M = P._dfxM && P._dfxM.key === 's' + P.swings ? P._dfxM : (P._dfxM = { key: 's' + P.swings, done: {} });
      if (M.done.chomp) return; M.done.chomp = 1;
      // (just past his snout tip -- the bite's anchor there, so it rides the drawing showing and goes if a combo cancels the clip)
      const B = P._dfxBite && P._dfxBite.key === 's' + P.swings ? P._dfxBite : null;
      const mf = worldOf(P, this.point3d(pose, 'mouthF', 1)), x = B ? B.f.x : mf ? mf[0] + P.facing * 6 * K : hx, z = B ? B.f.z : mf ? mf[2] : hz, Fx = fxOf(P);
      Fx.chomps.push({ x, y: hy, z, t: 2, life: 14, size: K, facing: P.facing, col: '#ffb04a', anc: B ? B.f : null });   // (t 2: the jaws all but shut through the freeze -- the world, this FX actor too, stands still in a hit-stop)
      Fx.sparks(x, hy, z, 4, P.facing, '#fff0b0'); Fx.embers(x, hy, z, 4, P.facing, 1, 12);
    },
    draw(ctx, pose, o = {}) {
      if (!D?.draw) return;
      // (knocked: painter 3's tumble -- a hit-stop held it on one drawing; a small decaying shudder for its first 10 frames
      //  reads as the blow landing, not a freeze.  Reduced motion: none -- the drawing holds)
      let jx = 0, jy = 0;
      if (!RM && pose && pose.s3d >= 0.5 && pose.clip === 'knock' && o.mem && o.t !== undefined) {
        const m = o.mem; if (m.dKn === undefined || !(o.t - m.dKnLast < 0.1)) m.dKn = o.t; m.dKnLast = o.t;
        const u = (o.t - m.dKn) * 60; if (u < 10) { const s = (Math.floor(u) % 2 ? 1 : -1) * 3.5 * (1 - u / 10); jx = s; jy = -Math.abs(s) * 0.4; }
      }
      ctx.save(); ctx.translate(jx, -HOVER * (o.scale || 1) + jy);
      D.draw(ctx, pose, { ...o, scale: (o.scale || 1) * SCALE });
      ctx.restore();
    },
  };
}
