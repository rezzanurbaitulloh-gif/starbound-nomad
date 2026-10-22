/* ============================================================
   menus.js — title screen, pause menu, help, settings, wiring
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.utils;
  const S = SB.state;

  const $ = (id) => document.getElementById(id);
  const UI = SB.ui;

  /* ============================================================
     TITLE
     ============================================================ */
  UI.showTitle = function () {
    $('titleScreen').classList.remove('hidden');
    $('btnContinue').disabled = !S.hasSave();
  };

  UI.startNewGame = function () {
    S.newGame();
    SB.audio.unlock();
    SB.audio.sfx.confirm();
    $('titleScreen').classList.add('hidden');
    if (SB.space && SB.space.enter) SB.space.enter(S.systemId, false);
    if (SB.main) SB.main.setMode('space');
    UI.toast('Sistem ' + S.system().name + ' — siap meluncur', 'good');
    if (S.log) S.log('Reaktor dinyalakan. ' + S.system().name + ' terbaca.', 'sys');
  };

  UI.continueGame = function () {
    if (!S.load()) {
      UI.toast('Tidak ada data perjalanan tersimpan', 'warn');
      SB.audio.sfx.deny();
      return;
    }
    SB.audio.unlock();
    SB.audio.sfx.confirm();
    $('titleScreen').classList.add('hidden');
    if (SB.space && SB.space.enter) SB.space.enter(S.systemId, true);
    if (S.planetId && S.ship && S.ship.landed) {
      const pl = S.currentPlanet();
      if (pl && SB.surface && SB.surface.enter) {
        SB.surface.enter(pl);
        if (SB.main) SB.main.setMode('surface');
        return;
      }
    }
    if (SB.main) SB.main.setMode('space');
    UI.toast('Perjalanan dilanjutkan — ' + S.system().name, 'good');
  };

  /* ============================================================
     PAUSE
     ============================================================ */
  UI.pause = function () {
    if (S.mode === 'title' || S.mode === 'pause') return;
    if (SB.cinematic && SB.cinematic.active) return;
    $('pauseScreen').classList.remove('hidden');
    SB.main.setMode('pause');
    SB.audio.sfx.ui();
    if (SB.audio.setEngine) SB.audio.setEngine(0, false);
  };

  UI.resume = function () {
    if (S.mode !== 'pause') return;
    $('pauseScreen').classList.add('hidden');
    SB.main.setMode(SB.main.prevMode || 'space');
    SB.audio.sfx.uiBack();
  };

  UI.quitToTitle = function () {
    S.save();
    SB.audio.sfx.uiBack();
    if (SB.audio.stopEngine) SB.audio.stopEngine();
    if (SB.audio.stopAmbient) SB.audio.stopAmbient();
    $('pauseScreen').classList.add('hidden');
    $('galaxyScreen').classList.add('hidden');
    $('planetModal').classList.add('hidden');
    $('journal').classList.add('hidden');
    $('helpModal').classList.add('hidden');
    SB.main.setMode('title');
    if (SB.ui && SB.ui.showTitle) SB.ui.showTitle();
  };

  /* ============================================================
     HELP
     ============================================================ */
  UI.openHelp = function () {
    $('helpModal').classList.remove('hidden');
    SB.audio.sfx.ui();
  };
  UI.closeHelp = function () {
    $('helpModal').classList.add('hidden');
    SB.audio.sfx.uiBack();
  };

  /* ============================================================
     GALAXY
     ============================================================ */
  UI.openGalaxy = function () {
    if (S.mode !== 'space' && S.mode !== 'pause') {
      UI.toast('Peta galaksi hanya bisa dibuka di ruang angkasa', 'warn');
      SB.audio.sfx.deny();
      return;
    }
    SB.galaxy.show();
    SB.audio.sfx.ui();
  };
  UI.closeGalaxy = function () {
    SB.galaxy.hide();
    SB.audio.sfx.uiBack();
  };

  /* ============================================================
     JOURNAL
     ============================================================ */
  UI.toggleJournal = function () {
    if (S.mode === 'pause') return;
    const el = $('journal');
    if (el.classList.contains('hidden')) { UI.openJournal(); SB.audio.sfx.ui(); }
    else { UI.closeJournal(); SB.audio.sfx.uiBack(); }
  };

  /* ============================================================
     BUTTON WIRING
     ============================================================ */
  UI.wire = function () {
    const on = (id, fn) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        SB.audio.unlock();
        fn(el);
      });
    };

    on('btnNew', () => UI.startNewGame());
    on('btnContinue', () => UI.continueGame());
    on('btnHelpTitle', () => UI.openHelp());
    on('btnCloseHelp', () => UI.closeHelp());
    on('btnCloseJournal', () => UI.closeJournal());
    on('btnClosePlanet', () => UI.closePlanet());
    on('btnCloseGalaxy', () => UI.closeGalaxy());

    on('btnResume', () => UI.resume());
    on('btnMenuHelp', () => UI.openHelp());
    on('btnMenuJournal', () => UI.toggleJournal());
    on('btnMenuGalaxy', () => {
      $('pauseScreen').classList.add('hidden');
      UI.openGalaxy();
    });
    on('btnSaveQuit', () => {
      $('pauseScreen').classList.add('hidden');
      UI.quitToTitle();
    });

    on('btnLand', () => {
      const pl = UI.planet;
      if (!pl) return;
      if (pl.landable === false) {
        SB.audio.sfx.deny();
        UI.toast('Raga gas — tidak ada permukaan untuk didarat', 'warn');
        return;
      }
        const land = SB.space.landingTarget ? SB.space.landingTarget() : null;
        if (!land) {
          SB.audio.sfx.deny();
          UI.toast('Kecepatan kapal terlalu tinggi — rem dengan S lalu coba lagi', 'warn');
          return;
        }
      UI.closePlanet();
      SB.cinematic.startLanding(pl);
    });
  };

  /* ============================================================
     GLOBAL KEY HANDLING (menus & overlays)
     ============================================================ */
  UI.handleKeys = function () {
    const Input = SB.input;

    /* help modal is modal: only ESC closes it */
    if (!$('helpModal').classList.contains('hidden')) {
      if (Input.hit('escape') || Input.hit('h')) UI.closeHelp();
      return true;
    }

    if (!$('planetModal').classList.contains('hidden')) {
      if (Input.hit('escape')) { UI.closePlanet(); SB.audio.sfx.uiBack(); }
      else if (Input.hit('enter')) { const b = $('btnLand'); if (b && !b.disabled) b.click(); }
      return true;
    }

    if (!$('journal').classList.contains('hidden')) {
      if (Input.hit('escape') || Input.hit('j')) UI.closeJournal();
      return true;
    }

    if (SB.galaxy.open) return true;   /* galaxy handles its own keys */

    /* pause menu */
    if (S.mode === 'pause') {
      if (Input.hit('escape')) { UI.resume(); return true; }
      if (Input.hit('m')) { $('pauseScreen').classList.add('hidden'); UI.openGalaxy(); return true; }
      return true;
    }

    /* in-game hotkeys */
    if (S.mode === 'space') {
      if (Input.hit('escape')) { UI.pause(); return true; }
      if (Input.hit('m')) { UI.openGalaxy(); return true; }
      if (Input.hit('j')) { UI.toggleJournal(); return true; }
      if (Input.hit('h')) { UI.openHelp(); return true; }
    } else if (S.mode === 'surface') {
      if (Input.hit('escape')) { UI.pause(); return true; }
      if (Input.hit('j')) { UI.toggleJournal(); return true; }
      if (Input.hit('h')) { UI.openHelp(); return true; }
    } else if (S.mode === 'title') {
      if (Input.hit('enter')) UI.startNewGame();
    }
    return false;
  };
})();
