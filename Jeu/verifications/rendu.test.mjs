// Vérifie le rendu sans GPU, sur un contexte WebGL 2 simulé qui note chaque appel :
// - le moteur est FERRO 0.2 : sans réglage ni champ du jeu, puis avec les réglages de création du jeu, la copie envoie au
//   GPU exactement les commandes de l'original (étiquette v0.2), image après image, sur une scène à hauteur d'homme et
//   sur la ville vue de haut ; seul le voile du jeu s'y ajoute, déclaré une fois à la création. Le repli Canvas 2D aussi ;
// - le passage : sur des images du jeu, les commandes de la copie d'avant (commit 5ac0066 : METAL 0.6 et 17 retouches),
//   aux écarts près, tous comptés et expliqués ; les shaders ne changent que de ce que METAL a changé de 0.6 à 0.8 ;
// - les retouches du jeu : fx.voile sur l'unité 4, retiré quand il cesse ; un lot de fx.lots envoyé une fois tant que sa
//   version ne change pas ; fx.foule.ombre et fx.foule.couleur une fois par image, chacun dans sa passe, l'état GL
//   rétabli au retour ; fx.msaa === false sans recréer les cibles ; la bibliothèque d'éclairage au vignettage du monde ;
// - le décor : lots au format de pack, comparés au pack du moteur, valeurs finies, pour chaque sorte de structure et de
//   cassable ; brouillard, versions, effets de chaque évènement ;
// - le réalisateur de la démo : la ville entière d'abord et de temps en temps, puis le point le plus vivant, sans saut.
// Les originaux de FERRO se lisent de son clone (originaux-ferro.mjs) ; sans lui, c'est dit, et les comparaisons avec
// eux sont sautées, elles seules.
//   node Jeu/verifications/rendu.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { original, ABSENT, ecart, sha256, COPIE_AVANT as AVANT } from './originaux-ferro.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(ici, '..', 'src');
const charger = createRequire(import.meta.url);
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'decor.js', 'camera.js']) charger(path.join(src, f));
const PDR = globalThis.PDR;

let ok = 0, sautees = 0;
const verifier = (nom, f) => { f(); ok++; console.log('ok  ' + nom); };
const sauter = (nom, raison) => { sautees++; console.log('--  ' + nom + ' : SAUTÉ, ' + raison); };
const SOURCE = fs.readFileSync(path.join(src, 'moteur', 'renderer.js'), 'utf8');
const JEU = fs.readFileSync(path.join(src, 'jeu.js'), 'utf8');

// ---- Contexte WebGL 2 simulé. Les constantes ont les mêmes valeurs pour tous les contextes. ----
const CONSTANTES = new Map();
const constante = nom => {
  const t = /^TEXTURE(\d+)$/.exec(nom);
  if (t) return 0x84C0 + Number(t[1]);
  if (!CONSTANTES.has(nom)) CONSTANTES.set(nom, 0x9000 + CONSTANTES.size);
  return CONSTANTES.get(nom);
};
const nomConstante = v => { for (const [k, c] of CONSTANTES) if (c === v) return k; return v >= 0x84C0 && v < 0x84E0 ? 'TEXTURE' + (v - 0x84C0) : null; };
function creerContexte({ largeur = 1440, hauteur = 900, limites = {} } = {}) {
  const journal = [], ecoutes = {};
  let objets = 0;
  const parametres = { MAX_TEXTURE_SIZE: 16384, MAX_RENDERBUFFER_SIZE: 16384, MAX_SAMPLES: 4, MAX_DRAW_BUFFERS: 8,
    ALIASED_POINT_SIZE_RANGE: new Float32Array([1, 1024]), MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32, MAX_TEXTURE_IMAGE_UNITS: 16,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16, VERSION: 'WebGL 2.0 (simulé)', SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 3.00 (simulé)',
    VENDOR: 'simulé', RENDERER: 'simulé', MAX_VIEWPORT_DIMS: new Int32Array([16384, 16384]), ...limites };
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
/** Une toile sans WebGL 2 : son contexte 2D note les appels et les propriétés posées. */
function creerToile2D() {
  const journal = [];
  const degrade = () => ({ addColorStop(...a) { journal.push(['addColorStop', a]); } });
  const ctx = new Proxy({}, {
    get(_, prop) {
      if (typeof prop !== 'string') return undefined;
      return (...args) => { journal.push([prop, args]); return /^create.*Gradient$/.test(prop) ? degrade() : undefined; };
    },
    set(_, prop, v) { journal.push(['=' + String(prop), [v && typeof v === 'object' ? '(dégradé)' : v]]); return true; },
  });
  const canvas = { width: 300, height: 150, clientWidth: 960, clientHeight: 600, style: {},
    getContext: t => (t === '2d' ? ctx : null), addEventListener() {}, removeEventListener() {} };
  return { canvas, journal };
}
function chargerMoteur(source) {
  const ctx = { console, devicePixelRatio: 1, innerWidth: 1440, innerHeight: 900 };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'renderer.js' });
  return ctx.FRender;
}
const estObjet = a => a && typeof a === 'object' && 'id' in a && 'sorte' in a;
const empreinte = a => {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let h = 0x811C9DC5;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return a.constructor.name + '[' + a.length + ']' + (h >>> 0).toString(16);
};
/**
 * Un appel noté, rendu comparable : objets par sorte et numéro, uniformes par nom, constantes par nom, tableaux par
 * empreinte. numeros (Map) : les objets sont numérotés dans l'ordre où ils servent, sorte par sorte, plutôt que par
 * leur numéro de création ; deux flux où un objet naît plus tôt ou plus tard restent alors comparables.
 */
function normaliser(appel, numeros) {
  const [k, args] = appel;
  return [k, args.map(a => {
    if (estObjet(a)) {
      if (!numeros) return '#' + a.sorte + a.id;
      if (!numeros.has(a)) { const n = (numeros.get(a.sorte) || 0) + 1; numeros.set(a.sorte, n); numeros.set(a, '#' + a.sorte + '·' + n); }
      return numeros.get(a);
    }
    if (a && typeof a === 'object' && 'u' in a) return 'u:' + a.u;
    if (ArrayBuffer.isView(a)) return empreinte(a);
    if (typeof a === 'number') return nomConstante(a) && a >= 0x84C0 ? nomConstante(a) : a;
    return a;
  })];
}
const enTexte = (journal, parOrdre) => { const numeros = parOrdre ? new Map() : null; return journal.map(e => JSON.stringify(normaliser(e, numeros))); };
/** Forme courte d'un appel, pour vérifier une suite d'appels d'un seul regard. */
const signature = ([k, a]) => {
  if (k === 'activeTexture') return k + ':' + nomConstante(a[0]);
  if (k === 'enable' || k === 'disable') return k + ':' + nomConstante(a[0]);
  if (k === 'getUniformLocation') return k + ':' + a[1];
  if (a[0] && typeof a[0] === 'object' && 'u' in a[0]) return k + ':' + a[0].u + (k === 'uniform1i' || k === 'uniform1f' ? '=' + a[1] : '');
  return k;
};
function memeFlux(a, b, quoi, noms = ['original', 'copie   ']) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      assert.fail(quoi + ' : premier écart à la commande ' + i + ' sur ' + a.length + '\n  ' + noms[0] + ' ' + a[i].slice(0, 400) + '\n  ' + noms[1] + ' ' + b[i].slice(0, 400)
        + '\n  juste avant : ' + a.slice(Math.max(0, i - 4), i).map(e => e.slice(0, 90)).join(' '));
    }
  }
  assert.equal(a.length, b.length, quoi + ' : ' + a.length + ' commandes d’un côté, ' + b.length + ' de l’autre ; la suite : '
    + (a.length > b.length ? a : b).slice(n, n + 4).map(e => e.slice(0, 90)).join(' '));
}

// ---- Les réglages de création du jeu : ceux que jeu.js passe à FRender.create. ----
const reglagesLus = /const REGLAGES_MOTEUR = (\{[^}]*\});/.exec(JEU);
assert.ok(reglagesLus, 'jeu.js : REGLAGES_MOTEUR introuvable');
const REGLAGES = new Function('return ' + reglagesLus[1] + ';')();

// ---- Scènes. Chaque passage refait les siennes : le moteur garde des tampons sur les lots et range ses nappes. ----
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
/** Quelques images de la vue du jeu sur un petit monde, avec les réglages de création du jeu. */
function rendre(source, images, fxDe, options = REGLAGES) {
  const FRender = chargerMoteur(source), c = creerContexte(), debuts = [];
  const r = FRender.create(c.canvas, options);
  r.setWorld(MONDE, [], ATMOSPHERE);
  const vue = camera();
  for (let i = 0; i < images; i++) {
    debuts.push(c.journal.length);
    r.draw(vue, [{ shape: 'box', p: [2, 0.5, 2], s: [1, 1, 1], mat: 17, color: [0.5, 0.1, 0.1] }],
      { time: i / 60, frameMs: 16.7, adaptive: true, sunOnly: true, torch: false, lights: [], ...(fxDe ? fxDe(i, c.gl) : {}) });
  }
  debuts.push(c.journal.length);
  return { r, debuts, image: i => c.journal.slice(debuts[i], debuts[i + 1]), ...c };
}

/** Scène à hauteur d'homme, comme un jeu de la 0.1 en donne à FERRO : salle, dehors, lampes, acteurs, effets, arme en surimpression. */
function sceneSalle() {
  const salle = [
    { shape: 'box', p: [0, -0.05, 0], s: [40, 0.1, 40], mat: 2, ground: true },
    { shape: 'box', p: [0, 2, -10], s: [40, 4, 0.4], mat: 0 },
    { shape: 'box', p: [-14, 2, 0], s: [0.4, 4, 20], mat: 3, region: 'hall' },
    { shape: 'box', p: [6, 1, 2], s: [1.2, 2, 1.2], mat: 1, detail: 1 },
    { shape: 'cylinder', p: [-4, 1.5, -3], s: [0.5, 3, 0.5], mat: 3, detail: 2 },
    { shape: 'bevel', p: [2, 0.6, -4], s: [1, 1.2, 1], mat: 0, color: [0.5, 0.2, 0.1], surface: 'object' },
    { shape: 'foliage', p: [28, 3, 5], s: [3, 3, 3], mat: 11 },
    { shape: 'cylinder', p: [28, 1, 5], s: [0.5, 2, 0.5], mat: 10 },
    { shape: 'ring', p: [3, 0.1, 3], s: [2, 1, 2], mat: 4 },
    { shape: 'octa', p: [-2, 1, 6], s: [1, 2, 1], mat: 5, emissive: 0.4 },
    { shape: 'sphere', p: [8, 1, -6], s: [2, 2, 2], mat: 12 },
    { shape: 'box', p: [30, -0.04, 0], s: [30, 0.1, 60], mat: 8, ground: true },
    { shape: 'box', p: [34, 4, -20], s: [8, 8, 8], mat: 13.2, color: [0.8, 0.74, 0.63] },
    { shape: 'box', p: [30, 0.01, 12], s: [6, 0.02, 6], mat: 15 },
    { shape: 'bevel', p: [26, 0.7, 14], s: [2, 1.4, 4], mat: 17, color: [0.2, 0.3, 0.6], surface: 'object' },
    { shape: 'sphere', p: [24, 1.2, 10], s: [0.5, 0.5, 0.5], mat: 18, color: [0.8, 0.6, 0.5] },
  ];
  const lampes = [{ p: [0, 3.4, 0], color: [1, 0.9, 0.8], power: 8, range: 14 }, { p: [8, 3, -6], color: [0.6, 0.8, 1], power: 3 }, { p: [-12, 3, 10], power: 2 }];
  const atmosphere = { ...ATMOSPHERE, fogDensity: 0.011, outdoorZones: [{ x: 30, z: 0, w: 30, d: 60 }], longViewZones: [{ x: 30, z: 0, w: 30, d: 60, range: 120 }], biome: 'banc' };
  const acteurs = k => [
    { shape: 'bevel', p: [1 + k * 0.2, 1, -2], s: [0.6, 1.8, 0.4], mat: 0, color: [0.3, 0.3, 0.35], actorPart: true },
    { shape: 'sphere', p: [1 + k * 0.2, 2.1, -2], s: [0.4, 0.4, 0.4], mat: 6 },
    { shape: 'box', p: [25, 0.9, 6 - k * 0.3], s: [0.5, 1.8, 0.5], mat: 18, color: [0.7, 0.2, 0.2] },
    { shape: 'sphere', p: [2, 1.5, -3], s: [0.8, 0.8, 0.8], fx: true, fxFire: true, alpha: 0.8, color: [1, 0.5, 0.1], emissive: 1 },
    { shape: 'sphere', p: [2, 2.4, -3], s: [1.2, 1.2, 1.2], fx: true, fxSmoke: true, alpha: 0.5, color: [0.3, 0.3, 0.3] },
    { shape: 'octa', p: [2.2, 1.9, -3.1], s: [0.1, 0.3, 0.1], fx: true, fxSpark: true, alpha: 0.9, color: [1, 0.8, 0.3], emissive: 1 },
    { shape: 'ring', p: [0, 0.05, -5], s: [3, 1, 3], fx: true, fxPriority: 'hazard', innerRatio: 0.8, alpha: 0.6, color: [1, 0.2, 0.1] },
    { shape: 'sphere', p: [5, 1, 1], s: [1, 1, 1], fx: true, alpha: 0.001, color: [1, 1, 1] },
    { shape: 'box', p: [0.3, 1.4, -0.5], s: [0.1, 0.1, 0.6], mat: 0, overlay: true },
    { shape: 'sphere', p: [0.3, 1.45, -0.9], s: [0.1, 0.1, 0.1], fx: true, overlay: true, alpha: 0.7, color: [1, 0.9, 0.5] },
  ];
  const nappe = { sommets: new Float32Array([-5, 0.02, -5, 0, 1, 0, 0, 0, 0, 14, 0.3, 0.3, 0.3, 5, 0.02, -5, 0, 1, 0, 0, 0, 0, 14, 0.3, 0.3, 0.3,
    5, 0.02, 5, 0, 1, 0, 0, 0, 0, 15, 0.6, 0.6, 0.5, -5, 0.02, 5, 0, 1, 0, 0, 0, 0, 15, 0.6, 0.6, 0.5]), indices: [0, 1, 2, 0, 2, 3], centre: [0, 0, 0], rayon: 8 };
  const lots = [
    { objets: [{ shape: 'box', p: [6, 1, -6], s: [1, 2, 1], mat: 3 }, { shape: 'cylinder', p: [7, 1, -6], s: [0.4, 2, 0.4], mat: 0 }],
      loin: [{ shape: 'box', p: [6.5, 1, -6], s: [2, 2, 1], mat: 3 }], centre: [6.5, 1, -6], rayon: 2.5, portee: 120, bascule: 9 },
    { objets: [{ shape: 'sphere', p: [30, 2, 20], s: [3, 3, 3], mat: 9 }], centre: [30, 2, 20], rayon: 2 },
  ];
  return { salle, lampes, atmosphere, acteurs, nappe, lots };
}
/** La scène à hauteur d'homme, d'un bout à l'autre : qualités, ombres, bloom, monde modifié, nappes, lots, contexte perdu. */
function jouerSalle({ FRender, c, etape, options }) {
  const s = sceneSalle(), r = FRender.create(c.canvas, options);
  r.resize('auto');
  r.setWorld(s.salle, s.lampes, s.atmosphere);
  let k = 0;
  const cam = () => ({ pos: [k * 0.7 - 2, 1.6, 6 - k * 0.5], yaw: 0.3 + k * 0.11, pitch: -0.08, roll: k === 3 ? 0.05 : 0, fov: k === 6 ? 20 : 75 });
  const fx = () => ({ time: k / 60, frameMs: k > 12 ? 31 : 16.7, adaptive: true, shake: k === 2 ? 0.4 : 0, flash: k === 1 ? 0.6 : 0, damage: k === 4 ? 0.5 : 0,
    pulse: k === 5 ? 0.7 : 0, lights: k % 2 ? [{ p: [1, 1.2, -2], color: [1, 0.5, 0.1], power: 6, range: 9 }] : [],
    horror: k === 3 ? { eventType: 'blackout', eventAge: 0.3, eventX: 0, eventY: 3, eventZ: 0, eventIntensity: 1 } : null });
  const image = (plus = {}) => { etape('image ' + k); r.draw(cam(), s.acteurs(k), { ...fx(), ...plus }); k++; };
  image(); image(); image(); image();
  r.resize('high'); image(); image();
  r.resize('low'); image();
  r.resize(1.25); image();
  r.resize('auto'); image({ shadows: false }); image({ bloom: false }); image();
  r.updateWorld(s.salle.slice(0, 3).concat(s.salle.slice(4)), undefined, s.lampes.slice(0, 2)); image();
  r.setNappes([s.nappe]); r.setLots(s.lots); image(); image();
  const filtre = r.actorFilter(cam(), fx()); filtre(1, 1, -2, 1); filtre(400, 1, 400, 1); image();
  c.ecoutes.webglcontextlost({ preventDefault() {} }); r.draw(cam(), s.acteurs(k), fx());
  c.ecoutes.webglcontextrestored(); image(); image();
  c.canvas.clientWidth = 1024; c.canvas.clientHeight = 640; image();
  r.setWorld(s.salle, s.lampes); image(); image();      // sans atmosphère : deux lampes et la torche portent les ombres
  r.setLots([]); r.setNappes([]); image();
  etape('libération'); r.dispose(); r.draw(cam(), [], fx());
  return r;
}

/** La ville du jeu (7 îlots, toutes ses matières et toutes ses formes), vue par la caméra du jeu. */
const VILLE = PDR.ville.creerVille(1, { ilots: 7 });
const VUES = [[0, 0, 330, 0.35], [40, -60, 60, 0.6], [0, 0, 900, 0], [120, 80, 200, -1.2]];
function sceneVille() {
  const e = VILLE.etendue;
  const atmosphere = { ...ATMOSPHERE, outdoorZones: [{ x: (e.x0 + e.x1) / 2, z: (e.z0 + e.z1) / 2, w: 6000, d: 6000 }] };
  // Ce que decor.js donne aujourd'hui au moteur : des solides, des particules de fumée et de feu, des anneaux au sol.
  const dynamique = k => [
    { shape: 'box', p: [2, 0.5, 2 + k], s: [1, 1, 1], r: [0, 0.3, 0], mat: 17, color: [0.5, 0.1, 0.1], emissive: 0, outdoor: true, surface: 'object' },
    { shape: 'cylinder', p: [-8, 1.5, 4], s: [0.3, 3, 0.3], r: [0, 0, 0], mat: 0, color: [0.4, 0.4, 0.42], emissive: 0, outdoor: true, surface: 'object' },
    { shape: 'sphere', p: [4, 1.5, 3], s: [2, 2, 2], r: [0, 0, 0], mat: 7, color: [1, 0.5, 0.1], emissive: 1, alpha: 0.7, fx: true, fxFire: true, fxPriority: '', innerRatio: NaN, outdoor: true, surface: 'object' },
    { shape: 'sphere', p: [4, 4 + k * 0.1, 3], s: [3, 3, 3], r: [0, 0, 0], mat: 7, color: [0.3, 0.3, 0.3], emissive: 0, alpha: 0.4, fx: true, fxFire: false, fxPriority: '', innerRatio: NaN, outdoor: true, surface: 'object' },
    { shape: 'ring', p: [10, 0.1, -4], s: [8, 1, 8], r: [0, 0, 0], mat: 7, color: [1, 0.3, 0.1], emissive: 0.5, alpha: 0.6, fx: true, fxFire: false, fxPriority: 'hazard', innerRatio: 0.85, outdoor: true, surface: 'object' },
  ];
  const lumieres = k => (k % 2 ? [{ p: [4, 2, 3], color: [1, 0.55, 0.2], power: 10, range: 18 }] : []);
  // Une foule déjà empaquetée (fx.instances), au format de pack : drapeaux « dehors » et « objet ».
  const ligne = (x, z, mat, r, g, b) => [x, 0.9, z, mat, 0.5, 1.8, 0.5, 0, 0, 0, 0, 6, r, g, b, 1];
  const instances = { values: new Float32Array([...ligne(1, 1, 18, 0.9, 0.3, 0.2), ...ligne(2, 1, 18, 0.9, 0.6, 0.2), ...ligne(3, 2, 17, 0.2, 0.4, 0.9)]),
    groups: [{ name: 'box', offset: 0, count: 2 }, { name: 'sphere', offset: 128, count: 1 }] };
  return { atmosphere, dynamique, lumieres, instances };
}
/** La ville vue de haut, comme jeu.js la demande : caméra RTS, soleil seul, sans torche ; qualités, ombres, bloom. */
function jouerVille({ FRender, c, etape, options }) {
  const s = sceneVille(), r = FRender.create(c.canvas, options);
  r.resize('auto');
  r.setWorld(VILLE.objets, [], s.atmosphere);
  const cam = PDR.camera.creerCamera(c.canvas, VILLE.etendue, SOLEIL);
  let k = 0;
  const image = (plus = {}) => {
    cam.placer(...VUES[k % VUES.length]);
    etape('image ' + k);
    r.draw(cam.vue(1 / 60), s.dynamique(k), { time: k / 60, frameMs: 16.7, adaptive: true, sunOnly: true, torch: false, lights: s.lumieres(k),
      instances: k >= 2 ? s.instances : null, ...plus });
    k++;
  };
  image(); image(); image(); image(); image();
  r.resize('high'); image(); image();
  r.resize('low'); image();
  r.resize('auto'); image({ shadows: false }); image({ bloom: false }); image({ shadows: false, bloom: false }); image();
  c.ecoutes.webglcontextlost({ preventDefault() {} });
  c.ecoutes.webglcontextrestored(); image(); image();
  etape('libération'); r.dispose();
  return r;
}
function jouer(source, scenario, options, contexte) {
  const FRender = chargerMoteur(source), c = creerContexte(contexte), etapes = [];
  const rendu = scenario({ FRender, c, options, etape: nom => etapes.push([nom, c.journal.length]) });
  return { ...(rendu.r ? rendu : { r: rendu }), etapes, ...c };
}

// ---- Le moteur : la copie de FERRO 0.2 et ses retouches. ----
verifier('moteur : retouches marquées « PDR (nom) », bibliothèque d’éclairage et points d’accroche exposés, réglages du jeu', () => {
  for (const nom of ['origine', 'voile', 'éclairage', 'lots', 'foule', 'msaa']) assert.ok(SOURCE.includes('PDR (' + nom + ')'), 'marque PDR (' + nom + ')');
  for (const mot of ['fx.voile', 'fx.lots', 'fx.foule.ombre', 'fx.foule.couleur', 'fx.msaa', 'renderer.gl', 'renderer.pdr']) assert.ok(SOURCE.includes(mot), mot);
  // Ce que jeu.js passe à la création, et les champs qu'il pose sur fx et que la caméra pose sur la vue : le moteur les lit tous.
  assert.deepEqual(REGLAGES, { msaa: 4, shadowMapScale: 2, vignette: 0.84, bloomThreshold: [0.86, 0.98] });
  assert.ok(JEU.includes('FRender.create(canvas, REGLAGES_MOTEUR)'), 'jeu.js crée le moteur avec ses réglages');
  for (const option of Object.keys(REGLAGES)) assert.ok(SOURCE.includes('o.' + option), 'réglage de création ' + option);
  const champsFx = new Set([...JEU.matchAll(/\bfx\.([a-zA-Z]+) = /g)].map(m => m[1]));
  for (const m of /const fx = \{([^}]*)\}/.exec(JEU)[1].matchAll(/([a-zA-Z]+):/g)) champsFx.add(m[1]);
  assert.deepEqual([...champsFx].sort(), ['adaptive', 'bloom', 'foule', 'frameMs', 'lights', 'lots', 'msaa', 'shadows', 'sunOnly', 'time', 'torch', 'voile']);
  for (const champ of champsFx) assert.ok(SOURCE.includes('fx.' + champ), 'fx.' + champ + ' lu par le moteur');
  const vue = camera();
  assert.deepEqual(Object.keys(vue).sort(), ['D', 'allStatic', 'axes', 'cible', 'far', 'fov', 'near', 'pitch', 'pos', 'roll', 'sun', 'yaw']);
  for (const champ of ['pos', 'yaw', 'pitch', 'roll', 'fov', 'near', 'far', 'allStatic', 'sun']) assert.ok(SOURCE.includes('camera.' + champ), 'camera.' + champ + ' lu par le moteur');
  assert.deepEqual(Object.keys(vue.sun).sort(), ['center', 'depth', 'extent']);
  const { r, journal } = rendre(SOURCE, 1);
  assert.deepEqual(Object.keys(r).sort(), ['actorFilter', 'dispose', 'draw', 'gl', 'pdr', 'resize', 'setLots', 'setNappes', 'setWorld', 'stats', 'updateWorld']);
  assert.ok(r.gl && r.pdr && typeof r.pdr.programme === 'function' && typeof r.pdr.lier === 'function');
  for (const f of ['pdrOmbreSoleil', 'pdrEclairer', 'pdrFinir']) assert.ok(r.pdr.glsl.includes('vec3 ' + f) || r.pdr.glsl.includes('float ' + f), f);
  assert.ok(r.pdr.uniformes.length >= 16);
  assert.equal(r.stats.msaa, 4);
  // Les réglages arrivent dans les shaders ; la bibliothèque d'éclairage de la foule prend le vignettage du monde.
  const textes = journal.filter(([k]) => k === 'shaderSource').map(([, a]) => a[1]);
  assert.ok(textes[1].includes('color*=mix(0.8400,1.,vignette);') && !textes[1].includes('mix(.59,1.,'), 'vignettage du monde à 0,84');
  assert.ok(textes[5].includes('smoothstep(0.8600,0.9800,max(max(c.r,c.g),c.b))'), 'seuil du bloom de 0,86 à 0,98');
  assert.ok(r.pdr.glsl.includes('couleur*mix(0.8400,1.,') && !r.pdr.glsl.includes('.59'), 'vignettage de la foule à 0,84');
  const nu = rendre(SOURCE, 1, null, null);
  assert.ok(nu.r.pdr.glsl.includes('couleur*mix(.59,1.,') && nu.r.stats.msaa === 0, 'sans réglage : le vignettage de FERRO, pas de MSAA');
  const provenance = fs.readFileSync(path.join(src, 'moteur', 'PROVENANCE.md'), 'utf8');
  for (const mot of ['fx.voile', 'fx.lots', 'fx.foule', 'fx.msaa', 'renderer.pdr', 'renderer.gl']) assert.ok(provenance.includes(mot), 'PROVENANCE : ' + mot);
});

// Le shader du monde de la copie, moins les deux blocs du voile : c'est celui de FERRO.
const sansVoile = s => s
  .replace(/\n {2}\/\/ PDR \(voile\) : [^\n]*\n {2}uniform sampler2D uVoile;\n {2}uniform vec4 uVoileZone;\n {2}uniform float uVoileForce;/, '')
  .replace(/\n {4}\/\/ PDR \(voile\) : [^\n]*\n {4}if\(uVoileForce>0\.&&outdoors>\.5\)\{\n[\s\S]*?\n {4}\}/, '');
const VOILE_DECLARE = 'getUniformLocation:uVoile getUniformLocation:uVoileZone getUniformLocation:uVoileForce useProgram uniform1i:uVoile=4 '
  + 'activeTexture:TEXTURE4 bindTexture activeTexture:TEXTURE0';
/** Le flux de la copie, moins ce que le voile du jeu déclare à chaque création du contexte ; son motif exact est vérifié. */
function sansVoileDeclare(journal) {
  const sortie = [];
  let creations = 0;
  for (let i = 0; i < journal.length; i++) {
    const [k, a] = journal[i];
    if (k === 'getUniformLocation' && a[1] === 'uVoile') {
      assert.equal(journal.slice(i, i + 8).map(signature).join(' '), VOILE_DECLARE);
      // La texture blanche vient de naître : c'est la dernière liée, et son pixel vient d'être écrit.
      let j = i - 1;
      while (j > 0 && journal[j][0] !== 'bindTexture') j--;
      assert.ok(journal[i - 1][0] === 'texImage2D' && journal[i + 6][1][1] === journal[j][1][1], 'l’unité 4 reçoit la texture blanche');
      creations++; i += 7;
      continue;
    }
    if (k === 'shaderSource' && a[1].includes('uVoile')) {
      const retire = sansVoile(a[1]);
      assert.ok(!retire.includes('Voile') && retire.length < a[1].length - 300, 'les deux blocs du voile se retirent du shader du monde');
      sortie.push([k, [a[0], retire]]);
      continue;
    }
    sortie.push(journal[i]);
  }
  return { sortie, creations };
}

const v02 = original('v0.2');
if (!v02) {
  sauter('moteur : mêmes commandes GPU que FERRO 0.2, sans réglage puis avec ceux du jeu', ABSENT);
} else {
  verifier('moteur : sans réglage ni champ du jeu, puis avec les réglages du jeu, les commandes GPU de FERRO 0.2, image après image', () => {
    const cas = [
      ['scène à hauteur d’homme, sans réglage', jouerSalle, undefined, 2],
      ['scène à hauteur d’homme, réglages du jeu', jouerSalle, REGLAGES, 2],
      ['ville vue de haut, sans réglage', jouerVille, undefined, 2],
      ['ville vue de haut, réglages du jeu', jouerVille, REGLAGES, 2],
      ['ville, réglages hors bornes ou à moitié', jouerVille, { msaa: 8, shadowMapScale: 3, vignette: 1.7, bloomThreshold: [0.9, 0.5] }, 2],
      ['ville, vignettage et seuil seuls', jouerVille, { vignette: 0.7, bloomThreshold: [0.5, 0.9] }, 2],
      ['ville, GPU sans MSAA et à petites textures', jouerVille, REGLAGES, 2, { limites: { MAX_SAMPLES: 0, MAX_TEXTURE_SIZE: 2048 } }],
    ];
    let total = 0;
    for (const [nom, scenario, options, creations, contexte] of cas) {
      const a = jouer(v02.texte, scenario, options, contexte), b = jouer(SOURCE, scenario, options, contexte);
      const copie = sansVoileDeclare(b.journal);
      assert.equal(copie.creations, creations, nom + ' : le voile déclaré une fois par création du contexte');
      memeFlux(enTexte(a.journal), enTexte(copie.sortie), nom);
      assert.deepEqual(b.etapes.map(e => e[0]), a.etapes.map(e => e[0]));
      // Passé la création, pas une commande de plus : les étapes commencent aux mêmes endroits, au voile déclaré près.
      const decalage = (i, n) => b.etapes[i][1] - a.etapes[i][1] === 8 * n;
      assert.ok(decalage(0, 1) && decalage(a.etapes.length - 1, creations), nom + ' : huit commandes par création, aucune par image');
      for (const cle of ['drawCalls', 'triangles', 'instances', 'msaa', 'bloom', 'shadows', 'shadowMaps', 'lots', 'lotsVisibles', 'nappeTriangles', 'uploadBytes', 'width', 'height']) {
        assert.deepEqual(b.r.stats[cle], a.r.stats[cle], nom + ' : stats.' + cle);
      }
      assert.ok(a.journal.filter(([k]) => k === 'drawElementsInstanced').length >= 40, nom + ' : assez de dessins pour que la comparaison dise quelque chose');
      total += a.journal.length;
    }
    console.log('    ' + total + ' commandes identiques sur ' + cas.length + ' passages (création, images, contexte perdu et rendu, libération), source : ' + v02.source);
  });

  verifier('repli Canvas 2D : sans WebGL 2, le rendu logiciel de FERRO 0.2, appel pour appel, sans gl ni pdr', () => {
    const dessiner = source => {
      const t = creerToile2D(), s = sceneSalle(), r = chargerMoteur(source).create(t.canvas, REGLAGES);
      r.resize('auto'); r.setWorld(s.salle, s.lampes, s.atmosphere);
      for (let k = 0; k < 3; k++) r.draw({ pos: [k - 2, 1.6, 6], yaw: 0.3, pitch: -0.08, fov: 75 }, s.acteurs(k), { time: k / 60, lights: [] });
      r.resize('low'); r.draw({ pos: [20, 1.6, 6], yaw: 1.2, pitch: 0, fov: 12 }, s.acteurs(3), { time: 0.1, damage: 0.4, pulse: 0.5 });
      return { r, journal: t.journal };
    };
    const a = dessiner(v02.texte), b = dessiner(SOURCE);
    assert.equal(b.r.stats.backend, 'canvas2d');
    assert.ok(!('gl' in b.r) && !('pdr' in b.r) && !('setLots' in b.r), 'le rendu logiciel n’a ni gl, ni pdr, ni lots : jeu.js le refuse à son seul backend');
    memeFlux(enTexte(a.journal), enTexte(b.journal), 'rendu logiciel');
    assert.ok(a.journal.filter(([k]) => k === 'fill').length > 300, 'assez de faces peintes pour que la comparaison dise quelque chose');
    console.log('    ' + a.journal.length + ' appels Canvas 2D identiques sur 4 images');
  });
}

verifier('retouches du jeu : foule appelée dans chaque passe, état GL rétabli, lots envoyés selon leur version, voile posé puis retiré', () => {
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
      appels.push(['couleur', v.vp.length, v.focale, v.ombre.unite, v.ombre.active, v.lumieres.positions.length, v.msaa, v.glsl]);
      gl.useProgram({ id: 'foule', sorte: 'Program' }); gl.bindVertexArray(null); gl.disable(constante('DEPTH_TEST'));
      gl.depthMask(false); gl.enable(constante('BLEND')); gl.drawArrays(constante('POINTS'), 0, 7);
      return { appels: 1, triangles: 0, instances: 7 };
    },
  };
  // Images 0 à 2 : foule, lot et voile ; image 3 : plus de voile ; image 4 : plus rien du jeu.
  const s = rendre(SOURCE, 5, (i, gl) => {
    if (i === 2) lot.version++;
    voileTex = voileTex || gl.createTexture();
    if (i === 4) return {};
    return { foule, lots: [lot], voile: i < 3 ? { texture: voileTex, origine: [-100, -50], taille: [200, 100], force: 0.6 } : null };
  });
  assert.deepEqual(appels.map(a => a[0]), ['ombre', 'couleur', 'ombre', 'couleur', 'ombre', 'couleur', 'ombre', 'couleur']);
  for (const a of appels) if (a[0] === 'ombre') assert.ok(a[1] === 16 && a[2].length === 4 && a[3] === true);
  for (const a of appels) if (a[0] === 'couleur') assert.ok(a[1] === 16 && a[2] > 100 && a[3] === 2 && a[4] === true && a[5] === 36 && a[6] === 4 && a[7] === s.r.pdr.glsl);
  // Après la passe couleur de la foule, le moteur reprend son programme et son état.
  const j = s.journal.map(e => JSON.stringify(normaliser(e)));
  const apres = j.findIndex(e => e.includes('"POINTS",0,7')) + 1;
  const suite = j.slice(apres, apres + 12).join(' ');
  for (const attendu of ['"useProgram",["#Program', '"bindVertexArray",["#VertexArray', '"enable",["DEPTH_TEST"]', '"depthFunc",["LEQUAL"]',
    '"enable",["CULL_FACE"]', '"depthMask",[true]', '"disable",["BLEND"]', '"activeTexture",["TEXTURE2"]']) assert.ok(suite.includes(attendu), attendu + ' dans ' + suite);
  // Dans la passe d'ombre, le biais est rétabli pour le lot et la foule, et le moteur reprend son programme de profondeur.
  const ombre = j.findIndex(e => e.includes('"POINTS",0,1'));
  assert.ok(j.slice(ombre - 16, ombre).includes('["enable",["POLYGON_OFFSET_FILL"]]'), 'biais actif pour la foule');
  const suiteOmbre = j.slice(ombre + 1, ombre + 9).join(' ');
  for (const attendu of ['"useProgram",["#Program', '"bindVertexArray",["#VertexArray', '"enable",["DEPTH_TEST"]', '"depthMask",[true]', '"disable",["BLEND"]',
    '"disable",["POLYGON_OFFSET_FILL"]']) assert.ok(suiteOmbre.includes(attendu), attendu + ' dans ' + suiteOmbre);
  // Le lot : envoyé à la première image, pas à la deuxième, de nouveau à la troisième (version changée) ; dessiné deux
  // fois par image (ombre du soleil, couleur), pour chacune de ses deux formes.
  const envois = s.journal.map(([k, a], i) => (k === 'bufferData' && a[1] === lot.values ? i : -1)).filter(i => i >= 0);
  assert.equal(envois.length, 2);
  assert.ok(envois[0] >= s.debuts[0] && envois[0] < s.debuts[1] && envois[1] >= s.debuts[2] && envois[1] < s.debuts[3]);
  const dessins = i => s.image(i).filter(([k]) => k === 'drawElementsInstanced').length;
  assert.equal(dessins(0) - dessins(4), 4, 'le lot ajoute quatre dessins par image');
  // Le voile : sur l'unité 4 avec sa zone et sa force tant qu'il est passé ; retiré une fois ; puis plus une commande.
  const voile = i => s.image(i).filter(([k, a]) => k === 'activeTexture' && a[0] === constante('TEXTURE4')).length;
  assert.deepEqual([0, 1, 2, 3, 4].map(voile), [1, 1, 1, 1, 0]);
  const pose = (i, n) => { const im = s.image(i), d = im.findIndex(([k, a]) => k === 'activeTexture' && a[0] === constante('TEXTURE4')); return im.slice(d, d + n); };
  assert.equal(pose(1, 5).map(signature).join(' '), 'activeTexture:TEXTURE4 bindTexture uniform4f:uVoileZone uniform1f:uVoileForce=0.6 activeTexture:TEXTURE2');
  assert.equal(pose(1, 5)[1][1][1], voileTex);
  assert.deepEqual(pose(1, 5)[2][1].slice(1), [-100, -50, 1 / 200, 1 / 100]);
  assert.equal(pose(3, 4).map(signature).join(' '), 'activeTexture:TEXTURE4 bindTexture uniform1f:uVoileForce=0 activeTexture:TEXTURE2');
  assert.notEqual(pose(3, 4)[1][1][1], voileTex, 'la texture blanche reprend l’unité 4');
  assert.ok(s.r.stats.drawCalls > 0 && s.r.stats.pdrLotInstances === 0);
  // L'image 4, sans rien du jeu, est l'image que le moteur dessinait avant qu'on lui passe quoi que ce soit.
  const seule = rendre(SOURCE, 2);
  memeFlux(enTexte(seule.image(1), true).filter(e => !e.includes('uEffects') && !e.includes('uWindTime') && !e.includes('uSkyMotion') && !e.includes('uTime')),
    enTexte(s.image(4), true).filter(e => !e.includes('uEffects') && !e.includes('uWindTime') && !e.includes('uSkyMotion') && !e.includes('uTime')),
    'image sans champ du jeu', ['seule', 'après ']);
  // Contexte perdu puis rendu : la génération change, les tampons des lots sont à refaire, le voile est déclaré de nouveau.
  const g = s.r.pdr.generation, avant = s.journal.length;
  s.ecoutes.webglcontextrestored();
  assert.equal(s.r.pdr.generation, g + 1);
  assert.equal(sansVoileDeclare(s.journal.slice(avant)).creations, 1);
  s.r.draw(camera(), [], { time: 1, sunOnly: true, torch: false, lots: [lot], foule });
  assert.equal(s.journal.slice(avant).filter(([k, a]) => k === 'bufferData' && a[1] === lot.values).length, 1, 'le lot repart dans le nouveau contexte');
  // Libération : le tampon du lot est rendu.
  const tampon = s.journal.slice(avant).find(([k, a], i, t) => k === 'bindBuffer' && t[i + 1] && t[i + 1][0] === 'bufferData' && t[i + 1][1][1] === lot.values)[1][1];
  const fin = s.journal.length;
  s.r.dispose();
  assert.ok(s.journal.slice(fin).some(([k, a]) => k === 'deleteBuffer' && a[0] === tampon), 'tampon du lot supprimé');
});

verifier('retouche du jeu : fx.msaa === false dessine sans anticrénelage, sans recréer une seule cible', () => {
  const foule = { ombre: () => null, couleur(gl, v) { foule.msaa.push(v.msaa); return null; }, msaa: [] };
  const s = rendre(SOURCE, 4, i => ({ msaa: i === 1 || i === 2 ? false : undefined, foule }));
  const noms = i => s.image(i).map(e => e[0]);
  assert.deepEqual([0, 1, 2, 3].map(i => noms(i).filter(k => k === 'blitFramebuffer').length), [1, 0, 0, 1]);
  assert.deepEqual(foule.msaa, [4, 0, 0, 4]);
  for (const i of [1, 2, 3]) assert.ok(!noms(i).some(k => /^create|^delete|Storage/.test(k)), 'image ' + i + ' : aucune cible créée ni supprimée');
  // La scène part alors droit dans la cible du post-traitement, celle que le MSAA remplit d'ordinaire par copie.
  const cibles = i => s.image(i).filter(([k]) => k === 'bindFramebuffer').map(([, a]) => a[1]);
  const copie = s.image(0).findIndex(([k]) => k === 'blitFramebuffer');
  const scene = s.image(0)[copie - 1][1][1], msaa = s.image(0)[copie - 2][1][1];
  assert.ok(cibles(0).includes(msaa) && cibles(1).includes(scene) && !cibles(1).includes(msaa));
  assert.equal(s.r.stats.msaa, 4, 'la cible MSAA reste prête');
  if (v02) {
    // Ces images-là sont celles de FERRO créé sans msaa : mêmes commandes, objets pris dans l'ordre où ils servent.
    const sans = rendre(v02.texte, 3, () => ({}), { ...REGLAGES, msaa: 0 });
    const hooks = rendre(SOURCE, 3, i => ({ msaa: i > 0 ? false : undefined }));
    memeFlux(enTexte(sans.image(1).concat(sans.image(2)), true), enTexte(hooks.image(1).concat(hooks.image(2)), true), 'images sans MSAA', ['FERRO sans msaa', 'copie, fx.msaa ']);
  }
});

// ---- Le passage de la copie d'avant à celle-ci, sur des images du jeu. ----
let avant = null;
try {
  const octets = execFileSync('git', ['show', AVANT.commit + ':Jeu/src/moteur/renderer.js'], { cwd: path.join(ici, '..', '..'), stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
  if (sha256(octets) === AVANT.sha256) avant = octets.toString('utf8');
} catch (e) { avant = null; }

/** Des images du jeu : ville, caméra RTS, soleil seul, lots, foule, voile, foule empaquetée ; MSAA, ombres et bloom coupés tour à tour. */
function jouerJeu({ FRender, c, etape, options }) {
  const s = sceneVille(), r = FRender.create(c.canvas, options);
  r.resize('auto');
  r.setWorld(VILLE.objets, [], s.atmosphere);
  const cam = PDR.camera.creerCamera(c.canvas, VILLE.etendue, SOLEIL);
  const lots = ['cassables', 'structures'].map(nom => PDR.decor.creerLot(nom));
  lots[0].debut(); lots[0].mettre(0, 1, 1, 1, 2, 2, 2, 0, 0, 0, 7, 0.5, 0.5, 0.5, 0); lots[0].mettre(2, 4, 1, 1, 1, 2, 1, 0, 0, 0, 0, -1, 0, 0, 0); lots[0].fin();
  lots[1].debut(); lots[1].mettre(5, 8, 1, -3, 2, 2, 2, 0, 0.4, 0, 17, 0.9, 0.3, 0.2, 0); lots[1].fin();
  const tex = { voile: null, foule: { id: 'foule', sorte: 'Program' } };
  const foule = {
    ombre(gl) { gl.useProgram(tex.foule); gl.bindVertexArray(null); gl.drawArrays(gl.POINTS, 0, 3); return { appels: 1, triangles: 6, instances: 3 }; },
    couleur(gl, v) {
      gl.useProgram(tex.foule); gl.activeTexture(gl.TEXTURE5); gl.uniform2f({ u: 'essai' }, v.largeur, v.msaa);
      gl.disable(gl.CULL_FACE); gl.depthMask(false); gl.enable(gl.BLEND); gl.drawArrays(gl.POINTS, 0, 9);
      return { appels: 1, triangles: 0, instances: 9 };
    },
  };
  let k = 0;
  const image = (plus = {}) => {
    cam.placer(...VUES[k % VUES.length]);
    tex.voile = tex.voile || c.gl.createTexture();
    if (k === 3) { lots[1].debut(); lots[1].mettre(5, 8, 1, -3, 2, 3, 2, 0, 0.4, 0, 17, 0.9, 0.3, 0.2, 0); lots[1].fin(); }
    etape('image ' + k);
    r.draw(cam.vue(1 / 60), s.dynamique(k), { time: k / 60, frameMs: 16.7, adaptive: true, sunOnly: true, torch: false, shadows: true, bloom: true, msaa: true,
      lights: s.lumieres(k), lots, foule, instances: k % 3 === 2 ? s.instances : null,
      voile: (k >= 2 && k < 9) || k >= 16 ? { texture: tex.voile, origine: [-300, -300], taille: [600, 600], force: 0.62 } : null, ...plus });
    k++;
  };
  image({ lots: null, foule: null }); image({ foule: null }); image(); image(); image();
  image({ msaa: false }); image({ shadows: false }); image({ bloom: false }); image({ shadows: false, bloom: false, msaa: false });
  image(); image({ lots: null, foule: null });
  r.resize('high'); image(); image({ msaa: false });
  r.resize('low'); image(); image();
  r.resize('auto'); image();
  c.ecoutes.webglcontextlost({ preventDefault() {} });
  c.ecoutes.webglcontextrestored(); tex.voile = null; image(); image(); image({ voile: null });
  etape('libération'); r.dispose();
  return { r, instances: s.instances.values };
}
/**
 * Ce qui sépare les deux copies sur ces images, retiré de chaque flux, compté et vérifié à son motif. Le reste doit être
 * identique, les objets étant pris dans l'ordre où ils servent.
 */
function sansEcartsConnus(journal, nouvelle, instances) {
  const sortie = [], compte = {};
  const noter = (nom, n = 1) => { compte[nom] = (compte[nom] || 0) + n; };
  for (let i = 0; i < journal.length; i++) {
    const [k, a] = journal[i];
    // 1. Le texte des shaders : comparé à part, ligne à ligne.
    if (k === 'shaderSource') { sortie.push([k, [a[0], '(texte comparé à part)']]); continue; }
    // 2. Le tampon de la foule empaquetée (fx.instances). Avant : créé d'office, cinquième des huit tampons que la
    //    création demande d'affilée. Maintenant : créé à la première image qui passe fx.instances, juste avant son envoi.
    if (k === 'createBuffer' && !nouvelle && (i === 0 || journal[i - 1][0] !== 'createBuffer')) {
      let n = 1;
      while (journal[i + n] && journal[i + n][0] === 'createBuffer') n++;
      if (n === 8) { for (let q = 0; q < 7; q++) sortie.push(journal[i]); noter('tampon de fx.instances créé d’office'); i += 7; continue; }
    }
    if (k === 'createBuffer' && nouvelle && journal[i + 2] && journal[i + 1][0] === 'bindBuffer' && journal[i + 2][0] === 'bufferData' && journal[i + 2][1][1] === instances) {
      noter('tampon de fx.instances créé au premier usage'); continue;
    }
    // 3. Le voile : ses trois uniformes sont cherchées plus tard dans la création ; la nouvelle copie y pose une fois
    //    l'échantillonneur sur l'unité 4, l'ancienne le posait à chaque image, voile ou pas.
    if (k === 'getUniformLocation' && /^uVoile/.test(a[1])) { noter('uniformes du voile cherchées'); continue; }
    if (nouvelle && k === 'useProgram' && journal.slice(i, i + 5).map(signature).join(' ') === VOILE_DECLARE.split(' ').slice(3).join(' ')) {
      noter('voile déclaré à la création'); i += 4; continue;
    }
    if (k === 'activeTexture' && a[0] === constante('TEXTURE4')) {
      const suite = journal.slice(i, i + 6).map(signature), fin = suite.indexOf('activeTexture:TEXTURE2');
      const corps = suite.slice(2, fin).join(' '), force = journal[i + fin - 1][1][1];
      assert.ok(fin >= 3 && suite[1] === 'bindTexture', 'pose du voile : ' + suite.join(' '));
      const attendu = (nouvelle ? '' : 'uniform1i:uVoile=4 ') + (force > 0 ? 'uniform4f:uVoileZone ' : '') + 'uniform1f:uVoileForce=' + force;
      assert.equal(corps, attendu, 'pose du voile');
      if (force > 0) { noter('voile posé (force > 0)'); sortie.push(['(voile)', [journal[i + 1][1][1], ...journal[i + 2 + (nouvelle ? 0 : 1)][1].slice(1), force]]); }
      else noter(nouvelle ? 'voile retiré (force 0)' : 'voile posé à force nulle');
      i += fin;
      continue;
    }
    // 4. Ombre du soleil : FERRO coupe le biais après ses propres dessins ; la copie le rétablit pour les lots et la foule.
    if (nouvelle && signature(journal[i]) === 'disable:POLYGON_OFFSET_FILL' && journal[i + 1] && signature(journal[i + 1]) === 'enable:POLYGON_OFFSET_FILL') {
      noter('biais coupé puis rétabli'); i++; continue;
    }
    sortie.push(journal[i]);
  }
  return { sortie, compte };
}

if (!avant) {
  sauter('passage : mêmes commandes que la copie d’avant sur des images du jeu', 'la copie du commit ' + AVANT.commit + ' est introuvable (pas d’historique git ici)');
} else {
  verifier('passage : sur des images du jeu, les commandes GPU de la copie d’avant (' + AVANT.commit + '), aux écarts connus près', () => {
    const a = jouer(avant, jouerJeu, undefined), b = jouer(SOURCE, jouerJeu, REGLAGES);
    const ca = sansEcartsConnus(a.journal, false), cb = sansEcartsConnus(b.journal, true, b.instances);
    memeFlux(enTexte(ca.sortie, true), enTexte(cb.sortie, true), 'passage', ['avant', 'après']);
    // Les écarts, un par un.
    const images = a.etapes.length - 1, creations = 2;
    assert.equal(ca.compte['tampon de fx.instances créé d’office'], creations);
    assert.equal(cb.compte['tampon de fx.instances créé au premier usage'], creations, 'le même tampon, né plus tard');
    assert.equal(ca.compte['uniformes du voile cherchées'], 3 * creations);
    assert.equal(cb.compte['uniformes du voile cherchées'], 3 * creations);
    assert.equal(cb.compte['voile déclaré à la création'], creations);
    assert.equal(ca.compte['voile posé (force > 0)'], cb.compte['voile posé (force > 0)']);
    assert.equal(ca.compte['voile posé (force > 0)'] + ca.compte['voile posé à force nulle'], images, 'avant : le voile posé à chaque image, même nul');
    assert.equal(cb.compte['voile retiré (force 0)'], 2, 'après : retiré une fois quand il cesse');
    assert.ok(cb.compte['biais coupé puis rétabli'] > 8 && !ca.compte['biais coupé puis rétabli']);
    for (const cle of ['drawCalls', 'triangles', 'instances', 'msaa', 'bloom', 'shadows', 'shadowMaps', 'pdrLotInstances', 'crowdInstances', 'width', 'height']) {
      assert.deepEqual(b.r.stats[cle], a.r.stats[cle], 'stats.' + cle);
    }
    const total = a.journal.length, communes = ca.sortie.length;
    console.log('    ' + communes + ' commandes identiques sur ' + total + ' (' + images + ' images, deux créations) ; écarts de la copie d’avant : '
      + Object.entries(ca.compte).map(([k, v]) => k + ' ' + v).join(', ') + ' ; de la nouvelle : ' + Object.entries(cb.compte).map(([k, v]) => k + ' ' + v).join(', '));

    // Les shaders : dix textes par création. Ce qui change, hors commentaires et écriture des deux réglages, est ce que
    // METAL a changé entre 0.6 et 0.8, ni plus ni moins.
    const textes = j => j.filter(([k]) => k === 'shaderSource').map(([, t]) => t[1]).slice(0, 10);
    const net = t => t.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
      .replace('color*=mix(0.8400,1.,vignette);', 'color*=mix(.84,1.,vignette);').replace('smoothstep(0.8600,0.9800,', 'smoothstep(.86,.98,');
    const ta = textes(a.journal).map(net), tb = textes(b.journal).map(net);
    const NOMS = ['monde, sommets', 'monde, fragments', 'profondeur, sommets', 'profondeur, fragments', 'post, sommets', 'post, fragments', 'ciel, sommets', 'ciel, fragments', 'effets, sommets', 'effets, fragments'];
    const change = ta.map((t, i) => (t === tb[i] ? null : NOMS[i])).filter(Boolean);
    assert.deepEqual(change, ['monde, sommets', 'monde, fragments', 'profondeur, sommets', 'effets, sommets', 'effets, fragments']);
    const base = original('metal-0.6'), v01 = original('v0.1');
    if (!base || !v01) { console.log('    shaders : ' + change.length + ' textes changés ; comparaison avec l’évolution de METAL SAUTÉE, ' + ABSENT); return; }
    const deMetal = s => textes(jouer(s, ({ FRender, c }) => FRender.create(c.canvas), undefined).journal).map(net);
    const m06 = deMetal(base.texte), m08 = deMetal(v01.texte);
    let lignes = 0;
    for (let i = 0; i < 10; i++) {
      const jeu = ecart(ta[i], tb[i]), metal = ecart(m06[i], m08[i]);
      assert.deepEqual(jeu.moins, metal.moins, NOMS[i] + ' : lignes retirées');
      assert.deepEqual(jeu.plus, metal.plus, NOMS[i] + ' : lignes ajoutées');
      lignes += jeu.moins.length + jeu.plus.length;
    }
    console.log('    shaders : ' + change.length + ' textes changés, ' + lignes + ' lignes, celles que METAL a changées de 0.6 à 0.8 (étiquettes metal-0.6 et v0.1)');
  });
}

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

console.log(ok + ' vérifications du rendu réussies' + (sautees ? ', ' + sautees + ' sautée(s)' : ''));
