// EMBERLINE — weapons.js: weapon state, hitscan firing, reload, and the frag
// grenade. A shot is a ray from the camera: first wall hit (segment vs AABB)
// vs first bot hitbox (head sphere, then body capsule) decides the hit.
// Damage falls off with range; headshots deal 2x. Spread grows while moving
// or firing, so stopping to aim pays. No allocations in the hot path: the
// direction and hit result are reused module-level objects.
import * as THREE from 'three';
import { WEAPONS } from './state.js';
import { segHitsBox3D as segBox } from './world.js';

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

export function createLoadout() {
  return {
    primary: null,          // weapon key or null
    sidearm: 'pistol',
    current: 'pistol',
    ammo: {},               // key -> {mag, reserve}
    grenades: 0,
    armor: false,
  };
}
export function giveWeapon(loadout, key) {
  const w = WEAPONS[key];
  loadout.ammo[key] = { mag: w.mag, reserve: w.reserve };
  if (key !== 'pistol') loadout.primary = key;
  loadout.current = key;
}
export function resetLoadout(loadout, keepPrimary) {
  const primary = keepPrimary ? loadout.primary : null;
  loadout.primary = primary;
  loadout.current = primary || 'pistol';
  loadout.ammo = {};
  giveWeapon(loadout, 'pistol');
  if (primary) giveWeapon(loadout, primary);
  loadout.grenades = 0; loadout.armor = false;
}

export function createWeaponSystem(state, world, effects, audio) {
  const sys = {
    cooldown: 0, reloading: 0, reloadKey: null, spreadBloom: 0,
    // Fire one hitscan shot from `eye` along `yaw/pitch`. `shooter` is the
    // player or a bot; `targets` are the opposing actors. Returns hit info.
    fire(shooter, eye, yaw, pitch, targets, isPlayer) {
      const loadout = shooter.loadout;
      const key = loadout.current;
      const w = WEAPONS[key];
      const ammo = loadout.ammo[key];
      if (!ammo || ammo.mag <= 0) { audio.play('dryfire'); return null; }
      ammo.mag -= 1;
      sys.cooldown = w.rate;
      const moving = (shooter.speed2d || 0) > 1;
      const spread = w.spread + (moving ? w.moveSpread : 0) + sys.spreadBloom;
      sys.spreadBloom = Math.min(0.06, sys.spreadBloom + (key === 'rifle' ? 0.006 : 0.004));
      if (isPlayer) shooter.recoil = (shooter.recoil || 0) + w.kick;
      let best = null;
      for (let p = 0; p < w.pellets; p++) {
        const sy = yaw + (state.random() - 0.5) * 2 * spread;
        const sp = pitch + (state.random() - 0.5) * 2 * spread;
        _dir.set(-Math.sin(sy) * Math.cos(sp), Math.sin(sp), -Math.cos(sy) * Math.cos(sp));
        _origin.copy(eye);
        // Nearest wall along the ray.
        let wallT = w.range;
        for (const b of world.colliders) {
          const t = segBox(_origin, _dir, w.range, b);
          if (t >= 0 && t < wallT) wallT = t;
        }
        // Nearest opposing actor: head sphere (r 0.22 at eye height) then body.
        let hit = null, hitT = wallT;
        for (const t of targets) {
          if (!t.alive) continue;
          const dx = t.pos.x - _origin.x, dy = (t.pos.y + 1.45) - _origin.y, dz = t.pos.z - _origin.z;
          const along = dx * _dir.x + dy * _dir.y + dz * _dir.z;
          if (along < 0 || along > hitT) continue;
          const px = _origin.x + _dir.x * along, py = _origin.y + _dir.y * along, pz = _origin.z + _dir.z * along;
          const hdx = px - t.pos.x, hdy = py - (t.pos.y + 1.45), hdz = pz - t.pos.z;
          if (hdx * hdx + hdy * hdy + hdz * hdz < 0.22 * 0.22) { hit = { target: t, head: true, t: along }; hitT = along; continue; }
          const bdy = py - (t.pos.y + 0.9);
          if (Math.abs(px - t.pos.x) < 0.42 && bdy > -0.9 && bdy < 0.9 && Math.abs(pz - t.pos.z) < 0.42) {
            hit = { target: t, head: false, t: along }; hitT = along;
          }
        }
        const endT = hit ? hit.t : wallT;
        effects.tracer(_origin, _dir, endT);
        if (hit) {
          const fall = 1 - (1 - w.falloff) * Math.min(1, hit.t / w.range);
          const dmg = Math.round(w.damage * fall * (hit.head ? w.headMul : 1));
          if (!best || hit.t < best.t) best = { ...hit, dmg };
        } else if (wallT < w.range) {
          effects.impact(_origin.x + _dir.x * wallT, _origin.y + _dir.y * wallT, _origin.z + _dir.z * wallT);
        }
      }
      audio.play(w.sound);
      if (isPlayer) state.noise.push({ x: eye.x, z: eye.z, t: state.time });
      return best;
    },
    startReload(loadout) {
      const key = loadout.current;
      const ammo = loadout.ammo[key];
      if (!ammo || ammo.mag >= WEAPONS[key].mag || ammo.reserve <= 0 || sys.reloading > 0) return false;
      sys.reloading = WEAPONS[key].reload; sys.reloadKey = key;
      audio.play('reload');
      return true;
    },
    step(dt) {
      sys.cooldown = Math.max(0, sys.cooldown - dt);
      sys.spreadBloom = Math.max(0, sys.spreadBloom - dt * 0.05);
      if (sys.reloading > 0) {
        sys.reloading -= dt;
        if (sys.reloading <= 0) {
          const key = sys.reloadKey;
          const w = WEAPONS[key];
          const ammo = state.player.loadout.ammo[key];
          if (ammo) {
            const need = w.mag - ammo.mag;
            const take = Math.min(need, ammo.reserve);
            ammo.mag += take; ammo.reserve -= take;
          }
          sys.reloadKey = null;
        }
      }
    },
    // Frag grenade: simple ballistic arc, ~2 s fuse, area damage by distance.
    throwGrenade(shooter, eye, yaw, pitch) {
      const loadout = shooter.loadout;
      if (loadout.grenades <= 0) return false;
      loadout.grenades -= 1;
      const g = {
        pos: eye.clone(), fuse: 2.0,
        vel: new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch) + 0.35, -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(11),
        owner: shooter,
      };
      state.grenades.push(g);
      return true;
    },
    stepGrenades(dt, actors) {
      for (let i = state.grenades.length - 1; i >= 0; i--) {
        const g = state.grenades[i];
        g.vel.y -= 12 * dt;
        g.pos.addScaledVector(g.vel, dt);
        if (g.pos.y < 0.15) { g.pos.y = 0.15; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
        g.fuse -= dt;
        if (g.fuse <= 0) {
          effects.explosion(g.pos);
          audio.play('explosion');
          for (const a of actors) {
            if (!a.alive) continue;
            const d = Math.hypot(a.pos.x - g.pos.x, a.pos.z - g.pos.z);
            if (d < 7) {
              const dmg = Math.round(95 * (1 - d / 7));
              a.hp -= dmg;
              if (a.hp <= 0) { a.alive = false; a.deathBy = g.owner; }
            }
          }
          state.grenades.splice(i, 1);
        }
      }
    },
  };
  return sys;
}
