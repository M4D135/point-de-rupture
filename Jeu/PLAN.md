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
| D3 | **Moins de manifestants par défaut** : la part de la Convergence devient un réglage, « Peu » 34 %, « Moyen » 40 % (défaut), « Beaucoup » 50 % (la 0.2). Le total reste à 100 000 unités par défaut. Si David voulait moins d'unités au total, c'est `EFFECTIFS_DEFAUT` qu'il faut baisser. | L4, L7 |
| D4 | **Démo longue.** Mesuré en ligne : la démo s'arrête à 10 min 40, quand un camp atteint 3 000 points, avec 73 % des unités déjà hors jeu. En démo : ni fin aux points ni fin au temps, une limite de sécurité à 60 minutes, des IA qui continuent de produire et d'attaquer, les nouveautés visibles dès la première minute. Quand une partie de démo finit, la suivante part aussitôt, sans retour au titre. | L4, L7 |
| D5 | **« Full FERRO ».** Unreal est retiré du dépôt et du Mac : le jeu ne tourne que sur le moteur de David. Il n'y a plus de dépôt commun du moteur : la copie du jeu, `Jeu/src/moteur/`, est la sienne et évolue avec lui. La branche `ferro-rendu` l'a mise à jour sur le dernier état connu du moteur (FERRO 0.2 : METAL 0.8 et les ajouts de BITUME), à image égale. On garde ce travail ; on en retire ce qui le rattachait à un dépôt de référence. Le son reste le portage en français fait depuis METAL. | L1 |
| D6 | **Marseille seule** dans la 0.3. Paris et New York attendent. | — |
| D7 | **Qui fait quoi.** Le plan : Fable 5.2. L'exécution : Opus 5.5, un agent à la fois, pas de rafale. Le gros des lectures, des premiers jets et des relectures : le Spark (§ 6.2). Les premières passes des tâches que les suites savent vérifier : DeepSeek gratuit par opencode (§ 6.3), en parallèle, puisqu'il ne coûte rien. L'interface reste écrite par Claude. | tous |
| D8 | **Pas dans la 0.3**, à proposer ensuite : l'heure du jour (crépuscule ou nuit, où le feu se verrait bien mieux), Paris, New York. | § 11 |

## 3. Où l'on en est (12/11/2026, 20 h)

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

## 5. Contrats

### 5.1 Le protocole, version 2 (vérifié : lu dans `v03-feu-sim`)

La référence est l'en-tête de `Jeu/src/sim/protocole.js` sur la branche `v03-feu-sim`. Résumé de ce que la 0.3 ajoute ;
si le lot L4 change un format, il corrige ce paragraphe.

- **Options.** `victoire: { mode: 'dernier' | 'temps' | 'points' | 'mixte', points, duree (minutes) }`, remise en forme
  par `PDR.regles.victoire` (absente : `{ mode: 'dernier', points: 3000, duree: 20 }`) ; choix proposés dans
  `regles.CONSTANTES.VICTOIRE`. `manifestants: 'peu' | 'moyen' | 'beaucoup'` (`regles.parts` : 34/35/31, 40/32/28,
  50/27/23 %). En démo, `victoire` est ignorée et rendue `{ mode: 'dernier' }`. `CARTE.parts` donne les parts retenues.
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
  1,5 à 2 m ; salve, mise à terre 4 s ; lacrymogène, portée 26 m, recharge 35 s. Ce sont des chiffres de premier jet :
  L4 les règle.

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
QG, `etendue`, `attribution`). Les cassables gardent leur format ; chaque objet porte ses points de structure et son
rendement, et la simulation en tire son feu (`regles.feuObjet`). Le lot L2 peut ajouter des sortes : la simulation
donne des valeurs par défaut à une sorte inconnue, et le décor (L5) doit la dessiner intacte, cassée, en feu, calcinée.
L2 remet donc à L5 la liste des sortes et leur dessin.

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

## 6. Organisation

### 6.1 Rôles

- **David** tranche. Une décision datée de lui passe avant ce plan.
- **Fable 5.2** a écrit ce plan. Il peut le corriger si une décision change.
- **Opus 5.5** exécute : un agent par lot, l'un après l'autre, chacun dans l'arbre de sa branche. L'agent lit ce plan,
  fait son lot, vérifie, committe, rend un compte rendu court.
- **Le Spark** lit, résume, propose des premiers jets, relit des diffs. Il ne décide rien et ne prouve rien.
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

Dans `integration-a` : fusionner `main`, `ferro-rendu`, `v03-marseille`, `v03-musique` ; finir L1 ; mettre à jour le
README (section « Essai 0.3, en cours ») et les paragraphes moteur, plan réel et musique de la conception ; ranger dans
le dépôt les outils encore dehors ; construire ; toutes les suites ; trois essais Chrome (Marseille 100 000, damier
100 000, téléphone 20 000) comparés aux captures de la 0.2 ; vérifier dans la page le son, les réglages, l'export ;
committer avec la page construite et contrôler qu'une seconde construction ne change rien.
Puis la session principale vérifie, avance `main`, pousse, met en ligne (`Jeu/deposer.sh`), republie l'aperçu. David
voit alors la nouvelle Marseille et la nouvelle musique ; la rue garde ses anciens bruitages jusqu'à L8, à lui dire.

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

**Le Spark** : la fiche existe (`spark/sim.fiche.md`) ; relecture finale du diff de `monde.js` par morceaux ; premier
jet des contrôles à ajouter à `sim.test.mjs` (un par mécanique).
**Recette** : suites vertes ; tableau d'équilibre avant et après ; durée des parties par mode ; relevé de la démo ;
coût ; essai Chrome sans erreur.

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
   dessinent dans les quatre états.
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
   le jet du canon vise aussi un feu. Touches réassignables, sans conflit avec A, S, H, R, G, L, C, B, X, E, V, J, Y, P.
3. **Bandeau.** Selon le mode : forces restantes par camp (barres) et compte à rebours de la déroute d'un camp sans
   base ; temps restant ; points et cible. « Mixte » montre les trois, serrés.
4. **Alertes** : feu près de vos unités ou de votre base, gaz, « votre QG est occupé : déroute dans 30 s », avant-poste
   occupé ou repris.
5. **Fin** : la phrase de la raison (dernier camp debout, aux points, au temps, limite de 90 minutes, match nul) et le
   bilan étendu (cocktails, grenades, pierres, charges, mises à terre, feux allumés, feux éteints).
6. **Démo** : à la fin d'une partie de démo, la suivante part aussitôt, autre graine, sans passer par le titre ; le
   réalisateur va d'abord vers les foyers, les lancers, les charges.
7. **Minicarte** : les foyers et les nuages. **Téléphone** : la préparation et les ordres tiennent en 390 points de large.

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
| 7 | L6 Animations | 5 | 60 min | |
| 8 | L7 Interface | 5 | 60 min | |
| 9 | L8 Sons | 5 | 45 min | |
| 10 | IC | 6 à 9 | 45 min | **mise en ligne de la 0.3** |

Sept à huit heures bout à bout. Si David le demande, les lots sans fichier commun peuvent aller par deux (L2 avec L3 ou
L4 ; L5 avec L6 ; L7 avec L8) : quatre à cinq heures.

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
| L1 Rendu | à finir dans IA | `71f99a6` | 12/11 : provenance et tests défaits du dépôt FERRO (point 2), premier jet de DeepSeek, vérifié. Restent les points 1 et 3. |
| L2 Marseille | à reprendre | `de8cf76` | |
| L3 Musique | à reprendre | `2dc9248` | |
| IA + mise en ligne | à faire | | |
| L4 Simulation | à reprendre | `4020ac6` | |
| IB | à faire | | |
| L5 Feu à l'écran | à faire | | |
| L6 Animations | à faire | | |
| L7 Interface | à faire | | |
| L8 Sons | à faire | | |
| IC + mise en ligne | à faire | | |

## 11. Après la 0.3

- L'heure du jour : crépuscule et nuit, lampadaires allumés, fenêtres éclairées. Le feu y gagnerait beaucoup.
- Paris, puis New York, sur leur vrai plan.
- Le moteur évolue avec le jeu : pas de dépôt commun, pas de récolte. Une idée utile vue dans METAL ou BITUME se
  reprend au cas par cas, en lisant leur `PROVENANCE.md`. Le décor du jeu pourrait passer de `fx.lots` à `setLots`.
