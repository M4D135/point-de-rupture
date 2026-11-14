# Point de rupture — conception des versions 0.2 et 0.3

Décisions de David du 12 novembre 2026, dans l'ordre :
- « oublie totalement le système classique, full procedural rts » ;
- choisir sa faction après l'écran titre ;
- les règles des factions de la section 1.2 ;
- deux factions sur trois peuvent s'allier ;
- récolte de ressources, regroupement, « un vrai Warcraft, StarCraft » ;
- au moins 100 000 unités ;
- un menu de réglages comme celui de METAL ;
- des sons et une musique MOD sans fichier, comme METAL ;
- un mode démo où l'IA joue si l'on attend plus de 5 s sur l'écran titre ;
- le moteur repris de la dernière version de FERRO ;
- « ça fait un peu trop ville américaine […] faut aussi une type ville européenne », puis « fais marseille, paris,
  new york », enfin « juste marseille, on verra, les autres seront pour les maj suivantes » : la 0.2 joue sur le vrai
  plan de Marseille ; la ville imaginaire en damier reste au choix ; Paris et New York viendront ensuite.

Décisions de David pour la 0.3, le 12 novembre 2026, mot pour mot (`PLAN.md` § 1, demandes 2 à 4) :
- « par contre le jeu faut des coctails molotov, faut foutre le feu quand on casse, faut plus de viloence et une
  musique mois rigolote, et améliore les animations des persos et le détail de la map, c pas mal mais peux mieux faire
  le marseille » ;
- « il faut faire comme wow soit temps, soit jusqu'au dernier mais pas que au nombre de points, au choix un peu des 3
  etc, à voir et par defaut moins de manifesants » ;
- « demo pas assez longue ».

Claude en a tiré, le même jour, les décisions D1 à D4 de `PLAN.md` § 2 : le ton plus dur (ci-dessous), la victoire au
choix (§ 1.7), moins de manifestants par défaut (§ 1.4), la démo longue (§ 1.11). Le feu, les cocktails, le gaz, les
charges et les chutes sont au § 1.5 et au § 1.6.

**Plan réel.** Marseille est tirée d'OpenStreetMap (tuiles OpenFreeMap, licence ODbL) : rues, 5 274 bâtiments avec
leur hauteur quand elle est connue, eau, places, repères, et 1 008 points de mobilier. Le générateur en fait le décor,
de façon déterministe. Les bâtiments ont une hauteur plausible par quartier quand OSM ne la donne pas (Panier bas aux
enduits vifs, cinq à sept étages en pierre sur la Canebière et la rue de la République), des toits de tuile canal, de
zinc ou des terrasses. Les monuments sont dessinés d'après leur emprise : l'Hôtel de Ville, Saint-Ferréol, la Bourse,
l'Opéra, les Accoules, la Vieille Charité. Les rues ont leurs platanes, réverbères, terrasses de café, voitures et
deux-roues garés, et le port ses voiliers et ses barques. Au-delà du carré de jeu, le lointain reprend la ville jusqu'à
1,25 km : la mer, le bâti, la Major, les forts Saint-Jean et Saint-Nicolas, le MuCEM, et Notre-Dame de la Garde sur sa
colline. Ce qui peut brûler est cassable : voitures, deux-roues, terrasses, poubelles, conteneurs, abribus, kiosques.
Les données viennent d'OpenStreetMap et non de Google Maps, dont les conditions interdisent d'extraire les données ; le
jeu affiche « © les contributeurs d'OpenStreetMap » tant que la ville en vient (écran titre, minicarte, préparation).
Outils : `outils/plans/` ; données : `src/villes/marseille.js` ; générateur : `src/ville-reelle.js`.

**Moteur.** Le moteur de rendu, `src/moteur/renderer.js`, appartient au jeu. Il vient du jeu METAL et a été mis à jour
le 12 novembre 2026 sur le dernier état du moteur commun, FERRO 0.2, avant la suppression de ce dépôt (« le moteur
evolue selon le jeu », David, 12/11) : il n'y a plus de copie de référence ni de récolte. Six ajouts du jeu y sont
marqués « PDR » (origine, voile, éclairage, lots, foule, MSAA) ; les anciens réglages en dur passent par
`REGLAGES_MOTEUR` dans `jeu.js`. Tout changement du moteur prend une ligne dans `src/moteur/PROVENANCE.md` (quoi,
pourquoi, quel coût) et garde `rendu.test.mjs` vert. Le son et la musique sont des portages en français de ceux de
METAL (`src/moteur/PROVENANCE-SON.md`).

**Ton** (D1, 12/11/2026). Le feu, les cocktails Molotov, une violence plus dure et une ambiance plus sombre sont voulus :
la « bagarre burlesque stylisée » de la 0.2 (`CONTRE-EXPERTISE.md` §4.6) cède là où elle les contredit.
- Personne ne meurt ni ne saigne. Une unité à bout de cohésion est « hors jeu » et quitte la partie.
- Aucune arme à feu, aucune lame, aucun sang. Personne n'est montré en feu : le feu brûle le sol, les objets, les
  véhicules, les barricades et les avant-postes ; une unité prise dedans est pressée, fuit ou tombe hors jeu, et dans ce
  cas disparaît aussitôt au lieu de rester couchée dans les flammes.
- Aucun drapeau, emblème, slogan, sigle, uniforme ou personnalité réels, aucune cause énoncée. Les camps se distinguent par leur couleur et par un motif : rond, carré, chevron. Les vrais noms de lieux de Marseille restent.

## 1. La partie

### 1.1 Écrans

1. **Chargement** : la ville se génère et les instruments se calculent, avec une barre de progression.
2. **Écran titre** : « Nouvelle partie », « Réglages », « Son ».
3. **Démo** : après 5 s sans geste sur l'écran titre, l'IA joue les trois camps et la caméra suit l'action. Le moindre geste ramène à l'écran titre.
4. **Préparation** : faction, alliance, effectifs, difficulté, ville (Marseille, plan réel, ou une ville imaginaire tirée de la graine).
5. **Partie** ; Échap ouvre la pause, avec les réglages.
6. **Fin** : victoire, défaite ou victoire de l'alliance, avec un bilan. On en revient à l'écran titre.

### 1.2 Factions : les règles de David

| | Convergence | Bastion | Préfecture |
|---|---|---|---|
| Casser : mobilier urbain, voitures, vitrines, avant-postes ennemis | oui | non | non |
| Bâtir des barricades | oui | non | non |
| Lever les barricades | les siennes seulement | oui | oui |
| Lever les avant-postes ennemis | non | non | oui, « elle lève tout » |
| Frapper | le Bastion et la Préfecture | la Convergence ; la Préfecture seulement pendant 45 s après que la Préfecture l'a frappé (« colère ») | tout le monde |
| Se battre, attaquer, se replier, regrouper, récolter | oui | oui | oui |
| Mettre le feu (0.3) : ce qu'elle casse brûle, et les Furets lancent des cocktails Molotov | oui | non | non |
| Lancer des pierres et des bouteilles (0.3) | oui, le Cortège | oui, les Piquets | non |
| Charger et jeter au sol (0.3) | non | oui, les Béliers, à la poutre | oui, la Patrouille, à la matraque |
| Gaz lacrymogène, salve, canon à eau qui éteint les feux (0.3) | non | non | oui |

**Alliances.** Une seule à la fois, entre deux des trois camps.
- Des alliés ne se frappent pas, partagent leur vue et gagnent ensemble.
- Une alliance se choisit à la préparation. En partie, on peut en proposer une ou la rompre, puis attendre 60 s avant toute nouvelle alliance.
- Une IA accepte une alliance quand le troisième camp est le plus fort. Deux IA s'allient contre un camp qui dépasse 45 % de la force totale ; elles rompent quand l'allié dépasse à son tour 55 %, ou quand le camp visé tombe sous 20 %.
- Les alliés ne se gazent pas : la Préfecture et son allié portent le masque.

### 1.3 Unités

Il y a 13 types d'unités, définis dans `src/sim/regles.js` avec leurs chiffres. Ces chiffres sont provisoires et se règlent ensemble.
- **Convergence** : Équipe, Cortège, Furets, Fanfare. Le nombre, la vitesse, la casse et les barricades.
- **Bastion** : Équipe, Piquets, Pavois, Béliers. Tenir, encaisser, lever.
- **Préfecture** : Équipe, Patrouille, Compagnie, Motards, Canon à eau. Peu nombreux, chers, outils de zone, un véhicule.

Depuis la 0.3 (chiffres au § 1.5) : le Cortège et les Piquets lancent des pierres ; les Furets, des cocktails Molotov ;
les Béliers et la Patrouille chargent ; la Compagnie lance des grenades lacrymogènes en plus de sa salve ; le Canon à
eau éteint les feux.

### 1.4 Économie

**Ressources.** Il y en a deux : les **Moyens** et les **Matériaux**.
- **Gisements** : les marchés donnent des Moyens, les chantiers des Matériaux. Leur stock est fini.
- **Récolte** : une Équipe porte 10 unités par voyage jusqu'au dépôt le plus proche, son QG ou l'un de ses avant-postes. Un gisement accepte 40 récolteurs à la fois ; les suivants attendent à côté.
- **Revenus propres à chaque camp** :
  - la casse rapporte des Matériaux à la Convergence ;
  - lever une barricade rend 50 % de son coût au Bastion ou à la Préfecture ;
  - la Préfecture reçoit une dotation de 120 Moyens par minute tant que son QG n'est pas occupé ;
  - chaque lieu tenu rapporte 40 Moyens par minute ;
  - en démo, tous les revenus sont doublés (§ 1.11).

**Production.**
- Elle se fait par lots : un ordre donne un lot d'unités.
- Le QG produit tous les types de son camp ; un avant-poste produit les Équipes et l'unité de base.
- Chaque producteur a une file de 5 ordres et un point de ralliement.

**Effectifs.**
- Le réglage E (20 000, 50 000, **100 000** par défaut, 150 000 ou 200 000) fixe le nombre d'unités présentes au départ.
- Parts (D3, réglage « Manifestants » de la préparation, `options.manifestants`) : Convergence, Bastion, Préfecture à
  34 / 35 / 31 % pour « Peu », **40 / 32 / 28 % pour « Moyen »**, le défaut, et 50 / 27 / 23 % pour « Beaucoup », les
  parts de la 0.2 ; dont 4 % d'Équipes dans chaque camp. Le total reste celui du réglage E.
- Plafond de chaque camp : 125 % de sa part.
- La ville grandit avec E : 9 îlots par côté jusqu'à 30 000 unités, 13 jusqu'à 120 000, 15 au-delà.

### 1.5 Combat

- **Cohésion et pression.** La cohésion tient lieu de points de vie. Au contact, une unité inflige une pression par seconde, donnée par la table des types.
- **Angle.** Une pression reçue de flanc ou de dos, hors de l'arc frontal de 120°, est multipliée par 1,5. Une unité protégée ne reçoit que la moitié de la pression de face.
- **À zéro de cohésion**, l'unité est hors jeu : elle reste couchée 6 s (1,5 s au-delà de 4 096 gisants), puis son
  emplacement se libère. Dans un foyer, elle disparaît aussitôt (D1).
- **Repli automatique.** Sous 25 % de cohésion, une unité se replie vers la zone de soutien la plus proche, sauf en posture « Tenir ». Elle court 30 % plus vite et ne frappe pas.
- **Zones de soutien** : le QG et les avant-postes rendent 5 points de cohésion par seconde.
- **Rythme** (0.3) : toutes les pressions des tables — contact, salve, jet, pierres, charges, souffle du cocktail — sont
  multipliées par `RYTHME` (`regles.js`). Il vaut 1 et reste à régler au banc d'équilibre : sous 1, les combats
  durent, on voit les charges et les chutes, la production a le temps de compter (en 0.2, 70 % des unités étaient hors
  jeu à 10 minutes). Le feu et le gaz, qui chassent plus qu'ils ne blessent, gardent leurs chiffres.
- **À terre** (0.3) : une unité jetée au sol ne fait rien pendant 3 s, puis ne retombe pas pendant 6 s. Un véhicule ne
  tombe jamais ; une unité protégée (Pavois, Compagnie), seulement sous la poutre des Béliers.
- **Capacités.** Chiffres avant le rythme.
  - Salve, de la Compagnie : zone de 6 m de rayon jusqu'à 14 m, annoncée 1,5 s avant ; 10 points à dix unités au plus, les plus proches, dont quatre jetées au sol, recharge 30 s. Réglage du 12/11 : à 35 points sans plafond toutes les 20 s, elle faisait 86 % des points de la Préfecture.
  - Jet, du Canon à eau : cône de 18 m et de 40°, pendant 3 s, par impulsions de 0,2 s ; 12 points par seconde aux
    huit unités les plus proches au plus à chaque impulsion (la foule plus dense n'y perd pas davantage), recul de 2 m
    par seconde, jetées au sol à moins de 9 m ; chaque impulsion retire 3 s aux foyers du cône (§ 1.6).
  - Interpeller, de la Patrouille : pression doublée sur une unité sous 30 % de cohésion.
  - Soigner, de la Fanfare : +3 de cohésion par seconde aux unités de son camp à moins de 8 m.
  - Pierres (0.3), du Cortège et des Piquets : de 3,5 à 14 m, avant le contact ; 3 points, recharge 5 s, 0,6 s de vol.
  - Cocktail Molotov (0.3), des Furets : de 6 à 22 m, en cloche (0,5 s de vol plus 1 s par 20 m) ; 4 Matériaux.
    Le souffle, sur 3 m : 12 points à huit unités au plus, dont trois jetées au sol. Il allume un foyer de 4 m pour 18 s,
    enflamme les barricades et avant-postes touchés et jusqu'à deux objets. Recharge 25 s.
  - Charge (0.3), des Béliers et de la Patrouille : de 4 à 12 m, élan à 1,8 fois la vitesse (Patrouille : 1,7) pendant
    2 s au plus ; à l'impact 10 points (8), recul de 2 m (1,5), la cible tombe ; recharge 14 s (16). La poutre des
    Béliers jette au sol même une unité protégée.
  - Grenade lacrymogène (0.3), de la Compagnie : de 8 à 26 m, en cloche (0,6 s plus 1 s par 22 m), recharge 35 s.
- **Lancers d'eux-mêmes** (0.3). Les Furets et la Compagnie lancent cocktails et grenades sans ordre, sur la foule
  hostile la plus dense à portée (la case de 8 m la plus peuplée, sans foyer ni nuage, où les leurs ne sont pas plus de
  la moitié des hostiles), à une cadence bornée par camp : 0,25 lancer par seconde par tranche de 20 000 unités
  (1,25 à 100 000), six d'avance au plus ; pas de cocktail lancé seul au-delà de 96 foyers ou sous 60 Matériaux par
  tranche de 20 000 unités, pas de grenade au-delà de 48 nuages. Sur ordre (touche de la capacité, puis un point du
  sol), il n'y a que la recharge.
- **Le feu** (0.3). Un foyer est un disque qui presse de 8 points par seconde quiconque s'y trouve, tous camps
  confondus ; ces points ne comptent au bilan que contre un camp hostile. On le fuit à 1,3 fois sa vitesse, on le
  contourne à 2,5 m. 128 foyers au plus ; leurs sources au § 1.6.
- **Le gaz** (0.3). Le nuage d'une grenade grossit en 2 s jusqu'à 7 m de rayon et dure 14 s. Qui s'y trouve suffoque :
  3 points par seconde, il ne frappe plus et en sort à la moitié de sa vitesse ; au-delà de 20 unités dans le nuage, ces
  points se partagent entre elles. La Préfecture et ses alliés portent le masque ; un véhicule passe. 64 nuages au plus.

### 1.6 Structures

**QG.** Chaque camp en a un, déjà en place, indestructible.
- Il est « occupé » après 60 s cumulées d'ennemis sur son parvis sans défenseur. Il ne produit plus, et la dotation de la Préfecture s'arrête.
- Son camp le reprend par 20 s de présence sans ennemi.

**Avant-postes** : le Relais pour la Convergence, le Cantonnement pour le Bastion, le Poste mobile pour la Préfecture.
- Coût : 150 Moyens et 100 Matériaux. Ce sont les Équipes qui les bâtissent.
- Un avant-poste sert de dépôt, de petit producteur et de zone de soutien.
- La Convergence peut le casser, la Préfecture le lever.
- Il s'occupe (0.3) comme un QG, mais en 30 s cumulées d'ennemis sur son parvis sans défenseur ; le compte redescend
  quand les ennemis partent, et son camp le reprend par 10 s de présence sans ennemi. Occupé, il ne produit plus, ne
  soutient plus, ne sert plus de dépôt et ne compte plus comme base (§ 1.7).
- Un cocktail l'enflamme (0.3) : un foyer de 6 m pendant 25 s, pendant lequel il ne produit plus ; il perd 1,6 % de
  ses points de structure par seconde.

**Barricades** : la Convergence seulement.
- Segment de 4 à 20 m en travers d'une rue, à 6 Matériaux par mètre et 40 points de structure par mètre.
- Toute unité de la Convergence peut la bâtir.
- Elle bloque les déplacements de tous.
- Le Bastion et la Préfecture la lèvent ; la Convergence peut retirer les siennes.
- Elle brûle (0.3) quand un cocktail tombe à moins d'un mètre d'elle, fût-il de la Convergence : un foyer de 3,2 m tous
  les 7 m, trois au plus, pendant 30 s ; elle perd 2 % de ses points de structure par seconde. Le feu presse les unités
  (§ 1.5) : il n'est plus un simple décor.

**Le feu des objets** (0.3, « faut foutre le feu quand on casse »). Tout objet cassé s'embrase 1,5 s plus tard, puis
reste calciné. Durée et rayon selon sa sorte : voiture 38 s et 4,5 m, poubelle 12 s et 2 m (les six sortes de la 0.2 :
d'après leurs points de structure, de 12 à 40 s et de 2 à 4,5 m) ; deux-roues 20 s et 2,6 m, conteneur à ordures 34 s
et 3 m, terrasse 16 s et 3,2 m, kiosque 36 s et 3,8 m. Un foyer se propage une fois : après 6 s, une chance sur deux
d'embraser l'objet intact le plus proche à moins de 7 m, sur deux générations au plus. Le Canon à eau éteint (§ 1.5) ;
l'objet reste calciné.

### 1.7 Victoire

Au choix avant la partie depuis la 0.3 (D2, « soit temps, soit jusqu'au dernier mais pas que au nombre de points ») :
- **Jusqu'au dernier**, le défaut : le dernier camp, ou la dernière alliance, debout.
- **Au temps** : 10, 15, **20** (défaut), 30 ou 40 minutes ; le meilleur score l'emporte.
- **Aux points** : 1 500, **3 000** (défaut) ou 5 000 points.
- **Mixte**, la règle de la 0.2 : 3 000 points, 40 minutes ou le dernier debout, le premier des trois.

- Chaque lieu tenu rapporte 1 point par seconde. On en prend un en y restant 15 s sans ennemi ; une présence ennemie gèle la prise. Les scores de deux alliés s'additionnent.
- **Élimination, dans tous les modes.** Un camp sans base — QG occupé et aucun avant-poste achevé et libre — est en
  déroute : il est éliminé s'il n'a pas retrouvé de base au bout de 30 s, et aussitôt s'il lui reste moins de 2 % de
  ses effectifs de départ. Ses unités se dispersent, ses avant-postes tombent, ses lieux redeviennent neutres, son
  alliance se défait.
- Limite de sécurité des modes sans limite de temps : 90 minutes. « Jusqu'au dernier » : le côté qui a le plus
  d'unités l'emporte ; « Aux points » : le meilleur score.

### 1.8 Brouillard

- La grille a des cases de 8 m. Le joueur voit ce que voient ses unités, ses structures et celles de son allié.
- La ville elle-même est connue. Les unités et structures ennemies hors de vue sont cachées, et le sol hors de vue est assombri.
- Pas de brouillard en démo.

### 1.9 IA

Chaque camp tenu par l'IA réfléchit une fois par seconde, à tour de rôle.

**Économie.**
- Elle garde environ 4 % d'Équipes, qu'elle envoie au gisement le plus proche qui n'est pas saturé.
- Elle bâtit des avant-postes quand elle est riche.
- Elle produit selon une composition cible et ses ressources.

**Armées.**
- Elle regroupe ses unités de combat en 3 à 8 groupes par proximité, recalculés toutes les 10 s.
- Objectifs : prendre les lieux, défendre ce qui est attaqué, frapper un groupe hostile plus faible, harceler les récolteurs.
- Chaque camp suit ses règles :
  - la Convergence barricade les rues qui mènent à ses lieux quand l'ennemi approche, et casse quand elle manque de Matériaux ;
  - le Bastion évite la Préfecture tant qu'il n'est pas en colère ;
  - la Préfecture lève ce qui la gêne.

**Diplomatie** : voir 1.2.

**Difficulté.** Facile : revenus ×0,8 et décisions lentes. Normal. Difficile : revenus ×1,2, replis et ciblage plus fins.

**Version 0.3.**
- Achèvement : rapport de forces de 1,2 en mode « jusqu'au dernier », 2,5 dans les autres modes, jamais en démo.
- Un groupe sans objectif marche sur le front, à 320 m au plus.
- Les cocktails sont lancés sur un avant-poste attaqué, au plus toutes les 30 s.
- Le canon à eau part éteindre les feux.
- La Convergence casse toutes les 10 s.

### 1.10 Commandes

**Souris.**
- Clic gauche : sélectionner. Cadre : sélection multiple ; Maj ajoute ; double-clic ou Ctrl+clic : tout le type à l'écran.
- Clic droit : ordre selon la cible. Le sol donne un déplacement en formation ; une unité hostile, une attaque.
  - Pour la Convergence : un objet cassable ou une structure ennemie, casser.
  - Pour le Bastion ou la Préfecture : une barricade, lever.
  - Pour les Équipes : un gisement, récolter ; une structure en chantier, bâtir.
- Molette : zoom. Glisser du bouton du milieu ou Espace + glisser : déplacer la vue. Clic droit glissé : tourner la vue.

**Clavier** (touches réassignables dans les réglages) :

| Touche | Ordre | Touche | Ordre |
|---|---|---|---|
| A | attaque-mouvement | F | arrêt |
| H | tenir | R | se replier |
| G | regrouper | B | barricade |
| L | lever | C | casser |
| E | avant-poste | X | récolter |

- Ctrl+1 à 9 et 1 à 9 : groupes ; un double appui centre la vue.
- F1 : Équipes oisives. F2 : toute l'armée. F3 : le QG. Espace : la dernière alerte.
- Échap : annuler, ou pause.
- Les flèches, et Z Q S D : déplacer la vue (David, 12/11/2026 : « deplacement sur map en plus du bouton milieu et les fleches, zsqd aussi ») ; Maj + Q ou D, comme Maj + ← ou →, Début et Fin : la tourner ; + et − : zoom. Les autres lettres servent aux ordres et à la production (A, W, E, R, T) ; Arrêt passe donc de S à F. Les lettres suivent la disposition du clavier : Z Q S D sont sous la main gauche d'un AZERTY ; sur un QWERTY, les réassigner. Tout se réassigne dans les réglages ; des réglages enregistrés avant ce changement le reçoivent, sauf les touches que le joueur avait déjà données ailleurs.

### 1.11 Démo

- Une partie à trois IA, avec les effectifs choisis (20 000 par défaut, et la démo ne dépasse jamais ce format), sans brouillard.
- Une démo longue (0.3, D4, « demo pas assez longue » ; en 0.2 elle s'arrêtait à 10 min 40 sur 3 000 points) : ni fin
  aux points ni fin au temps, le réglage de victoire est ignoré (`{ mode: 'dernier', points: 0, duree: 0 }`) ; les QG
  ne s'occupent pas, les IA ne vont jamais « achever », les revenus sont doublés : chaque camp garde sa base et ses
  renforts, et la partie va jusqu'à sa limite de sécurité, 60 minutes simulées.
- Un réalisateur choisit toutes les 8 à 12 s le point le plus vivant : combat, barricade, prise de lieu, grande marche. Il y vole en douceur et tourne lentement autour. De temps en temps, il prend de la hauteur pour montrer toute la ville.
- À l'écran : un bandeau « DÉMO », « Cliquez ou appuyez sur une touche » et le compteur d'images. La musique est celle du titre.

## 2. Architecture

```
Page (fil principal)                                   Travailleur (Web Worker)
──────────────────────────────────────────            ─────────────────────────────────────
jeu.js          orchestration, boucle d'images         sim/travailleur.js  messages ↔ monde
hote.js         crée le travailleur (Blob) ou          sim/monde.js        état, pas de 50 ms, combat,
                le fait tourner sur le fil principal                       économie, structures, brouillard
interface/*     titre, préparation, réglages, HUD,     sim/ia.js           les camps de l'IA, diplomatie
                minicarte, commandes à la souris       sim/nav.js          grille, champs de direction
foule.js        100 000 unités sur le GPU              ville.js            ville et lieux de jeu (partagé)
decor.js        structures, cassables, effets          sim/regles.js       règles communes (partagé)
camera.js       caméra RTS et réalisateur de la démo   sim/protocole.js    messages et tampons (partagé)
son.js          évènements et état → sons
moteur/renderer.js  moteur du jeu (FERRO 0.2 + ajouts PDR)
moteur/audio.js     sons calculés (d'après FERRO)
moteur/musique.js   musique MOD calculée (d'après FERRO)
```

- Les scripts sont « classiques », sans module ES. Chacun s'accroche à `globalThis.PDR`, et ceux du travailleur n'utilisent ni `window` ni `document`.
- Une seule page : `construire.py` met tout en ligne. Les scripts du travailleur portent `data-travailleur`, et `hote.js` assemble leur texte dans un Blob. Si le navigateur refuse le travailleur, comme dans certains artefacts, la simulation tourne sur le fil principal.
- **Déterminisme** : la simulation n'emploie que des entiers, en millimètres, et un aléa à graine. Elle n'appelle ni `Math.sin`, ni `Math.cos`, ni horloge. Les commandes sont appliquées dans l'ordre canonique (itération, joueur, numéro). Une empreinte FNV-1a de 64 bits est relevée toutes les 100 itérations, et la partie s'enregistre pour être relue.
- **Échelle** : 262 144 emplacements d'unités, en tableaux par champ (`Int32Array`, `Uint8Array`…).
  - Une grille spatiale de 4 m est reconstruite à chaque itération par tri par comptage.
  - La foule s'écarte selon le gradient d'un champ de densité de 2 m : le coût par unité est constant, sans paires.
  - La recherche de cible est étalée : chaque unité cherche une itération sur huit, et pas plus de 32 voisins par recherche.
  - La navigation suit des champs de direction calculés sur la grille de 4 m (algorithme de Dial, coûts entiers 10 et 14). Ils sont mis en cache par but et par version des obstacles, et chaque ordre de groupe en partage un.
- **Rendu de la foule** : deux textures de données RGBA32F, l'état précédent et l'état courant, 1 024 de large. Elles sont interpolées dans le shader.
  - Les unités lointaines sont des points, dessinés en un seul appel sans attribut, par `gl_VertexID`.
  - Les unités proches sont des figurines animées sur le GPU, dessinées en instances à partir d'une liste d'indices faite par le CPU à chaque état reçu.
  - La sélection et le brouillard passent par deux petites textures.
  - Le renderer de FERRO reçoit deux points d'accroche marqués « PDR » : `fx.foule.ombre` dans la passe d'ombre du soleil, et `fx.foule.couleur` dans la passe couleur. Le voile du brouillard (`fx.voile`) assombrit le sol hors de vue.

## 3. Contrats entre modules

`src/sim/regles.js` et `src/sim/protocole.js` sont les contrats. Ils définissent les factions, les types, l'hostilité, le codage des unités, les messages, les commandes, les évènements et les tampons.
- Un module ne lit l'état d'un autre que par ces contrats et par l'API documentée en tête de ce module.
- Changer un contrat se fait dans ces deux fichiers, et nulle part ailleurs.

### 3.1 La ville et ses lieux de jeu (`ville.js`)

`PDR.ville.creerVille(graine, { ilots })` : `ilots` vaut 9 par défaut (l'essai 0.1), 13 ou 15 selon les effectifs (`PDR.regles.ilots`). La ville est la même, à l'octet près, dans la page et dans le travailleur. `PDR.villeReelle.creerVille('marseille', { ilots })` (`ville-reelle.js`) rend une ville de même forme tirée du plan réel. Les deux côtés passent par `PDR.protocole.villeDe(options, ilots)` : `options.ville` vaut `'marseille'` ou `'damier'`, et « pret » rend celle qui a vraiment été construite. En plus de ce qu'elle renvoie déjà (`objets`, `etendue`, `praticable`, `accrocher`, `sol`…), une ville renvoie :

```
sites = {
  qg:        [ { faction, x, z, rayon, sortie: [x, z] } × 3 ],     rayon : parvis (m) ; sortie : où sortent les recrues
  lieux:     [ { id, nom, x, z, rayon } ],                          7 à 11 lieux à prendre, nommés (« Place du Marché »…)
  gisements: [ { id, sorte: 'moyens' | 'materiaux', nom, x, z, rayon, stock } ],   marchés et chantiers
  cassables: [ { id, sorte, x, z, lacet, pv, rendement, pieces: [mesh FERRO] } ],   sorte : protocole.SORTES_CASSABLES
}
```

- Les pièces des cassables ne sont pas dans `objets` : `decor.js` les dessine intactes ou cassées.
- Les QG, le sol des lieux et celui des gisements sont dans `objets`.
- `decor.js` dessine les tas d'un gisement, qui baissent avec son stock, et les marques de propriété des lieux.
- Identifiants des structures : 0, 1 et 2 pour les QG (id = camp), puis croissants à partir de 3.

## 4. Critères d'acceptation, sur le Mac de référence

- **Simulation à 100 000 unités** : 25 ms par itération au plus, en moyenne, mesurés par `verifications/banc-sim.mjs`.
- **Rendu à 100 000 unités** : au moins 55 images par seconde en vue par défaut comme en ville entière, à 1 440 × 900, qualité auto. La mesure se fait dans Chrome, sans écran et sans port, piloté par tube.
- **Déterminisme** : deux exécutions de la même graine avec les mêmes commandes donnent les mêmes empreintes. Une partie relue donne aussi les mêmes empreintes.
- **Règles** : vérifiées par des tests.
  - Le Bastion ne frappe pas la Préfecture avant d'avoir été frappé.
  - Des alliés ne se frappent jamais.
  - Seule la Convergence casse et barricade.
  - Seuls le Bastion et la Préfecture lèvent ; seule la Préfecture lève les avant-postes.
- **IA** : une partie à trois IA de 10 minutes simulées, à 20 000 unités, se joue sans exception ni valeur invalide. Les ressources varient, des lieux changent de mains et des barricades sont posées puis levées.
- **Aucun fichier de son, d'image ou de modèle** ; la page charge seulement ce qu'elle contient.
- **Démo** : elle part 5 s après l'arrivée sur l'écran titre et s'arrête au premier geste.
