# Provenance du son

Le son de Point de rupture n'a aucun fichier : ni enregistrement, ni échantillon, ni module téléchargé. Tout se calcule
dans la page, en WebAudio et en JavaScript. Deux fichiers sont des portages de FERRO (`github.com/M4D135/METAL`, dépôt
privé), branche `campagne-18-mondes`, commit `4ce2271fe5a6db5d86042333f76b6b7baf76caea` du 12 novembre 2026 :

| Fichier du jeu | Source dans FERRO | Taille | sha256 de la source |
|---|---|---|---|
| `moteur/audio.js` | `src/audio.js` (FAudio) | 39 725 octets | `7949fdad5d90055e8d9e26fd2aacef229691ad941f5d59d56907534d8d4f9584` |
| `moteur/musique.js` | `src/music.js` (FMusic) | 20 526 octets | `f50361332f36c212461d3005489a5813f518ec65317f2f7c0727d9754f2f5d0b` |

Contrairement à `renderer.js`, ces deux fichiers ne sont pas copiés. Ils sont réécrits en français autour de
l'architecture de FERRO. Les sons, les instruments et la musique sont propres au jeu. `son.js`, qui relie le jeu au
moteur sonore, est entièrement neuf.

## Repris de FERRO

### Pour `audio.js`

- **Contexte paresseux.** Le contexte audio ne se crée qu'au premier geste (`start`/`resume`). Avant, toute demande est
  sans effet. Le contexte se ferme à la libération (`dispose`).
- **Chaîne de sortie.** Gain maître à 0,65 × général, puis compresseur (seuil −19 dB, genou 18, rapport 5, attaque 4 ms,
  relâche 180 ms), puis plafond doux par WaveShaper. La courbe est exactement linéaire sous 0,875 et bornée au-dessus :
  `0,875 + 0,095 × (1 − e^(−(|x| − 0,875) / 0,095))`.
- **Bus.** Bus séparés pour la musique, les effets et les ambiances, avec un écho court par `DelayNode` (0,5 s au plus)
  adouci par un passe-bas. Repli sur un simple gain sans `StereoPanner`.
- **Voix bornées par priorité.** 32 voix pour l'ambiance, 40 pour le monde, 48 pour le joueur et les annonces. Un son
  plus important prend la place d'un son moins important et plus faible, jamais celle de la musique.
- **Limite par direction.** Une même source, dans la même direction, attend son délai, sauf si elle est 1,45 fois plus
  forte. Rien ne joue sous 0,018.
- **Effacement de la musique.** La musique s'efface sous les sons forts, une seule fois par indice sonore. La priorité
  et l'effacement appartiennent à l'indice, pas à ses formes d'onde.
- **Primitives.** `ton` (oscillateur glissant, enveloppe percussive) et `bruit` (tampon de bruit de 2 s, filtré). Le
  tampon de bruit suit la formule de FERRO.
- **Essai du mixage de deux secondes.** Il passe par les vrais bus. Sa fin est programmée sur l'horloge audio, en plus
  de la minuterie. Un second essai annule le premier.

### Pour `musique.js`

- **Écriture du module ProTracker « M.K. ».** En-tête de 1 084 octets, 31 échantillons, ordres, motifs de 64 rangées
  × 4 canaux, PCM signé sur 8 bits dont les deux premiers octets sont nuls. Le module se relit pour la lecture.
- **Table des périodes de l'Amiga** (856 à 113) et horloge PAL. Une rangée dure 2,5 × vitesse / tempo.
- **Lecteur programmé à l'avance sur l'horloge audio.** Il anticipe de 0,28 s, programme au plus 6 rangées par tick et
  se recale sur une mesure après un retard. Il a ses 28 voix à lui. Gains et pans par canal.
- **Une mesure de batterie par échantillon**, sur le canal 4.
- **Préchauffage par tranches.** `setTimeout(0)` entre deux tâches, sans ouvrir de périphérique.
- **Export du module en octets.**

## Propre au jeu

### Musique

- **Instruments calculés.** Cuivres par récurrence de Tchebychev : trompette, trombone, tuba, pupitres en accord.
  Chœurs à formants (o, ou, « hé ! »). Sifflet à roulette. Basse en corde pincée (Karplus-Strong). Synthés à filtre
  d'état. Sirène.
- **Percussions de rue.** Batucada : surdos, caixa, tamborim, agogô, chocalho. Tambours de marche. Batterie
  électronique. Les mesures sont calculées au double du taux, puis jouées à la période 214.
- **Quatre morceaux originaux.**
  - « Point de rupture » (titre et démo), 108 BPM.
  - « La Convergence » (fanfare de rue, batucada), 132 BPM.
  - « Le Bastion » (tambours martiaux, cuivres graves), 92 BPM.
  - « La Préfecture » (pulsation tendue, synthés, motifs de sirène), 120 BPM.
- **Sections calme et tendue.** Chaque morceau a deux sections de six motifs. Le lecteur passe de l'une à l'autre en fin
  de motif, selon l'intensité : au-dessus de 0,55 vers la section tendue, sous 0,3 vers la section calme.
- **Tempo et vitesse dans le module.** Le tempo est écrit dès la première rangée et la vitesse 6 à la deuxième mesure,
  sur le canal de la batterie, qui ne porte jamais de volume.

### Banque de bruitages

Tous sont des `Float32Array` calculés au chargement :

- rumeur d'une foule qui parle, en boucle sans couture ;
- syllabes chantées par une foule (o, é, a, ou, « hé ») ;
- mêlée, feu de barricade, jet d'eau, fond de ville ;
- vitre, ferraille, bois, tôle de voiture ;
- clameurs « oh » et « hourra » ;
- cris d'une seule voix.

### Ambiances continues

Rumeur, ville et vent selon l'altitude, mêlée, feu, jet et moteur du canon à eau, sirène à épisodes.

### Séquenceur de rue

- Calé sur la musique : chaque rangée programmée du module (une double-croche) joue le pas de rue de même rang, au
  même instant et au tempo du morceau. Quand la musique se tait, une horloge propre à 100 BPM reprend la phrase.
- Vagues de chants des deux camps qui chantent.
- Batucada (plus forte avec une Fanfare) et marche du Bastion.
- Sifflets de la Convergence et de la Préfecture, radios de la Préfecture.
- Coups, boucliers et cris de la mêlée.
- Marteaux des chantiers, raclements des levées, bruits de la ville.

### Sons ponctuels

Ils suivent le ton du jeu : personne ne se blesse, et la salve est un souffle et un choc de boucliers, sans détonation.

### Interface

Accusé de réception d'un ordre au timbre de chaque camp, sélection au motif du camp.

### Filtres

Filtre de distance selon la hauteur de la caméra. Passe-haut sur les bus du monde, pour retirer l'infra-grave.

### `son.js`

- Balayage des unités par tranches, autour de la caméra, sans allocation : densité, part de chaque camp, mêlée,
  boucliers, véhicules, Fanfare, chantiers, levées.
- Lecture de la grille des combats et des structures (feux, chantiers).
- Évènements du protocole placés selon la vue et le zoom, les plus forts de chaque sorte par état.
- Logique « des nôtres » pour les annonces.
- Choix du morceau selon l'écran, réglages du joueur.

## Vérifications

- `verifications/musique.test.mjs` relit chaque module octet par octet. Il vérifie aussi :
  - le PCM bipolaire, sans composante continue ;
  - les octets identiques d'un chargement à l'autre ;
  - le lecteur sur un faux contexte : voix, sections, pause, recalage, rappel de chaque rangée ;
  - le préchauffage sans `AudioContext`.
- `verifications/son.test.mjs` porte le faux contexte WebAudio de `checks/audio.test.mjs` de FERRO. Il vérifie :
  - que rien ne joue avant un geste ;
  - que chaque son joue ;
  - le plafond de voix ;
  - les ambiances, la rue calée sur la musique, les évènements, les annonces, les volumes, l'écran, l'essai et la
    libération ;
  - l'absence de toute source de son externe dans les trois fichiers.
