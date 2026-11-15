// EMBERLINE — world.js: builds "Emberline Yard", an original sunset industrial
// port map, entirely from three.js primitives. Also owns the collision data
// (axis-aligned boxes), the waypoint graph bots walk, the two spike sites,
// and line-of-sight tests. No external assets.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Map bounds: x in [-36, 36], z in [-26, 26]. Vanguard spawns west, Sentinel east.
// Site A (Container Yard) north-east, Site B (Warehouse) south-east.
export const SITES = {
  A: { name: 'Container Yard', x: 24, z: -16, r: 6.5 },
  B: { name: 'Warehouse', x: 24, z: 16, r: 6.5 },
};
export const SPAWN_V = [[-32, -4], [-32, 0], [-32, 4], [-30, -8]];
export const SPAWN_S = [[32, -4], [32, 0], [32, 4], [30, 8]];

// Waypoint graph: nodes [x, z]; edges are index pairs. Lanes: Long Lane runs
// along the north edge (z=-22), Mid Alley through the centre, Underpass south.
const WP = [
  [-30, 0], [-22, 0], [-14, 0], [-6, 0], [2, 0], [10, 0], [18, 0], [26, 0], // 0-7 mid
  [-30, -20], [-18, -22], [-6, -22], [6, -22], [18, -22], [28, -20],          // 8-13 long
  [-30, 20], [-18, 20], [-6, 20], [6, 20], [18, 20], [28, 20],                // 14-19 underpass
  [24, -16], [24, 16], [14, -10], [14, 10], [-12, -10], [-12, 10],            // 20-25 sites/links
  [30, -10], [30, 10], [0, -12], [0, 12],                                     // 26-29
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
  [8, 9], [9, 10], [10, 11], [11, 12], [12, 13],
  [14, 15], [15, 16], [16, 17], [17, 18], [18, 19],
  [0, 8], [0, 14], [7, 20], [7, 21], [13, 20], [13, 26], [19, 21], [19, 27],
  [2, 24], [4, 28], [4, 29], [5, 22], [5, 23], [6, 22], [6, 23],
  [10, 28], [11, 22], [12, 20], [16, 29], [17, 23], [18, 21],
  [20, 26], [21, 27], [24, 28], [25, 29], [22, 26], [23, 27], [28, 29],
  [8, 24], [14, 25], [9, 24], [15, 25],
];

function segHitsBox(x1, z1, x2, z2, b) {
  // 2D slab test: does segment (x1,z1)-(x2,z2) cross box {minX,maxX,minZ,maxZ}?
  const dx = x2 - x1, dz = z2 - z1;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) { if (x1 < b.minX || x1 > b.maxX) return false; }
  else {
    let t1 = (b.minX - x1) / dx, t2 = (b.maxX - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (z1 < b.minZ || z1 > b.maxZ) return false; }
  else {
    let t1 = (b.minZ - z1) / dz, t2 = (b.maxZ - z1) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

export function segHitsBox3D(p, d, maxT, b) {
  // Ray p + t*d, t in [0,maxT], vs AABB {minX..maxY}. Returns t or -1.
  let tmin = 0, tmax = maxT;
  const axes = [['x', 'minX', 'maxX'], ['y', 'minY', 'maxY'], ['z', 'minZ', 'maxZ']];
  for (const [ax, lo, hi] of axes) {
    const o = p[ax], dir = d[ax];
    if (Math.abs(dir) < 1e-9) { if (o < b[lo] || o > b[hi]) return -1; }
    else {
      let t1 = (b[lo] - o) / dir, t2 = (b[hi] - o) / dir;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

export function createWorld(scene) {
  const colliders = []; // {minX,maxX,minZ,maxZ,minY,maxY}
  const mats = {};
  function mat(color, rough = 0.9) {
    if (!mats[color]) mats[color] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.15 });
    return mats[color];
  }
  function box(x, z, w, d, h, color, y = 0, collide = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    if (collide) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h });
    return m;
  }
  function barrel(x, z, color) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 12), mat(color, 0.6));
    m.position.set(x, 0.6, z); m.castShadow = true; scene.add(m);
    colliders.push({ minX: x - 0.55, maxX: x + 0.55, minZ: z - 0.55, maxZ: z + 0.55, minY: 0, maxY: 1.2 });
  }
  function lamp(x, z, h = 5) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 8), mat(PALETTE.steel, 0.5));
    pole.position.set(x, h / 2, z); scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.lamp, emissive: PALETTE.lamp, emissiveIntensity: 2 }));
    bulb.position.set(x, h, z); scene.add(bulb);
    const light = new THREE.PointLight(PALETTE.lamp, 26, 18, 1.8);
    light.position.set(x, h - 0.3, z); scene.add(light);
    colliders.push({ minX: x - 0.1, maxX: x + 0.1, minZ: z - 0.1, maxZ: z + 0.1, minY: 0, maxY: h });
  }

  // Ground + perimeter
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(76, 56),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // painted yard lines
  for (const z of [-22, 0, 20]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(70, 0.3),
      new THREE.MeshStandardMaterial({ color: PALETTE.amber, roughness: 1 }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.02, z); scene.add(line);
  }
  box(0, -27, 76, 2, 4, PALETTE.wall); box(0, 27, 76, 2, 4, PALETTE.wall);
  box(-37, 0, 2, 56, 4, PALETTE.wall); box(37, 0, 2, 56, 4, PALETTE.wall);

  // Site A — Container Yard: stacked coloured containers, narrow lanes
  box(20, -18, 6, 2.4, 2.6, PALETTE.teal); box(20, -18, 6, 2.4, 2.6, PALETTE.teal, 2.6);
  box(28, -14, 2.4, 6, 2.6, PALETTE.crimson);
  box(24, -22, 6, 2.4, 2.6, PALETTE.ochre);
  box(16, -14, 2.4, 5, 2.6, PALETTE.slate);
  box(28, -20, 4, 2.4, 2.6, PALETTE.teal);
  box(18, -10, 3, 1.2, 1.2, PALETTE.rust); // low crate cover
  barrel(22, -12, PALETTE.rust); barrel(26, -19, PALETTE.steel);

  // Site B — Warehouse: walls, central aisle, mezzanine platform (high ground)
  box(24, 12, 12, 1, 3.4, PALETTE.wallDark);           // back wall of hall
  box(18, 18, 1, 8, 3.4, PALETTE.wallDark);
  box(30, 18, 1, 8, 3.4, PALETTE.wallDark);
  box(24, 20, 5, 1.2, 1.2, PALETTE.ochre);             // central crate
  box(20, 16, 2, 2, 1.2, PALETTE.rust);
  // mezzanine: platform you can climb via crates (visual steps)
  const mez = box(28, 13, 6, 4, 0.4, PALETTE.steel, 2.2, false);
  mez.receiveShadow = true;
  box(28, 15.2, 0.3, 4, 1, PALETTE.steel, 2.6, false); // rail
  box(31, 13, 1, 1, 1.1, PALETTE.rust); box(31, 13, 1, 1, 1.1, PALETTE.rust, 1.1);
  barrel(18, 14, PALETTE.teal); barrel(28, 21, PALETTE.crimson);

  // Mid Alley: staggered cover, a bend wall
  box(-10, -3, 1.2, 6, 2.2, PALETTE.wallDark);
  box(-2, 3, 1.2, 6, 2.2, PALETTE.wallDark);
  box(6, -3, 1.2, 6, 2.2, PALETTE.wallDark);
  box(12, 2, 3, 1.2, 1.2, PALETTE.rust);
  box(-16, 4, 2, 2, 1.2, PALETTE.ochre);
  barrel(-6, -5, PALETTE.steel); barrel(4, 5, PALETTE.rust);

  // Long Lane: low walls, sightline down the north edge
  box(-14, -19, 8, 1, 1.4, PALETTE.wallDark);
  box(2, -19, 8, 1, 1.4, PALETTE.wallDark);
  box(14, -24, 1, 5, 2.4, PALETTE.wallDark);

  // Underpass: roofed tunnel section along the south (roof beams + side walls)
  box(-12, 17, 12, 1, 3, PALETTE.wallDark);
  box(-12, 23, 12, 1, 3, PALETTE.wallDark);
  const roof = box(-12, 20, 12, 7, 0.4, PALETTE.wall, 3, false);
  roof.castShadow = true;
  box(0, 17, 10, 1, 3, PALETTE.wallDark);
  box(0, 23, 10, 1, 3, PALETTE.wallDark);
  box(0, 20, 10, 7, 0.4, PALETTE.wall, 3, false);

  // Spawn cover + scattered crates
  box(-28, -8, 3, 1.2, 1.2, PALETTE.teal); box(-28, 8, 3, 1.2, 1.2, PALETTE.crimson);
  box(32, -8, 2, 2, 1.2, PALETTE.slate); box(32, 8, 2, 2, 1.2, PALETTE.ochre);
  box(-22, -12, 2, 2, 1.2, PALETTE.rust); box(10, 12, 2, 2, 1.2, PALETTE.teal);

  // Sunset lighting: low orange sun + cool ambient + lamps
  const sun = new THREE.DirectionalLight(0xff8a3d, 3.0);
  sun.position.set(-30, 18, -20); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xff9a5a, 0x2a2530, 1.5));
  lamp(-20, -22); lamp(20, -22); lamp(-20, 20); lamp(20, 20); lamp(24, -16); lamp(24, 16);
  // Site markers: glowing floor rings so each site reads at a glance
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.4, s.r, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.spike, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.03, s.z); scene.add(ring);
  }

  // Waypoint adjacency
  const adj = WP.map(() => []);
  for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a); }

  function losBlocked(x1, z1, x2, z2) {
    for (const b of colliders) {
      if (b.maxY < 1.3) continue; // low crates do not block sight
      if (segHitsBox(x1, z1, x2, z2, b)) return true;
    }
    return false;
  }
  function nearestWP(x, z) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < WP.length; i++) {
      const dx = WP[i][0] - x, dz = WP[i][1] - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // BFS route over the waypoint graph.
  function route(from, to) {
    const prev = new Array(WP.length).fill(-1);
    const q = [from]; prev[from] = from;
    while (q.length) {
      const cur = q.shift();
      if (cur === to) break;
      for (const n of adj[cur]) if (prev[n] === -1) { prev[n] = cur; q.push(n); }
    }
    if (prev[to] === -1) return [to];
    const path = []; let c = to;
    while (c !== from) { path.unshift(c); c = prev[c]; }
    return path;
  }
  return { colliders, waypoints: WP, adj, route, nearestWP, losBlocked, sites: SITES };
}
