// EMBERLINE — state.js: the single place game state lives. Every module reads
// and writes this object; nothing else keeps a parallel copy of round, score
// or money. Fixed-step sim (1/60 s) advances it; rendering only reads it.
export function mulberry32(initial) {
  let a = initial >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weapon table: hitscan. damage = body damage at close range; headshot x2.
// falloff = fraction kept at long range. spread in radians (standing still).
export const WEAPONS = {
  pistol:  { name: 'P-9 Sidearm', price: 0,    damage: 26, headMul: 2, rate: 0.28, mag: 12, reserve: 48, reload: 1.1, spread: 0.012, moveSpread: 0.02, pellets: 1, auto: false, range: 60, falloff: 0.6, kick: 0.011, sound: 'pistol' },
  rifle:   { name: 'VK-47 Ember Rifle', price: 2700, damage: 34, headMul: 2, rate: 0.11, mag: 30, reserve: 90, reload: 2.2, spread: 0.006, moveSpread: 0.028, pellets: 1, auto: true,  range: 120, falloff: 0.75, kick: 0.02, sound: 'rifle' },
  smg:     { name: 'HX-9 Spark SMG', price: 1500, damage: 20, headMul: 2, rate: 0.07, mag: 32, reserve: 96, reload: 1.8, spread: 0.02, moveSpread: 0.03, pellets: 1, auto: true,  range: 55, falloff: 0.5, kick: 0.012, sound: 'smg' },
  shotgun: { name: 'M-12 Breacher', price: 1700, damage: 14, headMul: 2, rate: 0.85, mag: 6, reserve: 24, reload: 2.6, spread: 0.05, moveSpread: 0.05, pellets: 8, auto: false, range: 28, falloff: 0.25, kick: 0.05, sound: 'shotgun' },
};
export const BUY_ORDER = ['rifle', 'smg', 'shotgun'];
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const ROUND_TIME = 100;
export const WIN_ROUNDS = 5;
export const SPIKE_TIME = 35; // seconds from plant to detonation

export function createState(seed) {
  return {
    seed,
    random: mulberry32(seed),
    time: 0,            // total sim time
    phase: 'menu',      // menu | buy | play | roundEnd | matchEnd
    phaseT: 0,          // time in current phase
    round: 1,
    roundTime: ROUND_TIME,
    score: { vanguard: 0, sentinel: 0 },
    money: 800,
    kills: 0, deaths: 0,
    spike: { state: 'carried', site: null, timer: 0, planter: null, defuser: null, progress: 0 },
    // spike.state: carried | planted | defused | exploded
    roundWinner: null, roundReason: '',
    matchWinner: null,
    feed: [],           // kill feed entries {text, t}
    message: '', messageT: 0,
    muted: false,
    player: null,       // filled by player.js
    bots: [],           // filled by bots.js
    grenades: [],
    tracers: [],
    particles: [],
    noise: [],          // {x, z, t} gunshot noises bots hear
    shotMode: null,     // 'start' | 'play' | 'end' for ?shot=
  };
}
