/* ============================================================
   main.js — bootstrap, DPR-aware loop, bloom composite, mode dispatch
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.utils;

  const Main = (SB.main = {
    mode: 'title',
    prevMode: 'title',
    canvas: null,
    ctx: null,
    buf: null,
    bctx: null,
    w: 0,
    h: 0,
    dpr: 1,
    time: 0,
    last: performance.now(),
    titleStars: [],
    titleNeb: null,
    titleT: 0,
  });

  Main.setMode = function (m) {
    const prev = Main.mode;
    Main.prevMode = prev;
    Main.mode = m;
    if (SB.state) SB.state.mode = m;
    if (SB.ui) {
      SB.ui.hideHud();
      if (m === 'space') SB.ui.showHud('space');
      if (m === 'surface') SB.ui.showHud('surface');
    }
  };

  function resize() {
    const c = Main.canvas;
    const r = c.getBoundingClientRect();
    Main.dpr = Math.min(window.devicePixelRatio || 1, 2);
    SB.dpr = Main.dpr;
    Main.w = Math.max(1, Math.floor(r.width));
    Main.h = Math.max(1, Math.floor(r.height));
    c.width = Math.floor(Main.w * Main.dpr);
    c.height = Math.floor(Main.h * Main.dpr);
    if (Main.buf) {
      Main.buf.width = c.width;
      Main.buf.height = c.height;
    }
    if (SB.galaxy && SB.galaxy.canvas && SB.galaxy.resize) SB.galaxy.resize();
    if (SB.gfx && SB.gfx._off && SB.gfx._off.resize) SB.gfx._off.resize();
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - Main.last) / 1000);
    Main.last = now;
    Main.time += dt;

    const Input = SB.input;
    if (Input) Input.update();

    if (SB.ui && SB.ui.handleKeys) {
      SB.ui.handleKeys();
    }

    /* update */
    if (Main.mode === 'space' && SB.space) SB.space.update(dt);
    if (Main.mode === 'surface' && SB.surface) SB.surface.update(dt);
    if (Main.mode === 'galaxy' && SB.galaxy) SB.galaxy.update(dt);
    if (Main.mode === 'cinematic' && SB.cinematic) SB.cinematic.update(dt);
    if (SB.ui && SB.ui.update) SB.ui.update(dt);
    if (SB.ui && SB.ui.updateMinimap && Main.mode === 'space') SB.ui.updateMinimap();
    if (Main.mode === 'pause') {
      /* no world update */
    }

    /* render */
    const c = Main.ctx;
    c.save();
    c.setTransform(Main.dpr, 0, 0, Main.dpr, 0, 0);
    if (Main.mode === 'title') {
      renderTitle(c, Main.w, Main.h, dt);
    } else if (Main.mode === 'cinematic') {
      if (SB.cinematic && SB.cinematic.render) SB.cinematic.render(c, Main.w, Main.h);
    } else if (Main.mode === 'space') {
      if (SB.space && SB.space.render) SB.space.render(c, Main.w, Main.h);
    } else if (Main.mode === 'surface') {
      if (SB.surface && SB.surface.render) SB.surface.render(c, Main.w, Main.h);
    } else if (Main.mode === 'galaxy') {
      c.fillStyle = '#04050b';
      c.fillRect(0, 0, Main.w, Main.h);
    }

    if (Main.mode === 'galaxy' && SB.galaxy && SB.galaxy.render) SB.galaxy.render();
    if (SB.ui && SB.ui.updatePlanetPreview) SB.ui.updatePlanetPreview(dt);
    c.restore();

    /* bloom composite if available */
    if (SB.gfx && SB.gfx.bloom && SB.gfx.bloom.apply && Main.buf && Main.bctx) {
      // simple pass-through; bloom applied in subrenders where used
    }

    /* boot fade */
    const boot = document.getElementById('boot');
    if (boot && !boot.classList.contains('gone')) {
      if (Main.time > 0.8) boot.classList.add('gone');
    }

    requestAnimationFrame(loop);
  }

  function renderTitle(ctx, w, h, dt) {
    Main.titleT += dt;
    if (!Main.titleStars.length) {
      Main.titleStars = SB.gfx.makeStars ? SB.gfx.makeStars(160, 1312, [0.3, 1.2]) : [];
    }
    ctx.fillStyle = '#05060d';
    ctx.fillRect(0, 0, w, h);
    if (SB.gfx.drawStars) SB.gfx.drawStars(ctx, Main.titleStars, 0, 0, 1, w, h, Main.titleT, 0.8, 0);
    /* subtle nebula */
    const g = ctx.createRadialGradient(w * 0.7, h * 0.3, 10, w * 0.7, h * 0.3, Math.max(w, h) * 0.5);
    g.addColorStop(0, 'rgba(111,110,255,0.08)');
    g.addColorStop(1, 'rgba(5,6,13,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  Main.init = function () {
    Main.canvas = document.getElementById('scene');
    Main.ctx = Main.canvas.getContext('2d');
    Main.buf = document.createElement('canvas');
    Main.bctx = Main.buf.getContext('2d');

    if (SB.input && SB.input.init) SB.input.init(Main.canvas);
    if (SB.audio && SB.audio.init) SB.audio.init();
    if (SB.galaxy && SB.galaxy.init) SB.galaxy.init();
    if (SB.ui && SB.ui.wire) SB.ui.wire();

    resize();
    window.addEventListener('resize', resize, { passive: true });

    Main.setMode('title');
    if (SB.ui && SB.ui.showTitle) SB.ui.showTitle();

    Main.last = performance.now();
    requestAnimationFrame(loop);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Main.init);
  } else {
    Main.init();
  }
})();
