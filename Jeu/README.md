# Point de rupture — le jeu dans le navigateur

RTS urbain entièrement procédural : aucun fichier de décor, de modèle, de texture ni de son. La ville, les personnages
et les effets sont calculés au lancement ; le rendu est celui de FERRO (`src/moteur/`, provenance dans
`src/moteur/PROVENANCE.md`). Décision de David du 12 novembre 2026 : « oublie totalement le système classique,
full procedural rts ».

En ligne : https://pdr.estrasse.fr (page déposée par `deposer.sh`, voir plus bas).

## Essai 0.1 (12 novembre 2026)

Ce que montre cet essai : une ville générée, trois factions et jusqu'à 2 400 escouades de six figurines, commandées
à la souris et au clavier, avec un compteur d'images par seconde. Les factions n'ont pas encore de règles propres :
elles se déplacent, rien de plus. Le noyau (`src/noyau.js`) est le portage exact du noyau C++ de l'étape A1 :
entiers en millimètres, 20 itérations par seconde, commandes dans un ordre canonique, empreinte toutes les
100 itérations.

Mesures du 12 novembre 2026 sur le Mac de référence. Chrome sans écran, Metal, 1 440 × 813, MSAA ×4, ombre du soleil,
bloom, 5 s par relevé, aucune image lente :

| Escouades | Vue | Images/s | CPU par image | Appels | Triangles |
|---|---|---|---|---|---|
| 240 | par défaut | 60 | 0,8 ms | 19 | 926 024 |
| 960 | par défaut | 60,2 | 2,2 ms | 19 | 1 121 288 |
| 2 400 | par défaut | 60,1 | 4,0 ms | 19 | 1 405 632 |
| 2 400 | ville entière | 60,1 | 2,6 ms | 17 | 926 904 |

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
