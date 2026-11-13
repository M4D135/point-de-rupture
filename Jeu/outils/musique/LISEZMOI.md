# Outils de mesure de la musique

Deux outils seulement, sans réseau ni paquet : `rendu.mjs` et `mesurer.mjs`.

- `rendu.mjs` rend hors ligne un module de `PDR.musique` en PCM stéréo, avec les règles du lecteur
  (`moteur/musique.js`, `creer`) : périodes de l'Amiga, volumes et effet C, coupes, panoramiques, gains des
  quatre pistes ; il ajoute l'analyse (FFT, bandes, crête, RMS, continu, silences, écrêtage, WAV).
- `mesurer.mjs` charge un `musique.js`, rend chaque section calme et tendue des quatre morceaux, mesure et
  écrit éventuellement un JSON (`--json`) et des WAV (`--wav dossier`). Exemple, depuis la racine du jeu :
  `node Jeu/outils/musique/mesurer.mjs Jeu/src/moteur/musique.js --json mesures.json --bref`.
- Le préchauffage est mesuré au temps processeur (`process.cpuUsage`), meilleure et médiane de 7 passes.
- `mesures-avant.json` garde le relevé de l'ancienne musique (0.2), fait avant sa suppression ; c'est la
  référence « avant » des tableaux de `MORCEAUX.md`.
- La musique de la 0.2 (`musique-avant.js`) n'est plus dans le dépôt : elle est dans l'historique git.
- `MORCEAUX.md` décrit les quatre morceaux et donne les tableaux de mesures avant / après.
