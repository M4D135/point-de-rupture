# Point de rupture — plan directeur de la version 0.3

Écrit le 12 novembre 2026 par Claude Fable 5.2, à la demande de David. L'exécution revient à Claude Opus 5.5, un
agent à la fois ; le Spark fait le gros des lectures, des premiers jets et des relectures. Ce fichier est la référence
de l'exécution : qui prend un lot le relit avant de commencer et met le suivi à jour (§ 10) en finissant.

Trois degrés de confiance dans ce qui suit :

- **vérifié** : lu ou mesuré par l'auteur du plan le 12/11 ;
- **écrit par l'agent** : ce que les agents interrompus ont laissé dans leurs branches, pas relu en entier ;
- **d'après le Spark** : fiches de lecture du LLM local. Ce sont des pistes, pas des preuves.

## 1. Ce que David a demandé

Mot pour mot, le 12 novembre 2026, dans l'ordre :

1. « vire unreal engine, go full mon moteur ferro »
2. « par contre le jeu faut des coctails molotov, faut foutre le feu quand on casse, faut plus de viloence et une
   musique mois rigolote, et améliore les animations des persos et le détail de la map, c pas mal mais peux mieux faire
   le marseille »
3. « il faut faire comme wow soit temps, soit jusqu'au dernier mais pas que au nombre de points, au choix un peu des 3
   etc, à voir et par defaut moins de manifesants »
4. « demo pas assez longue »
5. « fais un gros master plan pour le boulot avec Fable 5.2 puis passe en opus 5.5 pour l'execution »
6. « aide toi du spark pour economiser tes tokens »
7. « tu peux utiliser opencode cli avec deepseek free pour t'aider »

Puis, le même soir, après la mise en ligne de l'essai 0.3a :

8. « je veux voir la version sur l'ecran tigtre comme on a fait pour metal »
9. « deplacement sur map en plus du bouton milieu et les fleches, zsqd aussi »
10. « trop de pancartes »
11. « faut que ça foute le feu un peu partout et que les batiments prennent si les pompiers viennent pas eteindre, donc
    camion pompier etc, pompiers gérés avec la police »
12. « en gros casseurs gaucho, patriotes , flics et pompiers »
13. « go full spark pour economiser tes tokens » (12/11, vers 22 h 50 ; voir § 6.1)

Avant cela, le même jour : « fais marseille et paris pour commencer / ou juste marseille, on verra les autres seront
pour les maj suivantes » ; puis, sur Paris : « Pas encore ».

Dans une autre session, le même jour, à propos du dépôt commun du moteur : « en fait c con ce systme parce que le
moteur evolue selon le jeu », puis « Supprime-le ». Le dépôt `M4D135/FERRO` et son clone `~/Projects/ferro` n'existent
plus (vérifié à 20 h 15). Chaque jeu fait évoluer sa propre copie du moteur.

## 2. Décisions de cadrage

Prises par Claude à partir de ces demandes. David peut en changer une d'un mot ; le lot concerné est indiqué.

| | Décision | Lot |
|---|---|---|
| D1 | **Ton.** Le feu, les cocktails Molotov, une violence plus dure et une ambiance plus sombre sont voulus : la règle « bagarre burlesque » cède là où elle les contredit. Restent exclus : armes à feu, lames, sang, personne montrée en feu (le feu brûle le sol, les objets, les véhicules, les barricades, les bâtiments ; une unité prise dedans est blessée, fuit, tombe hors jeu), drapeaux, emblèmes, slogans, uniformes et personnalités réels, cause énoncée. Les vrais noms de lieux de Marseille restent. | tous |
| D2 | **Victoire au choix**, avant la partie : « Jusqu'au dernier » (défaut : « un vrai warcraft starcraft »), « Au temps » (10, 15, 20, 30 ou 40 min, le meilleur score gagne), « Aux points » (1 500, 3 000 ou 5 000), « Mixte » (points, temps ou dernier debout, le premier des trois : la règle de la 0.2, 3 000 points et 40 min). Un camp sans base est éliminé dans tous les modes. | L4, L7 |
| D3 | **Moins de manifestants par défaut** : la part de la Convergence devient un réglage, « Peu » 34 %, « Moyen » 40 % (défaut), « Beaucoup » 50 % (la 0.2). Le total est descendu à **20 000 unités par défaut** (`EFFECTIFS_DEFAUT`, décidé à la reprise du 13/11) ; les formats 50 000 à 200 000 restent au choix. La démo ne dépasse jamais le format par défaut. | L4, L7 |
| D4 | **Démo longue.** Mesuré en ligne : la démo s'arrête à 10 min 40, quand un camp atteint 3 000 points, avec 73 % des unités déjà hors jeu. En démo : ni fin aux points ni fin au temps, une limite de sécurité à 60 minutes, des IA qui continuent de produire et d'attaquer, les nouveautés visibles dès la première minute. Quand une partie de démo finit, la suivante part aussitôt, sans retour au titre. | L4, L7 |
| D5 | **« Full FERRO ».** Unreal est retiré du dépôt et du Mac : le jeu ne tourne que sur le moteur de David. Il n'y a plus de dépôt commun du moteur : la copie du jeu, `Jeu/src/moteur/`, est la sienne et évolue avec lui. La branche `ferro-rendu` l'a mise à jour sur le dernier état connu du moteur (FERRO 0.2 : METAL 0.8 et les ajouts de BITUME), à image égale. On garde ce travail ; on en retire ce qui le rattachait à un dépôt de référence. Le son reste le portage en français fait depuis METAL. | L1 |
| D6 | **Marseille seule** dans la 0.3. Paris et New York attendent. | — |
| D7 | **Qui fait quoi.** Le plan : Fable 5.2. L'exécution : Opus 5.5, un agent à la fois, pas de rafale. Le gros des lectures, des premiers jets et des relectures : le Spark (§ 6.2). Les premières passes des tâches que les suites savent vérifier : DeepSeek gratuit par opencode (§ 6.3), en parallèle, puisqu'il ne coûte rien. L'interface reste écrite par Claude. | tous |
| D8 | **Pas dans la 0.3**, à proposer ensuite : l'heure du jour (crépuscule ou nuit, où le feu se verrait bien mieux), Paris, New York. | § 11 |
| D9 | **Le feu gagne la ville** (demande 11). Un feu laissé à lui-même gagne la façade, puis l'immeuble, puis ses voisins, jusqu'à calciner des îlots entiers. La Préfecture a des pompiers et des camions de pompiers, qu'elle produit et commande comme sa police, pour éteindre ; un immeuble éteint à temps reste debout, noirci. Personne n'est montré en feu (D1). Les monuments ne brûlent pas. | L9, L5b, L6, L7, L8 |
| D10 | **Les trois camps, « en gros »** (demande 12). La Convergence, ce sont les casseurs ; le Bastion, les patriotes ; la Préfecture, la police et les pompiers. Les noms du jeu restent. À l'écran : « les casseurs », « les patriotes », « la police et les pompiers » ; l'étiquette politique (« gaucho ») reste hors du jeu, comme toute cause énoncée (D1), et il n'y a ni drapeau, ni emblème, ni slogan, ni organisation réels. L'allure suit : tenues sombres, capuches et foulards pour la Convergence. | L6, L7 |
| D11 | **Commandes et foule** (demandes 9 et 10). Z Q S D font défiler la vue, en plus des flèches et du bouton du milieu ; Arrêt passe donc de S à F, et la première production de Q à A ; les réglages déjà enregistrés passent en version 2 sans perdre les choix du joueur. Un Cortège sur huit porte la banderole, un Piquet sur huit la pancarte. | fait (0.3c) |

## 3. Où l'on en est (12/11/2026, 20 h)

Mise à jour du même soir : les essais 0.3a, 0.3b et 0.3c sont passés en ligne ; l'état des lots est au § 10. Ce qui
suit décrit le point de départ du plan.

**En ligne** : l'essai 0.2, commit `28d1d7c`, sur https://pdr.estrasse.fr.
**`main`** : `a4cfed3`, poussé. Il contient le retrait d'Unreal (`5ac0066`) et la réparation de `noyau.test.mjs`, que ce
retrait avait cassé (le test appelait un modèle Python parti avec `Outils/`).

Quatre agents Fable 5.2 travaillaient chacun sur sa branche. Ils ont été arrêtés deux fois (limite hebdomadaire, puis
passage à Opus) ; leur travail est committé, le dernier commit de trois branches étant un instantané « WIP » non vérifié.

| Branche | Dernier commit | Ce qu'elle contient | Tests (vérifié, machine chargée) |
|---|---|---|---|
| `ferro-rendu` | `402268c` | Le renderer fusionné avec FERRO v0.2, `REGLAGES_MOTEUR` dans `jeu.js`, `PROVENANCE.md` réécrit, `FERRO.md`, `ferro.test.mjs`, `originaux-ferro.mjs`, `rendu.test.mjs` refait. | Tout passe, sauf `noyau` (réparé depuis sur `main`). Essai Chrome sur Marseille : même image qu'en ligne, aucune erreur de console. Ses documents et trois contrôles supposent le dépôt FERRO, supprimé depuis : les contrôles se sautent, à simplifier (L1). |
| `v03-feu-sim` | `4020ac6` (WIP) | Simulation : feu, Molotov, gaz, mises à terre, charges, pierres, modes de victoire, part des manifestants, démo sans fin aux points, IA, banc d'équilibre. Protocole version 2, documenté en tête de `protocole.js`. | `sim.test.mjs` échoue sur le contrôle « en feu ». Le reste passe. |
| `v03-marseille` | `de8cf76` (WIP) | Outil d'extraction étendu (hauteurs, couleurs, mobilier de rue, monuments nommés, horizon lointain), données rafraîchies (184 → 240 Ko), début du générateur. | `noyau` (réparé sur `main`) et `son.test.mjs` (un seuil de temps, 3,1 ms, dépassé sous charge : à rejouer au calme). |
| `v03-musique` | `2dc9248` (WIP) | Les quatre morceaux réécrits (59 → 91 Ko), outils de rendu hors ligne et de mesure. | `musique.test.mjs` échoue : empreintes à refaire, à relire. |
| `integration-a` | `5ac0066` | Vide : la branche d'intégration. | — |
| `wip-ferro-02` | `66687b2` | Premier essai de fusion, abandonné. À supprimer à la clôture. | — |

Les arbres de travail de ces branches sont sous le dossier temporaire de la session, qui ne survit pas à un redémarrage
du Mac : `<temporaire>/v03/wt-<lot>`. Les commits, eux, sont dans le dépôt. Pour retrouver un arbre :
`git worktree prune && git worktree add <dossier> <branche>`.

Au même endroit, les notes et outils des agents, à ranger dans le dépôt par le lot qui s'en sert (§ 7) : `essais-rendu`
(comparaison d'images, essai sans WebGL 2), `essais-feu-sim` et `mesures-feu-sim` (équilibre avant), `travail-marseille`
(`vues.py` : neuf vues fixes de la ville ; comptages), `essais-marseille/base-vues` (les neuf vues avant),
`musique-outils` (rendu hors ligne, mesures, profils), `essais-musique` (mesures et WAV de l'ancienne musique),
`spark/*.fiche.md` (les sept fiches du Spark).

## 4. Ce que David doit voir dans la 0.3

Chaque ligne est un critère de recette : la version n'est pas finie tant qu'une ligne manque.

1. **Molotov.** En jouant la Convergence : on choisit des Furets, on appuie sur la touche du cocktail, on clique une
   cible à 22 m au plus. Les bouteilles partent en cloche avec une traînée de flamme, éclatent, allument un foyer ; les
   unités autour tombent ou fuient ; une barricade, une voiture, un avant-poste touchés prennent feu.
2. **Le feu quand on casse.** Ce que la Convergence casse brûle : flammes, braises, colonne de fumée noire visible de
   l'autre bout de la carte, puis une carcasse calcinée et une trace au sol qui restent.
3. **La réponse de la Préfecture.** Grenades lacrymogènes en cloche, nuage qui fait tousser et reculer ; le canon à eau
   éteint les feux, avec de la vapeur.
4. **Plus de violence.** Charges avec élan et recul, pierres qui volent, unités jetées à terre qui se relèvent ou
   restent couchées quelques secondes avant de disparaître. Aucun sang, aucune arme à feu, personne en feu.
5. **Des personnages mieux animés.** De près : genoux et coudes, pas qui suivent la distance parcourue, gestes entiers
   (frapper, lancer, tomber, se relever, tousser, charger), passages doux d'un état à l'autre, individus qui diffèrent.
   De loin : la foule vit, les couchés se voient.
6. **Une musique sombre.** Quatre morceaux en mineur, tendus, sans fanfare ni batucada ; dans la rue, plus de sifflets
   comiques : tambours lourds, cris, boucliers frappés, sirènes.
7. **Une Marseille reconnaissable.** Hauteurs réelles ou plausibles, toits de tuile, façades par quartier, monuments
   dessinés (au moins l'Hôtel de Ville, le fort Saint-Jean, la Major, le MuCEM si ses tuiles viennent, le palais de la
   Bourse, l'Opéra, Saint-Ferréol, et Notre-Dame de la Garde à l'horizon), arbres, lampadaires, mobilier, terrasses,
   voitures et deux-roues garés, voiliers.
8. **La victoire au choix** et **la part des manifestants**, sur l'écran de préparation ; en partie, le bandeau montre ce
   qui décide (forces restantes, temps restant, points et cible) ; l'écran de fin dit pourquoi la partie a fini.
9. **Une démo qui dure** : une heure sans fin prématurée, de l'action partout, Molotov et gaz dans la première minute,
   la suivante qui s'enchaîne.
10. **Le même confort** : 100 000 unités à 60 images/s en 1440×900 sur ce Mac, 60 images/s sur téléphone à 20 000,
    simulation à 22 ms par itération au plus en moyenne, aucune erreur de console, toutes les suites vertes, le crédit
    OpenStreetMap affiché.
11. **La ville brûle.** Un feu qu'on laisse gagne la façade, l'immeuble, puis le voisin : flammes aux fenêtres, des
    étages bas vers les hauts, fumée noire du toit. Un immeuble que personne n'éteint finit calciné, noir, sans toit. La
    Préfecture envoie pompiers et camions, sirène deux-tons, lances à eau ; un immeuble éteint à temps reste debout,
    noirci. Des îlots entiers brûlent dans une partie où la Préfecture regarde ailleurs.
12. **Les commandes et la foule** : Z Q S D font défiler la vue ; moins de pancartes (fait dans l'essai 0.3c).

## 5. Contrats

### 5.1 Le protocole, version 2 (vérifié : lu dans `v03-feu-sim`)

La référence est l'en-tête de `Jeu/src/sim/protocole.js` sur la branche `v03-feu-sim`. Résumé de ce que la 0.3 ajoute ;
si le lot L4 change un format, il corrige ce paragraphe.

- **Options.** `victoire: { mode: 'dernier' | 'temps' | 'points' | 'mixte', points, duree (minutes) }`, remise en forme
  par `PDR.regles.victoire` (absente : `{ mode: 'dernier', points: 3000, duree: 20 }`) ; choix proposés dans
  `regles.CONSTANTES.VICTOIRE`. `manifestants: 'peu' | 'moyen' | 'beaucoup'` (`regles.parts` : 34/35/31, 40/32/28,
  50/27/23 %). En démo, `victoire` est ignorée et rendue `{ mode: 'dernier', points: 0, duree: 0 }`, dès le message
  « pret ». `CARTE.parts` donne les parts retenues.
- **Unités.** Le tampon garde quatre nombres par unité, `[x, z, cap, code]`. États (`regles.ETATS`, bits 6 à 9 du code) :
  0 OISIF, 1 MARCHE, 2 ATTAQUE, 3 RECOLTE, 4 CHARGE (porte une charge), 5 CONSTRUIT, 6 LEVE, 7 CASSE, 8 REPLI, 9 TIENT,
  10 HORS_JEU, 11 CAPACITE, et depuis la 0.3 : 12 A_TERRE, 13 LANCE, 14 SUFFOQUE, 15 ASSAUT. Les seize valeurs sont
  prises. Une unité hors jeu reste couchée 6 s (1,5 s au-delà de 4 096 gisants) avant que son emplacement se libère.
- **`etat`.** `eco[camp]` gagne `depart`, `force` (vivantes / départ) et `deroute` (−1, ou les secondes avant
  l'élimination d'un camp sans base). `victoire: { mode, points, duree, reste (s, −1 sans limite), plafond, demo }`.
  `raison` (`RAISONS_FIN` : `''`, `dernier`, `points`, `temps`, `plafond`, `nul`). `cassables` : 0 intact, 1 cassé,
  2 en feu, 3 calciné. `feux` : `Float32Array`, 8 nombres par foyer `[id, x, z, rayon, intensite 0..1, reste (s), sorte,
  cible]`, 128 foyers au plus, sortes `SORTES_FEU` (0 sol, 1 objet, 2 barricade, 3 avant-poste). `nuages` : 6 nombres
  `[id, x, z, rayon, densite 0..1, reste]`, 64 au plus. Tous deux envoyés à chaque changement et toutes les cinq
  itérations tant qu'il y en a ; `lireFeu`, `lireNuage` les lisent. `mesure` gagne `feux, nuages, aTerre, gisants`.
- **Commandes.** `CAPACITE` accepte `'lacrymo'` et `'molotov'` en plus de `'salve'` et `'jet'` ; un `'jet'` sur un feu
  l'éteint. `MOLOTOV: 17`, `{ ids, x, z }`, raccourci du précédent : Convergence seulement, 4 Matériaux le cocktail.
- **Évènements** (six nombres `[type, x, z, faction, a, b]`). 26 MOLOTOV, 29 LACRYMO, 33 PIERRE : `x, z` est le lanceur,
  `a, b` le déplacement jusqu'au point de chute ; la durée du vol est `regles.dureeVol(sorte, distance)` (pierre 0,6 s ;
  molotov 0,5 s + d/20 ; lacrymogène 0,6 s + d/22) : la page dessine la cloche. 27 FEU_ALLUME (`a` : id du foyer, `b` :
  sorte), 28 FEU_ETEINT (`b` : 1 à l'eau, 0 consumé), 30 GAZ (`a` : id du nuage, `b` : rayon final), 31 A_TERRE (`a` :
  type, `b` : cause ; 24 au plus par itération), 32 CHARGE (`a` : direction, `b` : type), 34 DEROUTE, 35 BASE_REPRISE,
  36 POSTE_OCCUPE, 37 POSTE_REPRIS. 21 VICTOIRE porte en `b` l'indice de la raison. Une page ignore un type inconnu.
- **Fin.** `{ type: 'fin', vainqueur, raison, temps, victoire, eco, bilan, enregistrement }`. Le bilan gagne `molotovs,
  grenades, pierres, charges, aTerre, feux, eteints, sources[8]`.
- **Règles de victoire.** Un camp est éliminé après 30 s sans base (QG occupé et aucun avant-poste achevé et libre),
  ou aussitôt s'il est sans base avec moins de 2 % de ses effectifs de départ. Sans limite de temps, une limite de
  sécurité arrête la partie à 90 minutes (60 en démo, raison `plafond`).
- **Chiffres des capacités** (`regles.js`) : pierres, portée 14 m, pression 3, recharge 5 s ; molotov, portée 22 m, rayon
  3 m, pression 12, 8 unités au plus, mise à terre 3 s, recharge 25 s ; charge, portée 12 m, 2 s, pression 8 à 10, recul
  1,5 à 2 m ; salve, mise à terre 4 s ; lacrymogène, portée 26 m, recharge 35 s. `jet.max` = 8 (le jet du canon à eau
  ne touche que les 8 unités les plus proches à chaque impulsion) ; `GAZ.plein` = 20 (un nuage presse à plein 20 unités
  et partage sa pression au-delà) ; `RYTHME` = 1 (multiplie toutes les pressions : contact, salve, jet, pierres, charge,
  souffle du cocktail). Ce sont des chiffres de premier jet : L4 les règle.
- **Ajouts prévus par L9** (D9 ; contrat que L5b, L6, L7 et L8 attendent, que L9 précise s'il le faut) :
  - **Types** 13 `pompiers` (« Pompiers », à pied) et 14 `camion-pompiers` (« Camion de pompiers », véhicule), à la
    Préfecture : `TYPES_PAR_FACTION[2]` devient `[8, 9, 10, 11, 12, 13, 14]`. Le code d'unité garde ses 4 bits de type,
    15 reste libre. Raccourcis de production : U et I (Z Q S D, P et les touches de la vue sont pris).
  - **Ville** : `sites.immeubles`, un par bâtiment du carré jouable, monuments exclus (§ 5.3).
  - **`etat.immeubles`** : `Float32Array`, 4 nombres par immeuble qui n'est plus intact, `[id, etat, intensite 0..1,
    avancee 0..1]`, états 1 en feu, 2 éteint (noirci), 3 calciné ; 1 024 au plus. `avancee` dit ce que le feu a déjà
    pris : la page monte les flammes des étages bas vers les hauts. Envoyé comme les foyers.
  - **`etat.lances`** : 5 nombres par jet d'eau, `[x, z, cx, cz, hauteur]` (de la lance au point visé, hauteur sur la
    façade), 96 au plus, à chaque itération où l'on arrose.
  - **Commande** `ETEINDRE: 18`, `{ ids, immeuble }` ou `{ ids, x, z }` (un foyer) : pompiers, camions et canon à eau.
  - **Évènements** 38 IMMEUBLE_FEU (`a` : id, `b` : camp à l'origine du feu), 39 IMMEUBLE_ETEINT (`a` : id, `b` : 1
    éteint à l'eau, 0 calciné). `mesure` gagne `immeubles` (en feu) ; le bilan, `immeublesBrules` et `immeublesSauves`.

### 5.2 Le moteur de rendu (écrit par l'agent, `ferro-rendu`)

`Jeu/src/moteur/renderer.js` est le moteur de rendu du jeu. Sur la branche, c'est le dernier état du moteur commun
(FERRO 0.2) plus six ajouts du jeu, marqués « PDR » : origine, voile (`fx.voile`), éclairage (`PDR_GLSL`, `PDR_INDOOR`,
`PDR_UNIFORMS`), lots (`fx.lots = [{ values, groups, version }]`), foule (`fx.foule = { ombre, couleur }`,
`renderer.gl`, `renderer.pdr`), msaa (`fx.msaa === false`). Les anciens réglages en dur passent par `REGLAGES_MOTEUR`
dans `jeu.js` (`msaa: 4`, `shadowMapScale: 2`, `vignette: .84`, `bloomThreshold: [.86, .98]`).

Depuis la suppression du dépôt commun, ce fichier appartient au jeu : un lot peut le faire évoluer quand le jeu en a
besoin. La règle qui reste : une ligne dans `Jeu/src/moteur/PROVENANCE.md` pour chaque changement du moteur (quoi,
pourquoi, quel coût), et `rendu.test.mjs` vert.

Ce que le décor et la foule ont aujourd'hui pour dessiner : des primitives instanciées (`box`, `sphere`, `cylinder`,
`octa`, `ring`, `bevel`, `foliage`), les matières 0 à 18 dont une émissive, huit lampes dynamiques au plus
(`fx.lights`), le bloom. D'après le Spark, il n'y a pas de transparence : la fumée et le gaz se font en volumes
opaques, sauf si L5 ajoute au moteur de quoi faire mieux.

### 5.3 La ville

L'interface d'une ville ne change pas (`objets`, grille de navigation, `sites` : lieux, gisements, cassables, départs,
QG, `etendue`, `attribution`), sauf un ajout de L9 : `sites.immeubles`, dans les deux villes, `[{ id, x, z, rayon, h,
boites: [{ x, z, lx, lz, lacet }], voisins: [id], pieces: [indices dans objets] }]`. `voisins` : les bâtiments à moins
de 3 m, par où le feu passe ; `pieces` : ce que le décor noircit ou ôte (la toiture d'un immeuble calciné). Les cassables gardent leur format ; chaque objet porte ses points de structure et son
rendement, et la simulation en tire son feu (`regles.feuObjet`). Le lot L2 peut ajouter des sortes : la simulation
donne des valeurs par défaut à une sorte inconnue, et le décor (L5) doit la dessiner intacte, cassée, en feu, calcinée.
L2 remet donc à L5 la liste des sortes et leur dessin.

Remis par L2 (commit `ce67c66`) : quatre sortes nouvelles, `'deux-roues'`, `'conteneur'`, `'terrasse'`, `'kiosque'`
(`casser(...)` dans `ville-reelle.js`). C'est fait (commit 05714ee) : `SORTES_CASSABLES` compte 10 sortes, et deux-roues,
conteneur, terrasse et kiosque ont les indices 6 à 9, que l'évènement CASSE rend dans son champ `b`. Comptes pour 9 / 13
/ 15 îlots :

| Sorte | 9 | 13 | 15 | | Sorte | 9 | 13 | 15 |
|---|---|---|---|---|---|---|---|---|
| voiture | 552 | 1 491 | 2 113 | | deux-roues | 154 | 270 | 339 |
| vitrine | 220 | 678 | 932 | | terrasse | 150 | 317 | 383 |
| poubelle | 267 | 553 | 774 | | conteneur | 16 | 34 | 40 |
| banc | 75 | 104 | 122 | | kiosque | 3 | 3 | 5 |
| abribus | 27 | 43 | 46 | | barrière | 24 | 24 | 24 |

### 5.4 Le son

L'API `PDR.musique` (clés, lecteur, rappel à chaque rangée, export MOD, préchauffage) et les façades `PDR.son` et
`PDR.audio` ne changent pas de forme. L3 change le contenu des morceaux ; L8 les bruitages et la rue.

### 5.5 Règles pour tous les lots

- Tout se calcule dans la page : aucune image, texture, modèle, police ni son importés, aucun CDN, aucun réseau.
- Simulation et ville déterministes : ni `Math.random` ni `Date.now` dans un résultat ; la ville évite aussi
  `Math.sin, cos, tan, atan, atan2, hypot, exp, log, pow` (`ville-reelle.test.mjs` le contrôle).
- Fichiers du jeu, commentaires et textes à l'écran en français, dans le style des fichiers existants.
- Ni serveur ni port ouvert par le jeu ou ses outils. Le navigateur se pilote par tube : `Jeu/verifications/essai-jeu.py`
  (§ 6.5). opencode ouvre, lui, un port local le temps de son lancement : c'est son fonctionnement.
- Un lot ne touche que ses fichiers (§ 7). S'il doit en changer un autre, il le dit dans son compte rendu.
- Un lot ne committe jamais `Jeu/dist/point-de-rupture.html` ni `Jeu/SIZE.json` : l'intégration les reconstruit.
- Commits fréquents, en français, sur la branche du lot ; dernière ligne : `Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>` (ou le modèle qui écrit vraiment). Ni push ni fusion par un lot.
- Dire ce qui est vérifié, comment, et ce qui ne l'est pas.
- Chaque page mise en ligne a sa version : avant `Jeu/deposer.sh`, passer `VERSION` à la lettre suivante dans
  `Jeu/construire.py` (0.3b, 0.3c… puis 0.3) et, si l'étape change, `EDITION`. L'écran titre les affiche, comme dans METAL
  (David, 12/11 : « je veux voir la version sur l'ecran titre comme on a fait pour metal »).

## 6. Organisation

### 6.1 Rôles

- **David** tranche. Une décision datée de lui passe avant ce plan.
- **Fable 5.2** a écrit ce plan. Depuis le 12/11 au soir, la session principale tourne sur Opus 5.5 (choix de David) :
  c'est elle qui le corrige quand une décision change, et qui y a ajouté D9 à D11, L9 et L5b.
- **Opus 5.5** a exécuté L5 (un agent par lot). Depuis la demande 13 (« go full spark pour economiser tes tokens »),
  plus d'agent Opus : l'agent de L4 a été arrêté après avoir committé son travail.
- **Le Spark** écrit le code des lots par la chaîne (`Jeu/outils/spark/chaine.py`) : la session principale découpe un
  lot en fiches de tâche courtes (12 000 caractères de demande, 30 000 au plus, extraits désignés par lignes ou par
  motif) ; la chaîne demande des blocs AVANT / APRÈS au Spark, les applique, contrôle la syntaxe, lance les tests de la
  fiche, committe si c'est vert, sinon renvoie l'échec au Spark (quatre tours au plus). La session principale relit les
  diffs, rejoue les suites et l'essai Chrome, et reprend à la main ce que la chaîne n'a pas su faire. Le Spark lit et
  résume aussi ; il ne décide rien et ne prouve rien.
- **DeepSeek par opencode** fait la première passe d'une tâche bornée, dans l'arbre de la branche : il lit, modifie,
  lance les suites, rend compte. Il ne committe pas.
- **La session principale** lance les lots, vérifie les comptes rendus sur pièces (suites, captures), fusionne, pousse,
  met en ligne, tient David au courant.

### 6.2 Se servir du Spark

L'outil : `python3 Jeu/outils/spark/spark.py` (son en-tête donne les commandes). Trois usages, dans cet ordre de rendement :

1. **Digérer avant de lire.** Un fichier ou un diff de plus de 30 Ko ne se lit pas en entier : `spark.py digerer` en
   fait une fiche, et l'on ne lit ensuite que les fonctions dont on a besoin.
2. **Premier jet** d'une fonction autonome, d'un test, d'un paragraphe de documentation : une demande par sujet, avec
   la signature exacte et l'extrait de code voisin (`spark.py demander`). On relit, on corrige, on teste.
3. **Relecture** du diff d'un lot avant de le rendre, fichier par fichier, avec trois à cinq questions précises.

Les limites mesurées : 12 000 caractères par demande, jamais plus de 30 000 ; mode direct ; 20 s à 4 min par demande
selon la charge du Spark. Sur une relecture, la plupart de ses constats sont faux : chacun se vérifie dans le code. Il
prend la coupure d'un morceau pour du code tronqué. Si le Spark est occupé ou ne répond pas, on le dit et on continue
sans lui sur les petites choses ; pour une grosse lecture, on demande à David.

Ne passent pas par le Spark : l'interface et le dessin (c'est le travail de Claude), les retouches de quelques lignes,
tout ce qui demande le navigateur.

### 6.3 Se servir d'opencode et de DeepSeek

`Jeu/outils/opencode/lancer.sh <arbre de travail> <consigne.md> [journal]` lance opencode avec
`opencode/deepseek-v4.1-flash-free`, gratuit, sur une copie de travail. À la différence du Spark, c'est un agent : il
ouvre lui-même les fichiers, les modifie et lance les suites.

- **Réglage isolé, toujours.** Le réglage d'opencode de cette machine branche la mémoire KBZA et charge les consignes
  globales ; or aucun LLM dans le nuage ne doit traiter cette mémoire. Le lanceur passe donc son propre réglage : pas de
  serveur MCP, pas de consignes globales, et seulement `node`, la lecture de git et de fichiers, `git rm`, `git mv` et la
  construction de la page ; le reste est refusé, le réseau et les fichiers hors du dossier aussi. Ne jamais lancer
  `opencode` nu avec un modèle distant sur ce Mac.
- **Pour quoi.** Une tâche bornée, sur des fichiers nommés, que les suites vérifient : remettre une suite au vert,
  ranger des tests ou des documents, mesurer et rendre un tableau, la première passe d'un lot sans image à juger.
  Pas pour l'interface ni pour ce qui se juge à l'œil : il ne voit pas les captures.
- **La consigne** : en français, le contexte en trois lignes, les fichiers permis, les étapes numérotées, « n'affaiblis
  aucun contrôle », « ne committe pas », et ce qu'il doit rendre. Elle renvoie à ce plan plutôt que de le recopier.
- **Ensuite** : on relit son diff, on relance soi-même les suites qu'il dit vertes, on committe avec une ligne qui dit
  que le premier jet vient de lui. Premier essai, le 12/11 : la provenance du moteur (commit `71f99a6`), juste du
  premier coup, en dix minutes.

### 6.4 Branches

Chaque lot a sa branche et son arbre de travail. Les lots de la première vague reprennent les branches du § 3 et
commencent par `git merge main` (pour le test du noyau et ce plan). Les lots de la seconde vague partent de
`integration-b`. L'intégration fusionne dans `integration-a`, `-b`, `-c` ; `main` n'avance que par la session principale,
après vérification, en avance rapide.

### 6.5 Vérifier

- **Les suites** : `for f in Jeu/verifications/*.test.mjs; do node "$f" >/dev/null 2>&1 || echo "ECHEC $f"; done`.
  Quatre à cinq minutes sur la machine au calme. `son.test.mjs` contient un seuil de temps : sous charge, le rejouer seul.
- **Le navigateur** : `python3 Jeu/construire.py`, puis `python3 Jeu/verifications/essai-jeu.py
  Jeu/dist/point-de-rupture.html <dossier> [effectifs] [ville]` (variables `LARGEUR`, `HAUTEUR`, `MOBILE=1`). Il va du
  titre à la démo, à la préparation, à la partie, sélectionne, donne un ordre ; il rend six captures et
  `resultats.json` (`ips`, `lentes`, `simMoy`, `simP95`, `journal` de la console). Pour d'autres parcours, en faire une
  copie étendue dans `Jeu/verifications/` : c'est ainsi que se construisent les bancs des lots L5 à L7.
- **Les références** : les captures de la 0.2 (`<temporaire>/integration/essai-marseille`, `essai-damier`) et ses
  mesures (README, « Essai 0.2 ») : 60 images/s, 0 image lente, 16 à 22 ms par itération à 100 000 unités.
- **La charge** : noter `uptime` avec chaque mesure ; ne comparer que des mesures prises dans les mêmes conditions.

## 7. Les lots

Ordre d'exécution au § 8. Pour chaque lot : d'où il part, ses fichiers, ce qui reste, ce que le Spark fait, la recette.

### L1 — Moteur de rendu à jour : finir (dans l'intégration A)

**Part de** `ferro-rendu` (`402268c`). Fusion faite, tests verts, image identique sur Marseille.
**Reste** :
1. L'essai sur le damier et sur téléphone ; le repli Canvas 2D (script `sans-webgl2.py` de `essais-rendu` : il existe
   une mesure « avant », pas « après ») ; `banc-rendu.py --moteur` avant et après sous la même charge.
2. Défaire ce qui suppose un dépôt de référence, puisqu'il n'y en a plus : `PROVENANCE.md` devient l'histoire du moteur
   dans ce jeu (il vient du jeu METAL, `M4D135/METAL` ; mis à jour le 12/11 sur FERRO 0.2 avant la suppression de ce
   dépôt ; les six ajouts du jeu ; puis une ligne par changement) ; `FERRO.md` s'y fond ; `ferro.test.mjs` et
   `originaux-ferro.mjs` partent ; `rendu.test.mjs` garde ses contrôles du jeu (ajouts du jeu, interrupteur MSAA,
   comparaison avec la copie d'avant, décor, réalisateur, caméra) et perd les trois qui se sautent faute de clone.
   Plus de mention « à récolter ».
3. Les paragraphes « moteur » du README et de la conception.

Trop petit pour un agent : c'est la première tâche de l'intégration A.

### L2 — Marseille : finir

**Part de** `v03-marseille` (`de8cf76`, WIP). **Fichiers** : `Jeu/src/ville-reelle.js`, `Jeu/src/villes/*`,
`Jeu/outils/plans/*`, `plans.test.mjs`, `ville-reelle.test.mjs`, `ville.test.mjs` si l'interface commune change.

D'après le Spark, l'outil d'extraction sait déjà lire : les hauteurs (`render_height` : 1 080 bâtiments sur 5 274) et
les couleurs des bâtiments ; quinze sortes de mobilier (terrasse, potelet, corbeille, conteneur, vélos, motos, arrêt de
bus, abri, boîte aux lettres, fontaine, toilettes, kiosque, œuvre, panneau…) ; dix-sept monuments nommés (la Major, la
tour du Roi René, Saint-Laurent, le fort Saint-Nicolas, Saint-Victor, Notre-Dame de la Garde, le MuCEM, la porte d'Aix,
les Réformés, l'Hôtel de ville, Saint-Ferréol, le palais de la Bourse, l'Opéra, la Vieille Charité, le clocher des
Accoules, la halle Puget…) ; un « lointain » (boîtes, repères, sommets) ; des palettes (enduits du Panier, tuiles,
pierres rose et blonde, ardoise, verre) et six modèles de monument (`STYLES`). Deux tuiles manquent à l'ouest
(`14/8435/6001` et `6002`) : le lointain s'arrête avant le MuCEM.

**Reste** :
1. Relire le WIP, faire passer `plans`, `ville-reelle`, `ville`. Vérifier que le générateur se sert bien de tout ce que
   l'outil extrait (le diff du générateur est court : 179 lignes).
2. Bâtiments : hauteur réelle quand elle existe, sinon plausible par quartier (Panier bas ; Canebière et rue de la
   République, cinq à sept étages) ; toits de tuile ou terrasses ; façades par quartier ; cours intérieures.
3. Monuments, dans le carré jouable ou visibles depuis lui, par les modèles de `STYLES` ; Notre-Dame de la Garde et
   les forts à l'horizon. Chercher les deux tuiles manquantes ; sinon l'écrire.
4. Rue : platanes le long des avenues, lampadaires, mobilier, terrasses, voitures et deux-roues garés, voiliers et
   barques, quais, pavés du Panier et des places, passages piétons si cela ne coûte rien.
5. Cassables : ajouter ce qui peut brûler (voitures, deux-roues, corbeilles, conteneurs, abris, terrasses, kiosques),
   sans changer le format. Donner à L5 la liste des sortes, leurs comptes et leur dessin.
6. Budget, à mesurer pour 9, 13 et 15 îlots, avant et après : objets par primitive, temps de construction (0,1 à 0,2 s
   en 0.2 ; 0,4 s au plus), taille des données (240 Ko aujourd'hui ; la page a un budget de 3 Mo et pèse 1,27 Mo),
   60 images/s à 100 000 unités.
7. Ranger `vues.py` et les comptages dans `Jeu/outils/plans/` ; refaire les neuf vues et les comparer à `base-vues`.

**Le Spark** : fiche du générateur (`ville-reelle.js`, 112 Ko) avant de le lire ; relecture du diff final.
**Recette** : les neuf vues, où l'on reconnaît le Vieux-Port, l'Hôtel de Ville, le fort Saint-Jean, la Canebière,
l'Opéra ; les trois suites ; le budget ; l'essai à 100 000 unités et sur téléphone ; le texte « Plan réel » pour la
conception et le README.

### L3 — Musique : finir

**Part de** `v03-musique` (`2dc9248`, WIP). **Fichiers** : `Jeu/src/moteur/musique.js`, `musique.test.mjs`.

D'après le Spark, les quatre morceaux sont réécrits : « Point de rupture » en ré mineur à 100 à la noire, « La
Convergence » en la phrygien à 126 (tresillo), « Le Bastion » en do mineur à 88, « La Préfecture » en mi phrygien à 124 ;
douze motifs chacun, six calmes et six tendus ; vingt-cinq instruments (glas, cuivres graves, cordes saturées, chœurs
graves, synthés froids, sirènes, tambours lourds, enclume). Le fichier se charge sans erreur de syntaxe (vérifié).
L'agent mesurait le coût du préchauffage quand il a été arrêté.

**Reste** : relire chaque morceau contre son plan (tonalité, forme, rôle des quatre voies, contraste calme et tendu) ;
vérifier qu'il ne reste ni fanfare, ni batucada joyeuse, ni sifflet dans les morceaux (les percussions latines du kit ne
doivent pas sonner la fête) ; rendre les modules hors ligne et mesurer contre l'ancienne musique (`essais-musique`) :
pas de saturation, pas de composante continue, crête et niveau par section, spectre plus grave, pas de silence
accidentel ; ramener le préchauffage au coût de la 0.2 (le mesurer) ; refaire `musique.test.mjs` en gardant tous ses
contrôles ; `son.test.mjs` vert sans y toucher ; ranger les outils dans `Jeu/outils/musique/`.
**Le Spark** : un paragraphe par morceau pour la provenance et le README, à partir du plan écrit dans le code.
**Recette** : les deux suites ; le tableau des mesures avant et après ; l'essai Chrome (la musique joue après un geste,
l'export rend un module « M.K. » valide).

### IA — Intégration A, et mise en ligne intermédiaire

Dans `integration-a` : fusionner `main`, `ferro-rendu`, `v03-marseille` (`v03-musique` n'est pas prêt : la musique
s'intègre plus tard, dans une intégration à part ou dans IB) ; finir L1 ; mettre à jour le
README (section « Essai 0.3, en cours ») et les paragraphes moteur, plan réel et musique de la conception ; ranger dans
le dépôt les outils encore dehors ; construire ; toutes les suites ; trois essais Chrome (Marseille 100 000, damier
100 000, téléphone 20 000) comparés aux captures de la 0.2 ; vérifier dans la page le son, les réglages, l'export ;
committer avec la page construite et contrôler qu'une seconde construction ne change rien.
Puis la session principale vérifie, avance `main`, pousse, met en ligne (`Jeu/deposer.sh`), republie l'aperçu. David
voit alors la nouvelle Marseille ; la musique reste celle de la 0.2 jusqu'à l'intégration de L3, et la rue garde ses
anciens bruitages jusqu'à L8, à lui dire.

### L4 — Simulation : finir

**Part de** `v03-feu-sim` (`4020ac6`, WIP). **Fichiers** : `Jeu/src/sim/*`, `sim.test.mjs`, `regles.test.mjs`,
`noyau.test.mjs`, `hote.test.mjs` (protocole), `equilibre.mjs`, `banc-sim.mjs`, et dans `CONCEPTION.md` la liste des
décisions et les règles (§ 1).

Le premier jet couvre tout le protocole du § 5.1 (vérifié) et, d'après le Spark, des réserves fixes (128 foyers,
64 nuages, 256 projectiles, 16 384 pierres), une IA qui passe à l'attaque décisive quand elle domine (rapport de 1,2) et
une limite de lancers par itération.

**Reste** :
1. Relire le WIP (1 350 lignes ajoutées, surtout `monde.js`, 93 → 140 Ko). Pistes du Spark à vérifier une par une, la
   plupart sont sans doute fausses : `arroser` qui rendrait la main après un seul ordre ; `casSorte` passé en
   `Int8Array` ; l'indice de `sources[camp × 8 + origine]` ; la démo qui force le mode « dernier » alors que la cible de
   points resterait lue ; `feuObjet` et sa borne ; la recharge des jetons de lancer.
2. Faire passer `sim.test.mjs` (« en feu ») et toutes les suites ; garder le déterminisme (deux parties, même condensé).
3. Vérifier que la page d'aujourd'hui tourne sur cette simulation : construire, essai Chrome à 100 000 unités, aucune
   erreur de console, les nouveaux états retombant sur une animation existante.
4. Équilibre, au banc `equilibre.mjs`, Marseille et damier, 20 000 et 100 000 unités, les quatre modes, parts « moyen » :
   les trois camps gagnent chacun des parties ; « Jusqu'au dernier » finit entre 15 et 30 minutes simulées ; l'attrition
   ne décide plus la partie dans les premières minutes (en 0.2, 70 % des unités étaient hors jeu à 10 min) ; les IA se
   servent des cocktails, du gaz, du canon, des charges.
5. Démo : soixante minutes simulées avec, minute par minute, des unités en vie dans chaque camp, des coups, des foyers ;
   les nouveautés dans la première minute.
6. Coût : millisecondes par itération à 100 000 unités avant et après (`banc-sim.mjs`), 10 % de plus au maximum.
7. `CONCEPTION.md` : les demandes 2, 3 et 4 du § 1 mot pour mot avec leur date ; les règles et les chiffres ; le ton (D1).
8. Corriger le § 5.1 de ce plan si un format a changé.
9. Ajouter à `SORTES_CASSABLES` les quatre sortes de L2 (§ 5.3), avec leurs valeurs de feu.

**Le Spark** : la fiche existe (`spark/sim.fiche.md`) ; relecture finale du diff de `monde.js` par morceaux ; premier
jet des contrôles à ajouter à `sim.test.mjs` (un par mécanique).
**Recette** : suites vertes ; tableau d'équilibre avant et après ; durée des parties par mode ; relevé de la démo ;
coût ; essai Chrome sans erreur.

### L9 — Le feu gagne la ville : immeubles et pompiers (simulation)

**Part de** la fin de L4, branche `v03-immeubles`. **Fichiers** : ceux de L4, plus `Jeu/src/ville.js` et
`Jeu/src/ville-reelle.js` pour `sites.immeubles` seulement, et leurs tests. Ajouté le 12/11 au soir (D9).

**À faire** (chiffres de premier jet, réglés au banc) :
1. **Les immeubles** : `sites.immeubles` dans les deux villes (§ 5.3), un par bâtiment du carré jouable, monuments
   exclus ; déterministe, sans les fonctions interdites (§ 5.5) ; coût de construction mesuré, 0,4 s au plus en tout.
2. **Prise de feu** : un foyer à moins de 3 m d'une façade la chauffe ; 15 s d'un foyer à pleine intensité et
   l'immeuble prend. Un cocktail qui éclate à moins de 2,5 m d'une façade l'allume aussitôt une fois sur trois (tirage
   déterministe). Le camp à l'origine du feu est retenu.
3. **Le feu grandit et passe** : l'intensité monte en 40 s ; à pleine intensité, l'immeuble se consume en 4 minutes
   (`avancee` de 0 à 1). Au-dessus de 0,6, il chauffe ses voisins, qui prennent après 25 s : un îlot laissé à lui-même
   brûle d'un bout à l'autre en quelques minutes. À 1, il est calciné : plus de flammes, 60 s de fumée. Pas plus de 48
   immeubles en feu à la fois ; au-delà, les prises attendent.
4. **Autour** : une unité à moins de 4 m d'une façade en feu perd de la cohésion selon l'intensité et s'en écarte.
5. **Pompiers et camions** pour la Préfecture (§ 5.1). Pompiers : lot 6, lance à 8 m. Camion : lot 1, population 6,
   lance à 16 m, quatre à cinq fois le débit d'un pompier, plus rapide sur la chaussée. Ils frappent à peine et se
   font frapper comme toute la Préfecture.
6. **Éteindre** : `ETEINDRE` mène les unités à portée ; elles arrosent (état CAPACITE, cap vers la cible). Arrêtées ou
   en position, elles arrosent d'elles-mêmes le feu le plus proche à portée. Le canon à eau éteint aussi un immeuble,
   moins vite. Un immeuble ramené à 0 est éteint, noirci, et peut reprendre.
7. **Protocole** du § 5.1, documenté en tête de `protocole.js` ; corriger le § 5.1 si un format change.
8. **Points** : un immeuble calciné compte pour le camp à l'origine du feu ; un immeuble éteint, pour la Préfecture.
   Les règles de victoire ne changent pas.
9. **IA** : la Préfecture produit des pompiers aux premiers feux, des camions ensuite ; elle envoie les plus proches
   sur les immeubles en feu près de ses lieux et de sa base, avec une escorte quand la Convergence est là. La
   Convergence vise de ses cocktails les façades près de ses barricades et des lieux qu'elle tient. Le Bastion ne s'en
   mêle pas.
10. **Démo** : en une heure, des immeubles qui brûlent, des pompiers qui arrivent, des îlots sauvés, d'autres calcinés.
11. **Coût** : 10 % de plus par itération au maximum à 100 000 unités (`banc-sim.mjs`).

**Le Spark** : premier jet des contrôles de `sim.test.mjs` (un par mécanique) et de la construction de
`sites.immeubles` ; relecture du diff.
**Recette** : `sim.test.mjs` (prise de feu, propagation, extinction, calciné, plafond de 48, commandes mal formées
refusées, déterminisme) ; les tests des deux villes (immeubles, voisins, pièces, coût) ; le banc d'équilibre (une
partie où la ville brûle, une où les pompiers la sauvent) ; un relevé de démo ; l'essai Chrome de la page sans erreur.

### IB — Intégration B

`integration-b` = `main` (après IA) + `v03-feu-sim`. Construire, suites, un essai Chrome (Marseille, 100 000) : la page
de la 0.2 tourne sur la nouvelle simulation, sans erreur ; le feu ne se voit pas encore. Pas de mise en ligne.

### L5 — Le feu à l'écran

**Part de** `integration-b`, branche `v03-feu-ecran`. **Fichiers** : `Jeu/src/decor.js`, son test s'il en a un, un banc
`Jeu/verifications/banc-feu.py` ; dans `jeu.js`, seulement ce qui passe l'état au décor.

D'après le Spark, `decor.js` a déjà : une réserve de 320 effets (`E.SALVE`, `E.JET`, `E.LEVEE`, `E.ECLATS`) faits de
« particules » et de « solides » en primitives instanciées, rendus dans le tableau `dynamique` de `decor.cadre` ; des
teintes (`T_FLAMME`, `T_BRAISE`, `T_FUMEE`, `T_NUAGE`, `T_EAU`…) ; le feu des barricades (16 au plus, flammes en `octa`,
braises en `sphere`, trois sphères de fumée, une lampe pour les trois plus proches) ; huit lampes dynamiques.

**À faire** :
1. **Foyers** de `etat.feux`, jusqu'à 128 : de près, flammes qui dansent, braises, lueur ; de loin, la lueur et la
   fumée seules. L'intensité du foyer règle la taille ; les trois dernières secondes, il meurt.
2. **Colonnes de fumée** : hautes (30 à 80 m), noires, penchées par le vent, lisibles à 900 m. C'est la signature du feu
   en plein jour. Une dizaine de volumes par colonne.
3. **Cocktail au sol** (`sorte` 0) : une flaque de feu, un disque émissif et une couronne de flammes basses.
4. **Projectiles** : la bouteille et sa traînée de flamme, la grenade et son filet de fumée blanche, les pierres ; en
   cloche, de l'évènement au point de chute, pendant `dureeVol` ; à l'arrivée, un éclat et un éclair de lampe.
5. **Nuages de gaz** de `etat.nuages` : amas de volumes pâles qui grossit deux secondes puis se délite avec la densité.
6. **Cassables** : état 2, l'objet et ses flammes ; état 3, la carcasse noircie. Les sortes nouvelles de L2 se
   dessinent dans les quatre états : deux-roues, conteneur, terrasse, kiosque (§ 5.3), à dessiner en feu et calcinés.
7. **Traces de brûlé** : un disque sombre au sol là où un foyer s'est éteint, 512 au plus, dans un lot stable refait
   seulement quand la liste change.
8. **Lampes** : les huit foyers les plus proches du point visé éclairent façades et foule, en vacillant.
9. **Eau sur le feu** (`FEU_ETEINT`, `b` = 1) : un panache de vapeur.
10. **Brouillard de guerre** : un foyer dans une case que le joueur ne voit pas ne se dessine pas, fumée comprise.

Le moteur est celui du jeu (§ 5.2) : si une fumée ou un gaz convaincants demandent de la transparence ou de vraies
particules, le lot peut les ajouter à `renderer.js`, avec sa ligne dans `PROVENANCE.md` et son coût mesuré.

**Budget** : 128 foyers et 64 nuages à l'écran sans descendre sous 60 images/s à 100 000 unités ; 4 000 instances de
plus au maximum ; le temps du décor par image (`decor.mesure`) relevé avant et après.
**Le Spark** : fiche de `decor.js` (existe : `spark/decor.fiche.md`) ; premier jet de chaque dessin d'effet, un par
demande, à partir du dessin du feu de barricade existant.
**Recette** : `banc-feu.py` injecte un faux état (foyers de chaque sorte, nuages, évènements de vol) et rend des captures
de près et de loin ; une partie où l'IA lance des cocktails, capturée ; les mesures.

### L5b — Les immeubles en feu à l'écran

**Part de** l'intégration de L5 et de L9, branche `v03-immeubles-ecran`. **Fichiers** : ceux de L5. Ajouté le 12/11 au
soir (D9) ; L5 a été prié de garder ses dessins de flammes, de fumée et de lampe réutilisables.

**À faire** :
1. **En feu** : flammes aux fenêtres, des étages bas vers les hauts selon `avancee`, lueur sur la rue et les façades d'en
   face, braises, et une grosse colonne de fumée noire depuis le toit, lisible de l'autre bout de la carte.
2. **Éteint** : suie au-dessus des fenêtres, un filet de fumée blanche qui s'épuise.
3. **Calciné** : murs noircis, toiture ôtée (`pieces`), fenêtres vides, fumée qui s'éteint en une minute.
4. **Lances** (`etat.lances`) : arc d'eau du pompier ou du camion jusqu'au point visé, gerbe et vapeur à l'impact.
5. **Lampes** : un immeuble en feu passe avant un foyer dans le choix des huit lampes.
6. **Brouillard de guerre** comme pour les foyers.

**Budget** : 48 immeubles en feu et 96 lances à 60 images/s à 100 000 unités ; 6 000 instances de plus au maximum.
**Recette** : le banc du feu étendu (immeubles dans les trois états, lances), captures de près et de loin ; une partie où
un îlot brûle, capturée ; les mesures.

### L6 — Les animations

**Part de** `integration-b`, branche `v03-animations`. **Fichiers** : `Jeu/src/foule.js`, `foule.test.mjs`, un banc
`Jeu/verifications/banc-animations.py`.

D'après le Spark : deux textures `[x, z, cap, code]` (état courant et précédent), interpolées ; un squelette de neuf os
(corps, tête, deux bras, deux jambes, charge portée, outil, bouclier) en boîtes rigides ; une fonction `poser` qui
calcule les angles selon l'état, avec des oscillations en `sin(t × fréquence + phase)` ; deux niveaux de détail, des
figurines de près (12 000 au plus, seuil de 26 pixels) et des points de loin ; aucun passage doux entre deux états ; les
hors-jeu sont assis.

**À faire** :
1. **La marche suit la distance parcourue**, et non le temps : plus de pieds qui glissent. Foulée par type, bras
   opposés aux jambes, balancement du buste ; course penchée pour le repli et l'assaut.
2. **Genoux et coudes** : bras et jambes en deux segments pour les figurines de près.
3. **Passages doux et gestes entiers.** La page relève elle-même, à chaque état reçu, l'instant où l'état de chaque
   unité a changé et l'état d'avant (une passe sur les unités, à mesurer : 1,5 ms au plus à 100 000), et les donne au
   shader dans une troisième texture. Le shader fond l'ancienne pose dans la nouvelle en 0,2 s et joue une fois les
   gestes qui ont un début : lancer (armer, lâcher, accompagner), tomber, se relever.
4. **Les quatre états nouveaux** : à terre (chute, corps au sol sur le ventre ou le dos selon l'individu, relevé) ;
   lancer ; suffoquer (courbé, quintes, main au visage, pas titubant) ; assaut (course, bouclier ou matraque en avant).
   Hors jeu : couché, plus assis.
5. **Frapper** : un coup qui s'arme, part et revient, avec le buste ; poussée de bouclier pour les unités protégées.
6. **L'attente** : poids d'une jambe sur l'autre, regards, bras croisés ou levés ; les individus diffèrent en taille,
   en carrure, en cadence.
7. **Accessoires** : la bouteille dans la main pendant le lancer, la matraque dans le coup, le bouclier dans la charge.
8. **De loin** : les couchés se voient, la marche se devine ; le passage de la figurine au point se fait sur une bande
   de tailles, en trame, sans saut.
9. **Pompiers et camions** (D9, types 13 et 14) : le pompier, casque à visière, veste sombre à bandes claires, lance
   tenue à deux mains ; le camion rouge, cabine, citerne, échelle, gyrophares bleus. La pose « lance » (état CAPACITE) :
   jambes écartées, buste penché, lance vers la cible ; le camion arrose depuis son toit.
10. **Les camps** (D10) : la Convergence en tenues sombres, capuches et foulards, avec des touches de rouge. Les pancartes
    restent à un porteur sur huit (D11, `porteur` dans `foule.js`).

**Budget** : 60 images/s à 100 000 unités ; le coût de la foule (`foule.mesure`) à 15 % de plus au maximum.
**Le Spark** : fiche de `foule.js` (existe : `spark/foule.fiche.md`) ; premier jet de chaque pose en GLSL, une par
demande, avec la signature de `poser` et une pose existante en exemple.
**Recette** : `banc-animations.py` pose une rangée d'unités par état et par camp (faux tampon d'unités donné à
`foule.recevoir`), capture de près à quatre instants et de loin ; une mêlée réelle capturée de près ; `foule.test.mjs`
contrôle la passe des débuts d'état ; les mesures.

### L7 — L'interface

**Part de** `integration-b`, branche `v03-interface`. **Fichiers** : `Jeu/src/interface/*`, `Jeu/src/index.html`,
`Jeu/src/style.css`, `interface.test.mjs`, le réalisateur de la démo dans `camera.js`, les rappels de `jeu.js`. Lot
écrit par Claude sans premier jet du Spark.

**À faire** :
1. **Préparation.** « Victoire » : quatre choix (« Jusqu'au dernier », « Au temps », « Aux points », « Mixte »), puis la
   durée et la cible quand elles servent. « Manifestants » : « Peu », « Moyen », « Beaucoup », avec leurs parts.
   Enregistrés dans les réglages de partie, repris dans la ligne de résumé, envoyés à la simulation.
2. **Ordres.** Cocktail Molotov pour la Convergence (touche proposée : M), lacrymogène pour la Préfecture (touche
   proposée : T), dans la carte des ordres selon la sélection, avec curseur de visée, portée montrée, refus expliqué ;
   le jet du canon vise aussi un feu. Touches réassignables, sans conflit avec A, F, H, R, G, L, C, B, X, E, V, J, Y, P
   ni avec Z, Q, S, D (la vue, depuis la 0.3c).
3. **Bandeau.** Selon le mode : forces restantes par camp (barres) et compte à rebours de la déroute d'un camp sans
   base ; temps restant ; points et cible. « Mixte » montre les trois, serrés.
4. **Alertes** : feu près de vos unités ou de votre base, gaz, « votre QG est occupé : déroute dans 30 s », avant-poste
   occupé ou repris.
5. **Fin** : la phrase de la raison (dernier camp debout, aux points, au temps, limite de 90 minutes, match nul) et le
   bilan étendu (cocktails, grenades, pierres, charges, mises à terre, feux allumés, feux éteints).
6. **Démo** : à la fin d'une partie de démo, la suivante part aussitôt, autre graine, sans passer par le titre ; le
   réalisateur va d'abord vers les foyers, les lancers, les charges.
7. **Minicarte** : les foyers et les nuages. **Téléphone** : la préparation et les ordres tiennent en 390 points de large.
8. **L'horizon** (remarque de L2) : l'inclinaison de la caméra (42 à 60°) ne montre jamais Notre-Dame de la Garde, et les
   forts seulement au zoom le plus lointain, au bord ouest. Envisager une inclinaison plus basse, ou un plan large du
   réalisateur de la démo ; en mesurer le coût.
9. **Pompiers** (D9) : production des types 13 et 14 (U et I) ; « Éteindre » au clic droit sur un immeuble en feu ou un
   foyer, et dans la carte des ordres ; alertes (un immeuble brûle près de votre base, trois immeubles en feu dans une
   rue) ; minicarte : immeubles en feu et calcinés ; bilan : immeubles brûlés et sauvés ; le réalisateur de la démo va
   aussi aux immeubles en feu et suit l'arrivée des camions.
10. **Les camps et le ton** (D1, D10) : les textes de la préparation, du titre et de l'aide disent « les casseurs », « les
    patriotes », « la police et les pompiers » ; la phrase du titre (« Une bousculade géante où l'on ne blesse
    personne ») et la description de la page ne disent plus le contraire de la 0.3.
11. **Touches** : depuis la 0.3c (D11), Z Q S D sont à la vue et Arrêt est sur F ; les nouvelles touches (M, T, U, I…)
    restent sans conflit avec elles.

**Recette** : `interface.test.mjs` étendu (remise en forme des options, touches sans conflit, bandeau par mode) ; un
essai Chrome par mode à 20 000 unités, mené jusqu'à l'écran de fin en vitesse 8 ; captures de la préparation, du
bandeau, de la fin, sur ordinateur et sur téléphone ; un ordre Molotov donné à la souris et vérifié dans les commandes
envoyées.

### L8 — Les sons

**Part de** `integration-b`, branche `v03-sons`. **Fichiers** : `Jeu/src/son.js`, `Jeu/src/moteur/audio.js`,
`Jeu/src/moteur/PROVENANCE-SON.md`, `son.test.mjs`.

D'après le Spark, `son.js` joue les évènements dans le `switch` de `jouer()`, tient des compteurs d'ambiance (`N.foule`,
`N.chants`, `N.tambours`, `N.sifflets`, `N.radio`, `N.melee`, `N.feu`…) nourris par un balayage des unités autour de la
caméra, et un séquenceur de rue calé sur la musique.

**À faire** :
1. **Évènements** : cocktail (le lancer, puis à l'arrivée, après `dureeVol`, le verre et le souffle de l'embrasement),
   foyer allumé et éteint, grenade (départ, tintement), gaz (sifflement), mise à terre (choc sourd), charge
   (piétinement, boucliers), pierre (claquement sur un bouclier ou une tôle), déroute, avant-poste occupé.
2. **Ambiances** : le feu, crépitement de près et grondement de loin, selon les foyers autour de la caméra ; la toux
   d'une foule dans le gaz ; la colère (rumeur qui monte avec la mêlée et les feux) ; l'alarme d'une voiture qui brûle.
3. **La rue** : retirer les sifflets comiques et la batucada joyeuse. Convergence : tambours lourds, cris scandés.
   Bastion : tambour de guerre lent. Préfecture : boucliers frappés en cadence, radio, sifflet bref et dur à la charge.
4. **La tension de la musique** tient compte des foyers et des charges.
5. **Provenance** : corriger l'ancien nom dans `PROVENANCE-SON.md` (le commit `4ce2271` cité comme
   `github.com/M4D135/FERRO` est celui du jeu METAL, aujourd'hui `M4D135/METAL` ; l'autre adresse ne mène plus nulle part).
6. **Pompiers** (D9) : la sirène deux-tons des camions qui roulent, en boucle, distincte des sirènes de la police ; le
   jet des lances (souffle, ruissellement sur la façade) ; l'incendie d'un immeuble (grondement, vitres qui éclatent,
   toiture qui s'effondre quand il est calciné).

**Budget** : les plafonds de voix actuels (32, 40, 48) ; le préchauffage de la banque au coût d'aujourd'hui à 20 % près.
**Le Spark** : fiche de `audio.js` (77 Ko) avant de le lire ; premier jet de chaque bruitage calculé, un par demande, à
partir d'un bruitage voisin ; relecture du diff.
**Recette** : `son.test.mjs` étendu (chaque nouvel évènement joue, rien avant un geste, plafonds tenus) ; essai Chrome :
contexte audio en marche, aucune erreur ; la liste de ce qui a été retiré de la rue.

### IC — Intégration finale, recette, mise en ligne

Dans `integration-c` : fusionner les quatre branches de la seconde vague ; passer la version à « essai-0.3 » ;
construire ; toutes les suites ; les essais Chrome (Marseille et damier à 100 000, téléphone à 20 000, sans WebGL 2) ;
les bancs feu et animations ; une partie par mode jusqu'à sa fin ; la démo suivie quinze minutes en temps réel (captures
à 0 min 30, 1 min, 5 min, 15 min) et l'enchaînement d'une démo à la suivante ; le tableau d'équilibre ; le README
(« Essai 0.3 » : nouveautés, mesures, limites) et la conception à jour ; ce plan à jour. Chaque ligne du § 4 cochée, ou
dite manquante.
Puis la session principale : relecture sur pièces, `main` en avance rapide, push, `Jeu/deposer.sh`, empreinte de la page
servie, aperçu republié, note KBZA, mémoire, compte rendu à David avec des captures, suppression des branches et des
arbres de travail finis.

## 8. Ordre

Un agent à la fois (consigne d'économie). Les durées sont des estimations d'agent, pas des promesses.

| | Lot | Dépend de | Durée | À la fin |
|---|---|---|---|---|
| 1 | L2 Marseille | — | 45 min | |
| 2 | L3 Musique | — | 30 min | |
| 3 | IA (avec L1) | 1, 2 | 30 min | **mise en ligne intermédiaire** |
| 4 | L4 Simulation | — | 60 min | |
| 5 | IB | 3, 4 | 15 min | |
| 6 | L5 Feu à l'écran | 5 | 60 min | |
| 7 | L9 Immeubles et pompiers (simulation) | 4 | 60 min | |
| 8 | L5b Immeubles en feu à l'écran | 6, 7 | 45 min | mise en ligne intermédiaire |
| 9 | L6 Animations, pompiers et camions | 5, 7 | 75 min | |
| 10 | L7 Interface, pompiers | 5, 7 | 75 min | |
| 11 | L8 Sons, sirènes | 5, 7 | 50 min | |
| 12 | IC | 6 à 11 | 45 min | **mise en ligne de la 0.3** |

Neuf à dix heures bout à bout. Si David le demande, les lots sans fichier commun peuvent aller par deux (L2 avec L3 ou
L4 ; L5 avec L6 ; L7 avec L8) : six à sept heures. Quand un lot fini montre à David quelque chose de neuf, une mise en
ligne intermédiaire le lui donne à voir (0.3d, 0.3e…), avec sa lettre (§ 5.5).

Dans les faits, le 12/11 au soir : L5 est parti de l'intégration B provisoire (`706eb9f`, la simulation de L4 encore en
premier jet) pendant que DeepSeek fait les premières passes de L3 et de L4 ; L4 et L9 suivront, puis L5b.

## 9. Risques

| Risque | Parade |
|---|---|
| La limite hebdomadaire d'Opus, atteinte le 12/11 à 18 h 08 (« resets Nov 18 »). | Un agent à la fois, commits fréquents : un arrêt ne perd rien. Si le premier agent échoue dès le lancement, le dire à David. |
| Le dossier temporaire disparaît (redémarrage). | Tout ce qui compte est committé ; les outils rentrent dans le dépôt au fil des lots. |
| Le Spark se trompe ou ralentit. | Ses réponses sont des brouillons ; chaque constat se vérifie ; on mesure sa latence avant une grosse série. |
| Le feu coûte trop : 128 foyers, 64 nuages, les lampes. | Budgets du § 7, niveaux de détail par distance, mesures avant et après ; en dernier recours, moins de foyers dessinés que simulés. |
| L'équilibre casse avec les nouvelles armes et 40 % de manifestants. | Le banc d'équilibre de L4, rejoué à l'intégration finale ; les chiffres restent dans `regles.js`. |
| « Jusqu'au dernier » ne finit pas. | Élimination après 30 s sans base, IA qui pousse quand elle domine, limite à 90 minutes ; si les parties dépassent 30 minutes au banc, le défaut passe à « Mixte » et on le dit à David. |
| Les animations coûtent trop à 100 000 unités. | Les segments en plus ne valent que pour les 12 000 figurines de près ; la passe des débuts d'état est mesurée. |
| La page grossit (données de Marseille, musique). | Budget de 3 Mo contrôlé par `construire.py` ; 1,27 Mo aujourd'hui. |
| Deux lots touchent `jeu.js`. | Chacun n'y change que ses lignes ; l'intégration règle les conflits. |
| La musique ne peut pas s'écouter par un agent. | Plan écrit par morceau, rendu hors ligne, mesures comparées ; David écoute en ligne après IA et tranche. |

## 10. Suivi

À tenir par qui exécute : date, commit, ce qui est vérifié, ce qui manque.

| Lot | État | Commit | Notes |
|---|---|---|---|
| Retrait d'Unreal | fait | `5ac0066` | Dépôt et Mac. |
| Réparation du test du noyau | fait | `a4cfed3` | |
| L1 Rendu | fait | `71f99a6`, `d871672` | 12/11 : provenance et tests défaits du dépôt FERRO (point 2), premier jet de DeepSeek, vérifié. Points 1 et 3 faits dans IA. |
| L2 Marseille | fait | `ce67c66` | 12/11 : vraie Marseille, monuments, mobilier, lointain, quatre sortes cassables (§ 5.3). |
| L3 Musique | en cours | `681cac7`, fusionné en `e0d27d8` | 12/11 au soir : premier jet de DeepSeek committé (test aux nouveaux tempos, outils de mesure rangés), `musique` et `son` verts. `v03-musique` fusionné dans `v03-feu-sim` (`a592bf4`) puis dans `main`. Reste : le préchauffage (872 ms de médiane contre 502 en 0.2), La Préfecture plus claire qu'avant au lieu de plus grave, la relecture des morceaux, l'écoute. Les deux fiches du Spark qui devaient corriger le festif et la gravité (`01-neutraliser-festif`, `02-prefecture-grave`) sont rouges sans avoir tourné : « extrait impossible : désignation illisible ». |
| IA + mise en ligne | fait, en ligne | `94d7aaf` | 12/11 : `main` + `ferro-rendu` + `v03-marseille`, sans conflit ; sans `v03-musique` (plus tard). Version « essai-0.3a ». Suites vertes ; essais Chrome Marseille et damier à 100 000, téléphone à 20 000 : 60 images/s, 0 lente, console vide ; sans WebGL 2 : message de refus ; son, réglages, export « M.K. », crédit OSM (`essai-page.py`). Mise en ligne : session principale. En ligne le 12/11 à 21 h (commit `94d7aaf`, empreinte de la page servie vérifiée) ; aperçu republié. |
| Version à l'écran titre | fait, en ligne | `3601ca6` | 12/11 : essai 0.3b, « 03 / MARSEILLE V0.3b » ; `construire.py` écrit version et édition dans la page. |
| ZQSD et pancartes (D11) | fait, en ligne | `5f9c3b7` | 12/11, vers 21 h 45 : essai 0.3c en ligne (empreinte de la page servie `470ac778935bbd86` vérifiée), aperçu republié. Réglages en version 2 (migration testée, et vérifiée dans Chrome avec de vraies touches), une banderole ou pancarte sur huit (captures de près). Suites vertes. |
| L4 Simulation | fait, sauf mesure | `dd1a161`, `05714ee`, `31cc352`, `bdef367`, `31cc352` (`v03-feu-sim`) | 12/11 au soir : premier jet de DeepSeek committé (l'objet cassé prend feu ; `sim.test.mjs` vert, 17 contrôles), arrêté après 55 min. Puis l'agent Opus, sur `v03-feu-sim` avancée à `integration-c` : quatre sortes cassables au protocole, démo sans cible ni limite dès « pret », foyers et nuages qui se chevauchent (`05714ee`) ; jet et gaz qui ne pèsent plus selon la densité de la foule (`JET.max`, `GAZ.plein`), Convergence qui casse sans manquer de Matériaux (`31cc352`) ; CONCEPTION § 1 (`bdef367`). Agent arrêté vers 23 h (« go full spark ») ; le Spark a repris CONCEPTION et ce plan (`731a21d`, `9135e35`). **Reste** : le coût de la simulation (+26 à 28 % mesurés, correction de la navigation à faire), la démo de 60 min à vérifier, l'essai Chrome. |
| L9 Immeubles et pompiers | fait (simulation) | `fe98ebc` … `949833b`, relu `42d1afb` (`v03-feu-sim`) | Ajouté le 12/11 au soir (D9). Mené par la chaîne du Spark (`Jeu/outils/spark/fiches/l9/`, `autonome.py`) : `sim/immeubles.js` (boîtes orientées, voisins, propagation, cocktail, plafond, empreinte), les immeubles des deux villes, l'ordre ETEINDRE (18) et les évènements 38 et 39, la lance des pompiers, le recul devant une façade en feu, l'arrosage par le Canon à eau. **Relu ligne à ligne le 13/11** : le module et le branchement sont justes et déterministes (`Math.cos` et `Math.sin` remplacés par une série de Taylor), la suite `immeubles.test.mjs` (202 lignes) est vraie. |
| Pompiers produits | fait | `35f66f8` (`v03-feu-sim`) | Trouvé à la relecture : le L9 avait posé les types 13 et 14 et tout le mécanisme, mais **rien ne les fabriquait** — `COMPOSITION[2]` s'arrêtait au type 12 et le panneau du QG ne montrait que cinq types. Une partie de 20 min sur le damier à 20 000 unités : 94 immeubles calcinés, **aucun éteint**. Avec 2,8 % de Pompiers et 1 % de Camions et le panneau ouvert aux sept types : 53 calcinés, **11 sauvés**. Premier réglage, pas un équilibre : à reprendre au banc (`Jeu/verifications/equilibre.mjs`). |
| IB | provisoire | `706eb9f`, puis `integration-c` | `706eb9f` : `main` + la simulation en premier jet (`a73a2dd`), la base de L5. 12/11 vers 21 h 50 : `integration-c` (`3069e2e`) = `main` (0.3c) + `dd1a161` + L5, suites vertes, essai Chrome sans erreur : la base de la fin de L4 et de l'essai 0.3d. À refaire après L4 et L9. |
| L5 Feu à l'écran | fait | `ffa4c74`, `c8ec75f`, `717d1b5` | 12/11 : foyers, colonnes noires penchées au vent (lisibles à 900 m), flaques, vols et éclats, gaz, cassables en 4 états (dont deux-roues, conteneur, terrasse, kiosque), 512 traces, 8 lampes vacillantes, vapeur, brouillard. Banc `banc-feu.py` : 128 foyers et 64 nuages à 100 000, 60 images/s à 600 m, 58,5 à 160 m (charge 7 à 9). Moteur : ajouts « grain » et « lampes ». Manque côté sim : les 4 nouvelles sortes dans `SORTES_CASSABLES`. Fonctions à resservir pour L5b (`decor.js`, sans allocation par image) : `lampeFeu`, `colonne`, `flammes`, `flaque`, `nuage`. Défaut bénin laissé à L5b : un vol ou un effet reçu avant la première image meurt aussitôt (horloge à 0). |
| Essai 0.3d | fait, en ligne | `55a4ddd` | 12/11 vers 22 h : `main` = `integration-c` + version 0.3d. Le feu à l'écran sur la simulation en premier jet (partie jusqu'au dernier, 40 % de manifestants, démo sans fin aux points). Suites vertes (12) ; essai Chrome Marseille à 100 000 : console vide, 0 image lente ; empreinte de la page servie `d33bbeacb3a2c70c` vérifiée ; aperçu republié. |
| L5b Immeubles en feu | **à refaire** | retiré en `42d1afb` | Ajouté le 12/11 au soir (D9). Le Spark a produit cinq fichiers (`src/rendu/{immeubles,lampes,lances,feu,brouillard}.js`, 272 lignes) et 232 lignes de tests : tout était écrit contre un modèle inventé (`immeuble.largeur`, `immeuble.pieces`, `etat.calcine`, `etat.fumeeRestante`) en Canvas2D, alors que le jeu rend en WebGL par `decor.js` et `foule.js` et que l'état vient de `etat.immeubles`, un `Float32Array` de `[id, etat, intensite, avancee]`. Rien n'importait ces fichiers et `construire.py` ne les liste pas : ils ne sont jamais entrés dans la page. Retirés. À faire pour de vrai dans `decor.js`, en resservant `lampeFeu`, `colonne`, `flammes`, `flaque`, `nuage` (sans allocation par image). |
| L6 Animations | à faire | rien | Le pilote n'a écrit **aucune fiche** du lot (`13/11 03:29 L6 : 0 fiche(s) écrite(s) par le Spark`). |
| L7 Interface | à refaire | retiré en `42d1afb` | Deux fiches vertes sur cinq (`02-ordres`, `03-bandeau-alertes`), mais les cinq fichiers produits (`src/interface/{bandeau,alertes,carte-ordres,ordres,touches}.js`, 540 lignes) lisaient un `etatSimulation` aux champs inventés (`modeVictoire`, `casseurs`, `patriotes`, `deroute`) et **doublonnaient `hud.js`**, qui a déjà le bandeau du haut (`dessinerScores`, `majScores`), les alertes (`alerte`, `lireEvenements`) et la carte de commandes (`rendreCarte`). Retirés. Les trois fiches rouges (01-preparation, 04-fin-demo, 05-minicarte-telephone) n'ont jamais tourné : la chaîne a refusé des désignations de lignes illisibles. Seul acquis gardé : le panneau de production du QG est ouvert aux sept types (`commandes.js`), sinon Pompiers et Camion resteraient inaccessibles. |
| L8 Sons | à faire | `2966b2e` (provenance seule) | Une fiche verte sur trois (`01-provenance`, les adresses GitHub de `PROVENANCE-SON.md`). Les deux autres (`02-recettes-evenements`, `03-evenements-son`) : « extrait impossible : désignation illisible », jamais lancées. Les évènements 38 et 39 n'ont donc **aucun son**. |
| IC + mise en ligne | en cours | `e0d27d8` | Fusion de `v03-feu-sim` (`02111c6`) dans `main` sans conflit. VERSION « essai-0.3e », README et ce suivi dans le commit qui suit. |

### Reprise après la pause du 12/11/2026, 23 h 30

David, le 12/11 au soir : « go full spark pour economiser tes tokens », puis « finis ce que es en train de faire, puis
commit push et fais doc suivi pour reprendre plus tard, pause token », puis « donne un maximum de boulot au spark avant
ta pause, tu reprendras ses resultats ». Plus d'agent Opus sur ces lots : le Spark écrit le code par la chaîne
(`Jeu/outils/spark/chaine.py`, § 6.1), Claude cadre et vérifie.

**Branches.** `main` : la 0.3d en ligne (`55a4ddd`), ce plan, la chaîne et ses fiches. `v03-feu-sim` : L4 et L9, à
`fe98ebc` au départ du pilote, qui y ajoute ses commits « Spark : … » (à pousser à la reprise). `integration-c`
(`3069e2e`), `v03-feu-ecran` (`717d1b5`, L5), `v03-musique` (`681cac7`, L3). Les arbres de travail sont dans le dossier
temporaire de la session : s'ils ont disparu, `git worktree prune` puis `git worktree add <dossier> v03-feu-sim`.

**Le pilote du Spark** : `Jeu/outils/spark/fiches/l9/pilote.sh <arbre de v03-feu-sim>`, lancé le 12/11 à 23 h 30,
détaché, un seul passage, sans timer. Le Spark sert aussi d'autres files ce soir-là : il peut tourner des heures.
1. Module et protocole, arrêt au premier rouge : l9-02 Pompiers et Camion de pompiers (types 13 et 14), l9-03 et l9-04
   le module `sim/immeubles.js`, l9-05 sa suite `immeubles.test.mjs`, l9-06 son chargement partout, l9-07 le protocole
   (ETEINDRE 18, IMMEUBLE_FEU 38, IMMEUBLE_ETEINT 39, `etat.immeubles`, bilan).
2. Les villes : l9-08 la ville imaginaire, l9-09 Marseille (`sites.immeubles`).
3. Si 1 et l9-08 sont verts, la simulation, arrêt au premier rouge : l9-10 branchement, l9-11 état et empreinte, l9-12
   et l9-13 la lance des pompiers, l9-14 le recul devant une façade en feu, l9-15 l'IA de la Préfecture, l9-16 les
   vérifications dans `sim.test.mjs`.
4. Une relecture du Spark sur tout le diff commité.

Sorties, non suivies : `Jeu/outils/spark/fiches/l9/sorties/` (`pilote.log`, `BILAN.md`, `chaine/` avec demandes,
réponses et journal de chaque fiche, `relectures/`). Une fiche verte est un commit sur `v03-feu-sim` ; une fiche rouge
laisse l'arbre propre. Les contrôles de fumée `fumee-*.cjs` des fiches se lancent depuis la racine d'un arbre.

**À la reprise :**
1. Lire `sorties/BILAN.md` et `pilote.log` ; si `pilote.sh` tourne encore (`ps aux | grep pilote.sh`), attendre.
2. Relire chaque commit « Spark : » et les constats de `relectures/` (le Spark se trompe avec assurance) ; corriger ce
   qui est vrai ; repasser les suites.
3. Fiche rouge : son journal et sa dernière réponse dans `sorties/chaine/` ; resserrer la fiche, relancer la chaîne
   depuis elle (depuis l'arbre de `v03-feu-sim`, arbre propre, `--arret`).
4. Pousser `v03-feu-sim`.
5. Reste de L4 : le coût de la simulation (+26 à 28 % mesurés par l'agent, correction de la navigation à faire), la
   démo de 60 min à vérifier, l'essai Chrome, une relecture du Spark sur le diff de `monde.js` de L4.
6. Le panneau de production (`src/interface/commandes.js`, `k < 5`) ne montre que cinq types par camp : Pompiers et
   Camion n'y sont pas encore, ni l'ordre ETEINDRE (L7).
7. Puis IB (`main` + `v03-feu-sim` + L3), l'essai 0.3e en ligne (`VERSION` = « essai-0.3e »), puis L5b, L3, L6, L7,
   L8, IC selon le § 8.

**Équilibre mesuré à `31cc352`** (graine 1, 16 parties ; outils et tableau dans `Jeu/outils/equilibre/`,
`tableau-31cc352.txt`) : en « jusqu'au dernier », la Convergence gagne en 34,3 min (damier, 100 000), 31,5 (damier,
20 000) et 34,4 (Marseille, 20 000) ; Marseille à 100 000 n'est pas finie à 40 min. En « mixte » et « points », une
alliance gagne vers 10 à 15 min ; en « temps », surtout Bastion et Préfecture alliés. À 10 min, 23 à 76 % des unités
jouent encore. Les IA se servent des cocktails, des grenades (environ 1 400 pour la Préfecture), du Canon à eau (305
foyers éteints) et des charges. Les parties dépassent un peu les 30 min visées : « jusqu'au dernier » reste le mode par
défaut ; à dire à David.

### Reprise après la pause du 13/11/2026, 00 h 40

David, cette nuit-là : « casser la base d'ou sont generées les troupes mais prend beaucoup de temps » (la décision D12),
« termine tout à fond », « tu dois utiliser zéro tokens, full spark », « charge le spark au max et met toi en pause ».
Le pilote `Jeu/outils/spark/autonome.py` (main `35d8be2`) a tourné détaché de 00 h 36 à **06 h 53** sur l'arbre de
`v03-feu-sim`, et s'est arrêté de lui-même. Sorties : `Jeu/outils/spark/fiches/l9/sorties/autonome/` (`autonome.log`,
`BILAN.md`, fiches et réponses par lot).

**Ce qu'il a rendu, vérifié à la reprise du 13/11** :

| Lot | Ce que le Spark annonçait | Ce qu'il en est |
|---|---|---|
| L9 (fin) | seize fiches | **fait et relu** : le module, le protocole, les deux villes, le branchement, les lances, le recul, l'IA. Déterministe. |
| D12 | deux fiches | **fait** : PV du QG et des avant-postes ÷3, durées d'occupation et de reprise ÷3. |
| L5b | cinq fiches vertes | **fiction, retirée** : modèle Canvas2D inventé, rien ne l'importait. |
| L3 | musique | `v03-musique` fusionné ; les deux fiches qui devaient rendre la musique moins festive et la Préfecture plus grave sont **rouges sans avoir tourné**. |
| L6 | — | **aucune fiche écrite**. |
| L7 | deux fiches vertes sur cinq | **fiction, retirée** : doublon de `hud.js` sur un état inventé. Seule la portée du panneau de production reste utile. |
| L8 | une fiche verte sur trois | seule la provenance du son est corrigée ; les évènements 38 et 39 n'ont **pas de son**. |

**La leçon de la chaîne** (`Jeu/outils/spark/chaine.py`) : une fiche verte n'est pas une preuve. La chaîne vérifie la
syntaxe (`node --check`) et les suites **nommées par la fiche** ; si la fiche nomme un test qui construit lui-même ses
objets, tout est vert sans que le jeu soit touché. Neuf fichiers de 810 lignes ont ainsi passé les treize suites sans
jamais atteindre la page (`construire.py` ne les liste pas). Pour la suite : une fiche de rendu ou d'interface doit
nommer une suite qui **charge la page construite** (`Jeu/verifications/essai-page.py`, `hote.test.mjs`), sinon la
relecture humaine est obligatoire avant commit.

**Ce qui reste pour la 0.3**, dans l'ordre du § 8 : L5b (le feu des immeubles à l'écran, dans `decor.js`), L6
(animations), L7 (interface : panneau Pompiers et ordre ETEINDRE, fin de démo, minicarte au téléphone), L8 (les sons
des évènements 38 et 39), L3 (les deux fiches rouges, le préchauffage, l'écoute), et le reste de L4 (coût de la
simulation, démo de 60 min, essai Chrome).

**À dire à David** : les parties dépassent les 30 min visées en « jusqu'au dernier » (31 à 34 min mesurées à
`31cc352`), et les parts de Pompiers et de Camions dans la composition de la Préfecture (2,8 % et 1 %) sont un premier
réglage posé à la sonde, pas un équilibre — à reprendre au banc.

## 11. Après la 0.3

- L'heure du jour : crépuscule et nuit, lampadaires allumés, fenêtres éclairées. Le feu y gagnerait beaucoup.
- Paris, puis New York, sur leur vrai plan.
- Le moteur évolue avec le jeu : pas de dépôt commun, pas de récolte. Une idée utile vue dans METAL ou BITUME se
  reprend au cas par cas, en lisant leur `PROVENANCE.md`. Le décor du jeu pourrait passer de `fx.lots` à `setLots`.

## 12. La 0.4 : un vrai jeu de stratégie (décisions du 13 novembre)

David veut que la partie se joue comme une partie de Warcraft 2 ou de StarCraft, avec un objectif. Cinq décisions,
dans l'ordre où elles doivent être faites. Chacune est un lot à elle seule : elles ne sont pas faisables ensemble.

- **R1 · Hostilité par paire** — remplacer la colère isolée du Bastion par une jauge d'hostilité par paire de camps
  (`hostilite[a * 4 + b]`, en itérations, comme `colere` aujourd'hui). Elle monte quand un camp en frappe un autre,
  redescend avec le temps, et est à zéro entre alliés. C'est le socle : sans elle, rien de ce qui suit n'est réglable.
  Le régalage se fait à la sonde, pas au clavier.
- **R2 · La police ne frappe pas la première** — la Préfecture a une hostilité de départ nulle contre tout le monde.
  Elle ne tire que si on tire sur elle (riposte, portée par R1), et sinon elle **canalise** : elle pousse les cortèges
  hors de leur route sans les frapper. Le Bastion garde le déclencheur de colère qui l'empêche de frapper la
  Préfecture sans raison.
- **R3 · L'objectif : tenir des lieux** — la victoire n'est plus seulement de l'usure. Un camp qui tient un nombre de
  lieux donné pendant un temps donné l'emporte, avant la limite de temps. Un décompte visible au HUD, comme un point
  à capturer. Les modes actuels (`dernier`, `points`, `temps`, `mixte`) restent pour la démo et les essais.
- **R4 · Des récolteurs comme dans un RTS** — la récolte n'est plus une capacité de tout le monde : un type d'unité
  récolteur attitré, qui fait la navette entre un point de récolte et le dépôt. Les points de récolte **s'épuisent**.
- **R5 · Occuper pour récolter** — les points de récolte sont des bâtiments (bâtiments publics, magasins) qu'il faut
  envahir et occuper ; tant qu'ils sont occupés, ils rapportent passivement de quoi faire des troupes. R5 remplace R4
  côté économie une fois en place : à décider si R4 survit comme unité de navette ou disparaît.

Le feu aux immeubles et l'intervention des camions de pompiers (L5, L5b en cours) restent dans leur coin : David veut
qu'on y mette le feu plus facilement. À reprendre après R2, qui change déjà beaucoup la partie.
