# Relecture adverse de la version 1

Trois relecteurs indépendants ont attaqué la première version de `CONTRE-EXPERTISE.md` le 11 novembre 2026. Leurs 36 constats sont reproduits ici tels quels ; la version 2 les intègre. Les renvois de section visent la version 1.

## Cohérence interne et respect de la demande

Les dix rubriques, les sept questions et l'essentiel de l'arithmétique (4.2, 4.3, tableau 6.1) sont exacts. Le brouillon n'est pas encore un cahier des charges : R1 contient le bonus de voisinage que quatre autres passages disent supprimé, plusieurs règles se contredisent d'une section à l'autre, et la partie exemple ne respecte ni V2 ni l'économie E4.  
Douze constats : un bloquant, dix majeurs, un mineur.

### 1. [bloquant] 4.1, R1 (puce « Récupération ») et R2 (puce « second rang » et phrase finale) ; contre 4.5, 5.2 signature point 2, 6.4 ligne Bastion, section 3 ligne « Supprimer : auras »

**Problème.** R1 donne une récupération de cohésion par escouade amie adjacente. C'est le bonus de voisinage que le document dit avoir supprimé, et il rend fausse la phrase « la troisième escouade n'ajoute rien ».

**Preuve.** R1 : « au contact, +1,5 par seconde et par escouade amie adjacente non rompue, deux au plus ». R2 : « Elles appuient (récupération de R1) ». En face : 4.5 « aucune aura » ; 5.2 « Aucun bonus entre voisines » ; 6.4 « la troisième escouade n'ajoute rien ; aucun bonus entre voisines ». Calcul avec deux voisines (+3/s) : un Cortège sur des Piquets ancrés presse 4,0 × 0,6 = 2,4/s, moins que la récupération, donc jamais de rupture (41,7 s au tableau 6.1). Une Patrouille sur des Piquets ancrés : 3,6 − 3 = 0,6/s, soit 167 s au lieu de 27,8 s. L'empilement est donc la meilleure défense.

**Correction proposée.** R1 : « Récupération : +8 par seconde après 3 s sans pression ; aucune récupération sous pression. » R2 : « Les escouades du second rang ne pressent pas ; elles relèvent : échange de place avec l'escouade de devant en 1,5 s. » Phrase finale de R2 et 6.4 : « dans une rue, la troisième escouade n'ajoute aucune pression ; elle ne sert qu'à relever ».

### 2. [majeur] Section 7, lignes 0:50, 3:30 à 3:42, 5:00, 6:20 à 6:50, 8:00, 8:30, 10:00

**Problème.** Les scores de la partie exemple supposent un changement de propriétaire instantané, contraire à V2. Deux minutages sont impossibles avec les vitesses et l'économie du document.

**Preuve.** Scores. 45 = 0,5 × 90 s (2:00 à 3:30), mais si le Bastion prend le Nord à 3:30, il l'a neutralisé à 3:20 au plus tard (V2), donc 40. 139 = 45 + 0,5 × 188 s et 38 = 3 + 0,5 × 70 s : le Centre rapporte à la Convergence jusqu'à 6:50 et au Bastion dès 6:50, sans phase neutre ; V2 donne 129 à 38. 68 = 38 + 30 : le Bastion marque jusqu'à 8:30 alors que le Centre est neutralisé au moins 6,7 s avant ; V2 donne 61. 229 devient 219.  
Sud à 0:50. À 0:28 le Cortège a fait 95 m vers le Centre (3,4 m/s). Le Sud est à 87 m en ligne droite, donc arrivée à 0:54 et prise à 1:00 au plus tôt (1:09 par les rues).  
Charpente à 5:00. Le Bastion n'a pas d'expansion à 0:50. Avec 300 Moyens, 40 s de chantier et 40 Équipement par minute au plus, les 100 du palier 2 arrivent vers 4:35, le palier finit à 5:15, et les 50 de la branche vers 5:50. Deux Pavois de plus à 6:20 font 210 Équipement, atteints vers 7:20.

**Correction proposée.** « 1:00. Nord et Sud à la Convergence… » ; 3:42 « Score : 40 à 3 » ; 6:50 « Le Centre, neutralisé à 6:40, est pris à 6:50. Score : 129 à 3 » ; 8:00 « Score : 129 à 38 » ; 8:30 « Score : 129 à 61 » ; 10:00 « Score : 219 à 61 ». Décaler « 5:00 — reconnaissance » à 5:50 et le retour du Bastion avec deux Pavois à 7:20 au plus tôt, puis recalculer les scores suivants avec la même règle.

### 3. [majeur] 4.3, E4 et E5, et paragraphe « Rendements » ; contre 4.4, puce « Installation asymétrique » ; section 7, ligne 1:10

**Problème.** Le coût, la durée et le délai de fermeture d'une expansion sont fixés deux fois avec des valeurs différentes. Le délai de retour annoncé ne vaut que pour une faction.

**Preuve.** E4 : « 250 Moyens, 30 s ». E5 : « occupée 20 s sans défenseur est fermée ». 4.4 : Convergence 200 Moyens, 20 s, fermée en 12 s ; Bastion 300, 40 s, 30 s ; Préfecture 250, 30 s, 20 s. « 500 Moyens… 2:56 » = (250 + 5 × 50) ÷ 170 par minute, exact pour la seule Préfecture. Convergence : 450, soit 2:39. Bastion : 550, soit 3:14. L'exemple pèse à 1:10 une expansion contre « 250 Moyens en caisse », alors que celle de la Convergence coûte 200.

**Correction proposée.** E4 : « …250 Moyens, 30 s (valeur médiane ; coût, durée et délai de fermeture varient par faction, voir 4.4)… ». E5 : « Une expansion occupée sans défenseur pendant le délai de sa faction (12, 20 ou 30 s) est fermée ». Rendements : « Une expansion coûte de 450 à 550 Moyens avec ses cinq équipes et se rembourse en 2:39 à 3:14 selon la faction ». Section 7, 1:10 : « L'expansion (200 Moyens)… ».

### 4. [majeur] 5.1, signature point 1 contre ligne « Branches » ; 5.3, signature point 1 contre ligne « Branches » ; 6.5, ligne « Relais »

**Problème.** Le quatrième relais et le second PC sont donnés une fois par le palier 2 et une fois par une branche. Un développeur ne sait pas quelle condition coder.

**Preuve.** 5.1 : « Trois relais au palier 1, quatre au palier 2 », puis « Kiosque (Fanfare, quatrième relais) ». 5.3 : « Un PC au palier 1, deux au palier 2 », puis « Intervention (Groupe d'intervention, second PC mobile) ». Si le palier suffit, ces deux branches n'apportent qu'une unité. Si la branche est requise, 6.4 (« un réseau complet immobilise 12 points ») et 6.5 (« 3 puis 4 ») ne valent que pour la branche Kiosque. Rien ne dit non plus si le Camion-sono, « relais roulant », compte dans le plafond.

**Correction proposée.** 5.1 : « Trois relais ; un quatrième avec la branche Kiosque. Le Camion-sono ne compte pas dans ce plafond. » 5.3 : « Un PC mobile ; un second avec la branche Intervention. » 6.5 : « 75, 3 (4 avec Kiosque), 3 ».

### 5. [majeur] Tableaux chiffrés 5.1 à 5.3 ; 4.4, puce « Deux paliers » ; R2 (Protégé) avec 5.1 (Chaîne) et 5.2 (ancrage, Mur) ; R4 et E5 (« escouade de combat »)

**Problème.** Trois trous empêchent de coder la production et le combat : aucune durée de production d'unité ni de construction de branche, aucune règle de cumul des réductions de pression, et « escouade de combat » jamais définie.

**Preuve.** Production. Les tableaux donnent palier, coût, population, effectif, pression, vitesse, mais aucune durée. 4.4 chiffre le palier (40 s), pas les branches, et ne dit pas d'où sortent les unités de palier 2. L'exemple en dépend : les Vigies commandées à 0:00 voient les Piquets à 0:28, ce qui exige 140 m à 6,5 m/s (21,6 s), donc une production de 6,4 s au plus.  
Cumul. Pavois ancrés pressés de face : × 0,5 × 0,6 = × 0,3, ou 1 − 0,5 − 0,4 = × 0,1 ? Jets : le Mur à −70 % s'ajoute-t-il ou remplace-t-il l'ancrage (× 0,09 ou × 0,15) ?  
Définition. R4 et E5 réservent capture et désordre à l'« escouade de combat ». Les Vigies ont pour rôle « Voir », les Lévriers « Voir, capturer », les Motards « déranger les dépôts ». Rien ne dit si une Vigie à 50 Moyens capture, gèle une capture ou coupe un dépôt.

**Correction proposée.** Sous les tableaux : « Durée de production ★ : 6 s pour un éclaireur, 15 s au palier 1, 25 s au palier 2, 35 s pour un véhicule ; branche : 30 s. Les unités de palier 2 sortent du bâtiment de leur branche. » R2 : « Les multiplicateurs de pression se multiplient entre eux (Pavois ancrés, contact de face : × 0,3). Pour les jets, le Mur remplace la réduction d'ancrage (× 0,15) ★. » R4 : « Escouade de combat : toute escouade qui occupe de la population, éclaireurs compris ; ni équipe logistique ni véhicule. »

### 6. [majeur] 5.3, ligne « PC mobile » du tableau chiffré et signature point 1 ; R2 (Véhicule) ; R4 ; 5.4, phrase d'en-tête et lignes « Ligne protégée », « Position défensive », « Véhicules » ; 6.3, miroir Préfecture

**Problème.** Aucune règle ne dit comment un secteur tombe. Le contre annoncé « raid de Furets » est impossible selon R2. « Aucune ne dépend d'un troisième palier » esquive la règle de votre section 10, puisque la V1 n'a que deux paliers.

**Preuve.** R2 : structure « entamée seulement par les outils (Démontage, Enfoncement, Percée) », tous de palier 2. Le PC est de palier 1 et « contré par… raid de Furets », qui n'ont aucun outil. R4 dit que les soutiens avancés s'occupent : le relais a sa durée (10 s), le cantonnement aussi (20 s), le PC n'en a pas. 6.3 fait du PC « la cible décisive » du miroir, où le seul outil est le Groupe d'intervention (palier 2, une branche sur deux).  
5.4 : cinq cases n'ont qu'une réponse de palier 2, le dernier de la V1 (4.4). Bastion : ligne protégée, position défensive, véhicules. Préfecture : position défensive, véhicules. Le document d'origine, section 10 : « aucune réponse indispensable ne doit dépendre exclusivement du dernier palier ». Plusieurs réponses notées (1) coûtent en outre de l'Équipement (Furets 110/20, Pavois 120/30, Motards 70/10), qui n'existe qu'après une expansion (E4).

**Correction proposée.** 5.3, point 1 : « …Un PC déployé s'occupe comme tout soutien avancé (R4) : 15 s ★ d'occupation sans défenseur le replient de force et ferment son secteur. » Tableau : « Contrée par : Démonteurs, Béliers ; occupation par un raid de Furets ». 5.4, en-tête : « Palier de la première réponse disponible. La V1 n'ayant que deux paliers, cinq cases ne sont couvertes qu'au dernier : écart à votre section 10, à lever avant B2. Les réponses de palier 1 qui coûtent de l'Équipement supposent une expansion. »

### 7. [majeur] 2.3, « Correction » ; 5.3, « Premier geste » et « Départ » ; 5.2, « Premier geste » ; « Réponses directes », troisième question

**Problème.** La promesse « chaque camp fait un geste propre avant 0:30 » n'est tenue que par la Convergence.

**Preuve.** Préfecture. « Départ : 1 Patrouille, 1 Motards », sans PC. Le PC coûte 150 Moyens, soit toute la caisse de départ (E1), plus une production non chiffrée et 12 s de déploiement. Avant cela, son seul geste est d'envoyer un éclaireur, ce que font aussi la Convergence (Vigies commandées à 0:00 dans l'exemple) et le Bastion (Lévriers). La Convergence, elle, reçoit son premier relais « gratuit et disponible à 0:00 ».  
Bastion. L'ancrage a lieu à l'arrivée sur l'objectif : 130 m à 3,2 m/s = 41 s, plus 3 s d'ancrage, donc vers 0:45.

**Correction proposée.** 5.3 : « Départ : 1 Patrouille, 1 Motards, 1 PC mobile replié au QG (pendant du relais gratuit) ★. » 2.3 et Réponses directes : « Chaque camp fait un geste propre dans la première minute : relais posé dès 0:00, PC envoyé dès 0:00, ancrage à l'arrivée sur l'objectif vers 0:45. »

### 8. [majeur] 2.1, « Constat », dernière phrase ; 4.3, phrase « Alerte » du paragraphe « Rendements »

**Problème.** Le document fixe une alerte à 7:00 pour le plafond de population, alors que son propre calcul le donne à 5:30. La critique 2.1 reproche en outre au document d'origine un chiffre tiré des rendements du brouillon.

**Preuve.** 2.1 : « Avec les rendements que je propose plus bas, le plafond d'armée est atteignable vers 5:30 ». 4.3 : « si le plafond de population tombe avant 7:00… baisser le rendement ». Recalcul avec 150 Moyens de départ, 180 par minute, tout en escouades de palier 1, hors durée de production : Bastion, 10 Piquets et 1 Lévriers = 1 060 Moyens, soit 5:03 ; Convergence, 13 Cortèges après le relais gratuit = 1 040, soit 4:57 ; Préfecture, 11 Patrouilles = 1 210, soit 5:53. L'alerte est donc déclenchée sur le papier. Le document d'origine ne donne aucun rendement : 5:30 décrit l'économie du brouillon, pas la sienne.

**Correction proposée.** 2.1 : « …dimensionnée pour bien plus d'unités : même avec les rendements réduits de la section 4.3, le plafond reste atteignable vers 5:00 à 6:00. » 4.3 : « Alerte déjà levée sur le papier : en misant tout sur les escouades de palier 1, le plafond tombe entre 4:57 et 5:53, avant le seuil de 7:00. Première valeur à essayer ★ : le bas de la plage de 6.5, 20 Moyens par minute et par équipe, plutôt qu'un système de plus. »

### 9. [majeur] 4.5, dernier paragraphe ; contre section 9, lignes B1 et B2 du tableau et point 11 du backlog ; section 10, « Règles »

**Problème.** L'ordre d'entrée des mécaniques de faction est donné trois fois, de trois façons. La règle de retrait d'une signature contredit une contrainte fixée et un critère de B2.

**Preuve.** 4.5 : « cohésion au prototype, une mécanique de faction en B1, les deux autres en B2 ». Section 9, B1 : « Deux factions… une signature chacune », soit deux mécaniques en B1 et une en B2. Section 10 : « R1 à R5, ancrage et poussée », et backlog 11 « ancrage et poussée » : la signature du Bastion (5.2, points 1 et 3) entre dès A3. B1 ne nomme pas ses deux factions.  
4.5 : « Celle que l'IA ne sait pas jouer… est retirée ». Le document d'origine, section 2, fixe des « factions asymétriques », et B2 exige « six affrontements jouables contre l'IA ».

**Correction proposée.** 4.5 : « Les mécaniques entrent par étapes : cohésion et postures du Bastion au prototype (A3), relais en B1, secteurs en B2. Une signature que l'IA ne sait pas jouer à la fin de B2 est simplifiée, pas retirée : l'asymétrie des trois camps est une contrainte fixée. » Section 9, B1 : « Convergence et Bastion, quatre unités chacune… ».

### 10. [majeur] Section 9, ligne C du tableau et « Backlog ordonné de A1 à A3 » ; section 3 (aucune ligne) ; 4.3, E4

**Problème.** Deux exigences de la demande ne sont pas traitées. Le plan ne livre nulle part la présentation animée ni le HUD (contrainte fixe). Les trois plans viables par faction ne sont ni tenus ni arbitrés. Le backlog ne couvre que le prototype.

**Preuve.** Document d'origine, section 2 : « Une présentation soignée, animée et lisible, avec une interface de jeu intégrée ». Livrables de C : unités, paliers, cartes, IA, tutoriel, réglages, accessibilité, son, récit, exécutables. Aucun personnage, aucune animation, aucun HUD, aucun critère de lisibilité. Le seul élément 3D du plan est l'« Essai 3D : une escouade » de B2, alors que 8.8 chiffre environ 160 clips.  
Document d'origine, section 10 : « trois plans viables par faction : pression initiale, développement économique, progression technologique ». Le brouillon n'en parle pas. E4 (« L'Équipement n'existe qu'aux expansions ») fond la technologie dans l'expansion, donc deux plans au plus.  
Rubrique 9 : backlog demandé pour « le prototype, la tranche jouable et la V1 » ; il s'arrête à A3.

**Correction proposée.** Ligne C, livrables : « …personnages et animations 3D définitifs des 18 unités, décors des cartes, HUD intégré complet… ». Critères : « …les dix testeurs distinguent chaque unité à sa silhouette, sans la couleur ». Section 3, « Modifier » : « Trois plans par faction | Deux en V1 : pression de palier 1, ou expansion puis palier ; E4 lie la technologie à l'expansion. Écart assumé à votre section 10. » Sous le backlog : « Les backlogs de B1, B2 et C sont rédigés à la clôture de l'étape précédente ; seuls leurs livrables et critères sont fixés ici. »

### 11. [majeur] 5.5 ; section 3, ligne « Plafond de 12 escouades » ; 8.3, puce « Performance » et puce « Outillage d'animation »

**Problème.** Les effectifs « environ 90, 55 et 30 » ne se retrouvent pas à partir des populations. « Sans changer la charge de contrôle » est faux. Le budget d'affichage est donné par camp à un endroit et au total à un autre.

**Preuve.** 50 points de population. Cortège 3 points et 8 têtes : 16 escouades, 128 personnages (96 avec quatre relais). Piquets 4 points et 6 têtes : 12 escouades, 72. Patrouille 4 points et 3 têtes : 12 escouades, 36. Compagnie 6 points et 4 têtes : 8 escouades, 32. Les chiffres 90, 55 et 30 supposent une composition mixte que le texte ne donne pas. Le nombre d'escouades va de 8 à 16 selon le camp (50 pour des Vigies à 1 point), donc ni la charge de contrôle ni le « plafond de 12 escouades » ne sont conservés. 5.5 parle d'« une centaine de personnages par camp », 8.3 d'« une centaine de personnages animés » en tout ; le miroir Convergence en affiche 180 à 256.

**Correction proposée.** 5.5 : « À population pleine, de 32 personnages (huit Compagnies) à 128 (seize Cortèges) ; environ 90, 55 et 30 pour une composition mixte. Le nombre d'escouades varie aussi, de 8 à 16 : la charge de contrôle est à mesurer par camp. Budget d'affichage à mesurer dès le prototype : 130 personnages par camp, 260 dans le miroir Convergence. » 8.3 : remplacer « une centaine de personnages » par « jusqu'à 260 personnages » aux deux puces.

### 12. [mineur] 5.3, signature point 3 et phrase « Elle ne convertit… » ; 6.4, ligne Bastion ; 6.2 (« ne marque rien ») ; Réponses directes, questions 1 et 5 ; 5.2, « Premier geste » ; 10, « Règle d'arrêt » ; 4.5, première phrase

**Problème.** Sept affirmations sont écrites comme des acquis alors qu'une règle ou un tableau du document les contredit, ou que rien ne les étaie.

**Preuve.** (a) « les capacités de la Préfecture sont les plus fortes du jeu » : Salve 35 de pression ; l'Enfoncement du Bastion fait 40 et retire ancrage et protection 5 s.  
(b) « Elle ne convertit une rupture en perte que par l'Interpellation » : R1 retire un membre à toute rupture, puis un toutes les 3 s au contact, pour tous les camps.  
(c) « une masse unique tient un objectif et marque zéro », « ne marque rien », « un score qui exige deux objectifs » : V3 donne (1 − 0) × taux dès que l'adversaire n'en tient aucun.  
(d) « un barème qui garde la partie ouverte jusqu'à la quatorzième minute » : 4.2 calcule des fins à 8:20 et 10:00.  
(e) « ancrés, ses Piquets sont la meilleure tenue du début de partie » et (f) « le cœur du jeu est prouvé » (huit testeurs, deux camps sur trois, sans économie) : résultats d'équilibre ou de test énoncés à l'indicatif.  
(g) « Six règles communes » : le document en numérote 19 (R1 à R6, V1 à V6, E1 à E7), plus neuf de faction, contre les « environ 22 » reprochées en 2.9.

**Correction proposée.** (a) « …sont voulues parmi les plus fortes et sont les plus annoncées ». (b) « Elle n'ajoute de perte à une rupture que par l'Interpellation ». (c) « une masse unique ne tient qu'un objectif : elle ne marque que si l'adversaire n'en tient aucun » ; question 5 : « un score qui exige d'en tenir plus que l'adversaire ». (d) « …ouverte jusqu'à la quatorzième minute tant que l'écart reste d'un objectif ». (e) « ses Piquets doivent être la meilleure tenue du début de partie ★ ». (f) « le combat de rue est validé à cette échelle ; économie, relais et secteurs restent à éprouver ». (g) « Six règles de combat communes, six de victoire, sept d'économie, trois par faction… ».

### Contrôlé et trouvé exact

- Rubriques 1 à 10 de la section 15 présentes et dans l'ordre ; les sept questions ont chacune une réponse dédiée.
- 2.7, barème d'origine : 6:10, 10:20 et 18:39 retrouvés (500 points à 2/s, à 1/s, 999 points à 1/s, après 2:00).
- 4.2, durées d'après V3 et V4 : 8:20, 10:00, 14:30 et 19:30 retrouvés ; 180 points au plus de 2:00 à 8:00 à un objectif d'écart.
- 4.3, rendements : 180, 240, 420 Moyens et 80 Équipement par minute retrouvés ; 500 Moyens et 2:56 exacts pour une expansion à 250 Moyens.
- Tableau 6.1 : les onze durées retrouvées (25 / 41,7 ; 20 ; 16,7 / 27,8 ; 20 ; 12,5 ; 25 ; 9,8 ; 12,1 / 36,4) ; rapport 25 ÷ 9,8 = 2,56.
- Section 7 : « une quinzaine de secondes » à 3:05 (100 ÷ (10 × 0,7) = 14,3 s) ; +0,5 point par seconde à 2:00 ; 120 points par minute après 14:00.
- Carte de référence : 130 m en 40 s et 80 m en 25 s cohérents avec les vitesses de 3,2 à 3,4 m/s.
- 6.4 : quatre relais à 3 points = 12 points sur 50 ; 6.5 reprend sans écart les valeurs de R1, R2, R5, V3, V4, E2, E6 et des signatures.
- Décompte des unités : six « oui » et deux « après V1 » par faction, soit 18 en V1 et 6 reportées ; quatre véhicules en V1 comme annoncé en 8.8.
- 2.5 : une escouade sur douze = 8 % ; 2.10 : l'essai réseau exigé à la section 13 d'origine est bien absent des étapes A à D d'origine.
- Renvois de sources : tous les repères cités (U1 à U11, G1 à G11, Y2 à Y4, T1 à T7) existent dans la liste finale ; le contenu des pages n'a pas été contrôlé (hors de mon angle).
- Annexes : le dossier contient bien le document d'origine, quatre critiques, deux rapports de faits avec leur version vérifiée et trois propositions libres.
- Mentions de phase de conception : en-tête, 6.1, 6.5 et section 7 disent explicitement que rien n'est implémenté ni démontré ; aucune fonctionnalité n'est décrite comme existante.

## Équilibrage, stratégies dominantes et abus de règles

Le brouillon ne tient pas « sur le papier » : le désordre (E5), la récupération au contact (R1) et la reconstitution (R3) donnent chacun une stratégie dominante ou annulent une condition de victoire, et le tableau 6.1 est calculé sans la récupération de R1.  
Deux des trois bornes de 6.4 cèdent (Bastion par l'appui entre voisines, Convergence par le repli « traverse tout ») ; la Préfecture est structurellement pénalisée (membre perdu par rupture, PC payant, Équipement).  
Les douze corrections sont des retouches de phrases et de chiffres, sans règle nouvelle.

### 1. [bloquant] 4.3, règle E5 (Désordre) ; 6.2, « Abus possible » Furets et Motards

**Problème.** Le désordre n'exige ni contact ni absence de défenseur. Une escouade rapide à moins de 15 m coupe le revenu sans jamais s'engager, et aucune unité de palier 1 ne peut la rattraper ni la faire rompre. C'est la « contestation au rabais » que 2.7 reproche au document d'origine, déplacée du score vers l'économie. C'est l'ouverture dominante des trois camps, et jouée des deux côtés elle gèle la partie.

**Preuve.** E5 : « Une place ne rapporte rien tant qu'une escouade de combat ennemie se trouve à moins de 15 m, et pendant 10 s après. » Motards : 70/10, 2 pop, 8 m/s, rôle écrit « déranger les dépôts ». Vigies : 50 Moyens, 1 pop, 6,5 m/s. Toute pression de palier 1 est de contact, sauf la Salve (annoncée 1,5 s, soit 12 m parcourus par des Motards). L'infanterie va de 2,6 à 4,2 m/s. Les Lévriers (6,0) sont plus lents que les Vigies (6,5) et il leur faudrait 67 s de contact à 1,5 de pression. Un passage toutes les 10 s suffit : au QG, 6 places × 30 = 180 Moyens/min coupés, soit 2,5 fois le prix des Motards par minute ; à une expansion, 90 Moyens et 40 Équipement. Les réponses de 6.2 (Pavois ancrés à 2,6 m/s, barricades, Frondeurs au palier 2) ne délogent pas une unité « qui n'engage jamais ». Si les deux camps le font : 60 Moyens/min chacun, plus d'Équipement, donc ni Furets, ni Pavois, ni Compagnie, ni palier 2.

**Correction proposée.** E5 : « Une place ne rapporte rien tant qu'une escouade de combat ennemie non rompue se trouve à moins de 15 m sans escouade de combat amie non rompue dans ce même rayon, et pendant 10 s après. » (suite inchangée). Définir une fois, en R4 : « escouade de combat : toute escouade, éclaireurs compris ; ni équipe logistique ni véhicule ». En 6.2, remplacer « Pavois ancrés (palier 1), barricades, Frondeurs (palier 2) » par « une escouade de garde par dépôt (palier 1) : le raid doit la faire rompre ».

### 2. [bloquant] 4.1, R1 (« au contact, +1,5 par seconde et par escouade amie adjacente ») et R2 (« Elles appuient ») ; 5.2 Postures point 2 ; 6.1 ; 6.4 ligne Bastion

**Problème.** La récupération au contact est une aura entre voisines, alors que 4.5 dit « aucune aura » et que 5.2 et 6.4 disent « aucun bonus entre voisines ». Elle rend une ligne ancrée ou en Chaîne, flanquée de deux amies, imprenable de face au palier 1. Tout le tableau 6.1 est calculé sans elle. La borne 6.4 « la troisième escouade n'ajoute rien » est fausse d'après R2.

**Preuve.** Piquets ancrés avec deux voisines (+3/s) : Piquets adverses 5 × 0,6 = 3,0, net 0, jamais rompus. Cortège 2,4 : jamais. Patrouille 3,6 − 3 = 0,6, soit 167 s (6.1 annonce 27,8 s). Furets de face 3,3 − 3, soit 333 s. Cortège en Chaîne à deux voisines sous des Piquets : 3,5 − 3 = 0,5, soit 200 s (6.1 annonce 20 s sans Chaîne). Même la paire de départ du Bastion (une voisine) : Patrouille sur Piquets ancrés 3,6 − 1,5 = 2,1, soit 47,6 s. Dans une rue à 2 de front, les escouades 3 et 4 du second rang apportent ces +3/s : l'empilement est récompensé. Sans cette aura, la relève seule suffit déjà : 15 s au front à 5/s coûtent 75, puis 12 s utiles à l'arrière en rendent 96. Or le débit de +8/s n'est pas dans la liste de réglage 6.5.

**Correction proposée.** R1 : « Récupération : +8 par seconde après 3 s sans pression ; aucune tant que l'escouade reçoit de la pression. » R2 : « Les escouades du second rang ne pressent pas. Elles relèvent : échange de place avec l'escouade de devant en 1,5 s. » 6.5, ligne à ajouter : « Récupération hors pression : délai, débit | 3 s, +8/s | 3 à 6 s, +3 à +8/s | Ruptures de face obtenues malgré la relève ».

### 3. [bloquant] 4.1, R3 (Reconstitution) ; 4.2, V5 (QG) ; 4.3, E3

**Problème.** Rien n'interdit de reconstituer sous la pression. Dans une zone de soutien, une escouade regagne ses membres plus vite que la rupture ne les lui retire. Le QG devient imprenable (V5), et tout combat dans un relais, un cantonnement ou un secteur est sans fin. C'est la « guérison permettant de nier les mauvaises décisions » que la demande d'origine exclut.

**Preuve.** R3 : 4 s par membre, sans condition de calme. Cortège : 80 × 0,6 ÷ 8 = 6 Moyens par membre. Un cycle dure au moins 14 s (6 s rompue, puis 8 s sans rupture possible). Pertes : 3 au plus (1 à la rupture, 2 au contact). Reconstitution sur 14 s : 3,5 membres. Coût : 26 à 77 Moyens/min, dont 60 sont garantis par E3 (« non réductible »). Jauge du QG : +6 s par cycle pendant la rupture, −8 s au moins ensuite (« redescend d'une seconde par seconde »). Elle ne monte jamais tant qu'un seul Cortège reste sur le parvis. La cible « 10 à 25 % des parties finies par le QG » est donc inatteignable. Le secteur (30 m, sans distance minimale à un objectif, contrairement aux 25 m du relais) permet la même chose sur un objectif. Le rayon des autres zones de soutien n'est pas chiffré.

**Correction proposée.** R3 : « Reconstitution : uniquement dans une zone de soutien, pour une escouade non rompue qui n'a reçu aucune pression depuis 3 s ; à 60 % du coût au prorata des membres manquants, 4 s par membre. Aucun soin ailleurs en V1. »

### 4. [majeur] 4.1, R3 (Repli : « traverse tout ») contre R1 (encerclement) et R2 (« les escouades ennemies se bloquent ») ; 6.4 ligne Convergence

**Problème.** Le repli traverse les lignes ennemies et les barricades. Il contredit l'encerclement « décisif » de R1 et le barrage de rue de R2. Combiné à un relais posé derrière l'adversaire, il devient un déplacement offensif. Aucune des bornes de 6.4 ne le couvre.

**Preuve.** R1 : la perte au contact « rend l'encerclement décisif ». R2 : « barrer une rue est une action ». R3 : l'escouade en repli « traverse tout, subit la moitié de la pression et ne perd qu'un membre si elle rompt en route ». Une escouade encerclée ordonne donc le repli et sort. Côté Convergence : le relais se pose sur tout emplacement marqué à plus de 25 m d'un objectif, le premier est gratuit à 0:00, et l'équipe qui le pose « n'est pas une cible » (E5). Avec un relais derrière la ligne du Bastion, la « zone de soutien amie la plus proche » est derrière l'ennemi. Les Cortèges franchissent Piquets ancrés et barricades à 3,4 × 1,3 = 4,4 m/s et ressortent dans le dos d'escouades à face fixée (flanc × 1,5), ou sur l'expansion adverse. Même manœuvre possible avec un PC mobile.

**Correction proposée.** R3 : « Repli : ordre irréversible. L'escouade court à +30 % vers la zone de soutien amie la plus proche, traverse les escouades amies, reste bloquée par les escouades ennemies non rompues et les barricades, subit la moitié de la pression et ne perd qu'un membre si elle rompt en route. »

### 5. [majeur] 4.1, R4 (barricades) et R2 (points de structure) ; 4.3, E5 (« les équipes ne sont pas des cibles ») ; 4.4, Carte

**Problème.** Une barricade à 50 Moyens, posée par une équipe invulnérable, ne peut être ouverte par aucune unité de palier 1, ni au palier 2 par un camp qui a pris l'autre branche. Avec la propriété persistante (V2), fermer les approches d'un objectif tenu le fait marquer sans garnison. Rien ne plafonne leur nombre ni n'empêche de murer une sortie adverse.

**Preuve.** R4 : 300 points de structure, « se démontent », sans dire par qui ni en combien de temps. R2 : la structure n'est entamée que par Démontage (branche Atelier), Enfoncement (Charpente) et Percée (Intervention). Ces outils sont tous au palier 2, que la partie exemple place à 4:30 plus 40 s, plus la branche. Kiosque, Stand et Parc d'engins n'en ont aucun. 4.4 : « chaque objectif a trois approches », soit 150 Moyens pour le fermer, sans limite d'emplacements. V2 : l'objectif « rapporte tant qu'il n'est pas neutralisé ». De 2:00 à environ 6:00, cela fait 120 points à un objectif d'écart, sans une escouade engagée.

**Correction proposée.** R4 : « […] ferment la voie aux escouades comme aux véhicules. Une escouade de combat non rompue au contact en démonte une en 15 s ★, sans outil ; les outils restent le moyen rapide. Deux barricades actives par camp au plus ★. » 4.4, Carte : « Au plus une des trois approches d'un objectif, et aucune sortie de QG, ne porte d'emplacement de barricade. »

### 6. [majeur] 4.1, R1 (« Elle perd un membre », « un membre toutes les 3 s ») ; 5.3 (« Elle ne convertit une rupture en perte que par l'Interpellation ») ; 6.5 ligne « Élimination à coût égal »

**Problème.** La perte fixe d'un membre par rupture, quel que soit l'effectif, est un multiplicateur caché contre le camp à petites escouades. La Préfecture paie chaque rupture 3,7 fois plus cher que la Convergence, et sa Patrouille est retirée en une seule rupture. L'Interpellation ne vaut presque rien contre un Cortège. La phrase de 5.3 est fausse d'après R1.

**Preuve.** Reconstitution par rupture (60 % × coût ÷ effectif) : Cortège 6 Moyens (−12,5 % de pression, plafond 92,5) ; Piquets 10 ; Patrouille 22 (−33 %, plafond 80) ; Motards 21 pour la moitié de l'escouade. Patrouille (3 membres) : 1 à la rupture, puis 1 à 3 s et 1 à 6 s au contact. Elle est retirée 26 s après le premier contact avec des Piquets (20 + 6). Un Cortège tient 47,7 s sous une Patrouille (16,7 + 6 + 8 + 6 + 8 + 3). La cible de 6.5 est 45 à 60 s. Interpellation sur un Cortège : 1 membre sur 8, soit 6 Moyens, pour une dotation sur deux. Enfin R1 fait perdre un membre à toute escouade rompue au contact : des Motards à 8 m/s suivent n'importe quelle escouade rompue (7,8 m/s au plus) sans dépenser de dotation.

**Correction proposée.** R1 : « Tant qu'elle est rompue et au contact d'un ennemi, elle perd un membre toutes les 3 s ★ ; cette perte au contact ne retire jamais le dernier membre, seule une nouvelle rupture le fait. » 5.3 : « Comme tout camp, elle retire un membre par rupture et au contact (R1) ; l'Interpellation en retire un de plus, à 6 m. » 6.5, ligne à ajouter : « Coût d'une rupture par camp | 6 Moyens (Cortège), 10 (Piquets), 22 (Patrouille) | écart de 1 à 2 au plus | Usure comparée des trois camps ».

### 7. [majeur] 2.1 (« plafond atteignable vers 5:30 ») contre 4.3 (« Alerte : si le plafond de population tombe avant 7:00 ») ; tableaux 5.1 à 5.3

**Problème.** L'alerte de 4.3 est déjà déclenchée par les chiffres du document lui-même. Le reproche fait à l'origine en 2.1 (« les ressources s'accumulent sans emploi ») s'applique donc à la version révisée. La plage de réglage annoncée ne suffit pas à l'éteindre. Aucun temps de production d'escouade n'est donné, donc ni 5:30 ni 7:00 ne sont calculables.

**Preuve.** Hypothèse : deux équipes à 0:00, puis tout en escouades, sans expansion. Budget escouades à l'instant t = 128 + 4 × (t − 24 s). Bastion : 10 Piquets et 1 Lévriers (1 060 Moyens, 50 pop) à 4:17. Convergence : 13 Cortèges et 2 Vigies, relais compris (1 140) à 4:37. Préfecture : 11 Patrouilles (1 210) à 4:55. Avec des équipes à 20 Moyens/min, bas de la plage de 6.5, le Bastion plafonne encore à 5:41. Ensuite 240 à 420 Moyens/min n'ont plus que la reconstitution (6 à 22 Moyens par membre) et un palier unique comme emploi.

**Correction proposée.** 4.3, remplacer la phrase d'alerte par : « Sur le papier, hors temps de production, le plafond tombe entre 4:17 (Bastion) et 4:55 (Préfecture) en misant tout sur les escouades, et à 5:41 encore avec des équipes à 20 Moyens par minute : le seuil de 7:00 est manqué avant tout test. Hypothèse de départ ★ : une file de production par lieu de sortie, 35 s par escouade de palier 1 (onze escouades : 6:25 au plus tôt) ; à mesurer en B1. » 2.1 : remplacer « vers 5:30 » par « entre 4:17 et 4:55 hors temps de production ».

### 8. [majeur] 4.1, R2 (Véhicule) ; 5.3, Signature point 1 et ligne PC mobile ; 5.4, phrase d'en-tête et ligne Véhicules

**Problème.** Le PC mobile, seul véhicule de palier 1, n'a aucun contre au palier 1 et aucune règle de chute. Le « raid de Furets » cité comme contre n'a pas d'effet défini. La case « Chaîne qui barre (1) » n'est pas une réponse. L'en-tête de 5.4 esquive l'exigence d'origine : en V1, le dernier palier est le palier 2.

**Preuve.** R2 : la structure n'est « entamée que par les outils », tous de palier 2. R4 dit que les soutiens avancés « s'occupent », mais seuls le relais (10 s) et le cantonnement (20 s) ont une durée. Le secteur n'en a pas. Rien ne dit non plus si un véhicule barre une rue. R2 encore : un véhicule « s'arrête devant toute escouade ennemie ». La Chaîne n'ajoute donc rien et ne l'entame pas. La borne 6.4 « un seul PC au palier 1 » et le miroir 6.3 (« le PC adverse est la cible décisive ») supposent un PC attaquable. Demande d'origine, section 10 : « aucune réponse indispensable ne doit dépendre exclusivement du dernier palier ». Or 5 cases sur 18 n'ont que du palier 2 : Bastion (ligne protégée, position défensive, véhicules), Préfecture (position défensive, véhicules). Trois d'entre elles tiennent à une seule branche : Charpente deux fois, Intervention une fois.

**Correction proposée.** 5.3, Signature point 1, ajouter : « Un PC déployé tombe comme un relais : occupé 15 s ★ par une escouade ennemie sans défenseur non rompu à son contact, il est retiré. Un véhicule ne barre pas la voie aux escouades. » Ligne PC mobile, « Contrée par » : « Occupation (palier 1) ; Démonteurs, Béliers ». 5.4, en-tête : « Aucune ne dépend d'un troisième palier ; cinq cases sur dix-huit n'ont de réponse qu'au palier 2, dernier palier de la V1, dont trois sur une seule branche : écart à votre règle, non résolu. » Ligne Véhicules, Convergence : « Toute escouade arrête un véhicule (R2) ; Démonteurs (2) ».

### 9. [majeur] 4.3, E1 et E4 ; 5.1, Signature point 1 (« Le premier est gratuit ») ; 5.3, « Premier geste » et « Départ » ; tableau 5.3 (Motards 70/10) ; 5.4 mentions « (1) »

**Problème.** L'asymétrie de départ joue contre la Préfecture. Sa signature hors du QG coûte toute sa caisse, alors que le relais est offert et que l'ancrage est gratuit. Elle est aussi le seul camp qui ne peut pas refaire son éclaireur sans expansion. Plus largement, les unités dites de palier 1 qui coûtent de l'Équipement sont en fait des unités « palier 1 + expansion », et les « (1) » de 5.4 le taisent.

**Preuve.** Valeur de départ, caisse comprise : Convergence 160 + 75 (relais offert) + 150 = 385 ; Bastion 200 + 150 = 350 ; Préfecture 180 + 150 = 330. Le PC coûte 150/0, soit toute la caisse. PC à 0:00 : expansion payable à 1:23, finie à 1:53, première Compagnie vers 2:53. Expansion d'abord : PC à 1:23 au plus tôt. Le « geste propre avant 0:30 » de 2.3 se réduit à envoyer des Motards. Sans Équipement, la Préfecture ne produit que Patrouille et PC. Premier Équipement possible (150 + 3 Moyens/s, deux équipes à 40/min) : Furets à 1:07, Motards à 1:18, Compagnie à 2:03, Pavois à 2:15. Une expansion fermée (12, 20 ou 30 s d'occupation) coupe ces unités. Dans 5.4, toutes les réponses « (1) » de la Préfecture sauf le redéploiement du PC, et la seule réponse « (1) » de la Convergence à la ligne protégée (Furets), en dépendent.

**Correction proposée.** 5.3 : « Le premier PC mobile coûte 75 Moyens ★ et peut être commandé à 0:00. » Tableau 5.3 : « Motards | 1 | 70 / 0 ». 5.4, sous le tableau : « (1) désigne le palier ; Furets, Pavois et Compagnie exigent en plus une expansion ouverte, soit au plus tôt 1:07, 2:15 et 2:03 sur le papier. »

### 10. [majeur] 5, « Lecture des tableaux » (« Toutes les escouades ont 100 de cohésion ») ; colonne Pop des tableaux 5.1 et 5.3 (Vigies 1, Motards 2) ; 4.3, E6

**Problème.** Avec 100 de cohésion pour toutes et des éclaireurs à 1 ou 2 points de population, les éclaireurs sont les unités les plus rentables par point de population. Or c'est la seule ressource rare une fois le plafond atteint, vers 4:17 à 5:30. Deux Motards dominent une Patrouille sur toutes les colonnes. Le plafond de 50 autorise aussi 50 escouades, contre les 12 qu'il remplace.

**Preuve.** À 4 pop : 2 Motards font 3,0 + 3,0 = 6,0 de pression, 200 de cohésion, 8 m/s, 4 dotations, 4 têtes. Une Patrouille fait 6,0 de pression, 100 de cohésion, 3,4 m/s, 2 dotations, 3 têtes. Il ne reste à la Patrouille que l'Interpellation. À 3 pop : 3 Vigies font 3,0 de pression et 300 de cohésion à 6,5 m/s, contre 4,0 et 100 pour un Cortège. Les Vigies rompent le Cortège en 33 s ; lui n'en rompt qu'une en 25 s. Tenir un lieu ne demande qu'une présence non rompue (R4, V5), donc 100 de cohésion pour 1 pop est le meilleur rapport du jeu. À 50 pop : 50 Vigies ou 25 Motards. 3 annonce pourtant « Plafond de 12 escouades : 50 points de population », 5.5 « sans changer la charge de contrôle », 8.3 « une quarantaine d'entités simulées ».

**Correction proposée.** Tableau 5.1 : « Vigies | 1 | 50 / 0 | Pop 2 ★ ». Tableau 5.3 : « Motards | 1 | 70 / 0 | Pop 3 ★ ». E6 : « Plafond de population fixe : 50 ★, soit 25 escouades au plus. Aucun bâtiment de capacité. »

### 11. [majeur] Tableau 5.1 ligne Démonteurs ; tableau 5.2 ligne Béliers ; 6.5 ligne « Efficacité d'un contre à coût égal : 1,5 à 1,8 »

**Problème.** Les deux anti-protégés perdent le duel contre l'unité qu'ils sont censés contrer. Les Démonteurs font moins bien qu'un flanc de Furets de palier 1. La cible de 6.5 n'est pas atteinte par les chiffres de la section 5. La portée du Démontage (« sa protection de face ») est ambiguë : Protégé seul, ou aussi ancrage et Mur ?

**Preuve.** Démonteurs (3,0) sur Pavois sans protection : 33,3 s. Les Pavois (4,0) les rompent en 25 s, soit un rapport de 0,75. Cortège + Démonteurs de face : 4 + 3 = 7/s, soit 14,3 s. Cortège + Furets de flanc, palier 1 : 9,8 s (chiffre de 6.1). Béliers sur Pavois : 40 + 3 × 5 + 1,5 × 20 = 85 en 25 s, instant où ils rompent eux-mêmes ; la recharge est de 30 s. Sur Compagnie : 77,5 en 20 s, ou rupture des Béliers en 6 s après deux Salves (70 + 5 × 6). Les réponses de 6.2 (colonne Pavois-Béliers, Canon à eau et Compagnies) et trois cases Bastion de 5.4 reposent sur ces unités.

**Correction proposée.** Tableau 5.1 : « Démonteurs | 2 | 100 / 60 | 4 | 4 | 6,0 au contact ★ » (duel 16,7 s contre 25 s, rapport 1,5) ; capacité : « […] la cible perd Protégé et Mur, pas la réduction d'ancrage ★ ». Tableau 5.2 : « Béliers | 2 | 110 / 60 | 4 | 4 | 6,0 au contact ★ » (40 + 30 + 3 × 10 = 100 en 15 s, rapport 1,67).

### 12. [mineur] Colonnes « Forte contre » / « Contrée par » : Vigies (5.1), Lévriers (5.2), Furets (5.1), Motards (5.3) ; 5.4 ligne « Masse légère », case Convergence

**Problème.** Quatre relations de contre annoncées sont démenties par les chiffres des mêmes tableaux. La Chaîne n'est pas une réponse à une masse légère.

**Preuve.** Lévriers « forte contre Vigies » : 6,0 m/s contre 6,5. Le Sprint (9 m/s pendant 4 s toutes les 20 s) ne gagne que 2 m par cycle. À 1,5 de pression, il faudrait 66,7 s de contact. Furets « contrée par Motards » : les Furets (5,5) rompent des Motards en 18,2 s, les Motards (3,0) rompent des Furets en 33,3 s. Furets « contrée par toute ligne prise de face » : ils rompent des Piquets en marche en 18,2 s contre 20 s, et un Cortège en 18,2 s contre 25 s. Chaîne : elle « ne presse plus ». Sous deux Cortèges elle tient 17,9 s au lieu de 12,5 s (8 × 0,7 = 5,6/s) et inflige 0 au lieu de 4/s.

**Correction proposée.** Lévriers, « Forte contre » : « Objectifs vides ». Vigies, « Contrée par » : « Motards sur chaussée ». Motards, « Forte contre » : « Vigies, Lévriers ; Furets rompus ou en repli ; dépôts ». Furets, « Contrée par » : « Lignes ancrées ou protégées prises de face ; Patrouille ». 5.4, Masse légère, Convergence : « Aucune au palier 1 hors le nombre (la Chaîne retarde, elle ne presse pas) ; Fanfare (2) ».

### Contrôlé et trouvé exact

- 6.1 : les huit durées sont arithmétiquement exactes sur les chiffres de la section 5 (25 / 41,7 ; 20 ; 16,7 / 27,8 ; 20 ; 12,5 ; 25 ; 9,8 ; 12,1 / 36,4), hors la récupération au contact omise (constat 2).
- 4.2 : les durées 8:20, 10:00, 14:30 et 19:30, et le plafond de 180 points sur les six premières minutes, sont exacts sur le barème V3-V4.
- 4.3 : les rendements 180, 240, 420 Moyens et 80 Équipement par minute sont exacts, ainsi que le remboursement en 2:56 (500 ÷ 170), valable pour le coût d'expansion de la Préfecture.
- 6.4, ligne Convergence : « un réseau complet immobilise 12 points sur 50 » est exact (4 × 3).
- 6.4, ligne police : au palier 1 le seul contrôle est la Poursuite (2 s, sur escouade rompue ou en repli) ; la borne dotations et immunité de 8 s tient, pas de verrouillage en chaîne trouvé.
- 6.1, lecture : la posture inverse bien Patrouille contre Piquets (16,7 s contre 20 s en marche, 27,8 s contre 20 s ancrés).
- Section 7 : les 250 Moyens en caisse à 1:10 sont cohérents avec E1-E3 (environ 262 après deux équipes et des Vigies).
- 5.5 : les ordres de grandeur 90, 55 et 30 personnages à population pleine sont plausibles pour des compositions mixtes (un tout-Cortège monterait à 109-133).
- Immunité de 8 s après rupture : rester au contact ne donne pas plus de temps de combat que relever (8 s sur 14 contre 20 s sur 35,5) ; pas d'abus hors la tenue de lieu des constats 3 et 6.

## Exactitude technique et sources

Les dix sources rouvertes disent bien ce que la colonne « Fait » leur fait dire ; les défauts sont dans les colonnes « Conséquence », dans trois lignes plus fortes que les rapports, et surtout dans le plan.  
Deux points bloquants : la réversibilité du moteur est contredite par le choix C# / C++, et les seuils 6.6 exigés en B1 et en C supposent des parties entre humains qu'aucune étape ne rend possibles.  
Plusieurs critères de A1 et A2 sont non mesurables ou violés par les règles R2 elles-mêmes.

### 1. [bloquant] 8.1 Décision (1er paragraphe) ; 9, ligne B2 ; 10, Règle d'arrêt ; Questions bloquantes n° 1

**Problème.** Le choix du moteur est dit réversible jusqu'à la fin de l'étape A et « n'a encore rien coûté », alors que le langage de la simulation dépend du moteur et se fixe à l'élément 2 du backlog.

**Preuve.** 8.1 : « Elle rend le choix du moteur réversible jusqu'à la fin de l'étape A, puisque le prototype s'affiche en 2D », puis « simulation en C#, affichage sous Godot » et, pour Unreal, « simulation en C++ standard ». 8.2 ligne [G11] : simulation « testée par dotnet test ». Par le texte même du brouillon, passer à Unreal après A impose de réécrire sim, ia et executeur. De plus B1 construit interface, IA et sauvegarde avant que B2 ne « confirme par écrit » le moteur, et la question bloquante n° 1 (« décide du moteur ») n'est rattachée à aucune étape.

**Correction proposée.** 8.1 : « Cette frontière garde révisable le choix du moteur d'affichage jusqu'à l'essai 3D de B2, tant que ce moteur charge une bibliothèque C# (cas de Godot .NET [G5]). Elle ne couvre pas Unreal : y passer impose de réécrire sim, ia et executeur en C++. Le choix entre C# et C++ se fait donc avant l'élément 2 du backlog, et la question bloquante n° 1 doit être tranchée avant A1. » Section 10, dernière phrase : « ... et le choix du moteur d'affichage, hors Unreal, n'a encore rien coûté. »

### 2. [bloquant] 9, lignes B1 et C (« Seuils de la section 6.6 ») ; 6.6, phrase d'en-tête et 7e puce

**Problème.** Les seuils 6.6 servent de critère d'acceptation à B1 et à C, mais ils exigent des parties entre humains que le plan ne rend jamais possibles, et l'un d'eux n'est pas mesurable.

**Preuve.** 6.6 : « Sur trente parties entre joueurs de niveau comparable, par affrontement » et « Les parties IA contre IA mesurent l'IA, pas l'équilibre ». B1 : 20 parties humaines contre une « IA scriptée », aucun réseau, trois affrontements possibles (il en faudrait 90). C : six affrontements, soit 180 parties humain contre humain, alors que le réseau n'est qu'un « essai » en B2 (dix parties) et que le multijoueur est en D. « Aucune partie au-delà de 25 » est vrai par construction (V6). « Jamais plus de 20 secondes sans décision utile » : « décision utile » n'est définie nulle part et « jamais » est intenable sur 180 parties.

**Correction proposée.** B1 : « Seuils de la section 6.6 relevés à titre indicatif sur ces 20 parties contre l'IA ; ils ne valident aucun équilibre. » C, livrables : ajouter « lien réseau de l'essai B2 conservé comme outil de test interne (connexion directe, sans service) » ; critère : « Seuils de la section 6.6 tenus sur trente parties humain contre humain par affrontement, jouées par ce lien. » 6.6, 7e puce : « moins de 5 % du temps de jeu après 1:00 passé dans des intervalles de plus de 20 s sans commande émise ». Supprimer « aucune partie au-delà de 25 ».

### 3. [majeur] 9, ligne A2 (scénarios et critères) ; règle R2

**Problème.** Deux critères de A2 sont violés par les règles R2 elles-mêmes, et « le théorique » n'est pas défini.

**Preuve.** Critère : « aucune escouade immobile plus de 3 s avec un ordre non satisfait ». Or R2 : « Un passage se traverse à une escouade à la fois » ; dans le scénario « file de six escouades dans un passage », la sixième attend cinq traversées (4 s chacune pour le Passe-cour des Furets, soit une vingtaine de secondes). R2 : « Les escouades ennemies se bloquent » ; le « croisement frontal quatre contre quatre en rue » est un blocage voulu s'il oppose deux camps (et le combat n'arrive qu'à l'élément 8 du backlog, après les scénarios à l'élément 7), ou une traversée sans obstacle s'il s'agit d'alliés (« les escouades amies en mouvement se traversent »). Une barricade posée sans autre chemin rend aussi l'ordre insatisfiable.

**Correction proposée.** Scénarios : « croisement frontal de deux colonnes alliées de quatre escouades en rue ; face-à-face de deux colonnes ennemies en rue (blocage attendu) ». Critères : « aucune escouade immobile plus de 3 s avec un ordre non satisfait, hors attente en file devant un passage et hors blocage voulu par R2 (escouade ennemie, barricade sans autre chemin), lesquels émettent un événement en attente ou bloqué en 2 itérations au plus ; temps de franchissement inférieur ou égal à 1,5 fois le temps de référence, défini comme la longueur du plus court chemin divisée par la vitesse, plus, en file, le temps de traversée des escouades qui précèdent ».

### 4. [majeur] 8.5, « Hypothèses de départ » ; règle R2, 2e puce ; 4.4 Lisibilité ; 6.4 ligne Bastion

**Problème.** La grille retenue ne produit pas les capacités de rue de R2 : rien ne relie « 2 escouades de front » à un nombre de cellules, et « adjacentes » n'est pas défini sur une grille d'un mètre.

**Preuve.** 8.5 : cellules d'un mètre, empreinte 3 × 3. Une rue à deux escouades de front fait donc 6 cellules. Une seule escouade arrêtée sur les colonnes 2 à 4 laisse 2 cellules d'un côté et 1 de l'autre : aucune empreinte de 3 ne passe, la rue est barrée par une escouade, ce qui vide de son sens la capacité Chaîne (« barre la rue ») et l'argument de 6.4 (« la troisième escouade n'ajoute rien »). La règle R2 telle qu'écrite (capacités 1, 2, 4, illimitée) décrit en réalité le modèle de repli de 8.5 (« graphe de rues à capacités »), pas le modèle retenu.

**Correction proposée.** 8.5 : « Hypothèses de départ : cellules d'un mètre, empreinte d'escouade de 3 × 3. Les voies sont découpées en files de 3 cellules : passage = 1 file (3 m), rue = 2 files (6 m), avenue = 4 files (12 m). Une escouade arrêtée, ancrée ou au contact occupe toujours une file entière. Deux escouades sont adjacentes (R2) quand leurs empreintes partagent un bord d'au moins une cellule. »

### 5. [majeur] 8.1 (« déterministe par construction ») ; 8.4 module sim ; 8.6 tableau, ligne Lockstep ; 8.3 puce flottants .NET ; 9 ligne A1

**Problème.** Le déterminisme est affirmé comme acquis alors qu'il n'est ni sourcé ni couvert par le critère A1 sur les trois plateformes annoncées, et la règle « aucun flottant » ne dit pas comment sont représentées les valeurs décimales du cahier des charges.

**Preuve.** 8.6 : « identique au bit près sur Mac ARM, Windows x64 et Linux x64 » et « son coût est déjà payé » ; A1 ne teste que « macOS ARM et Linux x64 », Windows n'apparaît qu'en B2 (« deux machines de systèmes différents », non nommées). « Même relecture ... 100 fois sur 100 » rejoue une seule relecture. Rapport faits-alternatives, faits à ne pas affirmer : « T2-j — toute affirmation sur la virgule fixe : aucune source lue ». Les données contiennent des décimaux (pression 5,5 ; +1,5 par seconde ; × 0,5 ; −30 % ; 3,4 m/s) : à 20 Hz, +1,5 par seconde vaut 0,075 point par itération et 5,5 × 1,5 ÷ 20 vaut 0,4125, non représentables sur une cohésion entière de 0 à 100 ; aucune unité ni règle d'arrondi n'est donnée.

**Correction proposée.** 8.1 : « ... conçue pour être déterministe ; cela reste une hypothèse tant que le critère de A1 n'est pas tenu. » 8.4, sim : « Aucun type du moteur, aucun flottant, y compris à la lecture des données (décimaux convertis en entiers par un analyseur propre ; unités : dix-millième de point de cohésion, millimètre, itération ; arrondi vers zéro), aucun parcours de collection non ordonnée, aucune lecture d'horloge. » 8.6, ligne Lockstep : « Retenu sous réserve du critère A1 ; son coût est engagé dès A1 par les relectures et les tests. » A1 : « Cent relectures distinctes d'au moins 10 000 itérations donnent la même suite d'empreintes sur macOS ARM, Linux x64 et Windows x64. »

### 6. [majeur] 9, ligne A1 (« Partie de 20 minutes simulée en 6 s ou moins sur un cœur ») ; 8.3 puce Performance ; 8.5 ligne Champs de flux ; 5.5

**Problème.** Le critère de vitesse de A1 est mesuré sur une simulation qui ne contient pas encore de partie, sur une machine non nommée, et les ordres de grandeur de charge de 8.3 contredisent 5.5.

**Preuve.** A1 livre un « sim minimal » (éléments 1 à 4 du backlog) : le déplacement arrive à l'élément 6, le combat au 8, les objectifs au 10 ; il n'existe pas de « partie de 20 minutes » à simuler en A1. 20 min à 20 Hz = 24 000 itérations en 6 s, soit 0,25 ms par itération : mesuré sur une boucle vide, le chiffre ne prouve rien. Le document d'origine (section 13) exige une « machine de référence explicite » ; le brouillon n'en nomme aucune. 8.3 annonce « une quarantaine d'entités simulées et une centaine de personnages animés », 8.5 « trente escouades » ; 5.5 donne 90, 55 et 30 personnages par camp, soit 145 pour Convergence contre Bastion et 180 en miroir Convergence, « dans un budget d'une centaine de personnages par camp » (200 à l'écran). Les équipes logistiques (jusqu'à 16 places par camp, E3 et E4) se déplacent et bâtissent sans compter dans la population.

**Correction proposée.** A1 : remplacer le critère de vitesse par « Boucle vide : 24 000 itérations en moins d'une seconde sur la machine de référence ». A3 : ajouter « Partie de 20 minutes du prototype simulée en 6 s ou moins sur un cœur de la machine de référence ». Hypothèses : ajouter « Machine de référence : [modèle, processeur, mémoire à renseigner par le commanditaire] ». 8.3 : « Performance : jusqu'à une trentaine d'escouades et véhicules et une trentaine d'équipes logistiques simulés, et 150 à 200 personnages animés à l'écran (5.5) ; hypothèse : aucun moteur actuel en difficulté. Aucun chiffre officiel de charge n'existe ; à mesurer à l'essai 3D de B2. »

### 7. [majeur] 8.8 « Budgets utiles » ; 8.4 Boucle à 20 Hz ; 8.6 tableau, ligne Rollback

**Problème.** Le budget « 100 ms au plus » entre l'ordre et la réaction visible est incompatible avec le délai d'ordre du lockstep retenu, et la fourchette attribuée à [T1] n'y figure pas.

**Preuve.** 20 Hz = 50 ms par itération : en solo, attente de l'itération (0 à 50 ms) plus une image, le budget tient. En réseau, 8.6 admet « un délai d'ordre de l'ordre de 100 à 250 ms », auquel s'ajoute l'attente de l'itération : 100 à 300 ms, donc hors budget. Page [T1] relue aujourd'hui : « Turns were typically 200 msec in length », « 250 milliseconds of command latency was not even noticed », « between 250 and 500 msec was very playable » ; aucune mention de 100 ms. L'écart du rollback repose donc sur un constat de 2001, présenté comme une propriété générale du genre.

**Correction proposée.** 8.8 : « délai entre l'ordre et son accusé de réception (son, marqueur) : 100 ms au plus, en solo comme en réseau ; délai entre l'ordre et le premier mouvement visible : 100 ms au plus en solo ; en réseau s'y ajoute le délai d'ordre du lockstep (hypothèse : 2 à 5 itérations, soit 100 à 250 ms, à mesurer à l'essai de B2) ». 8.6, ligne Rollback : « Écarté, par jugement : selon [T1], 250 ms de latence d'ordre n'étaient pas remarqués par les joueurs d'Age of Empires ; à revérifier à l'essai réseau de B2. »

### 8. [majeur] 8.2, titre et colonne « Conséquence » (lignes [U5], [U6], [U7], [U8]) ; 1, point 5 ; 8.1

**Problème.** Des jugements sont rangés sous « Ce qui est établi, avec ses sources », et quatre lignes comptées contre Unreal ne départagent pas les moteurs dans l'architecture retenue.

**Preuve.** Rapport faits-alternatives, Méthode : « Les colonnes Conséquence du rapport d'origine sont des déductions de son auteur, pas des faits sourcés. Je ne les ai pas validées. » Le brouillon les place pourtant à côté du renvoi de source : « Ne pas bâtir la foule ou l'IA dessus », « Le modèle natif n'est pas celui d'un RTS à relectures », « Développement sur Mac de premier rang ». Asymétrie : 8.1 dit que « le moteur n'affiche que des instantanés » ; Mass, RVO, réseau natif et physique ne servent donc dans aucun moteur. Côté Godot, les lignes équivalentes sont neutralisées (« ce que l'architecture exclut déjà », « comme partout », « Sans objet ») ; côté Unreal, elles restent à charge. Pour [U7], la page relue aujourd'hui ne contient ni lockstep, ni determinis, ni replay, mais le rapport Unreal interdit d'en tirer une conclusion sur le moteur entier (absence établie sur deux pages) ; la page du système de relecture d'Unreal n'a pas pu être ouverte (redirection vers l'accueil). Section 1, point 5 : « Unreal sert mal ce contexte précis » est écrit comme un fait.

**Correction proposée.** Sous le titre 8.2 : « Seule la colonne Fait est établie par la source citée. La colonne Conséquence est mon jugement et n'a pas été contre-vérifiée. » Lignes [U5] à [U8], colonne Conséquence : « Sans objet pour l'architecture retenue (8.4), qui n'utilise ni Mass, ni la navigation, ni le réseau, ni la physique du moteur ; ne départage pas les moteurs. » Section 1, point 5 : « Unreal me paraît mal servir ce contexte précis ; c'est un jugement, fondé sur l'équipe supposée et sur les lignes [U3], [U4] et [U9] (section 8). »

### 9. [majeur] 8.2, tableau Unreal, ligne [U9] ; tableau Godot, ligne [G6]

**Problème.** La conséquence tirée de [U9] est contredite par la page citée, et la ligne Godot symétrique efface les réserves de sa propre source.

**Preuve.** Page Perforce relue aujourd'hui : « These files are binary, so cannot be opened as text or merged in a text-based merge tool. » Page Source Control (seconde URL de [U9]) relue aujourd'hui : « Diff Against Depot — This allows you to check the asset against the version currently stored in the source control depot. » Le brouillon écrit pourtant « illisibles pour un outil de comparaison comme pour un agent de programmation » ; la mention des agents ne figure dans aucune source. Page TSCN relue aujourd'hui : « mostly human-readable and easy for version control systems to manage », dit des seules scènes .tscn ; la page décrit aussi des scènes importées « compiled to binary SCN files ». Le brouillon écrit « Scènes et ressources en texte », « Lisibles, comparables, modifiables par des agents ».

**Correction proposée.** Ligne [U9] : « Les fichiers .uasset et .umap sont binaires : ils ne s'ouvrent pas comme du texte et ne se fusionnent pas dans un outil de fusion textuel ; l'éditeur verrouille par extraction et propose une comparaison avec le dépôt | Jugement : cartes, interfaces, graphes d'animation et Blueprints ne se relisent et ne se comparent que dans l'éditeur ; un agent de programmation ne peut pas les modifier comme du texte | [U9] ». Ligne [G6] : « Scènes .tscn en texte, dites mostly human-readable et faciles à gérer en contrôle de version ; ressources .tres au même format ; scènes importées compilées en binaire ; mode sans affichage en ligne de commande | Jugement : scènes et interfaces lisibles et comparables hors éditeur ; modèles, textures et animations importés restent binaires, comme dans tout moteur | [G6] ».

### 10. [majeur] 8.2, tableau Unreal, lignes [U1] [U2] et [U3] ; liste des sources

**Problème.** La ligne de version s'arrête à juin 2026 et sa conséquence dépasse l'article ; la ligne macOS donne pour acquis un minimum que les notes de version contredisent, sans citer ces notes.

**Preuve.** Page [U2] relue aujourd'hui (traduction française servie par Epic, article du 22 juin 2026) : « bien que nous ne prévoyions pas actuellement une autre version officielle de l'UE5 après la 5.8, nous nous réservons la possibilité de publier une version 5.9 » ; mais aussi « accompagner les projets existants, et non d'imposer une rupture nette », accès anticipé « fin 2027, la sortie complète de l'UE6 intervenant 12 à 18 mois plus tard » et « continuez à développer sur l'UE5 ». « Devra franchir ce passage » n'y est pas : avec les ordres de grandeur de la section 9 (20 à 30 mois), une V1 peut sortir sur UE5. Le rapport Unreal (U1.3, U1.4, non rouverts par moi) ajoute le correctif 5.8.4 du 20 octobre et une 5.9 Preview du 9 novembre 2026 annoncée pour « next year », omis alors que le commanditaire demande une « version stable à vérifier ». Ligne [U3] : le rapport (U2.3) lit « Minimum OS: macOS Sonoma 14.0 » et Xcode 15.2 dans les notes 5.8 ; le brouillon affirme « macOS 14.5 au minimum » et ne cite que la page des prérequis.

**Correction proposée.** Ligne [U1] [U2] : « Dernière version stable : 5.8 (juin 2026, correctif 5.8.4 du 20 octobre 2026). En juin 2026, Epic ne prévoyait pas d'autre version d'UE5 tout en se réservant une 5.9 ; une 5.9 Preview, qualifiée d'instable, est parue le 9 novembre 2026. UE6 : accès anticipé visé fin 2027, version complète 12 à 18 mois plus tard ; acteurs et Blueprints présents au début, puis abandonnés avec des outils de conversion | Jugement : une V1 livrée avant 2029 peut rester sur UE5 ; le passage à UE6 concerne la suite du projet | [U1] [U2] ; annexe faits-unreal, U1.3 et U1.4 ». Ligne [U3] : « Éditeur 5.8 sur Mac : la page des prérequis donne macOS 14.5 et Xcode 26.0 au minimum, la section macOS des notes de version 5.8 donne macOS 14.0 et Xcode 15.2 ; aucune page ne dit laquelle fait foi | Friction d'installation à prévoir | [U3] ; notes de version 5.8 : https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes ».

### 11. [mineur] 8.2, tableau Godot, lignes [G9] et [G11] ; 8.2 Techniques, puce [T7] ; Sources, [T1]

**Problème.** Quatre formulations vont plus loin que les rapports ou que la page citée.

**Preuve.** [G9] : « Aucun lockstep ni rollback officiel » généralise un constat d'absence que le rapport limite à la section Réseau (six pages) ; l'URL citée n'est que la page haut niveau. [G11] : « Les cadres de tests pour les jeux sont communautaires » reprend la version forte de G6-e, classée « à ne pas affirmer », et omet la correction G6-f (« Aucune des deux fiches n'affiche Godot 4.7 »). [T7], PDF relu aujourd'hui : « weapons do damage to unit Morale as well as to unit Health », « When broken, squads do very little damage », « Broken squads get a movement speed bonus », « The player does not lose control of broken squads » ; c'est le modèle à deux jauges vidées par les mêmes attaques que 2.5 rejette, donc pas « le précédent direct de la règle R1 » ; les pieds de page portent « DOW PC MAN COMBO 2/2/06 » et le manuel couvre la Garde impériale : édition combinée de 2006, pas un manuel de 2004. [T1] : la page citée, relue aujourd'hui, n'affiche que Paul Bettner ; les deux auteurs ne figurent que sur la copie PDF (rapport, T1-a et T1-b).

**Correction proposée.** [G9] : « La section Réseau de la documentation (six pages) ne mentionne ni lockstep ni rollback », avec l'URL https://docs.godotengine.org/en/stable/tutorials/networking/index.html ajoutée à [G9]. [G11] : « Deux cadres de tests communautaires, GdUnit4 et GUT, sont publiés dans la bibliothèque officielle ; aucune des deux fiches n'affiche Godot 4.7 ». [T7] : « Le manuel de Dawn of War (édition combinée de 2006) décrit un moral d'escouade entamé par les mêmes armes que la santé : rompue, l'escouade fait très peu de dégâts, gagne un bonus de vitesse, et le joueur n'en perd pas le contrôle [T7]. C'est le précédent de l'état rompu de R1 seulement ; la séparation entre pression et effectif n'a pas de précédent sourcé ici. » [T1] : ajouter « copie avec les deux signatures : https://web.cs.wpi.edu/~claypool/courses/4513-B03/papers/games/aoe.pdf ».

### 12. [mineur] 4.5, dernier paragraphe ; 9, ligne B1 ; 10, « Règles »

**Problème.** L'ordre d'entrée des mécaniques de faction annoncé en 4.5 n'est pas celui du plan.

**Preuve.** 4.5 : « cohésion au prototype, une mécanique de faction en B1, les deux autres en B2 ». Section 10 : le prototype inclut « ancrage et poussée », soit les points 1 et 3 de la signature POSTURES (5.2). Section 9, B1 : « Deux factions, quatre unités chacune, une signature chacune », soit deux signatures en B1 ; B2 n'ajoute que la troisième faction.

**Correction proposée.** 4.5 : « Côté développement, les mécaniques entrent une par étape : cohésion et postures du Bastion au prototype (A3), relais de la Convergence en B1, secteurs et dotations de la Préfecture en B2. »

### Contrôlé et trouvé exact

- [U2] relu aujourd'hui dans le navigateur (traduction française, article du 22 juin 2026) : pas d'autre version UE5 prévue après la 5.8 avec 5.9 réservée, UE6 en accès anticipé fin 2027, acteurs et Blueprints présents puis abandonnés avec outils de conversion ; la colonne Fait est exacte.
- [U4] relu aujourd'hui (page 5.8) : « cross-compilation is only supported for Windows. Mac users currently have to resort to native compilation » ; exact.
- [U5] relu aujourd'hui : MassGameplay, MassAI et MassCrowd portent la mention Experimental sur leurs pages 5.8 ; exact.
- [U7] relu aujourd'hui (page 5.8) : architecture client-serveur, état autoritaire sur le serveur, zéro occurrence de lockstep, determinis, peer-to-peer et replay ; la colonne Fait est exacte.
- [U9] relu aujourd'hui : fichiers binaires non fusionnables en texte et verrouillage par extraction ; la colonne Fait est exacte (la conséquence ne l'est pas, voir constat).
- [G1] relu aujourd'hui : 4.7.2-stable du 18 août 2026, dernière stable ; 4.8 encore en bêta 3 (9 novembre 2026).
- [G5] relu aujourd'hui (documentation 4.7) : C# sur Windows, Linux et macOS, « Supports .NET 8 and higher », export web non pris en charge ; exact pour le bureau.
- [G6] ligne de commande relue aujourd'hui : --headless, --script, --export-release, --fixed-fps documentés ; exact.
- [G7] relu aujourd'hui : « Physics in Godot, regardless of physics engine, is not deterministic », en encadré d'avertissement ; exact.
- [T7] relu aujourd'hui par extraction directe du texte du PDF : les trois éléments cités (très peu de dégâts, contrôle conservé, moral à zéro) y figurent mot pour mot.
- 8.3 : les deux « faits à ne pas affirmer » sur l'export (Godot depuis macOS, Unreal vers Windows depuis un Mac) sont bien rangés en hypothèses.
- 8.2 lignes [U6], [U8], [U10], [U11], [G10] et paragraphe Unity : conformes aux deux rapports (non rouverts sur le web).
- 6.1 : les durées de rupture recalculées (25 / 41,7 ; 16,7 / 27,8 ; 12,5 ; 9,8 ; 12,1 / 36,4 s) sont arithmétiquement justes à partir des tableaux de la section 5.
- 4.4 : 40 s du QG à la médiane et 25 s entre objectifs sont cohérents avec 130 m, 80 m et des vitesses de 3,2 à 3,4 m/s.
