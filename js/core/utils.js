/* ============================================================
   utils.js — math, easing, deterministic noise, color helpers
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  const U = (SB.utils = {});

  U.TAU = Math.PI * 2;

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  U.smoothstep = (t) => { t = U.clamp01(t); return t * t * (3 - 2 * t); };
  U.mix = (a, b, t) => a + (b - a) * U.clamp01(t);

  U.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  U.randInt = (a, b) => Math.floor(U.rand(a, b + 1));
  U.randSign = () => (Math.random() < 0.5 ? -1 : 1);
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* shortest-path angle interpolation */
  U.angleLerp = (a, b, t) => {
    let d = ((b - a + Math.PI) % U.TAU + U.TAU) % U.TAU - Math.PI;
    return a + d * t;
  };
  U.angleDiff = (a, b) => ((b - a + Math.PI) % U.TAU + U.TAU) % U.TAU - Math.PI;

  /* frame-rate independent approach toward target */
  U.approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.dist2 = (ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  };

  U.formatNum = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return Math.round(n).toString();
  };
  U.pct = (v) => Math.round(U.clamp01(v) * 100) + '%';
  U.pad = (n, len = 2) => String(Math.floor(n)).padStart(len, '0');

  /* ---------- deterministic hash + value noise ---------- */
  U.hash = (x, seed = 0) => {
    let h = Math.imul(x ^ seed, 0x27d4eb2d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967295;
  };
  U.hash2 = (x, y, seed = 0) => U.hash((x | 0) * 73856093 ^ (y | 0) * 19349663, seed);

  /* smooth 1-D value noise */
  U.noise1 = (x, seed = 0) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = U.hash(i, seed);
    const b = U.hash(i + 1, seed);
    return U.lerp(a, b, U.smoothstep(f));
  };

  /* fractal 1-D noise, returns 0..1 */
  U.fbm1 = (x, seed = 0, octaves = 4, lacunarity = 2, gain = 0.5) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += U.noise1(x * freq, seed + o * 131) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };

  /* 2-D value noise */
  U.noise2 = (x, y, seed = 0) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const a = U.hash2(ix, iy, seed);
    const b = U.hash2(ix + 1, iy, seed);
    const c = U.hash2(ix, iy + 1, seed);
    const d = U.hash2(ix + 1, iy + 1, seed);
    const u = U.smoothstep(fx), v = U.smoothstep(fy);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  };
  U.fbm2 = (x, y, seed = 0, octaves = 4) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += U.noise2(x * freq, y * freq, seed + o * 77) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };

  /* seeded PRNG (mulberry32) */
  U.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- color ---------- */
  U.hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  U.rgbToHex = (r, g, b) =>
    '#' + [r, g, b].map((v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  U.mixHex = (a, b, t) => {
    const A = U.hexToRgb(a), B = U.hexToRgb(b);
    return U.rgbToHex(U.lerp(A.r, B.r, t), U.lerp(A.g, B.g, t), U.lerp(A.b, B.b, t));
  };
  U.rgba = (hex, a) => {
    const c = U.hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  };
  U.shade = (hex, amt) => {
    const c = U.hexToRgb(hex);
    const f = amt >= 0 ? 255 : 0, t = Math.abs(amt);
    return U.rgbToHex(U.lerp(c.r, f, t), U.lerp(c.g, f, t), U.lerp(c.b, f, t));
  };
  U.luma = (hex) => {
    const c = U.hexToRgb(hex);
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  };
})();
