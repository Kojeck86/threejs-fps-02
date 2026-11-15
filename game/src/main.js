// EMBERLINE — main.js: bootstrap and the one loop. A fixed 60 Hz simulation
// (state, player, bots, weapons, rounds) is kept apart from rendering; the
// renderer only reads state and draws it. ?shot=start|play|end renders a
// deterministic frame for capture and sets window.__shotReady — no pointer
// lock or click is needed for those frames.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState, WEAPONS, BUY_ORDER } from './state.js';
import { createWorld, SPAWN_V } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createLoadout, giveWeapon, resetLoadout, createWeaponSystem } from './weapons.js';
import { createBots, applyDamage as botApplyDamage } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

const state = createState(seed);
state.shotMode = shot;
const audio = createAudio();
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
const world = createWorld(scene);
const effects = createEffects(scene);
const input = createInput(renderer.domElement, () => {});
const player = createPlayer(world.colliders, SPAWN_V[0][0], SPAWN_V[0][1], -Math.PI / 2);
player.name = 'You'; player.team = 'vanguard'; player.isPlayer = true;
player.loadout = createLoadout();
giveWeapon(player.loadout, 'pistol');
state.player = player;
const weapons = createWeaponSystem(state, world, effects, audio);
const bots = createBots(state, world, scene, effects, audio);

const rounds = createRounds(state, audio,
  () => { // onRoundStart
    bots.resetRound(state.round);
    const s = SPAWN_V[0];
    player.reset(s[0], s[1], -Math.PI / 2);
    resetLoadout(player.loadout, true);
    player.armor = player.loadout.armor ? 50 : 0;
    if (player.loadout.primary) player.loadout.current = player.loadout.primary;
    state.grenades = [];
  },
  () => { input.exitLock(); },
);

const hud = createHud(state, {
  start() { audio.unlock(); rounds.startMatch(); input.requestLock(); },
  startRound() { rounds.startRound(); input.requestLock(); },
  again() { rounds.startMatch(); input.requestLock(); },
  buy(kind) { rounds.buy(kind); },
  mute() { state.muted = !state.muted; audio.setMuted(state.muted); },
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- player actions inside the fixed step ---------------------------------
const _eye = new THREE.Vector3();
let plantT = 0, defuseT = 0, stepSoundT = 0;
function playerStep(dt) {
  player.step(input, dt);
  if (input.consume('KeyR')) weapons.startReload(player.loadout);
  if (input.consume('KeyG')) {
    _eye.set(player.pos.x, player.pos.y + player.eyeHeight, player.pos.z);
    if (weapons.throwGrenade(player, _eye, player.yaw, player.pitch)) audio.play('reload');
  }
  if (input.consume('KeyM')) { state.muted = !state.muted; audio.setMuted(state.muted); }
  if (state.phase === 'buy') {
    const order = [...BUY_ORDER, 'grenade', 'armor'];
    for (let i = 0; i < order.length; i++) {
      if (input.consume('Digit' + (i + 1))) rounds.buy(order[i]);
    }
    if (input.consume('Enter')) rounds.startRound();
  }
  // Footsteps while moving.
  if (player.speed2d > 2 && state.time - stepSoundT > 0.42) { stepSoundT = state.time; audio.play('step'); }
  // Firing (auto weapons keep firing while held).
  const w = WEAPONS[player.loadout.current];
  if (state.phase === 'play' && player.alive && input.firing && weapons.cooldown <= 0 && !weapons.reloading) {
    const ammo = player.loadout.ammo[player.loadout.current];
    if (ammo && ammo.mag > 0) {
      _eye.set(player.pos.x, player.pos.y + player.eyeHeight, player.pos.z);
      const foes = bots.bots.filter((b) => b.team === 'sentinel');
      const hit = weapons.fire(player, _eye, player.yaw, player.pitch, foes, true);
      if (hit) {
        botApplyDamage(hit.target, hit.dmg, player, state, effects, audio);
        hud.showHit(hit.head);
        audio.play('hit');
      }
      if (!w.auto) input.firing = false; // semi-auto: one shot per click
    } else if (ammo) {
      weapons.startReload(player.loadout);
      input.firing = false;
    }
  }
  // Plant / defuse: hold E inside a site.
  const site = world.sites[state.attackSite || 'A'];
  const inSite = Math.hypot(player.pos.x - site.x, player.pos.z - site.z) < site.r;
  if (state.phase === 'play' && player.alive && input.keys.has('KeyE') && inSite) {
    if (state.spike.state === 'carried') {
      plantT += dt;
      state.spike.progress = plantT / 3;
      if (plantT >= 3) {
        state.spike.state = 'planted'; state.spike.site = state.attackSite;
        state.spike.timer = 35; state.spike.planter = player;
        state.money += 300; state.message = 'Spike planted — defend it!'; state.messageT = 4;
        audio.play('plant'); plantT = 0;
      }
    } else if (state.spike.state === 'planted') {
      defuseT += dt;
      if (defuseT >= 4) { state.spike.state = 'defused'; audio.play('defuse'); defuseT = 0; }
    }
  } else { plantT = 0; defuseT = 0; state.spike.progress = 0; }
}

function simStep(dt) {
  state.time += dt;
  if (state.messageT > 0) state.messageT -= dt;
  weapons.step(dt);
  if (state.phase === 'play') {
    playerStep(dt);
    bots.step(dt, player);
    weapons.stepGrenades(dt, [...bots.bots, player]);
    // A grenade can kill the player or a bot: feed already recorded.
    const alive = { vanguard: 0, sentinel: 0 };
    if (player.alive) alive.vanguard += 1;
    for (const b of bots.bots) if (b.alive) alive[b.team] += 1;
    rounds.step(dt, alive);
  } else {
    rounds.step(dt, { vanguard: 1, sentinel: 1 });
  }
  // Keep dead bots' meshes down; hide the player mesh (first person has none).
  for (const b of bots.bots) if (!b.alive) b.mesh.visible = state.phase !== 'menu';
  input.endStep();
}

// --- screenshot modes ------------------------------------------------------
// All three shots stage the camera on Long Lane (z=-22), looking east down
// the lane toward Site A: a clear sightline with containers, lamps and bots.
function stageLane() {
  player.reset(-18, -18, -Math.PI / 2);
  const s1 = bots.bots.find((b) => b.name === 'Ash');
  const s2 = bots.bots.find((b) => b.name === 'Bram');
  const t1 = bots.bots.find((b) => b.name === 'Rook');
  s1.pos.set(0, 0, -19); s1.yaw = Math.PI / 2;
  s2.pos.set(7, 0, -17); s2.yaw = Math.PI / 2;
  t1.pos.set(-8, 0, -16); t1.yaw = -Math.PI / 2;
  for (const b of [s1, s2, t1]) {
    b.mode = 'hold'; b.mesh.position.copy(b.pos); b.mesh.rotation.y = b.yaw;
  }
}
function setupShot() {
  if (shot === 'start') {
    state.phase = 'menu';
    player.reset(-26, -22, -Math.PI / 2);
    bots.resetRound(1);
    stageLane();
  } else if (shot === 'play') {
    rounds.startMatch();
    rounds.startRound();
    bots.resetRound(1);
    // Run a few seconds of sim so the round timer and HUD are live, then
    // re-stage the framing (bots keep moving during the sim otherwise).
    for (let i = 0; i < 150; i++) simStep(FIXED_STEP);
    player.reset(-26, -22, -Math.PI / 2);
    player.loadout = createLoadout(); giveWeapon(player.loadout, 'rifle'); player.loadout.current = 'rifle';
    stageLane();
    state.money = 2450; state.kills = 1;
    state.feed.unshift({ text: 'You  ▸  Kestrel', t: 0 });
  } else if (shot === 'end') {
    rounds.startMatch();
    state.score.vanguard = 3; state.score.sentinel = 2; state.round = 6;
    state.phase = 'roundEnd'; state.phaseT = 0;
    state.roundWinner = 'vanguard'; state.roundReason = 'spike detonated';
    state.message = 'VANGUARD WINS — spike detonated'; state.messageT = 5;
    bots.resetRound(6);
    stageLane();
  }
  player.applyCamera(camera);
  hud.step(0);
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// --- main loop -------------------------------------------------------------
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (shot) return; // frozen capture frame
  acc += dt;
  while (acc >= FIXED_STEP) { simStep(FIXED_STEP); acc -= FIXED_STEP; }
  player.applyCamera(camera);
  hud.step(dt);
  renderer.render(scene, camera);
}

if (shot) setupShot();
else requestAnimationFrame(frame);

// Dev/debug hook: lets automated play-tests read live state (positions,
// health, round timer) without touching the DOM.
window.__emberline = { state, player, bots, input, weapons };
