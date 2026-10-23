/* ============================================================
   hud.js — heads-up display, toasts, prompts, planet panel, journal
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.utils;
  const G = SB.gfx;
  const S = SB.state;

  const $ = (id) => document.getElementById(id);

  const UI = (SB.ui = {
    _promptSig: '',
    _resSig: '',
    _toasts: [],
    planetOpen: false,
    planet: null,
    onLand: null,
  });

  /* ============================================================
     TOASTS
     ============================================================ */
  UI.toast = function (text, kind) {
    const wrap = $('toasts');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.textContent = text;
    wrap.appendChild(el);
    const life = 3200;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, life);
    while (wrap.children.length > 5) wrap.firstChild.remove();
  };

  /* ============================================================
     CONTEXT PROMPT
     ============================================================ */
  UI.setPrompt = function (p) {
    const box = $('prompt');
    if (!box) return;
    const sig = p ? p.key + '|' + p.text : '';
    if (sig === UI._promptSig) return;
    UI._promptSig = sig;
    if (!p) { box.classList.add('hidden'); return; }
    $('promptKey').textContent = p.key;
    $('promptText').textContent = p.text;
    box.classList.remove('hidden');
  };

  /* ============================================================
     HUD VISIBILITY
     ============================================================ */
  UI.showHud = function (mode) {
    $('hudSpace').classList.toggle('hidden', mode !== 'space');
    $('hudSurface').classList.toggle('hidden', mode !== 'surface');
  };
  UI.hideHud = function () {
    $('hudSpace').classList.add('hidden');
    $('hudSurface').classList.add('hidden');
  };

  /* ============================================================
     SPACE HUD
     ============================================================ */
  function updateSpace() {
    const sys = S.system();
    if (!sys) return;
    const sh = S.ship;

    $('spSystem').textContent = sys.name;
    $('spRegion').textContent = sys.subtitle + ' · ' + sys.star.temp;

    const fuel = U.clamp01(sh.fuel);
    $('spFuel').textContent = Math.round(fuel * 100) + '%';
    $('spFuelBar').style.width = (fuel * 100) + '%';
    const shield = U.clamp01(sh.shield);
    $('spShield').textContent = Math.round(shield * 100) + '%';
    $('spShieldBar').style.width = (shield * 100) + '%';

    const sp = Math.hypot(sh.vx, sh.vy);
    $('spSpeed').textContent = U.formatNum(sp) + ' u/s';
    $('spPos').textContent = U.formatNum(sh.x) + ', ' + U.formatNum(sh.y);
    $('spCredits').textContent = U.formatNum(S.credits) + ' CR';
    $('spCores').textContent = U.formatNum(S.cores);

    const tgt = SB.space.target;
    if (tgt) {
      $('tgName').textContent = tgt.name;
      const d = SB.space.targetDist || 0;
      $('tgDist').textContent = U.formatNum(d) + ' u · ' + tgt.label;
    } else {
      $('tgName').textContent = '—';
      $('tgDist').textContent = '—';
    }
  }

  /* ============================================================
     SURFACE HUD
     ============================================================ */
  function updateSurface() {
    const pl = SB.surface.planet;
    if (!pl) return;
    const p = SB.surface.player;

    $('sfPlanet').textContent = pl.name;
    $('sfType').textContent = pl.label + ' · ' + pl.gravity.toFixed(2) + 'G · bahaya ' + Math.round(pl.hazard * 100) + '%';

    const suit = U.clamp01(S.suit);
    $('sfSuit').textContent = Math.round(suit * 100) + '%';
    $('sfSuitBar').style.width = (suit * 100) + '%';
    $('sfCargo').textContent = S.cargoCount() + ' / ' + S.cargoCap;

    /* cargo list — rebuild only when the manifest changes */
    let sig = '';
    for (const id in S.cargo) sig += id + ':' + S.cargo[id] + ';';
    if (sig !== UI._resSig) {
      UI._resSig = sig;
      const box = $('sfResources');
      if (!sig) {
        box.innerHTML = '<div class="empty">— belum ada material —</div>';
      } else {
        box.innerHTML = Object.keys(S.cargo).map((id) => {
          const r = SB.universe.RESOURCES[id];
          return '<div class="resitem" style="color:' + r.color + '">' +
            '<i></i><span style="color:var(--ink)">' + r.name + '</span>' +
            '<span class="qty">' + S.cargo[id] + '</span></div>';
        }).join('');
      }
    }

    $('sfDist').textContent = Math.round(Math.abs(p.x)) + ' m dari kapal';

    /* local time from the day cycle */
    const hours = Math.floor(SB.surface.dayT * 24);
    const mins = Math.floor((SB.surface.dayT * 24 - hours) * 60);
    const sky = SB.surface.sky();
    const phase = sky.altitude > 0.25 ? 'SIANG' : sky.altitude > -0.18 ? 'SENJA' : 'MALAM';
    $('sfTime').textContent = U.pad(hours) + ':' + U.pad(mins) + ' · ' + phase;
  }

  /* ============================================================
     PUBLIC REFRESH
     ============================================================ */
  UI.refresh = function () {
    const mode = S.mode;
    if (mode === 'space') updateSpace();
    else if (mode === 'surface') updateSurface();
    UI.updateGalaxyStatus();
  };
  UI.update = function () { UI.refresh(); };

  /* ============================================================
     GALAXY STATUS BAR
     ============================================================ */
  UI.updateGalaxyStatus = function () {
    const gxC = $('gxCredits'), gxCore = $('gxCores'), gxFuel = $('gxFuel');
    if (gxC) gxC.textContent = U.formatNum(S.credits) + ' CR';
    if (gxFuel && S.ship) gxFuel.textContent = Math.round(U.clamp01(S.ship.fuel) * 100) + '%';
    if (gxCore) {
      let need = 0;
      for (const sys of SB.universe.SYSTEMS) {
        if (sys.coresNeeded > S.cores) { need = sys.coresNeeded; break; }
      }
      gxCore.textContent = S.cores + ' / ' + (need || S.cores);
    }
  };

  /* ============================================================
     PLANET INFO PANEL
     ============================================================ */
  UI.openPlanet = function (planet) {
    UI.planet = planet;
    UI.planetOpen = true;

    $('plKicker').textContent = 'TARGET PLANET';
    $('plName').textContent = planet.name + '  ·  ' + planet.label;
    $('plLore').textContent = planet.lore;

    const stats = [
      ['TIPE', planet.label],
      ['GRAVITASI', planet.gravity.toFixed(2) + ' G'],
      ['BAHAYA', Math.round(planet.hazard * 100) + '%'],
      ['SIKLUS HARI', Math.round(planet.dayLength) + ' s'],
      ['JARAK ORBIT', U.formatNum(planet.orbit) + ' u'],
      ['DEPOSIT', planet.resources.length + ' jenis'],
    ];
    $('plStats').innerHTML = stats.map((r) =>
      '<div class="stat"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');

    $('plRes').innerHTML = planet.resources.map((id) => {
      const r = SB.universe.RESOURCES[id];
      return '<span class="res-chip" style="color:' + r.color + '"><i></i>' +
        '<span style="color:var(--ink)">' + r.name + '</span></span>';
    }).join('');

    const cs = S.contractStatus(planet);
    if (cs) {
      const r = SB.universe.RESOURCES[cs.res];
      let status = 'Belum terpenuhi';
      let cls = '';
      if (cs.claimed) { status = 'Sudah diklaim'; cls = 'done'; }
      else if (cs.done) { status = 'Siap diklaim di kapal'; cls = 'done'; }
      $('plContract').innerHTML =
        '<div>Kirim <b>' + cs.qty + ' ' + r.name + '</b> ' +
        '<span class="reward">+' + U.formatNum(cs.reward) + ' CR</span></div>' +
        '<div class="' + cls + '">' + status + ' · punya ' + cs.have + '/' + cs.qty + '</div>';
    } else {
      $('plContract').innerHTML = '<div>Tidak ada kontrak aktif di sini.</div>';
    }

    /* hint line */
    const land = SB.space.landingTarget();
    let hint = 'Tekan TURUN DAN JELAJAH untuk mendarat dan berjalan di permukaan.';
    if (planet.landable === false) {
      hint = 'Raga gas — tidak ada permukaan yang bisa didarat.';
    } else if (!land) {
      hint = 'Kecepatan kapal terlalu tinggi. Rem dulu dengan S, lalu coba lagi.';
    }
    $('plHint').textContent = hint;

    $('btnLand').disabled = planet.landable === false;

    $('planetModal').classList.remove('hidden');
    UI._previewT = 0;
  };

  UI.closePlanet = function () {
    UI.planetOpen = false;
    UI.planet = null;
    $('planetModal').classList.add('hidden');
  };

  /* animated planet preview inside the modal */
  UI.updatePlanetPreview = function (dt) {
    if (!UI.planetOpen || !UI.planet) return;
    const pl = UI.planet;
    const cv = $('plPreview');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width, h = cv.height;

    if (!pl._previewSphere) {
      if (!pl._eq) pl._eq = G.buildEquirect(pl);
      pl._previewSphere = new G.Sphere(pl._eq, { x: -0.5, y: -0.45, z: 0.74 });
      pl._previewSphere.setResolution(180);
    }
    UI._previewT = (UI._previewT || 0) + dt;
    pl._previewSphere.update(UI._previewT * 0.35 + (pl.rotation || 0));

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, w, h);
    const r = Math.min(w, h) * 0.38;
    G.glow(ctx, w / 2, h / 2, r * 1.5, pl.palette.ramp[2], 0.35);
    pl._sphere.draw(ctx, w / 2, h / 2, r);
    ctx.strokeStyle = U.rgba(pl.palette.ramp[2], 0.45);
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, U.TAU); ctx.stroke();
  };

  /* ============================================================
     JOURNAL
     ============================================================ */
  UI.openJournal = function () {
    if (S.mode === 'pause') { $('pauseScreen').classList.add('hidden'); UI._pauseOverlay = true; }
    UI.renderJournal();
    $('journal').classList.remove('hidden');
  };
  UI.closeJournal = function () {
    $('journal').classList.add('hidden');
    if (S.mode === 'pause' && UI._pauseOverlay) { UI._pauseOverlay = false; $('pauseScreen').classList.remove('hidden'); }
  };

  UI.renderJournal = function () {
    const logBox = $('journalLog');
    if (logBox) {
      logBox.innerHTML = S.journal.length
        ? S.journal.map((e) => {
            const d = new Date(e.t);
            const t = U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
            return '<div class="jentry"><span class="when">' + t + '</span>' +
              escapeHtml(e.text) + '</div>';
          }).join('')
        : '<div class="jempty">— belum ada catatan —</div>';
    }

    const plBox = $('journalPlanets');
    if (plBox) {
      const rows = [];
      for (const sys of SB.universe.SYSTEMS) {
        for (const pl of sys.planets) {
          if (!S.visited[pl.id]) continue;
          const pois = (S.poI[pl.id] || {});
          const poiCount = Object.keys(pois).length;
          const total = (pl.poi || []).length;
          const cs = S.contractStatus(pl);
          rows.push(
            '<div class="jentry"><span class="when">' + sys.name + '</span>' +
            '<b>' + pl.name + '</b> · ' + pl.label +
            ' · POI ' + poiCount + '/' + total +
            (cs ? ' · kontrak ' + (cs.claimed ? '✓ diklaim' : cs.done ? '✓ siap diklaim' : '⧗ berjalan') : '') +
            '</div>'
          );
        }
      }
      plBox.innerHTML = rows.length ? rows.join('') : '<div class="jempty">— belum ada planet terjelajah —</div>';
    }
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* ============================================================
     MINIMAP
     ============================================================ */
  UI.updateMinimap = function () {
    const cv = $('minimap');
    if (!cv) return;
    SB.space.renderMinimap(cv.getContext('2d'), cv.width, cv.height);
  };
})();
