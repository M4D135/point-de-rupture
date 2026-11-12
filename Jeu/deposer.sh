#!/usr/bin/env bash
# Met https://pdr.estrasse.fr à jour avec la page construite du commit courant. Commande manuelle, sans timer :
#     Jeu/deposer.sh
# Sur amiga, compte ddd, sans root, même schéma que fps.estrasse.fr :
#     ~/apps/pdr/releases/<commit>/index.html  page d'un commit ; les 3 plus récentes sont gardées
#     ~/apps/pdr/current                       lien vers la version en ligne, basculé d'un coup
#     ~/apps/caddy-shared/vhosts.d/pdr.estrasse.fr.Caddyfile   copie de Jeu/deploiement/, appliquée par caddy-shared-apply
# Le VPS n'a pas accès au dépôt privé : la page part du Mac.
# Refuse de déposer une page qui ne serait pas celle du commit : Jeu/ doit être propre, avant et après la construction.
# Retour arrière : ssh amiga 'ln -sfn releases/<commit> ~/apps/pdr/current.new && mv -T ~/apps/pdr/current.new ~/apps/pdr/current'
set -euo pipefail

ici=$(cd "$(dirname "$0")" && pwd)
depot=$(git -C "$ici" rev-parse --show-toplevel)
hote=${PDR_HOTE:-amiga}
racine=/home/ddd/apps/pdr
vhost_local="$ici/deploiement/pdr.estrasse.fr.Caddyfile"
vhost_distant=/home/ddd/apps/caddy-shared/vhosts.d/pdr.estrasse.fr.Caddyfile
url=https://pdr.estrasse.fr/

propre() { [ -z "$(git -C "$depot" status --porcelain -- Jeu)" ]; }
propre || { echo "Jeu/ a des modifications non commitées : committer d'abord." >&2; exit 1; }
commit=$(git -C "$depot" rev-parse HEAD)

python3 "$ici/construire.py"
propre || { echo "La page construite diffère de celle du commit : committer Jeu/dist et Jeu/SIZE.json, puis relancer." >&2; exit 1; }
page="$ici/dist/point-de-rupture.html"
empreinte=$(shasum -a 256 "$page" | cut -d' ' -f1)

ssh -o BatchMode=yes "$hote" "install -d -m 755 $racine/releases && rm -rf -- $racine/releases/.tmp-$commit && install -d -m 755 $racine/releases/.tmp-$commit"
scp -q -o BatchMode=yes "$page" "$hote:$racine/releases/.tmp-$commit/index.html"
ssh -o BatchMode=yes "$hote" bash -s -- "$racine" "$commit" "$empreinte" <<'DISTANT'
set -euo pipefail
racine=$1 commit=$2 empreinte=$3
tmp=$racine/releases/.tmp-$commit
echo "$empreinte  $tmp/index.html" | sha256sum -c --quiet -
chmod -R u=rwX,go=rX "$tmp"
rm -rf -- "${racine:?}/releases/$commit"
mv "$tmp" "$racine/releases/$commit"
ln -sfn "releases/$commit" "$racine/current.new"
mv -T "$racine/current.new" "$racine/current"
echo "version en ligne : $commit"
cd "$racine/releases"
ls -1t | tail -n +4 | while read -r ancienne; do
  [ "$ancienne" = "$commit" ] || { rm -rf -- "$ancienne" && echo "version retirée : $ancienne"; }
done
DISTANT

if ! ssh -o BatchMode=yes "$hote" "cmp -s - $vhost_distant" < "$vhost_local"; then
  scp -q -o BatchMode=yes "$vhost_local" "$hote:$racine/pdr.estrasse.fr.Caddyfile"
  ssh -o BatchMode=yes "$hote" "install -m 644 $racine/pdr.estrasse.fr.Caddyfile $vhost_distant.tmp && mv $vhost_distant.tmp $vhost_distant && systemctl --user start caddy-shared-apply"
  echo "vhost posé et appliqué"
fi

for essai in $(seq 1 30); do
  servie=$(curl -fsS -m 15 "$url" 2>/dev/null | shasum -a 256 | cut -d' ' -f1 || true)
  [ "$servie" = "$empreinte" ] && { echo "EN LIGNE  $url  commit ${commit:0:7}, sha256 ${empreinte:0:16}"; exit 0; }
  sleep 2
done
echo "La page servie par $url n'est pas celle déposée (sha256 attendu ${empreinte:0:16})." >&2
exit 1
