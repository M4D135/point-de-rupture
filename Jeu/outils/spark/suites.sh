#!/bin/bash
# Le filet des fiches écrites par le Spark : toutes les suites de Jeu/verifications, puis la construction de la page (dist
# remis tel quel). Se lance depuis la racine d'un arbre de travail.
f=$(mktemp)
for t in Jeu/verifications/*.test.mjs; do
  node "$t" > "$f" 2>&1 || { tail -40 "$f"; echo "échec : $t"; rm -f "$f"; exit 1; }
done
rm -f "$f"
python3 Jeu/construire.py > /dev/null && git checkout -- Jeu/dist Jeu/SIZE.json
