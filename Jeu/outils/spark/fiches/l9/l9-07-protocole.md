Titre: L9 : protocole, l'ordre ETEINDRE, les évènements et l'état des immeubles (protocole.js)
Fichiers: Jeu/src/sim/protocole.js:/feux: null ou Float32Array (k × FEU_TAILLE)/+30 ; Jeu/src/sim/protocole.js:/MOLOTOV: 17,/+3 ; Jeu/src/sim/protocole.js:/POSTE_REPRIS: 37,/+2 ; Jeu/src/sim/protocole.js:/const CAPACITE = 262144/+1 ; Jeu/src/sim/protocole.js:/const lireNuage = /+4 ; Jeu/src/sim/protocole.js:/function forme(c)/+14 ; Jeu/src/sim/protocole.js:/VERSION: 2, CAPACITE/+3 ; Jeu/verifications/regles.test.mjs:/Math.max(...Object.values(P.CMD)), 17/+8
Tests: node Jeu/verifications/regles.test.mjs ; node Jeu/verifications/interface.test.mjs ; node Jeu/verifications/sim.test.mjs
---
Jeu/src/sim/protocole.js est le contrat entre la simulation et la page. Décision D9 du plan : les immeubles prennent feu, les pompiers de la Préfecture les éteignent. Ajoute :
1. CMD : après MOLOTOV (17) et ses deux lignes de commentaire, `ETEINDRE: 18,` avec un commentaire aligné comme les autres : `{ ids, x, z }` (0.3) les unités de la sélection qui ont une lance (Pompiers, Camion de pompiers) vont à portée de lance du point et arrosent foyers et immeubles en feu ; Préfecture seulement.
2. EV : après POSTE_REPRIS (37) :
   - `IMMEUBLE_FEU: 38,` : x, z de l'immeuble, faction qui l'a allumé (-1 : un feu sans camp), a : id de l'immeuble (ville.sites.immeubles, etat.immeubles), b : 0 ;
   - `IMMEUBLE_ETEINT: 39,` : x, z, faction qui l'éteint (-1 : il a brûlé jusqu'au bout), a : id, b : 1 éteint à l'eau, 0 calciné (comme FEU_ETEINT).
3. Sur la ligne `const CAPACITE = 262144, …`, ajoute `IMMEUBLE_TAILLE = 4` ; juste après elle : `const ETATS_IMMEUBLE = Object.freeze({ INTACT: 0, EN_FEU: 1, ETEINT: 2, CALCINE: 3 });`. Après `lireNuage`, `lireImmeuble = (f32, k)` sur le même modèle, qui rend `{ id, etat, intensite, avancee }`. Exporte IMMEUBLE_TAILLE, ETATS_IMMEUBLE et lireImmeuble, à côté de NUAGE_TAILLE et de lireNuage.
4. Commentaire du message ETAT : après le paragraphe de `nuages`, un paragraphe `immeubles: null ou Float32Array (k × IMMEUBLE_TAILLE)` : les immeubles touchés par le feu, [id (ville.sites.immeubles), etat (ETATS_IMMEUBLE : 1 en feu, 2 éteint, 3 calciné), intensite (0..1), avancee (0..1 : la part déjà brûlée)] ; mêmes envois que feux ; 1 024 au plus. Dans `mesure`, ajoute `immeubles` (immeubles en feu). Dans BILAN, après `eteints (foyers éteints à l'eau)`, ajoute `immeublesBrules (immeubles calcinés que le camp avait allumés), immeublesSauves (immeubles éteints par le camp)`.
5. `forme` : CMD.ETEINDRE rejoint la liste `avecIds`, et `[CMD.ETEINDRE]: ['x', 'z']` les positions.
6. Jeu/verifications/regles.test.mjs : le maximum des CMD passe de 17 à 18, celui des EV de 37 à 39 ; après les trois vérifications de forme de MOLOTOV, ajoute :
   `assert.equal(P.forme(P.commande(P.CMD.ETEINDRE, 2, { ids, x: 1, z: 2 })), '');`
   `assert.notEqual(P.forme(P.commande(P.CMD.ETEINDRE, 2, { ids, z: 2 })), '');`
   `assert.deepEqual(P.lireImmeuble(new Float32Array([7, 1, 0.5, 0.25]), 0), { id: 7, etat: 1, intensite: 0.5, avancee: 0.25 });`
Rien d'autre ne change ; garde l'alignement des commentaires et des lignes de 120 caractères au plus.
