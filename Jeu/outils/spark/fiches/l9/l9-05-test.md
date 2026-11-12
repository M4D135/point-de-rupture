Titre: L9 : la suite de vérifications du module des immeubles (immeubles.test.mjs)
Fichiers: Jeu/verifications/sim.test.mjs:1-30 ; Jeu/verifications/immeubles.test.mjs ; /Users/david/Projects/point-de-rupture/Jeu/outils/spark/fiches/l9/fumee-1.cjs ; /Users/david/Projects/point-de-rupture/Jeu/outils/spark/fiches/l9/fumee-2.cjs
Tests: node Jeu/verifications/immeubles.test.mjs
---
Crée Jeu/verifications/immeubles.test.mjs (un bloc, AVANT vide) : la suite de vérifications du module `PDR.immeubles` (Jeu/src/sim/immeubles.js), sur le modèle de sim.test.mjs (même façon de charger les fichiers de Jeu/src dans le contexte global, même façon d'annoncer les vérifications et de finir en écrivant « ok » ; reprends ses fonctions d'aide telles quelles). Charge `sim/regles.js` puis `sim/immeubles.js`.
Reprends, en vérifications nommées en français, tout ce que vérifient les deux contrôles de fumée donnés en extrait (voisins, prise après 15 s de chauffe, propagation au voisin, cocktail et tirage, plafond de 48, déterminisme, pres, extinction et évènement 39, exporter, compter, calciné), et ajoute :
- un immeuble tourné (lacet = π/4) : distFacade vaut 0 en son centre et environ 1 m à 1 m de sa façade, mesuré dans son repère ;
- le sens du lacet : une boîte de 20 × 4 m (lx 20, lz 4) en (0, 0) avec lacet = π/2 : distFacade vaut 0 en (0, 9) et 7 en (9, 0) ;
- un immeuble éteint peut reprendre : rechauffé 15 s, il repasse à l'état 1 ;
- le coût : `creer` sur 4 000 immeubles en damier (boîtes de 10 × 10 m tous les 12 m) prend moins de 300 ms, et chacun a entre 1 et 8 voisins.
