# Provenance du moteur de rendu

`renderer.js` vient de FERRO (`github.com/M4D135/FERRO`, dépôt privé), version METAL 0.6, commit
`950f743` du 12 novembre 2026, fichier `src/renderer.js` (sha256 `45c1b17014fb5310…eadeae817df0a4`).
Le fichier de la branche `campagne-18-mondes` (commit `4ce2271`, même jour) est identique à celui-ci.

Le fichier est repris tel quel, puis adapté à la vue RTS. Les retouches commencent par un commentaire « PDR ».
Quelques lignes qui en dépendent ne portent pas la marque : elles sont rangées sous la retouche dont elles font partie.
Rien d'autre de FERRO n'est copié. `motion.js` ne l'est pas : `camera.js` reprend seulement sa formule
d'amortissement, avec mention.

Retouches, dans l'ordre du fichier :

1. **En-tête** : origine et renvoi à ce fichier.
2. **Ombre du soleil sur tout l'atlas** (`uShadowSettings.w > 1,5`) : en vue de haut, un seul soleil couvre le sol visible.
3. **Matériaux urbains 13 à 18**. Façade d'immeuble : étages, fenêtres en retrait, vitrines du rez-de-chaussée,
   toit de gravier ; le rythme des baies dépend de la fraction de la matière. Asphalte, avec granulat, reprises et fissures.
   Dallage de pierre à joints décalés. Laque des véhicules et des boucliers. Tissu et peau des figurines.
   Le relief de ces surfaces (`urbanHeight`) passe par `reliefNormal`.
   La couleur d'instance ne remplace la teinte de base que pour les matières de FERRO (`m < 12,5`).
4. **Atmosphère** : la densité minimale du brouillard descend à 0,0001, pour une ville vue de 900 m.
5. **Vignettage adouci** : 0,84 au lieu de 0,59, pour que les unités au bord de l'écran restent lisibles.
6. **Seuil du bloom relevé** : 0,86 à 0,98 au lieu de 0,56 à 0,86. Un toit clair en plein jour ne voile plus l'image.
7. **Anticrénelage MSAA ×4** de la scène, avant le bloom, avec copie vers la cible de post-traitement. `fx.msaa === false` le coupe
   sans recréer les cibles (réglage « Anticrénelage » du jeu).
8. **Atlas d'ombre doublé** : 2 048 en qualité auto, 4 096 en haute qualité, borné par `MAX_TEXTURE_SIZE`.
9. **Foule empaquetée par le jeu** (`fx.instances`). Un tampon dédié, partagé par l'ombre du soleil et la passe couleur.
10. **Soleil réglé par la caméra RTS**. `camera.sun` donne le centre, l'emprise et la profondeur visibles au sol.
    Avec `fx.sunOnly`, le soleil prend tout l'atlas : ni lampes ni torche ne projettent d'ombre.
    Le volume du soleil suit la même emprise, y compris pour `actorFilter`.
11. **Décor en un seul lot stable** (`camera.allStatic`). Tout le décor part au GPU d'un bloc, sans tri ni nouvel envoi
    quand la caméra bouge ; le découpage au champ se fait au clip. Les ombres du soleil suivent la même règle.
12. **Plans proche et lointain** : `camera.near` et `camera.far` sont pris en compte par `draw` et `actorFilter`.
13. **Sans lampe torche** (`fx.torch === false`), sa source est renvoyée assez loin pour ne plus rien éclairer.
14. **Voile du brouillard** (`fx.voile = { texture, origine, taille, force }`). Une texture R8 de visibilité, posée sur
    l'unité de texture 4, assombrit et ternit le dehors hors de la vue du joueur, après le gamma et avant le vignettage.
    Sans `fx.voile`, ou à force nulle, le shader du monde rend exactement l'image de FERRO.
15. **Bibliothèque d'éclairage pour le jeu** (`PDR_GLSL`, `PDR_INDOOR`, `PDR_UNIFORMS`). Les formules du shader du
    monde (ombre du soleil filtrée, lumière ambiante du ciel, lampes, reflets, brouillard, tonemap, gamma, vignettage),
    réécrites en fonctions `pdrOmbreSoleil`, `pdrEclairer` et `pdrFinir` pour les shaders de la foule. Le shader du monde
    lui-même n'en dépend pas.
16. **Lots du jeu** (`fx.lots = [{ values, groups, version }]`, au format de `pack`). Chaque lot a son tampon GPU, renvoyé
    seulement quand l'objet ou sa `version` change ; il entre dans l'ombre du soleil et dans la passe couleur, après la
    foule empaquetée (`fx.instances`). C'est le décor du jeu : bâtiments du joueur, barricades, tas, marques.
17. **Points d'accroche de la foule sur le GPU** (`fx.foule = { ombre(gl, lumiere), couleur(gl, vue) }`). `ombre` est
    appelé dans la passe d'ombre du soleil, cadre de l'atlas lié et biais actif ; `couleur` dans la passe couleur, dans
    la cible MSAA, avant les particules et la copie vers le post-traitement. Le moteur leur passe deux objets réutilisés
    d'une image à l'autre (matrices, soleil, ciel, brouillard, lampes, atlas d'ombre sur l'unité 2) et rétablit son
    état GL au retour ; ce qu'ils rendent (`{ appels, triangles, instances }`) entre dans `stats`.
    Le moteur expose `renderer.gl` (le contexte WebGL 2) et `renderer.pdr` : `glsl`, `uniformes`, `generation`
    (change à chaque (ré)initialisation du contexte), `programme(vertex, fragment)` et `lier(programme)`.
    Le rendu logiciel (Canvas 2D) n'a ni l'un ni l'autre.

Sans `fx.voile`, `fx.lots` ni `fx.foule`, `draw` suit le chemin de FERRO à l'identique (vérifié par
`verifications/rendu.test.mjs` contre le fichier d'origine, sur un contexte WebGL simulé).
