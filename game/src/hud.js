// EMBERLINE — hud.js: every DOM readout. The sim writes state; this module
// is the only one that touches the HUD DOM, and it only writes text when the
// value actually changed (cached strings), so the DOM is not churned per frame.
import { WEAPONS, BUY_ORDER, GRENADE_PRICE, ARMOR_PRICE } from './state.js';

export function createHud(state, callbacks) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hpBar: $('hp-bar'), hpNum: $('hp-num'), armor: $('armor'),
    ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), weapon: $('weapon-name'),
    timer: $('timer'), scoreV: $('score-v'), scoreS: $('score-s'),
    money: $('money'), cross: $('crosshair'), hit: $('hitmarker'),
    feed: $('feed'), msg: $('message'), spike: $('spike'),
    menu: $('menu'), buy: $('buy'), buyMoney: $('buy-money'),
    end: $('end'), endTitle: $('end-title'), endSub: $('end-sub'),
    roundBanner: $('round-banner'), mute: $('mute'),
  };
  const cache = {};
  function set(node, key, text) {
    if (cache[key] !== text) { cache[key] = text; node.textContent = text; }
  }
  function buildBuy() {
    const list = $('buy-list');
    list.innerHTML = '';
    for (const key of BUY_ORDER) {
      const w = WEAPONS[key];
      const b = document.createElement('button');
      b.className = 'buy-item';
      b.innerHTML = `<b>[${BUY_ORDER.indexOf(key) + 1}] ${w.name}</b><span>$${w.price} — ${w.damage} dmg · ${w.mag} rnd</span>`;
      b.addEventListener('click', () => callbacks.buy(key));
      list.appendChild(b);
    }
    const g = document.createElement('button');
    g.className = 'buy-item';
    g.innerHTML = `<b>[4] Frag Grenade</b><span>$${GRENADE_PRICE} — area damage, 2 s fuse</span>`;
    g.addEventListener('click', () => callbacks.buy('grenade'));
    list.appendChild(g);
    const a = document.createElement('button');
    a.className = 'buy-item';
    a.innerHTML = `<b>[5] Armor Vest</b><span>$${ARMOR_PRICE} — absorbs half of each hit</span>`;
    a.addEventListener('click', () => callbacks.buy('armor'));
    list.appendChild(a);
  }
  buildBuy();
  $('start-btn').addEventListener('click', () => callbacks.start());
  $('buy-start').addEventListener('click', () => callbacks.startRound());
  $('again-btn').addEventListener('click', () => callbacks.again());
  el.mute.addEventListener('click', () => callbacks.mute());

  let hitT = 0;
  return {
    showHit(head) { el.hit.classList.add('on'); if (head) el.hit.classList.add('head'); hitT = 0.15; },
    step(dt) {
      if (hitT > 0) { hitT -= dt; if (hitT <= 0) el.hit.classList.remove('on', 'head'); }
      const p = state.player;
      if (p) {
        set(el.hpNum, 'hp', String(Math.max(0, Math.ceil(p.hp))));
        el.hpBar.style.width = `${Math.max(0, p.hp)}%`;
        el.hpBar.style.background = p.hp > 50 ? '#3fae6a' : p.hp > 25 ? '#f0a830' : '#d84a3a';
        set(el.armor, 'armor', p.loadout.armor ? `ARMOR ${p.armor}` : '');
        const w = WEAPONS[p.loadout.current];
        const ammo = p.loadout.ammo[p.loadout.current];
        set(el.weapon, 'wname', w.name);
        set(el.ammoMag, 'mag', ammo ? String(ammo.mag) : '—');
        set(el.ammoRes, 'res', ammo ? `/ ${ammo.reserve}` : '');
        set(el.money, 'money', `$${state.money}`);
        const spread = 6 + (p.speed2d || 0) * 1.6;
        el.cross.style.setProperty('--gap', `${spread}px`);
      }
      set(el.timer, 'timer', state.phase === 'play' ? `${Math.max(0, Math.ceil(state.roundTime))}` : '—');
      set(el.scoreV, 'sv', String(state.score.vanguard));
      set(el.scoreS, 'ss', String(state.score.sentinel));
      const spike = state.spike;
      let spikeText = '';
      if (spike.state === 'planted') spikeText = `SPIKE PLANTED — ${Math.max(0, Math.ceil(spike.timer))}s`;
      else if (spike.state === 'carried') {
        spikeText = spike.progress > 0
          ? `PLANTING SPIKE… ${Math.round(spike.progress * 100)}%`
          : `SPIKE: ${state.attackSite ? 'Site ' + state.attackSite : 'with Rook'}`;
      }
      else if (spike.state === 'defused') spikeText = 'SPIKE DEFUSED';
      else if (spike.state === 'exploded') spikeText = 'SPIKE DETONATED';
      set(el.spike, 'spike', spikeText);
      if (state.messageT > 0) { set(el.msg, 'msg', state.message); el.msg.style.opacity = '1'; }
      else el.msg.style.opacity = '0';
      // Kill feed (newest first).
      const feedText = state.feed.map((f) => f.text).join('\n');
      set(el.feed, 'feed', feedText);
      // Phase overlays.
      el.menu.hidden = state.phase !== 'menu';
      el.buy.hidden = state.phase !== 'buy';
      el.end.hidden = state.phase !== 'matchEnd';
      if (state.phase === 'buy') set(el.buyMoney, 'bmoney', `Money: $${state.money} — Round ${state.round}`);
      const showBanner = state.phase === 'roundEnd';
      el.roundBanner.hidden = !showBanner;
      if (showBanner) {
        set(el.roundBanner, 'banner', state.roundWinner === 'vanguard' ? 'VANGUARD WINS THE ROUND' : 'SENTINEL WINS THE ROUND');
        el.roundBanner.className = state.roundWinner === 'vanguard' ? 'banner win' : 'banner lose';
      }
      if (state.phase === 'matchEnd') {
        const won = state.matchWinner === 'vanguard';
        set(el.endTitle, 'et', won ? 'VANGUARD TAKES THE MATCH' : 'SENTINEL TAKES THE MATCH');
        set(el.endSub, 'es', `Final score ${state.score.vanguard} — ${state.score.sentinel} · ${state.kills} kills`);
      }
      el.mute.textContent = state.muted ? '🔇 Muted' : '🔊 Sound';
    },
  };
}
