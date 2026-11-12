// Contrôle de fumée : ville.sites.immeubles (fiches l9-08 et l9-09). Argument : imaginaire ou marseille.
const assert = require('assert'); globalThis.PDR = {};
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js', 'ville-reelle.js']) require(process.cwd() + '/Jeu/src/' + f);
const quoi = process.argv[2] || 'imaginaire';
const faire = () => quoi === 'marseille' ? PDR.villeReelle.creerVille('marseille', { ilots: 9 }) : PDR.ville.creerVille(1, { ilots: 9 });
const v = faire(), L = v.sites && v.sites.immeubles;
assert.ok(Array.isArray(L), quoi + ' : sites.immeubles');
assert.ok(L.length >= 50, quoi + ' : ' + L.length + ' immeubles');
L.forEach((b, k) => {
  assert.equal(b.id, k, 'id = indice');
  for (const c of ['x', 'z', 'rayon', 'h']) assert.ok(Number.isFinite(b[c]), c + ' fini (' + k + ')');
  assert.ok(b.rayon > 0 && b.h > 2, 'rayon et hauteur (' + k + ')');
  assert.ok(Array.isArray(b.boites) && b.boites.length >= 1, 'boîtes (' + k + ')');
  for (const x of b.boites) {
    for (const c of ['x', 'z', 'lx', 'lz', 'lacet']) assert.ok(Number.isFinite(x[c]), 'boîte : ' + c + ' (' + k + ')');
    assert.ok(x.lx > 0 && x.lz > 0, 'boîte non vide (' + k + ')');
    assert.ok(Math.hypot(x.x - b.x, x.z - b.z) + Math.hypot(x.lx, x.lz) / 2 <= b.rayon + 0.01, 'boîte dans le rayon (' + k + ')');
  }
  assert.ok(Array.isArray(b.pieces), 'pieces (' + k + ')');
});
assert.equal(JSON.stringify(faire().sites.immeubles), JSON.stringify(L), 'même ville, mêmes immeubles');
console.log('ok fumée 3 : ' + quoi + ', ' + L.length + ' immeubles');
