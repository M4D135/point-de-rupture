// Contrôle de fumée du module des immeubles, partie 1 (creer, voisins, chauffer, allumer, cocktail, avancer).
const assert = require('assert'); globalThis.PDR = {};
require(process.cwd() + '/Jeu/src/sim/regles.js'); require(process.cwd() + '/Jeu/src/sim/immeubles.js');
const M = PDR.immeubles, R = PDR.regles.CONSTANTES.IMMEUBLES;
const b = (id, x, z) => ({ id, x, z, rayon: 6, h: 12, boites: [{ x, z, lx: 8, lz: 8, lacet: 0 }], pieces: [] });
const liste = [b(10, 0, 0), b(11, 9, 0), b(12, 60, 0)];
const essai = () => {
  const I = M.creer(liste), e = [];
  assert.equal(I.n, 3);
  const v = k => Array.from(I.V.slice(I.debutV[k], I.debutV[k + 1]));
  assert.deepEqual(v(0), [1], 'voisins de 0'); assert.deepEqual(v(1), [0], 'voisins de 1'); assert.deepEqual(v(2), [], 'voisins de 2');
  for (let t = 0; t < 16; t++) { M.chauffer(I, 0, 5, 1, 1, 0, e); M.avancer(I, 1, e); }
  assert.equal(I.etat[0], 1, 'pris après 16 s à 1 m'); assert.equal(I.enFeu, 1);
  assert.ok(e.some(x => x.type === 38 && x.a === 10 && x.b === 0), 'évènement 38');
  assert.equal(I.etat[1], 0, 'le voisin attend');
  for (let t = 0; t < 60; t++) M.avancer(I, 1, e);
  assert.equal(I.etat[1], 1, 'le voisin a pris'); assert.equal(I.origine[1], 0);
  assert.equal(M.cocktail(I, 60, 4.5, 2, 1, e), false); assert.equal(I.etat[2], 0);
  assert.equal(M.cocktail(I, 60, 4.5, 2, 3, e), true); assert.equal(I.etat[2], 1); assert.equal(I.enFeu, 3);
  assert.equal(M.cocktail(I, 60, 9, 2, 3, e), false, 'trop loin');
  return [Array.from(I.intensite), Array.from(I.chaleur), e.length];
};
assert.deepEqual(essai(), essai(), 'déterminisme');
const I = M.creer(Array.from({ length: 60 }, (_, k) => b(k, k * 30, 0))), e = [];
for (let k = 0; k < 60; k++) M.cocktail(I, k * 30, 4.5, 0, 3, e);
assert.equal(I.enFeu, R.max, 'plafond');
console.log('ok fumée 1');
