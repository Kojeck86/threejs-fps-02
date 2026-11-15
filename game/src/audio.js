// EMBERLINE — audio.js: every sound is synthesised with WebAudio. No audio
// files, no network. A tiny helper builds noise bursts and oscillators; each
// named sound is a short envelope over one of them.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch { return false; }
    return true;
  }
  function noiseBuffer(dur) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function burst(dur, filterFreq, gain, type = 'lowpass') {
    if (!ensure() || muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }
  function tone(freq, dur, gain, type = 'sine', slideTo = 0) {
    if (!ensure() || muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur);
  }
  const sounds = {
    rifle() { burst(0.12, 1800, 0.5); tone(180, 0.08, 0.25, 'square', 60); },
    smg() { burst(0.08, 2400, 0.35); tone(220, 0.05, 0.18, 'square', 90); },
    shotgun() { burst(0.28, 900, 0.7); tone(120, 0.2, 0.35, 'square', 40); },
    pistol() { burst(0.1, 2200, 0.4); tone(200, 0.06, 0.2, 'square', 80); },
    enemyShot() { burst(0.1, 1200, 0.22); },
    reload() { tone(500, 0.06, 0.15, 'square'); setTimeout(() => tone(700, 0.06, 0.15, 'square'), 180); },
    dryfire() { tone(900, 0.04, 0.12, 'square'); },
    hit() { tone(1400, 0.05, 0.2, 'sine'); },
    kill() { tone(1400, 0.05, 0.2, 'sine'); setTimeout(() => tone(1800, 0.08, 0.2, 'sine'), 60); },
    hurt() { tone(160, 0.15, 0.3, 'sawtooth', 80); },
    step() { burst(0.05, 400, 0.08); },
    explosion() { burst(0.7, 300, 0.9); tone(60, 0.6, 0.5, 'sine', 30); },
    plant() { tone(600, 0.1, 0.2, 'square'); setTimeout(() => tone(600, 0.1, 0.2, 'square'), 150); setTimeout(() => tone(900, 0.15, 0.2, 'square'), 300); },
    defuse() { tone(900, 0.1, 0.2, 'square'); setTimeout(() => tone(1200, 0.12, 0.2, 'square'), 150); },
    beep() { tone(1100, 0.08, 0.18, 'sine'); },
    win() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.25, 'sine'), i * 140)); },
    lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.25, 'sine'), i * 160)); },
    buy() { tone(880, 0.07, 0.2, 'sine'); setTimeout(() => tone(1320, 0.1, 0.2, 'sine'), 80); },
    click() { tone(1200, 0.04, 0.12, 'sine'); },
    denied() { tone(220, 0.12, 0.2, 'square'); },
  };
  return {
    play(name) { const fn = sounds[name]; if (fn) fn(); },
    unlock() { ensure(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted() { return muted; },
  };
}
