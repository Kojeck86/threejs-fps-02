// EMBERLINE — effects.js: tracers, muzzle flash, impact sparks, blood puffs
// and explosions. All pooled: a fixed set of line/point objects is reused,
// nothing is allocated per shot in the hot loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0 }));
    line.frustumCulled = false; scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;
  const sparks = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09),
      new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
    m.visible = false; scene.add(m);
    sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
  }
  let sparkIdx = 0;
  const flash = new THREE.PointLight(0xffc46a, 0, 9, 2);
  scene.add(flash);

  function spawnSpark(x, y, z, color) {
    const s = sparks[sparkIdx]; sparkIdx = (sparkIdx + 1) % sparks.length;
    s.mesh.visible = true; s.mesh.material.color.setHex(color);
    s.mesh.position.set(x, y, z);
    s.vel.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4);
    s.life = 0.35;
  }
  return {
    tracer(origin, dir, dist) {
      const t = tracers[tracerIdx]; tracerIdx = (tracerIdx + 1) % tracers.length;
      const p = t.line.geometry.attributes.position.array;
      p[0] = origin.x; p[1] = origin.y; p[2] = origin.z;
      p[3] = origin.x + dir.x * dist; p[4] = origin.y + dir.y * dist; p[5] = origin.z + dir.z * dist;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.opacity = 0.9; t.life = 0.09;
      flash.position.copy(origin); flash.intensity = 24;
    },
    impact(x, y, z) { for (let i = 0; i < 4; i++) spawnSpark(x, y, z, PALETTE.amber); },
    blood(x, y, z) { for (let i = 0; i < 6; i++) spawnSpark(x, y, z, 0x8a1a12); },
    explosion(pos) {
      for (let i = 0; i < 16; i++) spawnSpark(pos.x, pos.y + 0.3, pos.z, i % 2 ? PALETTE.ember : PALETTE.amber);
      // A few slow grey smoke puffs linger above the fireball.
      for (let i = 0; i < 5; i++) spawnSpark(pos.x, pos.y + 0.8, pos.z, 0x777777);
      flash.position.copy(pos); flash.position.y += 0.5; flash.intensity = 60;
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.line.material.opacity = 0; }
      }
      for (const s of sparks) {
        if (s.life > 0) {
          s.life -= dt;
          s.mesh.position.addScaledVector(s.vel, dt);
          s.vel.y -= 9 * dt;
          if (s.life <= 0) s.mesh.visible = false;
        }
      }
      flash.intensity = Math.max(0, flash.intensity - dt * 220);
    },
  };
}
