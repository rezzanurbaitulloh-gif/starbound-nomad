/* ============================================================
   input.js — keyboard, mouse, touch, gamepad-lite
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  const Input = (SB.input = {
    keys: new Set(),
    pressed: new Set(),   // edge-triggered, cleared every frame
    released: new Set(),
    mouse: { x: 0, y: 0, down: false, clicked: false, wheel: 0 },
    touch: { active: false, x: 0, y: 0 },
    anyInput: false,
    _canvas: null,
  });

  const CODE_MAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    Space: 'space', ShiftLeft: 'shift', ShiftRight: 'shift',
    KeyE: 'e', KeyF: 'f', KeyR: 'r', KeyM: 'm', KeyJ: 'j',
    Enter: 'enter', Escape: 'escape', Tab: 'tab',
    Digit1: '1', Digit2: '2', Digit3: '3',
    KeyC: 'c', KeyH: 'h', KeyQ: 'q', KeyX: 'x',
  };

  const PREVENT = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Slash',
  ]);

  Input.attach = function (canvas) {
    this._canvas = canvas;

    window.addEventListener('keydown', (e) => {
      const k = CODE_MAP[e.code];
      if (k) {
        if (PREVENT.has(e.code)) e.preventDefault();
        if (!e.repeat) {
          this.pressed.add(k);
          this.anyInput = true;
        }
        this.keys.add(k);
      }
      // raw letter keys for menus
      const raw = (e.key || '').toLowerCase();
      if (raw.length === 1) {
        if (!e.repeat) this.pressed.add(raw);
        this.keys.add(raw);
      }
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      const k = CODE_MAP[e.code];
      if (k) { this.keys.delete(k); this.released.add(k); }
      const raw = (e.key || '').toLowerCase();
      if (raw.length === 1) { this.keys.delete(raw); this.released.add(raw); }
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });

    const setMouse = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    };
    canvas.addEventListener('mousemove', setMouse);
    canvas.addEventListener('mousedown', (e) => {
      setMouse(e); this.mouse.down = true; this.mouse.clicked = true; this.anyInput = true;
    });
    canvas.addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    /* touch — treat as "tap to confirm", plus virtual stick on left half */
    canvas.addEventListener('touchstart', (e) => {
      this.touch.active = true;
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      this.touch.x = t.clientX - r.left;
      this.touch.y = t.clientY - r.top;
      this.mouse.x = this.touch.x; this.mouse.y = this.touch.y;
      this.mouse.clicked = true; this.anyInput = true;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      this.touch.x = t.clientX - r.left;
      this.touch.y = t.clientY - r.top;
      this.mouse.x = this.touch.x; this.mouse.y = this.touch.y;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { this.touch.active = false; this.mouse.down = false; }, { passive: false });
  };

  Input.down = (k) => this.keys.has(k);
  Input.hit = (k) => this.pressed.has(k);
  Input.up = (k) => this.released.has(k);

  /* combined axis helpers */
  Input.axis = () => {
    let x = 0, y = 0;
    if (this.down('left') || this.down('a')) x -= 1;
    if (this.down('right') || this.down('d')) x += 1;
    if (this.down('up') || this.down('w')) y -= 1;
    if (this.down('down') || this.down('s')) y += 1;
    return { x, y };
  };

  Input.endFrame = function () {
    this.pressed.clear();
    this.released.clear();
    this.mouse.clicked = false;
    this.mouse.wheel = 0;
    this.anyInput = false;
  };
})();
