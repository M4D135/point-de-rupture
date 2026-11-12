# Relevés de l'étape A1 — 12 novembre 2026

Sorties brutes à l'appui de `CONTRE-EXPERTISE.md`, sections 8.1, 8.3, 8.8 et 9. Rien n'y est retouché, sauf les chemins, ramenés au dossier du projet.

Machine : MacBook Air M5, 24 Go, macOS 27.2.1, Unreal Engine 5.8.4, Xcode 27.2. Script : `Outils/verifier.py`, dans la version du commit qui porte ce fichier, sauf pour la partie 6. Pendant les relevés des parties 1 à 3, la machine servait à d'autres travaux : sa charge moyenne est notée avec les sorties, et les durées s'en ressentent.

## 1. Vérification complète, cinq séries de mesures

Commande : `caffeinate -i python3 Outils/verifier.py --mesures 5`.

```
##### A. Verification complete avec cinq series de mesures
12/11/2026 09:59:29 - charge moyenne de la machine (1, 5 et 15 minutes) : 6.4, 9.7, 9.8
SOURCES   conformes : ASCII partout ; dans le noyau, ni mot interdit ni litteral a virgule
RESEAU    ecoute de l'outil de compilation coupee pour ce projet
COMPILER  reussie, sans avertissement ni ecoute reseau en 4.1 s
BINAIRES  a jour : 13 objets, aucun plus ancien que ses sources
NOYAU     4 objets compiles : aucune instruction a virgule flottante, aucun appel hors memoire, chaines et assertions
TESTS     509 verifications (attendu 509), 0 echecs, 386.6 ms
BOUCLE    24000 iterations a vide en 0.073 ms
FILE      100000 commandes soumises d'avance, jouees en 0.682 ms (plafond 100 ms)
PARTIES   100 parties de 10000 iterations, 100 conformes, 100 distinctes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
RELIRE    100 fichiers relus, 100 conformes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
COMMANDE  code de sortie 0, 18.8 s demarrage du moteur compris
MESURE    commande complete, en secondes : minimum 13.696, mediane 16.019, sur 5
MESURE    suite de tests, en ms : minimum 370.000, mediane 391.900, sur 5
MESURE    24 000 iterations a vide, en ms : minimum 0.069, mediane 0.073, sur 5
MESURE    regime charge, en microsecondes par iteration : minimum 66.390, mediane 69.730, sur 5
MESURE    regime charge, en pour cent du budget : minimum 26.600, mediane 27.900, sur 5
MESURE    file longue, avance en ms : minimum 0.614, mediane 0.679, sur 5
MESURE    cent parties jouees et rejouees, en ms : minimum 2076.400, mediane 2340.600, sur 5
MESURE    24 000 iterations, 48 escouades en marche, en ms : minimum 31.090, mediane 33.459, sur 5
MESURE    24 000 iterations, 200 escouades en marche, en ms : minimum 129.373, mediane 139.115, sur 5
MESURE    24 000 iterations, 4096 escouades en marche, en ms : minimum 2193.151, mediane 2863.279, sur 5
RESEAU    aucune ecoute hors de cette machine en 23 releves, pris pendant la compilation et l'execution
RESULTAT  REUSSI
code de sortie : 0 ; duree totale 293 s
10:04:21 - charge moyenne de la machine (1, 5 et 15 minutes) : 7.6, 7.8, 8.8
```

## 2. Cycle réel, de la retouche au résultat

Un fichier est retouché, puis `python3 Outils/verifier.py` est lancé en entier : contrôle des sources, compilation, fraîcheur des binaires, objets du noyau, tests, cent parties jouées, écrites et relues, écoutes réseau. Cinq fois par cas, la durée étant celle du script entier.

```
##### B. Cycle reel : un fichier retouche, puis le script de verification entier, cinq fois par cas
un fichier du noyau (PdrSimulation.cpp)    essai 1 :  23.4 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 4.4 s | COMMANDE  code de sortie 0, 18.0 s demarrage du moteur compris | RESULTAT  REUSSI
un fichier du noyau (PdrSimulation.cpp)    essai 2 :  27.2 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 5.0 s | COMMANDE  code de sortie 0, 20.8 s demarrage du moteur compris | RESULTAT  REUSSI
un fichier du noyau (PdrSimulation.cpp)    essai 3 :  35.9 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 5.0 s | COMMANDE  code de sortie 0, 29.5 s demarrage du moteur compris | RESULTAT  REUSSI
un fichier du noyau (PdrSimulation.cpp)    essai 4 :  32.7 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 6.4 s | COMMANDE  code de sortie 0, 24.6 s demarrage du moteur compris | RESULTAT  REUSSI
un fichier du noyau (PdrSimulation.cpp)    essai 5 :  30.3 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 4.7 s | COMMANDE  code de sortie 0, 24.3 s demarrage du moteur compris | RESULTAT  REUSSI
un fichier du noyau (PdrSimulation.cpp)    minimum 23.4 s, mediane 30.3 s
10:06:51 - charge moyenne de la machine (1, 5 et 15 minutes) : 12.5, 10.2, 9.6
un en-tete du noyau (PdrSimulation.h)      essai 1 :  44.3 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 14.8 s | COMMANDE  code de sortie 0, 28.1 s demarrage du moteur compris | RESULTAT  REUSSI
un en-tete du noyau (PdrSimulation.h)      essai 2 :  39.5 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 12.8 s | COMMANDE  code de sortie 0, 25.6 s demarrage du moteur compris | RESULTAT  REUSSI
un en-tete du noyau (PdrSimulation.h)      essai 3 :  41.6 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 13.5 s | COMMANDE  code de sortie 0, 26.7 s demarrage du moteur compris | RESULTAT  REUSSI
un en-tete du noyau (PdrSimulation.h)      essai 4 :  43.1 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 17.1 s | COMMANDE  code de sortie 0, 24.7 s demarrage du moteur compris | RESULTAT  REUSSI
un en-tete du noyau (PdrSimulation.h)      essai 5 :  45.2 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 16.3 s | COMMANDE  code de sortie 0, 27.4 s demarrage du moteur compris | RESULTAT  REUSSI
un en-tete du noyau (PdrSimulation.h)      minimum 39.5 s, mediane 43.1 s
10:10:25 - charge moyenne de la machine (1, 5 et 15 minutes) : 12.6, 10.4, 9.8
le fichier de tests (PdrTests.cpp)         essai 1 :  42.7 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 17.0 s | COMMANDE  code de sortie 0, 24.3 s demarrage du moteur compris | RESULTAT  REUSSI
le fichier de tests (PdrTests.cpp)         essai 2 :  40.2 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 11.5 s | COMMANDE  code de sortie 0, 26.9 s demarrage du moteur compris | RESULTAT  REUSSI
le fichier de tests (PdrTests.cpp)         essai 3 :  38.9 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 11.1 s | COMMANDE  code de sortie 0, 26.1 s demarrage du moteur compris | RESULTAT  REUSSI
le fichier de tests (PdrTests.cpp)         essai 4 :  55.2 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 21.5 s | COMMANDE  code de sortie 0, 32.1 s demarrage du moteur compris | RESULTAT  REUSSI
le fichier de tests (PdrTests.cpp)         essai 5 :  44.1 s | COMPILER  reussie, sans avertissement ni ecoute reseau en 15.0 s | COMMANDE  code de sortie 0, 27.2 s demarrage du moteur compris | RESULTAT  REUSSI
le fichier de tests (PdrTests.cpp)         minimum 38.9 s, mediane 42.7 s
10:14:06 - charge moyenne de la machine (1, 5 et 15 minutes) : 10.7, 10.9, 10.2


##### C. Retour au code d'origine
SOURCES   conformes : ASCII partout ; dans le noyau, ni mot interdit ni litteral a virgule
RESEAU    ecoute de l'outil de compilation coupee pour ce projet
COMPILER  reussie, sans avertissement ni ecoute reseau en 12.2 s
BINAIRES  a jour : 13 objets, aucun plus ancien que ses sources
NOYAU     4 objets compiles : aucune instruction a virgule flottante, aucun appel hors memoire, chaines et assertions
TESTS     509 verifications (attendu 509), 0 echecs, 668.8 ms
BOUCLE    24000 iterations a vide en 0.124 ms
FILE      100000 commandes soumises d'avance, jouees en 1.353 ms (plafond 100 ms)
PARTIES   100 parties de 10000 iterations, 100 conformes, 100 distinctes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
RELIRE    100 fichiers relus, 100 conformes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
COMMANDE  code de sortie 0, 24.6 s demarrage du moteur compris
RESEAU    aucune ecoute hors de cette machine en 37 releves, pris pendant la compilation et l'execution
RESULTAT  REUSSI
code de sortie : 0 ; duree 38.2 s
10:14:44 - charge moyenne de la machine (1, 5 et 15 minutes) : 10.1, 10.7, 10.1
```

## 3. Épreuves des garde-fous du script

Chaque épreuve provoque la faute qu'un contrôle doit voir, puis revient au code d'origine.

```
##### 1. Compilation sans en-tete precompile : chaque fichier doit se suffire a lui-meme
code de sortie : 0
Compile [Apple] PerModuleInline.gen.cpp
Compile [Apple] PdrSim.cpp
Compile [Apple] PdrBase.cpp
Compile [Apple] PdrOutils.cpp
Compile [Apple] PdrSimulation.cpp
Compile [Apple] PerModuleInline.gen.cpp
Compile [Apple] PdrRelecture.cpp
Link [Apple] libUnrealEditor-PdrSim.dylib
Compile [Apple] PdrExecuteur.cpp
Compile [Apple] PerModuleInline.gen.cpp
Compile [Apple] PointDeRupture.cpp
Compile [Apple] Module.PdrOutils.gen.cpp
Link [Apple] libUnrealEditor-PointDeRupture.dylib
Compile [Apple] PdrSimCommandlet.cpp
Compile [Apple] PdrTests.cpp
Link [Apple] libUnrealEditor-PdrOutils.dylib
Result: Succeeded
Total execution time: 13.20 seconds
options -include-pch restantes dans les lignes de compilation du projet : 0

##### 2. Retour a la compilation ordinaire et verification complete
SOURCES   conformes : ASCII partout ; dans le noyau, ni mot interdit ni litteral a virgule
RESEAU    ecoute de l'outil de compilation coupee pour ce projet
COMPILER  reussie, sans avertissement ni ecoute reseau en 29.9 s
BINAIRES  a jour : 13 objets, aucun plus ancien que ses sources
NOYAU     4 objets compiles : aucune instruction a virgule flottante, aucun appel hors memoire, chaines et assertions
TESTS     509 verifications (attendu 509), 0 echecs, 603.1 ms
BOUCLE    24000 iterations a vide en 0.125 ms
FILE      100000 commandes soumises d'avance, jouees en 1.161 ms (plafond 100 ms)
PARTIES   100 parties de 10000 iterations, 100 conformes, 100 distinctes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
RELIRE    100 fichiers relus, 100 conformes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
COMMANDE  code de sortie 0, 33.8 s demarrage du moteur compris
RESEAU    aucune ecoute hors de cette machine en 60 releves, pris pendant la compilation et l'execution
RESULTAT  REUSSI
code de sortie : 0

##### 3. Calcul a virgule et lecture d'un etat du moteur glisses dans le noyau, ecrits sans aucun mot interdit
SOURCES   conformes : ASCII partout ; dans le noyau, ni mot interdit ni litteral a virgule
RESEAU    ecoute de l'outil de compilation coupee pour ce projet
COMPILER  reussie, sans avertissement ni ecoute reseau en 5.4 s
BINAIRES  a jour : 13 objets, aucun plus ancien que ses sources
NOYAU     ECART : 4 objets compiles controles
          PdrBase.cpp.o : instructions a virgule flottante : fcvtzs (1), fmul (1), scvtf (1)
          PdrBase.cpp.o : symbole externe non admis : _GFrameCounter
TESTS     509 verifications (attendu 509), 0 echecs, 632.1 ms
BOUCLE    24000 iterations a vide en 0.124 ms
FILE      100000 commandes soumises d'avance, jouees en 1.159 ms (plafond 100 ms)
PARTIES   100 parties de 10000 iterations, 100 conformes, 100 distinctes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
RELIRE    100 fichiers relus, 100 conformes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
COMMANDE  code de sortie 0, 27.8 s demarrage du moteur compris
RESEAU    aucune ecoute hors de cette machine en 34 releves, pris pendant la compilation et l'execution
RESULTAT  ECHEC
code de sortie : 1 (1 attendu)

##### 4. Retour au code d'origine
SOURCES   conformes : ASCII partout ; dans le noyau, ni mot interdit ni litteral a virgule
RESEAU    ecoute de l'outil de compilation coupee pour ce projet
COMPILER  reussie, sans avertissement ni ecoute reseau en 5.4 s
BINAIRES  a jour : 13 objets, aucun plus ancien que ses sources
NOYAU     4 objets compiles : aucune instruction a virgule flottante, aucun appel hors memoire, chaines et assertions
TESTS     509 verifications (attendu 509), 0 echecs, 629.2 ms
BOUCLE    24000 iterations a vide en 0.111 ms
FILE      100000 commandes soumises d'avance, jouees en 1.011 ms (plafond 100 ms)
PARTIES   100 parties de 10000 iterations, 100 conformes, 100 distinctes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
RELIRE    100 fichiers relus, 100 conformes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
COMMANDE  code de sortie 0, 21.8 s demarrage du moteur compris
RESEAU    aucune ecoute hors de cette machine en 28 releves, pris pendant la compilation et l'execution
RESULTAT  REUSSI
code de sortie : 0

##### 5. Source date d'une demi-seconde apres son objet : l'outil de compilation ne le voit pas
--- sans compiler (echec attendu)
SOURCES   conformes : ASCII partout ; dans le noyau, ni mot interdit ni litteral a virgule
RESEAU    ecoute de l'outil de compilation coupee pour ce projet
BINAIRES  ECART : sources plus recents que leur objet, les tests porteraient sur l'ancien code : Source/PdrSim/Private/PdrBase.cpp
NOYAU     4 objets compiles : aucune instruction a virgule flottante, aucun appel hors memoire, chaines et assertions
TESTS     509 verifications (attendu 509), 0 echecs, 560.4 ms
BOUCLE    24000 iterations a vide en 0.108 ms
FILE      100000 commandes soumises d'avance, jouees en 1.013 ms (plafond 100 ms)
PARTIES   100 parties de 10000 iterations, 100 conformes, 100 distinctes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
RELIRE    100 fichiers relus, 100 conformes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
COMMANDE  code de sortie 0, 27.7 s demarrage du moteur compris
RESEAU    aucune ecoute hors de cette machine en 27 releves, pris pendant l'execution
RESULTAT  ECHEC
code de sortie : 1 (1 attendu)
--- avec compilation (dates rafraichies, reussite attendue)
SOURCES   conformes : ASCII partout ; dans le noyau, ni mot interdit ni litteral a virgule
RESEAU    ecoute de l'outil de compilation coupee pour ce projet
COMPILER  reussie, sans avertissement ni ecoute reseau en 4.1 s
COMPILER  1 fichier(s) retouche(s) trop tot apres la compilation precedente, dates rafraichies : recompilation reussie en 4.8 s
BINAIRES  a jour : 13 objets, aucun plus ancien que ses sources
NOYAU     4 objets compiles : aucune instruction a virgule flottante, aucun appel hors memoire, chaines et assertions
TESTS     509 verifications (attendu 509), 0 echecs, 476.5 ms
BOUCLE    24000 iterations a vide en 0.085 ms
FILE      100000 commandes soumises d'avance, jouees en 0.791 ms (plafond 100 ms)
PARTIES   100 parties de 10000 iterations, 100 conformes, 100 distinctes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
RELIRE    100 fichiers relus, 100 conformes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
COMMANDE  code de sortie 0, 19.5 s demarrage du moteur compris
RESEAU    aucune ecoute hors de cette machine en 29 releves, pris pendant la compilation et l'execution
RESULTAT  REUSSI
code de sortie : 0

##### 6. Sans l'option -notracethreading : le port 1985 doit etre signale
SOURCES   conformes : ASCII partout ; dans le noyau, ni mot interdit ni litteral a virgule
RESEAU    ecoute de l'outil de compilation coupee pour ce projet
BINAIRES  a jour : 13 objets, aucun plus ancien que ses sources (un source supprime depuis la derniere compilation ne se voit pas sans compiler)
NOYAU     4 objets compiles : aucune instruction a virgule flottante, aucun appel hors memoire, chaines et assertions
TESTS     509 verifications (attendu 509), 0 echecs, 544.9 ms
BOUCLE    24000 iterations a vide en 0.109 ms
FILE      100000 commandes soumises d'avance, jouees en 0.898 ms (plafond 100 ms)
PARTIES   100 parties de 10000 iterations, 100 conformes, 100 distinctes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
RELIRE    100 fichiers relus, 100 conformes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
COMMANDE  code de sortie -2, 20.9 s demarrage du moteur compris
          le moteur a ouvert une ecoute reseau : LogTrace: Display: Control listening on port 1985
RESEAU    ECART : ecoutes ouvertes pendant la verification : UnrealEditor-Cmd TCP *:1985
RESULTAT  ECHEC
code de sortie : 1 (1 attendu)

##### Etat final
 M .gitignore
 M CONTRE-EXPERTISE.md
 M Outils/verifier.py
 M Source/PdrOutils/Private/PdrSimCommandlet.cpp
 M Source/PdrOutils/Private/PdrSimCommandlet.h
 M Source/PdrOutils/Private/PdrTests.cpp
 M Source/PdrOutils/Private/PdrTests.h
 M Source/PdrSim/PdrSim.Build.cs
 M Source/PdrSim/Public/PdrSimulation.h
?? Outils/verifier.command
?? Source/PdrOutils/Private/PdrExecuteur.cpp
?? Source/PdrOutils/Private/PdrExecuteur.h
 9:58  up 19:03, 1 user, load averages: 10.12 11.17 10.32
```

## 4. Fautes réintroduites dans le C++

Quinze fautes, une par test ajouté après la seconde relecture. Chacune est écrite dans le code, compilée, puis la suite est lancée : « VUE » signifie que la suite échoue, avec les vérifications qui échouent.

```
tete de file non remise a zero au chargement         VUE : 4 echec(s) sur 509
      limites : apres chargement, seules les commandes de la sauvegarde attendent (obtenu 1, attendu 3)
      limites : apres chargement, la simulation se reecrit a l'identique
      limites : apres chargement, la simulation suit la partie sauvegardee
      limites : apres chargement, les trois commandes ont ete jouees
plafond compte les commandes deja appliquees         VUE : 1 echec(s) sur 509
      limites : les dix places liberees servent de nouveau
file pleine dite avant tardive                       VUE : 1 echec(s) sur 509
      limites : tardive et file pleine a la fois : dite tardive
rang libre : dernier rang vu                         VUE : 1 echec(s) sur 509
      limites : rang libre : apres le plus grand rang en attente, pas apres le dernier de la file (obtenu 6, attendu 7)
rang libre : sans plafond                            VUE : 1 echec(s) sur 509
      limites : rang libre : arrete au plus grand rang possible (obtenu 0, attendu 4294967295)
nombre de commandes negatif accepte au chargement    VUE : 1 echec(s) sur 509
      sauvegarde : nombre de commandes negatif refuse
commandes egales refusees au chargement              VUE : 2 echec(s) sur 509
      sauvegarde : sauvegarde a deux commandes egales acceptee
      sauvegarde : sauvegarde a deux commandes egales reecrite a l'identique
      sauvegarde : sauvegarde a deux commandes egales acceptee
      sauvegarde : sauvegarde a deux commandes egales reecrite a l'identique
rang ecrit avec signe dans le texte                  VUE : 1 echec(s) sur 509
      texte de relecture : valeurs extremes d'une commande reecrites a l'identique
empreintes : ordre au sens large                     VUE : 1 echec(s) sur 509
      texte de relecture : empreinte de la meme iteration ecrite deux fois
empreintes : ordre non controle                      VUE : 2 echec(s) sur 509
      texte de relecture : empreintes des iterations 0, 2, 1 et 3 : hors d'ordre, bien que la derniere soit la finale
      texte de relecture : empreinte de la meme iteration ecrite deux fois
      texte de relecture : empreintes des iterations 0, 2, 1 et 3 : hors d'ordre, bien que la derniere soit la finale
      texte de relecture : empreinte de la meme iteration ecrite deux fois
duree maximale non controlee                         VUE : 1 echec(s) sur 509
      texte de relecture : relecture en memoire plus longue que la duree maximale refusee
condense de relecture pris dans le fichier           VUE : 1 echec(s) sur 509
      executeur : bilan : condense des empreintes recalculees, graine 2 puis graine 1 (obtenu dccffe204efda1a5, attendu a3a42db04b355912)
tri des fichiers sans egard a la casse               VUE : 1 echec(s) sur 509
      executeur : noms de parties tries par caracteres, casse comprise
chemins relatifs acceptes                            VUE : 2 echec(s) sur 509
      executeur : chemin relatif
      executeur : chemin commencant par un tilde, que le shell ne developpe pas apres un signe egal
      executeur : chemin relatif
      executeur : chemin commencant par un tilde, que le shell ne developpe pas apres un signe egal
option sans son action acceptee                      VUE : 6 echec(s) sur 509
      executeur : condense attendu sans relecture
      executeur : dossier sans relectures
      executeur : escouades sans boucle ni charge
      executeur : commandes sans charge
```

## 5. Projet compilé sans optimisation

Même code, compilé dans la configuration DebugGame du moteur : le condensé des cent parties est le même, en mémoire comme à la relecture des fichiers.

```
##### Projet compile sans optimisation (configuration DebugGame), memes cent parties
compilation : code de sortie 0, 9 fichiers compiles, 0 avertissement ou erreur
execution : code de sortie 0
PDR_VERSION format=1 iterations_par_seconde=20
PDR_TESTS verifications=509 echecs=0 duree_ms=1274.8
PDR_BOUCLE iterations=24000 escouades=0 en_mouvement=0 duree_ms=0.480 us_par_iteration=0.020 empreinte=b579d3c3e1c6a0d7
PDR_FILE commandes=100000 soumission_ms=16.167 avance_ms=4.855 us_par_iteration=0.049
PDR_RELECTURES parties=100 iterations=10000 conformes=100 distinctes=100 commandes=337010 condense=9565f56e1f910d8d duree_ms=16259.3
PDR_RELIRE fichiers=100 conformes=100 condense=9565f56e1f910d8d duree_ms=7180.6
PDR_RESULTAT REUSSI
```

## 6. Mesures du matin, machine plus calme

Relevées le 12 novembre 2026 entre 7 h 36 et 7 h 45 par une version antérieure du script, sur le code d'avant la seconde relecture (420 vérifications).

Cinq séries de mesures :

```
SOURCES   conformes
RESEAU    ecoute de l'outil de compilation coupee pour ce projet
COMPILER  reussie, sans avertissement ni ecoute reseau en 2.0 s
TESTS     420 verifications, 0 echecs, 231.5 ms
BOUCLE    24000 iterations a vide en 0.057 ms
RELIRE    100 parties de 10000 iterations, 100 conformes, 100 distinctes, condense 9565f56e1f910d8d (attendu 9565f56e1f910d8d)
COMMANDE  code de sortie 0, 12.4 s demarrage du moteur compris
MESURE    commande complete, en secondes : minimum 10.859, mediane 11.022, sur 5
MESURE    suite de tests, en ms : minimum 221.200, mediane 223.200, sur 5
MESURE    24 000 iterations a vide, en ms : minimum 0.059, mediane 0.059, sur 5
MESURE    regime charge, en microsecondes par iteration : minimum 55.340, mediane 55.540, sur 5
MESURE    regime charge, en pour cent du budget : minimum 22.100, mediane 22.200, sur 5
MESURE    file longue, avance en ms : minimum 0.475, mediane 0.493, sur 5
MESURE    cent parties jouees et rejouees, en ms : minimum 1676.200, mediane 1691.400, sur 5
MESURE    24 000 iterations, 48 escouades en marche, en ms : minimum 23.973, mediane 24.199, sur 5
MESURE    24 000 iterations, 200 escouades en marche, en ms : minimum 99.265, mediane 100.588, sur 5
MESURE    24 000 iterations, 4096 escouades en marche, en ms : minimum 2039.628, mediane 2049.754, sur 5
RESEAU    aucune ecoute hors de cette machine pendant la verification
RESULTAT  REUSSI
python3 -B Outils/verifier.py --mesure  279.45s user 37.32s system 139% cpu 3:47.06 total
code=0
```

Recompilation seule après retouche d'un fichier, avec deux secondes de pause entre la compilation et la retouche suivante :

```
sans changement                                                code=0 duree=  2.3 s compilations=0 liens=0 alertes=0
PdrSimulation.cpp retouche 1                                   code=0 duree=  2.6 s compilations=1 liens=1 alertes=0
PdrSimulation.cpp retouche 2                                   code=0 duree=  2.4 s compilations=1 liens=1 alertes=0
PdrSimulation.cpp retouche 3                                   code=0 duree=  2.7 s compilations=1 liens=1 alertes=0
PdrSimulation.cpp retouche 4                                   code=0 duree=  2.5 s compilations=1 liens=1 alertes=0
PdrSimulation.cpp retouche 5                                   code=0 duree=  2.3 s compilations=1 liens=1 alertes=0
PdrSimulation.cpp restaure                                     code=0 duree=  2.5 s compilations=1 liens=1 alertes=0
PdrSimulation.h retouche 1                                     code=0 duree=  6.0 s compilations=4 liens=2 alertes=0
PdrSimulation.h retouche 2                                     code=0 duree=  5.2 s compilations=4 liens=2 alertes=0
PdrSimulation.h retouche 3                                     code=0 duree=  5.1 s compilations=4 liens=2 alertes=0
PdrSimulation.h retouche 4                                     code=0 duree=  5.5 s compilations=4 liens=2 alertes=0
PdrSimulation.h retouche 5                                     code=0 duree=  6.1 s compilations=4 liens=2 alertes=0
PdrSimulation.h restaure                                       code=0 duree=  6.2 s compilations=4 liens=2 alertes=0
PdrTests.cpp retouche 1                                        code=0 duree=  5.8 s compilations=1 liens=1 alertes=0
PdrTests.cpp retouche 2                                        code=0 duree=  5.8 s compilations=1 liens=1 alertes=0
PdrTests.cpp retouche 3                                        code=0 duree=  5.9 s compilations=1 liens=1 alertes=0
PdrTests.cpp retouche 4                                        code=0 duree=  5.9 s compilations=1 liens=1 alertes=0
PdrTests.cpp retouche 5                                        code=0 duree=  6.1 s compilations=1 liens=1 alertes=0
PdrTests.cpp restaure                                          code=0 duree=  6.3 s compilations=1 liens=1 alertes=0
sans changement, a la fin                                      code=0 duree=  2.7 s compilations=0 liens=0 alertes=0
etat git des sources : 0 fichier(s) modifie(s)
```
