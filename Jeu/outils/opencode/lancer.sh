#!/usr/bin/env bash
# Confie une tâche à opencode avec le modèle gratuit de DeepSeek, sur une copie de travail du jeu.
#     Jeu/outils/opencode/lancer.sh <dossier de travail> <consigne.md> [journal]
# Le réglage est isolé de celui de la machine, exprès :
#   - ni le serveur MCP de la mémoire KBZA ni les consignes globales (AGENTS.md, CLAUDE.md) ne sont chargés : un LLM
#     dans le nuage ne doit voir que le code du jeu ;
#   - opencode.json, à côté, n'autorise que node, la lecture de git et de fichiers, git rm, git mv et la construction
#     de la page ; tout le reste est refusé, le réseau et les fichiers hors du dossier aussi ;
#   - le modèle ne committe pas : on relit son diff, on lance les suites, on committe soi-même.
# Bon pour une tâche bornée que les suites savent vérifier. Ce qu'il rend est un premier jet.
# Un lancement reste parfois muet au démarrage : l'arrêter et relancer.
set -euo pipefail
ici=$(cd "$(dirname "$0")" && pwd)
dossier=${1:?dossier de travail}
consigne=${2:?fichier de consigne}
journal=${3:-/dev/stdout}
modele=${PDR_OPENCODE_MODELE:-opencode/deepseek-v4.1-flash-free}
reglage=$(mktemp -d "${TMPDIR:-/tmp}/pdr-opencode.XXXXXX")
mkdir -p "$reglage/opencode"
cp "$ici/opencode.json" "$ici/AGENTS.md" "$reglage/opencode/"
XDG_CONFIG_HOME="$reglage" OPENCODE_DISABLE_CLAUDE_CODE=1 opencode run --pure -m "$modele" --dir "$dossier" \
  --title "PDR $(basename "$consigne" .md)" "$(cat "$consigne")" > "$journal" 2>&1
