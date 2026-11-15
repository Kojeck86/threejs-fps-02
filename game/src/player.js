// EMBERLINE — player.js: first-person movement with acceleration, friction,
// crouch, jump and AABB collision that slides along walls. The camera is the
// player's eyes; recoil is a pitch offset that decays back to zero.
import * as THREE from 'three';

const RADIUS = 0.42;
const EYE_STAND = 1.62, EYE_CROUCH = 1.05;
const WALK = 5.2, SPRINT = 7.4, CROUCH_SPEED = 2.6;

export function createPlayer(colliders, x, z, yaw) {
  const player = {
    pos: new THREE.Vector3(x, 0, z),
    vel: new THREE.Vector3(),
    yaw, pitch: 0, recoil: 0,
    crouched: false, onGround: true,
    hp: 100, armor: 0, alive: true,
    eyeHeight: EYE_STAND,
  };
  // Circle (x,z) vs AABB, with slide: resolve each axis separately.
  function collide(px, pz) {
    for (const b of colliders) {
      if (b.maxY < 0.4) continue;
      const cx = Math.max(b.minX, Math.min(px, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
      const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          px = cx + (dx / d) * RADIUS; pz = cz + (dz / d) * RADIUS;
        } else {
          // centre inside box: push out along the smallest penetration axis
          const pl = px - b.minX, pr = b.maxX - px, pt = pz - b.minZ, pb = b.maxZ - pz;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) px = b.minX - RADIUS; else if (m === pr) px = b.maxX + RADIUS;
          else if (m === pt) pz = b.minZ - RADIUS; else pz = b.maxZ + RADIUS;
        }
      }
    }
    return [Math.max(-35, Math.min(35, px)), Math.max(-25, Math.min(25, pz))];
  }
  player.collide = collide;

  player.step = function step(input, dt) {
    if (!player.alive) return;
    // Mouse look (sensitivity tuned for desktop Chrome)
    player.yaw -= input.mouseDX * 0.0022;
    player.pitch -= input.mouseDY * 0.0022;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
    player.recoil *= Math.pow(0.0001, dt); // fast decay toward 0
    player.crouched = input.keys.has('ControlLeft') || input.keys.has('KeyC');
    const targetEye = player.crouched ? EYE_CROUCH : EYE_STAND;
    player.eyeHeight += (targetEye - player.eyeHeight) * Math.min(1, dt * 12);

    const sprint = input.keys.has('ShiftLeft') && !player.crouched;
    const speed = player.crouched ? CROUCH_SPEED : sprint ? SPRINT : WALK;
    let fx = 0, fz = 0;
    if (input.keys.has('KeyW')) fz -= 1;
    if (input.keys.has('KeyS')) fz += 1;
    if (input.keys.has('KeyA')) fx -= 1;
    if (input.keys.has('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    // forward = (-sin, -cos), right = (cos, -sin); W sets fz=-1 -> forward.
    const wx = (fx * cos + fz * sin) * speed;
    const wz = (-fx * sin + fz * cos) * speed;
    // Acceleration / deceleration: velocity chases the wish velocity.
    const accel = player.onGround ? 14 : 5;
    player.vel.x += (wx - player.vel.x) * Math.min(1, accel * dt);
    player.vel.z += (wz - player.vel.z) * Math.min(1, accel * dt);
    const nx = player.pos.x + player.vel.x * dt;
    const nz = player.pos.z + player.vel.z * dt;
    const [cx, cz] = collide(nx, nz);
    player.pos.x = cx; player.pos.z = cz;
    if (input.keys.has('Space') && player.onGround) {
      player.vel.y = 4.6; player.onGround = false;
    }
    if (!player.onGround) {
      player.vel.y -= 14 * dt;
      player.pos.y += player.vel.y * dt;
      if (player.pos.y <= 0) { player.pos.y = 0; player.vel.y = 0; player.onGround = true; }
    }
    player.speed2d = Math.hypot(player.vel.x, player.vel.z);
  };

  player.applyCamera = function applyCamera(camera) {
    camera.position.set(player.pos.x, player.pos.y + player.eyeHeight, player.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch + player.recoil;
    camera.rotation.z = 0;
  };
  player.reset = function reset(x, z, yaw) {
    player.pos.set(x, 0, z); player.vel.set(0, 0, 0);
    player.yaw = yaw; player.pitch = 0; player.recoil = 0;
    player.hp = 100; player.alive = true; player.crouched = false;
  };
  return player;
}
