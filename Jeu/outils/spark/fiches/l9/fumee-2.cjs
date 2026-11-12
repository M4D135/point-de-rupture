// Contrôle de fumée du module des immeubles, partie 2 (arroser, pres, exporter, compter, empreinte, calciné).
const assert = require('assert'); globalThis.PDR = {};
require(process.cwd() + '/Jeu/src/sim/regles.js'); require(process.cwd() + '/Jeu/src/sim/immeubles.js');
const M = PDR.immeubles, R = PDR.regles.CONSTANTES.IMMEUBLES;
const b = (id, x, z) => ({ id, x, z, rayon: 6, h: 12, boites: [{ x, z, lx: 8, lz: 8, lacet: 0 }], pieces: [] });
const I = M.creer([b(10, 0, 0), b(12, 60, 0)]), e = [];
const h0 = M.empreinte(I);
M.cocktail(I, 0, 4.5, 1, 3, e);
assert.notEqual(M.empreinte(I), h0, 'empreinte qui change');
for (let t = 0; t < 10; t++) M.avancer(I, 1, e);
assert.equal(M.pres(I, 0, 6), 0, 'pres à 2 m');
assert.equal(M.proche(I, 0, 14, 12), 0, 'proche à 10 m'); assert.equal(M.proche(I, 0, 14, 8), -1, 'proche hors rayon'); assert.equal(M.proche(I, 60, 10, 20), -1, 'proche : pas en feu'); assert.equal(M.pres(I, 0, 12), -1, 'pres à 8 m'); assert.equal(M.pres(I, 60, 5), -1, 'pas en feu');
let n = 0; while (I.etat[0] === 1 && n < 400) { M.arroser(I, 0, 10, 8, 6, 1, e); n++; }
assert.equal(I.etat[0], 2, 'éteint'); assert.equal(I.enFeu, 0); assert.ok(e.some(x => x.type === 39 && x.a === 10 && x.b === 0));
assert.ok(n > 2 && n < 60, 'six pompiers éteignent en ' + n + ' s');
const s = new Float32Array(4 * 1024);
assert.equal(M.exporter(I, s), 1); assert.deepEqual(Array.from(s.slice(0, 2)), [10, 2]);
M.cocktail(I, 60, 4.5, 0, 3, e);
for (let t = 0; t < R.montee + R.consume + 5; t++) M.avancer(I, 1, e);
assert.equal(I.etat[1], 3, 'calciné'); assert.ok(e.some(x => x.type === 39 && x.a === 12 && x.b === 1));
const c = M.compter(I);
assert.equal(c.enFeu, 0); assert.equal(c.eteints, 1); assert.equal(c.calcines, 1); assert.deepEqual(Array.from(c.calcinesPar), [1, 0, 0]);
assert.equal(M.exporter(I, s), 2);
console.log('ok fumée 2');
