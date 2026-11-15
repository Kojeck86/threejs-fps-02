// EMBERLINE — bots.js: the seven AI actors (3 Vanguard teammates, 4 Sentinel
// enemies). Each bot walks the waypoint graph, holds angles, reacts to
// gunshot noise, and only shoots what it can actually see: line of sight,
// range and a reaction delay gate every shot, and accuracy falls off with
// distance and target speed. Attackers carry the spike; defenders defuse it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './state.js';
import { createLoadout, giveWeapon, createWeaponSystem } from './weapons.js';

const BOT_NAMES_V = ['Rook', 'Fenn', 'Ilsa'];
const BOT_NAMES_S = ['Ash', 'Bram', 'Kestrel', 'Noor'];
const BOT_WEAPONS = ['rifle', 'rifle', 'smg', 'shotgun'];

export function applyDamage(target, dmg, attacker, state, effects, audio) {
  if (!target.alive) return;
  let remaining = dmg;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, Math.round(dmg * 0.5));
    target.armor -= absorbed; remaining -= absorbed;
  }
  target.hp -= remaining;
  if (target.isPlayer) audio.play('hurt');
  else effects.blood(target.pos.x, target.pos.y + 1.1, target.pos.z);
  if (target.hp <= 0) {
    target.hp = 0; target.alive = false; target.deathBy = attacker || null;
    state.feed.unshift({ text: `${attacker ? attacker.name : '—'}  ▸  ${target.name}`, t: state.time });
    if (state.feed.length > 5) state.feed.pop();
    if (attacker && attacker.isPlayer) {
      state.kills += 1; state.money += 300;
      audio.play('kill');
    }
    if (target.isPlayer) { state.deaths += 1; audio.play('lose'); }
  }
}

function makeMesh(scene, team) {
  const color = team === 'vanguard' ? PALETTE.vanguard : PALETTE.sentinel;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), bodyMat);
  body.position.y = 0.95; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), darkMat);
  head.position.y = 1.58; head.castShadow = true; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.05),
    new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.8 }));
  visor.position.set(0, 1.6, 0.19); g.add(visor);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.32), darkMat);
  legs.position.y = 0.28; g.add(legs);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.85), darkMat);
  gun.position.set(0.28, 1.15, 0.3); g.add(gun);
  scene.add(g);
  return g;
}

export function createBots(state, world, scene, effects, audio) {
  const sys = createWeaponSystem(state, world, effects, audio);
  const bots = [];
  const all = [
    ...BOT_NAMES_V.map((n, i) => ({ name: n, team: 'vanguard', spawn: [0, 1, 2][i] })),
    ...BOT_NAMES_S.map((n, i) => ({ name: n, team: 'sentinel', spawn: i })),
  ];
  for (const def of all) {
    const bot = {
      name: def.name, team: def.team, isPlayer: false,
      pos: new THREE.Vector3(0, 0, 0), yaw: 0, hp: 100, armor: 0, alive: true,
      loadout: createLoadout(), speed2d: 0, recoil: 0,
      cooldown: 0, reloadT: 0, aimDelay: 0, seeT: 0,
      mode: 'route', path: [], pathIdx: 0, holdPos: null, holdT: 0,
      target: null, investigate: null, plantT: 0, defuseT: 0, hasSpike: false,
      mesh: makeMesh(scene, def.team),
      stepT: 0,
    };
    const wk = BOT_WEAPONS[Math.floor(state.random() * BOT_WEAPONS.length)];
    giveWeapon(bot.loadout, wk);
    bot.loadout.current = wk;
    bots.push(bot);
  }
  state.bots = bots;

  function collide(px, pz) {
    for (const b of world.colliders) {
      if (b.maxY < 0.4) continue;
      const cx = Math.max(b.minX, Math.min(px, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
      const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
      if (d2 < 0.42 * 0.42) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); px = cx + (dx / d) * 0.42; pz = cz + (dz / d) * 0.42; }
      }
    }
    return [Math.max(-35, Math.min(35, px)), Math.max(-25, Math.min(25, pz))];
  }
  function pickRoute(bot, destWP) {
    const from = world.nearestWP(bot.pos.x, bot.pos.z);
    bot.path = world.route(from, destWP); bot.pathIdx = 0; bot.mode = 'route';
  }
  function visibleEnemy(bot, actors) {
    // Nearest opposing actor with clear LOS, in range, roughly in front.
    let best = null, bestD = 55;
    for (const a of actors) {
      if (!a.alive || a.team === bot.team) continue;
      const dx = a.pos.x - bot.pos.x, dz = a.pos.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      const ang = Math.atan2(-dx, -dz) - bot.yaw;
      const norm = Math.atan2(Math.sin(ang), Math.cos(ang));
      if (d > 6 && Math.abs(norm) > 1.35) continue; // outside view cone
      if (world.losBlocked(bot.pos.x, bot.pos.z, a.pos.x, a.pos.z)) continue;
      best = a; bestD = d;
    }
    return best;
  }

  function resetRound(round) {
    const siteKey = state.random() < 0.5 ? 'A' : 'B';
    state.attackSite = siteKey;
    const site = world.sites[siteKey];
    let vi = 0, si = 0;
    for (const bot of bots) {
      const spawns = bot.team === 'vanguard'
        ? [[-32, -4], [-32, 0], [-32, 4], [-30, -8]] : [[32, -4], [32, 0], [32, 4], [30, 8]];
      const s = spawns[bot.team === 'vanguard' ? vi++ : si++];
      bot.pos.set(s[0], 0, s[1]);
      bot.yaw = bot.team === 'vanguard' ? -Math.PI / 2 : Math.PI / 2;
      bot.hp = 100; bot.alive = true; bot.mode = 'route';
      bot.hasSpike = false; bot.plantT = 0; bot.defuseT = 0; bot.target = null;
      bot.investigate = null; bot.aimDelay = 0; bot.seeT = 0;
      bot.mesh.visible = true; bot.mesh.rotation.set(0, bot.yaw, 0);
      bot.mesh.position.copy(bot.pos);
      const wk = BOT_WEAPONS[Math.floor(state.random() * BOT_WEAPONS.length)];
      bot.loadout = createLoadout(); giveWeapon(bot.loadout, wk); bot.loadout.current = wk;
      if (bot.team === 'vanguard') {
        // Vanguard push: two bots to the chosen site, one mid.
        const dest = siteKey === 'A' ? 20 : 21;
        pickRoute(bot, bot.name === 'Fenn' ? 5 : dest);
      } else {
        // Sentinels split: two hold the likely site, two hold mid/long.
        const hold = { Ash: 20, Bram: 21, Kestrel: 12, Noor: 6 }[bot.name] ?? 6;
        pickRoute(bot, hold);
        bot.holdWP = hold;
      }
    }
    // One Vanguard bot carries the spike.
    const carrier = bots.find((b) => b.team === 'vanguard' && b.name === 'Rook');
    if (carrier) carrier.hasSpike = true;
  }

  function step(dt, player) {
    const actors = [...bots, player];
    for (const bot of bots) {
      if (!bot.alive) { bot.mesh.rotation.x = -Math.PI / 2; bot.mesh.position.y = 0.1; continue; }
      bot.mesh.rotation.x = 0;
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      bot.reloadT = Math.max(0, bot.reloadT - dt);
      bot.stepT += dt;
      const enemy = visibleEnemy(bot, actors);
      if (enemy) {
        if (bot.target !== enemy) { bot.target = enemy; bot.aimDelay = 0.35 + state.random() * 0.3; }
        bot.seeT += dt;
      } else { bot.target = null; bot.seeT = 0; }

      // Hear gunshots: investigate nearby noise while not engaged.
      if (!enemy && bot.stepT > 0.2) {
        bot.stepT = 0;
        for (const n of state.noise) {
          if (state.time - n.t < 1.5 && Math.hypot(n.x - bot.pos.x, n.z - bot.pos.z) < 26) {
            bot.investigate = { x: n.x, z: n.z };
            if (bot.mode === 'hold') pickRoute(bot, world.nearestWP(n.x, n.z));
          }
        }
      }
      // Low HP: fall back toward own spawn.
      if (bot.hp < 30 && bot.mode !== 'retreat') {
        bot.mode = 'retreat';
        pickRoute(bot, world.nearestWP(bot.team === 'vanguard' ? -32 : 32, 0));
      }
      if (bot.hp >= 55 && bot.mode === 'retreat') bot.mode = 'route';

      // Spike logic (attackers plant, defenders defuse).
      const site = world.sites[state.attackSite || 'A'];
      const atSite = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z) < site.r;
      if (state.spike.state === 'carried' && bot.team === 'vanguard' && bot.hasSpike && atSite && !enemy) {
        bot.mode = 'plant'; bot.plantT += dt;
        if (bot.plantT > 3) { state.spike.state = 'planted'; state.spike.site = state.attackSite; state.spike.timer = 35; state.spike.planter = bot; audio.play('plant'); }
      } else if (state.spike.state === 'planted' && bot.team === 'sentinel' && atSite && !enemy) {
        bot.mode = 'defuse'; bot.defuseT += dt;
        if (bot.defuseT > 4) { state.spike.state = 'defused'; audio.play('defuse'); }
      } else if (bot.mode === 'plant' || bot.mode === 'defuse') { bot.mode = 'route'; bot.plantT = 0; bot.defuseT = 0; }

      // Movement along the waypoint path.
      let mvx = 0, mvz = 0;
      if (bot.target) {
        // Face the target; strafe a little while shooting.
        const dx = bot.target.pos.x - bot.pos.x, dz = bot.target.pos.z - bot.pos.z;
        bot.yaw = Math.atan2(-dx, -dz);
        const strafe = Math.sin(state.time * 1.7 + bot.name.length) * 0.6;
        mvx = Math.cos(bot.yaw) * strafe; mvz = -Math.sin(bot.yaw) * strafe;
      } else if (bot.mode === 'route' && bot.pathIdx < bot.path.length) {
        const wp = world.waypoints[bot.path[bot.pathIdx]];
        const dx = wp[0] - bot.pos.x, dz = wp[1] - bot.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.8) { bot.pathIdx += 1; }
        else {
          mvx = (dx / d) * 3.4; mvz = (dz / d) * 3.4;
          bot.yaw = Math.atan2(-dx, -dz);
        }
      } else if (bot.mode === 'route' && bot.pathIdx >= bot.path.length) {
        bot.mode = 'hold'; bot.holdT = 0;
        bot.holdPos = { x: bot.pos.x, z: bot.pos.z };
      } else if (bot.mode === 'hold') {
        bot.holdT += dt;
        bot.yaw += Math.sin(state.time * 0.4 + bot.name.length * 2) * dt * 0.4; // scan
        if (bot.holdT > 9 && bot.team === 'vanguard' && state.spike.state === 'carried') {
          pickRoute(bot, world.nearestWP(site.x, site.z)); // push on
        }
      }
      if (bot.mode === 'plant' || bot.mode === 'defuse') { mvx = 0; mvz = 0; }
      const [nx, nz] = collide(bot.pos.x + mvx * dt, bot.pos.z + mvz * dt);
      bot.speed2d = Math.hypot(nx - bot.pos.x, nz - bot.pos.z) / Math.max(dt, 1e-4);
      bot.pos.x = nx; bot.pos.z = nz;
      bot.mesh.position.set(bot.pos.x, 0, bot.pos.z);
      bot.mesh.rotation.y = bot.yaw;

      // Shooting: only after the reaction delay, with accuracy that worsens
      // with range and target speed; reload when the magazine is empty.
      if (bot.target && bot.aimDelay <= 0 && bot.cooldown <= 0) {
        bot.aimDelay = 0;
        const key = bot.loadout.current;
        const ammo = bot.loadout.ammo[key];
        if (ammo.mag <= 0) {
          if (bot.reloadT <= 0 && ammo.reserve > 0) {
            bot.reloadT = WEAPONS[key].reload;
            const take = Math.min(WEAPONS[key].mag, ammo.reserve);
            ammo.mag = take; ammo.reserve -= take;
          }
        } else {
          bot.cooldown = WEAPONS[key].rate * (1.6 + state.random());
          const dist = Math.hypot(bot.target.pos.x - bot.pos.x, bot.target.pos.z - bot.pos.z);
          const targetSpeed = bot.target.speed2d || 0;
          const err = 0.012 + dist * 0.0011 + targetSpeed * 0.006;
          const eye = new THREE.Vector3(bot.pos.x, 1.5, bot.pos.z);
          const yaw = bot.yaw + (state.random() - 0.5) * 2 * err * 3;
          const pitch = (state.random() - 0.5) * 2 * err * 3;
          const foes = bot.team === 'vanguard' ? actors.filter((a) => a.team === 'sentinel') : actors.filter((a) => a.team === 'vanguard');
          const hit = sys.fire(bot, eye, yaw, pitch, foes, false);
          if (hit) {
            applyDamage(hit.target, hit.dmg, bot, state, effects, audio);
            audio.play('enemyShot');
          }
        }
      }
      if (bot.aimDelay > 0) bot.aimDelay -= dt;
    }
    // Drop expired noises.
    state.noise = state.noise.filter((n) => state.time - n.t < 2);
  }
  return { bots, step, resetRound };
}
