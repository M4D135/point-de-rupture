#!/bin/zsh
# equilibres.sh <src> <dossier de sortie> <parallèle> [minutes] [effectifs] [villes] [modes] [graines] : parties d'équilibre.
SRC=$1; OUT=$2; P=${3:-6}; MIN=${4:-40}; EFF=${5:-"100000 20000"}; VIL=${6:-"marseille damier"}; MOD=${7:-"dernier temps points mixte"}; GR=${8:-1}
W=${W:-$(cd "${0:A:h}/../../.." && pwd)}   # racine du dépôt (ou de l'arbre de travail) qui contient ce script
mkdir -p $OUT
for e in ${=EFF}; do for v in ${=VIL}; do for mo in ${=MOD}; do for g in ${=GR}; do
  d=20; [[ $mo == mixte ]] && d=40
  echo "$v $e $mo $d $g"
done; done; done; done | xargs -P $P -L 1 zsh -c 'node '$W'/Jeu/verifications/equilibre.mjs --src '$SRC' --villes $0 --effectifs $1 --mode $2 --duree $3 --graines $4 --minutes '$MIN' --json '$OUT'/$0-$1-$2-g$4.json > '$OUT'/$0-$1-$2-g$4.txt 2>&1'
echo fini; uptime
