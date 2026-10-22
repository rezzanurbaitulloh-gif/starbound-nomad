/* ============================================================
   cinematic.js — landing & takeoff sequences
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.utils;
  const G = SB.gfx;

  const C = (SB.cinematic = {
    active: false,
    kind: null,        // 'land' | 'takeoff'
    planet: null,
    t: 0,
    dur: 5.0,
    shipY: 0,
    dust: [],
    done: false,
    onComplete: null,
  });

  C.startLanding = function (planet) {
    C.active = true;
    C.kind = 'land';
    C.planet = planet;
    C.t = 0;
    C.dur = 5.2;
    C.done = false;
    C.dust = [];
    C._dustDone = false;
    SB.ui.setPrompt(null);
    SB.ui.hideHud();
    SB.audio.stopEngine();
    SB.audio.sfx.land();
    SB.ui.toast('Proses mendarat — ' + planet.name, 'good');
    SB.state.log('Mendarat di ' + planet.name + '.', 'land');
    if (SB.main) SB.main.setMode('cinematic');
  };

  C.startTakeoff = function (planet) {
    C.active = true;
    C.kind = 'takeoff';
    C.planet = planet;
    C.t = 0;
    C.dur = 4.6;
    C.done = false;
    C.dust = [];
    C._dustDone = false;
    SB.ui.setPrompt(null);
    SB.ui.hideHud();
    SB.audio.sfx.takeoff();
    SB.ui.toast('Lift-off — ' + planet.name, 'good');
    SB.state.log('Lift-off dari ' + planet.name + '.', 'takeoff');
    if (SB.main) SB.main.setMode('cinematic');
  };

  C.update = function (dt) {
    if (!C.active) return;
    C.t += dt;

    /* dust burst at touchdown / liftoff */
    const key = C.kind === 'land' ? 0.78 : 0.16;
    if (!C._dustDone && C.t / C.dur > key) {
      C._dustDone = true;
      for (let i = 0; i < 46; i++) {
        const a = -Math.PI * 0.5 + (Math.random() - 0.5) * 2.6;
        const sp = 90 + Math.random() * 320;
        C.dust.push({
          x: (Math.random() - 0.5) * 120, y: 0,
          vx: Math.cos(a) * sp * 1.5, vy: Math.sin(a) * sp * 0.5,
          life: 0.6 + Math.random() * 0.9, max: 1.5,
          r: 5 + Math.random() * 16,
        });
      }
    }

    for (let i = C.dust.length - 1; i >= 0; i--) {
      const d = C.dust[i];
      d.life -= dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.vy += 120 * dt;
      d.vx *= Math.exp(-1.6 * dt);
      if (d.life <= 0) C.dust.splice(i, 1);
    }

    if (C.t >= C.dur && !C.done) {
      C.done = true;
      C.active = false;
      if (C.kind === 'land') {
        SB.surface.enter(C.planet);
        SB.main.setMode('surface');
      } else {
        const sys = SB.state.system();
        const orbit = C.planet.orbit;
        const ang = C.planet.orbitAngle;
        SB.state.ship.x = Math.cos(ang) * (orbit - C.planet.size * 3.4);
        SB.state.ship.y = Math.sin(ang) * (orbit - C.planet.size * 3.4) * 0.42;
        SB.state.ship.vx = -Math.sin(ang) * 60;
        SB.state.ship.vy = Math.cos(ang) * 60 * 0.42;
        SB.state.ship.angle = ang + Math.PI * 0.5;
        SB.space.enter(SB.state.systemId, true);
        SB.main.setMode('space');
        SB.ui.toast('Orbit achieved — ' + sys.name, 'good');
      }
    }
  };

  C.render = function (ctx, w, h) {
    const pl = C.planet;
    const sf = pl.surface;
    const p = C.t / C.dur;
    const land = C.kind === 'land';

    /* sky fade */
    const skyA = land ? U.clamp01((p - 0.18) / 0.42) : U.clamp01(1 - (p - 0.3) / 0.5);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (land) {
      g.addColorStop(0, U.rgba('#04050b', 1 - skyA));
      g.addColorStop(0.6, U.rgba('#04050b', 1 - skyA * 0.85));
      g.addColorStop(1, U.rgba('#0a0d18', 1 - skyA * 0.6));
    } else {
      g.addColorStop(0, U.rgba('#04050b', skyA));
      g.addColorStop(0.6, U.rgba('#04050b', skyA * 0.85));
      g.addColorStop(1, U.rgba('#0a0d18', skyA * 0.6));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (skyA > 0.01) {
      const sg = ctx.createLinearGradient(0, 0, 0, h);
      sg.addColorStop(0, U.rgba(sf.skyDay[0], skyA));
      sg.addColorStop(0.62, U.rgba(sf.skyDay[1], skyA));
      sg.addColorStop(1, U.rgba(U.mixHex(sf.skyDay[1], sf.fog, 0.4), skyA));
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);
    }

    /* planet surface curve rising */
    const rise = land ? U.clamp01((p - 0.25) / 0.5) : 1 - U.clamp01((p - 0.25) / 0.5);
    const H = h * 0.62;
    const gY = (x) => SB.surface.groundYFor(x, pl.seed) + H;
    const groundScreenY = gY(0);
    const gy = groundScreenY - (1 - rise) * h * 1.3;

    ctx.beginPath();
    ctx.moveTo(-2, h + 2);
    for (let sx = -2; sx <= w + 2; sx += 4) {
      const X = sx - w / 2;
      ctx.lineTo(sx, gy + (gY(X) - groundScreenY));
    }
    ctx.lineTo(w + 2, h + 2);
    ctx.closePath();
    const gg = ctx.createLinearGradient(0, H - 120, 0, h);
    gg.addColorStop(0, sf.ground[1]);
    gg.addColorStop(0.3, sf.ground[0]);
    gg.addColorStop(1, U.shade(sf.ground[1], -0.4));
    ctx.fillStyle = gg;
    ctx.fill();

    /* ship vertical position */
    const shipH = land
      ? U.lerp(h * 0.20, groundScreenY - 6, U.smoothstep(U.clamp01((p - 0.2) / 0.62)))
      : U.lerp(groundScreenY - 6, h * 0.10, U.smoothstep(U.clamp01((p - 0.1) / 0.62)));
    const shipX = w * 0.5;
    const thrust = land
      ? (p > 0.2 && p < 0.84 ? 1 : 0.25)
      : (p < 0.85 ? 1 : 0.2);

    /* shadow */
    if (land ? p < 0.9 : p < 0.7) {
      const shadowY = groundScreenY;
      const shrink = U.clamp01((shadowY - shipH) / (h * 0.5));
      ctx.fillStyle = 'rgba(0,0,0,' + (0.34 * (1 - shrink * 0.7)) + ')';
      ctx.beginPath();
      ctx.ellipse(shipX, shadowY, 34 + shrink * 40, 7 + shrink * 7, 0, 0, U.TAU);
      ctx.fill();
    }

    /* dust */
    for (const d of C.dust) {
      const a = U.clamp01(d.life / d.max);
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = U.rgba(sf.ground[0], 1);
      ctx.beginPath();
      ctx.arc(d.x + w / 2, groundScreenY + d.y, d.r * a + 3, 0, U.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ship */
    G.drawShip(ctx, shipX, shipH, land ? 0.12 : -0.25, 46, thrust, {
      hull: '#cfdcf0', hullDark: '#3d4a66', accent: '#6ff2dc',
    });

    /* letterbox */
    const bar = Math.min(h * 0.11, 92);
    ctx.fillStyle = '#04050b';
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);

    /* title card */
    const label = land ? 'MENDARAT' : 'LIFT-OFF';
    const fade = U.clamp01((p - 0.08) / 0.14) * (1 - U.clamp01((p - 0.78) / 0.18));
    if (fade > 0.01) {
      ctx.globalAlpha = fade;
      ctx.textAlign = 'center';
      ctx.font = '600 13px ui-monospace, monospace';
      ctx.fillStyle = '#6ff2dc';
      ctx.fillText(label + '  ·  ' + pl.name, w / 2, bar + 46);
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(150,170,210,0.75)';
      ctx.fillText(pl.label + '  ·  BAHAYA ' + Math.round(pl.hazard * 100) + '%  ·  GRAVITASI ' + pl.gravity.toFixed(2) + 'G', w / 2, bar + 66);
      ctx.globalAlpha = 1;
    }
  };
})();
