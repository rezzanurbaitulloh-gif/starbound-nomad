/* ============================================================
   gfx.js — procedural rendering: spherical planet renderer,
   ship, astronaut, starfield, nebula, bloom, glow helpers.
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.utils;

  const G = (SB.gfx = {});

  /* ---------------------------------------------------------
     canvas helpers
     --------------------------------------------------------- */
  G.makeCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(w));
    c.height = Math.max(1, Math.floor(h));
    return c;
  };

  G.supportsFilter = (function () {
    try {
      const c = G.makeCanvas(2, 2).getContext('2d');
      c.filter = 'blur(1px)';
      return c.filter !== 'none';
    } catch (e) { return false; }
  })();

  /* ---------------------------------------------------------
     equirectangular planet texture generator
     --------------------------------------------------------- */
  const EQ_W = 512, EQ_H = 256;

  G.buildEquirect = function (planet) {
    const w = EQ_W, h = EQ_H;
    const data = new Uint8ClampedArray(w * h * 4);
    const emit = new Uint8ClampedArray(w * h);
    const p = planet.palette;
    const seed = planet.seed;
    const type = planet.type;

    const ramp = p.ramp;                    // array of hex colours
    const c1 = U.hexToRgb(ramp[0]);
    const c2 = U.hexToRgb(ramp[1]);
    const c3 = U.hexToRgb(ramp[2]);
    const c4 = U.hexToRgb(ramp[3 % ramp.length]);

    for (let y = 0; y < h; y++) {
      const lat = (y / (h - 1)) * 2 - 1;              // -1..1
      const latAbs = Math.abs(lat);
      for (let x = 0; x < w; x++) {
        const lon = (x / w) * U.TAU;
        const i = y * w + x;

        let r, g, b, e = 0;

        if (type === 'gas') {
          /* banded: latitude drives colour, turbulence warps the bands */
          const turb = U.fbm2(lon * 1.6 + 11, lat * 7 + 3, seed, 4) - 0.5;
          const band = (lat * 2.6 + turb * 0.85) % 1;
          const bb = band < 0 ? band + 1 : band;
          const seg = bb * 3;
          const k = seg < 1 ? 0 : seg < 2 ? 1 : 2;
          const t = seg - k;
          const A = k === 0 ? c1 : k === 1 ? c2 : c3;
          const B = k === 0 ? c2 : k === 1 ? c3 : c4;
          r = U.lerp(A.r, B.r, t); g = U.lerp(A.g, B.g, t); b = U.lerp(A.b, B.b, t);
          /* polar caps slightly cooler */
          if (latAbs > 0.72) {
            const f = U.smoothstep((latAbs - 0.72) / 0.28) * 0.7;
            r = U.lerp(r, 220, f); g = U.lerp(g, 228, f); b = U.lerp(b, 240, f);
          }
          /* great storm */
          const sd = Math.hypot(((lon - 2.1 + Math.PI) % U.TAU) - Math.PI, (lat - 0.22) * 2.4);
          if (sd < 0.42) {
            const f = 1 - U.smoothstep(sd / 0.42);
            r = U.lerp(r, 210, f * .75); g = U.lerp(g, 92, f * .7); b = U.lerp(b, 74, f * .7);
          }
        } else if (type === 'ocean') {
          const n = U.fbm2(lon * 1.9, lat * 2.4, seed, 5);
          const land = n > 0.54;
          if (land) {
            const t = U.clamp01((n - 0.54) / 0.2);
            r = U.lerp(c1.r, c2.r, t); g = U.lerp(c1.g, c2.g, t); b = U.lerp(c1.b, c2.b, t);
          } else {
            const d = U.clamp01(0.35 + n * 0.8);
            r = U.lerp(c3.r, 16, d); g = U.lerp(c3.g, 62, d); b = U.lerp(c3.b, 122, d);
          }
          /* ice caps */
          if (latAbs > 0.82) {
            const f = U.smoothstep((latAbs - 0.82) / 0.18);
            r = U.lerp(r, 236, f); g = U.lerp(g, 244, f); b = U.lerp(b, 252, f);
          }
          /* clouds */
          const cl = U.fbm2(lon * 3.4 + 40, lat * 5 + 20, seed + 9, 4);
          if (cl > 0.63) {
            const f = U.smoothstep((cl - 0.63) / 0.2) * 0.72;
            r = U.lerp(r, 252, f); g = U.lerp(g, 253, f); b = U.lerp(b, 255, f);
          }
        } else if (type === 'lava') {
          const n = U.fbm2(lon * 2.6, lat * 3.2, seed, 5);
          const crust = U.clamp01((n - 0.36) / 0.5);
          r = U.lerp(24, c1.r, crust); g = U.lerp(16, c1.g, crust); b = U.lerp(18, c1.b, crust);
          const veins = Math.abs(U.fbm2(lon * 5.5 + 7, lat * 6.5 + 3, seed + 21, 4) - 0.5);
          if (veins < 0.055) {
            const f = 1 - veins / 0.055;
            r = U.lerp(r, 255, f); g = U.lerp(g, 150 + 70 * f, f); b = U.lerp(b, 40, f);
            e = Math.round(255 * f);
          }
        } else if (type === 'ice') {
          const n = U.fbm2(lon * 3, lat * 4, seed, 5);
          r = U.lerp(c1.r, c2.r, n); g = U.lerp(c1.g, c2.g, n); b = U.lerp(c1.b, c2.b, n);
          const crack = Math.abs(U.fbm2(lon * 6 + 13, lat * 7 + 5, seed + 5, 3) - 0.5);
          if (crack < 0.035) { r *= .74; g *= .80; b *= .92; }
        } else if (type === 'desert') {
          const n = U.fbm2(lon * 2.2, lat * 3.4, seed, 5);
          const band = 0.5 + 0.5 * Math.sin(lat * 9 + n * 5);
          r = U.lerp(c1.r, c2.r, band * .8 + n * .2);
          g = U.lerp(c1.g, c2.g, band * .8 + n * .2);
          b = U.lerp(c1.b, c2.b, band * .8 + n * .2);
          const dark = U.fbm2(lon * 4.5 + 3, lat * 5 + 8, seed + 31, 4);
          if (dark > 0.62) { const f = (dark - 0.62) / 0.38; r = U.lerp(r, 120, f * .6); g = U.lerp(g, 92, f * .6); b = U.lerp(b, 70, f * .6); }
        } else if (type === 'toxic') {
          const n = U.fbm2(lon * 2.4 + 60, lat * 3.6 + 12, seed, 5);
          const sw = 0.5 + 0.5 * Math.sin(lon * 3 + n * 7);
          r = U.lerp(c1.r, c3.r, sw); g = U.lerp(c1.g, c3.g, sw); b = U.lerp(c1.b, c3.b, sw);
          const blobs = U.fbm2(lon * 6 + 90, lat * 7, seed + 44, 3);
          if (blobs > 0.68) { const f = (blobs - 0.68) / 0.32; r = U.lerp(r, 226, f * .5); g = U.lerp(g, 240, f * .5); b = U.lerp(b, 120, f * .4); }
        } else if (type === 'crystal') {
          const n = U.fbm2(lon * 4.5, lat * 5.5, seed, 4);
          const facet = Math.abs(((n * 8) % 1) - 0.5);
          r = U.lerp(c1.r, c2.r, facet * 1.6);
          g = U.lerp(c1.g, c2.g, facet * 1.6);
          b = U.lerp(c1.b, c2.b, facet * 1.6);
          const gl = Math.abs(U.fbm2(lon * 8 + 2, lat * 9, seed + 61, 3) - 0.5);
          if (gl < 0.03) { r = U.lerp(r, 240, .6); g = U.lerp(g, 230, .6); b = U.lerp(b, 255, .6); e = 120; }
        } else { /* rock */
          const n = U.fbm2(lon * 2.8, lat * 3.6, seed, 5);
          r = U.lerp(c1.r, c2.r, n); g = U.lerp(c1.g, c2.g, n); b = U.lerp(c1.b, c2.b, n);
          const maria = U.fbm2(lon * 1.6 + 30, lat * 2.2, seed + 77, 3);
          if (maria > 0.6) { const f = (maria - 0.6) / 0.4; r = U.lerp(r, 92, f * .45); g = U.lerp(g, 88, f * .45); b = U.lerp(b, 92, f * .45); }
        }

        const j = i * 4;
        data[j] = r; data[j + 1] = g; data[j + 2] = b; data[j + 3] = 255;
        emit[i] = e;
      }
    }
    return { w, h, data, emit };
  };

  /* ---------------------------------------------------------
     sphere renderer — equirect texture projected to a disc
     --------------------------------------------------------- */
  class Sphere {
    constructor(eq, light) {
      this.eq = eq;
      this.light = light || { x: -0.55, y: -0.42, z: 0.72 };
      this.rot = 0;
      this.res = 128;
      this.canvas = G.makeCanvas(this.res, this.res);
      this.ctx = this.canvas.getContext('2d');
      this._img = this.ctx.createImageData(this.res, this.res);
      this._dirty = true;
      this._base = null;   // per-pixel precomputation
      this._lastRot = -999;
    }

    setResolution(res) {
      res = Math.max(48, Math.min(420, Math.round(res)));
      if (res === this.res) return;
      this.res = res;
      this.canvas = G.makeCanvas(res, res);
      this.ctx = this.canvas.getContext('2d');
      this._img = this.ctx.createImageData(res, res);
      this._base = null;
      this._dirty = true;
    }

    _precompute() {
      const res = this.res, n = res * res;
      const col = new Int16Array(n);
      const row = new Int16Array(n);
      const shade = new Float32Array(n);
      const alpha = new Uint8Array(n);
      const eq = this.eq;
      const L = this.light;
      for (let y = 0; y < res; y++) {
        const ny = (y + 0.5) / res * 2 - 1;
        for (let x = 0; x < res; x++) {
          const nx = (x + 0.5) / res * 2 - 1;
          const i = y * res + x;
          const r2 = nx * nx + ny * ny;
          if (r2 > 1) { alpha[i] = 0; continue; }
          const nz = Math.sqrt(1 - r2);
          const lat = Math.asin(-ny);
          const phi = Math.atan2(nx, nz);
          col[i] = Math.round(((phi / U.TAU) + 1) * (eq.w - 1));
          row[i] = Math.round(((lat / Math.PI) + 0.5) * (eq.h - 1));
          /* lambert + terminator softening + limb darkening */
          const ndl = nx * L.x + ny * L.y + nz * L.z;
          const diff = U.clamp01((ndl + 0.22) / 1.22);
          const lam = 0.13 + 0.87 * Math.pow(diff, 1.25);
          const limb = Math.pow(nz, 0.32);
          shade[i] = lam * (0.55 + 0.45 * limb);
          alpha[i] = 255;
        }
      }
      this._base = { col, row, shade, alpha };
      this._dirty = true;
    }

    update(rot) {
      this.rot = rot;
      if (!this._base) this._precompute();
      if (Math.abs(rot - this._lastRot) < 0.004 && !this._dirty) return false;
      this._lastRot = rot;
      this._dirty = false;

      const res = this.res, eq = this.eq;
      const { col, row, shade, alpha } = this._base;
      const out = this._img.data;
      const rotCols = Math.round((rot / U.TAU) * eq.w);
      const ew = eq.w, eh = eq.h;

      for (let y = 0; y < res; y++) {
        const sy = row[y * res] * ew;
        for (let x = 0; x < res; x++) {
          const i = y * res + x;
          if (!alpha[i]) { out[i * 4 + 3] = 0; continue; }
          let sx = (col[i] + rotCols) % ew; if (sx < 0) sx += ew;
          const si = (sy + sx) * 4;
          const s = shade[i];
          const em = eq.emit[sy + sx] / 255;
          out[i * 4] = Math.min(255, eq.data[si] * s + em * 90);
          out[i * 4 + 1] = Math.min(255, eq.data[si + 1] * s + em * 46);
          out[i * 4 + 2] = Math.min(255, eq.data[si + 2] * s + em * 12);
          out[i * 4 + 3] = 255;
        }
      }
      this.ctx.putImageData(this._img, 0, 0);
      return true;
    }

    draw(ctx, x, y, radius) {
      ctx.drawImage(this.canvas, x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  G.Sphere = Sphere;

  /* ---------------------------------------------------------
     bloom — cheap two-pass glow over the finished frame
     --------------------------------------------------------- */
  const bloom = (G.bloom = {
    a: null, b: null, actx: null, bctx: null, w: 0, h: 0,
    ensure(w, h) {
      const bw = Math.max(2, Math.floor(w * 0.25));
      const bh = Math.max(2, Math.floor(h * 0.25));
      if (bw !== this.w || bh !== this.h) {
        this.w = bw; this.h = bh;
        this.a = G.makeCanvas(bw, bh); this.actx = this.a.getContext('2d');
        this.b = G.makeCanvas(bw, bh); this.bctx = this.b.getContext('2d');
      }
    },
    apply(ctx, source, strength) {
      if (!G.supportsFilter) return;
      this.ensure(source.width, source.height);
      const { a, b, actx, bctx } = this;
      actx.setTransform(1, 0, 0, 1, 0, 0);
      actx.clearRect(0, 0, this.w, this.h);
      actx.globalCompositeOperation = 'source-over';
      actx.drawImage(source, 0, 0, this.w, this.h);
      /* crush shadows: multiply the frame by itself */
      actx.globalCompositeOperation = 'multiply';
      actx.drawImage(a, 0, 0);
      actx.globalCompositeOperation = 'source-over';
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, this.w, this.h);
      bctx.filter = 'blur(5px)';
      bctx.drawImage(a, 0, 0);
      bctx.filter = 'none';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = strength;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(b, 0, 0, source.width, source.height);
      ctx.restore();
    },
  });

  /* ---------------------------------------------------------
     glow helpers
     --------------------------------------------------------- */
  G.glow = function (ctx, x, y, radius, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, U.rgba(color, 0.85 * alpha));
    g.addColorStop(0.35, U.rgba(color, 0.28 * alpha));
    g.addColorStop(1, U.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, U.TAU);
    ctx.fill();
  };

  /* ---------------------------------------------------------
     ship — procedural dart, nose pointing +x
     --------------------------------------------------------- */
  G.drawShip = function (ctx, x, y, angle, scale, throttle, opt = {}) {
    const s = scale;
    const hull = opt.hull || '#c9d6ee';
    const hullDark = opt.hullDark || '#4a5878';
    const accent = opt.accent || '#6ff2dc';
    const flameCol = opt.flame || '#9df5ff';
    const alpha = opt.alpha === undefined ? 1 : opt.alpha;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;

    /* ---- engine plume (behind hull) ---- */
    if (throttle > 0.01) {
      const len = (0.55 + throttle * 1.5) * (0.85 + Math.random() * 0.3) * s;
      const wid = 0.20 * s;
      for (const oy of [-0.42, 0.42]) {
        const g = ctx.createLinearGradient(-0.78 * s, 0, -0.78 * s - len, 0);
        g.addColorStop(0, U.rgba('#ffffff', 0.95 * throttle));
        g.addColorStop(0.22, U.rgba(flameCol, 0.8 * throttle));
        g.addColorStop(0.65, U.rgba('#2f7dff', 0.35 * throttle));
        g.addColorStop(1, U.rgba('#2f7dff', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-0.78 * s, oy * s - wid * 0.5);
        ctx.quadraticCurveTo(-0.78 * s - len * 0.55, oy * s, -0.78 * s - len, oy * s);
        ctx.quadraticCurveTo(-0.78 * s - len * 0.55, oy * s, -0.78 * s, oy * s + wid * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    /* ---- hull ---- */
    ctx.beginPath();
    ctx.moveTo(1.15 * s, 0);
    ctx.lineTo(0.55 * s, -0.17 * s);
    ctx.lineTo(0.16 * s, -0.50 * s);
    ctx.lineTo(-0.34 * s, -0.94 * s);
    ctx.lineTo(-0.63 * s, -0.86 * s);
    ctx.lineTo(-0.50 * s, -0.30 * s);
    ctx.lineTo(-0.80 * s, -0.26 * s);
    ctx.lineTo(-0.80 * s, 0.26 * s);
    ctx.lineTo(-0.50 * s, 0.30 * s);
    ctx.lineTo(-0.63 * s, 0.86 * s);
    ctx.lineTo(-0.34 * s, 0.94 * s);
    ctx.lineTo(0.16 * s, 0.50 * s);
    ctx.lineTo(0.55 * s, 0.17 * s);
    ctx.closePath();
    const hg = ctx.createLinearGradient(0, -s, 0, s);
    hg.addColorStop(0, U.shade(hull, 0.22));
    hg.addColorStop(0.45, hull);
    hg.addColorStop(1, U.shade(hull, -0.42));
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = U.rgba('#0a0d18', 0.75);
    ctx.lineWidth = Math.max(0.6, s * 0.035);
    ctx.stroke();

    /* wing panels */
    ctx.fillStyle = U.rgba(hullDark, 0.85);
    for (const oy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0.14 * s, oy * 0.44 * s);
      ctx.lineTo(-0.32 * s, oy * 0.90 * s);
      ctx.lineTo(-0.56 * s, oy * 0.84 * s);
      ctx.lineTo(-0.46 * s, oy * 0.36 * s);
      ctx.closePath();
      ctx.fill();
    }

    /* spine accent */
    ctx.strokeStyle = U.rgba(accent, 0.85);
    ctx.lineWidth = Math.max(0.8, s * 0.055);
    ctx.beginPath();
    ctx.moveTo(0.9 * s, 0);
    ctx.lineTo(-0.62 * s, 0);
    ctx.stroke();

    /* cockpit */
    const cg = ctx.createRadialGradient(0.46 * s, 0, 0, 0.46 * s, 0, 0.3 * s);
    cg.addColorStop(0, U.rgba('#dff7ff', 0.95));
    cg.addColorStop(0.5, U.rgba(accent, 0.72));
    cg.addColorStop(1, U.rgba('#123a4a', 0.5));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0.46 * s, 0, 0.30 * s, 0.15 * s, 0, 0, U.TAU);
    ctx.fill();

    /* engine pods */
    for (const oy of [-0.42, 0.42]) {
      ctx.fillStyle = U.shade(hull, -0.55);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-0.92 * s, (oy - 0.10) * s, 0.42 * s, 0.20 * s, 0.05 * s)
                    : ctx.rect(-0.92 * s, (oy - 0.10) * s, 0.42 * s, 0.20 * s);
      ctx.fill();
      ctx.fillStyle = U.rgba(flameCol, 0.6 + throttle * 0.4);
      ctx.beginPath();
      ctx.ellipse(-0.92 * s, oy * s, 0.05 * s, 0.075 * s, 0, 0, U.TAU);
      ctx.fill();
    }

    /* nav lights */
    const blink = (Math.sin(performance.now() / 420) + 1) * 0.5;
    ctx.fillStyle = U.rgba('#ff5470', 0.5 + blink * 0.5);
    ctx.beginPath(); ctx.arc(-0.34 * s, -0.94 * s, s * 0.055, 0, U.TAU); ctx.fill();
    ctx.fillStyle = U.rgba('#63e6a8', 0.5 + (1 - blink) * 0.5);
    ctx.beginPath(); ctx.arc(-0.34 * s, 0.94 * s, s * 0.055, 0, U.TAU); ctx.fill();

    ctx.restore();
  };

  /* ---------------------------------------------------------
     astronaut — side view, facing +x
     --------------------------------------------------------- */
  G.drawAstronaut = function (ctx, x, y, scale, phase, opt = {}) {
    const s = scale;
    const dir = opt.dir || 1;
    const suit = opt.suit || '#e8eef8';
    const suitDark = opt.suitDark || '#9aa8c4';
    const accent = opt.accent || '#6ff2dc';
    const jet = opt.jet || 0;
    const moving = opt.moving || 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);

    const swing = Math.sin(phase) * 0.62 * moving;
    const bodyBob = Math.abs(Math.sin(phase)) * 0.05 * moving;

    ctx.translate(0, -bodyBob * s);

    /* jetpack flame */
    if (jet > 0.02) {
      const len = (0.5 + jet * 1.3) * s * (0.85 + Math.random() * 0.3);
      const g = ctx.createLinearGradient(-0.18 * s, -1.05 * s, -0.18 * s - len, -1.05 * s);
      g.addColorStop(0, U.rgba('#ffffff', 0.95 * jet));
      g.addColorStop(0.3, U.rgba('#9df5ff', 0.7 * jet));
      g.addColorStop(1, U.rgba('#2f7dff', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-0.10 * s, -1.22 * s);
      ctx.quadraticCurveTo(-0.16 * s - len * 0.6, -1.05 * s, -0.22 * s - len, -0.96 * s);
      ctx.quadraticCurveTo(-0.16 * s - len * 0.6, -1.05 * s, -0.10 * s, -0.88 * s);
      ctx.closePath();
      ctx.fill();
    }

    /* legs */
    ctx.strokeStyle = suit;
    ctx.lineWidth = 0.13 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.02 * s, -0.62 * s);
    ctx.lineTo(swing * 0.26 * s, -0.30 * s);
    ctx.lineTo(swing * 0.40 * s, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.02 * s, -0.62 * s);
    ctx.lineTo(-swing * 0.24 * s, -0.30 * s);
    ctx.lineTo(-swing * 0.38 * s, 0);
    ctx.stroke();
    /* boots */
    ctx.fillStyle = suitDark;
    ctx.beginPath(); ctx.ellipse(swing * 0.40 * s + 0.05 * s, -0.02 * s, 0.13 * s, 0.06 * s, 0, 0, U.TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-swing * 0.38 * s + 0.05 * s, -0.02 * s, 0.13 * s, 0.06 * s, 0, 0, U.TAU); ctx.fill();

    /* backpack */
    ctx.fillStyle = suitDark;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-0.30 * s, -1.30 * s, 0.24 * s, 0.62 * s, 0.07 * s)
                  : ctx.rect(-0.30 * s, -1.30 * s, 0.24 * s, 0.62 * s);
    ctx.fill();
    ctx.fillStyle = U.rgba(accent, 0.9);
    ctx.fillRect(-0.26 * s, -1.18 * s, 0.16 * s, 0.05 * s);

    /* torso */
    const tg = ctx.createLinearGradient(-0.16 * s, 0, 0.2 * s, 0);
    tg.addColorStop(0, U.shade(suit, -0.2));
    tg.addColorStop(1, suit);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-0.16 * s, -1.22 * s, 0.40 * s, 0.62 * s, 0.12 * s)
                  : ctx.rect(-0.16 * s, -1.22 * s, 0.40 * s, 0.62 * s);
    ctx.fill();
    /* chest light */
    ctx.fillStyle = U.rgba(accent, 0.95);
    ctx.fillRect(0.02 * s, -1.06 * s, 0.11 * s, 0.11 * s);

    /* arm */
    ctx.strokeStyle = suit;
    ctx.lineWidth = 0.11 * s;
    ctx.beginPath();
    ctx.moveTo(0.06 * s, -1.12 * s);
    ctx.lineTo(0.22 * s + swing * 0.18 * s, -0.84 * s);
    ctx.stroke();

    /* helmet */
    const hg = ctx.createRadialGradient(0.02 * s, -1.48 * s, 0.02 * s, 0.04 * s, -1.44 * s, 0.30 * s);
    hg.addColorStop(0, '#ffffff');
    hg.addColorStop(0.6, suit);
    hg.addColorStop(1, U.shade(suit, -0.28));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(0.04 * s, -1.46 * s, 0.26 * s, 0, U.TAU);
    ctx.fill();
    /* visor */
    const vg = ctx.createLinearGradient(0.10 * s, -1.56 * s, 0.28 * s, -1.36 * s);
    vg.addColorStop(0, U.rgba('#0d2030', 0.95));
    vg.addColorStop(0.55, U.rgba(accent, 0.85));
    vg.addColorStop(1, U.rgba('#c9fff4', 0.6));
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.ellipse(0.15 * s, -1.46 * s, 0.14 * s, 0.15 * s, -0.2, 0, U.TAU);
    ctx.fill();
    ctx.strokeStyle = U.rgba('#0a0d18', 0.5);
    ctx.lineWidth = 0.02 * s;
    ctx.stroke();

    /* helmet lamp */
    ctx.fillStyle = U.rgba('#fff6d0', 0.95);
    ctx.beginPath(); ctx.arc(0.24 * s, -1.60 * s, 0.045 * s, 0, U.TAU); ctx.fill();

    ctx.restore();
  };

  /* ---------------------------------------------------------
     starfield — layered, seeded
     --------------------------------------------------------- */
  G.makeStars = function (count, seed, sizeRange = [0.4, 1.7]) {
    const rng = U.mulberry32(seed);
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rng() * 4000 - 2000,
        y: rng() * 4000 - 2000,
        r: sizeRange[0] + rng() * (sizeRange[1] - sizeRange[0]),
        t: rng() * U.TAU,
        sp: 0.6 + rng() * 2.2,
        c: rng() < 0.14
          ? U.pick(['#ffd9a8', '#bcd8ff', '#ffc0d0', '#d8ffe8'])
          : '#ffffff',
      });
    }
    return stars;
  };

  G.drawStars = function (ctx, stars, camX, camY, zoom, w, h, time, alpha = 1, layer = 0) {
    const par = [0.06, 0.16, 0.32][layer] || 0.16;
    const ox = -camX * par * zoom, oy = -camY * par * zoom;
    const sw = 4000 * zoom, sh = 4000 * zoom;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      let x = (s.x * zoom + ox) % sw; if (x < 0) x += sw;
      let y = (s.y * zoom + oy) % sh; if (y < 0) y += sh;
      x -= (sw - w) * 0.5; y -= (sh - h) * 0.5;
      if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
      const tw = 0.62 + 0.38 * Math.sin(time * s.sp + s.t);
      const r = s.r * (0.85 + layer * 0.35) * (0.6 + tw * 0.5);
      ctx.fillStyle = s.c;
      ctx.globalAlpha = alpha * tw * (0.5 + layer * 0.22);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, U.TAU);
      ctx.fill();
      if (r > 1.25) {
        ctx.globalAlpha = alpha * tw * 0.22;
        ctx.fillRect(x - r * 3, y - 0.35, r * 6, 0.7);
        ctx.fillRect(x - 0.35, y - r * 3, 0.7, r * 6);
      }
    }
    ctx.globalAlpha = 1;
  };

  /* ---------------------------------------------------------
     nebula backdrop
     --------------------------------------------------------- */
  G.makeNebula = function (size, colors, seed) {
    const c = G.makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const rng = U.mulberry32(seed);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const x = rng() * size, y = rng() * size;
      const r = size * (0.08 + rng() * 0.26);
      const col = colors[i % colors.length];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, U.rgba(col, 0.16 + rng() * 0.16));
      g.addColorStop(0.5, U.rgba(col, 0.06));
      g.addColorStop(1, U.rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.fill();
    }
    /* dust lanes */
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 16; i++) {
      const x = rng() * size, y = rng() * size;
      const r = size * (0.05 + rng() * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.30)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.fill();
    }
    return c;
  };
})();
