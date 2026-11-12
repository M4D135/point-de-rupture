# Plans de villes réelles

`extraire.py` tire le plan d'un vrai quartier des données OpenStreetMap et en fait un module du jeu,
`Jeu/src/villes/<ville>.js`, qui définit `PDR.plans.<ville>` : rues, bâtiments, eau, espaces au sol, repères nommés et
mobilier de rue, en mètres autour d'un centre choisi ; pour Marseille, aussi le **lointain** : ce que l'on voit des bords
du carré de jeu sans pouvoir y aller (monuments, côte, bâti en boîtes). Le damier de `src/ville.js` reste la « ville
imaginaire ».

État au 12/11/2026 : **Marseille** est livrée (centre au coin nord-est du Vieux-Port, 43,2962 N 5,3734 E).
Paris et New York ont leur entrée dans la table `VILLES` : l'outil les extrait et le test les passe, mais leurs
centres restent à revoir sur l'aperçu avant de les livrer, aux mises à jour suivantes.

Python 3 et sa bibliothèque standard, rien à installer. L'outil ne télécharge rien : il lit des tuiles posées dans un
dossier. Source permise : OpenStreetMap seulement (pas Google Maps, dont les conditions interdisent l'extraction).

## 1. Récupérer les tuiles

Tuiles vectorielles OpenFreeMap (schéma OpenMapTiles), zoom 14, celles qui couvrent le carré extrait : 1 220 m de
côté, soit le plus grand carré de jeu (1 100 m) et 60 m de marge. Elles se nomment `{ville}-14-{x}-{y}.pbf`.

    python3 Jeu/outils/plans/extraire.py --liste --tuiles DOSSIER

donne, ville par ville, les tuiles `14/x/y` qu'il faut et si elles sont là (2 à 4 par ville ; Marseille :
`14/8436/6001` et `14/8436/6002`). Les tuiles marquées « lointain, facultative » ne servent qu'au lointain : s'il en
manque une, sa zone est rognée de ce côté et le module le dit (`lointain.tuilesAbsentes`). Le module livré le
12/11/2026 est fait sans `14/8435/6001` ni `14/8435/6002` : le lointain s'arrête à 979 m à l'ouest, avant le MuCEM
(le J4) ; avec `14/8435/6001`, le MuCEM entre dans le plan sans rien changer d'autre à l'outil. L'adresse des tuiles dépend de la version du jeu de données ; elle est dans la
description TileJSON du service :

    curl -sfA 'osm-extract-client/1.0' https://tiles.openfreemap.org/planet -o DOSSIER/tilejson.json

`tiles[0]` y vaut par exemple `https://tiles.openfreemap.org/planet/20261101_080013_pt/{z}/{x}/{y}.pbf`. Puis, pour
chaque tuile listée :

    curl -sfA 'osm-extract-client/1.0' \
      https://tiles.openfreemap.org/planet/20261101_080013_pt/14/8436/6001.pbf -o DOSSIER/marseille-14-8436-6001.pbf

Garder `tilejson.json` à côté des tuiles (ou dans le dossier parent) : l'outil y lit la version, qu'il écrit dans
`source.tuiles` du module. Le service est gratuit et sans clé : quelques tuiles à la main, jamais de moisson.
Les tuiles ne vont pas dans le dépôt. Pour refaire un module à l'octet près plus tard, en garder une copie : une
version du jeu de données ne reste pas forcément en ligne. Sans `--tuiles`, l'outil cherche dans `outils/plans/tuiles/`.

## 2. Extraire

    python3 Jeu/outils/plans/extraire.py marseille --tuiles DOSSIER --apercu /tmp/marseille.svg

écrit `Jeu/src/villes/marseille.js` (`--sortie FICHIER` pour un autre chemin) en 0,3 s environ (10 s avec le
lointain de Marseille, dont le regroupement de 13 000 emprises en boîtes), et dit ce qu'il a
écarté (tunnels, sous-sols, commerces…), les éclats retirés, la taille, l'empreinte et les comptes par sorte.
Mêmes tuiles, mêmes octets : le module ne porte ni date ni chemin local. `--centre LAT,LON` essaie un autre cadrage
sans toucher à la table.

Les étapes :

1. décodage des tuiles (protobuf Mapbox Vector Tile) ;
2. découpe de chaque tuile à son emprise exacte dans le carré (le tampon appartient à la voisine), recollage des
   polygones et des lignes coupés aux bords communs, puis un polygone concave qui sort du carré et y rentre est
   scindé en ses vrais morceaux ;
3. passage en mètres : x vers l'est, z vers le sud, origine au centre, échelle exacte au centre (WGS 84) ;
4. classement : table de chaque couche OpenMapTiles vers les sortes du jeu ; ni tunnel, ni sous-sol, ni intérieur,
   ni commerce, ni enseigne, ni œuvre d'art ; un bâtiment sans volume au-dessus du sol est écarté ;
5. simplification (Douglas-Peucker à 0,4 m, angles des façades gardés), décimètres entiers, pointes repliées,
   éclats retirés (moins de 1,5 m² pour un bâtiment), trou qui déborde de son extérieur repris sans simplification
   ou retiré ;
6. codage : écarts en zigzag, varints, base64, empreinte FNV-1a vérifiée au chargement ; décodeur sans dépendance
   (ni `atob` ni `Buffer`), le même dans la page, le travailleur et Node.

Le mobilier vient des points d'intérêt (table `SORTES_MOBILIER`) : potelets, corbeilles, conteneurs, arceaux à vélos,
arrêts de bus, abris, boîtes aux lettres, fontaines, kiosques, œuvres, et une « terrasse » par restaurant, café, bar
ou glacier. Des points sans nom : aucune enseigne n'entre dans le jeu.

Le lointain (entrée `lointain` de la ville dans `VILLES` : `zone`, et `reperes` = nom du point d'intérêt, sa classe,
un rayon, un modèle) se charge à part, sur les tuiles présentes :

- autour de chaque repère, les bâtiments gardent leur emprise et leurs hauteurs, et portent l'indice du repère : le
  constructeur de la ville (`ville-reelle.js`) les habille selon le modèle ;
- les autres bâtiments deviennent des boîtes orientées : rectangle minimal de chaque emprise, puis regroupement des
  voisines de même orientation et de hauteur proche qui se touchent (`fusionner_boites`) ;
- l'eau (2,5 m), les grands espaces verts (4 m) et les voies de l'autoroute à la tertiaire, hors du carré ;
- les sommets qui ont un nom et une altitude (la colline de Notre-Dame de la Garde).

## 3. Aperçu

L'aperçu SVG montre l'eau, les rues par classe, les bâtiments (gris : hauteur inconnue ; du beige au brun selon la
hauteur connue), les espaces, les repères nommés et les trois carrés de jeu (660, 950 et 1 100 m). En image :

    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
      --user-data-dir=/tmp/profil-apercu --window-size=2440,2440 --screenshot=/tmp/marseille.png /tmp/marseille.svg

## 4. Vérifier

    node Jeu/verifications/plans.test.mjs
    PLANS=/tmp/essais node Jeu/verifications/plans.test.mjs      # les plans d'un autre dossier, avant de les livrer

Le test charge chaque module comme un script classique dans un contexte nu (ni `window`, ni `document`, ni `atob`),
contrôle valeurs, polygones (fermés, orientés, simples, trous logés), sortes, comptes et carrés de jeu (à 10 % du
damier), et vérifie qu'une donnée altérée est refusée.

## 5. Ajouter une ville

1. Une entrée dans `VILLES` : `nom`, `centre` (lat, lon), `notes` ; au besoin `exclus` (repères à ne pas montrer,
   par leur nom : enseignes, personnalités) et `aires` (nommer une aire piétonne par un repère qu'elle contient).
2. `--liste`, puis les tuiles (§ 1).
3. Extraire avec `--sortie` et `--apercu` dans un dossier d'essai, regarder l'aperçu, ajuster le centre
   (`--centre`), le reporter dans la table.
4. Écrire le module dans `src/villes/` et lancer le test.

Le chargement d'un module par le jeu (balise `<script>` de la page, `importScripts` du travailleur, construction de
`dist/`) n'est pas fait ici : c'est à l'intégration.

## 6. Le format

Décrit en tête de chaque module : c'est le contrat avec le constructeur de la ville. En bref :

- repère en mètres, x vers l'est, z vers le sud, origine au centre ; tout est au décimètre et tient dans
  `etendue` (±610 m) ; `carre(ilots)` rend le carré de jeu (660, 950, 1 100 m pour 9, 13, 15 îlots) ;
- `rues` : polylignes (`Float32Array` [x, z, …]) avec `classe`, `sousClasse`, `nom`, `pont`, `niveau`, `sens` ;
- `batiments`, `eau`, `espaces` : anneau extérieur (aire > 0) et trous (aire < 0), le premier point non répété ;
  bâtiments avec `hauteur`, `base`, `connue`, `contour`, `couleur` ;
- `reperes` : points nommés avec `sorte`, `rang` ;
- `mobilier` : points sans nom `{ sorte, x, z }` ;
- `lointain` : `null`, ou `{ zone, tuilesAbsentes, reperes, sommets, batiments, boites, eau, espaces, voies }` ;
  `boites` est un `Float32Array` [x, z, a, b, angle, hauteur] × n.

Pas de toits, peu de hauteurs connues (à Marseille, 1 080 bâtiments sur 5 274) : le constructeur choisit le reste.

## 7. Licence et mentions

Les données viennent d'OpenStreetMap, sous licence ODbL 1.0
(<https://www.openstreetmap.org/copyright>, <https://opendatacommons.org/licenses/odbl/1-0/>), par les tuiles
d'OpenFreeMap au schéma OpenMapTiles.

- Le jeu doit montrer, de façon visible (écran des crédits, coin de la carte quand la partie se joue dans une ville
  réelle), la mention que chaque module porte dans `PDR.plans.<ville>.attribution` :
  « © les contributeurs d'OpenStreetMap — données sous licence ODbL (https://www.openstreetmap.org/copyright) ·
  tuiles OpenFreeMap, schéma OpenMapTiles ».
- La description TileJSON d'OpenFreeMap demande « OpenFreeMap © OpenMapTiles Data from OpenStreetMap », avec les
  liens openfreemap.org, openmaptiles.org et openstreetmap.org/copyright : les crédits peuvent reprendre les deux.
- Un module `src/villes/*.js` est une base de données dérivée d'OpenStreetMap : il reste sous ODbL. Si le jeu est
  diffusé, ces modules (et l'outil qui les refait) doivent pouvoir être fournis sous cette licence ; le reste du jeu
  n'en relève pas, mais la mention doit l'accompagner. En résumé seulement : le texte de la licence fait foi.
- Ne retirer ni l'en-tête d'un module ni sa mention.
