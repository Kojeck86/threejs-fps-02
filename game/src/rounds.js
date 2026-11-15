// EMBERLINE — rounds.js: the round state machine and the economy. Phases:
// menu -> buy -> play -> roundEnd -> buy ... -> matchEnd. Money: win $3250,
// loss $1900, kill $300, plant $300. First to 5 rounds wins the match;
// if the round timer runs out, the defenders win the round.
import { WEAPONS, BUY_ORDER, GRENADE_PRICE, ARMOR_PRICE, ROUND_TIME, WIN_ROUNDS, SPIKE_TIME } from './state.js';
import { giveWeapon, resetLoadout } from './weapons.js';

export function createRounds(state, audio, onRoundStart, onMatchEnd) {
  const R = {
    buyTime: 0,
    startMatch() {
      state.score.vanguard = 0; state.score.sentinel = 0;
      state.round = 1; state.money = 800; state.kills = 0; state.deaths = 0;
      state.matchWinner = null;
      R.startBuy();
    },
    startBuy() {
      state.phase = 'buy'; state.phaseT = 0; R.buyTime = 20;
      state.spike = { state: 'carried', site: null, timer: 0, planter: null, defuser: null, progress: 0 };
      state.message = `Round ${state.round} — buy your gear`;
      state.messageT = 4;
    },
    startRound() {
      state.phase = 'play'; state.phaseT = 0;
      state.roundTime = ROUND_TIME;
      state.spike = { state: 'carried', site: null, timer: 0, planter: null, defuser: null, progress: 0 };
      state.message = `Round ${state.round} — plant the spike at Site ${state.attackSite || 'A'}`;
      state.messageT = 4;
      if (onRoundStart) onRoundStart(state.round);
    },
    endRound(winner, reason) {
      if (state.phase !== 'play') return;
      state.phase = 'roundEnd'; state.phaseT = 0;
      state.roundWinner = winner; state.roundReason = reason;
      state.score[winner] += 1;
      const won = winner === 'vanguard';
      state.money += won ? 3250 : 1900;
      if (state.spike.state === 'planted') state.money += 0;
      state.message = won ? `VANGUARD WINS — ${reason}` : `SENTINEL WINS — ${reason}`;
      state.messageT = 5;
      audio.play(won ? 'win' : 'lose');
      if (state.score.vanguard >= WIN_ROUNDS || state.score.sentinel >= WIN_ROUNDS) {
        state.matchWinner = state.score.vanguard >= WIN_ROUNDS ? 'vanguard' : 'sentinel';
        state.phase = 'matchEnd'; state.phaseT = 0;
        if (onMatchEnd) onMatchEnd(state.matchWinner);
      }
    },
    nextRound() {
      state.round += 1;
      R.startBuy();
    },
    // Buy: returns true when the purchase went through.
    buy(kind) {
      const p = state.player;
      if (state.phase !== 'buy' || !p) return false;
      if (kind === 'grenade') {
        if (p.loadout.grenades >= 2 || state.money < GRENADE_PRICE) { audio.play('denied'); return false; }
        state.money -= GRENADE_PRICE; p.loadout.grenades += 1;
      } else if (kind === 'armor') {
        if (p.loadout.armor || state.money < ARMOR_PRICE) { audio.play('denied'); return false; }
        state.money -= ARMOR_PRICE; p.loadout.armor = true;
      } else {
        const w = WEAPONS[kind];
        if (!w || state.money < w.price) { audio.play('denied'); return false; }
        if (p.loadout.primary === kind) { audio.play('denied'); return false; }
        state.money -= w.price;
        giveWeapon(p.loadout, kind);
      }
      audio.play('buy');
      return true;
    },
    step(dt, aliveCount) {
      state.phaseT += dt;
      if (state.phase === 'buy') {
        R.buyTime -= dt;
        if (R.buyTime <= 0) R.startRound();
      } else if (state.phase === 'play') {
        state.roundTime -= dt;
        // Spike countdown.
        if (state.spike.state === 'planted') {
          state.spike.timer -= dt;
          if (Math.ceil(state.spike.timer) !== Math.ceil(state.spike.timer + dt)) audio.play('beep');
          if (state.spike.timer <= 0) {
            state.spike.state = 'exploded';
            R.endRound('vanguard', 'spike detonated');
            return;
          }
        }
        if (state.spike.state === 'defused') { R.endRound('sentinel', 'spike defused'); return; }
        // If the spike is planted, the round is decided by the spike, not by
        // the last attacker dying: defenders must still defuse in time.
        if (state.spike.state === 'planted') return;
        if (aliveCount.vanguard === 0) { R.endRound('sentinel', 'Vanguard eliminated'); return; }
        if (aliveCount.sentinel === 0) {
          if (state.spike.state === 'planted') return; // spike still decides it
          R.endRound('vanguard', 'Sentinel eliminated');
          return;
        }
        if (state.roundTime <= 0) { R.endRound('sentinel', 'time expired'); return; }
      } else if (state.phase === 'roundEnd') {
        if (state.phaseT > 4) R.nextRound();
      }
    },
  };
  return R;
}
export { WEAPONS, BUY_ORDER, GRENADE_PRICE, ARMOR_PRICE, SPIKE_TIME };
