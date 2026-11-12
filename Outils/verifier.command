#!/bin/zsh
# Point de rupture : lance la verification complete du projet dans une fenetre du Terminal.
# Un double-clic suffit, ici ou sur le raccourci du bureau qui pointe vers ce fichier.

# Le dossier du projet, quel que soit l'endroit d'ou ce fichier est lance (lien du bureau compris).
PROJET="${0:A:h:h}"
cd "$PROJET" || { echo "Dossier du projet introuvable : $PROJET"; read; exit 1; }

echo "POINT DE RUPTURE : vérification du projet"
echo
echo "Ce raccourci compile le projet, lance ses vérifications et rejoue cent parties de test."
echo "Il n'y a encore rien à voir à l'écran : ni carte, ni unités affichées. Compter une minute."
echo

/usr/bin/caffeinate -i /usr/bin/python3 -B Outils/verifier.py
code=$?

echo
if [ $code -eq 0 ]; then
  echo "Tout est bon : chaque ligne ci-dessus est un contrôle réussi."
else
  echo "Un contrôle a échoué : voir les lignes marquées ECART ou ECHEC ci-dessus."
fi
echo
echo "Appuyer sur Entrée pour fermer."
read
exit $code
