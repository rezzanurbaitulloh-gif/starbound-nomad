/* ============================================================
   audio.js — fully procedural WebAudio (no external assets)
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  const A = (SB.audio = {
    ctx: null,
    master: null,
    enabled: true,
    volume: 0.7,
    _engine: null,
    _ambient: null,
  });

  function ensure() {
    if (A.ctx) return A.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { A.enabled = false; return null; }
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.volume;
    const comp = A.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    A.master.connect(comp);
    comp.connect(A.ctx.destination);
    return A.ctx;
  }

  A.unlock = function () {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };

  A.setVolume = (v) => {
    A.volume = Math.max(0, Math.min(1, v));
    if (A.master) A.master.gain.value = A.volume;
  };

  function env(node, t0, a, d, peak = 1) {
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g);
    g.connect(A.master);
    return g;
  }

  function tone(freq, dur, type = 'sine', peak = 0.3, slideTo = null, delay = 0) {
    if (!A.enabled) return;
    const ctx = ensure(); if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    env(o, t0, Math.min(0.03, dur * 0.2), dur, peak);
    o.start(t0); o.stop(t0 + dur + 0.08);
  }

  function noiseBurst(dur, filterType, freq, peak = 0.3, delay = 0, q = 1) {
    if (!A.enabled) return;
    const ctx = ensure(); if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    src.connect(f);
    env(f, t0, 0.008, dur, peak);
    src.start(t0);
  }

  /* ---------------- SFX library ---------------- */
  A.sfx = {
    ui: () => { tone(880, 0.07, 'triangle', 0.18); tone(1320, 0.05, 'sine', 0.10, null, 0.04); },
    uiBack: () => { tone(520, 0.09, 'triangle', 0.16, 300); },
    confirm: () => { tone(660, 0.09, 'sine', 0.2); tone(990, 0.12, 'sine', 0.16, null, 0.07); },
    deny: () => { tone(220, 0.18, 'square', 0.14, 140); },
    beep: () => tone(1180, 0.055, 'sine', 0.14),
    scan: () => { tone(520, 0.5, 'sine', 0.1, 1600); noiseBurst(0.35, 'bandpass', 1800, 0.05, 0, 6); },
    pickup: () => { tone(700, 0.08, 'triangle', 0.22); tone(1050, 0.1, 'triangle', 0.18, null, 0.06); tone(1400, 0.14, 'sine', 0.14, null, 0.12); },
    discover: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.24, 'sine', 0.16, null, i * 0.09)); },
    land: () => { noiseBurst(1.3, 'lowpass', 420, 0.42); tone(70, 1.1, 'sine', 0.3, 46); },
    takeoff: () => { noiseBurst(1.2, 'highpass', 700, 0.24); tone(120, 0.9, 'sawtooth', 0.13, 320); },
    jump: () => { tone(180, 1.4, 'sawtooth', 0.18, 1400); noiseBurst(1.2, 'bandpass', 900, 0.1, 0, 3); },
    warn: () => { tone(440, 0.16, 'square', 0.16); tone(440, 0.16, 'square', 0.16, null, 0.22); },
    credit: () => { [784, 988, 1318].forEach((f, i) => tone(f, 0.2, 'sine', 0.15, null, i * 0.07)); },
    lowFuel: () => { tone(300, 0.12, 'sawtooth', 0.12); tone(240, 0.16, 'sawtooth', 0.1, null, 0.14); },
    footstep: () => noiseBurst(0.07, 'lowpass', 300, 0.06),
  };

  /* ---------------- continuous engine hum ---------------- */
  A.startEngine = function () {
    if (!A.enabled) return;
    const ctx = ensure(); if (!ctx) return;
    if (A._engine) return;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 58;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 29;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 340; f.Q.value = 3;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(A.master);
    o1.start(); o2.start();
    A._engine = { o1, o2, f, g };
  };

  A.setEngine = function (level, boost) {
    if (!A._engine || !A.ctx) return;
    const t = A.ctx.currentTime;
    const target = 0.02 + level * 0.09 + (boost ? 0.05 : 0);
    A._engine.g.gain.setTargetAtTime(Math.max(0.0001, target), t, 0.08);
    A._engine.o1.frequency.setTargetAtTime(54 + level * 40 + (boost ? 26 : 0), t, 0.1);
    A._engine.f.frequency.setTargetAtTime(300 + level * 900 + (boost ? 700 : 0), t, 0.1);
  };

  A.stopEngine = function () {
    if (!A._engine) return;
    const t = A.ctx.currentTime;
    A._engine.g.gain.setTargetAtTime(0.0001, t, 0.15);
    const e = A._engine;
    A._engine = null;
    setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch (e) {} }, 700);
  };

  /* ---------------- ambient drone ---------------- */
  A.startAmbient = function (mood = 'space') {
    if (!A.enabled) return;
    const ctx = ensure(); if (!ctx) return;
    A.stopAmbient();
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = mood === 'surface' ? 74 : 48;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mood === 'surface' ? 111 : 72.5;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 7;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    lfo.connect(lfoGain); lfoGain.connect(o1.frequency);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(A.master);
    o1.start(); o2.start(); lfo.start();
    g.gain.setTargetAtTime(mood === 'surface' ? 0.055 : 0.04, ctx.currentTime, 1.2);
    A._ambient = { o1, o2, lfo, g, f };
  };

  A.setAmbientMood = function (mood) {
    if (!A._ambient || !A.ctx) return;
    const t = A.ctx.currentTime;
    A._ambient.o1.frequency.setTargetAtTime(mood === 'surface' ? 74 : 48, t, 0.8);
    A._ambient.o2.frequency.setTargetAtTime(mood === 'surface' ? 111 : 72.5, t, 0.8);
  };

  A.stopAmbient = function () {
    if (!A._ambient) return;
    const t = A.ctx.currentTime;
    A._ambient.g.gain.setTargetAtTime(0.0001, t, 0.4);
    const e = A._ambient;
    A._ambient = null;
    setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.lfo.stop(); } catch (e) {} }, 1400);
  };
})();
