/* ============================================================
   surface.js — planet surface exploration (on foot)
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.utils;
  const G = SB.gfx;
  const S = SB.state;

  const PLAYER_SCALE = 26;
  const WALK_SPEED = 138;
  const GRAVITY = 1900;
  const JUMP_V = -440;
  const SCAN_RADIUS = 1000;
  const MINE_RADIUS = 78;
  const MINE_TIME = 1.15;
  const NODE_COUNT = 30;
  const FIELD_HALF = 3400;

  const Surface = (SB.surface = {
    planet: null,
    player: { x: 70, y: 0, vy: 0, onGround: true, dir: 1, phase: 0, moving: 0 },
    nodes: [],
    pois: [],
    cam: { x: 0, y: 0 },
    time: 0,
    dayT: 0,
    scanPulse: null,
    mine: null,
    mineProgress: 0,
    floats: [],
    fog: 0,
    recallT: 0,
  });

  /* ---------------- terrain sampling ---------------- */
  function groundY(x, seed) {
    const a = (U.fbm1(x / 520, seed, 4) - 0.5) * 250;
    const b = (U.fbm1(x / 165, seed + 7, 3) - 0.5) * 62;
    const c = (U.fbm1(x / 48, seed + 19, 2) - 0.5) * 15;
    return -(a + b + c);
  }
  function ridgeY(x, seed, scale, amp) {
    return -(U.fbm1(x / scale, seed, 4) - 0.5) * amp;
  }
  Surface.groundY = (x) => groundY(x, Surface.planet.seed);
  Surface.groundYFor = (x, seed) => groundY(x, seed);

  /* ---------------- setup ---------------- */
  Surface.enter = function (planet) {
    Surface.planet = planet;
    Surface.time = 0;
    Surface.dayT = 0.32;
    Surface.scanPulse = null;
    Surface.mine = null;
    Surface.mineProgress = 0;
    Surface.floats = [];
    Surface.recallT = 0;

    const p = Surface.player;
    p.x = 90; p.vy = 0; p.onGround = true; p.dir = 1; p.phase = 0; p.moving = 0;

    /* resource nodes */
    const rng = U.mulberry32(planet.seed * 977 + 13);
    const pool = planet.resources.filter((r) => r !== 'core');
    Surface.nodes = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const resId = pool.length ? pool[Math.floor(rng() * pool.length)] : 'ferrite';
      const x = (rng() * 2 - 1) * FIELD_HALF;
      if (Math.abs(x) < 190) continue;            /* keep the landing pad clear */
      const amount = 1 + Math.floor(rng() * 3);
      Surface.nodes.push({
        x, res: resId, amount, scanned: false, depleted: false,
        y: groundY(x, planet.seed),
        bob: rng() * U.TAU,
      });
    }
    /* inti lompat - node terpisah, tersebar, tidak ikut penempatan biasa */
    if (planet.resources.includes('core')) {
      const n = planet.cores || 5;
      for (let i = 0; i < n; i++) {
        const x = -FIELD_HALF + (i + 0.5 + (rng() - 0.5) * 0.7) * ((FIELD_HALF * 2) / n);
        if (Math.abs(x) < 260) continue;
        Surface.nodes.push({
          x, res: 'core', amount: 1, scanned: false, depleted: false,
          y: groundY(x, planet.seed), bob: rng() * U.TAU,
        });
      }
    }

    /* points of interest */
    Surface.pois = (planet.poi || []).map((poi, i) => ({
      def: poi,
      x: -1900 + i * 1700 + rng() * 600,
      y: 0,
      found: false,
    }));
    Surface.pois.forEach((po) => { po.y = groundY(po.x, planet.seed); });

    Surface.cam.x = p.x;
    Surface.cam.y = Surface.groundY(p.x);

    S.planetId = planet.id;
    S.visited[planet.id] = true;
    planet.discovered = true;

    SB.audio.startAmbient('surface');
    SB.audio.startEngine();
    SB.ui.toast('MENDARAT — ' + planet.name + ' · ' + planet.label, 'good');
  };

  Surface.exit = function () {
    SB.audio.stopEngine();
    SB.audio.startAmbient('space');
  };

  /* ---------------- update ---------------- */
  Surface.update = function (dt) {
    const p = Surface.player;
    const pl = Surface.planet;
    const Input = SB.input;
    Surface.time += dt;
    Surface.dayT = (Surface.dayT + dt / pl.dayLength) % 1;

    /* ---- movement ---- */
    const ax = Input.axis().x;
    if (ax !== 0) {
      p.x += ax * WALK_SPEED * dt;
      p.dir = ax;
      p.phase += dt * 9.5;
      p.moving = U.approach(p.moving, 1, 12, dt);
      if (Math.random() < dt * 3.4) SB.audio.sfx.footstep();
    } else {
      p.phase += dt * 1.4;
      p.moving = U.approach(p.moving, 0, 12, dt);
    }

    /* jump / jetpack */
    if (Input.hit('space') && p.onGround) {
      p.vy = JUMP_V * (1 / Math.max(0.55, pl.gravity));
      p.onGround = false;
      SB.audio.sfx.jump();
    }

    /* vertical */
    const gy = Surface.groundY(p.x);
    p.vy += GRAVITY * pl.gravity * dt;
    p.y += p.vy * dt;
    if (p.y >= gy) { p.y = gy; p.vy = 0; p.onGround = true; }
    else p.onGround = false;

    /* clamp to field */
    p.x = U.clamp(p.x, -FIELD_HALF - 900, FIELD_HALF + 900);

    /* ---- suit power ---- */
    const drain = 0.0022 + pl.hazard * 0.023;
    const nearShip = Math.abs(p.x) < 110;
    if (nearShip) S.suit = Math.min(1, S.suit + 0.16 * dt);
    else S.suit = Math.max(0, S.suit - drain * dt);

    if (S.suit <= 0 && Surface.recallT <= 0) {
      Surface.recallT = 1.1;
      SB.audio.sfx.warn();
      SB.ui.toast('SUIT KOSONG — evakuasi otomatis ke kapal', 'bad');
      S.log('Suit kehabisan daya di ' + pl.name + '. Evakuasi dipicu otomatis.', 'warn');
    }

    /* ---- recall to ship ---- */
    if (Input.hit('r') && Surface.recallT <= 0 && !nearShip) {
      Surface.recallT = 0.85;
      SB.audio.sfx.beep();
      SB.ui.toast('Mengrecall ke kapal', 'warn');
    }
    if (Surface.recallT > 0) {
      Surface.recallT -= dt;
      if (Surface.recallT <= 0) {
        p.x = 130; p.y = Surface.groundY(130); p.vy = 0;
        S.suit = Math.max(S.suit, 0.55);
      }
    }

    /* ---- scanner ---- */
    if (Input.hit('f')) {
      let found = 0;
      for (const n of Surface.nodes) {
        if (!n.scanned && !n.depleted && Math.abs(n.x - p.x) < SCAN_RADIUS) {
          n.scanned = true; found++;
        }
      }
      Surface.scanPulse = { x: p.x, r: 0 };
      SB.audio.sfx.scan();
      if (found > 0) SB.ui.toast(found + ' deposit terdeteksi dalam radius scan', 'good');
      else SB.ui.toast('Tidak ada deposit dalam jangkauan scanner', 'warn');
    }
    if (Surface.scanPulse) {
      Surface.scanPulse.r += 900 * dt;
      if (Surface.scanPulse.r > SCAN_RADIUS) Surface.scanPulse = null;
    }

    /* ---- interaction: nodes & POI ---- */
    const E = Input.down('e');
    let nearestNode = null, nd = Infinity;
    for (const n of Surface.nodes) {
      if (n.depleted) continue;
      const d = Math.abs(n.x - p.x);
      if (d < MINE_RADIUS && d < nd) { nd = d; nearestNode = n; }
    }
    let nearestPoi = null, pd = Infinity;
    for (const po of Surface.pois) {
      if (po.found) continue;
      const d = Math.abs(po.x - p.x);
      if (d < 130 && d < pd) { pd = d; nearestPoi = po; }
    }

    if (nearestPoi && !nearestNode) {
      if (Input.hit('e')) {
        nearestPoi.found = true;
        const reward = 180 + Math.round(Math.random() * 260);
        S.credits += reward;
        S.poI[pl.id] = S.poI[pl.id] || {};
        S.poI[pl.id][nearestPoi.def.name] = true;
        S.log('Menemukan ' + nearestPoi.def.name + ' di ' + pl.name + '. ' + nearestPoi.def.desc, 'poi');
        SB.audio.sfx.discover();
        SB.ui.toast('TEMUAN: ' + nearestPoi.def.name + ' (+' + reward + ' CR)', 'good');
        Surface.floats.push({ x: nearestPoi.x, y: nearestPoi.y - 90, text: '+' + reward + ' CR', life: 2.2, max: 2.2, col: '#ffb454' });
      }
    } else if (nearestNode) {
      if (E) {
        if (Surface.mine !== nearestNode) { Surface.mine = nearestNode; Surface.mineProgress = 0; }
        Surface.mineProgress += dt / MINE_TIME;
        if (Math.random() < dt * 22) {
          Surface.floats.push({
            x: nearestNode.x + (Math.random() - 0.5) * 20, y: nearestNode.y - 30 - Math.random() * 30,
            text: '+', life: 0.5, max: 0.5, col: SB.universe.RESOURCES[nearestNode.res].color, spark: true,
          });
        }
        if (Surface.mineProgress >= 1) {
          const got = S.addCargo(nearestNode.res, nearestNode.amount);
          if (got <= 0) {
            SB.ui.toast('MUATAN PENUH — jual atau dropping dulu', 'warn');
            SB.audio.sfx.deny();
          } else {
            SB.audio.sfx.pickup();
            const r = SB.universe.RESOURCES[nearestNode.res];
            Surface.floats.push({
              x: nearestNode.x, y: nearestNode.y - 70,
              text: '+' + got + ' ' + r.name, life: 2.4, max: 2.4, col: r.color,
            });
            SB.ui.toast('+' + got + ' ' + r.name, 'good');
          }
          nearestNode.amount -= got;
          if (nearestNode.amount <= 0) nearestNode.depleted = true;
          Surface.mine = null;
          Surface.mineProgress = 0;
        }
      } else {
        Surface.mine = null;
        Surface.mineProgress = 0;
      }
    } else {
      Surface.mine = null;
      Surface.mineProgress = 0;
    }

    /* ---- ship interaction ---- */
    if (nearShip && Input.hit('e')) {
      Surface.sellAndBoard();
    }

    /* ---- contract check ---- */
    const cs = S.contractStatus(pl);
    if (cs && cs.done && !cs.claimed && !Surface._contractNotified) {
      Surface._contractNotified = true;
      SB.ui.toast('Kontrak terpenuhi: ' + cs.qty + ' ' + SB.universe.RESOURCES[cs.res].name, 'good');
    }
    if (!cs || !cs.done) Surface._contractNotified = false;

    /* ---- camera ---- */
    const look = p.dir * 130;
    Surface.cam.x = U.approach(Surface.cam.x, p.x + look, 4.5, dt);
    Surface.cam.y = U.approach(Surface.cam.y, Surface.groundY(Surface.cam.x), 3.4, dt);

    /* ---- floats ---- */
    for (let i = Surface.floats.length - 1; i >= 0; i--) {
      const f = Surface.floats[i];
      f.life -= dt;
      f.y -= dt * (f.spark ? 40 : 26);
      if (f.life <= 0) Surface.floats.splice(i, 1);
    }

    /* ---- prompt ---- */
    let prompt = null;
    if (nearShip) {
      prompt = { key: 'E', text: 'Jual muatan & isi bahan bakar' };
    } else if (nearestPoi) {
      prompt = { key: 'E', text: 'Periksa ' + nearestPoi.def.name };
    } else if (nearestNode) {
      prompt = { key: 'E', text: 'Tambang ' + SB.universe.RESOURCES[nearestNode.res].name };
    } else if (S.suit < 0.3) {
      prompt = { key: 'R', text: 'Recall ke kapal' };
    }
    SB.ui.setPrompt(prompt);
  };

  /* ---------------- selling & boarding ---------------- */
  Surface.sellAndBoard = function () {
    const pl = Surface.planet;
    let earned = 0;
    for (const id in S.cargo) {
      const qty = S.cargo[id];
      const r = SB.universe.RESOURCES[id];
      earned += qty * r.value;
      delete S.cargo[id];
    }
    const cs = S.contractStatus(pl);
    let bonus = 0;
    if (cs && cs.done && !cs.claimed) {
      bonus = cs.reward;
      S.contracts[pl.id] = true;
      S.log('Kontrak ' + pl.name + ' selesai: ' + cs.qty + ' ' + SB.universe.RESOURCES[cs.res].name + ' (+' + bonus + ' CR)', 'contract');
    }
    S.credits += earned + bonus;
    if (earned > 0 || bonus > 0) {
      SB.audio.sfx.credit();
      SB.ui.toast('Terjual +' + earned + ' CR' + (bonus ? ' · bonus kontrak +' + bonus + ' CR' : ''), 'good');
    } else {
      SB.ui.toast('Tidak ada muatan untuk dijual', 'warn');
    }
    /* refuel */
    S.ship.fuel = 1;
    S.ship.shield = Math.min(1, S.ship.shield + 0.5);
    SB.ui.toast('Bahan bakar diisi penuh', 'good');
    S.save();
    SB.cinematic.startTakeoff(pl);
  };

  /* ---------------- sky / lighting helpers ---------------- */
  Surface.sky = function () {
    const pl = Surface.planet;
    const sf = pl.surface;
    const a = Math.sin(Surface.dayT * U.TAU);       /* sun altitude */
    const dayW = U.smoothstep(U.clamp01((a - 0.02) / 0.36));
    const nightW = 1 - U.smoothstep(U.clamp01((a + 0.26) / 0.30));
    const duskW = U.clamp01(1 - dayW - nightW);
    const mix = (arr) => U.mixHex(
      U.mixHex(sf.skyNight[0], sf.skyDusk[0], duskW),
      U.mixHex(U.mixHex(sf.skyDusk[0], sf.skyDay[0], dayW), sf.skyNight[0], nightW),
      0
    );
    const top = (i) => {
      const n = sf.skyNight[i], d = sf.skyDusk[i], y = sf.skyDay[i];
      let c = U.mixHex(n, d, duskW);
      c = U.mixHex(c, y, dayW);
      return c;
    };
    return { top: top(0), bottom: top(1), dayW, nightW, duskW, altitude: a };
  };

  /* ---------------- render ---------------- */
  Surface.render = function (ctx, w, h) {
    const pl = Surface.planet;
    const sf = pl.surface;
    const seed = pl.seed;
    const cam = Surface.cam;
    const p = Surface.player;
    const zoom = 1;
    const sky = Surface.sky();

    /* ---------- sky ---------- */
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.62, sky.bottom);
    g.addColorStop(1, U.mixHex(sky.bottom, sf.fog, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    /* stars at night */
    if (sky.nightW > 0.02) {
      if (!Surface._stars) Surface._stars = G.makeStars(220, 4242, [0.4, 1.4]);
      G.drawStars(ctx, Surface._stars, 0, 0, 1, w, h, Surface.time, sky.nightW * 0.8, 1);
    }

    /* sun / moon */
    const sunX = w * 0.5 + Math.cos(Surface.dayT * U.TAU) * w * 0.46;
    const sunY = h * 0.52 - Math.sin(Surface.dayT * U.TAU) * h * 0.42;
    const isDay = sky.altitude > -0.05;
    const bodyCol = isDay ? sf.sun : '#dfe6ff';
    const bodyR = isDay ? 34 : 22;
    G.glow(ctx, sunX, sunY, bodyR * (isDay ? 7 : 4.5), bodyCol, isDay ? 0.55 : 0.28);
    ctx.fillStyle = bodyCol;
    ctx.beginPath(); ctx.arc(sunX, sunY, bodyR, 0, U.TAU); ctx.fill();
    if (!isDay) {
      /* moon craters */
      ctx.fillStyle = 'rgba(140,150,190,0.35)';
      ctx.beginPath(); ctx.arc(sunX - 7, sunY - 5, 5, 0, U.TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(sunX + 6, sunY + 6, 3.4, 0, U.TAU); ctx.fill();
    }

    /* ---------- parallax layers ---------- */
    const H = h * 0.62;

    /* far ridge */
    ctx.beginPath();
    ctx.moveTo(-2, h + 2);
    for (let sx = -2; sx <= w + 2; sx += 5) {
      const X = (sx - w / 2) / zoom + cam.x * 0.16;
      const y = ridgeY(X, seed + 3, 900, 340) * zoom + H - cam.y * 0.16 - 120;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(w + 2, h + 2);
    ctx.closePath();
    ctx.fillStyle = sf.far;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    /* mid ridge */
    ctx.beginPath();
    ctx.moveTo(-2, h + 2);
    for (let sx = -2; sx <= w + 2; sx += 4) {
      const X = (sx - w / 2) / zoom + cam.x * 0.42;
      const y = ridgeY(X, seed + 11, 430, 190) * zoom + H - cam.y * 0.42 - 55;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(w + 2, h + 2);
    ctx.closePath();
    ctx.fillStyle = sf.ridge;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;

    /* fog band at horizon */
    const fg = ctx.createLinearGradient(0, H - 190, 0, H + 40);
    fg.addColorStop(0, U.rgba(sf.fog, 0));
    fg.addColorStop(1, U.rgba(sf.fog, 0.36));
    ctx.fillStyle = fg;
    ctx.fillRect(0, H - 190, w, 230);

    /* ---------- ground ---------- */
    const gTop = [];
    ctx.beginPath();
    ctx.moveTo(-2, h + 2);
    for (let sx = -2; sx <= w + 2; sx += 3) {
      const X = (sx - w / 2) / zoom + cam.x;
      const y = groundY(X, seed) * zoom + H - cam.y;
      gTop.push({ sx, y });
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(w + 2, h + 2);
    ctx.closePath();
    const gg = ctx.createLinearGradient(0, H - 200, 0, h);
    gg.addColorStop(0, sf.ground[1]);
    gg.addColorStop(0.35, sf.ground[0]);
    gg.addColorStop(1, U.shade(sf.ground[1], -0.35));
    ctx.fillStyle = gg;
    ctx.fill();

    /* ground texture: strata + pebbles, clipped to ground */
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = U.rgba(U.shade(sf.ground[1], -0.4), 0.35);
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      for (let sx = -2; sx <= w + 2; sx += 6) {
        const X = (sx - w / 2) / zoom + cam.x;
        const y = (groundY(X, seed) + i * 26) * zoom + H - cam.y;
        sx === -2 ? ctx.moveTo(sx, y) : ctx.lineTo(sx, y);
      }
      ctx.stroke();
    }
    /* pebbles */
    const cell = 46;
    const startCell = Math.floor((cam.x - w * 0.5) / cell) - 1;
    const endCell = Math.floor((cam.x + w * 0.5) / cell) + 1;
    for (let c = startCell; c <= endCell; c++) {
      for (let k = 0; k < 2; k++) {
        const hx = U.hash(c * 31 + k * 7, seed);
        const hy = U.hash(c * 31 + k * 7 + 5, seed + 3);
        const X = c * cell + hx * cell;
        const gy = groundY(X, seed);
        const Y = gy + 24 + hy * 120;
        const sx = (X - cam.x) * zoom + w / 2;
        const sy = Y * zoom + H - cam.y;
        if (sx < -10 || sx > w + 10) continue;
        const r = 1.6 + hx * 4;
        ctx.fillStyle = U.rgba(U.shade(sf.ground[1], -0.28 + hy * 0.25), 0.8);
        ctx.beginPath();
        ctx.ellipse(sx, sy, r * 1.5, r * 0.75, hy * 3, 0, U.TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    /* ---------- landed ship ---------- */
    const shipX = 0;
    const shipY = groundY(shipX, seed);
    const sxs = (shipX - cam.x) * zoom + w / 2;
    const sysy = shipY * zoom + H - cam.y;
    if (sxs > -300 && sxs < w + 300) {
      /* shadow */
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(sxs, sysy + 4, 74, 12, 0, 0, U.TAU);
      ctx.fill();
      G.drawShip(ctx, sxs, sysy - 4, 0.12, 46, 0, {
        hull: '#cfdcf0', hullDark: '#3d4a66', accent: '#6ff2dc',
      });
      /* landing pad markers */
      ctx.strokeStyle = U.rgba('#6ff2dc', 0.25);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(sxs, sysy + 3, 90, 15, 0, 0, U.TAU); ctx.stroke();
      /* beacon */
      const pulse = (Math.sin(Surface.time * 2.4) + 1) * 0.5;
      G.glow(ctx, sxs, sysy - 62, 26 + pulse * 12, '#6ff2dc', 0.5);
    }

    /* ---------- POI markers ---------- */
    for (const po of Surface.pois) {
      const px = (po.x - cam.x) * zoom + w / 2;
      const py = po.y * zoom + H - cam.y;
      if (px < -140 || px > w + 140) continue;
      const bob = Math.sin(Surface.time * 2 + po.x) * 4;
      if (po.found) {
        ctx.strokeStyle = 'rgba(99,230,168,0.4)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(px, py - 34 + bob, 11, 0, U.TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(99,230,168,0.55)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✓', px, py - 30 + bob);
      } else {
        G.glow(ctx, px, py - 40 + bob, 30, '#ffb454', 0.4);
        ctx.strokeStyle = 'rgba(255,180,84,0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(px, py - 56 + bob);
        ctx.lineTo(px + 9, py - 44 + bob);
        ctx.lineTo(px, py - 32 + bob);
        ctx.lineTo(px - 9, py - 44 + bob);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,180,84,0.85)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(po.def.name, px, py - 66 + bob);
      }
    }

    /* ---------- resource nodes ---------- */
    for (const n of Surface.nodes) {
      if (n.depleted) continue;
      const px = (n.x - cam.x) * zoom + w / 2;
      const py = n.y * zoom + H - cam.y;
      if (px < -60 || px > w + 60) continue;
      const res = SB.universe.RESOURCES[n.res];
      const bob = Math.sin(Surface.time * 1.8 + n.bob) * 2.4;
      if (!n.scanned) {
        /* faint hint for unscanned within close range */
        if (Math.abs(n.x - p.x) < 220) {
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = res.color;
          ctx.beginPath(); ctx.arc(px, py - 8 + bob, 6, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 1;
        }
        continue;
      }
      G.glow(ctx, px, py - 10 + bob, 30, res.color, 0.55);
      ctx.save();
      ctx.translate(px, py - 8 + bob);
      ctx.fillStyle = res.color;
      ctx.beginPath();
      const R = 7;
      ctx.moveTo(0, -R); ctx.lineTo(R * 0.62, 0); ctx.lineTo(0, R); ctx.lineTo(-R * 0.62, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(0, -R); ctx.lineTo(R * 0.62, 0); ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    /* ---------- player ---------- */
    const pxs = (p.x - cam.x) * zoom + w / 2;
    const pys = p.y * zoom + H - cam.y;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(pxs, pys + 3, 15, 5, 0, 0, U.TAU);
    ctx.fill();

    /* headlamp at night */
    if (sky.nightW > 0.25) {
      const lg = ctx.createRadialGradient(pxs + 120, pys - 34, 6, pxs + 120, pys - 34, 320);
      lg.addColorStop(0, 'rgba(255,246,208,0.30)');
      lg.addColorStop(1, 'rgba(255,246,208,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(pxs + 120, pys - 34, 320, 0, U.TAU); ctx.fill();
    }

    G.drawAstronaut(ctx, pxs, pys, PLAYER_SCALE, p.phase, {
      dir: p.dir, moving: p.moving, jet: p.onGround ? 0 : 0.85,
      suit: '#e9eefb', suitDark: '#93a1c0', accent: '#6ff2dc',
    });

    /* ---------- scan pulse ---------- */
    if (Surface.scanPulse) {
      const sp = Surface.scanPulse;
      const r = sp.r;
      ctx.strokeStyle = U.rgba('#6ff2dc', 0.6 * (1 - r / SCAN_RADIUS));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse((sp.x - cam.x) * zoom + w / 2, (Surface.groundY(sp.x) - cam.y) * zoom + H, r, r * 0.28, 0, 0, U.TAU);
      ctx.stroke();
    }

    /* ---------- mining progress ---------- */
    if (Surface.mine && Surface.mineProgress > 0.01) {
      const n = Surface.mine;
      const mx = (n.x - cam.x) * zoom + w / 2;
      const my = n.y * zoom + H - cam.y - 34;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(mx, my, 15, 0, U.TAU); ctx.stroke();
      ctx.strokeStyle = SB.universe.RESOURCES[n.res].color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(mx, my, 15, -Math.PI / 2, -Math.PI / 2 + U.TAU * U.clamp01(Surface.mineProgress));
      ctx.stroke();
    }

    /* ---------- floating text ---------- */
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px ui-monospace, monospace';
    for (const f of Surface.floats) {
      const a = U.clamp01(f.life / f.max);
      const fx = (f.x - cam.x) * zoom + w / 2;
      const fy = f.y * zoom + H - cam.y;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.col;
      ctx.shadowColor = f.col; ctx.shadowBlur = 10;
      ctx.fillText(f.text, fx, fy);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    /* ---------- foreground silhouettes ---------- */
    ctx.save();
    ctx.fillStyle = U.rgba(U.shade(sf.ground[1], -0.55), 0.92);
    const fcell = 340;
    const fs = Math.floor((cam.x - w * 0.6) / fcell) - 1;
    const fe = Math.floor((cam.x + w * 0.6) / fcell) + 1;
    for (let c = fs; c <= fe; c++) {
      const hx = U.hash(c * 91, seed + 44);
      if (hx < 0.45) continue;
      const X = c * fcell + hx * fcell;
      const sx = (X - cam.x * 1.32) * zoom + w / 2;
      if (sx < -140 || sx > w + 140) continue;
      const gy = groundY(X, seed);
      const sy = gy * zoom + H - cam.y * 1.32 + 240;
      const r = 22 + hx * 34;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r * 1.7, r * 0.8, hx * 2, 0, U.TAU);
      ctx.fill();
    }
    ctx.restore();

    /* ---------- night / dusk tint over the world ---------- */
    if (sky.nightW > 0.01) {
      ctx.fillStyle = U.rgba('#0a1230', sky.nightW * 0.46);
      ctx.fillRect(0, 0, w, h);
    } else if (sky.duskW > 0.01) {
      ctx.fillStyle = U.rgba('#7a3a2a', sky.duskW * 0.2);
      ctx.fillRect(0, 0, w, h);
    }

    /* ---------- vignette ---------- */
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  };
})();
