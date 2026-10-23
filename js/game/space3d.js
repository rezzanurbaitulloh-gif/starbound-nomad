/* ============================================================
   space3d.js — WebGL chase-camera view for orbital flight
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  if (!window.THREE) {
    console.warn('[space3d] THREE missing, 2D renderer stays active');
    return;
  }
  const U = SB.utils;
  const S = SB.state;
  const V3 = THREE.Vector3;
  const TAU = Math.PI * 2;

  const Space3D = (SB.space3d = {
    ready: false,
    canvas: null,
    sysId: null,
    _time: 0,
    _last: 0,
    _roll: 0,
    _fov: 66,
    _built: false,
    _planetsRef: null,
  });

  let renderer = null;
  let scene = null;
  let camera = null;
  let root = null;
  let shipYaw = null;
  let shipTilt = null;
  let starGlow = null;
  let targetRing = null;
  let navLine = null;
  let dust = null;
  let particleSys = null;
  let planetNodes = [];
  let asteroidNodes = [];
  let engineSprites = [];
  let _glowTex = null;
  let _ringTex = null;
  let _dustPos = null;

  const tmpA = new V3();
  const tmpB = new V3();
  const tmpC = new V3();
  const tmpCol = new THREE.Color();

  function glowTexture() {
    if (_glowTex) return _glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,.9)');
    g.addColorStop(0.45, 'rgba(255,255,255,.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    _glowTex = new THREE.CanvasTexture(c);
    _glowTex.encoding = THREE.sRGBEncoding;
    return _glowTex;
  }

  function ringTexture() {
    if (_ringTex) return _ringTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.strokeStyle = 'rgba(111,242,220,.95)';
    x.lineWidth = 5;
    x.setLineDash([16, 12]);
    x.beginPath();
    x.arc(128, 128, 108, 0, TAU);
    x.stroke();
    x.setLineDash([]);
    x.strokeStyle = 'rgba(111,242,220,.28)';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(128, 128, 98, 0, TAU);
    x.stroke();
    _ringTex = new THREE.CanvasTexture(c);
    _ringTex.encoding = THREE.sRGBEncoding;
    return _ringTex;
  }

  function labelTexture(name, color) {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 74;
    const x = c.getContext('2d');
    x.font = '600 26px ui-monospace, Menlo, Consolas, monospace';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.shadowColor = color;
    x.shadowBlur = 14;
    x.fillStyle = color;
    x.fillText(name, 160, 30);
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(180,200,235,.7)';
    x.fillRect(110, 56, 100, 2);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function eqTexture(eq) {
    const c = document.createElement('canvas');
    c.width = eq.w;
    c.height = eq.h;
    const x = c.getContext('2d');
    const img = x.createImageData(eq.w, eq.h);
    img.data.set(eq.data);
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  function makeShip() {
    shipYaw = new THREE.Group();
    shipTilt = new THREE.Group();
    shipYaw.add(shipTilt);
    scene.add(shipYaw);

    const hull = new THREE.MeshStandardMaterial({
      color: 0x7189ad, metalness: 0.9, roughness: 0.34,
      emissive: 0x061018, emissiveIntensity: 0.7,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0e141f, metalness: 0.55, roughness: 0.55 });
    const nozzle = new THREE.MeshStandardMaterial({
      color: 0x0a2530, metalness: 0.35, roughness: 0.3,
      emissive: 0x1aa9c4, emissiveIntensity: 1.25,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: 0x6ff2dc, metalness: 0.4, roughness: 0.24,
      emissive: 0x1fae9c, emissiveIntensity: 1.1,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x66e6ff, metalness: 0.15, roughness: 0.06,
      clearcoat: 1, emissive: 0x0b5a70, emissiveIntensity: 1.1,
    });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.95, 7.4, 16, 1, true), hull);
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.4;
    shipTilt.add(body);

    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 2.55, 12), dark);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, -0.05, -2.0);
    shipTilt.add(spine);

    const tailCap = new THREE.Mesh(new THREE.CircleGeometry(0.94, 24), dark);
    tailCap.rotation.y = Math.PI;
    tailCap.position.set(0, -0.02, -3.315);
    shipTilt.add(tailCap);

    const rearRing = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.05, 8, 28), trim);
    rearRing.position.set(0, -0.02, -3.33);
    shipTilt.add(rearRing);

    const coreNozzle = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), nozzle);
    coreNozzle.position.set(0, -0.02, -3.34);
    coreNozzle.rotation.y = Math.PI;
    shipTilt.add(coreNozzle);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.15), hull);
    fin.position.set(0, 0.88, -2.35);
    fin.rotation.x = -0.18;
    shipTilt.add(fin);

    for (const d of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.95), hull);
      tail.position.set(d * 1.45, 0.48, -2.5);
      tail.rotation.z = d * 0.26;
      shipTilt.add(tail);
      const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.8), trim);
      tailTip.position.set(d * 1.52, 0.72, -2.52);
      shipTilt.add(tailTip);
    }

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.72, 22, 16), glass);
    cockpit.scale.set(1, 0.72, 2.1);
    cockpit.position.set(0, 0.46, 0.2);
    shipTilt.add(cockpit);

    for (const d of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.55), hull);
      wing.position.set(d * 2.1, -0.02, -1.35);
      wing.rotation.y = d * 0.42;
      wing.rotation.z = d * 0.06;
      shipTilt.add(wing);

      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 1.6), trim);
      tip.position.set(d * 3.75, 0.06, -1.18);
      shipTilt.add(tip);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 2.8), trim);
      rail.position.set(d * 1.05, 0.18, 0.15);
      shipTilt.add(rail);

      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 1.1, 12), dark);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(d * 1.35, -0.12, -3.2);
      shipTilt.add(engine);

      const podCap = new THREE.Mesh(new THREE.CircleGeometry(0.46, 18), dark);
      podCap.position.set(d * 1.35, -0.12, -3.755);
      podCap.rotation.y = Math.PI;
      shipTilt.add(podCap);

      const podNozzle = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), nozzle);
      podNozzle.position.set(d * 1.35, -0.12, -3.77);
      podNozzle.rotation.y = Math.PI;
      shipTilt.add(podNozzle);

      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0x9df5ff, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95,
      }));
      flame.position.set(d * 1.35, -0.12, -4.3);
      flame.scale.set(1.6, 1.6, 1);
      shipTilt.add(flame);
      engineSprites.push(flame);
    }
  }

  function buildStarfield(sys) {
    const rng = U.mulberry32(sys.id.length * 7919 + 13);
    const n = 3600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1;
      const th = rng() * TAU;
      const r = 14000 + rng() * 18000;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(th) * s * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = Math.sin(th) * s * r;
      const tint = rng();
      let cr = 1, cg = 1, cb = 1;
      if (tint < 0.1) { cr = 0.72; cg = 0.84; cb = 1; }
      else if (tint < 0.18) { cr = 1; cg = 0.86; cb = 0.66; }
      else if (tint < 0.24) { cr = 1; cg = 0.74; cb = 0.82; }
      const b = 0.45 + rng() * 0.55;
      col[i * 3] = cr * b;
      col[i * 3 + 1] = cg * b;
      col[i * 3 + 2] = cb * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.9, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0.95, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    root.add(pts);
  }

  function buildNebula(sys) {
    if (!sys.nebulaCanvas) return;
    const tex = new THREE.CanvasTexture(sys.nebulaCanvas);
    tex.encoding = THREE.sRGBEncoding;
    const rng = U.mulberry32(sys.id.length * 313 + 77);
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0xffffff, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
      }));
      const a = rng() * TAU;
      const y = (rng() - 0.5) * 9000;
      const r = 18000 + rng() * 9000;
      sp.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      const s = 13000 + rng() * 8000;
      sp.scale.set(s, s, 1);
      root.add(sp);
    }
  }

  function disposeNode(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map && m.map !== _glowTex && m.map !== _ringTex) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  function buildSystem() {
    const sys = SB.space.sys;
    if (!sys) return;
    if (root) {
      scene.remove(root);
      disposeNode(root);
      root = null;
    }
    root = new THREE.Group();
    scene.add(root);
    planetNodes = [];
    asteroidNodes = [];
    Space3D.sysId = sys.id;
    Space3D._planetsRef = SB.space.planets;

    const starCol = new THREE.Color(sys.star.color);
    const starR = sys.star.size * 0.55;
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(1, 40, 28),
      new THREE.MeshBasicMaterial({ color: starCol, fog: false })
    );
    sun.scale.setScalar(starR);
    root.add(sun);

    starGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: starCol, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
    }));
    starGlow.scale.setScalar(starR * 8.5);
    root.add(starGlow);

    const light = new THREE.PointLight(starCol, 1.18, 0, 1);
    root.add(light);

    buildStarfield(sys);
    buildNebula(sys);

    for (const p of SB.space.planets) {
      const orbitPts = [];
      for (let i = 0; i < 180; i++) {
        const a = (i / 180) * TAU;
        orbitPts.push(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit * 0.42);
      }
      const og = new THREE.BufferGeometry();
      og.setAttribute('position', new THREE.Float32BufferAttribute(orbitPts, 3));
      const orbit = new THREE.LineLoop(og, new THREE.LineBasicMaterial({
        color: 0x5f7bb0, transparent: true, opacity: 0.085, depthWrite: false,
      }));
      root.add(orbit);

      const eq = p.def._eq || SB.gfx.buildEquirect(p.def);
      p.def._eq = eq;
      const tex = eqTexture(eq);
      tex.encoding = THREE.LinearEncoding;
      const ramp = p.def.palette.ramp;
      const atmo = new THREE.Color(ramp[2]);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: tex },
          uLightDir: { value: new V3(-p.x, p.r * 3.2, -p.y).normalize() },
          uAtmo: { value: atmo },
        },
        vertexShader: [
          'varying vec2 vUv;',
          'varying vec3 vN;',
          'varying vec3 vW;',
          'void main(){',
          '  vUv = uv;',
          '  vN = normalize(mat3(modelMatrix) * normal);',
          '  vec4 wp = modelMatrix * vec4(position,1.0);',
          '  vW = wp.xyz;',
          '  gl_Position = projectionMatrix * viewMatrix * wp;',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform sampler2D uMap;',
          'uniform vec3 uLightDir;',
          'uniform vec3 uAtmo;',
          'varying vec2 vUv;',
          'varying vec3 vN;',
          'varying vec3 vW;',
          'float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
          'float vnoise(vec2 p){',
          '  vec2 i=floor(p), f=fract(p);',
          '  f=f*f*(3.0-2.0*f);',
          '  return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),',
          '             mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y);',
          '}',
          'float fbm2(vec2 p){',
          '  float v=0.0, a=0.5;',
          '  for(int i=0;i<4;i++){ v += a*vnoise(p); p*=2.07; a*=0.5; }',
          '  return v;',
          '}',
          'void main(){',
          '  vec3 N = normalize(vN);',
          '  vec3 V = normalize(cameraPosition - vW);',
          '  vec3 L = normalize(uLightDir);',
          '  float ndl = dot(N, L);',
          '  float day = smoothstep(-0.50, 0.45, ndl);',
          '  float limb = pow(clamp(dot(N, V), 0.0, 1.0), 0.48);',
          '  vec3 t = pow(texture2D(uMap, vUv).rgb, vec3(2.2));',
          '  t = clamp((t - 0.5) * 1.38 + 0.5, 0.0, 1.0);',
          '  float n = fbm2(vUv * vec2(22.0, 11.0) + 9.0);',
          '  t *= 0.82 + n * 0.36;',
          '  vec3 col = t * (0.16 + 1.35 * day) * (0.62 + 0.38 * limb);',
          '  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);',
          '  col += uAtmo * fres * 0.85;',
          '  gl_FragColor = vec4(col, 1.0);',
          '  #include <tonemapping_fragment>',
          '  #include <encodings_fragment>',
          '}',
        ].join('\n'),
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
      mesh.scale.setScalar(p.r);
      mesh.position.set(p.x, 0, p.y);
      mesh.rotation.z = (p.def.tilt || 0) * 0.6;
      root.add(mesh);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: new THREE.Color(ramp[2]),
        transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.27,
      }));
      glow.scale.setScalar(p.r * 3.1);
      glow.position.copy(mesh.position);
      root.add(glow);

      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: labelTexture(p.def.name, p.def.palette.ramp[2]),
        transparent: true, depthWrite: false, opacity: 0.9,
      }));
      label.renderOrder = 8;
      root.add(label);

      planetNodes.push({ p, mesh, glow, label, mat });
    }

    const rockMats = [];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a6c62, roughness: 0.96, metalness: 0.08, flatShading: true });
    rockMats.push(rockMat);
    const rockGeos = [];
    for (let sd = 0; sd < 3; sd++) {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const k = 0.78 + 0.4 * Math.abs(Math.sin(x * 3.1 + y * 5.7 + z * 7.3 + sd * 9));
        pos.setXYZ(i, x * k, y * k, z * k);
      }
      g.computeVertexNormals();
      rockGeos.push(g);
    }
    for (const a of SB.space.asteroids) {
      const mesh = new THREE.Mesh(rockGeos[(a.shape[0] * 7 | 0) % 3], rockMat);
      mesh.scale.setScalar(a.r);
      mesh.position.set(a.x, 0, a.y);
      root.add(mesh);
      asteroidNodes.push({ a, mesh });
    }

    Space3D._built = true;
  }

  Space3D.init = function (canvas) {
    if (renderer || !window.THREE) return;
    Space3D.canvas = canvas;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas, antialias: true, alpha: false,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      console.warn('[space3d] WebGL init failed', e);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x02030a, 1);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(66, 1, 2, 80000);
    scene.add(camera);

    const camLight = new THREE.PointLight(0xdfeaff, 0.55, 300, 1.4);
    camLight.position.set(0, 8, 10);
    camera.add(camLight);
    scene.add(new THREE.AmbientLight(0x36476b, 0.42));
    scene.add(new THREE.HemisphereLight(0x4a5f8a, 0x070810, 0.22));

    makeShip();

    const n = 520;
    _dustPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      _dustPos[i * 3] = (Math.random() - 0.5) * 1500;
      _dustPos[i * 3 + 1] = (Math.random() - 0.5) * 400;
      _dustPos[i * 3 + 2] = (Math.random() - 0.5) * 1500;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(_dustPos, 3));
    dust = new THREE.Points(dg, new THREE.PointsMaterial({
      map: glowTexture(), color: 0x9fdcff, size: 2.4, sizeAttenuation: true,
      transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    dust.frustumCulled = false;
    scene.add(dust);

    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(420 * 3), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(420 * 3), 3));
    pg.setDrawRange(0, 0);
    particleSys = new THREE.Points(pg, new THREE.PointsMaterial({
      map: glowTexture(), size: 3.6, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    particleSys.frustumCulled = false;
    scene.add(particleSys);

    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    navLine = new THREE.Line(ng, new THREE.LineBasicMaterial({
      color: 0x6ff2dc, transparent: true, opacity: 0.22, depthWrite: false,
    }));
    navLine.frustumCulled = false;
    scene.add(navLine);

    targetRing = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringTexture(), color: 0xffffff, transparent: true,
      opacity: 0.75, depthWrite: false, depthTest: true,
    }));
    targetRing.visible = false;
    scene.add(targetRing);

    Space3D.ready = true;
  };

  Space3D.resize = function (w, h, dpr) {
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(dpr || window.devicePixelRatio || 1, 1.6));
    renderer.setSize(w, h, false);
    camera.aspect = Math.max(0.1, w / Math.max(1, h));
    camera.updateProjectionMatrix();
  };



  Space3D.setActive = function (active) {
    if (!Space3D.canvas) return;
    Space3D.canvas.classList.toggle('active', !!active && Space3D.ready);
  };

  function updateCompass() {
    const arrow = document.getElementById('ncArrow');
    const label = document.getElementById('ncLabel');
    if (!arrow || !label) return;
    const near = SB.space.nearestPlanet();
    if (!near || !near.planet) {
      label.textContent = 'TIDAK ADA TARGET';
      return;
    }
    const sh = S.ship;
    const dx = near.planet.x - sh.x;
    const dy = near.planet.y - sh.y;
    const fx = Math.cos(sh.angle), fy = Math.sin(sh.angle);
    const rel = Math.atan2(fx * dy - fy * dx, fx * dx + fy * dy);
    arrow.style.transform = 'rotate(' + (rel * 180 / Math.PI).toFixed(1) + 'deg)';
    label.textContent = near.planet.def.name + ' · ' + U.formatNum(near.dist) + ' u';
  }

  Space3D.render = function (dt) {
    if (!Space3D.ready || !SB.space || !SB.space.sys) return;
    if (!Space3D._built || Space3D.sysId !== SB.space.sys.id || Space3D._planetsRef !== SB.space.planets) buildSystem();

    const now = performance.now();
    if (!dt) dt = Math.min(0.05, (now - Space3D._last) / 1000);
    Space3D._last = now;
    Space3D._time += dt;
    const t = Space3D._time;

    const sh = S.ship;
    const fwd = tmpA.set(Math.cos(sh.angle), 0, Math.sin(sh.angle));
    const yaw = Math.atan2(fwd.x, fwd.z);
    const speed = Math.hypot(sh.vx, sh.vy);

    shipYaw.position.set(sh.x, 0, sh.y);
    shipYaw.rotation.y = yaw;

    const turn = (SB.input.down('right') || SB.input.down('d') ? 1 : 0) -
      (SB.input.down('left') || SB.input.down('a') ? 1 : 0);
    const rollTarget = -turn * 0.52;
    Space3D._roll += (rollTarget - Space3D._roll) * (1 - Math.exp(-dt * 6));
    shipTilt.rotation.z = Space3D._roll;
    shipTilt.rotation.x = Math.sin(t * 1.4) * 0.012 + sh.throttle * 0.018;

    const pulse = 0.75 + Math.sin(t * 42) * 0.22;
    for (const f of engineSprites) {
      const on = sh.throttle > 0.03 || speed > 20;
      f.visible = on;
      const s = (sh.boost ? 3.0 : 1.55) * pulse;
      f.scale.set(s, s, 1);
      f.material.color.set(sh.boost ? 0xffc070 : 0x6fe8ff);
    }

    const dist = 27 + Math.min(13, speed * 0.014);
    const height = 10.2 + Math.min(3.5, speed * 0.0035);
    tmpB.set(sh.x, 0, sh.y).addScaledVector(fwd, -dist);
    tmpB.x += fwd.z * 7.5;
    tmpB.z -= fwd.x * 7.5;
    tmpB.y = height;
    const shake = SB.space.cam.shake || 0;
    if (shake > 0.2) {
      tmpB.x += (Math.random() - 0.5) * shake * 0.5;
      tmpB.y += (Math.random() - 0.5) * shake * 0.35;
      tmpB.z += (Math.random() - 0.5) * shake * 0.5;
    }
    if (camera.position.lengthSq() === 0 || camera.position.distanceTo(tmpB) > 800) {
      camera.position.copy(tmpB);
    } else {
      camera.position.lerp(tmpB, 1 - Math.exp(-dt * 9));
    }
    tmpC.set(sh.x, 1.4, sh.y).addScaledVector(fwd, 34);
    camera.lookAt(tmpC);

    const targetFov = 64 + Math.min(10, (speed / 1150) * 10);
    Space3D._fov += (targetFov - Space3D._fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(camera.fov - Space3D._fov) > 0.02) {
      camera.fov = Space3D._fov;
      camera.updateProjectionMatrix();
    }

    for (const node of planetNodes) {
      const p = node.p;
      node.mesh.position.set(p.x, 0, p.y);
      node.mesh.rotation.y = -p.def.rotation;
      node.glow.position.copy(node.mesh.position);
      node.mat.uniforms.uLightDir.value.copy(camera.position).sub(node.mesh.position).normalize();
      node.mat.uniforms.uLightDir.value.y += 0.38;
      node.mat.uniforms.uLightDir.value.x += 0.18;
      node.mat.uniforms.uLightDir.value.normalize();
      const d = camera.position.distanceTo(node.mesh.position);
      const labelH = Math.max(8, 2 * d * Math.tan(camera.fov * Math.PI / 360) * 0.03);
      node.label.position.set(p.x, p.r + d * 0.022, p.y);
      node.label.scale.set(labelH * 4.3, labelH, 1);
      const camDir = camera.getWorldDirection(tmpC);
      const ahead = tmpB.copy(node.mesh.position).sub(camera.position).dot(camDir) > 0;
      const fade = U.clamp01((18000 - d) / 5000);
      node.label.visible = ahead && d < 22000;
      node.label.material.opacity = 0.9 * fade;
      node.glow.material.opacity = 0.12 + 0.16 * fade;
    }

    for (const node of asteroidNodes) {
      node.mesh.position.set(node.a.x, 0, node.a.y);
      node.mesh.rotation.y = node.a.rot;
      node.mesh.rotation.x = node.a.rot * 0.7;
    }

    const near = SB.space.nearestPlanet();
    if (near && near.planet) {
      const p = near.planet;
      const pos = navLine.geometry.attributes.position;
      pos.setXYZ(0, sh.x, 0.8, sh.y);
      pos.setXYZ(1, p.x, 0.8, p.y);
      pos.needsUpdate = true;
      navLine.visible = near.dist < 9000;
      navLine.material.opacity = near.dist < 3000 ? 0.18 : 0.09;
      targetRing.visible = near.dist < 2600;
      targetRing.position.set(p.x, 0, p.y);
      targetRing.scale.setScalar(p.r * 3.2);
      targetRing.material.opacity = 0.55 + Math.sin(t * 2.4) * 0.2;
    } else {
      navLine.visible = false;
      targetRing.visible = false;
    }

    const dpos = dust.geometry.attributes.position;
    const arr = dpos.array;
    for (let i = 0; i < arr.length; i += 3) {
      const dx = arr[i] - sh.x;
      const dz = arr[i + 2] - sh.y;
      if (dx * dx + dz * dz > 800 * 800) {
        arr[i] = sh.x + (Math.random() - 0.5) * 1400;
        arr[i + 1] = (Math.random() - 0.5) * 420;
        arr[i + 2] = sh.y + (Math.random() - 0.5) * 1400;
      }
    }
    dpos.needsUpdate = true;

    const parts = SB.space.particles;
    const ppos = particleSys.geometry.attributes.position;
    const pcol = particleSys.geometry.attributes.color;
    const count = Math.min(parts.length, 420);
    for (let i = 0; i < count; i++) {
      const q = parts[i];
      ppos.setXYZ(i, q.x, 0.5, q.y);
      tmpCol.set(q.col);
      pcol.setXYZ(i, tmpCol.r, tmpCol.g, tmpCol.b);
    }
    ppos.needsUpdate = true;
    pcol.needsUpdate = true;
    particleSys.geometry.setDrawRange(0, count);

    if (starGlow) {
      starGlow.material.opacity = 0.8 + Math.sin(t * 0.9) * 0.08;
    }

    updateCompass();
    renderer.render(scene, camera);
  };

})();
