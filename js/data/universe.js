/* ============================================================
   universe.js — hand-authored systems, planets, resources
   ============================================================ */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});

  /* ---------------- resource catalogue ---------------- */
  const RESOURCES = {
    ferrite:  { id: 'ferrite',  name: 'FERRIT',      color: '#c3d0e2', value: 20 },
    auric:    { id: 'auric',    name: 'AURIC',      color: '#ffd166', value: 55 },
    cryo:     { id: 'cryo',     name: 'CRYO',       color: '#7fe3ff', value: 35 },
    silicon:  { id: 'silicon',  name: 'SILIKON',    color: '#ffe08a', value: 40 },
    xenolith: { id: 'xenolith', name: 'XENOLIT',    color: '#b98cff', value: 90 },
    bio:      { id: 'bio',      name: 'BIOCELL',    color: '#63e6a8', value: 60 },
    uranite:  { id: 'uranite',  name: 'URANIT',     color: '#a6ff5c', value: 120 },
    obsidian: { id: 'obsidian', name: 'OBSIDIAN',   color: '#9a9ab8', value: 70 },
    sulfur:   { id: 'sulfur',   name: 'SULFUR',     color: '#ffe05c', value: 45 },
    platinum: { id: 'platinum', name: 'PLATINA',    color: '#eaf6ff', value: 160 },
    core:     { id: 'core',     name: 'INTI LOMPAT', color: '#6ff2dc', value: 900 },
  };

  /* ---------------- planet archetypes ---------------- */
  const ARCH = {
    rock: {
      label: 'BATUAN',
      ramp: ['#6d5c49', '#93816c', '#4a3e33', '#241f1c'],
      surface: {
        skyDay: ['#2d4d7a', '#8fb0cc'], skyNight: ['#05070f', '#0d1626'],
        skyDusk: ['#2b2340', '#d07a4e'],
        ground: ['#7a6853', '#4a3c2e'], ridge: '#4d4457', far: '#5d5470',
        fog: '#9aa8c0', sun: '#fff4d6', ambient: '#93a6c6',
      },
    },
    ocean: {
      label: 'PERAIRAN',
      ramp: ['#2f6b3a', '#4f8a45', '#1a4a86', '#0d2c52'],
      surface: {
        skyDay: ['#1f5fa8', '#9fd0ee'], skyNight: ['#040810', '#0b1c33'],
        skyDusk: ['#221a44', '#f08a52'],
        ground: ['#3f7a4a', '#24482f'], ridge: '#2c4a58', far: '#3a5f6b',
        fog: '#a8c6d8', sun: '#fff8e2', ambient: '#8fb6cc',
      },
    },
    desert: {
      label: 'GURUNAH',
      ramp: ['#c08a4a', '#e6b877', '#8a5f34', '#4a3018'],
      surface: {
        skyDay: ['#3f6f9c', '#e5c48f'], skyNight: ['#070910', '#141b2a'],
        skyDusk: ['#3a1e33', '#f0a052'],
        ground: ['#c9a165', '#7a5a34'], ridge: '#8a6a48', far: '#9c8464',
        fog: '#dcc39a', sun: '#fff0c0', ambient: '#cbb490',
      },
    },
    ice: {
      label: 'ES',
      ramp: ['#dfeaf7', '#a9c7e6', '#f6fbff', '#7fa5c9'],
      surface: {
        skyDay: ['#2b5f8e', '#cfe6f7'], skyNight: ['#03060d', '#0a1424'],
        skyDusk: ['#241a3c', '#8fb6e0'],
        ground: ['#e6f1fb', '#a9c2d9'], ridge: '#8fa8c4', far: '#a8bfd4',
        fog: '#dcecf8', sun: '#ffffff', ambient: '#cfe2f2',
      },
    },
    lava: {
      label: 'MAGMA',
      ramp: ['#8a3a20', '#5c2a1c', '#ff7a32', '#ffb454'],
      surface: {
        skyDay: ['#3a1210', '#a33a1e'], skyNight: ['#0a0304', '#200808'],
        skyDusk: ['#4a120c', '#ff6a2a'],
        ground: ['#3a2620', '#1c1210'], ridge: '#5c2418', far: '#6b2a1a',
        fog: '#c4552a', sun: '#ffb060', ambient: '#c06a3a',
      },
    },
    gas: {
      label: 'RAGA MAU',
      ramp: ['#c9a86a', '#e8d3a0', '#a8794a', '#6b4a2f'],
      surface: {
        skyDay: ['#8a6a3a', '#e8d3a0'], skyNight: ['#140f08', '#2a2015'],
        skyDusk: ['#5a3a1a', '#f0b060'],
        ground: ['#d9c49a', '#8a7050'], ridge: '#b0996f', far: '#c0a97f',
        fog: '#e6d6b4', sun: '#fff8e0', ambient: '#dcc79e',
      },
    },
    toxic: {
      label: 'TOXIK',
      ramp: ['#6f9e3a', '#a8d95c', '#4a7a3a', '#2a4a28'],
      surface: {
        skyDay: ['#2a4a2a', '#9ec47a'], skyNight: ['#050a06', '#0d1a10'],
        skyDusk: ['#1e3320', '#a8d95c'],
        ground: ['#5a7a34', '#2f4420'], ridge: '#3f5a3a', far: '#4d6b44',
        fog: '#a8c88a', sun: '#e8ffcf', ambient: '#9ec47a',
      },
    },
    crystal: {
      label: 'KRISTAL',
      ramp: ['#6b4a8a', '#a87fd0', '#c8a8f0', '#3f2a55'],
      surface: {
        skyDay: ['#33205c', '#9a7ad0'], skyNight: ['#06040c', '#120b22'],
        skyDusk: ['#2a1445', '#c08aff'],
        ground: ['#6b5490', '#33244d'], ridge: '#4a3668', far: '#5a4480',
        fog: '#b8a0e0', sun: '#f0e0ff', ambient: '#a88fd0',
      },
    },
  };

  const DEFAULTS = {
    hazard: 0.05, gravity: 1, dayLength: 190, size: 120,
    landable: true, resources: ['ferrite'], contract: null, poi: [],
    orbitSpeed: 0.045, tilt: 0.1, seed: 1, spin: 0.03, cores: 0,
  };

  const P = (o) => Object.assign({}, DEFAULTS, o);

  /* ============================================================
     SYSTEM 1 — starting system
     ============================================================ */
  const SYS1 = {
    id: 'kepler442',
    name: 'KEPLER-442',
    subtitle: 'RIM BATU',
    x: -0.26, y: 0.18,
    star: { color: '#ffd9a0', size: 190, temp: 'K-TYPE' },
    nebula: ['#1b3a6b', '#12414f', '#3f2a5a'],
    desc: 'Sistem tua di tepi lengan spiral. Bintangnya tinggal bara; planet-planetnya dingin dan sunyi, tapi belum habis dikoreksi.',
    coresNeeded: 0,
    planets: [
      P({
        id: 'merida', name: 'MERIDA', type: 'rock', seed: 1201,
        size: 116, orbit: 3300, orbitPhase: 0.4, spin: 0.035,
        hazard: 0.02, gravity: 0.95, dayLength: 165,
        resources: ['ferrite', 'obsidian', 'sulfur', 'core'], cores: 5,
        lore: 'Permukaan penuh kawah dan material ejecta. Atmosfer tipis, tapi bijih besi di sini murni dan mudah dipisah.',
        contract: { res: 'ferrite', qty: 6, reward: 520 },
        poi: [
          { type: 'ruin', name: 'MENARA SUARA', desc: 'Tiga pilar batu setinggi 40 meter. Ketika angin bertiup, nadanya bergema berkilometer.' },
          { type: 'crater', name: 'KAWAH NAGA', desc: 'Kawah obu sepanjang 3 kilometer. Tepi sudah miring, baja kobalt masih menggantung di dinding.' },
        ],
      }),
      P({
        id: 'silex', name: 'SILEX', type: 'desert', seed: 4477,
        size: 134, orbit: 5200, orbitPhase: 2.1, tilt: -0.12, spin: 0.028,
        hazard: 0.22, gravity: 0.92, dayLength: 215,
        resources: ['silicon', 'auric', 'ferrite'],
        lore: 'Bentangan pasir vaselin. Lembah-lembahnya menyimpan gas eksplosif yang mengendap setiap malam dan meledak saat fajar.',
        contract: { res: 'silicon', qty: 5, reward: 640 },
        poi: [
          { type: 'wreck', name: 'KAPAL KARENA', desc: 'Kerangka kapal lama terbalik di dunes. Penuh silikon, dan ada sesuatu yang bergerak di malam hari.' },
          { type: 'vent', name: 'CEROBONG ASAP', desc: 'Retakan uap suam yang menyemburkan gas. Bau sulfur, suaranya seperti didiup keras.' },
        ],
      }),
      P({
        id: 'nivelle', name: 'NIVELLE', type: 'ice', seed: 6613,
        size: 104, orbit: 7400, orbitPhase: 3.6, spin: 0.022,
        hazard: 0.30, gravity: 0.88, dayLength: 240,
        resources: ['cryo', 'platinum', 'ferrite'],
        lore: 'Bekuan abadi dengan retakan biru yang membelah kedalaman. Tidak ada yang cukup kuat untuk tinggal, tapi cryo di sini bernilai tinggi.',
        contract: { res: 'cryo', qty: 4, reward: 780 },
        poi: [
          { type: 'crater', name: 'SUMUR BIRU', desc: 'Sumur es setinggi 200 meter. Uapnya naik membentuk pilar biru yang tetap terlihat dari orbit.' },
        ],
      }),
      P({
        id: 'thalassa', name: 'THALASSA', type: 'ocean', seed: 3390,
        size: 142, orbit: 10200, orbitPhase: 5.2, spin: 0.040,
        hazard: 0.12, gravity: 1.05, dayLength: 180,
        resources: ['bio', 'silicon', 'cryo'],
        lore: 'Benua luas dan lautan dangkal. Ada tanda seseorang pernah menggarap tanah di pesisir — tulangnya masih ada di dalam karang.',
        contract: { res: 'bio', qty: 3, reward: 950 },
        poi: [
          { type: 'wreck', name: 'KOTA TENGGAM', desc: 'Reruntuhan kota yang menetap di bawah permukaan air. Lampu masih menyala biru setiap malam.' },
          { type: 'flora', name: 'HUTAN TERANG', desc: 'Spora bioluminescent yang menerangi daratan saat malam. Ecosystem yang belum diberi nama.' },
        ],
      }),
      P({
        id: 'vantor', name: 'VANTOR', type: 'gas', seed: 7712,
        size: 320, orbit: 14000, orbitPhase: 1.4, orbitSpeed: 0.022, spin: 0.060,
        hazard: 0, gravity: 2.1, dayLength: 330, landable: false,
        resources: ['xenolith', 'uranite'],
        lore: 'Raga raksasa tanpa permukaan. Tidak ada yang bisa mendarat di sini — hanya gas, badai, dan sesuatu yang berputar sangat lambat di dalam.',
      }),
    ],
  };

  /* ============================================================
     SYSTEM 2 — unlocked with 3 jump cores
     ============================================================ */
  const SYS2 = {
    id: 'lyra9',
    name: 'LYRA-9',
    subtitle: 'RANTAI BAJA',
    x: 0.08, y: -0.34,
    star: { color: '#cfe0ff', size: 230, temp: 'A-TYPE' },
    nebula: ['#2a3f7a', '#5a2a6a', '#1f5a6a'],
    desc: 'Sistem logam yang dibangun ulang beberapa kali. Debu beku membentuk cincin di sekeliling bintang dan suaranya bergema saat kapal melintas.',
    coresNeeded: 3,
    planets: [
      P({
        id: 'forge', name: 'FORGE-9', type: 'lava', seed: 8821,
        size: 138, orbit: 3800, orbitPhase: 0.8, spin: 0.030,
        hazard: 0.55, gravity: 1.25, dayLength: 150,
        resources: ['uranite', 'platinum', 'obsidian', 'core'], cores: 5,
        lore: 'Permukaan retak dan meleleh. Setiap retakan adalah sungai logam. Suit standar akan meleleh dalam hitungan menit.',
        contract: { res: 'uranite', qty: 3, reward: 1400 },
        poi: [
          { type: 'vent', name: 'KALI URANIUM', desc: 'Sungai logam yang mengalir ke cekungan. padat dan hangat seperti air mandi.' },
          { type: 'ruin', name: 'FORGE TUA', desc: 'Pabrik tua yang masih beroperasi sendiri. Dindingnya memanas dan berdesis tanpa perintah.' },
        ],
      }),
      P({
        id: 'carbide', name: 'CARBIDE', type: 'toxic', seed: 5519,
        size: 128, orbit: 6100, orbitPhase: 3.1, spin: 0.026,
        hazard: 0.42, gravity: 1.1, dayLength: 200,
        resources: ['bio', 'sulfur', 'uranite'],
        lore: 'Kabut hijau pekat yang berdenyut. Makhluk hidup di sini berevolusi menghirup racun sebagai oksigen.',
        contract: { res: 'bio', qty: 4, reward: 1150 },
        poi: [
          { type: 'flora', name: 'SPOREGARDEN', desc: 'Kebun spora raksasa yang berdenyut seirama dengan denyut bintang.' },
        ],
      }),
      P({
        id: 'quartz', name: 'QUARTZ', type: 'crystal', seed: 4488,
        size: 150, orbit: 9000, orbitPhase: 4.8, spin: 0.018,
        hazard: 0.18, gravity: 0.9, dayLength: 175,
        resources: ['xenolith', 'platinum', 'auric', 'core'], cores: 5,
        lore: 'Permukaan yang tumbuh dan patah. Setiap strukturnya simetris hingga millimeter.',
        contract: { res: 'xenolith', qty: 4, reward: 1600 },
        poi: [
          { type: 'ruin', name: 'KUILK LENSA', desc: 'Menara kristal optik setinggi 300 meter. Cahaya lambat yang membekukan bidang fokus.' },
          { type: 'wreck', name: 'MUDAH', desc: 'Kapal eksplorasi yang membeku di dalam pilar kristal. Tulangnya masih terlihat di balik kaca.' },
        ],
      }),
      P({
        id: 'vesper', name: 'VESPER', type: 'rock', seed: 2277,
        size: 118, orbit: 12500, orbitPhase: 5.9, spin: 0.032,
        hazard: 0.08, gravity: 1.0, dayLength: 160,
        resources: ['ferrite', 'auric', 'platinum'],
        lore: 'Batu besar dengan lubang-lubang menganga. Tidak ada yang tahu apakah itu dampak atau deliberate.',
        contract: { res: 'platinum', qty: 2, reward: 1900 },
        poi: [
          { type: 'crater', name: 'MULUT BATU', desc: 'Lubang raksasa yang menembus inti planet. Angin di dalam menarik debu ke bawah secara terus.' },
        ],
      }),
    ],
  };

  /* ============================================================
     SYSTEM 3 — unlocked with 8 cores
     ============================================================ */
  const SYS3 = {
    id: 'heliosdrift',
    name: 'HELIOS DRIFT',
    subtitle: 'ARUS PANAS',
    x: 0.42, y: 0.26,
    star: { color: '#ff9a5a', size: 260, temp: 'M-TYPE' },
    nebula: ['#7a2a2a', '#6a3a10', '#2a1a4a'],
    desc: 'Di dekat tepi galactic habitable zone. Bintang merah-bara menua dengan keanggunan yang mengerikan.',
    coresNeeded: 8,
    planets: [
      P({
        id: 'cinder', name: 'CINDER', type: 'lava', seed: 9911,
        size: 152, orbit: 4200, orbitPhase: 1.9, spin: 0.034,
        hazard: 0.62, gravity: 1.3, dayLength: 140,
        resources: ['uranite', 'platinum', 'xenolith', 'core'], cores: 5,
        lore: 'Retakan magma yang tak pernah mendingin. Atmosfernya sendiri menyala jika ada kilat.',
        contract: { res: 'uranite', qty: 5, reward: 2200 },
        poi: [
          { type: 'vent', name: 'MULUT MERAH', desc: 'Lubang erupted yang menyemburkan gas piroklastik setiap 40 detik.' },
        ],
      }),
      P({
        id: 'ochre', name: 'OCHRE', type: 'desert', seed: 3321,
        size: 144, orbit: 7400, orbitPhase: 3.4, spin: 0.024,
        hazard: 0.38, gravity: 0.98, dayLength: 190,
        resources: ['silicon', 'sulfur', 'auric'],
        lore: 'Pasir besi berangin. Debu halus berkilau terus-menerus di bawah matahari merah.',
        contract: { res: 'sulfur', qty: 6, reward: 1750 },
        poi: [
          { type: 'wreck', name: 'PERAHU PASIR', desc: 'Kerangka pengangkut yang tersesat di badai pasir. Sebagian komponen badannya masih utuh.' },
        ],
      }),
      P({
        id: 'viridian', name: 'VIRIDIAN', type: 'ocean', seed: 6161,
        size: 158, orbit: 10600, orbitPhase: 4.4, spin: 0.038,
        hazard: 0.14, gravity: 1.02, dayLength: 170,
        resources: ['bio', 'cryo', 'platinum', 'core'], cores: 5,
        lore: 'Dunia oasis. Air bersih dan kehangatan — satu-satunya tempat di sistem ini yang layak disebut rumah.',
        contract: { res: 'platinum', qty: 3, reward: 2450 },
        poi: [
          { type: 'flora', name: 'SAWAH CAHAYA', desc: 'Padang rumput yang berpijar di malam hari. Penduduk menyebutnya "laut hijau".' },
          { type: 'ruin', name: 'MENARA BIDAK', desc: 'Mercusuar kuno yang masih menyala. arahkan cahaya tepat ke starboard saat fajar.' },
        ],
      }),
      P({
        id: 'heliostat', name: 'HELIOSTAT', type: 'gas', seed: 5050,
        size: 300, orbit: 14800, orbitPhase: 2.9, orbitSpeed: 0.02, spin: 0.075,
        hazard: 0, gravity: 2.0, dayLength: 300, landable: false,
        resources: ['xenolith', 'uranite', 'platinum'],
        lore: 'Raga gas raksasa. Pita gasnya berputar dengan kecepatan berbeda dan membentuk struktur mustahil.',
      }),
    ],
  };

  /* ============================================================
     SYSTEM 4 — final
     ============================================================ */
  const SYS4 = {
    id: 'outervoid',
    name: 'THE OUTER VOID',
    subtitle: 'BATAS TERAKHIR',
    x: 0.12, y: 0.58,
    star: { color: '#8a9ad0', size: 300, temp: 'DEAD CLASS' },
    nebula: ['#1a1a4a', '#3a1050', '#0a2a4a'],
    desc: 'Matahari sudah mati dan tetap mati. Yang tersisa hanyalah dunia-dunia yang menolak cahaya, dan hal-hal yang tinggal di kegelapan.',
    coresNeeded: 14,
    planets: [
      P({
        id: 'nihil', name: 'NIHIL', type: 'crystal', seed: 7171,
        size: 158, orbit: 4600, orbitPhase: 0.6, spin: 0.016,
        hazard: 0.26, gravity: 0.9, dayLength: 220,
        resources: ['xenolith', 'uranite', 'platinum', 'core'], cores: 4,
        lore: 'Kristal hitam yang menyerap cahaya. Tidak ada yang tahu apa yang terjadi di dalam inti itu.',
        contract: { res: 'xenolith', qty: 8, reward: 3400 },
        poi: [
          { type: 'ruin', name: 'GERBANG MATI', desc: 'Gerbang yang dulu menghubungkan sistem. Sekarang hanya bayangan samar di udara dingin.' },
        ],
      }),
      P({
        id: 'terminus', name: 'TERMINUS', type: 'ice', seed: 1313,
        size: 146, orbit: 8200, orbitPhase: 2.5, spin: 0.020,
        hazard: 0.46, gravity: 0.85, dayLength: 260,
        resources: ['cryo', 'platinum', 'obsidian'],
        lore: 'Es abadi tanpa bintang. Permukaan gelap total kecuali cahaya dari kapalmu.',
        contract: { res: 'cryo', qty: 8, reward: 2900 },
        poi: [
          { type: 'wreck', name: 'STATION MATI', desc: 'Stasiun riset yang mati 400 tahun lalu. Panel dayanya masih menyala dari sumber tak dikenal.' },
        ],
      }),
      P({
        id: 'sable', name: 'SABLE', type: 'rock', seed: 9090,
        size: 154, orbit: 12000, orbitPhase: 4.1, spin: 0.030,
        hazard: 0.20, gravity: 0.97, dayLength: 200,
        resources: ['ferrite', 'uranite', 'obsidian', 'auric'],
        lore: 'Batu hitam kelam. Batas terakhir — dan pendatang pertama yang tiba di sini belum pernah kembali.',
        contract: { res: 'auric', qty: 8, reward: 3600 },
        poi: [
          { type: 'ruin', name: 'GERBANG TERAKHIR', desc: 'Batu raksasa yang ditandai dengan simbol yang tidak dikenal.' },

          { type: 'crater', name: 'JEFAT TERAKHIR', desc: 'Jejak sesuatu yang jatuh dari langit. Lurus ke bawah. Sangat dalam.' },
        ],
      }),
    ],
  };

  const SYSTEMS = [SYS1, SYS2, SYS3, SYS4];

  /* ---------------- derived helpers ---------------- */
  SYSTEMS.forEach((sys) => {
    sys.planets.forEach((p) => {
      const arch = ARCH[p.type];
      p.palette = { ramp: arch.ramp };
      p.label = arch.label;
      p.surface = arch.surface;
      p.orbitSpeed = p.orbitSpeed !== undefined ? p.orbitSpeed : 0.04;
      p.orbitAngle = p.orbitPhase || 0;
      p.rotation = Math.random() * Math.PI * 2;
      p.res = RESOURCES;
      p.poi = p.poi || [];
      p.discovered = false;
      p.poiFound = {};
    });
    sys.nebulaCanvas = null;
    sys.stars = null;
  });

  SB.universe = {
    RESOURCES,
    ARCH,
    SYSTEMS,
    getSystem: (id) => SYSTEMS.find((s) => s.id === id),
    totalCores: (sys) => sys.planets.reduce((n, p) => n + (p.resources.includes('core') ? 1 : 0), 0),
  };
})();
