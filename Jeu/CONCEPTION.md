# Point de rupture — conception de la version 0.2

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

**Plan réel.** Les rues, le bâti, l'eau et les parcs viennent d'OpenStreetMap, par les tuiles vectorielles
d'OpenFreeMap (schéma OpenMapTiles, zoom 14), et non de Google Maps, dont les conditions interdisent d'extraire les
données. Licence ODbL : le jeu affiche « © les contributeurs d'OpenStreetMap » tant que la ville vient de ces données
(écran titre, minicarte, préparation). Outil : `outils/plans/extraire.py`, données : `src/villes/marseille.js`.

**FERRO de référence.** Branche `campagne-18-mondes`, commit `4ce2271`. Son `renderer.js` est identique à celui du commit `950f743`, déjà repris dans `src/moteur/`. Ce qui a évolué depuis, et que l'on reprend : `audio.js` (sons calculés), `music.js` (musique ProTracker à quatre canaux, instruments calculés), `options.js` et le menu de réglages, `effects.js` et `destruction.js` pour les effets.

**Ton**, repris de `CONTRE-EXPERTISE.md` §4.6 : une bagarre burlesque stylisée.
- Personne ne meurt ni ne saigne. Une unité à bout de cohésion est « hors jeu » et quitte la partie.
- Aucune arme à feu, aucune lame, aucun feu sur un personnage. Une barricade peut brûler.
- Aucun drapeau, emblème, slogan, sigle, uniforme ou personnalité réels, aucune cause énoncée. Les camps se distinguent par leur couleur et par un motif : rond, carré, chevron.

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

**Alliances.** Une seule à la fois, entre deux des trois camps.
- Des alliés ne se frappent pas, partagent leur vue et gagnent ensemble.
- Une alliance se choisit à la préparation. En partie, on peut en proposer une ou la rompre, puis attendre 60 s avant toute nouvelle alliance.
- Une IA accepte une alliance quand le troisième camp est le plus fort. Deux IA s'allient contre un camp qui dépasse 45 % de la force totale.

### 1.3 Unités

Il y a 13 types d'unités, définis dans `src/sim/regles.js` avec leurs chiffres. Ces chiffres sont provisoires et se règlent ensemble.
- **Convergence** : Équipe, Cortège, Furets, Fanfare. Le nombre, la vitesse, la casse et les barricades.
- **Bastion** : Équipe, Piquets, Pavois, Béliers. Tenir, encaisser, lever.
- **Préfecture** : Équipe, Patrouille, Compagnie, Motards, Canon à eau. Peu nombreux, chers, outils de zone, un véhicule.

### 1.4 Économie

**Ressources.** Il y en a deux : les **Moyens** et les **Matériaux**.
- **Gisements** : les marchés donnent des Moyens, les chantiers des Matériaux. Leur stock est fini.
- **Récolte** : une Équipe porte 10 unités par voyage jusqu'au dépôt le plus proche, son QG ou l'un de ses avant-postes. Un gisement accepte 40 récolteurs à la fois ; les suivants attendent à côté.
- **Revenus propres à chaque camp** :
  - la casse rapporte des Matériaux à la Convergence ;
  - lever une barricade rend 50 % de son coût au Bastion ou à la Préfecture ;
  - la Préfecture reçoit une dotation de 120 Moyens par minute tant que son QG n'est pas occupé ;
  - chaque lieu tenu rapporte 40 Moyens par minute.

**Production.**
- Elle se fait par lots : un ordre donne un lot d'unités.
- Le QG produit tous les types de son camp ; un avant-poste produit les Équipes et l'unité de base.
- Chaque producteur a une file de 5 ordres et un point de ralliement.

**Effectifs.**
- Le réglage E (20 000, 50 000, **100 000** par défaut, 150 000 ou 200 000) fixe le nombre d'unités présentes au départ.
- Parts : Convergence 50 %, Bastion 27 %, Préfecture 23 %, dont 4 % d'Équipes dans chaque camp.
- Plafond de chaque camp : 125 % de sa part.
- La ville grandit avec E : 9 îlots par côté jusqu'à 30 000 unités, 13 jusqu'à 120 000, 15 au-delà.

### 1.5 Combat

- **Cohésion et pression.** La cohésion tient lieu de points de vie. Au contact, une unité inflige une pression par seconde, donnée par la table des types.
- **Angle.** Une pression reçue de flanc ou de dos, hors de l'arc frontal de 120°, est multipliée par 1,5. Une unité protégée ne reçoit que la moitié de la pression de face.
- **À zéro de cohésion**, l'unité est hors jeu.
- **Repli automatique.** Sous 25 % de cohésion, une unité se replie vers la zone de soutien la plus proche, sauf en posture « Tenir ». Elle court 30 % plus vite et ne frappe pas.
- **Zones de soutien** : le QG et les avant-postes rendent 5 points de cohésion par seconde.
- **Capacités.**
  - Salve, de la Compagnie : zone de 6 m de rayon jusqu'à 14 m, annoncée 1,5 s avant ; 10 points à dix unités au plus, les plus proches, recharge 30 s. Réglage du 12/11 : à 35 points sans plafond toutes les 20 s, elle faisait 86 % des points de la Préfecture.
  - Jet, du Canon à eau : cône de 18 m, avec recul.
  - Interpeller, de la Patrouille : pression doublée sur une unité sous 30 % de cohésion.
  - Soigner, de la Fanfare : +3 de cohésion par seconde aux unités de son camp à moins de 8 m.

### 1.6 Structures

**QG.** Chaque camp en a un, déjà en place, indestructible.
- Il est « occupé » après 60 s cumulées d'ennemis sur son parvis sans défenseur. Il ne produit plus, et la dotation de la Préfecture s'arrête.
- Son camp le reprend par 20 s de présence sans ennemi.

**Avant-postes** : le Relais pour la Convergence, le Cantonnement pour le Bastion, le Poste mobile pour la Préfecture.
- Coût : 150 Moyens et 100 Matériaux. Ce sont les Équipes qui les bâtissent.
- Un avant-poste sert de dépôt, de petit producteur et de zone de soutien.
- La Convergence peut le casser, la Préfecture le lever.

**Barricades** : la Convergence seulement.
- Segment de 4 à 20 m en travers d'une rue, à 6 Matériaux par mètre et 40 points de structure par mètre.
- Toute unité de la Convergence peut la bâtir.
- Elle bloque les déplacements de tous.
- Le Bastion et la Préfecture la lèvent ; la Convergence peut retirer les siennes.
- Certaines brûlent. Le feu est un décor : il ne touche jamais une unité.

### 1.7 Victoire

- Chaque lieu tenu rapporte 1 point par seconde. On en prend un en y restant 15 s sans ennemi ; une présence ennemie gèle la prise.
- On gagne à 3 000 points ; les scores de deux alliés s'additionnent. On gagne aussi quand tous les camps hostiles sont éliminés.
- Un camp est éliminé quand son QG est occupé, qu'il n'a plus d'avant-poste et qu'il lui reste moins de 2 % de ses effectifs de départ.
- À 40 minutes, le meilleur score l'emporte.

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
| A | attaque-mouvement | S | arrêt |
| H | tenir | R | se replier |
| G | regrouper | B | barricade |
| L | lever | C | casser |
| E | avant-poste | X | récolter |

- Ctrl+1 à 9 et 1 à 9 : groupes ; un double appui centre la vue.
- F1 : Équipes oisives. F2 : toute l'armée. F3 : le QG. Espace : la dernière alerte.
- Échap : annuler, ou pause.
- Les flèches : déplacer la vue ; Début et Fin : la tourner ; + et − : zoom. Les lettres servent aux ordres et à la production (Q, W, E, R), d'où ce choix ; tout se réassigne dans les réglages.

### 1.11 Démo

- Une partie à trois IA, avec les effectifs choisis (100 000 par défaut), sans brouillard.
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
moteur/renderer.js  FERRO + retouches PDR
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
