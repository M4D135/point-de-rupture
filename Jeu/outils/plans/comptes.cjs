// Budget de la ville réelle : pièces par primitive, cassables par sorte, temps de construction (meilleur de cinq) et
// taille du module de données, pour 9, 13 et 15 îlots.
//     node Jeu/outils/plans/comptes.cjs [DOSSIER_SRC] [ilots…]
// DOSSIER_SRC : un dossier Jeu/src (par défaut celui de cet arbre) ; pour une mesure « avant », extraire une autre
// version : git archive main Jeu/src | tar -x -C /tmp/avant, puis node comptes.cjs /tmp/avant/Jeu/src.
// Noter la charge (uptime) avec chaque mesure : les temps ne se comparent que pris dans les mêmes conditions.
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.resolve(process.argv[2] || path.join(__dirname, '../../src'));
for (const f of ['sim/regles.js', 'sim/protocole.js', 'ville.js', 'villes/marseille.js', 'ville-reelle.js']) require(path.join(SRC, f));
const VR = globalThis.PDR.villeReelle;
const tailles = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [9, 13, 15];
console.log(JSON.stringify({ src: SRC, module: fs.statSync(path.join(SRC, 'villes/marseille.js')).size }));
for (const N of tailles) {
  let best = Infinity, v;
  for (let k = 0; k < 5; k++) {
    const t0 = performance.now();
    v = VR.creerVille('marseille', { ilots: N });
    best = Math.min(best, performance.now() - t0);
  }
  const formes = {};
  for (const m of v.objets) formes[m.shape] = (formes[m.shape] || 0) + 1;
  const sortes = {};
  let pieces = 0;
  for (const c of v.sites.cassables) { sortes[c.sorte] = (sortes[c.sorte] || 0) + 1; pieces += c.pieces.length; }
  console.log(JSON.stringify({ ilots: N, ms: +best.toFixed(0), objets: v.objets.length, formes, cassables: v.sites.cassables.length,
    sortes, piecesCassables: pieces, comptes: v.mesures.comptes && Object.fromEntries(Object.entries(v.mesures.comptes).filter(([, x]) => typeof x === 'number')) }));
}
