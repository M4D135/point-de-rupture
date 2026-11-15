# Histoire du moteur de rendu

`renderer.js` est le moteur de rendu de Point de rupture. Il vient du jeu METAL (`github.com/M4D135/METAL`) et a été
mis à jour le 12 novembre 2026 sur le dernier état du moteur commun, « FERRO 0.2 », commit
`248043a674e5353724731a7322ae932487c236b7`, avant la suppression de ce dépôt. Depuis, le moteur appartient au jeu et
évolue avec lui : il n'y a plus de copie de référence ni de dépôt commun.

Le dossier `Jeu/src/moteur/` contient :

| Fichier | Quoi | Détail |
|---|---|---|
| `renderer.js` | le moteur de rendu : FERRO 0.2 et huit ajouts du jeu, marqués « PDR (nom) » | ce fichier |
| `audio.js` | portage en français du son du jeu METAL ; les sons sont ceux du jeu | `PROVENANCE-SON.md` |
| `musique.js` | portage en français de la musique du jeu METAL ; les morceaux sont ceux du jeu | `PROVENANCE-SON.md` |

Rien d'autre n'est repris : `camera.js` reprend seulement la formule d'amortissement de `motion.js` de METAL, avec
mention ; `options.js` ne sert pas. Le son est décrit dans `PROVENANCE-SON.md`.

Le moteur est FERRO 0.2 plus les retouches du jeu, et rien d'autre : 14 blocs, 212 lignes ajoutées et 2 lignes de FERRO
remplacées. Chaque bloc commence par un commentaire « PDR (nom) », où le nom est celui d'une des retouches décrites plus
bas. Les lignes marquées « PDR : » ou « BITUME : », sans nom entre parenthèses, viennent du moteur commun : il les avait
reprises des jeux en gardant leur marque.

## Avant la 0.2

Jusqu'à l'essai 0.2 du jeu (commit `5ac0066`), le moteur partait du renderer de METAL 0.6 et portait 17 retouches. Ce
fichier citait alors « `github.com/M4D135/FERRO`, commit `950f743` » : c'était le dépôt du jeu METAL, qui portait ce nom
avant d'être renommé `M4D135/METAL` ; cet état était l'étiquette `metal-0.6`.

FERRO 0.2 avait repris les retouches génériques du jeu, prises à son commit `b695b51`, et l'évolution de METAL jusqu'à sa
version 0.8. Ce que le jeu retouchait et que FERRO 0.2 faisait déjà :

| Ce que le jeu avait retouché | Dans FERRO 0.2 |
|---|---|
| Ombre du soleil sur tout l'atlas ; ni lampe ni torche ne projettent d'ombre | `fx.sunOnly` |
| Matières urbaines 13 à 18 : façade, asphalte, dallage, laque, tissu et peau | dans le shader du monde |
| Densité minimale du brouillard à 0,0001 | dans `environmentInfo` |
| Vignettage adouci, 0,84 au lieu de 0,59 | réglage de création `vignette: 0.84` |
| Seuil du bloom relevé, 0,86 à 0,98 | réglage de création `bloomThreshold: [0.86, 0.98]` |
| Anticrénelage MSAA ×4 de la scène, avant le bloom | réglage de création `msaa: 4` |
| Atlas d'ombre doublé, borné par `MAX_TEXTURE_SIZE` | réglage de création `shadowMapScale: 2` |
| Foule empaquetée par le jeu, tampon partagé par l'ombre et la couleur | `fx.instances` ; son tampon naît au premier usage |
| Soleil réglé par la caméra : centre, emprise, profondeur | `camera.sun` |
| Décor en un seul lot stable | `camera.allStatic` |
| Plans proche et lointain | `camera.near`, `camera.far` |
| Sans lampe torche | `fx.torch === false` |

## Méthode du passage

Fusion à trois : `git merge-file --diff3` entre la base (`metal-0.6`), FERRO (`v0.2`) et la copie du jeu (commit
`5ac0066`). Treize conflits : les huit que FERRO annonçait pour la copie du commit `b695b51` (anti-scintillement, MSAA,
atlas d'ombre, tampon de la foule, champ de vision, plans), et cinq autres là où le jeu avait ajouté depuis ses lots, sa
foule et son interrupteur du MSAA. Dans chacun, la version de FERRO est gardée ; les retouches du jeu sont ensuite
reposées autour, en blocs marqués.

La fusion gardait aussi, sans conflit, deux lignes du jeu que FERRO n'avait pas touchées : le vignettage à 0,84 et le
seuil du bloom à 0,86, écrits en dur dans les shaders. Elles sont rendues à FERRO : ses réglages de création remplacent
ces constantes dans le texte du shader, et ne les trouveraient pas si elles avaient déjà changé. C'est le point à relire
à chaque passage : ce que la fusion garde du jeu sans rien signaler.

## Réglages passés au moteur

À la création, `jeu.js` passe `REGLAGES_MOTEUR` : `{ msaa: 4, shadowMapScale: 2, vignette: 0.84, bloomThreshold:
[0.86, 0.98] }`. Sur la caméra, `near`, `far`, `allStatic` et `sun` (`camera.js`) ; sur `fx`, `sunOnly`, `torch: false`,
`shadows`, `bloom`, `lights`, et les quatre champs des ajouts du jeu : `voile`, `lots`, `foule`, `msaa`.

## Retouches du jeu, dans l'ordre du fichier

1. **origine** — L'en-tête : d'où vient la copie, et le renvoi à ce fichier.
2. **voile** — Le voile du brouillard de guerre : `fx.voile = { texture, origine, taille, force }`. Une texture R8 de
   visibilité, posée sur l'unité de texture 4, assombrit et ternit le dehors hors de la vue du joueur, après le gamma et
   avant le vignettage. Sans `fx.voile`, ou à force nulle, le shader du monde rend l'image de FERRO. L'échantillonneur
   est placé sur l'unité 4 une fois, à la création du contexte, avec une texture blanche : tant qu'aucun voile n'est
   passé, `draw` n'envoie pas une commande de plus que FERRO ; quand le voile cesse, il est retiré une fois (texture
   blanche, force 0). Propre au RTS : il reste au jeu.
3. **éclairage** — La bibliothèque d'éclairage pour les shaders du jeu : `PDR_GLSL`, `PDR_INDOOR`, `PDR_UNIFORMS`. Les
   formules du shader du monde pour une surface du dehors (ombre du soleil filtrée, lumière ambiante du ciel, lampes,
   reflets, brouillard, tonemap, gamma, vignettage), réécrites en fonctions `pdrOmbreSoleil`, `pdrEclairer` et
   `pdrFinir`. Le shader du monde n'en dépend pas. Son vignettage suit le réglage de création, comme celui du monde.
   Deux apports de METAL 0.8 au shader du monde n'y sont pas, pour que la foule garde son image et son coût : la
   rugosité élargie là où la normale varie d'un pixel à l'autre, et le reflet des nuages sur les surfaces lisses. Un jeu
   qui dessine lui-même dans les passes du moteur a besoin de ces formules.
4. **lots** — Les lots du jeu : `fx.lots = [{ values, groups, version }]`, au format de `pack`. Chaque lot a son tampon
   GPU, renvoyé seulement quand l'objet ou sa `version` change ; il entre dans l'ombre du soleil et dans la passe
   couleur, après la foule empaquetée (`fx.instances`). C'est le décor vivant du jeu : bâtiments du joueur, barricades,
   tas, marques. FERRO 0.2 a `setLots` pour le même besoin et le note « à unifier ». Les deux ne se recouvrent pas
   encore : `setLots` prend des objets de scène, les empaquette lui-même, les découpe au champ et les recharge après une
   perte du contexte ; `fx.lots` prend des paquets que le jeu a déjà remplis et ne renvoie que ceux dont la version
   change, ce qu'il faut à un décor qui change vingt fois par seconde. `fx.lots` est donc gardé tel quel pour l'instant.
   Dans la passe d'ombre, la copie rétablit le biais de profondeur que FERRO vient de couper : deux commandes par image.
5. **foule** — Les points d'accroche de la foule sur le GPU : `fx.foule = { ombre(gl, lumiere), couleur(gl, vue) }`.
   `ombre` est appelé dans la passe d'ombre du soleil, cadre de l'atlas lié et biais actif ; `couleur` dans la passe
   couleur, dans la cible de la scène (MSAA), avant les particules et la copie vers le post-traitement. Le moteur leur
   passe deux objets réutilisés d'une image à l'autre (matrices, soleil, ciel, brouillard, lampes, atlas d'ombre sur
   l'unité 2) et rétablit son état GL au retour ; ce qu'ils rendent (`{ appels, triangles, instances }`) entre dans
   `stats`. Le moteur expose `renderer.gl` (le contexte WebGL 2) et `renderer.pdr` : `glsl`, `uniformes`, `generation`
   (change à chaque création du contexte, donc après une perte), `programme(vertex, fragment)` et `lier(programme)`.
   Le rendu logiciel (Canvas 2D) n'a ni l'un ni l'autre. La foule elle-même est propre au jeu ; le point d'accroche,
   lui, servirait à d'autres.
6. **msaa** — L'interrupteur de l'anticrénelage : `fx.msaa === false` dessine la scène droit dans la cible du
   post-traitement, sans recréer une seule cible (réglage « Anticrénelage » du jeu). Sans ce champ, rien ne change.
   FERRO 0.2 n'a que le réglage de création.
7. **grain** — Dans le shader des effets translucides, le grain de surface (`vSurface`) est ramené à l'échelle d'une
   particule de 2,6 m au plus : sur les grandes bouffées de fumée et les flammes, le bruit ne crénèle plus en pointillé.
   Les particules de 2,6 m et moins gardent l'image de FERRO.
8. **lampes** — Huit lampes passagères au lieu de trois (quatre au lieu de deux en qualité basse) : les huit foyers les
   plus proches de la visée éclairent la scène (`decor.js`).

## Ce que le passage change à l'image

Rien du fait du jeu : sur des images du jeu, la nouvelle copie envoie au GPU les commandes de l'ancienne, à quatre
écarts près, sans effet sur l'image (`verifications/rendu.test.mjs` les compte) : le voile n'est plus posé à chaque
image quand il n'y en a pas ; ses uniformes sont cherchées plus tard dans la création ; le tampon de `fx.instances`
naît au premier usage ; le biais de l'ombre est coupé puis rétabli avant les lots et la foule.

Le reste vient de FERRO, qui a suivi METAL de la 0.6 à la 0.8. Seul le texte de cinq shaders change, des 46 lignes que
METAL a changées :

- **Métal brossé (matière 0)** : le brossage est filtré quand il devient plus fin qu'un pixel. De loin, plus de bandes
  claires sur les mâts et les grilles. Mieux pour un jeu vu de 300 à 900 m.
- **Arêtes usées** des pièces en métal (matières 0 à 2, pièces `surface: 'object'`) : un liseré clair sur les arêtes des
  lampadaires, des grilles, des barrières. Visible seulement de près (D 60 m). Neutre.
- **Rugosité élargie** là où la normale varie d'un pixel à l'autre : les reflets s'étalent au lieu de scintiller. Aucun
  pixel ne change sur les façades, l'asphalte et le dallage, dont les reflets sont déjà mats. Neutre.
- **Reflet des nuages et du soleil** sur les surfaces lisses du dehors (rugosité sous 0,65 et métal au-dessus de 0,25) :
  l'eau, la laque des véhicules, le métal, les vitres vues de près. Le plan d'eau du Vieux-Port prend un reflet doux,
  qui dérive très lentement avec le vent. Mieux.
- **Effets** : la fumée (`fxSmoke`) et les étincelles (`fxSpark`) deviennent des sortes de particules à part. Le décor
  du jeu ne s'en sert pas encore : rien ne change aujourd'hui.

Mesuré le 12 novembre 2026 dans Chrome 157 sans écran (ANGLE sur Metal), 1 440 × 900, sur seize vues figées des deux
villes, de 60 à 900 m, ombres, bloom et MSAA coupés tour à tour, l'ancienne et la nouvelle copie dessinant la même
image : de 0,5 à 3,3 % des pixels diffèrent, 8 % sur Marseille entière et 25 % quand le port occupe un quart de l'image ;
moins de 0,01 % diffèrent de plus de 24 sur 255, aucun de plus de 64 ; l'écart moyen reste sous 0,2 sur 255 (1,2 avec le
port). Deux rendus de la même copie ne diffèrent d'aucun pixel.

## Vérifications

- `verifications/rendu.test.mjs`, sur un contexte WebGL 2 simulé qui note chaque appel : les ajouts du jeu (foule, lots,
  voile), l'interrupteur MSAA, le passage depuis la copie d'avant (commit `5ac0066`), écart par écart, le décor, le
  réalisateur et la caméra.
- `verifications/banc-rendu.py` mesure le rendu dans un vrai navigateur ; `--moteur` y met un autre `renderer.js`, pour
  comparer l'avant et l'après sous la même charge.

## Journal

Une ligne par changement du moteur, de la plus ancienne à la plus récente.

| Date | Quoi | Pourquoi | Coût |
|---|---|---|---|
| 12/11/2026 | Le renderer passe à FERRO 0.2 (commit `248043a`) : fusion à trois, réglages de création, six ajouts du jeu conservés. | Prendre le dernier état du moteur commun avant sa suppression, sans changer l'image. | 14 blocs, 212 lignes ajoutées, 2 lignes remplacées ; sur seize vues, 0,5 à 3,3 % des pixels diffèrent de la copie d'avant, moins de 0,01 % de plus de 24 sur 255, écart moyen sous 0,2 sur 255 ; deux rendus de la même copie sont identiques. |
| 12/11/2026 | Ajouts « grain » et « lampes » (lot L5, le feu à l'écran). | Fumées et flammes sans moiré ; les foyers éclairent façades et foule. | 2 lignes. Banc `BANC=cout`, 128 foyers et 64 nuages, 100 000 unités, deux passages par réglage (charge 7 à 9) : à 600 m, 60,1 à 60,2 images/s avec 8 ou 3 lampes ; à 160 m, 60,1 avec 8 et 60,1 / 51,8 avec 3 : l'écart suit la charge de la machine, pas le nombre de lampes. |
| 15/11/2026 | Ajout « empaquetage » : les 16 valeurs de `pack` et `packEffects` sont écrites directement dans leur `Float32Array`, suivant METAL `7f1d5589`. | Éviter le tableau JavaScript temporaire de 16 valeurs créé pour chaque instance ; conserver le regroupement et le tri transparent du jeu. | Un tableau temporaire en moins par instance empaquetée ; aucun changement de résolution, qualité, passes ou simulation. Contrôle des octets et groupes avant/après sur les valeurs par défaut, les listes vides et 513 objets variés, puis suite `rendu.test.mjs`. Aucun gain d'images/s revendiqué. |

### Adaptation du 15 novembre 2026 : empaquetage

Source relue : METAL, commit `7f1d5589b7f5863e09369b0f55a21d4fe4334280`,
`src/renderer.js` dans la voie `render` du chantier Spark
(`/home/m4d135/metal-chantier/voies/render`). SHA-256 du fichier à ce commit :
`6e986ce829135db97fb380b10075d06e240260796a8b80c5465ec13525baf132`.

Les deux blocs « PDR (empaquetage) » adaptent uniquement les écritures directes des
16 valeurs dans le tampon typé. Les valeurs de repli, les drapeaux de surface,
l'ordre des formes et le tri des effets restent ceux de Point de rupture. Les
pools, le tri par comptage, le raster extérieur et les changements de stratégie
d'envoi GPU du même commit METAL ne sont pas repris. Les passes de la foule, du
voile, des lots et du MSAA restent intactes. Les comptes de blocs et de lignes
plus haut décrivent le passage historique à FERRO 0.2.
