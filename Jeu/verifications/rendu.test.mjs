// Vérifie le rendu sans GPU, sur un contexte WebGL 2 simulé qui note chaque appel :
// - les retouches du moteur sont marquées « PDR » ; sans fx.voile, fx.lots ni fx.foule, le moteur fait exactement les
//   appels de celui d'avant ces retouches (renderer.js du commit b695b51), au voile près, posé à force nulle ;
// - les points d'accroche : fx.foule.ombre et fx.foule.couleur une fois par image, chacun dans sa passe, l'état GL
//   rétabli au retour ; un lot de fx.lots envoyé une fois tant que sa version ne change pas ; fx.voile sur l'unité 4 ;
// - le décor : lots au format de pack, comparés au pack du moteur, valeurs finies, pour chaque sorte de structure et de
//   cassable ; brouillard, versions, effets de chaque évènement ;
// - le réalisateur de la démo : la ville entière d'abord et de temps en temps, puis le point le plus vivant, sans saut.
//   node Jeu/verifications/rendu.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ici = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(ici, '..', 'src');
const charger = createRequire(import.meta.url);
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'decor.js', 'camera.js']) charger(path.join(src, f));
const PDR = globalThis.PDR;

let ok = 0;
const verifier = (nom, f) => { f(); ok++; console.log('ok  ' + nom); };
const SOURCE = fs.readFileSync(path.join(src, 'moteur', 'renderer.js'), 'utf8');

// ---- Contexte WebGL 2 simulé. Les constantes ont les mêmes valeurs pour tous les contextes. ----
const CONSTANTES = new Map();
const constante = nom => {
  const t = /^TEXTURE(\d+)$/.exec(nom);
  if (t) return 0x84C0 + Number(t[1]);
  if (!CONSTANTES.has(nom)) CONSTANTES.set(nom, 0x9000 + CONSTANTES.size);
  return CONSTANTES.get(nom);
};
const nomConstante = v => { for (const [k, c] of CONSTANTES) if (c === v) return k; return v >= 0x84C0 && v < 0x84E0 ? 'TEXTURE' + (v - 0x84C0) : null; };
function creerContexte({ largeur = 1440, hauteur = 900 } = {}) {
  const journal = [], ecoutes = {};
  let objets = 0;
  const parametres = { MAX_TEXTURE_SIZE: 16384, MAX_RENDERBUFFER_SIZE: 16384, MAX_SAMPLES: 4, MAX_DRAW_BUFFERS: 8,
    ALIASED_POINT_SIZE_RANGE: new Float32Array([1, 1024]), MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32, MAX_TEXTURE_IMAGE_UNITS: 16,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16, VERSION: 'WebGL 2.0 (simulé)', SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 3.00 (simulé)',
    VENDOR: 'simulé', RENDERER: 'simulé', MAX_VIEWPORT_DIMS: new Int32Array([16384, 16384]) };
  const reponses = {
    getParameter: p => parametres[nomConstante(p)] ?? 0,
    getExtension: () => ({}), getSupportedExtensions: () => [],
    getShaderParameter: () => true, getProgramParameter: () => true, getShaderInfoLog: () => '', getProgramInfoLog: () => '',
    checkFramebufferStatus: () => constante('FRAMEBUFFER_COMPLETE'), isContextLost: () => false,
    getContextAttributes: () => ({ antialias: false, alpha: false, depth: true }),
    getUniformLocation: (p, nom) => ({ u: nom }), getAttribLocation: () => 0,
  };
  const gl = new Proxy({}, {
    get(_, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop === 'drawingBufferWidth') return largeur;
      if (prop === 'drawingBufferHeight') return hauteur;
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return constante(prop);
      return (...args) => {
        journal.push([prop, args]);
        if (reponses[prop]) return reponses[prop](...args);
        if (prop.startsWith('create')) return { id: ++objets, sorte: prop.slice(6) };
        return undefined;
      };
    },
  });
  const canvas = { width: 300, height: 150, clientWidth: largeur, clientHeight: hauteur, style: {},
    getContext: t => (t === 'webgl2' ? gl : null), addEventListener: (t, f) => { ecoutes[t] = f; }, removeEventListener() {} };
  return { gl, journal, canvas, ecoutes };
}
function chargerMoteur(source) {
  const ctx = { console, devicePixelRatio: 1, innerWidth: 1440, innerHeight: 900 };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'renderer.js' });
  return ctx.FRender;
}
// Un appel noté, rendu comparable : objets par numéro, uniformes par nom, constantes par nom, tableaux par empreinte.
function normaliser(appel) {
  const [k, args] = appel;
  return [k, args.map(a => {
    if (a && typeof a === 'object' && 'id' in a && 'sorte' in a) return '#' + a.sorte + a.id;
    if (a && typeof a === 'object' && 'u' in a) return 'u:' + a.u;
    if (ArrayBuffer.isView(a)) {
      const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      let h = 0x811C9DC5;
      for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
      return a.constructor.name + '[' + a.length + ']' + (h >>> 0).toString(16);
    }
    if (typeof a === 'number') return nomConstante(a) && a >= 0x84C0 ? nomConstante(a) : a;
    return a;
  })];
}

const SOLEIL = [-0.45, 0.62, 0.35];
const ATMOSPHERE = { skyTop: [0.26, 0.42, 0.64], skyBottom: [0.62, 0.70, 0.76], fog: [0.56, 0.63, 0.70], sunDirection: SOLEIL,
  sunColor: [1.62, 1.44, 1.16], ambient: [0.16, 0.185, 0.225], wind: 0.5, fogDensity: 0.00025,
  outdoorZones: [{ x: 0, z: 0, w: 6000, d: 6000 }], biome: 'ville' };
const MONDE = [
  { shape: 'box', p: [0, -0.05, 0], s: [400, 0.1, 400], mat: 14, color: [0.3, 0.3, 0.31], outdoor: true },
  { shape: 'box', p: [20, 10, -30], s: [24, 20, 18], mat: 13, color: [0.8, 0.74, 0.63], outdoor: true },
  { shape: 'cylinder', p: [-12, 3, 8], s: [0.2, 6, 0.2], mat: 0, color: [0.4, 0.4, 0.42], outdoor: true },
  { shape: 'foliage', p: [-30, 6, 20], s: [4, 3, 4], mat: 11, color: [0.3, 0.45, 0.2], outdoor: true },
];
function camera() {
  const cam = PDR.camera.creerCamera({ clientWidth: 1440, clientHeight: 900 }, { x0: -200, z0: -200, x1: 200, z1: 200 }, SOLEIL);
  cam.placer(0, 0, 260, 0.4);
  return cam.vue(1 / 60);
}
function rendre(source, images, fxDe) {
  const FRender = chargerMoteur(source), c = creerContexte();
  const r = FRender.create(c.canvas);
  r.setWorld(MONDE, [], ATMOSPHERE);
  const vue = camera();
  for (let i = 0; i < images; i++) r.draw(vue, [{ shape: 'box', p: [2, 0.5, 2], s: [1, 1, 1], mat: 17, color: [0.5, 0.1, 0.1] }],
    { time: i / 60, frameMs: 16.7, adaptive: true, sunOnly: true, torch: false, lights: [], ...(fxDe ? fxDe(i, c.gl) : {}) });
  return { r, ...c };
}

// ---- Le moteur. ----
verifier('moteur : retouches marquées « PDR », bibliothèque d’éclairage et points d’accroche exposés', () => {
  const lignes = SOURCE.split('\n').filter(l => l.includes('PDR'));
  assert.ok(lignes.length >= 30, lignes.length + ' lignes marquées');
  for (const mot of ['fx.voile', 'fx.lots', 'fx.foule.ombre', 'fx.foule.couleur', 'renderer.gl']) assert.ok(SOURCE.includes(mot), mot);
  const { r } = rendre(SOURCE, 1);
  assert.ok(r.gl && r.pdr && typeof r.pdr.programme === 'function' && typeof r.pdr.lier === 'function');
  for (const f of ['pdrOmbreSoleil', 'pdrEclairer', 'pdrFinir']) assert.ok(r.pdr.glsl.includes('vec3 ' + f) || r.pdr.glsl.includes('float ' + f), f);
  assert.ok(r.pdr.uniformes.length >= 16);
  const provenance = fs.readFileSync(path.join(src, 'moteur', 'PROVENANCE.md'), 'utf8');
  for (const mot of ['fx.voile', 'fx.lots', 'fx.foule', 'renderer.pdr']) assert.ok(provenance.includes(mot), 'PROVENANCE : ' + mot);
});

let origine = null;
try {
  origine = execFileSync('git', ['show', 'b695b51:Jeu/src/moteur/renderer.js'], { cwd: path.join(ici, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) { origine = null; }
if (!origine) console.log('--  moteur d’avant les retouches introuvable (pas de dépôt git ici) : comparaison sautée');
else verifier('moteur : sans fx.voile, fx.lots ni fx.foule, les mêmes appels WebGL que le moteur d’avant, image après image', () => {
  const avant = rendre(origine, 3), apres = rendre(SOURCE, 3);
  // Le shader du monde gagne le voile : retiré, il redevient celui d'avant.
  const sansVoile = s => s
    .replace(/\n {2}\/\/ PDR : voile du brouillard \(fx\.voile\)[^\n]*\n {2}uniform sampler2D uVoile;\n {2}uniform vec4 uVoileZone;\n {2}uniform float uVoileForce;/, '')
    .replace(/\n {4}\/\/ PDR : voile du brouillard\. [^\n]*\n {4}if\(uVoileForce>0\.&&outdoors>\.5\)\{\n[\s\S]*?\n {4}\}/, '');
  const filtrer = journal => {
    const sortie = [];
    for (let i = 0; i < journal.length; i++) {
      const [k, a] = journal[i];
      if (k === 'getUniformLocation' && /^uVoile/.test(a[1])) continue;
      // Le voile à force nulle : texture blanche sur l'unité 4, deux uniformes, retour à l'unité 2.
      if (k === 'activeTexture' && a[0] === constante('TEXTURE4')) {
        const suite = journal.slice(i, i + 5).map(([kk, aa]) => kk + (aa[0] && aa[0].u ? ':' + aa[0].u : '') + (aa[1] !== undefined ? '=' + normaliser([kk, aa])[1][1] : ''));
        assert.match(suite.join(' '), /^activeTexture bindTexture=#Texture\d+ uniform1i:uVoile=4 uniform1f:uVoileForce=0 activeTexture$/);
        assert.equal(journal[i + 4][1][0], constante('TEXTURE2'));
        i += 4;
        continue;
      }
      if (k === 'shaderSource') { sortie.push(normaliser([k, [a[0], sansVoile(a[1])]])); continue; }
      sortie.push(normaliser(journal[i]));
    }
    return sortie;
  };
  const a = filtrer(avant.journal).map(e => JSON.stringify(e)), b = filtrer(apres.journal).map(e => JSON.stringify(e));
  const premier = a.findIndex((e, i) => e !== b[i]);
  assert.equal(premier, -1, premier >= 0 ? 'premier écart à l’appel ' + premier + ' :\n  avant ' + a[premier] + '\n  après ' + b[premier] : '');
  assert.equal(a.length, b.length);
  assert.ok(a.length > 300 && a.filter(e => e.includes('drawElementsInstanced')).length >= 6, 'assez d’appels pour que la comparaison dise quelque chose');
  console.log('    ' + a.length + ' appels identiques sur 3 images (création comprise)');
});

verifier('points d’accroche : foule appelée dans chaque passe, état GL rétabli, lots envoyés selon leur version, voile', () => {
  const lot = PDR.decor.creerLot('essai');
  lot.debut(); lot.mettre(0, 1, 1, 1, 2, 2, 2, 0, 0, 0, 7, 0.5, 0.5, 0.5, 0); lot.mettre(2, 4, 1, 1, 1, 2, 1, 0, 0, 0, 0, -1, 0, 0, 0); lot.fin();
  const appels = [];
  let voileTex = null;
  const foule = {
    ombre(gl, l) {
      appels.push(['ombre', l.matrice.length, l.viewport.slice(), l.plein]);
      gl.useProgram({ id: 'foule', sorte: 'Program' }); gl.drawArrays(constante('POINTS'), 0, 1);
      return { appels: 1, triangles: 10, instances: 5 };
    },
    couleur(gl, v) {
      appels.push(['couleur', v.vp.length, v.focale, v.ombre.unite, v.ombre.active, v.lumieres.positions.length]);
      gl.useProgram({ id: 'foule', sorte: 'Program' }); gl.bindVertexArray(null); gl.disable(constante('DEPTH_TEST'));
      gl.depthMask(false); gl.enable(constante('BLEND')); gl.drawArrays(constante('POINTS'), 0, 7);
      return { appels: 1, triangles: 0, instances: 7 };
    },
  };
  const s = rendre(SOURCE, 3, (i, gl) => {
    if (i === 2) lot.version++;
    voileTex = voileTex || gl.createTexture();
    return { foule, lots: [lot], voile: { texture: voileTex, origine: [-100, -50], taille: [200, 100], force: 0.6 } };
  });
  assert.deepEqual(appels.map(a => a[0]), ['ombre', 'couleur', 'ombre', 'couleur', 'ombre', 'couleur']);
  for (const a of appels) if (a[0] === 'ombre') assert.ok(a[1] === 16 && a[2].length === 4 && a[3] === true);
  for (const a of appels) if (a[0] === 'couleur') assert.ok(a[1] === 16 && a[2] > 100 && a[3] === 2 && a[4] === true && a[5] === 36);
  // Après la passe couleur de la foule, le moteur reprend son programme et son état.
  const j = s.journal.map(normaliser).map(e => JSON.stringify(e));
  const apres = j.findIndex(e => e.includes('"POINTS",0,7')) + 1;
  const suite = j.slice(apres, apres + 12).join(' ');
  for (const attendu of ['"useProgram",["#Program', '"bindVertexArray",["#VertexArray', '"enable",["DEPTH_TEST"]', '"depthFunc",["LEQUAL"]',
    '"enable",["CULL_FACE"]', '"depthMask",[true]', '"disable",["BLEND"]', '"activeTexture",["TEXTURE2"]']) assert.ok(suite.includes(attendu), attendu + ' dans ' + suite);
  // Après la passe d'ombre de la foule, le moteur reprend son programme de profondeur.
  const apresOmbre = j.findIndex(e => e.includes('"POINTS",0,1')) + 1;
  const suiteOmbre = j.slice(apresOmbre, apresOmbre + 8).join(' ');
  for (const attendu of ['"useProgram",["#Program', '"bindVertexArray",["#VertexArray', '"enable",["DEPTH_TEST"]', '"depthMask",[true]', '"disable",["BLEND"]'])
    assert.ok(suiteOmbre.includes(attendu), attendu + ' dans ' + suiteOmbre);
  // Le lot : envoyé à la première image, pas à la deuxième, de nouveau à la troisième (version changée).
  const envois = s.journal.filter(([k, a]) => k === 'bufferData' && a[1] === lot.values).length;
  assert.equal(envois, 2);
  // Voile posé sur l'unité 4 avec sa zone et sa force.
  const z = s.journal.filter(([k, a]) => k === 'uniform4f' && a[0].u === 'uVoileZone');
  assert.deepEqual(z[0][1].slice(1), [-100, -50, 1 / 200, 1 / 100]);
  assert.ok(s.journal.some(([k, a]) => k === 'uniform1f' && a[0].u === 'uVoileForce' && Math.abs(a[1] - 0.6) < 1e-9));
  assert.ok(s.r.stats.drawCalls > 0 && s.r.stats.pdrLotInstances === 2);
  // Contexte perdu puis rendu : la génération change, les tampons des lots sont à refaire.
  const g = s.r.pdr.generation;
  s.ecoutes.webglcontextrestored();
  assert.equal(s.r.pdr.generation, g + 1);
});

// ---- Le décor. ----
const outdoor = SOURCE.indexOf('function outdoorMesh('), fin = SOURCE.indexOf('function packEffects(');
const pack = new Function('names', 'outdoorAt', SOURCE.slice(outdoor, fin) + '\nreturn pack;')(PDR.decor.NOMS.slice(), () => true);
const ville = PDR.ville.creerVille(1, { ilots: 13 });
const sol = ville.sol;
function memeQuePack(construire) {
  const c = PDR.decor.creerCollecteur(), lot = PDR.decor.creerLot('essai');
  construire(c); lot.debut(); construire(lot); lot.fin();
  const attendu = pack(c.maillages, ATMOSPHERE, true);
  assert.deepEqual(lot.groups, attendu.groups);
  assert.equal(lot.values.length, attendu.values.length);
  for (let i = 0; i < lot.values.length; i++) if (lot.values[i] !== attendu.values[i]) assert.fail('valeur ' + i + ' : ' + lot.values[i] + ' au lieu de ' + attendu.values[i]);
  for (const m of c.maillages) {
    assert.ok(PDR.decor.NOMS.includes(m.shape));
    assert.ok([...m.p, ...m.r, m.mat, m.emissive].every(Number.isFinite), JSON.stringify(m));
    assert.ok(m.s.every(v => Number.isFinite(v) && v > 0), 'taille ' + JSON.stringify(m.s));
    if (m.color) assert.ok(m.color.every(v => Number.isFinite(v) && v >= 0 && v <= 1.5));
  }
  return c.maillages.length;
}

verifier('décor : structures de chaque sorte, à chaque étape, au format de pack du moteur', () => {
  const compte = {};
  let id = 3;
  for (let f = 0; f < 3; f++) for (const pv of [0, 300, 750, 1500]) for (const chantier of [true, false]) {
    const s = { id: id++, sorte: 'avant-poste', faction: f, x: 10 * f, z: -20, x2: 10 * f, z2: -20, pv, pvMax: 1500, chantier, feu: false };
    compte['avant-poste ' + f] = Math.max(compte['avant-poste ' + f] || 0, memeQuePack(p => PDR.decor.construireStructure(s, sol, p)));
  }
  for (const L of [0, 4, 11.3, 20, 31]) for (const pv of [0, 200, 800]) for (const feu of [false, true]) for (const chantier of [false, true]) {
    const s = { id: id++, sorte: 'barricade', faction: 0, x: 3, z: 4, x2: 3 + L * 0.8, z2: 4 + L * 0.6, pv, pvMax: 800, chantier, feu };
    compte.barricade = Math.max(compte.barricade || 0, memeQuePack(p => PDR.decor.construireStructure(s, sol, p)));
  }
  memeQuePack(p => PDR.decor.construireStructure({ id: 9, sorte: 'barricade', faction: 0, x: 1, z: 1, x2: NaN, z2: undefined, pv: NaN, pvMax: 0 }, sol, p));
  assert.equal(memeQuePack(p => PDR.decor.construireStructure({ id: 0, sorte: 'qg', faction: 0, x: 0, z: 0 }, sol, p)), 0);
  console.log('    pièces au plus : ' + Object.entries(compte).map(([k, v]) => k + ' ' + v).join(', '));
});

verifier('décor : chaque cassable de la ville, intact et cassé, au format de pack ; tas, lieux et QG aussi', () => {
  const sortes = new Set();
  for (const c of ville.sites.cassables) {
    sortes.add(c.sorte);
    const intact = memeQuePack(p => PDR.decor.construireCassable(c, false, p));
    assert.equal(intact, c.pieces.length);
    memeQuePack(p => PDR.decor.construireCassable(c, true, p));
  }
  assert.deepEqual([...sortes].sort(), [...PDR.protocole.SORTES_CASSABLES].sort());
  for (const sorte of PDR.protocole.SORTES_CASSABLES) memeQuePack(p => PDR.decor.construireCassable({ id: 1, sorte, x: 0, z: 0, lacet: 0.3, pieces: [] }, true, p));
  for (const g of ville.sites.gisements) for (const part of [1, 0.5, 0.03, 0]) memeQuePack(p => PDR.decor.construireTas(g, part, sol, p));
  for (const l of ville.sites.lieux) for (const proprietaire of [-1, 0, 1, 2]) {
    memeQuePack(p => PDR.decor.construireLieu(l, { proprietaire, progression: -0.4, conteste: proprietaire === 1, preneur: (proprietaire + 1) % 3 }, sol, p));
  }
  for (const q of ville.sites.qg) memeQuePack(p => PDR.decor.construireOccupation(q, 0.6, 1, sol, p));
});

verifier('décor : états reçus, lots versionnés, brouillard, effets de chaque évènement, valeurs finies', () => {
  const EV = PDR.protocole.EV;
  const decor = PDR.decor.creerDecor(ville, { joueur: 0, brouillard: true, effectifs: 100000 });
  const [lc, lt, ls, la, lm] = decor.lots;
  const structures = [
    { id: 0, sorte: 'qg', faction: 0, x: ville.sites.qg[0].x, z: ville.sites.qg[0].z, occupation: 0.5, ralliement: [10, 10] },
    { id: 3, sorte: 'avant-poste', faction: 0, x: 0, z: 0, pv: 1500, pvMax: 1500, chantier: false, ralliement: [12, 4] },
    { id: 4, sorte: 'avant-poste', faction: 2, x: 100, z: 0, pv: 1500, pvMax: 1500, chantier: false },
    { id: 5, sorte: 'barricade', faction: 0, x: -40, z: 0, x2: -30, z2: 0, pv: 600, pvMax: 600, chantier: false, feu: true },
  ];
  const voile = new Uint8Array(118 * 120);
  decor.voile(voile, { nx: 118, nz: 120, x0: -472, z0: -480, cellule: 8 });
  decor.etat({ structures, cassables: new Uint8Array(ville.sites.cassables.length), lieux: ville.sites.lieux.map(() => ({ proprietaire: -1, progression: 0, conteste: false })) });
  const pieces = liste => { const c = PDR.decor.creerCollecteur(); for (const s of liste) PDR.decor.construireStructure(s, sol, c); return c.maillages.length; };
  assert.equal(ls.instances, pieces(structures.filter(s => s.faction === 0)), 'structures du joueur');
  assert.ok(ls.instances > 40);
  assert.equal(la.instances, 0, 'poste ennemi hors de vue : caché');
  const versions = decor.lots.map(l => l.version);
  decor.etat({ cassables: new Uint8Array(ville.sites.cassables.length), lieux: ville.sites.lieux.map(() => ({ proprietaire: -1, progression: 0, conteste: false })) });
  assert.deepEqual(decor.lots.map(l => l.version), versions, 'rien n’a changé : rien ne repart');
  decor.etat({ structures: structures.map(s => ({ ...s, file: [{ type: 1, lot: 10, reste: 3, total: 10 }], pv: s.sorte === 'avant-poste' ? s.pv - 1 : s.pv })) });
  assert.deepEqual(decor.lots.map(l => l.version), versions, 'file de production, pv d’un avant-poste fini : rien ne repart');
  decor.etat({ structures: structures.map(s => (s.id === 5 ? { ...s, pv: 300 } : s)) });
  assert.equal(ls.version, versions[2] + 1, 'barricade entamée : les structures repartent');
  assert.ok(ls.instances < pieces(structures.filter(s => s.faction === 0)));
  decor.etat({ structures });
  voile.fill(255); decor.voile(voile, { nx: 118, nz: 120, x0: -472, z0: -480, cellule: 8 });
  const vue = { pos: [0, 220, 260], axes: { forward: [0, -0.64, -0.77], right: [1, 0, 0], up: [0, 0.77, -0.64] }, fov: 42 };
  decor.cadre(vue, 1);
  assert.equal(la.instances, pieces([structures[2]]), 'poste ennemi vu : dessiné');
  assert.ok(la.instances > 30);
  const casses = new Uint8Array(ville.sites.cassables.length); casses[0] = casses[5] = 1;
  const ev = [];
  for (const t of Object.values(EV)) ev.push(t, 5 + t, -3, t % 3, t === EV.LIEU_PRIS ? 0 : 6, t === EV.SALVE_ANNONCE ? 1.5 : 18);
  decor.etat({ cassables: casses, gisements: Int32Array.from(ville.sites.gisements.map(g => g.stock * 2)), evenements: Float32Array.from(ev),
    lieux: ville.sites.lieux.map((l, i) => ({ proprietaire: i % 3, progression: 0.5, conteste: i === 1 })) });
  assert.ok(lc.version > versions[0] && lt.version > versions[1] && lm.version > versions[4]);
  decor.selectionner([0, 3]); decor.ordre(4, 4, 'attaquer');
  let sortie;
  for (let k = 0; k < 12; k++) sortie = decor.cadre(vue, 1.05 + k * 0.05);
  assert.ok(sortie.dynamique.length > 40 && sortie.lumieres.length >= 1 && sortie.lumieres.length <= 8);
  const formes = new Set(PDR.decor.NOMS);
  for (const m of sortie.dynamique) {
    assert.ok(formes.has(m.shape), m.shape);
    assert.ok([...m.p, ...m.s, ...m.r, ...m.color, m.emissive].every(Number.isFinite));
    assert.ok(m.s.every(v => v > 0));
    if (m.fx) assert.ok(m.alpha >= 0 && m.alpha <= 1);
  }
  assert.ok(sortie.dynamique.some(m => m.fxFire), 'feu de la barricade');
  assert.ok(sortie.dynamique.some(m => m.fxPriority === 'hazard' && m.shape === 'ring'), 'anneaux au sol');
  for (const l of sortie.lumieres) assert.ok([...l.p, ...l.color, l.power, l.range].every(Number.isFinite));
  for (const l of decor.lots) for (const v of l.values) assert.ok(Number.isFinite(v));
  for (const l of decor.lots) assert.equal(l.values.length, 16 * l.groups.reduce((s, g) => s + g.count, 0));
  // Tableaux réutilisés d'une image à l'autre.
  assert.equal(decor.cadre(vue, 2).dynamique, sortie.dynamique);
  console.log('    instances des lots : ' + decor.lots.map(l => l.nom + ' ' + l.instances).join(', '));
});

// ---- Le réalisateur de la démo. ----
verifier('réalisateur : ville entière d’abord, puis le point le plus vivant, plans de 8 à 12 s, sans saut', () => {
  const canvas = { clientWidth: 1440, clientHeight: 900 };
  const cam = PDR.camera.creerCamera(canvas, ville.etendue, SOLEIL);
  cam.placer(0, 0, 330, 0);
  const real = PDR.camera.creerRealisateur(cam, ville, { graine: 7, carte: { combats: { taille: 64, x0: ville.etendue.x0, z0: ville.etendue.z0, cote: 15 } } });
  const combats = new Uint16Array(64 * 64), ci = 44, cj = 20;
  const cible = [ville.etendue.x0 + (ci + 0.5) * 15, ville.etendue.z0 + (cj + 0.5) * 15];
  const plans = [];
  let avant = null, sautMax = 0;
  for (let image = 0; image < 60 * 90; image++) {
    if (image % 3 === 0) {
      combats.fill(0); combats[cj * 64 + ci] = 40; combats[cj * 64 + ci + 1] = 25;
      real.etat({ combats, evenements: new Float32Array(0), lieux: [] });
    }
    real.avancer(1 / 60);
    const vue = cam.vue(1 / 60);
    assert.ok(vue.pos.every(Number.isFinite));
    if (avant) sautMax = Math.max(sautMax, Math.hypot(vue.pos[0] - avant[0], vue.pos[1] - avant[1], vue.pos[2] - avant[2]));
    avant = vue.pos;
    const p = real.plan;
    if (!plans.length || plans[plans.length - 1] !== p) plans.push(p);
  }
  assert.equal(plans[0].sorte, 'ville');
  assert.equal(plans[0].D, PDR.camera.DMAX);
  const combat = plans.find(p => p.sorte === 'combat');
  assert.ok(combat, 'un plan sur le combat');
  assert.ok(Math.hypot(combat.x - cible[0], combat.z - cible[1]) < 25, 'au cœur du combat');
  assert.ok(plans.slice(1).some(p => p.sorte === 'ville'), 'la ville entière de temps en temps');
  for (const p of plans) assert.ok(p.duree >= 8 && p.duree <= 12);
  assert.ok(sautMax < 12, 'saut de ' + sautMax.toFixed(1) + ' m en une image');
  // Le premier geste rend la main ; la démo peut repartir.
  real.arreter();
  const v0 = cam.visee;
  real.avancer(1); assert.deepEqual(cam.visee, v0);
  real.reprendre(); real.avancer(1 / 60);
  assert.ok(real.actif && real.plan);
  console.log('    plans : ' + plans.map(p => p.sorte).join(', ') + ' ; plus grand pas de caméra ' + sautMax.toFixed(2) + ' m par image');
  // Un contact au bord est de la ville : la cible rentre dans la ville et la caméra la regarde depuis le dehors.
  const cam2 = PDR.camera.creerCamera(canvas, ville.etendue, SOLEIL);
  cam2.placer(0, 0, 330, Math.PI);
  const real2 = PDR.camera.creerRealisateur(cam2, ville, { graine: 3, carte: { combats: { taille: 64, x0: ville.etendue.x0, z0: ville.etendue.z0, cote: 15 } } });
  const bord = new Uint16Array(64 * 64); bord[30 * 64 + 62] = 60;
  let vu = null;
  for (let image = 1; image <= 60 * 40 && !vu; image++) {
    if (image % 3 === 1) real2.etat({ combats: bord, evenements: new Float32Array(0), lieux: [] });
    real2.avancer(1 / 60);
    const vue = cam2.vue(1 / 60), p = real2.plan;
    // Vol fini depuis une seconde : la caméra lissée a rejoint sa visée.
    if (p.sorte === 'combat' && p.debut + p.vol + 1 < image / 60) vu = { p, vue };
  }
  assert.ok(vu, 'un plan sur le contact du bord');
  const xBord = ville.etendue.x0 + 62.5 * 15;
  assert.ok(vu.p.x < ville.etendue.x1 - 0.2 * vu.p.D && vu.p.x > xBord - 0.3 * vu.p.D - 20, 'cible rentrée dans la ville : ' + vu.p.x.toFixed(1));
  const f = vu.vue.axes.forward, versCentre = -vu.p.x * f[0] - vu.p.z * f[2];
  assert.ok(versCentre > 0, 'la caméra regarde vers le centre');
});

verifier('caméra : au plus près, l’œil reste au-dessus des toits (la visée, elle, ne bouge pas)', () => {
  const hauts = ville.objets.filter(o => o.p[1] + o.s[1] / 2 > 18).map(o => {
    const a = (o.r && o.r[1]) || 0;
    return { x: o.p[0], z: o.p[2], c: Math.cos(a), s: Math.sin(a), hx: o.s[0] / 2, hz: o.s[2] / 2, haut: o.p[1] + o.s[1] / 2 };
  });
  // Dans l'emprise tournée d'une pièce, et plus bas que son sommet + 2 m : dedans.
  const dedans = p => hauts.some(b => {
    const dx = p[0] - b.x, dz = p[2] - b.z, u = dx * b.c + dz * b.s, v = -dx * b.s + dz * b.c;
    return Math.abs(u) <= b.hx + 0.5 && Math.abs(v) <= b.hz + 0.5 && p[1] < b.haut + 2;
  });
  const canvas = { clientWidth: 1440, clientHeight: 900 }, rd = PDR.decor.alea(11), e = ville.etendue;
  const sans = PDR.camera.creerCamera(canvas, e, SOLEIL), avec = PDR.camera.creerCamera(canvas, e, SOLEIL, { ville });
  let dedansSans = 0, recul = 0;
  for (let k = 0; k < 400; k++) {
    const x = e.x0 + rd() * (e.x1 - e.x0), z = e.z0 + rd() * (e.z1 - e.z0), D = 40 + rd() * 10, yaw = rd() * 6.283;
    sans.placer(x, z, D, yaw); avec.placer(x, z, D, yaw);
    let v1, v2;
    for (let i = 0; i < 20; i++) { v1 = sans.vue(1 / 60); v2 = avec.vue(1 / 60); }
    if (dedans(v1.pos)) dedansSans++;
    assert.ok(!dedans(v2.pos), 'œil dans un immeuble en ' + v2.pos.map(c => c.toFixed(1)).join(', '));
    assert.equal(avec.visee.D, D, 'la visée garde sa distance');
    recul = Math.max(recul, v2.D - D);
  }
  assert.ok(dedansSans >= 5, 'sans la ville, la caméra entre dans les immeubles (' + dedansSans + ' fois sur 400) : le test porte');
  // En glissant au ras des toits d'un bout à l'autre de la ville, sans saut.
  avec.placer(e.x0 + 20, 0, 40, 0.3);
  let avant = null, saut = 0;
  for (let i = 0; i < 60 * 25; i++) {
    avec.viser(e.x0 + 20 + i * 0.6, Math.sin(i / 90) * 120);
    const v = avec.vue(1 / 60);
    assert.ok(!dedans(v.pos), 'œil dans un immeuble en glissant, image ' + i);
    if (avant) saut = Math.max(saut, Math.hypot(v.pos[0] - avant[0], v.pos[1] - avant[1], v.pos[2] - avant[2]));
    avant = v.pos;
  }
  assert.ok(saut < 3, 'pas de caméra ' + saut.toFixed(2) + ' m');
  console.log('    sans la ville : ' + dedansSans + ' visées sur 400 mettent l’œil dans un immeuble ; avec : aucune (recul au plus '
    + recul.toFixed(1) + ' m ; plus grand pas en glissant ' + saut.toFixed(2) + ' m)');
});

console.log(ok + ' vérifications du rendu réussies');
