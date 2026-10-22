/* ============================================================
   galaxy.js — galaxy map overlay
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const U = SB.utils;

  const Gx = (SB.galaxy = {
    canvas: null,
    ctx: null,
    open: false,
    hover: null,
    selected: null,
    time: 0,
    dpr: 1,
    w: 0, h: 0,
    _stars: null,
  });

  Gx.init = function () {
    Gx.canvas = document.getElementById('galaxyCanvas');
    Gx.ctx = Gx.canvas.getContext('2d');
    Gx._stars = SB.gfx.makeStars(420, 6060, [0.4, 1.5]);

    Gx.canvas.addEventListener('mousemove', (e) => {
      const r = Gx.canvas.getBoundingClientRect();
      Gx.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    Gx.canvas.addEventListener('mouseleave', () => { Gx.mouse = null; });
    Gx.canvas.addEventListener('click', () => {
      const hit = Gx.pick(Gx.mouse);
      if (!hit) return;
      if (Gx.selected && Gx.selected.id === hit.id) {
        Gx.travel(hit);
      } else {
        Gx.selected = hit;
        SB.audio.sfx.ui();
      }
    });
  };

  Gx.show = function () {
    const sys = SB.state.system();
    if (!sys) return;
    Gx.open = true;
    Gx.selected = sys;
    Gx.hover = null;
    document.getElementById('galaxyScreen').classList.remove('hidden');
    Gx.resize();
    SB.ui.updateGalaxyStatus();
    if (SB.main) SB.main.setMode('galaxy');
  };

  Gx.hide = function () {
    if (!Gx.open) return;
    Gx.open = false;
    document.getElementById('galaxyScreen').classList.add('hidden');
    if (SB.main && SB.main.mode === 'galaxy') SB.main.setMode('space');
  };

  Gx.resize = function () {
    const c = Gx.canvas;
    const r = c.getBoundingClientRect();
    Gx.dpr = Math.min(window.devicePixelRatio || 1, 2);
    Gx.w = r.width; Gx.h = r.height;
    c.width = Math.max(1, Math.floor(r.width * Gx.dpr));
    c.height = Math.max(1, Math.floor(r.height * Gx.dpr));
  };

  /* screen position of a system */
  Gx.pos = function (sys) {
    const pad = Math.min(Gx.w, Gx.h) * 0.19;
    const cx = Gx.w * 0.5, cy = Gx.h * 0.52;
    const spanX = (Gx.w - pad * 2), spanY = (Gx.h - pad * 2);
    return { x: cx + sys.x * spanX * 0.5, y: cy + sys.y * spanY * 0.5 };
  };

  Gx.pick = function (mouse) {
    if (!mouse) return null;
    let best = null, bd = 30 * 30;
    for (const s of SB.universe.SYSTEMS) {
      const p = Gx.pos(s);
      const d = (mouse.x - p.x) ** 2 + (mouse.y - p.y) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };

  Gx.travel = function (sys) {
    if (!sys) return;
    if (!SB.state.systemUnlocked(sys)) {
      SB.audio.sfx.deny();
      SB.ui.toast('Sistem terkunci — butuh ' + sys.coresNeeded + ' inti lompat (punya ' + SB.state.cores + ')', 'bad');
      return;
    }
    if (sys.id === SB.state.systemId) {
      SB.audio.sfx.deny();
      SB.ui.toast('Sudah berada di sistem ini', 'warn');
      return;
    }
    SB.audio.sfx.jump();
    SB.ui.toast('Melompat ke ' + sys.name + '…', 'good');
    Gx.hide();
    SB.space.enter(sys.id, false);
    SB.main.setMode('space');
    SB.ui.toast('Memasuki ' + sys.name + ' — ' + sys.subtitle, 'good');
    SB.state.log('Melompat ke sistem ' + sys.name + '.', 'sys');
  };

  Gx.update = function (dt) {
    if (!Gx.open) return;
    Gx.time += dt;
    Gx.hover = Gx.pick(Gx.mouse);

    const cur = SB.universe.getSystem(SB.state.systemId);
    if (Gx.selected && Gx.selected.id !== cur.id) {
      /* keep selection only if still valid */
    }

    if (SB.input.hit('escape') || SB.input.hit('m')) { Gx.hide(); SB.audio.sfx.uiBack(); }
    if (SB.input.hit('enter') && Gx.selected) Gx.travel(Gx.selected);
  };

  Gx.render = function () {
    if (!Gx.open || !Gx.ctx) return;
    const ctx = Gx.ctx;
    const w = Gx.w, h = Gx.h;
    ctx.setTransform(Gx.dpr, 0, 0, Gx.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    /* starfield */
    SB.gfx.drawStars(ctx, Gx._stars, Gx.time * 3, 0, 1, w, h, Gx.time, 0.5, 0);
    SB.gfx.drawStars(ctx, Gx._stars, -Gx.time * 2, 0, 1.5, w, h, Gx.time * 1.3, 0.35, 2);

    /* faint spiral arms */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(111,242,220,0.05)';
    ctx.lineWidth = 26;
    for (let arm = 0; arm < 2; arm++) {
      ctx.beginPath();
      for (let t = 0; t <= 1.001; t += 0.02) {
        const ang = t * 3.6 + arm * Math.PI;
        const rad = t * Math.min(w, h) * 0.52;
        const x = w / 2 + Math.cos(ang) * rad;
        const y = h / 2 + Math.sin(ang) * rad * 0.62;
        t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    /* connections */
    ctx.strokeStyle = 'rgba(120,150,200,0.16)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    const sysList = SB.universe.SYSTEMS;
    for (let i = 0; i < sysList.length - 1; i++) {
      const a = Gx.pos(sysList[i]), b = Gx.pos(sysList[i + 1]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    /* systems */
    const cur = SB.universe.getSystem(SB.state.systemId);
    for (const s of sysList) {
      const p = Gx.pos(s);
      const unlocked = SB.state.systemUnlocked(s);
      const isCur = s.id === cur.id;
      const isSel = Gx.selected && Gx.selected.id === s.id;
      const isHov = Gx.hover && Gx.hover.id === s.id;
      const r = 7 + (isCur ? 3 : 0);

      /* glow */
      const col = isCur ? '#ffb454' : unlocked ? '#6ff2dc' : '#4a5474';
      SB.gfx.glow(ctx, p.x, p.y, r * (isHov ? 7 : 5), col, isCur ? 0.5 : unlocked ? 0.34 : 0.12);

      /* core */
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, U.TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.42, 0, U.TAU); ctx.fill();

      /* selection / hover ring */
      if (isSel || isHov) {
        ctx.strokeStyle = isSel ? 'rgba(111,242,220,0.9)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 9, 0, U.TAU); ctx.stroke();
      }

      /* labels */
      ctx.textAlign = 'center';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = unlocked ? 'rgba(223,232,255,0.92)' : 'rgba(120,132,165,0.8)';
      ctx.fillText(s.name, p.x, p.y - r - 14);
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(140,155,190,0.8)';
      ctx.fillText(s.subtitle + '  ·  ' + s.planets.length + ' badan', p.x, p.y - r - 3);

      if (!unlocked) {
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(255,180,84,0.9)';
        ctx.fillText('TERKUNCI · BUTUH ' + s.coresNeeded + ' INTI', p.x, p.y + r + 16);
      } else if (isCur) {
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(255,180,84,0.95)';
        ctx.fillText('POSISI SEKARANG', p.x, p.y + r + 16);
      }
    }

    /* selection detail card */
    if (Gx.selected) {
      const s = Gx.selected;
      const unlocked = SB.state.systemUnlocked(s);
      const cw = Math.min(430, w - 40);
      const ch = 190;
      const cx = Math.min(Math.max(Gx.pos(s).x - cw / 2, 20), w - cw - 20);
      const cy = Math.min(Gx.pos(s).y + 40, h - ch - 70);

      ctx.fillStyle = 'rgba(7,10,20,0.88)';
      ctx.strokeStyle = 'rgba(111,242,220,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(cx, cy, cw, ch);
      ctx.fill(); ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#6ff2dc';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('SISTEM', cx + 16, cy + 22);
      ctx.fillStyle = '#eaf0ff';
      ctx.font = '600 17px ui-monospace, monospace';
      ctx.fillText(s.name + '  ·  ' + s.subtitle, cx + 16, cy + 44);

      ctx.fillStyle = 'rgba(150,165,200,0.9)';
      ctx.font = '11px ui-monospace, monospace';
      wrapText(ctx, s.desc, cx + 16, cy + 66, cw - 32, 15);

      /* planet list */
      let py = cy + 104;
      ctx.fillStyle = 'rgba(140,155,190,0.85)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('BADAN', cx + 16, py);
      py += 14;
      for (const pl of s.planets.slice(0, 5)) {
        ctx.fillStyle = pl.palette.ramp[1];
        ctx.beginPath(); ctx.arc(cx + 20, py - 3, 3.2, 0, U.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(200,214,240,0.9)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(pl.name + '  ' + pl.label + (pl.landable === false ? '  (tidak bisa didarat)' : ''), cx + 30, py);
        py += 14;
      }

      /* action */
      ctx.fillStyle = unlocked ? 'rgba(111,242,220,0.9)' : 'rgba(255,84,112,0.9)';
      ctx.font = '10px ui-monospace, monospace';
      const act = !unlocked ? 'TERKUNCI — BUTUH ' + s.coresNeeded + ' INTI LOMPAT'
        : s.id === SB.state.systemId ? 'ANDA SEDANG DI SINI'
        : 'KLIK LAGI ATAU [ENTER] UNTUK MELOMPAT';
      ctx.fillText(act, cx + 16, cy + ch - 14);
    }
  };

  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', yy = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = word; yy += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }
})();
