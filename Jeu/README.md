# Point de rupture — le jeu dans le navigateur

RTS urbain entièrement procédural : aucun fichier de décor, de modèle, de texture ni de son. La ville, les personnages
et les effets sont calculés au lancement ; le rendu est celui de FERRO (`src/moteur/`, provenance dans
`src/moteur/PROVENANCE.md`). Décision de David du 12 novembre 2026 : « oublie totalement le système classique,
full procedural rts ».

En ligne : https://pdr.estrasse.fr (page déposée par `deposer.sh`, voir plus bas).

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
