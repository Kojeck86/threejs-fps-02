// EMBERLINE — palette: a sunset industrial port. Orange dusk sky over dark
// grey steel, rusted containers in teal, rust red, ochre and slate blue.
// Every colour in the game comes from this one table.
export const PALETTE = {
  sky: 0x2a1a24,       // dusk purple-orange haze
  fog: 0x3a2020,
  ground: 0x4a4440,    // asphalt yard
  groundLine: 0x2e2b29,
  wall: 0x4a4642,      // concrete
  wallDark: 0x35322f,
  steel: 0x5a5f66,
  rust: 0xb45a2a,       // rusted orange accent
  ember: 0xff7a2a,      // sunset ember / HUD accent
  amber: 0xf0a830,
  teal: 0x2e7f7a,       // container teal
  ochre: 0xc98a2e,      // container ochre
  slate: 0x4a6a8a,      // container slate blue
  crimson: 0x9e3a2e,    // container red
  vanguard: 0x3fae6a,   // player team green
  sentinel: 0xd84a3a,   // enemy team red
  ink: 0xf2ede4,
  muted: 0xa89f92,
  lamp: 0xffc46a,
  spike: 0xffd23e,
};
export function hex(name) { return PALETTE[name]; }
