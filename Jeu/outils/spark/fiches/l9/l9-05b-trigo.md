Titre: L9 : le module des immeubles sans Math.cos ni Math.sin (simulation déterministe)
Fichiers: Jeu/src/sim/immeubles.js:1-12 ; Jeu/src/sim/immeubles.js:/const c = Math.cos(bo.lacet), s = Math.sin(bo.lacet)/+1
Tests: node Jeu/verifications/immeubles.test.mjs ; node /Users/david/Projects/point-de-rupture/Jeu/outils/spark/fiches/l9/fumee-1.cjs ; node /Users/david/Projects/point-de-rupture/Jeu/outils/spark/fiches/l9/fumee-2.cjs ; node -e "process.exit(/Math\.(sin|cos|tan|atan2?|random|exp|log|pow|hypot)\b|\bDate\b|performance\.|\*\*/.test(require('fs').readFileSync('Jeu/src/sim/immeubles.js','utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,''))?1:0)"
---
La simulation ne lit ni Math.sin ni Math.cos (sim.test.mjs le vérifie pour chaque fichier de Jeu/src/sim : les mêmes octets dans la page, le travailleur et Node). Dans Jeu/src/sim/immeubles.js :
1. Juste après `'use strict';`, ajoute une fonction et un tampon, avec un commentaire d'une ligne (cos et sin sans Math.cos ni Math.sin : réduction à [-π/2, π/2], puis la série de Taylor ; écart < 1e-9) :
   `const CS = new Float64Array(2);`
   `function cosSin(a, sortie) {` : `a -= 6.283185307179586 * Math.round(a / 6.283185307179586);` puis `let signe = 1;` ; si `a > 1.5707963267948966`, `a -= 3.141592653589793` et `signe = -1` ; sinon si `a < -1.5707963267948966`, `a += 3.141592653589793` et `signe = -1` ; puis `const a2 = a * a;` ; `sortie[0] = signe * (1 - a2 / 2 * (1 - a2 / 12 * (1 - a2 / 30 * (1 - a2 / 56 * (1 - a2 / 90 * (1 - a2 / 132))))));` ; `sortie[1] = signe * a * (1 - a2 / 6 * (1 - a2 / 20 * (1 - a2 / 42 * (1 - a2 / 72 * (1 - a2 / 110 * (1 - a2 / 156))))));` ; `}`.
2. La ligne `const c = Math.cos(bo.lacet), s = Math.sin(bo.lacet);` devient `cosSin(bo.lacet, CS); const c = CS[0], s = CS[1];`.
Rien d'autre ne change.
