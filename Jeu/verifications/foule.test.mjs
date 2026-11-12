// Vérifie le lot d'instances de la foule : groupes contigus dans l'ordre du moteur, valeurs finies, niveaux de détail.
//   node Jeu/verifications/foule.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const ici = path.dirname(fileURLToPath(import.meta.url));
const charger = createRequire(import.meta.url);
for (const m of ['ville.js', 'foule.js']) charger(path.join(ici, '..', 'src', m));
const { creerVille } = globalThis.PDR.ville;
const { creerFoule, FORMES } = globalThis.PDR.foule;

let ok = 0;
const verifier = (nom, f) => { f(); ok++; console.log('ok  ' + nom); };

const ville = creerVille(1);
const foule = creerFoule(ville);
const tous = () => true;
const escouades = [];
for (let f = 0; f < 3; f++) {
  ville.departs(f, 40, 5).forEach(([x, z], k) => escouades.push({ id: f * 100 + k + 1, f, x, z, mv: k % 2 === 0, v: 3, dx: 1, dz: k % 3 - 1 }));
}

function lire(lot) {
  const { values, groups } = lot;
  let attendu = 0;
  for (const g of groups) {
    assert.equal(g.offset, attendu * 64, 'groupes contigus');
    attendu += g.count;
  }
  assert.equal(values.length, attendu * 16, 'longueur du lot');
  const ordre = groups.map(g => FORMES.indexOf(g.name));
  assert.deepEqual(ordre, [...ordre].sort((a, b) => a - b), 'ordre des primitives du moteur');
  for (let i = 0; i < values.length; i++) assert.ok(Number.isFinite(values[i]), 'valeur ' + i);
  for (let i = 0; i < attendu; i++) {
    const o = i * 16;
    assert.ok(values[o + 4] > 0 && values[o + 5] > 0 && values[o + 6] > 0, 'tailles positives');
    assert.equal(values[o + 11], 6, 'drapeaux dehors + objet');
    assert.equal(values[o + 15], 1, 'couleur donnée');
  }
  return attendu;
}

verifier('près de l’œil : figurines complètes, groupes contigus', () => {
  const lot = foule.composer(escouades, [escouades[0].x, 30, escouades[0].z], tous, 1, 1 / 60);
  const n = lire(lot), m = foule.mesure, reste = m.moyennes * 6 * 3 + m.lointaines * 6 + (m.vues - m.jetons) * 2 + m.jetons;
  // Une figurine complète compte de six à huit pièces selon sa faction, sa coiffe et son sac.
  assert.ok(m.proches > 0 && n >= m.proches * 6 * 6 + reste && n <= m.proches * 6 * 8 + reste, `${n} pièces pour ${JSON.stringify(m)}`);
});

verifier('au loin : une pièce par figurine et deux par drapeau', () => {
  const lot = foule.composer(escouades, [0, 450, 0], tous, 2, 1 / 60), m = foule.mesure;
  assert.ok(m.lointaines > 0 && m.proches === 0 && m.moyennes === 0, JSON.stringify(m));
  assert.equal(lire(lot), m.lointaines * (6 + 2) + m.jetons);
});

verifier('vue d’ensemble : un jeton par escouade', () => {
  const lot = foule.composer(escouades, [0, 5000, 0], tous, 3, 1 / 60);
  assert.equal(lire(lot), escouades.length);
  assert.equal(foule.mesure.jetons, escouades.length);
});

verifier('le filtre du moteur écarte des escouades', () => {
  const lot = foule.composer(escouades, [0, 5000, 0], (x) => x < 0, 4, 1 / 60);
  assert.equal(lire(lot), foule.mesure.vues);
  assert.ok(foule.mesure.vues > 0 && foule.mesure.vues < escouades.length);
});

verifier('le lot est réutilisé d’une image à l’autre', () => {
  const a = foule.composer(escouades, [0, 5000, 0], tous, 4, 1 / 60).values.buffer;
  const b = foule.composer(escouades, [0, 5000, 0], tous, 5, 1 / 60).values.buffer;
  assert.equal(a, b);
});

console.log(`FOULE  REUSSI : ${ok} vérifications, ${escouades.length} escouades`);
