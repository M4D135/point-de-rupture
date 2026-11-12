#!/bin/bash
# Pilote de la chaîne du Spark pour L9 (immeubles en feu, pompiers) : les fiches par groupes, puis une relecture du
# Spark sur tout ce qui a été commité. Un seul passage, sans timer. Décision de David du 12/11/2026 : « donne un maximum
# de boulot au spark avant ta pause, tu reprendras ses resultats ».
#   Jeu/outils/spark/fiches/l9/pilote.sh <arbre de travail de la branche v03-feu-sim>
# Journal, sorties du Spark et BILAN.md dans fiches/l9/sorties/ (non suivi).
set -u
ICI=$(cd "$(dirname "$0")" && pwd)
OUTILS=$(cd "$ICI/../.." && pwd)
ARBRE=${1:?arbre de travail de la branche v03-feu-sim}
SORTIE=$ICI/sorties
mkdir -p "$SORTIE"
JOURNAL=$SORTIE/pilote.log
exec >>"$JOURNAL" 2>&1
dire() { echo "$(date '+%d/%m %H:%M:%S') pilote : $*"; }
fiches() { for n in "$@"; do echo "$ICI/$n.md"; done; }
chaine() { (cd "$ARBRE" && python3 "$OUTILS/chaine.py" "$@" --sortie "$SORTIE/chaine"); }

cd "$ARBRE" || { dire "arbre introuvable : $ARBRE"; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = v03-feu-sim ] || { dire "l'arbre n'est pas sur v03-feu-sim"; exit 1; }
BASE=$(git rev-parse HEAD)
dire "départ sur $(git rev-parse --short HEAD)"

# 1. Le module, son test, son chargement et le protocole : chacune dépend de la précédente.
chaine $(fiches l9-02-types l9-03-module l9-04-module-suite l9-05-test l9-06-branchement l9-07-protocole) --arret; G1=$?
# 2. Les deux villes, indépendantes de tout le reste.
chaine $(fiches l9-08-ville); G2=$?
chaine $(fiches l9-09-ville-reelle); G3=$?
# 3. La simulation : il faut le module, le protocole et la ville imaginaire (les contrôles s'en servent).
G4=pas-lancé
if [ "$G1" = 0 ] && [ "$G2" = 0 ]; then
  chaine $(fiches l9-10-monde-branchement l9-11-monde-etat l9-12-monde-lance l9-13-monde-jet l9-14-monde-recul l9-15-ia-pompiers l9-16-tests) --arret; G4=$?
fi
dire "groupes (0 = vert) : module et protocole $G1 ; ville imaginaire $G2 ; Marseille $G3 ; simulation $G4"

# 4. Relecture du Spark sur le code commité par la chaîne (les constats se vérifient avant d'être suivis).
git diff "$BASE"..HEAD -- Jeu/src Jeu/verifications > "$SORTIE/diff-l9.txt"
if [ -s "$SORTIE/diff-l9.txt" ]; then
  dire "relecture de $(wc -l < "$SORTIE/diff-l9.txt" | tr -d ' ') lignes de diff"
  python3 "$OUTILS/spark.py" --sortie "$SORTIE/relectures" digerer diff-l9 "$SORTIE/diff-l9.txt" \
    --quoi "le diff des lots L9 de Point de rupture (immeubles qui brûlent, pompiers), simulation déterministe en JavaScript : positions en mm dans monde.js, en mètres dans immeubles.js" \
    --questions "1) erreurs de logique (indices, mm contre mètres, signes, bornes, cas vides) ; 2) non-déterminisme (Math.random, Date, ordre des objets) ; 3) allocations ou boucles coûteuses à chaque itération ; 4) écarts au contrat de protocole.js ; 5) code mort ou oublié. Pour chaque constat : fichier, ligne, gravité, correction proposée."
  dire "relecture finie (code $?)"
fi

{
  echo "# Pilote L9 : bilan du $(date '+%d/%m/%Y %H:%M')"
  echo
  echo "Groupes (0 = vert) : module et protocole $G1 ; ville imaginaire $G2 ; Marseille $G3 ; simulation $G4."
  echo
  echo "## Commits de la chaîne sur v03-feu-sim (depuis $(git rev-parse --short "$BASE"))"
  git log --oneline "$BASE"..HEAD
  echo
  echo "## Bilans des fiches"
  grep -E '^(VERT|ROUGE|ARRÊT)' "$JOURNAL"
  echo
  echo "## Relectures du Spark"
  ls "$SORTIE/relectures" 2>/dev/null
} > "$SORTIE/BILAN.md"
dire "fin ; bilan dans $SORTIE/BILAN.md"
