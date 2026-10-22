/* ============================================================
   space.js — orbital flight mode
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.utils;
  const G = SB.gfx;
  const S = SB.state;

  const SHIP_SCALE = 22;
  const LAND_SPEED = 240;          // max speed to land
  const LAND_RANGE = 1.55;         // planet radius multiplier

  const Space = (SB.space = {
    cam: { x: 0, y: 0, zoom: 1, shake: 0, shakeX: 0, shakeY: 0 },
    planets: [],
    asteroids: [],
    trail: [],
    particles: [],
    dust: [],
    target: null,
    time: 0,
    sys: null,
    _renderBudget: 0,
  });

  /* ---------------- setup ---------------- */
  Space.enter = function (systemId, keepShip) {
    const sys = SB.universe.getSystem(systemId);
    Space.sys = sys;
    S.systemId = systemId;
    S.systemsSeen[systemId] = true;

    /* lazily build system assets */
    if (!sys.nebulaCanvas) {
      sys.nebulaCanvas = G.makeNebula(1024, sys.nebula, sys.id.length * 977);
      sys.stars = [
        G.makeStars(520, 11 + systemId.length, [0.4, 1.5]),
        G.makeStars(260, 77 + systemId.length, [0.6, 2.0]),
        G.makeStars(110, 131 + systemId.length, [0.9, 2.6]),
      ];
    }

    /* place planets */
    Space.planets = sys.planets.map((p, i) => {
      const orbit = p.orbit;
      const ang = p.orbitAngle;
      const x = Math.cos(ang) * orbit;
      const y = Math.sin(ang) * orbit * 0.42;   /* slight ellipse for depth */
      if (!p._sphere) {
        p._eq = G.buildEquirect(p);
        p._sphere = new G.Sphere(p._eq, { x: -0.52, y: -0.44, z: 0.73 });
      }
      return { def: p, x, y, orbit, ang, vAng: p.orbitSpeed * (i % 2 ? -1 : 1), r: p.size };
    });

    /* asteroids */
    Space.asteroids = [];
    const beltCount = 26;
    const rng = U.mulberry32(sys.id.length * 31 + 7);
    for (let i = 0; i < beltCount; i++) {
      const ang = rng() * U.TAU;
      const belt = sys.planets[1] ? sys.planets[1].orbit + sys.planets[0].orbit : 2400;
      const rr = belt * (0.55 + rng() * 0.35);
      Space.asteroids.push({
        x: Math.cos(ang) * rr,
        y: Math.sin(ang) * rr * 0.42,
        r: 8 + rng() * 26,
        rot: rng() * U.TAU,
        spin: (rng() - 0.5) * 0.6,
        drift: (rng() - 0.5) * 0.02,
        shape: Array.from({ length: 9 }, () => 0.62 + rng() * 0.5),
        col: rng() < 0.3 ? '#5a5060' : '#6d6458',
      });
    }

    /* dust particles for speed sensation */
    Space.dust = [];
    for (let i = 0; i < 130; i++) {
      Space.dust.push({
        x: (rng() - 0.5) * 2400, y: (rng() - 0.5) * 1600,
        z: 0.3 + rng() * 0.9, r: 0.5 + rng() * 1.6,
      });
    }

    Space.particles = [];
    Space.trail = [];
    Space.time = 0;
    Space.target = null;
    Space._renderBudget = 0;

    if (!keepShip || !S.ship) {
      S.ship = { x: 1400, y: 260, vx: 0, vy: 0, angle: Math.PI, fuel: 1, shield: 1, throttle: 0, boost: false, landed: false };
    }
    S.ship.landed = false;
    Space.cam.x = S.ship.x; Space.cam.y = S.ship.y;
    Space.cam.zoom = 1;
    Space.cam.shake = 0;

    SB.audio.startEngine();
    SB.audio.startAmbient('space');
  };

  Space.exit = function () {
    SB.audio.stopEngine();
  };

  /* ---------------- helpers ---------------- */
  Space.nearestPlanet = function (maxDist) {
    let best = null, bd = Infinity;
    for (const p of Space.planets) {
      const d = U.dist(S.ship.x, S.ship.y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (maxDist && bd > maxDist) return null;
    return { planet: best, dist: bd };
  };

  /* nearest planet we could realistically settle on (range + speed gate) */
  Space.landingCandidate = function () {
    const near = Space.nearestPlanet();
    if (!near.planet) return null;
    const p = near.planet;
    const range = p.r * LAND_RANGE + 150;
    if (near.dist > range) return null;
    const speed = Math.hypot(S.ship.vx, S.ship.vy);
    if (speed > LAND_SPEED) return null;
    return p;
  };

  Space.landingTarget = function () {
    const p = Space.landingCandidate();
    if (!p || p.def.landable === false) return null;
    return {
      planet: p,
      dist: U.dist(S.ship.x, S.ship.y, p.x, p.y),
      speed: Math.hypot(S.ship.vx, S.ship.vy),
    };
  };

  /* ---------------- update ---------------- */
  Space.update = function (dt) {
    const sh = S.ship;
    Space.time += dt;

    const Input = SB.input;
    let thrust = 0, turn = 0, brake = 0;

    if (Input.down('up') || Input.down('w')) thrust = 1;
    if (Input.down('down') || Input.down('s')) { brake = 1; thrust = -0.45; }
    if (Input.down('left') || Input.down('a')) turn = -1;
    if (Input.down('right') || Input.down('d')) turn = 1;
    const boost = Input.down('shift') && sh.fuel > 0.01;

    /* rotation */
    const turnRate = 3.1 * (boost ? 0.75 : 1);
    sh.angle += turn * turnRate * dt;
    if (turn === 0) sh.angle += 0; /* no angular damping in vacuum */

    /* thrust */
    const boostMul = boost ? 2.35 : 1;
    const accel = 300 * boostMul;
    if (thrust > 0) {
      sh.vx += Math.cos(sh.angle) * accel * thrust * dt;
      sh.vy += Math.sin(sh.angle) * accel * thrust * dt;
      sh.fuel = Math.max(0, sh.fuel - (boost ? 0.055 : 0.021) * dt);
    } else if (thrust < 0) {
      sh.vx += Math.cos(sh.angle) * accel * thrust * dt;
      sh.vy += Math.sin(sh.angle) * accel * thrust * dt;
      sh.fuel = Math.max(0, sh.fuel - 0.008 * dt);
    }
    if (brake > 0) {
      const sp = Math.hypot(sh.vx, sh.vy);
      if (sp > 0) {
        const dec = Math.min(sp, 260 * dt);
        sh.vx -= (sh.vx / sp) * dec;
        sh.vy -= (sh.vy / sp) * dec;
      }
    }

    /* soft speed cap (with boost headroom) */
    const maxSpeed = boost ? 1150 : 640;
    const sp = Math.hypot(sh.vx, sh.vy);
    if (sp > maxSpeed) {
      const k = maxSpeed / sp;
      sh.vx *= k; sh.vy *= k;
    }

    /* slight drag so the ship settles */
    const drag = Math.exp(-0.16 * dt);
    sh.vx *= drag; sh.vy *= drag;

    sh.throttle = thrust > 0 ? (boost ? 1 : 0.62) : (thrust < 0 ? 0.25 : 0);
    sh.boost = boost && thrust > 0;

    /* integrate */
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;

    /* star gravity (very light) */
    const sd = Math.hypot(sh.x, sh.y);
    if (sd > 1) {
      const g = 5200 / (sd * sd);
      sh.vx -= (sh.x / sd) * g * dt;
      sh.vy -= (sh.y / sd) * g * dt;
    }

    /* planets orbit slowly */
    for (const p of Space.planets) {
      p.ang += p.vAng * dt;
      p.x = Math.cos(p.ang) * p.orbit;
      p.y = Math.sin(p.ang) * p.orbit * 0.42;
      p.def.rotation += p.def.spin !== undefined ? p.def.spin * dt : 0;
    }

    /* collisions */
    let collided = false;
    for (const p of Space.planets) {
      const d = U.dist(sh.x, sh.y, p.x, p.y);
      const minD = p.r + 16;
      if (d < minD) {
        const nx = (sh.x - p.x) / (d || 1), ny = (sh.y - p.y) / (d || 1);
        sh.x = p.x + nx * minD;
        sh.y = p.y + ny * minD;
        const dot = sh.vx * nx + sh.vy * ny;
        if (dot < 0) {
          sh.vx -= 1.5 * dot * nx;
          sh.vy -= 1.5 * dot * ny;
          const impact = Math.min(1, Math.abs(dot) / 700);
          sh.shield = Math.max(0, sh.shield - impact * 0.45);
          Space.cam.shake = Math.min(26, Space.cam.shake + impact * 22);
          if (!collided) { SB.audio.sfx.warn(); collided = true; }
          for (let i = 0; i < 8 + impact * 20; i++) {
            Space.particles.push({
              x: sh.x, y: sh.y,
              vx: nx * (60 + Math.random() * 220) + (Math.random() - 0.5) * 160,
              vy: ny * (60 + Math.random() * 220) + (Math.random() - 0.5) * 160,
              life: 0.4 + Math.random() * 0.5, max: 0.9,
              size: 1.4 + Math.random() * 2.6,
              col: '#ffd0a0', glow: true,
            });
          }
        }
      }
    }

    /* asteroid collisions */
    for (const a of Space.asteroids) {
      a.rot += a.spin * dt;
      a.x += Math.cos(a.rot * 0.3) * 6 * dt;
      a.y += Math.sin(a.rot * 0.3) * 6 * dt;
      const d = U.dist(sh.x, sh.y, a.x, a.y);
      if (d < a.r + 12) {
        const nx = (sh.x - a.x) / (d || 1), ny = (sh.y - a.y) / (d || 1);
        sh.x = a.x + nx * (a.r + 13);
        sh.y = a.y + ny * (a.r + 13);
        const dot = sh.vx * nx + sh.vy * ny;
        sh.vx -= 1.4 * dot * nx; sh.vy -= 1.4 * dot * ny;
        sh.shield = Math.max(0, sh.shield - 0.06);
        Space.cam.shake = Math.min(20, Space.cam.shake + 7);
        SB.audio.sfx.deny();
        for (let i = 0; i < 6; i++) {
          Space.particles.push({
            x: a.x, y: a.y, vx: (Math.random() - 0.5) * 130, vy: (Math.random() - 0.5) * 130,
            life: 0.5, max: 0.5, size: 1 + Math.random() * 2, col: a.col, glow: false,
          });
        }
      }
    }

    /* star collision */
    const starR = Space.sys.star.size * 0.42;
    const ds = Math.hypot(sh.x, sh.y);
    if (ds < starR) {
      const nx = sh.x / (ds || 1), ny = sh.y / (ds || 1);
      sh.x = nx * starR; sh.y = ny * starR;
      const dot = sh.vx * nx + sh.vy * ny;
      sh.vx -= 1.6 * dot * nx; sh.vy -= 1.6 * dot * ny;
      sh.shield = Math.max(0, sh.shield - 0.4);
      Space.cam.shake = 24;
      SB.audio.sfx.warn();
    }

    /* thruster particles */
    if (sh.throttle > 0.05) {
      const back = -0.85 * SHIP_SCALE;
      const px = sh.x + Math.cos(sh.angle) * back;
      const py = sh.y + Math.sin(sh.angle) * back;
      const n = sh.boost ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const spread = (Math.random() - 0.5) * 0.9;
        const a = sh.angle + Math.PI + spread;
        const spd = (sh.boost ? 300 : 170) * (0.6 + Math.random() * 0.8);
        Space.particles.push({
          x: px, y: py,
          vx: Math.cos(a) * spd + sh.vx * 0.25,
          vy: Math.sin(a) * spd + sh.vy * 0.25,
          life: 0.25 + Math.random() * 0.45, max: 0.7,
          size: 1.4 + Math.random() * 2.4,
          col: sh.boost ? '#ffd08a' : '#8fe9ff', glow: true,
        });
      }
    }

    /* update particles */
    const ps = Space.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.exp(-1.4 * dt); p.vy *= Math.exp(-1.4 * dt);
    }
    if (ps.length > 420) ps.splice(0, ps.length - 420);

    /* trail */
    Space.trail.push({ x: sh.x, y: sh.y });
    if (Space.trail.length > 110) Space.trail.shift();

    /* camera */
    const cam = Space.cam;
    const lead = 0.42;
    const tx = sh.x + sh.vx * lead;
    const ty = sh.y + sh.vy * lead;
    cam.x = U.approach(cam.x, tx, 4.2, dt);
    cam.y = U.approach(cam.y, ty, 4.2, dt);
    const speedZoom = U.clamp(1 - (sp / 1150) * 0.42, 0.55, 1);
    cam.zoom = U.approach(cam.zoom, speedZoom, 2.2, dt);
    cam.shake = Math.max(0, cam.shake - dt * 42);
    cam.shakeX = (Math.random() - 0.5) * cam.shake;
    cam.shakeY = (Math.random() - 0.5) * cam.shake;

    /* zoom with wheel */
    if (SB.input.mouse.wheel) {
      cam.zoom = U.clamp(cam.zoom * (SB.input.mouse.wheel > 0 ? 0.86 : 1.16), 0.28, 2.6);
    }

    /* target tracking */
    const near = Space.nearestPlanet();
    Space.target = near.planet ? near.planet.def : null;
    Space.targetDist = near.dist;

    /* audio engine */
    SB.audio.setEngine(sh.throttle, sh.boost);
    if (sh.fuel <= 0.001 && sh.throttle > 0.05 && !Space._lowWarned) {
      Space._lowWarned = true;
      SB.audio.sfx.lowFuel();
      SB.ui.toast('FUEL MENIPIS — mesin utama dry', 'warn');
    }
    if (sh.fuel > 0.05) Space._lowWarned = false;

    /* landing trigger — buka panel info planet */
    if (SB.input.hit('e')) {
      const cand = Space.landingCandidate();
      if (cand) {
        SB.ui.openPlanet(cand.def);
        SB.audio.sfx.ui();
      } else if (Space.target) {
        const near = Space.nearestPlanet();
        const speed = Math.hypot(S.ship.vx, S.ship.vy);
        const inRange = near.dist <= near.planet.r * LAND_RANGE + 150;
        if (inRange && speed > LAND_SPEED) {
          SB.ui.toast('Terlalu cepat — rem dengan S lalu tekan E lagi', 'warn');
        } else {
          SB.ui.toast('Belum dalam area orbit — dekati planet terdekat', 'warn');
        }
        SB.audio.sfx.deny();
      }
    }
  };

  /* ---------------- render ---------------- */
  Space.render = function (ctx, w, h) {
    const cam = Space.cam;
    const sys = Space.sys;
    const zoom = cam.zoom;
    const cx = w * 0.5 + cam.shakeX;
    const cy = h * 0.5 + cam.shakeY;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    /* ---- background (screen space) ---- */
    ctx.save();
    const dpr = SB.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04050b';
    ctx.fillRect(0, 0, w, h);

    if (sys.nebulaCanvas) {
      const par = 0.03;
      const nx = ((-cam.x * par * zoom) % 1024 + 1024) % 1024;
      const ny = ((-cam.y * par * zoom) % 1024 + 1024) % 1024;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      for (let ix = -1; ix <= 1; ix++) {
        for (let iy = -1; iy <= 1; iy++) {
          ctx.drawImage(sys.nebulaCanvas, nx + ix * 1024 - 1024, ny + iy * 1024 - 1024, 1024, 1024);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (sys.stars) {
      G.drawStars(ctx, sys.stars[0], cam.x, cam.y, zoom, w, h, Space.time, 0.55, 0);
      G.drawStars(ctx, sys.stars[1], cam.x, cam.y, zoom, w, h, Space.time, 0.75, 1);
      G.drawStars(ctx, sys.stars[2], cam.x, cam.y, zoom, w, h, Space.time, 0.95, 2);
    }
    ctx.restore();

    /* ---- world space ---- */
    /* orbit rings */
    ctx.lineWidth = 1 / zoom;
    for (const p of Space.planets) {
      ctx.strokeStyle = 'rgba(140,170,220,0.10)';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.orbit, p.orbit * 0.42, 0, 0, U.TAU);
      ctx.stroke();
    }

    /* star */
    const star = sys.star;
    const starPulse = 1 + Math.sin(Space.time * 0.8) * 0.02;
    G.glow(ctx, 0, 0, star.size * 3.2 * starPulse, star.color, 0.42);
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, star.size * 0.5);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(0.35, star.color);
    sg.addColorStop(1, U.rgba(star.color, 0));
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(0, 0, star.size * 0.5, 0, U.TAU); ctx.fill();

    /* planets */
    for (const p of Space.planets) {
      const sp = p.def._sphere;
      const screenR = p.r * zoom;
      const res = U.clamp(Math.round(screenR * 2.1), 64, 380);
      sp.setResolution(res);
      sp.update(p.def.rotation);

      /* atmosphere halo */
      G.glow(ctx, p.x, p.y, p.r * 1.55, p.def.palette.ramp[2], 0.30);

      sp.draw(ctx, p.x, p.y, p.r);

      /* rim light */
      ctx.strokeStyle = U.rgba(p.def.palette.ramp[2], 0.5);
      ctx.lineWidth = 1.6 / zoom;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.stroke();

      /* terminator shadow overlay for depth */
      const tg = ctx.createRadialGradient(
        p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.1,
        p.x, p.y, p.r * 1.05);
      tg.addColorStop(0, 'rgba(0,0,0,0)');
      tg.addColorStop(0.65, 'rgba(0,0,0,0)');
      tg.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.fill();
    }

    /* asteroids */
    for (const a of Space.asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot);
      ctx.beginPath();
      for (let i = 0; i < a.shape.length; i++) {
        const ang = (i / a.shape.length) * U.TAU;
        const rr = a.r * a.shape[i];
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = a.col;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
      ctx.restore();
    }

    /* thruster particles */
    for (const p of Space.particles) {
      const a = U.clamp01(p.life / p.max);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, U.TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* trail */
    if (Space.trail.length > 2) {
      ctx.lineWidth = 1.6 / zoom;
      for (let i = 1; i < Space.trail.length; i++) {
        const t = i / Space.trail.length;
        ctx.strokeStyle = `rgba(111,242,220,${0.22 * t})`;
        ctx.beginPath();
        ctx.moveTo(Space.trail[i - 1].x, Space.trail[i - 1].y);
        ctx.lineTo(Space.trail[i].x, Space.trail[i].y);
        ctx.stroke();
      }
    }

    /* ship */
    G.drawShip(ctx, S.ship.x, S.ship.y, S.ship.angle, SHIP_SCALE, S.ship.throttle, {
      hull: '#cfdcf0', hullDark: '#3d4a66', accent: '#6ff2dc', flame: '#9df5ff',
    });

    /* landing target reticle */
    const land = Space.landingTarget();
    if (land) {
      const p = land.planet;
      ctx.strokeStyle = 'rgba(111,242,220,0.55)';
      ctx.lineWidth = 1.4 / zoom;
      ctx.setLineDash([12 / zoom, 10 / zoom]);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 60, 0, U.TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  };

  /* minimap */
  Space.renderMinimap = function (mctx, mw, mh) {
    const sys = Space.sys;
    mctx.clearRect(0, 0, mw, mh);
    const maxR = 16000;
    const scale = (Math.min(mw, mh) * 0.46) / maxR;

    mctx.save();
    mctx.translate(mw / 2, mh / 2);

    /* orbit rings */
    for (const p of Space.planets) {
      mctx.strokeStyle = 'rgba(140,170,220,0.16)';
      mctx.lineWidth = 1;
      mctx.beginPath();
      mctx.ellipse(0, 0, p.orbit * scale, p.orbit * 0.42 * scale, 0, 0, U.TAU);
      mctx.stroke();
    }

    /* star */
    mctx.fillStyle = sys.star.color;
    mctx.shadowColor = sys.star.color; mctx.shadowBlur = 12;
    mctx.beginPath(); mctx.arc(0, 0, 3.2, 0, U.TAU); mctx.fill();
    mctx.shadowBlur = 0;

    /* planets */
    for (const p of Space.planets) {
      const x = p.x * scale, y = p.y * scale;
      const r = Math.max(2.4, p.r * scale * 3.2);
      mctx.fillStyle = p.def.palette.ramp[1];
      mctx.beginPath(); mctx.arc(x, y, r, 0, U.TAU); mctx.fill();
      if (Space.target && Space.target.id === p.def.id) {
        mctx.strokeStyle = 'rgba(111,242,220,0.9)';
        mctx.lineWidth = 1.4;
        mctx.beginPath(); mctx.arc(x, y, r + 4, 0, U.TAU); mctx.stroke();
      }
    }

    /* ship */
    const sh = S.ship;
    mctx.save();
    mctx.translate(sh.x * scale, sh.y * scale);
    mctx.rotate(sh.angle);
    mctx.fillStyle = '#6ff2dc';
    mctx.shadowColor = '#6ff2dc'; mctx.shadowBlur = 10;
    mctx.beginPath();
    mctx.moveTo(6, 0); mctx.lineTo(-4, -3.2); mctx.lineTo(-4, 3.2);
    mctx.closePath(); mctx.fill();
    mctx.restore();
    mctx.shadowBlur = 0;

    mctx.restore();
  };
})();
