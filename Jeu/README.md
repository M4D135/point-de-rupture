# Point de rupture — le jeu dans le navigateur

RTS urbain entièrement procédural : aucun fichier de décor, de modèle, de texture ni de son. La ville, les personnages
et les effets sont calculés au lancement ; le moteur de rendu, venu de FERRO, appartient au jeu (`src/moteur/`,
histoire dans `src/moteur/PROVENANCE.md`). Décision de David du 12 novembre 2026 : « oublie totalement le système
classique, full procedural rts ».

En ligne : https://pdr.estrasse.fr (page déposée par `deposer.sh`, voir plus bas).

## Essai 0.3 (en cours)

Étape « essai-0.3d » (12 novembre 2026) : le feu à l'écran, sur la simulation 0.3 encore en premier jet. Ce qui est
cassé prend feu ; les cocktails Molotov volent en cloche, éclatent et laissent une flaque en flammes ; chaque foyer
dresse une colonne de fumée noire penchée au vent, visible de loin ; le gaz fait des nuages blancs ; les objets cassés
roussissent puis finissent calcinés et laissent des traces de brûlure ; les huit foyers les plus proches éclairent la
rue. La partie va désormais jusqu'au dernier camp debout, avec 40 % de manifestants, et la démo ne s'arrête plus aux
points. Restent à venir : l'équilibre, les grenades et le canon à eau des IA (fin du lot de la simulation), les
immeubles qui brûlent et les pompiers, l'interface des nouveaux ordres et du choix de victoire.

Étape « essai-0.3c » (12 novembre 2026) : Z Q S D font défiler la vue, en plus des flèches et du bouton du milieu, et
Maj + Q ou D la tourne ; Arrêt passe donc de S à F, et la première production de Q à A. Des réglages déjà enregistrés
reçoivent ces touches sans perdre ce que le joueur avait choisi. Un Cortège sur huit porte la banderole, un Piquet sur
huit la pancarte : jusqu'ici, tous en portaient une.

Étape « essai-0.3b » (12 novembre 2026) : l'écran titre affiche l'édition et la version, en haut à droite (« 03 /
MARSEILLE V0.3b » ; la version seule sur un téléphone), comme dans METAL. `construire.py` les écrit dans la page à
partir de `VERSION` et d'`EDITION` : chaque page mise en ligne porte la sienne, et le titre ne peut plus en afficher
une ancienne.

Étape « essai-0.3a » (12 novembre 2026), première intégration du plan de la 0.3 (`PLAN.md`) :

- **Le moteur à jour.** `src/moteur/renderer.js` passe sur FERRO 0.2, le dernier état du moteur commun avant la
  suppression de ce dépôt, avec les six ajouts du jeu ; il appartient désormais au jeu (`src/moteur/PROVENANCE.md`).
  Image identique à la 0.2, réglages du moteur dans `REGLAGES_MOTEUR` (`src/jeu.js`).
- **La nouvelle Marseille.** Hauteurs réelles ou plausibles par quartier, toits de tuile, de zinc ou en terrasse,
  monuments dessinés d'après leur emprise (Hôtel de Ville, Saint-Ferréol, la Bourse, l'Opéra, les Accoules, la Vieille
  Charité), platanes, réverbères, terrasses, voitures et deux-roues garés, voiliers ; au loin, jusqu'à 1,25 km, la Major,
  les forts, le MuCEM et Notre-Dame de la Garde. Quatre sortes cassables de plus : deux-roues, conteneurs, terrasses,
  kiosques (leur feu viendra avec la simulation).

Mesures du 12 novembre 2026, mêmes conditions que la 0.2 (Chrome 157 sans écran, Metal, 1 440 × 900, MSAA ×4, ombres,
bloom, 5 s par relevé), charge moyenne de 5 :

| Ville | Écran | Images/s | Images lentes | Simulation par itération (moyenne, p95) |
|---|---|---|---|---|
| Marseille | démo | 60,1 | 0 | 24,1 ms (36,2) |
| Marseille | partie, vue par défaut | 60,1 | 0 | 14,9 ms (29,1) |
| imaginaire | démo | 60,2 | 0 | 23,2 ms (33,4) |
| imaginaire | partie, vue par défaut | 60,1 | 0 | 14,3 ms (21,8) |

Sur téléphone (390 × 844, 20 000 unités, Marseille) : 60 images/s, aucune image lente. Le décor de Marseille passe de
11 000 à 17 500 instances dans la vue de la partie. Le banc du rendu (`verifications/banc-rendu.py --moteur`, ancien et
nouveau moteur l'un après l'autre) ne voit pas d'écart au-delà du bruit de la machine. La page pèse 1,37 Mo (474 Ko
compressés), pour un budget de 3 Mo. Sans WebGL 2, la page affiche toujours son message de refus
(`verifications/sans-webgl2.py`).

Encore à venir, selon le plan : la musique sombre ; le feu, les cocktails Molotov, le gaz et la victoire au choix dans
la simulation ; le feu à l'écran ; des personnages mieux animés ; l'interface des nouveaux ordres et modes ; les
nouveaux bruitages de rue ; une démo qui dure. Musique et bruitages restent ceux de la 0.2 d'ici là.

## Essai 0.2 (12 novembre 2026)

Un vrai RTS à trois camps, joué sur le **plan réel de Marseille** (ou sur une ville imaginaire tirée d'une graine),
avec jusqu'à 200 000 unités, 100 000 par défaut. Conception et décisions de David : `CONCEPTION.md`.

- **Écrans** : chargement, titre, préparation (camp, alliance, effectifs, difficulté, ville, graine, brouillard,
  coalitions des IA), partie, pause et réglages à la manière de METAL (image, audio, commandes réassignables),
  fin avec bilan. Sans geste pendant 5 s sur l'écran titre, la **démo** part seule : trois IA, filmées par un
  réalisateur qui cherche l'action ; le moindre geste ramène au titre.
- **Règles** (`src/sim/regles.js`) : la Convergence casse, barricade, frappe le Bastion et la Préfecture ; le Bastion
  lève les barricades et ne frappe la Préfecture qu'en colère, quand elle l'a frappé ; la Préfecture lève tout et
  frappe tout le monde. Deux camps sur trois peuvent s'allier. Récolte, production, avant-postes, lieux à tenir.
- **Simulation** dans un Web Worker (`src/sim/`, `src/hote.js`), à 20 itérations par seconde, en entiers et
  millimètres, déterministe ; repli sur le fil principal si le navigateur refuse le travailleur.
- **Rendu** FERRO (`src/moteur/renderer.js`) : la foule entière sur le GPU (`src/foule.js`), le décor vivant
  (`src/decor.js` : barricades, feux, casse, gisements, lieux), la caméra RTS au-dessus des toits (`src/camera.js`).
- **Son** sans fichier (`src/moteur/audio.js`, `src/moteur/musique.js`, `src/son.js`) : bruitages calculés, quatre
  morceaux ProTracker (thème et un par camp), exportables en `.mod` depuis les réglages.
- **Plan réel** : rues, bâti, eau et parcs d'OpenStreetMap, par les tuiles vectorielles d'OpenFreeMap
  (`outils/plans/`, `src/villes/marseille.js`, `src/ville-reelle.js`). Licence ODbL : le jeu affiche
  « © les contributeurs d'OpenStreetMap ». Paris et New York viendront dans les mises à jour suivantes.

Mesures du 12 novembre 2026 sur le Mac de référence (Apple M5), Chrome 157 sans écran, Metal, 1 440 × 900,
MSAA ×4, ombre du soleil, bloom, 100 000 unités, 5 s par relevé. La machine était chargée par d'autres travaux
(charge moyenne de 9 à 11) ; la simulation a tenu ses 20 états par seconde dans tous les relevés.

| Ville | Écran | Images/s | Images lentes | Simulation par itération (moyenne, p95) |
|---|---|---|---|---|
| Marseille | démo | 60,1 | 0 | 22,2 ms (28,4) |
| Marseille | partie, vue par défaut | 60,1 | 0 | 16,4 ms (20,3) |
| imaginaire | démo | 60,2 | 0 | 17,9 ms (22,7) |
| imaginaire | partie, vue par défaut | 60,1 | 0 | 16,2 ms (22,4) |

Marseille se construit en 0,1 à 0,2 s selon le carré de jeu (660, 950 ou 1 100 m de côté autour du Vieux-Port,
pour 9, 13 ou 15 « îlots » d'effectifs) : 15 000 à 31 000 pièces de décor, 1 100 à 3 900 objets cassables.

Sur téléphone (390 × 844, tactile émulé, 20 000 unités) : 60 images/s en démo comme en partie.

L'essai 0.1 (2 400 escouades sans règles, noyau `src/noyau.js`) reste dans l'historique du dépôt ; `noyau.js` et son
essai sont gardés, mais la page ne le charge plus.

## Construire, vérifier, ouvrir

```bash
python3 Jeu/construire.py
```

```bash
for t in Jeu/verifications/*.test.mjs; do node "$t" || break; done
```

`construire.py` écrit `dist/point-de-rupture.html`, une page autonome à ouvrir telle quelle. Il écrit aussi
`dist/artefact.html`, le même contenu sans enveloppe, pour la publication en artefact, et `SIZE.json` : tailles,
empreinte et sources.

## Mettre en ligne

```bash
Jeu/deposer.sh
```

La commande refuse de partir si `Jeu/` a des modifications non commitées, ou si la page reconstruite diffère de
celle du commit. Elle dépose la page sur amiga dans `~/apps/pdr/releases/<commit>/`, puis bascule le lien
`~/apps/pdr/current` d'un coup et garde les trois dernières versions. Elle pose le vhost
`deploiement/pdr.estrasse.fr.Caddyfile` s'il manque ou a changé. Elle vérifie enfin que la page servie a la même
empreinte que la page déposée. Il n'y a pas de timer : chaque mise en ligne est voulue.
