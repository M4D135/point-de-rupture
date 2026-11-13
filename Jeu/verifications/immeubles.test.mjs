// Vérifie le module des immeubles (sim/immeubles.js) : voisins, prise, propagation, cocktail, plafond,
// déterminisme, pres, extinction, évènement 39, exporter, compter, calciné, immeuble tourné, sens du lacet,
// reprise après extinction, coût de création sur 4 000 immeubles.
//   node Jeu/verifications/immeubles.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ici = path.dirname(fileURLToPath(import.meta.url));
const src = f => path.join(ici, '..', 'src', f);
const exiger = createRequire(import.meta.url);
for (const f of ['sim/regles.js', 'sim/immeubles.js']) exiger(src(f));
const { immeubles: M, regles } = globalThis.PDR;
const R = regles.CONSTANTES.IMMEUBLES;

let ok = 0;
const verifier = (nom, f) => { const t0 = performance.now(); f(); ok++; console.log(`ok  ${nom} (${((performance.now() - t0) / 1000).toFixed(1)} s)`); };

const b = (id, x, z) => ({ id, x, z, rayon: 6, h: 12, boites: [{ x, z, lx: 8, lz: 8, lacet: 0 }], pieces: [] });
const v = (I, k) => Array.from(I.V.slice(I.debutV[k], I.debutV[k + 1]));

verifier('voisins', () => {
  const I = M.creer([b(10, 0, 0), b(11, 9, 0), b(12, 60, 0)]);
  assert.equal(I.n, 3);
  assert.deepEqual(v(I, 0), [1], 'voisins de 0');
  assert.deepEqual(v(I, 1), [0], 'voisins de 1');
  assert.deepEqual(v(I, 2), [], 'voisins de 2');
});

verifier('prise après 15 s de chauffe', () => {
  const I = M.creer([b(10, 0, 0), b(11, 9, 0), b(12, 60, 0)]);
  const e = [];
  for (let t = 0; t < 16; t++) { M.chauffer(I, 0, 5, 1, 1, 0, e); M.avancer(I, 1, e); }
  assert.equal(I.etat[0], 1, 'pris après 16 s à 1 m');
  assert.equal(I.enFeu, 1);
  assert.ok(e.some(x => x.type === 38 && x.a === 10 && x.b === 0), 'évènement 38');
});

verifier('propagation au voisin', () => {
  const I = M.creer([b(10, 0, 0), b(11, 9, 0), b(12, 60, 0)]);
  const e = [];
  for (let t = 0; t < 16; t++) { M.chauffer(I, 0, 5, 1, 1, 0, e); M.avancer(I, 1, e); }
  assert.equal(I.etat[1], 0, 'le voisin attend');
  for (let t = 0; t < 60; t++) M.avancer(I, 1, e);
  assert.equal(I.etat[1], 1, 'le voisin a pris');
  assert.equal(I.origine[1], 0);
});

verifier('cocktail et tirage', () => {
  const I = M.creer([b(10, 0, 0), b(11, 9, 0), b(12, 60, 0)]);
  const e = [];
  assert.equal(M.cocktail(I, 60, 4.5, 2, 1, e), false);
  assert.equal(I.etat[2], 0);
  assert.equal(M.cocktail(I, 60, 4.5, 2, 3, e), true);
  assert.equal(I.etat[2], 1);
  assert.equal(I.enFeu, 1, 'un seul immeuble en feu');
  assert.equal(M.cocktail(I, 60, 9, 2, 3, e), false, 'trop loin');
});

verifier('plafond de 48', () => {
  const I = M.creer(Array.from({ length: 60 }, (_, k) => b(k, k * 30, 0)));
  const e = [];
  for (let k = 0; k < 60; k++) M.cocktail(I, k * 30, 4.5, 0, 3, e);
  assert.equal(I.enFeu, R.max, 'plafond');
});

verifier('déterminisme', () => {
  const essai = () => {
    const I = M.creer([b(10, 0, 0), b(11, 9, 0), b(12, 60, 0)]);
    const e = [];
    for (let t = 0; t < 16; t++) { M.chauffer(I, 0, 5, 1, 1, 0, e); M.avancer(I, 1, e); }
    for (let t = 0; t < 60; t++) M.avancer(I, 1, e);
    M.cocktail(I, 60, 4.5, 2, 3, e);
    return [Array.from(I.intensite), Array.from(I.chaleur), e.length];
  };
  assert.deepEqual(essai(), essai(), 'déterminisme');
});

verifier('pres', () => {
  const I = M.creer([b(10, 0, 0), b(12, 60, 0)]);
  const e = [];
  M.cocktail(I, 0, 4.5, 1, 3, e);
  for (let t = 0; t < 10; t++) M.avancer(I, 1, e);
  assert.equal(M.pres(I, 0, 6), 0, 'pres à 2 m');
  assert.equal(M.pres(I, 0, 12), -1, 'pres à 8 m');
  assert.equal(M.pres(I, 60, 5), -1, 'pas en feu');
});

verifier('proche', () => {
  const I = M.creer([b(10, 0, 0), b(12, 60, 0)]);
  const e = [];
  M.cocktail(I, 0, 4.5, 1, 3, e);
  for (let t = 0; t < 10; t++) M.avancer(I, 1, e);
  assert.equal(M.proche(I, 0, 14, 12), 0, 'proche à 10 m');
  assert.equal(M.proche(I, 0, 14, 8), -1, 'proche hors rayon');
  assert.equal(M.proche(I, 60, 10, 20), -1, 'proche : pas en feu');
});

verifier('extinction et évènement 39', () => {
  const I = M.creer([b(10, 0, 0), b(12, 60, 0)]);
  const e = [];
  M.cocktail(I, 0, 4.5, 1, 3, e);
  for (let t = 0; t < 10; t++) M.avancer(I, 1, e);
  let n = 0;
  while (I.etat[0] === 1 && n < 400) { M.arroser(I, 0, 10, 8, 6, 1, e); n++; }
  assert.equal(I.etat[0], 2, 'éteint');
  assert.equal(I.enFeu, 0);
  assert.ok(e.some(x => x.type === 39 && x.a === 10 && x.b === 0));
  assert.ok(n > 2 && n < 60, 'six pompiers éteignent en ' + n + ' s');
});

verifier('exporter', () => {
  const I = M.creer([b(10, 0, 0), b(12, 60, 0)]);
  const e = [];
  M.cocktail(I, 0, 4.5, 1, 3, e);
  for (let t = 0; t < 10; t++) M.avancer(I, 1, e);
  let n = 0;
  while (I.etat[0] === 1 && n < 400) { M.arroser(I, 0, 10, 8, 6, 1, e); n++; }
  const s = new Float32Array(4 * 1024);
  assert.equal(M.exporter(I, s), 1);
  assert.deepEqual(Array.from(s.slice(0, 2)), [10, 2]);
});

verifier('compter', () => {
  const I = M.creer([b(10, 0, 0), b(12, 60, 0)]);
  const e = [];
  M.cocktail(I, 0, 4.5, 1, 3, e);
  for (let t = 0; t < 10; t++) M.avancer(I, 1, e);
  let n = 0;
  while (I.etat[0] === 1 && n < 400) { M.arroser(I, 0, 10, 8, 6, 1, e); n++; }
  M.cocktail(I, 60, 4.5, 0, 3, e);
  for (let t = 0; t < R.montee + R.consume + 5; t++) M.avancer(I, 1, e);
  const c = M.compter(I);
  assert.equal(c.enFeu, 0);
  assert.equal(c.eteints, 1);
  assert.equal(c.calcines, 1);
  assert.deepEqual(Array.from(c.calcinesPar), [1, 0, 0]);
});

verifier('calciné', () => {
  const I = M.creer([b(10, 0, 0), b(12, 60, 0)]);
  const e = [];
  M.cocktail(I, 0, 4.5, 1, 3, e);
  for (let t = 0; t < 10; t++) M.avancer(I, 1, e);
  let n = 0;
  while (I.etat[0] === 1 && n < 400) { M.arroser(I, 0, 10, 8, 6, 1, e); n++; }
  M.cocktail(I, 60, 4.5, 0, 3, e);
  for (let t = 0; t < R.montee + R.consume + 5; t++) M.avancer(I, 1, e);
  assert.equal(I.etat[1], 3, 'calciné');
  assert.ok(e.some(x => x.type === 39 && x.a === 12 && x.b === 1));
});

verifier('empreinte qui change', () => {
  const I = M.creer([b(10, 0, 0), b(12, 60, 0)]);
  const e = [];
  const h0 = M.empreinte(I);
  M.cocktail(I, 0, 4.5, 1, 3, e);
  assert.notEqual(M.empreinte(I), h0, 'empreinte qui change');
});

verifier('immeuble tourné : distFacade', () => {
  const I = M.creer([{ id: 1, x: 0, z: 0, rayon: 6, h: 12, boites: [{ x: 0, z: 0, lx: 8, lz: 8, lacet: Math.PI / 4 }], pieces: [] }]);
  assert.equal(M.distFacade(I, 0, 0, 0), 0, 'au centre');
  // 1 m au-delà de la façade, dans le repère de la boîte : (5, 0) tourné de π/4.
  const d = M.distFacade(I, 0, 5 * Math.cos(Math.PI / 4), 5 * Math.sin(Math.PI / 4));
  assert.ok(Math.abs(d - 1) < 0.15, 'environ 1 m à 1 m de la façade, obtenu ' + d);
});

verifier('sens du lacet', () => {
  const I = M.creer([{ id: 1, x: 0, z: 0, rayon: 12, h: 12, boites: [{ x: 0, z: 0, lx: 20, lz: 4, lacet: Math.PI / 2 }], pieces: [] }]);
  assert.equal(M.distFacade(I, 0, 0, 9), 0, 'sur la façade en (0,9)');
  assert.equal(M.distFacade(I, 0, 9, 0), 7, 'à 7 m en (9,0)');
});

verifier('reprise après extinction', () => {
  const I = M.creer([b(10, 0, 0), b(12, 60, 0)]);
  const e = [];
  M.cocktail(I, 0, 4.5, 1, 3, e);
  for (let t = 0; t < 10; t++) M.avancer(I, 1, e);
  let n = 0;
  while (I.etat[0] === 1 && n < 400) { M.arroser(I, 0, 10, 8, 6, 1, e); n++; }
  assert.equal(I.etat[0], 2, 'éteint');
  for (let t = 0; t < 16; t++) { M.chauffer(I, 0, 5, 1, 1, 0, e); M.avancer(I, 1, e); }
  assert.equal(I.etat[0], 1, 'reprise à l’état 1');
});

verifier('coût : 4 000 immeubles en damier', () => {
  const liste = [];
  let id = 0;
  for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) {
    liste.push({ id: id++, x: i * 12, z: j * 12, rayon: 6, h: 12, boites: [{ x: i * 12, z: j * 12, lx: 10, lz: 10, lacet: 0 }], pieces: [] });
  }
  const t0 = performance.now();
  const I = M.creer(liste);
  const dt = performance.now() - t0;
  assert.ok(dt < 300, 'création en ' + dt.toFixed(0) + ' ms < 300 ms');
  assert.equal(I.n, 4096);
  for (let k = 0; k < I.n; k++) {
    const nv = v(I, k).length;
    assert.ok(nv >= 1 && nv <= 8, 'voisins de ' + k + ' = ' + nv);
  }
});

console.log('ok immeubles (' + ok + ' vérifications)');
