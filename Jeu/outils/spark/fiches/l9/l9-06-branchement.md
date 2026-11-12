Titre: L9 : sim/immeubles.js chargé partout où la simulation l'est
Fichiers: Jeu/construire.py:/('sim/nav.js', 'simulation')/+3 ; Jeu/verifications/sim.test.mjs:/for (const f of ['sim/regles.js'/+1 ; Jeu/verifications/sim.test.mjs:/for (const f of ['sim/monde.js', 'sim/nav.js', 'sim/ia.js']/+1 ; Jeu/verifications/banc-sim.mjs:/for (const f of ['sim/regles.js'/+1 ; Jeu/verifications/equilibre.mjs:/for (const f of ['sim/regles.js'/+1 ; Jeu/verifications/ville-reelle.test.mjs:/for (const f of [...PARTAGES/+1
Tests: node Jeu/verifications/sim.test.mjs ; node Jeu/verifications/ville-reelle.test.mjs ; node Jeu/verifications/immeubles.test.mjs ; python3 Jeu/construire.py && git checkout -- Jeu/dist Jeu/SIZE.json
---
Le nouveau fichier Jeu/src/sim/immeubles.js doit être chargé partout où la simulation l'est, juste avant `sim/monde.js` (il a besoin de `sim/regles.js`, et monde.js s'en servira) :
1. Jeu/construire.py : ajoute `('sim/immeubles.js', 'simulation'),` juste avant la ligne `('sim/monde.js', 'simulation'),`.
2. Dans les listes de fichiers de Jeu/verifications/sim.test.mjs (la première, ligne 18), banc-sim.mjs, equilibre.mjs et ville-reelle.test.mjs : ajoute `'sim/immeubles.js'` juste avant `'sim/monde.js'`.
3. Dans la seconde liste de sim.test.mjs (`for (const f of ['sim/monde.js', 'sim/nav.js', 'sim/ia.js'])`, celle qui contrôle les fonctions interdites), ajoute `'sim/immeubles.js'`.
Un bloc par ligne modifiée ; ne change rien d'autre.
