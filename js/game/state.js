/* ============================================================
   state.js — global game state, progression, persistence
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.utils;
  const UNI = SB.universe;

  const SAVE_KEY = 'starbound-nomad.save.v1';

  const S = (SB.state = {
    mode: 'title',        // title | space | surface | galaxy | cinematic | pause
    prevMode: 'title',
    systemId: 'kepler442',
    planetId: null,
    ship: null,
    cargo: {},            // resourceId -> qty
    credits: 0,
    cores: 0,
    suit: 1,
    cargoCap: 20,
    journal: [],
    visited: {},
    poI: {},
    contracts: {},
    systemsSeen: {},
    started: false,
    time: 0,
  });

  function freshShip() {
    return {
      x: 0, y: 0, vx: 0, vy: 0, angle: 0,
      fuel: 1, shield: 1, throttle: 0, boost: false,
      landed: false, landX: 0,
    };
  }

  S.newGame = function () {
    S.systemId = 'kepler442';
    S.planetId = null;
    S.ship = freshShip();
    S.cargo = {};
    S.credits = 0;
    S.cores = 0;
    S.suit = 1;
    S.cargoCap = 20;
    S.journal = [];
    S.visited = {};
    S.poI = {};
    S.contracts = {};
    S.systemsSeen = { kepler442: true };
    S.started = true;
    S.time = 0;
    S.log('Reaktor dinyalakan. Sistem KEPLER-442 terbaca — 5 badan terdeteksi.', 'sys');
  };

  /* ---------------- cargo helpers ---------------- */
  S.cargoCount = function () {
    let n = 0;
    for (const k in S.cargo) n += S.cargo[k];
    return n;
  };
  S.cargoFull = function () { return S.cargoCount() >= S.cargoCap; };
  S.addCargo = function (resId, qty) {
    /* inti lompat tidak dapat dijual — langsung dibank ke inventaris inti */
    if (resId === 'core') {
      S.cores += qty;
      return qty;
    }
    const room = S.cargoCap - S.cargoCount();
    const take = Math.min(qty, Math.max(0, room));
    S.cargo[resId] = (S.cargo[resId] || 0) + take;
    return take;
  };
  S.takeCargo = function (resId, qty) {
    if (resId === 'core') return 0;
    const have = S.cargo[resId] || 0;
    const take = Math.min(have, qty);
    S.cargo[resId] = have - take;
    if (S.cargo[resId] <= 0) delete S.cargo[resId];
    return take;
  };

  /* ---------------- journal ---------------- */
  S.log = function (text, kind) {
    S.journal.unshift({ text, kind: kind || 'note', t: Date.now() });
    if (S.journal.length > 120) S.journal.length = 120;
  };

  /* ---------------- system access ---------------- */
  S.system = function () { return UNI.getSystem(S.systemId); };
  S.currentPlanet = function () {
    const sys = S.system();
    if (!sys || !S.planetId) return null;
    return sys.planets.find((p) => p.id === S.planetId) || null;
  };

  /* ---------------- persistence ---------------- */
  S.save = function () {
    try {
      const data = {
        v: 1,
        systemId: S.systemId,
        planetId: S.planetId,
        ship: S.ship,
        cargo: S.cargo,
        credits: S.credits,
        cores: S.cores,
        suit: S.suit,
        cargoCap: S.cargoCap,
        journal: S.journal.slice(0, 60),
        visited: S.visited,
        poI: S.poI,
        contracts: S.contracts,
        systemsSeen: S.systemsSeen,
        started: S.started,
        time: S.time,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  };

  S.load = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || !d.started) return false;
      Object.assign(S, {
        systemId: d.systemId || 'kepler442',
        planetId: d.planetId || null,
        ship: Object.assign(freshShip(), d.ship || {}),
        cargo: d.cargo || {},
        credits: d.credits || 0,
        cores: d.cores || 0,
        suit: d.suit === undefined ? 1 : d.suit,
        cargoCap: d.cargoCap || 20,
        journal: d.journal || [],
        visited: d.visited || {},
        poI: d.poI || {},
        contracts: d.contracts || {},
        systemsSeen: d.systemsSeen || {},
        started: true,
        time: d.time || 0,
      });
      return true;
    } catch (e) { return false; }
  };

  S.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };

  S.clearSave = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  };

  /* ---------------- progression ---------------- */
  S.systemUnlocked = function (sys) {
    if (!sys) return false;
    if (!sys.coresNeeded) return true;
    return S.cores >= sys.coresNeeded;
  };

  S.totalCoresIn = function (sys) {
    let n = 0;
    for (const p of sys.planets) if (p.resources.includes('core')) n++;
    return n;
  };

  /* contract fulfilment check */
  S.contractStatus = function (planet) {
    if (!planet || !planet.contract) return null;
    const c = planet.contract;
    const have = S.cargo[c.res] || 0;
    return {
      res: c.res, qty: c.qty, reward: c.reward,
      have, done: have >= c.qty,
      claimed: !!S.contracts[planet.id],
    };
  };
})();
