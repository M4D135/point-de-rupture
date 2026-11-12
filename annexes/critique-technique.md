# Contre-expertise — faisabilité technique, architecture et production

Légende : **[É]** = établi (connaissance générale) ; **[V]** = à vérifier sur la documentation officielle. Toutes les durées et tous les coûts sont des estimations d'expert sous les hypothèses d'équipe du livrable (d), jamais des mesures. Rien n'est implémenté.

## Verdict

1. Le document a les bons réflexes (simulation séparée, ordres communs joueur/IA, navigation testée tôt, refus du « réseau ajouté à la fin ») mais ne prend aucune des trois décisions qui les rendent réels : quelle est l'entité simulée, quel modèle de déterminisme, quel moteur.
2. Unreal est un mauvais choix par défaut pour ce contexte (développement sur Mac, hors ligne, 120 à 150 personnages, agents de programmation). Recommandation : simulation en bibliothèque pure, sans moteur, et Godot 4 pour la présentation ; Unreal ne se défend que si un animateur ou tech-artist Unreal confirmé fait partie de l'équipe.
3. La performance n'est pas le risque. Les risques sont la navigation en rue étroite, le coût de contenu (environ 160 clips d'animation, 27 types d'unités, 5 véhicules) et l'IA (6 affrontements à couvrir).
4. Le plan A–D est dans le bon ordre, mais A n'a pas de critère d'arrêt, B contient deux étapes, et le prototype réseau exigé au §13 est absent du §14.
5. Le projet est faisable en V1 réduite (18 unités, 2 paliers, 2 à 3 cartes, 1 véhicule par camp). La V1 telle qu'écrite est hors de portée d'une personne seule.

## À garder

- **Simulation séparée du rendu, de l'interface et de l'IA (§13).** C'est la décision qui rend possibles les tests sans affichage, les relectures, l'IA contre IA et le réseau. À durcir : la simulation ne doit dépendre d'aucun type du moteur.
- **Interface d'ordres commune au joueur et à l'IA.** Elle donne gratuitement le journal de commandes, donc la relecture et le tutoriel scripté.
- **Trajet à l'échelle de l'escouade, placement local des membres.** C'est la bonne intuition ; il faut aller au bout (constat 3).
- **Barricades sur emplacements contrôlés, destruction limitée.** Cela transforme un problème de navigation dynamique en changement d'état d'une arête : coût divisé par dix environ.
- **Scepticisme explicite sur le pas fixe et la navigation intégrée.** Les deux avertissements sont exacts [É] : un pas fixe ne suffit pas, les fonctions transcendantes et les optimisations flottantes diffèrent selon compilateur et architecture.
- **Budget de 12 escouades par camp.** Ce plafond rend viable une simulation simple, entière et très rapide. Ne pas l'augmenter avant la fin de l'étape B.
- **Plan qui commence par les risques et refuse les délais sans hypothèses d'équipe.**

## Constats, du plus grave au moins grave

### 1. Le moteur est choisi avant l'architecture, et Unreal sert mal ce contexte — bloquant (§13)

**Problème.** Les forces d'Unreal (rendu haut de gamme, réplication intégrée, outils d'animation) répondent à des besoins que ce jeu n'a pas ou n'a que plus tard. Ses coûts frappent tous les critères du projet.

| Critère | Unreal Engine | Godot 4 | Unity |
|---|---|---|---|
| Vitesse d'itération | Éditeur lourd, compilation C++ longue ; rechargement à chaud fragile, support Mac [V] | Démarrage en secondes, scènes rechargées à chaud [É] | Intermédiaire |
| Agents de programmation | Blueprints, cartes, widgets, graphes d'animation en `.uasset` binaire [É] : illisibles et non comparables | Scènes `.tscn`, ressources `.tres`, scripts en texte [É] | YAML textuel mais truffé d'identifiants, fragile [É] |
| Tests sans affichage | Possible (automatisation, rendu nul) mais lancement lourd [V] | Mode `--headless` [É] ; inutile si la simulation est une bibliothèque | Mode batch sans graphismes [É] |
| Animation de personnages | Meilleur outillage du marché [É] | Arbre d'animation et reciblage présents, moins riches [V] | Bon, mûr [É] |
| Multiplateforme depuis un Mac | Paquet Windows : machine Windows requise [É] ; Linux depuis Mac [V] | Export Windows et Linux depuis macOS par modèles d'export [É] ; variante C# [V] | Windows et Linux depuis Mac possibles, limites selon le backend [V] |
| Apprentissage | Élevé (C++ maison, conventions UObject) | Faible à moyen | Moyen |
| Licence | Redevance au-delà d'un seuil de recettes [É, termes V] | MIT, aucune redevance [É] | Conditions modifiées puis retirées en 2023-2024 [É] : risque de confiance |

**Effet.** Sur un RTS, 80 % du travail est règles, données, IA et interface. Avec Unreal, une grande part de ce travail vit dans des fichiers binaires que ni un agent ni un `diff` ne lisent, et chaque essai coûte un cycle d'éditeur. La boucle d'équilibrage ralentit d'un ordre de grandeur.

**Correction.** Écrire la simulation en bibliothèque autonome (C# sans dépendance moteur : `dotnet test` l'exécute en millisecondes). Godot 4 édition .NET la référence et se limite à la présentation. Faiblesse assumée : animation et rendu 3D moins outillés, suffisants pour de la 3D stylisée isométrique à 150 personnages. Si Unreal est maintenu : même frontière, simulation en C++ standard sans `UObject`, exécutable de test séparé, et zéro logique de jeu en Blueprint. La décision devient réversible jusqu'à la fin de l'étape A, car le prototype peut être affiché en 2D.

### 2. Le modèle de déterminisme et de réseau est renvoyé à plus tard alors qu'il conditionne les mathématiques et la navigation — bloquant (§13, §14)

**Problème.** « Choisir explicitement le modèle » est écrit, mais pas fait. Or le choix impose dès le premier jour le type numérique de la simulation.

| Modèle | Ce qu'il impose au départ | Verdict à cette échelle |
|---|---|---|
| Lockstep déterministe (StarCraft, Age of Empires, 0 A.D. [É]) | Simulation identique au bit près sur Mac ARM, Windows x64, Linux : pas de flottants, pas de physique moteur, ordre d'itération fixe, aléa à graine | **Recommandé** : le coût est déjà payé pour les relectures et les tests |
| Serveur autoritaire, réplication d'état (modèle natif d'Unreal [É]) | Aucun déterminisme ; hébergement ou joueur hôte ; relectures à construire à part | Solution de repli. État d'environ 30 escouades : quelques kilo-octets, débit trivial (estimation) |
| Rollback (jeux de combat ; Stormgate en RTS [É, détails V]) | Déterminisme, sauvegarde et restauration d'état à chaque image, resimulation | À écarter : un RTS tolère 100 à 150 ms de délai d'ordre [É] |

**Effet.** Sans décision, l'étape A sera écrite en flottants sur le navmesh du moteur ; lockstep et relectures fiables seront alors perdus sans retour possible.

**Correction.** Décider maintenant : simulation déterministe par construction (entiers et virgule fixe, pas fixe de 20 Hz en hypothèse, générateur aléatoire à graine, entrées = commandes horodatées uniquement). Bénéfice immédiat en solo : relecture, tests de non-régression, bogues reproductibles. Dès A, un test d'intégration rejoue la même partie sur macOS ARM et Linux x64 et compare une empreinte d'état toutes les 100 itérations. Limite connue du lockstep : chaque client possède tout l'état, donc triche au brouillard possible ; acceptable hors compétition classée. La présentation ne lisant que des instantanés, le repli vers un hôte autoritaire reste ouvert.

### 3. L'entité simulée n'est pas définie ; la navigation en rue étroite est le risque technique numéro un — bloquant (§5, §11, §13)

**Problème.** « Trajet à l'échelle de l'escouade, placement local des membres » ne dit pas si les 4 à 6 personnages existent dans la simulation. S'ils existent : 120 à 150 agents avec évitement local dans des rues de 4 à 6 m, soit le cas pathologique connu.

| Approche | Forces | Risques |
|---|---|---|
| Navmesh + évitement par agent (Recast/Detour, intégré à Unreal [É]) | Disponible tout de suite, mouvement fluide | Bouchons et face-à-face bloqués dans les couloirs ; flottants, donc non déterministe ; cohésion d'escouade à ajouter ; véhicules pénibles (réputation des Company of Heroes [É]) |
| Champs de flux (Supreme Commander 2, Planetary Annihilation [É]) | Excellents pour des centaines d'unités vers une cible | Surdimensionnés pour 30 escouades ; ne règlent ni la formation ni le croisement |
| Grille à réservation, à l'échelle de l'escouade | Entière et déterministe ; la capacité d'une rue devient une règle de jeu lisible ; barricade = arête fermée | Mouvement raide si la présentation est pauvre ; perte de finesse de placement |

**Effet.** Le thème entier (tenir une rue, barrer un carrefour, se replier) repose sur ce système. Un seul blocage inexpliqué par partie ruine la confiance du joueur.

**Correction.** L'escouade est l'unique entité simulée : empreinte fixe (hypothèse : 3 × 3 cellules de 1 m), position en virgule fixe, A* avec carte de dégagement, réservation des cellules devant elle. Les membres sont cosmétiques : ils suivent des emplacements de formation, leur nombre visible dérive de l'intégrité. Règles à prototyper d'abord : les alliés en mouvement se traversent (seuls les emplacements d'arrivée sont exclusifs) ; les ennemis bloquent, ce qui fait du barrage de rue une mécanique et non un accident ; une escouade en repli traverse tout mais subit. Gabarits de carte : rue étroite = 1 escouade de front, rue secondaire = 2, avenue = 4 ou plus. Six scénarios de test figurent au backlog (A2).

### 4. Le plan A–D : A sans critère d'arrêt, B double, prototype réseau absent — majeur (§14)

**Problème.** A ne dit pas ce qui prouverait que le jeu est mauvais. B (« trois factions, quatre unités, trois mécaniques, économie, IA, partie complète ») représente environ 60 % des systèmes du jeu en une étape. Le §13 exige un prototype réseau avant la production de contenu ; le §14 ne le place nulle part. Aucune étape ne livre l'exécuteur sans affichage ni la relecture.

**Effet.** Dérive classique : l'étape B dure dix-huit mois et devient le jeu, sans jamais avoir été testée par un joueur extérieur.

**Correction.** Découpage A1 (noyau et outillage), A2 (navigation), A3 (prototype de plaisir, avec critère d'arrêt), B1 (deux factions, boucle complète), B2 (troisième faction, essai 3D, essai réseau), C (V1 réduite). Détail au livrable (b).

### 5. L'IA d'escarmouche est sous-estimée — majeur (§12)

**Problème.** Trois factions asymétriques = 6 affrontements (3 croisés, 3 miroirs). Quatre styles × 3 factions = 12 profils. L'exigence de brouillard honnête impose une mémoire des observations (dernière position vue, composition estimée). Chaque mécanique propre (relais, postures, secteurs) doit être jouée correctement par l'IA, sinon la faction paraît faible.

**Effet.** Estimation : 4 à 6 mois-personne pour une IA V1 crédible, puis un entretien à chaque changement d'équilibrage. Précédent : même StarCraft II assume des niveaux d'IA explicitement aidés [É] ; l'IA des Company of Heroes reste critiquée sur le repli et le positionnement [É].

**Correction.** Trois couches, toutes en données : stratégique (ordres de construction scriptés plus règles de bascule sur reconnaissance), opérationnelle (carte d'influence, affectation de groupes aux objectifs), tactique (seuils de repli, usage des capacités). L'IA lit la même vue filtrée par le brouillard que l'interface et émet les mêmes commandes, avec un plafond d'ordres par minute. V1 : 2 styles par faction (pression, développement), 3 niveaux ; le niveau haut reçoit une aide économique affichée.

### 6. Le coût d'animation et de contenu n'est pas chiffré — majeur (§11, §14 C)

**Problème.** 24 unités plus 3 équipes logistiques = 27 types. Les états listés au §11, plus attaque, capacité, mise hors de combat, attente et posture ancrée, donnent environ 14 états : 378 clips en version naïve. Avec un squelette commun et un tronc de locomotion par faction (8 clips × 3 = 24) plus 5 clips propres par type (135), on tombe à environ 160 clips. À 0,5 jour (bibliothèque de capture reciblée et nettoyée) ou 1,5 jour (animation à la main) par clip : 4 à 12 mois-personne. S'ajoutent 18 bâtiments ou plus (6 fonctions × 3 factions, avec leurs états), 40 à 60 effets, 5 véhicules.

**Effet.** La contrainte « présentation soignée et animée » absorbe le budget avant que les rosters soient validés.

**Correction.** Un squelette humanoïde unique, kit modulaire (3 corps de base, accessoires par unité : la silhouette vient des boucliers, casques, étendards). V1 à 6 unités par faction, ce qui respecte « plusieurs catégories ». Supprimer l'entrée et la sortie de véhicule animées : c'est l'animation la plus chère par seconde d'écran, et les véhicules V1 ne transportent pas. Aucune animation définitive avant la fin de B1.

### 7. Occlusion en vue isométrique dans des rues étroites — majeur (§11)

**Problème.** Immeubles et rues resserrées avec caméra oblique : les façades cachent les escouades. Le document demande la lisibilité mais n'en fait pas une contrainte de carte.

**Effet.** Unités invisibles au moment décisif ; sélection impossible derrière un bâtiment.

**Correction.** Règles dès le prototype gris : bâtiments tronqués à un niveau en vue de jeu ou toits fondus, largeur minimale de rue jouable de 6 m (hypothèse), caméra à orientation fixe avec rotation par quarts de tour au plus, contour des escouades visible à travers les obstacles. À valider par l'essai 3D de B2.

### 8. Cinq véhicules, dont des motos : une seconde navigation entière — majeur (§6 à §8)

**Problème.** Char de mobilisation, fourgon, véhicule à eau, poste de commandement mobile, brigade motorisée. Empreinte large, rayon de braquage, marche arrière, croisement avec l'infanterie : c'est le point faible historique du genre [É]. La police en porte trois à elle seule.

**Effet.** Un véhicule coincé dans une rue secondaire bloque un camp ; l'IA doit en plus savoir le conduire.

**Correction.** V1 : un véhicule par faction, circulant sur un sous-graphe « voies carrossables » (avenues et places), rotation sur place tolérée, pas de transport. La brigade motorisée est simulée comme une infanterie rapide à empreinte standard. Aucun véhicule avant B2.

### 9. Sauvegardes, relectures et mesure sont nommées mais non spécifiées — majeur (§10, §13)

**Problème.** Le §10 liste d'excellentes métriques, sans outil pour les produire.

**Correction.** Sauvegarde = instantané sérialisé de l'état, portant version de schéma et empreinte des données. Relecture = configuration initiale + journal de commandes + empreintes périodiques. Exécuteur en ligne de commande : N parties IA contre IA, sortie CSV. Cible à mesurer : une partie de 20 minutes (24 000 itérations) en 6 secondes ou moins sur un cœur. Mise en garde : l'IA contre IA mesure l'IA, pas l'équilibre ; elle sert à détecter régressions, blocages, compositions dégénérées et durées aberrantes. L'équilibre se juge sur des parties humaines enregistrées.

### 10. Interface, audio, tutoriel, localisation : le tiers invisible — mineur (§11, §14 C)

**Problème.** Minicarte, brouillard, files, infobulles, prévisualisations, touches configurables, échelle, contraste, statistiques, menus, sauvegarde : compter 20 à 30 % de l'effort de programmation (estimation). Voix : 27 types × 5 événements × 4 variantes = 540 répliques par langue. Trois tutoriels cassés à chaque changement de règle.

**Correction.** Interface en scènes textuelles et données. Pas de voix intelligibles en V1 : sifflets, slogans indistincts, radio brouillée, ce qui sert le thème et supprime le doublage. Texte en français et anglais, tables externalisées dès B1. Tutoriel écrit en dernier, sous forme de scénarios scriptés sur l'interface d'ordres, pour une seule faction, plus une fiche par mécanique des deux autres.

### 11. Les « budgets de performance » visent le mauvais risque — mineur (§13)

**Problème.** 150 personnages animés et 30 entités simulées ne mettent en difficulté aucun moteur actuel [É].

**Correction.** Budgets utiles : vitesse de l'exécuteur sans affichage, durée du cycle modification-essai (cible : moins de 10 secondes pour une valeur d'équilibrage, moins de 60 secondes pour une règle), délai ordre-réaction visible (cible : 100 ms ou moins).

## Réponses aux questions de l'auteur qui relèvent de cet angle

- **Unreal ou une alternative ?** Godot 4 avec simulation en bibliothèque C#, pour les raisons du constat 1. Unreal seulement si l'équipe le maîtrise déjà et dispose d'une machine Windows de compilation.
- **Quel langage ?** C# pour simulation, IA et outils ; scripts moteur pour la présentation. Aucun flottant dans la simulation.
- **Le pas fixe suffit-il ?** Non [É]. Il faut en plus : arithmétique entière, ordre d'itération stable, aléa à graine, aucune lecture d'horloge ni d'état de présentation.
- **La navigation intégrée suffit-elle ?** Pour les membres cosmétiques, oui. Pour la simulation, non : elle est flottante et pensée par agent.
- **Cohésion, formations et secteurs : trop de règles ?** Techniquement, chaque mécanique coûte quatre fois : simulation, affichage, tutoriel, IA. Les introduire une par étape (cohésion en A3, une mécanique de faction en B1, les deux autres en B2) et supprimer celle que l'IA ne sait pas jouer correctement à la fin de B2.
- **Que retirer de la V1 ?** Troisième palier ; 6 unités sur 24 ; 4 véhicules sur 5 ; entrée et sortie de véhicule ; voix ; quatrième carte ; deux styles d'IA sur quatre ; éditeur ; tout mode à plus de deux joueurs.

## Livrables demandés

### (a) Architecture recommandée

**Modules.**
- `sim` : bibliothèque pure. État, itération, économie, déplacement, visibilité, combat, cohésion, objectifs, sérialisation, empreinte d'état.
- `donnees` : fichiers texte (JSON ou TOML) pour unités, armes, capacités, technologies, bâtiments, cartes (grille, gabarits, emplacements, objectifs) ; schéma et validateur exécutés à chaque modification. Capacités composées de primitives d'effet (zone retardée, cône, aura, contrôle à résistance croissante), sans langage de script en V1.
- `ia` : ne dépend que de la vue joueur et de l'interface d'ordres.
- `executeur` : ligne de commande ; parties sans affichage, relectures, mesures.
- `presentation` (moteur) : rendu, animation, effets, son, caméra. Lecture seule.
- `interface` : transforme les entrées en commandes ; lit la vue joueur.
- `reseau` (ultérieur) : transport des commandes, ordonnancement des tours, comparaison d'empreintes.

**Frontières.** Entrée unique : commandes sérialisables (joueur, itération cible, type, paramètres). Sorties : événements et instantanés. La « vue joueur » est filtrée par le brouillard et servie à l'identique à l'interface et à l'IA : l'IA ne peut pas tricher par accident, l'interface ne peut pas fuiter.

**Boucle, à 20 Hz (hypothèse).** 1. commandes de l'itération, triées ; 2. économie et production ; 3. visibilité ; 4. automates d'ordres des escouades ; 5. déplacement et réservations ; 6. combat, intégrité, cohésion ; 7. effets temporisés ; 8. objectifs et score ; 9. émission des événements ; 10. empreinte toutes les 100 itérations. La présentation interpole entre deux instantanés à la fréquence d'affichage et accuse réception d'un ordre immédiatement (son, marqueur) sans attendre l'itération.

### (b) Backlog ordonné

| Étape | Livrables | Critères d'acceptation mesurables |
|---|---|---|
| **A1** Noyau et outillage | `sim` minimal, commandes, exécuteur, relecture, vue 2D de mise au point | Même relecture, même empreinte sur macOS ARM et Linux x64, 100 fois sur 100 ; partie de 20 min simulée en 6 s ou moins ; test complet en moins de 60 s |
| **A2** Navigation | Grille, dégagement, réservation, repli, barricade ; six scénarios : file de 6 escouades en passage simple, croisement frontal 4 contre 4 en rue double, repli à travers une colonne alliée, clic hors zone, barricade posée en cours de trajet, carrefour à quatre flux | Sur 1 000 exécutions à graines variées : aucune escouade immobile plus de 3 s avec un ordre non satisfait ; temps de franchissement inférieur ou égal à 1,5 fois le théorique ; replanification en 2 itérations ou moins |
| **A3** Prototype de plaisir | Voir (c) | Voir (c) ; décision écrite continuer, réviser ou arrêter |
| **B1** Deux factions, boucle complète | 2 factions × 4 unités, 1 mécanique distinctive chacune, 2 ressources, production, brouillard, IA scriptée, sauvegarde, 1 carte grise, interface minimale | 20 parties humaines enregistrées, durée médiane entre 12 et 25 min ; 500 parties IA sans plantage ni blocage ; sauvegarde puis reprise donnant la même empreinte finale ; aucune unité utilisée dans moins de 5 % des parties humaines |
| **B2** Troisième faction et essais | 3ᵉ faction, 6 affrontements, 1 véhicule par camp ; essai 3D (1 escouade, 14 états, carte grise en volume) ; essai réseau (2 machines, systèmes différents, lockstep) | 6 affrontements jouables contre l'IA ; coût mesuré en jours par clip ; aucune occlusion non signalée sur le parcours de test ; 10 parties réseau de 15 min sans divergence d'empreinte ; choix du moteur 3D confirmé par écrit |
| **C** V1 réduite | 6 unités par faction, 2 paliers, 2 cartes puis une 3ᵉ, IA à 2 styles et 3 niveaux, tutoriel d'une faction, réglages, accessibilité, audio, statistiques, exécutables | 10 testeurs externes terminent le tutoriel sans aide ; 5 000 parties IA sans blocage ; sauvegardes relues après mise à jour mineure ; exécutables macOS, Windows et Linux produits par une chaîne automatisée ; chaque fonctionnalité rattachée à une partie jouable |
| **D** Extensions | Multijoueur public, cartes, éditeur | Fiche par extension : coût, dépendances, raison d'être |

### (c) Le plus petit prototype capable de trancher

Affichage 2D vu de dessus, formes géométriques, aucune animation. Une carte grise d'environ six pâtés de maisons, trois objectifs, des rues à trois gabarits. Deux factions seulement, trois unités chacune (ligne, mobile, anti-protection), intégrité, cohésion, repli volontaire, une seule mécanique distinctive (les postures, la plus simple à simuler). Pas d'économie : renforts à débit fixe. Score abaissé pour des parties de 8 à 10 minutes. Adversaire : script qui capture, défend et se replie.

Il répond à trois questions : commander des escouades dans des rues est-il fiable et agréable ; la cohésion crée-t-elle une décision de repli distincte de la barre d'intégrité ; tenir ou barrer une rue produit-il des situations variées.

Critères, sur 8 testeurs extérieurs jouant 3 parties : au moins 5 relancent une partie sans y être invités ; au moins une décision engager-ou-replier toutes les 20 secondes en phase de contact (lue dans le journal de commandes) ; moins d'un ordre annulé sur dix pour cause de trajet inattendu ; aucun blocage. En dessous : réviser cohésion et gabarits avant tout investissement 3D. Effort estimé, A1 à A3 : 8 à 12 semaines pour un programmeur expérimenté.

### (d) Hypothèses d'équipe qui conditionnent tout délai

- **Noyau de trois** : un programmeur simulation et IA confirmé, un artiste technique sachant animer, un concepteur-producteur prenant cartes et interface ; son en prestation ; agents de programmation en appui. Ordres de grandeur : A, 2 à 3 mois ; B, 6 à 9 mois ; C réduite, 12 à 18 mois.
- **Personne seule avec agents** : A reste réaliste (3 à 4 mois). B double au minimum. C n'est crédible qu'avec des ressources artistiques achetées ou sous-traitées ; la V1 du document (24 unités, 3 paliers, 4 cartes) ne l'est pas.
- Variables qui déplacent tout : présence d'un animateur ; expérience préalable du moteur ; disponibilité d'une machine ou d'un service de compilation Windows et Linux ; accès régulier à des testeurs extérieurs ; budget de ressources achetées.

## Hypothèses prises et incertitudes

- Les nombres (20 Hz, cellule de 1 m, empreinte 3 × 3, rue de 6 m, 6 s par partie simulée, 160 clips) sont des points de départ à mesurer.
- À vérifier en priorité par l'agent chargé des sources : reproductibilité des flottants en .NET entre architectures (elle fonde l'interdiction des flottants) ; export Windows et Linux d'un projet Godot C# depuis macOS ; compilation Linux d'Unreal depuis un Mac ; état du rechargement à chaud d'Unreal sur Mac ; qualité du reciblage d'animation de Godot 4 ; termes de licence actuels d'Unreal et de Unity.
- Je n'ai pas évalué l'acceptabilité du thème par les plateformes de distribution : elle peut contraindre la présentation, pas l'architecture.
- La recommandation Godot repose sur l'hypothèse d'une équipe sans expertise Unreal préalable. Si cette hypothèse est fausse, le constat 1 passe de bloquant à majeur, et sa correction se réduit à la frontière de la bibliothèque de simulation.
- La grille à réservation est mon premier choix, pas une certitude : si A2 montre un mouvement jugé raide malgré le lissage, le repli est un graphe de rues à capacités avec positions continues en virgule fixe, non le navmesh par agent.
- Les précédents cités le sont de mémoire, sans consultation de sources.
